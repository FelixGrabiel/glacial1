/* =============================================================
   MANTENIMIENTO · INTERVENCIONES · PERSISTENCIA, PERMISOS Y LECTURA EN VIVO

   Cada acción es UNA transacción sobre el documento intervenciones/{id}: lee la versión más reciente, aplica la acción del motor (67) y escribe con
   version+1 (las reglas exigen version anterior + 1, hora y uid del servidor y una entrada nueva en el historial). Así:
     · dos técnicos que tocan campos distintos no se pisan (cada uno aplica su acción sobre lo último guardado);
     · un doble cierre aplica UNA sola transición y el segundo recibe un mensaje claro;
     · abrir desde el mismo evento/parada devuelve la intervención existente (id determinista) en vez de duplicarla.
   AUTOR: el técnico identificado (PIN) y, por separado, el uid de la cuenta compartida. El servidor NO valida el PIN (limitación conocida de la cuenta
   compartida): el nombre del técnico es trazabilidad, no una identidad garantizada.
   Lectura en vivo: intervenciones abiertas (abierta == true) y las cerradas de los últimos días (cerradaMs >= …), sin leer la colección completa.
   Sin increment/arrayUnion/where in/!=/update con rutas: compatible con el puente de Supabase.
   Cargar después de 67-intervenciones-motor.js y 37d-equipos-maestro.js.
   ============================================================= */
