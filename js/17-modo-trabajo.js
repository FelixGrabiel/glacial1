/* =============================================================
   MODO VISUALIZAR / TRABAJAR · CRONÓMETRO DE TURNO ·
   AUTOGUARDADO EN TIEMPO REAL DEL BORRADOR (NUEVO REGISTRO)
   Parte del sistema GLACIAL

   Este archivo es ADITIVO: no reemplaza ni copia el código de
   06-registro.js, 02-estado.js ni 03-auth.js. Se conecta a la
   app "envolviendo" (wrapping) unas pocas funciones globales
   ya existentes (enterApp, renderMain, renderFormTab, saveDraft)
   para no tener que tocar esos archivos, que son enormes y ya
   probados. Debe cargarse DESPUÉS de todos esos archivos y
   ANTES de 12-init.js en index.html.

   Resuelve 3 pedidos:

   1) Registro en tiempo real: el borrador de "Nuevo registro"
      se autoguarda en Firestore (colección "sync", documento
      "borradoresNuevoRegistro") cada vez que el supervisor
      escribe algo, con un pequeño debounce. Así:
        - Los indicadores/cuadros/ratios ya se recalculaban al
          instante en el navegador (eso ya lo hacía 06-registro.js);
          lo que faltaba era que sobreviviera a un refresco/cierre
          de página y que se viera desde otra computadora — eso
          es lo que agrega este archivo.
        - Si el supervisor cierra o recarga la página, al volver
          a "Nuevo registro" de esa línea se restaura el último
          borrador guardado (mismo día).
        - Otras personas en modo VISUALIZAR que estén mirando la
          pestaña "Nuevo registro" ven el avance en vivo.

   2) Modo Visualizar / Trabajar.

   3) Cronómetro de turno (Mañana/Tarde/Noche, con tolerancia
      de 20 min para Noche).
   ============================================================= */


/* =========================================================
   0) UTILIDADES DE FECHA/HORA
   ========================================================= */

function _mtFechaConHora(base, h, m){

  const d = new Date(base);

  d.setHours(h, m, 0, 0);

  return d;

}

function _mtSumarDias(base, n){

  const d = new Date(base);

  d.setDate(d.getDate() + n);

  return d;

}

function _mtFmtHora(d){

  return (
    String(d.getHours()).padStart(2, '0') +
    ':' +
    String(d.getMinutes()).padStart(2, '0')
  );

}

function _mtFmtDuracion(ms){

  if(ms < 0) ms = 0;

  const totalSeg = Math.floor(ms / 1000);

  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;

  return (
    String(h).padStart(2, '0') + ':' +
    String(m).padStart(2, '0') + ':' +
    String(s).padStart(2, '0')
  );

}

function _mtFechaHoyISO(d){

  d = d || new Date();

  return (
    d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
  );

}


/* =========================================================
   1) CRONÓMETRO DE TURNO
   =========================================================

   Turnos:
     MAÑANA  07:00 – 15:00
     TARDE   15:00 – 22:00
     NOCHE   22:00 – 07:00 (+20 min de tolerancia, hasta 07:20)

   Entre 07:00 y 07:20 el turno mostrado sigue siendo NOCHE,
   marcado como "en tolerancia / cerrando turno" (el turno de
   la noche recién termina de verdad a las 07:20 para efectos
   del cronómetro), y a partir de 07:20 empieza a contar MAÑANA.
   ========================================================= */

const MT_TOLERANCIA_NOCHE_MIN = 20;

