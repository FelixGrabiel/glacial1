/* =============================================================
   CERRAR MODAL E INICIALIZACIÓN DE LA APP
   Parte del sistema GLACIAL — dividido a partir de app.js
   ============================================================= */


/* =========================================================
   CERRAR MODAL
   ========================================================= */

function closeModal(){

  document.getElementById(
    'modal-root'
  ).innerHTML = '';

}


/* =========================================================
   INICIALIZACIÓN
   ========================================================= */

initRealtimeSync();

tryResumeSession();