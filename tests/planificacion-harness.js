/* Entorno compartido de las pruebas de Planificación (etapa 2): la página real (16 + 45 + 51–54 + 64) conectada a una «nube» falsa con
   transacciones optimistas, consultas con orderBy/limit/onSnapshot, reloj controlable y varios dispositivos. */
const fs=require('fs'),vm=require('vm');
const R=require('path').resolve(__dirname,'..');
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const clon=v=>JSON.parse(JSON.stringify(v));
function extraer(src,n){const m=new RegExp('(?:async[ ]+)?function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error('no se encontró '+n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}return src.slice(m.index,j+1)+'\n';}
const s16=leer('js/produccion/16-paletas.js');
const FUNC16=['normalizarClavePaletas','claveCombinacionPaletas','esCombinacionPaletas','claveProgramacionPaleta','obtenerProgramacionPaleta','programacionValorHistorial','programacionConflicto','programacionAplicarEnLista','guardarProgramacionPaleta'].map(n=>extraer(s16,n)).join('');

function nube(){
  const docs=new Map(),ver=new Map(),oyentes=[];let confirmaciones=0;
  const N={docs,falla:false,denegar:[],confirmaciones:()=>confirmaciones,oyentes};
  const ts=v=>{if(v==='__TS__')return Date.now();if(Array.isArray(v))return v.map(ts);if(v&&typeof v==='object'){const o={};Object.keys(v).forEach(k=>o[k]=ts(v[k]));return o;}return v;};
  const consulta=(c,orden,lim)=>({orderBy:(campo,dir)=>consulta(c,[campo,dir],lim),limit:n=>consulta(c,orden,n),
    _docs(){let l=[...docs.entries()].filter(([k])=>k.startsWith(c+'/')).map(([k,v])=>({id:k.slice(c.length+1),v}));
      if(orden){l.sort((a,b)=>String(b.v[orden[0]]).localeCompare(String(a.v[orden[0]])));if(orden[1]!=='desc')l.reverse();}if(lim)l=l.slice(0,lim);
      return l.map(x=>({id:x.id,data:()=>clon(x.v)}));},
    onSnapshot(cb){const self=this,f=()=>cb({docs:self._docs(),docChanges:()=>self._docs().map(d=>({type:'added',doc:d}))});oyentes.push(f);f();return()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};},
    get(){return Promise.resolve({docs:this._docs()});}});
  N.db={
    collection:c=>Object.assign(consulta(c,null,0),{doc:id=>({__c:c,__id:id,__k:c+'/'+id,
      get:async()=>{const d=docs.get(c+'/'+id);return {exists:d!==undefined,data:()=>clon(d)};},
      onSnapshot(cb){const f=()=>{const d=docs.get(c+'/'+id);cb({exists:d!==undefined,data:()=>clon(d)});};oyentes.push(f);f();return()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};}})}),
    runTransaction:async fn=>{
      for(let intento=0;intento<5;intento++){
        const lect=new Map(),w=[];
        const tx={get:async r=>{await Promise.resolve();lect.set(r.__k,ver.get(r.__k)||0);const d=docs.get(r.__k);return {exists:d!==undefined,data:()=>clon(d)};},
          set:(r,d)=>w.push(['set',r,d]),update:(r,d)=>w.push(['upd',r,d])};
        const res=await fn(tx);
        await new Promise(r=>setTimeout(r,1));
        let choque=false;lect.forEach((v,k)=>{if((ver.get(k)||0)!==v)choque=true;});
        if(choque)continue;
        if(N.falla)throw new Error('sin red');
        if(w.some(([,r])=>N.denegar.includes(r.__c)))throw new Error('permission-denied: '+w.find(([,r])=>N.denegar.includes(r.__c))[1].__c);
        w.forEach(([t,r,d])=>{let nd=clon(d);if(t==='upd'){nd=Object.assign({},docs.get(r.__k),nd);}docs.set(r.__k,ts(nd));ver.set(r.__k,(ver.get(r.__k)||0)+1);});
        if(w.length)confirmaciones++;oyentes.slice().forEach(f=>f());
        return res;
      }
      throw new Error('aborted');
    }};
  return N;
}

