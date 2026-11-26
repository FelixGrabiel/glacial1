/* =============================================================
   GLACIAL · PRODUCCIÓN › PALETAS › CIERRE PROGRESIVO DE MARCAS Y CIERRE DE TURNO (27/11/2026) · docs/produccion/cierre-turno.md
   Se carga DESPUÉS de 16-paletas.js, 16d-paletas-cola.js y 16e-paletas-rapido.js.
   Debajo de la «Secuencia del turno» (pestaña Paletas, por línea + fecha + turno) agrega el panel «Cierre de turno»:
     · Franja de estado: N pendientes por subir (cola sin conexión de 16d), N de M marcas cerradas y «Todo listo para envío rápido» o la advertencia.
     · Un tramo por tarjeta: CERRADO ✓ (hora de corte, paletas y saldo), ACTIVO (acumulado, Saldo (paq) [0] y «Cerrar marca») o En espera.
     · «Cerrar marca»: fija la hora de corte real (ahora, hora de Lima), congela el acumulado de paletas completas, guarda el saldo y la deja Cerrada ✓;
       la siguiente pasa a activa (y la captura de paletas de 16e salta las marcas cerradas al elegir marca y presentación).
     · «Enviar cierre de turno»: un solo botón; cierra la última marca con su saldo y guarda el cierre consolidado. Deshabilitado si hay registros sin subir
       o rechazados, marcas anteriores sin cerrar, sin secuencia o sin permiso.
   Datos: funciones de glacial_69 (cierre_turno_listar / cierre_tramo_cerrar / cierre_tramo_reabrir / cierre_turno_enviar) por el cliente de Supabase. El servidor
   repite TODAS las reglas (orden, hora de corte, enteros ≥ 0, pendientes, doble envío). Sin la migración aplicada, el panel lo dice y no deja cerrar.
   Lógica pura (se prueba con node): estadoTramos, cabecera, validarEnvio, paletasDelTramo, payloadCerrar, payloadEnviar.
   PARADAS POR MARCA (26/11/2026, 16g-paradas-tramo.js + glacial_70): cada tarjeta muestra sus paradas, minutos y ratio de la marca; franja amarilla de
   paradas sin marca con «Asignar»; tarjeta del cambio de formato entre marcas; «Total turno (suma de marcas)». «Cerrar marca» abre una confirmación
   con el resumen y la casilla obligatoria «Revisé las paradas de esta marca» (se congela en cierre_tramos). El envío se bloquea con paradas sin marca.
   Tiempo real: escucha de sync/avancesTurno y Supabase Realtime (cierre_tramos, cierres_turno, paradas_tramo) sin quitar el foco a quien escribe.
   ============================================================= */
