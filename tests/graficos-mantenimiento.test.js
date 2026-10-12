/* Gráficos dinámicos de Mantenimiento (67i): HTML de barras, columnas y dona; globo con el dato; clic para filtrar; animación que respeta «reducir movimiento»;
   integración en Intervenciones, Indicadores, Reclasificar y el Pareto de Análisis de paradas. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');

const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,setTimeout,clearTimeout};vm.createContext(sb);sb.window=sb;
vm.runInContext(leer('js/mantenimiento/67i-graficos.js'),sb);   // sin document: no instala eventos ni estilos
const G=sb.glacialGraficos;

const b=G.barrasH([{id:'a',etiqueta:'Envasadora <x>',valor:10,color:'#d93a3a'},{id:'b',etiqueta:'Rinser',valor:5},{id:'c',etiqueta:'Cero',valor:0}],{grupo:'mi-equipo',unidad:'fallas',activo:'b'});
ok(/width:100\.0%/.test(b)&&/width:50\.0%/.test(b)&&/width:0\.0%/.test(b),'las barras son proporcionales al mayor valor');
ok(/Envasadora &lt;x&gt;/.test(b)&&!/<x>/.test(b),'los textos se escapan');
ok(/data-tip="Envasadora &lt;x&gt;: 10 fallas"/.test(b)&&/data-gm-grupo="mi-equipo" data-gm-id="a"/.test(b)&&/tabindex="0"/.test(b),'cada barra trae su globo con el dato exacto y es clicable y accesible con teclado');
ok(/gm-activo/.test(b)&&(b.match(/gm-activo/g)||[]).length===1,'resalta la barra activa (el filtro aplicado)');
ok(/animation-delay:0ms/.test(b)&&/animation-delay:50ms/.test(b),'las barras entran escalonadas');
ok(/Sin datos para graficar/.test(G.barrasH([]))&&/Aún no/.test(G.barrasH([],{vacio:'Aún no hay datos'})),'sin datos muestra un aviso, no un gráfico vacío');
const c=G.columnas([{etiqueta:'01/10',valor:4},{etiqueta:'08/10',valor:2,tip:'Semana: 2'},{etiqueta:'15/10',valor:0}],{altura:100});
ok(/--h:100px/.test(c)&&/calc\(var\(--h,120px\)\*1\.000\)/.test(c)&&/calc\(var\(--h,120px\)\*0\.500\)/.test(c)&&/data-tip="Semana: 2"/.test(c),'las columnas escalan con la altura configurada y traen su globo');
ok(/Sin datos/.test(G.columnas([{etiqueta:'x',valor:0}])),'columnas sin valores: aviso');
const d=G.dona([{id:'P',etiqueta:'Pendiente',valor:1,color:'#64748b'},{id:'C',etiqueta:'Cerrada',valor:3,color:'#0e7490'},{id:'X',etiqueta:'Nada',valor:0}],{grupo:'mi-estado',centro:4,subcentro:'intervenciones'});
ok(/stroke-dasharray="25\.00 75\.00"/.test(d)&&/stroke-dasharray="75\.00 25\.00"/.test(d)&&!/Nada/.test(d)&&/>4</.test(d)&&/data-gm-id="C"/.test(d),'la dona reparte en porcentajes, omite lo que vale 0 y deja cada segmento clicable');
const css=leer('js/mantenimiento/67i-graficos.js');
ok(/prefers-reduced-motion:reduce/.test(css)&&/@keyframes gm-grow/.test(css)&&/@keyframes gm-rise/.test(css),'animaciones de entrada que respetan «reducir movimiento»');
ok(/touchstart/.test(css)&&/mouseover/.test(css)&&/focusin/.test(css)&&/Escape/.test(css),'el globo funciona con mouse, toque, teclado y se cierra con Esc');
ok(/grid-template-columns:1fr auto/.test(css)&&/max-width:520px/.test(css),'en celular cada barra se acomoda en dos líneas (etiqueta y valor, barra debajo)');
ok(/body \.mi-tabs/.test(css)&&/body \.mi-card::before/.test(css)&&/body \.mi-kpi/.test(css)&&/body \.mi-modal/.test(css),'estilo visual común del módulo (pestañas, tarjetas, indicadores, ventanas)');

const s67c=leer('js/mantenimiento/67c-intervenciones-pantalla.js'),s67f=leer('js/mantenimiento/67f-indicadores-equipo.js'),s67h=leer('js/mantenimiento/67h-reclasificacion-pantalla.js'),s47=leer('js/produccion/47-analisis-paradas.js'),html=leer('index.html');
ok(/panelGraficos\(A\)/.test(s67c)&&/G\.dona\(porEstado/.test(s67c)&&/G\.columnas\(serie/.test(s67c)&&/g==='mi-estado'/.test(s67c)&&/g==='mi-equipo'/.test(s67c),'Intervenciones: dona por estado, equipos y aperturas por semana; tocar filtra la lista');
ok(/graficosEquipos\(r\)/.test(s67f)&&/data-gm-grupo="ie-equipo"/.test(s67f),'Indicadores: fallas y MTTR por equipo; tocar abre el detalle');
ok(/rc-grupo/.test(s67h),'Reclasificar: minutos sin clasificar por grupo; tocar abre la asignación');
ok(/class="gm-svg-bar" data-tip=/.test(s47)&&/gm-svg-barh/.test(s47)&&/circle data-tip=/.test(s47),'el Pareto y la tendencia de Análisis de paradas también muestran el globo y se animan');
ok(html.indexOf('67i-graficos.js')>0&&html.indexOf('67i-graficos.js')<html.indexOf('47-analisis-paradas.js')&&html.indexOf('67i-graficos.js')<html.indexOf('67c-intervenciones-pantalla.js')&&/67i-graficos\.js\?v=20261013-gm1/.test(html),'index.html carga 67i antes de 47 y 67c');
ok(!/[^.\w]alert\(|[^.\w]confirm\(|[^.\w]prompt\(/.test(css.replace(/\/\/.*$/gm,''))&&!/arrayUnion|increment\(|array-contains|'!='/.test(css),'sin alert/confirm/prompt ni nada incompatible con Supabase');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
