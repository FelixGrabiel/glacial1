// GLACIAL · validaciones-lotes-ingesta · NÚCLEO PURO (sin red ni base de datos): valida lo que envía el bot de WhatsApp.
// Se importa desde index.ts (Deno) y se prueba con node (tests/validacion-lotes.test.js).
//
// El bot manda un JSON con la cabecera  x-glacial-validaciones: <secreto>:
//   { clave, lote, resultado: 'OK'|'OBSERVADO'|'RECHAZADO', insumo?, proveedor?, linea?, motivo?, controles?: [{nombre, resultado: 'OK'|'FALLA'|'NA', detalle?}],
//     datos?: {…}, evidencia_sha256?, validada_en? (ISO 8601) }
// Nada de esto toca stock ni lotes: solo deja el registro en la tabla public.validaciones_lotes, que se ve en Asistente › Validación de lotes.

export const MAX_CUERPO = 64_000;
export const MIN_SECRETO = 24;
export const RESULTADOS = ['OK', 'OBSERVADO', 'RECHAZADO'];
export const RESULTADOS_CONTROL = ['OK', 'FALLA', 'NA'];

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const sha256Hex = async (bytes) => hex(await crypto.subtle.digest('SHA-256', bytes));

/** Comparación del secreto en tiempo constante (se comparan las huellas, que tienen el mismo largo). */
export async function secretoValido(recibido, esperado) {
  if (typeof recibido !== 'string' || typeof esperado !== 'string' || esperado.length < MIN_SECRETO) return false;
  const [a, b] = await Promise.all([sha256Hex(enc.encode(recibido)), sha256Hex(enc.encode(esperado))]);
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const falla = (estado, codigo, error) => ({ ok: false, estado, codigo, error });
const limpio = (v, max) => {
  if (v === undefined || v === null) return null;
  const t = String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return t === '' ? null : t;
};

/**
 * metodo, secretoRecibido, secretoEsperado, cuerpoTexto, ahora(ms, opcional) → { ok:true, fila } | { ok:false, estado, codigo, error }
 * Orden: método, secreto (antes de leer el cuerpo), tamaño, JSON y campos.
 */
export async function validarSolicitud({ metodo, secretoRecibido, secretoEsperado, cuerpoTexto, ahora }) {
  if (metodo !== 'POST') return falla(405, 'metodo', 'Método no permitido.');
  if (typeof secretoEsperado !== 'string' || secretoEsperado.length < MIN_SECRETO) return falla(500, 'sin_configurar', 'El servicio no está configurado (falta el secreto).');
  if (!(await secretoValido(secretoRecibido, secretoEsperado))) return falla(401, 'secreto', 'Secreto no válido.');
  if (typeof cuerpoTexto !== 'string' || cuerpoTexto.length === 0) return falla(400, 'cuerpo', 'Falta el cuerpo de la solicitud.');
  if (cuerpoTexto.length > MAX_CUERPO) return falla(413, 'demasiado_grande', 'La solicitud es demasiado grande.');
  let c;
  try { c = JSON.parse(cuerpoTexto); } catch (_) { return falla(400, 'json', 'El cuerpo no es un JSON válido.'); }
  if (!c || typeof c !== 'object' || Array.isArray(c)) return falla(400, 'json', 'El cuerpo no es un objeto JSON.');

  const clave = String(c.clave || '').trim();
  if (!/^[A-Za-z0-9._:@-]{8,128}$/.test(clave)) return falla(400, 'clave', 'La clave debe tener de 8 a 128 caracteres (letras, números y . _ : @ -). Sirve para no duplicar la validación.');
  const lote = limpio(c.lote, 60);
  if (!lote) return falla(400, 'lote', 'Falta el lote.');
  const resultado = String(c.resultado || '').toUpperCase().trim();
  if (!RESULTADOS.includes(resultado)) return falla(400, 'resultado', 'El resultado debe ser OK, OBSERVADO o RECHAZADO.');

  let controles = [];
  if (c.controles !== undefined && c.controles !== null) {
    if (!Array.isArray(c.controles) || c.controles.length > 40) return falla(400, 'controles', 'Los controles deben ser una lista de hasta 40.');
    for (const x of c.controles) {
      if (!x || typeof x !== 'object' || Array.isArray(x)) return falla(400, 'controles', 'Cada control debe ser un objeto {nombre, resultado, detalle?}.');
      const nombre = limpio(x.nombre, 80);
      const r = String(x.resultado || '').toUpperCase().trim();
      if (!nombre || !RESULTADOS_CONTROL.includes(r)) return falla(400, 'controles', 'Cada control necesita nombre y resultado OK, FALLA o NA.');
      controles.push({ nombre, resultado: r, detalle: limpio(x.detalle, 200) });
    }
  }
  let datos = {};
  if (c.datos !== undefined && c.datos !== null) {
    if (typeof c.datos !== 'object' || Array.isArray(c.datos)) return falla(400, 'datos', '«datos» debe ser un objeto.');
    if (JSON.stringify(c.datos).length > 20_000) return falla(413, 'datos_tamano', '«datos» es demasiado grande.');
    datos = c.datos;
  }
  const evidencia = c.evidencia_sha256 === undefined || c.evidencia_sha256 === null || c.evidencia_sha256 === '' ? null : String(c.evidencia_sha256).toLowerCase();
  if (evidencia !== null && !/^[a-f0-9]{64}$/.test(evidencia)) return falla(400, 'evidencia', 'La huella de la evidencia debe ser un SHA-256 en hexadecimal.');

  // Fecha de la validación: la que manda el bot si es razonable (no del futuro ni de hace más de 400 días); si no, la de recepción.
  const t = typeof ahora === 'number' ? ahora : Date.now();
  let validada = new Date(t).toISOString();
  if (c.validada_en !== undefined && c.validada_en !== null && c.validada_en !== '') {
    const m = Date.parse(String(c.validada_en));
    if (!Number.isFinite(m)) return falla(400, 'validada_en', 'La fecha de validación no es válida (usa ISO 8601).');
    if (m > t + 10 * 60_000 || m < t - 400 * 86_400_000) return falla(400, 'validada_en', 'La fecha de validación está fuera de rango.');
    validada = new Date(m).toISOString();
  }
  return {
    ok: true,
    fila: {
      clave, lote, resultado, insumo: limpio(c.insumo, 120), proveedor: limpio(c.proveedor, 120), linea: limpio(c.linea, 20),
      motivo: limpio(c.motivo, 500), controles, datos, evidencia_sha256: evidencia, origen: 'bot', validada_en: validada,
    },
  };
}
