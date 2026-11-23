/* Registro que se llena solo (35c) en el navegador real: marcas del turno, horas, vencimiento, personal y «Para cerrar el turno»;
   y el Reporte diario (62b) se genera desde la pestaña Gráficos. Uso: GLX_LIBS=/ruta node tests/autollenado-completo.e2e.js */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };

(async () => {
  const H = await iniciar(); const D = await H.abrir(1300, 1000); const P = D.page;
  const r = await P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Administrador', nombre: 'Admin', username: 'admin', permisos: 'todos' }; state.showWelcome = false; window._recordsReady = true;
    window.alert = () => {}; window.confirm = () => true;
    const hoy = obtenerFechaHoy(), ms = (h, m) => new Date(hoy + 'T' + String(h).padStart(2, '0') + ':' + String(m || 0).padStart(2, '0') + ':00').getTime();
    const marcas = (MARCAS_POR_LINEA && MARCAS_POR_LINEA.B7L) || ['Scala', 'Aro'];
    const pres = (PRESENTACIONES_POR_LINEA && PRESENTACIONES_POR_LINEA.B7L || ['7L'])[0];
    window.__m = [marcas[0], marcas[1] || marcas[0] + 'X'];
    const prog = (marca, estado, ini, fin, pos) => ({ id: 'p' + pos, linea: 'B7L', fecha: hoy, turno: 'DÍA', marca, presentacion: pres, cantidadProgramada: 5000, posicion: pos, estadoOperacion: { estado, inicio: ini, finalizadaEn: fin } });
    const lista = [prog(window.__m[0], 'FINALIZADA', ms(7, 30), ms(12), 1), prog(window.__m[1], 'EN_PRODUCCION', ms(12, 10), 0, 2)];
    loadProgramaciones = () => lista;
    _tareosCache = [{ id: 'tp', fecha: hoy, turno: 'DÍA', area: 'Producción', estado: 'Abierto', personal: [{ trabajadorId: 'w1', nombre: 'Ana Soplado', cargo: 'MAQUINISTA SOPLADOR', asistencia: 'Asistió' }], personalPorDia: [], personalExcluido: [] }];
    state.currentLine = 'B7L'; state.currentTab = 'nuevo'; state.viewingRecordId = null;
    draft = null; renderMain();
    return { hoy };
  });
  await P.waitForTimeout(300);
  await P.evaluate(() => renderFormTab());
  const d = await P.evaluate(() => ({ c: draft.cuadros.slice(0, 2).map(q => ({ m: q.marca, i: q.horaInicio, f: q.horaFin, v: q.fechaVencimiento, h: q.horasTurno })), pers: draft.personal.map(p => p.nombre).filter(Boolean), m: window.__m }));
  ok(d.c[0].m === d.m[0] && d.c[1].m === d.m[1], 'las dos marcas iniciadas están en el registro: ' + JSON.stringify(d.c.map(x => x.m)));
  ok(d.c[0].i === '07:30' && d.c[0].f === '12:00' && d.c[1].i === '12:10', 'horas desde Iniciar/Finalizar: ' + JSON.stringify(d.c));
  ok(Math.abs(d.c[0].h - 4.5) < 1e-9, 'las horas del turno se recalculan (4,5 h)');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(d.c[0].v) && Number(d.c[0].v.slice(0, 4)) === Number(r.hoy.slice(0, 4)) + 1, 'vencimiento a 1 año: ' + d.c[0].v);
  ok(d.pers.includes('Ana Soplado'), 'personal desde el Tareo sin botón: ' + JSON.stringify(d.pers));
  const panel = await P.evaluate(() => { const e = document.querySelector('.reg-para-cerrar'); return e ? e.innerText : ''; });
  ok(/Para cerrar el turno faltan/.test(panel) && /Bidones soplados/.test(panel) && /automático/.test(panel), 'aparece la lista «Para cerrar el turno»');
  if (process.env.GLX_CAPTURAS) { await P.setViewportSize({ width: 520, height: 1000 }); await P.evaluate(() => renderFormTab()); const el = await P.$('.reg-para-cerrar'); if (el) await el.screenshot({ path: process.env.GLX_CAPTURAS + '/para-cerrar.png' }); }
  /* obligatorios y horas negativas */
  const v = await P.evaluate(() => { const f = validarReporteParaFinalizar(); return f; });
  ok(v.some(t => /de calidad/.test(t)) && v.some(t => /mermas/.test(t)), '«Falta para finalizar» pide calidad y mermas: ' + v.filter(t => /calidad|mermas/.test(t)).join(' | '));
  await P.evaluate(() => { const q = draft.cuadros[0]; q.paradasNoProgramadas = [{ id: 'x', descripcion: 'Falla', tiempoMin: 400, causa: '' }]; renderFormTab(); });
  const neg = await P.evaluate(() => { const e = document.querySelector('#reg-cuadro-0 .reg-horas-negativas'); return e ? e.innerText : ''; });
  ok(/Horas efectivas negativas: -2\.17 h/.test(neg), 'aviso rojo en la pestaña: ' + neg.slice(0, 90));
  ok(await P.evaluate(() => validarReporteParaFinalizar().some(t => /las paradas suman 400 min/.test(t))), 'y no deja finalizar');
  ok(await P.evaluate(() => { const et = [...document.querySelectorAll('#reg-cuadro-0 small')].find(x => /^\s*Horas efectivas\s*$/.test(x.textContent)); return et && et.parentElement.querySelector('strong').textContent.trim() === '-2.17 h'; }), 'el resumen de la pestaña muestra -2.17 h (antes 0.00 h)');
  if (process.env.GLX_CAPTURAS) { const el = await P.$('#reg-cuadro-0'); if (el) await el.screenshot({ path: process.env.GLX_CAPTURAS + '/horas-negativas.png', clip: undefined }); }
  /* mermas: cada fila con valor; el 0 escrito cuenta y se ve como 0 */
  await P.evaluate(() => { window.__merma = (ci) => [...document.querySelectorAll('#reg-cuadro-' + ci + ' input[onchange*="updateMermaCuadro("]')].map(e => { const m = /updateMermaCuadro\(\s*(\d+)\s*,\s*(\d+)\s*,\s*'(\w+)'/.exec(e.getAttribute('onchange')); return { el: e, fila: Number(m[2]), campo: m[3] }; }); });
  const filas = await P.evaluate(() => draft.cuadros[0].mermas.length);
  const amb = await P.evaluate(() => [...document.querySelectorAll('#reg-cuadro-0 input[onchange*="updateMermaCuadro("]')].filter(e => e.style.borderColor).length);
  ok(amb > 0, 'las filas de merma sin escribir se ven en ámbar (' + amb + ')');
  await P.evaluate(n => { for (let i = 0; i < n; i++) { const x = window.__merma(0).find(y => y.fila === i); if (x) updateMermaCuadro(0, i, x.campo, i === 0 ? '2.5' : '0'); } }, filas);
  ok(await P.evaluate(() => !validarReporteParaFinalizar().some(t => /^Producción 1: mermas/.test(t))), 'al escribir 2,5 en una y 0 en las demás, la merma de la producción 1 deja de faltar');
  const ceros = await P.evaluate(() => window.__merma(0).filter(x => x.fila === 1).map(x => x.el.value));
  ok(ceros.includes('0'), 'el 0 escrito se ve como 0 (no vacío): ' + JSON.stringify(ceros));
  ok(await P.evaluate(() => draft.cuadros[0].mermas[1].ingresada === true), 'la fila queda marcada como ingresada (se guarda con el reporte)');
  // Sin servidor en la prueba, el autoguardado avisa que no pudo guardar: no es un error del código probado.
  const errores = D.errores.filter(e => !/Guardado de "reportes" bloqueado|Error guardando avance/.test(e));
  ok(errores.length === 0, 'sin errores en la página' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
