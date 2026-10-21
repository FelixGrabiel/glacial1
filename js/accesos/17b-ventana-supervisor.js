/* =============================================================
   GLACIAL · VENTANA DE TRABAJO DEL SUPERVISOR
   -------------------------------------------------------------
   Decide, con la hora del SERVIDOR (hora de Lima), si un supervisor puede usar el modo TRABAJAR en este momento.

   DE DÓNDE SALE EL HORARIO (por cada fecha operativa: ayer y hoy):
     1) Rotación de supervisores PUBLICADA (31-rotacion-supervisores.js), con sus reemplazos. Se usan las horas de la
        CELDA, no el nombre del turno: un turno de 12 h (Día 07:00–19:00 o Noche 19:00–07:00) funciona igual.
     2) Si esa fecha no tiene rotación publicada: el horario guardado en el perfil del supervisor (respaldo). Se avisa
        en el cronómetro para que Jefatura publique la rotación.
     · «Descanso», «Vacaciones», «Licencia» u «Otro» en la rotación = sin ventana ese día (NO se usa el perfil).
     · Sin rotación y sin horario en el perfil: no se bloquea (se avisa). Nunca se para la planta por falta de datos.

   LA VENTANA:
     abre   = inicio − 15 min (entrada anticipada)
     cierra = fin + 30 min de tolerancia (SOLO turno NOCHE; la misma constante que 51b-horarios-produccion.js)
              + minutos que el Administrador haya dado (colección ampliacionesTurno, 17c-ampliaciones-turno.js)
     aviso  = últimos 15 min antes del cierre

   SOLO aplica a usuarios con rol «Supervisor» (los de la rotación). Administrador, Jefatura y demás roles no cambian.
   Los turnos de PRODUCCIÓN (indicadores, fechas operativas, tareo) NO se tocan: esto solo decide el acceso.

   CORTE DE LAS 19:00 (bloques de producción): contextoRegistro / contextoAvance dicen en qué bloque (DÍA o NOCHE) cae
   un registro o un avance según el horario de producción por línea (51b, Planificación → Horario de producción).
   Si la Noche de una línea empieza a las 19:00, todo lo de después de las 19:00 va a la Noche, lo registre quien lo
   registre (por ejemplo el supervisor intermedio entre 19:00 y 22:00).

   LÍMITE (etapa 1): el bloqueo se aplica en el navegador, igual que el bloqueo del tareo (41-tareo-bloqueo.js).
   Protege del uso normal; la validación en el servidor de los guardados del supervisor es la etapa 2.

   Cargar ANTES de 17-modo-trabajo.js. Las funciones puras (calcularVentana, msLima) también se cargan desde Node
   para las pruebas: node tests/ventana-supervisor.test.js
   ============================================================= */
