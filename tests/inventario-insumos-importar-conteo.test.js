/* Inventario de insumos · importar el conteo desde el Excel (columna «CONTEO 18.10» de la hoja RESUMEN).
   Uso: node tests/inventario-insumos-importar-conteo.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const N=require('../js/asistente/74-inventario-insumos-nucleo.js');

function entorno(rol,permisos){
  const sb={console,Math,Number,Array,Object,String,Set,Map,JSON,Date,Promise,Error,setTimeout,clearTimeout};
  vm.createContext(sb);sb.window=sb;
  const docs=new Map(),oyentes=[];let auto=0,tx=0;
  const snapDoc=(k)=>({exists:docs.has(k),data:()=>JSON.parse(JSON.stringify(docs.get(k)))});
  const avisar=()=>oyentes.slice().forEach(f=>f());
  const ref=(c,id)=>({c,id,k:c+'/'+id,get:async()=>snapDoc(c+'/'+id),set:async d=>{docs.set(c+'/'+id,JSON.parse(JSON.stringify(d)));avisar();},
    onSnapshot(cb){const f=()=>cb(snapDoc(c+'/'+id));oyentes.push(f);f();return()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};}});
  sb.docs=docs;
  const consulta=(c,fl,od,lm)=>({where:(k,op,v)=>consulta(c,fl.concat([[k,op,v]]),od,lm),orderBy:(k,d)=>consulta(c,fl,[k,d],lm),limit:n=>consulta(c,fl,od,n),
    get:async()=>{let l=[...docs.entries()].filter(([k])=>k.startsWith(c+'/')).map(([k,v])=>({id:k.slice(c.length+1),data:()=>JSON.parse(JSON.stringify(v))}));
      fl.forEach(([k,op,v])=>{l=l.filter(x=>{const a=x.data()[k];return op==='>='?a>=v:op==='<='?a<=v:op==='>'?a>v:op==='<'?a<v:a===v;});});
      if(od)l.sort((a,b)=>(a.data()[od[0]]>b.data()[od[0]]?1:-1)*(od[1]==='desc'?-1:1));if(lm)l=l.slice(0,lm);return {docs:l};}});
  sb.db={collection:c=>({...consulta(c,[],null,null),doc:id=>ref(c,id||('auto'+(++auto))),onSnapshot(cb){const f=()=>cb({docs:[...docs.entries()].filter(([k])=>k.startsWith(c+'/')).map(([k,v])=>({data:()=>JSON.parse(JSON.stringify(v))}))});oyentes.push(f);f();return()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};}}),
    runTransaction:async fn=>{tx++;const w=[];const t={get:async r=>snapDoc(r.k),set:(r,d)=>w.push([r,d])};await fn(t);w.forEach(([r,d])=>docs.set(r.k,JSON.parse(JSON.stringify(d))));avisar();}};
  sb.firebase={firestore:{FieldValue:{serverTimestamp:()=>'__TS__'}},auth:()=>({currentUser:{uid:'u1'}})};
  sb.state={user:{rol,permisos:permisos||[],nombre:'Ana',username:'ana'}};
  sb.PERMISOS_APP=[];
  vm.runInContext('function tienePermiso(p){return false;}',sb);
  vm.runInContext(leer('js/asistente/74-inventario-insumos-nucleo.js'),sb);
  vm.runInContext(leer('js/asistente/75-inventario-insumos-datos.js'),sb);
  return sb;
}

/* La hoja RESUMEN de la captura del 18/10 */
const resumen=[
  ['Etiquetas de fila','AP - CUARENTENA','AP - DEVOLUCIONES','AP - INSUMOS Y SUMINISTROS','AP - PRODUCCIÓN','AP - PRODUCTO TERMINADO','AP - ALMANCE DE PRODUCTOS INMOVILIZADOS','TOTAL SAP','CONTEO 18.10','DIFERENCIA','COMENTARIOS'],
  ['ASA ERGONOMICA P/BOTELLA PET 7 LT AZUL',0,0,2356,6644,0,3356,12356,10000,-2356,null],
  ['ASA ERGONOMICA P/BOTELLA PET 7 LT CELESTE',0,0,104500,42256.94,0,84248,231004.94,24000,-207005,null],
  ['BOBINA BOLSA BELLS 3 KG',0,0,86203,82,0,41086,127371,134467,7096,null],
  ['BOLSA CUISINE & CO 3KG',0,0,35534.1,2325.5,0,77462.9,115322.5,'62,500',-52823,null],
  ['PRODUCTO RARO QUE NO ESTA EN EL CATALOGO',0,0,1,1,0,1,3,50,0,null],
  ['SIN CONTEO TODAVIA',0,0,1,1,0,1,3,null,0,null],
  ['BOBINA BOLSA BELLS 3 KG',0,0,1,1,0,1,3,99,0,null],
  ['Total general',0,0,1,1,0,1,3,1,0,null]];
