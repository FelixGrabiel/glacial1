/* =============================================================
   MÓDULO DE RRHH
   Parte del sistema GLACIAL

   Punto de entrada al Tareo para Recursos Humanos. Se accede
   desde el sidebar ("RRHH", botón #btn-rrhh → goRRHH() en
   04-sidebar.js), y requiere el permiso 'moduloRRHH'
   (02-estado.js), que el Administrador asigna aparte.

   A diferencia de 'tareoGeneral' (solo lectura), un usuario con
   'moduloRRHH' puede:
     - Tareo          → registrar/editar asistencia de Producción
                         Y Mantenimiento (tareoAccesoUsuario() le
                         da ambas áreas editables)
     - Tareo General   → vista consolidada de ambas áreas
     - Historial       → editar y ELIMINAR cualquier tareo
                         (eliminarTareo() acepta 'moduloRRHH' sin
                         necesitar el permiso general
                         'eliminarRegistros')
     - Resumen mensual → de ambas áreas

   No reciben "Rotación semanal": esa pestaña sigue reservada a
   quien tenga el permiso 'tareoProduccion' en sí (ver
   tareoRenderTabs en 13-tareo.js), así que si además de RRHH
   necesitan subir la rotación semanal, hay que asignarles ese
   permiso aparte.

   Igual que 18-mantenimiento.js, este módulo reutiliza tal cual
   openTareo() (13-tareo.js): no hay que duplicar nada, porque la
   pantalla de Tareo ya construye sus pestañas y su contenido a
   partir de tareoAccesoUsuario().
   ============================================================= */

function renderRRHHModulo(){

  if(!tienePermiso('moduloRRHH')){

    const main =
      document.getElementById('main');

    if(main){

      main.innerHTML = `
        <div class="empty-state">
          <h4>Sin acceso</h4>
          <p>No tienes permiso para ver el módulo de RRHH.</p>
        </div>
      `;

    }

    return;

  }

  openTareo();

}

window.renderRRHHModulo =
  renderRRHHModulo;