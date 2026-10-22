/* Producción Actual · reactivar una presentación CANCELADA: solo el Administrador, con motivo, y queda en la bitácora.
   Uso: TZ=America/Lima GLX_LIBS=/ruta node tests/produccion-actual-reactivar.e2e.js   (no forma parte de las pruebas rápidas) */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar();
  const D = await H.abrir(1400, 900);
  const pagina = D.page;
  await pagina.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    document.documentElement.style.overflow = 'auto'; document.body.style.overflow = 'auto'; document.body.style.height = 'auto';
    state.showWelcome = false; window._recordsReady = true;
    const d = new Date(); const ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const ahora = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0).getTime();
    window.tareoAhoraServidor = () => ahora;
    window.__ymd = ymd;
    const P = (m, op) => ({ clave: claveProgramacionPaleta('C20L', ymd, 'DÍA', m, 'Caja 20 Litros'), linea: 'C20L', fecha: ymd, turno: 'DÍA', marca: m, presentacion: 'Caja 20 Litros', cantidadProgramada: 1000, unidadesPorPaleta: 50, version: 1, estadoOperacion: op });
    _programacionesCache = [P('San Jorge', null),
      P('Cuisine', { estado: 'CANCELADA', canceladaEn: ahora - 3600000, finalizadaEn: ahora - 3600000, motivoCancelacion: 'error de carga' }),
      P('Aro', { estado: 'CANCELADA', inicio: ahora - 7200000, canceladaEn: ahora - 3600000, finalizadaEn: ahora - 3600000, motivoCancelacion: 'se canceló a media producción' })];
    _programacionesReady = true;
    window.__escrito = [];
    db.runTransaction = async fn => { const tx = { get: async () => ({ exists: true, data: () => ({ items: JSON.parse(JSON.stringify(_programacionesCache)) }) }), set: (r, d) => { window.__escrito.push(d); if (d && d.items) _programacionesCache = d.items; } }; return await fn(tx); };
    window.__m = { alert: [], prompt: [], confirm: [] };
    window.prompt = m => { window.__m.prompt.push(m); return window.__respuesta; };
    window.confirm = m => { window.__m.confirm.push(m); return true; };
    window.alert = m => { window.__m.alert.push(m); };
    state.currentTab = 'produccion-actual'; produccionActualFecha = ymd; produccionActualTurno = 'DÍA';
  });
  const pintar = async (usuario) => { await pagina.evaluate(u => { state.user = u; renderProduccionActualTab(); }, usuario); await pagina.waitForTimeout(500); };
  const sup = { rol: 'Supervisor', nombre: 'Sup', username: 'sup', permisos: ['paletas', 'produccionActual', 'avanceProduccion'], linea: 'C20L' };
  const adm = { rol: 'Administrador', nombre: 'Admin', username: 'admin', permisos: 'todos' };
  await pintar(sup);
  ok(await pagina.evaluate(() => document.querySelectorAll('[data-pa-accion="reactivar"]').length) === 0, 'el supervisor NO ve «Reactivar» en las canceladas');
  ok(await pagina.evaluate(() => document.querySelectorAll('.pa-program-state-cancelada').length) === 2, 'hay 2 presentaciones canceladas en la secuencia');
  const textosCanc = await pagina.evaluate(() => [...document.querySelectorAll('.pa-program-state-cancelada .pa-program-right strong')].map(e => e.textContent));
  ok(textosCanc.length === 2 && textosCanc.every(t => /\/ 1,000 UND/.test(t) && !/\/ 0 UND/.test(t)), 'una presentación cancelada muestra lo producido frente a lo que tenía programado (no «/ 0») → ' + textosCanc.join(' | '));
  await pintar(adm);
  const botones = await pagina.evaluate(() => document.querySelectorAll('[data-pa-accion="reactivar"]').length);
  ok(botones === 2, 'el Administrador ve «↺ Reactivar» en cada cancelada (' + botones + ')');
  /* motivo corto: no cambia nada */
  await pagina.evaluate(() => { window.__respuesta = 'x'; document.querySelector('[data-pa-accion="reactivar"]').click(); });
  await pagina.waitForTimeout(500);
  ok(await pagina.evaluate(() => window.__m.alert.some(a => /motivo es obligatorio/.test(a)) && _programacionesCache.every(p => !p.estadoOperacion || p.estadoOperacion.estado === 'CANCELADA' || !p.estadoOperacion)), 'con un motivo de menos de 5 caracteres no se reactiva');
  /* reactivar la que nunca empezó (Cuisine) */
  const r1 = await pagina.evaluate(async () => {
    window.__respuesta = 'Se canceló por error del turno';
    const b = [...document.querySelectorAll('[data-pa-accion="reactivar"]')].find(x => /Cuisine/.test(x.closest('.pa-program-row').innerText));
    b.click(); await new Promise(r => setTimeout(r, 900));
    const p = _programacionesCache.find(x => x.marca === 'Cuisine');
    const ev = window.__escrito.find(d => d && d.accion);
    return { estado: p.estadoOperacion.estado, canc: p.estadoOperacion.cancelaciones, fin: p.estadoOperacion.finalizadaEn, ev: ev && { accion: ev.accion, tipo: ev.tipoReabrir, motivo: ev.motivo, origen: ev.origen } };
  });
  ok(r1.estado === 'PENDIENTE' && r1.fin === 0 && r1.canc.length === 1 && r1.canc[0].motivoCancelacion === 'error de carga' && r1.canc[0].motivoReactivacion === 'Se canceló por error del turno', 'Cuisine (nunca empezó) vuelve a PENDIENTE y guarda la cancelación y la reactivación con sus motivos');
  ok(r1.ev && r1.ev.accion === 'REABRIR' && r1.ev.tipo === 'CANCELACION' && r1.ev.motivo === 'Se canceló por error del turno', 'queda en la bitácora como REABRIR (tipo CANCELACION) con el motivo: ' + JSON.stringify(r1.ev));
  /* reactivar la que ya había empezado (Aro) */
  const r2 = await pagina.evaluate(async () => {
    window.__respuesta = 'Se canceló por equivocación';
    const b = [...document.querySelectorAll('[data-pa-accion="reactivar"]')].find(x => /Aro/.test(x.closest('.pa-program-row').innerText));
    b.click(); await new Promise(r => setTimeout(r, 900));
    return _programacionesCache.find(x => x.marca === 'Aro').estadoOperacion;
  });
  ok(r2.estado === 'LISTA' && r2.inicio > 0, 'Aro (ya había empezado) queda «Lista para reanudar» y conserva su inicio');
  /* un supervisor que intenta la acción por la consola */
  const rs = await pagina.evaluate(async () => { state.user = { rol: 'Supervisor', nombre: 'Sup', username: 'sup', permisos: ['paletas', 'produccionActual'], linea: 'C20L' }; window.__m.alert.length = 0; const x = { linea: 'C20L', fecha: window.__ymd, turno: 'DÍA', turnoPlan: 'DÍA', marca: 'Cuisine', presentacion: 'Caja 20 Litros', puede: 'supervisor', op: { estado: 'CANCELADA' }, prog: { cantidadProgramada: 1000 } }; await glacialSemaforo.cambiarEstado(x, 'reactivar'); return window.__m.alert; });
  ok(rs.some(a => /Solo el Administrador/.test(a)), 'un supervisor no puede reactivar ni forzando la acción: «Solo el Administrador…»');
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
