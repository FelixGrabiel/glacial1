/*
 * BETTER COMMENTS · SIDEBAR GLACIAL
 ! IMPORTANTE: conservar IDs, permisos y funciones de navegación.
 ! NO duplicar listeners ni crear accesos que evadan permisos.
 * Este archivo mantiene la navegación lateral existente.
*/

/* Iconografía SVG de la barra lateral. Mantiene IDs y eventos existentes. */
function sidebarSvg(nombre){
  const paths={
    home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-7h5v7"/>',
    production:'<path d="M4 20V9l5 3V8l5 3V4h6v16Z"/><path d="M8 16h2M13 16h2M18 16h2"/>',
    box:'<path d="m4 7 8-4 8 4-8 4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/>',
    wrench:'<path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L4 17l3 3 8.3-8.3a4 4 0 0 0-.6-5.4Z"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    report:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.3V9.6h.1A1.7 1.7 0 0 0 4.1 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.5 4.1a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2.3h4v.1A1.7 1.7 0 0 0 15 4.1a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 8.5a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4h-.1A1.7 1.7 0 0 0 19.4 15Z"/>',
    clipboard:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M8 10h8M8 14h8"/>',
    chart:'<path d="M4 20V10M10 20V5M16 20v-8M22 20H2"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };
  return `<svg class="sidebar-svg" viewBox="0 0 24 24" aria-hidden="true">${paths[nombre]||paths.clipboard}</svg>`;
}
function sidebarChevronSvg(){
  return '<svg class="sidebar-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5"/></svg>';
}
function refinarIconosSidebar(){
  const iconos={
    'btn-centro-perfil':'home','btn-produccion-actual':'production',
    'btn-avance-produccion':'clock','btn-almacen':'box',
    'btn-mantenimiento':'wrench','btn-rrhh':'users','btn-tareo':'clipboard',
    'btn-rotacion-supervisores':'users','btn-resumen':'report',
    'btn-perdidas':'chart','btn-usuarios':'settings','btn-trabajadores':'users'
  };
  Object.entries(iconos).forEach(([id,nombre])=>{
    const b=document.getElementById(id); if(!b)return;
    const i=b.querySelector('.side-action-icon,.sidebar-group-icon');
    if(i)i.innerHTML=sidebarSvg(nombre);
  });
  document.querySelectorAll('#glacial-sidebar .sidebar-chevron').forEach(el=>{
    el.innerHTML=sidebarChevronSvg();
  });
}

/* =============================================================
   SIDEBAR (LÍNEAS DE PRODUCCIÓN)
   Parte del sistema GLACIAL — dividido a partir de app.js
   ============================================================= */


/* =========================================================
   SIDEBAR
   ========================================================= */

function visibleLines(){
  if(esUsuarioSoloConsulta(state.user))return [];
  if(!puedeVerLineasProduccion())return [];
  if(!['nuevo','historial','graficos','paletas'].some(p=>tienePermiso(p)))return [];
  if(tienePermiso('todasLasLineas'))return LINES;
  if(state.user.linea)return LINES.filter(l=>l.key===state.user.linea);
  return LINES;
}

function lineasConsultables(){
  return esUsuarioSoloConsulta(state.user) ? LINES : visibleLines();
}

/* Los cargos operativos conservan su acceso. Otros usuarios requieren
   el permiso explícito verLineasProduccion, asignado por administración. */
function puedeVerLineasProduccion(){
  if(!state.user)return false;
  if(esUsuarioSoloConsulta(state.user))return false;
  return tienePermiso('verLineasProduccion') || [
    'Supervisor', 'Jefe de Producción', 'Jefe de Operaciones',
    'Gerente General', 'Administrador'
  ].includes(state.user.rol);
}

const PESTANAS_LINEA=['nuevo','historial','graficos','paletas'];

function primeraVistaAutorizada(){
  if(visibleLines().length){
    const pestana=PESTANAS_LINEA.find(p=>tienePermiso(p));
    if(pestana)return pestana;
  }
  const globales=[
    ['__inicio__','centro-perfil'],
    ['produccionActual','produccion-actual'], ['avanceProduccion','avance-produccion'], ['resumen','resumen'],
    ['perdidasSoles','perdidas'], ['moduloMantenimiento','mantenimiento'],
    ['moduloRRHH','rrhh'], ['gestionar_rotacion_supervisores','rotacion-supervisores'], ['tareoProduccion','tareo'],
    ['tareoGeneral','tareo']
  ];
  return globales.find(([permiso])=>tienePermiso(permiso))?.[1] || '';
}

function ajustarVistaSegunPermisos(){
  const globales={
    'centro-perfil':'__inicio__',
    resumen:'resumen',perdidas:'perdidasSoles',
    'produccion-actual':'produccionActual',
    'avance-produccion':'avanceProduccion',
    mantenimiento:'moduloMantenimiento',rrhh:'moduloRRHH',
    'rotacion-supervisores':'gestionar_rotacion_supervisores',
    tareo:'tareoProduccion'
  };
  const tab=state.currentTab;
  const vistaLinea=PESTANAS_LINEA.includes(tab);
  const lineaVisible=visibleLines().some(l=>l.key===state.currentLine);
  const permitido=vistaLinea
    ? lineaVisible && tienePermiso(tab)
    : tab==='tareo'
      ? tienePermiso('tareoProduccion') || tienePermiso('tareoGeneral')
      : tab==='centro-perfil'
        ? true
        : globales[tab] && tienePermiso(globales[tab]);

  if(!permitido)state.currentTab=primeraVistaAutorizada();
  if(visibleLines().length && !lineaVisible){
    state.currentLine=visibleLines()[0].key;
  }
}


function renderSidebar(){

  const list =
    document.getElementById('line-list');


  if(!list)return;
  const lineas=visibleLines();
  const grupoLineas=document.getElementById('sidebar-lines');
  if(grupoLineas){
    grupoLineas.hidden=!lineas.length;
    grupoLineas.style.display=lineas.length?'':'none';
  }
  const separadorLineas=document.getElementById('sidebar-lines-divider');
  if(separadorLineas){
    separadorLineas.hidden=!lineas.length;
    separadorLineas.style.display=lineas.length?'':'none';
  }

  list.innerHTML =

    lineas

      .map(l => `

        <button
          class="line-btn ${
            state.currentLine === l.key &&
            PESTANAS_LINEA.includes(state.currentTab)
              ? 'active'
              : ''
          }"
          onclick="selectLine('${l.key}')"
          ${state.currentLine === l.key && PESTANAS_LINEA.includes(state.currentTab)
            ? 'aria-current="page"' : ''}
        >

          ${l.name}

        </button>

      `)

      .join('');

  const accesosRapidos=document.getElementById('mobile-lines');
  if(accesosRapidos){
    accesosRapidos.hidden=!lineas.length;
    accesosRapidos.innerHTML=lineas.map(l=>`
      <button type="button" class="mobile-line-btn ${
        state.currentLine===l.key && PESTANAS_LINEA.includes(state.currentTab)
          ? 'active' : ''
      }" data-mobile-line="${l.key}" ${
        state.currentLine===l.key && PESTANAS_LINEA.includes(state.currentTab)
          ? 'aria-current="page"' : ''
      }>${l.name}</button>
    `).join('');
  }

  const acciones={
    'btn-centro-perfil':['__inicio__','centro-perfil'],
    'btn-produccion-actual':['produccionActual','produccion-actual'],
    'btn-avance-produccion':['avanceProduccion','avance-produccion'],
    'btn-resumen':['resumen','resumen'],
    'btn-perdidas':['perdidasSoles','perdidas'],
    'btn-mantenimiento':['moduloMantenimiento','mantenimiento'],
    'btn-rrhh':['moduloRRHH','rrhh'],
    'btn-tareo':['tareoProduccion','tareo'],
    'btn-rotacion-supervisores':['gestionar_rotacion_supervisores','rotacion-supervisores'],
    'btn-usuarios':['gestionarPersonal',''],
    'btn-trabajadores':['gestionarPersonal','']
  };
  let visibles=0;
  Object.entries(acciones).forEach(([id,[permiso,vista]])=>{
    const boton=document.getElementById(id);
    if(!boton)return;
    const mostrar=id==='btn-centro-perfil'
      ? !!state.user
      : id==='btn-tareo'
        ? tienePermiso('tareoProduccion') || tienePermiso('tareoGeneral')
        : id==='btn-usuarios'||id==='btn-trabajadores'
          ? puedeGestionarPersonal()
          : tienePermiso(permiso);
    boton.hidden=!mostrar;
    boton.style.display=mostrar?'':'none';
    if(mostrar)visibles++;
    const activo=mostrar && !!vista && state.currentTab===vista;
    boton.classList.toggle('active',activo);
    if(activo)boton.setAttribute('aria-current','page');
    else boton.removeAttribute('aria-current');
  });
  const almacen=document.getElementById('btn-almacen');
  if(almacen){
    // Almacén continúa siendo una referencia visual, no crea una pantalla nueva.
    const mostrarAlmacen=!!state.user;
    almacen.hidden=!mostrarAlmacen;
    almacen.style.display=mostrarAlmacen?'':'none';
  }

  actualizarGruposSidebar();
}

/* =========================================================
   MENÚ POR MÓDULOS / DESPLEGABLES
   Solo organiza accesos existentes. No concede permisos.
   ========================================================= */

const SIDEBAR_GROUP_STORAGE='glacial.sidebar.groups.v1';
let sidebarGruposAbiertos=new Set();

function cargarEstadoGruposSidebar(){
  try{
    const guardados=JSON.parse(sessionStorage.getItem(SIDEBAR_GROUP_STORAGE)||'[]');
    sidebarGruposAbiertos=new Set(Array.isArray(guardados)?guardados:[]);
  }catch(_){
    sidebarGruposAbiertos=new Set();
  }
}

function guardarEstadoGruposSidebar(){
  try{
    sessionStorage.setItem(SIDEBAR_GROUP_STORAGE,JSON.stringify([...sidebarGruposAbiertos]));
  }catch(_){/* sessionStorage puede estar bloqueado; el menú sigue funcionando */}
}

function grupoSidebarActivo(){
  if(PESTANAS_LINEA.includes(state.currentTab) || ['produccion-actual','avance-produccion'].includes(state.currentTab))return 'produccion';
  if(state.currentTab==='mantenimiento')return 'mantenimiento';
  if(['rrhh','tareo','rotacion-supervisores'].includes(state.currentTab))return 'rrhh';
  if(['resumen','perdidas'].includes(state.currentTab))return 'reportes';
  return '';
}

function grupoTieneAccesosVisibles(grupo){
  if(!grupo)return false;
  if(grupo.dataset.sidebarGroup==='produccion'){
    const lineas=document.getElementById('sidebar-lines');
    if(lineas && !lineas.hidden && lineas.style.display!=='none')return true;
  }
  return [...grupo.querySelectorAll('.side-action')].some(b=>!b.hidden && b.style.display!=='none');
}

function aplicarEstadoGrupoSidebar(nombre,abierto){
  const grupo=document.querySelector(`[data-sidebar-group="${nombre}"]`);
  const boton=document.querySelector(`[data-sidebar-toggle="${nombre}"]`);
  const panel=document.getElementById(`sidebar-panel-${nombre}`);
  if(!grupo||!boton||!panel)return;
  grupo.classList.toggle('is-open',abierto);
  boton.setAttribute('aria-expanded',abierto?'true':'false');
  panel.hidden=!abierto;
}

function alternarGrupoSidebar(nombre){
  const abierto=sidebarGruposAbiertos.has(nombre);
  if(abierto)sidebarGruposAbiertos.delete(nombre);
  else sidebarGruposAbiertos.add(nombre);
  aplicarEstadoGrupoSidebar(nombre,!abierto);
  guardarEstadoGruposSidebar();
}

function actualizarGruposSidebar(){
  const activo=grupoSidebarActivo();
  if(activo)sidebarGruposAbiertos.add(activo);

  document.querySelectorAll('.sidebar-group[data-sidebar-group]').forEach(grupo=>{
    const nombre=grupo.dataset.sidebarGroup;
    const visible=grupoTieneAccesosVisibles(grupo);
    grupo.hidden=!visible;
    grupo.style.display=visible?'':'none';
    grupo.classList.toggle('has-active',nombre===activo);
    if(!visible)return;
    aplicarEstadoGrupoSidebar(nombre,sidebarGruposAbiertos.has(nombre));
  });

  // Registro de producción es un subgrupo y se mantiene abierto cuando se trabaja en una línea.
  const registro=document.querySelector('[data-sidebar-toggle="registro-produccion"]');
  const panelRegistro=document.getElementById('sidebar-panel-registro-produccion');
  if(registro&&panelRegistro){
    const forzar=PESTANAS_LINEA.includes(state.currentTab);
    const abierto=forzar || sidebarGruposAbiertos.has('registro-produccion');
    registro.setAttribute('aria-expanded',abierto?'true':'false');
    panelRegistro.hidden=!abierto;
    registro.closest('.sidebar-subgroup')?.classList.toggle('is-open',abierto);
  }
  guardarEstadoGruposSidebar();
}

function manejarToggleSidebar(evento){
  const boton=evento.target.closest('[data-sidebar-toggle]');
  if(!boton)return false;
  const nombre=boton.dataset.sidebarToggle;
  if(nombre==='registro-produccion'){
    const panel=document.getElementById('sidebar-panel-registro-produccion');
    const abierto=boton.getAttribute('aria-expanded')==='true';
    boton.setAttribute('aria-expanded',abierto?'false':'true');
    if(panel)panel.hidden=abierto;
    boton.closest('.sidebar-subgroup')?.classList.toggle('is-open',!abierto);
    if(abierto)sidebarGruposAbiertos.delete(nombre); else sidebarGruposAbiertos.add(nombre);
    guardarEstadoGruposSidebar();
  }else{
    alternarGrupoSidebar(nombre);
  }
  return true;
}

cargarEstadoGruposSidebar();

/* Menú de teléfono: conserva los mismos botones y permisos del escritorio. */
function cerrarMenuMovil(){
  document.body.classList.remove('mobile-nav-open');
  const boton=document.getElementById('mobile-menu-toggle');
  const sidebar=document.getElementById('glacial-sidebar');
  if(boton)boton.setAttribute('aria-expanded','false');
  if(sidebar){
    sidebar.inert=window.matchMedia('(max-width:700px)').matches;
    sidebar.setAttribute('aria-hidden',sidebar.inert?'true':'false');
  }
}

function alternarMenuMovil(){
  if(!window.matchMedia('(max-width:700px)').matches)return;
  if(document.body.classList.contains('mobile-nav-open')){
    cerrarMenuMovil();
    return;
  }
  const sidebar=document.getElementById('glacial-sidebar');
  document.body.classList.add('mobile-nav-open');
  document.getElementById('mobile-menu-toggle')?.setAttribute('aria-expanded','true');
  if(sidebar){
    sidebar.inert=false;
    sidebar.setAttribute('aria-hidden','false');
    sidebar.querySelector('button:not([hidden])')?.focus();
  }
}

function iniciarMenuMovil(){
  const sidebar=document.getElementById('glacial-sidebar');
  sidebar?.addEventListener('click',evento=>{
    // Abrir/cerrar un grupo NO debe cerrar el panel móvil.
    if(manejarToggleSidebar(evento))return;
    const boton=evento.target.closest('button');
    if(boton && !boton.disabled)cerrarMenuMovil();
  });
  document.getElementById('mobile-lines')?.addEventListener('click',evento=>{
    const linea=evento.target.closest('[data-mobile-line]');
    if(linea)selectLine(linea.dataset.mobileLine);
  });
  document.addEventListener('keydown',evento=>{
    if(evento.key==='Escape' && document.body.classList.contains('mobile-nav-open')){
      cerrarMenuMovil();
      document.getElementById('mobile-menu-toggle')?.focus();
    }
  });
  window.addEventListener('resize',cerrarMenuMovil);
  cerrarMenuMovil();
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',iniciarMenuMovil,{once:true});
}else{
  iniciarMenuMovil();
}
window.alternarMenuMovil=alternarMenuMovil;
window.cerrarMenuMovil=cerrarMenuMovil;


function selectLine(key){

  if(!visibleLines().some(linea=>linea.key===key))return;

  const pestana=PESTANAS_LINEA.find(p=>tienePermiso(p));
  if(!pestana)return;

  if(
    typeof confirmarAbandonoRotacionPendiente === 'function' &&
    !confirmarAbandonoRotacionPendiente()
  ){
    return;
  }

  state.currentLine = key;

  state.currentTab = pestana;

  state.viewingRecordId = null;

  draft = null;

  renderSidebar();

  renderMain();

}


function abrirCentroPerfil(){
  if(!state.user)return;
  state.showWelcome=false;
  state.currentTab='centro-perfil';
  if(typeof renderSidebar==='function')renderSidebar();
  renderMain();
}

function goResumen(){
  if(!tienePermiso('resumen')){
    alert('No tienes permiso para ver Resumen / Reportes.');
    return;
  }
  if(
    typeof confirmarAbandonoRotacionPendiente === 'function' &&
    !confirmarAbandonoRotacionPendiente()
  ){
    return;
  }
  state.currentTab='resumen';
  renderSidebar();
  renderMain();
}


/*
   "Impacto Económico" (antes "Pérdidas en S/.") — igual que
   goResumen(), pero con su propio permiso ('perdidasSoles')
   para que el Administrador decida por separado quién ve
   este reporte de dinero.
*/
function goPerdidasSoles(){
  if(!tienePermiso('perdidasSoles')){
    alert('No tienes permiso para ver Impacto Económico.');
    return;
  }
  if(
    typeof confirmarAbandonoRotacionPendiente === 'function' &&
    !confirmarAbandonoRotacionPendiente()
  ){
    return;
  }
  state.currentTab='perdidas';
  renderSidebar();
  renderMain();
}



function goAvanceProduccion(){
  if(!tienePermiso('avanceProduccion')){
    alert('No tienes permiso para ver Avance y Cierre de Turno.');
    return;
  }
  if(
    typeof confirmarAbandonoRotacionPendiente === 'function' &&
    !confirmarAbandonoRotacionPendiente()
  ){
    return;
  }
  state.currentTab='avance-produccion';
  renderSidebar();
  renderMain();
}


/*
   "Producción Actual" — pestaña de solo lectura pensada para
   Ventas: a diferencia de la pestaña "Paletas" (que vive
   DENTRO de cada línea y muestra solo la línea seleccionada),
   esta junta en una sola vista lo que cada supervisor va
   registrando en "Paletas" de TODAS las líneas a la vez, con
   su propio permiso ('produccionActual') para que el
   Administrador decida por separado quién la ve — igual que
   goResumen()/goPerdidasSoles().
*/
function goProduccionActual(){
  if(!tienePermiso('produccionActual')){
    alert('No tienes permiso para ver Producción Actual.');
    return;
  }
  if(
    typeof confirmarAbandonoRotacionPendiente === 'function' &&
    !confirmarAbandonoRotacionPendiente()
  ){
    return;
  }
  state.currentTab='produccion-actual';
  renderSidebar();
  renderMain();
}


/*
   "Mantenimiento" — punto de entrada al módulo dedicado al
   área de Mantenimiento (18-mantenimiento.js). Por ahora ese
   módulo solo tiene el Tareo de Mantenimiento, pero vivirá
   aquí todo lo demás que se agregue después para esa área.
   Requiere el permiso 'moduloMantenimiento' que el
   Administrador asigna aparte, igual que produccionActual.
*/
function goMantenimiento(){
  if(!tienePermiso('moduloMantenimiento')){
    alert('No tienes permiso para ver el módulo de Mantenimiento.');
    return;
  }
  if(
    typeof confirmarAbandonoRotacionPendiente === 'function' &&
    !confirmarAbandonoRotacionPendiente()
  ){
    return;
  }
  state.currentTab='mantenimiento';
  if(esUsuarioSoloConsulta(state.user) && typeof tareoGeneralFiltros!=='undefined'){
    tareoGeneralFiltros.area='Mantenimiento';
  }
  renderSidebar();
  renderMain();
}


/*
   "RRHH" — punto de entrada al módulo de Recursos Humanos
   (19-rrhh.js): Tareo, Tareo General, Historial y Resumen
   mensual de ambas áreas, con edición y eliminación. Requiere
   el permiso 'moduloRRHH', igual de independiente que
   'moduloMantenimiento'.
*/
function goRRHH(){
  if(!tienePermiso('moduloRRHH')){
    alert('No tienes permiso para ver el módulo de RRHH.');
    return;
  }
  if(
    typeof confirmarAbandonoRotacionPendiente === 'function' &&
    !confirmarAbandonoRotacionPendiente()
  ){
    return;
  }
  state.currentTab='rrhh';
  if(esUsuarioSoloConsulta(state.user) && typeof tareoGeneralFiltros!=='undefined'){
    tareoGeneralFiltros.area='';
  }
  renderSidebar();
  renderMain();
}

function goRotacionSupervisores(){
  if(!tienePermiso('gestionar_rotacion_supervisores')){
    alert('No tienes permiso para gestionar la rotación de supervisores.');
    return;
  }
  state.currentTab='rotacion-supervisores';
  renderSidebar();
  renderMain();
}

function goTareo(){
  if(!tienePermiso('tareoProduccion') && !tienePermiso('tareoGeneral'))return;
  if(typeof confirmarAbandonoRotacionPendiente==='function' &&
     !confirmarAbandonoRotacionPendiente())return;
  state.currentTab='tareo';
  renderSidebar();
  openTareo();
}
