/* Planificación · etapa 3: capacidad por línea y bloque (cada tiempo se cuenta una vez; «Estimación incompleta» si falta un dato), secuencia con horas
   (un producto repetido no duplica su cantidad), traslado de saldo (una transacción, saldo comprobado, historial) y tiempos previstos del Catálogo. */
const vm=require('vm');
const {nube,dispositivo,F,items,leer,clon}=require('./planificacion-harness');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const FECHA='2099-03-07';
const hora=h=>new Date(FECHA+'T'+h+':00').getTime();
const historial=N=>[...N.docs.entries()].filter(([k])=>k.startsWith('historialProgramacion/')).map(([,v])=>v);
const compromisos=N=>[...N.docs.entries()].filter(([k])=>k.startsWith('compromisosProgramacion/'));
const VEL={'PET1|Regular_625ml|Bells':2400,'PET1|Regular_380ml|Scala':3000,'PET2|Regular_625ml|Bells':3000};
const hhmm=ms=>new Date(ms).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false});

function entorno(programaciones,tiempos,opc){
  const N=nube();
  N.docs.set('sync/programaciones',{items:programaciones});
  N.docs.set('sync/catalogoPlanificacion',{items:[{id:'cat1',linea:'PET1',marca:'Bells',presentacion:'Regular_625ml',unidadesPorPaleta:1200,activo:true}],tiempos:tiempos===undefined?{cambioMin:30,fijoDiaMin:90,fijoNocheMin:60}:tiempos,updatedAt:1});
  const sb=dispositivo(N,Object.assign({nombre:'Ana'},opc&&opc.usuario||{}),{ahora:opc&&opc.ahora||hora('12:00')});
  sb.glacialVelocidadEstandar=(l,p,m)=>VEL[[l,p,m].join('|')]||0;
  sb.puedeEntrarPlanificacion=()=>true;
  sb.escuchar();
  return {N,sb,NS:sb.NS};
}
const pr=(l,t,m,p,c,u,extra)=>F(l,FECHA,t,m,p,c,u||1200,extra);

