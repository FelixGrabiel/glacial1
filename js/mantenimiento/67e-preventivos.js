/* =============================================================
   MANTENIMIENTO · PLAN PREVENTIVO (por equipo) · tareas, responsables, ejecuciones y avisos internos

   · Un PLAN: equipo, título, descripción, frecuencia de CALENDARIO (cada N días / semanas / meses), próxima fecha, política de próxima fecha, responsable o grupo,
     ventana prevista, lista de tareas, estado activo y versión. Las frecuencias por horas de uso o ciclos NO existen: no hay un contador fiable de horas de
     máquina y no se deducen del tiempo que la página estuvo abierta.
   · Una EJECUCIÓN es una intervención PREVENTIVA (67) con id determinista p_{plan}_{fecha}: varios dispositivos que la inician a la vez obtienen LA MISMA.
     Copia las tareas del plan en ese momento (conserva su versión): cambiar el plan después NO reescribe ejecuciones anteriores. Una tarea solo pasa a
     «realizada» o «no realizada» (con motivo) cuando una persona la marca: llegar la fecha no cumple nada.
   · POLÍTICA de próxima fecha (visible en cada plan): «CALENDARIO» = fecha programada + frecuencia (si se atrasó, salta a la primera fecha futura y deja anotados
     los ciclos omitidos); «EJECUCIÓN» = fecha real de ejecución + frecuencia.
   · REPROGRAMAR conserva la fecha original, la anterior, la nueva y el motivo (arreglo reprogramaciones): el atraso original NO se borra (se muestra y se cuenta).
   · AVISOS en el centro de avisos existente (46): preventivo próximo / de hoy / vencido, intervención en espera y seguimiento pendiente. Se dirigen solo a quien
     corresponde con los datos que SÍ existen (responsable del plan, participantes, supervisor de Mantenimiento/Administrador, la cuenta compartida si el técnico
     identificado es el responsable o el plan es del grupo). No hay envío por WhatsApp/SMS ni «técnico de turno» inventado.
   · PLANIFICACIÓN: la ventana prevista de un plan puede consultarse con glacialPreventivos.ventanasPrevistas(desde, hasta); son PROPUESTAS (nunca una parada
     real ni una ventana confirmada). Planificación todavía NO la consume: el contrato está en docs/mantenimiento/mantenimiento-intervenciones.md.
   Datos: colección planesPreventivos (un documento por plan). Sin where in/!=, increment, arrayUnion ni update con rutas (puente de Supabase).
   Cargar después de 67c-intervenciones-pantalla.js.
   ============================================================= */
