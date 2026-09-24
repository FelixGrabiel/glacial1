/* =============================================================
   MÓDULO DE MANTENIMIENTO
   Parte del sistema GLACIAL

   Punto de entrada a todo lo relacionado con el área de
   Mantenimiento. Se accede desde el sidebar ("Mantenimiento",
   botón #btn-mantenimiento → goMantenimiento() en
   04-sidebar.js), y requiere el permiso 'moduloMantenimiento'
   (02-estado.js), que el Administrador asigna aparte del resto
   de permisos de Tareo.

   Por ahora la única sección de este módulo es el TAREO DE
   MANTENIMIENTO. No es una pantalla nueva: reutiliza tal cual
   toda la lógica de 13-tareo.js (registro de asistencia,
   historial, resumen mensual, fichas, exportación Excel/PNG),
   que ya sabe trabajar por ÁREA ('Producción' / 'Mantenimiento').
   Lo único que cambió es la PUERTA DE ENTRADA: antes se llegaba
   al Tareo de Mantenimiento desde la pantalla genérica de Tareo
   (con el permiso 'tareoMantenimiento', ahora retirado); ahora
   solo se llega desde aquí, con 'moduloMantenimiento'.

   Como openTareo() ya decide qué mostrar según
   tareoAccesoUsuario() (ver 13-tareo.js), y un usuario con
   moduloMantenimiento tiene 'Mantenimiento' como única área
   editable, basta con llamarlo: no hace falta duplicar nada del
   Tareo. Cuando se agregue la SIGUIENTE sección de Mantenimiento
   (por ejemplo, órdenes de trabajo o checklist de máquinas), este
   archivo es el lugar donde crecerá: renderMantenimientoModulo()
   pasará a dibujar una navegación propia del módulo (Tareo +
   las nuevas secciones) en vez de delegar todo a openTareo().
   ============================================================= */

function renderMantenimientoModulo(){

  if(!tienePermiso('moduloMantenimiento')){

    const main =
      document.getElementById('main');

    if(main){

      main.innerHTML = `
        <div class="empty-state">
          <h4>Sin acceso</h4>
          <p>No tienes permiso para ver el módulo de Mantenimiento.</p>
        </div>
      `;

    }

    return;

  }

  openTareo();

}

window.renderMantenimientoModulo =
  renderMantenimientoModulo;