/* =============================================================
   GLACIAL · INVENTARIO DE INSUMOS — DATOS (capa documento: db.collection / onSnapshot / runTransaction), PERMISOS Y AUDITORÍA
   -------------------------------------------------------------
   Mismo mecanismo que el Asistente de Producción (71-asistente-datos.js) y que Paletas: el puente a Supabase traduce estas llamadas a
   fs_docs / fs_items; no se usa la API de tablas de Supabase ni se crean tablas nuevas. Colecciones (docs/INVENTARIO-INSUMOS.md):
     · insumosCatalogo/catalogo      → { items:[ {id, itemCode, nombre, grupo, categoria, subtipo, marca, presentacion, unidad,
                                          stockMinimo, puntoReorden, activo, prioritario, precio, alias?} ] }   (un ítem por artículo)
     · insumosCortesIndice/{corteId} → metadatos livianos de cada corte (fecha, quién, archivo, resumen): se escucha completo.
     · insumosCortesDetalle/{corteId}→ { items:[ {id, w:[6 almacenes AP], t} ] }: el stock del corte. Solo se escucha el corte elegido.
     · insumosAuditoria/{auto}       → quién, cuándo, qué cambió (antes → después) y en qué artículo (solo se crea).
   Cada lista tiene elementos con «id» (el puente guarda una fila por elemento y solo viaja lo que cambió: dos personas no se pisan).
   Permisos: clave 'inventarioInsumos' (Gestión de usuarios). Por defecto la ven la Asistente de Producción, el Administrador y el Jefe de
   Operaciones; escribe la Asistente y el Administrador (el Jefe de Operaciones y los demás roles de consulta solo ven).
   Las reglas de Supabase para estas colecciones están en supabase/migraciones/glacial_24_inventario_insumos.sql (SIN aplicar).
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
  const cache={catalogo:[],cortes:[],corte:null,corteId:'',listo:{},error:{}};
  const oyentes=[];let cierres=[];let cierreCorte=null;
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
  }
  function detener(){
    activo=false;
    cierres.splice(0).forEach(c=>{try{c();}catch(_){/* ya cerrada */}});
    if(cierreCorte){try{cierreCorte();}catch(_){/* ya cerrada */}cierreCorte=null;}
    cache.corteId='';cache.corte=null;cache.manual=false;
  }
  function elegirCorte(id,manual){cache.manual=!!manual&&id!==(cache.cortes[0]&&cache.cortes[0].id);if(id!==cache.corteId)escucharCorte(id);}
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(()=>{detener();cache.catalogo=[];cache.cortes=[];cache.listo={};cache.error={};});

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
      resumen={articulos:lectura.articulos.length,nuevos:comb.nuevos,actualizados:comb.actualizados,adoptados:comb.adoptados,
        excluidos:(lectura.resumen.excluidosNombre||0)+(lectura.resumen.fueraDeGrupo||0),almacenes:lectura.almacenes.length};
      tx.set(refCat,{items:comb.lista,actualizadoPor:u.nombre,actualizadoEn:serverTs()});
      tx.set(refDet,{id,fechaCorte,almacenes:lectura.almacenes,items:filas,importadoPor:u.nombre,importadoUid:u.uid,importadoEn:t});
      tx.set(refIdx,{id,fechaCorte,archivo:String(archivo||'').slice(0,200),formato:lectura.formato,hoja:String(lectura.hoja||'').trim(),importadoPor:u.nombre,
        importadoUid:u.uid,importadoEn:t,...resumen});
      auditar(tx,'IMPORTAR_STOCK',id,String(archivo||''),null,{fechaCorte,formato:lectura.formato,...resumen});
    });
    return {id,resumen};
  }

  /* Vista previa SIN guardar: cuántos artículos son nuevos respecto al catálogo actual. */
  function vistaPrevia(lectura){
    const comb=N.combinarCatalogo(cache.catalogo,lectura.articulos);
    return {nuevos:comb.nuevos,existentes:comb.actualizados+comb.sinCambio+comb.adoptados,adoptados:comb.adoptados};
  }

  window.glacialInventarioDatos={CLAVE,cache,puedeVer:yoVeo,puedeEscribir:yoEscribo,escuchar,detener,elegirCorte,guardarEdicion,importarCorte,vistaPrevia,mensajeError,
    alCambiar:f=>{oyentes.push(f);return ()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};},_puedeVer:puedeVer,_puedeEscribir:puedeEscribir};
})();
