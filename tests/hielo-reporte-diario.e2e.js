/* Hielo › Reporte diario en navegador real: pantalla, gráficas, Excel y PNG con los datos del reporte de la planta (noche 18/11 + día 19/11).
   Uso: GLX_LIBS=/ruta node tests/hielo-reporte-diario.e2e.js (GLX_LIBS con node_modules/exceljs; no forma parte de las pruebas rápidas). GLX_CAPTURAS=/carpeta guarda capturas. */
'use strict';
const fs = require('fs'), path = require('path');
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
const EXCELJS = path.join(LIBS, 'node_modules', 'exceljs');
if (!fs.existsSync(EXCELJS)) { console.log('Falta exceljs en GLX_LIBS/node_modules. Prueba omitida.'); process.exit(0); }
const ExcelJS = require(EXCELJS);
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1400, 1000); const P = D.page;
  await P.addScriptTag({ content: fs.readFileSync(path.join(EXCELJS, 'dist', 'exceljs.min.js'), 'utf8') });
  await P.evaluate(() => { document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block'; state.user = { rol: 'Administrador', nombre: 'Ana', username: 'ana', permisos: 'todos' }; state.showWelcome = false; goReporteHielo(); });
  await P.waitForSelector('.hl-app', { timeout: 6000 });
  await P.evaluate(() => {
    const L = (marca, presentacion, bolsas, lote) => ({ marca, presentacion, bolsas, lote: lote || '' });
    const R = glacialHieloDatos.cache;
    R.reportes = [
      { id: '2026-11-18_NOCHE', fecha: '2026-11-18', turno: 'NOCHE', estado: 'FINALIZADO', supervisor: 'Mark Murayari', horaInicio: '21:00', horaFin: '07:00', produccion: [L('Rappi', '3 kg', 680, '11147323'), L("Bell's", '3 kg', 1897, '16147323'), L('Molitalia', '3 kg', 300, '21347322'), L('Glacial', '1.5 kg', 600, '11147323'), L('Listo', '1.5 kg', 600, '17147323')], paradas: [{ motivo: 'Falla de equipo', minutos: 260 }], mermas: [], observaciones: 'ENVASADORA AUTOMATICA PRESENTA PARADAS CONSTANTE POR APAGADO REPENTINO' },
      { id: '2026-11-19_DÍA', fecha: '2026-11-19', turno: 'DÍA', estado: 'FINALIZADO', supervisor: 'Yeikari Marquez', horaInicio: '07:00', horaFin: '19:00', produccion: [L('Rappi', '3 kg', 520, '21147323'), L('Glacial', '3 kg', 750, '21147323'), L('Cusine & Co', '3 kg', 1500, '22147323'), L('Molitalia', '3 kg', 310), L('Hoteles', '3 kg', 600, '21147323'), L('Glacial', '1.5 kg', 1200, '21147323'), L('Listo', '1.5 kg', 600, '27147323')], paradas: [{ motivo: 'Otros', minutos: 40 }], mermas: [], observaciones: 'M5 ENCENDIDA 12:35PM' },
      { id: '2026-11-17_NOCHE', fecha: '2026-11-17', turno: 'NOCHE', estado: 'FINALIZADO', produccion: [L('Glacial', '3 kg', 2500)], paradas: [], mermas: [] },
      { id: '2026-11-18_DÍA', fecha: '2026-11-18', turno: 'DÍA', estado: 'FINALIZADO', produccion: [L('Glacial', '3 kg', 2200)], paradas: [], mermas: [] }
    ];
    // Historia de producción (8 días más, noche y día) para la carta de control, la mezcla por marca y el mapa de calor.
    const marcas = [['Tottus CD', '3 kg'], ['Bell\'s', '3 kg'], ['Cusine & Co', '3 kg'], ['Glacial', '1.5 kg'], ['Rappi', '3 kg'], ['Listo', '1.5 kg']];
    const nb = [2400, 3100, 2800, 3300, 2900, 2600, 3000, 3200], db = [2200, 2500, 1900, 2800, 2400, 2100, 2600, 1800];
    for (let i = 0; i < 8; i++) {
      const n = String(9 + i).padStart(2, '0'), d = String(10 + i).padStart(2, '0');
      const prod = (b, k) => [L(marcas[(i + k) % 6][0], marcas[(i + k) % 6][1], Math.round(b * 0.6)), L(marcas[(i + k + 2) % 6][0], marcas[(i + k + 2) % 6][1], Math.round(b * 0.4))];
      R.reportes.push({ id: '2026-11-' + n + '_NOCHE', fecha: '2026-11-' + n, turno: 'NOCHE', estado: 'FINALIZADO', produccion: prod(nb[i], 0), paradas: [], mermas: [] });
      if (i < 8 && '2026-11-' + d + '_DÍA' !== '2026-11-18_DÍA') R.reportes.push({ id: '2026-11-' + d + '_DÍA', fecha: '2026-11-' + d, turno: 'DÍA', estado: 'FINALIZADO', produccion: prod(db[i], 1), paradas: [], mermas: [] });
    }
    R.listo = { reportes: true, programacion: true, config: true };
    hlRDFecha('2026-11-19'); hlVista('reporte'); hlRDFecha('2026-11-19');
  });
  await P.waitForSelector('#hl-rd-graficos canvas', { timeout: 6000 });
  await P.evaluate(() => { window.RD_MODELO = () => glacialHieloReporte.modelo({ fecha: '2026-11-19', dias: Number(document.querySelector('select[aria-label^="Período"]').value) || 14, reportes: glacialHieloDatos.cache.reportes, cfg: glacialHieloDatos.config(), catalogo: PRODUCTOS_HIELO }); window.S_RD = () => Number(document.querySelector('select[aria-label^="Período"]').value); });
  const txt = await P.evaluate(() => document.querySelector('.hl-main').innerText.replace(/\s+/g, ' '));
  ok(await P.evaluate(() => [...document.querySelectorAll('#hl-menu button')].some(b => /Reporte diario/.test(b.innerText) && b.classList.contains('act'))), 'el menú de Hielo tiene «Reporte diario» y queda marcado');
  ok(/11,450\.25 kg/i.test(txt) && /15,110\.00 kg/i.test(txt) && /26,560\.25 kg/i.test(txt), 'tarjetas: noche 11,450.25 kg · día 15,110.00 kg · total del día 26,560.25 kg');
  ok(/Eficiencia 33\.68 %/i.test(txt) && /Eficiencia 44\.44 %/i.test(txt), 'eficiencia 33.68 % (noche) y 44.44 % (día)');
  ok(/Semana 47/i.test(txt), 'semana 47');
  ok(await P.evaluate(() => document.querySelectorAll('.hl-rd-t tbody tr').length) === 15, 'la tabla por marca trae las 14 filas del catálogo más el total');
  ok(/RAPPI \(3KG\)/i.test(txt) && /6,165\.25/.test(txt) && /2\.27/.test(txt) && /11147323/.test(txt), 'la tabla muestra Rappi, 6,165.25 kg de Bell\'s, 2.27 paletas y el lote');
  ok(await P.evaluate(() => document.querySelectorAll('#hl-rd-graficos canvas').length) === 7, 'se dibujan las 7 gráficas (capacidad, presentación, semana, paradas, carta de control, mezcla por marca y mapa de calor)');
  ok(await P.evaluate(() => [...document.querySelectorAll('#hl-rd-graficos canvas')].every(c => { const x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data; let colores = 0; const vistos = new Set(); for (let i = 0; i < d.length; i += 4000) vistos.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return vistos.size > 2; })), 'las gráficas no están en blanco');
  ok(/Observaciones/i.test(txt) && /ENVASADORA AUTOMATICA/i.test(txt) && /Mark Murayari/i.test(txt) && /21:00/.test(txt), 'observaciones, responsable e ingreso de cada turno');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/hielo-reporte-diario.png', fullPage: false });
  if (process.env.GLX_CAPTURAS) await P.locator('#hl-rd-graficos').screenshot({ path: process.env.GLX_CAPTURAS + '/hielo-reporte-graficos.png' });
  // ---- tendencias nuevas
  ok(await P.evaluate(() => { const c = RD_MODELO(); return c.control.puntos.length >= 8 && c.control.suficiente && c.control.ucl > c.control.mu && c.marcas.length >= 5 && c.mapa.fechas.length === 14; }), 'el modelo trae carta de control con límites (8 o más días), mezcla por marca y mapa del período');
    await P.evaluate(() => hlRDDias(7));
  ok(await P.evaluate(() => S_RD() === 7 && document.querySelector('select[aria-label^="Período"]').value === '7'), 'el selector cambia el período de la mezcla y el mapa a 7 días');
  ok(await P.evaluate(() => RD_MODELO().mapa.fechas.length === 7), 'con 7 días el mapa tiene 7 columnas');
  await P.evaluate(() => hlRDDias(14));
  // ---- vista por turno
  await P.evaluate(() => { hlRDTurno('NOCHE'); hlRDFecha('2026-11-18'); });
  let tt = await P.evaluate(() => document.querySelector('.hl-main').innerText.replace(/\s+/g, ' '));
  ok(await P.evaluate(() => document.querySelector('select[aria-label="Turno del reporte"]').value === 'NOCHE' && /Fecha del turno/i.test(document.querySelector('.hl-main').innerText)), 'el selector de turno cambia a «Solo turno noche» y la fecha pasa a ser la del turno');
  ok(/Turno noche · 18\/11\/26/i.test(tt) && /11,450\.25 kg/.test(tt) && !/Turno día · /i.test(tt) && !/DÍA · \d/.test(tt), 'solo noche del 18/11: no aparece el bloque del día');
  ok(await P.evaluate(() => document.querySelectorAll('.hl-rd-t thead th[colspan="6"]').length) === 1 && await P.evaluate(() => document.querySelectorAll('.hl-rd-t tbody tr:first-child td').length) === 7, 'la tabla por marca muestra un solo bloque de 6 columnas');
  ok(await P.evaluate(() => document.querySelectorAll('#hl-rd-graficos canvas').length) === 7, 'con un solo turno se siguen dibujando las 7 gráficas');
  if (process.env.GLX_CAPTURAS) await P.locator('#hl-rd-graficos').screenshot({ path: process.env.GLX_CAPTURAS + '/hielo-reporte-solo-noche.png' });
  ok(await P.evaluate(() => { const c = glacialHieloReporte.imagen(glacialHieloReporte.modelo({ fecha: '2026-11-18', turno: 'NOCHE', dias: 14, reportes: glacialHieloDatos.cache.reportes, cfg: glacialHieloDatos.config(), catalogo: PRODUCTOS_HIELO })); return c.width === 2480 && c.height > 1500; }), 'la imagen de WhatsApp también sale solo con el turno noche');
  await P.evaluate(() => { hlRDTurno('DIA'); hlRDFecha('2026-11-19'); });
  tt = await P.evaluate(() => document.querySelector('.hl-main').innerText.replace(/\s+/g, ' '));
  ok(/Turno día · 19\/11\/26/i.test(tt) && /15,110\.00 kg/.test(tt) && !/Turno noche · /i.test(tt), 'solo día: aparece el turno día y no la noche');
  ok(await P.evaluate(() => document.querySelectorAll('#hl-rd-graficos canvas').length) === 7, 'solo día: también 7 gráficas');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/hielo-reporte-solo-dia.png', fullPage: false });
  await P.evaluate(() => hlRDTurno('AMBOS'));
  ok(await P.evaluate(() => /Total del día/i.test(document.querySelector('.hl-main').innerText) && document.querySelectorAll('.hl-rd-t thead th[colspan="6"]').length === 2), 'al volver a «Día de producción» reaparecen los dos turnos');
  if (process.env.GLX_CAPTURAS) { const png = await P.evaluate(() => glacialHieloReporte.imagen(glacialHieloReporte.modelo({ fecha: '2026-11-18', turno: 'NOCHE', dias: 14, reportes: glacialHieloDatos.cache.reportes, cfg: glacialHieloDatos.config(), catalogo: PRODUCTOS_HIELO })).toDataURL('image/png').split(',')[1]); fs.writeFileSync(process.env.GLX_CAPTURAS + '/hielo-reporte-whatsapp-noche.png', Buffer.from(png, 'base64')); }
  // ---- compartir por WhatsApp
  ok(await P.evaluate(() => [...document.querySelectorAll('.hl-main .hl-btn')].filter(b => /por WhatsApp/.test(b.innerText) && !b.disabled).length) === 2, 'hay dos botones: compartir imagen y compartir Excel por WhatsApp');
  await P.evaluate(() => { window.__sh = []; window.__op = []; window.__dl = []; Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile', configurable: true }); navigator.canShare = () => true; navigator.share = async d => { window.__sh.push({ n: d.files[0].name, t: d.files[0].type, tx: d.text }); }; });
  await P.evaluate(() => hlRDCompartir('img'));
  ok(await P.evaluate(() => window.__sh.length === 1 && /^Reporte-diario-Hielo-2026-11-19\.png$/.test(__sh[0].n) && __sh[0].t === 'image/png' && /REPORTE DIARIO DE PRODUCCIÓN/.test(__sh[0].tx) && /Total del día: 26,560\.25 kg/.test(__sh[0].tx)), 'en el celular la imagen se comparte con el menú del teléfono, con el resumen como texto');
  await P.evaluate(() => hlRDCompartir('xlsx'));
  ok(await P.evaluate(() => window.__sh.length === 2 && /\.xlsx$/.test(__sh[1].n) && /spreadsheetml/.test(__sh[1].t)), 'en el celular el Excel se comparte como archivo .xlsx');
  await P.evaluate(() => { navigator.share = undefined; window.open = u => { window.__op.push(u); return {}; }; HTMLAnchorElement.prototype.click = function () { window.__dl.push(this.download); }; });
  await P.evaluate(() => hlRDCompartir('img'));
  ok(await P.evaluate(() => window.__op.length === 1 && /^https:\/\/wa\.me\/\?text=/.test(__op[0]) && window.__dl.length === 1 && /\.png$/.test(__dl[0])), 'sin menú de compartir (computador): descarga la imagen y abre WhatsApp con el resumen');
  await P.evaluate(() => { delete navigator.userAgent; });
  // ---- Excel descargado
  await P.evaluate(() => { window.__blobs = []; const o = URL.createObjectURL.bind(URL); URL.createObjectURL = b => { window.__blobs.push(b); return o(b); }; HTMLAnchorElement.prototype.click = function () { }; window.ExcelJS = window.ExcelJS || ExcelJS; window.cargarScriptExterno = async () => window.ExcelJS; });
  await P.evaluate(() => hlRDExcel());
  await P.waitForFunction(() => window.__blobs.length > 0, null, { timeout: 15000 });
  const b64 = await P.evaluate(async () => { const buf = new Uint8Array(await window.__blobs[0].arrayBuffer()); let s = ''; buf.forEach(x => s += String.fromCharCode(x)); return btoa(s); });
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(b64, 'base64'));
  const ws = wb.getWorksheet('Reporte diario');
  ok(ws.getCell('B5').value === 11450.25 && ws.getCell('B6').value === 15110 && ws.getCell('G5').value === 47, 'Excel descargado: kg de la noche, del día y semana 47');
  ok(ws.getImages().length === 7, 'Excel descargado: trae las 7 gráficas como imagen (' + ws.getImages().length + ')');
  ok(wb.getWorksheet('Resumen y semana').getCell('A1').value === 'PRODUCCIÓN – PRESENTACIÓN', 'Excel descargado: segunda hoja con el resumen y la semana');
  // ---- Imagen descargada
  await P.evaluate(() => { window.__blobs = []; hlRDImagen(); });
  await P.waitForFunction(() => window.__blobs.length > 0, null, { timeout: 10000 });
  if (process.env.GLX_CAPTURAS) { const png = await P.evaluate(async () => { const b = window.__blobs[0], u = new Uint8Array(await b.arrayBuffer()); let t = ''; u.forEach(x => t += String.fromCharCode(x)); return btoa(t); }); fs.writeFileSync(process.env.GLX_CAPTURAS + '/hielo-reporte-whatsapp.png', Buffer.from(png, 'base64')); }
  const dim = await P.evaluate(async () => { const b = window.__blobs[0], im = await createImageBitmap(b); return { tipo: b.type, w: im.width, h: im.height, bytes: b.size }; });
  ok(dim.tipo === 'image/png' && dim.w === 2480 && dim.h > 2300 && dim.bytes > 30000, 'imagen para WhatsApp: PNG de ' + dim.w + '×' + dim.h + ' (' + Math.round(dim.bytes / 1024) + ' KB)');
  // ---- otro día sin reportes y teléfono
  await P.evaluate(() => hlRDFecha('2026-12-30'));
  ok(await P.evaluate(() => /No hay reportes de la noche del 29\/12\/2026/.test(document.querySelector('.hl-main').innerText) && [...document.querySelectorAll('.hl-main .hl-btn')].filter(b => /Descargar/.test(b.innerText)).every(b => b.disabled)), 'un día sin reportes avisa y desactiva las descargas');
  await P.evaluate(() => hlRDFecha('2026-11-19')); await P.setViewportSize({ width: 390, height: 800 }); await P.waitForTimeout(300);
  ok(await P.evaluate(() => document.getElementById('hielo-screen').scrollWidth <= document.getElementById('hielo-screen').clientWidth + 1), 'en el teléfono no hay desplazamiento horizontal de la pantalla');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/hielo-reporte-diario-movil.png', fullPage: false });
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar(); console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
