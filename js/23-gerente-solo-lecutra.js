/* GLACIAL: Gerente General / Gerente en modo de consulta.
   Cargar después de los módulos 02–22 y antes de 12-init.js.
   Controla la interfaz y las funciones de guardado de esta app;
   la seguridad de Firestore requiere Firebase Authentication y reglas por rol. */
(function instalarGerenteSoloLectura(){
  'use strict';

  const rolesGerencia = new Set(['Gerente General', 'Gerente']);
  const permisosConsulta = new Set([
    'verLineasProduccion', 'todasLasLineas',
    'historial', 'graficos', 'resumen', 'perdidasSoles',
    'produccionActual', 'tareoGeneral',
    'exportarExcel', 'exportarExcelGeneral', 'exportarJPG'
  ]);

  function esGerenteSoloLectura(usuario){
    return !!usuario && rolesGerencia.has(String(usuario.rol || '').trim());
  }
  globalThis.esGerenteSoloLectura = esGerenteSoloLectura;

  // Las cuentas existentes pueden conservar permisos: 'todos' en Firestore.
  // Para este rol, la lista efectiva siempre es la de consulta.
  const permisosAnteriores = normalizarPermisosUsuario;
  normalizarPermisosUsuario = function(usuario){
    return esGerenteSoloLectura(usuario)
      ? Array.from(permisosConsulta)
      : permisosAnteriores.apply(this, arguments);
  };

  // Evita que un cambio posterior en los roles administrativos conceda
  // automáticamente todos los permisos a Gerencia.
  const todosAnteriores = rolTieneTodosLosPermisos;
  rolTieneTodosLosPermisos = function(rol){
    return rolesGerencia.has(rol) ? false : todosAnteriores.apply(this, arguments);
  };

  // 02-estado.js también autorizaba programar por el nombre del rol.
  const programarAnterior = puedeProgramarPaletas;
  puedeProgramarPaletas = function(){
    return esGerenteSoloLectura(state.user)
      ? false : programarAnterior.apply(this, arguments);
  };

  // En Gestión de usuarios, al elegir Gerente solo se marcan vistas.
  const cambiarRolAnterior = cambiarRolNuevoUsuario;
  cambiarRolNuevoUsuario = function(){
    const resultado = cambiarRolAnterior.apply(this, arguments);
    if(!rolesGerencia.has(document.getElementById('nu-rol')?.value)){
      return resultado;
    }
    document.querySelectorAll('.permiso-check').forEach(c => {
      c.checked = permisosConsulta.has(c.value);
      c.disabled = !permisosConsulta.has(c.value);
    });
    const todos = document.getElementById('nu-permisos-todos');
    if(todos){ todos.checked = false; todos.disabled = true; }
    return resultado;
  };

  // Segunda barrera para llamadas internas de guardado, aunque una pantalla
  // antigua deje visible por error un botón de edición.
  [
    'saveUsers', 'saveRecords', 'saveWorkers', 'saveRotaciones',
    'saveTareos', 'savePrecios', 'savePaletas', 'saveProgramaciones'
  ].forEach(nombre => {
    const guardarAnterior = globalThis[nombre];
    if(typeof guardarAnterior !== 'function') return;
    globalThis[nombre] = function(...args){
      if(esGerenteSoloLectura(state.user)){
        throw new Error('Gerencia tiene acceso de solo lectura. No se guardaron cambios.');
      }
      return guardarAnterior.apply(this, args);
    };
  });
})();
