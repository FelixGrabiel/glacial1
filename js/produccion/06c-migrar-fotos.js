/* =============================================================
   GLACIAL · MIGRAR LAS FOTOS ANTIGUAS DE CLOUDINARY A SUPABASE (solo Administrador)
   -------------------------------------------------------------
   Las evidencias de las hojas de producto terminado guardadas antes de usar Supabase Storage tienen url https://res.cloudinary.com/…
   Esta herramienta, que corre en el navegador del Administrador con SU sesión (no hace falta ninguna clave secreta), recorre los registros
   (sync/records) y por cada foto:
     1) la descarga de Cloudinary,  2) la sube al bucket privado glacial-fotos (hojas_producto_terminado/<registro>/<foto>.<ext>),
     3) comprueba que se puede firmar,  4) recién entonces, y de a UN registro, cambia sus referencias en una transacción:
        url → «supabase:glacial-fotos/<ruta>», publicId → ruta, proveedor → «supabase»; y CONSERVA la dirección anterior en
        urlCloudinary / publicIdCloudinary (respaldo: permite volver atrás y borrar de Cloudinary más adelante).
   · No borra nada de Cloudinary. · Se puede repetir: lo ya migrado se salta; si una foto falla, queda como estaba y se informa.
   · «Probar descarga» solo descarga y comprueba (no sube ni cambia nada).
   Cargar DESPUÉS de 06b-fotos-supabase.js y de 02-estado.js; el botón aparece en el Historial para el Administrador.
   ============================================================= */
