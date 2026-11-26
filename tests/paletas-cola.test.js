/* Paletas · captura al minuto: cola sin conexión con idempotencia (js/produccion/16d-paletas-cola.js) y pantalla rápida (16e-paletas-rapido.js).
   La pantalla se prueba con un «db» falso en memoria que se comporta como el puente (transacción leer-modificar-escribir) y que puede quedar sin red.
   Uso: node tests/paletas-cola.test.js */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.resolve(__dirname, '..');
let fallas = 0;
const ok = (c, m) => { console.log((c ? '✔ ' : '✘ FALLA ') + m); if (!c) fallas++; };
const leer = f => fs.readFileSync(path.join(R, f), 'utf8');
const base = { console, Date, Promise, Map, Set, WeakSet, WeakMap, Array, Object, String, Number, JSON, Error, RegExp, Math, Intl, Uint8Array, setTimeout, clearTimeout, setInterval: () => 0, URLSearchParams };

/* ---------- entorno: window + localStorage compartible entre «páginas» ---------- */
function nuevoEntorno(almacen, extra){
  const sb = Object.assign({}, base, extra || {});
  vm.createContext(sb); sb.window = sb;
  const mem = almacen || new Map();
  sb.localStorage = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => mem.delete(k) };
  sb.navigator = { onLine: true };
  sb.addEventListener = () => {};
  sb.crypto = require('crypto').webcrypto;
  sb.__mem = mem;
  return sb;
}
const cargar = (sb, f) => vm.runInContext(leer(f), sb, { filename: f });
const dormir = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  /* ================= 16d: reglas puras ================= */
  const A = nuevoEntorno(); cargar(A, 'js/produccion/16d-paletas-cola.js');
  const Q = A.glacialPaletasCola;
  const reg = (id, paletas, creadoEn, extra) => Object.assign({ id, tipoPaleta: 'COMPLETA', paletas, creadoEn, hora: '10:00' }, extra);

  ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(Q.uuid()) && Q.uuid() !== Q.uuid(), 'uuid(): formato v4 y distinto cada vez');
  const ms0 = Date.UTC(2026, 10, 26, 19, 7, 31, 250);
  const ev = Q.nuevoEvento({ linea: 'PET1', paletas: 6 }, ms0);
  ok(ev.registro.id === 'pal_' + ev.clientEventId && ev.registro.clientEventId === ev.clientEventId, 'nuevoEvento(): el id del registro es pal_<clientEventId> (reenviar el evento actualiza la misma fila)');
  ok(ev.registro.capturadoEn === '2026-11-26T19:07:31.250Z' && ev.registro.creadoEn === ms0 && ev.registro.actualizadoEn === ms0, 'nuevoEvento(): capturadoEn es el ISO exacto del toque y creadoEn = ese instante (conserva «el último manda»)');
  ok(Q.acumuladoDe([reg('a', 3, 100), reg('b', 5, 300), reg('c', 4, 200), reg('s', 1, 400, { tipoPaleta: 'INCOMPLETA' })]).paletas === 5, 'acumuladoDe(): manda el último registro de paletas COMPLETAS; el saldo incompleto no cuenta');
  ok(Q.acumuladoDe([]).paletas === 0, 'acumuladoDe(): sin registros = 0');
  const unidos = Q.unir([reg('a', 3, 100, { clientEventId: 'x' })], [reg('a', 3, 100), reg('p', 4, 500, { clientEventId: 'x' }), reg('q', 4, 600)]);
  ok(unidos.length === 2 && Q.acumuladoDe(unidos).paletas === 4, 'unir(): un pendiente ya confirmado (mismo id o mismo clientEventId) no se cuenta dos veces');
  ok(Q.textoMinutos(0) === 'hace menos de 1 min' && Q.textoMinutos(7) === 'hace 7 min' && Q.textoMinutos(135) === 'hace 2 h 15 min' && Q.minutosDesde(0, 1000) === null, 'textoMinutos / minutosDesde');

  const tr = (orden, tipoFin, extra) => Object.assign({ id: 't' + orden, orden, tipoFin, marca: 'M' + orden }, extra);
  const hora = h => { const [hh, mm] = h.split(':').map(Number); return Date.UTC(2026, 10, 26, hh, mm); };
  const o = (ahora, prod) => ({ ahoraMs: hora(ahora), msHora: hora, unidades: t => (prod || {})[t.id] || 0 });
  ok(Q.tramoVigente([tr(1, 'HORA', { horaFin: '12:00' }), tr(2, 'CIERRE')], o('11:00')).id === 't1', 'tramoVigente: antes de la hora de corte manda el tramo 1');
  ok(Q.tramoVigente([tr(1, 'HORA', { horaFin: '12:00' }), tr(2, 'CIERRE')], o('12:00')).id === 't2', 'tramoVigente: a la hora de corte pasa al tramo 2');
  ok(Q.tramoVigente([tr(1, 'CANTIDAD', { cantidadObjetivo: 1000 }), tr(2, 'CIERRE')], o('09:00', { t1: 1000 })).id === 't2', 'tramoVigente: un tramo por cantidad termina al llegar a su objetivo');
  ok(Q.tramoVigente([tr(2, 'CIERRE'), tr(1, 'HORA', { horaFin: '12:00' })], o('11:00')).id === 't1', 'tramoVigente: ordena por «orden» aunque lleguen desordenados');
  ok(Q.tramoVigente([tr(1, 'HORA', { horaFin: '08:00' })], o('11:00')) === null && Q.tramoVigente([], o('11:00')) === null, 'tramoVigente: si todos terminaron o no hay secuencia → null (no se autoselecciona)');
  ok(Q.tramoPrevioSinCorte([tr(1, 'HORA', { horaFin: '12:00' }), tr(2, 'CIERRE')]).id === 't2' && Q.tramoPrevioSinCorte([tr(1, 'HORA', { horaFin: '' })]).id === 't1' &&
     Q.tramoPrevioSinCorte([tr(1, 'HORA', { horaFin: '12:00' })]) === null && Q.tramoPrevioSinCorte([tr(1, 'CANTIDAD', { cantidadObjetivo: 5 })]) === null, 'tramoPrevioSinCorte: solo «hasta el cierre» o «hora» sin hora; por cantidad o con hora ya tienen su fin');
  const cl = Q.clasificarError;
  ok(cl({ red: true }) === 'red' && cl({ code: 'unavailable' }) === 'red' && cl(new Error('Failed to fetch')) === 'red', 'clasificarError: caídas de red');
  ok(cl({ message: 'duplicate key value violates unique constraint "paletas_eventos_pkey"' }) === 'duplicado' && cl({ message: 'paletas: el evento x ya pertenece a otro registro (duplicado)' }) === 'duplicado', 'clasificarError: duplicado del servidor = ya subido');
  ok(cl({ code: 'permission-denied' }) === 'rechazado' && cl({ message: 'paletas: paletas debe ser un número >= 0' }) === 'rechazado' && cl({ code: 'unauthenticated' }) === 'sesion' && cl({ conflicto: true, code: 'aborted' }) === 'reintentar', 'clasificarError: rechazos, sesión y conflictos');

  /* ---------- persistencia y sincronización ---------- */
  const mem = new Map();
  const P1 = nuevoEntorno(mem); cargar(P1, 'js/produccion/16d-paletas-cola.js');
  const q1 = P1.glacialPaletasCola;
  q1.encolar(q1.nuevoEvento({ linea: 'PET1', paletas: 1, marca: 'A' }, 1000));
  q1.encolar(q1.nuevoEvento({ linea: 'PET1', paletas: 2, marca: 'A' }, 2000));
  const P2 = nuevoEntorno(mem); cargar(P2, 'js/produccion/16d-paletas-cola.js');
  ok(P2.glacialPaletasCola.pendientes().length === 2 && P2.glacialPaletasCola.registrosPendientes().map(r => r.paletas).join() === '1,2', 'la cola sobrevive a recargar la página (localStorage) y conserva el orden de captura');
  const evRep = q1.pendientes()[0];
  ok(q1.encolar(evRep) === false && q1.pendientes().length === 2, 'el mismo evento no entra dos veces a la cola');

  const subidas = []; let red = false;
  const Z = nuevoEntorno(); cargar(Z, 'js/produccion/16d-paletas-cola.js'); const z = Z.glacialPaletasCola;
  z.encolar(z.nuevoEvento({ paletas: 3 }, 3000)); z.encolar(z.nuevoEvento({ paletas: 1 }, 1000)); z.encolar(z.nuevoEvento({ paletas: 2 }, 2000));
  z.configurar({ enviar: async r => { if (red) throw { red: true, message: 'sin red' }; subidas.push(r.paletas); return 'ok'; } });
  red = true; await z.sincronizar();
  ok(z.pendientes().length === 3 && subidas.length === 0 && z.estado().clase === 'subiendo', 'sin red: nada se pierde, los 3 siguen pendientes (' + z.estado().texto + ')');
  Z.navigator.onLine = false; await z.sincronizar(); await z.sincronizar();           // offline: termina de inmediato, dos veces seguidas
  ok(z.estado().texto === 'Sin conexión · 3 pendientes por subir' && z.estado().clase === 'sin-conexion', 'indicador sin conexión: «' + z.estado().texto + '»');
  Z.navigator.onLine = true; red = false;
  ok(z.estado().sincronizando === false, 'una sincronización sin conexión (que termina al instante) no deja la cola «en vuelo» para siempre');
  const [r1, r2] = await Promise.all([z.sincronizar(), z.sincronizar()]);
  ok(subidas.join() === '1,2,3' && z.pendientes().length === 0 && r1 === r2, 'al volver la red sube EN ORDEN de captura (1,2,3) y una sola corrida atiende varias llamadas a la vez');
  ok(z.estado().texto === 'En línea' && z.estado().clase === 'en-linea', 'cola vacía: «En línea»');

  const D = nuevoEntorno(); cargar(D, 'js/produccion/16d-paletas-cola.js'); const d = D.glacialPaletasCola;
  const llamadas = [];
  d.encolar(d.nuevoEvento({ paletas: 1 }, 1)); d.encolar(d.nuevoEvento({ paletas: 2 }, 2)); d.encolar(d.nuevoEvento({ paletas: 3 }, 3));
  d.configurar({ enviar: async r => { llamadas.push(r.paletas); if (r.paletas === 1) throw { message: 'duplicate key value violates unique constraint' }; if (r.paletas === 2) throw { code: 'permission-denied', message: 'sin permiso' }; return 'ok'; } });
  await d.sincronizar();
  ok(llamadas.join() === '1,2,3' && d.pendientes().length === 0 && d.rechazados().length === 1, 'duplicado del servidor = ya subido; un rechazo queda aparte y NO bloquea a los siguientes');
  ok(/1 registro rechazado/.test(d.estado().texto) && d.estado().clase === 'error', 'indicador con rechazados: «' + d.estado().texto + '»');
  d.descartar(d.rechazados()[0].clientEventId);
  ok(d.rechazados().length === 0 && d.todos().length === 0, 'descartar() quita el rechazado');

  /* ================= 16e: pantalla rápida con db falso ================= */
  const hoy = '2026-11-26';
  function pantalla(){
    const sb = nuevoEntorno(null, { alert: m => { sb.__alertas.push(m); }, confirm: () => true });
    sb.__alertas = [];
    sb.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, activeElement: null };
    cargar(sb, 'js/produccion/16d-paletas-cola.js');
    /* servidor falso: un documento sync/paletas {items}; «caido» = sin red; «perderRespuesta» = escribe pero la respuesta no llega */
    sb.__srv = { items: [], prog: [], caido: false, perderRespuesta: false, escrituras: 0 };
    sb.db = {
      collection: () => ({ doc: id => ({ id }) }),
      runTransaction: async fn => {
        if (sb.__srv.caido) throw { red: true, message: 'sin red' };
        let pendiente = null;
        let destino = null;
        const tx = { get: async ref => ({ exists: true, data: () => ({ items: JSON.parse(JSON.stringify(ref.id === 'programaciones' ? sb.__srv.prog : sb.__srv.items)) }) }), set: (ref, d) => { pendiente = d.items; destino = ref.id; } };
        const res = await fn(tx);
        if (pendiente){
          if (destino === 'programaciones') sb.__srv.prog = pendiente; else { sb.__srv.items = pendiente; sb.__srv.escrituras++; }
          if (destino !== 'programaciones' && sb.__srv.perderRespuesta){ sb.__srv.perderRespuesta = false; throw { red: true, message: 'respuesta perdida' }; }
        }
        return res;
      }
    };
    vm.runInContext(`
      let draftPaleta = null, paletaEditId = null, _guardandoPaleta = false, _paletasCache = [], _programacionesCache = [];
      var state = { currentLine: 'PET1', currentTab: 'otra', user: { username: 'op1', nombre: 'Operario' } };
      var __programaciones = [];
      function tienePermiso(){ return true; }
      function visibleLines(){ return [{ key: 'PET1' }]; }
      function unidadesPorPaletaActiva(){ return 324; }
      function fechaHoyPaletas(){ return '${hoy}'; }
      function nombreUsuarioActualPaletas(){ return 'Operario'; }
      function escaparHtml(v){ return String(v); }
      function normalizarClavePaletas(v){ return String(v == null ? '' : v).toLowerCase().replace(/\\s+/g, ''); }
      function claveCombinacionPaletas(l, f, t, m, p){ return [l, f, t, m, p].map(normalizarClavePaletas).join('|'); }
      function esCombinacionPaletas(r, c){ return !!r && claveCombinacionPaletas(r.linea, r.fecha, r.turno, r.marca, r.presentacion) === c; }
      function paletasDeCombinacionPaletas(c){ return _paletasCache.filter(r => esCombinacionPaletas(r, c)); }
      function loadPaletas(){ return _paletasCache; }
      function blankPaleta(l){ return { linea: l, fecha: '${hoy}', turno: 'DÍA', marca: 'Bells', presentacion: '', hora: '', tipoPaleta: 'COMPLETA', paletas: 0, unidadesIncompleta: '', observaciones: '' }; }
      function puedeProgramarPaletas(){ return true; }
      function tramosSecuenciaTurnoPaletas(l, f, t){ return __programaciones.filter(p => p.linea === l && p.fecha === f && p.turno === t).flatMap(p => (p.tramosSecuencia || []).map(x => Object.assign({}, x, { marca: p.marca, presentacion: p.presentacion, claveProgramacion: p.clave }))); }
      function textoFinTramoPaletas(t){ return t.tipoFin; }
      function resumenProgramacionCombinacionTurnos(){ return { unidadesProducidas: 0 }; }
      function renderPaletasTab(){ if(!draftPaleta) draftPaleta = blankPaleta(state.currentLine); }
      async function guardarPaleta(){ return 'original'; }
      function actualizarPaletaCampoYRerenderizar(el, name){ draftPaleta[name] = el.value; renderPaletasTab(); }
      function actualizarVistaPaletas(){}
      async function agregarTramoSecuenciaDesdeFormulario(){ __programaciones[0].tramosSecuencia.push({ id: 'c', orden: 2, tipoFin: 'HORA', horaFin: '' }); return 'tramo-original'; }
    `, sb);
    vm.runInContext(leer('js/nucleo/01b-fecha-operativa.js'), sb);
    sb.GlacialFecha.ahoraMs = () => sb.__ahora;
    sb.__ahora = Date.UTC(2026, 10, 26, 19, 7, 31, 250);          // 14:07 en Lima
    cargar(sb, 'js/produccion/16e-paletas-rapido.js');
    vm.runInContext("draftPaleta = blankPaleta('PET1'); draftPaleta.presentacion = 'Pack_Regular_2.5Lx6und'; _paletasCache = [];", sb);
    sb.agregar = (id, paletas, creadoEn, extra) => vm.runInContext(`_paletasCache = _paletasCache.concat([Object.assign({ id: ${JSON.stringify(id)}, linea: 'PET1', fecha: '${hoy}', turno: 'DÍA', marca: 'Bells', presentacion: 'Pack_Regular_2.5Lx6und', tipoPaleta: 'COMPLETA', paletas: ${paletas}, creadoEn: ${creadoEn}, hora: '12:00' }, ${JSON.stringify(extra || {})})]);`, sb);
    return sb;
  }

  let S = pantalla();
  ok(typeof S.paletaMasUnoAhora === 'function' && typeof S.glacialPaletasRapido.acumuladoVisible === 'function', '16e carga y expone paletaMasUnoAhora()');
  S.agregar('pal_viejo', 5, 1000);
  ok(S.glacialPaletasRapido.acumuladoVisible(vm.runInContext('draftPaleta', S)).paletas === 5, 'acumulado visible = 5 (último confirmado)');
  await S.paletaMasUnoAhora();
  let it = S.__srv.items;
  ok(it.length === 1 && it[0].paletas === 6 && it[0].hora === '14:07' && it[0].tipoPaleta === 'COMPLETA' && it[0].totalUnidades === 6 * 324, '+1 Paleta (Ahora): guarda 5 → 6 con la hora exacta del toque (14:07) y 6×324 unidades');
  ok(it[0].id === 'pal_' + it[0].clientEventId && it[0].capturadoEn === '2026-11-26T19:07:31.250Z' && it[0].creadoEn === S.__ahora && it[0].usuarioUsername === 'op1', 'el registro lleva clientEventId, capturadoEn (ISO del toque), creadoEn y usuario');
  ok(S.glacialPaletasCola.pendientes().length === 0, 'tras subir, la cola queda vacía');
  /* doble toque: dos llamadas casi a la vez → un solo registro */
  await dormir(1300); S.__ahora += 60000;                       // pasó el cooldown del primer toque
  await Promise.all([S.paletaMasUnoAhora(), S.paletaMasUnoAhora()]);
  ok(S.__srv.items.length === 2 && S.__srv.items.map(r => r.paletas).sort().join() === '6,7', 'anti doble toque: dos toques simultáneos registran UNA sola paleta (acumulado 7, no 8)');
  await S.paletaMasUnoAhora();
  ok(S.__srv.items.length === 2, 'el cooldown posterior al guardado también bloquea un toque inmediato');

  /* sin red: encola, el acumulado visible suma pendientes, y al volver sube sin duplicar */
  S = pantalla(); S.agregar('pal_viejo', 5, 1000);
  S.__srv.caido = true;
  await S.paletaMasUnoAhora();
  const dr = vm.runInContext('draftPaleta', S);
  ok(S.__srv.items.length === 0 && S.glacialPaletasCola.pendientes().length === 1 && S.glacialPaletasRapido.acumuladoVisible(dr).paletas === 6, 'sin red: queda pendiente (1) y el acumulado visible ya muestra 6');
  await dormir(1300); S.__ahora += 120000;
  await S.paletaMasUnoAhora();
  ok(S.glacialPaletasCola.pendientes().length === 2 && S.glacialPaletasRapido.acumuladoVisible(dr).paletas === 7 && /2 pendientes por subir/.test(S.glacialPaletasCola.estado().texto), 'segundo toque sin red: acumulado visible 7, «' + S.glacialPaletasCola.estado().texto + '»');
  S.__srv.caido = false;
  await S.glacialPaletasCola.sincronizar();
  ok(S.__srv.items.length === 2 && S.__srv.items.map(r => r.paletas).sort().join() === '6,7' && S.glacialPaletasCola.pendientes().length === 0, 'al volver la red suben las 2 (6 y 7) en orden');
  ok(S.__srv.items[0].capturadoEn < S.__srv.items[1].capturadoEn && S.__srv.items[0].hora === '14:07', 'cada registro conserva SU hora de captura aunque suba más tarde');

  /* reintento duplicado: el servidor guarda pero la respuesta se pierde → el reintento no crea otra fila */
  S = pantalla(); S.agregar('pal_viejo', 5, 1000);
  S.__srv.perderRespuesta = true;
  await S.paletaMasUnoAhora();
  ok(S.__srv.items.length === 1 && S.glacialPaletasCola.pendientes().length === 1, 'respuesta perdida: el servidor ya tiene el registro pero la cola lo conserva como pendiente');
  await S.glacialPaletasCola.sincronizar();
  ok(S.__srv.items.length === 1 && S.__srv.escrituras === 1 && S.glacialPaletasCola.pendientes().length === 0, 'el reintento detecta el mismo id/evento: NO duplica y NO vuelve a escribir');
  /* reenviar a mano el mismo evento (p. ej. otra pestaña con la misma cola) */
  const copia = Object.assign({}, S.__srv.items[0]);
  ok(await S.glacialPaletasRapido.enviarRegistro(copia) === 'duplicado' && S.__srv.items.length === 1, 'enviarRegistro() de un evento ya guardado devuelve «duplicado» sin escribir');

  /* «Guardar» manual de un registro nuevo pasa por la cola; editar delega en el original */
  S = pantalla();
  vm.runInContext("draftPaleta.paletas = 3; draftPaleta.hora = '13:30'; draftPaleta.observaciones = 'corrección';", S);
  S.__srv.caido = true;
  await vm.runInContext('guardarPaleta()', S);
  const pe = S.glacialPaletasCola.pendientes();
  ok(pe.length === 1 && pe[0].registro.paletas === 3 && pe[0].registro.hora === '13:30' && pe[0].registro.observaciones === 'corrección' && pe[0].registro.capturadoEn === '2026-11-26T19:07:31.250Z', 'Guardar manual sin red: queda en cola con la Hora que escribió el operario (13:30) y capturadoEn = el instante del clic');
  S.__srv.caido = false; await dormir(1300);
  await S.glacialPaletasCola.sincronizar();
  ok(S.__srv.items.length === 1 && S.__srv.items[0].hora === '13:30', 'Guardar manual: sube al volver la red');
  vm.runInContext("paletaEditId = 'pal_x';", S);
  ok(await vm.runInContext('guardarPaleta()', S) === 'original', 'editar un registro existente delega en el guardado original (directo)');

  /* Secuencia del turno → marca/presentación */
  S = pantalla();
  vm.runInContext(`__programaciones = [
      { clave: 'k1', linea: 'PET1', fecha: '${hoy}', turno: 'DÍA', marca: 'Scala', presentacion: 'Pack_Regular_2.5Lx6und', tramosSecuencia: [{ id: 'a', orden: 1, tipoFin: 'HORA', horaFin: '12:00' }] },
      { clave: 'k2', linea: 'PET1', fecha: '${hoy}', turno: 'DÍA', marca: 'Bells', presentacion: 'Pack_Regular_2.5Lx6und', tramosSecuencia: [{ id: 'b', orden: 2, tipoFin: 'CIERRE' }] }];
    draftPaleta.marca = 'Cuisine';`, S);
  ok(S.glacialPaletasRapido.aplicarTramo() === true && vm.runInContext('draftPaleta.marca', S) === 'Bells', 'a las 14:07 (pasó el corte de las 12:00) autoselecciona el tramo vigente: Bells');
  vm.runInContext("actualizarPaletaCampoYRerenderizar({ value: 'Cuisine' }, 'marca');", S);
  ok(S.glacialPaletasRapido.aplicarTramo() === false && vm.runInContext('draftPaleta.marca', S) === 'Cuisine', 'si el operario cambia la marca a mano, la secuencia ya no se la vuelve a cambiar');
  vm.runInContext("draftPaleta.fecha = '2026-11-27';", S);
  ok(vm.runInContext("tramosSecuenciaTurnoPaletas(draftPaleta.linea, draftPaleta.fecha, draftPaleta.turno).length", S) === 0 && S.glacialPaletasRapido.aplicarTramo() === false, 'otra fecha sin secuencia: no toca nada');

  /* corte del tramo anterior al agregar uno nuevo */
  S = pantalla();
  const progServidor = [{ clave: 'k2', linea: 'PET1', fecha: hoy, turno: 'DÍA', marca: 'Bells', presentacion: 'Pack_Regular_2.5Lx6und', tramosSecuencia: [{ id: 'b', orden: 1, tipoFin: 'CIERRE', cantidadObjetivo: 0 }] }];
  S.__srv.prog = JSON.parse(JSON.stringify(progServidor));
  vm.runInContext('__programaciones = ' + JSON.stringify(progServidor) + ';', S);
  const rTramo = await vm.runInContext('agregarTramoSecuenciaDesdeFormulario()', S);
  const cortado = S.__srv.prog[0].tramosSecuencia.find(t => t.id === 'b');
  ok(rTramo === 'tramo-original' && cortado.tipoFin === 'HORA' && cortado.horaFin === '14:07' && cortado.corteAutomatico === true, 'al agregar un tramo, el anterior «hasta el cierre» se corta a la hora actual (14:07)');
  S = pantalla(); S.confirm = () => false;
  S.__srv.prog = JSON.parse(JSON.stringify(progServidor));
  vm.runInContext('__programaciones = ' + JSON.stringify(progServidor) + ';', S);
  await vm.runInContext('agregarTramoSecuenciaDesdeFormulario()', S);
  ok(S.__srv.prog[0].tramosSecuencia[0].tipoFin === 'CIERRE', 'si el usuario cancela el aviso, el tramo anterior queda como estaba');

  /* 16e no rompe a quien lo carga sin las funciones de 16-paletas */
  const vacio = nuevoEntorno(); cargar(vacio, 'js/produccion/16d-paletas-cola.js');
  let sinError = true; try { cargar(vacio, 'js/produccion/16e-paletas-rapido.js'); } catch (e) { sinError = false; }
  ok(sinError && !vacio.paletaMasUnoAhora, '16e no hace nada (ni falla) si 16-paletas.js no está cargado');

  /* orden de carga en index.html */
  const html = leer('index.html');
  const pos = n => html.indexOf(n);
  ok(pos('16c-saldo-entrega.js') > 0 && pos('16c-saldo-entrega.js') < pos('16d-paletas-cola.js') && pos('16d-paletas-cola.js') < pos('16e-paletas-rapido.js'), 'index.html carga 16d y 16e después de 16c (y por tanto de 16 y 21)');
  ok(/16d-paletas-cola\.js\?v=\d{8}-\w+/.test(html) && /16e-paletas-rapido\.js\?v=\d{8}-\w+/.test(html), '16d y 16e llevan su ?v=');

  process.exit(fallas ? 1 : 0);
})();
