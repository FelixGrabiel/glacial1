/* Asistente de Producción · TIEMPO REAL en un navegador (Chromium + Playwright): lo que otra persona guarda (entrega de Almacén, devolución, solicitud
   nueva) aparece solo, con aviso emergente, sin quitar lo que se escribe, y el Inventario muestra «Almacén hoy». Módulo real, base simulada en memoria.
   Uso: node tests/asistente-tiempo-real.e2e.js */
'use strict';
const http=require('http'),fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
let pw;try{pw=require('playwright');}catch(_){console.log('Se omite: falta playwright.');process.exit(0);}
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};

const PAGINA=`<!doctype html><meta charset="utf-8"><title>demo</title>
<style>body{margin:0;font-family:Inter,Segoe UI,Arial,sans-serif;background:#f4f6f9;color:#1b2733}#main{padding:18px;max-width:1380px;margin:0 auto}
.modal-backdrop{position:fixed;inset:0;background:rgba(15,25,35,.5);display:flex;align-items:center;justify-content:center;z-index:50}.modal{background:#fff;border-radius:14px;max-width:880px;width:94%;max-height:88vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)}
.modal-head{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid #e3e8ee}.modal-head h3{margin:0}.modal-close{border:0;background:none;font-size:18px;cursor:pointer}.modal-body{padding:16px 20px}</style>
<body><div id="main"></div><div id="modal-root"></div>
<script src="/js/nucleo/01b-fecha-operativa.js"></script>
<script>
window.__AHORA=Date.now();
window.state={user:{rol:'Asistente de Producción',nombre:'Ana Torres',username:'ana',permisos:[]},currentTab:'inicio'};
window.PERMISOS_APP=[];window.glacialCierresSesion=[];
function renderMain(){}function renderSidebar(){}function ajustarVistaSegunPermisos(){}
function closeModal(){document.getElementById('modal-root').innerHTML='';}
function tienePermiso(){return false;}
const FECHA=GlacialFecha.fechaOperativa(Date.now());
window.FECHA=FECHA;
const F1=GlacialFecha.sumarDias(FECHA,1),F2=GlacialFecha.sumarDias(FECHA,2),F3=GlacialFecha.sumarDias(FECHA,3);
window.loadProgramaciones=()=>[
 {id:'p1',fecha:FECHA,linea:'PET1',turno:'DÍA',marca:'Scala',presentacion:'2.5L',cantidadProgramada:13000,unidadesPorPaleta:0,modo:'FIJA',estadoOperacion:{estado:'EN_PRODUCCION'}},
 {id:'p2',fecha:FECHA,linea:'PET1',turno:'DÍA',marca:'Fontlife',presentacion:'2.5L',cantidadProgramada:7500,unidadesPorPaleta:0,modo:'FIJA',estadoOperacion:{estado:'PENDIENTE'}},
 {id:'p3',fecha:FECHA,linea:'PET2',turno:'DÍA',marca:'Scala Maracuyá',presentacion:'625mL',cantidadProgramada:9000,unidadesPorPaleta:0,modo:'COMPLETAR',estadoOperacion:{estado:'PENDIENTE'}},
 {id:'p4',fecha:FECHA,linea:'B7L',turno:'DÍA',marca:'Scala',presentacion:'7L',cantidadProgramada:1800,unidadesPorPaleta:0,modo:'HORA',tramosSecuencia:[{orden:1,tipoFin:'HORA',horaFin:'12:00'},{orden:2,tipoFin:'CIERRE'}],estadoOperacion:{estado:'LISTA'}},
 {id:'p5',fecha:F1,linea:'PET1',turno:'DÍA',marca:'Scala',presentacion:'2.5L',cantidadProgramada:14000,unidadesPorPaleta:0,modo:'TURNO',estadoOperacion:{estado:'PENDIENTE'}},
 {id:'p6',fecha:F1,linea:'PET2',turno:'DÍA',marca:'Scala',presentacion:'625mL',cantidadProgramada:11000,unidadesPorPaleta:0,modo:'FIJA',estadoOperacion:{estado:'PENDIENTE'}},
 {id:'p7',fecha:F2,linea:'PET1',turno:'DÍA',marca:'Fontlife',presentacion:'2.5L',cantidadProgramada:12000,unidadesPorPaleta:0,modo:'FIJA',estadoOperacion:{estado:'PENDIENTE'}},
 {id:'p8',fecha:F3,linea:'PET2',turno:'DÍA',marca:'Scala',presentacion:'625mL',cantidadProgramada:10000,unidadesPorPaleta:0,modo:'FIJA',estadoOperacion:{estado:'PENDIENTE'}}];
window.loadRecords=()=>[];
window.obtenerUnidadesPorPalet=()=>0;
window.glacialProduccionPaletasAlCorte=(linea,fecha,turnos,marca)=>fecha===FECHA&&linea==='PET1'&&marca==='Scala'?{valor:5200,encontrada:true}:{valor:0,encontrada:false};
(function(){
  const docs=new Map(),oy=[];let auto=0;
  const clone=v=>JSON.parse(JSON.stringify(v));
  const snap=k=>({exists:docs.has(k),data:()=>clone(docs.get(k))});
  const avisar=()=>oy.slice().forEach(f=>f());
  const ref=(c,id)=>({k:c+'/'+id,id,path:c+'/'+id,get:async()=>snap(c+'/'+id),set:async d=>{docs.set(c+'/'+id,clone(d));avisar();},
    onSnapshot(cb){const f=()=>cb(snap(c+'/'+id));oy.push(f);setTimeout(f,0);return()=>{const i=oy.indexOf(f);if(i>=0)oy.splice(i,1);};}});
  const lista=(c,fl)=>{let l=[...docs.entries()].filter(([k])=>k.startsWith(c+'/')).map(([k,v])=>({id:k.slice(c.length+1),data:()=>clone(v)}));
    fl.forEach(([k,op,v])=>{l=l.filter(x=>{const a=x.data()[k];return op==='>='?a>=v:op==='<='?a<=v:op==='>'?a>v:op==='<'?a<v:a===v;});});return {docs:l};};
  const consulta=(c,fl)=>({where:(k,op,v)=>consulta(c,fl.concat([[k,op,v]])),get:async()=>lista(c,fl),
    onSnapshot(cb,err){const f=()=>cb(lista(c,fl));oy.push(f);setTimeout(f,0);return()=>{const i=oy.indexOf(f);if(i>=0)oy.splice(i,1);};}});
  window.db={collection:c=>({...consulta(c,[]),doc:id=>ref(c,id||('a'+(++auto)))}),
    runTransaction:async fn=>{const w=[];await fn({get:async r=>snap(r.k),set:(r,d)=>w.push([r,d])});w.forEach(([r,d])=>docs.set(r.k,clone(d)));avisar();}};
  window.__docs=docs;window.__avisar=avisar;
  window.firebase={firestore:{FieldValue:{serverTimestamp:()=>Date.now()}},auth:()=>({currentUser:{uid:'u1'}})};
})();
window.tareoAhoraServidor=()=>Date.now();
</script>
<script src="/js/asistente/70-asistente-nucleo.js"></script><script src="/js/asistente/71-asistente-datos.js"></script><script src="/js/asistente/72-asistente-pantalla.js"></script>
<script src="/js/asistente/74-inventario-insumos-nucleo.js"></script><script src="/js/asistente/80-almacen-enlace-nucleo.js"></script><script src="/js/asistente/81-almacen-enlace-datos.js"></script><script src="/js/asistente/82-asistente-prevision-nucleo.js"></script><script src="/js/asistente/73-reporte-general.js"></script><script src="/js/asistente/83-asistente-reportes-pantalla.js"></script><script src="/js/asistente/75-inventario-insumos-datos.js"></script><script src="/js/asistente/76-inventario-insumos-pantalla.js"></script>
</body>`;
const srv=http.createServer((q,r)=>{
  if(q.url==='/'){r.setHeader('content-type','text/html; charset=utf-8');r.end(PAGINA);return;}
  const f=path.join(R,q.url.split('?')[0]);
  fs.readFile(f,(e,d)=>{if(e){r.statusCode=404;r.end();}else{r.setHeader('content-type','text/javascript');r.end(d);}});
});

