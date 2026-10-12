/* Catálogo de equipos (maestro): id estable, código único, equipos del mismo tipo distinguibles, máquina compartida, activo/inactivo, permisos y vínculo con
   los nombres que usa Producción (sin inferir por palabras). */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const clon=v=>JSON.parse(JSON.stringify(v));

const docs=new Map();
const oyentes=[];
const db={collection:()=>({doc:id=>({__k:'sync/'+id,get:async()=>({exists:docs.has('sync/'+id),data:()=>clon(docs.get('sync/'+id))}),
    onSnapshot(cb){const f=()=>cb({exists:docs.has('sync/'+id),data:()=>clon(docs.get('sync/'+id))});oyentes.push(f);f();return()=>{};}})}),
  runTransaction:async fn=>{const w=[];const tx={get:async r=>({exists:docs.has(r.__k),data:()=>clon(docs.get(r.__k))}),set:(r,d,o)=>w.push([r,d,o])};
    const res=await fn(tx);w.forEach(([r,d,o])=>{docs.set(r.__k,o&&o.merge?Object.assign({},docs.get(r.__k)||{},clon(d)):clon(d));});oyentes.slice().forEach(f=>f());return res;}};
function dispositivo(usuario,opc){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Promise,Error,setInterval:()=>0,clearInterval(){},db};
  vm.createContext(sb);sb.window=sb;sb.state={user:usuario};sb.glacialCierresSesion=[];sb.tareoAhoraServidor=()=>Date.now();
  sb.esMantCompartido=u=>String(u.rol)==='mantenimiento_compartido';sb.esUsuarioSoloConsulta=u=>['Gerente General'].includes(u.rol);
  sb.puedeGestionarRotacionMtto=()=>!!(opc&&opc.supervisor);sb.LINES=[{key:'PET1',name:'PET 1'},{key:'PET2',name:'PET 2'}];
  vm.runInContext(leer('js/mantenimiento/37c-equipos-catalogo.js'),sb);
  vm.runInContext(leer('js/mantenimiento/37d-equipos-maestro.js'),sb);
  return sb;
}
(async()=>{
  const adm=dispositivo({rol:'Administrador',username:'adm',nombre:'Admin'});
  const E=adm.glacialEquiposMaestro,G=adm.glacialEquipos;
  ok(E.puedeConfigurar()&&!dispositivo({rol:'mantenimiento_compartido',username:'m'}).glacialEquiposMaestro.puedeConfigurar()&&!dispositivo({rol:'Gerente General',username:'g'}).glacialEquiposMaestro.puedeConfigurar(),'configuran el Administrador y el Supervisor de Mantenimiento; la cuenta compartida y la consulta no');
  ok(E.lista().length===0&&E.delaLinea('PET1').length===0,'no hay ningún inventario precargado');
  const base={codigo:'PET1-SOP-01',nombre:'Sopladora 1',linea:'PET1',tipo:'Sopladora',compartidoCon:[],activo:true,datos:{marca:'Sidel',modelo:'',serie:'',notas:''}};
  const a=await E.guardar(base);
  ok(a.id&&/^eq_/.test(a.id)&&a.actualizadoPor==='Admin'&&docs.get('sync/configMantenimiento').equiposMaestro.length===1,'crea un equipo con ID estable y autor');
  const b=await E.guardar(Object.assign({},base,{codigo:'PET1-SOP-02',nombre:'Sopladora 2'}));
  ok(E.delaLinea('PET1').length===2&&a.id!==b.id,'dos equipos del mismo tipo en la misma línea se distinguen');
  const casos=[[{codigo:'PET1-SOP-01',nombre:'Otra'},/código/],[{codigo:'X-1',nombre:'Sopladora 2'},/Ya existe «Sopladora 2»/],[{codigo:'',nombre:'Algo'},/código/],[{codigo:'ZZ-1',nombre:'Z',tipo:'Tipo'},/nombre/],[{codigo:'ZZ-2',nombre:'Zeta',tipo:''},/tipo/],[{codigo:'ZZ-3',nombre:'Zeta',linea:'XX'},/línea/],[{codigo:'ZZ-4',nombre:'Zeta',compartidoCon:['PET1']},/compartida/]];
  for(const [x,re] of casos){let m='';try{await E.guardar(Object.assign({},base,x));}catch(e){m=e.message;}ok(re.test(m),'rechaza: '+JSON.stringify(x).slice(0,60));}
  const comp=await E.guardar({codigo:'COMP-01',nombre:'Compresor central',linea:'PLANTA',tipo:'Compresor',compartidoCon:['PET1','PET2'],activo:true,datos:{}});
  ok(E.delaLinea('PET1').some(e=>e.id===comp.id)&&E.delaLinea('PET2').some(e=>e.id===comp.id)&&E.delaLinea('B7L').length===0,'una máquina compartida aparece en las líneas con las que se comparte (ubicación explícita)');
  const antes=a.nombre;
  const editado=await E.guardar(Object.assign({},a,{nombre:'Sopladora principal'}),{esperadoEn:a.actualizadoEn});
  ok(editado.id===a.id&&editado.nombre==='Sopladora principal'&&antes==='Sopladora 1','cambiar el nombre no cambia el ID (estable)');
  let m='';try{await E.guardar(Object.assign({},a,{nombre:'Otro cambio'}),{esperadoEn:a.actualizadoEn-5});}catch(e){m=e.message;}
  ok(/cambió mientras lo editabas/.test(m),'dos personas editando: no se pisa el cambio de la otra');
  await E.cambiarActivo(b.id,false);
  ok(E.delaLinea('PET1').every(e=>e.id!==b.id)&&E.delaLinea('PET1',{incluirInactivos:true}).some(e=>e.id===b.id)&&E.porId(b.id).activo===false,'un equipo inactivo no se ofrece pero se conserva para el historial');
  ok(docs.get('sync/configMantenimiento').equiposMaestro.length===3,'nada se borra');
  /* Producción: el nombre guardado como texto */
  ok(E.buscarPorNombre('PET1','sopladora principal').id===a.id&&E.buscarPorNombre('PET1','Sopladora')===null&&E.buscarPorNombre('PET1','Lavadora')===null,'el texto de Producción se vincula solo si coincide EXACTAMENTE con un equipo; «Sopladora» a secas no se infiere');
  await E.guardar({codigo:'PET1-SOP-03',nombre:'Sopladora principal',linea:'PET1',tipo:'Sopladora',activo:true,datos:{}}).catch(()=>{});
  ok(G.lista('PET1').includes('Sopladora principal')&&!G.lista('PET1').includes('Sopladora 2'),'37c ofrece a Producción los nombres del catálogo (solo activos)');
  ok(G.lista('B7L').includes('Rinser'),'una línea sin equipos en el catálogo conserva la lista de nombres de siempre');
  ok(!/arrayUnion|increment\(|array-contains|'!='/.test(leer('js/mantenimiento/37d-equipos-maestro.js').replace(/\/\*[^]*?\*\//g,'')),'compatible con el puente de Supabase');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