function obtenerTurnoActual(ahora){

  ahora = ahora || new Date();


  /* ¿Seguimos dentro del turno Noche que empezó AYER 22:00
     (incluyendo su tolerancia hasta las 07:20 de hoy)? */

  const inicioNocheAyer =
    _mtFechaConHora(_mtSumarDias(ahora, -1), 22, 0);

  const finNocheHoy =
    _mtFechaConHora(ahora, 7, 0);

  const finNocheHoyConTolerancia =
    new Date(
      finNocheHoy.getTime() +
      MT_TOLERANCIA_NOCHE_MIN * 60000
    );

  if(
    ahora >= inicioNocheAyer &&
    ahora < finNocheHoyConTolerancia
  ){

    return {
      key: 'NOCHE',
      nombre: 'Noche',
      inicio: inicioNocheAyer,
      fin: finNocheHoy,
      finConTolerancia: finNocheHoyConTolerancia,
      enTolerancia: ahora >= finNocheHoy
    };

  }


  /* MAÑANA 07:00–15:00 */

  const inicioManana = _mtFechaConHora(ahora, 7, 0);
  const finManana = _mtFechaConHora(ahora, 15, 0);

  if(ahora >= inicioManana && ahora < finManana){

    return {
      key: 'MANANA',
      nombre: 'Mañana',
      inicio: inicioManana,
      fin: finManana,
      finConTolerancia: finManana,
      enTolerancia: false
    };

  }


  /* TARDE 15:00–22:00 */

  const inicioTarde = _mtFechaConHora(ahora, 15, 0);
  const finTarde = _mtFechaConHora(ahora, 22, 0);

  if(ahora >= inicioTarde && ahora < finTarde){

    return {
      key: 'TARDE',
      nombre: 'Tarde',
      inicio: inicioTarde,
      fin: finTarde,
      finConTolerancia: finTarde,
      enTolerancia: false
    };

  }


  /* NOCHE que empieza HOY 22:00 y termina MAÑANA 07:00(+20) */

  const inicioNocheHoy = _mtFechaConHora(ahora, 22, 0);
  const finNocheManana = _mtFechaConHora(_mtSumarDias(ahora, 1), 7, 0);

  return {
    key: 'NOCHE',
    nombre: 'Noche',
    inicio: inicioNocheHoy,
    fin: finNocheManana,
    finConTolerancia:
      new Date(finNocheManana.getTime() + MT_TOLERANCIA_NOCHE_MIN * 60000),
    enTolerancia: false
  };

}


function esSupervisorParaCronometro(){
  const usuario = state?.user || {};
  const texto = [
    usuario.puesto || '',
    usuario.cargo || '',
    usuario.rol || ''
  ].join(' ');

  const normalizado =
    typeof normalizarTexto === 'function'
      ? normalizarTexto(texto)
      : texto.toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');

  return /\bsupervisor\b/.test(normalizado);
}


let _mtCronometroInterval = null;

function iniciarCronometroTurno(){

  detenerCronometroTurno();

  if(!esSupervisorParaCronometro()){
    return;
  }

  renderCronometroTurno();

  _mtCronometroInterval = setInterval(renderCronometroTurno, 1000);

}

function detenerCronometroTurno(){

  if(_mtCronometroInterval){

    clearInterval(_mtCronometroInterval);

    _mtCronometroInterval = null;

  }

  const box = document.getElementById('cronometro-turno');

  if(box){
    box.style.display = 'none';
  }

}

function renderCronometroTurno(){

  const box = document.getElementById('cronometro-turno');

  if(!box) return;

  if(!esSupervisorParaCronometro()){
    box.style.display = 'none';
    return;
  }

  if(state.workMode !== 'trabajar'){

    box.style.display = 'none';

    actualizarIndicadorAutoguardado();

    return;

  }

  const ahora = new Date();

  const t = obtenerTurnoActual(ahora);

  const transcurrido = ahora - t.inicio;
  const restante = t.fin - ahora;

  const porFinalizar =
    !t.enTolerancia &&
    restante > 0 &&
    restante <= 15 * 60000;

  const estado =
    t.enTolerancia
      ? 'Tolerancia · cerrando turno'
      : (porFinalizar ? 'Por finalizar' : 'En curso');

  box.style.display = 'flex';

  box.innerHTML = `

    <div class="cro-turno-nombre">
      Turno ${t.nombre}${t.enTolerancia ? ' (tolerancia)' : ''}
    </div>

    <div class="cro-fila">
      <span>Inicio</span>
      <b>${_mtFmtHora(t.inicio)}</b>
    </div>

    <div class="cro-fila">
      <span>Término</span>
      <b>${_mtFmtHora(t.fin)}</b>
    </div>

    <div class="cro-fila">
      <span>Transcurrido</span>
      <b>${_mtFmtDuracion(transcurrido)}</b>
    </div>

    <div class="cro-fila">
      <span>Restante</span>
      <b>${_mtFmtDuracion(restante)}</b>
    </div>

    <div class="cro-estado ${t.enTolerancia ? 'cro-estado-tolerancia' : ''}">
      ${estado}
    </div>

  `;

  actualizarIndicadorAutoguardado();

}


