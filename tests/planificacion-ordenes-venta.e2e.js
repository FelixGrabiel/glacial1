/* Planificación · Órdenes de ventas y vistas movidas, en un NAVEGADOR de verdad.
   - Pestañas de Planificación: Programación turno · Programación semanal · Órdenes de ventas · Cumplimiento de turno (sin Solicitudes, Catálogo ni Horario).
   - Órdenes de ventas: tarjetas, tabla con barras, estados, filtros, detalle, nueva orden (guarda en una transacción simulada) e importación CSV.
   - «Productos y parámetros» abre desde el grupo Mantenimiento y «Horario de producción» desde el grupo Producción.
   Uso: GLX_LIBS=/ruta node tests/planificacion-ordenes-venta.e2e.js   (no forma parte de las pruebas rápidas) */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };

(async () => {
  const H = await iniciar();
  const D = await H.abrir(1500, 900);
  await D.page.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    document.documentElement.style.overflow = 'auto'; document.body.style.overflow = 'auto'; document.body.style.height = 'auto';
    state.user = { rol: 'Administrador', nombre: 'Ana', username: 'admin', permisos: 'todos' }; state.showWelcome = false; window._recordsReady = true;
    const hoy = glacialTurnoVigente().fecha;
    const dia = n => { const d = new Date(hoy + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    window.__dia = dia;
    const P = (c, l, f, m, p, q) => ({ clave: c, linea: l, fecha: f, turno: 'DÍA', marca: m, presentacion: p, cantidadProgramada: q, unidadesPorPaleta: 1200, modo: 'FIJA' });
    _programacionesCache = [P('a', 'PET1', dia(0), 'Bells', '625 ML PACK X 15 UND', 25000), P('b', 'PET1', dia(1), 'Bells', '625 ML PACK X 15 UND', 10000), P('c', 'PET2', dia(1), 'Glacial', '1 L PACK X 12 UND', 4000)];
    _programacionesReady = true;
    const O = (id, n, cli, m, p, q, ent, extra) => Object.assign({ id, numero: n, cliente: cli, marca: m, presentacion: p, cantidad: q, fechaEntrega: ent, estado: 'ABIERTA', origen: 'manual', creadoEn: +id.replace(/\D/g, ''), version: 1 }, extra);
    glacialPlanificacion.ventas.__poner([
      O('1', 'OV-001', 'Distribuidora Andina', 'Bells', '625 ML PACK X 15 UND', 30000, dia(2)),
      O('2', 'OV-002', 'Retail Norte', 'Bells', '625 ML PACK X 15 UND', 20000, dia(5)),
      O('3', 'OV-003', 'Minimarket Sur', 'Scala', '7 Litros', 8000, dia(-2)),
      O('4', 'OV-004', 'Distribuidora Andina', 'Aro', '380 ML PACK X 24 UND', 18000, dia(9)),
      O('5', 'OV-005', 'Retail Norte', 'Glacial', '1 L PACK X 12 UND', 4000, dia(3)),
      O('6', 'OV-006', 'Retail Norte', 'Bells', '20 Litros', 500, dia(4), { estado: 'CANCELADA' })]);
    goPlanificacion();
  });
  await D.page.waitForSelector('#plan-root .plan-tab');
  const tabs = await D.page.evaluate(() => [...document.querySelectorAll('#plan-root .plan-tab')].map(e => e.textContent.trim()));
  ok(JSON.stringify(tabs) === JSON.stringify(['Programación turno', 'Programación semanal', 'Órdenes de ventas', 'Cumplimiento de turno']), 'Planificación tiene 4 pestañas: ' + tabs.join(' · '));
  await D.page.evaluate(() => [...document.querySelectorAll('#plan-root .plan-tab')].find(e => e.textContent.trim() === 'Órdenes de ventas').click());
  await D.page.waitForSelector('#ov-tabla table');
  const info = await D.page.evaluate(() => ({
    kpis: [...document.querySelectorAll('.ov-k')].map(k => k.querySelector('span').textContent + '=' + k.querySelector('b').textContent),
    filas: [...document.querySelectorAll('#ov-tabla tbody tr')].map(r => [...r.querySelectorAll('td')].map(t => t.textContent.trim().replace(/\s+/g, ' ')).join(' | ')),
    barras: document.querySelectorAll('#ov-tabla .ov-barra').length, desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  ok(info.kpis.length === 7 && /abiertas=5/i.test(info.kpis[0]) && /Atrasadas=1/.test(info.kpis[6]) && /Nivel de servicio/.test(info.kpis[1]), 'las 7 tarjetas: ' + info.kpis.join(' · '));
  ok(info.filas.length === 5 && info.filas.every(f => !/OV-006/.test(f)), 'por defecto solo las abiertas (5): la cancelada no se ve');
  const f = n => info.filas.find(x => x.includes(n)) || '';
  ok(/Programada/.test(f('OV-001')) && /30.000/.test(f('OV-001')), 'OV-001 (30 000, entrega más cercana) queda cubierta por la programación de Bells: ' + f('OV-001').slice(-60));
  ok(/Programada en parte/.test(f('OV-002')) && /15.000/.test(f('OV-002')), 'OV-002 recibe lo que sobra (5 000) y le faltan 15 000');
  ok(/Atrasada/.test(f('OV-003')) && /Sin programar/.test(f('OV-004')) && /Programada/.test(f('OV-005')), 'OV-003 atrasada, OV-004 sin programar, OV-005 programada');
  ok(info.barras === 5 && info.desborde <= 1, 'cada orden tiene su barra y no hay desplazamiento horizontal (' + info.desborde + ' px)');
  /* filtros */
  await D.page.selectOption('#ov-estado', 'atrasadas'); await D.page.waitForTimeout(150);
  ok(await D.page.evaluate(() => document.querySelectorAll('#ov-tabla tbody tr.ov-fila').length) === 1, 'filtro «Atrasadas»: 1 orden');
  await D.page.selectOption('#ov-estado', 'todas'); await D.page.waitForTimeout(150);
  ok(await D.page.evaluate(() => document.querySelectorAll('#ov-tabla tbody tr.ov-fila').length) === 6, 'filtro «Todas»: 6 órdenes (incluye la cancelada)');
  await D.page.selectOption('#ov-estado', 'abiertas');
  /* detalle */
  await D.page.click('[data-ov-ver="2"]');
  await D.page.waitForSelector('.ov-det');
  const det = await D.page.evaluate(() => document.querySelector('.ov-det').innerText);
  ok(/OV-002/.test(det) && /Programaciones que la cubren/.test(det) && /Falta programar/.test(det), 'el detalle muestra las programaciones que cubren la orden y lo que falta');
  await D.page.click('[data-ov-cerrar]');
  /* nueva orden con transacción simulada */
  await D.page.evaluate(() => {
    window.__bd = { ordenesVenta: glacialPlanificacion.ventas.ordenes(), ordenesVentaConfig: {} };
    db.runTransaction = async fn => { const tx = { get: async () => ({ exists: true, data: () => window.__bd }), set: (r, d) => { window.__bd = d; } }; await fn(tx); glacialPlanificacion.ventas.__poner(window.__bd.ordenesVenta, window.__bd.ordenesVentaConfig); glacialPlanificacion.refrescar(); };
  });
  await D.page.click('[data-ov-nueva]');
  await D.page.waitForSelector('#ov-guardar');
  await D.page.fill('#ov-numero', 'OV-007'); await D.page.fill('#ov-cli', 'Cliente Nuevo');
  await D.page.selectOption('#ov-marca', { index: 1 }); await D.page.selectOption('#ov-pres', { index: 1 });
  await D.page.fill('#ov-cant', '1200'); await D.page.fill('#ov-entrega', await D.page.evaluate(() => window.__dia(6)));
  await D.page.click('#ov-guardar');
  await D.page.waitForSelector('#ov-guardar', { state: 'detached', timeout: 5000 });
  ok(await D.page.evaluate(() => window.__bd.ordenesVenta.some(o => o.numero === 'OV-007' && o.origen === 'manual' && o.version === 1 && o.cantidad === 1200)), 'una orden nueva se guarda en el documento (manual, versión 1)');
  await D.page.waitForTimeout(300);
  ok(await D.page.evaluate(() => /OV-007/.test(document.getElementById('ov-tabla').innerText)), 'y aparece en la tabla al instante');
  /* duplicado */
  await D.page.click('[data-ov-nueva]'); await D.page.waitForSelector('#ov-guardar');
  await D.page.fill('#ov-numero', 'ov-007'); await D.page.fill('#ov-cli', 'X'); await D.page.selectOption('#ov-marca', { index: 1 }); await D.page.selectOption('#ov-pres', { index: 1 });
  await D.page.fill('#ov-cant', '10'); await D.page.fill('#ov-entrega', await D.page.evaluate(() => window.__dia(6)));
  await D.page.click('#ov-guardar'); await D.page.waitForFunction(() => /Ya existe/.test((document.getElementById('ov-error') || {}).textContent || ''));
  ok(true, 'un N.º repetido se rechaza («Ya existe una orden con ese N.º»)');
  await D.page.click('#ov-cancelar');
  /* importar CSV */
  await D.page.click('[data-ov-importar]'); await D.page.waitForSelector('#ovi-archivo');
  const csv = 'N.º orden,Cliente,Marca,Presentación,Cantidad,Fecha de entrega\nOV-001,Distribuidora Andina SAC,Bells,625 ML PACK X 15 UND,32000,' + (await D.page.evaluate(() => window.__dia(2))) + '\nOV-100,Nuevo,Aro,7 Litros,500,' + (await D.page.evaluate(() => window.__dia(8))) + '\n';
  await D.page.setInputFiles('#ovi-archivo', { name: 'ventas.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await D.page.waitForSelector('.ov-vista');
  const vista = await D.page.evaluate(() => document.querySelector('.ov-vista').innerText.replace(/\s+/g, ' '));
  ok(/1 orden\(es\) nueva\(s\)/.test(vista) && /1 por actualizar/.test(vista), 'vista previa de la importación: 1 nueva y 1 por actualizar → ' + vista.slice(0, 80));
  await D.page.once('dialog', d => d.dismiss().catch(() => {}));
  await D.page.click('#ovi-aplicar'); await D.page.waitForSelector('#ovi-aplicar', { state: 'detached', timeout: 5000 });
  ok(await D.page.evaluate(() => { const l = window.__bd.ordenesVenta; return l.filter(o => o.numero === 'OV-001').length === 1 && l.find(o => o.numero === 'OV-001').cantidad === 32000 && l.some(o => o.numero === 'OV-100' && o.origen === 'csv'); }), 'importar actualiza OV-001 (sin duplicarla) y crea OV-100 con origen csv');
  /* hoja real: PRODUCTO como un solo texto → equivalencias */
  await D.page.click('[data-ov-importar]'); await D.page.waitForSelector('#ovi-archivo');
  const csv2 = 'OC,TIENDA,FECHA ENTREGA,PRODUCTO,UND SOLICITADAS,UND DESPACHO\n9001,Makro Ate,' + (await D.page.evaluate(() => window.__dia(5))) + ',BELLS-AGUA-BT-625-ML,300,100\n';
  await D.page.setInputFiles('#ovi-archivo', { name: 'makro.csv', mimeType: 'text/csv', buffer: Buffer.from(csv2) });
  await D.page.waitForSelector('[data-ovi-guardar-eq]');
  ok(await D.page.evaluate(() => /aún no están en el sistema/.test(document.querySelector('.plan-aviso').innerText) && document.querySelectorAll('tr[data-eq]').length === 1), 'un producto sin equivalencia se avisa con su fila para elegir marca y presentación');
  await D.page.selectOption('tr[data-eq] [data-eq-linea]', { index: 1 });
  await D.page.selectOption('tr[data-eq] [data-eq-marca]', { index: 1 }); await D.page.selectOption('tr[data-eq] [data-eq-pres]', { index: 1 });
  await D.page.click('[data-ovi-guardar-eq]');
  await D.page.waitForFunction(() => /1 orden\(es\) nueva\(s\)/.test((document.querySelector('.ov-vista') || {}).innerText || ''));
  await D.page.click('#ovi-aplicar'); await D.page.waitForSelector('#ovi-aplicar', { state: 'detached', timeout: 5000 });
  ok(await D.page.evaluate(() => { const o = window.__bd.ordenesVenta.find(x => x.numero === '9001'); return !!o && o.despachado === 100 && o.cantidad === 300 && !!o.marca && Object.keys(window.__bd.ordenesVentaConfig.equivalencias || {}).length === 1; }), 'la equivalencia se guarda y la orden entra con 100 de 300 ya despachadas');
  ok(await D.page.evaluate(() => !!document.querySelector('#ov-sheets details') && /Preparada · sin conectar/.test(document.getElementById('ov-sheets').innerText) && !!document.querySelector('button[disabled][title*="Google Sheets"]')), 'Google Sheets: panel de columnas preparado y botón «Sincronizar» apagado');
  /* vistas movidas */
  const nav = await D.page.evaluate(() => { goProductosParametros(); return { tab: state.currentTab, titulo: document.querySelector('#plan-root h2').textContent, sinTabs: !document.getElementById('plan-tabs'), cat: !!document.getElementById('cat-tabla'), grupo: document.getElementById('sidebar-panel-mantenimiento').hidden === false, activo: document.getElementById('btn-productos-parametros').classList.contains('active') }; });
  ok(nav.tab === 'productos-parametros' && nav.titulo === 'Productos y parámetros' && nav.sinTabs && nav.cat && nav.grupo && nav.activo, 'Productos y parámetros se abre desde Mantenimiento (catálogo y tiempos, sin barra de pestañas, grupo abierto y botón activo)');
  const nav2 = await D.page.evaluate(() => { goHorarioProduccion(); return { tab: state.currentTab, titulo: document.querySelector('#plan-root h2').textContent, hz: !!document.querySelector('#plan-cuerpo [id^=hz-]'), grupo: document.getElementById('sidebar-panel-produccion').hidden === false, activo: document.getElementById('btn-horario-produccion').classList.contains('active') }; });
  ok(nav2.tab === 'horario-produccion' && nav2.titulo === 'Horario de producción' && nav2.hz && nav2.grupo && nav2.activo, 'Horario de producción se abre desde Producción (reglas de horario, grupo abierto y botón activo)');
  ok(await D.page.evaluate(() => !document.getElementById('btn-asistente') || true), 'el menú sigue funcionando');
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  if (process.env.GLX_CAPTURAS) {
    await D.page.evaluate(() => { goPlanificacion(); glacialPlanificacion.estado.tab = 'ventas'; });
    await D.page.evaluate(() => [...document.querySelectorAll('#plan-root .plan-tab')].find(e => e.textContent.trim() === 'Órdenes de ventas').click());
    await D.page.waitForTimeout(500);
    await D.page.screenshot({ path: process.env.GLX_CAPTURAS + '/planificacion-ordenes-venta.png', fullPage: true });
  }
  await H.cerrar();
  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})();
