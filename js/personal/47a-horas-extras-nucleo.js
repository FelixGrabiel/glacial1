/* =============================================================
   GLACIAL · TAREO — HORAS EXTRAS (REGISTRO): NÚCLEO PURO
   -------------------------------------------------------------
   Sin pantalla ni base de datos: reglas del registro de horas extras con justificación y autorización. Lo usan
   47-horas-extras-registro.js (pantalla y guardado) y las pruebas (tests/horas-extras-registro.test.js).

   Un registro (una persona, un día, un tramo horario):
     id, area ('produccion'|'mantenimiento'), trabajadorId, trabajadorNombre, dni, cargo, fecha 'YYYY-MM-DD', turno ('Día'|'Noche'),
     horaInicio, horaFin 'HH:MM', totalHoras (se calcula; contempla turnos que cruzan medianoche), motivo (lista fija por área),
     justificacion (mínimo HORAS_EXTRAS_MIN_JUSTIFICACION caracteres), equipoLinea (opcional, solo Mantenimiento),
     autorizadoPor / autorizadoPorNombre / autorizadoEn, registradoPor / registradoPorNombre / registradoUid / registradoEn,
     actualizadoEn, version, estado ('VIGENTE'|'ANULADO'), motivoAnulacion, anuladoPor, anuladoEn.
   El «Total HE» (resumen mensual, ficha, Excel) suma SOLO los registros VIGENTES.
   ============================================================= */