/* =========================================================
   2) MODO VISUALIZAR / TRABAJAR
   ========================================================= */

const MT_STORAGE_KEY = 'rdp_workmode_v1';

function esModoSoloLectura(){

  return state.workMode === 'visualizar';

}

function establecerModoTrabajo(modo, opts){

  opts = opts || {};

  if(modo !== 'visualizar' && modo !== 'trabajar'){
    return;
  }

  state.workMode = modo;

  try{
    sessionStorage.setItem(MT_STORAGE_KEY, modo);
  }catch(e){}

  document.body.classList.toggle('modo-visualizar', modo === 'visualizar');
  document.body.classList.toggle('modo-trabajar', modo === 'trabajar');

  renderModoSwitch();

  aplicarBloqueoVisualización();

  if(modo === 'trabajar'){

    iniciarCronometroTurno();

  } else {

    detenerCronometroTurno();

    actualizarIndicadorAutoguardado();

  }

  if(!opts.silencioso){

    if(typeof closeModal === 'function'){
      closeModal();
    }

  }

}

function renderModoSwitch(){

  const box = document.getElementById('modo-turno-box');

  if(box){
    box.style.display = state.user ? 'flex' : 'none';
  }

  document.querySelectorAll('#modo-switch .modo-btn').forEach(btn => {

    btn.classList.toggle(
      'activo',
      btn.getAttribute('data-modo') === state.workMode
    );

  });

}

/*
   Bloquea visualmente (vía CSS) la edición dentro de
   #tab-content cuando: estamos en modo VISUALIZAR Y la
   pestaña abierta es una que registra datos operativos
   ("Nuevo registro" o "Paletas"). El resto de pestañas
   (Historial, Gráficos, Resumen, Impacto Económico,
   Producción Actual) quedan libres para consultarse con
   normalidad en modo Visualizar, tal como pide el pedido.
*/
function aplicarBloqueoVisualización(){

  const tabContent = document.getElementById('tab-content');

  if(!tabContent) return;

  const pestañasOperativas = ['nuevo', 'paletas'];

  const debeBloquear =
    state.workMode === 'visualizar' &&
    pestañasOperativas.includes(state.currentTab);

  tabContent.classList.toggle('gc-bloqueado', debeBloquear);

}

function mostrarSelectorModoTrabajo(){

  const root = document.getElementById('modal-root');

  if(!root) return;

  root.innerHTML = `

    <div class="modal-backdrop">

      <div class="modal">

        <div class="modal-head">
          <h3>¿Cómo vas a trabajar ahora?</h3>
        </div>

        <div class="modal-body">

          <p style="margin:0 0 4px;color:var(--text-soft);font-size:13.5px;line-height:1.6;">
            Elige el modo con el que vas a usar el sistema.
            Puedes cambiarlo en cualquier momento desde el botón
            de arriba.
          </p>

          <div class="modo-modal-opciones">

            <button
              type="button"
              class="modo-modal-card"
              onclick="establecerModoTrabajo('visualizar')"
            >
              <div class="mm-icon">👁️</div>
              <div class="mm-titulo">Visualizar</div>
              <div class="mm-desc">
                Solo consulta reportes, indicadores, producción
                y gráficos. No permite modificar datos.
              </div>
            </button>

            <button
              type="button"
              class="modo-modal-card"
              onclick="establecerModoTrabajo('trabajar')"
            >
              <div class="mm-icon">⚙️</div>
              <div class="mm-titulo">Trabajar</div>
              <div class="mm-desc">
                Activa el entorno operativo: nuevo registro,
                carga de producción, paradas y observaciones
                del turno, con cronómetro de turno visible.
              </div>
            </button>

          </div>

        </div>

      </div>

    </div>

  `;

}

