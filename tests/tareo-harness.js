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
  // items = sync/tareos; docs = tareos/{id} (modo documento por tareo). Cada documento tiene su versión: una transacción cuyo documento
  // leído cambió antes de confirmar se reintenta (5 intentos, como Firestore) y luego falla con el mensaje real de versión.
  const nube={items:[],version:0,docs:new Map(),docVer:new Map(),oyentes:[],latencia:opc.latencia||0,latenciaSnapshot:opc.latenciaSnapshot||0,
    latenciaCommit:opc.latenciaCommit||0,porDocumento:!!opc.porDocumento,caida:false,codigoCaida:'',forzarConflictos:0,
    transacciones:0,conflictos:0,escriturasLegado:0,escriturasDocs:0};
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
  const versionDe=ruta=>ruta==='sync/tareos'?nube.version:(nube.docVer.get(ruta.slice(7))||0);
  const leerDoc=ruta=>{
    if(ruta==='sync/tareos')return {exists:true,data:()=>({items:clonar(nube.items)})};
    const id=ruta.slice(7);
    return nube.docs.has(id)?{exists:true,data:()=>clonar(nube.docs.get(id))}:{exists:false,data:()=>undefined};
  };
  const escribir=(ruta,d)=>{
    if(ruta==='sync/tareos'){nube.items=clonar(d.items);nube.version++;nube.escriturasLegado++;return;}
    const id=ruta.slice(7);nube.docs.set(id,clonar(d));nube.docVer.set(id,(nube.docVer.get(id)||0)+1);nube.escriturasDocs++;
  };
  const db={
    collection:n=>({doc:id=>({ruta:n==='sync'?'sync/tareos':n+'/'+id,id}),add:async()=>({})}),
    runTransaction:async fn=>{
      for(let intento=1;;intento++){
        await espera(nube.latencia);
        nube.transacciones++;
        const leidas=new Map(),escrituras=[];
        const tx={get:async ref=>{leidas.set(ref.ruta,versionDe(ref.ruta));return leerDoc(ref.ruta);},set:(ref,d)=>{escrituras.push([ref.ruta,clonar(d)]);}};
        const r=await fn(tx);
        if(nube.latenciaCommit)await espera(nube.latenciaCommit);
        if(nube.caida)throw nube.codigoCaida?Object.assign(new Error('Failed to get document because the client is offline.'),{code:nube.codigoCaida}):new Error('sin red');
        const choque=[...leidas].find(([ruta,v])=>versionDe(ruta)!==v);
        if(choque||nube.forzarConflictos>0){
          if(nube.forzarConflictos>0)nube.forzarConflictos--;
          nube.conflictos++;
          if(intento>=5)throw Object.assign(new Error('the stored version (1791991570656154) does not match the required base version (1791991565423214)'),{code:'failed-precondition'});
          continue;
        }
        escrituras.forEach(([ruta,d])=>escribir(ruta,d));
        if(escrituras.length)nube.emitir();
        return r;
      }
    }
  };
  const sb={console,Date,JSON,Promise,Error,Map,Set,Array,Object,String,Number,Math,setTimeout,clearTimeout,Boolean,RegExp,parseInt,parseFloat,isNaN,Intl,encodeURIComponent};
  sb.window=sb;sb.globalThis=sb;sb.db=db;sb.TAREO_POR_DOCUMENTO=nube.porDocumento;sb.TAREO_ESPERA_BASE_MS=5;
  const el=()=>({addEventListener(){},appendChild(){},style:{},classList:{add(){},remove(){},toggle(){}},querySelectorAll:()=>[],querySelector:()=>null,setAttribute(){},getAttribute:()=>null,contains:()=>false});
  sb.document={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},head:el(),body:el(),createElement:()=>el(),activeElement:null,readyState:'complete'};
  // Almacenamiento del navegador: opc.almacen (un Map compartido entre «pestañas» o tras «recargar») o uno propio.
  const almacen=opc.almacen||new Map();
  sb.localStorage={getItem:k=>almacen.has(k)?almacen.get(k):null,setItem:(k,v)=>almacen.set(k,String(v)),removeItem:k=>almacen.delete(k)};
  sb.sessionStorage=sb.localStorage;sb.addEventListener=()=>{};sb.removeEventListener=()=>{};
  sb.navigator={onLine:true};
  sb.alert=m=>log.alertas.push(m);sb.confirm=m=>{log.confirmas.push(m);return typeof opc.confirmar==='function'?opc.confirmar(m,log.confirmas.length):(opc.confirmar===undefined?true:opc.confirmar);};
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
  if(!ref) vm.runInContext(leerDisco('js/personal/13n-tareo-nube.js'),sb,{filename:'13n.js'});
  vm.runInContext(leer('js/personal/13-tareo.js'),sb,{filename:'13-tareo.js'});
  sb.renderTareoFormulario=function(){log.renders++;};
  if(!ref||ref==='conEdicion') vm.runInContext(leerDisco('js/personal/45-tareo-edicion-continua.js'),sb,{filename:'45.js'});
  sb.tareoAreasEditables=()=>opc.areas||['Producción','Mantenimiento'];
  // Mismo tratamiento del listener que 02-estado.js (versión cargada).
  const src02=leer('js/nucleo/02-estado.js');
  const reconcilia=/TareoEd\.reconciliar/.test(src02);
  nube.oyentes.push(items=>{
    // Como 02-estado.js: con documento por tareo se combinan sync/tareos y tareos/{id}.
    if(nube.porDocumento&&sb.TareoNube)items=sb.TareoNube.combinar(items,[...nube.docs].map(([id,d])=>({id,data:clonar(d)})));
    sb._tareosCache=(reconcilia&&sb.TareoEd)?sb.TareoEd.reconciliar(items):items;
    if(typeof sb.tareoRefrescarFormularioRemoto==='function'){ try{sb.tareoRefrescarFormularioRemoto();}catch(_){/* sin pantalla */} }
  });
  const cliente={sb,log,nube};
  cliente.vista=()=>nube.porDocumento&&sb.TareoNube?sb.TareoNube.combinar(clonar(nube.items),[...nube.docs].map(([id,d])=>({id,data:clonar(d)}))):clonar(nube.items);
  cliente.abrir=id=>{sb._tareosCache=cliente.vista();sb.tareoActualId=id;};
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
