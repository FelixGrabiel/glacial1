/* Mantenimiento · preventivos: calendario (meses con fin de mes, política de próxima fecha), estados, plan→ejecución sin duplicados, tareas que solo marca una persona,
   cierre que avanza el plan en la misma transacción, cambio de plan sin reescribir ejecuciones, reprogramación auditada, avisos con destinatarios reales y
   contrato (no conectado) para Planificación. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const clon=v=>JSON.parse(JSON.stringify(v));
const T0=Date.parse('2099-03-07T10:00:00'),dia=86400000,min=n=>n*60000;
const falla=async f=>{try{await f();return null;}catch(e){return e;}};

function nube(){
  const docs=new Map(),ver=new Map();const N={docs,falla:false,supervisores:new Set(['uid-sup'])};
  const CLAVES_TECNICO=['proximaFecha','fechaOriginal','ultimaEjecucion','reprogramaciones','rev','actualizadaEn','actualizadaUid'];
  const regla=(r,ant,nuevo,uid)=>{
    if(r.__c==='intervenciones'&&ant){if(nuevo.version!==ant.version+1||nuevo.historial.length!==ant.historial.length+1)throw new Error('permission-denied (intervención)');}
    if(r.__c==='planesPreventivos'){
      if(!ant){if(!N.supervisores.has(uid)||nuevo.rev!==1)throw new Error('permission-denied (crear plan)');return;}
      if(nuevo.rev!==ant.rev+1)throw new Error('permission-denied (rev)');
      if(!N.supervisores.has(uid)){const cambiadas=Object.keys(nuevo).filter(k=>JSON.stringify(nuevo[k])!==JSON.stringify(ant[k])&&k!=='actualizadaEn');
        if(cambiadas.some(k=>!CLAVES_TECNICO.includes(k)))throw new Error('permission-denied (campos del plan: '+cambiadas.join()+')');}
    }
  };
  const cons=(c,fil,lim)=>({where:(f,op,v)=>cons(c,fil.concat([[f,v]]),lim),limit:n=>cons(c,fil,n),
    _l(){let l=[...docs.entries()].filter(([k])=>k.startsWith(c+'/')).map(([k,v])=>({id:k.slice(c.length+1),v}));fil.forEach(([f,v])=>{l=l.filter(x=>x.v[f]===v);});return l.map(x=>({id:x.id,data:()=>clon(x.v)}));},
    onSnapshot(cb){cb({docs:this._l()});return()=>{};},get(){return Promise.resolve({docs:this._l()});}});
  N.db={collection:c=>Object.assign(cons(c,[],0),{doc:id=>({__c:c,__id:id,__k:c+'/'+id,get:async()=>({exists:docs.has(c+'/'+id),data:()=>clon(docs.get(c+'/'+id))}),onSnapshot(cb){cb({exists:docs.has(c+'/'+id),data:()=>clon(docs.get(c+'/'+id))});return()=>{};}})}),
    runTransaction:async fn=>{
      for(let i=0;i<5;i++){
        const lect=new Map(),w=[];
        const tx={get:async r=>{await Promise.resolve();lect.set(r.__k,ver.get(r.__k)||0);return {exists:docs.has(r.__k),data:()=>clon(docs.get(r.__k))};},set:(r,d,o)=>w.push([r,d,o])};
        const res=await fn(tx);await new Promise(r=>setTimeout(r,1));
        let ch=false;lect.forEach((v,k)=>{if((ver.get(k)||0)!==v)ch=true;});if(ch)continue;
        if(N.falla)throw new Error('sin red');
        const uid=N.uidActual;
        w.forEach(([r,d])=>regla(r,docs.get(r.__k),d,uid));
        w.forEach(([r,d,o])=>{const nd={};Object.keys(d).forEach(k=>{nd[k]=d[k]==='__TS__'?1:d[k];});docs.set(r.__k,o&&o.merge?Object.assign({},docs.get(r.__k)||{},clon(nd)):clon(nd));ver.set(r.__k,(ver.get(r.__k)||0)+1);});
        return res;
      }
      throw new Error('aborted');}};
  return N;
}
function dispositivo(N,o){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Promise,Error,Blob,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},db:N.db};
  vm.createContext(sb);sb.window=sb;
  const dom={addEventListener(){},querySelectorAll:()=>[],createElement:()=>({style:{}}),getElementById:()=>null,body:{appendChild(){}},head:{appendChild(){}},activeElement:null};
  sb.document=dom;
  sb.state={user:Object.assign({username:'mant',nombre:'Cuenta',rol:'mantenimiento_compartido'},o.user||{})};
  const uid=o.uid||'uid-cuenta';
  sb.firebase={auth:()=>({currentUser:{uid}}),firestore:{FieldValue:{serverTimestamp:()=>'__TS__'}}};
  sb.tareoAhoraServidor=()=>o.ahora||T0;
  sb.esMantCompartido=u=>String((u||sb.state.user).rol)==='mantenimiento_compartido';
  sb.mantTecnicoActivo=()=>o.tecnico===undefined?{workerId:'w1',nombre:'Ana Pérez',token:null}:o.tecnico;
  sb.tienePermiso=p=>(o.permisos||[]).includes(p);sb.esUsuarioSoloConsulta=u=>['Gerente General'].includes(String(u&&u.rol));
  sb.puedeGestionarRotacionMtto=()=>!!o.supervisor;sb.glacialCierresSesion=[];sb.LINES=[{key:'PET1',name:'PET 1'}];
  const envolver=fn=>(...a)=>{N.uidActual=uid;return fn(...a);};
  ['67-intervenciones-motor','67b-intervenciones-datos'].forEach(f=>vm.runInContext(leer('js/mantenimiento/'+f+'.js'),sb));
  vm.runInContext(leer('js/mantenimiento/37d-equipos-maestro.js'),sb);
  sb.glacialMantUI={UI:{},pintarDetalle(){},aviso(){},nombreLinea:x=>x,fmtFH:()=>'',modal(){return {querySelector:()=>({})};},formulario(){}};
  vm.runInContext(leer('js/mantenimiento/67e-preventivos.js'),sb);
  const P=sb.glacialPreventivos,A=sb.glacialIntervenciones;
  ['guardarPlan','iniciarEjecucion','cerrarEjecucion','reprogramar'].forEach(k=>{const f=P[k];P[k]=envolver(f);});
  const acc=A.accion;A.accion=envolver(acc);
  return {sb,P,A};
}

(async()=>{
  const {sb:sbP}=dispositivo(nube(),{});
  const P0=sbP.glacialPreventivos;
  /* ---------- calendario ---------- */
  ok(P0.sumar('2099-01-31',{tipo:'MESES',cada:1})==='2099-02-28'&&P0.sumar('2096-01-31',{tipo:'MESES',cada:1})==='2096-02-29'&&P0.sumar('2099-03-07',{tipo:'SEMANAS',cada:2})==='2099-03-21'&&P0.sumar('2099-03-07',{tipo:'DIAS',cada:30})==='2099-04-06','frecuencias de calendario: meses con fin de mes (28/29 feb), semanas y días');
  const plan0={frecuencia:{tipo:'MESES',cada:1},politica:'CALENDARIO'};
  const c1=P0.proximaFechaTras(plan0,'2099-03-10','2099-03-12');
  ok(c1.proxima==='2099-04-10'&&c1.ciclosOmitidos===0,'política CALENDARIO: próxima = fecha programada + frecuencia (10/03 + 1 mes, aunque se hizo el 12)');
  const c2=P0.proximaFechaTras({frecuencia:{tipo:'MESES',cada:1},politica:'EJECUCION'},'2099-03-10','2099-03-25');
  ok(c2.proxima==='2099-04-25','política EJECUCIÓN: próxima = fecha real de ejecución + frecuencia (25/03 + 1 mes)');
  const c3=P0.proximaFechaTras(plan0,'2099-01-10','2099-04-02');
  ok(c3.proxima==='2099-04-10'&&c3.ciclosOmitidos===2,'con mucho atraso, CALENDARIO salta a la primera fecha futura y deja anotados los ciclos omitidos (2)');
  const hoy='2099-03-07',base={activo:true,avisoDias:7,ultimaEjecucion:null};
  const E=(d,x)=>P0.estadoPlan(Object.assign({},base,{proximaFecha:d},x||{}),hoy,false);
  ok(E('2099-03-01')==='VENCIDO'&&E('2099-03-07')==='PENDIENTE'&&E('2099-03-12')==='PROXIMO'&&E('2099-04-20')==='PROGRAMADO'&&E('2099-04-20',{ultimaEjecucion:{}})==='COMPLETADO'&&P0.estadoPlan(Object.assign({},base,{proximaFecha:'2099-03-01'}),hoy,true)==='EN_EJECUCION'&&P0.estadoPlan({activo:false,proximaFecha:hoy},hoy,false)==='INACTIVO','estados de consulta: vencido, pendiente (hoy), próximo, programado, completado, en ejecución e inactivo');
  const eqs=[{id:'eq_1',activo:true,nombre:'Sopladora 1'}];
  const plan={equipoId:'eq_1',titulo:'Lubricación',descripcion:'',frecuencia:{tipo:'DIAS',cada:30},politica:'CALENDARIO',proximaFecha:'2099-03-07',tareas:[{id:'t1',titulo:'Lubricar rodamientos'}],avisoDias:7,activo:true,ventana:null,responsable:{tipo:'GRUPO'}};
  ok(P0.validarPlan(plan,eqs).errores.length===0,'un plan válido');
  const malos=[[{equipoId:'x'},/equipo/],[{titulo:'ab'},/título/],[{frecuencia:{tipo:'HORAS',cada:100}},/frecuencia/],[{frecuencia:{tipo:'DIAS',cada:0}},/frecuencia/],[{proximaFecha:'2099-02-30'},/fecha/],[{tareas:[]},/tarea/],[{tareas:[{id:'a',titulo:'x'}]},/tarea/],[{ventana:{inicio:'10:00',fin:'09:00'}},/ventana/],[{avisoDias:99},/aviso/],[{responsable:{tipo:'TECNICO'}},/técnico/],[{politica:'HORAS'},/política/]];
  malos.forEach(([x,re])=>ok(re.test(P0.validarPlan(Object.assign({},plan,x),eqs).errores.join(' ')),'plan inválido rechazado: '+JSON.stringify(x).slice(0,50)));
  ok(!/horas de uso|contador/i.test(JSON.stringify(P0.FRECUENCIAS)),'no existen frecuencias por horas de uso o ciclos (no hay contador fiable)');
  const tx=P0.tareasDeTexto('Lubricar rodamientos\n\n  Revisar faja \n',[{id:'t1',titulo:'Lubricar rodamientos',descripcion:'d'}]);
  ok(tx.length===2&&tx[0].id==='t1'&&tx[1].id!=='t1','las tareas se escriben una por línea y conservan su id si el título no cambió');

  /* ---------- plan → ejecución ---------- */
  const N=nube();
  N.docs.set('sync/configMantenimiento',{equiposMaestro:[{id:'eq_1',codigo:'PET1-SOP-01',nombre:'Sopladora 1',linea:'PET1',compartidoCon:[],tipo:'Sopladora',activo:true,datos:{},creadoEn:1,actualizadoEn:1}]});
  const sup=dispositivo(N,{user:{username:'sup',nombre:'Sup Mtto',rol:'Supervisor de Mantenimiento'},uid:'uid-sup',supervisor:true,permisos:['moduloMantenimiento','gestionar_rotacion_mantenimiento']});
  const ana=dispositivo(N,{});
  const luis=dispositivo(N,{tecnico:{workerId:'w2',nombre:'Luis Soto',token:null}});
  const jefe=dispositivo(N,{user:{username:'jef',nombre:'Jefe',rol:'Gerente General'},uid:'uid-jef'});
  let er=await falla(()=>ana.P.guardarPlan(plan));
  ok(er&&/Supervisor/.test(er.message)&&!N.docs.has('planesPreventivos/'+(plan.id||'')),'la cuenta compartida no define planes (solo el Supervisor de Mantenimiento / Administrador)');
  er=await falla(()=>jefe.P.guardarPlan(plan));ok(er&&/Supervisor/.test(er.message),'Gerencia/Jefatura no definen planes (consulta)');
  const creado=await sup.P.guardarPlan(plan);
  const id=creado.id;
  let pl=N.docs.get('planesPreventivos/'+id);
  ok(pl.version===1&&pl.rev===1&&pl.fechaOriginal==='2099-03-07'&&pl.equipoNombre==='Sopladora 1'&&pl.linea==='PET1'&&pl.responsable.tipo==='GRUPO'&&pl.historialPlan.length===1&&pl.creadoPor.nombre==='Sup Mtto','plan creado con versión, equipo del catálogo, responsable (grupo) e historial');
  /* ejecución sin duplicados desde dos dispositivos */
  const [e1,e2]=await Promise.all([ana.P.iniciarEjecucion(id),luis.P.iniciarEjecucion(id)]);
  const ids=[...N.docs.keys()].filter(k=>k.startsWith('intervenciones/'));
  ok(ids.length===1&&ids[0]==='intervenciones/'+ana.P.idEjecucion(id,'2099-03-07')&&(e1.existente!==e2.existente),'dos dispositivos inician la misma ejecución: una sola intervención preventiva (id determinista)');
  let ej=N.docs.get(ids[0]);
  ok(ej.tipo==='PREVENTIVO'&&ej.estado==='EN_INTERVENCION'&&ej.planId===id&&ej.plan.version===1&&ej.tareas.length===1&&ej.tareas[0].estado==='PENDIENTE'&&ej.tareas[0].por===null&&ej.equipoId==='eq_1'&&!ej.equipoPendiente,'la ejecución copia las tareas con la versión del plan y todas nacen PENDIENTES (llegar la fecha no cumple nada)');
  const intId=ids[0].split('/')[1];
  ana.A.recordar(N.docs.get(ids[0]));luis.A.recordar(N.docs.get(ids[0]));
  /* tareas y cierre */
  const cierre={diagnostico:'Rodamientos sin juego, aceite en nivel',accion:'Se lubricó y revisó el equipo',sinRepuestos:true,resultado:'OPERATIVO_VERIFICADO',finRealMs:T0,responsableId:'w1'};
  er=await falla(()=>ana.P.cerrarEjecucion(intId,cierre));
  ok(er&&/Marca la tarea/.test(er.message)&&N.docs.get('planesPreventivos/'+id).proximaFecha==='2099-03-07','no se cierra con tareas sin marcar y el plan no avanza');
  er=await falla(()=>ana.A.accion(intId,'TAREA',{id:'t1',estado:'NO_HECHA',motivo:''}));ok(er&&/por qué no/.test(er.message),'una tarea no realizada exige motivo');
  await ana.A.accion(intId,'TAREA',{id:'t1',estado:'HECHA'});
  ej=N.docs.get(ids[0]);ok(ej.tareas[0].estado==='HECHA'&&ej.tareas[0].por.nombre==='Ana Pérez'&&ej.historial[ej.historial.length-1].detalle.indexOf('realizada')>=0,'la tarea la marca una persona: queda su nombre y el historial');
  /* el plan cambia ANTES de cerrar: la ejecución en curso conserva su versión */
  const nuevoPlan=Object.assign({},N.docs.get('planesPreventivos/'+id),{tareas:[{id:'t1',titulo:'Lubricar rodamientos'},{id:'t2',titulo:'Verificar la tensión de la faja'}]});
  await sup.P.guardarPlan(nuevoPlan,{esperadoRev:1});
  pl=N.docs.get('planesPreventivos/'+id);
  ok(pl.version===2&&pl.tareas.length===2&&pl.historialPlan.length===2&&N.docs.get(ids[0]).tareas.length===1&&N.docs.get(ids[0]).plan.version===1,'cambiar el plan sube su versión y NO reescribe la ejecución ya iniciada (sigue en v1 con 1 tarea)');
  er=await falla(()=>sup.P.guardarPlan(nuevoPlan,{esperadoRev:1}));ok(er&&/cambió mientras lo editabas/.test(er.message),'dos supervisores editando: no se pisan');
  N.falla=true;
  er=await falla(()=>ana.P.cerrarEjecucion(intId,cierre));N.falla=false;
  ok(er&&N.docs.get(ids[0]).estado==='EN_INTERVENCION'&&N.docs.get('planesPreventivos/'+id).proximaFecha==='2099-03-07','si falla el guardado: ni la intervención se cierra ni el plan avanza (una sola transacción)');
  const cerrada=await ana.P.cerrarEjecucion(intId,cierre);
  pl=N.docs.get('planesPreventivos/'+id);
  ok(cerrada.estado==='CERRADA'&&pl.proximaFecha==='2099-04-06'&&pl.fechaOriginal==='2099-04-06'&&pl.ultimaEjecucion.intervencionId===intId&&pl.ultimaEjecucion.por.nombre==='Ana Pérez'&&pl.ultimaEjecucion.tareasHechas===1&&pl.rev===3,'al cerrar la ejecución el plan avanza (07/03 + 30 d = 06/04) y registra quién la hizo, cuándo y las tareas');
  ok(N.docs.get(ids[0]).tareas[0].estado==='HECHA'&&Object.keys(pl).filter(k=>!['historialPlan'].includes(k)).length>0,'la ejecución cerrada conserva sus tareas y resultado');
  /* la cuenta compartida solo avanza el ciclo: no puede cambiar el contenido del plan (la regla lo rechaza) */
  ana.sb.glacialPreventivos.escuchar();
  er=await falla(()=>ana.P.guardarPlan(Object.assign({},pl,{titulo:'Otro título'}),{esperadoRev:3}));ok(er,'la cuenta compartida no cambia tareas, frecuencia ni título (permiso)');
  /* ---------- reprogramar ---------- */
  await ana.P.reprogramar(id,'2099-04-20','Se solapa con producción de fin de mes');
  pl=N.docs.get('planesPreventivos/'+id);
  ok(pl.proximaFecha==='2099-04-20'&&pl.fechaOriginal==='2099-04-06'&&pl.reprogramaciones.length===1&&pl.reprogramaciones[0].anterior==='2099-04-06'&&pl.reprogramaciones[0].nueva==='2099-04-20'&&pl.reprogramaciones[0].motivo&&pl.reprogramaciones[0].original==='2099-04-06'&&pl.reprogramaciones[0].por.nombre==='Ana Pérez','reprogramar conserva fecha original, anterior, nueva, motivo y autor');
  er=await falla(()=>ana.P.reprogramar(id,'2099-04-25',''));ok(er&&/motivo/.test(er.message),'reprogramar exige motivo');
  er=await falla(()=>ana.P.reprogramar(id,'2099-04-20','mismo día otra vez'));ok(er&&/misma/.test(er.message),'no acepta la misma fecha');
  er=await falla(()=>ana.P.reprogramar(id,'2099-13-40','motivo cualquiera'));ok(er&&/válida/.test(er.message),'fecha inválida rechazada');
  const tarde=dispositivo(N,{ahora:Date.parse('2099-05-02T10:00:00')});
  tarde.P.escuchar();
  const planTarde=Object.assign({},pl,{id});
  ok(tarde.P.atrasoOriginal({fechaOriginal:'2099-04-06',proximaFecha:'2099-04-20'},'2099-04-10')===4&&tarde.P.atrasoOriginal({fechaOriginal:'2099-04-06',proximaFecha:'2099-04-06'},'2099-04-10')===0,'el atraso original de un plan reprogramado se sigue mostrando (4 días) y no se confunde con un plan al día');
  /* ejecución en curso impide reprogramar */
  await ana.P.reprogramar(id,'2099-03-08','Se adelanta porque hay parada de planta');
  pl=N.docs.get('planesPreventivos/'+id);
  const ahora2=dispositivo(N,{ahora:Date.parse('2099-03-08T09:00:00')});
  const ex2=await ahora2.P.iniciarEjecucion(id);
  ok(!ex2.existente&&ex2.doc.id==='p_'+id+'_2099-03-08'&&ex2.doc.plan.version===2&&ex2.doc.tareas.length===2,'la siguiente ejecución usa la versión vigente del plan (v2, 2 tareas)');
  ahora2.A.recordar(N.docs.get('intervenciones/'+ex2.doc.id));
  er=await falla(()=>ahora2.P.reprogramar(id,'2099-03-20','Intento con ejecución en curso'));ok(er&&/ejecución en curso/.test(er.message),'no se reprograma mientras hay una ejecución en curso del ciclo');
  const lejos=dispositivo(N,{ahora:Date.parse('2099-01-01T09:00:00')});
  er=await falla(()=>lejos.P.iniciarEjecucion(id));ok(er&&/Todavía no corresponde/.test(er.message),'no se inicia una ejecución antes de tiempo (fuera de la ventana de aviso)');
  /* ---------- avisos ---------- */
  const A0=sbP.glacialPreventivos;
  const planV={id:'p1',activo:true,titulo:'Lubricación',equipoNombre:'Sopladora 1',linea:'PET1',proximaFecha:'2099-03-01',avisoDias:7,responsable:{tipo:'GRUPO'}};
  const planP={id:'p2',activo:true,titulo:'Revisión eléctrica',equipoNombre:'Envasadora',linea:'PET1',proximaFecha:'2099-03-10',avisoDias:7,responsable:{tipo:'TECNICO',tecnicoId:'w2',nombre:'Luis Soto'}};
  const dSup={compartida:false,supervisor:true,tecnicoId:'',tecnicoNombre:''},dAna={compartida:true,supervisor:false,tecnicoId:'w1',tecnicoNombre:'Ana Pérez'},dLuis={compartida:true,supervisor:false,tecnicoId:'w2',tecnicoNombre:'Luis Soto'};
  const sal=(planes,ints,d)=>A0.calcularAvisos(planes,ints,d,T0,'2099-03-07');
  ok(sal([planV],[],dSup).length===1&&sal([planV],[],dSup)[0].severidad==='roja'&&/vencido/.test(sal([planV],[],dSup)[0].texto),'preventivo vencido: aviso rojo para el supervisor');
  ok(sal([planV],[],dAna).length===1,'un plan del grupo Mantenimiento avisa a la cuenta compartida');
  ok(sal([planP],[],dAna).length===0&&sal([planP],[],dLuis).length===1&&sal([planP],[],dSup).length===1&&sal([planP],[],dLuis)[0].severidad==='ambar','un plan asignado a Luis solo avisa a Luis (técnico identificado) y al supervisor, no a otro técnico');
  ok(sal([planV],[],null).length===0,'quien no es de Mantenimiento (Producción, jefatura) no recibe estos avisos');
  ok(sal([Object.assign({},planV,{activo:false})],[],dSup).length===0,'un plan inactivo no avisa');
  ok(sal([Object.assign({},planV,{proximaFecha:'2099-05-01'})],[],dSup).length===0,'un plan lejano no avisa');
  const idsEstado=new Set([sal([planV],[],dSup)[0].id,sal([Object.assign({},planV,{proximaFecha:'2099-03-07'})],[],dSup)[0].id]);
  ok(idsEstado.size===2,'el aviso cambia de identidad cuando cambia el estado (vuelve a aparecer aunque se haya «visto»)');
  const espera={id:'i1',estado:'EN_ESPERA',linea:'PET1',equipoId:'eq_1',equipoNombre:'Sopladora 1',espera:{motivo:'REPUESTO',desdeMs:T0-min(90)},participantes:[{tecnicoId:'w1',nombre:'Ana Pérez'}],seguimiento:[]};
  ok(sal([],[espera],dAna).length===1&&/en espera/.test(sal([],[espera],dAna)[0].texto)&&sal([],[espera],dLuis).length===0&&sal([],[espera],dSup).length===1,'intervención en espera (90 min): avisa a sus participantes y al supervisor, no a todos');
  ok(sal([],[Object.assign({},espera,{espera:{motivo:'REPUESTO',desdeMs:T0-min(10)}})],dSup).length===0,'una espera de 10 minutos todavía no avisa');
  const noOp={id:'i2',estado:'CERRADA',linea:'B7L',equipoId:'eq_2',equipoNombre:'Compresor',resultado:'NO_OPERATIVO',pendientes:'Cambiar rodamiento',cerradaMs:T0-dia,abiertaMs:T0-2*dia,participantes:[{tecnicoId:'w1',nombre:'Ana Pérez'}],seguimiento:[]};
  const sg=sal([],[noOp],dSup);
  ok(sg.length===1&&sg[0].severidad==='roja'&&/NO OPERATIVO/.test(sg[0].texto)&&sg[0].abrir==='i2','seguimiento pendiente de un cierre «No operativo»: aviso rojo que abre la intervención');
  ok(sal([],[Object.assign({},noOp,{resultado:'OPERATIVO_VERIFICADO',pendientes:''})],dSup).length===0,'sin pendientes no hay aviso');
  /* ---------- planificación: contrato, sin conexión ---------- */
  const v=sup.P.ventanasPrevistas('2099-03-01','2099-04-30');
  ok(Array.isArray(v)&&v.every(x=>x.estado==='PROPUESTA'&&x.confirmada===false&&x.origen==='PLAN_PREVENTIVO'),'las ventanas para Planificación son PROPUESTAS (nunca confirmadas ni paradas reales)');
  const src=leer('js/mantenimiento/67e-preventivos.js')+leer('js/mantenimiento/67b-intervenciones-datos.js');
  ok(!/glacialPlanificacion|65a-planificacion|NS\.tiemposDatos/.test(src.replace(/\/\*[^]*?\*\//g,'')),'Mantenimiento no escribe en Planificación: la integración aún no está conectada (solo se expone el contrato)');
  ok(!/arrayUnion|increment\(|array-contains|'!='|startAfter|\.update\(/.test(src.replace(/\/\*[^]*?\*\//g,'').replace(/\/\/.*$/gm,'')),'compatible con el puente de Supabase');
  ok(!/\bavancesTurno|bitacoraMantenimiento|estadoOperacion/.test(src.replace(/\/\*[^]*?\*\//g,'')),'los preventivos no escriben paradas oficiales, Avance/Cierre, la bitácora ni la programación productiva');
  const reglas=leer('_archivo/firebase/firestore.rules.etapa2.txt');
  ok(/match \/planesPreventivos\/\{id\}/.test(reglas)&&/hasOnly\(\['proximaFecha', 'fechaOriginal', 'ultimaEjecucion', 'reprogramaciones'/.test(reglas)&&/allow delete: if false/.test(reglas.slice(reglas.indexOf('match /planesPreventivos'),reglas.indexOf('match /planesPreventivos')+2200)),'reglas de Firestore: el plan lo define el supervisor; la cuenta compartida solo avanza el ciclo; nadie borra');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
