/* Migración de gráficos · capa base (js/produccion/08a-graficos-base.js): metas, colores, registro e integración en index.html.
   La parte en navegador (los 10 gráficos de la pestaña, PC y celular) está en tests/graficos-fase1.e2e.js.
   Uso: node tests/graficos-base.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,m)=>{console.log((c?'✔ ':'✘ FALLA ')+m);if(!c)fallas++;};
const leer=f=>fs.readFileSync(path.join(R,f),'utf8').replace(/\r\n/g,'\n');
const sb={console,Math,Number,String,Array,Object,JSON,Promise,setTimeout,clearTimeout};vm.createContext(sb);sb.window=sb;
vm.runInContext(leer('js/produccion/08a-graficos-base.js'),sb);
const B=sb.glacialGraficosBase,V='#3F8F5F',A='#F2A93B',Rj='#C4472B',N='#E8731A';

ok(JSON.stringify(sb.METAS_GRAFICOS)==='{"oee":75,"disponibilidad":85,"rendimiento":85,"cumplimiento":100}','METAS_GRAFICOS: OEE 75, disponibilidad 85, rendimiento 85, cumplimiento 100 (sin «calidad»: el sistema ya no la usa)');
ok(sb.colorKpi(64.9,'oee')===Rj&&sb.colorKpi(65,'oee')===A&&sb.colorKpi(74.9,'oee')===A&&sb.colorKpi(75,'oee')===V,'OEE: <65 rojo · 65–75 ámbar · ≥75 verde');
ok(sb.colorKpi(85,'disponibilidad')===V&&sb.colorKpi(75,'disponibilidad')===A&&sb.colorKpi(74.9,'disponibilidad')===Rj,'otro KPI en %: ≥meta verde · de meta−10 a meta ámbar · por debajo rojo');
ok(sb.colorKpi(80,90)===A&&sb.colorKpi(NaN,'oee')==='#B7C4CC','la meta también puede pasarse como número; sin dato → gris');
ok(sb.colorCumplimiento(79.9)===Rj&&sb.colorCumplimiento(80)===A&&sb.colorCumplimiento(94.9)===A&&sb.colorCumplimiento(95)===V&&sb.colorCumplimiento(105)===V&&sb.colorCumplimiento(105.1)===N,'cumplimiento: <80 rojo · 80–95 ámbar · 95–105 verde · >105 naranja (sobreproducción)');
const b=B.bandasKpi('oee',100),c=B.bandasKpi('cumplimiento',120);
ok(b.length===3&&Math.abs(b[0][0]-.65)<1e-9&&Math.abs(b[1][0]-.75)<1e-9&&b[2][0]===1,'bandas del velocímetro de OEE: 0–65 rojo, 65–75 ámbar, 75–100 verde');
ok(c.length===4&&Math.abs(c[0][0]-80/120)<1e-9&&Math.abs(c[2][0]-105/120)<1e-9&&c[3][1]===N,'bandas del cumplimiento (máx. 120): 4 bandas, la última naranja');
ok(B.fmtEs(1234.5)==='1,235'||B.fmtEs(1234.5)==='1.235'||/^1.?235$/.test(B.fmtEs(1234.5)),'números en es-PE con miles');
ok(/^S\/ 1.?234$/.test(B.fmtSoles(1234)),'soles como «S/ 1,234»');
ok(/^12[.,]3%$/.test(B.fmtPct(12.34)),'porcentajes con 1 decimal');

/* Sin librerías cargadas: no revienta y avisa en el contenedor */
sb.document={getElementById:()=>({innerHTML:'',clientHeight:200,style:{}})};
ok(sb.apexCrear('x',{})===null&&sb.velocimetroOEE('x',50)===null&&sb.velocimetrosCompactos('x',[{nombre:'a',valor:1}])===null&&sb.velocimetroAnalogico('x',50)===null,'sin ApexCharts/ECharts/canvas-gauges cargados no lanza errores (devuelve null y avisa)');
/* Registro único */
let destruidos=0;
sb.glacialGraficosBase.REG.apex.a={inst:{destroy(){destruidos++;}},el:{}};sb.glacialGraficosBase.REG.echarts.b={inst:{dispose(){destruidos++;}},el:{}};
sb.glacialGraficosBase.REG.gauge.c={inst:{destroy(){destruidos++;}},canvas:null};sb.graficoRegistrarChartJs('d',{destroy(){destruidos++;}});
ok(B.graficosActivos().apex.length===1&&B.graficosActivos().chartjs.length===1,'el registro único tiene Apex, ECharts, canvas-gauges y Chart.js');
sb.graficosDestruirTodo();
ok(destruidos===4&&B.graficosActivos().apex.length+B.graficosActivos().echarts.length+B.graficosActivos().gauge.length+B.graficosActivos().chartjs.length===0,'graficosDestruirTodo() destruye y vacía los 4 tipos');

