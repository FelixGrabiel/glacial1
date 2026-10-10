/* Carga las funciones REALES de js/personal/13-tareo.js (y 45-tareo-edicion-continua.js) en un contexto simulado con una base en memoria:
   un documento sync/tareos con transacciones y latencia, y varios clientes («sesiones») que comparten esa nube. Sin DOM: la pantalla se
   comprueba aparte en el navegador. */
const fs=require('fs'),vm=require('vm'),cp=require('child_process');
const R=require('path').resolve(__dirname,'..');
const leerDisco=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const leerRef=(f,ref)=>cp.execSync('git show '+ref+':'+f,{cwd:R,maxBuffer:1e8}).toString().replace(/\r\n/g,'\n');
const clonar=v=>JSON.parse(JSON.stringify(v));
const espera=ms=>new Promise(r=>setTimeout(r,ms));

function crearNube(opc){
  opc=opc||{};
  const nube={items:[],version:0,oyentes:[],latencia:opc.latencia||0,latenciaSnapshot:opc.latenciaSnapshot||0,caida:false,transacciones:0};
  nube.emitir=()=>nube.oyentes.forEach(f=>setTimeout(()=>f(clonar(nube.items)),nube.latenciaSnapshot));
  return nube;
}

/* ref: confirmación de git para cargar la versión ANTERIOR (evidencia de la causa); sin ref = archivos actuales. */
function cargarCliente(nube,opc){
  opc=opc||{};
  const ref=opc.ref;
  const leer=f=>ref?leerRef(f,ref):leerDisco(f);
  const log={renders:0,alertas:[],confirmas:[],auditoria:[]};
  let reloj=opc.reloj||1000000;
  const db={
    collection:()=>({doc:()=>({id:'tareos'}),add:async()=>({})}),
    runTransaction:async fn=>{
      await espera(nube.latencia);
      nube.transacciones++;
      const tx={get:async()=>({exists:true,data:()=>({items:clonar(nube.items)})}),set:(r,d)=>{tx._d=d;}};
      const r=await fn(tx);
      if(nube.caida) throw new Error('sin red');
      if(tx._d){nube.items=clonar(tx._d.items);nube.version++;nube.emitir();}
      return r;
    }
  };
  const sb={console,Date,JSON,Promise,Error,Map,Set,Array,Object,String,Number,Math,setTimeout,clearTimeout,Boolean,RegExp,parseInt,parseFloat,isNaN,Intl,encodeURIComponent};
  sb.window=sb;sb.globalThis=sb;sb.db=db;
  const el=()=>({addEventListener(){},appendChild(){},style:{},classList:{add(){},remove(){},toggle(){}},querySelectorAll:()=>[],querySelector:()=>null,setAttribute(){},getAttribute:()=>null,contains:()=>false});
  sb.document={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},head:el(),body:el(),createElement:()=>el(),activeElement:null,readyState:'complete'};
  sb.localStorage={getItem:()=>null,setItem(){},removeItem(){}};sb.sessionStorage=sb.localStorage;sb.addEventListener=()=>{};
  sb.alert=m=>log.alertas.push(m);sb.confirm=m=>{log.confirmas.push(m);return opc.confirmar===undefined?true:opc.confirmar;};
  sb.state={user:{username:opc.usuario||'sup',nombre:opc.usuario||'Supervisor',rol:'Supervisor'}};
  sb.esUsuarioSoloConsulta=()=>!!opc.soloConsulta;
  sb.tienePermiso=()=>true;sb.normalizarPermisosUsuario=()=>'todos';
  sb.LINES=[];sb.escaparHTML=v=>String(v==null?'':v);
  sb._tareosCache=[];sb._tareosReady=true;
  sb.tareoAhoraServidor=()=>(reloj+=1);
  sb.saveTareos=()=>{};sb._avisarErrorGuardado=(n,e)=>log.alertas.push('ERRGUARDADO '+(e&&e.message));
  sb.renderTareoFormulario=function(){log.renders++;};sb.renderTareoLectura=function(){};
  vm.createContext(sb);
  vm.runInContext('function _obtenerTareosBase(){return _tareosCache;}function loadTareos(){return _tareosCache;}',sb);
  vm.runInContext(leer('js/personal/13-tareo.js'),sb,{filename:'13-tareo.js'});
  sb.renderTareoFormulario=function(){log.renders++;};
  if(!ref||ref==='conEdicion') vm.runInContext(leerDisco('js/personal/45-tareo-edicion-continua.js'),sb,{filename:'45.js'});
  sb.tareoAreasEditables=()=>opc.areas||['Producción','Mantenimiento'];
  // Mismo tratamiento del listener que 02-estado.js (versión cargada).
  const src02=leer('js/nucleo/02-estado.js');
  const reconcilia=/TareoEd\.reconciliar/.test(src02);
  nube.oyentes.push(items=>{
    sb._tareosCache=(reconcilia&&sb.TareoEd)?sb.TareoEd.reconciliar(items):items;
    if(typeof sb.tareoRefrescarFormularioRemoto==='function'){ try{sb.tareoRefrescarFormularioRemoto();}catch(_){/* sin pantalla */} }
  });
  const cliente={sb,log,nube};
  cliente.abrir=id=>{sb._tareosCache=clonar(nube.items);sb.tareoActualId=id;};
  cliente.persona=(tareoId,clave)=>{const t=sb._tareosCache.find(x=>x.id===tareoId);return t&&t.personal.find(p=>sb.tareoClavePersona(p)===clave);};
  return cliente;
}

function crearTareo(opc){
  opc=opc||{};
  const n=opc.n||10;
  const area=opc.area||'Producción';
  return {id:opc.id||'tareo-1',area,fecha:opc.fecha||'2026-10-09',turno:opc.turno||'Día',horaProgramadaIngreso:'07:00',jornadaNormal:8,estado:'Abierto',
    personal:opc.personal||Array.from({length:n},(_,i)=>({trabajadorId:'T'+i,nombre:'Persona '+i,dni:'0000000'+i,cargo:'Operario',area,linea:'PET1',asistencia:'',
      horaIngreso:'',salidaRefrigerio:'',retornoRefrigerio:'',horaSalida:'',actualizadoEn:0})),
    personalPorDia:[],actualizadoEn:1,configActualizadoEn:1};
}
module.exports={cargarCliente,crearNube,crearTareo,clonar,espera,leerDisco};
