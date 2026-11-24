/* Tareo: filtros en Historial, Tareo General y Resumen mensual + HORAS EXTRAS en minutos ENTEROS en el Excel, en navegador real.
   Uso: GLX_LIBS=/ruta node tests/tareo-filtros-excel.e2e.js  (GLX_LIBS debe tener node_modules/exceljs; no forma parte de las pruebas rápidas). */
'use strict';
const fs = require('fs'), path = require('path');
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
const EXCELJS = path.join(LIBS, 'node_modules', 'exceljs');
if (!fs.existsSync(EXCELJS)) { console.log('Falta exceljs en GLX_LIBS/node_modules. Prueba omitida.'); process.exit(0); }
const ExcelJS = require(EXCELJS);
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const esperar = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const H = await iniciar();
  const D = await H.abrir(1400, 950); const P = D.page;
  await P.addScriptTag({ content: fs.readFileSync(path.join(EXCELJS, 'dist', 'exceljs.min.js'), 'utf8') });
  const hoy = await P.evaluate(() => obtenerFechaHoy());
  await P.evaluate(([hoy]) => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Administrador', nombre: 'Admin', username: 'admin', permisos: 'todos' }; state.showWelcome = false; window._recordsReady = true;
    let n = 0; const Pp = (id, nombre, cargo, extra) => Object.assign({ id, trabajadorId: id, nombre, dni: String(40000000 + (++n)), cargo, linea: 'PET1', asistencia: 'Asistió', horaIngreso: '07:00', horaSalida: '15:00' }, extra || {});
    const dia = d => { const f = new Date(hoy + 'T00:00:00'); f.setDate(f.getDate() - d); return f.toISOString().slice(0, 10); };
    _workersCache = [];
    _tareosCache = [
      { id: 'tp1', fecha: hoy, turno: 'Día', area: 'Producción', estado: 'Abierto', jornadaNormal: 8, creadoPor: 'admin', personal: [
        Pp('a1', 'Ana Ruiz', 'Maquinista', { horaSalida: '15:16' }), Pp('a2', 'Beto Soto', 'Operario', { linea: 'B7L', horaSalida: '14:00' }), Pp('a3', 'Cesar Paz', 'Operario', { asistencia: 'Falta injustificada', horaIngreso: '', horaSalida: '' }), Pp('a4', 'Dora Lima', 'Operario', { asistencia: '', horaIngreso: '', horaSalida: '' })] },
      { id: 'tm1', fecha: hoy, turno: 'Día', area: 'Mantenimiento', estado: 'Abierto', jornadaNormal: 8, creadoPor: 'admin', personal: [
        Pp('t1', 'Elmer Diaz', 'Técnico', { linea: 'Mtto', horaSalida: '15:45' })] },
      { id: 'tp2', fecha: dia(3), turno: 'Noche', area: 'Producción', estado: 'Cerrado', jornadaNormal: 8, creadoPor: 'admin', personal: [Pp('b1', 'Fabio Gil', 'Operario', { horaIngreso: '19:00', horaSalida: '03:00' })] },
      { id: 'tp3', fecha: dia(40), turno: 'Día', area: 'Producción', estado: 'Cerrado', jornadaNormal: 8, creadoPor: 'admin', personal: [Pp('c1', 'Gina Roca', 'Operario')] }
    ];
    window.__dia3 = dia(3);
  }, [hoy]);

  /* ---------- Historial ---------- */
  await P.evaluate(() => renderHistorialTareo());
  const filasHist = () => P.evaluate(() => document.querySelectorAll('#main .tareo-table tbody tr').length);
  ok(await filasHist() === 4, 'Historial: sin filtros muestra los 4 tareos');
  ok(await P.evaluate(() => !!document.querySelector('#tareo-historial-filtros')), 'Historial: aparece la barra de filtros');
  await P.evaluate(() => tareoHistorialSet('turno', 'Noche'));
  ok(await filasHist() === 1, 'Historial: turno Noche → 1 tareo');
  await P.evaluate(() => tareoHistorialLimpiar());
  await P.evaluate(d => tareoHistorialSet('desde', d), await P.evaluate(() => window.__dia3));
  ok(await filasHist() === 3, 'Historial: «Desde» deja fuera el tareo de hace 40 días');
  await P.evaluate(() => tareoHistorialLimpiar());
  await P.evaluate(() => tareoHistorialBuscar('elmer')); await esperar(500);
  ok(await filasHist() === 1 && /1 de 4 tareos/.test(await P.evaluate(() => document.querySelector('#main .panel-head').innerText)), 'Historial: buscar una persona encuentra su tareo y dice «1 de 4 tareos»');
  ok(await P.evaluate(() => document.getElementById('tareo-hist-texto') === document.activeElement), 'Historial: el cuadro de búsqueda conserva el foco al escribir');
  await P.evaluate(() => tareoHistorialLimpiar());
  await P.evaluate(() => tareoHistorialSet('estado', 'PENDIENTES'));
  ok(await filasHist() === 1, 'Historial: «Con personal sin registrar» deja solo el tareo con pendientes');
  await P.evaluate(() => tareoHistorialLimpiar());
  ok(await filasHist() === 4, 'Historial: «Limpiar filtros» vuelve a mostrar todo');

  /* ---------- Tareo General ---------- */
  await P.evaluate(() => { tareoGeneralFiltros.fecha = obtenerFechaHoy(); renderTareoGeneral(); });
  const personas = () => P.evaluate(() => tareoGeneralDatos().filas.length);
  ok(await personas() === 5, 'General: sin filtros hay 5 personas (producción + mantenimiento)');
  ok(await P.evaluate(() => ['asistencia', 'linea', 'cargo', 'texto'].every(k => !!document.getElementById('tareo-general-' + k))), 'General: aparecen Asistencia, Línea, Cargo y Buscar persona');
  await P.evaluate(() => { document.getElementById('tareo-general-linea').value = 'B7L'; tareoGeneralFiltrar(); });
  ok(await personas() === 1, 'General: línea B7L → 1 persona');
  await P.evaluate(() => tareoGeneralLimpiarPersonas());
  await P.evaluate(() => { document.getElementById('tareo-general-cargo').value = 'Técnico'; tareoGeneralFiltrar(); });
  ok(await personas() === 1, 'General: cargo Técnico → 1 persona');
  await P.evaluate(() => tareoGeneralLimpiarPersonas());
  const etiquetas = await P.evaluate(() => [...document.querySelectorAll('#tareo-general-asistencia option')].map(o => o.value).filter(Boolean));
  ok(etiquetas.includes('ASISTIÓ') && etiquetas.includes('PENDIENTE') && etiquetas.length >= 3, 'General: las opciones de asistencia salen de lo registrado (' + etiquetas.join(', ') + ')');
  await P.evaluate(() => { document.getElementById('tareo-general-asistencia').value = 'PENDIENTE'; tareoGeneralFiltrar(); });
  ok(await personas() === 1, 'General: asistencia PENDIENTE → 1 persona');
  await P.evaluate(() => tareoGeneralLimpiarPersonas());
  await P.evaluate(() => tareoGeneralBuscar('40000003')); await esperar(500);
  ok(await personas() === 1 && /Mostrando 1 de 5 personas/.test(await P.evaluate(() => document.getElementById('main').innerText)), 'General: buscar por DNI encuentra a la persona y dice «Mostrando 1 de 5»');
  ok(await P.evaluate(() => document.getElementById('tareo-general-texto') === document.activeElement), 'General: el cuadro de búsqueda conserva el foco');
  await P.evaluate(() => tareoGeneralLimpiarPersonas());
  ok(await personas() === 5, 'General: «Limpiar filtros» vuelve a mostrar todo');

  /* ---------- Resumen mensual ---------- */
  await P.evaluate(() => renderResumenMensualTareoUI());
  const filasRes = () => P.evaluate(() => { const panel = [...document.querySelectorAll('#tareo-resumen-contenido .panel')].find(x => (x.querySelector('h3') || {}).innerText === 'Personal'); return panel ? panel.querySelectorAll('tbody tr').length : -1; });
  const antes = await filasRes();
  await P.evaluate(() => { document.getElementById('tareo-resumen-texto').value = 'elmer'; tareoResumenBuscar(); }); await esperar(500);
  ok(antes > 1 && await filasRes() === 1, 'Resumen mensual: buscar por nombre deja una persona (de ' + antes + ')');
  await P.evaluate(() => { document.getElementById('tareo-resumen-texto').value = ''; tareoResumenBuscar(); }); await esperar(500);
  ok(await filasRes() === antes, 'Resumen mensual: borrar la búsqueda vuelve a la lista completa');

  /* ---------- Excel: HORAS EXTRAS en minutos enteros ---------- */
  await P.evaluate(() => {
    window.__blobs = []; const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = b => { window.__blobs.push(b); return orig(b); };
    HTMLAnchorElement.prototype.click = function () { };
  });
  await P.evaluate(() => exportarExcelRRHH({ grupoSel: 'GENERAL', fechas: [obtenerFechaHoy()], turnos: ['Día'], nombreArchivo: 'prueba.xlsx' }));
  await P.waitForFunction(() => window.__blobs.length > 0, null, { timeout: 15000 });
  const b64 = await P.evaluate(async () => { const buf = new Uint8Array(await window.__blobs[0].arrayBuffer()); let s = ''; buf.forEach(x => s += String.fromCharCode(x)); return btoa(s); });
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(b64, 'base64'));
  const hoja = wb.getWorksheet('General');
  let colExt = 0, filaEnc = 0;
  hoja.eachRow((fila, n) => fila.eachCell((c, i) => { if (/^HORAS EXTRAS \(min\)$/.test(String(c.value))) { colExt = i; filaEnc = n; } }));
  ok(colExt > 0, 'Excel: la columna se llama «HORAS EXTRAS (min)»');
  const valores = []; hoja.eachRow((fila, n) => { if (n > filaEnc) { const c = fila.getCell(colExt); if (typeof c.value === 'number') valores.push({ v: c.value, f: c.numFmt }); } });
  ok(valores.length > 0 && valores.every(x => Number.isInteger(x.v)), 'Excel: todas las HORAS EXTRAS son números enteros (' + valores.map(x => x.v).join(', ') + ')');
  ok(valores.some(x => x.v === 16) && valores.some(x => x.v === -60) && valores.some(x => x.v === 45), 'Excel: 16 min → 16, 1 h menos → -60 y 8 h 45 min de jornada → 45 (minutos, no fracciones de día)');
  ok(valores.every(x => Math.abs(x.v) >= 1 || x.v === 0), 'Excel: ningún valor tipo 0.011111');
  ok(valores.every(x => /0/.test(x.f) && !/h/.test(x.f)), 'Excel: formato numérico entero con signo (' + [...new Set(valores.map(x => x.f))].join(' | ') + ')');
  const textoResumen = []; hoja.eachRow(fila => fila.eachCell(c => { if (/^Min\. (a favor|en contra)$/.test(String(c.value))) textoResumen.push(String(c.value)); }));
  ok(textoResumen.length === 2, 'Excel: el resumen dice «Min. a favor» y «Min. en contra»');
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar(); console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
