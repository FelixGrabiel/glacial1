/* Paletas · captura al minuto en un navegador de verdad (Chromium): barra «+1 Paleta (Ahora)», autoselección por la Secuencia del turno,
   Hora al minuto, corte de red (offline del navegador) y reintento sin duplicar. No forma parte de las pruebas rápidas.
   Uso: node tests/paletas-rapido.e2e.js        (GLX_CAPTURAS=/carpeta guarda capturas de pantalla)
   Usa un «db» falso en memoria para sync/paletas y sync/programaciones: no toca Supabase. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); } catch (e) { console.log('Falta playwright. Prueba omitida.'); process.exit(0); } }
const R = path.resolve(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
const STUB_SUPABASE = 'window.supabase={createClient(){return {auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}},rpc:async()=>({data:null,error:null}),from(){return {select:async()=>({data:[],error:null})};},channel(){return {on(){return this;},subscribe(){return this;}};},removeChannel(){}};}};';
let fallas = 0;
const ok = (c, m) => { console.log((c ? '✔ ' : '✘ FALLA ') + m); if (!c) fallas++; };

(async () => {
  const servidor = http.createServer((req, res) => {
    const archivo = path.join(R, decodeURIComponent(req.url.split('?')[0]));
    if (!archivo.startsWith(R) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); return res.end('no'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(archivo).pipe(res);
  });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const navegador = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') && fs.statSync('/opt/pw-browsers/chromium').isFile() ? '/opt/pw-browsers/chromium' : undefined });
  const ctx = await navegador.newContext({ viewport: { width: 1100, height: 1300 }, deviceScaleFactor: 1 });
  const P = await ctx.newPage();
  const errores = [];
  P.on('pageerror', e => errores.push('pageerror: ' + e.message));
  P.on('dialog', d => d.accept().catch(() => {}));
  await P.route('**/*', ruta => {
    const u = ruta.request().url();
    if (u.startsWith('http://127.0.0.1')) return ruta.continue();
    if (/supabase-js/.test(u)) return ruta.fulfill({ contentType: 'text/javascript', body: STUB_SUPABASE });
    if (/fonts\.googleapis|fonts\.gstatic/.test(u)) return ruta.fulfill({ contentType: 'text/css', body: '' });
    return ruta.abort();
  });
  await P.goto('http://127.0.0.1:' + servidor.address().port + '/index.html', { waitUntil: 'load' });

  await P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('report-select-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Administrador', nombre: 'Ana', username: 'admin', permisos: 'todos' }; state.showWelcome = false;
    const hoy = GlacialFecha.fechaOperativa(), turno = GlacialFecha.bloqueActual() === 'NOCHE' ? 'NOCHE' : 'DÍA';
    const prog = (clave, marca, tramos) => ({ clave, linea: 'PET1', fecha: hoy, turno, marca, presentacion: 'Pack_Regular_2.5Lx6und', cantidadProgramada: 32400, unidadesPorPaleta: 324, paletasProgramadas: 100, tramosSecuencia: tramos });
    const medianoche = '00:00', finDia = '23:59';
    window.__srv = { paletas: [{ id: 'pal_previo', linea: 'PET1', fecha: hoy, turno, marca: 'Bells', presentacion: 'Pack_Regular_2.5Lx6und', hora: '07:30', tipoPaleta: 'COMPLETA', paletas: 5, unidadesPorPaleta: 324, unidadesIncompleta: 0, totalUnidades: 1620, observaciones: '', usuario: 'Ana', creadoEn: Date.now() - 600000 }],
      programaciones: [prog(['PET1', hoy, turno, 'Scala', 'Pack_Regular_2.5Lx6und'].join('|'), 'Scala', [{ id: 't1', orden: 1, tipoFin: 'HORA', horaFin: medianoche }]),
                       prog(['PET1', hoy, turno, 'Bells', 'Pack_Regular_2.5Lx6und'].join('|'), 'Bells', [{ id: 't2', orden: 2, tipoFin: 'CIERRE' }])],
      escrituras: 0 };
    _paletasCache = JSON.parse(JSON.stringify(__srv.paletas)); _programacionesCache = JSON.parse(JSON.stringify(__srv.programaciones));
    /* db falso: respeta navigator.onLine (sin red = error de red, como el puente) */
    db.runTransaction = async fn => {
      if (!navigator.onLine) throw { red: true, message: 'sin red' };
      let nuevo = null, quien = null;
      const tx = { get: async ref => ({ exists: true, data: () => ({ items: JSON.parse(JSON.stringify(ref.id === 'paletas' ? __srv.paletas : __srv.programaciones)) }) }), set: (ref, d) => { nuevo = d.items; quien = ref.id; } };
      const r = await fn(tx);
      if (nuevo) { if (quien === 'paletas') { __srv.paletas = nuevo; __srv.escrituras++; } else __srv.programaciones = nuevo; }
      return r;
    };
    window.__ms = () => GlacialFecha.ahoraMs();
    state.currentLine = 'PET1'; state.currentTab = 'paletas'; renderSidebar(); renderMain();
  });
  await P.waitForSelector('#paleta-rapido', { timeout: 8000 });
  const txt = sel => P.evaluate(s => (document.querySelector(s) || {}).innerText || '', sel);
  const cap = async n => { if (process.env.GLX_CAPTURAS) await P.screenshot({ path: path.join(process.env.GLX_CAPTURAS, n + '.png'), fullPage: false }); };

  ok(await P.evaluate(() => !!document.getElementById('btn-paleta-mas1')), 'la pestaña Paletas muestra el botón «+1 Paleta (Ahora)»');
  /* secuencia: el tramo de Scala terminó a las 00:00 → vigente Bells (CIERRE) */
  ok(await P.evaluate(() => draftPaleta.marca) === 'Bells' && /Pack_Regular|2\.5/.test(await P.evaluate(() => draftPaleta.presentacion)), 'Marca y Presentación se autoseleccionan con el tramo vigente de la secuencia (Bells)');
  ok((await P.evaluate(() => document.querySelector('#paletas-form-panel select:nth-of-type(1)') && [...document.querySelectorAll('#paletas-form-panel .field-sm select')][1].value)) === 'Bells', 'el selector Marca muestra Bells');
  ok(await txt('#paleta-acumulado') === '5', 'acumulado actual visible = 5 (el registro confirmado)');
  const hAntes = await P.evaluate(() => document.getElementById('paleta-hora-input').value);
  ok(/^\d{2}:\d{2}$/.test(hAntes) && hAntes === await P.evaluate(() => { const l = GlacialFecha.ahoraLima(GlacialFecha.ahoraMs()); return String(l.hora).padStart(2, '0') + ':' + String(l.minuto).padStart(2, '0'); }), 'la Hora arranca en la hora actual de Lima (' + hAntes + ')');
  await cap('paletas-rapido-1-en-linea');

  /* +1 en línea */
  await P.click('#btn-paleta-mas1');
  await P.waitForFunction(() => document.getElementById('paleta-acumulado').innerText === '6', null, { timeout: 5000 });
  let srv = await P.evaluate(() => __srv.paletas);
  ok(srv.length === 2 && srv[1].paletas === 6 && !!srv[1].clientEventId && /^pal_/.test(srv[1].id) && !!srv[1].capturadoEn, '+1 en línea: se guardó el acumulado 6 con clientEventId y capturadoEn');
  ok(/En línea/.test(await txt('#paleta-sync-estado')) && /6 acumuladas/.test(await txt('#paleta-ultimo')), 'indicador «En línea» y «Último registro: 6 acumuladas…»');
  ok(await P.evaluate(() => document.getElementById('btn-paleta-mas1').disabled), 'el botón queda bloqueado un instante tras guardar (anti doble toque)');
  /* doble clic real rápido: un solo registro */
  await P.waitForTimeout(1400);
  await P.evaluate(() => { const b = document.getElementById('btn-paleta-mas1'); b.click(); b.click(); });
  await P.waitForFunction(() => document.getElementById('paleta-acumulado').innerText === '7', null, { timeout: 5000 });
  await P.waitForTimeout(300);
  ok((await P.evaluate(() => __srv.paletas.length)) === 3 && await txt('#paleta-acumulado') === '7', 'doble clic: se registró UNA paleta (acumulado 7, no 8)');

  /* corte de red */
  await ctx.setOffline(true);
  await P.waitForFunction(() => navigator.onLine === false);
  await P.waitForTimeout(1400);
  await P.click('#btn-paleta-mas1');
  await P.waitForTimeout(400);
  await P.waitForTimeout(1300);
  await P.click('#btn-paleta-mas1');
  await P.waitForTimeout(500);
  ok(await txt('#paleta-acumulado') === '9', 'sin red: el acumulado visible suma los pendientes (9)');
  ok(/2 pendientes por subir/.test(await txt('#paleta-sync-estado')), 'indicador: «' + await txt('#paleta-sync-estado') + '»');
  ok((await P.evaluate(() => __srv.paletas.length)) === 3 && (await P.evaluate(() => JSON.parse(localStorage.getItem('glacial_paletas_cola_v1')).eventos.length)) === 2, 'sin red: el servidor sigue con 3 y la cola local tiene 2 (persistidos en localStorage)');
  await cap('paletas-rapido-2-sin-red');

  /* recargar la página con la cola pendiente: no se pierde */
  const cola = await P.evaluate(() => localStorage.getItem('glacial_paletas_cola_v1'));
  ok(JSON.parse(cola).eventos.every(e => e.estado === 'pendiente' && /^[0-9a-f-]{36}$/.test(e.clientEventId)), 'la cola guardada trae clientEventId UUID y estado pendiente');

  /* vuelve la red → sube sola, en orden, sin duplicar */
  await ctx.setOffline(false);
  await P.waitForFunction(() => __srv.paletas.length === 5, null, { timeout: 15000 });
  await P.waitForTimeout(400);
  srv = await P.evaluate(() => __srv.paletas.map(p => p.paletas));
  ok(srv.join() === '5,6,7,8,9', 'al volver la red suben las 2 pendientes en orden: ' + srv.join());
  ok(/En línea/.test(await txt('#paleta-sync-estado')) && (await P.evaluate(() => JSON.parse(localStorage.getItem('glacial_paletas_cola_v1')).eventos.length)) === 0, 'la cola queda vacía y el indicador vuelve a «En línea»');
  /* reintento duplicado: reinyectar un evento ya subido no crea otra fila */
  const antes = await P.evaluate(() => __srv.paletas.length);
  const res = await P.evaluate(async () => { const ya = Object.assign({}, __srv.paletas[__srv.paletas.length - 1]); return await glacialPaletasRapido.enviarRegistro(ya); });
  ok(res === 'duplicado' && (await P.evaluate(() => __srv.paletas.length)) === antes, 'reenviar un evento ya guardado: «duplicado», sin fila nueva');
  const ids = await P.evaluate(() => __srv.paletas.map(p => p.id)); ok(new Set(ids).size === ids.length, 'ningún id repetido en el servidor');

  /* hora manual: si el usuario la edita, deja de sincronizarse */
  await P.evaluate(() => { const i = document.getElementById('paleta-hora-input'); i.value = '03:15'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  ok(await P.evaluate(() => draftPaleta.hora) === '03:15', 'la Hora editada a mano queda en el borrador');
  await P.waitForTimeout(100);
  ok(errores.length === 0, 'sin errores de JavaScript en la página' + (errores.length ? ': ' + errores.join(' | ') : ''));

  await navegador.close(); servidor.close();
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
