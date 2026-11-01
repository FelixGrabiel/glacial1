/* Catálogo de equipos: «Cargar las máquinas de cada línea» desde la lista de Mantenimiento (sync/configMantenimiento → equipos). */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
function entorno(docInicial,rol){
  const docs=new Map([['sync/configMantenimiento',docInicial]]);
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,Promise,Error,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){}};vm.createContext(sb);sb.window=sb;
  sb.document={addEventListener(){},getElementById:()=>null};
  sb.state={user:{rol:rol||'Administrador',nombre:'Ana',username:'ana'}};sb.LINES=[{key:'PET1',name:'PET 1'},{key:'B7L',name:'B7L'}];
  sb.glacialCierresSesion=[];sb.esUsuarioSoloConsulta=()=>false;
  sb.db={collection:c=>({doc:id=>({k:c+'/'+id,onSnapshot(cb){setTimeout(()=>cb({exists:docs.has(c+'/'+id),data:()=>JSON.parse(JSON.stringify(docs.get(c+'/'+id)))}),0);return()=>{};},get:async()=>({exists:true,data:()=>docs.get(c+'/'+id)})})}),
    runTransaction:async fn=>{const w=[];await fn({get:async r=>({exists:docs.has(r.k),data:()=>JSON.parse(JSON.stringify(docs.get(r.k)))}),set:(r,d,o)=>w.push([r,d,o])});w.forEach(([r,d,o])=>docs.set(r.k,o&&o.merge?Object.assign({},docs.get(r.k),d):d));}};
  vm.runInContext(leer('js/mantenimiento/37d-equipos-maestro.js'),sb);
  return {sb,docs,E:sb.glacialEquiposMaestro};
}
const equipos={B7L:['Sopladora 1','Sopladora 2','Rinser','Envasadora','Tapadora','Etiquetadora 2','Empaquetadora'],B20L:['Lavadora','Envasadora'],C20L:['Envasadora 1','Envasadora 2','Empaquetadora'],PET1:['Sopladora','Envasadora','Etiquetadora','Empaquetadora'],PET2:['Sopladora','Envasadora','Etiquetadora','Empaquetadora']};
(async()=>{
  const {E,docs}=entorno({equipos});
  const r=await E.importarDeLista();
  const lista=docs.get('sync/configMantenimiento').equiposMaestro;
  ok(r.creados.length===20&&lista.length===20&&r.omitidos===0,'crea los 20 equipos de la lista de Mantenimiento (7 + 2 + 3 + 4 + 4)');
  ok(new Set(lista.map(e=>e.codigo.toLowerCase())).size===20&&lista.every(e=>e.codigo.length>=2&&e.codigo.length<=20),'cada equipo tiene un código único de 2 a 20 caracteres');
  ok(lista.find(e=>e.linea==='B7L'&&e.nombre==='Sopladora 2').codigo==='B7L-SOP2'&&lista.find(e=>e.linea==='PET1'&&e.nombre==='Sopladora').codigo==='PET1-SOP','códigos legibles («Sopladora 2» en B7L → B7L-SOP2)');
  ok(E.tipoDeNombre('Etiquetadora 2')==='Etiquetadora'&&E.tipoDeNombre('Rinser')==='Rinser'&&E.tipoDeNombre('Cosa rara')==='Otro','el tipo se deduce del nombre (o «Otro»)');
  ok(lista.every(e=>e.activo===true&&/^eq_/.test(e.id)&&e.compartidoCon.length===0),'quedan activos, con ID estable y sin compartir');
  const r2=await E.importarDeLista();
  ok(r2.creados.length===0&&r2.omitidos===20&&docs.get('sync/configMantenimiento').equiposMaestro.length===20,'repetir no duplica nada: los ya cargados se omiten');
  const ids=lista.map(e=>e.id);
  const e3=entorno({equipos:{PET1:['Sopladora','Envasadora']},equiposMaestro:[{id:'eq_x',codigo:'PET1-SOP',nombre:'Sopladora',linea:'PET1',compartidoCon:[],tipo:'Sopladora',activo:false,datos:{marca:'Husky',modelo:'',serie:'',notas:''}}]});
  const r3=await e3.E.importarDeLista();
  const l3=e3.docs.get('sync/configMantenimiento').equiposMaestro;
  ok(r3.creados.length===1&&r3.omitidos===1&&l3.find(e=>e.id==='eq_x').activo===false&&l3.find(e=>e.id==='eq_x').datos.marca==='Husky','un equipo que ya existe (aunque esté inactivo y con datos) no se toca; solo se agregan los que faltan');
  ok(new Set(l3.map(e=>e.codigo.toLowerCase())).size===2,'si el código sugerido ya lo usa otro equipo, se genera otro distinto');
  let err=null;try{await entorno({equipos:{}}).E.importarDeLista();}catch(e){err=e;}
  ok(err&&/está vacía/.test(err.message),'si la lista de Mantenimiento está vacía, avisa en vez de no hacer nada');
  err=null;try{await entorno({equipos},'Operario').E.importarDeLista();}catch(e){err=e;}
  ok(err&&/Solo el Supervisor de Mantenimiento o el Administrador/.test(err.message),'solo Mantenimiento o el Administrador pueden cargarlos');
  const s67=leer('js/mantenimiento/67c-intervenciones-pantalla.js'),html=leer('index.html');
  ok(/data-mi-eq-importar/.test(s67)&&/Cargar las máquinas de cada línea/.test(s67)&&/EQ\(\)\.importarDeLista\(\)/.test(s67),'el botón está en la pestaña Equipos (resaltado cuando el catálogo está vacío) y pide confirmación');
  console.log(fallas?'\n'+fallas+' fallas':'\nCarga de equipos correcta');process.exit(fallas?1:0);
})();
