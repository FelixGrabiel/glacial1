/* =============================================================
   GLACIAL · PUENTE DE COMPATIBILIDAD  Firebase → Supabase
   -------------------------------------------------------------
   La página sigue usando `firebase`, `db` y `auth` como siempre. Este archivo define esos
   mismos objetos (la parte que GLACIAL usa) y los resuelve contra Supabase:

     db.collection(c).doc(d).get() / set() / update() / delete() / onSnapshot()
     db.collection(c).where().orderBy().limit().get() / onSnapshot() / add()
     db.runTransaction() · db.batch()
     firebase.firestore.FieldValue.serverTimestamp() / delete() · firebase.firestore.Timestamp
     firebase.auth(): signInWithEmailAndPassword · signOut · onAuthStateChanged · currentUser
     app secundaria: createUserWithEmailAndPassword (crea la cuenta sin cerrar la sesión del Administrador)

   Cómo se guarda en Supabase (migraciones glacial_20a…20d):
     · Un documento = una fila de fs_docs. Cada lista de objetos con clave única (items, paradasOperativas…)
       se parte: cada elemento es una fila de fs_items. Ya no existe el límite de 1 MiB por documento.
     · Guardar = función fs_commit (todo o nada, con las mismas reglas de firestore.rules.etapa2.txt).
       Solo se envía lo que cambió (elementos nuevos, modificados o quitados), no la lista completa.
     · Tiempo real: los cambios de otros dispositivos llegan por Realtime y se aplican a la copia local.
     · Nada se borra físicamente: lo eliminado queda marcado y se puede recuperar.

   Cargar DESPUÉS de la librería supabase-js y ANTES de js/nucleo/01-config.js.
   Pruebas: tests/puente-supabase.test.js (usa un servidor simulado mediante window.__GLACIAL_TRANSPORTE__).
   ============================================================= */
