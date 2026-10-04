/* =============================================================
   GLACIAL · VISTA COMO (solo Administrador)
   -------------------------------------------------------------
   Permite al Administrador ver la aplicación tal como la ve otro
   usuario (RRHH, Jefatura, Gerente, Supervisor, Mantenimiento...)
   sin iniciar sesión con la cuenta de esa persona.

   - Botón "👁 Ver como" en la barra superior (solo Administrador real).
   - Se elige un usuario existente (exacto: usa sus permisos guardados)
     o un perfil estándar por cargo (aproximado, si no hay usuario).
   - Mientras dura la vista TODO es SOLO LECTURA: se bloquean las
     escrituras a Firestore y los envíos a Google Sheets, aunque ese
     usuario tenga permiso de editar. Nada se guarda ni se envía.
   - Una barra flotante indica quién se está viendo y permite salir.
   - No cambia la sesión de Firebase ni lo guardado en sessionStorage:
     si se recarga la página, se vuelve a la cuenta del Administrador.

   Cargar DESPUÉS de 37b-mantenimiento-identificacion.js;
   ANTES de 12-init.js. No crea documentos en Firestore.
   ============================================================= */
(function instalarVistaComo(){
  'use strict';

  let real=null;   // Administrador real mientras dura la vista

  const MSG_BLOQUEO='Modo "Ver como": es solo lectura, no se guarda nada.';
  const esc=t=>typeof escaparHTML==='function'
    ? escaparHTML(t)
    : String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* Perfiles estándar para cargos sin usuarios creados (aproximados). */
  const PERFILES=[
    {rol:'Gerente General',permisos:()=>typeof PERMISOS_SOLO_CONSULTA!=='undefined'?[...PERMISOS_SOLO_CONSULTA]:undefined},
    {rol:'Jefe de Operaciones',permisos:()=>typeof PERMISOS_SOLO_CONSULTA!=='undefined'?[...PERMISOS_SOLO_CONSULTA]:undefined},
    {rol:'Jefe de Producción',permisos:()=>typeof PERMISOS_SOLO_CONSULTA!=='undefined'?[...PERMISOS_SOLO_CONSULTA,'inicioOperativo']:undefined},
    {rol:'Supervisor',permisos:()=>undefined},
    {rol:'Mantenimiento',permisos:()=>['moduloMantenimiento','produccionActual','control_operativo_lineas']},
    {rol:'mantenimiento_compartido',etiqueta:'Mantenimiento · cuenta compartida',permisos:()=>undefined},
    {rol:'RRHH',permisos:()=>['moduloRRHH','tareoGeneral']},
    {rol:'Ventas',permisos:()=>['produccionActual']},
    {rol:'Planificación',permisos:()=>['produccionActual']},
    {rol:'Ventas y Planificación',permisos:()=>['produccionActual']}
  ];

  const enVista=()=>!!window.__vistaComo;
  const adminReal=()=>{
    const u=real||(typeof state!=='undefined'?state.user:null);
    return !!u&&!u.__vista&&String(u.rol||'').trim()==='Administrador';
  };

  /* ---------- bloqueo de escrituras mientras dura la vista ---------- */
  function instalarBloqueo(){
    try{
      const F=firebase.firestore;
      const envolver=(proto,nombre)=>{
        const original=proto&&proto[nombre];
        if(typeof original!=='function'||original.__vistaComo)return;
        const nuevo=function(){
          if(enVista())return Promise.reject(new Error(MSG_BLOQUEO));
          return original.apply(this,arguments);
        };
        nuevo.__vistaComo=true;
        proto[nombre]=nuevo;
      };
      ['set','update','delete'].forEach(m=>envolver(F.DocumentReference.prototype,m));
      envolver(F.CollectionReference.prototype,'add');
      envolver(F.WriteBatch.prototype,'commit');
      envolver(F.Firestore.prototype,'runTransaction');
    }catch(e){console.warn('Ver como: no se pudo instalar el bloqueo de escritura',e);}
    if(typeof window.fetch==='function'&&!window.fetch.__vistaComo){
      const original=window.fetch.bind(window);
      const nuevo=function(url){
        const destino=typeof url==='string'?url:(url&&url.url)||'';
        if(enVista()&&typeof SHEETS_URL!=='undefined'&&SHEETS_URL&&destino.indexOf(SHEETS_URL)===0)
          return Promise.reject(new Error(MSG_BLOQUEO));
        return original.apply(null,arguments);
      };
      nuevo.__vistaComo=true;
      window.fetch=nuevo;
    }
  }
  instalarBloqueo();

  /* ---------- barra flotante ---------- */
  function pintarBarra(){
    let b=document.getElementById('vista-como-barra');
    if(!enVista()){b?.remove();return;}
    if(!b){
      b=document.createElement('div');
      b.id='vista-como-barra';
      b.style.cssText='position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99998;'+
        'background:#7a2e00;color:#fff;border-radius:999px;padding:8px 8px 8px 16px;font:700 13px system-ui,Arial,sans-serif;'+
        'box-shadow:0 6px 22px rgba(0,0,0,.35);display:flex;gap:10px;align-items:center;max-width:94vw;';
      document.body.appendChild(b);
    }
    const v=window.__vistaComo;
    b.innerHTML='<span>👁 Viendo como <u>'+esc(v.nombre)+'</u> · '+esc(v.rol)+' · solo lectura</span>'+
      '<button type="button" id="vista-como-cambiar" style="border:0;border-radius:999px;padding:6px 12px;font-weight:800;cursor:pointer;background:#ffd9b8;color:#5a2300;">Cambiar</button>'+
      '<button type="button" id="vista-como-salir" style="border:0;border-radius:999px;padding:6px 12px;font-weight:800;cursor:pointer;background:#fff;color:#7a2e00;">Salir</button>';
    b.querySelector('#vista-como-salir').onclick=salirVistaComo;
    b.querySelector('#vista-como-cambiar').onclick=abrirSelector;
  }

  /* ---------- entrar y salir ---------- */
  function irAlSistema(){
    if(typeof goReporteAgua==='function')goReporteAgua();
  }
  function entrar(clave){
    const usuarios=(typeof loadUsers==='function'?loadUsers():[])||[];
    let objetivo=null;
    if(clave.indexOf('u:')===0){
      const u=usuarios.find(x=>String(x.username)===clave.slice(2));
      if(u){
        objetivo=JSON.parse(JSON.stringify(u));
        ['password','clave','pass','pin','authEmail','authUid'].forEach(k=>{delete objetivo[k];});
      }
    }else if(clave.indexOf('r:')===0){
      const p=PERFILES.find(x=>x.rol===clave.slice(2));
      if(p){
        const permisos=p.permisos();
        objetivo={username:'__vista__',nombre:p.etiqueta||p.rol,rol:p.rol,puesto:p.etiqueta||p.rol,linea:''};
        if(permisos)objetivo.permisos=permisos;
      }
    }
    if(!objetivo){alert('No se pudo preparar esa vista.');return;}
    if(!real)real=state.user;
    objetivo.__vista=true;
    window.__vistaComo={nombre:objetivo.nombre||objetivo.username,rol:objetivo.puesto||objetivo.rol};
    state.user=objetivo;
    if(objetivo.rol==='Supervisor'&&objetivo.linea)state.currentLine=objetivo.linea;
    if(typeof closeModal==='function')closeModal();
    enterApp();
    irAlSistema();
    pintarBarra();
    pintarBoton();
  }
  function salirVistaComo(){
    if(!enVista())return;
    state.user=real;
    real=null;
    delete window.__vistaComo;
    enterApp();
    irAlSistema();
    pintarBarra();
    pintarBoton();
  }
  window.salirVistaComo=salirVistaComo;

  /* ---------- selector ---------- */
  function abrirSelector(){
    if(!adminReal()){alert('Solo el Administrador puede usar "Ver como".');return;}
    const root=document.getElementById('modal-root');
    if(!root)return;
    const usuarios=((typeof loadUsers==='function'?loadUsers():[])||[])
      .filter(u=>u&&u.username&&String(u.rol||'').trim()!=='Administrador');
    const porRol=new Map();
    usuarios.forEach(u=>{
      const r=u.rol||'Sin rol';
      if(!porRol.has(r))porRol.set(r,[]);
      porRol.get(r).push(u);
    });
    const grupos=[...porRol.entries()].sort((a,b)=>a[0].localeCompare(b[0],'es')).map(([rol,lista])=>
      '<optgroup label="'+esc(rol)+'">'+lista
        .sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),'es'))
        .map(u=>'<option value="u:'+esc(u.username)+'">'+esc(u.nombre||u.username)+(u.puesto&&u.puesto!==rol?' — '+esc(u.puesto):'')+'</option>').join('')+
      '</optgroup>').join('');
    const perfiles=PERFILES.map(p=>'<option value="r:'+esc(p.rol)+'">'+esc(p.etiqueta||p.rol)+'</option>').join('');
    root.innerHTML=
      '<div class="modal-backdrop" onclick="if(event.target===this)closeModal()">'+
        '<div class="modal" style="max-width:480px;width:96%;">'+
          '<div class="modal-head"><h3>Ver como otro usuario</h3><button class="modal-close" onclick="closeModal()">✕</button></div>'+
          '<div class="modal-body">'+
            '<p class="small-muted">Verás la aplicación como la ve esa persona, <strong>solo en lectura</strong>: no se guarda ni se envía nada. Tu sesión de Administrador no cambia.</p>'+
            '<div class="field-sm"><label>Usuario o perfil</label>'+
              '<select id="vista-como-sel">'+
                (grupos?'<option value="">Elige un usuario o perfil...</option>'+grupos:'<option value="">Elige un perfil...</option>')+
                '<optgroup label="Perfiles estándar (aproximados, sin usuario)">'+perfiles+'</optgroup>'+
              '</select></div>'+
            '<p class="small-muted">Con un usuario real la vista es exacta (usa sus permisos guardados). Los perfiles estándar son una aproximación.</p>'+
            '<div class="actions-row"><button class="btn btn-primary" id="vista-como-ir">Ver</button></div>'+
          '</div>'+
        '</div>'+
      '</div>';
    document.getElementById('vista-como-ir').onclick=()=>{
      const v=document.getElementById('vista-como-sel').value;
      if(!v){alert('Elige a quién quieres ver.');return;}
      entrar(v);
    };
  }
  window.abrirVistaComo=abrirSelector;

  /* ---------- botón en la barra superior ---------- */
  function pintarBoton(){
    const cont=document.querySelector('.topbar-right');
    if(!cont)return;
    let b=document.getElementById('btn-vista-como');
    if(!adminReal()){b?.remove();return;}
    if(!b){
      b=document.createElement('button');
      b.id='btn-vista-como';b.type='button';b.className='btn btn-ghost btn-sm';
      b.style.cssText='margin-right:8px;white-space:nowrap;';
      b.textContent='👁 Ver como';
      b.onclick=abrirSelector;
      cont.insertBefore(b,cont.firstChild);
    }
  }
  if(typeof renderSidebar==='function'){
    const anterior=renderSidebar;
    renderSidebar=function(){
      const r=anterior.apply(this,arguments);
      try{pintarBoton();pintarBarra();}catch(_){/* no crítico */}
      return r;
    };
    window.renderSidebar=renderSidebar;
  }
  if(typeof handleLogout==='function'){
    const anterior=handleLogout;
    handleLogout=function(){
      if(enVista()){state.user=real;real=null;delete window.__vistaComo;}
      const r=anterior.apply(this,arguments);
      pintarBarra();
      return r;
    };
    window.handleLogout=handleLogout;
  }
})();
