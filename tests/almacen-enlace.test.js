/* Asistente ↔ Inventario de insumos · enlace con Almacén: núcleo (stock = último corte − entregas posteriores) y entrega de una solicitud
   con su libro apAlmacenMov (js/asistente/80-almacen-enlace-nucleo.js, 81-almacen-enlace-datos.js, 71 y 72). node tests/almacen-enlace.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');
const E=require('../js/asistente/80-almacen-enlace-nucleo.js');

/* ================= núcleo ================= */
const catalogo=[{id:'100123',itemCode:'100123',nombre:'PREFORMA 625 ML'},{id:'N:105:tapa',itemCode:'',nombre:'TAPA 28',alias:['100200']},{id:'100999',itemCode:'100999',nombre:'NO ESTA EN CORTE'}];
const corte={items:[{id:'100123',w:[1000,50,0,0,0,0],t:1050},{id:'N:105:tapa',w:[300,0,0,0,0,0],t:300}]};
const meta={id:'C1',fechaCorte:'2026-10-15'};
const ins={codigo:'PREFORMA',itemCode:'100123',unidad:'UND'};
{
  const base=E.stockAlmacen({insumo:ins,catalogo,corte,corteMeta:meta,movs:[]});
  ok(base.estado==='OK'&&base.base===1000&&base.disponible===1000&&base.fechaCorte==='2026-10-15','stock = columna «Insumos y Suministros» del último corte (no el total de almacenes)');
  const movs=[
    {opId:'a',tipo:'ENTREGA',insumo:'PREFORMA',cantidad:200,fecha:'2026-10-16'},
    {opId:'b',tipo:'ENTREGA',insumo:'PREFORMA',cantidad:50,fecha:'2026-10-17'},
    {opId:'c',tipo:'ENTREGA',insumo:'PREFORMA',cantidad:70,fecha:'2026-10-15'},          // del mismo día del corte: SAP ya la trae
    {opId:'d',tipo:'ENTREGA',insumo:'TAPA',cantidad:99,fecha:'2026-10-16'},
    {opId:'x',tipo:'ANULACION',insumo:'PREFORMA',anulaA:'b',cantidad:50,fecha:'2026-10-17'}];
  const s=E.stockAlmacen({insumo:ins,catalogo,corte,corteMeta:meta,movs});
  ok(s.entregado===200&&s.disponible===800,'resta las entregas posteriores a la fecha del corte, ignora las anuladas y las del día del corte');
  const s2=E.stockAlmacen({insumo:ins,catalogo,corte,corteMeta:{id:'C2',fechaCorte:'2026-10-17'},movs});
  ok(s2.entregado===0&&s2.disponible===1000,'un corte nuevo de SAP pasa a ser la base: las entregas anteriores a su fecha ya no restan');
  ok(E.stockAlmacen({insumo:{codigo:'X'},catalogo,corte,corteMeta:meta,movs}).estado==='SIN_ENLACE','insumo sin código SAP: sin enlace, no se descuenta');
  ok(E.stockAlmacen({insumo:{codigo:'X',itemCode:'ZZZ'},catalogo,corte,corteMeta:meta,movs}).estado==='SIN_ARTICULO','código SAP que no está en el catálogo');
  ok(E.stockAlmacen({insumo:{codigo:'N',itemCode:'100999'},catalogo,corte,corteMeta:meta,movs}).estado==='SIN_FILA','artículo del catálogo que no viene en el último corte');
  ok(E.stockAlmacen({insumo:ins,catalogo,corte:null,corteMeta:null,movs}).estado==='SIN_CORTE','sin corte importado');
  ok(E.stockAlmacen({insumo:{codigo:'TAPA',itemCode:'100200'},catalogo,corte,corteMeta:meta,movs}).disponible===300-99,'el insumo se une al artículo también por alias del catálogo');
}
{
  const st={PREFORMA:{estado:'OK',disponible:800},TAPA:{estado:'OK',disponible:10},LIBRE:{estado:'SIN_ENLACE'}};
  const v=E.validarEntregaContraStock({PREFORMA:500,TAPA:30,LIBRE:9999},st);
  ok(v.errores.length===1&&/TAPA/.test(v.errores[0])&&v.sinStock.join()==='TAPA','entregar más de lo que hay es un error; lo sin enlace no se valida');
  ok(E.validarEntregaContraStock({TAPA:30},st,{autorizarSinStock:true,motivo:'x'}).errores.length===1,'autorizar sin stock exige motivo');
  const v2=E.validarEntregaContraStock({TAPA:30},st,{autorizarSinStock:true,motivo:'Stock pendiente de ingreso'});
  ok(v2.errores.length===0&&v2.sinStock[0]==='TAPA','con motivo se puede entregar sin stock (queda marcado)');
  const sol={id:'SOL-1',fecha:'2026-10-16',items:[{insumo:'PREFORMA',unidad:'UND',solicitado:500},{insumo:'LIBRE',unidad:'UND',solicitado:3}]};
  const mv=E.movimientosEntrega(sol,{PREFORMA:300,LIBRE:3,OTRO:0},2,[{codigo:'PREFORMA',itemCode:'100123',unidad:'UND'},{codigo:'LIBRE',itemCode:''}],{en:5000,sinStock:[],motivo:''});
  ok(mv.length===1&&mv[0].opId==='SOL-1_ENT2_PREFORMA'&&mv[0].tipo==='ENTREGA'&&mv[0].cantidad===300&&mv[0].itemCode==='100123','solo los insumos enlazados generan movimiento; el id es determinista por solicitud y n.º de entrega');
  const tc=E.transitoYComprometido([{estado:'ENTREGADA_PARCIAL',items:[{insumo:'A',solicitado:100,entregado:60,recibido:20}]},{estado:'SOLICITADA',items:[{insumo:'A',solicitado:30,entregado:0,recibido:0}]},{estado:'CERRADA',items:[{insumo:'A',solicitado:9,entregado:9,recibido:0}]}]);
  ok(tc.A.transito===40&&tc.A.comprometido===70,'en tránsito = entregado − recibido; comprometido = pedido aún sin entregar (solicitudes abiertas)');
  const rp=E.revisarPedido([{insumo:'TAPA',solicitado:50,entregado:0}],st);
  ok(rp[0].falta===40&&rp[0].disponible===10,'al pedir se ve cuánto faltaría en Almacén');
}