function inicializarModoTrabajo(){

  let guardado = null;

  try{
    guardado = sessionStorage.getItem(MT_STORAGE_KEY);
  }catch(e){}

  if(guardado === 'visualizar' || guardado === 'trabajar'){

    establecerModoTrabajo(guardado, { silencioso: true });

  } else {

    renderModoSwitch();

    mostrarSelectorModoTrabajo();

  }

}


/* =========================================================
   3) BORRADOR EN TIEMPO REAL (AUTOGUARDADO) — FIRESTORE
   =========================================================

   Un solo documento sync/borradoresNuevoRegistro con un
   arreglo "items", igual patrón que usuarios/reportes/
   trabajadores en 02-estado.js. Un borrador por línea.
   ========================================================= */

let _borradoresNuevoRegistroCache = [];
let _borradoresNuevoRegistroReady = false;

if(typeof db !== 'undefined'){

  db.collection('sync').doc('borradoresNuevoRegistro')

    .onSnapshot(

      snap => {

        _borradoresNuevoRegistroCache =
          (snap.exists && snap.data().items)
            ? snap.data().items
            : [];

        _borradoresNuevoRegistroReady = true;

        onBorradorNuevoRegistroActualizado();

      },

      err => {

        console.error(
          'Error de sincronización (borrador de Nuevo Registro):',
          err
        );

      }

    );

}

function loadBorradoresNuevoRegistro(){

  return _borradoresNuevoRegistroCache;

}

function obtenerBorradorNuevoRegistro(linea){

  return (
    loadBorradoresNuevoRegistro().find(b => b.linea === linea) ||
    null
  );

}

function guardarBorradorNuevoRegistro(linea, draftObj){

  const items = loadBorradoresNuevoRegistro().slice();

  const idx = items.findIndex(b => b.linea === linea);

  const entry = {
    linea,
    fecha: draftObj.fecha,
    turno: draftObj.turno,
    draft: JSON.parse(JSON.stringify(draftObj)),
    actualizadoPor: state.user ? (state.user.nombre || state.user.username) : '',
    actualizadoEn: Date.now()
  };

  if(idx > -1){
    items[idx] = entry;
  } else {
    items.push(entry);
  }

  _borradoresNuevoRegistroCache = items;

  return db.collection('sync').doc('borradoresNuevoRegistro').set({
    items,
    updatedAt: Date.now()
  });

}

function eliminarBorradorNuevoRegistro(linea){

  const items =
    loadBorradoresNuevoRegistro().filter(b => b.linea !== linea);

  _borradoresNuevoRegistroCache = items;

  return db.collection('sync').doc('borradoresNuevoRegistro').set({
    items,
    updatedAt: Date.now()
  }).catch(err => {

    console.error(
      'Error eliminando borrador de Nuevo Registro:', err
    );

  });

}

function onBorradorNuevoRegistroActualizado(){

  /*
     No se reconstruye el formulario de quien está TRABAJANDO
     y escribiendo (le haría perder el foco). Solo se refresca
     la vista para alguien en modo VISUALIZAR que esté mirando
     la pestaña "Nuevo registro" ahora mismo, para que vea el
     avance del supervisor en tiempo real, en otra computadora.
  */

  if(
    state.user &&
    state.workMode === 'visualizar' &&
    state.currentTab === 'nuevo' &&
    typeof renderMain === 'function'
  ){

    renderMain();

  }

}


