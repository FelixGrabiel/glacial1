/* =============================================================
   GLACIAL · PERSONAL › CONVOCATORIA SEMANAL · PANTALLA (27/11/2026)
   -------------------------------------------------------------
   docs/personal-tareo/convocatoria-semanal.md · núcleo: 49-convocatoria-nucleo.js · servidor: glacial_72 (convocatoria_*).
   · La arma el SUPERVISOR: edita SU turno (día o noche, según la rotación de supervisores) y ve el otro en solo lectura. Administrador y Jefatura
     editan ambos; RRHH y quien ve el resumen de producción solo miran. El servidor exige el permiso de editar y guarda el historial de cada cambio.
   · Tiempo real: canal de Supabase sobre convocatorias, convocatoria_asignaciones y equipos_trabajo → si otro supervisor mueve a alguien, se ve al instante.
   · Cada acción lleva client_event_id y pasa por una cola local: sin conexión se guarda y se reintenta (reintentar no duplica).
   · Imagen para WhatsApp (mismo formato que la de Excel: columnas TURNO DÍA / TURNO NOCHE, NUEVO en rojo, ⇄ cambio de turno, totales) con descargar y compartir.
   · Importador de transición: pegar la convocatoria del Excel → cruce con el maestro de trabajadores (los que no cruzan se unen con un toque y queda el alias).
   ============================================================= */
