/* Trazabilidad (auditoría 2026-11-06): T1 informe (de insumo a producción y de producto a insumos), T2 todas las categorías en el cuadro y
   T3 correcciones del lote (cambiar categoría, unir lotes repetidos, aviso de posible repetido al crear). node tests/trazabilidad-informe-correcciones.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const N=require('../js/asistente/84-evidencias-insumos-nucleo.js');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const T=require('../js/asistente/87-trazabilidad-lotes-nucleo.js');
require('../js/asistente/90-control-proceso-nucleo.js');
const I=require('../js/asistente/94-trazabilidad-informe.js');
const L=require('../js/asistente/92-lotes-en-cuadro.js');
const lanza=f=>{try{f();return null;}catch(e){return e;}};

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


/* ================= T3 · núcleo ================= */
const lote=(id,o)=>Object.assign({id,clave:'',proveedor:'X',producto:'BOBINA BOLSA GLACIAL 3KG',categoria:'bolsas',loteProveedor:'12158',unidades:1,rev:1,historial:[]},o||{});
const L7=lote('LI-000007',{proveedor:'Corporacion ASK SMC'}),L11=lote('LI-000011',{proveedor:'Corporación SK / Consorcio FRAP',producto:'BOBINA BOLSA GLACIAL3KG'}),L14=lote('LI-000014',{proveedor:'CORPORACION ASK'});
[L7,L11,L14].forEach(l=>{l.clave=T.claveLote(l);});
const otro=lote('LI-000020',{loteProveedor:'99999'});otro.clave=T.claveLote(otro);
const pref=lote('LI-000001',{producto:'A-SM-EI-062 ETIQ. TERMO SCALA 2500 ML',categoria:'preformas',loteProveedor:'1343-26',proveedor:'FIBRAPRINT S.A.C.'});pref.clave=T.claveLote(pref);
const todos=[L7,L11,L14,otro,pref];

const dup=T.posiblesDuplicados({loteProveedor:'12158',producto:'BOBINA BOLSA GLACIAL 3KG',categoria:'bolsas',proveedor:'CORPORACION ASK SAC'},todos);
ok(dup.map(l=>l.id).join()==='LI-000007,LI-000011,LI-000014','caso real: el lote 12158 con el proveedor escrito de 3 formas se reconoce como posible repetido');
ok(T.posiblesDuplicados({loteProveedor:'12158',producto:'X',categoria:'bolsas',clave:L7.clave},todos,{excepto:'LI-000007'}).map(l=>l.id).join()==='LI-000011,LI-000014','desde la ficha: no se lista a sí mismo');
ok(!T.posiblesDuplicados({loteProveedor:'12158',producto:'PREFORMA 90 G',categoria:'preformas'},todos).length,'mismo n.º de lote pero otro insumo (otra categoría y sin palabras en común): no es repetido');

const cc=T.planCambiarCategoria({lote:pref,categoria:'etiquetas',motivo:'Es una etiqueta, no preforma',usuario:'Ana',en:5});
ok(cc.lote.categoria==='etiquetas'&&cc.lote.rev===2&&/preformas → etiquetas/.test(cc.lote.historial.slice(-1)[0].motivo),'caso real LI-000001: la etiqueta guardada como preforma pasa a «etiquetas» con historial');
ok((lanza(()=>T.planCambiarCategoria({lote:pref,categoria:'etiquetas',motivo:'ok'}))||{}).codigo==='VALIDACION','cambiar categoría exige motivo (5+ caracteres)');
ok((lanza(()=>T.planCambiarCategoria({lote:pref,categoria:'inventada',motivo:'motivo largo'}))||{}).codigo==='VALIDACION','solo categorías válidas');

