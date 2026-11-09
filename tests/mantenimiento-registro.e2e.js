/* Mantenimiento · Registro CFA-CA-F-023 en un navegador de verdad (cliente de Supabase simulado con escritura). Uso: GLX_LIBS=/ruta node tests/mantenimiento-registro.e2e.js
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
    window.confirm = () => true;
    state.user = { rol: 'Administrador', nombre: 'Cristian Meza', username: 'cmeza', permisos: 'todos' }; state.showWelcome = false;
    const bd = JSON.parse(JSON.stringify(muestra)); Object.assign(bd, { registros: [], regActs: [], piezas: [] }); window.__bd = bd; window.__canal = []; window.__n = 0;
    const T = { mtto_maquinas: 'maquinas', mtto_plan_actividades: 'actividades', mtto_registros: 'registros', mtto_registro_actividades: 'regActs', mtto_registro_piezas: 'piezas' };
    const consulta = nombre => {
      const q = { op: 'select', filtros: [], en: null, orden: null, fila: null, conf: null };
      const tabla = () => bd[T[nombre]];
      const ejecutar = () => {
        if (nombre === 'mtto_config') return { data: null, error: null };
        const t = tabla();
        let hit = t.filter(r => q.filtros.every(([k, v]) => r[k] === v) && (!q.en || q.en[1].includes(r[q.en[0]])));
        if (q.op === 'select') { if (q.orden) hit = hit.slice().sort((a, b) => (a[q.orden] || 0) - (b[q.orden] || 0)); return { data: hit.map(r => ({ ...r })), error: null }; }
        if (q.op === 'update') { hit.forEach(r => Object.assign(r, q.fila, { version: (r.version || 1) + 1 })); return { data: hit.map(r => ({ ...r })), error: null }; }
        if (q.op === 'insert' || q.op === 'upsert') {
          const filas = (Array.isArray(q.fila) ? q.fila : [q.fila]).map(f => ({ id: 'n' + (++window.__n), version: 1, estado: 'PENDIENTE', tipo_mtto: 'PREVENTIVO', condicion: 'INTERNO', hora_inicio_prog: '07:00:00', hora_fin_prog: '16:00:00', horas_prog: 8, observacion: '', realizado: false, informe_final: 'Se han realizado las actividades mencionadas en la tabla superior cumpliendo con lo programado. Máquina en condiciones normales de operación.', tecnico_senior: '', maquinista: '', actualizado_en: new Date().toISOString(), ...f }));
          const out = [];
          for (const f of filas) {
            if (nombre === 'mtto_registros' && t.some(r => r.maquina_id === f.maquina_id && r.anio === f.anio && r.semana === f.semana)) return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
            if (q.op === 'upsert') { const ex = t.find(r => r.registro_id === f.registro_id && r.orden === f.orden); if (ex) { Object.assign(ex, { descripcion: f.descripcion, version: ex.version + 1 }); out.push({ ...ex }); continue; } }
            t.push(f); out.push({ ...f });
          }
          return { data: out, error: null };
        }
      };
      const api = {
        select() { return api; }, order(c) { q.orden = c; return api; }, limit() { return api; }, eq(k, v) { q.filtros.push([k, v]); return api; }, in(k, v) { q.en = [k, v]; return api; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        insert(f) { q.op = 'insert'; q.fila = f; return api; }, update(f) { q.op = 'update'; q.fila = f; return api; }, upsert(f) { q.op = 'upsert'; q.fila = f; return api; },
        then(res, rej) { return Promise.resolve(ejecutar()).then(res, rej); }
      };
      return api;
    };
    glacialMttoPlanDatos.usarCliente({ from: consulta, channel() { const ch = { on(_t, f, cb) { window.__canal.push({ tabla: f.table, cb }); return ch; }, subscribe(cb) { setTimeout(() => cb('SUBSCRIBED'), 10); return ch; } }; return ch; }, removeChannel() {} });
    goProgramaSemanalMtto();
  }, MUESTRA);
  await P.waitForSelector('.ps-t');
  const txt = s => P.evaluate(x => (document.querySelector(x) || {}).innerText || '', s);

  /* iniciar */
  ok(await P.evaluate(() => /Iniciar/.test(document.querySelector('[data-ps-abrir="m-SOP"]').textContent)), 'el Programa semanal ofrece «Iniciar» en la Sopladora');
  await P.click('[data-ps-abrir="m-SOP"]'); await P.waitForSelector('#rg-raiz');
  ok(/Registro de mantenimiento/.test(await txt('.rg-cab')) && /CFA-CA-F-023 · SOPLADORA · PET/.test(await txt('.rg-cab')), 'cabecera: «Registro de mantenimiento · CFA-CA-F-023 · SOPLADORA · PET»');
  ok(/0 de 18 realizadas/.test(await txt('#rg-prog-txt')) && await P.evaluate(() => document.querySelectorAll('.rg-act').length) === 18, 'el registro trae las 18 actividades del plan de esa semana');
  const d = await P.evaluate(() => { const r = __bd.registros[0]; return { fecha: r.fecha, prox: r.proxima_revision, sem: r.semana, est: r.estado, acts: __bd.regActs.filter(a => a.registro_id === r.id).map(a => a.item + ':' + a.equipo).slice(0, 2) }; });
  ok(d.fecha === '2026-11-07' && d.prox === '2026-11-14' && d.sem === 45 && d.est === 'PENDIENTE', 'fecha de hoy, próxima revisión +7 días (14/11), semana 45, PENDIENTE → ' + JSON.stringify(d));
  ok(/SEM_45/.test(await txt('.rg-datos')) && /07:00 – 16:00/.test(await txt('.rg-datos')), 'muestra SEM_45 y el tiempo programado 07:00 – 16:00');
  ok(await P.evaluate(() => [...document.querySelectorAll('.rg-chk')].every(b => b.getBoundingClientRect().width >= 44 && b.getBoundingClientRect().height >= 44)), 'las casillas miden al menos 44 px');
  ok(await P.evaluate(() => document.querySelectorAll('.rg-insumos li').length) === 4 && /Grasa Multipropósito Sanitaria/.test(await txt('.rg-insumos')), '4 insumos químicos fijos de solo lectura');

  /* marcar: se guarda al instante y el registro pasa a EN CURSO */
  await P.click('[data-rg-marcar]');
  await P.waitForFunction(() => /1 de 18/.test(document.getElementById('rg-prog-txt').textContent), null, { timeout: 3000 });
  await P.waitForFunction(() => __bd.registros[0].estado === 'EN_CURSO', null, { timeout: 3000 });
  const m = await P.evaluate(() => ({ est: __bd.registros[0].estado, ini: __bd.registros[0].hora_inicio_real, a: __bd.regActs[0].realizado, por: __bd.regActs[0].marcado_por }));
  ok(m.est === 'EN_CURSO' && !!m.ini && m.a === true && m.por === 'Cristian Meza', 'marcar la primera: se guarda, el registro pasa a EN_CURSO con hora real de inicio, y queda quién la marcó');
  ok(/Guardado/.test(await txt('#rg-guardado')), 'indicador «Guardado»');
  /* observación, tipo, condición, pieza, técnico */
  await P.click('[data-rg-obs-abrir]'); await P.fill('[data-rg-obs]', 'filtro con saturación alta'); await P.click('[data-rg-campo="tipo_mtto"][data-rg-valor="CORRECTIVO"]');
  await P.click('[data-rg-campo="condicion"][data-rg-valor="EXTERNO"]');
  await P.fill('[data-rg-pieza="1"]', "O-ring tobera Nº 3"); await P.fill('[data-rg-input="tecnico_senior"]', 'CESAR ALPELIMA'); await P.click('.rg-informe');
  await P.waitForFunction(() => __bd.regActs[0].observacion === 'filtro con saturación alta' && __bd.registros[0].tipo_mtto === 'CORRECTIVO' && __bd.registros[0].condicion === 'EXTERNO' && __bd.piezas.length === 1 && __bd.registros[0].tecnico_senior === 'CESAR ALPELIMA', null, { timeout: 4000 });
  ok(true, 'observación, tipo (Correctivo), condición (Externo), pieza «O-ring tobera Nº 3» y técnico se guardan');
  ok(await P.evaluate(() => document.querySelector('[data-rg-campo="tipo_mtto"][data-rg-valor="CORRECTIVO"]').classList.contains('on')), 'el botón elegido queda marcado');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/registro-escritorio.png', fullPage: true });

  /* vista de impresión: el formato CFA-CA-F-023 de esta máquina y semana */
  await P.click('[data-rg-imprimir]'); await P.waitForSelector('iframe[aria-hidden="true"]', { state: 'attached' });
  const doc = await P.evaluate(() => document.querySelector('iframe[aria-hidden="true"]').srcdoc);
  ok(/CFA - CA - F - 023/.test(doc) && /<u>SEM_45<\/u>/.test(doc) && /CESAR ALPELIMA/.test(doc) && /O-ring tobera Nº 3/.test(doc) && /Correctivo<\/td><td><span class="raya">x/.test(doc) && /Externo <span class="raya">x/.test(doc), 'Vista de impresión: arma el formato con los datos guardados (técnico, pieza, Correctivo y Externo)');
  await P.evaluate(() => document.querySelector('iframe[aria-hidden="true"]').remove());
  /* otro dispositivo marca una actividad: aparece solo */
  await P.evaluate(() => { const a = __bd.regActs[1]; Object.assign(a, { realizado: true, marcado_por: 'ELISEO ARVI', marcado_en: new Date().toISOString(), version: 2 }); __canal.filter(c => c.tabla === 'mtto_registro_actividades').forEach(c => c.cb({ eventType: 'UPDATE', new: { ...a } })); });
  await P.waitForFunction(() => /2 de 18/.test(document.getElementById('rg-prog-txt').textContent), null, { timeout: 3000 });
  ok(true, 'tiempo real: lo que marca otro dispositivo aparece sin recargar (2 de 18)');

  /* cerrar y firmar */
  await P.click('[data-rg-cerrar]');
  await P.waitForFunction(() => __bd.registros[0].estado === 'CERRADO', null, { timeout: 3000 });
  ok(await P.evaluate(() => !!__bd.registros[0].hora_fin_real) && /POR VALIDAR/.test(await txt('.rg-prog-t')) && await P.evaluate(() => document.querySelector('.rg-chk').disabled), 'cerrado: queda POR VALIDAR, con hora real de fin, y las casillas se bloquean');
  ok(await P.evaluate(() => !!document.querySelector('[data-rg-validar]') && !!document.querySelector('[data-rg-reabrir]')), 'el supervisor ve «Validar» y «Reabrir»');
  /* un técnico (cuenta compartida con PIN) no puede validar ni reabrir */
  await P.evaluate(() => { state.user = { rol: 'mantenimiento_compartido', nombre: 'Mantenimiento', username: 'mant', permisos: {} }; window.mantTecnicoActivo = () => ({ workerId: 't1', nombre: 'CESAR ALPELIMA' }); glacialMttoRegistroPantalla.pintar(document.getElementById('main')); });
  ok(await P.evaluate(() => !document.querySelector('[data-rg-validar]') && !document.querySelector('[data-rg-reabrir]') && !document.querySelector('[data-rg-cerrar]')), 'un técnico no ve «Validar», «Reabrir» ni «Cerrar» en un registro ya cerrado');
  await P.evaluate(() => { state.user = { rol: 'Administrador', nombre: 'Cristian Meza', username: 'cmeza', permisos: 'todos' }; glacialMttoRegistroPantalla.pintar(document.getElementById('main')); });
  await P.click('[data-rg-validar]');
  await P.waitForFunction(() => __bd.registros[0].estado === 'VALIDADO', null, { timeout: 3000 });
  ok(/VALIDADO/.test(await txt('.rg-prog-t')) && /Registro validado por/.test(await txt('.rg')), 'validado por el supervisor');
  await P.click('[data-rg-reabrir]');
  await P.waitForFunction(() => __bd.registros[0].estado === 'EN_CURSO', null, { timeout: 3000 });
  ok(await P.evaluate(() => !document.querySelector('.rg-chk').disabled), 'el supervisor puede reabrir y el técnico vuelve a poder marcar');

  /* más de 22 actividades: aviso (semana 13 de la Sopladora trae 25) */
  await P.click('[data-rg-volver]'); await P.waitForSelector('.ps-t');
  for (let i = 0; i < 32; i++) await P.click('[data-ps-mover="-1"]');
  await P.waitForFunction(() => /Semana 13/.test(document.querySelector('.ps-sem h2').innerText), null, { timeout: 5000 });
  await P.click('[data-ps-abrir="m-SOP"]'); await P.waitForSelector('#rg-raiz');
  ok(/\d+ de 2[3-9] realizadas/.test(await txt('#rg-prog-txt')) && /solo muestra las primeras 22 actividades/.test(await txt('.rg')), 'más de 22 actividades: «El formato impreso solo muestra las primeras 22 actividades»');

  /* celular */
  await P.setViewportSize({ width: 390, height: 844 }); await P.waitForTimeout(200);
  ok(await P.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, 'celular: la página no se desborda de lado');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/registro-movil.png' });
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
