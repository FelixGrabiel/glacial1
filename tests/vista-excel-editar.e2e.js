/* Vista previa en Excel · EDITAR Y GUARDAR EN EL SISTEMA (46-vista-excel.js + glacial_71) en Chromium con ExcelJS real (GLX_LIBS).
   Uso: GLX_LIBS=/ruta/con/node_modules node tests/vista-excel-editar.e2e.js        No forma parte de las pruebas rápidas.
   Servidor simulado con las reglas de glacial_71 (una fila por reporte+hoja+celda, original conservado, valor null = quitar, idempotencia).
   Comprueba: editar (la fórmula no), guardar solo en el sistema, volver a abrir el reporte (otro libro recién armado) con las correcciones
   aplicadas, corrección que NO se aplica si el dato del sistema cambió, quitar una corrección, descarga directa con conCorrecciones. */
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
  // servidor común (como glacial_71) para los dos equipos
  const BD = new Map(), llamadas = [], eventos = new Set();
  const rpc = (n, a) => {
    llamadas.push(n);
    if (n === 'excel_correcciones_listar') return { data: [...BD.values()].filter(f => f.reporte === a.p_reporte), error: null };
    if (n === 'excel_correccion_guardar') {
      const p = a.p, k = p.reporte + '|' + p.hoja + '|' + p.celda;
      if (eventos.has(p.client_event_id)) return { data: BD.get(k) || null, error: null };
      eventos.add(p.client_event_id);
      if (p.valor === null) { BD.delete(k); return { data: null, error: null }; }
      const prev = BD.get(k);
      const fila = { reporte: p.reporte, hoja: p.hoja, celda: p.celda, valor: p.valor, original: prev ? prev.original : p.original, actualizado_por: 'leandro', actualizado_en: new Date().toISOString() };
      BD.set(k, fila); return { data: fila, error: null };
    }
    return { data: null, error: null };
  };
  const abrirEquipo = async vp => {
    const page = await (await navegador.newContext({ viewport: vp, acceptDownloads: true })).newPage();
    const errores = []; page.on('pageerror', e => errores.push(e.message));
    await page.exposeFunction('__rpc', (n, a) => rpc(n, a));
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ content: fs.readFileSync(path.join(LIBS, 'node_modules/exceljs/dist/exceljs.min.js'), 'utf8') });
    await page.addScriptTag({ content: fs.readFileSync(R + '/js/nucleo/46-vista-excel.js', 'utf8') });
    await page.evaluate(() => {
      window.glacialSupabaseCliente = { rpc: (n, a) => window.__rpc(n, a) };
      // el reporte que arma el sistema (B2 = bolsas; se puede pedir con otro valor para simular que el dato cambió)
      window.__armar = (bolsas) => { const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Reporte');
        ws.getCell('A1').value = 'Marca'; ws.getCell('B1').value = 'Bolsas'; ws.getCell('C1').value = 'Eficiencia';
        ws.getCell('A2').value = 'Scala'; ws.getCell('B2').value = bolsas || 1200; ws.getCell('B2').numFmt = '#,##0'; ws.getCell('C2').value = 0.9; ws.getCell('C2').numFmt = '0%';
        ws.getCell('B3').value = { formula: 'B2*2', result: (bolsas || 1200) * 2 }; return wb; };
      window.__abrir = (bolsas) => { window.__wb = window.__armar(bolsas); glacialVistaExcel.abrir(window.__wb, { titulo: 'Reporte diario de Hielo', nombre: 'Reporte-diario-Hielo-2026-11-26-dia.xlsx', alDescargar: async () => { window.__regenerado = true; } }); };
    });
    return { page, errores };
  };
  const PC = await abrirEquipo({ width: 1200, height: 800 }), CEL = await abrirEquipo({ width: 390, height: 844 });
  const notas = P => P.evaluate(() => (document.querySelector('#vxl .vxl-notas') || {}).innerText || '');
  const esperarEstado = (P, re) => P.waitForFunction(r => new RegExp(r).test((document.querySelector('#vxl .vxl-estado') || {}).textContent || ''), re.source, { timeout: 6000 }).catch(() => {});

  // 1) PC: editar y guardar en el sistema
  await PC.page.evaluate(() => __abrir());
  await PC.page.click('#vxl [data-vxl-ed]');
  ok(await PC.page.evaluate(() => document.querySelectorAll('#vxl .vxl-v[contenteditable]').length >= 5 && !document.querySelector('#vxl td.vxl-fx .vxl-v[contenteditable]')), '«✎ Editar»: las celdas se escriben y la de fórmula no');
  const escribir = async (P, r, c, txt) => { const sel = `#vxl .vxl-v[data-vxl-r="${r}"][data-vxl-c="${c}"]`; await P.click(sel); await P.evaluate(s => { document.querySelector(s).textContent = ''; }, sel); await P.type(sel, txt); await P.keyboard.press('Enter'); };
  await escribir(PC.page, 2, 2, '1,350'); await escribir(PC.page, 2, 1, 'Scala Premium'); await escribir(PC.page, 2, 3, '95%');
  await esperarEstado(PC.page, /3 correcciones guardadas/);
  ok(BD.size === 3 && BD.get('Reporte-diario-Hielo-2026-11-26-dia|Reporte|B2').valor === 1350 && BD.get('Reporte-diario-Hielo-2026-11-26-dia|Reporte|B2').original === 1200 && BD.get('Reporte-diario-Hielo-2026-11-26-dia|Reporte|C2').valor === 0.95,
    'cada celda se guarda sola en el sistema (reporte + hoja + celda) con su valor original');
  const nt = await notas(PC.page); ok(/✓ 3 correcciones guardadas en el sistema/.test(nt) || (console.log('   notas: ' + nt), false), 'la vista dice «✓ 3 correcciones guardadas en el sistema»');

  // 2) Celular: abre el MISMO reporte (libro recién armado) y ve las correcciones sin descargar nada
  await CEL.page.evaluate(() => __abrir());
  await CEL.page.waitForFunction(() => document.querySelectorAll('#vxl td.vxl-cambiado').length === 3, null, { timeout: 6000 }).catch(() => {});
  const vC = await CEL.page.evaluate(() => { const ws = __wb.getWorksheet('Reporte'); return [ws.getCell('B2').value, ws.getCell('A2').value, ws.getCell('C2').value, document.querySelectorAll('#vxl td.vxl-cambiado').length, (document.querySelector('#vxl td.vxl-cambiado') || {}).title]; });
  ok(vC[0] === 1350 && vC[1] === 'Scala Premium' && vC[2] === 0.95 && vC[3] === 3 && /Corregido por leandro/.test(vC[4]) && /valor del sistema/.test(vC[4]), 'otro equipo abre el reporte y ve las 3 correcciones aplicadas y marcadas (quién y valor del sistema)');
  const [desc] = await Promise.all([CEL.page.waitForEvent('download', { timeout: 8000 }), CEL.page.click('#vxl [data-vxl-desc]')]);
  const releido = await CEL.page.evaluate(async b64 => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer); const ws = wb.getWorksheet('Reporte'); return [ws.getCell('B2').value, ws.getCell('A2').value, ws.getCell('B3').value && ws.getCell('B3').value.formula]; }, fs.readFileSync(await desc.path()).toString('base64'));
  ok(desc.suggestedFilename() === 'Reporte-diario-Hielo-2026-11-26-dia.xlsx' && releido[0] === 1350 && releido[1] === 'Scala Premium' && releido[2] === 'B2*2', 'su descarga lleva las correcciones (nombre oficial, sin «editado») y la fórmula');

  // 3) Descarga directa (sin abrir la vista): conCorrecciones
  const directa = await PC.page.evaluate(async () => { const wb = __armar(); const r = await glacialVistaExcel.conCorrecciones(wb, 'Reporte-diario-Hielo-2026-11-26-dia.xlsx'); return [r.aplicadas.length, wb.getWorksheet('Reporte').getCell('B2').value]; });
  ok(directa[0] === 3 && directa[1] === 1350, 'descarga directa («Descargar Excel» del módulo/Asistente): también aplica las correcciones guardadas');

  // 4) El dato del sistema cambió (B2 ahora es 1500): esa corrección NO se aplica y se avisa
  await CEL.page.evaluate(() => { glacialVistaExcel.cerrar(); __abrir(1500); });
  await CEL.page.waitForFunction(() => /no se aplicó/.test((document.querySelector('#vxl .vxl-notas') || {}).innerText || ''), null, { timeout: 6000 }).catch(() => {});
  const vD = await CEL.page.evaluate(() => [__wb.getWorksheet('Reporte').getCell('B2').value, __wb.getWorksheet('Reporte').getCell('A2').value]);
  ok(vD[0] === 1500 && vD[1] === 'Scala Premium' && /1 corrección no se aplicó: el dato del sistema cambió después \(Reporte!B2\)/.test(await notas(CEL.page)), 'si el dato del sistema cambió después, esa corrección no se aplica (queda 1500) y se avisa; las demás sí');

  // 5) Quitar una corrección escribiendo el valor original
  await PC.page.evaluate(() => { glacialVistaExcel.cerrar(); __abrir(); });
  await PC.page.waitForFunction(() => document.querySelectorAll('#vxl td.vxl-cambiado').length === 3, null, { timeout: 6000 }).catch(() => {});
  await PC.page.click('#vxl [data-vxl-ed]');
  await escribir(PC.page, 2, 1, 'Scala');
  await esperarEstado(PC.page, /2 correcciones guardadas/);
  ok(!BD.has('Reporte-diario-Hielo-2026-11-26-dia|Reporte|A2') && BD.size === 2 && await PC.page.evaluate(() => document.querySelectorAll('#vxl td.vxl-cambiado').length === 2), 'escribir el valor original quita la corrección (vuelve el dato del sistema)');

  // 6) celular sin desborde, sin errores
  ok(await CEL.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'celular: sin desborde lateral');
  ok(!PC.errores.length && !CEL.errores.length, 'sin errores en las páginas' + (PC.errores.concat(CEL.errores).length ? ': ' + PC.errores.concat(CEL.errores).join(' | ') : ''));
  await navegador.close();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
