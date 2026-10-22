/* Puente Firebase → Supabase (js/nucleo/00b-puente-supabase.js).
   Varios «dispositivos» cargan el puente real y hablan con un servidor simulado que reproduce las funciones
   fs_leer / fs_commit / fs_versiones / fs_consulta y los avisos de tiempo real (migraciones glacial_20a…20g).
   Ejecutar:  node tests/puente-supabase.test.js   */
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.resolve(__dirname, '..');
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const igual = (a, b, t) => { const x = JSON.stringify(a), y = JSON.stringify(b); ok(x === y, t + (x === y ? '' : '\n     obtenido: ' + x + '\n     esperado: ' + y)); };
const clon = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const pausa = ms => new Promise(r => setTimeout(r, ms));
const CODIGO = fs.readFileSync(R + '/js/nucleo/00b-puente-supabase.js', 'utf8');
const esObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

const { crearServidor } = require('./ayuda/servidor-simulado.js');

/* ---------------- un dispositivo: carga el puente real dentro de su propio «navegador» ---------------- */
function crearDispositivo(S, nombre, opciones){
  opciones = opciones || {};
  const D = { nombre, enLinea: true, canales: [], colaAvisos: [], entrega: 'auto', perderAvisos: 0, perderRespuesta: 0, demora: 0, sesion: null, avisosAuth: [], llamadas: {} };
  let azar = (opciones.semilla || 1) * 7919;
  D.azar = () => { azar = (azar * 1103515245 + 12345) & 0x7fffffff; return azar / 0x7fffffff; };
  let bombeando = false;
  async function bombear(){
    if (bombeando) return; bombeando = true;
    while (D.colaAvisos.length && D.entrega === 'auto') {
      if (D.demora) await pausa(D.azar() * D.demora);
      const ev = D.colaAvisos.shift(); if (!ev) break;
      try { ev(); } catch (e) { console.error('aviso', e); }
    }
    bombeando = false;
  }
  D._recibir = eventos => {
    if (!D.enLinea) return;
    eventos.forEach(ev => D.canales.forEach(ch => ch.enlaces.forEach(x => {
      if (x.tabla !== ev.tabla || x.filtro !== 'raiz=eq.' + ev.fila.raiz) return;
      if (D.perderAvisos && D.azar() < D.perderAvisos) return;
      D.colaAvisos.push(() => { if (ch.vivo) x.alCambiar(clon(ev.fila)); });
    })));
    if (D.entrega === 'auto') setTimeout(bombear, 0);
  };
  D.entregar = n => { let k = 0; while (D.colaAvisos.length && (n === undefined || k < n)) { D.colaAvisos.shift()(); k++; } };
  D.descartar = n => D.colaAvisos.splice(0, n === undefined ? D.colaAvisos.length : n).length;
  D.desconectar = () => { D.enLinea = false; D.colaAvisos = []; };
  D.conectar = () => { D.enLinea = true; D.canales.forEach(ch => { if (ch.vivo) ch.alEstado('SUBSCRIBED'); }); };
  const uid = () => (D.sesion ? D.sesion.user.id : null);
  const avisar = ev => D.avisosAuth.forEach(cb => cb(ev, D.sesion));
  const transporte = {
    async rpc(nombre, args){
      D.llamadas[nombre] = (D.llamadas[nombre] || 0) + 1;
      if (D.demora) await pausa(D.azar() * D.demora); else await Promise.resolve();
      if (!D.enLinea) throw { red: true, message: 'Failed to fetch' };
      const r = S[nombre](uid(), clon(args));
      if (D.demora) await pausa(D.azar() * D.demora);
      if (nombre === 'fs_commit' && D.perderRespuesta && D.azar() < D.perderRespuesta) throw { red: true, message: 'Failed to fetch' };
      if (!D.enLinea) throw { red: true, message: 'Failed to fetch' };
      return clon(r);
    },
    canal(nombreCanal, enlaces, alEstado){
      const ch = { nombre: nombreCanal, enlaces, alEstado, vivo: true };
      D.canales.push(ch);
      setTimeout(() => { if (ch.vivo && D.enLinea) alEstado('SUBSCRIBED'); }, 0);
      return { cerrar(){ ch.vivo = false; D.canales = D.canales.filter(x => x !== ch); } };
    },
    auth: {
      getSession: async () => ({ data: { session: D.sesion }, error: null }),
      onAuthStateChange(cb){ D.avisosAuth.push(cb); return { data: { subscription: { unsubscribe(){} } } }; },
      async signInWithPassword(c){
        const u = S.usuarios.get(c.email);
        if (!u || u.clave !== c.password) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials', status: 400 } };
        D.sesion = { access_token: 't', user: { id: u.id, email: c.email, user_metadata: clon(u.meta) } }; avisar('SIGNED_IN');
        return { data: { user: D.sesion.user, session: D.sesion }, error: null };
      },
      async updateUser(a){
        const u = S.usuarios.get(D.sesion.user.email);
        if (a.password) { if (a.password.length < 6) return { data: {}, error: { message: 'Password should be at least 6 characters', status: 422 } }; u.clave = a.password; }
        if (a.data) Object.assign(u.meta, a.data);
        D.sesion.user.user_metadata = clon(u.meta); avisar('USER_UPDATED');
        return { data: { user: D.sesion.user }, error: null };
      },
      async signOut(){ D.sesion = null; avisar('SIGNED_OUT'); return { error: null }; }
    },
    async funcion(nombreFn, cuerpo){
      if (nombreFn !== 'fs-cuentas') return { error: 'no existe' };
      if (cuerpo.accion === 'crear') {
        if (S.usuarios.has(cuerpo.email)) return { error: 'El correo ya está registrado', codigo: 'auth/email-already-in-use' };
        const id = 'uid-' + (S.usuarios.size + 1); S.usuarios.set(cuerpo.email, { id, clave: cuerpo.clave, meta: {} }); return { uid: id };
      }
      if (cuerpo.accion === 'perfil') { for (const u of S.usuarios.values()) if (u.id === cuerpo.uid) u.meta.display_name = cuerpo.displayName; return { ok: true }; }
      return { error: 'acción desconocida' };
    }
  };
  const sb = { console, Math, Number, Array, Object, String, Date, JSON, Promise, Set, Map, Error, Uint8Array,
    crypto: require('crypto').webcrypto, clearTimeout,
    setTimeout: (f, ms) => setTimeout(f, Math.min(Number(ms) || 0, opciones.relojRapido === false ? 1e9 : 12)),     // las esperas largas se acortan
    __GLACIAL_TRANSPORTE__: () => transporte };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb); vm.runInContext(CODIGO, sb);
  D.sb = sb; D.firebase = sb.firebase; D.puente = sb.__GLACIAL_PUENTE__;
  D.firebase.initializeApp({ projectId: 'prueba' });
  D.db = D.firebase.firestore(); D.auth = D.firebase.auth();
  D.FieldValue = D.firebase.firestore.FieldValue; D.Timestamp = D.firebase.firestore.Timestamp;
  S.dispositivos.push(D);
  /* Escucha un documento y guarda todo lo que recibe. */
  D.escuchar = (c, d, opc) => {
    const reg = { fotos: [], errores: [], ultimo: undefined, meta: null };
    const next = s => { reg.ultimo = s.exists ? s.data() : undefined; reg.meta = s.metadata; reg.fotos.push({ existe: s.exists, datos: reg.ultimo, meta: Object.assign({}, s.metadata) }); };
    const e = x => reg.errores.push(x);
    reg.parar = opc ? D.db.collection(c).doc(d).onSnapshot(opc, next, e) : D.db.collection(c).doc(d).onSnapshot(next, e);
    return reg;
  };
  return D;
}
const quieto = async (ms) => { await pausa(ms || 40); };
const ids = l => (l || []).map(x => x.id).join(',');

