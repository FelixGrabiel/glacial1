/* Trazabilidad de lotes: fecha de la foto (cuándo se envió) separada de la de validación, nombre de la unidad física (caja / bobina) y su contenido,
   búsqueda en todo el catálogo y asignar o cambiar el artículo de un lote ya creado. node tests/lotes-fecha-foto.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const N=require('../js/asistente/84-evidencias-insumos-nucleo.js');
const T=require('../js/asistente/87-trazabilidad-lotes-nucleo.js');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const LIMA=(iso)=>Date.parse(iso+'-05:00');

/* ---------- fecha de la foto ---------- */
ok(N.msDe(1730700000)===1730700000000&&N.msDe(1730700000123)===1730700000123&&N.msDe('1730700000')===1730700000000,'msDe: segundos de WhatsApp, milisegundos y texto numérico');
ok(N.msDe('2026-11-03T22:15:00Z')===Date.parse('2026-11-03T22:15:00Z')&&N.msDe('2026-11-03 17:15:00')===LIMA('2026-11-03T17:15:00'),'msDe: ISO con zona tal cual; sin zona se toma en hora de Lima');
ok(N.msDe('ayer')===null&&N.msDe('')===null&&N.msDe(null)===null,'msDe: texto que no es fecha → null');
const reg={analizado_en:'2026-11-03T18:00:00-05:00',extraccion:{}};
ok(N.fechaFotoDeRegistro({...reg,enviado_en:'2026-11-03T17:10:00-05:00'},'2026-11-03T17:20:00Z',5).origen==='whatsapp','la hora del mensaje que manda el bot (enviado_en) manda');
const fb=N.fechaFotoDeRegistro(reg,'2026-11-03T22:12:00Z',5);
ok(fb.origen==='bandeja'&&fb.ms===Date.parse('2026-11-03T22:12:00Z'),'sin hora del mensaje: la llegada a la bandeja del servidor');
ok(N.fechaFotoDeRegistro(reg,null,5).origen==='lectura'&&N.fechaFotoDeRegistro({extraccion:{}},null,77).ms===77,'luego la lectura de la IA y, al final, la importación');
const viejo={creadoEn:900,analizadoEn:'2026-11-01T08:00:00'};
ok(N.fechaFoto(viejo).ms===LIMA('2026-11-01T08:00:00')&&N.fechaFoto({creadoEn:900}).ms===900&&N.fechaFoto({fotoEn:500,creadoEn:900}).ms===500,'evidencias importadas antes: la fecha se calcula con la lectura o la importación');
const doc=N.construirDocumento({extraccion:{categoria:'etiquetas',tipo_documento:'etiqueta_insumo'},analizado_en:'2026-11-03T18:00:00-05:00'},{sha256:sha('x'),foto:{url:'u'},usuario:'Ana',uid:'u1',ahora:LIMA('2026-11-04T09:00:00'),recibidoEn:'2026-11-03T22:12:00Z'});
ok(doc.fotoEn===Date.parse('2026-11-03T22:12:00Z')&&doc.fotoEnOrigen==='bandeja'&&doc.creadoEn===LIMA('2026-11-04T09:00:00'),'la evidencia importada guarda la fecha de la foto aparte de la de importación');

/* ---------- título de una evidencia sin producto leído ---------- */
const hash='0a871f61bc81cbed773283c521374d43a435422227b035e071b0beec26ebeaef.jpg';
const sinProd=(campos,extra)=>Object.assign({campos,archivoOriginal:hash,categoria:'bolsas'},extra||{});
ok(N.tituloEvidencia(sinProd({producto:{valor:'BOLSA 3 KG'}}))==='BOLSA 3 KG','título: el producto leído');
ok(N.tituloEvidencia(sinProd({marca:{valor:'Glacial'},presentacion:{valor:'3 kg'}}))==='Glacial · 3 kg','sin producto: marca y presentación');
ok(N.tituloEvidencia(sinProd({}))==='Etiqueta de bolsas sin producto leído','sin datos: nunca el nombre técnico del archivo (huella de la foto)');
ok(N.tituloEvidencia(sinProd({},{archivoOriginal:'etiqueta-bobina.jpg'}))==='etiqueta-bobina.jpg','un nombre de archivo puesto por una persona sí se muestra');

