/* =============================================================
   GLACIAL · TAREO — HORAS EXTRAS CON JUSTIFICACIÓN Y AUTORIZACIÓN (pestaña «Horas extras»)
   -------------------------------------------------------------
   Registro de horas extras por trabajador, integrado al Tareo de Producción y de Mantenimiento. Toda hora extra lleva motivo (lista fija por área),
   justificación (mínimo 15 caracteres) y quién la autorizó. No hay flujo de aprobación pendiente: quien registra elige al jefe que autorizó y se guarda
   la hora del registro como hora de autorización.

   DIFERENCIA CON 46-tareo-horas-extras.js: aquel archivo CALCULA el saldo de horas de cada jornada (laborada − programada) y solo consulta. Este REGISTRA las
   horas extras justificadas y autorizadas; el «Total HE» del Resumen mensual, de la ficha y del Excel suma solo estos registros (vigentes).

   DATOS (colección horasExtras del puente de Supabase, un documento por registro; id = área_fecha_código, p. ej. produccion_2026-10-19_k3j9x2):
     los campos están en 47a-horas-extras-nucleo.js. El servidor valida lo mismo (glacial_26_horas_extras.sql): campos obligatorios, justificación de
     15 o más caracteres, hora fin distinta de hora inicio, área según el permiso, el registrador es quien escribe. Los registros no se borran: se ANULAN con motivo.
   TIEMPO REAL: onSnapshot por área sobre el mes anterior y el actual (más lo que RRHH consulte por rango).
   PERMISOS: nuevo permiso 'horasExtras' (Gestión de usuarios). Escribe quien tiene 'horasExtras' Y gestiona el tareo de esa área (tareoProduccion / moduloMantenimiento /
     moduloRRHH) o es Administrador; la Jefatura y el Tareo General solo ven. Los técnicos de la cuenta compartida (PIN) ven solo lo suyo — ese filtro es de la
     aplicación: la cuenta de Supabase es una sola, igual que en 37f-tareo-por-tecnico.js.
   AUDITORÍA: cada alta, edición y anulación va a auditoriaTareos (40-tareo-auditoria.js) con quién, cuándo y antes/después.
   Cargar DESPUÉS de 13-tareo.js, 46-tareo-horas-extras.js y 47a-horas-extras-nucleo.js.
   ============================================================= */
