/* GLACIAL · service worker de la app instalable (16/11/2026)
   Existe para que GLACIAL se pueda INSTALAR como aplicación (Android, iPhone, PC) y para mostrar una pantalla clara cuando no hay internet.
   A propósito NO guarda nada en caché:
     · los datos son en tiempo real (Supabase) y deben verse iguales en todos los equipos;
     · el código se sigue pidiendo a la red como siempre, así que el aviso «HAY UNA ACTUALIZACIÓN NUEVA»
       (js/nucleo/03-actualizacion.js) y los «?v=» funcionan exactamente igual que antes.
   Solo interviene en una cosa: si al ABRIR la página no hay red, responde con la pantalla «Sin conexión», que reintenta sola.
   NOTIFICACIONES (24/11/2026): muestra las notificaciones de paradas de línea que manda el servidor (función avisos-push), aunque la app
   esté cerrada, y al tocarlas abre GLACIAL (o la trae al frente si ya estaba abierta). Ver docs/00-general/notificaciones.md.
   Debe estar en la raíz del sitio (junto a index.html) para cubrir toda la página. Lo registra js/nucleo/03c-app-instalable.js. */
'use strict';

const PAGINA_SIN_CONEXION = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#0877A6">
<title>GLACIAL · Sin conexión</title>
<style>
html,body{height:100%;margin:0}
body{display:flex;align-items:center;justify-content:center;background:#0877A6;color:#fff;font:500 17px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
main{max-width:420px}
h1{font-size:15px;letter-spacing:.18em;margin:0 0 18px;opacity:.85}
h2{font-size:26px;margin:0 0 10px}
p{margin:0 0 22px;opacity:.92}
button{min-height:48px;padding:0 26px;border:0;border-radius:12px;background:#fff;color:#075985;font:700 16px system-ui,sans-serif;cursor:pointer}
small{display:block;margin-top:16px;opacity:.8}
</style></head><body><main>
<h1>GLACIAL</h1>
<h2>Sin conexión a internet</h2>
<p>GLACIAL trabaja en tiempo real y necesita internet. Revisa el wifi o los datos del equipo.</p>
<button type="button" id="r">Reintentar</button>
<small id="e">Se volverá a abrir sola cuando regrese la conexión.</small>
</main><script>
(function(){
  function abrir(){ location.reload(); }
  function probar(){ fetch(location.href,{cache:'no-store'}).then(function(r){ if(r&&r.ok&&!r.headers.get('X-Glacial-Sin-Conexion')) abrir(); }).catch(function(){}); }
  document.getElementById('r').addEventListener('click',abrir);
  addEventListener('online',abrir);
  setInterval(probar,8000);
})();
</script></body></html>`;

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    // Por si una versión anterior guardó algo: este service worker no usa caché.
    try { const claves = await caches.keys(); await Promise.all(claves.filter(c => c.startsWith('glacial-')).map(c => caches.delete(c))); } catch (_) { /* sin Cache Storage */ }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (ev) => {
  const pedido = ev.request;
  if (pedido.mode !== 'navigate' || pedido.method !== 'GET') return;          // todo lo demás va directo a la red, sin tocar
  ev.respondWith((async () => {
    try { return await fetch(pedido); }
    catch (_) {
      return new Response(PAGINA_SIN_CONEXION, {
        status: 503, statusText: 'Sin conexion',
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Glacial-Sin-Conexion': '1' }
      });
    }
  })());
});

/* ---------- Notificaciones (24/11/2026) ---------- */
self.addEventListener('push', (ev) => {
  let d = {};
  try { d = (ev.data && ev.data.json()) || {}; } catch (_) { try { d = { cuerpo: ev.data ? ev.data.text() : '' }; } catch (__) { d = {}; } }
  const titulo = String(d.titulo || 'GLACIAL').slice(0, 120);
  ev.waitUntil(self.registration.showNotification(titulo, {
    body: String(d.cuerpo || 'Hay un aviso nuevo en el Centro de alertas.').slice(0, 300),
    tag: d.tag || 'glacial', renotify: true,                // una notificación por línea: la nueva reemplaza a la anterior y vuelve a sonar
    icon: 'assets/img/icono-192.png', badge: 'assets/img/icono-maskable-192.png',
    lang: 'es', data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  const url = (ev.notification.data && ev.notification.data.url) || './';
  ev.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const una = abiertas.find(c => c && typeof c.focus === 'function');
    if (una) return una.focus();
    return self.clients.openWindow(url);
  })());
});
