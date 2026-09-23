/* =============================================================
   PALETAS — REGISTRO EN TIEMPO REAL DE PALETAS PRODUCIDAS
   Parte del sistema GLACIAL

   =========================================================
   QUÉ HACE ESTE MÓDULO
   =========================================================

   Permite que el supervisor vaya anotando, turno a turno,
   cada vez que se arma una paleta más, sin esperar a cerrar
   el reporte diario completo (06-registro.js). Cada anotación
   queda guardada como UN registro independiente en Firestore
   (documento sync/paletas, exactamente igual que sync/records,
   sync/workers, etc. — ver 02-estado.js), así que se sincroniza
   en tiempo real con cualquier otra computadora o celular
   conectado.

   NO reemplaza al reporte diario de producción (06-registro.js):
   ese sigue siendo el reporte oficial del turno (cuadros,
   paradas, mermas, personal). Paletas es un conteo rápido y
   acumulativo, pensado para que Producción y Ventas sepan EN
   EL MOMENTO cuánto se ha paletizado, turno día/noche, sin
   tener que esperar al cierre del reporte.

   =========================================================
   PROGRAMACIÓN EN UNIDADES / PRODUCCIÓN EN PALETAS
   =========================================================

   Desde esta versión, los dos conceptos se manejan por
   separado y en su unidad natural:

   - PROGRAMACIÓN: siempre en UNIDADES (UND). El supervisor
     ingresa la cantidad programada y las "unidades por
     paleta" de esa combinación; el sistema calcula solo las
     paletas programadas (cantidad / unidades por paleta).

   - PRODUCCIÓN REAL: siempre en PALETAS, porque así se
     controla físicamente. Cada registro indica si la paleta
     es COMPLETA (se le asignan automáticamente las unidades
     por paleta configuradas) o INCOMPLETA (el supervisor
     ingresa manualmente cuántas unidades salieron en esa
     paleta puntual).

   La comparación PROGRAMADO vs. PRODUCIDO vs. PENDIENTE y el
   % de avance siempre se calculan en UNIDADES, que es la
   cifra que realmente importa para saber cuánto falta.

   Compatibilidad con datos anteriores: las programaciones
   creadas antes de esta mejora guardaban la cantidad en
   PALETAS (sin "unidadesPorPaleta" propio). Ver
   datosProgramacionCombinacion() más abajo: si el registro no
   trae "unidadesPorPaleta", se interpreta con el formato
   antiguo (cantidadProgramada = paletas) usando la tasa del
   catálogo (obtenerUnidadesPorPalet) para convertir a
   unidades. Los registros de producción (sync/paletas)
   anteriores a esta mejora no traen "tipoPaleta": se tratan
   como PALETA COMPLETA, que es lo que siempre representaron.

   =========================================================
   REUTILIZA (no duplica) lo que ya existe en el sistema:
   =========================================================
   - Firebase/Firestore y el patrón load…/save… → 02-estado.js
   - LINES, MARCAS_POR_LINEA, PRESENTACIONES_POR_LINEA → 01-config.js
   - obtenerUnidadesPorPalet(linea,marca,presentacion) → 05-utils.js
     (se usa como valor por defecto de "unidades por paleta"
     cuando la programación todavía no trae uno propio)
   - num(), normalizarTexto(), escaparHtml() → 05-utils.js / 02-estado.js
   - tienePermiso(), state.user → 02-estado.js
   - setTab()/renderMain() de 06-registro.js, como una pestaña
     más de cada línea (Nuevo registro / Historial / Gráficos /
     PALETAS)
   ============================================================= */


/* =========================================================
   ESTADO LOCAL DEL FORMULARIO DE PALETAS
   =========================================================

   draftPaleta: el registro que se está llenando/editando en
   este momento.

   paletaEditId: si no es null, "Guardar" actualiza ese
   registro en vez de crear uno nuevo.

   _guardandoPaleta: candado para evitar que un doble clic en
   "Guardar" cree el mismo registro dos veces.
   ========================================================= */

let draftPaleta = null;
let paletaEditId = null;
let _guardandoPaleta = false;


/* =========================================================
   PROGRAMACIÓN DE PALETAS POR TURNO ("CANTIDAD PROGRAMADA")
   =========================================================

   La cifra programada pertenece a la combinación línea +
   fecha + turno + marca + presentación — NO a cada registro
   de producción — así que se guarda en su propio documento de
   Firestore (sync/programaciones, ver 02-estado.js).

   claveProgramacionPaleta() arma el identificador de esa
   combinación; obtenerProgramacionPaleta() la lee tal cual
   está guardada; datosProgramacionCombinacion() la normaliza
   (con el manejo de compatibilidad descrito arriba);
   guardarProgramacionPaleta() la crea o la actualiza SIN
   duplicarla (busca primero por la misma clave).
   ========================================================= */

function claveProgramacionPaleta(linea, fecha, turno, marca, presentacion){

  return [

    linea || '',
    fecha || '',
    turno || '',
    marca || '',
    presentacion || ''

  ].join('|');

}


function obtenerProgramacionPaleta(linea, fecha, turno, marca, presentacion){

  const clave =
    claveProgramacionPaleta(linea, fecha, turno, marca, presentacion);

  return (
    loadProgramaciones().find(p => p.clave === clave) ||
    null
  );

}


/*
   Unidades por paleta que rige AHORA MISMO para una
   combinación: primero la que el supervisor haya guardado en
   su propia programación (sección "Cantidad programada"); si
   todavía no hay ninguna, cae al catálogo general
   (obtenerUnidadesPorPalet, 05-utils.js) — la misma tasa que
   usa el reporte diario.
*/
function unidadesPorPaletaActiva(linea, fecha, turno, marca, presentacion){

  const prog =
    obtenerProgramacionPaleta(linea, fecha, turno, marca, presentacion);

  if(prog && num(prog.unidadesPorPaleta) > 0){
    return num(prog.unidadesPorPaleta);
  }

  return obtenerUnidadesPorPalet(linea, marca, presentacion) || 0;

}


/*
   Normaliza la programación guardada de una combinación a:

     { existe, cantidadProgramada (UND), unidadesPorPaleta, paletasProgramadas }

   Maneja tanto el formato nuevo (unidadesPorPaleta propio,
   cantidadProgramada ya en UND) como el formato antiguo
   (cantidadProgramada en PALETAS, sin unidadesPorPaleta) — ver
   nota de compatibilidad al inicio del archivo.
*/
function datosProgramacionCombinacion(linea, fecha, turno, marca, presentacion){

  const prog =
    obtenerProgramacionPaleta(linea, fecha, turno, marca, presentacion);

  if(!prog){

    return {
      existe: false,
      cantidadProgramada: 0,
      unidadesPorPaleta: 0,
      paletasProgramadas: 0
    };

  }

  if(num(prog.unidadesPorPaleta) > 0){

    const cantidadProgramada = num(prog.cantidadProgramada);
    const unidadesPorPaleta = num(prog.unidadesPorPaleta);

    return {
      existe: cantidadProgramada > 0,
      cantidadProgramada,
      unidadesPorPaleta,
      paletasProgramadas:
        unidadesPorPaleta
          ? cantidadProgramada / unidadesPorPaleta
          : 0
    };

  }

  /* Formato antiguo: cantidadProgramada estaba en PALETAS. */

  const unidadesPorPaleta =
    obtenerUnidadesPorPalet(linea, marca, presentacion) || 0;

  const paletasProgramadas =
    num(prog.cantidadProgramada);

  return {
    existe: paletasProgramadas > 0,
    cantidadProgramada: Math.round(paletasProgramadas * unidadesPorPaleta),
    unidadesPorPaleta,
    paletasProgramadas
  };

}


/*
   Crea o actualiza (SIN duplicar) la programación de una
   combinación: si ya existe una con la misma clave, se
   reemplaza ese mismo registro; si no existe, se crea uno
   nuevo. "cantidadUnidades" es SIEMPRE en UND;
   "unidadesPorPaleta" es la que el supervisor definió para
   esa combinación (producto + presentación).
*/
async function guardarProgramacionPaleta(linea, fecha, turno, marca, presentacion, cantidadUnidades, unidadesPorPaleta){

  const clave =
    claveProgramacionPaleta(linea, fecha, turno, marca, presentacion);

  const programaciones =
    loadProgramaciones();

  const idx =
    programaciones.findIndex(p => p.clave === clave);

  const cantidadNum =
    Math.max(0, num(cantidadUnidades));

  const uppNum =
    Math.max(0, num(unidadesPorPaleta));

  const campos = {
    cantidadProgramada: cantidadNum,
    unidadesPorPaleta: uppNum,
    paletasProgramadas: uppNum ? cantidadNum / uppNum : 0,
    actualizadoPor: nombreUsuarioActualPaletas(),
    actualizadoEn: Date.now()
  };

  if(idx > -1){

    programaciones[idx] = {
      ...programaciones[idx],
      ...campos
    };

  } else {

    programaciones.push({

      id:
        'prog_' + Date.now() + '_' +
        Math.random().toString(36).slice(2, 8),

      clave,
      linea,
      fecha,
      turno,
      marca,
      presentacion,

      ...campos,

      creadoPor: nombreUsuarioActualPaletas(),
      creadoEn: Date.now()

    });

  }

  await saveProgramaciones(programaciones);

}


