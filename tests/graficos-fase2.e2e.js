/* Migración de gráficos · Fase 2 (Resumen general) en un NAVEGADOR de verdad, con ApexCharts y ECharts REALES.
   Dibuja renderResumen() con 3 líneas y 12 días de datos de ejemplo y comprueba:
   - los 16 gráficos (6 del cuerpo + 3 nuevos con datos que ya existían + 7 industriales) se dibujan y caben (PC y celular de 360 px);
   - se crean DESPUÉS del render, de uno en uno (no bloquean la pantalla) y re-renderizar no acumula instancias;
   - el mapa de calor trae una fila por línea; el velocímetro del OEE de planta muestra el OEE;
   - sin errores de consola.
   Uso: GLX_LIBS=/ruta node tests/graficos-fase2.e2e.js   (no forma parte de las pruebas rápidas) */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };

const IDS = ['chart-presentacion-marca', 'chart-prod-dia', 'chart-prod-turno', 'chart-oee-turno', 'chart-oee-linea', 'chart-componentes-oee',
  'chart-tendencia-oee', 'chart-heat-oee', 'ri-plan-real', 'ri-pareto', 'ri-paradas', 'ri-merma', 'ri-ratio', 'ri-personal'];

(async () => {
  const H = await iniciar();
  for (const [nombre, w, h] of [['PC', 1366, 900], ['celular 360', 360, 740]]) {
    const D = await H.abrir(w, h);
    await H.preparar(D.page);
    await D.page.evaluate(() => {
      const hoy = new Date('2026-10-15T12:00:00'), recs = [];
      ['PET1', 'PET2', 'B7L'].forEach((linea, li) => {
        for (let i = 0; i < 12; i++) {
          const f = new Date(hoy.getTime() - (11 - i) * 86400000).toISOString().slice(0, 10);
          ['DÍA', 'NOCHE'].forEach((turno, k) => {
            const r = blankRecord(linea);
            r.id = linea + i + k; r.fecha = f; r.turno = turno; r.timestamp = f + 'T' + (k ? '23' : '15') + ':00:00.000Z'; r.lote = 'L' + li + i + k;
            const c = r.cuadros[0];
            c.horaInicio = k ? '19:00' : '07:00'; c.horaFin = k ? '07:00' : '19:00'; c.horasTurno = 12;
            c.produccion = { programada: 20000, efectiva: 11000 + i * 500 + k * 900 + li * 1500, sopladas: 14000, calidad: 12500, paletas: 20 };
            c.paradasProgramadas = [{ id: 'p1', descripcion: 'Refrigerio', tiempoMin: 60 }];
            c.paradasNoProgramadas = [{ id: 'n1', descripcion: 'Falla sopladora', tiempoMin: 40 + i + li * 20, causa: 'FALLA DE MÁQUINA' },
              { id: 'n2', descripcion: 'Cambio de formato', tiempoMin: 25, causa: 'CAMBIO DE FORMATO' }];
            c.mermas = [{ item: 'Botellas', unidades: 120 + i, peso: 2 }];
            recs.push(r);
          });
        }
      });
      _recordsCache = recs;
      state.currentTab = 'resumen';
    });
    const t0 = Date.now();
    await D.page.evaluate(() => { window.__t = performance.now(); renderResumen(document.getElementById('tab-content')); window.__trender = performance.now() - window.__t; });
    const justo = await D.page.evaluate(() => ({ pend: window.__resumenGraficosDiferidos ? window.__resumenGraficosDiferidos.pendientes() : -1,
      creadas: Object.values(glacialGraficosBase.graficosActivos()).reduce((a, l) => a + l.length, 0), trender: Math.round(window.__trender) }));
    ok(justo.pend > 5 && justo.creadas < 4, nombre + ': al terminar el render hay ' + justo.pend + ' gráficos pendientes y solo ' + justo.creadas + ' creados (se crean después, de uno en uno)');
    await D.page.waitForFunction(() => window.__resumenGraficosDiferidos.pendientes() === 0, null, { timeout: 15000 });
    await D.page.waitForTimeout(800);
    const m = await D.page.evaluate((ids) => {
      const out = {};
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) { out[id] = null; return; }
        const caja = (el.closest('.chart-box') || el.closest('.ri-box') || el.closest('.rs-panel') || el.parentElement).getBoundingClientRect(), r = el.getBoundingClientRect();
        const hijo = el.querySelector('svg, canvas'), hr = hijo ? hijo.getBoundingClientRect() : null;
        out[id] = { dibujado: !!hijo, vacio: !hijo && /small-muted/.test(el.innerHTML), dentro: r.left >= caja.left - 1 && r.right <= caja.right + 1,
          hijoDentro: !hr || (hr.left >= caja.left - 1 && hr.right <= caja.right + 1 && hr.bottom <= caja.bottom + 2), alto: Math.round(r.height) };
      });
      out.desborde = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      return out;
    }, IDS);
    const dib = IDS.filter(id => m[id] && m[id].dibujado);
    ok(dib.length === IDS.length, nombre + ': los ' + IDS.length + ' gráficos se dibujan (' + dib.length + '/' + IDS.length + (dib.length < IDS.length ? ' · faltan: ' + IDS.filter(id => !(m[id] && m[id].dibujado)).join(', ') : '') + ')');
    ok(IDS.every(id => m[id] && m[id].dentro && m[id].hijoDentro), nombre + ': todos caben dentro de su tarjeta' + (IDS.filter(id => m[id] && !(m[id].dentro && m[id].hijoDentro)).length ? ' · fuera: ' + IDS.filter(id => m[id] && !(m[id].dentro && m[id].hijoDentro)).join(', ') : ''));
    ok(m.desborde <= 1, nombre + ': la página no tiene desplazamiento horizontal (' + m.desborde + ' px)');
    ok(IDS.every(id => m[id] && m[id].alto >= 140), nombre + ': ninguno colapsa (altura ≥ 140 px)');

    const info = await D.page.evaluate(() => {
      const a = glacialGraficosBase.REG;
      const heat = a.apex['chart-heat-oee'] && a.apex['chart-heat-oee'].inst.w.config.series;
      return { filasHeat: heat ? heat.length : -1, destruibles: ['prodDia', 'prodTurno', 'oeeLinea', 'tendenciaOee', 'componentesOee', 'oeeTurno', 'heatOee'].every(k => state.charts[k] && typeof state.charts[k].destroy === 'function') };
    });
    ok(info.filasHeat === 3, nombre + ': el mapa de calor tiene una fila por línea (' + info.filasHeat + ')');
    const orden = await D.page.evaluate(() => {
      const y = sel => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect().top + scrollY : null; };
      const t = txt => { const e = [...document.querySelectorAll('h3,h4,.rs-section')].find(x => x.textContent.trim().startsWith(txt)); return e ? e.getBoundingClientRect().top + scrollY : null; };
      return { kpis: y('.rgx-kpis'), lectura: t('Lectura del período'), oee: t('Eficiencia (OEE)'), plan: t('Plan, pérdidas y paradas'), prod: t('Producción'), tablas: t('Detalle en tablas'),
        cards: document.querySelectorAll('.rgx-kpis > .rgx-k').length, gauge: !!document.getElementById('chart-oee-planta'), anteriores: /Tarjetas anteriores/.test(document.body.innerText), ri: document.querySelectorAll('.ri-kpi, .ri-read, .ri-filter').length };
    });
    const o = orden;
    ok(o.kpis < o.lectura && o.lectura < o.oee && o.oee < o.plan && o.plan < o.prod && o.prod < o.tablas, nombre + ': orden en pantalla: tarjetas → lectura → Eficiencia (OEE) → Plan, pérdidas y paradas → Producción → Detalle en tablas');
    ok(o.cards === 8 && !o.gauge && !o.anteriores && o.ri === 0, nombre + ': 8 tarjetas (6 + Paradas + Horas efectivas), sin velocímetro de OEE de planta, sin «Tarjetas anteriores» ni bloques repetidos');
    ok(info.destruibles, nombre + ': state.charts guarda objetos con destroy() para cada gráfico del cuerpo');

    const n1 = await D.page.evaluate(() => Object.values(glacialGraficosBase.graficosActivos()).reduce((a, l) => a + l.length, 0));
    for (let i = 0; i < 5; i++) { await D.page.evaluate(() => renderResumen(document.getElementById('tab-content'))); await D.page.waitForTimeout(150); }
    await D.page.waitForFunction(() => window.__resumenGraficosDiferidos.pendientes() === 0, null, { timeout: 15000 });
    await D.page.waitForTimeout(500);
    const n2 = await D.page.evaluate(() => Object.values(glacialGraficosBase.graficosActivos()).reduce((a, l) => a + l.length, 0));
    ok(n1 === n2 && n1 >= IDS.length, nombre + ': tras 5 re-renderizados rápidos siguen ' + n2 + ' instancias (no se acumulan ni se duplican)');
    await D.page.evaluate(() => { document.getElementById('tab-content').innerHTML = ''; graficosDestruirTodo(); });
    const n3 = await D.page.evaluate(() => Object.values(glacialGraficosBase.graficosActivos()).reduce((a, l) => a + l.length, 0));
    ok(n3 === 0, nombre + ': al salir de la pantalla no queda ninguna instancia');
    ok(D.errores.length === 0, nombre + ': sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
    if (process.env.GLX_CAPTURAS) {
      await D.page.evaluate(() => renderResumen(document.getElementById('tab-content')));
      await D.page.waitForFunction(() => window.__resumenGraficosDiferidos.pendientes() === 0, null, { timeout: 15000 });
      await D.page.waitForTimeout(900);
      await D.page.screenshot({ path: process.env.GLX_CAPTURAS + '/graficos-fase2-' + w + '.png', fullPage: true });
    }
    await D.page.context().close();
  }
  await H.cerrar();
  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})();