(function(raiz){
  'use strict';

  const ANTICIPO_MIN = 15;
  const AVISO_MIN = 15;
  const TOLERANCIA_NOCHE_MIN_DEF = 30;
  const LIMA_MS = 5 * 3600000;                         // Lima = UTC−5, sin horario de verano
  const OPERATIVOS = ['DÍA', 'INTERMEDIO', 'NOCHE'];

  const p2 = n => String(n).padStart(2, '0');
  const hhmmOk = t => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(t || '').trim());
  const aMin = t => { const [h, m] = String(t).trim().split(':').map(Number); return h * 60 + m; };

  /* Instante (ms) de una fecha 'YYYY-MM-DD' + 'HH:MM' en hora de Lima, sumando díasExtra. */
  function msLima(fecha, hhmm, diasExtra){
    const m = String(fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m || !hhmmOk(hhmm)) return null;
    const min = aMin(hhmm);
    return Date.UTC(+m[1], +m[2] - 1, +m[3] + (diasExtra || 0), Math.floor(min / 60), min % 60) + LIMA_MS;
  }
  function horaLima(ms){
    const d = new Date(ms - LIMA_MS);
    return p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes());
  }

  /* ---------------------------------------------------------
     NÚCLEO PURO
     entrada: { ahoraMs, asignaciones:[{fecha, turno, inicio, fin, origen}], ampliaciones:[{fechaOperativa, turno,
                minutos, estado}], toleranciaNocheMin }
     salida : { estado, puedeTrabajar, porCerrar, ventana|null, proxima|null, ultima|null, restanteMs, ... }
       estado: ANTICIPADA · ABIERTA · TOLERANCIA · AMPLIADA (puede trabajar)
               ANTES (aún no abre) · CERRADA (ya cerró) · SIN_TURNO (descanso / sin turno operativo)
     --------------------------------------------------------- */
  function construirVentana(a, ampliaciones, tolNoche){
    if(!a || !OPERATIVOS.includes(a.turno) || !hhmmOk(a.inicio) || !hhmmOk(a.fin)) return null;
    const cruza = aMin(a.fin) <= aMin(a.inicio);
    const inicioMs = msLima(a.fecha, a.inicio, 0);
    const finMs = msLima(a.fecha, a.fin, cruza ? 1 : 0);
    if(inicioMs === null || finMs === null) return null;
    const toleranciaMin = a.turno === 'NOCHE' ? tolNoche : 0;
    const amps = (ampliaciones || []).filter(x => x && x.estado !== 'ANULADA'
      && x.fechaOperativa === a.fecha && x.turno === a.turno && Number(x.minutos) > 0);
    const ampliacionMin = amps.reduce((s, x) => s + Number(x.minutos), 0);
    // Cada ampliación suma sus minutos al cierre vigente; si se dio cuando el turno YA había cerrado, cuenta desde ese momento
    // (dar 30 min a las 16:00 a un turno que cerró a las 15:00 deja trabajar hasta las 16:30, no hasta las 15:30).
    let cierreMs = finMs + toleranciaMin * 60000;
    amps.slice().sort((x, y) => (Number(x.creadoEnMs) || 0) - (Number(y.creadoEnMs) || 0)).forEach(x => {
      cierreMs = Math.max(cierreMs, Number(x.creadoEnMs) || 0) + Number(x.minutos) * 60000;
    });
    return {
      fecha: a.fecha, turno: a.turno, inicio: a.inicio, fin: a.fin, origen: a.origen || 'ROTACION',
      aperturaMs: inicioMs - ANTICIPO_MIN * 60000,
      inicioMs, finMs,
      toleranciaMin,
      toleranciaFinMs: finMs + toleranciaMin * 60000,
      ampliacionMin,
      cierreMs
    };
  }

  function calcularVentana(entrada){
    const e = entrada || {};
    const ahora = Number(e.ahoraMs);
    const tol = Number.isFinite(Number(e.toleranciaNocheMin)) ? Number(e.toleranciaNocheMin) : TOLERANCIA_NOCHE_MIN_DEF;
    const ventanas = (e.asignaciones || [])
      .map(a => construirVentana(a, e.ampliaciones, tol))
      .filter(Boolean)
      .sort((x, y) => x.aperturaMs - y.aperturaMs);

    const base = { puedeTrabajar: false, porCerrar: false, ventana: null, proxima: null, ultima: null, restanteMs: 0, ahoraMs: ahora };

    const v = ventanas.find(x => ahora >= x.aperturaMs && ahora < x.cierreMs);
    if(v){
      let estado = 'ABIERTA';
      if(ahora < v.inicioMs) estado = 'ANTICIPADA';
      else if(ahora >= v.toleranciaFinMs) estado = 'AMPLIADA';
      else if(ahora >= v.finMs) estado = 'TOLERANCIA';
      const restanteMs = v.cierreMs - ahora;
      return Object.assign(base, { estado, puedeTrabajar: true, ventana: v, restanteMs,
        porCerrar: restanteMs <= AVISO_MIN * 60000 });
    }
    const proxima = ventanas.find(x => x.aperturaMs > ahora) || null;
    const ultima = ventanas.filter(x => x.cierreMs <= ahora).pop() || null;
    // Recién cerrado (menos de 6 h): se informa el cierre. Si no, y hay una apertura pendiente hoy: «abre a las…».
    if(ultima && ahora - ultima.cierreMs < 6 * 3600000) return Object.assign(base, { estado: 'CERRADA', ultima, proxima });
    if(proxima) return Object.assign(base, { estado: 'ANTES', proxima, ultima });
    if(ultima) return Object.assign(base, { estado: 'CERRADA', ultima });
    return Object.assign(base, { estado: 'SIN_TURNO' });
  }

  const nucleo = { calcularVentana, msLima, horaLima, ANTICIPO_MIN, AVISO_MIN, TOLERANCIA_NOCHE_MIN_DEF };
  if(typeof module !== 'undefined' && module.exports){ module.exports = nucleo; }
  if(typeof raiz.document === 'undefined') return;   // Node: solo el núcleo

  /* =========================================================
     NAVEGADOR
     ========================================================= */
  const VS = raiz.glacialVentanaSupervisor = Object.assign({}, nucleo);

  const ahoraMs = () => {
    try{ if(raiz.GlacialFecha) return raiz.GlacialFecha.ahoraMs(); }catch(_){}
    try{ if(typeof raiz.tareoAhoraServidor === 'function') return Number(raiz.tareoAhoraServidor()); }catch(_){}
    return Date.now();
  };
  const fechaHoy = ms => {
    try{ if(raiz.GlacialFecha) return raiz.GlacialFecha.fechaISOLocal(ms); }catch(_){}
    const d = new Date(ms - LIMA_MS); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
  };
  const sumarDias = (f, n) => {
    try{ if(raiz.GlacialFecha) return raiz.GlacialFecha.sumarDias(f, n); }catch(_){}
    const [y, m, d] = f.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d + n));
    return x.getUTCFullYear() + '-' + p2(x.getUTCMonth() + 1) + '-' + p2(x.getUTCDate());
  };
  const toleranciaNoche = () => {
    const t = raiz.glacialHorarios && Number(raiz.glacialHorarios.TOLERANCIA_MIN);
    return Number.isFinite(t) && t >= 0 ? t : TOLERANCIA_NOCHE_MIN_DEF;
  };
  const usuarioActual = () => (typeof state !== 'undefined' && state && state.user) || null;

  /* Solo los supervisores de la rotación (mismo criterio que resolverContextoRotacionSupervisor). */
  VS.aplicaA = function(u){
    u = u || usuarioActual();
    return !!u && String(u.rol || '').trim() === 'Supervisor';
  };

  /* ---------- ampliaciones del Administrador (colección ampliacionesTurno) ---------- */
  let ampliaciones = [], ampliacionesListas = false, ampliacionesError = '';
  const oyentes = [];
  VS.alCambiar = fn => { if(typeof fn === 'function') oyentes.push(fn); };
  const avisar = () => oyentes.forEach(fn => { try{ fn(); }catch(e){ console.warn('Ventana del supervisor:', e); } });
  const tsMs = v => (v && typeof v.toMillis === 'function') ? v.toMillis() : (typeof v === 'number' ? v : 0);

  function escucharAmpliaciones(){
    if(typeof db === 'undefined') return null;
    const desde = sumarDias(fechaHoy(ahoraMs()), -3);
    return db.collection('ampliacionesTurno').where('fechaOperativa', '>=', desde).onSnapshot(snap => {
      ampliaciones = snap.docs.map(d => Object.assign({ id: d.id }, d.data(), { creadoEnMs: tsMs(d.data().creadoEn) }));
      ampliacionesListas = true; ampliacionesError = '';
      avisar();
    }, err => {
      ampliacionesListas = true;
      ampliacionesError = (err && err.message) || String(err);
      console.warn('Ampliaciones de turno: no se pudieron leer (¿falta aplicar glacial_29 en Supabase?).', ampliacionesError);
      avisar();
    });
  }
  if(typeof _escuchaRestringida === 'function'){
    _escuchaRestringida('ampliacionesTurno', escucharAmpliaciones);
  }else{
    try{ escucharAmpliaciones(); }catch(e){ console.warn('Ampliaciones de turno:', e); }
  }
  VS.ampliaciones = () => ampliaciones.slice();
  VS.estadoAmpliaciones = () => ({ listas: ampliacionesListas, error: ampliacionesError });

  /* ---------- asignaciones del supervisor: rotación publicada o perfil ---------- */
  function asignacionPerfil(u, fecha){
    const inicio = String(u.horarioInicio || '').trim(), fin = String(u.horarioFin || '').trim();
    if(!hhmmOk(inicio) || !hhmmOk(fin)) return null;
    let turno = String(u.turnoSupervisor || '').trim();
    if(!OPERATIVOS.includes(turno) && typeof clasificarTurnoPorHorario === 'function') turno = clasificarTurnoPorHorario(inicio, fin) || '';
    if(!OPERATIVOS.includes(turno)) return null;
    return { fecha, turno, inicio, fin, origen: 'PERFIL' };
  }

  VS.asignaciones = function(u, ms){
    u = u || usuarioActual();
    if(!u) return null;
    if(typeof _rotacionesReady !== 'undefined' && !_rotacionesReady) return null;   // aún cargando
    const hayRotacion = typeof rotSupBuscarSemanaPorFecha === 'function' && typeof rotSupAsignacionFecha === 'function';
    const hoy = fechaHoy(ms), ayer = sumarDias(hoy, -1);
    const lista = []; let sinRotacionHoy = false, descansoHoy = false, sinHorario = false;
    [ayer, hoy].forEach(f => {
      const rot = hayRotacion ? rotSupBuscarSemanaPorFecha(f, true) : null;
      const a = rot ? rotSupAsignacionFecha(rot, u.username, f) : null;
      if(a && a.turno){
        if(OPERATIVOS.includes(a.turno)){
          lista.push({ fecha: f, turno: a.turno, inicio: a.inicio, fin: a.fin, origen: a.excepcion ? 'EXCEPCION' : 'ROTACION' });
        }else if(f === hoy){
          descansoHoy = true;            // descanso / vacaciones / licencia / otro / reemplazado: sin ventana (NO se usa el perfil)
        }
        return;
      }
      // Sin rotación publicada para esa fecha, o el supervisor no figura en ella (p. ej. recién agregado): respaldo del perfil.
      // Para AYER solo si ayer no había rotación publicada: si la había y no figuraba, no tuvo turno (no se inventa una Noche de madrugada).
      if(f !== hoy && rot) return;
      if(f === hoy) sinRotacionHoy = true;
      const p = asignacionPerfil(u, f);
      if(p) lista.push(p); else if(f === hoy) sinHorario = true;
    });
    return { lista, sinRotacionHoy, descansoHoy, sinHorario: sinHorario && !lista.length };
  };

  /* ---------- estado actual del usuario de la sesión ---------- */
  VS.estado = function(u){
    u = u || usuarioActual();
    const ms = ahoraMs();
    if(!VS.aplicaA(u)) return { aplica: false, puedeTrabajar: true, estado: 'NO_APLICA', ahoraMs: ms };
    const asig = VS.asignaciones(u, ms);
    if(!asig) return { aplica: true, puedeTrabajar: true, estado: 'CARGANDO', ahoraMs: ms };
    if(asig.sinHorario) return { aplica: true, puedeTrabajar: true, estado: 'SIN_HORARIO', sinRotacionHoy: true, ahoraMs: ms };
    const propias = ampliaciones.filter(x => String(x.username || '').toLowerCase() === String(u.username || '').toLowerCase());
    const r = calcularVentana({ ahoraMs: ms, asignaciones: asig.lista, ampliaciones: propias, toleranciaNocheMin: toleranciaNoche() });
    // Con descanso hoy y un cierre de hace más de 6 h, se informa el descanso (no «tu turno cerró ayer»).
    if(r.estado === 'CERRADA' && asig.descansoHoy && r.ultima && ms - r.ultima.cierreMs >= 6 * 3600000) r.estado = 'SIN_TURNO';
    return Object.assign(r, { aplica: true, sinRotacionHoy: asig.sinRotacionHoy, descansoHoy: asig.descansoHoy });
  };
  VS.puedeTrabajar = u => VS.estado(u).puedeTrabajar !== false;

  /* Texto corto para mensajes. */
  VS.textoBloqueo = function(st){
    st = st || VS.estado();
    if(st.estado === 'ANTES' && st.proxima) return 'Tu turno ' + st.proxima.turno + ' abre a las ' + horaLima(st.proxima.aperturaMs) + ' (15 min antes de las ' + st.proxima.inicio + ').';
    if(st.estado === 'CERRADA' && st.ultima) return 'Tu turno ' + st.ultima.turno + ' cerró a las ' + horaLima(st.ultima.cierreMs) + '.';
    if(st.estado === 'SIN_TURNO') return st.descansoHoy ? 'Hoy figuras en descanso en la rotación.' : 'No tienes un turno asignado en este momento.';
    return '';
  };

  /* =========================================================
     CORTE DE LAS 19:00 · BLOQUE DE PRODUCCIÓN POR RELOJ
     ========================================================= */
  const lineas = () => (typeof LINES !== 'undefined' && Array.isArray(LINES) ? LINES.map(l => l.key) : ['PET1', 'PET2', 'B7L', 'C20L', 'B20L']);

  /* ¿La Noche de esta línea está en curso? → {turno:'NOCHE', fecha, inicio, fin} | null. Usa el horario por línea (51b). */
  function nocheEnCurso(linea, ms){
    const H = raiz.glacialHorarios;
    if(!H || typeof H.resolver !== 'function') return null;
    const hoy = fechaHoy(ms);
    for(const f of [sumarDias(hoy, -1), hoy]){
      const r = H.resolver(linea, f, 'NOCHE');
      if(r && r.habilitado && ms >= r.inicioMs && ms < r.finMs) return { turno: 'NOCHE', fecha: f, inicio: r.inicioHHMM, fin: r.finHHMM };
    }
    return null;
  }
  VS.bloqueProduccion = function(linea, ms){
    ms = ms || ahoraMs();
    if(linea) return nocheEnCurso(linea, ms);
    for(const l of lineas()){ const r = nocheEnCurso(l, ms); if(r) return r; }
    return null;
  };

  const canon = t => String(t || '').toUpperCase().includes('NOCHE') ? 'NOCHE' : 'DÍA';

  /* Para «Nuevo registro»: bloque y fecha con los que nace un reporte en blanco de esta línea. null = regla de siempre. */
  VS.contextoRegistro = function(linea){
    const ms = ahoraMs();
    try{
      const st = VS.estado();
      if(st.aplica && st.ventana){
        const v = st.ventana;
        // Entrada anticipada (p. ej. 06:45): trabaja en SU turno, nunca en el borrador del turno que sale.
        if(ms < v.inicioMs) return { turno: canon(v.turno), fecha: v.fecha };
        // Noche en tolerancia o con tiempo extra: sigue siendo su Noche.
        if(canon(v.turno) === 'NOCHE' && ms >= v.finMs) return { turno: 'NOCHE', fecha: v.fecha };
      }
    }catch(_){}
    const n = nocheEnCurso(linea, ms);
    return n ? { turno: 'NOCHE', fecha: n.fecha } : null;
  };

  /* Bloque y fecha de un reporte NUEVO de la línea: contextoRegistro o, si no aplica, la regla de siempre
     (NOCHE de 22:00 a 07:00 por el reloj de Lima; la Noche de madrugada pertenece al día en que empezó). */
  VS.contextoNuevoRegistro = function(linea){
    const c = VS.contextoRegistro(linea);
    if(c) return c;
    const ms = ahoraMs(), GF = raiz.GlacialFecha;
    const turno = GF && GF.turnoActual(ms) === 'NOCHE' ? 'NOCHE' : 'DÍA';
    return { turno, fecha: GF ? GF.fechaOperativa(ms, turno) : fechaHoy(ms) };
  };

  /* Para «Avance y Cierre»: turno actual del dispositivo. turnoUsuario = turno de la rotación ('DÍA'|'INTERMEDIO'|'NOCHE'|''). */
  VS.contextoAvance = function(turnoUsuario){
    const ms = ahoraMs();
    try{
      const st = VS.estado();
      if(st.aplica && st.ventana && ms < st.ventana.inicioMs){
        return { turno: canon(st.ventana.turno), fecha: st.ventana.fecha, inicio: st.ventana.inicio, fin: st.ventana.fin, anticipada: true };
      }
    }catch(_){}
    if(canon(turnoUsuario) === 'NOCHE' && turnoUsuario) return null;     // la Noche de la rotación ya se resuelve en 29
    const n = VS.bloqueProduccion(null, ms);
    return n ? { turno: 'NOCHE', fecha: n.fecha, inicio: n.inicio, fin: n.fin, porReloj: true } : null;
  };

})(typeof window !== 'undefined' ? window : globalThis);