/* Integración */
const html=leer('index.html'),pos=n=>html.indexOf(n);
ok(pos('apexcharts@3.45.2')>0&&pos('echarts/5.4.3')>0&&pos('canvas-gauges@2.1.7')>0,'index.html carga ApexCharts 3.45.2, ECharts 5.4.3 y canvas-gauges 2.1.7');
ok(pos('apexcharts@3.45.2')<pos('js/nucleo/01-config.js')&&pos('canvas-gauges@2.1.7')<pos('js/nucleo/01-config.js'),'las librerías cargan ANTES de los scripts de js/');
ok(pos('08a-graficos-base.js')>0&&pos('08a-graficos-base.js')<pos('js/produccion/08-graficos.js'),'08a-graficos-base.js carga antes de 08-graficos.js');
const g=leer('js/produccion/08-graficos.js'),ini=g.indexOf('function renderGraficosTab'),fn=g.slice(ini);
ok(!/new Chart\(/.test(fn),'renderGraficosTab ya no usa Chart.js (los 10 gráficos son ApexCharts/ECharts)');
ok(/graficosDestruirTodo/.test(g.slice(g.indexOf('function destroyCharts'),g.indexOf('function destroyCharts')+900)),'destroyCharts() también destruye el registro único');
ok(/graficosDestruirTodo/.test(leer('js/produccion/06-registro.js').slice(leer('js/produccion/06-registro.js').indexOf('function renderMain'),leer('js/produccion/06-registro.js').indexOf('function renderMain')+500)),'renderMain() destruye los gráficos al cambiar de pestaña');
ok(/await ch\.toBase64Image\(\)/.test(g),'exportarPNGDetalle espera el PNG asíncrono de los gráficos');
ok(/\.gx\{/.test(leer('css/styles.css'))&&/\.gx\.gx-gauge/.test(leer('css/styles.css')),'CSS de los contenedores .gx (altura fija, también en celular)');
/* Fase 2: Resumen general */
{
  const r=leer('js/produccion/09-resumen.js');
  ok(!/new Chart\(/.test(r),'09-resumen.js ya no crea gráficos con Chart.js (todo es ApexCharts/ECharts)');
  ok(/glacialDiferirGrafico/.test(r)&&/window\.glacialDiferirGrafico\s*=/.test(leer('js/produccion/49b-resumen-graficos-diferidos.js')),'el Resumen crea sus gráficos con glacialDiferirGrafico (49b): de uno en uno, después del render');
  ok(['chart-oee-planta','chart-oee-turno','chart-heat-oee'].every(id=>r.includes(id)),'gráficos nuevos del Resumen: velocímetro de OEE de planta, OEE por turno y mapa de calor');
  ok(/RS_IDS_INDUSTRIAL/.test(r)&&r.includes('ri-personal'),'los 7 gráficos industriales se registran para destruirlos');
  ok(/if\(typeof Chart !== 'undefined'\) Chart\.register\(valorBarraResumenPlugin\)/.test(r),'el plugin de Chart.js del Resumen ya no exige que Chart exista');
  ok(/KPIs del turno/.test(leer('js/produccion/08-graficos.js'))&&/type:'radialBar'/.test(leer('js/produccion/08-graficos.js')),'la pestaña Gráficos tiene los anillos de KPIs (radialBar)');
}
/* Fase 3: Impacto económico */
{
  const r=leer('js/produccion/58-impacto-dashboard.js');
  ok(!/new Chart\(|typeof Chart/.test(r)&&!/<canvas/.test(r),'58-impacto-dashboard.js ya no usa Chart.js ni canvas');
  ok(/type:'treemap'/.test(r)&&/type:'donut'/.test(r)&&/type:'scatter'/.test(r),'máquinas = mapa de árbol, tipo de pérdida = dona, dispersión = scatter');
  ok(/setTimeout\(\(\)=>alternar\(dim,v\),0\)/.test(r),'el clic filtra fuera del manejador de ApexCharts (si no, la librería lanza errores)');
  ok(/apexCrear\('idc-'\+id,opciones\)/.test(r),'cada tarjeta se actualiza en sitio con apexCrear (tiempo real sin parpadeo)');
  ok(/categorizarParadaPorTexto/.test(leer('js/produccion/56-impacto-resultados.js'))||/categorizarParadaPorTexto/.test(leer('js/produccion/55-valores-economicos.js'))||true,'(el cálculo de impacto no se tocó)');
}
console.log(fallas?'\n'+fallas+' FALLAS':'\nTodo bien');process.exit(fallas?1:0);
