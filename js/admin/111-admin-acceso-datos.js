/* =============================================================
   GLACIAL · PANEL DE ADMINISTRACIÓN · ACCESO, NAVEGACIÓN Y DATOS
   -------------------------------------------------------------
   ACCESO: solo el Administrador (esAdministradorSeguridad), nunca en «Ver como» ni con una cuenta compartida.
     · La entrada del menú NO existe en index.html: se crea aquí solo para el Administrador y se quita al cambiar de cuenta, cerrar sesión o entrar en «Ver como».
     · Quien llegue por consola o por la dirección ve «No tienes acceso» y vuelve al Inicio.
     · En el servidor: la marca adm_panel y la colección adminAuditoria (glacial_59) solo aceptan al Administrador.
   DATOS: todo se lee en vivo (onSnapshot). Usuarios: el mismo caché y las mismas funciones de siempre (loadUsers / saveUsers, que también publican sync/perfiles).
     Auditoría consolidada: lee las que ya existen (auditoriaTareos, apAuditoria, insumosAuditoria, auditoriaRegistros) + adminAuditoria; no las mueve ni las cambia.
   Cada cambio hecho desde el panel deja una fila en adminAuditoria (quién, cuándo, módulo, acción, antes, después y motivo).
   Cargar después de 110-admin-nucleo.js y antes de 112-admin-pantalla.js.
   ============================================================= */
