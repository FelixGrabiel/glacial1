/* Evidencias de insumos (Fase 3): bandeja de validación de las fotos de etiquetas leídas por la IA. Núcleo (estados, ediciones, aprobación), datos (base de documentos
   simulada, foto privada simulada, auditoría, permisos), pantalla (HTML) e integración. Nada de esto toca stock. node tests/evidencias-insumos.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const N=require('../js/asistente/84-evidencias-insumos-nucleo.js');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const FOTO=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.from('foto de prueba glacial')]),SHA=sha(FOTO);

/* ---------- fixtures: lo que entrega el validador (validador-v3) ---------- */
const campoVacio=()=>({literal:null,valor:null,estado:'ausente',origen:'imagen',historial:[]});
function registroV3(extra={}){
  const campos=Object.fromEntries(N.CAMPOS.map(c=>[c.campo,campoVacio()]));
  const poner=(k,literal,valor,estado='legible')=>{campos[k]={literal,valor,estado,origen:'imagen',historial:[]};};
  poner('proveedor','FULL PACK S.A.C.','FULL PACK S.A.C.');poner('producto','BOLSAS CON EVA','BOLSAS CON EVA');poner('lote','472-2026','472-2026');
  poner('cantidad_valor','1000 UNIDADES',1000);poner('cantidad_unidad','UNIDADES','UND');poner('fecha_proceso','24-09-2026','2026-09-24');
  poner('medidas','60CM X 114CM X 17MILS','60CM X 114CM X 17MILS');
  return {estado:'pendiente_validacion',version_procesador:'vision-v2',archivo_original:'bolsones.jpg',sha256:SHA,analizado_en:'2026-10-21T03:55:43.756Z',modelo:'gpt-5.4-mini',
    extraccion:{tipo_documento:'etiqueta_insumo',categoria:'bolsas',texto_relevante:'PRODUCTO: BOLSAS CON EVA. CANTIDAD: 1000 UNIDADES',advertencias:['La etiqueta está girada.']},
    campos,
    revision_local:{version:'validador-v3',reglas_aplicadas:['fullpack-bolsas','general'],campos_en_duda:[
      {campo:'cantidad_unidades',motivo:'Se leyó 1000; con FULL PACK ya hubo confusión 100 vs 1000.'},
      {campo:'medidas',motivo:'Se leyó 17 mils; ¿1.7?'},
      {campo:'fecha_produccion',motivo:'«F. VENC.» probablemente es «F. PROD.»',valor_sugerido:'2026-09-23'}]},
    ...extra};
}
const nuevoDoc=(extra)=>N.construirDocumento(registroV3(extra),{sha256:SHA,foto:{url:'supabase:glacial-fotos/asistente/evidencias/x.jpg',mimetype:'image/jpeg',bytes:FOTO.length},usuario:'Ana',uid:'u1',ahora:1000});