/* =========================================================
   4) AUTOGUARDADO: DEBOUNCE + INDICADOR VISUAL
   ========================================================= */

let _mtAutosaveTimer = null;
let _mtUltimoGuardadoISO = null;
let _mtUltimoEstadoGuardado = null; /* 'guardando' | 'ok' | 'error' */

function programarAutoguardadoNuevoRegistro(){

  if(state.currentTab !== 'nuevo') return;
  if(!draft) return;
  if(esModoSoloLectura()) return;

  clearTimeout(_mtAutosaveTimer);

  _mtAutosaveTimer = setTimeout(
    ejecutarAutoguardadoNuevoRegistro,
    1200
  );

}

function ejecutarAutoguardadoNuevoRegistro(){

  if(!draft || state.currentTab !== 'nuevo') return;
  if(esModoSoloLectura()) return;

  try{

    if(typeof normalizarCuadros === 'function'){
      normalizarCuadros(draft);
    }

    if(typeof actualizarTodosCuadros === 'function'){
      actualizarTodosCuadros();
    }

  }catch(e){

    console.error('No se pudieron recalcular los cuadros antes de autoguardar:', e);

  }

  _mtUltimoEstadoGuardado = 'guardando';
  actualizarIndicadorAutoguardado();

  guardarBorradorNuevoRegistro(state.currentLine, draft)

    .then(() => {

      _mtUltimoGuardadoISO = new Date().toISOString();
      _mtUltimoEstadoGuardado = 'ok';
      actualizarIndicadorAutoguardado();

    })

    .catch(err => {

      console.error('Error autoguardando borrador de Nuevo Registro:', err);

      _mtUltimoEstadoGuardado = 'error';
      actualizarIndicadorAutoguardado();

    });

}

/* Autoguardado periódico de respaldo (por si no hubo eventos
   de input pero sí cambios programáticos, p.ej. al adjuntar
   una foto de evidencia). */
setInterval(() => {

  if(
    state.currentTab === 'nuevo' &&
    draft &&
    !esModoSoloLectura()
  ){

    ejecutarAutoguardadoNuevoRegistro();

  }

}, 30000);

function actualizarIndicadorAutoguardado(){

  let el = document.getElementById('autoguardado-indicator');

  if(!el){

    el = document.createElement('div');
    el.id = 'autoguardado-indicator';
    el.className = 'autoguardado-indicator';
    document.body.appendChild(el);

  }

  const visible =
    state.user &&
    state.workMode === 'trabajar' &&
    state.currentTab === 'nuevo';

  if(!visible){

    el.style.display = 'none';
    return;

  }

  el.style.display = 'flex';

  if(_mtUltimoEstadoGuardado === 'guardando'){

    el.innerHTML =
      '<span class="ag-dot ag-dot-busy"></span> Guardando...';

  } else if(_mtUltimoEstadoGuardado === 'error'){

    el.innerHTML =
      '<span class="ag-dot ag-dot-error"></span> Sin conexión · se reintentará';

  } else {

    const hora =
      _mtUltimoGuardadoISO
        ? _mtFmtHora(new Date(_mtUltimoGuardadoISO))
        : '—';

    el.innerHTML =
      '<span class="ag-dot ag-dot-ok"></span> Guardado automático · ' + hora;

  }

}

/* Delegación de eventos: cualquier input/select/textarea que
   cambie dentro de #tab-content (mientras se ve "Nuevo
   registro") dispara el autoguardado, SIN tocar los cientos
   de oninput="" ya existentes en 06-registro.js. */

document.addEventListener('input', e => {

  if(
    state.currentTab === 'nuevo' &&
    e.target &&
    e.target.closest &&
    e.target.closest('#tab-content')
  ){

    programarAutoguardadoNuevoRegistro();

  }

});

