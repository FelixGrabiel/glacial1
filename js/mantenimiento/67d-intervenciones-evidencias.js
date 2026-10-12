/* =============================================================
   MANTENIMIENTO · INTERVENCIONES · EVIDENCIAS FOTOGRÁFICAS (desde el celular)

   · Tomar una foto o elegir una existente; adjuntarla al PROBLEMA, al TRABAJO REALIZADO o al CIERRE, con descripción opcional; miniaturas y vista completa.
   · COMPRESIÓN en el dispositivo (lado máximo 1600 px, JPEG ≤ ~1,2 MB; miniatura de 320 px) y validación de formato y tamaño ANTES de subir.
   · ALMACENAMIENTO: Firebase Storage (el SDK y el bucket ya están configurados en 01-config.js), ruta intervenciones/{intervención}/{foto}.jpg y
     {foto}_t.jpg. Acceso protegido por reglas (storage.rules.mantenimiento.txt): las fotos se leen con el SDK autenticado; NO se guardan ni se muestran
     enlaces públicos permanentes. NUNCA se guarda una imagen (base64) dentro de un documento de la base de datos: el documento solo guarda la referencia.
   · ORDEN SEGURO: primero se sube el archivo y SOLO después se registra la referencia en la intervención (acción EVIDENCIA, una transacción con historial).
     Así nunca queda una referencia a un archivo que no existe. El texto de la intervención no depende de la foto: «Registro guardado» y «Foto pendiente de subir»
     son estados distintos.
   · REINTENTO sin duplicados ni huérfanos: la foto tiene un id fijo desde que se elige (misma ruta al reintentar); lo pendiente se guarda en el dispositivo
     (IndexedDB) y se reanuda al abrir la pantalla o al volver la conexión. Una foto subida cuyo registro falló reintenta SOLO el registro.
   · Obligatoriedad: ninguna por defecto; el Supervisor puede exigir foto al cerrar por TIPO de trabajo (sync/configMantenimiento → evidenciasRequeridas).
   DEPENDENCIA: Firebase Storage habilitado en la consola y storage.rules.mantenimiento.txt publicado. El puente de Supabase NO admite almacenamiento de
   archivos: allí la función se desactiva sola y lo dice (documentado en docs/mantenimiento-intervenciones.md).
   Cargar después de 67c-intervenciones-pantalla.js.
   ============================================================= */
