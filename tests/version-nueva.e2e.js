/* 12d-version-nueva.js en el navegador real: si se publica una versión nueva (cambia un ?v= en index.html), el bot (navegador automatizado)
   recarga solo —salvo mientras arma un Avance/Cierre— y una persona ve el aviso «Recargar». Uso: GLX_LIBS=/ruta node tests/version-nueva.e2e.js */
'use strict';
const fs = require('fs'), path = require('path');
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const HTML = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const NUEVO = HTML.replace(/29-avance-produccion\.js\?v=[^"]+/, '29-avance-produccion.js?v=20991231-x');
(async () => {
  const H = await iniciar();
  const B = await H.abrir(1200, 900), P = B.page;
  let publicado = HTML;
  await P.route(/index\.html\?vchk=/, r => r.fulfill({ contentType: 'text/html', body: publicado }));
  const marcar = () => P.evaluate(() => { window.__sinRecargar = 1; });
  const sigue = () => P.evaluate(() => window.__sinRecargar === 1);
  await marcar();
  ok(await P.evaluate(() => navigator.webdriver === true) && !(await P.evaluate(() => glacialVersionNueva.revisar())) && await sigue(), 'sin versión nueva: el bot no recarga');
  publicado = NUEVO;
  await P.evaluate(() => { window.__glxBotUltimoUso = Date.now(); });
  await P.evaluate(() => glacialVersionNueva.revisar()); await P.waitForTimeout(800);
  ok(await sigue(), 'versión nueva pero el bot está armando un Avance/Cierre: espera, no recarga a la mitad');
  await P.evaluate(() => { window.__glxBotUltimoUso = Date.now() - 4 * 60 * 1000; });
  await Promise.all([P.waitForNavigation({ timeout: 15000 }), P.evaluate(() => glacialVersionNueva.revisar())]);
  ok(!(await P.evaluate(() => window.__sinRecargar === 1)) && await P.evaluate(() => typeof glacialVersionNueva === 'object'), 'versión nueva y el bot libre: la página se recarga sola con el código nuevo');
  // persona (no automatizado): aviso, sin recargar
  const C = await H.abrir(390, 844), Q = C.page;
  await Q.route(/index\.html\?vchk=/, r => r.fulfill({ contentType: 'text/html', body: NUEVO }));
  await Q.evaluate(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); window.__sinRecargar = 1; });
  await Q.evaluate(() => glacialVersionNueva.revisar()); await Q.waitForTimeout(500);
  const av = await Q.evaluate(() => { const d = document.getElementById('glx-version-nueva'); return d && { t: d.innerText, r: d.getBoundingClientRect().right <= innerWidth }; });
  ok(av && /versión nueva/.test(av.t) && /Recargar/.test(av.t) && av.r && await Q.evaluate(() => window.__sinRecargar === 1), 'persona: aviso «Hay una versión nueva de GLACIAL · Recargar» (no se recarga sola), cabe en el celular');
  await Q.evaluate(() => glacialVersionNueva.revisar());
  ok(await Q.evaluate(() => document.querySelectorAll('#glx-version-nueva').length === 1), 'el aviso no se repite');
  ok(!B.errores.length && !C.errores.length, 'sin errores en las páginas' + (B.errores.concat(C.errores).length ? ': ' + B.errores.concat(C.errores).slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