(function(){
  'use strict';
  const M=window.GlacialIntervenciones;
  const COLECCION='intervenciones';
  const DIAS_CERRADAS=30,LIMITE=300;
  const JEFATURA=['Jefe de Producción','Jefe de Operaciones','Jefatura','Gerente General','Gerente'];
  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const sinConexion=()=>!!(window.glacialEstadoDatos&&window.glacialEstadoDatos.enLinea===false);
  const usuario=()=>(typeof state!=='undefined'&&state.user)||null;
  const compartida=()=>typeof window.esMantCompartido==='function'&&window.esMantCompartido();
  const tiene=p=>{try{return typeof tienePermiso==='function'&&!!tienePermiso(p);}catch(_){return false;}};

  /* ---------- permisos (los mismos criterios que las reglas de Firestore) ---------- */
  function consulta(){
    const u=usuario();
    if(!u)return true;
    try{
      if(window.glacialVista&&window.glacialVista.activo&&window.glacialVista.activo())return true;
      if(typeof esUsuarioSoloConsulta==='function'&&esUsuarioSoloConsulta(u))return true;
    }catch(_){/* sigue */}
    return JEFATURA.includes(String(u.rol||'').trim());
  }
  const esAdmin=()=>String((usuario()||{}).rol||'').trim()==='Administrador';
  const esSupervisorMtto=()=>{
    const u=usuario();
    if(!u||compartida()||consulta())return false;
    return esAdmin()||tiene('moduloMantenimiento')||tiene('gestionar_rotacion_mantenimiento');
  };
  function permisos(){
    const u=usuario();
    if(!u)return {ver:false,escribir:false,puedeCorregir:false,puedeVerificar:false,consulta:true};
    if(window.glacialVista&&window.glacialVista.activo&&window.glacialVista.activo()){const ok=!!window.glacialVista.puedeModulo('intervenciones');return {ver:ok,escribir:false,puedeCorregir:false,puedeVerificar:false,consulta:true};}
    const ver=compartida()||consulta()||esSupervisorMtto()||(typeof puedeVerBitacoraMtto==='function'&&!!puedeVerBitacoraMtto())||tiene('moduloMantenimiento');
    const escribir=!consulta()&&(compartida()||esSupervisorMtto());
    return {ver:!!ver,escribir:!!escribir,puedeCorregir:esSupervisorMtto(),puedeVerificar:esSupervisorMtto(),consulta:consulta()};
  }
  /* Quién actúa: el técnico identificado de la cuenta compartida, o el usuario. null = falta identificarse. */
  function quienActua(){
    const u=usuario();
    if(!u)return null;
    let uid='';try{uid=(firebase.auth().currentUser||{}).uid||'';}catch(_){/* sin sesión segura */}
    if(compartida()){
      const t=typeof window.mantTecnicoActivo==='function'?window.mantTecnicoActivo():null;
      if(!t)return null;
      return {nombre:t.nombre,tecnicoId:t.workerId,uid,cuenta:u.username||'',identificadoPor:'PIN',tokenPin:t.token||null,rol:u.rol||''};
    }
    return {nombre:u.nombre||u.username||'',tecnicoId:'',uid,cuenta:u.username||'',identificadoPor:'USUARIO',tokenPin:null,rol:u.rol||''};
  }

  /* ---------- lectura en vivo ---------- */
  const S={abiertas:new Map(),cerradas:new Map(),listoAbiertas:false,listoCerradas:false,errorAbiertas:'',errorCerradas:'',desubA:null,desubC:null,cerradasPedidas:false,reintento:null};
  const oyentes=[];
  const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(e){console.warn('Intervenciones:',e&&e.message||e);}});
  function docDe(id,x){return Object.assign({},x,{id,version:Number(x.version)||0});}

  function escucharAbiertas(){
    if(S.desubA||typeof db==='undefined'||!usuario()||!permisos().ver)return;
    try{
      S.desubA=db.collection(COLECCION).where('abierta','==',true).onSnapshot(snap=>{
        S.abiertas=new Map(snap.docs.map(d=>[d.id,docDe(d.id,d.data({serverTimestamps:'estimate'}))]));
        S.listoAbiertas=true;S.errorAbiertas='';avisar();
      },e=>{S.errorAbiertas='No se pudieron cargar las intervenciones: '+((e&&e.message)||e);S.listoAbiertas=true;S.desubA=null;avisar();});
    }catch(e){S.errorAbiertas=String((e&&e.message)||e);S.desubA=null;}
  }
  /* Las cerradas se leen solo cuando hacen falta (pantalla abierta, indicadores): últimos N días, más recientes primero. */
  function escucharCerradas(dias){
    if(S.desubC||typeof db==='undefined'||!usuario()||!permisos().ver)return;
    S.cerradasPedidas=true;
    const desde=ahora()-(dias||DIAS_CERRADAS)*86400000;
    try{
      S.desubC=db.collection(COLECCION).where('cerradaMs','>=',desde).orderBy('cerradaMs','desc').limit(LIMITE).onSnapshot(snap=>{
        S.cerradas=new Map(snap.docs.map(d=>[d.id,docDe(d.id,d.data({serverTimestamps:'estimate'}))]));
        S.listoCerradas=true;S.errorCerradas='';avisar();
      },e=>{S.errorCerradas='No se pudieron cargar las intervenciones cerradas: '+((e&&e.message)||e);S.listoCerradas=true;S.desubC=null;avisar();});
    }catch(e){S.errorCerradas=String((e&&e.message)||e);S.desubC=null;}
  }
  function detener(){
    [S.desubA,S.desubC].forEach(f=>{if(typeof f==='function'){try{f();}catch(_){/* ya cerrada */}}});
    S.desubA=null;S.desubC=null;S.abiertas=new Map();S.cerradas=new Map();S.listoAbiertas=false;S.listoCerradas=false;S.cerradasPedidas=false;S.errorAbiertas='';S.errorCerradas='';
  }
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(detener);
  S.reintento=setInterval(()=>{if(usuario()){if(!S.desubA)escucharAbiertas();if(S.cerradasPedidas&&!S.desubC)escucharCerradas();}},4000);

  const todas=()=>{
    const m=new Map(S.cerradas);
    S.abiertas.forEach((v,k)=>m.set(k,v));                         // si una está en las dos listas, manda la abierta/más reciente
    return [...m.values()];
  };
  const porId=id=>S.abiertas.get(id)||S.cerradas.get(id)||null;
  function recordar(doc){                                          // tras confirmar una escritura, esta pestaña ya lo ve sin esperar al aviso
    if(!doc||!doc.id)return;
    if(doc.abierta){S.abiertas.set(doc.id,doc);S.cerradas.delete(doc.id);}else{S.abiertas.delete(doc.id);S.cerradas.set(doc.id,doc);}
    avisar();
  }

  /* ---------- escrituras ---------- */
  const ts=()=>firebase.firestore.FieldValue.serverTimestamp();
  const refDe=id=>db.collection(COLECCION).doc(id);
  function exigirPuede(){
    const p=permisos();
    if(!p.escribir)throw new Error('No tienes permiso para modificar intervenciones: tu acceso es de consulta.');
    if(sinConexion())throw new Error('Sin conexión: el cambio NO se guardó. Inténtalo cuando vuelva la conexión.');
    const q=quienActua();
    if(!q)throw new Error('Identifícate como técnico (PIN) para registrar cambios.');
    if(!q.uid)throw new Error('No hay una sesión segura activa: no se puede registrar quién hace el cambio.');
    return {p,q};
  }
  /* Campos de control del documento (los exigen las reglas). */
  const control=(doc,q,esNuevo)=>Object.assign({},doc,{actualizadaEn:ts(),actualizadaUid:q.uid},esNuevo?{abiertaEn:ts(),abiertaUid:q.uid}:{});

  /* datos: ver M.nueva. opc.iniciar abre ya «En intervención». Devuelve {doc, existente}. */
  async function abrir(datos,opc){
    const {q}=exigirPuede();
    const o=opc||{},d=Object.assign({},datos||{});
    const origenId=d.origen&&d.origen.id?d.origen.id:'';
    const id=origenId?M.idDeOrigen(origenId,d.equipoId):(d.id||M.idNuevo('i'));
    d.id=id;
    let resultado=null;
    await db.runTransaction(async tx=>{
      resultado=null;
      const snap=await tx.get(refDe(id));
      if(snap.exists){resultado={doc:docDe(id,snap.data()),existente:true};return;}      // mismo origen/equipo o mismo intento: no se duplica
      const doc=M.nueva(d,q,ahora(),{iniciar:!!o.iniciar});
      tx.set(refDe(id),control(doc,q,true));
      resultado={doc,existente:false};
    });
    recordar(resultado.doc);
    return resultado;
  }
  /* Aplica una acción del motor sobre lo ÚLTIMO guardado. */
  async function accion(id,nombre,datos){
    const {p,q}=exigirPuede();
    let nuevo=null;
    await db.runTransaction(async tx=>{
      nuevo=null;
      const snap=await tx.get(refDe(id));
      if(!snap.exists)throw new Error('La intervención ya no existe.');
      const act=docDe(id,snap.data());
      const extra={};
      if(nombre==='CERRAR'){                                          // regla explícita por tipo de trabajo: ¿exige foto al cerrar? (sync/configMantenimiento → evidenciasRequeridas)
        const c=await tx.get(db.collection('sync').doc('configMantenimiento'));
        const cfg=c.exists&&c.data().evidenciasRequeridas&&typeof c.data().evidenciasRequeridas==='object'?c.data().evidenciasRequeridas:{};
        extra.evidenciaRequerida=cfg[act.tipo]===true;
      }
      nuevo=M.aplicar(act,nombre,datos,q,ahora(),Object.assign({},p,extra));
      tx.set(refDe(id),control(Object.assign({},nuevo,{abiertaEn:snap.data().abiertaEn,abiertaUid:snap.data().abiertaUid}),q,false));
    });
    recordar(nuevo);
    return nuevo;
  }

  /* Abrir desde una parada (Producción Actual / bitácora): reutiliza el id de la parada para no duplicar. p: {linea,paradaId,eventoId,motivo,equipoTexto,problema,tipo,prioridad} */
  async function abrirDesdeParada(p,opc){
    const E=window.glacialEquiposMaestro;
    const eq=E&&p.equipoTexto?E.buscarPorNombre(p.linea,p.equipoTexto):null;
    return abrir({linea:p.linea,equipoId:eq?eq.id:'',equipoNombre:eq?eq.nombre:'',tipo:p.tipo||'CORRECTIVO',prioridad:p.prioridad||'MEDIA',
      problema:p.problema||('Parada de línea'+(p.motivo?': '+p.motivo:'')+(p.equipoTexto&&!eq?' · equipo indicado en Producción: «'+p.equipoTexto+'» (por confirmar)':'')),
      origen:{tipo:p.eventoId?'EVENTO':'PARADA',id:p.paradaId||p.eventoId||'',paradaId:p.paradaId||'',eventoId:p.eventoId||''}},opc);
  }

  /* Intervenciones de un equipo (lectura puntual, hasta 100): para consultar sus fotos e historial. */
  async function porEquipo(equipoId){
    if(!permisos().ver)throw new Error('No tienes permiso para ver las intervenciones.');
    const snap=await db.collection(COLECCION).where('equipoId','==',equipoId).limit(100).get();
    return snap.docs.map(d=>docDe(d.id,d.data({serverTimestamps:'estimate'}))).sort((a,b)=>b.abiertaMs-a.abiertaMs);
  }

  window.glacialIntervenciones={COLECCION,porEquipo,permisos,quienActua,abrir,accion,abrirDesdeParada,todas,porId,abiertas:()=>[...S.abiertas.values()],cerradas:()=>[...S.cerradas.values()],
    estado:()=>({listoAbiertas:S.listoAbiertas,listoCerradas:S.listoCerradas,errorAbiertas:S.errorAbiertas,errorCerradas:S.errorCerradas,cerradasPedidas:S.cerradasPedidas}),
    escucharAbiertas,escucharCerradas,detener,alCambiar:f=>{if(typeof f==='function'&&!oyentes.includes(f))oyentes.push(f);},recordar,control};
})();
