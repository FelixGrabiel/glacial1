/* Planificación · secuencia por cantidad, hora y cierre con cambio de marca configurable (5 min iniciales, ajustes por línea y por transición),
   cantidades estimadas, conflictos, proyección con ejecución real y convivencia con Completar cantidad. Página real + nube falsa. */
const {nube,dispositivo,F,items,leer,clon}=require('./planificacion-harness');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const FECHA='2099-03-07',MANANA='2099-03-08';
const T=(f,h)=>new Date(f+'T'+h+':00').getTime();
const VEL={'B7L|7 Litros|Aro':600,'B7L|7 Litros|Cuisine':900,'B7L|7 Litros|Scala':1200,'B7L|10 Litros|Scala':800,'C20L|20 Litros|Cuisine':100,'C20L|20 Litros|San Fernando':150,
  'PET1|2.5 Litros|Scala':3000,'B20L|20 Litros|Glacial':80};
const regla=(id,linea,tipo,minutos,extra)=>Object.assign({id,linea,tipo,minutos,activo:true,aplica:'',origen:null,destino:null,descripcion:'',actualizadoEn:1},extra||{});
const historial=N=>[...N.docs.entries()].filter(([k])=>k.startsWith('historialProgramacion/')).map(([,v])=>v);

function entorno(programaciones,opc){
  opc=opc||{};
  const N=nube();
  N.docs.set('sync/programaciones',{items:programaciones||[]});
  N.docs.set('sync/catalogoPlanificacion',{items:[],tiempos:opc.tiempos===undefined?{reglas:[],ventanas:[],version:1}:opc.tiempos});
  N.docs.set('sync/records',{items:opc.registros||[]});
  const sb=dispositivo(N,Object.assign({nombre:'Ana'},opc.usuario||{}),{ahora:opc.ahora||T(FECHA,'05:00')});
  sb.LINES=[{key:'PET1',name:'PET 1'},{key:'B7L',name:'B7L'},{key:'C20L',name:'CAJAS 20L'},{key:'B20L',name:'B20L'}];
  sb.MARCAS_POR_LINEA={PET1:['Scala'],B7L:['Aro','Cuisine','Scala','Fontlife'],C20L:['Cuisine','San Fernando'],B20L:['Glacial']};
  sb.PRESENTACIONES_POR_LINEA={PET1:['2.5 Litros'],B7L:['7 Litros','10 Litros'],C20L:['20 Litros'],B20L:['20 Litros']};
  sb.obtenerUnidadesPorPalet=()=>200;
  sb.glacialVelocidadEstandar=(l,p,m)=>(opc.vel||VEL)[[l,p,m].join('|')]||0;
  sb.puedeEntrarPlanificacion=()=>true;
  sb.loadRecords=()=>(N.docs.get('sync/records')||{items:[]}).items;sb.normalizarCuadros=r=>r.cuadros||[];
  sb.PROD={};sb.glacialProducidoVigente=p=>(p.clave in sb.PROD)?sb.PROD[p.clave]:null;
  sb.escuchar();
  return {N,sb,NS:sb.NS,S:sb.NS.secuencia,M:sb.NS.modos};
}
const fila=(marca,tipoFin,extra)=>Object.assign({id:'t_'+marca+Math.random().toString(36).slice(2,5),marca,presentacion:'7 Litros',tipoFin,cantidad:'',hora:'',cambioPrevioMin:null,modo:'FIJA',saldo:false,version:undefined,itemClave:''},extra||{});
const t=(e,m)=>e.tramos.find(x=>x.marca===m);

