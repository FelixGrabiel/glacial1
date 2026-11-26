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
    const ult = lista[lista.length - 1];
    if(ult && ult.estado !== 'cerrado'){ const s = o.saldoUltimo; if(!(s === '' || s === undefined || s === null || (Number.isInteger(Number(s)) && Number(s) >= 0))) m.push('El saldo de ' + ult.marca + ' debe ser un entero ≥ 0.'); }
    return { ok: !m.length, motivos: m };
  }
  const secuenciaPayload = lista => (lista || []).map(t => ({ tramo_id: String(t.id), marca: t.marca, presentacion: t.presentacion }));
  const enteroSaldo = s => (s === '' || s === undefined || s === null) ? 0 : Math.max(0, Math.round(Number(s)));
  function payloadCerrar(ctx, lista, i, o){
    const t = lista[i];
    return { linea: ctx.linea, fecha: ctx.fecha, turno: ctx.turno, secuencia: secuenciaPayload(lista), tramo_id: String(t.id), hora_corte: o.hora,
      paletas_acumuladas: Math.max(0, Math.round(num(o.acumulado))), paletas_tramo: paletasDelTramo(lista, i, o.acumulado), saldo_paquetes: enteroSaldo(o.saldo), client_event_id: o.evento };
  }
  function payloadEnviar(ctx, lista, o){
    const p = { linea: ctx.linea, fecha: ctx.fecha, turno: ctx.turno, secuencia: secuenciaPayload(lista), client_event_id: o.evento, pendientes: num(o.pendientes),
      observaciones: String(o.observaciones || '').trim().slice(0, 1000), capturado_en: new Date(num(o.ahoraMs) || Date.now()).toISOString() };
    const k = lista.length - 1, ult = lista[k];
    if(ult && ult.estado !== 'cerrado') p.ultimo = { hora_corte: o.hora, paletas_acumuladas: Math.max(0, Math.round(num(o.acumulado))), paletas_tramo: paletasDelTramo(lista, k, o.acumulado), saldo_paquetes: enteroSaldo(o.saldo), client_event_id: o.eventoUltimo || undefined };
    return p;
  }
  const NUCLEO = { estadoTramos, paletasDelTramo, cabecera, validarEnvio, payloadCerrar, payloadEnviar, secuenciaPayload };
  if(typeof module !== 'undefined' && module.exports) module.exports = NUCLEO;
  if(typeof window === 'undefined' || !root.document) return;

  /* ================== PÁGINA ================== */
  const W = root;
  if(typeof htmlSecuenciaTurnoPaletas !== 'function' || typeof tramosSecuenciaTurnoPaletas !== 'function') return;
  const Q = () => W.glacialPaletasCola || null;
  const esc = v => (typeof escaparHtml === 'function') ? escaparHtml(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Math.round(num(n)).toLocaleString('es-PE');
  const S = { porTurno: new Map(), saldo: {}, obs: {}, ocupado: '', msg: null };
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

  /* ---------- pantalla ---------- */
  function estilos(){
    if(document.getElementById('ct-estilos')) return;
    const s = document.createElement('style'); s.id = 'ct-estilos';
    s.textContent = `.ct{display:grid;gap:12px}.ct-franja{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;border-radius:12px;padding:12px 14px;font-weight:700}
.ct-ok{background:#e7f6ec;border:1px solid #9fd8b3;color:#14532d}.ct-aviso{background:#fff7e6;border:1px solid #f5c26b;color:#7a4a00}.ct-enviado{background:#e8f1fb;border:1px solid #b7d3ee;color:#0b4f8a}
.ct-franja b{font-size:16px}.ct-chip{background:rgba(255,255,255,.7);border-radius:999px;padding:3px 10px;font-size:12.5px;font-weight:700}
.ct-tarjetas{display:grid;gap:10px}.ct-t{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:10px 14px;align-items:center;border:1px solid #dce5eb;border-radius:12px;padding:12px 14px;background:#fff}
.ct-t .ct-n{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;background:#eef4f9;color:#0877A6}
.ct-t.cerrado{background:#f6fbf8;border-color:#b7e4c7}.ct-t.cerrado .ct-n{background:#16a34a;color:#fff}.ct-t.activo{border:2px solid #0877A6;box-shadow:0 4px 14px rgba(8,119,166,.12)}.ct-t.espera{opacity:.7}
.ct-mar{font-weight:800;color:#033350;font-size:15px}.ct-sub{font-size:12.5px;color:#587087}.ct-badge{display:inline-block;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:800}
.ct-b-ok{background:#16a34a;color:#fff}.ct-b-act{background:#0877A6;color:#fff}.ct-b-esp{background:#e8eef4;color:#587087}
.ct-acc{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;justify-content:flex-end}.ct-acc label{display:grid;gap:3px;font-size:11.5px;font-weight:700;color:#587087}
.ct-acc input{width:92px;min-height:44px;font-size:18px;font-weight:700;text-align:center;border:1px solid #9fc4dc;border-radius:10px}
.ct-btn{min-height:48px;padding:0 18px;border-radius:12px;border:0;background:#0877A6;color:#fff;font:inherit;font-weight:800;font-size:15px;cursor:pointer}.ct-btn:disabled{opacity:.5;cursor:not-allowed}
.ct-btn-o{background:#fff;color:#0877A6;border:1px solid #9fc4dc;min-height:36px;font-size:13px;padding:0 12px}
.ct-pie{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between}.ct-pie textarea{flex:1 1 260px;min-height:54px;border:1px solid #cddfec;border-radius:10px;padding:8px 10px;font:inherit}
.ct-enviar{min-height:60px;padding:0 28px;font-size:18px;border-radius:14px;background:#16a34a;box-shadow:0 6px 18px rgba(22,163,74,.28)}
.ct-motivos{margin:0;padding-left:18px;color:#7a4a00;font-size:13px}.ct-msg{border-radius:10px;padding:9px 12px;font-weight:600}.ct-msg-e{background:#fdecec;color:#991b1b}.ct-msg-k{background:#e7f6ec;color:#15803d}
@media(max-width:640px){.ct-t{grid-template-columns:36px minmax(0,1fr)}.ct-acc{grid-column:1/-1;justify-content:stretch}.ct-acc .ct-btn{flex:1}.ct-enviar{width:100%}}`;
    document.head.appendChild(s);
  }
  function html(){
    const c = ctxActual(); if(!c) return '';
    const e = S.porTurno.get(clave(c));
    // Solo la PRIMERA vez se pide al servidor. Mientras la respuesta tarda, cargar() devuelve enseguida y volver a pintar aquí
    // formaba un ciclo sin fin que congelaba la pestaña Paletas (27/11/2026). cargar() registra el turno antes de esperar la red.
    if(!e){ cargar(c).then(pintar); }
    const L = lista(c), cola = colaEstado(), ok = puede(), enviado = !!(e && e.cierre);
    const cab = cabecera({ tramos: L, pendientes: cola.pendientes, rechazados: cola.rechazados, enviado, enLinea: navigator.onLine });
    const k = clave(c), ultimo = L[L.length - 1];
    const val = validarEnvio({ tramos: L, pendientes: cola.pendientes, rechazados: cola.rechazados, enviado, puede: ok, sinServidor: !!(e && e.falta), saldoUltimo: ultimo ? S.saldo[k + '|' + ultimo.id] : '' });
    const tarjeta = t => {
      const idS = k + '|' + t.id, ac = acumuladoDe(c, t);
      const fin = typeof textoFinTramoPaletas === 'function' ? textoFinTramoPaletas(t) : '';
      const cab = `<div class="ct-n">${t.estado === 'cerrado' ? '✓' : t.i + 1}</div><div><div class="ct-mar">${esc(t.marca)} <span class="ct-sub">${esc(t.presentacion)}</span></div>`;
      if(t.estado === 'cerrado'){
        const f = t.cierre, ultimoCerrado = !L.slice(t.i + 1).some(x => x.estado === 'cerrado');
        return `<div class="ct-t cerrado">${cab}<div class="ct-sub"><span class="ct-badge ct-b-ok">Cerrado ✓</span> Corte <b>${esc(f.hora_corte)}</b> · <b>${fmt(f.paletas_tramo)}</b> paleta${num(f.paletas_tramo) === 1 ? '' : 's'} · Saldo <b>${fmt(f.saldo_paquetes)}</b> paq${f.cerrado_por ? ' · ' + esc(f.cerrado_por) : ''}</div></div>
          <div class="ct-acc">${ok && ultimoCerrado && !enviado ? `<button type="button" class="ct-btn ct-btn-o" onclick="ctReabrir('${esc(String(t.id))}')">Reabrir</button>` : ''}</div></div>`;
      }
      if(t.estado === 'activo'){
        const esUlt = t.i === L.length - 1, deTramo = paletasDelTramo(L, t.i, ac);
        return `<div class="ct-t activo">${cab}<div class="ct-sub"><span class="ct-badge ct-b-act">En curso</span> ${esc(fin)} · Acumulado <b>${fmt(ac)}</b> paleta${ac === 1 ? '' : 's'} completa${ac === 1 ? '' : 's'}${deTramo !== ac ? ` (este tramo: <b>${fmt(deTramo)}</b>)` : ''}</div></div>
          <div class="ct-acc">${ok && !enviado ? `<label>Saldo (paq)<input type="number" min="0" step="1" inputmode="numeric" value="${esc(S.saldo[idS] === undefined ? '0' : S.saldo[idS])}" oninput="ctSaldo('${esc(idS)}',this.value)" aria-label="Saldo en paquetes de ${esc(t.marca)}"></label>
            ${esUlt ? '<span class="ct-sub" style="max-width:170px">Última marca: se cierra con «Enviar cierre de turno»</span>' : `<button type="button" class="ct-btn" onclick="ctCerrar('${esc(String(t.id))}')" ${S.ocupado ? 'disabled' : ''}>${S.ocupado === String(t.id) ? 'Cerrando…' : 'Cerrar marca'}</button>`}` : ''}</div></div>`;
      }
      return `<div class="ct-t espera">${cab}<div class="ct-sub"><span class="ct-badge ct-b-esp">En espera</span> ${esc(fin)}</div></div><div class="ct-acc"></div></div>`;
    };
    const enviadoHtml = enviado ? `<div class="ct-msg ct-msg-k">Cierre enviado por <b>${esc(e.cierre.closed_by || '—')}</b> a las ${esc(new Date(e.cierre.closed_at).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false }))} · ${fmt(e.cierre.total_paletas)} paletas · saldo ${fmt(e.cierre.total_saldo)} paq${e.cierre.observaciones ? ' · ' + esc(e.cierre.observaciones) : ''}</div>` : '';
    return `<div class="panel-body ct" id="ct-panel" style="border-top:1px solid #e3e9ee;">
      <h4 style="margin:0;color:#033350;">Cierre de turno</h4>
      <div class="ct-franja ct-${cab.nivel}" role="status"><b>${cab.nivel === 'ok' ? '✔ ' : cab.nivel === 'enviado' ? '✉ ' : '⚠ '}${esc(cab.mensaje)}</b>
        <span class="ct-chip">${cab.pendientes} pendiente${cab.pendientes === 1 ? '' : 's'} por subir</span><span class="ct-chip">${cab.cerradas} de ${cab.total} marca${cab.total === 1 ? '' : 's'} cerrada${cab.cerradas === 1 ? '' : 's'}</span></div>
      ${e && e.error ? `<div class="ct-msg ct-msg-e">${esc(e.error)}</div>` : ''}${S.msg ? `<div class="ct-msg ${S.msg.ok ? 'ct-msg-k' : 'ct-msg-e'}">${esc(S.msg.texto)}</div>` : ''}${enviadoHtml}
      ${L.length ? `<div class="ct-tarjetas">${L.map(tarjeta).join('')}</div>` : ''}
      ${ok && !enviado && L.length ? `<div class="ct-pie"><textarea placeholder="Observaciones del turno (opcional)" maxlength="1000" oninput="ctObs('${esc(k)}',this.value)" aria-label="Observaciones del cierre">${esc(S.obs[k] || '')}</textarea>
        <button type="button" class="ct-btn ct-enviar" onclick="ctEnviar()" ${val.ok && !S.ocupado ? '' : 'disabled'}>${S.ocupado === 'ENVIO' ? 'Enviando…' : 'Enviar cierre de turno'}</button></div>
        ${val.ok ? '' : `<ul class="ct-motivos">${val.motivos.map(m => `<li>${esc(m)}</li>`).join('')}</ul>`}` : ''}
    </div>`;
  }
  function pintar(){
    const el = document.getElementById('ct-panel');
    if(!el) return;
    estilos();
    const tmp = document.createElement('div'); tmp.innerHTML = html();
    const nuevo = tmp.firstElementChild; if(nuevo) el.replaceWith(nuevo);
  }
  const secAnterior = htmlSecuenciaTurnoPaletas;
  htmlSecuenciaTurnoPaletas = function(){
    const base = secAnterior.apply(this, arguments);
    try{ estilos(); return base + html(); }catch(e){ console.warn('Cierre de turno:', e && e.message || e); return base; }
  };
  const q0 = Q(); if(q0 && typeof q0.alCambiar === 'function') q0.alCambiar(() => pintar());      // pendientes por subir en vivo
  W.addEventListener('online', pintar); W.addEventListener('offline', pintar);

  /* ---------- acciones ---------- */
  W.ctSaldo = (id, v) => { S.saldo[id] = v; const c = ctxActual(); if(c){ const L = lista(c), u = L[L.length - 1]; if(u && id === clave(c) + '|' + u.id) pintarBoton(); } };
  W.ctObs = (k, v) => { S.obs[k] = v; };
  function pintarBoton(){ /* el botón de envío depende del saldo de la última marca */ const a = document.activeElement, id = a && a.getAttribute && a.getAttribute('aria-label'); pintar(); if(id){ const el = document.querySelector('#ct-panel [aria-label="' + id.replace(/"/g, '\\"') + '"]'); if(el){ el.focus(); try{ el.setSelectionRange(el.value.length, el.value.length); }catch(_){} } } }
  async function rpc(nombre, args){
    const cl = cliente(); if(!cl) throw new Error('Supabase no está disponible.');
    const r = await cl.rpc(nombre, args);
    if(r && r.error) throw Object.assign(new Error(r.error.message || 'Error'), { code: r.error.code });
    return r ? r.data : null;
  }
  W.ctCerrar = async id => {
    const c = ctxActual(); if(!c || S.ocupado || !puede()) return;
    const L = lista(c), i = L.findIndex(t => String(t.id) === String(id)); if(i < 0) return;
    const t = L[i], idS = clave(c) + '|' + t.id, saldo = S.saldo[idS] === undefined ? '0' : S.saldo[idS];
    if(!(Number.isInteger(Number(saldo)) && Number(saldo) >= 0)){ S.msg = { ok: false, texto: 'El saldo debe ser un entero mayor o igual a 0.' }; pintar(); return; }
    S.ocupado = String(id); S.msg = null; pintar();
    try{
      const q = Q();
      await rpc('cierre_tramo_cerrar', { p: payloadCerrar(c, L, i, { hora: horaAhora(), acumulado: acumuladoDe(c, t), saldo, evento: q ? q.uuid() : (crypto.randomUUID && crypto.randomUUID()) }) });
      S.msg = { ok: true, texto: t.marca + ' cerrada ✓' + (L[i + 1] ? ' · sigue ' + L[i + 1].marca : '') };
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
    const k = clave(c), L = lista(c), cola = colaEstado(), e = S.porTurno.get(k) || {};
    const u = L[L.length - 1], saldo = u ? (S.saldo[k + '|' + u.id] === undefined ? '0' : S.saldo[k + '|' + u.id]) : '0';
    const v = validarEnvio({ tramos: L, pendientes: cola.pendientes, rechazados: cola.rechazados, enviado: !!e.cierre, puede: true, sinServidor: !!e.falta, saldoUltimo: saldo });
    if(!v.ok){ S.msg = { ok: false, texto: v.motivos.join(' ') }; pintar(); return; }
    S.ocupado = 'ENVIO'; S.msg = null; pintar();
    const q = Q(); e.eventoEnvio = e.eventoEnvio || (q ? q.uuid() : crypto.randomUUID());      // el mismo evento si se reintenta (respuesta perdida)
    try{
      const r = await rpc('cierre_turno_enviar', { p: payloadEnviar(c, L, { evento: e.eventoEnvio, pendientes: cola.pendientes, observaciones: S.obs[k], hora: horaAhora(), acumulado: u ? acumuladoDe(c, u) : 0, saldo, ahoraMs: ahoraMs() }) });
      S.msg = { ok: true, texto: 'Cierre de turno enviado ✓ · ' + fmt(r && r.total_paletas) + ' paletas · saldo ' + fmt(r && r.total_saldo) + ' paq' };
    }catch(err){ S.msg = { ok: false, texto: 'No se envió: ' + msgError(err).texto }; }
    S.ocupado = ''; await cargar(c, true); pintar();
  };
  W.glacialCierreMarcas = Object.assign({ cargar, html, pintar, estado: S }, NUCLEO);
})(typeof window !== 'undefined' ? window : globalThis);