(async () => {
  /* ===== 1. Valores especiales y listas ===== */
  {
    const S = crearServidor(), A = crearDispositivo(S, 'A'), P = A.puente;
    const t = A.Timestamp.fromDate(new Date(1760000000123));
    igual(P.aEnvio({ a: 1, b: undefined, c: t, d: new Date(5), e: [1, undefined, { x: A.FieldValue.serverTimestamp() }], f: A.FieldValue.delete(), g: NaN }),
      { a: 1, c: { __ts: 1760000000123 }, d: { __ts: 5 }, e: [1, null, { x: { __fs: 'ts' } }], f: { __fs: 'del' }, g: null }, 'Los valores viajan como JSON: fechas, hora del servidor, borrar campo, sin undefined');
    const v = P.aPagina({ c: { __ts: 1760000000123 }, l: [{ h: { __ts: 1500 } }] });
    ok(v.c.toMillis() === 1760000000123 && v.c.seconds === 1760000000 && v.c.toDate().getTime() === 1760000000123 && v.l[0].h.toMillis() === 1500, 'Al leer, las fechas vuelven como Timestamp (toMillis, seconds, toDate)');
    ok(P.claveDeLista([{ id: 'a' }, { id: 'b' }]) === 'id' && P.claveDeLista([{ id: 'a' }, { id: 'a' }]) === null && P.claveDeLista([]) === null && P.claveDeLista([1, 2]) === null
      && P.claveDeLista([{ username: 'x' }, { username: 'y' }]) === 'username' && P.claveDeLista([{ id: 1, username: 'x' }, { id: 1, username: 'y' }]) === 'username', 'Una lista se parte solo si todos sus elementos tienen una clave única (id, username…)');
    const base = new Map([['a', { pos: 1, txt: P.canon({ id: 'a', n: 1 }) }], ['b', { pos: 2, txt: P.canon({ id: 'b' }) }], ['c', { pos: 3, txt: P.canon({ id: 'c' }) }]]);
    const dif = P.diferenciaDeLista(base, [{ n: 1, id: 'a' }, { id: 'c' }, { id: 'd' }], 'id');
    igual({ up: dif.up.map(x => x.id), del: dif.del }, { up: ['d'], del: ['b'] }, 'Al guardar una lista solo viajan las altas, los cambios y las bajas (el orden de las claves no cuenta como cambio)');
    const mov = P.diferenciaDeLista(base, [{ id: 'c' }, { id: 'a', n: 1 }, { id: 'b' }], 'id');
    ok(mov.up.length === 1 && mov.up[0].id === 'c' && mov.up[0].pos < 1 && !mov.del.length, 'Mover un elemento solo reenvía ese elemento con su nueva posición');
  }

  /* ===== 2. Guardar y ver en vivo desde otro dispositivo ===== */
  {
    const S = crearServidor(), A = crearDispositivo(S, 'A'), B = crearDispositivo(S, 'B');
    const eA = A.escuchar('sync', 'paletas'), eB = B.escuchar('sync', 'paletas');
    await quieto();
    ok(eA.fotos.length === 1 && eA.fotos[0].existe === false, 'La escucha responde enseguida aunque el documento aún no exista');
    const lista = [{ id: 'p1', linea: 'PET1', cajas: 10 }, { id: 'p2', linea: 'PET2', cajas: 20 }];
    const promesa = A.db.collection('sync').doc('paletas').set({ items: lista, updatedAt: A.FieldValue.serverTimestamp() });
    await Promise.resolve(); await Promise.resolve();
    ok(eA.ultimo && ids(eA.ultimo.items) === 'p1,p2' && eA.meta.hasPendingWrites === true, 'Quien guarda lo ve al instante, antes de que responda el servidor');
    ok(eA.ultimo.updatedAt && typeof eA.ultimo.updatedAt.toMillis === 'function', 'La hora del servidor se estima mientras tanto');
    await promesa; await quieto();
    ok(eB.ultimo && ids(eB.ultimo.items) === 'p1,p2' && eB.ultimo.items[1].cajas === 20, 'El otro dispositivo lo recibe en vivo, sin recargar');
    ok(eB.ultimo.updatedAt.toMillis() === eA.ultimo.updatedAt.toMillis(), 'Ambos quedan con la misma hora del servidor');
    igual(S.docs.get('sync\u0000paletas').partes, ['items'], 'En el servidor la lista quedó partida: una fila por elemento');
    ok(S.items.size === 2 && !('items' in S.docs.get('sync\u0000paletas').datos), 'La lista no se duplica dentro del documento');

    const antesA = eA.fotos.length, antesB = eB.fotos.length; S.registro.length = 0;
    const nueva = eB.ultimo.items.concat([{ id: 'p3', linea: 'PET1', cajas: 5 }]); nueva[0].cajas = 11;
    await B.db.collection('sync').doc('paletas').set({ items: nueva, updatedAt: B.FieldValue.serverTimestamp() }); await quieto();
    const enviado = S.registro[0][0].partes.items;
    igual({ up: enviado.up.map(x => x.id).sort(), del: enviado.del }, { up: ['p1', 'p3'], del: [] }, 'Al añadir una paleta y corregir otra solo viajan esas dos, no las demás');
    ok(ids(eA.ultimo.items) === 'p1,p2,p3' && eA.ultimo.items[0].cajas === 11, 'El primer dispositivo ve el cambio del segundo');
    ok(eA.fotos.length === antesA + 1, 'Cada cambio ajeno produce un solo aviso (' + (eA.fotos.length - antesA) + ')');
    ok(eB.fotos.length === antesB + 2, 'Quien guarda recibe el aviso inmediato y el definitivo con la hora del servidor (' + (eB.fotos.length - antesB) + ')');
    const sinHora = eB.fotos.length;
    await B.db.collection('sync').doc('paletas').set({ items: nueva.slice(0, 2) }, { merge: true }); await quieto();
    ok(eB.fotos.length === sinHora + 1 && ids(eB.ultimo.items) === 'p1,p2' && ids(eA.ultimo.items) === 'p1,p2', 'Sin hora del servidor, quien guarda recibe un solo aviso; quitar un elemento se ve en todos');
    ok(eA.ultimo.updatedAt, 'set con merge conserva los demás campos');
    ok(A.llamadas.fs_leer === 1 && B.llamadas.fs_leer === 1, 'Los cambios llegan por tiempo real: no se vuelve a descargar el documento (' + A.llamadas.fs_leer + ', ' + B.llamadas.fs_leer + ')');
    igual(S.documento('sync', 'paletas').items, eA.ultimo.items, 'Lo que muestra la página coincide con lo guardado');
    const g = await A.db.collection('sync').doc('paletas').get();
    ok(g.exists && ids(g.data().items) === 'p1,p2' && g.id === 'paletas' && g.ref.path === 'sync/paletas', 'get() devuelve el documento completo');
  }

  /* ===== 3. Dos personas guardando a la vez sobre la misma lista ===== */
  {
    const S = crearServidor(), A = crearDispositivo(S, 'A'), B = crearDispositivo(S, 'B');
    await A.db.collection('sync').doc('paletas').set({ items: [{ id: 'p1' }] });
    const eA = A.escuchar('sync', 'paletas'), eB = B.escuchar('sync', 'paletas'); await quieto();
    A.entrega = 'manual'; B.entrega = 'manual';                     // ninguno ha recibido aún lo del otro
    const pa = A.db.collection('sync').doc('paletas').set({ items: eA.ultimo.items.concat([{ id: 'a1' }]) });
    const pb = B.db.collection('sync').doc('paletas').set({ items: eB.ultimo.items.concat([{ id: 'b1' }]) });
    await pa; await pb;
    ok(ids(S.documento('sync', 'paletas').items.slice().sort((x, y) => x.id < y.id ? -1 : 1)) === 'a1,b1,p1', 'Si dos supervisores registran a la vez, no se pierde ninguna de las dos paletas');
    A.entrega = 'auto'; B.entrega = 'auto'; A.entregar(); B.entregar(); await quieto(80);
    igual(eA.ultimo.items, S.documento('sync', 'paletas').items, 'El dispositivo A termina igual que el servidor');
    igual(eB.ultimo.items, S.documento('sync', 'paletas').items, 'El dispositivo B termina igual que el servidor');

    /* Mismo elemento modificado por los dos: gana el último que llegó al servidor, y todos lo ven igual. */
    A.entrega = 'manual'; B.entrega = 'manual';
    const la = eA.ultimo.items.map(x => x.id === 'p1' ? Object.assign({}, x, { cajas: 1 }) : x), lb = eB.ultimo.items.map(x => x.id === 'p1' ? Object.assign({}, x, { cajas: 2 }) : x);
    const qa = A.db.collection('sync').doc('paletas').set({ items: la }); await qa;
    const qb = B.db.collection('sync').doc('paletas').set({ items: lb }); await qb;
    A.entrega = 'auto'; B.entrega = 'auto'; A.entregar(); B.entregar(); await quieto(80);
    const p1 = l => l.find(x => x.id === 'p1').cajas;
    ok(p1(S.documento('sync', 'paletas').items) === 2 && p1(eA.ultimo.items) === 2 && p1(eB.ultimo.items) === 2, 'Si dos corrigen el mismo elemento, queda el último y todos ven lo mismo');
  }

  /* ===== 4. Avisos perdidos, desordenados o incompletos ===== */
  {
    const S = crearServidor(), A = crearDispositivo(S, 'A'), B = crearDispositivo(S, 'B');
    await A.db.collection('sync').doc('tareos').set({ items: [{ id: 't1', h: 1 }, { id: 't2', h: 1 }] });
    const eB = B.escuchar('sync', 'tareos'); await quieto();
    B.entrega = 'manual';
    await A.db.collection('sync').doc('tareos').set({ items: [{ id: 't1', h: 2 }, { id: 't2', h: 2 }] });
    B.descartar(); B.entrega = 'auto';                                            // se pierde el aviso de ese guardado
    await A.db.collection('sync').doc('tareos').set({ items: [{ id: 't1', h: 2 }, { id: 't2', h: 2 }, { id: 't3', h: 1 }] }); await quieto(80);
    igual(eB.ultimo.items, S.documento('sync', 'tareos').items, 'Si se pierde un aviso, con el siguiente el dispositivo se pone al día de todo lo que faltaba');
    const lecturas = B.llamadas.fs_leer;
    await A.db.collection('sync').doc('tareos').set({ items: [{ id: 't1', h: 3 }, { id: 't2', h: 2 }, { id: 't3', h: 1 }] }); await quieto(80);
    ok(eB.ultimo.items[0].h === 3 && B.llamadas.fs_leer === lecturas, 'Ponerse al día pide solo lo que cambió: no vuelve a descargar el documento entero');
    /* Sin conexión un rato y vuelve */
    B.desconectar();
    await A.db.collection('sync').doc('tareos').set({ items: [{ id: 't3', h: 9 }] }); await quieto();
    ok(ids(eB.ultimo.items) === 't1,t2,t3', 'Sin conexión el dispositivo conserva lo último que vio');
    B.conectar(); await quieto(80);
    igual(eB.ultimo.items, [{ id: 't3', h: 9 }], 'Al volver la conexión se pone al día solo');
    /* Realtime no envía los datos grandes que no cambiaron */
    S.sinDatosSiNoCambian = true;
    await A.db.collection('sync').doc('tareos').set({ items: [{ id: 't4', h: 1 }, { id: 't3', h: 9 }], nota: 'x' }); await quieto(80);
    igual(eB.ultimo, S.documento('sync', 'tareos'), 'Reordenar sin cambiar datos (aviso sin datos) queda bien');
    await A.db.collection('sync').doc('tareos').set({ items: [{ id: 't4', h: 1 }] }, { merge: true }); await quieto(80);
    igual(eB.ultimo, S.documento('sync', 'tareos'), 'Quitar un elemento cuando el aviso llega sin datos queda bien');
    ok(eB.ultimo.nota === 'x', 'Los campos que no viajaron en el aviso se conservan');
  }

  /* ===== 5. Sin conexión al guardar, respuesta perdida y permisos ===== */
  {
    const S = crearServidor(), A = crearDispositivo(S, 'A'), B = crearDispositivo(S, 'B');
    const eA = A.escuchar('sync', 'records', { includeMetadataChanges: true }), eB = B.escuchar('sync', 'records'); await quieto();
    A.desconectar();
    let listo = false;
    const p = A.db.collection('sync').doc('records').set({ items: [{ id: 'r1' }] }).then(() => { listo = true; });
    await quieto(60);
    ok(!listo && ids(eA.ultimo.items) === 'r1' && eA.meta.hasPendingWrites && eA.meta.fromCache === true, 'Sin conexión el guardado queda pendiente y la página lo sabe (fromCache)');
    const g = await A.db.collection('sync').doc('records').get();
    ok(g.exists && g.metadata.fromCache === true && ids(g.data().items) === 'r1', 'Sin conexión get() responde con la copia local');
    ok(S.documento('sync', 'records') === undefined, 'Nada llegó al servidor todavía');
    A.conectar(); await p; await quieto(80);
    ok(listo && ids(eB.ultimo.items) === 'r1' && eA.meta.fromCache === false && eA.meta.hasPendingWrites === false, 'Al volver la conexión se envía solo y los demás lo reciben');
    /* El servidor guardó pero la respuesta se perdió: el reintento no duplica nada */
    A.perderRespuesta = 1; setTimeout(() => { A.perderRespuesta = 0; }, 30);
    await A.db.collection('sync').doc('records').set({ items: [{ id: 'r1' }, { id: 'r2' }], n: 1 }); await quieto(80);
    ok(S.docs.get('sync\u0000records').version === 2, 'Un guardado cuya respuesta se perdió no se aplica dos veces (versión ' + S.docs.get('sync\u0000records').version + ')');
    igual(eA.ultimo, S.documento('sync', 'records'), 'Tras el reintento el dispositivo queda igual que el servidor');
    /* Permiso denegado */
    S.reglas = (uid, accion, c, d) => !(d === 'records' && accion !== 'leer');
    let codigo = null;
    try { await A.db.collection('sync').doc('records').set({ items: [] }); } catch (e) { codigo = e.code; }
    await quieto();
    ok(codigo === 'permission-denied' && ids(eA.ultimo.items) === 'r1,r2', 'Un guardado rechazado por permisos avisa con «permission-denied» y la página vuelve a mostrar lo real');
    S.reglas = (uid, accion) => accion !== 'leer';
    const eX = B.escuchar('sync', 'precios'); await quieto();
    ok(eX.errores.length === 1 && eX.errores[0].code === 'permission-denied' && !eX.fotos.length, 'Una escucha sin permiso recibe el error, como en Firestore');
    S.reglas = null;
  }

  /* ===== 6. Transacciones y lotes ===== */
  {
    const S = crearServidor(), A = crearDispositivo(S, 'A'), B = crearDispositivo(S, 'B');
    A.demora = 6; B.demora = 6;
    const ref = D => D.db.collection('sync').doc('contador');
    await ref(A).set({ n: 0, items: [] });
    const sumar = (D, id) => D.db.runTransaction(async tx => {
      const s = await tx.get(ref(D)); const d = s.data();
      tx.set(ref(D), { n: d.n + 1, items: d.items.concat([{ id }]) });
      return d.n + 1;
    });
    const r = await Promise.all([sumar(A, 'a1'), sumar(B, 'b1'), sumar(A, 'a2'), sumar(B, 'b2'), sumar(A, 'a3')]);
    const fin = S.documento('sync', 'contador');
    ok(fin.n === 5 && fin.items.length === 5 && r.slice().sort().join() === '1,2,3,4,5', 'Cinco transacciones simultáneas desde dos dispositivos: ninguna pisa a otra (n=' + fin.n + ')');
    A.demora = 0; B.demora = 0;
    let codigo = null;
    try { await A.db.runTransaction(async tx => { const s = await tx.get(ref(A)); await ref(B).set({ n: s.data().n + 100 }, { merge: true }); tx.update(ref(A), { n: 0 }); }); } catch (e) { codigo = e.code; }
    ok(codigo === 'aborted', 'Si el documento no deja de cambiar, la transacción se rinde con «aborted» (no guarda a medias)');
    codigo = null;
    try { await A.db.runTransaction(async tx => { tx.update(A.db.collection('sync').doc('noExiste'), { a: 1 }); }); } catch (e) { codigo = e.code; }
    ok(codigo === 'not-found', 'update sobre un documento inexistente falla con «not-found»');
    const eB = B.escuchar('avancesTurnoItems', 'x1'); await quieto();
    const lote = A.db.batch();
    lote.set(A.db.collection('avancesTurnoItems').doc('x1'), { fecha: '2026-10-10', creadoEn: A.FieldValue.serverTimestamp() });
    lote.set(A.db.collection('avancesTurnoItems').doc('x2'), { fecha: '2026-10-11' });
    lote.set(A.db.collection('sync').doc('contador'), { lote: true }, { merge: true });
    await lote.commit(); await quieto();
    ok(S.documento('avancesTurnoItems', 'x2').fecha === '2026-10-11' && S.documento('sync', 'contador').lote === true && eB.ultimo && eB.ultimo.creadoEn.toMillis() > 0, 'Un lote guarda varios documentos de una vez y los demás lo ven en vivo');
    S.reglas = (uid, accion, c, d) => d !== 'x4';
    const lote2 = A.db.batch();
    lote2.set(A.db.collection('avancesTurnoItems').doc('x3'), { a: 1 }); lote2.set(A.db.collection('avancesTurnoItems').doc('x4'), { a: 1 });
    codigo = null; try { await lote2.commit(); } catch (e) { codigo = e.code; }
    ok(codigo === 'permission-denied' && S.documento('avancesTurnoItems', 'x3') === undefined, 'Si una parte del lote no está permitida, no se guarda nada del lote');
    S.reglas = null;
  }

  /* ===== 7. Consultas, colecciones y borrado ===== */
  {
    const S = crearServidor(), A = crearDispositivo(S, 'A'), B = crearDispositivo(S, 'B');
    const col = D => D.db.collection('auditoriaTareos');
    const vistas = [];
    const parar = B.db.collection('auditoriaTareos').where('fecha', '>=', '2026-10-02').orderBy('fecha', 'desc').limit(2)
      .onSnapshot(s => vistas.push({ ids: s.docs.map(d => d.id), cambios: s.docChanges().map(c => c.type + ':' + c.doc.id), n: s.size, vacio: s.empty }));
    await quieto(60);
    ok(vistas.length === 1 && vistas[0].vacio && vistas[0].n === 0, 'Una consulta en vivo responde aunque no haya resultados');
    await col(A).doc('a').set({ fecha: '2026-10-01', timestamp: A.FieldValue.serverTimestamp() });
    await col(A).doc('b').set({ fecha: '2026-10-02', timestamp: A.FieldValue.serverTimestamp() });
    await col(A).doc('c').set({ fecha: '2026-10-03', timestamp: A.FieldValue.serverTimestamp() });
    const nuevo = await col(A).add({ fecha: '2026-10-04', uid: 'u1', timestamp: A.Timestamp.fromDate(new Date(1760000000000)) });
    await quieto(80);
    const ult = vistas[vistas.length - 1];
    ok(nuevo.id.length === 20 && ult.ids.join() === nuevo.id + ',c', 'where + orderBy desc + limit devuelven lo correcto y add() crea un identificador nuevo');
    const todos = [].concat(...vistas.map(v => v.cambios));
    ok(todos.includes('added:c') && todos.includes('added:' + nuevo.id) && (!todos.includes('added:b') || todos.includes('removed:b')), 'docChanges() indica qué entró y qué salió (' + todos.join(' ') + ')');
    await col(A).doc('c').set({ nota: 'x' }, { merge: true }); await quieto(80);
    ok(vistas[vistas.length - 1].cambios.join() === 'modified:c', 'docChanges() indica lo modificado');
    const q = await col(A).where('uid', '==', 'u1').get();
    ok(q.size === 1 && q.docs[0].data().timestamp.toMillis() === 1760000000000 && !q.empty, 'where == y get() de una consulta');
    const desde = A.Timestamp.fromDate(new Date(1760000000001));
    const q2 = await col(A).where('timestamp', '>=', desde).orderBy('timestamp', 'asc').get();
    ok(q2.docs.map(d => d.id).join() === 'a,b,c', 'Se puede filtrar y ordenar por fechas (Timestamp)');
    let n = 0; q2.forEach(() => n++); ok(n === 3, 'forEach recorre los resultados');
    parar(); const antes = vistas.length;
    await col(A).doc('z').set({ fecha: '2026-10-09' }); await quieto(60);
    ok(vistas.length === antes, 'Al dejar de escuchar no llegan más avisos');
    /* subcolecciones */
    const ev = A.db.collection('distribucionPersonal').doc('2026-10-10_DIA').collection('eventos');
    const eSub = []; B.db.collection('distribucionPersonal').doc('2026-10-10_DIA').collection('eventos').orderBy('creadoEn', 'desc').onSnapshot(s => eSub.push(s.docs.map(d => d.data().n)));
    await ev.add({ n: 1, creadoEn: A.FieldValue.serverTimestamp() }); await ev.add({ n: 2, creadoEn: A.FieldValue.serverTimestamp() }); await quieto(80);
    igual(eSub[eSub.length - 1], [2, 1], 'Las subcolecciones (eventos de un documento) funcionan y se ven en vivo');
    /* borrar y volver a crear */
    const eDoc = B.escuchar('auditoriaTareos', 'a'); await quieto();
    await col(A).doc('a').delete(); await quieto();
    ok(eDoc.fotos[eDoc.fotos.length - 1].existe === false && !(await col(A).doc('a').get()).exists, 'Borrar un documento se ve en vivo (exists=false)');
    ok(S.docs.get('auditoriaTareos\u0000a').eliminado_en, 'En el servidor el borrado solo queda marcado: el dato se puede recuperar');
    await col(A).doc('a').set({ fecha: '2026-10-20', items: [{ id: 'k' }] }); await quieto();
    ok(eDoc.ultimo && eDoc.ultimo.fecha === '2026-10-20' && ids(eDoc.ultimo.items) === 'k', 'Volver a crear un documento borrado funciona');
    /* update, borrar campo, lista que deja de serlo */
    await col(A).doc('a').update({ fecha: A.FieldValue.delete(), extra: { a: 1 } }); await quieto();
    ok(!('fecha' in eDoc.ultimo) && eDoc.ultimo.extra.a === 1 && ids(eDoc.ultimo.items) === 'k', 'update cambia solo lo indicado y FieldValue.delete() quita el campo');
    await col(A).doc('a').set({ items: [] }, { merge: true }); await quieto();
    igual(eDoc.ultimo.items, [], 'Una lista que queda vacía sigue siendo una lista vacía');
    await col(A).doc('a').set({ items: [{ id: 'k2' }], sueltos: [1, 2, { x: 1 }], mapa: { u1: { a: 1 } } }, { merge: true });
    await col(A).doc('a').set({ mapa: { u2: { b: 2 } } }, { merge: true }); await quieto();
    ok(ids(eDoc.ultimo.items) === 'k2' && eDoc.ultimo.sueltos.length === 3 && eDoc.ultimo.mapa.u1.a === 1 && eDoc.ultimo.mapa.u2.b === 2, 'Listas sin clave única quedan dentro del documento; set con merge combina mapas (perfiles por usuario)');
    await col(A).doc('a').set({ items: 'ya no es lista' }, { merge: true }); await quieto();
    ok(eDoc.ultimo.items === 'ya no es lista' && S.items.size > 0 && [...S.items.values()].filter(i => i.doc === 'a' && !i.eliminado_en).length === 0, 'Si un campo deja de ser lista, sus filas se dan de baja');
    /* guardar sin poder leer antes (documento que el usuario no puede leer) */
    await col(A).doc('ciego').set({ items: [{ id: 'v1' }, { id: 'v2' }] });
    S.reglas = (uid, accion, c, d) => !(d === 'ciego' && accion === 'leer');
    await col(B).doc('ciego').set({ items: [{ id: 'v2' }, { id: 'v3' }] }, { merge: true });
    S.reglas = null;
    ok(ids(S.documento('auditoriaTareos', 'ciego').items) === 'v2,v3', 'Guardar una lista sin poder leerla antes reemplaza la lista completa');
  }

  /* ===== 8. Inicio de sesión ===== */
  {
    const S = crearServidor(), A = crearDispositivo(S, 'A');
    S.usuarios.set('admin@glacial.app', { id: 'uid-admin', clave: 'secreta1', meta: { display_name: 'TEMP' } });
    const vistos = []; A.auth.onAuthStateChanged(u => vistos.push(u ? u.uid : null));
    await quieto();
    ok(JSON.stringify(vistos) === '[null]' && A.auth.currentUser === null, 'Sin sesión, onAuthStateChanged avisa con null');
    let codigo = null; try { await A.auth.signInWithEmailAndPassword('admin@glacial.app', 'mala'); } catch (e) { codigo = e.code; }
    ok(codigo === 'auth/invalid-credential', 'Contraseña incorrecta → auth/invalid-credential');
    const cred = await A.auth.signInWithEmailAndPassword('admin@glacial.app', 'secreta1'); await quieto();
    ok(cred.user.uid === 'uid-admin' && A.auth.currentUser.uid === 'uid-admin' && A.auth.currentUser.displayName === 'TEMP' && vistos[vistos.length - 1] === 'uid-admin', 'Inicio de sesión correcto; la marca de contraseña temporal (TEMP) se conserva');
    await A.auth.currentUser.updatePassword('nuevaClave9'); await A.auth.currentUser.updateProfile({ displayName: '' }); await quieto();
    ok(S.usuarios.get('admin@glacial.app').clave === 'nuevaClave9' && A.auth.currentUser.displayName === null && A.auth.currentUser.uid === 'uid-admin', 'Cambiar la contraseña y quitar la marca TEMP');
    codigo = null; try { await A.auth.currentUser.updatePassword('123'); } catch (e) { codigo = e.code; }
    ok(codigo === 'auth/weak-password', 'Contraseña demasiado corta → auth/weak-password');
    const app2 = A.firebase.apps.find(a => a.name === 'secundaria') || A.firebase.initializeApp({}, 'secundaria');
    const c2 = await app2.auth().createUserWithEmailAndPassword('maria@glacial.app', 'temporal1');
    await c2.user.updateProfile({ displayName: 'TEMP' }); await app2.auth().signOut();
    ok(c2.user.uid && S.usuarios.get('maria@glacial.app').meta.display_name === 'TEMP' && A.auth.currentUser.uid === 'uid-admin', 'El Administrador crea la cuenta de otra persona sin perder su propia sesión');
    ok(A.firebase.apps.find(a => a.name === 'secundaria') === app2, 'La app secundaria se reutiliza');
    codigo = null; try { await app2.auth().createUserWithEmailAndPassword('maria@glacial.app', 'x'); } catch (e) { codigo = e.code; }
    ok(codigo === 'auth/email-already-in-use', 'Cuenta repetida → auth/email-already-in-use');
    const eA = A.escuchar('sync', 'users'); await quieto();
    await A.auth.signOut(); await quieto();
    ok(A.auth.currentUser === null && vistos[vistos.length - 1] === null && A.canales.length === 0, 'Al cerrar sesión se cortan las escuchas y no queda nada de la cuenta anterior');
    eA.parar();
    ok(typeof A.firebase.auth.Auth.Persistence.SESSION === 'string' && (await A.auth.setPersistence('session')) === undefined, 'setPersistence se acepta (la sesión vive en la pestaña)');
  }

  /* ===== 8b. Bloqueo de escrituras de «Modo visualización» / «Ver como» (la página envuelve los prototipos) ===== */
  {
    const S = crearServidor(), A = crearDispositivo(S, 'A'), F = A.firebase.firestore;
    ok(['DocumentReference', 'CollectionReference', 'WriteBatch', 'Transaction', 'Firestore'].every(n => F[n] && F[n].prototype), 'firebase.firestore expone las clases que la página envuelve para bloquear escrituras');
    let bloqueado = true; const rutas = [];
    const envolver = (proto, m, conRef) => { const o = proto[m]; proto[m] = function(ref){ if (bloqueado) { rutas.push(m + ':' + ((conRef ? ref : this).path || '')); if (conRef) throw new Error('bloqueado'); return Promise.reject(new Error('bloqueado')); } return o.apply(this, arguments); }; };
    ['set', 'update', 'delete'].forEach(m => envolver(F.DocumentReference.prototype, m));
    envolver(F.CollectionReference.prototype, 'add'); envolver(F.WriteBatch.prototype, 'commit'); envolver(F.Firestore.prototype, 'runTransaction');
    ['set', 'update', 'delete'].forEach(m => envolver(F.Transaction.prototype, m, true));
    const falla = async p => { try { await p(); return false; } catch (e) { return e.message === 'bloqueado'; } };
    const d = A.db.collection('sync').doc('paletas');
    const r = [await falla(() => d.set({ a: 1 })), await falla(() => d.update({ a: 1 })), await falla(() => d.delete()), await falla(() => A.db.collection('auditoriaTareos').add({ a: 1 })),
      await falla(() => A.db.runTransaction(async tx => { tx.set(d, { a: 1 }); })), await falla(async () => { const l = A.db.batch(); l.set(d, { a: 1 }); await l.commit(); })];
    ok(r.every(Boolean) && S.registro.length === 0, 'Con el bloqueo activo no sale ninguna escritura (set, update, delete, add, transacción, lote)');
    ok(rutas.includes('set:sync/paletas') && rutas.includes('add:auditoriaTareos'), 'El bloqueo recibe la ruta del documento (ref.path)');
    bloqueado = false;
    await d.set({ a: 1 }); await A.db.runTransaction(async tx => { tx.set(d, { a: 2 }); });
    ok(S.documento('sync', 'paletas').a === 2, 'Sin el bloqueo las escrituras vuelven a funcionar');
  }

  /* ===== 9. Muchos dispositivos a la vez, con red mala: todos terminan iguales ===== */
  for (const semilla of [3, 8, 11, 20, 29, 47]) {
    const S = crearServidor(); S.sinDatosSiNoCambian = semilla % 2 === 1;
    const N = 5, Ds = [], Es = [];
    for (let i = 0; i < N; i++) { const D = crearDispositivo(S, 'D' + i, { semilla: semilla + i }); Ds.push(D); }
    await Ds[0].db.collection('sync').doc('paletas').set({ items: [{ id: 'base', n: 0 }], total: 0 });
    Ds.forEach(D => Es.push(D.escuchar('sync', 'paletas')));
    await quieto(60);
    Ds.forEach((D, i) => { D.demora = 4; D.perderAvisos = i === 1 ? 0.25 : i === 2 ? 0.1 : 0; D.perderRespuesta = i === 3 ? 0.2 : 0; });
    const tareas = [], agregados = new Set(), quitados = new Set();
    let serie = 0;
    for (let ronda = 0; ronda < 14; ronda++) {
      Ds.forEach((D, i) => {
        const E = Es[i], azar = D.azar();
        const lista = clon((E.ultimo && E.ultimo.items) || []);
        if (azar < 0.45) { const id = 'd' + i + '_' + (serie++); lista.push({ id, n: ronda }); agregados.add(id); }
        else if (azar < 0.65 && lista.length > 1) quitados.add(lista.splice(Math.floor(D.azar() * lista.length), 1)[0].id);
        else if (azar < 0.85 && lista.length) lista[Math.floor(D.azar() * lista.length)].n = ronda * 10 + i;
        else if (lista.length > 2) lista.unshift(lista.pop());
        if (azar > 0.9) tareas.push(D.db.runTransaction(async tx => { const s = await tx.get(D.db.collection('sync').doc('paletas')); tx.set(D.db.collection('sync').doc('paletas'), { total: (s.data().total || 0) + 1 }, { merge: true }); }).catch(e => { if (e.code !== 'aborted' && e.code !== 'unavailable') throw e; }));
        else tareas.push(D.db.collection('sync').doc('paletas').set({ items: lista }, { merge: true }));
      });
      if (ronda === 6) { Ds[4].desconectar(); }
      if (ronda === 9) { Ds[4].conectar(); }
      await pausa(8);
    }
    await Promise.all(tareas);
    Ds.forEach(D => { D.perderAvisos = 0; D.perderRespuesta = 0; D.demora = 0; });
    await quieto(150);
    Ds.forEach(D => { D.desconectar(); D.conectar(); });          // una reconexión pone al día a quien perdió avisos al final
    await quieto(200);
    const real = S.documento('sync', 'paletas');
    const todosIguales = Es.every(E => JSON.stringify(E.ultimo) === JSON.stringify(real));
    ok(todosIguales, 'Semilla ' + semilla + ': 5 dispositivos, ' + tareas.length + ' guardados cruzados con avisos perdidos, respuestas perdidas y un corte de conexión → todos muestran lo mismo que el servidor (' + real.items.length + ' elementos)');
    if (!todosIguales) Es.forEach((E, i) => console.log('     D' + i + ': ' + ids(E.ultimo && E.ultimo.items) + ' | total ' + (E.ultimo && E.ultimo.total)), console.log('     real: ' + ids(real.items) + ' | total ' + real.total));
    const presentes = new Set(real.items.map(x => x.id)), perdidos = [...agregados].filter(id => !quitados.has(id) && !presentes.has(id));
    ok(!perdidos.length, 'Semilla ' + semilla + ': ningún elemento registrado se pierde por guardados simultáneos' + (perdidos.length ? ' — perdidos: ' + perdidos.join(',') : ''));
    const filas = [...S.items.values()].filter(i => !i.eliminado_en).length;
    ok(filas === real.items.length && new Set(real.items.map(x => x.id)).size === real.items.length, 'Semilla ' + semilla + ': sin elementos duplicados ni filas huérfanas');
  }

  /* ===== Inicio de sesión rápido: primero llegan los usuarios, el resto de las lecturas espera su turno ===== */
  {
    const S = crearServidor(), A = crearDispositivo(S, 'A');
    S.sembrar && S.sembrar('sync', 'users', { items: [{ username: 'u' }] });
    let liberar; A.sb.glacialTurnoCarga = new Promise(r => { liberar = () => { A.sb.glacialTurnoCarga = null; r(); }; });
    const eU = A.escuchar('sync', 'users'), eP = A.escuchar('sync', 'paletas');
    await pausa(80);
    ok(A.llamadas.fs_leer === 1, 'con el turno cerrado solo se pide el documento de usuarios (' + A.llamadas.fs_leer + ' lectura)');
    liberar(); await pausa(80);
    ok(A.llamadas.fs_leer === 2, 'al llegar los usuarios se piden las demás lecturas (' + A.llamadas.fs_leer + ' lecturas)');
  }

  console.log(fallas ? '\n✘ ' + fallas + ' falla(s)' : '\n✔ Puente Supabase: todas las pruebas pasaron');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error('ERROR EN LA PRUEBA', e); process.exit(1); });
