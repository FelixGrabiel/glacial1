/* Hielo · lote automático en el formulario de producción (27/11/2026). Uso: GLX_LIBS=/ruta node tests/hielo-lote.e2e.js  (GLX_CAPTURA=/ruta.png guarda la captura) */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1300, 950); const P = D.page;
  await P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Administrador', nombre: 'Admin', username: 'admin', permisos: 'todos' }; state.showWelcome = false;
    window.__hoy = GlacialFecha.fechaOperativa();
    goReporteHielo('CUBOS');
  });
  await P.waitForTimeout(1200);
  await P.evaluate(() => {
    const hoy = window.__hoy, d = glacialHieloDatos, servidor = {};
    const consulta = { get: async () => ({ docs: Object.values(servidor).map(x => ({ data: () => JSON.parse(JSON.stringify(x)) })) }), onSnapshot: () => () => {} };
    consulta.where = () => consulta; consulta.orderBy = () => consulta; consulta.limit = () => consulta;
    db.collection = c => Object.assign({ doc: id => ({ _id: id, _c: c }) }, consulta);
    Object.assign(db, { runTransaction: async fn => fn({ get: async ref => ({ exists: !!servidor[ref._id], data: () => JSON.parse(JSON.stringify(servidor[ref._id])) }), set: (ref, doc) => { servidor[ref._id] = JSON.parse(JSON.stringify(doc)); } }) });
    window.__servidor = servidor;
    d.cache.reportes = []; d.cache.listo = { reportes: true, programacion: true, config: true };
    hlAbrir(hoy, 'DÍA');
    hlCampo('produccion', 0, 'presentacion', '3 kg');
  });
  await P.waitForSelector('.hl-ed');
  const esperado = await P.evaluate(() => { const L = glacialLoteHielo; return '2' + '1' + '1' + L.semana(window.__hoy) + L.juliano(window.__hoy); });
  await P.evaluate(() => { hlCampo('produccion', 0, 'marca', 'Glacial'); hlCampo('produccion', 0, 'estacion', 'Tolva manual'); });
  ok(await P.evaluate(() => document.getElementById('hl-lote-0').value === '' && /producción/.test(document.getElementById('hl-lote-0').title)), 'sin bolsas todavía no hay lote (sale al registrar producción)');
  await P.fill('input[aria-label="Bolsas"]', '300');
  await P.waitForTimeout(100);
  ok(await P.evaluate(() => document.getElementById('hl-lote-0').value) === esperado && await P.evaluate(() => document.getElementById('hl-lote-0').readOnly), 'al poner las bolsas, el lote sale solo y no se edita: ' + esperado);
  const venceEsperado = await P.evaluate(() => glacialLoteHielo.vencimientoHielo({ marca: 'Glacial', fecha: window.__hoy, turno: 'DÍA', meses: 12 }).vence);
  ok(await P.evaluate(() => { const v = document.getElementById('hl-vence-0'); return v && v.readOnly ? v.value : ''; }) === venceEsperado, 'el vencimiento sale solo (fecha + 12 meses) y no se edita: ' + venceEsperado);
  await P.evaluate(() => { hlCampo('produccion', 0, 'estacion', 'Env. automática'); });
  ok(await P.evaluate(() => document.getElementById('hl-lote-0').value) === esperado.slice(0, 2) + '3' + esperado.slice(3), 'al cambiar a envasadora automática, la máquina pasa a 3');
  // Molitalia: lote a mano obligatorio
  await P.evaluate(() => { hlAgregar('produccion'); hlCampo('produccion', 1, 'presentacion', '3 kg'); hlCampo('produccion', 1, 'marca', 'Molitalia'); hlCampo('produccion', 1, 'estacion', 'Tolva manual'); hlCampo('produccion', 1, 'bolsas', '50'); hlVista('registro'); });
  await P.waitForTimeout(200);
  ok(await P.evaluate(() => { const i = document.querySelectorAll('.hl-ed input[aria-label="Lote del producto"]'); return i.length === 1 && !i[0].readOnly && /obligatorio/.test(i[0].placeholder); }), 'Molitalia: casilla de lote a mano («a mano (obligatorio)»)');
  if (process.env.GLX_CAPTURA) await (await P.$('.hl-prodtab')).screenshot({ path: process.env.GLX_CAPTURA });
  const fin = await P.evaluate(async () => { await hlGuardar('FINALIZAR'); return (document.querySelector('.hl-msg') || {}).innerText || ''; });
  ok(/escribe el lote de Molitalia \(obligatorio\)/.test(fin), 'finalizar sin el lote de Molitalia: lo pide');
  await P.fill('.hl-ed input[aria-label="Lote del producto"]', 'MOL2611');
  const r = await P.evaluate(async () => { await hlGuardar('GUARDAR'); return window.__servidor[window.__hoy + '_DÍA']; });
  ok(r && r.produccion[0].lote === esperado.slice(0, 2) + '3' + esperado.slice(3) && r.produccion[1].lote === 'MOL2611', 'se guardan el lote automático y el escrito a mano');
  ok(r.produccion[0].vence === venceEsperado && await P.evaluate(() => { const i = [...document.querySelectorAll('.hl-ed input[aria-label="Fecha de vencimiento"]')]; return i.length === 1 && !i[0].readOnly; }), 'se guarda el vencimiento automático; Molitalia tiene su fecha de vencimiento a mano');
  await P.setViewportSize({ width: 390, height: 800 });
  await P.waitForTimeout(300);
  ok(await P.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'celular: sin desborde lateral');
  const errores = D.errores.filter(e => !/Guardado de|Error guardando/.test(e));
  ok(errores.length === 0, 'sin errores en la página' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
