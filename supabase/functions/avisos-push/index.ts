// GLACIAL · función avisos-push · NOTIFICACIONES DE PARADAS DE LÍNEA (24/11/2026)
// La llama pg_cron cada minuto (public.push_disparar, migración glacial_68) con la cabecera x-glacial-push = clave del Vault.
// 1) Comprueba la clave · 2) lee todo en una sola llamada (push_datos) · 3) decide qué avisar y a quién con logica.js
//    (mismas reglas que el Centro de alertas: pausas.js e indicadores.js son COPIAS GENERADAS de la página)
// 4) marca los avisos nuevos (push_marcar: nunca se repite uno) · 5) envía Web Push · 6) borra los equipos dados de baja (404/410).
// Las claves VAPID se generan aquí la primera vez y se guardan en el Vault: no pasan por ninguna persona.
// Prueba manual (misma clave): POST {"prueba": true} → manda «Prueba de GLACIAL» a todos los equipos suscritos.
// Desplegar con verify_jwt = false (se protege con la clave). Ver docs/00-general/notificaciones.md.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { calcularEnvios } from './logica.js';
import { cargar as cargarPausas } from './pausas.js';
import { cargar as cargarIndicadores } from './indicadores.js';

const P = cargarPausas(), GI = cargarIndicadores();
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SUJETO = 'https://felixgrabiel.github.io/glacial1/';

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = (t: string) => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4)), c => c.charCodeAt(0));

async function clavesVapid(): Promise<{ publica: string; privada: string }> {
  const r = await sb.rpc('push_vapid');
  if (r.data && r.data.publica && r.data.privada) return r.data;
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
  const pub = new Uint8Array([4, ...deB64u(jwk.x!), ...deB64u(jwk.y!)]);
  await sb.rpc('push_vapid_guardar', { p_publica: b64u(pub), p_privada: jwk.d! });
  const otra = await sb.rpc('push_vapid');                       // si dos llamadas coincidieron, gana la que se guardó primero
  if (!otra.data || !otra.data.publica) throw new Error('No se pudieron guardar las claves VAPID');
  return otra.data;
}

type Sus = { endpoint: string; uid: string; p256dh: string; auth: string };
async function enviar(lista: { s: Sus; carga: unknown }[]) {
  const ok: string[] = [], quitar: string[] = [], fallos: string[] = [];
  await Promise.all(lista.map(async ({ s, carga }) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(carga), { TTL: 900, urgency: 'high' });
      ok.push(s.endpoint);
    } catch (e) {
      const st = (e as { statusCode?: number }).statusCode;
      if (st === 404 || st === 410) quitar.push(s.endpoint);
      else fallos.push(String(st || (e as Error).message || e));
    }
  }));
  if (ok.length || quitar.length) await sb.rpc('push_resultado', { p_ok: ok, p_quitar: quitar });
  return { enviados: ok.length, quitados: quitar.length, fallos };
}

Deno.serve(async (req) => {
  try {
    const v = await sb.rpc('push_verificar', { p_token: req.headers.get('x-glacial-push') || '' });
    if (v.error || v.data !== true) return json({ error: 'no autorizado' }, 401);
    const vapid = await clavesVapid();
    webpush.setVapidDetails(SUJETO, vapid.publica, vapid.privada);
    const d = await sb.rpc('push_datos');
    if (d.error) return json({ error: d.error.message }, 500);
    const datos = d.data;
    const subs = new Map<string, Sus>((datos.suscripciones || []).map((s: Sus) => [s.endpoint, s]));
    let cuerpo: { prueba?: boolean } = {};
    try { cuerpo = await req.json(); } catch (_) { cuerpo = {}; }

    if (cuerpo && cuerpo.prueba === true) {
      const r = await enviar([...subs.values()].map(s => ({ s, carga: { titulo: 'Prueba de GLACIAL', cuerpo: 'Si ves esto, los avisos de paradas llegan a este equipo.', tag: 'glacial-prueba', url: './' } })));
      return json({ prueba: true, equipos: subs.size, ...r });
    }

    const { avisos, envios } = calcularEnvios(datos, { P, GI });
    if (!envios.length) return json({ avisos: avisos.length, enviados: 0 });
    const m = await sb.rpc('push_marcar', { p_claves: [...new Set(envios.map(e => e.aviso.clave))] });
    if (m.error) return json({ error: m.error.message }, 500);
    const nuevas = new Set<string>(m.data || []);
    const lista = envios.filter(e => nuevas.has(e.aviso.clave) && subs.has(e.endpoint)).map(e => ({
      s: subs.get(e.endpoint)!, carga: { titulo: e.aviso.titulo, cuerpo: e.aviso.cuerpo, tag: e.aviso.tag, url: e.aviso.url }
    }));
    const r = await enviar(lista);
    return json({ avisos: avisos.length, nuevos: nuevas.size, ...r });
  } catch (e) {
    console.error('avisos-push', e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
