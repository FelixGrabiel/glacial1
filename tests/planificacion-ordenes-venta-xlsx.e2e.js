/* Órdenes de ventas · importar un LIBRO de Excel real (varias pestañas) en un navegador de verdad.
   Necesita SheetJS: GLX_XLSX=/ruta/a/xlsx.full.min.js GLX_LIBS=/ruta node tests/planificacion-ordenes-venta-xlsx.e2e.js (no forma parte de las pruebas rápidas) */
'use strict';
const fs = require('fs');
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS || !process.env.GLX_XLSX) { console.log('Falta GLX_LIBS o GLX_XLSX. Prueba omitida.'); process.exit(0); }
const XLSX = require(process.env.GLX_XLSX.replace(/dist\/xlsx\.full\.min\.js$/, ''));
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const H1 = ['OC', 'TIENDA', 'FECHA EMISION', 'FECHA ENTREGA', 'PRODUCTO', 'UND SOLICITADAS', 'UND DESPACHO', 'NNSS', 'DEVOLUCION', 'semana', 'MES', 'AÑO'];
const libro = XLSX.utils.book_new();
const hoja = (n, enc, filas, oculta) => { XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([enc].concat(filas)), n); if (oculta) { libro.Workbook = libro.Workbook || { Sheets: [] }; } };
hoja('MAKRO 2025', H1, [['11677057', 'MAKRO VES', '30-12-2024', '06-01-2025', 'ARO-AGUA-2-5-L', 108, 108, '100.00%', 'NO SE PROGRAMO', 2, 1, 2025], ['11677057', 'MAKRO VES', '30-12-2024', '06-01-2025', 'ARO-AGUA-20-L', 100, 75, '75%', '', 2, 1, 2025]]);
hoja('SPSA 2025', H1.map(h => h === 'UND DESPACHO' ? 'UND ENVIADA' : h), [['11670806', 'SPSA CD MASS ESTE', '27-12-2024', '06-01-2025', 'SCALA-AGUA-SIN-GAS-BT-1-L', 2616, 2616, '100%', '', 2, 1, 2025]]);
hoja('CEN 2025', [' OC', 'TIENDA', 'FECHA EMISION', 'FECHA ENTREGA', 'PRODUCTO', 'UND SOLICITADAS', 'UND DESPACHO', 'NNSS', 'OBS', 'SEMANA', 'MES', 'AÑO'], [['8201427066', 'CENCOSUD', '26/12/2024', '2/1/2025', 'AGUA X 2.50 LT SIN GAS CUISINE&CO', 240, 0, '0%', 'OC CANCELADA', 1, 1, 2025]]);
hoja('MAKRO 2024', H1, [['1', 'M', '01-01-2024', '05-01-2024', 'ARO-AGUA-20-L', 10, 10, '', '', 1, 1, 2024]]);
hoja('NNSS MAKRO 2025', ['SEMANA', 'NNSS'], [[1, '90%']]);
const dir = process.env.GLX_TMP || require('os').tmpdir();
XLSX.writeFile(libro, dir + '/ventas-prueba.xlsx');
(async () => {
  const H = await iniciar();
  const D = await H.abrir(1500, 900);
  await D.page.addInitScript(fs.readFileSync(process.env.GLX_XLSX, 'utf8'));
  await D.page.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Administrador', nombre: 'Ana', username: 'admin', permisos: 'todos' }; state.showWelcome = false; window._recordsReady = true;
    _programacionesCache = []; _programacionesReady = true; goPlanificacion();
  });
  await D.page.addScriptTag({ content: fs.readFileSync(process.env.GLX_XLSX, 'utf8') });
  await D.page.waitForSelector('#plan-root .plan-tab');
  await D.page.evaluate(() => [...document.querySelectorAll('#plan-root .plan-tab')].find(e => e.textContent.trim() === 'Órdenes de ventas').click());
  await D.page.waitForSelector('[data-ov-importar]');
  await D.page.click('[data-ov-importar]'); await D.page.waitForSelector('#ovi-archivo');
  await D.page.setInputFiles('#ovi-archivo', dir + '/ventas-prueba.xlsx');
  await D.page.waitForSelector('[data-ovi-hoja]');
  const hojas = await D.page.evaluate(() => [...document.querySelectorAll('[data-ovi-hoja]')].map(c => c.getAttribute('data-ovi-hoja') + (c.checked ? ':sí' : ':no') + (c.disabled ? ':bloq' : '')));
  ok(JSON.stringify(hojas) === JSON.stringify(['MAKRO 2025:sí', 'SPSA 2025:sí', 'CEN 2025:sí', 'MAKRO 2024:sí', 'NNSS MAKRO 2025:no:bloq']), 'se marcan todas las pestañas de ventas visibles (no NNSS): ' + hojas.join(', '));
  ok(await D.page.evaluate(() => document.getElementById('ovi-corte').value) === '2025-01-01', 'sin entregas de 2026, la fecha de corte propuesta es el 1 de enero de 2025');
  const vista = await D.page.evaluate(() => document.getElementById('ovi-vista').innerText.replace(/\s+/g, ' '));
  ok(/4 producto\(s\) de la hoja aún no están/.test(vista), 'los productos sin equivalencia se avisan (4): ' + vista.slice(0, 160));
  const pre = await D.page.evaluate(() => [...document.querySelectorAll('tr[data-eq]')].map(tr => tr.getAttribute('data-eq') + '→' + tr.querySelector('[data-eq-marca]').value + '/' + tr.querySelector('[data-eq-pres]').value));
  ok(pre.length === 4 && pre.every(x => !/→\//.test(x) && !/\/$/.test(x)), 'cada producto llega con marca y presentación sugeridas: ' + pre.join(' · ').slice(0, 220));
  /* un libro que NO es de ventas (stock) */
  if (process.env.GLX_STOCK) {
    await D.page.setInputFiles('#ovi-archivo', process.env.GLX_STOCK);
    await D.page.waitForFunction(() => /no parece de órdenes de ventas/.test(document.getElementById('ovi-vista').innerText), null, { timeout: 8000 });
    ok(true, 'un libro de stock se rechaza con un mensaje claro (no pide columnas sueltas)');
  }
  /* el libro REAL de ventas (opcional: GLX_VENTAS=/ruta/al/libro.xlsx) */
  if (process.env.GLX_VENTAS) {
    await D.page.evaluate(() => { window.__bd = { ordenesVenta: [], ordenesVentaConfig: {} }; db.runTransaction = async fn => { const tx = { get: async () => ({ exists: true, data: () => window.__bd }), set: (r, d) => { window.__bd = d; glacialPlanificacion.ventas.__poner(d.ordenesVenta, d.ordenesVentaConfig); glacialPlanificacion.refrescar(); } }; return await fn(tx); }; });
    await D.page.setInputFiles('#ovi-archivo', process.env.GLX_VENTAS);
    await D.page.waitForFunction(() => /MAKRO 2023/.test(document.getElementById('ovi-hojas').innerText) && document.querySelectorAll('tr[data-eq]').length > 10, null, { timeout: 60000 });
    const real = await D.page.evaluate(() => ({ corte: document.getElementById('ovi-corte').value, hojas: [...document.querySelectorAll('[data-ovi-hoja]:checked')].map(c => c.getAttribute('data-ovi-hoja')), eq: [...document.querySelectorAll('tr[data-eq]')].map(tr => [tr.getAttribute('data-eq'), tr.querySelector('[data-eq-marca]').value, tr.querySelector('[data-eq-pres]').value]) }));
    console.log('REAL', real.corte, real.hojas.join(','), real.eq.length, 'productos;', real.eq.filter(e => !e[1] || !e[2]).length, 'sin sugerencia');
    await D.page.click('[data-ovi-guardar-eq]');
    await D.page.waitForFunction(() => !document.querySelector('[data-ovi-guardar-eq]') && /nueva/.test(document.getElementById('ovi-vista').innerText), null, { timeout: 60000 });
    console.log('VISTA', (await D.page.evaluate(() => document.querySelector('.ov-vista').innerText)).replace(/\s+/g, ' ').slice(0, 400));
    await D.page.click('#ovi-aplicar'); await D.page.waitForSelector('#ovi-aplicar', { state: 'detached', timeout: 60000 });
    await D.page.waitForTimeout(800);
    const fin = await D.page.evaluate(() => ({ n: window.__bd.ordenesVenta.length, kpis: [...document.querySelectorAll('.ov-k')].map(k => k.querySelector('span').textContent + '=' + k.querySelector('b').textContent), filas: document.querySelectorAll('#ov-tabla tbody tr').length }));
    console.log('FIN', JSON.stringify(fin));
    if (process.env.GLX_CAPTURAS) await D.page.screenshot({ path: process.env.GLX_CAPTURAS + '/ventas-real.png', fullPage: false });
  }
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
