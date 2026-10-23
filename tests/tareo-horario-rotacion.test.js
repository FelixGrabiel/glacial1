/* Tareo · horario por persona desde la rotación semanal: Día 07:00 · Intermedio 14:00 · Noche 21:00 / 22:00.
   node tests/tareo-horario-rotacion.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const src=fs.readFileSync(R+'/js/personal/13-tareo.js','utf8').replace(/\r\n/g,'\n');
const i=src.indexOf('function normalizarTurno'),j=src.indexOf('function tareoFirmaNombreMigracion');
if(i<0||j<0)throw new Error('no se encontró el bloque de turnos');
const sb={tareoNormalizarTexto:v=>String(v==null?'':v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim()};
vm.createContext(sb);vm.runInContext(src.slice(i,j),sb);
const h=t=>vm.runInContext('tareoHorarioDeTexto('+JSON.stringify(t)+')',sb);
ok(h('Día').hora==='07:00'&&h('Día').turno==='Día','Día → 07:00');
ok(h('Turno intermedio').hora==='14:00'&&h('Turno intermedio').turno==='Día'&&h('Turno intermedio').horario==='Intermedio','Intermedio → 14:00 dentro del bloque Día');
ok(h('Noche').turno==='Noche'&&h('Noche').hora==='','Noche sin hora explícita → vacío (usa la hora del tareo)');
ok(h('Noche 21').hora==='21:00'&&h('Noche 22:00').hora==='22:00','Noche 21:00 / 22:00 explícitas');
ok(h('Día 10').hora==='10:00','hora explícita del catálogo en turno Día');
ok(h('').turno===''&&h('').hora==='','texto vacío → sin horario');
ok(/tareoAplicarHorariosRotacion/.test(src)&&/horaProgramadaIngreso \|\| tareo\.horaProgramadaIngreso/.test(src),'botón y prioridad por persona presentes');
console.log(fallas?'\n'+fallas+' falla(s)':'\ntodo correcto');
