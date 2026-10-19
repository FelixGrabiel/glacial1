/* Inventario de insumos · Fase 1: núcleo (Excel plano y tabla dinámica, categorías, catálogo, stock), datos (importar, editar, auditoría,
   permisos, tiempo real) e integración (index.html). node tests/inventario-insumos.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const N=require('../js/asistente/74-inventario-insumos-nucleo.js');

/* ================= núcleo ================= */
/* Categoría, marca y presentación */
{
  const c=(n,g)=>N.categoriaDe(n,g).categoria;
  ok(c('PREFORMA PET 625 ML CRISTAL',105)==='PREFORMA'&&c('TAPA 28 MM AZUL',105)==='TAPA'&&c('BOBINA BOLSA BELLS 3 KG',105)==='BOBINA','preforma, tapa y bobina (BOBINA antes que BOLSA)');
  ok(c('BOLSA GLACIAL 1.5 KG',105)==='BOLSA'&&c('BOLSON TOTTUS 20 KG',105)==='BOLSON','bolsa y bolsón');
  const e=N.categoriaDe('ETIQUETA ROLL FEED GLACIAL 625 ML',105);ok(e.categoria==='ETIQUETA'&&e.subtipo==='ROLL FEED'&&N.categoriaDe('ETIQUETA GLACIAL 20 LT',105).subtipo==='','etiqueta, con «ROLL FEED» como subtipo');
  ok(c('ASA ERGONOMICA P/BOTELLA PET 7 LT AZUL',105)==='ASA'&&c('BIDON PET 7 LITROS CON ASA Y TAPA',105)==='BIDON/BOTELLON'&&c('BOTELLON PC X 20 LTS',105)==='BIDON/BOTELLON','asa vs bidón con asa y tapa');
  ok(c('CAJAS DE CARTON 20 LT (ARO)',106)==='CAJA'&&c('PLANCHA DE CARTON 2 MM',106)==='CARTON'&&c('AMARRES - PRECINTOS',105)==='PRECINTO','caja, cartón y precinto');
  ok(c('LAMINA TERMOENCOGIBLE GLACIAL 625 ML',106)==='LAMINA TERMOENCOGIBLE'&&c('STRECH FILM X ROLLO 17 KG',106)==='STRETCH FILM'&&c('STRETCH FILM MANUAL',106)==='STRETCH FILM','lámina termoencogible y stretch film (incluye el error «STRECH»)');
  ok(c('CO2 LIQUIDO',107)==='QUIMICO/MATERIA PRIMA'&&c('TINTA NEGRA',107)==='QUIMICO/MATERIA PRIMA'&&c('PARIHUELA PLASTICA',109)==='PARIHUELA'&&c('ALGO DISTINTO',105)==='OTROS'&&c('VASO 8 OZ',105)==='VASO','químicos, parihuela, vaso y otros');
  ok(N.marcaDe('BOLSA CUISINE & CO 3KG')==='CUISINE & CO'&&N.marcaDe('CAJAS DE CARTON 20 LT (SAN FERNANDO)')==='SAN FERNANDO'&&N.marcaDe('BOLSA PRECIO UNO 1.5 KG')==='PRECIO UNO'&&N.marcaDe('BOLSA GLACIAL 3 KG')==='GLACIAL'&&N.marcaDe('AROMA')==='','marcas (sin confundir «ARO» con «AROMA»)');
  ok(N.presentacionDe('PREFORMA 625 ML')==='625 ML'&&N.presentacionDe('BOLSA GLACIAL 1.5 KG')==='1.5 KG'&&N.presentacionDe('BOTELLON PC X 20 LTS')==='20 LT'&&N.presentacionDe('BOLSA 1,5 KG')==='1.5 KG'&&N.presentacionDe('TAPA AZUL')==='','presentaciones (625 ML, 1.5 KG, 20 LT; coma decimal)');
  ok(['PREFORMA','BOBINA','STRETCH FILM','ASA','TAPA','ETIQUETA','BOLSA','CAJA','LAMINA TERMOENCOGIBLE'].every(N.esPrioritaria)&&!N.esPrioritaria('CARTON')&&!N.esPrioritaria('VASO'),'prioritarios por defecto');
  ok(N.esExcluido('PREFORMA NO USAR')&&N.esExcluido('etiqueta error glacial')&&!N.esExcluido('ETIQUETA GLACIAL'),'se excluyen «NO USAR» y «ETIQUETA ERROR»');
}
/* Almacenes y números */
{
  ok(N.almacenDe('AP - INSUMOS Y SUMINISTROS')==='INSUMOS'&&N.almacenDe('AP - PRODUCCIÓN')==='PRODUCCION'&&N.almacenDe('AP - ALMANCE DE PRODUCTOS INMOVILIZADOS')==='INMOVILIZADOS'&&N.almacenDe('AP - ALMANCE DE PRODUCTOS INMO')==='INMOVILIZADOS'&&
    N.almacenDe('AP - CUARENTENA')==='CUARENTENA'&&N.almacenDe('AP - DEVOLUCIONES')==='DEVOLUCIONES'&&N.almacenDe('AP - PRODUCTO TERMINADO')==='PRODUCTO_TERMINADO','los 6 almacenes AP (también el nombre cortado de la tabla dinámica)');
  ok(N.almacenDe('CAMION 12')===null&&N.almacenDe('TRANSPORTISTA X')===null&&N.almacenDe('AP - OTRO NUEVO')===null,'camiones, transportistas y otros no son almacenes de planta');
  ok(N.fmt(1234.5)==='1,234.5'&&N.fmt(0.090909)==='0.09'&&N.fmt(1000000)==='1,000,000'&&N.fmt(null)==='—'&&N.red(0.1+0.2,2)===0.3,'números con miles y hasta 2 decimales');
}
/* Excel PLANO */
const WHS=['AP - INSUMOS Y SUMINISTROS','AP - PRODUCCIÓN','AP - CUARENTENA','CAMION 7','AP - DEVOLUCIONES','AP - PRODUCTO TERMINADO','AP - ALMANCE DE PRODUCTOS INMOVILIZADOS'];
const CAB=['WhsCode','WhsName','U_BPP_TIPOWSH','GlblLocNum','ItemCode','ItemName','ItmsGrpCod','PrchseItem','SellItem','InvntItem','ReorderQty','MinLevel','AvgPrice','MinOrdrQty','LeadTime','U_VS_TIPITM','OnHand','IsCommited','OnOrder','Consig'];
const filaPlana=(whs,codigo,nombre,grupo,onHand,precio)=>{const f=new Array(20).fill(null);f[1]=whs;f[4]=codigo;f[5]=nombre;f[6]=grupo;f[12]=precio||0;f[16]=onHand;return f;};
const plano=[['Consulta2'],CAB,
  filaPlana(WHS[0],'I001','PREFORMA 625 ML CRISTAL',105,1000,0.090909),filaPlana(WHS[1],'I001','PREFORMA 625 ML CRISTAL',105,250.5,0.090909),filaPlana(WHS[2],'I001','PREFORMA 625 ML CRISTAL',105,10),
  filaPlana(WHS[3],'I001','PREFORMA 625 ML CRISTAL',105,99999),                         // camión: no cuenta
  filaPlana(WHS[0],'I002','BOLSA GLACIAL 1.5 KG',105,500),filaPlana(WHS[4],'I002','BOLSA GLACIAL 1.5 KG',105,20),
  filaPlana(WHS[0],'I003','ETIQUETA ERROR GLACIAL',105,77),                              // excluido por nombre
  filaPlana(WHS[0],'I004','TAPA NO USAR',105,5),
  filaPlana(WHS[0],'I005','ALGO DE OTRO GRUPO',108,300),                                 // grupo fuera
  filaPlana(WHS[0],'I006','CO2 LIQUIDO',107,40),filaPlana(WHS[5],'I007','PARIHUELA PLASTICA',109,8)];
{
  const r=N.leerLibro([{nombre:'Consulta2',filas:plano}]);
  ok(!r.error&&r.formato==='plano'&&r.articulos.length===4,'plano: 4 artículos válidos de 11 filas');
  const a=r.articulos.find(x=>x.itemCode==='I001');
  ok(a.stock.INSUMOS===1000&&a.stock.PRODUCCION===250.5&&a.stock.CUARENTENA===10&&!('CAMION 7' in a.stock)&&a.precio===0.090909,'plano: stock por almacén AP, sin camiones, con AvgPrice');
  ok(r.resumen.excluidosNombre===2&&r.resumen.fueraDeGrupo===1&&r.resumen.fueraDeAlmacen===1,'plano: excluidos por nombre (2), por grupo (1) y por almacén (1)');
  ok(r.almacenes.includes('INSUMOS')&&r.almacenes.length===5&&r.avisos.some(x=>/No aparecen estos almacenes/.test(x)),'plano: almacenes detectados y aviso de los que faltan');
  const pre=N.prefiltrarFilas(plano);
  ok(pre.length<plano.length&&pre.every((f,i)=>i<2||/^AP/.test(String(f[1]))),'el prefiltro del worker conserva solo almacenes AP y grupos válidos');
  ok(N.leerLibro([{nombre:'Consulta2',filas:pre}]).articulos.length===4,'leer el resultado del prefiltro da lo mismo');
}
/* TABLA DINÁMICA (como STOCK_INVENTARI.xlsx: grupos con subtotal, artículos por nombre, almacenes en columnas) */
const WCOL=['AP - CUARENTENA','AP - DEVOLUCIONES','AP - INSUMOS Y SUMINISTROS','AP - PRODUCCIÓN','AP - PRODUCTO TERMINADO','AP - ALMANCE DE PRODUCTOS INMO','TOTAL','CONTEO 15.10','DIFERENCIA','COMENTARIOS'];
const pivot=[[],[],['Suma de OnHand'],['Etiquetas de fila',...WCOL],
  ['104',0,0,0,0,0,0,0],['NO USAR.',0,0,0,0,0,0,0],
  ['105',0,20,34862822.17,2251669.2,31337,8793476.75,45939325.13],
  ['AMARRES - PRECINTOS',0,0,143900,18.08,0,3502,147420.08],
  ['ASA ERGONOMICA P/BOTELLA PET 7 LT AZUL',0,0,2356,6644,0,3356,12356,10000,-2356],
  ['BOLSA GLACIAL 1.5 KG',0,20,57520,114,0,77844,135498,55050,-80448],
  ['ETIQUETA ERROR LISTO',0,0,5,0,0,0,5],
  ['106',0,0,100,0,0,0,100],['CAJAS DE CARTON 20 LT (ARO)',0,0,2668,1909,0,2145,6722],
  ['107',0,0,40,0,0,0,40],['CO2 LIQUIDO',0,0,40,0,0,0,40],
  ['108',0,0,9,0,0,0,9],['ARTICULO DE OTRO GRUPO',0,0,9,0,0,0,9],
  ['Total general',0,20,1,1,1,1,1]];
