/* Inicio de Producción ordenado (67-produccion-inicio.js) en el navegador real: «Tu turno, paso a paso» con la línea elegida, grupo «Paradas»
   (Paradas del turno y Cierre por marca, NUEVO), menú con «Paradas del turno» y «Entrega de turno», pasos que abren la pantalla correcta,
   celular sin desborde. Uso: GLX_LIBS=/ruta node tests/produccion-inicio.e2e.js  (GLX_CAPTURAS=/carpeta guarda capturas) */
'use strict';
const path = require('path');
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const entrar = (P, usuario) => P.evaluate(u => {
  document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
  state.user = u; state.showWelcome = false; window._recordsReady = true; window.alert = () => {}; window.confirm = () => true;
  goProduccionInicio();
}, usuario);
(async () => {
  const H = await iniciar();
  const D = await H.abrir(1300, 1000), P = D.page;
  await entrar(P, { rol: 'Administrador', nombre: 'Admin', username: 'admin', permisos: 'todos' });
  await P.waitForSelector('#pi-inicio', { timeout: 6000 });
  const v = await P.evaluate(() => ({
    pasos: [...document.querySelectorAll('#pi-pasos .pi-paso b')].map(b => b.textContent),
    nuevos: [...document.querySelectorAll('#pi-pasos .pi-paso.nuevo b')].map(b => b.textContent),
    chips: document.querySelectorAll('#pi-pasos .pi-chip').length, on: (document.querySelector('#pi-pasos .pi-chip.on') || {}).textContent,
    secs: [...document.querySelectorAll('#pi-inicio .mi-sec')].map(h => h.textContent),
    paradas: [...document.querySelectorAll('#pi-inicio .mi-grid')][0] ? [...[...document.querySelectorAll('#pi-inicio .mi-grid')][0].querySelectorAll('.mi-tit')].map(t => t.textContent) : [],
    menu: [...document.querySelectorAll('#sidebar-panel-produccion > .side-action')].filter(b => getComputedStyle(b).display !== 'none').map(b => b.textContent.trim())
  }));
  ok(v.pasos.join('|') === 'Nuevo registro|Paletas|+ Parada|Cerrar marca|Avance y cierre|Entrega de turno', '«Tu turno, paso a paso»: ' + v.pasos.join(' → '));
  ok(v.nuevos.join('|') === '+ Parada|Cerrar marca', '«+ Parada» y «Cerrar marca» marcados como NUEVO');
  ok(v.chips >= 2 && v.on, 'se elige la línea con botones (marcada: ' + v.on + ')');
  ok(v.secs.join('|') === 'Paradas|Cierre del turno|Personal y configuración', 'grupos en el orden del turno: ' + v.secs.join(', '));
  ok(/Paradas del turnoNUEVO/.test(v.paradas.join('|')) && /Cierre por marcaNUEVO/.test(v.paradas.join('|')) && v.paradas.some(t => /Bitácora/.test(t)) && v.paradas.some(t => /Análisis de paradas/.test(t)), 'grupo Paradas: ' + v.paradas.join(' · '));
  ok(v.menu.join('|') === 'Inicio de Producción|Avance y cierre|Paradas del turno|Entrega de turno|Convocatoria semanal', 'menú: ' + v.menu.join(' · '));
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: path.join(process.env.GLX_CAPTURAS, 'inicio-produccion-pc.png'), fullPage: true });

  // elegir otra línea y abrir «Cerrar marca» → Paletas de esa línea, en el panel de cierre
  const otra = await P.evaluate(() => { const b = [...document.querySelectorAll('#pi-pasos .pi-chip')].find(x => !x.classList.contains('on')); b.click(); return b.getAttribute('data-pi-linea'); });
  ok(await P.evaluate(k => (document.querySelector('#pi-pasos .pi-chip.on') || {}).getAttribute('data-pi-linea') === k, otra), 'al tocar otra línea, queda marcada (' + otra + ')');
  await P.click('#pi-pasos [data-pi-paso="4"]');
  await P.waitForTimeout(400);
  ok(await P.evaluate(k => state.currentTab === 'paletas' && state.currentLine === k, otra), '«Cerrar marca» abre Paletas de la línea elegida');
  // Paradas del turno (menú) → Avance y cierre
  await P.evaluate(() => goParadasTurno());
  await P.waitForTimeout(300);
  ok(await P.evaluate(() => state.currentTab === 'avance-produccion'), '«Paradas del turno» abre Avance y cierre (baja a su tarjeta)');
  // paso 1 → Nuevo registro de la línea
  await P.evaluate(() => goProduccionInicio()); await P.waitForSelector('#pi-pasos');
  await P.click('#pi-pasos [data-pi-paso="1"]'); await P.waitForTimeout(300);
  ok(await P.evaluate(k => state.currentTab === 'nuevo' && state.currentLine === k, otra), '«Nuevo registro» abre el registro de la línea elegida');
  // «Cierre por marca» (tarjeta) → Paletas
  await P.evaluate(() => goProduccionInicio()); await P.waitForSelector('#pi-pasos');
  await P.evaluate(() => [...document.querySelectorAll('#pi-inicio .mi-card')].find(c => /Cierre por marca/.test(c.textContent)).click()); await P.waitForTimeout(300);
  ok(await P.evaluate(() => state.currentTab === 'paletas'), 'la tarjeta «Cierre por marca» abre Paletas');
  ok(!D.errores || !D.errores.length, 'sin errores en la página' + (D.errores && D.errores.length ? ': ' + D.errores.join(' | ') : ''));

  // celular
  const C = await H.abrir(390, 844), Q = C.page;
  await entrar(Q, { rol: 'Administrador', nombre: 'Admin', username: 'admin', permisos: 'todos' });
  await Q.waitForSelector('#pi-pasos', { timeout: 6000 });
  ok(await Q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'celular: sin desborde lateral');
  if (process.env.GLX_CAPTURAS) await Q.screenshot({ path: path.join(process.env.GLX_CAPTURAS, 'inicio-produccion-cel.png'), fullPage: true });
  await H.cerrar();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
