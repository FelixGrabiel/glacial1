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

// Con reglas estrictas, la sincronización arranca DESPUÉS de iniciar sesión.
if(typeof REGLAS_ESTRICTAS === "undefined" || !REGLAS_ESTRICTAS){
  initRealtimeSync();
}

tryResumeSession();