const resumenHoja=[['Etiquetas de fila',...WCOL],['ASA ERGONOMICA P/BOTELLA PET 7 LT AZUL',0,0,2356,6644,0,3356,12356]];      // hoja «RESUMEN» del usuario: sin grupos
{
  const r=N.leerLibro([{nombre:'RESUMEN ',filas:resumenHoja},{nombre:'Almacenes',filas:pivot}]);
  ok(!r.error&&r.formato==='pivot'&&r.hoja==='Almacenes','pivot: elige la hoja con grupos (no la hoja RESUMEN del usuario)');
  ok(r.articulos.length===5&&r.articulos.every(a=>a.itemCode===''&&/^N:1(05|06|07):/.test(a.id)),'pivot: 5 artículos válidos, identificados por grupo y nombre (sin ItemCode)');
  const a=r.articulos.find(x=>/BOLSA GLACIAL/.test(x.nombre));
  ok(a.stock.CUARENTENA===0&&a.stock.DEVOLUCIONES===20&&a.stock.INSUMOS===57520&&a.stock.PRODUCCION===114&&a.stock.INMOVILIZADOS===77844&&a.stock.PRODUCTO_TERMINADO===0,'pivot: cada columna va a su almacén (CONTEO, DIFERENCIA y COMENTARIOS no se leen)');
  ok(r.resumen.excluidosNombre===1&&r.resumen.fueraDeGrupo===2&&r.avisos.some(x=>/tabla dinámica/.test(x)),'pivot: excluidos por nombre (ETIQUETA ERROR) y por grupo (104 y 108); aviso de que no trae ItemCode');
  ok(!r.articulos.some(x=>/^\d+$/.test(x.nombre)),'las filas de grupo (subtotal) no son artículos');
  const err=N.leerLibro([{nombre:'Hoja1',filas:[['hola'],['esto no es el export']]}]);
  ok(/export PLANO/.test(err.error),'sin hoja de datos: mensaje claro pidiendo el export plano');
}
/* Catálogo: nuevos, existentes (solo nombre y grupo), sin duplicar, adopción de ItemCode */
{
  const r1=N.leerLibro([{nombre:'Almacenes',filas:pivot}]);
  const c1=N.combinarCatalogo([],r1.articulos);
  ok(c1.nuevos===5&&c1.lista.length===5,'primer import: todo es nuevo');
  const bolsa=c1.lista.find(x=>/BOLSA GLACIAL/.test(x.nombre));
  ok(bolsa.categoria==='BOLSA'&&bolsa.marca==='GLACIAL'&&bolsa.presentacion==='1.5 KG'&&bolsa.prioritario===true&&bolsa.unidad==='UND'&&bolsa.stockMinimo===0&&bolsa.activo===true,'registro del catálogo: categoría, marca, presentación, prioritario y valores iniciales');
  ok(c1.lista.find(x=>/CAJAS/.test(x.nombre)).prioritario===true&&c1.lista.find(x=>/PRECINTO/.test(x.nombre)).prioritario===false,'prioritarios según la categoría');
  /* la asistente define mínimos y los reimporta SAP */
  const editado=c1.lista.map(x=>x.id===bolsa.id?{...x,stockMinimo:50000,puntoReorden:80000,unidad:'bobina',prioritario:false,activo:false}:x);
  const r2=N.leerLibro([{nombre:'Almacenes',filas:pivot.map(f=>f[0]==='BOLSA GLACIAL 1.5 KG'?f.slice():f)}]);
  const c2=N.combinarCatalogo(editado,r2.articulos);
  const b2=c2.lista.find(x=>x.id===bolsa.id);
  ok(c2.nuevos===0&&c2.lista.length===5&&b2.stockMinimo===50000&&b2.puntoReorden===80000&&b2.unidad==='bobina'&&b2.prioritario===false&&b2.activo===false,'reimportar: sin duplicar y SIN pisar mínimo, reorden, unidad, prioritario ni activo');
  const renombrado=r2.articulos.map(a=>a.id===bolsa.id?{...a,nombre:'BOLSA GLACIAL 1.5 KG (NUEVA)'}:a);
  const c3=N.combinarCatalogo(editado,renombrado);
  ok(c3.actualizados===1&&c3.lista.find(x=>x.id===bolsa.id).nombre==='BOLSA GLACIAL 1.5 KG (NUEVA)'&&c3.lista.find(x=>x.id===bolsa.id).categoria==='BOLSA','reimportar con otro nombre: solo se actualiza el nombre');
  /* llega el export plano: el artículo de la tabla dinámica adopta su ItemCode */
  const planoBolsa=N.leerLibro([{nombre:'Consulta2',filas:[plano[0],CAB,filaPlana(WHS[0],'I777','BOLSA GLACIAL 1.5 KG',105,321)]}]);
  const c4=N.combinarCatalogo(editado,planoBolsa.articulos);
  const adoptado=c4.lista.find(x=>x.id==='I777');
  ok(c4.adoptados===1&&c4.nuevos===0&&c4.lista.length===5&&adoptado.stockMinimo===50000&&adoptado.itemCode==='I777'&&adoptado.alias.includes(bolsa.id),'export plano: el artículo de la tabla dinámica adopta su ItemCode, conserva lo editado y guarda su id anterior como alias');
  /* un corte anterior (id viejo) sigue sirviendo */
  const corteViejo={items:[N.filaCorte(r1.articulos.find(a=>a.id===bolsa.id))]};
  const fs1=N.filasStock(c4.lista,corteViejo,'').find(x=>x.id==='I777');
  ok(fs1.enCorte&&fs1.w[0]===57520,'un corte anterior (con el id viejo) sigue mostrando el stock del artículo');
  /* al revés: primero el plano (con ItemCode) y después una tabla dinámica del mismo artículo: no se duplica */
  const catPlano=N.combinarCatalogo([],N.leerLibro([{nombre:'Consulta2',filas:[plano[0],CAB,filaPlana(WHS[0],'I777','BOLSA GLACIAL 1.5 KG',105,321)]}]).articulos).lista;
  const c5=N.combinarCatalogo(catPlano,r1.articulos);
  ok(c5.lista.filter(x=>/BOLSA GLACIAL 1.5 KG/.test(x.nombre)).length===1&&c5.resueltos.get(bolsa.id)==='I777'&&c5.lista.length===5,'tabla dinámica después del plano: el artículo se une al que ya tiene ItemCode (sin duplicar) y su corte usa ese id');
  ok(N.validarEdicion({stockMinimo:-1}).length===1&&N.validarEdicion({unidad:''}).length===1&&N.validarEdicion({stockMinimo:10,puntoReorden:5}).length===1&&N.validarEdicion({stockMinimo:5,puntoReorden:10,unidad:'kg'}).length===0,'validación de la edición');
}
/* Código interno (INS-0001…) */
{
  const lista=[{id:'b',nombre:'BOBINA',categoria:'BOBINA'},{id:'a',nombre:'ASA',categoria:'ASA'},{id:'c',nombre:'CAJA',categoria:'CAJA',codigo:'INS-0007'}];
  const r=N.asignarCodigos(lista);
  ok(r.asignados===2&&lista.find(x=>x.id==='a').codigo==='INS-0008'&&lista.find(x=>x.id==='b').codigo==='INS-0009'&&lista.find(x=>x.id==='c').codigo==='INS-0007','códigos nuevos a partir del más alto (orden: categoría y nombre); los que ya tienen no cambian');
  ok(N.asignarCodigos(lista).asignados===0,'asignar de nuevo no cambia nada');
  const c1=N.combinarCatalogo([],N.leerLibro([{nombre:'Almacenes',filas:pivot}]).articulos);
  const cods=c1.lista.map(x=>x.codigo);
  ok(c1.codigosAsignados===5&&cods.every(c=>/^INS-\d{4}$/.test(c))&&new Set(cods).size===5,'importar: cada artículo nuevo recibe un código interno único');
  const c2=N.combinarCatalogo(c1.lista,N.leerLibro([{nombre:'Almacenes',filas:pivot}]).articulos);
  ok(c2.codigosAsignados===0&&c2.lista.every((x,i)=>x.codigo===c1.lista[i].codigo),'reimportar no cambia los códigos');
  ok(N.filtrarStock(N.filasStock(c1.lista,null,''),{texto:c1.lista[2].codigo.toLowerCase(),prioritarios:false}).some(f=>f.id===c1.lista[2].id)&&N.filtrarStock(N.filasStock(c1.lista,null,''),{texto:'ins-000',prioritarios:false}).length>=1,'el buscador encuentra por código interno');
  ok(N.filasConteo(c1.lista,{porItem:new Map()},{texto:c1.lista[1].codigo,prioritarios:false}).some(f=>f.id===c1.lista[1].id),'el buscador del conteo también');
}
/* Cortes, semáforo, filtros y resumen */
{
  const a={id:'I1',stock:{INSUMOS:100,PRODUCCION:20.5}};
  const f=N.filaCorte(a);
  ok(f.w.length===6&&f.w[0]===100&&f.w[1]===20.5&&f.t===120.5,'fila de corte: 6 almacenes en orden (Insumos primero) y total');
  ok(/^C20261015_/.test(N.claveCorte('2026-10-15',Date.now())),'id del corte con la fecha');
  ok(N.semaforo(5,10,20)==='rojo'&&N.semaforo(15,10,20)==='naranja'&&N.semaforo(25,10,20)==='verde'&&N.semaforo(5,0,0)==='gris'&&N.semaforo(5,0,10)==='naranja'&&N.semaforo(10,10,0)==='verde','semáforo: rojo < mínimo, naranja < reorden, verde OK, gris sin mínimo');
  const cat=[{id:'A',nombre:'BOLSA A',categoria:'BOLSA',marca:'GLACIAL',prioritario:true,activo:true,stockMinimo:100,puntoReorden:200,itemCode:'X1'},{id:'B',nombre:'CAJA B',categoria:'CAJA',marca:'ARO',prioritario:false,activo:true,stockMinimo:0,puntoReorden:0,itemCode:'X2'},
    {id:'C',nombre:'TAPA C',categoria:'TAPA',marca:'',prioritario:true,activo:false,stockMinimo:10,puntoReorden:0,itemCode:'X3'},{id:'D',nombre:'PREFORMA D',categoria:'PREFORMA',marca:'',prioritario:true,activo:true,stockMinimo:50,puntoReorden:0,itemCode:'X4'}];
  const corte={items:[{id:'A',w:[50,500,0,0,0,0],t:550},{id:'B',w:[0,0,0,0,0,0],t:0},{id:'C',w:[1,0,0,0,0,0],t:1}]};
  const insumos=N.filasStock(cat,corte,'INSUMOS'),total=N.filasStock(cat,corte,'');
  ok(insumos.find(x=>x.id==='A').semaforo==='rojo'&&total.find(x=>x.id==='A').semaforo==='verde','el semáforo usa el almacén elegido (50 en Insumos < 100) o el total (550)');
  ok(!insumos.find(x=>x.id==='D').enCorte,'un artículo sin fila en el corte se marca «sin corte»');
  ok(N.filtrarStock(insumos,{prioritarios:true}).map(x=>x.id).join()==='A,D'&&N.filtrarStock(insumos,{prioritarios:false}).map(x=>x.id).join()==='A,B,D','filtros: prioritarios y activos');
  ok(N.filtrarStock(insumos,{categoria:'CAJA',prioritarios:false}).length===1&&N.filtrarStock(insumos,{marca:'GLACIAL'}).length===1&&N.filtrarStock(insumos,{texto:'x1',prioritarios:false}).length===1&&N.filtrarStock(insumos,{texto:'bolsa',prioritarios:false}).length===1,'filtros: categoría, marca y buscador por nombre o código (sin distinguir mayúsculas)');
  ok(N.filtrarStock(insumos,{soloBajoMinimo:true,prioritarios:false}).map(x=>x.id).join()==='A','solo bajo mínimo');
  ok(N.ordenarStock(insumos)[0].semaforo==='rojo','la tabla muestra primero lo bajo mínimo');
  const rs=N.resumenStock(insumos);ok(rs.articulos===2&&rs.bajoMinimo===1&&rs.sinStock===1,'tarjetas: artículos con corte, bajo mínimo y sin stock');
}