document.addEventListener('change', e => {

  if(
    state.currentTab === 'nuevo' &&
    e.target &&
    e.target.closest &&
    e.target.closest('#tab-content')
  ){

    programarAutoguardadoNuevoRegistro();

  }

});


/* =========================================================
   5) RESTAURAR BORRADOR AL ABRIR "NUEVO REGISTRO"
   ========================================================= */

function intentarRestaurarBorrador(lineKey){

  if(typeof obtenerBorradorNuevoRegistro !== 'function') return null;

  const guardado = obtenerBorradorNuevoRegistro(lineKey);

  if(!guardado || !guardado.draft) return null;

  /* Solo se restaura si es del mismo día: un borrador de un
     turno/día anterior que nunca se cerró no debe "resucitar"
     silenciosamente en un turno nuevo. */

  if(guardado.fecha !== _mtFechaHoyISO()) return null;

  try{

    const restaurado = JSON.parse(JSON.stringify(guardado.draft));

    restaurado.linea = lineKey;

    return restaurado;

  }catch(e){

    console.error('No se pudo restaurar el borrador guardado:', e);

    return null;

  }

}


/* =========================================================
   6) ENVOLTURA (WRAP) DE FUNCIONES EXISTENTES
   =========================================================

   Se hace DESPUÉS de que 06-registro.js / 03-auth.js ya
   definieron estas funciones como globales. Como todo vive
   en window (scripts clásicos, sin módulos), reasignarlas
   aquí es seguro: cualquier código que las llame más tarde
   (botones, otros archivos) siempre usa la última versión.
   ========================================================= */

if(typeof enterApp === 'function'){

  const _mtEnterAppOriginal = enterApp;

  enterApp = function(){

    _mtEnterAppOriginal.apply(this, arguments);

    inicializarModoTrabajo();

  };

}

if(typeof renderMain === 'function'){

  const _mtRenderMainOriginal = renderMain;

  renderMain = function(){

    _mtRenderMainOriginal.apply(this, arguments);

    renderModoSwitch();
    aplicarBloqueoVisualización();
    actualizarIndicadorAutoguardado();

  };

}

if(typeof renderFormTab === 'function'){

  const _mtRenderFormTabOriginal = renderFormTab;

  renderFormTab = function(){

    /*
       Justo antes de que 06-registro.js decida si arma un
       formulario en blanco, le "pre-sembramos" el borrador
       restaurado (si existe). Como la condición original es
       `if(!draft || draft.linea !== state.currentLine)`,
       dejar draft ya listo con draft.linea === currentLine
       evita que lo sobrescriba con uno vacío.
    */

    if(!draft || draft.linea !== state.currentLine){

      const restaurado = intentarRestaurarBorrador(state.currentLine);

      if(restaurado){
        draft = restaurado;
      }

    }

    return _mtRenderFormTabOriginal.apply(this, arguments);

  };

}

if(typeof saveDraft === 'function'){

  const _mtSaveDraftOriginal = saveDraft;

  saveDraft = async function(){

    if(esModoSoloLectura()){

      alert(
        'Estás en modo VISUALIZAR (solo consulta).\n\n' +
        'Cambia a modo TRABAJAR (arriba, junto a tu usuario) ' +
        'para poder guardar el registro.'
      );

      return;

    }

    const lineaGuardada = state.currentLine;

    await _mtSaveDraftOriginal.apply(this, arguments);

    /*
       El registro original solo cambia currentTab a
       'historial' en la ruta de ÉXITO (ver 06-registro.js).
       Si falló (foto faltante, error de red, etc.) el tab
       sigue siendo 'nuevo' y NO se borra el borrador, así el
       supervisor no pierde nada si el guardado final falla.
    */

    if(state.currentTab === 'historial'){

      clearTimeout(_mtAutosaveTimer);

      eliminarBorradorNuevoRegistro(lineaGuardada);

      _mtUltimoEstadoGuardado = null;
      _mtUltimoGuardadoISO = null;

    }

  };

}