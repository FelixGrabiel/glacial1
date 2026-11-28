/* =============================================================
   GLACIAL · PERSONAL · CONVOCATORIA SEMANAL · NÚCLEO PURO (27/11/2026)
   -------------------------------------------------------------
   docs/personal-tareo/convocatoria-semanal.md
   La convocatoria de la semana la arma el SUPERVISOR dentro de GLACIAL (antes: Excel → imagen por WhatsApp → se volvía a digitar en el Tareo).
   Aquí solo hay lógica pura (se prueba con node, sin pantalla ni servidor):
     · equipos de trabajo con horario propio (columna DÍA | NOCHE de la imagen y turno base DÍA | INTERMEDIO | NOCHE para el resto del sistema)
     · cambioDeTurno (⇄, automático: la semana anterior estaba en la otra columna) y esNuevo (NUEVO, automático: ingreso en las últimas N semanas)
     · validarConvocatoria (avisos amarillos: día y noche a la vez, sin DNI, bajo el mínimo, en descanso/vacaciones y convocado, dado de baja)
     · totales, copiarSemana, prellenarTareo (personal del Tareo diario con su equipo y horario), tardanzaPorHorarioEquipo (cruza medianoche)
     · importador de transición: leerConvocatoriaTexto (formato de la imagen actual) y cruzarNombres (con el maestro de trabajadores y alias)
   Identidad de la persona: el id del maestro de trabajadores (sync/workers). El nombre ya no lleva «NUEVO» ni «*».
   ============================================================= */
