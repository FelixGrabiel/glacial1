/* Mantenimiento · Plan anual en un navegador de verdad (cliente de Supabase simulado). Uso: GLX_LIBS=/ruta node tests/mantenimiento-plan-anual.e2e.js
   (no forma parte de las pruebas rápidas). GLX_CAPTURAS=/carpeta guarda capturas. */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
const fs = require('fs'), path = require('path');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const MUESTRA = JSON.parse(fs.readFileSync(path.join(__dirname, 'datos', 'mtto-plan-muestra.json'), 'utf8'));
(async () => {
  const H = await iniciar();
  const D = await H.abrir(1500, 950);
  const P = D.page;
  await P.evaluate(muestra => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    document.documentElement.style.overflow = 'auto'; document.body.style.overflow = 'auto'; document.body.style.height = 'auto';
    window.tareoAhoraServidor = () => Date.parse('2026-11-07T15:00:00-05:00');          // sábado 07/11/2026: semana 45
    state.user = { rol: 'Administrador', nombre: 'Cristian Meza', username: 'cmeza', permisos: 'todos' }; state.showWelcome = false;
    /* cliente de Supabase simulado: tablas en memoria, versión por fila y canal en vivo que el test dispara a mano */
    const bd = JSON.parse(JSON.stringify(muestra)); window.__bd = bd; window.__canal = [];
    bd.registros = bd.registros || []; bd.regActs = bd.regActs || [];
    const tabla = n => n === 'mtto_maquinas' ? bd.maquinas : n === 'mtto_plan_actividades' ? bd.actividades : n === 'mtto_registros' ? bd.registros : n === 'mtto_registro_actividades' ? bd.regActs : null;
    const consulta = (nombre) => {
      const q = { nombre, filtros: [], orden: null, op: 'select', fila: null, en: null };
      const ejecutar = () => {
        const t = tabla(nombre);
        if (nombre === 'mtto_config') return { data: q.op === 'select' ? null : null, error: null };
        let hit = t.filter(r => q.filtros.every(([k, v]) => r[k] === v) && (!q.en || q.en[1].includes(r[q.en[0]])));
        if (q.op === 'select') { if (q.orden) hit = hit.slice().sort((a, b) => (a[q.orden] || 0) - (b[q.orden] || 0)); return { data: hit.map(r => ({ ...r })), error: null }; }
        if (q.op === 'update') { hit.forEach(r => Object.assign(r, q.fila, { version: r.version + 1 })); return { data: hit.map(r => ({ ...r })), error: null }; }
        if (q.op === 'insert') { const n = { id: 'nuevo-' + (t.length + 1), version: 1, anio: 2026, ...q.fila }; t.push(n); return { data: [{ ...n }], error: null }; }
        if (q.op === 'delete') { bd[nombre === 'mtto_maquinas' ? 'maquinas' : 'actividades'] = t.filter(r => !hit.includes(r)); return { data: hit, error: null }; }
      };
      const api = {
        select() { if (q.op === 'select' || q.op === 'x') q.op = 'select'; return api; }, order(c) { q.orden = c; return api; }, limit() { return api; },
        eq(k, v) { q.filtros.push([k, v]); return api; }, in(k, vals) { q.en = [k, vals]; return api; }, maybeSingle() { return Promise.resolve({ data: nombre === 'mtto_config' ? { id: 'config', datos: { inicioRegistros: { anio: 2026, semana: 1 } } } : null, error: null }); },
        update(f) { q.op = 'update'; q.fila = f; return api; }, insert(f) { q.op = 'insert'; q.fila = f; return api; }, delete() { q.op = 'delete'; return api; },
        then(res, rej) { return Promise.resolve(ejecutar()).then(res, rej); }
      };
      return api;
    };
    const cliente = {
      from: consulta,
      channel() { const ch = { on(_t, _f, cb) { window.__canal.push(cb); return ch; }, subscribe(cb) { setTimeout(() => cb('SUBSCRIBED'), 10); return ch; } }; return ch; },
      removeChannel() {}
    };
    glacialMttoPlanDatos.usarCliente(cliente);
    goPlanAnualMtto();
  }, MUESTRA);
  await P.waitForSelector('.mp-t', { timeout: 8000 });

  const txt = async s => P.evaluate(x => (document.querySelector(x) || {}).innerText || '', s);
  ok(await P.evaluate(() => document.querySelectorAll('.mp-chip').length) === 3, 'una pestaña por máquina (3 de la muestra)');
  ok(await P.evaluate(() => [...document.querySelectorAll('.mp-grupo b')].map(b => b.textContent).join()) === 'SEMANAL,MENSUAL,SEMESTRAL,ANUAL', 'agrupado por bloque de frecuencia, como el Excel');
  ok(await P.evaluate(() => document.querySelectorAll('.mp-todo-pill').length) === 18, 'las 18 actividades semanales muestran «Todas las semanas · 1 – 52»');
  const tarj = await P.evaluate(() => [...document.querySelectorAll('.mp-card')].map(c => c.innerText.replace(/\s+/g, ' ')));
  ok(/37/.test(tarj[0]) && /18 actividades/.test(tarj[1]) && /S48/.test(tarj[2]) && /\+5/.test(tarj[2]) && /Cumplimiento del plan/.test(tarj[3]) && /Vencidas/.test(tarj[4]), 'tarjetas: 37 en el plan · 18 esta semana (S45) · próxima con extras S48 · +5 · cumplimiento y vencidas → ' + tarj.join(' | '));
  ok(await P.evaluate(() => !!document.querySelector('.mp-t .mp-sem.mp-programada')), 'las semanas que vienen se ven «programadas»');
  ok(await P.evaluate(() => !!document.querySelector('[data-mp-nueva]')) && await P.evaluate(() => document.querySelectorAll('[data-mp-editar]').length) === 37, 'el Administrador ve «+ Actividad» y editar en cada fila');
  /* buscador, filtros por frecuencia y detalle al tocar una actividad */
  const nFilas = () => P.evaluate(() => document.querySelectorAll('tr.mp-fila').length);
  await P.fill('[data-mp-buscar]', 'horno');
  ok(await P.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-mp-buscar')) && (await nFilas()) > 0 && (await nFilas()) < 37 && await P.evaluate(() => [...document.querySelectorAll('tr.mp-fila')].every(r => /horno/i.test(r.textContent))), 'el buscador filtra mientras escribes y no pierde el cursor');
  ok(/Mostrando \d+ de 37/.test(await txt('.mp-herr')), 'dice cuántas muestra de cuántas');
  await P.fill('[data-mp-buscar]', 'zzzz'); ok(/Ninguna actividad coincide/.test(await txt('.mp')), 'sin coincidencias avisa y ofrece quitar filtros');
  await P.click('[data-mp-limpiar]'); ok((await nFilas()) === 37, 'quitar filtros muestra todas otra vez');
  await P.click('[data-mp-frec="MENSUAL"]');
  ok(await P.evaluate(() => [...document.querySelectorAll('tr.mp-fila .mp-frec')].every(c => c.textContent.trim() === 'MENSUAL')) && (await nFilas()) > 0, 'el botón de frecuencia deja solo las mensuales');
  await P.click('[data-mp-frec=""]');
  await P.locator('tr.mp-fila').first().locator('.mp-act').click();
  ok(await P.evaluate(() => document.querySelectorAll('.mp-det .mp-cal-g .mp-cal').length) >= 52 && await P.evaluate(() => !!document.querySelector('tr.mp-fila.abierta[aria-expanded="true"]')), 'al tocar una actividad se abre el calendario de todas las semanas del año (52 o 53)');
  ok(await P.evaluate(() => !!document.querySelector('.mp-det .mp-cal-actual')) && /Próximas/.test(await txt('.mp-det')) && /Todas las semanas del año/.test(await txt('.mp-det')), 'el detalle marca la semana actual, las próximas y cómo se programa');
  if (process.env.GLX_CAPTURAS) { await P.evaluate(() => { document.querySelector('.mp-tw').style.maxHeight = 'none'; }); const bx = await P.evaluate(() => { const a = document.querySelector('.mp-herr').getBoundingClientRect(), b = document.querySelector('.mp-det').getBoundingClientRect(); return { y: a.top + scrollY - 40, h: b.bottom - a.top + 60 }; }); await P.screenshot({ path: process.env.GLX_CAPTURAS + '/plan-anual-interactivo.png', fullPage: true, clip: { x: 0, y: Math.max(bx.y, 0), width: 1500, height: bx.h } }); }
  await P.locator('tr.mp-fila').first().locator('.mp-act').click(); ok(await P.evaluate(() => !document.querySelector('.mp-det')), 'tocar otra vez la cierra');
  await P.click('[data-mp-solo]'); ok((await nFilas()) === 18, '«Solo lo de esta semana» deja las 18 de esta semana (S45)'); await P.click('[data-mp-solo]');
  if (process.env.GLX_CAPTURAS) { await P.evaluate(() => { document.querySelector('.mp-tw').style.maxHeight = 'none'; }); await P.screenshot({ path: process.env.GLX_CAPTURAS + '/plan-anual.png', fullPage: true }); await P.evaluate(() => { document.querySelector('.mp-tw').style.maxHeight = ''; }); }

  /* imprimir: arma el documento A4 horizontal en un marco oculto (SOP = 2 hojas) y abre el diálogo de impresión */
  ok(await P.evaluate(() => !!document.querySelector('[data-mp-imprimir]') && !!document.querySelector('[data-mp-excel]')), 'botones «Exportar Excel» e «Imprimir»');
  await P.evaluate(() => { HTMLIFrameElement.prototype.__p = 0; });
  await P.click('[data-mp-imprimir]');
  await P.waitForSelector('iframe[aria-hidden="true"]', { state: 'attached' });
  const doc = await P.evaluate(() => document.querySelector('iframe[aria-hidden="true"]').srcdoc);
  ok((doc.match(/<section class="hoja/g) || []).length === 2 && /A4 landscape/.test(doc) && /<i>SOPLADORA<\/i>/.test(doc) && /assets\/img\/mtto-logo\.png/.test(doc), 'Imprimir arma el impreso de la máquina (2 hojas A4 horizontales, encabezado y logo)');
  /* hoja CARB: pendiente de confirmar */
  await P.click('[data-mp-maq="m-SOP-CARB"]');
  ok(/Pendiente de confirmar/.test(await txt('.mp')) && /SOPLADORA 8 CAVIDADES/.test(await txt('.mp-cab h2')), 'la hoja CARB muestra «Pendiente de confirmar» y su nombre');
  await P.click('[data-mp-maq="m-SOP"]');

  /* editar: se guarda con la versión vista; si otra persona la cambió, no se pisa */
  await P.click('[data-mp-editar="a-m-SOP-1"]');
  await P.waitForSelector('.mp-modal');
  await P.fill('#mpe-act', 'BOCINAS (PRUEBA) / LUBRICACIÓN');
  await P.click('#mpe-ok'); await P.waitForSelector('.mp-modal', { state: 'detached' });
  ok(/PRUEBA/.test(await txt('.mp-t')) && await P.evaluate(() => __bd.actividades.find(a => a.id === 'a-m-SOP-1').version) === 2, 'editar una actividad: se guarda y la versión sube a 2');
  await P.click('[data-mp-editar="a-m-SOP-2"]'); await P.waitForSelector('.mp-modal');
  await P.evaluate(() => { const a = __bd.actividades.find(x => x.id === 'a-m-SOP-2'); a.version = 5; a.actividad = 'CAMBIADO POR OTRA PERSONA / LIMPIEZA'; });   // otra persona la editó mientras tanto
  await P.fill('#mpe-act', 'MI CAMBIO / LIMPIEZA'); await P.click('#mpe-ok');
  await P.waitForFunction(() => /Otra persona cambió/.test((document.getElementById('mpe-err') || {}).textContent || ''), null, { timeout: 4000 });
  ok(await P.evaluate(() => __bd.actividades.find(a => a.id === 'a-m-SOP-2').actividad) === 'CAMBIADO POR OTRA PERSONA / LIMPIEZA', 'si otra persona editó antes, no se pisa y se avisa');
  await P.waitForSelector('.mp-modal', { state: 'detached', timeout: 6000 });

  /* agregar y quitar */
  await P.click('[data-mp-nueva]'); await P.waitForSelector('.mp-modal');
  await P.fill('#mpe-act', 'ACTIVIDAD NUEVA / REVISIÓN'); await P.selectOption('#mpe-frec', 'MENSUAL'); await P.fill('#mpe-item', '4'); await P.evaluate(() => { document.getElementById('mpe-todo').click(); });
  await P.fill('[data-mpe-mes="2"]', '9'); await P.fill('[data-mpe-mes="8"]', '35');
  await P.click('#mpe-ok'); await P.waitForSelector('.mp-modal', { state: 'detached' });
  await P.waitForFunction(() => __bd.actividades.some(x => x.actividad === 'ACTIVIDAD NUEVA / REVISIÓN'), null, { timeout: 3000 }).catch(() => {});
  if (process.env.GLX_DEPURAR) console.log('DBG', await P.evaluate(() => JSON.stringify(__bd.actividades.filter(x => /NUEVA/.test(x.actividad)))));
  ok(await P.evaluate(() => { const a = __bd.actividades.find(x => x.actividad === 'ACTIVIDAD NUEVA / REVISIÓN'); return !!a && a.semanas.join() === '9,35' && a.bloque_orden === 3 && a.semanas_por_mes[2] === '9'; }), 'agregar una actividad mensual con semanas 9 y 35');
  ok(/ACTIVIDAD NUEVA/.test(await txt('.mp-t')) && await P.evaluate(() => [...document.querySelectorAll('.mp-grupo b')].map(b => b.textContent).join()) === 'SEMANAL,MENSUAL,SEMESTRAL,ANUAL', 'la nueva aparece dentro del bloque MENSUAL');
  await P.click('[data-mp-editar="nuevo-' + (MUESTRA.actividades.length + 1) + '"]'); await P.waitForSelector('.mp-modal');
  await P.fill('#mpe-act', ''); await P.click('#mpe-ok');
  ok(/Falta la frecuencia o la actividad/.test(await txt('#mpe-err')), 'una actividad sin texto no se guarda');
  await P.click('#mpe-quitar'); await P.click('#mpe-quitar'); await P.waitForSelector('.mp-modal', { state: 'detached' });
  ok(!/ACTIVIDAD NUEVA/.test(await txt('.mp-t')), 'quitar pide confirmación y desaparece');

  /* tiempo real: otro dispositivo cambia una actividad y esta pantalla lo muestra sin recargar */
  await P.evaluate(() => { const a = __bd.actividades.find(x => x.id === 'a-m-SOP-3'); const n = { ...a, actividad: 'CAMBIO EN VIVO / REVISIÓN', version: a.version + 1 }; Object.assign(a, n); __canal.forEach(cb => cb({ eventType: 'UPDATE', new: n })); });
  await P.waitForFunction(() => /CAMBIO EN VIVO/.test(document.querySelector('.mp-t').innerText), null, { timeout: 3000 });
  ok(true, 'tiempo real: el cambio de otro dispositivo aparece solo (sin recargar)');
  ok(await txt('.mp-vivo') .then(t => /En vivo/.test(t)), 'indicador «En vivo»');

  /* solo lectura: Producción */
  await P.evaluate(() => { state.user = { rol: 'Supervisor de Producción', nombre: 'Pedro', username: 'pedro', permisos: {} }; glacialMttoPlanPantalla.pintar(document.getElementById('main')); });
  ok(!(await P.evaluate(() => !!document.querySelector('[data-mp-nueva],[data-mp-editar]'))) && /Solo el Supervisor/.test(await txt('.mp-leyenda')), 'Producción ve el plan sin «+ Actividad» ni editar');
  await P.evaluate(() => { state.user = { rol: 'Administrador', nombre: 'Cristian Meza', username: 'cmeza', permisos: 'todos' }; glacialMttoPlanPantalla.pintar(document.getElementById('main')); });

  /* celular */
  await P.setViewportSize({ width: 390, height: 844 }); await P.waitForTimeout(150);
  ok(await P.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, 'celular: la página no se desborda de lado (la tabla se desliza dentro de su cuadro)');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/plan-anual-movil.png' });
  /* líneas: el selector muestra todas las de la planta; una línea sin máquinas ofrece crear la primera */
  ok(await P.evaluate(() => [...document.querySelectorAll('[data-mp-linea] option')].map(o => o.textContent).join()) === 'PET,B7L,C20L,B20L', 'el selector «Línea» muestra PET, B7L, C20L y B20L aunque todavía no tengan máquinas');
  await P.selectOption('[data-mp-linea]', 'B7L');
  ok(/Todavía no hay plan de mantenimiento para B7L/.test(await txt('.mp-vacio')) && await P.evaluate(() => !!document.querySelector('.mp-vacio [data-mp-maquina]')), 'B7L sin máquinas lo dice y ofrece «+ Máquina en B7L»');
  if (process.env.GLX_CAPTURAS) { await P.setViewportSize({ width: 1500, height: 800 }); await P.waitForTimeout(250); const bx = await P.evaluate(() => { const a = document.querySelector('.mp-cab').getBoundingClientRect(), b = document.querySelector('.mp-vacio').getBoundingClientRect(); return { y: a.top + scrollY - 20, h: b.bottom - a.top + 40 }; }); await P.screenshot({ path: process.env.GLX_CAPTURAS + '/plan-linea-vacia.png', fullPage: true, clip: { x: 260, y: Math.max(bx.y, 0), width: 1240, height: bx.h } }); }
  await P.click('.mp-vacio [data-mp-maquina]');
  await P.fill('#mpm-nombre', ''); await P.click('#mpm-ok'); ok(/Escribe el nombre/.test(await txt('#mpm-err')), 'sin nombre no se crea');
  await P.fill('#mpm-nombre', 'Llenadora de bidones'); await P.click('#mpm-ok');
  await P.waitForSelector('.mp-chip.on', { timeout: 3000 });
  const nm = await P.evaluate(() => { const m = __bd.maquinas.find(x => x.nombre === 'Llenadora de bidones'); return m ? { l: m.linea_impresion, c: m.codigo_hoja, p: m.planta, lr: m.linea } : null; });
  ok(nm && nm.l === 'B7L' && nm.p === 'AGUA' && nm.lr === 'B7L' && /^B7L-LLENADORA-DE-BIDON/.test(nm.c), 'la máquina se crea en B7L con su código de hoja → ' + JSON.stringify(nm));
  ok(await P.evaluate(() => document.querySelectorAll('.mp-chip').length) === 1 && await P.evaluate(() => !!document.querySelector('[data-mp-nueva]')) && /B7L/.test(await txt('.mp-cab')), 'aparece su pestaña y ya se pueden agregar actividades con «+ Actividad»');
  await P.click('[data-mp-maquina]'); await P.fill('#mpm-nombre', 'llenadora de bidones'); await P.click('#mpm-ok');
  ok(/Ya hay una máquina/.test(await txt('#mpm-err')), 'no deja crear dos máquinas con el mismo nombre en la línea'); await P.click('#mpm-x');
  await P.selectOption('[data-mp-linea]', 'PET'); await P.waitForTimeout(150);

  /* ejecución del plan según el Registro: hecha, no realizada y vencida; cumplimiento y vencidas por máquina (el Registro empezó en la S41) */
  const inj = await P.evaluate(() => {
    const D = window.glacialMttoPlanDatos, m = D.cache.maquinas.find(x => D.cache.actividades.some(a => a.maquina_id === x.id && a.es_todo_el_anio)), a = D.cache.actividades.find(x => x.maquina_id === m.id && x.es_todo_el_anio);
    D.cache.config = { datos: { inicioRegistros: { anio: 2026, semana: 41 } } };
    const reg = (sem, est) => { const r = { id: 'rj' + sem, maquina_id: m.id, anio: 2026, semana: sem, estado: est, version: 1 }; __bd.registros.push(r); return r; };
    reg(43, 'VALIDADO'); reg(44, 'CERRADO');
    __bd.regActs.push({ id: 'aj1', registro_id: 'rj43', plan_actividad_id: a.id, realizado: true, no_realizado: false, motivo_no: '', origen_actividad_id: null },
      { id: 'aj2', registro_id: 'rj44', plan_actividad_id: a.id, realizado: false, no_realizado: true, motivo_no: 'Falta de repuesto', origen_actividad_id: null });
    return { m: m.id, a: a.id };
  });
  await P.evaluate(() => glacialMttoPlanDatos.cargarEjecucion(2026)); await P.click('[data-mp-maq="' + inj.m + '"]'); await P.waitForTimeout(300);
  await P.locator('tr.mp-fila[data-mp-fila="' + inj.a + '"] .mp-act').click();
  ok(await P.evaluate(() => !!document.querySelector('.mp-det .mp-cal-ok') && !!document.querySelector('.mp-det .mp-cal-noreal') && !!document.querySelector('.mp-det .mp-cal-venc')), 'el calendario pinta lo hecho (S43), lo no realizado (S44) y lo vencido (S41-S42)');
  ok(await P.evaluate(() => /Falta de repuesto/.test(document.querySelector('.mp-det .mp-cal-noreal').title)), 'al pasar sobre «No se realizó» se ve su motivo');
  ok(/Cumplimiento del plan/.test(await txt('.mp-cards')) && await P.evaluate(() => [...document.querySelectorAll('.mp-card')].some(c => /Cumplimiento/.test(c.textContent) && /\d+ %/.test(c.textContent))), 'tarjeta «Cumplimiento del plan» con su porcentaje');
  ok(await P.evaluate(() => !!document.querySelector('.mp-chip b.mp-venc')) && /vencida/.test(await txt('tr.mp-fila[data-mp-fila="' + inj.a + '"]')), 'la máquina muestra su número de vencidas y la fila su «✓ n de m · k vencidas»');
  if (process.env.GLX_CAPTURAS) { await P.setViewportSize({ width: 1500, height: 900 }); await P.waitForTimeout(300); await P.evaluate(() => { document.querySelector('.mp-tw').style.maxHeight = 'none'; }); const bx = await P.evaluate(() => { const a = document.querySelector('.mp-cards').getBoundingClientRect(), b = document.querySelector('.mp-det').getBoundingClientRect(); return { y: a.top + scrollY - 70, h: b.bottom - a.top + 90 }; }); await P.screenshot({ path: process.env.GLX_CAPTURAS + '/plan-anual-ejecucion.png', fullPage: true, clip: { x: 0, y: Math.max(bx.y, 0), width: 1500, height: bx.h } }); }
  /* paradas de Producción por máquina del plan (Mantenimiento ↔ Producción) */
  await P.evaluate(() => {
    const it = (m, e) => ({ equipo: e, minutos: m, causa: 'Falla de máquina', motivo: 'Ruptura de correa' });
    const U = [{ fecha: '2026-11-03', linea: 'PET1', turno: 'DÍA', npItems: [it(30, 'Sopladora')] }, { fecha: '2026-11-05', linea: 'PET1', turno: 'NOCHE', npItems: [it(20, 'Sopladora')] },
      { fecha: '2026-11-06', linea: 'PET1', turno: 'DÍA', npItems: [it(45, 'Sopladora'), { equipo: '', minutos: 7, causa: 'Cambio de formato', motivo: 'x' }] }];
    window.glacialAnalisisParadas = { listarUnidades: () => ({ unidades: U }), equipoDeParada: x => /falla/i.test(x.causa) ? (x.equipo || 'Equipo sin indicar') : null };
  });
  const idDe = n => P.evaluate(t => (glacialMttoPlanDatos.cache.maquinas.find(m => m.codigo_hoja === t) || {}).id, n);
  await P.click('[data-mp-maq="' + await idDe('SOP') + '"]');
  ok(await P.evaluate(() => { const t = (document.querySelector('.mpd') || {}).textContent || ''; return /Falla repetitiva/.test(t) && /3 paradas por falla/.test(t) && /95 min/.test(t); }), 'Plan anual · SOP: alerta de falla repetitiva (3 paradas, 95 min) con las paradas de Producción de PET1');
  ok(await P.evaluate(() => /Preventivo vencido/.test(document.querySelector('.mpd').textContent) && /Último preventivo hecho/.test(document.querySelector('.mpd').textContent) && !!document.querySelector('.mpd details')), 'la tarjeta junta las paradas con el estado del preventivo y la lista de paradas');
  await P.click('[data-mp-maq="' + await idDe('ENV') + '"]');
  ok(await P.evaluate(() => /sin paradas por falla/.test(document.querySelector('.mpd').textContent)), 'ENV: la envasadora no tuvo fallas');
  ok(await P.evaluate(async () => { const m = glacialMttoPlanDatos.cache.maquinas.find(x => x.codigo_hoja === 'SOP'); const h = glacialMttoParadas.htmlPanelRegistro(m, { anio: 2026, semana: 45 }); return /Paradas de Producción de esta semana/.test(h) && /3 paradas por falla/.test(h) && /Revísalas antes de marcar/.test(h); }), 'Registro · el panel de la semana 45 lista las 3 paradas de SOP');
  await P.click('[data-mp-maq="' + await idDe('SOP') + '"]'); await P.click('[data-mpd-equiv]');
  ok(await P.evaluate(() => document.querySelectorAll('.mpd-eq select').length) >= 8, 'las equivalencias con Producción se pueden editar (una fila por equipo y línea)');
  await P.click('#mpd-x');
  if (process.env.GLX_CAPTURAS) { await P.setViewportSize({ width: 1500, height: 900 }); await P.waitForTimeout(250); const bx = await P.evaluate(() => { const a = document.querySelector('.mp-cards').getBoundingClientRect(), b = document.querySelector('.mpd').getBoundingClientRect(); return { y: a.top + scrollY - 20, h: b.bottom - a.top + 40 }; }); await P.screenshot({ path: process.env.GLX_CAPTURAS + '/plan-paradas.png', fullPage: true, clip: { x: 260, y: Math.max(bx.y, 0), width: 1240, height: bx.h } }); }

  /* Inicio de Mantenimiento: «Esta semana en Mantenimiento» */
  await P.setViewportSize({ width: 1500, height: 950 });
  await P.evaluate(() => { state.currentTab = 'mant-inicio'; if (typeof renderSidebar === 'function') renderSidebar(); renderMain(); });
  await P.waitForSelector('#mi-semana .mi-k', { timeout: 4000 }).catch(() => {});
  const sem = await txt('#mi-semana');
  ok(/Esta semana en Mantenimiento · S45/.test(sem) && /Toca esta semana/.test(sem) && /Sin registro iniciado/.test(sem) && /Vencidas/.test(sem) && /Registros por validar/.test(sem), 'el Inicio de Mantenimiento muestra «Esta semana en Mantenimiento» (S45) con lo que toca, lo sin registro, lo vencido y lo por validar → ' + sem.replace(/\s+/g, ' ').slice(0, 160));
  ok(await P.evaluate(() => { const t = (document.querySelector('#mi-semana .mpd-inicio') || {}).textContent || ''; return /Fallas repetitivas/.test(t) && /SOPLADORA/.test(t); }), 'el Inicio avisa de la falla repetitiva de SOPLADORA y lista las máquinas con más paradas');
  ok(await P.evaluate(() => !!document.querySelector('#mi-semana [data-mi-sem="programa"]') && !!document.querySelector('#mi-semana [data-mi-sem="plan"]')), 'tiene los accesos al Programa semanal y al Plan anual');
  if (process.env.GLX_CAPTURAS) { const el = await P.$('#mi-semana'); if (el) await el.screenshot({ path: process.env.GLX_CAPTURAS + '/mant-inicio-semana.png' }); }
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