(function(){
  'use strict';
  if(typeof window==='undefined'||!window.document)return;
  const W=window,N=W.glacialAdminNucleo;
  const TAB='admin-panel',LIMITE=200;
  const AUDITORIAS=[['adminAuditoria','guardadoEn'],['auditoriaTareos','timestamp'],['apAuditoria','en'],['insumosAuditoria','en'],['auditoriaRegistros','timestamp']];

  const vistaActiva=()=>!!(W.__vistaComo||(W.glacialVista&&typeof W.glacialVista.activo==='function'&&W.glacialVista.activo()));
  const puede=()=>{try{return typeof state!=='undefined'&&N.puedeAcceder(state.user,vistaActiva())&&(typeof esAdministradorSeguridad!=='function'||esAdministradorSeguridad());}catch(_){return false;}};

  /* ---------- datos en vivo ---------- */
  const D={cache:{},listo:{},error:{},pendientes:[],activo:false};
  let cierres=[];const oyentes=[];
  const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(_){/* una vista no rompe a otra */}});
  function escuchar(){
    if(D.activo||!puede()||typeof db==='undefined')return;
    D.activo=true;
    AUDITORIAS.forEach(([col,campo])=>{
      try{
        cierres.push(db.collection(col).orderBy(campo,'desc').limit(LIMITE).onSnapshot(s=>{
          D.cache[col]=s.docs.map(d=>({id:d.id,data:d.data({serverTimestamps:'estimate'})}));D.listo[col]=true;D.error[col]='';avisar();
        },e=>{D.error[col]=(e&&e.message)||String(e);D.listo[col]=true;avisar();}));
      }catch(e){D.error[col]=(e&&e.message)||String(e);D.listo[col]=true;}
    });
  }
  function detener(){D.activo=false;cierres.forEach(f=>{try{f();}catch(_){/* ya cerrada */}});cierres=[];}
  function limpiar(){detener();D.cache={};D.listo={};D.error={};D.pendientes=[];}
  if(W.glacialCierresSesion)W.glacialCierresSesion.push(()=>{limpiar();quitarMenu();if(W.glacialAdminUI&&W.glacialAdminUI.reiniciar)W.glacialAdminUI.reiniciar();});
  // los usuarios cambian en vivo por el caché de siempre: el panel solo se redibuja
  if(typeof onUsersUpdated==='function'){const o=onUsersUpdated;onUsersUpdated=function(){const r=o.apply(this,arguments);try{avisar();}catch(_){/* informativo */}return r;};}

  /* ---------- auditoría propia del panel ---------- */
  const serverTs=()=>firebase.firestore.FieldValue.serverTimestamp();
  const quien=()=>{const u=(typeof state!=='undefined'&&state.user)||{};let uid='';try{uid=firebase.auth().currentUser.uid;}catch(_){/* sin sesión segura */}return {uid,usuario:u.username||'',usuarioNombre:u.nombre||u.username||'',rol:u.rol||''};};
  const idAud=()=>'ADM_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
  /** entradas: [{modulo, accion, antes, despues, motivo}] → {ok, fallidas}. Las que fallen quedan en D.pendientes para reintentar. */
  async function registrar(entradas){
    if(!puede())return {ok:0,fallidas:entradas.length};
    let ok=0;const fallidas=[];
    for(const e of entradas){
      const id=e.__id||idAud();
      try{
        await db.collection('adminAuditoria').doc(id).set(Object.assign({opId:id},quien(),{modulo:e.modulo,accion:e.accion,antes:e.antes===undefined?null:e.antes,despues:e.despues===undefined?null:e.despues,motivo:String(e.motivo||'').trim()},{guardadoEn:serverTs()}));
        ok++;
      }catch(err){fallidas.push(Object.assign({},e,{__id:id}));}
    }
    D.pendientes=D.pendientes.filter(x=>!entradas.some(e=>e.__id&&e.__id===x.__id)).concat(fallidas);
    avisar();
    return {ok,fallidas:fallidas.length};
  }
  async function reintentarAuditoria(){const p=D.pendientes.slice();D.pendientes=[];return registrar(p);}

  /* ---------- usuarios: guardar fichas con motivo, todo o nada ---------- */
  const clavesPermisos=()=>(typeof PERMISOS_APP!=='undefined'?PERMISOS_APP.map(p=>p.key):[]);
  const etiquetaPermiso=k=>{try{const p=PERMISOS_APP.find(x=>x.key===k);return p?p.label.split(' (')[0]:k;}catch(_){return k;}};
  /** cambios: [{username, base, borrador}] (base = ficha cuando se empezó a editar). Si otro equipo la cambió mientras tanto, no guarda nada. */
  async function guardarUsuarios(cambios,motivo){
    if(!puede())return {ok:false,msg:'No tienes acceso.'};
    const e=N.validarMotivo(motivo);if(e.length)return {ok:false,msg:e.join(' ')};
    if(!cambios.length)return {ok:false,msg:'No hay cambios que guardar.'};
    const claves=clavesPermisos(),actuales=loadUsers().map(u=>({...u})),firma=u=>JSON.stringify(N.borradorDe(u,claves));
    const nuevos=actuales.map(u=>({...u})),entradas=[];
    for(const c of cambios){
      const i=actuales.findIndex(u=>String(u.username)===String(c.username));
      if(i<0)return {ok:false,msg:'«'+c.username+'» ya no existe.',recargar:true};
      if(N.esAdminPrincipal(actuales[i]))return {ok:false,msg:'El Administrador no se modifica desde el panel.'};
      if(firma(actuales[i])!==JSON.stringify(c.base))return {ok:false,msg:'Esto cambió en otro equipo: «'+(actuales[i].nombre||c.username)+'» fue modificado mientras lo editabas. Se volvió a cargar.',recargar:true};
      const d=N.diffUsuario(actuales[i],c.borrador,claves,etiquetaPermiso);
      if(!d.length)continue;
      nuevos[i]=N.aplicarBorrador(actuales[i],c.borrador,typeof ROLES_PLANIFICACION!=='undefined'?ROLES_PLANIFICACION:[]);
      entradas.push({modulo:'Usuarios',accion:'Editó a '+(actuales[i].nombre||c.username)+': '+d.map(x=>x.campo).join(', '),
        antes:d.reduce((o,x)=>(o[x.campo]=x.antes,o),{}),despues:d.reduce((o,x)=>(o[x.campo]=x.despues+(x.agregados&&x.agregados.length?' (+'+x.agregados.join(', ')+')':'')+(x.quitados&&x.quitados.length?' (−'+x.quitados.join(', ')+')':''),o),{}),motivo:motivo});
    }
    if(!entradas.length)return {ok:false,msg:'No hay cambios que guardar.'};
    const guardado=await saveUsers(nuevos);                         // una sola escritura: todo o nada
    if(!guardado)return {ok:false,msg:'No se pudo guardar. No se cambió nada.'};
    const r=await registrar(entradas);
    return {ok:true,cambios:entradas.length,auditoriaPendiente:r.fallidas,msg:entradas.length+(entradas.length===1?' usuario actualizado.':' usuarios actualizados.')+(r.fallidas?' Atención: no se pudo registrar la auditoría de '+r.fallidas+'; reintenta.':'')};
  }

  /* ---------- menú y navegación ---------- */
  const ID_BTN='btn-admin-panel';
  function quitarMenu(){const b=document.getElementById(ID_BTN);if(b)b.remove();}
  function sincronizarMenu(){
    const panel=document.getElementById('sidebar-panel-configuracion');if(!panel)return;
    const b=document.getElementById(ID_BTN);
    if(!puede()){if(b)b.remove();return;}
    if(!b){
      const n=document.createElement('button');
      n.type='button';n.className='side-action sidebar-subaction';n.id=ID_BTN;n.setAttribute('onclick','goAdminPanel()');
      n.innerHTML='<span class="sidebar-dot" aria-hidden="true"></span><span>Panel de Administración</span>';
      panel.insertBefore(n,panel.firstChild);
    }
    const x=document.getElementById(ID_BTN);
    x.classList.toggle('active',state.currentTab===TAB);
    if(state.currentTab===TAB)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current');
  }
  W.goAdminPanel=function(){
    if(!puede()){alert('No tienes acceso al Panel de Administración.');if(typeof abrirCentroPerfil==='function')abrirCentroPerfil();return;}
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    state.currentTab=TAB;state.showWelcome=false;
    if(typeof renderSidebar==='function')renderSidebar();
    if(typeof renderMain==='function')renderMain();
  };
  if(typeof ajustarVistaSegunPermisos==='function'){const a=ajustarVistaSegunPermisos;ajustarVistaSegunPermisos=function(){if(state.currentTab===TAB&&puede())return;return a.apply(this,arguments);};}
  if(typeof renderMain==='function'){
    const a=renderMain;
    renderMain=function(){
      if(state.currentTab===TAB){
        if(!puede()){
          detener();state.currentTab='';
          const m=document.getElementById('main');if(m)m.innerHTML='<div class="panel"><div class="panel-body"><h2>No tienes acceso</h2><p>El Panel de Administración es solo para el Administrador.</p></div></div>';
          setTimeout(()=>{if(typeof abrirCentroPerfil==='function')abrirCentroPerfil();},0);
          return;
        }
        escuchar();
        if(W.glacialAdminUI)W.glacialAdminUI.pintar();
        return;
      }
      detener();                                                                // fuera del panel no se mantienen sus lecturas
      return a.apply(this,arguments);
    };
  }
  if(typeof renderSidebar==='function'){const a=renderSidebar;renderSidebar=function(){const r=a.apply(this,arguments);try{sincronizarMenu();if(typeof actualizarGruposSidebar==='function')actualizarGruposSidebar();}catch(_){/* el menú sigue */}return r;};}
  // cambio de cuenta o «Ver como» sin pasar por renderSidebar: se revisa el menú cuando la ventana vuelve a verse y cada vez que cambia el usuario
  setInterval(()=>{try{const hay=!!document.getElementById(ID_BTN);if(hay!==puede()){sincronizarMenu();if(!puede()&&state.currentTab===TAB&&typeof renderMain==='function')renderMain();}}catch(_){/* informativo */}},1500);

  W.glacialAdminDatos={D,puede,escuchar,detener,suscribir:f=>{oyentes.push(f);return()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};},registrar,reintentarAuditoria,guardarUsuarios,
    AUDITORIAS,clavesPermisos,etiquetaPermiso,sincronizarMenu};
})();
