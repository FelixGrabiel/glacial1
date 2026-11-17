/* Panel de Administración · etapa 1 en un navegador de verdad. Uso: GLX_LIBS=/ruta node tests/admin-panel.e2e.js. GLX_CAPTURAS=/carpeta guarda capturas. */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const preparar = async (P, user) => {
  await P.evaluate((user) => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('report-select-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = user; state.showWelcome = false;
    window.__esc = { adminAuditoria: [], auditoriaTareos: [], apAuditoria: [], insumosAuditoria: [], auditoriaRegistros: [] }; window.__oy = {}; window.__escritos = [];
    const ahora = Date.now();
    window.__esc.auditoriaTareos = [{ id: 't1', data: { timestamp: ahora - 3600000, usuarioNombre: 'RRHH Ana', accion: 'EDITAR_TAREO_BLOQUEADO', trabajador: 'Luis Pérez', fechaTareo: '2026-11-16', area: 'Producción', motivoCorreccion: 'corrige hora de salida' } }];
    window.__esc.apAuditoria = [{ id: 'a1', data: { en: ahora - 1800000, usuario: 'Asistente Rosa', operacion: 'crear', coleccion: 'apFactores', docId: 'f1', antes: null, despues: { factor: 0.5 } } }];
    window.__esc.insumosAuditoria = [{ id: 'i1', data: { en: ahora - 7200000, usuario: 'Asistente Rosa', tipo: 'CONTEO', articulo: 'Preforma 21 g', antes: 10, despues: 12 } }];
    window.__esc.auditoriaRegistros = [{ id: 'r1', data: { timestamp: ahora - 600000, usuario: 'Sup Pedro', accion: 'ELIMINAR', linea: 'PET1', fecha: '2026-11-16', turno: 'DÍA', motivo: 'duplicado del turno' } }];
    const orig = db.collection.bind(db);
    db.collection = n => window.__esc[n] ? ({
      orderBy() { return this; }, limit() { return this; },
      onSnapshot(cb) { (window.__oy[n] = window.__oy[n] || []).push(cb); cb({ docs: window.__esc[n].map(x => ({ id: x.id, data: () => x.data })) }); return () => {}; },
      doc: id => ({ set: async d => { window.__escritos.push({ n, id, d }); window.__esc[n].push({ id, data: Object.assign({}, d, { guardadoEn: Date.now() }) }); (window.__oy[n] || []).forEach(cb => cb({ docs: window.__esc[n].map(x => ({ id: x.id, data: () => x.data })) })); } })
    }) : orig(n);
    window.__lista = [
      { username: 'admin', nombre: 'Félix Grabiel', rol: 'Administrador', permisos: 'todos' },
      { username: 'pedro', nombre: 'Pedro Soto', rol: 'Supervisor', permisos: ['paletas', 'nuevo', 'historial'], linea: 'PET1' },
      { username: 'ana', nombre: 'Ana Ruiz', rol: 'RRHH', permisos: ['moduloRRHH', 'horasExtras'] }
    ];
    _usersCache = JSON.parse(JSON.stringify(window.__lista));
    window.__guardado = null;
    saveUsers = async lista => { window.__guardado = JSON.parse(JSON.stringify(lista)); _usersCache = JSON.parse(JSON.stringify(lista)); return true; };
    renderSidebar();
  }, user);
};
(async () => {
  const H = await iniciar();
  // ---------- quién entra ----------
  const sinAcceso = [
    ['un Supervisor', { rol: 'Supervisor', nombre: 'Pedro', username: 'pedro', permisos: 'todos' }],
    ['la cuenta compartida de Mantenimiento', { rol: 'mantenimiento_compartido', nombre: 'Mantenimiento', username: 'mant', permisos: ['ver_tareo_mantenimiento'] }],
    ['la cuenta compartida de Almacén', { rol: 'almacen_compartido', nombre: 'Almacén', username: 'alm', permisos: ['moduloAlmacen'] }],
    ['un Gerente General', { rol: 'Gerente General', nombre: 'Gerente', username: 'ger', permisos: 'todos' }],
    ['un Jefe de Producción', { rol: 'Jefe de Producción', nombre: 'Jefe', username: 'jefe', permisos: 'todos' }]
  ];
  for (const [quien, user] of sinAcceso) {
    const C = await H.abrir(1300, 900); const P = C.page; await preparar(P, user);
    await P.evaluate(() => { window.alert = () => {}; });
    const r = await P.evaluate(() => { sincronizarMenuTest = undefined; glacialAdminDatos.sincronizarMenu(); const b = document.getElementById('btn-admin-panel'); goAdminPanel(); return { menu: !!b, tab: state.currentTab }; });
    await P.evaluate(() => { state.currentTab = 'admin-panel'; renderMain(); }); await P.waitForTimeout(100);
    const txt = await P.evaluate(() => (document.getElementById('main') || document.body).innerText);
    ok(!r.menu && r.tab !== 'admin-panel' && (await P.evaluate(() => !document.querySelector('.adm'))), quien + ' no ve la entrada del menú ni puede abrir el panel (ni por consola)');
    await C.page.close().catch(() => {});
  }
  // ---------- el Administrador ----------
  const D = await H.abrir(1300, 1000); const P = D.page;
  await preparar(P, { rol: 'Administrador', nombre: 'Félix Grabiel', username: 'admin', permisos: 'todos' });
  ok(await P.evaluate(() => !!document.getElementById('btn-admin-panel') && !/btn-admin-panel/.test(document.documentElement.outerHTML.split('<script')[0].replace(/<button[^>]*id="btn-admin-panel"[^>]*>[\s\S]*?<\/button>/, ''))), 'el Administrador ve «Panel de Administración» en el menú (se crea solo para él: no está en el HTML de la página)');
  ok(!(await P.evaluate(() => fetch('index.html').then(r => r.text()).then(t => /btn-admin-panel|Panel de Administración/.test(t)).catch(() => false))), 'index.html no trae la entrada del menú');
  await P.evaluate(() => goAdminPanel()); await P.waitForSelector('.adm');
  const sec = await P.evaluate(() => [...document.querySelectorAll('.adm-menu button')].map(b => b.innerText.replace(/\s+/g, ' ').trim()));
  ok(sec.length === 17 && /^Resumen/.test(sec[0]) && /Usuarios/.test(sec.join('|')) && /Respaldos e integraciones/.test(sec[16]), 'el menú del panel tiene las 17 secciones en 5 grupos (' + sec.length + ')');
  ok((await P.evaluate(() => [...document.querySelectorAll('.adm-g')].map(g => g.innerText).join())) === 'GENERAL,PERSONAS,OPERACIÓN,DATOS,CONTROL', 'grupos: General, Personas, Operación, Datos, Control');
  // Resumen
  let t = await P.evaluate(() => document.querySelector('.adm').innerText.replace(/\s+/g, ' '));
  ok(/USUARIOS\s*3/i.test(t) && /CAMBIOS REGISTRADOS HOY\s*4/i.test(t), 'Resumen: 3 usuarios y 4 cambios registrados hoy (de las 4 auditorías)');
  ok(/Elimin|eliminar/i.test(t) && /Pedro|Sup Pedro/.test(t) && /Últimos cambios/i.test(t), 'Resumen: «Últimos cambios» muestra lo más reciente de todas las auditorías');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/admin-resumen.png' });
  // Auditoría consolidada
  await P.evaluate(() => admIr('auditoria')); await P.waitForSelector('.adm-t');
  const filas = () => P.evaluate(() => [...document.querySelectorAll('.adm-t tbody tr')].map(tr => tr.innerText.replace(/\s+/g, ' ')));
  let f = await filas();
  ok(f.length === 4 && /Registros de producción/.test(f[0]) && /Tareo/.test(f.join('|')) && /Asistente de Producción/.test(f.join('|')) && /Inventario de insumos/.test(f[3]), 'Auditoría reúne las 4 auditorías existentes, de la más reciente a la más antigua');
  ok(/RRHH Ana/.test(f.join('|')) && /corrige hora de salida/.test(f.join('|')) && /duplicado del turno/.test(f.join('|')), 'cada fila trae quién, acción y motivo');
  await P.evaluate(() => admAf('modulo', 'Inventario de insumos')); f = await filas();
  ok(f.length === 1 && /Preforma 21 g/.test(f[0]), 'el filtro por módulo funciona');
  await P.evaluate(() => admAf('modulo', 'Todos'));
  // tiempo real: llega una auditoría nueva sin recargar
  await P.evaluate(() => { window.__esc.auditoriaTareos.push({ id: 't2', data: { timestamp: Date.now(), usuarioNombre: 'RRHH Ana', accion: 'EDITAR_TAREO', trabajador: 'Rosa', area: 'Producción' } }); window.__oy.auditoriaTareos.forEach(cb => cb({ docs: window.__esc.auditoriaTareos.map(x => ({ id: x.id, data: () => x.data })) })); });
  await P.waitForTimeout(150);
  ok((await filas()).length === 5, 'un cambio hecho en otro equipo aparece solo, sin recargar');
  // Usuarios: borrador y guardado
  await P.evaluate(() => { admIr('usuarios'); admSel('pedro'); }); await P.waitForSelector('.adm-ar');
  await P.evaluate(() => admPerm('graficos', true));
  ok(/1 cambio sin guardar/.test(await P.evaluate(() => document.querySelector('.adm-barra') ? document.querySelector('.adm-barra').innerText : '')) && await P.evaluate(() => window.__guardado) === null, 'editar crea un borrador («1 cambio sin guardar») y no guarda nada todavía');
  await P.evaluate(() => admCampo('rol', 'Planificación'));
  await P.evaluate(() => admPedirMotivo());
  await P.evaluate(() => { document.getElementById('adm-motivo').value = 'corto'; admMotivoTxt('corto'); admGuardar(); }); await P.waitForTimeout(150);
  ok(/mínimo 10 caracteres/.test(await P.evaluate(() => document.querySelector('.adm-mod').innerText)) && await P.evaluate(() => window.__guardado) === null, 'sin motivo de 10 caracteres no se guarda');
  await P.evaluate(() => { admMotivoTxt('Pasa a cubrir Planificación desde el lunes'); admGuardar(); }); await P.waitForTimeout(400);
  const g = await P.evaluate(() => window.__guardado && window.__guardado.find(u => u.username === 'pedro'));
  ok(g && g.rol === 'Planificación' && g.permisos.includes('graficos') && g.permisos.includes('paletas'), 'con motivo se guarda el rol y el permiso en el mismo usuario');
  const aud = await P.evaluate(() => window.__escritos.filter(x => x.n === 'adminAuditoria'));
  ok(aud.length === 1 && aud[0].d.modulo === 'Usuarios' && /Pedro Soto/.test(aud[0].d.accion) && aud[0].d.motivo === 'Pasa a cubrir Planificación desde el lunes' && aud[0].d.antes.rol === 'Supervisor' && /Planificación/.test(aud[0].d.despues.rol) && aud[0].d.uid !== undefined && aud[0].d.opId === aud[0].id, 'el cambio deja su auditoría: quién, módulo, acción, antes, después y motivo');
  ok(/Pedro Soto/.test(await P.evaluate(() => { admIr('auditoria'); return document.querySelector('.adm-t').innerText; })), 'la auditoría del panel aparece en la Auditoría consolidada');
  // conflicto entre equipos
  await P.evaluate(() => { admIr('usuarios'); admSel('ana'); admPerm('tareoGeneral', true); });
  await P.evaluate(() => { const l = JSON.parse(JSON.stringify(_usersCache)); l.find(u => u.username === 'ana').permisos = ['moduloRRHH']; _usersCache = l; });
  await P.evaluate(() => { admPedirMotivo(); admMotivoTxt('Ajuste de permisos de RRHH'); admGuardar(); }); await P.waitForTimeout(400);
  const antes = await P.evaluate(() => window.__guardado.find(u => u.username === 'ana').permisos.length);
  ok(/cambió en otro equipo/i.test(await P.evaluate(() => document.querySelector('.adm-msg') ? document.querySelector('.adm-msg').innerText : '')) && antes === 2, 'si otro equipo cambió al mismo usuario mientras se editaba: «Esto cambió en otro equipo», no gana en silencio el último');
  // el Administrador principal no se toca
  await P.evaluate(() => { admIr('usuarios'); admSel('admin'); });
  ok(await P.evaluate(() => [...document.querySelectorAll('.adm-card input[type=checkbox],.adm-card select')].filter(x => !x.disabled && x.closest('.adm-card') && x.closest('.adm-card').innerText.includes('Administrador principal')).length === 0), 'el Administrador principal queda bloqueado (rol y permisos)');
  // Roles
  await P.evaluate(() => admIr('roles')); await P.waitForSelector('.adm-ar');
  t = await P.evaluate(() => document.querySelector('.adm').innerText.replace(/\s+/g, ' '));
  ok(/Supervisor/.test(t) && /Plantilla/.test(t) && /Duplicar rol/.test(t), 'Roles y permisos muestra las plantillas por rol (editables desde la etapa 2)');
  // otras secciones
  await P.evaluate(() => admIr('trabajadores'));
  ok(/etapa 3/.test(await P.evaluate(() => document.querySelector('.adm').innerText)), 'las secciones de las etapas siguientes lo dicen claramente');
  if (process.env.GLX_CAPTURAS) { await P.evaluate(() => { admIr('usuarios'); admSel('pedro'); }); await P.screenshot({ path: process.env.GLX_CAPTURAS + '/admin-usuarios.png' }); }
  // «Ver como»: el panel se cierra y se quita del menú en ese momento
  await P.evaluate(() => { admIr('resumen'); window.__vistaComo = { nombre: 'Pedro', rol: 'Supervisor' }; });
  await P.waitForTimeout(1800);
  ok(await P.evaluate(() => !document.getElementById('btn-admin-panel') && state.currentTab !== 'admin-panel'), 'al entrar en «Ver como» el panel se cierra y la entrada desaparece del menú');
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar(); console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
