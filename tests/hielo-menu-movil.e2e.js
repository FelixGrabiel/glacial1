/* Hielo · menú en el teléfono: botón ☰ y menú lateral (como el de Agua). Uso: GLX_LIBS=/ruta node tests/hielo-menu-movil.e2e.js. GLX_CAPTURAS=/carpeta guarda capturas. */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const abrirHielo = async (P) => { await P.evaluate(() => { document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block'; state.user = { rol: 'Administrador', nombre: 'Ana', username: 'ana', permisos: 'todos' }; state.showWelcome = false; goReporteHielo(); }); await P.waitForSelector('.hl-app', { timeout: 6000 }); };
(async () => {
  const H = await iniciar();
  // ---- teléfono ----
  const M = await H.abrir(390, 800); const P = M.page; await abrirHielo(P);
  const est = () => P.evaluate(() => { const s = document.getElementById('hl-menu'), r = s.getBoundingClientRect(), cs = getComputedStyle(s); return { visible: cs.visibility !== 'hidden' && r.right > 10, left: Math.round(r.left), ancho: Math.round(r.width), exp: document.querySelector('.hl-hamb').getAttribute('aria-expanded'), fondo: getComputedStyle(document.querySelector('.hl-fondo')).display }; });
  const top = await P.evaluate(() => { const t = document.querySelector('.hl-top'); return { vis: getComputedStyle(t).display !== 'none', txt: t.innerText.replace(/\s+/g, ' '), alto: Math.round(t.getBoundingClientRect().height) }; });
  ok(top.vis && /GLACIAL · HIELO/.test(top.txt) && /Inicio/.test(top.txt) && top.alto < 70, 'en el teléfono hay una barra compacta con ☰, «GLACIAL · HIELO» y la sección actual (' + top.txt + ')');
  let e = await est();
  ok(!e.visible && e.fondo === 'none' && e.exp === 'false', 'el menú empieza cerrado: ya no ocupa la parte de arriba con todos los botones en fila');
  const noScrollX = await P.evaluate(() => document.getElementById('hielo-screen').scrollWidth <= document.getElementById('hielo-screen').clientWidth + 1);
  ok(noScrollX, 'la pantalla no se desborda hacia el costado');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/hielo-movil-cerrado.png' });
  await P.click('.hl-hamb'); await P.waitForTimeout(400);
  e = await est();
  ok(e.visible && e.left === 0 && e.ancho <= 336 && e.exp === 'true' && e.fondo === 'block', 'al tocar ☰ se abre el menú lateral con fondo oscuro (ancho ' + e.ancho + ' px)');
  const items = await P.evaluate(() => [...document.querySelectorAll('#hl-menu button')].map(b => b.innerText.trim()));
  ok(items.join('|') === 'Inicio|Nuevo registro|Avance y cierre|Historial|Programación|Configuración|Volver a Reporte Agua', 'el menú tiene todas las secciones y «Volver a Reporte Agua» en columna (' + items.length + ')');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/hielo-movil-abierto.png' });
  await P.keyboard.press('Escape'); await P.waitForTimeout(350);
  ok(!(await est()).visible, 'Escape cierra el menú');
  await P.click('.hl-hamb'); await P.waitForTimeout(300);
  await P.mouse.click(370, 400); await P.waitForTimeout(350);
  ok(!(await est()).visible, 'tocar el fondo oscuro cierra el menú');
  await P.click('.hl-hamb'); await P.waitForTimeout(300);
  await P.click('#hl-menu button:nth-child(4)'); await P.waitForTimeout(400);   // 1.º es la marca (div), así que el 4.º botón = Avance y cierre
  const tras = await P.evaluate(() => ({ vista: document.querySelector('.hl-top-t small').innerText, cerrado: getComputedStyle(document.getElementById('hl-menu')).visibility === 'hidden' }));
  ok(/Avance y cierre|Historial|Nuevo registro/.test(tras.vista) && tras.cerrado, 'al elegir una sección el menú se cierra y la barra muestra la sección (' + tras.vista + ')');
  await P.click('.hl-hamb'); await P.waitForTimeout(300);
  await P.evaluate(() => document.querySelector('#hl-menu button:last-child').click()); await P.waitForTimeout(300);
  ok(await P.evaluate(() => document.getElementById('hielo-screen').style.display === 'none' && !document.getElementById('hielo-screen').classList.contains('hl-menu-abierto')), '«Volver a Reporte Agua» sale de Hielo y deja el menú cerrado');
  ok(M.errores.length === 0, 'sin errores de consola (teléfono)' + (M.errores.length ? ' → ' + M.errores.slice(0, 3).join(' | ') : ''));
  // ---- escritorio: sin cambios ----
  const D = await H.abrir(1400, 900); const Q = D.page; await abrirHielo(Q);
  const esc = await Q.evaluate(() => ({ top: getComputedStyle(document.querySelector('.hl-top')).display, fondo: getComputedStyle(document.querySelector('.hl-fondo')).display, lado: Math.round(document.getElementById('hl-menu').getBoundingClientRect().width) }));
  ok(esc.top === 'none' && esc.fondo === 'none' && esc.lado === 240, 'en escritorio no cambia: menú lateral fijo de 240 px, sin barra ☰');
  ok(D.errores.length === 0, 'sin errores de consola (escritorio)');
  await H.cerrar(); console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