/*
   Comparación PROGRAMADO vs. PRODUCIDO vs. PENDIENTE (en
   UNIDADES, con su equivalente en paletas) para una
   combinación línea+marca+presentación, sumando uno o varios
   turnos del mismo día (se usa con UN turno para el
   formulario de Paletas, y con los TRES turnos para
   "Producción actual", que puede mostrar el día completo).

   La producción real se toma directamente de los registros
   guardados (loadPaletas): cada registro ya trae su propio
   "totalUnidades" calculado al guardarse (paleta completa =
   paletas × unidades por paleta; paleta incompleta = unidades
   ingresadas manualmente), así que aquí solo se suman/
   clasifican, sin repetir esa lógica.
*/
function resumenProgramacionCombinacionTurnos(linea, fecha, turnos, marca, presentacion){

  let cantidadProgramada = 0;
  let paletasProgramadas = 0;
  let unidadesPorPaleta = 0;

  let paletasCompletas = 0;
  let paletasIncompletasCount = 0;
  let unidadesIncompletas = 0;
  let unidadesProducidas = 0;

  turnos.forEach(turno => {

    const datosProg =
      datosProgramacionCombinacion(linea, fecha, turno, marca, presentacion);

    cantidadProgramada += datosProg.cantidadProgramada;
    paletasProgramadas += datosProg.paletasProgramadas;

    if(datosProg.unidadesPorPaleta){
      unidadesPorPaleta = datosProg.unidadesPorPaleta;
    }

    loadPaletas()
      .filter(p =>
        p.linea === linea &&
        p.fecha === fecha &&
        p.turno === turno &&
        p.marca === marca &&
        p.presentacion === presentacion
      )
      .forEach(r => {

        unidadesProducidas += num(r.totalUnidades);

        if(r.tipoPaleta === 'INCOMPLETA'){

          paletasIncompletasCount += 1;
          unidadesIncompletas += num(r.totalUnidades);

        } else {

          paletasCompletas += num(r.paletas) || 0;

        }

      });

  });

  if(!unidadesPorPaleta){
    unidadesPorPaleta = obtenerUnidadesPorPalet(linea, marca, presentacion) || 0;
  }

  const paletasEquivalentes =
    paletasCompletas + paletasIncompletasCount;

  const unidadesPendientes =
    Math.max(0, cantidadProgramada - unidadesProducidas);

  /*
     "No bloquear necesariamente el registro si se supera la
     programación; mostrar una alerta clara de SOBREPRODUCCIÓN"
     — por eso esto es solo una bandera informativa, nunca
     impide guardarPaleta().
  */
  const sobreproduccion =
    cantidadProgramada > 0 && unidadesProducidas > cantidadProgramada;

  const porcentajeAvance =
    cantidadProgramada > 0
      ? (unidadesProducidas / cantidadProgramada) * 100
      : 0;

  return {

    /* Programación (UND, con su equivalente en paletas) */
    cantidadProgramada,
    unidadesPorPaleta,
    paletasProgramadas,

    /* Producción real */
    paletasCompletas,
    paletasIncompletasCount,
    unidadesIncompletas,
    unidadesProducidas,
    paletasEquivalentes,

    /* Comparación */
    unidadesPendientes,
    porcentajeAvance,
    sobreproduccion,

    /*
       Alias en "paletas" para el bloque de "Producción actual"
       y otras vistas que comparan usando esa unidad — así no
       hay que reescribir esas tablas cada vez que cambie el
       cálculo interno.
    */
    programado: paletasProgramadas,
    producido: paletasEquivalentes,
    pendiente: Math.max(0, paletasProgramadas - paletasEquivalentes),
    cumplimiento: porcentajeAvance

  };

}


/*
   Caso particular de lo de arriba con UN solo turno — es lo
   que usa el formulario/resultados de la pestaña Paletas
   (16-paletas.js), donde siempre se trabaja turno por turno.
*/
function resumenProgramacionCombinacion(linea, fecha, turno, marca, presentacion){

  return resumenProgramacionCombinacionTurnos(
    linea, fecha, [turno], marca, presentacion
  );

}


/* =========================================================
   FECHA/HORA ACTUALES (formato local, sin librerías)
   ========================================================= */

