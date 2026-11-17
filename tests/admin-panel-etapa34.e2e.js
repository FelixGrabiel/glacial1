/* Panel de Administración · etapas 3 y 4 en un navegador de verdad. Uso: GLX_LIBS=/ruta node tests/admin-panel-etapa34.e2e.js. GLX_CAPTURAS=/carpeta guarda capturas. */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1400, 1000); const P = D.page;
  await P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('report-select-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Administrador', nombre: 'Félix', username: 'admin', permisos: 'todos' }; state.showWelcome = false;
    window.__esc = { adminAuditoria: [], auditoriaTareos: [], apAuditoria: [], insumosAuditoria: [], auditoriaRegistros: [], ampliacionesTurno: [] }; window.__oy = {}; window.__escritos = [];
    const cfg = { tolerancias: null, roles: null, anuncio: null, mantenimiento: null }; window.__cfg = cfg; window.__cfgOy = {}; window.__salud = null;
    const t = Date.now();
    window.__esc.auditoriaRegistros = [{ id: 'e1', data: { timestamp: t - 5000, usuario: 'Sup Pedro', accion: 'ELIMINAR', registroId: 'rep_borrado', linea: 'PET1', fecha: '2026-11-16', turno: 'DÍA', motivo: 'duplicado del turno', copia: { id: 'rep_borrado', linea: 'PET1', fecha: '2026-11-16', turno: 'DÍA', estadoRegistro: 'FINALIZADO' } } },
      { id: 'e2', data: { timestamp: t - 9000, usuario: 'Sup Ana', accion: 'ELIMINAR', registroId: 'rep_existente', linea: 'PET2', fecha: '2026-11-15', turno: 'DÍA', motivo: 'ya restaurado', copia: { id: 'rep_existente', linea: 'PET2' } } }];
    window.__esc.ampliacionesTurno = [{ id: 'a1', data: { creadoEnMs: t - 3600000, fechaOperativa: '2026-11-16', turno: 'NOCHE', minutos: 30, estado: 'ACTIVA', motivo: 'ajuste de cierre' } }];
    window.__almc = [{ id: 'al1', nombre: 'Luis Ramos', activo: true, hash: 'x', salt: 'y' }, { id: 'al2', nombre: 'Rosa Vega', activo: true }];
    const mk = (n, lista) => ({ orderBy() { return this; }, limit() { return this; }, onSnapshot(cb) { (window.__oy[n] = window.__oy[n] || []).push(cb); cb({ docs: lista().map(x => ({ id: x.id, data: () => x.data || x })) }); return () => {}; }, doc: id => ({ __id: id, set: async d => { window.__escritos.push({ n, id, d }); if (n === 'almaceneros') { const i = window.__almc.findIndex(a => a.id === id); if (i >= 0) window.__almc[i] = d; else window.__almc.push(d); (window.__oy[n] || []).forEach(cb => cb({ docs: window.__almc.map(x => ({ id: x.id, data: () => x })) })); } } }) });
    const orig = db.collection.bind(db);
    db.collection = n => {
      if (window.__esc[n]) return mk(n, () => window.__esc[n]);
      if (n === 'almaceneros') return mk(n, () => window.__almc);
      if (n === 'adminConfig') return { doc: id => ({ __id: id, onSnapshot(cb) { (window.__cfgOy[id] = window.__cfgOy[id] || []).push(cb); cb({ exists: !!cfg[id], data: () => cfg[id] }); return () => {}; } }) };
      if (n === 'saludSistema') return { doc: () => ({ onSnapshot(cb) { cb({ exists: !!window.__salud, data: () => window.__salud }); return () => {}; } }) };
      if (n === 'sync') { const o = orig(n); return { doc: id => (['workers', 'tecnicosMant'].includes(id) ? { onSnapshot(cb) { cb({ exists: id === 'tecnicosMant', data: () => ({ items: [{ nombre: 'Téc. Mario', hash: 'h', activo: true }] }) }); return () => {}; } } : o.doc(id)) }; }
      return orig(n);
    };
    db.runTransaction = async fn => { const tx = { get: async ref => ({ exists: !!cfg[ref.__id], data: () => cfg[ref.__id] }), set: (ref, d) => { window.__escritos.push({ n: 'adminConfig', id: ref.__id, d }); cfg[ref.__id] = d; (window.__cfgOy[ref.__id] || []).forEach(cb => cb({ exists: true, data: () => d })); } }; return fn(tx); };
    _usersCache = [{ username: 'admin', nombre: 'Félix', rol: 'Administrador', permisos: 'todos' }, { username: 'pedro', nombre: 'Pedro', rol: 'Supervisor', permisos: ['paletas', 'recibirAlertasProduccion'], password: 'SECRETO', passwordHash: 'H', salt: 'S', authUid: 'u9' }];
    _workersCache = [{ id: 'w1', nombre: 'Luis Pérez', dni: '111', area: 'Producción', cargo: 'OP', linea: 'PET1', estado: 'Activo' }, { id: 'w2', nombre: 'Rosa Díaz', dni: '222', area: 'Mantenimiento', cargo: 'Técnico', linea: '', estado: 'Activo' }];
    window.__guardadoW = null; saveWorkers = lista => { window.__guardadoW = JSON.parse(JSON.stringify(lista)); _workersCache = JSON.parse(JSON.stringify(lista)); };
    loadRecords = () => window.__recs; window.__recs = [{ id: 'rep_existente', linea: 'PET2', fecha: '2026-11-15', turno: 'DÍA', estadoRegistro: 'FINALIZADO', actualizadoPor: 'Sup Ana' }, { id: 'rep1', linea: 'PET1', fecha: '2026-11-17', turno: 'DÍA', estadoRegistro: 'FINALIZADO', actualizadoPor: 'Sup Pedro' }];
    window.__llamadas = []; usuarioPuedeReabrirReporte = () => true; reabrirReporteProduccion = async id => { window.__llamadas.push('reabrir:' + id); }; deleteRecord = async id => { window.__llamadas.push('eliminar:' + id); };
    window.__recGuardados = null; saveRecords = async l => { window.__recGuardados = JSON.parse(JSON.stringify(l)); window.__recs = l; return true; };
    comprobarMigracion = async () => ({ total: 2, sinCuentaSegura: ['viejo1'], conRestosDeClave: [], sinPerfil: [], rolDistinto: ['pedro'], sinAcceso: [], perfilesSobrantes: [], adminOk: true });
    window.__descargas = []; URL.createObjectURL = b => { window.__descargas.push(b); return 'blob:x'; }; HTMLAnchorElement.prototype.click = function () { window.__clicks = (window.__clicks || 0) + 1; };
    glacialAlmaceneros.estado.lista = window.__almc.slice();
    renderSidebar(); goAdminPanel();
  });
  await P.waitForSelector('.adm');
  const txt = () => P.evaluate(() => document.querySelector('.adm').innerText.replace(/\s+/g, ' '));
  const ir = async id => { await P.evaluate(i => admIr(i), id); await P.waitForTimeout(120); };
  // ---------- Trabajadores ----------
  await ir('trabajadores'); let t = await txt();
  ok(/Luis Pérez/.test(t) && /Rosa Díaz/.test(t) && /2 trabajadores · 2 activos/.test(t), 'Trabajadores lista el personal y cuenta los activos');
  await P.evaluate(() => adm3Tw('w1', 'estado', 'Inactivo'));
  ok(/1 trabajador con cambios sin guardar/.test(await txt()) && await P.evaluate(() => window.__guardadoW) === null, 'editar crea un borrador y no guarda todavía');
  await P.evaluate(() => { adm3TPedir(); adm3Motivo('corto'); adm3TGuardar(); }); await P.waitForTimeout(200);
  ok(/mínimo 10 caracteres/.test(await P.evaluate(() => document.querySelector('.adm-mod').innerText)) && await P.evaluate(() => window.__guardadoW) === null, 'sin motivo de 10 caracteres no se guarda');
  await P.evaluate(() => { adm3Motivo('Terminó su contrato el 16/11'); adm3TGuardar(); }); await P.waitForTimeout(400);
  const gw = await P.evaluate(() => window.__guardadoW);
  ok(gw && gw.find(w => w.id === 'w1').estado === 'Inactivo' && gw.find(w => w.id === 'w2').estado === 'Activo' && gw.length === 2, 'con motivo se guarda con saveWorkers (una sola escritura) y solo cambia ese trabajador');
  ok((await P.evaluate(() => window.__escritos.filter(x => x.n === 'adminAuditoria'))).some(x => x.d.modulo === 'Trabajadores' && /Luis Pérez/.test(x.d.accion) && /Terminó su contrato/.test(x.d.motivo)), 'queda en la auditoría del panel');
  await P.evaluate(() => { adm3Tw('w2', 'cargo', 'Soldador'); _workersCache = _workersCache.map(w => w.id === 'w2' ? Object.assign({}, w, { cargo: 'Eléctrico' }) : w); adm3TPedir(); adm3Motivo('Cambio de cargo del técnico'); adm3TGuardar(); }); await P.waitForTimeout(300);
  ok(/Esto cambió en otro equipo/.test(await P.evaluate(() => document.querySelector('.adm-mod') ? document.querySelector('.adm-mod').innerText : '')), 'si otro equipo cambió al trabajador mientras se editaba: «Esto cambió en otro equipo»');
  await P.evaluate(() => { adm3Cerrar(); adm3TDescartar(); });
  // ---------- Cuentas compartidas ----------
  await ir('pines'); t = await txt();
  ok(/Luis Ramos/.test(t) && /Rosa Vega/.test(t) && /Creado/.test(t) && /Sin crear/.test(t), 'Cuentas compartidas › Almacén lista a los almaceneros y si ya crearon su PIN');
  await P.evaluate(() => adm3Alm('pin', 'al1')); await P.evaluate(() => { adm3Motivo('Olvidó su PIN y lo pidió'); adm3AlmOk(); }); await P.waitForTimeout(400);
  const al1 = await P.evaluate(() => window.__almc.find(a => a.id === 'al1'));
  ok(al1 && !al1.hash && !al1.salt && al1.nombre === 'Luis Ramos', 'Nuevo PIN borra su hash y su sal para que cree uno nuevo (con la función de Almacén)');
  await P.evaluate(() => { document.getElementById('adm3-nuevo-alm').value = 'Pedro Soto'; adm3NuevoAlm('Pedro Soto'); adm3Alm('agregar', ''); adm3Motivo('Nuevo almacenero del turno noche'); adm3AlmOk(); }); await P.waitForTimeout(400);
  ok(await P.evaluate(() => window.__almc.some(a => a.nombre === 'Pedro Soto' && a.activo === true)) && (await P.evaluate(() => window.__escritos.filter(x => x.n === 'adminAuditoria'))).some(x => /Agregó a Pedro Soto/.test(x.d.accion)), 'se agrega una persona y queda en la auditoría');
  await P.evaluate(() => adm3Tab('mantenimiento')); ok(/Téc\. Mario/.test(await txt()) && /se administra en Mantenimiento/.test(await txt()), 'la cuenta de Mantenimiento se consulta (se administra en Mantenimiento)');
  // ---------- Turnos, Tareo ----------
  await ir('turnos'); t = await txt(); ok(/Ampliaciones de turno recientes/.test(t) && /ajuste de cierre/.test(t) && /NOCHE/.test(t), 'Turnos y horarios muestra las ampliaciones vivas');
  await ir('tareo'); ok(/Solo RRHH y el Administrador reabren/.test(await txt()), 'Tareo y cierres explica quién reabre y dónde');
  // ---------- Corrección de registros ----------
  await ir('registros'); t = await txt(); ok(/PET1/.test(t) && /PET2/.test(t), 'Corrección de registros lista los reportes');
  await P.evaluate(() => { adm3Reg('reabrir', 'rep1'); adm3Reg('eliminar', 'rep1'); }); await P.waitForTimeout(150);
  ok((await P.evaluate(() => window.__llamadas)).join() === 'reabrir:rep1,eliminar:rep1', 'reabrir y eliminar usan las funciones de siempre (con su motivo y su constancia)');
  // ---------- Papelera ----------
  await ir('papelera'); t = await txt();
  ok(/PET1/.test(t) && /duplicado del turno/.test(t) && !/ya restaurado/.test(t), 'Papelera lista lo eliminado y oculta lo que ya existe de nuevo');
  ok(/No hay «borrar para siempre»/.test(t), 'dice claramente que no hay «borrar para siempre» (la constancia es inmutable)');
  await P.evaluate(() => { adm3Restaurar('e1'); adm3Motivo('Se eliminó por error'); adm3RestOk(); }); await P.waitForTimeout(400);
  const rg = await P.evaluate(() => window.__recGuardados);
  ok(rg && rg.some(r => r.id === 'rep_borrado' && r.restauradoPor === 'Félix' && r.auditoria.some(a => a.accion === 'RESTAURADO')) && rg.length === 3, 'restaurar vuelve a guardar el reporte con saveRecords y deja la marca de restaurado');
  ok((await P.evaluate(() => window.__escritos.filter(x => x.n === 'adminAuditoria'))).some(x => x.d.modulo === 'Papelera' && /Se eliminó por error/.test(x.d.motivo)), 'la restauración queda en la auditoría con su motivo');
  // ---------- Alertas y anuncios ----------
  await ir('alertas'); t = await txt();
  ok(/Anuncio para todos los equipos/.test(t) && /Modo mantenimiento/.test(t) && /2 de 2 usuarios/.test(t) && /Es un aviso: no bloquea/.test(t), 'Alertas y anuncios: anuncio, modo mantenimiento (aviso, no bloquea) y quién recibe alertas');
  await P.evaluate(() => { adm4Anun('texto', 'Mañana a las 7:00 se actualiza el sistema'); adm4Anun('activo', true); adm4Pedir('anuncio'); adm4Motivo('Aviso de actualización programada'); adm4GuardarCfg(); }); await P.waitForTimeout(500);
  const an = await P.evaluate(() => window.__escritos.filter(x => x.n === 'adminConfig' && x.id === 'anuncio').map(x => x.d));
  ok(an.length === 1 && an[0].version === 1 && an[0].activo === true && /actualiza/.test(an[0].texto) && /actualización programada/.test(an[0].motivo), 'el anuncio se guarda en adminConfig/anuncio (versión 1, con motivo)');
  ok(/Mañana a las 7:00/.test(await P.evaluate(() => (document.getElementById('glacial-aviso-admin') || {}).innerText || '')), 'el anuncio aparece como banner en la pantalla (así lo ven todos los equipos, en vivo)');
  await P.evaluate(() => { adm4Mant('activo', true); adm4Mant('texto', 'Estamos migrando datos'); adm4Pedir('mantenimiento'); adm4Motivo('Migración de factores de consumo'); adm4GuardarCfg(); }); await P.waitForTimeout(500);
  ok(/Modo mantenimiento/.test(await P.evaluate(() => (document.getElementById('glacial-aviso-admin') || {}).innerText || '')) && await P.evaluate(() => glacialAdminConfig.modoMantenimiento()), 'el modo mantenimiento muestra su aviso');
  await P.evaluate(() => { adm4Anun('activo', false); adm4Pedir('anuncio'); adm4Motivo('Se retira el aviso de actualización'); adm4GuardarCfg(); }); await P.waitForTimeout(400);
  ok(!/Mañana a las 7:00/.test(await P.evaluate(() => (document.getElementById('glacial-aviso-admin') || {}).innerText || '')), 'al desactivar el anuncio se retira del banner');
  // ---------- Salud y Seguridad ----------
  await P.evaluate(() => { window.__salud = { revisadoEn: Date.now() - 2 * 3600000, problemas: [{ nivel: 'ambar', texto: 'Hay 2 usuarios sin perfil' }] }; });
  await ir('sistema'); await P.waitForTimeout(200); t = await txt();
  ok(/Con conexión/.test(t) && /No disponible desde el navegador/.test(t) && /cerrar sesión de otros usuarios/i.test(t), 'Salud: estado de este equipo y se dice qué no se puede desde el navegador (sesiones de otros)');
  await ir('seguridad'); await P.evaluate(() => adm4RevisarSeg()); await P.waitForTimeout(300); t = await txt();
  ok(/viejo1/.test(t) && /Rol distinto en el perfil/i.test(t) && /Intentos de ingreso fallidos y cuentas bloqueadas/i.test(t) && /No disponible desde el navegador/.test(t), 'Seguridad: la revisión de cuentas muestra lo que encontró; intentos fallidos y bloqueos: no disponible, dicho con claridad');
  // ---------- Respaldos ----------
  await ir('respaldos'); await P.evaluate(() => adm4Respaldar()); await P.waitForTimeout(300);
  const blob = await P.evaluate(() => window.__descargas[0] ? window.__descargas[0].text() : '');
  ok(/"username": "pedro"/.test(blob) && !/SECRETO|passwordHash|"salt"|"hash"|authUid/.test(blob) && /reportesProduccion/.test(blob), 'el respaldo JSON incluye usuarios, trabajadores y reportes SIN claves, sales ni PIN');
  await P.evaluate(() => { adm4Exp('desde', '2026-11-16'); adm4Exportar('produccion'); }); await P.waitForTimeout(200);
  const csv = await P.evaluate(() => window.__descargas[1] ? window.__descargas[1].text() : '');
  ok(/PET1/.test(csv) && !/PET2/.test(csv) && /Fecha/.test(csv), 'la exportación CSV respeta el rango de fechas (solo desde 16/11: sale PET1 y no PET2 del 15/11)');
  ok(/Respaldos automáticos/.test(await txt()) && /No disponible desde el navegador/.test(await txt()), 'los respaldos automáticos y las integraciones: no disponibles desde el navegador, dicho con claridad');
  if (process.env.GLX_CAPTURAS) { await ir('papelera'); await P.screenshot({ path: process.env.GLX_CAPTURAS + '/admin-papelera.png' }); }
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar(); console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
