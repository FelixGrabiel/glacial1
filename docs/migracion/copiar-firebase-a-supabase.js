/* GLACIAL · copia de los datos de Firebase a Supabase (se usa una sola vez, el día del cambio, y antes en un ensayo).
   Se ejecuta en la página de PRODUCCIÓN actual (la de Firebase), con la sesión del Administrador abierta.
   SOLO LEE de Firebase: no modifica nada allí. Cada documento viaja directo del navegador a Supabase, a una «sala de
   espera» (glacial_fs.importacion), protegido con una clave de un solo uso; después se revisa y se aplica en Supabase.
   Devuelve únicamente conteos, tamaños y huellas (nunca el contenido).

   Uso:  await copiarFirebaseASupabase({ url: 'https://<proyecto>.supabase.co', apikey: '<clave pública>', clave: '<clave de un solo uso>' })
         await copiarFirebaseASupabase({ soloContar: true })     // ensayo: lee y mide, no envía nada                                   */
async function copiarFirebaseASupabase(opciones){
  const o = opciones || {};
  const DOCS_SYNC = ['users', 'workers', 'perfiles', 'accesos', 'cuentasAntiguas', 'rotaciones', 'rotacionesMantenimiento', 'rotacionMaquinistas',
    'tareos', 'programaciones', 'paletas', 'avancesTurno', 'records', 'tecnicosMant', 'configMantenimiento', 'configTareo', 'configAlertas',
    'configIndicadores', 'catalogoPlanificacion', 'borradoresNuevoRegistro', 'precios'].concat(o.docsSyncExtra || []);
  const COLECCIONES = ['avancesTurnoItems', 'bitacoraMantenimiento', 'resumenesTurno', 'distribucionPersonal', 'historialProgramacion',
    'solicitudesProgramacion', 'solicitudesCorreccionTareo', 'auditoriaTareos', 'incidenciasNoProduccion', 'configEconomica',
    'valoresUnitarios', 'valoresUnitariosHistorial', 'resultadosEconomicos'].concat(o.coleccionesExtra || []);
  const SUBCOLECCIONES = { distribucionPersonal: ['eventos'] };

  /* Valores de Firestore → JSON: las fechas (Timestamp) viajan como {"__ts": milisegundos}. */
  const conv = v => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'object') return v;
    if (typeof v.toMillis === 'function') return { __ts: v.toMillis() };
    if (v instanceof Date) return { __ts: v.getTime() };
    if (Array.isArray(v)) return v.map(conv);
    if (typeof v.path === 'string' && v.firestore) return { __ref: v.path };
    if (typeof v.latitude === 'number' && typeof v.longitude === 'number' && Object.keys(v).length <= 2) return { lat: v.latitude, lng: v.longitude };
    const r = {}; for (const k of Object.keys(v)) r[k] = conv(v[k]); return r;
  };
  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  const huella = async t => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
  const resumen = { inicio: new Date().toISOString(), enviados: 0, bytes: 0, porColeccion: {}, sinPermiso: [], inexistentes: [], errores: [], huellas: {} };
  const anotar = (c, bytes) => { const p = resumen.porColeccion[c] || (resumen.porColeccion[c] = { documentos: 0, bytes: 0 }); p.documentos++; p.bytes += bytes; };

  async function enviar(c, d, datos){
    const texto = JSON.stringify(conv(datos));
    const h = await huella(texto), bytes = new TextEncoder().encode(texto).length;
    if (!o.soloContar) {
      let ultima = null;
      for (let intento = 0; intento < 4; intento++) {
        try {
          const resp = await fetch(o.url + '/rest/v1/rpc/fs_migracion_recibir', { method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: o.apikey, Authorization: 'Bearer ' + o.apikey },
            body: JSON.stringify({ p_clave: o.clave, p_c: c, p_d: d, p_texto: texto }) });
          const cuerpo = await resp.json().catch(() => null);
          if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + ((cuerpo && cuerpo.message) || ''));
          if (cuerpo !== h) throw new Error('la huella no coincide');
          ultima = null; break;
        } catch (e) { ultima = e; await new Promise(r => setTimeout(r, 800 * (intento + 1))); }
      }
      if (ultima) { resumen.errores.push(c + '/' + d + ': ' + ultima.message); return; }
    }
    resumen.enviados++; resumen.bytes += bytes; anotar(c, bytes); resumen.huellas[c + '/' + d] = h.slice(0, 16);
  }
  const denegado = e => e && (e.code === 'permission-denied' || /insufficient permissions/i.test(String(e.message)));

  for (const d of DOCS_SYNC) {
    try {
      const s = await db.collection('sync').doc(d).get({ source: 'server' });
      if (!s.exists) { resumen.inexistentes.push('sync/' + d); continue; }
      await enviar('sync', d, s.data());
    } catch (e) { (denegado(e) ? resumen.sinPermiso : resumen.errores).push('sync/' + d + (denegado(e) ? '' : ': ' + e.message)); }
  }
  for (const c of COLECCIONES) {
    try {
      const q = await db.collection(c).get({ source: 'server' });
      for (const s of q.docs) {
        await enviar(c, s.id, s.data());
        for (const sub of (SUBCOLECCIONES[c] || [])) {
          const qs = await s.ref.collection(sub).get({ source: 'server' });
          for (const x of qs.docs) await enviar(c + '/' + s.id + '/' + sub, x.id, x.data());
        }
      }
      if (!q.size) resumen.porColeccion[c] = resumen.porColeccion[c] || { documentos: 0, bytes: 0 };
    } catch (e) { (denegado(e) ? resumen.sinPermiso : resumen.errores).push(c + (denegado(e) ? '' : ': ' + e.message)); }
  }
  resumen.fin = new Date().toISOString();
  resumen.huellaGeneral = await huella(Object.keys(resumen.huellas).sort().map(k => k + '=' + resumen.huellas[k]).join('\n'));
  if (!o.conHuellas) delete resumen.huellas;
  return resumen;
}