const u=(id,loteId,numero,estado)=>({id,loteId,numero,estado:estado||'EN_ALMACEN',pesoActual:10,linea:'',rev:1,historial:[]});
const plan=T.planUnirLotes({origen:L11,destino:L7,unidadesOrigen:[u('LI-000011-02','LI-000011','02')],unidadesDestino:[u('LI-000007-01','LI-000007','01')],motivo:'Mismo lote, proveedor mal leído',usuario:'Ana',uid:'u1',en:9});
ok(plan.destino.unidades===2&&plan.destino.clavesUnidas.includes(L11.clave)&&plan.destino.lotesUnidos.includes('LI-000011'),'unir: el destino suma la caja/bobina y recuerda la llave y el id del lote unido');
ok(plan.origen.unidoEn==='LI-000007'&&plan.origen.unidades===0,'unir: el origen no se borra, queda «unido a» el destino');
ok(plan.unidades[0].loteId==='LI-000007'&&plan.unidades[0].id==='LI-000011-02'&&plan.unidades[0].loteOrigen==='LI-000011','unir: la caja/bobina conserva su id y pasa al destino');
ok(plan.movimientos[0].tipo==='UNION_LOTE'&&plan.movimientos[0].antes.loteId==='LI-000011'&&plan.movimientos[0].despues.loteId==='LI-000007'&&plan.movimientos[0].uid==='u1','unir: cada caja/bobina deja un movimiento UNION_LOTE');
ok((lanza(()=>T.planUnirLotes({origen:L11,destino:L7,unidadesOrigen:[u('LI-000011-01','LI-000011','1')],unidadesDestino:[u('LI-000007-01','LI-000007','01')],motivo:'motivo largo'}))||{}).codigo==='DUPLICADO','unir: si el destino ya tiene el mismo n.º no se une (sería la misma etiqueta dos veces)');
ok((lanza(()=>T.planUnirLotes({origen:otro,destino:L7,unidadesOrigen:[],unidadesDestino:[],motivo:'motivo largo'}))||{}).codigo==='VALIDACION','unir: solo con el mismo lote del proveedor');
ok((lanza(()=>T.planUnirLotes({origen:plan.origen,destino:L14,unidadesOrigen:[],unidadesDestino:[],motivo:'motivo largo'}))||{}).codigo==='ESTADO','unir: un lote ya unido no se vuelve a unir');
const tras=[plan.destino,plan.origen,L14,otro,pref];
ok(T.resolverLoteId('LI-000011',tras)==='LI-000007'&&T.resolverLoteId('LI-000014',tras)==='LI-000014','resolverLoteId sigue la unión');
ok(!T.filtrarLotes(tras,[],{}).some(l=>l.id==='LI-000011')&&T.filtrarLotes(tras,[],{texto:'LI-000011'}).some(l=>l.id==='LI-000011'),'la lista oculta el lote unido salvo que se busque por su ID');
ok(T.motivoNoPermitido(u('x','y','1','CONSUMIDA'),'UNION_LOTE')==='','el movimiento UNION_LOTE vale en cualquier estado (no cambia el estado)');

/* planCrearLote con lote elegido por la persona (posible repetido) */
const evDoc=o=>({id:'ev1',rev:1,estado:'aprobado_dato',categoria:'bolsas',campos:Object.fromEntries(Object.entries(Object.assign({proveedor:'CORPORACION ASK SAC',producto:'BOBINA BOLSA GLACIAL 3KG',lote:'12158',numero_caja_bobina:'05',peso_neto_kg:20},o||{})).map(([k,v])=>[k,{valor:v}]))});
const conUnion=T.planCrearLote({doc:evDoc(),lotePrevio:plan.destino,unidadPrevia:null,usuario:'Ana',en:10,unirAlLote:true});
ok(conUnion.lote.id==='LI-000007'&&conUnion.lote.clavesUnidas.includes(T.claveLote(T.datosDeEvidencia(evDoc())))&&conUnion.unidad.id==='LI-000007-05','crear con «agregar al lote parecido»: la foto suma una caja/bobina a ese lote y su llave queda recordada');
ok((lanza(()=>T.planCrearLote({doc:evDoc(),lotePrevio:plan.destino,unidadPrevia:null,usuario:'Ana',en:10}))||{}).codigo==='CLAVE','sin elegirlo, una llave distinta no entra a otro lote');
ok((lanza(()=>T.planCrearLote({doc:evDoc({lote:'777'}),lotePrevio:plan.destino,unidadPrevia:null,usuario:'Ana',en:10,unirAlLote:true}))||{}).codigo==='CLAVE','tampoco si el lote del proveedor es otro');
const dl=Object.assign({},plan.destino,{clavesUnidas:[T.claveLote(T.datosDeEvidencia(evDoc()))]});
ok(T.planCrearLote({doc:evDoc({numero_caja_bobina:'06'}),lotePrevio:dl,unidadPrevia:null,usuario:'Ana',en:11}).lote.id==='LI-000007','una llave ya recordada entra sola al lote');