/* ================= núcleo ================= */
{
  const d=nuevoDoc();
  ok(d.id===SHA&&d.estado==='pendiente'&&d.rev===1&&d.historialEstados[0].accion==='importado','documento nuevo: id = huella de la foto, estado pendiente, revisión 1 e historial');
  ok(d.campos.cantidad_valor.estado==='requiere_revision'&&/100 vs 1000/.test(d.campos.cantidad_valor.duda)&&d.campos.medidas.estado==='requiere_revision','las dudas del validador marcan los campos (cantidad_unidades → cantidad_valor)');
  ok(d.campos.fecha_produccion.estado==='requiere_revision'&&d.campos.fecha_produccion.valor_sugerido==='2026-09-23'&&d.campos.fecha_produccion.valor===null,'el valor sugerido viaja, pero el valor sigue vacío hasta que una persona lo acepte');
  ok(d.campos.proveedor.estado==='legible'&&d.campos.proveedor.origen==='imagen'&&d.reglas.includes('fullpack-bolsas'),'lo demás queda legible y con origen «imagen»');
  let e;try{N.construirDocumento(registroV3({sha256:'0'.repeat(64)}),{sha256:SHA,foto:{},usuario:'Ana',ahora:1});}catch(x){e=x;}
  ok(e&&e.codigo==='FOTO_NO_COINCIDE','una foto con otra huella no se une al resultado');
  try{N.construirDocumento({sinExtraccion:true},{sha256:SHA,foto:{},usuario:'Ana'});e=null;}catch(x){e=x;}
  ok(e&&e.codigo==='FORMATO','un JSON que no es una lectura de etiquetas se rechaza');
  const v2=N.construirDocumento({sha256:SHA,archivo_original:'C:\\x\\..\\tapas.jpg',extraccion:{proveedor:'SMI',producto:'42.7gr. Cr.1881',lote:'260925G33C',peso_neto_kg:346.59,peso_neto_literal:'346.590',cantidad_unidades:8141,cantidad_literal:'8141',fecha_produccion:'2026-09-25',categoria:'inventada',tipo_documento:'raro'}},{sha256:SHA,foto:{url:'u'},usuario:'Ana',ahora:5});
  ok(v2.campos.peso_neto_kg.valor===346.59&&v2.campos.peso_neto_kg.literal==='346.590'&&v2.campos.cantidad_valor.valor===8141&&v2.categoria==='otro'&&v2.tipoDocumento==='otro'&&v2.archivoOriginal==='tapas.jpg','una extracción v2 plana también se importa (literal conservado, categoría y archivo saneados)');
  const hostil=N.construirDocumento(registroV3({campos:{...registroV3().campos,producto:{literal:'x'.repeat(5000),valor:'<img src=x onerror=alert(1)>',estado:'inventado',origen:'jefe',historial:[]}}}),{sha256:SHA,foto:{url:'u'},usuario:'Ana',ahora:5});
  ok(hostil.campos.producto.literal.length===300&&hostil.campos.producto.origen==='imagen'&&N.ESTADOS_CAMPO.includes(hostil.campos.producto.estado),'campos saneados: largo máximo, estado y origen válidos (el texto de la foto es dato, no instrucciones)');
}
{
  const d=nuevoDoc();
  const r=N.aplicarEdiciones(d,{cambios:{cantidad_valor:'100',lote:'472-2026'}},'Ana',2000);
  ok(!r.errores.length&&r.doc.campos.cantidad_valor.valor===100&&r.doc.campos.cantidad_valor.origen==='humano'&&r.doc.campos.cantidad_valor.estado==='legible'&&!r.doc.campos.cantidad_valor.duda,'corregir 1000 → 100: queda legible, origen «humano» y sin la duda');
  ok(r.doc.campos.cantidad_valor.historial.at(-1).valor===1000&&r.doc.campos.cantidad_valor.historial.at(-1).usuario==='Ana'&&r.doc.campos.cantidad_valor.literal==='1000 UNIDADES','el historial guarda el valor anterior y quién lo cambió; el literal de la IA no se pierde');
  ok(r.eventos.length===1&&r.eventos[0].tipo==='EDITAR_EVIDENCIA'&&r.doc.rev===2&&d.rev===1&&d.campos.cantidad_valor.valor===1000,'un evento por dato realmente cambiado; la revisión sube y el original no se muta');
  const same=N.aplicarEdiciones(d,{cambios:{medidas:'60CM X 114CM X 17MILS'}},'Ana',3000);
  ok(same.eventos[0].tipo==='CONFIRMAR_CAMPO'&&same.doc.campos.medidas.estado==='legible'&&same.doc.campos.medidas.valor==='60CM X 114CM X 17MILS','dejar igual un dato dudoso es una confirmación explícita (queda en el historial)');
  const conf=N.aplicarEdiciones(d,{confirmar:['cantidad_valor','proveedor']},'Ana',3000);
  ok(conf.eventos.length===1&&conf.doc.campos.cantidad_valor.estado==='legible'&&conf.doc.campos.cantidad_valor.valor===1000,'«Confirmar» acepta el dato tal cual (un campo ya legible no genera evento)');
  ok(N.aplicarEdiciones(d,{cambios:{cantidad_valor:'-5'}},'Ana',1).errores.length===1&&N.aplicarEdiciones(d,{cambios:{fecha_proceso:'31/02/2026'}},'Ana',1).errores.length===1&&N.aplicarEdiciones(d,{cambios:{inventado:'x'}},'Ana',1).errores.length===1&&N.aplicarEdiciones(d,{cambios:{categoria:'pan'}},'Ana',1).errores.length===1,'valores no válidos (número negativo, fecha imposible, campo o categoría inexistente) se rechazan');
  const cat=N.aplicarEdiciones(d,{cambios:{categoria:'polietileno'}},'Ana',1);
  ok(cat.doc.categoria==='polietileno'&&cat.eventos[0].campo==='categoria','la categoría también se corrige con auditoría');
  const corr=N.cambiarEstado(d,'requiere_correccion',{usuario:'Ana',motivo:'Foto borrosa, reenviar',en:5}).doc;
  const arreglado=N.aplicarEdiciones(corr,{cambios:{lote:'473-2026'}},'Ana',9);
  ok(arreglado.doc.estado==='pendiente'&&arreglado.doc.historialEstados.at(-1).accion==='corregido','al corregir una evidencia «requiere corrección» vuelve a pendientes');
  const aprobada={...nuevoDoc(),estado:'aprobado_dato'};
  ok(N.aplicarEdiciones(aprobada,{cambios:{lote:'x'}},'Ana',1).errores.length===1&&N.aplicarEdiciones({...d,estado:'rechazado'},{cambios:{lote:'x'}},'Ana',1).errores.length===1,'no se edita una evidencia aprobada o rechazada: hay que reabrirla');
}
{
  const d=nuevoDoc();
  let v=N.validarAprobacion(d);
  ok(v.errores.length>=1&&/Confirma o corrige/.test(v.errores[0])&&/Cantidad/.test(v.errores[0])&&/Medidas/.test(v.errores[0]),'con datos dudosos sin confirmar NO se puede aprobar (dice cuáles)');
  const listo=N.aplicarEdiciones(d,{cambios:{cantidad_valor:'100',medidas:'60CM X 114CM X 1.7MILS',fecha_produccion:'2026-09-23'}},'Ana',2).doc;
  v=N.validarAprobacion(listo);
  ok(v.errores.length===0,'corregidos o confirmados todos los dudosos, se puede aprobar');
  const sinProd=N.aplicarEdiciones(listo,{cambios:{producto:''}},'Ana',3).doc;
  ok(N.validarAprobacion(sinProd).errores.some(x=>/producto/.test(x)),'sin producto no se aprueba');
  ok(N.validarAprobacion({...listo,categoria:'otro'}).errores.some(x=>/categoría/.test(x))&&N.validarAprobacion({...listo,tipoDocumento:'otro'}).errores.some(x=>/etiqueta de insumo/.test(x)),'categoría «otro» o documento que no es etiqueta de insumo: no se aprueba');
  const pesos=N.aplicarEdiciones(listo,{cambios:{peso_neto_kg:'20',peso_bruto_kg:'18'}},'Ana',3).doc;
  ok(N.validarAprobacion(pesos).errores.some(x=>/peso bruto/.test(x)),'peso bruto menor que neto: no se aprueba');
  const unidad=N.aplicarEdiciones(listo,{cambios:{cantidad_unidad:''}},'Ana',3).doc;
  ok(N.validarAprobacion(unidad).errores.some(x=>/unidad/.test(x)),'cantidad sin unidad: no se aprueba');
  ok(N.validarAprobacion({...listo,estado:'rechazado'}).errores.some(x=>/pendiente o corregida/.test(x)),'solo se aprueba una evidencia pendiente o corregida');
}
{
  const listo=N.aplicarEdiciones(nuevoDoc(),{cambios:{cantidad_valor:'100',medidas:'1.7 mils',fecha_produccion:'2026-09-23'}},'Ana',2).doc;
  const cod=f=>{try{f();return null;}catch(e){return e.codigo;}};
  ok(cod(()=>N.cambiarEstado(listo,'registrado',{usuario:'Ana',esAdmin:true}))==='RESERVADO','«registrado» no se alcanza en esta fase (ni siquiera un Administrador): aprobar datos no es mover stock');
  ok(cod(()=>N.cambiarEstado(listo,'rechazado',{usuario:'Ana',motivo:'no'}))==='MOTIVO'&&cod(()=>N.cambiarEstado(listo,'requiere_correccion',{usuario:'Ana',motivo:''}))==='MOTIVO','rechazar y pedir corrección exigen motivo (mínimo 5 caracteres)');
  const ap=N.cambiarEstado(listo,'aprobado_dato',{usuario:'Ana',en:10});
  ok(ap.doc.estado==='aprobado_dato'&&ap.doc.rev===listo.rev+1&&ap.doc.historialEstados.at(-1).accion==='aprobado'&&ap.evento.despues.estado==='aprobado_dato','aprobar datos: nuevo estado, revisión +1, historial y evento de auditoría');
  ok(cod(()=>N.cambiarEstado(ap.doc,'aprobado_dato',{usuario:'Ana'}))==='SIN_CAMBIO','un segundo «aprobar» (doble clic) no hace nada ni duplica');
  ok(cod(()=>N.cambiarEstado(ap.doc,'rechazado',{usuario:'Ana',motivo:'cambio de idea'}))==='TRANSICION','una evidencia aprobada no pasa directo a rechazada');
  ok(cod(()=>N.cambiarEstado(ap.doc,'pendiente',{usuario:'Ana',motivo:'reabrir por error',esAdmin:false}))==='PERMISO'&&N.cambiarEstado(ap.doc,'pendiente',{usuario:'Root',motivo:'reabrir por error',esAdmin:true}).doc.estado==='pendiente','reabrir una evidencia aprobada: solo un Administrador y con motivo');
  const rech=N.cambiarEstado(nuevoDoc(),'rechazado',{usuario:'Ana',motivo:'No es una etiqueta',en:11}).doc;
  ok(rech.estado==='rechazado'&&rech.historialEstados.at(-1).motivo==='No es una etiqueta'&&cod(()=>N.cambiarEstado(rech,'aprobado_dato',{usuario:'Ana'}))==='TRANSICION','rechazar guarda el motivo; no se aprueba directo');
  ok(cod(()=>N.cambiarEstado(nuevoDoc(),'aprobado_dato',{usuario:'Ana'}))==='VALIDACION','aprobar con datos dudosos sin confirmar lo impide el núcleo (no solo la pantalla)');
}
{
  const a=nuevoDoc(),b={...nuevoDoc(),id:'b',estado:'aprobado_dato',creadoEn:5000},c={...nuevoDoc(),id:'c',estado:'requiere_correccion',creadoEn:3000},d={...nuevoDoc(),id:'d',creadoEn:2000};
  ok(N.ordenar([b,a,c,d]).map(x=>x.id).join()==='c,'+SHA+',d,b'||N.ordenar([b,a,c,d]).map(x=>x.id)[0]==='c','la bandeja muestra primero lo que pide corrección y luego lo pendiente');
  ok(N.contarPorEstado([a,b,c,d]).pendiente===2&&N.contarPorEstado([a,b,c,d]).aprobado_dato===1&&N.contarPorEstado([a,b,c,d]).total===4,'conteo por estado');
  ok(N.filtrar([a,b,c,d],{estado:'pendiente'}).length===2&&N.filtrar([a,b,c,d],{texto:'full pack'}).length===4&&N.filtrar([a,b,c,d],{texto:'xyz'}).length===0&&N.filtrar([a,b,c,d],{texto:'472'}).length===4,'filtros por estado y búsqueda (producto, proveedor, lote, archivo)');
  const m=N.elegirPorFoto([{sha256:SHA,analizado_en:'1'},{sha256:SHA,campos:{},revision_local:{version:'validador-v3'},analizado_en:'0'},{sha256:'zz'}]);
  ok(m.size===1&&m.get(SHA).campos,'si se eligen varios JSON de la misma foto se usa el de validador-v3 con procedencia');
}
{
  const f=['84-evidencias-insumos-nucleo','85-evidencias-insumos-datos','86-evidencias-insumos-pantalla'].map(n=>leer('js/asistente/'+n+'.js')).join('\n');
  ok(!/insumosCortes|insumosConteos|insumosCatalogo|filaCorte|combinarCatalogo|agregarLinea|importarCorte|filasStock|stockMinimo/.test(f),'ninguno de los 3 archivos toca stock: sin cortes, conteos, catálogo ni movimientos');
}

