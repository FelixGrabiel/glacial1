/* =============================================================
   GLACIAL · TAREO — EDICIÓN CONTINUA (varias filas seguidas sin reinicios ni horas cruzadas)
   -------------------------------------------------------------
   Corrige, sobre la arquitectura vigente (un documento sync/tareos con un arreglo items, transacciones y cola local):

   1. IDENTIDAD ESTABLE: toda acción identifica  tareo + persona + campo  con la clave de tareoClavePersona() (id → DNI → nombre,
      normalizados). Si dos filas comparten clave (IDs repetidos, homónimos sin documento) se les asigna un `filaId` persistente
      (una sola vez, determinista) y la clave de fila pasa a ser «clave|#filaId». Nunca se modifica «la primera coincidencia»: una
      clave ambigua NO se aplica y se avisa. El índice solo numera.
   2. OPERACIONES CONCRETAS: cada edición es {tareoId, persona, campos cambiados, valor capturado, ts}. Se guarda aplicándola a la
      versión actual leída DENTRO de la transacción (no una copia vieja de la persona). Campo a campo gana el cambio más reciente
      (persona.camposTs), así dos sesiones que editan campos distintos de la misma persona conservan ambos.
   3. ACTUALIZACIONES RECIBIDAS: el listener de sync/tareos entrega los datos remotos a reconciliar(): sobre lo recibido se vuelven a
      aplicar las operaciones aún no confirmadas, de modo que ninguna edición pendiente se pierde ni se revierte en pantalla.
   4. SIN RECONSTRUIR LA TABLA: se actualiza solo la fila afectada y los indicadores; el orden de la vista se congela mientras se
      trabaja (se reordena con una acción explícita). Una fila con un campo activo no se reemplaza.
   5. ESTADO DE GUARDADO: Guardando / Guardado (solo tras confirmar la transacción) / No se pudo guardar · Reintentar. Los
      pendientes se conservan, los errores no bloquean y avisa al salir con cambios sin confirmar.
   ============================================================= */