/* ================= T2 · panel del cuadro ================= */
const disp=L.disponibles([{id:'B',categoria:'bolsas',loteProveedor:'1'},{id:'C',categoria:'cajas',loteProveedor:'2'},{id:'P',categoria:'polietileno',loteProveedor:'3'},{id:'O',categoria:'otro',loteProveedor:'4'}],
  ['B','C','P','O'].map(x=>({id:x+'-01',loteId:x,numero:'1',estado:'ENTREGADA_LINEA',linea:'C20L'})),'C20L');
ok(disp.map(d=>d.lote.id).join()==='B,C,P','T2: el supervisor ve bolsas, cajas y polietileno de su línea (no «otro»)');

/* ================= T1 · informe ================= */
const regs=[
  {id:'r1',linea:'B7L',fecha:'2026-11-02',turno:'NOCHE',estadoRegistro:'FINALIZADO',cuadros:[
    {numero:1,marca:'SCALA',presentacion:'7 Litros',lote:'CF3',produccion:{efectiva:3000},lotesInsumo:[{loteId:'LI-000002',loteProveedor:'PG10016320',categoria:'preformas',insumo:'90gr'},{loteId:'LI-000011',loteProveedor:'12158',categoria:'bolsas',insumo:'bolsa'}]},
    {numero:2,marca:'ARO',presentacion:'7 Litros',lote:'CF3',fechaVencimiento:'2027-11-30',produccion:{efectiva:500},lotesInsumo:[{loteId:'LI-000002',loteProveedor:'PG10016320',categoria:'preformas',insumo:'90gr'}]},
    {numero:3,marca:'BELLS',presentacion:'7 Litros',lote:'CF3',produccion:{efectiva:800}}]},
  {id:'r2',linea:'PET1',fecha:'2026-11-03',turno:'DÍA',estadoRegistro:'EN_REGISTRO',cuadros:[{numero:1,marca:'Glacial',presentacion:'625',lote:'CF1',produccion:{efectiva:10000},lotesInsumo:[{loteId:'LI-000007',loteProveedor:'12158',categoria:'bolsas'}]}]}];
const lotesInf=[{id:'LI-000002',loteProveedor:'PG10016320',producto:'90gr. Cr.3H CM',proveedor:'SAN MIGUEL',categoria:'preformas'},plan.destino,plan.origen];
const usos=I.usosDeRegistros(regs,lotesInf);
ok(usos.length===4,'una fila por producción × lote de insumo marcado');
ok(usos[0].lotePT==='CF3-03112027','lote de producto como el Control de proceso: noche del 02/11 → CF3-03112027 (fecha + 1 año, desde el día siguiente)');
ok(usos.find(x=>x.cuadro===2).lotePT==='CF3-30112027','si el cuadro trae vencimiento, se usa ese');
ok(usos.find(x=>x.loteIdGuardado==='LI-000011').loteId==='LI-000007','un lote unido se cuenta en el lote que lo recibió');
let r=I.buscar('PG10016320',{lotes:lotesInf,unidades:[],usos});
ok(r.insumos.length===1&&r.insumos[0].usos.length===2&&r.insumos[0].usos.every(x=>x.linea==='B7L'),'hacia adelante: el lote del proveedor PG10016320 → las 2 producciones de B7L donde se usó');
r=I.buscar('LI-000007',{lotes:lotesInf,unidades:[],usos});
ok(r.insumos.length===1&&r.insumos[0].usos.length===2&&r.insumos[0].usos.map(x=>x.linea).sort().join()==='B7L,PET1','hacia adelante con un lote unido: suma lo marcado con su id viejo (LI-000011) y el nuevo');
r=I.buscar('LI-000011',{lotes:lotesInf,unidades:[],usos});
ok(r.insumos.length===1&&r.insumos[0].lote.id==='LI-000007','buscar el id de un lote unido lleva al lote que lo recibió');
r=I.buscar('CF3-03112027',{lotes:lotesInf,unidades:[],usos});
ok(r.productos.length===1&&r.productos[0].insumos.preformas[0].loteProveedor==='PG10016320'&&r.productos[0].insumos.bolsas[0].loteId==='LI-000007'&&r.productos[0].efectiva===3000,'hacia atrás: el lote de producto CF3-03112027 → su preforma PG10016320 y su bolsa (lote unido resuelto)');
r=I.buscar('',{lotes:lotesInf,unidades:[],usos,filtros:{linea:'PET1'}});
ok(r.productos.length===1&&r.productos[0].linea==='PET1'&&!r.insumos.length,'sin búsqueda, con filtro de línea: los productos de esa línea');
r=I.buscar('',{lotes:lotesInf,unidades:[],usos,filtros:{desde:'2026-11-03'}});
ok(r.productos.every(p=>p.fecha>='2026-11-03'),'filtro de fechas');
const fx=I.filasExcel(usos);
ok(fx.length===4&&fx[0].length===I.COLUMNAS_EXCEL.length&&fx[0][7]==='Noche'&&fx.some(f=>f[13]==='En registro'),'filas del Excel: una por uso, con turno y estado del reporte');
const cob=I.cobertura(regs,{});
ok(cob.total===4&&cob.con===3&&cob.sin===1,'cobertura: cuántas producciones tienen lotes marcados (BELLS no)');

