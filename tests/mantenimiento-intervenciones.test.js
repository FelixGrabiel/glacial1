/* Mantenimiento · intervenciones (etapa 1): motor puro (estados, cierre, tiempos) y persistencia con dos técnicos en distintos dispositivos con la MISMA cuenta,
   apertura sin duplicados, concurrencia, doble cierre, permisos y paridad con las reglas (version + 1 y una entrada de historial por cambio). */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const clon=v=>JSON.parse(JSON.stringify(v));
const T0=Date.parse('2099-03-07T08:00:00');
const min=n=>n*60000;

/* ---------- motor ---------- */
const sbM={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Error};vm.createContext(sbM);sbM.window=sbM;
vm.runInContext(leer('js/mantenimiento/67-intervenciones-motor.js'),sbM);
const M=sbM.GlacialIntervenciones;
const tec=(n,id)=>({nombre:n,tecnicoId:id,uid:'uid-cuenta',cuenta:'mant',identificadoPor:'PIN',tokenPin:null,rol:'mantenimiento_compartido'});
const ana=tec('Ana Pérez','w1'),luis=tec('Luis Soto','w2');
const falla=(f)=>{try{f();return null;}catch(e){return e;}};

const base=()=>M.nueva({linea:'PET1',problema:'La sopladora se detuvo por sobrecarga',origen:{tipo:'PARADA',id:'PET1|1|det',paradaId:'PET1|1|det'}},ana,T0);
{
  const d=base();
  ok(d.estado==='PENDIENTE'&&d.abierta&&d.version===1&&d.equipoPendiente&&d.equipoId===''&&d.historial.length===1&&d.historial[0].accion==='ABRIR'&&d.participantes[0].nombre==='Ana Pérez','apertura sin equipo («Equipo por identificar»): queda pendiente, con su historial y el técnico que abre');
  ok(d.abiertaPor.uid==='uid-cuenta'&&d.abiertaPor.tecnicoId==='w1','se guardan por separado el uid de la cuenta y el técnico identificado');
  ok(falla(()=>M.nueva({linea:'XX',problema:'abc'},ana,T0))&&falla(()=>M.nueva({linea:'PET1',problema:'avería'},{nombre:''},T0)),'sin línea válida, problema o autor no se abre');
  ok(M.idDeOrigen('PET1|1|det')===M.idDeOrigen('PET1|1|det')&&M.idDeOrigen('PET1|1|det')!==M.idDeOrigen('PET1|1|det','eq_2')&&!/[|]/.test(M.idDeOrigen('PET1|1|det')),'el id de origen es determinista y distingue equipos distintos del mismo evento');
  const i=M.aplicar(d,'INICIAR',{},ana,T0+min(5));
  ok(i.estado==='EN_INTERVENCION'&&i.inicioRealMs===T0+min(5)&&i.version===2&&i.historial.length===2,'iniciar: pasa a «En intervención», fija el inicio real y suma una entrada de historial');
  ok(falla(()=>M.aplicar(i,'INICIAR',{},ana,T0+min(6))).codigo==='YA_EN_CURSO','iniciar dos veces lo rechaza con mensaje claro');
  ok(/motivo/i.test(falla(()=>M.aplicar(i,'ESPERA',{},ana,T0+min(10))).message),'poner en espera exige motivo');
  ok(/Describe/.test(falla(()=>M.aplicar(i,'ESPERA',{motivo:'OTRO'},ana,T0+min(10))).message),'«Otro motivo» exige descripción');
  const e=M.aplicar(i,'ESPERA',{motivo:'REPUESTO',detalle:'Rodamiento SKF'},ana,T0+min(20));
  ok(e.estado==='EN_ESPERA'&&e.espera.motivo==='REPUESTO'&&/repuesto/i.test(e.historial[e.historial.length-1].detalle),'en espera con motivo (repuesto)');
  const r=M.aplicar(e,'RETOMAR',{},luis,T0+min(80));
  ok(r.estado==='EN_INTERVENCION'&&r.espera===null&&r.participantes.length===2,'retomar: vuelve a «En intervención» y suma al técnico que retoma como participante');
  ok(falla(()=>M.aplicar(i,'RETOMAR',{},ana,T0)).codigo==='NO_ESTA_EN_ESPERA','solo se retoma lo que está en espera');
  ok(falla(()=>M.aplicar(r,'PARTICIPAR',{},luis,T0+min(81))).codigo==='YA_PARTICIPA','unirse dos veces lo rechaza');
  const sep=M.aplicar(r,'CANCELAR',{motivo:'No era una falla real'},ana,T0+min(90));
  ok(sep.estado==='CANCELADA'&&!sep.abierta&&sep.cancelacion.motivo&&falla(()=>M.aplicar(sep,'INICIAR',{},ana,T0)).codigo==='NO_ABIERTA','cancelar exige motivo, es terminal y cierra la lista de abiertas');
}

