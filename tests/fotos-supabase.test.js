/* Fotos privadas en Supabase Storage (js/produccion/06b-fotos-supabase.js) — lógica sin navegador + integración con 06/07 e index.html.
   Uso: node tests/fotos-supabase.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,m)=>{console.log((c?'✔ ':'✘ FALLA ')+m);if(!c)fallas++;};
const leer=f=>fs.readFileSync(path.join(R,f),'utf8').replace(/\r\n/g,'\n');

function entorno(conCliente){
  const sb={console,Date,Promise,Map,Set,Array,Object,String,Number,JSON,Error,setTimeout,clearTimeout};
  vm.createContext(sb);sb.window=sb;
  const llamadas={subidas:[],firmas:[]};
  if(conCliente){
    sb.glacialSupabaseCliente={storage:{from:b=>({
      upload:async(ruta,blob,op)=>{llamadas.subidas.push({b,ruta,op});return ruta.includes('falla')?{error:{message:'Bucket not found'}}:{data:{path:ruta}};},
      createSignedUrls:async(rutas,ttl)=>{llamadas.firmas.push({rutas:rutas.slice(),ttl});return {data:rutas.map(r=>({path:r,signedUrl:'https://x.supabase.co/sign/'+r+'?token=T'+llamadas.firmas.length,error:null}))};}})}};
  }
  vm.runInContext(fs.readFileSync(path.join(R,'js/produccion/06b-fotos-supabase.js'),'utf8'),sb);
  return {F:sb.glacialFotos,llamadas};
}
(async()=>{
  const {F,llamadas}=entorno(true);
  ok(F.disponible()&&F.BUCKET==='glacial-fotos'&&F.PREFIJO==='supabase:glacial-fotos/','el módulo se activa con el cliente de Supabase');
  ok(!entorno(false).F.disponible(),'sin cliente de Supabase no está disponible (la página vuelve a Cloudinary)');
  const r=await F.subir({type:'image/jpeg'},{carpeta:'hojas_producto_terminado/r_1/',id:'ev_9',tipo:'image/jpeg'});
  ok(r.url==='supabase:glacial-fotos/hojas_producto_terminado/r_1/ev_9.jpg'&&r.path==='hojas_producto_terminado/r_1/ev_9.jpg'&&r.proveedor==='supabase'&&llamadas.subidas[0].b==='glacial-fotos'&&llamadas.subidas[0].op.upsert===false,'sube al bucket privado, nunca sobrescribe y guarda una REFERENCIA (no un enlace)');
  let err=null;try{await F.subir({type:'image/jpeg'},{carpeta:'c',id:'falla'});}catch(e){err=e;}ok(err&&/Bucket not found/.test(err.message),'un error de Supabase sube como error (para el respaldo a Cloudinary)');
  ok(F.esRef(r.url)&&!F.esRef('https://res.cloudinary.com/c0vr6joq/image/upload/v1/x.jpg')&&F.rutaDe(r.url)===r.path,'distingue referencias de Supabase de enlaces de Cloudinary');
  const cl='https://res.cloudinary.com/c0vr6joq/image/upload/v1/hojas/x.jpg';
  ok(await F.resolver(cl)===cl&&llamadas.firmas.length===0,'las fotos antiguas de Cloudinary se devuelven tal cual (sin llamar a Supabase)');
  const u1=await F.resolver(r.url);
  ok(/^https:\/\/x\.supabase\.co\/sign\/hojas_producto_terminado\/r_1\/ev_9\.jpg\?token=/.test(u1)&&llamadas.firmas[0].ttl===3600,'una referencia se convierte en enlace firmado que caduca en 1 hora');
  await F.resolver(r.url);ok(llamadas.firmas.length===1,'la firma se guarda en memoria: no se vuelve a pedir');
  const m=await F.firmarRutas(['a/1.jpg','a/2.jpg','a/3.jpg','a/1.jpg']);
  ok(llamadas.firmas.length===2&&llamadas.firmas[1].rutas.length===3&&m.size===3,'varias fotos se firman en UNA sola llamada (sin repetir)');
  const [p1,p2]=await Promise.all([F.resolver('supabase:glacial-fotos/b/1.jpg'),F.resolver('supabase:glacial-fotos/b/1.jpg')]);
  ok(p1===p2&&llamadas.firmas.length===3,'dos pedidos simultáneos de la misma foto comparten la misma firma');
  ok(/data-foto-ref="supabase:glacial-fotos\/x\.jpg"/.test(F.atributosImg('supabase:glacial-fotos/x.jpg'))&&F.atributosImg('supabase:glacial-fotos/x.jpg').includes(F.PIXEL)&&F.atributosImg(cl)===`src="${cl}"`,'HTML: referencia → marcador a firmar; Cloudinary → src directo');
  ok(F.atributosEnlace(cl)===`href="${cl}"`&&/href="#" data-foto-ref=/.test(F.atributosEnlace('supabase:glacial-fotos/x.jpg')),'HTML de enlaces igual');
  ok(F.atributosImg('supabase:glacial-fotos/x"><script>.jpg').indexOf('"><script>')<0,'el atributo va escapado');

  /* integración con el resto de la página */
  const reg=leer('js/produccion/06-registro.js'),his=leer('js/produccion/07-historial.js'),html=leer('index.html'),puente=leer('js/nucleo/00b-puente-supabase.js');
  ok(/window\.glacialFotos\.disponible\(\)/.test(reg)&&/glacialFotos\.subir\(/.test(reg)&&/proveedor:\s*'supabase'/.test(reg)&&!/cloudinary/i.test(reg),'06: sube a Supabase Storage y ya no usa Cloudinary');
  ok(/histFotoEnlace\(url\)/.test(his)&&/histFotoImg\(url\)/.test(his)&&/histFotoImg\(e\.url\)/.test(his),'07: el historial muestra las fotos con enlace firmado');
  ok(/glacialSupabaseCliente\s*=\s*T\.sb/.test(puente),'el puente expone el cliente de Supabase (con la sesión del usuario)');
  const pos=n=>html.indexOf(n);
  ok(pos('js/nucleo/00b-puente-supabase.js')<pos('js/produccion/06b-fotos-supabase.js')&&pos('js/produccion/06b-fotos-supabase.js')<pos('js/produccion/06-registro.js'),'index.html: el puente, luego 06b y después 06-registro');
  const mant=leer('js/mantenimiento/67d-intervenciones-evidencias.js'),asis=leer('js/asistente/72-asistente-pantalla.js');
  ok(/glacialFotos\.subir\(blob,\{carpeta,id:publicId/.test(mant)&&!/cloudinary/i.test(mant.replace(/\/\*[^]*?\*\//g,''))&&/proveedorDe\(it\.publicId\)/.test(mant)&&(mant.match(/srcDe\(/g)||[]).length>=3,'Mantenimiento: sube a Supabase, registra el proveedor y muestra con enlace firmado (sin Cloudinary)');
  ok(/glacialFotos\.subir\(file,\{carpeta:'asistente\//.test(asis)&&!/CLOUDINARY_UPLOAD_PRESET|api\.cloudinary/.test(asis),'Asistente de Producción: evidencia a Supabase (carpeta asistente/), sin Cloudinary');
  const {F:F2}=entorno(true);const pdf=await F2.subir({type:'application/pdf'},{carpeta:'asistente/2026-10',id:'ev1',tipo:'application/pdf'});
  ok(pdf.path==='asistente/2026-10/ev1.pdf','los PDF del Asistente conservan su extensión');
  const sql=leer('supabase/migraciones/glacial_25_fotos_privadas.sql');
  ok(/'glacial-fotos',\s*'glacial-fotos',\s*false/.test(sql)&&/for select to authenticated/.test(sql)&&/for insert to authenticated/.test(sql)&&!/for (update|delete)/.test(sql)&&/hojas_producto_terminado\/%/.test(sql)&&/mantenimiento\/%/.test(sql)&&/asistente\/%/.test(sql)&&/application\/pdf/.test(sql),'migración: bucket privado, 3 carpetas, leer y subir con sesión, sin actualizar ni borrar');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})();