/* Datos de ejemplo (se siembran en la base simulada antes de abrir el módulo). */
const SEMILLA=()=>{
  const ahora=Date.now(),h=n=>ahora-n*3600000,F=window.FECHA;
  const D=window.__docs,put=(c,id,d)=>D.set(c+'/'+id,d);
  const ins=[['PREFORMA','Preforma 625 mL / 2.5 L','UND','preforma','100123'],['TAPA','Tapa 28 mm','UND','tapa','100200'],['ETIQUETA','Etiqueta Scala','UND','etiqueta','100310'],
    ['POLIETILENO','Polietileno termoencogible','kg','laminas',''],['CARTON','Plancha de cartón','plancha','carton','']];
  ins.forEach(([codigo,nombre,unidad,tipo,itemCode])=>put('apInsumos',codigo,{codigo,nombre,unidad,tipo:'otro',itemCode,activo:true,version:1}));
  const fac=(insumo,linea,factor)=>({id:insumo+'_'+linea,insumo,linea,marca:'*',presentacion:'*',base:'UND',cantidadBase:1,factor,vigenteDesde:'2026-01-01',vigenteHasta:null,origen:'codigo',version:1});
  [['PREFORMA',1],['TAPA',1],['ETIQUETA',1]].forEach(([i,f])=>['PET1','PET2'].forEach(l=>{const x=fac(i,l,f);put('apFactores',x.id,x);}));
  const x1=fac('POLIETILENO','PET1',0.0012);put('apFactores',x1.id,x1);
  const mov=(opId,tipo,insumo,cantidad,horas,extra)=>put('apMovimientos',opId,Object.assign({opId,tipo,fecha:F,bloque:'DIA',linea:'',cuadro:'',insumo,unidad:'UND',cantidad,condicion:'UTILIZABLE',en:h(horas),uid:'u1',usuario:'Ana Torres'},extra||{}));
  mov('c1','CONTEO','PREFORMA',14000,5);mov('c2','CONTEO','TAPA',22000,5);mov('c3','CONTEO','ETIQUETA',9000,5);mov('c4','CONTEO','POLIETILENO',60,5,{unidad:'kg'});
  // Solicitudes
  put('apSolicitudes','SOL-DEMO-A',{id:'SOL-DEMO-A',fecha:F,bloque:'DIA',estado:'EN_PREPARACION',version:3,observaciones:'Faltantes del bloque',
    items:[{insumo:'ETIQUETA',unidad:'UND',solicitado:8000,entregado:0,recibido:0},{insumo:'PREFORMA',unidad:'UND',solicitado:6000,entregado:0,recibido:0}],
    historial:[{estado:'SOLICITADA',por:'Ana Torres',en:h(6),nota:'Creada'},{estado:'EN_PREPARACION',por:'Luis Quispe',en:h(5)}]});
  put('apSolicitudes','SOL-DEMO-B',{id:'SOL-DEMO-B',fecha:F,bloque:'DIA',estado:'ENTREGADA_PARCIAL',version:4,items:[{insumo:'TAPA',unidad:'UND',solicitado:10000,entregado:6000,recibido:0}],
    historial:[{estado:'SOLICITADA',por:'Ana Torres',en:h(14)},{estado:'ENTREGADA_PARCIAL',por:'Luis Quispe',en:h(13),entrega:true}]});
  // Mermas y coordinación
  const K=glacialAsistenteNucleo.claveCuadro(F,'DIA','PET1','Scala','2.5L'),K2=glacialAsistenteNucleo.claveCuadro(F,'DIA','PET1','Fontlife','2.5L');
  put('apMermas','M1',{id:'M1',fecha:F,bloque:'DIA',linea:'PET1',cuadro:K,categoria:'MATERIAL',insumo:'PREFORMA',cantidad:120,unidad:'UND',causa:'Arranque de línea',etapa:'Soplado',estado:'PENDIENTE',creadoPor:'Ana Torres',historial:[{en:h(3)}],version:1});
  put('apMermas','M2',{id:'M2',fecha:F,bloque:'DIA',linea:'PET1',cuadro:K,categoria:'MATERIAL',insumo:'ETIQUETA',cantidad:300,unidad:'UND',causa:'Defecto de material',etapa:'Etiquetado',estado:'VALIDADA',creadoPor:'Ana Torres',historial:[{en:h(2)}],version:2});
  put('apConciliaciones',glacialAsistenteDatos.idConciliacion(K,'PREFORMA'),{id:glacialAsistenteDatos.idConciliacion(K,'PREFORMA'),fecha:F,bloque:'DIA',linea:'PET1',cuadro:K,insumo:'PREFORMA',unidad:'UND',saldoInicial:14000,saldoFinal:null,estado:'BORRADOR',version:2,historial:[{en:h(2)}]});
  put('apConciliaciones',glacialAsistenteDatos.idConciliacion(K,'TAPA'),{id:glacialAsistenteDatos.idConciliacion(K,'TAPA'),fecha:F,bloque:'DIA',linea:'PET1',cuadro:K,insumo:'TAPA',unidad:'UND',saldoInicial:22000,saldoFinal:16500,estado:'CONFIRMADA',version:3,historial:[{en:h(2)}]});
  put('apCoordinaciones','K1',{id:'K1',fecha:F,bloque:'DIA',texto:'Confirmar con Almacén la llegada de etiquetas Scala',responsable:'Almacén',prioridad:'ALTA',estado:'ABIERTA',version:1});
  // Inventario: catálogo, corte (ayer) y una entrega de Almacén posterior
  const cat=[{id:'100123',itemCode:'100123',nombre:'PREFORMA PET 625 ML',stockMinimo:20000,prioritario:true,activo:true,categoria:'PREFORMA',grupo:105},{id:'100200',itemCode:'100200',nombre:'TAPA 28 MM AZUL',stockMinimo:30000,prioritario:true,activo:true,categoria:'TAPA',grupo:105},{id:'100310',itemCode:'100310',nombre:'ETIQUETA SCALA 2.5 L',stockMinimo:15000,prioritario:true,activo:true,categoria:'ETIQUETA',grupo:105}];
  put('insumosCatalogo','catalogo',{items:cat});
  const ayer=window.GlacialFecha.sumarDias(F,-1);
  put('insumosCortesIndice','C1',{id:'C1',fechaCorte:ayer,importadoEn:h(20),archivo:'STOCK_INVENTARIO.xlsx'});
  put('insumosCortesDetalle','C1',{id:'C1',fechaCorte:ayer,items:[{id:'100123',w:[32000,14000,0,0,0,0],t:46000},{id:'100200',w:[41000,22000,0,0,0,0],t:63000},{id:'100310',w:[3500,9000,0,0,0,0],t:12500}]});
  put('apAlmacenMov','SOL-DEMO-B_ENT1_TAPA',{opId:'SOL-DEMO-B_ENT1_TAPA',tipo:'ENTREGA',insumo:'TAPA',itemCode:'100200',cantidad:6000,unidad:'UND',fecha:F,solicitudId:'SOL-DEMO-B',en:h(13),uid:'u2',usuario:'Luis Quispe'});
  window.__avisar();
};

