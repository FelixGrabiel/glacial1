/* Avance y Cierre › agregar paradas aunque el turno ya terminó (ventana del supervisor cerrada, turno pasado o cierre generado). Carga el módulo real. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
function entorno(user,perm){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout,clearTimeout,setInterval:()=>0,Infinity,isFinite,Boolean};
  vm.createContext(sb);sb.window=sb;sb.addEventListener=()=>{};
  sb.document={createElement:()=>({style:{},classList:{add(){},remove(){}},appendChild(){}}),getElementById:()=>null,querySelector:()=>null,body:{classList:{add(){},remove(){}}},addEventListener(){}};
  sb.state={user,currentTab:''};
  sb.ahora=new Date(2026,10,17,22,30).getTime();sb.tareoAhoraServidor=()=>sb.ahora;
  sb.loadProgramaciones=()=>[];sb.loadRecords=()=>[];sb.loadPaletas=()=>[];
  sb.normalizarCuadros=r=>r.cuadros||[];sb.normalizarMotivoParada=t=>String(t||'').toLowerCase().trim();sb.estandarMotivoParada=()=>0;
  sb.tienePermiso=p=>perm.includes(p);
  sb.esUsuarioSoloConsulta=u=>u.rol==='Jefe de Producción';
  // el supervisor está FUERA de su ventana de turno (ya terminó): antes esto le quitaba el botón
  sb.glacialVentanaSupervisor={aplicaA:u=>u.rol==='Supervisor',puedeTrabajar:()=>false};
  sb.db={collection:()=>({doc:()=>({get:async()=>({exists:false,data:()=>({})}),onSnapshot:()=>()=>{}})})};
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  vm.runInContext(leer('js/produccion/23b-tiempos-linea.js'),sb);
  vm.runInContext(leer('js/produccion/29-avance-produccion.js'),sb);
  return sb;
}
const sup=entorno({rol:'Supervisor',username:'sup',nombre:'Supervisor Día'},['avanceProduccion']);
const run=(sb,c)=>vm.runInContext(c,sb);
ok(run(sup,'avPuedeGenerar()')===false,'el supervisor fuera de su ventana NO puede generar avances ni cierres (se mantiene)');
ok(run(sup,'avPuedeEditarParadas()')===true,'pero sí puede agregar paradas del turno que ya terminó');
run(sup,"avanceEstado.snapshots=[{tipo:'CIERRE',fecha:avanceEstado.fecha,turno:avanceEstado.turno}]");
ok(run(sup,'avCierreGenerado()')===true&&run(sup,'avPuedeEditarParadas()')===true,'con el cierre ya generado también se pueden agregar (el modal avisa que hay que regenerar el cierre)');
const html=run(sup,'avParadasTardiasHtml()');
ok(/\+ AGREGAR PARADAS/.test(html)&&/aunque el turno ya haya terminado/.test(html),'sin ventana, la pantalla muestra el botón «+ AGREGAR PARADAS» con su explicación');
ok(run(sup,'avAccionesHistoricoHtml()').includes('+ AGREGAR PARADAS'),'en la consulta histórica (turno pasado) también aparece «+ AGREGAR PARADAS»');
const sin=entorno({rol:'Operador',username:'op',nombre:'Sin permiso'},[]);
ok(run(sin,'avPuedeEditarParadas()')===false&&run(sin,'avParadasTardiasHtml()')==='','sin el permiso de Avance y Cierre no se puede agregar');
const jefe=entorno({rol:'Jefe de Producción',username:'jp',nombre:'Jefe'},['avanceProduccion']);
ok(run(jefe,'avPuedeEditarParadas()')===false,'los usuarios de solo consulta (jefatura) siguen sin poder agregar');
const src=leer('js/produccion/29-avance-produccion.js');
ok(/function avGuardarParadasModal\(\)\{\s*const m=avanceEstado\.paradasModal;if\(!m\|\|m\.guardando\|\|!avPuedeEditarParadas\(\)\)return;/.test(src),'el guardado usa la misma regla (no queda otro bloqueo por hora)');
ok(/index\.html/.test('index.html')&&/29-avance-produccion\.js\?v=20261117-pt1/.test(leer('index.html')),'la página carga la versión nueva del módulo');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