function fechaHoyPaletas(){

  const ahora = new Date();

  return (
    ahora.getFullYear() +
    '-' +
    String(ahora.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(ahora.getDate()).padStart(2, '0')
  );

}

function horaAhoraPaletas(){

  const ahora = new Date();

  return (
    String(ahora.getHours()).padStart(2, '0') +
    ':' +
    String(ahora.getMinutes()).padStart(2, '0')
  );

}


/* =========================================================
   REGISTRO EN BLANCO
   =========================================================

   tipoPaleta arranca en 'COMPLETA' (el caso más común) con
   "paletas" (cantidad de paletas completas) en 1;
   "unidadesIncompleta" solo se usa cuando tipoPaleta pasa a
   'INCOMPLETA'.
   ========================================================= */

function blankPaleta(lineKey){

  const marcas = MARCAS_POR_LINEA[lineKey] || [];
  const presentaciones = PRESENTACIONES_POR_LINEA[lineKey] || [];

  return {
    linea: lineKey,
    fecha: fechaHoyPaletas(),
    turno: 'DÍA',
    marca: marcas[0] || '',
    presentacion: presentaciones[0] || '',
    hora: horaAhoraPaletas(),
    tipoPaleta: 'COMPLETA',
    paletas: 1,
    unidadesIncompleta: '',
    observaciones: ''
  };

}


/* =========================================================
   USUARIO QUE REALIZA EL REGISTRO (AUTOMÁTICO)
   ========================================================= */

function nombreUsuarioActualPaletas(){

  return (
    (
      state.user &&
      (state.user.nombre || state.user.username)
    ) ||
    'Usuario'
  );

}


/* =========================================================
   TEXTO DE VISTA PREVIA: "= X unidades (Y und./paleta)"
   =========================================================

   Cambia según el tipo de paleta seleccionado en el
   formulario: para COMPLETA muestra paletas × unidades por
   paleta; para INCOMPLETA muestra directamente las unidades
   que el supervisor ingresó para esa paleta puntual.
   ========================================================= */

function textoPreviaUnidadesPaleta(){

  if(!draftPaleta){
    return '';
  }

  const unidadesPorPaleta =
    unidadesPorPaletaActiva(
      draftPaleta.linea,
      draftPaleta.fecha,
      draftPaleta.turno,
      draftPaleta.marca,
      draftPaleta.presentacion
    );

  if(draftPaleta.tipoPaleta === 'INCOMPLETA'){

    const unidades = num(draftPaleta.unidadesIncompleta);

    if(!unidades){
      return 'Ingresa las unidades que salieron en esta paleta incompleta.';
    }

    return (
      '= ' + unidades.toLocaleString('es-PE') + ' unidades' +
      (
        unidadesPorPaleta
          ? ' (una paleta completa de esta combinación sería ' + unidadesPorPaleta + ' und.)'
          : ''
      )
    );

  }

  const cantidad = num(draftPaleta.paletas);

  if(!cantidad){
    return 'Ingresa la cantidad de paletas completas para ver las unidades equivalentes.';
  }

  if(!unidadesPorPaleta){
    return 'No hay "unidades por paleta" configuradas para esta combinación. Complétalas en "Cantidad programada", arriba.';
  }

  return (
    '= ' +
    Math.round(cantidad * unidadesPorPaleta).toLocaleString('es-PE') +
    ' unidades (' +
    unidadesPorPaleta +
    ' und./paleta)'
  );

}


/* =========================================================
   ACTUALIZAR CAMPOS DEL DRAFT
   ========================================================= */

/*
   Para selects/fecha: el cambio es discreto (no es tipeo
   continuo), así que se puede re-renderizar toda la pestaña
   sin molestar a nadie — y de paso se actualiza el título
   "Producción del turno ..." con el turno/fecha nuevos.
*/
function actualizarPaletaCampoYRerenderizar(el, name){

  if(!draftPaleta){
    return;
  }

  draftPaleta[name] = el.value;

  renderPaletasTab();

}

/*
   Cambiar el tipo de paleta (Completa/Incompleta) también
   necesita re-renderizar, porque cambia qué campo del
   formulario se muestra (cantidad de paletas vs. unidades de
   la paleta incompleta).
*/
function actualizarTipoPaletaYRerenderizar(valor){

  if(!draftPaleta){
    return;
  }

  draftPaleta.tipoPaleta = valor;

  renderPaletasTab();

}

/*
   Para la cantidad de paletas completas: se escribe número
   tras número, así que NO se re-renderiza todo (se perdería
   el foco del input). Solo se actualiza el textito de vista
   previa.
*/
function actualizarPaletaCantidad(valor){

  if(!draftPaleta){
    return;
  }

  draftPaleta.paletas = valor;

  const preview =
    document.getElementById('paleta-preview-unidades');

  if(preview){
    preview.textContent = textoPreviaUnidadesPaleta();
  }

}

/*
   Para las unidades de una paleta incompleta: mismo criterio
   que actualizarPaletaCantidad() — tipeo libre, no se
   re-renderiza todo.
*/
function actualizarPaletaUnidadesIncompleta(valor){

  if(!draftPaleta){
    return;
  }

  draftPaleta.unidadesIncompleta = valor;

  const preview =
    document.getElementById('paleta-preview-unidades');

  if(preview){
    preview.textContent = textoPreviaUnidadesPaleta();
  }

}

/*
   Para hora/observaciones: tipeo libre, tampoco se
   re-renderiza nada.
*/
function actualizarPaletaCampo(name, valor){

  if(!draftPaleta){
    return;
  }

  draftPaleta[name] = valor;

}


/* =========================================================
   GUARDAR (CREAR O ACTUALIZAR)
   =========================================================

   Incluye el candado _guardandoPaleta + deshabilitar el botón
   mientras se guarda, para que un doble clic (muy común
   cuando la conexión está lenta) no cree el mismo registro
   dos veces.

   Cada registro conserva, además de lo que ya manejaba este
   módulo (fecha, turno, marca, presentación, hora, usuario,
   observaciones, identificador, horas de creación/
   actualización):

     tipoPaleta          'COMPLETA' | 'INCOMPLETA'
     paletas             cantidad de paletas de este registro
                          (siempre 1 cuando es incompleta)
     unidadesPorPaleta   tasa usada en este registro
     unidadesIncompleta  unidades ingresadas manualmente
                          (0 cuando es completa)
     totalUnidades       unidades reales de este registro
   ========================================================= */

async function guardarPaleta(){

  if(_guardandoPaleta){
    return;
  }

  if(!draftPaleta){
    return;
  }

  if(!draftPaleta.marca){
    alert('Selecciona una marca.');
    return;
  }

  if(!draftPaleta.presentacion){
    alert('Selecciona una presentación.');
    return;
  }


  const esCompleta =
    draftPaleta.tipoPaleta !== 'INCOMPLETA';

  const unidadesPorPaleta =
    unidadesPorPaletaActiva(
      draftPaleta.linea,
      draftPaleta.fecha,
      draftPaleta.turno,
      draftPaleta.marca,
      draftPaleta.presentacion
    );

  let cantidadPaletas;
  let unidadesIncompleta = 0;
  let totalUnidades;

  if(esCompleta){

    cantidadPaletas = num(draftPaleta.paletas);

    if(!cantidadPaletas || cantidadPaletas <= 0){
      alert('Ingresa una cantidad de paletas completas mayor a 0.');
      return;
    }

    if(!unidadesPorPaleta){
      alert(
        'No hay "unidades por paleta" configuradas para esta combinación. ' +
        'Completa la cantidad programada con sus unidades por paleta antes de registrar paletas completas.'
      );
      return;
    }

    totalUnidades =
      Math.round(cantidadPaletas * unidadesPorPaleta);

  } else {

    cantidadPaletas = 1;
    unidadesIncompleta = num(draftPaleta.unidadesIncompleta);

    if(!unidadesIncompleta || unidadesIncompleta <= 0){
      alert('Ingresa las unidades que salieron en esta paleta incompleta.');
      return;
    }

    totalUnidades = unidadesIncompleta;

  }


  _guardandoPaleta = true;

  const btn = document.getElementById('btn-guardar-paleta');

  const textoOriginalBtn =
    btn ? btn.textContent : '';

  if(btn){
    btn.disabled = true;
    btn.textContent = 'Guardando...';
  }


  try{

    const registros = loadPaletas();

    if(paletaEditId){

      /* =================================================
         ACTUALIZAR UN REGISTRO EXISTENTE
         ================================================= */

      const idx =
        registros.findIndex(p => p.id === paletaEditId);

      if(idx > -1){

        registros[idx] = {
          ...registros[idx],
          fecha: draftPaleta.fecha,
          turno: draftPaleta.turno,
          marca: draftPaleta.marca,
          presentacion: draftPaleta.presentacion,
          hora: draftPaleta.hora,
          tipoPaleta: esCompleta ? 'COMPLETA' : 'INCOMPLETA',
          paletas: cantidadPaletas,
          unidadesPorPaleta,
          unidadesIncompleta,
          totalUnidades,
          observaciones: draftPaleta.observaciones || '',
          actualizadoPor: nombreUsuarioActualPaletas(),
          actualizadoEn: Date.now()
        };

      }

    } else {

      /* =================================================
         CREAR UN REGISTRO NUEVO
         ================================================= */

      registros.push({

        id:
          'pal_' + Date.now() + '_' +
          Math.random().toString(36).slice(2, 8),

        linea: draftPaleta.linea,
        fecha: draftPaleta.fecha,
        turno: draftPaleta.turno,
        marca: draftPaleta.marca,
        presentacion: draftPaleta.presentacion,
        hora: draftPaleta.hora,
        tipoPaleta: esCompleta ? 'COMPLETA' : 'INCOMPLETA',
        paletas: cantidadPaletas,
        unidadesPorPaleta,
        unidadesIncompleta,
        totalUnidades,
        observaciones: draftPaleta.observaciones || '',

        usuario: nombreUsuarioActualPaletas(),
        usuarioUsername: (state.user && state.user.username) || '',

        creadoEn: Date.now()

      });

    }

    await savePaletas(registros);

    /*
       Se mantienen fecha/turno/marca/presentación (para
       agilizar el siguiente registro del mismo turno) y solo
       se limpian tipo/cantidad/observaciones/hora.
    */

    const fechaPrevia = draftPaleta.fecha;
    const turnoPrevio = draftPaleta.turno;
    const marcaPrevia = draftPaleta.marca;
    const presentacionPrevia = draftPaleta.presentacion;

    paletaEditId = null;

    draftPaleta = blankPaleta(state.currentLine);

    draftPaleta.fecha = fechaPrevia;
    draftPaleta.turno = turnoPrevio;
    draftPaleta.marca = marcaPrevia;
    draftPaleta.presentacion = presentacionPrevia;

    renderPaletasTab();

  } finally {

    _guardandoPaleta = false;

  }

}


/* =========================================================
   CANCELAR EDICIÓN
   ========================================================= */

function cancelarEdicionPaleta(){

  const fechaPrevia = draftPaleta ? draftPaleta.fecha : null;
  const turnoPrevio = draftPaleta ? draftPaleta.turno : null;

  paletaEditId = null;

  draftPaleta = blankPaleta(state.currentLine);

  if(fechaPrevia){
    draftPaleta.fecha = fechaPrevia;
  }

  if(turnoPrevio){
    draftPaleta.turno = turnoPrevio;
  }

  renderPaletasTab();

}


/* =========================================================
   GUARDAR LA CANTIDAD PROGRAMADA (DESDE EL FORMULARIO)
   =========================================================

   Independiente de guardarPaleta(): esto NO crea un registro
   de producción, solo fija/actualiza cuánto se debe producir
   (en UNIDADES) y con qué "unidades por paleta" para la
   combinación línea+fecha+turno+marca+presentación que esté
   seleccionada en el formulario en este momento.
   ========================================================= */

async function guardarProgramacionDesdeFormulario(){

  if(!draftPaleta){
    return;
  }

  if(!draftPaleta.marca || !draftPaleta.presentacion){
    alert('Selecciona marca y presentación antes de programar.');
    return;
  }

  const inputCantidad =
    document.getElementById('paleta-programada-input');

  const inputUpp =
    document.getElementById('paleta-programada-upp-input');

  const cantidad =
    num(inputCantidad ? inputCantidad.value : 0);

  const unidadesPorPaleta =
    num(inputUpp ? inputUpp.value : 0);

  if(cantidad < 0){
    alert('La cantidad programada no puede ser negativa.');
    return;
  }

  if(cantidad > 0 && unidadesPorPaleta <= 0){
    alert('Ingresa las unidades por paleta de esta combinación para poder calcular las paletas programadas.');
    return;
  }

  const btn =
    document.getElementById('btn-guardar-programacion');

  if(btn){
    btn.disabled = true;
  }

  try{

    await guardarProgramacionPaleta(
      draftPaleta.linea,
      draftPaleta.fecha,
      draftPaleta.turno,
      draftPaleta.marca,
      draftPaleta.presentacion,
      cantidad,
      unidadesPorPaleta
    );

    renderPaletasTab();

  } finally {

    if(btn){
      btn.disabled = false;
    }

  }

}


/* =========================================================
   EDITAR UN REGISTRO EXISTENTE
   ========================================================= */

function editarPaleta(id){

  if(!tienePermiso('paletas')){
    alert('No tienes permiso para editar registros de paletas.');
    return;
  }

  const registro =
    loadPaletas().find(p => p.id === id);

  if(!registro){
    return;
  }

  paletaEditId = id;

  draftPaleta = {
    linea: registro.linea,
    fecha: registro.fecha,
    turno: registro.turno,
    marca: registro.marca,
    presentacion: registro.presentacion,
    hora: registro.hora,
    tipoPaleta: registro.tipoPaleta || 'COMPLETA',
    paletas: registro.paletas,
    unidadesIncompleta: registro.unidadesIncompleta || '',
    observaciones: registro.observaciones || ''
  };

  renderPaletasTab();

  const panel =
    document.getElementById('paletas-form-panel');

  if(panel){
    panel.scrollIntoView({ behavior:'smooth', block:'start' });
  }

}


/* =========================================================
   ELIMINAR UN REGISTRO
   =========================================================

   Usa el mismo permiso 'eliminarRegistros' que ya protege
   borrar reportes diarios y trabajadores — no se crea un
   permiso paralelo para lo mismo.
   ========================================================= */

function eliminarPaleta(id){

  if(!tienePermiso('eliminarRegistros')){
    alert('No tienes permiso para eliminar registros.');
    return;
  }

  if(!confirm('¿Eliminar este registro de paletas?')){
    return;
  }

  const registros =
    loadPaletas().filter(p => p.id !== id);

  savePaletas(registros);

  if(paletaEditId === id){
    cancelarEdicionPaleta();
    return;
  }

  renderPaletasTab();

}


/* =========================================================
   REGISTROS DEL "TURNO ACTUAL" (línea + fecha + turno
   seleccionados en el formulario)
   ========================================================= */

function registrosPaletasTurnoActual(){

  if(!draftPaleta){
    return [];
  }

  return loadPaletas().filter(

    p =>
      p.linea === state.currentLine &&
      p.fecha === draftPaleta.fecha &&
      p.turno === draftPaleta.turno

  );

}


/* =========================================================
   RESUMEN REUTILIZABLE POR LÍNEA/FECHA/TURNO
   =========================================================

   Se deja como función aparte (y no mezclada dentro del
   render) para que más adelante Ventas, un dashboard o un
   export a Excel puedan llamar a esta misma función y
   obtener el resumen ya calculado, sin tener que reescribir
   la lógica de agrupamiento. Además de los totales generales,
   separa paletas completas de incompletas, para que la
   interfaz pueda mostrar ambos conceptos sin confundirlos.
   ========================================================= */

function resumenPaletas(linea, fecha, turno){

  const registros =
    loadPaletas().filter(

      p =>
        p.linea === linea &&
        p.fecha === fecha &&
        p.turno === turno

    );

  const totalPaletas =
    registros.reduce((a, r) => a + num(r.paletas), 0);

  const totalUnidades =
    registros.reduce((a, r) => a + num(r.totalUnidades), 0);

  const totalPaletasCompletas =
    registros
      .filter(r => r.tipoPaleta !== 'INCOMPLETA')
      .reduce((a, r) => a + num(r.paletas), 0);

  const totalPaletasIncompletas =
    registros.filter(r => r.tipoPaleta === 'INCOMPLETA').length;

  const totalUnidadesIncompletas =
    registros
      .filter(r => r.tipoPaleta === 'INCOMPLETA')
      .reduce((a, r) => a + num(r.totalUnidades), 0);

  const grupos = {};

  registros.forEach(r => {

    const key =
      (r.marca || '—') + ' · ' + (r.presentacion || '—');

    if(!grupos[key]){

      grupos[key] = {
        marca: r.marca,
        presentacion: r.presentacion,
        paletas: 0,
        unidades: 0,
        paletasCompletas: 0,
        paletasIncompletas: 0,
        unidadesIncompletas: 0,
        eventos: []
      };

    }

    grupos[key].paletas += num(r.paletas);
    grupos[key].unidades += num(r.totalUnidades);

    if(r.tipoPaleta === 'INCOMPLETA'){
      grupos[key].paletasIncompletas += 1;
      grupos[key].unidadesIncompletas += num(r.totalUnidades);
    } else {
      grupos[key].paletasCompletas += num(r.paletas);
    }

    grupos[key].eventos.push(r);

  });

  return {
    registros,
    totalPaletas,
    totalUnidades,
    totalPaletasCompletas,
    totalPaletasIncompletas,
    totalUnidadesIncompletas,
    grupos: Object.values(grupos)
  };

}


/* =========================================================
   HTML: BLOQUE "PROGRAMADO vs. PRODUCIDO vs. PENDIENTE"
   =========================================================

   Reutilizado tanto para la combinación activa en el
   formulario (bloque grande, arriba de todo) como para cada
   tarjeta de marca/presentación agrupada más abajo (línea
   compacta). "titulo" es solo para el texto de la alerta de
   sobreproducción. Todo en UNIDADES, con su equivalente en
   paletas como referencia.
   ========================================================= */

function renderBloqueProgramacion(prog, titulo){

  if(!prog.cantidadProgramada){

    return `
      <div class="small-muted pl-prog-vacio">
        Todavía no hay cantidad programada (en unidades) para ${titulo}.
      </div>
    `;

  }

  const paletasProgramadasTexto =
    Number.isInteger(prog.paletasProgramadas)
      ? prog.paletasProgramadas
      : prog.paletasProgramadas.toFixed(1);

  return `

    <div class="pl-kpis pl-kpis-prog">

      <div class="pl-kpi">
        <div class="pl-kpi-label">Programado</div>
        <div class="pl-kpi-value">${prog.cantidadProgramada.toLocaleString('es-PE')} UND</div>
        <div class="small-muted">
          ${paletasProgramadasTexto} paletas
          ${prog.unidadesPorPaleta ? '(' + prog.unidadesPorPaleta + ' und./paleta)' : ''}
        </div>
      </div>

      <div class="pl-kpi">
        <div class="pl-kpi-label">Producción real</div>
        <div class="pl-kpi-value">${prog.unidadesProducidas.toLocaleString('es-PE')} UND</div>
        <div class="small-muted">
          ${prog.paletasCompletas} paletas completas
          ${
            prog.paletasIncompletasCount
              ? ' + ' + prog.unidadesIncompletas.toLocaleString('es-PE') +
                ' und. en ' + prog.paletasIncompletasCount +
                ' paleta' + (prog.paletasIncompletasCount > 1 ? 's' : '') +
                ' incompleta' + (prog.paletasIncompletasCount > 1 ? 's' : '')
              : ''
          }
        </div>
      </div>

      <div class="pl-kpi ${prog.sobreproduccion ? 'pl-kpi-warning' : ''}">
        <div class="pl-kpi-label">Pendiente</div>
        <div class="pl-kpi-value">${prog.unidadesPendientes.toLocaleString('es-PE')} UND</div>
      </div>

      <div class="pl-kpi ${prog.sobreproduccion ? 'pl-kpi-warning' : ''}">
        <div class="pl-kpi-label">Avance</div>
        <div class="pl-kpi-value">${prog.porcentajeAvance.toFixed(1)}%</div>
      </div>

    </div>

    ${
      prog.sobreproduccion
        ? `
          <div class="pl-alerta-sobreproduccion">
            ⚠ SOBREPRODUCCIÓN en ${titulo}: se produjeron
            ${(prog.unidadesProducidas - prog.cantidadProgramada).toLocaleString('es-PE')} unidades más de
            lo programado (${prog.unidadesProducidas.toLocaleString('es-PE')} de ${prog.cantidadProgramada.toLocaleString('es-PE')} UND).
          </div>
        `
        : ''
    }

  `;

}


/* =========================================================
   HTML: BLOQUE DE RESULTADOS (KPIs + agrupado + tabla)
   =========================================================

   Separado del resto del formulario para poder refrescarlo
   solo, cuando llega un cambio en tiempo real de otra
   computadora (ver actualizarVistaPaletas más abajo), sin
   tocar los campos que la persona está llenando en este
   momento.
   ========================================================= */

function renderPaletasResultados(){

  if(!draftPaleta){
    return '';
  }

  const resumen =
    resumenPaletas(
      state.currentLine,
      draftPaleta.fecha,
      draftPaleta.turno
    );

  const ultimos =
    resumen.registros
      .slice()
      .sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0))
      .slice(0, 30);

  /*
     Programación de la combinación activa en el formulario
     (línea + fecha + turno + marca + presentación). Es la
     misma cuenta que ve el supervisor mientras registra, así
     que se muestra primero, en grande.
  */
  const programacionActual =
    resumenProgramacionCombinacion(
      state.currentLine,
      draftPaleta.fecha,
      draftPaleta.turno,
      draftPaleta.marca,
      draftPaleta.presentacion
    );

  return `

    <div class="section-title" style="margin-top:0;">
      Programación · ${escaparHtml(draftPaleta.marca || '—')} · ${escaparHtml(draftPaleta.presentacion || '—')}
    </div>

    ${
      renderBloqueProgramacion(
        programacionActual,
        'esta combinación (' +
          escaparHtml(draftPaleta.marca || '—') + ' · ' +
          escaparHtml(draftPaleta.presentacion || '—') + ')'
      )
    }

    <div class="pl-kpis" style="margin-top:14px;">

      <div class="pl-kpi">
        <div class="pl-kpi-label">Total paletas del turno</div>
        <div class="pl-kpi-value">${resumen.totalPaletas}</div>
        <div class="small-muted">
          ${resumen.totalPaletasCompletas} completas
          ${resumen.totalPaletasIncompletas ? ' + ' + resumen.totalPaletasIncompletas + ' incompletas' : ''}
        </div>
      </div>

      <div class="pl-kpi">
        <div class="pl-kpi-label">Total unidades del turno</div>
        <div class="pl-kpi-value">${resumen.totalUnidades.toLocaleString('es-PE')}</div>
      </div>

      <div class="pl-kpi">
        <div class="pl-kpi-label">Registros</div>
        <div class="pl-kpi-value">${resumen.registros.length}</div>
      </div>

    </div>


    ${
      resumen.grupos.length
        ? `
          <div class="pl-grupos">

            ${
              resumen.grupos.map(g => `

                <div class="pl-grupo-card">

                  <div class="pl-grupo-title">
                    ${escaparHtml(g.marca || '—')} · ${escaparHtml(g.presentacion || '—')}
                  </div>

                  <div class="pl-grupo-eventos">

                    ${
                      g.eventos
                        .slice()
                        .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''))
                        .map(e => `
                          <div class="pl-evento">
                            ${e.hora || '—'} →
                            ${
                              e.tipoPaleta === 'INCOMPLETA'
                                ? '<span class="pl-badge-incompleta">Incompleta</span> ' +
                                  num(e.totalUnidades).toLocaleString('es-PE') + ' und.'
                                : '<span class="pl-badge-completa">Completa</span> ' +
                                  '+' + num(e.paletas) + ' paleta(s) = ' +
                                  num(e.totalUnidades).toLocaleString('es-PE') + ' und.'
                            }
                          </div>
                        `)
                        .join('')
                    }

                  </div>

                  <div class="pl-grupo-total">
                    TOTAL: <strong>${g.paletas} paletas</strong>
                    · <strong>${g.unidades.toLocaleString('es-PE')} unidades</strong>
                  </div>

                  ${
                    (() => {

                      const progGrupo =
                        resumenProgramacionCombinacion(
                          state.currentLine,
                          draftPaleta.fecha,
                          draftPaleta.turno,
                          g.marca,
                          g.presentacion
                        );

                      if(!progGrupo.cantidadProgramada){

                        return `
                          <div class="small-muted pl-grupo-programacion">
                            Sin cantidad programada (en unidades) para esta combinación.
                          </div>
                        `;

                      }

                      return `
                        <div class="pl-grupo-programacion ${progGrupo.sobreproduccion ? 'pl-grupo-programacion-warning' : ''}">
                          Programado: <strong>${progGrupo.cantidadProgramada.toLocaleString('es-PE')} UND</strong>
                          · Pendiente: <strong>${progGrupo.unidadesPendientes.toLocaleString('es-PE')} UND</strong>
                          · Avance: <strong>${progGrupo.porcentajeAvance.toFixed(1)}%</strong>
                          ${progGrupo.sobreproduccion ? ' · ⚠ SOBREPRODUCCIÓN' : ''}
                        </div>
                      `;

                    })()
                  }

                </div>

              `).join('')
            }

          </div>
        `
        : `
          <div class="small-muted" style="padding:10px 0;">
            Todavía no hay paletas registradas para este turno.
          </div>
        `
    }


    <div class="section-title" style="margin-top:16px;">
      Últimos registros
    </div>

    <div style="overflow-x:auto;">

      <table>

        <thead>
          <tr>
            <th>Hora</th>
            <th>Marca</th>
            <th>Presentación</th>
            <th>Tipo</th>
            <th>Paletas</th>
            <th>Unidades</th>
            <th>Usuario</th>
            <th>Observaciones</th>
            <th></th>
          </tr>
        </thead>

        <tbody>

          ${
            ultimos.length
              ? ultimos.map(r => `

                <tr>
                  <td>${r.hora || '—'}</td>
                  <td>${escaparHtml(r.marca || '')}</td>
                  <td>${escaparHtml(r.presentacion || '')}</td>
                  <td>
                    ${
                      r.tipoPaleta === 'INCOMPLETA'
                        ? '<span class="pl-badge-incompleta">Incompleta</span>'
                        : '<span class="pl-badge-completa">Completa</span>'
                    }
                  </td>
                  <td>${num(r.paletas)}</td>
                  <td>${num(r.totalUnidades).toLocaleString('es-PE')}</td>
                  <td>${escaparHtml(r.usuario || '')}</td>
                  <td>${escaparHtml(r.observaciones || '')}</td>
                  <td style="white-space:nowrap;">

                    <button
                      class="btn btn-ghost btn-sm"
                      onclick="editarPaleta('${r.id}')"
                    >
                      Editar
                    </button>

                    <button
                      class="btn btn-danger btn-sm"
                      onclick="eliminarPaleta('${r.id}')"
                    >
                      Eliminar
                    </button>

                  </td>
                </tr>

              `).join('')
              : `
                <tr>
                  <td colspan="9" class="small-muted" style="padding:14px 0;">
                    Sin registros todavía.
                  </td>
                </tr>
              `
          }

        </tbody>

      </table>

    </div>

  `;

}


