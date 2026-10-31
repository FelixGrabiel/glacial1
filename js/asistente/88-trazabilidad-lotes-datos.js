/* =============================================================
   GLACIAL · TRAZABILIDAD DE LOTES — DATOS (capa documento + transacciones + auditoría)
   -------------------------------------------------------------
   Colecciones del puente (fs_docs / fs_items), todas con prefijo «insumos»:
     insumosLotes/{LI-000231}            lote (proveedor + lote del proveedor + producto)
     insumosUnidades/{LI-000231-07}      caja o bobina del lote (estado, peso actual, línea…)
     insumosLoteMovimientos/{MOV-…}      movimientos INMUTABLES (solo se crean; una corrección es un movimiento nuevo)
     insumosLotesClaves/{clave}          índice de unicidad: una llave proveedor+lote+producto apunta a un solo lote (solo se crea)
     insumosParametros/{contador|trazabilidad|memoriaArticulos}   correlativo LI-, parámetros editables y artículos elegidos antes
   · «Confirmar y crear lote» es UNA transacción: aprueba la evidencia (si estaba pendiente), crea o actualiza el lote, crea la unidad, el movimiento,
     el índice, el correlativo, la memoria del artículo y deja auditoría. Revisa el estado y la revisión (`rev`): dos personas no se pisan y un doble clic
     no crea dos lotes (la evidencia queda marcada con su lote y el movimiento tiene id fijo).
   · Tiempo real: onSnapshot del puente (Realtime) en lotes y unidades; los movimientos se escuchan solo del lote abierto.
   · Permisos: los de Evidencias/Inventario (ver: Asistente de Producción, Jefe de Operaciones y Administrador; escribir: Asistente y Administrador).
     Reglas de Supabase: supabase/migraciones/glacial_34_trazabilidad_lotes.sql.
   · NO toca stock SAP, producción, Avance/Cierre ni tareo.
   Cargar DESPUÉS de 75-inventario-insumos-datos.js, 85-evidencias-insumos-datos.js y 87-trazabilidad-lotes-nucleo.js.
   ============================================================= */
