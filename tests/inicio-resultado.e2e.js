/* Inicio ejecutivo · «Resultado de la planta» y orden de secciones. Uso: GLX_LIBS=/ruta node tests/inicio-resultado.e2e.js (no forma parte de las pruebas rápidas). GLX_CAPTURAS=/carpeta guarda capturas. */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1400, 950); const P = D.page;
  await P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    document.documentElement.style.overflow = 'auto'; document.body.style.overflow = 'auto'; document.body.style.height = 'auto';
    state.user = { rol: 'Administrador', nombre: 'Ana', username: 'admin', permisos: 'todos' }; state.showWelcome = false;
    glacialHieloDatos.escuchar = () => {};
    state.currentTab = 'centro-perfil'; renderMain();
  });
  await P.waitForSelector('.cp-shell', { timeout: 8000 });
  const orden = await P.evaluate(() => {
    const t = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().top + scrollY : -1; };
    return { agua: t('.cp-pt-agua'), res: t('.cp-pt-res'), hielo: t('#cp-hielo-slot') >= 0 ? t('#cp-hielo-slot') : t('.cp-pt-hielo'), det: t('.cp-pt-det'), alertas: document.querySelectorAll('.cp-ex-alerts').length, tarjetas: document.querySelectorAll('#cp-resultado .rs-card').length };
  });
  ok(orden.agua >= 0 && orden.res > orden.agua && orden.det > orden.res, 'orden: Agua → Resultado de la planta → Detalle del turno (' + JSON.stringify(orden) + ')');
  ok(orden.tarjetas >= 2 && orden.alertas === 0, 'hay al menos las 2 tarjetas de producción y merma y ya no hay «Alertas importantes»');
  const txt = await P.evaluate(() => document.getElementById('cp-resultado').innerText.replace(/\s+/g, ' '));
  ok(/Producción contra la meta/i.test(txt) && /Merma y pérdidas/i.test(txt), 'las tarjetas se llaman «Producción contra la meta» y «Merma y pérdidas» → ' + txt.slice(0, 140));
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/inicio-resultado.png', fullPage: true });
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar(); console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
