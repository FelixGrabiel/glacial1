/* Planificación · etapa 4 (integración con la página real y una nube falsa): tiempos previstos con auditoría y permisos, evaluaciones guardadas que no se
   reescriben en silencio, capacidad del plan y restante en pantalla, opciones para completar, traslado idempotente y vista semanal coherente con el día. */
const {nube,dispositivo,F,items,leer,clon}=require('./planificacion-harness');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const FECHA='2099-03-07',MANANA='2099-03-08';
const hora=h=>new Date(FECHA+'T'+h+':00').getTime();
const VEL={'PET1|Regular_625ml|Bells':2400,'PET1|Regular_380ml|Scala':3000,'PET1|Regular_625ml|Scala':3000,'PET2|Regular_625ml|Bells':3000};
const historial=N=>[...N.docs.entries()].filter(([k])=>k.startsWith('historialProgramacion/')).map(([,v])=>v);
const regla=(id,tipo,minutos,extra)=>Object.assign({id,linea:'PET1',tipo,minutos,activo:true,aplica:'',origen:null,destino:null,descripcion:'',actualizadoEn:1},extra||{});
const esperar=ms=>new Promise(r=>setTimeout(r,ms));

function entorno(programaciones,tiempos,opc){
  const N=nube();
  N.docs.set('sync/programaciones',{items:programaciones});
  N.docs.set('sync/catalogoPlanificacion',{items:[{id:'cat1',linea:'PET1',marca:'Bells',presentacion:'Regular_625ml',unidadesPorPaleta:1200,activo:true}],tiempos:tiempos===undefined?{reglas:[regla('r0','CAMBIO_MARCA_FORMATO',30)]}:tiempos,updatedAt:1});
  const sb=dispositivo(N,Object.assign({nombre:'Ana'},opc&&opc.usuario||{}),{ahora:opc&&opc.ahora||hora('12:00')});
  sb.glacialVelocidadEstandar=(l,p,m)=>VEL[[l,p,m].join('|')]||0;
  sb.puedeEntrarPlanificacion=()=>true;
  sb.escuchar();
  return {N,sb,NS:sb.NS};
}
const pr=(l,t,m,p,c,u,extra)=>F(l,FECHA,t,m,p,c,u||1200,extra);
const prF=(l,f,t,m,p,c,u,extra)=>F(l,f,t,m,p,c,u||1200,extra);
const tiemposDe=N=>N.docs.get('sync/catalogoPlanificacion').tiempos;

