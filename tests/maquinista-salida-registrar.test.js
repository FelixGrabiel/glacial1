/* El Supervisor de Mantenimiento (y quien tenga «editar_salida_maquinistas») puede REGISTRAR la salida de un maquinista que aún no la tiene,
   no solo editar una salida ya guardada. Funciones reales de 13-tareo.js y 28-tareo-maquinistas.js. */
const vm=require('vm'),fs=require('fs'),path=require('path');
const {cargarCliente,crearNube}=require('./tareo-harness.js');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const cli=cargarCliente(crearNube({}),{});const sb=cli.sb;const ev=c=>vm.runInContext(c,sb);
const M=(o)=>Object.assign({trabajadorId:'m1',nombre:'Maquinista 1',dni:'1',cargo:'Maquinista de Producción',area:'Producción',asistencia:'Asistió',horaIngreso:'07:00',horaSalida:''},o||{});
sb.normalizarPermisosUsuario=u=>(u&&Array.isArray(u.permisos))?u.permisos:'todos';sb.esUsuarioSoloConsulta=()=>false;   // el arnés trae versiones simuladas de estas dos
const T={id:'TAR-PRO-1',area:'Producción',fecha:'2026-10-23',turno:'Día'};
const puede=(rol,perm)=>{sb.__u={rol,username:'u',nombre:'U',uid:'x',permisos:perm};ev('state.user=__u');};

/* quién puede */
puede('Mantenimiento',['moduloMantenimiento','gestionar_rotacion_mantenimiento','editar_salida_maquinistas']);
ok(ev('tareoPuedeEditarSalidaMaquinistas()')===true,'el perfil de Mantenimiento con el permiso de salida de maquinistas puede editar');
/* sin salida: antes no aparecía ningún botón */
sb.__t=T;sb.__p=M();
let h=ev('tareoBotonEditarSalida(__t,__p)');
ok(/Registrar salida/.test(h)&&/tareoEditarSalidaMaquinista/.test(h),'maquinista con ingreso y SIN salida: aparece «Registrar salida»');
sb.__p=M({horaSalida:'19:00'});h=ev('tareoBotonEditarSalida(__t,__p)');
ok(/Editar salida/.test(h)&&!/Registrar/.test(h),'con salida ya guardada sigue diciendo «Editar salida»');
/* condiciones */
sb.__p=M({horaIngreso:''});ok(ev('tareoBotonEditarSalida(__t,__p)')==='','sin hora de ingreso no se ofrece (no hay desde cuándo contar)');
sb.__p=M({asistencia:'Falta por justificar'});ok(ev('tareoBotonEditarSalida(__t,__p)')==='','si no asistió no se ofrece');
sb.__p=M({cargo:'Operario'});ok(ev('tareoBotonEditarSalida(__t,__p)')==='','solo maquinistas');
sb.__t=Object.assign({},T,{area:'Mantenimiento'});sb.__p=M();ok(ev('tareoBotonEditarSalida(__t,__p)')==='','solo en el tareo de Producción');
puede('Operario',['paletas']);sb.__t=T;sb.__p=M();ok(ev('tareoBotonEditarSalida(__t,__p)')==='','sin permiso no hay botón');
/* la tabla espejo de Mantenimiento usa la misma regla */
const s28=fs.readFileSync(path.join(__dirname,'..','js/personal/28-tareo-maquinistas.js'),'utf8');
ok(/tareoMaquinistaAdmiteSalida\(p\._persona\)/.test(s28)&&/'Registrar salida'/.test(s28)&&!/&& p\.horaSalida\) \? '<button/.test(s28),'la tabla de maquinistas del tareo de Mantenimiento muestra el botón aunque aún no haya salida');
/* al guardar una salida nueva: calcula las horas y no inventa una «salida original» */
const s13=fs.readFileSync(path.join(__dirname,'..','js/personal/13-tareo.js'),'utf8');
ok(/if \(!persona\.salidaOriginal && anterior\) persona\.salidaOriginal = anterior;/.test(s13),'registrar una salida nueva no deja «original» vacía');
const pr=M({horaSalida:'',salidaRefrigerio:'12:00',retornoRefrigerio:'13:00',refrigerio:1});
pr.horaSalida='19:00';sb.__p=pr;sb.__t={jornadaNormal:8,horaProgramadaIngreso:'07:00',turno:'Día'};ev('recalcularPersonaTareo(__p,__t)');
ok(pr.horasTrabajadas===11&&pr.horasExtras===3,'con la salida registrada se calculan las horas (07:00–19:00 con 1 h: 11 h, 3 extras)');
console.log(fallas?'\n'+fallas+' fallas':'\nSalida de maquinistas correcta');process.exit(fallas?1:0);