/* ---------- repuestos ---------- */
{
  let d=M.aplicar(base(),'INICIAR',{},ana,T0+min(1));
  ok(falla(()=>M.aplicar(d,'REPUESTO',{descripcion:'',cantidad:1,unidad:'UND'},ana,T0)).message&&falla(()=>M.aplicar(d,'REPUESTO',{descripcion:'Rodamiento',cantidad:0,unidad:'UND'},ana,T0))&&falla(()=>M.aplicar(d,'REPUESTO',{descripcion:'Rodamiento',cantidad:1,unidad:'Pulgada'},ana,T0)),'repuesto: descripción o código, cantidad mayor que cero y unidad válida');
  d=M.aplicar(d,'REPUESTO',{id:'r1',codigo:'RD-6204',descripcion:'Rodamiento 6204',cantidad:2,unidad:'UND',observacion:'Cambiados'},ana,T0+min(30));
  ok(d.repuestos.length===1&&d.repuestos[0].por.nombre==='Ana Pérez'&&d.repuestos[0].en===T0+min(30)&&d.sinRepuestos===false,'repuesto con autor, fecha, cantidad y unidad (sin tocar ningún stock)');
  ok(falla(()=>M.aplicar(d,'REPUESTO',{id:'r1',descripcion:'Rodamiento 6204',cantidad:2,unidad:'UND'},ana,T0+min(31))).codigo==='REPUESTO_DUPLICADO','el mismo repuesto no se registra dos veces (reintento)');
  ok(/anúl/i.test(falla(()=>M.aplicar(d,'SIN_REPUESTOS',{},ana,T0)).message),'«No se utilizaron» no se puede declarar con repuestos registrados');
  const a=M.aplicar(d,'ANULAR_REPUESTO',{id:'r1',motivo:'Se cargó por error'},ana,T0+min(32));
  ok(a.repuestos[0].anulado&&a.repuestos.length===1&&M.aplicar(a,'SIN_REPUESTOS',{},ana,T0+min(33)).sinRepuestos===true,'anular conserva el registro (auditable) y permite declarar que no se usaron repuestos');
  ok(!/costo|precio|importe|stock/i.test(JSON.stringify(d.repuestos)),'sin costos ni stock: solo lo utilizado');
}