(function(W){
  'use strict';
  if(typeof document === 'undefined') return;
  const C = () => W.glacialConvocatoria;
  const TAB = 'convocatoria', COLA = 'glacial:convocatoria:cola';
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sb = () => W.glacialSupabaseCliente || null;
  const hoy = () => W.GlacialFecha ? W.GlacialFecha.fechaOperativa() : C().sumarDias('2000-01-03', 0);
  const S = { semana: '', col: 'DÍA', datos: null, error: '', cargando: false, abiertos: new Set(), menu: null, buscar: '', canal: null, msg: '', imagen: null, imp: null, equiposEd: false };

  /* ---------- permisos y turno del supervisor ---------- */
  const usr = () => (typeof state !== 'undefined' && state.user) || null;
  const perm = k => { try{ return typeof tienePermiso === 'function' && tienePermiso(k); }catch(_){ return false; } };
  const ROLES_VER = ['Administrador', 'Supervisor', 'Supervisor de Producción', 'Jefe de Producción', 'Jefe de Operaciones', 'Jefatura', 'Gerente General', 'Gerente'];
  function puedeVer(){ const u = usr(); return !!u && (ROLES_VER.includes(u.rol) || perm('convocatoria') || perm('tareoGeneral') || perm('moduloRRHH') || perm('tareoProduccion')); }
  const cap = () => (S.datos && S.datos.permisos) || { ver: false, editar: false, jefe: false };
  /** Columna que edita el supervisor: la de su turno en la rotación (Día / Noche). Sin rotación: las dos (se avisa). Jefatura/Admin: las dos. */
  function columnaSupervisor(){
    if(cap().jefe) return 'AMBAS';
    try{
      const V = W.glacialVentanaSupervisor; const st = V && typeof V.estado === 'function' ? V.estado(usr()) : null;
      const t = st && (st.actual || st.proxima || st.ultima); const nombre = t && (t.turno || '');
      if(nombre) return /noche/i.test(nombre) ? 'NOCHE' : 'DÍA';
    }catch(_){ }
    return 'AMBAS';
  }
  const editaColumna = col => cap().editar && (columnaSupervisor() === 'AMBAS' || columnaSupervisor() === col) && (!S.datos || !S.datos.convocatoria || S.datos.convocatoria.estado !== 'CERRADA' || cap().jefe);

  /* ---------- datos ---------- */
  const trabajadores = () => { try{ return typeof loadWorkers === 'function' ? (loadWorkers() || []) : []; }catch(_){ return []; } };
  /** Convocatoria en el formato del núcleo (desde la respuesta del servidor + la cola local pendiente). */
  function convDe(d){
    if(!d) return null;
    const c = d.convocatoria || {};
    const asign = (d.asignaciones || []).map(x => ({ id: x.id, trabajadorId: x.trabajador_id, nombre: x.nombre, equipoId: x.equipo_id || '', bloque: x.bloque || '', columna: x.columna, orden: x.orden, hasta: x.hasta_fecha || '' }));
    return { semana: S.semana, estado: c.estado || 'BORRADOR', version: c.version || 0, nuevoSemanas: c.nuevo_semanas, publicadaPor: c.publicada_por, publicadaEn: c.publicada_en, asignaciones: asign };
  }
  const anteriorDe = d => d && d.anterior ? { semana: C().sumarDias(S.semana, -7), estado: d.anterior.convocatoria.estado, asignaciones: (d.anterior.asignaciones || []).map(x => ({ trabajadorId: x.trabajador_id, equipoId: x.equipo_id || '', bloque: x.bloque || '', columna: x.columna })) } : null;
  const equiposDe = d => C().equiposDe((d && d.equipos || []).map(e => ({ id: e.id, nombre: e.nombre, columna: e.columna, turnoBase: e.turno_base, inicio: e.hora_inicio, fin: e.hora_fin, minimo: e.minimo, orden: e.orden, activo: e.activo })));

  let pidiendo = null;
  async function cargar(){
    const c = sb(); if(!c || typeof c.rpc !== 'function'){ S.error = 'Sin conexión con el servidor.'; repintar(); return; }
    if(pidiendo) return pidiendo;
    S.cargando = true;
    pidiendo = (async () => {
      try{
        const r = await c.rpc('convocatoria_obtener', { p_semana: S.semana });
        if(r && r.error) throw r.error;
        S.datos = r.data; S.error = '';
        // guarda la convocatoria publicada de la semana para el Tareo prellenado (49c)
        try{ if(W.glacialConvocatoriaTareo) W.glacialConvocatoriaTareo.recordar(S.semana, convDe(S.datos), equiposDe(S.datos)); }catch(_){ }
      }catch(e){
        const m = String(e && (e.message || e.code) || e);
        S.error = /PGRST202|42883|does not exist|convocatoria_obtener/.test(m) ? 'Falta aplicar glacial_72 en este servidor.' : /42501|permiso/i.test(m) ? 'Tu usuario no tiene permiso para ver la convocatoria.' : 'No se pudo leer la convocatoria: ' + m;
      }finally{ S.cargando = false; pidiendo = null; repintar(); }
    })();
    return pidiendo;
  }
  let tCambio = 0;
  function escuchar(){
    const c = sb(); if(!c || typeof c.channel !== 'function' || S.canal) return;
    try{
      let ch = c.channel('convocatoria');
      ['convocatorias', 'convocatoria_asignaciones', 'equipos_trabajo'].forEach(t => { ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => { clearTimeout(tCambio); tCambio = setTimeout(() => { if(state.currentTab === TAB) cargar(); }, 250); }); });
      ch.subscribe(); S.canal = ch;
    }catch(_){ S.canal = null; }
  }

  /* ---------- cola de acciones (sin conexión, idempotente) ---------- */
  const uuid = () => (W.crypto && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
  const leerCola = () => { try{ return JSON.parse(localStorage.getItem(COLA) || '[]'); }catch(_){ return []; } };
  const guardarCola = l => { try{ localStorage.setItem(COLA, JSON.stringify(l.slice(-300))); }catch(_){ } };
  let vaciando = false;
  async function vaciar(){
    if(vaciando) return; const c = sb(); if(!c) return; vaciando = true;
    try{
      let l = leerCola();
      while(l.length){
        const x = l[0]; let r;
        try{ r = await c.rpc(x.fn, { p: x.p }); }catch(e){ r = { error: { message: String(e && e.message || e), red: true } }; }
        if(r && r.error){
          const red = r.error.red || /fetch|network|failed|timeout/i.test(String(r.error.message || '')) || (typeof navigator !== 'undefined' && navigator.onLine === false);
          if(red){ S.msg = 'Sin conexión: ' + l.length + ' cambio(s) se guardarán al volver la conexión.'; break; }
          S.msg = String(r.error.message || r.error).replace(/^convocatoria:\s*/i, '');      // regla del servidor: se descarta y se avisa
        }
        l = leerCola().filter(y => y.p.client_event_id !== x.p.client_event_id); guardarCola(l);
      }
    }finally{ vaciando = false; await cargar(); }
  }
  function enviar(fn, p){ p = Object.assign({ semana: S.semana, client_event_id: uuid() }, p); guardarCola(leerCola().concat([{ fn, p }])); S.menu = null; S.msg = ''; return vaciar(); }
  W.addEventListener && W.addEventListener('online', () => vaciar());

  /* ---------- acciones ---------- */
  const A = {
    poner: (trabajadorId, destino) => { const t = trabajadores().find(x => x.id === trabajadorId); return enviar('convocatoria_asignar', Object.assign({ accion: 'poner', trabajador_id: trabajadorId, nombre: t ? t.nombre : '' }, destino)); },
    mover: (id, destino) => enviar('convocatoria_asignar', Object.assign({ accion: 'mover', id }, destino)),
    quitar: id => enviar('convocatoria_asignar', { accion: 'quitar', id }),
    async estado(e){ const c = sb(); const r = await c.rpc('convocatoria_estado', { p: { semana: S.semana, estado: e } }); if(r && r.error){ S.msg = String(r.error.message || r.error).replace(/^convocatoria:\s*/i, ''); repintar(); return false; } await cargar(); return true; },
    async copiar(){ const c = sb(); const r = await c.rpc('convocatoria_copiar', { p: { semana: S.semana } }); S.msg = r && r.error ? String(r.error.message || r.error).replace(/^convocatoria:\s*/i, '') : 'Se copiaron ' + (r.data && r.data.n) + ' personas de la semana anterior.'; await cargar(); }
  };

  /* ---------- estilos ---------- */
  function estilos(){
    if(document.getElementById('cv-css')) return;
    const s = document.createElement('style'); s.id = 'cv-css';
    s.textContent = `.cv{max-width:880px;margin:0 auto;display:grid;gap:12px}.cv-cab{background:#0b3a5c;color:#fff;border-radius:16px;padding:14px 16px;display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}
#cv .cv-cab small{display:block;opacity:.8;font-size:12px;letter-spacing:.04em;color:#fff}#cv .cv-cab h2{margin:2px 0;font-size:22px;color:#fff!important;-webkit-text-fill-color:#fff}#cv .cv-cab p{margin:0;opacity:.85;font-size:13px;color:#fff}
.cv-chip{border-radius:999px;padding:4px 12px;font-weight:800;font-size:13px;background:#fdf0c4;color:#7a4a00}.cv-chip.pub{background:#d9f5e3;color:#14532d}.cv-chip.cer{background:#e5e7eb;color:#374151}
.cv-sem{display:flex;gap:6px;align-items:center}.cv-sem button{background:rgba(255,255,255,.15);border:0;color:#fff;border-radius:10px;min-width:44px;min-height:40px;font-size:18px;cursor:pointer}
.cv-fila{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.cv-b{min-height:44px;border-radius:12px;border:1.5px solid #cfdbe5;background:#fff;color:#0b3a5c;font-weight:700;font-size:15px;cursor:pointer;padding:8px 12px}
#cv .cv-b.p,#cv-modal .cv-b.p{background:#0b3a5c;color:#fff!important;-webkit-text-fill-color:#fff;border-color:#0b3a5c}.cv-b:disabled{opacity:.5;cursor:not-allowed}.cv-b.s{min-height:36px;font-size:13px;padding:4px 10px}
.cv-avisos{background:#fff7d6;border:1px solid #f2cf63;border-radius:12px;padding:10px 14px;color:#7a4a00}.cv-avisos b{display:block;margin-bottom:4px}.cv-avisos ul{margin:0;padding-left:18px}
.cv-msg{background:#eaf5fc;border:1px solid #bfdcec;border-radius:12px;padding:10px 14px;color:#0b4a6b}.cv-err{background:#fdecec;border-color:#f5b5b5;color:#991b1b}
.cv-eq{background:#fff;border:1px solid #dce5eb;border-radius:16px;padding:12px 14px}.cv-eq.drop{outline:3px dashed #0b7fb0}.cv-eqh{display:flex;justify-content:space-between;align-items:center;gap:8px}.cv-eqh h3{margin:0;font-size:16px;color:#0f2a3d}
.cv-cnt{border-radius:999px;padding:3px 10px;font-weight:800;font-size:13px;background:#d9f5e3;color:#14532d}.cv-cnt.bajo{background:#fdf0c4;color:#7a4a00}
.cv-p{display:flex;align-items:center;gap:8px;min-height:44px;border-bottom:1px dashed #e2e8f0;position:relative}.cv-p .n{width:26px;color:#64748b;font-size:13px;text-align:right}.cv-p .nom{flex:1;min-width:0;overflow-wrap:anywhere}
.cv-tag{border-radius:6px;padding:2px 7px;font-size:11.5px;font-weight:800;white-space:nowrap}.cv-tag.nuevo{background:#fde2e2;color:#b91c1c}.cv-tag.cambio{background:#ede9fe;color:#6d28d9}.cv-tag.dm{background:#fdf0c4;color:#7a4a00}.cv-tag.sindni{background:#f1f5f9;color:#475569}
.cv-dots{min-width:44px;min-height:44px;border:0;background:none;font-size:20px;color:#64748b;cursor:pointer}.cv-menu{position:absolute;right:0;top:44px;z-index:30;background:#fff;border:1px solid #cfdbe5;border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.15);padding:6px;display:grid;gap:4px;min-width:220px;max-height:60vh;overflow:auto}
.cv-menu button{min-height:40px;text-align:left;border:0;background:#f8fafc;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:14px}.cv-menu small{padding:4px 8px;color:#64748b}
.cv-mas{border:0;background:none;color:#0b7fb0;font-weight:700;min-height:40px;cursor:pointer;padding:0 4px}.cv-pie{color:#64748b;font-size:12.5px}
.cv-modal{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:900;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto}.cv-modal>div{background:#fff;border-radius:16px;padding:14px;max-width:980px;width:100%;display:grid;gap:10px}
.cv-modal img{max-width:100%;border:1px solid #e2e8f0;border-radius:8px}.cv-modal input,.cv-modal textarea,.cv-modal select{min-height:44px;border:1px solid #cfdbe5;border-radius:10px;padding:6px 10px;font:inherit;width:100%;box-sizing:border-box}
.cv-lista{display:grid;gap:4px;max-height:55vh;overflow:auto}.cv-lista button{min-height:44px;text-align:left;border:1px solid #e2e8f0;background:#fff;border-radius:10px;padding:6px 10px;cursor:pointer}
.cv-imp td,.cv-imp th{padding:4px 6px;border-bottom:1px solid #eef2f6;font-size:13px;text-align:left}.cv-imp{width:100%;border-collapse:collapse}
@media (prefers-color-scheme:dark){.cv-eq,.cv-b,.cv-modal>div,.cv-menu,.cv-lista button{background:#13222d;color:#e6eef3;border-color:#2b3f4d}.cv-eqh h3{color:#e6eef3}.cv-menu button{background:#1b2d39;color:#e6eef3}}`;
    document.head.appendChild(s);
  }

  /* ---------- pintar ---------- */
  function htmlEquipo(e, conv, ant, eqs, T, editable, avisoNuevo){
    const l = (C().porEquipo(conv, eqs).porEquipo.get(e.id) || []);
    const bajo = e.minimo > 0 && l.length < e.minimo, abierto = S.abiertos.has(e.id), MAX = 6;
    const filas = (abierto ? l : l.slice(0, MAX)).map((a, i) => {
      const t = T.get(a.trabajadorId), nombre = t ? t.nombre : (a.nombre || a.trabajadorId);
      const cambio = C().cambioDeTurno(a.trabajadorId, conv, ant, eqs);
      const tags = (C().esNuevo(t, S.semana, avisoNuevo) ? '<span class="cv-tag nuevo">NUEVO</span>' : '') +
        (cambio ? `<span class="cv-tag cambio">⇄ Viene de ${e.columna === 'DÍA' ? 'noche' : 'día'}</span>` : '') + (t && !C().dniDe(t) ? '<span class="cv-tag sindni">sin DNI</span>' : '');
      return `<div class="cv-p" data-cv-id="${a.id}" ${editable ? `draggable="true"` : ''}><span class="n">${i + 1}</span><span class="nom">${esc(nombre)} ${tags}</span>${editable ? `<button type="button" class="cv-dots" data-cv-menu="${a.id}" aria-label="Opciones de ${esc(nombre)}">⋮</button>` : ''}${S.menu === a.id ? htmlMenu(a, eqs) : ''}</div>`;
    }).join('');
    const mas = l.length > MAX && !abierto ? `<button type="button" class="cv-mas" data-cv-abrir="${e.id}">+ ${l.length - MAX} más</button>` : '';
    return `<section class="cv-eq" data-cv-equipo="${e.id}"><div class="cv-eqh"><h3>${esc(e.nombre)} · ${e.inicio}–${e.fin}</h3><span class="cv-cnt${bajo ? ' bajo' : ''}" title="convocados / mínimo">${l.length} / ${e.minimo}</span></div>
      ${filas || '<p class="cv-pie">Nadie todavía.</p>'}<div>${mas}${editable ? `${mas ? ' · ' : ''}<button type="button" class="cv-mas" data-cv-agregar="${e.id}">+ Agregar persona</button>` : ''}</div></section>`;
  }
  function htmlMenu(a, eqs){
    const otros = eqs.filter(e => e.id !== a.equipoId && editaColumna(e.columna));
    return `<div class="cv-menu" role="menu"><small>Mover a…</small>${otros.map(e => `<button type="button" data-cv-mover="${a.id}" data-cv-a="${e.id}">${esc(e.nombre)} · ${e.inicio}–${e.fin}${e.columna !== (eqs.find(x => x.id === a.equipoId) || {}).columna ? ' (' + (e.columna === 'NOCHE' ? 'noche' : 'día') + ')' : ''}</button>`).join('')}
      <small>Fuera de la convocatoria</small>${Object.keys(C().BLOQUES).map(b => `<button type="button" data-cv-bloque="${a.id}" data-cv-b="${b}">${esc(C().BLOQUES[b])}…</button>`).join('')}
      <button type="button" data-cv-quitar="${a.id}" style="color:#b91c1c">Quitar de la convocatoria</button><button type="button" data-cv-cerrar-menu="1">Cancelar</button></div>`;
  }
  function htmlBloques(conv, T, col, editable){
    const { bloques } = C().porEquipo(conv, []);
    const l = []; bloques.forEach((x, k) => x.filter(a => (a.columna || 'DÍA') === col).forEach(a => l.push(Object.assign({ k }, a))));
    if(!l.length && !editable) return '';
    return `<section class="cv-eq" data-cv-equipo="bloques"><div class="cv-eqh"><h3>Descanso médico / vacaciones / licencia</h3><span class="cv-cnt" style="background:#f1f5f9;color:#334155">${l.length}</span></div>
      ${l.map(a => { const t = T.get(a.trabajadorId); return `<div class="cv-p"><span class="nom">${esc(t ? t.nombre : (a.nombre || a.trabajadorId))} <span class="cv-tag dm">${esc(C().BLOQUES[a.k].toUpperCase())}${a.hasta ? ' hasta ' + C().ddmm(a.hasta) : ''}</span></span>${editable ? `<button type="button" class="cv-dots" data-cv-quitar="${a.id}" aria-label="Quitar">✕</button>` : ''}</div>`; }).join('') || '<p class="cv-pie">Nadie.</p>'}
      ${editable ? '<button type="button" class="cv-mas" data-cv-agregar-bloque="1">+ Agregar descanso médico / vacaciones</button>' : ''}</section>`;
  }
  function pintar(main){
    estilos();
    if(!C()){ main.innerHTML = '<div class="cv-msg cv-err">Falta cargar 49-convocatoria-nucleo.js.</div>'; return; }
    if(!S.semana) S.semana = C().lunesDe(hoy());
    const d = S.datos, conv = convDe(d) || { semana: S.semana, estado: 'BORRADOR', asignaciones: [] }, ant = anteriorDe(d), eqs = equiposDe(d), T = new Map(trabajadores().map(t => [t.id, t]));
    const tot = C().totales(conv, eqs), est = (d && d.convocatoria && d.convocatoria.estado) || 'BORRADOR';
    const avisos = d ? C().validarConvocatoria(conv, eqs, trabajadores()).filter(a => a.tipo !== 'minimo' || (eqs.find(e => e.id === a.equipoId) || {}).columna === S.col) : [];
    const editable = editaColumna(S.col), colSup = columnaSupervisor(), pend = leerCola().length;
    const fin = C().sumarDias(S.semana, 6);
    main.innerHTML = `<div class="cv" id="cv">
      <div class="cv-cab"><div><small>PERSONAL › CONVOCATORIA SEMANAL</small><h2>Semana ${C().ddmm(S.semana)} al ${C().ddmm(fin)}</h2>
        <p>${cap().editar ? (colSup === 'AMBAS' ? 'Editas los dos turnos' : 'Editas el turno ' + (colSup === 'NOCHE' ? 'noche' : 'día') + '; el otro lo ves en solo lectura') : 'Solo lectura'} · se ve en vivo en todos los equipos</p></div>
        <div style="display:grid;gap:8px;justify-items:end"><span class="cv-chip ${est === 'PUBLICADA' ? 'pub' : est === 'CERRADA' ? 'cer' : ''}">${est === 'PUBLICADA' ? 'Publicada' : est === 'CERRADA' ? 'Cerrada' : 'Borrador'}</span>
        <div class="cv-sem"><button type="button" data-cv-sem="-7" aria-label="Semana anterior">‹</button><button type="button" data-cv-sem="0" style="font-size:13px;padding:0 10px">Esta semana</button><button type="button" data-cv-sem="7" aria-label="Semana siguiente">›</button></div></div></div>
      ${S.error ? `<div class="cv-msg cv-err" role="alert">${esc(S.error)}</div>` : ''}${S.msg ? `<div class="cv-msg" role="status">${esc(S.msg)}</div>` : ''}${pend ? `<div class="cv-msg" role="status">${pend} cambio(s) por enviar…</div>` : ''}
      ${!d && !S.error ? '<div class="cv-msg">Cargando la convocatoria…</div>' : ''}
      <div class="cv-fila">${cap().editar ? `<button type="button" class="cv-b" data-cv-copiar="1" ${conv.asignaciones.length ? 'disabled title="La semana ya tiene personas"' : ''}>⧉ Copiar semana anterior</button>` : ''}<button type="button" class="cv-b" data-cv-buscar="1">🔍 Buscar persona</button></div>
      <div class="cv-fila" role="tablist">${C().COLUMNAS.map(c => `<button type="button" role="tab" aria-selected="${S.col === c}" class="cv-b${S.col === c ? ' p' : ''}" data-cv-col="${c}">Turno ${c === 'DÍA' ? 'día' : 'noche'} · ${tot[c]}</button>`).join('')}</div>
      ${avisos.length ? `<div class="cv-avisos" role="status"><b>⚠ ${avisos.length} ${avisos.length === 1 ? 'aviso' : 'avisos'}</b><ul>${avisos.slice(0, 8).map(a => `<li>${esc(a.texto)}</li>`).join('')}${avisos.length > 8 ? `<li>y ${avisos.length - 8} más…</li>` : ''}</ul></div>` : ''}
      ${eqs.filter(e => e.columna === S.col).map(e => htmlEquipo(e, conv, ant, eqs, T, editable, d && d.convocatoria && d.convocatoria.nuevo_semanas)).join('')}
      ${htmlBloques(conv, T, S.col, editable)}
      <div class="cv-fila"><button type="button" class="cv-b" data-cv-imagen="1" ${tot.total ? '' : 'disabled'}>Ver imagen WhatsApp</button>
        ${cap().editar ? (est === 'PUBLICADA' ? `<button type="button" class="cv-b" data-cv-estado="CERRADA">Cerrar semana</button>` : est === 'CERRADA' ? (cap().jefe ? `<button type="button" class="cv-b" data-cv-estado="PUBLICADA">Reabrir</button>` : '') : `<button type="button" class="cv-b p" data-cv-estado="PUBLICADA" ${tot.total ? '' : 'disabled'}>Publicar convocatoria</button>`) : ''}</div>
      ${est === 'PUBLICADA' && d.convocatoria.publicada_por ? `<p class="cv-pie">Publicada por ${esc(d.convocatoria.publicada_por)}${d.convocatoria.publicada_en ? ' · ' + new Date(d.convocatoria.publicada_en).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : ''}. Se puede seguir corrigiendo: cada cambio queda registrado. El Tareo diario se prellena con ella.</p>` : ''}
      ${cap().editar ? `<div class="cv-fila"><button type="button" class="cv-b s" data-cv-importar="1">Importar desde el Excel (transición)</button><button type="button" class="cv-b s" data-cv-equipos="1">Equipos y horarios</button></div>` : ''}
      <p class="cv-pie">«⇄» y «NUEVO» los pone el sistema solo (ya no se escribe * ni NUEVO a mano): ⇄ = la semana anterior estaba en el otro turno · NUEVO = ingresó en las últimas ${esc((d && d.convocatoria && d.convocatoria.nuevo_semanas) || C().NUEVO_SEMANAS)} semanas (fecha de ingreso del maestro de trabajadores).</p>
    </div>`;
    escuchar();
  }
  function repintar(){
    if(typeof state === 'undefined' || state.currentTab !== TAB) return;
    const m = document.getElementById('main'); if(!m) return;
    const y = W.scrollY; pintar(m); if(W.scrollTo) W.scrollTo(0, y);
  }

  /* ---------- selector de personas ---------- */
  function modal(html){ cerrarModal(); const m = document.createElement('div'); m.className = 'cv-modal'; m.id = 'cv-modal'; m.innerHTML = '<div role="dialog" aria-modal="true">' + html + '</div>'; m.addEventListener('click', e => { if(e.target === m) cerrarModal(); }); document.body.appendChild(m); return m; }
  function cerrarModal(){ const m = document.getElementById('cv-modal'); if(m) m.remove(); }
  function dondeEsta(id){ const conv = convDe(S.datos); const eqs = equiposDe(S.datos); const a = (conv && conv.asignaciones || []).find(x => x.trabajadorId === id); if(!a) return ''; if(a.bloque) return C().BLOQUES[a.bloque]; const e = eqs.find(x => x.id === a.equipoId); return e ? e.nombre + ' · ' + (e.columna === 'NOCHE' ? 'noche' : 'día') : ''; }
  function selector(titulo, alElegir, conHasta){
    const m = modal(`<h3 style="margin:0">${esc(titulo)}</h3><input type="search" id="cv-q" placeholder="Nombre o DNI" autocomplete="off">${conHasta ? '<label>Hasta (fecha de fin)<input type="date" id="cv-hasta"></label>' : ''}<div class="cv-lista" id="cv-res"></div><button type="button" class="cv-b" data-cv-cerrar="1">Cerrar</button>`);
    const q = m.querySelector('#cv-q'), res = m.querySelector('#cv-res');
    const pinta = () => { const n = C().norm(q.value); const l = trabajadores().filter(t => !C().estaDeBaja(t) && (!n || C().norm(t.nombre).includes(n) || C().dniDe(t).includes(q.value.trim()))).slice(0, 60);
      res.innerHTML = l.map(t => `<button type="button" data-cv-elige="${esc(t.id)}"><b>${esc(t.nombre)}</b> <small>${esc(C().dniDe(t) || 'sin DNI')}${dondeEsta(t.id) ? ' · ya en ' + esc(dondeEsta(t.id)) : ''}</small></button>`).join('') || '<p class="cv-pie">Sin resultados.</p>'; };
    q.addEventListener('input', pinta); pinta(); setTimeout(() => q.focus(), 50);
    m.addEventListener('click', e => { const b = e.target.closest('[data-cv-elige]'); if(b){ const h = m.querySelector('#cv-hasta'); alElegir(b.getAttribute('data-cv-elige'), h ? h.value : ''); cerrarModal(); } if(e.target.closest('[data-cv-cerrar]')) cerrarModal(); });
  }
  function buscar(){
    const m = modal(`<h3 style="margin:0">Buscar persona</h3><input type="search" id="cv-q" placeholder="Nombre o DNI"><div class="cv-lista" id="cv-res"></div><button type="button" class="cv-b" data-cv-cerrar="1">Cerrar</button>`);
    const q = m.querySelector('#cv-q'), res = m.querySelector('#cv-res');
    const pinta = () => { const n = C().norm(q.value); const l = n ? trabajadores().filter(t => C().norm(t.nombre).includes(n) || C().dniDe(t).includes(q.value.trim())).slice(0, 40) : [];
      res.innerHTML = l.map(t => `<div class="cv-p"><span class="nom"><b>${esc(t.nombre)}</b> <small>${esc(dondeEsta(t.id) || 'no convocado esta semana')}</small></span></div>`).join(''); };
    q.addEventListener('input', pinta); setTimeout(() => q.focus(), 50);
    m.addEventListener('click', e => { if(e.target.closest('[data-cv-cerrar]')) cerrarModal(); });
  }

  /* ---------- imagen para WhatsApp ---------- */
  function canvasImagen(){
    const d = S.datos, conv = convDe(d), eqs = equiposDe(d), mod = C().modeloImagen(conv, eqs, trabajadores(), anteriorDe(d), eqs, d && d.convocatoria && d.convocatoria.nuevo_semanas);
    const plano = col => { const out = []; col.forEach(b => { out.push({ cab: b.titulo }); b.filas.forEach(f => out.push(f)); }); return out; };
    const izq = plano(mod.dia), der = plano(mod.noche), filas = Math.max(izq.length, der.length);
    const ESC = 2, W0 = 1440, RH = 44, PAD = 20, N = 74, CW = (W0 - PAD * 2) / 2, top = PAD + 50 + 42;
    const H = top + filas * RH + 42 * 2 + 50;
    const cv = document.createElement('canvas'); cv.width = W0 * ESC; cv.height = H * ESC; const g = cv.getContext('2d'); g.scale(ESC, ESC);
    g.fillStyle = '#fff'; g.fillRect(0, 0, W0, H); g.strokeStyle = '#333'; g.lineWidth = 1.5; g.textBaseline = 'middle';
    const caja = (x, y, w, h, fondo) => { if(fondo){ g.fillStyle = fondo; g.fillRect(x, y, w, h); } g.strokeRect(x, y, w, h); };
    const txt = (s, x, y, o) => { o = o || {}; g.fillStyle = o.color || '#111'; g.font = (o.bold ? '700 ' : '400 ') + (o.size || 22) + 'px Arial, Helvetica, sans-serif'; g.textAlign = o.align || 'left'; g.fillText(s, x, y); return g.measureText(s).width; };
    caja(PAD, PAD, W0 - PAD * 2, 50, '#9fd3ee'); txt(mod.titulo, W0 / 2, PAD + 25, { bold: true, size: 28, align: 'center' });
    [0, 1].forEach(i => { const x = PAD + i * CW; caja(x, PAD + 50, N, 42, '#cfe7f5'); txt('N°', x + N / 2, PAD + 71, { bold: true, align: 'center' }); caja(x + N, PAD + 50, CW - N, 42, '#cfe7f5'); txt(i ? 'TURNO NOCHE' : 'TURNO DÍA', x + N + (CW - N) / 2, PAD + 71, { bold: true, align: 'center' }); });
    for(let r = 0; r < filas; r++){
      [izq[r], der[r]].forEach((f, i) => {
        const x = PAD + i * CW, y = top + r * RH;
        if(!f){ caja(x, y, N, RH); caja(x + N, y, CW - N, RH); return; }
        if(f.cab){ caja(x, y, N, RH); caja(x + N, y, CW - N, RH, '#bdbdbd'); txt(f.cab, x + N + (CW - N) / 2, y + RH / 2, { bold: true, align: 'center', size: 21 }); return; }
        caja(x, y, N, RH); caja(x + N, y, CW - N, RH); if(f.n !== '') txt(String(f.n), x + N - 10, y + RH / 2, { align: 'right' });
        let w = txt(f.nombre, x + N + 12, y + RH / 2);
        if(f.nuevo) w += txt(' NUEVO', x + N + 12 + w, y + RH / 2, { bold: true, color: '#e00000' });
        if(f.cambio) txt(' ⇄', x + N + 12 + w, y + RH / 2, { bold: true, color: '#6d28d9' });
      });
    }
    const yt = top + filas * RH;
    caja(PAD, yt, CW, 42, '#9fd3ee'); txt(mod.totales['DÍA'] + ' OPERARIOS', PAD + CW / 2, yt + 21, { bold: true, align: 'center' });
    caja(PAD + CW, yt, CW, 42, '#9fd3ee'); txt(mod.totales['NOCHE'] + ' OPERARIOS', PAD + CW * 1.5, yt + 21, { bold: true, align: 'center' });
    caja(PAD, yt + 42, W0 - PAD * 2, 42, '#9fd3ee');
    const ley = 'TOTAL ' + mod.totales.total + ' OP · ', l1 = ' = ingreso reciente · ', l2 = ' = cambió de turno';
    g.font = '700 22px Arial'; const anchos = [ley, 'NUEVO', l1, '⇄', l2].map(s => g.measureText(s).width); let x = W0 / 2 - anchos.reduce((a, b) => a + b, 0) / 2;
    [[ley, '#111'], ['NUEVO', '#e00000'], [l1, '#111'], ['⇄', '#6d28d9'], [l2, '#111']].forEach(([s, c], i) => { txt(s, x, yt + 63, { bold: true, color: c }); x += anchos[i]; });
    const u = usr(); const ahora = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    txt('Generado por GLACIAL · ' + ((u && (u.nombre || u.username)) || '') + ' · ' + ahora, PAD, yt + 84 + 22, { size: 18, color: '#555' });
    return cv;
  }
  function verImagen(){
    let cv; try{ cv = canvasImagen(); }catch(e){ S.msg = 'No se pudo armar la imagen: ' + (e && e.message || e); repintar(); return; }
    const url = cv.toDataURL('image/png'), nombre = 'Convocatoria-' + S.semana + '.png';
    S.imagen = cv;
    const m = modal(`<h3 style="margin:0">Imagen para WhatsApp</h3><img src="${url}" alt="Convocatoria de la semana"><div class="cv-fila"><a class="cv-b" style="text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center" download="${nombre}" href="${url}">Descargar PNG</a><button type="button" class="cv-b p" data-cv-compartir="1">Compartir</button><button type="button" class="cv-b" data-cv-cerrar="1">Cerrar</button></div>`);
    m.addEventListener('click', async e => {
      if(e.target.closest('[data-cv-cerrar]')) cerrarModal();
      if(e.target.closest('[data-cv-compartir]')){
        try{ const blob = await new Promise(r => cv.toBlob(r, 'image/png')); const f = new File([blob], nombre, { type: 'image/png' });
          if(navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: 'Convocatoria ' + C().ddmm(S.semana) });
          else { const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); }
        }catch(_){ /* el usuario canceló */ }
      }
    });
  }

  /* ---------- importador de transición ---------- */
  function importar(){
    const m = modal(`<h3 style="margin:0">Importar desde el Excel (transición)</h3><p class="cv-pie" style="margin:0">Copia en el Excel la tabla de la convocatoria (N°, TURNO DÍA, N°, TURNO NOCHE, con los títulos de cada equipo y su horario) y pégala aquí. Se lee «NUEVO» y «*» del nombre y se cruza con el maestro de trabajadores.</p>
      <textarea id="cv-txt" rows="8" placeholder="Pega aquí la tabla"></textarea><button type="button" class="cv-b p" data-cv-leer="1">Leer</button><div id="cv-imp-res"></div><button type="button" class="cv-b" data-cv-cerrar="1">Cerrar</button>`);
    m.addEventListener('click', async e => {
      if(e.target.closest('[data-cv-cerrar]')){ cerrarModal(); return; }
      if(e.target.closest('[data-cv-leer]')){
        const L = C().leerConvocatoriaTexto(m.querySelector('#cv-txt').value), eqs = equiposDe(S.datos);
        const destino = f => { if(f.bloque) return { bloque: f.bloque, columna: f.columna }; const e2 = eqs.find(x => x.columna === f.columna && C().norm(x.nombre) === C().norm(f.equipo)) || eqs.find(x => x.columna === f.columna && (C().norm(f.equipo).includes(C().norm(x.nombre)) || C().norm(x.nombre).includes(C().norm(f.equipo).replace(/^equipo (de )?/, '')))); return e2 ? { equipo_id: e2.id } : null; };
        const X = C().cruzarNombres(L.filas, trabajadores(), (S.datos && S.datos.alias) || {});
        S.imp = X.map(f => Object.assign({}, f, { destino: destino(f) }));
        const ts = trabajadores();
        m.querySelector('#cv-imp-res').innerHTML = `<p class="cv-pie">${S.imp.length} personas leídas · ${S.imp.filter(x => x.trabajadorId).length} cruzadas · ${S.imp.filter(x => !x.destino).length} sin equipo (créalo en «Equipos y horarios»).</p>
          <div style="overflow-x:auto"><table class="cv-imp"><thead><tr><th>Leído</th><th>Equipo</th><th>Persona del maestro</th></tr></thead><tbody>${S.imp.map((f, i) => `<tr><td>${esc(f.nombre)}${f.nuevo ? ' <span class="cv-tag nuevo">NUEVO</span>' : ''}${f.cambio ? ' <span class="cv-tag cambio">⇄</span>' : ''}</td><td>${esc(f.bloque ? C().BLOQUES[f.bloque] : f.equipo)} · ${f.columna === 'NOCHE' ? 'noche' : 'día'}${f.destino ? '' : ' <b style="color:#b91c1c">sin equipo</b>'}</td>
            <td><select data-cv-cruce="${i}"><option value="">— sin unir —</option>${(f.sugerencias.length ? f.sugerencias.map(s => ts.find(t => t.id === s.id)).filter(Boolean) : []).concat(ts).filter((t, j, a) => a.indexOf(t) === j).slice(0, 400).map(t => `<option value="${esc(t.id)}" ${t.id === f.trabajadorId ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select> <small>${f.estado === 'exacto' ? '✓' : f.estado === 'alias' ? '✓ alias' : f.estado === 'parecido' ? '≈ revisar' : 'sin cruce'}</small></td></tr>`).join('')}</tbody></table></div>
          <button type="button" class="cv-b p" data-cv-cargar="1">Cargar en la semana ${C().ddmm(S.semana)}</button>`;
      }
      if(e.target.closest('[data-cv-cargar]')){
        const l = (S.imp || []).filter(f => f.trabajadorId && f.destino); let n = 0;
        for(const f of l){
          if(f.estado !== 'exacto' && f.estado !== 'alias') await sb().rpc('trabajador_alias_guardar', { p: { alias: C().claveAlias(f.nombre), trabajador_id: f.trabajadorId } });   // se recuerda la unión para la próxima vez
          guardarCola(leerCola().concat([{ fn: 'convocatoria_asignar', p: Object.assign({ semana: S.semana, client_event_id: uuid(), accion: 'poner', trabajador_id: f.trabajadorId, nombre: f.nombre }, f.destino) }])); n++;
        }
        cerrarModal(); S.msg = 'Cargando ' + n + ' personas…'; repintar(); await vaciar(); S.msg = n + ' personas cargadas en la semana.'; repintar();
      }
    });
    m.addEventListener('change', e => { const s = e.target.closest('[data-cv-cruce]'); if(s && S.imp){ const f = S.imp[Number(s.getAttribute('data-cv-cruce'))]; f.trabajadorId = s.value; if(f.estado === 'sin' || f.estado === 'parecido') f.estado = 'manual'; } });
  }

  /* ---------- equipos y horarios ---------- */
  function editarEquipos(){
    const eqs = (S.datos && S.datos.equipos) || [];
    const fila = e => `<tr data-cv-eq="${esc(e.id)}"><td><input value="${esc(e.nombre)}" data-k="nombre" aria-label="Nombre"></td><td><select data-k="columna"><option ${e.columna === 'DÍA' ? 'selected' : ''}>DÍA</option><option ${e.columna === 'NOCHE' ? 'selected' : ''}>NOCHE</option></select></td>
      <td><select data-k="turno_base">${['DÍA', 'INTERMEDIO', 'NOCHE'].map(t => `<option ${e.turno_base === t ? 'selected' : ''}>${t}</option>`).join('')}</select></td><td><input type="time" value="${esc(e.hora_inicio)}" data-k="hora_inicio"></td><td><input type="time" value="${esc(e.hora_fin)}" data-k="hora_fin"></td>
      <td><input type="number" min="0" value="${esc(e.minimo)}" data-k="minimo" style="width:70px"></td><td><input type="checkbox" ${e.activo !== false ? 'checked' : ''} data-k="activo" style="min-height:0;width:auto"></td></tr>`;
    const m = modal(`<h3 style="margin:0">Equipos y horarios</h3><p class="cv-pie" style="margin:0">Columna = dónde sale en la imagen (día o noche). Turno base = cómo lo usa el resto del sistema (indicadores, Tareo). Mínimo = para el aviso «3 / 4».</p>
      <div style="overflow-x:auto"><table class="cv-imp"><thead><tr><th>Equipo</th><th>Columna</th><th>Turno base</th><th>Inicio</th><th>Fin</th><th>Mínimo</th><th>Activo</th></tr></thead><tbody>${eqs.map(fila).join('')}${fila({ id: '', nombre: '', columna: S.col, turno_base: S.col === 'NOCHE' ? 'NOCHE' : 'DÍA', hora_inicio: S.col === 'NOCHE' ? '21:00' : '07:00', hora_fin: S.col === 'NOCHE' ? '07:00' : '19:00', minimo: 0 })}</tbody></table></div>
      <div class="cv-fila"><button type="button" class="cv-b p" data-cv-guardar-eq="1">Guardar</button><button type="button" class="cv-b" data-cv-cerrar="1">Cerrar</button></div>`);
    m.addEventListener('click', async e => {
      if(e.target.closest('[data-cv-cerrar]')){ cerrarModal(); return; }
      if(!e.target.closest('[data-cv-guardar-eq]')) return;
      const errores = [];
      for(const tr of m.querySelectorAll('[data-cv-eq]')){
        const v = k => { const i = tr.querySelector('[data-k="' + k + '"]'); return i.type === 'checkbox' ? i.checked : i.value; };
        if(!v('nombre').trim()) continue;
        const id = tr.getAttribute('data-cv-eq') || (C().norm(v('nombre')).replace(/ /g, '-').slice(0, 30) + '-' + (v('columna') === 'NOCHE' ? 'noche' : 'dia'));
        const p = { id, nombre: v('nombre').trim(), columna: v('columna'), turno_base: v('turno_base'), hora_inicio: v('hora_inicio'), hora_fin: v('hora_fin'), minimo: Number(v('minimo')) || 0, activo: v('activo'), orden: (eqs.find(x => x.id === id) || {}).orden || eqs.length + 1 };
        const o = eqs.find(x => x.id === id); if(o && ['nombre', 'columna', 'turno_base', 'hora_inicio', 'hora_fin', 'minimo', 'activo'].every(k => String(o[k]) === String(p[k]))) continue;
        const r = await sb().rpc('equipo_trabajo_guardar', { p }); if(r && r.error) errores.push(p.nombre + ': ' + String(r.error.message || r.error).replace(/^convocatoria:\s*/i, ''));
      }
      cerrarModal(); S.msg = errores.length ? errores.join(' · ') : 'Equipos guardados.'; await cargar();
    });
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click', e => {
    const raiz = e.target.closest && e.target.closest('#cv'); if(!raiz) return;
    const g = sel => e.target.closest('[' + sel + ']'), at = (el, k) => el.getAttribute(k);
    let b;
    if((b = g('data-cv-sem'))){ const n = Number(at(b, 'data-cv-sem')); S.semana = n ? C().sumarDias(S.semana, n) : C().lunesDe(hoy()); S.datos = null; S.msg = ''; S.abiertos.clear(); repintar(); cargar(); return; }
    if((b = g('data-cv-col'))){ S.col = at(b, 'data-cv-col'); S.menu = null; repintar(); return; }
    if((b = g('data-cv-abrir'))){ S.abiertos.add(at(b, 'data-cv-abrir')); repintar(); return; }
    if((b = g('data-cv-menu'))){ const id = Number(at(b, 'data-cv-menu')); S.menu = S.menu === id ? null : id; repintar(); return; }
    if(g('data-cv-cerrar-menu')){ S.menu = null; repintar(); return; }
    if((b = g('data-cv-mover'))){ A.mover(Number(at(b, 'data-cv-mover')), { equipo_id: at(b, 'data-cv-a') }); return; }
    if((b = g('data-cv-quitar'))){ A.quitar(Number(at(b, 'data-cv-quitar'))); return; }
    if((b = g('data-cv-bloque'))){ const id = Number(at(b, 'data-cv-bloque')), k = at(b, 'data-cv-b');
      const m = modal(`<h3 style="margin:0">${esc(C().BLOQUES[k])}</h3><label>Hasta (fecha de fin)<input type="date" id="cv-hasta" value="${C().sumarDias(S.semana, 6)}"></label><div class="cv-fila"><button type="button" class="cv-b p" data-cv-ok="1">Guardar</button><button type="button" class="cv-b" data-cv-cerrar="1">Cancelar</button></div>`);
      m.addEventListener('click', ev => { if(ev.target.closest('[data-cv-ok]')){ A.mover(id, { bloque: k, columna: S.col, hasta_fecha: m.querySelector('#cv-hasta').value }); cerrarModal(); } if(ev.target.closest('[data-cv-cerrar]')) cerrarModal(); });
      return; }
    if((b = g('data-cv-agregar'))){ const eq = at(b, 'data-cv-agregar'); selector('Agregar a ' + ((equiposDe(S.datos).find(x => x.id === eq) || {}).nombre || ''), id => A.poner(id, { equipo_id: eq })); return; }
    if(g('data-cv-agregar-bloque')){ selector('Descanso médico (elige la persona y la fecha de fin)', (id, hasta) => A.poner(id, { bloque: 'DESCANSO_MEDICO', columna: S.col, hasta_fecha: hasta }), true); return; }
    if(g('data-cv-copiar')){ A.copiar(); return; }
    if(g('data-cv-buscar')){ buscar(); return; }
    if(g('data-cv-imagen')){ verImagen(); return; }
    if((b = g('data-cv-estado'))){ const est = at(b, 'data-cv-estado'); A.estado(est).then(okk => { if(okk && est === 'PUBLICADA'){ S.msg = 'Convocatoria publicada. El Tareo diario ya se prellena con ella.'; repintar(); verImagen(); } }); return; }
    if(g('data-cv-importar')){ importar(); return; }
    if(g('data-cv-equipos')){ editarEquipos(); return; }
  });
  // Arrastrar en PC: soltar a una persona sobre otro equipo la mueve
  let arrastrado = null;
  document.addEventListener('dragstart', e => { const p = e.target.closest && e.target.closest('#cv [data-cv-id]'); if(p){ arrastrado = Number(p.getAttribute('data-cv-id')); try{ e.dataTransfer.setData('text/plain', String(arrastrado)); }catch(_){ } } });
  document.addEventListener('dragover', e => { const q = e.target.closest && e.target.closest('#cv [data-cv-equipo]'); if(q && arrastrado && q.getAttribute('data-cv-equipo') !== 'bloques'){ e.preventDefault(); q.classList.add('drop'); } });
  document.addEventListener('dragleave', e => { const q = e.target.closest && e.target.closest('#cv [data-cv-equipo]'); if(q) q.classList.remove('drop'); });
  document.addEventListener('drop', e => { const q = e.target.closest && e.target.closest('#cv [data-cv-equipo]'); if(q && arrastrado){ e.preventDefault(); q.classList.remove('drop'); const eq = q.getAttribute('data-cv-equipo'); const a = (convDe(S.datos).asignaciones || []).find(x => x.id === arrastrado); if(a && a.equipoId !== eq && eq !== 'bloques') A.mover(arrastrado, { equipo_id: eq }); } arrastrado = null; });

  /* ---------- navegación ---------- */
  function ir(){
    if(!puedeVer()) return;
    if(typeof confirmarAbandonoRotacionPendiente === 'function' && !confirmarAbandonoRotacionPendiente()) return;
    state.currentTab = TAB; if(!S.semana) S.semana = C().lunesDe(hoy());
    if(typeof renderSidebar === 'function') renderSidebar();
    if(typeof renderMain === 'function') renderMain();
    cargar(); vaciar();
  }
  W.goConvocatoria = ir;
  W.glacialConvocatoriaPantalla = { estado: S, cargar, vaciar, canvasImagen, puedeVer, columnaSupervisor };
  if(typeof renderMain === 'function'){
    const a = renderMain;
    renderMain = function(){ if(state.currentTab === TAB && !state.showWelcome && puedeVer()){ pintar(document.getElementById('main')); return; } return a.apply(this, arguments); };
  }
  if(typeof renderSidebar === 'function'){
    const a = renderSidebar;
    renderSidebar = function(){
      const r = a.apply(this, arguments), v = puedeVer();
      ['btn-convocatoria', 'btn-convocatoria-rrhh'].forEach(id => { const b = document.getElementById(id); if(b){ b.hidden = !v; b.style.display = v ? '' : 'none'; b.classList.toggle('active', v && state.currentTab === TAB); } });
      if(typeof actualizarGruposSidebar === 'function') actualizarGruposSidebar();
      return r;
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