(function instalarPuenteSupabase(global){
  'use strict';

  /* =========================================================
     1) VALORES ESPECIALES: hora del servidor, borrar campo, Timestamp
     ========================================================= */
  let desfaseServidor = 0;                                   // hora del servidor − hora del equipo (ms)
  const ahoraServidor = () => Date.now() + desfaseServidor;
  const anotarHoraServidor = ms => { if (Number.isFinite(ms)) desfaseServidor = ms - Date.now(); };

  class Timestamp {
    constructor(seconds, nanoseconds){ this.seconds = seconds; this.nanoseconds = nanoseconds || 0; }
    static fromMillis(ms){ const n = Number(ms) || 0, s = Math.floor(n / 1000); return new Timestamp(s, Math.round((n - s * 1000) * 1e6)); }
    static fromDate(d){ return Timestamp.fromMillis(d.getTime()); }
    static now(){ return Timestamp.fromMillis(ahoraServidor()); }
    toMillis(){ return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
    toDate(){ return new Date(this.toMillis()); }
    isEqual(o){ return !!o && o.seconds === this.seconds && o.nanoseconds === this.nanoseconds; }
    valueOf(){ return String(this.seconds).padStart(12, '0') + '.' + String(this.nanoseconds).padStart(9, '0'); }
    toJSON(){ return { seconds: this.seconds, nanoseconds: this.nanoseconds }; }
  }
  class Marca { constructor(tipo){ this.__fs = tipo; } }       // FieldValue
  const FieldValue = { serverTimestamp: () => new Marca('ts'), delete: () => new Marca('del') };

  const esObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const esMarcaTs = v => esObj(v) && v.__fs === 'ts';
  const esMarcaDel = v => esObj(v) && v.__fs === 'del';
  const esHora = v => esObj(v) && typeof v.__ts === 'number' && Object.keys(v).length === 1;

  /* Página → formato de envío (JSON puro). undefined se omite, como hace JSON. */
  function aEnvio(v){
    if (v === undefined || typeof v === 'function' || typeof v === 'symbol') return undefined;
    if (v === null) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'object') return v;
    if (v instanceof Marca) return { __fs: v.__fs };
    if (v instanceof Timestamp) return { __ts: v.toMillis() };
    if (v instanceof Date) return { __ts: v.getTime() };
    if (Array.isArray(v)) return v.map(x => { const y = aEnvio(x); return y === undefined ? null : y; });
    if (typeof v.toMillis === 'function') return { __ts: v.toMillis() };
    const o = {};
    for (const k of Object.keys(v)) { const y = aEnvio(v[k]); if (y !== undefined) o[k] = y; }
    return o;
  }
  /* Formato guardado → página (copia nueva en cada lectura: la página puede modificarla). */
  function aPagina(v){
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(aPagina);
    if (esHora(v)) return Timestamp.fromMillis(v.__ts);
    const o = {};
    for (const k in v) o[k] = aPagina(v[k]);
    return o;
  }
  /* Texto canónico (claves ordenadas): sirve para saber si un elemento cambió de verdad. */
  function canon(v){
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  /* Igual que glacial_fs.resolver / glacial_fs.mezclar del servidor. */
  function resolver(v, ahora){
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(x => resolver(x, ahora));
    if (esMarcaTs(v)) return { __ts: ahora };
    const o = {};
    for (const k in v) { if (esMarcaDel(v[k])) continue; o[k] = resolver(v[k], ahora); }
    return o;
  }
  function mezclar(base, cambios, profundo, ahora){
    const r = Object.assign({}, base || {});
    for (const k of Object.keys(cambios || {})) {
      const x = cambios[k];
      if (esMarcaDel(x)) delete r[k];
      else if (profundo && esObj(x) && !esMarcaTs(x) && !('__ts' in x) && esObj(r[k]) && !('__ts' in r[k])) r[k] = mezclar(r[k], x, true, ahora);
      else r[k] = resolver(x, ahora);
    }
    return r;
  }

  /* =========================================================
     2) LISTAS PARTIDAS: qué campo se parte y qué cambió
     ========================================================= */
  const CLAVES_LISTA = ['id', 'username', 'clave', 'opId', 'email', 'uid'];   // mismo orden que glacial_fs.clave_de_lista
  function claveDeLista(lista){
    if (!Array.isArray(lista) || !lista.length) return null;
    if (!lista.every(esObj)) return null;
    for (const cand of CLAVES_LISTA) {
      const vistos = new Set(); let ok = true;
      for (const e of lista) {
        const v = e[cand], t = typeof v;
        if ((t !== 'string' && t !== 'number') || String(v).length < 1 || String(v).length > 300 || vistos.has(String(v))) { ok = false; break; }
        vistos.add(String(v));
      }
      if (ok) return cand;
    }
    return null;
  }
  /* Índices de la subsecuencia creciente más larga (los elementos que conservan su posición). */
  function fijosCrecientes(valores){
    const colas = [], previo = new Array(valores.length).fill(-1), enCola = [];
    valores.forEach((v, i) => {
      if (v === null) return;
      let lo = 0, hi = colas.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (colas[m] < v) lo = m + 1; else hi = m; }
      colas[lo] = v; enCola[lo] = i; previo[i] = lo > 0 ? enCola[lo - 1] : -1;
    });
    const fijos = new Set();
    for (let i = colas.length ? enCola[colas.length - 1] : -1; i >= 0; i = previo[i]) fijos.add(i);
    return fijos;
  }
  /* Compara la lista nueva con la guardada y devuelve solo las altas/cambios (up) y las bajas (del). */
  function diferenciaDeLista(base, lista, clave){
    base = base || new Map();
    const nuevos = lista.map(e => ({ id: String(e[clave]), datos: e, txt: canon(e), pos: null }));
    const posBase = nuevos.map(n => base.has(n.id) ? base.get(n.id).pos : null);
    const fijos = fijosCrecientes(posBase);
    let renumerar = false;
    for (let i = 0; i < nuevos.length; ) {
      if (fijos.has(i)) { nuevos[i].pos = posBase[i]; i++; continue; }
      let j = i; while (j < nuevos.length && !fijos.has(j)) j++;          // tramo [i, j) sin posición
      const n = j - i;
      const antes = i > 0 ? nuevos[i - 1].pos : null, despues = j < nuevos.length ? posBase[j] : null;
      let ini, paso;
      if (antes === null && despues === null) { ini = 0; paso = 1; }
      else if (antes === null) { ini = despues - n - 1; paso = 1; }
      else if (despues === null) { ini = antes; paso = 1; }
      else { ini = antes; paso = (despues - antes) / (n + 1); if (paso < 1e-7) renumerar = true; }
      for (let k = 0; k < n; k++) nuevos[i + k].pos = ini + paso * (k + 1);
      i = j;
    }
    if (renumerar) nuevos.forEach((n, i) => { n.pos = i + 1; });
    const ids = new Set(nuevos.map(n => n.id));
    const up = nuevos.filter(n => { const b = base.get(n.id); return !b || b.txt !== n.txt || b.pos !== n.pos; })
      .map(n => ({ id: n.id, pos: n.pos, datos: n.datos }));
    const del = [...base.keys()].filter(id => !ids.has(id));
    return { up, del };
  }

  /* =========================================================
     3) ESTADO DE UN DOCUMENTO (igual que lo deja fs_commit)
     ========================================================= */
  const claveElem = (campo, id) => campo + '\u0000' + id;
  class Estado {
    constructor(){
      this.existe = false; this.datos = {}; this.version = 0; this.partes = new Map(); this.conteos = {};
      this.ciega = false;            // true = no se conoce lo que hay guardado (no se pudo leer)
    }
    static deRespuesta(r){
      const e = new Estado();
      e.version = Number(r && r.version) || 0;
      if (!r || !r.existe) return e;
      e.existe = true; e.datos = r.datos || {}; e.conteos = r.conteos || {};
      for (const campo of Object.keys(r.partes || {})) {
        const m = new Map();
        (r.partes[campo] || []).forEach(f => m.set(String(f.id), { pos: Number(f.pos), datos: f.datos, txt: canon(f.datos) }));
        e.partes.set(campo, m);
      }
      return e;
    }
    static desconocido(){ const e = new Estado(); e.ciega = true; return e; }
    clonar(){
      const e = new Estado();
      e.existe = this.existe; e.datos = this.datos; e.version = this.version; e.conteos = this.conteos; e.ciega = this.ciega;
      this.partes.forEach((m, campo) => e.partes.set(campo, new Map(m)));
      return e;
    }
    /* Aplica una operación ya armada (misma forma que se envía a fs_commit). */
    aplicar(op, ahora){
      if (op.t === 'delete') { this.existe = false; this.datos = {}; this.partes = new Map(); this.conteos = {}; this.ciega = false; return; }
      let nuevo;
      if (op.t === 'update') nuevo = mezclar(this.datos, op.datos, false, ahora);
      else if (op.merge) nuevo = mezclar(this.existe ? this.datos : {}, op.datos, true, ahora);
      else { nuevo = mezclar({}, op.datos, false, ahora); this.ciega = false; }
      if (!this.existe) this.partes = new Map();
      const conservar = (op.t === 'update' || op.merge) ? new Set(this.partes.keys()) : new Set();
      for (const campo of Object.keys(op.partes || {})) {
        const p = op.partes[campo], m = this.partes.get(campo) || new Map();
        (p.del || []).forEach(id => m.delete(String(id)));
        if (p.todo) { const quedan = new Set((p.up || []).map(f => String(f.id))); [...m.keys()].forEach(id => { if (!quedan.has(id)) m.delete(id); }); }
        (p.up || []).forEach(f => { const d = resolver(f.datos, ahora); m.set(String(f.id), { pos: f.pos, datos: d, txt: canon(d) }); });
        this.partes.set(campo, m); conservar.add(campo); delete nuevo[campo];
      }
      (op.quitar || []).forEach(campo => conservar.delete(campo));
      Object.keys(op.datos || {}).forEach(campo => { if (!(op.partes && campo in op.partes)) conservar.delete(campo); });   // llega como dato normal
      [...this.partes.keys()].forEach(campo => { if (!conservar.has(campo)) this.partes.delete(campo); });
      this.datos = nuevo; this.existe = true;
      const c = {}; this.partes.forEach((m, campo) => { c[campo] = m.size; }); this.conteos = c;
    }
    /* Documento completo tal como lo espera la página. */
    armar(){
      const o = aPagina(this.datos);
      this.partes.forEach((m, campo) => {
        o[campo] = [...m.entries()].sort((a, b) => (a[1].pos - b[1].pos) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(x => aPagina(x[1].datos));
      });
      return o;
    }
    /* Texto que identifica el contenido: dos estados con la misma huella se ven igual en la página. */
    huella(){
      if (!this.existe) return '-';
      const t = [canon(this.datos)];
      [...this.partes.keys()].sort().forEach(campo => {
        t.push('\u0001' + campo);
        this.partes.get(campo).forEach((x, id) => t.push(id + '\u0002' + x.pos + '\u0002' + x.txt));
      });
      return t.join('\u0003');
    }
    partesCompletas(){
      for (const [campo, m] of this.partes) if (m.size !== (Number(this.conteos[campo]) || 0)) return false;
      return true;
    }
  }

  /* Arma la operación que se envía: los campos normales van en datos; las listas partidas, como diferencia. */
  function construirOp(c, d, t, envio, merge, vista){
    const op = { t, c, d };
    if (t === 'delete') return op;
    if (t === 'set') op.merge = !!merge;
    const datos = {}, partes = {}, quitar = [];
    const ciega = !!(vista && vista.ciega);
    const previas = vista && vista.existe ? vista.partes : new Map();
    for (const k of Object.keys(envio)) {
      const v = envio[k], yaParte = previas.has(k);
      if (Array.isArray(v)) {
        const clave = claveDeLista(v);
        if (clave) {
          partes[k] = diferenciaDeLista(previas.get(k), v, clave);
          if (ciega) partes[k].todo = true;                 // no se sabe qué había: la lista enviada es la lista completa
          continue;
        }
        if (yaParte && v.length === 0) { partes[k] = { up: [], del: [...previas.get(k).keys()] }; continue; }
        if (yaParte) quitar.push(k);
      } else if (yaParte) quitar.push(k);
      datos[k] = v;
    }
    op.datos = datos;
    if (Object.keys(partes).length) op.partes = partes;
    if (quitar.length) op.quitar = quitar;
    return op;
  }
  const necesitaBase = envio => Object.keys(envio || {}).some(k => Array.isArray(envio[k]) && claveDeLista(envio[k]));

  /* =========================================================
     4) ERRORES con los mismos códigos que usa la página
     ========================================================= */
  function errorFs(code, mensaje, extra){
    const e = new Error(mensaje || code); e.code = code; e.name = 'FirebaseError';
    return Object.assign(e, extra || {});
  }
  function traducirError(e){
    if (e && e.name === 'FirebaseError') return e;
    const cod = String((e && (e.code || e.codigo)) || ''), msg = String((e && e.message) || e || 'error');
    if (e && e.red) return errorFs('unavailable', msg, { red: true, servidor: !!e.servidor });
    if (cod === '42501' || /permission-denied/.test(msg)) return errorFs('permission-denied', 'Missing or insufficient permissions. ' + msg);
    if (cod === 'P0002' || /^not-found/.test(msg)) return errorFs('not-found', msg);
    if (cod === '40001' || /fs-conflicto/.test(msg)) return errorFs('aborted', msg, { conflicto: true });
    if (cod === 'PGRST301' || cod === '401' || /JWT/.test(msg)) return errorFs('unauthenticated', msg);
    return errorFs('unknown', msg);
  }

  /* =========================================================
     5) BASE DE DATOS
     ========================================================= */
  const espera = ms => new Promise(r => setTimeout(r, ms));
  const uuid = () => (global.crypto && global.crypto.randomUUID) ? global.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
  function idAutomatico(){
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let s = '';
    const b = new Uint8Array(20);
    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(b); else for (let i = 0; i < 20; i++) b[i] = Math.random() * 256;
    for (let i = 0; i < 20; i++) s += abc[b[i] % abc.length];
    return s;
  }
  const claveDoc = (c, d) => c + '\u0000' + d;
  const raizDe = c => String(c).split('/')[0];

  function crearBaseDeDatos(T){
    const vivos = new Map();          // claveDoc → DocVivo (documentos con escuchas)
    const consultas = new Set();      // ConsultaViva
    const canales = new Map();        // raíz → canal de tiempo real
    let enLinea = true;
    const oyentesConexion = new Set();
    function marcarConexion(v){
      if (enLinea === v) return;
      enLinea = v;
      vivos.forEach(doc => doc.emitir(true));
      oyentesConexion.forEach(f => { try { f(v); } catch (_) { /* un oyente no rompe a otro */ } });
    }

    /* ---- llamadas al servidor ---- */
    async function rpc(nombre, args){
      /* Al iniciar sesión primero llegan los usuarios (de eso depende entrar): las demás lecturas esperan ese turno (máximo unos segundos)
         en vez de competir con ellos en el servidor. Fuera de ese momento «glacialTurnoCarga» no existe y no se espera nada. */
      if (global.glacialTurnoCarga && (nombre === 'fs_leer' || nombre === 'fs_consulta') && !(args && args.p_c === 'sync' && args.p_d === 'users')) {
        await global.glacialTurnoCarga;
      }
      try {
        const r = await T.rpc(nombre, args);
        if (r && Number.isFinite(Number(r.ahora))) anotarHoraServidor(Number(r.ahora));
        marcarConexion(true);
        return r;
      } catch (e) {
        const err = traducirError(e);
        if (err.red) marcarConexion(false);
        throw err;
      }
    }
    const leerEstado = async (c, d) => Estado.deRespuesta(await rpc('fs_leer', { p_c: c, p_d: d }));

    /* Cola de guardados: uno tras otro, en el orden en que la página los pidió. */
    const cola = {
      p: Promise.resolve(),
      agregar(fn){ const r = this.p.then(fn, fn); this.p = r.then(() => {}, () => {}); return r; },
      vacia(){ return this.p; }
    };
    /* Antes de leer se espera a que salgan los guardados pendientes, pero no indefinidamente (p. ej. sin conexión). */
    const colaLista = () => Promise.race([cola.vacia(), espera(4000)]);
    /* Un guardado normal se reintenta mientras no haya conexión (como hace Firestore); con la misma clave no se duplica. */
    async function enviar(ops, lecturas, clave, reintentar){
      for (let intento = 0; ; intento++) {
        try {
          return await rpc('fs_commit', { p_ops: ops, p_lecturas: lecturas || null, p_clave: clave });
        } catch (e) {
          if (!e.red || (!reintentar && intento >= 2) || (e.servidor && intento >= 4)) throw e;   // un fallo del servidor no se reintenta sin fin
          await espera(Math.min(30000, 800 * Math.pow(2, Math.min(intento, 6))));
        }
      }
    }

    /* ---- documento con escuchas ----
       «conf» es siempre una foto exacta del documento en una versión concreta, y solo avanza:
         · con la confirmación de un guardado propio (es justo el cambio siguiente), o
         · con el aviso de tiempo real de un guardado ajeno. Llega UN aviso por guardado (la fila del documento, con su
           «version»). Si ese guardado no tocó listas partidas, el aviso ya trae todo; si las tocó, el dispositivo pide
           al servidor solo lo que cambió desde la versión que tiene (fs_cambios) y lo aplica de una vez.
       Así la página nunca ve un guardado a medias, y un aviso perdido se recupera con el siguiente o al reconectar. */
    class DocVivo {
      constructor(c, d){
        this.c = c; this.d = d; this.conf = null; this.oyentes = new Set();
        this.pend = [];                // guardados propios que se muestran por adelantado: { id, op, ver (cuando el servidor ya confirmó) }
        this.cargando = null; this.error = null; this.firma = -1; this.cambios = 0; this.programada = false; this.forzar = false;
        this.alDia = null;             // lectura de cambios en curso
        this.visto = 0;                // versión más alta de la que se tiene noticia
        this.atrasado = false;         // no se pudo poner al día (sin conexión): se reintenta al reconectar
      }
      vista(){
        if (!this.conf) return null;
        if (!this.pend.length) return this.conf;
        const v = this.conf.clonar(), ahora = ahoraServidor();
        this.pend.forEach(p => { try { v.aplicar(p.op, ahora); } catch (_) { /* un update sobre algo inexistente fallará en el servidor */ } });
        return v;
      }
      pendientes(){ return this.pend.some(p => !p.ver); }
      vivo(){ return vivos.get(claveDoc(this.c, this.d)) === this; }
      /* Tras avanzar de versión se sueltan los guardados propios que ya están incluidos. */
      _limpiar(){
        const n = this.conf.version;
        if (!this.pend.some(p => p.ver && p.ver <= n)) return false;
        const antes = this.vista().huella();
        this.pend = this.pend.filter(p => !(p.ver && p.ver <= n));
        return this.vista().huella() !== antes;                         // true = al soltarlos cambió lo que se ve
      }
      _avisarError(err){ this.error = err; this.oyentes.forEach(o => { if (o.error) { try { o.error(err); } catch (_) { /* nada */ } } }); }
      /* Primera lectura (o relectura completa). */
      cargar(){
        if (this.cargando) return this.cargando;
        this.cargando = leerEstado(this.c, this.d).then(e => {
          this.cargando = null;
          if (this.conf && e.version < this.conf.version) return;      // una lectura vieja nunca pisa lo más nuevo
          this.conf = e; this.error = null; this.atrasado = false; this._limpiar(); this.emitir();
          if (this.visto > e.version) this.ponerAlDia();
        }, err => {
          this.cargando = null;
          if (!err.red) { this._avisarError(err); return; }
          this.atrasado = true;
          /* Sin conexión la escucha no falla: espera y lo vuelve a intentar (como Firestore). */
          setTimeout(() => { if (!this.conf && this.oyentes.size && this.vivo()) this.cargar(); }, 3000);
        });
        return this.cargando;
      }
      /* Aplica lo que cambió desde la versión que se tiene. Devuelve false si la respuesta es más vieja que lo local. */
      _aplicarCambios(r){
        const e = this.conf, ver = Number(r.version) || 0;
        if (ver <= e.version) return false;
        e.version = ver;
        if (!r.existe) { e.existe = false; e.datos = {}; e.partes = new Map(); e.conteos = {}; return true; }
        if (!e.existe) e.partes = new Map();
        e.existe = true; e.datos = r.datos || {}; e.conteos = r.conteos || {};
        (r.items || []).forEach(x => {
          const id = String(x.id); let m = e.partes.get(x.campo);
          if (x.eliminado) { if (m) m.delete(id); return; }
          if (!m) { m = new Map(); e.partes.set(x.campo, m); }
          m.set(id, { pos: Number(x.pos), datos: x.datos, txt: canon(x.datos) });
        });
        const vigentes = new Set(r.partes || []);
        [...e.partes.keys()].forEach(campo => { if (!vigentes.has(campo)) e.partes.delete(campo); });
        vigentes.forEach(campo => { if (!e.partes.has(campo)) e.partes.set(campo, new Map()); });
        return true;
      }
      /* Pide al servidor lo que cambió desde la versión local, hasta alcanzar la última versión de la que se tiene noticia. */
      ponerAlDia(){
        if (!this.conf) return this.cargar();
        if (this.alDia) return this.alDia;
        const ronda = async () => {
          for (let vuelta = 0; vuelta < 25; vuelta++) {
            const r = await rpc('fs_cambios', { p_c: this.c, p_d: this.d, p_desde: this.conf.version });
            /* Lo que se aplica se avisa a la página en el mismo instante: lo que la página conoce y «conf» nunca se separan
               (de eso depende que al guardar una lista solo viaje lo que esa persona cambió). */
            if (this._aplicarCambios(r)) { this._limpiar(); this.emitir(); }
            if (!this.conf.partesCompletas()) return 'releer';          // red de seguridad: los conteos deben cuadrar
            if (this.conf.version >= this.visto || !r.existe) return '';
            await espera(120);
          }
          return '';
        };
        this.alDia = ronda().then(res => {
          this.alDia = null; this.atrasado = false; this.visto = Math.max(this.visto, this.conf.version);
          if (res === 'releer') { this.cargar(); return; }
          this.emitir(!this._limpiar());
        }, err => {
          this.alDia = null; this.atrasado = true;                       // sin conexión: se reintenta al reconectar
          if (err && err.code === 'permission-denied') this._avisarError(err);
        });
        return this.alDia;
      }
      /* soloMeta = no cambió el contenido, solo el estado (pendiente / sin conexión). */
      emitir(soloMeta){
        if (soloMeta) this.forzar = true; else this.cambios++;
        if (this.programada) return;
        this.programada = true;
        Promise.resolve().then(() => {
          this.programada = false;
          const v = this.vista(); if (!v) return;
          const forzar = this.forzar; this.forzar = false;
          const cambio = this.cambios !== this.firma; this.firma = this.cambios;
          this.oyentes.forEach(o => {
            if (!cambio && o.emitido && !(forzar && o.conMeta)) return;
            o.emitido = true;
            try { o.next(new FotoDoc(new RefDoc(this.c, this.d), v, { fromCache: !enLinea, hasPendingWrites: this.pendientes() })); }
            catch (e) { console.error('GLACIAL · una escucha de ' + this.c + '/' + this.d + ' falló:', e); }
          });
        });
      }
      /* Aviso de tiempo real: se guardó una versión nueva del documento. */
      alCambiarFila(f){
        const ver = Number(f.version) || 0;
        if (ver > this.visto) this.visto = ver;
        if (!this.conf || this.alDia || this.cargando) return;          // al terminar la lectura en curso se comprueba «visto»
        const e = this.conf;
        if (ver <= e.version) return;
        const partes = Array.isArray(f.partes) ? f.partes : [];
        const conDatos = f.datos !== undefined && f.datos !== null;
        /* El aviso basta por sí solo cuando ese guardado no tocó listas partidas y es el cambio siguiente
           (o el documento no tiene listas partidas: entonces viaja entero en su fila). */
        const basta = !(Number(f.tocados) || 0) && (conDatos || !!f.eliminado_en) && (ver === e.version + 1 || (!partes.length && !e.partes.size));
        if (!basta) { this.ponerAlDia(); return; }
        e.version = ver;
        if (f.eliminado_en) { e.existe = false; e.datos = {}; e.partes = new Map(); e.conteos = {}; }
        else {
          if (!e.existe) e.partes = new Map();
          e.existe = true; e.datos = f.datos; e.conteos = f.conteos || {};
          const vigentes = new Set(partes);
          [...e.partes.keys()].forEach(campo => { if (!vigentes.has(campo)) e.partes.delete(campo); });
          vigentes.forEach(campo => { if (!e.partes.has(campo)) e.partes.set(campo, new Map()); });
          if (!e.partesCompletas()) { this.cargar(); return; }
        }
        this._limpiar();
        this.emitir();
      }
      /* El servidor confirmó un guardado propio que dejó el documento en la versión «ver». */
      alConfirmar(ops, ver, ahora, idPend){
        const adelantado = !!idPend && this.pend.some(p => p.id === idPend);
        const soltar = () => { if (adelantado) this.pend = this.pend.filter(p => p.id !== idPend); };
        if (!this.conf) { soltar(); return; }
        const e = this.conf, primera = ver - ops.length + 1;
        const antes = this.vista().huella();                             // para avisar a la página solo si cambia lo que ve
        const conHora = JSON.stringify(ops).indexOf('"__fs":"ts"') >= 0;   // la hora estimada se reemplaza por la del servidor
        const avisar = () => this.emitir(!conHora && this.vista().huella() === antes);
        if (!ver) {                                                      // p. ej. borrar algo que ya no existía
          soltar();
          if (e.existe) this.cargar(); else avisar();
          return;
        }
        if (ver > this.visto) this.visto = ver;
        if (ver <= e.version) { soltar(); avisar(); return; }            // ya llegó por tiempo real
        if (primera === e.version + 1) {                                 // lo normal: es justo el cambio siguiente
          let fallo = false;
          ops.forEach(op => { try { e.aplicar(op, ahora); } catch (_) { fallo = true; } });
          e.version = ver; soltar(); this._limpiar();
          if (fallo) { this.cargar(); return; }
          avisar();
          return;
        }
        /* Otros guardaron en medio: se sigue mostrando lo propio y se pide lo que falta. */
        if (adelantado) this.pend.forEach(p => { if (p.id === idPend) p.ver = ver; });
        else ops.forEach(op => this.pend.push({ id: uuid(), op, ver }));
        avisar();
        this.ponerAlDia();
      }
    }

    /* Un canal de tiempo real por colección raíz: un aviso por cada guardado (la fila del documento). */
    function suscribirRaiz(raiz){
      if (canales.has(raiz)) return;
      const reg = { canal: null, listo: false };
      canales.set(raiz, reg);
      reg.canal = T.canal('fs:' + raiz, [
        { tabla: 'fs_docs', filtro: 'raiz=eq.' + raiz, alCambiar: f => {
            if (!f || !f.coleccion) return;
            const doc = vivos.get(claveDoc(f.coleccion, f.id)); if (doc) doc.alCambiarFila(f);
            consultas.forEach(q => { if (q.c === f.coleccion) q.programar(); });
          } }
      ], estado => {
        if (canales.get(raiz) !== reg) return;                       // canal ya cerrado por nosotros
        if (estado === 'SUBSCRIBED') { reg.listo = true; marcarConexion(true); resincronizar(raiz); }
        else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') { reg.listo = false; marcarConexion(false); }
      });
    }
    function soltarRaizSiLibre(raiz){
      for (const doc of vivos.values()) if (raizDe(doc.c) === raiz) return;
      for (const q of consultas) if (raizDe(q.c) === raiz) return;
      const reg = canales.get(raiz);
      if (reg) { canales.delete(raiz); try { reg.canal.cerrar(); } catch (_) { /* ya cerrado */ } }
    }
    /* Comprueba qué documentos cambiaron sin que llegara su aviso (al conectar, al reconectar, al volver a la pestaña
       y cada pocos minutos como red de seguridad). Es una sola consulta pequeña para todos los documentos abiertos. */
    let resincronizando = false;
    async function resincronizar(raiz){
      const deRaiz = [...vivos.values()].filter(doc => !raiz || raizDe(doc.c) === raiz);
      deRaiz.forEach(doc => { if (!doc.conf) doc.cargar(); });
      consultas.forEach(q => { if (!raiz || raizDe(q.c) === raiz) q.programar(); });
      const lista = deRaiz.filter(doc => doc.conf);
      if (!lista.length || resincronizando) return;
      resincronizando = true;
      try {
        for (let i = 0; i < lista.length; i += 150) {
          const vs = await rpc('fs_versiones', { p_docs: lista.slice(i, i + 150).map(doc => ({ c: doc.c, d: doc.d })) });
          (vs || []).forEach(v => {
            const doc = vivos.get(claveDoc(v.c, v.d)); if (!doc || !doc.conf) return;
            const ver = Number(v.v) || 0;
            if (ver > doc.visto) doc.visto = ver;
            if (doc.atrasado || ver !== (doc.conf.existe ? doc.conf.version : 0)) doc.ponerAlDia();
          });
        }
      } catch (_) { /* se volverá a intentar al reconectar */ }
      resincronizando = false;
    }
    if (global.addEventListener) {
      global.addEventListener('online', () => { marcarConexion(true); resincronizar(); });
      global.addEventListener('offline', () => marcarConexion(false));
    }
    const visible = () => !(global.document && global.document.visibilityState === 'hidden');
    if (global.document && global.document.addEventListener) {
      global.document.addEventListener('visibilitychange', () => { if (visible() && (vivos.size || consultas.size)) resincronizar(); });
    }
    if (typeof global.setInterval === 'function') {
      global.setInterval(() => { if (visible() && (vivos.size || consultas.size)) resincronizar(); }, 180000);
    }

    /* Reparte a los documentos con escuchas lo que el servidor confirmó. idPend = guardado que ya se mostraba por adelantado. */
    function confirmar(res, ops, idPend){
      const ahora = Number(res.ahora) || ahoraServidor();
      const ultimo = new Map(); (res.docs || []).forEach(x => ultimo.set(claveDoc(x.c, x.d), x));
      const porDoc = new Map(), tocadas = new Set();
      ops.forEach(op => { tocadas.add(op.c); const k = claveDoc(op.c, op.d); if (!porDoc.has(k)) porDoc.set(k, []); porDoc.get(k).push(op); });
      porDoc.forEach((lista, k) => {
        const doc = vivos.get(k); if (!doc) return;
        const r = ultimo.get(k);
        doc.alConfirmar(lista, r ? (Number(lista[lista.length - 1].t === 'delete' ? r.vr : r.v) || 0) : 0, ahora, idPend);
      });
      consultas.forEach(q => { if (tocadas.has(q.c)) q.programar(0); });
    }
    function descartarPendiente(ops, idPend){
      ops.forEach(op => { const doc = vivos.get(claveDoc(op.c, op.d)); if (doc && doc.pend.some(p => p.id === idPend)) { doc.pend = doc.pend.filter(p => p.id !== idPend); doc.emitir(); } });
    }

    /* Guardado normal (fuera de transacción): se refleja de inmediato en la página y se envía en orden. */
    function escribir(ref, t, datos, merge){
      let envio = null;
      if (t !== 'delete') {
        envio = aEnvio(datos);
        if (!esObj(envio)) return Promise.reject(errorFs('invalid-argument', 'Los datos a guardar deben ser un objeto.'));
      }
      const id = uuid(), doc = vivos.get(ref.clave);
      let op = null;
      if (doc && doc.conf) { op = construirOp(ref.c, ref.d, t, envio, merge, doc.vista()); doc.pend.push({ id, op }); doc.emitir(); }
      return cola.agregar(async () => {
        try {
          if (!op) {
            let base = null;
            if (t !== 'delete' && necesitaBase(envio)) {
              try { base = await leerEstado(ref.c, ref.d); }
              catch (e) { if (e.code !== 'permission-denied') throw e; base = Estado.desconocido(); }
            }
            op = construirOp(ref.c, ref.d, t, envio, merge, base);
          }
          const res = await enviar([op], null, id, true);
          confirmar(res, [op], id);
        } catch (e) {
          if (op) descartarPendiente([op], id);
          throw e;
        }
      });
    }

    /* ---- fotos (snapshots) ---- */
    class FotoDoc {
      constructor(ref, estado, meta){
        this.ref = ref; this.id = ref.id; this.exists = !!(estado && estado.existe); this._e = estado;
        this.metadata = meta || { fromCache: !enLinea, hasPendingWrites: false };
      }
      data(){ return this.exists ? this._e.armar() : undefined; }
      get(campo){ const d = this.data(); return d === undefined ? undefined : String(campo).split('.').reduce((o, k) => (o === null || o === undefined) ? undefined : o[k], d); }
    }
    class FotoFila {                                         // documento dentro de una consulta
      constructor(c, fila){ this.ref = new RefDoc(c, fila.id); this.id = fila.id; this.exists = true; this._d = fila.datos; this.metadata = { fromCache: !enLinea, hasPendingWrites: false }; }
      data(){ return aPagina(this._d); }
      get(campo){ return String(campo).split('.').reduce((o, k) => (o === null || o === undefined) ? undefined : o[k], this.data()); }
    }
    class FotoConsulta {
      constructor(c, filas, cambios){
        this.docs = filas.map(f => new FotoFila(c, f)); this.size = this.docs.length; this.empty = !this.docs.length;
        this._cambios = cambios; this.metadata = { fromCache: !enLinea, hasPendingWrites: false };
      }
      forEach(f, este){ this.docs.forEach(f, este); }
      docChanges(){ return this._cambios || this.docs.map((doc, i) => ({ type: 'added', doc, oldIndex: -1, newIndex: i })); }
    }
    function oyenteDe(args){
      let i = 0, opciones = {};
      if (esObj(args[0]) && typeof args[0].next !== 'function' && typeof args[0] !== 'function') { opciones = args[0]; i = 1; }
      if (esObj(args[i]) && typeof args[i].next === 'function') return { next: args[i].next, error: args[i].error, conMeta: !!opciones.includeMetadataChanges };
      return { next: args[i], error: args[i + 1], conMeta: !!opciones.includeMetadataChanges };
    }

    /* ---- referencias ---- */
    class RefDoc {
      constructor(c, d){ this.c = c; this.d = String(d); this.id = this.d; this.path = c + '/' + this.d; this.clave = claveDoc(c, this.d); }
      get parent(){ return new Coleccion(this.c); }
      collection(nombre){ return new Coleccion(this.path + '/' + nombre); }
      async get(){
        await colaLista();                                    // primero se guardan los cambios pendientes de esta sesión
        const doc = vivos.get(this.clave);
        let e;
        try { e = await leerEstado(this.c, this.d); }
        catch (err) {                                         // sin conexión: se responde con la copia local, si la hay
          if (err.red && doc && doc.conf) return new FotoDoc(this, doc.vista(), { fromCache: true, hasPendingWrites: doc.pendientes() });
          throw err;
        }
        if (doc && doc.pend.length) { const ahora = ahoraServidor(); doc.pend.forEach(p => { try { e.aplicar(p.op, ahora); } catch (_) { /* nada */ } }); }
        return new FotoDoc(this, e);
      }
      set(datos, opciones){ return escribir(this, 'set', datos, !!(opciones && (opciones.merge || opciones.mergeFields))); }
      update(datos, ...resto){
        if (typeof datos === 'string') { const o = {}; o[datos] = resto[0]; for (let i = 1; i + 1 < resto.length; i += 2) o[resto[i]] = resto[i + 1]; datos = o; }
        return escribir(this, 'update', datos, false);
      }
      delete(){ return escribir(this, 'delete'); }
      onSnapshot(...args){
        const o = oyenteDe(args);
        let doc = vivos.get(this.clave);
        if (!doc) { doc = new DocVivo(this.c, this.d); vivos.set(this.clave, doc); }
        doc.oyentes.add(o);
        suscribirRaiz(raizDe(this.c));
        if (doc.conf) doc.emitir(true); else doc.cargar();
        return () => {
          doc.oyentes.delete(o);
          if (!doc.oyentes.size && vivos.get(this.clave) === doc) { vivos.delete(this.clave); soltarRaizSiLibre(raizDe(this.c)); }
        };
      }
    }

    class ConsultaViva {
      constructor(q, o){ this.q = q; this.c = q.c; this.o = o; this.filas = null; this.reloj = null; this.cerrada = false; this.corriendo = false; this.otra = false; }
      programar(ms){
        if (this.cerrada) return;
        clearTimeout(this.reloj);
        /* Una consulta lenta no se repite sin descanso: entre una lectura y la siguiente espera 1.5 veces lo que tardó (máx. 8 s). Antes, con una colección que cambia
           seguido y una consulta de varios segundos, cada equipo la pedía una y otra vez y saturaba el servidor. */
        const espera = Math.min(8000, Math.round((this.ultimaDur || 0) * 1.5));
        this.reloj = setTimeout(() => this.correr(), Math.max(ms === undefined ? 120 : ms, espera));
      }
      async correr(){
        if (this.cerrada) return;
        if (this.corriendo) { this.otra = true; return; }
        this.corriendo = true;
        const inicio = Date.now();
        try {
          const filas = await this.q._leer();
          this.ultimaDur = Date.now() - inicio;
          if (this.cerrada) return;
          const antes = this.filas, cambios = [];
          const previo = new Map((antes || []).map((f, i) => [f.id, { f, i }]));
          filas.forEach((f, i) => {
            const p = previo.get(f.id);
            if (!p) cambios.push({ type: 'added', doc: new FotoFila(this.c, f), oldIndex: -1, newIndex: i });
            else if (p.f.version !== f.version || p.i !== i) cambios.push({ type: 'modified', doc: new FotoFila(this.c, f), oldIndex: p.i, newIndex: i });
            previo.delete(f.id);
          });
          previo.forEach(p => cambios.push({ type: 'removed', doc: new FotoFila(this.c, p.f), oldIndex: p.i, newIndex: -1 }));
          this.filas = filas;
          if (antes === null || cambios.length) { try { this.o.next(new FotoConsulta(this.c, filas, cambios)); } catch (e) { console.error('GLACIAL · una escucha de ' + this.c + ' falló:', e); } }
        } catch (e) {
          if (e.red) this.programar(3000);                                  // sin conexión: se reintenta
          else if (this.filas === null || e.code === 'permission-denied') { if (this.o.error) { try { this.o.error(e); } catch (_) { /* nada */ } } }
        } finally {
          this.corriendo = false;
          if (this.otra) { this.otra = false; this.programar(0); }
        }
      }
    }

    class Consulta {
      constructor(c, filtros, orden, limite){ this.c = c; this._f = filtros || []; this._o = orden || []; this._l = limite || null; }
      where(campo, op, valor){
        if (!['==', '<', '<=', '>', '>='].includes(op)) throw errorFs('unimplemented', 'El puente no admite el filtro «' + op + '».');
        return new Consulta(this.c, [...this._f, { campo: String(campo), op, valor: aEnvio(valor) }], this._o, this._l);
      }
      orderBy(campo, dir){ return new Consulta(this.c, this._f, [...this._o, { campo: String(campo), dir: String(dir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc' }], this._l); }
      limit(n){ return new Consulta(this.c, this._f, this._o, Number(n) || null); }
      async _leer(){
        const r = await rpc('fs_consulta', { p_c: this.c, p_filtros: this._f, p_orden: this._o, p_limite: this._l });
        return (r && r.docs) || [];
      }
      async get(){ await colaLista(); return new FotoConsulta(this.c, await this._leer()); }
      onSnapshot(...args){
        const viva = new ConsultaViva(this, oyenteDe(args));
        consultas.add(viva); suscribirRaiz(raizDe(this.c)); viva.correr();
        return () => { viva.cerrada = true; clearTimeout(viva.reloj); consultas.delete(viva); soltarRaizSiLibre(raizDe(this.c)); };
      }
    }
    class Coleccion extends Consulta {
      constructor(c){ super(c); this.id = String(c).split('/').pop(); this.path = c; }
      doc(id){ return new RefDoc(this.c, id === undefined || id === null || id === '' ? idAutomatico() : id); }
      add(datos){ const ref = this.doc(); return ref.set(datos).then(() => ref); }
    }

    /* ---- transacciones y lotes ---- */
    class Transaccion {
      constructor(){ this.leidos = new Map(); this.ops = []; }
      async get(ref){
        if (this.ops.length) throw errorFs('invalid-argument', 'En una transacción todas las lecturas van antes de las escrituras.');
        const e = await leerEstado(ref.c, ref.d);
        this.leidos.set(ref.clave, { ref, e });
        return new FotoDoc(ref, e);
      }
      _agregar(ref, t, datos, merge){
        let envio = null;
        if (t !== 'delete') { envio = aEnvio(datos); if (!esObj(envio)) throw errorFs('invalid-argument', 'Los datos a guardar deben ser un objeto.'); }
        this.ops.push({ ref, t, envio, merge });
        return this;
      }
      set(ref, datos, opciones){ return this._agregar(ref, 'set', datos, !!(opciones && opciones.merge)); }
      update(ref, datos){ return this._agregar(ref, 'update', datos, false); }
      delete(ref){ return this._agregar(ref, 'delete'); }
      async _armar(){
        const bases = new Map([...this.leidos].map(([k, x]) => [k, x.e.clonar()]));
        const ops = [];
        for (const o of this.ops) {
          let base = bases.get(o.ref.clave);
          if (!base) {                                        // escritura «a ciegas»: se usa la copia local o se lee
            const doc = vivos.get(o.ref.clave);
            if (doc && doc.conf) base = doc.vista().clonar();
            else if (o.t !== 'delete' && necesitaBase(o.envio)) { try { base = await leerEstado(o.ref.c, o.ref.d); } catch (e) { if (e.code !== 'permission-denied') throw e; base = Estado.desconocido(); } }
            else base = o.t === 'set' && !o.merge ? new Estado() : Estado.desconocido();
            bases.set(o.ref.clave, base);
          }
          const op = construirOp(o.ref.c, o.ref.d, o.t, o.envio, o.merge, base);
          ops.push(op);
          try { base.aplicar(op, ahoraServidor()); } catch (_) { /* el servidor dará el error real */ }
        }
        return ops;
      }
      _lecturas(){ return [...this.leidos.values()].map(x => ({ c: x.ref.c, d: x.ref.d, v: x.e.existe ? x.e.version : 0 })); }
    }
    async function runTransaction(funcion){
      await colaLista();
      let ultimo = null;
      for (let intento = 0; intento < 5; intento++) {
        const tx = new Transaccion();
        const resultado = await funcion(tx);
        if (!tx.ops.length) return resultado;
        const ops = await tx._armar();
        try {
          const res = await enviar(ops, tx._lecturas(), uuid(), false);
          confirmar(res, ops, null);
          return resultado;
        } catch (e) {
          if (!e.conflicto) throw e;
          ultimo = e;
          await espera(40 + Math.random() * 120 * (intento + 1));
        }
      }
      throw errorFs('aborted', 'No se pudo guardar: otra persona estaba cambiando lo mismo. Inténtalo de nuevo.', { causa: ultimo });
    }
    class Lote {
      constructor(){ this.tx = new Transaccion(); }
      set(ref, datos, opciones){ this.tx.set(ref, datos, opciones); return this; }
      update(ref, datos){ this.tx.update(ref, datos); return this; }
      delete(ref){ this.tx.delete(ref); return this; }
      async commit(){
        if (!this.tx.ops.length) return;
        const tx = this.tx;
        return cola.agregar(async () => {
          const ops = await tx._armar();
          const res = await enviar(ops, null, uuid(), true);
          confirmar(res, ops, null);
        });
      }
    }

    function reiniciar(){
      canales.forEach(reg => { try { reg.canal.cerrar(); } catch (_) { /* ya cerrado */ } });
      canales.clear(); vivos.clear();
      consultas.forEach(q => { q.cerrada = true; clearTimeout(q.reloj); });
      consultas.clear();
    }

    /* La base de datos es una clase con prototipo, igual que en Firebase: la página envuelve estos métodos para bloquear
       las escrituras en «Modo visualización» y en «Ver como» (23b-modo-visualizacion.js, 39-vista-como.js). */
    class Firestore {
      collection(c){ return new Coleccion(String(c)); }
      doc(ruta){ const p = String(ruta).split('/'); const d = p.pop(); return new RefDoc(p.join('/'), d); }
      runTransaction(funcion){ return runTransaction(funcion); }
      batch(){ return new Lote(); }
      _reiniciar(){ reiniciar(); }
      _enLinea(){ return enLinea; }
      _alCambiarConexion(f){ oyentesConexion.add(f); return () => oyentesConexion.delete(f); }
      _pendientes(){ return cola.vacia(); }
    }
    const base = new Firestore();
    base._clases = { Firestore, DocumentReference: RefDoc, CollectionReference: Coleccion, Query: Consulta, WriteBatch: Lote, Transaction: Transaccion };
    return base;
  }

  /* =========================================================
     6) INICIO DE SESIÓN (misma interfaz que firebase.auth())
     ========================================================= */
  function errorAuth(e){
    const msg = String((e && e.message) || e || ''), estado = Number(e && e.status) || 0;
    let code = 'auth/internal-error';
    if (/invalid login credentials|invalid_credentials|invalid_grant/i.test(msg) || estado === 400) code = 'auth/invalid-credential';
    if (/rate limit|too many/i.test(msg) || estado === 429) code = 'auth/too-many-requests';
    if (/already (been )?registered|already exists/i.test(msg)) code = 'auth/email-already-in-use';
    if (/weak|at least|should be/i.test(msg) && /password/i.test(msg)) code = 'auth/weak-password';
    if (/fetch|network|failed to/i.test(msg) && !estado) code = 'auth/network-request-failed';
    return errorFs(code, msg || code);
  }
  function crearAuth(T, db){
    let actual = null, inicial = false;
    const observadores = new Set();
    class Usuario {
      constructor(u){ this.uid = u.id; this.email = u.email || null; const m = u.user_metadata || {}; this.displayName = (m.display_name === undefined || m.display_name === '') ? null : m.display_name; }
      async updatePassword(nueva){ const r = await T.auth.updateUser({ password: nueva }); if (r.error) throw errorAuth(r.error); }
      async updateProfile(p){
        if (!p || !('displayName' in p)) return;
        const r = await T.auth.updateUser({ data: { display_name: p.displayName || '' } });
        if (r.error) throw errorAuth(r.error);
        this.displayName = p.displayName || null;
      }
      async getIdToken(){ const r = await T.auth.getSession(); return (r.data && r.data.session && r.data.session.access_token) || null; }
    }
    function fijar(u){
      const uidAntes = actual ? actual.uid : null, uidAhora = u ? u.id : null;
      if (uidAntes === uidAhora && inicial) { if (u) actual = new Usuario(u); return; }
      if (uidAntes !== uidAhora) db._reiniciar();              // otra cuenta (o ninguna): no se conserva nada de la anterior
      actual = u ? new Usuario(u) : null; inicial = true;
      observadores.forEach(o => { try { o.next(actual); } catch (e) { console.error('GLACIAL · observador de sesión:', e); } });
    }
    const listo = T.auth.getSession().then(r => { if (!inicial) fijar(r && r.data && r.data.session ? r.data.session.user : null); },
      e => { observadores.forEach(o => { if (o.error) o.error(errorAuth(e)); }); });
    T.auth.onAuthStateChange((evento, sesion) => {
      setTimeout(() => {                                       // nunca dentro del propio aviso de supabase-js
        if (evento === 'SIGNED_OUT') fijar(null);
        else if (sesion && sesion.user) fijar(sesion.user);
        else if (evento === 'INITIAL_SESSION') fijar(null);
      }, 0);
    });
    return {
      get currentUser(){ return actual; },
      setPersistence(){                                        // la sesión vive en sessionStorage (por pestaña), como antes
        return T.sinAlmacen ? Promise.reject(errorFs('auth/web-storage-unsupported', 'El navegador no permite guardar la sesión de esta pestaña.')) : Promise.resolve();
      },
      onAuthStateChanged(next, error){
        const o = { next, error };
        observadores.add(o);
        if (inicial) setTimeout(() => { if (observadores.has(o)) { try { next(actual); } catch (e) { console.error(e); } } }, 0);
        return () => observadores.delete(o);
      },
      async signInWithEmailAndPassword(email, clave){
        await listo;
        const r = await T.auth.signInWithPassword({ email: String(email || '').trim(), password: clave });
        if (r.error) throw errorAuth(r.error);
        fijar(r.data.user);
        return { user: actual };
      },
      async signOut(){
        db._reiniciar();
        const r = await T.auth.signOut({ scope: 'local' });
        fijar(null);
        if (r && r.error && !/session/i.test(String(r.error.message))) throw errorAuth(r.error);
      }
    };
  }
  /* App secundaria: el Administrador crea la cuenta de otra persona sin cerrar su propia sesión.
     En Supabase lo hace la función de servidor «fs-cuentas», que comprueba que quien llama sea Administrador. */
  function crearAuthSecundaria(T){
    async function llamar(cuerpo){
      const r = await T.funcion('fs-cuentas', cuerpo);
      if (!r || r.error) throw errorFs((r && r.codigo) || 'auth/internal-error', (r && r.error) || 'No se pudo crear la cuenta.');
      return r;
    }
    return {
      currentUser: null,
      async createUserWithEmailAndPassword(email, clave){
        const r = await llamar({ accion: 'crear', email, clave });
        const user = { uid: r.uid, email, displayName: null,
          updateProfile: async p => { await llamar({ accion: 'perfil', uid: r.uid, displayName: (p && p.displayName) || '' }); user.displayName = (p && p.displayName) || null; } };
        return { user };
      },
      signOut: async () => {}
    };
  }

  /* =========================================================
     7) TRANSPORTE REAL (supabase-js)
     ========================================================= */
  function transporteSupabase(config){
    if (!global.supabase || typeof global.supabase.createClient !== 'function') throw new Error('GLACIAL · falta cargar la librería supabase-js antes del puente.');
    let almacen;
    try { almacen = global.sessionStorage; almacen.setItem('__glacial_prueba', '1'); almacen.removeItem('__glacial_prueba'); }
    catch (_) { almacen = undefined; }
    const proyecto = String(config.supabaseUrl || '').replace(/^https?:\/\//, '').split('.')[0] || 'local';
    const sb = global.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
      /* La sesión se guarda por proyecto: una sesión de PRUEBAS nunca se confunde con una de PRODUCCION. */
      auth: { persistSession: !!almacen, storage: almacen, storageKey: 'firebase:authUser:glacial:' + proyecto, autoRefreshToken: true, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 20 } }
    });
    const deRed = e => !!e && (!e.code && /fetch|network|failed|load failed|timeout/i.test(String(e.message || e)));
    return {
      sb,
      sinAlmacen: !almacen,
      auth: sb.auth,
      async rpc(nombre, args){
        let r;
        try { r = await sb.rpc(nombre, args); } catch (e) { throw { red: true, message: String(e && e.message || e) }; }
        if (r.error) {
          if (deRed(r.error) || r.status === 0) throw { red: true, message: r.error.message || 'sin conexión' };
          if (r.status >= 500) throw { red: true, servidor: true, message: r.error.message || 'el servidor no respondió' };
          throw { code: r.error.code, message: r.error.message };
        }
        return r.data;
      },
      canal(nombre, enlaces, alEstado){
        let ch = sb.channel(nombre);
        enlaces.forEach(x => {
          ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: x.tabla, filter: x.filtro }, carga => { if (carga && carga.new && Object.keys(carga.new).length) x.alCambiar(carga.new); });
        });
        ch.subscribe(estado => alEstado(estado));
        return { cerrar(){ sb.removeChannel(ch); } };
      },
      async funcion(nombre, cuerpo){
        const r = await sb.functions.invoke(nombre, { body: cuerpo });
        if (r.error) {
          let detalle = null;
          try { detalle = await r.error.context.json(); } catch (_) { /* sin cuerpo */ }
          return detalle || { error: r.error.message || 'No se pudo contactar al servidor.' };
        }
        return r.data;
      }
    };
  }

  /* =========================================================
     8) OBJETO GLOBAL `firebase`
     ========================================================= */
  const apps = [];
  let principal = null;
  function initializeApp(config, nombre){
    if (nombre) {
      if (!principal) throw new Error('GLACIAL · inicializa primero la app principal.');
      const sec = { name: nombre, options: config, auth: () => sec._auth || (sec._auth = crearAuthSecundaria(principal._T)) };
      apps.push(sec);
      return sec;
    }
    if (principal) return principal;
    const T = global.__GLACIAL_TRANSPORTE__ ? global.__GLACIAL_TRANSPORTE__(config) : transporteSupabase(config);
    const db = crearBaseDeDatos(T);
    principal = { name: '[DEFAULT]', options: config, _T: T, _db: db, _auth: crearAuth(T, db), auth(){ return this._auth; }, firestore(){ return this._db; } };
    if (T.sb) global.glacialSupabaseCliente = T.sb;           // cliente de Supabase (sesión incluida): lo usa js/produccion/06b-fotos-supabase.js para Storage
    Object.assign(firestore, db._clases);                     // firebase.firestore.DocumentReference, .WriteBatch, .Transaction…
    apps.unshift(principal);
    return principal;
  }
  const exigir = () => { if (!principal) throw new Error('GLACIAL · firebase.initializeApp() aún no se llamó.'); return principal; };
  const firestore = () => exigir()._db;
  firestore.FieldValue = FieldValue;
  firestore.Timestamp = Timestamp;
  const auth = () => exigir()._auth;
  auth.Auth = { Persistence: { SESSION: 'session', LOCAL: 'local', NONE: 'none' } };
  const storage = () => ({ ref(){ throw new Error('GLACIAL · el almacenamiento de archivos de Firebase no se usa.'); } });

  global.firebase = { initializeApp, apps, app: () => exigir(), firestore, auth, storage, SDK_VERSION: 'puente-supabase-1' };
  /* Para las pruebas automáticas. */
  global.__GLACIAL_PUENTE__ = { aEnvio, aPagina, canon, claveDeLista, diferenciaDeLista, fijosCrecientes, Estado, construirOp, mezclar, resolver, Timestamp, FieldValue };
})(typeof window !== 'undefined' ? window : globalThis);
