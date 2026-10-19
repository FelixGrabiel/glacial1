/* Pestaña Gráficos de una línea y «PNG con gráficos (detalle)»: orden por importancia, sin gráficos repetidos y sin tocar Exportar PNG ni el Excel.
   node tests/graficos-orden.test.js */
'use strict';
const fs=require('fs'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const f08=leer('js/produccion/08-graficos.js');
const trozo=(ini,fin)=>{const a=f08.indexOf(ini),b=f08.indexOf(fin,a+1);return a>=0&&b>a?f08.slice(a,b):'';};

/* ---------- pantalla ---------- */
const pantalla=trozo('function renderGraficosTab(){','GRÁFICOS NUEVOS (ApexCharts');
const html=pantalla.slice(pantalla.indexOf('<div class="chart-grid">'));
const orden=['id="chart-oee"','id="chart-componentes"','id="chart-marca-prod"','id="chart-cascada"','id="chart-paradas"','id="chart-mermas"','id="chart-tendencia"','id="chart-turno"','id="chart-marca"','id="chart-insumos"','id="reporte-analisis-accion"'];
const pos=orden.map(k=>html.indexOf(k));
ok(pos.every(p=>p>=0)&&pos.every((p,i)=>i===0||p>pos[i-1]),'pantalla: OEE y componentes (medidores) → producción por marca → cascada y Pareto → mermas → tendencia → OEE por turno y marca → insumos → análisis y acción (al final)');
ok(!/chart-kpis|chart-prod"|resumen-turno/.test(html)&&!/type:'radialBar'/.test(f08),'pantalla: ya no están los anillos de KPIs (repetían los medidores) ni el gráfico nominal/programada/efectiva; se conservan el velocímetro de OEE y los 3 medidores');
const codigo=f08.slice(f08.indexOf('GRÁFICOS NUEVOS (ApexCharts'));
const claves=[...codigo.matchAll(/registrarGx\('([a-z-]+)'/g)].map(m=>m[1]);
ok(['oee','componentes','marcaprod','cascada','paradas','mermas','insumos','tendencia','turno','marca'].every(k=>claves.includes(k))&&!['kpis','prod'].some(k=>claves.includes(k)),'gráficos registrados: los 10 que quedan (OEE y componentes como medidores, «marcaprod» nuevo) y ninguno de los repetidos');
ok(/state\.charts\.cascada|ids=\['chart-cascada','chart-paradas','chart-mermas'\]/.test(f08)&&claves.includes('cascada')&&claves.includes('paradas')&&claves.includes('mermas'),'cascada, Pareto y mermas siguen registrados para el PNG de detalle');
ok(/agruparProduccionPorMarca\(rec\)/.test(codigo)&&/chart-marca-prod/.test(html),'«Producción por marca» usa los mismos datos que «Marcas producidas» del PNG (agruparProduccionPorMarca)');
ok(/cascada-datos/.test(codigo)&&/Nominal/.test(codigo)&&/Programada/.test(codigo)&&/Efectiva/.test(codigo),'nominal, programada y efectiva quedan como datos bajo la cascada');
ok(/type:'bar'[\s\S]{0,200}horizontal:true[\s\S]{0,400}mermasOrden/.test(codigo.slice(codigo.indexOf("registrarGx('mermas'"),codigo.indexOf("registrarGx('mermas'")+1200))||/mermasOrden[\s\S]{0,300}horizontal:true/.test(codigo),'mermas: barras horizontales ordenadas de mayor a menor (ya no área polar)');
ok(/velocimetroOEE\('chart-oee'/.test(codigo)&&/velocimetrosCompactos\('chart-componentes'/.test(codigo)&&/oeeRed >= METAS_GRAFICOS\.oee/.test(pantalla),'los medidores usan las metas configuradas y el texto «pts por debajo» compara el valor redondeado');

/* ---------- PNG con gráficos (detalle) ---------- */
const png=trozo('async function exportarPNGDetalle(){','\nfunction ',);
const png2=f08.slice(f08.indexOf('async function exportarPNGDetalle(){'),f08.indexOf('function renderGraficosTab(){'));
const t=['RESUMEN DEL TURNO','MARCAS PRODUCIDAS','¿DÓNDE SE PERDIÓ LA PRODUCCIÓN?','PARETO DE PARADAS','MERMA DE INSUMOS','CONSUMO DE INSUMOS','ANÁLISIS Y ACCIÓN PARA MAÑANA'].map(k=>png2.indexOf(k));
ok(t.every(p=>p>=0)&&t.every((p,i)=>i===0||p>t[i-1]),'PNG de detalle: resumen → marcas producidas → cascada y Pareto → merma e insumos → análisis y acción (al final)');
ok(!/LECTURA DEL DÍA|PRODUCCIÓN DEL TURNO'/.test(png2),'PNG de detalle: se quitan «Lectura del día» y la tarjeta «Producción del turno» (repetían el resumen)');
ok(/H=Math\.max\(1400,/.test(png2)&&/filasMarcasN/.test(png2),'PNG de detalle: la altura sigue al número de marcas (no se corta)');

/* ---------- lo que NO cambia ---------- */
ok(/async function exportarPNG\(\)\{\n  if\(window\.glacialReporteRegistro&&typeof window\.glacialReporteRegistro\.exportar==='function'\)return window\.glacialReporteRegistro\.exportar\(\);/.test(f08),'«Exportar PNG» sigue usando la plantilla aprobada (glacialReporteRegistro.exportar)');
ok(/onclick="exportarExcel\(\)"/.test(f08)&&/async function exportarExcel\(\)/.test(f08)&&/onclick="exportarPNG\(\)"/.test(f08)&&/onclick="exportarPNGDetalle\(\)"/.test(f08),'los tres botones de exportación siguen en la pestaña');
console.log(fallas?fallas+' fallas':'todo correcto');