(function(raiz){
  'use strict';
  const COLUMNAS = ['DÍA', 'NOCHE'];
  const BLOQUES = { DESCANSO_MEDICO: 'Descanso médico', VACACIONES: 'Vacaciones', LICENCIA: 'Licencia' };
  const NUEVO_SEMANAS = 2;

  /* Equipos de la semana 23/11–29/11/2026 (catálogo editable; el mínimo es el de fábrica, se cambia en pantalla). */
  const EQUIPOS_FABRICA = [
    { id: 'pet-dia', nombre: 'Equipo PET', columna: 'DÍA', turnoBase: 'DÍA', inicio: '07:00', fin: '19:00', minimo: 8, orden: 1 },
    { id: 'b7l-dia', nombre: 'Bidones 7L', columna: 'DÍA', turnoBase: 'DÍA', inicio: '07:00', fin: '19:00', minimo: 15, orden: 2 },
    { id: 'c20l-int', nombre: 'Cajas 20L', columna: 'DÍA', turnoBase: 'INTERMEDIO', inicio: '13:00', fin: '22:00', minimo: 10, orden: 3 },
    { id: 'hielo-dia', nombre: 'Equipo Hielo', columna: 'DÍA', turnoBase: 'DÍA', inicio: '07:00', fin: '19:00', minimo: 10, orden: 4 },
    { id: 'b20l-int', nombre: 'Bidones 20L', columna: 'DÍA', turnoBase: 'INTERMEDIO', inicio: '13:00', fin: '22:00', minimo: 4, orden: 5 },
    { id: 'b7l-noche', nombre: 'Bidones 7L', columna: 'NOCHE', turnoBase: 'NOCHE', inicio: '21:00', fin: '07:00', minimo: 10, orden: 6 },
    { id: 'hielo-noche', nombre: 'Equipo de Hielo', columna: 'NOCHE', turnoBase: 'NOCHE', inicio: '21:00', fin: '07:00', minimo: 12, orden: 7 },
    { id: 'pet-noche', nombre: 'PET', columna: 'NOCHE', turnoBase: 'NOCHE', inicio: '21:00', fin: '07:00', minimo: 12, orden: 8 }
  ];

  /* ---------- utilidades ---------- */
  const texto = v => v === undefined || v === null ? '' : String(v).trim();
  const norm = t => texto(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const esFecha = f => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ''));
  const esHora = h => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h || ''));
  const partes = f => esFecha(f) ? f.split('-').map(Number) : null;
  const diaUTC = f => { const p = partes(f); return p ? Date.UTC(p[0], p[1] - 1, p[2]) : NaN; };
  const iso = ms => { const d = new Date(ms), z = n => String(n).padStart(2, '0'); return d.getUTCFullYear() + '-' + z(d.getUTCMonth() + 1) + '-' + z(d.getUTCDate()); };
  /** Suma días a una fecha AAAA-MM-DD (sin zona horaria). */
  const sumarDias = (f, n) => esFecha(f) ? iso(diaUTC(f) + n * 86400000) : '';
  /** Lunes de la semana de una fecha (la convocatoria va de lunes a domingo). */
  function lunesDe(f){
    if(!esFecha(f)) return '';
    const dow = new Date(diaUTC(f)).getUTCDay() || 7;               // 1 = lunes … 7 = domingo
    return sumarDias(f, 1 - dow);
  }
  const minutos = h => { if(!esHora(h)) return null; const [a, b] = h.split(':').map(Number); return a * 60 + b; };
  const ddmm = f => esFecha(f) ? f.slice(8, 10) + '/' + f.slice(5, 7) : '';

  /* ---------- equipos ---------- */
  /** Equipo limpio (o null si no es válido): columna DÍA | NOCHE, turno base DÍA | INTERMEDIO | NOCHE, horario HH:MM, mínimo ≥ 0. */
  function limpiarEquipo(e){
    if(!e) return null;
    const nombre = texto(e.nombre).slice(0, 60);
    const columna = COLUMNAS.includes(e.columna) ? e.columna : (String(e.turnoBase || '').toUpperCase() === 'NOCHE' ? 'NOCHE' : 'DÍA');
    const turnoBase = ['DÍA', 'INTERMEDIO', 'NOCHE'].includes(e.turnoBase) ? e.turnoBase : (columna === 'NOCHE' ? 'NOCHE' : 'DÍA');
    if(!nombre || !esHora(e.inicio) || !esHora(e.fin)) return null;
    const id = texto(e.id) || (norm(nombre).replace(/ /g, '-') + '-' + (columna === 'NOCHE' ? 'noche' : 'dia'));
    return { id, nombre, columna, turnoBase, inicio: e.inicio, fin: e.fin, minimo: Math.max(0, Math.round(Number(e.minimo) || 0)), orden: Number(e.orden) || 0, activo: e.activo !== false };
  }
  const equiposDe = lista => (Array.isArray(lista) && lista.length ? lista : EQUIPOS_FABRICA).map(limpiarEquipo).filter(Boolean).filter(e => e.activo).sort((a, b) => a.orden - b.orden);
  const etiquetaEquipo = e => e ? e.nombre + ' ' + e.inicio + '–' + e.fin : '';
  /** Horas del horario de un equipo (cruza la medianoche: 21:00–07:00 = 10 h). */
  function horasEquipo(e){ const a = minutos(e && e.inicio), b = minutos(e && e.fin); if(a === null || b === null) return null; let d = (b - a + 1440) % 1440; if(d === 0) d = 1440; return d / 60; }

  /* ---------- asignaciones ---------- */
  /** Asignaciones de una convocatoria indexadas: equipo → [asignaciones ordenadas], bloque → [...]. Ignora las de equipos que no existen. */
  function porEquipo(conv, equipos){
    const eqs = equiposDe(equipos), m = new Map(eqs.map(e => [e.id, []])), bloques = new Map(Object.keys(BLOQUES).map(b => [b, []]));
    (conv && conv.asignaciones || []).forEach(a => {
      if(a.bloque && bloques.has(a.bloque)) bloques.get(a.bloque).push(a);
      else if(m.has(a.equipoId)) m.get(a.equipoId).push(a);
    });
    m.forEach(l => l.sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0)));
    return { equipos: eqs, porEquipo: m, bloques };
  }
  /** Columna (DÍA | NOCHE) en la que está una persona esta semana, o '' (solo cuentan equipos, no bloques). */
  function columnaDe(trabajadorId, conv, equipos){
    const eqs = new Map(equiposDe(equipos).map(e => [e.id, e]));
    const a = (conv && conv.asignaciones || []).find(x => x.trabajadorId === trabajadorId && !x.bloque && eqs.has(x.equipoId));
    return a ? eqs.get(a.equipoId).columna : '';
  }
  /** ⇄ «Cambió de turno»: AUTOMÁTICO. La semana anterior estaba en la otra columna (día ↔ noche). */
  function cambioDeTurno(trabajadorId, conv, anterior, equipos, equiposAnterior){
    const ahora = columnaDe(trabajadorId, conv, equipos), antes = columnaDe(trabajadorId, anterior, equiposAnterior || equipos);
    return !!(ahora && antes && ahora !== antes);
  }
  /** NUEVO: AUTOMÁTICO. Fecha de ingreso del maestro (o, si no tiene, la de alta en el sistema) dentro de las últimas N semanas antes del lunes de la convocatoria (o en la misma semana). */
  function esNuevo(trabajador, semana, n){
    const semanas = n === undefined || n === null || n === '' ? NUEVO_SEMANAS : Math.max(0, Number(n) || 0);
    const f = texto(trabajador && (trabajador.fechaIngreso || trabajador.ingreso)) || (trabajador && trabajador.creadoEn ? iso(Number(trabajador.creadoEn)) : '');
    if(!esFecha(f) || !esFecha(semana)) return false;
    const desde = sumarDias(semana, -7 * semanas), hasta = sumarDias(semana, 6);
    return f >= desde && f <= hasta;
  }
  const dniDe = t => texto(t && (t.dni || t.documento)).replace(/\s+/g, '');
  const estaDeBaja = t => !!t && (String(t.estado || '').toLowerCase() === 'inactivo' || !!t.baja || !!t.fechaCese);

  /** Avisos (amarillos, no bloquean). → [{ tipo, texto, trabajadorId?, equipoId? }] */
  function validarConvocatoria(conv, equipos, trabajadores){
    const T = new Map((trabajadores || []).map(t => [t.id, t])), nombre = id => (T.get(id) && T.get(id).nombre) || id;
    const { equipos: eqs, porEquipo: m, bloques } = porEquipo(conv, equipos), E = new Map(eqs.map(e => [e.id, e]));
    const avisos = [], visto = new Set();
    const columnas = new Map();                                       // trabajador → Set(columnas)
    m.forEach((l, eid) => l.forEach(a => { if(!columnas.has(a.trabajadorId)) columnas.set(a.trabajadorId, new Map()); columnas.get(a.trabajadorId).set(E.get(eid).columna, E.get(eid)); }));
    columnas.forEach((cols, id) => { if(cols.size > 1) avisos.push({ tipo: 'doble', trabajadorId: id, texto: nombre(id) + ' está en turno día y en turno noche' }); });
    const dobleEquipo = new Map();
    m.forEach(l => l.forEach(a => dobleEquipo.set(a.trabajadorId, (dobleEquipo.get(a.trabajadorId) || 0) + 1)));
    dobleEquipo.forEach((n, id) => { if(n > 1 && !(columnas.get(id) && columnas.get(id).size > 1)) avisos.push({ tipo: 'repetido', trabajadorId: id, texto: nombre(id) + ' está en ' + n + ' equipos' }); });
    const enEquipo = new Set(); m.forEach(l => l.forEach(a => enEquipo.add(a.trabajadorId)));
    const lunes = conv && conv.semana;
    bloques.forEach((l, b) => l.forEach(a => {
      if(enEquipo.has(a.trabajadorId) && (!a.hasta || !lunes || a.hasta >= lunes)) avisos.push({ tipo: 'descanso', trabajadorId: a.trabajadorId, texto: nombre(a.trabajadorId) + ' está en ' + BLOQUES[b].toLowerCase() + (a.hasta ? ' hasta el ' + ddmm(a.hasta) : '') + ' y también convocado en un equipo' });
    }));
    const todos = new Set(enEquipo); bloques.forEach(l => l.forEach(a => todos.add(a.trabajadorId)));
    todos.forEach(id => {
      const t = T.get(id);
      if(!t){ if(!visto.has('x' + id)){ visto.add('x' + id); avisos.push({ tipo: 'desconocido', trabajadorId: id, texto: id + ' no está en el maestro de trabajadores' }); } return; }
      if(!dniDe(t)) avisos.push({ tipo: 'dni', trabajadorId: id, texto: t.nombre + ' no tiene DNI' });
      if(estaDeBaja(t) && enEquipo.has(id)) avisos.push({ tipo: 'baja', trabajadorId: id, texto: t.nombre + ' está dado de baja' });
    });
    eqs.forEach(e => { const n = (m.get(e.id) || []).length; if(e.minimo > 0 && n < e.minimo) avisos.push({ tipo: 'minimo', equipoId: e.id, texto: e.nombre + ' (' + (e.columna === 'NOCHE' ? 'noche' : 'día') + '): ' + n + ' de ' + e.minimo + ' mínimos' }); });
    return avisos;
  }
  /** Totales: { DÍA, NOCHE, total, porEquipo: { id: n }, bloques: { BLOQUE: n } }. Una persona cuenta una vez por columna. */
  function totales(conv, equipos){
    const { equipos: eqs, porEquipo: m, bloques } = porEquipo(conv, equipos), E = new Map(eqs.map(e => [e.id, e]));
    const col = { 'DÍA': new Set(), 'NOCHE': new Set() }, pe = {};
    m.forEach((l, eid) => { pe[eid] = l.length; l.forEach(a => col[E.get(eid).columna].add(a.trabajadorId)); });
    const b = {}; bloques.forEach((l, k) => { b[k] = l.length; });
    return { 'DÍA': col['DÍA'].size, 'NOCHE': col['NOCHE'].size, total: col['DÍA'].size + col['NOCHE'].size, porEquipo: pe, bloques: b };
  }
  /** «Copiar semana anterior»: mismas personas en los mismos equipos para la semana nueva (BORRADOR). Los descansos que ya terminaron no pasan. */
  function copiarSemana(anterior, semanaNueva, equipos){
    const E = new Set(equiposDe(equipos).map(e => e.id));
    const asignaciones = (anterior && anterior.asignaciones || []).filter(a => a.bloque ? (!a.hasta || a.hasta >= semanaNueva) : E.has(a.equipoId))
      .map(a => Object.assign({}, a.bloque ? { trabajadorId: a.trabajadorId, bloque: a.bloque, hasta: a.hasta || '', columna: a.columna || 'DÍA' } : { trabajadorId: a.trabajadorId, equipoId: a.equipoId }, { orden: a.orden || 0 }));
    return { semana: semanaNueva, estado: 'BORRADOR', version: 0, asignaciones };
  }

  /* ---------- Tareo prellenado ---------- */
  /** Bloque (descanso médico / vacaciones / licencia) vigente de una persona en una fecha, o null. */
  function bloqueVigente(conv, trabajadorId, fecha){
    return (conv && conv.asignaciones || []).find(a => a.bloque && a.trabajadorId === trabajadorId && (!a.hasta || !fecha || fecha <= a.hasta)) || null;
  }
  /** Personal del Tareo diario desde la convocatoria PUBLICADA (o CERRADA): turno del Tareo «Día» = columna DÍA (incluye los equipos intermedios, con su
   *  hora 13:00) · «Noche» = columna NOCHE. Cada persona trae su equipo y su horario (hora programada de ingreso y salida). Quien está en un bloque vigente
   *  ese día no se convoca: sale con su estado (DESCANSO MÉDICO / VACACIONES / LICENCIA) para que el Tareo lo muestre sin marcar asistencia. */
  function prellenarTareo(conv, equipos, trabajadores, fecha, turnoTareo){
    if(!conv || !['PUBLICADA', 'CERRADA'].includes(conv.estado)) return [];
    const col = /noche/i.test(String(turnoTareo || '')) ? 'NOCHE' : 'DÍA';
    const T = new Map((trabajadores || []).map(t => [t.id, t]));
    const { equipos: eqs, porEquipo: m, bloques } = porEquipo(conv, equipos), out = [], vistos = new Set();
    eqs.filter(e => e.columna === col).forEach(e => (m.get(e.id) || []).forEach((a, i) => {
      if(vistos.has(a.trabajadorId)) return; vistos.add(a.trabajadorId);
      const t = T.get(a.trabajadorId) || { id: a.trabajadorId, nombre: a.nombre || a.trabajadorId };
      const b = bloqueVigente(conv, a.trabajadorId, fecha);
      out.push({ trabajadorId: t.id, id: t.id, nombre: t.nombre, dni: dniDe(t), cargo: t.cargo || '', linea: e.nombre, equipoId: e.id, equipo: e.nombre,
        horaProgramadaIngreso: e.inicio, horaProgramadaSalida: e.fin, horario: e.turnoBase === 'INTERMEDIO' ? 'Intermedio' : (e.columna === 'NOCHE' ? 'Noche' : 'Día'),
        turno: col === 'NOCHE' ? 'Noche' : 'Día', ordenEquipo: e.orden, orden: i + 1, origen: 'CONVOCATORIA', estadoBloque: b ? b.bloque : '' });
    }));
    // los que están en un bloque (descanso médico, vacaciones, licencia) de esta columna aparecen para constancia
    bloques.forEach((l, k) => l.forEach(a => {
      if(vistos.has(a.trabajadorId) || (a.columna || 'DÍA') !== col || !bloqueVigente(conv, a.trabajadorId, fecha)) return; vistos.add(a.trabajadorId);
      const t = T.get(a.trabajadorId) || { id: a.trabajadorId, nombre: a.trabajadorId };
      out.push({ trabajadorId: t.id, id: t.id, nombre: t.nombre, dni: dniDe(t), cargo: t.cargo || '', linea: BLOQUES[k], equipoId: '', equipo: BLOQUES[k], horaProgramadaIngreso: '', horaProgramadaSalida: '',
        horario: '', turno: col === 'NOCHE' ? 'Noche' : 'Día', ordenEquipo: 99, orden: 0, origen: 'CONVOCATORIA', estadoBloque: k });
    }));
    return out;
  }
  /** Minutos de tardanza según el horario del equipo (sale del lunes al domingo igual). Cruza la medianoche: ingreso 21:10 con equipo 21:00 → 10; 06:58 → 0. */
  function tardanzaPorHorarioEquipo(horaIngreso, equipo){
    const i = minutos(horaIngreso), p = minutos(equipo && (equipo.inicio || equipo));
    if(i === null || p === null) return 0;
    let d = i - p; if(d < -720) d += 1440; if(d > 720) d -= 1440;
    return Math.max(0, d);
  }

  /* ---------- Importador de transición (formato de la imagen actual) ---------- */
  const RX_HORARIO = /(\d{1,2})[:.](\d{2})\s*(?:hrs?|h)?\s*(?:[-–—]|a)\s*(\d{1,2})[:.](\d{2})/i;      // «07:00–19:00», «13:00-22:00», «21.00 a 07.00»
  const hhmm = (h, m) => String(Math.min(23, Number(h))).padStart(2, '0') + ':' + String(Number(m || 0)).padStart(2, '0');
  /** Una celda de nombre de la imagen: quita N°, «NUEVO», «*» y «⇄». → { nombre, nuevo, cambio } */
  function limpiarNombre(t){
    let s = texto(t), nuevo = false, cambio = false;
    if(/\bnuevo\b/i.test(s)){ nuevo = true; s = s.replace(/\bnuevo\b/ig, ' '); }
    if(/[*⇄]/.test(s)){ cambio = true; s = s.replace(/[*⇄]/g, ' '); }
    s = s.replace(/^\s*\d{1,3}\s*[.)\-:]?\s+/, '').replace(/\s+/g, ' ').trim();
    return { nombre: s, nuevo, cambio };
  }
  /** Lee el texto copiado del Excel / imagen actual. Cada línea: «N°  NOMBRE» de la columna día y, separada por TAB, la de noche.
   *  Cabeceras «EQUIPO PET 07:00–19:00 (8)», «DESCANSO MÉDICO». → { equipos:[{nombre,columna,inicio,fin}], filas:[{columna, equipo, nombre, nuevo, cambio, bloque}] } */
  function leerConvocatoriaTexto(txt){
    const equipos = [], filas = [], actual = { 'DÍA': null, 'NOCHE': null };
    const celda = (c, col) => {
      const s = texto(c); if(!s) return;
      const n = norm(s);
      if(/^(n|no|n°|nº)$/.test(n) || /turno (dia|noche)$/.test(n) || /operarios|^total|convocatoria/.test(n)) return;
      if(/^descanso medico|^vacaciones|^licencia/.test(n)){ actual[col] = { bloque: /vacaciones/.test(n) ? 'VACACIONES' : /licencia/.test(n) ? 'LICENCIA' : 'DESCANSO_MEDICO' }; return; }
      const m = s.match(RX_HORARIO);
      if(m && /[a-z]/i.test(s.slice(0, m.index))){
        const e = { nombre: s.slice(0, m.index).replace(/^\s*\d{1,3}\s+/, '').replace(/[·\-–]\s*$/, '').replace(/\s+/g, ' ').trim(), columna: col, inicio: hhmm(m[1], m[2]), fin: hhmm(m[3], m[4]) };
        equipos.push(e); actual[col] = { equipo: e }; return;
      }
      const L = limpiarNombre(s); if(!L.nombre || /^\d+$/.test(L.nombre) || L.nombre === '…' || L.nombre === '...') return;
      filas.push(Object.assign({ columna: col, equipo: actual[col] && actual[col].equipo ? actual[col].equipo.nombre : '', bloque: actual[col] && actual[col].bloque || '' }, L));
    };
    String(txt || '').split(/\r?\n/).forEach(linea => {
      const cols = linea.split('\t');
      if(cols.length >= 3){                                         // N° | día | N° | noche
        const izq = cols.slice(0, Math.ceil(cols.length / 2)).join(' '), der = cols.slice(Math.ceil(cols.length / 2)).join(' ');
        celda(izq, 'DÍA'); celda(der, 'NOCHE');
      } else celda(cols.join(' '), 'DÍA');
    });
    return { equipos, filas };
  }
  /** Similitud de dos nombres (palabras en común, sin tildes ni orden). 0..1 */
  function parecido(a, b){
    const A = norm(a).split(' ').filter(w => w.length > 1), B = new Set(norm(b).split(' ').filter(w => w.length > 1));
    if(!A.length || !B.size) return 0;
    const comunes = A.filter(w => B.has(w)).length;
    return comunes / Math.max(A.length, B.size);
  }
  /** Cruza los nombres leídos con el maestro. alias: { nombreNormalizado: trabajadorId } (lo que se unió a mano antes).
   *  → [{ ...fila, estado: 'exacto'|'alias'|'parecido'|'sin', trabajadorId, sugerencias:[{id,nombre,puntaje}] }] */
  function cruzarNombres(filas, trabajadores, alias){
    const ts = (trabajadores || []).filter(t => !estaDeBaja(t)), al = alias || {};
    const firma = s => norm(s).split(' ').filter(Boolean).sort().join(' ');
    const porFirma = new Map(); ts.forEach(t => porFirma.set(firma(t.nombre), t));
    return (filas || []).map(f => {
      const k = norm(f.nombre);
      if(al[k] && ts.some(t => t.id === al[k])) return Object.assign({}, f, { estado: 'alias', trabajadorId: al[k], sugerencias: [] });
      const ex = porFirma.get(firma(f.nombre)); if(ex) return Object.assign({}, f, { estado: 'exacto', trabajadorId: ex.id, sugerencias: [] });
      const sug = ts.map(t => ({ id: t.id, nombre: t.nombre, puntaje: Math.round(parecido(f.nombre, t.nombre) * 100) / 100 })).filter(x => x.puntaje >= 0.5).sort((a, b) => b.puntaje - a.puntaje).slice(0, 3);
      return Object.assign({}, f, { estado: sug.length && sug[0].puntaje >= 0.67 && (sug.length < 2 || sug[1].puntaje < sug[0].puntaje) ? 'parecido' : 'sin', trabajadorId: sug.length && sug[0].puntaje >= 0.67 ? sug[0].id : '', sugerencias: sug });
    });
  }
  const claveAlias = nombre => norm(nombre);

  /* ---------- modelo para la imagen de WhatsApp ---------- */
  /** Bloques de cada columna en el orden de la imagen: equipos con su gente (NUEVO y ⇄ calculados) y, al final del día, los bloques de descanso. */
  /* 28/11/2026 · descansos: mapa trabajadorId → día (0 = lunes … 6 = domingo) de los descansos PUBLICADOS → columna «DESC.» de la imagen. */
  const DIAS_CORTOS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
  function modeloImagen(conv, equipos, trabajadores, anterior, equiposAnterior, nSemanas, descansos){
    const T = new Map((trabajadores || []).map(t => [t.id, t])), nom = id => (T.get(id) && T.get(id).nombre) || id;
    const { equipos: eqs, porEquipo: m, bloques } = porEquipo(conv, equipos), tot = totales(conv, equipos);
    const col = c => {
      const out = eqs.filter(e => e.columna === c).map(e => ({ titulo: (e.nombre + ' ' + e.inicio + '–' + e.fin).toUpperCase() + ' (' + (m.get(e.id) || []).length + ')', equipoId: e.id,
        filas: (m.get(e.id) || []).map((a, i) => ({ n: i + 1, nombre: nom(a.trabajadorId).toUpperCase(), nuevo: esNuevo(T.get(a.trabajadorId), conv.semana, nSemanas), cambio: cambioDeTurno(a.trabajadorId, conv, anterior, equipos, equiposAnterior),
          desc: descansos && descansos.has(a.trabajadorId) && descansos.get(a.trabajadorId) !== null ? DIAS_CORTOS[descansos.get(a.trabajadorId)] : '' })) }));
      bloques.forEach((l, k) => { const de = l.filter(a => (a.columna || 'DÍA') === c); if(de.length) out.push({ titulo: BLOQUES[k].toUpperCase(), bloque: k, filas: de.map(a => ({ n: '', nombre: nom(a.trabajadorId).toUpperCase() + (a.hasta ? ' (HASTA ' + ddmm(a.hasta) + ')' : ''), nuevo: false, cambio: false, desc: descansos && descansos.size ? '—' : '' })) }); });
      return out;
    };
    const conDesc = !!(descansos && descansos.size);
    return { titulo: 'CONVOCATORIA DE LA SEMANA ' + ddmm(conv.semana) + ' AL ' + ddmm(sumarDias(conv.semana, 6)) + (conDesc ? ' · CON DESCANSOS' : ' · GLACIAL'), dia: col('DÍA'), noche: col('NOCHE'), totales: tot, conDescansos: conDesc };
  }

  const API = { COLUMNAS, BLOQUES, NUEVO_SEMANAS, EQUIPOS_FABRICA, norm, sumarDias, lunesDe, ddmm, limpiarEquipo, equiposDe, etiquetaEquipo, horasEquipo, porEquipo, columnaDe,
    cambioDeTurno, esNuevo, dniDe, estaDeBaja, validarConvocatoria, totales, copiarSemana, bloqueVigente, prellenarTareo, tardanzaPorHorarioEquipo,
    limpiarNombre, leerConvocatoriaTexto, parecido, cruzarNombres, claveAlias, modeloImagen };
  if(typeof module !== 'undefined' && module.exports) module.exports = API;
  raiz.glacialConvocatoria = API;
})(typeof window !== 'undefined' ? window : globalThis);
