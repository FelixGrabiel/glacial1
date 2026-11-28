/* =============================================================
   GLACIAL · PERSONAL · DESCANSOS AUTOMÁTICOS · PANTALLA (28/11/2026)
   -------------------------------------------------------------
   docs/personal-tareo/descansos-automaticos.md
   Producción (Inicio › Personal y configuración) y Recursos Humanos › Descansos.
   · Resumen: semana, estado (Propuesta / Publicada), n.º de sorteo, reglas cumplidas y «Personas trabajando por día» por equipo (domingo resaltado).
   · Cuadro «DESCANSOS TURNO DÍA / NOCHE» con el formato del Excel (N°, nombres, EQUIPO, L…D con su número, X roja, Status, fila roja de totales y fila gris
     de trabajando contra mínimos). Tocar una celda mueve la X de esa persona a ese día: si rompe una regla avisa (no bloquea) y queda auditado.
   · «Sortear» / «Volver a sortear» (49d-descansos-nucleo.js), «Publicar» (pasa a la convocatoria —columna DESC.— y al Tareo como «Descanso»).
   · Exportar: PNG (WhatsApp), Excel (.xlsx) e Imprimir / PDF. Mínimos y días sin operar: Administrador / Jefatura.
   · Tiempo real (Supabase) y cola sin conexión con client_event_id: dos supervisores (día y noche) trabajan a la vez sin pisarse.
   Servidor: glacial_73 (descansos_obtener / guardar / mover / estado, equipo_descanso_guardar, descansos_config_guardar). Personas: convocatoria (glacial_72).
   Cargar DESPUÉS de 49-convocatoria-nucleo.js, 49b-convocatoria-pantalla.js y 49d-descansos-nucleo.js.
   ============================================================= */
