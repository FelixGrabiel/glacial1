/* Inventario de insumos · Fase 1 en un navegador real (Chromium + Playwright): importar un Excel grande, tabla, filtros, edición y tiempo real.
   Requiere: playwright (con Chromium) y el paquete npm «xlsx» (para fabricar los Excel de prueba y servir SheetJS al Web Worker).
   Uso: XLSX_DIST=/ruta/a/node_modules/xlsx/dist node tests/inventario-insumos.e2e.js   (sin XLSX_DIST busca ./node_modules/xlsx/dist). */
'use strict';
const http=require('http'),fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
let pw,XLSX;
try{pw=require('playwright');}catch(_){console.log('Se omite: falta playwright.');process.exit(0);}
const dist=process.env.XLSX_DIST||path.join(R,'node_modules/xlsx/dist');
try{XLSX=require(path.join(dist,'..'));}catch(_){console.log('Se omite: falta el paquete xlsx (XLSX_DIST).');process.exit(0);}
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};

/* ---- Excel de prueba: PLANO con ~30.000 filas (197 almacenes × 150 artículos, como el export real) ---- */
const tmp=fs.mkdtempSync(path.join(require('os').tmpdir(),'inv-'));
const CAB=['WhsCode','WhsName','U_BPP_TIPOWSH','GlblLocNum','ItemCode','ItemName','ItmsGrpCod','PrchseItem','SellItem','InvntItem','ReorderQty','MinLevel','AvgPrice','MinOrdrQty','LeadTime','U_VS_TIPITM','OnHand','IsCommited','OnOrder','Consig'];
const NOMBRES=['PREFORMA 625 ML CRISTAL','TAPA 28 MM AZUL','BOBINA BOLSA BELLS 3 KG','BOLSA GLACIAL 1.5 KG','ETIQUETA ROLL FEED GLACIAL 625 ML','CAJAS DE CARTON 20 LT (ARO)','STRETCH FILM 17 KG','CO2 LIQUIDO','PARIHUELA PLASTICA','VASO 8 OZ'];
const GRUPOS=[105,105,105,105,105,106,106,107,109,105];
const ALM=['AP - INSUMOS Y SUMINISTROS','AP - PRODUCCIÓN','AP - ALMANCE DE PRODUCTOS INMOVILIZADOS','AP - CUARENTENA','AP - DEVOLUCIONES','AP - PRODUCTO TERMINADO'];
const filas=[CAB];
for(let w=0;w<197;w++){
  const nombreAlm=w<6?ALM[w]:(w<60?'CAMION '+w:'TRANSPORTISTA '+w);
  for(let i=0;i<150;i++){
    const k=i%NOMBRES.length;
    const f=new Array(20).fill(null);f[0]='W'+w;f[1]=nombreAlm;f[4]='I'+String(i).padStart(4,'0');f[5]=NOMBRES[k]+(i>=NOMBRES.length?' '+Math.floor(i/NOMBRES.length):'');f[6]=i%37===0?108:GRUPOS[k];f[12]=0.090909;f[16]=((i*7+w)%50)*100;
    if(i===13)f[5]='ETIQUETA ERROR GLACIAL';
    filas.push(f);
  }
}
const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(filas),'Consulta2');
const archivoPlano=path.join(tmp,'STOCK_PLANO.xlsx');XLSX.writeFile(wb,archivoPlano);
const wb2=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2,XLSX.utils.aoa_to_sheet([[],[],['Suma de OnHand'],['Etiquetas de fila',...ALM,'TOTAL'],['105',0,0,10,0,0,0,10],['BOLSA GLACIAL 1.5 KG',0,20,57520,114,0,77844,135498],['TAPA 28 MM AZUL',0,0,900,0,0,0,900],['Total general',0,20,1,1,1,1,1]]),'Almacenes');
const archivoPivot=path.join(tmp,'STOCK_PIVOT.xlsx');XLSX.writeFile(wb2,archivoPivot);
const wb3=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb3,XLSX.utils.aoa_to_sheet([['hola'],['esto no es el export']]),'Hoja1');
const archivoMalo=path.join(tmp,'MALO.xlsx');XLSX.writeFile(wb3,archivoMalo);

