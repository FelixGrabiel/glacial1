/* =============================================================
   GLACIAL · ASISTENTE ↔ INVENTARIO DE INSUMOS — ENLACE CON ALMACÉN: DATOS
   -------------------------------------------------------------
   Escucha (solo lectura) el catálogo y el último corte del Inventario (insumosCatalogo, insumosCortesIndice, insumosCortesDetalle) y el
   libro de entregas de Almacén (apAlmacenMov, desde la fecha del corte). Con eso entrega el stock de Almacén de cada insumo
   (80-almacen-enlace-nucleo.js). Las ENTREGAS se escriben dentro de la transacción de la solicitud (71-asistente-datos.js
   → cambiarEstadoSolicitud), nunca desde aquí. Sin permiso de lectura o sin corte, el Asistente sigue como antes (sin descuento).
   ============================================================= */
(function instalarAlmacenEnlaceDatos(){
  'use strict';
  const E=window.glacialAlmacenEnlace;
  const cache={catalogo:[],cortes:[],corte:null,corteId:'',movs:[],devs:[],listo:{},error:{}};
  const oyentes=[],oyentesEvento=[];let cierres=[];let cierreCorte=null;let cierreMovs=null;let cierreDevs=null;let activo=false;let vistos=null;
  const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(_){/* una vista no rompe a otra */}});
  const msg=e=>{const c=String(e&&e.code||'').replace(/^firestore\//,'');return c==='permission-denied'?'Sin permiso para leer el stock del Inventario.':((e&&e.message)||String(e));};
  const ordenar=l=>l.slice().sort((a,b)=>String(b.fechaCorte).localeCompare(String(a.fechaCorte))||(Number(b.importadoEn)||0)-(Number(a.importadoEn)||0));

  /* Avisos de lo que llega en tiempo real (no del primer relleno): entrega de Almacén o devolución de Producción. */
  function detectarEventos(){
    const ids=new Set(cache.movs.map(m=>'A:'+m.opId).concat(cache.devs.filter(m=>m.tipo==='DEVOLUCION').map(m=>'D:'+m.opId)));
    if(vistos===null){if(cache.listo.movs&&cache.listo.devs)vistos=ids;return;}
    const nuevos=[];
    cache.movs.forEach(m=>{if(!vistos.has('A:'+m.opId))nuevos.push({tipo:m.tipo==='ANULACION'?'ANULACION_ENTREGA':'ENTREGA',mov:m});});
    cache.devs.filter(m=>m.tipo==='DEVOLUCION').forEach(m=>{if(!vistos.has('D:'+m.opId))nuevos.push({tipo:'DEVOLUCION',mov:m});});
    vistos=ids;
    if(nuevos.length)oyentesEvento.slice().forEach(f=>{try{f(nuevos);}catch(_){/* un aviso no rompe a otro */}});
  }
  const cambio=()=>{detectarEventos();avisar();};
  function escucharMovs(fechaCorte){
    if(cierreMovs){try{cierreMovs();}catch(_){/* ya cerrada */}cierreMovs=null;}
    if(cierreDevs){try{cierreDevs();}catch(_){/* ya cerrada */}cierreDevs=null;}
    vistos=null;
    if(!fechaCorte){cache.movs=[];cache.devs=[];cache.listo.movs=true;cache.listo.devs=true;avisar();return;}
    cache.listo.movs=false;cache.listo.devs=false;
    cierreMovs=db.collection('apAlmacenMov').where('fecha','>=',fechaCorte).onSnapshot(s=>{
      cache.movs=s.docs.map(d=>d.data());cache.listo.movs=true;cache.error.movs='';cambio();
    },e=>{cache.error.movs=msg(e);avisar();});
    // Devoluciones (y sus anulaciones) del libro de Producción: suben el stock de Almacén en el mismo instante en que se registran.
    cierreDevs=db.collection('apMovimientos').where('fecha','>=',fechaCorte).onSnapshot(s=>{
      cache.devs=s.docs.map(d=>d.data()).filter(m=>m&&(m.tipo==='DEVOLUCION'||m.tipo==='ANULACION'));cache.listo.devs=true;cache.error.devs='';cambio();
    },e=>{cache.error.devs=msg(e);avisar();});
  }
  function escucharCorte(id){
    if(cierreCorte){try{cierreCorte();}catch(_){/* ya cerrada */}cierreCorte=null;}
    cache.corteId=id||'';cache.corte=null;cache.listo.corte=!id;
    if(!id){avisar();return;}
    cierreCorte=db.collection('insumosCortesDetalle').doc(id).onSnapshot(s=>{
      cache.corte=s.exists?s.data():null;cache.listo.corte=true;cache.error.corte='';avisar();
    },e=>{cache.error.corte=msg(e);avisar();});
  }
  function escuchar(){
    if(activo||typeof db==='undefined')return;
    const rol=typeof state!=='undefined'&&state.user?String(state.user.rol||''):'';
    if(rol==='mantenimiento_compartido')return;
    activo=true;
    if(window.glacialAsistenteDatos&&window.glacialAsistenteDatos.escucharCatalogo)window.glacialAsistenteDatos.escucharCatalogo();   // insumos del Asistente (código SAP)
    cierres.push(db.collection('insumosCatalogo').doc('catalogo').onSnapshot(s=>{
      cache.catalogo=(s.exists&&Array.isArray(s.data().items))?s.data().items:[];cache.listo.catalogo=true;cache.error.catalogo='';avisar();
    },e=>{cache.error.catalogo=msg(e);avisar();}));
    cierres.push(db.collection('insumosCortesIndice').onSnapshot(s=>{
      cache.cortes=ordenar(s.docs.map(d=>d.data()));cache.listo.cortes=true;cache.error.cortes='';
      const ult=cache.cortes[0];
      if((ult?ult.id:'')!==cache.corteId){escucharCorte(ult?ult.id:'');escucharMovs(ult?ult.fechaCorte:'');}
      else avisar();
    },e=>{cache.error.cortes=msg(e);avisar();}));
  }
  function detener(){
    cierres.splice(0).forEach(c=>{try{c();}catch(_){/* ya cerrada */}});
    if(cierreCorte){try{cierreCorte();}catch(_){/* ya cerrada */}cierreCorte=null;}
    if(cierreMovs){try{cierreMovs();}catch(_){/* ya cerrada */}cierreMovs=null;}
    if(cierreDevs){try{cierreDevs();}catch(_){/* ya cerrada */}cierreDevs=null;}
    activo=false;vistos=null;cache.catalogo=[];cache.cortes=[];cache.corte=null;cache.corteId='';cache.movs=[];cache.devs=[];cache.listo={};cache.error={};
  }
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(detener);

  const insumos=()=>(window.glacialAsistenteDatos&&window.glacialAsistenteDatos.cache.insumos)||[];
  const corteMeta=()=>cache.cortes.find(c=>c.id===cache.corteId)||null;
  const hayLectura=()=>!cache.error.catalogo&&!cache.error.cortes&&!cache.error.corte&&!cache.error.movs&&!cache.error.devs;

  /* Stock de Almacén de un insumo (por su código del Asistente). Si no se puede leer el Inventario → estado SIN_CORTE. */
  function stockDe(codigo){
    const ins=insumos().find(i=>i.codigo===codigo);
    if(!hayLectura())return {estado:'SIN_CORTE',base:0,entregado:0,disponible:0,fechaCorte:'',articulo:null};
    return E.stockAlmacen({insumo:ins,catalogo:cache.catalogo,corte:cache.corte,corteMeta:corteMeta(),movs:cache.movs,devs:cache.devs});
  }
  /* {codigo: stock} de todos los insumos activos (o de la lista dada). */
  function stockPorInsumo(codigos){
    const r={};(codigos||insumos().map(i=>i.codigo)).forEach(c=>{r[c]=stockDe(c);});return r;
  }
  /* Antes de guardar una entrega: revisa el stock. → {errores, sinStock, movimientos(builder)} */
  function revisarEntrega(sol,entregas,opc){
    const st=stockPorInsumo(Object.keys(entregas||{}));
    const v=E.validarEntregaContraStock(entregas,st,opc);
    return {errores:v.errores,sinStock:v.sinStock,stock:st};
  }
  function movimientosEntrega(sol,entregas,nEntrega,ctx){return E.movimientosEntrega(sol,entregas,nEntrega,insumos(),ctx);}

  /* Movimiento neto por artículo desde el último corte (para el «Almacén hoy» del Inventario). {} si no se puede leer. */
  function ajustes(){
    const m=corteMeta();if(!m||!hayLectura())return {};
    return E.ajustes({insumos:insumos(),movs:cache.movs,devs:cache.devs,fechaCorte:m.fechaCorte});
  }
  /* Entregas y devoluciones desde el corte, más recientes primero (para el panel de Almacén). */
  function movimientosRecientes(fecha){
    const a=cache.movs.filter(m=>!fecha||m.fecha===fecha).map(m=>({...m,origen:'ENTREGA'}));
    const d=cache.devs.filter(m=>m.tipo==='DEVOLUCION'&&(!fecha||m.fecha===fecha)).map(m=>({...m,origen:'DEVOLUCION'}));
    return a.concat(d).sort((x,y)=>(Number(y.en)||0)-(Number(x.en)||0));
  }
  /* Catálogo para elegir el código SAP de un insumo: [{itemCode,nombre,categoria}] */
  function articulos(){return cache.catalogo.filter(c=>c&&c.itemCode&&c.activo!==false).map(c=>({itemCode:c.itemCode,nombre:c.nombre,categoria:c.categoria||''}));}
  /* Sugerencia de artículo por nombre (palabras en común), para el selector del insumo. */
  function sugerir(nombre){
    const toks=String(nombre||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').split(/[^a-z0-9]+/).filter(t=>t.length>2);
    if(!toks.length)return [];
    return articulos().map(a=>{const n=a.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');return {a,p:toks.filter(t=>n.includes(t)).length};})
      .filter(x=>x.p>0).sort((x,y)=>y.p-x.p).slice(0,8).map(x=>x.a);
  }

  window.glacialAlmacenEnlaceDatos={cache,escuchar,detener,stockDe,stockPorInsumo,revisarEntrega,movimientosEntrega,articulos,sugerir,hayLectura,ajustes,movimientosRecientes,
    alEvento:f=>{oyentesEvento.push(f);return ()=>{const i=oyentesEvento.indexOf(f);if(i>=0)oyentesEvento.splice(i,1);};},
    alCambiar:f=>{oyentes.push(f);return ()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};}};
})();
