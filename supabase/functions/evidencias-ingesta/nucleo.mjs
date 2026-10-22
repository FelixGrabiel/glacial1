// GLACIAL · evidencias-ingesta · NÚCLEO PURO (sin red ni base de datos): valida lo que envía el bot de WhatsApp.
// Se importa desde index.ts (Deno) y se prueba con node (tests/evidencias-ingesta.test.js).
//
// El bot manda: { sha256, mime, foto_base64, registro }  con la cabecera  x-glacial-ingesta: <secreto>.
//  · registro = el «-revisado.json» que dejó el validador (lectura de la IA + procedencia por campo).
//  · Nada de esto toca stock: solo deja la foto y la lectura en una «bandeja de entrada» que una persona autorizada importa y valida.

export const MAX_FOTO = 6 * 1024 * 1024;            // las fotos de WhatsApp pesan ~100-300 KB; 6 MB es un tope holgado
export const MAX_REGISTRO = 200_000;                // caracteres del JSON de la lectura
export const MAX_CUERPO = Math.ceil(MAX_FOTO / 3) * 4 + MAX_REGISTRO + 4_096;
export const MIN_SECRETO = 24;
export const MIMES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

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

export function firmaValida(bytes, mime) {
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => bytes[i] === v);
  if (mime === 'image/webp') {
    const t = (i, s) => [...s].every((c, k) => bytes[i + k] === c.charCodeAt(0));
    return bytes.length >= 12 && t(0, 'RIFF') && t(8, 'WEBP');
  }
  return false;
}

function base64ABytes(b64) {
  if (typeof b64 !== 'string' || b64.length === 0 || b64.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch (_) { return null; }
}

const falla = (estado, codigo, error) => ({ ok: false, estado, codigo, error });

/**
 * metodo, secretoRecibido, secretoEsperado, cuerpoTexto → { ok:true, sha256, mime, ext, bytes, registro } | { ok:false, estado, codigo, error }
 * Orden de las comprobaciones: método, secreto (antes de leer nada del cuerpo), tamaño, JSON, huella y firma de la foto, lectura.
 */
export async function validarSolicitud({ metodo, secretoRecibido, secretoEsperado, cuerpoTexto }) {
  if (metodo !== 'POST') return falla(405, 'metodo', 'Método no permitido.');
  if (typeof secretoEsperado !== 'string' || secretoEsperado.length < MIN_SECRETO) return falla(500, 'sin_configurar', 'El servicio no está configurado (falta el secreto).');
  if (!(await secretoValido(secretoRecibido, secretoEsperado))) return falla(401, 'secreto', 'Secreto no válido.');
  if (typeof cuerpoTexto !== 'string' || cuerpoTexto.length === 0) return falla(400, 'cuerpo', 'Falta el cuerpo de la solicitud.');
  if (cuerpoTexto.length > MAX_CUERPO) return falla(413, 'demasiado_grande', 'La solicitud es demasiado grande.');
  let c;
  try { c = JSON.parse(cuerpoTexto); } catch (_) { return falla(400, 'json', 'El cuerpo no es un JSON válido.'); }
  if (!c || typeof c !== 'object' || Array.isArray(c)) return falla(400, 'json', 'El cuerpo no es un objeto JSON.');

  const sha256 = String(c.sha256 || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) return falla(400, 'sha256', 'Falta la huella SHA-256 de la foto.');
  const mime = String(c.mime || '').toLowerCase();
  const ext = MIMES[mime];
  if (!ext) return falla(400, 'mime', 'Solo se admiten fotos JPG, PNG o WebP.');
  const bytes = base64ABytes(c.foto_base64);
  if (!bytes) return falla(400, 'foto', 'La foto no es un base64 válido.');
  if (bytes.length < 8 || bytes.length > MAX_FOTO) return falla(413, 'foto_tamano', 'La foto debe pesar entre 8 bytes y 6 MB.');
  if (!firmaValida(bytes, mime)) return falla(400, 'formato_invalido', 'El contenido no coincide con el tipo de imagen.');
  if ((await sha256Hex(bytes)) !== sha256) return falla(400, 'hash_no_coincide', 'La huella SHA-256 no corresponde a la foto enviada.');

  const registro = c.registro;
  if (!registro || typeof registro !== 'object' || Array.isArray(registro)) return falla(400, 'registro', 'Falta el resultado de la lectura (registro).');
  if (!registro.extraccion || typeof registro.extraccion !== 'object' || Array.isArray(registro.extraccion)) return falla(400, 'registro', 'El resultado no trae «extraccion».');
  if (registro.sha256 && String(registro.sha256).toLowerCase() !== sha256) return falla(400, 'registro_otra_foto', 'El resultado pertenece a otra foto (huella distinta).');
  if (JSON.stringify(registro).length > MAX_REGISTRO) return falla(413, 'registro_tamano', 'El resultado de la lectura es demasiado grande.');
  return { ok: true, sha256, mime, ext, bytes, registro };
}

/** Ruta privada de la foto: la misma carpeta que ya autorizan las reglas de storage (glacial_25). */
export const rutaFoto = (sha256, ext) => `asistente/evidencias/${sha256}.${ext}`;
