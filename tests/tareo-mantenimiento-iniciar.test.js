/* Tareo › Mantenimiento › «Iniciar tareo»: un solo criterio de personal (lista de turnos, «Personal activo» e Iniciar) y un mensaje que dice
   por qué un tareo quedaría vacío. Datos inventados y aislados. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');

function entorno(workers,rot,tareos){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,RegExp,Promise,setTimeout,clearTimeout,setInterval:()=>0,isFinite,parseInt,parseFloat,Intl,Error};
  vm.createContext(sb);sb.window=sb;sb.addEventListener=()=>{};sb.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
  sb.document={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({style:{},appendChild(){},setAttribute(){}}),head:{appendChild(){}},body:{}};
  sb.state={user:{rol:'Administrador',username:'a'}};sb.tienePermiso=()=>true;sb.db={collection:()=>({doc:()=>({})})};
  sb.loadWorkers=()=>workers;sb.loadTareos=()=>tareos||[];sb.saveTareos=()=>{};sb.loadRotacionesMantenimiento=()=>rot||[];sb.loadRotaciones=()=>[];
  vm.runInContext(leer('js/personal/13-tareo.js'),sb);
  vm.runInContext(leer('js/personal/45-tareo-edicion-continua.js'),sb);
  return sb;
}
const FECHA='2026-10-14';
const tecnico=(n,i,o)=>Object.assign({nombre:n,dni:'4100000'+i,cargo:'TECNICO DE MANTENIMIENTO',area:'Mantenimiento'},o||{});   // importados: sin estado ni tilde
const workers=['QUISPE','MAMANI','HUAMAN','FLORES','ROJAS','TORRES','DIAZ','CRUZ'].map((n,i)=>tecnico(n,i))
  .concat([{nombre:'MEZA RAMOS',dni:'41000099',cargo:'SUPERVISOR DE MANTENIMIENTO',area:'Mantenimiento',estado:'Activo'}]);
const rotDe=(lista,turnoDe)=>[{id:'ROT-MTTO-2026-10-12',area:'Mantenimiento',fechaInicio:'2026-10-12',fechaFin:'2026-10-18',
  personal:lista.map((w,i)=>({trabajadorId:w.id??w.dni,nombre:w.nombre,dni:w.dni,turno:turnoDe(i),horaIngreso:'07:00',horaSalida:'19:00'}))}];
const rot=rotDe(workers.slice(0,8),i=>i<5?'Día':'Noche');

let sb=entorno(workers,rot);
ok(sb.obtenerPersonalTareo('Mantenimiento').length===9,'«Personal activo»: 9 (cargo en mayúsculas y sin tilde, sin campo estado)');
ok(sb.tareoProgramadosPorTurno('Mantenimiento',FECHA).turnos['Día'].length===5&&sb.tareoProgramadosPorTurno('Mantenimiento',FECHA).turnos['Noche'].length===3,'lista de turnos: Día 5 · Noche 3');
ok(sb.crearPersonalTareo(FECHA,'Día','Mantenimiento').length===6,'Iniciar Día: los 5 técnicos del turno (+ el supervisor, que no está en la rotación)');
ok(sb.crearPersonalTareo(FECHA,'Noche','Mantenimiento').length===4,'Iniciar Noche: los 3 técnicos del turno (+ el supervisor)');

/* criterio único */
ok(sb.tareoEsDeArea({area:'MANTENIMIENTO',cargo:'TECNICO'},'Mantenimiento')&&sb.tareoEsDeArea({cargo:'Técnico de Mantenimiento'},'Mantenimiento'),'Mantenimiento por área o por cargo, sin importar mayúsculas ni tildes');
ok(sb.tareoTrabajadorActivo({})&&sb.tareoTrabajadorActivo({estado:'ACTIVO'})&&!sb.tareoTrabajadorActivo({estado:'Inactivo'})&&!sb.tareoTrabajadorActivo({estado:'activo',activo:false}),'activo: sin campo estado sí; «Inactivo» o activo:false no');
ok(!sb.tareoEsDeArea({area:'Producción',cargo:'OPERADOR'},'Mantenimiento'),'un operador de Producción no entra al tareo de Mantenimiento');
sb=entorno(workers.map((w,i)=>i<8?Object.assign({},w,{estado:'INACTIVO'}):w),rot);
ok(sb.obtenerPersonalTareo('Mantenimiento').length===1,'los marcados INACTIVO no se tarean');

/* mensajes según el paso que deja la lista vacía */
sb=entorno([{nombre:'OPERADOR',cargo:'OPERADOR DE MAQUINA',area:'Producción'}],[]);
ok(/No hay personal activo de Mantenimiento/.test(sb.tareoMotivoSinPersonalMantenimiento(FECHA,'Día')),'sin trabajadores de Mantenimiento: «No hay personal activo…»');
const soloTec=workers.slice(0,8);
sb=entorno(soloTec,rotDe(soloTec,()=>'Noche'));
ok(sb.crearPersonalTareo(FECHA,'Día','Mantenimiento').length===0&&/los programa a todos en el otro turno/.test(sb.tareoMotivoSinPersonalMantenimiento(FECHA,'Día')),'todos programados en el otro turno: lo dice (no «no hay personal activo»)');
const excluidos=[{id:'T-ANT',area:'Mantenimiento',fecha:'2026-10-10',turno:'Día',personal:[],
  personalExcluido:soloTec.map(w=>({ids:['DNI:'+w.dni],nombre:w.nombre,activa:true,permanente:true,desde:'2026-10-10',en:1}))}];
sb=entorno(soloTec,rotDe(soloTec,i=>i<5?'Día':'Noche'),excluidos);
ok(sb.crearPersonalTareo(FECHA,'Día','Mantenimiento').length===0&&/«ya no trabaja»/.test(sb.tareoMotivoSinPersonalMantenimiento(FECHA,'Día')),'todos quitados como «ya no trabaja» en un tareo anterior: lo dice y cómo restaurarlos');

const s13=leer('js/personal/13-tareo.js');
ok(/tareoTrabajadorActivo\(trabajador\) &&\s*tareoEsDeArea\(trabajador, areaBuscada\)/.test(s13)&&/tareoMotivoSinPersonalMantenimiento\(fecha, turnoTareo\)/.test(s13),'Iniciar, contador y lista usan obtenerPersonalTareo con el criterio único; el aviso usa el diagnóstico');

console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
