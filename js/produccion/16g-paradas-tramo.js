/* =============================================================
   GLACIAL · PRODUCCIÓN › PARADAS POR MARCA (TRAMO) (26/11/2026) · docs/produccion/cierre-turno.md › «Paradas por marca»
   Se carga DESPUÉS de 16f-cierre-marcas.js. Toda parada del turno pertenece a un TRAMO de la «Secuencia del turno» (marca + presentación):
     · AUTO: por su hora de inicio, el tramo cuyo intervalo [inicio del tramo, hora de corte) la contiene (el tramo en curso va hasta «ahora»).
       Las de Nuevo registro van al tramo de su cuadro (misma marca y presentación; si la marca se repite, por la hora del cuadro).
     · MANUAL: la eligió el supervisor (queda constancia en public.paradas_tramo, glacial_70).
     · PENDIENTE: sin hora y sin marca. Bloquea «Enviar cierre de turno» en los turnos desde FECHA_DESDE (las de turnos anteriores no bloquean).
     · Una parada con hora que cruza la hora de corte se parte en partes enlazadas (paradaPadreId); el total no cambia. Vale también para el refrigerio.
     · Cambio de formato: se carga a la marca que ENTRA (programada, etiqueta CAMBIO).
     · Ratio de la marca = producción del tramo ÷ horas efectivas (duración del tramo − programadas − no programadas).
     · Total del turno = suma de marcas (las pendientes también suman minutos de parada).
   Las paradas NO se mueven de donde viven (sync/avancesTurno.paradasOperativas y cuadros de Nuevo registro): análisis, semáforo y reportes no cambian.
   Lógica pura (node): esCambio, etiqueta, ventanas, tramoDeParada, partirEnCorte, asignar, resumenTramo, totalTurno, pendientesBloquean, textoGeneral,
   ordenarParadas, payloadAsignar, payloadPartir.
   Página: lectura de las paradas del turno, tiempo real (sync/avancesTurno + Supabase Realtime de glacial_70), cola de constancias sin conexión
   (idempotentes por client_event_id) y la imagen general del Avance/Cierre (canvasGeneral).
   ============================================================= */
