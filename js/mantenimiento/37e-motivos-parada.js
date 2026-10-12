/* =============================================================
   MOTIVOS DE PARADA · catálogo de causas y motivos (dos niveles) editable, para las paradas NO programadas

   Catálogo: sync/configMantenimiento → campo motivosParada = [ { id, nombre, pideEquipo, activa, exigeDetalle?, motivos:[{ id, nombre, activo }] } ].
     · Se lee en vivo (onSnapshot): un cambio en un dispositivo se ve al instante en los demás.
     · Si el campo no existe se usa el catálogo inicial (CATALOGO_DEFECTO) SIN escribir nada; se escribe solo cuando alguien edita.
     · Cada cambio es una TRANSACCIÓN con set merge:true tocando solo sus campos (motivosParada, motivosParadaActualizadoPor/En, updatedAt):
       el documento lo comparten 37b (identificación), 37c (equipos) y 37d (equipos maestro); ninguno se borra entre sí.
     · Lo escriben el Supervisor de Mantenimiento y el Administrador (reglas existentes); lo leen todos, incluida la cuenta compartida.
     · Nada se borra: una causa o un motivo se DESACTIVA (deja de ofrecerse, pero el historial y las paradas ya registradas se leen igual).
   Cada parada no programada guarda como TEXTO: causa, motivoCat (motivo del catálogo), detalle y equipo; y descripcion = motivo + « — » + detalle,
   para que todo lo que hoy lee «descripcion» siga funcionando. Las paradas antiguas conservan su causa y su descripción tal cual.
   Se mantienen los textos exactos «Falla de máquina» y «Calidad / producto no conforme» (otras partes los buscan por nombre): no se renombran ni se desactivan.
   «Otro» exige un detalle de al menos 10 caracteres.
   Cargar después de 37c-equipos-catalogo.js (que le delega «¿esta causa pide equipo?»).
   ============================================================= */
