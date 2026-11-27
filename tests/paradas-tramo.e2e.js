/* PARADAS POR MARCA (16g + 16f + 29) en Chromium, con DOS EQUIPOS A LA VEZ: el celular del supervisor (390 px) y la PC de jefatura (1280 px).
   Uso: node tests/paradas-tramo.e2e.js        (GLX_CAPTURAS=/carpeta guarda capturas). No forma parte de las pruebas rápidas.
   Un «servidor» común en node (exposeFunction) hace de Supabase (glacial_69 + glacial_70) y de sync/avancesTurno; cada cambio se avisa al OTRO
   equipo como lo hace el tiempo real (canal postgres_changes y escucha de avancesTurno). Datos del pedido: PET1 · 26/11/2026 · DÍA ·
   SCALA 625 → BELLS 2.5 L → SCALA 625, con la hora del equipo fija a las 13:10 (zona America/Lima). No toca Supabase. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); } catch (e) { console.log('Falta playwright. Prueba omitida.'); process.exit(0); } }
const R = path.resolve(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
const STUB_SUPABASE = 'window.supabase={createClient(){return {auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}},rpc:async()=>({data:null,error:null}),from(){return {select:async()=>({data:[],error:null})};},channel(){return {on(){return this;},subscribe(){return this;}};},removeChannel(){}};}};';
let fallas = 0;
const ok = (c, m) => { console.log((c ? '✔ ' : '✘ FALLA ') + m); if (!c) fallas++; };
const F = '2026-11-26', T = 'DÍA', S625 = 'Pack_Regular_625mlx15und', B25 = 'Pack_Regular_2.5Lx6und';

/* ---------- servidor común (glacial_69 + glacial_70 + sync/avancesTurno) ---------- */
const SRV = {
  tramos: [{ tramo_id: 't1', orden: 1, marca: 'SCALA', presentacion: S625, estado: 'cerrado', hora_corte: '10:40', paletas_acumuladas: 14, paletas_tramo: 14, saldo_paquetes: 20, cerrado_por: 'jperez' }],
  cierre: null, paradasTramo: new Map(), eventos: new Set(), llamadas: [],
  av: { updatedAt: 1000, paradasOperativas: [] }
};
const par = (id, h, min, tipo, desc, x) => Object.assign({ id, linea: 'PET1', fecha: F, turno: T, horaInicio: h, horaFin: '', minutos: min, tipo, descripcion: desc, origen: 'AVANCE', causa: tipo === 'NO_PROGRAMADA' ? 'Mecánica' : '' }, x || {});
SRV.av.paradasOperativas = [par('a1', '08:15', 18, 'NO_PROGRAMADA', 'Falla sopladora'), par('a2', '09:30', 10, 'PROGRAMADA', 'Limpieza de llenadora'),
  par('a3', '10:40', 35, 'PROGRAMADA', 'Cambio de formato'), par('a4', '11:50', 12, 'NO_PROGRAMADA', 'Atasco etiquetadora'),
  par('a5', '12:30', 30, 'PROGRAMADA', 'Refrigerio'), par('a6', '', 8, 'NO_PROGRAMADA', 'Falta de preformas')];
