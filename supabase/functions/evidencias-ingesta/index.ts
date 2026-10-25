// GLACIAL · evidencias-ingesta
// Recibe la foto de una etiqueta (WhatsApp) y la lectura de la IA desde el bot de la planta y las deja en la «bandeja de entrada»
// (tabla public.evidencias_entrada + bucket privado glacial-fotos). NO modifica stock ni inventario: una persona autorizada importa y valida
// cada evidencia desde Asistente de Producción › Evidencias.
//
//   POST   cabecera  x-glacial-ingesta: <secreto>      cuerpo  { sha256, mime, foto_base64, registro, leyenda? }
//   200 → { ok: true, estado: 'recibida' | 'duplicada' }      4xx/5xx → { ok: false, codigo, error }
//
// El bot NO lleva ninguna llave de Supabase: solo este secreto (que solo sirve para esta función). La función usa su propia llave de servicio.
// Se despliega SIN verificación de JWT porque el bot no tiene sesión:  supabase functions deploy evidencias-ingesta --no-verify-jwt
// Secretos (Supabase › Edge Functions › Secrets):  INGESTA_SECRETO (mínimo 24 caracteres)  ·  INGESTA_MAX_DIA (opcional, por defecto 200)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { rutaFoto, validarSolicitud } from './nucleo.mjs';

const BUCKET = 'glacial-fotos';
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  try {
    const v = await validarSolicitud({
      metodo: req.method,
      secretoRecibido: req.headers.get('x-glacial-ingesta') || '',
      secretoEsperado: Deno.env.get('INGESTA_SECRETO') || '',
      cuerpoTexto: req.method === 'POST' ? await req.text() : '',
    });
    if (!v.ok) return responder({ ok: false, codigo: v.codigo, error: v.error }, v.estado);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

    // ¿Ya está? (el mismo archivo no se duplica ni se vuelve a subir)
    const previa = await admin.from('evidencias_entrada').select('sha256').eq('sha256', v.sha256).maybeSingle();
    if (previa.error) return responder({ ok: false, codigo: 'base', error: 'No se pudo consultar la bandeja de entrada.' }, 500);
    if (previa.data) return responder({ ok: true, estado: 'duplicada' });

    // Tope diario de recepciones (protege la bandeja si alguien consigue el secreto o el bot se descontrola)
    const maxDia = Math.max(1, Number(Deno.env.get('INGESTA_MAX_DIA')) || 200);
    const desde = new Date(); desde.setUTCHours(0, 0, 0, 0);
    const hoy = await admin.from('evidencias_entrada').select('sha256', { count: 'exact', head: true }).gte('recibido_en', desde.toISOString());
    if (hoy.error) return responder({ ok: false, codigo: 'base', error: 'No se pudo consultar la bandeja de entrada.' }, 500);
    if ((hoy.count ?? 0) >= maxDia) return responder({ ok: false, codigo: 'tope_diario', error: `Se alcanzó el tope de ${maxDia} recepciones por día.` }, 429);

    // 1) la foto primero (si ya existía con la misma huella, es la misma foto); 2) la fila, para que nunca apunte a una foto que falta
    const ruta = rutaFoto(v.sha256, v.ext);
    const subida = await admin.storage.from(BUCKET).upload(ruta, v.bytes, { contentType: v.mime, upsert: false });
    if (subida.error && !/exist|duplicate|409/i.test(String(subida.error.message))) {
      return responder({ ok: false, codigo: 'foto', error: 'No se pudo guardar la foto.' }, 502);
    }
    const fila = await admin.from('evidencias_entrada').upsert(
      { sha256: v.sha256, registro: v.registro, foto_ruta: ruta, mime: v.mime, bytes: v.bytes.length, origen: 'bot', ...(v.leyenda ? { leyenda: v.leyenda } : {}) },       // la columna la agrega glacial_34: sin leyenda la fila se guarda igual que antes
      { onConflict: 'sha256', ignoreDuplicates: true },
    );
    if (fila.error) return responder({ ok: false, codigo: 'base', error: 'No se pudo guardar la evidencia.' }, 502);
    return responder({ ok: true, estado: 'recibida' });
  } catch (_e) {
    return responder({ ok: false, codigo: 'interno', error: 'Error interno.' }, 500);
  }
});