/*
   Refresco "en vivo": lo llama onPaletasUpdated() (02-estado.js)
   cada vez que llega un cambio de Firestore (de esta u otra
   computadora), mientras la pestaña Paletas esté abierta.
   Solo reemplaza el bloque de resultados — nunca toca el
   formulario que la persona pueda estar llenando.
*/
function actualizarVistaPaletas(){

  const cont =
    document.getElementById('paletas-resultados');

  if(!cont || !draftPaleta){
    return;
  }

  cont.innerHTML =
    renderPaletasResultados();

}


/* =========================================================
   CSS PROPIO DEL MÓDULO (se inyecta una sola vez por render
   completo de la pestaña; usa las variables de color que ya
   define index.html, para mantener el mismo estilo GLACIAL)
   ========================================================= */

const PALETAS_CSS = `

  .pl-kpis{
    display:flex;
    flex-wrap:wrap;
    gap:18px;
    margin-bottom:14px;
  }

  .pl-kpi{
    min-width:150px;
    padding:12px 16px;
    border:1px solid var(--border);
    border-radius:12px;
    background:#fff;
  }

  .pl-kpi-label{
    font-size:12px;
    color:var(--text-soft);
    margin-bottom:4px;
  }

  .pl-kpi-value{
    font-size:28px;
    font-weight:700;
    color:var(--glacial-blue-dark);
  }

  .pl-grupos{
    display:grid;
    grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));
    gap:12px;
    margin-bottom:6px;
  }

  .pl-grupos-anchas{
    grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));
  }

  .pl-grupo-card{
    border:1px solid var(--border);
    border-radius:12px;
    padding:12px 14px;
    background:#fbfdff;
  }

  .pl-grupo-title{
    font-weight:600;
    margin-bottom:6px;
  }

  .pl-grupo-eventos{
    font-size:13px;
    color:var(--text-soft);
    display:flex;
    flex-direction:column;
    gap:2px;
    margin-bottom:8px;
  }

  .pl-grupo-total{
    font-size:13px;
    border-top:1px dashed var(--border);
    padding-top:6px;
  }

  .pl-grupo-programacion{
    font-size:12px;
    color:var(--text-soft);
    border-top:1px dashed var(--border);
    padding-top:6px;
    margin-top:6px;
  }

  .pl-grupo-programacion-warning{
    color:var(--danger);
    font-weight:600;
  }

  .pl-grupo-card-warning{
    border-color:var(--danger);
    background:rgba(220,38,38,0.04);
  }

  .pl-kpi-warning{
    border-color:var(--danger);
  }

  .pl-kpi-warning .pl-kpi-value{
    color:var(--danger);
  }

  .pl-prog-vacio{
    padding:8px 0 4px;
  }

  .pl-alerta-sobreproduccion{
    margin-top:10px;
    padding:10px 14px;
    border-radius:10px;
    border:1px solid var(--danger);
    background:rgba(220,38,38,0.08);
    color:var(--danger);
    font-weight:600;
    font-size:13px;
  }

  .pl-fila-sobreproduccion td{
    background:rgba(220,38,38,0.06);
    color:var(--danger);
    font-weight:600;
  }

  .pl-tipo-radios{
    display:flex;
    gap:16px;
    align-items:center;
    height:38px;
  }

  .pl-tipo-radios label{
    display:flex;
    align-items:center;
    gap:6px;
    font-weight:500;
    font-size:13px;
    cursor:pointer;
  }

  .pl-badge-completa{
    display:inline-block;
    padding:2px 8px;
    border-radius:999px;
    font-size:11px;
    font-weight:600;
    background:rgba(16,120,80,0.12);
    color:#0c6b45;
  }

  .pl-badge-incompleta{
    display:inline-block;
    padding:2px 8px;
    border-radius:999px;
    font-size:11px;
    font-weight:600;
    background:rgba(220,38,38,0.10);
    color:var(--danger);
  }


  /* =====================================================
     SEMÁFORO DE AVANCE (Producción Actual)
     ===================================================== */

  .pl-grupo-card-header{
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:12px;
    margin-bottom:10px;
  }

  .pl-semaforo-wrap{
    display:flex;
    flex-direction:column;
    align-items:center;
    gap:6px;
    flex-shrink:0;
  }

  .pl-semaforo{
    display:flex;
    flex-direction:column;
    gap:5px;
    padding:6px 5px;
    border-radius:7px;
    background:linear-gradient(180deg,#26323d,#111a22);
    box-shadow:
      inset 0 0 0 1px rgba(255,255,255,0.08),
      inset 0 2px 4px rgba(0,0,0,0.45),
      0 1px 2px rgba(0,0,0,0.25);
  }

  .pl-semaforo-luz{
    width:12px;
    height:12px;
    border-radius:50%;
    display:block;
    background:rgba(255,255,255,0.07);
    box-shadow:inset 0 0 2px rgba(0,0,0,0.6);
    transition:background .15s ease, box-shadow .15s ease;
  }

  .pl-semaforo-luz.encendida.pl-semaforo-roja{
    background:radial-gradient(circle at 35% 30%, #ff8a7a, var(--danger));
    box-shadow:0 0 8px 3px rgba(220,38,38,0.75), inset 0 0 2px rgba(0,0,0,0.25);
  }

  .pl-semaforo-luz.encendida.pl-semaforo-ambar{
    background:radial-gradient(circle at 35% 30%, #ffe08a, var(--amber-deep, #D89216));
    box-shadow:0 0 8px 3px rgba(216,146,22,0.75), inset 0 0 2px rgba(0,0,0,0.25);
  }

  .pl-semaforo-luz.encendida.pl-semaforo-verde{
    background:radial-gradient(circle at 35% 30%, #8ee6b4, #0c6b45);
    box-shadow:0 0 8px 3px rgba(12,107,69,0.7), inset 0 0 2px rgba(0,0,0,0.25);
  }

  .pl-semaforo-texto{
    display:inline-block;
    font-size:10.5px;
    font-weight:700;
    letter-spacing:.03em;
    text-transform:uppercase;
    padding:3px 9px;
    border-radius:999px;
    white-space:nowrap;
    text-align:center;
  }

  .pl-semaforo-texto-roja{
    color:var(--danger);
    background:rgba(220,38,38,0.10);
  }

  .pl-semaforo-texto-ambar{
    color:var(--amber-deep, #D89216);
    background:rgba(216,146,22,0.12);
  }

  .pl-semaforo-texto-verde{
    color:#0c6b45;
    background:rgba(12,107,69,0.12);
  }

  .pl-semaforo-texto-gris{
    color:var(--text-soft);
    background:rgba(135,148,157,0.14);
  }

  .pl-semaforo-dot{
    display:inline-block;
    width:9px;
    height:9px;
    border-radius:50%;
    margin-right:7px;
    vertical-align:middle;
  }

  .pl-semaforo-dot-roja{
    background:var(--danger);
    box-shadow:0 0 5px 1px rgba(220,38,38,0.65);
  }

  .pl-semaforo-dot-ambar{
    background:var(--amber-deep, #D89216);
    box-shadow:0 0 5px 1px rgba(216,146,22,0.65);
  }

  .pl-semaforo-dot-verde{
    background:#0c6b45;
    box-shadow:0 0 5px 1px rgba(12,107,69,0.6);
  }

  .pl-semaforo-dot-gris{
    background:#B9C5CD;
  }

  .pl-resumen-semaforo{
    display:flex;
    flex-wrap:wrap;
    gap:10px;
    margin:0 0 18px;
  }

  .pl-resumen-chip{
    display:flex;
    align-items:center;
    gap:2px;
    padding:8px 14px;
    border-radius:8px;
    border:1px solid var(--border);
    background:#fff;
    font-size:13px;
    font-weight:600;
    color:var(--glacial-blue-dark);
  }

`;