/* ---------- cierre ---------- */
const listoParaCerrar=()=>{
  let d=M.aplicar(base(),'INICIAR',{},ana,T0+min(5));
  d=M.aplicar(d,'REPUESTO',{id:'r1',descripcion:'Rodamiento 6204',cantidad:2,unidad:'UND'},ana,T0+min(30));
  return d;
};
const cierreOk=()=>({equipoId:'eq_1',equipoNombre:'Sopladora 1',diagnostico:'Rodamiento del eje principal desgastado',accion:'Se reemplazó el rodamiento y se alineó el eje',resultado:'OPERATIVO_VERIFICADO',
  finRealMs:T0+min(100),responsableId:'w1'});
{
  const d=listoParaCerrar();
  const v=M.validarCierre(d,{},T0+min(110));
  ok(v.errores.length>=4,'un cierre vacío lista todo lo que falta ('+v.errores.length+' faltantes)');
  const casos=[[{equipoId:'',equipoJustificacion:''},/equipo intervenido/],[{diagnostico:'corto'},/diagnóstico/],[{accion:'x'},/acción realizada/],[{resultado:''},/resultado/],[{finRealMs:0},/finalización/],
    [{finRealMs:T0+min(500)},/futuro/],[{finRealMs:T0+min(1)},/anterior al inicio/],[{resultado:'NO_OPERATIVO',pendientes:''},/pendientes/],[{resultado:'OPERATIVO_OBSERVACION',pendientes:''},/pendientes|restricción/]];
  casos.forEach(([x,re])=>{const c=Object.assign(cierreOk(),x);ok(re.test(M.validarCierre(d,c,T0+min(110)).errores.join(' | ')),'cierre rechazado: '+JSON.stringify(x));});
  ok(M.validarCierre(d,Object.assign(cierreOk(),{equipoId:'',equipoJustificacion:'No se pudo acceder a la placa del equipo'}),T0+min(110)).errores.length===0,'se puede cerrar sin equipo si se justifica la imposibilidad');
  const sinRep=M.aplicar(base(),'INICIAR',{},ana,T0+min(5));
  ok(/repuestos/.test(M.validarCierre(sinRep,cierreOk(),T0+min(110)).errores.join(' ')),'exige repuestos o la declaración «No se utilizaron»');
  ok(M.validarCierre(sinRep,Object.assign(cierreOk(),{sinRepuestos:true}),T0+min(110)).errores.length===0,'«No se utilizaron» cumple el requisito');
  const c=M.aplicar(d,'CERRAR',cierreOk(),ana,T0+min(105));
  ok(c.estado==='CERRADA'&&!c.abierta&&c.finRealMs===T0+min(100)&&c.cerradaMs===T0+min(105)&&c.cierre.por.nombre==='Ana Pérez'&&c.cierre.responsable.nombre==='Ana Pérez'&&c.equipoId==='eq_1'&&c.diagnostico&&c.accion&&c.historial.length===d.historial.length+1,'cierre completo: diagnóstico, acción, resultado, equipo, responsable y una entrada de historial');
  ok(JSON.stringify(c).indexOf('REANUDAR')<0&&!('estadoLinea' in c)&&!('lineaReanudada' in c),'cerrar no reanuda la línea ni toca estados operativos');
  ok(M.aplicar(d,'CERRAR',Object.assign(cierreOk(),{resultado:'NO_OPERATIVO',pendientes:'Falta repuesto del eje, la línea sigue limitada'}),ana,T0+min(105)).cierre.requiereSeguimiento===true,'«No operativo» queda marcado como que requiere seguimiento');
  const dc=falla(()=>M.aplicar(c,'CERRAR',cierreOk(),luis,T0+min(106)));
  ok(dc&&dc.codigo==='NO_ABIERTA'&&/Ana Pérez/.test(dc.message),'doble cierre: el segundo recibe un mensaje claro con quién cerró');
  ok(falla(()=>M.aplicar(c,'CORREGIR',{motivo:'Error de tipeo',diagnostico:'Otro diagnóstico más completo'},luis,T0+min(200),{puedeCorregir:false})).codigo==='SIN_PERMISO','corregir una intervención cerrada exige permiso');
  ok(/motivo/.test(falla(()=>M.aplicar(c,'CORREGIR',{motivo:'',diagnostico:'Otro diagnóstico más completo'},luis,T0+min(200),{puedeCorregir:true})).message),'y exige motivo');
  const k=M.aplicar(c,'CORREGIR',{motivo:'Se precisó el diagnóstico',diagnostico:'Rodamiento y sello del eje desgastados'},luis,T0+min(200),{puedeCorregir:true});
  ok(k.correcciones.length===1&&k.correcciones[0].cambios.diagnostico[0]===c.diagnostico&&k.historial.length===c.historial.length+1&&k.estado==='CERRADA','la corrección conserva lo anterior, el motivo y el autor, y deja historial');
  ok(falla(()=>M.aplicar(c,'VERIFICAR',{},luis,T0+min(210),{puedeVerificar:false})).codigo==='SIN_PERMISO'&&M.aplicar(c,'VERIFICAR',{nota:'Conforme'},luis,T0+min(210),{puedeVerificar:true}).verificacion.por.nombre==='Luis Soto','la verificación del supervisor es opcional y requiere permiso');
  ok(M.aplicar(d,'CERRAR',Object.assign(cierreOk(),{participantes:[{nombre:'Luis Soto',tecnicoId:'w2'}]}),ana,T0+min(105)).participantes.length===2,'se registran los participantes además del responsable');
  ok(/responsable/.test(falla(()=>M.aplicar(d,'CERRAR',Object.assign(cierreOk(),{responsableId:'w9'}),ana,T0+min(105))).message),'el responsable debe ser uno de los participantes');
}