(async()=>{
/* ---------- 1) Aro 1,200 → Cuisine hasta una hora → Scala hasta el cierre (con cambio de 5 min) ---------- */
{
  const {S,N,NS}=entorno([]);
  const filas=[fila('Aro','CANTIDAD',{cantidad:1200}),fila('Cuisine','HORA',{hora:'13:00'}),fila('Scala','CIERRE')];
  const e=S.estimar('B7L',FECHA,'DÍA',filas);
  const a=t(e,'Aro'),c=t(e,'Cuisine'),s=t(e,'Scala');
  ok(e.estado==='OK'&&e.bloque.duracionMin===720&&a.inicioOff===0&&a.finOff===120&&a.cantidad===1200&&S.hora(e.bloque,a.finOff)==='09:00','Aro 1,200 UND a 600 UND/h: de 07:00 a 09:00');
  ok(c.cambioAntesMin===5&&c.cambioInicial===true&&S.hora(e.bloque,c.inicioOff)==='09:05'&&S.hora(e.bloque,c.finOff)==='13:00'&&c.tiempoMin===235,'cambio Aro → Cuisine de 5 min (valor inicial): Cuisine empieza a las 09:05 y dispone de 3 h 55 min');
  ok(c.cantidad===Math.floor(235/60*900)&&s.cambioAntesMin===5&&S.hora(e.bloque,s.inicioOff)==='13:05'&&S.hora(e.bloque,s.finOff)==='19:00'&&s.tiempoMin===355&&s.cantidad===Math.floor(355/60*1200),'Scala empieza a las 13:05, llega al cierre (5 h 55 min) y cada cantidad usa su propio nominal');
  ok(e.tramos.every(x=>x.estado==='OK')&&e.conflictos.length===0,'sin conflictos ni datos pendientes');
  // guardar
  const r=await S.guardar('B7L',FECHA,'DÍA',filas,{});
  const its=items(N);
  const iAro=its.find(p=>p.marca==='Aro'),iCu=its.find(p=>p.marca==='Cuisine'),iSc=its.find(p=>p.marca==='Scala');
  ok(its.length===3&&iAro.modo==='FIJA'&&iAro.cantidadProgramada===1200&&iCu.modo==='HORA'&&iCu.cantidadProgramada===c.cantidad&&iCu.estimado.horaFin==='13:00'&&iSc.modo==='TURNO'&&iSc.alcance==='TIEMPO_RESTANTE'&&iSc.cantidadProgramada===s.cantidad,'se guardan con su modo: Cantidad fija, Hasta una hora y Hasta el cierre (tiempo restante), con la cantidad estimada');
  ok(iCu.tramosSecuencia.length===1&&iCu.tramosSecuencia[0].tipoFin==='HORA'&&iCu.tramosSecuencia[0].horaFin==='13:00'&&iCu.tramosSecuencia[0].orden===2&&iAro.tramosSecuencia[0].cantidadObjetivo===1200,'se amplía tramosSecuencia (la misma estructura que usa Producción Actual): tipoFin, horaFin y cantidadObjetivo');
  ok(iCu.estimado.parametrosVersion===1&&iCu.estimado.ratio===900&&iCu.estimado.calculadoEn>0&&iCu.estimado.por==='Ana'&&iCu.estimado.inicioMs===T(FECHA,'09:05')&&iCu.estimado.finMs===T(FECHA,'13:00'),'el estimado guarda ratio, versión de parámetros, autor, hora de cálculo y horario');
  const h=historial(N);
  ok(h.length===3&&h.every(x=>/^SECUENCIA:/.test(x.referencia)&&x.uid==='uid-Ana')&&/hasta 13:00/.test(h.find(x=>x.marca==='Cuisine').referencia),'el historial registra orden, criterio de finalización y autor');
  // el motor de capacidad usa lo guardado
  const cap=NS.capacidadVigente(FECHA,'DÍA','B7L');
  ok(cap&&cap.estado!=='INCOMPLETA'&&cap.productos.length===3&&cap.cambios===2&&cap.cambiosMin===10,'capacidad: tres productos, dos cambios de 5 min, desglose de cantidades fijas y estimadas');
  ok(/Aro por cantidad 1\.200 UND.*\[5 min de cambio\] Cuisine hasta 13:00 ≈ 3\.525 UND.*\[5 min de cambio\] Scala hasta el cierre ≈ 7\.100/.test(S.textoLinea('B7L',FECHA,'DÍA').replace(/\u00a0/g,' ').replace(/,/g,'.')),'el texto para copiar conserva modo, hora límite, cambio previsto y orden');
}
/* ---------- 2) C20L: Cuisine 160 → San Fernando durante el tiempo restante ---------- */
{
  const {S}=entorno([]);
  const f=[fila('Cuisine','CANTIDAD',{cantidad:160,presentacion:'20 Litros'}),fila('San Fernando','CIERRE',{presentacion:'20 Litros'})];
  const e=S.estimar('C20L',FECHA,'DÍA',f);
  ok(t(e,'Cuisine').tiempoMin===96&&t(e,'San Fernando').cambioAntesMin===5&&t(e,'San Fernando').inicioOff===101&&t(e,'San Fernando').cantidad===Math.floor((720-101)/60*150),'Cuisine 160 UND a 100/h dura 96 min; San Fernando produce después hasta el cierre con su propio nominal');
}
/* ---------- 3) único producto: Todo el turno ---------- */
{
  const {S}=entorno([]);
  const e1=S.estimar('PET1',FECHA,'DÍA',[fila('Scala','CIERRE',{presentacion:'2.5 Litros'})]);
  const e2=S.estimar('B20L',FECHA,'DÍA',[fila('Glacial','CIERRE',{presentacion:'20 Litros'})]);
  ok(t(e1,'Scala').cantidad===Math.floor(720/60*3000)&&t(e2,'Glacial').cantidad===Math.floor(720/60*80)&&t(e1,'Scala').inicioOff===0,'un solo producto «hasta el cierre» equivale a Todo el turno (PET1 Scala y B20L Glacial)');
  const {S:S2,N,M:M2}=entorno([]);
  await S2.guardar('PET1',FECHA,'DÍA',[fila('Scala','CIERRE',{presentacion:'2.5 Litros'})],{});
  ok(items(N)[0].modo==='TURNO'&&items(N)[0].alcance==='TODO_TURNO'&&/Todo el turno/.test(M2.htmlSubproducto(items(N)[0],null)),'el primer tramo «hasta el cierre» se guarda como Todo el turno (no «tiempo restante»)');
}
/* ---------- 5, 6, 7) cambio de 5 min, ajuste de línea y de transición, cero explícito, combinado ---------- */
{
  const base=[fila('Aro','CANTIDAD',{cantidad:600}),fila('Cuisine','CANTIDAD',{cantidad:900})];
  const sin=entorno([]);
  ok(t(sin.S.estimar('B7L',FECHA,'DÍA',base),'Cuisine').cambioAntesMin===5&&sin.S.cambioMarcaDe('B7L').inicial===true&&sin.S.cambioMarcaDe('B7L').minutos===5,'sin configuración: cambio inicial de 5 min, visible como «valor inicial»');
  const linea=entorno([],{tiempos:{reglas:[regla('r1','B7L','CAMBIO_MARCA',8)],ventanas:[],version:2}});
  const ct=t(linea.S.estimar('B7L',FECHA,'DÍA',base),'Cuisine');
  ok(ct.cambioAntesMin===8&&!ct.cambioInicial&&linea.S.cambioMarcaDe('B7L').inicial===false,'el valor general de la línea (8 min) reemplaza al inicial');
  const espec=entorno([],{tiempos:{reglas:[regla('r1','B7L','CAMBIO_MARCA',8),regla('r2','B7L','CAMBIO_MARCA',12,{origen:{marca:'Aro',presentacion:''},destino:{marca:'Cuisine',presentacion:''}})],ventanas:[],version:2}});
  ok(t(espec.S.estimar('B7L',FECHA,'DÍA',base),'Cuisine').cambioAntesMin===12,'una regla específica de origen y destino tiene prioridad sobre el valor de la línea');
  const aj=base.map(x=>Object.assign({},x));aj[1].cambioPrevioMin=3;
  const ea=espec.S.estimar('B7L',FECHA,'DÍA',aj);
  ok(t(ea,'Cuisine').cambioAntesMin===3&&t(ea,'Cuisine').cambioAjuste===true&&/Ajuste explícito/.test(t(ea,'Cuisine').cambioExplicacion),'el ajuste explícito de la transición en el plan gana a todo lo demás');
  const cero=entorno([],{tiempos:{reglas:[regla('r1','B7L','CAMBIO_MARCA',0)],ventanas:[],version:2}});
  ok(t(cero.S.estimar('B7L',FECHA,'DÍA',base),'Cuisine').cambioAntesMin===0&&!t(cero.S.estimar('B7L',FECHA,'DÍA',base),'Cuisine').cambioInicial,'un cero explícito se conserva (no se reemplaza por 5)');
  const aj0=base.map(x=>Object.assign({},x));aj0[1].cambioPrevioMin=0;
  ok(t(sin.S.estimar('B7L',FECHA,'DÍA',aj0),'Cuisine').cambioAntesMin===0,'un ajuste de 0 minutos en la transición también se respeta');
  // mismo producto contiguo: sin cambio; primer tramo: sin cambio; después del último: sin cambio
  const rep=sin.S.estimar('B7L',FECHA,'DÍA',[fila('Aro','CANTIDAD',{cantidad:600}),fila('Aro','CANTIDAD',{cantidad:300})]);
  ok(rep.transiciones.length===0&&rep.tramos[0].cambioAntesMin===null&&rep.tramos[1].cambioAntesMin===null,'no se aplica cambio de marca entre tramos del mismo producto, antes del primero ni después del último');
  // formato combinado: marca y formato a la vez → ninguna suma doble
  const comb=entorno([],{tiempos:{reglas:[regla('r1','B7L','CAMBIO_MARCA',5),regla('r2','B7L','CAMBIO_FORMATO',15),regla('r3','B7L','CAMBIO_MARCA_FORMATO',25)],ventanas:[],version:3}});
  const ec=comb.S.estimar('B7L',FECHA,'DÍA',[fila('Aro','CANTIDAD',{cantidad:600}),fila('Scala','CANTIDAD',{cantidad:800,presentacion:'10 Litros'})]);
  ok(t(ec,'Scala').cambioAntesMin===25&&ec.transiciones.length===1,'cambio de marca y presentación a la vez: una sola transición con la regla combinada (25 min), no 5 + 15');
  const sinComb=entorno([],{tiempos:{reglas:[regla('r1','B7L','CAMBIO_MARCA',5),regla('r2','B7L','CAMBIO_FORMATO',15)],ventanas:[],version:3}});
  ok(t(sinComb.S.estimar('B7L',FECHA,'DÍA',[fila('Aro','CANTIDAD',{cantidad:600}),fila('Scala','CANTIDAD',{cantidad:800,presentacion:'10 Litros'})]),'Scala').cambioAntesMin===15,'sin regla combinada se aplica la mayor, nunca la suma');
  const solo=entorno([]);
  const sf=solo.S.estimar('B7L',FECHA,'DÍA',[fila('Aro','CANTIDAD',{cantidad:600}),fila('Scala','CANTIDAD',{cantidad:800,presentacion:'10 Litros'})]);
  ok(sf.estado==='PARCIAL'&&sf.faltantes.some(x=>/cambio/.test(x.dato))&&t(sf,'Scala').estado==='PENDIENTE'&&t(sf,'Scala').cambioAntesMin===null,'un cambio de marca y presentación sin regla no se inventa: queda pendiente (el 5 inicial es solo para la marca)');
  // catálogo: guardar el valor de la línea
  const cat=entorno([]);
  const g=await cat.S.guardarCambioMarca('B7L',7,'Medido');
  const rg=cat.N.docs.get('sync/catalogoPlanificacion').tiempos.reglas;
  ok(rg.length===1&&rg[0].tipo==='CAMBIO_MARCA'&&rg[0].minutos===7&&rg[0].actualizadoPor==='Ana'&&rg[0].actualizadoUid==='uid-Ana'&&rg[0].actualizadoEn>0&&cat.S.cambioMarcaDe('B7L').minutos===7,'el tiempo de cambio de marca por línea se guarda con autor y fecha');
  await cat.S.guardarCambioMarca('B7L',0,'Sin cambio');
  ok(cat.N.docs.get('sync/catalogoPlanificacion').tiempos.reglas.length===1&&cat.S.cambioMarcaDe('B7L').minutos===0,'editar el valor no duplica la regla y acepta 0');
  let e='';try{await cat.S.guardarCambioMarca('B7L',-1);}catch(x){e=x.message;}
  ok(/entero de 0 o más/.test(e),'no acepta minutos negativos');
  const sinPermiso=entorno([],{usuario:{planifica:false}});
  e='';try{await sinPermiso.S.guardarCambioMarca('B7L',5);}catch(x){e=x.message;}
  ok(/Solo Planificación/.test(e),'solo quien tiene el permiso configura el tiempo');
  // los planes publicados conservan el parámetro: cambiar el catálogo no reescribe lo guardado
  const pub=entorno([]);
  await pub.S.guardar('B7L',FECHA,'DÍA',[fila('Aro','CANTIDAD',{cantidad:1200}),fila('Cuisine','HORA',{hora:'13:00'})],{});
  const guardado=items(pub.N).find(p=>p.marca==='Cuisine').estimado.cantidad;
  await pub.S.guardarCambioMarca('B7L',30,'Nuevo');
  ok(items(pub.N).find(p=>p.marca==='Cuisine').estimado.cantidad===guardado&&pub.S.revision(items(pub.N).find(p=>p.marca==='Cuisine')).cambio===true,'cambiar el catálogo no reescribe lo publicado: queda un aviso de revisión explícito');
}
/* ---------- 8, 9, 10) conflictos, nominal faltante, hora consumida ---------- */
{
  const {S}=entorno([]);
  // hora límite consumida por el tramo anterior
  const f=[fila('Aro','CANTIDAD',{cantidad:2400}),fila('Cuisine','HORA',{hora:'10:00'})];
  const e=S.estimar('B7L',FECHA,'DÍA',f);
  ok(e.estado==='CONFLICTO'&&e.conflictos.some(c=>/debe terminar a las 10:00/.test(c))&&t(e,'Cuisine').estado==='CONFLICTO'&&t(e,'Cuisine').cantidad===null,'hora límite consumida por el tramo anterior: conflicto, sin duración negativa ni cantidad cero como plan ejecutable');
  let er='';try{await entorno([]).S.guardar('B7L',FECHA,'DÍA',f,{});}catch(x){er=x.message;}
  ok(/conflictos/.test(er)&&/Revisa la hora, el orden o la cantidad del tramo anterior/.test(er),'el conflicto no se guarda en silencio: se pide revisar hora, orden o cantidad');
  const {N:N0,S:S0}=entorno([]);
  try{await S0.guardar('B7L',FECHA,'DÍA',f,{});}catch(_){}
  ok(items(N0).length===0,'tras un conflicto no queda nada guardado');
  // «hasta el cierre» con otro tramo después
  const c2=S.estimar('B7L',FECHA,'DÍA',[fila('Aro','CIERRE'),fila('Cuisine','CANTIDAD',{cantidad:100})]);
  ok(c2.conflictos.some(c=>/último tramo/.test(c)),'«hasta el cierre» con otro tramo después: se muestra la contradicción');
  // dos marcas sin cantidad en la misma secuencia: límites claros, sin repartir por mitades
  const dos=S.estimar('B7L',FECHA,'DÍA',[fila('Aro','CIERRE'),fila('Cuisine','CIERRE')]);
  ok(dos.estado==='CONFLICTO'&&dos.conflictos.length>0,'varias marcas sin límite claro: conflicto (no se reparte el bloque por mitades)');
  const dosOk=S.estimar('B7L',FECHA,'DÍA',[fila('Aro','HORA',{hora:'11:00'}),fila('Cuisine','CIERRE')]);
  ok(dosOk.estado==='OK'&&t(dosOk,'Aro').finOff===240&&t(dosOk,'Cuisine').inicioOff===245,'con una hora límite clara cada marca tiene su tiempo');
  // hora fuera del bloque
  const fuera=S.estimar('B7L',FECHA,'DÍA',[fila('Aro','HORA',{hora:'20:00'})]);
  ok(fuera.conflictos.some(c=>/después del cierre/.test(c)),'una hora límite posterior al cierre es un conflicto');
  // velocidad faltante: pendiente, sin cantidad cero
  const sv=entorno([],{vel:{'B7L|7 Litros|Aro':600}});
  const ev=sv.S.estimar('B7L',FECHA,'DÍA',[fila('Aro','CANTIDAD',{cantidad:1200}),fila('Cuisine','HORA',{hora:'13:00'}),fila('Scala','CIERRE')]);
  ok(ev.estado==='PARCIAL'&&t(ev,'Aro').cantidad===1200&&t(ev,'Cuisine').estado==='PENDIENTE'&&t(ev,'Cuisine').cantidad===null&&/velocidad estándar/.test(t(ev,'Cuisine').motivo)&&t(ev,'Scala').estado==='PENDIENTE','nominal faltante: se conserva lo conocido (Aro) y los tramos afectados quedan pendientes sin cantidad cero');
  await sv.S.guardar('B7L',FECHA,'DÍA',[fila('Aro','CANTIDAD',{cantidad:1200}),fila('Cuisine','HORA',{hora:'13:00'})],{});
  const pend=items(sv.N).find(p=>p.marca==='Cuisine');
  ok(pend.cantidadProgramada===0&&pend.estimado.estado==='PENDIENTE'&&sv.NS.esPlanSinCantidad(pend)&&sv.M.estadoPlan(pend,null).texto==='Estimación pendiente'&&/Estimación pendiente/.test(sv.M.htmlSubproducto(pend,null)),'la instrucción válida se guarda con estimación pendiente (no es una cantidad fija ficticia)');
}
/* ---------- 11, 12, 15) Noche, ventanas, repetidos ---------- */
{
  const noche=entorno([]);
  const f=[fila('Aro','CANTIDAD',{cantidad:600}),fila('Cuisine','HORA',{hora:'01:00'}),fila('Scala','CIERRE')];
  const e=noche.S.estimar('B7L',FECHA,'NOCHE',f);
  const b=e.bloque;
  ok(new Date(b.inicioMs).getHours()===21&&t(e,'Cuisine').cantidad>0&&noche.S.hora(b,t(e,'Cuisine').finOff)==='01:00'&&t(e,'Cuisine').finOff===240&&noche.S.hora(b,t(e,'Scala').finOff)==='07:00','Noche cruza la medianoche: 01:00 es DESPUÉS de las 21:00 del mismo bloque (4 h) y el cierre es a las 07:00');
  const dia=noche.S.estimar('B7L',FECHA,'DÍA',[fila('Aro','HORA',{hora:'01:00'})]);
  ok(dia.conflictos.length>0,'en el bloque Mañana + Intermedio, la hora 01:00 no cabe (conflicto, no se interpreta como antes del inicio)');
  // ventanas y preparaciones una sola vez
  const v=entorno([],{tiempos:{reglas:[regla('lp','B7L','LIMPIEZA_INICIO',20)],ventanas:[{id:'v1',linea:'B7L',fecha:FECHA,bloque:'DÍA',tipo:'MANTENIMIENTO',inicio:'10:00',duracionMin:60,motivo:'Prueba',activo:true},
    {id:'v2',linea:'B7L',fecha:FECHA,bloque:'DÍA',tipo:'REFRIGERIO',inicio:'10:30',duracionMin:60,motivo:'Superpuesta',activo:true}],version:4}});
  const ev=v.S.estimar('B7L',FECHA,'DÍA',[fila('Aro','CANTIDAD',{cantidad:3000}),fila('Cuisine','CIERRE')]);
  ok(ev.ventanasMin===90&&ev.parametrosVersion===4,'ventanas superpuestas: se descuenta la unión (90 min), no la suma (120)');
  const cu=t(ev,'Cuisine'),aro=t(ev,'Aro');
  ok(aro.inicioOff===20&&aro.finOff>aro.inicioOff+300&&cu.cantidad===Math.floor(cu.tiempoMin/60*900),'la limpieza de inicio y las ventanas se cuentan una vez y la producción se detiene en la ventana');
  const lipVentana=entorno([],{tiempos:{reglas:[regla('lp','B7L','LIMPIEZA_INICIO',20)],ventanas:[{id:'v1',linea:'B7L',fecha:FECHA,bloque:'DÍA',tipo:'LIMPIEZA',inicio:'07:00',duracionMin:20,motivo:'Limpieza en ventana',activo:true}],version:4}});
  const el=lipVentana.S.estimar('B7L',FECHA,'DÍA',[fila('Aro','CANTIDAD',{cantidad:600})]);
  ok(t(el,'Aro').inicioOff===20&&el.avisos.some(a=>/no se suma otra vez/.test(a)),'una limpieza ya descontada como ventana no se vuelve a sumar como preparación');
  // producto repetido sin duplicar la cantidad
  const rep=entorno([]);
  await rep.S.guardar('B7L',FECHA,'DÍA',[fila('Aro','CANTIDAD',{cantidad:600}),fila('Cuisine','CANTIDAD',{cantidad:900}),fila('Aro','CANTIDAD',{cantidad:400})],{});
  const iAro=items(rep.N).find(p=>p.marca==='Aro');
  ok(items(rep.N).length===2&&iAro.cantidadProgramada===1000&&iAro.tramosSecuencia.length===2&&iAro.tramosSecuencia.map(x=>x.cantidadObjetivo).join()==='600,400','un producto repetido: UNA programación con la suma de sus tramos (1,000), no se duplica');
  ok(rep.NS.capacidadVigente(FECHA,'DÍA','B7L').cambios===2,'el producto repetido genera un cambio por cada vez');
}
/* ---------- 4) Fontlife: Completar cantidad convive y sus tramos esperan el saldo ---------- */
{
  const {S,M,N,NS}=entorno([]);
  await M.guardar({linea:'B7L',fecha:MANANA,turno:'DÍA',marca:'Fontlife',presentacion:'7 Litros',upp:200},{modo:'COMPLETAR',cantidad:0,pendiente:true,motivoPendiente:'Todavía no hay registro del bloque de referencia.',
    meta:{ref:{fecha:FECHA,bloque:'NOCHE',cantidadVinculada:null},id:'meta_f',total:70000,vinculos:[]}});
  const f0=S.filasDe('B7L',MANANA,'DÍA');
  ok(f0.length===1&&f0[0].saldo&&f0[0].tipoFin==='CANTIDAD'&&!(Number(f0[0].cantidad)>0),'el plan «Completar cantidad» pendiente aparece en la secuencia como saldo por calcular');
  const VELF=Object.assign({},VEL,{'B7L|7 Litros|Fontlife':1000});
  const filas=f0.concat([fila('Cuisine','HORA',{hora:'13:00'})]);
  const e=S.estimar('B7L',MANANA,'DÍA',filas);
  ok(e.estado==='PARCIAL'&&e.tramos[0].estado==='PENDIENTE'&&/saldo por calcular/.test(e.tramos[0].motivo)&&e.tramos[1].estado==='PENDIENTE'&&e.tramos[1].cantidad===null,'su duración y los tramos posteriores quedan pendientes: no se usa duración cero para adelantar otras marcas');
  await S.guardar('B7L',MANANA,'DÍA',filas,{});
  const its=items(N);
  const fon=its.find(p=>p.marca==='Fontlife'),cu=its.find(p=>p.marca==='Cuisine');
  ok(fon.modo==='COMPLETAR'&&fon.meta.total===70000&&fon.meta.resolucion.estado==='PENDIENTE_CIERRE'&&fon.cantidadProgramada===0&&fon.tramosSecuencia.length===1&&cu.modo==='HORA'&&cu.estimado.estado==='PENDIENTE','al guardar la secuencia, Completar cantidad conserva su meta y su estado pendiente; la marca siguiente queda con estimación pendiente');
  // resuelto el saldo, se calculan los tramos
  N.docs.set('sync/records',{items:[{id:'rn',linea:'B7L',fecha:FECHA,turno:'NOCHE',estadoRegistro:'FINALIZADO',actualizadoEn:5,cuadros:[{marca:'Fontlife',presentacion:'7 Litros',produccion:{efectiva:52000}}]}]});
  await M.resolverPendientes();
  const fon2=items(N).find(p=>p.marca==='Fontlife');
  ok(fon2.cantidadProgramada===18000&&fon2.meta.resolucion.estado==='SALDO_CALCULADO','al cierre se calcula el saldo (70,000 es la meta entre bloques, no una cantidad adicional)');
}
/* ---------- 13) proyección con ejecución real: no cambia el compromiso ---------- */
{
  const regs=[];
  const base=[F('B7L',FECHA,'DÍA','Aro','7 Litros',1200,200,{estadoOperacion:{estado:'FINALIZADA',inicio:T(FECHA,'07:00'),finalizadaEn:T(FECHA,'09:30')}}),F('B7L',FECHA,'DÍA','Cuisine','7 Litros',3525,200,{estadoOperacion:{estado:'PENDIENTE'}})];
  const {S,N,NS}=entorno([],{ahora:T(FECHA,'09:40')});
  // se arma el plan publicado primero (a las 05:00) y luego se simula la ejecución
  const pub=entorno([],{ahora:T(FECHA,'05:00')});
  const filasPub=[fila('Aro','CANTIDAD',{cantidad:1200}),fila('Cuisine','HORA',{hora:'13:00'})];
  await pub.S.guardar('B7L',FECHA,'DÍA',filasPub,{});
  const publicado=clon(items(pub.N));
  const cuPub=publicado.find(p=>p.marca==='Cuisine');
  // el mismo plan, con Aro finalizado a las 09:30 (30 min tarde) a las 09:40
  publicado.find(p=>p.marca==='Aro').estadoOperacion={estado:'FINALIZADA',inicio:T(FECHA,'07:00'),finalizadaEn:T(FECHA,'09:30')};
  const ej=entorno(publicado,{ahora:T(FECHA,'09:40')});
  const pr=ej.S.proyeccion('B7L',FECHA,'DÍA');
  const cuPr=pr.estimacion.tramos.find(x=>x.marca==='Cuisine'),aroPr=pr.estimacion.tramos.find(x=>x.marca==='Aro');
  ok(pr.aplica&&aroPr.real&&aroPr.estado==='REAL'&&ej.S.hora(pr.bloque,aroPr.finOff)==='09:30'&&pr.sustento.some(x=>/Aro finalizó a las 09:30 \(real\)/.test(x)),'la proyección usa el fin real del tramo anterior y dice qué datos reales la sustentan');
  ok(ej.S.hora(pr.bloque,cuPr.inicioOff)==='09:40'&&ej.S.hora(pr.bloque,cuPr.finOff)==='13:00'&&cuPr.cantidad<num0(cuPub.estimado.cantidad)&&cuPr.cantidad>0,'el siguiente tramo que aún no inicia usa el cambio previsto y no empieza en el pasado: menos tiempo y menos cantidad estimada');
  ok(items(ej.N).find(p=>p.marca==='Cuisine').estimado.cantidad===cuPub.estimado.cantidad&&items(ej.N).find(p=>p.marca==='Cuisine').cantidadProgramada===cuPub.cantidadProgramada,'la proyección NO cambia la instrucción publicada ni el compromiso');
  ok(/Proyección actual/.test(ej.S.htmlBloque('B7L',FECHA,'DÍA'))&&/no cambia la instrucción publicada/.test(ej.S.htmlBloque('B7L',FECHA,'DÍA')),'dos lecturas separadas en pantalla: plan publicado y proyección actual');
  // cambio real mayor que 5 min: dato informativo, sin parada oficial
  publicado.find(p=>p.marca==='Cuisine').estadoOperacion={estado:'EN_PRODUCCION',inicio:T(FECHA,'09:42')};
  const ej2=entorno(publicado,{ahora:T(FECHA,'10:00')});
  const p2=ej2.S.proyeccion('B7L',FECHA,'DÍA');
  ok(p2.cambios.length===1&&Math.round(p2.cambios[0].realMin)===12&&p2.cambios[0].previstoMin===5,'si el cambio real dura más (12 min) se conserva el dato real y el previsto sigue como referencia');
  const antes=entorno(publicado,{ahora:T(FECHA,'05:00')});
  ok(antes.S.proyeccion('B7L',FECHA,'DÍA').aplica===false,'antes de empezar el bloque no hay proyección: se lee el plan publicado');
  // tramo anterior que tarda más y consume el horario del siguiente
  const lento=entorno([F('B7L',FECHA,'DÍA','Aro','7 Litros',2400,200,{estadoOperacion:{estado:'EN_PRODUCCION',inicio:T(FECHA,'07:00')},tramosSecuencia:[{id:'x1',orden:1,tipoFin:'CANTIDAD',cantidadObjetivo:2400}]}),
    F('B7L',FECHA,'DÍA','Cuisine','7 Litros',1000,200,{modo:'HORA',estimado:{cantidad:1000},tramosSecuencia:[{id:'x2',orden:2,tipoFin:'HORA',horaFin:'10:00'}]})],{ahora:T(FECHA,'09:00')});
  const pl=lento.S.proyeccion('B7L',FECHA,'DÍA');
  ok(pl.estimacion.estado==='CONFLICTO'&&pl.estimacion.conflictos.some(c=>/debe terminar a las 10:00/.test(c)),'si el tramo anterior consume el horario del siguiente: se muestra el conflicto y no se omite ni se inicia ninguna marca automáticamente');
}
function num0(x){return Number(x)||0;}
/* ---------- 14) alcanzar el estimado no finaliza ---------- */
{
  const {S,N,M}=entorno([]);
  await S.guardar('B7L',FECHA,'DÍA',[fila('Scala','CIERRE')],{});
  const p=items(N)[0];
  const sobre=M.estadoPlan(p,{programado:p.cantidadProgramada,producido:p.cantidadProgramada+800});
  ok(!sobre.cumplida&&sobre.clave==='VIGENTE'&&/sigue vigente hasta el cierre confirmado/.test(sobre.nota),'alcanzar el estimado no finaliza «hasta el cierre» ni lo marca completado');
  const h=await S.guardar('B7L',FECHA,'DÍA',[fila('Scala','HORA',{hora:'13:00',itemClave:p.clave,version:p.version,modo:'TURNO'})],{});
  const q=items(N)[0];
  ok(items(N).length===1&&q.modo==='HORA'&&q.id===p.id&&q.version===p.version+1&&M.estadoPlan(q,{programado:q.cantidadProgramada,producido:q.cantidadProgramada+1}).cumplida===false,'editar el criterio conserva la identidad del plan; la hora prevista tampoco lo completa');
}
/* ---------- 16) concurrencia, doble envío, permisos, copia, exportación ---------- */
{
  const {S,N,NS}=entorno([]);
  const filas=[fila('Aro','CANTIDAD',{cantidad:1200}),fila('Cuisine','HORA',{hora:'13:00'})];
  const r=await Promise.allSettled([S.guardar('B7L',FECHA,'DÍA',filas,{}),S.guardar('B7L',FECHA,'DÍA',filas,{})]);
  ok(r.filter(x=>x.status==='fulfilled').length===1&&r.some(x=>x.status==='rejected'&&/Ya se está guardando/.test(x.reason.message))&&items(N).length===2&&historial(N).length===2,'doble envío: no duplica tramos ni cantidades ni historial');
  // cambio simultáneo
  const its=clon(items(N));
  const vista=S.filasDe('B7L',FECHA,'DÍA');
  const d=N.docs.get('sync/programaciones');d.items.find(p=>p.marca==='Aro').version+=1;N.docs.set('sync/programaciones',d);
  let e='';try{await S.guardar('B7L',FECHA,'DÍA',vista,{});}catch(x){e=x.message;}
  ok(/Otra persona cambió «Aro»/.test(e),'dos usuarios: el cambio simultáneo no se sobrescribe en silencio');
  // sin permiso / consulta
  const cons=entorno([],{usuario:{planifica:false}});
  e='';try{await cons.S.guardar('B7L',FECHA,'DÍA',filas,{});}catch(x){e=x.message;}
  ok(/Solo Planificación/.test(e)&&items(cons.N).length===0,'consulta no puede guardar la secuencia');
  // validaciones
  const v=S.validar('B7L',FECHA,'DÍA',[fila('Aro','CANTIDAD'),fila('Cuisine','HORA'),fila('Zzz','CANTIDAD',{cantidad:5}),fila('Scala','HORA',{hora:'12:00'}),fila('Scala','CANTIDAD',{cantidad:5})]);
  ok(v.some(x=>/cantidad debe ser un entero/.test(x))&&v.some(x=>/elige la hora límite/.test(x))&&v.some(x=>/no existe en B7L/.test(x))&&!v.some(x=>/solo tramo|un solo tramo/.test(x)),'validaciones: cantidad, hora, marca inexistente (un producto puede repetirse con hora o cierre)');
  // producto quitado de la secuencia
  const q2=entorno([]);
  await q2.S.guardar('B7L',FECHA,'DÍA',[fila('Aro','CANTIDAD',{cantidad:600}),fila('Cuisine','CANTIDAD',{cantidad:900})],{});
  const keep=q2.S.filasDe('B7L',FECHA,'DÍA').slice(0,1);
  await q2.S.guardar('B7L',FECHA,'DÍA',keep,{});
  ok(items(q2.N).length===1&&items(q2.N)[0].marca==='Aro'&&historial(q2.N).some(x=>x.accion==='ELIMINACION'),'un producto quitado de la secuencia (sin empezar) se elimina con su historial');
  const q3=entorno([]);
  await q3.S.guardar('B7L',FECHA,'DÍA',[fila('Aro','CANTIDAD',{cantidad:600}),fila('Cuisine','CANTIDAD',{cantidad:900})],{});
  const d3=q3.N.docs.get('sync/programaciones');d3.items.find(p=>p.marca==='Cuisine').estadoOperacion={estado:'EN_PRODUCCION'};q3.N.docs.set('sync/programaciones',d3);
  e='';try{await q3.S.guardar('B7L',FECHA,'DÍA',q3.S.filasDe('B7L',FECHA,'DÍA').slice(0,1),{motivo:'prueba'});}catch(x){e=x.message;}
  ok(/ya está en producción/.test(e),'un producto en producción no se quita de la secuencia');
  // bloque iniciado: motivo
  const ini=entorno([F('B7L',FECHA,'DÍA','Aro','7 Litros',600,200,{estadoOperacion:{estado:'EN_PRODUCCION',inicio:T(FECHA,'07:00')},tramosSecuencia:[{id:'z',orden:1,tipoFin:'CANTIDAD',cantidadObjetivo:600}]})],{ahora:T(FECHA,'08:00')});
  e='';try{await ini.S.guardar('B7L',FECHA,'DÍA',ini.S.filasDe('B7L',FECHA,'DÍA').map(f=>Object.assign({},f,{cantidad:700})),{});}catch(x){e=x.message;}
  ok(/motivo del cambio/.test(e),'cambiar una ejecución iniciada exige motivo');
  // copia
  const cp=entorno([Object.assign(F('B7L',FECHA,'DÍA','Cuisine','7 Litros',3000,200,{modo:'HORA',estimado:{cantidad:3000,horaFin:'13:00'},tramosSecuencia:[{id:'h',orden:1,tipoFin:'HORA',horaFin:'13:00'}]}))]);
  const pc=cp.NS.planCopia({modo:'DIA_ANTERIOR',fecha:MANANA});
  ok(pc.candidatos.length===0&&pc.omitidos.some(o=>/Hasta una hora: no se copia/.test(o.texto)),'copiar a otro día no arrastra una hora límite ni una estimación: exige programarlo de nuevo');
}
/* ---------- 16b) el mismo producto varias veces en la línea: Scala hasta las 12:00 → Aro 1,200 → Scala el resto del turno ---------- */
{
  const {S,N,M}=entorno([]);
  const filas=[fila('Scala','HORA',{hora:'12:00'}),fila('Aro','CANTIDAD',{cantidad:1200}),fila('Scala','CIERRE')];
  ok(S.validar('B7L',FECHA,'DÍA',filas).length===0,'Scala puede repetirse en la línea (hasta una hora y luego el resto del turno)');
  const e=S.estimar('B7L',FECHA,'DÍA',filas);
  ok(e.estado==='OK'&&e.conflictos.length===0&&e.tramos[0].cantidad===6000&&e.tramos[1].cantidad===1200&&e.tramos[2].cantidad===5800,'cada paso tiene su propia cantidad: 6 000 + 1 200 + 5 800 (Scala vuelve tras el cambio de 5 min)');
  ok(S.validar('B7L',FECHA,'DÍA',[fila('Scala','CIERRE'),fila('Aro','CANTIDAD',{cantidad:10})]).some(x=>/último paso/.test(x)),'«resto del turno» solo puede ir en el último paso de la línea');
  await S.guardar('B7L',FECHA,'DÍA',filas,{});
  const sc=items(N).find(p=>p.marca==='Scala');
  ok(items(N).length===2&&sc.cantidadProgramada===11800&&sc.tramosSecuencia.length===2&&sc.estimado.cantidad===11800&&sc.modo==='TURNO'&&sc.alcance==='TIEMPO_RESTANTE','una sola programación de Scala con 2 pasos y la SUMA como cantidad (11 800)');
  const ar=items(N).find(p=>p.marca==='Aro');
  ok(ar.cantidadProgramada===1200&&ar.modo==='FIJA','Aro conserva su cantidad fija');
  const re=S.revision(sc);
  ok(re&&re.estado==='OK'&&re.hoy===11800&&re.cambio===false,'la revisión compara la suma de los pasos');
  // reabrir: los 3 pasos vuelven en orden
  const vuelta=S.filasDe('B7L',FECHA,'DÍA');
  ok(vuelta.length===3&&vuelta.map(f=>f.marca).join()==='Scala,Aro,Scala'&&vuelta[0].tipoFin==='HORA'&&vuelta[2].tipoFin==='CIERRE','al reabrir se recuperan los 3 pasos en su orden');
  // mixto: cantidad fija + resto del turno del mismo producto
  const g=entorno([]);
  await g.S.guardar('PET1',FECHA,'DÍA',[fila('Scala','CANTIDAD',{cantidad:13000,presentacion:'2.5 Litros'}),fila('Scala','CIERRE',{presentacion:'2.5 Litros'})],{});
  const p1=items(g.N)[0];
  ok(items(g.N).length===1&&p1.cantidadProgramada===13000+Math.round(0)+(p1.estimado.cantidad-13000)&&p1.estimado.cantidad>13000&&p1.tramosSecuencia.length===2,'PET 1: Scala 13 000 y luego Scala el resto → una programación con la suma');
  // agregar un paso desde «Nueva programación»
  const h=entorno([]);
  await h.S.guardar('B7L',FECHA,'DÍA',[fila('Aro','CANTIDAD',{cantidad:1200})],{});
  await h.S.agregarPaso({linea:'B7L',fecha:FECHA,turno:'DÍA',marca:'Scala',presentacion:'7 Litros'},{tipoFin:'HORA',hora:'13:00'},{});
  const ps=items(h.N);
  ok(ps.length===2&&ps.find(p=>p.marca==='Scala').modo==='HORA'&&ps.find(p=>p.marca==='Scala').tramosSecuencia[0].orden===2,'«Hasta una hora» desde Nueva programación se agrega al final de la secuencia');
}
/* ---------- 17) sin paradas oficiales ni cambio automático, fuentes, convivencia ---------- */
{
  const s66b=leer('js/produccion/66b-planificacion-secuencia.js'),m=leer('js/produccion/65b-planificacion-motor.js'),idx=leer('index.html'),s52=leer('js/produccion/52-planificacion-pantalla.js');
  ok(!/avancesTurno|paradasOperativas|ratioReal|finalizarLinea|estadoOperacion\s*=/.test(s66b.replace(/\/\*[^]*?\*\//g,'').replace(/\/\/.*$/gm,''))&&!/paradasOperativas|avancesTurno/.test(m),'ninguna estimación genera paradas oficiales, toca el ratio real ni cambia de marca por sí sola');
  ok(idx.indexOf('66b-planificacion-secuencia.js')>idx.indexOf('66p-planificacion-modos.js')&&/data-plan-seq/.test(s52)&&/debeUsarSecuencia/.test(s52),'index.html carga 66b después de 66; la tabla ofrece «Secuencia» y los planes temporales se editan en ella');
  ok(/sq-subir|data-sq-subir/.test(s66b)&&/data-sq-bajar/.test(s66b)&&/@media\(max-width:760px\)/.test(s66b),'la secuencia se reordena con botones ▲▼ (no solo arrastrando) y se adapta a celular');
  ok(/Tiempo de cambio de marca/.test(s66b)&&/CAMBIO_INICIAL_MIN=5/.test(m),'el catálogo muestra «Tiempo de cambio de marca» con 5 minutos como valor inicial');
}
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