/* =========================================================
   RENDER COMPLETO DE LA PESTAÑA "PALETAS"
   =========================================================

   Se llama desde renderMain() (06-registro.js) cuando
   state.currentTab === 'paletas', igual que renderFormTab(),
   renderHistorialTab() y renderGraficosTab().
   ========================================================= */

function renderPaletasTab(){

  if(
    !draftPaleta ||
    draftPaleta.linea !== state.currentLine
  ){

    draftPaleta = blankPaleta(state.currentLine);
    paletaEditId = null;

  }

  const c =
    document.getElementById('tab-content');

  if(!c){
    return;
  }

  const line =
    LINES.find(l => l.key === state.currentLine) ||
    { name: state.currentLine };

  const marcas =
    MARCAS_POR_LINEA[state.currentLine] || [];

  const presentaciones =
    PRESENTACIONES_POR_LINEA[state.currentLine] || [];

  /*
     Programación YA guardada para la combinación que está
     seleccionada ahora mismo en el formulario (línea + fecha
     + turno + marca + presentación) — para prellenar los
     campos y mostrar el estado actual sin tener que ir a
     "Producción actual" a buscarlo.
  */
  const programacionForm =
    resumenProgramacionCombinacion(
      state.currentLine,
      draftPaleta.fecha,
      draftPaleta.turno,
      draftPaleta.marca,
      draftPaleta.presentacion
    );

  const uppSugerida =
    programacionForm.unidadesPorPaleta ||
    obtenerUnidadesPorPalet(state.currentLine, draftPaleta.marca, draftPaleta.presentacion) ||
    '';

  const paletasProgramadasTexto =
    Number.isInteger(programacionForm.paletasProgramadas)
      ? programacionForm.paletasProgramadas
      : programacionForm.paletasProgramadas.toFixed(1);

  c.innerHTML = `

    <style>${PALETAS_CSS}</style>


    <div class="panel" id="paletas-form-panel">

      <div class="panel-head">
        <h3>
          ${paletaEditId ? 'Editar registro de paletas' : 'Registrar paletas'}
          · ${line.name}
        </h3>
      </div>

      <div class="panel-body grid grid-4">

        <div class="field-sm">
          <label>Fecha</label>
          <input
            type="date"
            value="${draftPaleta.fecha || ''}"
            onchange="actualizarPaletaCampoYRerenderizar(this,'fecha')"
          >
        </div>

        <div class="field-sm">
          <label>Turno</label>
          <select onchange="actualizarPaletaCampoYRerenderizar(this,'turno')">
            ${
              ['DÍA', 'INTERMEDIO', 'NOCHE'].map(t => `
                <option value="${t}" ${t === draftPaleta.turno ? 'selected' : ''}>
                  ${t}
                </option>
              `).join('')
            }
          </select>
        </div>

        <div class="field-sm">
          <label>Marca</label>
          <select onchange="actualizarPaletaCampoYRerenderizar(this,'marca')">
            ${
              marcas.length
                ? marcas.map(m => `
                    <option value="${escaparHtml(m)}" ${m === draftPaleta.marca ? 'selected' : ''}>
                      ${escaparHtml(m)}
                    </option>
                  `).join('')
                : `<option value="">Sin marcas configuradas</option>`
            }
          </select>
        </div>

        <div class="field-sm">
          <label>Presentación</label>
          <select onchange="actualizarPaletaCampoYRerenderizar(this,'presentacion')">
            ${
              presentaciones.length
                ? presentaciones.map(p => `
                    <option value="${escaparHtml(p)}" ${p === draftPaleta.presentacion ? 'selected' : ''}>
                      ${escaparHtml(p)}
                    </option>
                  `).join('')
                : `<option value="">Sin presentaciones configuradas</option>`
            }
          </select>
        </div>

      </div>


      <div class="panel-body grid grid-4" style="align-items:end;">

        <div class="field-sm">
          <label>
            Cantidad programada (UND) — ${draftPaleta.turno}
          </label>
          <input
            type="number"
            min="0"
            step="1"
            inputmode="numeric"
            id="paleta-programada-input"
            value="${programacionForm.cantidadProgramada || ''}"
          >
        </div>

        <div class="field-sm">
          <label>Unidades por paleta</label>
          <input
            type="number"
            min="0"
            step="1"
            inputmode="numeric"
            id="paleta-programada-upp-input"
            value="${uppSugerida}"
          >
        </div>

        <div class="field-sm">
          <button
            class="btn btn-ghost"
            id="btn-guardar-programacion"
            onclick="guardarProgramacionDesdeFormulario()"
          >
            Guardar programación
          </button>
        </div>

        <div class="small-muted" style="align-self:center;">
          ${
            programacionForm.cantidadProgramada
              ? 'Programado: ' + programacionForm.cantidadProgramada.toLocaleString('es-PE') +
                ' UND ≈ ' + paletasProgramadasTexto + ' paletas'
              : 'Todavía no se registró una cantidad programada para esta combinación.'
          }
        </div>

      </div>


      <div class="panel-body grid grid-4">

        <div class="field-sm">
          <label>Hora</label>
          <input
            type="time"
            value="${draftPaleta.hora || ''}"
            oninput="actualizarPaletaCampo('hora', this.value)"
          >
        </div>

        <div class="field-sm">
          <label>Tipo de paleta</label>
          <div class="pl-tipo-radios">
            <label>
              <input
                type="radio"
                name="pl-tipo"
                value="COMPLETA"
                ${draftPaleta.tipoPaleta !== 'INCOMPLETA' ? 'checked' : ''}
                onchange="actualizarTipoPaletaYRerenderizar('COMPLETA')"
              >
              Completa
            </label>
            <label>
              <input
                type="radio"
                name="pl-tipo"
                value="INCOMPLETA"
                ${draftPaleta.tipoPaleta === 'INCOMPLETA' ? 'checked' : ''}
                onchange="actualizarTipoPaletaYRerenderizar('INCOMPLETA')"
              >
              Incompleta
            </label>
          </div>
        </div>

        ${
          draftPaleta.tipoPaleta === 'INCOMPLETA'
            ? `
              <div class="field-sm">
                <label>Unidades de esta paleta</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  value="${draftPaleta.unidadesIncompleta ?? ''}"
                  oninput="actualizarPaletaUnidadesIncompleta(this.value)"
                >
                <div
                  class="small-muted"
                  id="paleta-preview-unidades"
                  style="margin-top:4px;"
                >
                  ${textoPreviaUnidadesPaleta()}
                </div>
              </div>
            `
            : `
              <div class="field-sm">
                <label>Cantidad de paletas completas</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputmode="numeric"
                  value="${draftPaleta.paletas ?? ''}"
                  oninput="actualizarPaletaCantidad(this.value)"
                >
                <div
                  class="small-muted"
                  id="paleta-preview-unidades"
                  style="margin-top:4px;"
                >
                  ${textoPreviaUnidadesPaleta()}
                </div>
              </div>
            `
        }

        <div class="field-sm">
          <label>Observaciones</label>
          <input
            type="text"
            value="${escaparHtml(draftPaleta.observaciones || '')}"
            oninput="actualizarPaletaCampo('observaciones', this.value)"
          >
        </div>

      </div>

      <div class="actions-row">

        <button
          class="btn btn-primary"
          id="btn-guardar-paleta"
          onclick="guardarPaleta()"
        >
          ${paletaEditId ? 'Actualizar registro' : 'Guardar'}
        </button>

        ${
          paletaEditId
            ? `
              <button
                class="btn btn-ghost btn-sm"
                onclick="cancelarEdicionPaleta()"
              >
                Cancelar edición
              </button>
            `
            : ''
        }

      </div>

    </div>


    <div class="panel" style="margin-top:14px;">

      <div class="panel-head">
        <h3>
          Producción del turno ${draftPaleta.turno} · ${draftPaleta.fecha || ''}
        </h3>
      </div>

      <div class="panel-body" id="paletas-resultados">
        ${renderPaletasResultados()}
      </div>

    </div>

  `;

}

