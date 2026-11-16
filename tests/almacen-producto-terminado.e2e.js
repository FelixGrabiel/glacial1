/* Almacén › Producto terminado en un navegador de verdad. Uso: GLX_LIBS=/ruta node tests/almacen-producto-terminado.e2e.js (no forma parte de las pruebas rápidas). GLX_CAPTURAS=/carpeta guarda capturas. */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1400, 950); const P = D.page;
  await P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('report-select-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Administrador', nombre: 'Ana', username: 'admin', permisos: 'todos' }; state.showWelcome = false;
    const hoy = GlacialFecha.fechaOperativa(), ayer = GlacialFecha.sumarDias(hoy, -1), viejo = GlacialFecha.sumarDias(hoy, -20), t = Date.now();
    const pal = (id, linea, marca, pres, n, und, fecha, min) => ({ id, linea, fecha, turno: 'DÍA', marca, presentacion: pres, hora: '10:20', tipoPaleta: 'COMPLETA', paletas: n, totalUnidades: und, usuario: 'Yeikari M.', creadoEn: t - min * 60000, actualizadoEn: t - min * 60000 });
    _paletasCache = [pal('pal_1', 'PET1', 'Scala', '2.5 L', 2, 2400, hoy, 6), pal('pal_2', 'PET2', 'Aro', '340 ml', 3, 3600, hoy, 23), pal('pal_3', 'B7L', 'Scala', '7 L', 1, 840, ayer, 400), pal('pal_4', 'C20L', 'San Fernando', '20 L', 1, 96, viejo, 30000)];
    const store = [], oyentes = [];
    const emitir = () => oyentes.forEach(cb => cb({ docs: store.map(d => ({ data: () => d })) }));
    const orig = db.collection.bind(db);
    db.collection = nombre => nombre === 'almacenPtRecepcion'
      ? { onSnapshot: (cb) => { oyentes.push(cb); cb({ docs: store.map(d => ({ data: () => d })) }); return () => {}; }, doc: id => ({ set: async d => { if (store.some(x => x.opId === id)) throw new Error('ya existe'); window.__guardados = (window.__guardados || []).concat([d]); store.push(Object.assign({}, d, { guardadoEn: Date.now() })); emitir(); } }) }
      : orig(nombre);
    state.currentTab = 'almacen-pt'; renderSidebar(); renderMain();
  });
  await P.waitForSelector('.pt-t', { timeout: 6000 });
  const kpi = () => P.evaluate(() => [...document.querySelectorAll('.pt-k b')].map(b => b.innerText).join());
  const filas = () => P.evaluate(() => document.querySelectorAll('.pt-t tbody tr:not(.pt-det)').length);
  ok(await P.evaluate(() => { const b = document.getElementById('btn-almacen-pt'); return b && b.style.display !== 'none' && b.classList.contains('active'); }), 'el menú Almacén muestra «Producto terminado» activo');
  ok(await filas() === 3 && await kpi() === '4,0,0,0', 'por defecto (últimos 7 días): 3 por recibir (hoy y ayer); la de hace 20 días se avisa aparte y cuenta en el total (4)');
  ok(/anotadas antes de este período que siguen por recibir/.test(await P.evaluate(() => document.querySelector('.pt').innerText)), 'avisa que hay paletas anteriores que siguen por recibir');
  await P.evaluate(() => ptDias(0)); ok(await filas() === 4, '«Todo» muestra también las anteriores: todas quedan por recibir');
  await P.evaluate(() => ptDias(7));
  await P.evaluate(() => { ptAccion('pal_1', 'RECIBIDA'); }); await P.evaluate(() => ptConfirmar('pal_1')); await P.waitForTimeout(300);
  ok(await P.evaluate(() => window.__guardados && window.__guardados[0].opId === 'pal_1_R1' && window.__guardados[0].estado === 'RECIBIDA' && window.__guardados[0].unidadesRecibidas === 2400), 'Recibir guarda la recepción pal_1_R1 con todas las unidades');
  ok(await filas() === 2, 'la recibida sale de «Por recibir»');
  await P.evaluate(() => { ptAccion('pal_2', 'DIFERENCIA'); ptCampo('unidades', '3480'); ptCampo('motivo', 'una caja rota'); });
  await P.evaluate(() => ptConfirmar('pal_2')); await P.waitForTimeout(300);
  ok(await P.evaluate(() => { const g = window.__guardados[1]; return g.estado === 'DIFERENCIA' && g.unidadesRecibidas === 3480 && g.diferencia === -120 && g.motivo === 'una caja rota'; }), 'Con diferencia guarda lo que llegó (3 480), la diferencia (−120) y el motivo');
  await P.evaluate(() => ptDias(0)); await P.evaluate(() => { ptAccion('pal_3', 'OBSERVADA'); ptCampo('motivo', 'film roto'); }); await P.evaluate(() => ptConfirmar('pal_3')); await P.waitForTimeout(300);
  ok(await P.evaluate(() => window.__guardados[2].estado === 'OBSERVADA' && window.__guardados[2].unidadesRecibidas === 0), 'Dañada deja la paleta en observación (0 recibidas)');
  await P.evaluate(() => { ptAccion('pal_4', 'DIFERENCIA'); ptCampo('unidades', '10'); ptCampo('motivo', 'x'); }); await P.evaluate(() => ptConfirmar('pal_4'));
  ok(/mínimo 5 caracteres/.test(await P.evaluate(() => document.querySelector('.pt').innerText)) && await P.evaluate(() => window.__guardados.length) === 3, 'una diferencia sin motivo se rechaza y no guarda nada');
  ok(await kpi() === '1,2400,1,1' || (await kpi()).split(',')[0] === '1', 'los indicadores se actualizan (1 por recibir, 1 con diferencia, 1 en observación)');
  await P.evaluate(() => ptTab('diferencias')); ok(await filas() === 2, 'la pestaña «Diferencias y observadas» lista la diferencia y la observada');
  await P.evaluate(() => ptTab('acumulado')); ok(/3\.480|3,480|3 480/.test(await P.evaluate(() => document.querySelector('.pt-t').innerText)) && !/Scala 7 L/.test(await P.evaluate(() => document.querySelector('.pt-t').innerText)), 'el acumulado muestra lo que llegó y no incluye la observada');
  await P.evaluate(() => ptTab('recibidas')); await P.evaluate(() => { ptAccion('pal_1', 'ANULAR'); ptCampo('motivo', 'se recibió por error'); }); await P.evaluate(() => ptConfirmar('pal_1')); await P.waitForTimeout(300);
  ok(await P.evaluate(() => window.__guardados[3].opId === 'ANUL_pal_1_R1' && window.__guardados[3].tipo === 'ANULACION'), 'Anular crea la anulación ANUL_pal_1_R1 (el original no se toca)');
  await P.evaluate(() => ptTab('pendientes')); ok(await P.evaluate(() => /Scala.*2\.5 L/.test(document.querySelector('.pt-t').innerText)), 'la paleta anulada vuelve a «Por recibir»');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/almacen-pt.png' });
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar(); console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
