/* Tareo · «Hora programada»: cada turno ofrece solo sus horas de ingreso (Día/Intermedio 07, 10, 13, 14 · Noche 19, 20, 21, 22).
   node tests/tareo-horas-ingreso-turno.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const src=fs.readFileSync(R+'/js/personal/13-tareo.js','utf8').replace(/\r\n/g,'\n');
const i=src.indexOf('const tareoHoraEsNoche'),j=src.indexOf('function obtenerFechaHoy()');
if(i<0||j<0)throw new Error('no se encontró tareoOpcionesHoraProgramada');
const sb={window:{tareoHorasIngreso:()=>({horas:['07:00','10:00','13:00','14:00','19:00','20:00','21:00','22:00']})},escaparHTML:t=>String(t)};
vm.createContext(sb);vm.runInContext(src.slice(i,j),sb);
const horas=(actual,turno)=>[...vm.runInContext('tareoOpcionesHoraProgramada('+JSON.stringify(actual)+','+JSON.stringify(turno)+')',sb).matchAll(/value="([^"]+)"/g)].map(m=>m[1]);
ok(JSON.stringify(horas('07:00','Día'))===JSON.stringify(['07:00','10:00','13:00','14:00']),'turno Día / Intermedio: 07:00, 10:00, 13:00, 14:00');
ok(JSON.stringify(horas('22:00','Noche'))===JSON.stringify(['19:00','20:00','21:00','22:00']),'turno Noche: 19:00, 20:00, 21:00, 22:00');
ok(horas('19:00','Día').includes('19:00')&&/fuera del catálogo|selected/.test(vm.runInContext('tareoOpcionesHoraProgramada("19:00","Día")',sb)),'un tareo antiguo conserva su hora aunque no sea del turno');
ok(horas('07:00','').length===8,'sin turno se ofrecen todas');
console.log(fallas?'\n'+fallas+' falla(s)':'\ntodo correcto');