(function instalarMigrarFotos(global){
  'use strict';
  const MAX_BYTES=10*1024*1024;
  const esAdmin=()=>typeof state!=='undefined'&&state&&state.user&&state.user.rol==='Administrador';
  const esCloudinary=u=>typeof u==='string'&&/^https:\/\/res\.cloudinary\.com\//.test(u);
  const F=()=>global.glacialFotos;
  const ESC=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* Fotos pendientes agrupadas por registro: [{recordId, fotos:[{id,url,publicId,nombre,pos}]}] */
  function pendientes(registros){
    const lista=Array.isArray(registros)?registros:(typeof loadRecords==='function'?loadRecords():[]);
    const salida=[];
    (lista||[]).forEach(r=>{
      if(!r||!r.id||!Array.isArray(r.evidenciasPT))return;
      const fotos=[];
      r.evidenciasPT.forEach((e,i)=>{if(e&&esCloudinary(e.url)&&!e.migradaEn)fotos.push({id:e.id||('f'+i),url:e.url,publicId:e.publicId||'',nombre:e.nombre||'',pos:i});});
      if(fotos.length)salida.push({recordId:r.id,fecha:r.fecha||'',turno:r.turno||'',fotos});
    });
    return salida;
  }
  const total=p=>p.reduce((n,r)=>n+r.fotos.length,0);

  async function descargar(url){
    let r;
    try{r=await fetch(url,{mode:'cors',credentials:'omit'});}catch(e){throw new Error('No se pudo descargar de Cloudinary ('+((e&&e.message)||e)+'). Puede ser un bloqueo de red o de CORS.');}
    if(!r.ok)throw new Error('Cloudinary respondió '+r.status+' (¿la foto ya no existe?).');
    const blob=await r.blob();
    if(!blob.size)throw new Error('La foto descargada está vacía.');
    if(blob.size>MAX_BYTES)throw new Error('La foto pesa más de 10 MB.');
    if(!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(blob.type))throw new Error('Tipo de archivo no admitido: '+(blob.type||'desconocido'));
    return blob;
  }

  /* Sube una foto y comprueba que se puede firmar. Devuelve {url (referencia), path}. Si ya estaba subida (repetición), se reutiliza. */
  async function subirYVerificar(rec,foto,blob){
    const fo=F();
    let r;
    try{r=await fo.subir(blob,{carpeta:'hojas_producto_terminado/'+rec.recordId,id:foto.id,tipo:blob.type});}
    catch(e){
      if(!/already exists|duplicate/i.test(String(e&&e.message)))throw e;
      const ext=/pdf/.test(blob.type)?'pdf':/png/.test(blob.type)?'png':/webp/.test(blob.type)?'webp':'jpg';
      const path='hojas_producto_terminado/'+rec.recordId+'/'+foto.id+'.'+ext;
      r={url:fo.PREFIJO+path,path};
    }
    const firmada=await fo.resolver(r.url);
    if(!firmada)throw new Error('La foto se subió pero no se pudo firmar (revisar reglas de Storage).');
    return r;
  }

  /* Cambia, en UNA transacción, las referencias de las fotos migradas de un registro. nuevas: [{id, urlAnterior, url, path}] */
  async function aplicarEnRegistro(recordId,nuevas){
    const ref=db.collection('sync').doc('records');
    let cambiadas=0;
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);
      const items=(s.exists&&Array.isArray(s.data().items))?s.data().items:[];
      const r=items.find(x=>x&&x.id===recordId);
      if(!r)throw new Error('El registro ya no existe.');
      const por=(typeof state!=='undefined'&&state.user&&(state.user.nombre||state.user.username))||'';
      const ev=(Array.isArray(r.evidenciasPT)?r.evidenciasPT:[]).map(e=>{
        const n=e&&nuevas.find(x=>x.id===e.id&&x.urlAnterior===e.url);
        if(!n)return e;
        cambiadas++;
        return {...e,urlCloudinary:e.url,publicIdCloudinary:e.publicId||'',url:n.url,publicId:n.path,proveedor:'supabase',migradaEn:Date.now(),migradaPor:por};
      });
      if(!cambiadas)return;
      r.evidenciasPT=ev;
      tx.set(ref,{items,updatedAt:Date.now()});
    });
    return cambiadas;
  }

  /* opciones: {simular, alProgreso(estado), cancelado()} → {registros, fotosOk, fotosError, errores:[{recordId,foto,mensaje}], simulado} */
  async function migrar(opc){
    opc=opc||{};
    if(!esAdmin())throw new Error('Solo un Administrador puede migrar las fotos.');
    if(!F()||!F().disponible())throw new Error('Supabase Storage no está disponible en este proyecto (¿falta aplicar glacial_25?).');
    const plan=pendientes();
    const res={registros:plan.length,fotosTotal:total(plan),fotosOk:0,fotosError:0,errores:[],simulado:!!opc.simular,cancelada:false};
    const avisar=()=>{if(typeof opc.alProgreso==='function')opc.alProgreso({...res,hechas:res.fotosOk+res.fotosError});};
    avisar();
    for(const rec of plan){
      if(opc.cancelado&&opc.cancelado()){res.cancelada=true;break;}
      const nuevas=[];
      for(const foto of rec.fotos){
        try{
          const blob=await descargar(foto.url);
          if(!opc.simular){const sb=await subirYVerificar(rec,foto,blob);nuevas.push({id:foto.id,urlAnterior:foto.url,url:sb.url,path:sb.path});}
          res.fotosOk++;
        }catch(e){res.fotosError++;res.errores.push({recordId:rec.recordId,fecha:rec.fecha,foto:foto.id,mensaje:(e&&e.message)||String(e)});}
        avisar();
      }
      if(!opc.simular&&nuevas.length){
        try{await aplicarEnRegistro(rec.recordId,nuevas);}
        catch(e){res.fotosOk-=nuevas.length;res.fotosError+=nuevas.length;res.errores.push({recordId:rec.recordId,fecha:rec.fecha,foto:'(registro)',mensaje:'No se pudieron guardar las referencias: '+((e&&e.message)||e)+'. Las fotos subidas se reutilizarán al repetir.'});avisar();}
      }
    }
    return res;
  }

  /* ---------- pantalla (solo Administrador, desde el Historial) ---------- */
  const visible=()=>esAdmin()&&!!F()&&F().disponible()&&pendientes().length>0;
  let cancelar=false;
  function cuerpo(estado,res){
    const p=pendientes(),t=total(p);
    if(estado==='listo'||estado==='corriendo'){
      const hechas=res?res.fotosOk+res.fotosError:0,pct=res&&res.fotosTotal?Math.round(hechas/res.fotosTotal*100):0;
      return `<div style="height:12px;border-radius:99px;background:#e6edf3;overflow:hidden;margin:10px 0"><i style="display:block;height:100%;width:${pct}%;background:#0b5cc4"></i></div>
        <p><b>${hechas}</b> de <b>${res?res.fotosTotal:0}</b> fotos · ${res?res.fotosOk:0} bien · ${res?res.fotosError:0} con error${res&&res.cancelada?' · <b>cancelado</b>':''}${res&&res.simulado?' · <i>prueba: no se subió ni se cambió nada</i>':''}</p>
        ${res&&res.errores.length?`<details open><summary>${res.errores.length} error(es)</summary><ul style="max-height:180px;overflow:auto;font-size:12px">${res.errores.slice(0,60).map(e=>`<li>${ESC(e.fecha)} · ${ESC(e.recordId)} · ${ESC(e.foto)}: ${ESC(e.mensaje)}</li>`).join('')}</ul></details>`:''}
        ${estado==='corriendo'?'<button type="button" class="btn btn-ghost" onclick="glacialMigrarFotos.cancelar()">Cancelar</button>':'<button type="button" class="btn btn-ghost" onclick="glacialMigrarFotos.cerrar()">Cerrar</button>'}`;
    }
    return `<p>Quedan <b>${t}</b> foto(s) de Cloudinary en <b>${p.length}</b> registro(s).</p>
      <p style="font-size:13px;color:#46627a">Se descargan de Cloudinary, se suben al bucket privado de Supabase y se cambia la referencia del registro. Cloudinary no se toca y la dirección anterior se conserva como respaldo. Mantén esta ventana abierta hasta terminar; se puede repetir si algo falla.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-ghost" onclick="glacialMigrarFotos.correr(true)">Probar descarga (sin cambiar nada)</button>
      <button type="button" class="btn btn-primary" onclick="glacialMigrarFotos.correr(false)" ${t?'':'disabled'}>Migrar ahora</button>
      <button type="button" class="btn btn-ghost" onclick="glacialMigrarFotos.cerrar()">Cerrar</button></div>`;
  }
  function pintar(estado,res){
    let f=document.getElementById('migrar-fotos-fondo');
    if(!f){f=document.createElement('div');f.id='migrar-fotos-fondo';f.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(10,20,40,.55);display:flex;align-items:center;justify-content:center;padding:16px';document.body.appendChild(f);}
    f.innerHTML=`<div style="background:#fff;border-radius:14px;padding:18px 20px;width:min(560px,100%);max-height:90vh;overflow:auto"><h3 style="margin:0 0 6px">Migrar fotos antiguas a Supabase</h3>${cuerpo(estado,res)}</div>`;
  }
  async function correr(simular){
    cancelar=false;pintar('corriendo',{fotosTotal:total(pendientes()),fotosOk:0,fotosError:0,errores:[],simulado:simular});
    try{
      const res=await migrar({simular,cancelado:()=>cancelar,alProgreso:e=>pintar('corriendo',e)});
      pintar('listo',res);
    }catch(e){pintar('listo',{fotosTotal:0,fotosOk:0,fotosError:1,errores:[{recordId:'',fecha:'',foto:'',mensaje:(e&&e.message)||String(e)}],simulado:simular});}
  }
  global.glacialMigrarFotos={pendientes,total,migrar,visible,
    abrir:()=>{if(!esAdmin())return;pintar('inicio');},cerrar:()=>{const f=document.getElementById('migrar-fotos-fondo');if(f)f.remove();},cancelar:()=>{cancelar=true;},correr,
    _descargar:descargar,_aplicarEnRegistro:aplicarEnRegistro};
})(typeof window!=='undefined'?window:globalThis);
