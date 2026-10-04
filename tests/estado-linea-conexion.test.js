/* Parte 2, commit 6: estado de línea con la prioridad única del módulo (semáforo y Resumen general). */
const fs=require('fs'),vm=require('vm'),cp=require('child_process');
const R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const previo=(f,ref)=>cp.execSync('git show '+ref+':'+f,{cwd:R,maxBuffer:1e8}).toString().replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error(n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&!--d)break;}return src.slice(m.index,j+1);}
const ref=process.env.REF_ANTES||'ceb290e';
function ctx09(src){const sb={console,Math,Number,Array,Object,String};vm.createContext(sb);sb.window=sb;
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  sb.PROGS=[];
  vm.runInContext('var fechaHoyResumen=()=>"2026-10-04";var loadProgramaciones=()=>PROGS;'+extraer(src,'rsEstadoLineas'),sb);return sb;}
const A=ctx09(previo('js/produccion/09-resumen.js',ref)),N=ctx09(leer('js/produccion/09-resumen.js'));
const estadosDe=(c,sb)=>{sb.PROGS=c.map(e=>({linea:'PET1',fecha:'2026-10-04',estadoOperacion:e?{estado:e}:undefined}));return vm.runInContext('rsEstadoLineas()',sb).find(x=>x.linea==='PET1');};
const casos={'una finalizada y una pendiente':['FINALIZADA',null],'finalizada y en producción':['FINALIZADA','EN_PRODUCCION'],'detenida y en producción':['DETENIDA','EN_PRODUCCION'],'pausa y en producción':['PAUSA','EN_PRODUCCION'],
  'todas finalizadas':['FINALIZADA','FINALIZADA'],'todas pendientes':[null,null],'sin programaciones':[],'canceladas':['CANCELADA','CANCELADA'],'cancelada y finalizada':['CANCELADA','FINALIZADA']};
console.log('  [Resumen general · antes → ahora]');
for(const [k,c] of Object.entries(casos)){const a=estadosDe(c,A),n=estadosDe(c,N);console.log('   '+k+': '+a.estado+' → '+n.estado);}
ok(estadosDe(['FINALIZADA',null],A).estado==='FINALIZADA'&&estadosDe(['FINALIZADA',null],N).estado==='PENDIENTE','finalizada + pendiente: antes FINALIZADA, ahora PENDIENTE (prioridad del semáforo)');
ok(estadosDe(['PAUSA','EN_PRODUCCION'],A).estado==='PAUSA'&&estadosDe(['PAUSA','EN_PRODUCCION'],N).estado==='EN PRODUCCIÓN','pausa + en producción: antes PAUSA, ahora EN PRODUCCIÓN (en curso gana a pausa, como el semáforo)');
ok(estadosDe(['DETENIDA','EN_PRODUCCION'],N).estado==='DETENIDA','detenida sigue ganando');
ok(estadosDe(['FINALIZADA','FINALIZADA'],N).estado==='FINALIZADA'&&estadosDe([],N).estado==='SIN ACTIVIDAD','todas cerradas → FINALIZADA; sin programaciones → SIN ACTIVIDAD');
/* semáforo: misma salida que la lógica anterior para todas las combinaciones de 1 a 4 ítems */
const G=vm.runInContext('GlacialIndicadores',N);
const K=['DETENIDA','EN_CURSO','PAUSA','PENDIENTE','COMPLETADA','CANCELADA'];
function viejo(claves){const cerr=claves.every(k=>['COMPLETADA','CANCELADA'].includes(k));
  return claves.every(k=>k==='CANCELADA')?'CANCELADA':cerr?'COMPLETADA':K.find(k=>claves.includes(k));}
let iguales=0,total=0;
(function rec(pref,n){if(pref.length)for(const _ of[0]){total++;if(viejo(pref)===G.estadoLineaDesdeItems(pref))iguales++;}if(n)K.forEach(k=>rec(pref.concat(k),n-1));})([],4);
ok(iguales===total,'semáforo: '+total+' combinaciones de estados de 1 a 4 ítems dan el mismo estado que la lógica anterior');
const s24=leer('js/produccion/24-semaforo-produccion-actual.js');
ok((s24.match(/GlacialIndicadores\.estadoLineaDesdeItems\(/g)||[]).length===2,'24: tablero y resumen ejecutivo usan el módulo');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
