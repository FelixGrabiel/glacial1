/* Hielo Premium y Vasos en navegador real: selector de producto, registro, reporte diario (pantalla, Excel e imagen), resumen de planta, programación y configuración.
   Uso: GLX_LIBS=/ruta node tests/hielo-productos.e2e.js (GLX_LIBS con node_modules/exceljs; no forma parte de las pruebas rápidas). GLX_CAPTURAS=/carpeta guarda capturas. */
'use strict';
const fs = require('fs'), path = require('path');
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
const { medir } = require('./ayuda/pantallas-movil.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
const EXCELJS = path.join(LIBS, 'node_modules', 'exceljs');
if (!fs.existsSync(EXCELJS)) { console.log('Falta exceljs en GLX_LIBS/node_modules. Prueba omitida.'); process.exit(0); }
const ExcelJS = require(EXCELJS);
let fallas = 0;
let ultimo = '';
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) { fallas++; if (process.env.GLX_DEPURAR) console.log('   TEXTO:', ultimo.slice(0, 1400)); } };
const DATOS = () => {
  const L = (marca, presentacion, bolsas, lote, e) => Object.assign({ marca, presentacion, bolsas, lote: lote || '' }, e || {});
  const R = glacialHieloDatos.cache;
  const base = (id, fecha, turno, prod, produccion, extra) => Object.assign({ id, fecha, turno, estado: 'FINALIZADO', produccion, paradas: [], mermas: [], rev: 1 }, prod ? { producto: prod } : {}, extra || {});
  R.reportes = [
    base('2026-11-18_NOCHE', '2026-11-18', 'NOCHE', null, [L('Rappi', '3 kg', 2000)]), base('2026-11-19_DÍA', '2026-11-19', 'DÍA', null, [L('Rappi', '3 kg', 3000)]),
    base('2026-11-15_NOCHE_PREMIUM', '2026-11-15', 'NOCHE', 'PREMIUM', [L('Glacial', '2 kg', 265, '11047320')], { supervisor: 'Mark', personas: 2, personal: ['Yoselis Guzman', 'Morelia Pillaca'] }),
    base('2026-11-16_DÍA_PREMIUM', '2026-11-16', 'DÍA', 'PREMIUM', [L('Glacial', '2 kg', 28, '21045309', { horas: 0.5, vence: '2027-11-16' })], { supervisor: 'Leandro Lopez', horaInicio: '13:00', horaFin: '19:00', personas: 5, personal: ['Angelica', 'Yasmelis', 'Gresy', 'Marck', 'Santiago'], observaciones: 'HIELO REEFERS 3', mermas: [{ item: 'Hielo (producto)', cantidad: 2.1, unidad: 'KG' }] }),
    base('2026-11-19_NOCHE_VASOS', '2026-11-19', 'NOCHE', 'VASOS', [L('OXXO', 'Vaso', 190, '110247324', { horas: 6, vence: '2027-11-20' })], { supervisor: 'Ana', horaInicio: '03:00', horaFin: '06:00', personas: 1, personal: ['Alicia Pilco'] }),
    base('2026-11-20_DÍA_VASOS', '2026-11-20', 'DÍA', 'VASOS', [L('OXXO', 'Vaso', 220, '210245311')], { supervisor: 'Ana', horaInicio: '13:00', horaFin: '17:00', personas: 1, personal: ['Luisa Mejia'] })
  ];
  R.listo = { reportes: true, programacion: true, config: true };
};
(async () => {
  const H = await iniciar(); const D = await H.abrir(1300, 1000); const P = D.page;
  await P.addScriptTag({ content: fs.readFileSync(path.join(EXCELJS, 'dist', 'exceljs.min.js'), 'utf8') });
  await P.evaluate(() => { document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block'; state.user = { rol: 'Administrador', nombre: 'Ana', username: 'ana', permisos: 'todos' }; state.showWelcome = false; goReporteHielo(); });
  await P.waitForSelector('.hl-app', { timeout: 6000 }); await P.evaluate(DATOS); await P.evaluate(() => hlVista('inicio'));
  const texto = async () => { ultimo = await P.evaluate(() => document.querySelector('.hl-main').innerText.replace(/\s+/g, ' ')); return ultimo; };
  // ---- los tres productos viven dentro del módulo de Hielo (no hay tarjetas ni botones aparte)
  ok(await P.evaluate(() => [...document.querySelectorAll('#report-select-screen .report-type-title')].map(x => x.textContent.trim()).join('|')) === 'Reporte Agua|Reporte Hielo' && await P.evaluate(() => document.querySelectorAll('#app-screen .topbar-hielo').length) === 1, 'afuera de Hielo solo hay «Reporte Hielo»: Premium y Vasos están dentro del módulo');
  await P.evaluate(() => goReporteHielo('VASOS')); ok(await P.evaluate(() => document.querySelector('.hl-prod button.act').innerText.trim()) === 'Hielo en vasos', 'abrir «Hielo en vasos» desde los módulos entra directo a ese producto');
  await P.evaluate(() => goReporteHielo('PREMIUM')); ok(await P.evaluate(() => document.querySelector('.hl-prod button.act').innerText.trim()) === 'Hielo premium', 'abrir «Hielo Premium» entra directo a Premium');
  ok(await P.evaluate(() => [...document.querySelectorAll('#hl-menu .hl-menu-prod')].map(b => b.innerText.trim()).join('|')) === 'Hielo en cubos|Hielo premium|Hielo en vasos' && await P.evaluate(() => document.querySelector('#hl-menu .hl-menu-prod.act').innerText.trim()) === 'Hielo premium', 'el menú lateral de Hielo tiene los 3 productos y marca el elegido');
  await P.evaluate(() => { document.querySelectorAll('#hl-menu .hl-menu-prod')[0].click(); }); ok(await P.evaluate(() => document.querySelector('.hl-prod button.act').innerText.trim()) === 'Hielo en cubos', 'tocar «Hielo en cubos» en el menú lateral cambia de producto');
  // ---- selector
  ok(await P.evaluate(() => [...document.querySelectorAll('.hl-prod button')].map(b => b.innerText.trim()).join('|')) === 'Hielo en cubos|Hielo premium|Hielo en vasos', 'hay un selector con Hielo en cubos, Hielo premium y Hielo en vasos');
  ok(await P.evaluate(() => document.querySelector('.hl-prod button.act').innerText.trim()) === 'Hielo en cubos', 'por defecto se ve Hielo en cubos (como siempre)');
  let t = await texto(); ok(/Inicio · Hielo en cubos/.test(t) && !/OXXO/.test(t), 'el Inicio de cubos no mezcla Premium ni Vasos');
  // ---- Premium
  await P.evaluate(() => { hlProducto('PREMIUM'); hlVista('reporte'); hlRDFecha('2026-11-16'); });
  await P.waitForSelector('#hl-rd-graficos canvas', { timeout: 6000 });
  t = await texto();
  ok(/Reporte diario de producción · Hielo premium/.test(t) && /56[.,]00 kg/.test(t) && /530[.,]00 kg/.test(t) && /GLACIAL \(2KG\)/.test(t) && /BELL'S \(1\.8KG\)/i.test(t) && /CUISINE & CO \(2KG\)/i.test(t), 'Premium: reporte diario con 56,00 kg el día, 530,00 la noche y las filas del Excel');
  ok(!/N° paletas/i.test(t) && !/N° jabas/i.test(t) && /Tiempo \(h\)/i.test(t) && /2 kg = 2 kg/.test(t), 'Premium: sin columna de paletas ni jabas, con tiempo y los kg por bolsa');
  ok(/Angelica, Yasmelis, Gresy, Marck, Santiago/.test(t) && /Leandro Lopez/.test(t) && /HIELO REEFERS 3/.test(t), 'Premium: personal, responsable y observaciones del turno');
  ok(await P.evaluate(() => document.querySelectorAll('#hl-rd-graficos canvas').length) === 7, 'Premium: se dibujan las 7 gráficas');
  if (process.env.GLX_CAPTURAS) { await P.screenshot({ path: process.env.GLX_CAPTURAS + '/hielo-premium-reporte.png' }); await P.locator('#hl-rd-graficos').screenshot({ path: process.env.GLX_CAPTURAS + '/hielo-premium-graficos.png' }); }
  // Excel descargado
  await P.evaluate(() => { window.__blobs = []; const o = URL.createObjectURL.bind(URL); URL.createObjectURL = b => { window.__blobs.push(b); return o(b); }; HTMLAnchorElement.prototype.click = function () { window.__nombre = this.download; }; });
  await P.evaluate(() => hlRDExcel()); await P.waitForFunction(() => window.__blobs.length > 0, null, { timeout: 15000 });
  const xl = async () => { const b64 = await P.evaluate(async () => { const b = window.__blobs[window.__blobs.length - 1], u = new Uint8Array(await b.arrayBuffer()); let s = ''; u.forEach(x => s += String.fromCharCode(x)); return btoa(s); }); const w = new ExcelJS.Workbook(); await w.xlsx.load(Buffer.from(b64, 'base64')); return w; };
  let w = await xl(), ws = w.getWorksheet('Reporte diario');
  ok(ws.getCell('A2').value === 'HIELO PREMIUM' && ws.getCell('B6').value === 56 && /Reporte-diario-Hielo-premium-2026-11-16\.xlsx/.test(await P.evaluate(() => window.__nombre)) && ws.getImages().length === 7, 'Premium: el Excel descargado dice HIELO PREMIUM, trae 56 kg, las 7 gráficas y el nombre del archivo lleva «premium»');
  // ---- Vasos
  await P.evaluate(() => { hlProducto('VASOS'); hlRDFecha('2026-11-20'); });
  await P.waitForSelector('#hl-rd-graficos canvas', { timeout: 6000 });
  t = await texto();
  ok(/Hielo en vasos/.test(t) && /190 vasos/.test(t) && /220 vasos/.test(t) && /410 vasos/.test(t) && /OXXO/.test(t) && /N° jabas/i.test(t) && /5[.,]43/.test(t) && /6[.,]29/.test(t) && /47[.,]50/.test(t) && /55[.,]00/.test(t), 'Vasos: 190, 220 y 410 vasos, jabas (5,43 y 6,29) y peso (47,50 y 55,00 kg)');
  ok(!/N° paletas/i.test(t) && /Luisa Mejia/.test(t) && /Alicia Pilco/.test(t), 'Vasos: sin paletas y con el personal de cada turno');
  ok(await P.evaluate(() => document.querySelectorAll('#hl-rd-graficos canvas').length) === 7, 'Vasos: se dibujan las 7 gráficas');
  if (process.env.GLX_CAPTURAS) { await P.screenshot({ path: process.env.GLX_CAPTURAS + '/hielo-vasos-reporte.png' }); await P.locator('#hl-rd-graficos').screenshot({ path: process.env.GLX_CAPTURAS + '/hielo-vasos-graficos.png' }); }
  await P.evaluate(() => hlRDExcel()); await P.waitForFunction(() => window.__blobs.length > 1, null, { timeout: 15000 });
  w = await xl(); ws = w.getWorksheet('Reporte diario');
  ok(ws.getCell('A2').value === 'HIELO VASOS' && ws.getCell('B5').value === 190 && ws.getCell('D5').value === 'VASOS' && ws.getCell('B6').value === 220, 'Vasos: el Excel descargado dice HIELO VASOS con 190 y 220 vasos');
  await P.evaluate(() => { window.__png = null; hlRDImagen(); }); await P.waitForFunction(() => window.__blobs.length > 2, null, { timeout: 10000 });
  ok(await P.evaluate(() => window.__blobs[window.__blobs.length - 1].type === 'image/png' && window.__blobs[window.__blobs.length - 1].size > 20000), 'Vasos: la imagen PNG se genera');
  if (process.env.GLX_CAPTURAS) { const png = await P.evaluate(async () => { const b = window.__blobs[window.__blobs.length - 1], u = new Uint8Array(await b.arrayBuffer()); let s = ''; u.forEach(x => s += String.fromCharCode(x)); return btoa(s); }); fs.writeFileSync(process.env.GLX_CAPTURAS + '/hielo-vasos-whatsapp.png', Buffer.from(png, 'base64')); }
  // ---- registro de Vasos
  await P.evaluate(() => hlVista('registro')); t = await texto();
  ok(/Nuevo registro · Hielo en vasos|Reporte · Hielo en vasos/.test(t) && /Producción \(vasos\)/i.test(t) && /Tiempo \(h\)/i.test(t) && /Vence/i.test(t) && /N\.º de personas/i.test(t) && /Personal del turno/i.test(t), 'Registro de Vasos: producción en vasos, tiempo, vencimiento, personas y personal');
  ok(await P.evaluate(() => glacialHieloUI.S.ed && glacialHieloUI.S.ed.producto === 'VASOS'), 'el reporte nuevo de Vasos lleva producto VASOS');
  // ---- programación y configuración de Vasos
  await P.evaluate(() => hlVista('programacion')); t = await texto(); ok(/Programación · Hielo en vasos/.test(t) && /Vasos a producir por turno/i.test(t), 'Programación de Vasos: en vasos');
  await P.evaluate(() => hlVista('config')); t = await texto(); ok(/Configuración · Hielo en vasos/.test(t) && /Vasos por jaba/i.test(t) && /Kg reales por vaso/i.test(t) && !/Bolsas por paleta/i.test(t), 'Configuración de Vasos: kg por vaso y vasos por jaba, sin paletas');
  await P.evaluate(() => hlProducto('CUBOS')); await P.evaluate(() => hlVista('config')); t = await texto(); ok(/Bolsas por paleta/i.test(t) && !/Vasos por jaba/i.test(t), 'Configuración de Cubos: sigue con paletas');
  ok(await P.evaluate(() => localStorage.getItem('glacial-hielo-producto')) === 'CUBOS', 'el producto elegido se recuerda en el navegador');
  // ---- Cubos sigue igual
  await P.evaluate(() => { hlVista('reporte'); hlRDFecha('2026-11-19'); }); await P.waitForSelector('#hl-rd-graficos canvas'); t = await texto();
  ok(/Hielo en cubos/.test(t) && /N° paletas/i.test(t) && /16[.,]250[.,]00 kg/.test(t) && !/OXXO|GLACIAL \(2KG\)/.test(t), 'Cubos: el reporte diario sigue igual (kg de cubos, con paletas) y sin los otros productos');
  // ---- Resumen de planta
  await P.evaluate(() => { hlVista('planta'); hlPlFecha('2026-11-20'); }); await P.waitForSelector('#hl-pl-graficos canvas', { timeout: 6000 }); t = await texto();
  ok(/Resumen de planta · Hielo/i.test(t) && /Hielo en cubos/i.test(t) && /Hielo premium/i.test(t) && /Hielo en vasos/i.test(t) && /410 vasos/i.test(t) && /PLANTA/.test(t) && await P.evaluate(() => document.querySelectorAll('#hl-pl-graficos canvas').length) === 2 && await P.evaluate(() => !document.querySelector('.hl-prod')), 'Resumen de planta: los 3 productos, el total, 2 gráficas y sin selector de producto');
  const resumen = await P.evaluate(() => { const m = glacialHieloReporte.modeloPlanta({ fecha: '2026-11-20', reportes: glacialHieloDatos.cache.reportes }); return { total: m.totalKg, cubos: m.productos[0].totalKg, vasos: m.productos[2].totalKg }; });
  ok(resumen.vasos === 102.5 && resumen.total === 102.5, 'Resumen de planta del 20/11: los vasos suman 102.5 kg (410 × 0.25) y es todo lo producido ese día');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/hielo-planta.png' });
  await P.evaluate(() => hlPlImagen()); await P.waitForFunction(() => window.__blobs.length > 3, null, { timeout: 10000 });
  ok(await P.evaluate(() => window.__blobs[window.__blobs.length - 1].type === 'image/png' && window.__blobs[window.__blobs.length - 1].size > 20000), 'Resumen de planta: la imagen PNG se genera');
  if (process.env.GLX_CAPTURAS) { const png = await P.evaluate(async () => { const b = window.__blobs[window.__blobs.length - 1], u = new Uint8Array(await b.arrayBuffer()); let s = ''; u.forEach(x => s += String.fromCharCode(x)); return btoa(s); }); fs.writeFileSync(process.env.GLX_CAPTURAS + '/hielo-planta-imagen.png', Buffer.from(png, 'base64')); }
  // ---- teléfono: nada recortado
  const T = await H.abrir(390, 900); const Q = T.page;
  await Q.evaluate(() => { document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block'; state.user = { rol: 'Administrador', nombre: 'Ana', username: 'ana', permisos: 'todos' }; state.showWelcome = false; goReporteHielo(); });
  await Q.waitForSelector('.hl-app'); await Q.evaluate(DATOS);
  const malos = [];
  for (const [prod, fecha, vista] of [['PREMIUM', '2026-11-16', 'reporte'], ['VASOS', '2026-11-20', 'reporte'], ['VASOS', '', 'registro'], ['PREMIUM', '', 'config'], ['CUBOS', '2026-11-20', 'planta']]) {
    await Q.evaluate(([p, f, v]) => { hlProducto(p); hlVista(v); if (f && v === 'reporte') hlRDFecha(f); if (f && v === 'planta') hlPlFecha(f); }, [prod, fecha, vista]); await Q.waitForTimeout(500);
    const r = await Q.evaluate(() => { const W = document.documentElement.clientWidth, o = []; document.querySelectorAll('#hielo-screen *').forEach(e => { const b = e.getBoundingClientRect(); if (!b.width || b.right <= W + 1) return; let p = e.parentElement, sc = false; while (p && p.id !== 'hielo-screen') { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.getBoundingClientRect().right <= W + 1) { sc = true; break; } p = p.parentElement; } if (!sc) o.push(e.tagName + '.' + String(e.className).slice(0, 20) + ' ' + Math.round(b.right)); }); return { W, o: o.slice(0, 3), sw: document.getElementById('hielo-screen').scrollWidth }; });
    if (r.o.length || r.sw > r.W + 1) malos.push(prod + '/' + vista + ' ' + r.o.join(','));
  }
  ok(malos.length === 0, 'en el teléfono (390 px) Premium, Vasos y la planta no quedan recortados' + (malos.length ? ': ' + malos.join(' | ') : ''));
  await H.cerrar();
  console.log(D.errores.length ? '\nErrores de página: ' + D.errores.slice(0, 3).join(' | ') : '');
  console.log(fallas ? '\n' + fallas + ' falla(s)' : '\nTodo bien'); process.exit(fallas ? 1 : 0);
})();
