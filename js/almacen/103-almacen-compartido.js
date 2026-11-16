/* =============================================================
   GLACIAL · ALMACÉN — CUENTA COMPARTIDA DE ALMACENEROS (rol `almacen_compartido`)
   -------------------------------------------------------------
   Una única cuenta, usada por los almaceneros desde varios equipos (como la de Mantenimiento). Cada persona se identifica con su PIN (102-almaceneros-pin.js).
   · Solo ve y usa «Almacén › Producto terminado» (recibir las paletas que anota Producción). Ningún otro módulo aparece en el menú, entra directo a esa pantalla
     (sin la selección de reporte) y no ve Inicio, Hielo ni «Ver como».
   · Permiso fijo: «moduloAlmacen» (más los que el Administrador agregue, salvo gestionarPersonal y administracion). NO hace entregas de insumos: eso lo hacen usuarios con su propio acceso.
   · La restricción es REAL en el servidor (glacial_57): solo lee sync/{accesos, paletas, users, workers}, almacenPtRecepcion y almaceneros, y solo escribe recepciones válidas y
     los campos del PIN. Esta pantalla solo la esconde; el servidor la hace cumplir.
   Cargar DESPUÉS de 102-almaceneros-pin.js y de 10-usuarios.js; ANTES de 12-init.js.
   ============================================================= */
