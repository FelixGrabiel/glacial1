// GLACIAL · fs-cuentas
// Crea cuentas de acceso para el personal sin cerrar la sesión del Administrador.
// Solo responde a un Administrador de GLACIAL (lo comprueba la base de datos con fs_es_admin()).
//   { accion: 'crear',  email, clave }           → { uid }
//   { accion: 'perfil', uid, displayName }        → { ok: true }   (marca de contraseña temporal «TEMP»)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const DOMINIO = '@glacial.app';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const autorizacion = req.headers.get('Authorization') || '';
    if (!autorizacion.toLowerCase().startsWith('bearer ')) return responder({ error: 'Falta la sesión.', codigo: 'permission-denied' }, 401);

    // 1) Quien llama debe ser Administrador: se pregunta a la base de datos con SU propia sesión.
    const comoUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: autorizacion } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: esAdmin, error: errAdmin } = await comoUsuario.rpc('fs_es_admin');
    if (errAdmin) return responder({ error: 'No se pudo comprobar el permiso.', codigo: 'permission-denied' }, 403);
    if (esAdmin !== true) return responder({ error: 'Solo el Administrador puede gestionar cuentas.', codigo: 'permission-denied' }, 403);

    const cuerpo = await req.json().catch(() => ({}));
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

    if (cuerpo.accion === 'crear') {
      const email = String(cuerpo.email || '').trim().toLowerCase();
      const clave = String(cuerpo.clave || '');
      if (!/^[a-z0-9._-]{1,60}@glacial\.app$/.test(email)) return responder({ error: 'Correo interno inválido (debe terminar en ' + DOMINIO + ').', codigo: 'auth/invalid-email' }, 400);
      if (clave.length < 6) return responder({ error: 'La contraseña debe tener al menos 6 caracteres.', codigo: 'auth/weak-password' }, 400);
      const { data, error } = await admin.auth.admin.createUser({ email, password: clave, email_confirm: true });
      if (error) {
        const m = String(error.message || '');
        if (/already|registered|exists/i.test(m)) return responder({ error: 'Ese correo interno ya tiene una cuenta.', codigo: 'auth/email-already-in-use' }, 409);
        if (/password/i.test(m)) return responder({ error: m, codigo: 'auth/weak-password' }, 400);
        return responder({ error: m || 'No se pudo crear la cuenta.', codigo: 'auth/internal-error' }, 400);
      }
      return responder({ uid: data.user!.id });
    }

    if (cuerpo.accion === 'perfil') {
      const uid = String(cuerpo.uid || '');
      if (!/^[0-9a-f-]{36}$/i.test(uid)) return responder({ error: 'Cuenta inválida.', codigo: 'auth/invalid-argument' }, 400);
      const { data: cuenta, error: errCuenta } = await admin.auth.admin.getUserById(uid);
      if (errCuenta || !cuenta?.user) return responder({ error: 'La cuenta no existe.', codigo: 'auth/user-not-found' }, 404);
      if (!String(cuenta.user.email || '').toLowerCase().endsWith(DOMINIO)) return responder({ error: 'Esa cuenta no se gestiona desde la página.', codigo: 'permission-denied' }, 403);
      const { error } = await admin.auth.admin.updateUserById(uid, { user_metadata: { ...(cuenta.user.user_metadata || {}), display_name: String(cuerpo.displayName || '') } });
      if (error) return responder({ error: error.message || 'No se pudo actualizar la cuenta.', codigo: 'auth/internal-error' }, 400);
      return responder({ ok: true });
    }

    return responder({ error: 'Acción desconocida.', codigo: 'auth/invalid-argument' }, 400);
  } catch (e) {
    return responder({ error: String((e as Error)?.message || e), codigo: 'auth/internal-error' }, 500);
  }
});