(function instalarTrazabilidadDatos(){
  'use strict';
  const T=window.glacialTrazabilidadNucleo,N=window.glacialEvidenciasNucleo,D=window.glacialInventarioDatos,EV=window.glacialEvidenciasDatos;
  if(!T||!N||!D||!D._ayudas||!EV)return;
  const {auditar,usuario,ahora,col,falla,serverTs}=D._ayudas;
  const C={lotes:'insumosLotes',unidades:'insumosUnidades',movimientos:'insumosLoteMovimientos',claves:'insumosLotesClaves',parametros:'insumosParametros',evidencias:'insumosEvidencias'};
  const cache={lotes:[],unidades:[],movimientos:[],loteMov:'',parametros:T.PARAMETROS_DEFECTO,memoria:{},listo:{lotes:false,unidades:false,movimientos:false},error:''};
  const oyentes=[];let cierres=[],cierreMov=null,activo=false;
  const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(_){/* una vista no rompe a otra */}});
  const yoEscribo=()=>D.puedeEscribir();
  const ref=(c,id)=>col(c).doc(id);
  const porId=id=>cache.lotes.find(l=>l.id===id)||null;
  const unidadPorId=id=>cache.unidades.find(u=>u.id===id)||null;

  /* ---------- tiempo real ---------- */
  function escuchar(){
    if(activo||typeof db==='undefined')return;
    activo=true;cache.error='';
    const alerta=e=>{cache.error=D.mensajeError(e);avisar();};
    cierres.push(col(C.lotes).onSnapshot(s=>{cache.lotes=s.docs.map(d=>d.data()).filter(x=>x&&x.id&&x.clave);cache.listo.lotes=true;cache.error='';avisar();},alerta));
    cierres.push(col(C.unidades).onSnapshot(s=>{cache.unidades=s.docs.map(d=>d.data()).filter(x=>x&&x.id&&x.loteId);cache.listo.unidades=true;cache.error='';avisar();},alerta));
    cierres.push(ref(C.parametros,'trazabilidad').onSnapshot(s=>{cache.parametros=s.exists?Object.assign({},T.PARAMETROS_DEFECTO,s.data()):T.PARAMETROS_DEFECTO;avisar();},()=>{/* sin parámetros: valen los de fábrica */}));
    cierres.push(ref(C.parametros,'memoriaArticulos').onSnapshot(s=>{cache.memoria=(s.exists&&s.data().mapa&&typeof s.data().mapa==='object')?s.data().mapa:{};avisar();},()=>{/* sin memoria */}));
    D.escuchar();                                                                              // el catálogo del Inventario (artículo sugerido)
  }
  function detener(){
    activo=false;
    cierres.forEach(c=>{try{c();}catch(_){/* ya cerrada */}});cierres=[];
    escucharMovimientos('');
  }
  /** Movimientos del lote abierto (los demás no se bajan). */
  function escucharMovimientos(loteId){
    if(cierreMov){try{cierreMov();}catch(_){/* ya cerrada */}cierreMov=null;}
    cache.loteMov=loteId||'';cache.movimientos=[];cache.listo.movimientos=!loteId;
    if(!loteId||typeof db==='undefined'){avisar();return;}
    cierreMov=col(C.movimientos).where('loteId','==',loteId).onSnapshot(s=>{
      cache.movimientos=s.docs.map(d=>d.data()).filter(x=>x&&x.id&&x.loteId===loteId);cache.listo.movimientos=true;avisar();
    },e=>{cache.error=D.mensajeError(e);avisar();});
  }
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(()=>{detener();cache.lotes=[];cache.unidades=[];cache.listo={lotes:false,unidades:false,movimientos:false};});

  /* ---------- artículo sugerido ---------- */
  const catalogo=()=>(D.cache&&D.cache.catalogo)||[];
  function sugerencias(doc){
    const d=T.datosDeEvidencia(doc);
    return {datos:d,candidatos:T.sugerirArticulos(catalogo(),d,cache.memoria,5)};
  }
  const articuloDe=id=>{const a=catalogo().find(x=>x.id===id);return a?{id:a.id,itemCode:a.itemCode||'',nombre:a.nombre}:null;};

  /* ---------- confirmar y crear lote ---------- */
  /**
   * Una sola transacción. id/revEsperada: la evidencia que se está validando; articuloId: artículo del catálogo elegido (opcional).
   * Si la evidencia está pendiente o por corregir se APRUEBAN sus datos (con las mismas reglas de Evidencias) y se crea el lote; si ya estaba aprobada
   * y todavía no tiene lote (aprobadas antes de esta fase) solo se crea el lote. Devuelve {loteId, unidadId, accion, avisos}.
   */
  async function crearLoteDesdeEvidencia(id,revEsperada,{articuloId=''}={}){
    if(!yoEscribo())throw falla('PERMISO','No tienes permiso para crear lotes.');
    const u=usuario(),t=ahora(),articulo=articuloId?articuloDe(articuloId):null;
    if(articuloId&&!articulo)throw falla('VALIDACION','El artículo elegido ya no está en el catálogo del Inventario.');
    const leyendaParam=cache.parametros;
    let salida=null;
    await db.runTransaction(async tx=>{
      const refEv=ref(C.evidencias,id),sEv=await tx.get(refEv);
      if(!sEv.exists)throw falla('VALIDACION','La evidencia ya no existe.');
      let doc=sEv.data();
      if(Number(doc.rev)!==Number(revEsperada))throw falla('CONCURRENCIA','Otra persona cambió esta evidencia mientras la revisabas. Se actualizó la pantalla: revisa y vuelve a intentar.');
      if(doc.loteId)throw falla('DUPLICADO','Esta evidencia ya creó el lote '+doc.loteId+'.');
      let evento=null;
      if(doc.estado!=='aprobado_dato'){
        const r=N.cambiarEstado(doc,'aprobado_dato',{usuario:u.nombre,motivo:'',esAdmin:D.esAdmin(),en:t});
        doc=r.doc;evento=r.evento;
      }
      const datos=T.datosDeEvidencia(doc),clave=T.claveLote(datos);
      const refClave=ref(C.claves,clave),sClave=await tx.get(refClave);
      let lotePrevio=null,unidadPrevia=null,correlativo=null,sContador=null;
      if(sClave.exists){
        const loteId=sClave.data().loteId;
        const sLote=await tx.get(ref(C.lotes,loteId));
        if(!sLote.exists)throw falla('VALIDACION','El índice apunta al lote '+loteId+' pero no existe. Avisa a un Administrador.');
        lotePrevio=sLote.data();
        const sU=await tx.get(ref(C.unidades,T.idUnidad(loteId,datos.numero)));
        unidadPrevia=sU.exists?sU.data():null;
      }else{
        sContador=await tx.get(ref(C.parametros,'contador'));
        correlativo=sContador.exists?Number(sContador.data().siguiente)||1:1;
      }
      const sMem=await tx.get(ref(C.parametros,'memoriaArticulos'));
      const plan=T.planCrearLote({doc,lotePrevio,unidadPrevia,correlativo,articulo,leyenda:T.interpretarLeyenda(doc.leyenda,leyendaParam),usuario:u.nombre,uid:u.uid,en:t,parametros:leyendaParam});
      const marcada=T.evidenciaConLote(doc,{loteId:plan.lote.id,unidadId:plan.unidad.id,usuario:u.nombre,en:t});
      tx.set(ref(C.lotes,plan.lote.id),plan.lote);
      tx.set(ref(C.unidades,plan.unidad.id),plan.unidad);
      tx.set(ref(C.movimientos,plan.movimiento.id),Object.assign({},plan.movimiento,{en:serverTs()}));
      if(plan.nuevo){
        tx.set(refClave,{id:clave,loteId:plan.lote.id,creadoEn:t,creadoPor:u.nombre});
        tx.set(ref(C.parametros,'contador'),{id:'contador',siguiente:correlativo+1,rev:(sContador.exists?Number(sContador.data().rev)||1:0)+1});
      }
      if(articulo){
        const mapa=Object.assign({},sMem.exists&&sMem.data().mapa?sMem.data().mapa:{});
        mapa[T.claveMemoria(datos)]=articulo.id;
        tx.set(ref(C.parametros,'memoriaArticulos'),{id:'memoriaArticulos',mapa,rev:(sMem.exists?Number(sMem.data().rev)||1:0)+1});
      }
      tx.set(refEv,marcada);
      const nombre=(datos.producto||'')+' · '+datos.loteProveedor;
      if(evento)auditar(tx,'CAMBIAR_ESTADO_EVIDENCIA',id,nombre,evento.antes,evento.despues,{evidenciaId:id,loteId:plan.lote.id});
      auditar(tx,plan.nuevo?'CREAR_LOTE':'AGREGAR_UNIDAD_LOTE',plan.lote.id,nombre,null,
        {loteId:plan.lote.id,unidadId:plan.unidad.id,loteProveedor:datos.loteProveedor,estado:plan.unidad.estado,linea:plan.unidad.linea||'',pesoNeto:plan.unidad.pesoNeto,itemNombre:articulo?articulo.nombre:''},
        {evidenciaId:id,loteId:plan.lote.id,unidadId:plan.unidad.id});
      salida={loteId:plan.lote.id,unidadId:plan.unidad.id,accion:plan.accion,avisos:plan.avisos,estado:plan.unidad.estado,linea:plan.unidad.linea};
    });
    return salida;
  }

  /** Entrega a línea (Etapa 2): una transacción por unidad con su movimiento y auditoría. ids: ids de unidad. Devuelve {entregadas:[{unidadId,avisos}]}; si una falla, no se entrega ninguna. */
  async function entregarALinea(ids,linea){
    if(!yoEscribo())throw falla('PERMISO','No tienes permiso para entregar unidades a línea.');
    const lista=[...new Set((Array.isArray(ids)?ids:[]).map(String).filter(Boolean))];
    if(!lista.length)throw falla('VALIDACION','Elige al menos una unidad.');
    const u=usuario(),t=ahora(),hoy=(typeof GlacialFecha!=='undefined'&&GlacialFecha.fechaISOLocal)?GlacialFecha.fechaISOLocal(t):'';
    let salida=[];
    await db.runTransaction(async tx=>{
      salida=[];
      const leidas=[];
      for(const id of lista){
        const sU=await tx.get(ref(C.unidades,id));
        if(!sU.exists)throw falla('VALIDACION','La unidad '+id+' ya no existe.');
        const unidad=sU.data(),sL=await tx.get(ref(C.lotes,unidad.loteId));
        if(!sL.exists)throw falla('VALIDACION','El lote '+unidad.loteId+' de la unidad '+id+' no existe.');
        leidas.push({unidad,lote:sL.data()});
      }
      leidas.forEach(({unidad,lote})=>{
        const plan=T.planEntregaLinea({unidad,lote,linea,usuario:u.nombre,uid:u.uid,en:t,hoy,parametros:cache.parametros});
        tx.set(ref(C.unidades,unidad.id),plan.unidad);
        tx.set(ref(C.movimientos,plan.movimiento.id),Object.assign({},plan.movimiento,{en:serverTs()}));
        auditar(tx,'ENTREGAR_LINEA',unidad.id,(lote.producto||'')+' · '+(lote.loteProveedor||''),{estado:unidad.estado,linea:unidad.linea||''},{estado:'ENTREGADA_LINEA',linea},{loteId:unidad.loteId,unidadId:unidad.id});
        salida.push({unidadId:unidad.id,avisos:plan.avisos});
      });
    });
    return {entregadas:salida};
  }

  window.glacialTrazabilidadDatos={C,cache,entregarALinea,escuchar,detener,escucharMovimientos,porId,unidadPorId,sugerencias,articuloDe,crearLoteDesdeEvidencia,puedeVer:D.puedeVer,puedeEscribir:D.puedeEscribir,esAdmin:D.esAdmin,
    mensajeError:D.mensajeError,alCambiar:f=>{oyentes.push(f);return ()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};}};
})();
