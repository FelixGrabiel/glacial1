/* Planificación · Órdenes de ventas: núcleo de cálculo (66u): cobertura por fecha de entrega, estados, importación (Excel/CSV/Google Sheets) sin duplicar. */
'use strict';
const N=require('../js/produccion/66u-planificacion-ordenes-venta-nucleo.js');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const HOY='2026-10-19';
const orden=(id,numero,marca,pres,cant,entrega,extra)=>Object.assign({id,numero,cliente:'Cliente '+id,marca,presentacion:pres,cantidad:cant,fechaEntrega:entrega,estado:'ABIERTA',creadoEn:Number(id.replace(/\D/g,''))||0},extra);
const prog=(clave,linea,fecha,turno,marca,pres,cant,extra)=>Object.assign({clave,linea,fecha,turno,marca,presentacion:pres,cantidadProgramada:cant},extra);

/* ---- cobertura: se reparte por fecha de entrega, la más urgente primero ---- */
{
  const ov=[orden('2','OV-2','Bells','625 ML PACK X 15 UND',20000,'2026-10-25'),orden('1','OV-1','Bells','625 ML PACK X 15 UND',30000,'2026-10-22'),orden('3','OV-3','Glacial','1 L PACK X 12 UND',5000,'2026-10-30')];
  const pg=[prog('a','PET1','2026-10-20','DÍA','Bells','625 ML PACK X 15 UND',25000),prog('b','PET1','2026-10-21','NOCHE','Bells','625 ML  PACK X 15 UND',10000),prog('c','PET2','2026-10-20','DÍA','Bells','380 ML PACK X 24 UND',9999)];
  const prod=p=>({a:18000,b:0})[p.clave]||0;
  const c=N.coberturaOrdenes(ov,pg,{hoy:HOY,producidoDe:prod});
  ok(c.get('1').programado===30000&&c.get('1').falta===0,'la orden más urgente (OV-1, entrega 22/10) se cubre primero: 25 000 + 5 000 de la segunda programación');
  ok(c.get('2').programado===5000&&c.get('2').falta===15000,'la siguiente (OV-2) recibe lo que sobra (5 000) y le faltan 15 000');
  ok(c.get('1').producido===18000&&c.get('2').producido===0,'lo producido se reparte en el mismo orden (18 000 a OV-1)');
  ok(c.get('3').programado===0&&c.get('3').falta===5000,'un producto sin programación queda sin cubrir');
  ok(c.get('1').detalle.length===2&&c.get('1').detalle[0].clave==='a','el detalle lista las programaciones que cubren la orden');
  ok(N.claveProducto('Bells','625 ML  PACK X 15 UND')===N.claveProducto(' bells ','625 ml pack x 15 und'),'el producto se compara sin importar mayúsculas, tildes ni espacios');
}
/* ---- línea, fecha del pedido, cancelación ---- */
{
  const ov=[orden('1','OV-1','Bells','7 Litros',1000,'2026-10-25',{linea:'B7L'}),orden('2','OV-2','Bells','7 Litros',1000,'2026-10-26',{fechaPedido:'2026-10-21'})];
  const pg=[prog('x','PET1','2026-10-20','DÍA','Bells','7 Litros',1000),prog('y','B7L','2026-10-20','DÍA','Bells','7 Litros',1000),prog('z','B7L','2026-10-22','DÍA','Bells','7 Litros',800,{estadoOperacion:{estado:'CANCELADA'}})];
  const c=N.coberturaOrdenes(ov,pg,{hoy:HOY});
  ok(c.get('1').detalle.length===1&&c.get('1').detalle[0].linea==='B7L','si la orden indica línea, solo la cubren programaciones de esa línea');
  ok(c.get('2').programado===0&&c.get('2').falta===1000,'con fecha del pedido 21/10 no cuentan las programaciones del 20/10: la fecha del pedido limita desde cuándo se cubre');
  const c2=N.coberturaOrdenes([Object.assign({},ov[0],{estado:'CANCELADA'})],pg,{hoy:HOY});
  ok(!c2.has('1'),'una orden cancelada no consume programaciones');
}
/* ---- estados ---- */
{
  const st=(o,c)=>N.estadoOrden(o,c,HOY).clave;
  const base=orden('1','OV-1','Bells','7 Litros',1000,'2026-10-25');
  ok(st(base,{pedido:1000,programado:0,producido:0,falta:1000})==='SIN_PROGRAMAR','sin programar');
  ok(st(base,{pedido:1000,programado:400,producido:0,falta:600})==='PARCIAL','programada en parte');
  ok(st(base,{pedido:1000,programado:1000,producido:0,falta:0})==='PROGRAMADA','programada');
  ok(st(base,{pedido:1000,programado:1000,producido:300,falta:0})==='EN_PRODUCCION','en producción');
  ok(st(base,{pedido:1000,programado:1000,producido:1000,falta:0})==='COMPLETA','completa');
  ok(st(Object.assign({},base,{fechaEntrega:'2026-10-18'}),{pedido:1000,programado:1000,producido:300,falta:0})==='ATRASADA','entrega vencida y sin completar = atrasada');
  ok(st(Object.assign({},base,{fechaEntrega:'2026-10-18'}),{pedido:1000,programado:1000,producido:1000,falta:0})==='COMPLETA','vencida pero completa = completa');
  ok(st(Object.assign({},base,{estado:'CANCELADA'}),null)==='CANCELADA'&&st(Object.assign({},base,{estado:'RETIRADA'}),null)==='RETIRADA','cancelada y retirada se respetan');
  ok(N.estadoOrden(Object.assign({},base,{fechaEntrega:'2026-10-21'}),{pedido:1000,programado:0,producido:0,falta:1000},HOY).porVencer===true,'entrega en 3 días o menos = por vencer');
  const lista=[base,Object.assign({},base,{id:'2',fechaEntrega:'2026-10-10'}),Object.assign({},base,{id:'3',estado:'CANCELADA'})];
  const cm=new Map([['1',{pedido:1000,programado:600,producido:100,falta:400}],['2',{pedido:1000,programado:0,producido:0,falta:1000}]]);
  const r=N.resumenOrdenes(lista,cm,HOY);
  ok(r.abiertas===2&&r.pedidas===2000&&r.programado===600&&r.falta===1400&&r.atrasadas===1&&r.sinCubrir===2,'tarjetas: abiertas, pedidas, programado, falta, atrasadas (las canceladas no cuentan)');
}
/* ---- importar ---- */
{
  const filas=[
    {'N.º orden':'OV-100','Cliente':'Andina','Marca':'Bells','Presentación':'625 ML PACK X 15 UND','Cantidad':'12,000','Fecha de entrega':'25/10/2026'},
    {'N.º orden':'OV-101','Cliente':'Norte','Marca':'Glacial','Presentación':'1 L PACK X 12 UND','Cantidad':8000,'Fecha de entrega':'2026-10-27'},
    {'N.º orden':'OV-102','Cliente':'','Marca':'Aro','Presentación':'7 Litros','Cantidad':0,'Fecha de entrega':'xx'},
    {'N.º orden':'OV-100','Cliente':'Andina','Marca':'Bells','Presentación':'625 ML PACK X 15 UND','Cantidad':1,'Fecha de entrega':'25/10/2026'},
    {'N.º orden':'','Cliente':'','Marca':'','Presentación':'','Cantidad':'','Fecha de entrega':''}
  ];
  const r=N.importarFilas(filas,[],{ahora:1760000000000,hoy:HOY,origen:'excel'});
  ok(r.crear.length===2&&r.crear[0].cantidad===12000&&r.crear[0].fechaEntrega==='2026-10-25'&&r.crear[0].idExterno==='OV-100'&&r.crear[0].origen==='excel','crea las órdenes válidas (cantidad «12,000» y fecha dd/mm/aaaa bien leídas) con su id externo y origen');
  ok(N.importarFilas([{'N.º orden':'OV-9','Cliente':'a','Marca':'b','Presentación':'c','Cantidad':1,'Fecha de entrega':'2026-10-27','Estado':'Cancelado'}],[],{hoy:HOY}).crear[0].estado==='CANCELADA','si la fuente dice «Cancelado», la orden se crea cancelada');
  ok(r.errores.length===2&&/cliente/i.test(r.errores[0].mensaje)&&/repetid/.test(r.errores[1].mensaje),'las filas inválidas o repetidas se reportan con su fila y no se importan (la fila vacía se ignora)');
  const guardadas=N.aplicarImportacion([],r,{ahora:1760000000000,usuario:'Ana'});
  ok(guardadas.length===2&&guardadas.every(o=>o.id&&o.version===1&&o.creadoPor==='Ana'),'aplicarImportacion guarda con id, versión y autor');
  /* 2.ª importación: misma fuente cambiada → actualiza sin duplicar y retira la ausente */
  const filas2=[{'N.º orden':'OV-100','Cliente':'Andina SAC','Marca':'Bells','Presentación':'625 ML PACK X 15 UND','Cantidad':15000,'Fecha de entrega':'26/10/2026'}];
  const r2=N.importarFilas(filas2,guardadas,{ahora:1760000100000,hoy:HOY,origen:'sheets',retirarAusentes:true});
  ok(r2.crear.length===0&&r2.actualizar.length===1&&r2.actualizar[0].cambios.cantidad===15000&&r2.actualizar[0].cambios.cliente==='Andina SAC','si el N.º ya existe se ACTUALIZA (no se duplica)');
  ok(r2.retirar.length===1&&r2.retirar[0].numero==='OV-101','la orden que ya no viene en la fuente se marca para «retirada» (no se borra)');
  const g2=N.aplicarImportacion(guardadas,r2,{ahora:1760000100000,usuario:'Hoja'});
  ok(g2.length===2&&g2.find(o=>o.numero==='OV-100').version===2&&g2.find(o=>o.numero==='OV-101').estado==='RETIRADA','tras aplicar: 2 órdenes, la actualizada sube de versión y la ausente queda RETIRADA');
  const r3=N.importarFilas(filas2,g2,{ahora:1760000200000,hoy:HOY,origen:'sheets'});
  ok(r3.sinCambio===1&&r3.actualizar.length===0,'importar lo mismo otra vez no cambia nada');
  const manual=[{id:'m1',numero:'OV-200',cliente:'X',marca:'Bells',presentacion:'7 Litros',cantidad:10,fechaEntrega:'2026-10-30',estado:'ABIERTA',origen:'manual'}];
  ok(N.importarFilas(filas2,manual,{retirarAusentes:true,hoy:HOY}).retirar.length===0,'las órdenes creadas a mano nunca se retiran por una sincronización');
  const sinCol=N.importarFilas([{'Cliente':'a','Marca':'b'}],[],{});
  ok(sinCol.faltanColumnas.length>=3&&sinCol.crear.length===0,'si faltan columnas obligatorias lo dice y no importa nada');
  const m=N.mapearColumnas(['Pedido','Razón social','Formato','Marca','UND','Entrega'],{});
  ok(m.faltan.length===0&&m.mapa.numero==='Pedido'&&m.mapa.cliente==='Razón social'&&m.mapa.marca==='Marca'&&m.mapa.presentacion==='Formato','reconoce nombres habituales de columna (Pedido, Razón social, Formato…)');
  const m2=N.mapearColumnas(['A','B','C','D','E','F'],{numero:'A',cliente:'B',marca:'C',presentacion:'D',cantidad:'E',fechaEntrega:'F'});
  ok(m2.faltan.length===0&&m2.mapa.fechaEntrega==='F','también acepta un mapa de columnas configurado (para la hoja de Google)');
  /* ---- hoja real de ventas: una OC con varios productos, texto de producto, despachado, corte ---- */
  const EQ={[N.norm('SCALA-AGUA-SIN-GAS-BT-1-L')]:{marca:'Scala',presentacion:'Pack_1L',linea:'PET1'},[N.norm('BELLS-AGUA-BT-625-ML')]:{marca:'Bells',presentacion:'Pack_625',linea:'PET2'}};
  const H=[
    {OC:'4500','TIENDA':'Makro Lima','FECHA EMISION':'01/10/2026','FECHA ENTREGA':'10/10/2026',PRODUCTO:'SCALA-AGUA-SIN-GAS-BT-1-L','UND SOLICITADAS':100,'UND DESPACHO':40,OBS:''},
    {OC:'4500','TIENDA':'Makro Lima','FECHA ENTREGA':'10/10/2026',PRODUCTO:'BELLS-AGUA-BT-625-ML','UND SOLICITADAS':50,'UND DESPACHO':50},
    {OC:'4501','TIENDA':'Makro Ate','FECHA ENTREGA':'12/10/2026',PRODUCTO:'RARO','UND SOLICITADAS':5},
    {OC:'4400','TIENDA':'Makro','FECHA ENTREGA':'01/08/2026',PRODUCTO:'SCALA-AGUA-SIN-GAS-BT-1-L','UND SOLICITADAS':5},
    {OC:'4502','TIENDA':'Makro','FECHA ENTREGA':'15/10/2026',PRODUCTO:'SCALA-AGUA-SIN-GAS-BT-1-L','UND SOLICITADAS':8,OBS:'OC CANCELADA'}
  ];
  const rh=N.importarFilas(H,[],{equivalencias:EQ,fechaCorte:'2026-09-01',cadena:'MAKRO',hoy:HOY,marcas:['Scala','Bells']});
  ok(rh.faltanColumnas.length===0&&rh.crear.length===3&&rh.errores.length===0,'la misma OC con 2 productos crea 2 órdenes (clave OC + producto)');
  ok(rh.fueraDeCorte===1&&rh.sinEquivalencia.length===1&&rh.sinEquivalencia[0].texto==='RARO','lo anterior a la fecha de corte se omite y el producto sin equivalencia se avisa');
  ok(rh.crear[0].despachado===40&&rh.crear[0].cadena==='MAKRO'&&rh.crear[0].linea==='PET1'&&rh.crear[2].estado==='CANCELADA','trae lo despachado, la cadena y la línea; OBS «OC CANCELADA» cancela');
  const gh=N.aplicarImportacion([],rh,{ahora:1760000000000});
  const cobH=N.coberturaOrdenes(gh,[],{hoy:HOY});
  ok(cobH.get(gh[0].id).pedido===60&&!cobH.has(gh[1].id),'la cobertura se calcula sobre lo pendiente (100−40) y lo ya despachado no entra');
  ok(N.estadoOrden(gh[1],cobH.get(gh[1].id),HOY).clave==='DESPACHADA','completamente despachada → estado Despachada');
  const resH=N.resumenOrdenes(gh,cobH,HOY);
  ok(resH.solicitado===150&&resH.despachado===90&&Math.abs(resH.nivelServicio-0.6)<1e-9&&resH.pedidas===60,'nivel de servicio = despachado / solicitado (sin canceladas)');
  const rh2=N.importarFilas(H,gh,{equivalencias:EQ,fechaCorte:'2026-09-01',cadena:'MAKRO',hoy:HOY});
  ok(rh2.crear.length===0&&rh2.sinCambio===3,'reimportar la hoja no duplica ni cambia nada');
  /* varias pestañas con encabezados distintos */
  const hojas=[
    {nombre:'MAKRO',filas:[{OC:'M1',TIENDA:'Ate','FECHA ENTREGA':'10/10/2026',PRODUCTO:'SCALA-AGUA-SIN-GAS-BT-1-L','UND SOLICITADAS':10,'UND DESPACHO':4,DEVOLUCION:'x',OBS:'nota'}]},
    {nombre:'SPSA',filas:[{OC:'S1',TIENDA:'Surco','FECHA ENTREGA':'11/10/2026',PRODUCTO:'BELLS-AGUA-BT-625-ML','UND SOLICITADAS':20,'UND ENVIADA':20}]},
    {nombre:'NOTAS',filas:[{Algo:'x'}]}
  ];
  const rm=N.importarHojas(hojas,[],{equivalencias:EQ,hoy:HOY});
  ok(rm.crear.length===2&&rm.crear[0].cadena==='MAKRO'&&rm.crear[0].despachado===4&&rm.crear[0].observaciones==='nota'&&rm.crear[1].cadena==='SPSA'&&rm.crear[1].despachado===20,'importarHojas: cada pestaña con sus encabezados; la cadena sale del nombre de la pestaña');
  ok(rm.hojasSinColumnas.length===1&&rm.hojasSinColumnas[0].hoja==='NOTAS','una pestaña sin las columnas necesarias se avisa y no frena a las demás');
  /* formato: una orden dice «Scala 625 ml», no el pack ni la la/ln */
  ok(N.formatoDe('Pack_Regular_625mlx15und/la')==='625ml'&&N.formatoDe('625 ML PACK X 15 UND')==='625ml'&&N.formatoDe('Pack_Regular_SC_1Lx12und/ln')==='1l'&&N.formatoDe('Pack_Regular_2.5Lx6und')==='2.5l'&&N.formatoDe('Caja 20 Litros')==='caja20l'&&N.formatoDe('Bidón 20 Litros')==='bidon20l'&&N.formatoDe('7 Litros')==='7l','el formato se reconoce en las presentaciones del sistema y en las del texto');
  const MV=['Bells','Bells_Gas','Bells_Manzana','Scala','Scala_Gas','Scala_Piña_Kion','Cuisine','Aro','Fontlife'];
  const sg=t=>N.sugerirProducto(t,MV);
  ok(sg('SCALA-AGUA-SIN-GAS-BT-2-5-L').formato==='2.5l'&&sg('SCALA-AGUA-CON-GAS-BT-625-ML').marca==='Scala_Gas'&&sg('SCALA-AGUA-CON-GAS-PIÑA-KION-BT-625-ML').marca==='Scala_Piña_Kion'&&sg('BELL-S-AGUA-SIN-GAS-BD-7L').marca==='Bells'&&sg('BELL-S-AGUA-SIN-GAS-BD-7L').formato==='7l'&&sg('AGUA CJX20LT SINGAS CUISINE&CO').formato==='caja20l'&&sg('AGUA FONT LIFE X 10 LT').marca==='Fontlife','la sugerencia reconoce marca (con gas / sabor), formato, caja y bidón');
  const prg=[{clave:'p',linea:'PET2',fecha:HOY,turno:'DÍA',marca:'Scala',presentacion:'Pack_Regular_625mlx15und/la',cantidadProgramada:500}];
  const cv=N.coberturaOrdenes([{id:'a',numero:'1',marca:'Scala',presentacion:'625 ML PACK X 6 UND',cantidad:300,fechaEntrega:HOY,estado:'ABIERTA'}],prg,{hoy:HOY});
  ok(cv.get('a').programado===300,'una orden «Scala 625 ml» se cubre con la programación de Scala 625 ml sin importar el pack ni la/ln');
  /* vencidas: sin atender hace más de N días → históricas (no cuentan como atraso ni reservan programación) */
  const viej={id:'v',numero:'9',marca:'Scala',presentacion:'625 ML PACK X 15 UND',cantidad:100,despachado:0,fechaEntrega:'2026-05-01',estado:'ABIERTA'};
  const rec={id:'r',numero:'10',marca:'Scala',presentacion:'625 ML PACK X 15 UND',cantidad:100,despachado:0,fechaEntrega:'2026-10-10',estado:'ABIERTA'};
  const cv2=N.coberturaOrdenes([viej,rec],[{clave:'p',linea:'PET2',fecha:'2026-10-18',turno:'DÍA',marca:'Scala',presentacion:'625 ML PACK X 15 UND',cantidadProgramada:100}],{hoy:'2026-10-19',diasMaxAtraso:30});
  ok(N.estadoOrden(viej,cv2.get('v'),'2026-10-19',30).clave==='VENCIDA'&&N.estadoOrden(rec,cv2.get('r'),'2026-10-19',30).clave==='ATRASADA'&&!cv2.has('v')&&cv2.get('r').programado===100,'la orden vencida hace mucho es histórica y no le quita la programación a la reciente');
  const rs2=N.resumenOrdenes([viej,rec],cv2,'2026-10-19',30);
  ok(rs2.vencidas===1&&rs2.atrasadas===1&&rs2.abiertas===1,'el resumen separa atrasadas (recientes) de vencidas (históricas)');
  /* dos productos distintos de la misma OC que equivalen a la misma marca y formato: son dos líneas, no un duplicado */
  const EQ2={[N.norm('BELL-S-AGUA-SIN-GAS-BT-625ML-PK-X-6UN')]:{marca:'Bells',presentacion:'Pack_Regular_625mlx6und/ln'},[N.norm('BELL-S-AGUA-BT-625-ML')]:{marca:'Bells',presentacion:'Pack_Regular_625mlx15und/ln'}};
  const f2=[{OC:'9',TIENDA:'T','FECHA ENTREGA':'10/10/2026',PRODUCTO:'BELL-S-AGUA-SIN-GAS-BT-625ML-PK-X-6UN','UND SOLICITADAS':10},{OC:'9',TIENDA:'T','FECHA ENTREGA':'10/10/2026',PRODUCTO:'BELL-S-AGUA-BT-625-ML','UND SOLICITADAS':20},{OC:'9',TIENDA:'T','FECHA ENTREGA':'10/10/2026',PRODUCTO:'BELL-S-AGUA-BT-625-ML','UND SOLICITADAS':20}];
  const r2c=N.importarFilas(f2,[],{equivalencias:EQ2,hoy:HOY});
  ok(r2c.crear.length===2&&r2c.errores.length===1&&/repetida/.test(r2c.errores[0].mensaje),'la misma OC con dos productos de la hoja que equivalen a la misma marca y formato crea 2 líneas; solo la fila realmente repetida es error');
  const g2c=N.aplicarImportacion([],r2c,{ahora:1});
  ok(N.importarFilas(f2.slice(0,2),g2c,{equivalencias:EQ2,hoy:HOY}).sinCambio===2,'reimportar esas dos líneas no las duplica');
  const r0=N.importarFilas([{OC:'8',TIENDA:'T','FECHA ENTREGA':'10/10/2026',PRODUCTO:'BELL-S-AGUA-BT-625-ML','UND SOLICITADAS':0},{OC:'8',TIENDA:'T','FECHA ENTREGA':'10/10/2026',PRODUCTO:'BELL-S-AGUA-SIN-GAS-BT-625ML-PK-X-6UN','UND SOLICITADAS':5}],[],{equivalencias:EQ2,hoy:HOY});
  ok(r0.crear.length===1&&r0.sinCantidad===1&&r0.errores.length===0,'una línea con 0 solicitadas se omite (no es error)');
  /* filas especiales de la hoja real: OC DUPLICADA, pedidos sin OC y filas ajenas */
  const EQ3={[N.norm('AGUA 1LT TAPA SPORT CUISINE&CO')]:{marca:'Cuisine',presentacion:'Pack_Regular_TP_1Lx6und/la'},[N.norm('AGUA FONT LIFE X 1 LT')]:{marca:'Fontlife',presentacion:'Pack_Regular_SC_1Lx12und/ln'}};
  const f3=[
    {OC:'4301',TIENDA:'CENCOSUD','FECHA ENTREGA':'25/03/2026',PRODUCTO:'AGUA 1LT TAPA SPORT CUISINE&CO','UND SOLICITADAS':240,'UND DESPACHO':0,OBS:'OC DUPLICADA'},
    {OC:'4301',TIENDA:'CENCOSUD','FECHA ENTREGA':'25/03/2026',PRODUCTO:'AGUA 1LT TAPA SPORT CUISINE&CO','UND SOLICITADAS':240,'UND DESPACHO':240,OBS:''},
    {OC:'',TIENDA:'TAMBO LURIN','FECHA ENTREGA':'04/02/2026',PRODUCTO:'AGUA FONT LIFE X 1 LT','UND SOLICITADAS':17280,'UND DESPACHO':17280},
    {OC:'',TIENDA:'','FECHA ENTREGA':'F1000',PRODUCTO:'AGUA FONT LIFE X 1 LT','UND SOLICITADAS':17280,'UND DESPACHO':'TAMBO LURIN'}
  ];
  const r3s=N.importarFilas(f3,[],{equivalencias:EQ3,hoy:HOY});
  ok(r3s.crear.length===2&&r3s.errores.length===0&&r3s.duplicadasOmitidas===1&&r3s.filasAjenas===1&&r3s.sinOC===1,'«OC DUPLICADA» se omite si la vigente viene en el archivo; pedido sin OC se importa; fila ajena se ignora (sin errores)');
  ok(r3s.crear.find(o=>o.despachado===240)&&/^S\/OC 2026-02-04 TAMBOLUR/.test(r3s.crear.find(o=>o.cliente==='TAMBO LURIN').numero),'queda la línea vigente (240 despachadas) y el pedido sin OC lleva «S/OC fecha tienda»');
  const solo=N.importarFilas([f3[0]],[],{equivalencias:EQ3,hoy:HOY});
  ok(solo.crear.length===1&&solo.crear[0].estado==='CANCELADA','una «OC DUPLICADA» sola (sin la vigente) entra como cancelada');
  /* historia cerrada: una línea completamente despachada hace más de N días no se guarda */
  const fd=[{OC:'1',TIENDA:'T','FECHA ENTREGA':'01/01/2026',PRODUCTO:'BELL-S-AGUA-BT-625-ML','UND SOLICITADAS':10,'UND DESPACHO':10},{OC:'2',TIENDA:'T','FECHA ENTREGA':'01/01/2026',PRODUCTO:'BELL-S-AGUA-BT-625-ML','UND SOLICITADAS':10,'UND DESPACHO':4},{OC:'3',TIENDA:'T','FECHA ENTREGA':'10/10/2026',PRODUCTO:'BELL-S-AGUA-BT-625-ML','UND SOLICITADAS':10,'UND DESPACHO':10}];
  const rdd=N.importarFilas(fd,[],{equivalencias:EQ2,hoy:'2026-10-19',diasDespachadas:60});
  ok(rdd.despachadasAntiguas===1&&rdd.crear.length===2&&rdd.crear.some(o=>o.numero==='2')&&rdd.crear.some(o=>o.numero==='3'),'la línea despachada hace más de 60 días se omite; la pendiente (aunque vieja) y la despachada reciente se guardan');
  ok(N.importarFilas(fd,[],{equivalencias:EQ2,hoy:'2026-10-19'}).crear.length===3,'sin el límite de días se guardan todas');
  const rv=N.resumenOrdenes([{id:'a',cantidad:100,despachado:100,fechaEntrega:'2026-10-10',estado:'ABIERTA'},{id:'b',cantidad:100,despachado:50,fechaEntrega:'2026-10-12',estado:'ABIERTA'},{id:'c',cantidad:100,despachado:0,fechaEntrega:'2026-01-05',estado:'ABIERTA'},{id:'d',cantidad:100,despachado:0,fechaEntrega:'2026-12-01',estado:'ABIERTA'}],new Map(),'2026-10-19',null,60);
  ok(rv.solicitado===200&&rv.despachado===150&&Math.abs(rv.nivelServicio-0.75)<1e-9,'el nivel de servicio cuenta solo entregas de los últimos N días (hasta hoy): ni la historia vieja ni lo futuro lo sesgan');
  ok(/^2025-1[01]-\d\d$/.test(N.leerFecha(45955))&&N.leerFecha('19/10/26')==='2026-10-19'&&N.leerFecha(new Date(2026,9,19))==='2026-10-19','fecha como serie de Excel, dd/mm/aa y objeto Date');
}
console.log(fallas?fallas+' fallas':'todo correcto');