/* ---------- plan del lote con la fecha de la foto ---------- */
/* ---------- evidencia lista (todo legible) ---------- */
function evidencia(o={}){
  const base=Object.fromEntries(N.CAMPOS.map(c=>[c.campo,{literal:null,valor:null,estado:'ausente',origen:'imagen',historial:[]}]));
  const poner=(k,v,estado='legible')=>{base[k]={literal:String(v),valor:v,estado,origen:'imagen',historial:[]};};
  poner('proveedor','PLASTICOS DEL SUR S.A.');poner('producto','FILM TERMOCONTRAIBLE 17 MICRAS');poner('lote',o.lote||'2410-118');poner('numero_caja_bobina',o.bobina||'07');
  poner('orden_interna','OI-4411');poner('fecha_produccion','2026-10-10');poner('fecha_vencimiento','2027-10-10');poner('peso_neto_kg',25.4);poner('peso_bruto_kg',26.9);
  if(o.dudoso)base.peso_neto_kg.estado='requiere_revision';
  const id=sha('foto-'+(o.id||'1'));
  return {id,estado:o.estado||'pendiente',rev:o.rev||1,leyenda:o.leyenda||'',categoria:'polietileno',tipoDocumento:'etiqueta_insumo',campos:base,
    foto:{url:'supabase:glacial-fotos/asistente/evidencias/'+id+'.jpg',mimetype:'image/jpeg',bytes:100},archivoOriginal:'film.jpg',historialEstados:[{estado:'pendiente',accion:'importado',por:'Ana',en:1}],creadoPor:'Ana',creadoEn:1000+(Number(o.id)||0),actualizadoEn:1000};
}
const CATALOGO=[{id:'a1',itemCode:'105-001',nombre:'LAMINA TERMOENCOGIBLE 17 MICRAS',categoria:'LAMINA TERMOENCOGIBLE',marca:'',activo:true},{id:'a3',itemCode:'105-003',nombre:'TAPA 38 MM AZUL',categoria:'TAPA',marca:'',activo:true}];

/* ---------- entorno: base de documentos simulada con onSnapshot de colección y de documento, where y transacciones ---------- */
function entorno(rol,{cargarLotes=true}={}){
  const sb={console,Math,Number,Array,Object,String,Set,Map,JSON,Date,Promise,Error,setTimeout,clearTimeout,setInterval:()=>0,Uint8Array,ArrayBuffer,crypto:crypto.webcrypto};
  vm.createContext(sb);sb.window=sb;
  const docs=new Map(),oyentes=[];let auto=0;
  const snapDoc=k=>({exists:docs.has(k),data:()=>JSON.parse(JSON.stringify(docs.get(k)))});
  const avisar=()=>oyentes.slice().forEach(f=>f());
  const guardar=(k,d)=>docs.set(k,JSON.parse(JSON.stringify(d)));
  const ref=(c,id)=>({c,id,k:c+'/'+id,get:async()=>snapDoc(c+'/'+id),set:async d=>{guardar(c+'/'+id,d);avisar();},
    onSnapshot(cb){const f=()=>cb(snapDoc(c+'/'+id));oyentes.push(f);f();return()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};}});
  const consulta=(c,filtro)=>({where:(campo,op,v)=>consulta(c,x=>filtro(x)&&x[campo]===v),
    onSnapshot(cb){const f=()=>cb({docs:[...docs.entries()].filter(([k,v])=>k.startsWith(c+'/')&&filtro(v)).map(([,v])=>({data:()=>JSON.parse(JSON.stringify(v))}))});oyentes.push(f);f();return()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};}});
  sb.docs=docs;sb.escrituras=[];sb.avisar=avisar;
  sb.db={collection:c=>Object.assign(consulta(c,()=>true),{doc:id=>ref(c,id||('auto'+(++auto)))}),
    runTransaction:async fn=>{const w=[];const t={get:async r=>snapDoc(r.k),set:(r,d)=>w.push([r,d])};await fn(t);w.forEach(([r,d])=>{guardar(r.k,d);sb.escrituras.push(r.k);});avisar();}};
  sb.firebase={firestore:{FieldValue:{serverTimestamp:()=>'__TS__'}},auth:()=>({currentUser:{uid:'u1'}})};
  sb.state={user:{rol,permisos:[],nombre:'Ana',username:'ana'},currentTab:'asistente'};
  sb.PERMISOS_APP=[];
  sb.glacialFotos={PREFIJO:'supabase:glacial-fotos/',disponible:()=>true,atributosImg:u=>`src="px" data-foto-ref="${u}"`,atributosEnlace:u=>`href="#" data-foto-ref="${u}"`};
  sb.modal={innerHTML:''};
  sb.document={getElementById:id=>id==='modal-root'?sb.modal:null,querySelector:()=>null};
  sb.AP_set=(k,v)=>{sb.apSet=[k,v];};
  vm.runInContext('function tienePermiso(p){return false;}',sb);
  const archivos=['74-inventario-insumos-nucleo','75-inventario-insumos-datos','84-evidencias-insumos-nucleo','85-evidencias-insumos-datos','86-evidencias-insumos-pantalla'];
  if(cargarLotes)archivos.push('87-trazabilidad-lotes-nucleo','88-trazabilidad-lotes-datos','89-trazabilidad-lotes-pantalla');
  archivos.forEach(n=>vm.runInContext(leer('js/asistente/'+n+'.js'),sb));
  return sb;
}
const sembrar=(sb,ev)=>{sb.docs.set('insumosEvidencias/'+ev.id,JSON.parse(JSON.stringify(ev)));sb.avisar();};
const ejecutar=async f=>{try{return {r:await f()};}catch(e){return {e};}};
const coleccion=(sb,c)=>[...sb.docs.entries()].filter(([k])=>k.startsWith(c+'/')).map(([,v])=>v);
const auditoria=sb=>coleccion(sb,'insumosAuditoria');


