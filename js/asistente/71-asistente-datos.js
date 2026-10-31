/* =============================================================
   GLACIAL · ASISTENTE DE PRODUCCIÓN — DATOS (Firestore), PERMISOS Y AUDITORÍA
   -------------------------------------------------------------
   Colecciones (docs/asistente/asistente-produccion.md §3): apInsumos, apFactores, apMovimientos (libro inmutable, id = opId),
   apSolicitudes, apMermas, apConciliaciones, apCoordinaciones, apParametros (causas y etapas de merma), apAuditoria (solo se crea).
   · El catálogo (insumos, factores y parámetros) se escucha desde el inicio de sesión: lo usan también el Nuevo registro y la
     tarjeta de Inicio (window.glacialFactoresCatalogo). Sin catálogo o sin factor, esas pantallas siguen con su cálculo anterior.
   · Toda escritura es una transacción que incluye su registro de auditoría (antes / después, usuario, hora del servidor).
   · Idempotencia: el id lo fija el cliente (opId o clave determinista). Repetir una operación devuelve lo ya guardado.
   · Versiones: cada documento editable lleva version; si otra persona guardó antes, la operación falla con CONFLICTO y no pisa nada.
   · Permisos por capacidad (rol por defecto + 'permiso' / '-permiso', como distribuirPersonal); las mismas reglas en
     firestore.rules.etapa2.txt. En modo visualización no se concede ninguna capacidad de escritura.
   ============================================================= */