(function(root){
  'use strict';
  const FECHA_DESDE = '2026-11-26';           // desde este turno las paradas sin marca bloquean el envío
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const norm = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_]+/g, ' ').trim();
  const mismoProducto = (a, b) => norm(a.marca) === norm(b.marca) && norm(a.presentacion) === norm(b.presentacion);
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

  /** Instante (ms) de una hora HH:MM del turno: en la NOCHE las horas < 12:00 son del día siguiente. Misma regla que avHoraMs (29). */
  function hms(fecha, hora, turno){
    if(!fecha || !HHMM.test(String(hora || ''))) return 0;
    const d = new Date(fecha + 'T' + hora + ':00');
    if(turno === 'NOCHE' && Number(String(hora).slice(0, 2)) < 12) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  const hhmm = ms => { if(!ms) return ''; const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  /** ¿Es un cambio de formato / marca / producto? */
  function esCambio(p){
    if(!p) return false;
    if(p.esCambio === true) return true;
    if(p.esCambio === false) return false;
    return /\bcambio\s+(de\s+)?(formato|marca|producto|presentaci[oó]n)/i.test(String(p.descripcion || p.motivoCat || ''));
  }
  /** Etiqueta corta para la lista: CAMBIO | P | NP. */
  const etiqueta = p => esCambio(p) ? 'CAMBIO' : (p && p.tipo === 'PROGRAMADA' ? 'P' : 'NP');

  /** Tramos en estado (de 16f: estadoTramos) → ventanas [inicioMs, finMs). El primero empieza al inicio del turno; cada uno empieza en el corte
   *  del anterior. Cerrado: termina en su hora de corte. Activo: hasta «ahora» (abierto). En espera: sin ventana todavía. */
  function ventanas(tramos, o){
    o = o || {};
    let inicio = num(o.inicioTurnoMs) || 0;
    return (tramos || []).map((t, i) => {
      const v = Object.assign({}, t, { i: t.i === undefined ? i : t.i, inicioMs: 0, finMs: 0, abierto: false });
      if(t.estado === 'cerrado'){
        let fin = hms(o.fecha, t.cierre && t.cierre.hora_corte, o.turno);
        if(fin && inicio && fin < inicio) fin = inicio;                     // corte anterior al inicio (datos raros): tramo de 0 min
        v.inicioMs = inicio; v.finMs = fin; inicio = fin || inicio;
      }else if(t.estado === 'activo'){
        v.inicioMs = inicio; v.finMs = Math.max(inicio, num(o.ahoraMs) || inicio); v.abierto = true; inicio = 0;
      }
      return v;
    });
  }

  /** Tramo de una parada → { i (índice o -1), asignacion: 'AUTO'|'MANUAL'|'PENDIENTE'|'SIN_SECUENCIA', porHora } */
  function tramoDeParada(p, V, o){
    o = o || {};
    if(!V || !V.length) return { i: -1, asignacion: 'SIN_SECUENCIA', porHora: false };
    const porId = id => V.findIndex(t => String(t.id) === String(id));
    if(p.asignacion === 'MANUAL' && p.tramoId && porId(p.tramoId) >= 0) return { i: porId(p.tramoId), asignacion: 'MANUAL', porHora: false };
    const conVentana = V.filter(t => t.inicioMs);
    const porHoraMs = ms => {
      if(!ms || !conVentana.length) return -1;
      if(ms < conVentana[0].inicioMs) return conVentana[0].i;
      for(const t of conVentana){ if(ms >= t.inicioMs && (t.abierto || ms < t.finMs)) return t.i; }
      return conVentana[conVentana.length - 1].i;                       // después del último corte sin tramo en curso: el último
    };
    // Nuevo registro: el cuadro dice la marca y la presentación.
    if(p.origen === 'REGISTRO' && (p.marca || p.presentacion)){
      const cand = V.filter(t => mismoProducto(t, p));
      if(cand.length === 1) return { i: cand[0].i, asignacion: 'AUTO', porHora: false };
      if(cand.length > 1){
        const k = porHoraMs(hms(o.fecha, p.horaInicio || p.cuadroHoraInicio, o.turno));
        const elegido = cand.find(t => t.i === k) || cand.find(t => t.estado !== 'cerrado') || cand[0];
        return { i: elegido.i, asignacion: 'AUTO', porHora: false };
      }
    }
    const ms = hms(o.fecha, p.horaInicio, o.turno);
    if(ms){ const k = porHoraMs(ms); if(k >= 0) return { i: k, asignacion: 'AUTO', porHora: true }; }
    if(p.tramoId && porId(p.tramoId) >= 0) return { i: porId(p.tramoId), asignacion: 'MANUAL', porHora: false };
    return { i: -1, asignacion: 'PENDIENTE', porHora: false };
  }

  /** Parada con hora que cruza uno o más cortes → partes [{…, id, paradaPadreId, minutos, horaInicio, i}] (el total no cambia). Si no cruza: [parada]. */
  function partirEnCorte(p, V, i, o){
    o = o || {};
    const total = Math.round(num(p.minutos)), ini = hms(o.fecha, p.horaInicio, o.turno);
    const una = [Object.assign({}, p, { i })];
    if(!ini || total <= 0 || !V || !V[i]) return una;
    const fin = ini + total * 60000, partes = [];
    let desde = ini, k = i;
    while(k < V.length && desde < fin){
      const t = V[k];
      const corte = (t.abierto || !t.finMs) ? fin : Math.min(fin, t.finMs);
      const siguiente = V[k + 1];
      const hasta = (corte < fin && siguiente && siguiente.inicioMs) ? corte : fin;
      partes.push({ i: k, desde, hasta });
      if(hasta >= fin) break;
      desde = hasta; k++;
    }
    if(partes.length < 2) return una;
    let usados = 0;
    return partes.map((x, n) => {
      const ult = n === partes.length - 1;
      const m = ult ? total - usados : Math.round((x.hasta - x.desde) / 60000);
      usados += m;
      return Object.assign({}, p, { id: String(p.id) + '#' + (n + 1), paradaPadreId: String(p.id), minutos: m, horaInicio: hhmm(x.desde), horaFin: hhmm(x.hasta), i: x.i, parte: n + 1, partes: partes.length });
    });
  }

  /** Reparte las paradas del turno: { porTramo: [[paradas]…], pendientes: [...], sinSecuencia: [...] }. Cada parada lleva asignacion y tramoIndex. */
  function asignar(paradas, V, o){
    o = o || {};
    const porTramo = (V || []).map(() => []), pendientes = [], sinSecuencia = [];
    const antigua = String(o.fecha || '') < FECHA_DESDE, vistos = new Set();
    // Una parada = un id: la misma parada guardada por dos equipos (o reintentada sin conexión) cuenta una sola vez.
    (paradas || []).filter(p => p && !p.eliminada && !p.eliminarSolicitado && num(p.minutos) > 0)
      .filter(p => { const k = String(p.id || ''); if(!k) return true; if(vistos.has(k)) return false; vistos.add(k); return true; }).forEach(p => {
      const r = tramoDeParada(p, V, o);
      if(r.asignacion === 'SIN_SECUENCIA'){ sinSecuencia.push(Object.assign({}, p, { asignacion: 'SIN_SECUENCIA' })); return; }
      if(r.asignacion === 'PENDIENTE'){ pendientes.push(Object.assign({}, p, { asignacion: 'PENDIENTE', antigua })); return; }
      const partes = r.porHora ? partirEnCorte(p, V, r.i, o) : [Object.assign({}, p, { i: r.i })];
      partes.forEach(x => porTramo[x.i].push(Object.assign({}, x, { asignacion: r.asignacion, tramoIndex: x.i, esCambio: esCambio(x) })));
    });
    porTramo.forEach(l => l.sort((a, b) => (hms(o.fecha, a.horaInicio, o.turno) || Infinity) - (hms(o.fecha, b.horaInicio, o.turno) || Infinity)));
    return { porTramo, pendientes, sinSecuencia };
  }

  /** Resumen de un tramo (pantalla, confirmación y lo que se congela al cerrar). */
  function resumenTramo(t, paradas, o){
    o = o || {};
    const minutos = t && t.inicioMs && t.finMs ? Math.max(0, (t.finMs - t.inicioMs) / 60000) : num(o.minutosTramo);
    const L = paradas || [];
    const prog = L.filter(p => p.tipo === 'PROGRAMADA' || esCambio(p)).reduce((s, p) => s + num(p.minutos), 0);
    const noprog = L.filter(p => !(p.tipo === 'PROGRAMADA' || esCambio(p))).reduce((s, p) => s + num(p.minutos), 0);
    const cambio = L.filter(esCambio).reduce((s, p) => s + num(p.minutos), 0);
    const efMin = Math.max(0, minutos - prog - noprog), horas = efMin / 60, produccion = num(o.produccion);
    return { minutos: Math.round(minutos), prog, noprog, cambio, n: L.length, paradasMin: prog + noprog, horas, produccion, ratio: horas > 0 ? produccion / horas : null };
  }

  /** Total del turno = suma de las marcas (+ minutos de las pendientes, que también son paradas del turno). */
  function totalTurno(resumenes, pendientes){
    const R = resumenes || [], P = pendientes || [];
    const minutos = R.reduce((s, r) => s + num(r.minutos), 0);
    const pend = P.reduce((s, p) => s + num(p.minutos), 0);
    const prog = R.reduce((s, r) => s + num(r.prog), 0) + P.filter(p => p.tipo === 'PROGRAMADA' || esCambio(p)).reduce((s, p) => s + num(p.minutos), 0);
    const noprog = R.reduce((s, r) => s + num(r.noprog), 0) + P.filter(p => !(p.tipo === 'PROGRAMADA' || esCambio(p))).reduce((s, p) => s + num(p.minutos), 0);
    const produccion = R.reduce((s, r) => s + num(r.produccion), 0);
    const horas = Math.max(0, minutos - prog - noprog) / 60;
    return { minutos, prog, noprog, paradasMin: prog + noprog, n: R.reduce((s, r) => s + num(r.n), 0) + P.length, pendientesMin: pend, produccion, horas, ratio: horas > 0 ? produccion / horas : null };
  }
  /** Pendientes que bloquean el envío (las de turnos anteriores a FECHA_DESDE no bloquean). */
  const pendientesBloquean = pendientes => (pendientes || []).filter(p => !p.antigua);

  /** Paradas ordenadas por hora del turno; las sin hora al final. */
  function ordenarParadas(paradas, fecha, turno){
    return (paradas || []).slice().sort((a, b) => {
      const x = hms(fecha, a.horaInicio, turno), y = hms(fecha, b.horaInicio, turno);
      if(x && y) return x - y; if(x) return -1; if(y) return 1; return 0;
    });
  }

  const fmtN = n => Math.round(num(n)).toLocaleString('en-US');
  const fmtH = h => (Math.round(num(h) * 100) / 100).toFixed(2);
  /** Texto GENERAL por línea del Avance/Cierre (WhatsApp). modelo = { titulo, turno, fecha (dd/mm/aaaa), hora, ultimoRegistro, generado, lineas:[…], generadoPor }
   *  línea = { nombre, inicio, fin, esCierre, productos:[{nombre, produccion}], unidad, produccionTotal, horasEf, ratioTexto, personalTexto, paradas:[{horaInicio, descripcion, minutos, tipo}],
   *            prog, noprog, total, observaciones:[], sinProduccion } */
  function textoGeneral(m){
    const out = [`*${m.titulo} – TURNO ${m.turno}*`, '', `*Fecha: ${m.fecha}*`, `*Hora: ${m.hora}*`];
    if(m.ultimoRegistro) out.push(`*Último registro: ${m.ultimoRegistro}*` + (m.generado ? `\n_${m.generado}_` : ''));
    if(!(m.lineas || []).length && m.sinLineas) out.push('', m.sinLineas);
    (m.lineas || []).forEach((l, k) => {
      out.push('', `*${l.nombre}*`, `Inicio: ${l.inicio || '—'}` + (l.esCierre ? ` · Término: ${l.fin || '—'}` : ''), '');
      if(l.productos && l.productos.length) l.productos.forEach(p => out.push(`${p.nombre}: ${fmtN(p.produccion)} ${l.unidad}`));
      else out.push('Línea iniciada – Sin producción registrada.');
      out.push('', `Producción total: ${fmtN(l.produccionTotal)} ${l.unidad}`, `Horas efectivas: ${l.horasEf === null || l.horasEf === undefined ? '—' : fmtH(l.horasEf) + ' h'}`,
        `Ratio turno: ${l.ratioTexto}`, `Personal en línea: ${l.personalTexto}`, '', '*PARADAS*', '');
      const P = l.paradas || [];
      if(P.length) P.forEach(p => out.push(`${p.horaInicio || '—'} ${p.descripcion} – ${fmtN(p.minutos)} min`));
      else out.push('Sin paradas registradas.');
      out.push('', `Programadas: ${fmtN(l.prog)} min`, `No programadas: ${fmtN(l.noprog)} min`, `*Total paradas: ${fmtN(l.total)} min*`);
      if((l.observaciones || []).length){ out.push('', '*OBSERVACIONES*'); l.observaciones.forEach(o => out.push(`- ${o}`)); }
      if(k < m.lineas.length - 1) out.push('', '---');
    });
    out.push('', '', `Generado por: ${m.generadoPor || '—'}`, 'GLACIAL - Control de Producción');
    return out.join('\n');
  }

  /** Pedido de constancia a glacial_70 (parada_tramo_asignar). */
  function payloadAsignar(ctx, p, t, o){
    o = o || {};
    const x = { linea: ctx.linea, fecha: ctx.fecha, turno: ctx.turno, parada_id: String(p.id), minutos: Math.max(0, Math.round(num(p.minutos))),
      tipo: p.tipo === 'PROGRAMADA' || esCambio(p) ? 'PROGRAMADA' : 'NO_PROGRAMADA', es_cambio: esCambio(p), origen: p.origen === 'REGISTRO' ? 'REGISTRO' : 'AVANCE',
      descripcion: String(p.descripcion || '').slice(0, 200), asignacion: t ? (p.asignacion === 'MANUAL' ? 'MANUAL' : 'AUTO') : 'PENDIENTE', client_event_id: o.evento };
    if(t){ x.tramo_id = String(t.id); x.marca = t.marca; x.presentacion = t.presentacion; }
    if(HHMM.test(String(p.horaInicio || ''))) x.hora_inicio = p.horaInicio;
    if(p.paradaPadreId) x.parada_padre_id = String(p.paradaPadreId);
    if(o.resumen) x.resumen = o.resumen;
    return x;
  }
  /** Pedido de partición (parada_tramo_partir): partes de partirEnCorte. */
  function payloadPartir(ctx, padre, partes, V, o){
    return { linea: ctx.linea, fecha: ctx.fecha, turno: ctx.turno, parada_id: String(padre.id), descripcion: String(padre.descripcion || '').slice(0, 200),
      tipo: padre.tipo === 'PROGRAMADA' || esCambio(padre) ? 'PROGRAMADA' : 'NO_PROGRAMADA', es_cambio: esCambio(padre), minutos: Math.round(num(padre.minutos)), client_event_id: (o || {}).evento,
      partes: partes.map(x => ({ tramo_id: String(V[x.i].id), marca: V[x.i].marca, presentacion: V[x.i].presentacion, minutos: x.minutos, hora_inicio: x.horaInicio })) };
  }

  const NUCLEO = { FECHA_DESDE, hms, hhmm, esCambio, etiqueta, ventanas, tramoDeParada, partirEnCorte, asignar, resumenTramo, totalTurno, pendientesBloquean, ordenarParadas, textoGeneral, payloadAsignar, payloadPartir };
  if(typeof module !== 'undefined' && module.exports) module.exports = NUCLEO;
  if(typeof window === 'undefined' || !root.document) return;

  /* ================== PÁGINA ================== */
  const W = root;
  const turnoRec = r => (typeof avTurnoRecord === 'function') ? avTurnoRecord(r) : (typeof avTurnoCanon === 'function' ? avTurnoCanon(r.turno) : r.turno);
  const canonT = t => (typeof avTurnoCanon === 'function') ? avTurnoCanon(t) : t;
  const S = { operativas: null, escuchaAv: null, canal: null, canalLinea: '', alCambiar: [] };
  const avisar = () => S.alCambiar.slice().forEach(f => { try{ f(); }catch(_){ } });

  /* Paradas de Avance/Cierre (sync/avancesTurno) en vivo, aunque no esté abierta la pestaña Avance. */
  function escucharAvances(){
    if(S.escuchaAv || typeof db === 'undefined' || !db || !db.collection) return;
    try{
      S.escuchaAv = db.collection('sync').doc('avancesTurno').onSnapshot(doc => {
        const d = doc && doc.exists ? doc.data() : {};
        S.operativas = Array.isArray(d.paradasOperativas) ? d.paradasOperativas : [];
        avisar();
      }, () => {});
    }catch(_){ S.escuchaAv = null; }
  }
  function operativas(){
    if(S.operativas) return S.operativas;
    try{ if(typeof avanceEstado !== 'undefined' && Array.isArray(avanceEstado.paradasOperativas)) return avanceEstado.paradasOperativas; }catch(_){ }
    return [];
  }
  /** Paradas del turno de una línea: Avance/Cierre + Nuevo registro (con la marca y presentación de su cuadro). */
  function paradasTurno(c){
    const out = [];
    operativas().filter(p => p && !p.eliminada && p.fecha === c.fecha && canonT(p.turno) === c.turno && p.linea === c.linea)
      .forEach(p => out.push(Object.assign({}, p, { minutos: num(p.minutos), origen: 'AVANCE' })));
    let rs = [];
    try{ rs = typeof loadRecordsOficiales === 'function' ? loadRecordsOficiales() : (typeof loadRecords === 'function' ? loadRecords() : []); }catch(_){ rs = []; }
    (rs || []).filter(r => r && r.linea === c.linea && r.fecha === c.fecha && turnoRec(r) === c.turno).forEach(r => {
      const cuadros = typeof normalizarCuadros === 'function' ? normalizarCuadros(r) : (r.cuadros || []);
      cuadros.forEach((q, qi) => [['paradasProgramadas', 'PROGRAMADA'], ['paradasNoProgramadas', 'NO_PROGRAMADA']].forEach(([key, tipo]) => (q && q[key] || []).forEach((p, pi) => {
        if(!p || p.auto || p.eliminada || !p.descripcion || num(p.tiempoMin) <= 0) return;
        out.push({ id: String(p.id || ('reg:' + (r.id || 'legacy') + ':' + qi + ':' + key + ':' + pi)), descripcion: p.descripcion, minutos: num(p.tiempoMin), tipo, origen: 'REGISTRO',
          marca: q.marca || '', presentacion: q.presentacion || '', cuadroHoraInicio: q.horaInicio || '', horaInicio: p.horaInicio || '', esCambio: p.esCambio });
      })));
    });
    return out;
  }
  /* Tiempo real de glacial_70: cierre_tramos, cierres_turno y paradas_tramo de la línea. */
  function escucharServidor(linea, alCambio){
    const sb = W.glacialSupabaseCliente;
    if(!sb || typeof sb.channel !== 'function' || !linea) return;
    if(S.canal && S.canalLinea === linea) return;
    try{ if(S.canal) sb.removeChannel(S.canal); }catch(_){ }
    try{
      let ch = sb.channel('cierre-turno-' + linea);
      ['cierre_tramos', 'cierres_turno', 'paradas_tramo'].forEach(t => { ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: 'linea=eq.' + linea }, () => alCambio()); });
      ch.subscribe(); S.canal = ch; S.canalLinea = linea;
    }catch(_){ S.canal = null; S.canalLinea = ''; }
  }

  /* Constancias en glacial_70 con cola sin conexión: idempotentes por client_event_id (reintentar no duplica). */
  const COLA = 'glacial:paradasTramo:cola';
  const leerCola = () => { try{ return JSON.parse(localStorage.getItem(COLA) || '[]'); }catch(_){ return []; } };
  const guardarCola = l => { try{ localStorage.setItem(COLA, JSON.stringify(l.slice(-200))); }catch(_){ } };
  const uuid = () => (W.glacialPaletasCola && typeof W.glacialPaletasCola.uuid === 'function') ? W.glacialPaletasCola.uuid() : (W.crypto && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
  let vaciando = false;
  async function vaciarCola(){
    if(vaciando) return; const sb = W.glacialSupabaseCliente; if(!sb || typeof sb.rpc !== 'function') return;
    vaciando = true; let detenido = false;
    try{
      let l = leerCola();
      for(const x of l.slice()){
        let r; try{ r = await sb.rpc(x.fn, { p: x.p }); }catch(e){ r = { error: { message: String(e && e.message || e), red: true } }; }
        if(r && r.error){
          const red = r.error.red || /fetch|network|failed|timeout/i.test(String(r.error.message || '')) || !navigator.onLine;
          if(red){ detenido = true; break; }                    // sin conexión: se reintenta luego
          const codigo = String(r.error.code || '');
          if(codigo === 'PGRST202' || codigo === '42883'){ detenido = true; break; }     // falta glacial_70: se conserva
        }
        l = leerCola().filter(y => y.p.client_event_id !== x.p.client_event_id); guardarCola(l);
      }
    }finally{ vaciando = false; }
    if(!detenido && leerCola().length) setTimeout(vaciarCola, 0);      // lo que se encoló mientras se vaciaba
  }
  function encolar(fn, p){
    if(!p || !p.client_event_id) return;
    const l = leerCola().filter(y => !(y.fn === fn && y.p.linea === p.linea && y.p.fecha === p.fecha && y.p.turno === p.turno && y.p.parada_id === p.parada_id));
    l.push({ fn, p }); guardarCola(l); vaciarCola();
  }
  W.addEventListener('online', vaciarCola);
  setTimeout(vaciarCola, 4000);

  /* ---------- imagen GENERAL del Avance/Cierre (una tarjeta por línea) ---------- */
  function canvasGeneral(m){
    const ESC = 2, Wd = 540, PAD = 22, C = { dark: '#0B3A5C', ink: '#172B3A', muted: '#5E6D78', line: '#E3E9EE', tile: '#F2F6F9', bg: '#EEF3F7',
      np: ['#FDE2E1', '#8E1B16'], p: ['#DCEBFF', '#1E46A0'], cb: ['#EDE4FF', '#5B2BB5'] };
    const font = (w, s) => `${w} ${s}px Inter, "Segoe UI", Roboto, Arial, sans-serif`;
    const medir = document.createElement('canvas').getContext('2d');
    const recortar = (txt, w, f) => { medir.font = f; let t = String(txt); if(medir.measureText(t).width <= w) return t; while(t.length > 1 && medir.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; };
    // alto: cabecera + por línea (kpis + producción + paradas + pie)
    const altoLinea = l => 40 + 150 + 40 + Math.max(1, (l.productos || []).length) * 28 + 44 + Math.max(1, (l.paradas || []).length) * 32 + 50 + 16;
    const H = 30 + 112 + (m.lineas || []).reduce((s, l) => s + altoLinea(l) + 14, 0) + 40 + (m.lineas && m.lineas.length ? 0 : 60);
    const cv = document.createElement('canvas'); cv.width = Wd * ESC; cv.height = H * ESC;
    const x = cv.getContext('2d'); x.scale(ESC, ESC);
    const rr = (px, py, w, h, r, fill, stroke) => { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); if(fill){ x.fillStyle = fill; x.fill(); } if(stroke){ x.strokeStyle = stroke; x.lineWidth = 1; x.stroke(); } };
    const txt = (t, px, py, f, col, al) => { x.font = f; x.fillStyle = col; x.textAlign = al || 'left'; x.textBaseline = 'alphabetic'; x.fillText(t, px, py); };
    x.fillStyle = C.bg; x.fillRect(0, 0, Wd, H);
    let y = 14;
    rr(14, y, Wd - 28, 104, 16, C.dark);
    txt(`GLACIAL · ${m.titulo}`, 14 + PAD, y + 32, font(500, 13), '#C9DCEB');
    txt(recortar(`Turno ${m.turno} · ${m.fecha}`, Wd - 28 - 2 * PAD, font(800, 22)), 14 + PAD, y + 62, font(800, 22), '#FFFFFF');
    txt(recortar(`Hora ${m.hora}${m.generadoPor ? ' · ' + m.generadoPor : ''}`, Wd - 28 - 2 * PAD, font(500, 13)), 14 + PAD, y + 86, font(500, 13), '#C9DCEB');
    y += 118;
    if(!(m.lineas || []).length){ rr(14, y, Wd - 28, 50, 14, '#fff', C.line); txt(m.sinLineas || 'Sin líneas en producción.', 14 + PAD, y + 31, font(600, 14), C.muted); y += 64; }
    (m.lineas || []).forEach(l => {
      const h = altoLinea(l), X = 14, IW = Wd - 28;
      rr(X, y, IW, h, 16, '#FFFFFF', C.line);
      let cy = y + 30;
      txt(l.nombre, X + PAD, cy, font(800, 17), C.dark);
      txt(`${l.inicio || '—'}${l.esCierre ? ' – ' + (l.fin || '—') : ''}`, X + IW - PAD, cy, font(500, 13), C.muted, 'right');
      cy += 12;
      const tw = (IW - 2 * PAD - 12) / 2, kp = [['Producción total', fmtN(l.produccionTotal) + ' ' + l.unidad], ['Ratio turno', l.ratioTexto], ['Horas efectivas', l.horasEf === null || l.horasEf === undefined ? '—' : fmtH(l.horasEf) + ' h'], ['Paradas', fmtN(l.total) + ' min']];
      kp.forEach((k, j) => { const kx = X + PAD + (j % 2) * (tw + 12), ky = cy + Math.floor(j / 2) * 70; rr(kx, ky, tw, 60, 12, C.tile); txt(k[0], kx + 14, ky + 22, font(500, 12.5), C.muted); txt(recortar(k[1], tw - 28, font(800, 19)), kx + 14, ky + 47, font(800, 19), C.ink); });
      cy += 150;
      x.strokeStyle = C.line; x.beginPath(); x.moveTo(X, cy); x.lineTo(X + IW, cy); x.stroke();
      cy += 28; txt('PRODUCCIÓN', X + PAD, cy, font(800, 13.5), C.dark);
      cy += 8;
      (l.productos && l.productos.length ? l.productos : [{ nombre: 'Sin producción registrada', produccion: null }]).forEach(p => {
        cy += 26; txt(recortar(p.nombre, IW - 2 * PAD - 110, font(500, 14.5)), X + PAD, cy, font(500, 14.5), C.ink);
        if(p.produccion !== null) txt(fmtN(p.produccion), X + IW - PAD, cy, font(800, 14.5), C.ink, 'right');
      });
      cy += 18; x.strokeStyle = C.line; x.beginPath(); x.moveTo(X, cy); x.lineTo(X + IW, cy); x.stroke();
      cy += 28; txt('PARADAS DEL TURNO', X + PAD, cy, font(800, 13.5), C.dark);
      cy += 6;
      const P = l.paradas || [];
      if(!P.length){ cy += 30; txt('Sin paradas registradas.', X + PAD, cy, font(500, 14), C.muted); }
      P.forEach(p => {
        cy += 32;
        const e = etiqueta(p), col = e === 'CAMBIO' ? C.cb : e === 'P' ? C.p : C.np, lab = e === 'CAMBIO' ? 'CAMB' : e;
        x.font = font(800, 11.5); const lw = Math.max(28, x.measureText(lab).width + 14);
        rr(X + PAD, cy - 17, lw, 22, 6, col[0]); txt(lab, X + PAD + lw / 2, cy - 1.5, font(800, 11.5), col[1], 'center');
        txt(recortar(`${p.horaInicio || '—'} ${p.descripcion}`, IW - 2 * PAD - lw - 60, font(500, 14)), X + PAD + lw + 10, cy, font(500, 14), C.ink);
        txt(fmtN(p.minutos), X + IW - PAD, cy, font(800, 14), C.ink, 'right');
      });
      cy += 18; x.strokeStyle = '#C9D4DC'; x.beginPath(); x.moveTo(X + PAD, cy); x.lineTo(X + IW - PAD, cy); x.stroke();
      cy += 26; txt(`Prog. ${fmtN(l.prog)} · No prog. ${fmtN(l.noprog)}`, X + PAD, cy, font(800, 14), C.ink);
      txt(`Total ${fmtN(l.total)} min`, X + IW - PAD, cy, font(800, 14), C.ink, 'right');
      y += h + 14;
    });
    txt('GLACIAL - Control de Producción', 14 + PAD, y + 18, font(500, 12.5), C.muted);
    return cv;
  }

  W.glacialParadasTramo = Object.assign({ paradasTurno, escucharAvances, escucharServidor, encolar, vaciarCola, uuid, canvasGeneral, estado: S,
    alCambiar(f){ if(typeof f === 'function') S.alCambiar.push(f); } }, NUCLEO);
})(typeof window !== 'undefined' ? window : globalThis);
