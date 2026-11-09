/* Mantenimiento · Programa semanal en un navegador de verdad (cliente de Supabase simulado). Uso: GLX_LIBS=/ruta node tests/mantenimiento-programa-semanal.e2e.js
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
    const AHORA = Date.parse('2026-11-07T09:30:00-05:00');
    window.tareoAhoraServidor = () => AHORA;
    state.user = { rol: 'Administrador', nombre: 'Cristian Meza', username: 'cmeza', permisos: 'todos' }; state.showWelcome = false;
    const bd = JSON.parse(JSON.stringify(muestra)); window.__bd = bd; window.__canal = [];
    /* registros de la semana 45: SOP en curso (11 de 18), ENV por validar (10 de 10) */
    const reg = (id, mid, estado, extra) => ({ id, maquina_id: mid, anio: 2026, semana: 45, estado, tecnico_senior: '', maquinista: '', version: 1, actualizado_en: new Date(AHORA - 60000).toISOString(), ...extra });
    bd.registros = [reg('r-sop', 'm-SOP', 'EN_CURSO', { tecnico_senior: 'CESAR ALPELIMA', maquinista: 'ELISEO ARVI' }), reg('r-env', 'm-ENV', 'CERRADO', { tecnico_senior: 'JOSÉ BETANCOURT', cerrado_en: new Date(AHORA - 30 * 60000).toISOString() })];
    bd.regActs = [];
    const semanales = id => bd.actividades.filter(a => a.maquina_id === id && a.es_todo_el_anio);
    semanales('m-SOP').forEach((a, i) => bd.regActs.push({ id: 'ra-sop-' + i, registro_id: 'r-sop', item: i + 1, equipo: a.actividad.split(' / ')[0], actividad: a.actividad.split(' / ')[1] || '', frecuencia: a.frecuencia, realizado: i < 11, marcado_por: i < 11 ? 'CESAR ALPELIMA' : '', marcado_en: i < 11 ? new Date(AHORA - (12 - i) * 60000).toISOString() : null, version: 1 }));
    semanales('m-ENV').forEach((a, i) => bd.regActs.push({ id: 'ra-env-' + i, registro_id: 'r-env', item: i + 1, equipo: a.actividad.split(' / ')[0], actividad: a.actividad.split(' / ')[1] || '', frecuencia: a.frecuencia, realizado: true, marcado_por: 'JOSÉ BETANCOURT', marcado_en: new Date(AHORA - 40 * 60000).toISOString(), version: 1 }));
    const T = { mtto_maquinas: 'maquinas', mtto_plan_actividades: 'actividades', mtto_registros: 'registros', mtto_registro_actividades: 'regActs' };
    const consulta = nombre => {
      const q = { filtros: [], en: null, orden: null };
      const api = {
        select() { return api; }, order(c) { q.orden = c; return api; }, limit() { return api; }, eq(k, v) { q.filtros.push([k, v]); return api; }, in(k, vs) { q.en = [k, vs]; return api; },
        maybeSingle() { return Promise.resolve({ data: nombre === 'mtto_config' ? { id: 'config', datos: { inicioRegistros: { anio: 2026, semana: 1 } } } : null, error: null }); },
        then(res, rej) {
          if (nombre === 'mtto_config') return Promise.resolve({ data: null, error: null }).then(res, rej);
          let h = (bd[T[nombre]] || []).filter(r => q.filtros.every(([k, v]) => r[k] === v) && (!q.en || q.en[1].includes(r[q.en[0]])));
          if (q.orden) h = h.slice().sort((a, b) => (a[q.orden] || 0) - (b[q.orden] || 0));
          return Promise.resolve({ data: h.map(r => ({ ...r })), error: null }).then(res, rej);
        }
      };
      return api;
    };
    glacialMttoPlanDatos.usarCliente({ from: consulta, channel() { const ch = { on(_t, f, cb) { window.__canal.push({ tabla: f.table, cb }); return ch; }, subscribe(cb) { setTimeout(() => cb('SUBSCRIBED'), 10); return ch; } }; return ch; }, removeChannel() {} });
    goProgramaSemanalMtto();
  }, MUESTRA);
  await P.waitForSelector('.ps-t', { timeout: 8000 });
  const txt = s => P.evaluate(x => (document.querySelector(x) || {}).innerText || '', s);
  const filas = () => P.evaluate(() => [...document.querySelectorAll('.ps-t tbody tr:not(.ps-det)')].map(r => r.innerText.replace(/\s+/g, ' ').trim()));

  ok(/Semana 45/.test(await txt('.ps-sem h2')) && /actual/.test(await txt('.ps-sem h2')) && /Lunes 2 al domingo 8 de noviembre de 2026/.test(await txt('.ps-sem')), 'encabezado: Semana 45 actual · Lunes 2 al domingo 8 de noviembre de 2026');
  const f = await filas();
  ok(f.length === 2 && /SOPLADORA/.test(f[0]) && /ENVASADORA/.test(f[1]), 'una fila por máquina (las hojas CARB pendientes no entran)');
  ok(/18 semanales/.test(f[0]) && /11 \/ 18/.test(f[0]) && /EN CURSO/.test(f[0]) && /CESAR ALPELIMA/.test(f[0]) && /ELISEO ARVI/.test(f[0]), 'Sopladora: 18 semanales · 11 / 18 · EN CURSO · técnico y maquinista');
  ok(/10 semanales/.test(f[1]) && /POR VALIDAR/.test(f[1]) && /JOSÉ BETANCOURT/.test(f[1]), 'Envasadora: POR VALIDAR con su técnico');
  const t = await P.evaluate(() => [...document.querySelectorAll('.ps-card')].map(c => c.innerText.replace(/\s+/g, ' ')));
  ok(/28 en 2 máquinas/.test(t[0]) && /21 de 28/.test(t[1]) && /\b1\b/.test(t[2]) && /\b1\b/.test(t[3]), 'tarjetas: 28 actividades · 21 realizadas · 1 abierto · 1 por validar → ' + t.join(' | '));
  ok(/Cesar|CESAR/.test(await txt('.ps-vivo')) && /marcó/.test(await txt('.ps-vivo')) && /cerró el registro de ENVASADORA/.test(await txt('.ps-vivo')), 'panel «En vivo»: marcas y cierres');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/programa-semanal.png', fullPage: true });

  /* ver las actividades de la semana (reemplaza al botón BUSCAR) */
  await P.click('[data-ps-ver="m-SOP"]');
  ok(await P.evaluate(() => document.querySelectorAll('.ps-det li').length) === 18, '«Actividades»: lista las 18 actividades de esta semana de la Sopladora');
  await P.click('[data-ps-ver="m-SOP"]');

  /* tiempo real: un técnico marca otra actividad y la pantalla se actualiza sola */
  await P.evaluate(() => { const a = __bd.regActs.find(x => x.id === 'ra-sop-11'); Object.assign(a, { realizado: true, marcado_por: 'ELISEO ARVI', marcado_en: new Date(Date.parse('2026-11-07T09:30:00-05:00') - 1000).toISOString(), version: 2 }); __canal.filter(c => c.tabla === 'mtto_registro_actividades').forEach(c => c.cb({ eventType: 'UPDATE', new: { ...a } })); });
  await P.waitForFunction(() => /12 \/ 18/.test(document.querySelector('.ps-t').innerText), null, { timeout: 3000 });
  ok(/ELISEO ARVI/.test(await txt('.ps-vivo')) && /22 de 28/.test(await txt('.ps-cards')), 'tiempo real: la marca de otro dispositivo sube el avance a 12 / 18 y aparece en «En vivo»');

  /* navegar entre semanas */
  await P.click('[data-ps-mover="1"]');
  await P.waitForFunction(() => /Semana 46/.test(document.querySelector('.ps-sem h2').innerText), null, { timeout: 3000 });
  const f46 = await filas();
  ok(f46.length === 2 && f46.every(x => /PENDIENTE/.test(x) && /0 \//.test(x)), 'semana 46: sin registros, todo PENDIENTE y 0 hechas');
  ok(await P.evaluate(() => !!document.querySelector('[data-ps-hoy]')), '«Ir a esta semana» aparece al salir de la semana actual');
  await P.click('[data-ps-hoy]');
  await P.waitForFunction(() => /Semana 45/.test(document.querySelector('.ps-sem h2').innerText), null, { timeout: 3000 });
  /* la semana 48 trae las mensuales y semestrales del plan */
  for (let i = 0; i < 3; i++) await P.click('[data-ps-mover="1"]');
  await P.waitForFunction(() => /Semana 48/.test(document.querySelector('.ps-sem h2').innerText), null, { timeout: 3000 });
  ok(/\+ 3 mensuales/.test((await filas())[0]) || /3 mensuales/.test((await filas())[0]), 'semana 48: la Sopladora suma 3 mensuales y 2 semestrales → ' + (await filas())[0]);
  for (let i = 0; i < 3; i++) await P.click('[data-ps-mover="-1"]');

  /* pestañas */
  await P.click('[data-mt-tab="plan"]'); await P.waitForSelector('.mp-t');
  ok(await P.evaluate(() => !!document.querySelector('.mt-tab.on') && document.querySelector('.mt-tab.on').textContent === 'Plan anual'), 'pestaña «Plan anual» abre el plan');
  await P.click('[data-mt-tab="semanal"]'); await P.waitForSelector('.ps-t');
  ok(await P.evaluate(() => document.querySelector('.mt-tab.on').textContent === 'Programa semanal'), 'y vuelve al Programa semanal');

  /* los registros empiezan en la semana 46: antes no se pueden iniciar (config sin «inicioRegistros» = semana 46 de 2026) */
  await P.evaluate(() => { glacialMttoPlanDatos.cache.config = null; glacialMttoProgramaSemanal.UI.sem = { anio: 2026, semana: 45 }; glacialMttoProgramaSemanal.pintar(document.getElementById('main')); });
  ok(/Semana anterior al inicio de los registros/.test(await txt('.ps')) && /empiezan en la semana 46/.test(await txt('.ps')) && await P.evaluate(() => document.querySelector('[data-ps-mover="-1"]').disabled === true), 'semana 45: aviso «los registros empiezan en la semana 46» y la flecha ‹ ya no baja de la 46');
  await P.evaluate(() => { __bd.registros = []; __bd.regActs = []; glacialMttoPlanDatos.cache.registros = []; glacialMttoPlanDatos.cache.regActs = []; glacialMttoProgramaSemanal.pintar(document.getElementById('main')); });
  ok(await P.evaluate(() => !document.querySelector('[data-ps-abrir]')), 'semana 45 sin registro: no hay botón «Iniciar»');
  const err = await P.evaluate(async () => { try { await glacialMttoPlanDatos.iniciarRegistro(glacialMttoPlanDatos.cache.maquinas[0], 2026, 45, { fecha: '2026-11-07' }); return ''; } catch (e) { return e.message; } });
  ok(/empiezan en la semana 46/.test(err), 'y aunque se intente por otro camino, la capa de datos rechaza iniciar un registro de la semana 45 → ' + err.slice(0, 70));
  await P.evaluate(() => { glacialMttoProgramaSemanal.UI.sem = { anio: 2026, semana: 46 }; glacialMttoProgramaSemanal.pintar(document.getElementById('main')); });
  ok(!/Semana anterior al inicio/.test(await txt('.ps')) && await P.evaluate(() => document.querySelector('[data-ps-mover="-1"]').disabled === true && [...document.querySelectorAll('[data-ps-abrir]')].every(b => /Iniciar/.test(b.textContent)) && document.querySelectorAll('[data-ps-abrir]').length === 2), 'semana 46: sin aviso, ‹ deshabilitada y «Iniciar» en cada máquina');
  /* Producción: lectura */
  await P.evaluate(() => { state.user = { rol: 'Supervisor de Producción', nombre: 'Pedro', username: 'pedro', permisos: {} }; glacialMttoProgramaSemanal.pintar(document.getElementById('main')); });
  ok((await filas()).length === 2, 'un usuario de Producción también ve el programa (solo lectura)');
  await P.setViewportSize({ width: 390, height: 844 }); await P.waitForTimeout(150);
  ok(await P.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, 'celular: la página no se desborda de lado');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/programa-semanal-movil.png' });
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
