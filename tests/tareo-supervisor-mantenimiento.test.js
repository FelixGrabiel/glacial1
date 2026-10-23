/* El Supervisor de Mantenimiento tiene su bloque en el tareo de mantenimiento (imagen, Excel y vista general),
   también para tareos anteriores (todo sale de tareo.personal, sin tocar datos). Ejecutar: node tests/tareo-supervisor-mantenimiento.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)process.exitCode=1,fallas++;};
const src=fs.readFileSync(R+'/js/rrhh/38-tareo-rrhh-exportacion.js','utf8');
const i=src.indexOf('function tareoGrupoRRHH'),j=src.indexOf('window.tareoGrupoRRHH');
const sb={};vm.createContext(sb);
vm.runInContext("const norm=t=>String(t||'').trim().toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');"+src.slice(i,j)+";this.g=tareoGrupoRRHH;",sb);
const g=sb.g;
ok(g('Supervisor de Mantenimiento')==='SMT'&&g('SUPERVISOR MTTO')==='SMT','supervisor de mantenimiento → grupo SMT');
ok(g('Supervisor de Producción')==='SUP','supervisor de producción sigue en SUP');
ok(g('Técnico de Mantenimiento')==='TEC'&&g('Maquinista de Producción')==='MAQ','técnicos y maquinistas sin cambios');
ok(/'Mantenimiento':\['SMT','TEC','DIA'\]/.test(src),'la imagen de mantenimiento incluye SMT (supervisor) y técnicos, en una sola imagen');
ok(/SMT:\{clave:'SMT',orden:2/.test(src)&&/orden:3,etiqueta:'Mantenimiento \/ maquinistas'/.test(src),'SMT va primero en mantenimiento, antes de maquinistas');
ok(/\['SUP'\],\['SMT'\],\['MAQ'\]/.test(src),'el control del Excel general suma también SMT');
console.log(fallas?fallas+' fallas':'todo correcto');