/* ---------- seguimiento ---------- */
{
  let d=listoParaCerrar();
  d=M.aplicar(d,'SEGUIMIENTO',{texto:'Pedir sello del eje a Almacén'},ana,T0+min(40));
  const c=M.aplicar(d,'CERRAR',Object.assign(cierreOk(),{resultado:'OPERATIVO_OBSERVACION',pendientes:'Revisar sello en 3 días'}),ana,T0+min(105));
  ok(M.pendientes(c).seguimientos===1&&M.pendientes(c).total===2&&c.cierre.requiereSeguimiento,'pendientes visibles: seguimiento abierto + pendiente del cierre');
  const s=M.aplicar(c,'SEGUIMIENTO_RESUELTO',{id:c.seguimiento[0].id,intervencionId:'o_otra'},luis,T0+min(300));
  ok(s.seguimiento[0].estado==='VINCULADO'&&M.pendientes(s).seguimientos===0&&s.estado==='CERRADA','un seguimiento se puede vincular a otra orden aun con la intervención cerrada');
}

/* ---------- tiempos: espera separada ---------- */
{
  let d=M.aplicar(base(),'INICIAR',{},ana,T0+min(10));                    // respuesta 10 min
  d=M.aplicar(d,'ESPERA',{motivo:'REPUESTO'},ana,T0+min(40));             // 30 min de trabajo
  d=M.aplicar(d,'RETOMAR',{},ana,T0+min(100));                            // 60 min de espera
  d=M.aplicar(d,'REPUESTO',{id:'r',descripcion:'Sello',cantidad:1,unidad:'UND'},ana,T0+min(101));
  const c=M.aplicar(d,'CERRAR',Object.assign(cierreOk(),{finRealMs:T0+min(130)}),ana,T0+min(145));
  const t=M.tiempos(c,T0+min(200));
  ok(t.respuestaMs===min(10)&&t.esperaMs===min(60)&&t.trabajoMs===min(120-60)&&t.administrativoMs===min(15)&&t.completa,'tiempos separados: respuesta 10, espera 60, trabajo (inicio→fin 120 − espera 60) = 60 y administrativo 15 min');
  const abierta=M.aplicar(M.aplicar(base(),'INICIAR',{},ana,T0+min(10)),'ESPERA',{motivo:'ACCESO'},ana,T0+min(40));
  const ta=M.tiempos(abierta,T0+min(100));
  ok(ta.completa===false&&ta.esperaMs===min(60),'una intervención abierta no es «completa» y su espera sigue corriendo');
}

