/* Vista previa en Excel · EDITAR (46-vista-excel.js) en Chromium con ExcelJS real (GLX_LIBS). No forma parte de las pruebas rápidas.
   Uso: GLX_LIBS=/ruta/con/node_modules node tests/vista-excel-editar.e2e.js
   Edita un número, un texto y un porcentaje; comprueba que la celda con fórmula no se edita y que el Excel descargado lleva los cambios. */
'use strict';
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); } catch (e) { console.log('Falta playwright. Prueba omitida.'); process.exit(0); } }
const LIBS = process.env.GLX_LIBS;
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
const R = path.resolve(__dirname, '..');
let fallas = 0; const ok = (c, m) => { console.log((c ? '✔ ' : '✘ FALLA ') + m); if (!c) fallas++; };

(async () => {
  const navegador = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') && fs.statSync('/opt/pw-browsers/chromium').isFile() ? '/opt/pw-browsers/chromium' : undefined });
  for (const vp of [{ width: 1200, height: 800 }, { width: 390, height: 844 }]) {
    const page = await (await navegador.newContext({ viewport: vp, acceptDownloads: true })).newPage();
    const errores = []; page.on('pageerror', e => errores.push(e.message));
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ content: fs.readFileSync(path.join(LIBS, 'node_modules/exceljs/dist/exceljs.min.js'), 'utf8') });
    await page.addScriptTag({ content: fs.readFileSync(R + '/js/nucleo/46-vista-excel.js', 'utf8') });
    await page.evaluate(() => {
      const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Reporte');
      ws.getCell('A1').value = 'Marca'; ws.getCell('B1').value = 'Bolsas'; ws.getCell('C1').value = 'Eficiencia';
      ws.getCell('A2').value = 'Scala'; ws.getCell('B2').value = 1200; ws.getCell('B2').numFmt = '#,##0'; ws.getCell('C2').value = 0.9; ws.getCell('C2').numFmt = '0%';
      ws.getCell('B3').value = { formula: 'B2*2', result: 2400 };
      window.__wb = wb;
      glacialVistaExcel.abrir(wb, { titulo: 'Prueba', nombre: 'prueba.xlsx', alDescargar: async () => { window.__regenerado = true; } });
    });
    const tag = vp.width < 700 ? ' (celular)' : ' (PC)';
    ok(await page.evaluate(() => !document.querySelector('#vxl [contenteditable]')), 'sin «Editar», la vista es solo lectura' + tag);
    await page.click('#vxl [data-vxl-ed]');
    ok(await page.evaluate(() => document.querySelectorAll('#vxl .vxl-v[contenteditable]').length >= 5 && !document.querySelector('#vxl td.vxl-fx .vxl-v[contenteditable]')), '«✎ Editar»: las celdas se pueden escribir y la de fórmula no' + tag);
    const escribir = async (r, c, txt) => { const sel = `#vxl .vxl-v[data-vxl-r="${r}"][data-vxl-c="${c}"]`; await page.click(sel); await page.evaluate(s => { const el = document.querySelector(s); el.textContent = ''; }, sel); await page.type(sel, txt); await page.keyboard.press('Enter'); };
    await escribir(2, 2, '1,350');
    await escribir(2, 1, 'Scala Premium');
    await escribir(2, 3, '95%');
    const v = await page.evaluate(() => { const ws = __wb.getWorksheet('Reporte'); return [ws.getCell('B2').value, ws.getCell('A2').value, ws.getCell('C2').value, ws.getCell('B3').value.formula]; });
    ok(v[0] === 1350 && v[1] === 'Scala Premium' && v[2] === 0.95 && v[3] === 'B2*2', 'los cambios quedan en el libro: 1,350 → número 1350; texto; 95% → 0.95; la fórmula se conserva' + tag);
    const pant = await page.evaluate(() => ({ b: document.querySelector('#vxl [data-vxl-desc]').textContent, marcadas: document.querySelectorAll('#vxl td.vxl-cambiado').length, celda: document.querySelector('#vxl .vxl-v[data-vxl-r="2"][data-vxl-c="2"]').textContent }));
    ok(/con 3 cambios/.test(pant.b) && pant.marcadas === 3 && pant.celda === '1,350', 'se marcan las 3 celdas cambiadas y el botón dice «Descargar Excel (con 3 cambios)»' + tag);
    const [descarga] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#vxl [data-vxl-desc]')]);
    const archivo = await descarga.path();
    ok(/prueba \(editado\)\.xlsx$/.test(descarga.suggestedFilename()) && !(await page.evaluate(() => !!window.__regenerado)), 'con cambios se descarga ESTE libro («prueba (editado).xlsx»), no uno regenerado' + tag);
    const releido = await page.evaluate(async b64 => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer); const ws = wb.getWorksheet('Reporte'); return [ws.getCell('B2').value, ws.getCell('A2').value, ws.getCell('C2').value, ws.getCell('B3').value && ws.getCell('B3').value.formula]; }, fs.readFileSync(archivo).toString('base64'));
    ok(releido[0] === 1350 && releido[1] === 'Scala Premium' && releido[2] === 0.95 && releido[3] === 'B2*2', 'el Excel descargado, abierto de nuevo, tiene los valores editados y la fórmula' + tag);
    ok(!errores.length, 'sin errores en la página' + tag + (errores.length ? ': ' + errores.join(' | ') : ''));
  }
  await navegador.close();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