function dispositivo(N,usuario,opc){
  opc=opc||{};
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout,clearTimeout,Error,RegExp,parseInt,parseFloat,isNaN};vm.createContext(sb);sb.window=sb;
  const oy=[],els=new Map();
  const el=id=>{if(!els.has(id))els.set(id,{id,style:{},value:'',textContent:'',innerHTML:'',disabled:false,addEventListener(){},querySelector:()=>null});return els.get(id);};
  sb.document={addEventListener:(t,f)=>oy.push([t,f]),getElementById:id=>els.get(id)||null,createElement:()=>({style:{},innerHTML:'',addEventListener(){},appendChild(){},remove(){},querySelector:()=>null}),body:{appendChild(){},contains:()=>true},head:{appendChild(){}}};
  sb.__oyentes=oy;sb.__el=el;sb.__els=els;
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  sb.__ahora=opc.ahora||new Date('2099-03-07T12:00:00').getTime();
  sb.tareoAhoraServidor=()=>sb.__ahora;
  sb.state={user:Object.assign({rol:'Planificación',nombre:usuario.nombre,username:usuario.nombre},usuario.extra||{}),currentTab:'planificacion'};
  sb.LINES=[{key:'PET1',name:'PET 1'},{key:'PET2',name:'PET 2'},{key:'B7L',name:'B7L'}];
  sb.MARCAS_POR_LINEA={PET1:['Bells','Scala'],PET2:['Bells'],B7L:['Fontlife']};
  sb.PRESENTACIONES_POR_LINEA={PET1:['Regular_380ml','Regular_625ml'],PET2:['Regular_625ml'],B7L:['7 Litros','10 Litros']};
  sb._programacionesCache=[];sb.loadProgramaciones=()=>sb._programacionesCache;
  sb.tienePermiso=p=>p==='planificacion'?usuario.planifica!==false:false;
  sb.escaparHtml=t=>String(t==null?'':t);
  sb.obtenerUnidadesPorPalet=(l,m,p)=>p==='Regular_625ml'?1200:p==='Regular_380ml'?2184:0;
  sb.nombreUsuarioActualPaletas=()=>usuario.nombre;
  sb.glacialCierresSesion=[];sb.loadPaletas=()=>[];
  sb.firebase={auth:()=>({currentUser:{uid:'uid-'+usuario.nombre}}),firestore:{FieldValue:{serverTimestamp:()=>'__TS__'}}};
  sb.db=N.db;
  sb.confirm=m=>{sb.__confirm=m;return true;};sb.alert=m=>{sb.__alert=m;};
  vm.runInContext('var num=v=>{const n=Number(v);return isFinite(n)?n:0;};'+FUNC16,sb);
  ['51-planificacion-nucleo','52-planificacion-pantalla','53-planificacion-catalogo','54-planificacion-solicitudes'].concat(opc.sin64?[]:['64-planificacion-avance','65b-planificacion-motor','65a-planificacion-tiempos','65-planificacion-capacidad','65c-planificacion-opciones','65d-planificacion-semanal','66p-planificacion-modos','66b-planificacion-secuencia','51b-horarios-produccion']).forEach(f=>vm.runInContext(leer('js/produccion/'+f+'.js'),sb));
  const sincronizar=()=>{const d=N.docs.get('sync/programaciones');sb._programacionesCache=d&&Array.isArray(d.items)?clon(d.items):[];};
  N.oyentes.push(sincronizar);sincronizar();
  sb.NS=sb.glacialPlanificacion;
  sb.escuchar=()=>{sb.NS.escuchas.forEach(f=>{try{f();}catch(_){}});};
  return sb;
}
const F=(l,f,t,m,p,c,u,extra)=>Object.assign({id:'prog_'+Math.random().toString(36).slice(2,7),clave:[l,f,t,m,p].join('|'),linea:l,fecha:f,turno:t,marca:m,presentacion:p,cantidadProgramada:c,unidadesPorPaleta:u,paletasProgramadas:c/u,version:1,estadoOperacion:{estado:'PENDIENTE'}},extra||{});
const items=N=>(N.docs.get('sync/programaciones')||{items:[]}).items;
module.exports={nube,dispositivo,F,items,leer,clon,extraer,FUNC16,R};
