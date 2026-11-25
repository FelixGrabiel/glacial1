/* Asistente de Producción · pestaña Hielo (99-asistente-hielo.js, 25/11/2026): estado de los reportes, producción, consumo de bolsas por bolsa usada,
   mermas y vista previa del Excel del Reporte diario de Hielo. Uso: GLX_LIBS=/ruta node tests/asistente-hielo.e2e.js (GLX_CAPTURAS=/carpeta guarda capturas) */
'use strict';
const fs = require('fs'), path = require('path');
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
const EXCELJS = path.join(LIBS, 'node_modules', 'exceljs');
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1300, 1000); const P = D.page;
  await P.addScriptTag({ content: fs.readFileSync(path.join(EXCELJS, 'dist', 'exceljs.min.js'), 'utf8') });
  await P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Asistente de Producción', nombre: 'Nayeli', username: 'nayeli', permisos: ['asistenteProduccion'] }; state.showWelcome = false;
    window.cargarScriptExterno = async () => window.ExcelJS;
    const d = glacialHieloDatos, P = (marca, presentacion, bolsas, estacion, x) => Object.assign({ marca, presentacion, bolsas, estacion }, x || {});
    d.escuchar = () => {};       // sin servidor: los datos se ponen a mano
    d.cache.reportes = [
      { id: '2026-11-24_DÍA', fecha: '2026-11-24', turno: 'DÍA', estado: 'EN_REGISTRO', supervisor: 'Mariangel Ratia', horaInicio: '07:00', horaFin: '19:00', personas: 10,
        produccion: [P("Bell's", '3 kg', 1200, 'Env. automática'), P('Tottus CD', '3 kg', 400, 'Tolva manual', { bolsa: 'Glacial', nota: 'Se acabó la bolsa Tottus' }), P('Glacial', '1.5 kg', 960, 'Tolva manual'), P('Listo', '1.5 kg', 600, 'Tolva manual')],
        paradas: [{ motivo: 'Otros', minutos: 60, nota: 'Refrigerio' }], mermas: [{ item: 'Bolsas', marca: 'Glacial', cantidad: 12, unidad: 'UND' }, { item: 'Bobina', marca: 'Glacial', cantidad: 0.8, unidad: 'KG' }], observaciones: 'M5 apagada por intervención' },
      { id: '2026-11-24_DÍA_VASOS', producto: 'VASOS', fecha: '2026-11-24', turno: 'DÍA', estado: 'FINALIZADO', supervisor: 'Mariangel Ratia', produccion: [P('OXXO', 'Vaso', 105, 'Tolva manual')], paradas: [], mermas: [] }];
    d.cache.programacion = [{ id: '2026-11-24_DÍA', fecha: '2026-11-24', turno: 'DÍA', items: [{ marca: "Bell's", presentacion: '3 kg', bolsas: 1800 }, { marca: 'Glacial', presentacion: '1.5 kg', bolsas: 960 }] }];
    d.cache.listo = { reportes: true, programacion: true, config: true };
    goAsistente();
    const A = glacialAsistentePantalla.AP; A.fecha = '2026-11-24'; A.bloque = 'DIA'; A.tab = 'hielo';
    glacialAsistentePantalla.pintar();
  });
  await P.waitForTimeout(600);
  const t = await P.evaluate(() => document.querySelector('.ap') ? document.querySelector('.ap').innerText : '');
  ok(/Hielo · Mañana \+ Intermedio/.test(t) && /Hielo en cubos/.test(t) && /En registro/.test(t) && /Mariangel Ratia/.test(t), 'pestaña Hielo: estado del reporte de cubos y supervisor');
  ok(/7,930/.test(t) && /3,160 bolsas/.test(t), 'producción de cubos: 3,160 bolsas = 7,930 kg reales (1,600 × 3.25 + 1,560 × 1.75)');
  const emp = await P.evaluate(() => [...document.querySelectorAll('.ap table')].find(tb => /Total usadas/.test(tb.innerText)).innerText);
  ok(/Glacial\s+también para Tottus CD\s+3 kg\s+400/.test(emp) && /Glacial\s+1\.5 kg\s+960/.test(emp) && /Glacial\s+merma \(sin presentación\)\s+0\s+12\s+12/.test(emp), 'consumo de bolsas: Tottus envasado en bolsa Glacial cuenta como bolsa Glacial; la merma de bolsas va en su propia fila');
  ok(/Bobina/.test(t) && /Refrigerio/.test(t) && /M5 apagada/.test(t), 'mermas, paradas y observaciones');
  ok(/Vasos/.test(t) && /OXXO/.test(t) && /Finalizado/.test(t), 'vasos: su propio bloque (finalizado)');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: path.join(process.env.GLX_CAPTURAS, 'asistente-hielo.png'), fullPage: true });
  await P.evaluate(() => apHieloVista('CUBOS'));
  await P.waitForSelector('.vx-fondo, .vx-modal, [class*="vx"]', { timeout: 15000 }).catch(() => null);
  await P.waitForTimeout(800);
  const vx = await P.evaluate(() => document.body.innerText);
  ok(/REPORTE DIARIO DE PRODUCCIÓN/.test(vx) && /ENV\. AUTOMÁTICA/.test(vx) && /TOLVA MANUAL/.test(vx) && /bolsa Glacial/.test(vx), 'vista previa Excel: el Reporte diario de Hielo (por estación, con la bolsa usada)');
  // 25/11/2026: las gráficas van DEBAJO de la tabla (antes la vista previa las ponía encima de las filas)
  await P.waitForTimeout(300);
  const pos = await P.evaluate(() => {
    const img = document.querySelector('#vxl img.vxl-img'), filas = [...document.querySelectorAll('#vxl tbody > tr')];
    const merma = filas.filter(tr => /Bolsas\s+Glacial/.test(tr.innerText)).pop();
    if (!img || !merma) return null;
    const a = document.querySelector('#vxl .vxl-area'); a.scrollTop = img.offsetTop - 60;
    return { img: img.offsetTop, fin: merma.closest('table').offsetTop + merma.offsetTop + merma.offsetHeight };
  });
  ok(pos && pos.img >= pos.fin - 2, 'vista previa: las gráficas quedan debajo de la tabla y de la merma' + (pos ? ' (' + pos.img + ' ≥ ' + pos.fin + ')' : ''));
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: path.join(process.env.GLX_CAPTURAS, 'asistente-hielo-excel.png') });
  const errores = D.errores.filter(e => !/Guardado de|Error guardando/.test(e));
  ok(errores.length === 0, 'sin errores en la página' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
