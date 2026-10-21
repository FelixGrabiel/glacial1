/* Producción Actual · iniciar una línea NOCHE a las 19:30 (antes de que empiece el bloque Noche de las 21:00): ya no se ignora en silencio.
   Uso: GLX_LIBS=/ruta node tests/produccion-actual-inicio-franja.e2e.js   (no forma parte de las pruebas rápidas) */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar();
  const D = await H.abrir(1400, 900);
  const r = await D.page.evaluate(async () => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Supervisor', nombre: 'Sup', username: 'sup', permisos: ['paletas', 'produccionActual', 'avanceProduccion', 'programarPaletas'], linea: 'B7L' }; state.showWelcome = false; window._recordsReady = true;
    const d = new Date(); const ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const ahora = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 19, 30).getTime();
    window.tareoAhoraServidor = () => ahora;
    _programacionesCache = [{ clave: claveProgramacionPaleta('B7L', ymd, 'NOCHE', 'Scala', '7 Litros'), linea: 'B7L', fecha: ymd, turno: 'NOCHE', marca: 'Scala', presentacion: '7 Litros', cantidadProgramada: 5200, unidadesPorPaleta: 200, version: 1 }];
    _programacionesReady = true;
    window.__escrito = [];
    db.runTransaction = async fn => { const tx = { get: async () => ({ exists: true, data: () => ({ items: JSON.parse(JSON.stringify(_programacionesCache)) }) }), set: (r, d) => { window.__escrito.push(d); if (d && d.items) _programacionesCache = d.items; } }; return await fn(tx); };
    const msgs = { confirm: [], prompt: [], alert: [] };
    window.confirm = m => { msgs.confirm.push(m); return true; };
    window.prompt = m => { msgs.prompt.push(m); return '19:00'; };
    window.alert = m => { msgs.alert.push(m); };
    state.currentTab = 'produccion-actual'; produccionActualFecha = ymd; produccionActualTurno = 'NOCHE';
    renderProduccionActualTab();
    await new Promise(r => setTimeout(r, 400));
    const botones = [...document.querySelectorAll('[data-pa-accion="iniciar"]')].length;
    const b = document.querySelector('[data-pa-accion="iniciar"]');
    if (b) b.click();
    await new Promise(r => setTimeout(r, 1500));
    return { botones, msgs, franja: window.glacialEnFranjaSinProduccion(), op: (_programacionesCache[0] || {}).estadoOperacion || null };
  });
  ok(r.franja === true, 'a las 19:30 la planta figura en la franja sin producción (el bloque Noche empieza a las 21:00)');
  ok(r.botones === 1, 'el botón «Iniciar presentación» aparece');
  ok(r.msgs.confirm.length >= 1 && /sin producci[oó]n.*21[:.]00/s.test(r.msgs.confirm[0]) && /Scala/.test(r.msgs.confirm[0]), 'al pulsarlo pide confirmación explícita y explica la franja: ' + (r.msgs.confirm[0] || '(nada)').slice(0, 120).replace(/\n/g, ' '));
  ok(r.msgs.prompt.length === 1 && /Hora real de inicio/.test(r.msgs.prompt[0]), 'tras confirmar, pide la hora real de inicio (antes no pasaba nada)');
  ok(!!r.op && r.op.estado === 'EN_PRODUCCION' && new Date(r.op.inicio).getHours() === 19 && new Date(r.op.inicio).getMinutes() === 0 && r.msgs.alert.length === 0, 'la línea queda EN PRODUCCIÓN con la hora real de inicio 19:00 (' + (r.op ? r.op.estado : 'sin estado') + ' · alertas: ' + r.msgs.alert.join(' | ') + ')');
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
