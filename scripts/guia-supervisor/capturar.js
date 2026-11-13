/* GLACIAL · Guía del supervisor: graba los videos por sección y saca las capturas del PDF (12/11/2026).
   Usa la página real con la base SIMULADA (entorno.js) y datos de ejemplo (datos-demo.js). No toca ninguna base real.
   Uso:  GLX_LIBS=<carpeta con node_modules de apexcharts/echarts/canvas-gauges> node scripts/guia-supervisor/capturar.js [salida] [sección…]
         VOZ=<carpeta con los audios 01-01.mp3, 01-02.mp3…> → cada escena dura lo que su audio y el video lleva la voz.
   Salida: <salida>/videos/NN-*.mp4 · <salida>/capturas/NN-MM.png (PC) y movil-*.png · <salida>/escenas.json */
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { crearEntorno } = require('./entorno.js');
const { sembrarDemo, horaDemo } = require('./datos-demo.js');
const { SECCIONES, duracion } = require('./escenas.js');
const SALIDA = path.resolve(process.argv[2] || 'guia-supervisor-salida');
const SOLO = process.argv.slice(3).map(Number).filter(Boolean);
const VOZ = process.env.VOZ ? path.resolve(process.env.VOZ) : null;
const VISTA = { width: 1280, height: 720 };
for (const d of ['videos', 'capturas', 'tmp']) fs.mkdirSync(path.join(SALIDA, d), { recursive: true });
const dos = n => String(n).padStart(2, '0');
const durAudio = f => { try { return Math.round(parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]).toString()) * 1000); } catch (_) { return null; } };
const audioDe = (s, i) => { if (!VOZ) return null; for (const ext of ['mp3', 'wav', 'm4a', 'ogg']) { const f = path.join(VOZ, dos(s.n) + '-' + dos(i + 1) + '.' + ext); if (fs.existsSync(f)) return f; } return null; };