(async()=>{
/* ---------- duración y tiempos ---------- */
{
  const {NS}=entorno([],undefined);
  ok(NS.duracionBloqueMin('DÍA')===720&&NS.duracionBloqueMin('NOCHE')===600,'duración real del bloque según la configuración: Día 07:00–19:00 = 12 h; Noche 21:00–07:00 = 10 h (cruza medianoche)');
  ok(NS.tiemposDe('DÍA').paradasMin===90&&NS.tiemposDe('NOCHE').paradasMin===60&&NS.tiemposDe('DÍA').cambioMin===30,'tiempos previstos leídos del documento del catálogo');
  ok(NS.textoDuracion(630)==='10 h 30 min'&&NS.textoDuracion(-120)==='-2 h 00 min','formato de duraciones');
}

/* ---------- capacidad ---------- */
{
  const base=(bells,scala)=>[pr('PET1','DÍA','Bells','Regular_625ml',bells),pr('PET1','DÍA','Scala','Regular_380ml',scala,2184)];
  let {NS}=entorno(base(12000,6000),undefined);
  let c=NS.capacidadLinea(FECHA,'DÍA','PET1');
  ok(c.produccionMin===420&&c.cambios===1&&c.cambiosMin===30&&c.disponibleMin===630&&c.requeridoMin===450&&c.holguraMin===180&&Math.round(c.cargaPct)===71&&c.estado==='CABE','12 000 a 2 400/h (5 h) + 6 000 a 3 000/h (2 h) = 420 min + 1 cambio de 30 = 450 de 630 disponibles (720 − 90 de paradas): carga 71 %, cabe');
  ok(c.disponibleMin===c.duracionMin-90&&c.requeridoMin===c.produccionMin+c.cambiosMin,'cada tiempo se cuenta UNA vez: las paradas solo restan del disponible y los cambios solo suman al requerido');
  c=entorno(base(24000,6000),undefined).NS.capacidadLinea(FECHA,'DÍA','PET1');
  ok(c.estado==='EXCESO'&&c.holguraMin===-120&&c.requeridoMin===750,'plan que excede el tiempo disponible: «No cabe» con exceso de 2 h');
  c=entorno(base(19000,6000),undefined).NS.capacidadLinea(FECHA,'DÍA','PET1');
  ok(c.estado==='JUSTO'&&c.cargaPct>=95&&c.cargaPct<=100,'carga entre 95 % y 100 %: «Justo»');
  // falta una velocidad
  const e=entorno([pr('PET1','DÍA','Bells','Regular_625ml',12000),pr('B7L','DÍA','Fontlife','7 Litros',2000,100)],undefined);
  c=e.NS.capacidadLinea(FECHA,'DÍA','B7L');
  ok(c.estado==='INCOMPLETA'&&c.cargaPct===null&&c.faltantes[0].dato==='velocidad estándar'&&c.faltantes[0].marca==='Fontlife','producto sin velocidad estándar: «Estimación incompleta», sin carga inventada, indica qué dato falta');
  ok(e.NS.capacidadLinea(FECHA,'DÍA','PET1').estado==='CABE','una línea incompleta no afecta a las demás');
  ok(e.NS.capacidadLinea(FECHA,'DÍA','PET2')===null,'una línea sin programación no tiene capacidad que estimar');
  // sin tiempos configurados
  c=entorno(base(12000,6000),{}).NS.capacidadLinea(FECHA,'DÍA','PET1');
  ok(c.estado==='INCOMPLETA'&&c.cargaPct===null&&c.faltantes.some(x=>/cambio/.test(x.dato)),'sin tiempos de cambio configurados y con un cambio de producto: «Estimación incompleta» que dice qué falta (etapa 4: no se inventa ni se asume cero)');
  c=entorno([pr('PET1','DÍA','Bells','Regular_625ml',12000)],{}).NS.capacidadLinea(FECHA,'DÍA','PET1');
  ok(c.estado==='CABE'&&c.cambios===0&&c.disponibleMin===720,'un solo producto no necesita tiempo de cambio: con configuración vacía se calcula solo la producción contra la duración')
  // noche
  c=entorno([pr('PET2','NOCHE','Bells','Regular_625ml',9000)],undefined).NS.capacidadLinea(FECHA,'NOCHE','PET2');
  ok(c.duracionMin===600&&c.paradasMin===60&&c.disponibleMin===540&&c.produccionMin===180&&c.cambios===0,'Noche: 600 − 60 = 540 min disponibles; un solo producto no tiene cambios');
  // cancelada no cuenta; Día + Intermedio se suman
  c=entorno([pr('PET1','DÍA','Bells','Regular_625ml',6000),pr('PET1','INTERMEDIO','Bells','Regular_625ml',6000),pr('PET1','DÍA','Scala','Regular_380ml',9000,2184,{estadoOperacion:{estado:'CANCELADA'}})],undefined).NS.capacidadLinea(FECHA,'DÍA','PET1');
  ok(c.productos.length===1&&c.productos[0].cantidad===12000&&c.cambios===0,'Día + Intermedio del mismo producto suman 12 000 (un solo producto) y la fila cancelada no cuenta');
  ok(entorno(base(12000,6000),undefined).NS.cargaCelda(FECHA,'DÍA','PET1').estado==='CABE'&&e.NS.cargaCelda(FECHA,'DÍA','B7L')===null,'carga para la vista semanal: número solo cuando la estimación está completa');
}

/* ---------- secuencia ---------- */
{
  const tr=(id,orden,tipoFin,extra)=>Object.assign({id,orden,tipoFin,horaFin:'',cantidadObjetivo:0,creadoEn:orden},extra||{});
  const bells=pr('PET1','DÍA','Bells','Regular_625ml',12000,1200,{tramosSecuencia:[tr('t2',2,'CANTIDAD',{cantidadObjetivo:12000})]});
  const scala=pr('PET1','DÍA','Scala','Regular_380ml',6000,2184,{tramosSecuencia:[tr('t1',1,'HORA',{horaFin:'08:00'}),tr('t3',3,'CIERRE')]});
  const {NS}=entorno([bells,scala],undefined);
  const s=NS.secuenciaLinea(FECHA,'DÍA','PET1');
  ok(s.tramos.length===3&&s.tramos.map(t=>t.marca).join()==='Scala,Bells,Scala','SCALA → BELLS → SCALA: tres tramos en orden');
  const q=s.tramos.map(t=>Math.round(t.qty));
  ok(q[0]===3000&&q[1]===12000&&q[2]===3000&&q[0]+q[2]===6000,'SCALA reparte 6 000 entre sus dos tramos (3 000 + 3 000): su cantidad NO se duplica');
  ok(hhmm(s.tramos[0].inicioMs)==='07:00'&&hhmm(s.tramos[0].finMs)==='08:00'&&hhmm(s.tramos[1].inicioMs)==='08:30'&&hhmm(s.tramos[1].finMs)==='13:30'&&hhmm(s.tramos[2].inicioMs)==='14:00'&&hhmm(s.tramos[2].finMs)==='15:00','horas estimadas con 30 min de cambio entre productos distintos: 07:00–08:00, 08:30–13:30, 14:00–15:00');
  ok(hhmm(s.finEstimadoMs)==='15:00'&&!s.incompleta&&s.avisos.length===0&&s.sinTramo.length===0,'fin estimado 15:00, sin avisos');
  ok(NS.capacidadLinea(FECHA,'DÍA','PET1').cambios===2,'con secuencia, los cambios son los de la secuencia (2) y no «productos − 1»');
  // sin velocidad → incompleta
  const sinVel=entorno([pr('B7L','DÍA','Fontlife','7 Litros',2000,100,{tramosSecuencia:[tr('t1',1,'CIERRE')]})],undefined).NS.secuenciaLinea(FECHA,'DÍA','B7L');
  ok(sinVel.incompleta&&sinVel.tramos[0].estimado===false&&/velocidad/.test(sinVel.tramos[0].motivo),'tramo sin velocidad estándar: «Estimación incompleta» y no se inventan horas');
  // producto sin tramo y exceso del bloque
  const largo=pr('PET1','DÍA','Bells','Regular_625ml',40000,1200,{tramosSecuencia:[tr('t1',1,'CIERRE')]});
  const extra=pr('PET1','DÍA','Scala','Regular_380ml',6000,2184);
  const s2=entorno([largo,extra],undefined).NS.secuenciaLinea(FECHA,'DÍA','PET1');
  ok(s2.sinTramo.length===1&&s2.sinTramo[0].marca==='Scala'&&s2.avisos.some(a=>/después del fin del bloque/.test(a)),'un producto sin tramo se informa y una secuencia que pasa del fin del bloque lo avisa');
  ok(entorno([pr('PET1','DÍA','Bells','Regular_625ml',1000)],undefined).NS.secuenciaLinea(FECHA,'DÍA','PET1')===null,'sin tramos definidos no hay secuencia (no se inventa un orden)');
  const noche=pr('PET2','NOCHE','Bells','Regular_625ml',3000,1200,{tramosSecuencia:[tr('t1',1,'HORA',{horaFin:'23:00'}),tr('t2',2,'CIERRE')]});
  const sn=entorno([noche],undefined).NS.secuenciaLinea(FECHA,'NOCHE','PET2');
  ok(hhmm(sn.tramos[0].inicioMs)==='21:00'&&hhmm(sn.tramos[0].finMs)==='23:00'&&Math.round(sn.tramos[0].qty)===3000&&Math.round(sn.tramos[1].qty)===0,'Noche arranca a las 21:00 y respeta la fecha operativa (tramo hasta 23:00 produce lo programado)');
}

/* ---------- saldo y traslado ---------- */
{
  const progs=()=>[pr('PET1','DÍA','Bells','Regular_625ml',10000,1200,{version:1})];
  const e=entorno(progs(),undefined);const {N,sb,NS}=e;
  const prod={v:6500};sb.glacialProducidoVigente=()=>prod.v;
  const it=()=>NS.existente('PET1',FECHA,'DÍA','Bells','Regular_625ml');
  let s=NS.saldoDe(it());
  ok(s.programado===10000&&s.producido===6500&&s.saldo===3500&&s.max===3500,'saldo comprobado = programado − producido oficial (10 000 − 6 500 = 3 500)');
  prod.v=null;s=NS.saldoDe(it());
  ok(s.error&&/no se puede comprobar/.test(s.error),'sin registro de producción no se puede comprobar el saldo (no se asume cero)');prod.v=6500;
  const intento=async o=>{try{await NS.trasladarSaldo(Object.assign({trasladoId:'tt'+Math.random().toString(36).slice(2),item:it(),destFecha:FECHA,destTurno:'NOCHE',cantidad:3500,motivo:'Falta de preformas'},o||{}));return '';}catch(x){return x.message;}};
  ok(/motivo/i.test(await intento({motivo:'x'}))&&/otro bloque/.test(await intento({destTurno:'DÍA'}))&&/entero/.test(await intento({cantidad:0}))&&/3[.,]500/.test(await intento({cantidad:4000})),'validaciones: motivo, destino distinto, cantidad entera y no mayor que el saldo');
  ok(items(N)[0].cantidadProgramada===10000&&historial(N).length===0,'ninguna validación fallida escribe nada');
  const antes=N.confirmaciones();
  const info=await NS.trasladarSaldo({trasladoId:'t'+Math.random().toString(36).slice(2),item:it(),destFecha:FECHA,destTurno:'NOCHE',cantidad:3500,motivo:'Falta de preformas'});
  const o=items(N).find(p=>p.turno==='DÍA'),d=items(N).find(p=>p.turno==='NOCHE');
  ok(N.confirmaciones()===antes+2&&o.cantidadProgramada===6500&&d&&d.cantidadProgramada===3500&&d.unidadesPorPaleta===1200&&o.cantidadProgramada+d.cantidadProgramada===10000,'traslado: el origen baja a 6 500 (lo producido se queda), el destino sube a 3 500 y el total sigue en 10 000 (no se duplica el pedido)');
  const h=historial(N).filter(x=>/^TRASLADO/.test(x.referencia));
  ok(h.length===2&&h.every(x=>x.traslado&&x.traslado.cantidad===3500&&x.traslado.saldoComprobado===3500&&x.traslado.origen.bloque==='DÍA'&&x.traslado.destino.bloque==='NOCHE'&&x.motivo==='Falta de preformas')&&h.some(x=>x.turno==='DÍA'&&x.accion==='EDICION')&&h.some(x=>x.turno==='NOCHE'&&x.accion==='CREACION'),'historial del traslado: un evento en el origen y otro en el destino, con origen, destino, saldo comprobado y motivo');
  ok(compromisos(N).length===1&&compromisos(N)[0][1].filas[0].cantidad===10000&&compromisos(N)[0][0].endsWith('_DÍA'),'el bloque de origen (ya empezado) guarda su compromiso original (10 000) antes de bajarlo; el destino (Noche, aún no empieza) no');
  ok(NS.originalDe(FECHA,'DÍA','PET1','Bells','Regular_625ml')===10000&&NS.cambiosDesdeInicio(FECHA,'DÍA')[0].vigente===6500,'reprogramar no oculta el incumplimiento: original 10 000, vigente 6 500');
  ok(NS.saldoDe(it()).saldo===0,'después del traslado ya no queda saldo en el origen (producido 6 500 de 6 500)');
  // destino existente: suma
  const e2=entorno([pr('PET1','DÍA','Bells','Regular_625ml',10000,1200,{version:1}),pr('PET1','NOCHE','Bells','Regular_625ml',1000,1200,{version:1})],undefined);
  e2.sb.glacialProducidoVigente=x=>x.turno==='NOCHE'?0:6500;
  await e2.NS.trasladarSaldo({trasladoId:'t'+Math.random().toString(36).slice(2),item:e2.NS.existente('PET1',FECHA,'DÍA','Bells','Regular_625ml'),destFecha:FECHA,destTurno:'NOCHE',cantidad:2000,motivo:'Se completa en Noche'});
  ok(items(e2.N).find(p=>p.turno==='NOCHE').cantidadProgramada===3000&&items(e2.N).find(p=>p.turno==='DÍA').cantidadProgramada===8000,'si el destino ya tiene ese producto, se suma (1 000 + 2 000) sin duplicar');
  // otra fecha
  const e3=entorno([pr('PET1','NOCHE','Bells','Regular_625ml',4000,1200,{version:1})],undefined);e3.sb.glacialProducidoVigente=()=>1000;
  await e3.NS.trasladarSaldo({trasladoId:'t'+Math.random().toString(36).slice(2),item:e3.NS.existente('PET1',FECHA,'NOCHE','Bells','Regular_625ml'),destFecha:'2099-03-08',destTurno:'DÍA',cantidad:3000,motivo:'Pasa al día siguiente'});
  ok(items(e3.N).find(p=>p.fecha==='2099-03-08'&&p.turno==='DÍA').cantidadProgramada===3000&&items(e3.N).find(p=>p.fecha===FECHA).cantidadProgramada===1000,'Noche → Día siguiente: el destino lleva la fecha elegida y el origen conserva lo producido');
  // fila cambiada y fallo de red
  const e4=entorno(progs(),undefined);e4.sb.glacialProducidoVigente=()=>6500;
  const viejo=clon(e4.NS.existente('PET1',FECHA,'DÍA','Bells','Regular_625ml'));
  await require('vm').runInContext('guardarProgramacionPaleta',e4.sb)('PET1',FECHA,'DÍA','Bells','Regular_625ml',9000,1200,{versionEsperada:1});
  let er=null;try{await e4.NS.trasladarSaldo({trasladoId:'t'+Math.random().toString(36).slice(2),item:viejo,destFecha:FECHA,destTurno:'NOCHE',cantidad:2000,motivo:'Falta de preformas'});}catch(x){er=x;}
  ok(er&&er.conflicto&&/9[.,]000/.test(er.message)&&items(e4.N).length===1,'si la fila de origen cambió mientras se preparaba el traslado: no se aplica y se informa el valor actual');
  const e5=entorno(progs(),undefined);e5.sb.glacialProducidoVigente=()=>6500;e5.N.falla=true;let er5=null;
  try{await e5.NS.trasladarSaldo({trasladoId:'t'+Math.random().toString(36).slice(2),item:e5.NS.existente('PET1',FECHA,'DÍA','Bells','Regular_625ml'),destFecha:FECHA,destTurno:'NOCHE',cantidad:3500,motivo:'Falta de preformas'});}catch(x){er5=x;}
  ok(er5&&items(e5.N).length===1&&items(e5.N)[0].cantidadProgramada===10000&&historial(e5.N).length===0,'con fallo de red no cambia ni el origen ni el destino ni el historial (todo o nada)');
  const e6=entorno(progs(),undefined,{usuario:{planifica:false}});e6.sb.glacialProducidoVigente=()=>6500;let er6=null;
  try{await e6.NS.trasladarSaldo({trasladoId:'t'+Math.random().toString(36).slice(2),item:e6.NS.existente('PET1',FECHA,'DÍA','Bells','Regular_625ml'),destFecha:FECHA,destTurno:'NOCHE',cantidad:3500,motivo:'Falta de preformas'});}catch(x){er6=x;}
  ok(er6&&/Planificación/.test(er6.message),'quien no planifica no puede trasladar saldo');
}

/* ---------- pantallas ---------- */
{
  const progs=[pr('PET1','DÍA','Bells','Regular_625ml',12000,1200,{version:1}),pr('PET1','DÍA','Scala','Regular_380ml',6000,2184,{version:1}),pr('B7L','DÍA','Fontlife','7 Litros',2000,100,{version:1})];
  const e=entorno(progs,undefined);const {sb,NS}=e;
  sb.glacialProducidoVigente=x=>x.marca==='Bells'?6000:0;
  NS.estado={tab:'programacion',fecha:FECHA,turno:'DÍA',semana:FECHA};
  const tabla=sb.__el('plan-prog-tabla'),cap=sb.__el('plan-capacidad'),sec=sb.__el('plan-secuencia');
  NS.pestanas.find(p=>p.clave==='programacion').actualizar();
  ok(/Trasladar saldo/.test(tabla.innerHTML),'Programación ofrece «Trasladar saldo» en los productos con saldo comprobado');
  ok(/Capacidad del bloque/.test(cap.innerHTML)&&/Cabe/.test(cap.innerHTML)&&/Cálculo parcial/.test(cap.innerHTML)&&/Cálculo parcial: falta la velocidad estándar de Fontlife/.test(cap.innerHTML)&&/Cada tiempo se cuenta una sola vez/.test(cap.innerHTML),'panel de capacidad: línea que cabe, línea con estimación incompleta y qué falta');
  const e2=entorno(progs,undefined,{usuario:{planifica:false}});e2.sb.glacialProducidoVigente=()=>6000;e2.NS.estado={tab:'programacion',fecha:FECHA,turno:'DÍA'};
  e2.sb.__el('plan-prog-tabla');e2.NS.pestanas.find(p=>p.clave==='programacion').actualizar();
  ok(!/Trasladar saldo/.test(e2.sb.__el('plan-prog-tabla').innerHTML),'quien no planifica no ve «Trasladar saldo»');
  // sin saldo / sin registro
  sb.glacialProducidoVigente=x=>x.marca==='Bells'?null:12000;NS.pestanas.find(p=>p.clave==='programacion').actualizar();
  ok(!/data-plan-trasladar="PET1\|[^"]*Bells/.test(tabla.innerHTML),'sin registro de producción no se ofrece trasladar (no se puede comprobar el saldo)');
  // secuencia
  const e3=entorno([pr('PET1','DÍA','Bells','Regular_625ml',12000,1200,{tramosSecuencia:[{id:'t1',orden:1,tipoFin:'CANTIDAD',horaFin:'',cantidadObjetivo:12000,creadoEn:1}]})],undefined);
  e3.sb.glacialProducidoVigente=()=>0;e3.NS.estado={tab:'programacion',fecha:FECHA,turno:'DÍA'};e3.sb.__el('plan-prog-tabla');e3.sb.__el('plan-capacidad');const sec3=e3.sb.__el('plan-secuencia');
  e3.NS.pestanas.find(p=>p.clave==='programacion').actualizar();
  ok(/Secuencia del bloque/.test(sec3.innerHTML)&&/07:00/.test(sec3.innerHTML)&&/12:00/.test(sec3.innerHTML)&&/su cantidad no se duplica/.test(sec3.innerHTML),'panel de secuencia con inicio y fin estimados (07:00–12:00) y la nota de que no se duplica');
  // semanal
  e.NS.estado={tab:'semanal',semana:FECHA,fecha:FECHA,turno:'DÍA'};const gr=e.sb.__el('sem-grilla');
  e.NS.pestanas.find(p=>p.clave==='semanal').actualizar();
  ok(/\d+ %/.test(gr.innerHTML)&&/Cálculo parcial/.test(gr.innerHTML),'vista semanal: utilización por línea y bloque y «Cálculo parcial» cuando falta un dato');
}

/* ---------- tiempos previstos del catálogo ---------- */
{
  const e=entorno([],undefined);const {N,sb,NS}=e;
  await NS.guardarTiempos({cambioMin:'45',fijoDiaMin:'100',fijoNocheMin:''});
  const d=N.docs.get('sync/catalogoPlanificacion');
  ok(d.tiempos.cambioMin===45&&d.tiempos.fijoDiaMin===100&&d.tiempos.fijoNocheMin===null&&d.items.length===1&&d.items[0].id==='cat1','guardar tiempos conserva los productos del catálogo; vacío = sin configurar (null)');
  await NS.guardarProducto({linea:'PET1',marca:'Scala',presentacion:'Regular_380ml',unidadesPorPaleta:2184,activo:true});
  const d2=N.docs.get('sync/catalogoPlanificacion');
  ok(d2.items.length===2&&d2.tiempos.cambioMin===45,'guardar un producto del catálogo NO borra los tiempos previstos');
  ok(NS.tiemposDe('NOCHE').paradasMin===null&&NS.tiemposDe('DÍA').paradasMin===100,'tiempos leídos en vivo: Noche sin configurar, Día 100 min');
  let er='';try{await NS.guardarTiempos({cambioMin:'-5'});}catch(x){er=x.message;}
  ok(/entre 0 y 720/.test(er),'minutos inválidos se rechazan');
  er='';try{await NS.guardarTiempos({cambioMin:'2.5'});}catch(x){er=x.message;}
  ok(/enteros/.test(er),'solo minutos enteros');
  const sup=entorno([],undefined,{usuario:{planifica:false}});let e2='';try{await sup.NS.guardarTiempos({cambioMin:5});}catch(x){e2=x.message;}
  ok(/Planificación/.test(e2),'quien no planifica no cambia los tiempos');
}

/* ---------- código y puente ---------- */
{
  const f65=leer('js/produccion/65-planificacion-capacidad.js');
  ok(!/FieldValue\.(increment|arrayUnion|arrayRemove)|array-contains|startAfter|endBefore|where\(|\.update\(/.test(f65),'65: sin construcciones que el puente no admite');
  ok(/runTransaction/.test(f65)&&/tx\.set\(ref,\{items,updatedAt/.test(f65),'65: el traslado es una sola transacción sobre sync/programaciones (+ historial)');
  const idx=leer('index.html');
  ok(idx.indexOf('64-planificacion-avance.js')<idx.indexOf('65-planificacion-capacidad.js'),'index: 65 se carga después de 64');
  ok(/TRASLADO/.test(leer('js/produccion/54-planificacion-solicitudes.js')),'el historial muestra «Traslado de saldo»');
}
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