(function instalarEdicionContinuaTareo(){
  'use strict';

  /* Campos que edita el supervisor (los calculados —horas, extras, tardanza— se recalculan sobre el trabajador correcto). */
  const CAMPOS = ['asistencia','registradoEn','registradoPor','horaIngreso','horaIngresoAuto','salidaRefrigerio','retornoRefrigerio','horaSalida','refrigerio'];

  const copia = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const num = v => Number(v) || 0;
  const esc = v => (typeof escaparHTML === 'function' ? escaparHTML(v) : String(v == null ? '' : v));

  /* ---------- relojes e identificadores ---------- */
  let ultimoTs = 0;
  function nuevoTs(){
    const t = typeof tareoAhoraMs === 'function' ? tareoAhoraMs() : Date.now();
    ultimoTs = Math.max(t, ultimoTs + 1);
    return ultimoTs;
  }
  function hash(texto){
    let h = 5381;
    for(let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  let contadorFila = 0;
  function nuevoFilaId(){
    contadorFila++;
    return 'F' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + contadorFila.toString(36);
  }

  /* ---------- identidad ---------- */
  const claveBase = p => String(tareoClavePersona(p));
  function clavesUnicas(lista){
    const cuenta = new Map();
    lista.forEach(p => { const k = claveBase(p); cuenta.set(k, (cuenta.get(k) || 0) + 1); });
    const vistos = new Map();
    return lista.map(p => {
      const k = claveBase(p);
      if(cuenta.get(k) === 1) return k;
      if(p.filaId) return k + '|#' + p.filaId;
      const n = (vistos.get(k) || 0) + 1; vistos.set(k, n);
      return k + '|~' + n;                          // sin filaId: por orden (el aviso de ambigüedad lo ve el usuario)
    });
  }
  /* Clave que se pone en la fila (onclick) y en data-tareo-fila: la clave de la persona o, si se repite, con su filaId. */
  function claveFila(persona, lista){
    const k = claveBase(persona);
    if(persona.filaId && Array.isArray(lista) && lista.filter(x => claveBase(x) === k).length > 1) return k + '|#' + persona.filaId;
    return k;
  }
  /* Filas que comparten identificación y aún no tienen filaId: el identificador se asigna UNA sola vez, en la nube (dentro de una
     transacción), para que todos los dispositivos usen el mismo. Localmente solo se detecta y se solicita; mientras tanto la fila de
     una clave repetida no se edita (se avisa). */
  const idsSolicitados = new Map();
  function gruposRepetidos(lista){
    const g = new Map();
    lista.forEach((p, i) => { const k = claveBase(p); if(!g.has(k)) g.set(k, []); g.get(k).push({p, i}); });
    return [...g.entries()].filter(([, m]) => m.length > 1);
  }
  function faltanIds(tareo){
    const lista = tareo && Array.isArray(tareo.personal) ? tareo.personal : null;
    return !!lista && lista.length > 1 && gruposRepetidos(lista).some(([, m]) => m.some(x => !x.p.filaId));
  }
  /* Asignación determinista (solo se ejecuta sobre el documento de la nube): devuelve true si cambió algo. */
  function asignarIds(tareo){
    let cambio = false;
    gruposRepetidos(tareo.personal || []).forEach(([k, m]) => {
      const estaticos = x => [x.p.nombre, x.p.cargo, x.p.linea, x.p.dni, x.p.trabajadorId, x.p.area].map(v => String(v || '')).join('|');
      const usados = new Set(m.filter(x => x.p.filaId).map(x => x.p.filaId));
      m.filter(x => !x.p.filaId).sort((a, b) => estaticos(a).localeCompare(estaticos(b)) || a.i - b.i).forEach((x, n) => {
        let id = 'F-' + hash(String(tareo.id || '') + '|' + k + '|' + n);
        while(usados.has(id)) id += 'x';
        usados.add(id); x.p.filaId = id; cambio = true;
      });
    });
    return cambio;
  }
  function persistirIds(tareoId){
    try{
      const local = copiaLocal(tareoId);
      if(!local || typeof tareoAutorizadoEscribir !== 'function' || !tareoAutorizadoEscribir(local)) return;
      if(typeof db === 'undefined' || typeof db.runTransaction !== 'function') return;
      const ref = db.collection('sync').doc('tareos');
      const operacion = window._tareoColaGuardado.catch(() => undefined).then(() => db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const items = (snap.exists && Array.isArray(snap.data().items)) ? snap.data().items.slice() : [];
        const i = items.findIndex(t => t.id === tareoId);
        if(i < 0 || !asignarIds(items[i])) return false;
        tx.set(ref, {items, updatedAt: Date.now()});
        return true;
      }));
      window._tareoColaGuardado = operacion;
      operacion.catch(e => console.warn('Tareo: no se pudieron guardar los identificadores de fila:', e && e.message || e));
    }catch(e){ console.warn('Tareo: identificadores de fila:', e && e.message || e); }
  }
  function asegurarFilaIds(tareo){
    try{
      if(!tareo || !faltanIds(tareo)) return;
      const ahora = Date.now();
      if(ahora - (idsSolicitados.get(tareo.id) || 0) < 15000) return;
      idsSolicitados.set(tareo.id, ahora);
      setTimeout(() => persistirIds(tareo.id), 0);
    }catch(_){ /* no crítico */ }
  }
  /* Busca a la persona de una operación o de una clave de fila. */
  function resolver(tareo, clave, filaId){
    const lista = tareo && Array.isArray(tareo.personal) ? tareo.personal : [];
    clave = String(clave == null ? '' : clave);
    const i = clave.indexOf('|#');
    if(i > 0){
      const fid = clave.slice(i + 2), p = lista.find(x => x.filaId === fid);
      return p ? {persona: p, clave: clave.slice(0, i), filaId: fid} : {};
    }
    const j = clave.indexOf('|~');
    if(j > 0){
      const base = clave.slice(0, j), n = Number(clave.slice(j + 2));
      const c = lista.filter(x => claveBase(x) === base);
      return c[n - 1] ? {persona: c[n - 1], clave: base} : {};
    }
    if(filaId){
      const p = lista.find(x => x.filaId === filaId && claveBase(x) === clave);
      if(p) return {persona: p, clave, filaId};
    }
    const c = lista.filter(x => claveBase(x) === clave);
    if(c.length === 1) return {persona: c[0], clave, filaId: c[0].filaId || ''};
    if(c.length > 1) return {ambigua: true};
    return {};
  }

  /* ---------- hora por campo ---------- */
  function tsDe(p, c){
    const t = p && p.camposTs;
    if(t && t[c] != null) return num(t[c]);
    if(t && t.__base != null) return num(t.__base);
    return num(p && p.actualizadoEn);
  }
  function asegurarTs(p){
    if(!p.camposTs) p.camposTs = {__base: num(p.actualizadoEn)};
    return p.camposTs;
  }
  function recalcular(p, tareoConfig){
    if(typeof recalcularPersonaTareo === 'function' && tareoConfig) recalcularPersonaTareo(p, tareoConfig);
  }

  /* Mezcla dos copias de la MISMA persona campo a campo (gana el cambio más reciente de cada campo). */
  function mezclarPersona(a, b){
    const baseEsA = num(a.actualizadoEn) >= num(b.actualizadoEn);
    const base = copia(baseEsA ? a : b), otro = baseEsA ? b : a;
    const ts = Object.assign({}, asegurarTs(base));
    CAMPOS.forEach(c => {
      const tb = tsDe(base, c), to = tsDe(otro, c);
      if(to > tb){
        if(c in otro) base[c] = copia(otro[c]); else delete base[c];
        ts[c] = to;
      }else if(ts[c] == null && (c in base) && tb > 0){
        ts[c] = tb;
      }
    });
    ts.__base = Math.max(num(ts.__base), num(otro.camposTs && otro.camposTs.__base));
    base.camposTs = ts;
    base.actualizadoEn = Math.max(num(a.actualizadoEn), num(b.actualizadoEn));
    if(!base.filaId && otro.filaId) base.filaId = otro.filaId;
    return base;
  }
  /* union=false: la lista y el orden son los de «principal» (Producción); union=true: unión de ambas (Mantenimiento). */
  function mezclarListas(principal, otra, union, config){
    const kp = clavesUnicas(principal), ko = clavesUnicas(otra);
    const mapaOtra = new Map(); otra.forEach((p, i) => mapaOtra.set(ko[i], p));
    const salida = [], vistos = new Set();
    principal.forEach((p, i) => {
      const o = mapaOtra.get(kp[i]);
      const m = o ? mezclarPersona(p, o) : copia(p);
      recalcular(m, config);
      salida.push(m); vistos.add(kp[i]);
    });
    if(union){
      otra.forEach((p, i) => { if(!vistos.has(ko[i])){ const m = copia(p); recalcular(m, config); salida.push(m); } });
    }
    return salida;
  }

  /* ---------- operaciones ---------- */
  function captura(persona){
    const o = {};
    CAMPOS.forEach(c => { o[c] = copia(persona[c]); });
    return o;
  }
  function diferencias(antes, persona){
    const campos = {};
    CAMPOS.forEach(c => {
      if(JSON.stringify(antes[c]) !== JSON.stringify(persona[c])) campos[c] = persona[c] === undefined ? '' : copia(persona[c]);
    });
    return campos;
  }
  function aplicarMarcas(persona, campos, ts){
    const t = asegurarTs(persona);
    Object.keys(campos).forEach(c => { t[c] = ts; });
    persona.actualizadoEn = Math.max(num(persona.actualizadoEn), ts);
  }
  function aplicarOp(tareo, op){
    const r = resolver(tareo, op.clave, op.filaId);
    if(!r.persona) return {ok: false, motivo: r.ambigua ? 'ambigua' : 'no_encontrada'};
    const p = r.persona, t = asegurarTs(p);
    let aplicados = 0;
    Object.keys(op.campos).forEach(c => {
      if(op.ts >= tsDe(p, c)){ p[c] = copia(op.campos[c]); t[c] = op.ts; aplicados++; }
    });
    p.actualizadoEn = Math.max(num(p.actualizadoEn), op.ts);
    recalcular(p, tareo);
    return {ok: true, aplicados};
  }

  const ops = [];                     // cola de operaciones de este navegador
  const oyentes = new Set();
  let secuencia = 0;
  const TTL_GUARDADO_MS = 6000;
  function notificar(){ oyentes.forEach(f => { try{ f(); }catch(_){ /* vista no disponible */ } }); }
  function alCambiar(f){ oyentes.add(f); return () => oyentes.delete(f); }

  function registrarOp(tareo, persona, campos, ts, clave){
    const op = {
      id: 'op' + (++secuencia) + '-' + ts, tareoId: tareo.id, clave: claveBase(persona), claveFila: clave || claveBase(persona),
      filaId: persona.filaId || '', nombre: persona.nombre || '', campos: copia(campos), ts, estado: 'pendiente', error: '', tGuardado: 0
    };
    ops.push(op);
    notificar();
    return op;
  }
  const sinConfirmar = tareoId => ops.filter(o => o.estado !== 'guardado' && (!tareoId || o.tareoId === tareoId));
  const hayOpsSinEnviar = tareoId => ops.some(o => o.estado === 'pendiente' && (!tareoId || o.tareoId === tareoId));
  const hayPendientes = () => sinConfirmar().length > 0 || (typeof window._tareoEscriturasPendientes === 'number' && window._tareoEscriturasPendientes > 0);

  const legacy = new Map();           // copias completas en vuelo (guardados que no son una edición de persona)
  function legacyIniciar(c){ legacy.set(c.id, c); return c; }
  function legacyTerminar(c){ if(legacy.get(c.id) === c) legacy.delete(c.id); }

  function copiaLocal(id){
    try{ const t = obtenerTareos().find(x => x.id === id); return t ? copia(t) : null; }
    catch(_){ return null; }
  }

  function enviar(){
    const lote = ops.filter(o => o.estado === 'pendiente' || o.estado === 'error');
    if(!lote.length) return;
    if(typeof db === 'undefined' || typeof db.runTransaction !== 'function'){
      lote.forEach(o => { o.estado = 'error'; o.error = 'Sin conexión con la base de datos.'; });
      notificar(); return;
    }
    lote.forEach(o => { o.estado = 'guardando'; o.error = ''; });
    window._tareoEscriturasPendientes = (window._tareoEscriturasPendientes || 0) + 1;
    notificar();
    const ref = db.collection('sync').doc('tareos');
    const ejecutar = () => db.runTransaction(async tx => {
      // Dentro de la transacción solo hay cálculo puro (puede reejecutarse): sin alertas, auditoría ni cambios visuales.
      const snap = await tx.get(ref);
      const items = (snap.exists && Array.isArray(snap.data().items)) ? snap.data().items.slice() : [];
      const resultados = [];
      lote.slice().sort((a, b) => a.ts - b.ts).forEach(op => {
        let i = items.findIndex(t => t.id === op.tareoId);
        if(i < 0){
          const local = copiaLocal(op.tareoId);
          if(!local){ resultados.push({op, ok: false, motivo: 'tareo_no_encontrado'}); return; }
          items.push(local); i = items.length - 1;
        }
        const r = aplicarOp(items[i], op);
        resultados.push(Object.assign({op}, r));
        if(r.ok) items[i].actualizadoEn = Math.max(num(items[i].actualizadoEn), op.ts);
      });
      tx.set(ref, {items, updatedAt: Date.now()});
      return resultados;
    });
    const operacion = window._tareoColaGuardado.catch(() => undefined).then(ejecutar);
    window._tareoColaGuardado = operacion;
    operacion.then(resultados => {
      const ahora = Date.now();
      (resultados || []).forEach(r => {
        if(r.ok){ r.op.estado = 'guardado'; r.op.tGuardado = ahora; r.op.error = ''; }
        else{
          r.op.estado = 'conflicto';
          r.op.error = r.motivo === 'ambigua' ? 'La fila es ambigua (varias personas con la misma identificación).'
            : r.motivo === 'tareo_no_encontrado' ? 'El tareo ya no existe.' : 'No se encontró a la persona en el tareo guardado.';
        }
      });
    }).catch(err => {
      lote.forEach(o => { if(o.estado === 'guardando'){ o.estado = 'error'; o.error = (err && err.message) || 'No se pudo guardar.'; } });
      console.error('TAREO: error guardando operaciones', err);
    }).finally(() => {
      window._tareoEscriturasPendientes = Math.max(0, (window._tareoEscriturasPendientes || 0) - 1);
      notificar();
      limpiarConfirmadas();
      if(hayOpsSinEnviar()) enviar();
      if(typeof tareoRefrescarFormularioRemoto === 'function' && !(window._tareoEscriturasPendientes > 0)) tareoRefrescarFormularioRemoto();
    });
  }
  function reintentar(){
    ops.forEach(o => { if(o.estado === 'error') o.estado = 'pendiente'; });
    notificar();
    enviar();
  }
  let limpieza = 0;
  function limpiarConfirmadas(){
    clearTimeout(limpieza);
    limpieza = setTimeout(() => {
      const ahora = Date.now();
      for(let i = ops.length - 1; i >= 0; i--) if(ops[i].estado === 'guardado' && ahora - ops[i].tGuardado > TTL_GUARDADO_MS) ops.splice(i, 1);
      notificar();
      if(ops.some(o => o.estado === 'guardado')) limpiarConfirmadas();
    }, TTL_GUARDADO_MS + 100);
  }

  /* Lo recibido de Firestore + las operaciones todavía no confirmadas (nada pendiente se pierde ni se revierte). */
  function reconciliar(items){
    try{
      if(!Array.isArray(items)) return items;
      const ahora = Date.now();
      const pend = ops.filter(o => o.estado !== 'guardado' || ahora - o.tGuardado < TTL_GUARDADO_MS);
      if(!pend.length && !legacy.size) return items;
      legacy.forEach(c => {
        const i = items.findIndex(t => t.id === c.id);
        if(i >= 0 && typeof tareoFusionar === 'function') items[i] = tareoFusionar(items[i], copia(c));
        else if(i < 0) items.push(copia(c));
      });
      pend.slice().sort((a, b) => a.ts - b.ts).forEach(op => {
        const t = items.find(x => x.id === op.tareoId);
        if(t) aplicarOp(t, op);
      });
      return items;
    }catch(e){
      console.warn('Tareo: no se pudo reconciliar la actualización recibida:', e && e.message || e);
      return items;
    }
  }

  /* ---------- vista: orden estable, filas e indicadores ---------- */
  const vista = {tareoId: '', orden: [], claves: new Set(), claveMain: []};
  function ordenarVista(tareo, personal){
    const nueva = vista.tareoId !== tareo.id;
    const ks = clavesUnicas(personal);
    if(nueva || !vista.orden.length){
      vista.tareoId = tareo.id; vista.orden = ks.slice();
      return personal;
    }
    const pos = new Map(vista.orden.map((k, i) => [k, i]));
    const pares = personal.map((p, i) => ({p, k: ks[i], o: pos.has(ks[i]) ? pos.get(ks[i]) : 1e9 + i}));
    pares.sort((a, b) => a.o - b.o);
    vista.orden = pares.map(x => x.k);
    return pares.map(x => x.p);
  }
  function resetVista(){ vista.tareoId = ''; vista.orden = []; }
  /* Quita repetidos por DNI o ID (como siempre) pero NO combina personas que solo coinciden en el nombre: dos homónimos sin documento
     son dos filas (si hay duda se conservan las marcaciones de ambos). */
  function deduplicarPersonal(lista){
    const vistos = new Set();
    return (Array.isArray(lista) ? lista : []).filter(p => {
      const claves = typeof tareoIdentidades === 'function' ? tareoIdentidades(p) : [];
      if(!claves.length) return false;
      if(claves.every(k => k.indexOf('NOM:') === 0)) return true;
      if(claves.some(k => vistos.has(k))) return false;
      claves.forEach(k => vistos.add(k));
      return true;
    });
  }
  function reordenarVista(){
    vista.orden = [];
    const t = typeof tareoObtenerActual === 'function' ? tareoObtenerActual() : null;
    if(t && typeof renderTareoFormulario === 'function' && !campoActivo()) renderTareoFormulario(t);
  }
  function registrarRender(tareo){
    vista.tareoId = tareo.id;
    vista.claves = new Set(clavesUnicas(tareo.personal || []));
  }

  function filasDom(){
    return Array.from(document.querySelectorAll('#tareo-form-view ~ .panel tr[data-tareo-fila], #main tr[data-tareo-fila]'));
  }
  function campoActivo(dentro){
    const a = document.activeElement, main = document.getElementById('main');
    if(!a || !main || !main.contains(a) || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
    return dentro ? dentro.contains(a) : true;
  }
  function firma(p){
    return [p.asistencia, p.horaIngreso, p.horaIngresoAuto, p.salidaRefrigerio, p.retornoRefrigerio, p.horaSalida, p.horasTrabajadas,
      p.horasExtras, p.tardanzaMinutos, p.refrigerio, p.salidaEditada, p.salidaOriginal, p.trabajoEnDescanso, p.linea, p.cargo].map(v => String(v == null ? '' : v)).join('¦');
  }
  function reemplazarFila(tr, persona, tareo){
    const indice = Number(tr.getAttribute('data-tareo-persona')) || 0;
    const filtro = typeof tareoNormalizarTexto === 'function' ? tareoNormalizarTexto(typeof tareoFiltroTexto === 'string' ? tareoFiltroTexto : '') : '';
    const html = renderFilaPersonalTareo(persona, indice, tareo.id, filtro, tareo.personal);
    const t = document.createElement('tbody');
    t.innerHTML = html.trim();
    const nueva = t.firstElementChild;
    if(!nueva) return;
    // Si el foco estaba en esta fila (p. ej. Enter en una hora) se devuelve al mismo control.
    let idx = -1;
    const a = document.activeElement;
    if(a && tr.contains(a)) idx = Array.from(tr.querySelectorAll('input,select,button')).indexOf(a);
    tr.replaceWith(nueva);
    if(idx >= 0){ const c = nueva.querySelectorAll('input,select,button')[idx]; if(c) c.focus({preventScroll: true}); }
  }
  function actualizarIndicadores(tareo){
    const grid = document.querySelector('#tareo-form-view ~ .tareo-kpi-grid, .tareo-kpi-grid');
    if(!grid || typeof tareoContadores !== 'function') return;
    const set = new Set(vista.claveMain);
    const lista = tareo.personal || [], ks = clavesUnicas(lista);
    const personal = lista.filter((p, i) => set.has(ks[i]));
    const c = tareoContadores(personal.length ? personal : lista, tareo.jornadaNormal);
    const k = grid.querySelectorAll('.tareo-kpi');
    if(k.length < 4) return;
    k[0].querySelector('strong').textContent = c.registrados + '/' + c.total;
    k[0].querySelector('small').textContent = c.pendientes + ' pendientes';
    k[1].querySelector('strong').textContent = c.asistieron;
    k[2].querySelector('strong').textContent = c.tardanzas;
    k[2].querySelector('strong').className = c.tardanzas ? 'tareo-warn' : '';
    k[3].querySelector('strong').textContent = c.ausencias;
  }
  /* Pone al día lo que se ve SIN reconstruir la pantalla. Devuelve false si hay un cambio de estructura (personas nuevas/quitadas). */
  function sincronizarVista(tareo, opc){
    try{
      if(!tareo || !document.getElementById('tareo-form-view') || tareo.id !== vista.tareoId) return true;
      const actuales = new Set(clavesUnicas(tareo.personal || []));
      if(actuales.size !== vista.claves.size || [...actuales].some(k => !vista.claves.has(k))) return false;
      const lista = tareo.personal || [], ks = clavesUnicas(lista);
      const porClave = new Map(lista.map((p, i) => [ks[i], p]));
      filasDom().forEach(tr => {
        const p = porClave.get(tr.getAttribute('data-tareo-fila'));
        if(!p) return;
        const f = firma(p);
        const forzar = opc && opc.persona === p;
        if(tr.getAttribute('data-tareo-firma') === f && !forzar) return;
        if(!forzar && campoActivo(tr)) return;             // se pondrá al día al salir del campo
        reemplazarFila(tr, p, tareo);
      });
      actualizarIndicadores(tareo);
      pintarEstados();
      return true;
    }catch(e){
      console.warn('Tareo: no se pudo actualizar la fila:', e && e.message || e);
      return false;
    }
  }

  function estadoDe(clave, tareoId){
    const mias = ops.filter(o => o.tareoId === tareoId && o.claveFila === clave);
    if(mias.some(o => o.estado === 'error' || o.estado === 'conflicto')) return 'error';
    if(mias.some(o => o.estado === 'pendiente' || o.estado === 'guardando')) return 'guardando';
    if(mias.some(o => o.estado === 'guardado' && Date.now() - o.tGuardado < 2500)) return 'guardado';
    return '';
  }
  function pintarEstados(){
    const filas = document.querySelectorAll('tr[data-tareo-fila]');
    filas.forEach(tr => {
      const sp = tr.querySelector('[data-tar2-est]');
      if(!sp) return;
      const e = estadoDe(tr.getAttribute('data-tareo-fila'), vista.tareoId);
      if(sp.getAttribute('data-e') === e) return;
      sp.setAttribute('data-e', e);
      sp.className = 'tar2-est' + (e ? ' tar2-est-' + e : '');
      sp.textContent = e === 'guardando' ? 'Guardando…' : e === 'guardado' ? 'Guardado ✓' : e === 'error' ? 'No se pudo guardar' : '';
      if(e === 'error'){
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'tar2-est-btn'; b.textContent = 'Reintentar';
        b.onclick = reintentar; sp.appendChild(b);
      }
    });
    const g = document.getElementById('tareo-estado-guardado');
    if(g){
      const mios = sinConfirmar(vista.tareoId);
      const err = mios.filter(o => o.estado === 'error' || o.estado === 'conflicto');
      const pend = mios.filter(o => o.estado === 'pendiente' || o.estado === 'guardando');
      const reciente = ops.some(o => o.tareoId === vista.tareoId && o.estado === 'guardado');
      let txt = '', cls = '';
      if(err.length){ txt = err.length + ' cambio(s) sin guardar'; cls = 'error'; }
      else if(pend.length){ txt = 'Guardando…'; cls = 'guardando'; }
      else if(reciente){ txt = 'Todos los cambios guardados ✓'; cls = 'guardado'; }
      if(g.getAttribute('data-e') !== cls + '|' + txt){
        g.setAttribute('data-e', cls + '|' + txt);
        g.className = 'tareo-guardado' + (cls ? ' tareo-guardado-' + cls : '');
        g.textContent = txt;
        if(cls === 'error'){
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'tar2-est-btn'; b.textContent = 'Reintentar'; b.onclick = reintentar;
          g.appendChild(b);
        }
      }
    }
  }
  alCambiar(pintarEstados);
  // Al salir de un campo, las filas que se quedaron pendientes de actualizar (por estar en uso) se ponen al día.
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      try{
        if(!campoActivo() && typeof tareoRefrescarFormularioRemoto === 'function') tareoRefrescarFormularioRemoto();
      }catch(_){ /* vista no disponible */ }
    }, 60);
  });

  /* Avisa al cerrar la pestaña con cambios sin confirmar. */
  window.addEventListener('beforeunload', evento => {
    if(sinConfirmar().length){ evento.preventDefault(); evento.returnValue = ''; return ''; }
  });

  function estilos(){
    if(typeof document === 'undefined' || document.getElementById('tareo-edicion-css')) return;
    const s = document.createElement('style'); s.id = 'tareo-edicion-css';
    s.textContent =
      '.tar2-est{display:block;font-size:11px;min-height:14px;color:#5a6b78}.tar2-est-guardando{color:#8a6d1d}.tar2-est-guardado{color:#1e7f4e}.tar2-est-error{color:#b42318;font-weight:700}' +
      '.tar2-est-btn{margin-left:6px;border:1px solid #b42318;background:#fff;color:#b42318;border-radius:6px;padding:1px 8px;font-size:11px;cursor:pointer}' +
      '.tareo-guardado{display:inline-flex;align-items:center;gap:6px;margin-left:10px;font-size:12px;color:#5a6b78}' +
      '.tareo-guardado-guardando{color:#8a6d1d}.tareo-guardado-guardado{color:#1e7f4e}.tareo-guardado-error{color:#b42318;font-weight:700}';
    document.head.appendChild(s);
  }
  if(typeof document !== 'undefined') estilos();

  window.TareoEd = {
    CAMPOS, nuevoTs, nuevoFilaId, clavesUnicas, claveFila, asegurarFilaIds, asignarIds, faltanIds, resolver, tsDe, mezclarPersona, mezclarListas,
    resetVista, deduplicarPersonal, captura, diferencias, aplicarMarcas, aplicarOp, registrarOp, enviar, reintentar, reconciliar, hayOpsSinEnviar, hayPendientes,
    sinConfirmar, legacyIniciar, legacyTerminar, ordenarVista, reordenarVista, registrarRender, sincronizarVista, pintarEstados,
    campoActivo, alCambiar, firma, estado: () => ops.map(o => Object.assign({}, o)),
    setClaveMain(ks){ vista.claveMain = ks.slice(); }
  };
})();
