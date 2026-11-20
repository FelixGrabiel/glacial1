/* Tareo de Mantenimiento: QUITAR y AGREGAR personal con alcance (solo este tareo · desde una fecha · todos los tareos), en navegador real.
   Uso: GLX_LIBS=/ruta node tests/tareo-quitar-agregar.e2e.js (no forma parte de las pruebas rápidas). GLX_CAPTURAS=/carpeta guarda capturas. */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };

(async () => {
  const H = await iniciar(); const D = await H.abrir(1400, 950); const P = D.page;
  const montar = () => P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Administrador', nombre: 'Admin', username: 'admin', permisos: 'todos' }; state.showWelcome = false; window._recordsReady = true;
    window.__alertas = []; window.alert = m => window.__alertas.push(String(m)); window.confirm = () => true;
    const dia = d => { const f = new Date(obtenerFechaHoy() + 'T00:00:00'); f.setDate(f.getDate() + d); return f.toISOString().slice(0, 10); };
    const Pp = (id, nom, extra) => Object.assign({ id, trabajadorId: id, nombre: nom, dni: '4000' + id.replace(/\D/g, '').padStart(4, '0'), cargo: 'Técnico', linea: 'Mtto', asistencia: '', horaIngreso: '', horaSalida: '' }, extra || {});
    const mk = (id, area, turno, d, pers) => ({ id, fecha: dia(d), turno, area, estado: 'Abierto', jornadaNormal: 8, creadoPor: 'admin', personal: pers });
    const juan = x => Pp('t1', 'Juan Torres', x);
    _workersCache = [{ id: 'w9', nombre: 'Zoe Nueva', dni: '47000001', cargo: 'Técnico', estado: 'Activo', area: 'Mantenimiento' }];
    _tareosCache = [
      mk('m-2', 'Mantenimiento', 'Día', -2, [juan({ asistencia: 'Asistió', horaIngreso: '07:00', horaSalida: '15:00' }), Pp('t2', 'Kevin Ruiz')]),
      mk('m-1', 'Mantenimiento', 'Día', -1, [juan(), Pp('t2', 'Kevin Ruiz')]),
      mk('m0', 'Mantenimiento', 'Día', 0, [juan({ asistencia: 'Asistió', horaIngreso: '07:00' }), Pp('t2', 'Kevin Ruiz')]),
      mk('m0n', 'Mantenimiento', 'Noche', 0, [juan(), Pp('t2', 'Kevin Ruiz')]),
      mk('m1', 'Mantenimiento', 'Día', 1, [juan(), Pp('t2', 'Kevin Ruiz')]),
      mk('p0', 'Producción', 'Día', 0, [juan({ area: 'Producción' }), Pp('t3', 'Luis Prado')])
    ];
    window.__dia = dia; window.__ids = (id) => obtenerTareos().find(t => t.id === id).personal.map(p => p.nombre);
    tareoActualId = 'm0'; renderTareoFormulario(obtenerTareos().find(t => t.id === 'm0'));
  });
  const tiene = (id, nombre) => P.evaluate(([id, nombre]) => window.__ids(id).includes(nombre), [id, nombre]);
  const abrirQuitar = () => P.evaluate(() => { tareoActualId = 'm0'; const t = tareoObtenerActual(); const k = TareoEd.clavesUnicas(t.personal)[t.personal.findIndex(p => p.nombre === 'Juan Torres')]; TareoEd.quitarPersonal(k); });

  /* ---------- Quitar: la ventana ---------- */
  await montar();
  ok(await P.evaluate(() => !!document.querySelector('.tar2-quitar')), 'el tareo de Mantenimiento muestra «✕ Quitar» en cada fila');
  await abrirQuitar();
  ok(await P.evaluate(() => !!document.querySelector('#modal-root .modal') && /Quitar a Juan Torres/.test(document.querySelector('#modal-root h3').innerText)), 'Quitar abre una ventana con el nombre de la persona (ya no son dos confirmaciones sueltas)');
  ok(await P.evaluate(() => [...document.querySelectorAll('#modal-root input[name=tar2-qm-alcance]')].map(i => i.value).join()) === 'este,desde,todos', 'tres opciones: solo este tareo, desde una fecha y todos los tareos');
  ok(await P.evaluate(() => document.querySelector('#modal-root input[name=tar2-qm-alcance]:checked').value) === 'este' && /Solo este tareo|este tareo/i.test(await P.evaluate(() => document.getElementById('tar2-qm-resumen').innerText)), 'por defecto: solo este tareo');
  ok(await P.evaluate(() => /asistencia u horas registradas/.test(document.querySelector('#modal-root').innerText)), 'avisa que la persona tiene marcaciones en este tareo');
  await P.evaluate(() => { const r = document.querySelector('#modal-root input[value=desde]'); r.checked = true; TareoEd.qmAlcance('desde'); });
  const dm1 = await P.evaluate(() => window.__dia(-1));
  await P.evaluate(d => { const f = document.getElementById('tar2-qm-fecha'); f.value = d; TareoEd.qmFecha(d); }, dm1);
  const res = await P.evaluate(() => document.getElementById('tar2-qm-resumen').innerText);
  ok(/4 tareos/.test(res) && /1 tienen asistencia/.test(res), 'vista previa «desde ayer»: 4 tareos (ayer, hoy día, hoy noche y mañana) y 1 con marcaciones: ' + res);
  ok(await P.evaluate(() => document.getElementById('tar2-qm-confirma-fila').hidden === false), 'aparece la casilla de confirmación porque se perderían marcaciones');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/quitar-ventana.png' });
  await P.evaluate(() => TareoEd.qmConfirmar());
  ok(await P.evaluate(() => window.__alertas.some(a => /casilla/.test(a))) && await tiene('m0', 'Juan Torres'), 'sin marcar la casilla no se quita nada y avisa');
  await P.evaluate(() => { document.getElementById('tar2-qm-confirma').checked = true; TareoEd.qmConfirmar(); });
  ok(!(await tiene('m0', 'Juan Torres')) && !(await tiene('m-1', 'Juan Torres')) && !(await tiene('m0n', 'Juan Torres')) && !(await tiene('m1', 'Juan Torres')), 'desde ayer: sale de ayer, hoy (día y noche) y mañana');
  ok(await tiene('m-2', 'Juan Torres'), 'antes de la fecha elegida (anteanoche) NO se toca');
  ok(await tiene('p0', 'Juan Torres') && await tiene('m0', 'Kevin Ruiz'), 'otra área (Producción) y otras personas NO se tocan');
  const ent = await P.evaluate(() => obtenerTareos().find(t => t.id === 'm0').personalExcluido[0]);
  ok(ent && ent.permanente && ent.desde === (await P.evaluate(() => window.__dia(-1))) && ent.alcance === 'desde' && ent.por, 'queda la exclusión con la fecha elegida, el alcance y quién la hizo');
  ok(await P.evaluate(() => window.__alertas.some(a => /de 4 tareos/.test(a))), 'avisa cuántos tareos se tocaron');
  // un tareo NUEVO de Mantenimiento desde esa fecha tampoco la trae
  ok(await P.evaluate(() => { const f = TareoEd.filtroExclusion({ id: '', area: 'Mantenimiento', fecha: window.__dia(3) }); return f(obtenerTareos().find(t => t.id === 'm-2').personal.find(p => p.nombre === 'Juan Torres')); }), 'los tareos que se creen después (desde esa fecha) tampoco la incluyen');
  ok(await P.evaluate(() => { const f = TareoEd.filtroExclusion({ id: '', area: 'Mantenimiento', fecha: window.__dia(-5) }); return !f(obtenerTareos().find(t => t.id === 'm-2').personal.find(p => p.nombre === 'Juan Torres')); }), '…pero fechas anteriores a la elegida no');

  /* ---------- Quitar: todos los tareos + tareo cerrado ---------- */
  await montar();
  await abrirQuitar();
  await P.evaluate(() => { document.querySelector('#modal-root input[value=todos]').checked = true; TareoEd.qmAlcance('todos'); });
  const r2 = await P.evaluate(() => document.getElementById('tar2-qm-resumen').innerText);
  ok(/4 tareos/.test(r2) && /1 cerrado/.test(r2), '«todos»: cuenta los tareos que se pueden modificar y avisa del cerrado (el de hace 2 días lo bloquea el sistema): ' + r2);
  await P.evaluate(() => { document.getElementById('tar2-qm-confirma').checked = true; TareoEd.qmConfirmar(); });
  ok(!(await tiene('m-1', 'Juan Torres')) && !(await tiene('m0', 'Juan Torres')) && !(await tiene('m0n', 'Juan Torres')) && !(await tiene('m1', 'Juan Torres')), '«todos»: sale de ayer, de hoy (día y noche) y de mañana');
  ok(await tiene('m-2', 'Juan Torres'), 'el tareo cerrado por el sistema (hace 2 días) NO se modifica, aunque se pidió «todos»');
  ok(await tiene('p0', 'Juan Torres'), 'Producción no se toca');
  ok(await P.evaluate(() => /cerrado/.test(window.__alertas.join(' '))), 'el aviso final menciona el tareo cerrado');

  /* ---------- Quitar: solo este tareo ---------- */
  await montar(); await abrirQuitar();
  await P.evaluate(() => TareoEd.qmConfirmar());
  ok(!(await tiene('m0', 'Juan Torres')) && await tiene('m-1', 'Juan Torres') && await tiene('m1', 'Juan Torres') && await tiene('m0n', 'Juan Torres'), '«solo este tareo»: se quita de aquí y sigue en los demás');
  ok(await P.evaluate(() => obtenerTareos().find(t => t.id === 'm0').personalExcluido[0].permanente === false), '«solo este tareo» no queda como permanente');

  /* ---------- Agregar ---------- */
  await montar();
  await P.evaluate(() => { tareoActualId = 'm0'; tareoAbrirAgregarPersonal(); });
  ok(await P.evaluate(() => !!document.querySelector('#modal-root input[name=tan-alcance][value=desde]')), 'Agregar personal ofrece «solo este tareo» o «desde una fecha en adelante»');
  const dm2 = await P.evaluate(() => window.__dia(-1));
  await P.evaluate(d => { document.querySelector('#modal-root input[value=desde]').checked = true; tareoAgregarPersonalAlcance('desde'); document.getElementById('tan-desde').value = d; tareoAgregarPersonalFecha(d); tareoAgregarPersonalTurnos('ambos'); }, dm2);
  const txt = await P.evaluate(() => document.getElementById('tan-alcance-texto').innerText);
  ok(/3 tareos más/.test(txt) && /ambos turnos/.test(txt) && !/cerrado/.test(txt), 'vista previa: este tareo y 3 más (ayer, hoy noche y mañana) en ambos turnos: ' + txt);
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/agregar-ventana.png' });
  await P.evaluate(() => { document.getElementById('tareo-agregar-select').value = 'w9'; tareoAgregarPersonal(); });
  ok(await tiene('m0', 'Zoe Nueva') && await tiene('m-1', 'Zoe Nueva') && await tiene('m0n', 'Zoe Nueva') && await tiene('m1', 'Zoe Nueva'), 'desde ayer: se agrega en ayer, hoy (día y noche) y mañana');
  ok(!(await tiene('m-2', 'Zoe Nueva')) && !(await tiene('p0', 'Zoe Nueva')), 'antes de la fecha y en Producción no se agrega');
  ok(await P.evaluate(() => ['m0', 'm-1', 'm0n', 'm1'].every(id => obtenerTareos().find(t => t.id === id).personal.filter(p => p.nombre === 'Zoe Nueva').length === 1)), 'sin duplicados');
  ok(await P.evaluate(() => { const p = obtenerTareos().find(t => t.id === 'm1').personal.find(x => x.nombre === 'Zoe Nueva'); return p.agregadoManual === true && !p.asistencia; }), 'queda marcada como agregada a mano y pendiente de registrar');
  // «solo este tareo» (comportamiento anterior)
  await montar();
  await P.evaluate(() => { tareoActualId = 'm0'; tareoAbrirAgregarPersonal(); document.getElementById('tareo-agregar-select').value = 'w9'; tareoAgregarPersonal(); });
  ok(await tiene('m0', 'Zoe Nueva') && !(await tiene('m-1', 'Zoe Nueva')) && !(await tiene('m1', 'Zoe Nueva')), '«solo este tareo»: se agrega únicamente aquí (comportamiento anterior)');
  // El guardado en la nube es un simulador sin respuesta en esta prueba (error conocido del propio simulador); cualquier otro error sí cuenta.
  const errores = D.errores.filter(e => !/error guardando \(validacion\)/.test(e));
  ok(errores.length === 0, 'sin errores de consola' + (errores.length ? ' → ' + errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar(); console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