/* ================= entrega de una solicitud (datos) ================= */
const SERVER={__server:true};
function crearDb(){
  const docs=new Map();let auto=0;
  const resolver=v=>v===SERVER?Date.now():(Array.isArray(v)?v.map(resolver):(v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,resolver(x)])):v));
  const snap=(id,d)=>({id,exists:d!==undefined,data:()=>d===undefined?undefined:JSON.parse(JSON.stringify(d))});
  const ref=(col,id)=>({path:col+'/'+id,id,col});
  const db={docs,collection:col=>({doc:id=>ref(col,id===undefined?'auto'+(++auto):id)}),
    async runTransaction(fn){
      const esc=[];let escribio=false;
      const tx={async get(r){if(escribio)throw new Error('lecturas antes de escrituras');return snap(r.id,docs.get(r.path));},
        set(r,d){escribio=true;esc.push([r.path,resolver(d)]);}};
      const res=await fn(tx);esc.forEach(([p,d])=>docs.set(p,d));return res;}};
  return db;
}
function entorno(usuario,db){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,Promise,Error,RegExp};vm.createContext(sb);sb.window=sb;sb.globalThis=sb;
  sb.db=db;sb.firebase={firestore:{FieldValue:{serverTimestamp:()=>SERVER}},auth:()=>({currentUser:{uid:usuario.uid}})};
  sb.state={user:usuario};sb.PERMISOS_APP=[];sb.tienePermiso=()=>false;
  let t=1000;sb.tareoAhoraServidor=()=>++t;
  ['70-asistente-nucleo','71-asistente-datos','80-almacen-enlace-nucleo','81-almacen-enlace-datos'].forEach(f=>vm.runInContext(leer('js/asistente/'+f+'.js'),sb));
  return {sb,D:sb.glacialAsistenteDatos,EN:sb.glacialAlmacenEnlaceDatos};
}
const espera=async p=>{try{await p;return null;}catch(e){return e;}};
(async()=>{
  const db=crearDb();
  const asis=entorno({uid:'u1',rol:'Asistente de Producción',nombre:'Ana',permisos:[]},db);
  const alm=entorno({uid:'u2',rol:'Personalizado',nombre:'Luis',permisos:['moduloAlmacen']},db);
  [asis,alm].forEach(e=>{
    e.D.cache.insumos=[{codigo:'PREFORMA',nombre:'Preforma 625',unidad:'UND',itemCode:'100123'},{codigo:'CARTON',nombre:'Cartón',unidad:'plancha',itemCode:''}];
    e.EN.cache.catalogo=catalogo;e.EN.cache.cortes=[meta];e.EN.cache.corteId='C1';e.EN.cache.corte=corte;e.EN.cache.movs=[];
  });
  const movs=()=>[...db.docs.entries()].filter(([k])=>k.startsWith('apAlmacenMov/')).map(([,d])=>d);
  const recarga=()=>{[asis,alm].forEach(e=>{e.EN.cache.movs=movs();});};
  const id=await asis.D.crearSolicitud({fecha:'2026-10-16',bloque:'DIA',items:[{insumo:'PREFORMA',unidad:'UND',solicitado:1500},{insumo:'CARTON',unidad:'plancha',solicitado:40}],enviar:true});
  const sol=()=>db.docs.get('apSolicitudes/'+id);
  await alm.D.cambiarEstadoSolicitud(id,'EN_PREPARACION',1);

  const e1=await espera(alm.D.cambiarEstadoSolicitud(id,'ENTREGADA_PARCIAL',2,{entregas:{PREFORMA:1200}}));
  ok(e1&&e1.codigo==='VALIDACION'&&/Almacén tiene 1000/.test(e1.message)&&!movs().length&&sol().version===2,'entregar más de lo que Almacén tiene (1000) se rechaza y no guarda nada');
  const e2=await espera(alm.D.cambiarEstadoSolicitud(id,'ENTREGADA_PARCIAL',2,{entregas:{PREFORMA:1200},autorizarSinStock:true,motivoSinStock:'x'}));
  ok(e2&&/motivo/.test(e2.message),'autorizar sin stock exige un motivo');

  await alm.D.cambiarEstadoSolicitud(id,'ENTREGADA_PARCIAL',2,{entregas:{PREFORMA:600,CARTON:10}});
  recarga();
  ok(movs().length===1&&movs()[0].opId===id+'_ENT1_PREFORMA'&&movs()[0].cantidad===600&&movs()[0].uid==='u2'&&movs()[0].fecha==='2026-10-16'&&!movs()[0].sinStock,
    'la entrega crea UN movimiento ENTREGA por insumo enlazado (el cartón, sin código SAP, no descuenta)');
  ok(alm.EN.stockDe('PREFORMA').disponible===400&&asis.EN.stockDe('PREFORMA').disponible===400,'el stock de Almacén baja de 1000 a 400 para Almacén y para el Asistente');
  ok(sol().historial.filter(h=>h.entrega).length===1&&sol().items[0].entregado===600,'la solicitud registra la entrega y su historial la marca');

  await alm.D.cambiarEstadoSolicitud(id,'ENTREGADA_PARCIAL',3,{entregas:{PREFORMA:400}});
  recarga();
  ok(movs().length===2&&movs().some(m=>m.opId===id+'_ENT2_PREFORMA')&&alm.EN.stockDe('PREFORMA').disponible===0,'la segunda entrega usa otro id (ENT2) y deja el stock en 0');

  await alm.D.cambiarEstadoSolicitud(id,'ENTREGADA',4,{entregas:{PREFORMA:500},autorizarSinStock:true,motivoSinStock:'Llega camión mañana'});
  recarga();
  const sin=movs().find(m=>m.opId===id+'_ENT3_PREFORMA');
  ok(sin&&sin.sinStock===true&&sin.motivo==='Llega camión mañana'&&alm.EN.stockDe('PREFORMA').disponible===-500,'con autorización y motivo se entrega sin stock: queda marcado y el saldo muestra el faltante');
  ok(sol().estado==='ENTREGADA_PARCIAL'&&sol().items[0].entregado===1500,'la solicitud sigue «Entregada parcialmente» mientras falte cartón, con las preformas completas');
  ok(![...db.docs.keys()].some(k=>k.startsWith('apMovimientos/')),'el descuento de Almacén NO escribe en el libro de Producción (eso solo lo hace la recepción)');

  const tc=asis.sb.glacialAlmacenEnlace.transitoYComprometido([sol()]);
  ok(tc.PREFORMA.transito===1500,'lo entregado y no recibido queda «en tránsito» hacia Producción');
  console.log(fallas?`\n${fallas} fallas`:'\nTodo en orden');
})();

/* ================= integración (archivos) ================= */
{
  const idx=leer('index.html'),p72=leer('js/asistente/72-asistente-pantalla.js'),p71=leer('js/asistente/71-asistente-datos.js');
  ok(/asistente\/80-almacen-enlace-nucleo\.js\?v=/.test(idx)&&/asistente\/81-almacen-enlace-datos\.js\?v=/.test(idx)&&idx.indexOf('81-almacen-enlace-datos')>idx.indexOf('71-asistente-datos'),'index.html carga el enlace después de los datos del Asistente');
  ok(/apAlmacenMov/.test(p71)&&/glacialAlmacenEnlaceDatos\.escuchar/.test(p71),'71 escribe apAlmacenMov y arranca la escucha del stock');
  ok(/ap-i-sap/.test(p72)&&/apAvisoStock/.test(p72)&&/ap-sin-stock/.test(p72),'72 muestra el código SAP del insumo, el aviso al solicitar y la autorización sin stock');
  ok(/apAlmacenMov/.test(leer('supabase/migraciones/glacial_27_almacen_enlace_inventario.sql')),'existe la migración glacial_27');
}
