/* Planificación · modos de programación: Completar cantidad (meta entre bloques con cierre confirmado), Todo el turno (estimación por ratio nominal),
   Cálculo parcial de capacidad y Estado del plan «Completada» separado del estado operativo. Con la página real y una nube falsa. */
const {nube,dispositivo,F,items,leer,clon}=require('./planificacion-harness');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const FECHA='2099-03-07',MANANA='2099-03-08',AYER='2099-03-06';
const hora=h=>new Date(FECHA+'T'+h+':00').getTime();
const VEL={'PET1|Regular_625ml|Bells':2400,'PET1|Regular_380ml|Scala':3000,'PET1|Regular_625ml|Scala':3000,'PET2|Regular_625ml|Bells':3000};
const regla=(id,tipo,minutos,extra)=>Object.assign({id,linea:'PET1',tipo,minutos,activo:true,aplica:'',origen:null,destino:null,descripcion:'',actualizadoEn:1},extra||{});
const rec=(id,fecha,turno,estado,cuadros)=>({id,linea:'PET1',fecha,turno,estadoRegistro:estado,cuadros});
const cu=(marca,pres,efectiva)=>({marca,presentacion:pres,produccion:{efectiva}});
const historial=N=>[...N.docs.entries()].filter(([k])=>k.startsWith('historialProgramacion/')).map(([,v])=>v);

function entorno(programaciones,opc){
  opc=opc||{};
  const N=nube();
  N.docs.set('sync/programaciones',{items:programaciones});
  N.docs.set('sync/catalogoPlanificacion',{items:[],tiempos:opc.tiempos===undefined?{reglas:[regla('r1','CAMBIO_MARCA',20),regla('r2','CAMBIO_FORMATO',15)],ventanas:[],version:1}:opc.tiempos});
  const sb=dispositivo(N,Object.assign({nombre:'Ana'},opc.usuario||{}),{ahora:opc.ahora||hora('12:00')});
  sb.glacialVelocidadEstandar=(l,p,m)=>(opc.vel||VEL)[[l,p,m].join('|')]||0;
  sb.puedeEntrarPlanificacion=()=>true;
  sb.RECS=opc.registros||[];sb.loadRecords=()=>sb.RECS;sb.normalizarCuadros=r=>r.cuadros||[];
  sb.PROD=opc.prod||{};sb.glacialProducidoVigente=p=>(p.clave in sb.PROD)?sb.PROD[p.clave]:null;
  sb.escuchar();
  return {N,sb,NS:sb.NS,M:sb.NS.modos};
}
const fila=(extra)=>Object.assign({linea:'PET1',fecha:MANANA,turno:'DÍA',marca:'Scala',presentacion:'Regular_380ml',upp:2184},extra||{});
const base={linea:'PET1',marca:'Scala',presentacion:'Regular_380ml'};
const cierreMan=(c,extra)=>rec('r_'+Math.random().toString(36).slice(2,6),FECHA,'DÍA','FINALIZADO',[cu('Scala','Regular_380ml',c)]);

