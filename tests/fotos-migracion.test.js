/* Migración de fotos antiguas de Cloudinary a Supabase (js/produccion/06c-migrar-fotos.js). Uso: node tests/fotos-migracion.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,m)=>{console.log((c?'✔ ':'✘ FALLA ')+m);if(!c)fallas++;};

function entorno(rol,fallos){
  fallos=fallos||{};
  const sb={console,Date,Promise,Map,Set,Array,Object,String,Number,JSON,Error,RegExp,Math,setTimeout,clearTimeout};
  vm.createContext(sb);sb.window=sb;
  const subidos=new Map(),firmas=[];
  sb.glacialSupabaseCliente={storage:{from:()=>({
    upload:async(ruta,blob,op)=>{if(subidos.has(ruta)&&!op.upsert)return {error:{message:'The resource already exists'}};if(fallos.subida&&ruta.includes(fallos.subida))return {error:{message:'Payload too large'}};subidos.set(ruta,blob);return {data:{path:ruta}};},
    createSignedUrls:async rutas=>{firmas.push(rutas.length);return {data:rutas.map(r=>({path:r,signedUrl:subidos.has(r)?'https://x/s/'+r:null,error:subidos.has(r)?null:'not found'}))};}})}};
  const registros=[
    {id:'r1',fecha:'2026-10-01',turno:'DÍA',estadoRegistro:'FINALIZADO',evidenciasPT:[{id:'e1',nombre:'a.jpg',url:'https://res.cloudinary.com/c0vr6joq/image/upload/v1/hojas/r1/a.jpg',publicId:'hojas/r1/a'},{id:'e2',nombre:'b.jpg',url:'https://res.cloudinary.com/c0vr6joq/image/upload/v1/hojas/r1/b.jpg',publicId:'hojas/r1/b'}]},
    {id:'r2',fecha:'2026-10-02',turno:'NOCHE',estadoRegistro:'FINALIZADO',evidenciasPT:[{id:'e3',url:'https://res.cloudinary.com/c0vr6joq/image/upload/v1/hojas/r2/c.jpg',publicId:'hojas/r2/c'}]},
    {id:'r3',fecha:'2026-10-03',evidenciasPT:[{id:'e4',url:'supabase:glacial-fotos/hojas_producto_terminado/r3/e4.jpg'}]},   // ya en Supabase
    {id:'r4',fecha:'2026-10-04',evidenciasPT:[]},{id:'r5',fecha:'2026-10-05'}];
  const doc={items:JSON.parse(JSON.stringify(registros))};let escrituras=0;
  sb.db={collection:()=>({doc:()=>({k:'sync/records'})}),runTransaction:async fn=>{const w=[];await fn({get:async()=>({exists:true,data:()=>JSON.parse(JSON.stringify(doc))}),set:(r,d)=>w.push(d)});w.forEach(d=>{Object.assign(doc,JSON.parse(JSON.stringify(d)));escrituras++;});}};
  sb.state={user:{rol,nombre:'Admin'}};
  sb.loadRecords=()=>doc.items;
  sb.fetch=async url=>{
    if(fallos.descarga&&url.includes(fallos.descarga))return {ok:false,status:404,blob:async()=>null};
    return {ok:true,status:200,blob:async()=>({size:1234,type:'image/jpeg',url})};
  };
  vm.runInContext(fs.readFileSync(path.join(R,'js/produccion/06b-fotos-supabase.js'),'utf8'),sb);
  vm.runInContext(fs.readFileSync(path.join(R,'js/produccion/06c-migrar-fotos.js'),'utf8'),sb);
  return {sb,M:sb.glacialMigrarFotos,doc,subidos,firmas,escrituras:()=>escrituras};
}
(async()=>{
  let e=entorno('Administrador');
  const p=e.M.pendientes();
  ok(p.length===2&&e.M.total(p)===3&&p[0].recordId==='r1'&&p[0].fotos.length===2,'detecta las fotos que siguen en Cloudinary (3 en 2 registros; ignora las de Supabase y los registros sin fotos)');
  ok(e.M.visible()===true&&entorno('Supervisor').M.visible()===false,'solo el Administrador ve la herramienta');
  let err=null;try{await entorno('Supervisor').M.migrar();}catch(x){err=x;}ok(err&&/Administrador/.test(err.message),'otro rol no puede migrar');

  const sim=await e.M.migrar({simular:true});
  ok(sim.simulado&&sim.fotosOk===3&&e.subidos.size===0&&e.escrituras()===0&&e.M.total(e.M.pendientes())===3,'«Probar descarga» no sube ni cambia nada');

  const progreso=[];
  const r=await e.M.migrar({alProgreso:x=>progreso.push(x.hechas)});
  ok(r.fotosOk===3&&r.fotosError===0&&e.subidos.size===3&&e.subidos.has('hojas_producto_terminado/r1/e1.jpg')&&e.subidos.has('hojas_producto_terminado/r2/e3.jpg'),'migra: sube cada foto a hojas_producto_terminado/<registro>/<foto>.jpg');
  ok(progreso.length>=4&&progreso[progreso.length-1]===3,'informa el avance');
  const ev=e.doc.items[0].evidenciasPT[0];
  ok(ev.url==='supabase:glacial-fotos/hojas_producto_terminado/r1/e1.jpg'&&ev.publicId==='hojas_producto_terminado/r1/e1.jpg'&&ev.proveedor==='supabase'&&ev.urlCloudinary==='https://res.cloudinary.com/c0vr6joq/image/upload/v1/hojas/r1/a.jpg'&&ev.publicIdCloudinary==='hojas/r1/a'&&ev.migradaEn>0&&ev.migradaPor==='Admin','el registro queda con la referencia de Supabase y CONSERVA la dirección de Cloudinary como respaldo');
  ok(e.escrituras()===2,'se guarda de a UN registro (2 transacciones para 2 registros)');
  ok(e.doc.items[2].evidenciasPT[0].url.startsWith('supabase:')&&e.doc.items.length===5&&e.doc.items[4].evidenciasPT===undefined,'no toca los demás registros');
  ok(e.M.total(e.M.pendientes())===0&&e.M.visible()===false,'ya no quedan pendientes y desaparece el botón');
  const r2=await e.M.migrar();ok(r2.fotosTotal===0&&e.escrituras()===2,'repetir no hace nada');

  /* fallos: una foto no existe en Cloudinary; una falla al subir */
  e=entorno('Administrador',{descarga:'/b.jpg',subida:'/r2/'});
  const rf=await e.M.migrar();
  ok(rf.fotosOk===1&&rf.fotosError===2&&rf.errores.length===2&&/404/.test(rf.errores[0].mensaje)&&/Payload/.test(rf.errores[1].mensaje),'las fotos con error quedan registradas y NO detienen a las demás');
  const ok1=e.doc.items[0].evidenciasPT,mal2=e.doc.items[1].evidenciasPT[0];
  ok(ok1[0].url.startsWith('supabase:')&&ok1[1].url.startsWith('https://res.cloudinary.com')&&mal2.url.startsWith('https://res.cloudinary.com'),'la que falló sigue apuntando a Cloudinary (nada se pierde)');
  ok(e.M.total(e.M.pendientes())===2,'al repetir solo quedan las 2 pendientes');
  /* una foto subida pero cuyo registro no se guardó se reutiliza al repetir */
  e=entorno('Administrador');e.subidos.set('hojas_producto_terminado/r1/e1.jpg',{});
  const rr=await e.M.migrar();ok(rr.fotosOk===3&&rr.fotosError===0,'una foto ya subida (repetición) se reutiliza sin error');
  const cancelado=await entorno('Administrador').M.migrar({cancelado:()=>true});ok(cancelado.cancelada&&cancelado.fotosOk===0,'se puede cancelar');
  /* integración */
  const his=fs.readFileSync(path.join(R,'js/produccion/07-historial.js'),'utf8'),html=fs.readFileSync(path.join(R,'index.html'),'utf8');
  ok(/glacialMigrarFotos\.abrir\(\)/.test(his)&&html.indexOf('06b-fotos-supabase.js')<html.indexOf('06c-migrar-fotos.js')&&html.indexOf('06c-migrar-fotos.js')<html.indexOf('07-historial.js'),'el botón está en el Historial y 06c carga después de 06b');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})();
