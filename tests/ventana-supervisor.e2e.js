/* Ventana de trabajo del supervisor, en la PÁGINA REAL y un navegador de verdad, sobre el servidor simulado (sin base de datos real).
   Cubre: cierre del modo TRABAJAR al terminar el turno (hora simulada), botón Trabajar bloqueado, Avance en solo consulta,
   panel del Administrador para dar más tiempo (y que el supervisor lo reciba en vivo), entrada anticipada sin cruzarse con la Noche,
   y el corte de las 19:00 (avance del supervisor intermedio en la NOCHE).
   Requiere Playwright:  node tests/ventana-supervisor.e2e.js   (no forma parte de las pruebas rápidas; tarda ~1 min). */
const http = require('http'), fs = require('fs'), path = require('path');
const { crearServidor } = require('./ayuda/servidor-simulado.js');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const R = path.resolve(__dirname, '..');
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

/* Doble de supabase-js que corre dentro de la página. */
const DOBLE = `
window.supabase = { createClient(url, key, opts){
  const almacen = opts.auth.storage, clave = opts.auth.storageKey;
  let sesion = null; try { sesion = JSON.parse(almacen.getItem(clave)); } catch (_) {}
  const oyentes = [], canales = [];
  window.__avisos = evs => evs.forEach(ev => canales.forEach(ch => ch.enlaces.forEach(x => { if (x.table === ev.tabla && x.filter === 'raiz=eq.' + ev.fila.raiz) x.cb({ new: ev.fila }); })));
  const guardar = () => { if (sesion) almacen.setItem(clave, JSON.stringify(sesion)); else almacen.removeItem(clave); };
  const avisar = ev => oyentes.forEach(cb => cb(ev, sesion));
  window.__llamadas = {};
  return {
    rpc: async (n, a) => { window.__llamadas[n] = (window.__llamadas[n] || 0) + 1; const r = await window.__srvRpc(sesion ? sesion.user.id : null, n, a); return r.err ? { data: null, error: r.err, status: 400 } : { data: r.ok, error: null, status: 200 }; },
    channel(){ const ch = { enlaces: [], on(tipo, f, cb){ ch.enlaces.push({ table: f.table, filter: f.filter, cb }); return ch; }, subscribe(cb){ canales.push(ch); setTimeout(() => cb('SUBSCRIBED'), 0); return ch; } }; return ch; },
    removeChannel(ch){ const i = canales.indexOf(ch); if (i >= 0) canales.splice(i, 1); },
    auth: {
      getSession: async () => ({ data: { session: sesion }, error: null }),
      onAuthStateChange(cb){ oyentes.push(cb); return { data: { subscription: { unsubscribe(){} } } }; },
      async signInWithPassword(c){ const r = await window.__srvAuth('entrar', c); if (r.error) return { data: { user: null, session: null }, error: r.error }; sesion = { access_token: 't', user: r.user }; guardar(); avisar('SIGNED_IN'); return { data: { user: sesion.user, session: sesion }, error: null }; },
      async updateUser(a){ const r = await window.__srvAuth('actualizar', { email: sesion.user.email, cambios: a }); if (r.error) return { data: {}, error: r.error }; sesion.user = r.user; guardar(); avisar('USER_UPDATED'); return { data: { user: r.user }, error: null }; },
      async signOut(){ sesion = null; guardar(); avisar('SIGNED_OUT'); return { error: null }; }
    },
    functions: { invoke: async (n, o) => { const r = await window.__srvFn(n, o.body); return r.error ? { data: null, error: { message: r.error, context: { json: async () => r } } } : { data: r, error: null }; } }
  };
} };`;

