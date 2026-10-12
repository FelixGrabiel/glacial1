/* =============================================================
   EQUIPOS POR LÍNEA · catálogo editable y selector «Equipo» para las paradas por «Falla de máquina»

   Catálogo: sync/configMantenimiento → campo equipos { PET1:[nombre…], PET2:[…], B7L:[…], C20L:[…], B20L:[…] }.
     · Se lee en vivo (onSnapshot): al cambiarlo en un dispositivo, los demás ofrecen la lista nueva al instante.
     · Si el campo no existe se usa la lista inicial (EQUIPOS_DEFECTO) SIN escribir nada; se escribe solo cuando alguien edita.
     · Cada cambio (agregar, renombrar, quitar) es una TRANSACCIÓN sobre el documento (el valor nuevo depende del anterior: dos
       personas editando a la vez no se pisan) y usa set con merge:true, así no borra los demás campos del documento
       (modo y horarios de identificación de técnicos, que escribe 37b).
     · Lo escriben el Supervisor de Mantenimiento y el Administrador (reglas existentes); lo leen todos, incluida la cuenta compartida.
   Selector: en las paradas cuyo motivo o causa es «Falla de máquina» se pide el equipo (obligatorio). «Otro equipo» exige un detalle de al
   menos 5 caracteres y se guarda como «Otro equipo — <detalle>». Se guarda el NOMBRE como texto (no un id): el historial se lee igual
   aunque el catálogo cambie. Las paradas antiguas sin equipo se muestran como «Equipo sin indicar».
   Cargar después de 37b-mantenimiento-identificacion.js.
   ============================================================= */
