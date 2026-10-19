/* Migración de gráficos · Fase 3 (Impacto económico) en un NAVEGADOR de verdad, con ApexCharts REAL.
   Renderiza glacialImpactoDashboard con eventos de ejemplo (3 líneas, 20 días) y comprueba, en PC y en celular de 360 px:
   - los 10 gráficos (5 en «Resumen ejecutivo» y 5 en «Análisis de pérdidas»: mapa de árbol de máquinas y dona de tipos incluidos) se dibujan y caben;
   - un CLIC real en una barra / recuadro / sector filtra (chips) y volver a hacer clic quita el filtro;
   - el tiempo real (refrescar) ACTUALIZA EN SITIO: misma instancia, sin recrear ni acumular;
   - modo con soles y modo operativo (minutos); sin errores de consola.
   Uso: GLX_LIBS=/ruta node tests/graficos-fase3.e2e.js   (no forma parte de las pruebas rápidas) */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const RESUMEN = ['evolucion', 'linea', 'causa', 'turno', 'acumulada'], PERDIDAS = ['maquina', 'marca', 'pres', 'tipo', 'scatter'];

(async () => {
  const H = await iniciar();
  for (const [nombre, w, h, econ] of [['PC · soles', 1366, 900, true], ['celular 360 · operativo', 360, 740, false]]) {
    const D = await H.abrir(w, h);
    await H.preparar(D.page);
    await D.page.evaluate((econ) => {
      const filas = [], hoy = new Date('2026-10-15T12:00:00');
      const lineas = ['PET1', 'PET2', 'B7L'], marcas = ['BELLS', 'GLACIAL', 'ARO'], pres = ['625 ML', '2.5 L', '7 L'], maq = ['Sopladora', 'Etiquetadora', 'Llenadora', 'Encajonadora', 'Paletizadora'];
      const causas = ['Falla sopladora', 'Cambio de formato', 'Falta de preformas', 'Limpieza', 'Ajuste de etiquetas', 'Falla llenadora'];
      let n = 0;
      for (let d = 0; d < 20; d++) {
        const fecha = new Date(hoy.getTime() - d * 86400000).toISOString().slice(0, 10);
        lineas.forEach((l, li) => { for (let k = 0; k < 4; k++) {
          const t = ['P', 'P', 'V', 'M'][k], min = 10 + ((d * 7 + li * 13 + k * 5) % 50);
          filas.push({ id: fecha + '|' + n++, tipo: t, fecha, hora: '0' + (k + 7) + ':00', turno: k % 2 ? 'NOCHE' : 'DÍA', grupo: 'g', lineaKey: l, linea: l, marca: marcas[(d + k) % 3], pres: pres[(li + k) % 3],
            maquina: t === 'P' ? maq[(d + k + li) % 5] : '', causa: causas[(d + k * 2 + li) % 6], u: min * 20, min: t === 'M' ? 0 : min, s: econ ? min * 18.5 : null });
        } });
      }
      window.glacialEconomico = { accesoListo: () => true, esGerencia: () => econ, esJefatura: () => false, alCambiar() {}, meta: () => 0 };
      Object.assign(glacialImpactoResultados, { cargar: (d, h, cb) => cb(filas, { modo: econ ? 'jef' : 'op', ultimo: null, diasSinPublicar: 0 }), meta: () => 0 });
      glacialImpactoResultados.estado.listo = true; glacialImpactoResultados.estado.error = '';
      _recordsReady = true; state.currentTab = 'perdidas';
      window.__main = document.getElementById('tab-content');
      glacialImpactoDashboard.render(window.__main);
    }, econ);
    await D.page.waitForSelector('#impacto-dash #idc-evolucion svg', { timeout: 8000 });
    await D.page.waitForTimeout(700);
    const medir = (ids) => D.page.evaluate((ids) => {
      const o = {};
      ids.forEach(id => {
        const el = document.getElementById('idc-' + id); if (!el) { o[id] = null; return; }
        const caja = el.closest('.id-card').getBoundingClientRect(), r = el.getBoundingClientRect(), hijo = el.querySelector('svg'), hr = hijo && hijo.getBoundingClientRect();
        o[id] = { dibujado: !!hijo && r.height > 100, dentro: r.left >= caja.left - 1 && r.right <= caja.right + 1, hijoDentro: !hr || (hr.left >= caja.left - 1 && hr.right <= caja.right + 1) };
      });
      o.desborde = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      return o;
    }, ids);
    let m = await medir(RESUMEN);
    ok(RESUMEN.every(id => m[id] && m[id].dibujado), nombre + ': los 5 gráficos del Resumen ejecutivo se dibujan');
    ok(RESUMEN.every(id => m[id].dentro && m[id].hijoDentro) && m.desborde <= 1, nombre + ': caben en su tarjeta y la página no se desborda (' + m.desborde + ' px)');

    await D.page.click('[data-id-tab="perdidas"]');
    await D.page.waitForSelector('#idc-maquina svg', { timeout: 8000 }); await D.page.waitForTimeout(600);
    m = await medir(PERDIDAS);
    ok(PERDIDAS.every(id => m[id] && m[id].dibujado), nombre + ': los 5 gráficos de Análisis de pérdidas se dibujan (mapa de árbol, 3 rankings, dona y dispersión)');
    ok(PERDIDAS.every(id => m[id].dentro && m[id].hijoDentro) && m.desborde <= 1, nombre + ': caben en su tarjeta');
    const tipos = await D.page.evaluate(() => { const r = glacialGraficosBase.REG.apex; return { arbol: r['idc-maquina'].inst.w.config.chart.type, dona: r['idc-tipo'].inst.w.config.chart.type, disp: r['idc-scatter'].inst.w.config.chart.type }; });
    ok(tipos.arbol === 'treemap' && tipos.dona === 'donut' && tipos.disp === 'scatter', nombre + ': máquinas = treemap, tipo = dona, dispersión = scatter');

    /* clic real en una barra del ranking (marca) */
    const sel = (dim) => D.page.evaluate((dim) => glacialImpactoDashboard.estado.estado.sel[dim].length, dim);
    await D.page.locator('#idc-marca .apexcharts-bar-area').first().click({ force: true });
    await D.page.waitForTimeout(500);
    ok(await sel('marca') === 1, nombre + ': un clic en una barra de «Pérdida por marca» agrega el filtro');
    ok(await D.page.evaluate(() => document.querySelectorAll('#id-chips .id-chip').length) >= 1, nombre + ': aparece la etiqueta del filtro (chip)');
    await D.page.locator('#idc-marca .apexcharts-bar-area').first().click({ force: true });
    await D.page.waitForTimeout(500);
    ok(await sel('marca') === 0, nombre + ': otro clic en la misma barra quita el filtro');
    /* clic en recuadro del treemap y en sector de la dona */
    await D.page.locator('#idc-maquina .apexcharts-treemap-rect').first().click({ force: true }); await D.page.waitForTimeout(500);
    ok(await sel('maquina') === 1, nombre + ': un clic en un recuadro del mapa de árbol filtra por esa máquina');
    /* el centro del recuadro de un sector de dona cae en el hueco: se hace clic de verdad sobre un punto del arco */
    const punto = await D.page.evaluate(() => {
      document.getElementById('idc-tipo').scrollIntoView({ block: 'center', behavior: 'instant' });
      const ps = [...document.querySelectorAll('#idc-tipo .apexcharts-pie-area')], p = ps[0], m = p.getScreenCTM();
      const bb = p.parentNode.parentNode.getBoundingClientRect(), cx = bb.left + bb.width / 2, cy = bb.top + bb.height / 2, L = p.getTotalLength();
      for (let i = 0; i < 80; i++) {
        const q = p.getPointAtLength(L * i / 80), x = q.x * m.a + q.y * m.c + m.e, y = q.x * m.b + q.y * m.d + m.f;
        for (const f of [0.08, 0.15, 0.25]) {            // un poco hacia dentro del anillo: ahí está el sector
          const px = x + (cx - x) * f, py = y + (cy - y) * f, e = document.elementFromPoint(px, py);
          if (e === p) return { x: px, y: py };
        }
      }
      return { x: cx, y: cy };
    });
    await D.page.mouse.click(punto.x, punto.y); await D.page.waitForTimeout(500);
    ok(await sel('tipo') === 1, nombre + ': un clic en un sector de la dona filtra por ese tipo');
    await D.page.evaluate(() => { const e = glacialImpactoDashboard.estado; Object.keys(e.estado.sel).forEach(k => { e.estado.sel[k] = []; }); glacialImpactoDashboard.refrescar(); });
    await D.page.waitForTimeout(900);

    /* tiempo real: se actualiza en sitio (misma instancia) y no se acumulan */
    const antes = await D.page.evaluate(() => ({ inst: glacialGraficosBase.REG.apex['idc-marca'].inst, n: Object.values(glacialGraficosBase.graficosActivos()).reduce((a, l) => a + l.length, 0) }).n);
    const mismas = await D.page.evaluate(async () => {
      const ids = ['idc-marca', 'idc-linea', 'idc-causa', 'idc-maquina', 'idc-tipo'];
      const previas = ids.map(id => glacialGraficosBase.REG.apex[id] && glacialGraficosBase.REG.apex[id].inst);
      for (let i = 0; i < 6; i++) { glacialImpactoDashboard.estado.vista && glacialImpactoDashboard.refrescar(); await new Promise(r => setTimeout(r, 480)); }
      return ids.map((id, i) => !!previas[i] && glacialGraficosBase.REG.apex[id] && glacialGraficosBase.REG.apex[id].inst === previas[i]).every(Boolean);
    });
    const despues = await D.page.evaluate(() => Object.values(glacialGraficosBase.graficosActivos()).reduce((a, l) => a + l.length, 0));
    ok(mismas, nombre + ': tras 6 refrescos en vivo los gráficos son LAS MISMAS instancias (se actualizan en sitio, sin parpadeo)');
    ok(antes === despues && despues >= 10, nombre + ': no se acumulan instancias (' + despues + ')');
    /* cambiar de pestaña interna y volver: sigue dibujado */
    await D.page.click('[data-id-tab="resumen"]'); await D.page.waitForTimeout(500);
    await D.page.click('[data-id-tab="perdidas"]'); await D.page.waitForTimeout(600);
    m = await medir(PERDIDAS);
    ok(PERDIDAS.every(id => m[id] && m[id].dibujado && m[id].dentro), nombre + ': al volver a la pestaña interna los gráficos siguen dibujados y dentro de su tarjeta');
    await D.page.evaluate(() => { document.getElementById('tab-content').innerHTML = ''; graficosDestruirTodo(); });
    ok(await D.page.evaluate(() => Object.values(glacialGraficosBase.graficosActivos()).reduce((a, l) => a + l.length, 0)) === 0, nombre + ': al salir de la pantalla no queda ninguna instancia');
    ok(D.errores.length === 0, nombre + ': sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
    if (process.env.GLX_CAPTURAS) {
      await D.page.evaluate(() => { glacialImpactoDashboard.render(document.getElementById('tab-content')); });
      await D.page.click('[data-id-tab="resumen"]'); await D.page.waitForSelector('#idc-evolucion svg'); await D.page.waitForTimeout(700);
      await D.page.screenshot({ path: process.env.GLX_CAPTURAS + '/graficos-fase3-' + w + '-resumen.png', fullPage: true });
      await D.page.click('[data-id-tab="perdidas"]'); await D.page.waitForTimeout(800);
      await D.page.screenshot({ path: process.env.GLX_CAPTURAS + '/graficos-fase3-' + w + '-perdidas.png', fullPage: true });
    }
    await D.page.context().close();
  }
  await H.cerrar();
  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})();
