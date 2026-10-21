/* =============================================================
   GLACIAL · INVENTARIO DE INSUMOS — DATOS (capa documento: db.collection / onSnapshot / runTransaction), PERMISOS Y AUDITORÍA
   -------------------------------------------------------------
   Mismo mecanismo que el Asistente de Producción (71-asistente-datos.js) y que Paletas: el puente a Supabase traduce estas llamadas a
   fs_docs / fs_items; no se usa la API de tablas de Supabase ni se crean tablas nuevas. Colecciones (docs/asistente/inventario-insumos.md):
     · insumosCatalogo/catalogo      → { items:[ {id, codigo (interno INS-0001), itemCode, nombre, grupo, categoria, subtipo, marca, presentacion, unidad,
                                          stockMinimo, puntoReorden, activo, prioritario, precio, alias?} ] }   (un ítem por artículo)
     · insumosCortesIndice/{corteId} → metadatos livianos de cada corte (fecha, quién, archivo, resumen): se escucha completo.
     · insumosCortesDetalle/{corteId}→ { items:[ {id, w:[6 almacenes AP], t} ] }: el stock del corte. Solo se escucha el corte elegido.
     · insumosAuditoria/{auto}       → quién, cuándo, qué cambió (antes → después) y en qué artículo (solo se crea).
   Cada lista tiene elementos con «id» (el puente guarda una fila por elemento y solo viaja lo que cambió: dos personas no se pisan).
   Permisos: clave 'inventarioInsumos' (Gestión de usuarios). Por defecto la ven la Asistente de Producción, el Administrador y el Jefe de
   Operaciones; escribe la Asistente y el Administrador (el Jefe de Operaciones y los demás roles de consulta solo ven).
   Las reglas de Supabase para estas colecciones están en supabase/migraciones/glacial_24_inventario_insumos.sql (aplicada en producción).
   ============================================================= */
