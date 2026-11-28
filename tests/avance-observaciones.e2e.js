/* Avance y cierre · Observaciones por línea (28/11/2026): «+ OBSERVACIONES» en la pantalla, una por línea, fecha y turno (sync/avancesTurno ›
   observacionesOperativas, en transacción); salen en el texto de WhatsApp y en la imagen por formato (primer formato de la línea).
   Uso: GLX_LIBS=/ruta node tests/avance-observaciones.e2e.js  (GLX_CAPTURAS=/carpeta guarda capturas) */
'use strict';
const path = require('path'), fs = require('fs');
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(390, 844); const P = D.page;
  await P.exposeFunction('__guardarPng', u => { if (process.env.GLX_CAPTURAS) fs.writeFileSync(path.join(process.env.GLX_CAPTURAS, 'avance-observaciones.png'), Buffer.from(u.split(',')[1], 'base64')); });
  await P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Administrador', nombre: 'Admin', username: 'admin', permisos: 'todos' }; state.showWelcome = false; window._recordsReady = true;
    window.alert = () => {}; window.confirm = () => true;
    const m = document.getElementById('sup-modal'); if (m) m.remove();
    // servidor falso: sync/avancesTurno (otra fecha ya tiene una observación que no se debe tocar)
    window.__av = { paradasOperativas: [], updatedAt: 1000, observacionesOperativas: [{ id: 'obs_vieja', fecha: '2026-11-20', turno: 'DÍA', linea: 'B7L', texto: 'De otro día', actualizadoEn: Date.now() }] };
    avRef = () => ({ id: 'avancesTurno', get: async () => ({ exists: true, data: () => JSON.parse(JSON.stringify(window.__av)) }), onSnapshot(){ return () => {}; } });
    window.__escrituras = 0;
    db.runTransaction = async fn => { let nuevo = null; const tx = { get: async () => ({ exists: true, data: () => JSON.parse(JSON.stringify(window.__av)) }), set: (ref, d) => { nuevo = d; } };
      const r = await fn(tx); if (nuevo){ window.__escrituras++; window.__av = Object.assign({}, window.__av, JSON.parse(JSON.stringify(nuevo))); } return r; };
    avanceEstado.fecha = '2026-11-27'; avanceEstado.turno = 'NOCHE'; avanceEstado.manual = true;
    // producción del turno: PET2 (dos formatos) y B7L
    const regs = [{ id: 'r1', linea: 'PET2', fecha: '2026-11-27', turno: 'NOCHE', cuadros: [{ marca: 'Scala', presentacion: '625 ml', horaInicio: '21:00', produccion: { efectiva: 37950 } }, { marca: 'Scala Gas', presentacion: '625 ml', horaInicio: '23:00', produccion: { efectiva: 975 } }] },
                  { id: 'r2', linea: 'B7L', fecha: '2026-11-27', turno: 'NOCHE', cuadros: [{ marca: 'Scala', presentacion: '7 L', horaInicio: '21:00', produccion: { efectiva: 2856 } }] }];
    loadRecordsOficiales = () => regs; loadRecords = () => regs;
    const pal = (linea, marca, pres, total, hora) => ({ linea, fecha: '2026-11-27', turno: 'NOCHE', marca, presentacion: pres, tipoPaleta: 'COMPLETA', paletas: 1, totalUnidades: total, hora, creadoEn: Date.parse('2026-11-28T00:00:00-05:00') });
    const pals = [pal('PET2', 'Scala', '625 ml', 37950, '23:00'), pal('PET2', 'Scala Gas', '625 ml', 975, '23:30'), pal('B7L', 'Scala', '7 L', 2856, '23:00')];
    loadPaletas = () => pals;
    avAhoraMs = () => Date.parse('2026-11-28T04:29:00-05:00');
    state.currentTab = 'avance-produccion'; renderMain(); try{ avDibujar(); }catch(_){ }
  });
  await P.waitForTimeout(400);
  const boton = await P.evaluate(() => [...document.querySelectorAll('button')].some(b => /\+ OBSERVACIONES/.test(b.textContent)));
  ok(boton, 'Avance y cierre tiene «+ OBSERVACIONES» junto a «+ AGREGAR PARADAS»');
  await P.evaluate(() => avAbrirObservaciones('PET2'));
  await P.waitForSelector('#av-obs-modal [data-av-obs="PET2"]');
  const filas = await P.evaluate(() => [...document.querySelectorAll('#av-obs-modal [data-av-obs]')].map(t => t.getAttribute('data-av-obs')));
  ok(filas.length >= 4 && filas.includes('PET2') && filas.includes('B7L'), 'una caja de observación por línea (' + filas.join(', ') + ')');
  await P.fill('#av-obs-modal [data-av-obs="PET2"]', 'Se esperó bobinas de Almacén 20 min');
  await P.fill('#av-obs-modal [data-av-obs="B7L"]', 'Cambio de sensor en la llenadora');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: path.join(process.env.GLX_CAPTURAS, 'avance-observaciones-modal.png') });
  await P.click('#av-obs-modal [data-av-obs-guardar]');
  await P.waitForFunction(() => !document.getElementById('av-obs-modal'), null, { timeout: 5000 }).catch(() => {});
  const g = await P.evaluate(() => ({ lista: window.__av.observacionesOperativas, esc: window.__escrituras, upd: window.__av.updatedAt }));
  ok(g.esc === 1 && g.lista.length === 3 && g.lista.some(o => o.linea === 'PET2' && o.fecha === '2026-11-27' && o.turno === 'NOCHE' && /bobinas/.test(o.texto) && o.actualizadoPor === 'Admin') && g.lista.some(o => o.id === 'obs_vieja'),
    'se guardan en una sola escritura (PET2 y B7L de este turno) con quién; la de otro día no se toca');
  ok(g.upd === 1000, 'no cambia la versión de las paradas (no interrumpe a quien está agregando paradas)');
  // el avance las incluye: texto de WhatsApp e imagen por formato
  const av = await P.evaluate(() => {
    const s = avConstruirSnapshot('04:29', 'AVANCE');
    const lPET2 = (s.lineas || []).find(l => l.linea === 'PET2') || {}, lB7L = (s.lineas || []).find(l => l.linea === 'B7L') || {};
    const texto = avTextoWhatsApp(s);
    let alto = 0, altoSin = 0; try{ alto = avCanvasSnapshot(s).height; const s2 = JSON.parse(JSON.stringify(s)); s2.lineas.forEach(l => { l.observacionesAvance = []; l.observaciones = []; (l.bloques || []).forEach(b => { b.observaciones = []; }); }); altoSin = avCanvasSnapshot(s2).height; }catch(e){ alto = -1; }
    const blPET2 = (lPET2.bloques || []).map(b => (b.observaciones || []).length);
    if (window.__guardarPng) window.__guardarPng(avCanvasSnapshot(s).toDataURL('image/png'));
    return { obsPET2: lPET2.observacionesAvance || [], obsB7L: lB7L.observaciones || [], texto, alto, altoSin, blPET2 };
  });
  ok(av.obsPET2.length === 1 && /bobinas/.test(av.obsPET2[0]) && av.obsB7L.some(o => /sensor/.test(o)), 'el avance congela las observaciones de cada línea (PET2 y B7L)');
  ok(/OBSERVACIONES/.test(av.texto) && /Se esperó bobinas de Almacén 20 min/.test(av.texto), 'el texto de WhatsApp las trae en su línea («*OBSERVACIONES*»)');
  ok(av.alto > av.altoSin && av.altoSin > 0, 'la imagen por formato les hace espacio (alto ' + av.altoSin + ' → ' + av.alto + ')');
  ok(av.blPET2.length === 2 && av.blPET2[0] === 1 && av.blPET2[1] === 0, 'PET2 tiene 2 formatos: la observación de la línea sale una vez, en el primero');
  // borrar: vaciar la caja la quita
  await P.evaluate(() => avAbrirObservaciones('PET2'));
  await P.waitForSelector('#av-obs-modal [data-av-obs="PET2"]');
  const previo = await P.evaluate(() => document.querySelector('#av-obs-modal [data-av-obs="PET2"]').value);
  await P.fill('#av-obs-modal [data-av-obs="PET2"]', '');
  await P.click('#av-obs-modal [data-av-obs-guardar]'); await P.waitForTimeout(300);
  ok(/bobinas/.test(previo) && await P.evaluate(() => !window.__av.observacionesOperativas.some(o => o.linea === 'PET2') && window.__av.observacionesOperativas.some(o => o.linea === 'B7L')), 'al volver a abrir trae lo escrito; dejarla vacía la quita (B7L sigue)');
  ok(await P.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'celular: sin desborde lateral');
  const errores = D.errores.filter(e => !/reportes|Error guardando avance/.test(e));
  ok(!errores.length, 'sin errores en la página' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