(function(W){
  'use strict';
  if(typeof document === 'undefined') return;
  const D = () => W.glacialDescansos, C = () => W.glacialConvocatoria;
  const TAB = 'descansos', COLA = 'glacial:descansos:cola', CACHE = 'glacial:descansos:publicados:';
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sb = () => W.glacialSupabaseCliente || null;
  const hoy = () => W.GlacialFecha ? W.GlacialFecha.fechaOperativa() : '2026-11-30';
  const S = { semana: '', col: 'DÍA', datos: null, conv: null, error: '', msg: '', avisos: [], filtro: '', canal: null, cargando: false, imagen: null };
  const usr = () => (typeof state !== 'undefined' && state.user) || null;
  const quien = () => { const u = usr(); return (u && (u.nombre || u.username)) || ''; };
  const puedeVer = () => !!(W.glacialConvocatoriaPantalla && W.glacialConvocatoriaPantalla.puedeVer());
  const cap = () => (S.datos && S.datos.permisos) || { ver: false, editar: false, jefe: false };
  function columnaSupervisor(){
    if(cap().jefe) return 'AMBAS';
    try{ const V = W.glacialVentanaSupervisor, st = V && typeof V.estado === 'function' ? V.estado(usr()) : null, t = st && (st.actual || st.proxima || st.ultima);
      if(t && t.turno) return /noche/i.test(t.turno) ? 'NOCHE' : 'DÍA'; }catch(_){ }
    return 'AMBAS';
  }
  const edita = col => cap().editar && ['AMBAS', col].includes(columnaSupervisor());
  const trabajadores = () => { try{ return typeof loadWorkers === 'function' ? (loadWorkers() || []) : []; }catch(_){ return []; } };

  /* ---------- datos ---------- */
  const equipos = () => ((S.datos && S.datos.equipos) || []).map(e => ({ id: e.id, nombre: e.nombre, columna: e.columna, turnoBase: e.turno_base, inicio: e.hora_inicio, fin: e.hora_fin,
    minimo: e.minimo, minimoDescanso: e.minimo_descanso, minimoPorDia: e.minimo_por_dia, diasSinOperar: e.dias_sin_operar || [], orden: e.orden, activo: e.activo !== false }));
  const mapAsig = x => ({ id: x.id, trabajadorId: x.trabajador_id, nombre: x.nombre, equipoId: x.equipo_id || '', bloque: x.bloque || '', columna: x.columna, orden: x.orden, hasta: x.hasta_fecha || '' });
  const conv = () => S.conv && S.conv.convocatoria ? { semana: S.semana, estado: S.conv.convocatoria.estado, asignaciones: (S.conv.asignaciones || []).map(mapAsig) } : null;
  const anterior = () => S.conv && S.conv.anterior ? { semana: D().sumarDias(S.semana, -7), asignaciones: (S.conv.anterior.asignaciones || []).map(mapAsig) } : null;
  const config = () => { const c = (S.datos && S.datos.config) || {}; return { semanasHistorial: c.semanas_historial || 8, medicoParcial: !!c.medico_parcial }; };
  const personas = col => D().personasDe(conv(), anterior(), equipos(), col, S.semana);
  const semanaDe = col => ((S.datos && S.datos.semanas) || []).find(s => s.turno === col) || null;
  /** Resultado de una columna desde el servidor (o null si aún no se sorteó). */
  function resultado(col){
    const s = semanaDe(col); if(!s) return null;
    const asig = ((S.datos && S.datos.asignaciones) || []).filter(a => a.turno === col).map(a => ({ trabajadorId: a.trabajador_id, nombre: a.nombre, equipoId: a.equipo_id || '', dia: a.dia === null || a.dia === undefined ? null : Number(a.dia),
      status: a.status, origen: a.origen, motivo: a.motivo || '', bloque: a.bloque || '', hasta: a.hasta_fecha || '', actualizadoPor: a.status === 'MANUAL' ? (a.actualizado_por || '') : '' }));
    return Object.assign({ semana: S.semana, columna: col, semilla: s.semilla, estado: s.estado, version: s.version, generadoEn: s.generado_en, publicadoPor: s.publicado_por, asignaciones: asig }, D().evaluar(asig, equipos(), col, S.semana, personas(col)));
  }

  let pidiendo = null;
  async function cargar(){
    const c = sb(); if(!c || typeof c.rpc !== 'function'){ S.error = 'Sin conexión con el servidor.'; repintar(); return; }
    if(pidiendo) return pidiendo;
    S.cargando = true;
    pidiendo = (async () => {
      try{
        const [a, b] = await Promise.all([c.rpc('descansos_obtener', { p_semana: S.semana }), c.rpc('convocatoria_obtener', { p_semana: S.semana })]);
        if(a && a.error) throw a.error; if(b && b.error) throw b.error;
        S.datos = a.data; S.conv = b.data; S.error = '';
        recordarPublicados(S.semana, S.datos);
      }catch(e){
        const m = String(e && (e.message || e.code) || e);
        S.error = /PGRST202|42883|does not exist|descansos_obtener/.test(m) ? 'Falta aplicar glacial_73 en este servidor.' : /42501|permiso/i.test(m) ? 'Tu usuario no tiene permiso para ver los descansos.' : 'No se pudieron leer los descansos: ' + m;
      }finally{ S.cargando = false; pidiendo = null; repintar(); }
    })();
    return pidiendo;
  }
  let tCambio = 0;
  function escuchar(){
    const c = sb(); if(!c || typeof c.channel !== 'function' || S.canal) return;
    try{
      let ch = c.channel('descansos');
      ['descansos_semana', 'descansos_asignacion', 'descansos_config', 'equipos_trabajo', 'convocatoria_asignaciones'].forEach(t => { ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => { clearTimeout(tCambio); tCambio = setTimeout(() => { if(typeof state !== 'undefined' && state.currentTab === TAB && !leerCola().length) cargar(); }, 250); }); });
      ch.subscribe(); S.canal = ch;
    }catch(_){ S.canal = null; }
  }

  /* ---------- cola de cambios a mano (sin conexión, idempotente) ---------- */
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
          S.msg = String(r.error.message || r.error).replace(/^descansos:\s*/i, '');
        }
        l = leerCola().filter(y => y.p.client_event_id !== x.p.client_event_id); guardarCola(l);
      }
    }finally{ vaciando = false; await cargar(); }
  }
  W.addEventListener && W.addEventListener('online', () => vaciar());

  /* ---------- acciones ---------- */
  async function sortear(col){
    if(!edita(col)) return;
    const cv = conv();
    if(!cv || !cv.asignaciones.some(a => !a.bloque)){ S.msg = 'Primero arma la convocatoria de la semana: el sorteo usa a las personas convocadas.'; repintar(); return; }
    const hist = D().equidad(((S.datos && S.datos.historial) || []).map(h => ({ semana: h.semana, asignaciones: (h.asignaciones || []).map(a => ({ trabajadorId: a.trabajador_id, dia: a.dia })) })), S.semana, config().semanasHistorial);
    const r = D().generarDescansos({ semana: S.semana, columna: col, equipos: equipos(), conv: cv, anterior: anterior(), historial: hist, config: config(), semilla: D().nuevaSemilla() });
    const T = new Map(trabajadores().map(t => [t.id, t]));
    const p = { semana: S.semana, turno: col, semilla: r.semilla, client_event_id: uuid(),
      asignaciones: r.asignaciones.map((a, i) => ({ trabajador_id: a.trabajadorId, nombre: (T.get(a.trabajadorId) || {}).nombre || a.nombre || '', equipo_id: a.equipoId || '', dia: a.dia, status: a.status, origen: a.origen, motivo: a.motivo, bloque: a.bloque, hasta_fecha: a.hasta || '', orden: i + 1 })) };
    const s = semanaDe(col); if(s) p.version = s.version;
    const res = await sb().rpc('descansos_guardar', { p });
    S.msg = res && res.error ? String(res.error.message || res.error).replace(/^descansos:\s*/i, '') : 'Sorteo n.º ' + r.semilla + ': ' + r.asignados + ' de ' + r.conDescanso + ' con descanso' + (r.porProgramar ? ' · ' + r.porProgramar + ' por programar' : '') + '. Revisa y publica.';
    S.avisos = [];
    await cargar();
  }
  function mover(col, trabajadorId, dia){
    const r = resultado(col); if(!r || !edita(col)) return;
    const a = r.asignaciones.find(x => x.trabajadorId === trabajadorId); if(!a || a.status === 'MEDICO') return;
    const nuevoDia = a.dia === dia ? null : dia;                           // tocar su X la quita (queda «por programar»)
    const m = D().mover(r.asignaciones, trabajadorId, nuevoDia, quien(), equipos(), col, S.semana, personas(col));
    S.avisos = m.avisos;
    // aplica al momento en esta pantalla y lo manda (cola idempotente)
    (S.datos.asignaciones || []).forEach(x => { if(x.turno === col && x.trabajador_id === trabajadorId){ x.dia = nuevoDia; x.status = 'MANUAL'; x.origen = 'MANUAL'; x.actualizado_por = quien(); } });
    const motivo = m.avisos.length ? 'Cambiado a mano · ' + m.avisos.map(x => x.texto).join(' · ') : 'Cambiado a mano';
    guardarCola(leerCola().concat([{ fn: 'descansos_mover', p: { semana: S.semana, turno: col, trabajador_id: trabajadorId, dia: nuevoDia, motivo: motivo.slice(0, 200), client_event_id: uuid() } }]));
    S.msg = ''; repintar(); vaciar();
  }
  async function publicar(col){
    const r = await sb().rpc('descansos_estado', { p: { semana: S.semana, turno: col, estado: 'PUBLICADA' } });
    S.msg = r && r.error ? String(r.error.message || r.error).replace(/^descansos:\s*/i, '') : 'Descansos del turno ' + (col === 'NOCHE' ? 'noche' : 'día') + ' publicados: pasan a la convocatoria (columna DESC.) y al Tareo como «Descanso».';
    await cargar();
  }

  /* ---------- cache de publicados (Tareo y convocatoria) ---------- */
  const memoria = new Map();
  function recordarPublicados(semana, datos){
    if(!semana || !datos) return;
    const pub = (datos.semanas || []).filter(s => s.estado === 'PUBLICADA').map(s => ({ semana, turno: s.turno, asignaciones: (datos.asignaciones || []).filter(a => a.turno === s.turno).map(a => ({ trabajadorId: a.trabajador_id, dia: a.dia === null || a.dia === undefined ? null : Number(a.dia) })) }));
    memoria.set(semana, pub);
    try{ localStorage.setItem(CACHE + semana, JSON.stringify(pub)); }catch(_){ }
  }
  function publicados(semana){
    if(memoria.has(semana)) return memoria.get(semana);
    try{ const x = JSON.parse(localStorage.getItem(CACHE + semana) || 'null'); if(Array.isArray(x)){ memoria.set(semana, x); return x; } }catch(_){ }
    return [];
  }
  const pidiendoSem = new Set(), ultimaVez = new Map();
  async function traer(semana){
    const c = sb(); if(!c || typeof c.rpc !== 'function' || !semana || pidiendoSem.has(semana) || Date.now() - (ultimaVez.get(semana) || 0) < 60000) return publicados(semana);
    pidiendoSem.add(semana); ultimaVez.set(semana, Date.now());
    try{ const r = await c.rpc('descansos_obtener', { p_semana: semana }); if(r && !r.error && r.data) recordarPublicados(semana, r.data); }catch(_){ }
    finally{ pidiendoSem.delete(semana); }
    return publicados(semana);
  }
  /** Para el Tareo: ¿la persona tiene su descanso publicado ese día? */
  const descansa = (trabajadorId, fecha) => D() ? D().descansaEn(publicados(D().lunesDe(fecha)), trabajadorId, fecha) : false;
  /** Marca en el Tareo: trabaja en su día de descanso (diferencia visible). */
  function marca(persona){
    if(!persona || !persona.descansoProgramado) return '';
    const a = String(persona.asistencia || '');
    if(!a || /descanso/i.test(a)) return ' <span class="tar2-area-badge" title="Día de descanso publicado" style="background:#fff8dc;color:#7a4a00">Su descanso</span>';
    return ' <span class="tar2-area-badge" title="Trabaja en su día de descanso publicado" style="background:#fde2e2;color:#991b1b">Trabaja en su descanso</span>';
  }

  /* ---------- estilos ---------- */
  function estilos(){
    if(document.getElementById('ds-css')) return;
    const s = document.createElement('style'); s.id = 'ds-css';
    s.textContent = `#ds{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr);gap:12px}#ds>*{min-width:0}#ds .ds-cab>div{min-width:0}#ds .ds-cab p{overflow-wrap:anywhere}#ds .ds-cab{background:#0b3a5c;color:#fff;border-radius:18px;padding:14px 16px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start}
#ds .ds-cab small{display:block;opacity:.8;font-size:12px;letter-spacing:.05em;color:#fff}#ds .ds-cab h2{margin:2px 0;font-size:22px;color:#fff!important;-webkit-text-fill-color:#fff}#ds .ds-cab p{margin:0;opacity:.85;font-size:13px;color:#fff}
#ds .ds-sem{display:flex;gap:6px;align-items:center}#ds .ds-sem button{background:rgba(255,255,255,.15);border:0;color:#fff;border-radius:10px;min-width:44px;min-height:40px;font-size:18px;cursor:pointer}
.ds-chip{border-radius:999px;padding:4px 12px;font-weight:800;font-size:13px;background:#fdf0c4;color:#7a4a00;white-space:nowrap}.ds-chip.pub{background:#d9f5e3;color:#14532d}.ds-chip.sin{background:#e5e7eb;color:#374151}
#ds .ds-card{background:#fff;border:1px solid #dce5eb;border-radius:16px;padding:12px 14px;color:#0f2a3d}#ds .ds-card h3{margin:0 0 8px;font-size:17px;color:#0f2a3d}
.ds-reglas{list-style:none;margin:0;padding:0;display:grid;gap:4px}.ds-reglas li{font-size:14.5px}
.ds-fila{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}#ds .ds-b{min-height:44px;border-radius:12px;border:1.5px solid #cfdbe5;background:#fff;color:#0b3a5c;font-weight:700;font-size:15px;cursor:pointer;padding:8px 12px}
#ds .ds-b.p{background:#0b3a5c;color:#fff!important;-webkit-text-fill-color:#fff;border-color:#0b3a5c}#ds .ds-b:disabled{opacity:.5;cursor:not-allowed}
.ds-msg{background:#eaf5fc;border:1px solid #bfdcec;border-radius:12px;padding:10px 14px;color:#0b4a6b}.ds-err{background:#fdecec;border-color:#f5b5b5;color:#991b1b}.ds-av{background:#fff7d6;border:1px solid #f2cf63;border-radius:12px;padding:10px 14px;color:#7a4a00}.ds-av ul{margin:4px 0 0;padding-left:18px}
.ds-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:10px}
#ds .ds-tt{border-collapse:collapse;width:100%;min-width:560px;font-size:14px}#ds .ds-tt th,#ds .ds-tt td{padding:8px 6px;text-align:center;border-bottom:1px solid #eef2f5;color:#0f2a3d}#ds .ds-tt th{font-size:12.5px;color:#5b6b78;background:transparent;text-transform:none}#ds .ds-tt td:first-child,#ds .ds-tt th:first-child{text-align:left}
#ds .ds-tt .dom{background:#fff4c8;font-weight:800}#ds .ds-tt .sub{display:block;font-size:12px;color:#64748b;font-weight:400}#ds .ds-tt .grupo td{background:#eef4f8;font-weight:800;color:#0b3a5c;text-align:left}#ds .ds-tt .bajo{color:#b91c1c;font-weight:800}
.ds-tabs{display:flex;gap:6px;flex-wrap:wrap}#ds .ds-tab{min-height:40px;border-radius:999px;border:1.5px solid #cfdbe5;background:#fff;color:#0b3a5c;font-weight:700;padding:4px 14px;cursor:pointer}#ds .ds-tab.on{background:#0b3a5c;color:#fff;-webkit-text-fill-color:#fff;border-color:#0b3a5c}
#ds .ds-x{border-collapse:collapse;min-width:900px;width:100%;font-family:Calibri,Arial,sans-serif;font-size:15px;background:#fff}#ds .ds-x th,#ds .ds-x td{border:1px solid #8a8a8a;padding:0 6px;height:34px;color:#111}
#ds .ds-x thead th{background:var(--ds-cab);font-weight:800;text-transform:none;letter-spacing:0;font-size:15px;color:#111;text-align:center;white-space:nowrap;border:1px solid #8a8a8a}#ds .ds-x tbody tr:hover{background:transparent}#ds .ds-x .tit{background:#fff;font-size:18px;font-weight:800;height:44px}#ds .ds-x td.n{text-align:center;width:42px;font-weight:700}#ds .ds-x td.nom{font-weight:700;min-width:220px}#ds .ds-x td.eq{color:#555;font-size:14px;min-width:110px}
#ds .ds-x td.d{width:44px;padding:0;text-align:center}#ds .ds-x td.d.dom{background:#fff8dc}#ds .ds-x td.d button{width:100%;height:34px;border:0;background:transparent;cursor:pointer;color:#d00000;font:700 20px 'Times New Roman',serif}#ds .ds-x td.d button:disabled{cursor:default}
#ds .ds-x td.d button:not(:disabled):hover{background:#e8f3fb}#ds .ds-x td.gris{background:#e5e7eb}#ds .ds-x td.st{min-width:240px;font-size:15px}
#ds .ds-x td.st.ASIGNADO,#ds .ds-x td.st.VIENE_NOCHE{background:#c6efce;color:#1f6f2b}#ds .ds-x td.st.PASA_NOCHE{background:#e4dcf3;color:#5b3aa0}#ds .ds-x td.st.MANUAL{background:#dbe8f7;color:#1e4f91}#ds .ds-x td.st.MEDICO{background:#eceff1;color:#555}#ds .ds-x td.st.PROGRAMAR{background:#f4b5b5;color:#9b0000;font-weight:800}
#ds .ds-x tr.tot td{background:#e60000;color:#fff;font-weight:800;text-align:center}#ds .ds-x tr.trab td{background:#f1f1f1;font-size:13px;text-align:center;vertical-align:middle;line-height:1.35;padding:4px}
#ds .ds-x td.dmin{color:#b91c1c;font-weight:800}.ds-pie{font-size:12.5px;color:#64748b;margin:6px 0 0}
.ds-modal{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:900;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto}.ds-modal>div{background:#fff;border-radius:16px;padding:14px;max-width:980px;width:100%;display:grid;gap:10px;color:#0f2a3d}
.ds-modal img{max-width:100%;border:1px solid #e2e8f0;border-radius:8px}.ds-modal input{min-height:40px;border:1px solid #cfdbe5;border-radius:8px;padding:4px 6px;font:inherit;box-sizing:border-box}
.ds-cfg{border-collapse:collapse;font-size:13.5px}.ds-cfg th,.ds-cfg td{padding:4px;border-bottom:1px solid #eef2f5;text-align:center}.ds-cfg td:first-child{text-align:left;font-weight:700;min-width:130px}.ds-cfg input[type=number]{width:54px}
@media (max-width:600px){#ds .ds-x td.nom{min-width:150px}#ds .ds-x td.st{min-width:190px}}@media (prefers-color-scheme:dark){#ds .ds-card,.ds-modal>div{background:#13222d;color:#e6eef3;border-color:#2b3f4d}#ds .ds-card h3,#ds .ds-tt td{color:#e6eef3}#ds .ds-b,#ds .ds-tab{background:#1b2d39;color:#e6eef3;border-color:#2b3f4d}#ds .ds-tt .grupo td{background:#1b2d39;color:#9fd3ee}#ds .ds-tt .dom{background:#3a3214}}`;
    document.head.appendChild(s);
  }

  /* ---------- pintar ---------- */
  const fmtFecha = t => { try{ return new Date(t).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }catch(_){ return ''; } };
  function htmlTrabajando(){
    const eqs = equipos();
    const bloque = col => {
      const r = resultado(col); const lst = eqs.filter(e => e.columna === col);
      if(!lst.length) return '';
      return `<tr class="grupo"><td colspan="8">Turno ${col === 'NOCHE' ? 'noche' : 'día'}${r ? '' : ' · sin sortear'}</td></tr>` + lst.map(e => {
        const n = r ? r.asignaciones.filter(a => a.equipoId === e.id).length : personas(col).filter(p => p.equipoId === e.id).length;
        const m = [0, 1, 2, 3, 4, 5, 6].map(d => D().minimoDia(e, d)), mins = m.filter(x => x !== null);
        const minTxt = mins.length && mins.every(x => x === mins[0]) ? 'mín ' + mins[0] : 'mín ' + mins.join('-');
        return `<tr><td>${esc(e.nombre)}<span class="sub">${minTxt} · ${n} pers.</span></td>${[0, 1, 2, 3, 4, 5, 6].map(d => { const t = r ? r.trabajando[e.id][d] : ''; const bajo = r && m[d] !== null && t < m[d];
          return `<td class="${d === 6 ? 'dom' : ''} ${bajo ? 'bajo' : ''}">${m[d] === null ? '—' : t}</td>`; }).join('')}</tr>`;
      }).join('');
    };
    return `<div class="ds-card"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline"><h3>Personas trabajando por día</h3><small style="color:#64748b">amarillo = domingo</small></div>
      <div class="ds-scroll"><table class="ds-tt"><thead><tr><th></th>${D().DIAS.map((x, d) => `<th class="${d === 6 ? 'dom' : ''}">${x}</th>`).join('')}</tr></thead><tbody>${bloque('DÍA')}${bloque('NOCHE')}</tbody></table></div></div>`;
  }
  function htmlCuadro(r){
    const mod = D().modeloCuadro(r, equipos(), trabajadores(), { horario: (equipos().find(e => e.columna === r.columna) || {}).inicio ? (equipos().find(e => e.columna === r.columna).inicio + '–' + equipos().find(e => e.columna === r.columna).fin) : '' });
    const ed = edita(r.columna), filas = mod.filas.filter(f => !S.filtro || f.equipoId === S.filtro);
    const cab = r.columna === 'NOCHE' ? '#b4a7d6' : '#9fc5e8';
    return `<div class="ds-scroll"><table class="ds-x" style="--ds-cab:${cab}" aria-label="${esc(mod.titulo)}">
      <thead><tr><th class="tit" colspan="11">${esc(mod.titulo)}</th></tr>
      <tr><th rowspan="2">N°</th><th rowspan="2">NOMBRES APELLIDOS</th><th rowspan="2">EQUIPO</th>${mod.dias.map(x => `<th>${x.letra}</th>`).join('')}<th rowspan="2">Status</th></tr>
      <tr>${mod.dias.map(x => `<th>${x.num}</th>`).join('')}</tr></thead>
      <tbody>${filas.map(f => `<tr><td class="n">${f.n}</td><td class="nom">${esc(f.nombre)}</td><td class="eq">${esc(f.equipo)}</td>${[0, 1, 2, 3, 4, 5, 6].map(d => {
          if(f.status === 'MEDICO') return `<td class="d gris"></td>`;
          return `<td class="d ${d === 6 ? 'dom' : ''}"><button type="button" ${ed ? '' : 'disabled'} data-ds-cel="${esc(f.trabajadorId)}" data-ds-dia="${d}" aria-label="${esc(f.nombre)} ${D().DIAS[d]}${f.dia === d ? ' (descansa)' : ''}">${f.dia === d ? 'X' : ''}</button></td>`; }).join('')}
        <td class="st ${esc(f.status)}" title="${esc(f.motivo)}">${esc(f.statusTexto)}${f.status === 'PROGRAMAR' && f.motivo ? ' · ' + esc(f.motivo) : ''}</td></tr>`).join('')}
      <tr class="tot"><td colspan="3">Total de descansos por día</td>${r.totalesPorDia.map(t => `<td>${t}</td>`).join('')}<td>${esc(mod.resumen)}</td></tr>
      <tr class="trab"><td colspan="3" style="text-align:right">${esc(mod.trabajando.etiqueta)}</td>${[0, 1, 2, 3, 4, 5, 6].map(d => `<td>${mod.trabajando.equipos.map(e => `<div class="${e.minimos[d] !== null && e.dias[d] < e.minimos[d] ? 'dmin' : ''}">${e.minimos[d] === null ? '—' : e.dias[d]}</div>`).join('')}</td>`).join('')}<td style="text-align:left">${esc(mod.trabajando.minimos)} ${mod.trabajando.ok ? '✓' : '⚠'}</td></tr>
      </tbody></table></div><p class="ds-pie">${esc(mod.pie)}${ed ? ' · toca una celda para mover el descanso (tocar su X la quita)' : ' · solo lectura'}</p>`;
  }
  function pintar(main){
    estilos();
    if(!S.semana) S.semana = D().lunesDe(hoy());
    const r = S.datos ? resultado(S.col) : null, s = semanaDe(S.col), ed = edita(S.col);
    const nOp = S.datos ? ['DÍA', 'NOCHE'].reduce((n, c) => n + personas(c).filter(p => !p.bloque).length, 0) : 0;
    const chip = !s ? '<span class="ds-chip sin">Sin sortear</span>' : s.estado === 'PUBLICADA' ? '<span class="ds-chip pub">Publicada</span>' : '<span class="ds-chip">Propuesta</span>';
    const eqsCol = equipos().filter(e => e.columna === S.col);
    const avisos = (r ? r.avisos.filter(a => a.tipo !== 'info') : []).concat(S.avisos.map(a => Object.assign({}, a, { nuevo: true })));
    main.innerHTML = `<div id="ds">
      <div class="ds-cab"><div><small>PERSONAL › DESCANSOS AUTOMÁTICOS</small><h2>Semana ${esc(D().ddmm(S.semana))} al ${esc(D().ddmm(D().sumarDias(S.semana, 6)))}</h2>
        <p>${s ? 'Sorteo n.º ' + esc(s.semilla) + ' · generado ' + esc(fmtFecha(s.generado_en)) + ' · ' : ''}${nOp} operarios${s && s.publicado_por ? ' · publicado por ' + esc(s.publicado_por) : ''}</p></div>
        <div style="display:grid;gap:8px;justify-items:end">${chip}<div class="ds-sem"><button type="button" data-ds-sem="-7" aria-label="Semana anterior">‹</button><button type="button" data-ds-sem="0" style="font-size:13px;padding:0 10px">Esta semana</button><button type="button" data-ds-sem="7" aria-label="Semana siguiente">›</button></div></div></div>
      ${S.error ? `<div class="ds-msg ds-err">${esc(S.error)}</div>` : ''}${S.msg ? `<div class="ds-msg">${esc(S.msg)}</div>` : ''}
      ${!S.datos && !S.error ? '<div class="ds-msg">Cargando…</div>' : ''}
      ${S.datos ? `
      <div class="ds-tabs" role="tablist">${['DÍA', 'NOCHE'].map(c => { const x = resultado(c); return `<button type="button" class="ds-tab ${S.col === c ? 'on' : ''}" data-ds-col="${c}" role="tab" aria-selected="${S.col === c}">Turno ${c === 'NOCHE' ? 'noche' : 'día'}${x ? ' · ' + x.asignados + '/' + x.conDescanso : ''}</button>`; }).join('')}</div>
      ${r ? `<div class="ds-card"><h3>Reglas</h3><ul class="ds-reglas">${r.reglas.map(x => `<li>${x.ok ? '✅' : '⚠️'} ${esc(x.texto)}</li>`).join('')}${r.avisos.filter(a => a.tipo === 'info').map(a => `<li>⚠ ${esc(a.texto)}</li>`).join('')}</ul></div>` : ''}
      ${avisos.length ? `<div class="ds-av"><b>Avisos (no bloquean)</b><ul>${avisos.slice(0, 30).map(a => `<li>${a.nuevo ? '<b>Tu cambio:</b> ' : ''}${esc(a.texto)}</li>`).join('')}</ul></div>` : ''}
      <div class="ds-fila">
        ${ed ? `<button type="button" class="ds-b ${r ? '' : 'p'}" data-ds-sortear="1">🎲 ${r ? 'Volver a sortear' : 'Sortear descansos'} (${S.col === 'NOCHE' ? 'noche' : 'día'})</button>` : ''}
        ${ed && r && s.estado !== 'PUBLICADA' ? '<button type="button" class="ds-b p" data-ds-publicar="1">Publicar y aplicar a convocatoria</button>' : ''}
        ${r ? '<button type="button" class="ds-b" data-ds-png="1">Imagen WhatsApp (PNG)</button><button type="button" class="ds-b" data-ds-xlsx="1">Excel (.xlsx)</button><button type="button" class="ds-b" data-ds-pdf="1">Imprimir / PDF</button>' : ''}
        ${cap().jefe ? '<button type="button" class="ds-b" data-ds-cfg="1">Mínimos y días</button>' : ''}
      </div>
      ${!ed && cap().editar ? `<p class="ds-pie">Editas el turno ${columnaSupervisor() === 'NOCHE' ? 'noche' : 'día'} (rotación de supervisores); este turno lo ves en solo lectura.</p>` : ''}
      ${htmlTrabajando()}
      ${r ? `<div class="ds-tabs" aria-label="Equipo"><button type="button" class="ds-tab ${S.filtro ? '' : 'on'}" data-ds-filtro="">Todos</button>${eqsCol.map(e => `<button type="button" class="ds-tab ${S.filtro === e.id ? 'on' : ''}" data-ds-filtro="${esc(e.id)}">${esc(e.nombre)}</button>`).join('')}</div>${htmlCuadro(r)}`
        : `<div class="ds-card"><p style="margin:0">El turno ${S.col === 'NOCHE' ? 'noche' : 'día'} aún no tiene descansos. ${ed ? 'Toca «Sortear descansos»: GLACIAL arma el cuadro con las reglas y tú lo revisas antes de publicar.' : ''}</p></div>`}` : ''}
    </div>`;
    escuchar();
  }
  function repintar(){
    if(typeof state === 'undefined' || state.currentTab !== TAB) return;
    const m = document.getElementById('main'); if(!m) return;
    const y = W.scrollY; pintar(m); if(W.scrollTo) W.scrollTo(0, y);
  }

  /* ---------- modal ---------- */
  function modal(html){ cerrarModal(); const m = document.createElement('div'); m.className = 'ds-modal'; m.id = 'ds-modal'; m.innerHTML = '<div role="dialog" aria-modal="true">' + html + '</div>'; m.addEventListener('click', e => { if(e.target === m || e.target.closest('[data-ds-cerrar]')) cerrarModal(); }); document.body.appendChild(m); return m; }
  function cerrarModal(){ const m = document.getElementById('ds-modal'); if(m) m.remove(); }

  /* ---------- exportar ---------- */
  function canvasCuadro(r){
    const mod = D().modeloCuadro(r, equipos(), trabajadores(), {}), ESC = 2;
    const cols = [56, 330, 150, 56, 56, 56, 56, 56, 56, 56, 330], X = [0]; cols.forEach((w, i) => X.push(X[i] + w));
    const Wt = X[X.length - 1], PAD = 16, RH = 34, nE = mod.trabajando.equipos.length, HT = Math.max(RH, nE * 18 + 10);
    const H = PAD + 44 + RH * 2 + mod.filas.length * RH + RH + HT + 30 + PAD;
    const cv = document.createElement('canvas'); cv.width = (Wt + PAD * 2) * ESC; cv.height = H * ESC;
    const g = cv.getContext('2d'); g.scale(ESC, ESC); g.fillStyle = '#fff'; g.fillRect(0, 0, Wt + PAD * 2, H); g.textBaseline = 'middle'; g.lineWidth = 1; g.strokeStyle = '#8a8a8a';
    const cab = r.columna === 'NOCHE' ? '#b4a7d6' : '#9fc5e8';
    const caja = (c0, c1, y, h, fondo) => { const x = PAD + X[c0], w = X[c1] - X[c0]; if(fondo){ g.fillStyle = fondo; g.fillRect(x, y, w, h); } g.strokeRect(x, y, w, h); return { x, w }; };
    const txt = (s, x, y, o) => { o = o || {}; g.fillStyle = o.color || '#111'; g.font = (o.bold ? '700 ' : '400 ') + (o.size || 16) + 'px Calibri, Arial, sans-serif'; g.textAlign = o.align || 'left'; g.fillText(String(s), x, y); };
    let y = PAD; const t = caja(0, 11, y, 44); txt(mod.titulo, t.x + t.w / 2, y + 22, { bold: true, size: 21, align: 'center' }); y += 44;
    [[0, 'N°'], [1, 'NOMBRES APELLIDOS'], [2, 'EQUIPO'], [10, 'Status']].forEach(([c, s]) => { const b = caja(c, c + 1, y, RH * 2, cab); txt(s, b.x + b.w / 2, y + RH, { bold: true, align: 'center' }); });
    mod.dias.forEach((d, i) => { const a = caja(3 + i, 4 + i, y, RH, cab); txt(d.letra, a.x + a.w / 2, y + RH / 2, { bold: true, align: 'center' }); const b = caja(3 + i, 4 + i, y + RH, RH, cab); txt(d.num, b.x + b.w / 2, y + RH * 1.5, { bold: true, align: 'center' }); });
    y += RH * 2;
    const COL = { ASIGNADO: ['#c6efce', '#1f6f2b'], VIENE_NOCHE: ['#c6efce', '#1f6f2b'], PASA_NOCHE: ['#e4dcf3', '#5b3aa0'], MANUAL: ['#dbe8f7', '#1e4f91'], MEDICO: ['#eceff1', '#555'], PROGRAMAR: ['#f4b5b5', '#9b0000'] };
    mod.filas.forEach(f => {
      let b = caja(0, 1, y, RH); txt(f.n, b.x + b.w / 2, y + RH / 2, { bold: true, align: 'center' });
      b = caja(1, 2, y, RH); txt(f.nombre, b.x + 8, y + RH / 2, { bold: true });
      b = caja(2, 3, y, RH); txt(f.equipo, b.x + 8, y + RH / 2, { color: '#555', size: 15 });
      for(let d = 0; d < 7; d++){ b = caja(3 + d, 4 + d, y, RH, f.status === 'MEDICO' ? '#e5e7eb' : d === 6 ? '#fff8dc' : null); if(f.dia === d){ g.font = '700 22px "Times New Roman", serif'; g.fillStyle = '#d00000'; g.textAlign = 'center'; g.fillText('X', b.x + b.w / 2, y + RH / 2 + 1); } }
      const c = COL[f.status] || ['#fff', '#111']; b = caja(10, 11, y, RH, c[0]); txt(f.statusTexto, b.x + 8, y + RH / 2, { color: c[1], bold: f.status === 'PROGRAMAR' });
      y += RH;
    });
    let b = caja(0, 3, y, RH, '#e60000'); txt('Total de descansos por día', b.x + b.w / 2, y + RH / 2, { bold: true, color: '#fff', align: 'center' });
    r.totalesPorDia.forEach((n, d) => { b = caja(3 + d, 4 + d, y, RH, '#e60000'); txt(n, b.x + b.w / 2, y + RH / 2, { bold: true, color: '#fff', align: 'center' }); });
    b = caja(10, 11, y, RH, '#e60000'); txt(mod.resumen, b.x + b.w / 2, y + RH / 2, { bold: true, color: '#fff', align: 'center' }); y += RH;
    b = caja(0, 3, y, HT, '#f1f1f1'); txt(mod.trabajando.etiqueta, b.x + b.w - 10, y + HT / 2, { align: 'right', size: 15 });
    for(let d = 0; d < 7; d++){ b = caja(3 + d, 4 + d, y, HT, '#f1f1f1'); mod.trabajando.equipos.forEach((e, i) => txt(e.minimos[d] === null ? '—' : e.dias[d], b.x + b.w / 2, y + 5 + 9 + i * 18, { align: 'center', size: 14, color: e.minimos[d] !== null && e.dias[d] < e.minimos[d] ? '#b91c1c' : '#111' })); }
    b = caja(10, 11, y, HT, '#f1f1f1'); txt(mod.trabajando.minimos + (mod.trabajando.ok ? ' ✓' : ' ⚠'), b.x + 10, y + HT / 2, { size: 15 }); y += HT;
    txt(mod.pie, PAD, y + 16, { size: 13, color: '#666' });
    return cv;
  }
  const nombreArchivo = (r, ext) => 'Descansos-' + (r.columna === 'NOCHE' ? 'Noche' : 'Dia') + '-' + S.semana + '.' + ext;
  function verImagen(r){
    let cv; try{ cv = canvasCuadro(r); }catch(e){ S.msg = 'No se pudo armar la imagen: ' + (e && e.message || e); repintar(); return; }
    S.imagen = cv; const url = cv.toDataURL('image/png'), nombre = nombreArchivo(r, 'png');
    const m = modal(`<h3 style="margin:0">Cuadro para WhatsApp</h3><img src="${url}" alt="Descansos de la semana"><div class="ds-fila"><a class="ds-b" style="text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;min-height:44px;border-radius:12px;border:1.5px solid #cfdbe5;font-weight:700;color:#0b3a5c" download="${nombre}" href="${url}">Descargar PNG</a><button type="button" class="ds-b p" data-ds-compartir="1" style="min-height:44px;border-radius:12px;background:#0b3a5c;color:#fff;border:0;font-weight:700">Compartir</button><button type="button" data-ds-cerrar="1" style="min-height:44px;border-radius:12px;border:1.5px solid #cfdbe5;background:#fff;font-weight:700">Cerrar</button></div>`);
    m.addEventListener('click', async e => {
      if(!e.target.closest('[data-ds-compartir]')) return;
      try{ const blob = await new Promise(res => cv.toBlob(res, 'image/png')); const f = new File([blob], nombre, { type: 'image/png' });
        if(navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: 'Descansos ' + D().ddmm(S.semana) });
        else { const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); }
      }catch(_){ }
    });
  }
  function imprimir(r){
    let url; try{ url = canvasCuadro(r).toDataURL('image/png'); }catch(e){ return; }
    const w = W.open('', '_blank'); if(!w){ S.msg = 'El navegador bloqueó la ventana de impresión: permite ventanas emergentes para GLACIAL.'; repintar(); return; }
    w.document.write('<!doctype html><title>' + esc(nombreArchivo(r, 'pdf')) + '</title><style>@page{size:A4 portrait;margin:8mm}body{margin:0}img{width:100%}</style><img src="' + url + '" onload="setTimeout(function(){print()},200)">');
    w.document.close();
  }
  async function excel(r){
    if(W.glacialCargarExcel) await W.glacialCargarExcel();
    if(!W.ExcelJS || !W.ExcelJS.Workbook){ S.msg = 'No se pudo cargar el generador de Excel (revisa la conexión).'; repintar(); return; }
    const mod = D().modeloCuadro(r, equipos(), trabajadores(), {});
    const wb = new W.ExcelJS.Workbook(), ws = wb.addWorksheet(r.columna === 'NOCHE' ? 'DESCANSOS TURNO NOCHE' : 'DESCANSOS TURNO DIA', { views: [{ state: 'frozen', ySplit: 3 }] });
    ws.columns = [{ width: 6 }, { width: 38 }, { width: 16 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 38 }];
    const cab = r.columna === 'NOCHE' ? 'FFB4A7D6' : 'FF9FC5E8', borde = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    const relleno = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
    ws.mergeCells('A1:K1'); Object.assign(ws.getCell('A1'), { value: mod.titulo }); ws.getCell('A1').font = { bold: true, size: 14 }; ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.getRow(2).values = ['N°', 'NOMBRES APELLIDOS', 'EQUIPO'].concat(mod.dias.map(d => d.letra)).concat(['Status']);
    ws.getRow(3).values = ['', '', ''].concat(mod.dias.map(d => d.num)).concat(['']);
    ['A', 'B', 'C', 'K'].forEach(c => ws.mergeCells(c + '2:' + c + '3'));
    [2, 3].forEach(n => ws.getRow(n).eachCell({ includeEmpty: true }, c => { c.fill = relleno(cab); c.font = { bold: true }; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = borde; }));
    const COL = { ASIGNADO: ['FFC6EFCE', 'FF1F6F2B'], VIENE_NOCHE: ['FFC6EFCE', 'FF1F6F2B'], PASA_NOCHE: ['FFE4DCF3', 'FF5B3AA0'], MANUAL: ['FFDBE8F7', 'FF1E4F91'], MEDICO: ['FFECEFF1', 'FF555555'], PROGRAMAR: ['FFF4B5B5', 'FF9B0000'] };
    mod.filas.forEach((f, i) => {
      const row = ws.getRow(4 + i); row.values = [f.n, f.nombre, f.equipo].concat([0, 1, 2, 3, 4, 5, 6].map(d => f.dia === d ? 'X' : '')).concat([f.statusTexto]);
      row.eachCell({ includeEmpty: true }, (c, k) => { c.border = borde; if(k >= 4 && k <= 10){ c.alignment = { horizontal: 'center' }; c.font = { bold: true, color: { argb: 'FFD00000' } }; if(f.status === 'MEDICO') c.fill = relleno('FFE5E7EB'); else if(k === 10) c.fill = relleno('FFFFF8DC'); } });
      row.getCell(2).font = { bold: true };
      const col = COL[f.status]; if(col){ row.getCell(11).fill = relleno(col[0]); row.getCell(11).font = { color: { argb: col[1] }, bold: f.status === 'PROGRAMAR' }; }
    });
    const nT = 4 + mod.filas.length, tot = ws.getRow(nT);
    tot.values = ['Total de descansos por día', '', ''].concat(r.totalesPorDia).concat([mod.resumen]); ws.mergeCells('A' + nT + ':C' + nT);
    tot.eachCell({ includeEmpty: true }, c => { c.fill = relleno('FFE60000'); c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.alignment = { horizontal: 'center' }; c.border = borde; });
    const tr = ws.getRow(nT + 1); tr.values = [mod.trabajando.etiqueta, '', ''].concat([0, 1, 2, 3, 4, 5, 6].map(d => mod.trabajando.equipos.map(e => e.minimos[d] === null ? '—' : e.dias[d]).join('\n'))).concat([mod.trabajando.minimos]);
    ws.mergeCells('A' + (nT + 1) + ':C' + (nT + 1)); tr.height = Math.max(18, mod.trabajando.equipos.length * 15);
    tr.eachCell({ includeEmpty: true }, c => { c.fill = relleno('FFF1F1F1'); c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = borde; });
    ws.getCell('A' + (nT + 3)).value = mod.pie; ws.getCell('A' + (nT + 3)).font = { italic: true, color: { argb: 'FF666666' } };
    const buf = await wb.xlsx.writeBuffer(), blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombreArchivo(r, 'xlsx'); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------- mínimos y días (Administrador / Jefatura) ---------- */
  function configurar(){
    const eqs = equipos(), cfg = config();
    const fila = e => `<tr data-ds-eq="${esc(e.id)}"><td>${esc(e.nombre)}<br><small style="font-weight:400;color:#64748b">${esc(e.columna === 'NOCHE' ? 'noche' : 'día')}</small></td>
      <td><input type="number" min="0" max="500" data-k="min" value="${esc(e.minimoDescanso === null || e.minimoDescanso === undefined ? '' : e.minimoDescanso)}" aria-label="Mínimo ${esc(e.nombre)}"></td>
      ${[0, 1, 2, 3, 4, 5, 6].map(d => `<td><input type="number" min="0" max="500" data-k="d${d}" value="${esc(Array.isArray(e.minimoPorDia) ? e.minimoPorDia[d] : '')}" placeholder="=" aria-label="${D().DIAS[d]}"><br><label style="font-size:11px"><input type="checkbox" data-k="s${d}" ${e.diasSinOperar.includes(d) ? 'checked' : ''} style="min-height:0"> no opera</label></td>`).join('')}</tr>`;
    const m = modal(`<h3 style="margin:0">Mínimos y días (descansos)</h3><p class="ds-pie" style="margin:0">Mínimo = personas que deben TRABAJAR cada día en el equipo (el domingo trabajan exactamente esas). Por día: déjalo vacío para usar el mínimo. «No opera»: ese día no cuenta mínimo y es el descanso de todos.</p>
      <div class="ds-scroll"><table class="ds-cfg"><thead><tr><th>Equipo</th><th>Mínimo</th>${D().DIAS.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${eqs.map(fila).join('')}</tbody></table></div>
      <label>Semanas de historial para la equidad <input type="number" min="1" max="26" id="ds-hist" value="${cfg.semanasHistorial}" style="width:70px"></label>
      <label><input type="checkbox" id="ds-parcial" ${cfg.medicoParcial ? 'checked' : ''} style="min-height:0"> Si el descanso médico termina a mitad de semana, puede recibir descanso en los días restantes</label>
      <div class="ds-fila"><button type="button" class="ds-b p" data-ds-guardar-cfg="1" style="min-height:44px;border-radius:12px;background:#0b3a5c;color:#fff;border:0;font-weight:700">Guardar</button><button type="button" data-ds-cerrar="1" style="min-height:44px;border-radius:12px;border:1.5px solid #cfdbe5;background:#fff;font-weight:700">Cerrar</button></div>`);
    m.addEventListener('click', async e => {
      if(!e.target.closest('[data-ds-guardar-cfg]')) return;
      const errores = [];
      for(const tr of m.querySelectorAll('[data-ds-eq]')){
        const v = k => tr.querySelector('[data-k="' + k + '"]'), id = tr.getAttribute('data-ds-eq'), o = eqs.find(x => x.id === id);
        const pd = [0, 1, 2, 3, 4, 5, 6].map(d => v('d' + d).value), sin = [0, 1, 2, 3, 4, 5, 6].filter(d => v('s' + d).checked);
        const p = { id, minimo_descanso: v('min').value === '' ? null : Number(v('min').value), minimo_por_dia: pd.every(x => x === '') ? null : pd.map((x, d) => x === '' ? (v('min').value === '' ? Number(o.minimo) || 0 : Number(v('min').value)) : Number(x)), dias_sin_operar: sin };
        const igual = String(p.minimo_descanso) === String(o.minimoDescanso === undefined ? null : o.minimoDescanso) && JSON.stringify(p.minimo_por_dia) === JSON.stringify(o.minimoPorDia || null) && JSON.stringify(sin) === JSON.stringify((o.diasSinOperar || []).map(Number).sort());
        if(igual) continue;
        const r = await sb().rpc('equipo_descanso_guardar', { p }); if(r && r.error) errores.push(o.nombre + ': ' + String(r.error.message || r.error).replace(/^descansos:\s*/i, ''));
      }
      const h = Number(m.querySelector('#ds-hist').value), parcial = m.querySelector('#ds-parcial').checked;
      if(h !== cfg.semanasHistorial || parcial !== cfg.medicoParcial){ const r = await sb().rpc('descansos_config_guardar', { p: { semanas_historial: h, medico_parcial: parcial } }); if(r && r.error) errores.push(String(r.error.message || r.error).replace(/^descansos:\s*/i, '')); }
      cerrarModal(); S.msg = errores.length ? errores.join(' · ') : 'Mínimos guardados. Vuelve a sortear para aplicarlos a una propuesta.'; await cargar();
    });
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click', e => {
    const raiz = e.target.closest && e.target.closest('#ds'); if(!raiz) return;
    const g = sel => e.target.closest('[' + sel + ']'), at = (el, k) => el.getAttribute(k);
    let b;
    if((b = g('data-ds-sem'))){ const n = Number(at(b, 'data-ds-sem')); S.semana = n ? D().sumarDias(S.semana, n) : D().lunesDe(hoy()); S.datos = null; S.conv = null; S.msg = ''; S.avisos = []; repintar(); cargar(); return; }
    if((b = g('data-ds-col'))){ S.col = at(b, 'data-ds-col'); S.filtro = ''; S.avisos = []; repintar(); return; }
    if((b = g('data-ds-filtro'))){ S.filtro = at(b, 'data-ds-filtro'); repintar(); return; }
    if((b = g('data-ds-cel'))){ if(!b.disabled) mover(S.col, at(b, 'data-ds-cel'), Number(at(b, 'data-ds-dia'))); return; }
    if(g('data-ds-sortear')){
      const r = resultado(S.col);
      if(r && r.asignaciones.some(a => a.status === 'MANUAL')){
        const m = modal(`<h3 style="margin:0">¿Volver a sortear?</h3><p style="margin:0">Hay cambios a mano en este turno; el sorteo nuevo los reemplaza${semanaDe(S.col).estado === 'PUBLICADA' ? ' y la semana vuelve a «Propuesta» (hay que publicar otra vez)' : ''}.</p><div class="ds-fila"><button type="button" data-ds-si="1" style="min-height:44px;border-radius:12px;background:#0b3a5c;color:#fff;border:0;font-weight:700">Sí, volver a sortear</button><button type="button" data-ds-cerrar="1" style="min-height:44px;border-radius:12px;border:1.5px solid #cfdbe5;background:#fff;font-weight:700">Cancelar</button></div>`);
        m.addEventListener('click', ev => { if(ev.target.closest('[data-ds-si]')){ cerrarModal(); sortear(S.col); } });
        return;
      }
      sortear(S.col); return;
    }
    if(g('data-ds-publicar')){ publicar(S.col); return; }
    if(g('data-ds-png')){ verImagen(resultado(S.col)); return; }
    if(g('data-ds-xlsx')){ excel(resultado(S.col)); return; }
    if(g('data-ds-pdf')){ imprimir(resultado(S.col)); return; }
    if(g('data-ds-cfg')){ configurar(); return; }
  });

  /* ---------- navegación ---------- */
  function ir(){
    if(!puedeVer()) return;
    if(typeof confirmarAbandonoRotacionPendiente === 'function' && !confirmarAbandonoRotacionPendiente()) return;
    state.currentTab = TAB; if(!S.semana) S.semana = D().lunesDe(hoy());
    try{ const cs = columnaSupervisor(); if(cs !== 'AMBAS') S.col = cs; }catch(_){ }
    if(typeof renderSidebar === 'function') renderSidebar();
    if(typeof renderMain === 'function') renderMain();
    cargar(); vaciar();
  }
  W.goDescansos = ir;
  W.glacialDescansosPantalla = { estado: S, cargar, vaciar, resultado, canvasCuadro, sortear, mover, publicar, columnaSupervisor };
  W.glacialDescansosDatos = { recordar: recordarPublicados, publicados, traer, descansa, marca };
  if(typeof renderMain === 'function'){
    const a = renderMain;
    renderMain = function(){ if(state.currentTab === TAB && !state.showWelcome && puedeVer()){ pintar(document.getElementById('main')); return; } return a.apply(this, arguments); };
  }
  if(typeof renderSidebar === 'function'){
    const a = renderSidebar;
    renderSidebar = function(){
      const r = a.apply(this, arguments), v = puedeVer();
      ['btn-descansos', 'btn-descansos-rrhh'].forEach(id => { const b = document.getElementById(id); if(b){ b.hidden = !v; b.style.display = v ? '' : 'none'; b.classList.toggle('active', v && state.currentTab === TAB); } });
      if(typeof actualizarGruposSidebar === 'function') actualizarGruposSidebar();
      return r;
    };
  }
  // precarga de los descansos publicados (Tareo sin conexión): esta semana y la siguiente
  (function precargar(){
    try{ if(typeof state !== 'undefined' && state.user && sb() && D() && W.GlacialFecha){ const h = D().lunesDe(W.GlacialFecha.fechaOperativa()); traer(h); traer(D().sumarDias(h, 7)); setTimeout(precargar, 300000); return; } }catch(_){ }
    setTimeout(precargar, 5000);
  })();
})(typeof window !== 'undefined' ? window : globalThis);