(async()=>{
  await new Promise(r=>srv.listen(0,r));
  const url='http://127.0.0.1:'+srv.address().port+'/';
  const b=await pw.chromium.launch();
  const page=await b.newPage({viewport:{width:1366,height:900}});
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));page.on('dialog',d=>d.accept());
  await page.goto(url);
  await page.evaluate(SEMILLA);
  await page.evaluate(()=>{state.user={rol:'Asistente de Producción',uid:'u1',nombre:'Ana Torres',username:'ana',permisos:[]};state.currentTab='asistente';goAsistente();apCtx('bloque','DIA');AP_set('tab','insumos');AP_set('sub','solicitudes');});
  await page.waitForTimeout(800);
  const txt=()=>page.evaluate(()=>document.querySelector('.ap').innerText);
  const toasts=()=>page.evaluate(()=>[...document.querySelectorAll('#ap-toasts > div')].map(d=>d.textContent));
  ok(!/Devolución de Producción/.test(await txt()),'al empezar no hay devoluciones');

  /* Otra persona (Almacén, uid u2) entrega: escribe directo en la base y las escuchas en vivo avisan */
  await page.evaluate(()=>{
    const D=window.__docs,F=window.FECHA,now=Date.now();
    const s=D.get('apSolicitudes/SOL-DEMO-A');
    D.set('apSolicitudes/SOL-DEMO-A',{...s,estado:'ENTREGADA_PARCIAL',version:s.version+1,items:s.items.map(i=>i.insumo==='ETIQUETA'?{...i,entregado:2000}:i),
      historial:[...s.historial,{estado:'ENTREGADA_PARCIAL',por:'Luis Quispe',uid:'u2',en:now,entrega:true}]});
    D.set('apAlmacenMov/SOL-DEMO-A_ENT1_ETIQUETA',{opId:'SOL-DEMO-A_ENT1_ETIQUETA',tipo:'ENTREGA',insumo:'ETIQUETA',itemCode:'100310',cantidad:2000,unidad:'UND',fecha:F,solicitudId:'SOL-DEMO-A',en:now,uid:'u2',usuario:'Luis Quispe'});
    window.__avisar();
  });
  await page.waitForTimeout(700);
  if(process.env.SHOTS)await page.screenshot({path:process.env.SHOTS+'/tr1-aviso-entrega.png'});
  ok((await toasts()).some(t=>/Luis Quispe entregó parcialmente la solicitud SOL-DEMO-A/.test(t)),'aviso emergente: Almacén entregó (quién, qué y cuánto)');
  ok(/Entrega a Producción/.test(await txt())&&/Entregas y devoluciones de hoy/.test(await txt()),'el panel de movimientos de hoy muestra la entrega sin recargar');
  const stock=await page.evaluate(()=>glacialAlmacenEnlaceDatos.stockDe('ETIQUETA'));
  ok(stock.disponible===1500&&stock.entregado===2000,'el stock de Almacén ya bajó: 3,500 − 2,000 = 1,500 (el corte no incluye nada hecho en el programa)');

  /* Devolución de Producción a Almacén */
  await page.evaluate(()=>{const D=window.__docs,F=window.FECHA,now=Date.now();
    D.set('apMovimientos/dev1',{opId:'dev1',tipo:'DEVOLUCION',fecha:F,bloque:'DIA',linea:'PET1',cuadro:'k',insumo:'ETIQUETA',unidad:'UND',cantidad:500,condicion:'UTILIZABLE',en:now,uid:'u9',usuario:'Rosa Díaz'});window.__avisar();});
  await page.waitForTimeout(700);
  if(process.env.SHOTS)await page.screenshot({path:process.env.SHOTS+'/tr3-aviso-devolucion.png'});
  ok((await toasts()).some(t=>/Rosa Díaz devolvió a Almacén 500 UND de Etiqueta Scala/.test(t)),'aviso emergente: devolución de Producción');
  ok((await page.evaluate(()=>glacialAlmacenEnlaceDatos.stockDe('ETIQUETA'))).disponible===2000,'la devolución sube el stock de Almacén al instante: 1,500 + 500 = 2,000');
  ok(/Devolución de Producción/.test(await txt()),'la devolución aparece en el panel de Almacén');

  /* Escribiendo: no se pierde lo tecleado; sale el aviso «Hay información nueva» y al soltar se actualiza solo */
  await page.evaluate(()=>{AP_set('sub','solicitudes');});
  await page.waitForTimeout(300);
  await page.evaluate(()=>{const i=document.getElementById('ap-sol-obs');i.focus();i.value='no borrar esto';});
  await page.evaluate(()=>{const D=window.__docs,now=Date.now();D.set('apMovimientos/dev2',{opId:'dev2',tipo:'DEVOLUCION',fecha:window.FECHA,bloque:'DIA',linea:'PET1',cuadro:'k',insumo:'TAPA',unidad:'UND',cantidad:70,condicion:'UTILIZABLE',en:now,uid:'u9',usuario:'Rosa Díaz'});window.__avisar();});
  await page.waitForTimeout(600);
  ok(await page.evaluate(()=>document.getElementById('ap-sol-obs')&&document.getElementById('ap-sol-obs').value)==='no borrar esto','mientras escribes, la pantalla no te borra el texto');
  ok(await page.evaluate(()=>!!document.getElementById('ap-pend')),'sale «Hay información nueva» (no se te impone el cambio)');
  await page.evaluate(()=>document.getElementById('ap-sol-obs').blur());
  await page.waitForTimeout(2200);
  ok(await page.evaluate(()=>!document.getElementById('ap-pend'))&&/70 UND/.test(await txt()),'al terminar de escribir se actualiza sola');

  /* Solicitud abierta en pantalla que cambia */
  await page.evaluate(()=>{apVerSolicitud('SOL-DEMO-B');});
  await page.waitForTimeout(300);
  await page.evaluate(()=>{const D=window.__docs,s=D.get('apSolicitudes/SOL-DEMO-B');D.set('apSolicitudes/SOL-DEMO-B',{...s,estado:'ENTREGADA',version:s.version+1,items:s.items.map(i=>({...i,entregado:10000})),
    historial:[...s.historial,{estado:'ENTREGADA',por:'Luis Quispe',uid:'u2',en:Date.now(),entrega:true}]});window.__avisar();});
  await page.waitForTimeout(600);
  ok(await page.evaluate(()=>!!document.getElementById('ap-sol-cambio')),'si la solicitud abierta cambia, la ventana avisa «Esta solicitud cambió»');
  await page.evaluate(()=>closeModal());

  /* Inventario: «Almacén hoy» */
  await page.evaluate(()=>{state.currentTab='inventario-insumos';goInventarioInsumos();});
  await page.waitForTimeout(900);
  const fila=await page.evaluate(()=>{const f=[...document.querySelectorAll('.ii-t tbody tr')].find(r=>/ETIQUETA SCALA/.test(r.textContent));return f?f.textContent:'';});
  if(process.env.SHOTS)await page.screenshot({path:process.env.SHOTS+'/tr2-inventario-almacen-hoy.png'});
  ok(/Almacén hoy|2,000/.test(fila)&&/2,000/.test(fila),'el Inventario muestra «Almacén hoy» = 3,500 − 2,000 + 500 = 2,000 para la etiqueta');
  await page.evaluate(()=>{const D=window.__docs,now=Date.now();D.set('apMovimientos/dev3',{opId:'dev3',tipo:'DEVOLUCION',fecha:window.FECHA,bloque:'DIA',linea:'PET1',cuadro:'k',insumo:'ETIQUETA',unidad:'UND',cantidad:300,condicion:'UTILIZABLE',en:now,uid:'u9',usuario:'Rosa Díaz'});window.__avisar();});
  await page.waitForTimeout(700);
  const fila2=await page.evaluate(()=>{const f=[...document.querySelectorAll('.ii-t tbody tr')].find(r=>/ETIQUETA SCALA/.test(r.textContent));return f?f.textContent:'';});
  ok(/2,300/.test(fila2),'otra devolución se refleja en el Inventario sin recargar: 2,300');
  ok(errs.length===0,'sin errores en la página'+(errs.length?': '+errs.slice(0,3).join(' | '):''));
  await b.close();srv.close();
  console.log(fallas?`\n${fallas} fallas`:'\nTodo en orden');
})();