(function(){
  'use strict';
  const M=window.GlacialIntervenciones;
  const API=()=>window.glacialIntervenciones;
  const UIM=()=>window.glacialMantUI;
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const LIM={maxOriginalBytes:15*1024*1024,maxLado:1600,maxLadoMini:320,niveles:[0.72,0.6,0.5,0.4],maxComprimidoBytes:1200*1024,maxMiniBytes:80*1024,
    formatos:['image/jpeg','image/png','image/webp','image/heic','image/heif']};

  /* ---------- validación y cálculo (puros) ---------- */
  function validarArchivo(f){
    if(!f)return 'No se eligió ninguna imagen.';
    const tipo=String(f.type||'').toLowerCase();
    if(!LIM.formatos.includes(tipo))return 'Formato no admitido ('+(tipo||'desconocido')+'). Usa una foto JPG, PNG o WebP.';
    if(!(Number(f.size)>0))return 'El archivo está vacío.';
    if(f.size>LIM.maxOriginalBytes)return 'La imagen pesa '+(f.size/1048576).toFixed(1)+' MB; el máximo es '+(LIM.maxOriginalBytes/1048576)+' MB.';
    return '';
  }
  /* Dimensiones finales: el lado mayor no pasa de max; nunca se agranda. */
  function dimensiones(w,h,max){
    if(!(w>0&&h>0))return {ancho:0,alto:0};
    const k=Math.min(1,max/Math.max(w,h));
    return {ancho:Math.max(1,Math.round(w*k)),alto:Math.max(1,Math.round(h*k))};
  }
  const rutaDe=(intId,evId,mini)=>'intervenciones/'+String(intId).replace(/[^A-Za-z0-9_-]/g,'-')+'/'+String(evId).replace(/[^A-Za-z0-9_-]/g,'-')+(mini?'_t':'')+'.jpg';

  /* ---------- compresión (navegador) ---------- */
  async function decodificar(file){
    if(typeof createImageBitmap==='function'){
      try{return await createImageBitmap(file,{imageOrientation:'from-image'});}catch(_){/* se intenta con <img> */}
    }
    return new Promise((ok,er)=>{
      const url=URL.createObjectURL(file),img=new Image();
      img.onload=()=>{URL.revokeObjectURL(url);ok(img);};
      img.onerror=()=>{URL.revokeObjectURL(url);er(new Error('Este navegador no pudo abrir la imagen. Prueba con una foto JPG o PNG.'));};
      img.src=url;
    });
  }
  function aBlob(canvas,nivelJpeg){return new Promise((ok,er)=>canvas.toBlob(b=>b?ok(b):er(new Error('No se pudo comprimir la imagen.')),'image/jpeg',nivelJpeg));}
  async function reducir(origen,w,h,max,maxBytes,niveles){
    const d=dimensiones(w,h,max),c=document.createElement('canvas');c.width=d.ancho;c.height=d.alto;
    const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,d.ancho,d.alto);g.drawImage(origen,0,0,d.ancho,d.alto);
    let blob=null;
    for(const q of niveles){blob=await aBlob(c,q);if(blob.size<=maxBytes)break;}
    if(!blob||blob.size>maxBytes*1.6)throw new Error('La imagen sigue siendo demasiado pesada después de comprimirla.');
    return {blob,ancho:d.ancho,alto:d.alto};
  }
  /* Devuelve {blob, thumb, ancho, alto, tam}. */
  async function preparar(file){
    const e=validarArchivo(file);if(e)throw new Error(e);
    const img=await decodificar(file);
    const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
    const grande=await reducir(img,w,h,LIM.maxLado,LIM.maxComprimidoBytes,LIM.niveles);
    const mini=await reducir(img,w,h,LIM.maxLadoMini,LIM.maxMiniBytes,[0.6,0.5,0.4]);
    if(img.close)try{img.close();}catch(_){/* ya liberada */}
    return {blob:grande.blob,thumb:mini.blob,ancho:grande.ancho,alto:grande.alto,tam:grande.blob.size};
  }

  /* ---------- almacenamiento de archivos ---------- */
  const Archivos={
    almacen(){return window.__archivosPrueba||(typeof storage!=='undefined'?storage:null);},
    disponible(){try{const a=this.almacen();if(!a||typeof a.ref!=='function')return false;a.ref('intervenciones/_prueba');return true;}catch(_){return false;}},
    subir(ruta,blob,meta,progreso){
      return new Promise((ok,er)=>{
        let tarea;
        try{tarea=this.almacen().ref(ruta).put(blob,{contentType:'image/jpeg',customMetadata:meta||{}});}catch(e){er(e);return;}
        tarea.on('state_changed',s=>{if(progreso&&s.totalBytes)progreso(s.bytesTransferred/s.totalBytes);},er,()=>ok(true));
      });
    },
    async leer(ruta){                                    // con el SDK autenticado (reglas de acceso); sin enlaces públicos guardados
      const r=this.almacen().ref(ruta);
      if(typeof r.getBlob==='function')return r.getBlob();
      if(typeof r.getBytes==='function')return new Blob([await r.getBytes(8*1024*1024)],{type:'image/jpeg'});
      const url=await r.getDownloadURL();const resp=await fetch(url);if(!resp.ok)throw new Error('No se pudo leer la imagen ('+resp.status+').');return resp.blob();
    }
  };
  const cacheUrl=new Map(),cargando=new Map();
  async function urlDe(ruta){
    if(cacheUrl.has(ruta))return cacheUrl.get(ruta);
    if(cargando.has(ruta))return cargando.get(ruta);
    const p=Archivos.leer(ruta).then(b=>{const u=URL.createObjectURL(b);cacheUrl.set(ruta,u);cargando.delete(ruta);return u;},e=>{cargando.delete(ruta);throw e;});
    cargando.set(ruta,p);return p;
  }

  /* ---------- cola local (IndexedDB; en memoria si no hay) ---------- */
  const mem=new Map();
  const Cola=(function(){
    let abrir=null;
    const idb=()=>{
      if(abrir)return abrir;
      abrir=new Promise(ok=>{
        try{
          if(typeof indexedDB==='undefined'){ok(null);return;}
          const rq=indexedDB.open('glacial-mant-evidencias',1);
          rq.onupgradeneeded=()=>rq.result.createObjectStore('items',{keyPath:'id'});
          rq.onsuccess=()=>ok(rq.result);rq.onerror=()=>ok(null);rq.onblocked=()=>ok(null);
        }catch(_){ok(null);}
      });
      return abrir;
    };
    const tx=async(modo,fn)=>{
      const db=await idb();
      if(!db)return fn(null);
      return new Promise((ok,er)=>{const t=db.transaction('items',modo),s=t.objectStore('items');let r;try{r=fn(s);}catch(e){er(e);return;}t.oncomplete=()=>ok(r&&r.result!==undefined?r.result:r);t.onerror=()=>er(t.error);});
    };
    return {
      async poner(it){if(!(await idb())){mem.set(it.id,it);return;}await tx('readwrite',s=>s.put(it));},
      async quitar(id){mem.delete(id);if(await idb())await tx('readwrite',s=>s.delete(id));},
      async todos(){const m=[...mem.values()];if(!(await idb()))return m;const r=await new Promise(ok=>{tx('readonly',s=>{const q=s.getAll();q.onsuccess=()=>ok(q.result||[]);return q;}).catch(()=>ok([]));});return r.concat(m.filter(x=>!r.some(y=>y.id===x.id)));}
    };
  })();
  const estados=new Map();           // id → {estado, progreso, mensaje} (solo para la pantalla)
  const procesando=new Set();
  const oyentes=[];
  const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(_){/* pantalla cerrada */}});
  const marcar=(id,e)=>{estados.set(id,Object.assign({},estados.get(id)||{},e));avisar();};

  /* ---------- flujo: preparar → guardar en cola → subir → registrar ---------- */
  async function agregar(o){
    const A=API();
    if(!A.permisos().escribir)throw new Error('No tienes permiso para agregar fotos: tu acceso es de consulta.');
    if(!Archivos.disponible())throw new Error('Las fotos no están disponibles en este entorno (almacenamiento de archivos no habilitado).');
    const d=A.porId(o.intervencionId);
    if(!d)throw new Error('La intervención ya no está en la lista cargada.');
    if(d.estado==='CANCELADA')throw new Error('La intervención está cancelada.');
    if(!M.SECCIONES_EVIDENCIA[o.seccion])throw new Error('Elige a qué corresponde la foto.');
    if((d.evidencias||[]).filter(e=>!e.anulada).length+pendientesDe(o.intervencionId).length>=M.MAX_EVIDENCIAS)throw new Error('Máximo '+M.MAX_EVIDENCIAS+' fotos por intervención.');
    const q=A.quienActua();
    if(!q)throw new Error('Identifícate como técnico (PIN) para agregar fotos.');
    const id=o.id||M.idNuevo('ev');                      // id fijo: reintentar usa la misma ruta (no duplica ni deja huérfanos)
    const p=await (o.preparar||preparar)(o.archivo);
    const item={id,intervencionId:o.intervencionId,seccion:o.seccion,descripcion:String(o.descripcion||'').slice(0,160),blob:p.blob,thumb:p.thumb,ancho:p.ancho,alto:p.alto,tam:p.tam,
      estado:'PENDIENTE_SUBIR',intentos:0,creadoMs:Date.now(),por:{nombre:q.nombre,tecnicoId:q.tecnicoId}};
    await Cola.poner(item);await refrescarCache();
    marcar(id,{estado:'PENDIENTE_SUBIR',progreso:0,mensaje:''});
    return procesar(id);
  }
  async function procesar(id){
    if(procesando.has(id))return {ok:false,ocupado:true};
    procesando.add(id);
    try{
      const items=await Cola.todos(),it=items.find(x=>x.id===id);
      if(!it)return {ok:true,yaRegistrada:true};
      const A=API();
      if(!A.permisos().escribir){marcar(id,{estado:'ERROR',mensaje:'No tienes permiso para registrar fotos.'});return {ok:false};}
      it.intentos=(it.intentos||0)+1;
      const pathG=rutaDe(it.intervencionId,id,false),pathM=rutaDe(it.intervencionId,id,true);
      const meta={subidoPor:(A.quienActua()||{}).uid||'',intervencion:it.intervencionId,evidencia:id};
      if(it.estado!=='SUBIDA_SIN_REGISTRO'){
        try{
          marcar(id,{estado:'SUBIENDO',progreso:0,mensaje:''});
          await Archivos.subir(pathM,it.thumb,meta,()=>{});
          await Archivos.subir(pathG,it.blob,meta,p=>marcar(id,{estado:'SUBIENDO',progreso:p}));
          it.estado='SUBIDA_SIN_REGISTRO';await Cola.poner(it);
        }catch(e){
          it.estado='PENDIENTE_SUBIR';await Cola.poner(it);
          marcar(id,{estado:'PENDIENTE_SUBIR',progreso:0,mensaje:'No se pudo subir la foto: '+((e&&e.message)||e)+'. El registro de la intervención no se perdió. Reintenta.'});
          return {ok:false,etapa:'subir',error:e};
        }
      }
      try{                                                   // el archivo YA existe: recién ahora se registra la referencia
        marcar(id,{estado:'REGISTRANDO',progreso:1});
        await A.accion(it.intervencionId,'EVIDENCIA',{id,seccion:it.seccion,descripcion:it.descripcion,path:pathG,thumb:pathM,tam:it.tam,ancho:it.ancho,alto:it.alto,mime:'image/jpeg'});
      }catch(e){
        if(e&&e.codigo==='EVIDENCIA_DUPLICADA'){/* ya estaba registrada: nada más que limpiar */}
        else{
          marcar(id,{estado:'SUBIDA_SIN_REGISTRO',progreso:1,mensaje:'La foto se subió, pero no se pudo registrar en la intervención: '+((e&&e.message)||e)+'. Reintenta el registro.'});
          return {ok:false,etapa:'registrar',error:e};
        }
      }
      await Cola.quitar(id);await refrescarCache();estados.delete(id);avisar();
      return {ok:true};
    }finally{procesando.delete(id);}
  }
  let cache=[];
  async function refrescarCache(){cache=await Cola.todos();return cache;}
  function pendientesDe(intId){return cache.filter(x=>x.intervencionId===intId);}
  async function reanudar(){
    if(!API()||!API().permisos().escribir||!Archivos.disponible())return;
    if(window.glacialEstadoDatos&&window.glacialEstadoDatos.enLinea===false)return;
    const q=API().quienActua();if(!q)return;
    const todos=await refrescarCache();
    for(const it of todos){if(!procesando.has(it.id)&&API().porId(it.intervencionId))await procesar(it.id);}
    await refrescarCache();avisar();
  }
  if(typeof window.addEventListener==='function')window.addEventListener('online',()=>setTimeout(()=>{reanudar().catch(()=>{});},1500));

  /* ---------- HTML del detalle ---------- */
  const miniaturaPend=it=>{try{return URL.createObjectURL(it.thumb||it.blob);}catch(_){return '';}};
  window.glacialEvidenciasHtml=function(d,p){
    const disp=Archivos.disponible(),activas=(d.evidencias||[]).filter(e=>!e.anulada),pend=pendientesDe(d.id);
    const puedeAgregar=p.escribir&&d.estado!=='CANCELADA'&&disp;
    let h='<h5>Fotos</h5>';
    if(!disp)h+='<div class="mi-meta">Las fotos no están disponibles en este entorno (el almacenamiento de archivos no está habilitado).'+(activas.length?' Las ya registradas no se pueden mostrar aquí.':'')+'</div>';
    Object.keys(M.SECCIONES_EVIDENCIA).forEach(sec=>{
      const lista=activas.filter(e=>e.seccion===sec),pp=pend.filter(x=>x.seccion===sec);
      if(!lista.length&&!pp.length&&!puedeAgregar)return;
      h+='<div style="margin:6px 0"><b style="font-size:12px;color:#46627a">'+esc(M.SECCIONES_EVIDENCIA[sec]).toUpperCase()+'</b><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">'+
        lista.map(e=>'<figure style="margin:0;width:92px"><img alt="'+esc(e.descripcion||'Foto')+'" data-ev-mini="'+esc(e.thumb)+'" data-ev-id="'+esc(e.id)+'" style="width:92px;height:92px;object-fit:cover;border-radius:8px;border:1px solid #dce5ec;background:#f1f5f9;cursor:pointer">'+
          '<figcaption style="font-size:10px;color:#5a6b78">'+esc(e.descripcion||'')+' '+esc((e.por&&e.por.nombre)||'')+'</figcaption></figure>').join('')+
        pp.map(x=>{const st=estados.get(x.id)||{estado:x.estado};return '<figure style="margin:0;width:92px"><img alt="Foto pendiente" src="'+miniaturaPend(x)+'" style="width:92px;height:92px;object-fit:cover;border-radius:8px;border:2px dashed #e879f9;opacity:.8">'+
          '<figcaption style="font-size:10px;color:#86198f"><b>'+(st.estado==='SUBIENDO'?'Subiendo '+Math.round((st.progreso||0)*100)+' %':st.estado==='REGISTRANDO'?'Registrando…':st.estado==='SUBIDA_SIN_REGISTRO'?'Subida; registro pendiente':'Foto pendiente de subir')+'</b>'+
          (st.mensaje?'<br>'+esc(st.mensaje):'')+'<br><button type="button" class="btn btn-ghost btn-sm" data-ev-reintentar="'+esc(x.id)+'">Reintentar</button></figcaption></figure>';}).join('')+
        '</div>'+(puedeAgregar?'<div style="margin-top:4px"><label class="btn btn-ghost btn-sm" style="display:inline-block;cursor:pointer">📷 Agregar foto<input type="file" accept="image/*" capture="environment" data-ev-archivo="'+sec+'" style="display:none"></label> '+
          '<label class="btn btn-ghost btn-sm" style="display:inline-block;cursor:pointer">Elegir de la galería<input type="file" accept="image/*" data-ev-archivo="'+sec+'" style="display:none"></label></div>':'')+'</div>';
    });
    return h+(puedeAgregar?'<div class="mi-meta">Las fotos se comprimen antes de subir. La intervención queda guardada aunque una foto falle.</div>':'');
  };
  /* Después de pintar el detalle: carga las miniaturas (con el SDK autenticado) sin bloquear. */
  window.glacialEvidenciasPostRender=function(raiz){
    if(!raiz)return;
    refrescarCache().then(()=>{});
    raiz.querySelectorAll('img[data-ev-mini]').forEach(img=>{
      if(img.src&&img.dataset.cargada)return;
      urlDe(img.dataset.evMini).then(u=>{img.src=u;img.dataset.cargada='1';}).catch(()=>{img.alt='No se pudo leer la foto';img.style.opacity='.4';});
    });
  };

  async function verCompleta(intId,evId){
    const d=API().porId(intId)||null;
    const e=d&&(d.evidencias||[]).find(x=>x.id===evId);
    if(!e)return;
    const f=UIM().modal('<h3>Foto · '+esc(M.SECCIONES_EVIDENCIA[e.seccion])+'</h3><div id="ev-img" class="mi-meta">Cargando…</div><div class="mi-meta">'+esc(e.descripcion||'')+' · '+esc((e.por&&e.por.nombre)||'')+' · '+esc(UIM().fmtFH(e.en))+'</div>'+
      '<div class="mi-acc"><button type="button" class="btn btn-ghost" data-mi-cerrar>Cerrar</button>'+(API().permisos().escribir&&d.estado!=='CANCELADA'?'<button type="button" class="btn btn-ghost" id="ev-anular">Anular foto</button>':'')+'</div>',true);
    try{const u=await urlDe(e.path);f.querySelector('#ev-img').innerHTML='<img alt="'+esc(e.descripcion||'Foto')+'" src="'+u+'" style="max-width:100%;border-radius:10px">';}
    catch(err){f.querySelector('#ev-img').textContent='No se pudo leer la foto: '+((err&&err.message)||err);}
    const b=f.querySelector('#ev-anular');
    if(b)b.onclick=()=>{
      f.remove();
      UIM().formulario('Anular foto','<label class="completo">Motivo (obligatorio)<textarea id="f-mot" rows="2"></textarea></label>','Anular foto',async q=>{await API().accion(intId,'ANULAR_EVIDENCIA',{id:evId,motivo:q('#f-mot').value});});
    };
  }

  document.addEventListener('change',async e=>{
    const inp=e.target;
    if(!inp||!inp.dataset||inp.dataset.evArchivo===undefined||!UIM().UI.detalle)return;
    const file=inp.files&&inp.files[0];inp.value='';
    if(!file)return;
    const intId=UIM().UI.detalle,sec=inp.dataset.evArchivo;
    UIM().formulario('Foto · '+M.SECCIONES_EVIDENCIA[sec],'<label class="completo">Descripción (opcional)<input id="f-ds" maxlength="160"></label><div class="mi-meta">'+esc(file.name||'foto')+' · '+(file.size/1024).toFixed(0)+' KB</div>','Subir foto',
      async q=>{
        const r=await agregar({intervencionId:intId,seccion:sec,descripcion:q('#f-ds').value,archivo:file});
        // si la foto no pudo subirse el formulario se cierra (reintentar desde el detalle usa el MISMO id: no se duplica) y se avisa
        if(!r.ok)setTimeout(()=>UIM().aviso('Foto pendiente de subir',(r.error&&r.error.message)||'La foto quedó guardada en este dispositivo; reintenta desde el detalle.'),50);
      });
  });
  document.addEventListener('click',async e=>{
    const t=e.target;if(!t||!t.closest)return;
    const mini=t.closest('img[data-ev-id]');
    if(mini&&UIM().UI.detalle){verCompleta(UIM().UI.detalle,mini.dataset.evId);return;}
    const re=t.closest('[data-ev-reintentar]');
    if(re){re.disabled=true;const r=await procesar(re.dataset.evReintentar);await refrescarCache();avisar();if(r&&r.ok===false&&r.error)UIM().aviso('No se pudo completar',(r.error&&r.error.message)||String(r.error));return;}
    const pe=t.closest('[data-mi-eq-fotos]');
    if(pe)fotosDeEquipo(pe.dataset.miEqFotos);
  });

  /* ---------- consulta por equipo ---------- */
  async function fotosDeEquipo(equipoId){
    const E=window.glacialEquiposMaestro,eq=E&&E.porId(equipoId);
    const f=UIM().modal('<h3>Fotos · '+esc(eq?eq.nombre:'equipo')+'</h3><div id="ev-lista" class="mi-vacio">Cargando…</div><div class="mi-acc"><button type="button" class="btn btn-ghost" data-mi-cerrar>Cerrar</button></div>',true);
    try{
      const docs=await API().porEquipo(equipoId);
      const filas=[];
      docs.forEach(d=>(d.evidencias||[]).filter(x=>!x.anulada).forEach(x=>filas.push({d,x})));
      filas.sort((a,b)=>b.x.en-a.x.en);
      f.querySelector('#ev-lista').className='';
      f.querySelector('#ev-lista').innerHTML=filas.length?'<div style="display:flex;gap:8px;flex-wrap:wrap">'+filas.map(({d,x})=>'<figure style="margin:0;width:104px"><img data-ev-mini="'+esc(x.thumb)+'" alt="'+esc(x.descripcion||'Foto')+'" style="width:104px;height:104px;object-fit:cover;border-radius:8px;border:1px solid #dce5ec;background:#f1f5f9;cursor:pointer" data-ev-abrir-int="'+esc(d.id)+'|'+esc(x.id)+'"><figcaption style="font-size:10px;color:#5a6b78">'+esc(UIM().fmtFH(x.en))+' · '+esc(M.SECCIONES_EVIDENCIA[x.seccion])+'<br>'+esc(String(d.problema).slice(0,40))+'</figcaption></figure>').join('')+'</div>'
        :'<div class="mi-vacio">Este equipo no tiene fotos registradas'+(docs.length?' ('+docs.length+' intervenciones).':'.')+'</div>';
      window.glacialEvidenciasPostRender(f);
      f.querySelectorAll('[data-ev-abrir-int]').forEach(i=>i.addEventListener('click',()=>{const [a,b]=i.dataset.evAbrirInt.split('|');f.remove();window.intervencionesAbrir({abrir:a});setTimeout(()=>verCompleta(a,b),400);}));
    }catch(err){f.querySelector('#ev-lista').className='mi-error';f.querySelector('#ev-lista').textContent='No se pudieron leer las fotos del equipo: '+((err&&err.message)||err);}
  }
  window.glacialFotosDeEquipo=fotosDeEquipo;

  /* ---------- regla de obligatoriedad por tipo (Supervisor) ---------- */
  let requeridas={},desubCfg=null;
  function escucharConfig(){
    if(desubCfg||typeof db==='undefined'||typeof state==='undefined'||!state.user)return;
    try{desubCfg=db.collection('sync').doc('configMantenimiento').onSnapshot(s=>{requeridas=(s.exists&&s.data().evidenciasRequeridas)||{};avisar();},()=>{desubCfg=null;});}catch(_){desubCfg=null;}
  }
  async function exigirFoto(tipo,valor){
    const E=window.glacialEquiposMaestro;
    if(!E||!E.puedeConfigurar())throw new Error('Solo el Supervisor de Mantenimiento o el Administrador pueden cambiar esta regla.');
    if(!M.TIPOS[tipo])throw new Error('Tipo de trabajo no válido.');
    const ref=db.collection('sync').doc('configMantenimiento');
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);const act=(s.exists&&s.data().evidenciasRequeridas)||{};
      tx.set(ref,{evidenciasRequeridas:Object.assign({},act,{[tipo]:!!valor}),updatedAt:Date.now()},{merge:true});
    });
  }
  window.glacialEvidenciasConfigHtml=function(){
    const E=window.glacialEquiposMaestro;escucharConfig();
    const puede=E&&E.puedeConfigurar();
    return '<div class="mi-aviso"><b>Fotos obligatorias al cerrar</b> <small>(por tipo de trabajo; por defecto ninguna)</small><div style="margin-top:4px">'+Object.keys(M.TIPOS).map(k=>'<label style="display:inline-flex;gap:6px;align-items:center;margin-right:12px;font-size:13px"><input type="checkbox" data-ev-req="'+k+'"'+(requeridas[k]===true?' checked':'')+(puede?'':' disabled')+'> '+esc(M.TIPOS[k])+'</label>').join('')+'</div></div>';
  };
  document.addEventListener('change',async e=>{
    const c=e.target;
    if(!c||!c.dataset||c.dataset.evReq===undefined)return;
    try{await exigirFoto(c.dataset.evReq,c.checked);}catch(err){c.checked=!c.checked;UIM().aviso('No se pudo guardar',(err&&err.message)||String(err));}
  });

  window.glacialEvidencias={LIM,validarArchivo,dimensiones,rutaDe,preparar,agregar,procesar,reanudar,Archivos,Cola,estados,pendientesDe,refrescarCache,exigirFoto,alCambiar:f=>{if(typeof f==='function'&&!oyentes.includes(f))oyentes.push(f);},urlDe};
  window.glacialEvidencias.alCambiar(()=>{try{UIM().pintarDetalle();}catch(_){/* sin detalle */}});
})();
