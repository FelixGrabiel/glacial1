/* Login con carrusel en un navegador de verdad. Uso: GLX_LIBS=/ruta node tests/login-carrusel.e2e.js (no forma parte de las pruebas rápidas). GLX_CAPTURAS=/carpeta guarda capturas. */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1440, 900); const P = D.page;
  await P.evaluate(() => { document.getElementById('app-screen').style.display = 'none'; const l = document.getElementById('login-screen'); l.style.display = 'flex'; });
  await P.waitForSelector('#login-carrusel .lg-slide.on');
  const est = () => P.evaluate(() => ({ n: document.querySelectorAll('.lg-slide').length, on: [...document.querySelectorAll('.lg-slide')].findIndex(s => s.classList.contains('on')), puntos: document.querySelectorAll('.lg-dots button').length, titulo: document.querySelector('.lg-slide.on h2').innerText }));
  let e = await est();
  ok(e.n === 4 && e.puntos === 4 && e.on === 0 && /CENTRO DE OPERACIONES/i.test(e.titulo), 'el carrusel tiene 4 diapositivas y empieza en «Centro de Operaciones»');
  await P.click('[data-lg="sig"]'); e = await est();
  ok(e.on === 1 && /PLANIFICACIÓN/i.test(e.titulo), 'la flecha siguiente pasa a la 2.ª diapositiva');
  await P.click('[data-lg="ant"]'); await P.click('[data-lg="ant"]'); e = await est();
  ok(e.on === 3, 'la flecha anterior da la vuelta a la última');
  await P.click('.lg-dots button:nth-child(3)'); e = await est();
  ok(e.on === 2, 'los puntos llevan a la diapositiva elegida');
  await P.focus('#login-user'); await P.keyboard.press('ArrowRight'); e = await est();
  ok(e.on === 2, 'las flechas del teclado no cambian la diapositiva mientras se escribe en un campo');
  await P.evaluate(() => document.activeElement.blur()); await P.mouse.move(5, 5); await P.keyboard.press('ArrowRight'); e = await est();
  ok(e.on === 3, 'la flecha → del teclado avanza fuera de los campos');
  const campos = await P.evaluate(() => ({ u: !!document.getElementById('login-user'), p: !!document.getElementById('login-pass'), err: !!document.getElementById('login-error'), btn: !!document.querySelector('.login-submit'), tog: !!document.getElementById('password-toggle'), tarjeta: !!document.querySelector('.login-panel .login-card'), logoTarjeta: getComputedStyle(document.querySelector('.login-logo-container')).display }));
  ok(campos.u && campos.p && campos.err && campos.btn && campos.tog && campos.tarjeta && campos.logoTarjeta === 'none', 'el formulario real sigue completo (usuario, contraseña, error, botón y ojo) dentro de la tarjeta');
  await P.evaluate(() => togglePassword());
  ok(await P.evaluate(() => document.getElementById('login-pass').type) === 'text', 'mostrar contraseña sigue funcionando');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/login-desktop.png' });
  // sin desborde horizontal ni solapes en celular
  await P.setViewportSize({ width: 390, height: 844 }); await P.waitForTimeout(300);
  const mov = await P.evaluate(() => ({ desborde: document.documentElement.scrollWidth > innerWidth, tarjetaAbajo: document.querySelector('.login-card').getBoundingClientRect().top >= document.querySelector('.login-showcase').getBoundingClientRect().bottom - 2 }));
  ok(!mov.desborde && mov.tarjetaAbajo, 'en celular no hay desborde y la tarjeta queda debajo del carrusel');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/login-movil.png', fullPage: true });
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar(); console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
