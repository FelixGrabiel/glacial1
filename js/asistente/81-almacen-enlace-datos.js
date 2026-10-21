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
  const cache={catalogo:[],cortes:[],corte:null,corteId:'',movs:[],listo:{},error:{}};
  const oyentes=[];let cierres=[];let cierreCorte=null;let cierreMovs=null;let activo=false;
  const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(_){/* una vista no rompe a otra */}});
  const msg=e=>{const c=String(e&&e.code||'').replace(/^firestore\//,'');return c==='permission-denied'?'Sin permiso para leer el stock del Inventario.':((e&&e.message)||String(e));};
  const ordenar=l=>l.slice().sort((a,b)=>String(b.fechaCorte).localeCompare(String(a.fechaCorte))||(Number(b.importadoEn)||0)-(Number(a.importadoEn)||0));

  function escucharMovs(fechaCorte){
    if(cierreMovs){try{cierreMovs();}catch(_){/* ya cerrada */}cierreMovs=null;}
    if(!fechaCorte){cache.movs=[];cache.listo.movs=true;avisar();return;}
    cache.listo.movs=false;
    cierreMovs=db.collection('apAlmacenMov').where('fecha','>=',fechaCorte).onSnapshot(s=>{
      cache.movs=s.docs.map(d=>d.data());cache.listo.movs=true;cache.error.movs='';avisar();
    },e=>{cache.error.movs=msg(e);avisar();});
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
    activo=false;cache.catalogo=[];cache.cortes=[];cache.corte=null;cache.corteId='';cache.movs=[];cache.listo={};cache.error={};
  }
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(detener);

  const insumos=()=>(window.glacialAsistenteDatos&&window.glacialAsistenteDatos.cache.insumos)||[];
  const corteMeta=()=>cache.cortes.find(c=>c.id===cache.corteId)||null;
  const hayLectura=()=>!cache.error.catalogo&&!cache.error.cortes&&!cache.error.corte&&!cache.error.movs;

  /* Stock de Almacén de un insumo (por su código del Asistente). Si no se puede leer el Inventario → estado SIN_CORTE. */
  function stockDe(codigo){
    const ins=insumos().find(i=>i.codigo===codigo);
    if(!hayLectura())return {estado:'SIN_CORTE',base:0,entregado:0,disponible:0,fechaCorte:'',articulo:null};
    return E.stockAlmacen({insumo:ins,catalogo:cache.catalogo,corte:cache.corte,corteMeta:corteMeta(),movs:cache.movs});
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

  /* Catálogo para elegir el código SAP de un insumo: [{itemCode,nombre,categoria}] */
  function articulos(){return cache.catalogo.filter(c=>c&&c.itemCode&&c.activo!==false).map(c=>({itemCode:c.itemCode,nombre:c.nombre,categoria:c.categoria||''}));}
  /* Sugerencia de artículo por nombre (palabras en común), para el selector del insumo. */
  function sugerir(nombre){
    const toks=String(nombre||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').split(/[^a-z0-9]+/).filter(t=>t.length>2);
    if(!toks.length)return [];
    return articulos().map(a=>{const n=a.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');return {a,p:toks.filter(t=>n.includes(t)).length};})
      .filter(x=>x.p>0).sort((x,y)=>y.p-x.p).slice(0,8).map(x=>x.a);
  }

  window.glacialAlmacenEnlaceDatos={cache,escuchar,detener,stockDe,stockPorInsumo,revisarEntrega,movimientosEntrega,articulos,sugerir,hayLectura,
    alCambiar:f=>{oyentes.push(f);return ()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};}};
})();