(function(){
  'use strict';
  const M=window.GlacialIntervenciones;
  const API=()=>window.glacialIntervenciones;
  const UIM=()=>window.glacialMantUI;
  const COLECCION='planesPreventivos';
  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const txt=v=>String(v==null?'':v).trim();
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sinConexion=()=>!!(window.glacialEstadoDatos&&window.glacialEstadoDatos.enLinea===false);
  const ts=()=>firebase.firestore.FieldValue.serverTimestamp();

  /* =========================================================
     CALENDARIO (funciones puras)
     ========================================================= */
  const FRECUENCIAS={DIAS:'día(s)',SEMANAS:'semana(s)',MESES:'mes(es)'};
  const POLITICAS={CALENDARIO:'Calendario: fecha programada + frecuencia',EJECUCION:'Ejecución real: fecha en que se hizo + frecuencia'};
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const parse=f=>{const [y,m,d]=String(f).split('-').map(Number);return new Date(y,m-1,d,12,0,0);};
  const fechaOk=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''))&&iso(parse(f))===f;
  const diasEntre=(a,b)=>Math.round((parse(b)-parse(a))/86400000);        // b − a
  function sumar(f,frec,veces){
    const k=Math.max(1,Number(frec.cada)||1)*(veces||1),d=parse(f);
    if(frec.tipo==='MESES'){const dia=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+k);const ult=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(dia,ult));}
    else d.setDate(d.getDate()+(frec.tipo==='SEMANAS'?7*k:k));
    return iso(d);
  }
  /* Próxima fecha tras ejecutar: devuelve {proxima, ciclosOmitidos}. */
  function proximaFechaTras(plan,fechaProgramada,fechaEjecucion){
    const base=plan.politica==='EJECUCION'?fechaEjecucion:fechaProgramada;
    let prox=sumar(base,plan.frecuencia),omitidos=0;
    if(plan.politica!=='EJECUCION')while(prox<=fechaEjecucion&&omitidos<500){prox=sumar(prox,plan.frecuencia);omitidos++;}   // se salta lo ya pasado y se anota
    return {proxima:prox,ciclosOmitidos:omitidos};
  }
  /* Estado de consulta. enEjecucion = hay una intervención preventiva ABIERTA de este ciclo. */
  function estadoPlan(plan,hoy,enEjecucion){
    if(!plan||plan.activo===false)return 'INACTIVO';
    if(enEjecucion)return 'EN_EJECUCION';
    const d=diasEntre(hoy,plan.proximaFecha);
    if(d<0)return 'VENCIDO';
    if(d===0)return 'PENDIENTE';
    if(d<=num(plan.avisoDias))return 'PROXIMO';
    return plan.ultimaEjecucion?'COMPLETADO':'PROGRAMADO';
  }
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const ETQ_ESTADO={EN_EJECUCION:'En ejecución',VENCIDO:'Vencido',PENDIENTE:'Pendiente (hoy)',PROXIMO:'Próximo',COMPLETADO:'Completado (al día)',PROGRAMADO:'Programado',INACTIVO:'Inactivo'};
  const atrasoOriginal=(plan,hoy)=>plan&&plan.fechaOriginal&&plan.fechaOriginal<hoy&&plan.fechaOriginal!==plan.proximaFecha?diasEntre(plan.fechaOriginal,hoy):0;
  const hoyOperativo=()=>{try{if(window.GlacialIndicadores&&window.GlacialIndicadores.diaOperativo)return window.GlacialIndicadores.diaOperativo(ahora());}catch(_){/* cálculo propio */}return iso(new Date(ahora()));};

  /* Tareas desde texto (una por línea); conserva el id de una tarea existente con el mismo título. */
  function tareasDeTexto(texto,previas){
    const ya=new Map((previas||[]).map(t=>[t.titulo.toLowerCase(),t]));
    return String(texto||'').split('\n').map(s=>s.trim()).filter(Boolean).map((titulo,i)=>{
      const p=ya.get(titulo.toLowerCase());return {id:p?p.id:'t'+Date.now().toString(36)+i+Math.random().toString(36).slice(2,5),titulo:titulo.slice(0,120),descripcion:p?p.descripcion||'':''};
    });
  }
  function validarPlan(p,equipos){
    const errores=[];
    const eq=(equipos||[]).find(e=>e.id===p.equipoId);
    if(!eq)errores.push('Elige el equipo (debe existir en el catálogo).');
    else if(!eq.activo&&p.activo!==false)errores.push('El equipo está inactivo.');
    if(txt(p.titulo).length<3||txt(p.titulo).length>80)errores.push('El título debe tener entre 3 y 80 caracteres.');
    if(txt(p.descripcion).length>400)errores.push('La descripción es demasiado larga.');
    const f=p.frecuencia||{};
    if(!FRECUENCIAS[f.tipo]||!Number.isInteger(Number(f.cada))||Number(f.cada)<1||Number(f.cada)>(f.tipo==='MESES'?60:f.tipo==='SEMANAS'?104:730))errores.push('Indica la frecuencia (cada cuántos días, semanas o meses).');
    if(!POLITICAS[p.politica])errores.push('Elige la política de próxima fecha.');
    if(!fechaOk(p.proximaFecha))errores.push('La próxima fecha no es válida.');
    if(!Array.isArray(p.tareas)||!p.tareas.length)errores.push('Agrega al menos una tarea.');
    else if(p.tareas.length>30)errores.push('Máximo 30 tareas.');
    else if(p.tareas.some(t=>txt(t.titulo).length<3))errores.push('Cada tarea necesita un título (mínimo 3 caracteres).');
    const v=p.ventana;
    if(v&&(v.inicio||v.fin)){
      const h=/^([01]\d|2[0-3]):[0-5]\d$/;
      if(!h.test(v.inicio||'')||(v.fin&&!h.test(v.fin)))errores.push('La ventana prevista necesita horas válidas (HH:MM).');
      else if(v.fin&&v.fin<=v.inicio)errores.push('La hora de fin de la ventana debe ser posterior al inicio.');
    }
    const a=Number(p.avisoDias);if(!Number.isInteger(a)||a<0||a>60)errores.push('Los días de aviso deben ser un entero entre 0 y 60.');
    const r=p.responsable||{};
    if(r.tipo==='TECNICO'&&!txt(r.tecnicoId))errores.push('Elige el técnico responsable.');
    return {errores};
  }

  /* =========================================================
     DATOS EN VIVO
     ========================================================= */
  const S={planes:new Map(),listo:false,error:'',desub:null,reintento:null};
  const oyentes=[];
  const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(e){console.warn('Preventivos:',e&&e.message||e);}});
  const docPlan=(id,x)=>Object.assign({},x,{id,rev:num(x.rev)});
  function escuchar(){
    if(S.desub||typeof db==='undefined'||typeof state==='undefined'||!state.user||!API()||!API().permisos().ver)return;
    try{
      S.desub=db.collection(COLECCION).onSnapshot(snap=>{
        S.planes=new Map(snap.docs.map(d=>[d.id,docPlan(d.id,d.data({serverTimestamps:'estimate'}))]));S.listo=true;S.error='';avisar();
      },e=>{S.error='No se pudieron cargar los planes preventivos: '+((e&&e.message)||e);S.listo=true;S.desub=null;avisar();});
    }catch(e){S.error=String((e&&e.message)||e);S.desub=null;}
  }
  function detener(){if(typeof S.desub==='function'){try{S.desub();}catch(_){/* ya cerrada */}}S.desub=null;S.planes=new Map();S.listo=false;S.error='';}
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(detener);
  S.reintento=setInterval(()=>{if(!S.desub&&typeof state!=='undefined'&&state.user)escuchar();},4000);
  const lista=()=>[...S.planes.values()];
  const porId=id=>S.planes.get(id)||null;
  const idEjecucion=(planId,fecha)=>'p_'+String(planId).replace(/[^A-Za-z0-9_-]/g,'-')+'_'+fecha;
  function ejecucionAbierta(plan){
    if(!plan)return null;
    const d=API().porId(idEjecucion(plan.id,plan.proximaFecha));
    return d&&M.estaAbierta(d.estado)?d:null;
  }
  function estadoDe(plan){return estadoPlan(plan,hoyOperativo(),!!ejecucionAbierta(plan));}

  /* =========================================================
     ESCRITURAS
     ========================================================= */
  function exigir(soloSupervisor){
    const A=API(),p=A.permisos();
    if(soloSupervisor?!p.puedeCorregir:!p.escribir)throw new Error(soloSupervisor?'Solo el Supervisor de Mantenimiento o el Administrador pueden definir planes preventivos.':'No tienes permiso para modificar: tu acceso es de consulta.');
    if(sinConexion())throw new Error('Sin conexión: el cambio NO se guardó.');
    const q=A.quienActua();
    if(!q)throw new Error('Identifícate como técnico (PIN) para registrar cambios.');
    if(!q.uid)throw new Error('No hay una sesión segura activa: no se puede registrar quién hace el cambio.');
    return {p,q};
  }
  const refPlan=id=>db.collection(COLECCION).doc(id);
  const control=(doc,q)=>Object.assign({},doc,{actualizadaEn:ts(),actualizadaUid:q.uid});
  const contenido=p=>JSON.stringify([p.equipoId,p.titulo,p.descripcion,p.frecuencia,p.politica,p.ventana,p.responsable,(p.tareas||[]).map(t=>[t.id,t.titulo,t.descripcion]),p.avisoDias]);

  async function guardarPlan(plan,opc){
    const {q}=exigir(true);
    const o=opc||{};
    const E=window.glacialEquiposMaestro,equipos=E?E.lista():[];
    const eq=equipos.find(e=>e.id===plan.equipoId);
    const nuevo={equipoId:txt(plan.equipoId),equipoNombre:eq?eq.nombre:txt(plan.equipoNombre),linea:eq?eq.linea:txt(plan.linea),titulo:txt(plan.titulo),descripcion:txt(plan.descripcion),
      frecuencia:{tipo:plan.frecuencia&&plan.frecuencia.tipo,cada:Number(plan.frecuencia&&plan.frecuencia.cada)},politica:plan.politica,proximaFecha:plan.proximaFecha,
      ventana:plan.ventana&&(plan.ventana.inicio||plan.ventana.fin)?{inicio:txt(plan.ventana.inicio),fin:txt(plan.ventana.fin)}:null,
      responsable:plan.responsable&&plan.responsable.tipo==='TECNICO'?{tipo:'TECNICO',tecnicoId:txt(plan.responsable.tecnicoId),nombre:txt(plan.responsable.nombre)}:{tipo:'GRUPO',grupo:'MANTENIMIENTO'},
      tareas:(plan.tareas||[]).map(t=>({id:t.id,titulo:txt(t.titulo),descripcion:txt(t.descripcion)})),avisoDias:Number(plan.avisoDias),activo:plan.activo!==false};
    const v=validarPlan(nuevo,equipos);
    if(v.errores.length)throw new Error(v.errores.join(' '));
    let resultado=null;
    await db.runTransaction(async tx=>{
      const id=txt(plan.id)||'pl_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
      const snap=await tx.get(refPlan(id));
      const act=snap.exists?docPlan(id,snap.data()):null;
      if(plan.id&&!act)throw new Error('El plan ya no existe.');
      const por={nombre:q.nombre,tecnicoId:q.tecnicoId,uid:q.uid};
      if(!act){
        const doc=Object.assign({},nuevo,{id,version:1,rev:1,fechaOriginal:nuevo.proximaFecha,reprogramaciones:[],ultimaEjecucion:null,creadoPor:por,creadoMs:ahora(),
          historialPlan:[{id:'h'+Date.now().toString(36),en:ahora(),por,version:1,detalle:'Creó el plan'}]});
        tx.set(refPlan(id),Object.assign(control(doc,q),{creadoUid:q.uid,creadoEn:ts()}));resultado=doc;return;
      }
      if(o.esperadoRev!==undefined&&num(act.rev)!==num(o.esperadoRev))throw new Error('El plan cambió mientras lo editabas. Ciérralo y vuelve a abrirlo para ver el valor actual.');
      const cambioContenido=contenido(act)!==contenido(Object.assign({},act,nuevo));
      const doc=Object.assign({},act,nuevo,{proximaFecha:act.proximaFecha,rev:num(act.rev)+1,version:num(act.version)+(cambioContenido?1:0)});
      if(act.activo!==nuevo.activo||cambioContenido)doc.historialPlan=(act.historialPlan||[]).concat([{id:'h'+Date.now().toString(36),en:ahora(),por,version:doc.version,detalle:(act.activo!==nuevo.activo?(nuevo.activo?'Activó':'Desactivó')+' el plan':'Modificó el plan (versión '+doc.version+')')}]).slice(-60);
      tx.set(refPlan(id),control(Object.assign({},doc,{creadoEn:snap.data().creadoEn,creadoUid:snap.data().creadoUid}),q));resultado=doc;
    });
    return resultado;
  }

  /* Genera (o recupera) la ejecución del ciclo actual: intervención preventiva con id determinista. */
  async function iniciarEjecucion(planId){
    const {q}=exigir(false);
    let resultado=null;
    await db.runTransaction(async tx=>{
      resultado=null;
      const ps=await tx.get(refPlan(planId));
      if(!ps.exists)throw new Error('El plan ya no existe.');
      const plan=docPlan(planId,ps.data());
      if(plan.activo===false)throw new Error('El plan está inactivo.');
      const hoy=hoyOperativo();
      if(diasEntre(hoy,plan.proximaFecha)>num(plan.avisoDias))throw new Error('Todavía no corresponde ejecutar este plan (próxima fecha: '+plan.proximaFecha+'). Si hace falta adelantarlo, el supervisor puede reprogramarlo.');
      const id=idEjecucion(planId,plan.proximaFecha),is=await tx.get(db.collection(API().COLECCION).doc(id));
      if(is.exists){resultado={doc:Object.assign({},is.data(),{id}),existente:true};return;}
      const d=M.nueva({id,linea:plan.linea,equipoId:plan.equipoId,equipoNombre:plan.equipoNombre,tipo:'PREVENTIVO',prioridad:'MEDIA',problema:plan.titulo+(plan.descripcion?' · '+plan.descripcion:''),
        origen:{tipo:'PLAN',id:planId+'|'+plan.proximaFecha,plan:{id:planId,version:plan.version,fecha:plan.proximaFecha,titulo:plan.titulo}},
        planId,planFecha:plan.proximaFecha,tareas:plan.tareas,plan:{id:planId,version:plan.version,fecha:plan.proximaFecha,titulo:plan.titulo,politica:plan.politica,frecuencia:plan.frecuencia}},q,ahora(),{iniciar:true});
      tx.set(db.collection(API().COLECCION).doc(id),API().control(d,q,true));
      resultado={doc:d,existente:false};
    });
    API().recordar(resultado.doc);
    return resultado;
  }

  /* Cierra la ejecución y avanza el plan EN LA MISMA TRANSACCIÓN (o las dos cosas, o ninguna). */
  async function cerrarEjecucion(intId,datos){
    const A=API(),{p,q}=exigir(false);
    let nuevo=null;
    await db.runTransaction(async tx=>{
      nuevo=null;
      const is=await tx.get(db.collection(A.COLECCION).doc(intId));
      if(!is.exists)throw new Error('La intervención ya no existe.');
      const act=Object.assign({},is.data(),{id:intId});
      const cs=await tx.get(db.collection('sync').doc('configMantenimiento'));
      const cfg=cs.exists&&cs.data().evidenciasRequeridas&&typeof cs.data().evidenciasRequeridas==='object'?cs.data().evidenciasRequeridas:{};
      nuevo=M.aplicar(act,'CERRAR',datos,q,ahora(),Object.assign({},p,{evidenciaRequerida:cfg[act.tipo]===true}));
      tx.set(db.collection(A.COLECCION).doc(intId),A.control(Object.assign({},nuevo,{abiertaEn:is.data().abiertaEn,abiertaUid:is.data().abiertaUid}),q,false));
      if(act.planId){
        const ps=await tx.get(refPlan(act.planId));
        if(ps.exists){
          const plan=docPlan(act.planId,ps.data());
          if(plan.proximaFecha===act.planFecha){                     // solo si sigue siendo el ciclo vigente
            const fecEj=window.GlacialFecha?window.GlacialFecha.fechaOperativa(nuevo.finRealMs||ahora()):iso(new Date(nuevo.finRealMs||ahora()));   // FECHA-OPERATIVA: un cierre a las 03:00 es del día operativo anterior
            const r=proximaFechaTras(plan,act.planFecha,fecEj);
            const ult={fecha:fecEj,planFecha:act.planFecha,intervencionId:intId,por:{nombre:q.nombre,tecnicoId:q.tecnicoId,uid:q.uid},en:ahora(),resultado:nuevo.resultado,ciclosOmitidos:r.ciclosOmitidos,
              tareasHechas:(nuevo.tareas||[]).filter(t=>t.estado==='HECHA').length,tareasNoHechas:(nuevo.tareas||[]).filter(t=>t.estado==='NO_HECHA').length};
            tx.set(refPlan(plan.id),control(Object.assign({},ps.data(),{proximaFecha:r.proxima,fechaOriginal:r.proxima,ultimaEjecucion:ult,rev:num(plan.rev)+1}),q));
          }
        }
      }
    });
    A.recordar(nuevo);
    return nuevo;
  }

  async function reprogramar(planId,nueva,motivo){
    const {q}=exigir(false);
    if(!fechaOk(nueva))throw new Error('La nueva fecha no es válida.');
    if(txt(motivo).length<5)throw new Error('Indica el motivo de la reprogramación (mínimo 5 caracteres).');
    await db.runTransaction(async tx=>{
      const ps=await tx.get(refPlan(planId));
      if(!ps.exists)throw new Error('El plan ya no existe.');
      const plan=docPlan(planId,ps.data());
      if(nueva===plan.proximaFecha)throw new Error('La nueva fecha es la misma que la actual.');
      const ej=await tx.get(db.collection(API().COLECCION).doc(idEjecucion(planId,plan.proximaFecha)));
      if(ej.exists&&ej.data().abierta)throw new Error('Hay una ejecución en curso de este ciclo: ciérrala o cancélala antes de reprogramar.');
      const r={id:'rp'+Date.now().toString(36),original:plan.fechaOriginal||plan.proximaFecha,anterior:plan.proximaFecha,nueva,motivo:txt(motivo).slice(0,200),por:{nombre:q.nombre,tecnicoId:q.tecnicoId,uid:q.uid},en:ahora()};
      tx.set(refPlan(planId),control(Object.assign({},ps.data(),{proximaFecha:nueva,fechaOriginal:plan.fechaOriginal||plan.proximaFecha,reprogramaciones:(plan.reprogramaciones||[]).concat([r]).slice(-40),rev:num(plan.rev)+1}),q));
    });
  }
  async function ejecucionesDe(planId){
    const snap=await db.collection(API().COLECCION).where('planId','==',planId).limit(60).get();
    return snap.docs.map(d=>Object.assign({},d.data({serverTimestamps:'estimate'}),{id:d.id})).sort((a,b)=>String(b.planFecha).localeCompare(String(a.planFecha)));
  }

  /* =========================================================
     AVISOS INTERNOS (centro de avisos de 46) · destinatarios según permisos y datos reales
     ========================================================= */
  function destinatario(){
    const A=API();if(!A)return null;
    const p=A.permisos();if(!p.ver)return null;
    const u=typeof state!=='undefined'?state.user:null;if(!u)return null;
    const compartida=typeof window.esMantCompartido==='function'&&window.esMantCompartido(u);
    const supervisor=p.puedeCorregir;                                 // Supervisor de Mantenimiento o Administrador
    const tec=compartida&&typeof window.mantTecnicoActivo==='function'?window.mantTecnicoActivo():null;
    if(!compartida&&!supervisor)return null;                         // Producción y jefatura no reciben estos avisos
    return {compartida,supervisor,tecnicoId:tec?tec.workerId:'',tecnicoNombre:tec?tec.nombre:''};
  }
  /* Pura: calcula los avisos a partir de planes e intervenciones. dest = destinatario(). */
  function calcularAvisos(planes,intervenciones,dest,ahoraMs,hoy,enEjecucionDe){
    const sal=[];
    if(!dest)return sal;
    const dia=86400000;
    planes.forEach(pl=>{
      if(pl.activo===false)return;
      const grupo=!pl.responsable||pl.responsable.tipo!=='TECNICO';
      const esMio=dest.supervisor||(dest.compartida&&(grupo||(dest.tecnicoId&&pl.responsable.tecnicoId===dest.tecnicoId)));
      if(!esMio)return;
      const est=estadoPlan(pl,hoy,enEjecucionDe?enEjecucionDe(pl):false);
      const desde=parse(pl.proximaFecha).getTime();
      const base='Preventivo «'+pl.titulo+'» · '+(pl.equipoNombre||'equipo');
      if(est==='VENCIDO')sal.push({id:'mt|prev|'+pl.id+'|'+pl.proximaFecha+'|v',tipo:'mant',linea:pl.linea||'',texto:base+' vencido ('+pl.proximaFecha+', hace '+(-diasEntre(hoy,pl.proximaFecha))+' d)',desdeMs:desde,severidad:'roja',tab:'preventivos'});
      else if(est==='PENDIENTE')sal.push({id:'mt|prev|'+pl.id+'|'+pl.proximaFecha+'|h',tipo:'mant',linea:pl.linea||'',texto:base+' corresponde HOY',desdeMs:desde,severidad:'ambar',tab:'preventivos'});
      else if(est==='PROXIMO')sal.push({id:'mt|prev|'+pl.id+'|'+pl.proximaFecha+'|p',tipo:'mant',linea:pl.linea||'',texto:base+' próximo ('+pl.proximaFecha+')',desdeMs:desde-num(pl.avisoDias)*dia,severidad:'ambar',tab:'preventivos'});
    });
    intervenciones.forEach(d=>{
      const participa=dest.supervisor||(dest.compartida&&(d.participantes||[]).some(x=>(dest.tecnicoId&&x.tecnicoId===dest.tecnicoId)||(!x.tecnicoId&&x.nombre===dest.tecnicoNombre)));
      if(!participa)return;
      const nombre=(d.equipoId?d.equipoNombre:M.SIN_EQUIPO)+' · '+d.linea;
      if(d.estado==='EN_ESPERA'&&d.espera){
        const min=(ahoraMs-num(d.espera.desdeMs))/60000;
        if(min>=30)sal.push({id:'mt|esp|'+d.id,tipo:'mant',linea:d.linea,texto:'Intervención en espera: '+nombre+' — '+(M.MOTIVOS_ESPERA[d.espera.motivo]||'')+' ('+Math.round(min)+' min)',desdeMs:num(d.espera.desdeMs),severidad:min>=480?'roja':'ambar',abrir:d.id});
      }
      const pe=M.pendientes(d);
      if(pe.total>0&&d.estado!=='CANCELADA'){
        sal.push({id:'mt|seg|'+d.id+'|'+pe.total,tipo:'mant',linea:d.linea,texto:'Seguimiento pendiente: '+nombre+(pe.noOperativo?' (NO OPERATIVO)':'')+' — '+(pe.textoCierre||(d.seguimiento||[]).filter(s=>s.estado==='PENDIENTE').map(s=>s.texto)[0]||'revisar'),
          desdeMs:num(d.cerradaMs)||num(d.abiertaMs),severidad:pe.noOperativo?'roja':'ambar',abrir:d.id});
      }
    });
    return sal;
  }
  window.glacialMantAvisos=function(){
    try{
      const A=API(),dest=destinatario();
      if(!dest)return [];
      escuchar();A.escucharAbiertas();
      if(!A.estado().cerradasPedidas)A.escucharCerradas();
      return calcularAvisos(lista(),A.todas(),dest,ahora(),hoyOperativo(),ejecucionAbierta);
    }catch(_){return [];}
  };
  window.glacialPreventivosResumen=function(){
    escuchar();
    const hoy=hoyOperativo(),venc=lista().filter(p=>estadoDe(p)==='VENCIDO').length,rep=lista().filter(p=>p.activo!==false&&atrasoOriginal(p,hoy)>0&&estadoDe(p)!=='VENCIDO').length;
    return '<div class="mi-kpi" style="--c:#a21caf"><b>'+(S.error||!S.listo?'—':venc)+'</b><span>Preventivos vencidos'+(rep&&!S.error?' (+'+rep+' reprogramados con atraso)':'')+'</span></div>';
  };
  /* Contrato para Planificación (aún NO conectado): ventanas previstas = PROPUESTAS, nunca una parada real ni una ventana confirmada. */
  function ventanasPrevistas(desde,hasta){
    const sal=[];
    lista().forEach(p=>{
      if(p.activo===false||!p.ventana||!p.ventana.inicio||!fechaOk(p.proximaFecha)||p.proximaFecha<desde||p.proximaFecha>hasta)return;
      sal.push({planId:p.id,equipoId:p.equipoId,linea:p.linea,fecha:p.proximaFecha,inicio:p.ventana.inicio,fin:p.ventana.fin||'',titulo:p.titulo,estado:'PROPUESTA',origen:'PLAN_PREVENTIVO',confirmada:false});
    });
    return sal.sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.inicio.localeCompare(b.inicio));
  }

  /* =========================================================
     PANTALLA
     ========================================================= */
  const FP={linea:'',equipo:'',estado:'',q:''};
  const norm=t=>String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  const fecha=f=>fechaOk(f)?f.slice(8,10)+'/'+f.slice(5,7)+'/'+f.slice(0,4):'—';
  const chip=e=>'<span class="mi-chip '+({EN_EJECUCION:'e-EN_INTERVENCION',VENCIDO:'p-CRITICA',PENDIENTE:'p-ALTA',PROXIMO:'e-EN_ESPERA',COMPLETADO:'e-CERRADA',PROGRAMADO:'e-PENDIENTE',INACTIVO:'e-CANCELADA'})[e]+'">'+esc(ETQ_ESTADO[e]||e)+'</span>';
  const textoFrec=f=>f?'cada '+f.cada+' '+FRECUENCIAS[f.tipo]:'—';

  function tarjetaPlan(pl){
    const hoy=hoyOperativo(),est=estadoDe(pl),atr=atrasoOriginal(pl,hoy);
    return '<div class="mi-card" data-pv-abrir="'+esc(pl.id)+'" tabindex="0" role="button" style="--c:'+(est==='VENCIDO'?'#a21caf':est==='PENDIENTE'?'#c2410c':est==='EN_EJECUCION'?'#1d4ed8':'#0e7490')+'">'+
      '<h4>'+esc(pl.titulo)+' <small style="font-weight:500;color:#5a6b78">· '+esc(pl.equipoNombre)+' · '+esc(UIM().nombreLinea(pl.linea))+'</small></h4>'+chip(est)+
      '<span class="mi-chip">'+esc(textoFrec(pl.frecuencia))+'</span>'+(atr?'<span class="mi-chip p-CRITICA">Atraso original: '+atr+' d (reprogramado)</span>':'')+
      '<div class="mi-meta">Próxima: <b>'+esc(fecha(pl.proximaFecha))+'</b>'+(pl.ventana?' · ventana '+esc(pl.ventana.inicio)+(pl.ventana.fin?'–'+esc(pl.ventana.fin):''):'')+' · Responsable: '+esc(pl.responsable&&pl.responsable.tipo==='TECNICO'?pl.responsable.nombre:'Grupo Mantenimiento')+
        (pl.ultimaEjecucion?' · última: '+esc(fecha(pl.ultimaEjecucion.fecha)):' · sin ejecuciones')+'</div></div>';
  }
  function pintarPreventivos(cont){
    escuchar();
    const A=API(),p=A.permisos();A.escucharAbiertas();
    const todos=lista(),E=window.glacialEquiposMaestro;
    const q=norm(FP.q);
    const vis=todos.filter(pl=>(!FP.linea||pl.linea===FP.linea)&&(!FP.equipo||pl.equipoId===FP.equipo)&&(!FP.estado||estadoDe(pl)===FP.estado)&&(!q||norm(pl.titulo+' '+pl.equipoNombre).includes(q)))
      .sort((a,b)=>a.proximaFecha.localeCompare(b.proximaFecha));
    cont.innerHTML=(S.error?'<div class="mi-error">'+esc(S.error)+'</div>':'')+
      '<div class="mi-acc">'+(p.puedeCorregir?'<button type="button" class="btn btn-primary btn-sm" data-pv-nuevo>+ Nuevo plan</button>':'')+(p.consulta?'<span class="mi-meta">Modo consulta.</span>':'')+'</div>'+
      '<div class="mi-filtros"><label>Línea<select data-pv-f="linea"><option value="">Todas</option>'+M.LINEAS.map(l=>'<option value="'+l+'"'+(FP.linea===l?' selected':'')+'>'+esc(UIM().nombreLinea(l))+'</option>').join('')+'</select></label>'+
      '<label>Equipo<select data-pv-f="equipo"><option value="">Todos</option>'+(E?E.lista().map(e=>'<option value="'+esc(e.id)+'"'+(FP.equipo===e.id?' selected':'')+'>'+esc(E.etiqueta(e))+'</option>').join(''):'')+'</select></label>'+
      '<label>Estado<select data-pv-f="estado"><option value="">Todos</option>'+Object.keys(ETQ_ESTADO).map(k=>'<option value="'+k+'"'+(FP.estado===k?' selected':'')+'>'+esc(ETQ_ESTADO[k])+'</option>').join('')+'</select></label>'+
      '<label>Buscar<input type="search" data-pv-f="q" value="'+esc(FP.q)+'"></label></div>'+
      (S.error?'':!S.listo?'<div class="mi-vacio">Cargando planes…</div>':vis.length?vis.map(tarjetaPlan).join(''):'<div class="mi-vacio"><b>No hay planes preventivos'+(todos.length?' con estos filtros':'')+'.</b>'+(todos.length?'':'<br>'+(p.puedeCorregir?'Crea el primero con «+ Nuevo plan» (solo frecuencias de calendario: no hay contador de horas de máquina).':'El Supervisor de Mantenimiento define los planes.'))+'</div>');
  }

  async function detallePlan(id){
    const pl=porId(id);if(!pl)return;
    const A=API(),p=A.permisos(),hoy=hoyOperativo(),est=estadoDe(pl),abierta=ejecucionAbierta(pl),atr=atrasoOriginal(pl,hoy);
    const f=UIM().modal('<h3>'+esc(pl.titulo)+'</h3>'+chip(est)+'<span class="mi-chip">v'+esc(pl.version)+'</span><span class="mi-chip">'+esc(pl.equipoNombre)+'</span>'+
      (atr?'<div class="mi-pend">Atraso original: <b>'+atr+' día(s)</b>. Fecha original '+esc(fecha(pl.fechaOriginal))+', reprogramado a '+esc(fecha(pl.proximaFecha))+'. El atraso no se borra.</div>':'')+
      (pl.descripcion?'<div>'+esc(pl.descripcion)+'</div>':'')+
      '<table class="mi-tabla"><tbody><tr><td>Frecuencia</td><td>'+esc(textoFrec(pl.frecuencia))+'</td></tr><tr><td>Política de próxima fecha</td><td>'+esc(POLITICAS[pl.politica])+'</td></tr><tr><td>Próxima fecha</td><td><b>'+esc(fecha(pl.proximaFecha))+'</b></td></tr>'+
        '<tr><td>Ventana prevista</td><td>'+(pl.ventana?esc(pl.ventana.inicio)+(pl.ventana.fin?'–'+esc(pl.ventana.fin):''):'—')+' <small>(propuesta; no es una parada real)</small></td></tr>'+
        '<tr><td>Responsable</td><td>'+esc(pl.responsable&&pl.responsable.tipo==='TECNICO'?pl.responsable.nombre:'Grupo Mantenimiento')+'</td></tr><tr><td>Aviso con</td><td>'+esc(pl.avisoDias)+' día(s) de anticipación</td></tr></tbody></table>'+
      '<h5>Tareas (versión '+esc(pl.version)+')</h5><ol style="margin:4px 0 0 18px;padding:0;font-size:13px">'+(pl.tareas||[]).map(t=>'<li>'+esc(t.titulo)+'</li>').join('')+'</ol>'+
      ((pl.reprogramaciones||[]).length?'<h5>Reprogramaciones</h5>'+pl.reprogramaciones.map(r=>'<div class="mi-meta">'+esc(fecha(r.anterior))+' → '+esc(fecha(r.nueva))+' · '+esc(r.motivo)+' · '+esc(r.por.nombre)+' ('+esc(UIM().fmtFH(r.en))+') · original '+esc(fecha(r.original))+'</div>').join(''):'')+
      '<h5>Historial de ejecuciones</h5><div id="pv-ej" class="mi-meta">Cargando…</div>'+
      '<div class="mi-acc">'+
        (p.escribir&&pl.activo!==false?(abierta?'<button type="button" class="btn btn-primary btn-sm" data-pv-ir="'+esc(abierta.id)+'">Abrir la ejecución en curso</button>':'<button type="button" class="btn btn-primary btn-sm" data-pv-ejecutar="'+esc(pl.id)+'">Iniciar ejecución</button>')+
          (!abierta?'<button type="button" class="btn btn-ghost btn-sm" data-pv-repro="'+esc(pl.id)+'">Reprogramar</button>':''):'')+
        (p.puedeCorregir?'<button type="button" class="btn btn-ghost btn-sm" data-pv-editar="'+esc(pl.id)+'">Editar plan</button><button type="button" class="btn btn-ghost btn-sm" data-pv-activo="'+esc(pl.id)+'">'+(pl.activo===false?'Activar':'Desactivar')+'</button>':'')+
        '<button type="button" class="btn btn-ghost btn-sm" data-mi-cerrar>Cerrar</button></div>',false);
    try{
      const ej=await ejecucionesDe(id);
      f.querySelector('#pv-ej').innerHTML=ej.length?'<table class="mi-tabla"><thead><tr><th>Ciclo</th><th>Estado</th><th>Resultado</th><th>Tareas</th></tr></thead><tbody>'+ej.map(d=>'<tr><td>'+esc(fecha(d.planFecha))+' <small>v'+esc((d.plan&&d.plan.version)||'')+'</small></td><td>'+esc(M.ESTADOS[d.estado]||d.estado)+'</td><td>'+esc(d.resultado?M.RESULTADOS[d.resultado]:'—')+'</td><td>'+(d.tareas||[]).filter(t=>t.estado==='HECHA').length+'/'+(d.tareas||[]).length+(d.id?' <a href="#" data-pv-ir="'+esc(d.id)+'">ver</a>':'')+'</td></tr>').join('')+'</tbody></table>'
        :'Todavía no hay ejecuciones.';
    }catch(err){f.querySelector('#pv-ej').innerHTML='<span style="color:#8c1d18">No se pudo leer el historial de ejecuciones: '+esc((err&&err.message)||err)+'</span>';}
  }

  function formPlan(id){
    const A=API(),E=window.glacialEquiposMaestro,pl=id?porId(id):null;
    const b=pl||{equipoId:'',titulo:'',descripcion:'',frecuencia:{tipo:'MESES',cada:1},politica:'CALENDARIO',proximaFecha:hoyOperativo(),ventana:null,responsable:{tipo:'GRUPO'},tareas:[],avisoDias:7,activo:true};
    let tecnicos=[];try{tecnicos=(typeof loadWorkers==='function'?loadWorkers():[])||[];}catch(_){tecnicos=[];}
    tecnicos=tecnicos.filter(w=>w&&norm(w.estado)==='activo'&&norm(w.area)==='mantenimiento'&&!/supervisor|jefe|gerente|jefatura/.test(norm(w.cargo))).sort((a,x)=>String(a.nombre).localeCompare(String(x.nombre),'es'));
    UIM().formulario(pl?'Editar plan preventivo':'Nuevo plan preventivo',
      '<label class="completo">Equipo<select id="p-eq"><option value="">Seleccionar…</option>'+(E?E.lista().filter(e=>e.activo||e.id===b.equipoId).map(e=>'<option value="'+esc(e.id)+'"'+(e.id===b.equipoId?' selected':'')+'>'+esc(E.etiqueta(e))+' · '+esc(E.nombreLinea(e.linea))+'</option>').join(''):'')+'</select></label>'+
      '<label class="completo">Título<input id="p-ti" maxlength="80" value="'+esc(b.titulo)+'" placeholder="Por ejemplo: Lubricación y revisión de rodamientos"></label>'+
      '<label class="completo">Descripción (opcional)<textarea id="p-de" rows="2" maxlength="400">'+esc(b.descripcion)+'</textarea></label>'+
      '<label>Frecuencia: cada<input id="p-ca" type="number" min="1" step="1" value="'+esc(b.frecuencia.cada)+'"></label><label>Unidad<select id="p-un">'+Object.keys(FRECUENCIAS).map(k=>'<option value="'+k+'"'+(b.frecuencia.tipo===k?' selected':'')+'>'+esc(FRECUENCIAS[k])+'</option>').join('')+'</select></label>'+
      '<label class="completo">Política de próxima fecha<select id="p-po">'+Object.keys(POLITICAS).map(k=>'<option value="'+k+'"'+(b.politica===k?' selected':'')+'>'+esc(POLITICAS[k])+'</option>').join('')+'</select></label>'+
      '<label>'+(pl?'Próxima fecha (para cambiarla usa «Reprogramar»)':'Primera fecha')+'<input id="p-fe" type="date" value="'+esc(b.proximaFecha)+'"'+(pl?' disabled':'')+'></label><label>Días de aviso<input id="p-av" type="number" min="0" max="60" value="'+esc(b.avisoDias)+'"></label>'+
      '<label>Ventana prevista: inicio<input id="p-vi" type="time" value="'+esc(b.ventana?b.ventana.inicio:'')+'"></label><label>Ventana prevista: fin<input id="p-vf" type="time" value="'+esc(b.ventana?b.ventana.fin:'')+'"></label>'+
      '<label class="completo">Responsable<select id="p-re"><option value="">Grupo Mantenimiento</option>'+tecnicos.map(w=>'<option value="'+esc(w.id)+'" data-n="'+esc(w.nombre)+'"'+(b.responsable.tipo==='TECNICO'&&b.responsable.tecnicoId===w.id?' selected':'')+'>'+esc(w.nombre)+'</option>').join('')+'</select></label>'+
      '<label class="completo">Tareas (una por línea)<textarea id="p-ta" rows="5" placeholder="Revisar el nivel de aceite&#10;Lubricar rodamientos&#10;Verificar tensión de la faja">'+esc((b.tareas||[]).map(t=>t.titulo).join('\n'))+'</textarea></label>'+
      '<div class="mi-meta completo">Solo frecuencias de calendario. Cambiar tareas o frecuencia sube la versión del plan y NO modifica las ejecuciones anteriores.</div>'+
      '<label class="completo" style="flex-direction:row;align-items:center;gap:8px;text-transform:none;letter-spacing:0;font-weight:600"><input type="checkbox" id="p-ac" style="width:auto"'+(b.activo!==false?' checked':'')+'> Plan activo</label>','Guardar plan',
      async q=>{
        const sel=q('#p-re'),opt=sel.selectedOptions[0];
        await guardarPlan({id:pl?pl.id:'',equipoId:q('#p-eq').value,titulo:q('#p-ti').value,descripcion:q('#p-de').value,frecuencia:{tipo:q('#p-un').value,cada:q('#p-ca').value},politica:q('#p-po').value,proximaFecha:q('#p-fe').value,
          ventana:{inicio:q('#p-vi').value,fin:q('#p-vf').value},responsable:sel.value?{tipo:'TECNICO',tecnicoId:sel.value,nombre:opt.dataset.n}:{tipo:'GRUPO'},tareas:tareasDeTexto(q('#p-ta').value,pl?pl.tareas:[]),avisoDias:q('#p-av').value,activo:q('#p-ac').checked},
          {esperadoRev:pl?pl.rev:undefined});
      },{dos:true});
  }
  function formRepro(id){
    const pl=porId(id);if(!pl)return;
    UIM().formulario('Reprogramar preventivo','<div class="mi-aviso completo">Se conserva la fecha original ('+esc(fecha(pl.fechaOriginal||pl.proximaFecha))+'), la anterior, la nueva y el motivo. Un atraso no se borra.</div>'+
      '<label class="completo">Nueva fecha<input id="r-fe" type="date" value="'+esc(pl.proximaFecha)+'"></label><label class="completo">Motivo (obligatorio)<textarea id="r-mo" rows="2"></textarea></label>','Reprogramar',
      async q=>{await reprogramar(pl.id,q('#r-fe').value,q('#r-mo').value);});
  }

  /* Lista de tareas dentro del detalle de la intervención preventiva. */
  window.glacialPreventivosDetalleHtml=function(d,p){
    if(d.tipo!=='PREVENTIVO'||!(d.tareas||[]).length)return '';
    const abierta=M.estaAbierta(d.estado);
    return '<h5>Tareas del preventivo <small style="font-weight:500">(plan v'+esc((d.plan&&d.plan.version)||'')+', copiadas al iniciar)</small></h5>'+d.tareas.map(t=>'<div style="margin:4px 0;padding:6px 8px;border:1px solid #dce5ec;border-radius:8px;border-left:4px solid '+(t.estado==='HECHA'?'#0e7490':t.estado==='NO_HECHA'?'#a21caf':'#94a3b8')+'">'+
      esc(t.titulo)+' — <b>'+(t.estado==='HECHA'?'Realizada':t.estado==='NO_HECHA'?'NO realizada':'Pendiente')+'</b>'+(t.motivo?'<div class="mi-meta">Motivo: '+esc(t.motivo)+'</div>':'')+(t.por?'<div class="mi-meta">'+esc(t.por.nombre)+' · '+esc(UIM().fmtFH(t.en))+'</div>':'')+
      (p.escribir&&abierta?'<div class="mi-acc" style="margin:4px 0 0"><button type="button" class="btn btn-ghost btn-sm" data-pv-tarea="'+esc(t.id)+'|HECHA">Realizada</button><button type="button" class="btn btn-ghost btn-sm" data-pv-tarea="'+esc(t.id)+'|NO_HECHA">No realizada</button></div>':'')+'</div>').join('');
  };

  document.addEventListener('click',async e=>{
    const t=e.target;if(!t||!t.closest)return;
    const ab=t.closest('[data-pv-abrir]');if(ab){detallePlan(ab.dataset.pvAbrir);return;}
    if(t.closest('[data-pv-nuevo]')){formPlan('');return;}
    const ed=t.closest('[data-pv-editar]');if(ed){document.querySelectorAll('.mi-fondo').forEach(x=>x.remove());formPlan(ed.dataset.pvEditar);return;}
    const rp=t.closest('[data-pv-repro]');if(rp){document.querySelectorAll('.mi-fondo').forEach(x=>x.remove());formRepro(rp.dataset.pvRepro);return;}
    const ac=t.closest('[data-pv-activo]');
    if(ac){const pl=porId(ac.dataset.pvActivo);if(pl){try{await guardarPlan(Object.assign({},pl,{activo:pl.activo===false}),{esperadoRev:pl.rev});document.querySelectorAll('.mi-fondo').forEach(x=>x.remove());}catch(err){UIM().aviso('No se pudo cambiar',(err&&err.message)||String(err));}}return;}
    const ej=t.closest('[data-pv-ejecutar]');
    if(ej){ej.disabled=true;try{const r=await iniciarEjecucion(ej.dataset.pvEjecutar);document.querySelectorAll('.mi-fondo').forEach(x=>x.remove());window.intervencionesAbrir({abrir:r.doc.id});}catch(err){UIM().aviso('No se pudo iniciar',(err&&err.message)||String(err));ej.disabled=false;}return;}
    const ir=t.closest('[data-pv-ir]');if(ir){e.preventDefault();document.querySelectorAll('.mi-fondo').forEach(x=>x.remove());window.intervencionesAbrir({abrir:ir.dataset.pvIr});return;}
    const ta=t.closest('[data-pv-tarea]');
    if(ta&&UIM().UI.detalle){
      const [tid,est]=ta.dataset.pvTarea.split('|'),intId=UIM().UI.detalle;
      if(est==='HECHA'){try{await API().accion(intId,'TAREA',{id:tid,estado:'HECHA'});}catch(err){UIM().aviso('No se pudo guardar',(err&&err.message)||String(err));}}
      else UIM().formulario('Tarea no realizada','<label class="completo">Motivo (obligatorio)<textarea id="f-mt" rows="2"></textarea></label>','Guardar',async q=>{await API().accion(intId,'TAREA',{id:tid,estado:'NO_HECHA',motivo:q('#f-mt').value});});
      return;
    }
  });
  document.addEventListener('change',e=>{const t=e.target;if(t&&t.dataset&&t.dataset.pvF!==undefined){FP[t.dataset.pvF]=t.value;const c=document.getElementById('mi-cuerpo');if(c)pintarPreventivos(c);}});
  document.addEventListener('input',e=>{const t=e.target;if(t&&t.dataset&&t.dataset.pvF==='q'){FP.q=t.value;}});

  if(window.glacialMantPestanas)window.glacialMantPestanas.push({clave:'preventivos',titulo:'Preventivos',orden:2,pintar:pintarPreventivos,visible:()=>true});
  if(API())API().alCambiar(()=>{try{avisar();const c=document.getElementById('mi-cuerpo');if(c&&UIM().UI.tab==='preventivos'&&!document.activeElement.closest('#mi-cuerpo'))pintarPreventivos(c);}catch(_){/* pantalla cerrada */}});
  oyentes.push(()=>{const c=document.getElementById('mi-cuerpo');if(c&&UIM()&&UIM().UI.tab==='preventivos'&&!(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#mi-cuerpo')))pintarPreventivos(c);});

  window.glacialPreventivos={FRECUENCIAS,POLITICAS,ETQ_ESTADO,sumar,proximaFechaTras,estadoPlan,validarPlan,tareasDeTexto,calcularAvisos,fechaOk,diasEntre,atrasoOriginal,idEjecucion,
    lista,porId,escuchar,detener,guardarPlan,iniciarEjecucion,cerrarEjecucion,reprogramar,ejecucionesDe,ventanasPrevistas,estadoDe,alCambiar:f=>{if(typeof f==='function'&&!oyentes.includes(f))oyentes.push(f);}};
})();
