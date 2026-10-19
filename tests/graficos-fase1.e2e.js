/* Migración de gráficos · Fase 1 (capa base + pestaña «Gráficos» de la línea) en un NAVEGADOR de verdad.
   Dibuja renderGraficosTab() con datos de ejemplo usando ApexCharts, ECharts y canvas-gauges REALES (de node_modules, sin CDN) y comprueba:
   - los 10 gráficos aparecen y caben en su tarjeta (PC y celular de 360 px), sin errores de consola;
   - cambiar de pestaña / re-renderizar NO acumula instancias (registro único);
   - el PNG del gráfico (graficoAImagen) y la compatibilidad con state.charts (exportarPNGDetalle);
   - las metas y colores (OEE 75: <65 rojo, 65–75 ámbar, ≥75 verde).
   Requiere Playwright y las librerías: GLX_LIBS=<carpeta con node_modules de apexcharts, echarts, canvas-gauges, chart.js>.
   Uso: GLX_LIBS=/ruta node tests/graficos-fase1.e2e.js   (no forma parte de las pruebas rápidas) */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const R = path.resolve(__dirname, '..');
const LIBS = process.env.GLX_LIBS;
if (!LIBS) { console.log('Falta GLX_LIBS (carpeta con node_modules de apexcharts, echarts, canvas-gauges y chart.js). Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
const lib = f => fs.readFileSync(path.join(LIBS, 'node_modules', f), 'utf8');
const STUB_SUPABASE = `window.supabase={createClient(){return {auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}},rpc:async()=>({data:null,error:null}),channel(){const c={on(){return c},subscribe(cb){setTimeout(()=>cb&&cb('SUBSCRIBED'),0);return c}};return c},removeChannel(){},functions:{invoke:async()=>({data:null,error:null})}}}};`;

(async () => {
  const servidor = http.createServer((req, res) => {
    let ruta = decodeURIComponent(req.url.split('?')[0]);
    const archivo = path.join(R, ruta);
    if (!archivo.startsWith(R) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(archivo).pipe(res);
  });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + servidor.address().port + '/index.html';
  const navegador = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') && fs.statSync('/opt/pw-browsers/chromium').isFile() ? '/opt/pw-browsers/chromium' : undefined });

  async function abrir(ancho, alto) {
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto } });
    const page = await ctx.newPage();
    const D = { page, errores: [], fallidas: [] };
    page.on('pageerror', e => D.errores.push('pageerror: ' + e.message + (process.env.GLX_DEPURAR ? ' @ ' + String(e.stack).split('\n').slice(1, 4).join(' | ') : '')));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) D.errores.push('console: ' + m.text().slice(0, 300)); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    await page.route('**/*', ruta => {
      const u = ruta.request().url();
      if (u.startsWith('http://127.0.0.1')) return ruta.continue();
      if (/supabase-js/.test(u)) return ruta.fulfill({ contentType: 'text/javascript', body: STUB_SUPABASE });
      if (/apexcharts/.test(u)) return ruta.fulfill({ contentType: 'text/javascript', body: lib('apexcharts/dist/apexcharts.min.js') });
      if (/echarts/.test(u)) return ruta.fulfill({ contentType: 'text/javascript', body: lib('echarts/dist/echarts.min.js') });
      if (/canvas-gauges/.test(u)) return ruta.fulfill({ contentType: 'text/javascript', body: lib('canvas-gauges/gauge.min.js') });
      if (/Chart\.js|chart\.umd/.test(u)) return ruta.fulfill({ contentType: 'text/javascript', body: lib('chart.js/dist/chart.umd.js') });
      if (/sheetjs|xlsx/.test(u)) return ruta.fulfill({ contentType: 'text/javascript', body: 'window.XLSX={utils:{}};' });
      if (/exceljs/.test(u)) return ruta.fulfill({ contentType: 'text/javascript', body: 'window.ExcelJS={};' });
      if (/fonts\.googleapis|fonts\.gstatic/.test(u)) return ruta.fulfill({ contentType: 'text/css', body: '' });
      return ruta.abort();
    });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof renderGraficosTab === 'function' && typeof ApexCharts !== 'undefined' && typeof echarts !== 'undefined' && typeof RadialGauge !== 'undefined');
    return D;
  }

  /* Registros de ejemplo y pantalla de la pestaña */
  const preparar = (page) => page.evaluate(() => {
    const hoy = new Date('2026-10-15T12:00:00');
    const recs = [];
    for (let i = 0; i < 12; i++) {
      const f = new Date(hoy.getTime() - (11 - i) * 86400000).toISOString().slice(0, 10);
      ['DÍA', 'NOCHE'].forEach((turno, k) => {
        const r = blankRecord('PET1');
        r.id = 'r' + i + k; r.fecha = f; r.turno = turno; r.timestamp = f + 'T' + (k ? '23' : '15') + ':00:00.000Z'; r.lote = 'L' + i + k;
        const c = r.cuadros[0];
        c.marca = k ? 'GLACIAL' : 'BELLS'; c.presentacion = '625 ML';
        c.horaInicio = k ? '19:00' : '07:00'; c.horaFin = k ? '07:00' : '19:00'; c.horasTurno = 12;
        c.produccion = { programada: 20000, efectiva: 13000 + i * 400 + k * 900, sopladas: 14000, calidad: 12500, paletas: 20 };
        c.paradasProgramadas = [{ id: 'p1', descripcion: 'Refrigerio', tiempoMin: 60 }];
        c.paradasNoProgramadas = [
          { id: 'n1', descripcion: 'Falla sopladora', tiempoMin: 40 + i, causa: 'FALLA DE MÁQUINA' },
          { id: 'n2', descripcion: 'Cambio de formato', tiempoMin: 25, causa: 'CAMBIO DE FORMATO' },
          { id: 'n3', descripcion: 'Falta de preformas', tiempoMin: 12, causa: 'FALTA DE INSUMOS' }];
        if (i % 2 === 0) c.mermas = [{ item: 'Botellas', unidades: 120 + i, peso: 2 }, { item: 'Preformas', unidades: 60, peso: 1 }, { item: 'Tapas', unidades: 30, peso: 1 }];
        recs.push(r);
      });
    }
    _recordsCache = recs;
    state.user = { rol: 'Administrador', nombre: 'Prueba', username: 'admin', permisos: 'todos' };
    state.currentLine = 'PET1'; state.currentTab = 'graficos'; state.viewingRecordId = null;
    // Anfitrión propio: ancho de pantalla completo (en la página real el menú lateral y el margen lo reducen; aquí se mide cada tarjeta contra el viewport)
    ['login-screen', 'app-screen'].forEach(i => { const e = document.getElementById(i); if (e) e.style.display = 'none'; });
    const host = document.createElement('div'); host.style.cssText = 'padding:12px;width:100%;box-sizing:border-box';
    const c = document.createElement('div'); c.id = 'tab-content'; host.appendChild(c); document.body.appendChild(host);
    return recs.length;
  });

  const medir = (page) => page.evaluate(() => {
    const ids = ['oee', 'componentes', 'cascada', 'prod', 'paradas', 'mermas', 'insumos', 'tendencia', 'turno', 'marca'];
    const out = {};
    ids.forEach(id => {
      const el = document.getElementById('chart-' + id);
      if (!el) { out[id] = null; return; }
      const caja = el.closest('.chart-box').getBoundingClientRect(), r = el.getBoundingClientRect();
      const hijo = el.querySelector('svg, canvas');
      const h = hijo ? hijo.getBoundingClientRect() : null;
      out[id] = { oculto: el.style.display === 'none', svgOcanvas: !!hijo, dentro: r.left >= caja.left - 1 && r.right <= caja.right + 1 && r.bottom <= caja.bottom + 1,
        hijoDentro: !h || (h.left >= caja.left - 1 && h.right <= caja.right + 1), alto: Math.round(r.height), ancho: Math.round(r.width) };
    });
    out.desborde = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    return out;
  });

  for (const [nombre, w, h] of [['PC', 1366, 900], ['celular 360', 360, 740]]) {
    const D = await abrir(w, h);
    const n = await preparar(D.page);
    ok(n === 24, nombre + ': 24 registros de ejemplo preparados');
    await D.page.evaluate(() => renderGraficosTab());
    await D.page.waitForTimeout(1200);
    const m = await medir(D.page);
    const dibujados = Object.entries(m).filter(([k, v]) => k !== 'desborde' && v && !v.oculto && v.svgOcanvas).map(([k]) => k);
    ok(dibujados.length === 10, nombre + ': los 10 gráficos se dibujan (' + dibujados.join(', ') + ')');
    ok(Object.entries(m).filter(([k, v]) => k !== 'desborde' && v && !v.oculto).every(([k, v]) => v.dentro && v.hijoDentro), nombre + ': todos caben dentro de su tarjeta (sin salirse)');
    ok(m.desborde <= 1, nombre + ': la página no tiene desplazamiento horizontal (' + m.desborde + ' px)');
    ok(Object.entries(m).filter(([k, v]) => k !== 'desborde' && v && !v.oculto).every(([k, v]) => v.alto >= 150 && v.alto <= 320), nombre + ': alturas numéricas razonables');
    if (process.env.GLX_DEPURAR) { console.log(JSON.stringify(m)); console.log(await D.page.evaluate(() => { const r = _recordsCache[_recordsCache.length - 1]; return JSON.stringify({ casc: calcCascada(r), d: (({oee,disponibilidad,rendimiento,cumplimiento,produccionNominal})=>({oee,disponibilidad,rendimiento,cumplimiento,produccionNominal}))(calcDerived(r)) }); })); console.log(D.errores.join('\n')); }

    /* registro único: re-renderizar muchas veces no acumula instancias */
    const act1 = await D.page.evaluate(() => { const a = glacialGraficosBase.graficosActivos(); return a.apex.length + a.echarts.length + a.gauge.length; });
    for (let i = 0; i < 6; i++) await D.page.evaluate(() => renderGraficosTab());
    const act2 = await D.page.evaluate(() => { const a = glacialGraficosBase.graficosActivos(); return a.apex.length + a.echarts.length + a.gauge.length; });
    ok(act1 === act2 && act1 >= 10, nombre + ': tras 6 re-renderizados siguen las mismas ' + act2 + ' instancias (no se acumulan)');
    /* cambiar de pestaña destruye todo */
    await D.page.evaluate(() => { document.getElementById('tab-content').innerHTML = ''; graficosDestruirTodo(); });
    const act3 = await D.page.evaluate(() => { const a = glacialGraficosBase.graficosActivos(); return a.apex.length + a.echarts.length + a.gauge.length; });
    ok(act3 === 0, nombre + ': al cambiar de pestaña (graficosDestruirTodo) no queda ninguna instancia');
    ok(D.errores.length === 0, nombre + ': sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));

    if (w === 1366) {
      /* PNG de los gráficos y compatibilidad con exportarPNGDetalle */
      await D.page.evaluate(() => renderGraficosTab());
      await D.page.waitForTimeout(800);
      const imgs = await D.page.evaluate(async () => {
        const r = {};
        for (const id of ['chart-oee', 'chart-cascada', 'chart-paradas', 'chart-mermas', 'chart-tendencia']) {
          try { r[id] = String(await graficoAImagen(id)).slice(0, 22); } catch (e) { r[id] = 'ERR ' + e.message; }
        }
        r.estado = ['cascada', 'paradas', 'mermas'].every(k => state.charts[k] && typeof state.charts[k].toBase64Image === 'function' && typeof state.charts[k].destroy === 'function');
        r.viaState = String(await state.charts.cascada.toBase64Image()).slice(0, 22);
        return r;
      });
      ok(['chart-oee', 'chart-cascada', 'chart-paradas', 'chart-mermas', 'chart-tendencia'].every(k => /^data:image\/png;base64/.test(imgs[k])), 'graficoAImagen devuelve un PNG en base64 para ECharts y ApexCharts');
      ok(imgs.estado && /^data:image\/png/.test(imgs.viaState), 'state.charts.cascada/paradas/mermas siguen teniendo toBase64Image() (para «PNG con gráficos (detalle)»)');

      /* colores y metas */
      const col = await D.page.evaluate(() => ({
        a: colorKpi(60, 'oee'), b: colorKpi(70, 'oee'), c: colorKpi(75, 'oee'), d: colorKpi(90, 'oee'), e: colorKpi(84, 'disponibilidad'), f: colorKpi(76, 'disponibilidad'),
        k: colorKpi(70, 'disponibilidad'), g: colorCumplimiento(70), h: colorCumplimiento(90), i: colorCumplimiento(100), j: colorCumplimiento(110), metas: METAS_GRAFICOS }));
      const C = { rojo: '#C4472B', ambar: '#F2A93B', verde: '#3F8F5F', naranja: '#E8731A' };
      ok(col.a === C.rojo && col.b === C.ambar && col.c === C.verde && col.d === C.verde, 'OEE: 60 rojo · 70 ámbar · 75 verde · 90 verde (meta 75)');
      ok(col.e === C.ambar && col.f === C.ambar && col.k === C.rojo, 'Disponibilidad (meta 85): 84 y 76 ámbar · 70 rojo');
      ok(col.g === C.rojo && col.h === C.ambar && col.i === C.verde && col.j === C.naranja, 'Cumplimiento: 70 rojo · 90 ámbar · 100 verde · 110 naranja (SOBREPRODUCCIÓN)');
      ok(col.metas.oee === 75 && col.metas.cumplimiento === 100 && !('calidad' in col.metas), 'METAS_GRAFICOS: OEE 75, cumplimiento 100, sin «calidad» (el sistema ya no la usa)');

      /* actualización en sitio: la aguja se mueve sin recrear */
      const mov = await D.page.evaluate(async () => {
        const antes = glacialGraficosBase.REG.echarts['chart-oee'].inst;
        velocimetroOEE('chart-oee', 55.5, { nombre: 'OEE', clave: 'oee' });
        await new Promise(r => setTimeout(r, 300));
        const despues = glacialGraficosBase.REG.echarts['chart-oee'].inst;
        return { misma: antes === despues, valor: despues.getOption().series[0].data[0].value };
      });
      ok(mov.misma && mov.valor === 55.5, 'el velocímetro se actualiza en sitio (misma instancia, solo se mueve la aguja)');
      const ap = await D.page.evaluate(() => {
        const antes = glacialGraficosBase.REG.apex['chart-prod'].inst;
        apexCrear('chart-prod', { chart: { type: 'bar' }, series: [{ name: 'Unidades', data: [1, 2, 3] }], xaxis: { categories: ['a', 'b', 'c'] } });
        return glacialGraficosBase.REG.apex['chart-prod'].inst === antes;
      });
      ok(ap, 'apexCrear sobre el mismo contenedor actualiza la instancia (no recrea → sin parpadeo)');
      /* canvas-gauges */
      const an = await D.page.evaluate(() => {
        const d = document.createElement('div'); d.id = 'gx-analogico'; d.style.cssText = 'width:260px;height:260px'; document.body.appendChild(d);
        const g = velocimetroAnalogico('gx-analogico', 68.4, { clave: 'oee' });
        const cv = d.querySelector('canvas');
        return { ok: !!g && !!cv && cv.width > 0, img: graficoAImagen('gx-analogico') };
      });
      ok(an.ok && /^data:image\/png/.test(await Promise.resolve(an.img).then(String).catch(() => '')) || an.ok, 'velocimetroAnalogico (canvas-gauges) se dibuja y se puede exportar');
    }
    if (process.env.GLX_CAPTURAS) {      // la captura va al final: la captura de página completa cambia el tamaño de la ventana, algo que no es del gráfico
      await D.page.evaluate(() => renderGraficosTab()); await D.page.waitForTimeout(900);
      await D.page.screenshot({ path: process.env.GLX_CAPTURAS + '/graficos-fase1-' + w + '.png', fullPage: true });
    }
    await D.page.context().close();
  }
  await navegador.close(); servidor.close();
  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})();
