/* Migración de gráficos · Fase 4 (Tareo · horas extras, y Reporte General) en un NAVEGADOR de verdad, con ApexCharts REAL.
   - Resumen de horas extras: gráfico por día y ranking se dibujan, un CLIC real en una barra abre el modal, refrescar actualiza sin acumular instancias.
   - Detalle por trabajador: vista «Horas extras» y vista «Jornada» (2 series) se dibujan; cambiar de vista no acumula instancias.
   - Reporte General: graficos(m) devuelve 2 PNG en base64 (ApexCharts fuera de pantalla), sin dejar nodos en el documento.
   - Chart.js ya no se carga y no hay errores de consola.
   Uso: GLX_LIBS=/ruta node tests/graficos-fase4.e2e.js   (no forma parte de las pruebas rápidas) */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };

(async () => {
  const H = await iniciar();
  for (const [nombre, w, h] of [['PC', 1366, 900], ['celular 360', 360, 740]]) {
    const D = await H.abrir(w, h);
    ok(await D.page.evaluate(() => typeof Chart === 'undefined'), nombre + ': Chart.js ya no se carga');
    await D.page.evaluate(() => {
      ['login-screen', 'app-screen'].forEach(i => { const e = document.getElementById(i); if (e) e.style.display = 'none'; });
      document.documentElement.style.overflow = 'auto'; document.body.style.overflow = 'auto'; document.body.style.height = 'auto';
      const P = (id, nombre, salida) => ({ trabajadorId: id, nombre, dni: '0000' + id, cargo: 'Operario', area: 'Producción', asistencia: 'Asistió', horaIngreso: '07:00', salidaRefrigerio: '12:00', retornoRefrigerio: '13:00', horaSalida: salida, horasTrabajadas: 0, horasExtras: 0, actualizadoEn: 1 });
      const tareos = [];
      for (let d = 1; d <= 9; d++) {
        const f = '2026-10-0' + d;
        tareos.push({ id: 't' + d, area: 'Producción', fecha: f, turno: 'Día', jornadaNormal: 8, horaProgramadaIngreso: '07:00', estado: 'Abierto', actualizadoEn: 1, personalPorDia: [],
          personal: [P('1', 'Ana Torres', d % 3 ? '17:00' : '16:00'), P('2', 'Luis Rojas', '16:30'), P('3', 'Carlos Vega', d % 2 ? '18:00' : '15:45'), P('4', 'Rosa Díaz', '19:00')] });
      }
      const viejo = document.getElementById('main'); if (viejo) viejo.removeAttribute('id');   // la app real está oculta: el detalle se pinta en un #main visible propio
      window.tareoAreasVisibles = () => ['Producción'];
      _tareosCache = tareos; _tareosReady = true;
      TareoHE.estado.grupo = 'Producción'; TareoHE.estado.periodo = 'mes'; TareoHE.estado.anio = 2026; TareoHE.estado.mes = 10;
      const host = document.createElement('div'); host.style.cssText = 'padding:12px;width:100%;box-sizing:border-box';
      host.innerHTML = '<div id="tareo-he-tarjeta"></div><div id="tareo-he-raiz"></div><div id="main"></div>'; document.body.appendChild(host);
    });
    await D.page.evaluate(() => TareoHE.refrescar());
    await D.page.waitForSelector('#he-g-dias svg', { timeout: 8000 });
    await D.page.waitForSelector('#he-g-rank svg', { timeout: 8000 });
    const caben = await D.page.evaluate(() => ['he-g-dias', 'he-g-rank'].map(id => { const e = document.getElementById(id), c = e.parentElement.getBoundingClientRect(), s = e.querySelector('svg').getBoundingClientRect(); return s.width > 50 && s.height > 50 && s.left >= c.left - 1 && s.right <= c.right + 1; }));
    ok(caben.every(Boolean), nombre + ': gráfico por día y ranking se dibujan y caben en su tarjeta');
    const etq = await D.page.evaluate(() => document.querySelectorAll('#he-g-dias .apexcharts-datalabel').length);
    ok(etq >= 5, nombre + ': las barras muestran su valor en horas («1 h 00 min»…) (' + etq + ' etiquetas)');
    const n1 = await D.page.evaluate(() => TareoHE.charts());
    for (let i = 0; i < 5; i++) await D.page.evaluate(() => TareoHE.refrescar());
    await D.page.waitForSelector('#he-g-dias svg');
    const n2 = await D.page.evaluate(() => TareoHE.charts() + '|' + glacialGraficosBase.graficosActivos().apex.length);
    ok(n1 === 2 && n2 === '2|2', nombre + ': tras 5 refrescos siguen 2 instancias (no se acumulan) → ' + n2);
    /* clic real en una barra → modal de jornadas del día */
    const caja = await D.page.evaluate(() => { const r = document.querySelector('#he-g-dias .apexcharts-bar-area'); r.scrollIntoView({ behavior: 'instant', block: 'center' }); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await D.page.mouse.click(caja.x, caja.y);
    await D.page.waitForTimeout(400);
    const modal = await D.page.evaluate(() => /Jornadas del/.test(document.body.innerText));
    ok(modal, nombre + ': un clic real en una barra abre «Jornadas del …»');
    await D.page.evaluate(() => { document.querySelectorAll('.modal-overlay,.modal-backdrop,.modal').forEach(e => e.remove()); });
    /* detalle por trabajador */
    const det = async (vista) => {
      await D.page.evaluate((v) => { TareoHE.estado.detalle = true; TareoHE.estado.vista = v; TareoHE.renderDetalle(); }, vista);
      await D.page.waitForSelector('#he-g-det svg', { timeout: 8000 });
      return D.page.evaluate(() => ({ barras: document.querySelectorAll('#he-g-det .apexcharts-bar-area').length, series: document.querySelectorAll('#he-g-det .apexcharts-bar-series').length, activos: glacialGraficosBase.graficosActivos().apex.length, n: TareoHE.charts() }));
    };
    const a = await det('extras'), b = await det('jornada');
    ok(a.barras >= 5 && b.series >= 1 && b.barras >= 10, nombre + ': detalle del trabajador: vista extras (' + a.barras + ' barras) y jornada con 2 series (' + b.barras + ' barras)');
    ok(a.activos === 1 && b.activos === 1 && b.n === 1, nombre + ': cambiar de vista no acumula instancias');
    await D.page.evaluate(() => { TareoHE.destruir(); });
    ok(await D.page.evaluate(() => glacialGraficosBase.graficosActivos().apex.length) === 0, nombre + ': destruir() libera todo');

    if (w === 1366) {
      const r = await D.page.evaluate(async () => {
        const antes = document.body.children.length;
        const m = { lineas: [
          { nombre: 'PET1', cuadros: [{ programado: 20000, producido: 19500 }], paradas: [{ tipo: 'Programada', minutos: 60 }, { tipo: 'No programada', minutos: 35 }] },
          { nombre: 'PET2', cuadros: [{ programado: 15000, producido: 12000 }], paradas: [{ tipo: 'No programada', minutos: 80 }] },
          { nombre: 'B7L', cuadros: [{ programado: 8000, producido: 8100 }], paradas: [] }] };
        const pngs = await glacialReporteGeneral.graficos(m);
        return { n: pngs.length, b64: pngs.every(p => /^iVBOR/.test(p) && p.length > 2000), limpio: document.body.children.length === antes };
      });
      ok(r.n === 2 && r.b64, 'Reporte General: 2 gráficos ApexCharts exportados como PNG en base64 (para ExcelJS)');
      ok(r.limpio, 'Reporte General: no deja contenedores sueltos en el documento');
    }
    ok(D.errores.length === 0, nombre + ': sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
    if (process.env.GLX_CAPTURAS && w === 1366) { await D.page.evaluate(() => TareoHE.refrescar()); await D.page.waitForTimeout(700); await D.page.screenshot({ path: process.env.GLX_CAPTURAS + '/graficos-fase4-tareo.png', fullPage: true }); }
    await D.page.context().close();
  }
  await H.cerrar();
  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})();