/* Capa de la guía dentro de la página: rótulo de sección, subtítulo, recuadro de resaltado y puntero. */
const CAPA = `(() => {
  if (window.__guia) return;
  const FAM = '"IBM Plex Sans","Segoe UI",Arial,sans-serif';
  const css = document.createElement('style');
  css.textContent = '#franja-entorno{display:none!important} body{padding-top:0!important}'
   + '.gx-capa{position:fixed;z-index:2147483600;pointer-events:none;font-family:"IBM Plex Sans",Segoe UI,Arial,sans-serif}'
   + '#gx-sub{left:50%;bottom:18px;transform:translateX(-50%);width:min(1060px,92vw);background:rgba(3,30,48,.93);color:#fff;border-radius:14px;padding:10px 22px 14px;font:500 21px/1.38 ' + FAM + ';text-align:center;box-shadow:0 8px 26px rgba(0,0,0,.35)}'
   + '#gx-sub .gx-cab{display:flex;justify-content:space-between;font:700 12px/1.2 ' + FAM + ';letter-spacing:.6px;text-transform:uppercase;color:#10B5F2;margin-bottom:6px}'
   + '#gx-sub .gx-cab i{font-style:normal;color:#F2C26B}'
   + '#gx-marca{border:4px solid #F2A93B;border-radius:12px;box-shadow:0 0 0 6px rgba(242,169,59,.28),0 0 24px rgba(242,169,59,.55);opacity:0}'
   + '#gx-puntero{width:26px;height:26px;border-radius:50%;background:rgba(16,181,242,.35);border:3px solid #10B5F2;opacity:0}'
   + '#gx-portada{inset:0;background:linear-gradient(135deg,#033350,#0877A6);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;opacity:0;transition:opacity .5s}'
   + '#gx-portada img{width:96px;height:96px} #gx-portada .t1{font:600 18px ' + FAM + ';letter-spacing:2px;color:#9EE3FF} #gx-portada .t2{font:800 44px ' + FAM + '} #gx-portada .t3{font:500 18px ' + FAM + ';color:#CFEFFF}';
  document.head.appendChild(css);
  const mk = (id, html) => { const e = document.createElement('div'); e.id = id; e.className = 'gx-capa'; if (html) e.innerHTML = html; document.body.appendChild(e); return e; };
  mk('gx-marca'); mk('gx-puntero'); mk('gx-sub');
  let rot = '';
  mk('gx-portada', '<img src="assets/img/icono-192.png" alt=""><div class="t1">GLACIAL · GUÍA DEL SUPERVISOR DE PRODUCCIÓN</div><div class="t2"></div><div class="t3"></div>');
  const buscar = q => {
    if (!q) return null;
    if (q.startsWith('css:')) return [...document.querySelectorAll(q.slice(4))].find(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden') || null;
    const t = q.toLowerCase(); let mejor = null, area = Infinity;
    document.querySelectorAll('body *').forEach(e => {
      if (e.closest('.gx-capa') || !e.getClientRects().length) return;
      const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return;
      const txt = (e.innerText || e.value || '').toLowerCase(); if (!txt.includes(t)) return;
      const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return;
      const a = r.width * r.height; if (a < area) { area = a; mejor = e; }
    });
    return mejor;
  };
  window.__guia = {
    rotulo(n, t){ rot = (n ? n + ' ' : '') + (t || ''); },
    sub(t){ const e = document.getElementById('gx-sub'); e.innerHTML = ''; if (!t) { e.style.display = 'none'; return; }
      const c = document.createElement('div'); c.className = 'gx-cab'; c.innerHTML = '<span></span><i>Datos de ejemplo</i>'; c.firstChild.textContent = rot;
      const x = document.createElement('div'); x.textContent = t; e.appendChild(c); e.appendChild(x); e.style.display = 'block'; },
    portada(on, t2, t3){ const p = document.getElementById('gx-portada'); if (t2 !== undefined) { p.querySelector('.t2').textContent = t2; p.querySelector('.t3').textContent = t3 || ''; } p.style.opacity = on ? 1 : 0; },
    rect(q){ const e = buscar(q); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; },
    ver(q){ const e = buscar(q); if (!e) return false; const r = e.getBoundingClientRect();
      if (r.top < 60 || r.bottom > innerHeight - 150) e.scrollIntoView({ block: r.height > innerHeight * 0.6 ? 'start' : 'center', inline: 'nearest' }); return true; },
    marcar(q){
      actual = q || null;
      return pintar();
    },
    limpiar(){ actual = null; document.getElementById('gx-marca').style.opacity = 0; document.getElementById('gx-puntero').style.opacity = 0; }
  };
  let actual = null;
  function pintar(){
      const q = actual; const m = document.getElementById('gx-marca'), p = document.getElementById('gx-puntero'); if (!m) return false; const e = q ? buscar(q) : null;
      if (!e) { m.style.opacity = 0; p.style.opacity = 0; return false; }
      const r = e.getBoundingClientRect(), pad = 8;
      Object.assign(m.style, { left: (r.left - pad) + 'px', top: (r.top - pad) + 'px', width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px', opacity: 1 });
      Object.assign(p.style, { left: (r.left + Math.min(r.width - 10, 40)) + 'px', top: (r.top + r.height / 2 - 13) + 'px', opacity: 1 });
      return true;
  }
  setInterval(() => { if (actual) pintar(); }, 200);
})()`;

async function prepararSesion(E, D, hasta){
  const p = D.page;
  await p.clock.install({ time: horaDemo().ms });
  await p.reload({ waitUntil: 'load' });
  await p.evaluate(CAPA);
  if (hasta === 'login') return;
  await E.entrar(D, 'ana', 'Demo#2026');
  await p.waitForTimeout(900);
  await p.evaluate(CAPA);
  if (hasta === 'seleccion') return;
  await p.evaluate(() => { establecerModoTrabajo('trabajar'); goReporteAgua(); });
  await p.waitForTimeout(900);
}

async function irA(E, D, destino){
  const p = D.page;
  if (destino === 'login' || destino === 'seleccion') return;
  if (destino === 'agua') { await p.evaluate(() => { establecerModoTrabajo('trabajar'); goReporteAgua(); }); await p.waitForTimeout(900); return; }
  await p.evaluate(destino).catch(e => console.log('   no se pudo abrir ' + destino + ': ' + e.message));
  await p.waitForTimeout(1100);
  await p.evaluate(() => { const m = document.querySelector('#main'); if (m) m.scrollTop = 0; window.scrollTo(0, 0); });
}