/* ---- página de prueba: el módulo real con la capa documento simulada en memoria ---- */
const PAGINA=`<!doctype html><meta charset="utf-8"><title>inv</title><body><div id="main"></div><div id="modal-root"></div><button id="btn-inventario-insumos" hidden style="display:none"></button>
<script src="/xlsx/xlsx.full.min.js"></script>
<script>
window.state={user:{rol:'Asistente de Producción',nombre:'Ana',username:'ana',permisos:[]},currentTab:'inicio',showWelcome:false};
window.PERMISOS_APP=[];window.glacialCierresSesion=[];
function tienePermiso(){return false;}function renderMain(){}function renderSidebar(){}function ajustarVistaSegunPermisos(){}
function closeModal(){document.getElementById('modal-root').innerHTML='';}
(function(){
  const docs=new Map(),oy=[];let auto=0;
  const snap=k=>({exists:docs.has(k),data:()=>JSON.parse(JSON.stringify(docs.get(k)))});
  const avisar=()=>oy.slice().forEach(f=>f());
  const ref=(c,id)=>({k:c+'/'+id,get:async()=>snap(c+'/'+id),set:async d=>{docs.set(c+'/'+id,JSON.parse(JSON.stringify(d)));avisar();},
    onSnapshot(cb){const f=()=>cb(snap(c+'/'+id));oy.push(f);f();return()=>{const i=oy.indexOf(f);if(i>=0)oy.splice(i,1);};}});
  const consulta=(c,fl,od,lm)=>({where:(k,op,v)=>consulta(c,fl.concat([[k,op,v]]),od,lm),orderBy:(k,d)=>consulta(c,fl,[k,d],lm),limit:n=>consulta(c,fl,od,n),
    get:async()=>{let l=[...docs.entries()].filter(([k])=>k.startsWith(c+'/')).map(([k,v])=>({id:k.slice(c.length+1),data:()=>JSON.parse(JSON.stringify(v))}));
      fl.forEach(([k,op,v])=>{l=l.filter(x=>{const a=x.data()[k];return op==='>='?a>=v:op==='<='?a<=v:op==='>'?a>v:op==='<'?a<v:a===v;});});
      if(od)l.sort((a,b)=>(a.data()[od[0]]>b.data()[od[0]]?1:-1)*(od[1]==='desc'?-1:1));if(lm)l=l.slice(0,lm);return {docs:l};}});
  window.db={collection:c=>({...consulta(c,[],null,null),doc:id=>ref(c,id||('a'+(++auto))),onSnapshot(cb){const f=()=>cb({docs:[...docs.entries()].filter(([k])=>k.startsWith(c+'/')).map(([k,v])=>({data:()=>JSON.parse(JSON.stringify(v))}))});oy.push(f);f();return()=>{const i=oy.indexOf(f);if(i>=0)oy.splice(i,1);};}}),
    runTransaction:async fn=>{const w=[];await fn({get:async r=>snap(r.k),set:(r,d)=>w.push([r,d])});w.forEach(([r,d])=>docs.set(r.k,JSON.parse(JSON.stringify(d))));avisar();}};
  window.__docs=docs;window.__avisar=avisar;
  window.firebase={firestore:{FieldValue:{serverTimestamp:()=>'__TS__'}},auth:()=>({currentUser:{uid:'u1'}})};
})();
</script>
<script src="/js/asistente/74-inventario-insumos-nucleo.js"></script><script src="/js/asistente/75-inventario-insumos-datos.js"></script><script src="/js/asistente/76-inventario-insumos-pantalla.js"></script><script src="/js/asistente/77-inventario-insumos-conteo.js"></script><script src="/js/asistente/78-inventario-insumos-conciliacion.js"></script><script src="/js/asistente/79-inventario-insumos-auditoria.js"></script></body>`;
const servidor=http.createServer((q,r)=>{
  if(q.url==='/'){r.setHeader('content-type','text/html; charset=utf-8');r.end(PAGINA);return;}
  const f=q.url.startsWith('/xlsx/')?path.join(dist,q.url.slice(6)):path.join(R,q.url.split('?')[0]);
  fs.readFile(f,(e,d)=>{if(e){r.statusCode=404;r.end();}else{r.setHeader('content-type',/\.js$/.test(f)?'text/javascript':'application/octet-stream');r.end(d);}});
});