/* =============================================================
   PRODUCCIÓN ACTUAL — TODAS LAS LÍNEAS (SOLO LECTURA, VENTAS)
   =============================================================

   Pestaña global (no depende de state.currentLine, igual que
   Resumen general / Impacto Económico — ver goProduccionActual()
   en 04-sidebar.js y renderMain() en 06-registro.js). Junta en
   una sola vista lo que cada supervisor va registrando en
   "Paletas" (arriba, en este mismo archivo) de TODAS las
   líneas, para que Ventas no tenga que entrar línea por línea.

   Es de solo lectura: no hay formulario, no hay draft que
   proteger, así que a diferencia de actualizarVistaPaletas()
   (que solo reemplaza el bloque de resultados) aquí sí se
   puede volver a dibujar la pestaña completa cada vez que
   llega un cambio en tiempo real (ver onPaletasUpdated() /
   onProgramacionesUpdated() en 02-estado.js).
   ============================================================= */

const TURNOS_PALETAS = ['DÍA', 'INTERMEDIO', 'NOCHE'];

let produccionActualFecha = null;
let produccionActualTurno = 'TODOS';


/*
   Combinaciones marca+presentación que tienen ALGO que mostrar
   para una línea+fecha+turnos dados: ya sea porque hay
   registros de producción (sync/paletas) o porque hay una
   cantidad programada (sync/programaciones) — así una
   programación cargada por adelantado, sin producción todavía,
   también aparece en el tablero.
*/
function combinacionesConDatosPaletas(linea, fecha, turnos){

  const vistos = new Set();
  const combos = [];

  function agregar(marca, presentacion){

    const clave =
      (marca || '') + '|' + (presentacion || '');

    if(!vistos.has(clave)){
      vistos.add(clave);
      combos.push({ marca, presentacion });
    }

  }

  loadPaletas().forEach(p => {

    if(
      p.linea === linea &&
      p.fecha === fecha &&
      turnos.includes(p.turno)
    ){
      agregar(p.marca, p.presentacion);
    }

  });

  loadProgramaciones().forEach(pr => {

    if(
      pr.linea === linea &&
      pr.fecha === fecha &&
      turnos.includes(pr.turno) &&
      num(pr.cantidadProgramada) > 0
    ){
      agregar(pr.marca, pr.presentacion);
    }

  });

  return combos;

}