(async()=>{
/* ---------- 1) Completar cantidad: meta 24,000, cierre 18,000 → saldo 6,000 ---------- */
{
  const {M}=entorno([],{registros:[cierreMan(18000)]});
  const r=M.planCompletar(Object.assign({},base,{fecha:FECHA,bloque:'NOCHE',metaTotal:24000,ref:{fecha:FECHA,bloque:'DÍA'},items:[],registros:[cierreMan(18000)]}));
  ok(r.ok&&r.saldo===6000&&r.asignado===18000&&r.cierre.estado==='CONFIRMADO'&&r.elegible===18000&&!r.completada,'meta 24,000 con cierre de 18,000 → saldo de 6,000 para Noche (la meta no es una cantidad adicional)');
  const prog=r.vinculos;
  ok(prog.length===1&&prog[0].asignado===18000&&prog[0].cierre==='PET1|'+FECHA+'|DÍA|Scala|Regular_380ml','el vínculo guarda cierre, fecha, bloque y cantidad asignada');
}
/* ---------- 2) cierre ausente, pendiente, válido con cero, corregido ---------- */
{
  const {M}=entorno([]);
  const pl=regs=>M.planCompletar(Object.assign({},base,{fecha:FECHA,bloque:'NOCHE',metaTotal:24000,ref:{fecha:FECHA,bloque:'DÍA'},items:[],registros:regs}));
  const sin=pl([]);
  ok(sin.ok&&sin.pendiente&&sin.estado==='SIN_CIERRE'&&sin.saldo===null&&/Puedes guardar la programación/.test(sin.avisos.join(' ')),'sin cierre: queda «Pendiente de cierre», se puede guardar y el saldo es null (no cero ni la meta)');
  const abierto=pl([rec('a',FECHA,'DÍA','EN_REGISTRO',[cu('Scala','Regular_380ml',9000)])]);
  ok(abierto.ok&&abierto.pendiente&&abierto.estado==='PENDIENTE_CIERRE'&&/abierto o reabierto/.test(abierto.motivoPendiente),'un registro sin finalizar (avance parcial) no es un cierre confirmado: pendiente y se explica el estado');
  const cero=pl([rec('a',FECHA,'DÍA','FINALIZADO',[cu('Scala','Regular_380ml',0)])]);
  ok(cero.ok&&cero.cierre.producido===0&&cero.saldo===24000&&cero.cierre.productoEnCierre===true,'un cierre válido con cero producido se distingue de un cierre ausente (saldo = toda la meta)');
  const sinProd=pl([rec('a',FECHA,'DÍA','FINALIZADO',[cu('Bells','Regular_625ml',5000)])]);
  ok(sinProd.ok&&sinProd.saldo===24000&&sinProd.avisos.some(a=>/no registra este producto/.test(a)),'cierre válido sin ese producto: 0 UND y se avisa');
  const ambiguo=pl([rec('a',FECHA,'DÍA','FINALIZADO',[cu('','',4000),cu('Scala','Regular_380ml',100)])]);
  ok(ambiguo.ok&&ambiguo.pendiente&&ambiguo.revision&&ambiguo.estado==='NO_IDENTIFICABLE'&&ambiguo.saldo===null,'si el cierre no permite identificar el producto con certeza, se guarda para revisión y no se inventa la cantidad');
  // corrección posterior del cierre → aviso de revisión
  const aplicado={clave:'k',linea:'PET1',fecha:FECHA,turno:'NOCHE',marca:'Scala',presentacion:'Regular_380ml',cantidadProgramada:6000,modo:'COMPLETAR',meta:{id:'m1',total:24000,vinculos:[{cierre:'PET1|'+FECHA+'|DÍA|Scala|Regular_380ml',fecha:FECHA,bloque:'DÍA',producido:18000,asignado:18000}]}};
  const rev=M.revisionesDe(aplicado,[rec('a',FECHA,'DÍA','FINALIZADO',[cu('Scala','Regular_380ml',17000)])]);
  ok(rev.length===1&&rev[0].antes===18000&&rev[0].ahora===17000,'si el cierre se corrige, queda un aviso con el valor anterior y el actual (propuesta de revisión; no se reescribe solo)');
  ok(M.revisionesDe(aplicado,[rec('a',FECHA,'DÍA','FINALIZADO',[cu('Scala','Regular_380ml',18000)])]).length===0,'sin corrección no hay aviso');
}
/* ---------- 3) otro producto, bloque único Mañana+Intermedio, orden de bloques ---------- */
{
  const {M}=entorno([]);
  const pl=(regs,extra)=>M.planCompletar(Object.assign({},base,{fecha:FECHA,bloque:'NOCHE',metaTotal:24000,ref:{fecha:FECHA,bloque:'DÍA'},items:[],registros:regs},extra||{}));
  const otro=pl([rec('a',FECHA,'DÍA','FINALIZADO',[cu('Scala','Regular_625ml',9000),cu('Bells','Regular_380ml',3000),cu('Scala','Regular_380ml',15000)])]);
  ok(otro.saldo===9000,'no descuenta producción de otra presentación ni de otra marca');
  const doble=pl([rec('a',FECHA,'DÍA','FINALIZADO',[cu('Scala','Regular_380ml',10000)]),rec('b',FECHA,'INTERMEDIO','FINALIZADO',[cu('Scala','Regular_380ml',8000)]),rec('a',FECHA,'DÍA','FINALIZADO',[cu('Scala','Regular_380ml',10000)])]);
  ok(doble.cierre.producido===18000&&doble.saldo===6000,'Mañana + Intermedio es un bloque: cada registro se cuenta una sola vez (duplicados por id no suman dos veces)');
  const otraLinea=M.cierreReferencia({registros:[Object.assign(rec('x',FECHA,'DÍA','FINALIZADO',[cu('Scala','Regular_380ml',5000)]),{linea:'PET2'})],linea:'PET1',fecha:FECHA,bloque:'DÍA',marca:'Scala',presentacion:'Regular_380ml'});
  ok(otraLinea.estado==='SIN_CIERRE','otra línea no cuenta');
  ok(!pl([],{ref:{fecha:FECHA,bloque:'NOCHE'}}).ok&&/anterior al bloque de destino/.test(pl([],{ref:{fecha:FECHA,bloque:'NOCHE'}}).errores.join(' '))&&!pl([],{ref:{fecha:MANANA,bloque:'DÍA'}}).ok,'no se vincula a sí mismo ni a un cierre posterior');
  // de Noche hacia Mañana + Intermedio del día siguiente
  const alDia=M.planCompletar(Object.assign({},base,{fecha:MANANA,bloque:'DÍA',metaTotal:24000,ref:{fecha:FECHA,bloque:'NOCHE'},items:[],registros:[rec('n',FECHA,'NOCHE','FINALIZADO',[cu('Scala','Regular_380ml',20000)])]}));
  ok(alDia.ok&&alDia.saldo===4000&&M.bloqueAnterior(MANANA,'DÍA').fecha===FECHA&&M.bloqueAnterior(MANANA,'DÍA').bloque==='NOCHE','también de Noche hacia Mañana + Intermedio del día siguiente (fecha operativa correcta)');
}
/* ---------- 4) meta completada, sobreproducción, varios bloques, mismo cierre una sola vez ---------- */
{
  const {M,NS,N}=entorno([],{registros:[cierreMan(25000)],usuario:{planifica:true}});
  const r=M.planCompletar(Object.assign({},base,{fecha:FECHA,bloque:'NOCHE',metaTotal:24000,ref:{fecha:FECHA,bloque:'DÍA'},items:[],registros:[cierreMan(25000)]}));
  ok(r.ok&&r.saldo===0&&r.completada&&r.sobre===1000&&r.avisos.some(a=>/Meta completada/.test(a))&&r.avisos.some(a=>/negativas/.test(a)),'meta ya cumplida: saldo cero, «Meta completada» y sin cantidades negativas');
  await M.guardar(fila({fecha:FECHA,turno:'NOCHE'}),{modo:'COMPLETAR',cantidad:0,cierreId:M.cierreId(r.cierre),producidoCierre:r.cierre.producido,meta:{ref:{fecha:FECHA,bloque:'DÍA'},id:r.metaId,total:24000,vinculos:r.vinculos}});
  ok(items(N).length===1&&items(N)[0].cantidadProgramada===0&&items(N)[0].meta.resolucion.estado==='META_COMPLETADA'&&NS.esPlanSinCantidad(items(N)[0])&&NS.capacidadVigente(FECHA,'NOCHE','PET1')===null&&M.estadoPlan(items(N)[0],null).texto==='Meta completada','meta ya cumplida: el plan se conserva con cantidad 0 y «Meta completada»; no es una orden productiva (no entra a la capacidad)');
}
{
  // tres bloques: Día (18,000) → Noche (saldo 6,000, produce 5,000) → Día siguiente
  const regs=[cierreMan(18000),rec('n',FECHA,'NOCHE','FINALIZADO',[cu('Scala','Regular_380ml',5000)])];
  const {M,NS,N}=entorno([],{registros:regs});
  const p1=M.planCompletar(Object.assign({},base,{fecha:FECHA,bloque:'NOCHE',metaTotal:24000,ref:{fecha:FECHA,bloque:'DÍA'},items:[],registros:regs}));
  await M.guardar(fila({fecha:FECHA,turno:'NOCHE'}),{modo:'COMPLETAR',cantidad:p1.saldo,meta:{ref:{fecha:FECHA,bloque:'DÍA'},id:p1.metaId,total:24000,referencia:'Pedido 77',vinculos:p1.vinculos}});
  const noche=items(N)[0];
  ok(noche.modo==='COMPLETAR'&&noche.cantidadProgramada===6000&&noche.meta.total===24000&&noche.meta.referencia==='Pedido 77'&&noche.meta.vinculos.length===1&&noche.alcance===null&&noche.estimado===null,'el destino guarda el saldo asignado (6,000) y conserva la meta original, la referencia y los vínculos como datos estructurados');
  const h=historial(N);
  ok(h.length===1&&/^COMPLETAR: meta 24,000/.test(h[0].referencia)&&h[0].modo==='COMPLETAR'&&h[0].meta.total===24000&&h[0].uid==='uid-Ana'&&h[0].nuevo.modo==='COMPLETAR','el historial deja autor, hora del servidor, referencia, modo y meta');
  const p2=M.planCompletar(Object.assign({},base,{fecha:MANANA,bloque:'DÍA',metaTotal:99,ref:{fecha:FECHA,bloque:'NOCHE'},items:items(N),registros:regs}));
  ok(p2.ok&&p2.continua&&p2.metaId===p1.metaId&&p2.metaTotal===24000&&p2.vinculos.length===2&&p2.asignado===23000&&p2.saldo===1000,'tercer bloque: continúa la misma meta con lo producido en TODOS los bloques vinculados (18,000 + 5,000), cada cierre una sola vez');
  const p3=M.planCompletar(Object.assign({},base,{fecha:MANANA,bloque:'DÍA',metaTotal:99,ref:{fecha:FECHA,bloque:'NOCHE'},items:items(N),registros:regs}));
  ok(p3.saldo===p2.saldo&&p3.vinculos.length===2,'aplicar de nuevo el mismo cierre no duplica el descuento');
  // mismo cierre asignado a OTRA meta: no puede exceder lo producido
  const otra=M.planCompletar(Object.assign({},base,{fecha:FECHA,bloque:'NOCHE',metaTotal:30000,ref:{fecha:FECHA,bloque:'DÍA'},items:items(N),registros:regs,metaIdActual:'meta_otra'}));
  ok(otra.elegible===0&&otra.otrasMetas===18000&&otra.saldo===30000||!otra.ok||otra.elegible===0,'el cierre ya asignado a otra meta no queda disponible otra vez');
  const exceso=M.planCompletar(Object.assign({},base,{fecha:FECHA,bloque:'NOCHE',metaTotal:30000,ref:{fecha:FECHA,bloque:'DÍA'},cantidadVinculada:5000,items:items(N),registros:regs,metaIdActual:'meta_otra'}));
  ok(!exceso.ok&&/excede la producción elegible/.test(exceso.errores.join(' ')),'la suma de asignaciones no puede exceder la producción elegible del cierre');
  // no reducir por debajo de lo ya producido
  const {M:M2,N:N2,NS:NS2,sb:sb2}=entorno([],{registros:regs});
  await M2.guardar(fila({fecha:FECHA,turno:'NOCHE'}),{modo:'COMPLETAR',cantidad:6000,meta:{ref:{fecha:FECHA,bloque:'DÍA'},id:p1.metaId,total:24000,vinculos:p1.vinculos}});
  sb2.PROD[items(N2)[0].clave]=5500;
  let e='';try{await M2.guardar(fila({fecha:FECHA,turno:'NOCHE'}),{modo:'COMPLETAR',cantidad:5000,meta:{ref:{fecha:FECHA,bloque:'DÍA'},id:p1.metaId,total:24000,vinculos:p1.vinculos}},{versionEsperada:items(N2)[0].version});}catch(x){e=x.message;}
  ok(/menos de lo ya producido/.test(e),'no se reduce la cantidad asignada por debajo de lo ya producido');
}
/* ---------- 5) concurrencia: doble clic y asignación simultánea del mismo cierre ---------- */
{
  const regs=[cierreMan(18000)];
  const {M,N}=entorno([],{registros:regs});
  const p=M.planCompletar(Object.assign({},base,{fecha:FECHA,bloque:'NOCHE',metaTotal:24000,ref:{fecha:FECHA,bloque:'DÍA'},items:[],registros:regs}));
  const datos={modo:'COMPLETAR',cantidad:p.saldo,meta:{ref:{fecha:FECHA,bloque:'DÍA'},id:p.metaId,total:24000,vinculos:p.vinculos}};
  const a=M.guardar(fila({fecha:FECHA,turno:'NOCHE'}),datos),b=M.guardar(fila({fecha:FECHA,turno:'NOCHE'}),datos);
  const rs=await Promise.allSettled([a,b]);
  ok(rs.filter(r=>r.status==='fulfilled').length===1&&rs.some(r=>r.status==='rejected'&&/Ya se está guardando/.test(r.reason.message))&&items(N).length===1&&historial(N).length===1,'doble clic: se guarda una sola vez (una entrada de historial)');
  // otra persona asigna el mismo cierre a otra meta mientras se revisaba
  const {M:M3,N:N3}=entorno([Object.assign(F('PET1',FECHA,'NOCHE','Scala','Regular_380ml',6000,2184),{modo:'COMPLETAR',meta:{id:'meta_ajena',total:20000,vinculos:[{cierre:'PET1|'+FECHA+'|DÍA|Scala|Regular_380ml',fecha:FECHA,bloque:'DÍA',producido:18000,asignado:18000}]}})],{registros:regs});
  let e='';try{await M3.guardar(fila({fecha:MANANA,turno:'DÍA'}),{modo:'COMPLETAR',cantidad:6000,meta:{ref:{fecha:FECHA,bloque:'DÍA'},id:'meta_mia',total:24000,vinculos:p.vinculos}});}catch(x){e=x.message;}
  ok(/ya fue asignado a otra meta/.test(e)&&items(N3).length===1,'la validación dentro de la transacción rechaza un cierre que otra persona asignó a otra meta mientras tanto');
}
/* ---------- 6) capacidad con dos o más marcas y cálculo parcial ---------- */
{
  const progs=[F('PET1',FECHA,'NOCHE','Bells','Regular_625ml',9600,1200),F('PET1',FECHA,'NOCHE','Scala','Regular_380ml',9000,2184)];
  const completo=entorno(progs);
  const c=completo.NS.capacidadVigente(FECHA,'NOCHE','PET1');
  ok(c.estado!=='INCOMPLETA'&&c.faltantes.length===0&&c.cambios===1&&c.cambiosMin===20&&c.produccionMin>0,'dos marcas con parámetros completos se calculan normalmente (un cambio de marca y formato)');
  const parcial=entorno(progs,{tiempos:{reglas:[],ventanas:[],version:1}});
  const cp=parcial.NS.capacidadVigente(FECHA,'NOCHE','PET1');
  ok(cp.estado==='INCOMPLETA'&&cp.produccionMin>0&&cp.conocidoMin===cp.produccionMin&&/Cálculo parcial: falta configurar cambio de marca/.test(parcial.NS.textoParcial(cp)),'cambio desconocido: Cálculo parcial con lo conocido; no se convierte a cero ni se concluye «Cabe»');
  ok(cp.productos.every(p=>p.min!==null)&&cp.preparaciones.some(t=>t.minutos===null),'el desglose conserva el tiempo de cada producto y marca la preparación pendiente');
  const sinVel=entorno(progs,{vel:{'PET1|Regular_380ml|Scala':3000}});
  const cv=sinVel.NS.capacidadVigente(FECHA,'NOCHE','PET1');
  ok(cv.estado==='INCOMPLETA'&&cv.productos.find(p=>p.marca==='Scala').min>0&&cv.productos.find(p=>p.marca==='Bells').min===null&&/falta la velocidad estándar de Bells/.test(sinVel.NS.textoParcial(cv)),'velocidad faltante: se muestran los demás productos y el tramo afectado queda pendiente');
  const exceso=entorno([F('PET1',FECHA,'NOCHE','Bells','Regular_625ml',99000,1200),F('PET1',FECHA,'NOCHE','Scala','Regular_380ml',9000,2184)],{tiempos:{reglas:[],ventanas:[],version:1}});
  const ce=exceso.NS.capacidadVigente(FECHA,'NOCHE','PET1');
  ok(ce.estado==='INCOMPLETA'&&ce.excesoMinimoMin>0&&ce.conocidoMin>ce.disponibleMin,'si lo conocido ya excede el bloque: exceso mínimo comprobado, manteniendo la advertencia de datos pendientes');
  // secuencia repetida no duplica la cantidad total; canceladas no cuentan
  const rep=entorno([F('PET1',FECHA,'NOCHE','Bells','Regular_625ml',4800,1200,{tramosSecuencia:[{orden:1,marca:'Bells',presentacion:'Regular_625ml'},{orden:3,marca:'Bells',presentacion:'Regular_625ml'}]}),
    F('PET1',FECHA,'NOCHE','Scala','Regular_380ml',3000,2184,{tramosSecuencia:[{orden:2,marca:'Scala',presentacion:'Regular_380ml'}]}),F('PET1',FECHA,'NOCHE','Scala','Regular_625ml',9999,1200,{estadoOperacion:{estado:'CANCELADA'}})]);
  const cr=rep.NS.capacidadVigente(FECHA,'NOCHE','PET1');
  ok(cr.productos.length===2&&Math.round(cr.productos.find(p=>p.marca==='Bells').min)===120&&cr.cambios===2,'un producto repetido en la secuencia no duplica su cantidad (genera un cambio por vez) y las canceladas no cuentan');
  const html=entorno(progs,{tiempos:{reglas:[],ventanas:[],version:1}});
  html.sb.__el('plan-capacidad');
  ok(/Cálculo parcial/.test(html.NS.CAP.INCOMPLETA.txt)&&html.NS.CAP.INCOMPLETA.txt!=='Estimación incompleta','la tarjeta usa «Cálculo parcial»');
}
/* ---------- 7) Todo el turno ---------- */
{
  const {M,NS,N,sb}=entorno([]);
  const e=M.estimarTodoTurno({linea:'PET1',fecha:FECHA,bloque:'NOCHE',marca:'Bells',presentacion:'Regular_625ml',alcance:'TODO_TURNO',items:[],velocidad:2400});
  const cap=NS.capacidadVigente;
  ok(e.estado==='OK'&&e.cantidad===Math.floor(e.tiempoProdMin/60*2400+1e-9)&&e.tiempoProdMin===e.disponibleMin-e.preparacionMin&&e.velocidad===2400,'estimado = tiempo productivo × ratio nominal, en UND enteras sin superar el tiempo');
  ok(e.cantidad/2400*60<=e.tiempoProdMin+1e-6,'el redondeo no supera el tiempo calculado');
  const sinRatio=M.estimarTodoTurno({linea:'PET1',fecha:FECHA,bloque:'NOCHE',marca:'Bells',presentacion:'Regular_625ml',alcance:'TODO_TURNO',items:[],velocidad:0});
  ok(sinRatio.estado==='PENDIENTE'&&sinRatio.cantidad===null&&/velocidad estándar/.test(sinRatio.motivo),'sin ratio: estimación pendiente (no se inventa un valor)');
  // con ventana y preparación
  const conV=entorno([],{tiempos:{reglas:[regla('lp','LIMPIEZA_INICIO',20)],ventanas:[{id:'v1',linea:'PET1',fecha:FECHA,bloque:'NOCHE',tipo:'MANTENIMIENTO',inicio:'23:00',duracionMin:60,motivo:'Prueba',activo:true}],version:3}});
  const ev=conV.M.estimarTodoTurno({linea:'PET1',fecha:FECHA,bloque:'NOCHE',marca:'Bells',presentacion:'Regular_625ml',alcance:'TODO_TURNO',items:[],velocidad:2400});
  ok(ev.estado==='OK'&&ev.ventanasMin===60&&ev.preparacionMin===20&&ev.tiempoProdMin===ev.duracionMin-60-20&&ev.parametrosVersion===3,'usa tiempo productivo (duración − ventanas − preparación) y guarda la versión de parámetros');
  // otra marca → conflicto; tiempo restante descuenta lo fijo
  const otroItems=[F('PET1',FECHA,'NOCHE','Scala','Regular_380ml',3000,2184)];
  const conf=M.estimarTodoTurno({linea:'PET1',fecha:FECHA,bloque:'NOCHE',marca:'Bells',presentacion:'Regular_625ml',alcance:'TODO_TURNO',items:otroItems,velocidad:2400});
  ok(conf.estado==='CONFLICTO'&&/no puede reservar el bloque completo para dos productos/.test(conf.motivo)&&conf.cantidad===null,'con otra marca en la línea: conflicto claro, sin reservar el bloque completo para dos productos');
  const resto=M.estimarTodoTurno({linea:'PET1',fecha:FECHA,bloque:'NOCHE',marca:'Bells',presentacion:'Regular_625ml',alcance:'TIEMPO_RESTANTE',items:otroItems,velocidad:2400});
  ok(resto.estado==='OK'&&resto.otrosMin>0&&resto.tiempoProdMin<ev.duracionMin&&resto.cantidad>0&&resto.cantidad<M.estimarTodoTurno({linea:'PET1',fecha:FECHA,bloque:'NOCHE',marca:'Bells',presentacion:'Regular_625ml',alcance:'TODO_TURNO',items:[],velocidad:2400}).cantidad,'«Producir durante el tiempo restante» descuenta cantidades fijas, cambios y ventanas: es distinto de «Todo el turno»');
  const lleno=M.estimarTodoTurno({linea:'PET1',fecha:FECHA,bloque:'NOCHE',marca:'Bells',presentacion:'Regular_625ml',alcance:'TIEMPO_RESTANTE',items:[F('PET1',FECHA,'NOCHE','Scala','Regular_380ml',999999,2184)],velocidad:2400});
  ok(lleno.estado==='SIN_TIEMPO'&&lleno.cantidad===0,'un exceso en otros productos no genera tiempo ni producción negativos');
  // guardar
  const est=M.estimarTodoTurno({linea:'PET1',fecha:FECHA,bloque:'NOCHE',marca:'Bells',presentacion:'Regular_625ml',alcance:'TODO_TURNO',items:[],velocidad:2400});
  await M.guardar(fila({fecha:FECHA,turno:'NOCHE',marca:'Bells',presentacion:'Regular_625ml',upp:1200}),{modo:'TURNO',cantidad:est.cantidad,alcance:'TODO_TURNO',estimado:M.estimadoGuardado(est,'Ana')});
  const t=items(N)[0];
  ok(t.modo==='TURNO'&&t.alcance==='TODO_TURNO'&&t.estimado.cantidad===est.cantidad&&t.estimado.ratio===2400&&t.estimado.parametrosVersion===1&&t.meta===null&&t.cantidadProgramada===est.cantidad,'se guarda la intención «Todo el turno» con la cifra estimada, el ratio y la versión de parámetros (no como un pedido firme)');
  ok(/estimado/.test(historial(N)[0].referencia)&&historial(N)[0].modo==='TURNO'&&historial(N)[0].alcance==='TODO_TURNO','el historial identifica la cantidad como estimada');
  // supera el estimado: sigue vigente hasta el cierre
  const g=(prod)=>({programado:t.cantidadProgramada,producido:prod});
  const sobre=M.estadoPlan(t,g(est.cantidad+500));
  ok(!sobre.cumplida&&sobre.clave==='VIGENTE'&&/sigue vigente hasta el cierre confirmado/.test(sobre.nota),'Todo el turno: superar el estimado NO lo completa; continúa hasta el cierre confirmado');
  const fin=M.estadoPlan(Object.assign({},t,{estadoOperacion:{estado:'FINALIZADA'}}),g(est.cantidad-100));
  ok(fin.clave==='FINALIZADA'&&fin.texto==='Finalizada','se cierra con la finalización confirmada');
  // otro producto después de «Todo el turno»
  let er='';try{await M.guardar(fila({fecha:FECHA,turno:'NOCHE',marca:'Scala',presentacion:'Regular_380ml'}),{modo:'FIJA',cantidad:3000});}catch(x){er=x.message;}
  ok(/Todo el turno/.test(er)&&/tiempo restante/.test(er)&&items(N).length===1,'agregar otra marca a una línea con «Todo el turno»: se explica el conflicto y no se guarda');
  // revisión de parámetros: la cifra guardada no se reescribe
  sb.NS.tiemposDatos=()=>({reglas:[regla('rx','LIMPIEZA_INICIO',60)],ventanas:[],version:2,legacy:{cambioMin:null,fijoDiaMin:null,fijoNocheMin:null}});
  const rv=M.revisionTurno(items(N)[0]);
  ok(items(N)[0].estimado.cantidad===est.cantidad,'una actualización del catálogo no reescribe silenciosamente el estimado guardado');
}
/* ---------- 8) estado del plan: Completada vs estado operativo ---------- */
{
  const {M}=entorno([]);
  const p=est=>Object.assign(F('PET1',FECHA,'DÍA','Bells','Regular_625ml',2000,1200),{estadoOperacion:{estado:est}});
  const a=M.estadoPlan(p('PAUSA'),{programado:2000,producido:4080});
  ok(a.cumplida&&a.texto==='Completada'&&a.cls==='est-fin'&&a.operativo.texto==='En pausa'&&/distinto del estado de la línea/.test(a.nota),'programado 2,000 y producido 4,080 → Completada (verde) mientras la línea sigue «En pausa»');
  ok(M.estadoPlan(p('EN_PRODUCCION'),{programado:4000,producido:4770}).cumplida,'programado 4,000 y producido 4,770 → Completada');
  ok(!M.estadoPlan(p('EN_PRODUCCION'),{programado:2000,producido:null}).cumplida&&M.estadoPlan(p('EN_PRODUCCION'),{programado:2000,producido:null}).texto==='En producción','sin registro (dato ausente) no se marca Completada');
  ok(!M.estadoPlan(p('PENDIENTE'),{programado:2000,producido:1999}).cumplida&&M.estadoPlan(p('PENDIENTE'),{programado:2000,producido:1999}).cls==='est-pend','sin alcanzar la meta se conserva el estado operativo y su color');
  const fs=M.estadoPlan(p('FINALIZADA'),{programado:2000,producido:1500});
  ok(fs.clave==='FINALIZADA_CON_SALDO'&&/saldo 500/.test(fs.texto)&&!fs.cumplida,'finalizado con saldo: se presenta explícitamente, no como meta cumplida');
  ok(M.estadoPlan(p('CANCELADA'),{programado:2000,producido:5000}).clave==='CANCELADA','cancelada conserva su semántica');
  const html=M.htmlEstadoPlan(p('PAUSA'),{programado:2000,producido:4080,sobre:2080});
  ok(/Completada/.test(html)&&/Línea: En pausa/.test(html),'la celda muestra el cumplimiento y, aparte, el estado operativo');
  // completar cantidad: bloque vs meta global
  const c=Object.assign(F('PET1',FECHA,'NOCHE','Scala','Regular_380ml',6000,2184),{modo:'COMPLETAR',meta:{id:'m',total:24000,vinculos:[{cierre:'k',fecha:FECHA,bloque:'DÍA',producido:18000,asignado:18000}]}});
  const am=M.avanceMeta(c,{programado:6000,producido:3000});
  ok(am.previo===18000&&am.acumulado===21000&&Math.round(am.pct*1000)===875&&!am.cumplida,'meta global: lo vinculado de bloques anteriores + lo producido hoy frente a la meta (no se compara el bloque contra la meta global)');
  const ep=M.estadoPlan(c,{programado:6000,producido:6000});
  ok(ep.cumplida&&M.avanceMeta(c,{programado:6000,producido:6000}).cumplida&&/Meta global: 100 %/.test(M.htmlEstadoPlan(c,{programado:6000,producido:6000})),'Completar cantidad: cumplimiento del saldo del bloque y, aparte, de la meta global');
  ok(/Meta 24\.000|Meta 24,000/.test(M.htmlSubproducto(c,{}).replace(/ /g,' '))&&/Saldo del bloque 6\.000|Saldo del bloque 6,000/.test(M.htmlSubproducto(c,{}).replace(/ /g,' ')),'debajo del producto: Meta · Cierre anterior · Saldo del bloque, con datos reales');
  ok(/Meta estimada según ratio nominal/.test(M.htmlSubproducto(Object.assign(F('PET1',FECHA,'NOCHE','Bells','Regular_625ml',52000,1200),{modo:'TURNO',estimado:{cantidad:52000,ratio:2400}}),{})),'Todo el turno: «Meta estimada según ratio nominal»');
  ok(M.modoDe({})==='FIJA'&&M.modoDe(null)==='FIJA'&&M.modoDe({modo:'otro'})==='FIJA','las programaciones antiguas (sin modo) siguen siendo Cantidad fija');
}
/* ---------- 9) permisos, copia, exportación, separación de paradas ---------- */
{
  const consulta=entorno([],{usuario:{planifica:false}});
  let e='';try{await consulta.M.guardar(fila(),{modo:'FIJA',cantidad:1000});}catch(x){e=x.message;}
  ok(/Solo Planificación/.test(e)&&items(consulta.N).length===0,'consulta no puede guardar ni aplicar saldo');
  const regs=[cierreMan(18000)];
  const e2=entorno([Object.assign(F('PET1',AYER,'DÍA','Scala','Regular_380ml',6000,2184),{modo:'COMPLETAR',meta:{id:'m',total:24000,vinculos:[]}}),
    Object.assign(F('PET1',AYER,'NOCHE','Bells','Regular_625ml',5000,1200),{modo:'TURNO',estimado:{cantidad:5000}}),F('PET1',AYER,'DÍA','Bells','Regular_380ml',1000,2184)],{registros:regs});
  const pc=e2.NS.planCopia({modo:'DIA_ANTERIOR',fecha:FECHA});
  ok(pc.candidatos.length===1&&pc.omitidos.some(o=>/Completar cantidad: no se copia/.test(o.texto))&&pc.omitidos.some(o=>/Todo el turno: no se copia/.test(o.texto)),'copiar a otra fecha no reutiliza un cierre ya asignado ni una estimación ajena: exige revisar y volver a aplicar');
  const txt=entorno([Object.assign(F('PET1',FECHA,'NOCHE','Scala','Regular_380ml',6000,2184),{modo:'COMPLETAR',meta:{id:'m',total:24000,vinculos:[]}}),Object.assign(F('PET1',FECHA,'NOCHE','Bells','Regular_625ml',52000,1200),{modo:'TURNO'})]).NS.textoPlan(FECHA,'NOCHE');
  ok(/saldo de la meta 24/.test(txt)&&/todo el turno: estimado según ratio nominal/.test(txt),'el texto del plan conserva el modo y la semántica de las cantidades');
  const src=leer('js/produccion/66-planificacion-modos.js'),s64=leer('js/produccion/64-planificacion-avance.js');
  ok(!/avancesTurno|paradasOperativas|bitacoraMantenimiento|ratioReal|finalizarLinea|reanudar/i.test(src.replace(/\/\*[^]*?\*\//g,'').replace(/\/\/.*$/gm,'')),'ni los modos ni el estado del plan tocan paradas oficiales, el ratio real ni finalizan o reanudan la línea');
  ok(/Estado del plan/.test(leer('js/produccion/52-planificacion-pantalla.js'))&&/'Modo','Meta total/.test(s64)||/'Modo','Meta total \(UND\)'/.test(s64),'la tabla se llama «Estado del plan» y el Excel exporta modo, meta y estado operativo por separado');
  const html=leer('index.html');
  ok(html.indexOf('66-planificacion-modos.js')>html.indexOf('65d-planificacion-semanal.js'),'index.html carga 66 después del motor y la vista semanal');
}
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