/* ================= datos (base de documentos simulada) ================= */
function entorno(rol,permisos){
  const sb={console,Math,Number,Array,Object,String,Set,Map,JSON,Date,Promise,Error,setTimeout,clearTimeout,Uint8Array,ArrayBuffer,crypto:crypto.webcrypto};
  vm.createContext(sb);sb.window=sb;
  const docs=new Map(),oyentes=[];let auto=0;
  const snapDoc=k=>({exists:docs.has(k),data:()=>JSON.parse(JSON.stringify(docs.get(k)))});
  const avisar=()=>oyentes.slice().forEach(f=>f());
  const ref=(c,id)=>({c,id,k:c+'/'+id,get:async()=>snapDoc(c+'/'+id),set:async d=>{docs.set(c+'/'+id,JSON.parse(JSON.stringify(d)));avisar();}});
  sb.docs=docs;
  sb.db={collection:c=>({doc:id=>ref(c,id||('auto'+(++auto))),onSnapshot(cb){const f=()=>cb({docs:[...docs.entries()].filter(([k])=>k.startsWith(c+'/')).map(([k,v])=>({data:()=>JSON.parse(JSON.stringify(v))}))});oyentes.push(f);f();return()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};}}),
    runTransaction:async fn=>{const w=[];const t={get:async r=>snapDoc(r.k),set:(r,d)=>w.push([r,d])};await fn(t);w.forEach(([r,d])=>docs.set(r.k,JSON.parse(JSON.stringify(d))));avisar();}};
  sb.firebase={firestore:{FieldValue:{serverTimestamp:()=>'__TS__'}},auth:()=>({currentUser:{uid:'u1'}})};
  sb.state={user:{rol,permisos:permisos||[],nombre:'Ana',username:'ana'},currentTab:'inventario-insumos'};
  sb.PERMISOS_APP=[];
  sb.subidas=[];
  sb.glacialFotos={PREFIJO:'supabase:glacial-fotos/',disponible:()=>true,subir:async(blob,o)=>{sb.subidas.push(o);return {url:'supabase:glacial-fotos/'+o.carpeta+'/'+o.id+'.jpg'};},
    atributosImg:u=>`src="px" data-foto-ref="${u}"`,atributosEnlace:u=>`href="#" data-foto-ref="${u}"`};
  vm.runInContext('function tienePermiso(p){return false;}',sb);
  ['74-inventario-insumos-nucleo','75-inventario-insumos-datos','84-evidencias-insumos-nucleo','85-evidencias-insumos-datos','86-evidencias-insumos-pantalla'].forEach(n=>vm.runInContext(leer('js/asistente/'+n+'.js'),sb));
  return sb;
}
const archivoFoto=(buf=FOTO)=>({type:'image/jpeg',size:buf.length,arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)});
const ejecutar=async f=>{try{return {r:await f()};}catch(e){return {e};}};
(async()=>{
  const sb=entorno('Asistente de Producción'),E=sb.glacialEvidenciasDatos;
  ok(!!E&&!!sb.iiEvidenciasUI,'los módulos de datos y pantalla se cargan sobre el Inventario de insumos');
  let cambios=0;E.alCambiar(()=>cambios++);E.escuchar();

  /* importar */
  let r=await ejecutar(()=>E.importar(registroV3(),archivoFoto()));
  ok(r.r&&r.r.id===SHA&&sb.subidas.length===1&&sb.subidas[0].carpeta==='asistente/evidencias'&&sb.subidas[0].id===SHA,'importar: la foto va al bucket privado (carpeta asistente/evidencias, nombre = huella)');
  const guardado=sb.docs.get('insumosEvidencias/'+SHA);
  ok(guardado&&guardado.estado==='pendiente'&&/asistente\/evidencias\//.test(guardado.foto.url)&&!/https?:/.test(guardado.foto.url),'queda un documento pendiente con la referencia privada de la foto (no una dirección pública)');
  const aud=[...sb.docs.entries()].filter(([k])=>k.startsWith('insumosAuditoria/')).map(([,v])=>v);
  ok(aud.length===1&&aud[0].tipo==='IMPORTAR_EVIDENCIA'&&aud[0].usuario==='Ana'&&aud[0].evidenciaId===SHA,'la importación queda en el libro de auditoría');
  ok(cambios>0&&E.cache.lista.length===1,'la bandeja se actualiza en tiempo real');
  r=await ejecutar(()=>E.importar(registroV3(),archivoFoto()));
  ok(r.e&&r.e.codigo==='DUPLICADO'&&sb.subidas.length===1,'importar de nuevo la misma foto: duplicado, sin subir otra vez');
  r=await ejecutar(()=>E.importar(registroV3({sha256:'f'.repeat(64)}),archivoFoto(Buffer.from('otra foto distinta'))));
  ok(r.e&&r.e.codigo==='FOTO_NO_COINCIDE'&&sb.subidas.length===1&&sb.docs.size===2,'una foto que no es la del JSON no se sube ni se guarda');
  r=await ejecutar(()=>E.importar(registroV3(),{type:'application/pdf',size:10,arrayBuffer:async()=>new ArrayBuffer(10)}));
  ok(r.e&&r.e.codigo==='FORMATO','solo fotos JPG, PNG o WebP');
  ok([...sb.docs.keys()].every(k=>/^(insumosEvidencias|insumosAuditoria)\//.test(k)),'todo lo escrito es de evidencias o de auditoría: ninguna colección de stock');

  /* editar y confirmar */
  let doc=E.porId(SHA);
  r=await ejecutar(()=>E.guardarEdiciones(SHA,doc.rev,{cambios:{cantidad_valor:'100',medidas:'1.7 mils',fecha_produccion:'2026-09-23'}}));
  doc=E.porId(SHA);
  ok(r.r&&r.r.cambiado&&doc.campos.cantidad_valor.valor===100&&doc.rev===2,'guardar ediciones: valores nuevos y revisión +1');
  const aud2=[...sb.docs.entries()].filter(([k])=>k.startsWith('insumosAuditoria/')).map(([,v])=>v).filter(v=>v.tipo==='EDITAR_EVIDENCIA'||v.tipo==='CONFIRMAR_CAMPO');
  ok(aud2.length===3&&aud2.some(v=>v.tipo==='EDITAR_EVIDENCIA'&&v.antes.cantidad_valor===1000&&v.despues.cantidad_valor===100),'un evento de auditoría por dato (antes → después)');
  r=await ejecutar(()=>E.guardarEdiciones(SHA,1,{cambios:{lote:'X'}}));
  ok(r.e&&r.e.codigo==='CONCURRENCIA'&&E.porId(SHA).campos.lote.valor==='472-2026','si otra persona ya cambió la evidencia (revisión vieja) no se pisa su trabajo');
  r=await ejecutar(()=>E.guardarEdiciones(SHA,doc.rev,{cambios:{cantidad_valor:'-3'}}));
  ok(r.e&&r.e.codigo==='VALIDACION','un valor no válido no se guarda');

  /* cambios de estado */
  r=await ejecutar(()=>E.cambiarEstado(SHA,doc.rev,'rechazado',{motivo:'x'}));
  ok(r.e&&r.e.codigo==='MOTIVO'&&E.porId(SHA).estado==='pendiente','rechazar sin motivo suficiente no cambia nada');
  r=await ejecutar(()=>E.cambiarEstado(SHA,doc.rev,'aprobado_dato'));
  doc=E.porId(SHA);
  ok(r.r&&doc.estado==='aprobado_dato'&&doc.rev===3,'aprobar datos (todo confirmado): estado aprobado_dato');
  const apr=[...sb.docs.values()].filter(v=>v&&v.tipo==='CAMBIAR_ESTADO_EVIDENCIA');
  ok(apr.length===1&&apr[0].antes.estado==='pendiente'&&apr[0].despues.estado==='aprobado_dato','el cambio de estado queda auditado (antes → después)');
  r=await ejecutar(()=>E.cambiarEstado(SHA,doc.rev,'aprobado_dato'));
  ok(r.e&&r.e.codigo==='SIN_CAMBIO'&&[...sb.docs.values()].filter(v=>v&&v.tipo==='CAMBIAR_ESTADO_EVIDENCIA').length===1,'doble clic en «Aprobar»: no se aprueba dos veces ni se audita dos veces');
  r=await ejecutar(()=>E.cambiarEstado(SHA,doc.rev,'pendiente',{motivo:'Falta revisar el lote'}));
  ok(r.e&&r.e.codigo==='PERMISO'&&E.porId(SHA).estado==='aprobado_dato','reabrir una evidencia aprobada: la Asistente no puede (solo un Administrador)');
  ok(![...sb.docs.keys()].some(k=>/^insumos(Cortes|Conteos|Catalogo)/.test(k)),'aprobar datos no escribió en cortes, conteos ni catálogo');

  /* Administrador */
  const adm=entorno('Administrador');adm.docs.set('insumosEvidencias/'+SHA,JSON.parse(JSON.stringify(E.porId(SHA))));
  adm.glacialEvidenciasDatos.escuchar();
  r=await ejecutar(()=>adm.glacialEvidenciasDatos.cambiarEstado(SHA,3,'pendiente',{motivo:'Falta revisar el lote'}));
  ok(r.r&&adm.glacialEvidenciasDatos.porId(SHA).estado==='pendiente','el Administrador sí puede reabrir (con motivo)');

  /* permisos */
  const jefe=entorno('Jefe de Operaciones'),Ej=jefe.glacialEvidenciasDatos;
  Ej.escuchar();
  ok(Ej.puedeVer()&&!Ej.puedeEscribir(),'Jefe de Operaciones: ve la bandeja, no valida');
  r=await ejecutar(()=>Ej.importar(registroV3(),archivoFoto()));
  ok(r.e&&r.e.codigo==='PERMISO'&&jefe.subidas.length===0,'un usuario sin permiso no importa ni sube fotos');
  jefe.docs.set('insumosEvidencias/'+SHA,JSON.parse(JSON.stringify(E.porId(SHA))));
  r=await ejecutar(()=>Ej.cambiarEstado(SHA,3,'rechazado',{motivo:'No es una etiqueta'}));
  ok(r.e&&r.e.codigo==='PERMISO','un usuario de solo consulta no aprueba ni rechaza');
  const otro=entorno('Supervisor');
  ok(!otro.glacialEvidenciasDatos.puedeVer()&&!otro.glacialEvidenciasDatos.puedeEscribir(),'otros roles ni ven ni validan');

  /* ================= pantalla ================= */
  const asistente=entorno('Asistente de Producción');
  asistente.docs.set('insumosEvidencias/'+SHA,JSON.parse(JSON.stringify(nuevoDoc())));
  asistente.docs.set('insumosEvidencias/'+'b'.repeat(64),{...JSON.parse(JSON.stringify(nuevoDoc())),id:'b'.repeat(64),estado:'aprobado_dato'});
  const UI=asistente.iiEvidenciasUI,E2=asistente.glacialEvidenciasDatos;
  let h=UI.html();
  ok(/Evidencias de etiquetas/.test(h)&&/Importar evidencias/.test(h)&&/Pendientes <b>1<\/b>/.test(h)&&/Aprobadas <b>1<\/b>/.test(h),'la bandeja muestra el título, el botón Importar y los contadores por estado');
  ok(/ie-item/.test(h)&&/3 por confirmar/.test(h),'cada evidencia de la lista dice cuántos datos faltan por confirmar');
  asistente.vm_sel=vm.runInContext("window.ieSel('"+SHA+"');window.iiEvidenciasUI.estado.sel",asistente);
  h=UI.html();
  ok(/data-foto-ref="supabase:glacial-fotos\/asistente\/evidencias\//.test(h)&&/ie-col-foto/.test(h)&&/ie-col-datos/.test(h),'detalle: la FOTO (enlace firmado por glacialFotos) va al lado de los datos');
  ok(/La IA leyó: «1000 UNIDADES»/.test(h)&&/Verificar contra la foto:<\/b> Se leyó 1000/.test(h)&&/Confirmar<\/button>/.test(h)&&/Usar 23\/09\/2026/.test(h),'cada dato muestra lo que leyó la IA, la duda, «Confirmar» y el valor sugerido');
  ok(/no registra stock/.test(h)&&/Aprobar datos<\/button>/.test(h)&&/Solicitar corrección o nueva foto/.test(h)&&/Rechazar<\/button>/.test(h)&&!/Reabrir/.test(h),'acciones: aprobar datos, solicitar corrección y rechazar; el aviso dice que no registra stock; Reabrir solo para aprobadas/rechazadas');
  ok(!/<img[^>]*onerror/.test(h)&&!/<script/i.test(h),'el contenido leído de la etiqueta se muestra escapado');
  vm.runInContext("window.ieSel('"+'b'.repeat(64)+"')",asistente);
  h=UI.html();
  ok(!/Aprobar datos<\/button>/.test(h)&&!/Reabrir/.test(h)&&/Datos aprobados/.test(h)&&/disabled/.test(h),'una evidencia aprobada es de solo lectura; la Asistente no ve «Reabrir» (solo el Administrador)');
  const admUI=adm.iiEvidenciasUI;vm.runInContext("window.ieSel('"+SHA+"')",adm);
  ok(/Reabrir/.test(adm.iiEvidenciasUI.html())===false,'el Administrador no ve «Reabrir» en una evidencia pendiente');
  vm.runInContext("window.iiEvidenciasUI.estado.estado=''",adm);
  const consulta=entorno('Jefe de Operaciones');consulta.docs.set('insumosEvidencias/'+SHA,JSON.parse(JSON.stringify(nuevoDoc())));
  vm.runInContext("window.ieSel('"+SHA+"')",consulta);
  const hc=consulta.iiEvidenciasUI.html();
  ok(/Solo consulta/.test(hc)&&!/Aprobar datos<\/button>/.test(hc)&&!/Importar evidencias/.test(hc)&&!/onclick="ieConfirmar/.test(hc),'solo consulta: sin botones de importar, confirmar ni aprobar');

  /* integración con el Inventario de insumos */
  const html=leer('index.html'),pos=n=>html.indexOf('js/asistente/'+n);
  ok(pos('84-evidencias-insumos-nucleo.js')>pos('79-inventario-insumos-auditoria.js')&&pos('85-evidencias-insumos-datos.js')>pos('84-evidencias-insumos-nucleo.js')&&pos('86-evidencias-insumos-pantalla.js')>pos('85-evidencias-insumos-datos.js')&&pos('86-evidencias-insumos-pantalla.js')<html.indexOf('js/nucleo/12-init.js'),'index.html carga 84, 85 y 86 después del inventario y antes de 12-init');
  const p72=leer('js/asistente/72-asistente-pantalla.js'),p76=leer('js/asistente/76-inventario-insumos-pantalla.js');
  ok(/\['evidencias','Evidencias','doc'\]/.test(p72)&&/evidencias:tabEvidencias/.test(p72)&&/function tabEvidencias\(\)/.test(p72)&&/iiEvidenciasUI/.test(p72)&&/\.usar\(\{pintar/.test(p72),'el Asistente de Producción tiene la pestaña «Evidencias» (y la monta con su propio repintado)');
  ok(/glacialEvidenciasDatos[\s\S]{0,80}puedeVer\(\)/.test(p72)&&/PESTANAS\.filter\(\(\[k\]\)=>k!=='evidencias'\|\|evVisible\)/.test(p72),'la pestaña solo aparece a quien puede ver el Inventario de insumos');
  ok(/ev\.detener\(\)/.test(p72),'la escucha en vivo se cierra al salir de la pestaña (sin bucles de repintado)');
  ok(!/\['evidencias','Evidencias'\]/.test(p76)&&!/iiEvidenciasUI\.html\(\)/.test(p76)&&/estilos\}/.test(p76),'el Inventario de insumos ya no duplica la pestaña; solo comparte sus estilos con el Asistente');
  let repintados=0;
  UI.usar({pintar:()=>{repintados++;},activo:()=>true});
  vm.runInContext("window.ieSel('"+SHA+"')",asistente);
  ok(repintados===1,'el anfitrión (Asistente) decide cómo repintar la bandeja');
  const n74=vm.runInContext('window.glacialInventarioNucleo',asistente);
  ok(['IMPORTAR_EVIDENCIA','EDITAR_EVIDENCIA','CONFIRMAR_CAMPO','CAMBIAR_ESTADO_EVIDENCIA'].every(t=>n74.TIPOS_AUDITORIA[t]&&n74.GRUPOS_AUDITORIA[n74.TIPOS_AUDITORIA[t].grupo]),'los 4 tipos de auditoría de evidencias existen y tienen grupo para filtrar');
  const sql=leer('supabase/migraciones/glacial_31_evidencias_insumos.sql');
  ok(/insumosEvidencias/.test(sql)&&/accion = 'delete' then return false/.test(sql)&&/ii_esc/.test(sql)&&/ii_ver/.test(sql)&&/APLICADA en PRUEBAS y PRODUCCIÓN/.test(sql)&&!/storage\./.test(sql),'migración glacial_31: solo la colección de evidencias (no se borra, escribe ii_esc, lee ii_ver), marcada como APLICADA');
  ok(/evidencias-insumos|glacial_31/.test(leer('docs/asistente/evidencias-insumos.md'))&&/evidencias-insumos/.test(leer('INDICE.md')),'documentación e INDICE');
  console.log(fallas?fallas+' fallas':'todo correcto');
})();
