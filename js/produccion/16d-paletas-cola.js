/* =============================================================
   GLACIAL · PRODUCCIÓN › PALETAS › COLA SIN CONEXIÓN CON IDEMPOTENCIA (26/11/2026) · docs/produccion/paletas-rapido.md
   Núcleo sin pantalla (no toca el DOM): guarda en el equipo cada registro de paleta ANTES de enviarlo, lo reintenta hasta que el servidor lo confirme
   y nunca lo duplica.
     · Cada registro lleva clientEventId (UUID, nace al tocar el botón) y capturadoEn (ISO, el instante exacto del toque). El id del registro es
       'pal_' + clientEventId: reenviar el mismo evento actualiza la misma fila, no crea otra (PK de fs_items). El servidor lo refuerza con
       supabase/migraciones/glacial_68_paletas_integridad.sql (libro glacial_fs.paletas_eventos, client_event_id UNIQUE).
     · La cola vive en localStorage (clave glacial_paletas_cola_v1) y sobrevive a recargar la página o cerrar el navegador. Si localStorage no está
       disponible (modo privado) sigue funcionando en memoria mientras la pestaña esté abierta.
     · Se sincroniza al volver la conexión («online»), al enfocar la ventana, cada 30 s y tras cada alta, siempre EN ORDEN de captura.
     · Funciones puras reutilizables: acumulado visible (confirmados + pendientes), último registro, tramo vigente de la Secuencia del turno y
       tramo previo sin hora de corte. No depende de otros archivos: el envío real (enviar) lo inyecta js/produccion/16e-paletas-rapido.js.
   Expone window.glacialPaletasCola (y Glacial.Paletas.Cola si existe el espacio de nombres).
   ============================================================= */