(function(raiz){
  'use strict';
  const ROL='almacen_compartido';
  const PERMISOS=['moduloAlmacen'];
  const NUCLEO={ROL,PERMISOS,
    esCompartido:u=>!!u&&String(u.rol||'').trim()===ROL,
    permisosEfectivos:u=>[...new Set([...PERMISOS,...(Array.isArray(u&&u.permisos)?u.permisos.filter(p=>p!=='gestionarPersonal'&&p!=='administracion'&&!String(p).startsWith('-')):[])])]};
  if(typeof module!=='undefined'&&module.exports)module.exports=NUCLEO;
  if(typeof window==='undefined'||!window.document)return;
  const W=window;
  W.ROL_ALMACEN_COMPARTIDO=ROL;W.PERMISOS_ALMACEN_COMPARTIDO=PERMISOS;
  W.esAlmacenCompartido=function(usuario){const u=usuario||(typeof state!=='undefined'?state.user:null);return NUCLEO.esCompartido(u);};

  /* 1) Permisos efectivos del rol. */
  if(typeof normalizarPermisosUsuario==='function'){
    const anterior=normalizarPermisosUsuario;
    normalizarPermisosUsuario=function(usuario){
      if(!W.esAlmacenCompartido(usuario))return anterior.apply(this,arguments);
      return NUCLEO.permisosEfectivos(usuario);
    };
  }
  /* 2) Alta de la cuenta: al elegir el rol solo se marca su permiso. */
  if(typeof cambiarRolNuevoUsuario==='function'){
    const anterior=cambiarRolNuevoUsuario;
    cambiarRolNuevoUsuario=function(){
      const r=anterior.apply(this,arguments);
      if(document.getElementById('nu-rol')?.value!==ROL)return r;
      document.querySelectorAll('.permiso-check').forEach(c=>{c.checked=PERMISOS.includes(c.value);c.disabled=false;});
      const todos=document.getElementById('nu-permisos-todos');if(todos){todos.checked=false;todos.disabled=false;}
      return r;
    };
    W.cambiarRolNuevoUsuario=cambiarRolNuevoUsuario;
  }
  /* 3) Sin Inicio ni accesos ajenos. */
  if(typeof abrirCentroPerfil==='function'){
    const anterior=abrirCentroPerfil;
    abrirCentroPerfil=function(){if(W.esAlmacenCompartido())return;return anterior.apply(this,arguments);};
    W.abrirCentroPerfil=abrirCentroPerfil;
  }
  if(typeof ajustarVistaSegunPermisos==='function'){
    const a=ajustarVistaSegunPermisos;
    ajustarVistaSegunPermisos=function(){if(W.esAlmacenCompartido()){state.currentTab='almacen-pt';return;}return a.apply(this,arguments);};
  }
  /* 4) Entra directo a Producto terminado (sin selección de reporte) y debe identificarse. */
  const entrar=()=>{
    if(!W.esAlmacenCompartido()||!state.user)return;
    document.body.classList.add('alm-compartido');
    const sel=document.getElementById('report-select-screen'),app=document.getElementById('app-screen');
    if(sel)sel.style.display='none';if(app)app.style.display='block';
    state.showWelcome=false;state.currentTab='almacen-pt';
    if(W.glacialAlmaceneros&&!W.glacialAlmaceneros.activa())W.glacialAlmaceneros.abrirIdentificacion();
  };
  if(typeof enterApp==='function'){
    const anterior=enterApp;
    enterApp=function(){const r=anterior.apply(this,arguments);try{entrar();if(typeof renderSidebar==='function')renderSidebar();if(typeof renderMain==='function')renderMain();}catch(e){console.warn('Almacén compartido:',e&&e.message||e);}return r;};
    W.enterApp=enterApp;
  }
  if(typeof renderMain==='function'){
    const a=renderMain;
    renderMain=function(){if(W.esAlmacenCompartido()&&state.user&&state.currentTab!=='almacen-pt')state.currentTab='almacen-pt';return a.apply(this,arguments);};
  }
  /* 5) Menú: solo «Almacén › Producto terminado». */
  if(typeof renderSidebar==='function'){
    const a=renderSidebar;
    renderSidebar=function(){
      const r=a.apply(this,arguments);
      const compartida=W.esAlmacenCompartido();
      document.body.classList.toggle('alm-compartido',!!compartida);
      if(!compartida)return r;
      const sb=document.getElementById('glacial-sidebar');if(!sb)return r;
      sb.querySelectorAll('.side-action,.sidebar-root-action').forEach(b=>{if(b.id!=='btn-almacen-pt'){b.hidden=true;b.style.display='none';}});
      sb.querySelectorAll('.sidebar-group').forEach(g=>{if(g.id!=='sidebar-group-almacen'){g.hidden=true;g.style.display='none';}});
      ['sidebar-lines','sidebar-lines-divider','mobile-lines'].forEach(id=>{const e=document.getElementById(id);if(e){e.hidden=true;e.style.display='none';}});
      return r;
    };
  }
  const css=document.createElement('style');
  css.textContent='body.alm-compartido .topbar-hielo,body.alm-compartido #btn-ver-como,body.alm-compartido .topbar-ver-como{display:none!important}body.alm-compartido #glacial-sidebar .sidebar-group-toggle{pointer-events:none}';
  document.head.appendChild(css);
  /* Cambiar de almacenero / salir: botón en la barra superior. */
  function insignia(){
    const cont=document.querySelector('.topbar-title');if(!cont)return;
    let b=document.getElementById('alm-persona');
    if(!W.esAlmacenCompartido()){if(b)b.remove();return;}
    const p=W.glacialAlmaceneros?W.glacialAlmaceneros.activa():null;
    if(!b){b=document.createElement('button');b.type='button';b.id='alm-persona';b.style.cssText='margin-left:10px;min-height:44px;padding:0 12px;border-radius:10px;border:1px solid #9fd0e6;background:#fff;color:#0877a6;font:inherit;font-weight:700;cursor:pointer';
      b.onclick=()=>{if(W.glacialAlmaceneros){W.glacialAlmaceneros.cerrarIdentificacion();W.glacialAlmaceneros.abrirIdentificacion();}};cont.appendChild(b);}
    b.textContent=p?'👤 '+p.nombre+' · cambiar':'Identificarme';
  }
  setInterval(()=>{try{insignia();}catch(_){/* informativo */}},2000);
  if(W.glacialAlmaceneros)W.glacialAlmaceneros.alCambiar(()=>{try{insignia();if(typeof renderMain==='function'&&typeof state!=='undefined'&&state.currentTab==='almacen-pt')renderMain();}catch(_){/* informativo */}});
})(typeof window!=='undefined'?window:globalThis);