const equipos = [];
async function avisarOtros(origen, que){
  for (const e of equipos) if (e !== origen) await e.page.evaluate(q => window.__tiempoReal && window.__tiempoReal(q), que).catch(() => {});
}
function rpc(n, a){
  SRV.llamadas.push([n, JSON.parse(JSON.stringify(a || {}))]);
  const p = a && a.p, err = (code, message) => ({ data: null, error: { code, message } });
  if (n === 'cierre_turno_listar') return { data: { tramos: SRV.tramos, cierre: SRV.cierre }, error: null };
  if (n === 'cierre_tramo_cerrar') {
    if (!p.paradas_revisadas) return err('23514', 'cierre: marca «Revisé las paradas de esta marca» antes de cerrarla');
    const idx = p.secuencia.findIndex(x => x.tramo_id === p.tramo_id);
    if (SRV.tramos.some(t => t.tramo_id === p.tramo_id)) return err('23505', 'cierre: la marca ya está cerrada');
    if (p.secuencia.slice(0, idx).some(x => !SRV.tramos.some(t => t.tramo_id === x.tramo_id))) return err('23514', 'cierre: primero cierra la marca anterior de la secuencia');
    const fila = { tramo_id: p.tramo_id, orden: idx + 1, marca: p.secuencia[idx].marca, presentacion: p.secuencia[idx].presentacion, estado: 'cerrado', hora_corte: p.hora_corte,
      paletas_acumuladas: p.paletas_acumuladas, paletas_tramo: p.paletas_tramo, saldo_paquetes: p.saldo_paquetes, cerrado_por: 'leandro', paradas_revisadas: true, ratio: p.resumen && p.resumen.ratio };
    SRV.tramos.push(fila); return { data: fila, error: null, cambio: true };
  }
  if (n === 'parada_tramo_asignar') {
    if (SRV.eventos.has(p.client_event_id)) return { data: SRV.paradasTramo.get(p.parada_id), error: null };
    SRV.eventos.add(p.client_event_id); SRV.paradasTramo.set(p.parada_id, p); return { data: p, error: null, cambio: true };
  }
  if (n === 'parada_tramo_partir') {
    if (p.partes.reduce((s, x) => s + x.minutos, 0) !== p.minutos) return err('23514', 'paradas: las partes no suman');
    p.partes.forEach((x, k) => SRV.paradasTramo.set(p.parada_id + '#' + (k + 1), Object.assign({}, x, { parada_padre_id: p.parada_id })));
    return { data: p.partes, error: null, cambio: true };
  }
  if (n === 'cierre_turno_enviar') {
    if (p.paradas_pendientes > 0) return err('23514', 'cierre: hay paradas sin marca');
    return { data: null, error: { code: '23514', message: 'no usado en esta prueba' } };
  }
  return { data: null, error: null };
}