/* ---------- persistencia: dos dispositivos, misma cuenta ---------- */
function nube(){
  const docs=new Map(),ver=new Map(),oy=[];let confirm=0;
  const N={docs,falla:false,confirm:()=>confirm,reglasRechazadas:[]};
  const regla=(k,ant,nuevo)=>{                                        // paridad con firestore.rules: version+1, +1 entrada de historial, hora/uid
    if(!ant){if(nuevo.version!==1||!Array.isArray(nuevo.historial)||nuevo.historial.length!==1)throw new Error('permission-denied (crear)');return;}
    if(ant.estado==='CERRADA'||ant.estado==='CANCELADA'){if(!N.permitirCorregirCerradas)throw new Error('permission-denied (cerrada)');}
    if(nuevo.version!==ant.version+1)throw new Error('permission-denied (version)');
    if(nuevo.historial.length!==ant.historial.length+1)throw new Error('permission-denied (historial)');
  };
  const cons=(c,fil,ord,lim)=>({where:(f,op,v)=>cons(c,fil.concat([[f,op,v]]),ord,lim),orderBy:(f,d)=>cons(c,fil,[f,d],lim),limit:n=>cons(c,fil,ord,n),
    _l(){let l=[...docs.entries()].filter(([k])=>k.startsWith(c+'/')).map(([k,v])=>({id:k.slice(c.length+1),v}));
      fil.forEach(([f,op,v])=>{l=l.filter(x=>op==='=='?x.v[f]===v:Number(x.v[f])>=v);});if(ord)l.sort((a,b)=>Number(b.v[ord[0]])-Number(a.v[ord[0]]));if(lim)l=l.slice(0,lim);return l.map(x=>({id:x.id,data:()=>clon(x.v)}));},
    onSnapshot(cb){const f=()=>cb({docs:this._l()});oy.push(f);f();return()=>{oy.splice(oy.indexOf(f),1);};}});
  N.db={collection:c=>Object.assign(cons(c,[],null,0),{doc:id=>({__c:c,__id:id,__k:c+'/'+id,get:async()=>({exists:docs.has(c+'/'+id),data:()=>clon(docs.get(c+'/'+id))})})}),
    runTransaction:async fn=>{
      for(let i=0;i<5;i++){
        const lect=new Map(),w=[];
        const tx={get:async r=>{await Promise.resolve();lect.set(r.__k,ver.get(r.__k)||0);return {exists:docs.has(r.__k),data:()=>clon(docs.get(r.__k))};},set:(r,d)=>w.push([r,d])};
        const res=await fn(tx);await new Promise(r=>setTimeout(r,1));
        let choque=false;lect.forEach((v,k)=>{if((ver.get(k)||0)!==v)choque=true;});if(choque)continue;
        if(N.falla)throw new Error('sin red');
        w.forEach(([r,d])=>regla(r.__k,docs.get(r.__k),d));
        w.forEach(([r,d])=>{const o={};Object.keys(d).forEach(k=>{o[k]=d[k]==='__TS__'?1:d[k];});docs.set(r.__k,clon(o));ver.set(r.__k,(ver.get(r.__k)||0)+1);});
        confirm++;oy.slice().forEach(f=>f());return res;
      }
      throw new Error('aborted');}};
  return N;
}
function dispositivo(N,o){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Promise,Error,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},db:N.db};
  vm.createContext(sb);sb.window=sb;
  sb.state={user:Object.assign({username:'mant',nombre:'Cuenta Mant',rol:'mantenimiento_compartido'},o.user||{})};
  sb.firebase={auth:()=>({currentUser:{uid:o.uid||'uid-cuenta'}}),firestore:{FieldValue:{serverTimestamp:()=>'__TS__'}}};
  sb.tareoAhoraServidor=()=>o.ahora||T0+min(60);
  sb.esMantCompartido=u=>String((u||sb.state.user).rol)==='mantenimiento_compartido';
  sb.mantTecnicoActivo=()=>o.tecnico===undefined?null:o.tecnico;
  sb.tienePermiso=p=>(o.permisos||[]).includes(p);
  sb.esUsuarioSoloConsulta=u=>['Gerente General','Jefatura'].includes(String(u&&u.rol));
  sb.glacialCierresSesion=[];
  vm.runInContext(leer('js/mantenimiento/67-intervenciones-motor.js'),sb);
  vm.runInContext(leer('js/mantenimiento/67b-intervenciones-datos.js'),sb);
  return sb.glacialIntervenciones;
}

