/* Revisión de botones del Asistente (31/10/2026): «Preparar solicitud» ya no parece muerto y un conteo vacío no se guarda como 0. */
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const p72=leer('js/asistente/72-asistente-pantalla.js'),p71=leer('js/asistente/71-asistente-datos.js'),html=leer('index.html');

ok(/window\.apIr=\(tab,sub\)=>\{[\s\S]*?ap-sol-nueva[\s\S]*?scrollIntoView[\s\S]*?\.focus\(/.test(p72),'«Preparar solicitud» lleva al formulario y lo enfoca aunque ya se estuviera en Solicitudes');
ok(/<div id="ap-sol-nueva"><\/div><h3 class="ap-h3">Preparar solicitud a Almacén<\/h3>/.test(p72),'el formulario tiene su ancla');
ok(/motivoVacio/.test(p72)&&/Todavía no hay factores de consumo cargados/.test(p72),'si no hay faltantes, el formulario explica por qué (faltan factores, o nada falta) en vez de quedar mudo');

/* «Cuadro al que se destina» al recibir una solicitud: los cuadros son los de la FECHA y el TURNO DE LA SOLICITUD, no los de la pantalla */
ok(/function cuadrosPara\(fecha,bloque\)/.test(p72)&&/const cuadrosSol=cuadrosPara\(s\.fecha,s\.bloque\)/.test(p72)&&/\$\{cuadrosSol\.map\(c=>/.test(p72),'la lista de cuadros al recibir sale de la fecha y el turno de la solicitud (antes salía vacía si la pantalla estaba en otro día o turno)');
ok(/cuadrosPara\(solicitud\.fecha,solicitud\.bloque\)/.test(p72),'el cuadro elegido se busca con esos mismos cuadros');
ok(/No hay cuadros programados para/.test(p72),'si de verdad no hay cuadros, se explica y se puede confirmar sin cuadro');

ok(/sinCuadros/.test(p71)&&/No hay cuadros programados para esa fecha y turno: indica la línea/.test(p71),'sin cuadros programados, la recepción exige al menos la línea (antes quedaba bloqueada sin salida)');
ok(/id="ap-rec-linea"/.test(p72)&&/sinCuadros\?valor\('ap-rec-linea'\)/.test(p72.replace(/\s+/g,' ').replace('sinCuadros ? valor','sinCuadros?valor')),'la ventana ofrece «Línea a la que se destina» cuando no hay cuadros');
ok(/alert\('Elige el cuadro al que se destina lo recibido\.'\)/.test(p72)&&/return;\}\s*if\(!String\(datos\.linea/.test(p72),'se avisa antes de cerrar la ventana (no se pierde lo escrito)');

/* validarMovimiento (71) con el núcleo real */
global.window=global;
require(R+'/js/asistente/70-asistente-nucleo.js');
const vm=require('vm');
const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,Promise,isFinite,window:null,document:{getElementById:()=>null},firebase:{},db:null,state:{user:null},glacialAsistenteNucleo:global.glacialAsistenteNucleo};sb.window=sb;
const cuerpo=(()=>{const i=p71.indexOf('function validarMovimiento');let d=0,j=p71.indexOf('{',i);const k=j;for(;j<p71.length;j++){if(p71[j]==='{')d++;else if(p71[j]==='}'&&!--d)break;}return p71.slice(i,j+1);})();
vm.createContext(sb);
vm.runInContext('const N=glacialAsistenteNucleo;const num=v=>{const n=Number(v);return isFinite(n)?n:0;};'+cuerpo+';this.validar=validarMovimiento;',sb);
const base={tipo:'CONTEO',insumo:'C01',condicion:'UTILIZABLE'};
ok(sb.validar(Object.assign({},base,{cantidad:''})).length>0&&sb.validar(Object.assign({},base,{cantidad:undefined})).length>0&&sb.validar(Object.assign({},base,{cantidad:'  '})).length>0,'un conteo con la cantidad vacía no se guarda (antes se guardaba como 0)');
ok(sb.validar(Object.assign({},base,{cantidad:'0'})).length===0&&sb.validar(Object.assign({},base,{cantidad:0})).length===0,'un conteo en 0 escrito a propósito sí se guarda');
ok(sb.validar(Object.assign({},base,{cantidad:'125.5'})).length===0,'un conteo normal se guarda');
ok(sb.validar({tipo:'DEVOLUCION',insumo:'C01',cantidad:'0',cuadro:'k'}).length>0,'una devolución en 0 sigue sin guardarse');
ok(/71-asistente-datos\.js\?v=20261031-ar3/.test(html)&&/72-asistente-pantalla\.js\?v=20261031-ar3/.test(html),'index.html: versiones subidas');
console.log(fallas?'\n'+fallas+' fallas':'\nBotones del Asistente correctos');
process.exit(fallas?1:0);
