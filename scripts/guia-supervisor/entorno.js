/* GLACIAL · ENTORNO DE DEMOSTRACIÓN para la guía del supervisor (12/11/2026)
   La página REAL (index.html) con la base de datos simulada de las pruebas (tests/ayuda/servidor-simulado.js):
   NO toca ninguna base real. Siembra datos de prueba y abre un navegador con un supervisor ficticio.
   Lo usan scripts/guia-supervisor/capturar.js (capturas y videos). */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { crearServidor } = require('../../tests/ayuda/servidor-simulado.js');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const R = path.resolve(__dirname, '..', '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const LIBS = process.env.GLX_LIBS;
const lib = f => { try { return fs.readFileSync(path.join(LIBS, 'node_modules', f), 'utf8'); } catch (_) { return ''; } };

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

const UID_SUP = '22222222-2222-4222-8222-222222222222', UID_ADM = '11111111-1111-4111-8111-111111111111';
const PERMISOS_SUP = ['nuevo', 'historial', 'paletas', 'programarPaletas', 'avanceProduccion', 'tareoProduccion', 'inicioOperativo', 'verLineasProduccion', 'todasLasLineas'];

async function crearEntorno(opc){
  opc = opc || {};
  const S = crearServidor();
  S.reloj = Date.now();
  S.usuarios.set('admin@glacial.app', { id: UID_ADM, clave: 'Admin#2026', meta: {} });
  S.usuarios.set('ana.supervisora@glacial.app', { id: UID_SUP, clave: 'Demo#2026', meta: { display_name: 'Ana Supervisora' } });
  const usuarios = [
    { username: 'admin', nombre: 'Administrador', password: '', rol: 'Administrador', permisos: 'todos', authUid: UID_ADM, authEmail: 'admin@glacial.app' },
    { username: 'ana', nombre: 'Ana Supervisora', password: '', rol: 'Supervisor', permisos: PERMISOS_SUP, linea: 'PET1', authUid: UID_SUP, authEmail: 'ana.supervisora@glacial.app' }
  ];
  const sembrar = (d, datos, partes) => S.fs_commit(null, { p_ops: [Object.assign({ t: 'set', c: 'sync', d, merge: false, datos }, partes ? { partes } : {})] });
  const lista = (d, items) => sembrar(d, { updatedAt: 1 }, { items: { up: items.map((x, i) => ({ id: String(x.id || x.username), pos: i + 1, datos: x })) } });
  lista('users', usuarios);
  sembrar('accesos', { map: { admin: 'admin@glacial.app', ana: 'ana.supervisora@glacial.app' } });
  sembrar('perfiles', { map: { [UID_ADM]: { username: 'admin', rol: 'Administrador', permisos: 'todos' }, [UID_SUP]: { username: 'ana', rol: 'Supervisor', permisos: PERMISOS_SUP } } });
  if (typeof opc.sembrar === 'function') opc.sembrar({ S, sembrar, lista });

  const servidor = http.createServer((req, res) => {
    let ruta = decodeURIComponent(req.url.split('?')[0]); if (ruta.endsWith('/')) ruta += 'index.html';
    const archivo = path.join(R, ruta);
    if (!archivo.startsWith(R) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(archivo).pipe(res);
  });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + servidor.address().port + '/index.html';
  const navegador = await chromium.launch();

  async function abrir(o){
    o = o || {};
    const ctxOpc = { viewport: o.viewport || { width: 1366, height: 820 }, deviceScaleFactor: o.escala || 1, locale: 'es-PE', timezoneId: 'America/Lima' };
    if (o.movil) Object.assign(ctxOpc, { isMobile: true, hasTouch: true });
    if (o.video) ctxOpc.recordVideo = { dir: o.video, size: ctxOpc.viewport };
    const ctx = await navegador.newContext(ctxOpc);
    const page = await ctx.newPage();
    const D = { page, ctx, errores: [] };
    page.on('pageerror', e => D.errores.push(e.message));
    page.on('dialog', d => d.accept().catch(() => {}));
    await page.route('**/*', ruta => {
      const u = ruta.request().url();
      if (u.startsWith('http://127.0.0.1')) return ruta.continue();
      if (/supabase-js/.test(u)) return ruta.fulfill({ contentType: 'text/javascript', body: DOBLE });
      if (/apexcharts/.test(u) && LIBS) return ruta.fulfill({ contentType: 'text/javascript', body: lib('apexcharts/dist/apexcharts.min.js') });
      if (/echarts/.test(u) && LIBS) return ruta.fulfill({ contentType: 'text/javascript', body: lib('echarts/dist/echarts.min.js') });
      if (/canvas-gauges/.test(u) && LIBS) return ruta.fulfill({ contentType: 'text/javascript', body: lib('canvas-gauges/gauge.min.js') });
      if (/sheetjs|xlsx/.test(u)) return ruta.fulfill({ contentType: 'text/javascript', body: 'window.XLSX={utils:{}};' });
      if (/exceljs/.test(u)) return ruta.fulfill({ contentType: 'text/javascript', body: 'window.ExcelJS={};' });
      if (/fonts\.googleapis/.test(u)) return ruta.fulfill({ contentType: 'text/css', body: '' });
      return ruta.abort();
    });
    await page.exposeFunction('__srvRpc', (uid, n, a) => { try { return { ok: S[n](uid, a) }; } catch (e) { return { err: { code: e.code || 'P0001', message: e.message || String(e) } }; } });
    await page.exposeFunction('__srvAuth', (accion, p) => {
      if (accion === 'entrar') { const u = S.usuarios.get(p.email); if (!u || u.clave !== p.password) return { error: { message: 'Invalid login credentials', status: 400 } }; return { user: { id: u.id, email: p.email, user_metadata: u.meta } }; }
      const u = S.usuarios.get(p.email); if (p.cambios.password) u.clave = p.cambios.password; if (p.cambios.data) Object.assign(u.meta, p.cambios.data);
      return { user: { id: u.id, email: p.email, user_metadata: u.meta } };
    });
    await page.exposeFunction('__srvFn', () => ({ error: 'no disponible en la demostración' }));
    S.dispositivos.push({ _recibir: evs => { const docs = evs.filter(e => e.tabla === 'fs_docs'); if (docs.length) page.evaluate(x => window.__avisos && window.__avisos(x), docs).catch(() => {}); } });
    await page.goto(base, { waitUntil: 'load' });
    return D;
  }
  async function entrar(D, usuario, clave, lento){
    const p = D.page;
    await p.waitForSelector('#login-user', { state: 'visible', timeout: 15000 });
    if (lento) { await p.click('#login-user'); await p.type('#login-user', usuario, { delay: 90 }); await p.click('#login-pass'); await p.type('#login-pass', clave, { delay: 70 }); }
    else { await p.fill('#login-user', usuario); await p.fill('#login-pass', clave); }
    await p.evaluate(() => handleLogin());
    await p.waitForFunction(() => typeof state !== 'undefined' && state.user && getComputedStyle(document.getElementById('login-screen')).display === 'none', null, { timeout: 15000 }).catch(() => {});
  }
  return { S, base, navegador, abrir, entrar, cerrar: async () => { await navegador.close(); servidor.close(); } };
}
module.exports = { crearEntorno, PERMISOS_SUP };
