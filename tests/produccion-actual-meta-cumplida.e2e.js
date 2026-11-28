/* Producción actual (24-semaforo): una presentación que llegó a lo programado pero NADIE finalizó ya no se muestra como «FINALIZADA».
   Caso real 27/11/2026 (PET2 noche): 47,265 de 44,625 programadas, la tarjeta decía FINALIZADA, no había «Reabrir» ni constancia de quién la cerró
   (nadie la había cerrado). Ahora: «Meta cumplida · falta finalizar» y el botón «Finalizar presentación»; al finalizar de verdad, «FINALIZADA» y «Reabrir».
   Uso: GLX_LIBS=/ruta node tests/produccion-actual-meta-cumplida.e2e.js */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1280, 900), P = D.page;
  const ver = op => P.evaluate(async op => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    const m = document.getElementById('sup-modal'); if (m) m.remove();
    state.user = { rol: 'Administrador', nombre: 'Admin', username: 'admin', permisos: 'todos' }; state.showWelcome = false; window._recordsReady = true;
    const f = GlacialFecha.fechaOperativa(), t = GlacialFecha.turnoOperativo ? GlacialFecha.turnoOperativo() : 'DÍA', turno = /noche/i.test(t) ? 'NOCHE' : 'DÍA';
    _programacionesCache = [{ id: 'p1', linea: 'PET2', fecha: f, turno, marca: 'Scala', presentacion: 'Pack_Regular_625mlx15und/ln', cantidadProgramada: 1000, paletasProgramadas: 1, unidadesPorPaleta: 1000,
      estadoOperacion: Object.assign({ inicio: Date.now() - 3600000 }, op) }];
    window._programacionesReady = true;
    _paletasCache = [{ id: 'pa1', linea: 'PET2', fecha: f, turno, marca: 'Scala', presentacion: 'Pack_Regular_625mlx15und/ln', tipoPaleta: 'COMPLETA', paletas: 1, totalUnidades: 1200, hora: '01:00', creadoEn: Date.now() - 600000 }];
    state.currentTab = 'produccion-actual'; renderMain();
    await new Promise(r => setTimeout(r, 400));
    const tarjetas = [...document.querySelectorAll('#main *')].filter(e => e.children.length === 0 && /^PET 2$/.test(e.textContent.trim()));
    const txt = document.getElementById('main').innerText, i = txt.indexOf('PET 2');
    return { t: txt.slice(i, i + 900), acciones: [...document.querySelectorAll('[data-pa-accion]')].map(b => b.getAttribute('data-pa-accion')), n: tarjetas.length };
  }, op);
  const a = await ver({ estado: 'EN_PRODUCCION' });
  ok(/META CUMPLIDA · FALTA FINALIZAR/i.test(a.t) && !/\nFINALIZADA\n/.test(a.t), 'llegó a lo programado sin finalizar: «Meta cumplida · falta finalizar» (ya no dice FINALIZADA)');
  ok(/\nMETA CUMPLIDA\n/.test(a.t) && /Meta cumplida, falta finalizar/.test(a.t), 'la presentación dice «META CUMPLIDA» y la secuencia la cuenta aparte (no como «Finalizadas»)');
  ok(a.acciones.includes('finalizar') && !a.acciones.includes('reabrir'), 'sigue el botón «Finalizar presentación» (así queda quién la cerró); no hay «Reabrir» porque está abierta');
  const b = await ver({ estado: 'FINALIZADA', finalizadaEn: Date.now() - 60000, finalizadaPor: 'Supervisor de prueba' });
  ok(/\nFINALIZADA\n/.test(b.t) && !/FALTA FINALIZAR/i.test(b.t) && !/\nMETA CUMPLIDA\n/.test(b.t) && /Finalizadas/.test(b.t), 'finalizada de verdad: «FINALIZADA» y «Finalizadas» en la secuencia');
  ok(b.acciones.includes('reabrir') && !b.acciones.includes('finalizar'), 'finalizada: aparece «Reabrir» para quien tiene el permiso (Administrador)');
  ok(!D.errores.length, 'sin errores en la página' + (D.errores.length ? ': ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
