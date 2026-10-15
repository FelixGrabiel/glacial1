/* Inicio: «Personal por línea» (Distribución de personal del Tareo) y «Líneas sin producción» con el mismo criterio de producción (> 0 unidades). */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');

const sb={console,Math,Number,Array,Object,String,Date,JSON,Set,Map};vm.createContext(sb);sb.window=sb;
sb.tareoAreaDe=t=>String(t.area||'')==='Mantenimiento'?'Mantenimiento':'Producción';
vm.runInContext(leer('js/personal/43-distribucion-personal.js'),sb);
const D=sb.glacialDistribucionPersonal;
const p=(id,a)=>({trabajadorId:id,nombre:id,asistencia:a});
const tareos=[
  {area:'Producción',fecha:'2026-10-13',turno:'NOCHE',personal:[p('a','Asistió'),p('b','ASISTIÓ'),p('c','Tardanza'),p('d','Falta por justificar'),p('e','Vacaciones')]},
  {area:'Mantenimiento',fecha:'2026-10-13',turno:'NOCHE',personal:[p('m','Asistió')]},
  {area:'Producción',fecha:'2026-10-13',turno:'DÍA',personal:[p('x','Asistió'),p('y','Asistió')]},
  {area:'Producción',fecha:'2026-10-13',turno:'INTERMEDIO',personal:[p('y','Asistió'),p('z','Asistió')]}
];
ok(D.disponiblesTareo(tareos,'2026-10-13','NOCHE')===3,'Noche: cuenta solo quien asistió (ASISTIÓ y tardanza), sin faltas, vacaciones ni Mantenimiento');
ok(D.disponiblesTareo(tareos,'2026-10-13','DÍA')===3,'Día + Intermedio: una persona en los dos turnos se cuenta una vez');
ok(D.disponiblesTareo(tareos,'2026-10-14','NOCHE')===null,'sin Tareo del bloque: null (no se puede comprobar; no es cero)');
ok(/D\(\)\.disponiblesTareo\(/.test(leer('js/personal/44-distribucion-personal-pantalla.js')),'la pantalla de Distribución usa la misma función');

const s32=leer('js/accesos/32-dashboard-perfiles.js');
const ejec=s32.slice(s32.indexOf('function cpEjecutivoHTML'),s32.indexOf('function cpEjecutivoStyles'));
ok(/const enCursoReal=filas\.filter\(cpEnProduccion\)/.test(s32)&&/I\.enProduccion\(f\)/.test(s32),'«Líneas en producción» usa el mismo criterio que «Líneas sin producción» (unidades > 0)');
ok(/\$\{cabecera\}\$\{kpis\}\$\{tarjetaSP\}/.test(ejec),'orden: tarjetas (con Distribución de personal) → líneas sin producción; la tabla de personal pasó al detalle');
ok(/D\.consultar\(d\.fecha,bloque,l,corte\)/.test(s32)&&/D\.disponiblesTareo\(/.test(s32)&&/cpPersonalEscuchar\(d\.fecha,bloque\)/.test(s32),'personal: Distribución vigente al corte de la fecha y el bloque seleccionados, comparada con la asistencia del Tareo');
ok(/Tiene personal y no produce/.test(s32)&&/Produce sin personal confirmado/.test(s32)&&/Sin asignar/.test(s32),'personal: resalta personal parado y producción sin personal; muestra «Sin asignar»');
ok(!/'Estado del turno'/.test(ejec)&&/'Distribución de personal'/.test(ejec),'la tarjeta «Estado del turno» se reemplazó por «Distribución de personal»');
ok(/Todas las líneas están en producción\./.test(ejec)&&/Registrar en Producción Actual/.test(ejec)&&/I\.puedeInformar\(f\.linea\)/.test(ejec),'sin producción: «Todas…» cuando no hay; enlace para registrar solo a quien puede informar');
ok(/\.cp-ex-table\{min-width:0\}/.test(s32),'celular: las tablas de Inicio no heredan el ancho mínimo de 650 px');

console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
