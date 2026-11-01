// GLACIAL · control-proceso-drive · LÓGICA PURA (sin red ni base de datos: se prueba con node en tests/control-proceso-drive-funcion.test.js)
// Orquesta la copia del «Control de proceso en el envasado» a Google Sheets: qué meses sincronizar, cuándo reintentar, el cuerpo que recibe el Apps Script
// (supabase/drive/apps-script/Codigo.gs) y cómo se interpreta su respuesta. NO modifica producción, stock SAP ni tareo: solo lee reportes.

export const MIN_SECRETO = 24;
export const MAX_FILAS = 3000;
export const ESPERA_MAX_MIN = 60;
export const TIMEOUT_MS = 60_000;

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const sha256Hex = async (texto) => hex(await crypto.subtle.digest('SHA-256', enc.encode(texto)));

/** Comparación de secretos en tiempo constante (se comparan huellas del mismo largo). */
export async function secretoValido(recibido, esperado) {
  if (typeof recibido !== 'string' || typeof esperado !== 'string' || esperado.length < MIN_SECRETO) return false;
  const [a, b] = await Promise.all([sha256Hex(recibido), sha256Hex(esperado)]);
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const mm = (n) => String(n).padStart(2, '0');
/** Año y mes (hora de Lima, UTC-5) de un instante. */
export function mesLima(ahoraMs) {
  const d = new Date(Number(ahoraMs) - 5 * 3600_000);
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}
/** Meses a sincronizar: el actual y, durante los primeros días del mes, el anterior (los reportes del último turno pueden corregirse). */
export function mesesASincronizar(ahoraMs, diasDeGracia = 3) {
  const { anio, mes, dia } = mesLima(ahoraMs);
  const out = [{ anio, mes }];
  if (dia <= diasDeGracia) out.push(mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 });
  return out;
}
export const claveMes = ({ anio, mes }) => `${anio}-${mm(mes)}`;

/** Huella del contenido que se escribe en Drive: si no cambió desde la última vez no se llama a Google. */
export async function huellaModelo(modelo) {
  const hojas = modelo.hojas.map((h) => ({ n: h.nombre, m: h.marca, p: h.presentacion, f: h.filas }));
  return sha256Hex(JSON.stringify({ a: modelo.archivo, hojas }));
}

/** Espera antes de reintentar tras un fallo: 5, 10, 20, 40, 60… minutos. */
export const esperaMinutos = (intentos) => Math.min(ESPERA_MAX_MIN, 5 * 2 ** Math.max(0, Number(intentos) - 1));

/**
 * previo: fila de control_proceso_sync ({hash, ok, intentos, intento_en}) o null; hash: huella actual; forzar: «Sincronizar ahora».
 * Devuelve {accion:'sincronizar'|'omitir', motivo}.
 */
export function decidir(previo, hash, ahoraMs, { forzar = false } = {}) {
  if (forzar) return { accion: 'sincronizar', motivo: 'forzado' };
  if (!previo) return { accion: 'sincronizar', motivo: 'primera_vez' };
  if (previo.ok && previo.hash === hash) return { accion: 'omitir', motivo: 'sin_cambios' };
  if (!previo.ok && previo.intento_en) {
    const falta = esperaMinutos(previo.intentos) * 60_000 - (ahoraMs - Date.parse(previo.intento_en));
    if (falta > 0 && previo.hash === hash) return { accion: 'omitir', motivo: 'espera', segundos: Math.ceil(falta / 1000) };
  }
  return { accion: 'sincronizar', motivo: previo.ok ? 'cambio' : 'reintento' };
}

/** Cuerpo para el Apps Script. */
export function payloadDeModelo(modelo, { secreto, formulario, logo }) {
  return {
    secreto,
    libro: { nombre: modelo.archivo.replace(/\.xlsx$/i, '') },
    formulario,
    logo: logo || '',
    hojas: modelo.hojas.map((h) => ({ nombre: h.nombre, marca: h.marca, presentacion: h.presentacion, filas: h.filas.map((f) => ({
      clave: f.clave, lotePT: f.lotePT, preforma: f.preforma, tapa: f.tapa, etiqueta: f.etiqueta, asa: f.asa,
      soplado: f.soplado, envasado: f.envasado, empaquetado: f.empaquetado, fecha: f.fecha, turno: f.turno,
    })) })),
  };
}

/** Errores de la llamada al Apps Script como mensajes cortos y sin datos sensibles. */
export function mensajeError(e) {
  const m = String((e && e.message) || e || 'error');
  if (/abort|timeout/i.test(m)) return 'Google tardó demasiado en responder.';
  return m.replace(/https?:\/\/\S+/g, '[dirección]').slice(0, 300);
}

