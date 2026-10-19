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
    let resultado=null;
    await db.runTransaction(async tx=>{
      const snap=await tx.get(REF());
      const d=snap.exists?snap.data():{};
      const actuales=Array.isArray(d.ordenesVenta)?d.ordenesVenta.map(o=>Object.assign({},o)):[];
      const r=fn(actuales);
      resultado=r&&r.resultado;
      const nuevo=Object.assign({},d,{ordenesVenta:(r&&r.lista)||actuales,updatedAt:Date.now()});
      if(cfg)nuevo.ordenesVentaConfig=Object.assign({},d.ordenesVentaConfig||{},cfg);
      tx.set(REF(),nuevo);
    });
    return resultado;
  }

  async function guardarOrden(o){
    const ahora=ahoraMs();
    await mutar(lista=>{
      const errores=N.validarOrden(o,{existentes:lista});
      if(errores.length)throw new Error(errores.join(' '));
      const i=o.id?lista.findIndex(x=>x.id===o.id):-1;
      const base={numero:String(o.numero).trim(),cliente:String(o.cliente).trim(),marca:o.marca,presentacion:o.presentacion,linea:o.linea||'',cantidad:num(o.cantidad),
        fechaEntrega:o.fechaEntrega,fechaPedido:o.fechaPedido||'',observaciones:String(o.observaciones||'').trim()};
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
  function previsualizar(filas,opc){return N.importarFilas(filas,ordenes,Object.assign({mapa:config.mapeo,usuario:quien(),ahora:ahoraMs(),hoy:NS.hoyOperativo()},opc));}
  async function aplicarFuente(filas,opc){
    const ahora=ahoraMs();
    return mutar(lista=>{
      const r=N.importarFilas(filas,lista,Object.assign({mapa:config.mapeo,usuario:quien(),ahora,hoy:NS.hoyOperativo()},opc));
      if(r.faltanColumnas.length)throw new Error('Faltan columnas: '+r.faltanColumnas.join(', ')+'.');
      return {lista:N.aplicarImportacion(lista,r,{ahora,usuario:quien()}),resultado:r};
    });
  }
  async function guardarMapeo(mapeo){
    await mutar(lista=>({lista}),{mapeo,actualizadoPor:quien(),actualizadoEn:ahoraMs()});
  }

  /* ---------- Google Sheets: preparado, sin conectar ---------- */
  const fuentes={sheets:{etiqueta:'Google Sheets',disponible:false,
    sincronizar:async function(){
      if(!this.disponible||typeof this.obtenerFilas!=='function')throw new Error('Todavía no está conectado a Google Sheets.');
      const filas=await this.obtenerFilas();
      return aplicarFuente(filas,{origen:'sheets',retirarAusentes:true});
    }}};
  NS.ventas={ordenes:()=>ordenes.slice(),config:()=>Object.assign({},config),listo:()=>listo,guardarOrden,cambiarEstado,previsualizar,aplicarFuente,guardarMapeo,fuentes,
    cobertura:()=>cobertura(),COLUMNAS:N.COLUMNAS,leerCSV:t=>leerCSV(t),
    __poner:(lista,cfg)=>{ordenes=lista||[];config=cfg||{};listo=true;}};   // para pruebas en el navegador

  /* ---------- cobertura con los datos reales ---------- */
  function producidoDe(p){
    try{if(typeof window.glacialProducidoVigente==='function'){const v=window.glacialProducidoVigente(p);return v==null?0:num(v);}}catch(_){/* sin producción */}
    return 0;
  }
  function cobertura(){return N.coberturaOrdenes(ordenes,NS.programaciones(),{hoy:NS.hoyOperativo(),producidoDe});}

  /* ---------- pantalla ---------- */
  const F={estado:'abiertas',cliente:'',linea:'',hasta:''};
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
      const st=N.estadoOrden(o,cob.get(o.id),hoy);
      const e=F.estado;
      if(e==='abiertas'&&st.cerrada)return false;
      if(e==='atrasadas'&&st.clave!=='ATRASADA')return false;
      if(e==='sinprogramar'&&st.clave!=='SIN_PROGRAMAR')return false;
      if(e==='parcial'&&st.clave!=='PARCIAL')return false;
      if(e==='enproduccion'&&st.clave!=='EN_PRODUCCION')return false;
      if(e==='completas'&&st.clave!=='COMPLETA')return false;
      if(e==='cerradas'&&!['CANCELADA','RETIRADA'].includes(st.clave))return false;
      if(F.cliente&&o.cliente!==F.cliente)return false;
      if(F.linea&&o.linea&&o.linea!==F.linea)return false;
      if(F.hasta&&o.fechaEntrega>F.hasta)return false;
      return true;
    });
  }

  function pintarVentas(cont){
    estilos();
    const planifica=NS.puede();
    const clientes=[...new Set(ordenes.map(o=>o.cliente).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    cont.innerHTML='<div class="plan-bar" id="ov-barra">'+
      '<label>Estado<select id="ov-estado">'+[['abiertas','Abiertas'],['atrasadas','Atrasadas'],['sinprogramar','Sin programar'],['parcial','Programadas en parte'],['enproduccion','En producción'],['completas','Completas'],['cerradas','Canceladas / retiradas'],['todas','Todas']]
        .map(([v,t])=>'<option value="'+v+'"'+(F.estado===v?' selected':'')+'>'+t+'</option>').join('')+'</select></label>'+
      '<label>Cliente<select id="ov-cliente"><option value="">Todos</option>'+clientes.map(c=>'<option'+(F.cliente===c?' selected':'')+' value="'+esc(c)+'">'+esc(c)+'</option>').join('')+'</select></label>'+
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
    const hoy=NS.hoyOperativo(),cob=cobertura(),r=N.resumenOrdenes(ordenes,cob,hoy);
    const pct=(a,b)=>b>0?(a/b*100).toFixed(1).replace('.',',')+' % de lo pedido':'';
    kp.innerHTML='<div class="ov-kpis">'+
      '<div class="ov-k" style="--c:#005b96"><span>Órdenes abiertas</span><b>'+fmt(r.abiertas)+'</b><small>'+(r.porVencer?r.porVencer+' por vencer en 3 días':'sin entregas próximas')+'</small></div>'+
      '<div class="ov-k"><span>Unidades pedidas</span><b>'+fmt(r.pedidas)+'</b></div>'+
      '<div class="ov-k" style="--c:#2f6690"><span>Programado</span><b>'+fmt(r.programado)+'</b><small>'+pct(r.programado,r.pedidas)+'</small></div>'+
      '<div class="ov-k" style="--c:#3f8f5f"><span>Producido</span><b>'+fmt(r.producido)+'</b><small>'+pct(r.producido,r.pedidas)+'</small></div>'+
      '<div class="ov-k" style="--c:#df8b00"><span>Falta programar</span><b>'+fmt(r.falta)+'</b><small>'+r.sinCubrir+(r.sinCubrir===1?' orden sin cubrir':' órdenes sin cubrir')+'</small></div>'+
      '<div class="ov-k" style="--c:#c4472b"><span>Atrasadas</span><b>'+fmt(r.atrasadas)+'</b><small>entrega vencida</small></div></div>';
    const filas=filtrar(ordenes,cob,hoy).sort((a,b)=>{
      const ca=N.estadoOrden(a,cob.get(a.id),hoy).cerrada,cb=N.estadoOrden(b,cob.get(b.id),hoy).cerrada;
      return (ca-cb)||String(a.fechaEntrega).localeCompare(String(b.fechaEntrega))||String(a.numero).localeCompare(String(b.numero));
    });
    if(!ordenes.length){
      tb.innerHTML='<div class="empty-state"><h4>Todavía no hay órdenes de ventas</h4><p>'+(NS.puede()?'Registra la primera con «+ Nueva orden» o carga un Excel/CSV con «Importar». Más adelante se conectarán desde Google Sheets.':'Aún no se registró ninguna.')+'</p></div>';
      return;
    }
    tb.innerHTML='<div class="plan-scroll"><table class="plan-tabla"><thead><tr><th>N.º orden</th><th>Cliente</th><th>Producto</th><th class="num">Pedido (UND)</th><th>Entrega</th><th>Programado · Producido</th><th class="num">Falta programar</th><th>Estado</th></tr></thead><tbody>'+
      (filas.length?filas.map(o=>{
        const c=cob.get(o.id),st=N.estadoOrden(o,c,hoy),ped=num(o.cantidad);
        const prog=c?Math.min(100,c.programado/ped*100):0,prod=c?Math.min(100,c.producido/ped*100):0;
        return '<tr class="ov-fila'+(st.cerrada&&st.clave!=='COMPLETA'?' ov-cerrada':'')+'" data-ov-ver="'+esc(o.id)+'"><td><b>'+esc(o.numero)+'</b></td><td>'+esc(o.cliente)+'</td><td>'+etiquetaProducto(o)+(o.linea?'<br><small>'+esc(NS.nombreLinea(o.linea))+'</small>':'')+'</td>'+
          '<td class="num">'+fmt(ped)+'</td><td>'+textoEntrega(o,st)+'</td>'+
          '<td>'+(c?'<div class="ov-barra" title="Programado '+fmt(c.programado)+' · Producido '+fmt(c.producido)+'"><i class="p" style="width:'+prog.toFixed(1)+'%"></i><i class="q" style="width:'+prod.toFixed(1)+'%"></i></div><div class="ov-leyenda">'+fmt(c.programado)+' prog. · '+fmt(c.producido)+' prod. ('+(ped>0?Math.round(c.producido/ped*100):0)+' %)</div>':'—')+'</td>'+
          '<td class="num">'+(c&&c.falta>0?'<span class="ov-falta">'+fmt(c.falta)+'</span>':(c?'0':'—'))+'</td><td><span class="ov-chip '+st.nivel+'">'+esc(st.etiqueta)+'</span></td></tr>';
      }).join(''):'<tr><td colspan="8">Ninguna orden coincide con los filtros.</td></tr>')+'</tbody></table></div>'+
      '<p class="plan-nota">Barra clara = programado · barra oscura = producido. Cada orden se cubre con lo programado de su producto, por fecha de entrega (la más urgente primero). No se modifica ninguna programación.</p>';
  }

  /* ---------- conexión con Google Sheets (preparada) ---------- */
  function pintarSheets(){
    const cont=document.getElementById('ov-sheets');
    if(!cont)return;
    const mapeo=config.mapeo||{},planifica=NS.puede();
    cont.innerHTML='<details class="ov-sheets"><summary style="cursor:pointer;font-weight:700;color:#003b5c;margin:10px 0 4px">Conexión con Google Sheets <span class="ov-chip gris">Preparada · sin conectar</span></summary>'+
      '<p class="plan-nota">Hoy se usa al <b>importar Excel/CSV</b>; la misma lógica servirá para la hoja. Escribe el encabezado exacto de cada columna de tu hoja (si lo dejas vacío se reconoce por el nombre habitual: «Pedido», «Razón social», «Formato», «Entrega»…).</p>'+
      '<div class="plan-scroll"><table><thead><tr><th>Dato del sistema</th><th>Encabezado en la hoja</th></tr></thead><tbody>'+
      N.COLUMNAS.map(c=>'<tr><td>'+esc(c.etq)+'</td><td><input data-ov-map="'+c.clave+'" value="'+esc(mapeo[c.clave]||'')+'" placeholder="automático"'+(planifica?'':' disabled')+'></td></tr>').join('')+'</tbody></table></div>'+
      '<ul class="plan-nota"><li>Si el N.º ya existe, la orden se <b>actualiza</b> (no se duplica).</li><li>Si una orden desaparece de la hoja, se marca <b>«Retirada»</b>; no se borra.</li><li>Las órdenes creadas a mano nunca se retiran por una sincronización.</li></ul>'+
      (planifica?'<p><button type="button" class="btn btn-ghost btn-sm" data-ov-guardar-mapa>Guardar columnas</button> <span class="plan-error" id="ov-mapa-error" style="display:inline"></span></p>':'')+'</details>';
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
    const b=x||{numero:'',cliente:'',marca:'',presentacion:'',linea:'',cantidad:'',fechaEntrega:'',fechaPedido:NS.hoyOperativo(),observaciones:''};
    const clientes=[...new Set(ordenes.map(o=>o.cliente).filter(Boolean))];
    const fondo=NS.abrirDialogo('<h3>'+(x?'Editar orden '+esc(x.numero):'Nueva orden de venta')+'</h3><div class="plan-campos">'+
      '<label>N.º de orden<input id="ov-numero" value="'+esc(b.numero)+'" maxlength="40"></label>'+
      '<label>Cliente<input id="ov-cli" list="ov-clientes" value="'+esc(b.cliente)+'" maxlength="80"><datalist id="ov-clientes">'+clientes.map(c=>'<option value="'+esc(c)+'">').join('')+'</datalist></label>'+
      '<label>Línea (opcional)<select id="ov-lin"><option value="">Cualquiera</option>'+lineasDe().map(l=>'<option value="'+esc(l.key)+'"'+(l.key===b.linea?' selected':'')+'>'+esc(l.name)+'</option>').join('')+'</select></label>'+
      '<label>Marca<select id="ov-marca"></select></label>'+
      '<label class="completo">Presentación<select id="ov-pres"></select></label>'+
      '<label>Cantidad (UND)<input type="number" id="ov-cant" min="1" step="1" value="'+esc(b.cantidad)+'"></label>'+
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
          cantidad:q('ov-cant').value,fechaEntrega:q('ov-entrega').value,fechaPedido:q('ov-pedido').value,observaciones:q('ov-obs').value});
        fondo.remove();
      }catch(e){q('ov-error').textContent=(e&&e.message)||String(e);q('ov-guardar').disabled=false;}
    };
  }

  function dialogoDetalle(id){
    const o=ordenes.find(x=>x.id===id);
    if(!o)return;
    const hoy=NS.hoyOperativo(),c=cobertura().get(o.id),st=N.estadoOrden(o,c,hoy),planifica=NS.puede();
    const li=(a,b)=>'<div class="li"><span>'+a+'</span><b>'+b+'</b></div>';
    const fondo=NS.abrirDialogo('<div class="ov-det"><h3 style="display:flex;justify-content:space-between;gap:10px;align-items:center">Orden '+esc(o.numero)+' <span class="ov-chip '+st.nivel+'">'+esc(st.etiqueta)+'</span></h3>'+
      li('Cliente',esc(o.cliente))+li('Producto',etiquetaProducto(o)+(o.linea?' · '+esc(NS.nombreLinea(o.linea)):''))+li('Pedido',fmt(o.cantidad)+' UND')+li('Entrega',textoEntrega(o,st))+
      (c?li('Programado · Producido',fmt(c.programado)+' · '+fmt(c.producido)+' UND')+li('Falta programar','<span class="'+(c.falta>0?'ov-falta':'')+'">'+fmt(c.falta)+' UND</span>'):'')+
      (c&&c.detalle.length?'<h4 style="margin:14px 0 4px;color:#003b5c">Programaciones que la cubren</h4>'+c.detalle.map(d=>'<div class="li"><span>'+esc(NS.nombreLinea(d.linea))+' · '+esc(d.fecha)+' · '+esc(NS.etiquetaBloque(d.turno))+'</span><span><b>'+fmt(d.cantidad)+' UND</b> <button type="button" class="btn btn-ghost btn-sm" data-ov-ir="'+esc(d.fecha)+'|'+esc(d.turno)+'">Ver</button></span></div>').join(''):'')+
      (o.observaciones?li('Observaciones',esc(o.observaciones)):'')+
      li('Origen',esc(o.origen==='manual'?'Manual':o.origen==='sheets'?'Google Sheets':'Excel / CSV')+(o.idExterno?' · '+esc(o.idExterno):''))+
      li('Última actualización',esc(o.actualizadoPor||'—')+(o.actualizadoEn?' · '+new Date(o.actualizadoEn).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):''))+'</div>'+
      '<div class="plan-acciones">'+(planifica?
        '<button type="button" class="btn btn-ghost" data-ov-irprog>Ir a programar</button>'+
        '<button type="button" class="btn btn-ghost" data-ov-editar="'+esc(o.id)+'">Editar</button>'+
        (st.clave==='CANCELADA'||st.clave==='RETIRADA'?'<button type="button" class="btn btn-ghost" data-ov-estado="ABIERTA|'+esc(o.id)+'">Reabrir</button>':(st.clave==='COMPLETA'?'':'<button type="button" class="btn btn-ghost" data-ov-estado="CANCELADA|'+esc(o.id)+'">Cancelar orden</button>')):'')+
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

  /* Importar Excel / CSV */
  function dialogoImportar(){
    if(!NS.puede())return;
    const fondo=NS.abrirDialogo('<h3>Importar órdenes de ventas</h3><p class="plan-nota">Sube un Excel o CSV con una fila por orden. Si el N.º ya existe se actualiza; si es nuevo se crea.</p>'+
      '<p><input type="file" id="ovi-archivo" accept=".xlsx,.xls,.csv"> <button type="button" class="btn btn-ghost btn-sm" data-ovi-plantilla>Descargar plantilla</button></p>'+
      '<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" id="ovi-retirar"> Marcar como «retiradas» las órdenes importadas antes que ya no están en este archivo</label>'+
      '<div id="ovi-vista"></div><div class="plan-error" id="ovi-error"></div>'+
      '<div class="plan-acciones"><button type="button" class="btn btn-ghost" id="ovi-cancelar">Cancelar</button><button type="button" class="btn btn-primary" id="ovi-aplicar" disabled>Importar</button></div>',true);
    const q=i=>fondo.querySelector('#'+i);
    let filas=null,origen='excel';
    const vista=()=>{
      if(!filas){q('ovi-vista').innerHTML='';q('ovi-aplicar').disabled=true;return;}
      const r=previsualizar(filas,{origen,retirarAusentes:q('ovi-retirar').checked});
      if(r.faltanColumnas.length){q('ovi-vista').innerHTML='<div class="plan-aviso">Faltan columnas obligatorias: <b>'+esc(r.faltanColumnas.join(', '))+'</b>. Revisa los encabezados o descarga la plantilla.</div>';q('ovi-aplicar').disabled=true;return;}
      q('ovi-vista').innerHTML='<div class="ov-vista"><b>Vista previa</b><ul><li>'+r.crear.length+' orden(es) nueva(s)</li><li>'+r.actualizar.length+' por actualizar</li><li>'+r.sinCambio+' sin cambios</li>'+(r.retirar.length?'<li>'+r.retirar.length+' por marcar como retirada(s)</li>':'')+
        (r.errores.length?'<li style="color:#991b1b">'+r.errores.length+' con error (no se importan): '+r.errores.slice(0,6).map(x=>'fila '+x.fila+' · '+esc(x.mensaje)).join(' | ')+(r.errores.length>6?' …':'')+'</li>':'')+'</ul></div>';
      q('ovi-aplicar').disabled=!(r.crear.length||r.actualizar.length||r.retirar.length);
    };
    q('ovi-archivo').onchange=async e=>{
      q('ovi-error').textContent='';filas=null;
      const f=e.target.files&&e.target.files[0];if(!f){vista();return;}
      try{
        origen=/\.csv$/i.test(f.name)?'csv':'excel';
        if(origen==='csv')filas=leerCSV(await f.text());
        else{
          if(typeof XLSX==='undefined'||!XLSX.read)throw new Error('No se cargó la librería de Excel.');
          const libro=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});
          filas=XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]],{defval:'',raw:true});
        }
        if(!filas.length)throw new Error('El archivo no tiene filas.');
      }catch(err){q('ovi-error').textContent=(err&&err.message)||String(err);filas=null;}
      vista();
    };
    q('ovi-retirar').onchange=vista;
    q('ovi-cancelar').onclick=()=>fondo.remove();
    fondo.addEventListener('click',e=>{
      if(!e.target.closest('[data-ovi-plantilla]')||typeof XLSX==='undefined')return;
      const ejemplo=[N.COLUMNAS.filter(c=>c.obligatoria).map(c=>c.etq),['OV-2610-001','Cliente de ejemplo','Bells','625 ML PACK X 15 UND',12000,'2026-10-30']];
      const libro=XLSX.utils.book_new();XLSX.utils.book_append_sheet(libro,XLSX.utils.aoa_to_sheet(ejemplo),'Órdenes');XLSX.writeFile(libro,'plantilla-ordenes-de-venta.xlsx');
    });
    q('ovi-aplicar').onclick=async()=>{
      q('ovi-aplicar').disabled=true;q('ovi-error').textContent='';
      try{const r=await aplicarFuente(filas,{origen,retirarAusentes:q('ovi-retirar').checked});fondo.remove();alert('Importación lista: '+r.crear.length+' nueva(s), '+r.actualizar.length+' actualizada(s)'+(r.retirar.length?', '+r.retirar.length+' retirada(s)':'')+(r.errores.length?'. '+r.errores.length+' fila(s) con error no se importaron.':'.'));}
      catch(err){q('ovi-error').textContent=(err&&err.message)||String(err);q('ovi-aplicar').disabled=false;}
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
    if(e.target.closest('[data-ov-guardar-mapa]')){
      const mapeo={};raiz.querySelectorAll('[data-ov-map]').forEach(i=>{const v=i.value.trim();if(v)mapeo[i.getAttribute('data-ov-map')]=v;});
      const er=document.getElementById('ov-mapa-error');if(er)er.textContent='';
      try{await guardarMapeo(mapeo);alert('Columnas guardadas.');pintarSheets();}catch(err){if(er)er.textContent=(err&&err.message)||String(err);}
    }
  });
  document.addEventListener('change',e=>{
    if(!e.target||!e.target.closest||!e.target.closest('#plan-root')||!NS.estado||NS.estado.tab!=='ventas')return;
    const mapa={'ov-estado':'estado','ov-cliente':'cliente','ov-linea':'linea','ov-hasta':'hasta'};
    if(mapa[e.target.id]){F[mapa[e.target.id]]=e.target.value;pintarCuerpo();}
  });

  NS.pestanas.push({clave:'ventas',titulo:'Órdenes de ventas',orden:3,pintar:pintarVentas,actualizar:()=>{if(NS.estado&&NS.estado.tab==='ventas'&&!document.querySelector('#ov-barra :focus'))pintarCuerpo();}});
})();
