/* Maquinistas registrados por Mantenimiento (28b) en el navegador real: panel editable sin Tareo de Producción, guardado,
   «Marcar Asistió», copia al Tareo de Producción y vuelta al espejo con «Editar salida». Uso: GLX_LIBS=/ruta node tests/maquinistas-mantenimiento.e2e.js */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1366, 1000); const P = D.page;
  await P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Mantenimiento', puesto: 'Supervisor De Mantenimiento', nombre: 'Cristian Meza', username: 'cristianmeza', permisos: ['moduloMantenimiento', 'gestionar_tareo_mantenimiento', 'ver_tareo_mantenimiento', 'gestionar_rotacion_mantenimiento', 'editar_salida_maquinistas'] };
    state.showWelcome = false; state.currentTab = 'mantenimiento'; window._recordsReady = true; window.alert = m => { (window.__al = window.__al || []).push(String(m)); }; window.confirm = () => true;
    const hoy = obtenerFechaHoy();
    window.__hoy = hoy;
    window.rotacionMaquinistasDia = () => ({ tieneRotacion: true, trabajan: [{ trabajadorId: 'w1', nombre: 'Ana Soplado', dni: '40000001', linea: 'PET1' }, { trabajadorId: 'w2', nombre: 'Beto Envase', dni: '40000002', linea: 'B7L' }], descansan: [{ trabajadorId: 'w3', nombre: 'Caro Paz', dni: '40000003', linea: 'PET2' }], intermedio: [] });
    _workersCache = [{ id: 'w1', nombre: 'Ana Soplado', dni: '40000001', cargo: 'Maquinista', estado: 'Activo' }, { id: 'w2', nombre: 'Beto Envase', dni: '40000002', cargo: 'Maquinista', estado: 'Activo' },
      { id: 'w3', nombre: 'Caro Paz', dni: '40000003', cargo: 'Maquinista', estado: 'Activo' }, { id: 'w9', nombre: 'Eva Extra', dni: '40000009', cargo: 'Maquinista', estado: 'Activo' },
      { id: 't1', nombre: 'Juan Torres', dni: '40000011', cargo: 'Técnico de Mantenimiento', estado: 'Activo', area: 'Mantenimiento' }];
    _tareosCache = [{ id: 'TAR-MAN-' + hoy + '-D', fecha: hoy, turno: 'Día', area: 'Mantenimiento', estado: 'Abierto', jornadaNormal: 8, horaProgramadaIngreso: '07:00', creadoPor: 'cristianmeza',
      personal: [{ trabajadorId: 't1', nombre: 'Juan Torres', dni: '40000011', cargo: 'Técnico de Mantenimiento', asistencia: '', horaIngreso: '', horaSalida: '' }], personalPorDia: [], personalExcluido: [] }];
    // Sin servidor en la prueba: la «nube» del tareo trabaja sobre los tareos de la memoria (misma interfaz que TareoNube.modificar).
    TareoNube.modificar = async (ids, fn) => { const copia = x => JSON.parse(JSON.stringify(x)); const ctx = { obtener: id => { const t = _tareosCache.find(x => x.id === id); return t ? copia(t) : null; },
      guardar: t => { const i = _tareosCache.findIndex(x => x.id === t.id); if (i >= 0) _tareosCache[i] = t; else _tareosCache.push(t); } }; return fn(ctx); };
    tareoActualId = _tareosCache[0].id; tareoAreaVista = 'Mantenimiento';
    renderTareoFormulario(_tareosCache[0]);
  });
  const panel = () => P.evaluate(() => { const e = document.getElementById('tareo-maquinistas-espejo'); return e ? e.innerText : ''; });
  let t = await panel();
  ok(/Registra Mantenimiento/.test(t) && /No hay Tareo de Producción/.test(t) && /Ana Soplado/.test(t) && /Beto Envase/.test(t) && /Descanso según rotación/.test(t), 'sin Tareo de Producción: panel editable con los maquinistas de la rotación');
  ok(await P.evaluate(() => document.querySelectorAll('#tareo-maquinistas-espejo select').length === 2), 'cada maquinista tiene su asistencia para elegir');
  if (process.env.GLX_CAPTURAS) { const e = await P.$('#tareo-maquinistas-espejo'); if (e) await e.screenshot({ path: process.env.GLX_CAPTURAS + '/maq-mtto-1.png' }); }
  await P.evaluate(() => [...document.querySelectorAll('#tareo-maquinistas-espejo button')].find(b => /Marcar «Asistió»/.test(b.textContent)).click());
  await P.waitForFunction(() => (obtenerTareos()[0].maquinistasMtto || []).length === 2, null, { timeout: 8000 }).catch(() => {});
  let m = await P.evaluate(() => obtenerTareos()[0].maquinistasMtto || []);
  ok(m.length === 2 && m.every(x => x.asistencia === 'Asistió' && x.horaIngreso === '07:00' && x.registradoPor === 'Cristian Meza'), '«Marcar Asistió»: los dos con ingreso 07:00 y quién lo registró ' + JSON.stringify(m.map(x => [x.nombre, x.asistencia, x.horaIngreso, x.registradoPor])));
  // escribir la salida de Ana
  await P.evaluate(() => { const k = glacialMaquinistasMtto.claveMaq({ trabajadorId: 'w1' }); return tareoMaqMttoCampo(obtenerTareos()[0].id, k, 'horaSalida', '19:00'); });
  m = await P.evaluate(() => obtenerTareos()[0].maquinistasMtto);
  const ana = m.find(x => x.trabajadorId === 'w1');
  ok(ana.horaSalida === '19:00' && ana.horasTrabajadas > 0, 'la salida se guarda y se calculan las horas (' + ana.horasTrabajadas + ' h)');
  t = await panel();
  ok(/Mantenimiento/.test(t) && !/Ana Soplado[\s\S]{0,200}Pendiente/.test(t), 'la fila muestra «Mantenimiento» como origen');
  // trabajó en descanso
  await P.evaluate(() => [...document.querySelectorAll('#tareo-maquinistas-espejo button')].find(b => /Trabajó en descanso/.test(b.textContent)).click());
  await P.waitForTimeout(300);
  ok(await P.evaluate(() => (obtenerTareos()[0].maquinistasMtto || []).some(x => x.trabajadorId === 'w3' && x.trabajoEnDescanso)), '«Trabajó en descanso» lo agrega a la lista');
  // agregar fuera de rotación
  await P.evaluate(() => tareoMaqMttoAgregar(obtenerTareos()[0].id));
  const opciones = await P.evaluate(() => [...document.querySelectorAll('#tmm-w option')].map(o => o.textContent));
  ok(opciones.length === 1 && /Eva Extra/.test(opciones[0]), '«Agregar maquinista» ofrece solo a quien no está en la lista: ' + opciones.join(','));
  await P.evaluate(() => tareoMaqMttoAgregarOk(obtenerTareos()[0].id)); await P.waitForTimeout(300);
  await P.evaluate(() => tareoMaqMttoCampo(obtenerTareos()[0].id, glacialMaquinistasMtto.claveMaq({ trabajadorId: 'w9' }), 'asistencia', 'Falta por justificar'));
  ok(await P.evaluate(() => (obtenerTareos()[0].maquinistasMtto || []).some(x => x.trabajadorId === 'w9')), 'se agrega a Eva Extra (fuera de rotación)');
  if (process.env.GLX_CAPTURAS) { const e = await P.$('#tareo-maquinistas-espejo'); if (e) await e.screenshot({ path: process.env.GLX_CAPTURAS + '/maq-mtto-2.png' }); }
  // Producción crea su tareo: se copia al abrirlo quien lo edita
  await P.evaluate(() => {
    const hoy = window.__hoy;
    _tareosCache.push({ id: 'TAR-PRO-' + hoy + '-D', fecha: hoy, turno: 'Día', area: 'Producción', estado: 'Abierto', jornadaNormal: 8, horaProgramadaIngreso: '07:00', creadoPor: 'sup',
      personal: [{ trabajadorId: 'w1', nombre: 'Ana Soplado', dni: '40000001', cargo: 'Maquinista', asistencia: '', horaIngreso: '', horaSalida: '' }, { trabajadorId: 'w2', nombre: 'Beto Envase', dni: '40000002', cargo: 'Maquinista', asistencia: 'Asistió', horaIngreso: '07:10', horaSalida: '' }], personalPorDia: [], personalExcluido: [] });
    window.__cristian = state.user;
    state.user = { rol: 'Supervisor', nombre: 'Félix López', username: 'felix', permisos: 'todos' };
    tareoActualId = 'TAR-PRO-' + hoy + '-D'; tareoAreaVista = 'Producción';
    renderTareoFormulario(obtenerTareos().find(x => x.id === tareoActualId));
  });
  await P.waitForFunction(() => { const t = obtenerTareos().find(x => x.area === 'Producción'); return t && t.maquinistasDesdeMtto; }, null, { timeout: 8000 }).catch(() => {});
  const prod = await P.evaluate(() => obtenerTareos().find(x => x.area === 'Producción'));
  const pa = (prod.personal || []).find(x => x.trabajadorId === 'w1'), pb = (prod.personal || []).find(x => x.trabajadorId === 'w2');
  ok(prod.maquinistasDesdeMtto && pa && pa.asistencia === 'Asistió' && pa.horaSalida === '19:00' && pa.registradoPorArea === 'Mantenimiento', 'al abrir Producción su tareo, se copia lo que registró Mantenimiento');
  ok(pb && pb.horaIngreso === '07:10', 'lo que Producción ya tenía manda (Beto 07:10)');
  ok((prod.personal || []).some(x => x.trabajadorId === 'w9'), 'Eva (fuera de rotación, con su falta registrada) también llega a Producción');
  // Mantenimiento con Tareo de Producción: vuelve a ser solo lectura, con aviso y «Editar salida»
  await P.evaluate(() => { state.user = window.__cristian; tareoActualId = obtenerTareos().find(x => x.area === 'Mantenimiento').id; tareoAreaVista = 'Mantenimiento'; renderTareoFormulario(obtenerTareos().find(x => x.id === tareoActualId)); });
  t = await panel();
  ok(/Solo lectura/.test(t) && /se copió al Tareo de Producción/.test(t) && /Editar salida/.test(t), 'con Tareo de Producción: espejo de solo lectura, aviso de la copia y «Editar salida»');
  const err = await P.evaluate(async () => { const k = glacialMaquinistasMtto.claveMaq({ trabajadorId: 'w1' }); window.__al = []; await tareoMaqMttoCampo(obtenerTareos().find(x => x.area === 'Mantenimiento').id, k, 'horaSalida', '20:00'); return window.__al.join('|'); });
  ok(/Producción ya tiene su Tareo/.test(err), 'ya no se registra en Mantenimiento: ' + err.slice(0, 80));
  if (process.env.GLX_CAPTURAS) { const e = await P.$('#tareo-maquinistas-espejo'); if (e) await e.screenshot({ path: process.env.GLX_CAPTURAS + '/maq-mtto-3.png' }); }
  const errores = D.errores.filter(e => !/Guardado de|Error guardando/.test(e));
  ok(errores.length === 0, 'sin errores en la página' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