(function instalarHorasExtrasRegistro() {
  'use strict';

  const N = window.glacialHorasExtrasNucleo;
  if (!N) return;
  const COL = 'horasExtras';
  const NOMBRE_AREA = N.NOMBRE_AREA;
  const AREA_DE_NOMBRE = { 'Producción': 'produccion', 'Mantenimiento': 'mantenimiento' };
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const esc = v => (typeof escaparHTML === 'function' ? escaparHTML(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const pad = n => String(n).padStart(2, '0');
  const fechaCorta = f => (N.fechaOk(f) ? f.split('-').reverse().join('/') : '—');
  const horaMin = ms => { const d = new Date(ms); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const minJust = () => (typeof HORAS_EXTRAS_MIN_JUSTIFICACION === 'number' ? HORAS_EXTRAS_MIN_JUSTIFICACION : N.MIN_JUSTIFICACION_DEFECTO);
  const motivosDe = area => (typeof HORAS_EXTRAS_MOTIVOS !== 'undefined' && HORAS_EXTRAS_MOTIVOS[area]) || [];
  const opcVal = () => ({ motivos: typeof HORAS_EXTRAS_MOTIVOS !== 'undefined' ? HORAS_EXTRAS_MOTIVOS : null, minJustificacion: minJust() });

  /* ---------- estado ---------- */
  const E = { area: '', fecha: '', vista: 'registro', form: null, error: '', aviso: '', guardando: false, filtros: { area: '', trabajador: '', motivo: '', desde: '', hasta: '', estado: 'vigentes' }, modal: '', cargando: false };
  const porArea = {};            // área → Map(id → registro) del mes anterior y el actual (en vivo)
  const extra = new Map();       // lo consultado por rango (RRHH), sin escucha
  const escuchas = {};           // área → función para cerrar
  let escuchaDe = '';            // áreas con escucha ('produccion,mantenimiento')
  let listo = false;

  const usuario = () => (typeof state !== 'undefined' && state.user) || {};
  const uidActual = () => { try { return (typeof auth !== 'undefined' && auth && auth.currentUser && auth.currentUser.uid) || ''; } catch (_) { return ''; } };
  const hoyOperativo = () => (typeof obtenerFechaHoy === 'function' ? obtenerFechaHoy() : (() => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); })());
  const turnoAhora = () => { const h = new Date().getHours(); return h >= 7 && h < 19 ? 'Día' : 'Noche'; };

  /* ---------- permisos (el servidor aplica los mismos en glacial_26) ---------- */
  function acceso() {
    const u = usuario();
    const vacio = { escribir: [], ver: [], general: false, tecnico: null };
    if (!u || !u.rol || typeof tareoAccesoUsuario !== 'function') return vacio;
    const permisos = normalizarPermisosUsuario(u), todos = permisos === 'todos';
    const tiene = k => todos || (Array.isArray(permisos) && permisos.includes(k));
    const ta = tareoAccesoUsuario();
    const compartida = typeof window.esMantCompartido === 'function' && window.esMantCompartido();
    const escribir = [];
    if (!compartida && !(typeof esUsuarioSoloConsulta === 'function' && esUsuarioSoloConsulta(u)) && (todos || tiene('horasExtras'))) {
      (ta.editar || []).forEach(n => { if (AREA_DE_NOMBRE[n] && !escribir.includes(AREA_DE_NOMBRE[n])) escribir.push(AREA_DE_NOMBRE[n]); });
    }
    const ver = new Set(escribir);
    (ta.ver || []).forEach(n => { if (AREA_DE_NOMBRE[n]) ver.add(AREA_DE_NOMBRE[n]); });
    const tecnico = compartida && typeof window.mantTecnicoActivo === 'function' ? window.mantTecnicoActivo() : null;
    return { escribir, ver: [...ver], general: !!ta.general && !compartida, tecnico, compartida };
  }
  const puedeVer = () => acceso().ver.length > 0;
  const puedeEscribir = area => acceso().escribir.includes(area);

  /* ---------- datos en vivo ---------- */
  const desdeEscucha = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-01'; };
  function todos() {
    const m = new Map();
    extra.forEach((r, id) => m.set(id, r));
    Object.keys(porArea).forEach(a => porArea[a].forEach((r, id) => m.set(id, r)));
    let lista = [...m.values()];
    const ac = acceso();
    if (ac.compartida) {            // técnico con PIN: solo lo suyo (filtro de la aplicación)
      lista = ac.tecnico ? lista.filter(r => String(r.trabajadorId) === String(ac.tecnico.workerId)) : [];
    }
    return lista.filter(r => ac.ver.includes(r.area));
  }
  function asegurarEscucha() {
    if (typeof db === 'undefined' || !usuario().rol) return;
    const ac = acceso(), clave = ac.ver.slice().sort().join(',');
    if (clave === escuchaDe) return;
    Object.keys(escuchas).forEach(a => { try { escuchas[a](); } catch (_) { /* ya cerrada */ } delete escuchas[a]; });
    Object.keys(porArea).forEach(a => delete porArea[a]);
    escuchaDe = clave;
    ac.ver.forEach(area => {
      escuchas[area] = db.collection(COL).where('area', '==', area).where('fecha', '>=', desdeEscucha()).onSnapshot(snap => {
        const m = new Map();
        snap.docs.forEach(d => { const r = Object.assign({}, d.data(), { id: d.id }); m.set(r.id, r); });
        porArea[area] = m;
        listo = true;
        repintar();
      }, err => { E.error = 'No se pudieron leer las horas extras: ' + ((err && err.message) || err); console.warn('Horas extras:', err && err.message || err); repintar(); });
    });
  }
  function cerrarEscuchas() {
    Object.keys(escuchas).forEach(a => { try { escuchas[a](); } catch (_) { /* ya cerrada */ } delete escuchas[a]; });
    Object.keys(porArea).forEach(a => delete porArea[a]);
    extra.clear(); escuchaDe = ''; listo = false;
  }
  if (window.glacialCierresSesion) window.glacialCierresSesion.push(cerrarEscuchas);
  /* La escucha arranca sola cuando hay sesión (así las marcas «HE» del tareo ya tienen datos al dibujarse). */
  const arranque = setInterval(() => { if (usuario().rol) { asegurarEscucha(); if (escuchaDe) clearInterval(arranque); } }, 2500);

  /* RRHH: consulta un rango (más allá del mes anterior) y lo suma a la memoria. */
  async function consultarRango(desde, hasta, area) {
    const ac = acceso(), areas = (area ? [area] : ac.ver).filter(a => ac.ver.includes(a));
    E.cargando = true; repintar();
    try {
      for (const a of areas) {
        let q = db.collection(COL).where('area', '==', a).where('fecha', '>=', desde);
        if (hasta) q = q.where('fecha', '<=', hasta);
        const snap = await q.get();
        snap.docs.forEach(d => extra.set(d.id, Object.assign({}, d.data(), { id: d.id })));
      }
    } catch (e) { E.error = 'No se pudo consultar: ' + ((e && e.message) || e); }
    E.cargando = false; repintar();
  }

  /* ---------- trabajadores y autorizadores ---------- */
  function candidatos(area, fecha) {
    const nombreArea = NOMBRE_AREA[area], vistos = new Map();
    const tareos = (typeof obtenerTareos === 'function' ? obtenerTareos() : []).filter(t => t && typeof tareoAreaDe === 'function' && tareoAreaDe(t) === nombreArea);
    let usar = tareos.filter(t => t.fecha === fecha);
    if (!usar.length) {         // sin tareo ese día: el personal de los últimos 7 días
      const f = new Date(fecha + 'T00:00:00').getTime();
      usar = tareos.filter(t => { const x = new Date(t.fecha + 'T00:00:00').getTime(); return x <= f && f - x <= 7 * 86400000; });
    }
    usar.forEach(t => (t.personal || []).concat(t.personalPorDia || []).forEach(p => {
      if (!p || p.eliminada || !String(p.nombre || '').trim()) return;
      const dato = { trabajadorId: String(p.trabajadorId || p.id || ''), trabajadorNombre: p.nombre, dni: p.dni || '', cargo: p.cargo || '' };
      const k = N.claveTrabajador(dato);
      if (!vistos.has(k)) vistos.set(k, dato);
    }));
    return [...vistos.values()].sort((a, b) => String(a.trabajadorNombre).localeCompare(String(b.trabajadorNombre), 'es', { sensitivity: 'base' }));
  }
  function autorizadores(area) {
    const roles = (typeof HORAS_EXTRAS_AUTORIZADORES !== 'undefined' && HORAS_EXTRAS_AUTORIZADORES[area]) || [];
    const lista = typeof loadUsers === 'function' ? loadUsers() : [];
    return lista.filter(u => u && u.username && roles.includes(String(u.rol || '').trim()) && u.activo !== false && !u.deshabilitado)
      .map(u => ({ username: u.username, nombre: u.nombre || u.username, rol: u.rol }))
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es', { sensitivity: 'base' }));
  }

  /* ---------- guardado ---------- */
  const idNuevo = (area, fecha) => area + '_' + fecha + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  function auditar(accion, reg, antes, despues, motivo) {
    try {
      if (typeof window.tareoAuditoriaEvento !== 'function' || typeof window.tareoAuditoriaRegistrar !== 'function') return;
      const ev = window.tareoAuditoriaEvento({ id: 'HE:' + reg.id, area: NOMBRE_AREA[reg.area], fecha: reg.fecha, turno: reg.turno }, accion, 'horasExtras',
        { trabajador: reg.trabajadorNombre, dni: reg.dni || '', estadoAnterior: antes || null, estadoNuevo: despues || null, motivoCorreccion: motivo || '' });
      window.tareoAuditoriaRegistrar(ev);
    } catch (e) { console.warn('Horas extras: no se pudo auditar', e && e.message || e); }
  }
  async function choquesFrescos(reg) {
    // lo que hay en memoria + lo que dice el servidor ahora (otro supervisor pudo registrar hace un momento)
    const locales = todos().filter(r => r.area === reg.area);
    let remotos = [];
    try {
      const snap = await db.collection(COL).where('area', '==', reg.area).where('fecha', '==', reg.fecha).get();
      remotos = snap.docs.map(d => Object.assign({}, d.data(), { id: d.id }));
    } catch (_) { /* sin consulta: queda la comprobación local */ }
    const m = new Map(); locales.concat(remotos).forEach(r => m.set(r.id, r));
    return N.choques(reg, [...m.values()]);
  }
  function armar(F, previo) {
    const u = usuario(), ahora = Date.now();
    const aut = autorizadores(F.area).find(x => x.username === F.autorizadoPor) || (previo && previo.autorizadoPor === F.autorizadoPor ? { username: previo.autorizadoPor, nombre: previo.autorizadoPorNombre } : null);
    const reg = Object.assign({}, previo || {}, {
      id: previo ? previo.id : idNuevo(F.area, F.fecha), area: F.area, trabajadorId: F.trabajadorId, trabajadorNombre: F.trabajadorNombre, dni: F.dni || '', cargo: F.cargo || '',
      fecha: F.fecha, turno: F.turno, horaInicio: F.horaInicio, horaFin: F.horaFin, totalHoras: N.totalHoras(F.horaInicio, F.horaFin),
      motivo: F.motivo, justificacion: String(F.justificacion || '').trim(), equipoLinea: F.area === 'mantenimiento' ? String(F.equipoLinea || '').trim() : '',
      autorizadoPor: F.autorizadoPor, autorizadoPorNombre: aut ? aut.nombre : F.autorizadoPor, estado: 'VIGENTE', actualizadoEn: ahora
    });
    if (!previo || previo.autorizadoPor !== F.autorizadoPor) reg.autorizadoEn = ahora;      // la autorización lleva la hora del registro
    if (!previo) Object.assign(reg, { registradoPor: u.username || '', registradoPorNombre: u.nombre || u.username || '', registradoUid: uidActual(), registradoEn: ahora, version: 1 });
    else reg.version = (Number(previo.version) || 1) + 1;
    return reg;
  }
  async function guardar() {
    const F = E.form; if (!F || E.guardando) return;
    const previo = F.id ? todos().find(r => r.id === F.id) : null;
    if (F.id && !previo) { E.error = 'El registro ya no existe.'; return repintar(); }
    if (!puedeEscribir(F.area)) { E.error = 'No tienes permiso para registrar horas extras en esta área.'; return repintar(); }
    const reg = armar(F, previo);
    const errores = N.validar(reg, opcVal());
    if (errores.length) { E.error = errores.join(' '); return repintarForm(); }
    E.guardando = true; E.error = ''; repintarForm();
    try {
      const choque = await choquesFrescos(reg);
      if (choque.length) {
        const c = choque[0];
        throw new Error('Choca con otro registro de ' + reg.trabajadorNombre + ' el ' + fechaCorta(reg.fecha) + ': ' + c.horaInicio + '–' + c.horaFin + ' (' + c.motivo + ', registró ' + (c.registradoPorNombre || c.registradoPor || '—') + ').');
      }
      const ref = db.collection(COL).doc(reg.id);
      if (previo) {
        await db.runTransaction(async tx => {
          const snap = await tx.get(ref);
          const actual = snap.exists ? snap.data() : null;
          if (!actual) throw new Error('El registro ya no existe.');
          if (Number(actual.version) !== Number(previo.version)) { const e = new Error('Otra persona cambió este registro mientras lo editabas. Se cargó lo vigente: revisa y guarda de nuevo.'); e.conflicto = true; throw e; }
          if ((actual.estado || 'VIGENTE') === 'ANULADO') throw new Error('Este registro fue anulado: ya no se puede editar.');
          tx.set(ref, reg);
        });
        const d = N.diferencias(previo, reg);
        auditar('EDITAR_HORAS_EXTRAS', reg, d.antes, d.despues);
        E.aviso = 'Cambios guardados.';
      } else {
        await ref.set(reg);
        auditar('CREAR_HORAS_EXTRAS', reg, null, { horario: reg.horaInicio + '–' + reg.horaFin, totalHoras: reg.totalHoras, motivo: reg.motivo, justificacion: reg.justificacion, autorizadoPor: reg.autorizadoPorNombre });
        E.aviso = 'Hora extra registrada: ' + reg.trabajadorNombre + ' · ' + N.textoHoras(reg.totalHoras) + '.';
      }
      (porArea[reg.area] = porArea[reg.area] || new Map()).set(reg.id, reg);          // se ve al instante; el servidor confirma por la escucha
      E.form = formVacio(reg.area, reg.fecha); E.error = '';
    } catch (e) {
      E.error = (e && e.message) || String(e);
      if (e && e.conflicto && previo) E.form = formDe(todos().find(r => r.id === previo.id) || previo);
    } finally { E.guardando = false; }
    repintar();
  }
  async function anular(id, motivo) {
    const previo = todos().find(r => r.id === id);
    if (!previo) return;
    if (!puedeEscribir(previo.area)) throw new Error('No tienes permiso para anular horas extras de esta área.');
    const mot = String(motivo || '').trim();
    if (mot.length < 5) throw new Error('Escribe el motivo de la anulación (mínimo 5 caracteres).');
    const u = usuario(), ref = db.collection(COL).doc(id), ahora = Date.now();
    let nuevo = null;
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref), actual = snap.exists ? snap.data() : null;
      if (!actual) throw new Error('El registro ya no existe.');
      if ((actual.estado || 'VIGENTE') === 'ANULADO') throw new Error('Ya estaba anulado.');
      if (Number(actual.version) !== Number(previo.version)) throw new Error('Otra persona cambió este registro. Revisa y vuelve a intentarlo.');
      nuevo = Object.assign({}, actual, { id, estado: 'ANULADO', motivoAnulacion: mot, anuladoPor: u.username || '', anuladoPorNombre: u.nombre || u.username || '', anuladoEn: ahora, actualizadoEn: ahora, version: (Number(actual.version) || 1) + 1 });
      tx.set(ref, nuevo);
    });
    const d = N.diferencias(previo, nuevo);
    auditar('ANULAR_HORAS_EXTRAS', nuevo, d.antes, d.despues, mot);
    (porArea[nuevo.area] = porArea[nuevo.area] || new Map()).set(id, nuevo);
    E.aviso = 'Registro anulado.'; repintar();
  }

  /* ---------- formulario ---------- */
  function formVacio(area, fecha) {
    return { id: '', area, fecha, turno: turnoAhora(), trabajadorId: '', trabajadorNombre: '', dni: '', cargo: '', horaInicio: '', horaFin: '', motivo: '', justificacion: '', equipoLinea: '', autorizadoPor: '' };
  }
  const formDe = r => ({ id: r.id, area: r.area, fecha: r.fecha, turno: r.turno, trabajadorId: r.trabajadorId || '', trabajadorNombre: r.trabajadorNombre || '', dni: r.dni || '', cargo: r.cargo || '',
    horaInicio: r.horaInicio, horaFin: r.horaFin, motivo: r.motivo, justificacion: r.justificacion, equipoLinea: r.equipoLinea || '', autorizadoPor: r.autorizadoPor || '' });
  const mensajeFalta = F => { const f = N.faltantes(F, opcVal()); return f.length ? 'Falta: ' + f.join(', ') + '.' : ''; };

  function htmlFormulario() {
    const F = E.form, area = E.area, mant = area === 'mantenimiento';
    const cands = candidatos(area, F.fecha), auts = autorizadores(area);
    const claveSel = F.trabajadorNombre ? N.claveTrabajador(F) : '';
    const falta = mensajeFalta(F), total = N.totalHoras(F.horaInicio, F.horaFin);
    const autVal = auts.some(a => a.username === F.autorizadoPor) || !F.autorizadoPor;
    const req = '<b class="he-req">*</b>';
    return `<div class="he-card"><h3>${F.id ? 'Editar hora extra' : 'Registrar hora extra'}</h3>
      <label>${mant ? 'Técnico' : 'Trabajador'} ${req}</label>
      <select id="he-trab" onchange="glacialHorasExtras.elegirTrabajador(this.value)" ${F.id ? 'disabled' : ''}>
        <option value="">Selecciona…</option>
        ${cands.map(c => { const k = N.claveTrabajador(c); return `<option value="${esc(k)}" ${k === claveSel ? 'selected' : ''}>${esc(c.trabajadorNombre)}${c.cargo ? ' · ' + esc(c.cargo) : ''}</option>`; }).join('')}
        ${F.id && F.trabajadorNombre && !cands.some(c => N.claveTrabajador(c) === claveSel) ? `<option value="${esc(claveSel)}" selected>${esc(F.trabajadorNombre)}</option>` : ''}
      </select>
      ${cands.length ? '' : '<small class="he-nota">No hay personal en el tareo de esa fecha. Abre el tareo del día para que aparezca.</small>'}
      <div class="he-fila"><div><label>Inicio ${req}</label><input type="time" id="he-ini" value="${esc(F.horaInicio)}" oninput="glacialHorasExtras.campo('horaInicio',this.value)"></div>
        <div><label>Fin ${req}</label><input type="time" id="he-fin" value="${esc(F.horaFin)}" oninput="glacialHorasExtras.campo('horaFin',this.value)"></div>
        <div><label>Total</label><input type="text" id="he-total" readonly value="${total ? N.textoHoras(total) : '—'}"></div></div>
      <div class="he-fila"><div><label>Turno ${req}</label><select id="he-turno" onchange="glacialHorasExtras.campo('turno',this.value)">${N.TURNOS.map(t => `<option ${t === F.turno ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
      <label>Motivo ${req}</label>
      <select id="he-motivo" onchange="glacialHorasExtras.campo('motivo',this.value)"><option value="">Selecciona…</option>${motivosDe(area).map(m => `<option ${m === F.motivo ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
      <label>Justificación (detalle) ${req} <small class="he-nota" id="he-cuenta">${String(F.justificacion || '').trim().length}/${minJust()} mínimo</small></label>
      <textarea id="he-just" rows="3" maxlength="500" oninput="glacialHorasExtras.campo('justificacion',this.value)">${esc(F.justificacion)}</textarea>
      ${mant ? `<label>Equipo / línea <small class="he-nota">(opcional)</small></label><input type="text" id="he-equipo" maxlength="80" value="${esc(F.equipoLinea)}" oninput="glacialHorasExtras.campo('equipoLinea',this.value)">` : ''}
      <label>Autorizado por ${req}</label>
      <select id="he-aut" onchange="glacialHorasExtras.campo('autorizadoPor',this.value)"><option value="">Selecciona…</option>
        ${auts.map(a => `<option value="${esc(a.username)}" ${a.username === F.autorizadoPor ? 'selected' : ''}>${esc(a.nombre)} · ${esc(a.rol)}</option>`).join('')}
        ${!autVal ? `<option value="${esc(F.autorizadoPor)}" selected>${esc(F.autorizadoPor)}</option>` : ''}
      </select>
      ${auts.length ? '' : '<small class="he-nota">No hay usuarios con rol de jefatura o supervisión para esta área (Gestión de usuarios).</small>'}
      <div class="he-acciones">${F.id ? '<button type="button" class="btn btn-ghost" onclick="glacialHorasExtras.cancelarEdicion()">Cancelar</button>' : ''}
        <button type="button" class="btn btn-primary" id="he-guardar" onclick="glacialHorasExtras.guardar()" ${falta || E.guardando ? 'disabled' : ''}>${E.guardando ? 'Guardando…' : 'Guardar'}</button></div>
      <div class="he-falta" id="he-falta">${esc(falta)}</div>
      <div class="he-error" id="he-error">${esc(E.error)}</div></div>`;
  }

  /* ---------- tabla y tarjetas ---------- */
  function delDia() { return todos().filter(r => r.area === E.area && r.fecha === E.fecha).sort((a, b) => String(a.horaInicio).localeCompare(String(b.horaInicio)) || String(a.trabajadorNombre).localeCompare(String(b.trabajadorNombre), 'es')); }
  function htmlTarjetas(lista) {
    const r = N.resumen(lista);
    return `<div class="he-kpis"><div style="--c:#005b96"><span>Horas extras hoy</span><b>${N.textoHoras(r.horas)}</b><small>${r.registros} registro(s)</small></div>
      <div style="--c:#3f8f5f"><span>Trabajadores con HE</span><b>${r.trabajadores}</b></div>
      <div style="--c:${r.sinAutorizar ? '#df8b00' : '#9aa9b8'}"><span>Registros sin autorizar</span><b>${r.sinAutorizar}</b><small>sin autorizador</small></div></div>`;
  }
  function filaTabla(r, opc) {
    const o = opc || {}, anulado = !N.vigente(r), sinAut = !String(r.autorizadoPor || '').trim();
    return `<tr class="${anulado ? 'he-anulado' : sinAut ? 'he-sinaut' : ''}">
      ${o.fecha ? `<td>${fechaCorta(r.fecha)}</td>` : ''}${o.area ? `<td>${esc(NOMBRE_AREA[r.area] || r.area)}</td>` : ''}
      <td><b>${esc(r.trabajadorNombre)}</b>${r.cargo ? `<small>${esc(r.cargo)}</small>` : ''}</td>
      <td>${esc(r.horaInicio)}–${esc(r.horaFin)}<small>${esc(r.turno || '')}</small></td>
      <td>${esc(N.textoHoras(N.horasDe(r)))}</td>
      <td class="he-dest">${esc(r.motivo || '—')}<small>${esc(r.justificacion || 'Sin justificación')}${r.equipoLinea ? ' · ' + esc(r.equipoLinea) : ''}</small></td>
      <td class="he-dest">${sinAut ? '<span class="he-tag-na">Sin autorizar</span>' : esc(r.autorizadoPorNombre || r.autorizadoPor)}${!sinAut && r.autorizadoEn ? `<small>${horaMin(r.autorizadoEn)}</small>` : ''}</td>
      <td>${esc(r.registradoPorNombre || r.registradoPor || '—')}${r.registradoEn ? `<small>${horaMin(r.registradoEn)}</small>` : ''}</td>
      <td class="he-acc">${anulado ? `<span class="he-tag-an">ANULADO</span><small>${esc(r.motivoAnulacion || '')}</small>` : (o.acciones && puedeEscribir(r.area) ? `<button type="button" class="btn btn-ghost btn-sm" onclick="glacialHorasExtras.editar('${esc(r.id)}')">Editar</button> <button type="button" class="btn btn-ghost btn-sm" onclick="glacialHorasExtras.pedirAnular('${esc(r.id)}')">Anular</button>` : '')}</td></tr>`;
  }
  const THEAD = (o) => `<thead><tr>${o.fecha ? '<th>Fecha</th>' : ''}${o.area ? '<th>Área</th>' : ''}<th>Trabajador</th><th>Horario</th><th>Horas</th><th class="he-dest">Justificación</th><th class="he-dest">Autorizó</th><th>Registró</th><th></th></tr></thead>`;
  function htmlTablaDia(lista) {
    const o = { acciones: true };
    return `<div class="he-card"><h3>${esc(NOMBRE_AREA[E.area])} · ${fechaCorta(E.fecha)}</h3><div class="he-scroll"><table class="he-tabla">${THEAD(o)}<tbody>
      ${lista.length ? lista.map(r => filaTabla(r, o)).join('') : '<tr><td colspan="8">Sin horas extras registradas ese día.</td></tr>'}</tbody></table></div></div>`;
  }

  /* ---------- pantalla ---------- */
  const CSS = `
    .he{display:block}.he h3{margin:0 0 10px;color:#003b5c;font-size:15px}.he-grid{display:grid;grid-template-columns:minmax(290px,340px) 1fr;gap:14px;align-items:start}
    .he-card{background:#fff;border:1px solid #dce5ec;border-radius:12px;padding:14px;margin-bottom:12px}
    .he-card label{display:block;font-weight:600;font-size:12px;margin:9px 0 3px;color:#41525e}.he-card select,.he-card input,.he-card textarea{width:100%;box-sizing:border-box;border:1px solid #cfdbe3;border-radius:8px;padding:7px 9px;font:inherit;background:#fff}
    .he-card input[readonly]{background:#f2f6f9}.he-req{color:#c4472b}.he-nota{color:#5a6b78;font-weight:400}
    .he-fila{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.he-acciones{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
    .he-falta{color:#8a5a1e;font-size:12px;margin-top:6px;min-height:14px}.he-error{color:#a32020;font-size:13px;margin-top:6px}.he-aviso{background:#e6f6ec;border:1px solid #b6e0c4;color:#1d6b3a;border-radius:8px;padding:8px 12px;margin-bottom:10px}
    .he-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}.he-kpis div{background:#fff;border:1px solid #dce5ec;border-left:5px solid var(--c,#9aa9b8);border-radius:12px;padding:10px 14px}
    .he-kpis span{display:block;font-size:11px;font-weight:700;text-transform:uppercase;color:#5a6b78}.he-kpis b{font-size:24px;color:#003b5c}.he-kpis small{display:block;color:#5a6b78;font-size:12px}
    .he-scroll{overflow-x:auto}.he-tabla{width:100%;border-collapse:collapse;font-size:13px}.he-tabla th{text-align:left;font-size:11px;text-transform:uppercase;color:#5a6b78;padding:7px;border-bottom:2px solid #dce5ec;white-space:nowrap}
    .he-tabla td{padding:8px 7px;border-top:1px solid #edf2f6;vertical-align:top}.he-tabla small{display:block;color:#5a6b78}.he-tabla .he-dest{background:#fff9e8}.he-tabla th.he-dest{background:#fff3cf}
    .he-sinaut td{background:#fff1e0!important}.he-tag-na{color:#c4472b;font-weight:700}.he-anulado td{opacity:.55;text-decoration:line-through}.he-anulado td.he-acc{text-decoration:none}.he-tag-an{font-weight:700;color:#6b7280}
    .he-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:0 0 12px}.he-bar label{font-size:12px;font-weight:600;color:#41525e;display:block}.he-bar select,.he-bar input{padding:7px 9px;border:1px solid #cfdbe3;border-radius:8px;font:inherit}
    .he-sub{display:inline-flex;background:#e5ebef;border-radius:10px;padding:3px;gap:3px;margin-bottom:12px}.he-sub button{border:0;background:transparent;padding:6px 14px;border-radius:8px;font-weight:600;color:#5a6b78;cursor:pointer}.he-sub .on{background:#fff;color:#003b5c}
    .he-marca{display:inline-block;margin-left:6px;background:#fde8c8;color:#8a5a1e;font-weight:700;border-radius:999px;padding:1px 8px;font-size:11px;cursor:pointer;border:0;vertical-align:middle}
    @media(max-width:860px){.he-grid{grid-template-columns:1fr}.he-kpis{grid-template-columns:1fr}}`;
  function estilos() { if (document.getElementById('he-css')) return; const s = document.createElement('style'); s.id = 'he-css'; s.textContent = CSS; document.head.appendChild(s); }

  function pintar() {
    const main = document.getElementById('main'); if (!main) return;
    estilos(); asegurarEscucha();
    const ac = acceso();
    if (!ac.ver.length) { main.innerHTML = `${typeof tareoRenderTabs === 'function' ? tareoRenderTabs('horasextras') : ''}<div class="he-card">No tienes acceso a las horas extras.</div>`; return; }
    if (!E.area || !ac.ver.includes(E.area)) E.area = ac.escribir[0] || ac.ver[0];
    if (!E.fecha) E.fecha = hoyOperativo();
    if (E.vista === 'general' && !ac.general) E.vista = 'registro';
    if (!E.form && ac.escribir.includes(E.area)) E.form = formVacio(E.area, E.fecha);
    const tabs = typeof tareoRenderTabs === 'function' ? tareoRenderTabs('horasextras') : '';
    main.innerHTML = `${tabs}<div class="he" id="he-root"><div class="main-head"><div><h2>Horas extras</h2><div class="sub">Registro con justificación y autorización · se actualiza en tiempo real</div></div></div>
      ${ac.general ? `<div class="he-sub"><button type="button" class="${E.vista === 'registro' ? 'on' : ''}" onclick="glacialHorasExtras.vista('registro')">Registro del día</button><button type="button" class="${E.vista === 'general' ? 'on' : ''}" onclick="glacialHorasExtras.vista('general')">Vista general (ambas áreas)</button></div>` : ''}
      <div id="he-cuerpo">${E.vista === 'general' ? htmlGeneral() : htmlRegistro()}</div><div id="he-modal">${E.modal}</div></div>`;
  }
  function htmlRegistro() {
    const ac = acceso(), lista = delDia();
    const selArea = ac.ver.length > 1 ? `<div><label>Área</label><select onchange="glacialHorasExtras.area(this.value)">${ac.ver.map(a => `<option value="${a}" ${a === E.area ? 'selected' : ''}>${NOMBRE_AREA[a]}</option>`).join('')}</select></div>` : '';
    const barra = `<div class="he-bar">${selArea}<div><label>Fecha operativa</label><input type="date" value="${esc(E.fecha)}" onchange="glacialHorasExtras.fecha(this.value)"></div></div>`;
    const aviso = E.aviso ? `<div class="he-aviso">${esc(E.aviso)}</div>` : '';
    const lectura = ac.compartida ? '<div class="he-card">Aquí ves solo tus horas extras. Las registra y autoriza tu supervisor.</div>' : '';
    if (!ac.escribir.includes(E.area)) return `${barra}${aviso}${lectura}${htmlTarjetas(lista)}<div id="he-tabla">${htmlTablaDia(lista)}</div>${E.error ? `<div class="he-error">${esc(E.error)}</div>` : ''}`;
    return `${barra}${aviso}<div class="he-grid"><div id="he-form">${htmlFormulario()}</div><div><div id="he-kpis">${htmlTarjetas(lista)}</div><div id="he-tabla">${htmlTablaDia(lista)}</div></div></div>`;
  }
  function filtrosGenerales() {
    const f = E.filtros, ac = acceso();
    const lista = N.filtrar(todos(), f), tot = N.resumen(lista);
    const motivos = [...new Set([].concat(...ac.ver.map(motivosDe)))];
    const sel = (id, val, ops) => `<select id="${id}" onchange="glacialHorasExtras.filtro('${id.slice(3)}',this.value)">${ops.map(([v, t]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    return `<div class="he-bar"><div><label>Área</label>${sel('hf-area', f.area, [['', 'Ambas'], ...ac.ver.map(a => [a, NOMBRE_AREA[a]])])}</div>
      <div><label>Trabajador / DNI</label><input type="text" id="hf-trabajador" value="${esc(f.trabajador)}" placeholder="Buscar…" oninput="glacialHorasExtras.filtro('trabajador',this.value)"></div>
      <div><label>Motivo</label>${sel('hf-motivo', f.motivo, [['', 'Todos'], ...motivos.map(m => [m, m])])}</div>
      <div><label>Desde</label><input type="date" id="hf-desde" value="${esc(f.desde)}" onchange="glacialHorasExtras.filtro('desde',this.value)"></div>
      <div><label>Hasta</label><input type="date" id="hf-hasta" value="${esc(f.hasta)}" onchange="glacialHorasExtras.filtro('hasta',this.value)"></div>
      <div><label>Estado</label>${sel('hf-estado', f.estado, [['vigentes', 'Vigentes'], ['anulados', 'Anulados'], ['todos', 'Todos']])}</div>
      <div><button type="button" class="btn btn-ghost btn-sm" onclick="glacialHorasExtras.consultar()">${E.cargando ? 'Consultando…' : 'Cargar más antiguos'}</button> <button type="button" class="btn btn-ghost btn-sm" onclick="glacialHorasExtras.excel()">Excel</button></div></div>
      <div class="he-kpis"><div style="--c:#005b96"><span>Horas extras</span><b>${N.textoHoras(tot.horas)}</b><small>${tot.registros} registro(s)</small></div><div style="--c:#3f8f5f"><span>Trabajadores</span><b>${tot.trabajadores}</b></div><div style="--c:${tot.sinAutorizar ? '#df8b00' : '#9aa9b8'}"><span>Sin autorizar</span><b>${tot.sinAutorizar}</b></div></div>`;
  }
  function htmlGeneral() {
    const o = { fecha: true, area: true }, lista = N.filtrar(todos(), E.filtros);
    return `<div id="he-filtros">${filtrosGenerales()}</div><div class="he-card"><div class="he-scroll"><table class="he-tabla">${THEAD(o)}<tbody>${lista.length ? lista.slice(0, 500).map(r => filaTabla(r, o)).join('') : '<tr><td colspan="9">Sin registros con esos filtros.</td></tr>'}</tbody></table></div>
      ${lista.length > 500 ? '<p class="he-nota">Se muestran los 500 primeros; afina los filtros o exporta a Excel.</p>' : ''}<p class="he-nota">Solo la memoria del mes anterior y el actual está en vivo; «Cargar más antiguos» trae desde la fecha «Desde».</p></div>`;
  }
  /* Repinta sin pisar lo que se está escribiendo: formulario solo si no tiene el foco. */
  function repintar() {
    if (!document.getElementById('he-root')) return;
    const c = document.getElementById('he-cuerpo');
    if (!c) return;
    const foco = document.activeElement && document.activeElement.closest && document.activeElement.closest('#he-form');
    if (E.vista === 'general') { const f = document.getElementById('he-filtros'); if (!(document.activeElement && f && f.contains(document.activeElement))) c.innerHTML = htmlGeneral(); else { const t = c.querySelector('.he-card'); if (t) t.outerHTML = htmlGeneral().replace(/^[\s\S]*?(<div class="he-card">)/, '$1'); } return; }
    const kp = document.getElementById('he-kpis'), tb = document.getElementById('he-tabla'), fo = document.getElementById('he-form');
    if (!tb) { c.innerHTML = htmlRegistro(); return; }
    const lista = delDia();
    if (kp) kp.innerHTML = htmlTarjetas(lista); else { const k = c.querySelector('.he-kpis'); if (k) k.outerHTML = htmlTarjetas(lista); }
    tb.innerHTML = htmlTablaDia(lista);
    if (fo && !foco) fo.innerHTML = htmlFormulario();
    const av = c.querySelector('.he-aviso'); if (!av && E.aviso) c.insertAdjacentHTML('afterbegin', `<div class="he-aviso">${esc(E.aviso)}</div>`);
  }
  function repintarForm() { const fo = document.getElementById('he-form'); if (fo && E.form) fo.innerHTML = htmlFormulario(); }

  /* Valida en cada tecla sin redibujar el formulario (el cursor no se mueve). */
  function actualizarEstadoForm() {
    const F = E.form; if (!F) return;
    const falta = mensajeFalta(F), b = document.getElementById('he-guardar'), m = document.getElementById('he-falta'), t = document.getElementById('he-total'), c = document.getElementById('he-cuenta');
    if (b) b.disabled = !!falta || E.guardando;
    if (m) m.textContent = falta;
    if (t) { const h = N.totalHoras(F.horaInicio, F.horaFin); t.value = h ? N.textoHoras(h) : '—'; }
    if (c) c.textContent = String(F.justificacion || '').trim().length + '/' + minJust() + ' mínimo';
  }

  /* ---------- detalle (clic en la marca «HE» o en un registro) ---------- */
  function htmlDetalle(r) {
    const li = (a, b) => `<div class="he-li"><span>${a}</span><b>${b}</b></div>`;
    return `<div class="modal-backdrop" onclick="if(event.target===this)glacialHorasExtras.cerrarModal()"><div class="modal"><div class="modal-head"><h3>Hora extra · ${esc(r.trabajadorNombre)}</h3><button class="modal-close" onclick="glacialHorasExtras.cerrarModal()">✕</button></div>
      <div class="modal-body"><style>.he-li{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-top:1px solid #edf2f6;font-size:13px}.he-li b{text-align:right}</style>
      ${li('Área', esc(NOMBRE_AREA[r.area]))}${li('Fecha · turno', fechaCorta(r.fecha) + ' · ' + esc(r.turno))}${li('Horario', esc(r.horaInicio) + '–' + esc(r.horaFin) + ' (' + N.textoHoras(N.horasDe(r)) + ')')}
      ${li('Motivo', esc(r.motivo))}${li('Justificación', esc(r.justificacion || 'Sin justificación'))}${r.equipoLinea ? li('Equipo / línea', esc(r.equipoLinea)) : ''}
      ${li('Autorizó', r.autorizadoPor ? esc(r.autorizadoPorNombre || r.autorizadoPor) + (r.autorizadoEn ? ' · ' + horaMin(r.autorizadoEn) : '') : '<span class="he-tag-na">Sin autorizar</span>')}
      ${li('Registró', esc(r.registradoPorNombre || r.registradoPor || '—') + (r.registradoEn ? ' · ' + horaMin(r.registradoEn) : ''))}
      ${!N.vigente(r) ? li('Anulado', esc(r.motivoAnulacion || '') + ' · ' + esc(r.anuladoPorNombre || r.anuladoPor || '')) : ''}</div></div></div>`;
  }
  function htmlPedirAnular(r) {
    return `<div class="modal-backdrop" onclick="if(event.target===this)glacialHorasExtras.cerrarModal()"><div class="modal"><div class="modal-head"><h3>Anular hora extra</h3><button class="modal-close" onclick="glacialHorasExtras.cerrarModal()">✕</button></div>
      <div class="modal-body"><p>${esc(r.trabajadorNombre)} · ${fechaCorta(r.fecha)} · ${esc(r.horaInicio)}–${esc(r.horaFin)}. El registro no se borra: queda anulado con su motivo.</p>
      <div class="he-card" style="border:0;padding:0"><label>Motivo de la anulación <b class="he-req">*</b></label><textarea id="he-motivo-anular" rows="3" maxlength="300"></textarea></div><div class="he-error" id="he-error-anular"></div>
      <div class="he-acciones"><button type="button" class="btn btn-ghost" onclick="glacialHorasExtras.cerrarModal()">Cancelar</button><button type="button" class="btn btn-primary" onclick="glacialHorasExtras.confirmarAnular('${esc(r.id)}')">Anular</button></div></div></div></div>`;
  }
  function modal(html) { E.modal = html; const m = document.getElementById('he-modal'); if (m) m.innerHTML = html; else { const root = document.getElementById('modal-root'); if (root) root.innerHTML = html; } }

  /* ---------- integraciones con el Tareo (ganchos mínimos en 13-tareo.js) ---------- */
  function delTareo(persona, tareoId) {
    if (!listo) return [];
    const t = (typeof obtenerTareos === 'function' ? obtenerTareos() : []).find(x => x && x.id === tareoId);
    if (!t) return [];
    const k = N.claveTrabajador({ trabajadorId: persona.trabajadorId || persona.id, dni: persona.dni, trabajadorNombre: persona.nombre });
    const area = AREA_DE_NOMBRE[typeof tareoAreaDe === 'function' ? tareoAreaDe(t) : ''] || '';
    return todos().filter(r => N.vigente(r) && r.fecha === t.fecha && (!area || r.area === area) && N.claveTrabajador(r) === k);
  }
  /* Marca «HE X h» junto al nombre en la fila del tareo diario; al tocarla se abre el detalle. */
  function marca(persona, tareoId) {
    try {
      if (!tareoId || !puedeVer()) return '';
      asegurarEscucha();
      const regs = delTareo(persona, tareoId);
      if (!regs.length) return '';
      const h = regs.reduce((s, r) => s + N.horasDe(r), 0);
      return `<button type="button" class="he-marca" title="Ver horas extras" onclick="event.stopPropagation();glacialHorasExtras.detalleDe('${esc(regs[0].id)}')">HE ${esc(N.textoHoras(h).replace(' h', ''))} h</button>`;
    } catch (_) { return ''; }
  }
  /* Sección «Horas extras del mes» de la ficha del trabajador. */
  function fichaHtml(clave, fechaRef) {
    try {
      if (!puedeVer()) return '';
      const f = N.fechaOk(fechaRef) ? fechaRef : hoyOperativo(), pref = f.slice(0, 7);
      const persona = { trabajadorId: String(clave) }, lista = todos().filter(r => N.vigente(r) && r.fecha.startsWith(pref) && (String(r.trabajadorId) === String(clave)));
      const total = lista.reduce((s, r) => s + N.horasDe(r), 0), [y, m] = pref.split('-');
      return `<div class="tar2-ficha-sub">Horas extras de ${MESES[Number(m) - 1]} ${y} (registradas y autorizadas)</div>
        ${lista.length ? `<div class="tareo-table-scroll"><table class="tareo-table"><thead><tr><th>Fecha</th><th>Horario</th><th>Horas</th><th>Motivo</th><th>Autorizó</th></tr></thead><tbody>${lista.sort((a, b) => b.fecha.localeCompare(a.fecha)).map(r =>
          `<tr><td>${fechaCorta(r.fecha)}</td><td>${esc(r.horaInicio)}–${esc(r.horaFin)}</td><td>${esc(N.textoHoras(N.horasDe(r)))}</td><td>${esc(r.motivo)}</td><td>${esc(r.autorizadoPorNombre || r.autorizadoPor || 'Sin autorizar')}</td></tr>`).join('')}</tbody></table></div>
          <p style="margin:6px 0 0;font-weight:700">Total HE del mes: ${esc(N.textoHoras(total))}</p>` : '<p class="small-muted" style="margin:0">Sin horas extras registradas este mes.</p>'}`;
    } catch (_) { return ''; }
  }
  /* Resumen mensual: suma «Total HE» (registradas, vigentes) a cada fila. item: {trabajadorId, dni, nombre, area:'Producción'|…}. */
  function decorarResumen(filas, año, mes) {
    try {
      const pref = año + '-' + pad(mes), lista = todos().filter(r => N.vigente(r) && String(r.fecha).startsWith(pref));
      (filas || []).forEach(it => {
        const k = N.claveTrabajador({ trabajadorId: it.trabajadorId, dni: it.dni, trabajadorNombre: it.nombre }), area = AREA_DE_NOMBRE[it.area] || '';
        it.totalHE = Math.round(lista.filter(r => (!area || r.area === area) && N.claveTrabajador(r) === k).reduce((s, r) => s + N.horasDe(r), 0) * 100) / 100;
      });
    } catch (_) { /* sin datos: la columna queda en 0 */ }
    return filas;
  }
  /* Filas de la hoja «Horas extras» del Excel del resumen mensual (detalle completo). */
  function filasExcel(año, mes, areaNombre) {
    const pref = año + '-' + pad(mes), area = AREA_DE_NOMBRE[areaNombre] || '';
    return N.filtrar(todos(), { area, desde: pref + '-01', hasta: pref + '-31', estado: 'todos' }).slice().reverse().map(r => ({
      'Fecha': r.fecha, 'Área': NOMBRE_AREA[r.area], 'DNI': r.dni || '', 'Trabajador': r.trabajadorNombre, 'Cargo': r.cargo || '', 'Turno': r.turno, 'Inicio': r.horaInicio, 'Fin': r.horaFin, 'Total horas': N.horasDe(r),
      'Motivo': r.motivo, 'Justificación': r.justificacion || '', 'Equipo / línea': r.equipoLinea || '', 'Autorizó': r.autorizadoPorNombre || r.autorizadoPor || 'SIN AUTORIZAR',
      'Autorizado el': r.autorizadoEn ? horaMin(r.autorizadoEn) : '', 'Registró': r.registradoPorNombre || r.registradoPor || '', 'Registrado el': r.registradoEn ? horaMin(r.registradoEn) : '',
      'Estado': N.vigente(r) ? 'Vigente' : 'ANULADO', 'Motivo de anulación': r.motivoAnulacion || ''
    }));
  }
  function exportarGeneral() {
    if (typeof XLSX === 'undefined') { alert('SheetJS no está disponible.'); return; }
    const filas = N.filtrar(todos(), E.filtros).map(r => ({ 'Fecha': r.fecha, 'Área': NOMBRE_AREA[r.area], 'DNI': r.dni || '', 'Trabajador': r.trabajadorNombre, 'Turno': r.turno, 'Inicio': r.horaInicio, 'Fin': r.horaFin, 'Total horas': N.horasDe(r),
      'Motivo': r.motivo, 'Justificación': r.justificacion || '', 'Equipo / línea': r.equipoLinea || '', 'Autorizó': r.autorizadoPorNombre || r.autorizadoPor || 'SIN AUTORIZAR', 'Registró': r.registradoPorNombre || r.registradoPor || '', 'Estado': N.vigente(r) ? 'Vigente' : 'ANULADO' }));
    const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), 'Horas extras');
    XLSX.writeFile(libro, 'Horas_extras_' + hoyOperativo() + '.xlsx');
  }

  /* ---------- API pública (la usan los manejadores de la pantalla y los ganchos del tareo) ---------- */
  const API = {
    pintar, marca, fichaHtml, decorarResumen, filasExcel, puedeVer, puedeEscribir, acceso, todos, estado: () => E, __poner: (area, lista) => { porArea[area] = new Map((lista || []).map(r => [r.id, r])); listo = true; },
    guardar, anular,
    vista(v) { E.vista = v; E.error = ''; E.aviso = ''; pintar(); },
    area(a) { E.area = a; E.form = acceso().escribir.includes(a) ? formVacio(a, E.fecha) : null; E.error = ''; E.aviso = ''; pintar(); },
    fecha(f) { if (!N.fechaOk(f)) return; E.fecha = f; if (E.form && !E.form.id) E.form.fecha = f; E.error = ''; E.aviso = ''; pintar(); },
    elegirTrabajador(clave) {
      if (!E.form) return;
      const c = candidatos(E.area, E.form.fecha).find(x => N.claveTrabajador(x) === clave);
      Object.assign(E.form, c ? { trabajadorId: c.trabajadorId, trabajadorNombre: c.trabajadorNombre, dni: c.dni, cargo: c.cargo } : { trabajadorId: '', trabajadorNombre: '', dni: '', cargo: '' });
      actualizarEstadoForm();
    },
    campo(nombre, valor) { if (!E.form) return; E.form[nombre] = valor; E.error = ''; const er = document.getElementById('he-error'); if (er) er.textContent = ''; actualizarEstadoForm(); },
    editar(id) { const r = todos().find(x => x.id === id); if (!r || !puedeEscribir(r.area)) return; E.area = r.area; E.fecha = r.fecha; E.form = formDe(r); E.error = ''; E.aviso = ''; E.vista = 'registro'; pintar(); const f = document.getElementById('he-form'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'center' }); },
    cancelarEdicion() { E.form = formVacio(E.area, E.fecha); E.error = ''; pintar(); },
    pedirAnular(id) { const r = todos().find(x => x.id === id); if (r) modal(htmlPedirAnular(r)); },
    async confirmarAnular(id) {
      const ta = document.getElementById('he-motivo-anular'), er = document.getElementById('he-error-anular');
      try { await anular(id, ta ? ta.value : ''); modal(''); } catch (e) { if (er) er.textContent = (e && e.message) || String(e); }
    },
    detalleDe(id) { const r = todos().find(x => x.id === id); if (r) modal(htmlDetalle(r)); },
    cerrarModal() { modal(''); },
    filtro(nombre, valor) { E.filtros[nombre] = valor; repintar(); },
    consultar() { const f = E.filtros; consultarRango(f.desde || desdeEscucha(), f.hasta || '', f.area || ''); },
    excel: exportarGeneral
  };
  window.glacialHorasExtras = API;
  window.renderHorasExtrasRegistro = pintar;
})();