(async () => {
  const servidor = http.createServer((req, res) => {
    const archivo = path.join(R, decodeURIComponent(req.url.split('?')[0]));
    if (!archivo.startsWith(R) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); return res.end('no'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(archivo).pipe(res);
  });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const navegador = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') && fs.statSync('/opt/pw-browsers/chromium').isFile() ? '/opt/pw-browsers/chromium' : undefined });

  async function abrirEquipo(nombre, vp){
    const ctx = await navegador.newContext({ viewport: vp, deviceScaleFactor: 1, timezoneId: 'America/Lima' });
    const page = await ctx.newPage();
    const E = { nombre, page, errores: [] };
    page.on('pageerror', e => E.errores.push(e.message));
    page.on('dialog', d => d.accept().catch(() => {}));
    await page.route('**/*', ruta => {
      const u = ruta.request().url();
      if (u.startsWith('http://127.0.0.1')) return ruta.continue();
      if (/supabase-js/.test(u)) return ruta.fulfill({ contentType: 'text/javascript', body: STUB_SUPABASE });
      if (/fonts\.googleapis|fonts\.gstatic/.test(u)) return ruta.fulfill({ contentType: 'text/css', body: '' });
      return ruta.abort();
    });
    await page.exposeFunction('__srvRpc', async (n, a) => { const r = rpc(n, a); if (r.cambio) { delete r.cambio; await avisarOtros(E, 'servidor'); } return r; });
    await page.exposeFunction('__srvAvGet', async () => JSON.parse(JSON.stringify(SRV.av)));
    await page.exposeFunction('__srvAvSet', async d => { SRV.av = JSON.parse(JSON.stringify(d)); await avisarOtros(E, 'avances'); return true; });
    await page.goto('http://127.0.0.1:' + servidor.address().port + '/index.html', { waitUntil: 'load' });
    await page.evaluate(({ F, T, S625, B25 }) => {
      document.getElementById('login-screen').style.display = 'none'; document.getElementById('report-select-screen').style.display = 'none';
      document.getElementById('app-screen').style.display = 'block';
      state.user = { rol: 'Supervisor', nombre: 'Leandro', username: 'leandro', permisos: ['paletas', 'nuevo', 'historial', 'avanceProduccion'] }; state.showWelcome = false;
      // hora fija del equipo: 26/11/2026 13:10 (Lima)
      const ahora = new Date(F + 'T13:10:00').getTime();
      GlacialFecha.fechaOperativa = () => F; GlacialFecha.bloqueActual = () => 'DÍA'; GlacialFecha.ahoraMs = () => ahora;
      window.tareoAhoraServidor = () => ahora;
      const prog = (marca, pres, tramos) => ({ clave: ['PET1', F, T, marca, pres].join('|'), linea: 'PET1', fecha: F, turno: T, marca, presentacion: pres, cantidadProgramada: 100000, unidadesPorPaleta: marca === 'BELLS' ? 480 : 1200, paletasProgramadas: 100, tramosSecuencia: tramos });
      const pal = (id, marca, pres, n, upp) => ({ id, linea: 'PET1', fecha: F, turno: T, marca, presentacion: pres, hora: '12:00', tipoPaleta: 'COMPLETA', paletas: n, unidadesPorPaleta: upp, unidadesIncompleta: 0, totalUnidades: n * upp, creadoEn: ahora - 600000 });
      _paletasCache = [pal('p1', 'SCALA', S625, 14, 1200), pal('p2', 'BELLS', B25, 6, 480)];
      _programacionesCache = [prog('SCALA', S625, [{ id: 't1', orden: 1, tipoFin: 'CANTIDAD', cantidadObjetivo: 16800 }, { id: 't3', orden: 3, tipoFin: 'CIERRE' }]), prog('BELLS', B25, [{ id: 't2', orden: 2, tipoFin: 'CANTIDAD', cantidadObjetivo: 99999 }])];
      // Supabase (glacial_69/70) y su tiempo real
      const canales = [];
      window.glacialSupabaseCliente = { rpc: (n, a) => window.__srvRpc(n, a), channel(){ const c = { on(_t, _f, cb){ canales.push(cb); return c; }, subscribe(){ return c; } }; return c; }, removeChannel(){} };
      // sync/avancesTurno común (lectura, escucha y transacción del modal «Agregar paradas»)
      const aplicarAv = d => { avanceEstado.paradasOperativas = d.paradasOperativas; avanceEstado.avancesUpdatedAt = d.updatedAt;
        glacialParadasTramo.estado.operativas = d.paradasOperativas; glacialParadasTramo.estado.alCambiar.forEach(f => f()); };
      avRef = () => ({ id: 'avancesTurno', get: async () => { const d = await window.__srvAvGet(); return { exists: true, data: () => d }; }, onSnapshot(){ return () => {}; } });
      glacialParadasTramo.estado.escuchaAv = () => {};      // la escucha la hace __tiempoReal
      db.runTransaction = async fn => { let nuevo = null; const tx = { get: async ref => { const d = await window.__srvAvGet(); return { exists: true, data: () => d }; }, set: (ref, d) => { if (ref.id === 'avancesTurno') nuevo = d; } };
        const r = await fn(tx); if (nuevo) { const d = Object.assign(await window.__srvAvGet(), nuevo); await window.__srvAvSet(d); aplicarAv(d); } return r; };
      window.__tiempoReal = async que => { if (que === 'avances') aplicarAv(await window.__srvAvGet()); else canales.forEach(cb => cb({})); await new Promise(r => setTimeout(r, 50)); };
      return window.__srvAvGet().then(d => { aplicarAv(d); state.currentLine = 'PET1'; state.currentTab = 'paletas'; renderSidebar(); renderMain(); });
    }, { F, T, S625, B25 });
    await page.waitForSelector('#ct-panel .ct-t', { timeout: 8000 });
    await page.waitForTimeout(400);
    equipos.push(E);
    return E;
  }
  const texto = E => E.page.evaluate(() => document.getElementById('ct-panel').innerText.replace(/\s+/g, ' '));
  const tarjeta = (E, n) => E.page.evaluate(k => (document.querySelectorAll('#ct-panel .ct-t')[k] || {}).innerText.replace(/\s+/g, ' '), n);
  const cap = async (E, n) => { if (process.env.GLX_CAPTURAS) await (await E.page.$('#ct-panel')).screenshot({ path: path.join(process.env.GLX_CAPTURAS, n + '.png') }); };
  const num = s => s.replace(/[^\d]/g, '');

  const A = await abrirEquipo('celular del supervisor', { width: 390, height: 1400 });
  const B = await abrirEquipo('PC de jefatura', { width: 1280, height: 1400 });

  // 1) Panel con paradas por marca (los dos equipos ven lo mismo)
  for (const E of [A, B]) {
    const t1 = await tarjeta(E, 0), t2 = await tarjeta(E, 1);
    ok(/1 · SCALA/.test(t1) && /2 · 28 min/.test(t1) && num((t1.match(/Ratio de la marca\s*([\d.,\s]+) und\/h/) || [])[1] || '') === '5250' && /08:15 Falla sopladora/.test(t1) && /09:30 Limpieza de llenadora/.test(t1),
      E.nombre + ': SCALA cerrada con 2 paradas · 28 min y ratio 5,250 und/h');
    ok(/2 · BELLS/.test(t2) && /3 · 77 min/.test(t2) && num((t2.match(/Ratio de la marca\s*([\d.,\s]+) und\/h/) || [])[1] || '') === '2367' && /En curso/.test(t2) && /CAMB 10:40 Cambio de formato/.test(t2),
      E.nombre + ': BELLS en curso con cambio + atasco + refrigerio · 77 min y ratio 2,367 und/h');
  }
  let tA = await texto(A);
  ok(/1 parada sin marca/.test(tA) && /Falta de preformas · 8 min \(sin hora\)/.test(tA), 'franja amarilla: 1 parada sin marca (Falta de preformas · 8 min, sin hora) con «Asignar»');
  ok(/⇄ Cambio SCALA → BELLS · 10:40 – 11:15 · 35 min/.test(tA) && /se carga a la marca que entra \(BELLS\)/.test(tA), 'tarjeta del cambio SCALA → BELLS 10:40–11:15 · 35 min (a la marca que entra)');
  ok(/Total turno \(suma de marcas\)/.test(tA) && /6 · 113 min/.test(tA) && /incluye 8 min sin marca/.test(tA), 'total del turno = suma de marcas + la pendiente (6 paradas · 113 min)');
  ok(/parada\(s\) sin marca: asígnala/.test(tA) && await A.page.evaluate(() => document.querySelector('.ct-enviar').disabled), '«Enviar cierre de turno» bloqueado por la parada sin marca');
  await cap(A, 'paradas-1-celular'); await cap(B, 'paradas-1-pc');

  // 2) «+ Parada a BELLS»: el modal abre con la marca ya elegida
  await A.page.click('#ct-panel .ct-t.activo button:has-text("+ Parada a BELLS")');
  await A.page.waitForSelector('#av-paradas-modal.open');
  ok(await A.page.evaluate(() => { const f = [...document.querySelectorAll('.av-parada-row')].pop(); return /BELLS/.test(f.querySelector('.av-tramo-btn.sel').innerText) && /Elegida a mano/.test(f.innerText); }), '«+ Parada a BELLS»: la fila nueva viene con BELLS elegida');
  // aviso de corte: 10:30 + 20 min cruza el corte de SCALA (10:40) → SCALA 10 + BELLS 10
  await A.page.evaluate(() => { const m = avanceEstado.paradasModal, i = m.filas.length - 1; m.filas[i].tramoId = ''; m.filas[i].asignacion = ''; m.filas[i].minutos = 20; avParadaHora(i, 'horaInicio', '10:30'); });
  ok(await A.page.evaluate(() => /SCALA 10 min \+ BELLS 10 min/.test([...document.querySelectorAll('.av-parada-row')].pop().innerText)), 'aviso azul: la parada 10:30 de 20 min cruza el corte → SCALA 10 min + BELLS 10 min');
  ok(await A.page.evaluate(() => /Elegida sola por la hora de inicio 10:30/.test([...document.querySelectorAll('.av-parada-row')].pop().innerText)), 'la marca se elige sola por la hora de inicio');
  if (process.env.GLX_CAPTURAS) { const dlg = await A.page.$('#av-paradas-modal .av-paradas-dialog'); if (dlg) await dlg.screenshot({ path: path.join(process.env.GLX_CAPTURAS, 'paradas-modal.png') }); }
  ok(await A.page.evaluate(() => [...document.querySelectorAll('.av-parada-row')].some(f => /Sin hora: elige la marca a mano/.test(f.innerText) && /Falta de preformas/.test(f.innerText))), 'aviso amarillo en la parada sin hora');
  await A.page.evaluate(() => { avanceEstado.paradasModal.filas.pop(); avCerrarParadas(); });

  // 3) «Asignar» en el celular → la pendiente va a BELLS y la PC lo ve sola (tiempo real)
  await A.page.click('#ct-panel button:has-text("Asignar")');
  await A.page.waitForSelector('#av-paradas-modal.open');
  const iPend = await A.page.evaluate(() => avanceEstado.paradasModal.filas.findIndex(p => p.descripcion === 'Falta de preformas'));
  await A.page.evaluate(i => { const f = document.querySelectorAll('.av-parada-row')[i]; [...f.querySelectorAll('.av-tramo-btn')].find(b => /BELLS/.test(b.innerText)).click(); }, iPend);
  ok(await A.page.evaluate(() => /BELLS: 85 min/.test(document.querySelector('.av-paradas-dialog footer').innerText)), 'pie del modal: total por marca (BELLS 85 min)');
  await A.page.click('#av-paradas-modal footer button:has-text("Guardar paradas")');
  await A.page.waitForFunction(() => !document.querySelector('#av-paradas-modal.open'), null, { timeout: 8000 });
  await B.page.waitForFunction(() => !/sin marca/.test(document.getElementById('ct-panel').innerText) && /4 · 85 min/.test(document.getElementById('ct-panel').innerText), null, { timeout: 8000 }).catch(() => {});
  const t2B = await tarjeta(B, 1);
  ok(/4 · 85 min/.test(t2B) && /Falta de preformas/.test(t2B) && /elegida a mano/.test(t2B) && !/sin marca/.test(await texto(B)), 'tiempo real: la PC de jefatura ve sola la parada asignada a BELLS (4 · 85 min) y desaparece la franja');
  const guardada = SRV.av.paradasOperativas.find(p => p.id === 'a6');
  ok(guardada && guardada.tramoId === 't2' && guardada.asignacion === 'MANUAL' && guardada.marca === 'BELLS', 'la parada queda guardada con su marca (tramo t2, MANUAL)');
  await new Promise(r => setTimeout(r, 300));
  ok(SRV.paradasTramo.get('a6') && SRV.paradasTramo.get('a6').asignacion === 'MANUAL' && SRV.paradasTramo.get('a6').tramo_id === 't2' && SRV.paradasTramo.get('a4').asignacion === 'AUTO', 'constancia en glacial_70: a6 MANUAL a BELLS, a4 AUTO');

  // 4) Cerrar BELLS desde la PC: confirmación con resumen y casilla obligatoria; el celular lo ve solo
  await B.page.click('#ct-panel .ct-t.activo button:has-text("Cerrar marca")');
  await B.page.waitForSelector('#ct-panel .ct-conf');
  const conf = await B.page.evaluate(() => document.querySelector('.ct-conf').innerText.replace(/\s+/g, ' '));
  ok(/Cerrar BELLS/.test(conf) && /Tiempo del tramo \(10:40–13:10\) 150 min/.test(conf) && /Paradas programadas \(cambio \+ otras programadas\) 65 min/.test(conf) && /Paradas no programadas 20 min/.test(conf) && /Horas efectivas 1\.08 h/.test(conf) && /Producción 2,880 und|Producción 2\s?880 und/.test(conf),
    'confirmación: tiempo del tramo, programadas, no programadas, horas efectivas y producción de BELLS');
  ok(await B.page.evaluate(() => document.querySelector('.ct-conf button.ct-btn:not(.ct-btn-o)').disabled), '«Cerrar marca» deshabilitado hasta marcar «Revisé las paradas de esta marca»');
  await cap(B, 'paradas-2-confirmar');
  await B.page.check('#ct-panel .ct-conf input[type=checkbox]');
  await B.page.click('#ct-panel .ct-conf button:has-text("Cerrar marca")');
  await B.page.waitForFunction(() => document.querySelectorAll('#ct-panel .ct-t.cerrado').length === 2, null, { timeout: 8000 });
  const ped = SRV.llamadas.filter(x => x[0] === 'cierre_tramo_cerrar').pop()[1].p;
  ok(ped.paradas_revisadas === true && ped.resumen && ped.resumen.minutos === 150 && ped.resumen.prog === 65 && ped.resumen.noprog === 20 && ped.resumen.produccion === 2880 && Math.round(ped.resumen.ratio) === 2658, 'al cerrar se congela el resumen de BELLS (150 min, 65 P, 20 NP, 2 880 und, 2 658 und/h)');
  await A.page.waitForFunction(() => document.querySelectorAll('#ct-panel .ct-t.cerrado').length === 2, null, { timeout: 8000 }).catch(() => {});
  ok(await A.page.evaluate(() => document.querySelectorAll('#ct-panel .ct-t.cerrado').length === 2 && /3 · SCALA[\s\S]*En curso/.test(document.getElementById('ct-panel').innerText)), 'tiempo real: el celular ve BELLS cerrada y SCALA 3 en curso sin recargar');

  // 5) Texto e imagen del Avance/Cierre: se envían POR FORMATO (27/11/2026, pedido de la planta); el formato general queda en avTextoWhatsAppGeneral / avCanvasSnapshotGeneral
  const snap = { id: 'x', fecha: F, turno: 'DÍA', tipo: 'CIERRE', horaCorte: '15:00', supervisor: 'J. Pérez', lineas: [{ linea: 'PET1', nombre: 'PET1', inicio: '07:00', fin: '15:00',
    productos: [{ marca: 'SCALA', presentacion: S625, produccion: 19200 }, { marca: 'BELLS', presentacion: B25, produccion: 4320 }], produccionTotal: 23520, minutosEfectivos: 342, ratio: 4126.3, ratioDisponible: true, unidadRatio: 'B/H',
    personal: 4, personalEstado: 'CONFIRMADO', paradas: SRV.av.paradasOperativas.map(p => Object.assign({}, p)).concat([par('a7', '13:55', 25, 'PROGRAMADA', 'Cambio de formato')]),
    paradasProgramadas: 100, paradasNoProgramadas: 38, totalParadas: 138, observaciones: [] }] };
  const env = await A.page.evaluate(s => ({ t: avTextoWhatsApp(s), f: avTextoWhatsAppFormatos(s), cw: avCanvasSnapshot(s).height === avCanvasSnapshotFormatos(s).height }), snap);
  ok(env.t === env.f && env.cw && /Ratio real \(con paradas\)/.test(env.t) && /Ratio sin paradas/.test(env.t), 'el Avance/Cierre se envía por formato (texto e imagen como antes, con ratio real, sin paradas y diferencia)');
  const txt = await A.page.evaluate(s => avTextoWhatsAppGeneral(s), snap);
  ok(/\*PET1\*\nInicio: 07:00 · Término: 15:00/.test(txt) && /Producción total: 23,520/.test(txt) && /Horas efectivas: 5\.70 h/.test(txt) && /Ratio turno: 4,126 B\/H|Ratio turno: 4\s?126 B\/H/.test(txt) && /Personal en línea: 4/.test(txt), 'texto WhatsApp general: producción total, horas efectivas, ratio del turno y personal');
  ok((txt.match(/\*PARADAS\*/g) || []).length === 1 && txt.indexOf('08:15 Falla sopladora – 18 min') < txt.indexOf('13:55 Cambio de formato – 25 min') && /— Falta de preformas – 8 min\n\nProgramadas: 100 min\nNo programadas: 38 min\n\*Total paradas: 138 min\*/.test(txt), 'una sola lista de PARADAS por hora (sin hora al final con «—») y el pie Programadas / No programadas / Total');
  const img = await A.page.evaluate(s => { const c = avCanvasSnapshotGeneral(s); return { w: c.width, h: c.height, url: c.toDataURL('image/png') }; }, snap);
  ok(img.w === 1080 && img.h > 1000, 'imagen general del cierre (1080 px de ancho)');
  if (process.env.GLX_CAPTURAS) fs.writeFileSync(path.join(process.env.GLX_CAPTURAS, 'paradas-3-imagen.png'), Buffer.from(img.url.split(',')[1], 'base64'));

  // 6) celular sin desborde y sin errores
  ok(await A.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'celular (390 px): sin desborde lateral');
  ok(await A.page.evaluate(() => [...document.querySelectorAll('#ct-panel button')].every(b => b.getBoundingClientRect().height >= 44 || b.offsetParent === null)), 'botones del panel de al menos 44 px de alto (táctiles)');
  ok(!A.errores.length && !B.errores.length, 'sin errores en las páginas' + (A.errores.concat(B.errores).length ? ': ' + A.errores.concat(B.errores).slice(0, 3).join(' | ') : ''));
  await navegador.close(); servidor.close();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
