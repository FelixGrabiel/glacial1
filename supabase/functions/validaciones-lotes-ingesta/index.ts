// GLACIAL · validaciones-lotes-ingesta
// Recibe del bot de la planta (WhatsApp) el resultado de la validación de un lote y lo deja en public.validaciones_lotes.
// Si el bot manda la foto del rótulo (foto_base64) se guarda en el bucket privado glacial-fotos (calidad/rotulos/). NO modifica stock, lotes ni evidencias:
// se ve en Calidad › Validación de lotes y una persona autorizada puede marcarlo como revisado.
//
//   POST   cabecera  x-glacial-validaciones: <secreto>      cuerpo  { clave, lote, resultado, insumo?, proveedor?, linea?, motivo?, controles?, datos?, evidencia_sha256?, validada_en?, foto_base64?, foto_mime? }
//   200 → { ok: true, estado: 'recibida' | 'duplicada' }      4xx/5xx → { ok: false, codigo, error }
//
// El bot NO lleva ninguna llave de Supabase: solo este secreto (que solo sirve para esta función). La función usa su propia llave de servicio.
// Se despliega SIN verificación de JWT porque el bot no tiene sesión:  supabase functions deploy validaciones-lotes-ingesta --no-verify-jwt
// Secretos (Supabase › Edge Functions › Secrets):  VALIDACIONES_SECRETO (mínimo 24 caracteres, distinto del de evidencias)  ·  VALIDACIONES_MAX_DIA (opcional, por defecto 300)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { validarSolicitud } from './nucleo.mjs';

const BUCKET = 'glacial-fotos';
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  try {
    const v = await validarSolicitud({
      metodo: req.method,
      secretoRecibido: req.headers.get('x-glacial-validaciones') || '',
      secretoEsperado: Deno.env.get('VALIDACIONES_SECRETO') || '',
      cuerpoTexto: req.method === 'POST' ? await req.text() : '',
    });
    if (!v.ok) return responder({ ok: false, codigo: v.codigo, error: v.error }, v.estado);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

    const previa = await admin.from('validaciones_lotes').select('clave').eq('clave', v.fila.clave).maybeSingle();
    if (previa.error) return responder({ ok: false, codigo: 'base', error: 'No se pudo consultar las validaciones.' }, 500);
    if (previa.data) return responder({ ok: true, estado: 'duplicada' });

    // Tope diario (protege la tabla si alguien consigue el secreto o el bot se descontrola)
    const maxDia = Math.max(1, Number(Deno.env.get('VALIDACIONES_MAX_DIA')) || 300);
    const desde = new Date(); desde.setUTCHours(0, 0, 0, 0);
    const hoy = await admin.from('validaciones_lotes').select('clave', { count: 'exact', head: true }).gte('recibido_en', desde.toISOString());
    if (hoy.error) return responder({ ok: false, codigo: 'base', error: 'No se pudo consultar las validaciones.' }, 500);
    if ((hoy.count ?? 0) >= maxDia) return responder({ ok: false, codigo: 'tope_diario', error: `Se alcanzó el tope de ${maxDia} validaciones por día.` }, 429);

    // La foto primero (si ya existía con la misma huella es la misma foto); la fila después, para que nunca apunte a una foto que falta.
    if (v.foto) {
      const subida = await admin.storage.from(BUCKET).upload(v.foto.ruta, v.foto.bytes, { contentType: v.foto.mime, upsert: false });
      if (subida.error && !/exist|duplicate|409/i.test(String(subida.error.message))) return responder({ ok: false, codigo: 'foto', error: 'No se pudo guardar la foto.' }, 502);
    }
    const fila = await admin.from('validaciones_lotes').upsert(v.fila, { onConflict: 'clave', ignoreDuplicates: true });
    if (fila.error) return responder({ ok: false, codigo: 'base', error: 'No se pudo guardar la validación.' }, 502);
    return responder({ ok: true, estado: 'recibida' });
  } catch (_e) {
    return responder({ ok: false, codigo: 'interno', error: 'Error interno.' }, 500);
  }
});