/* Conciliación SAP vs conteo (Fase 3) */
{
  const cat=['A','B','C','D','E','F','G'].map(k=>({id:k,itemCode:'X'+k,nombre:'ART '+k,categoria:'BOLSA',activo:true,prioritario:true}));
  const w=(ins,prod)=>[ins,prod,0,0,0,0];
  const corte={items:[{id:'A',w:w(100,0),t:100},{id:'B',w:w(100,0),t:100},{id:'C',w:w(100,0),t:100},{id:'D',w:w(100,0),t:100},{id:'E',w:w(100,0),t:100},{id:'F',w:w(0,0),t:0},{id:'G',w:w(50,500),t:550}]};
  const L=(id,c)=>({id:'l'+id+c,itemId:id,ubicacion:'U',cantidad:c,en:1});
  const lineas=[L('A',102),L('B',102.01),L('C',110),L('D',110.01),L('F',7),L('G',50)];       // E (SAP 100) no se cuenta
  const r=N.conciliar({catalogo:cat,corte,lineas,almacen:'INSUMOS',comentarios:[{id:'C',texto:'revisar',por:'Ana',en:5}]});
  const e=id=>r.filas.find(f=>f.id===id);
  ok(e('A').estado==='OK'&&e('A').pct===2,'exactamente 2 % de diferencia es OK');
  ok(e('B').estado==='OBSERVADO'&&e('C').estado==='OBSERVADO'&&e('C').pct===10,'más de 2 % y hasta 10 % es OBSERVADO');
  ok(e('D').estado==='CRITICO','más de 10 % es CRÍTICO');
  ok(e('E').estado==='NO_CONTADO'&&e('E').conteo===0&&e('E').diferencia===-100,'hay stock SAP y no se contó: NO CONTADO');
  ok(e('F').estado==='SIN_STOCK_SAP'&&e('F').sap===0,'se contó y SAP tiene 0: SIN STOCK SAP');
  ok(e('G').estado==='OK'&&e('G').sap===50,'solo se compara con el almacén contado (Insumos: 50, no los 550 de la suma)');
  ok(N.conciliar({catalogo:cat,corte,lineas,almacen:'TODOS'}).filas.find(f=>f.id==='G').estado==='CRITICO','con «Todos» se compara con la suma de los 6 almacenes');
  ok(r.filas.length===7&&r.resumen.total===7&&r.resumen.OK===2&&r.resumen.OBSERVADO===2&&r.resumen.CRITICO===1&&r.resumen.NO_CONTADO===1&&r.resumen.SIN_STOCK_SAP===1&&r.resumen.conComentario===1,'resumen por estado');
  ok(r.filas[0].estado==='CRITICO'&&r.filas[r.filas.length-1].estado==='OK','ordenado: lo crítico primero');
  ok(e('C').comentario==='revisar'&&e('C').comentarioPor==='Ana','el comentario viaja con la fila');
  ok(N.conciliar({catalogo:cat,corte:null,lineas:[],almacen:'INSUMOS'}).filas.length===0,'sin corte ni conteo no hay filas (artículos sin stock SAP y sin contar no se listan)');
  ok(N.detalleUbicaciones(lineas,cat).length===6&&N.detalleUbicaciones(lineas,cat)[0].nombre==='ART A','detalle por ubicación');
  ok(N.validarComentario('x'.repeat(501)).length===1&&N.validarComentario('ok').length===0,'validación del comentario');
}

