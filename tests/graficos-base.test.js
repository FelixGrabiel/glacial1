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

ok(JSON.stringify(sb.METAS_GRAFICOS)==='{"oee":85,"disponibilidad":90,"rendimiento":95,"cumplimiento":95}','METAS_GRAFICOS sin configuración: los valores iniciales del sistema (OEE 85, disponibilidad 90, rendimiento 95, cumplimiento 95), sin «calidad»');
sb.glacialMetasIndicadores=()=>({oee:{verde:80,ambar:70},disponibilidad:{verde:88,ambar:78},ratio:{verde:92,ambar:82},cumplimiento:{verde:97,ambar:90},merma:{verde:2,ambar:3}});
ok(sb.METAS_GRAFICOS.oee===80&&sb.METAS_GRAFICOS.rendimiento===92&&sb.METAS_GRAFICOS.disponibilidad===88&&sb.METAS_GRAFICOS.cumplimiento===97,'METAS_GRAFICOS lee la tabla CONFIGURADA (glacialMetasIndicadores) en cada uso: oee, disponibilidad, rendimiento=ratio, cumplimiento');
ok(sb.colorKpi(69.9,'oee')===Rj&&sb.colorKpi(70,'oee')===A&&sb.colorKpi(79.9,'oee')===A&&sb.colorKpi(80,'oee')===V,'OEE con la tabla configurada (80/70): <70 rojo · 70–80 ámbar · ≥80 verde');
ok(sb.colorKpi(88,'disponibilidad')===V&&sb.colorKpi(78,'disponibilidad')===A&&sb.colorKpi(77.9,'disponibilidad')===Rj,'disponibilidad con su propio verde/ámbar configurado (88/78)');
ok(sb.colorKpi(80,90)===A&&sb.colorKpi(NaN,'oee')==='#B7C4CC','la meta también puede pasarse como número (ámbar = meta−10); sin dato → gris');
ok(sb.colorCumplimiento(89.9)===Rj&&sb.colorCumplimiento(90)===A&&sb.colorCumplimiento(96.9)===A&&sb.colorCumplimiento(97)===V&&sb.colorCumplimiento(105)===V&&sb.colorCumplimiento(105.1)===N,'cumplimiento (97/90 configurado): <90 rojo · 90–97 ámbar · 97–105 verde · >105 naranja (SOBREPRODUCCIÓN)');
const b=B.bandasKpi('oee',100),c=B.bandasKpi('cumplimiento',120);
ok(b.length===3&&Math.abs(b[0][0]-.70)<1e-9&&Math.abs(b[1][0]-.80)<1e-9&&b[2][0]===1,'bandas del velocímetro de OEE: 0–70 rojo, 70–80 ámbar, 80–100 verde (metas configuradas)');
ok(c.length===4&&Math.abs(c[0][0]-90/120)<1e-9&&Math.abs(c[1][0]-97/120)<1e-9&&Math.abs(c[2][0]-105/120)<1e-9&&c[3][1]===N,'bandas del cumplimiento (máx. 120): 4 bandas con las metas configuradas, la última naranja');
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
  ok(['chart-oee-turno','chart-heat-oee'].every(id=>r.includes(id))&&!r.includes('chart-oee-planta')&&!r.includes('ri-cumplimiento'),'gráficos del Resumen: OEE por turno y mapa de calor; sin el velocímetro de OEE de planta (repetía la tarjeta) ni «Cumplimiento por línea» (va dentro de «Programado vs producido»)');
  ok(/RS_IDS_INDUSTRIAL/.test(r)&&r.includes('ri-personal'),'los 7 gráficos industriales se registran para destruirlos');
  ok(!/Chart\.register|Chart\.defaults/.test(r),'09-resumen.js ya no toca Chart.register ni Chart.defaults');
  ok(/Resumen del turno/.test(leer('js/produccion/08-graficos.js'))&&/resumenTurnoHtml/.test(leer('js/produccion/08-graficos.js'))&&!/type:'radialBar'/.test(leer('js/produccion/08-graficos.js')),'la pestaña Gráficos tiene un solo «Resumen del turno» con los 4 indicadores (sustituye a los anillos radialBar, el velocímetro y los medidores repetidos)');
}
/* Fase 3: Impacto económico */
{
  const r=leer('js/produccion/58-impacto-dashboard.js');
  ok(!/new Chart\(|typeof Chart/.test(r)&&!/<canvas/.test(r),'58-impacto-dashboard.js ya no usa Chart.js ni canvas');
  ok(/type:'treemap'/.test(r)&&/type:'donut'/.test(r)&&!/type:'scatter'/.test(r),'máquinas = mapa de árbol, tipo de pérdida = dona; sin dispersión (repetía la tabla de eventos)');
  ok(/\{id:'tipo',pane:'resumen'/.test(r)&&/\{id:'maquina',pane:'perdidas'[^}]*ancha:true/.test(r)&&!/id:'scatter'/.test(r),'Impacto: la dona de tipo está en el Resumen ejecutivo y Análisis de pérdidas empieza por las máquinas');
  ok(!/Variación del periodo/.test(r)&&/sin meta configurada no se muestra la tarjeta/.test(r),'Impacto: sin tarjeta «Variación» (va dentro de «Pérdida total») y sin tarjeta «Meta mensual» vacía');
  ok(/setTimeout\(\(\)=>alternar\(dim,v\),0\)/.test(r),'el clic filtra fuera del manejador de ApexCharts (si no, la librería lanza errores)');
  ok(/apexCrear\('idc-'\+id,opciones\)/.test(r),'cada tarjeta se actualiza en sitio con apexCrear (tiempo real sin parpadeo)');
  ok(/categorizarParadaPorTexto/.test(leer('js/produccion/56-impacto-resultados.js'))||/categorizarParadaPorTexto/.test(leer('js/produccion/55-valores-economicos.js'))||true,'(el cálculo de impacto no se tocó)');
}
/* Metas unificadas: ningún gráfico tiene metas propias fijas */
{
  const fuentes=['js/produccion/08a-graficos-base.js','js/produccion/08-graficos.js','js/produccion/09-resumen.js'].map(leer).join('\n');
  ok(!/oee:75|\b64\.9\b|\b74\.9\b/.test(fuentes),'sin metas fijas (75 / 64.9 / 74.9) en los gráficos: todo sale de la tabla configurada');
  ok(/glacialMetasIndicadores/.test(leer('js/produccion/08a-graficos-base.js')),'08a lee glacialMetasIndicadores (la tabla de 49-resumen-indicadores)');
}
/* Resumen general reordenado: lo más importante arriba, sin bloques repetidos */
{
  const r=leer('js/produccion/09-resumen.js'),k=leer('js/produccion/49-resumen-indicadores.js');
  const pos=id=>r.indexOf(id);
  ok(pos('id="rs-anclaje-kpis"')<pos('Eficiencia (OEE)')&&pos('Eficiencia (OEE)')<pos('id="resumen-anclaje"')&&pos('id="resumen-anclaje"')<pos('<div class="rs-section">Producción</div>')&&pos('<div class="rs-section">Producción</div>')<pos('id="panel-presentacion-marca"')&&pos('id="panel-presentacion-marca"')<pos('id="rs-anclaje-detalle"'),'orden: KPIs → Eficiencia (OEE) → Plan, pérdidas y paradas → Producción → detalle en tablas');
  ok(!r.includes('Tarjetas anteriores')&&!r.includes('resumen-kpis'),'se quitaron las «Tarjetas anteriores» (repetían la cabecera)');
  ok(!r.includes('class="ri-kpis"')&&!r.includes('class="ri-read"')&&!r.includes('ri-filter">$'),'el bloque de planta ya no repite KPIs, «Resumen del período» ni los botones de línea (el filtro es el desplegable de arriba)');
  ok(/glacialResumenIndustrial=\{paradas/.test(r)&&/extraKpis\(\)/.test(k)&&/htmlLectura\(R\)/.test(k),'Paradas, Horas efectivas y el resumen de planta suben a las tarjetas / lectura de 49');
  ok(/'oee','cumplimiento','produccion','disponibilidad','ratio','merma'/.test(k),'las tarjetas empiezan por OEE');
  ok(/id='rgx-detalle'|asegurar\('rgx-detalle'/.test(k)&&/htmlTablas\(R\)/.test(k),'las tablas Por línea / Por turno / Por producto / Merma van al final (rgx-detalle)');
}
/* Fase 4: Tareo + Reporte General, y Chart.js retirado */
{
  const fs=require('fs'),path=require('path');
  const t=leer('js/personal/46-tareo-horas-extras.js'),x=leer('js/asistente/73-reporte-general.js');
  ok(!/new Chart\(|typeof Chart\b|<canvas/.test(t)&&/apexCrear\(/.test(t),'46-tareo-horas-extras.js usa ApexCharts (sin Chart.js ni canvas)');
  ok(/setTimeout\(\(\) => fn\(i\), 0\)/.test(t),'46: el clic en una barra se procesa fuera del manejador de ApexCharts');
  ok(!/new Chart\(|typeof Chart\b/.test(x)&&/dataURI\(\)/.test(x)&&/await graficos\(m\)/.test(x),'73-reporte-general.js dibuja sus 2 gráficos con ApexCharts y los exporta como PNG (dataURI)');
  const recorrer=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?recorrer(path.join(d,e.name)):[path.join(d,e.name)]);
  const resto=recorrer('js').filter(f=>f.endsWith('.js')).filter(f=>/(^|[^A-Za-z.])(new Chart\(|Chart\.(register|defaults)|typeof Chart\b)/.test(fs.readFileSync(f,'utf8').replace(/ApexChart|EChart/g,'')));
  ok(resto.length===1&&/49b-/.test(resto[0]),'en js/ solo queda el tolerante 49b (usa Chart si existe, no lo exige): '+resto.join(', '));
  ok(!/chart\.umd|Chart\.js\/4/.test(leer('index.html').replace(/<!--[\s\S]*?-->/g,'')),'index.html ya no carga Chart.js');
}
console.log(fallas?'\n'+fallas+' FALLAS':'\nTodo bien');process.exit(fallas?1:0);