(function (raiz) {
  'use strict';

  const AREAS = ['produccion', 'mantenimiento'];
  const NOMBRE_AREA = { produccion: 'Producción', mantenimiento: 'Mantenimiento' };
  const TURNOS = ['Día', 'Noche'];
  const MIN_JUSTIFICACION_DEFECTO = 15;

  const texto = v => String(v == null ? '' : v).trim();
  const norm = t => texto(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  const fechaOk = f => /^\d{4}-\d{2}-\d{2}$/.test(texto(f)) && !Number.isNaN(new Date(texto(f) + 'T00:00:00').getTime());

  /* 'HH:MM' → minutos desde 00:00 (o null si no es una hora válida). */
  function hmAMin(s) {
    const m = texto(s).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2]);
    return h > 23 || mi > 59 ? null : h * 60 + mi;
  }
  /* Minutos entre inicio y fin; si el fin es menor, cruza la medianoche. 0 si faltan datos o son iguales. */
  function minutos(ini, fin) {
    const a = hmAMin(ini), b = hmAMin(fin);
    if (a === null || b === null || a === b) return 0;
    return (b - a + 1440) % 1440;
  }
  const totalHoras = (ini, fin) => Math.round(minutos(ini, fin) / 60 * 100) / 100;
  /* [inicio, fin) en minutos del día; el fin pasa de 1440 si cruza la medianoche. */
  function intervalo(reg) {
    const a = hmAMin(reg.horaInicio), b = hmAMin(reg.horaFin);
    if (a === null || b === null || a === b) return null;
    return [a, b > a ? b : b + 1440];
  }
  const solapa = (x, y) => !!x && !!y && x[0] < y[1] && y[0] < x[1];

  /* Clave estable de la persona (mismo criterio del tareo: DNI, luego ID, el nombre solo si no hay ninguno). */
  function claveTrabajador(r) {
    const dni = texto(r.dni).replace(/\D/g, '');
    if (dni) return 'DNI:' + dni;
    const id = texto(r.trabajadorId);
    if (id) return 'ID:' + id;
    return 'NOM:' + norm(r.trabajadorNombre || r.nombre);
  }

  /* Horas de un registro: las guardadas o, si faltan, las que salen de inicio y fin. */
  const horasDe = r => (Number(r && r.totalHoras) > 0 ? Number(r.totalHoras) : totalHoras(r && r.horaInicio, r && r.horaFin));
  const vigente = r => !!r && (r.estado || 'VIGENTE') !== 'ANULADO';

  /* Lo que falta para poder guardar (en el orden del formulario), con las mismas palabras de la pantalla. */
  function faltantes(r, opc) {
    const o = opc || {}, min = o.minJustificacion || MIN_JUSTIFICACION_DEFECTO, f = [];
    if (!texto(r.trabajadorId) && !texto(r.trabajadorNombre)) f.push('el trabajador');
    if (hmAMin(r.horaInicio) === null) f.push('la hora de inicio');
    if (hmAMin(r.horaFin) === null) f.push('la hora de fin');
    if (!texto(r.motivo)) f.push('el motivo');
    const j = texto(r.justificacion).length;
    if (j < min) f.push(j ? 'la justificación (' + j + '/' + min + ' caracteres)' : 'la justificación (mínimo ' + min + ' caracteres)');
    if (!texto(r.autorizadoPor)) f.push('quién autorizó');
    return f;
  }

  /* Errores de un registro (misma validación que repite la regla del servidor). */
  function validar(r, opc) {
    const o = opc || {}, e = [], min = o.minJustificacion || MIN_JUSTIFICACION_DEFECTO;
    if (!AREAS.includes(r.area)) e.push('El área no es válida.');
    if (!texto(r.trabajadorId) && !texto(r.trabajadorNombre)) e.push('Falta el trabajador.');
    if (!fechaOk(r.fecha)) e.push('La fecha no es válida.');
    if (!TURNOS.includes(r.turno)) e.push('Elige el turno.');
    const a = hmAMin(r.horaInicio), b = hmAMin(r.horaFin);
    if (a === null) e.push('Falta la hora de inicio.');
    if (b === null) e.push('Falta la hora de fin.');
    if (a !== null && b !== null && a === b) e.push('La hora de fin debe ser distinta de la de inicio.');
    if (a !== null && b !== null && a !== b && !(totalHoras(r.horaInicio, r.horaFin) > 0)) e.push('El total de horas debe ser mayor que cero.');
    const motivos = (o.motivos && o.motivos[r.area]) || null;
    if (!texto(r.motivo)) e.push('Falta el motivo.');
    else if (motivos && !motivos.includes(r.motivo)) e.push('El motivo no está en la lista.');
    if (texto(r.justificacion).length < min) e.push('La justificación debe tener al menos ' + min + ' caracteres.');
    if (!texto(r.autorizadoPor)) e.push('Falta quién autorizó.');
    return e;
  }

  /* Registros vigentes de la MISMA persona y fecha que se solapan con r (excluye al propio r). */
  function choques(r, existentes) {
    const iv = intervalo(r), k = claveTrabajador(r);
    if (!iv) return [];
    return (existentes || []).filter(x => x && x.id !== r.id && vigente(x) && x.fecha === r.fecha && claveTrabajador(x) === k && solapa(iv, intervalo(x)));
  }

  /* Tarjetas del día: horas, trabajadores distintos y registros sin autorizar (antiguos o importados sin autorizador). */
  function resumen(lista) {
    const v = (lista || []).filter(vigente), personas = new Set();
    let horas = 0, sinAutorizar = 0;
    v.forEach(r => { horas += horasDe(r); personas.add(claveTrabajador(r)); if (!texto(r.autorizadoPor)) sinAutorizar++; });
    return { horas: Math.round(horas * 100) / 100, trabajadores: personas.size, sinAutorizar, registros: v.length };
  }

  /* Suma por persona (clave) de los registros vigentes que cumplen el filtro. */
  function totalesPorPersona(lista) {
    const m = new Map();
    (lista || []).filter(vigente).forEach(r => {
      const k = claveTrabajador(r), f = m.get(k) || { clave: k, trabajadorId: r.trabajadorId || '', nombre: r.trabajadorNombre || '', dni: r.dni || '', area: r.area, horas: 0, registros: 0 };
      f.horas = Math.round((f.horas + horasDe(r)) * 100) / 100; f.registros++;
      m.set(k, f);
    });
    return m;
  }

  /* Filtro de la vista general de RRHH. f: {area, trabajador (texto), motivo, desde, hasta, estado:'vigentes'|'anulados'|'todos'} */
  function filtrar(lista, f) {
    const o = f || {}, q = norm(o.trabajador);
    return (lista || []).filter(r => {
      if (o.area && r.area !== o.area) return false;
      if (o.motivo && r.motivo !== o.motivo) return false;
      if (o.desde && r.fecha < o.desde) return false;
      if (o.hasta && r.fecha > o.hasta) return false;
      if (q && !norm(r.trabajadorNombre).includes(q) && !texto(r.dni).includes(q)) return false;
      const est = o.estado || 'vigentes';
      if (est === 'vigentes' && !vigente(r)) return false;
      if (est === 'anulados' && vigente(r)) return false;
      return true;
    }).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(a.horaInicio).localeCompare(String(b.horaInicio)) || String(a.trabajadorNombre).localeCompare(String(b.trabajadorNombre), 'es'));
  }

  /* «3,5 h» / «3 h» — decimal con coma, sin ceros de más. */
  function textoHoras(h) {
    const n = Math.round((Number(h) || 0) * 100) / 100;
    return String(n).replace('.', ',') + ' h';
  }

  /* Cambios entre dos versiones de un registro (para la bitácora: antes / después, solo los campos que cambiaron). */
  const CAMPOS_AUDITADOS = ['trabajadorNombre', 'fecha', 'turno', 'horaInicio', 'horaFin', 'totalHoras', 'motivo', 'justificacion', 'equipoLinea', 'autorizadoPorNombre', 'estado', 'motivoAnulacion'];
  function diferencias(antes, despues) {
    const a = {}, d = {};
    CAMPOS_AUDITADOS.forEach(c => {
      const x = antes ? antes[c] : undefined, y = despues ? despues[c] : undefined;
      if (String(x == null ? '' : x) !== String(y == null ? '' : y)) { a[c] = x == null ? null : x; d[c] = y == null ? null : y; }
    });
    return { antes: a, despues: d };
  }

  const API = { AREAS, NOMBRE_AREA, TURNOS, MIN_JUSTIFICACION_DEFECTO, norm, fechaOk, hmAMin, minutos, totalHoras, intervalo, solapa, claveTrabajador, vigente, horasDe,
    faltantes, validar, choques, resumen, totalesPorPersona, filtrar, textoHoras, diferencias };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.glacialHorasExtrasNucleo = API;
  else if (raiz) raiz.glacialHorasExtrasNucleo = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
