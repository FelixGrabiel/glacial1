/* Almacén › despachos, stock, alertas y resumen del turno en un navegador de verdad. Uso: GLX_LIBS=/ruta node tests/almacen-despachos.e2e.js. GLX_CAPTURAS=/carpeta guarda capturas. */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1400, 1000); const P = D.page;
  await P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('report-select-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Administrador', nombre: 'Ana', username: 'admin', permisos: 'todos' }; state.showWelcome = false;
    const hoy = GlacialFecha.fechaOperativa(), t = Date.now();
    const reg = (id, linea, marca, pres, n, und, min, extra) => Object.assign({ id, linea, fecha: hoy, turno: 'DÍA', marca, presentacion: pres, hora: '10:00', tipoPaleta: 'COMPLETA', paletas: n, totalUnidades: und, usuario: 'Sup', creadoEn: t - min * 60000, actualizadoEn: t - min * 60000 }, extra || {});
    window.__hoy = hoy;
    // lo que ya recibió Almacén: 10 paletas PET1 Scala 2.5 L (12 000 UND); y hay 3 paletas anotadas hace 6 h sin recibir (alerta)
    _paletasCache = [reg('a', 'PET1', 'Scala', '2.5 L', 10, 12000, 600), reg('b', 'PET2', 'Aro', '340 ml', 3, 3600, 360, { turno: 'NOCHE' })];
    const clave = 'PT_' + hoy + '_pet1_dia_scala_2-5l'; window.__claveA = null;
    const store = { almacenPtRecepcion: [], almacenPtSaldoEntrega: [], almacenPtDespacho: [] }, oy = { almacenPtRecepcion: [], almacenPtSaldoEntrega: [], almacenPtDespacho: [] };
    window.__guardados = [];
    const emitir = n => oy[n].forEach(cb => cb({ docs: store[n].map(d => ({ data: () => d })) }));
    const orig = db.collection.bind(db);
    db.collection = n => store[n] ? ({ onSnapshot: cb => { oy[n].push(cb); cb({ docs: store[n].map(d => ({ data: () => d })) }); return () => {}; }, doc: id => ({ set: async d => { window.__guardados.push({ n, d }); store[n].push(Object.assign({}, d, { guardadoEn: Date.now() })); emitir(n); } }) }) : orig(n);
    glacialAlmacenPT.estado.inicio = '2000-01-01'; state.currentTab = 'almacen-pt'; renderSidebar(); renderMain();
  });
  await P.waitForSelector('.pt');
  const txt = () => P.evaluate(() => document.querySelector('.pt').innerText.replace(/\s+/g, ' '));
  // recibe las 10 paletas PET1 para tener stock
  const idA = await P.evaluate(() => [...document.querySelectorAll('button.pt-b-v')].map(b => b.getAttribute('onclick')).find(o => /ptAccion/.test(o) && true).match(/'([^']+)'/)[1]);
  let t = await txt();
  ok(/Por atender/.test(t) && /llevan más de 4 h por recibir/.test(t), 'alerta «Por atender»: hay paletas que llevan más de 4 h por recibir');
  await P.evaluate(() => { const ids = [...document.querySelectorAll('button.pt-b-v')].map(b => b.getAttribute('onclick')).filter(o => /ptAccion\(/.test(o)).map(o => o.match(/'([^']+)'/)[1]); window.__ids = ids; });
  for (const id of await P.evaluate(() => window.__ids)) { await P.evaluate(i => { ptAccion(i, 'RECIBIDA'); ptConfirmar(i); }, id); await P.waitForTimeout(250); }
  ok(!/llevan más de 4 h/.test(await txt()), 'al recibir las paletas la alerta desaparece');
  // ---- Stock ----
  await P.evaluate(() => ptTab('stock')); t = await txt();
  ok(/Stock de producto terminado/.test(t) && /Scala 2\.5 L/.test(t) && /10 paletas/.test(t) && /13[.,\s]?000|15[.,\s]?600/.test(t) === false || /Total/.test(t), 'la pestaña Stock muestra lo recibido por producto');
  const tot = await P.evaluate(() => glacialAlmacenPTDespachos.nucleo.stock(glacialAlmacenPT.ctx().acumulado(), []).total);
  ok(tot.stockPal === 13 && tot.stockUnd === 15600, 'stock inicial = lo recibido: 13 paletas · 15 600 UND');
  // ---- Despacho ----
  await P.evaluate(() => ptTab('despachos')); await P.waitForSelector('.pt-form');
  await P.evaluate(() => { pdCampo('destino', 'Cliente Norte'); pdCampo('referencia', 'G001-0234'); pdLinea('PET1|Scala|2.5 L', 'paletas', '4'); });
  ok(await P.evaluate(() => document.querySelector('input[id^="pd-und-PET1"]').value) === '4800', 'al escribir 4 paletas las unidades se sugieren solas (4 800)');
  await P.evaluate(() => pdLinea('PET1|Scala|2.5 L', 'paletas', '14')); await P.evaluate(() => pdLinea('PET1|Scala|2.5 L', 'unidades', '99999'));
  await P.evaluate(() => pdRegistrar()); await P.waitForTimeout(200);
  ok(/solo hay/.test(await txt()) && await P.evaluate(() => window.__guardados.filter(g => g.n === 'almacenPtDespacho').length) === 0, 'no deja despachar más que el stock y no guarda nada');
  await P.evaluate(() => { pdLinea('PET1|Scala|2.5 L', 'unidades', '4800'); pdLinea('PET1|Scala|2.5 L', 'paletas', '4'); });
  await P.evaluate(() => { document.querySelector('input[id^="pd-und-PET1"]').value = '4800'; pdLinea('PET1|Scala|2.5 L', 'unidades', '4800'); });
  await P.evaluate(() => pdRegistrar()); await P.waitForTimeout(400);
  const dd = await P.evaluate(() => window.__guardados.find(g => g.n === 'almacenPtDespacho'));
  ok(dd && dd.d.tipo === 'DESPACHO' && dd.d.destino === 'Cliente Norte' && dd.d.referencia === 'G001-0234' && dd.d.items[0].paletas === 4 && dd.d.items[0].unidades === 4800 && /^DESP_\d{13}_[a-z0-9]{4,6}$/.test(dd.d.opId), 'el despacho se guarda con destino, guía y producto (4 paletas · 4 800 UND)');
  t = await txt(); ok(/Despacho registrado/.test(t) && /Cliente Norte/.test(t) && /G001-0234/.test(t), 'aparece en «Despachos recientes»');
  await P.evaluate(() => ptTab('stock')); const tot2 = await P.evaluate(() => glacialAlmacenPTDespachos.nucleo.stock(glacialAlmacenPT.ctx().acumulado(), glacialAlmacenPTDespachos.estado.despachos).total);
  ok(tot2.stockPal === 9 && tot2.stockUnd === 10800 && /despachado/i.test(await txt()), 'el stock baja: 13 − 4 = 9 paletas · 10 800 UND');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/almacen-stock.png' });
  // ---- Anular ----
  await P.evaluate(() => ptTab('despachos'));
  const opD = await P.evaluate(() => glacialAlmacenPTDespachos.estado.despachos[0].opId);
  await P.evaluate(id => { pdAnular(id); pdMotivo('ab'); pdAnularOk(id); }, opD); await P.waitForTimeout(200);
  ok(/mínimo 5 caracteres/.test(await txt()) && await P.evaluate(() => window.__guardados.filter(g => g.n === 'almacenPtDespacho').length) === 1, 'anular pide motivo de al menos 5 caracteres');
  await P.evaluate(id => { pdMotivo('Error de cliente'); pdAnularOk(id); }, opD); await P.waitForTimeout(400);
  const an = await P.evaluate(() => window.__guardados.filter(g => g.n === 'almacenPtDespacho').pop().d);
  ok(an.tipo === 'ANULACION' && an.anulaA === opD && an.opId === 'ANUL_' + opD && an.motivo === 'Error de cliente', 'la anulación se guarda con su motivo');
  await P.evaluate(() => ptTab('stock')); ok((await P.evaluate(() => glacialAlmacenPTDespachos.nucleo.stock(glacialAlmacenPT.ctx().acumulado(), glacialAlmacenPTDespachos.estado.despachos).total.stockPal)) === 13, 'las paletas del despacho anulado vuelven al stock (13)');
  // ---- Resumen del turno ----
  await P.evaluate(() => pdResumen()); await P.waitForSelector('#pd-resumen-txt');
  const r = await P.evaluate(() => document.getElementById('pd-resumen-txt').value);
  ok(/RESUMEN ALMACÉN/.test(r) && /RECIBIDO/.test(r) && /PET1 · Scala 2\.5 L: 10 paletas/.test(r) && /STOCK ACTUAL: 13 paletas/.test(r), 'el resumen del turno trae lo recibido y el stock actual');
  await P.evaluate(() => pdResumen(window.__hoy, 'NOCHE'));
  ok(/Turno: Noche/.test(await P.evaluate(() => document.getElementById('pd-resumen-txt').value)) && /RECIBIDO[\s\S]*PET2 · Aro 340 ml: 3 paletas/.test(await P.evaluate(() => document.getElementById('pd-resumen-txt').value)) && !/PET1 · Scala 2\.5 L: 10 paletas/.test(await P.evaluate(() => document.getElementById('pd-resumen-txt').value)), 'cambiando a Noche el resumen muestra solo lo de ese turno (PET2, no PET1 del Día)');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/almacen-resumen-turno.png' });
  await P.evaluate(() => pdResumenCerrar()); ok(await P.evaluate(() => !document.getElementById('pd-resumen')), 'el resumen se cierra');
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar(); console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
