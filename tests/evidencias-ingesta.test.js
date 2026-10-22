/* Ingesta automática de evidencias de insumos: función de servidor (núcleo puro), tabla de entrada con RLS (migración glacial_33), importación automática en la
   bandeja del Asistente. Nada de esto toca stock ni se aplica en Supabase. node tests/evidencias-ingesta.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),path=require('path'),{pathToFileURL}=require('url');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');

(async()=>{
  /* ================= función de servidor: núcleo puro ================= */
  const M=await import(pathToFileURL(path.join(R,'supabase/functions/evidencias-ingesta/nucleo.mjs')).href);
  const SECRETO='secreto-de-prueba-que-supera-24-caracteres';
  const FOTO=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),crypto.randomBytes(300)]),SHA=sha(FOTO);
  const registro=(o={})=>({sha256:SHA,version_procesador:'vision-v3',archivo_original:'bolsones.jpg',extraccion:{categoria:'bolsas',tipo_documento:'etiqueta_insumo'},campos:{},...o});
  const cuerpo=(o={})=>JSON.stringify({sha256:SHA,mime:'image/jpeg',foto_base64:FOTO.toString('base64'),registro:registro(),...o});
  const pedir=async(o={})=>M.validarSolicitud({metodo:'POST',secretoRecibido:SECRETO,secretoEsperado:SECRETO,cuerpoTexto:cuerpo(),...o});

  let r=await pedir();
  ok(r.ok&&r.sha256===SHA&&r.ext==='jpg'&&r.bytes.length===FOTO.length&&r.registro.extraccion.categoria==='bolsas','solicitud válida: foto, huella y lectura aceptadas');
  ok(M.rutaFoto(SHA,'jpg')==='asistente/evidencias/'+SHA+'.jpg','la foto va a la carpeta privada que ya autorizan las reglas de storage (glacial_25)');
  r=await pedir({secretoRecibido:'otro-secreto-que-tampoco-es-el-correcto'});
  ok(!r.ok&&r.estado===401&&r.codigo==='secreto','secreto distinto: 401 antes de leer el cuerpo');
  r=await pedir({secretoRecibido:''});ok(r.estado===401,'sin secreto: 401');
  r=await pedir({secretoRecibido:undefined});ok(r.estado===401,'cabecera ausente: 401');
  r=await pedir({secretoEsperado:'corto'});ok(r.estado===500&&r.codigo==='sin_configurar','si el secreto configurado es corto (o falta) el servicio se niega a funcionar');
  r=await pedir({secretoEsperado:''});ok(r.estado===500,'sin secreto configurado: nadie entra');
  r=await pedir({metodo:'GET'});ok(r.estado===405,'solo POST');
  r=await pedir({cuerpoTexto:'no es json'});ok(r.estado===400&&r.codigo==='json','cuerpo que no es JSON');
  r=await pedir({cuerpoTexto:'[1,2]'});ok(r.estado===400,'el cuerpo debe ser un objeto');
  r=await pedir({cuerpoTexto:'x'.repeat(M.MAX_CUERPO+1)});ok(r.estado===413&&r.codigo==='demasiado_grande','cuerpo enorme: 413 sin analizarlo');
  r=await pedir({cuerpoTexto:cuerpo({sha256:'xyz'})});ok(r.estado===400&&r.codigo==='sha256','huella mal formada');
  r=await pedir({cuerpoTexto:cuerpo({mime:'image/gif'})});ok(r.estado===400&&r.codigo==='mime','solo JPG, PNG y WebP');
  r=await pedir({cuerpoTexto:cuerpo({foto_base64:'***'})});ok(r.estado===400&&r.codigo==='foto','base64 inválido');
  r=await pedir({cuerpoTexto:cuerpo({foto_base64:Buffer.from('esto no es una imagen').toString('base64'),sha256:sha(Buffer.from('esto no es una imagen'))})});
  ok(r.estado===400&&r.codigo==='formato_invalido','un archivo que no es una imagen (firma falsa) se rechaza');
  r=await pedir({cuerpoTexto:cuerpo({sha256:sha(Buffer.from('otra'))})});ok(r.estado===400&&r.codigo==='hash_no_coincide','la huella declarada debe ser la de la foto enviada');
  const grande=Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(M.MAX_FOTO)]);
  r=await pedir({cuerpoTexto:cuerpo({foto_base64:grande.toString('base64'),sha256:sha(grande)})});ok(r.estado===413&&r.codigo==='foto_tamano','foto de más de 6 MB: rechazada');
  r=await pedir({cuerpoTexto:cuerpo({registro:{extraccion:{}, sha256:'f'.repeat(64)}})});ok(r.estado===400&&r.codigo==='registro_otra_foto','la lectura de OTRA foto no se acepta con esta');
  r=await pedir({cuerpoTexto:cuerpo({registro:{sinExtraccion:1}})});ok(r.estado===400&&r.codigo==='registro','la lectura debe traer «extraccion»');
  r=await pedir({cuerpoTexto:cuerpo({registro:registro({relleno:'x'.repeat(M.MAX_REGISTRO)})})});ok(r.estado===413&&r.codigo==='registro_tamano','lectura demasiado grande');
  const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),crypto.randomBytes(50)]);
  r=await pedir({cuerpoTexto:cuerpo({mime:'image/png',foto_base64:png.toString('base64'),sha256:sha(png),registro:registro({sha256:sha(png)})})});ok(r.ok&&r.ext==='png','PNG válido se acepta (extensión png)');
  ok(await M.secretoValido(SECRETO,SECRETO)&&!(await M.secretoValido(SECRETO+'x',SECRETO))&&!(await M.secretoValido(null,SECRETO)),'comparación del secreto: igual sí, distinto o nulo no');

  /* ================= la función (index.ts) y la migración, leídas como texto ================= */
  const ts=leer('supabase/functions/evidencias-ingesta/index.ts');
  ok(/from '\.\/nucleo\.mjs'/.test(ts)&&/INGESTA_SECRETO/.test(ts)&&/x-glacial-ingesta/.test(ts)&&/--no-verify-jwt/.test(ts),'index.ts usa el núcleo, el secreto INGESTA_SECRETO y la cabecera x-glacial-ingesta, y documenta el despliegue sin JWT');
  ok(ts.indexOf("storage.from(BUCKET).upload")>0&&ts.indexOf("storage.from(BUCKET).upload")<ts.indexOf(".upsert("),'primero se guarda la foto y después la fila (la fila nunca apunta a una foto que falta)');
  ok(/ignoreDuplicates:\s*true/.test(ts)&&/estado:\s*'duplicada'/.test(ts)&&/tope_diario/.test(ts)&&/INGESTA_MAX_DIA/.test(ts),'es idempotente por huella y tiene un tope diario de recepciones');
  ok(!/e\.stack|\.stack/.test(ts)&&!/insumosCortes|insumosConteos|insumosCatalogo|fs_commit|fs_docs|fs_items/.test(ts),'no devuelve trazas internas ni toca stock ni documentos del puente');
  ok(!/Access-Control-Allow-Origin/.test(ts),'sin CORS: solo lo llama el bot (no una página)');
  const sql=leer('supabase/migraciones/glacial_33_evidencias_entrada.sql');
  ok(/create table if not exists public\.evidencias_entrada/.test(sql)&&/enable row level security/.test(sql)&&/revoke all on public\.evidencias_entrada from public, anon, authenticated/.test(sql)&&!/create policy/i.test(sql),'glacial_33: tabla con RLS activada, sin permisos para anon ni authenticated y sin ninguna política (solo la llave de servicio entra)');
  ok(/security definer/.test(sql)&&(sql.match(/ii_esc/g)||[]).length>=3&&/grant execute on function public\.evidencias_entrada_pendientes\(integer\) to authenticated/.test(sql)&&/revoke all on function public\.evidencias_entrada_marcar\(text, text\) from public, anon/.test(sql),'las dos funciones exigen ii_esc (validar evidencias) y solo se ejecutan con sesión');
  ok(/foto_ruta like 'asistente\/evidencias\/%'/.test(sql)&&/\\\.\\\./.test(sql)&&/sha256 ~ '\^\[a-f0-9\]\{64\}\$'/.test(sql),'restricciones: la ruta solo puede ser de la carpeta de evidencias (sin ..) y la huella debe ser SHA-256');
  ok(/SIN APLICAR/.test(sql)&&!/storage\./.test(sql.replace(/--.*$/gm,''))&&!/insumosCortes|insumosConteos|insumosCatalogo/.test(sql),'glacial_33 marcada SIN APLICAR; no toca storage ni stock');

  /* ================= bandeja del Asistente: importación automática ================= */
  const JSON_REG=(extra={})=>({sha256:SHA,version_procesador:'vision-v3',archivo_original:'bolsones.jpg',analizado_en:'2026-10-21T03:55:43.756Z',modelo:'gpt-5.4-mini',
    extraccion:{tipo_documento:'etiqueta_insumo',categoria:'bolsas',texto_relevante:'LOTE: 472-2026',advertencias:[]},
    campos:{producto:{literal:'BOLSAS CON EVA',valor:'BOLSAS CON EVA',estado:'legible',origen:'imagen',historial:[]},lote:{literal:'472-2026',valor:'472-2026',estado:'legible',origen:'imagen',historial:[]}},
    revision_local:{version:'validador-v3',reglas_aplicadas:['general'],campos_en_duda:[{campo:'cantidad_unidades',motivo:'Se leyó 1000; ¿100?'}]},...extra});
  const fila=(sha256,extra={})=>({sha256,registro:JSON_REG({sha256}),foto_ruta:'asistente/evidencias/'+sha256+'.jpg',mime:'image/jpeg',bytes:FOTO.length,recibido_en:'2026-10-21T10:00:00Z',...extra});
  function entorno(rol,{pendientes=[],rpcError}={}){
    const sb={console,Math,Number,Array,Object,String,Set,Map,JSON,Date,Promise,Error,Uint8Array,ArrayBuffer,setTimeout,clearTimeout,crypto:crypto.webcrypto};
    vm.createContext(sb);sb.window=sb;
    const docs=new Map(),oyentes=[];
    const snapDoc=k=>({exists:docs.has(k),data:()=>JSON.parse(JSON.stringify(docs.get(k)))});
    const avisar=()=>oyentes.slice().forEach(f=>f());
    sb.docs=docs;
    let auto=0;
    sb.db={collection:c=>({doc:id0=>{const id=id0||('auto'+(++auto));return {c,id,k:c+'/'+id,get:async()=>snapDoc(c+'/'+id),set:async d=>{docs.set(c+'/'+id,JSON.parse(JSON.stringify(d)));avisar();}};},
      onSnapshot(cb){const f=()=>cb({docs:[...docs.entries()].filter(([k])=>k.startsWith(c+'/')).map(([k,v])=>({data:()=>JSON.parse(JSON.stringify(v))}))});oyentes.push(f);f();return()=>{};}}),
      runTransaction:async fn=>{const w=[];await fn({get:async r=>snapDoc(r.k),set:(r,d)=>w.push([r,d])});w.forEach(([r,d])=>docs.set(r.k,JSON.parse(JSON.stringify(d))));avisar();}};
    sb.firebase={firestore:{FieldValue:{serverTimestamp:()=>'__TS__'}},auth:()=>({currentUser:{uid:'u1'}})};
    sb.state={user:{rol,permisos:[],nombre:'Ana',username:'ana'}};sb.PERMISOS_APP=[];sb.rpcs=[];
    let cola=pendientes.slice();
    sb.glacialSupabaseCliente={rpc:async(nombre,args)=>{
      sb.rpcs.push({nombre,args});
      if(rpcError)return {data:null,error:rpcError};
      if(nombre==='evidencias_entrada_pendientes')return {data:cola,error:null};
      if(nombre==='evidencias_entrada_marcar'){if(!args.p_error)cola=cola.filter(x=>x.sha256!==args.p_sha);else cola=cola.filter(x=>x.sha256!==args.p_sha);return {data:true,error:null};}
      return {data:null,error:{message:'rpc desconocida'}};
    }};
    sb.glacialFotos={PREFIJO:'supabase:glacial-fotos/',disponible:()=>true,subir:async()=>{throw new Error('la ingesta NO debe subir fotos desde el navegador');},atributosImg:()=>'',atributosEnlace:()=>''};
    vm.runInContext('function tienePermiso(p){return false;}',sb);
    ['74-inventario-insumos-nucleo','75-inventario-insumos-datos','84-evidencias-insumos-nucleo','85-evidencias-insumos-datos','86-evidencias-insumos-pantalla'].forEach(n=>vm.runInContext(leer('js/asistente/'+n+'.js'),sb));
    return sb;
  }
  const SHA2=sha(Buffer.from('segunda foto'));
  let sb=entorno('Asistente de Producción',{pendientes:[fila(SHA),fila(SHA2)]});
  let E=sb.glacialEvidenciasDatos;E.escuchar();
  let s=await E.sincronizarEntrada();
  ok(s.disponible&&s.importadas===2&&s.errores.length===0,'la bandeja importa las 2 evidencias pendientes del bot');
  const d=sb.docs.get('insumosEvidencias/'+SHA);
  ok(d&&d.estado==='pendiente'&&d.foto.url==='supabase:glacial-fotos/asistente/evidencias/'+SHA+'.jpg'&&d.campos.cantidad_valor.estado==='requiere_revision','el documento nace pendiente, con la foto privada y la duda del validador marcada');
  const aud=[...sb.docs.entries()].filter(([k])=>k.startsWith('insumosAuditoria/')).map(([,v])=>v);
  ok(aud.length===2&&aud.every(a=>a.tipo==='IMPORTAR_EVIDENCIA'&&a.despues.origen==='bot'),'cada importación queda auditada con origen «bot»');
  ok(sb.rpcs.filter(x=>x.nombre==='evidencias_entrada_marcar'&&!x.args.p_error).length===2,'cada fila importada se marca como importada en la bandeja de entrada');
  ok([...sb.docs.keys()].every(k=>/^(insumosEvidencias|insumosAuditoria)\//.test(k)),'solo escribe evidencias y auditoría: ningún movimiento de stock');
  s=await E.sincronizarEntrada();ok(s.importadas===0&&s.duplicadas===0,'una segunda pasada no vuelve a importar nada');

  sb=entorno('Asistente de Producción',{pendientes:[fila(SHA)]});E=sb.glacialEvidenciasDatos;E.escuchar();
  sb.docs.set('insumosEvidencias/'+SHA,{id:SHA,estado:'aprobado_dato',campos:{}});
  s=await E.sincronizarEntrada();
  ok(s.duplicadas===1&&s.importadas===0&&sb.docs.get('insumosEvidencias/'+SHA).estado==='aprobado_dato','una evidencia que ya está en la bandeja no se pisa (ni si ya fue aprobada): solo se marca');

  sb=entorno('Asistente de Producción',{pendientes:[fila('a'.repeat(64),{foto_ruta:'asistente/evidencias/../../secreto.jpg'}),fila(SHA,{registro:{sinExtraccion:true}}),fila(SHA2)]});
  E=sb.glacialEvidenciasDatos;E.escuchar();
  s=await E.sincronizarEntrada();
  ok(s.importadas===1&&s.conError===2&&s.errores.length===2,'una ruta de foto fuera de la carpeta y un resultado mal formado se rechazan sin detener las demás');
  ok(sb.rpcs.filter(x=>x.nombre==='evidencias_entrada_marcar'&&x.args.p_error).length===2,'las dos filas malas se marcan con error (no se vuelven a ofrecer)');

  sb=entorno('Asistente de Producción',{rpcError:{code:'PGRST202',message:'Could not find the function public.evidencias_entrada_pendientes'}});
  E=sb.glacialEvidenciasDatos;s=await E.sincronizarEntrada();
  ok(s.disponible===false&&s.importadas===0,'si glacial_33 no está aplicada, la bandeja lo dice y sigue funcionando (importación manual)');
  sb=entorno('Asistente de Producción',{rpcError:{code:'XX000',message:'se cayó el servidor'}});
  let e2=null;try{await sb.glacialEvidenciasDatos.sincronizarEntrada();}catch(x){e2=x;}
  ok(e2&&e2.codigo==='ENTRADA','otro error del servidor se informa (no se confunde con «no configurada»)');
  sb=entorno('Asistente de Producción');sb.glacialSupabaseCliente=undefined;
  ok((await sb.glacialEvidenciasDatos.sincronizarEntrada()).disponible===false,'sin conexión con Supabase: no falla');

  const consulta=entorno('Jefe de Operaciones',{pendientes:[fila(SHA)]});
  s=await consulta.glacialEvidenciasDatos.sincronizarEntrada();
  ok(s.importadas===0&&consulta.rpcs.length===0&&consulta.docs.size===0,'un usuario de solo consulta no importa ni consulta la bandeja de entrada');

  sb=entorno('Asistente de Producción',{pendientes:[fila(SHA)]});E=sb.glacialEvidenciasDatos;E.escuchar();
  const [a,b]=await Promise.all([E.sincronizarEntrada(),E.sincronizarEntrada()]);
  ok(a.importadas+b.importadas===1&&sb.rpcs.filter(x=>x.nombre==='evidencias_entrada_pendientes').length===1,'dos sincronizaciones a la vez no duplican (la segunda espera)');

  const ui=leer('js/asistente/86-evidencias-insumos-pantalla.js');
  ok(/Buscar nuevas del bot/.test(ui)&&/ieBuscarNuevas/.test(ui)&&/typeof setInterval==='function'/.test(ui)&&/host\.activo\(\)/.test(ui),'la pantalla tiene «Buscar nuevas del bot», sondea cada minuto solo mientras está a la vista y no repinta si estás escribiendo');
  ok(/subir\(/.test(leer('js/asistente/85-evidencias-insumos-datos.js'))&&!/subir\(/.test(leer('js/asistente/85-evidencias-insumos-datos.js').split('async function importarDeEntrada')[1].split('async function sincronizarEntrada')[0]),'importar desde la entrada NO sube la foto otra vez (ya está en el bucket privado)');
  console.log(fallas?fallas+' fallas':'todo correcto');
})();
