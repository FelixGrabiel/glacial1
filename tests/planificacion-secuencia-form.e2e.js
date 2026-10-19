/* Planificación · «Nueva programación» con «Hasta una hora» y el mismo producto repetido, en un navegador de verdad.
   Uso: GLX_LIBS=/ruta node tests/planificacion-secuencia-form.e2e.js   (no forma parte de las pruebas rápidas) */
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
    window.__bd = { items: [] };
    db.runTransaction = async fn => { const tx = { get: async () => ({ exists: true, data: () => window.__bd }), set: (r, d) => { if (d && d.items) { window.__bd = d; _programacionesCache = d.items; } } }; return await fn(tx); };
    _programacionesCache = []; _programacionesReady = true;
    glacialVelocidadEstandar = () => 1200;
    goPlanificacion();
  });
  await D.page.waitForSelector('#plan-root .plan-tab');
  const abrir = async (linea) => { await D.page.evaluate(l => { const b = document.querySelector('[data-plan-nueva="' + l + '"]'); if (b) b.click(); }, linea); await D.page.waitForSelector('#pe-guardar'); };
  const linea = await D.page.evaluate(() => glacialPlanificacion.lineas()[0].key);
  /* línea vacía: se usa el botón + Agregar de la primera línea */
  await abrir(linea);
  const modos = await D.page.evaluate(() => [...document.querySelectorAll('.pm-modos label')].map(l => l.textContent.replace(/ ✓$/, '').trim()));
  ok(JSON.stringify(modos) === JSON.stringify(['Cantidad fija', 'Completar cantidad', 'Resto del turno', 'Hasta una hora']), 'el selector ofrece 4 opciones: ' + modos.join(' · '));
  const f1 = await D.page.evaluate(() => ({ marca: glacialPlanificacion.marcas(document.getElementById('pe-linea').value), pres: glacialPlanificacion.presentaciones(document.getElementById('pe-linea').value).map(p => p.value) }));
  await D.page.selectOption('#pe-marca', f1.marca[0]); await D.page.selectOption('#pe-pres', f1.pres[0]);
  await D.page.fill('#pe-cant', '1200'); await D.page.fill('#pe-upp', '1200');
  await D.page.click('#pe-guardar'); await D.page.waitForSelector('#pe-guardar', { state: 'detached', timeout: 5000 });
  /* segundo producto: hasta una hora */
  await abrir(linea);
  await D.page.click('.pm-modos label:has(input[value="HORA"])');
  ok(await D.page.evaluate(() => document.getElementById('pm-hora').offsetParent !== null && document.getElementById('pe-guardar').textContent === 'Agregar a la secuencia'), '«Hasta una hora» muestra la hora y el botón «Agregar a la secuencia»');
  await D.page.selectOption('#pe-marca', f1.marca[1]); await D.page.selectOption('#pe-pres', f1.pres[0]);
  await D.page.fill('#pm-hora', '04:00');
  await D.page.click('#pe-guardar'); await D.page.waitForSelector('#pe-guardar', { state: 'detached', timeout: 8000 });
  const r = await D.page.evaluate(() => window.__bd.items.map(p => ({ m: p.marca, modo: p.modo, c: p.cantidadProgramada, t: (p.tramosSecuencia || []).map(x => x.tipoFin + ':' + (x.orden)).join() })));
  ok(r.length === 2 && r[1].modo === 'HORA' && r[1].t === 'HORA:2', 'el segundo producto queda como paso 2 «hasta una hora»: ' + JSON.stringify(r));
  /* tercero: el MISMO producto que el primero, resto del turno (vía secuencia) */
  await D.page.evaluate(([l, m, p]) => { const NS = glacialPlanificacion; const filas = NS.secuencia.filasDe(l, NS.estado.fecha, NS.estado.turno).map(f => Object.assign({}, f)); filas.push({ id: 'x1', marca: m, presentacion: p, tipoFin: 'CIERRE', cantidad: '', hora: '', cambioPrevioMin: null, modo: 'FIJA', saldo: false, version: undefined, itemClave: '', upp: 0 }); window.__p = NS.secuencia.guardar(l, NS.estado.fecha, NS.estado.turno, filas, {}).then(() => 'ok', e => e.message); }, [linea, f1.marca[0], f1.pres[0]]);
  const res = await D.page.evaluate(() => window.__p);
  const fin = await D.page.evaluate(() => window.__bd.items.map(p => p.marca + ' ' + p.cantidadProgramada + ' pasos=' + (p.tramosSecuencia || []).length));
  ok(res === 'ok' && fin.length === 2 && /pasos=2/.test(fin[0]), 'el primer producto se repite como «resto del turno»: ' + res + ' → ' + fin.join(' | '));
  await D.page.evaluate(() => glacialPlanificacion.repintar()); await D.page.waitForTimeout(500);
  const vista = await D.page.evaluate(() => (document.getElementById('plan-root') || {}).innerText || '');
  ok(/1\. Bells[\s\S]*2\. Scala[\s\S]*3\. Bells/.test(vista), 'la pantalla muestra los 3 pasos en orden');
  if (process.env.GLX_CAPTURAS) await D.page.screenshot({ path: process.env.GLX_CAPTURAS + '/secuencia-repetida.png', fullPage: true });
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