(function(root){
  'use strict';
  const CLAVE = 'glacial_paletas_cola_v1';
  const MAX_REINTENTOS_DESCONOCIDOS = 8;

  /* ---------- identificadores y tiempo ---------- */
  function uuid(){
    const c = root.crypto;
    if(c && typeof c.randomUUID === 'function') return c.randomUUID();
    const b = new Uint8Array(16);
    if(c && typeof c.getRandomValues === 'function') c.getRandomValues(b); else for(let i = 0; i < 16; i++) b[i] = Math.random() * 256 | 0;
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const iso = ms => new Date(ms).toISOString();

  /* Completa un registro con lo que lo hace idempotente: id estable, clientEventId y el instante exacto de captura. */
  function nuevoEvento(registro, ahoraMs, idEvento){
    const ms = Number.isFinite(ahoraMs) ? ahoraMs : Date.now();
    const evento = idEvento || uuid();
    const r = Object.assign({}, registro, {
      id: registro && registro.id ? registro.id : 'pal_' + evento,
      clientEventId: evento,
      capturadoEn: iso(ms),
      creadoEn: ms,            // «el último manda» (ultimoEstado en 16-paletas.js) ordena por creadoEn: debe ser el instante del toque, no el de la subida
      actualizadoEn: ms
    });
    return { clientEventId: evento, capturadoMs: ms, registro: r, estado: 'pendiente', intentos: 0, ultimoError: '' };
  }

  /* ---------- funciones puras sobre listas de registros ---------- */
  /* Orden de «el último»: igual que ultimoEstado() de 16-paletas.js (creadoEn y, si empatan, la hora). */
  function esPosterior(a, b){
    if(!b) return true;
    const ca = num(a.creadoEn), cb = num(b.creadoEn);
    if(ca !== cb) return ca > cb;
    return String(a.hora || '') >= String(b.hora || '');
  }
  /* Acumulado de paletas COMPLETAS: lo que dice el último registro completo de la lista (confirmados + pendientes ya filtrados por contexto). */
  function acumuladoDe(registros){
    let ultimo = null;
    (registros || []).forEach(r => { if(r && r.tipoPaleta !== 'INCOMPLETA' && esPosterior(r, ultimo)) ultimo = r; });
    return { paletas: ultimo ? num(ultimo.paletas) : 0, registro: ultimo };
  }
  function ultimoDe(registros){
    let ultimo = null;
    (registros || []).forEach(r => { if(r && esPosterior(r, ultimo)) ultimo = r; });
    return ultimo;
  }
  /* Une confirmados y pendientes sin repetir (un pendiente ya confirmado por el servidor aparece una sola vez). */
  function unir(confirmados, pendientes){
    const vistos = new Set((confirmados || []).map(r => r && r.id));
    const eventos = new Set((confirmados || []).map(r => r && r.clientEventId).filter(Boolean));
    return (confirmados || []).concat((pendientes || []).filter(r => r && !vistos.has(r.id) && !(r.clientEventId && eventos.has(r.clientEventId))));
  }
  function minutosDesde(ms, ahoraMs){ return ms ? Math.max(0, Math.floor((num(ahoraMs) - num(ms)) / 60000)) : null; }
  function textoMinutos(m){
    if(m === null) return '';
    if(m < 1) return 'hace menos de 1 min';
    if(m < 60) return 'hace ' + m + ' min';
    const h = Math.floor(m / 60), r = m % 60;
    return 'hace ' + h + ' h' + (r ? ' ' + r + ' min' : '');
  }

  /* Secuencia del turno. tramos: [{orden, tipoFin:'HORA'|'CANTIDAD'|'CIERRE', horaFin, cantidadObjetivo, marca, presentacion}] en orden.
     o = { ahoraMs, msHora(hhmm) → ms | null, unidades(tramo) → unidades ya producidas del tramo }.
     Vigente = el primer tramo que aún no terminó. Si todos terminaron devuelve null (no se autoselecciona nada). */
  function tramoVigente(tramos, o){
    const lista = (tramos || []).slice().sort((a, b) => num(a.orden) - num(b.orden));
    for(const t of lista){
      if(t.tipoFin === 'HORA' && t.horaFin){
        const ms = o.msHora ? o.msHora(t.horaFin) : null;
        if(ms === null || ms === undefined || num(o.ahoraMs) < ms) return t;
        continue;
      }
      if(t.tipoFin === 'CANTIDAD'){
        if(num(o.unidades ? o.unidades(t) : 0) < num(t.cantidadObjetivo)) return t;
        continue;
      }
      return t;                                   // CIERRE (o HORA sin hora): sigue vigente
    }
    return null;
  }
  /* El último tramo de la secuencia, si no tiene hora de corte (hasta cierre de turno, o por hora pero sin hora). Por cantidad ya tiene su fin. */
  function tramoPrevioSinCorte(tramos){
    const lista = (tramos || []).slice().sort((a, b) => num(a.orden) - num(b.orden));
    const t = lista[lista.length - 1];
    if(!t) return null;
    return (t.tipoFin === 'CIERRE' || (t.tipoFin === 'HORA' && !t.horaFin)) ? t : null;
  }

  /* ---------- clasificación de errores del envío ---------- */
  function clasificarError(e){
    const code = String((e && (e.code || e.codigo)) || '').replace(/^firestore\//, '');
    const msg = String((e && e.message) || e || '');
    if((e && e.red) || code === 'unavailable' || /failed to fetch|networkerror|network request|load failed|timeout|offline|sin conexi/i.test(msg)) return 'red';
    if(/\b23505\b|duplicate key|ya pertenece a otro registro|paletas_eventos/i.test(code + ' ' + msg)) return 'duplicado';
    if(code === 'unauthenticated') return 'sesion';
    if(code === 'aborted' || (e && e.conflicto)) return 'reintentar';
    if(code === 'permission-denied' || /\b23514\b|paletas:/i.test(code + ' ' + msg)) return 'rechazado';
    return 'reintentar';
  }

  /* ---------- almacenamiento ---------- */
  let memoria = null;                              // copia en memoria cuando localStorage falla
  function leerAlmacen(){
    try{
      const t = root.localStorage && root.localStorage.getItem(CLAVE);
      if(t){ const d = JSON.parse(t); if(d && Array.isArray(d.eventos)) return d.eventos; }
      return [];
    }catch(_){ return memoria ? memoria.slice() : []; }
  }
  function escribirAlmacen(eventos){
    memoria = eventos.slice();
    try{ if(root.localStorage) root.localStorage.setItem(CLAVE, JSON.stringify({ v: 1, eventos })); return true; }
    catch(_){ return false; }                      // cuota llena o modo privado: queda en memoria
  }

  const S = { eventos: leerAlmacen(), enVuelo: null, enviar: null, fallos: 0, reloj: null, oyentes: new Set(), iniciado: false, ahoraMs: () => Date.now() };

  function notificar(){ S.oyentes.forEach(f => { try{ f(); }catch(_){ /* un oyente no rompe a otro */ } }); }
  function persistir(){ escribirAlmacen(S.eventos); notificar(); }
  function alCambiar(f){ S.oyentes.add(f); return () => S.oyentes.delete(f); }
  function recargar(){ S.eventos = leerAlmacen(); notificar(); }

  const todos = () => S.eventos.slice();
  const pendientes = () => S.eventos.filter(e => e.estado === 'pendiente');
  const rechazados = () => S.eventos.filter(e => e.estado === 'rechazado');
  /* Registros pendientes de subir (los rechazados no cuentan en el acumulado visible: el servidor los rechazó). */
  const registrosPendientes = () => pendientes().sort((a, b) => a.capturadoMs - b.capturadoMs).map(e => e.registro);

  function encolar(evento){
    if(S.eventos.some(e => e.clientEventId === evento.clientEventId)) return false;   // el mismo toque no entra dos veces
    S.eventos.push(evento);
    persistir();
    return true;
  }
  function quitar(clientEventId){ S.eventos = S.eventos.filter(e => e.clientEventId !== clientEventId); }
  function descartar(clientEventId){ quitar(clientEventId); persistir(); }
  function reintentarRechazados(){ S.eventos.forEach(e => { if(e.estado === 'rechazado'){ e.estado = 'pendiente'; e.intentos = 0; } }); persistir(); sincronizar(); }

  const enLinea = () => !(root.navigator && root.navigator.onLine === false);

  /* ---------- sincronización ---------- */
  function configurar(opciones){
    if(opciones.enviar) S.enviar = opciones.enviar;
    if(opciones.ahoraMs) S.ahoraMs = opciones.ahoraMs;
  }

  function programar(){
    clearTimeout(S.reloj); S.reloj = null;
    if(!pendientes().length) return;
    const espera = Math.min(60000, 3000 * Math.pow(2, Math.min(S.fallos, 5)));
    S.reloj = setTimeout(() => { sincronizar(); }, espera);
  }

  /* Un solo envío a la vez; si ya hay uno en curso se devuelve el mismo. Resultado: { subidos, pendientes, rechazados }. */
  function sincronizar(){
    if(S.enVuelo) return S.enVuelo;
    S.enVuelo = (async () => {
      await null;                                  // cede un turno: S.enVuelo debe asignarse ANTES de que la corrida pueda terminar (si no, quedaría «en vuelo» para siempre)
      let subidos = 0;
      try{
        if(!S.enviar || !enLinea()) return { subidos, pendientes: pendientes().length, rechazados: rechazados().length };
        const orden = pendientes().sort((a, b) => a.capturadoMs - b.capturadoMs);
        for(const ev of orden){
          if(!S.eventos.includes(ev) || ev.estado !== 'pendiente') continue;
          try{
            await S.enviar(ev.registro);
            quitar(ev.clientEventId); subidos++; S.fallos = 0; persistir();
          }catch(e){
            const tipo = clasificarError(e);
            ev.intentos = num(ev.intentos) + 1; ev.ultimoError = String((e && e.message) || e || 'error').slice(0, 300);
            if(tipo === 'duplicado'){ quitar(ev.clientEventId); subidos++; persistir(); continue; }   // el servidor ya lo tiene
            if(tipo === 'rechazado'){ ev.estado = 'rechazado'; persistir(); continue; }               // no se reintenta solo; los siguientes sí suben
            S.fallos++;
            if(tipo === 'reintentar' && ev.intentos >= MAX_REINTENTOS_DESCONOCIDOS){ ev.estado = 'rechazado'; persistir(); continue; }
            persistir();
            break;                                                                                    // red o sesión: se conserva el orden, se reintenta después
          }
        }
        return { subidos, pendientes: pendientes().length, rechazados: rechazados().length };
      } finally {
        S.enVuelo = null;
        programar();
        notificar();
      }
    })();
    return S.enVuelo;
  }

  /* Texto del indicador de sincronización. */
  function estado(){
    const p = pendientes().length, r = rechazados().length, on = enLinea();
    let texto, clase;
    if(r){ texto = r + (r === 1 ? ' registro rechazado' : ' registros rechazados') + (p ? ' · ' + p + ' pendientes por subir' : ''); clase = 'error'; }
    else if(p){ texto = (on ? '' : 'Sin conexión · ') + p + (p === 1 ? ' pendiente por subir' : ' pendientes por subir'); clase = on ? 'subiendo' : 'sin-conexion'; }
    else if(!on){ texto = 'Sin conexión'; clase = 'sin-conexion'; }
    else { texto = 'En línea'; clase = 'en-linea'; }
    return { texto, clase, pendientes: p, rechazados: r, enLinea: on, sincronizando: !!S.enVuelo };
  }

  /* Enganches del navegador (una sola vez). */
  function iniciar(){
    if(S.iniciado || typeof root.addEventListener !== 'function') return;
    S.iniciado = true;
    root.addEventListener('online', () => { S.fallos = 0; sincronizar(); notificar(); });
    root.addEventListener('offline', () => notificar());
    root.addEventListener('focus', () => { sincronizar(); });
    root.addEventListener('storage', e => { if(!e || e.key === CLAVE){ recargar(); } });                 // otra pestaña cambió la cola
    if(root.document && typeof root.document.addEventListener === 'function')
      root.document.addEventListener('visibilitychange', () => { if(root.document.visibilityState === 'visible') sincronizar(); });
    setInterval(() => { if(pendientes().length) sincronizar(); }, 30000);
    if(pendientes().length) setTimeout(sincronizar, 1500);                                                // pendientes de una sesión anterior
  }

  const API = {
    CLAVE, uuid, nuevoEvento, acumuladoDe, ultimoDe, unir, minutosDesde, textoMinutos, tramoVigente, tramoPrevioSinCorte, clasificarError,
    encolar, descartar, reintentarRechazados, todos, pendientes, rechazados, registrosPendientes, sincronizar, configurar, estado, alCambiar, iniciar, recargar
  };
  root.glacialPaletasCola = API;
  if(root.Glacial && typeof root.Glacial.exponer === 'function') root.Glacial.exponer('Paletas', { Cola: API });
})(typeof window !== 'undefined' ? window : globalThis);