(function(){
  'use strict';

  const DOC='configMantenimiento';
  const MIN_DETALLE_OTRO=10;
  const SEP=' — ';
  const PROTEGIDAS=Object.freeze(['Falla de máquina','Calidad / producto no conforme']);

  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=t=>String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const slug=t=>norm(t).replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,40);
  const idNuevo=p=>p+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);

  const m=(nombre)=>({id:'mo_'+slug(nombre),nombre,activo:true});
  const causa=(nombre,pideEquipo,motivos,extra)=>Object.assign({id:'ca_'+slug(nombre),nombre,pideEquipo:!!pideEquipo,activa:true,
    motivos:(motivos||[nombre]).map(m)},extra||{});
  /* Catálogo inicial (el Supervisor de Mantenimiento lo ajusta desde la página). Las demás causas empiezan con un solo motivo igual a su nombre. */
  const CATALOGO_DEFECTO=Object.freeze([
    causa('Falla de máquina',true),
    causa('Ajuste o calibración',true,['Calibración','Llenado lento','Atasco de preforma','Carril o guía de tapas']),
    causa('Servicios (agua, aire comprimido, energía)',false,['Escasez de agua','Falta de presión de aire','Falla de compresor','Corte de energía']),
    causa('Falta de insumos',false,['Falta de insumos','Falta de paletas']),
    causa('Falta de personal o apoyo a otra línea',false,['Apoyo a otra línea','Rotación de personal','Personal incompleto']),
    causa('Calidad / producto no conforme',false),
    causa('Otro',false,['Otro'],{exigeDetalle:true})
  ]);

  let catalogo=null,listo=false,desub=null,reintento=null;
  const oyentes=[];
  const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(e){console.warn('Motivos de parada:',e&&e.message||e);}});
  const alCambiar=f=>{if(typeof f==='function'&&!oyentes.includes(f))oyentes.push(f);};

  /* Un catálogo válido: causas con id y nombre distintos, motivos con id y nombre distintos. Si no es una lista con contenido, el inicial. */
  function normalizar(origen){
    if(!Array.isArray(origen)||!origen.length)return JSON.parse(JSON.stringify(CATALOGO_DEFECTO));
    const vistas=new Set(),sal=[];
    origen.forEach(c=>{
      const nombre=String(c&&c.nombre!=null?c.nombre:'').trim().slice(0,60);
      if(!nombre||vistas.has(norm(nombre)))return;
      vistas.add(norm(nombre));
      const mv=new Set(),motivos=[];
      (Array.isArray(c.motivos)?c.motivos:[]).forEach(x=>{
        const n=String(x&&x.nombre!=null?x.nombre:'').trim().slice(0,60);
        if(!n||mv.has(norm(n)))return;
        mv.add(norm(n));
        motivos.push({id:String(x.id||'mo_'+slug(n)),nombre:n,activo:x.activo!==false});
      });
      if(!motivos.length)motivos.push({id:'mo_'+slug(nombre),nombre,activo:true});
      const o={id:String(c.id||'ca_'+slug(nombre)),nombre,pideEquipo:!!c.pideEquipo,activa:c.activa!==false,motivos};
      if(c.exigeDetalle)o.exigeDetalle=true;
      sal.push(o);
    });
    return sal.length?sal:JSON.parse(JSON.stringify(CATALOGO_DEFECTO));
  }

  function escuchar(){
    if(desub||typeof db==='undefined'||typeof state==='undefined'||!state.user)return;
    try{
      desub=db.collection('sync').doc(DOC).onSnapshot(s=>{
        catalogo=normalizar(s.exists?s.data().motivosParada:null);listo=true;avisar();
      },e=>{console.warn('Motivos de parada:',e&&e.message||e);desub=null;});
    }catch(_){desub=null;}
  }
  function cerrar(){
    if(typeof desub==='function'){try{desub();}catch(_){/* ya cerrada */}}
    desub=null;catalogo=null;listo=false;
  }
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(cerrar);
  reintento=setInterval(()=>{if(!desub)escuchar();},4000);
  escuchar();

  const todas=()=>{escuchar();return catalogo||normalizar(null);};
  /* Causas que se ofrecen al registrar una parada (las activas). */
  const causas=()=>todas().filter(c=>c.activa);
  const causaPorNombre=n=>{const k=norm(String(n||'').split(SEP)[0]);return k?todas().find(c=>norm(c.nombre)===k)||null:null;};
  const motivosDe=(nombreCausa,incluirInactivos)=>{const c=causaPorNombre(nombreCausa);return c?c.motivos.filter(x=>incluirInactivos||x.activo).map(x=>x.nombre):[];};

  /* ¿Esta causa pide equipo? Lee el catálogo; una causa que no está en él (parada antigua) se decide por el texto de siempre. */
  function pideEquipo(texto){
    const t=String(texto||'');
    if(!t.trim())return false;
    const c=causaPorNombre(t);
    if(c)return !!c.pideEquipo;
    return /^\s*falla de m[aá]quina/i.test(t);
  }
  const exigeDetalle=nombreCausa=>{const c=causaPorNombre(nombreCausa);return !!(c&&(c.exigeDetalle||norm(c.nombre)==='otro'))||(!c&&norm(nombreCausa)==='otro');};
  const detalleMin=nombreCausa=>exigeDetalle(nombreCausa)?MIN_DETALLE_OTRO:0;

  /* descripcion = motivo + « — » + detalle (solo motivo si no hay detalle). */
  const componerDescripcion=(motivo,detalle)=>{const mo=String(motivo||'').trim(),d=String(detalle||'').trim();return mo?(d?mo+SEP+d:mo):'';};
  /* Error legible o '' si causa/motivo/detalle están completos para una parada no programada. */
  function validar(causaTxt,motivo,detalle){
    if(!String(causaTxt||'').trim())return 'Elige la causa de la parada.';
    if(!String(motivo||'').trim())return 'Elige el motivo de la parada.';
    const min=detalleMin(causaTxt);
    if(min&&String(detalle||'').trim().length<min)return 'Con la causa «'+String(causaTxt).trim()+'» escribe el detalle (mínimo '+min+' caracteres).';
    return '';
  }

  /* Opciones de <select>: el valor actual se conserva aunque ya no esté activo o ya no exista en el catálogo (historial). */
  function opcionesCausa(valor){
    const act=String(valor||'').trim(),nombres=causas().map(c=>c.nombre);
    if(act&&!nombres.some(n=>norm(n)===norm(act)))nombres.push(act);
    return '<option value="">Seleccionar…</option>'+nombres.map(n=>'<option value="'+esc(n)+'"'+(norm(n)===norm(act)?' selected':'')+'>'+esc(n)+'</option>').join('');
  }
  function opcionesMotivo(nombreCausa,valor){
    const act=String(valor||'').trim(),nombres=motivosDe(nombreCausa);
    if(act&&!nombres.some(n=>norm(n)===norm(act)))nombres.push(act);
    return '<option value="">Seleccionar…</option>'+nombres.map(n=>'<option value="'+esc(n)+'"'+(norm(n)===norm(act)?' selected':'')+'>'+esc(n)+'</option>').join('');
  }

  /* ---------- editar el catálogo (transacción + merge) ---------- */
  function puedeConfigurar(){
    const u=(typeof state!=='undefined'&&state.user)||null;
    if(!u)return false;
    if(typeof window.esMantCompartido==='function'&&window.esMantCompartido(u))return false;
    if(typeof esUsuarioSoloConsulta==='function'&&esUsuarioSoloConsulta(u))return false;
    return String(u.rol||'').trim()==='Administrador'||(typeof puedeGestionarRotacionMtto==='function'&&puedeGestionarRotacionMtto());
  }
  async function modificar(fn){
    if(!puedeConfigurar())throw new Error('Solo el Supervisor de Mantenimiento o el Administrador pueden cambiar los motivos de parada.');
    const ref=db.collection('sync').doc(DOC),quien=(state.user&&(state.user.username||state.user.nombre))||'';
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      const act=normalizar(snap.exists?snap.data().motivosParada:null);
      const nuevo=fn(act);
      tx.set(ref,{motivosParada:nuevo||act,motivosParadaActualizadoPor:quien,motivosParadaActualizadoEn:ahora(),updatedAt:Date.now()},{merge:true});
    });
  }
  function nombreValido(n,que){
    const t=String(n==null?'':n).trim();
    if(t.length<2)throw new Error('Escribe el nombre '+que+' (mínimo 2 caracteres).');
    if(t.length>60)throw new Error('El nombre '+que+' es demasiado largo (máximo 60 caracteres).');
    return t;
  }
  const buscarCausa=(lista,id)=>{const c=lista.find(x=>x.id===id);if(!c)throw new Error('La causa ya no está en la lista (otra persona la cambió).');return c;};
  const buscarMotivo=(c,id)=>{const x=c.motivos.find(y=>y.id===id);if(!x)throw new Error('El motivo ya no está en la lista (otra persona lo cambió).');return x;};

  const agregarCausa=(nombre,pide)=>modificar(l=>{
    const t=nombreValido(nombre,'de la causa');
    if(l.some(c=>norm(c.nombre)===norm(t)))throw new Error('Ya existe la causa «'+t+'».');
    l.push({id:idNuevo('ca'),nombre:t,pideEquipo:!!pide,activa:true,motivos:[{id:idNuevo('mo'),nombre:t,activo:true}]});return l;
  });
  const renombrarCausa=(id,nombre)=>modificar(l=>{
    const c=buscarCausa(l,id),t=nombreValido(nombre,'de la causa');
    if(PROTEGIDAS.includes(c.nombre)&&t!==c.nombre)throw new Error('«'+c.nombre+'» no se puede renombrar: otras partes de la página la buscan por ese nombre.');
    if(l.some(x=>x.id!==id&&norm(x.nombre)===norm(t)))throw new Error('Ya existe la causa «'+t+'».');
    c.nombre=t;return l;
  });
  const cambiarPideEquipo=(id,valor)=>modificar(l=>{buscarCausa(l,id).pideEquipo=!!valor;return l;});
  const activarCausa=(id,valor)=>modificar(l=>{
    const c=buscarCausa(l,id);
    if(!valor&&PROTEGIDAS.includes(c.nombre))throw new Error('«'+c.nombre+'» no se puede desactivar.');
    if(!valor&&l.filter(x=>x.activa&&x.id!==id).length<1)throw new Error('Debe quedar al menos una causa activa.');
    c.activa=!!valor;return l;
  });
  const agregarMotivo=(idCausa,nombre)=>modificar(l=>{
    const c=buscarCausa(l,idCausa),t=nombreValido(nombre,'del motivo');
    if(c.motivos.some(x=>norm(x.nombre)===norm(t)))throw new Error('Ya existe el motivo «'+t+'» en esta causa.');
    c.motivos.push({id:idNuevo('mo'),nombre:t,activo:true});return l;
  });
  const renombrarMotivo=(idCausa,idMotivo,nombre)=>modificar(l=>{
    const c=buscarCausa(l,idCausa),x=buscarMotivo(c,idMotivo),t=nombreValido(nombre,'del motivo');
    if(c.motivos.some(y=>y.id!==idMotivo&&norm(y.nombre)===norm(t)))throw new Error('Ya existe el motivo «'+t+'» en esta causa.');
    x.nombre=t;return l;
  });
  const activarMotivo=(idCausa,idMotivo,valor)=>modificar(l=>{
    const c=buscarCausa(l,idCausa),x=buscarMotivo(c,idMotivo);
    if(!valor&&c.motivos.filter(y=>y.activo&&y.id!==idMotivo).length<1)throw new Error('Cada causa debe conservar al menos un motivo activo.');
    x.activo=!!valor;return l;
  });

  /* ---------- pantalla «Motivos de parada» (ventana propia, sin alert/confirm/prompt) ---------- */
  function estilos(){
    if(typeof document==='undefined'||document.getElementById('mp-css'))return;
    const s=document.createElement('style');s.id='mp-css';
    s.textContent='.mp-fondo{position:fixed;inset:0;background:rgba(10,30,50,.5);display:flex;align-items:center;justify-content:center;z-index:10050;padding:12px}'+
      '.mp-modal{background:#fff;border-radius:14px;padding:16px 18px;width:min(560px,100%);max-height:92vh;overflow:auto;box-shadow:0 16px 48px rgba(0,0,0,.28)}'+
      '.mp-modal h3{margin:0 0 4px;color:#103b57}.mp-modal h4{margin:12px 0 4px;color:#103b57;font-size:14px}.mp-sub{margin:0 0 10px;color:#5a6b78;font-size:12px}'+
      '.mp-fila{display:flex;gap:6px;align-items:center;margin:6px 0;flex-wrap:wrap}.mp-fila input[type=text],.mp-fila select{flex:1 1 150px;min-width:0;padding:9px 10px;border:1px solid #cbd8e0;border-radius:8px;font:inherit;min-height:40px;box-sizing:border-box}'+
      '.mp-fila button{border:1px solid #cbd8e0;background:#fff;border-radius:8px;padding:0 12px;font:inherit;font-weight:600;cursor:pointer;min-height:40px}'+
      '.mp-fila label{display:flex;gap:6px;align-items:center;font-size:13px;min-height:40px}'+
      '.mp-inactivo input[type=text]{color:#8a97a1;background:#f3f6f8}.mp-chip{font-size:11px;font-weight:700;color:#8a5a00;background:#fff4d6;border-radius:999px;padding:2px 8px}'+
      '.mp-msg{min-height:18px;margin:8px 0;font-size:12px;color:#c62828;white-space:pre-line}.mp-msg.ok{color:#1e7f4e}'+
      '.mp-pie{display:flex;justify-content:flex-end;margin-top:10px}';
    document.head.appendChild(s);
  }
  let editor=null;     // {fondo,causaId,msg,ok}
  function pintarEditor(){
    if(!editor||!document.body.contains(editor.fondo))return;
    if(editor.fondo.querySelector('input[type=text]:focus'))return;       // un cambio remoto no pisa lo que se está escribiendo
    const lista=todas(),puede=puedeConfigurar();
    let c=lista.find(x=>x.id===editor.causaId);if(!c){c=lista[0];editor.causaId=c.id;}
    const prot=PROTEGIDAS.includes(c.nombre),dis=puede?'':' disabled';
    editor.fondo.querySelector('.mp-modal').innerHTML=
      '<h3>Motivos de parada</h3><p class="mp-sub">Son las opciones al registrar una parada NO programada: primero la causa y luego el motivo. Los cambios se ven al instante en los demás dispositivos. '+
      'Nada se borra: lo que ya no se use se desactiva y las paradas ya registradas se leen igual.</p>'+
      '<div class="mp-fila"><select id="mp-causa" aria-label="Causa">'+lista.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===c.id?' selected':'')+'>'+esc(x.nombre)+(x.activa?'':' (desactivada)')+'</option>').join('')+'</select></div>'+
      '<div class="mp-fila'+(c.activa?'':' mp-inactivo')+'"><input type="text" id="mp-causa-nombre" maxlength="60" value="'+esc(c.nombre)+'" aria-label="Nombre de la causa"'+(prot?' disabled':dis)+'>'+
        (puede&&!prot?'<button type="button" data-mp-causa-guardar>Guardar</button>':'')+
        (puede&&!prot?'<button type="button" data-mp-causa-activa="'+(c.activa?'0':'1')+'">'+(c.activa?'Desactivar':'Activar')+'</button>':'')+'</div>'+
      (prot?'<p class="mp-sub">Este nombre es fijo: otras partes de la página lo buscan por texto.</p>':'')+
      '<div class="mp-fila"><label><input type="checkbox" id="mp-pide-equipo"'+(c.pideEquipo?' checked':'')+dis+'> Pide el equipo que falló</label></div>'+
      '<h4>Motivos de «'+esc(c.nombre)+'»</h4>'+
      c.motivos.map(x=>'<div class="mp-fila'+(x.activo?'':' mp-inactivo')+'"><input type="text" maxlength="60" value="'+esc(x.nombre)+'" data-mp-motivo="'+esc(x.id)+'" aria-label="Nombre del motivo"'+dis+'>'+
        (puede?'<button type="button" data-mp-motivo-guardar="'+esc(x.id)+'">Guardar</button><button type="button" data-mp-motivo-activo="'+esc(x.id)+'" data-v="'+(x.activo?'0':'1')+'">'+(x.activo?'Desactivar':'Activar')+'</button>':'')+
        (x.activo?'':'<span class="mp-chip">Desactivado</span>')+'</div>').join('')+
      (puede?'<div class="mp-fila"><input type="text" id="mp-motivo-nuevo" maxlength="60" placeholder="Motivo nuevo" aria-label="Motivo nuevo"><button type="button" data-mp-motivo-agregar>Agregar motivo</button></div>'+
        '<h4>Causa nueva</h4><div class="mp-fila"><input type="text" id="mp-causa-nueva" maxlength="60" placeholder="Nombre de la causa" aria-label="Causa nueva"><label><input type="checkbox" id="mp-causa-nueva-eq"> Pide equipo</label><button type="button" data-mp-causa-agregar>Agregar causa</button></div>'
        :'<p class="mp-sub">Solo el Supervisor de Mantenimiento o el Administrador pueden cambiarlos.</p>')+
      '<div class="mp-msg'+(editor.ok?' ok':'')+'" id="mp-msg" role="status">'+esc(editor.msg||'')+'</div>'+
      '<p class="mp-sub">«Otro» exige un detalle de al menos '+MIN_DETALLE_OTRO+' caracteres al registrar la parada.</p>'+
      '<div class="mp-pie"><button type="button" class="btn btn-primary" data-mp-cerrar>Listo</button></div>';
  }
  async function accion(f,okTxt){
    try{await f();editor.msg=okTxt;editor.ok=true;}
    catch(e){editor.msg=(e&&e.message)||String(e);editor.ok=false;}
    pintarEditor();
  }
  function abrirEditor(){
    estilos();
    if(editor&&document.body.contains(editor.fondo))return;
    const fondo=document.createElement('div');
    fondo.className='mp-fondo';fondo.innerHTML='<div class="mp-modal" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(fondo);
    editor={fondo,causaId:todas()[0].id,msg:'',ok:false};
    fondo.addEventListener('mousedown',e=>{if(e.target===fondo){fondo.remove();editor=null;}});
    fondo.addEventListener('change',e=>{
      const t=e.target;if(!t||!t.id)return;
      if(t.id==='mp-causa'){editor.causaId=t.value;editor.msg='';pintarEditor();}
      else if(t.id==='mp-pide-equipo'){const v=t.checked;accion(()=>cambiarPideEquipo(editor.causaId,v),'Guardado.');}
    });
    fondo.addEventListener('click',e=>{
      const t=e.target;if(!t||!t.closest)return;
      const id=editor.causaId,val=s=>{const el=fondo.querySelector(s);return el?el.value:'';};
      if(t.closest('[data-mp-cerrar]')){fondo.remove();editor=null;return;}
      if(t.closest('[data-mp-causa-guardar]')){accion(()=>renombrarCausa(id,val('#mp-causa-nombre')),'Nombre guardado.');return;}
      const ca=t.closest('[data-mp-causa-activa]');
      if(ca){const v=ca.getAttribute('data-mp-causa-activa')==='1';accion(()=>activarCausa(id,v),v?'Causa activada.':'Causa desactivada.');return;}
      if(t.closest('[data-mp-causa-agregar]')){
        const n=val('#mp-causa-nueva'),eq=!!(fondo.querySelector('#mp-causa-nueva-eq')||{}).checked;
        accion(async()=>{await agregarCausa(n,eq);const c=todas().find(x=>norm(x.nombre)===norm(n));if(c)editor.causaId=c.id;},'Causa agregada.');return;
      }
      if(t.closest('[data-mp-motivo-agregar]')){accion(()=>agregarMotivo(id,val('#mp-motivo-nuevo')),'Motivo agregado.');return;}
      const mg=t.closest('[data-mp-motivo-guardar]');
      if(mg){const mid=mg.getAttribute('data-mp-motivo-guardar'),inp=[...fondo.querySelectorAll('[data-mp-motivo]')].find(x=>x.getAttribute('data-mp-motivo')===mid);
        accion(()=>renombrarMotivo(id,mid,inp?inp.value:''),'Nombre guardado.');return;}
      const ma=t.closest('[data-mp-motivo-activo]');
      if(ma){const mid=ma.getAttribute('data-mp-motivo-activo'),v=ma.getAttribute('data-v')==='1';accion(()=>activarMotivo(id,mid,v),v?'Motivo activado.':'Motivo desactivado.');}
    });
    alCambiar(pintarEditor);
    pintarEditor();
  }

  /* Botón «Motivos de parada» en la barra del módulo de Mantenimiento (junto a «Equipos por línea»). */
  if(typeof tareoRenderTabs==='function'){
    const tabsAnterior=tareoRenderTabs;
    tareoRenderTabs=function(){
      const html=tabsAnterior.apply(this,arguments);
      try{
        if(typeof tareoPestanaEnModulo!=='function'||!tareoPestanaEnModulo('identificacion')||html.indexOf('mant-motivos-tab')>=0)return html;
        const boton='<button type="button" class="tareo-tab mant-motivos-tab" onclick="glacialMotivosParada.abrirEditor()">Motivos de parada</button>';
        return html.replace('</div>',boton+'</div>');
      }catch(_){return html;}
    };
    window.tareoRenderTabs=tareoRenderTabs;
  }

  window.glacialMotivosParada={SEP,MIN_DETALLE_OTRO,PROTEGIDAS,CATALOGO_DEFECTO,causas,todas,causaPorNombre,motivosDe,pideEquipo,exigeDetalle,detalleMin,componerDescripcion,validar,
    opcionesCausa,opcionesMotivo,agregarCausa,renombrarCausa,cambiarPideEquipo,activarCausa,agregarMotivo,renombrarMotivo,activarMotivo,puedeConfigurar,abrirEditor,alCambiar,
    normalizar,estado:()=>({listo,catalogo:catalogo&&JSON.parse(JSON.stringify(catalogo))}),cerrar,escuchar};
})();
