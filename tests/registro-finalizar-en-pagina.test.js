/* Registro de producción · punto 4, parte 2 (auditoría 2026-11-05): números vacíos, lo que falta para finalizar EN LA PÁGINA (sin ventanas
   emergentes), barra fija con el estado del guardado e indicadores con «—» mientras no hay producción. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error('no se encontró '+n);let i=src.indexOf('{',src.indexOf(')',m.index)),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}return src.slice(m.index,j+1)+'\n';}
const s06=leer('js/produccion/06-registro.js'),html=leer('index.html');
const sb={console,Math,Number,String,Object,Array,JSON,Date,num:v=>{const n=Number(v);return Number.isFinite(n)?n:0;},pct:v=>(v*100).toFixed(1)+'%',escaparHtml:t=>String(t)};
vm.createContext(sb);
vm.runInContext('let draft=null;let _estadoGuardadoRegistro={estado:"guardado",en:Date.now()};'+['statusClass','kpi','kpisRegistroHtml','destinoFaltanteRegistro','faltantesPorCuadroRegistro','textoGuardadoRegistro'].map(n=>extraer(s06,n)).join('')+
  'this.fijar=d=>{draft=d;};this.guardado=(e,en)=>{_estadoGuardadoRegistro={estado:e,en};};',sb);

/* indicadores */
const vacio=sb.kpisRegistroHtml({efectiva:0,disponibilidad:1,rendimiento:0,oee:0,cumplimiento:0,programada:0});
ok((vacio.match(/is-vacio/g)||[]).length===5&&!/100\.0%|0\.0%/.test(vacio)&&(vacio.match(/—/g)||[]).length===5,'sin producción: los 5 indicadores en «—» (no 100 % ni 0 % en rojo)');
const lleno=sb.kpisRegistroHtml({efectiva:21500,disponibilidad:0.95,rendimiento:0.8,oee:0.7,cumplimiento:0.93,programada:23040});
ok(!/is-vacio/.test(lleno)&&/95\.0%/.test(lleno)&&/21[.,]500/.test(lleno),'con producción: los valores de siempre (incluida la producción efectiva)');
const bloques=h=>h.split('<div class="kpi-label">').slice(1).map((b,i,arr)=>b);
const porKpi=h=>{const out={};const partes=h.split(/(?=<div\s+class="\s*kpi\s)/);partes.forEach(p=>{const m=/kpi-label">\s*([^<]+?)\s*</.exec(p);if(m)out[m[1]]=/is-vacio/.test(p);});return out;};
const sinProg=porKpi(sb.kpisRegistroHtml({efectiva:100,disponibilidad:1,rendimiento:1,oee:1,cumplimiento:0,programada:0}));
ok(sinProg['Cumplimiento']===true&&sinProg['Producción efectiva']===false&&sinProg['OEE']===false,'sin programado: solo el cumplimiento queda en «—»');

/* a dónde lleva cada faltante */
sb.fijar({cuadros:[{numero:1},{numero:2},{numero:3}]});
const d=t=>JSON.stringify(sb.destinoFaltanteRegistro(t));
ok(d('Producción 2: hora fin')==='{"tipo":"cuadro","i":1,"campo":"horaFin"}','«Producción 2: hora fin» → pestaña 2, campo Hora fin');
ok(d('Producción 1: marca')==='{"tipo":"cuadro","i":0,"campo":"marca"}'&&d('Producción 3: botellas sopladas')==='{"tipo":"cuadro","i":2,"campo":"produccion.sopladas"}','marca y sopladas');
ok(/"campo":"paradas"/.test(d('Producción 1: parada no programada (falta el motivo)'))&&/"campo":"paradas"/.test(d('Producción 1: equipo de una parada por Falla de máquina')),'paradas y equipo → la tabla de paradas no programadas');
ok(d('Fotografía de Hoja de Producto Terminado')==='{"tipo":"fotos"}'&&d('Al menos un cuadro de producción')==='{"tipo":"general"}','fotos de Producto Terminado y los demás');
ok(JSON.stringify(sb.faltantesPorCuadroRegistro(['Producción 1: marca','Producción 1: hora fin','Producción 3: hora fin','Fotografía de Hoja de Producto Terminado']))==='{"0":2,"2":1}','cuenta lo que falta por pestaña');

/* guardado */
sb.guardado('guardado',Date.now()-30000);ok(/hace 30 s/.test(sb.textoGuardadoRegistro().detalle),'barra: «Guardado · hace 30 s»');
sb.guardado('error',Date.now());ok(/No se pudo guardar/.test(sb.textoGuardadoRegistro().titulo),'barra: avisa si no se pudo guardar');

/* código */
const fin=extraer(s06,'finalizarReporteProduccion');
ok(!/alert\('Aún faltan datos/.test(fin)&&/irAFaltanteRegistro\(faltan\[0\]\)/.test(fin),'Finalizar reporte con faltantes: sin ventana emergente, lleva al primer dato');
ok(!/alert\('Falta completar en Producción/.test(extraer(s06,'finalizarCuadroProduccion')),'Finalizar marca con faltantes: sin ventana emergente');
ok(/class="reg-falta"[^>]*data-falta=/.test(s06)&&/onclick="irAFaltanteRegistro\(this\.dataset\.falta\)"/.test(s06),'la lista «Falta para finalizar» tiene un enlace por dato');
ok(/reg-tab-falta/.test(s06),'la pestaña de cada producción marca cuántos datos le faltan');
const prep=extraer(s06,'prepararCamposRegistro');
ok(/input\[type="number"\]/.test(prep)&&/inputmode/.test(prep)&&/el\.readOnly\|\|el\.disabled/.test(prep)&&/placeholder='0'/.test(prep),'números editables en 0 se ven vacíos (con 0 gris) y abren el teclado numérico; los de solo lectura no cambian');
ok(/barraRegistroHtml\(\)/.test(prep)&&/Revisar \(\$\{faltan\.length\}\)/.test(extraer(s06,'barraRegistroHtml'))&&/Finalizar reporte/.test(extraer(s06,'barraRegistroHtml')),'barra fija: estado del guardado, «Revisar (N)» y «Finalizar reporte»');
ok(/instalarPrepararCamposRegistro/.test(s06)&&/con-barra-registro #av-floating-trigger/.test(s06),'se aplica después de cada dibujado y sube el botón «Avance / Cierre» sobre la barra');
ok(/06-registro\.js\?v=20261107-/.test(html),'versión nueva de 06 en index.html');

if(fallas){console.log('\n'+fallas+' falla(s)');process.exit(1);}
console.log('\nTodo bien');
