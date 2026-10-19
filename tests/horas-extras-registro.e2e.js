/* Horas extras (registro) en un NAVEGADOR de verdad, con una base simulada en memoria.
   Cubre: formulario (botón apagado + qué falta), total con cruce de medianoche, guardado, choque, edición, anulación, marca «HE» en el tareo, ficha,
   resumen mensual (Total HE), vista general de RRHH y permisos (supervisor de otra área, consulta, técnico con PIN).
   Uso: GLX_LIBS=/ruta node tests/horas-extras-registro.e2e.js   (no forma parte de las pruebas rápidas) */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };

/* base simulada: collection(x).where().where().onSnapshot/get, doc().set/get, runTransaction, add */
const FAKE = `(() => {
  const col = {}; const oyentes = [];
  const docs = n => (col[n] = col[n] || new Map());
  const snapDe = (n, filtros) => { const lista = [...docs(n).entries()].filter(([, d]) => filtros.every(f => f(d))).map(([id, d]) => ({ id, data: () => JSON.parse(JSON.stringify(d)) })); return { docs: lista, empty: !lista.length, size: lista.length, metadata: { fromCache: false, hasPendingWrites: false }, docChanges: () => [], forEach: f => lista.forEach(f) }; };
  const consulta = (n, filtros) => ({
    where(c, op, v) { const f = d => op === '==' ? d[c] === v : op === '>=' ? String(d[c]) >= String(v) : op === '<=' ? String(d[c]) <= String(v) : true; return consulta(n, filtros.concat([f])); },
    orderBy() { return this; }, limit() { return this; },
    get: async () => snapDe(n, filtros),
    onSnapshot(...a) { const cb = a.find(x => typeof x === 'function'); const o = { n, filtros, cb }; oyentes.push(o); setTimeout(() => cb(snapDe(n, filtros)), 0); return () => { const i = oyentes.indexOf(o); if (i >= 0) oyentes.splice(i, 1); }; }
  });
  const avisar = n => oyentes.filter(o => o.n === n).forEach(o => o.cb(snapDe(n, o.filtros)));
  const docRef = (n, id) => ({ id, set: async d => { docs(n).set(id, JSON.parse(JSON.stringify(d))); avisar(n); }, get: async () => ({ exists: docs(n).has(id), data: () => docs(n).get(id) && JSON.parse(JSON.stringify(docs(n).get(id))) }), onSnapshot(...a) { const cb = a.find(x => typeof x === 'function'); setTimeout(() => cb && cb({ exists: docs(n).has(id), data: () => docs(n).get(id), metadata: { fromCache: false, hasPendingWrites: false } }), 0); return () => {}; } });
  window.__col = col;
  const nuevo = { collection: n => Object.assign(consulta(n, []), { doc: id => docRef(n, id || ('auto' + Math.random().toString(36).slice(2))), add: async d => { const id = 'a' + Math.random().toString(36).slice(2); docs(n).set(id, JSON.parse(JSON.stringify(d))); return { id }; } }),
    runTransaction: async fn => { const tx = { get: async r => r.get(), set: (r, d) => { docs(r.__n || 'horasExtras').set(r.id, JSON.parse(JSON.stringify(d))); } }; const r = await fn(tx); avisar('horasExtras'); return r; } };
  const orig = nuevo.collection;
  nuevo.collection = n => { const c = orig(n); const d0 = c.doc; c.doc = id => { const r = d0(id); r.__n = n; return r; }; return c; };
  db.collection = nuevo.collection; db.runTransaction = nuevo.runTransaction;
})();`;

