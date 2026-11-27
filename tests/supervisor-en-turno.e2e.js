/* Supervisor en turno en navegador real: pregunta al entrar al turno (Agua / Hielo), barra con SOLO los nombres en Agua y en Hielo.
   Uso: GLX_LIBS=/ruta node tests/supervisor-en-turno.e2e.js (no forma parte de las pruebas rápidas). */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0; const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1100, 900); const P = D.page;
  await P.evaluate(() => {
    // Firestore y sesión simulados (un solo documento compartido)
    const docs = {}, oyentes = [];
    const notificar = () => oyentes.forEach(f => f());
    const ref = id => ({ id, onSnapshot(cb) { const f = () => cb({ exists: id in docs, data: () => JSON.parse(JSON.stringify(docs[id])) }); oyentes.push(f); setTimeout(f, 0); return () => {}; }, __id: id });
    Object.assign(db, { collection: () => ({ doc: ref }), async runTransaction(fn) { await fn({ async get(r) { return { exists: r.__id in docs, data: () => JSON.parse(JSON.stringify(docs[r.__id])) }; }, set(r, d) { docs[r.__id] = d; } }); notificar(); } });
    window.__docs = docs;
    firebase.auth = () => ({ currentUser: { uid: 'u1' } });
    firebase.firestore = firebase.firestore || function () {}; firebase.firestore.FieldValue = { serverTimestamp: () => ({ __ts: 1 }) };
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Supervisor', nombre: 'Ana Pérez', username: 'ana', permisos: [] }; state.showWelcome = false;
  });
  const barra = async () => P.evaluate(() => { const b = document.getElementById('sup-turno-barra'); return b && !b.hidden ? b.innerText.replace(/\s+/g, ' ').trim() : ''; });
  await P.waitForFunction(() => document.getElementById('sup-turno-barra'), { timeout: 5000 });
  await P.evaluate(() => glacialSupervisorTurno.preguntar());
  ok(await P.evaluate(() => !!document.getElementById('sup-modal') && /Agua/.test(document.getElementById('sup-modal').innerText) && /Hielo/.test(document.getElementById('sup-modal').innerText) && /PET1, PET2, B7L, Cajas 20L y B20L/.test(document.getElementById('sup-modal').innerText)), 'la pregunta ofrece Agua (PET1, PET2, B7L, Cajas 20L y B20L) y Hielo');
  await P.evaluate(() => glacialSupervisorTurno.elegir('HIELO')); await P.waitForTimeout(300);
  ok(await P.evaluate(() => !document.getElementById('sup-modal')), 'al elegir, se cierra la pregunta');
  await P.evaluate(() => { glacialSupervisorTurno.estado().doc = Object.values(window.__docs)[0]; glacialSupervisorTurno.estado().listo = true; glacialSupervisorTurno.pintar(); });
  let t = await barra(); ok(/Hielo Ana Pérez/i.test(t) && /Agua sin indicar/i.test(t) && !/@|rol|Supervisor Ana/.test(t.replace('Supervisor en turno', '')), 'la barra de Agua muestra solo el nombre en Hielo y «sin indicar» en Agua: ' + t);
  // otro supervisor en Agua
  await P.evaluate(() => { const d = Object.values(window.__docs)[0]; d.supervisores.u2 = { uid: 'u2', nombre: 'Luis Rojas', area: 'AGUA', turno: 'DÍA', desdeMs: Date.now() - 60000 }; glacialSupervisorTurno.estado().doc = d; glacialSupervisorTurno.pintar(); });
  t = await barra(); ok(/Agua Luis Rojas/i.test(t) && /Hielo Ana Pérez/i.test(t), 'se ven los dos: Agua → Luis Rojas, Hielo → Ana Pérez');
  // cambiar de área reemplaza la entrada propia (no duplica)
  await P.evaluate(() => glacialSupervisorTurno.elegir('AGUA')); await P.waitForTimeout(300);
  await P.evaluate(() => { glacialSupervisorTurno.estado().doc = Object.values(window.__docs)[0]; glacialSupervisorTurno.pintar(); });
  t = await barra(); ok(/Agua Luis Rojas, Ana Pérez/i.test(t) && /Hielo sin indicar/i.test(t), 'al cambiar de área su nombre pasa a Agua y deja Hielo: ' + t);
  ok(await P.evaluate(() => { const d = Object.values(window.__docs)[0]; return Object.keys(d.supervisores).length === 2 && d.version === 2 && d.tipo === 'SUPERVISORES'; }), 'una entrada por supervisor y la versión sube de uno en uno');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/supervisor-agua.png' });
  // en el módulo de Hielo también se ve
  await P.evaluate(() => goReporteHielo()); await P.waitForSelector('.hl-app', { timeout: 6000 });
  await P.evaluate(() => { glacialSupervisorTurno.pintar(); });
  ok(await P.evaluate(() => { const b = document.querySelector('#hielo-screen .sup-barra'); return !!b && !b.hidden && /Agua Luis Rojas, Ana Pérez/i.test(b.innerText.replace(/\s+/g, ' ')); }), 'el módulo de Hielo muestra la misma barra con los nombres');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/supervisor-hielo.png' });
  await H.cerrar();
  console.log(fallas ? fallas + ' falla(s)' : 'Todo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
