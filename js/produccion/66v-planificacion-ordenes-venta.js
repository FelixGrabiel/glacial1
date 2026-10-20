/* =============================================================
   PLANIFICACIÓN · ÓRDENES DE VENTAS — PESTAÑA
   -------------------------------------------------------------
   Los pedidos de Ventas (cliente, producto, cantidad, fecha de entrega) comparados con lo PROGRAMADO y lo PRODUCIDO.
   El cálculo está en 66u-planificacion-ordenes-venta-nucleo.js; aquí se guardan y se dibujan.

   DÓNDE SE GUARDAN (sin colecciones ni reglas nuevas): sync/catalogoPlanificacion → campo «ordenesVenta» (lista) y «ordenesVentaConfig»
   (mapa de columnas de la fuente). Es el mismo documento del catálogo, con su mismo permiso «planificacion»; cada escritura es una transacción
   que conserva el resto del documento (catálogo, tiempos, horarios).

   FUENTES: manual, Excel/CSV y — preparada, sin conectar — Google Sheets. Todas pasan por NS.ventas.aplicarFuente(filas, opc), que usa la misma
   lógica de importación del núcleo: crea las nuevas, actualiza por N.º (sin duplicar) y, si se pide, marca «retirada» la que la fuente ya no trae.
   Para conectar la hoja basta implementar NS.ventas.fuentes.sheets.obtenerFilas() (devuelve [{encabezado: valor}]) y activar «disponible».
   ============================================================= */
