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

   - PROGRAMACIÓN: siempre en UNIDADES (UND). Jefatura o una persona
     con el permiso programarPaletas
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
   NOMBRE AMIGABLE DE PRESENTACIÓN — SOLO VISUAL
   =========================================================
   IMPORTANTE: esta función NO cambia el valor interno que se
   guarda en Firestore. Solo traduce el código técnico para UI.
*/
function nombrePresentacionUI(linea, marca, presentacion){

  const original = String(presentacion || '').trim();
  if(!original) return '—';

  const txt = original.toLowerCase();
  const lineaTxt = String(linea || '').toUpperCase();
  const esAlcalina = txt.includes('alcalina');
  const conSticker = txt.includes('sticker') || txt.includes('(y)');

  // Cajas y bidones de 20 L: no aporta mostrar "PACK X 1 UND".
  if(lineaTxt === 'C20L' || txt.includes('caja') && txt.includes('20l')){
    return 'CAJA 20 L';
  }
  if(lineaTxt === 'B20L' || txt.includes('bidon') && txt.includes('20l') || txt.includes('bidón') && txt.includes('20l')){
    return 'BIDÓN 20 L';
  }

  // Lee códigos como 380mlx24und, 625mlx15und, 1lx12und,
  // 1.5lx6und, 2.5lx6und y 7000mlx2und sin alterar el código.
  let volumen = '';
  let unidades = '';

  let m = txt.match(/(\d+(?:[.,]\d+)?)\s*ml\s*x?\s*(\d+)\s*und/);
  if(m){
    const ml = Number(m[1].replace(',', '.'));
    volumen = ml === 1000 ? '1 L' : ml === 1500 ? '1.5 L' : ml === 2500 ? '2.5 L' : ml === 7000 ? '7 L' : `${ml} ML`;
    unidades = m[2];
  } else {
    m = txt.match(/(\d+(?:[.,]\d+)?)\s*l\s*x?\s*(\d+)\s*und/);
    if(m){
      const litros = Number(m[1].replace(',', '.'));
      volumen = `${Number.isInteger(litros) ? litros : litros.toFixed(1)} L`;
      unidades = m[2];
    }
  }

  // Respaldo para 7 L si algún código antiguo no trae x1/x2.
  if(!volumen && (txt.includes('7000ml') || txt.includes('7l'))){
    volumen = '7 L';
    unidades = normalizarTexto(marca) === 'bells' ? '1' : '2';
  }

  if(volumen){
    const partes = [volumen];
    if(esAlcalina) partes.push('ALCALINA');
    if(unidades) partes.push(`PACK X ${unidades} UND`);
    if(conSticker) partes.push('C/S');
    return partes.join(' · ');
  }

  // Si aparece una presentación nueva que aún no reconocemos,
  // mostramos el valor original en vez de inventar una etiqueta.
  return original;
}



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
   combinación: primero la que el usuario autorizado haya guardado en
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
   "unidadesPorPaleta" es la que planificación definió para
   esa combinación (producto + presentación).