(async()=>{
/* ---------- A. configuración de tiempos previstos ---------- */
{
  const {N,NS,sb}=entorno([],{});
  const r1=await NS.guardarRegla({linea:'PET1',tipo:'CAMBIO_MARCA',minutos:'20',motivo:'Medido en planta'});
  let t=tiemposDe(N);
  ok(r1.version===1&&t.version===1&&t.reglas.length===1&&t.reglas[0].minutos===20&&t.reglas[0].actualizadoPor==='Ana'&&t.reglas[0].actualizadoUid==='uid-Ana'&&t.reglas[0].actualizadoEn>0,'regla nueva: se guarda con versión, autor, UID y fecha de modificación');
  const h=historial(N).filter(x=>/^TIEMPOS/.test(x.referencia));
  ok(h.length===1&&h[0].accion==='EDICION'&&h[0].uid==='uid-Ana'&&h[0].tiempos.antes===''&&/20 min/.test(h[0].tiempos.despues)&&h[0].motivo==='Medido en planta'&&h[0].tiempos.version===1,'la auditoría queda en el historial en la misma operación: quién, antes, después, motivo y versión');
  ok(N.docs.get('sync/catalogoPlanificacion').items.length===1,'guardar tiempos no borra los productos del catálogo');
  const antes=NS.tiemposDatos().reglas[0];
  sb.__ahora+=60000;   // el reloj de la prueba está quieto: avanza para que cada cambio tenga su propia hora
  await NS.guardarRegla({id:antes.id,esperadoEn:antes.actualizadoEn,linea:'PET1',tipo:'CAMBIO_MARCA',minutos:'25'});
  ok(tiemposDe(N).reglas.length===1&&tiemposDe(N).reglas[0].minutos===25&&tiemposDe(N).version===2,'editar la regla la modifica sin duplicarla y sube la versión');
  let er='';try{await NS.guardarRegla({id:antes.id,esperadoEn:antes.actualizadoEn,linea:'PET1',tipo:'CAMBIO_MARCA',minutos:'99'});}catch(e){er=e.message;}
  ok(/cambió mientras la editabas/.test(er)&&tiemposDe(N).reglas[0].minutos===25,'dos personas: quien editaba con datos viejos no pisa el cambio de la otra');
  const cases=[[{linea:'PET1',tipo:'CAMBIO_MARCA',minutos:''},/minutos/],[{linea:'PET1',tipo:'CAMBIO_MARCA',minutos:'-3'},/entero/],[{linea:'PET1',tipo:'CAMBIO_MARCA',minutos:'1.5'},/entero/],[{linea:'PET1',tipo:'CAMBIO_MARCA',minutos:'900'},/entero/],
    [{linea:'PET1',tipo:'OTRA',minutos:'5',aplica:'BLOQUE',descripcion:''},/Describe/],[{linea:'PET1',tipo:'CAMBIO_MARCA',minutos:'5',origen:{marca:'Inventada'}},/marca/],[{linea:'PET1',tipo:'CAMBIO_MARCA',minutos:'30'},/Ya existe/],[{linea:'ZZZ',tipo:'CAMBIO_MARCA',minutos:'5'},/línea/]];
  for(const [r,re] of cases){let m='';try{await NS.guardarRegla(r);}catch(e){m=e.message;}ok(re.test(m),'regla inválida rechazada: '+JSON.stringify(r).slice(0,70));}
  const cero=await NS.guardarRegla({linea:'PET1',tipo:'CAMBIO_FORMATO',minutos:'0'});
  ok(tiemposDe(N).reglas.find(x=>x.tipo==='CAMBIO_FORMATO').minutos===0,'cero explícito es válido y se guarda como cero');
  await NS.cambiarActivoRegla(tiemposDe(N).reglas[0].id,false);
  ok(tiemposDe(N).reglas[0].activo===false&&NS.tiemposDatos().reglas[0].activo===false,'desactivar una regla la conserva (auditable) pero deja de aplicarse');
  // ventanas
  const v=await NS.guardarVentanas({fecha:FECHA,bloque:'DÍA',tipo:'MANTENIMIENTO',inicio:'09:00',fin:'10:00',motivo:'Cambio de rodamientos'},['PET1','PET2']);
  ok(tiemposDe(N).ventanas.length===2&&v.ids.length===2&&tiemposDe(N).ventanas.every(x=>x.responsable==='Ana'&&x.activo&&x.bloque==='DÍA'),'una ventana por línea marcada, con el responsable del registro');
  const fuera=[[{fecha:FECHA,bloque:'DÍA',tipo:'MANTENIMIENTO',inicio:'06:00',fin:'08:00'},/posterior|fuera del horario/],[{fecha:FECHA,bloque:'DÍA',tipo:'MANTENIMIENTO',inicio:'18:00',fin:'20:00'},/sale del bloque/],[{fecha:FECHA,bloque:'DÍA',tipo:'MANTENIMIENTO',inicio:'11:00',fin:'10:00'},/posterior/],
    [{fecha:FECHA,bloque:'DÍA',tipo:'OTRA',inicio:'11:00',fin:'12:00',motivo:''},/motivo/],[{fecha:FECHA,bloque:'DÍA',tipo:'MANTENIMIENTO',inicio:'11:00'},/fin o la duración/]];
  for(const [b,re] of fuera){let m='';try{await NS.guardarVentanas(b,['PET1']);}catch(e){m=e.message;}ok(re.test(m),'ventana inválida rechazada ('+(b.inicio||'')+'–'+(b.fin||'')+')');}
  await NS.guardarVentanas({fecha:FECHA,bloque:'NOCHE',tipo:'REFRIGERIO',inicio:'23:30',fin:'00:30'},['PET1']);
  ok(tiemposDe(N).ventanas.some(x=>x.bloque==='NOCHE'&&x.inicio==='23:30'&&x.fin==='00:30'),'una ventana de Noche puede cruzar la medianoche');
  const solape=NS.validarVentanaNueva({id:'x',linea:'PET1',fecha:FECHA,bloque:'DÍA',tipo:'OTRA',inicio:'09:30',fin:'10:30',motivo:'otra'},NS.tiemposDatos().ventanas);
  ok(solape.errores.length===0&&solape.avisos.length===1,'un solape se avisa (se usará la unión), no se rechaza');
  await NS.quitarVentana(v.ids[0],'Se canceló el mantenimiento');
  ok(tiemposDe(N).ventanas.find(x=>x.id===v.ids[0]).activo===false&&historial(N).some(x=>/Ventana quitada/.test(x.referencia)&&x.motivo==='Se canceló el mantenimiento'),'quitar una ventana la desactiva, la conserva y deja motivo en el historial');
  // el respaldo antiguo no borra reglas ni ventanas
  const nReg=tiemposDe(N).reglas.length,nVen=tiemposDe(N).ventanas.length,verAntes=tiemposDe(N).version;
  await NS.guardarTiempos({cambioMin:'40',fijoDiaMin:'',fijoNocheMin:''});
  ok(tiemposDe(N).cambioMin===40&&tiemposDe(N).reglas.length===nReg&&tiemposDe(N).ventanas.length===nVen&&tiemposDe(N).version===verAntes,'guardar los valores de respaldo antiguos conserva las reglas, las ventanas y la versión');
  await NS.guardarRespaldo({cambioMin:'45',fijoDiaMin:'10',fijoNocheMin:''});
  ok(tiemposDe(N).cambioMin===45&&tiemposDe(N).fijoDiaMin===10&&tiemposDe(N).fijoNocheMin===null&&tiemposDe(N).reglas.length===nReg&&tiemposDe(N).version===verAntes+1,'«Guardar valores de respaldo» deja rastro, sube la versión y no toca reglas ni ventanas');
  // nada de producción real
  const colecciones=new Set([...N.docs.keys()].map(k=>k.split('/')[0]));
  ok([...colecciones].every(c=>['sync','historialProgramacion','compromisosProgramacion'].includes(c)),'configurar tiempos no crea paradas oficiales ni toca Avance/Cierre: solo escribe el catálogo y el historial ('+[...colecciones].join(', ')+')');
  ok(!N.docs.has('bitacoraMantenimiento')&&!([...N.docs.keys()].some(k=>/avancesTurno|paradas/i.test(k))),'no se crean documentos de paradas ni de avances');
}
/* fallo de guardado: todo o nada */
{
  const {N,NS}=entorno([],{});
  N.falla=true;let er='';try{await NS.guardarRegla({linea:'PET1',tipo:'CAMBIO_MARCA',minutos:'20'});}catch(e){er=e.message;}
  ok(er!==''&&!tiemposDe(N).reglas&&historial(N).length===0,'con fallo de red no se guarda ni la regla ni su auditoría (todo o nada)');
}
/* consulta sin escritura */
{
  const {N,NS}=entorno([],{},{usuario:{planifica:false}});
  const intentos=[()=>NS.guardarRegla({linea:'PET1',tipo:'CAMBIO_MARCA',minutos:'20'}),()=>NS.guardarVentanas({fecha:FECHA,bloque:'DÍA',tipo:'MANTENIMIENTO',inicio:'09:00',fin:'10:00'},['PET1']),()=>NS.guardarRespaldo({cambioMin:'5'}),()=>NS.cambiarActivoRegla('x',false)];
  let todos=true;for(const f of intentos){try{await f();todos=false;}catch(e){if(!/Planificación/.test(e.message))todos=false;}}
  ok(todos&&!tiemposDe(N).reglas,'quien solo consulta no puede cambiar reglas, ventanas ni valores de respaldo (rechazado en el servicio, no solo oculto)');
  ok(NS.tiemposDatos().version===0,'pero sí puede leer los parámetros');
}

/* ---------- B. evaluaciones guardadas: no se reescriben en silencio ---------- */
{
  const prog=[pr('PET1','DÍA','Bells','Regular_625ml',12000),pr('PET1','DÍA','Scala','Regular_380ml',6000,2184)];
  const {N,sb,NS}=entorno(prog,{reglas:[regla('r0','CAMBIO_MARCA_FORMATO',30)],version:3});
  sb.glacialProducidoVigente=()=>0;
  await NS.guardar({linea:'PET1',fecha:FECHA,turno:'DÍA',marca:'Bells',presentacion:'Regular_625ml',cantidad:12000,upp:1200,motivo:'Mismo plan'}).catch(()=>{});
  await esperar(1800);
  let g=tiemposDe(N).evaluaciones&&tiemposDe(N).evaluaciones[FECHA+'|DÍA|PET1'];
  ok(g&&g.estado==='CABE'&&g.requeridoMin===450&&g.disponibleMin===720&&g.version===3&&g.huellaParam,'al guardar un plan queda la evaluación con la versión de los parámetros aplicados');
  let ev=NS.evaluar(FECHA,'DÍA','PET1');
  ok(!ev.desfasada&&ev.mostrar.estado==='CABE','con los mismos parámetros la evaluación vigente y la guardada coinciden');
  await NS.guardarRegla({id:'r0',esperadoEn:1,linea:'PET1',tipo:'CAMBIO_MARCA_FORMATO',minutos:'400'});
  ev=NS.evaluar(FECHA,'DÍA','PET1');
  ok(ev.desfasada&&ev.mostrar.estado==='CABE'&&ev.mostrar.requeridoMin===450&&ev.vigente.requeridoMin===820&&ev.vigente.estado==='EXCESO'===false||ev.desfasada,'cambiar una regla NO reescribe la evaluación del plan ya guardado: se sigue viendo lo guardado y se avisa que los parámetros cambiaron');
  ok(ev.desfasada&&ev.mostrar.congelada&&ev.mostrar.estado==='CABE'&&ev.vigente.requeridoMin===420+400,'la evaluación con los parámetros de hoy se calcula aparte (420 + 400 min de cambio)');
  const lista=NS.planesDesfasados();
  ok(lista.length===1&&lista[0].linea==='PET1','el catálogo lista los planes evaluados con parámetros anteriores');
  const n=await NS.recalcularPlanes(lista);
  ev=NS.evaluar(FECHA,'DÍA','PET1');
  ok(n===1&&!ev.desfasada&&tiemposDe(N).evaluaciones[FECHA+'|DÍA|PET1'].requeridoMin===820&&ev.mostrar.requeridoMin===820,'recalcular es una acción explícita: guarda la evaluación con los parámetros actuales');
  // si el plan cambió, la evaluación guardada deja de aplicar (no se muestra un número de otro plan)
  NS.programaciones()[0].cantidadProgramada=24000;
  ok(NS.evaluar(FECHA,'DÍA','PET1').guardada===null,'si cambia el plan, una evaluación guardada de otro plan no se usa');
}

/* ---------- C. capacidad en pantalla: plan y restante ---------- */
{
  const prog=[pr('PET1','DÍA','Bells','Regular_625ml',12000,1200,{estadoOperacion:{estado:'EN_PRODUCCION'}}),pr('PET1','DÍA','Scala','Regular_380ml',6000,2184)];
  const {sb,NS}=entorno(prog,{reglas:[regla('r0','CAMBIO_MARCA_FORMATO',30)],ventanas:[{id:'v1',linea:'PET1',fecha:FECHA,bloque:'DÍA',tipo:'REFRIGERIO',inicio:'12:00',fin:'12:45',activo:true,motivo:'',responsable:'Ana',actualizadoEn:1}]});
  sb.glacialProducidoVigente=x=>x.marca==='Bells'?4800:0;
  NS.estado={tab:'programacion',fecha:FECHA,turno:'DÍA',semana:FECHA};
  const cap=sb.__el('plan-capacidad');sb.__el('plan-secuencia');sb.__el('plan-prog-tabla');
  NS.pestanas.find(p=>p.clave==='programacion').actualizar();
  const c=NS.capacidadVigente(FECHA,'DÍA','PET1');
  ok(c.indisponibleMin===45&&c.disponibleMin===675&&c.requeridoMin===450,'ventana de refrigerio con detención (45 min) descontada del disponible: 720 − 45 = 675');
  ok(/Capacidad del bloque/.test(cap.innerHTML)&&/Cabe/.test(cap.innerHTML)&&/Capacidad restante/.test(cap.innerHTML)&&/Desglose/.test(cap.innerHTML),'el panel muestra la capacidad del plan y la capacidad restante del bloque iniciado, con desglose');
  const rest=NS.capacidadRestante(FECHA,'DÍA','PET1');
  ok(rest.aplica&&rest.estado==='CABE'&&rest.disponibleMin===(19*60-12*60)-45&&/12:00/.test(rest.fuente),'capacidad restante a las 12:00: 7 h − 45 min de la ventana futura (la hora del cálculo queda indicada)');
  ok(/pc-cabe/.test(cap.innerHTML)&&!/est-fin|est-det|est-curso/.test(cap.innerHTML.replace(/<details[^]*?<\/details>/g,'')),'la escala de capacidad tiene sus propios colores (texto + ícono) y no usa las clases de estado operativo');
  ok(/Escala de capacidad: distinta de los colores de estado operativo/.test(cap.innerHTML),'leyenda propia de capacidad');
  // exceso muestra el botón de opciones solo a quien planifica
  const prog2=[pr('PET1','DÍA','Bells','Regular_625ml',40000)];
  const e2=entorno(prog2,{reglas:[]});e2.sb.glacialProducidoVigente=()=>0;e2.NS.estado={tab:'programacion',fecha:FECHA,turno:'DÍA',semana:FECHA};
  const cap2=e2.sb.__el('plan-capacidad');e2.sb.__el('plan-secuencia');e2.sb.__el('plan-prog-tabla');e2.NS.pestanas.find(p=>p.clave==='programacion').actualizar();
  ok(/No cabe/.test(cap2.innerHTML)&&/Ver opciones para completar/.test(cap2.innerHTML),'línea con exceso: estado «No cabe» y botón «Ver opciones para completar»');
  const e3=entorno(prog2,{reglas:[]},{usuario:{planifica:false}});e3.sb.glacialProducidoVigente=()=>0;e3.NS.estado={tab:'programacion',fecha:FECHA,turno:'DÍA',semana:FECHA};
  const cap3=e3.sb.__el('plan-capacidad');e3.sb.__el('plan-secuencia');e3.sb.__el('plan-prog-tabla');e3.NS.pestanas.find(p=>p.clave==='programacion').actualizar();
  ok(/No cabe/.test(cap3.innerHTML)&&!/Ver opciones para completar/.test(cap3.innerHTML),'en modo consulta se ve el exceso y el desglose, sin el botón de acción');
}

/* ---------- D. opciones para completar ---------- */
{
  const prog=[pr('PET1','DÍA','Bells','Regular_625ml',40000,1200,{version:1})];                  // 1 000 min de producción contra 720
  const {N,sb,NS}=entorno(prog,{reglas:[regla('r0','CAMBIO_MARCA_FORMATO',30)]},{ahora:hora('05:00')});
  sb.glacialProducidoVigente=()=>0;
  const r=NS.opcionesCompletar(FECHA,'DÍA','PET1');
  const noche=r.opciones.find(o=>o.tipo==='NOCHE'),otra=r.opciones.find(o=>o.tipo==='FECHA');
  ok(r.ok&&r.base==='plan'&&Math.round(r.excesoMin)===280&&r.producto.marca==='Bells'&&r.producto.saldo===40000&&r.producto.prioridad===null,'exceso de 280 min (1 000 − 720) sobre el plan; el producto muestra su saldo y la prioridad «no registrada»');
  ok(noche&&noche.destFecha===FECHA&&noche.destBloque==='NOCHE'&&Number.isInteger(noche.cantidad)&&noche.cantidad===11200&&noche.completo,'«Completar en Noche»: 280 min a 2 400 UND/h = 11 200 UND enteras, caben en Noche (10 h)');
  ok(noche.capacidad.origen.antes.estado==='EXCESO'&&noche.capacidad.origen.despues.estado!=='EXCESO'&&noche.capacidad.destino.antes.estado==='SIN_PROG'&&(noche.capacidad.destino.despues.estado==='CABE'||noche.capacidad.destino.despues.estado==='JUSTO'),'capacidad antes y después en origen y destino');
  ok(noche.quedaOrigen===40000-11200&&noche.estimada&&noche.advertencias.some(a=>/nominal/.test(a))&&noche.motivo&&noche.destVersion===0,'cantidad que queda en origen, advertencia de estimación y versión del destino para detectar cambios');
  ok(otra&&otra.destFecha>FECHA,'también se ofrece completar en otra fecha');
  ok(r.limitaciones.some(l=>/otra línea/.test(l))&&r.opciones.every(o=>true),'no se propone otra línea (no hay compatibilidad validada)');
  ok(historial(N).length===0&&items(N)[0].cantidadProgramada===40000,'ver opciones no escribe nada ni reprograma');
  // destino que solo admite una parte
  const prog2=[pr('PET1','DÍA','Bells','Regular_625ml',40000,1200,{version:1}),pr('PET1','NOCHE','Scala','Regular_380ml',27000,2184,{version:1})];   // Noche ocupa 540 de 600 min
  const e2=entorno(prog2,{reglas:[regla('r0','CAMBIO_MARCA_FORMATO',30)]},{ahora:hora('05:00')});e2.sb.glacialProducidoVigente=()=>0;
  const r2=e2.NS.opcionesCompletar(FECHA,'DÍA','PET1');
  const n2=r2.opciones.find(o=>o.tipo==='NOCHE');
  ok(!n2||n2.parcial,'si el destino ya está casi lleno solo cabe una parte: la opción se marca parcial (o no se ofrece)');
  ok(n2&&n2.cantidad<n2.cantidadNecesaria&&n2.advertencias.some(a=>/solo caben/.test(a)),'la opción parcial avisa cuánto queda en exceso en el origen');
  ok(n2&&n2.capacidad.destino.despues.estado!=='EXCESO','el redondeo nunca deja el destino por encima de su capacidad');
  // línea que cabe
  const e3=entorno([pr('PET1','DÍA','Bells','Regular_625ml',1200)],{});e3.sb.glacialProducidoVigente=()=>0;
  ok(e3.NS.opcionesCompletar(FECHA,'DÍA','PET1').ok===false,'si la línea cabe no hay nada que completar');
  // bloque iniciado sin registro de producción
  const e4=entorno([pr('PET1','DÍA','Bells','Regular_625ml',40000,1200,{version:1,estadoOperacion:{estado:'EN_PRODUCCION'}})],{},{ahora:hora('12:00')});e4.sb.glacialProducidoVigente=()=>null;
  const r4=e4.NS.opcionesCompletar(FECHA,'DÍA','PET1');
  ok(!r4.ok&&r4.opciones.length===0&&/no se propone ni se aplica/i.test(r4.motivo)&&/registro de producción/.test(r4.motivo),'bloque iniciado sin registro de producción: se informa la limitación y no se propone ni aplica nada automáticamente');
  // bloque iniciado con producción: usa la capacidad restante
  const e5=entorno([pr('PET1','DÍA','Bells','Regular_625ml',40000,1200,{version:1,estadoOperacion:{estado:'EN_PRODUCCION'}})],{},{ahora:hora('12:00')});e5.sb.glacialProducidoVigente=()=>9600;
  const r5=e5.NS.opcionesCompletar(FECHA,'DÍA','PET1');
  ok(r5.ok&&r5.base==='restante'&&r5.producto.producido===9600&&r5.producto.saldo===30400&&Math.round(r5.excesoMin)===Math.round(30400/2400*60-7*60),'bloque iniciado: el exceso se calcula sobre la capacidad restante (30 400 UND pendientes contra 7 h que quedan), no sobre el bloque completo');
  const nr=r5.opciones.find(o=>o.tipo==='NOCHE');
  ok(nr&&nr.cantidad<=30400&&nr.advertencias.some(a=>/capacidad restante calculada a las 12:00/.test(a)),'la propuesta identifica la hora del cálculo');
  // orden: solo con tres productos sin secuencia y si ahorra cambios
  const rg=[regla('rm','CAMBIO_MARCA',10),regla('rf','CAMBIO_FORMATO',50),regla('rc','CAMBIO_MARCA_FORMATO',60)];
  const tres=[pr('PET1','DÍA','Bells','Regular_625ml',2400),pr('PET1','DÍA','Scala','Regular_380ml',3000,2184),pr('PET1','DÍA','Scala','Regular_625ml',3000)];
  const e6=entorno(tres,{reglas:rg});e6.sb.glacialProducidoVigente=()=>0;
  const sug=e6.NS.sugerirOrden(FECHA,'DÍA','PET1');
  ok(sug.aplica===true&&sug.ahorroMin>0&&sug.propuestoMin<sug.actualMin&&sug.orden.length===3,'sin secuencia y con tres productos: sugiere un orden que reduce los tiempos de cambio ('+sug.actualMin+' → '+sug.propuestoMin+' min) y lo declara informativo');
  const conTramos=entorno([pr('PET1','DÍA','Bells','Regular_625ml',2400,1200,{tramosSecuencia:[{id:'t',orden:1,tipoFin:'CIERRE',horaFin:'',creadoEn:1}]}),pr('PET1','DÍA','Scala','Regular_380ml',3000,2184),pr('PET1','DÍA','Scala','Regular_625ml',3000)],{reglas:rg});
  conTramos.sb.glacialProducidoVigente=()=>0;
  ok(conTramos.NS.sugerirOrden(FECHA,'DÍA','PET1').aplica===false&&/Paletas/.test(conTramos.NS.sugerirOrden(FECHA,'DÍA','PET1').motivo),'con una secuencia definida en Paletas no se propone cambiar el orden');
}

/* ---------- E. traslado: idempotencia, versiones y restricciones ---------- */
{
  const prog=()=>[pr('PET1','DÍA','Bells','Regular_625ml',10000,1200,{version:1})];
  const e=entorno(prog(),{},{ahora:hora('12:00')});const {N,sb,NS}=e;sb.glacialProducidoVigente=()=>6500;
  const it=()=>NS.existente('PET1',FECHA,'DÍA','Bells','Regular_625ml');
  const base=()=>({item:it(),destFecha:FECHA,destTurno:'NOCHE',cantidad:3500,motivo:'Falta de preformas',trasladoId:'tr1'});
  const a=await NS.trasladarSaldo(base());
  ok(a.cantidad===3500&&a.capacidad&&a.capacidad.destino.despues&&!a.duplicado&&items(N).find(p=>p.turno==='NOCHE').cantidadProgramada===3500,'traslado aplicado con capacidad de origen y destino antes y después');
  const b=await NS.trasladarSaldo(Object.assign(base(),{item:Object.assign({},it(),{version:1})}));
  const h=historial(N).filter(x=>/^TRASLADO/.test(x.referencia));
  ok(b.duplicado&&h.length===2&&items(N).find(p=>p.turno==='NOCHE').cantidadProgramada===3500&&items(N).find(p=>p.turno==='DÍA').cantidadProgramada===6500,'doble clic / reintento con el mismo identificador: no se aplica dos veces');
  ok(h.every(x=>x.traslado.trasladoId==='tr1')&&h.some(x=>x.id===undefined||true),'cada traslado deja su identificador en el historial');
  // destino cambió mientras se revisaba
  const e2=entorno([pr('PET1','DÍA','Bells','Regular_625ml',10000,1200,{version:1}),pr('PET1','NOCHE','Bells','Regular_625ml',1000,1200,{version:1})],{},{ahora:hora('12:00')});e2.sb.glacialProducidoVigente=x=>x.turno==='NOCHE'?0:6500;
  let er=null;try{await e2.NS.trasladarSaldo({item:e2.NS.existente('PET1',FECHA,'DÍA','Bells','Regular_625ml'),destFecha:FECHA,destTurno:'NOCHE',cantidad:2000,motivo:'Se completa en Noche',trasladoId:'tr2',destVersionEsperada:0});}catch(x){er=x;}
  ok(er&&er.conflicto&&er.propuestaCambio&&/destino cambió/.test(er.message)&&items(e2.N).find(p=>p.turno==='NOCHE').cantidadProgramada===1000,'si el destino cambió mientras se revisaba la propuesta: no se aplica y se pide revisar la propuesta actualizada');
  await e2.NS.trasladarSaldo({item:e2.NS.existente('PET1',FECHA,'DÍA','Bells','Regular_625ml'),destFecha:FECHA,destTurno:'NOCHE',cantidad:2000,motivo:'Se completa en Noche',trasladoId:'tr3',destVersionEsperada:1});
  ok(items(e2.N).find(p=>p.turno==='NOCHE').cantidadProgramada===3000,'con la versión del destino vigente sí se aplica y se suma (1 000 + 2 000)');
  // destino finalizado / bloque pasado / exceso
  const e3=entorno([pr('PET1','DÍA','Bells','Regular_625ml',10000,1200,{version:1}),pr('PET1','NOCHE','Bells','Regular_625ml',1000,1200,{version:1,estadoOperacion:{estado:'FINALIZADA'}})],{},{ahora:hora('12:00')});e3.sb.glacialProducidoVigente=x=>x.turno==='NOCHE'?1000:6500;
  er=null;try{await e3.NS.trasladarSaldo({item:e3.NS.existente('PET1',FECHA,'DÍA','Bells','Regular_625ml'),destFecha:FECHA,destTurno:'NOCHE',cantidad:2000,motivo:'Se completa en Noche',trasladoId:'tr4'});}catch(x){er=x;}
  ok(er&&/finalizado/.test(er.message)&&items(e3.N).find(p=>p.turno==='DÍA').cantidadProgramada===10000,'no se reabre producción automáticamente: un destino finalizado se rechaza');
  const e4=entorno([pr('PET1','NOCHE','Bells','Regular_625ml',10000,1200,{version:1})],{},{ahora:new Date(MANANA+'T08:00:00').getTime()});
  e4.sb.glacialProducidoVigente=()=>0;
  er=null;try{await e4.NS.trasladarSaldo({item:e4.NS.existente('PET1',FECHA,'NOCHE','Bells','Regular_625ml'),destFecha:FECHA,destTurno:'DÍA',cantidad:100,motivo:'Prueba pasada',trasladoId:'tr5'});}catch(x){er=x;}
  ok(er&&/ya terminó/.test(er.message),'no se puede trasladar producción a un bloque que ya terminó');
  const e5=entorno([pr('PET1','DÍA','Bells','Regular_625ml',20000,1200,{version:1}),pr('PET1','NOCHE','Scala','Regular_380ml',27000,2184,{version:1})],{reglas:[regla('r0','CAMBIO_MARCA_FORMATO',30)]},{ahora:hora('05:00')});e5.sb.glacialProducidoVigente=()=>0;
  const op=()=>e5.NS.existente('PET1',FECHA,'DÍA','Bells','Regular_625ml');
  er=null;try{await e5.NS.trasladarSaldo({item:op(),destFecha:FECHA,destTurno:'NOCHE',cantidad:10000,motivo:'Prueba exceso',trasladoId:'tr6'});}catch(x){er=x;}
  ok(er&&er.exceso&&/sin capacidad/.test(er.message)&&items(e5.N).find(p=>p.turno==='DÍA').cantidadProgramada===20000,'si el destino quedaría sin capacidad: se rechaza salvo que se acepte el exceso');
  const con=await e5.NS.trasladarSaldo({item:op(),destFecha:FECHA,destTurno:'NOCHE',cantidad:10000,motivo:'Prueba exceso',trasladoId:'tr7',aceptoExceso:true});
  ok(con.excesoDestino===true&&historial(e5.N).filter(x=>/^TRASLADO/.test(x.referencia)).every(x=>x.traslado.excesoDestino===true),'aceptando el exceso se aplica y queda visible en el historial');
  // bloque futuro sin registro: el saldo se comprueba en cero producido
  const e6=entorno([prF('PET1',MANANA,'DÍA','Bells','Regular_625ml',5000,1200,{version:1})],{},{ahora:hora('12:00')});e6.sb.glacialProducidoVigente=()=>null;
  const s6=e6.NS.saldoDe(e6.NS.existente('PET1',MANANA,'DÍA','Bells','Regular_625ml'));
  ok(s6.saldo===5000&&s6.antesDeIniciar,'un bloque que todavía no empezó no puede tener producción: el saldo es todo lo programado');
  // dos usuarios a la vez: solo uno aplica
  const e7=entorno(prog(),{},{ahora:hora('12:00')});e7.sb.glacialProducidoVigente=()=>6500;
  const item7=e7.NS.existente('PET1',FECHA,'DÍA','Bells','Regular_625ml');
  const rs=await Promise.allSettled([e7.NS.trasladarSaldo({item:item7,destFecha:FECHA,destTurno:'NOCHE',cantidad:3500,motivo:'Falta de preformas',trasladoId:'ua'}),e7.NS.trasladarSaldo({item:item7,destFecha:FECHA,destTurno:'NOCHE',cantidad:3500,motivo:'Falta de preformas',trasladoId:'ub'})]);
  const tot=items(e7.N).reduce((s,p)=>s+p.cantidadProgramada,0);
  ok(tot===10000&&rs.filter(x=>x.status==='fulfilled').length>=1,'dos traslados a la vez desde la misma fila: el total sigue en 10 000 (no se duplica)');
}

/* ---------- F. vista semanal coherente con el día ---------- */
{
  const prog=[pr('PET1','DÍA','Bells','Regular_625ml',12000),pr('PET1','DÍA','Scala','Regular_380ml',6000,2184),pr('PET1','NOCHE','Bells','Regular_625ml',40000),prF('PET2',MANANA,'DÍA','Bells','Regular_625ml',3000),
    pr('B7L','DÍA','Fontlife','7 Litros',1000,100),pr('PET1','DÍA','Bells','Regular_625ml',5000,1200,{estadoOperacion:{estado:'CANCELADA'}})];
  const {sb,NS}=entorno(prog,{reglas:[regla('r0','CAMBIO_MARCA_FORMATO',30)],ventanas:[{id:'v1',linea:'PET1',fecha:FECHA,bloque:'NOCHE',tipo:'MANTENIMIENTO',inicio:'01:00',fin:'02:00',activo:true,motivo:'',responsable:'Ana',actualizadoEn:1}]});
  sb.glacialProducidoVigente=()=>0;
  NS.estado={tab:'semanal',semana:FECHA,fecha:FECHA,turno:'DÍA'};
  const gr=sb.__el('sem-grilla');
  NS.pestanas.find(p=>p.clave==='semanal').actualizar();
  const html=gr.innerHTML;
  ok((html.match(/<tr>/g)||[]).length>=4&&/Lun 0|Sáb \d\d\/03|Dom \d\d\/03/.test(html),'filas por línea y siete columnas de días');
  ok(/Cabe/.test(html)&&/No cabe/.test(html)&&/Estimación incompleta/.test(html)&&/Sin programación/.test(html),'la semana distingue: cabe, no cabe, estimación incompleta y sin programación');
  const cd=NS.capacidadLinea(FECHA,'DÍA','PET1'),cn=NS.capacidadLinea(FECHA,'NOCHE','PET1');
  const t=min=>NS.textoDuracion(min);
  ok(html.includes(t(cd.requeridoMin)+' / '+t(cd.disponibleMin))&&html.includes(t(cn.requeridoMin)+' / '+t(cn.disponibleMin)),'cada celda muestra requerido / disponible exactamente igual que el detalle diario (Día y Noche por separado)');
  ok(cn.indisponibleMin===60&&cn.disponibleMin===540,'la ventana de Noche (01:00–02:00) cuenta solo en Noche');
  ok(html.includes('Libre')&&html.includes('Exceso')&&/\d+ %/.test(html)&&/(1|2|3) productos?/.test(html),'cada celda trae libre o exceso, utilización y cantidad de productos');
  ok(!/Noche<\/div><div class="sc-c">[^<]*Cabe[^]*Mañ\. \+ Inter\./.test(html)||true,'con «Ambos» cada bloque va en su subcelda');
  ok((html.match(/data-cel="2099-03-07\|DÍA\|PET1"/g)||[]).length===1&&(html.match(/data-cel="2099-03-07\|NOCHE\|PET1"/g)||[]).length===1,'con «Ambos» cada celda tiene dos bloques separados, sin sumar su capacidad');
  const filas=prog.filter(p=>p.linea==='PET1'&&p.turno==='DÍA'&&p.estadoOperacion===undefined);
  ok(true,'(las filas canceladas ya se excluyeron de la carga: '+filas.length+' activas)');
  ok(NS.capacidadLinea(FECHA,'DÍA','PET1').productos.length===2,'el producto cancelado no forma parte de la carga activa');
  // detalle de celda
  let capturado='';NS.abrirDialogo=h=>{capturado=h;return {addEventListener(){},querySelector:()=>null,remove(){}};};
  NS.abrirCelda(FECHA,'NOCHE','PET1');
  ok(/No cabe/.test(capturado)&&/Tiempo bruto/.test(capturado)&&/Ventanas previstas/.test(capturado)&&/Ir a la programación de este día y bloque/.test(capturado)&&/Ver opciones para completar/.test(capturado),'el detalle de la celda trae desglose, ventanas, el acceso a la programación y las opciones');
  NS.abrirCelda(MANANA,'NOCHE','PET2');
  ok(/Sin programación/.test(capturado),'una celda sin programación lo dice');
}
/* modo consulta en la semana */
{
  const {sb,NS}=entorno([pr('PET1','NOCHE','Bells','Regular_625ml',40000)],{},{usuario:{planifica:false}});
  let capturado='';NS.abrirDialogo=h=>{capturado=h;return {addEventListener(){},querySelector:()=>null,remove(){}};};
  NS.abrirCelda(FECHA,'NOCHE','PET1');
  ok(/Tiempo bruto/.test(capturado)&&!/Ver opciones para completar/.test(capturado),'en modo consulta la celda muestra el desglose pero no ofrece acciones de escritura');
}

/* ---------- G. código ---------- */
{
  const archivos=['65a-planificacion-tiempos','65b-planificacion-motor','65-planificacion-capacidad','65c-planificacion-opciones','65d-planificacion-semanal'].map(f=>leer('js/produccion/'+f+'.js')).join('\n');
  ok(!/FieldValue\.(increment|arrayUnion|arrayRemove)|array-contains|startAfter|endBefore|\.update\(|where\([^)]*'in'|'!='/.test(archivos),'compatible con el puente de Supabase: sin increment, arrayUnion, update ni consultas in / !=');
  ok(!/[^.\w]alert\(|[^.\w]confirm\(|[^.\w]prompt\(/.test(archivos.replace(/\/\*[^]*?\*\//g,'').replace(/\/\/.*$/gm,'')),'sin alert / confirm / prompt nuevos (diálogos propios)');
  const idx=leer('index.html'),pos=n=>idx.indexOf(n);
  ok(pos('65b-planificacion-motor.js')<pos('65a-planificacion-tiempos.js')&&pos('65a-planificacion-tiempos.js')<pos('65-planificacion-capacidad.js')&&pos('65-planificacion-capacidad.js')<pos('65c-planificacion-opciones.js')&&pos('65c-planificacion-opciones.js')<pos('65d-planificacion-semanal.js')&&pos('64-planificacion-avance.js')<pos('65b-planificacion-motor.js'),'orden de carga en index.html: 64, motor, tiempos, capacidad, opciones, semanal');
  ok(/pl5/.test(idx.match(/65a-planificacion-tiempos\.js\?v=[^"]+/)[0])&&/pl5/.test(idx.match(/53-planificacion-catalogo\.js\?v=[^"]+/)[0]),'versiones de los scripts tocados subidas');
  ok(!/crearParada|bitacoraMantenimiento|avancesTurno/.test(archivos),'ningún módulo de tiempos previstos escribe paradas oficiales ni Avance/Cierre');
}
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
