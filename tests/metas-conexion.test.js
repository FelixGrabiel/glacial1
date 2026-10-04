/* Parte 2, commit 8: una sola tabla de metas y una sola forma de pintar los colores. */
const fs=require('fs'),vm=require('vm');
const R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error(n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&!--d)break;}return src.slice(m.index,j+1);}
const sb={console,Math,Number,Array,Object,String};vm.createContext(sb);sb.window=sb;
vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
const G=vm.runInContext('GlacialIndicadores',sb);
/* 23b: color del cierre de turno con la meta de cumplimiento de la tabla */
const s23=leer('js/produccion/23b-tiempos-linea.js');
vm.runInContext("const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};const UMBRALES={enCursoVerde:1,enCursoAmbar:0.9,cierreVerde:0.95,cierreAmbar:0.85};"+extraer(s23,'evaluarDesempenoLinea'),sb);
const ev=(c)=>vm.runInContext('evaluarDesempenoLinea',sb)({ok:true,enCurso:false},{},{produccion:c,programado:100}).nivel;
console.log('  [cierre de turno · cumplimiento → color con metas iniciales 95/85]');
ok(ev(96)==='verde'&&ev(90)==='ambar'&&ev(80)==='roja','con las metas iniciales: 96 % verde, 90 % ámbar, 80 % rojo (igual que los umbrales fijos de antes)');
sb.window.glacialMetasIndicadores=()=>G.normalizarMetas({cumplimiento:{verde:90,ambar:70}});
ok(ev(96)==='verde'&&ev(90)==='verde'&&ev(80)==='ambar'&&ev(60)==='roja','si la tabla dice 90/70: 90 % verde, 80 % ámbar, 60 % rojo (el semáforo sigue a la tabla)');
/* 47: color de disponibilidad */
const s47=leer('js/produccion/47-analisis-paradas.js');
ok(/GlacialIndicadores\.colorSegunMeta\(p==null\?null:p\*100/.test(s47),'47: el color de disponibilidad sale de colorSegunMeta');
/* 49: interpretación única */
const s49=leer('js/produccion/49-resumen-indicadores.js');
ok(/GlacialIndicadores\.normalizarMetas\(r\)/.test(s49)&&/GlacialIndicadores\.colorSegunMeta\(valor,metasReporte\(\)\[ind\]/.test(s49)&&/window\.glacialMetasIndicadores=metasReporte/.test(s49),'49: tabla de metas y color con el módulo; expone la tabla única');
/* 08: valores iniciales del módulo */
const s08=leer('js/produccion/08-graficos.js');
ok(/oee: GlacialIndicadores\.METAS_INICIALES\.oee\.verde \/ 100/.test(s08)&&!/oee: 0\.85/.test(s08),'08: METAS inicia con la tabla del módulo (ya no hay 0,85 / 0,90 / 0,95 / 0,02 escritos a mano)');
/* tabla incompleta o rota */
const n=G.normalizarMetas({oee:{verde:0},merma:{verde:1.5,ambar:1}});
ok(n.oee.verde===85&&n.merma.ambar===1.5,'metas vacías o incoherentes: se usan los valores iniciales y la merma nunca queda con ámbar menor que verde');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
