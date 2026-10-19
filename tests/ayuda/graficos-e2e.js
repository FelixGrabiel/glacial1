/* Ayuda para las pruebas en navegador de la migración de gráficos: servidor estático, páginas con ApexCharts/ECharts/canvas-gauges REALES
   (de GLX_LIBS/node_modules, sin CDN) y datos de ejemplo. Usada por tests/graficos-fase1.e2e.js y tests/graficos-fase2.e2e.js. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const R = path.resolve(__dirname, '..', '..');
const LIBS = process.env.GLX_LIBS;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
const lib = f => fs.readFileSync(path.join(LIBS, 'node_modules', f), 'utf8');
const STUB_SUPABASE = `window.supabase={createClient(){return {auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}},rpc:async()=>({data:null,error:null}),channel(){const c={on(){return c},subscribe(cb){setTimeout(()=>cb&&cb('SUBSCRIBED'),0);return c}};return c},removeChannel(){},functions:{invoke:async()=>({data:null,error:null})}}}};`;

async function iniciar() {
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

  return { abrir, preparar, cerrar: async () => { await navegador.close(); servidor.close(); } };
}
module.exports = { iniciar, LIBS };
