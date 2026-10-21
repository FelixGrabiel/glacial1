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

   3) Cronómetro de turno. Para los supervisores de la rotación
      usa su VENTANA (17b-ventana-supervisor.js): abre 15 min antes,
      cierra al fin del turno (+30 min solo en Noche, + el tiempo que
      dé el Administrador) y al cerrar deja la cuenta en VISUALIZAR.
      Para los demás usuarios con cronómetro, el comportamiento de
      siempre (solo informativo).
   ============================================================= */
/*
 * BETTER COMMENTS · CABECERA GLACIAL
 ! IMPORTANTE: conservar IDs, eventos, sesión y permisos existentes.
 ! NO modificar aquí usuarios ni documentos de Firebase.
 ? Los cambios de este archivo relacionados con la cabecera son de presentación/estado visual.
 */




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

   Supervisores de la rotación: ver renderCronometroVentana (la
   ventana sale de su rotación publicada, ver 17b).
   Demás usuarios con cronómetro (informativo, sin bloqueo):
     MAÑANA  07:00 – 15:00 · TARDE 15:00 – 22:00 · NOCHE 22:00 – 07:00
   según GlacialIndicadores.turnoVigente (sin tolerancia).
   ========================================================= */

const MT_TOLERANCIA_NOCHE_MIN = 20;

