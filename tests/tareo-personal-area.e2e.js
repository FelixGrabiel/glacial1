/* Tareo de Mantenimiento · Inicio: QUITAR personal del área y AGREGAR personal por día con rango de fechas (navegador real).
   Uso: GLX_LIBS=/ruta node tests/tareo-personal-area.e2e.js (no forma parte de las pruebas rápidas). GLX_CAPTURAS=/carpeta guarda capturas. */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };

(async () => {
  const H = await iniciar(); const D = await H.abrir(1400, 1000); const P = D.page;
  const montar = () => P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Administrador', nombre: 'Admin', username: 'admin', permisos: 'todos' }; state.showWelcome = false; state.currentTab = 'mantenimiento'; window._recordsReady = true;
    window.__alertas = []; window.alert = m => window.__alertas.push(String(m)); window.confirm = () => true;
    const dia = d => { const f = new Date(obtenerFechaHoy() + 'T00:00:00'); f.setDate(f.getDate() + d); return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0'); };
    const Pp = (id, nom, extra) => Object.assign({ id, trabajadorId: id, nombre: nom, dni: '4000' + id.replace(/\D/g, '').padStart(4, '0'), cargo: 'Técnico', linea: 'Mtto', asistencia: '', horaIngreso: '', horaSalida: '' }, extra || {});
    const mk = (id, area, turno, d, pers) => ({ id, fecha: dia(d), turno, area, estado: 'Abierto', jornadaNormal: 8, horaProgramadaIngreso: '07:00', creadoPor: 'admin', personal: pers, personalPorDia: [], personalExcluido: [] });
    const juan = x => Pp('t1', 'Juan Torres', x);
    _workersCache = [
      { id: 't1', trabajadorId: 't1', nombre: 'Juan Torres', dni: '40000001', cargo: 'Técnico de Mantenimiento', estado: 'Activo', area: 'Mantenimiento' },
      { id: 't2', trabajadorId: 't2', nombre: 'Kevin Ruiz', dni: '40000002', cargo: 'Técnico de Mantenimiento', estado: 'Activo', area: 'Mantenimiento' }
    ];
    _tareosCache = [
      mk('m-1', 'Mantenimiento', 'Día', -1, [juan({ asistencia: 'Asistió', horaIngreso: '07:00' }), Pp('t2', 'Kevin Ruiz')]),
      mk('m-1n', 'Mantenimiento', 'Noche', -1, [juan(), Pp('t2', 'Kevin Ruiz')]),
      mk('m0', 'Mantenimiento', 'Día', 0, [juan(), Pp('t2', 'Kevin Ruiz')]),
      mk('m0n', 'Mantenimiento', 'Noche', 0, [juan(), Pp('t2', 'Kevin Ruiz')]),
      mk('m1', 'Mantenimiento', 'Día', 1, [juan(), Pp('t2', 'Kevin Ruiz')])
    ];
    window.__dia = dia; window.__ids = id => obtenerTareos().find(t => t.id === id).personal.map(p => p.nombre);
    window.__pd = id => (obtenerTareos().find(t => t.id === id).personalPorDia || []).filter(p => !p.eliminada).map(p => p.nombre);
    tareoAreaVista = 'Mantenimiento'; tareoFechaVista = ''; renderTareoPrincipal();
  });
  const tiene = (id, n) => P.evaluate(([id, n]) => window.__ids(id).includes(n), [id, n]);
  const filas = () => P.evaluate(() => [...document.querySelectorAll('.tareo-table tbody tr')].map(r => r.children[0].innerText.trim()));

  await montar();
  ok((await filas()).join() === 'Juan Torres,Kevin Ruiz', 'el Inicio lista el personal de Mantenimiento');
  ok(await P.evaluate(() => document.querySelectorAll('.tareo-table .tar2-quitar').length) === 2, 'cada fila tiene el botón «✕ Quitar»');
  ok(await P.evaluate(() => /Personal por día \(rango\)/.test(document.querySelector('.panel-head').parentElement.innerText) || [...document.querySelectorAll('button')].some(b => /Personal por día \(rango\)/.test(b.innerText))), 'hay un botón «+ Personal por día (rango)»');

  /* ---------- Quitar desde una fecha ---------- */
  await P.evaluate(() => document.querySelector('.tareo-table .tar2-quitar').click());
  ok(await P.evaluate(() => /Quitar a Juan Torres/.test(document.querySelector('#modal-root h3').innerText) && [...document.querySelectorAll('#modal-root input[name=tpa-alc]')].map(i => i.value).join() === 'desde,todos'), 'se abre la ventana con dos alcances: desde una fecha y todos los tareos');
  const dm = await P.evaluate(() => window.__dia(0));
  await P.evaluate(d => { const f = document.getElementById('tpa-fecha'); f.value = d; TareoArea.qFecha(d); }, dm);
  const res = await P.evaluate(() => document.getElementById('tpa-resumen').innerText);
  ok(/3 tareos/.test(res), 'vista previa «desde hoy»: hoy Día, hoy Noche y mañana = 3 tareos: ' + res);
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/personal-area-quitar.png' });
  await P.evaluate(() => TareoArea.qConfirmar());
  ok(!(await tiene('m0', 'Juan Torres')) && !(await tiene('m0n', 'Juan Torres')) && !(await tiene('m1', 'Juan Torres')), 'sale de los tareos desde la fecha elegida');
  ok(await tiene('m-1', 'Juan Torres') && await tiene('m-1n', 'Juan Torres'), 'los tareos anteriores a la fecha NO se tocan');
  ok(await tiene('m0', 'Kevin Ruiz'), 'otras personas NO se tocan');
  ok((await filas()).join() === 'Kevin Ruiz', 'ya no figura en la tabla del Inicio');
  ok(await P.evaluate(() => /Personal quitado \(1\)/.test(document.getElementById('tareo-quitados-area').innerText)), 'aparece en «Personal quitado»');
  ok(await P.evaluate(d => { const f = TareoEd.filtroExclusion({ id: '', area: 'Mantenimiento', fecha: window.__dia(5) }); return f({ trabajadorId: 't1', nombre: 'Juan Torres', dni: '40000001' }); }), 'los tareos que se creen desde esa fecha tampoco lo traen');
  ok(await P.evaluate(() => { const f = TareoEd.filtroExclusion({ id: '', area: 'Mantenimiento', fecha: window.__dia(-3) }); return !f({ trabajadorId: 't1', nombre: 'Juan Torres', dni: '40000001' }); }), '…pero las fechas anteriores sí lo conservan');

  /* ---------- Restaurar ---------- */
  await P.evaluate(() => document.querySelector('#tareo-quitados-area button').click());
  ok((await filas()).join() === 'Juan Torres,Kevin Ruiz' && await P.evaluate(() => !document.getElementById('tareo-quitados-area')), 'Restaurar lo devuelve a la tabla y se vacía «Personal quitado»');
  ok(await P.evaluate(() => { const f = TareoEd.filtroExclusion({ id: '', area: 'Mantenimiento', fecha: window.__dia(5) }); return !f({ trabajadorId: 't1', nombre: 'Juan Torres', dni: '40000001' }); }), 'tras restaurar, los tareos nuevos vuelven a traerlo');

  /* ---------- Restaurar cuando la baja está en un tareo cerrado (no modificable) ---------- */
  await montar();
  await P.evaluate(() => {
    // La baja de Juan quedó guardada en el tareo de ayer (Día), que ahora está cerrado; Juan ya no figura en ningún tareo.
    const cerrado = obtenerTareos().find(t => t.id === 'm-1');
    cerrado.personalExcluido = [{ clave: 't1', ids: tareoIdentidades({ trabajadorId: 't1', nombre: 'Juan Torres', dni: '40000001' }), nombre: 'Juan Torres', dni: '40000001', cargo: 'Técnico de Mantenimiento', en: 5, activa: true, permanente: true, desde: '2026-01-01', alcance: 'desde', por: 'Cristian' }];
    window.__cerradoId = 'm-1';
    const orig = window.tareoAutorizadoEscribir; window.__origAut = orig;
    window.tareoAutorizadoEscribir = x => (typeof x === 'object' && x && x.id === window.__cerradoId) ? false : orig(x);
    renderTareoPrincipal();
  });
  ok((await filas()).join() === 'Kevin Ruiz' && await P.evaluate(() => /Personal quitado \(1\)/.test(document.getElementById('tareo-quitados-area').innerText)), 'con la baja en un tareo cerrado: Juan no figura y aparece en «Personal quitado»');
  await P.evaluate(() => document.querySelector('#tareo-quitados-area button').click());
  ok((await filas()).join() === 'Juan Torres,Kevin Ruiz' && await P.evaluate(() => !document.getElementById('tareo-quitados-area')), 'Restaurar funciona aunque la baja esté en un tareo cerrado: vuelve a la tabla y sale de «Personal quitado»');
  await P.evaluate(() => { window.tareoAutorizadoEscribir = window.__origAut; });

  /* ---------- Quitar de todos ---------- */
  await montar();
  await P.evaluate(() => document.querySelector('.tareo-table .tar2-quitar').click());
  await P.evaluate(() => { document.querySelector('#modal-root input[value=todos]').checked = true; TareoArea.qAlcance('todos'); });
  const r2 = await P.evaluate(() => document.getElementById('tpa-resumen').innerText);
  ok(/5 tareos/.test(r2) && /1 tienen asistencia/.test(r2), '«todos»: 5 tareos y 1 con asistencia: ' + r2);
  await P.evaluate(() => { TareoArea.qConfirmar(); });
  ok(await P.evaluate(() => window.__alertas.some(a => /casilla/.test(a))) && await tiene('m-1', 'Juan Torres'), 'si hay marcaciones, sin marcar la casilla no se quita nada');
  await P.evaluate(() => { document.getElementById('tpa-confirma').checked = true; TareoArea.qConfirmar(); });
  ok(!(await tiene('m-1', 'Juan Torres')) && !(await tiene('m1', 'Juan Torres')), '«todos»: sale de todos los tareos del área');

  /* ---------- Personal nuevo agregado a tareos: registrarlo en Trabajadores ---------- */
  await montar();
  await P.evaluate(() => {
    _workersReady = true; window.__alertas = [];
    // Armando se agregó como «personal nuevo» a dos tareos y no existe en Trabajadores (como pasó en la planta)
    const arm = { trabajadorId: 'nuevo_abc', nombre: 'ARMANDO QUENAYA YACTAYO', dni: '48449642', cargo: 'Técnico de Mantenimiento', area: 'Mantenimiento', linea: '', nuevoIngreso: true, agregadoManual: true, asistencia: '', horaIngreso: '', horaSalida: '' };
    ['m0', 'm0n'].forEach(id => { const t = obtenerTareos().find(x => x.id === id); t.personal.push(Object.assign({}, arm)); });
    renderTareoPrincipal();
  });
  ok(await P.evaluate(() => /sin registrar en Trabajadores \(1\)/.test(document.getElementById('tareo-sin-registrar').innerText) && /ARMANDO QUENAYA YACTAYO/.test(document.getElementById('tareo-sin-registrar').innerText) && /en 2 tareos/.test(document.getElementById('tareo-sin-registrar').innerText)), 'el Inicio avisa de quién se agregó a tareos y no está en Trabajadores (con DNI y en cuántos tareos)');
  ok((await filas()).join() === 'Juan Torres,Kevin Ruiz', 'mientras no se registre, no sale en la tabla de personal (ni en la rotación)');
  await P.evaluate(() => document.querySelector('#tareo-sin-registrar button').click());
  ok(await P.evaluate(() => loadWorkers().some(w => w.nombre === 'ARMANDO QUENAYA YACTAYO' && w.dni === '48449642' && w.area === 'Mantenimiento' && w.estado === 'Activo' && /Técnico de Mantenimiento/.test(w.cargo) && /^w_/.test(w.id))), '«Registrar en Trabajadores» lo crea: DNI, área Mantenimiento, cargo y estado Activo');
  ok(await P.evaluate(() => !document.getElementById('tareo-sin-registrar')) && (await filas()).some(f => /ARMANDO QUENAYA/i.test(f)), 'después de registrarlo sale en la tabla del Inicio (y por eso en la rotación) y desaparece el aviso');

  /* «Personal nuevo» con la casilla «Registrar también en Trabajadores» */
  await P.evaluate(() => { tareoActualId = 'm0'; window.tareoAbrirAgregarPersonal(); tareoAgregarPersonalModo('nuevo'); });
  ok(await P.evaluate(() => { const c = document.getElementById('tan-registrar'); return !!c && c.checked; }), '«Personal nuevo» trae la casilla «Registrar también en Trabajadores» marcada');
  await P.evaluate(() => { document.getElementById('tan-nombre').value = 'Pedro Nuevo Ramos'; document.getElementById('tan-dni').value = '41111111'; tareoAgregarPersonal(); });
  ok(await P.evaluate(() => { const w = loadWorkers().find(x => x.nombre === 'PEDRO NUEVO RAMOS'); const p = obtenerTareos().find(t => t.id === 'm0').personal.find(x => x.nombre === 'PEDRO NUEVO RAMOS'); return !!w && w.estado === 'Activo' && w.area === 'Mantenimiento' && !!p && p.trabajadorId === w.id; }), 'agrega a la persona al tareo y la registra en Trabajadores, enlazadas por el mismo id');
  await P.evaluate(() => { tareoActualId = 'm0'; window.tareoAbrirAgregarPersonal(); tareoAgregarPersonalModo('nuevo'); document.getElementById('tan-registrar').checked = false; document.getElementById('tan-nombre').value = 'Sin Registro Perez'; document.getElementById('tan-dni').value = '42222222'; tareoAgregarPersonal(); });
  ok(await P.evaluate(() => !loadWorkers().some(w => w.nombre === 'SIN REGISTRO PEREZ') && obtenerTareos().find(t => t.id === 'm0').personal.some(x => x.nombre === 'SIN REGISTRO PEREZ')), 'con la casilla desmarcada solo se agrega al tareo (como antes)');

  /* ---------- Personal por día con rango ---------- */
  await montar();
  await P.evaluate(() => TareoArea.abrirPorDia());
  ok(await P.evaluate(() => /rango de fechas/.test(document.querySelector('#modal-root h3').innerText)), 'se abre la ventana «Agregar personal por día (rango de fechas)»');
  const [d0, d2] = await P.evaluate(() => [window.__dia(-1), window.__dia(2)]);
  await P.evaluate(([a, b]) => {
    const set = (id, v) => { const e = document.getElementById('tpa-' + id); e.value = v; };
    set('nombre', 'Yefre Lopes'); set('desde', a); set('hasta', b); set('turnos', 'ambos'); set('ingreso', '07:00'); set('salida', '15:00'); TareoArea.dCambia();
  }, [d0, d2]);
  const r3 = await P.evaluate(() => document.getElementById('tpa-resumen').innerText);
  ok(/5 tareos/.test(r3) && /sin tareo/.test(r3), 'vista previa: 5 tareos existentes y avisa de los turnos del rango sin tareo creado: ' + r3);
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/personal-area-por-dia.png' });
  await P.evaluate(() => TareoArea.dConfirmar());
  ok(['m-1', 'm-1n', 'm0', 'm0n', 'm1'].every(id => true) && await P.evaluate(() => ['m-1', 'm-1n', 'm0', 'm0n', 'm1'].every(id => window.__pd(id).join() === 'Yefre Lopes')), 'Yefre queda como personal por día en los 5 tareos del rango');
  const pd = await P.evaluate(() => obtenerTareos().find(t => t.id === 'm0').personalPorDia[0]);
  ok(pd && pd.tipo === 'POR DÍA' && pd.horaIngreso === '07:00' && pd.horaSalida === '15:00' && pd.rango && pd.rango.desde === d0 && pd.registradoPor === 'Admin', 'cada tareo lo guarda con tipo, horas, el rango y quién lo registró');
  // repetir no duplica
  await P.evaluate(() => TareoArea.abrirPorDia());
  await P.evaluate(([a, b]) => { const set = (id, v) => { document.getElementById('tpa-' + id).value = v; }; set('nombre', 'yefre  lopes'); set('desde', a); set('hasta', b); TareoArea.dCambia(); }, [d0, d2]);
  const r4 = await P.evaluate(() => document.getElementById('tpa-resumen').innerText);
  ok(/0 tareos/.test(r4) && /5 ya lo tienen/.test(r4), 'repetir el rango no duplica: ' + r4);
  await P.evaluate(() => TareoArea.cerrar());
  /* ---------- Quitar personal por día: desde una fecha / rango / repetidos / todos ---------- */
  ok(await P.evaluate(() => /Personal por día \(1\)/.test(document.getElementById('tareo-por-dia-area').innerText) && /5 tareos/.test(document.getElementById('tareo-por-dia-area').innerText)), 'el Inicio lista al personal por día con cuántos tareos y entre qué fechas');
  // un repetido en el tareo de hoy (como pasó con Yefre en el del 11/11)
  await P.evaluate(() => { const t = obtenerTareos().find(x => x.id === 'm0'); t.personalPorDia.push(Object.assign({}, t.personalPorDia[0], { id: 'pd_rep_1', creadoEn: Date.now() + 5 })); renderTareoPrincipal(); });
  ok(await P.evaluate(() => /repetido en 1 lugar/.test(document.getElementById('tareo-por-dia-area').innerText) && [...document.querySelectorAll('#tareo-por-dia-area button')].some(b => /Quitar repetidos/.test(b.innerText))), 'avisa cuando la persona está repetida y ofrece «Quitar repetidos»');
  await P.evaluate(() => { [...document.querySelectorAll('#tareo-por-dia-area button')].find(b => /Quitar repetidos/.test(b.innerText)).click(); });
  ok(await P.evaluate(() => window.__pd('m0').length === 1), '«Quitar repetidos» deja una sola vez a la persona (y no toca los demás tareos)');
  await P.evaluate(() => [...document.querySelectorAll('#tareo-por-dia-area .tar2-quitar')][0].click());
  ok(await P.evaluate(() => /Quitar a Yefre Lopes \(personal por día\)/.test(document.querySelector('#modal-root h3').innerText) && [...document.querySelectorAll('#modal-root input[name=tpa-pd]')].map(i => i.value).join() === 'desde,rango,todos'), 'se abre la ventana con tres opciones: desde una fecha, rango y todos');
  const dh = await P.evaluate(() => window.__dia(0));
  await P.evaluate(([a, b]) => { document.querySelector('#modal-root input[value=rango]').checked = true; TareoArea.pdTipo('rango'); TareoArea.pdFecha('desde', a); TareoArea.pdFecha('hasta', b); }, [dh, dh]);
  ok(/2 tareos/.test(await P.evaluate(() => document.getElementById('tpa-resumen').innerText)), 'rango «solo hoy»: 2 tareos (Día y Noche)');
  await P.evaluate(() => TareoArea.pdConfirmar());
  ok(await P.evaluate(() => window.__pd('m0').length === 0 && window.__pd('m0n').length === 0 && window.__pd('m-1').length === 1 && window.__pd('m1').length === 1), 'el rango quita solo de hoy; ayer y mañana siguen');
  ok(await P.evaluate(() => obtenerTareos().find(t => t.id === 'm0').personalPorDia.every(p => p.eliminada && p.eliminadaPor === 'Admin')), 'es una baja lógica (queda marcada como eliminada, con quién la hizo)');
  await P.evaluate(() => [...document.querySelectorAll('#tareo-por-dia-area .tar2-quitar')][0].click());
  const dm1 = await P.evaluate(() => window.__dia(1));
  await P.evaluate(a => { TareoArea.pdFecha('desde', a); }, dm1);
  ok(/1 tareo\b/.test(await P.evaluate(() => document.getElementById('tpa-resumen').innerText)), '«desde mañana»: 1 tareo');
  await P.evaluate(() => TareoArea.pdConfirmar());
  ok(await P.evaluate(() => window.__pd('m1').length === 0 && window.__pd('m-1').length === 1), '«desde una fecha» quita de esa fecha en adelante y no toca los anteriores');
  await P.evaluate(() => [...document.querySelectorAll('#tareo-por-dia-area .tar2-quitar')][0].click());
  await P.evaluate(() => { document.querySelector('#modal-root input[value=todos]').checked = true; TareoArea.pdTipo('todos'); TareoArea.pdConfirmar(); });
  ok(await P.evaluate(() => ['m-1', 'm-1n', 'm0', 'm0n', 'm1'].every(id => window.__pd(id).length === 0) && !document.getElementById('tareo-por-dia-area')), '«todos» lo quita de todos los tareos y desaparece del panel');
  /* ---------- Historial: el personal por día se busca y se ve con sus horas ---------- */
  await montar();
  await P.evaluate(() => {
    const mkpd = (id, nom, ing, sal) => ({ id, tipo: 'POR DÍA', nombre: nom, dni: '47000000', area: 'Soldador', horaIngreso: ing, horaSalida: sal, creadoEn: 1, actualizadoEn: 1 });
    obtenerTareos().find(t => t.id === 'm0').personalPorDia = [mkpd('pd1', 'YEFRE LOPES', '07:00', '15:00'), mkpd('pd2', 'OTRO POR DIA', '07:00', '')];
    obtenerTareos().find(t => t.id === 'm0n').personalPorDia = [mkpd('pd3', 'YEFRE LOPES', '', '')];
    tareoFiltroHistorial = { desde: '', hasta: '', turno: '', estado: '', texto: 'yefre' }; tareoFiltroAreaHistorial = '';
    renderHistorialTareo();
  });
  const filasHist = await P.evaluate(() => [...document.querySelectorAll('#main .tareo-table tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')));
  ok(filasHist.length === 2 && filasHist.every(f => /YEFRE LOPES/.test(f)), 'buscar «yefre» en el Historial encuentra los tareos donde está como personal por día (antes no salía): ' + filasHist.length);
  ok(filasHist.some(f => /YEFRE LOPES · 07:00–15:00/.test(f)) && filasHist.some(f => /YEFRE LOPES · sin horas/.test(f)), 'la columna «Por día» muestra su nombre y sus horas, o qué le falta (sin horas / sin salida)');
  await P.evaluate(() => { tareoFiltroHistorial.texto = '47000000'; renderHistorialTareo(); });
  ok(await P.evaluate(() => document.querySelectorAll('#main .tareo-table tbody tr').length) === 2, 'también se encuentra por DNI');
  await P.evaluate(() => { tareoFiltroHistorial = { desde: '', hasta: '', turno: '', estado: '', texto: '' }; });
  // validaciones
  await P.evaluate(() => TareoArea.abrirPorDia());
  await P.evaluate(() => { document.getElementById('tpa-nombre').value = 'Otro'; document.getElementById('tpa-desde').value = window.__dia(3); document.getElementById('tpa-hasta').value = window.__dia(1); TareoArea.dCambia(); });
  ok(await P.evaluate(() => /no puede ser posterior/.test(document.getElementById('tpa-resumen').innerText)), '«Desde» posterior a «Hasta» se rechaza');
  await H.cerrar();
  console.log(fallas ? fallas + ' falla(s)' : 'Todo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
