/* Paletas · CIERRE PROGRESIVO DE MARCAS Y CIERRE DE TURNO (16f-cierre-marcas.js) en Chromium. No forma parte de las pruebas rápidas.
   Uso: node tests/cierre-marcas.e2e.js        (GLX_CAPTURAS=/carpeta guarda capturas)
   «db» falso en memoria (paletas y programaciones) y un cliente de Supabase falso que aplica las MISMAS reglas que glacial_69
   (cerrar en orden, doble cierre, pendientes, faltan marcas, doble envío). No toca Supabase. */
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
    state.user = { rol: 'Supervisor', nombre: 'Leandro', username: 'leandro', permisos: ['paletas', 'nuevo', 'historial'] }; state.showWelcome = false;
    const hoy = GlacialFecha.fechaOperativa(), turno = GlacialFecha.bloqueActual() === 'NOCHE' ? 'NOCHE' : 'DÍA';
    window.__ctx = { hoy, turno };
    const P25 = 'Pack_Regular_2.5Lx6und';
    const prog = (marca, tramos) => ({ clave: ['PET1', hoy, turno, marca, P25].join('|'), linea: 'PET1', fecha: hoy, turno, marca, presentacion: P25, cantidadProgramada: 32400, unidadesPorPaleta: 324, paletasProgramadas: 100, tramosSecuencia: tramos });
    const pal = (id, marca, n, hora) => ({ id, linea: 'PET1', fecha: hoy, turno, marca, presentacion: P25, hora, tipoPaleta: 'COMPLETA', paletas: n, unidadesPorPaleta: 324, unidadesIncompleta: 0, totalUnidades: n * 324, creadoEn: Date.now() - 3600000 + n * 1000 });
    window.__srv = { paletas: [pal('p1', 'Scala', 7, '09:10'), pal('p2', 'Bells', 4, '11:20')],
      programaciones: [prog('Scala', [{ id: 't1', orden: 1, tipoFin: 'CANTIDAD', cantidadObjetivo: 999999 }, { id: 't3', orden: 3, tipoFin: 'CIERRE' }]), prog('Bells', [{ id: 't2', orden: 2, tipoFin: 'CANTIDAD', cantidadObjetivo: 999999 }])] };
    _paletasCache = JSON.parse(JSON.stringify(__srv.paletas)); _programacionesCache = JSON.parse(JSON.stringify(__srv.programaciones));
    db.runTransaction = async fn => { let nuevo = null, quien = null; const tx = { get: async ref => ({ exists: true, data: () => ({ items: JSON.parse(JSON.stringify(ref.id === 'paletas' ? __srv.paletas : __srv.programaciones)) }) }), set: (ref, d) => { nuevo = d.items; quien = ref.id; } }; const r = await fn(tx); if (nuevo) { if (quien === 'paletas') __srv.paletas = nuevo; else __srv.programaciones = nuevo; } return r; };
    /* Supabase falso con las reglas de glacial_69 */
    const BD = { tramos: [], cierre: null, llamadas: [] };
    window.__bd = BD;
    const err = (code, message) => ({ data: null, error: { code, message } });
    window.glacialSupabaseCliente = { rpc: async (n, a) => {
      BD.llamadas.push([n, JSON.parse(JSON.stringify(a))]);
      if (n === 'cierre_turno_listar') { await new Promise(r => setTimeout(r, 300)); return { data: { tramos: BD.tramos, cierre: BD.cierre }, error: null }; }   // la red real tarda: antes congelaba la página
      const cerrar = (p, quien) => {
        if (BD.cierre) return 'cierre: el turno ya se envió';
        const idx = p.secuencia.findIndex(x => x.tramo_id === p.tramo_id);
        if (idx < 0) return 'cierre: el tramo no está en la secuencia del turno';
        if (BD.tramos.some(t => t.tramo_id === p.tramo_id && t.estado === 'cerrado')) return 'dup';
        if (p.secuencia.slice(0, idx).some(x => !BD.tramos.some(t => t.tramo_id === x.tramo_id && t.estado === 'cerrado'))) return 'cierre: primero cierra la marca anterior de la secuencia';
        if (!(Number.isInteger(p.saldo_paquetes) && p.saldo_paquetes >= 0)) return 'cierre: saldo';
        BD.tramos.push({ tramo_id: p.tramo_id, orden: idx + 1, marca: p.secuencia[idx].marca, presentacion: p.secuencia[idx].presentacion, estado: 'cerrado', hora_corte: p.hora_corte, cerrado_en: new Date().toISOString(), paletas_acumuladas: p.paletas_acumuladas, paletas_tramo: p.paletas_tramo, saldo_paquetes: p.saldo_paquetes, cerrado_por: 'leandro' });
        return null;
      };
      if (n === 'cierre_tramo_cerrar') { const e = cerrar(a.p); if (e === 'dup') return err('23505', 'cierre: la marca ya está cerrada'); if (e) return err('23514', e); return { data: BD.tramos[BD.tramos.length - 1], error: null }; }
      if (n === 'cierre_turno_enviar') {
        const p = a.p;
        if (p.pendientes > 0) return err('23514', 'cierre: hay registros de paletas sin subir en el equipo');
        if (BD.cierre) return BD.cierre.client_event_id === p.client_event_id ? { data: BD.cierre, error: null } : err('23505', 'cierre: este turno ya se envió');
        const n2 = p.secuencia.length;
        if (p.secuencia.slice(0, -1).some(x => !BD.tramos.some(t => t.tramo_id === x.tramo_id && t.estado === 'cerrado'))) return err('23514', 'cierre: faltan marcas por cerrar antes de enviar');
        if (!BD.tramos.some(t => t.tramo_id === p.secuencia[n2 - 1].tramo_id)) { if (!p.ultimo) return err('23514', 'cierre: falta cerrar la última marca'); const e = cerrar(Object.assign({}, p.ultimo, { secuencia: p.secuencia, tramo_id: p.secuencia[n2 - 1].tramo_id })); if (e) return err('23514', e); }
        const res = BD.tramos.slice().sort((x, y) => x.orden - y.orden);
        BD.cierre = { linea: p.linea, fecha: p.fecha, turno: p.turno, closed_at: new Date().toISOString(), closed_by: 'leandro', resumen: res, total_paletas: res.reduce((s, t) => s + t.paletas_tramo, 0), total_saldo: res.reduce((s, t) => s + t.saldo_paquetes, 0), tramos: n2, observaciones: p.observaciones || null, sync_estado: 'sincronizado', client_event_id: p.client_event_id };
        return { data: BD.cierre, error: null };
      }
      return { data: null, error: null };
    } };
    state.currentLine = 'PET1'; state.currentTab = 'paletas'; renderSidebar(); renderMain();
  });
  await P.waitForSelector('#ct-panel', { timeout: 8000 });
  await P.waitForTimeout(500);
  const panel = () => P.evaluate(() => document.getElementById('ct-panel').innerText.replace(/\s+/g, ' '));
  const cap = async n => { if (process.env.GLX_CAPTURAS) await (await P.$('#ct-panel')).screenshot({ path: path.join(process.env.GLX_CAPTURAS, n + '.png') }); };
  let t = await panel();
  ok(/Cierre de turno/.test(t) && /0 de 3 marcas cerradas/.test(t) && /0 pendientes por subir/.test(t), 'franja: 0 pendientes por subir · 0 de 3 marcas cerradas');
  ok(await P.evaluate(() => [...document.querySelectorAll('.ct-t')].map(x => x.classList.contains('activo') ? 'A' : x.classList.contains('cerrado') ? 'C' : 'E').join('')) === 'AEE', 'Scala activa; Bells y Scala (retoma) en espera');
  ok(/Acumulado 7 paletas completas/.test(t), 'la tarjeta activa muestra el acumulado de Scala (7)');
  ok(await P.evaluate(() => document.querySelector('.ct-enviar').disabled) && /Falta cerrar: Scala, Bells/.test(t), '«Enviar cierre de turno» deshabilitado: faltan Scala y Bells');
  ok(await P.evaluate(() => draftPaleta.marca) === 'Scala', 'la captura de paletas apunta a Scala (marca activa)');
  await cap('cierre-1-inicio');
  // Cerrar Scala con saldo 12
  await P.fill('#ct-panel input[aria-label="Saldo en paquetes de Scala"]', '12');
  await P.click('#ct-panel .ct-t.activo .ct-btn');
  await P.waitForFunction(() => document.querySelectorAll('#ct-panel .ct-t.cerrado').length === 1, null, { timeout: 5000 });
  t = await panel();
  const ped = await P.evaluate(() => __bd.llamadas.find(x => x[0] === 'cierre_tramo_cerrar')[1].p);
  ok(ped.tramo_id === 't1' && ped.paletas_acumuladas === 7 && ped.paletas_tramo === 7 && ped.saldo_paquetes === 12 && /^\d{2}:\d{2}$/.test(ped.hora_corte) && /^[0-9a-f-]{36}$/.test(ped.client_event_id), 'Cerrar marca envía: hora de corte real, 7 paletas congeladas, saldo 12 y el evento del equipo');
  ok(/Cerrado ✓/.test(t) && /Saldo 12 paq/.test(t) && /1 de 3 marcas cerrada/.test(t) && /Scala cerrada ✓ · sigue Bells/.test(t), 'Scala queda «Cerrado ✓» con su saldo; la franja dice 1 de 3');
  ok(await P.evaluate(() => [...document.querySelectorAll('.ct-t')].map(x => x.classList.contains('activo') ? 'A' : x.classList.contains('cerrado') ? 'C' : 'E').join('')) === 'CAE' && await P.evaluate(() => draftPaleta.marca) === 'Bells', 'Bells pasa a activa y la captura de paletas cambia sola a Bells');
  // Cerrar Bells (saldo vacío = 0)
  await P.fill('#ct-panel input[aria-label="Saldo en paquetes de Bells"]', '');
  await P.click('#ct-panel .ct-t.activo .ct-btn');
  await P.waitForFunction(() => document.querySelectorAll('#ct-panel .ct-t.cerrado').length === 2, null, { timeout: 5000 });
  t = await panel();
  ok(/Todo listo para envío rápido/.test(t) && /2 de 3 marcas cerradas/.test(t) && await P.evaluate(() => !!document.querySelector('.ct-franja.ct-ok')), 'franja verde «Todo listo para envío rápido» con 2 de 3');
  ok(/se cierra con «Enviar cierre de turno»/.test(t) && /este tramo: 0/.test(t) && !(await P.evaluate(() => document.querySelector('.ct-enviar').disabled)), 'la última (Scala retoma) se cierra con el envío; «Enviar» habilitado');
  // con un registro sin subir: se bloquea
  await P.evaluate(() => { window.__pend = glacialPaletasCola.pendientes; glacialPaletasCola.pendientes = () => [{}]; glacialCierreMarcas.pintar(); });
  t = await panel();
  ok(/1 pendiente por subir/.test(t) && /Hay registros sin subir/.test(t) && await P.evaluate(() => document.querySelector('.ct-enviar').disabled), 'con 1 pendiente por subir: advertencia y envío deshabilitado');
  await P.evaluate(() => { glacialPaletasCola.pendientes = window.__pend; glacialCierreMarcas.pintar(); });
  await cap('cierre-2-listo');
  // Enviar con saldo 5 de la última y observaciones (Scala sube a 10 acumuladas → 3 en este tramo)
  await P.evaluate(() => { __srv.paletas.push({ id: 'p3', linea: 'PET1', fecha: __ctx.hoy, turno: __ctx.turno, marca: 'Scala', presentacion: 'Pack_Regular_2.5Lx6und', hora: '18:40', tipoPaleta: 'COMPLETA', paletas: 10, unidadesPorPaleta: 324, unidadesIncompleta: 0, totalUnidades: 3240, creadoEn: Date.now() }); _paletasCache = JSON.parse(JSON.stringify(__srv.paletas)); glacialCierreMarcas.pintar(); });
  await P.fill('#ct-panel input[aria-label="Saldo en paquetes de Scala"]', '5');
  await P.fill('#ct-panel textarea', 'Etiquetadora con calibración');
  await P.click('#ct-panel .ct-enviar');
  await P.waitForFunction(() => /Cierre de turno enviado/.test(document.getElementById('ct-panel').innerText), null, { timeout: 5000 });
  t = await panel();
  const env = await P.evaluate(() => __bd.llamadas.find(x => x[0] === 'cierre_turno_enviar')[1].p);
  ok(env.ultimo && env.ultimo.paletas_tramo === 3 && env.ultimo.saldo_paquetes === 5 && env.pendientes === 0 && env.observaciones === 'Etiquetadora con calibración' && env.secuencia.map(x => x.tramo_id).join() === 't1,t2,t3', 'el envío cierra la última (3 paletas, saldo 5) y manda observaciones y secuencia');
  ok(/Cierre enviado por leandro/.test(t) && /14 paletas · saldo 17 paq/.test(t) && /3 de 3 marcas cerradas/.test(t) && !(await P.evaluate(() => !!document.querySelector('#ct-panel .ct-enviar'))), 'consolidado: 14 paletas (7+4+3) y saldo 17 (12+0+5); ya no hay botones de envío');
  await cap('cierre-3-enviado');
  // celular
  await P.setViewportSize({ width: 390, height: 900 }); await P.waitForTimeout(200);
  ok(await P.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'celular: sin desborde lateral');
  ok(errores.length === 0, 'sin errores en la página' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await navegador.close(); servidor.close();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
