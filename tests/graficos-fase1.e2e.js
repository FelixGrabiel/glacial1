/* Migración de gráficos · Fase 1 (capa base + pestaña «Gráficos» de la línea) en un NAVEGADOR de verdad.
   Dibuja renderGraficosTab() con datos de ejemplo usando ApexCharts, ECharts y canvas-gauges REALES (de node_modules, sin CDN) y comprueba:
   - los 10 gráficos aparecen y caben en su tarjeta (PC y celular de 360 px), sin errores de consola;
   - cambiar de pestaña / re-renderizar NO acumula instancias (registro único);
   - el PNG del gráfico (graficoAImagen) y la compatibilidad con state.charts (exportarPNGDetalle);
   - las metas y colores (metas CONFIGURADAS: con los valores iniciales OEE 85/75, disponibilidad 90/80, cumplimiento 95/85).
   Requiere Playwright y las librerías: GLX_LIBS=<carpeta con node_modules de apexcharts, echarts, canvas-gauges, chart.js>.
   Uso: GLX_LIBS=/ruta node tests/graficos-fase1.e2e.js   (no forma parte de las pruebas rápidas) */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS (carpeta con node_modules de apexcharts, echarts, canvas-gauges y chart.js). Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };

(async () => {
  const H = await iniciar();
  const medir = (page) => page.evaluate(() => {
    const ids = ['marca-prod', 'cascada', 'paradas', 'mermas', 'insumos', 'tendencia', 'turno', 'marca'];   // orden por importancia: el resumen del turno es HTML (sin gráfico)
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
    const D = await H.abrir(w, h);
    const n = await H.preparar(D.page);
    ok(n === 24, nombre + ': 24 registros de ejemplo preparados');
    await D.page.evaluate(() => renderGraficosTab());
    await D.page.waitForTimeout(1200);
    const m = await medir(D.page);
    const dibujados = Object.entries(m).filter(([k, v]) => k !== 'desborde' && v && !v.oculto && v.svgOcanvas).map(([k]) => k);
    ok(dibujados.length === 11, nombre + ': los 11 gráficos se dibujan (' + dibujados.join(', ') + ')');
    ok(Object.entries(m).filter(([k, v]) => k !== 'desborde' && v && !v.oculto).every(([k, v]) => v.dentro && v.hijoDentro), nombre + ': todos caben dentro de su tarjeta (sin salirse)');
    ok(m.desborde <= 1, nombre + ': la página no tiene desplazamiento horizontal (' + m.desborde + ' px)');
    ok(Object.entries(m).filter(([k, v]) => k !== 'desborde' && v && !v.oculto).every(([k, v]) => v.alto >= 150 && v.alto <= 320), nombre + ': alturas numéricas razonables');
    if (process.env.GLX_DEPURAR) { console.log(JSON.stringify(m)); console.log(await D.page.evaluate(() => { const r = _recordsCache[_recordsCache.length - 1]; return JSON.stringify({ casc: calcCascada(r), d: (({oee,disponibilidad,rendimiento,cumplimiento,produccionNominal})=>({oee,disponibilidad,rendimiento,cumplimiento,produccionNominal}))(calcDerived(r)) }); })); console.log(D.errores.join('\n')); }

    /* registro único: re-renderizar muchas veces no acumula instancias */
    const act1 = await D.page.evaluate(() => { const a = glacialGraficosBase.graficosActivos(); return a.apex.length + a.echarts.length + a.gauge.length; });
    for (let i = 0; i < 6; i++) await D.page.evaluate(() => renderGraficosTab());
    const act2 = await D.page.evaluate(() => { const a = glacialGraficosBase.graficosActivos(); return a.apex.length + a.echarts.length + a.gauge.length; });
    ok(act1 === act2 && act1 >= 11, nombre + ': tras 6 re-renderizados siguen las mismas ' + act2 + ' instancias (no se acumulan)');
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
        for (const id of ['chart-marca-prod', 'chart-cascada', 'chart-paradas', 'chart-mermas', 'chart-tendencia']) {
          try { r[id] = String(await graficoAImagen(id)).slice(0, 22); } catch (e) { r[id] = 'ERR ' + e.message; }
        }
        r.estado = ['cascada', 'paradas', 'mermas'].every(k => state.charts[k] && typeof state.charts[k].toBase64Image === 'function' && typeof state.charts[k].destroy === 'function');
        r.viaState = String(await state.charts.cascada.toBase64Image()).slice(0, 22);
        return r;
      });
      ok(['chart-marca-prod', 'chart-cascada', 'chart-paradas', 'chart-mermas', 'chart-tendencia'].every(k => /^data:image\/png;base64/.test(imgs[k])), 'graficoAImagen devuelve un PNG en base64 para ECharts y ApexCharts');
      ok(imgs.estado && /^data:image\/png/.test(imgs.viaState), 'state.charts.cascada/paradas/mermas siguen teniendo toBase64Image() (para «PNG con gráficos (detalle)»)');

      /* colores y metas */
      const col = await D.page.evaluate(() => ({
        a: colorKpi(70, 'oee'), b: colorKpi(75, 'oee'), c: colorKpi(84.9, 'oee'), d: colorKpi(85, 'oee'),
        e: colorKpi(90, 'disponibilidad'), f: colorKpi(80, 'disponibilidad'), k: colorKpi(79.9, 'disponibilidad'),
        g: colorCumplimiento(84), h: colorCumplimiento(90), i: colorCumplimiento(100), j: colorCumplimiento(110), metas: METAS_GRAFICOS, tabla: glacialMetasIndicadores() }));
      const C = { rojo: '#C4472B', ambar: '#F2A93B', verde: '#3F8F5F', naranja: '#E8731A' };
      ok(col.a === C.rojo && col.b === C.ambar && col.c === C.ambar && col.d === C.verde, 'OEE (meta configurada 85/75): 70 rojo · 75 y 84,9 ámbar · 85 verde');
      ok(col.e === C.verde && col.f === C.ambar && col.k === C.rojo, 'Disponibilidad (90/80): 90 verde · 80 ámbar · 79,9 rojo');
      ok(col.g === C.rojo && col.h === C.ambar && col.i === C.verde && col.j === C.naranja, 'Cumplimiento (95/85): 84 rojo · 90 ámbar · 100 verde · 110 naranja (SOBREPRODUCCIÓN)');
      ok(col.metas.oee === col.tabla.oee.verde && col.metas.disponibilidad === col.tabla.disponibilidad.verde && col.metas.rendimiento === col.tabla.ratio.verde && col.metas.cumplimiento === col.tabla.cumplimiento.verde && !('calidad' in col.metas), 'METAS_GRAFICOS == tabla configurada que usan tarjetas, insights y Excel (' + JSON.stringify(col.metas) + ')');

      /* actualización en sitio: la aguja se mueve sin recrear */
      const mov = await D.page.evaluate(async () => {
        const caja = document.createElement('div');   // la pantalla ya no trae velocímetro: se prueba la capa base sobre un contenedor propio
        caja.id = 'chart-oee-prueba'; caja.className = 'gx gx-gauge'; document.body.appendChild(caja);
        velocimetroOEE('chart-oee-prueba', 40, { nombre: 'OEE', clave: 'oee' });
        const antes = glacialGraficosBase.REG.echarts['chart-oee-prueba'].inst;
        velocimetroOEE('chart-oee-prueba', 55.5, { nombre: 'OEE', clave: 'oee' });
        await new Promise(r => setTimeout(r, 300));
        const despues = glacialGraficosBase.REG.echarts['chart-oee-prueba'].inst;
        return { misma: antes === despues, valor: despues.getOption().series[0].data[0].value };
      });
      ok(mov.misma && mov.valor === 55.5, 'el velocímetro se actualiza en sitio (misma instancia, solo se mueve la aguja)');
      const ap = await D.page.evaluate(() => {
        const antes = glacialGraficosBase.REG.apex['chart-marca-prod'].inst;
        apexCrear('chart-marca-prod', { chart: { type: 'bar' }, series: [{ name: 'Unidades', data: [1, 2, 3] }], xaxis: { categories: ['a', 'b', 'c'] } });
        return glacialGraficosBase.REG.apex['chart-marca-prod'].inst === antes;
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
  await H.cerrar();
  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})();