function turnosSeleccionadosProduccionActual(){

  return (
    produccionActualTurno === 'TODOS'
      ? TURNOS_PALETAS
      : [produccionActualTurno]
  );

}


function cambiarFechaProduccionActual(valor){

  produccionActualFecha = valor;

  renderProduccionActualTab();

}


function cambiarTurnoProduccionActual(valor){

  produccionActualTurno = valor;

  renderProduccionActualTab();

}


/*
   Agrupa el mismo cálculo de arriba (resumenProgramacionCombinacionTurnos),
   pero por MARCA+PRESENTACIÓN, sumando todas las líneas que la
   producen — para que "Producción actual" pueda mostrar un
   card por producto en vez de un solo total mezclado.

   Por qué hace falta esto (y no solo sumar todo en un total
   general): si un producto sobreprodujo y otro se quedó atrás,
   sumar los "pendiente" de cada combinación por separado da un
   número real (nunca se "cancela" restando la sobreproducción
   de uno contra el atraso de otro), pero ESE total, comparado
   contra el total producido, puede parecer contradictorio a
   simple vista ("¿cómo va a faltar producción si ya se produjo
   de más?"). Separado por producto, cada card se explica sola:
   el que sobreprodujo lo muestra con su alerta, y el que está
   atrasado muestra su propio pendiente — sin mezclarlos.
*/
function productosProduccionActual(fecha, turnos){

  const grupos = {};

  LINES.forEach(line => {

    const combos =
      combinacionesConDatosPaletas(line.key, fecha, turnos);

    combos.forEach(combo => {

      const r =
        resumenProgramacionCombinacionTurnos(
          line.key, fecha, turnos, combo.marca, combo.presentacion
        );

      const key =
        (combo.marca || '—') + '|' + (combo.presentacion || '—');

      if(!grupos[key]){

        grupos[key] = {
          marca: combo.marca,
          presentacion: combo.presentacion,
          lineas: [],
          cantidadProgramada: 0,
          paletasProgramadas: 0,
          unidadesProducidas: 0,
          paletasCompletas: 0,
          paletasIncompletasCount: 0,
          unidadesIncompletas: 0
        };

      }

      const g = grupos[key];

      g.lineas.push(line.name);

      g.cantidadProgramada += r.cantidadProgramada;
      g.paletasProgramadas += r.paletasProgramadas;
      g.unidadesProducidas += r.unidadesProducidas;
      g.paletasCompletas += r.paletasCompletas;
      g.paletasIncompletasCount += r.paletasIncompletasCount;
      g.unidadesIncompletas += r.unidadesIncompletas;

    });

  });

  return Object.values(grupos)

    .map(g => {

      const unidadesPendientes =
        Math.max(0, g.cantidadProgramada - g.unidadesProducidas);

      const sobreproduccion =
        g.cantidadProgramada > 0 && g.unidadesProducidas > g.cantidadProgramada;

      const porcentajeAvance =
        g.cantidadProgramada > 0
          ? (g.unidadesProducidas / g.cantidadProgramada) * 100
          : 0;

      return {
        ...g,
        unidadesPendientes,
        sobreproduccion,
        porcentajeAvance
      };

    })

    .sort((a, b) => {

      const ma = (a.marca || '').localeCompare(b.marca || '');

      if(ma !== 0){
        return ma;
      }

      return (a.presentacion || '').localeCompare(b.presentacion || '');

    });

}


/* =========================================================
   SEMÁFORO DE AVANCE (Producción Actual)
   =========================================================

   Traduce programado/producido a un estado de 3 colores, igual
   que un semáforo de planta, para que jefatura/gerencia lea el
   avance de un vistazo sin tener que leer cada porcentaje:

     GRIS  → combinación sin cantidad programada (no hay con
             qué comparar todavía).
     ROJA  → 0% o muy poco avance (< 60%): atrasado.
     ÁMBAR → avance intermedio (60%–99.9%): en curso.
     VERDE → 100% o más (incluye sobreproducción): completo.

   Un solo cálculo (estadoSemaforoProduccion) alimenta las 3
   formas en que se muestra en pantalla: el semáforo completo
   de 3 luces (card por producto), el chip de texto (KPI de
   cumplimiento general) y el punto de color (fila de la
   tabla de detalle).
   ========================================================= */

function estadoSemaforoProduccion(cantidadProgramada, porcentajeAvance, sobreproduccion){

  if(!cantidadProgramada){

    return { nivel:'gris', texto:'Sin programar' };

  }

  if(sobreproduccion || porcentajeAvance >= 100){

    return {
      nivel:'verde',
      texto: sobreproduccion ? 'Completo (sobreprod.)' : 'Completo'
    };

  }

  if(porcentajeAvance >= 60){

    return { nivel:'ambar', texto:'En curso' };

  }

  if(porcentajeAvance > 0){

    return { nivel:'roja', texto:'Atrasado' };

  }

  return { nivel:'roja', texto:'Sin iniciar' };

}


/*
   Semáforo completo (3 luces, con la que corresponde
   encendida) + su etiqueta de texto. Se usa en el encabezado
   de cada card de producto.
*/
function renderSemaforoWidget(estado){

  return `

    <div class="pl-semaforo-wrap" title="${estado.texto}">

      <div class="pl-semaforo">
        <span class="pl-semaforo-luz pl-semaforo-roja ${estado.nivel === 'roja' ? 'encendida' : ''}"></span>
        <span class="pl-semaforo-luz pl-semaforo-ambar ${estado.nivel === 'ambar' ? 'encendida' : ''}"></span>
        <span class="pl-semaforo-luz pl-semaforo-verde ${estado.nivel === 'verde' ? 'encendida' : ''}"></span>
      </div>

      <span class="pl-semaforo-texto pl-semaforo-texto-${estado.nivel}">
        ${estado.texto}
      </span>

    </div>

  `;

}


/*
   Chip de texto solo (sin las 3 luces) — para lugares más
   compactos, como el KPI de "Cumplimiento general".
*/
function renderSemaforoChip(estado){

  return `
    <span class="pl-semaforo-texto pl-semaforo-texto-${estado.nivel}" title="${estado.texto}">
      ${estado.texto}
    </span>
  `;

}


/*
   Punto de color + texto — para filas de tabla, donde no cabe
   el semáforo de 3 luces completo.
*/
function renderSemaforoDot(estado){

  return `
    <span class="pl-semaforo-dot pl-semaforo-dot-${estado.nivel}" title="${estado.texto}"></span>${estado.texto}
  `;

}


/*
   Fila de chips resumen ("3 atrasados · 5 en curso · 2
   completos...") arriba de las cards por producto, para que
   de un vistazo se sepa cuántos productos están en cada
   estado sin tener que contar las cards una por una.
*/
function renderResumenSemaforoProductos(productos){

  const conteo = { verde:0, ambar:0, roja:0, gris:0 };

  productos.forEach(p => {

    const estado =
      estadoSemaforoProduccion(
        p.cantidadProgramada, p.porcentajeAvance, p.sobreproduccion
      );

    conteo[estado.nivel]++;

  });

  const chips = [
    { nivel:'verde', label:'completos', valor: conteo.verde },
    { nivel:'ambar', label:'en curso', valor: conteo.ambar },
    { nivel:'roja', label:'atrasados', valor: conteo.roja },
    { nivel:'gris', label:'sin programar', valor: conteo.gris }
  ].filter(c => c.valor > 0);

  if(!chips.length){
    return '';
  }

  return `

    <div class="pl-resumen-semaforo">

      ${
        chips.map(c => `
          <div class="pl-resumen-chip">
            <span class="pl-semaforo-dot pl-semaforo-dot-${c.nivel}"></span>
            ${c.valor} ${c.label}
          </div>
        `).join('')
      }

    </div>

  `;

}