(function instalarInventarioInsumosDatos(){
  'use strict';
  const N=window.glacialInventarioNucleo;
  if(!N)return;
  const num=N.num;
  const falla=(codigo,msg)=>{const e=new Error(msg);e.codigo=codigo;return e;};

  /* ---------- permisos ---------- */
  const CLAVE='inventarioInsumos';
  const ETIQUETA='INVENTARIO DE INSUMOS (ver stock, catálogo, conteos y conciliación; escribe la Asistente de Producción)';
  if(typeof PERMISOS_APP!=='undefined'&&Array.isArray(PERMISOS_APP)&&!PERMISOS_APP.some(p=>p.key===CLAVE))PERMISOS_APP.push({key:CLAVE,area:'produccion',label:ETIQUETA});
  const vistaActiva=()=>!!(window.glacialVista&&typeof window.glacialVista.activo==='function'&&window.glacialVista.activo());
  function puedeVer(u){
    if(!u)return false;
    const rol=String(u.rol||'').trim();
    if(rol==='mantenimiento_compartido')return false;
    if(rol==='Administrador'||u.permisos==='todos')return true;
    const arr=Array.isArray(u.permisos)?u.permisos:[];
    if(arr.includes('-'+CLAVE))return false;
    if(arr.includes(CLAVE))return true;
    if(vistaActiva())return false;
    return N.ROLES_VER_DEFECTO.includes(rol);
  }
  function puedeEscribir(u){
    if(!puedeVer(u)||vistaActiva())return false;
    const rol=String(u.rol||'').trim();
    if(N.ROLES_SOLO_CONSULTA.includes(rol))return false;
    if(rol==='Administrador'||u.permisos==='todos')return true;
    const arr=Array.isArray(u.permisos)?u.permisos:[];
    return arr.includes(CLAVE)||N.ROLES_ESCRIBIR_DEFECTO.includes(rol);
  }
  if(typeof tienePermiso==='function'){
    const anterior=tienePermiso;
    tienePermiso=function(permiso){
      if(permiso===CLAVE)return !!(typeof state!=='undefined'&&puedeVer(state.user));
      return anterior.apply(this,arguments);
    };
    window.tienePermiso=tienePermiso;
  }
  const yoVeo=()=>typeof state!=='undefined'&&puedeVer(state.user);
  const yoEscribo=()=>typeof state!=='undefined'&&puedeEscribir(state.user);

  /* ---------- contexto ---------- */
  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const serverTs=()=>firebase.firestore.FieldValue.serverTimestamp();
  const usuario=()=>{
    const u=(typeof firebase!=='undefined'&&firebase.auth&&firebase.auth().currentUser)||null;
    return {uid:(u&&u.uid)||'',nombre:(typeof state!=='undefined'&&state.user&&(state.user.nombre||state.user.username))||''};
  };
  const col=n=>db.collection(n);
  const limpio=o=>JSON.parse(JSON.stringify(o===undefined?null:o));
  /* Auditoría (solo crea): quién, cuándo, qué cambió (antes → después) y en qué artículo. Va en la MISMA transacción que el cambio. */
  function auditar(tx,tipo,itemId,nombre,antes,despues,extra){
    const u=usuario();
    tx.set(col('insumosAuditoria').doc(),Object.assign({tipo,itemId:String(itemId||''),articulo:String(nombre||''),antes:limpio(antes),despues:limpio(despues),
      uid:u.uid,usuario:u.nombre,en:serverTs(),enMs:ahora()},extra||{}));
  }
  function mensajeError(e){
    if(e&&e.codigo)return e.message;
    const code=String(e&&e.code||'').replace(/^firestore\//,'');
    if(code==='permission-denied')return 'Tu usuario no tiene permiso para esta operación (o falta publicar las reglas del Inventario de insumos).';
    if(code==='unavailable')return 'Sin conexión. Vuelve a intentarlo: la operación no se duplicará.';
    if(code==='aborted'||code==='failed-precondition')return 'Otra persona guardó al mismo tiempo. Vuelve a intentarlo.';
    return (e&&e.message)||String(e);
  }

  /* ---------- caché en vivo ---------- */
  const cache={catalogo:[],cortes:[],corte:null,corteId:'',conteos:[],conteo:null,conteoId:'',comentarios:[],listo:{},error:{}};
  const oyentes=[];let cierres=[];let cierreCorte=null;let cierreConteo=null;let cierreComentarios=null;
  const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(_){/* una vista no rompe a otra */}});
  const ordenCortes=l=>l.slice().sort((a,b)=>String(b.fechaCorte).localeCompare(String(a.fechaCorte))||num(b.importadoEn)-num(a.importadoEn));

  function escucharCorte(id){
    if(cierreCorte){try{cierreCorte();}catch(_){/* ya cerrada */}cierreCorte=null;}
    cache.corteId=id||'';cache.corte=null;cache.listo.corte=!id;cache.error.corte='';
    if(!id){avisar();return;}
    cierreCorte=col('insumosCortesDetalle').doc(id).onSnapshot(s=>{
      cache.corte=s.exists?s.data():null;cache.listo.corte=true;cache.error.corte='';avisar();
    },e=>{cache.error.corte=mensajeError(e);avisar();});
  }
  function escucharConteo(id){
    if(cierreConteo){try{cierreConteo();}catch(_){/* ya cerrada */}cierreConteo=null;}
    if(cierreComentarios){try{cierreComentarios();}catch(_){/* ya cerrada */}cierreComentarios=null;}
    cache.conteoId=id||'';cache.conteo=null;cache.comentarios=[];cache.listo.conteo=!id;cache.error.conteo='';
    if(!id){avisar();return;}
    cierreComentarios=col('insumosConteosComentarios').doc(id).onSnapshot(s=>{
      cache.comentarios=(s.exists&&Array.isArray(s.data().items))?s.data().items:[];avisar();
    },e=>{cache.error.conteo=mensajeError(e);avisar();});
    cierreConteo=col('insumosConteosDetalle').doc(id).onSnapshot(s=>{
      cache.conteo=s.exists?s.data():null;cache.listo.conteo=true;cache.error.conteo='';avisar();
    },e=>{cache.error.conteo=mensajeError(e);avisar();});
  }
  let activo=false;                 // una sola escucha, aunque onSnapshot responda de inmediato y la pantalla vuelva a pedirla
  function escuchar(){
    if(activo||typeof db==='undefined')return;
    activo=true;
    cache.listo.catalogo=false;cache.listo.cortes=false;cache.error.catalogo='';cache.error.cortes='';
    cierres.push(col('insumosCatalogo').doc('catalogo').onSnapshot(s=>{
      cache.catalogo=(s.exists&&Array.isArray(s.data().items))?s.data().items:[];cache.listo.catalogo=true;cache.error.catalogo='';avisar();
    },e=>{cache.error.catalogo=mensajeError(e);avisar();}));
    cierres.push(col('insumosCortesIndice').onSnapshot(s=>{
      cache.cortes=ordenCortes(s.docs.map(d=>d.data()));cache.listo.cortes=true;cache.error.cortes='';
      // Se muestra el corte más reciente (y se sigue al que llegue de otro dispositivo) mientras la persona no elija otro a mano.
      const ultimo=cache.cortes[0]?cache.cortes[0].id:'';
      const existe=cache.cortes.some(c=>c.id===cache.corteId);
      if(!existe||(!cache.manual&&ultimo!==cache.corteId))escucharCorte(ultimo);
      else avisar();
    },e=>{cache.error.cortes=mensajeError(e);avisar();}));
    cache.listo.conteos=false;cache.error.conteos='';
    cierres.push(col('insumosConteosIndice').onSnapshot(s=>{
      cache.conteos=s.docs.map(d=>d.data()).filter(c=>c.estado!=='ANULADO').sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))||num(b.creadoEn)-num(a.creadoEn));
      cache.listo.conteos=true;cache.error.conteos='';
      if(cache.conteoId&&!cache.conteos.some(c=>c.id===cache.conteoId))escucharConteo('');
      else avisar();
    },e=>{cache.error.conteos=mensajeError(e);avisar();}));
  }
  function detener(){
    activo=false;
    cierres.splice(0).forEach(c=>{try{c();}catch(_){/* ya cerrada */}});
    if(cierreCorte){try{cierreCorte();}catch(_){/* ya cerrada */}cierreCorte=null;}
    if(cierreConteo){try{cierreConteo();}catch(_){/* ya cerrada */}cierreConteo=null;}
    if(cierreComentarios){try{cierreComentarios();}catch(_){/* ya cerrada */}cierreComentarios=null;}
    cache.corteId='';cache.corte=null;cache.manual=false;cache.conteoId='';cache.conteo=null;
  }
  function elegirCorte(id,manual){cache.manual=!!manual&&id!==(cache.cortes[0]&&cache.cortes[0].id);if(id!==cache.corteId)escucharCorte(id);}
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(()=>{detener();cache.catalogo=[];cache.cortes=[];cache.conteos=[];cache.listo={};cache.error={};});

  /* ---------- catálogo: edición ---------- */
  /* cambios: subconjunto de N.CAMPOS_EDITABLES. Transacción: lee el catálogo actual, cambia SOLO ese artículo y audita antes → después. */
  async function guardarEdicion(id,cambios){
    if(!yoEscribo())throw falla('PERMISO','No tienes permiso para editar el catálogo de insumos.');
    const c={};
    N.CAMPOS_EDITABLES.forEach(k=>{if(k in cambios)c[k]=cambios[k];});
    const err=N.validarEdicion(c);if(err.length)throw falla('VALIDACION',err.join(' · '));
    ['stockMinimo','puntoReorden'].forEach(k=>{if(k in c)c[k]=N.red(c[k],2);});
    if('unidad' in c)c.unidad=String(c.unidad).trim();
    ['prioritario','activo'].forEach(k=>{if(k in c)c[k]=!!c[k];});
    const ref=col('insumosCatalogo').doc('catalogo');let resultado={cambiado:false};
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);
      const lista=(s.exists&&Array.isArray(s.data().items))?s.data().items.map(x=>({...x})):[];
      const x=lista.find(i=>i.id===id);
      if(!x)throw falla('VALIDACION','El artículo ya no existe en el catálogo.');
      const antes={},despues={};
      Object.keys(c).forEach(k=>{if(x[k]!==c[k]){antes[k]=x[k];despues[k]=c[k];x[k]=c[k];}});
      if(!Object.keys(despues).length){resultado={cambiado:false};return;}
      if(num(x.puntoReorden)>0&&num(x.stockMinimo)>num(x.puntoReorden))throw falla('VALIDACION','El punto de reorden no puede ser menor que el stock mínimo.');
      tx.set(ref,{items:lista,actualizadoPor:usuario().nombre,actualizadoEn:serverTs()});
      auditar(tx,'EDITAR_ARTICULO',id,x.nombre,antes,despues);
      resultado={cambiado:true,antes,despues};
    });
    return resultado;
  }

  /* Códigos internos (INS-0001…): asigna a los artículos que aún no tienen. En una transacción (si dos personas lo piden a la vez, la segunda
     ya encuentra los códigos puestos y no hace nada). Los artículos nuevos de una importación los reciben solos. */
  async function asignarCodigosFaltantes(){
    if(!yoEscribo())throw falla('PERMISO','No tienes permiso para asignar códigos.');
    const ref=col('insumosCatalogo').doc('catalogo');let r={asignados:0};
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);
      const lista=(s.exists&&Array.isArray(s.data().items))?s.data().items.map(x=>({...x})):[];
      const c=N.asignarCodigos(lista);
      if(!c.asignados)return;
      tx.set(ref,{items:lista,actualizadoPor:usuario().nombre,actualizadoEn:serverTs()});
      auditar(tx,'ASIGNAR_CODIGOS','catalogo','Catálogo de insumos',null,{asignados:c.asignados,desde:N.PREFIJO_CODIGO+String(c.desde).padStart(4,'0'),hasta:N.PREFIJO_CODIGO+String(c.hasta).padStart(4,'0')});
      r=c;
    });
    return r;
  }

  /* ---------- artículos sin uso ---------- */
  /* Lee los últimos cortes (hasta 6) y devuelve los artículos activos cuyo stock total no cambió en ninguno (ver N.detectarSinMovimiento). */
  async function detectarSinMovimiento(){
    if(!yoVeo())throw falla('PERMISO','No tienes permiso para ver el inventario.');
    const recientes=cache.cortes.slice(0,6);
    const detalles=await Promise.all(recientes.map(c=>col('insumosCortesDetalle').doc(c.id).get().then(s=>s.exists?s.data():null)));
    return N.detectarSinMovimiento(cache.catalogo,detalles.filter(Boolean),30);
  }
  /* Marca o desmarca «sin uso» a varios artículos en UNA transacción y UN evento de auditoría. */
  async function marcarSinUso(ids,valor){
    if(!yoEscribo())throw falla('PERMISO','No tienes permiso para editar el catálogo de insumos.');
    const set=new Set(ids||[]),v=!!valor;if(!set.size)return {cambiados:0};
    const ref=col('insumosCatalogo').doc('catalogo');let n=0;
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);
      const lista=(s.exists&&Array.isArray(s.data().items))?s.data().items.map(x=>({...x})):[];
      lista.forEach(x=>{if(set.has(x.id)&&!!x.sinUso!==v){x.sinUso=v;n++;}});
      if(!n)return;
      tx.set(ref,{items:lista,actualizadoPor:usuario().nombre,actualizadoEn:serverTs()});
      auditar(tx,'MARCAR_SIN_USO','catalogo','Catálogo de insumos',{sinUso:!v},{sinUso:v,articulos:n});
    });
    return {cambiados:n};
  }

  /* ---------- importación de un corte de stock ---------- */
  /* lectura: resultado de N.leerLibro (articulos, almacenes, resumen, formato, hoja). Todo en UNA transacción: catálogo + corte + índice + auditoría. */
  async function importarCorte(lectura,{fechaCorte,archivo}){
    if(!yoEscribo())throw falla('PERMISO','No tienes permiso para importar stock.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaCorte||'')))throw falla('VALIDACION','Indica la fecha del corte.');
    if(!lectura||!lectura.articulos||!lectura.articulos.length)throw falla('VALIDACION','No hay artículos para guardar.');
    const u=usuario(),t=ahora(),id=N.claveCorte(fechaCorte,t);
    const refCat=col('insumosCatalogo').doc('catalogo'),refIdx=col('insumosCortesIndice').doc(id),refDet=col('insumosCortesDetalle').doc(id);
    let resumen=null;
    await db.runTransaction(async tx=>{
      const sCat=await tx.get(refCat);
      const sIdx=await tx.get(refIdx);
      if(sIdx.exists)throw falla('DUPLICADO','Este corte ya se guardó.');
      const actual=(sCat.exists&&Array.isArray(sCat.data().items))?sCat.data().items:[];
      const comb=N.combinarCatalogo(actual,lectura.articulos);
      const filas=lectura.articulos.map(a=>N.filaCorte({...a,id:comb.resueltos.get(a.id)||a.id}));      // el id es el del catálogo (ItemCode si ya lo tiene)
      resumen={articulos:lectura.articulos.length,nuevos:comb.nuevos,actualizados:comb.actualizados,adoptados:comb.adoptados,codigosAsignados:comb.codigosAsignados,
        excluidos:(lectura.resumen.excluidosNombre||0)+(lectura.resumen.fueraDeGrupo||0),almacenes:lectura.almacenes.length};
      tx.set(refCat,{items:comb.lista,actualizadoPor:u.nombre,actualizadoEn:serverTs()});
      tx.set(refDet,{id,fechaCorte,almacenes:lectura.almacenes,items:filas,importadoPor:u.nombre,importadoUid:u.uid,importadoEn:t});
      tx.set(refIdx,{id,fechaCorte,archivo:String(archivo||'').slice(0,200),formato:lectura.formato,hoja:String(lectura.hoja||'').trim(),importadoPor:u.nombre,
        importadoUid:u.uid,importadoEn:t,...resumen});
      auditar(tx,'IMPORTAR_STOCK',id,String(archivo||''),null,{fechaCorte,formato:lectura.formato,...resumen});
    });
    return {id,resumen};
  }

  /* ---------- conteo físico (Fase 2) ----------
     insumosConteosIndice/{id}  → { id, fecha, almacen, observacion, estado, creadoPor/Uid/En, cerradoPor/En, reaperturas:[{por,en,motivo}], lineas, articulos }
     insumosConteosDetalle/{id} → { items:[ {id, itemId, ubicacion, cantidad, por, uid, en, editadoPor?, editadoEn?} ] }  (una fila por línea:
     dos personas contando a la vez no se pisan; cada operación es una transacción que revisa el estado del conteo). */
  const esAdmin=()=>typeof state!=='undefined'&&state.user&&(state.user.rol==='Administrador'||state.user.permisos==='todos');
  const refsConteo=id=>({idx:col('insumosConteosIndice').doc(id),det:col('insumosConteosDetalle').doc(id)});
  const resumenDe=(items)=>({lineas:items.length,articulos:new Set(items.map(l=>l.itemId)).size});

  async function crearConteo({fecha,almacen,observacion}){
    if(!yoEscribo())throw falla('PERMISO','No tienes permiso para crear conteos.');
    const c={fecha:String(fecha||''),almacen:almacen||'INSUMOS',observacion:String(observacion||'').trim()};
    const err=N.validarConteo(c);if(err.length)throw falla('VALIDACION',err.join(' · '));
    const u=usuario(),t=ahora(),id=N.claveConteo(c.fecha,t),r=refsConteo(id);
    const meta={id,...c,estado:'EN_PROCESO',creadoPor:u.nombre,creadoUid:u.uid,creadoEn:t,reaperturas:[],lineas:0,articulos:0};
    await db.runTransaction(async tx=>{
      const s=await tx.get(r.idx);if(s.exists)throw falla('DUPLICADO','Este conteo ya se creó.');
      tx.set(r.idx,meta);tx.set(r.det,{id,items:[]});
      auditar(tx,'CREAR_CONTEO',id,c.fecha+' · '+c.almacen,null,{fecha:c.fecha,almacen:c.almacen,observacion:c.observacion});
    });
    return meta;
  }
  /* Crea un conteo y le carga de una vez las líneas leídas del Excel (columna «CONTEO …»): UNA transacción, una línea por artículo con la
     ubicación «Importado del Excel». El conteo queda EN PROCESO: se puede revisar, ajustar líneas y cerrar como cualquier otro. */
  async function importarConteo({fecha,almacen,observacion,archivo,lineas}){
    if(!yoEscribo())throw falla('PERMISO','No tienes permiso para crear conteos.');
    const c={fecha:String(fecha||''),almacen:almacen||'TODOS',observacion:String(observacion||'').trim()};
    const err=N.validarConteo(c);if(err.length)throw falla('VALIDACION',err.join(' · '));
    if(!Array.isArray(lineas)||!lineas.length)throw falla('VALIDACION','El Excel no trae cantidades para importar.');
    const u=usuario(),t=ahora(),id=N.claveConteo(c.fecha,t),r=refsConteo(id);
    const items=lineas.map(l=>{
      const x={itemId:String(l.itemId||''),ubicacion:'Importado del Excel',cantidad:l.cantidad};
      const e=N.validarLinea(x);if(e.length)throw falla('VALIDACION',(l.nombre||x.itemId)+': '+e.join(' · '));
      return {id:N.claveLinea(t),itemId:x.itemId,ubicacion:x.ubicacion,cantidad:N.red(num(x.cantidad),4),por:u.nombre,uid:u.uid,en:t};
    });
    const meta={id,...c,estado:'EN_PROCESO',creadoPor:u.nombre,creadoUid:u.uid,creadoEn:t,reaperturas:[],...resumenDe(items)};
    await db.runTransaction(async tx=>{
      const s=await tx.get(r.idx);if(s.exists)throw falla('DUPLICADO','Este conteo ya se creó.');
      tx.set(r.idx,meta);tx.set(r.det,{id,items});
      auditar(tx,'CREAR_CONTEO',id,c.fecha+' · '+c.almacen,null,{fecha:c.fecha,almacen:c.almacen,observacion:c.observacion});
      auditar(tx,'IMPORTAR_CONTEO',id,String(archivo||'').slice(0,200),null,{fecha:c.fecha,almacen:c.almacen,lineas:items.length},{conteoId:id});
    });
    return meta;
  }
  /* Lee índice + detalle y exige conteo EN PROCESO; aplica cambio(items, meta) → devuelve lo que se audita. */
  async function sobreLineas(conteoId,cambio){
    if(!yoEscribo())throw falla('PERMISO','No tienes permiso para registrar conteos.');
    const r=refsConteo(conteoId);let salida=null;
    await db.runTransaction(async tx=>{
      const sI=await tx.get(r.idx);
      if(!sI.exists)throw falla('VALIDACION','El conteo ya no existe.');
      const meta=sI.data();
      if(meta.estado!=='EN_PROCESO')throw falla('CERRADO','El conteo está cerrado: solo un Administrador puede reabrirlo.');
      const sD=await tx.get(r.det);
      const items=(sD.exists&&Array.isArray(sD.data().items))?sD.data().items.map(x=>({...x})):[];
      salida=cambio(items,meta,tx);
      if(!salida)return;
      tx.set(r.det,{id:conteoId,items});
      tx.set(r.idx,{...meta,...resumenDe(items)});
    });
    return salida;
  }
  async function agregarLinea(conteoId,{itemId,ubicacion,cantidad}){
    const l={itemId:String(itemId||''),ubicacion:N.ubicacionLimpia(ubicacion),cantidad};
    const err=N.validarLinea(l);if(err.length)throw falla('VALIDACION',err.join(' · '));
    const u=usuario(),t=ahora();
    return sobreLineas(conteoId,(items,meta,tx)=>{
      const it=N.indiceCatalogo(cache.catalogo).get(l.itemId);
      const nueva={id:N.claveLinea(t),itemId:it?it.id:l.itemId,ubicacion:l.ubicacion,cantidad:N.red(num(l.cantidad),4),por:u.nombre,uid:u.uid,en:t};
      items.push(nueva);
      auditar(tx,'CREAR_LINEA',nueva.itemId,it?it.nombre:'',null,{conteo:conteoId,ubicacion:nueva.ubicacion,cantidad:nueva.cantidad},{conteoId});
      return nueva;
    });
  }
  /* Agrega muchas líneas de una vez (conteo importado desde Excel): una transacción, un evento de auditoría. lineas: [{itemId, ubicacion, cantidad}]. */
  async function agregarLineasLote(conteoId,lineas,archivo){
    const u=usuario(),t=ahora();
    const buenas=(lineas||[]).map(l=>({itemId:String(l.itemId||''),ubicacion:N.ubicacionLimpia(l.ubicacion),cantidad:l.cantidad}));
    if(!buenas.length)throw falla('VALIDACION','No hay líneas para guardar.');
    buenas.forEach(l=>{const e=N.validarLinea(l);if(e.length)throw falla('VALIDACION',e.join(' · '));});
    return sobreLineas(conteoId,(items,meta,tx)=>{
      const idx=N.indiceCatalogo(cache.catalogo);
      buenas.forEach((l,k)=>{const it=idx.get(l.itemId);
        items.push({id:N.claveLinea(t+k),itemId:it?it.id:l.itemId,ubicacion:l.ubicacion,cantidad:N.red(num(l.cantidad),4),por:u.nombre,uid:u.uid,en:t});});
      auditar(tx,'IMPORTAR_CONTEO',conteoId,String(archivo||'Excel'),null,{conteo:conteoId,lineas:buenas.length},{conteoId});
      return {lineas:buenas.length};
    });
  }
  async function editarLinea(conteoId,lineaId,{ubicacion,cantidad}){
    const l={itemId:'x',ubicacion:N.ubicacionLimpia(ubicacion),cantidad};
    const err=N.validarLinea(l);if(err.length)throw falla('VALIDACION',err.join(' · '));
    const u=usuario(),t=ahora();
    return sobreLineas(conteoId,(items,meta,tx)=>{
      const x=items.find(i=>i.id===lineaId);
      if(!x)throw falla('VALIDACION','La línea ya no existe (otra persona la eliminó).');
      const antes={ubicacion:x.ubicacion,cantidad:x.cantidad};
      x.ubicacion=l.ubicacion;x.cantidad=N.red(num(l.cantidad),4);x.editadoPor=u.nombre;x.editadoEn=t;
      if(antes.ubicacion===x.ubicacion&&antes.cantidad===x.cantidad)return null;
      const it=N.indiceCatalogo(cache.catalogo).get(x.itemId);
      auditar(tx,'EDITAR_LINEA',x.itemId,it?it.nombre:'',antes,{ubicacion:x.ubicacion,cantidad:x.cantidad},{conteoId});
      return x;
    });
  }
  async function borrarLinea(conteoId,lineaId){
    return sobreLineas(conteoId,(items,meta,tx)=>{
      const i=items.findIndex(x=>x.id===lineaId);
      if(i<0)return null;                                  // ya la había borrado otra persona: nada que hacer
      const [x]=items.splice(i,1);
      const it=N.indiceCatalogo(cache.catalogo).get(x.itemId);
      auditar(tx,'BORRAR_LINEA',x.itemId,it?it.nombre:'',{ubicacion:x.ubicacion,cantidad:x.cantidad,por:x.por},null,{conteoId});
      return x;
    });
  }
  /* Borra de una vez TODAS las líneas de una ubicación (p. ej. una importación repetida del Excel): UNA transacción y UN evento de auditoría. */
  async function borrarLineasUbicacion(conteoId,ubicacion){
    const ub=N.ubicacionLimpia(ubicacion);
    return sobreLineas(conteoId,(items,meta,tx)=>{
      const quitar=items.filter(x=>x.ubicacion===ub);
      if(!quitar.length)return null;
      const quedan=items.filter(x=>x.ubicacion!==ub);
      items.length=0;quedan.forEach(x=>items.push(x));
      auditar(tx,'BORRAR_UBICACION',conteoId,'Ubicación «'+ub+'»',{ubicacion:ub,lineas:quitar.length,articulos:new Set(quitar.map(x=>x.itemId)).size},null,{conteoId});
      return {borradas:quitar.length};
    });
  }
  async function cerrarConteo(conteoId){
    if(!yoEscribo())throw falla('PERMISO','No tienes permiso para cerrar conteos.');
    const r=refsConteo(conteoId),u=usuario(),t=ahora();let res=null;
    await db.runTransaction(async tx=>{
      const sI=await tx.get(r.idx);if(!sI.exists)throw falla('VALIDACION','El conteo ya no existe.');
      const meta=sI.data();if(meta.estado==='CERRADO')throw falla('CERRADO','El conteo ya estaba cerrado.');
      const sD=await tx.get(r.det);const items=(sD.exists&&Array.isArray(sD.data().items))?sD.data().items:[];
      res=resumenDe(items);
      tx.set(r.idx,{...meta,...res,estado:'CERRADO',cerradoPor:u.nombre,cerradoUid:u.uid,cerradoEn:t});
      auditar(tx,'CERRAR_CONTEO',conteoId,meta.fecha+' · '+meta.almacen,{estado:'EN_PROCESO'},{estado:'CERRADO',...res},{conteoId});
    });
    return res;
  }
  async function reabrirConteo(conteoId,motivo){
    if(!yoEscribo()||!esAdmin())throw falla('PERMISO','Solo un Administrador puede reabrir un conteo cerrado.');
    const m=String(motivo||'').trim();
    if(m.length<5)throw falla('VALIDACION','Escribe el motivo de la reapertura (mínimo 5 caracteres).');
    const r=refsConteo(conteoId),u=usuario(),t=ahora();
    await db.runTransaction(async tx=>{
      const sI=await tx.get(r.idx);if(!sI.exists)throw falla('VALIDACION','El conteo ya no existe.');
      const meta=sI.data();if(meta.estado!=='CERRADO')throw falla('VALIDACION','El conteo no está cerrado.');
      const reaperturas=(meta.reaperturas||[]).concat([{por:u.nombre,uid:u.uid,en:t,motivo:m.slice(0,300)}]);
      tx.set(r.idx,{...meta,estado:'EN_PROCESO',reaperturas});
      auditar(tx,'REABRIR_CONTEO',conteoId,meta.fecha+' · '+meta.almacen,{estado:'CERRADO'},{estado:'EN_PROCESO',motivo:m.slice(0,300)},{conteoId});
    });
    return true;
  }
  /* «Borrar» un conteo (solo Administrador): desaparece de las listas y de la conciliación, pero la base de datos no permite borrar documentos de conteo,
     así que queda marcado como ANULADO con quién, cuándo y por qué (y un evento en la auditoría). */
  async function borrarConteo(conteoId,motivo){
    if(!yoEscribo()||!esAdmin())throw falla('PERMISO','Solo un Administrador puede borrar un conteo.');
    const m=String(motivo||'').trim();
    if(m.length<5)throw falla('VALIDACION','Escribe el motivo (mínimo 5 caracteres).');
    const r=refsConteo(conteoId),u=usuario(),t=ahora();
    await db.runTransaction(async tx=>{
      const sI=await tx.get(r.idx);if(!sI.exists)throw falla('VALIDACION','El conteo ya no existe.');
      const meta=sI.data();if(meta.estado==='ANULADO')throw falla('VALIDACION','El conteo ya estaba borrado.');
      tx.set(r.idx,{...meta,estado:'ANULADO',estadoAnterior:meta.estado,anuladoPor:u.nombre,anuladoUid:u.uid,anuladoEn:t,anuladoMotivo:m.slice(0,300)});
      auditar(tx,'BORRAR_CONTEO',conteoId,meta.fecha+' · '+meta.almacen,{estado:meta.estado,lineas:meta.lineas||0,articulos:meta.articulos||0},{estado:'ANULADO',motivo:m.slice(0,300)},{conteoId});
    });
    return true;
  }
  async function guardarObservacion(conteoId,observacion){
    if(!yoEscribo())throw falla('PERMISO','No tienes permiso para editar conteos.');
    const o=String(observacion||'').trim();if(o.length>500)throw falla('VALIDACION','La observación admite hasta 500 caracteres.');
    const r=refsConteo(conteoId);
    await db.runTransaction(async tx=>{
      const sI=await tx.get(r.idx);if(!sI.exists)throw falla('VALIDACION','El conteo ya no existe.');
      const meta=sI.data();if(meta.estado!=='EN_PROCESO')throw falla('CERRADO','El conteo está cerrado.');
      if((meta.observacion||'')===o)return;
      tx.set(r.idx,{...meta,observacion:o});
      auditar(tx,'EDITAR_CONTEO',conteoId,meta.fecha+' · '+meta.almacen,{observacion:meta.observacion||''},{observacion:o},{conteoId});
    });
  }

  /* Comentario por artículo de la conciliación (insumosConteosComentarios/{conteoId} → { items:[{id: itemId, texto, por, uid, en}] }).
     Se puede escribir también con el conteo CERRADO (la conciliación se revisa después de cerrar). Texto vacío = quitar el comentario. */
  async function guardarComentario(conteoId,itemId,texto){
    if(!yoEscribo())throw falla('PERMISO','No tienes permiso para comentar la conciliación.');
    const t=String(texto==null?'':texto).trim();
    const err=N.validarComentario(t);if(err.length)throw falla('VALIDACION',err.join(' · '));
    const u=usuario(),ahoraMs=ahora(),r=refsConteo(conteoId),ref=col('insumosConteosComentarios').doc(conteoId);let cambio=false;
    await db.runTransaction(async tx=>{
      const sI=await tx.get(r.idx);if(!sI.exists)throw falla('VALIDACION','El conteo ya no existe.');
      const s=await tx.get(ref);
      const items=(s.exists&&Array.isArray(s.data().items))?s.data().items.map(x=>({...x})):[];
      const i=items.findIndex(x=>x.id===itemId),antes=i>=0?items[i].texto:'';
      if(antes===t)return;
      if(!t)items.splice(i,1);
      else if(i>=0)Object.assign(items[i],{texto:t,por:u.nombre,uid:u.uid,en:ahoraMs});
      else items.push({id:itemId,texto:t,por:u.nombre,uid:u.uid,en:ahoraMs});
      tx.set(ref,{id:conteoId,items});
      const it=N.indiceCatalogo(cache.catalogo).get(itemId);
      auditar(tx,'COMENTARIO_CONCILIACION',itemId,it?it.nombre:'',{texto:antes},{texto:t},{conteoId});cambio=true;
    });
    return cambio;
  }

  /* Auditoría (solo lectura): una consulta puntual por rango de fechas (enMs), más recientes primero. No se escucha en vivo: crece sin parar. */
  async function consultarAuditoria({desdeMs,hastaMs,limite}){
    if(!yoVeo())throw falla('PERMISO','No tienes permiso para ver la auditoría del inventario.');
    let q=col('insumosAuditoria');
    if(desdeMs)q=q.where('enMs','>=',Number(desdeMs));
    if(hastaMs)q=q.where('enMs','<=',Number(hastaMs));
    const max=Math.min(2000,Number(limite)||1000);
    const s=await q.orderBy('enMs','desc').limit(max).get();
    const eventos=s.docs.map(d=>({...d.data(),docId:d.id}));
    return {eventos:N.ordenAuditoria?N.ordenAuditoria(eventos):eventos,truncado:eventos.length>=max};
  }

  /* Vista previa SIN guardar: cuántos artículos son nuevos respecto al catálogo actual. */
  function vistaPrevia(lectura){
    const comb=N.combinarCatalogo(cache.catalogo,lectura.articulos);
    return {nuevos:comb.nuevos,existentes:comb.actualizados+comb.sinCambio+comb.adoptados,adoptados:comb.adoptados};
  }

  window.glacialInventarioDatos={CLAVE,cache,puedeVer:yoVeo,puedeEscribir:yoEscribo,escuchar,detener,elegirCorte,guardarEdicion,asignarCodigosFaltantes,importarCorte,vistaPrevia,mensajeError,
    escucharConteo,crearConteo,importarConteo,agregarLinea,agregarLineasLote,borrarLineasUbicacion,detectarSinMovimiento,marcarSinUso,editarLinea,borrarLinea,cerrarConteo,reabrirConteo,borrarConteo,guardarObservacion,guardarComentario,consultarAuditoria,esAdmin,
    _ayudas:{auditar,usuario,ahora,col,serverTs,falla},      // para el módulo de evidencias (85-evidencias-insumos-datos.js)
    alCambiar:f=>{oyentes.push(f);return ()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};},_puedeVer:puedeVer,_puedeEscribir:puedeEscribir};
})();
