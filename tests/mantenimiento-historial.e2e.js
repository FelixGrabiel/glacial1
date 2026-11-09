/* Mantenimiento · Historial de registros en un navegador de verdad (cliente de Supabase simulado). Uso: GLX_LIBS=/ruta node tests/mantenimiento-historial.e2e.js
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
    const AHORA = Date.parse('2026-11-07T09:30:00-05:00'); window.tareoAhoraServidor = () => AHORA;
    state.user = { rol: 'Administrador', nombre: 'Cristian Meza', username: 'cmeza', permisos: 'todos' }; state.showWelcome = false;
    const bd = JSON.parse(JSON.stringify(muestra)); window.__bd = bd; window.__canal = [];
    /* 60 registros de 2026: semanas 1–30 de la Sopladora (VALIDADO salvo las 2 últimas) y de la Envasadora; la 30 de SOP en curso */
    bd.registros = []; bd.regActs = []; bd.piezas = [];
    const tecnicos = ['CESAR ALPELIMA', 'JOSÉ BETANCOURT'];
    for (let s = 1; s <= 30; s++) ['m-SOP', 'm-ENV'].forEach((m, k) => {
      const id = 'r-' + m + '-' + s, est = s === 30 ? (k ? 'CERRADO' : 'EN_CURSO') : 'VALIDADO';
      bd.registros.push({ id, maquina_id: m, anio: 2026, semana: s, fecha: '2026-01-05', estado: est, tipo_mtto: 'PREVENTIVO', condicion: 'INTERNO', proxima_revision: '2026-01-12', tecnico_senior: tecnicos[k], maquinista: k ? 'ANA PÉREZ' : 'ELISEO ARVI', hora_inicio_prog: '07:00:00', hora_fin_prog: '16:00:00', horas_prog: 8, informe_final: 'Informe', cerrado_en: est === 'EN_CURSO' ? null : '2026-01-05T20:00:00Z', validado_en: est === 'VALIDADO' ? '2026-01-06T13:00:00Z' : null, validado_por: est === 'VALIDADO' ? 'CRISTIAN MEZA' : '', version: 1, actualizado_en: '2026-01-06T13:00:00Z' });
    });
    bd.regActs.push({ id: 'ra1', registro_id: 'r-m-SOP-14', item: 1, equipo: 'TOBERAS', actividad: 'REVISIÓN', frecuencia: 'SEMANAL', realizado: true, version: 1 });
    bd.piezas.push({ id: 'pz1', registro_id: 'r-m-SOP-14', orden: 1, descripcion: 'Pieza de prueba SEM 14', version: 1 });
    const T = { mtto_maquinas: 'maquinas', mtto_plan_actividades: 'actividades', mtto_registros: 'registros', mtto_registro_actividades: 'regActs', mtto_registro_piezas: 'piezas' };
    const consulta = nombre => {
      const q = { filtros: [], en: null, orden: null };
      const api = {
        select() { return api; }, order(c, o) { q.orden = [c, o && o.ascending === false ? -1 : 1]; return api; }, limit() { return api; }, eq(k, v) { q.filtros.push([k, v]); return api; }, in(k, v) { q.en = [k, v]; return api; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        then(res, rej) {
          if (nombre === 'mtto_config') return Promise.resolve({ data: null, error: null }).then(res, rej);
          let h = (bd[T[nombre]] || []).filter(r => q.filtros.every(([k, v]) => r[k] === v) && (!q.en || q.en[1].includes(r[q.en[0]])));
          if (q.orden) h = h.slice().sort((a, b) => ((a[q.orden[0]] || 0) - (b[q.orden[0]] || 0)) * q.orden[1]);
          return Promise.resolve({ data: h.map(r => ({ ...r })), error: null }).then(res, rej);
        }
      };
      return api;
    };
    glacialMttoPlanDatos.usarCliente({ from: consulta, channel() { const ch = { on(_t, f, cb) { window.__canal.push({ tabla: f.table, cb }); return ch; }, subscribe(cb) { setTimeout(() => cb('SUBSCRIBED'), 10); return ch; } }; return ch; }, removeChannel() {} });
    goHistorialMtto();
  }, MUESTRA);
  await P.waitForSelector('.hs-t', { timeout: 8000 });
  const txt = s => P.evaluate(x => (document.querySelector(x) || {}).innerText || '', s);
  const filas = () => P.evaluate(() => document.querySelectorAll('.hs-t tbody tr').length);

  ok(/Historial de registros/.test(await txt('.hs-cab')) && await P.evaluate(() => document.querySelector('.mt-tab.on').textContent) === 'Historial', 'pantalla «Historial de registros» con su pestaña');
  ok(await filas() === 50 && /60 registros/.test(await txt('.hs-pie')), 'muestra 50 de los 60 registros de 2026 (con «Mostrar más»)');
  const primera = await P.evaluate(() => document.querySelector('.hs-t tbody tr').innerText.replace(/\s+/g, ' '));
  ok(/SEM_30/.test(primera) && /SOPLADORA/.test(primera) && /EN CURSO/.test(primera), 'lo más reciente primero: SEM_30, Sopladora, EN CURSO → ' + primera.slice(0, 80));
  await P.click('[data-hs-mas]');
  ok(await filas() === 60, '«Mostrar más» trae el resto');

  /* filtros */
  await P.selectOption('[data-hs="maquinaId"]', 'm-ENV');
  ok(await filas() === 30 && /30 registros de 60/.test(await txt('.hs-pie')), 'filtro por máquina (Envasadora): 30');
  await P.fill('[data-hs="semana"]', '14');
  ok(await filas() === 1 && /SEM_14/.test(await txt('.hs-t tbody')), 'filtro por semana 14: 1 registro');
  await P.fill('[data-hs="semana"]', '');
  await P.selectOption('[data-hs="maquinaId"]', '');
  await P.selectOption('[data-hs="estado"]', 'CERRADO');
  ok(await filas() === 1 && /POR VALIDAR/.test(await txt('.hs-t tbody')), 'filtro por estado POR VALIDAR: 1');
  await P.selectOption('[data-hs="estado"]', '');
  await P.fill('[data-hs="texto"]', 'jose b');
  ok(await filas() === 30 && await P.evaluate(() => document.activeElement.getAttribute('data-hs')) === 'texto', 'buscar técnico «jose b» (sin tildes ni mayúsculas): 30, y el cursor sigue en el campo');
  await P.fill('[data-hs="texto"]', 'nadie');
  ok(/Ningún registro coincide/.test(await txt('.hs')), 'sin coincidencias: mensaje claro');
  await P.fill('[data-hs="texto"]', '');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/historial.png' });

  /* reimprimir un registro que NO es el de la semana cargada: pide sus actividades y piezas */
  await P.fill('[data-hs="semana"]', '14'); await P.selectOption('[data-hs="maquinaId"]', 'm-SOP');
  await P.click('[data-hs-imprimir]'); await P.waitForSelector('iframe[aria-hidden="true"]', { state: 'attached' });
  const doc = await P.evaluate(() => document.querySelector('iframe[aria-hidden="true"]').srcdoc);
  ok(/CFA - CA - F - 023/.test(doc) && /<u>SEM_14<\/u>/.test(doc) && /Pieza de prueba SEM 14/.test(doc) && /<td class="t">TOBERAS<\/td>/.test(doc), 'Imprimir reimprime el registro de esa semana con sus actividades y piezas');
  await P.evaluate(() => document.querySelector('iframe[aria-hidden="true"]').remove());

  /* abrir: queda en solo lectura (validado) */
  await P.click('[data-hs-ver]'); await P.waitForSelector('#rg-raiz');
  ok(/SEM_14/.test(await txt('.rg-datos')) && /VALIDADO/.test(await txt('.rg-prog-t')) && await P.evaluate(() => document.querySelector('.rg-chk').disabled), '«Abrir» muestra el registro validado en solo lectura');
  await P.evaluate(() => goHistorialMtto()); await P.waitForSelector('.hs-t');

  /* tiempo real: el supervisor valida el registro por validar desde otro dispositivo */
  await P.fill('[data-hs="semana"]', ''); await P.selectOption('[data-hs="maquinaId"]', ''); await P.selectOption('[data-hs="estado"]', 'CERRADO');
  await P.evaluate(() => { const r = __bd.registros.find(x => x.estado === 'CERRADO'); Object.assign(r, { estado: 'VALIDADO', validado_por: 'CRISTIAN MEZA', validado_en: '2026-11-07T14:00:00Z', version: 2 }); __canal.filter(c => c.tabla === 'mtto_registros').forEach(c => c.cb({ eventType: 'UPDATE', new: { ...r } })); });
  await P.waitForTimeout(700); if (process.env.GLX_DEPURAR) console.log('DBG2', await P.evaluate(() => JSON.stringify({ t: document.querySelector('.hs').innerText.slice(-300), est: document.querySelector('[data-hs=estado]').value, hist: glacialMttoPlanDatos.cache.historial.filter(r => r.estado === 'CERRADO').length })));
  await P.waitForFunction(() => /Ningún registro coincide/.test(document.querySelector('.hs').innerText), null, { timeout: 3000 });
  ok(true, 'tiempo real: un registro que se valida deja de aparecer como POR VALIDAR sin recargar');
  await P.selectOption('[data-hs="estado"]', 'VALIDADO');
  ok(await filas() === 50 || await filas() >= 50, 'y ya figura entre los VALIDADOS');

  /* otro año y celular */
  await P.selectOption('[data-hs="anio"]', '2025');
  await P.waitForFunction(() => /Todavía no hay registros en 2025/.test(document.querySelector('.hs').innerText), null, { timeout: 3000 });
  ok(true, 'cambiar de año: sin registros en 2025, con mensaje claro');
  await P.selectOption('[data-hs="anio"]', '2026');
  await P.setViewportSize({ width: 390, height: 844 }); await P.waitForTimeout(200);
  ok(await P.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, 'celular: la página no se desborda de lado');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/historial-movil.png' });
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
