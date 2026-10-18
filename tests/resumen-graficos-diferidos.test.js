/* Resumen general: los gráficos de Chart.js se crean de uno en uno después del render (js/produccion/49b-resumen-graficos-diferidos.js). */
'use strict';
const fs=require('fs'),vm=require('vm'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const src=leer('js/produccion/49b-resumen-graficos-diferidos.js'),html=leer('index.html'),indice=leer('INDICE.md');

function entorno(opc){
  opc=opc||{};
  const timers=[];
  const sb={console,Math,Number,Array,Object,String,Set,Map,JSON,Date,Error,setTimeout:(f)=>{timers.push(f);return timers.length;}};
  vm.createContext(sb);sb.window=sb;
  sb.creados=[];sb.destruidos=0;
  /* Chart simulado: registra cada creación real y lo que valía defaults.animation en ese momento */
  sb.Chart=function Chart(el,config){sb.creados.push({el,config,animacion:sb.Chart.defaults.animation});this.destroy=()=>{sb.destruidos++;};};
  sb.Chart.defaults={animation:{duration:420},font:{},color:'#000'};
  sb.Chart.register=()=>{};
  sb.canvas=n=>({id:'c'+n,isConnected:true});
  sb.renders=0;sb.lanzar=false;
  /* renderResumen simulado: crea 13 gráficos como el real (mismo patrón: state.charts.x = new Chart(...)), y toca Chart.defaults */
  sb.state={charts:{}};
  sb.cuerpo=function(){
    sb.renders++;sb.Chart.defaults.font={family:'IBM Plex Sans',size:12};
    if(sb.lanzar)throw new Error('falla del render');
    for(let i=0;i<13;i++)sb.state.charts['g'+i]=new sb.Chart(sb.canvas(i),{type:'bar',data:{i}});
    return 'listo';
  };
  vm.runInContext('function renderResumen(main){return cuerpo(main);}',sb);
  if(!opc.sinChart)void 0;
  vm.runInContext(src,sb);
  sb.drenar=(max)=>{let n=0;while(timers.length&&n<(max||1000)){timers.shift()();n++;}return n;};
  sb.timers=timers;
  return sb;
}

/* 1) el render termina sin crear ningún gráfico real */
{
  const sb=entorno();
  const r=vm.runInContext('renderResumen({})',sb);
  ok(r==='listo'&&sb.renders===1,'renderResumen conserva su resultado y se ejecuta una vez');
  ok(sb.creados.length===0,'al terminar el render todavía no se creó ningún gráfico real (el navegador puede pintar)');
  ok(Object.keys(sb.state.charts).length===13&&Object.values(sb.state.charts).every(c=>typeof c.destroy==='function'),'state.charts guarda objetos con destroy() para los 13 gráficos');
  ok(sb.Chart.name==='Chart'&&typeof sb.Chart.register==='function','el constructor Chart original queda restaurado');
}
/* 2) se crean de uno en uno, cada uno en su turno, con los mismos datos */
{
  const sb=entorno();vm.runInContext('renderResumen({})',sb);
  const t0=sb.timers.length;sb.timers.shift()();
  ok(sb.creados.length===1&&sb.timers.length===1,'cada turno crea un solo gráfico y programa el siguiente (cede al navegador entre gráficos)');
  sb.drenar();
  ok(sb.creados.length===13,'al final se crearon los 13 gráficos reales');
  ok(sb.creados.every((c,i)=>c.config.data.i===i&&c.config.type==='bar'),'con la misma configuración y en el mismo orden');
  ok(sb.creados.every(c=>c.animacion===false),'cada creación va sin animación de entrada');
  ok(sb.Chart.defaults.animation&&sb.Chart.defaults.animation.duration===420,'Chart.defaults.animation se restaura (420 ms) después de cada creación');
  ok(sb.Chart.defaults.font&&sb.Chart.defaults.font.size===12,'los Chart.defaults que fija el render siguen funcionando');
}
/* 3) destroy() antes de crear cancela; después de crear destruye el real */
{
  const sb=entorno();vm.runInContext('renderResumen({})',sb);
  sb.state.charts.g3.destroy();sb.state.charts.g4.destroy();
  sb.drenar();
  ok(sb.creados.length===11&&!sb.creados.some(c=>c.config.data.i===3||c.config.data.i===4),'un gráfico destruido antes de crearse no se crea');
  sb.state.charts.g0.destroy();
  ok(sb.destruidos===1,'destroy() sobre uno ya creado destruye el gráfico real');
}
/* 4) un render nuevo cancela lo pendiente del anterior */
{
  const sb=entorno();vm.runInContext('renderResumen({})',sb);
  sb.timers.shift()();sb.timers.shift()();                    // 2 creados, 11 pendientes
  vm.runInContext('Object.values(state.charts).forEach(c=>c.destroy())',sb);
  vm.runInContext('renderResumen({})',sb);
  sb.drenar();
  ok(sb.creados.length===2+13,'tras un render nuevo solo se crean los gráficos del render nuevo (los pendientes viejos se descartan)');
}
/* 5) canvas que ya no está en el documento */
{
  const sb2=entorno();
  vm.runInContext("cuerpo=function(){for(let i=0;i<3;i++)state.charts['g'+i]=new Chart({id:'x'+i,isConnected:i!==1},{data:{i}});return 1;}",sb2);
  vm.runInContext('renderResumen({})',sb2);sb2.drenar();
  ok(sb2.creados.length===2,'un canvas que ya no está en el documento (se cambió de pantalla) no se vuelve a dibujar');
}
/* 6) robustez */
{
  const sb=entorno();sb.lanzar=true;
  let lanzo=false;try{vm.runInContext('renderResumen({})',sb);}catch(e){lanzo=/falla del render/.test(e.message);}
  ok(lanzo&&sb.Chart.name==='Chart','si el render lanza una excepción, se propaga y Chart queda restaurado');
  const sb2=entorno();sb2.Chart=undefined;
  vm.runInContext('cuerpo=function(){renders++;return "sin chart";}',sb2);
  ok(vm.runInContext('renderResumen({})',sb2)==='sin chart'&&sb2.renders===1,'sin Chart.js cargado se comporta como antes');
}
/* 7) archivos */
{
  const pos=n=>html.indexOf('js/'+n);
  const i=pos('produccion/49b-resumen-graficos-diferidos.js');
  ok(i>0&&i>pos('produccion/09-resumen.js')&&i>pos('produccion/08-graficos.js')&&i>pos('produccion/49-resumen-indicadores.js')&&i<pos('nucleo/12-init.js'),'index.html carga 49b después de 08, 09 y 49 y antes de 12-init');
  ok(/49b-resumen-graficos-diferidos\.js\?v=\d{8}-[a-z]+\d+/.test(html),'index.html con ?v= en el script nuevo');
  ok(/49b-resumen-graficos-diferidos/.test(indice),'INDICE.md documenta el archivo y su orden');
  ok(!/\balert\(|\bconfirm\(|\bprompt\(/.test(src),'sin alert/confirm/prompt');
}
console.log(fallas?fallas+' fallas':'todo correcto');