*/
async function guardarProgramacionPaleta(linea, fecha, turno, marca, presentacion, cantidadUnidades, unidadesPorPaleta){

  if(!puedeProgramarPaletas() ||
     !visibleLines().some(l => l.key === linea)){
    throw new Error('No tienes permiso para programar esta línea.');
  }

  const clave =
    claveProgramacionPaleta(linea, fecha, turno, marca, presentacion);

  const cantidadNum =
    Math.max(0, num(cantidadUnidades));

  const uppNum =
    Math.max(0, num(unidadesPorPaleta));

  if(!Number.isInteger(Number(cantidadUnidades)) ||
     !Number.isInteger(Number(unidadesPorPaleta)) ||
     Number(cantidadUnidades) < 0 ||
     Number(unidadesPorPaleta) < 0 ||
     (cantidadNum > 0 && uppNum === 0)){
    throw new Error('La programación requiere unidades enteras y unidades por paleta válidas.');
  }

  const campos = {
    cantidadProgramada: cantidadNum,
    unidadesPorPaleta: uppNum,
    paletasProgramadas: uppNum ? cantidadNum / uppNum : 0,
    actualizadoPor: nombreUsuarioActualPaletas(),
    actualizadoEn: Date.now()
  };

  // Se fusiona una sola combinación en la transacción. Dos jefes que
  // programen líneas diferentes no se borran entre sí.
  const ref = db.collection('sync').doc('programaciones');
  const items = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const actuales = snap.exists && Array.isArray(snap.data().items)
      ? snap.data().items.slice() : [];
    const idx = actuales.findIndex(p => p.clave === clave);
    if(idx > -1){
      actuales[idx] = {...actuales[idx], ...campos};
    } else {
      actuales.push({
        id:'prog_' + Date.now() + '_' + Math.random().toString(36).slice(2,8),
        clave, linea, fecha, turno, marca, presentacion, ...campos,
        creadoPor:nombreUsuarioActualPaletas(), creadoEn:Date.now()
      });
    }
    tx.set(ref,{items:actuales,updatedAt:Date.now()});
    return actuales;
  });
  _programacionesCache = items;

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
    return 'Sin unidades por paleta configuradas. Solicita a jefatura que configure esta presentación.';
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

  if(!tienePermiso('paletas') ||
     !draftPaleta ||
     !visibleLines().some(l => l.key === draftPaleta.linea)){
    alert('No tienes permiso para registrar paletas en esta línea.');
    return;
  }

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
        'Solicita a jefatura que configure las unidades por paleta de esta presentación.'
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
    const idRegistro = paletaEditId ||
      'pal_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    const cambio = {
        id:idRegistro,
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

        creadoEn: Date.now(),
        actualizadoPor: nombreUsuarioActualPaletas(),
        actualizadoEn: Date.now()
    };

    // Fusiona solo este registro; los supervisores de otras líneas
    // pueden guardar al mismo tiempo sin perder sus anotaciones.
    const ref = db.collection('sync').doc('paletas');
    const registros = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const items = snap.exists && Array.isArray(snap.data().items)
        ? snap.data().items.slice() : [];
      const idx = items.findIndex(p => p.id === idRegistro);
      if(paletaEditId && idx < 0){
        throw new Error('El registro que intentas editar ya no existe.');
      }
      if(idx > -1)items[idx] = {
        ...items[idx],...cambio,
        usuario:items[idx].usuario,
        usuarioUsername:items[idx].usuarioUsername,
        creadoEn:items[idx].creadoEn
      };
      else items.push(cambio);
      tx.set(ref,{items,updatedAt:Date.now()});
      return items;
    });
    _paletasCache = registros;

    /*
       Sincroniza automáticamente la presentación EN CURSO con el
       producto que acaba de registrar producción. Así el tablero
       no puede dejar otra marca (por ejemplo Scala) como EN CURSO
       cuando las paletas que realmente avanzan son de Cuisine.
    */
    if(typeof db !== 'undefined'){
      const refProg = db.collection('sync').doc('programaciones');
      const claveActual = claveProgramacionPaleta(
        draftPaleta.linea,
        draftPaleta.fecha,
        draftPaleta.turno === 'INTERMEDIO' ? 'DÍA' : draftPaleta.turno,
        draftPaleta.marca,
        draftPaleta.presentacion
      );

      try{
        const programacionesActualizadas = await db.runTransaction(async tx => {
          const snapProg = await tx.get(refProg);
          const itemsProg = snapProg.exists && Array.isArray(snapProg.data().items)
            ? snapProg.data().items.slice() : [];
          const idxProg = itemsProg.findIndex(p => p.clave === claveActual);

          if(idxProg < 0 || num(itemsProg[idxProg].cantidadProgramada) <= 0){
            return itemsProg;
          }

          const ahoraOp = Date.now();
          const mismaLineaPlan = p =>
            p.linea === draftPaleta.linea &&
            p.fecha === draftPaleta.fecha &&
            (draftPaleta.turno === 'INTERMEDIO'
              ? ['DÍA','INTERMEDIO'].includes(p.turno)
              : p.turno === draftPaleta.turno);

          itemsProg.forEach((p,j) => {
            if(j === idxProg || !mismaLineaPlan(p))return;
            if(p.estadoOperacion?.estado === 'EN_PRODUCCION'){
              itemsProg[j] = {
                ...p,
                estadoOperacion:{
                  ...p.estadoOperacion,
                  estado:'PENDIENTE',
                  actualizadoEn:ahoraOp,
                  actualizadoPor:nombreUsuarioActualPaletas()
                }
              };
            }
          });

          const previo = itemsProg[idxProg].estadoOperacion || {};
          if(previo.estado !== 'CANCELADA' && previo.estado !== 'FINALIZADA'){
            const producidoActual = resumenProgramacionCombinacionTurnos(
              draftPaleta.linea,
              draftPaleta.fecha,
              [draftPaleta.turno],
              draftPaleta.marca,
              draftPaleta.presentacion
            ).unidadesProducidas;

            itemsProg[idxProg] = {
              ...itemsProg[idxProg],
              estadoOperacion:{
                ...previo,
                estado:'EN_PRODUCCION',
                inicio: previo.inicio || ahoraOp,
                baseUnidades: previo.inicio
                  ? num(previo.baseUnidades)
                  : Math.max(0,num(producidoActual)-num(totalUnidades)),
                pausaDesde:0,
                detenidaDesde:0,
                motivo:'',
                actualizadoEn:ahoraOp,
                actualizadoPor:nombreUsuarioActualPaletas()
              }
            };
          }

          tx.set(refProg,{items:itemsProg,updatedAt:ahoraOp});
          return itemsProg;
        });

        _programacionesCache = programacionesActualizadas;
      }catch(err){
        console.warn('Paleta guardada, pero no se pudo sincronizar EN CURSO:',err);
      }
    }

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

  } catch(error){
    if(typeof _avisarErrorGuardado === 'function'){
      _avisarErrorGuardado('paletas',error);
    } else {
      console.error('Error guardando paletas:',error);
    }
  } finally {

    _guardandoPaleta = false;
    if(btn && btn.isConnected !== false){
      btn.disabled = false;
      btn.textContent = textoOriginalBtn;
    }

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

  if(!puedeProgramarPaletas()){
    alert('No tienes permiso para registrar producción programada.');
    return;
  }

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

  if(!Number.isInteger(cantidad) || cantidad < 0 ||
     !Number.isInteger(unidadesPorPaleta) || unidadesPorPaleta < 0){
    alert('Ingresa valores enteros y no negativos en unidades.');
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

  } catch(error){
    if(typeof _avisarErrorGuardado === 'function'){
      _avisarErrorGuardado('programación de paletas',error);
    } else {
      console.error('Error guardando programación de paletas:',error);
    }

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

async function eliminarPaleta(id){

  if(!tienePermiso('eliminarRegistros')){
    alert('No tienes permiso para eliminar registros.');
    return;
  }

  if(!confirm('¿Eliminar este registro de paletas?')){
    return;
  }

  try{
    const ref=db.collection('sync').doc('paletas');
    const registros=await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      const items=snap.exists && Array.isArray(snap.data().items)
        ? snap.data().items.filter(p=>p.id!==id) : [];
      tx.set(ref,{items,updatedAt:Date.now()});
      return items;
    });
    _paletasCache=registros;
  } catch(error){
    if(typeof _avisarErrorGuardado === 'function'){
      _avisarErrorGuardado('eliminación de paletas',error);
    } else {
      console.error('Error eliminando paleta:',error);
    }
    return;
  }

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
      Programación · ${escaparHtml(draftPaleta.marca || '—')} · ${escaparHtml(nombrePresentacionUI(draftPaleta.linea, draftPaleta.marca, draftPaleta.presentacion))}
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
                    ${escaparHtml(g.marca || '—')} · ${escaparHtml(nombrePresentacionUI(state.currentLine, g.marca, g.presentacion))}
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
            <th>${tienePermiso('paletas') || tienePermiso('eliminarRegistros') ? 'Acciones' : ''}</th>
          </tr>
        </thead>

        <tbody>

          ${
            ultimos.length
              ? ultimos.map(r => `

                <tr>
                  <td>${r.hora || '—'}</td>
                  <td>${escaparHtml(r.marca || '')}</td>
                  <td>${escaparHtml(nombrePresentacionUI(r.linea, r.marca, r.presentacion))}</td>
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

                    ${tienePermiso('paletas') ? `
                      <button class="btn btn-ghost btn-sm" onclick="editarPaleta('${r.id}')">
                        Editar
                      </button>
                    ` : ''}
                    ${tienePermiso('eliminarRegistros') ? `
                      <button class="btn btn-danger btn-sm" onclick="eliminarPaleta('${r.id}')">
                        Eliminar
                      </button>
                    ` : ''}

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

  const estado = document.getElementById('paleta-programacion-estado');
  if(estado){
    estado.textContent = textoEstadoProgramacionPaletas();
  }

}

function textoEstadoProgramacionPaletas(){
  if(!draftPaleta)return '';
  const prog = resumenProgramacionCombinacion(
    draftPaleta.linea,draftPaleta.fecha,draftPaleta.turno,
    draftPaleta.marca,draftPaleta.presentacion
  );
  if(!prog.cantidadProgramada){
    return 'Todavía no se registró una cantidad programada para esta combinación.';
  }
  const paletas = Number.isInteger(prog.paletasProgramadas)
    ? prog.paletasProgramadas : prog.paletasProgramadas.toFixed(1);
  return 'Programado: ' + prog.cantidadProgramada.toLocaleString('es-PE') +
    ' UND ≈ ' + paletas + ' paletas · ' +
    prog.unidadesPorPaleta + ' UND por paleta completa.';
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



/* Producción actual: detalle secundario colapsable */
const PRODUCCION_ACTUAL_COMPACTA_CSS = `
  .pa-detalle-productos{margin-top:4px;border:1px solid var(--border);border-radius:10px;background:#fff;overflow:hidden}
  .pa-detalle-productos>summary,.pa-detalle-tabla>summary{cursor:pointer;list-style:none;font-weight:700;color:var(--glacial-blue-dark)}
  .pa-detalle-productos>summary::-webkit-details-marker,.pa-detalle-tabla>summary::-webkit-details-marker{display:none}
  .pa-detalle-productos>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px}
  .pa-detalle-productos>summary:after{content:'▾';font-size:16px}
  .pa-detalle-productos[open]>summary:after{content:'▴'}
  .pa-detalle-productos>summary small{margin-left:auto;font-weight:500;color:var(--muted)}
  .pa-detalle-productos-body{padding:0 15px 15px;border-top:1px solid var(--border)}
  .pa-detalle-tabla{margin-top:10px;border-top:1px solid var(--border);padding-top:10px}
  .pa-detalle-tabla>summary{padding:8px 0}
`;
/* =========================================================
   RENDER COMPLETO DE LA PESTAÑA "PALETAS"
   =========================================================

   Se llama desde renderMain() (06-registro.js) cuando
   state.currentTab === 'paletas', igual que renderFormTab(),
   renderHistorialTab() y renderGráficosTab().
   ========================================================= */

function renderPaletasTab(){

  if(!puedeAccederPaletas()){
    const cont = document.getElementById('tab-content');
    if(cont)cont.textContent = 'No tienes permiso para ver Paletas.';
    return;
  }

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

  const puedeProgramar = puedeProgramarPaletas();
  const puedeRegistrar = tienePermiso('paletas');

  c.innerHTML = `

    <style>${PALETAS_CSS}</style>


    <div class="panel" id="paletas-form-panel">

      <div class="panel-head">
        <h3>
          ${puedeRegistrar
            ? (paletaEditId ? 'Editar registro de paletas' : 'Registrar paletas')
            : 'Programar producción'}
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
                      ${escaparHtml(nombrePresentacionUI(state.currentLine, draftPaleta.marca, p))}
                    </option>
                  `).join('')
                : `<option value="">Sin presentaciones configuradas</option>`
            }
          </select>
        </div>

      </div>


      ${puedeProgramar ? `
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

        <div class="small-muted" id="paleta-programacion-estado" style="align-self:center;">
          ${textoEstadoProgramacionPaletas()}
        </div>

      </div>
      ` : `
      <div class="panel-body">
        <div class="small-muted" id="paleta-programacion-estado">
          ${textoEstadoProgramacionPaletas()}
        </div>
      </div>
      `}

      ${puedeRegistrar ? `
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
      ` : ''}

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
            ${escaparHtml(p.marca || '—')} · ${escaparHtml(nombrePresentacionUI((p.lineas && p.lineas[0]) || '', p.marca, p.presentacion))}
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

      const estadoSemaforo =
        estadoSemaforoProduccion(
          r.cantidadProgramada, r.porcentajeAvance, r.sobreproduccion
        );

      filasHtml += `
        <tr class="${r.sobreproduccion ? 'pl-fila-sobreproduccion' : ''}">
          <td>${escaparHtml(line.name)}</td>
          <td>${escaparHtml(combo.marca || '—')}</td>
          <td>${escaparHtml(nombrePresentacionUI(line.key, combo.marca, combo.presentacion))}</td>
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

  /*
     Producción actual prioriza la lectura operativa por LÍNEA.
     El tablero consolidado se agrega desde 24-semaforo-produccion-actual.js.
     Aquí conservamos el detalle histórico por marca/presentación, pero
     colapsado para no saturar la pantalla.
  */
  return `

    <details class="pa-detalle-productos">
      <summary>
        <span>Ver detalle por marca y presentación</span>
        <small>${productos.length} producto${productos.length === 1 ? '' : 's'}</small>
      </summary>

      <div class="pa-detalle-productos-body">

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

        <details class="pa-detalle-tabla">
          <summary>Ver tabla técnica por línea</summary>
          <div style="overflow-x:auto;margin-top:12px;">
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
                          Sin registros ni programación para la fecha/turno seleccionados.
                        </td>
                      </tr>
                    `
                }
              </tbody>
            </table>
          </div>
        </details>

      </div>
    </details>

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

    <style>${PALETAS_CSS}${PRODUCCION_ACTUAL_COMPACTA_CSS}</style>

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
/* Pegar al FINAL de js/16-paletas.js */
(function instalarSaldoYConteoAcumulado(){
  if(typeof estadoActualRegistrosPaletas === 'function' &&
     typeof equivalenciaSaldoPaleta === 'function') return;

  function equivalencia(linea, marca, presentacion){
    const p = normalizarTexto(presentacion);
    const m = normalizarTexto(marca);
    const paquete = factor => ({factor, singular:'paquete', plural:'paquetes'});

    if(linea === 'PET1' || linea === 'PET2'){
      if(p.includes('2.5l')) return paquete(6);
      if(p.includes('380ml')) return paquete(24);
      if(p.includes('625ml')) return paquete(15);
      if(p.includes('1.5l')) return paquete(6);
      if(p.includes('1l')) return paquete(12);
    }

    if(linea === 'B7L'){
      if(m.includes('bells') || m.includes('fontlife') || m.includes('fontilfe'))
        return {factor:1, singular:'bidón', plural:'bidones'};

      if(['scala','glacial','merkat','merkta','cuisine','aro']
          .some(x => m.includes(x)))
        return paquete(2);
    }

    if(linea === 'C20L')
      return {factor:1, singular:'caja', plural:'cajas'};

    if(linea === 'B20L')
      return {factor:1, singular:'bidón', plural:'bidones'};

    return null;
  }

  function ultimoEstado(registros){
    let completas = null;
    let saldo = null;

    registros.forEach((r, indice) => {
      const actual = r.tipoPaleta === 'INCOMPLETA' ? saldo : completas;
      const creado = Number(r.creadoEn) || 0;
      const anterior = Number(actual?.registro.creadoEn) || 0;
      const hora = String(r.hora || '');
      const horaAnterior = String(actual?.registro.hora || '');

      if(!actual || creado > anterior ||
         (creado === anterior &&
          (hora > horaAnterior ||
           (hora === horaAnterior && indice > actual.indice)))){
        if(r.tipoPaleta === 'INCOMPLETA')
          saldo = {registro:r, indice};
        else
          completas = {registro:r, indice};
      }
    });

    /*
       El saldo es un ESTADO del corte, no un acumulado permanente.
       Si después del último saldo se registra un nuevo corte de
       paletas completas, ese nuevo corte reemplaza el saldo anterior
       salvo que exista un saldo registrado después del mismo.
    */
    const orden = item => {
      if(!item) return {creado:0,hora:'',indice:-1};
      return {
        creado:Number(item.registro?.creadoEn) || 0,
        hora:String(item.registro?.hora || ''),
        indice:Number(item.indice) || 0
      };
    };
    const esPosterior = (a,b) => {
      if(!a) return false;
      if(!b) return true;
      const A=orden(a), B=orden(b);
      return A.creado > B.creado ||
        (A.creado === B.creado &&
          (A.hora > B.hora || (A.hora === B.hora && A.indice > B.indice)));
    };
    const saldoVigente = saldo && esPosterior(saldo, completas)
      ? num(saldo.registro.totalUnidades)
      : 0;

    return {
      paletas: num(completas?.registro.paletas),
      unidadesCompletas: num(completas?.registro.totalUnidades),
      unidadesSaldo: saldoVigente
    };
  }

  const resumenTurnosOriginal =
    resumenProgramacionCombinacionTurnos;

  resumenProgramacionCombinacionTurnos =
    function(linea, fecha, turnos, marca, presentacion){

      const resultado = resumenTurnosOriginal(
        linea, fecha, turnos, marca, presentacion
      );

      let completas = 0;
      let unidadesCompletas = 0;
      let saldo = 0;
      let saldosPositivos = 0;

      turnos.forEach(turno => {
        const registros = loadPaletas().filter(r =>
          r.linea === linea &&
          r.fecha === fecha &&
          r.turno === turno &&
          r.marca === marca &&
          r.presentacion === presentacion
        );

        const actual = ultimoEstado(registros);

        completas += actual.paletas;
        unidadesCompletas += actual.unidadesCompletas;
        saldo += actual.unidadesSaldo;

        if(actual.unidadesSaldo > 0)
          saldosPositivos++;
      });

      const upp = resultado.unidadesPorPaleta || 0;

      resultado.paletasCompletas = completas;
      resultado.paletasIncompletasCount = saldosPositivos;
      resultado.unidadesIncompletas = saldo;
      resultado.unidadesProducidas = unidadesCompletas + saldo;
      resultado.paletasEquivalentes =
        completas + (upp ? saldo / upp : 0);

      resultado.unidadesPendientes = Math.max(
        0,
        resultado.cantidadProgramada - resultado.unidadesProducidas
      );

      resultado.porcentajeAvance =
        resultado.cantidadProgramada > 0
          ? resultado.unidadesProducidas /
            resultado.cantidadProgramada * 100
          : 0;

      resultado.sobreproduccion =
        resultado.cantidadProgramada > 0 &&
        resultado.unidadesProducidas >
        resultado.cantidadProgramada;

      resultado.producido = resultado.paletasEquivalentes;

      resultado.pendiente = Math.max(
        0,
        resultado.paletasProgramadas -
        resultado.paletasEquivalentes
      );

      resultado.cumplimiento = resultado.porcentajeAvance;

      return resultado;
    };

  const resumenOriginal = resumenPaletas;

  resumenPaletas = function(linea, fecha, turno){
    const resultado = resumenOriginal(linea, fecha, turno);

    let completas = 0;
    let saldo = 0;
    let saldosPositivos = 0;

    resultado.grupos.forEach(g => {
      const actual = ultimoEstado(g.eventos);

      g.paletasCompletas = actual.paletas;
      g.paletasIncompletas =
        actual.unidadesSaldo > 0 ? 1 : 0;
      g.unidadesIncompletas = actual.unidadesSaldo;
      g.paletas = actual.paletas;
      g.unidades =
        actual.unidadesCompletas +
        actual.unidadesSaldo;

      completas += g.paletas;
      saldo += g.unidadesIncompletas;
      saldosPositivos += g.paletasIncompletas;
    });

    resultado.totalPaletas = completas;
    resultado.totalPaletasCompletas = completas;
    resultado.totalPaletasIncompletas = saldosPositivos;
    resultado.totalUnidadesIncompletas = saldo;
    resultado.totalUnidades = resultado.grupos.reduce(
      (n, g) => n + g.unidades, 0
    );

    return resultado;
  };

  const blankOriginal = blankPaleta;

  blankPaleta = function(linea){
    const d = blankOriginal(linea);
    d.paletas = 0;
    d.paquetesIncompleta = '';
    return d;
  };

  const renderOriginal = renderPaletasTab;

  renderPaletasTab = function(){
    renderOriginal();

    const panel =
      document.getElementById('paletas-form-panel');

    if(!panel || !draftPaleta)
      return;

    const eq = equivalencia(
      draftPaleta.linea,
      draftPaleta.marca,
      draftPaleta.presentacion
    );

    const radio = panel.querySelector(
      'input[name="pl-tipo"][value="INCOMPLETA"]'
    );

    if(radio && radio.parentElement){
      radio.parentElement.lastChild.textContent =
        ' Saldo (' + (eq?.plural || 'paquetes') + ')';
    }

    const campo = Array.from(
      panel.querySelectorAll('.field-sm')
    ).find(el =>
      /Unidades de esta paleta|Saldo de (paquetes|cajas|bidones)/
        .test(el.querySelector('label')?.textContent || '')
    );

    if(campo && draftPaleta.tipoPaleta === 'INCOMPLETA'){
      const input =
        campo.querySelector('input[type="number"]');

      const previa =
        document.getElementById('paleta-preview-unidades');

      campo.querySelector('label').textContent =
        'Saldo de ' + (eq?.plural || 'paquetes');

      if(draftPaleta.paquetesIncompleta === undefined){
        const antes = num(
          draftPaleta.unidadesIncompleta
        );

        draftPaleta.saldoAnteriorUnidades =
          paletaEditId && antes > 0 ? antes : 0;

        draftPaleta.paquetesIncompleta =
          eq &&
          antes > 0 &&
          Number.isSafeInteger(antes / eq.factor)
            ? antes / eq.factor
            : '';
      }

      if(!input)
        return;

      input.value = draftPaleta.paquetesIncompleta;
      input.min = '0';
      input.step = '1';

      const actualizar = () => {
        if(!previa)
          return;

        const entrada = String(
          draftPaleta.paquetesIncompleta ?? ''
        ).trim();

        previa.textContent = !eq
          ? 'No hay equivalencia configurada.'
          : entrada === ''
            ? (
                draftPaleta.saldoAnteriorUnidades
                  ? 'Registro anterior: ' +
                    draftPaleta.saldoAnteriorUnidades +
                    ' UND.'
                  : 'Ingresa un saldo de ' +
                    eq.plural +
                    '. Puedes usar 0.'
              )
            : entrada + ' ' + eq.plural +
              ' × ' + eq.factor +
              ' UND = ' +
              (Number(entrada) * eq.factor) +
              ' UND';
      };

      input.oninput = function(){
        draftPaleta.paquetesIncompleta = this.value;
        actualizar();
      };

      actualizar();
    }

    const campoPaletas = Array.from(
      panel.querySelectorAll('.field-sm')
    ).find(el =>
      /Cantidad de paletas completas|Paletas completas del corte/
        .test(el.querySelector('label')?.textContent || '')
    );

    if(campoPaletas){
      campoPaletas.querySelector('label').textContent =
        'Paletas completas del corte';

      const input =
        campoPaletas.querySelector('input[type="number"]');

      if(input)
        input.min = '0';
    }
  };

  const resultadosOriginal = renderPaletasResultados;

  renderPaletasResultados = function(){
    return resultadosOriginal()
      .replace(
        'Total paletas del turno',
        'Paletas completas actuales'
      )
      .replace(
        'Total unidades del turno',
        'Unidades actuales del turno'
      )
      .replace(
        /(\d+) completas\s*(?:\+ (\d+) incompletas)?/,
        (_, n, saldos) =>
          n + ' completas' +
          (saldos ? ' + ' + saldos + ' saldos' : '')
      )
      .replaceAll('Incompleta</span>', 'Saldo</span>')
      .replace(
        /\+(\d+) paleta\(s\) =/g,
        '$1 paletas acumuladas ='
      )
      .replaceAll(
        'TOTAL: <strong>',
        'ACTUAL: <strong>'
      )
      .replaceAll(
        ' paletas</strong>',
        ' paletas completas</strong>'
      );
  };

  guardarPaleta = async function(){
    if(!tienePermiso('paletas') ||
       !draftPaleta ||
       !visibleLines().some(
         l => l.key === draftPaleta.linea
       )){
      alert(
        'No tienes permiso para registrar paletas en esta línea.'
      );
      return;
    }

    if(_guardandoPaleta)
      return;

    if(!draftPaleta.marca ||
       !draftPaleta.presentacion){
      alert(
        'Selecciona una marca y una presentación.'
      );
      return;
    }

    const esCompleta =
      draftPaleta.tipoPaleta !== 'INCOMPLETA';

    const upp = unidadesPorPaletaActiva(
      draftPaleta.linea,
      draftPaleta.fecha,
      draftPaleta.turno,
      draftPaleta.marca,
      draftPaleta.presentacion
    );

    let paletas = 0;
    let paquetesIncompleta = null;
    let unidadesSaldo = 0;

    if(esCompleta){
      paletas = Number(draftPaleta.paletas);

      if(!Number.isSafeInteger(paletas) ||
         paletas < 0 ||
         !upp){
        alert(
          !upp
            ? 'Faltan unidades por paleta para esta presentación.'
            : 'Ingresa las paletas completas del corte (0 o más).'
        );
        return;
      }
    } else {
      const eq = equivalencia(
        draftPaleta.linea,
        draftPaleta.marca,
        draftPaleta.presentacion
      );

      if(!eq){
        alert(
          'Falta equivalencia para esta marca y presentación.'
        );
        return;
      }

      const entrada = String(
        draftPaleta.paquetesIncompleta ?? ''
      ).trim();

      if(
        entrada === '' &&
        paletaEditId &&
        draftPaleta.saldoAnteriorUnidades
      ){
        unidadesSaldo = num(
          draftPaleta.saldoAnteriorUnidades
        );
      } else {
        const cantidad = Number(entrada);

        if(
          entrada === '' ||
          !Number.isSafeInteger(cantidad) ||
          cantidad < 0 ||
          !Number.isSafeInteger(
            cantidad * eq.factor
          )
        ){
          alert(
            'Ingresa un saldo entero de ' +
            eq.plural +
            ' (0 o más).'
          );
          return;
        }

        paquetesIncompleta = cantidad;
        unidadesSaldo = cantidad * eq.factor;
      }
    }

    _guardandoPaleta = true;

    const btn =
      document.getElementById('btn-guardar-paleta');

    const textoAnterior =
      btn?.textContent || '';

    if(btn){
      btn.disabled = true;
      btn.textContent = 'Guardando...';
    }

    try {
      const id =
        paletaEditId ||
        'pal_' +
        Date.now() +
        '_' +
        Math.random().toString(36).slice(2, 8);

      const ahora = Date.now();

      const cambio = {
        id,
        linea: draftPaleta.linea,
        fecha: draftPaleta.fecha,
        turno: draftPaleta.turno,
        marca: draftPaleta.marca,
        presentacion: draftPaleta.presentacion,
        hora: draftPaleta.hora,
        tipoPaleta: esCompleta
          ? 'COMPLETA'
          : 'INCOMPLETA',
        paletas,
        unidadesPorPaleta: upp,
        paquetesIncompleta,
        unidadesIncompleta: unidadesSaldo,
        totalUnidades: esCompleta
          ? Math.round(paletas * upp)
          : unidadesSaldo,
        observaciones:
          draftPaleta.observaciones || '',
        usuario: nombreUsuarioActualPaletas(),
        usuarioUsername:
          state.user?.username || '',
        creadoEn: ahora,
        actualizadoPor:
          nombreUsuarioActualPaletas(),
        actualizadoEn: ahora
      };

      const ref =
        db.collection('sync').doc('paletas');

      _paletasCache = await db.runTransaction(
        async tx => {
          const snap = await tx.get(ref);

          const items =
            snap.exists &&
            Array.isArray(snap.data().items)
              ? snap.data().items.slice()
              : [];

          const idx = items.findIndex(
            r => r.id === id
          );

          if(paletaEditId && idx < 0){
            throw new Error(
              'El registro que intentas editar ya no existe.'
            );
          }

          if(idx >= 0){
            items[idx] = {
              ...items[idx],
              ...cambio,
              usuario: items[idx].usuario,
              usuarioUsername:
                items[idx].usuarioUsername,
              creadoEn: items[idx].creadoEn
            };
          } else {
            items.push(cambio);
          }

          tx.set(ref, {
            items,
            updatedAt: Date.now()
          });

          return items;
        }
      );

      const {
        fecha,
        turno,
        marca,
        presentacion
      } = draftPaleta;

      paletaEditId = null;
      draftPaleta = blankPaleta(
        state.currentLine
      );

      Object.assign(draftPaleta, {
        fecha,
        turno,
        marca,
        presentacion
      });

      renderPaletasTab();

    } catch(error){
      if(
        typeof _avisarErrorGuardado ===
        'function'
      ){
        _avisarErrorGuardado(
          'paletas',
          error
        );
      } else {
        console.error(
          'Error guardando paletas:',
          error
        );
        alert(error.message);
      }
    } finally {
      _guardandoPaleta = false;

      if(
        btn &&
        btn.isConnected !== false
      ){
        btn.disabled = false;
        btn.textContent =
          textoAnterior;
      }
    }
  };
})();