const cat=[{id:'a',nombre:'ASA ERGONOMICA P/BOTELLA PET 7 LT AZUL'},{id:'b',nombre:'ASA ERGONOMICA P/BOTELLA PET 7 LT CELESTE'},{id:'c',nombre:'BOBINA BOLSA BELLS 3 KG'},
  {id:'d',nombre:'Bolsa Cuisine & Co 3kg'},{id:'e',nombre:'SIN CONTEO TODAVIA'}];
{
  const r=N.leerConteoResumen([{nombre:'Almacenes',filas:[['otra','hoja']]},{nombre:'RESUMEN',filas:resumen}],cat);
  ok(r&&r.hoja==='RESUMEN'&&r.titulo==='CONTEO 18.10'&&r.dia===18&&r.mes===10,'encuentra la columna «CONTEO 18.10» en la hoja RESUMEN y su fecha (18/10)');
  ok(r.lineas.length===4&&r.lineas[0].itemId==='a'&&r.lineas[0].cantidad===10000&&r.lineas[1].cantidad===24000&&r.lineas[2].cantidad===134467,'carga las cantidades del Excel (10000, 24000, 134467…)');
  ok(r.lineas[3].itemId==='d'&&r.lineas[3].cantidad===62500,'une por nombre sin importar mayúsculas y acepta «62,500» como texto');
  ok(r.sinCatalogo.length===1&&r.sinCatalogo[0].cantidad===50,'lo que no está en el catálogo se informa y no se importa');
  ok(r.repetidos.length===1&&!r.lineas.some(l=>l.cantidad===99),'una fila repetida se ignora (queda la primera)');
  ok(!r.lineas.some(l=>l.itemId==='e'),'sin cantidad en la columna: no se importa');
  ok(N.leerConteoResumen([{nombre:'x',filas:[['a','b'],['c',1]]}],cat)===null,'sin columna «CONTEO»: devuelve null');
}
(async()=>{
  const sb=entorno('Asistente de Producción');const D=sb.glacialInventarioDatos;
  D.escuchar();
  const r=N.leerConteoResumen([{nombre:'RESUMEN',filas:resumen}],cat);
  const m=await D.importarConteo({fecha:'2026-10-18',almacen:'TODOS',observacion:'Importado de STOCK.xlsx',archivo:'STOCK.xlsx',lineas:r.lineas});
  const idx=sb.docs.get('insumosConteosIndice/'+m.id),det=sb.docs.get('insumosConteosDetalle/'+m.id);
  ok(idx&&idx.estado==='EN_PROCESO'&&idx.almacen==='TODOS'&&idx.articulos===4&&idx.lineas===4,'crea el conteo EN PROCESO con almacén «Todos» y 4 artículos');
  ok(det&&det.items.length===4&&det.items.every(l=>l.ubicacion==='Importado del Excel'&&l.por==='Ana'&&l.uid==='u1'),'una línea por artículo, con quién importó');
  ok(det.items.find(l=>l.itemId==='a').cantidad===10000,'la cantidad de la línea es la del Excel');
  const aud=[...sb.docs.entries()].filter(([k])=>k.startsWith('insumosAuditoria/')).map(([,v])=>v);
  ok(aud.some(a=>a.tipo==='CREAR_CONTEO')&&aud.some(a=>a.tipo==='IMPORTAR_CONTEO'&&a.despues.lineas===4&&a.articulo==='STOCK.xlsx'),'auditoría: conteo creado e importación (archivo y líneas)');
  let e1=null;try{await D.importarConteo({fecha:'2026-10-18',almacen:'TODOS',lineas:[]});}catch(e){e1=e;}ok(e1&&e1.codigo==='VALIDACION','sin líneas no se crea el conteo');
  let e2=null;try{await D.importarConteo({fecha:'',almacen:'TODOS',lineas:r.lineas});}catch(e){e2=e;}ok(e2&&e2.codigo==='VALIDACION','sin fecha no se crea el conteo');
  /* conciliación: con almacén «Todos» el TOTAL SAP suma los 6 almacenes (como la hoja RESUMEN) */
  const corte={items:[{id:'a',w:[2356,6644,3356,0,0,0],t:12356}]};
  const c=N.conciliar({catalogo:[{id:'a',nombre:'ASA AZUL',activo:true}],corte,lineas:det.items.filter(l=>l.itemId==='a'),almacen:'TODOS',comentarios:[]});
  const f=c.filas.find(x=>x.id==='a');
  const f1=N.conciliar({catalogo:[{id:'a',nombre:'ASA AZUL',activo:true}],corte,lineas:det.items.filter(l=>l.itemId==='a'),almacen:'INSUMOS',comentarios:[]}).filas[0];
  ok(f1&&f1.sap===2356,'(control) con almacén «Insumos» el TOTAL SAP es solo 2,356: por eso la pantalla mostraba 2,356');
  ok(f&&f.sap===12356&&f.conteo===10000&&f.diferencia===-2356,'conciliación con «Todos»: TOTAL SAP 12,356 · CONTEO 10,000 · DIFERENCIA −2,356 (igual que el Excel)');
  /* Importación repetida (el caso del 18/10: «Importado del Excel» + «Excel» en el mismo conteo) → se corrige borrando una ubicación */
  for(const l of r.lineas)await D.agregarLinea(m.id,{itemId:l.itemId,ubicacion:'Excel',cantidad:l.cantidad});
  let det2=sb.docs.get('insumosConteosDetalle/'+m.id);
  ok(det2.items.length===8&&N.totalesConteo(det2.items,cat).porItem.get('a').total===20000,'(el problema) con las dos importaciones el artículo ASA AZUL cuenta 20,000 en vez de 10,000');
  const b1=await D.borrarLineasUbicacion(m.id,'Excel');
  det2=sb.docs.get('insumosConteosDetalle/'+m.id);
  ok(b1.borradas===4&&det2.items.length===4&&det2.items.every(l=>l.ubicacion==='Importado del Excel'),'borrar la ubicación «Excel» quita sus 4 líneas y deja las otras');
  ok(N.totalesConteo(det2.items,cat).porItem.get('a').total===10000&&sb.docs.get('insumosConteosIndice/'+m.id).lineas===4,'el conteo vuelve a 10,000 y el índice se actualiza');
  const aud2=[...sb.docs.entries()].filter(([k])=>k.startsWith('insumosAuditoria/')).map(([,v])=>v).filter(a=>a.tipo==='BORRAR_UBICACION');
  ok(aud2.length===1&&aud2[0].antes.lineas===4,'un solo evento de auditoría para todo el borrado');
  ok(await D.borrarLineasUbicacion(m.id,'No existe')===null,'una ubicación sin líneas no cambia nada');
  const idxHtml=leer('js/asistente/77-inventario-insumos-conteo.js');
  ok(/iicBorrarUbicacion/.test(idxHtml)&&/duplicadosImp/.test(idxHtml),'la pantalla avisa de duplicados y permite borrar por ubicación');
  ok(/iicImportar\(\)/.test(idxHtml)&&/leerConteoResumen/.test(idxHtml)&&/importarConteo/.test(idxHtml),'la pantalla de conteos tiene el botón «Importar conteo del Excel»');
  console.log(fallas?'\n'+fallas+' FALLAS':'\nTodo bien');
})();