function obtenerTurnoActual(ahora){

  ahora = ahora || new Date((typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now()));

  /* Turno y horarios: GlacialIndicadores.turnoVigente (07:00 / 15:00 / 22:00, sin tolerancia). */
  const t = GlacialIndicadores.turnoVigente(ahora.getTime());
  const meta = { 'DÍA':['MANANA','Mañana'], 'INTERMEDIO':['TARDE','Tarde'], 'NOCHE':['NOCHE','Noche'] }[t.turno];

  return {
    key: meta[0],
    nombre: meta[1],
    inicio: new Date(t.inicio),
    fin: new Date(t.fin),
    finConTolerancia: new Date(t.fin),
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

/* ---------------------------------------------------------
   VENTANA DEL SUPERVISOR (17b-ventana-supervisor.js)
   Supervisores de la rotación: el cronómetro se ve SIEMPRE (también en
   Visualizar), cuenta hasta el CIERRE real (fin + tolerancia de Noche +
   tiempo dado por el Administrador) y, al cerrar, guarda el borrador y
   pasa la cuenta a modo VISUALIZAR. Solo el Administrador amplía.
   --------------------------------------------------------- */
const _mtVS = () => window.glacialVentanaSupervisor || null;
const _mtEsc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function _mtAplicaVentana(){
  const VS = _mtVS();
  return !!(VS && state?.user && VS.aplicaA(state.user));
}
let _mtCerrandoTurno = false;
let _mtAvisoMostrado = '';
let _mtUltimoPuedeTrabajar = null;

function _mtToastTurno(texto){
  let el = document.getElementById('mt-toast-turno');
  if(!el){
    el = document.createElement('div');
    el.id = 'mt-toast-turno';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = texto;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = 'none'; }, 12000);
}

function _mtCerrarPorFinDeTurno(st){
  if(_mtCerrandoTurno) return;
  _mtCerrandoTurno = true;
  try{
    // Lo que el supervisor estaba escribiendo se guarda como borrador ANTES de bloquear: nunca se pierde.
    if(state.currentTab === 'nuevo' && draft && !esModoSoloLectura()){
      clearTimeout(_mtAutosaveTimer);
      ejecutarAutoguardadoNuevoRegistro();
    }
  }catch(e){
    console.error('No se pudo guardar el borrador al cerrar el turno:', e);
  }
  establecerModoTrabajo('visualizar', { silencioso: true });
  const VS = _mtVS();
  const root = document.getElementById('modal-root');
  if(root){
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <div class="modal-head"><h3>🔒 Tu turno cerró</h3></div>
          <div class="modal-body">
            <p style="margin:0 0 8px;font-size:14px;line-height:1.6;">${_mtEsc(VS ? VS.textoBloqueo(st) : '')}</p>
            <p style="margin:0 0 8px;color:var(--text-soft);font-size:13.5px;line-height:1.6;">
              Quedaste en modo <b>VISUALIZAR</b>: puedes consultar todo, pero ya no registrar.
              Lo que estabas escribiendo en «Nuevo registro» quedó guardado como borrador.
            </p>
            <p style="margin:0;color:var(--text-soft);font-size:13.5px;line-height:1.6;">
              Si necesitas más tiempo, pídelo al <b>administrador</b>: solo él puede ampliarlo.
            </p>
            <div style="display:flex;justify-content:flex-end;margin-top:14px;">
              <button type="button" class="btn btn-primary" onclick="closeModal()">Entendido</button>
            </div>
          </div>
        </div>
      </div>`;
  }
  _mtCerrandoTurno = false;
}

function _mtHtmlCierre(v){
  const extras = [];
  if(v.toleranciaMin) extras.push('+' + v.toleranciaMin + ' min tolerancia');
  if(v.ampliacionMin) extras.push('+' + v.ampliacionMin + ' min del admin');
  return _mtFmtHora(new Date(v.cierreMs)) + (extras.length ? ' <small style="font-weight:500">(' + extras.join(', ') + ')</small>' : '');
}

function renderCronometroVentana(box){
  const VS = _mtVS();
  const st = VS.estado(state.user);

  if(st.aplica && st.puedeTrabajar === false && state.workMode === 'trabajar'){
    _mtCerrarPorFinDeTurno(st);
  }
  document.body.classList.toggle('turno-cerrado', st.aplica && st.puedeTrabajar === false);
  if(_mtUltimoPuedeTrabajar !== st.puedeTrabajar){
    _mtUltimoPuedeTrabajar = st.puedeTrabajar;
    renderModoSwitch();
  }

  box.style.display = 'flex';
  box.classList.remove('cro-aviso', 'cro-cerrado');
  const nombreTurno = t => ({ 'DÍA':'Día', 'INTERMEDIO':'Intermedio', 'NOCHE':'Noche' }[t] || t || '');

  if(st.estado === 'CARGANDO'){
    box.innerHTML = '<div class="cro-turno-nombre">Turno</div><div class="cro-nota">Cargando la rotación…</div>';
    return;
  }
  if(st.estado === 'SIN_HORARIO'){
    box.innerHTML = '<div class="cro-turno-nombre">Turno sin horario</div>'
      + '<div class="cro-nota">No hay rotación publicada ni horario en tu perfil. Avísale a Jefatura de Producción.</div>';
    actualizarIndicadorAutoguardado();
    return;
  }

  if(st.puedeTrabajar && st.ventana){
    const v = st.ventana, ahora = st.ahoraMs;
    let estado = 'En curso', clase = '';
    if(st.estado === 'ANTICIPADA'){ estado = 'Entrada anticipada · empieza a las ' + v.inicio; }
    else if(st.estado === 'TOLERANCIA'){ estado = 'Tolerancia de Noche'; clase = 'cro-estado-tolerancia'; }
    else if(st.estado === 'AMPLIADA'){ estado = 'Tiempo extra dado por el administrador'; clase = 'cro-estado-tolerancia'; }
    if(st.porCerrar){
      estado = 'Por cerrar · guarda tus registros';
      clase = 'cro-estado-aviso';
      box.classList.add('cro-aviso');
      const clave = v.fecha + '|' + v.turno + '|' + v.cierreMs;
      if(_mtAvisoMostrado !== clave && state.workMode === 'trabajar'){
        _mtAvisoMostrado = clave;
        _mtToastTurno('⏳ Tu turno cierra a las ' + _mtFmtHora(new Date(v.cierreMs)) + '. Guarda tus registros: después quedarás en modo visualización.');
      }
    }
    const nota = v.origen === 'PERFIL'
      ? '<div class="cro-nota">Sin rotación publicada: se usa el horario de tu perfil. Avísale a Jefatura.</div>'
      : '';
    box.innerHTML = `
      <div class="cro-turno-nombre">Turno ${_mtEsc(nombreTurno(v.turno))} · ${v.inicio}–${v.fin}</div>
      <div class="cro-fila"><span>${ahora < v.inicioMs ? 'Empieza en' : 'Transcurrido'}</span><b>${_mtFmtDuracion(Math.abs(ahora - v.inicioMs))}</b></div>
      <div class="cro-fila"><span>Cierre</span><b>${_mtHtmlCierre(v)}</b></div>
      <div class="cro-fila"><span>Restante</span><b>${_mtFmtDuracion(st.restanteMs)}</b></div>
      <div class="cro-estado ${clase}">${estado}</div>
      ${nota}`;
    actualizarIndicadorAutoguardado();
    return;
  }

  box.classList.add('cro-cerrado');
  box.innerHTML = `
    <div class="cro-turno-nombre">🔒 Solo visualización</div>
    <div class="cro-nota">${_mtEsc(VS.textoBloqueo(st))}</div>
    <div class="cro-estado cro-estado-cerrado">Más tiempo: solo el administrador</div>`;
  actualizarIndicadorAutoguardado();
}

function renderCronometroTurno(){

  const box = document.getElementById('cronometro-turno');

  if(!box) return;

  if(_mtAplicaVentana()){
    renderCronometroVentana(box);
    return;
  }

  if(!esSupervisorParaCronometro()){
    box.style.display = 'none';
    return;
  }

  if(state.workMode !== 'trabajar'){

    box.style.display = 'none';

    actualizarIndicadorAutoguardado();

    return;

  }

  const ahora = new Date((typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now()));

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

function _mtUsuarioSoloConsulta(){
  /*
   * BETTER COMMENTS · CONTROL DE PERMISOS
   ! IMPORTANTE: esta función NO modifica usuarios, roles ni permisos.
   ! IMPORTANTE: NO escribe en Firebase.
   * Solo consulta la función oficial esUsuarioSoloConsulta() del sistema.
   ? Si el usuario es de solo consulta, el botón TRABAJAR debe permanecer bloqueado.
  */
  try{
    return typeof esUsuarioSoloConsulta === 'function'
      ? !!esUsuarioSoloConsulta(state?.user)
      : false;
  }catch(e){
    return false;
  }
}

function establecerModoTrabajo(modo, opts){

  opts = opts || {};

  if(modo !== 'visualizar' && modo !== 'trabajar'){
    return;
  }

  /* ! IMPORTANTE: usuarios de SOLO CONSULTA nunca pueden activar TRABAJAR. */
  if(modo === 'trabajar' && _mtUsuarioSoloConsulta()){
    modo = 'visualizar';
  }

  /* Supervisor fuera de su ventana de turno (17b): TRABAJAR no se activa. Solo el Administrador amplía el tiempo. */
  if(modo === 'trabajar' && _mtAplicaVentana()){
    const VS = _mtVS(), st = VS.estado(state.user);
    if(st.puedeTrabajar === false){
      if(!opts.silencioso){
        alert('No puedes activar el modo TRABAJAR.\n\n' + VS.textoBloqueo(st) +
          '\n\nSi necesitas más tiempo, pídelo al administrador.');
      }
      modo = 'visualizar';
    }
  }

  state.workMode = modo;

  try{
    sessionStorage.setItem(MT_STORAGE_KEY, modo);
  }catch(e){}

  document.body.classList.toggle('modo-visualizar', modo === 'visualizar');
  document.body.classList.toggle('modo-trabajar', modo === 'trabajar');

  renderModoSwitch();

  aplicarBloqueoVisualización();

  if(modo === 'trabajar' || _mtAplicaVentana()){

    // Al supervisor de la rotación el cronómetro le sigue corriendo en VISUALIZAR (muestra el cierre o cuándo abre).
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

  const soloConsulta = _mtUsuarioSoloConsulta();
  let fueraDeTurno = false, textoFuera = '';
  if(!soloConsulta && _mtAplicaVentana()){
    const st = _mtVS().estado(state.user);
    fueraDeTurno = st.puedeTrabajar === false;
    textoFuera = fueraDeTurno ? _mtVS().textoBloqueo(st) + ' Solo el administrador puede darte más tiempo.' : '';
  }

  document.querySelectorAll('#modo-switch .modo-btn').forEach(btn => {

    const modoBtn = btn.getAttribute('data-modo');
    const activo = modoBtn === state.workMode;

    btn.classList.toggle('activo', activo);
    btn.setAttribute('aria-pressed', activo ? 'true' : 'false');

    if(modoBtn === 'trabajar'){
      btn.disabled = soloConsulta || fueraDeTurno;
      btn.setAttribute(
        'aria-disabled',
        (soloConsulta || fueraDeTurno) ? 'true' : 'false'
      );

      if(soloConsulta){
        btn.title = 'No disponible para usuarios de solo consulta';
      } else if(fueraDeTurno){
        btn.title = textoFuera;
      } else {
        btn.title = 'Modo operativo: registrar producción, paradas y observaciones';
      }
    }

  });

  /*
   * PERFIL DEL USUARIO
   ! IMPORTANTE: nombre y cargo se toman de la sesión actual; NO fijar valores manualmente.
   * CSS puede abreviar visualmente nombres largos con "...".
   * El atributo title conserva nombre + cargo completos al pasar el cursor.
  */
  const chip = document.querySelector('.topbar .user-chip');
  const nombre = document.getElementById('user-name')?.textContent?.trim() || '';
  const cargo = document.getElementById('user-role')?.textContent?.trim() || '';
  if(chip){
    chip.title = [nombre, cargo].filter(Boolean).join(' · ');
  }

}

/*
   Bloquea visualmente (vía CSS) la edición dentro de
   #tab-content cuando: estamos en modo VISUALIZAR Y la
   pestaña abierta es una que registra datos operativos
   ("Nuevo registro" o "Paletas"). El resto de pestañas
   (Historial, graficos, Resumen, Impacto Económico,
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
                y graficos. No permite modificar datos.
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

  if(_mtUsuarioSoloConsulta()){

    establecerModoTrabajo('visualizar', { silencioso: true });

  } else if(guardado === 'visualizar' || guardado === 'trabajar'){

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

  _escuchaRestringida('borradoresNuevoRegistro', () => db.collection('sync').doc('borradoresNuevoRegistro')

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

    ));

}

function loadBorradoresNuevoRegistro(){

  return _borradoresNuevoRegistroCache;

}

/* Un borrador por LÍNEA + FECHA OPERATIVA + GRUPO DE TURNO (Día+Intermedio / Noche).
   Antes era uno por línea: el supervisor que entra 15 min antes (06:45) recuperaba o
   pisaba el borrador del supervisor de Noche, que sigue trabajando hasta las 07:30.
   Ahora cada turno tiene el suyo y el relevo no se cruza. */
function _mtGrupoBorrador(turno){
  return String(turno || '').toUpperCase().includes('NOCHE') ? 'NOCHE' : 'DIA_INTERMEDIO';
}
function _mtMismoBorrador(b, linea, fecha, turno){
  return b && b.linea === linea && b.fecha === fecha && _mtGrupoBorrador(b.turno) === _mtGrupoBorrador(turno);
}

function obtenerBorradorNuevoRegistro(linea, fecha, turno){

  const items = loadBorradoresNuevoRegistro();
  if(fecha){
    return items.find(b => _mtMismoBorrador(b, linea, fecha, turno)) || null;
  }
  return items.find(b => b.linea === linea) || null;

}

function guardarBorradorNuevoRegistro(linea, draftObj){

  const items = loadBorradoresNuevoRegistro().slice();

  const idx = items.findIndex(b => _mtMismoBorrador(b, linea, draftObj.fecha, draftObj.turno));

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

function eliminarBorradorNuevoRegistro(linea, clave){

  // Con clave (fecha y turno del registro guardado) se borra SOLO el borrador de ese turno: el del otro turno de la línea se conserva.
  const items =
    loadBorradoresNuevoRegistro().filter(b =>
      clave && clave.fecha ? !_mtMismoBorrador(b, linea, clave.fecha, clave.turno) : b.linea !== linea);

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

  /* Solo se restaura el borrador del turno EN CURSO para esta persona y
     esta línea (misma fecha operativa y mismo grupo de turno con el que
     nacería un reporte nuevo): un borrador de otro turno o de un día
     anterior no "resucita" en un turno nuevo, y el del turno que sale
     no se mezcla con el del que entra. */
  let ctx = null;
  try{
    ctx = window.glacialVentanaSupervisor ? window.glacialVentanaSupervisor.contextoNuevoRegistro(lineKey) : null;
  }catch(e){ ctx = null; }
  if(!ctx) ctx = { fecha: _mtFechaHoyISO(), turno: 'DÍA' };

  const guardado = obtenerBorradorNuevoRegistro(lineKey, ctx.fecha, ctx.turno);

  if(!guardado || !guardado.draft) return null;

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

    if(_mtAplicaVentana()){
      const st = _mtVS().estado(state.user);
      if(st.puedeTrabajar === false){
        alert('Tu turno ya cerró: no se puede guardar el registro.\n\n' + _mtVS().textoBloqueo(st) +
          '\n\nTu avance quedó como borrador. Si necesitas más tiempo, pídelo al administrador.');
        _mtCerrarPorFinDeTurno(st);
        return;
      }
    }

    const lineaGuardada = state.currentLine;
    const borradorGuardado = draft ? { fecha: draft.fecha, turno: draft.turno } : null;

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

      eliminarBorradorNuevoRegistro(lineaGuardada, borradorGuardado);

      _mtUltimoEstadoGuardado = null;
      _mtUltimoGuardadoISO = null;

    }

  };

}