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
    const tabla = n => n === 'mtto_maquinas' ? bd.maquinas : n === 'mtto_plan_actividades' ? bd.actividades : null;
    const consulta = (nombre) => {
      const q = { nombre, filtros: [], orden: null, op: 'select', fila: null };
      const ejecutar = () => {
        const t = tabla(nombre);
        if (nombre === 'mtto_config') return { data: q.op === 'select' ? null : null, error: null };
        let hit = t.filter(r => q.filtros.every(([k, v]) => r[k] === v));
        if (q.op === 'select') { if (q.orden) hit = hit.slice().sort((a, b) => (a[q.orden] || 0) - (b[q.orden] || 0)); return { data: hit.map(r => ({ ...r })), error: null }; }
        if (q.op === 'update') { hit.forEach(r => Object.assign(r, q.fila, { version: r.version + 1 })); return { data: hit.map(r => ({ ...r })), error: null }; }
        if (q.op === 'insert') { const n = { id: 'nuevo-' + (t.length + 1), version: 1, anio: 2026, ...q.fila }; t.push(n); return { data: [{ ...n }], error: null }; }
        if (q.op === 'delete') { bd[nombre === 'mtto_maquinas' ? 'maquinas' : 'actividades'] = t.filter(r => !hit.includes(r)); return { data: hit, error: null }; }
      };
      const api = {
        select() { if (q.op === 'select' || q.op === 'x') q.op = 'select'; return api; }, order(c) { q.orden = c; return api; }, limit() { return api; },
        eq(k, v) { q.filtros.push([k, v]); return api; }, maybeSingle() { return Promise.resolve({ data: null, error: null }); },
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
  ok(await P.evaluate(() => document.querySelectorAll('.mp-barra').length) === 18, 'las 18 actividades semanales muestran la barra «1 – 52»');
  const tarj = await P.evaluate(() => [...document.querySelectorAll('.mp-card')].map(c => c.innerText.replace(/\s+/g, ' ')));
  ok(/37/.test(tarj[0]) && /18 actividades/.test(tarj[1]) && /S48/.test(tarj[2]) && /\+5/.test(tarj[2]) && /—/.test(tarj[3]), 'tarjetas: 37 en el plan · 18 esta semana (S45) · próxima con extras S48 · +5 · vencidas aún sin registros → ' + tarj.join(' | '));
  ok(await P.evaluate(() => !!document.querySelector('.mp-t .mp-sem.mp-programada')) && !(await P.evaluate(() => !!document.querySelector('.mp-t .mp-sem.mp-vencida'))), 'sin módulo de registros lo pasado se ve «programado», no vencido en rojo');
  ok(await P.evaluate(() => !!document.querySelector('[data-mp-nueva]')) && await P.evaluate(() => document.querySelectorAll('[data-mp-editar]').length) === 37, 'el Administrador ve «+ Actividad» y editar en cada fila');
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
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
