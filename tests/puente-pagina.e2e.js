/* Prueba de la PÁGINA REAL sobre el puente Supabase, en un navegador de verdad y sin tocar ninguna base de datos:
   la librería de Supabase se sustituye por un doble que habla con el servidor simulado (tests/ayuda/servidor-simulado.js).
   Abre dos «dispositivos», inicia sesión en ambos, recorre el menú y comprueba que lo guardado en uno se ve en el otro.
   Requiere Playwright:  node tests/puente-pagina.e2e.js   (no forma parte de las pruebas rápidas). */
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
  /* Datos mínimos: un Administrador y un Supervisor con cuenta. */
  S.usuarios.set('admin@glacial.app', { id: '11111111-1111-4111-8111-111111111111', clave: 'Admin#2026', meta: {} });
  S.usuarios.set('sup1@glacial.app', { id: '22222222-2222-4222-8222-222222222222', clave: 'Super#2026', meta: {} });
  const usuarios = [
    { username: 'admin', nombre: 'Administrador', password: '', rol: 'Administrador', permisos: 'todos', authUid: '11111111-1111-4111-8111-111111111111', authEmail: 'admin@glacial.app' },
    { username: 'sup1', nombre: 'Supervisor Uno', password: '', rol: 'Supervisor', permisos: ['nuevo', 'historial', 'paletas', 'programarPaletas', 'avanceProduccion', 'tareoProduccion', 'inicioOperativo', 'verLineasProduccion', 'todasLasLineas'], authUid: '22222222-2222-4222-8222-222222222222', authEmail: 'sup1@glacial.app' }
  ];
  const sembrar = (d, datos, partes) => S.fs_commit(null, { p_ops: [Object.assign({ t: 'set', c: 'sync', d, merge: false, datos }, partes ? { partes } : {})] });
  sembrar('users', { updatedAt: 1 }, { items: { up: usuarios.map((u, i) => ({ id: u.username, pos: i + 1, datos: u })) } });
  sembrar('accesos', { map: { admin: 'admin@glacial.app', sup1: 'sup1@glacial.app' } });
  sembrar('perfiles', { map: { '11111111-1111-4111-8111-111111111111': { username: 'admin', rol: 'Administrador', permisos: 'todos' }, '22222222-2222-4222-8222-222222222222': { username: 'sup1', rol: 'Supervisor', permisos: usuarios[1].permisos } } });

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

  async function abrir(nombre){
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
    await page.goto(base, { waitUntil: 'load' });
    return D;
  }
  async function entrar(D, usuario, clave){
    await D.page.waitForSelector('#login-user', { state: 'visible', timeout: 15000 });
    await D.page.fill('#login-user', usuario); await D.page.fill('#login-pass', clave);
    await D.page.evaluate(() => handleLogin());
    await D.page.waitForFunction(() => typeof state !== 'undefined' && state.user && document.getElementById('login-screen') && getComputedStyle(document.getElementById('login-screen')).display === 'none', null, { timeout: 15000 }).catch(() => {});
    return D.page.evaluate(() => ({ usuario: typeof state !== 'undefined' && state.user ? state.user.username : null, error: (document.getElementById('login-error') || {}).textContent || '' }));
  }

  const A = await abrir('A'), B = await abrir('B');
  ok(await A.page.evaluate(() => typeof firebase === 'object' && firebase.SDK_VERSION === 'puente-supabase-1' && typeof db.collection === 'function' && typeof ENTORNO === 'string'), 'La página carga con el puente en lugar de Firebase (entorno ' + await A.page.evaluate(() => ENTORNO) + ')');
  ok(await A.page.evaluate(() => ![...document.scripts].some(s => /firebasejs|gstatic\.com\/firebase/.test(s.src))), 'La página ya no carga ningún archivo de Firebase');
  const mala = await entrar(A, 'admin', 'incorrecta');
  ok(mala.usuario === null, 'Una contraseña incorrecta no entra' + (mala.error ? ' («' + mala.error.trim().slice(0, 80) + '»)' : ''));
  const ra = await entrar(A, 'admin', 'Admin#2026');
  ok(ra.usuario === 'admin', 'El Administrador inicia sesión en el dispositivo A' + (ra.error ? ' — ' + ra.error : ''));
  const rb = await entrar(B, 'sup1', 'Super#2026');
  ok(rb.usuario === 'sup1', 'El Supervisor inicia sesión en el dispositivo B' + (rb.error ? ' — ' + rb.error : ''));
  await A.page.waitForTimeout(1500);
  if (process.env.DEPURAR) { await A.page.screenshot({ path: process.env.DEPURAR + '/a.png' }); console.log(await A.page.evaluate(() => ({ n: document.querySelectorAll('#glacial-sidebar button').length, ids: [...document.querySelectorAll('aside,nav')].map(x => x.id + '.' + x.className).slice(0, 8), muestra: [...document.querySelectorAll('#glacial-sidebar button')].slice(0, 6).map(b => b.outerHTML.slice(0, 160)) }))); }

  /* Recorrer el menú lateral en ambos dispositivos. */
  for (const D of [A, B]) {
    const antes = D.errores.length;
    await D.page.waitForSelector('.modo-modal-card', { timeout: 5000 }).catch(() => {});
    await D.page.evaluate(() => { if (typeof establecerModoTrabajo === 'function') establecerModoTrabajo('trabajar'); });
    await D.page.waitForTimeout(400);
    await D.page.click('[aria-label="Abrir Reporte Agua"]', { timeout: 4000 }).catch(() => {});
    await D.page.waitForTimeout(800);
    if (process.env.DEPURAR) await D.page.screenshot({ path: process.env.DEPURAR + '/' + D.nombre + '-app.png' });
    const n = await D.page.evaluate(async () => {
      const visitados = new Set(); let k = 0;
      for (let vuelta = 0; vuelta < 80; vuelta++) {
        const botones = [...document.querySelectorAll('#glacial-sidebar button')].filter(b => !b.disabled && b.getClientRects().length > 0 && !/cerrar sesi|salir/i.test(b.textContent));
        const b = botones.find(x => !visitados.has(x.textContent.trim()));
        if (!b) break;
        visitados.add(b.textContent.trim());
        try { b.click(); k++; } catch (_) {}
        await new Promise(r => setTimeout(r, 150));
        const m = document.getElementById('modal-root'); if (m) m.innerHTML = '';
      }
      window.__visitados = [...visitados];
      return k;
    });
    await D.page.waitForTimeout(600);
    if (process.env.DEPURAR) { await D.page.screenshot({ path: process.env.DEPURAR + '/' + D.nombre + '-fin.png' }); console.log('   visitado: ' + (await D.page.evaluate(() => window.__visitados)).join(' · ').replace(/\s+/g, ' ').slice(0, 900)); }
    ok(D.errores.length === antes, 'Dispositivo ' + D.nombre + ': se recorren ' + n + ' opciones del menú sin errores' + (D.errores.length > antes ? '\n     ' + D.errores.slice(antes, antes + 8).join('\n     ') : ''));
  }

  /* Guardar con las funciones de la propia página y verlo en el otro dispositivo, en vivo. */
  const guardado = await B.page.evaluate(async () => {
    const lista = (typeof loadPaletas === 'function' ? loadPaletas() : []).slice();
    lista.push({ id: 'PAL-E2E-1', linea: 'PET1', fecha: '2026-10-11', turno: 'DÍA', cajas: 120, creadoPor: 'sup1' });
    await savePaletas(lista);
    return lista.length;
  }).catch(e => 'ERROR ' + e.message);
  await A.page.waitForFunction(() => typeof loadPaletas === 'function' && loadPaletas().some(p => p.id === 'PAL-E2E-1'), null, { timeout: 6000 }).catch(() => {});
  ok(guardado === 1 && await A.page.evaluate(() => loadPaletas().some(p => p.id === 'PAL-E2E-1')), 'Una paleta registrada por el Supervisor (savePaletas) aparece sola en la pantalla del Administrador');
  ok(S.items.size >= 3 && S.docs.get('sync\u0000paletas').partes.join() === 'items', 'En el servidor la paleta es una fila propia, no un documento gigante');
  const usuariosAntes = await B.page.evaluate(() => loadUsers().length);
  await A.page.evaluate(async () => { const l = loadUsers().slice(); l.push({ username: 'nuevo1', nombre: 'Persona Nueva', rol: 'Supervisor', permisos: [], password: '' }); await saveUsers(l); });
  await B.page.waitForFunction(n => loadUsers().length === n + 1, usuariosAntes, { timeout: 6000 }).catch(() => {});
  ok(await B.page.evaluate(() => loadUsers().some(u => u.username === 'nuevo1')), 'Un usuario creado por el Administrador aparece en vivo en el otro dispositivo');
  const denegado = await B.page.evaluate(async () => { try { await db.collection('sync').doc('perfiles').set({ map: {} }); return 'guardó'; } catch (e) { return e.code; } });
  ok(denegado === 'guardó' || denegado === 'permission-denied', 'Guardado directo de prueba responde (' + denegado + ') — las reglas reales se prueban en la base de datos');

  /* Recargar la pestaña conserva la sesión; cerrar sesión la termina. */
  await B.page.reload({ waitUntil: 'load' });
  await B.page.waitForFunction(() => typeof state !== 'undefined' && state.user, null, { timeout: 15000 }).catch(() => {});
  ok(await B.page.evaluate(() => !!(state.user && state.user.username === 'sup1')), 'Al recargar la pestaña la sesión continúa');
  await B.page.waitForFunction(() => typeof loadPaletas === 'function' && loadPaletas().some(p => p.id === 'PAL-E2E-1'), null, { timeout: 8000 }).catch(() => {});
  ok(await B.page.evaluate(() => loadPaletas().some(p => p.id === 'PAL-E2E-1')), 'Tras recargar, los datos vuelven a cargarse');
  await B.page.evaluate(() => handleLogout());
  await B.page.waitForTimeout(800);
  ok(await B.page.evaluate(() => auth.currentUser === null), 'Cerrar sesión termina la sesión');

  for (const D of [A, B]) { if (D.fallidas.length) console.log('  (recursos no cargados en ' + D.nombre + ': ' + [...new Set(D.fallidas)].join(' | ') + ')'); }
  for (const D of [A, B]) ok(!D.avisos.some(a => /no se pudo instalar/i.test(a)), 'Dispositivo ' + D.nombre + ': los bloqueos de «Modo visualización» y «Ver como» quedaron instalados');
  ok(await A.page.evaluate(() => firebase.firestore.__vista === true && db instanceof firebase.firestore.Firestore), 'La página reconoce la base de datos como la de siempre (clases y prototipos)');
  for (const D of [A, B]) ok(D.errores.length === 0, 'Dispositivo ' + D.nombre + ': sin errores en la consola' + (D.errores.length ? '\n     ' + [...new Set(D.errores)].slice(0, 12).join('\n     ') : ''));
  if (process.env.DEPURAR) for (const D of [A, B]) console.log('  avisos ' + D.nombre + ': ' + [...new Set(D.avisos)].slice(0, 15).join('\n     '));
  console.log('Llamadas del dispositivo A al servidor: ' + JSON.stringify(await A.page.evaluate(() => window.__llamadas)));
  await navegador.close(); servidor.close();
  console.log(fallas ? '\n✘ ' + fallas + ' falla(s)' : '\n✔ Página sobre el puente: todo correcto');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error('ERROR EN LA PRUEBA', e); process.exit(1); });
