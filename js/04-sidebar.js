/* =============================================================
   SIDEBAR (LÍNEAS DE PRODUCCIÓN)
   Parte del sistema GLACIAL — dividido a partir de app.js
   ============================================================= */


/* =========================================================
   SIDEBAR
   ========================================================= */

function visibleLines(){
  if(!state.user)return [];
  if(tienePermiso('todasLasLineas'))return LINES;
  if(state.user.linea)return LINES.filter(l=>l.key===state.user.linea);
  return LINES;
}


function renderSidebar(){

  const list =
    document.getElementById('line-list');


  list.innerHTML =

    visibleLines()

      .map(l => `

        <button
          class="line-btn ${
            state.currentLine === l.key &&
            state.currentTab !== 'resumen' &&
            state.currentTab !== 'perdidas' &&
            state.currentTab !== 'produccion-actual'
              ? 'active'
              : ''
          }"
          onclick="selectLine('${l.key}')"
        >

          ${l.name}

        </button>

      `)

      .join('');

}


function selectLine(key){

  if(
    typeof confirmarAbandonoRotacionPendiente === 'function' &&
    !confirmarAbandonoRotacionPendiente()
  ){
    return;
  }

  state.currentLine = key;

  state.currentTab = 'nuevo';

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