(function(root){
  'use strict';
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const norm = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_]+/g, ' ').trim();
  const mismoProducto = (a, b) => norm(a.marca) === norm(b.marca) && norm(a.presentacion) === norm(b.presentacion);

  /* ---------- lógica pura ---------- */
  /** tramos (en orden) + filas del servidor → estado de cada tramo: 'cerrado' | 'activo' (el primero sin cerrar) | 'espera'. */
  function estadoTramos(tramos, filas){
    const porId = new Map((filas || []).filter(f => f && f.estado === 'cerrado').map(f => [String(f.tramo_id), f]));
    let activo = false;
    return (tramos || []).map((t, i) => {
      const cierre = porId.get(String(t.id)) || null;
      let estado = 'espera';
      if(cierre) estado = 'cerrado';
      else if(!activo){ estado = 'activo'; activo = true; }
      return Object.assign({}, t, { i, estado, cierre });
    });
  }
  /** Paletas del tramo = acumulado de su marca/presentación ahora − acumulado congelado al cerrar el tramo anterior de la MISMA marca (SCALA → BELLS → SCALA). */
  function paletasDelTramo(lista, i, acumulado){
    const t = lista[i]; if(!t) return 0;
    let base = 0;
    for(let k = 0; k < i; k++){ const x = lista[k]; if(x.estado === 'cerrado' && x.cierre && mismoProducto(x, t)) base = Math.max(base, num(x.cierre.paletas_acumuladas)); }
    return Math.max(0, num(acumulado) - base);
  }
  /** Franja superior. */
  function cabecera(o){
    const lista = o.tramos || [], total = lista.length, cerradas = lista.filter(t => t.estado === 'cerrado').length;
    const pend = num(o.pendientes), rech = num(o.rechazados);
    if(o.enviado) return { nivel: 'enviado', cerradas, total, pendientes: pend, mensaje: 'Cierre de turno enviado' };
    if(!total) return { nivel: 'aviso', cerradas, total, pendientes: pend, mensaje: 'Sin secuencia del turno: agrega los tramos para cerrar por marca' };
    if(rech) return { nivel: 'aviso', cerradas, total, pendientes: pend, mensaje: rech + ' registro' + (rech === 1 ? '' : 's') + ' de paletas rechazado' + (rech === 1 ? '' : 's') + ': revísalo' + (rech === 1 ? '' : 's') + ' antes de enviar' };
    if(pend) return { nivel: 'aviso', cerradas, total, pendientes: pend, mensaje: 'Hay registros sin subir: espera la sincronización' + (o.enLinea === false ? ' (sin conexión)' : '') };
    const faltan = lista.slice(0, -1).filter(t => t.estado !== 'cerrado').length;
    if(faltan) return { nivel: 'aviso', cerradas, total, pendientes: pend, mensaje: 'Cierra ' + faltan + ' marca' + (faltan === 1 ? '' : 's') + ' anterior' + (faltan === 1 ? '' : 'es') + ' antes de enviar' };
    return { nivel: 'ok', cerradas, total, pendientes: pend, mensaje: 'Todo listo para envío rápido' };
  }
  /** ¿Se puede enviar? (la pantalla deshabilita el botón; el servidor lo vuelve a revisar) */
  function validarEnvio(o){
    const m = [], lista = o.tramos || [];
    if(!o.puede) m.push('Tu usuario no puede cerrar el turno.');
    if(o.sinServidor) m.push('Falta aplicar la migración glacial_69 en Supabase.');
    if(o.enviado) m.push('El cierre de este turno ya se envió.');
    if(!lista.length) m.push('No hay secuencia del turno.');
    if(num(o.pendientes)) m.push(num(o.pendientes) + ' registro(s) de paletas sin subir.');
    if(num(o.rechazados)) m.push(num(o.rechazados) + ' registro(s) de paletas rechazado(s).');
    const faltan = lista.slice(0, -1).filter(t => t.estado !== 'cerrado');
    if(faltan.length) m.push('Falta cerrar: ' + faltan.map(t => t.marca).join(', ') + '.');
    if(num(o.paradasPendientes)) m.push(num(o.paradasPendientes) + ' parada(s) sin marca: asígnala(s) para enviar.');
    const ult = lista[lista.length - 1];
    if(ult && ult.estado !== 'cerrado' && o.revisadoUltimo === false) m.push('Marca «Revisé las paradas de ' + ult.marca + '».');
    if(ult && ult.estado !== 'cerrado'){ const s = o.saldoUltimo; if(!(s === '' || s === undefined || s === null || (Number.isInteger(Number(s)) && Number(s) >= 0))) m.push('El saldo de ' + ult.marca + ' debe ser un entero ≥ 0.'); }
    return { ok: !m.length, motivos: m };
  }
  const secuenciaPayload = lista => (lista || []).map(t => ({ tramo_id: String(t.id), marca: t.marca, presentacion: t.presentacion }));
  const enteroSaldo = s => (s === '' || s === undefined || s === null) ? 0 : Math.max(0, Math.round(Number(s)));
  function payloadCerrar(ctx, lista, i, o){
    const t = lista[i];
    return { linea: ctx.linea, fecha: ctx.fecha, turno: ctx.turno, secuencia: secuenciaPayload(lista), tramo_id: String(t.id), hora_corte: o.hora,
      paletas_acumuladas: Math.max(0, Math.round(num(o.acumulado))), paletas_tramo: paletasDelTramo(lista, i, o.acumulado), saldo_paquetes: enteroSaldo(o.saldo), client_event_id: o.evento,
      paradas_revisadas: !!o.revisadas, resumen: resumenPayload(o.resumen) };
  }
  /** Resumen de paradas de la marca que se congela al cerrar (glacial_70). */
  function resumenPayload(r){
    if(!r) return undefined;
    const x = { minutos: Math.round(num(r.minutos)), prog: Math.round(num(r.prog)), noprog: Math.round(num(r.noprog)), cambio: Math.round(num(r.cambio)), n: Math.round(num(r.n)),
      produccion: Math.round(num(r.produccion)), horas: Math.round(num(r.horas) * 100) / 100 };
    if(r.ratio !== null && r.ratio !== undefined && Number.isFinite(Number(r.ratio))) x.ratio = Math.round(Number(r.ratio) * 100) / 100;
    return x;
  }
  function payloadEnviar(ctx, lista, o){
    const p = { linea: ctx.linea, fecha: ctx.fecha, turno: ctx.turno, secuencia: secuenciaPayload(lista), client_event_id: o.evento, pendientes: num(o.pendientes),
      observaciones: String(o.observaciones || '').trim().slice(0, 1000), capturado_en: new Date(num(o.ahoraMs) || Date.now()).toISOString(), paradas_pendientes: num(o.paradasPendientes) };
    const k = lista.length - 1, ult = lista[k];
    if(ult && ult.estado !== 'cerrado') p.ultimo = { hora_corte: o.hora, paletas_acumuladas: Math.max(0, Math.round(num(o.acumulado))), paletas_tramo: paletasDelTramo(lista, k, o.acumulado), saldo_paquetes: enteroSaldo(o.saldo), client_event_id: o.eventoUltimo || undefined,
      paradas_revisadas: !!o.revisadoUltimo, resumen: resumenPayload(o.resumenUltimo) };
    return p;
  }
  const NUCLEO = { estadoTramos, paletasDelTramo, cabecera, validarEnvio, payloadCerrar, payloadEnviar, secuenciaPayload, resumenPayload };
  if(typeof module !== 'undefined' && module.exports) module.exports = NUCLEO;
  if(typeof window === 'undefined' || !root.document) return;

  /* ================== PÁGINA ================== */
  const W = root;
  if(typeof htmlSecuenciaTurnoPaletas !== 'function' || typeof tramosSecuenciaTurnoPaletas !== 'function') return;
  const Q = () => W.glacialPaletasCola || null;
  const esc = v => (typeof escaparHtml === 'function') ? escaparHtml(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Math.round(num(n)).toLocaleString('es-PE');
  const S = { porTurno: new Map(), saldo: {}, obs: {}, revisado: {}, confirmar: '', ocupado: '', msg: null, sucio: false, enVivo: false };
  const clave = c => c.linea + '|' + c.fecha + '|' + c.turno;
  const ctxActual = () => (typeof draftPaleta !== 'undefined' && draftPaleta && draftPaleta.linea && draftPaleta.fecha && draftPaleta.turno) ? { linea: draftPaleta.linea, fecha: draftPaleta.fecha, turno: draftPaleta.turno } : null;
  const cliente = () => W.glacialSupabaseCliente || null;
  const ahoraMs = () => (W.GlacialFecha && typeof W.GlacialFecha.ahoraMs === 'function') ? W.GlacialFecha.ahoraMs() : Date.now();
  function horaAhora(){
    const ms = ahoraMs();
    if(W.GlacialFecha && typeof W.GlacialFecha.ahoraLima === 'function'){ const l = W.GlacialFecha.ahoraLima(ms); return String(l.hora).padStart(2, '0') + ':' + String(l.minuto).padStart(2, '0'); }
    const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function puede(){
    try{
      if(W.glacialVista && typeof W.glacialVista.activo === 'function' && W.glacialVista.activo()) return false;
      if(typeof esUsuarioSoloConsulta === 'function' && esUsuarioSoloConsulta(state.user)) return false;
      const rol = state.user && state.user.rol;
      return !!(state.user && (tienePermiso('paletas') || ['Administrador', 'Jefe de Producción', 'Jefe de Operaciones', 'Supervisor', 'Supervisor de Producción'].includes(rol)));
    }catch(_){ return false; }
  }
  const colaEstado = () => { const q = Q(); return { pendientes: q ? q.pendientes().length : 0, rechazados: q && q.rechazados ? q.rechazados().length : 0 }; };
  function acumuladoDe(c, t){
    try{
      const k = claveCombinacionPaletas(c.linea, c.fecha, c.turno, t.marca, t.presentacion);
      const conf = paletasDeCombinacionPaletas(k), q = Q();
      const pend = q ? q.registrosPendientes().filter(r => esCombinacionPaletas(r, k)) : [];
      return q ? q.acumuladoDe(q.unir(conf, pend)).paletas : conf.reduce((m, r) => r && r.tipoPaleta !== 'INCOMPLETA' ? Math.max(m, num(r.paletas)) : m, 0);
    }catch(_){ return 0; }
  }
  const msgError = e => {
    const m = String((e && e.message) || e || ''), c = String((e && e.code) || '');
    if(c === 'PGRST202' || c === '42883' || /could not find the function|does not exist|schema cache/i.test(m)) return { falta: true, texto: 'Falta aplicar glacial_69 en Supabase: el cierre por marca todavía no está disponible.' };
    if(c === '42501') return { texto: 'No tienes permiso para esta acción.' };
    return { texto: m.replace(/^cierre:\s*/, '') || 'No se pudo completar.' };
  };

  /* ---------- servidor ---------- */
  async function cargar(c, forzar){
    const k = clave(c), e = S.porTurno.get(k) || { listo: false, filas: [], cierre: null, cargando: false, error: '', falta: false };
    S.porTurno.set(k, e);
    if(e.cargando || (e.listo && !forzar)) return e;
    const cl = cliente();
    if(!cl || typeof cl.rpc !== 'function'){ e.listo = true; e.error = 'Supabase no está disponible en esta sesión.'; e.falta = true; return e; }
    e.cargando = true;
    try{
      const r = await cl.rpc('cierre_turno_listar', { p_linea: c.linea, p_fecha: c.fecha, p_turno: c.turno });
      if(r && r.error){ const m = msgError(r.error); e.error = m.texto; e.falta = !!m.falta; }
      else{ e.filas = (r && r.data && r.data.tramos) || []; e.cierre = (r && r.data && r.data.cierre) || null; e.error = ''; e.falta = false; }
    }catch(err){ e.error = msgError(err).texto; }
    e.cargando = false; e.listo = true;
    return e;
  }
  const lista = c => estadoTramos(tramosSecuenciaTurnoPaletas(c.linea, c.fecha, c.turno), (S.porTurno.get(clave(c)) || {}).filas);

  /* La captura rápida (16e) elige marca/presentación con el tramo vigente: las marcas cerradas se saltan. */
  (function(){
    const q = Q(); if(!q || typeof q.tramoVigente !== 'function' || q.__cierreMarcas) return;
    const orig = q.tramoVigente; q.__cierreMarcas = true;
    q.tramoVigente = function(tramos, o){
      const t0 = (tramos || [])[0];
      const e = t0 ? S.porTurno.get(t0.linea + '|' + t0.fecha + '|' + t0.turno) : null;
      const cerrados = new Set(((e && e.filas) || []).filter(f => f.estado === 'cerrado').map(f => String(f.tramo_id)));
      return orig.call(this, (tramos || []).filter(t => !cerrados.has(String(t.id))), o);
    };
  })();

  /* ---------- paradas por marca (16g + glacial_70) ---------- */
  const PT = () => W.glacialParadasTramo || null;
  function inicioTurnoMs(c){
    try{ if(typeof avVentanaTurno === 'function'){ const w = avVentanaTurno(c.fecha, c.turno); if(w && w.ini) return w.ini; } }catch(_){ }
    const p = PT(); return p ? p.hms(c.fecha, c.turno === 'NOCHE' ? '19:00' : '07:00', c.turno) : 0;
  }
  /** Unidades por paleta de la marca/presentación del turno (de sus paletas o de la programación). */
  function uppDe(c, t){
    let u = 0;
    try{ (paletasDeCombinacionPaletas(claveCombinacionPaletas(c.linea, c.fecha, c.turno, t.marca, t.presentacion)) || []).forEach(r => { u = Math.max(u, num(r && r.unidadesPorPaleta)); }); }catch(_){ }
    if(!u){ try{ const ps = typeof loadProgramaciones === 'function' ? loadProgramaciones() : []; const pr = (ps || []).find(x => x && x.linea === c.linea && x.fecha === c.fecha && x.turno === c.turno && mismoProducto(x, t)); u = num(pr && pr.unidadesPorPaleta); }catch(_){ } }
    return u;
  }
  /** Todo lo del turno: tramos, ventanas, paradas asignadas, resumen por marca y total. */
  function modelo(c){
    const L = lista(c), p = PT();
    if(!p) return { L, V: [], A: { porTramo: L.map(() => []), pendientes: [] }, R: L.map(() => null), TT: null, bloquean: [] };
    const V = p.ventanas(L, { fecha: c.fecha, turno: c.turno, inicioTurnoMs: inicioTurnoMs(c), ahoraMs: ahoraMs() });
    const A = p.asignar(p.paradasTurno(c), V, c);
    const R = V.map((t, i) => {
      const pal = t.estado === 'cerrado' ? num(t.cierre && t.cierre.paletas_tramo) : t.estado === 'activo' ? paletasDelTramo(L, i, acumuladoDe(c, t)) : 0;
      return p.resumenTramo(t, A.porTramo[i], { produccion: pal * uppDe(c, t) });
    });
    const TT = p.totalTurno(R.filter((r, i) => V[i].estado !== 'espera'), A.pendientes);
    return { L, V, A, R, TT, bloquean: p.pendientesBloquean(A.pendientes) };
  }

  /* ---------- pantalla ---------- */
  function estilos(){
    if(document.getElementById('ct-estilos')) return;
    const s = document.createElement('style'); s.id = 'ct-estilos';
    s.textContent = `.ct{display:grid;gap:12px}.ct-franja{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;border-radius:12px;padding:12px 14px;font-weight:700}
.ct-ok{background:#e7f6ec;border:1px solid #9fd8b3;color:#14532d}.ct-aviso{background:#fff7e6;border:1px solid #f5c26b;color:#7a4a00}.ct-enviado{background:#e8f1fb;border:1px solid #b7d3ee;color:#0b4f8a}
.ct-franja b{font-size:16px}.ct-chip{background:rgba(255,255,255,.7);border-radius:999px;padding:3px 10px;font-size:12.5px;font-weight:700}
.ct-pend{display:flex;gap:10px;align-items:center;justify-content:space-between;background:#fff8db;border:1px solid #f2cf63;border-radius:12px;padding:12px 14px;color:#7a4a00}
.ct-pend b{display:block;font-size:15px}.ct-pend small{display:block;font-size:13px}
.ct-tarjetas{display:grid;gap:10px}.ct-t{display:grid;gap:10px;border:1px solid #dce5eb;border-radius:14px;padding:14px;background:#fff}
.ct-cab{display:flex;gap:10px;align-items:flex-start;justify-content:space-between}
.ct-t.cerrado{background:#fbfdfc;border-color:#cfe9da}.ct-t.activo{border:2px solid #2563eb;box-shadow:0 4px 14px rgba(37,99,235,.12)}.ct-t.espera{opacity:.8}
.ct-mar{font-weight:800;color:#0B3A5C;font-size:16px}.ct-sub{font-size:12.5px;color:#587087}.ct-badge{display:inline-block;border-radius:999px;padding:4px 11px;font-size:12px;font-weight:800;white-space:nowrap}
.ct-b-ok{background:#dcfce7;color:#166534}.ct-b-act{background:#dbeafe;color:#1d4ed8}.ct-b-esp{background:#eef2f6;color:#587087}
.ct-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ct-kpi{background:#f2f6f9;border-radius:10px;padding:9px 12px}.ct-kpi small{display:block;font-size:12px;color:#587087}.ct-kpi b{font-size:19px;color:#172B3A}
.ct-ps{display:grid;border-top:1px solid #e3e9ee}.ct-p{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 0;border-bottom:1px dashed #e3e9ee;font-size:14px}.ct-p:last-child{border-bottom:0}
.ct-p b{white-space:nowrap}.ct-tag{display:inline-block;min-width:30px;text-align:center;border-radius:6px;padding:2px 7px;font-size:11.5px;font-weight:800}
.ct-tag-np{background:#fde2e1;color:#8e1b16}.ct-tag-p{background:#dcebff;color:#1e46a0}.ct-tag-cb{background:#ede4ff;color:#5b2bb5}
.ct-cambio{border:1.5px dashed #b9a2ee;background:#f7f3ff;border-radius:12px;padding:10px 14px;color:#5b2bb5;font-size:13.5px}.ct-cambio b{font-size:14.5px}
.ct-acc{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ct-acc label{display:grid;gap:3px;font-size:11.5px;font-weight:700;color:#587087}
.ct-acc input{width:100%;box-sizing:border-box;min-height:46px;font-size:18px;font-weight:700;text-align:center;border:1px solid #c9d4dc;border-radius:10px}
.ct-btn{min-height:48px;padding:0 18px;border-radius:12px;border:0;background:#0B3A5C;color:#fff;font:inherit;font-weight:800;font-size:15px;cursor:pointer}.ct-btn:disabled{opacity:.5;cursor:not-allowed}
.ct-btn-o{background:#fff;color:#0B3A5C;border:1px solid #c9d4dc;min-height:46px;font-size:14px;padding:0 12px}.ct-ancho{grid-column:1/-1}
.ct-conf{display:grid;gap:6px;border:1px solid #dce5eb;border-radius:12px;padding:12px;background:#fff}.ct-conf h5{margin:0;font-size:12px;color:#587087;font-weight:700;letter-spacing:.04em}
.ct-fila{display:flex;justify-content:space-between;gap:10px;font-size:14px;padding:4px 0}.ct-fila.f{font-weight:800;border-top:1px solid #e3e9ee;padding-top:8px}.ct-fila.r{color:#0B3A5C}
.ct-check{display:flex;gap:10px;align-items:center;font-size:14.5px;min-height:44px}.ct-check input{width:22px;height:22px}
.ct-total{background:#f5f8fa;border:1px solid #dce5eb;border-radius:14px;padding:14px;display:grid;gap:10px}
.ct-pie{display:grid;gap:10px}.ct-pie textarea{min-height:54px;border:1px solid #cddfec;border-radius:10px;padding:8px 10px;font:inherit}
.ct-enviar{min-height:60px;padding:0 28px;font-size:18px;border-radius:14px;background:#16a34a;box-shadow:0 6px 18px rgba(22,163,74,.28)}
.ct-motivos{margin:0;padding:10px 12px 10px 30px;color:#7a4a00;font-size:13.5px;background:#fff8db;border:1px solid #f2cf63;border-radius:10px}.ct-msg{border-radius:10px;padding:9px 12px;font-weight:600}.ct-msg-e{background:#fdecec;color:#991b1b}.ct-msg-k{background:#e7f6ec;color:#15803d}
@media(min-width:720px){.ct-pie{grid-template-columns:minmax(0,1fr) auto;align-items:end}}`;
    document.head.appendChild(s);
  }
  /** Presentación con el nombre legible de la página (p. ej. «2.5 L» en vez de Pack_Regular_2.5Lx6und). */
  const presTxt = (c, t) => { try{ if(typeof nombrePresentacionUI === 'function') return nombrePresentacionUI(c.linea, t.marca, t.presentacion) || t.presentacion; }catch(_){ } return String(t.presentacion || '').replace(/_/g, ' '); };
  const fmtMin = n => fmt(n) + ' min';
  const fmtRatio = r => r === null || r === undefined ? '—' : fmt(r) + ' und/h';
  const fmtH = h => (Math.round(num(h) * 100) / 100).toFixed(2) + ' h';
  function paradasHtml(lista){
    const p = PT();
    return lista.map(x => {
      const e = p ? p.etiqueta(x) : (x.tipo === 'PROGRAMADA' ? 'P' : 'NP');
      const cls = e === 'CAMBIO' ? 'cb' : e === 'P' ? 'p' : 'np', lab = e === 'CAMBIO' ? 'CAMB' : e;
      return `<div class="ct-p"><span class="ct-tag ct-tag-${cls}">${lab}</span><span>${esc(x.horaInicio || '—')} ${esc(x.descripcion || '')}${x.equipo ? ' · ' + esc(x.equipo) : ''}${x.partes ? ` <small class="ct-sub">(parte ${x.parte} de ${x.partes})</small>` : ''}${x.asignacion === 'MANUAL' ? ' <small class="ct-sub">· elegida a mano</small>' : ''}</span><b>${fmtMin(x.minutos)}</b></div>`;
    }).join('');
  }
  const kpis = (r, lista) => `<div class="ct-kpis"><div class="ct-kpi"><small>Paradas de la marca</small><b>${lista.length} · ${fmtMin(r ? r.paradasMin : 0)}</b></div><div class="ct-kpi"><small>Ratio de la marca</small><b>${fmtRatio(r && r.ratio)}</b></div></div>`;
  function confirmacionHtml(c, M, i, idS){
    const t = M.V[i], r = M.R[i], lista = M.A.porTramo[i], k = clave(c) + '|' + t.id, rev = S.revisado[k] === true;
    const desde = PT() ? PT().hhmm(t.inicioMs) : '', hasta = horaAhora(), ac = acumuladoDe(c, t);
    const saldo = S.saldo[idS] === undefined || S.saldo[idS] === '' ? '0' : S.saldo[idS];
    const detProg = [r.cambio ? 'cambio' : '', lista.some(x => x.tipo === 'PROGRAMADA' && !PT().esCambio(x)) ? 'otras programadas' : ''].filter(Boolean).join(' + ');
    return `<div class="ct-conf" role="dialog" aria-label="Confirmar cierre de ${esc(t.marca)}"><h5>CONFIRMAR CIERRE DE MARCA</h5>
      <div class="ct-mar">Cerrar ${esc(t.marca)} ${esc(presTxt(c, t))}</div><div class="ct-sub">Hora de corte ${esc(hasta)} · ${fmt(paletasDelTramo(M.L, i, ac))} paletas completas · saldo ${fmt(saldo)} paq</div>
      <div class="ct-fila"><span>Tiempo del tramo (${esc(desde)}–${esc(hasta)})</span><b>${fmtMin(r.minutos)}</b></div>
      <div class="ct-fila"><span>Paradas programadas${detProg ? ' (' + esc(detProg) + ')' : ''}</span><b>${fmtMin(r.prog)}</b></div>
      <div class="ct-fila"><span>Paradas no programadas</span><b>${fmtMin(r.noprog)}</b></div>
      <div class="ct-fila f"><span>Horas efectivas</span><b>${fmtH(r.horas)}</b></div>
      <div class="ct-fila f"><span>Producción</span><b>${fmt(r.produccion)} und</b></div>
      <div class="ct-fila f r"><span>Ratio de la marca</span><b>${fmtRatio(r.ratio)}</b></div>
      ${lista.length ? `<div class="ct-ps">${paradasHtml(lista)}</div>` : '<div class="ct-sub">Sin paradas en esta marca.</div>'}
      <label class="ct-check"><input type="checkbox" ${rev ? 'checked' : ''} onchange="ctRevisado('${esc(k)}',this.checked)"> Revisé las paradas de esta marca</label>
      <div class="ct-acc"><button type="button" class="ct-btn ct-btn-o" onclick="ctParada('${esc(String(t.id))}')">+ Agregar parada</button>
        <button type="button" class="ct-btn" onclick="ctConfirmarCerrar('${esc(String(t.id))}')" ${rev && !S.ocupado ? '' : 'disabled'}>${S.ocupado === String(t.id) ? 'Cerrando…' : 'Cerrar marca'}</button>
        <button type="button" class="ct-btn ct-btn-o ct-ancho" onclick="ctCancelarCierre()">Cancelar</button></div></div>`;
  }
  function html(){
    const c = ctxActual(); if(!c) return '';
    const e = S.porTurno.get(clave(c));
    // Solo la PRIMERA vez se pide al servidor. Mientras la respuesta tarda, cargar() devuelve enseguida y volver a pintar aquí
    // formaba un ciclo sin fin que congelaba la pestaña Paletas (27/11/2026). cargar() registra el turno antes de esperar la red.
    if(!e){ cargar(c).then(pintar); }
    enVivo(c);
    const M = modelo(c), L = M.L, cola = colaEstado(), ok = puede(), enviado = !!(e && e.cierre);
    const cab = cabecera({ tramos: L, pendientes: cola.pendientes, rechazados: cola.rechazados, enviado, enLinea: navigator.onLine });
    const k = clave(c), ultimo = L[L.length - 1];
    const revUlt = ultimo && ultimo.estado !== 'cerrado' ? S.revisado[k + '|' + ultimo.id] === true : undefined;
    const val = validarEnvio({ tramos: L, pendientes: cola.pendientes, rechazados: cola.rechazados, enviado, puede: ok, sinServidor: !!(e && e.falta), saldoUltimo: ultimo ? S.saldo[k + '|' + ultimo.id] : '',
      paradasPendientes: M.bloquean.length, revisadoUltimo: revUlt });
    const tarjeta = t => {
      const i = t.i, idS = k + '|' + t.id, r = M.R[i], lp = M.A.porTramo[i] || [], ac = acumuladoDe(c, t);
      const fin = typeof textoFinTramoPaletas === 'function' ? textoFinTramoPaletas(t) : '';
      const v = M.V[i] || {}, desde = PT() && v.inicioMs ? PT().hhmm(v.inicioMs) : '';
      let previo = '';
      if(i > 0 && PT()){ lp.filter(x => PT().esCambio(x)).forEach(x => {
        const a = x.horaInicio || '', b = x.horaFin || (a && PT() ? PT().hhmm(PT().hms(c.fecha, a, c.turno) + num(x.minutos) * 60000) : '');
        previo += `<div class="ct-cambio"><b>⇄ Cambio ${esc(L[i - 1].marca)} → ${esc(t.marca)}</b>${a ? ' · ' + esc(a) + (b ? ' – ' + esc(b) : '') : ''} · ${fmtMin(x.minutos)}<br>Programada · se carga a la marca que entra (${esc(t.marca)})</div>`; }); }
      const titulo = `<div class="ct-mar">${i + 1} · ${esc(t.marca)} <span class="ct-sub">${esc(presTxt(c, t))}</span></div>`;
      if(t.estado === 'cerrado'){
        const f = t.cierre, ultimoCerrado = !L.slice(i + 1).some(x => x.estado === 'cerrado');
        return previo + `<div class="ct-t cerrado"><div class="ct-cab"><div>${titulo}<div class="ct-sub">${esc(desde)} – ${esc(f.hora_corte)} · ${fmt(f.paletas_tramo)} paleta${num(f.paletas_tramo) === 1 ? '' : 's'} · saldo ${fmt(f.saldo_paquetes)} paq${f.cerrado_por ? ' · cerró ' + esc(f.cerrado_por) : ''}</div></div><span class="ct-badge ct-b-ok">✓ Cerrado ${esc(f.hora_corte)}</span></div>
          ${kpis(r, lp)}${lp.length ? `<div class="ct-ps">${paradasHtml(lp)}</div>` : ''}
          ${ok && !enviado ? `<div class="ct-acc"><button type="button" class="ct-btn ct-btn-o" onclick="ctParada('${esc(String(t.id))}')">+ Parada olvidada a ${esc(t.marca)}</button>${ultimoCerrado ? `<button type="button" class="ct-btn ct-btn-o" onclick="ctReabrir('${esc(String(t.id))}')">Reabrir</button>` : ''}</div>` : ''}</div>`;
      }
      if(t.estado === 'activo'){
        const esUlt = i === L.length - 1, deTramo = paletasDelTramo(L, i, ac), conf = S.confirmar === idS;
        return previo + `<div class="ct-t activo"><div class="ct-cab"><div>${titulo}<div class="ct-sub">${esc(desde || '')} – ahora · ${esc(fin)} · Acumulado <b>${fmt(ac)}</b> paleta${ac === 1 ? '' : 's'} completa${ac === 1 ? '' : 's'}${deTramo !== ac ? ` (este tramo: <b>${fmt(deTramo)}</b>)` : ''}</div></div><span class="ct-badge ct-b-act">En curso</span></div>
          ${kpis(r, lp)}${lp.length && !conf ? `<div class="ct-ps">${paradasHtml(lp)}</div>` : ''}
          ${ok && !enviado ? (conf ? confirmacionHtml(c, M, i, idS) : `<div class="ct-acc"><label>Saldo (paq)<input type="number" min="0" step="1" inputmode="numeric" placeholder="0" value="${esc(S.saldo[idS] === undefined ? '' : S.saldo[idS])}" oninput="ctSaldo('${esc(idS)}',this.value)" aria-label="Saldo en paquetes de ${esc(t.marca)}"></label>
            <button type="button" class="ct-btn ct-btn-o" style="align-self:end" onclick="ctParada('${esc(String(t.id))}')">+ Parada a ${esc(t.marca)}</button>
            ${esUlt ? '<span class="ct-sub ct-ancho">Última marca: se cierra con «Enviar cierre de turno».</span>' : `<button type="button" class="ct-btn ct-ancho" onclick="ctCerrar('${esc(String(t.id))}')" ${S.ocupado ? 'disabled' : ''}>Cerrar marca</button>`}</div>`) : ''}</div>`;
      }
      return previo + `<div class="ct-t espera"><div class="ct-cab"><div>${titulo}<div class="ct-sub">${esc(fin)} · ${lp.length ? lp.length + ' parada(s)' : 'Sin paradas todavía'}</div></div><span class="ct-badge ct-b-esp">En espera</span></div></div>`;
    };
    const pend = M.A.pendientes, pendMin = pend.reduce((s, x) => s + num(x.minutos), 0);
    const pendHtml = pend.length ? `<div class="ct-pend" role="alert"><div><b>⚠ ${pend.length} parada${pend.length === 1 ? '' : 's'} sin marca</b><small>${pend.map(x => esc(x.descripcion || 'Parada') + ' · ' + fmtMin(x.minutos) + (x.horaInicio ? '' : ' (sin hora)')).join(' · ')}${M.bloquean.length ? '' : ' — turno anterior: no bloquea'}</small></div>${ok && !enviado ? '<button type="button" class="ct-btn ct-btn-o" onclick="ctAsignar()">Asignar</button>' : ''}</div>` : '';
    const TT = M.TT;
    const totalHtml = TT && L.length ? `<div class="ct-total"><div class="ct-cab"><b style="color:#0B3A5C">Total turno (suma de marcas)</b><span class="ct-sub">hasta ${esc(horaAhora())}</span></div>
      <div class="ct-kpis"><div class="ct-kpi"><small>Paradas</small><b>${TT.n} · ${fmtMin(TT.paradasMin)}</b></div><div class="ct-kpi"><small>Ratio turno</small><b>${fmtRatio(TT.ratio)}</b></div></div>
      <div class="ct-sub">Producción ${fmt(TT.produccion)} und · Horas efectivas ${fmtH(TT.horas)} · Programadas ${fmtMin(TT.prog)} · No programadas ${fmtMin(TT.noprog)}${pendMin ? ' (incluye ' + fmtMin(pendMin) + ' sin marca)' : ''}</div></div>` : '';
    const ultRev = ultimo && ultimo.estado === 'activo' && ok && !enviado ? `<label class="ct-check"><input type="checkbox" ${revUlt ? 'checked' : ''} onchange="ctRevisado('${esc(k + '|' + ultimo.id)}',this.checked)"> Revisé las paradas de ${esc(ultimo.marca)} (última marca)</label>` : '';
    const enviadoHtml = enviado ? `<div class="ct-msg ct-msg-k">Cierre enviado por <b>${esc(e.cierre.closed_by || '—')}</b> a las ${esc(new Date(e.cierre.closed_at).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false }))} · ${fmt(e.cierre.total_paletas)} paletas · saldo ${fmt(e.cierre.total_saldo)} paq${e.cierre.observaciones ? ' · ' + esc(e.cierre.observaciones) : ''}</div>` : '';
    return `<div class="panel-body ct" id="ct-panel" style="border-top:1px solid #e3e9ee;">
      <h4 style="margin:0;color:#033350;">Cierre de turno</h4>
      <div class="ct-franja ct-${cab.nivel}" role="status"><b>${cab.nivel === 'ok' ? '✔ ' : cab.nivel === 'enviado' ? '✉ ' : '⚠ '}${esc(cab.mensaje)}</b>
        <span class="ct-chip">${cab.pendientes} pendiente${cab.pendientes === 1 ? '' : 's'} por subir</span><span class="ct-chip">${cab.cerradas} de ${cab.total} marca${cab.total === 1 ? '' : 's'} cerrada${cab.cerradas === 1 ? '' : 's'}</span></div>
      ${pendHtml}
      ${e && e.error ? `<div class="ct-msg ct-msg-e">${esc(e.error)}</div>` : ''}${S.msg ? `<div class="ct-msg ${S.msg.ok ? 'ct-msg-k' : 'ct-msg-e'}">${esc(S.msg.texto)}</div>` : ''}${enviadoHtml}
      ${L.length ? `<div class="ct-tarjetas">${L.map(tarjeta).join('')}</div>` : ''}
      ${totalHtml}
      ${ok && !enviado && L.length ? `${ultRev}<div class="ct-pie"><textarea placeholder="Observaciones del turno (opcional)" maxlength="1000" oninput="ctObs('${esc(k)}',this.value)" aria-label="Observaciones del cierre">${esc(S.obs[k] || '')}</textarea>
        <button type="button" class="ct-btn ct-enviar" onclick="ctEnviar()" ${val.ok && !S.ocupado ? '' : 'disabled'}>${S.ocupado === 'ENVIO' ? 'Enviando…' : 'Enviar cierre de turno'}</button></div>
        ${val.ok ? '' : `<ul class="ct-motivos" aria-label="Por qué no se puede enviar">${val.motivos.map(m => `<li>${esc(m)}</li>`).join('')}</ul>`}` : ''}
    </div>`;
  }
  function pintar(){
    const el = document.getElementById('ct-panel');
    if(!el) return;
    estilos();
    const tmp = document.createElement('div'); tmp.innerHTML = html();
    const nuevo = tmp.firstElementChild; if(nuevo) el.replaceWith(nuevo);
    S.sucio = false;
  }
  /* Tiempo real: si alguien escribe en el panel (saldo, observaciones) no se le quita el foco; se repinta al salir del campo. */
  function pintarSuave(){
    const el = document.getElementById('ct-panel'); if(!el) return;
    const a = document.activeElement;
    if(a && el.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)){ S.sucio = true; return; }
    pintar();
  }
  document.addEventListener('focusout', ev => { const el = document.getElementById('ct-panel'); if(S.sucio && el && el.contains(ev.target)) setTimeout(pintarSuave, 0); });
  function enVivo(c){
    const p = PT(); if(!p) return;
    if(!S.enVivo){ S.enVivo = true; p.alCambiar(pintarSuave); setInterval(pintarSuave, 30000); }
    p.escucharAvances();
    p.escucharServidor(c.linea, () => { const cc = ctxActual(); if(cc && cc.linea === c.linea) cargar(cc, true).then(pintarSuave); });
  }
  const secAnterior = htmlSecuenciaTurnoPaletas;
  htmlSecuenciaTurnoPaletas = function(){
    const base = secAnterior.apply(this, arguments);
    try{ estilos(); return base + html(); }catch(e){ console.warn('Cierre de turno:', e && e.message || e); return base; }
  };
  const q0 = Q(); if(q0 && typeof q0.alCambiar === 'function') q0.alCambiar(() => pintarSuave());      // pendientes por subir en vivo
  W.addEventListener('online', pintarSuave); W.addEventListener('offline', pintarSuave);

  /* ---------- acciones ---------- */
  W.ctSaldo = (id, v) => { S.saldo[id] = v; };
  W.ctObs = (k, v) => { S.obs[k] = v; };
  W.ctRevisado = (k, v) => { S.revisado[k] = !!v; pintar(); };
  async function rpc(nombre, args){
    const cl = cliente(); if(!cl) throw new Error('Supabase no está disponible.');
    const r = await cl.rpc(nombre, args);
    if(r && r.error) throw Object.assign(new Error(r.error.message || 'Error'), { code: r.error.code });
    return r ? r.data : null;
  }
  W.ctParada = id => { const c = ctxActual(); if(c && typeof avAbrirParadas === 'function') avAbrirParadas(c.linea, c.fecha, c.turno, { tramoId: String(id) }); };
  W.ctAsignar = () => { const c = ctxActual(); if(c && typeof avAbrirParadas === 'function') avAbrirParadas(c.linea, c.fecha, c.turno, { pendientes: true }); };
  W.ctCancelarCierre = () => { S.confirmar = ''; pintar(); };
  /* «Cerrar marca»: primero la confirmación con el resumen de paradas de la marca (y la casilla obligatoria). */
  W.ctCerrar = id => {
    const c = ctxActual(); if(!c || S.ocupado || !puede()) return;
    const idS = clave(c) + '|' + id, saldo = S.saldo[idS] === undefined || S.saldo[idS] === '' ? '0' : S.saldo[idS];
    if(!(Number.isInteger(Number(saldo)) && Number(saldo) >= 0)){ S.msg = { ok: false, texto: 'El saldo debe ser un entero mayor o igual a 0.' }; pintar(); return; }
    S.confirmar = idS; S.revisado[idS] = false; S.msg = null; pintar();
  };
  W.ctConfirmarCerrar = async id => {
    const c = ctxActual(); if(!c || S.ocupado || !puede()) return;
    const M = modelo(c), L = M.L, i = L.findIndex(t => String(t.id) === String(id)); if(i < 0) return;
    const t = L[i], idS = clave(c) + '|' + t.id, saldo = S.saldo[idS] === undefined || S.saldo[idS] === '' ? '0' : S.saldo[idS];
    if(S.revisado[idS] !== true){ S.msg = { ok: false, texto: 'Marca «Revisé las paradas de esta marca» para cerrarla.' }; pintar(); return; }
    S.ocupado = String(id); S.msg = null; pintar();
    try{
      const q = Q();
      await rpc('cierre_tramo_cerrar', { p: payloadCerrar(c, L, i, { hora: horaAhora(), acumulado: acumuladoDe(c, t), saldo, evento: q ? q.uuid() : (crypto.randomUUID && crypto.randomUUID()), revisadas: true, resumen: M.R[i] }) });
      S.msg = { ok: true, texto: t.marca + ' cerrada ✓' + (L[i + 1] ? ' · sigue ' + L[i + 1].marca : '') };
      S.confirmar = '';
      await cargar(c, true);
      S.ocupado = '';
      if(typeof renderPaletasTab === 'function') renderPaletasTab(); else pintar();      // la captura pasa a la siguiente marca
    }catch(e){ S.ocupado = ''; S.msg = { ok: false, texto: 'No se cerró: ' + msgError(e).texto }; await cargar(c, true); pintar(); }
  };
  W.ctReabrir = async id => {
    const c = ctxActual(); if(!c || S.ocupado || !puede()) return;
    const motivo = W.prompt ? W.prompt('Motivo para reabrir esta marca (mínimo 5 caracteres):', '') : '';
    if(!motivo) return;
    S.ocupado = 'REABRIR'; pintar();
    try{ await rpc('cierre_tramo_reabrir', { p_linea: c.linea, p_fecha: c.fecha, p_turno: c.turno, p_tramo_id: String(id), p_motivo: motivo }); S.msg = { ok: true, texto: 'Marca reabierta.' }; }
    catch(e){ S.msg = { ok: false, texto: 'No se reabrió: ' + msgError(e).texto }; }
    S.ocupado = ''; await cargar(c, true); if(typeof renderPaletasTab === 'function') renderPaletasTab(); else pintar();
  };
  W.ctEnviar = async () => {
    const c = ctxActual(); if(!c || S.ocupado || !puede()) return;
    const k = clave(c), M = modelo(c), L = M.L, cola = colaEstado(), e = S.porTurno.get(k) || {};
    const u = L[L.length - 1], saldo = u ? (S.saldo[k + '|' + u.id] === undefined || S.saldo[k + '|' + u.id] === '' ? '0' : S.saldo[k + '|' + u.id]) : '0';
    const revUlt = u && u.estado !== 'cerrado' ? S.revisado[k + '|' + u.id] === true : undefined;
    const v = validarEnvio({ tramos: L, pendientes: cola.pendientes, rechazados: cola.rechazados, enviado: !!e.cierre, puede: true, sinServidor: !!e.falta, saldoUltimo: saldo, paradasPendientes: M.bloquean.length, revisadoUltimo: revUlt });
    if(!v.ok){ S.msg = { ok: false, texto: v.motivos.join(' ') }; pintar(); return; }
    S.ocupado = 'ENVIO'; S.msg = null; pintar();
    const q = Q(); e.eventoEnvio = e.eventoEnvio || (q ? q.uuid() : crypto.randomUUID());      // el mismo evento si se reintenta (respuesta perdida)
    try{
      const r = await rpc('cierre_turno_enviar', { p: payloadEnviar(c, L, { evento: e.eventoEnvio, pendientes: cola.pendientes, observaciones: S.obs[k], hora: horaAhora(), acumulado: u ? acumuladoDe(c, u) : 0, saldo, ahoraMs: ahoraMs(),
        paradasPendientes: M.bloquean.length, revisadoUltimo: !!revUlt, resumenUltimo: u ? M.R[L.length - 1] : null }) });
      S.msg = { ok: true, texto: 'Cierre de turno enviado ✓ · ' + fmt(r && r.total_paletas) + ' paletas · saldo ' + fmt(r && r.total_saldo) + ' paq' };
    }catch(err){ S.msg = { ok: false, texto: 'No se envió: ' + msgError(err).texto }; }
    S.ocupado = ''; await cargar(c, true); pintar();
  };
  /** Tramos del turno con su ventana y estado (para el modal «Agregar paradas» de 29). */
  function tramosTurno(c){ const M = modelo(c); return { V: M.V, A: M.A, R: M.R }; }
  W.glacialCierreMarcas = Object.assign({ cargar, html, pintar, estado: S, modelo, tramosTurno, inicioTurnoMs }, NUCLEO);
})(typeof window !== 'undefined' ? window : globalThis);
