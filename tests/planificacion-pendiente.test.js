/* Planificación · «Completar cantidad» se guarda aunque el cierre siga pendiente y el saldo se calcula cuando el supervisor finaliza el registro:
   guardado pendiente, resolución central idempotente, avisos, correcciones/reapertura, fallos con reintento y permisos. Página real + nube falsa. */
const {nube,dispositivo,F,items,leer,clon}=require('./planificacion-harness');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const FECHA='2099-03-07',MANANA='2099-03-08';
const hora=h=>new Date(FECHA+'T'+h+':00').getTime();
const VEL={'PET1|Regular_625ml|Bells':2400,'PET1|Regular_380ml|Scala':3000};
const rec=(id,fecha,turno,estado,cuadros,act)=>({id,linea:'PET1',fecha,turno,estadoRegistro:estado,actualizadoEn:act||1000,cuadros});
const cu=(marca,pres,efectiva)=>({marca,presentacion:pres,produccion:{efectiva}});
const historial=N=>[...N.docs.entries()].filter(([k])=>k.startsWith('historialProgramacion/')).map(([,v])=>v);
const fila=(extra)=>Object.assign({linea:'PET1',fecha:MANANA,turno:'DÍA',marca:'Scala',presentacion:'Regular_380ml',upp:2184},extra||{});
const base={linea:'PET1',marca:'Scala',presentacion:'Regular_380ml'};
const META={ref:{fecha:FECHA,bloque:'NOCHE',cantidadVinculada:null},id:'meta_70',total:70000,referencia:'Pedido 70',vinculos:[]};
const PEND={modo:'COMPLETAR',cantidad:0,pendiente:true,motivoPendiente:'Todavía no hay registro del bloque de referencia.',meta:META};
const sembrarRegistros=(N,lista)=>N.docs.set('sync/records',{items:lista});

function conectar(N,usuario,opc){
  opc=opc||{};
  const sb=dispositivo(N,Object.assign({nombre:'Ana'},usuario||{}),{ahora:opc.ahora||hora('12:00')});
  sb.glacialVelocidadEstandar=(l,p,m)=>VEL[[l,p,m].join('|')]||0;
  sb.puedeEntrarPlanificacion=()=>true;
  sb.loadRecords=()=>{if(opc.errorLectura)throw new Error('sin permiso');return (N.docs.get('sync/records')||{items:[]}).items;};
  sb.normalizarCuadros=r=>r.cuadros||[];
  sb.PROD=opc.prod||{};sb.glacialProducidoVigente=p=>(p.clave in sb.PROD)?sb.PROD[p.clave]:null;
  sb.escuchar();
  return {sb,NS:sb.NS,M:sb.NS.modos};
}
function entorno(programaciones,registros,usuario,opc){
  const N=nube();
  N.docs.set('sync/programaciones',{items:programaciones||[]});
  N.docs.set('sync/catalogoPlanificacion',{items:[],tiempos:{reglas:[],ventanas:[],version:1}});
  sembrarRegistros(N,registros||[]);
  return Object.assign({N},conectar(N,usuario,opc));
}
const cierre52=(act)=>rec('rn',FECHA,'NOCHE','FINALIZADO',[cu('Scala','Regular_380ml',52000)],act||2000);