const fotoA=LIMA('2026-11-03T07:40:00'),valida=LIMA('2026-11-04T00:30:00');
const e=evidencia({id:'9'});
const p=T.planCrearLote({doc:e,lotePrevio:null,unidadPrevia:null,correlativo:5,articulo:null,leyenda:{tipo:''},usuario:'Ana',uid:'u1',en:valida,fotoEn:fotoA,fotoEnOrigen:'whatsapp'});
ok(p.unidad.recibidaEn===fotoA&&p.unidad.creadoEn===valida&&p.lote.recibidoEn===fotoA&&p.lote.creadoEn===valida,'unidad y lote: fecha de la foto (recepción) aparte de la de validación');
ok(p.movimiento.ocurridoEnMs===fotoA&&p.movimiento.enMs===valida&&p.unidad.historial[0].en===fotoA,'el movimiento de recepción ocurrió cuando se envió la foto; enMs sigue siendo cuándo se registró');
const p2=T.planCrearLote({doc:evidencia({id:'10',bobina:'08'}),lotePrevio:p.lote,unidadPrevia:null,usuario:'Ana',uid:'u1',en:valida+5,leyenda:{tipo:''},fotoEn:fotoA-3600000});
ok(p2.lote.recibidoEn===fotoA-3600000,'el lote toma la foto más antigua de sus unidades');
const tl=T.lineaDeTiempo([{id:'a',loteId:'L',enMs:valida,ocurridoEnMs:fotoA},{id:'b',loteId:'L',enMs:fotoA+60000}],{loteId:'L'});
ok(tl.map(m=>m.id).join()==='b,a','la línea de tiempo se ordena por cuándo ocurrió (la foto), no por cuándo se validó');

/* ---------- unidad física y contenido ---------- */
ok(T.unidadFisica('etiquetas').uno==='bobina'&&T.unidadFisica('bolsas').varios==='bobinas'&&T.unidadFisica('preformas').uno==='caja'&&T.unidadFisica('otro').uno==='caja / bobina','etiquetas y bolsas se cuentan en bobinas; preformas y tapas en cajas');
const cont=T.contenidoLote([{estado:'EN_ALMACEN',cantidad:1026,unidadCantidad:'und'},{estado:'EN_USO',cantidad:974,unidadCantidad:'UND'},{estado:'CONSUMIDA',cantidad:500,unidadCantidad:'UND'},{estado:'EN_ALMACEN',cantidad:null}]);
ok(cont.length===1&&cont[0].unidad==='UND'&&cont[0].cantidad===2000,'contenido del lote: suma lo que dicen las etiquetas (sin las consumidas), sin mezclar unidades');
const CAT=[{id:'b1',itemCode:'201-01',nombre:'BOLSA GLACIAL 3 KG',categoria:'BOLSA',activo:true},{id:'b2',itemCode:'201-02',nombre:'BOLSA FILETAS 1 KG',categoria:'BOLSA',activo:true},{id:'b3',itemCode:'201-03',nombre:'BOLSA VIEJA',categoria:'BOLSA',activo:false}];
ok(T.buscarArticulos(CAT,'bolsa 3').map(a=>a.id).join()==='b1'&&T.buscarArticulos(CAT,'201-02').map(a=>a.id).join()==='b2'&&!T.buscarArticulos(CAT,'vieja').length&&!T.buscarArticulos(CAT,'').length,'búsqueda en todo el catálogo: por palabras o código; sin los inactivos');

