/* GLACIAL · copia de los datos de Firebase a Supabase (ensayo del 11-10-2026: 3 026 documentos, 4 MB, 91 s, huellas iguales).
   Se ejecuta en la página de PRODUCCIÓN actual (la de Firebase), con la sesión del Administrador abierta.
   SOLO LEE de Firebase: no modifica nada allí. Cada documento viaja directo del navegador a Supabase, a una «sala de
   espera» (glacial_fs.importacion), protegido con una clave de un solo uso; después se revisa y se aplica en Supabase
   con glacial_fs.aplicar_importacion(...). Deja el avance en window.__progreso (solo conteos, tamaños y huellas).

   Antes:   insertar la huella de la clave en glacial_priv.migracion_claves y dar permiso de ejecución a «anon»
            sobre public.fs_migracion_recibir.  Después: quitar ese permiso y anular la clave.
   Uso:     copiarFirebaseASupabase({ url: 'https://<proyecto>.supabase.co', apikey: '<clave pública>', clave: '<clave de un solo uso>' })  */
async function copiarFirebaseASupabase(o){
  const DOCS_SYNC = ['users', 'workers', 'perfiles', 'accesos', 'cuentasAntiguas', 'rotaciones', 'rotacionesMantenimiento', 'rotacionMaquinistas',
    'tareos', 'programaciones', 'paletas', 'avancesTurno', 'records', 'tecnicosMant', 'configMantenimiento', 'configTareo', 'configAlertas',
    'configIndicadores', 'catalogoPlanificacion', 'borradoresNuevoRegistro', 'precios'].concat(o.docsSyncExtra || []);
  const COLECCIONES = ['avancesTurnoItems', 'bitacoraMantenimiento', 'resumenesTurno', 'distribucionPersonal', 'historialProgramacion',
    'solicitudesProgramacion', 'solicitudesCorreccionTareo', 'auditoriaTareos', 'incidenciasNoProduccion', 'valoresUnitarios',
    'valoresUnitariosHistorial', 'resultadosEconomicos'].concat(o.coleccionesExtra || []);
  const DOCS_SUELTOS = [['configEconomica', 'margenes'], ['configEconomica', 'costos'], ['configEconomica', 'general']];   // esa colección no se puede listar
  /* Valores de Firestore → JSON: las fechas (Timestamp) viajan como {"__ts": milisegundos}. */
  const conv = v => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'object') return v;
    if (typeof v.toMillis === 'function') return { __ts: v.toMillis() };
    if (v instanceof Date) return { __ts: v.getTime() };
    if (Array.isArray(v)) return v.map(conv);
    if (typeof v.path === 'string' && v.firestore) return { __ref: v.path };
    const r = {}; for (const k of Object.keys(v)) r[k] = conv(v[k]); return r;
  };
  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  const huella = async t => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
  const P = window.__progreso = { fase: 'leyendo', leidos: 0, enviados: 0, bytes: 0, porColeccion: {}, sinPermiso: [], inexistentes: [], errores: [], inicio: Date.now() };
  const cola = [];
  const denegado = e => e && (e.code === 'permission-denied' || /insufficient permissions/i.test(String(e.message)));
  const agregar = (c, d, datos) => { cola.push({ c, d, texto: JSON.stringify(conv(datos)) }); P.leidos++; };
  for (const d of DOCS_SYNC) {
    try { const s = await db.collection('sync').doc(d).get({ source: 'server' }); if (!s.exists) P.inexistentes.push('sync/' + d); else agregar('sync', d, s.data()); }
    catch (e) { (denegado(e) ? P.sinPermiso : P.errores).push('sync/' + d); }
  }
  for (const [c, d] of DOCS_SUELTOS) {
    try { const s = await db.collection(c).doc(d).get({ source: 'server' }); if (!s.exists) P.inexistentes.push(c + '/' + d); else agregar(c, d, s.data()); }
    catch (e) { (denegado(e) ? P.sinPermiso : P.errores).push(c + '/' + d); }
  }
  for (const c of COLECCIONES) {
    try {
      const q = await db.collection(c).get({ source: 'server' });
      for (const s of q.docs) {
        agregar(c, s.id, s.data());
        if (c === 'distribucionPersonal') { const qs = await s.ref.collection('eventos').get({ source: 'server' }); qs.docs.forEach(x => agregar(c + '/' + s.id + '/eventos', x.id, x.data())); }
      }
    } catch (e) { (denegado(e) ? P.sinPermiso : P.errores).push(c + (denegado(e) ? '' : ': ' + e.message)); }
  }
  P.fase = 'enviando'; P.total = cola.length;
  const huellas = []; let i = 0;
  const trabajador = async () => {
    while (i < cola.length) {
      const x = cola[i++]; const h = await huella(x.texto), bytes = new TextEncoder().encode(x.texto).length;
      let ultima = null;
      for (let intento = 0; intento < 5; intento++) {
        try {
          const resp = await fetch(o.url + '/rest/v1/rpc/fs_migracion_recibir', { method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: o.apikey, Authorization: 'Bearer ' + o.apikey },
            body: JSON.stringify({ p_clave: o.clave, p_c: x.c, p_d: x.d, p_texto: x.texto }) });
          const cuerpo = await resp.json().catch(() => null);
          if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + ((cuerpo && (cuerpo.message || cuerpo.code)) || ''));
          if (cuerpo !== h) throw new Error('la huella no coincide');
          ultima = null; break;
        } catch (e) { ultima = e; await new Promise(r => setTimeout(r, 700 * (intento + 1))); }
      }
      if (ultima) { if (P.errores.length < 20) P.errores.push(x.c + '/' + x.d.slice(0, 40) + ': ' + ultima.message); continue; }
      const raiz = x.c.split('/')[0], p = P.porColeccion[raiz] || (P.porColeccion[raiz] = { documentos: 0, bytes: 0 });
      P.enviados++; P.bytes += bytes; p.documentos++; p.bytes += bytes;
      huellas.push(x.c + '/' + x.d + '=' + h);
    }
  };
  await Promise.all(Array.from({ length: 8 }, trabajador));
  /* Debe coincidir con: sha256 de las líneas «c/d=huella» de glacial_fs.importacion ordenadas (collate "C"). */
  P.huellaGeneral = await huella(huellas.sort().join('\n'));
  P.fase = 'terminado'; P.segundos = Math.round((Date.now() - P.inicio) / 1000);
  return P;
}