(async()=>{
  const N=nube();
  const dispA=dispositivo(N,{tecnico:{workerId:'w1',nombre:'Ana Pérez',token:null}});
  const dispB=dispositivo(N,{tecnico:{workerId:'w2',nombre:'Luis Soto',token:null}});
  const sinTec=dispositivo(N,{tecnico:null});
  const jefe=dispositivo(N,{user:{username:'jef',nombre:'Jefe',rol:'Gerente General'},uid:'uid-jef'});

  ok(dispA.permisos().escribir&&dispB.permisos().escribir&&!jefe.permisos().escribir&&jefe.permisos().ver,'la cuenta compartida escribe; Gerencia/Jefatura solo consulta');
  /* apertura sin duplicados */
  const o={linea:'PET1',problema:'Sopladora detenida por sobrecarga',origen:{tipo:'PARADA',id:'PET1|99|det',paradaId:'PET1|99|det'}};
  const [r1,r2]=await Promise.all([dispA.abrir(o),dispB.abrir(o)]);
  ok([...N.docs.keys()].filter(k=>k.startsWith('intervenciones/')).length===1&&(r1.existente!==r2.existente),'dos dispositivos abren desde la misma parada a la vez: queda UNA intervención (el otro recibe la existente)');
  const id=r1.doc.id;
  const r3=await dispA.abrir(o);
  ok(r3.existente&&[...N.docs.keys()].length===1,'reintento o doble clic: no se duplica');
  const otro=await dispA.abrir(Object.assign({},o,{equipoId:'eq_2',equipoNombre:'Etiquetadora'}));
  ok(!otro.existente&&[...N.docs.keys()].length===2,'una intervención legítima en otro equipo de la misma línea y origen sí se permite');
  ok(N.docs.get('intervenciones/'+id).abiertaPor.nombre!==undefined&&N.docs.get('intervenciones/'+id).abiertaUid==='uid-cuenta','se guarda el uid de la cuenta y el técnico por separado');
  /* identidad */
  let er='';try{await sinTec.abrir({linea:'PET1',problema:'Sin técnico identificado'});}catch(e){er=e.message;}
  ok(/Identifícate/.test(er),'sin técnico identificado (PIN) en la cuenta compartida no se escribe');
  er='';try{await jefe.accion(id,'INICIAR',{});}catch(e){er=e.message;}
  ok(/consulta/.test(er)&&N.docs.get('intervenciones/'+id).estado==='PENDIENTE','el usuario de consulta no escribe mediante llamadas directas');
  /* dos técnicos, dos dispositivos, misma cuenta: cada acción lleva su nombre */
  await dispA.accion(id,'INICIAR',{});
  await dispB.accion(id,'PARTICIPAR',{});
  let d=N.docs.get('intervenciones/'+id);
  ok(d.participantes.map(p=>p.nombre).sort().join()==='Ana Pérez,Luis Soto'&&d.historial.find(h=>h.accion==='INICIAR').por.nombre==='Ana Pérez'&&d.historial.find(h=>h.accion==='PARTICIPAR').por.nombre==='Luis Soto'&&d.historial.every(h=>h.por.uid==='uid-cuenta'),
    'dos técnicos distintos con la misma cuenta: cada acción queda con su nombre y el mismo uid de cuenta');
  /* ediciones concurrentes: ambos repuestos se conservan */
  await Promise.all([
    dispA.accion(id,'REPUESTO',{descripcion:'Rodamiento 6204',cantidad:2,unidad:'UND'}),
    dispB.accion(id,'REPUESTO',{descripcion:'Grasa',cantidad:1,unidad:'Kg'})]);
  d=N.docs.get('intervenciones/'+id);
  ok(d.repuestos.length===2&&d.version===5&&d.historial.length===5,'ediciones concurrentes: no se sobrescribe la intervención completa, los dos repuestos y el historial se conservan (versión 5)');
  /* doble cierre */
  const cierre=(x)=>Object.assign({equipoId:'eq_1',equipoNombre:'Sopladora 1',diagnostico:'Rodamiento del eje desgastado',accion:'Se reemplazó y alineó',resultado:'OPERATIVO_VERIFICADO',finRealMs:T0+min(60),responsableId:'w1'},x||{});
  const rs=await Promise.allSettled([dispA.accion(id,'CERRAR',cierre()),dispB.accion(id,'CERRAR',cierre({responsableId:'w2'}))]);
  const buenos=rs.filter(x=>x.status==='fulfilled'),malos=rs.filter(x=>x.status==='rejected');
  d=N.docs.get('intervenciones/'+id);
  ok(buenos.length===1&&malos.length===1&&/ya está cerrada/.test(malos[0].reason.message)&&d.estado==='CERRADA'&&d.historial.filter(h=>h.a==='CERRADA').length===1,'doble cierre simultáneo: una sola transición válida y mensaje claro para el segundo');
  ok(d.abierta===false&&d.cerradaMs>0&&!('lineaReanudada' in d),'cerrada: sale de la lista de abiertas y no toca la línea');
  er='';try{await dispA.accion(id,'REPUESTO',{descripcion:'Tornillo',cantidad:1,unidad:'UND'});}catch(e){er=e.message;}
  ok(/cerrada/.test(er)&&N.docs.get('intervenciones/'+id).repuestos.length===2,'una intervención cerrada no admite más cambios de los técnicos');
  /* corregir exige permiso (supervisor) y reglas */
  const sup=dispositivo(N,{user:{username:'sup',nombre:'Sup Mtto',rol:'Supervisor de Mantenimiento'},uid:'uid-sup',permisos:['moduloMantenimiento','gestionar_rotacion_mantenimiento']});
  N.permitirCorregirCerradas=true;
  await sup.accion(id,'CORREGIR',{motivo:'Se precisó el diagnóstico',diagnostico:'Rodamiento y sello del eje desgastados'});
  d=N.docs.get('intervenciones/'+id);
  ok(d.correcciones.length===1&&d.estado==='CERRADA'&&d.historial[d.historial.length-1].por.nombre==='Sup Mtto','un supervisor corrige con motivo y queda historial (los técnicos de la cuenta compartida no)');
  er='';try{await dispA.accion(id,'CORREGIR',{motivo:'Cambio de opinión',diagnostico:'Diagnóstico distinto del anterior'});}catch(e){er=e.message;}
  ok(/permiso/.test(er),'la cuenta compartida no corrige intervenciones cerradas');
  N.permitirCorregirCerradas=false;
  /* cambio de permisos */
  const rev=dispositivo(N,{tecnico:{workerId:'w3',nombre:'Rosa',token:null}});
  const abierta2=await rev.abrir({linea:'B7L',problema:'Fuga en la tapadora'});
  ok(abierta2.doc.estado==='PENDIENTE','otro técnico identificado abre sin problema');
  /* sin conexión / error de escritura */
  const antes=clon(N.docs.get('intervenciones/'+abierta2.doc.id));
  N.falla=true;er='';try{await rev.accion(abierta2.doc.id,'INICIAR',{});}catch(e){er=e.message;}N.falla=false;
  ok(er!==''&&JSON.stringify(N.docs.get('intervenciones/'+abierta2.doc.id))===JSON.stringify(antes),'si el guardado falla no queda nada a medias (el texto sigue en pantalla para reintentar)');
  /* lectura en vivo */
  dispA.escucharAbiertas();
  ok(dispA.abiertas().length>=2&&dispA.abiertas().every(x=>x.abierta),'la lista en vivo trae solo las abiertas');
  const sinCom=s=>s.replace(/\/\*[^]*?\*\//g,'').replace(/\/\/.*$/gm,'');
  ok(!/arrayUnion|increment\(|array-contains|'!='|startAfter|\.update\(/.test(sinCom(leer('js/mantenimiento/67b-intervenciones-datos.js')+leer('js/mantenimiento/67-intervenciones-motor.js'))),'compatible con el puente de Supabase');
  ok(!/\bparadasOficiales\b|avancesTurno|bitacoraMantenimiento/.test(leer('js/mantenimiento/67b-intervenciones-datos.js')+leer('js/mantenimiento/67-intervenciones-motor.js')),'las intervenciones no escriben paradas oficiales ni la bitácora operativa');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
