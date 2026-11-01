// GLACIAL · control-proceso-drive
// Copia a Google Drive el «Control de proceso en el envasado» (CF - CA - F - 047): lee los reportes del mes de la línea, arma el formulario con las MISMAS reglas del Excel
// (nucleo.mjs, generado desde js/asistente/90-control-proceso-nucleo.js) y se lo envía al Apps Script del dueño del Drive (supabase/drive/apps-script/Codigo.gs).
// NO modifica producción, stock SAP ni tareo: solo LEE reportes y guarda el estado de la copia en public.control_proceso_sync.
//
//   POST  · modo automático: cabecera  x-glacial-sync: <SYNC_SECRETO>   (lo llama pg_cron cada 5 minutos)       cuerpo {} (opcional)
//   POST  · modo manual:     cabecera  Authorization: Bearer <sesión de un usuario con permiso ii_esc>             cuerpo { "forzar": true, "mes": "2026-10" } (opcional)
//   200 → { ok, resultados:[{ linea, mes, estado: sincronizado | omitido | sin_datos | error, … }] }
//
// Secretos (Supabase › Edge Functions › Secrets):  SYNC_SECRETO (mínimo 24)  ·  APPS_SCRIPT_URL  ·  APPS_SCRIPT_SECRETO (el GLACIAL_SECRETO del script; mínimo 24)
// Se despliega SIN verificación de JWT (el modo automático no tiene sesión): la protección es SYNC_SECRETO o, en modo manual, la sesión + el permiso ii_esc que comprueba la base.
//   supabase functions deploy control-proceso-drive --no-verify-jwt --project-ref <PRUEBAS | PRODUCCION>
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import P from './nucleo.mjs';
import { LOGO_BASE64 } from './logo.mjs';
import { mesesASincronizar, secretoValido, sincronizarMes } from './sync.mjs';

const LINEAS = ['B7L'];                                  // líneas con formulario conocido (ver LINEAS en el núcleo)
// Permisos de navegador (CORS): el botón «Sincronizar ahora» llama a la función desde la página. La protección real es la sesión + el permiso ii_esc, no el origen.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json', ...CORS } });

Deno.serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return responder({ ok: false, codigo: 'metodo', error: 'Método no permitido.' }, 405);
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

    // 1) ¿quién llama?
    let modo = '';
    const secretoRecibido = req.headers.get('x-glacial-sync') || '';
    if (secretoRecibido) {
      if (!(await secretoValido(secretoRecibido, Deno.env.get('SYNC_SECRETO') || ''))) return responder({ ok: false, codigo: 'secreto', error: 'Secreto no válido.' }, 401);
      modo = 'automatico';
    } else {
      const auth = req.headers.get('Authorization') || '';
      if (!auth.startsWith('Bearer ')) return responder({ ok: false, codigo: 'sin_sesion', error: 'Falta la sesión.' }, 401);
      const usuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
      const permiso = await usuario.rpc('control_proceso_puede');
      if (permiso.error || permiso.data !== true) return responder({ ok: false, codigo: 'permiso', error: 'Sin permiso para sincronizar con Drive.' }, 403);
      modo = 'manual';
    }

    // 2) configuración
    const appsUrl = Deno.env.get('APPS_SCRIPT_URL') || '', appsSecreto = Deno.env.get('APPS_SCRIPT_SECRETO') || '';
    if (!appsUrl || appsSecreto.length < 24) return responder({ ok: false, codigo: 'sin_configurar', error: 'Falta configurar APPS_SCRIPT_URL y APPS_SCRIPT_SECRETO.' }, 500);

    // 3) qué meses
    let cuerpo: { forzar?: boolean; mes?: string } = {};
    try { cuerpo = await req.json(); } catch (_) { /* sin cuerpo */ }
    const forzar = modo === 'manual' && cuerpo.forzar === true;
    let meses = mesesASincronizar(Date.now());
    const pedido = /^(\d{4})-(\d{2})$/.exec(String(cuerpo.mes || ''));
    if (modo === 'manual' && pedido && Number(pedido[2]) >= 1 && Number(pedido[2]) <= 12) meses = [{ anio: Number(pedido[1]), mes: Number(pedido[2]) }];

    const deps = {
      P,
      logo: LOGO_BASE64,
      appsUrl,
      appsSecreto,
      fetchImpl: fetch,
      ahora: () => Date.now(),
      leerRegistros: async (linea: string, mes: string) => {
        const r = await admin.from('fs_items').select('datos').eq('coleccion', 'sync').eq('doc', 'records').eq('campo', 'items').is('eliminado_en', null)
          .filter('datos->>linea', 'eq', linea).filter('datos->>fecha', 'like', `${mes}-%`).limit(2000);
        if (r.error) throw new Error(r.error.message);
        return (r.data || []).map((x: { datos: unknown }) => x.datos);
      },
      leerPrevio: async (linea: string, mes: string) => {
        const r = await admin.from('control_proceso_sync').select('hash, ok, intentos, intento_en').eq('linea', linea).eq('mes', mes).maybeSingle();
        return r.error ? null : r.data;
      },
      guardar: async (linea: string, mes: string, campos: Record<string, unknown>) => {
        await admin.from('control_proceso_sync').upsert({ linea, mes, ...campos }, { onConflict: 'linea,mes' });
      },
    };

    const resultados = [];
    for (const linea of LINEAS) for (const m of meses) resultados.push(await sincronizarMes(deps, { linea, anio: m.anio, mes: m.mes, forzar }));
    return responder({ ok: resultados.every((r) => r.ok), modo, resultados });
  } catch (_e) {
    return responder({ ok: false, codigo: 'interno', error: 'Error interno.' }, 500);
  }
});
