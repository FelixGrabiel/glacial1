/* Servidor simulado para probar el puente Firebase → Supabase sin conexión.
   Reproduce en memoria las funciones fs_leer / fs_cambios / fs_commit / fs_versiones / fs_consulta de la base de datos
   (migraciones glacial_20a…20h) y los avisos de tiempo real. Lo usan tests/puente-supabase.test.js y tests/puente-pagina.e2e.js. */
const clon = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const esObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/* ---------------- servidor simulado (misma lógica que las funciones SQL) ---------------- */
function resolverS(v, ms){
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(x => resolverS(x, ms));
  if (v.__fs === 'ts') return { __ts: ms };
  const o = {}; for (const k in v) { if (esObj(v[k]) && v[k].__fs === 'del') continue; o[k] = resolverS(v[k], ms); } return o;
}
function mezclarS(base, cambios, profundo, ms){
  const r = Object.assign({}, base || {});
  for (const k of Object.keys(cambios || {})) {
    const x = cambios[k];
    if (esObj(x) && x.__fs === 'del') delete r[k];
    else if (profundo && esObj(x) && x.__fs !== 'ts' && !('__ts' in x) && esObj(r[k]) && !('__ts' in r[k])) r[k] = mezclarS(r[k], x, true, ms);
    else r[k] = resolverS(x, ms);
  }
  return r;
}
function crearServidor(){
  const S = {
    docs: new Map(), items: new Map(), commits: new Map(), dispositivos: [], usuarios: new Map(), reloj: 1800000000000,
    registro: [],                    // operaciones recibidas (para comprobar que solo viaja lo que cambió)
    reglas: null,                    // (uid, accion, c, d) → boolean
    sinDatosSiNoCambian: false       // simula que Realtime no envía los datos grandes que no cambiaron
  };
  const kd = (c, d) => c + '\u0000' + d, ki = (c, d, campo, id) => [c, d, campo, id].join('\u0000');
  const raiz = c => c.split('/')[0];
  const itemsDe = (c, d, campo) => [...S.items.values()].filter(i => i.coleccion === c && i.doc === d && (campo === undefined || i.campo === campo) && !i.eliminado_en);
  const puede = (uid, accion, c, d) => !S.reglas || S.reglas(uid, accion, c, d);
  const err = (code, message) => ({ code, message });

  S.fs_leer = (uid, a) => {
    if (!puede(uid, 'leer', a.p_c, a.p_d)) throw err('42501', 'permission-denied: no puedes leer');
    const r = S.docs.get(kd(a.p_c, a.p_d));
    if (!r || r.eliminado_en) return { existe: false, version: r ? r.version : 0, ahora: ++S.reloj };
    const partes = {};
    r.partes.forEach(campo => { partes[campo] = itemsDe(a.p_c, a.p_d, campo).sort((x, y) => x.pos - y.pos || (x.id < y.id ? -1 : 1)).map(i => ({ id: i.id, pos: i.pos, datos: clon(i.datos) })); });
    return { existe: true, datos: clon(r.datos), version: r.version, partes, conteos: clon(r.conteos), ahora: ++S.reloj };
  };
  S.fs_cambios = (uid, a) => {
    if (!puede(uid, 'leer', a.p_c, a.p_d)) throw err('42501', 'permission-denied: no puedes leer');
    const r = S.docs.get(kd(a.p_c, a.p_d));
    if (!r || r.eliminado_en) return { existe: false, version: r ? r.version : 0, ahora: ++S.reloj };
    const items = [...S.items.values()].filter(i => i.coleccion === a.p_c && i.doc === a.p_d && i.v > (a.p_desde || 0))
      .map(i => i.eliminado_en ? { campo: i.campo, id: i.id, eliminado: true } : { campo: i.campo, id: i.id, pos: i.pos, datos: clon(i.datos) });
    return { existe: true, version: r.version, datos: clon(r.datos), partes: r.partes.slice(), conteos: clon(r.conteos), items, ahora: ++S.reloj };
  };
  S.fs_versiones = (uid, a) => (a.p_docs || []).map(x => { const r = S.docs.get(kd(x.c, x.d)); return { c: x.c, d: x.d, v: r && !r.eliminado_en && puede(uid, 'leer', x.c, x.d) ? r.version : 0 }; });
  const val = v => (esObj(v) && '__ts' in v) ? v.__ts : v;
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  S.fs_consulta = (uid, a) => {
    const campo = (o, ruta) => ruta.split('.').reduce((x, k) => (x === undefined || x === null ? undefined : x[k]), o);
    let filas = [...S.docs.values()].filter(r => r.coleccion === a.p_c && !r.eliminado_en && puede(uid, 'leer', r.coleccion, r.id));
    (a.p_filtros || []).forEach(f => { filas = filas.filter(r => { const x = val(campo(r.datos, f.campo)), y = val(f.valor); if (x === undefined) return false; const c = cmp(x, y); return f.op === '==' ? c === 0 : f.op === '<' ? c < 0 : f.op === '<=' ? c <= 0 : f.op === '>' ? c > 0 : c >= 0; }); });
    (a.p_orden || []).forEach(o => { filas = filas.filter(r => campo(r.datos, o.campo) !== undefined); });
    filas.sort((x, y) => { for (const o of (a.p_orden || [])) { const c = cmp(val(campo(x.datos, o.campo)), val(campo(y.datos, o.campo))); if (c) return o.dir === 'desc' ? -c : c; } return cmp(x.id, y.id); });
    if (a.p_limite) filas = filas.slice(0, a.p_limite);
    return { docs: filas.map(r => ({ id: r.id, datos: clon(r.datos), version: r.version })), ahora: ++S.reloj };
  };
  S.fs_commit = (uid, a) => {
    if (a.p_clave && S.commits.has(a.p_clave)) return Object.assign({ repetido: true }, clon(S.commits.get(a.p_clave)));
    const copiaDocs = new Map([...S.docs].map(([k, v]) => [k, clon(v)])), copiaItems = new Map([...S.items].map(([k, v]) => [k, clon(v)]));
    const eventos = [], res = [], ms = ++S.reloj;
    const avisoItem = (i, conDatos) => { const f = clon(i); if (S.sinDatosSiNoCambian && !conDatos) delete f.datos; eventos.push({ tabla: 'fs_items', fila: f }); };
    const avisoDoc = (r, conDatos) => { const f = clon(r); if (S.sinDatosSiNoCambian && !conDatos) delete f.datos; eventos.push({ tabla: 'fs_docs', fila: f }); };
    const baja = (i, prox) => { i.eliminado_en = 'x'; i.v = prox; avisoItem(i, false); };
    try {
      (a.p_lecturas || []).forEach(l => { const r = S.docs.get(kd(l.c, l.d)); const v = r && !r.eliminado_en ? r.version : 0; if (v !== (l.v || 0)) throw err('40001', 'fs-conflicto: ' + l.c + '/' + l.d); });
      if (!Array.isArray(a.p_ops) || !a.p_ops.length) throw err('P0001', 'fs: sin operaciones');
      for (const op of a.p_ops) {
        const c = op.c, d = op.d; let r = S.docs.get(kd(c, d));
        const existe = !!r && !r.eliminado_en, viejo = existe ? r.datos : null, previas = existe ? r.partes.slice() : [];
        const prox = r ? r.version + 1 : 1; let toc = 0;
        if (op.t === 'delete') {
          if (!puede(uid, 'delete', c, d)) throw err('42501', 'permission-denied: no puedes borrar');
          if (existe) { const li = itemsDe(c, d); li.forEach(i => baja(i, prox)); Object.assign(r, { eliminado_en: 'x', version: prox, conteos: {}, partes: [], tocados: li.length }); avisoDoc(r, false); res.push({ c, d, v: 0, vr: prox, conteos: {} }); }
          continue;
        }
        const entrada = op.datos || {}; let nuevo, partes;
        if (op.t === 'update') { if (!existe) throw err('P0002', 'not-found: no existe'); nuevo = mezclarS(viejo, entrada, false, ms); partes = previas.slice(); }
        else if (op.merge) { nuevo = mezclarS(viejo || {}, entrada, true, ms); partes = previas.slice(); }
        else { nuevo = mezclarS({}, entrada, false, ms); partes = []; }
        if (!r) { r = { coleccion: c, id: d, raiz: raiz(c), datos: {}, partes: [], conteos: {}, version: 0, eliminado_en: null, tocados: 0 }; S.docs.set(kd(c, d), r); avisoDoc(r, true); }
        for (const campo of Object.keys(op.partes || {})) {
          const p = op.partes[campo];
          (p.del || []).forEach(id => { const i = S.items.get(ki(c, d, campo, String(id))); if (i && !i.eliminado_en) { baja(i, prox); toc++; } });
          if (p.todo) { const quedan = new Set((p.up || []).map(x => String(x.id))); itemsDe(c, d, campo).forEach(i => { if (!quedan.has(i.id)) { baja(i, prox); toc++; } }); }
          (p.up || []).forEach(x => {
            if (!esObj(x.datos) || typeof x.pos !== 'number') throw err('P0001', 'fs: elemento inválido');
            const k = ki(c, d, campo, String(x.id)), antes = S.items.get(k), datos = resolverS(x.datos, ms);
            const cambio = !antes || JSON.stringify(antes.datos) !== JSON.stringify(datos);
            const i = { coleccion: c, doc: d, campo, id: String(x.id), raiz: raiz(c), pos: x.pos, datos, eliminado_en: null, v: prox };
            S.items.set(k, i); avisoItem(i, cambio); toc++;
          });
          if (!partes.includes(campo)) partes.push(campo);
          delete nuevo[campo];
        }
        previas.forEach(campo => {
          if (!partes.includes(campo) || (op.quitar || []).includes(campo) || (campo in entrada && !(op.partes && campo in op.partes))) {
            itemsDe(c, d, campo).forEach(i => { baja(i, prox); toc++; });
            partes = partes.filter(x => x !== campo);
          }
        });
        const conteos = {}; partes.forEach(campo => { conteos[campo] = itemsDe(c, d, campo).length; });
        if (!puede(uid, existe ? 'update' : 'create', c, d)) throw err('42501', 'permission-denied: no puedes guardar');
        const cambioDatos = JSON.stringify(r.datos) !== JSON.stringify(nuevo) || !existe;
        Object.assign(r, { datos: nuevo, partes, conteos, eliminado_en: null, version: prox, tocados: toc });
        avisoDoc(r, cambioDatos);
        res.push({ c, d, v: prox, conteos: clon(conteos) });
      }
    } catch (e) { S.docs = copiaDocs; S.items = copiaItems; throw e; }
    const salida = { ahora: ms, docs: res };
    if (a.p_clave) S.commits.set(a.p_clave, clon(salida));
    S.registro.push(clon(a.p_ops));
    S.dispositivos.forEach(D => D._recibir(eventos));
    return salida;
  };
  /* Estado real del servidor, armado como lo ve la página. */
  S.documento = (c, d) => {
    const r = S.docs.get(kd(c, d)); if (!r || r.eliminado_en) return undefined;
    const o = clon(r.datos);
    r.partes.forEach(campo => { o[campo] = itemsDe(c, d, campo).sort((x, y) => x.pos - y.pos || (x.id < y.id ? -1 : 1)).map(i => clon(i.datos)); });
    return o;
  };
  return S;
}


module.exports = { crearServidor, clon, esObj };
