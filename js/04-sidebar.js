/* =============================================================
   SIDEBAR (LÍNEAS DE PRODUCCIÓN)
   Parte del sistema GLACIAL — dividido a partir de app.js
   ============================================================= */


/* =========================================================
   SIDEBAR
   ========================================================= */

function visibleLines(){
  if(!puedeVerLineasProduccion())return [];
  if(!['nuevo','historial','graficos','paletas'].some(p=>tienePermiso(p)))return [];
  if(tienePermiso('todasLasLineas'))return LINES;
  if(state.user.linea)return LINES.filter(l=>l.key===state.user.linea);
  return LINES;
}

/* Los cargos operativos conservan su acceso. Otros usuarios requieren
   el permiso explícito verLineasProduccion, asignado por administración. */
function puedeVerLineasProduccion(){
  if(!state.user)return false;
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
    ['moduloRRHH','rrhh'], ['moduloMantenimiento','mantenimiento'],
    ['produccionActual','produccion-actual'], ['resumen','resumen'],
    ['perdidasSoles','perdidas'], ['tareoProduccion','tareo'],
    ['tareoGeneral','tareo']
  ];
  return globales.find(([permiso])=>tienePermiso(permiso))?.[1] || '';
}

function ajustarVistaSegunPermisos(){
  const globales={
    resumen:'resumen',perdidas:'perdidasSoles',
    'produccion-actual':'produccionActual',
    mantenimiento:'moduloMantenimiento',rrhh:'moduloRRHH',
    tareo:'tareoProduccion'
  };
  const tab=state.currentTab;
  const vistaLinea=PESTANAS_LINEA.includes(tab);
  const lineaVisible=visibleLines().some(l=>l.key===state.currentLine);
  const permitido=vistaLinea
    ? lineaVisible && tienePermiso(tab)
    : tab==='tareo'
      ? tienePermiso('tareoProduccion') || tienePermiso('tareoGeneral')
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
  if(grupoLineas)grupoLineas.hidden=!lineas.length;

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

  const acciones={
    'btn-resumen':['resumen','resumen'],
    'btn-tareo':['tareoProduccion','tareo'],
    'btn-perdidas':['perdidasSoles','perdidas'],
    'btn-produccion-actual':['produccionActual','produccion-actual'],
    'btn-mantenimiento':['moduloMantenimiento','mantenimiento'],
    'btn-rrhh':['moduloRRHH','rrhh'],
    'btn-usuarios':['usuarios',''],
    'btn-trabajadores':['trabajadores','']
  };
  let visibles=0;
  Object.entries(acciones).forEach(([id,[permiso,vista]])=>{
    const boton=document.getElementById(id);
    if(!boton)return;
    const mostrar=id==='btn-tareo'
      ? tienePermiso('tareoProduccion') || tienePermiso('tareoGeneral')
      : id==='btn-usuarios'
        ? tienePermiso('usuarios') || tienePermiso('gestionarUsuarios')
        : tienePermiso(permiso);
    boton.hidden=!mostrar;
    boton.style.display=mostrar?'':'none';
    if(mostrar)visibles++;
    const activo=mostrar && !!vista && state.currentTab===vista;
    boton.classList.toggle('active',activo);
    if(activo)boton.setAttribute('aria-current','page');
    else boton.removeAttribute('aria-current');
  });
  const gestion=document.getElementById('sidebar-management');
  if(gestion)gestion.hidden=!visibles;

}


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