(async()=>{
  const sb=entorno('Asistente de Producción'),Z=sb.glacialTrazabilidadDatos,EVD=sb.glacialEvidenciasDatos;
  sb.docs.set('insumosCatalogo/catalogo',{id:'catalogo',items:CATALOGO.concat([{id:'a9',itemCode:'109-9',nombre:'BOBINA LAMINA IMPRESA GLACIAL',categoria:'BOBINA',activo:true}])});
  Z.escuchar();EVD.escuchar();
  const ev=evidencia({id:'21'});ev.fotoEn=fotoA;ev.fotoEnOrigen='whatsapp';sembrar(sb,ev);
  const r=await Z.crearLoteDesdeEvidencia(ev.id,1,{});
  const lote=sb.docs.get('insumosLotes/'+r.loteId),un=sb.docs.get('insumosUnidades/'+r.unidadId),mov=sb.docs.get('insumosLoteMovimientos/MOV-'+ev.id+'-RECEPCION');
  ok(un.recibidaEn===fotoA&&mov.ocurridoEnMs===fotoA&&lote.recibidoEn===fotoA&&lote.creadoEn!==fotoA,'datos: el lote creado guarda la fecha de la foto de su evidencia');
  ok(!lote.itemId,'creado con «Ninguno / elegir después»: sin artículo');
  ok(Z.buscarArticulos('bobina impresa').some(a=>a.id==='a9'),'datos: busca en todo el catálogo del Inventario');
  await Z.asignarArticulo(lote.id,lote.rev,'a9');
  const l2=sb.docs.get('insumosLotes/'+lote.id);
  ok(l2.itemId==='a9'&&l2.rev===lote.rev+1&&l2.historial.some(h=>h.accion==='articulo_cambiado'),'asignar artículo después: lote con el artículo, revisión +1 e historial');
  ok(auditoria(sb).some(a=>a.tipo==='CAMBIAR_ARTICULO_LOTE'&&a.antes.itemId===''&&a.despues.itemId==='a9'),'queda en la auditoría (antes → después)');
  const conc=await ejecutar(()=>Z.asignarArticulo(lote.id,lote.rev,'a1'));
  ok(conc.e&&conc.e.codigo==='CONCURRENCIA','con una revisión vieja no pisa el cambio de otra persona');
  const mem=sb.docs.get('insumosParametros/memoriaArticulos');
  ok(mem&&Object.values(mem.mapa).includes('a9'),'la elección se recuerda para el próximo lote del mismo proveedor y producto');
  const lect=entorno('Jefe de Operaciones');
  const sin=await ejecutar(()=>lect.glacialTrazabilidadDatos.asignarArticulo(lote.id,1,'a9'));
  ok(sin.e&&sin.e.codigo==='PERMISO','un rol de solo consulta no cambia el artículo');

  /* ---------- pantalla ---------- */
  sb.iiLotesUI.estado.sel=lote.id;Z.escucharMovimientos(lote.id);
  const h=sb.iiLotesUI.html();
  ok(/Foto enviada \(recepción\)/.test(h)&&/Validado y registrado/.test(h)&&/03\/11 07:40/.test(h),'ficha: «Foto enviada (recepción)» con la hora de la foto y «Validado y registrado» aparte');
  ok(/N\.º bobina/.test(h)&&/Bobina 07/.test(h)&&/Contenido \(etiqueta\)/.test(h)&&/Cada foto es <b>una bobina<\/b>/.test(h),'ficha: la unidad se llama bobina (con su n.º de etiqueta) y la cantidad se llama «Contenido»');
  ok(/03\/11 07:40<\/b> <span class="ii-mut">\(foto\)/.test(h),'línea de tiempo: la recepción con la hora de la foto');
  ok(/Cambiar<\/button>/.test(h)&&/ilAbrirArticulo/.test(h),'ficha: botón para cambiar el artículo');
  const s89=leer('js/asistente/89-trazabilidad-lotes-pantalla.js');
  ok(/¿No está en la lista\? Busca en todo el catálogo/.test(s89)&&/Ninguno \/ elegir después/.test(s89),'diálogo: buscador en todo el catálogo y «Ninguno / elegir después» con su explicación');
  const html=leer('index.html');
  ok(['84-evidencias-insumos-nucleo','85-evidencias-insumos-datos','86-evidencias-insumos-pantalla','87-trazabilidad-lotes-nucleo','88-trazabilidad-lotes-datos','89-trazabilidad-lotes-pantalla','92-lotes-en-cuadro'].every(n=>{const m=new RegExp(n+'\\.js\\?v=(\\d{8})-').exec(html);return m&&m[1]>='20261104';}),'index.html sube la versión de los archivos tocados');
  console.log(fallas?fallas+' fallas':'todo correcto');
})().catch(e=>{console.error(e);process.exit(1);});