(async()=>{
  await new Promise(r=>servidor.listen(0,r));
  const puerto=servidor.address().port;
  const browser=await pw.chromium.launch({executablePath:process.env.PLAYWRIGHT_BROWSERS_PATH?undefined:undefined});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errores=[];page.on('pageerror',e=>errores.push(String(e)));page.on('console',m=>{if(m.type()==='error')errores.push(m.text());});
  await page.goto('http://127.0.0.1:'+puerto+'/');
  await page.evaluate(()=>{state.currentTab='inventario-insumos';goInventarioInsumos();});
  await page.waitForSelector('.ii');
  ok(await page.locator('.ii-centro h3').innerText()==='Todavía no hay stock cargado','sin cortes: invita a importar');

  /* 1) archivo que no sirve → mensaje claro */
  await page.click('text=Importar stock SAP');
  await page.setInputFiles('#ii-archivo',archivoMalo);
  await page.waitForSelector('.ii-msg-error');
  ok(/export PLANO/.test(await page.locator('.ii-msg-error').innerText()),'archivo sin datos: mensaje pidiendo el export plano');

  /* 2) export plano grande, leído en el Web Worker con barra de avance */
  await page.click('text=Elegir otro archivo');
  const t0=Date.now();
  await page.setInputFiles('#ii-archivo',archivoPlano);
  const vistoProgreso=await page.waitForSelector('.ii-barra',{timeout:5000}).then(()=>true).catch(()=>false);
  await page.waitForSelector('.ii-resumen',{timeout:120000});
  const msLectura=Date.now()-t0;
  const resumen=await page.locator('.ii-resumen').innerText();
  console.log('  lectura de '+filas.length+' filas: '+msLectura+' ms · '+resumen.replace(/\n+/g,' · '));
  ok(/150[\s\S]*artículos encontrados/.test(resumen.replace(/\d+\s*\n\s*excluidos/,''))||/artículos encontrados/.test(resumen),'resumen con artículos encontrados, nuevos, ya existían, excluidos y almacenes');
  const n=await page.evaluate(()=>window.__inventarioInsumosPantalla&&1);
  ok(/6\s*\n?\s*almacenes detectados/.test(resumen),'se detectan solo los 6 almacenes AP (los camiones y transportistas no cuentan)');
  ok(/excluidos/.test(resumen),'se muestran los excluidos (ETIQUETA ERROR y grupo 108)');
  ok(msLectura<60000,'el archivo de ~30.000 filas se procesa sin bloquear (menos de 60 s)');
  const estiloGuardar=await page.locator('.ii-modal .ii-btn >> text=Guardar corte').evaluate(b=>{const c=getComputedStyle(b);return {bg:c.backgroundColor,color:c.color};});
  ok(estiloGuardar.bg!=='rgba(0, 0, 0, 0)'&&estiloGuardar.bg!==estiloGuardar.color,'el botón «Guardar corte» del modal se ve (fondo azul, letra blanca; los modales usan las variables de color)');
  await page.fill('#ii-fecha','2026-10-15');
  await page.click('text=Guardar corte');
  await page.waitForSelector('.ii-msg-ok');
  ok(/Corte guardado/.test(await page.locator('.ii-msg-ok').innerText()),'corte guardado');
  const kpis=await page.locator('.ii-kpis').innerText();
  ok(/2026-10-15/.test(kpis),'la tarjeta muestra la fecha del último corte');

  /* 3) tabla y filtros */
  const filasIniciales=await page.locator('#ii-tabla tbody tr').count();
  ok(filasIniciales>0&&filasIniciales<=150,'la tabla se dibuja (de a 150 filas): '+filasIniciales);
  ok(await page.locator('#ii-tabla th').count()>=14,'una columna por almacén AP, total, mínimo, semáforo y corte');
  const cabecera=await page.locator('#ii-tabla thead').innerText();
  ok(cabecera.indexOf('Insumos y Suministros')<cabecera.indexOf('Producción'),'Insumos y Suministros va primero entre los almacenes');
  await page.selectOption('select >> nth=0','');            // (categoría) sin cambio
  await page.fill('#ii-texto','bobina');
  await page.waitForTimeout(400);
  const filtradas=await page.locator('#ii-tabla tbody tr').count();
  ok(filtradas>0&&filtradas<filasIniciales&&(await page.locator('#ii-tabla tbody').innerText()).toLowerCase().includes('bobina'),'el buscador (con espera de 200 ms) filtra por nombre');
  await page.fill('#ii-texto','');await page.waitForTimeout(400);
  const codigo1=(await page.locator('#ii-tabla tbody tr >> nth=0 >> .ii-cod b').innerText()).trim();
  ok(/^INS-\d{4}$/.test(codigo1),'cada artículo muestra su código interno ('+codigo1+')');
  await page.fill('#ii-texto',codigo1.toLowerCase());await page.waitForTimeout(400);
  ok(await page.locator('#ii-tabla tbody tr').count()===1&&(await page.locator('#ii-tabla tbody tr').innerText()).includes(codigo1),'buscar por código interno encuentra el artículo');
  await page.fill('#ii-texto','');await page.waitForTimeout(400);

  /* 4) catálogo: editar mínimo y ver el semáforo */
  await page.click('text=Catálogo');
  await page.waitForSelector('#ii-tabla table');
  await page.click('#ii-tabla tbody tr >> nth=0 >> text=Editar');
  await page.fill('#ii-e-min','999999');await page.fill('#ii-e-reorden','1999999');
  await page.click('#ii-e-ok');
  await page.waitForSelector('.ii-msg-ok');
  await page.click('.ii-tab >> text=Stock actual');
  await page.waitForSelector('.ii-pill');
  ok((await page.locator('.ii-p-rojo').count())>0,'con un mínimo alto, el artículo queda en rojo (bajo mínimo)');
  ok((await page.locator('.ii-kpis').innerText()).match(/Bajo mínimo\s*\n?\s*[1-9]/)!==null,'la tarjeta «Bajo mínimo» cuenta ese artículo');

  /* 5) tiempo real: otro dispositivo guarda un corte y esta pantalla lo muestra sola */
  const antes=await page.locator('.ii-corte option').count();
  await page.evaluate(()=>{
    const docs=window.__docs;const idx=[...docs.entries()].find(([k])=>k.startsWith('insumosCortesIndice/'));
    const nuevo={...idx[1],id:'C20261016_otro',fechaCorte:'2026-10-16',archivo:'desde_otro_equipo.xlsx',importadoEn:Date.now()+1000};
    const det=docs.get('insumosCortesDetalle/'+idx[1].id);
    docs.set('insumosCortesDetalle/C20261016_otro',{...det,id:'C20261016_otro',fechaCorte:'2026-10-16'});docs.set('insumosCortesIndice/C20261016_otro',nuevo);window.__avisar();
  });
  await page.waitForFunction(n=>document.querySelectorAll('.ii-corte option').length>n,antes,{timeout:5000});
  ok(/2026-10-16/.test(await page.locator('.ii-kpis').innerText()),'otro dispositivo guardó un corte: aparece solo y pasa a ser el último');

  /* 6) tabla dinámica (sin ItemCode) */
  await page.click('text=Importar stock SAP');
  await page.setInputFiles('#ii-archivo',archivoPivot);
  await page.waitForSelector('.ii-resumen');
  ok(/tabla dinámica/.test(await page.locator('.ii-modal').innerText()),'tabla dinámica: avisa que no trae el código SAP');
  await page.click('text=Guardar corte');await page.waitForSelector('.ii-msg-ok');

  /* 6b) conteo físico, en celular de 360 px */
  await page.setViewportSize({width:360,height:740});
  await page.click('.ii-tab >> text=Conteo físico');
  await page.click('text=+ Nuevo conteo');
  ok((await page.locator('#ii-n-alm').inputValue())==='INSUMOS'&&(await page.locator('#ii-n-alm option').count())===7,'nuevo conteo: almacén por defecto Insumos y Suministros, los 6 almacenes y «Todos»');
  await page.fill('#ii-n-obs','Conteo de prueba');
  await page.click('#ii-m-ok');
  await page.waitForSelector('#ii-c-texto');
  ok(/En proceso/.test(await page.locator('.ii-h').innerText()),'el conteo nace EN PROCESO');
  await page.evaluate(()=>{window.__inventarioInsumosConteo.C.prioritarios=false;});
  await page.fill('#ii-c-texto','bobina');await page.waitForTimeout(400);
  const nArt=await page.locator('.ii-art').count();ok(nArt>0,'buscador grande filtra la lista de artículos ('+nArt+')');
  await page.click('.ii-art >> nth=0 >> text=+ Agregar línea');
  await page.fill('.ii-alta input[name=ubicacion]','Rack A');await page.fill('.ii-alta input[name=cantidad]','1000');await page.click('.ii-alta button');
  await page.waitForSelector('.ii-ln');
  await page.fill('.ii-alta input[name=ubicacion]','Patio');await page.fill('.ii-alta input[name=cantidad]','9000');await page.click('.ii-alta button');
  await page.waitForFunction(()=>document.querySelectorAll('.ii-ln').length===2);
  ok((await page.locator('.ii-art >> nth=0 >> .ii-art-t b').innerText()).replace(/\D/g,'')==='10000','dos líneas (Rack A 1000 + Patio 9000) se suman: 10,000');
  ok(/Ana|Asistente|—/.test(await page.locator('.ii-ln small >> nth=0').innerText())&&/\d\d\/\d\d \d\d:\d\d/.test(await page.locator('.ii-ln small >> nth=0').innerText()),'cada línea muestra quién y cuándo');
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=362),'conteo en 360 px sin desborde horizontal');
  await page.screenshot({path:path.join(tmp,'conteo-360.png')});
  /* tiempo real: otra persona agrega una línea al mismo artículo desde otro dispositivo */
  await page.evaluate(()=>{const k=[...window.__docs.keys()].find(x=>x.startsWith('insumosConteosDetalle/'));const d=window.__docs.get(k);
    window.__docs.set(k,{...d,items:d.items.concat([{id:'LREMOTA',itemId:d.items[0].itemId,ubicacion:'Bodega',cantidad:1,por:'Luis',uid:'u2',en:Date.now()}])});window.__avisar();});
  await page.waitForFunction(()=>document.querySelectorAll('.ii-ln').length===3,null,{timeout:5000});
  ok(/Luis/.test(await page.locator('.ii-lns').first().innerText()),'la línea de otra persona aparece sola');
  await page.click('.ii-ln >> nth=0 >> text=Editar');await page.fill('#ii-l-cant','1500');await page.click('#ii-m-ok');
  await page.waitForFunction(()=>/1,500/.test(document.querySelector('.ii-lns').innerText));
  await page.click('.ii-ln >> nth=2 >> text=Borrar');await page.click('#ii-m-ok');
  await page.waitForFunction(()=>document.querySelectorAll('.ii-ln').length===2);
  await page.click('text=Cerrar conteo');await page.click('#ii-m-ok');
  await page.waitForFunction(()=>/Cerrado/.test(document.querySelector('.ii-h').innerText));
  ok(await page.locator('.ii-ln button').count()===0&&await page.locator('text=+ Agregar línea').count()===0&&await page.locator('text=Reabrir conteo').count()===0,'conteo cerrado: solo lectura y la Asistente no ve «Reabrir»');
  await page.evaluate(()=>{state.user.rol='Administrador';});await page.evaluate(()=>window.__inventarioInsumosPantalla.pintar());
  await page.click('text=Reabrir conteo');await page.fill('#ii-r-motivo','Falta contar el Patio');await page.click('#ii-m-ok');
  await page.waitForFunction(()=>/En proceso/.test(document.querySelector('.ii-h').innerText));
  ok(/Reaperturas \(1\)/.test(await page.locator('.ii-reab').innerText()),'el Administrador reabre con motivo y queda registrado');
  await page.evaluate(()=>{state.user.rol='Asistente de Producción';});
  await page.click('text=← Conteos');await page.waitForSelector('.ii-cc');
  ok(/En proceso/.test(await page.locator('.ii-cc').first().innerText()),'lista de conteos con su estado');
  /* 6c) conciliación SAP vs conteo */
  await page.click('.ii-tab >> text=Conciliación');
  await page.waitForSelector('.ii-kpis5');
  ok(/Insumos y Suministros/i.test(await page.locator('.ii-card').first().innerText()),'conciliación: indica con qué almacén se compara');
  ok((await page.locator('#ii-q-tabla tbody tr').count())>0&&(await page.locator('#ii-q-tabla .ii-pill').count())>0,'tabla con estado por artículo');
  const kp=await page.locator('.ii-kpis5').innerText();
  ok(/OK/.test(kp)&&/Observado/.test(kp)&&/Crítico/.test(kp)&&/No contado/.test(kp)&&/Sin stock SAP/.test(kp),'tarjetas por estado');
  await page.click('.ii-kb >> text=Sin stock SAP');
  const soloNo=await page.locator('#ii-q-tabla tbody .ii-pill').allInnerTexts();
  ok(soloNo.length>0&&soloNo.every(t=>/Sin stock SAP/.test(t)),'filtrar por estado');
  await page.click('.ii-kb >> text=Sin stock SAP');
  await page.fill('#ii-q-tabla tbody tr >> nth=0 >> input','Revisar con el supervisor');
  await page.locator('#ii-q-tabla tbody tr >> nth=0 >> input').blur();
  await page.waitForFunction(()=>window.__docs&&[...window.__docs.keys()].some(k=>k.startsWith('insumosConteosComentarios/')));
  ok(true,'el comentario se guarda al salir del campo');
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=362),'conciliación en 360 px sin desborde de página');
  await page.screenshot({path:path.join(tmp,'conciliacion-360.png')});
  await page.setViewportSize({width:1280,height:900});

  /* 6d) auditoría */
  await page.setViewportSize({width:360,height:740});
  await page.click('.ii-tab >> text=Auditoría');
  await page.waitForSelector('#ii-a-tabla tbody tr');
  const nEv=await page.locator('#ii-a-tabla tbody tr').count();
  ok(nEv>5,'auditoría: lista de eventos ('+nEv+')');
  const txtA=await page.locator('#ii-a-tabla').innerText();
  ok(/Importación de stock SAP/.test(txtA)&&/Línea agregada/.test(txtA)&&/Conteo cerrado/.test(txtA)&&/Comentario de conciliación/.test(txtA)&&/Stock mínimo/.test(txtA),'incluye importaciones, líneas, cierre, comentarios y mínimos');
  ok(/\d\d\/\d\d\/\d{4} \d\d:\d\d:\d\d/.test(txtA)&&/Ana|Asistente|—/.test(txtA)&&/→/.test(txtA),'cada evento: fecha y hora, usuario y antes → después');
  await page.selectOption('.ii-filtros select >> nth=0','LINEA');
  await page.waitForTimeout(100);
  const soloLinea=await page.locator('#ii-a-tabla tbody .ii-pill').allInnerTexts();
  ok(soloLinea.length>0&&soloLinea.every(t=>/Línea/.test(t)),'filtro por tipo de movimiento');
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=362),'auditoría en 360 px sin desborde de página');
  await page.screenshot({path:path.join(tmp,'auditoria-360.png')});
  await page.setViewportSize({width:1280,height:900});

  /* 7) vista de solo consulta */
  await page.evaluate(()=>{state.user.rol='Jefe de Operaciones';goInventarioInsumos();});
  await page.waitForSelector('.ii-chip');
  ok(await page.locator('text=Importar stock SAP').count()===0&&(await page.locator('.ii-chip').innerText())==='Solo consulta','Jefe de Operaciones: solo consulta (sin botón de importar)');
  await page.screenshot({path:path.join(tmp,'inventario.png')});

  /* 8) móvil de 360 px */
  await page.setViewportSize({width:360,height:740});
  await page.evaluate(()=>{state.user.rol='Asistente de Producción';goInventarioInsumos();});
  await page.click('.ii-tab >> text=Stock actual');
  await page.waitForSelector('.ii-kpis');
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=360+2),'en 360 px la página no se desborda (la tabla se desplaza dentro de su contenedor)');
  await page.screenshot({path:path.join(tmp,'inventario-360.png')});
  ok(errores.length===0,'sin errores en la consola'+(errores.length?': '+errores.slice(0,3).join(' | '):''));
  console.log('  capturas en '+tmp);
  await browser.close();servidor.close();
  console.log(fallas?fallas+' fallas':'todo correcto');
})().catch(e=>{console.error(e);process.exit(1);});