(function(){
  'use strict';
  const NS=window.glacialPlanificacion,N=window.glacialOrdenesVentaNucleo;
  if(!NS||!N)return;
  const {num,esc,ahoraMs}=NS.util;
  const fmt=n=>num(n).toLocaleString('es-PE');
  const REF=()=>db.collection('sync').doc('catalogoPlanificacion');
  const quien=()=>(state.user&&(state.user.nombre||state.user.username))||'';

  /* ---------- datos (escucha en vivo del documento del catálogo) ---------- */
  let ordenes=[],config={},listo=false;
  NS.escuchas.push(function(){
    if(typeof db==='undefined')return null;
    return REF().onSnapshot(snap=>{
      const d=snap.exists?snap.data():{};
      ordenes=Array.isArray(d.ordenesVenta)?d.ordenesVenta:[];
      config=d.ordenesVentaConfig&&typeof d.ordenesVentaConfig==='object'?d.ordenesVentaConfig:{};
      listo=true;NS.refrescar();
    },err=>console.warn('Órdenes de ventas:',err&&err.message||err));
  });

  /* Una transacción que lee la lista fresca, la cambia con fn(lista) y la guarda sin tocar el resto del documento. */
  async function mutar(fn,cfg){
    if(!NS.puede())throw new Error('Solo Planificación puede cambiar las órdenes de ventas.');
    let resultado=null,guardado=null;
    await db.runTransaction(async tx=>{
      const snap=await tx.get(REF());
      const d=snap.exists?snap.data():{};
      const actuales=Array.isArray(d.ordenesVenta)?d.ordenesVenta.map(o=>Object.assign({},o)):[];
      const r=fn(actuales);
      resultado=r&&r.resultado;
      const nuevo=Object.assign({},d,{ordenesVenta:(r&&r.lista)||actuales,updatedAt:Date.now()});
      if(cfg)nuevo.ordenesVentaConfig=Object.assign({},d.ordenesVentaConfig||{},cfg);
      tx.set(REF(),nuevo);
      guardado=nuevo;
    });
    /* La pantalla no espera al aviso del servidor: con lo recién guardado ya se ve (equivalencias, fecha de corte, órdenes importadas). */
    if(guardado){
      ordenes=Array.isArray(guardado.ordenesVenta)?guardado.ordenesVenta:ordenes;
      config=guardado.ordenesVentaConfig&&typeof guardado.ordenesVentaConfig==='object'?guardado.ordenesVentaConfig:config;
      listo=true;
      try{NS.refrescar();}catch(_){/* la pantalla se repinta con el próximo aviso */}
    }
    return resultado;
  }

  async function guardarOrden(o){
    const ahora=ahoraMs();
    await mutar(lista=>{
      const errores=N.validarOrden(o,{existentes:lista});
      if(errores.length)throw new Error(errores.join(' '));
      const i=o.id?lista.findIndex(x=>x.id===o.id):-1;
      const base={numero:String(o.numero).trim(),cliente:String(o.cliente).trim(),marca:o.marca,presentacion:o.presentacion,linea:o.linea||'',cantidad:num(o.cantidad),
        fechaEntrega:o.fechaEntrega,fechaPedido:o.fechaPedido||'',observaciones:String(o.observaciones||'').trim(),despachado:Math.max(0,num(o.despachado)),cadena:String(o.cadena||'').trim()};
      if(i>-1){
        if(num(o.version)&&num(lista[i].version)&&num(o.version)!==num(lista[i].version))throw new Error('Otra persona cambió esta orden mientras la editabas. Ciérrala y vuelve a abrirla.');
        lista[i]=Object.assign({},lista[i],base,{actualizadoPor:quien(),actualizadoEn:ahora,version:(num(lista[i].version)||1)+1});
      }else lista.push(Object.assign({id:'ov_'+ahora.toString(36)+Math.random().toString(36).slice(2,6),estado:'ABIERTA',origen:'manual',idExterno:'',creadoPor:quien(),creadoEn:ahora,actualizadoPor:quien(),actualizadoEn:ahora,version:1},base));
      return {lista};
    });
  }
  async function cambiarEstado(id,estado){
    const ahora=ahoraMs();
    await mutar(lista=>{
      const o=lista.find(x=>x.id===id);
      if(!o)throw new Error('La orden ya no existe.');
      Object.assign(o,{estado,actualizadoPor:quien(),actualizadoEn:ahora,version:(num(o.version)||1)+1});
      return {lista};
    });
  }

  /* Fuente → órdenes (Excel, CSV y, cuando se conecte, Google Sheets). preview=true solo calcula contra lo que hay hoy. */
  const marcasConocidas=()=>[...new Set(lineasDe().flatMap(l=>NS.marcas(l.key)))];
  const baseImportar=()=>({mapa:config.mapeo,equivalencias:config.equivalencias||{},fechaCorte:config.fechaCorte||'',marcas:marcasConocidas(),usuario:quien(),hoy:NS.hoyOperativo()});
  /* fuente: o bien {filas} (una tabla) o bien {hojas:[{nombre,filas}]} (varias pestañas, una por cadena) */
  function correr(fuente,lista,opc){return fuente.hojas?N.importarHojas(fuente.hojas,lista,opc):N.importarFilas(fuente.filas,lista,opc);}
  function previsualizar(fuente,opc){return correr(Array.isArray(fuente)?{filas:fuente}:fuente,ordenes,Object.assign(baseImportar(),{ahora:ahoraMs()},opc));}
  /* Importación por LOTES: una importación grande (miles de líneas) no se manda en un solo guardado —el servidor lo rechaza o tarda más de lo que aguanta—;
     se calcula UNA vez y se guarda en transacciones de LOTE líneas, con avance y con tiempo máximo por lote. Un lote repetido no duplica (se omite lo que ya existe). */
  const LOTE=300,TIEMPO_LOTE_MS=90000;
  const conTiempo=(p,ms,msg)=>new Promise((ok,mal)=>{const t=setTimeout(()=>mal(new Error(msg)),ms);p.then(v=>{clearTimeout(t);ok(v);},e=>{clearTimeout(t);mal(e);});});
  async function aplicarFuente(fuente,opc){
    opc=opc||{};
    const ahora=ahoraMs(),f=Array.isArray(fuente)?{filas:fuente}:fuente;
    const r=correr(f,ordenes,Object.assign(baseImportar(),{ahora},opc));
    if(r.faltanColumnas.length)throw new Error('Faltan columnas: '+r.faltanColumnas.join(', ')+'.');
    const trozos=[];
    for(let i=0;i<r.crear.length;i+=LOTE)trozos.push({crear:r.crear.slice(i,i+LOTE),actualizar:[],retirar:[]});
    for(let i=0;i<r.actualizar.length;i+=LOTE)trozos.push({crear:[],actualizar:r.actualizar.slice(i,i+LOTE),retirar:[]});
    for(let i=0;i<r.retirar.length;i+=LOTE)trozos.push({crear:[],actualizar:[],retirar:r.retirar.slice(i,i+LOTE)});
    const total=r.crear.length+r.actualizar.length+r.retirar.length;let hechas=0;
    if(typeof opc.progreso==='function')opc.progreso(0,total);
    for(let n=0;n<trozos.length;n++){
      const t=trozos[n],ts=ahoraMs()+n;
      await conTiempo(mutar(lista=>{
        const existentes=new Set(lista.map(N.claveOrden));
        const crear=t.crear.filter(o=>!existentes.has(N.claveOrden(o)));
        return {lista:N.aplicarImportacion(lista,{crear,actualizar:t.actualizar,retirar:t.retirar},{ahora:ts,usuario:quien()})};
      }),TIEMPO_LOTE_MS,'El servidor no respondió al guardar el lote '+(n+1)+' de '+trozos.length+' (ya se guardaron '+hechas.toLocaleString('es-PE')+' líneas). Vuelve a importar: continúa donde quedó, sin duplicar.');
      hechas+=t.crear.length+t.actualizar.length+t.retirar.length;
      if(typeof opc.progreso==='function')opc.progreso(hechas,total);
    }
    return r;
  }
  async function guardarMapeo(mapeo){
    await mutar(lista=>({lista}),{mapeo,actualizadoPor:quien(),actualizadoEn:ahoraMs()});
  }
  /* Fecha de corte y tabla de equivalencias («texto de la hoja» → marca + presentación + línea). */
  async function guardarConfig(parcial){
    await mutar(lista=>({lista}),Object.assign({},parcial,{actualizadoPor:quien(),actualizadoEn:ahoraMs()}));
  }

  /* ---------- Google Sheets: preparado, sin conectar ---------- */
  const fuentes={sheets:{etiqueta:'Google Sheets',disponible:false,
    sincronizar:async function(){
      if(!this.disponible||typeof this.obtenerFilas!=='function')throw new Error('Todavía no está conectado a Google Sheets.');
      const filas=await this.obtenerFilas();
      return aplicarFuente(filas,{origen:'sheets',retirarAusentes:true});
    }}};
  NS.ventas={ordenes:()=>ordenes.slice(),config:()=>Object.assign({},config),listo:()=>listo,guardarOrden,cambiarEstado,previsualizar,aplicarFuente,guardarMapeo,guardarConfig,fuentes,
    cobertura:()=>cobertura(),COLUMNAS:N.COLUMNAS,leerCSV:t=>leerCSV(t),
    __poner:(lista,cfg)=>{ordenes=lista||[];config=cfg||{};listo=true;}};   // para pruebas en el navegador

  /* ---------- cobertura con los datos reales ---------- */
  function producidoDe(p){
    try{if(typeof window.glacialProducidoVigente==='function'){const v=window.glacialProducidoVigente(p);return v==null?0:num(v);}}catch(_){/* sin producción */}
    return 0;
  }
  /* Días de atraso a partir de los cuales una orden sin atender es histórica (configurable; 30 por defecto). */
  const diasMax=()=>Number.isFinite(Number(config.diasMaxAtraso))&&config.diasMaxAtraso!==''&&config.diasMaxAtraso!==null?Math.max(0,Number(config.diasMaxAtraso)):30;
  function cobertura(){return N.coberturaOrdenes(ordenes,NS.programaciones(),{hoy:NS.hoyOperativo(),producidoDe,diasMaxAtraso:diasMax()});}

  /* ---------- pantalla ---------- */
  const F={estado:'abiertas',cliente:'',cadena:'',linea:'',hasta:''};
  const CSS=`
    #plan-root .ov-kpis,.plan-dialogo .ov-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:0 0 14px}
    .ov-k{background:#fff;border:1px solid #dce5ec;border-left:5px solid var(--c,#9aa9b8);border-radius:12px;padding:10px 14px}
    .ov-k span{display:block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#5a6b78}
    .ov-k b{display:block;font-size:24px;font-weight:800;color:#003b5c;font-variant-numeric:tabular-nums}.ov-k small{display:block;color:#5a6b78;font-size:12px}
    .ov-barra{height:10px;border-radius:6px;background:#e5ebef;position:relative;overflow:hidden;min-width:140px}
    .ov-barra i{position:absolute;left:0;top:0;bottom:0}.ov-barra .p{background:#9fc3e8}.ov-barra .q{background:#2f6690}
    .ov-leyenda{font-size:11px;color:#5a6b78;margin-top:3px}
    .ov-chip{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}
    .ov-chip.verde{background:#dcfce7;color:#166534}.ov-chip.azul{background:#dbeafe;color:#1e40af}.ov-chip.ambar{background:#fff4d6;color:#8a6d1d}.ov-chip.rojo{background:#fee2e2;color:#991b1b}.ov-chip.gris{background:#eceff3;color:#4b5563}
    .ov-venc{font-size:11px;font-weight:700;color:#991b1b}.ov-falta{color:#a32020;font-weight:800}
    .ov-fila{cursor:pointer}.ov-fila:hover td{background:#f7fbfe}.ov-cerrada td{opacity:.6}
    .ov-det .li{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-top:1px solid #edf2f6;font-size:13px}
    .ov-sheets table{width:100%;border-collapse:collapse;font-size:13px}.ov-sheets td,.ov-sheets th{padding:6px 8px;border-top:1px solid #edf2f6;text-align:left}
    .ov-sheets input{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #cfdbe3;border-radius:8px;font:inherit}
    .ov-eq{width:100%;border-collapse:collapse;font-size:13px}.ov-eq td,.ov-eq th{padding:5px 6px;border-top:1px solid #edf2f6;text-align:left}.ov-eq select{width:100%;padding:5px;border:1px solid #cfdbe3;border-radius:8px;font:inherit}
    .ov-vista{margin-top:10px;padding:10px 12px;border-radius:10px;background:#f4f8fb;font-size:13px}.ov-vista li{margin:3px 0}`;
  function estilos(){if(document.getElementById('ov-css'))return;const s=document.createElement('style');s.id='ov-css';s.textContent=CSS;document.head.appendChild(s);}

  const lineasDe=()=>NS.lineas();
  function etiquetaProducto(o){
    const l=o.linea||(lineasDe().find(x=>NS.presentacionesBrutas(x.key).includes(o.presentacion))||{}).key||'';
    return esc(o.marca)+' · '+esc(l?NS.etiquetaPresentacion(l,o.marca,o.presentacion):o.presentacion);
  }
  const fechaCorta=f=>f?String(f).split('-').reverse().slice(0,2).join('/'):'—';
  function textoEntrega(o,st){
    const d=st&&st.dias;
    if(st&&st.cerrada)return fechaCorta(o.fechaEntrega);
    if(d===undefined||d===null)return fechaCorta(o.fechaEntrega);
    return fechaCorta(o.fechaEntrega)+(d<0?' <span class="ov-venc">· vencida</span>':d===0?' <span class="ov-venc">· hoy</span>':d<=3?' <span class="ov-venc">· en '+d+(d===1?' día':' días')+'</span>':'');
  }

  function filtrar(lista,cob,hoy){
    return lista.filter(o=>{
      const st=N.estadoOrden(o,cob.get(o.id),hoy,diasMax());
      const e=F.estado;
      if(e==='abiertas'&&st.cerrada)return false;
      if(e==='atrasadas'&&st.clave!=='ATRASADA')return false;
      if(e==='sinprogramar'&&st.clave!=='SIN_PROGRAMAR')return false;
      if(e==='parcial'&&st.clave!=='PARCIAL')return false;
      if(e==='enproduccion'&&st.clave!=='EN_PRODUCCION')return false;
      if(e==='completas'&&st.clave!=='COMPLETA')return false;
      if(e==='despachadas'&&st.clave!=='DESPACHADA')return false;
      if(e==='cerradas'&&!['CANCELADA','RETIRADA'].includes(st.clave))return false;
      if(e==='vencidas'&&st.clave!=='VENCIDA')return false;
      if(F.cliente&&o.cliente!==F.cliente)return false;
      if(F.cadena&&o.cadena!==F.cadena)return false;
      if(F.linea&&o.linea&&o.linea!==F.linea)return false;
      if(F.hasta&&o.fechaEntrega>F.hasta)return false;
      return true;
    });
  }

  function pintarVentas(cont){
    estilos();
    const planifica=NS.puede();
    const clientes=[...new Set(ordenes.map(o=>o.cliente).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    const cadenas=[...new Set(ordenes.map(o=>o.cadena).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    cont.innerHTML='<div class="plan-bar" id="ov-barra">'+
      '<label>Estado<select id="ov-estado">'+[['abiertas','Abiertas'],['atrasadas','Atrasadas'],['sinprogramar','Sin programar'],['parcial','Programadas en parte'],['enproduccion','En producción'],['completas','Completas (producidas)'],['despachadas','Despachadas'],['vencidas','Vencidas sin atender'],['cerradas','Canceladas / retiradas'],['todas','Todas']]
        .map(([v,t])=>'<option value="'+v+'"'+(F.estado===v?' selected':'')+'>'+t+'</option>').join('')+'</select></label>'+
      '<label>Cliente<select id="ov-cliente"><option value="">Todos</option>'+clientes.map(c=>'<option'+(F.cliente===c?' selected':'')+' value="'+esc(c)+'">'+esc(c)+'</option>').join('')+'</select></label>'+
      (cadenas.length>1?'<label>Cadena<select id="ov-cadena"><option value="">Todas</option>'+cadenas.map(c=>'<option'+(F.cadena===c?' selected':'')+' value="'+esc(c)+'">'+esc(c)+'</option>').join('')+'</select></label>':'')+
      '<label>Línea<select id="ov-linea"><option value="">Todas</option>'+lineasDe().map(l=>'<option value="'+esc(l.key)+'"'+(F.linea===l.key?' selected':'')+'>'+esc(l.name)+'</option>').join('')+'</select></label>'+
      '<label>Entrega hasta<input type="date" id="ov-hasta" value="'+esc(F.hasta)+'"></label>'+
      '<span style="flex:1"></span>'+
      '<button type="button" class="btn btn-ghost btn-sm" disabled title="Se activará cuando se conecte la hoja de Google Sheets" style="border-style:dashed">⟳ Sincronizar Google Sheets · Próximamente</button>'+
      (planifica?'<button type="button" class="btn btn-ghost btn-sm" data-ov-importar>⇪ Importar Excel / CSV</button><button type="button" class="btn btn-primary btn-sm" data-ov-nueva>+ Nueva orden</button>':'')+
      '</div><div id="ov-kpis"></div><div id="ov-tabla"></div><div id="ov-sheets"></div>';
    pintarCuerpo();pintarSheets();
  }

  function pintarCuerpo(){
    const kp=document.getElementById('ov-kpis'),tb=document.getElementById('ov-tabla');
    if(!kp||!tb)return;
    if(!listo){tb.innerHTML='<div class="empty-state"><p>Cargando órdenes…</p></div>';return;}
    const hoy=NS.hoyOperativo(),cob=cobertura(),r=N.resumenOrdenes(ordenes,cob,hoy,diasMax());
    const pct=(a,b)=>b>0?(a/b*100).toFixed(1).replace('.',',')+' % de lo pendiente':'';
    kp.innerHTML='<div class="ov-kpis">'+
      '<div class="ov-k" style="--c:#005b96"><span>Órdenes abiertas</span><b>'+fmt(r.abiertas)+'</b><small>'+(r.porVencer?r.porVencer+' por vencer en 3 días':'sin entregas próximas')+'</small></div>'+
      '<div class="ov-k" style="--c:#3f8f5f"><span>Nivel de servicio</span><b>'+(r.nivelServicio==null?'—':(r.nivelServicio*100).toFixed(1).replace('.',',')+' %')+'</b><small>'+fmt(r.despachado)+' despachadas de '+fmt(r.solicitado)+'</small></div>'+
      '<div class="ov-k"><span>Por despachar</span><b>'+fmt(r.pedidas)+'</b><small>unidades pendientes</small></div>'+
      '<div class="ov-k" style="--c:#2f6690"><span>Programado</span><b>'+fmt(r.programado)+'</b><small>'+pct(r.programado,r.pedidas)+'</small></div>'+
      '<div class="ov-k" style="--c:#3f8f5f"><span>Producido</span><b>'+fmt(r.producido)+'</b><small>'+pct(r.producido,r.pedidas)+'</small></div>'+
      '<div class="ov-k" style="--c:#df8b00"><span>Falta programar</span><b>'+fmt(r.falta)+'</b><small>'+r.sinCubrir+(r.sinCubrir===1?' orden sin cubrir':' órdenes sin cubrir')+'</small></div>'+
      '<div class="ov-k" style="--c:#c4472b"><span>Atrasadas</span><b>'+fmt(r.atrasadas)+'</b><small>'+(r.vencidas?fmt(r.vencidas)+' más, vencidas hace más de '+diasMax()+' días':'entrega vencida')+'</small></div></div>';
    const filas=filtrar(ordenes,cob,hoy).sort((a,b)=>{
      const ca=N.estadoOrden(a,cob.get(a.id),hoy,diasMax()).cerrada,cb=N.estadoOrden(b,cob.get(b.id),hoy,diasMax()).cerrada;
      return (ca-cb)||String(a.fechaEntrega).localeCompare(String(b.fechaEntrega))||String(a.numero).localeCompare(String(b.numero));
    });
    if(!ordenes.length){
      tb.innerHTML='<div class="empty-state"><h4>Todavía no hay órdenes de ventas</h4><p>'+(NS.puede()?'Registra la primera con «+ Nueva orden» o carga un Excel/CSV con «Importar». Más adelante se conectarán desde Google Sheets.':'Aún no se registró ninguna.')+'</p></div>';
      return;
    }
    tb.innerHTML='<div class="plan-scroll"><table class="plan-tabla"><thead><tr><th>N.º orden</th><th>Cliente</th><th>Producto</th><th class="num">Solicitado</th><th class="num">Despachado</th><th>Entrega</th><th>Programado · Producido</th><th class="num">Falta programar</th><th>Estado</th></tr></thead><tbody>'+
      (filas.length?filas.map(o=>{
        const c=cob.get(o.id),st=N.estadoOrden(o,c,hoy,diasMax()),ped=c?num(c.pedido):0;
        const prog=c&&ped>0?Math.min(100,c.programado/ped*100):0,prod=c&&ped>0?Math.min(100,c.producido/ped*100):0;
        return '<tr class="ov-fila'+(st.cerrada&&st.clave!=='COMPLETA'&&st.clave!=='DESPACHADA'?' ov-cerrada':'')+'" data-ov-ver="'+esc(o.id)+'"><td><b>'+esc(o.numero)+'</b></td><td>'+esc(o.cliente)+(o.cadena?'<br><small>'+esc(o.cadena)+'</small>':'')+'</td><td>'+etiquetaProducto(o)+(o.linea?'<br><small>'+esc(NS.nombreLinea(o.linea))+'</small>':'')+'</td>'+
          '<td class="num">'+fmt(o.cantidad)+'</td><td class="num">'+(num(o.despachado)>0?fmt(o.despachado):'—')+'</td><td>'+textoEntrega(o,st)+'</td>'+
          '<td>'+(c?'<div class="ov-barra" title="Programado '+fmt(c.programado)+' · Producido '+fmt(c.producido)+'"><i class="p" style="width:'+prog.toFixed(1)+'%"></i><i class="q" style="width:'+prod.toFixed(1)+'%"></i></div><div class="ov-leyenda">'+fmt(c.programado)+' prog. · '+fmt(c.producido)+' prod. ('+(ped>0?Math.round(c.producido/ped*100):100)+' %)</div>':'—')+'</td>'+
          '<td class="num">'+(c&&c.falta>0?'<span class="ov-falta">'+fmt(c.falta)+'</span>':(c?'0':'—'))+'</td><td><span class="ov-chip '+st.nivel+'">'+esc(st.etiqueta)+'</span></td></tr>';
      }).join(''):'<tr><td colspan="9">Ninguna orden coincide con los filtros.</td></tr>')+'</tbody></table></div>'+
      '<p class="plan-nota">Barra clara = programado · barra oscura = producido, sobre lo que aún falta despachar. Lo ya despachado no necesita producción. Cada orden se cubre con lo programado de su producto, por fecha de entrega (la más urgente primero). No se modifica ninguna programación.</p>';
  }

  /* ---------- conexión con Google Sheets (preparada) ---------- */
  function pintarSheets(){
    const cont=document.getElementById('ov-sheets');
    if(!cont)return;
    const mapeo=config.mapeo||{},planifica=NS.puede(),eqs=Object.values(config.equivalencias||{});
    cont.innerHTML='<details class="ov-sheets"><summary style="cursor:pointer;font-weight:700;color:#003b5c;margin:10px 0 4px">Conexión con Google Sheets <span class="ov-chip gris">Preparada · sin conectar</span></summary>'+
      '<p class="plan-nota">Hoy se usa al <b>importar Excel/CSV</b>; la misma lógica servirá para la hoja. Escribe el encabezado exacto de cada columna de tu hoja (si lo dejas vacío se reconoce por el nombre habitual: «Pedido», «Razón social», «Formato», «Entrega»…).</p>'+
      '<div class="plan-scroll"><table><thead><tr><th>Dato del sistema</th><th>Encabezado en la hoja</th></tr></thead><tbody>'+
      N.COLUMNAS.map(c=>'<tr><td>'+esc(c.etq)+'</td><td><input data-ov-map="'+c.clave+'" value="'+esc(mapeo[c.clave]||'')+'" placeholder="automático"'+(planifica?'':' disabled')+'></td></tr>').join('')+'</tbody></table></div>'+
      '<ul class="plan-nota"><li>Si el N.º ya existe, la orden se <b>actualiza</b> (no se duplica).</li><li>Si una orden desaparece de la hoja, se marca <b>«Retirada»</b>; no se borra.</li><li>Las órdenes creadas a mano nunca se retiran por una sincronización.</li></ul>'+
      (planifica?'<p><button type="button" class="btn btn-ghost btn-sm" data-ov-guardar-mapa>Guardar columnas</button> <span class="plan-error" id="ov-mapa-error" style="display:inline"></span></p>':'')+
      '<h4 style="margin:14px 0 4px;color:#003b5c">Fecha de corte</h4><p class="plan-nota">Solo entran órdenes con fecha de entrega desde esta fecha; lo anterior se ignora al importar o sincronizar.</p>'+
      '<p><input type="date" id="ov-corte" value="'+esc(config.fechaCorte||'')+'"'+(planifica?'':' disabled')+'> '+(planifica?'<button type="button" class="btn btn-ghost btn-sm" data-ov-guardar-corte>Guardar fecha</button>':'')+'</p>'+
      '<h4 style="margin:14px 0 4px;color:#003b5c">Órdenes vencidas</h4><p class="plan-nota">Una orden sin despachar con más días de atraso que este número se considera histórica: sale de «Atrasadas» y no reserva programaciones.</p>'+
      '<p><input type="number" id="ov-dias" min="0" step="1" value="'+esc(diasMax())+'" style="width:90px"'+(planifica?'':' disabled')+'> días '+(planifica?'<button type="button" class="btn btn-ghost btn-sm" data-ov-guardar-dias>Guardar</button>':'')+'</p>'+
      '<h4 style="margin:14px 0 4px;color:#003b5c">Equivalencias de productos <span class="ov-chip gris">'+eqs.length+'</span></h4><p class="plan-nota">Traducen el texto de la hoja (p. ej. «SCALA-AGUA-SIN-GAS-BT-1-L») a la marca y presentación del sistema. Las nuevas se piden al importar.</p>'+
      (eqs.length?htmlTablaEquiv(eqs.map(e=>htmlFilaEquiv(e.texto,e,'')))+(planifica?'<p><button type="button" class="btn btn-ghost btn-sm" data-ov-guardar-eqs>Guardar cambios</button> <span class="plan-error" id="ov-eq-error" style="display:inline"></span></p>':''):'<p class="plan-nota">Todavía no hay equivalencias guardadas.</p>')+
      '</details>';
  }

  /* ---------- diálogos ---------- */
  function opcionesProducto(linea){
    const lineas=linea?[linea]:lineasDe().map(l=>l.key);
    const marcas=[...new Set(lineas.flatMap(l=>NS.marcas(l)))];
    const pres=[];const vistos=new Set();
    lineas.forEach(l=>NS.presentaciones(l).forEach(p=>{if(!vistos.has(p.value)){vistos.add(p.value);pres.push(p);}}));
    return {marcas,pres};
  }
  function dialogoOrden(id){
    if(!NS.puede())return;
    const x=id?ordenes.find(o=>o.id===id):null;
    const b=x||{numero:'',cliente:'',marca:'',presentacion:'',linea:'',cantidad:'',despachado:'',cadena:'',fechaEntrega:'',fechaPedido:NS.hoyOperativo(),observaciones:''};
    const clientes=[...new Set(ordenes.map(o=>o.cliente).filter(Boolean))];
    const fondo=NS.abrirDialogo('<h3>'+(x?'Editar orden '+esc(x.numero):'Nueva orden de venta')+'</h3><div class="plan-campos">'+
      '<label>N.º de orden<input id="ov-numero" value="'+esc(b.numero)+'" maxlength="40"></label>'+
      '<label>Cliente<input id="ov-cli" list="ov-clientes" value="'+esc(b.cliente)+'" maxlength="80"><datalist id="ov-clientes">'+clientes.map(c=>'<option value="'+esc(c)+'">').join('')+'</datalist></label>'+
      '<label>Línea (opcional)<select id="ov-lin"><option value="">Cualquiera</option>'+lineasDe().map(l=>'<option value="'+esc(l.key)+'"'+(l.key===b.linea?' selected':'')+'>'+esc(l.name)+'</option>').join('')+'</select></label>'+
      '<label>Marca<select id="ov-marca"></select></label>'+
      '<label class="completo">Presentación<select id="ov-pres"></select></label>'+
      '<label>Cantidad (UND)<input type="number" id="ov-cant" min="1" step="1" value="'+esc(b.cantidad)+'"></label>'+
      '<label>Despachado (UND)<input type="number" id="ov-desp" min="0" step="1" value="'+esc(b.despachado||'')+'"></label>'+
      '<label>Cadena (opcional)<input id="ov-cad" value="'+esc(b.cadena||'')+'" maxlength="40"></label>'+
      '<label>Fecha de entrega<input type="date" id="ov-entrega" value="'+esc(b.fechaEntrega)+'"></label>'+
      '<label>Fecha del pedido<input type="date" id="ov-pedido" value="'+esc(b.fechaPedido||'')+'"></label>'+
      '<label class="completo">Observaciones<input id="ov-obs" value="'+esc(b.observaciones||'')+'" maxlength="200"></label></div>'+
      '<div class="plan-error" id="ov-error"></div><div class="plan-acciones"><button type="button" class="btn btn-ghost" id="ov-cancelar">Cancelar</button><button type="button" class="btn btn-primary" id="ov-guardar">Guardar</button></div>');
    const q=i=>fondo.querySelector('#'+i);
    const llenar=()=>{
      const {marcas,pres}=opcionesProducto(q('ov-lin').value);
      q('ov-marca').innerHTML='<option value="">Selecciona…</option>'+marcas.map(m=>'<option'+(m===b.marca?' selected':'')+' value="'+esc(m)+'">'+esc(m)+'</option>').join('');
      q('ov-pres').innerHTML='<option value="">Selecciona…</option>'+pres.map(p=>'<option'+(p.value===b.presentacion?' selected':'')+' value="'+esc(p.value)+'">'+esc(p.label)+'</option>').join('');
    };
    llenar();
    q('ov-lin').onchange=()=>{b.marca=q('ov-marca').value;b.presentacion=q('ov-pres').value;llenar();};
    q('ov-cancelar').onclick=()=>fondo.remove();
    q('ov-guardar').onclick=async()=>{
      q('ov-guardar').disabled=true;q('ov-error').textContent='';
      try{
        await guardarOrden({id:x?x.id:'',version:x?x.version:0,numero:q('ov-numero').value,cliente:q('ov-cli').value,linea:q('ov-lin').value,marca:q('ov-marca').value,presentacion:q('ov-pres').value,
          cantidad:q('ov-cant').value,despachado:q('ov-desp').value,cadena:q('ov-cad').value,fechaEntrega:q('ov-entrega').value,fechaPedido:q('ov-pedido').value,observaciones:q('ov-obs').value});
        fondo.remove();
      }catch(e){q('ov-error').textContent=(e&&e.message)||String(e);q('ov-guardar').disabled=false;}
    };
  }

  function dialogoDetalle(id){
    const o=ordenes.find(x=>x.id===id);
    if(!o)return;
    const hoy=NS.hoyOperativo(),c=cobertura().get(o.id),st=N.estadoOrden(o,c,hoy,diasMax()),planifica=NS.puede();
    const li=(a,b)=>'<div class="li"><span>'+a+'</span><b>'+b+'</b></div>';
    const fondo=NS.abrirDialogo('<div class="ov-det"><h3 style="display:flex;justify-content:space-between;gap:10px;align-items:center">Orden '+esc(o.numero)+' <span class="ov-chip '+st.nivel+'">'+esc(st.etiqueta)+'</span></h3>'+
      li('Cliente',esc(o.cliente))+li('Producto',etiquetaProducto(o)+(o.linea?' · '+esc(NS.nombreLinea(o.linea)):''))+li('Solicitado',fmt(o.cantidad)+' UND')+li('Despachado',fmt(o.despachado)+' UND')+li('Pendiente',fmt(Math.max(0,num(o.cantidad)-num(o.despachado)))+' UND')+(o.cadena?li('Cadena',esc(o.cadena)):'')+(o.producto?li('Producto en la hoja',esc(o.producto)):'')+li('Entrega',textoEntrega(o,st))+
      (c?li('Programado · Producido',fmt(c.programado)+' · '+fmt(c.producido)+' UND')+li('Falta programar','<span class="'+(c.falta>0?'ov-falta':'')+'">'+fmt(c.falta)+' UND</span>'):'')+
      (c&&c.detalle.length?'<h4 style="margin:14px 0 4px;color:#003b5c">Programaciones que la cubren</h4>'+c.detalle.map(d=>'<div class="li"><span>'+esc(NS.nombreLinea(d.linea))+' · '+esc(d.fecha)+' · '+esc(NS.etiquetaBloque(d.turno))+'</span><span><b>'+fmt(d.cantidad)+' UND</b> <button type="button" class="btn btn-ghost btn-sm" data-ov-ir="'+esc(d.fecha)+'|'+esc(d.turno)+'">Ver</button></span></div>').join(''):'')+
      (o.observaciones?li('Observaciones',esc(o.observaciones)):'')+
      li('Origen',esc(o.origen==='manual'?'Manual':o.origen==='sheets'?'Google Sheets':'Excel / CSV')+(o.idExterno?' · '+esc(o.idExterno):''))+
      li('Última actualización',esc(o.actualizadoPor||'—')+(o.actualizadoEn?' · '+new Date(o.actualizadoEn).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):''))+'</div>'+
      '<div class="plan-acciones">'+(planifica?
        '<button type="button" class="btn btn-ghost" data-ov-irprog>Ir a programar</button>'+
        '<button type="button" class="btn btn-ghost" data-ov-editar="'+esc(o.id)+'">Editar</button>'+
        (st.clave==='CANCELADA'||st.clave==='RETIRADA'?'<button type="button" class="btn btn-ghost" data-ov-estado="ABIERTA|'+esc(o.id)+'">Reabrir</button>':(st.clave==='COMPLETA'||st.clave==='DESPACHADA'?'':'<button type="button" class="btn btn-ghost" data-ov-estado="CANCELADA|'+esc(o.id)+'">Cancelar orden</button>')):'')+
      '<button type="button" class="btn btn-primary" data-ov-cerrar>Cerrar</button></div>',true);
    fondo.addEventListener('click',async e=>{
      if(e.target.closest('[data-ov-cerrar]')){fondo.remove();return;}
      const ir=e.target.closest('[data-ov-ir]');
      if(ir){const [f,t]=ir.getAttribute('data-ov-ir').split('|');fondo.remove();NS.irA(f,t);return;}
      if(e.target.closest('[data-ov-irprog]')){fondo.remove();NS.irA(o.fechaEntrega>hoy?hoy:o.fechaEntrega,'DÍA');return;}
      const ed=e.target.closest('[data-ov-editar]');if(ed){fondo.remove();dialogoOrden(ed.getAttribute('data-ov-editar'));return;}
      const es=e.target.closest('[data-ov-estado]');
      if(es){
        const [estado,oid]=es.getAttribute('data-ov-estado').split('|');
        if(estado==='CANCELADA'&&!confirm('¿Cancelar la orden '+o.numero+'? Dejará de reservar programaciones.'))return;
        try{await cambiarEstado(oid,estado);fondo.remove();}catch(err){alert((err&&err.message)||err);}
      }
    });
  }

  /* CSV sin depender de la librería de Excel: separa por coma, punto y coma o tabulación, respeta comillas y el BOM. */
  function leerCSV(texto){
    const t=String(texto).replace(/^\uFEFF/,'');
    const primera=t.split(/\r?\n/)[0]||'';
    const sep=[';','\t',','].map(c=>[c,primera.split(c).length]).sort((a,b)=>b[1]-a[1])[0][0];
    const filas=[];let fila=[],campo='',q=false;
    for(let i=0;i<t.length;i++){
      const ch=t[i];
      if(q){if(ch==='"'&&t[i+1]==='"'){campo+='"';i++;}else if(ch==='"')q=false;else campo+=ch;}
      else if(ch==='"')q=true;
      else if(ch===sep){fila.push(campo);campo='';}
      else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&t[i+1]==='\n')i++;fila.push(campo);campo='';filas.push(fila);fila=[];}
      else campo+=ch;
    }
    if(campo!==''||fila.length){fila.push(campo);filas.push(fila);}
    const util=filas.filter(f=>f.some(c=>String(c).trim()!==''));
    if(!util.length)return [];
    const enc=util[0].map(h=>String(h).trim());
    return util.slice(1).map(f=>Object.fromEntries(enc.map((h,i)=>[h,f[i]==null?'':String(f[i]).trim()])));
  }

  /* ---- equivalencias: texto de la hoja → marca + presentación (+ línea) ---- */
  /* Sugerencia para la tabla de equivalencias: primera línea que tiene esa marca Y un formato igual (625 ml, 2.5 L, caja 20 L…); el usuario la confirma o cambia. */
  function sugerirLineaPres(sug){
    const formatos=[sug.formato];if(/^20l$/.test(sug.formato))formatos.push('caja20l','bidon20l');
    const marcaEn=l=>NS.marcas(l).find(m=>N.norm(m)===N.norm(sug.marca||sug.base||''));
    for(const f of formatos){
      for(const l of lineasDe()){
        const m=marcaEn(l.key),p=m&&NS.presentaciones(l.key).find(x=>N.formatoDe(x.value)===f);
        if(p)return {linea:l.key,marca:m,presentacion:p.value};
      }
    }
    const l=lineasDe().find(x=>marcaEn(x.key));
    return {linea:l?l.key:'',marca:l?marcaEn(l.key):'',presentacion:''};
  }
  function htmlFilaEquiv(texto,v,extra){
    const {marcas,pres}=opcionesProducto(v.linea);
    return '<tr data-eq="'+esc(texto)+'"><td><b>'+esc(texto)+'</b>'+(extra?'<br><small>'+extra+'</small>':'')+'</td>'+
      '<td><select data-eq-linea><option value="">Cualquiera</option>'+lineasDe().map(l=>'<option value="'+esc(l.key)+'"'+(l.key===v.linea?' selected':'')+'>'+esc(l.name)+'</option>').join('')+'</select></td>'+
      '<td><select data-eq-marca><option value="">Selecciona…</option>'+marcas.map(m=>'<option'+(m===v.marca?' selected':'')+' value="'+esc(m)+'">'+esc(m)+'</option>').join('')+'</select></td>'+
      '<td><select data-eq-pres><option value="">Selecciona…</option>'+pres.map(p=>'<option'+(p.value===v.presentacion?' selected':'')+' value="'+esc(p.value)+'">'+esc(p.label)+'</option>').join('')+'</select></td></tr>';
  }
  function htmlTablaEquiv(filas){
    return '<div class="plan-scroll"><table class="ov-eq"><thead><tr><th>Producto en la hoja</th><th>Línea</th><th>Marca</th><th>Presentación</th></tr></thead><tbody>'+filas.join('')+'</tbody></table></div>';
  }
  /* Al cambiar la línea se rehacen las marcas y presentaciones de esa fila (un solo escucha para el panel y el diálogo). */
  document.addEventListener('change',e=>{
    const sel=e.target&&e.target.closest&&e.target.closest('[data-eq-linea]');if(!sel)return;
    const tr=sel.closest('tr'),{marcas,pres}=opcionesProducto(sel.value);
    tr.querySelector('[data-eq-marca]').innerHTML='<option value="">Selecciona…</option>'+marcas.map(m=>'<option value="'+esc(m)+'">'+esc(m)+'</option>').join('');
    tr.querySelector('[data-eq-pres]').innerHTML='<option value="">Selecciona…</option>'+pres.map(p=>'<option value="'+esc(p.value)+'">'+esc(p.label)+'</option>').join('');
  });
  function leerEquiv(raiz){
    const eq={};
    raiz.querySelectorAll('tr[data-eq]').forEach(tr=>{
      const marca=tr.querySelector('[data-eq-marca]').value,presentacion=tr.querySelector('[data-eq-pres]').value;
      if(marca&&presentacion)eq[N.norm(tr.getAttribute('data-eq'))]={texto:tr.getAttribute('data-eq'),marca,presentacion,linea:tr.querySelector('[data-eq-linea]').value};
    });
    return eq;
  }

  /* Qué pestañas de un libro son de ventas: las visibles que traen las columnas del sistema (OC, tienda, entrega, producto, solicitadas). El AÑO se decide por la fecha de
     entrega de las filas, no por el nombre de la pestaña («SPSA 2025» puede traer entregas de 2026): 2026 si hay entregas de 2026 y, si no, 2025 (o el año más alto).
     Devuelve ese año; la fecha de corte propuesta es su 1 de enero. */
  function clasificarHojas(hojas,mapa){
    const anios=new Set();
    hojas.forEach(h=>{
      const enc=[...new Set(h.filas.slice(0,50).flatMap(f=>Object.keys(f)))];
      const m=N.mapearColumnas(enc,mapa);
      h.faltan=m.faltan;h.valida=!m.faltan.length;h.marcada=h.valida&&!h.oculta;
      if(h.marcada&&m.mapa.fechaEntrega)h.filas.forEach(f=>{const d=N.leerFecha(f[m.mapa.fechaEntrega],'');if(d)anios.add(Number(d.slice(0,4)));});
    });
    const lista=[...anios];
    return lista.includes(2026)?2026:lista.includes(2025)?2025:(lista.length?Math.max(...lista):0);
  }

  /* Importar Excel / CSV: un archivo con una o varias pestañas (una por cadena) */
  function dialogoImportar(){
    if(!NS.puede())return;
    const fondo=NS.abrirDialogo('<h3>Importar órdenes de ventas</h3><p class="plan-nota">Sube el Excel o CSV de ventas. Si tiene varias pestañas (una por cadena: MAKRO, SPSA…), marca las que quieras. Una OC con varios productos crea una orden por producto. Si OC + producto ya existe se actualiza.</p>'+
      '<p><input type="file" id="ovi-archivo" accept=".xlsx,.xls,.csv"> <button type="button" class="btn btn-ghost btn-sm" data-ovi-plantilla>Descargar plantilla</button></p>'+
      '<div id="ovi-hojas"></div>'+
      '<label style="display:flex;gap:8px;align-items:center;margin:6px 0">Importar solo órdenes con entrega desde <input type="date" id="ovi-corte" value="'+esc(config.fechaCorte||'')+'"> <small>(lo anterior se omite)</small></label>'+
      '<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" id="ovi-retirar"> Marcar como «retiradas» las órdenes importadas antes que ya no están en este archivo</label>'+
      '<div id="ovi-vista"></div><div class="plan-error" id="ovi-error"></div>'+
      '<div class="plan-acciones"><button type="button" class="btn btn-ghost" id="ovi-cancelar">Cancelar</button><button type="button" class="btn btn-primary" id="ovi-aplicar" disabled>Importar</button></div>',true);
    const q=i=>fondo.querySelector('#'+i);
    let hojas=null,origen='excel',corteManual=false;
    q('ovi-corte').addEventListener('input',()=>{corteManual=true;});
    const elegidas=()=>{const marcadas=new Set([...fondo.querySelectorAll('[data-ovi-hoja]:checked')].map(c=>c.getAttribute('data-ovi-hoja')));return (hojas||[]).filter(h=>marcadas.has(h.nombre));};
    const opcImp=()=>({origen,retirarAusentes:q('ovi-retirar').checked,fechaCorte:q('ovi-corte').value||''});
    const vista=()=>{
      const sel=elegidas();
      if(!hojas||!sel.length){q('ovi-vista').innerHTML=hojas?(hojas.some(h=>h.valida)?'<div class="plan-aviso">Marca al menos una pestaña.</div>':'<div class="plan-aviso"><b>Este archivo no parece de órdenes de ventas.</b> Ninguna pestaña tiene las columnas necesarias: OC (N.º de orden), TIENDA (cliente), FECHA ENTREGA, PRODUCTO y UND SOLICITADAS. Sube el libro de ventas (pestañas MAKRO, SPSA, CEN, TAMBO…).</div>'):'';q('ovi-aplicar').disabled=true;return;}
      const r=previsualizar({hojas:sel},opcImp());
      const malas=(r.hojasSinColumnas||[]).map(h=>'<li style="color:#991b1b">Pestaña «'+esc(h.hoja)+'»: faltan columnas ('+esc(h.faltan.join(', '))+') y no se importa.</li>').join('');
      if(r.faltanColumnas.length&&!r.crear.length&&!r.actualizar.length){q('ovi-vista').innerHTML='<div class="plan-aviso">Faltan columnas obligatorias: <b>'+esc(r.faltanColumnas.join(', '))+'</b>.</div><ul>'+malas+'</ul>';q('ovi-aplicar').disabled=true;return;}
      let html='<div class="ov-vista"><b>Vista previa</b><ul><li>'+r.crear.length+' orden(es) nueva(s)</li><li>'+r.actualizar.length+' por actualizar</li><li>'+r.sinCambio+' sin cambios</li>'+
        (r.fueraDeCorte?'<li>'+r.fueraDeCorte+' anterior(es) a la fecha de corte (se omiten)</li>':'')+(r.sinCantidad?'<li>'+r.sinCantidad+' línea(s) con 0 solicitadas (se omiten)</li>':'')+(r.duplicadasOmitidas?'<li>'+r.duplicadasOmitidas+' línea(s) «OC duplicada» o anulada que también viene vigente (se omiten)</li>':'')+(r.filasAjenas?'<li>'+r.filasAjenas+' fila(s) sin OC ni tienda (totales o notas; se omiten)</li>':'')+(r.sinOC?'<li>'+r.sinOC+' pedido(s) sin N.º de OC: se identifican como «S/OC fecha tienda»</li>':'')+(r.retirar.length?'<li>'+r.retirar.length+' por marcar como retirada(s)</li>':'')+malas+
        (r.errores.length?'<li style="color:#991b1b">'+r.errores.length+' con error (no se importan): '+r.errores.slice(0,6).map(x=>(x.hoja?x.hoja+' · ':'')+'fila '+x.fila+' · '+esc(x.mensaje)).join(' | ')+(r.errores.length>6?' …':'')+'</li>':'')+'</ul></div>';
      if(r.sinEquivalencia&&r.sinEquivalencia.length){
        html+='<div class="plan-aviso" style="margin-top:10px"><b>'+r.sinEquivalencia.length+' producto(s) de la hoja aún no están en el sistema.</b> Dime a qué marca y presentación equivale cada uno (se guarda y no vuelve a preguntar). Hasta entonces esas filas no se importan.</div>'+
          htmlTablaEquiv(r.sinEquivalencia.map(x=>htmlFilaEquiv(x.texto,sugerirLineaPres(x.sugerencia),x.filas+(x.filas===1?' fila':' filas'))))+
          '<p><button type="button" class="btn btn-primary btn-sm" data-ovi-guardar-eq>Guardar equivalencias</button></p>';
      }
      q('ovi-vista').innerHTML=html;
      q('ovi-aplicar').disabled=!(r.crear.length||r.actualizar.length||r.retirar.length);
      q('ovi-aplicar').title=q('ovi-aplicar').disabled?(r.sinEquivalencia&&r.sinEquivalencia.length?'Primero guarda las equivalencias de producto (tabla de arriba): sin ellas no hay nada que importar.':'No hay órdenes nuevas ni cambios para importar.'):'';
    };
    q('ovi-archivo').onchange=async e=>{
      q('ovi-error').textContent='';hojas=null;q('ovi-hojas').innerHTML='';
      const f=e.target.files&&e.target.files[0];if(!f){vista();return;}
      try{
        origen=/\.csv$/i.test(f.name)?'csv':'excel';
        if(origen==='csv')hojas=[{nombre:f.name.replace(/\.csv$/i,''),filas:leerCSV(await f.text()),oculta:false}];
        else{
          if(typeof XLSX==='undefined'||!XLSX.read)throw new Error('No se cargó la librería de Excel.');
          const libro=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});
          const meta=(libro.Workbook&&libro.Workbook.Sheets)||[];
          hojas=libro.SheetNames.map((n,i)=>({nombre:n,filas:XLSX.utils.sheet_to_json(libro.Sheets[n],{defval:'',raw:true}),oculta:!!(meta[i]&&meta[i].Hidden)}));
        }
        hojas=hojas.filter(h=>h.filas.length);
        if(!hojas.length)throw new Error('El archivo no tiene filas.');
        const anio=clasificarHojas(hojas,config.mapeo);
        if(anio&&!config.fechaCorte&&!corteManual)q('ovi-corte').value=anio+'-01-01';       // sin fecha de corte guardada: desde el 1 de enero del año elegido
        q('ovi-hojas').innerHTML=hojas.length>1||!hojas[0].valida?'<div class="ov-vista"><b>Pestañas</b> <small>(se marcan las de ventas visibles; entran las entregas desde el '+(anio?'1 de enero de '+anio:'corte')+')</small><div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">'+
          hojas.map(h=>'<label style="display:flex;gap:6px;align-items:center'+(h.valida?'':';color:#8a94a0')+'"><input type="checkbox" data-ovi-hoja="'+esc(h.nombre)+'"'+(h.marcada?' checked':'')+(h.valida?'':' disabled')+'> '+esc(h.nombre)+' <small>('+h.filas.length+' filas'+(h.oculta?' · oculta':'')+(h.valida?'':' · no es de ventas: faltan '+esc(h.faltan.join(', ')))+')</small></label>').join('')+'</div></div>':
          '<input type="checkbox" data-ovi-hoja="'+esc(hojas[0].nombre)+'" checked style="display:none">';
      }catch(err){q('ovi-error').textContent=(err&&err.message)||String(err);hojas=null;}
      vista();
    };
    fondo.addEventListener('change',e=>{if(e.target.matches('[data-ovi-hoja],#ovi-retirar,#ovi-corte'))vista();});
    q('ovi-cancelar').onclick=()=>fondo.remove();
    fondo.addEventListener('click',async e=>{
      if(e.target.closest('[data-ovi-guardar-eq]')){
        const nuevas=leerEquiv(q('ovi-vista'));
        if(!Object.keys(nuevas).length){q('ovi-error').textContent='Elige marca y presentación al menos en un producto.';return;}
        try{await guardarConfig({equivalencias:Object.assign({},config.equivalencias||{},nuevas)});q('ovi-error').textContent='';vista();}
        catch(err){q('ovi-error').textContent=(err&&err.message)||String(err);}
        return;
      }
      if(!e.target.closest('[data-ovi-plantilla]')||typeof XLSX==='undefined')return;
      const ejemplo=[['OC','TIENDA','FECHA EMISION','FECHA ENTREGA','PRODUCTO','UND SOLICITADAS','UND DESPACHO','OBS'],['4500123456','Tienda de ejemplo','2026-10-01','2026-10-30','SCALA-AGUA-SIN-GAS-BT-1-L',12000,0,'']];
      const libro=XLSX.utils.book_new();XLSX.utils.book_append_sheet(libro,XLSX.utils.aoa_to_sheet(ejemplo),'MAKRO');XLSX.writeFile(libro,'plantilla-ordenes-de-venta.xlsx');
    });
    q('ovi-aplicar').onclick=async()=>{
      q('ovi-aplicar').disabled=true;q('ovi-error').textContent='';
      const btn=q('ovi-aplicar'),texto0=btn.textContent;
      const prog=(h,t)=>{btn.textContent=t?'Importando… '+Math.round(h/t*100)+' %':'Importando…';q('ovi-error').style.color='#1e40af';q('ovi-error').textContent=t?'Guardando '+h.toLocaleString('es-PE')+' de '+t.toLocaleString('es-PE')+' líneas. No cierres esta ventana.':'Guardando…';};
      try{
        prog(0,0);
        const corte=q('ovi-corte').value||'';
        if(corte!==(config.fechaCorte||''))await conTiempo(guardarConfig({fechaCorte:corte}),60000,'El servidor no respondió al guardar la fecha de corte.');
        const r=await aplicarFuente({hojas:elegidas()},Object.assign(opcImp(),{progreso:prog}));
        fondo.remove();alert('Importación lista: '+r.crear.length+' nueva(s), '+r.actualizar.length+' actualizada(s)'+(r.retirar.length?', '+r.retirar.length+' retirada(s)':'')+(r.errores.length?'. '+r.errores.length+' fila(s) con error no se importaron.':'.'));
      }catch(err){console.error('Órdenes de ventas · importar:',err);q('ovi-error').style.color='';q('ovi-error').textContent=(err&&err.message)||String(err);btn.textContent=texto0;btn.disabled=false;}
    };
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click',async e=>{
    const raiz=e.target.closest&&e.target.closest('#plan-root');
    if(!raiz||!NS.estado||NS.estado.tab!=='ventas')return;
    if(e.target.closest('[data-ov-nueva]')){dialogoOrden('');return;}
    if(e.target.closest('[data-ov-importar]')){dialogoImportar();return;}
    const ver=e.target.closest('[data-ov-ver]');
    if(ver){dialogoDetalle(ver.getAttribute('data-ov-ver'));return;}
    if(e.target.closest('[data-ov-guardar-corte]')){
      try{await guardarConfig({fechaCorte:(document.getElementById('ov-corte')||{}).value||''});alert('Fecha de corte guardada.');}catch(err){alert((err&&err.message)||err);}
      return;
    }
    if(e.target.closest('[data-ov-guardar-dias]')){
      try{await guardarConfig({diasMaxAtraso:Math.max(0,Number((document.getElementById('ov-dias')||{}).value)||0)});alert('Guardado.');}catch(err){alert((err&&err.message)||err);}
      return;
    }
    if(e.target.closest('[data-ov-guardar-eqs]')){
      const er=document.getElementById('ov-eq-error');if(er)er.textContent='';
      try{
        const act=leerEquiv(document.getElementById('ov-sheets')),mant=Object.assign({},config.equivalencias||{});
        Object.keys(mant).forEach(k=>{if(!act[k])delete mant[k];});   // se quitó marca o presentación → se borra la equivalencia
        await guardarConfig({equivalencias:Object.assign(mant,act)});alert('Equivalencias guardadas.');pintarSheets();
      }catch(err){if(er)er.textContent=(err&&err.message)||String(err);}
      return;
    }
    if(e.target.closest('[data-ov-guardar-mapa]')){
      const mapeo={};raiz.querySelectorAll('[data-ov-map]').forEach(i=>{const v=i.value.trim();if(v)mapeo[i.getAttribute('data-ov-map')]=v;});
      const er=document.getElementById('ov-mapa-error');if(er)er.textContent='';
      try{await guardarMapeo(mapeo);alert('Columnas guardadas.');pintarSheets();}catch(err){if(er)er.textContent=(err&&err.message)||String(err);}
    }
  });
  document.addEventListener('change',e=>{
    if(!e.target||!e.target.closest||!e.target.closest('#plan-root')||!NS.estado||NS.estado.tab!=='ventas')return;
    const mapa={'ov-estado':'estado','ov-cliente':'cliente','ov-cadena':'cadena','ov-linea':'linea','ov-hasta':'hasta'};
    if(mapa[e.target.id]){F[mapa[e.target.id]]=e.target.value;pintarCuerpo();}
  });

  NS.pestanas.push({clave:'ventas',titulo:'Órdenes de ventas',orden:3,pintar:pintarVentas,actualizar:()=>{if(NS.estado&&NS.estado.tab==='ventas'&&!document.querySelector('#ov-barra :focus'))pintarCuerpo();}});
})();
