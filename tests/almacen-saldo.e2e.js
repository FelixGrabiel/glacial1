/* Saldo incompleto: el supervisor lo entrega (Paletas) y Almacén lo cuenta en paquetes (Producto terminado); deben coincidir exacto. Uso: GLX_LIBS=/ruta node tests/almacen-saldo.e2e.js. GLX_CAPTURAS=/carpeta guarda capturas. */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1300, 1000); const P = D.page;
  await P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Administrador', nombre: 'Ana', username: 'admin', permisos: 'todos' }; state.showWelcome = false;
    const hoy = GlacialFecha.fechaOperativa(); window.__hoy = hoy;
    const reg = (id, n, und, min, extra) => Object.assign({ id, linea: 'B7L', fecha: hoy, turno: 'DÍA', marca: 'Scala', presentacion: '7 Litros', hora: '10:20', tipoPaleta: 'COMPLETA', paletas: n, totalUnidades: und, usuario: 'Sup', creadoEn: Date.now() - min * 60000, actualizadoEn: Date.now() - min * 60000 }, extra || {});
    // 28 paletas completas acumuladas y un saldo de 7 paquetes (1 paquete = 2 bidones = 14 UND)
    _paletasCache = [reg('a1', 28, 3528, 10), reg('s1', 1, 14, 9, { tipoPaleta: 'INCOMPLETA', paquetesIncompleta: 7, unidadesIncompleta: 14 })];
    const store = { almacenPtRecepcion: [], almacenPtSaldoEntrega: [] }, oy = { almacenPtRecepcion: [], almacenPtSaldoEntrega: [] };
    window.__w = [];
    const emitir = n => oy[n].forEach(cb => cb({ docs: store[n].map(d => ({ data: () => d })) }));
    const orig = db.collection.bind(db);
    db.collection = n => store[n] ? ({ onSnapshot: cb => { oy[n].push(cb); cb({ docs: store[n].map(d => ({ data: () => d })) }); return () => {}; }, doc: id => ({ set: async d => { window.__w.push({ n, d }); store[n].push(Object.assign({}, d, { guardadoEn: Date.now() })); emitir(n); } }) }) : orig(n);
    selectLine('B7L');
  });
  await P.waitForTimeout(600);
  await P.evaluate(() => setTab('paletas')); await P.waitForSelector('#pt-saldo-panel');
  const panel = () => P.evaluate(() => document.getElementById('pt-saldo-panel').innerText.replace(/\s+/g, ' '));
  // ---- el supervisor entrega ----
  let t = await panel();
  ok(/Saldos por entregar a Almacén/.test(t) && /Saldo en línea: 7 paquetes \(14 UND\)/.test(t) && /Entregar saldo a Almacén/.test(t), 'Paletas muestra «Saldos por entregar a Almacén» con el saldo en línea: 7 paquetes (14 UND)');
  await P.evaluate(() => slEntregar(document.querySelector('#pt-saldo-panel button.btn-primary').closest('div[style*="border"]') ? glacialSaldoEntrega.items()[0].id : ''));
  ok(await P.evaluate(() => document.querySelector('#pt-saldo-panel input').value) === '7', 'el formulario de entrega ya viene lleno con el saldo anotado (7 paquetes)');
  ok(/= 14 UND/.test(await panel()), 'convierte a UND mientras se escribe (= 14 UND)');
  await P.evaluate(() => slConfirmar(glacialSaldoEntrega.items()[0].id)); await P.waitForTimeout(300);
  const ent = await P.evaluate(() => window.__w.find(x => x.n === 'almacenPtSaldoEntrega').d);
  ok(ent.tipo === 'ENTREGA' && ent.unidades === 14 && ent.paquetes === 7 && ent.factor === 2 && /_E1$/.test(ent.opId) && ent.linea === 'B7L', 'la entrega se guarda: 7 paquetes, 14 UND, equivalencia 2');
  ok(/Entregado a Almacén: 7 paquetes \(14 UND\)/.test(await panel()) && /esperando el conteo de Almacén/.test(await panel()), 'queda «entregado, esperando el conteo de Almacén»');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/saldo-supervisor.png' });
  // ---- Almacén cuenta a ciegas ----
  await P.evaluate(() => { glacialAlmacenPT.estado.inicio = '2000-01-01'; goAlmacenPT(); }); await P.waitForSelector('.pt');
  const alm = () => P.evaluate(() => document.querySelector('.pt').innerText.replace(/\s+/g, ' '));
  t = await alm();
  ok(/Saldos incompletos por contar/i.test(t) && /Scala 7 Litros/.test(t) && /Entregado por el supervisor/.test(t) && /Contar y recibir/.test(t), 'Almacén ve el saldo «entregado por el supervisor» en Por recibir, con «Contar y recibir»');
  const bloque = await P.evaluate(() => [...document.querySelectorAll('.pt-card')].find(c => /Saldos incompletos por contar/i.test(c.innerText)).innerText);
  ok(!/14 UND|7 paquetes|\b14\b/.test(bloque), 'a ciegas: Almacén NO ve la cifra del supervisor (ni 7 paquetes ni 14 UND) antes de contar');
  ok(/Saldos por contar\s*1\b/i.test(await P.evaluate(() => document.querySelector('.pt-ks').innerText.replace(/\s+/g, ' '))), 'el indicador «Saldos por contar» marca 1');
  const idS = await P.evaluate(() => glacialAlmacenPTNucleo.saldos(_paletasCache, glacialAlmacenPT.estado.recs, glacialAlmacenPT.estado.entregas, '', glacialEquivalenciaSaldo)[0].id);
  await P.evaluate(id => ptSaldo(id), idS);
  await P.evaluate(() => ptCantidad('6'));
  ok(/= 12 UND/.test(await P.evaluate(() => document.getElementById('pt-conv').innerText)), 'Almacén escribe paquetes y el sistema los convierte a UND (6 → 12 UND)');
  await P.evaluate(id => ptSaldoConfirmar(id), idS); await P.waitForTimeout(300);
  const c1 = await P.evaluate(() => window.__w.filter(x => x.n === 'almacenPtRecepcion').pop().d);
  ok(c1.esSaldo === true && c1.paquetes === 6 && c1.unidadesRecibidas === 12 && c1.estado === 'RECIBIDA' && !('unidades' in c1), 'el conteo se guarda como recepción de saldo: 6 paquetes = 12 UND, sin la cifra del supervisor');
  await P.evaluate(() => ptTab('saldos'));
  t = await alm();
  ok(/Con diferencia/.test(t) && /7 paquetes \(14 UND\)/.test(t) && /6 paquetes \(12 UND\)/.test(t), 'con 6 contra 7 queda CON DIFERENCIA y ahora sí se ven las dos cifras');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/saldo-diferencia.png' });
  // ---- el supervisor ve la diferencia ----
  await P.evaluate(() => { setTab('paletas'); });
  await P.waitForSelector('#pt-saldo-panel');
  ok(/Con diferencia/.test(await panel()) && /entregaste 7 paquetes \(14 UND\)/.test(await panel()) && /Almacén contó 6 paquetes \(12 UND\)/.test(await panel()), 'el supervisor ve la diferencia: entregó 7 y Almacén contó 6');
  // ---- corrigen juntos: Almacén anula su conteo y recuenta ----
  await P.evaluate(() => goAlmacenPT()); await P.waitForSelector('.pt');
  await P.evaluate(() => ptTab('saldos'));
  const opS = await P.evaluate(() => glacialAlmacenPT.estado.recs.find(r => r.esSaldo).opId);
  await P.evaluate(id => { ptAccion(id, 'ANULAR'); ptCampo('motivo', 'recontamos con el supervisor'); }, opS); await P.evaluate(id => ptConfirmar(id), opS); await P.waitForTimeout(300);
  ok(await P.evaluate(() => window.__w.filter(x => x.n === 'almacenPtRecepcion').pop().d.tipo) === 'ANULACION', 'Almacén anula su conteo con motivo');
  ok(/Entregado por el supervisor/.test(await alm()) && /Contar y recibir/.test(await alm()), 'el saldo vuelve a «por contar»');
  await P.evaluate(id => ptSaldo(id), idS); await P.evaluate(() => ptCantidad('7')); await P.evaluate(id => ptSaldoConfirmar(id), idS); await P.waitForTimeout(300);
  t = await alm();
  ok(/Conforme/.test(t) && !/Con diferencia ·/.test(t), 'recontado: 7 paquetes = 7 paquetes → CONFORME');
  const resumen = await P.evaluate(() => glacialAlmacenPTNucleo.resumenSaldos(glacialAlmacenPTNucleo.saldos(_paletasCache, glacialAlmacenPT.estado.recs, glacialAlmacenPT.estado.entregas, '', glacialEquivalenciaSaldo)));
  ok(resumen.conformes === 1 && resumen.diferencias === 0 && resumen.porContar === 0, 'resumen: 1 conforme, 0 diferencias, 0 por contar');
  await P.evaluate(() => ptTab('recibidas'));
  ok(/7 paquetes/.test(await alm()) && /saldo incompleto/.test(await alm()), 'el saldo contado aparece en Recibidas como «7 paquetes · saldo incompleto»');
  await P.evaluate(() => ptTab('acumulado'));
  ok(/14/.test(await P.evaluate(() => document.querySelector('.pt-t').innerText)), 'el acumulado recibido suma 14 UND del saldo');
  // ---- vuelve al supervisor: conforme ----
  await P.evaluate(() => setTab('paletas')); await P.waitForSelector('#pt-saldo-panel');
  ok(/Conforme/.test(await panel()), 'el supervisor ve «Conforme»');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/saldo-conforme.png' });
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar(); console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