async function escena(E, D, s, i, esc, opc){
  const p = D.page;
  if (esc.ir) await irA(E, D, esc.ir);
  await p.evaluate(CAPA);
  await p.evaluate(([n, t]) => { __guia.rotulo(n, t); }, [s.n + '.', s.titulo]);
  if (esc.arriba) await p.evaluate(() => { document.querySelectorAll('*').forEach(e => { if (e.scrollTop) e.scrollTop = 0; }); window.scrollTo(0, 0); });
  await p.waitForTimeout(500);
  if (esc.marca) await p.evaluate(q => __guia.ver(q), esc.marca);
  await p.waitForTimeout(650);
  await p.evaluate(() => __guia.sub(''));
  const ok = esc.marca ? await p.evaluate(q => __guia.marcar(q), esc.marca) : (await p.evaluate(() => __guia.limpiar()), true);
  if (esc.marca && !ok) console.log('   (no encontré «' + esc.marca + '» en ' + dos(s.n) + '-' + dos(i + 1) + ')');
  const total = opc.duracion;
  const t0 = Date.now();
  await p.waitForTimeout(250);
  if (opc.captura) await p.screenshot({ path: opc.captura });
  await p.evaluate(t => __guia.sub(t), esc.texto);
  if (esc.escribir) {
    await p.click('#login-user'); await p.type('#login-user', 'ana', { delay: 120 });
    await p.evaluate(() => __guia.marcar('css:#login-pass')); await p.click('#login-pass'); await p.type('#login-pass', 'Demo#2026', { delay: 90 });
    await p.evaluate(() => __guia.marcar('Ingresar'));
  }
  if (esc.clic) {
    await p.waitForTimeout(Math.max(800, total - 1500));
    const r = await p.evaluate(q => __guia.rect(q), esc.clic);
    if (r) await p.mouse.click(r.x + r.w / 2, r.y + r.h / 2); else console.log('   (no encontré para tocar «' + esc.clic + '»)');
    await p.waitForTimeout(900);
    await p.evaluate(CAPA);
    return;
  }
  const resta = total - (Date.now() - t0);
  if (resta > 0) await p.waitForTimeout(resta);
  if (esc.escribir) { await p.evaluate(() => handleLogin()); await p.waitForTimeout(1200); await p.evaluate(CAPA); }
}

