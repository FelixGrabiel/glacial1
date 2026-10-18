/* El Supervisor de Mantenimiento entra en la rotación semanal de Mantenimiento (un solo turno por semana). */
'use strict';
const fs=require('fs'),vm=require('vm'),R=require('path').resolve(__dirname,'..');
let f=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){f++;process.exitCode=1;}};
const src=fs.readFileSync(R+'/js/mantenimiento/30-rotacion-mantenimiento.js','utf8');
const extraer=n=>{const m=new RegExp('function '+n+'\\(').exec(src);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&!--d)break;}return src.slice(m.index,j+1);};
const norm=t=>String(t||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const sb={tareoNormalizarTexto:norm,
  loadWorkers:()=>[{id:1,nombre:'MEZA RAMOS CRISTIAN',estado:'Activo',cargo:'Supervisor de Mantenimiento'},
    {id:2,nombre:'BETANCOURT',estado:'Activo',cargo:'Técnico de Mantenimiento'},
    {id:3,nombre:'INACTIVO',estado:'Inactivo',cargo:'Supervisor de Mantenimiento'},
    {id:4,nombre:'PRODUCCION',estado:'Activo',cargo:'Supervisor de Producción'},
    {id:5,nombre:'MAQ',estado:'Activo',cargo:'Maquinista de Producción'}]};
vm.createContext(sb);
vm.runInContext(fs.readFileSync(R+'/js/personal/28-tareo-maquinistas.js','utf8').match(/const maquina[\s\S]*?function tareoEsSupervisorMantenimiento[\s\S]*?\n  }\n/)[0].replace(/window\./g,'this.')+
  ';'+extraer('mttoEsTecnico')+extraer('mttoEsSupervisor')+extraer('mttoTecnicosActivos')+';this.r=mttoTecnicosActivos().map(w=>w.id);',sb);
ok(JSON.stringify(sb.r)==='[1,2]'||JSON.stringify(sb.r.slice().sort())==='[1,2]','la rotación incluye al Supervisor de Mantenimiento y al técnico; no a inactivos, Producción ni maquinistas');
ok(/col1:'TRABAJADOR'/.test(src),'la columna del cuadro ya no dice solo TÉCNICO');
console.log(f?f+' fallas':'todo correcto');
