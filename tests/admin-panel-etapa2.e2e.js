/* Panel de Administración · etapa 2 en un navegador de verdad: Mermas y consumos, Metas y umbrales, Datos maestros y plantillas de roles. Uso: GLX_LIBS=/ruta node tests/admin-panel-etapa2.e2e.js. GLX_CAPTURAS=/carpeta guarda capturas. */
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
    window.__esc = { adminAuditoria: [], auditoriaTareos: [], apAuditoria: [], insumosAuditoria: [], auditoriaRegistros: [] }; window.__oy = {}; window.__escritos = [];
    const cfg = { tolerancias: null, roles: null }; window.__cfg = cfg; window.__cfgOy = {};
    const orig = db.collection.bind(db);
    db.collection = n => {
      if (window.__esc[n]) return { orderBy() { return this; }, limit() { return this; }, onSnapshot(cb) { cb({ docs: [] }); return () => {}; }, doc: id => ({ set: async d => { window.__escritos.push({ n, id, d }); } }) };
      if (n === 'adminConfig') return { doc: id => ({ __id: id, onSnapshot(cb) { (window.__cfgOy[id] = window.__cfgOy[id] || []).push(cb); cb({ exists: !!cfg[id], data: () => cfg[id] }); return () => {}; } }) };
      return orig(n);
    };
    db.runTransaction = async fn => { const tx = { get: async ref => ({ exists: !!cfg[ref.__id], data: () => cfg[ref.__id] }), set: (ref, d) => { window.__escritos.push({ n: 'adminConfig', id: ref.__id, d }); cfg[ref.__id] = d; (window.__cfgOy[ref.__id] || []).forEach(cb => cb({ exists: true, data: () => d })); } }; return fn(tx); };
    _usersCache = [{ username: 'admin', nombre: 'Félix', rol: 'Administrador', permisos: 'todos' }, { username: 'pedro', nombre: 'Pedro', rol: 'Supervisor', permisos: ['paletas'] }];
    // Asistente: catálogo, factores y funciones de guardado de mentira (la lógica real se prueba en sus propias pruebas)
    const hoy = GlacialFecha.fechaOperativa();
    const AD = glacialAsistenteDatos;
    AD.cache.insumos = [{ codigo: 'TAPA', nombre: 'Tapa 28 mm', unidad: 'UND', activo: true }, { codigo: 'ETI', nombre: 'Etiqueta', unidad: 'UND', activo: true }];
    AD.cache.factores = [{ id: 'F1', insumo: 'TAPA', linea: 'PET1', marca: '*', presentacion: '*', base: 'UND', cantidadBase: 1, factor: 1, vigenteDesde: '2020-01-01', vigenteHasta: null, activo: true, version: 1 }];
    window.__factoresGuardados = []; AD.escucharCatalogo = () => {};
    AD.guardarFactor = async (f, ant) => { window.__factoresGuardados.push({ f, ant }); };
    AD.cache.parametrosMerma = { version: 3, causas: ['Rotura', 'Caída'], etapas: ['Llenado'] };
    window.__causas = []; AD.guardarParametrosMerma = async (p, v) => { window.__causas.push({ p, v }); };
    glacialConversiones.panel.guardarCambio = async p => { window.__conv = p; };
    loadRecords = () => [{ linea: 'PET1', fecha: hoy, cuadros: [{ marca: 'Scala', presentacion: '2.5 L' }] }];
    PERMISOS_SUGERIDOS_POR_ROL.Supervisor = ['paletas', 'nuevo'];
    renderSidebar(); goAdminPanel();
  });
  await P.waitForSelector('.adm');
  const txt = () => P.evaluate(() => document.querySelector('.adm').innerText.replace(/\s+/g, ' '));
  const menu = await P.evaluate(() => [...document.querySelectorAll('.adm-menu button')].map(b => b.innerText.replace(/\s+/g, ' ').trim()));
  ok(menu.filter(m => /Etapa/.test(m)).length === 10 && !/Etapa/.test(menu.find(m => /Mermas y consumos/.test(m)) + menu.find(m => /Metas y umbrales/.test(m)) + menu.find(m => /Datos maestros/.test(m))), 'Mermas y consumos, Metas y umbrales y Datos maestros ya no dicen «Etapa»: quedan 10 pendientes (3 y 4)');
  // ---- Mermas y consumos: factores ----
  await P.evaluate(() => admIr('consumos')); await P.waitForSelector('.adm-t');
  let t = await txt();
  ok(/Consumo de insumos/.test(t) && /Conversión de mermas/.test(t) && /Causas y etapas/.test(t) && /Tolerancias/.test(t), 'Mermas y consumos tiene sus 4 pestañas');
  ok(/Tapa 28 mm/.test(t) && /vigente hoy/.test(t) && /Cambiar/.test(t), 'lista los factores con el que está vigente hoy');
  ok(/Pendientes de configurar \(1\)/.test(t) && /PET1 · Scala 2\.5 L/.test(t) && /Etiqueta/.test(t), 'pendientes en amarillo: se produjo PET1 Scala 2.5 L y falta el factor de la etiqueta');
  await P.evaluate(() => adm2CambiarFactor('F1')); await P.waitForSelector('.adm-mod');
  await P.evaluate(() => { adm2Campo('nuevo', '1,5'); document.getElementById('adm2-prev').innerHTML = ''; });
  t = await P.evaluate(() => document.querySelector('.adm-mod').innerText.replace(/\s+/g, ' '));
  await P.evaluate(() => adm2Campo('nuevo', '1.5'));
  const prev = await P.evaluate(() => document.getElementById('adm2-prev').innerText.replace(/\s+/g, ' '));
  ok(/10[.,]?000 UND/.test(prev) && /\+50,0 %|\+50 %|\+50\.0 %/.test(prev) && /20 % o más/.test(prev), 'vista previa: turno típico, consumo con el valor actual y con el nuevo, +50 % y aviso en rojo (≥ 20 %)');
  await P.evaluate(() => { adm2Campo('nuevo', '1.1'); });
  ok(!/20 % o más/.test(await P.evaluate(() => document.getElementById('adm2-prev').innerText)), 'con un cambio de +10 % no hay alerta roja');
  await P.evaluate(() => { adm2Campo('motivo', 'corto'); adm2GuardarCambio(); }); await P.waitForTimeout(200);
  ok(/mínimo 10 caracteres/.test(await P.evaluate(() => document.querySelector('.adm-mod').innerText)) && await P.evaluate(() => window.__factoresGuardados.length) === 0, 'sin motivo de 10 caracteres no se guarda');
  await P.evaluate(() => { adm2Campo('desde', GlacialFecha.fechaOperativa()); adm2Campo('motivo', 'Nuevo proveedor de tapas desde hoy'); adm2GuardarCambio(); }); await P.waitForTimeout(400);
  const fg = await P.evaluate(() => window.__factoresGuardados[0]);
  ok(fg && fg.ant === 'F1' && fg.f.factor === 1.1 && fg.f.vigenteHasta === null && !fg.f.id && fg.f.insumo === 'TAPA', 'guarda con guardarFactor del Asistente: cierra la vigencia anterior (F1) y crea la versión nueva');
  const aud = await P.evaluate(() => window.__escritos.filter(x => x.n === 'adminAuditoria').map(x => x.d));
  ok(aud.length === 1 && aud[0].modulo === 'Mermas y consumos' && /Tapa 28 mm/.test(aud[0].accion) && /Nuevo proveedor/.test(aud[0].motivo), 'queda en la auditoría del panel con su motivo');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/admin-consumos.png' });
  // nuevo factor desde pendiente
  await P.evaluate(() => adm2NuevoFactor('PET1', 'Scala', '2.5 L')); await P.waitForSelector('.adm-mod');
  await P.evaluate(() => { adm2Campo('insumo', 'ETI'); adm2Campo('factor', '1'); adm2Campo('motivo', 'Falta el factor de etiqueta'); adm2GuardarNuevo(); }); await P.waitForTimeout(400);
  const f2 = await P.evaluate(() => window.__factoresGuardados[1]);
  ok(f2 && f2.ant === null && f2.f.insumo === 'ETI' && f2.f.marca === 'Scala' && f2.f.presentacion === '2.5 L' && f2.f.base === 'UND', 'desde «Configurar» se crea el factor nuevo de la combinación pendiente');
  // ---- causas y etapas ----
  await P.evaluate(() => adm2Tab('causas')); await P.waitForSelector('#adm2-nuevo-causas');
  await P.evaluate(() => { document.getElementById('adm2-nuevo-causas').value = 'Mala soldadura'; adm2CausaAgregar('causas'); adm2CausaQuitar('causas', 0); });
  t = await txt(); ok(/Mala soldadura/.test(await P.evaluate(() => [...document.querySelectorAll('.adm-card input')].map(i => i.value).join('|'))) && !/Rotura/.test(await P.evaluate(() => [...document.querySelectorAll('.adm-card input')].map(i => i.value).join('|'))), 'causas: se agrega una y se deja de ofrecer otra');
  await P.evaluate(() => { adm2CausasPedir(); adm2Campo('motivo', 'Cambio de causas de merma'); adm2GuardarCausas(); }); await P.waitForTimeout(300);
  const cg = await P.evaluate(() => window.__causas[0]);
  ok(cg && cg.v === 3 && cg.p.causas.join() === 'Caída,Mala soldadura' && cg.p.etapas.join() === 'Llenado', 'guarda con guardarParametrosMerma del Asistente, con la versión que se editó (control de conflictos)');
  // ---- tolerancias ----
  await P.evaluate(() => adm2Tab('tolerancias')); await P.waitForSelector('.adm-t');
  await P.evaluate(() => { adm2Tol('PET1', 'mermaPct', '2,5'); adm2Tol('PET1', 'desviacionPct', '4'); adm2Tol('B7L', 'validarMermaAntes', false); adm2TolPedir(); adm2Campo('motivo', 'Metas de merma del trimestre'); adm2GuardarTol(); }); await P.waitForTimeout(400);
  const cfg = await P.evaluate(() => window.__escritos.filter(x => x.n === 'adminConfig' && x.id === 'tolerancias').map(x => x.d));
  ok(cfg.length === 1 && cfg[0].version === 1 && cfg[0].lineas.PET1.mermaPct === 2.5 && cfg[0].lineas.PET1.desviacionPct === 4 && cfg[0].lineas.B7L.validarMermaAntes === false && !cfg[0].lineas.PET2 && /trimestre/.test(cfg[0].motivo), 'tolerancias: se guarda la versión 1 solo con las líneas que tienen valor y con el motivo');
  ok(await P.evaluate(() => glacialAdminConfig.tolerancia('PET1', 'mermaPct') === 2.5 && glacialAdminConfig.tolerancia('PET1', 'desviacionPct') === 4 && glacialAdminConfig.tolerancia('PET2', 'mermaPct') === null && glacialAdminConfig.lineasSinExigirMerma().join() === 'B7L'), 'el Asistente lee las tolerancias (y las líneas sin valor siguen como hoy)');
  await P.evaluate(() => { adm2Tab('tolerancias'); adm2Tol('PET1', 'mermaPct', '3'); adm2TolPedir(); adm2Campo('motivo', 'Subimos la merma aceptable'); window.__cfg.tolerancias = Object.assign({}, window.__cfg.tolerancias, { version: 5 }); adm2GuardarTol(); }); await P.waitForTimeout(400);
  ok(/Esto cambió en otro equipo/.test(await P.evaluate(() => document.querySelector('.adm-msg') ? document.querySelector('.adm-msg').innerText : '')), 'si otro equipo cambió las tolerancias mientras se editaban: «Esto cambió en otro equipo» y no gana en silencio el último');
  // ---- conversión ----
  await P.evaluate(() => adm2Tab('conversion')); await P.waitForTimeout(150);
  ok(/Componente/i.test(await txt()) && /Los reportes con fecha anterior conservan su conversión|reportes con fecha anterior conservan/.test(await txt()), 'Conversión de mermas explica que los reportes anteriores conservan su conversión');
  // ---- Metas y Datos maestros ----
  await P.evaluate(() => admIr('metas')); await P.waitForTimeout(150);
  t = await txt(); ok(/valores vivos/.test(t) && /Umbrales de avisos/.test(t) && /Metas e indicadores/.test(t), 'Metas y umbrales muestra los valores vivos y abre el editor de siempre');
  await P.evaluate(() => admIr('maestros')); await P.waitForTimeout(150);
  t = await txt(); ok(/Insumos/.test(t) && /Productos y unidades por paleta/.test(t) && /Abrir Inventario de insumos/.test(t), 'Datos maestros: resumen y acceso directo a cada editor');
  // ---- Roles: plantilla y rol propio ----
  await P.evaluate(() => { admIr('roles'); adm2Rol('Supervisor'); }); await P.waitForSelector('.adm-ar');
  await P.evaluate(() => adm2RolPerm('Supervisor', 'graficos', true));
  ok(/Plantilla con cambios sin guardar/.test(await txt()), 'editar la plantilla crea un borrador');
  await P.evaluate(() => { adm2RolPedir(); adm2Campo('motivo', 'Los supervisores ahora ven gráficos'); adm2RolGuardar(); }); await P.waitForTimeout(400);
  const rg = await P.evaluate(() => window.__escritos.filter(x => x.n === 'adminConfig' && x.id === 'roles').map(x => x.d));
  ok(rg.length === 1 && rg[0].version === 1 && rg[0].plantillas.Supervisor.includes('graficos') && rg[0].plantillas.Supervisor.includes('paletas'), 'la plantilla del rol se guarda en adminConfig/roles (versión 1)');
  ok(await P.evaluate(() => PERMISOS_SUGERIDOS_POR_ROL.Supervisor.includes('graficos')), '«Nuevo usuario» ya usa la plantilla nueva (PERMISOS_SUGERIDOS_POR_ROL)');
  await P.evaluate(() => { document.getElementById('adm2-nuevo-rol').value = 'Calidad'; adm2RolCrear(); adm2Campo('motivo', 'Crear el rol del área de Calidad'); adm2RolNuevoOk(); }); await P.waitForTimeout(500);
  const rg2 = await P.evaluate(() => window.__escritos.filter(x => x.n === 'adminConfig' && x.id === 'roles').pop().d);
  ok(rg2.version === 2 && rg2.propios.some(r => r.nombre === 'Calidad') && Array.isArray(rg2.plantillas.Calidad), 'crear un rol propio: versión 2 del documento, con su plantilla vacía');
  ok(await P.evaluate(() => glacialAdminConfig.rolesPropios().join() === 'Calidad' && 'Calidad' in PERMISOS_SUGERIDOS_POR_ROL), 'el rol propio aparece en la lista de roles de «Nuevo usuario»');
  await P.evaluate(() => { document.getElementById('adm2-nuevo-rol').value = 'calidad'; adm2RolCrear(); });
  ok(/Ya existe un rol con ese nombre/.test(await P.evaluate(() => document.querySelector('.adm-msg') ? document.querySelector('.adm-msg').innerText : '')), 'no se puede repetir un rol existente');
  if (process.env.GLX_CAPTURAS) { await P.evaluate(() => { admIr('consumos'); adm2Tab('tolerancias'); }); await P.waitForTimeout(150); await P.screenshot({ path: process.env.GLX_CAPTURAS + '/admin-tolerancias.png' }); }
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar(); console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