(async () => {
  const S = crearServidor();
  S.reloj = Date.now();   // el reloj del servidor simulado = hora real; la hora simulada (?simularHora) se aplica encima, como en producción
  const HOY = '2026-10-21', AYER = '2026-10-20', LUNES = '2026-10-19', DOMINGO = '2026-10-25';
  const UID = { admin: '11111111-1111-4111-8111-111111111111', sdia: '22222222-2222-4222-8222-222222222222', sint: '44444444-4444-4444-8444-444444444444', snoc: '55555555-5555-4555-8555-555555555555' };
  const PERM_SUP = ['nuevo', 'historial', 'paletas', 'programarPaletas', 'avanceProduccion', 'tareoProduccion', 'inicioOperativo', 'verLineasProduccion', 'todasLasLineas'];
  S.usuarios.set('admin@glacial.app', { id: UID.admin, clave: 'Admin#2026', meta: {} });
  S.usuarios.set('sdia@glacial.app', { id: UID.sdia, clave: 'Super#2026', meta: {} });
  S.usuarios.set('sint@glacial.app', { id: UID.sint, clave: 'Super#2026', meta: {} });
  S.usuarios.set('snoc@glacial.app', { id: UID.snoc, clave: 'Super#2026', meta: {} });
  const usuarios = [
    { username: 'admin', nombre: 'Administrador', password: '', rol: 'Administrador', permisos: 'todos', authUid: UID.admin, authEmail: 'admin@glacial.app' },
    { username: 'sdia', nombre: 'Sup Dia', password: '', rol: 'Supervisor', permisos: PERM_SUP, authUid: UID.sdia, authEmail: 'sdia@glacial.app' },
    { username: 'sint', nombre: 'Sup Intermedio', password: '', rol: 'Supervisor', permisos: PERM_SUP, authUid: UID.sint, authEmail: 'sint@glacial.app' },
    { username: 'snoc', nombre: 'Sup Noche', password: '', rol: 'Supervisor', permisos: PERM_SUP, authUid: UID.snoc, authEmail: 'snoc@glacial.app' }
  ];
  const sembrar = (c, d, datos, partes) => S.fs_commit(null, { p_ops: [Object.assign({ t: 'set', c, d, merge: false, datos }, partes ? { partes } : {})] });
  sembrar('sync', 'users', { updatedAt: 1 }, { items: { up: usuarios.map((u, i) => ({ id: u.username, pos: i + 1, datos: u })) } });
  sembrar('sync', 'accesos', { map: Object.fromEntries(usuarios.map(u => [u.username, u.authEmail])) });
  sembrar('sync', 'perfiles', { map: Object.fromEntries(usuarios.map(u => [u.authUid, { username: u.username, rol: u.rol, permisos: u.permisos }])) });
  /* Rotación PUBLICADA de la semana: Día 07–15, Intermedio 14–22, Noche 22–07 (la Noche también ayer). */
  const dias = Array.from({ length: 7 }, (_, i) => '2026-10-' + String(19 + i).padStart(2, '0'));
  const fila = (username, nombre, turno, inicio, fin) => ({ username, nombre, linea: '', dias: Object.fromEntries(dias.map(f => [f, { estado: turno, turno, inicio, fin }])) });
  const rot = { id: 'ROT-SUP-' + LUNES, tipo: 'SUPERVISORES', semana: 43, desde: LUNES, hasta: DOMINGO, estado: 'PUBLICADA', publicadaEn: 1, excepciones: [], auditoria: [],
    detalles: [fila('sdia', 'Sup Dia', 'DÍA', '07:00', '15:00'), fila('sint', 'Sup Intermedio', 'INTERMEDIO', '14:00', '22:00'), fila('snoc', 'Sup Noche', 'NOCHE', '22:00', '07:00')] };
  sembrar('sync', 'rotaciones', { updatedAt: 1 }, { items: { up: [{ id: rot.id, pos: 1, datos: rot }] } });

  const servidor = http.createServer((req, res) => {
    let ruta = decodeURIComponent(req.url.split('?')[0]); if (ruta.endsWith('/')) ruta += 'index.html';
    const archivo = path.join(R, ruta);
    if (!archivo.startsWith(R) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(archivo).pipe(res);
  });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + servidor.address().port + '/index.html';
  const navegador = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') && fs.statSync('/opt/pw-browsers/chromium').isFile() ? '/opt/pw-browsers/chromium' : undefined });

  async function abrir(nombre, consulta){
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 820 } });
    const page = await ctx.newPage();
    const D = { nombre, page, errores: [], avisos: [], fallidas: [] };
    page.on('pageerror', e => D.errores.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) D.errores.push('console: ' + m.text().slice(0, 300)); else if (m.type() === 'warning') D.avisos.push(m.text().slice(0, 200)); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    page.on('requestfailed', r => { if (!/fonts\.|cloudinary|script\.google/.test(r.url())) D.fallidas.push(r.url().slice(0, 140)); });
    page.on('response', r => { if (r.status() >= 400) D.fallidas.push(r.status() + ' ' + r.url().slice(0, 140)); });
    await page.route('**/*', ruta => {
      const u = ruta.request().url();
      if (u.startsWith('http://127.0.0.1')) return ruta.continue();
      if (/supabase-js/.test(u)) return ruta.fulfill({ contentType: 'text/javascript', body: DOBLE });
      if (/Chart\.js|chart\.umd/.test(u)) return ruta.fulfill({ contentType: 'text/javascript', body: 'window.Chart=class{constructor(c,o){this.data=(o||{}).data;this.options=(o||{}).options;}update(){}destroy(){}resize(){}static register(){}};const h={get:(o,k)=>k in o?o[k]:(o[k]=new Proxy({},h))};Chart.defaults=new Proxy({},h);' });
      if (/sheetjs|xlsx/.test(u)) return ruta.fulfill({ contentType: 'text/javascript', body: 'window.XLSX={utils:{}};' });
      if (/exceljs/.test(u)) return ruta.fulfill({ contentType: 'text/javascript', body: 'window.ExcelJS={};' });
      if (/\.css(\?|$)|fonts\.googleapis/.test(u)) return ruta.fulfill({ contentType: 'text/css', body: '' });
      return ruta.abort();
    });
    await page.exposeFunction('__srvRpc', (uid, n, a) => { try { return { ok: S[n](uid, a) }; } catch (e) { return { err: { code: e.code || 'P0001', message: e.message || String(e) } }; } });
    await page.exposeFunction('__srvAuth', (accion, p) => {
      if (accion === 'entrar') { const u = S.usuarios.get(p.email); if (!u || u.clave !== p.password) return { error: { message: 'Invalid login credentials', status: 400 } }; return { user: { id: u.id, email: p.email, user_metadata: u.meta } }; }
      const u = S.usuarios.get(p.email); if (p.cambios.password) u.clave = p.cambios.password; if (p.cambios.data) Object.assign(u.meta, p.cambios.data);
      return { user: { id: u.id, email: p.email, user_metadata: u.meta } };
    });
    await page.exposeFunction('__srvFn', (n, cuerpo) => {
      if (cuerpo.accion === 'crear') { if (S.usuarios.has(cuerpo.email)) return { error: 'ya existe', codigo: 'auth/email-already-in-use' }; const id = '33333333-3333-4333-8333-' + String(S.usuarios.size).padStart(12, '0'); S.usuarios.set(cuerpo.email, { id, clave: cuerpo.clave, meta: {} }); return { uid: id }; }
      if (cuerpo.accion === 'perfil') { for (const u of S.usuarios.values()) if (u.id === cuerpo.uid) u.meta.display_name = cuerpo.displayName; return { ok: true }; }
      return { error: 'acción desconocida' };
    });
    S.dispositivos.push({ _recibir: evs => { const docs = evs.filter(e => e.tabla === 'fs_docs'); if (docs.length) page.evaluate(x => window.__avisos && window.__avisos(x), docs).catch(() => {}); } });
    await page.goto(base + (consulta || ''), { waitUntil: 'load' });
    return D;
  }
  async function entrar(D, usuario, clave){
    await D.page.waitForSelector('#login-user', { state: 'visible', timeout: 15000 });
    await D.page.fill('#login-user', usuario); await D.page.fill('#login-pass', clave);
    await D.page.evaluate(() => handleLogin());
    await D.page.waitForFunction(() => typeof state !== 'undefined' && state.user && document.getElementById('login-screen') && getComputedStyle(document.getElementById('login-screen')).display === 'none', null, { timeout: 15000 }).catch(() => {});
    return D.page.evaluate(() => ({ usuario: typeof state !== 'undefined' && state.user ? state.user.username : null, error: (document.getElementById('login-error') || {}).textContent || '' }));
  }

  async function entrar(D, usuario, clave){
    await D.page.waitForSelector('#login-user', { state: 'visible', timeout: 15000 });
    await D.page.fill('#login-user', usuario); await D.page.fill('#login-pass', clave);
    await D.page.evaluate(() => handleLogin());
    await D.page.waitForFunction(() => typeof state !== 'undefined' && state.user && typeof _rotacionesReady !== 'undefined' && _rotacionesReady, null, { timeout: 15000 }).catch(() => {});
    await D.page.waitForTimeout(600);
    await D.page.evaluate(() => { const m = document.getElementById('modal-root'); if (m) m.innerHTML = ''; });
    await D.page.click('[aria-label="Abrir Reporte Agua"]', { timeout: 4000 }).catch(() => {});
    await D.page.waitForTimeout(400);
    return D.page.evaluate(() => typeof state !== 'undefined' && state.user ? state.user.username : null);
  }
  const sim = h => '?simularHora=' + h;
  const estado = D => D.page.evaluate(() => {
    const st = window.glacialVentanaSupervisor.estado();
    const btn = document.querySelector('#modo-switch .modo-btn[data-modo="trabajar"]');
    return { estado: st.estado, puede: st.puedeTrabajar, modo: state.workMode, btnBloqueado: !!(btn && btn.disabled),
      crono: (document.getElementById('cronometro-turno') || {}).textContent || '', modal: (document.getElementById('modal-root') || {}).textContent || '',
      avance: typeof avPuedeGenerar === 'function' ? avPuedeGenerar() : null };
  });
  const foto = (D, nombre) => process.env.FOTOS ? D.page.screenshot({ path: path.join(process.env.FOTOS, nombre + '.png') }) : null;
  const limpiar = D => D.page.evaluate(() => { const m = document.getElementById('modal-root'); if (m) m.innerHTML = ''; });

  /* 1) Supervisor de Día a las 10:00: trabaja con normalidad. */
  const A = await abrir('dia-10', sim(HOY + 'T10:00'));
  ok(await entrar(A, 'sdia', 'Super#2026') === 'sdia', 'Sup Día inicia sesión (hora simulada 10:00)');
  await A.page.evaluate(() => establecerModoTrabajo('trabajar'));
  let e = await estado(A);
  ok(e.estado === 'ABIERTA' && e.modo === 'trabajar' && !e.btnBloqueado, 'a las 10:00 puede usar TRABAJAR (estado ' + e.estado + ', modo ' + e.modo + ')');
  ok(/Turno Día/.test(e.crono) && /Cierre/.test(e.crono) && /15:00/.test(e.crono), 'el cronómetro muestra su turno y el cierre a las 15:00');
  ok(e.avance === true, 'en su turno puede generar avances');
  await foto(A, '1-turno-abierto');

  /* 2) A las 14:59:20 en TRABAJAR → al llegar las 15:00 pasa solo a VISUALIZAR con aviso. */
  const B = await abrir('dia-cierre', sim(HOY + 'T14:59:20'));
  await entrar(B, 'sdia', 'Super#2026');
  await B.page.evaluate(() => establecerModoTrabajo('trabajar'));
  e = await estado(B);
  ok(e.modo === 'trabajar' && /Por cerrar/.test(e.crono), 'a las 14:59 sigue en TRABAJAR con aviso «por cerrar»');
  await limpiar(B);
  await B.page.waitForFunction(() => state.workMode === 'visualizar', null, { timeout: 70000 }).catch(() => {});
  e = await estado(B);
  ok(e.modo === 'visualizar' && /Tu turno cerró/.test(e.modal), 'a las 15:00 pasa solo a VISUALIZAR y avisa «Tu turno cerró»');
  await foto(B, '2-turno-cerrado-aviso');
  ok(e.btnBloqueado && /Solo visualización/.test(e.crono), 'el botón Trabajar queda bloqueado y el cronómetro dice «Solo visualización»');
  ok(e.avance === false, 'fuera de turno no puede generar avances ni cierres');

  /* 3) Después del cierre no puede volver a TRABAJAR. */
  const C = await abrir('dia-1505', sim(HOY + 'T15:05'));
  await entrar(C, 'sdia', 'Super#2026');
  await C.page.evaluate(() => establecerModoTrabajo('trabajar'));
  e = await estado(C);
  ok(e.estado === 'CERRADA' && e.modo === 'visualizar' && e.btnBloqueado, 'a las 15:05 no se puede activar TRABAJAR (queda en VISUALIZAR)');
  await limpiar(C); await foto(C, '2b-cerrado-cronometro');

  /* 4) El Administrador le da 30 min desde «Rotación de supervisores»; el supervisor lo recibe en vivo. */
  const AD = await abrir('admin', sim(HOY + 'T15:05'));
  ok(await entrar(AD, 'admin', 'Admin#2026') === 'admin', 'el Administrador inicia sesión');
  await AD.page.evaluate(() => establecerModoTrabajo('visualizar', { silencioso: true }));
  await limpiar(AD);
  await AD.page.evaluate(() => goRotacionSupervisores());
  await AD.page.waitForTimeout(500);
  ok(await AD.page.evaluate(() => !!document.getElementById('amp-turno-panel') && /Sup Dia/.test(document.getElementById('amp-turno-panel').textContent)), 'el Administrador ve el panel «Tiempo de supervisores» con el Sup Día cerrado');
  await AD.page.evaluate(() => ampTurnoAbrir('sdia'));
  await AD.page.evaluate(() => ampTurnoConfirmar('sdia'));
  ok(await AD.page.evaluate(() => /Escribe el motivo/.test(document.getElementById('amp-turno-panel').textContent)), 'sin motivo no se guarda (pide el motivo)');
  await AD.page.fill('#amp-motivo', 'Cierre de paletas pendiente en PET1');
  await AD.page.evaluate(() => document.getElementById('amp-turno-panel').scrollIntoView());
  await foto(AD, '3a-formulario-admin');
  await AD.page.evaluate(() => ampTurnoConfirmar('sdia'));
  await AD.page.waitForTimeout(800);
  const doc = [...S.docs.values()].find(r => r.coleccion === 'ampliacionesTurno' && !r.eliminado_en);
  await foto(AD, '3-panel-admin');
  ok(!!doc && doc.datos.minutos === 30 && doc.datos.turno === 'DÍA' && doc.datos.fechaOperativa === HOY && doc.datos.creadoUid === UID.admin, 'se guarda la ampliación (30 min, Día ' + HOY + ', con el uid del Administrador)');
  await C.page.waitForFunction(() => window.glacialVentanaSupervisor.estado().puedeTrabajar === true, null, { timeout: 10000 }).catch(() => {});
  await limpiar(C);
  await C.page.evaluate(() => establecerModoTrabajo('trabajar'));
  e = await estado(C);
  await foto(C, '4-tiempo-extra');
  ok(e.puede && e.modo === 'trabajar' && e.estado === 'AMPLIADA' && /del admin/.test(e.crono), 'el supervisor recibe el tiempo en vivo: vuelve a TRABAJAR (estado ' + e.estado + ')');

  /* 5) Entrada anticipada: Sup Día a las 06:50 trabaja en SU turno, no en la Noche que sigue en curso. */
  const D = await abrir('dia-0650', sim(HOY + 'T06:50'));
  await entrar(D, 'sdia', 'Super#2026');
  await D.page.evaluate(() => establecerModoTrabajo('trabajar'));
  e = await estado(D);
  ok(e.estado === 'ANTICIPADA' && e.modo === 'trabajar', 'a las 06:50 entra en anticipada (TRABAJAR permitido)');
  const nuevo = await D.page.evaluate(() => { const r = blankRecord('PET1'); return { turno: r.turno, fecha: r.fecha }; });
  ok(nuevo.turno === 'DÍA' && nuevo.fecha === HOY, 'su reporte nuevo nace como DÍA ' + HOY + ' (no como la Noche de ayer): ' + JSON.stringify(nuevo));
  const N = await abrir('noche-0650', sim(HOY + 'T06:50'));
  await entrar(N, 'snoc', 'Super#2026');
  const nuevoN = await N.page.evaluate(() => { const r = blankRecord('PET1'); return { turno: r.turno, fecha: r.fecha }; });
  ok(nuevoN.turno === 'NOCHE' && nuevoN.fecha === AYER, 'a la misma hora, el de Noche sigue en la Noche de ayer: ' + JSON.stringify(nuevoN));
  const N2 = await abrir('noche-0725', sim(HOY + 'T07:25'));
  await entrar(N2, 'snoc', 'Super#2026');
  await N2.page.evaluate(() => establecerModoTrabajo('trabajar'));
  e = await estado(N2);
  ok(e.estado === 'TOLERANCIA' && e.modo === 'trabajar', 'Sup Noche a las 07:25: tolerancia, todavía TRABAJAR');

  /* 6) Corte de las 19:00: el Administrador aplica la configuración aprobada desde hoy; a las 20:00 el avance del intermedio va a la NOCHE. */
  await AD.page.evaluate(async () => { await window.glacialHorarios.aplicarConfiguracionAprobada('2026-10-21', 'Corte 19:00 dispuesto por Gerencia'); });
  const I = await abrir('inter-2000', sim(HOY + 'T20:00'));
  await entrar(I, 'sint', 'Super#2026');
  await I.page.waitForFunction(() => window.glacialHorarios && window.glacialHorarios.datos().reglas.length >= 3, null, { timeout: 10000 }).catch(() => {});
  const ctx = await I.page.evaluate(() => { const c = avCtx(); const r = blankRecord('PET1'); return { turno: c.turno, fecha: c.fecha, inicio: c.inicio, reg: r.turno, regFecha: r.fecha }; });
  ok(ctx.turno === 'NOCHE' && ctx.fecha === HOY && ctx.inicio === '19:00', 'corte 19:00: a las 20:00 el Avance del supervisor intermedio es NOCHE ' + HOY + ' (' + JSON.stringify(ctx) + ')');
  ok(ctx.reg === 'NOCHE' && ctx.regFecha === HOY, 'corte 19:00: su reporte nuevo de PET1 nace como NOCHE');
  const I2 = await abrir('inter-1830', sim(HOY + 'T18:30'));
  await entrar(I2, 'sint', 'Super#2026');
  await I2.page.waitForFunction(() => window.glacialHorarios && window.glacialHorarios.datos().reglas.length >= 3, null, { timeout: 10000 }).catch(() => {});
  ok(await I2.page.evaluate(() => avCtx().turno) === 'DÍA', 'a las 18:30 el Avance del intermedio sigue en el bloque Día');

  for (const X of [A, B, C, AD, D, N, N2, I, I2]) {
    const errs = X.errores.filter(t => !/favicon|ResizeObserver/.test(t));
    ok(errs.length === 0, 'sin errores de JavaScript en «' + X.nombre + '»' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  }
  await navegador.close(); servidor.close();
  console.log(fallas ? '\n' + fallas + ' con fallas' : '\nTodo correcto');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error('ERROR EN LA PRUEBA', e); process.exit(1); });
