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
            state.currentTab !== 'perdidas'
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