async function grabarSeccion(E, s){
  const dirTmp = path.join(SALIDA, 'tmp', dos(s.n)); fs.rmSync(dirTmp, { recursive: true, force: true }); fs.mkdirSync(dirTmp, { recursive: true });
  const D = await E.abrir({ viewport: VISTA, video: dirTmp });
  const tVideo = Date.now();
  const primera = s.escenas[0].ir === 'login' ? 'login' : (s.escenas[0].ir === 'seleccion' ? 'seleccion' : 'app');
  await prepararSesion(E, D, primera);
  if (s.n === 8) await irA(E, D, 'goProduccionInicio()');
  await D.page.evaluate(CAPA);
  const tInicio = Date.now();
  await D.page.evaluate(([t2, t3]) => { __guia.sub(''); __guia.portada(true, t2, t3); }, [s.n + '. ' + s.titulo, 'Datos de ejemplo · no son datos de la planta']);
  await D.page.waitForTimeout(2600);
  await D.page.evaluate(() => __guia.portada(false));
  await D.page.waitForTimeout(500);
  const tiempos = [];
  for (let i = 0; i < s.escenas.length; i++) {
    const esc = s.escenas[i], audio = audioDe(s, i);
    const dur = audio ? (durAudio(audio) || duracion(esc.texto)) + 700 : duracion(esc.texto);
    const desde = Date.now() - tInicio;
    await escena(E, D, s, i, esc, { duracion: dur, captura: path.join(SALIDA, 'capturas', dos(s.n) + '-' + dos(i + 1) + '.png') });
    tiempos.push({ id: dos(s.n) + '-' + dos(i + 1), desde, hasta: Date.now() - tInicio, audio, texto: esc.texto });
  }
  await D.page.evaluate(() => { __guia.limpiar(); __guia.sub(''); __guia.portada(true, 'Fin de la sección', 'GLACIAL · Guía del supervisor de producción'); });
  await D.page.waitForTimeout(2200);
  const fin = Date.now() - tInicio;
  const errores = [...new Set(D.errores)];
  await D.ctx.close();
  const webm = fs.readdirSync(dirTmp).find(f => f.endsWith('.webm'));
  const offset = ((tInicio - tVideo) / 1000).toFixed(2), largo = (fin / 1000).toFixed(2);
  const mp4 = path.join(SALIDA, 'videos', dos(s.n) + '-' + s.archivo.replace(/^\d+-/, '') + '.mp4');
  const args = ['-y', '-loglevel', 'error', '-ss', offset, '-t', largo, '-i', path.join(dirTmp, webm)];
  const conVoz = tiempos.filter(t => t.audio);
  if (conVoz.length) {
    conVoz.forEach(t => args.push('-i', t.audio));
    const mezcla = conVoz.map((t, k) => '[' + (k + 1) + ':a]adelay=' + (t.desde + 350) + '|' + (t.desde + 350) + '[a' + k + ']').join(';') + ';' + conVoz.map((t, k) => '[a' + k + ']').join('') + 'amix=inputs=' + conVoz.length + ':normalize=0[voz]';
    args.push('-filter_complex', mezcla, '-map', '0:v', '-map', '[voz]', '-c:a', 'aac', '-b:a', '160k');
  } else {
    args.push('-f', 'lavfi', '-t', largo, '-i', 'anullsrc=r=44100:cl=stereo', '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-shortest');
  }
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', '25', '-movflags', '+faststart', mp4);
  execFileSync('ffmpeg', args);
  console.log('✔ ' + path.basename(mp4) + ' · ' + largo + ' s' + (conVoz.length ? ' · con voz (' + conVoz.length + ' audios)' : ' · sin voz') + (errores.length ? ' · errores de página: ' + errores.slice(0, 3).join(' | ') : ''));
  return { seccion: s.n, titulo: s.titulo, video: path.basename(mp4), segundos: Number(largo), escenas: tiempos };
}

async function capturasMovil(E){
  const D = await E.abrir({ viewport: { width: 390, height: 844 }, escala: 2, movil: true });
  await prepararSesion(E, D, 'app');
  for (const [n, js] of [['inicio', 'goProduccionInicio()'], ['produccion-actual', 'goProduccionActual()'], ['nuevo-registro', "setTab('nuevo')"], ['tareo', 'goTareo()']]) {
    await irA(E, D, js); await D.page.evaluate(CAPA); await D.page.evaluate(() => { __guia.sub(''); });
    await D.page.screenshot({ path: path.join(SALIDA, 'capturas', 'movil-' + n + '.png') });
  }
  await D.page.evaluate(() => { const b = document.querySelector('.mobile-menu-toggle'); if (b) b.click(); });
  await D.page.waitForTimeout(700);
  await D.page.screenshot({ path: path.join(SALIDA, 'capturas', 'movil-menu.png') });
  await D.ctx.close();
}

(async () => {
  const E = await crearEntorno({ sembrar: sembrarDemo });
  const resumen = [];
  for (const s of SECCIONES) { if (SOLO.length && !SOLO.includes(s.n)) continue; resumen.push(await grabarSeccion(E, s)); }
  if (!SOLO.length) await capturasMovil(E);
  await E.cerrar();
  const previo = (() => { try { return JSON.parse(fs.readFileSync(path.join(SALIDA, 'escenas.json'), 'utf8')); } catch (_) { return []; } })();
  const todo = previo.filter(x => !resumen.some(r => r.seccion === x.seccion)).concat(resumen).sort((a, b) => a.seccion - b.seccion);
  fs.writeFileSync(path.join(SALIDA, 'escenas.json'), JSON.stringify(todo, null, 1));
  fs.rmSync(path.join(SALIDA, 'tmp'), { recursive: true, force: true });
})().catch(e => { console.error('ERROR', e); process.exit(1); });