(async () => {
  const H = await iniciar();
  const D = await H.abrir(1500, 900);
  await D.page.evaluate(FAKE);
  const hoy = await D.page.evaluate(() => obtenerFechaHoy());
  await D.page.evaluate(([hoy]) => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    document.documentElement.style.overflow = 'auto'; document.body.style.overflow = 'auto'; document.body.style.height = 'auto';
    state.user = { rol: 'Supervisor', nombre: 'M. Díaz', username: 'mdiaz', permisos: ['tareoProduccion', 'horasExtras', 'tareoGeneral'] }; state.showWelcome = false; window._recordsReady = true;
    _usersCache = [{ username: 'rtorres', nombre: 'R. Torres', rol: 'Jefe de Operaciones' }, { username: 'jprod', nombre: 'J. Prod', rol: 'Jefe de Producción' }, { username: 'otro', nombre: 'Operario X', rol: 'Operario' }];
    const P = (id, nombre, dni, cargo) => ({ id, trabajadorId: id, nombre, dni, cargo, asistencia: 'Asistió', horaIngreso: '07:00' });
    _tareosCache = [{ id: 'tp1', fecha: hoy, turno: 'Día', area: 'Producción', estado: 'Abierto', jornadaNormal: 8, creadoPor: 'mdiaz', personal: [P('t1', 'Pérez Ramos, Luis', '12345678', 'Operario'), P('t2', 'Quispe, Ana', '87654321', 'Operaria'), P('t3', 'Mamani, José', '11112222', 'Operario')], personalPorDia: [] }];
    Object.defineProperty(auth, 'currentUser', { value: { uid: 'uid-mdiaz' }, configurable: true });
    window.tareoAuditoriaRegistrar = ev => { (window.__aud = window.__aud || []).push(ev); };
    window.tareoAuditoriaEvento = (t, accion, campo, extra) => Object.assign({ accion, campo, area: t.area }, extra);
    window.glacialHorasExtras.__poner('produccion', []);
    renderTareoPrincipal && 0;
  }, [hoy]);
  await D.page.evaluate(() => renderHorasExtrasRegistro());
  await D.page.waitForSelector('#he-form');
  const tabs = await D.page.evaluate(() => [...document.querySelectorAll('.tareo-tab')].map(t => t.textContent.trim()));
  ok(tabs.includes('Horas extras'), 'el Tareo tiene la pestaña «Horas extras»: ' + tabs.join(' · '));
  ok(await D.page.evaluate(() => document.getElementById('he-guardar').disabled === true && /Falta: el trabajador/.test(document.getElementById('he-falta').textContent)), 'Guardar está apagado y dice qué falta');
  const opts = await D.page.evaluate(() => ({ aut: [...document.querySelectorAll('#he-aut option')].map(o => o.textContent.trim()), mot: [...document.querySelectorAll('#he-motivo option')].map(o => o.textContent.trim()), trab: document.querySelectorAll('#he-trab option').length }));
  ok(opts.aut.length === 3 && !opts.aut.some(a => /Operario X/.test(a)) && opts.mot.includes('Cobertura de falta / descanso') && opts.trab === 4, '«Autorizado por» solo lista jefatura/supervisión; motivos de la lista; trabajadores del tareo del día');
  /* llenar */
  const llenar = async (trab, ini, fin, mot, just, aut) => {
    await D.page.selectOption('#he-trab', { index: trab }); await D.page.fill('#he-ini', ini); await D.page.fill('#he-fin', fin);
    await D.page.selectOption('#he-motivo', { label: mot }); await D.page.fill('#he-just', just); await D.page.selectOption('#he-aut', { label: aut });
  };
  await llenar(2, '19:00', '22:30', 'Cobertura de falta / descanso', 'corto', 'R. Torres · Jefe de Operaciones');
  ok(await D.page.evaluate(() => document.getElementById('he-guardar').disabled && /justificación \(5\/15/.test(document.getElementById('he-falta').textContent) && document.getElementById('he-total').value === '3,5 h'), 'con la justificación corta sigue apagado (5/15) y el total es 3,5 h');
  await D.page.fill('#he-just', 'Cubre a un compañero con descanso médico');
  ok(await D.page.evaluate(() => !document.getElementById('he-guardar').disabled && document.getElementById('he-falta').textContent === ''), 'al completar todo, Guardar se enciende');
  await D.page.click('#he-guardar');
  await D.page.waitForFunction(() => [...document.querySelectorAll('#he-tabla tbody tr')].some(r => /Pérez Ramos/.test(r.textContent)));
  const g = await D.page.evaluate(() => { const r = [...window.__col.horasExtras.values()][0]; return { r, n: window.__col.horasExtras.size, aud: (window.__aud || []).map(a => a.accion) }; });
  ok(g.n === 1 && g.r.totalHoras === 3.5 && g.r.area === 'produccion' && g.r.autorizadoPor === 'rtorres' && g.r.autorizadoEn > 0 && g.r.registradoPor === 'mdiaz' && g.r.registradoUid === 'uid-mdiaz' && /^produccion_/.test(g.r.id) && g.r.version === 1, 'se guardó con área, horas, autorizador (con hora), registrador y uid');
  ok(JSON.stringify(g.aud) === '["CREAR_HORAS_EXTRAS"]', 'quedó en la bitácora: ' + g.aud.join(','));
  const k = await D.page.evaluate(() => [...document.querySelectorAll('.he-kpis b')].map(b => b.textContent));
  ok(k[0] === '3,5 h' && k[1] === '1' && k[2] === '0', 'tarjetas: 3,5 h · 1 trabajador · 0 sin autorizar → ' + k.join(' | '));
  const fila = await D.page.evaluate(() => document.querySelector('#he-tabla tbody tr').innerText.replace(/\s+/g, ' '));
  ok(/19:00–22:30/.test(fila) && /Cobertura de falta/.test(fila) && /R\. Torres/.test(fila) && /M\. Díaz/.test(fila), 'la tabla muestra horario, justificación, quién autorizó y quién registró');
  if (process.env.GLX_CAPTURAS) await D.page.screenshot({ path: process.env.GLX_CAPTURAS + '/horas-extras.png', fullPage: true });
  /* choque */
  await llenar(2, '22:00', '23:00', 'Otro', 'Otro tramo que se solapa con el anterior', 'R. Torres · Jefe de Operaciones');
  await D.page.click('#he-guardar'); await D.page.waitForFunction(() => /Choca con otro registro/.test(document.getElementById('he-error').textContent));
  ok(await D.page.evaluate(() => window.__col.horasExtras.size === 1), 'un tramo solapado de la misma persona se rechaza con aviso y no se guarda');
  /* cruce de medianoche */
  await llenar(3, '22:00', '02:00', 'Parada o avería', 'Recuperar volumen tras falla de llenadora', 'J. Prod · Jefe de Producción');
  ok(await D.page.evaluate(() => document.getElementById('he-total').value === '4 h'), '22:00 → 02:00 cuenta 4 h (cruza medianoche)');
  await D.page.click('#he-guardar'); await D.page.waitForFunction(() => window.__col.horasExtras.size === 2);
  /* marca en el tareo, ficha, resumen */
  await D.page.evaluate(() => { glacialHorasExtras.vista('registro'); });
  const html = await D.page.evaluate(([hoy]) => { const t = _tareosCache[0]; return { m1: glacialHorasExtras.marca(t.personal.find(p => p.id === 't1'), t.id), m3: glacialHorasExtras.marca(t.personal.find(p => p.id === 't3'), t.id), f: glacialHorasExtras.fichaHtml('t1', hoy) }; }, [hoy]);
  ok(/HE 3,5 h/.test(html.m1) && html.m3 === '', 'la marca «HE 3,5 h» sale solo para quien tiene horas extras');
  ok(/Total HE del mes: 3,5 h/.test(html.f), 'la ficha tiene «Horas extras del mes» con su total');
  const res = await D.page.evaluate(([hoy]) => { const [y, m] = hoy.split('-').map(Number); return glacialHorasExtras.decorarResumen([{ trabajadorId: 't1', dni: '12345678', nombre: 'Pérez Ramos, Luis', area: 'Producción' }, { trabajadorId: 't3', dni: '11112222', nombre: 'Mamani, José', area: 'Producción' }], y, m).map(x => x.totalHE); }, [hoy]);
  ok(JSON.stringify(res) === '[3.5,0]', 'Resumen mensual: «Total HE» por persona = ' + JSON.stringify(res));
  const ex = await D.page.evaluate(([hoy]) => { const [y, m] = hoy.split('-').map(Number); return glacialHorasExtras.filasExcel(y, m, 'Producción'); }, [hoy]);
  ok(ex.length === 2 && ex[0]['Justificación'] && ex[0]['Autorizó'] && ex[0]['Autorizado el'] && ex[0]['Estado'] === 'Vigente', 'la hoja «Horas extras» del Excel trae justificación y autorizador');
  /* editar */
  await D.page.evaluate(() => renderHorasExtrasRegistro());
  await D.page.click('#he-tabla tbody tr >> text=Editar');
  await D.page.fill('#he-fin', '23:00'); await D.page.click('#he-guardar');
  await D.page.waitForFunction(() => [...window.__col.horasExtras.values()].some(r => r.horaFin === '23:00' && r.version === 2));
  ok(await D.page.evaluate(() => (window.__aud || []).some(a => a.accion === 'EDITAR_HORAS_EXTRAS' && a.estadoAnterior && a.estadoAnterior.horaFin === '22:30' && a.estadoNuevo.horaFin === '23:00')), 'editar guarda la versión 2 y la bitácora lleva antes/después');
  /* anular */
  await D.page.click('#he-tabla tbody tr >> text=Anular');
  await D.page.waitForSelector('#he-motivo-anular');
  await D.page.fill('#he-motivo-anular', 'x'); await D.page.click('.he-acciones .btn-primary >> text=Anular');
  ok(await D.page.evaluate(() => /mínimo 5/.test(document.getElementById('he-error-anular').textContent)), 'anular pide un motivo de al menos 5 caracteres');
  await D.page.fill('#he-motivo-anular', 'Registrado por error de persona'); await D.page.click('.he-acciones .btn-primary >> text=Anular');
  await D.page.waitForFunction(() => [...window.__col.horasExtras.values()].some(r => r.estado === 'ANULADO'));
  ok(await D.page.evaluate(() => { const a = [...window.__col.horasExtras.values()].find(r => r.estado === 'ANULADO'); return !!a && a.motivoAnulacion === 'Registrado por error de persona' && a.anuladoPor === 'mdiaz' && window.__col.horasExtras.size === 2; }), 'anular no borra: queda ANULADO con motivo y autor');
  /* sin autorizador: registro antiguo */
  await D.page.evaluate(([hoy]) => { const viejo = { id: 'produccion_' + hoy + '_viejo', area: 'produccion', trabajadorId: 't3', trabajadorNombre: 'Mamani, José', dni: '11112222', fecha: hoy, turno: 'Día', horaInicio: '13:00', horaFin: '15:00', totalHoras: 2, motivo: 'Otro', justificacion: '', autorizadoPor: '', estado: 'VIGENTE', version: 1 }; glacialHorasExtras.__poner('produccion', glacialHorasExtras.todos().filter(r => r.area === 'produccion').concat([viejo])); }, [hoy]);
  await D.page.evaluate(() => { glacialHorasExtras.area('produccion'); });
  await D.page.waitForTimeout(300);
  ok(await D.page.evaluate(() => /Sin autorizar/.test(document.getElementById('he-tabla').innerText) && !!document.querySelector('.he-sinaut')), 'un registro sin autorizador se marca en naranja («Sin autorizar»)');
  /* permisos */
  const perm = await D.page.evaluate(() => {
    const prueba = u => { state.user = u; return JSON.stringify([glacialHorasExtras.acceso().escribir, glacialHorasExtras.acceso().ver, glacialHorasExtras.acceso().general]); };
    return {
      sup: prueba({ rol: 'Supervisor', username: 's', permisos: ['tareoProduccion', 'horasExtras'] }),
      supSin: prueba({ rol: 'Supervisor', username: 's', permisos: ['tareoProduccion'] }),
      jefe: prueba({ rol: 'Jefe de Operaciones', username: 'j', permisos: ['ver_tareo_produccion', 'ver_tareo_mantenimiento', 'tareoGeneral'] }),
      rrhh: prueba({ rol: 'RRHH', username: 'r', permisos: ['moduloRRHH', 'horasExtras'] }),
      mtto: prueba({ rol: 'Mantenimiento', username: 'm', permisos: ['moduloMantenimiento', 'horasExtras'] }),
      admin: prueba({ rol: 'Administrador', username: 'a', permisos: 'todos' })
    };
  });
  ok(perm.sup === '[["produccion"],["produccion"],false]', 'supervisor con el permiso: escribe solo Producción');
  ok(JSON.parse(perm.supSin)[0].length === 0 && JSON.parse(perm.supSin)[1].length === 1, 'supervisor SIN el permiso «horasExtras»: ve pero no registra');
  ok(JSON.parse(perm.jefe)[0].length === 0 && JSON.parse(perm.jefe)[1].length === 2 && JSON.parse(perm.jefe)[2] === true, 'jefatura de solo consulta: ve ambas áreas, no escribe');
  ok(JSON.parse(perm.rrhh)[0].length === 2 && JSON.parse(perm.rrhh)[2] === true, 'RRHH: escribe y ve ambas áreas, con vista general');
  ok(JSON.parse(perm.mtto)[0].join() === 'mantenimiento', 'Mantenimiento con el permiso: solo su área');
  ok(JSON.parse(perm.admin)[0].length === 2, 'Administrador: ambas áreas');
  /* vista general de RRHH */
  await D.page.evaluate(() => { state.user = { rol: 'RRHH', username: 'r', nombre: 'RRHH', permisos: ['moduloRRHH', 'horasExtras'] }; glacialHorasExtras.__poner('mantenimiento', [{ id: 'mantenimiento_2026-10-01_x', area: 'mantenimiento', trabajadorId: 'm1', trabajadorNombre: 'Téc. Uno', fecha: '2026-10-01', turno: 'Día', horaInicio: '08:00', horaFin: '10:00', totalHoras: 2, motivo: 'Correctivo / avería', justificacion: 'Cambio de rodamiento en llenadora', equipoLinea: 'Llenadora PET1', autorizadoPor: 'rtorres', autorizadoPorNombre: 'R. Torres', estado: 'VIGENTE', version: 1 }]); glacialHorasExtras.vista('general'); });
  await D.page.waitForSelector('#he-filtros');
  const gen = await D.page.evaluate(() => ({ filas: document.querySelectorAll('#he-cuerpo .he-tabla tbody tr').length, areas: [...document.querySelectorAll('#hf-area option')].map(o => o.textContent) }));
  ok(gen.filas >= 2 && gen.areas.join() === 'Ambas,Producción,Mantenimiento', 'vista general: registros de ambas áreas y filtro de área: ' + gen.filas + ' filas');
  await D.page.fill('#hf-trabajador', 'Téc'); await D.page.waitForTimeout(200);
  ok(await D.page.evaluate(() => document.querySelectorAll('#he-cuerpo .he-tabla tbody tr').length === 1), 'el filtro por trabajador funciona');
  /* técnico con PIN: solo lo suyo */
  const pin = await D.page.evaluate(() => { window.esMantCompartido = () => true; window.mantTecnicoActivo = () => ({ workerId: 'm1', nombre: 'Téc. Uno' }); state.user = { rol: 'mantenimiento_compartido', username: 'mc', permisos: ['ver_tareo_mantenimiento'] }; const l = glacialHorasExtras.todos(); return { n: l.length, nombres: l.map(r => r.trabajadorNombre), escribe: glacialHorasExtras.acceso().escribir.length }; });
  ok(pin.n === 1 && pin.nombres[0] === 'Téc. Uno' && pin.escribe === 0, 'técnico con PIN: ve solo sus horas extras y no registra');
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
