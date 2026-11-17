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
    const hoy = GlacialFecha.fechaOperativa(), ayer = GlacialFecha.sumarDias(hoy, -1), t = Date.now();
    const reg = (id, linea, marca, pres, n, und, fecha, min, extra) => Object.assign({ id, linea, fecha, turno: 'DÍA', marca, presentacion: pres, hora: '10:20', tipoPaleta: 'COMPLETA', paletas: n, totalUnidades: und, usuario: 'Yeikari M.', creadoEn: t - min * 60000, actualizadoEn: t - min * 60000 }, extra || {});
    window.__reg = reg; window.__t = t;
    // Producción anota ACUMULADOS: B7L Scala 7 L = 6, 10, 15 y luego 28 paletas acumuladas (+ saldos); PET1 y PET2 con un registro cada una
    _paletasCache = [reg('a1', 'B7L', 'Scala', '7 Litros', 6, 756, hoy, 300), reg('s1', 'B7L', 'Scala', '7 Litros', 1, 10, hoy, 299, { tipoPaleta: 'INCOMPLETA' }), reg('a2', 'B7L', 'Scala', '7 Litros', 10, 1260, hoy, 240), reg('a3', 'B7L', 'Scala', '7 Litros', 15, 1890, hoy, 120), reg('s3', 'B7L', 'Scala', '7 Litros', 1, 90, hoy, 119, { tipoPaleta: 'INCOMPLETA' }), reg('a4', 'B7L', 'Scala', '7 Litros', 28, 3528, hoy, 10),
      reg('p1', 'PET1', 'Scala', '2.5 L', 2, 2400, hoy, 6), reg('p2', 'PET2', 'Aro', '340 ml', 3, 3600, hoy, 23), reg('v1', 'C20L', 'San Fernando', '20 L', 1, 96, ayer, 400)];
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
  const texto = () => P.evaluate(() => document.querySelector('.pt').innerText.replace(/\s+/g, ' '));
  ok(await P.evaluate(() => { const b = document.getElementById('btn-almacen-pt'); return b && b.style.display !== 'none' && b.classList.contains('active'); }), 'el menú Almacén muestra «Producto terminado» activo');
  // la fecha de inicio real se prueba aparte; aquí se abre la ventana para no depender del calendario
  ok(await P.evaluate(() => glacialAlmacenPT.estado.inicio) === '2026-11-16', 'el producto terminado cuenta desde el 16/11/2026');
  await P.evaluate(() => { glacialAlmacenPT.estado.inicio = '2000-01-01'; glacialAlmacenPT.repintar(); });
  // ---- el caso real: 6, 10, 15, 28 acumuladas = 28 paletas, no 59 ----
  const t0 = await texto();
  ok(/B7L · Scala 7 Litros/.test(t0) && /28 paletas/.test(t0) && !/59 paletas/.test(t0), 'B7L Scala 7 L: Producción lleva 28 paletas acumuladas y Almacén ve 28 (no 59)');
  ok(/^34 paletas,/.test(await kpi()), 'el indicador «Por recibir» suma 28 (B7L) + 2 + 3 + 1 de ayer = 34 paletas');
  ok(/saldos incompletos por contar/i.test(t0) && !/90 UND/.test(t0) && /Saldo en línea/.test(t0), 'el saldo incompleto va aparte («Saldos incompletos por contar», sin mostrar su cifra a Almacén) y no se suma a las paletas');
  ok(/Producción lleva 28 paletas, ya recibidas 0/.test(t0), 'cada fila dice cuánto lleva Producción y cuánto se recibió ya');
  const grupos = await P.evaluate(() => [...document.querySelectorAll('.pt-grp')].map(g => g.querySelector('.pt-grp-c').innerText.replace(/\s+/g, ' ')));
  ok(grupos.length === 4, 'agrupado por línea y producto: 4 bloques (B7L, PET1, PET2 y el de ayer) (' + grupos.length + ')');
  // ---- recibir el tramo: a las 10:03 eran 10; se recibe 10 y luego 18 ----
  await P.evaluate(() => { const hoy = GlacialFecha.fechaOperativa(); const t = window.__t, reg = window.__reg; const antes = _paletasCache; window.__completo = antes; _paletasCache = antes.filter(r => !(r.id === 'a3' || r.id === 's3' || r.id === 'a4')); glacialAlmacenPT.repintar(); });
  ok(/10 paletas/.test(await texto()) && !/28 paletas/.test(await texto()), 'si Producción lleva 10 acumuladas, hay 10 por recibir');
  const idB7 = await P.evaluate(() => [...document.querySelectorAll('.pt-t tbody tr')].map(tr => tr.querySelector('button.pt-b-v')).find(b => b && /B7L/.test(b.closest('tr').innerText)).getAttribute('onclick').match(/'([^']+)'/)[1]);
  await P.evaluate(id => ptAccion(id, 'RECIBIDA'), idB7); await P.evaluate(id => ptConfirmar(id), idB7); await P.waitForTimeout(300);
  const r1 = await P.evaluate(() => window.__guardados[0]);
  ok(r1.opId === idB7 + '_R1' && r1.paletasAnotadas === 10 && r1.unidadesAnotadas === 1260 && r1.unidadesRecibidas === 1260 && r1.estado === 'RECIBIDA', 'recibir guarda el tramo: 10 paletas y 1 260 UND');
  ok(!/B7L · Scala 7 Litros/.test(await texto()) || !/Por recibir/.test((await P.evaluate(() => [...document.querySelectorAll('.pt-grp-c')].find(g => /B7L/.test(g.innerText)) ? 'x' : '')) || ''), 'con lo recibido al día, B7L ya no aparece por recibir');
  await P.evaluate(() => { _paletasCache = window.__completo; glacialAlmacenPT.repintar(); });
  const t1 = await texto();
  ok(/18 paletas/.test(t1) && /Producción lleva 28 paletas, ya recibidas 10/.test(t1) && !/59 paletas/.test(t1), 'cuando Producción llega a 28 acumuladas faltan 18 (28 − 10 ya recibidas)');
  await P.evaluate(id => { ptAccion(id, 'RECIBIDA'); }, idB7); await P.evaluate(id => ptConfirmar(id), idB7); await P.waitForTimeout(300);
  const r2 = await P.evaluate(() => window.__guardados[1]);
  ok(r2.opId === idB7 + '_R2' && r2.paletasAnotadas === 18 && r2.unidadesAnotadas === 2268, 'la segunda recepción cubre las 18 paletas que faltaban (2 268 UND)');
  ok(/^6 paletas,/.test(await kpi()), 'quedan por recibir PET1 (2), PET2 (3) y lo de ayer (1) = 6 paletas');
  // ---- recibidas, acumulado ----
  await P.evaluate(() => { ptTab('recibidas'); });
  ok(await filas() === 2 && /28 paletas|10 paletas/.test(await texto()), 'Recibidas lista las 2 recepciones de B7L (10 y 18)');
  await P.evaluate(() => ptTab('acumulado'));
  ok(/B7L/.test(await P.evaluate(() => document.querySelector('.pt-t').innerText)) && /3[,.\s]?528/.test(await P.evaluate(() => document.querySelector('.pt-t').innerText)), 'el acumulado recibido de B7L es 28 paletas · 3 528 UND');
  // ---- diferencia, observada, anular ----
  await P.evaluate(() => ptTab('pendientes'));
  const idP1 = await P.evaluate(() => [...document.querySelectorAll('.pt-t tbody tr')].map(tr => tr.querySelector('button.pt-b-r')).find(b => b && /PET1/.test(b.closest('tr').innerText)).getAttribute('onclick').match(/'([^']+)'/)[1]);
  await P.evaluate(id => { ptAccion(id, 'DIFERENCIA'); ptCampo('unidades', '2280'); ptCampo('motivo', 'una caja rota'); }, idP1); await P.evaluate(id => ptConfirmar(id), idP1); await P.waitForTimeout(300);
  const r3 = await P.evaluate(() => window.__guardados[2]);
  ok(r3.estado === 'DIFERENCIA' && r3.unidadesRecibidas === 2280 && r3.diferencia === -120 && r3.motivo === 'una caja rota', 'Con diferencia guarda lo que llegó (2 280), la diferencia (−120) y el motivo');
  const idP2 = await P.evaluate(() => [...document.querySelectorAll('.pt-t tbody tr')].map(tr => tr.querySelector('button.pt-b-o')).find(b => b && /PET2/.test(b.closest('tr').innerText)).getAttribute('onclick').match(/'([^']+)'/)[1]);
  await P.evaluate(id => { ptAccion(id, 'OBSERVADA'); ptCampo('motivo', 'film roto'); }, idP2); await P.evaluate(id => ptConfirmar(id), idP2); await P.waitForTimeout(300);
  ok(await P.evaluate(() => window.__guardados[3].estado === 'OBSERVADA' && window.__guardados[3].unidadesRecibidas === 0), 'Dañada deja el tramo en observación (0 recibidas)');
  ok(/^1 paleta,/.test(await kpi()), 'de hoy ya no queda nada: solo la paleta de ayer');
  await P.evaluate(() => ptTab('diferencias')); ok(await filas() === 2, '«Diferencias y observadas» lista la diferencia y la observada');
  await P.evaluate(() => { ptTab('recibidas'); ptAccion(window.__guardados[0].opId, 'ANULAR'); ptCampo('motivo', 'se recibió por error'); }); await P.evaluate(() => ptConfirmar(window.__guardados[0].opId)); await P.waitForTimeout(300);
  const an = await P.evaluate(() => window.__guardados[4]);
  ok(an.tipo === 'ANULACION' && an.anulaA === idB7 + '_R1' && an.paletaId === idB7, 'anular guarda un documento de anulación que apunta a la recepción');
  await P.evaluate(() => ptTab('pendientes'));
  ok(/10 paletas/.test(await texto()) && /ya recibidas 18/.test(await texto()), 'al anular la recepción de 10, esas 10 paletas vuelven a «Por recibir»');
  // ---- unidad y Recibir todo ----
  await P.evaluate(() => ptUnidad('und'));
  ok(/^\d[\d,.]* UND/.test(await kpi()), 'con «Unidades» la cifra principal está en UND');
  await P.evaluate(() => ptUnidad('paletas'));
  await P.evaluate(() => { const hoy = GlacialFecha.fechaOperativa(), reg = window.__reg; _paletasCache = [reg('g1', 'PET1', 'Frutal', '1 L', 4, 480, hoy, 5), reg('g2', 'PET1', 'Frutal', '1 L', 3, 360, hoy, 4, { turno: 'NOCHE' }), reg('g3', 'PET2', 'Aro', '500 ml', 2, 300, hoy, 3)]; glacialAlmacenPT.estado.dias = 1; glacialAlmacenPT.repintar(); });
  ok(/^9 paletas,/.test(await kpi()), 'turnos distintos acumulan por separado: PET1 4 + 3 y PET2 2 = 9 paletas');
  const antes = await P.evaluate(() => window.__guardados.length);
  await P.evaluate(() => ptGrupo(document.querySelector('.pt-grp button[data-k]').dataset.k));
  ok(/Confirmas que llegaron las 7 paletas/.test(await P.evaluate(() => document.querySelector('.pt-grp .pt-form').innerText)) && await P.evaluate(() => window.__guardados.length) === antes, '«Recibir todo» de PET1 Frutal pide confirmación (7 paletas) antes de guardar');
  await P.evaluate(() => ptGrupoConfirmar()); await P.waitForTimeout(600);
  ok(await P.evaluate(n => window.__guardados.length - n, antes) === 2 && /Recibidas 7 paletas/.test(await P.evaluate(() => document.querySelector('.pt-msg-k').innerText)), 'Recibir todo guarda una recepción por turno y avisa «Recibidas 7 paletas»');
  if (process.env.GLX_CAPTURAS) { await P.screenshot({ path: process.env.GLX_CAPTURAS + '/almacen-por-recibir.png' }); }
  // ---- filtro por TURNO: Día / Noche ----
  await P.evaluate(() => { const hoy = GlacialFecha.fechaOperativa(), reg = window.__reg; _paletasCache = [reg('d1', 'PET1', 'Cielo', '2 L', 4, 480, hoy, 5), reg('n1', 'PET1', 'Cielo', '2 L', 3, 360, hoy, 4, { turno: 'NOCHE' }), reg('i1', 'PET2', 'Mar', '600 ml', 2, 300, hoy, 3, { turno: 'INTERMEDIO' })]; glacialAlmacenPT.estado.dias = 1; ptTurno('TODOS'); });
  ok(/^9 paletas,/.test(await kpi()), 'sin filtro de turno se ven las 9 paletas (4 Día + 3 Noche + 2 Intermedio)');
  await P.evaluate(() => ptTurno('NOCHE'));
  ok(/^3 paletas,/.test(await kpi()) && /Noche/i.test(await P.evaluate(() => document.querySelector('.pt-f').innerText)) && await filas() === 1, 'turno Noche: solo las 3 paletas de la noche');
  await P.evaluate(() => ptTurno('DIA'));
  ok(/^6 paletas,/.test(await kpi()) && await filas() === 2, 'turno Día: las paletas del Día y del Intermedio (6)');
  await P.evaluate(() => ptTurno('TODOS'));
  // ---- fecha de inicio real: lo anotado antes no aparece ----
  await P.evaluate(() => { glacialAlmacenPT.estado.inicio = GlacialFecha.fechaOperativa(); glacialAlmacenPT.estado.dias = 0; glacialAlmacenPT.repintar(); });
  ok(await P.evaluate(() => document.querySelectorAll('.pt-grp').length) === 2, 'con inicio hoy, lo de días anteriores no aparece');
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar(); console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