/* ================= T3 · transacciones (base simulada) ================= */
(async()=>{
  const sb=entorno('Asistente de Producción'),Z=sb.glacialTrazabilidadDatos;
  const set=(c,d)=>sb.docs.set(c+'/'+d.id,JSON.parse(JSON.stringify(d)));
  [L7,L11,L14,pref].forEach(l=>set('insumosLotes',l));
  set('insumosUnidades',u('LI-000007-01','LI-000007','01'));set('insumosUnidades',u('LI-000011-02','LI-000011','02'));set('insumosUnidades',u('LI-000014-03','LI-000014','03'));
  Z.escuchar();
  await Z.cambiarCategoria('LI-000001',1,'etiquetas','Es una etiqueta, no preforma');
  ok(sb.docs.get('insumosLotes/LI-000001').categoria==='etiquetas'&&coleccion(sb,'insumosAuditoria').some(a=>a.tipo==='CAMBIAR_CATEGORIA_LOTE'),'cambiar categoría: se guarda con auditoría');
  const cr=await ejecutar(()=>Z.cambiarCategoria('LI-000001',1,'tapas','motivo largo'));
  ok(cr.e&&cr.e.codigo==='CONCURRENCIA','cambiar categoría con una revisión vieja: no pisa a otra persona');
  const r1=await Z.unirLotes('LI-000011','LI-000007','Mismo lote 12158, proveedor mal leído');
  const r2=await Z.unirLotes('LI-000014','LI-000007','Mismo lote 12158, proveedor mal leído');
  const d7=sb.docs.get('insumosLotes/LI-000007');
  ok(r1.unidades===1&&r2.unidades===1&&d7.unidades===3&&d7.lotesUnidos.join()==='LI-000011,LI-000014','caso real: los 3 lotes de 12158 quedan en LI-000007 con sus 3 bobinas');
  ok(sb.docs.get('insumosUnidades/LI-000011-02').loteId==='LI-000007'&&sb.docs.get('insumosLotes/LI-000011').unidoEn==='LI-000007','las bobinas pasan y el lote unido queda marcado (no se borra)');
  ok(coleccion(sb,'insumosLoteMovimientos').filter(m=>m.tipo==='UNION_LOTE').length===2&&coleccion(sb,'insumosAuditoria').filter(a=>a.tipo==='UNIR_LOTES').length===2,'cada unión deja movimientos y auditoría');
  const sinPermiso=entorno('Jefe de Operaciones').glacialTrazabilidadDatos;
  const e3=await ejecutar(()=>sinPermiso.unirLotes('LI-000011','LI-000007','motivo largo'));
  ok(e3.e&&e3.e.codigo==='PERMISO','solo consulta: no puede unir lotes');
  /* foto nueva de un lote unido: va sola al lote que lo recibió (por la llave recordada) */
  set('insumosLotesClaves',{id:L14.clave,loteId:'LI-000014'});
  const ev=evidencia({id:'77'});
  ev.categoria='bolsas';
  const pone=(k,v)=>{ev.campos[k]={literal:String(v),valor:v,estado:'legible',origen:'imagen',historial:[]};};
  pone('proveedor','CORPORACION ASK');pone('producto','BOBINA BOLSA GLACIAL 3KG');pone('lote','12158');pone('numero_caja_bobina','09');pone('fecha_vencimiento','2027-10-10');
  sembrar(sb,ev);
  const c=await Z.crearLoteDesdeEvidencia(ev.id,1,{});
  ok(c.loteId==='LI-000007'&&c.unidadId==='LI-000007-09','una foto con la llave del lote unido (LI-000014) entra sola al lote que lo recibió');
  /* la misma bobina (n.º 03 vino de LI-000014) no se duplica aunque su id diga LI-000014-03 */
  const ev2=JSON.parse(JSON.stringify(ev));ev2.id=sha('foto-78');ev2.campos.numero_caja_bobina.valor='03';ev2.campos.numero_caja_bobina.literal='03';delete ev2.loteId;ev2.rev=1;
  sembrar(sb,ev2);
  const c2=await ejecutar(()=>Z.crearLoteDesdeEvidencia(ev2.id,1,{}));
  ok(c2.e&&c2.e.codigo==='DUPLICADO','la bobina 03 que vino del lote unido se reconoce como duplicada');
  /* foto con el proveedor escrito de otra forma: la persona elige agregarla al lote parecido */
  const ev3=JSON.parse(JSON.stringify(ev));ev3.id=sha('foto-79');ev3.campos.proveedor.valor='CORP. A.S.K. S.A.C.';ev3.campos.numero_caja_bobina.valor='10';delete ev3.loteId;ev3.rev=1;
  sembrar(sb,ev3);
  const diag=sb.__trazabilidadLotesPantalla.diagnostico(sb.glacialEvidenciasDatos.porId(ev3.id)||ev3);
  ok(diag.duplicados.length===1&&diag.duplicados[0].lote.id==='LI-000007','el diálogo avisa del posible lote repetido (LI-000007)');
  const c3=await Z.crearLoteDesdeEvidencia(ev3.id,1,{loteDestinoId:'LI-000007'});
  ok(c3.loteId==='LI-000007'&&sb.docs.get('insumosLotesClaves/'+T.claveLote(T.datosDeEvidencia(ev3))).loteId==='LI-000007','agregada al lote elegido; su llave queda en el índice apuntando a ese lote');

  /* integración */
  const html=leer('index.html'),s89=leer('js/asistente/89-trazabilidad-lotes-pantalla.js');
  ok(/94-trazabilidad-informe\.js\?v=20261106-/.test(html)&&html.indexOf('94-trazabilidad-informe')>html.indexOf('90-control-proceso-nucleo'),'index.html carga el informe después del Control de proceso');
  ok(['87-trazabilidad-lotes-nucleo','88-trazabilidad-lotes-datos','89-trazabilidad-lotes-pantalla','92-lotes-en-cuadro'].every(n=>new RegExp(n+'\\.js\\?v=20261106-').test(html)),'versiones nuevas de 87, 88, 89 y 92');
  ok(/Informe de trazabilidad/.test(s89)&&/ilAbrirCategoria/.test(s89)&&/ilAbrirUnir/.test(s89)&&/Posible lote repetido/.test(s89),'Lotes: vista «Informe de trazabilidad», botones de categoría y unir, y aviso de posible repetido');
  ok(!/insumosStock|stockSap/i.test(leer('js/asistente/94-trazabilidad-informe.js')),'el informe no toca stock SAP');
  if(fallas){console.log('\n'+fallas+' falla(s)');process.exit(1);}
  console.log('\nTodo correcto');
})().catch(e=>{console.log('✘ FALLA excepción: '+(e&&e.stack||e));process.exit(1);});
