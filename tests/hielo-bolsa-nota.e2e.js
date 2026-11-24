/* Hielo · «Bolsa usada» y «Nota» en el formulario de producción (24/11/2026): se eligen en pantalla, se guardan y salen en el avance.
   Uso: GLX_LIBS=/ruta node tests/hielo-bolsa-nota.e2e.js   (GLX_CAPTURA=/ruta.png guarda una captura del formulario) */
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
  await P.evaluate(() => { hlCampo('produccion', 0, 'marca', 'Tottus CD'); hlCampo('produccion', 0, 'estacion', 'Tolva manual'); hlCampo('produccion', 0, 'bolsas', '400'); });
  const sel = 'select[aria-label="Bolsa usada"]';
  ok(await P.evaluate(s => document.querySelector(s).value, sel) === 'Tottus CD', 'la «Bolsa usada» viene con la misma marca');
  await P.selectOption(sel, 'Glacial');
  await P.fill('input[aria-label="Nota de la producción"]', 'Se acabó la bolsa Tottus 10:30');
  if (process.env.GLX_CAPTURA) await (await P.$('.hl-prodtab')).screenshot({ path: process.env.GLX_CAPTURA });
  const r = await P.evaluate(async () => { await hlGuardar('GUARDAR'); return window.__servidor[window.__hoy + '_DÍA']; });
  ok(r && r.produccion[0].bolsa === 'Glacial' && r.produccion[0].nota === 'Se acabó la bolsa Tottus 10:30' && r.produccion[0].marca === 'Tottus CD', 'se guarda la bolsa Glacial y la nota en la fila de Tottus CD');
  await P.evaluate(() => hlVista('avance'));
  await P.waitForSelector('#hl-av-texto');
  const t = await P.evaluate(() => document.getElementById('hl-av-texto').value);
  ok(/Tottus CD 3kg \(bolsa Glacial\): 400/.test(t) && /↳ Se acabó la bolsa Tottus 10:30/.test(t), 'el avance muestra la bolsa y la nota');
  // Celular: el formulario no se desborda
  await P.setViewportSize({ width: 390, height: 800 });
  await P.evaluate(() => hlVista('registro'));
  await P.waitForTimeout(400);
  ok(await P.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'celular: sin desborde lateral');
  const errores = D.errores.filter(e => !/Guardado de|Error guardando/.test(e));
  ok(errores.length === 0, 'sin errores en la página' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