/**
 * Llama al Apps Script (aplicación web). fetchImpl: fetch (inyectable para probar). Devuelve {ok:true, libro, hojas} | {ok:false, error, definitivo}.
 * Un error de configuración (clave, carpeta, formato) es «definitivo»: reintentar igual no lo arregla, así que se espera más.
 */
export async function llamarAppsScript(fetchImpl, url, payload, timeoutMs = TIMEOUT_MS) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(String(url || ''))) return { ok: false, error: 'La dirección del Apps Script no es válida.', definitivo: true };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow', signal: ctl.signal });
    const texto = await r.text();
    let j;
    try { j = JSON.parse(texto); } catch (_) { return { ok: false, error: `Respuesta no válida de Google (HTTP ${r.status}).`, definitivo: r.status >= 400 && r.status < 500 }; }
    if (j && j.ok === true && j.libro) return { ok: true, libro: j.libro, hojas: Array.isArray(j.hojas) ? j.hojas : [] };
    const def = ['secreto', 'sin_configurar', 'formato', 'hoja_ajena'].includes(j && j.codigo);
    return { ok: false, error: String((j && j.error) || 'Google rechazó la solicitud.').slice(0, 300), codigo: j && j.codigo, definitivo: def };
  } catch (e) {
    return { ok: false, error: mensajeError(e), definitivo: false };
  } finally {
    clearTimeout(t);
  }
}

export const FORMULARIO = { titulo: 'CONTROL DE PORCESO EN EL ENVASADO', codigo: 'CF - CA - F - 047' };

/**
 * Sincroniza UN mes de UNA línea. deps (todo inyectable para probar sin red):
 *   P (núcleo 90), leerRegistros(linea, 'AAAA-MM') → reportes, leerPrevio(linea, 'AAAA-MM') → fila de control_proceso_sync | null,
 *   guardar(linea, 'AAAA-MM', campos), fetchImpl, appsUrl, appsSecreto, logo, ahora() → ms.
 * Devuelve {ok, linea, mes, estado:'sincronizado'|'omitido'|'sin_datos'|'error', ...}. Nunca lanza por un fallo de Google: lo deja registrado para reintentar.
 */
export async function sincronizarMes(deps, { linea, anio, mes, forzar = false }) {
  const clave = claveMes({ anio, mes }), base = { linea, mes: clave };
  let registros;
  try { registros = await deps.leerRegistros(linea, clave); } catch (e) { return { ...base, ok: false, estado: 'error', error: 'No se pudieron leer los reportes: ' + mensajeError(e) }; }
  const modelo = deps.P.modeloMes(registros, { linea, anio, mes });
  if (modelo.error) return { ...base, ok: false, estado: 'error', error: modelo.error };
  if (!modelo.total) return { ...base, ok: true, estado: 'sin_datos' };
  if (modelo.total > MAX_FILAS) return { ...base, ok: false, estado: 'error', error: `Demasiadas filas (${modelo.total}).` };
  const hash = await huellaModelo(modelo), ahora = deps.ahora();
  const previo = await deps.leerPrevio(linea, clave);
  const d = decidir(previo, hash, ahora, { forzar });
  if (d.accion === 'omitir') return { ...base, ok: true, estado: 'omitido', motivo: d.motivo, filas: modelo.total, ...(d.segundos ? { segundos: d.segundos } : {}) };
  const r = await llamarAppsScript(deps.fetchImpl, deps.appsUrl, payloadDeModelo(modelo, { secreto: deps.appsSecreto, formulario: FORMULARIO, logo: deps.logo }));
  const marca = new Date(ahora).toISOString();
  if (r.ok) {
    await deps.guardar(linea, clave, { hash, ok: true, intentos: 0, error: null, libro_url: r.libro.url || null, libro_id: r.libro.id || null, sincronizado_en: marca, intento_en: marca, filas: modelo.total });
    return { ...base, ok: true, estado: 'sincronizado', motivo: d.motivo, filas: modelo.total, hojas: modelo.hojas.length, libro: r.libro, detalle: r.hojas };
  }
  const intentos = (previo && previo.intentos ? Number(previo.intentos) : 0) + (r.definitivo ? 3 : 1);   // un error de configuración espera más: reintentar igual no lo arregla
  await deps.guardar(linea, clave, { hash, ok: false, intentos, error: r.error, intento_en: marca });
  return { ...base, ok: false, estado: 'error', error: r.error, filas: modelo.total };
}