(function(){
  'use strict';

  const DOC='configMantenimiento';
  const LINEAS=['PET1','PET2','B7L','C20L','B20L'];
  const OTRO='Otro equipo';
  const SIN_INDICAR='Equipo sin indicar';
  const MIN_DETALLE=5;
  /* Lista inicial armada a partir de las estaciones de cada línea (suposición: el Supervisor de Mantenimiento la corrige desde la página). */
  const EQUIPOS_DEFECTO=Object.freeze({
    PET1:['Sopladora','Envasadora','Etiquetadora','Empaquetadora'],
    PET2:['Sopladora','Envasadora','Etiquetadora','Empaquetadora'],
    B7L:['Sopladora 1','Sopladora 2','Rinser','Envasadora','Tapadora','Etiquetadora 1','Etiquetadora 2','Empaquetadora'],
    C20L:['Envasadora 1','Envasadora 2','Empaquetadora'],
    B20L:['Lavadora','Envasadora']
  });

  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=t=>String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();

  let equipos=null,listo=false,desub=null,reintento=null;
  const oyentes=[];
  const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(e){console.warn('Equipos:',e&&e.message||e);}});
  const alCambiar=f=>{if(typeof f==='function'&&!oyentes.includes(f))oyentes.push(f);};

  /* Un catálogo válido: por cada línea, una lista de nombres distintos (sin vacíos). Lo que falta o viene mal sale de la lista inicial. */
  function normalizar(origen){
    const sal={};
    LINEAS.forEach(l=>{
      const crudo=origen&&Array.isArray(origen[l])?origen[l]:null;
      if(!crudo){sal[l]=EQUIPOS_DEFECTO[l].slice();return;}
      const vistos=new Set(),lista=[];
      crudo.forEach(n=>{const t=String(n==null?'':n).trim().slice(0,60);if(t&&!vistos.has(norm(t))){vistos.add(norm(t));lista.push(t);}});
      sal[l]=lista;
    });
    return sal;
  }

  function escuchar(){
    if(desub||typeof db==='undefined'||typeof state==='undefined'||!state.user)return;
    try{
      desub=db.collection('sync').doc(DOC).onSnapshot(s=>{
        equipos=normalizar(s.exists?s.data().equipos:null);listo=true;avisar();
      },e=>{console.warn('Equipos por línea:',e&&e.message||e);desub=null;});
    }catch(_){desub=null;}
  }
  function cerrar(){
    if(typeof desub==='function'){try{desub();}catch(_){/* ya cerrada */}}
    desub=null;equipos=null;listo=false;
  }
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(cerrar);
  // La escucha se abre sola al haber sesión (y se reabre si se perdió).
  reintento=setInterval(()=>{if(!desub)escuchar();},4000);
  escuchar();

  /* Si el catálogo de equipos (37d) ya tiene equipos para la línea, esos nombres mandan; si no, la lista de nombres de siempre. */
  const lista=linea=>{
    escuchar();
    try{const M=window.glacialEquiposMaestro;if(M){const ms=M.delaLinea(linea);if(ms.length)return ms.map(e=>e.nombre);}}catch(_){/* se usa la lista de nombres */}
    return ((equipos||EQUIPOS_DEFECTO)[linea]||[]).slice();
  };

  /* ¿Esta parada es por falla de máquina? (motivo del botón o causa del registro/Avance) */
  /* Si el catálogo de motivos (37e) está cargado, él decide qué causas piden equipo (Falla de máquina, Ajuste o calibración…); si no, solo «Falla de máquina». */
  const esFalla=t=>{const M=window.glacialMotivosParada;if(M&&M.pideEquipo)return M.pideEquipo(t);return /^\s*falla de m[aá]quina/i.test(String(t||''));};

  /* ---------- valor del equipo: texto final ↔ selección ---------- */
  /* «Otro equipo — detalle» ↔ {sel:'__otro__',detalle}; un nombre del catálogo ↔ {sel:nombre}. Un nombre que ya no está en el catálogo
     (se renombró o quitó) se conserva tal cual: el historial no cambia. */
  function descomponer(valor){
    const t=String(valor||'').trim();
    if(!t)return {sel:'',detalle:''};
    const m=t.match(/^otro equipo\s*[—–-]\s*(.*)$/i);
    if(m||norm(t)===norm(OTRO))return {sel:'__otro__',detalle:m?m[1].trim():''};
    return {sel:t,detalle:''};
  }
  /* Texto final a guardar, o '' si la selección está incompleta. */
  function componer(sel,detalle){
    if(!sel)return '';
    if(sel==='__otro__'){const d=String(detalle||'').trim();return d.length>=MIN_DETALLE?OTRO+' — '+d.slice(0,80):'';}
    return String(sel).trim().slice(0,100);
  }
  /* Texto a guardar MIENTRAS se edita (formularios que se guardan solos): «Otro equipo» se conserva aunque el detalle aún no esté completo,
     para que la selección no se pierda al redibujar. Es inválido (validarTexto) hasta que el detalle tenga al menos 5 caracteres. */
  function componerParcial(sel,detalle){
    if(!sel)return '';
    if(sel==='__otro__'){const d=String(detalle||'').trim().slice(0,80);return d?OTRO+' — '+d:OTRO;}
    return String(sel).trim().slice(0,100);
  }
  /* Valida un equipo ya guardado como texto. */
  function validarTexto(valor){const d=descomponer(valor);return validar(d.sel,d.detalle);}
  /* Error legible o '' si el equipo es válido para una parada por falla. */
  function validar(sel,detalle){
    if(!sel)return 'Elige el equipo que falló.';
    if(sel==='__otro__'&&String(detalle||'').trim().length<MIN_DETALLE)return 'Escribe el detalle del equipo (mínimo '+MIN_DETALLE+' caracteres).';
    return '';
  }

  /* HTML de las opciones del selector (el nombre actual se conserva aunque ya no esté en el catálogo). */
  function opciones(linea,valor){
    const d=descomponer(valor),nombres=lista(linea);
    if(d.sel&&d.sel!=='__otro__'&&!nombres.some(n=>norm(n)===norm(d.sel)))nombres.push(d.sel);
    return '<option value="">Seleccionar equipo…</option>'+nombres.map(n=>'<option value="'+esc(n)+'"'+(norm(n)===norm(d.sel)?' selected':'')+'>'+esc(n)+'</option>').join('')+
      '<option value="__otro__"'+(d.sel==='__otro__'?' selected':'')+'>'+OTRO+'</option>';
  }

  /* ---------- editar el catálogo (transacción + merge) ---------- */
  function puedeConfigurar(){
    const u=(typeof state!=='undefined'&&state.user)||null;
    if(!u)return false;
    if(typeof window.esMantCompartido==='function'&&window.esMantCompartido(u))return false;
    if(typeof esUsuarioSoloConsulta==='function'&&esUsuarioSoloConsulta(u))return false;
    return String(u.rol||'').trim()==='Administrador'||(typeof puedeGestionarRotacionMtto==='function'&&puedeGestionarRotacionMtto());
  }
  async function modificar(linea,fn){
    if(!puedeConfigurar())throw new Error('Solo el Supervisor de Mantenimiento o el Administrador pueden cambiar los equipos.');
    if(!LINEAS.includes(linea))throw new Error('Línea no válida.');
    const ref=db.collection('sync').doc(DOC),quien=(state.user&&(state.user.username||state.user.nombre))||'';
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      const act=normalizar(snap.exists?snap.data().equipos:null);
      act[linea]=fn(act[linea].slice());
      tx.set(ref,{equipos:act,equiposActualizadoPor:quien,equiposActualizadoEn:ahora(),updatedAt:Date.now()},{merge:true});
    });
  }
  const nombreValido=n=>{
    const t=String(n==null?'':n).trim();
    if(t.length<2)throw new Error('Escribe el nombre del equipo (mínimo 2 caracteres).');
    if(t.length>40)throw new Error('El nombre del equipo es demasiado largo (máximo 40 caracteres).');
    if(norm(t)===norm(OTRO))throw new Error('«'+OTRO+'» ya existe como opción fija.');
    return t;
  };
  const agregar=(linea,nombre)=>modificar(linea,l=>{
    const t=nombreValido(nombre);
    if(l.some(x=>norm(x)===norm(t)))throw new Error('Ya existe «'+t+'» en esta línea.');
    l.push(t);return l;
  });
  const renombrar=(linea,anterior,nuevo)=>modificar(linea,l=>{
    const t=nombreValido(nuevo),i=l.findIndex(x=>x===anterior);
    if(i<0)throw new Error('«'+anterior+'» ya no está en la lista (otra persona lo cambió).');
    if(l.some((x,j)=>j!==i&&norm(x)===norm(t)))throw new Error('Ya existe «'+t+'» en esta línea.');
    l[i]=t;return l;
  });
  const quitar=(linea,nombre)=>modificar(linea,l=>{
    const i=l.findIndex(x=>x===nombre);
    if(i<0)throw new Error('«'+nombre+'» ya no está en la lista (otra persona lo quitó).');
    l.splice(i,1);return l;
  });

  /* ---------- pantalla «Equipos por línea» (ventana propia, sin alert/confirm/prompt) ---------- */
  function estilos(){
    if(typeof document==='undefined'||document.getElementById('eq-css'))return;
    const s=document.createElement('style');s.id='eq-css';
    s.textContent='.eq-fondo{position:fixed;inset:0;background:rgba(10,30,50,.5);display:flex;align-items:center;justify-content:center;z-index:10050;padding:12px}'+
      '.eq-modal{background:#fff;border-radius:14px;padding:16px 18px;width:min(520px,100%);max-height:92vh;overflow:auto;box-shadow:0 16px 48px rgba(0,0,0,.28)}'+
      '.eq-modal h3{margin:0 0 4px;color:#103b57}.eq-modal .eq-sub{margin:0 0 10px;color:#5a6b78;font-size:12px}'+
      '.eq-lineas{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 12px}'+
      '.eq-lineas button{border:1px solid #cbd8e0;background:#fff;border-radius:999px;padding:8px 14px;font:inherit;font-weight:700;cursor:pointer;min-height:40px}'+
      '.eq-lineas button.on{background:#003b5c;border-color:#003b5c;color:#fff}'+
      '.eq-fila{display:flex;gap:6px;align-items:center;margin:6px 0}.eq-fila input{flex:1;min-width:0;padding:9px 10px;border:1px solid #cbd8e0;border-radius:8px;font:inherit;min-height:40px;box-sizing:border-box}'+
      '.eq-fila button{border:1px solid #cbd8e0;background:#fff;border-radius:8px;padding:0 12px;font:inherit;font-weight:600;cursor:pointer;min-height:40px}'+
      '.eq-fila button.peligro{border-color:#e3b4ad;color:#a32020}.eq-fila button.peligro.conf{background:#a32020;color:#fff;border-color:#a32020}'+
      '.eq-msg{min-height:18px;margin:8px 0;font-size:12px;color:#c62828;white-space:pre-line}.eq-msg.ok{color:#1e7f4e}'+
      '.eq-pie{display:flex;justify-content:flex-end;margin-top:10px}';
    document.head.appendChild(s);
  }
  let editor=null;     // {fondo,linea,msg}
  function pintarEditor(){
    if(!editor||!document.body.contains(editor.fondo))return;
    const enfocado=editor.fondo.querySelector('input:focus');
    if(enfocado)return;                                            // un cambio remoto no pisa lo que se está escribiendo
    const l=editor.linea,nombres=lista(l);
    const puede=puedeConfigurar();
    editor.fondo.querySelector('.eq-modal').innerHTML=
      '<h3>Equipos por línea</h3><p class="eq-sub">Son las opciones que se ofrecen al registrar una parada por «Falla de máquina». Los cambios se ven al instante en los demás dispositivos. Las paradas ya registradas conservan el nombre con el que se guardaron.</p>'+
      '<div class="eq-lineas" role="tablist">'+LINEAS.map(k=>'<button type="button" role="tab" class="'+(k===l?'on':'')+'" data-eq-linea="'+k+'">'+esc(k==='C20L'?'CAJAS 20L':k)+'</button>').join('')+'</div>'+
      (nombres.length?nombres.map((n,i)=>'<div class="eq-fila"><input type="text" maxlength="40" value="'+esc(n)+'" data-eq-nombre="'+esc(n)+'" aria-label="Nombre del equipo"'+(puede?'':' disabled')+'>'+
        (puede?'<button type="button" data-eq-renombrar="'+i+'">Guardar</button><button type="button" class="peligro" data-eq-quitar="'+i+'">Quitar</button>':'')+'</div>').join('')
        :'<p class="eq-sub">Esta línea no tiene equipos. Agrega el primero.</p>')+
      (puede?'<div class="eq-fila"><input type="text" id="eq-nuevo" maxlength="40" placeholder="Equipo nuevo" aria-label="Equipo nuevo"><button type="button" data-eq-agregar>Agregar</button></div>':'<p class="eq-sub">Solo el Supervisor de Mantenimiento o el Administrador pueden cambiarlos.</p>')+
      '<div class="eq-msg" id="eq-msg" role="status">'+esc(editor.msg||'')+'</div>'+
      '<p class="eq-sub">«'+OTRO+'» siempre está disponible y pide un detalle de al menos '+MIN_DETALLE+' caracteres.</p>'+
      '<div class="eq-pie"><button type="button" class="btn btn-primary" data-eq-cerrar>Listo</button></div>';
    const m=editor.fondo.querySelector('#eq-msg');if(m&&editor.ok)m.classList.add('ok');
  }
  async function accion(f,okTxt){
    const m=editor&&editor.fondo.querySelector('#eq-msg');
    try{await f();editor.msg=okTxt;editor.ok=true;editor.confirmar=null;}
    catch(e){editor.msg=(e&&e.message)||String(e);editor.ok=false;}
    pintarEditor();
  }
  function abrirEditor(){
    estilos();
    if(editor&&document.body.contains(editor.fondo))return;
    const fondo=document.createElement('div');
    fondo.className='eq-fondo';fondo.innerHTML='<div class="eq-modal" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(fondo);
    editor={fondo,linea:LINEAS[0],msg:'',ok:false,confirmar:null};
    fondo.addEventListener('mousedown',e=>{if(e.target===fondo){fondo.remove();editor=null;}});
    fondo.addEventListener('click',e=>{
      const t=e.target;if(!t||!t.closest)return;
      const bl=t.closest('[data-eq-linea]');
      if(bl){editor.linea=bl.getAttribute('data-eq-linea');editor.msg='';editor.confirmar=null;pintarEditor();return;}
      if(t.closest('[data-eq-cerrar]')){fondo.remove();editor=null;return;}
      const nombres=lista(editor.linea);
      if(t.closest('[data-eq-agregar]')){const v=fondo.querySelector('#eq-nuevo').value;accion(()=>agregar(editor.linea,v),'Equipo agregado.');return;}
      const br=t.closest('[data-eq-renombrar]');
      if(br){const i=Number(br.getAttribute('data-eq-renombrar')),inp=fondo.querySelectorAll('[data-eq-nombre]')[i];accion(()=>renombrar(editor.linea,nombres[i],inp.value),'Nombre guardado.');return;}
      const bq=t.closest('[data-eq-quitar]');
      if(bq){
        const i=Number(bq.getAttribute('data-eq-quitar'));
        // quitar pide una segunda pulsación (sin confirm()): el primer clic arma el botón
        if(editor.confirmar!==i){editor.confirmar=i;bq.classList.add('conf');bq.textContent='Confirmar';editor.msg='Pulsa «Confirmar» para quitar «'+nombres[i]+'». Las paradas ya registradas no cambian.';editor.ok=false;fondo.querySelector('#eq-msg').textContent=editor.msg;return;}
        accion(()=>quitar(editor.linea,nombres[i]),'Equipo quitado.');
      }
    });
    alCambiar(pintarEditor);
    pintarEditor();
  }

  /* ---------- ventanas propias: aviso y selector de equipo (sin alert ni prompt) ---------- */
  function aviso(texto){
    estilos();
    return new Promise(resolve=>{
      const f=document.createElement('div');f.className='eq-fondo';
      f.innerHTML='<div class="eq-modal" role="alertdialog" aria-modal="true"><p class="eq-sub" style="font-size:14px;color:#35506a">'+esc(texto)+'</p><div class="eq-pie"><button type="button" class="btn btn-primary" data-a>Entendido</button></div></div>';
      document.body.appendChild(f);
      f.querySelector('[data-a]').onclick=()=>{f.remove();resolve();};
    });
  }
  /* Pide el equipo de una línea. Devuelve el texto del equipo o null si se cancela. */
  function pedir(linea,titulo){
    estilos();
    return new Promise(resolve=>{
      const f=document.createElement('div');f.className='eq-fondo';
      f.innerHTML='<div class="eq-modal" role="dialog" aria-modal="true"><h3>'+esc(titulo||'Indicar equipo')+'</h3>'+
        '<p class="eq-sub">Equipo que falló en '+esc(linea==='C20L'?'CAJAS 20L':linea)+'.</p>'+
        '<div class="eq-fila"><select id="eq-pedir-sel" style="flex:1;min-height:40px;padding:8px;border:1px solid #cbd8e0;border-radius:8px" aria-label="Equipo">'+opciones(linea,'')+'</select></div>'+
        '<div class="eq-fila" id="eq-pedir-otro-fila" hidden><input type="text" id="eq-pedir-otro" maxlength="80" placeholder="Detalle del equipo (mínimo '+MIN_DETALLE+' caracteres)" aria-label="Detalle del equipo"></div>'+
        '<div class="eq-msg" id="eq-pedir-msg" role="alert"></div>'+
        '<div class="eq-pie" style="gap:8px"><button type="button" class="btn btn-ghost" data-c>Cancelar</button><button type="button" class="btn btn-primary" data-a>Guardar</button></div></div>';
      document.body.appendChild(f);
      const sel=f.querySelector('#eq-pedir-sel'),fila=f.querySelector('#eq-pedir-otro-fila'),otro=f.querySelector('#eq-pedir-otro'),msg=f.querySelector('#eq-pedir-msg');
      sel.addEventListener('change',()=>{fila.hidden=sel.value!=='__otro__';msg.textContent='';});
      const cerrarV=v=>{f.remove();resolve(v);};
      f.querySelector('[data-c]').onclick=()=>cerrarV(null);
      f.addEventListener('mousedown',e=>{if(e.target===f)cerrarV(null);});
      f.querySelector('[data-a]').onclick=()=>{
        const err=validar(sel.value,otro.value);
        if(err){msg.textContent=err;return;}
        cerrarV(componer(sel.value,otro.value));
      };
      sel.focus();
    });
  }

  /* Botón «Equipos por línea» en la barra del módulo de Mantenimiento (junto a «Identificación de técnicos»). */
  if(typeof tareoRenderTabs==='function'){
    const tabsAnterior=tareoRenderTabs;
    tareoRenderTabs=function(){
      const html=tabsAnterior.apply(this,arguments);
      try{
        if(typeof tareoPestanaEnModulo!=='function'||!tareoPestanaEnModulo('identificacion')||html.indexOf('mant-equipos-tab')>=0)return html;
        const boton='<button type="button" class="tareo-tab mant-equipos-tab" onclick="glacialEquipos.abrirEditor()">Equipos por línea</button>';
        return html.replace('</div>',boton+'</div>');
      }catch(_){return html;}
    };
    window.tareoRenderTabs=tareoRenderTabs;
  }

  window.glacialEquipos={LINEAS,OTRO,SIN_INDICAR,MIN_DETALLE,EQUIPOS_DEFECTO,lista,esFalla,descomponer,componer,componerParcial,validar,validarTexto,opciones,aviso,pedir,
    agregar,renombrar,quitar,puedeConfigurar,abrirEditor,alCambiar,normalizar,estado:()=>({listo,equipos:equipos&&JSON.parse(JSON.stringify(equipos))}),cerrar,escuchar};
})();