(function instalarAsistenteDatos(){
  'use strict';
  const N=window.glacialAsistenteNucleo;
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const falla=(codigo,msg)=>{const e=new Error(msg);e.codigo=codigo;return e;};

  /* ---------- permisos ---------- */
  const SOLO_CONSULTA=['Jefe de Producción','Jefe de Operaciones','Jefatura','Gerente General','Gerente'];
  const CAPACIDADES={
    ver_asistente:{label:'VER Asistente de Producción (insumos, consumos, mermas, solicitudes)',roles:['Asistente de Producción','Supervisor','Supervisor de Producción',...SOLO_CONSULTA],escritura:false},
    asistenteProduccion:{label:'GESTIONAR Asistente de Producción (conteos, recepciones, consumos, mermas y solicitudes a Almacén)',roles:['Asistente de Producción'],escritura:true},
    validarMermas:{label:'Validar mermas y confirmar conciliaciones de consumo',roles:['Jefe de Producción','Jefe de Operaciones'],escritura:true},
    gestionarFactores:{label:'Administrar insumos y factores de consumo (con historial)',roles:[],escritura:true},
    moduloAlmacen:{label:'Almacén: preparar y entregar solicitudes de Producción',roles:[],escritura:true},
    reporteGeneral:{label:'Exportar el Reporte General de Producción (Excel consolidado)',roles:['Asistente de Producción','Supervisor','Supervisor de Producción',...SOLO_CONSULTA],escritura:false}
  };
  if(typeof PERMISOS_APP!=='undefined'&&Array.isArray(PERMISOS_APP)){
    Object.entries(CAPACIDADES).forEach(([key,c])=>{
      const area=key==='moduloAlmacen'?'almacen':(key==='reporteGeneral'?'visualizacion':'produccion');
      const ya=PERMISOS_APP.find(p=>p.key===key);
      if(ya){ya.label=c.label;ya.area=area;}else PERMISOS_APP.push({key,area,label:c.label});
    });
  }
  const vistaActiva=()=>!!(window.glacialVista&&typeof window.glacialVista.activo==='function'&&window.glacialVista.activo());
  function capacidad(u,key){
    const c=CAPACIDADES[key];if(!u||!c)return false;
    const rol=String(u.rol||'').trim();
    if(c.escritura&&(vistaActiva()||rol==='mantenimiento_compartido'))return false;
    if(rol==='Administrador'||u.permisos==='todos')return true;
    const arr=Array.isArray(u.permisos)?u.permisos:[];
    if(arr.includes('-'+key))return false;
    if(arr.includes(key))return true;
    if(vistaActiva())return false;
    return c.roles.includes(rol);
  }
  if(typeof tienePermiso==='function'){
    const anterior=tienePermiso;
    tienePermiso=function(permiso){
      if(CAPACIDADES[permiso])return !!(typeof state!=='undefined'&&capacidad(state.user,permiso));
      return anterior.apply(this,arguments);
    };
    window.tienePermiso=tienePermiso;
  }
  const puede=k=>typeof tienePermiso==='function'&&tienePermiso(k);

  /* ---------- contexto ---------- */
  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const serverTs=()=>firebase.firestore.FieldValue.serverTimestamp();
  const usuario=()=>{
    const u=(typeof firebase!=='undefined'&&firebase.auth&&firebase.auth().currentUser)||null;
    return {uid:(u&&u.uid)||'',nombre:(typeof state!=='undefined'&&state.user&&(state.user.nombre||state.user.username))||''};
  };
  const nuevoId=pref=>pref+'_'+ahora().toString(36)+'_'+Math.random().toString(36).slice(2,8);
  const col=n=>db.collection(n);
  /* Copia JSON para auditoría y documentos: sin undefined ni marcadores de hora del servidor (esos se agregan aparte). */
  const limpio=o=>JSON.parse(JSON.stringify(o===undefined?null:o,(k,v)=>(k==='actualizadoEn'||k==='guardadoEn')?undefined:v));
  const autor=()=>{const u=usuario();return {actualizadoUid:u.uid,actualizadoPor:u.nombre,actualizadoEn:serverTs()};};
  function auditar(tx,coleccion,docId,operacion,antes,despues){
    const u=usuario();
    tx.set(col('apAuditoria').doc(),{coleccion,docId:String(docId),operacion,antes:limpio(antes),despues:limpio(despues),uid:u.uid,usuario:u.nombre,en:serverTs()});
  }
  /* Mensaje legible de un error de Firestore (no «falta permiso o internet» para todo). */
  function mensajeError(e){
    if(e&&e.codigo)return e.message;
    const code=String(e&&e.code||'').replace(/^firestore\//,'');
    if(code==='permission-denied')return 'Tu usuario no tiene permiso para esta operación (o faltan publicar las reglas del Asistente).';
    if(code==='unavailable')return 'Sin conexión. Vuelve a intentarlo: la operación no se duplicará.';
    if(code==='aborted'||code==='failed-precondition')return 'Otro usuario guardó al mismo tiempo. Vuelve a intentarlo.';
    return (e&&e.message)||String(e);
  }

  /* ---------- caché en vivo ---------- */
  const cache={insumos:[],factores:[],parametrosMerma:null,movimientos:[],solicitudes:[],mermas:[],conciliaciones:[],coordinaciones:[],listo:{},error:{}};
  const oyentes=[];let cierres=[];let ctxFecha='';let cierresCatalogo=[];
  const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(_){/* una vista no rompe a otra */}});
  const DIAS_MOV=60;            // historial de movimientos que se mantiene en memoria para el stock (último conteo + posteriores)
  function escucharTodo(fecha){
    if(fecha===ctxFecha&&cierres.length)return;
    detener();ctxFecha=fecha;
    const desde=new Date(fecha+'T00:00:00').getTime()-DIAS_MOV*86400000;
    const fechaDesde=new Date(desde).toISOString().slice(0,10);
    escucharCatalogo();
    if(window.glacialAlmacenEnlaceDatos)window.glacialAlmacenEnlaceDatos.escuchar();   // stock de Almacén (Inventario de insumos) para el descuento por entregas
    const sub=(nombre,q,mapear)=>{
      cache.listo[nombre]=false;cache.error[nombre]='';
      cierres.push(q.onSnapshot(s=>{cache[nombre]=s.docs.map(d=>mapear?mapear(d):d.data());cache.listo[nombre]=true;cache.error[nombre]='';avisar();},
        e=>{cache.error[nombre]=mensajeError(e);avisar();}));
    };
    sub('movimientos',col('apMovimientos').where('en','>=',desde));
    sub('solicitudes',col('apSolicitudes').where('fecha','>=',fechaDesde));
    sub('mermas',col('apMermas').where('fecha','==',fecha));
    sub('conciliaciones',col('apConciliaciones').where('fecha','==',fecha));
    sub('coordinaciones',col('apCoordinaciones').where('fecha','==',fecha));
  }
  function detener(){cierres.splice(0).forEach(c=>{try{c();}catch(_){/* ya cerrada */}});ctxFecha='';}
  /* Catálogo (insumos, factores y parámetros de merma): una sola escucha por sesión, independiente de la fecha del Asistente. */
  function escucharCatalogo(){
    if(cierresCatalogo.length||typeof db==='undefined')return;
    const rol=typeof state!=='undefined'&&state.user?String(state.user.rol||''):'';
    if(rol==='mantenimiento_compartido')return;                 // las reglas no le dan lectura: sigue con los valores del código
    const sub=(nombre,ref,leer)=>{
      cache.listo[nombre]=false;cache.error[nombre]='';
      cierresCatalogo.push(ref.onSnapshot(s=>{cache[nombre]=leer(s);cache.listo[nombre]=true;cache.error[nombre]='';avisar();},
        e=>{cache.error[nombre]=mensajeError(e);avisar();}));
    };
    sub('insumos',col('apInsumos'),s=>s.docs.map(d=>d.data()));
    sub('factores',col('apFactores'),s=>s.docs.map(d=>d.data()));
    sub('parametrosMerma',col('apParametros').doc('merma'),s=>s.exists?s.data():null);
  }
  function detenerCatalogo(){cierresCatalogo.splice(0).forEach(c=>{try{c();}catch(_){/* ya cerrada */}});}
  window.glacialFactoresCatalogoEscuchas=escucharCatalogo;
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(()=>{detener();detenerCatalogo();cache.parametrosMerma=null;
    ['insumos','factores','movimientos','solicitudes','mermas','conciliaciones','coordinaciones'].forEach(k=>{cache[k]=[];});
    ['insumos','factores','parametrosMerma'].forEach(k=>{cache.listo[k]=false;cache.error[k]='';});});

  /* Consumo de un insumo con el catálogo, para el Nuevo registro y la tarjeta de Inicio. → {valor, factor, unidad} o null (sin catálogo
     cargado, con error de lectura o sin factor vigente): quien llama usa entonces su cálculo anterior, sin cambiar nada. */
  window.glacialFactoresCatalogo={
    listo:()=>!!(cache.listo.factores&&!cache.error.factores),
    consumo(insumo,linea,marca,presentacion,fecha,cant){
      if(!cierresCatalogo.length&&typeof state!=='undefined'&&state.user)escucharCatalogo();   // por si la sesión empezó antes de cargar este archivo
      if(!(cache.listo.factores&&!cache.error.factores)||!cache.factores.length)return null;
      const f=/^\d{4}-\d{2}-\d{2}$/.test(String(fecha||''))?fecha:new Date(ahora()-5*3600000).toISOString().slice(0,10);
      const r=N.consumoCatalogo(cache.factores,{insumo,linea,marca,presentacion,fecha:f},cant||{});
      if(r.error)return null;
      const ins=cache.insumos.find(i=>i.codigo===insumo);
      return {valor:r.valor,factor:r.factor,paletas:r.paletas,unidad:(ins&&ins.unidad)||'',nombre:(ins&&ins.nombre)||insumo};
    }
  };
  /* Lectura única de una fecha (Reporte General de otro día sin cambiar la escucha). */
  async function cargarFecha(fecha){
    const [m,c,s]=await Promise.all([col('apMermas').where('fecha','==',fecha).get(),col('apConciliaciones').where('fecha','==',fecha).get(),
      col('apMovimientos').where('fecha','==',fecha).get()]);
    return {mermas:m.docs.map(d=>d.data()),conciliaciones:c.docs.map(d=>d.data()),movimientos:s.docs.map(d=>d.data())};
  }

  /* ---------- catálogo: insumos y factores ---------- */
  async function guardarInsumo(ins,versionEsperada){
    if(!puede('gestionarFactores'))throw falla('PERMISO','No tienes permiso para administrar insumos.');
    const err=N.validarInsumo(ins);if(err.length)throw falla('VALIDACION',err.join(' · '));
    const ref=col('apInsumos').doc(ins.codigo);
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);const antes=s.exists?s.data():null;
      if(num(antes&&antes.version)!==num(versionEsperada))throw falla('CONFLICTO','El insumo cambió mientras lo editabas. Vuelve a abrirlo.');
      const d={codigo:ins.codigo,nombre:String(ins.nombre).trim(),unidad:ins.unidad,tipo:ins.tipo,itemCode:String(ins.itemCode||'').trim().toUpperCase(),activo:ins.activo!==false,version:num(antes&&antes.version)+1,...autor()};
      tx.set(ref,d);auditar(tx,'apInsumos',ins.codigo,antes?'EDITAR':'CREAR',antes,d);
    });
  }
  /* Un cambio de factor NO edita el valor anterior: cierra su vigencia (día anterior) y crea una versión nueva desde la fecha indicada.
     Así los datos históricos siguen calculándose con el factor de su fecha. */
  async function guardarFactor(f,anteriorId){
    if(!puede('gestionarFactores'))throw falla('PERMISO','No tienes permiso para modificar factores de consumo.');
    const err=N.validarFactor(f);if(err.length)throw falla('VALIDACION',err.join(' · '));
    const nuevo={...f,linea:N.codigoLinea(f.linea),marca:f.marca||'*',presentacion:f.presentacion||'*',cantidadBase:num(f.cantidadBase),factor:num(f.factor),
      vigenteHasta:f.vigenteHasta||null,activo:f.activo!==false,origen:f.origen||'manual'};
    nuevo.id=N.idFactor(nuevo);
    const ref=col('apFactores').doc(nuevo.id),refAnt=anteriorId?col('apFactores').doc(anteriorId):null;
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);
      const ant=refAnt?await tx.get(refAnt):null;
      if(s.exists&&(!refAnt||anteriorId!==nuevo.id))throw falla('CONFLICTO','Ya existe un factor con la misma línea, insumo, marca, presentación y fecha de inicio.');
      if(refAnt&&ant.exists&&anteriorId!==nuevo.id){
        const a=ant.data();
        if(nuevo.vigenteDesde<=a.vigenteDesde)throw falla('VALIDACION','La nueva vigencia debe empezar después de la del factor anterior ('+a.vigenteDesde+').');
        const hasta=new Date(new Date(nuevo.vigenteDesde+'T12:00:00').getTime()-86400000).toISOString().slice(0,10);
        const cerrado={...a,vigenteHasta:hasta,version:num(a.version)+1,...autor()};
        tx.set(refAnt,cerrado);auditar(tx,'apFactores',anteriorId,'CERRAR_VIGENCIA',a,cerrado);
      }
      const antes=s.exists?s.data():null;
      const d={...nuevo,version:num(antes&&antes.version)+1,...autor()};
      tx.set(ref,d);auditar(tx,'apFactores',nuevo.id,antes?'EDITAR':'CREAR',antes,d);
    });
    return nuevo.id;
  }
  /* Migración de los factores fijos del código (05-utils.js) y del catálogo base de insumos. Idempotente: solo crea lo que falta. */
  async function migrarFactoresDelCodigo(){
    if(!puede('gestionarFactores'))throw falla('PERMISO','No tienes permiso para migrar factores.');
    const c={};
    ['CAJAS_PREFORMAS_DIVISOR','FACTOR_CARTON_PET','FACTOR_POLIETILENO_PET','FACTOR_STRETCHFILM_PET','CARTON_FIJO_B7L','CARTON_C20L_SAN_FERNANDO','CARTON_C20L_DEFAULT','CARTON_FIJO_B20L',
      'POLIETILENO_B7L_FACTOR','POLIETILENO_C20L_FACTOR','MARCAS_POLIETILENO_B7L_SI','STRETCHFILM_B7L_FACTOR','STRETCHFILM_C20L_FACTOR','STRETCHFILM_B20L_FACTOR','PRESENTACIONES_POR_LINEA']
      .forEach(n=>{try{c[n]=(0,eval)(n);}catch(_){c[n]=undefined;}});      // constantes globales de 01-config.js / 05-utils.js
    const factores=N.factoresDesdeCodigo(c,'2020-01-01');
    let creados=0,existentes=0;
    const todos=[...N.INSUMOS_BASE.map(i=>({tipo:'insumo',d:i})),...factores.map(f=>({tipo:'factor',d:f}))];
    for(let i=0;i<todos.length;i+=200){           // lotes pequeños: cada transacción admite como máximo 500 escrituras
      const lote=todos.slice(i,i+200);
      await db.runTransaction(async tx=>{
        const refs=lote.map(x=>x.tipo==='insumo'?col('apInsumos').doc(x.d.codigo):col('apFactores').doc(x.d.id));
        const snaps=[];for(const r of refs)snaps.push(await tx.get(r));
        let c1=0,c2=0;
        lote.forEach((x,j)=>{
          if(snaps[j].exists){c2++;return;}
          const d={...x.d,activo:true,version:1,...autor()};
          tx.set(refs[j],d);auditar(tx,x.tipo==='insumo'?'apInsumos':'apFactores',x.tipo==='insumo'?x.d.codigo:x.d.id,'MIGRAR_CODIGO',null,d);c1++;
        });
        creados+=c1;existentes+=c2;
      });
    }
    return {creados,existentes,total:todos.length};
  }

  /* ---------- movimientos (libro inmutable) ---------- */
  function validarMovimiento(m){
    const e=[];
    if(!N.TIPOS_MOV.includes(m.tipo)||m.tipo==='ANULACION'||m.tipo==='CONSUMO')e.push('Tipo de movimiento no válido.');
    if(!String(m.insumo||'').trim())e.push('Indica el insumo.');
    if(m.cantidad===undefined||m.cantidad===null||String(m.cantidad).trim()==='')e.push('Escribe la cantidad (en un conteo, escribe 0 si no hay nada: un campo vacío no se guarda como 0).');
    else if(!(num(m.cantidad)>=0)||(m.tipo!=='CONTEO'&&!(num(m.cantidad)>0)))e.push('La cantidad debe ser mayor que 0 (un conteo puede ser 0).');
    if(!['UTILIZABLE','OBSERVADO'].includes(m.condicion||'UTILIZABLE'))e.push('Condición no válida.');
    if(m.tipo!=='CONTEO'&&!String(m.cuadro||'').trim())e.push('Indica el cuadro (línea, marca y presentación) al que corresponde.');
    return e;
  }
  /* Registrar un movimiento con su opId. Si ya existe (reintento), devuelve el existente sin duplicar.
     Una devolución no puede dejar el saldo utilizable en negativo (regla explícita: no hay stock negativo sin autorización). */
  async function registrarMovimiento(m){
    if(!puede('asistenteProduccion'))throw falla('PERMISO','No tienes permiso para registrar movimientos de material.');
    const err=validarMovimiento(m);if(err.length)throw falla('VALIDACION',err.join(' · '));
    const opId=String(m.opId||nuevoId('mov'));const ref=col('apMovimientos').doc(opId);
    if(['DEVOLUCION','TRANSFERENCIA_SALIDA'].includes(m.tipo)){
      const s=N.saldoInsumo(cache.movimientos,m.insumo);
      if(num(m.cantidad)>s[(m.condicion||'UTILIZABLE')==='OBSERVADO'?'observado':'utilizable']+1e-9&&!m.autorizarNegativo)
        throw falla('VALIDACION','La salida dejaría el saldo en negativo. Registra primero un conteo o pide autorización.');
    }
    const u=usuario();let resultado=null;
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);
      if(s.exists){resultado={duplicado:true,movimiento:s.data()};return;}
      const d={opId,tipo:m.tipo,fecha:m.fecha,bloque:N.bloqueDe(m.bloque),linea:m.linea||'',cuadro:m.cuadro||'',insumo:m.insumo,unidad:m.unidad||'',
        cantidad:num(m.cantidad),condicion:m.condicion||'UTILIZABLE',lote:m.lote||'',solicitudId:m.solicitudId||'',motivo:String(m.motivo||'').trim(),
        evidencia:m.evidencia||'',en:ahora(),uid:u.uid,usuario:u.nombre,guardadoEn:serverTs()};
      tx.set(ref,d);auditar(tx,'apMovimientos',opId,'CREAR',null,d);resultado={duplicado:false,movimiento:d};
    });
    return resultado;
  }
  async function anularMovimiento(opId,motivo){
    if(!puede('asistenteProduccion'))throw falla('PERMISO','No tienes permiso para anular movimientos.');
    if(String(motivo||'').trim().length<5)throw falla('VALIDACION','Indica el motivo de la anulación (mínimo 5 caracteres).');
    const ref=col('apMovimientos').doc('ANUL_'+opId),orig=col('apMovimientos').doc(opId);const u=usuario();
    await db.runTransaction(async tx=>{
      const o=await tx.get(orig);if(!o.exists)throw falla('VALIDACION','El movimiento no existe.');
      if(o.data().tipo==='CONSUMO')throw falla('VALIDACION','El consumo se corrige reabriendo la conciliación, no anulando el movimiento.');
      const s=await tx.get(ref);if(s.exists)return;
      const d={opId:'ANUL_'+opId,tipo:'ANULACION',anulaA:opId,fecha:o.data().fecha,bloque:o.data().bloque,linea:o.data().linea||'',cuadro:o.data().cuadro||'',insumo:o.data().insumo,
        unidad:o.data().unidad||'',cantidad:0,condicion:o.data().condicion||'UTILIZABLE',motivo:String(motivo).trim(),en:ahora(),uid:u.uid,usuario:u.nombre,guardadoEn:serverTs()};
      tx.set(ref,d);auditar(tx,'apMovimientos','ANUL_'+opId,'ANULAR',o.data(),d);
    });
  }

  /* ---------- solicitudes a Almacén ---------- */
  async function crearSolicitud(s){
    if(!puede('asistenteProduccion'))throw falla('PERMISO','No tienes permiso para crear solicitudes.');
    const items=(s.items||[]).filter(i=>num(i.solicitado)>0).map(i=>({insumo:i.insumo,unidad:i.unidad,solicitado:N.red(num(i.solicitado),4),entregado:0,recibido:0,devuelto:0}));
    if(!items.length)throw falla('VALIDACION','Agrega al menos un insumo con cantidad mayor que 0.');
    const id=s.id||('SOL-'+String(s.fecha).replace(/-/g,'')+'-'+ahora().toString(36).slice(-5).toUpperCase());
    const ref=col('apSolicitudes').doc(id);const u=usuario();
    await db.runTransaction(async tx=>{
      const x=await tx.get(ref);if(x.exists)return;          // reintento: ya creada
      const d={id,fecha:s.fecha,bloque:N.bloqueDe(s.bloque),linea:s.linea||'',estado:s.enviar?'SOLICITADA':'BORRADOR',items,observaciones:String(s.observaciones||'').trim(),
        historial:[{estado:s.enviar?'SOLICITADA':'BORRADOR',por:u.nombre,uid:u.uid,en:ahora(),nota:'Creada'}],version:1,creadoPor:u.nombre,creadoUid:u.uid,...autor()};
      tx.set(ref,d);auditar(tx,'apSolicitudes',id,'CREAR',null,d);
    });
    return id;
  }
  /* Cambio de estado con control de versión. datos: {entregas:{insumo:cant}} (Almacén) o {recepciones:{insumo:cant}, cuadro, linea} (Producción). */
  async function cambiarEstadoSolicitud(id,estadoNuevo,versionEsperada,datos){
    datos=datos||{};
    const actor=N.ACTOR_ESTADO[estadoNuevo];
    if(actor==='almacen'&&!puede('moduloAlmacen'))throw falla('PERMISO','Solo Almacén prepara y entrega solicitudes.');
    if(actor==='asistente'&&!puede('asistenteProduccion'))throw falla('PERMISO','Solo el Asistente de Producción pide, recibe, observa o cierra solicitudes.');
    const ref=col('apSolicitudes').doc(id);const u=usuario();
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);if(!s.exists)throw falla('VALIDACION','La solicitud no existe.');
      const sol=s.data();
      if(num(sol.version)!==num(versionEsperada))throw falla('CONFLICTO','La solicitud cambió mientras la revisabas (otra persona guardó). Vuelve a abrirla.');
      let items=sol.items,estado=estadoNuevo,movs=[],movsAlm=[];
      if(estadoNuevo==='ENTREGADA'||estadoNuevo==='ENTREGADA_PARCIAL'){
        const r=N.aplicarEntrega(sol,datos.entregas||{},{permitirExceso:!!datos.permitirExceso});if(r.errores)throw falla('VALIDACION',r.errores.join(' · '));
        items=r.items;estado=r.estado;
        // Enlace con el Inventario: la entrega resta del stock de Almacén (libro apAlmacenMov, mismo commit que la solicitud).
        const enl=window.glacialAlmacenEnlaceDatos;
        if(enl){
          const ent=datos.entregas||{};
          const rev=enl.revisarEntrega(sol,ent,{autorizarSinStock:!!datos.autorizarSinStock,motivo:datos.motivoSinStock});
          if(rev.errores.length)throw falla('VALIDACION',rev.errores.join(' · '));
          const nEnt=(sol.historial||[]).filter(h=>h.entrega).length;
          movsAlm=enl.movimientosEntrega(sol,ent,nEnt+1,{en:ahora(),sinStock:rev.sinStock,motivo:datos.motivoSinStock,fecha:sol.fecha});
        }
      }else if(estadoNuevo==='RECIBIDA'){
        const r=N.aplicarRecepcion(sol,datos.recepciones||{});if(r.errores)throw falla('VALIDACION',r.errores.join(' · '));
        if(!r.movimientos.length)throw falla('VALIDACION','Indica lo realmente recibido.');
        /* Con cuadros programados se exige el cuadro; si ese día y turno no tiene ninguno (no se cargó la programación), se exige al menos la línea. */
        if(!String(datos.cuadro||'').trim()){
          if(!datos.sinCuadros)throw falla('VALIDACION','Indica el cuadro al que se destina lo recibido.');
          if(!String(datos.linea||sol.linea||'').trim())throw falla('VALIDACION','No hay cuadros programados para esa fecha y turno: indica la línea a la que se destina lo recibido.');
        }
        items=r.items;estado=r.estado;movs=r.movimientos;
      }
      if(estado!==sol.estado&&!N.puedeTransicion(sol.estado,estado))throw falla('VALIDACION','No se puede pasar de '+sol.estado+' a '+estado+'.');
      const nRec=(sol.historial||[]).filter(h=>h.recepcion).length;
      // Cada recepción crea su movimiento RECEPCION con id determinista (solicitud + número de recepción): un reintento no duplica stock.
      movs.forEach((m,j)=>{
        const opId=id+'_REC'+(nRec+1)+'_'+m.insumo;
        const d={opId,tipo:'RECEPCION',fecha:sol.fecha,bloque:sol.bloque,linea:datos.linea||sol.linea||'',cuadro:datos.cuadro,insumo:m.insumo,unidad:m.unidad,cantidad:m.cantidad,
          condicion:'UTILIZABLE',lote:datos.lote||'',solicitudId:id,motivo:'',en:ahora()+j,uid:u.uid,usuario:u.nombre,guardadoEn:serverTs()};
        tx.set(col('apMovimientos').doc(opId),d);auditar(tx,'apMovimientos',opId,'CREAR',null,d);
      });
      movsAlm.forEach(m=>{
        const d={...m,uid:u.uid,usuario:u.nombre,guardadoEn:serverTs()};
        tx.set(col('apAlmacenMov').doc(m.opId),d);auditar(tx,'apAlmacenMov',m.opId,'CREAR',null,d);
      });
      const nuevo={...sol,items,estado,version:num(sol.version)+1,
        historial:[...(sol.historial||[]),{estado,por:u.nombre,uid:u.uid,en:ahora(),nota:String(datos.nota||'').trim(),recepcion:movs.length?true:undefined,
          entrega:(estadoNuevo==='ENTREGADA'||estadoNuevo==='ENTREGADA_PARCIAL')?true:undefined,
          entregas:(estadoNuevo==='ENTREGADA'||estadoNuevo==='ENTREGADA_PARCIAL')?Object.fromEntries(Object.entries(datos.entregas||{}).filter(([,q])=>num(q)>0).map(([k,q])=>[k,N.red(num(q),4)])):undefined}].map(h=>limpio(h)),...autor()};
      tx.set(ref,nuevo);auditar(tx,'apSolicitudes',id,'ESTADO_'+estado,{estado:sol.estado,items:sol.items},{estado,items});
    });
  }

  /* Anular una entrega de Almacén (n = número de entrega dentro de la solicitud, 1, 2…). Solo Almacén. Devuelve el stock a Almacén (movimiento ANULACION
     en apAlmacenMov, el original no se toca), baja lo «entregado» de la solicitud y la deja EN_PREPARACION / ENTREGADA_PARCIAL / ENTREGADA según lo que quede.
     No se puede si Producción ya confirmó la recepción de ese material (entregado − anulado < recibido). */
  async function anularEntrega(id,n,versionEsperada,motivo){
    if(!puede('moduloAlmacen'))throw falla('PERMISO','Solo Almacén anula sus entregas.');
    if(String(motivo||'').trim().length<5)throw falla('VALIDACION','Indica el motivo de la anulación (mínimo 5 caracteres).');
    const ref=col('apSolicitudes').doc(id);const u=usuario();
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);if(!s.exists)throw falla('VALIDACION','La solicitud no existe.');
      const sol=s.data();
      if(num(sol.version)!==num(versionEsperada))throw falla('CONFLICTO','La solicitud cambió mientras la revisabas (otra persona guardó). Vuelve a abrirla.');
      if(!['ENTREGADA','ENTREGADA_PARCIAL'].includes(sol.estado))throw falla('VALIDACION','Solo se anula una entrega mientras la solicitud está «Entregada» o «Entregada parcialmente».');
      const entregas=(sol.historial||[]).filter(h=>h&&h.entrega);const e=entregas[num(n)-1];
      if(!e)throw falla('VALIDACION','No existe la entrega n.º '+n+'.');
      if((sol.historial||[]).some(h=>h&&h.anulaEntrega===num(n)))throw falla('VALIDACION','Esa entrega ya fue anulada.');
      if(!e.entregas||!Object.keys(e.entregas).length)throw falla('VALIDACION','Esta entrega es anterior al detalle por insumo y no se puede anular desde aquí.');
      const items=(sol.items||[]).map(i=>({...i}));const errores=[],movs=[];
      Object.keys(e.entregas).forEach(ins=>{
        const it=items.find(i=>i.insumo===ins);if(!it)return;
        const q=num(e.entregas[ins]);const nuevo=N.red(num(it.entregado)-q,4);
        if(nuevo<num(it.recibido)-1e-9)errores.push(`${ins}: Producción ya confirmó ${num(it.recibido)} recibidos; no se pueden anular ${q}.`);
        it.entregado=Math.max(nuevo,0);
      });
      if(errores.length)throw falla('VALIDACION',errores.join(' · ')+' Pide a Producción que haga la devolución.');
      // movimientos ya creados por esa entrega (solo los insumos enlazados con el Inventario)
      const lecturas=[];
      for(const ins of Object.keys(e.entregas)){
        const opId=id+'_ENT'+num(n)+'_'+ins;
        const o=await tx.get(col('apAlmacenMov').doc(opId));
        const a=await tx.get(col('apAlmacenMov').doc('ANUL_'+opId));
        lecturas.push({opId,o,a});
      }
      lecturas.forEach(({opId,o,a})=>{if(o.exists&&!a.exists)movs.push({opId:'ANUL_'+opId,tipo:'ANULACION',insumo:o.data().insumo,itemCode:o.data().itemCode,cantidad:o.data().cantidad,unidad:o.data().unidad,fecha:o.data().fecha,solicitudId:id,anulaA:opId,motivo:String(motivo).trim(),en:ahora()});});
      const completo=items.every(i=>num(i.entregado)>=num(i.solicitado));const algo=items.some(i=>num(i.entregado)>0);
      const estado=completo?'ENTREGADA':(algo?'ENTREGADA_PARCIAL':'EN_PREPARACION');
      movs.forEach(m=>{const d={...m,uid:u.uid,usuario:u.nombre,guardadoEn:serverTs()};tx.set(col('apAlmacenMov').doc(m.opId),d);auditar(tx,'apAlmacenMov',m.opId,'ANULAR',null,d);});
      const nuevo={...sol,items,estado,version:num(sol.version)+1,
        historial:[...(sol.historial||[]),{estado,por:u.nombre,uid:u.uid,en:ahora(),nota:'Entrega n.º '+num(n)+' anulada: '+String(motivo).trim(),anulaEntrega:num(n)}].map(h=>limpio(h)),...autor()};
      tx.set(ref,nuevo);auditar(tx,'apSolicitudes',id,'ANULAR_ENTREGA',{estado:sol.estado,items:sol.items},{estado,items,entrega:num(n),motivo:String(motivo).trim()});
    });
  }

  /* ---------- mermas ---------- */
  /* Causas y etapas configurables (apParametros/merma). Sin documento se usan las de siempre (70-asistente-nucleo.js). */
  const causasMerma=()=>N.listaOk(cache.parametrosMerma&&cache.parametrosMerma.causas,N.CAUSAS_MERMA);
  const etapasMerma=()=>N.listaOk(cache.parametrosMerma&&cache.parametrosMerma.etapas,N.ETAPAS_MERMA);
  const puedeConfigurarMerma=()=>puede('gestionarFactores')||puede('validarMermas');
  async function guardarParametrosMerma(p,versionEsperada){
    if(!puedeConfigurarMerma())throw falla('PERMISO','No tienes permiso para configurar las causas de merma.');
    const causas=(p.causas||[]).map(x=>String(x||'').trim()).filter(Boolean),etapas=(p.etapas||[]).map(x=>String(x||'').trim()).filter(Boolean);
    const err=[...N.validarListaMerma(causas,'causa'),...N.validarListaMerma(etapas,'etapa')];
    if(err.length)throw falla('VALIDACION',err.join(' · '));
    const ref=col('apParametros').doc('merma');const u=usuario();
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);const antes=s.exists?s.data():null;
      if(num(antes&&antes.version)!==num(versionEsperada))throw falla('CONFLICTO','Otra persona cambió las causas mientras las editabas. Vuelve a abrirlas.');
      const d={id:'merma',causas,etapas,version:num(antes&&antes.version)+1,
        historial:[...((antes&&antes.historial)||[]),{por:u.nombre,uid:u.uid,en:ahora(),causas:causas.length,etapas:etapas.length}],...autor()};
      tx.set(ref,d);auditar(tx,'apParametros','merma',antes?'EDITAR':'CREAR',antes&&{causas:antes.causas,etapas:antes.etapas},{causas,etapas});
    });
  }
  async function registrarMerma(m){
    if(!puede('asistenteProduccion'))throw falla('PERMISO','No tienes permiso para registrar mermas.');
    const err=N.validarMerma(m,causasMerma());if(err.length)throw falla('VALIDACION',err.join(' · '));
    const id=String(m.id||nuevoId('mer'));const ref=col('apMermas').doc(id);const u=usuario();
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);if(s.exists)return;           // reintento: no se duplica
      const d={id,fecha:m.fecha,bloque:N.bloqueDe(m.bloque),linea:N.codigoLinea(m.linea),cuadro:m.cuadro,marca:m.marca||'',presentacion:m.presentacion||'',
        categoria:m.categoria,insumo:m.insumo,unidad:m.unidad,cantidad:N.red(num(m.cantidad),4),causa:m.causa,etapa:m.etapa||'',lote:m.lote||'',
        evidencia:m.evidencia||'',estado:'PENDIENTE',validadoPor:'',validadoEn:null,observaciones:String(m.observaciones||'').trim(),origen:'ASISTENTE',
        historial:[{estado:'PENDIENTE',por:u.nombre,uid:u.uid,en:ahora()}],version:1,creadoPor:u.nombre,creadoUid:u.uid,...autor()};
      tx.set(ref,d);auditar(tx,'apMermas',id,'CREAR',null,d);
    });
    return id;
  }
  /* Corrección de una merma que sigue PENDIENTE (previsualización del reporte). Campos corregibles: insumo, unidad, cantidad, cuadro (marca y presentación),
     causa, etapa, lote y observaciones. Una merma VALIDADA o RECHAZADA no se edita. Queda en el historial de la merma y en la auditoría, con el motivo. */
  const CAMPOS_MERMA=['categoria','insumo','unidad','cantidad','cuadro','marca','presentacion','causa','etapa','lote','observaciones'];
  async function editarMerma(id,cambios,versionEsperada,motivo){
    if(!puede('asistenteProduccion'))throw falla('PERMISO','No tienes permiso para corregir mermas.');
    if(String(motivo||'').trim().length<5)throw falla('VALIDACION','Indica el motivo de la corrección (mínimo 5 caracteres).');
    const ref=col('apMermas').doc(id);const u=usuario();
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);if(!s.exists)throw falla('VALIDACION','La merma no existe.');
      const m=s.data();
      if(num(m.version)!==num(versionEsperada))throw falla('CONFLICTO','La merma cambió mientras la corregías. Vuelve a abrirla.');
      if(m.estado!=='PENDIENTE')throw falla('VALIDACION','La merma ya fue '+String(m.estado).toLowerCase()+': no se puede corregir. Pide a quien valida que la rechace y registra una nueva.');
      const nuevo={...m};CAMPOS_MERMA.forEach(k=>{if(cambios&&cambios[k]!==undefined)nuevo[k]=k==='cantidad'?N.red(num(cambios[k]),4):cambios[k];});
      const err=N.validarMerma(nuevo,causasMerma());if(err.length)throw falla('VALIDACION',err.join(' · '));
      const antes={},despues={};CAMPOS_MERMA.forEach(k=>{if(String(m[k]??'')!==String(nuevo[k]??'')){antes[k]=m[k]??null;despues[k]=nuevo[k]??null;}});
      if(!Object.keys(despues).length)throw falla('VALIDACION','No hay cambios que guardar.');
      const d={...nuevo,version:num(m.version)+1,historial:[...(m.historial||[]),{estado:'PENDIENTE',por:u.nombre,uid:u.uid,en:ahora(),nota:'Corregida: '+String(motivo).trim(),edicion:true}].map(h=>limpio(h)),...autor()};
      tx.set(ref,d);auditar(tx,'apMermas',id,'CORREGIR',{...antes,motivo:null},{...despues,motivo:String(motivo).trim()});
    });
  }
  async function validarMerma(id,estado,versionEsperada,nota){
    if(!puede('validarMermas'))throw falla('PERMISO','No tienes permiso para validar mermas.');
    if(!['VALIDADA','RECHAZADA'].includes(estado))throw falla('VALIDACION','Estado no válido.');
    if(estado==='RECHAZADA'&&String(nota||'').trim().length<5)throw falla('VALIDACION','Indica el motivo del rechazo (mínimo 5 caracteres).');
    const ref=col('apMermas').doc(id);const u=usuario();
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);if(!s.exists)throw falla('VALIDACION','La merma no existe.');
      const m=s.data();
      if(num(m.version)!==num(versionEsperada))throw falla('CONFLICTO','La merma cambió mientras la revisabas. Vuelve a abrirla.');
      if(m.estado!=='PENDIENTE')throw falla('VALIDACION','La merma ya fue '+m.estado.toLowerCase()+'.');
      const d={...m,estado,validadoPor:u.nombre,validadoUid:u.uid,validadoEn:ahora(),version:num(m.version)+1,
        historial:[...(m.historial||[]),{estado,por:u.nombre,uid:u.uid,en:ahora(),nota:String(nota||'').trim()}],...autor()};
      tx.set(ref,d);auditar(tx,'apMermas',id,estado,{estado:m.estado},{estado,nota:String(nota||'')});
    });
  }

  /* ---------- conciliaciones ---------- */
  const idConciliacion=(clave,insumo)=>(clave+'|'+insumo).replace(/[^A-Za-z0-9_.-]+/g,'_').slice(0,700);
  /* Guarda saldos y observaciones (BORRADOR / EN_REVISION). CONFIRMAR (validarMermas) crea UN movimiento CONSUMO por cuadro e insumo con id
     determinista: confirmar dos veces no descuenta dos veces. Reabrir anula ese consumo y vuelve a BORRADOR. */
  async function guardarConciliacion(c,accion,versionEsperada){
    const id=idConciliacion(c.cuadro,c.insumo);const ref=col('apConciliaciones').doc(id);
    if(accion==='CONFIRMAR'||accion==='REABRIR'){if(!puede('validarMermas'))throw falla('PERMISO','Solo quien valida puede confirmar o reabrir una conciliación.');}
    else if(!puede('asistenteProduccion'))throw falla('PERMISO','No tienes permiso para registrar consumos.');
    const u=usuario();
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);const antes=s.exists?s.data():null;
      if(num(antes&&antes.version)!==num(versionEsperada))throw falla('CONFLICTO','La conciliación cambió mientras la editabas. Vuelve a abrirla.');
      if(antes&&antes.estado==='CONFIRMADA'&&accion!=='REABRIR')throw falla('VALIDACION','La conciliación está confirmada. Reábrela para corregirla.');
      const estado={BORRADOR:'BORRADOR',ENVIAR:'EN_REVISION',CONFIRMAR:'CONFIRMADA',REABRIR:'BORRADOR'}[accion];
      if(!estado)throw falla('VALIDACION','Acción no válida.');
      const base=antes||{};
      const d={id,fecha:c.fecha||base.fecha,bloque:N.bloqueDe(c.bloque||base.bloque),linea:c.linea||base.linea,cuadro:c.cuadro,insumo:c.insumo,unidad:c.unidad||base.unidad||'',
        saldoInicial:accion==='CONFIRMAR'||accion==='REABRIR'?base.saldoInicial:(c.saldoInicial===''||c.saldoInicial===null||c.saldoInicial===undefined?null:num(c.saldoInicial)),
        saldoFinal:accion==='CONFIRMAR'||accion==='REABRIR'?base.saldoFinal:(c.saldoFinal===''||c.saldoFinal===null||c.saldoFinal===undefined?null:num(c.saldoFinal)),
        observaciones:accion==='CONFIRMAR'||accion==='REABRIR'?(base.observaciones||''):String(c.observaciones||'').trim(),
        estado,reaperturas:num(base.reaperturas),consumoId:base.consumoId||null,consumoReal:base.consumoReal===undefined?null:base.consumoReal,
        version:num(base.version)+1,historial:[...(base.historial||[]),{estado,por:u.nombre,uid:u.uid,en:ahora(),nota:String(c.nota||'').trim()}],...autor()};
      const consumoId='CONS_'+id;
      if(accion==='CONFIRMAR'){
        if(d.saldoInicial===null||d.saldoFinal===null)throw falla('VALIDACION','Faltan saldos: no se puede confirmar (Pendiente de conciliación).');
        if(!(c.real>=0))throw falla('VALIDACION','El consumo real calculado no es válido.');
        // Un consumo por cuadro e insumo y por ciclo de confirmación: tras una reapertura, la nueva confirmación usa otro id (el anterior quedó anulado).
        const cid=num(base.reaperturas)?consumoId+'_R'+num(base.reaperturas):consumoId;
        const mv={opId:cid,tipo:'CONSUMO',fecha:d.fecha,bloque:d.bloque,linea:d.linea,cuadro:d.cuadro,insumo:d.insumo,unidad:d.unidad,cantidad:N.red(c.real,4),condicion:'UTILIZABLE',
          motivo:'Conciliación confirmada',en:ahora(),uid:u.uid,usuario:u.nombre,guardadoEn:serverTs()};
        const existe=await tx.get(col('apMovimientos').doc(cid));
        if(!existe.exists){tx.set(col('apMovimientos').doc(cid),mv);auditar(tx,'apMovimientos',cid,'CREAR',null,mv);}
        d.consumoId=cid;d.consumoReal=N.red(c.real,4);
      }
      if(accion==='REABRIR'){
        if(String(c.nota||'').trim().length<5)throw falla('VALIDACION','Indica el motivo para reabrir (mínimo 5 caracteres).');
        if(base.consumoId){
          const aid='ANUL_'+base.consumoId;const ex=await tx.get(col('apMovimientos').doc(aid));
          if(!ex.exists){const an={opId:aid,tipo:'ANULACION',anulaA:base.consumoId,fecha:d.fecha,bloque:d.bloque,linea:d.linea,cuadro:d.cuadro,insumo:d.insumo,unidad:d.unidad,
            cantidad:0,condicion:'UTILIZABLE',motivo:'Reapertura: '+String(c.nota).trim(),en:ahora(),uid:u.uid,usuario:u.nombre,guardadoEn:serverTs()};
            tx.set(col('apMovimientos').doc(aid),an);auditar(tx,'apMovimientos',aid,'ANULAR',null,an);}
        }
        d.consumoId=null;d.consumoReal=null;d.reaperturas=num(base.reaperturas)+1;
      }
      tx.set(ref,{...limpio(d),actualizadoEn:serverTs()});            // una sola escritura (las reglas evalúan el estado final)
      auditar(tx,'apConciliaciones',id,accion,antes&&{estado:antes.estado,saldoInicial:antes.saldoInicial,saldoFinal:antes.saldoFinal},{estado:d.estado,saldoInicial:d.saldoInicial,saldoFinal:d.saldoFinal});
    });
  }


  /* ---------- coordinaciones del turno (seguimiento: pendiente, responsable, prioridad) ---------- */
  const RESPONSABLES=['Asistente de Producción','Supervisor de Producción','Almacén','Mantenimiento','Jefatura de Producción','Planificación'];
  const PRIORIDADES=['Normal','Alta','Urgente'];
  async function registrarCoordinacion(c){
    if(!puede('asistenteProduccion'))throw falla('PERMISO','No tienes permiso para registrar seguimientos.');
    const texto=String(c.texto||'').trim();
    if(texto.length<5)throw falla('VALIDACION','Describe el pendiente (mínimo 5 caracteres).');
    if(!RESPONSABLES.includes(c.responsable))throw falla('VALIDACION','Elige el responsable.');
    if(!PRIORIDADES.includes(c.prioridad))throw falla('VALIDACION','Elige la prioridad.');
    const id=String(c.id||nuevoId('coo'));const ref=col('apCoordinaciones').doc(id);const u=usuario();
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);if(s.exists)return;            // reintento: no se duplica
      const d={id,fecha:c.fecha,bloque:N.bloqueDe(c.bloque),linea:c.linea||'',texto,responsable:c.responsable,prioridad:c.prioridad,estado:'ABIERTA',
        historial:[{estado:'ABIERTA',por:u.nombre,uid:u.uid,en:ahora()}],version:1,creadoPor:u.nombre,creadoUid:u.uid,...autor()};
      tx.set(ref,d);auditar(tx,'apCoordinaciones',id,'CREAR',null,d);
    });
    return id;
  }
  async function cerrarCoordinacion(id,versionEsperada,nota){
    if(!puede('asistenteProduccion'))throw falla('PERMISO','No tienes permiso para cerrar seguimientos.');
    const ref=col('apCoordinaciones').doc(id);const u=usuario();
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);if(!s.exists)throw falla('VALIDACION','El seguimiento no existe.');
      const c=s.data();
      if(num(c.version)!==num(versionEsperada))throw falla('CONFLICTO','El seguimiento cambió mientras lo revisabas. Vuelve a abrirlo.');
      if(c.estado!=='ABIERTA')throw falla('VALIDACION','El seguimiento ya está cerrado.');
      const d={...c,estado:'CERRADA',version:num(c.version)+1,historial:[...(c.historial||[]),{estado:'CERRADA',por:u.nombre,uid:u.uid,en:ahora(),nota:String(nota||'').trim()}],...autor()};
      tx.set(ref,d);auditar(tx,'apCoordinaciones',id,'CERRAR',{estado:c.estado},{estado:'CERRADA'});
    });
  }

  /* ---------- historial (auditoría) ---------- */
  async function auditoriaDe(coleccion,docId){
    const q=await col('apAuditoria').where('coleccion','==',coleccion).where('docId','==',String(docId)).get();
    return q.docs.map(d=>d.data()).sort((a,b)=>num(a.en&&a.en.toMillis?a.en.toMillis():a.en)-num(b.en&&b.en.toMillis?b.en.toMillis():b.en));
  }

  window.glacialAsistenteDatos={
    CAPACIDADES,capacidad,puede,cache,escucharTodo,detener,cargarFecha,alCambiar:f=>{oyentes.push(f);return ()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};},
    guardarInsumo,guardarFactor,migrarFactoresDelCodigo,registrarMovimiento,anularMovimiento,validarMovimiento,crearSolicitud,cambiarEstadoSolicitud,anularEntrega,
    registrarMerma,editarMerma,validarMerma,guardarConciliacion,idConciliacion,auditoriaDe,mensajeError,nuevoId,ahora,
    RESPONSABLES,PRIORIDADES,registrarCoordinacion,cerrarCoordinacion,
    escucharCatalogo,causasMerma,etapasMerma,puedeConfigurarMerma,guardarParametrosMerma
  };
})();