(async()=>{
/* ---------- 1) guardar sin cierre y persistir ---------- */
{
  const {N,M,NS}=entorno([],[]);
  const pl=M.planCompletar(Object.assign({},base,{fecha:MANANA,bloque:'DÍA',metaTotal:70000,ref:{fecha:FECHA,bloque:'NOCHE'},items:[],registros:[]}));
  ok(pl.ok&&pl.pendiente&&pl.saldo===null&&pl.metaTotal===70000&&!pl.completada,'sin cierre: se puede guardar, el saldo es «por calcular» (no cero ni la meta completa)');
  await M.guardar(fila(),PEND);
  const it=items(N)[0];
  ok(items(N).length===1&&it.modo==='COMPLETAR'&&it.cantidadProgramada===0&&it.meta.total===70000&&it.meta.resolucion.estado==='PENDIENTE_CIERRE'&&it.meta.ref.fecha===FECHA&&it.meta.ref.bloque==='NOCHE'&&it.meta.referencia==='Pedido 70','se guarda la meta, el producto, el bloque de referencia y la resolución «Pendiente de cierre» con cantidad 0');
  const h=historial(N);
  ok(h.length===1&&/pendiente de cierre/.test(h[0].referencia)&&h[0].modo==='COMPLETAR'&&h[0].uid==='uid-Ana','el historial registra la creación pendiente');
  // otro dispositivo / recarga: lee lo mismo
  const d2=conectar(N,{nombre:'Luis',extra:{rol:'Supervisor',linea:'PET1'},planifica:false});
  const leido=d2.NS.programaciones()[0];
  ok(leido&&leido.meta.resolucion.estado==='PENDIENTE_CIERRE'&&d2.NS.esPlanSinCantidad(leido)&&d2.NS.items(MANANA,'DÍA').length===1,'tras recargar o en otro dispositivo el plan pendiente sigue ahí');
  ok(NS.capacidadVigente(MANANA,'DÍA','PET1')===null,'una línea con solo un plan pendiente no calcula una capacidad vacía ni muestra «Cabe»');
  // editar preserva identidad
  const idAntes=it.id;
  await M.guardar(fila(),Object.assign({},PEND,{meta:Object.assign({},META,{referencia:'Pedido 71'})}),{versionEsperada:it.version});
  ok(items(N).length===1&&items(N)[0].id===idAntes&&items(N)[0].meta.referencia==='Pedido 71'&&items(N)[0].version===it.version+1,'editar la meta o las referencias conserva la identidad del plan (no duplica)');
  // el aspecto en la tabla
  ok(/Por calcular/.test(M.htmlCantidadSinSaldo(items(N)[0]))&&/Saldo por calcular/.test(M.htmlSubproducto(items(N)[0],null))&&/Pendiente de cierre/.test(M.htmlEstadoPlan(items(N)[0],null)),'la tabla muestra modo, meta, referencia y «Saldo por calcular / Pendiente de cierre»');
}
/* ---------- 2) registro abierto o reabierto: sigue pendiente y se explica ---------- */
{
  const {M}=entorno([],[]);
  const pl=r=>M.planCompletar(Object.assign({},base,{fecha:MANANA,bloque:'DÍA',metaTotal:70000,ref:{fecha:FECHA,bloque:'NOCHE'},items:[],registros:r}));
  ok(pl([rec('a',FECHA,'NOCHE','EN_REGISTRO',[cu('Scala','Regular_380ml',30000)])]).motivoPendiente.indexOf('abierto o reabierto')>=0&&pl([rec('a',FECHA,'NOCHE','REABIERTO',[cu('Scala','Regular_380ml',30000)])]).pendiente,'registro abierto o reabierto: pendiente con la explicación del estado');
  ok(pl(null).ok===false&&/No se pudieron leer los registros/.test(pl(null).errores.join(' '))&&!/No hay registro/.test(pl(null).errores.join(' ')),'un error de lectura muestra el error, no «no hay registro»');
}
/* ---------- 3 y 4) meta 70,000 + cierre 52,000 → 18,000; destino produjo 3,000 → pendiente 15,000 ---------- */
{
  const {N,sb,M,NS}=entorno([],[],{nombre:'Ana'});
  await M.guardar(fila(),PEND);
  const clave=items(N)[0].clave;
  sb.PROD[clave]=3000;                                     // el destino ya produjo 3,000
  sembrarRegistros(N,[cierre52()]);                        // el supervisor finaliza el registro de Noche
  ok(M.hayTrabajo(),'con el cierre confirmado hay algo que resolver');
  const r=await M.resolverPendientes();
  const it=items(N)[0];
  ok(r.cambios.length===1&&it.cantidadProgramada===18000&&it.meta.resolucion.estado==='SALDO_CALCULADO'&&it.meta.resolucion.producidoCierre===52000&&it.meta.resolucion.asignado===52000&&it.meta.total===70000,'meta 70,000 y cierre de 52,000 → asignación de 18,000 al destino (la meta sigue siendo 70,000)');
  ok(it.meta.vinculos.length===1&&it.meta.vinculos[0].asignado===52000&&it.paletasProgramadas===18000/2184&&it.meta.resolucion.cierreId&&it.meta.resolucion.calculadoPor==='Ana','guarda el vínculo, el id del cierre, quién calculó y las paletas del saldo');
  const R=NS.resumenBloque(MANANA,'DÍA').grupos.get('PET1|Scala|Regular_380ml');
  ok(R.programado===18000&&R.producido===3000&&R.pendiente===15000,'el destino ya produjo 3,000: asignación 18,000, producido 3,000 y pendiente 15,000 (sin descontar dos veces)');
  const h=historial(N);
  ok(h.length===2&&/saldo calculado/.test(h[1].referencia)&&h[1].anterior.resolucion==='PENDIENTE_CIERRE'&&h[1].nuevo.resolucion==='SALDO_CALCULADO'&&h[1].nuevo.cantidad===18000&&h[1].meta.cierreId===it.meta.resolucion.cierreId,'el historial deja anterior/nuevo, meta, cierre y la resolución');
  ok(M.estadoPlan(it,R).texto!=='Completada'&&M.resolucionDe(it).texto==='Saldo calculado','la resolución del saldo no sustituye el estado operativo ni el cumplimiento');
  // aviso
  const av=it.meta.resolucion.aviso;
  ok(/PET 1 · Scala/.test(av.texto)&&/Meta total: 70\.000|Meta total: 70,000/.test(av.texto.replace(/ /g,' '))&&/confirmó: 52\.000|confirmó: 52,000/.test(av.texto.replace(/ /g,' '))&&/debe completar: 18\.000|debe completar: 18,000/.test(av.texto.replace(/ /g,' '))&&/Pendiente actual: 15\.000|Pendiente actual: 15,000/.test(av.texto.replace(/ /g,' '))&&av.tipo==='SALDO_RESUELTO'&&av.fecha===MANANA&&av.bloque==='DÍA','el aviso lleva meta, cierre, fecha y bloque destino, saldo y el pendiente actual del destino');
  /* ---------- 6) doble evento / reintento: sin duplicar ---------- */
  const r2=await M.resolverPendientes();
  const r3=await Promise.all([M.resolverPendientes(),M.resolverPendientes()]);
  ok(r2.cambios.length===0&&r3.every(x=>x.cambios.length===0)&&historial(N).length===2&&items(N)[0].version===it.version&&items(N)[0].meta.resolucion.aviso.id===av.id,'el mismo cierre y versión no se aplica dos veces: sin nuevo historial, sin nueva versión y sin otro aviso');
  /* ---------- 8) reapertura, corrección, destino iniciado/cerrado ---------- */
  sembrarRegistros(N,[rec('rn',FECHA,'NOCHE','REABIERTO',[cu('Scala','Regular_380ml',52000)],3000)]);
  const r4=await M.resolverPendientes();
  const it4=items(N)[0];
  ok(r4.cambios.length===1&&it4.meta.resolucion.estado==='REQUIERE_REVISION'&&it4.meta.resolucion.codigo==='REFERENCIA_REABIERTA'&&it4.cantidadProgramada===18000&&/Último saldo calculado, referencia reabierta/.test(M.htmlSubproducto(it4,null)),'referencia reabierta: conserva el último saldo con la etiqueta «Último saldo calculado, referencia reabierta», sin presentarlo como definitivo');
  sembrarRegistros(N,[rec('rn',FECHA,'NOCHE','FINALIZADO',[cu('Scala','Regular_380ml',50000)],4000)]);
  const r5=await M.resolverPendientes();
  const it5=items(N)[0];
  ok(r5.cambios.length===1&&it5.cantidadProgramada===20000&&it5.meta.resolucion.estado==='SALDO_CALCULADO'&&it5.meta.resolucion.aviso.tipo==='ACTUALIZACION'&&it5.meta.resolucion.aviso.id!==av.id&&/debe completar: 20/.test(it5.meta.resolucion.aviso.texto.replace(/ /g,' ').replace(',','.')),'el cierre corregido (50,000) actualiza el saldo (20,000), deja historial y genera un aviso de actualización identificable');
  // el mismo cierre re-finalizado con la misma producción no genera aviso nuevo
  sembrarRegistros(N,[rec('rn',FECHA,'NOCHE','REABIERTO',[cu('Scala','Regular_380ml',50000)],5000)]);await M.resolverPendientes();
  sembrarRegistros(N,[rec('rn',FECHA,'NOCHE','FINALIZADO',[cu('Scala','Regular_380ml',50000)],6000)]);await M.resolverPendientes();
  ok(items(N)[0].cantidadProgramada===20000&&items(N)[0].meta.resolucion.estado==='SALDO_CALCULADO'&&items(N)[0].meta.resolucion.aviso.id===it5.meta.resolucion.aviso.id,'reabrir y volver a finalizar con la misma producción no repite el aviso');
  // nuevo saldo menor que lo producido → revisión (no se reduce por debajo de lo producido)
  sb.PROD[clave]=21000;
  sembrarRegistros(N,[rec('rn',FECHA,'NOCHE','FINALIZADO',[cu('Scala','Regular_380ml',60000)],7000)]);
  await M.resolverPendientes();
  const it6=items(N)[0];
  ok(it6.meta.resolucion.codigo==='SALDO_MENOR_PRODUCIDO'&&it6.cantidadProgramada===20000&&it6.meta.resolucion.propuesta.saldo===10000,'saldo menor que lo producido en el destino: requiere revisión y no se reduce el plan por debajo de lo producido');
}
{
  // destino cerrado y plan cambiado por otra persona
  const {N,sb,M}=entorno([],[]);
  await M.guardar(fila(),PEND);
  sembrarRegistros(N,[cierre52()]);await M.resolverPendientes();
  const clave=items(N)[0].clave;
  // otra persona edita el plan después del cálculo
  const docs=N.docs.get('sync/programaciones');docs.items[0].version+=1;docs.items[0].cantidadProgramada=17000;N.docs.set('sync/programaciones',docs);
  sembrarRegistros(N,[rec('rn',FECHA,'NOCHE','FINALIZADO',[cu('Scala','Regular_380ml',48000)],9000)]);
  await M.resolverPendientes();
  ok(items(N)[0].meta.resolucion.codigo==='PLAN_CAMBIADO'&&items(N)[0].cantidadProgramada===17000,'el plan que cambió otra persona no se sobrescribe en silencio: queda «Requiere revisión» con la diferencia');
  const e2=entorno([],[]);
  await e2.M.guardar(fila(),PEND);
  sembrarRegistros(e2.N,[cierre52()]);await e2.M.resolverPendientes();
  const d=e2.N.docs.get('sync/programaciones');d.items[0].estadoOperacion={estado:'FINALIZADA'};e2.N.docs.set('sync/programaciones',d);
  sembrarRegistros(e2.N,[rec('rn',FECHA,'NOCHE','FINALIZADO',[cu('Scala','Regular_380ml',40000)],9000)]);
  await e2.M.resolverPendientes();
  ok(items(e2.N)[0].meta.resolucion.codigo==='DESTINO_CERRADO'&&items(e2.N)[0].cantidadProgramada===18000,'destino ya cerrado: no se sobrescribe, se presenta la diferencia como «Requiere revisión»');
}
/* ---------- 5) con Planificación cerrada: la ruta del supervisor ---------- */
{
  const N=nube();
  N.docs.set('sync/programaciones',{items:[]});N.docs.set('sync/catalogoPlanificacion',{items:[],tiempos:{reglas:[],ventanas:[],version:1}});sembrarRegistros(N,[]);
  const plan=conectar(N,{nombre:'Ana'});
  await plan.M.guardar(fila(),PEND);
  const sup=conectar(N,{nombre:'Luis',extra:{rol:'Supervisor',linea:'PET1'},planifica:false});
  ok(!sup.NS.puede()&&sup.M.actorValido(),'el supervisor no edita Planificación pero sí puede ejecutar la actualización acotada');
  sembrarRegistros(N,[cierre52()]);                        // el supervisor finaliza el registro (cualquier ruta que deje estadoRegistro = FINALIZADO)
  const r=await sup.M.reconciliar(false);
  ok(r&&r.cambios.length===1&&items(N)[0].cantidadProgramada===18000&&items(N)[0].meta.resolucion.calculadoPor==='Luis','la actualización se dispara desde el dispositivo del supervisor, sin que nadie tenga Planificación abierta');
  ok(historial(N).length===2&&historial(N)[1].usuario==='Luis','el historial identifica quién disparó el cálculo');
  /* ---------- 7) fallo de la actualización derivada: el cierre se conserva y se recupera ---------- */
  const N2=nube();
  N2.docs.set('sync/programaciones',{items:[]});N2.docs.set('sync/catalogoPlanificacion',{items:[],tiempos:{reglas:[],ventanas:[],version:1}});sembrarRegistros(N2,[]);
  const a=conectar(N2,{nombre:'Ana'});await a.M.guardar(fila(),PEND);
  sembrarRegistros(N2,[cierre52()]);
  N2.falla=true;
  const antes=JSON.stringify(N2.docs.get('sync/records'));
  const rf=await a.M.reconciliar(true);
  ok(rf===null&&a.M.fallo&&/sin red/.test(a.M.fallo.mensaje)&&a.M.fallo.intentos===1&&JSON.stringify(N2.docs.get('sync/records'))===antes&&items(N2)[0].cantidadProgramada===0,'si falla la actualización derivada: el cierre queda guardado, el plan sigue pendiente y se registra el fallo');
  ok(/No se pudo actualizar el saldo/.test(a.M.htmlSubproducto(items(N2)[0],null))&&/data-plan-recalc/.test(a.M.htmlSubproducto(items(N2)[0],null)),'la fila avisa que no se pudo actualizar (sin decir que el cierre se perdió) y ofrece Reintentar');
  ok(await a.M.reconciliar(false)===null,'mientras corre la espera creciente no se reintenta en cada cambio');
  N2.falla=false;
  const rr=await a.M.reconciliar(true);
  ok(rr&&rr.cambios.length===1&&a.M.fallo===null&&items(N2)[0].cantidadProgramada===18000,'al volver la conexión el reintento resuelve el saldo y limpia el fallo');
}
/* ---------- 9, 10, 11, 12) productos equivalentes, noche, meta alcanzada, cero legítimo, cierre sin producto ---------- */
{
  const {M}=entorno([],[]);
  const c=(cuadros,extra)=>M.cierreReferencia(Object.assign({registros:[rec('x',FECHA,'NOCHE','FINALIZADO',cuadros)],linea:'PET1',fecha:FECHA,bloque:'NOCHE',marca:'Scala',presentacion:'Regular_380ml'},extra||{}));
  ok(c([cu('  SCALA ','regular 380ML',7000)]).producido===7000&&c([cu('Scala','Regular_625ml',9000)]).producido===0&&c([cu('Scala','Regular_625ml',9000)]).productoEnCierre===false,'un producto equivalente (mayúsculas, espacios, guion bajo) cuenta; un formato distinto no se combina');
  ok(c([cu('Scala','Regular_380ml',0)]).productoEnCierre===true&&c([cu('Scala','Regular_380ml',0)]).producido===0&&c([cu('Bells','Regular_380ml',3000)]).productoEnCierre===false&&c([cu('','',4000)]).estado==='NO_IDENTIFICABLE','cero elegible confirmado, cierre sin el producto y registro incompleto son casos distintos');
  const pl=(prod,total)=>M.planCompletar(Object.assign({},base,{fecha:MANANA,bloque:'DÍA',metaTotal:total,ref:{fecha:FECHA,bloque:'NOCHE'},items:[],registros:[rec('x',FECHA,'NOCHE','FINALIZADO',[cu('Scala','Regular_380ml',prod)])]}));
  ok(pl(75000,70000).completada&&pl(75000,70000).saldo===0&&pl(75000,70000).sobre===5000&&pl(0,70000).saldo===70000,'producción previa que supera la meta: saldo cero y «Meta completada»; un cero legítimo deja toda la meta');
}
{
  // meta alcanzada al resolver: plan conservado con cantidad 0 y aviso de meta completada
  const {N,M,NS}=entorno([],[]);
  await M.guardar(fila(),PEND);
  sembrarRegistros(N,[rec('rn',FECHA,'NOCHE','FINALIZADO',[cu('Scala','Regular_380ml',72000)],2000)]);
  await M.resolverPendientes();
  const it=items(N)[0];
  ok(it.cantidadProgramada===0&&it.meta.resolucion.estado==='META_COMPLETADA'&&/Meta completada: no hay saldo/.test(it.meta.resolucion.aviso.texto)&&NS.capacidadVigente(MANANA,'DÍA','PET1')===null&&NS.items(MANANA,'DÍA').length===1,'meta alcanzada: el plan se conserva con cantidad 0, sin orden productiva ficticia y con su aviso');
  // lectura con error: no cambia nada
  const err=conectar(N,{nombre:'Zoe'},{errorLectura:true});
  ok(err.M.registros()===null&&!err.M.hayTrabajo(),'error de lectura de los registros: no se decide nada ni se muestra «sin registro»');
}
/* ---------- 13) varios bloques: cada cierre una sola vez, sin exceder asignaciones ---------- */
{
  const regs=[rec('rd',FECHA,'DÍA','FINALIZADO',[cu('Scala','Regular_380ml',18000)],1000),rec('rn',FECHA,'NOCHE','FINALIZADO',[cu('Scala','Regular_380ml',30000)],2000)];
  const {N,M}=entorno([],[]);
  // cadena: Noche (ref Día) y día siguiente (ref Noche), ambos pendientes al guardarse
  await M.guardar(fila({fecha:FECHA,turno:'NOCHE'}),Object.assign({},PEND,{meta:Object.assign({},META,{ref:{fecha:FECHA,bloque:'DÍA',cantidadVinculada:null}})}));
  await M.guardar(fila({fecha:MANANA,turno:'DÍA'}),Object.assign({},PEND,{meta:Object.assign({},META,{ref:{fecha:FECHA,bloque:'NOCHE',cantidadVinculada:null}})}));
  ok(items(N).length===2&&items(N).every(p=>p.meta.resolucion.estado==='PENDIENTE_CIERRE'),'dos bloques encadenados se guardan pendientes');
  sembrarRegistros(N,[regs[1]]);await M.resolverPendientes();
  ok(items(N).every(p=>p.meta.resolucion.estado==='PENDIENTE_CIERRE'),'el segundo bloque espera a que el primero tenga su saldo (no se olvida lo producido antes)');
  sembrarRegistros(N,regs);await M.resolverPendientes();
  const noche=items(N).find(p=>p.turno==='NOCHE'),dia=items(N).find(p=>p.fecha===MANANA);
  ok(noche.cantidadProgramada===52000&&dia.meta.vinculos.length===2&&dia.cantidadProgramada===22000&&dia.meta.resolucion.asignado===48000,'tres bloques: el último descuenta lo vinculado de TODOS los anteriores, cada cierre una vez (70,000 − 18,000 − 30,000 = 22,000)');
  // otro compromiso no puede usar el mismo cierre sobre lo ya asignado
  const otra=M.planCompletar(Object.assign({},base,{fecha:MANANA,bloque:'DÍA',metaTotal:30000,ref:{fecha:FECHA,bloque:'DÍA'},cantidadVinculada:5000,items:items(N),registros:regs,metaIdActual:'otra'}));
  ok(!otra.ok&&/excede la producción elegible/.test(otra.errores.join(' ')),'otra meta no puede vincular un cierre ya asignado por encima de lo producido');
}
/* ---------- 14) capacidad pendiente ---------- */
{
  const {N,M,NS}=entorno([F('PET1',MANANA,'DÍA','Bells','Regular_625ml',9600,1200)],[]);
  N.docs.set('sync/catalogoPlanificacion',{items:[],tiempos:{reglas:[{id:'r1',linea:'PET1',tipo:'CAMBIO_MARCA',minutos:20,activo:true,aplica:'',origen:null,destino:null,descripcion:'',actualizadoEn:1},{id:'r2',linea:'PET1',tipo:'CAMBIO_FORMATO',minutos:15,activo:true,aplica:'',origen:null,destino:null,descripcion:'',actualizadoEn:1}],ventanas:[],version:1}});
  await M.guardar(fila(),PEND);
  const c=NS.capacidadVigente(MANANA,'DÍA','PET1');
  ok(c&&c.productos.length===1&&c.productos[0].marca==='Bells'&&c.estado!=='INCOMPLETA','una línea con otros productos conocidos conserva su desglose calculable (el pendiente no cuenta como cero ni entra en el total)');
  const h=M.htmlCapacidadPendiente(MANANA,'DÍA');
  ok(/1 plan con saldo pendiente de cierre/.test(h)&&/saldo <b>por calcular<\/b>/.test(h)&&/Estimación máxima provisional/.test(h)&&/No es asignación confirmada ni producción real/.test(h),'las tarjetas dicen cuántos planes tienen saldo pendiente y la estimación provisional con la meta completa está etiquetada como tal');
  const sinVel=entorno([],[],{nombre:'Ana'});
  sinVel.sb.glacialVelocidadEstandar=()=>0;
  await sinVel.M.guardar(fila(),PEND);
  ok(!/Estimación máxima provisional/.test(sinVel.M.htmlCapacidadPendiente(MANANA,'DÍA'))&&/por calcular/.test(sinVel.M.htmlCapacidadPendiente(MANANA,'DÍA')),'sin ratio no hay estimación provisional (no se inventa)');
  const rs=M.resumenModos(items(N));
  ok(rs.pendientes===1&&rs.metas===1,'el resumen cuenta los planes con saldo pendiente');
}
/* ---------- 15) permisos y rutas derivadas ---------- */
{
  const {N,M}=entorno([],[]);
  await M.guardar(fila(),PEND);
  sembrarRegistros(N,[cierre52()]);
  const compartida=conectar(N,{nombre:'Mant',extra:{rol:'mantenimiento_compartido'}});compartida.sb.esMantCompartido=u=>u.rol==='mantenimiento_compartido';
  const consulta=conectar(N,{nombre:'Gen',extra:{rol:'Gerente General'},planifica:false});consulta.sb.esUsuarioSoloConsulta=u=>u.rol==='Gerente General';
  const vista=conectar(N,{nombre:'Vis'});vista.sb.glacialVista={activo:()=>true};
  const sinRed=conectar(N,{nombre:'Off'});sinRed.sb.glacialEstadoDatos={enLinea:false};
  ok(!compartida.M.actorValido()&&!consulta.M.actorValido()&&!vista.M.actorValido()&&!sinRed.M.actorValido(),'la cuenta compartida, la consulta, el modo visualización y sin conexión no ejecutan la actualización');
  ok(await consulta.M.reconciliar(true)===null&&items(N)[0].cantidadProgramada===0,'un usuario de consulta no cambia ningún plan aunque llame la función');
  let e='';try{M.verificarAcotado({a:1,cantidadProgramada:0,meta:{}},{a:2,cantidadProgramada:5,meta:{}});}catch(x){e=x.message;}
  ok(/solo puede cambiar la cantidad y la meta/.test(e)&&(()=>{try{M.verificarAcotado({a:1,cantidadProgramada:0,meta:{}},{a:1,cantidadProgramada:5,meta:{x:1},version:3,actualizadoPor:'x',actualizadoEn:1,paletasProgramadas:2});return true;}catch(_){return false;}})(),'la actualización automática solo puede tocar cantidad, paletas, meta, versión y autor (el servicio lo verifica)');
}
/* ---------- 16) aviso al supervisor ---------- */
{
  const N=nube();
  N.docs.set('sync/programaciones',{items:[]});N.docs.set('sync/catalogoPlanificacion',{items:[],tiempos:{reglas:[],ventanas:[],version:1}});sembrarRegistros(N,[]);
  const ana=conectar(N,{nombre:'Ana'});
  await ana.M.guardar(fila(),PEND);sembrarRegistros(N,[cierre52()]);await ana.M.resolverPendientes();
  const supOk=conectar(N,{nombre:'Luis',extra:{rol:'Supervisor',linea:'PET1'},planifica:false});
  const supOtra=conectar(N,{nombre:'Eva',extra:{rol:'Supervisor',linea:'B7L'},planifica:false});
  const planif=conectar(N,{nombre:'Plan'});
  const tex=v=>v.NS.avisos().map(a=>a.texto).join(' | ').replace(/ /g,' ');
  const a1=supOk.NS.avisos().find(a=>a.tipo==='plan');
  ok(a1&&a1.linea==='PET1'&&a1.fecha===MANANA&&a1.bloque==='DÍA'&&/debe completar: 18[.,]000/.test(a1.texto)&&/confirmó: 52[.,]000/.test(a1.texto),'el supervisor de la línea destino recibe el aviso con detalle, fecha y bloque (para «Ver programación»)');
  ok(!supOtra.NS.avisos().some(a=>a.tipo==='plan')&&planif.NS.avisos().some(a=>a.tipo==='plan'),'otro supervisor no lo recibe; quien planifica sí (no se envía a todo el personal)');
  ok(supOk.NS.avisos().filter(a=>a.tipo==='plan').length===1,'un solo aviso por cierre (idempotente)');
  const s46=leer('js/produccion/46-proyeccion-avisos.js');
  ok(/x\.tipo==='plan'/.test(s46)&&/irAProgramacion/.test(s46)&&/tiene\('planificacion'\)/.test(s46),'el Centro de avisos entiende el tipo «plan», abre la programación y también alcanza a quien planifica');
  supOk.NS.irAProgramacion(MANANA,'DÍA');
  ok(supOk.NS.estado.fecha===MANANA&&supOk.NS.estado.tab==='programacion','«Ver programación» lleva a la fecha y bloque del plan');
}
/* ---------- fuentes ---------- */
{
  const s66=leer('js/produccion/66-planificacion-modos.js'),s51=leer('js/produccion/51-planificacion-nucleo.js'),s16=leer('js/produccion/16-paletas.js'),s52=leer('js/produccion/52-planificacion-pantalla.js');
  ok(/Guardar pendiente de cierre/.test(s66)&&/Puedes guardar la programación\. El saldo se calculará cuando se confirme el cierre del bloque de referencia\./.test(s66)&&/Por calcular/.test(s66),'el formulario ofrece «Guardar pendiente de cierre» con el mensaje y «Por calcular» aprobados');
  ok(/conservarCero/.test(s16)&&/permitirCero/.test(s51)&&/esPlanSinCantidad/.test(s51)&&/data-plan-recalc/.test(s52),'el esquema admite un plan sin saldo sin romper lo anterior y la tabla ofrece «Actualizar saldo»');
  ok(!/avancesTurno|paradasOperativas|ratioReal/i.test(s66.replace(/\/\*[^]*?\*\//g,'').replace(/\/\/.*$/gm,'')),'no toca paradas oficiales ni el ratio real');
}
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