/*
   Card individual de un producto (marca+presentación) dentro
   de "Producción actual". Mismo estilo visual que
   renderBloqueProgramacion (16-paletas.js, formulario por
   línea), pero mostrando también en qué línea(s) se produjo,
   con el semáforo de avance en el encabezado.
*/
function renderProductoProduccionActualCard(p){

  const paletasProgTexto =
    Number.isInteger(p.paletasProgramadas)
      ? p.paletasProgramadas
      : p.paletasProgramadas.toFixed(1);

  const lineasUnicas =
    [...new Set(p.lineas)];

  const estadoSemaforo =
    estadoSemaforoProduccion(
      p.cantidadProgramada, p.porcentajeAvance, p.sobreproduccion
    );

  return `

    <div class="pl-grupo-card ${p.sobreproduccion ? 'pl-grupo-card-warning' : ''}">

      <div class="pl-grupo-card-header">

        <div>

          <div class="pl-grupo-title">
            ${escaparHtml(p.marca || '—')} · ${escaparHtml(p.presentacion || '—')}
          </div>

          <div class="small-muted">
            Línea${lineasUnicas.length > 1 ? 's' : ''}: ${escaparHtml(lineasUnicas.join(' · ') || '—')}
          </div>

        </div>

        ${renderSemaforoWidget(estadoSemaforo)}

      </div>

      ${
        p.cantidadProgramada
          ? `
            <div class="pl-kpis pl-kpis-prog" style="margin-bottom:0;">

              <div class="pl-kpi">
                <div class="pl-kpi-label">Programado</div>
                <div class="pl-kpi-value">${p.cantidadProgramada.toLocaleString('es-PE')} UND</div>
                <div class="small-muted">${paletasProgTexto} paletas</div>
              </div>

              <div class="pl-kpi">
                <div class="pl-kpi-label">Producido</div>
                <div class="pl-kpi-value">${p.unidadesProducidas.toLocaleString('es-PE')} UND</div>
                <div class="small-muted">
                  ${p.paletasCompletas} completas
                  ${p.paletasIncompletasCount ? ' + ' + p.unidadesIncompletas.toLocaleString('es-PE') + ' und. incompleta' : ''}
                </div>
              </div>

              <div class="pl-kpi ${p.sobreproduccion ? 'pl-kpi-warning' : ''}">
                <div class="pl-kpi-label">Pendiente</div>
                <div class="pl-kpi-value">${p.unidadesPendientes.toLocaleString('es-PE')} UND</div>
              </div>

              <div class="pl-kpi ${p.sobreproduccion ? 'pl-kpi-warning' : ''}">
                <div class="pl-kpi-label">Avance</div>
                <div class="pl-kpi-value">${p.porcentajeAvance.toFixed(1)}%</div>
              </div>

            </div>

            ${
              p.sobreproduccion
                ? `
                  <div class="pl-alerta-sobreproduccion" style="margin-top:10px;">
                    ⚠ SOBREPRODUCCIÓN: ${(p.unidadesProducidas - p.cantidadProgramada).toLocaleString('es-PE')}
                    und. más de lo programado (${p.unidadesProducidas.toLocaleString('es-PE')} de ${p.cantidadProgramada.toLocaleString('es-PE')} UND).
                  </div>
                `
                : ''
            }
          `
          : `
            <div class="small-muted">
              Sin cantidad programada. Producido:
              <strong>${p.unidadesProducidas.toLocaleString('es-PE')} UND</strong>
              (${p.paletasCompletas} paletas completas${p.paletasIncompletasCount ? ' + ' + p.unidadesIncompletas.toLocaleString('es-PE') + ' und. en ' + p.paletasIncompletasCount + ' incompleta' + (p.paletasIncompletasCount > 1 ? 's' : '') : ''}).
            </div>
          `
      }

    </div>

  `;

}


/*
   Bloque de resultados: totales generales (referenciales) +
   un card por MARCA+PRESENTACIÓN (lo que evita la confusión de
   un solo total mezclado — ver productosProduccionActual) +
   el detalle fila por fila línea+marca+presentación, para quien
   necesite ese nivel de detalle. Se separa del resto del render
   para poder refrescarlo solo si más adelante se agrega un
   refresco parcial (hoy renderProduccionActualTab() vuelve a
   dibujar todo, ver comentario arriba). Todo en UNIDADES, con
   el detalle de paletas completas/incompletas como referencia.
*/
function renderProduccionActualResultados(){

  const fecha =
    produccionActualFecha || fechaHoyPaletas();

  const turnos =
    turnosSeleccionadosProduccionActual();

  const productos =
    productosProduccionActual(fecha, turnos);

  let totalProgramadoUnd = 0;
  let totalProducidoUnd = 0;
  let totalPendienteUnd = 0;
  let filasHtml = '';
  let hayFilas = false;

  LINES.forEach(line => {

    const combos =
      combinacionesConDatosPaletas(line.key, fecha, turnos);

    combos.forEach(combo => {

      const r =
        resumenProgramacionCombinacionTurnos(
          line.key, fecha, turnos, combo.marca, combo.presentacion
        );

      hayFilas = true;

      totalProgramadoUnd += r.cantidadProgramada;
      totalProducidoUnd += r.unidadesProducidas;
      totalPendienteUnd += r.unidadesPendientes;

      const estadoSemaforo =
        estadoSemaforoProduccion(
          r.cantidadProgramada, r.porcentajeAvance, r.sobreproduccion
        );

      filasHtml += `

        <tr class="${r.sobreproduccion ? 'pl-fila-sobreproduccion' : ''}">
          <td>${escaparHtml(line.name)}</td>
          <td>${escaparHtml(combo.marca || '—')}</td>
          <td>${escaparHtml(combo.presentacion || '—')}</td>
          <td>${r.cantidadProgramada ? r.cantidadProgramada.toLocaleString('es-PE') : '—'}</td>
          <td>${r.unidadesProducidas.toLocaleString('es-PE')}</td>
          <td>
            ${r.paletasCompletas} completas
            ${r.paletasIncompletasCount ? ' + ' + r.unidadesIncompletas.toLocaleString('es-PE') + ' und. incompleta' : ''}
          </td>
          <td>${r.unidadesPendientes.toLocaleString('es-PE')}</td>
          <td>${r.cantidadProgramada ? r.porcentajeAvance.toFixed(1) + '%' : '—'}</td>
          <td>${renderSemaforoDot(estadoSemaforo)}</td>
        </tr>

      `;

    });

  });

  const cumplimientoGeneral =
    totalProgramadoUnd > 0
      ? (totalProducidoUnd / totalProgramadoUnd) * 100
      : 0;

  const estadoGeneralSemaforo =
    estadoSemaforoProduccion(
      totalProgramadoUnd,
      cumplimientoGeneral,
      totalProgramadoUnd > 0 && totalProducidoUnd > totalProgramadoUnd
    );

  return `

    <div class="pl-kpis">

      <div class="pl-kpi">
        <div class="pl-kpi-label">Programado (todas las líneas)</div>
        <div class="pl-kpi-value">${totalProgramadoUnd.toLocaleString('es-PE')}</div>
        <div class="small-muted">unidades</div>
      </div>

      <div class="pl-kpi">
        <div class="pl-kpi-label">Producido</div>
        <div class="pl-kpi-value">${totalProducidoUnd.toLocaleString('es-PE')}</div>
        <div class="small-muted">unidades</div>
      </div>

      <div class="pl-kpi ${totalProgramadoUnd && totalProducidoUnd > totalProgramadoUnd ? 'pl-kpi-warning' : ''}">
        <div class="pl-kpi-label">Pendiente</div>
        <div class="pl-kpi-value">${totalPendienteUnd.toLocaleString('es-PE')}</div>
        <div class="small-muted">unidades</div>
      </div>

      <div class="pl-kpi">
        <div class="pl-kpi-label">Cumplimiento general</div>
        <div class="pl-kpi-value">${totalProgramadoUnd ? cumplimientoGeneral.toFixed(1) + '%' : '—'}</div>
        <div style="margin-top:6px;">${renderSemaforoChip(estadoGeneralSemaforo)}</div>
      </div>

    </div>

    <div class="small-muted" style="margin:-6px 0 18px;">
      Este total suma cada producto por separado, así que si uno
      sobreproduce mientras otro se atrasa, los números de arriba
      pueden parecer no cuadrar. Revisa el detalle por producto
      abajo para saber exactamente cuál está pendiente.
    </div>


    ${renderResumenSemaforoProductos(productos)}

    <div class="section-title" style="margin-top:0;">
      Por marca y presentación
    </div>

    ${
      productos.length
        ? `
          <div class="pl-grupos pl-grupos-anchas" style="margin-bottom:18px;">
            ${productos.map(renderProductoProduccionActualCard).join('')}
          </div>
        `
        : `
          <div class="small-muted" style="padding:10px 0 18px;">
            Sin registros ni programación para la fecha/turno seleccionados.
          </div>
        `
    }


    <div class="section-title">
      Detalle por línea
    </div>

    <div style="overflow-x:auto;">

      <table>

        <thead>
          <tr>
            <th>Línea</th>
            <th>Marca</th>
            <th>Presentación</th>
            <th>Programado (UND)</th>
            <th>Producido (UND)</th>
            <th>Paletas</th>
            <th>Pendiente (UND)</th>
            <th>Avance</th>
            <th>Estado</th>
          </tr>
        </thead>

        <tbody>

          ${
            hayFilas
              ? filasHtml
              : `
                <tr>
                  <td colspan="9" class="small-muted" style="padding:14px 0;">
                    Sin registros ni programación para la fecha/turno seleccionados, en ninguna línea.
                  </td>
                </tr>
              `
          }

        </tbody>

      </table>

    </div>

  `;

}


/*
   Render completo de la pestaña. Se llama desde renderMain()
   (06-registro.js) cuando state.currentTab === 'produccion-actual',
   igual que renderResumen()/renderPerdidasSoles() para las
   otras pestañas globales.
*/
function renderProduccionActualTab(){

  const main =
    document.getElementById('main');

  if(!main){
    return;
  }

  if(!produccionActualFecha){
    produccionActualFecha = fechaHoyPaletas();
  }

  main.innerHTML = `

    <style>${PALETAS_CSS}</style>

    <div class="main-head">

      <div>

        <h2>Producción actual</h2>

        <div class="sub">
          Paletas que cada supervisor va registrando en "Paletas",
          en todas las líneas, en tiempo real.
        </div>

      </div>

    </div>


    <div class="panel">

      <div class="panel-body grid grid-3">

        <div class="field-sm">
          <label>Fecha</label>
          <input
            type="date"
            value="${produccionActualFecha}"
            onchange="cambiarFechaProduccionActual(this.value)"
          >
        </div>

        <div class="field-sm">
          <label>Turno</label>
          <select onchange="cambiarTurnoProduccionActual(this.value)">
            ${
              ['TODOS', ...TURNOS_PALETAS].map(t => `
                <option value="${t}" ${t === produccionActualTurno ? 'selected' : ''}>
                  ${t === 'TODOS' ? 'Todos los turnos' : t}
                </option>
              `).join('')
            }
          </select>
        </div>

      </div>

    </div>


    <div class="panel" style="margin-top:14px;">

      <div class="panel-head">
        <h3>
          Programado vs. producido · ${produccionActualFecha}
          · ${produccionActualTurno === 'TODOS' ? 'Todos los turnos' : produccionActualTurno}
        </h3>
      </div>

      <div class="panel-body" id="produccion-actual-resultados">
        ${renderProduccionActualResultados()}
      </div>

    </div>

  `;

}