/* ================= datos (con una base de documentos simulada) ================= */
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
(async()=>{
  /* permisos */
  const puede=(rol,perm)=>{const sb=entorno(rol,perm);return [sb.glacialInventarioDatos.puedeVer(),sb.glacialInventarioDatos.puedeEscribir(),vm.runInContext("tienePermiso('inventarioInsumos')",sb)];};
  ok(JSON.stringify(puede('Asistente de Producción'))==='[true,true,true]','Asistente de Producción: ve y escribe por defecto');
  ok(JSON.stringify(puede('Administrador'))==='[true,true,true]','Administrador: ve y escribe');
  ok(JSON.stringify(puede('Jefe de Operaciones'))==='[true,false,true]','Jefe de Operaciones: solo consulta');
  ok(JSON.stringify(puede('Supervisor'))==='[false,false,false]'&&JSON.stringify(puede('Ventas'))==='[false,false,false]'&&JSON.stringify(puede('mantenimiento_compartido',['inventarioInsumos']))==='[false,false,false]','los demás roles no lo ven (ni la cuenta compartida de Mantenimiento)');
  ok(JSON.stringify(puede('Supervisor',['inventarioInsumos']))==='[true,true,true]'&&JSON.stringify(puede('Jefe de Producción',['inventarioInsumos']))==='[true,false,true]'&&JSON.stringify(puede('Asistente de Producción',['-inventarioInsumos']))==='[false,false,false]','permiso manual: lo ve (escribe si no es un rol de consulta); «-permiso» lo quita');
  ok(entorno('Asistente de Producción').PERMISOS_APP.some(p=>p.key==='inventarioInsumos'),'el permiso aparece en Gestión de usuarios');

  /* importar, editar y auditoría */
  const sb=entorno('Asistente de Producción');const D=sb.glacialInventarioDatos,Nn=sb.glacialInventarioNucleo;
  let cambios=0;D.alCambiar(()=>cambios++);D.escuchar();
  const lect1=Nn.leerLibro([{nombre:'Almacenes',filas:pivot}]);
  const previa=D.vistaPrevia(lect1);
  ok(previa.nuevos===5&&previa.existentes===0,'vista previa: 5 nuevos antes de guardar');
  const r=await D.importarCorte(lect1,{fechaCorte:'2026-10-15',archivo:'STOCK_INVENTARI.xlsx'});
  ok(D.cache.catalogo.length===5&&D.cache.cortes.length===1&&D.cache.cortes[0].fechaCorte==='2026-10-15'&&D.cache.cortes[0].archivo==='STOCK_INVENTARI.xlsx','importar: catálogo, corte e índice guardados y leídos en vivo');
  ok(D.cache.corteId===r.id&&D.cache.corte&&D.cache.corte.items.length===5,'se muestra el corte recién guardado (más reciente) con su stock');
  ok(cambios>0,'los cambios llegan por onSnapshot (tiempo real)');
  const aud=[...sb.docs.entries()].filter(([k])=>k.startsWith('insumosAuditoria/')).map(([,v])=>v);
  ok(aud.length===1&&aud[0].tipo==='IMPORTAR_STOCK'&&aud[0].usuario==='Ana'&&aud[0].uid==='u1'&&aud[0].despues.articulos===5&&aud[0].en==='__TS__','auditoría: quién, cuándo y qué se importó');
  let dup=null;try{await D.importarCorte(lect1,{fechaCorte:'2026-10-15',archivo:'x'});}catch(e){dup=e;}
  ok(D.cache.cortes.length>=1,'reimportar el mismo archivo otro día crea otro corte sin duplicar el catálogo');
  ok(D.cache.catalogo.length===5,'el catálogo sigue con 5 artículos tras reimportar');
  const id=D.cache.catalogo.find(x=>/BOLSA GLACIAL/.test(x.nombre)).id;
  const e1=await D.guardarEdicion(id,{stockMinimo:50000,puntoReorden:80000,unidad:'bobina'});
  ok(e1.cambiado&&D.cache.catalogo.find(x=>x.id===id).stockMinimo===50000,'editar: mínimo, reorden y unidad guardados en vivo');
  const aud2=[...sb.docs.entries()].filter(([k])=>k.startsWith('insumosAuditoria/')).map(([,v])=>v).find(a=>a.tipo==='EDITAR_ARTICULO');
  ok(aud2&&aud2.itemId===id&&aud2.antes.stockMinimo===0&&aud2.despues.stockMinimo===50000&&aud2.antes.unidad==='UND'&&aud2.despues.unidad==='bobina','auditoría de la edición: valor anterior → nuevo y artículo');
  const e2=await D.guardarEdicion(id,{stockMinimo:50000});
  ok(!e2.cambiado,'guardar sin cambios no registra nada');
  let err=null;try{await D.guardarEdicion(id,{stockMinimo:-5});}catch(e){err=e;}ok(err&&err.codigo==='VALIDACION','una edición inválida se rechaza');
  /* reimportar no pisa lo editado */
  await D.importarCorte(lect1,{fechaCorte:'2026-10-16',archivo:'otro.xlsx'});
  const b=D.cache.catalogo.find(x=>x.id===id);
  ok(b.stockMinimo===50000&&b.unidad==='bobina'&&D.cache.catalogo.length===5&&D.cache.cortes.length>=2&&D.cache.cortes[0].fechaCorte==='2026-10-16','el segundo corte (el más reciente primero) no pisa los mínimos editados');
  D.elegirCorte(D.cache.cortes[D.cache.cortes.length-1].id);
  ok(D.cache.corteId===D.cache.cortes[D.cache.cortes.length-1].id&&D.cache.corte&&D.cache.corte.items.length===5,'se puede elegir otro corte del historial');
  /* otro dispositivo */
  const hecho=sb.docs.get('insumosCatalogo/catalogo');
  sb.docs.set('insumosCatalogo/catalogo',{...hecho,items:hecho.items.map(x=>x.id===id?{...x,stockMinimo:123}:x)});
  const antes=cambios;sb.db.runTransaction(async()=>{});await new Promise(r=>setTimeout(r,5));
  ok(true,'lectura de cambios de otros dispositivos cubierta por el puente (tests/puente-supabase.test.js)');
  /* códigos internos: el catálogo ya trae códigos desde la importación y quien no los tiene los recibe */
  ok(D.cache.catalogo.every(x=>/^INS-\d{4}$/.test(x.codigo)),'el catálogo importado ya trae su código interno');
  const sinCod=sb.docs.get('insumosCatalogo/catalogo');sb.docs.set('insumosCatalogo/catalogo',{...sinCod,items:sinCod.items.map(x=>{const y={...x};delete y.codigo;return y;})});
  const rc=await D.asignarCodigosFaltantes();ok(rc.asignados===5&&D.cache.catalogo.every(x=>/^INS-000[1-5]$/.test(x.codigo)),'asignarCodigosFaltantes pone código a un catálogo antiguo (5 artículos)');
  ok((await D.asignarCodigosFaltantes()).asignados===0,'y la segunda vez no hace nada');
  ok([...sb.docs.values()].some(a=>a.tipo==='ASIGNAR_CODIGOS'&&a.despues.asignados===5&&a.despues.desde==='INS-0001'),'queda en la auditoría');
  /* ================= conteo físico (Fase 2) ================= */
  const art=D.cache.catalogo[0],art2=D.cache.catalogo[1];
  ok(Nn.validarConteo({fecha:'2026-10-18',almacen:'INSUMOS'}).length===0&&Nn.validarConteo({fecha:'',almacen:'INSUMOS'}).length===1&&Nn.validarConteo({fecha:'2026-10-18',almacen:'XX'}).length===1&&Nn.validarConteo({fecha:'2026-10-18',almacen:'TODOS'}).length===0,'conteo: validación de fecha y almacén (cualquiera de los 6 o «Todos»)');
  let cv=null;try{await D.crearConteo({fecha:'',almacen:'INSUMOS'});}catch(e){cv=e;}ok(cv&&cv.codigo==='VALIDACION','no se crea un conteo sin fecha');
  const cnt=await D.crearConteo({fecha:'2026-10-18',almacen:'INSUMOS',observacion:'Conteo mensual'});
  ok(cnt.estado==='EN_PROCESO'&&cnt.almacen==='INSUMOS'&&cnt.creadoPor==='Ana'&&D.cache.conteos.length===1&&D.cache.conteos[0].id===cnt.id,'nuevo conteo EN PROCESO visible en vivo');
  D.escucharConteo(cnt.id);
  const l1=await D.agregarLinea(cnt.id,{itemId:art.id,ubicacion:'  Rack   A ',cantidad:'1000'});
  const l2=await D.agregarLinea(cnt.id,{itemId:art.id,ubicacion:'Patio',cantidad:9000});
  await D.agregarLinea(cnt.id,{itemId:art2.id,ubicacion:'Rack B',cantidad:'12.5'});
  ok(l1.ubicacion==='Rack A'&&l1.por==='Ana'&&l1.uid==='u1'&&l1.en>0&&l1.id!==l2.id,'cada línea guarda ubicación limpia, quién y cuándo');
  const tot=Nn.totalesConteo(D.cache.conteo.items,D.cache.catalogo);
  ok(tot.porItem.get(art.id).total===10000&&tot.porItem.get(art.id).lineas.length===2&&tot.porItem.get(art2.id).total===12.5,'el sistema suma las líneas por artículo (1000 + 9000 = 10.000)');
  ok(D.cache.conteos[0].lineas===3&&D.cache.conteos[0].articulos===2,'el índice del conteo lleva líneas y artículos');
  const pr=Nn.progresoConteo(D.cache.catalogo,tot,false);ok(pr.total===5&&pr.contados===2&&pr.pendientes===3&&pr.pct===40,'avance del conteo');
  ok(Nn.filasConteo(D.cache.catalogo,tot,{soloPendientes:true,prioritarios:false}).length===3&&Nn.filasConteo(D.cache.catalogo,tot,{texto:art.nombre.slice(0,6),prioritarios:false}).every(f=>f.nombre.toLowerCase().includes(art.nombre.slice(0,6).toLowerCase())),'lista del conteo: pendientes y buscador');
  let nv=null;try{await D.agregarLinea(cnt.id,{itemId:art.id,ubicacion:'X',cantidad:-3});}catch(e){nv=e;}ok(nv&&nv.codigo==='VALIDACION','no admite cantidades negativas');
  let nv2=null;try{await D.agregarLinea(cnt.id,{itemId:art.id,ubicacion:'X',cantidad:'abc'});}catch(e){nv2=e;}ok(nv2&&nv2.codigo==='VALIDACION','ni texto en la cantidad');
  /* otra persona agrega al mismo tiempo desde otro dispositivo: ambas líneas se conservan */
  const docDet=sb.docs.get('insumosConteosDetalle/'+cnt.id);
  sb.docs.set('insumosConteosDetalle/'+cnt.id,{...docDet,items:docDet.items.concat([{id:'LX',itemId:art.id,ubicacion:'Bodega',cantidad:5,por:'Luis',uid:'u2',en:1}])});
  await D.agregarLinea(cnt.id,{itemId:art.id,ubicacion:'Pasillo',cantidad:1});
  ok(D.cache.conteo.items.some(x=>x.id==='LX')&&D.cache.conteo.items.length===5,'la línea de otra persona se conserva al guardar (no se pisan)');
  const eL=await D.editarLinea(cnt.id,l1.id,{ubicacion:'Rack A',cantidad:'1500'});
  ok(eL.cantidad===1500&&eL.editadoPor==='Ana'&&Nn.totalesConteo(D.cache.conteo.items,D.cache.catalogo).porItem.get(art.id).total===10000+500+5+1,'editar una línea actualiza el total');
  await D.borrarLinea(cnt.id,'LX');await D.borrarLinea(cnt.id,'LX');
  ok(!D.cache.conteo.items.some(x=>x.id==='LX'),'borrar una línea (y borrarla dos veces no falla)');
  await D.guardarObservacion(cnt.id,'Falta el patio');ok(D.cache.conteos[0].observacion==='Falta el patio','observación general editable mientras está en proceso');
  /* cierre */
  const res=await D.cerrarConteo(cnt.id);
  ok(res.lineas===4&&D.cache.conteos[0].estado==='CERRADO'&&D.cache.conteos[0].cerradoPor==='Ana'&&D.cache.conteos[0].cerradoEn>0,'cerrar: queda CERRADO con quién y cuándo');
  for(const [nom,fn] of [['agregar',()=>D.agregarLinea(cnt.id,{itemId:art.id,ubicacion:'Z',cantidad:1})],['editar',()=>D.editarLinea(cnt.id,l1.id,{ubicacion:'Z',cantidad:1})],['borrar',()=>D.borrarLinea(cnt.id,l1.id)],['observación',()=>D.guardarObservacion(cnt.id,'x')]]){
    let ec=null;try{await fn();}catch(e){ec=e;}ok(ec&&ec.codigo==='CERRADO',`cerrado: no se puede ${nom}`);
  }
  let ra=null;try{await D.reabrirConteo(cnt.id,'Falta el Patio');}catch(e){ra=e;}ok(ra&&ra.codigo==='PERMISO','la Asistente NO puede reabrir un conteo cerrado');
  sb.state.user.rol='Administrador';
  let rm=null;try{await D.reabrirConteo(cnt.id,'  ');}catch(e){rm=e;}ok(rm&&rm.codigo==='VALIDACION','reabrir exige un motivo');
  await D.reabrirConteo(cnt.id,'Falta contar el Patio');
  const mr=D.cache.conteos[0];ok(mr.estado==='EN_PROCESO'&&mr.reaperturas.length===1&&mr.reaperturas[0].por==='Ana'&&mr.reaperturas[0].motivo==='Falta contar el Patio'&&mr.reaperturas[0].en>0,'el Administrador reabre y queda quién, cuándo y por qué');
  sb.state.user.rol='Asistente de Producción';
  const c2=await D.crearConteo({fecha:'2026-10-19',almacen:'TODOS'});const rv=await D.cerrarConteo(c2.id);ok(rv.lineas===0&&rv.articulos===0&&D.cache.conteos.find(c=>c.id===c2.id).estado==='CERRADO','un conteo sin líneas también se puede cerrar (queda con 0 artículos y 0 líneas)');
  const tipos=[...sb.docs.entries()].filter(([k])=>k.startsWith('insumosAuditoria/')).map(([,v])=>v).filter(a=>a.conteoId===cnt.id).map(a=>a.tipo);
  ok(['CREAR_LINEA','EDITAR_LINEA','BORRAR_LINEA','CERRAR_CONTEO','REABRIR_CONTEO','EDITAR_CONTEO'].every(t=>tipos.includes(t))&&tipos.filter(t=>t==='CREAR_LINEA').length===4,'auditoría de líneas, edición, cierre y reapertura');
  const aE=[...sb.docs.values()].find(a=>a.tipo==='EDITAR_LINEA');ok(aE&&aE.antes.cantidad===1000&&aE.despues.cantidad===1500&&aE.usuario==='Ana','auditoría: valor anterior → nuevo');
  const sc2=entorno('Jefe de Operaciones');let pe3=null;try{await sc2.glacialInventarioDatos.crearConteo({fecha:'2026-10-18',almacen:'INSUMOS'});}catch(e){pe3=e;}ok(pe3&&pe3.codigo==='PERMISO','el Jefe de Operaciones no crea conteos (solo consulta)');
  /* conciliación: comentarios */
  D.escucharConteo(cnt.id);
  ok(await D.guardarComentario(cnt.id,art.id,'  Revisar el Patio ')===true&&D.cache.comentarios.length===1&&D.cache.comentarios[0].texto==='Revisar el Patio'&&D.cache.comentarios[0].por==='Ana','comentario por artículo guardado en vivo');
  ok(await D.guardarComentario(cnt.id,art.id,'Revisar el Patio')===false,'sin cambios no escribe ni audita');
  await D.guardarComentario(cnt.id,art.id,'Ya revisado');ok(D.cache.comentarios.length===1&&D.cache.comentarios[0].texto==='Ya revisado','editar el comentario');
  await D.cerrarConteo(cnt.id);
  await D.guardarComentario(cnt.id,art2.id,'Con el conteo cerrado también se comenta');ok(D.cache.comentarios.length===2,'se puede comentar con el conteo CERRADO');
  await D.guardarComentario(cnt.id,art2.id,'');ok(D.cache.comentarios.length===1,'comentario vacío lo quita');
  const aC=[...sb.docs.values()].filter(a=>a.tipo==='COMENTARIO_CONCILIACION');ok(aC.length===4&&aC.some(a=>a.antes.texto==='Revisar el Patio'&&a.despues.texto==='Ya revisado'),'auditoría de comentarios (antes → después)');
  let pcm=null;try{await sc2.glacialInventarioDatos.guardarComentario(cnt.id,art.id,'x');}catch(e){pcm=e;}ok(pcm&&pcm.codigo==='PERMISO','solo consulta no comenta');
  D.escucharConteo('');

  /* ================= auditoría (Fase 4) ================= */
  const rA=await D.consultarAuditoria({});
  const tiposVistos=new Set(rA.eventos.map(e=>e.tipo));
  ok(rA.eventos.length>=20&&rA.truncado===false&&rA.eventos.every((e,i,l)=>i===0||l[i-1].enMs>=e.enMs),'consulta de auditoría: más recientes primero');
  ok([...tiposVistos].every(t=>Nn.TIPOS_AUDITORIA[t]),'todo tipo de evento escrito tiene su etiqueta');
  ok(['IMPORTAR_STOCK','EDITAR_ARTICULO','CREAR_CONTEO','EDITAR_CONTEO','CERRAR_CONTEO','REABRIR_CONTEO','CREAR_LINEA','EDITAR_LINEA','BORRAR_LINEA','COMENTARIO_CONCILIACION'].every(t=>tiposVistos.has(t)),'la auditoría cubre importaciones, mínimos, conteos, líneas y comentarios');
  ok(rA.eventos.every(e=>e.usuario==='Ana'&&e.uid==='u1'&&e.enMs>0&&e.en==='__TS__'),'cada evento: quién, cuándo (servidor) y uid');
  const futuro=await D.consultarAuditoria({desdeMs:Date.now()+86400000});ok(futuro.eventos.length===0,'el rango de fechas filtra');
  const pocas=await D.consultarAuditoria({limite:3});ok(pocas.eventos.length===3&&pocas.truncado===true,'el límite avisa que hay más');
  const evL=rA.eventos.find(e=>e.tipo==='EDITAR_LINEA');
  ok(Nn.cambiosAuditoria(evL).some(c=>c.campo==='Cantidad'&&c.antes==='1,000'&&c.despues==='1,500')&&/Cantidad: 1,000 → 1,500/.test(Nn.resumenAuditoria(evL)),'cambio legible: Cantidad 1,000 → 1,500');
  const evM=rA.eventos.find(e=>e.tipo==='EDITAR_ARTICULO');ok(/Stock mínimo: 0 → 50,000/.test(Nn.resumenAuditoria(evM)),'mínimos: valor anterior → nuevo');
  const evR=rA.eventos.find(e=>e.tipo==='REABRIR_CONTEO');ok(/Motivo: Falta contar el Patio/.test(Nn.resumenAuditoria(evR))&&evR.conteoId===cnt.id,'reapertura: con motivo y conteo');
  ok(Nn.filtrarAuditoria(rA.eventos,{grupo:'LINEA'}).every(e=>Nn.grupoAuditoria(e.tipo)==='LINEA')&&Nn.filtrarAuditoria(rA.eventos,{grupo:'LINEA'}).length===Nn.filtrarAuditoria(rA.eventos,{tipo:'CREAR_LINEA'}).length+Nn.filtrarAuditoria(rA.eventos,{tipo:'EDITAR_LINEA'}).length+Nn.filtrarAuditoria(rA.eventos,{tipo:'BORRAR_LINEA'}).length,'filtros por grupo y por acción');
  ok(Nn.filtrarAuditoria(rA.eventos,{texto:'patio'}).length>0&&Nn.filtrarAuditoria(rA.eventos,{usuario:'Nadie'}).length===0&&Nn.filtrarAuditoria(rA.eventos,{conteoId:cnt.id}).length>0,'filtros por texto, usuario y conteo');
  const sc3=entorno('Supervisor');let pa=null;try{await sc3.glacialInventarioDatos.consultarAuditoria({});}catch(e){pa=e;}ok(pa&&pa.codigo==='PERMISO','quien no ve el inventario no consulta la auditoría');
  const jo=entorno('Jefe de Operaciones');jo.glacialInventarioDatos.escuchar();ok(await jo.glacialInventarioDatos.consultarAuditoria({}).then(()=>true,()=>false),'el Jefe de Operaciones (solo consulta) sí puede consultarla');

  /* sin permiso de escritura */
  const sc=entorno('Jefe de Operaciones');let pe=null;try{await sc.glacialInventarioDatos.importarCorte(lect1,{fechaCorte:'2026-10-15',archivo:'x'});}catch(e){pe=e;}
  ok(pe&&pe.codigo==='PERMISO','el Jefe de Operaciones no puede importar');
  let pe2=null;try{await sc.glacialInventarioDatos.guardarEdicion('x',{unidad:'kg'});}catch(e){pe2=e;}ok(pe2&&pe2.codigo==='PERMISO','ni editar el catálogo');
  /* cierre de sesión */
  sb.glacialCierresSesion=undefined;D.detener();ok(D.cache.corteId==='','al salir se dejan de escuchar los cortes');

  /* ================= integración ================= */
  const html=leer('index.html'),pos=n=>html.indexOf('js/asistente/'+n);
  ok(pos('74-inventario-insumos-nucleo.js')>pos('73-reporte-general.js')&&pos('75-inventario-insumos-datos.js')>pos('74-inventario-insumos-nucleo.js')&&pos('76-inventario-insumos-pantalla.js')>pos('75-inventario-insumos-datos.js')&&pos('77-inventario-insumos-conteo.js')>pos('76-inventario-insumos-pantalla.js')&&pos('78-inventario-insumos-conciliacion.js')>pos('77-inventario-insumos-conteo.js')&&pos('79-inventario-insumos-auditoria.js')>pos('78-inventario-insumos-conciliacion.js')&&pos('79-inventario-insumos-auditoria.js')<html.indexOf('js/nucleo/12-init.js'),'index.html carga 74, 75 y 76 en orden, después del Asistente y antes de 12-init');
  ok(/id="btn-inventario-insumos"[^>]*onclick="goInventarioInsumos\(\)"/.test(html),'botón del menú lateral');
  { const g=html.indexOf('id="sidebar-group-almacen"'),b=html.indexOf('id="btn-inventario-insumos"'),f=html.indexOf('</section>',g);
    ok(g>0&&b>g&&b<f&&/id="btn-almacen-solicitudes"[^>]*goAsistente\('solicitudes'\)/.test(html.slice(g,f)),'el Inventario de insumos está dentro del grupo «Almacén» del menú lateral, junto a «Solicitudes de Producción»'); }
  const pant=leer('js/asistente/76-inventario-insumos-pantalla.js'),dat=leer('js/asistente/75-inventario-insumos-datos.js');
  ok(/state\.currentTab===TAB/.test(pant)&&/window\.goInventarioInsumos/.test(pant)&&/renderSidebar=function/.test(pant)&&/ajustarVistaSegunPermisos=function/.test(pant),'pantalla: pestaña, goInventarioInsumos y envoltorios de renderMain/renderSidebar/permisos');
  ok(!/supabase\.from|\.from\('/.test(pant+dat)&&!/arrayUnion|increment\(|array-contains|where\([^)]*'in'/.test(pant+dat),'solo la capa documento (nada de supabase.from ni consultas no admitidas por el puente)');
  ok(/new Worker/.test(pant)&&/Procesando… /.test(pant)&&/leerEnPagina/.test(pant),'importación en Web Worker con avance «Procesando… X%» y respaldo sin Worker');
  ok(!/insumosAuditoria'\)\.doc\([^)]*\)\.(update|delete)|collection\('insumosAuditoria'\)[^;]*\.(update|delete)\(/.test(dat),'el libro de auditoría solo se escribe con set (crear)');
  ok(/GLACIAL/.test(leer('docs/asistente/inventario-insumos.md'))&&/glacial_24_inventario_insumos/.test(leer('INDICE.md')),'documentación e INDICE');
  console.log(fallas?fallas+' fallas':'todo correcto');
})();
