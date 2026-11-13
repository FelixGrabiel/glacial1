/* =============================================================
   GLACIAL · TRAZABILIDAD DE LOTES — PANTALLA: pestaña «Lotes» del Asistente de Producción y el diálogo «Confirmar y crear lote»
   -------------------------------------------------------------
   · Lotes: lista con buscador (lote del proveedor, ID LI-, producto, OI) y filtros por estado, categoría y línea; al elegir un lote, su FICHA con los datos
     de la etiqueta, las unidades (caja/bobina) con su estado, el enlace a la foto de origen y la LÍNEA DE TIEMPO de movimientos.
   · «Confirmar y crear lote» (desde Evidencias): sugiere el artículo del catálogo del Inventario (recuerda la elección), avisa si la unidad ya existe, muestra la
     leyenda con que llegó la foto y, en una sola transacción, aprueba los datos y crea el lote, la unidad y el movimiento.
   · Tiempo real: lo que otra persona cree o cambie aparece solo (sin pisar lo que se está escribiendo). Celular primero (360 px): listas y fichas en columna.
   · NO mueve stock SAP. Entrega a línea, uso en cuadro y cierre por peso llegan en la Etapa 2.
   Vive en el ASISTENTE DE PRODUCCIÓN (72-asistente-pantalla.js llama a window.iiLotesUI.usar({pintar, activo})). Cargar DESPUÉS de 88-trazabilidad-lotes-datos.js.
   ============================================================= */
(function instalarTrazabilidadPantalla(){
  'use strict';
  const T=window.glacialTrazabilidadNucleo,Z=window.glacialTrazabilidadDatos,N=window.glacialEvidenciasNucleo,EV=window.glacialEvidenciasDatos;
  if(!T||!Z||!N||!EV)return;
  const esc=v=>typeof escaparHtml==='function'?escaparHtml(String(v==null?'':v)):String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const raiz=()=>document.getElementById('modal-root');
  let host={pintar:()=>{},activo:()=>false};
  const repintar=()=>host.pintar();
  const S={sel:'',texto:'',estado:'',categoria:'',linea:'',msg:null,crear:null,vista:'lotes'};
  const PILL={EN_ALMACEN:'ii-p-verde',ENTREGADA_LINEA:'ii-p-azul',EN_USO:'ii-p-naranja',CONSUMIDA:'ii-p-gris',OBSERVADA:'ii-p-rojo',DEVUELTA_PROVEEDOR:'ii-p-gris'};
  const pill=e=>`<span class="ii-pill ${PILL[e]||'ii-p-gris'}"><i></i>${esc(T.ESTADOS[e]||e)}</span>`;
  const hora=ms=>{if(!ms)return '';const d=new Date(Number(ms)-5*3600000),p=n=>String(n).padStart(2,'0');return p(d.getUTCDate())+'/'+p(d.getUTCMonth()+1)+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes());};
  const fecha=iso=>N.fechaPantalla(iso||'');
  const kg=n=>n===null||n===undefined||n===''?'—':(Math.round(Number(n)*1000)/1000).toLocaleString('es-PE',{maximumFractionDigits:3})+' kg';
  const aviso=(tipo,texto)=>{S.msg={tipo,texto};};
  const loteActual=()=>Z.porId(S.sel);
  const fotos=()=>window.glacialFotos||null;
  /* ---------- fechas: cuándo se ENVIÓ la foto (vale para la trazabilidad) y cuándo se validó/registró ---------- */
  /* Unidades y movimientos creados antes de este cambio no guardan la fecha de la foto: se toma de su evidencia. */
  const fotoEvidencia=id=>{const ev=id&&EV.porId(id);return ev?N.fechaFoto(ev):{ms:null,origen:''};};
  const fotoUnidad=u=>Number(u&&u.recibidaEn)>0?{ms:Number(u.recibidaEn),origen:u.recibidaOrigen||'whatsapp'}:(fotoEvidencia(u&&u.evidenciaId).ms?fotoEvidencia(u.evidenciaId):{ms:Number(u&&u.creadoEn)||null,origen:'importacion'});
  function fotoLote(l){
    const us=T.unidadesDeLote(l,Z.cache.unidades).map(fotoUnidad).filter(f=>f.ms);
    if(us.length)return us.reduce((a,b)=>b.ms<a.ms?b:a);
    return Number(l&&l.recibidoEn)>0?{ms:Number(l.recibidoEn),origen:'whatsapp'}:{ms:Number(l&&l.creadoEn)||null,origen:'importacion'};
  }
  /* El movimiento que nació de la foto (recepción o entrega por leyenda) ocurrió cuando se envió la foto. */
  function ocurridoMov(m){
    if(Number(m.ocurridoEnMs)>0)return {ms:Number(m.ocurridoEnMs),deFoto:true};
    if(m.evidenciaId&&m.id==='MOV-'+String(m.evidenciaId).slice(0,64)+'-'+m.tipo){const f=fotoEvidencia(m.evidenciaId);if(f.ms)return {ms:f.ms,deFoto:true};}
    return {ms:Number(m.enMs)||0,deFoto:false};
  }
  const notaOrigen=o=>o&&o!=='whatsapp'?` <small class="ii-mut">(según ${esc(N.ORIGEN_FECHA_FOTO[o]||o)})</small>`:'';
  const fmtCant=n=>(Math.round(Number(n)*1000)/1000).toLocaleString('es-PE',{maximumFractionDigits:3});

  /* ---------- lista ---------- */
  /* Vencimiento del lote: «Vencido» (rojo) o «Vence en N días» (naranja, solo si hay umbral definido). */
  function chipVence(l){
    const v=T.estadoVencimiento(l.fechaVencimiento,hoyIso(),Z.cache.parametros.diasAvisoVencimiento);
    return v.tipo==='vencido'?`<span class="ii-pill ii-p-rojo"><i></i>Vencido hace ${Math.abs(v.dias)} d</span>`:v.tipo==='por_vencer'?`<span class="ii-pill ii-p-naranja"><i></i>Vence en ${v.dias} d</span>`:'';
  }
  function itemLista(l){
    const r=T.resumenLote(l,Z.cache.unidades);
    const est=Object.entries(r.porEstado).filter(([,n])=>n).map(([k,n])=>`${n} ${T.ESTADOS[k].toLowerCase()}`).join(' · ');
    const uf=T.unidadFisica(l.categoria);
    return `<button type="button" class="ie-item ${l.id===S.sel?'ie-item-act':''}" onclick="ilSel('${esc(l.id)}')"><span class="ie-it-t"><b>${esc(l.producto)}</b><span class="ii-pill ii-p-azul"><i></i>${esc(l.id)}</span></span>
      <small>${esc(l.proveedor)} · lote ${esc(l.loteProveedor)}</small><small>${r.total} ${esc(r.total===1?uf.uno:uf.varios)}${est?' · '+esc(est):''} · foto ${esc(hora(fotoLote(l).ms))}</small>${chipVence(l)?`<small>${chipVence(l)}</small>`:''}</button>`;
  }
  function filtros(){
    const opt=(lista,valor,todos)=>`<option value="">${todos}</option>`+lista.map(([v,t])=>`<option value="${esc(v)}" ${v===valor?'selected':''}>${esc(t)}</option>`).join('');
    return `<label class="ii-campo"><span>Buscar</span><input type="search" id="il-texto" value="${esc(S.texto)}" placeholder="Lote del proveedor, LI-…, producto u OI" oninput="ilTexto(this.value)" autocomplete="off"></label>
      <div class="il-filtros"><label class="ii-campo"><span>Estado</span><select onchange="ilFiltro('estado',this.value)">${opt(Object.entries(T.ESTADOS),S.estado,'Todos')}</select></label>
      <label class="ii-campo"><span>Categoría</span><select onchange="ilFiltro('categoria',this.value)">${opt(N.CATEGORIAS.filter(c=>c!=='otro').map(c=>[c,c]),S.categoria,'Todas')}</select></label>
      <label class="ii-campo"><span>Línea</span><select onchange="ilFiltro('linea',this.value)">${opt(T.LINEAS.map(c=>[c,c]),S.linea,'Todas')}</select></label></div>`;
  }
  const listaVisible=()=>T.filtrarLotes(Z.cache.lotes,Z.cache.unidades,{texto:S.texto,estado:S.estado,categoria:S.categoria,linea:S.linea});
  function listaHtml(){
    const todos=Z.cache.lotes,lista=listaVisible();
    return lista.map(itemLista).join('')||`<p class="ii-vacio">${todos.length?'Ningún lote coincide con el filtro.':(Z.cache.listo.lotes?'Aún no hay lotes. Se crean desde Evidencias con «Confirmar y crear lote».':'Consultando…')}</p>`;
  }

  /* ---------- ficha ---------- */
  function fila(t,v){return `<tr><th scope="row">${esc(t)}</th><td>${v===''||v===null||v===undefined?'<span class="ii-mut">—</span>':v}</td></tr>`;}
  function fotoDe(u){
    const ev=EV.porId(u.evidenciaId),F=fotos();
    if(!ev||!ev.foto||!ev.foto.url||!F)return '';
    return `<a class="ii-btn ii-btn-o ii-btn-s" ${F.atributosEnlace(ev.foto.url)} rel="noopener noreferrer">Ver foto</a> <button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="ilVerEvidencia('${esc(u.evidenciaId)}')">Evidencia</button>`;
  }
  /* Entregar a línea: solo la unidad que está en almacén y solo quien puede crear lotes. Con el lote vencido el botón no sirve (se explica). */
  /* T4: según el estado, los botones de la caja/bobina (Entregar, Observar, Liberar, Devolver al proveedor, Devolver a almacén). */
  function accionUnidad(u,l){
    if(!Z.puedeEscribir()||l.unidoEn)return '';
    const b=(txt,fn)=>`<button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="${fn}">${txt}</button>`;
    const id=esc(u.id);
    if(u.estado==='EN_ALMACEN'){
      const v=T.estadoVencimiento(l.fechaVencimiento,hoyIso(),Z.cache.parametros.diasAvisoVencimiento);
      return `<div class="il-acc-u">${v.tipo==='vencido'?'<span class="ii-mut" title="El lote está vencido">Vencido</span>':b('Entregar a línea',`ilAbrirEntrega('${id}')`)}${b('Observar',`ilAbrirMover('${id}','OBSERVAR')`)}</div>`;
    }
    if(u.estado==='OBSERVADA')return `<div class="il-acc-u">${b('Liberar',`ilAbrirMover('${id}','LIBERAR')`)}${b('Devolver al proveedor',`ilAbrirMover('${id}','DEVOLUCION_PROVEEDOR')`)}</div>`;
    if(u.estado==='ENTREGADA_LINEA')return `<div class="il-acc-u">${b('Devolver a almacén',`ilAbrirMover('${id}','RETORNO_ALMACEN')`)}</div>`;
    return '';
  }
  const hoyIso=()=>{const t=typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
    if(typeof GlacialFecha!=='undefined'&&GlacialFecha.fechaISOLocal)return GlacialFecha.fechaISOLocal(t);
    const d=new Date(t-5*3600000),p=n=>String(n).padStart(2,'0');return d.getUTCFullYear()+'-'+p(d.getUTCMonth()+1)+'-'+p(d.getUTCDate());};                        // respaldo: fecha de Perú (UTC-5), así un lote vencido nunca se ofrece
  function fichaHtml(){
    const l=loteActual();
    if(!l)return '<div class="ii-card ie-vacio-det"><p class="ii-mut">Elige un lote de la lista para ver sus datos, sus unidades y su línea de tiempo.</p></div>';
    const us=T.unidadesDeLote(l,Z.cache.unidades),r=T.resumenLote(l,Z.cache.unidades),uf=T.unidadFisica(l.categoria),fl=fotoLote(l);
    const contenido=T.contenidoLote(us);
    const tl=Z.cache.movimientos.filter(m=>m.loteId===l.id).map(m=>({m,o:ocurridoMov(m)})).sort((a,b)=>b.o.ms-a.o.ms||String(b.m.id).localeCompare(String(a.m.id)));
    const unidades=us.map(u=>{const f=fotoUnidad(u);return `<tr><td data-t="N.º ${esc(uf.uno)}"><b>${esc(uf.titulo)} ${esc(u.numero)}</b><small class="ii-mut">${esc(u.id)}</small></td><td data-t="Estado">${pill(u.estado)}</td>
      <td data-t="Línea">${esc(u.linea)||'<span class="ii-mut">—</span>'}</td><td data-t="Foto enviada">${esc(hora(f.ms))||'—'}</td><td data-t="Peso neto">${kg(u.pesoNeto)}</td><td data-t="Peso actual">${kg(u.pesoActual)}</td>
      <td data-t="Contenido (etiqueta)">${u.cantidad===null||u.cantidad===undefined||u.cantidad===''?'—':esc(fmtCant(u.cantidad))+' '+esc(u.unidadCantidad||'')}</td><td data-t="Origen">${fotoDe(u)}</td><td data-t="Acción">${accionUnidad(u,l)}</td></tr>`;}).join('');
    const hist=tl.map(({m,o})=>`<li><b>${esc(hora(o.ms))}</b>${o.deFoto?' <span class="ii-mut">(foto)</span>':''} · ${esc(m.unidadId)} · ${esc(T.textoMovimiento(m))} <span class="ii-mut">— ${esc(m.por||'—')}${o.deFoto&&Math.abs(Number(m.enMs)-o.ms)>60000?' · registrado '+esc(hora(m.enMs)):''}</span></li>`).join('');
    const corregir=Z.puedeEscribir()&&!l.unidoEn;
    const cambiarArt=corregir?` <button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="ilAbrirArticulo('${esc(l.id)}')">${l.itemNombre?'Cambiar':'Asignar artículo'}</button>`:'';
    const cambiarCat=corregir?` <button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="ilAbrirCategoria('${esc(l.id)}')">Cambiar categoría</button>`:'';
    const unido=l.unidoEn?`<div class="ii-msg ii-msg-error" role="note">Este lote <b>se unió al ${esc(l.unidoEn)}</b> (era el mismo lote del proveedor). Sus ${esc(T.unidadFisica(l.categoria).varios)} están ahora en ese lote. <button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="ilSel('${esc(l.unidoEn)}')">Ver ${esc(l.unidoEn)}</button></div>`:'';
    const dups=l.unidoEn?[]:T.posiblesDuplicados({loteProveedor:l.loteProveedor,producto:l.producto,categoria:l.categoria,clave:l.clave},Z.cache.lotes,{excepto:l.id});
    const dupFicha=dups.length?`<div class="ii-msg ii-msg-error" role="note"><b>Posible lote repetido:</b> ${dups.map(x=>`<button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="ilSel('${esc(x.id)}')">${esc(x.id)}</button>`).join(' ')} ${dups.length===1?'tiene':'tienen'} el mismo lote del proveedor (${esc(l.loteProveedor)}).${corregir?` <button type="button" class="ii-btn ii-btn-s" onclick="ilAbrirUnir('${esc(l.id)}')">Unir lotes…</button>`:''}</div>`:'';
    const unidos=Array.isArray(l.lotesUnidos)&&l.lotesUnidos.length?`<p class="ii-mut il-nota">Incluye los lotes unidos: ${l.lotesUnidos.map(x=>esc(x)).join(', ')}.</p>`:'';
    return `<div class="ii-card ie-det"><div class="ie-det-cab"><div><h3>${esc(l.producto)}</h3><p class="ii-mut">${esc(l.proveedor)} · lote del proveedor <b>${esc(l.loteProveedor)}</b></p></div><span class="ii-pill ii-p-azul"><i></i>${esc(l.id)}</span></div>
      ${unido}${dupFicha}
      <div class="ii-msg ii-msg-info" role="note">El lote es trazabilidad: <b>no mueve el stock SAP</b>. Cada cambio de una unidad queda como un movimiento que no se edita ni se borra.</div>
      <div class="il-cols"><div><h4 class="ie-g">Datos de la etiqueta</h4><table class="ie-t il-datos"><tbody>
        ${fila('Proveedor',esc(l.proveedor))}${fila('Producto',esc(l.producto))}${fila('Categoría',esc(l.categoria)+cambiarCat)}${fila('Lote del proveedor',esc(l.loteProveedor))}${fila('Orden interna (OI)',esc(l.ordenInterna))}${fila('Orden de compra',esc(l.ordenCompra))}
        ${fila('Fecha de producción',esc(fecha(l.fechaProduccion)))}${fila('Fecha de vencimiento',esc(fecha(l.fechaVencimiento))+(chipVence(l)?' '+chipVence(l):''))}${fila('Artículo del catálogo',(l.itemNombre?esc(l.itemNombre)+(l.itemCode?' <small class="ii-mut">('+esc(l.itemCode)+')</small>':''):'<span class="ii-mut">Sin artículo</span>')+cambiarArt)}
        ${fila('Foto enviada (recepción)',fl.ms?esc(hora(fl.ms))+notaOrigen(fl.origen):'')}
        ${fila('Validado y registrado',esc(hora(l.creadoEn))+' · '+esc(l.creadoPor||'—'))}</tbody></table>${unidos}
        ${corregir&&!dups.length?`<p class="il-nota"><button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="ilAbrirUnir('${esc(l.id)}')">Unir con otro lote…</button> <span class="ii-mut">si este lote está repetido</span></p>`:''}
        <p class="ii-mut il-nota">La trazabilidad usa la <b>fecha en que se envió la foto</b> (cuando llegó o se usó el insumo), no la de validación.</p></div>
        <div><h4 class="ie-g">Resumen</h4><div class="ii-resumen"><div><b>${r.total}</b><span>${esc(r.total===1?uf.uno:uf.varios)}</span></div>${contenido.map(c=>`<div><b>${esc(fmtCant(c.cantidad))}</b><span>${esc(c.unidad)} en total (etiqueta)</span></div>`).join('')}<div><b>${r.porEstado.EN_ALMACEN}</b><span>en almacén</span></div><div><b>${r.porEstado.ENTREGADA_LINEA+r.porEstado.EN_USO}</b><span>en línea</span></div><div><b>${esc(kg(r.pesoActualKg))}</b><span>peso actual</span></div></div>
          <p class="ii-mut il-nota">Cada foto es <b>una ${esc(uf.uno)}</b>. El n.º (p. ej. ${esc(uf.titulo)} ${esc((us[0]&&us[0].numero)||'01')}) lo asigna el sistema en orden de llegada (las de antes conservan el de su etiqueta); no es una cantidad. «Contenido» es lo que trae dentro según la etiqueta.</p></div></div>
      <h4 class="ie-g">${esc(uf.varios.charAt(0).toUpperCase()+uf.varios.slice(1))} del lote${corregir&&us.filter(u=>u.estado==='EN_ALMACEN').length>1?` <button type="button" class="ii-btn ii-btn-s" onclick="ilAbrirEntregaLote('${esc(l.id)}')">Entregar varias a línea…</button>`:''}</h4><div class="il-tabla-w"><table class="ie-t il-unidades"><thead><tr><th>N.º ${esc(uf.uno)}</th><th>Estado</th><th>Línea</th><th>Foto enviada</th><th>Peso neto</th><th>Peso actual</th><th>Contenido (etiqueta)</th><th>Origen</th><th>Acción</th></tr></thead><tbody>${unidades||'<tr><td colspan="9" class="ii-mut">Sin unidades.</td></tr>'}</tbody></table></div>
      <h4 class="ie-g">Línea de tiempo</h4>${Z.cache.listo.movimientos?(hist?`<ul class="il-tl">${hist}</ul>`:'<p class="ii-mut">Sin movimientos.</p>'):'<p class="ii-mut">Consultando…</p>'}</div>`;
  }

  /* ---------- «Entregar a líneas» (12/11/2026): la Asistente de Producción elige los lotes del almacén y decide a qué línea va cada caja/bobina ----------
     Reemplaza el «Tomar del almacén» que tenía el supervisor en el Registro de producción: el supervisor ahora solo ve y marca lo que ya se entregó a su línea.
     Por categoría (preformas, tapas, etiquetas, asas, bolsas, cajas, polietileno), los lotes con cajas/bobinas EN ALMACÉN, el que vence antes primero (FEFO),
     sin lotes unidos a otro; un lote vencido se ve pero no se elige. Se marcan cajas/bobinas (o el lote entero), se elige la línea y Z.entregarALinea las entrega
     en una transacción (si una no se puede, no se entrega ninguna). Debajo, lo que ya está en cada línea, con «Devolver a almacén» si se equivocó de línea. */
  const CATS_ENT=[['preformas','Preformas'],['tapas','Tapas'],['etiquetas','Etiquetas'],['asas','Asas'],['bolsas','Bolsas'],['cajas','Cajas'],['polietileno','Polietileno']];
  S.ent={linea:'',sel:new Set(),texto:''};
  const numOrden=(a,b)=>String(a.numero).localeCompare(String(b.numero),'es',{numeric:true});
  /* Puro: lotes con cajas/bobinas en un estado dado, agrupados por lote. */
  function agruparUnidades(lotes,unidades,filtro){
    const por=new Map();
    (unidades||[]).forEach(u=>{if(u&&filtro(u)){if(!por.has(u.loteId))por.set(u.loteId,[]);por.get(u.loteId).push(u);}});
    return (lotes||[]).filter(l=>l&&!l.unidoEn&&por.has(l.id)).map(l=>({lote:l,unidades:por.get(l.id).sort(numOrden)}));
  }
  function almacenPorCategoria(){
    const hoy=hoyIso(),dias=Z.cache.parametros.diasAvisoVencimiento,q=T.norm?T.norm(S.ent.texto||''):String(S.ent.texto||'').toUpperCase();
    const grupos=agruparUnidades(Z.cache.lotes,Z.cache.unidades,u=>u.estado==='EN_ALMACEN')
      .filter(g=>!q||[g.lote.loteProveedor,g.lote.id,g.lote.producto,g.lote.proveedor,g.lote.ordenInterna].some(v=>(T.norm?T.norm(String(v||'')):String(v||'').toUpperCase()).includes(q)))
      .map(g=>Object.assign(g,{venc:T.estadoVencimiento(g.lote.fechaVencimiento,hoy,dias)}))
      .sort((a,b)=>String(a.lote.fechaVencimiento||'9999').localeCompare(String(b.lote.fechaVencimiento||'9999'))||String(a.lote.loteProveedor).localeCompare(String(b.lote.loteProveedor)));
    return CATS_ENT.map(([c,t])=>({clave:c,titulo:t,lotes:grupos.filter(g=>String(g.lote.categoria||'').toLowerCase()===c)})).filter(x=>x.lotes.length);
  }
  /* Quita de la selección lo que ya no está en almacén (otra persona lo movió) o es de un lote vencido. */
  function selValida(){
    const ok=new Set();
    almacenPorCategoria().forEach(c=>c.lotes.forEach(g=>{if(g.venc.tipo!=='vencido')g.unidades.forEach(u=>ok.add(u.id));}));
    [...S.ent.sel].forEach(id=>{if(!ok.has(id))S.ent.sel.delete(id);});
    return S.ent.sel;
  }
  const textoBotonEnt=()=>{const n=S.ent.sel.size;return n?`Entregar ${n} ${n===1?'caja/bobina':'cajas/bobinas'}${S.ent.linea?' a '+S.ent.linea:''}`:'Marca cajas/bobinas para entregar';};
  function entregarHtml(){
    if(!Z.cache.listo.lotes||!Z.cache.listo.unidades)return '<div class="ii-card"><p class="ii-mut">Consultando el almacén…</p></div>';
    const puede=Z.puedeEscribir(),cats=almacenPorCategoria();selValida();
    const lineaSel=`<label class="ii-campo"><span>Línea a la que van</span><select id="il-ent-l" onchange="ilEntLinea(this.value)"><option value="">Elige la línea…</option>${T.LINEAS.map(x=>`<option value="${esc(x)}" ${x===S.ent.linea?'selected':''}>${esc(x)}</option>`).join('')}</select></label>`;
    const buscar=`<label class="ii-campo"><span>Buscar</span><input type="search" value="${esc(S.ent.texto)}" placeholder="Lote del proveedor, LI-…, producto u OI" oninput="ilEntTexto(this.value)" autocomplete="off"></label>`;
    const lotes=cats.map(c=>`<div class="il-ent-cat"><h4 class="ie-g">${esc(c.titulo)} <small class="ii-mut">(${c.lotes.length} lote${c.lotes.length===1?'':'s'})</small></h4>${c.lotes.map(g=>{
        const l=g.lote,uf=T.unidadFisica(l.categoria),venc=g.venc.tipo==='vencido',todas=!venc&&g.unidades.every(u=>S.ent.sel.has(u.id));
        const cab=`<b>${esc(l.loteProveedor)}</b> · ${esc(l.producto)} <small class="ii-mut">${esc(l.id)} · ${esc(l.proveedor||'')} · vence ${esc(fecha(l.fechaVencimiento)||'sin fecha')} · ${g.unidades.length} ${esc(g.unidades.length===1?uf.uno:uf.varios)} en almacén</small>`;
        return `<div class="il-ent-lote${venc?' il-ent-venc':''}">${puede&&!venc?`<label class="il-op"><input type="checkbox" data-ent-lote="${esc(l.id)}" ${todas?'checked':''} onchange="ilEntLote('${esc(l.id)}',this.checked)"><span>${cab}</span></label>`:`<div class="il-op"><span>${cab}</span></div>`}
          ${chipVence(l)?`<div>${chipVence(l)}${venc?' <small class="ii-mut">No se entrega a línea.</small>':''}</div>`:''}
          ${venc?'':`<div class="il-ent-us">${g.unidades.map(u=>puede?`<label class="il-op il-ent-u"><input type="checkbox" data-ent-u="${esc(u.id)}" data-lote="${esc(l.id)}" ${S.ent.sel.has(u.id)?'checked':''} onchange="ilEntU('${esc(u.id)}',this.checked)"><span>${esc(uf.titulo)} <b>${esc(u.numero)}</b><small class="ii-mut">${esc(kg(u.pesoActual))}${u.cantidad!=null&&u.cantidad!==''?' · '+esc(fmtCant(u.cantidad))+' '+esc(u.unidadCantidad||''):''}</small></span></label>`:`<div class="il-op il-ent-u"><span>${esc(uf.titulo)} <b>${esc(u.numero)}</b><small class="ii-mut">${esc(kg(u.pesoActual))}</small></span></div>`).join('')}</div>`}</div>`;
      }).join('')}</div>`).join('');
    /* Lo que ya está en cada línea (entregado o en uso), para ver el reparto y corregir una línea equivocada. */
    const enLinea=T.LINEAS.map(lin=>{
      const gs=agruparUnidades(Z.cache.lotes,Z.cache.unidades,u=>u.linea===lin&&(u.estado==='ENTREGADA_LINEA'||u.estado==='EN_USO'));
      if(!gs.length)return '';
      return `<div class="il-ent-lin"><h4 class="ie-g">${esc(lin)}</h4>${gs.map(g=>{const uf=T.unidadFisica(g.lote.categoria);
        return `<div class="il-ent-lote"><div><b>${esc(g.lote.loteProveedor)}</b> · ${esc(g.lote.producto)} <small class="ii-mut">${esc(g.lote.categoria)} · ${esc(g.lote.id)}</small></div><div class="il-ent-us">${g.unidades.map(u=>`<div class="il-op il-ent-u"><span>${esc(uf.titulo)} <b>${esc(u.numero)}</b> ${pill(u.estado)}</span>${puede&&u.estado==='ENTREGADA_LINEA'?`<button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="ilAbrirMover('${esc(u.id)}','RETORNO_ALMACEN')">Devolver a almacén</button>`:''}</div>`).join('')}</div></div>`;}).join('')}</div>`;
    }).join('');
    const barra=puede?`<div class="il-ent-barra">${lineaSel}<div class="ii-acc"><button type="button" class="ii-btn" id="il-ent-btn" ${S.ent.sel.size?'':'disabled'} onclick="ilEntregarSel()">${esc(textoBotonEnt())}</button></div></div>`:'';
    return `<div class="ii-card"><div class="ii-fila-t"><h3>Entregar a líneas</h3>${puede?'':'<span class="ii-chip">Solo consulta</span>'}</div>
      <p class="ii-mut">Elige los lotes del almacén y la línea a la que va cada caja/bobina. El supervisor de esa línea verá en el Registro de producción solo lo que entregues aquí y lo marcará en su producción («Marcar en uso» y «Registrar peso final»). No se mueve el stock SAP.</p>
      ${barra}<div class="il-ent-f">${buscar}</div>
      ${lotes||`<p class="ii-vacio">${S.ent.texto?'Ningún lote en almacén coincide con la búsqueda.':'No hay cajas/bobinas en almacén. Los lotes nacen de las fotos validadas en Evidencias.'}</p>`}</div>
      <div class="ii-card"><h3>En cada línea ahora</h3><p class="ii-mut">Entregadas y en uso. Si una caja/bobina fue a la línea equivocada y no se usó, «Devolver a almacén» y vuelve a entregarla.</p>${enLinea||'<p class="ii-mut">Ninguna línea tiene cajas/bobinas entregadas.</p>'}</div>`;
  }
  const refrescarBotonEnt=()=>{const b=document.getElementById('il-ent-btn');if(b){b.textContent=textoBotonEnt();b.disabled=!S.ent.sel.size;}};
  window.ilEntLinea=v=>{S.ent.linea=T.LINEAS.includes(v)?v:'';refrescarBotonEnt();};
  window.ilEntU=(id,on)=>{
    if(on)S.ent.sel.add(id);else S.ent.sel.delete(id);
    const c=document.querySelector(`[data-ent-u="${id}"]`),lote=c&&c.getAttribute('data-lote'),todo=lote&&document.querySelector(`[data-ent-lote="${lote}"]`);
    if(todo)todo.checked=[...document.querySelectorAll(`[data-lote="${lote}"]`)].every(x=>x.checked);
    refrescarBotonEnt();
  };
  window.ilEntLote=(loteId,on)=>{
    const l=Z.porId(loteId);if(!l)return;
    if(T.estadoVencimiento(l.fechaVencimiento,hoyIso(),Z.cache.parametros.diasAvisoVencimiento).tipo==='vencido')return;
    T.unidadesDeLote(l,Z.cache.unidades).filter(u=>u.estado==='EN_ALMACEN').forEach(u=>{if(on)S.ent.sel.add(u.id);else S.ent.sel.delete(u.id);});
    document.querySelectorAll(`[data-lote="${loteId}"]`).forEach(x=>{x.checked=!!on;});
    refrescarBotonEnt();
  };
  let esperaEnt=null;
  window.ilEntTexto=v=>{S.ent.texto=v;clearTimeout(esperaEnt);esperaEnt=setTimeout(()=>{repintar();const i=document.querySelector('.il-ent-f input');if(i){i.focus();try{i.setSelectionRange(v.length,v.length);}catch(_){/* sin cursor */}}},250);};
  /* Resumen antes de entregar: por categoría y lote, cuántas cajas/bobinas van a la línea. */
  window.ilEntregarSel=()=>{
    if(!Z.puedeEscribir())return;
    const ids=[...selValida()];
    if(!ids.length){aviso('error','Marca al menos una caja/bobina del almacén.');repintar();return;}
    if(!S.ent.linea){aviso('error','Elige la línea a la que van las cajas/bobinas marcadas.');repintar();return;}
    const por=new Map();
    ids.forEach(id=>{const u=Z.unidadPorId(id);if(!u)return;if(!por.has(u.loteId))por.set(u.loteId,[]);por.get(u.loteId).push(u);});
    const filas=[...por.entries()].map(([lid,us])=>{const l=Z.porId(lid)||{},uf=T.unidadFisica(l.categoria);
      return `<li><b>${esc(l.loteProveedor||lid)}</b> · ${esc(l.producto||'')} <small class="ii-mut">(${esc(l.categoria||'')})</small>: ${us.sort(numOrden).map(u=>esc(uf.titulo)+' '+esc(u.numero)).join(', ')}</li>`;}).join('');
    S.entrega={lista:ids,linea:S.ent.linea};
    abrirModal('Entregar a '+S.ent.linea,`<p>Van a <b>${esc(S.ent.linea)}</b> ${ids.length} ${ids.length===1?'caja/bobina':'cajas/bobinas'}:</p><ul class="il-ent-res">${filas}</ul>
      <p class="ii-mut">Cada una pasa a «Entregada a línea» con su movimiento. Si una no se puede entregar, no se entrega ninguna. No se mueve el stock SAP.</p>
      <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="ilCerrar()">Cancelar</button><button type="button" class="ii-btn" id="il-ent-ok" onclick="ilEntregarOk()">Entregar a ${esc(S.ent.linea)}</button></div>`);
  };

  /* Parámetros (solo quien crea lotes): aviso de vencimiento y leyenda obligatoria. */
  function parametrosHtml(){
    if(!Z.puedeEscribir())return '';
    const p=Z.cache.parametros||{};
    return `<details class="ii-card il-params"><summary><b>Parámetros de lotes</b> <span class="ii-mut">· aviso de vencimiento: ${p.diasAvisoVencimiento?esc(p.diasAvisoVencimiento)+' días':'sin aviso'}</span></summary>
      <div class="il-params-f"><label class="ii-et">Avisar cuántos días antes de vencer
        <input id="il-p-dias" type="number" min="1" max="365" step="1" inputmode="numeric" value="${p.diasAvisoVencimiento?esc(p.diasAvisoVencimiento):''}" placeholder="Vacío = no avisar"></label>
        <label class="il-op"><input id="il-p-ley" type="checkbox" ${p.leyendaObligatoria?'checked':''}><span><b>La foto debe traer leyenda</b><small class="ii-mut">Recepción o línea de destino (PET1, B7L…)</small></span></label>
        <div class="ii-acc"><button type="button" class="ii-btn" onclick="ilGuardarParametros()">Guardar parámetros</button></div></div></details>`;
  }
  window.ilGuardarParametros=async()=>{
    try{
      await Z.guardarParametros({diasAvisoVencimiento:(document.getElementById('il-p-dias')||{}).value,leyendaObligatoria:(document.getElementById('il-p-ley')||{}).checked});
      aviso('ok','Parámetros guardados.');
    }catch(e){aviso('error',Z.mensajeError(e));}
    repintar();
  };
  function html(){
    Z.escuchar();EV.escuchar();
    const CP=window.iiControlProcesoUI;if(CP)CP.usar(repintar);                  // tarjeta «Control de proceso en el envasado» (90-91)
    const IT=window.iiTrazabilidadInformeUI;if(IT)IT.usar(repintar);              // informe de trazabilidad (94)
    const msg=S.msg?`<div class="ii-msg ii-msg-${S.msg.tipo}" role="${S.msg.tipo==='error'?'alert':'status'}">${esc(S.msg.texto)}</div>`:'';
    const error=Z.cache.error?`<div class="ii-msg ii-msg-error" role="alert">No se pudieron leer los lotes: ${esc(Z.cache.error)}</div>`:'';
    return `<div class="ii-card"><div class="ii-fila-t"><h3>Lotes de insumos</h3>${Z.puedeEscribir()?'':'<span class="ii-chip">Solo consulta</span>'}</div>
      <p class="ii-mut">Cada etiqueta validada en Evidencias se convierte en una unidad de un lote rastreable: del proveedor a la línea y al cuadro de producción. No mueve el stock SAP.</p>${msg}${error}</div>
      ${vistasHtml()}
      ${S.vista==='entregar'?entregarHtml():S.vista==='informe'&&IT?IT.html():`${parametrosHtml()}
      ${CP?CP.html():''}
      <div class="ie-grid"><aside class="ii-card ie-lista"><div class="ie-filtros">${filtros()}</div><div id="il-lista">${listaHtml()}</div></aside><section>${fichaHtml()}</section></div>`}`;
  }

  /* Vistas: la lista de lotes, «Entregar a líneas» (la Asistente elige lotes y línea) y el informe de trazabilidad (94-trazabilidad-informe.js). */
  function vistasHtml(){
    const b=(v,t)=>`<button type="button" role="tab" class="il-vista ${S.vista===v?'il-vista-act':''}" aria-selected="${S.vista===v}" onclick="ilVista('${v}')">${t}</button>`;
    return `<div class="il-vistas" role="tablist" aria-label="Vista de lotes">${b('lotes','Lotes')}${b('entregar','Entregar a líneas')}${window.iiTrazabilidadInformeUI?b('informe','Informe de trazabilidad'):''}</div>`;
  }
  window.ilVista=v=>{S.vista=['informe','entregar'].includes(v)?v:'lotes';repintar();};
  window.ilSel=id=>{S.vista='lotes';S.sel=id;S.msg=null;Z.escucharMovimientos(id);repintar();};
  window.ilFiltro=(k,v)=>{S[k]=v;repintar();};
  let espera=null;
  window.ilTexto=v=>{S.texto=v;clearTimeout(espera);espera=setTimeout(()=>{const l=document.getElementById('il-lista');if(l)l.innerHTML=listaHtml();},200);};
  /* Desde la ficha: abre la evidencia de origen en la pestaña Evidencias. Desde Evidencias: abre el lote. */
  window.ilVerEvidencia=id=>{const U=window.iiEvidenciasUI;if(U){U.seleccionar(id);}if(typeof AP_set==='function')AP_set('tab','evidencias');};
  window.ilVerLote=id=>{S.sel=id;Z.escucharMovimientos(id);if(typeof AP_set==='function')AP_set('tab','lotes');};

  /* ---------- diálogo «Confirmar y crear lote» ---------- */
  function abrirModal(titulo,cuerpo){
    const r=raiz();if(!r)return;
    r.innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)ilCerrar()"><div class="modal ii-modal ii-modal-ancho" role="dialog" aria-modal="true"><div class="modal-head"><h3>${esc(titulo)}</h3>
      <button class="modal-close" onclick="ilCerrar()" aria-label="Cerrar">✕</button></div><div class="modal-body">${cuerpo}<div class="ii-msg ii-msg-error" id="il-m-error" hidden></div></div></div></div>`;
  }
  const errorModal=t=>{const e=document.getElementById('il-m-error');if(e){e.hidden=!t;e.textContent=t||'';}};
  window.ilCerrar=()=>{S.crear=null;S.articulo=null;if(typeof closeModal==='function')closeModal();else{const r=raiz();if(r)r.innerHTML='';}};

  /** Qué pasaría al crear: lote nuevo o unidad en un lote existente, duplicado, leyenda y errores. Puro sobre la caché. */
  function diagnostico(d){
    const p=Z.cache.parametros,edit=N.EDITABLES.includes(d.estado);
    const errores=[],avisos=[];
    if(edit){const v=N.validarAprobacion(d);errores.push(...v.errores);avisos.push(...v.avisos);}
    const v=T.validarParaLote(d,{parametros:p});
    v.errores.forEach(e=>{if(!errores.includes(e))errores.push(e);});v.avisos.forEach(a=>{if(!avisos.includes(a))avisos.push(a);});
    const datos=v.datos||T.datosDeEvidencia(d);
    // Banco de proveedores (96): la llave usa el nombre del banco; también se busca el lote por el nombre leído (lotes creados antes).
    const PB=window.glacialProveedores,banco=PB&&PB.listo&&PB.listo()?PB.resolver(datos.proveedor):null;
    if(banco&&banco.tipo==='CLIENTE')errores.unshift('«'+datos.proveedor+'» es el cliente ('+banco.nombre+'), no el proveedor. Corrige el proveedor en la evidencia.');
    const clave=T.claveLote(banco?Object.assign({},datos,{proveedor:banco.nombre}):datos),claveLeida=T.claveLote(datos);
    const tiene=(l,k)=>l.clave===k||(Array.isArray(l.clavesUnidas)&&l.clavesUnidas.includes(k));
    const directo=Z.cache.lotes.find(l=>tiene(l,clave))||Z.cache.lotes.find(l=>tiene(l,claveLeida))||null;
    const lote=directo?(Z.porId(T.resolverLoteId(directo.id,Z.cache.lotes))||directo):null;
    const unidadEn=l=>l&&datos.numero?Z.cache.unidades.find(u=>u.loteId===l.id&&T.numeroUnidad(u.numero)===datos.numero)||null:null;
    const unidad=unidadEn(lote);
    if(unidad)errores.unshift('La unidad '+datos.numero+' del lote '+datos.loteProveedor+' ya existe ('+unidad.id+'): es un duplicado y no se crea otra.');
    /* Posible lote repetido: mismo lote del proveedor con el proveedor o el producto escritos distinto. */
    const duplicados=lote?[]:T.posiblesDuplicados(Object.assign({},datos,{clave}),Z.cache.lotes).map(l=>({lote:l,unidad:unidadEn(l)}));
    return {errores,avisos,datos,lote,unidad,duplicados,leyenda:T.interpretarLeyenda(d.leyenda,p),clave,banco};
  }

  /* Validación en bloque (06/11/2026): otras fotos sin lote con el MISMO lote del proveedor y la misma categoría. Solo se ofrecen marcadas las que ya
     cumplen todas las reglas (datos confirmados, sin errores, n.º de caja/bobina distinto): las demás se revisan una por una contra su foto. */
  function companerasDe(d,g){
    const alnum=v=>T.norm(v).replace(/[^A-Z0-9]/g,'');
    const lp=alnum(g.datos.loteProveedor);if(!lp)return [];
    const nums=new Set([g.datos.numero]);
    return (EV.cache.lista||[]).filter(x=>x&&x.id!==d.id&&!x.loteId&&x.categoria===d.categoria&&(N.EDITABLES.includes(x.estado)||x.estado==='aprobado_dato')&&
        alnum(x.campos&&x.campos.lote&&x.campos.lote.valor)===lp)
      .sort((a,b)=>(N.fechaFoto(a).ms||0)-(N.fechaFoto(b).ms||0))
      .map(x=>{
        const gx=diagnostico(x),errores=gx.errores.filter(e=>!/ya existe/.test(e));
        if(gx.datos.numero&&nums.has(gx.datos.numero))errores.push('Mismo n.º de '+T.unidadFisica(x.categoria).uno+' ('+gx.datos.numero+') que otra foto: puede ser la misma etiqueta dos veces.');
        if(gx.unidad)errores.push('La '+T.unidadFisica(x.categoria).uno+' '+gx.datos.numero+' ya existe ('+gx.unidad.id+').');
        if(gx.datos.numero)nums.add(gx.datos.numero);
        return {doc:x,datos:gx.datos,errores};
      });
  }
  window.ilAbrirCrear=id=>{
    const d=EV.porId(id);if(!d||!Z.puedeEscribir())return;
    const U=window.iiEvidenciasUI;
    if(U&&U.hayEdicion()&&Object.keys(U.cambiosPendientes(d)).length){U.aviso('error','Tienes cambios sin guardar. Pulsa «Guardar cambios» y luego confirma el lote.');U.repintar();return;}
    const g=diagnostico(d),s=Z.sugerencias(d);
    const dupLibre=g.duplicados.find(x=>!x.unidad);
    S.crear={id:d.id,rev:d.rev,articulo:s.candidatos.length?s.candidatos[0].id:'',candidatos:s.candidatos,destino:dupLibre?dupLibre.lote.id:'',duplicados:g.duplicados};
    const l=g.leyenda,estado=l.tipo==='LINEA'?'ENTREGADA_LINEA':'EN_ALMACEN';
    const uf0=T.unidadFisica(d.categoria),sig=g.lote?T.numeroUnidad(String(Math.max(1,Math.floor(Number(g.lote.siguienteUnidad))||(Number(g.lote.unidades)||0)+1))):'01';     // n.º automático (13/11/2026)
    const que=g.lote?`Se agregará la ${esc(uf0.uno)} <b>${esc(sig)}</b> (n.º automático) al lote existente <b>${esc(g.lote.id)}</b> (${esc(g.lote.loteProveedor)}).`:`Se creará un <b>lote nuevo</b> para el lote del proveedor <b>${esc(g.datos.loteProveedor)}</b> y su ${esc(uf0.uno)} <b>01</b> (n.º automático).`;
    const leyenda=d.leyenda?(l.ambigua?`<div class="ii-msg ii-msg-error">La leyenda «${esc(d.leyenda)}» es ambigua (trae más de una): se ignora.</div>`:l.leyenda?`<p>Leyenda de la foto: <b>${esc(l.leyenda)}</b> → la unidad quedará <b>${esc(T.ESTADOS[estado])}</b>${l.linea?' en '+esc(l.linea):''}.</p>`:`<p class="ii-mut">Leyenda de la foto: «${esc(d.leyenda)}» (no es una leyenda válida; la unidad queda en almacén).</p>`):'<p class="ii-mut">La foto llegó sin leyenda: la unidad queda <b>En almacén</b>.</p>';
    const cand=s.candidatos.length?`<fieldset class="il-art"><legend>Artículo del catálogo del Inventario</legend>${s.candidatos.map((c,i)=>`<label class="il-op"><input type="radio" name="il-art" value="${esc(c.id)}" ${i===0?'checked':''} onchange="ilArticulo(this.value)"><span><b>${esc(c.nombre)}</b>${c.itemCode?' <small class="ii-mut">('+esc(c.itemCode)+')</small>':''}<small class="ii-mut">${esc(c.razones.join(' · '))}</small></span></label>`).join('')}
      ${buscadorArticulo()}<label class="il-op"><input type="radio" name="il-art" value="" onchange="ilArticulo(this.value)"><span><b>Ninguno / elegir después</b><small class="ii-mut">El lote se crea igual con todos los datos de la etiqueta (queda en el historial); el artículo se asigna después desde la ficha del lote.</small></span></label></fieldset>`:
      `<fieldset class="il-art"><legend>Artículo del catálogo del Inventario</legend><p class="ii-mut">No hay artículo sugerido que coincida.</p>${buscadorArticulo()}<label class="il-op"><input type="radio" name="il-art" value="" checked onchange="ilArticulo(this.value)"><span><b>Ninguno / elegir después</b><small class="ii-mut">El lote se crea igual (queda en el historial); el artículo se asigna después desde la ficha.</small></span></label></fieldset>`;
    const dupHtml=g.duplicados.length?`<fieldset class="il-art il-dup" role="group" aria-label="Posible lote repetido"><legend>⚠ Posible lote repetido</legend>
      <p class="ii-mut">Ya hay ${g.duplicados.length===1?'un lote':'lotes'} con el mismo lote del proveedor <b>${esc(g.datos.loteProveedor)}</b>, pero con el proveedor o el producto escritos distinto. Si es el mismo lote, agrégala ahí para no partirlo en dos.</p>
      ${g.duplicados.map(x=>`<label class="il-op"><input type="radio" name="il-dest" value="${esc(x.lote.id)}" ${x.lote.id===S.crear.destino?'checked':''} ${x.unidad?'disabled':''} onchange="ilDestino(this.value)"><span><b>Agregar al lote ${esc(x.lote.id)}</b><small class="ii-mut">${esc(x.lote.proveedor)} · ${esc(x.lote.producto)} · ${esc(x.lote.categoria)}</small>${x.unidad?`<small class="il-err">Ya tiene la ${esc(T.unidadFisica(x.lote.categoria).uno)} n.º ${esc(g.datos.numero)} (${esc(x.unidad.id)}): sería la misma etiqueta dos veces.</small>`:''}</span></label>`).join('')}
      <label class="il-op"><input type="radio" name="il-dest" value="" ${S.crear.destino?'':'checked'} onchange="ilDestino(this.value)"><span><b>No, es otro lote: crear un lote nuevo</b></span></label></fieldset>`:'';
    const comp=companerasDe(d,g);S.crear.companeras=comp.filter(c=>!c.errores.length).map(c=>({id:c.doc.id,rev:c.doc.rev}));
    const uf=T.unidadFisica(g.datos.categoria);
    const compHtml=comp.length?`<fieldset class="il-art il-comp"><legend>Otras fotos del mismo lote ${esc(g.datos.loteProveedor)} (${comp.length})</legend>
      <p class="ii-mut">Se confirman junto con esta, cada una como una ${esc(uf.uno)} del mismo lote. Solo vienen marcadas las que tienen todos sus datos confirmados; las demás revísalas una por una contra su foto.</p>
      ${comp.map(c=>`<label class="il-op"><input type="checkbox" class="il-comp-x" value="${esc(c.doc.id)}" data-rev="${esc(c.doc.rev)}" ${c.errores.length?'disabled':'checked'}><span><b>${esc(uf.titulo)} ${esc(c.datos.numero||'—')}</b> · ${esc(c.datos.producto)} <small class="ii-mut">${esc(c.datos.proveedor)} · foto ${esc(hora(N.fechaFoto(c.doc).ms))}${c.datos.pesoNeto!=null?' · '+esc(kg(c.datos.pesoNeto)):''}</small>${c.errores.length?`<small class="il-err">${esc(c.errores[0])}</small>`:''}</span></label>`).join('')}</fieldset>`:'';
    const ok=!g.errores.length;
    abrirModal(d.estado==='aprobado_dato'?'Crear lote':'Confirmar y crear lote',`<p>${que}</p>${dupHtml}${compHtml}
      ${g.errores.length?`<div class="ii-msg ii-msg-error" role="alert"><b>No se puede crear todavía:</b><ul class="ii-lista-sm">${g.errores.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
      ${g.avisos.length?`<ul class="ii-lista-sm">${g.avisos.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
      <table class="ie-t il-datos"><tbody>${fila('Proveedor',g.banco&&g.banco.tipo!=='CLIENTE'?`<b>${esc(g.banco.nombre)}</b>${g.banco.nombre!==g.datos.proveedor?` <small class="ii-mut">(leído: ${esc(g.datos.proveedor)})</small>`:''}`:`${esc(g.datos.proveedor)}${window.glacialProveedores&&!g.banco?' <small class="ii-mut">(no está en el banco de proveedores)</small>':''}`)}${fila('Producto',esc(g.datos.producto))}${fila('Lote del proveedor',esc(g.datos.loteProveedor))}${fila('N.º '+T.unidadFisica(g.datos.categoria).uno,esc(g.datos.numero))}${fila('Contenido (etiqueta)',g.datos.cantidad===null?'':esc(fmtCant(g.datos.cantidad))+' '+esc(g.datos.unidadCantidad||''))}${fila('Foto enviada',(()=>{const f=N.fechaFoto(d);return f.ms?esc(hora(f.ms))+notaOrigen(f.origen):'';})())}${fila('Peso neto',esc(kg(g.datos.pesoNeto)))}${fila('Peso bruto',esc(kg(g.datos.pesoBruto)))}${fila('OI / OC',esc([g.datos.ordenInterna,g.datos.ordenCompra].filter(Boolean).join(' · ')))}</tbody></table>
      ${leyenda}${cand}
      <p class="ii-mut">${d.estado==='aprobado_dato'?'Los datos ya estaban aprobados.':'Al confirmar también se aprueban los datos de la evidencia.'} No se registra stock SAP.</p>
      <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="ilCerrar()">Cancelar</button><button type="button" class="ii-btn" id="il-m-ok" onclick="ilCrearOk()" ${ok?'':'disabled'}>${d.estado==='aprobado_dato'?'Crear lote':'Confirmar y crear lote'}</button></div>`);
  };
  window.ilArticulo=v=>{if(S.crear)S.crear.articulo=v;if(S.articulo)S.articulo.elegido=v;};
  window.ilDestino=v=>{if(S.crear)S.crear.destino=v||'';};
  /* Buscador en todo el catálogo: para cuando el artículo correcto no está entre los sugeridos. */
  function buscadorArticulo(){
    return `<label class="ii-et il-busca">¿No está en la lista? Busca en todo el catálogo<input type="search" placeholder="Nombre o código (p. ej. bolsa 3 kg)" oninput="ilBuscarArt(this.value)" autocomplete="off"></label><div id="il-art-busq"></div>`;
  }
  let esperaArt=null;
  window.ilBuscarArt=v=>{
    clearTimeout(esperaArt);
    esperaArt=setTimeout(()=>{
      const caja=document.getElementById('il-art-busq');if(!caja)return;
      const ya=new Set([...document.querySelectorAll('input[name="il-art"]')].filter(x=>!x.closest('#il-art-busq')).map(x=>x.value));
      const res=String(v||'').trim().length<2?[]:Z.buscarArticulos(v,8).filter(a=>!ya.has(a.id));
      caja.innerHTML=!String(v||'').trim()?'':res.length?res.map(a=>`<label class="il-op"><input type="radio" name="il-art" value="${esc(a.id)}" onchange="ilArticulo(this.value)"><span><b>${esc(a.nombre)}</b>${a.itemCode?' <small class="ii-mut">('+esc(a.itemCode)+')</small>':''}<small class="ii-mut">${esc(a.categoria||'')}</small></span></label>`).join('')
        :'<p class="ii-mut">Ningún artículo del catálogo coincide. Si el insumo no existe en el catálogo, pide que lo agreguen en Inventario de insumos y elige «Ninguno / elegir después».</p>';
    },200);
  };
  /* ---------- asignar o cambiar el artículo de un lote ya creado ---------- */
  window.ilAbrirArticulo=id=>{
    const l=Z.porId(id);if(!l||!Z.puedeEscribir())return;
    S.articulo={id:l.id,rev:l.rev,elegido:l.itemId||''};
    const s=Z.sugerencias({campos:{proveedor:{valor:l.proveedor},producto:{valor:l.producto},marca:{valor:l.marca}},categoria:l.categoria});
    const cand=s.candidatos.filter(c=>c.id!==l.itemId);
    abrirModal('Artículo del catálogo',`<p>Lote <b>${esc(l.loteProveedor)}</b> · ${esc(l.producto)} <small class="ii-mut">(${esc(l.id)})</small></p>
      <p>Artículo actual: ${l.itemNombre?'<b>'+esc(l.itemNombre)+'</b>':'<span class="ii-mut">sin artículo</span>'}</p>
      <fieldset class="il-art"><legend>Elegir artículo</legend>${l.itemId?`<label class="il-op"><input type="radio" name="il-art" value="${esc(l.itemId)}" checked onchange="ilArticulo(this.value)"><span><b>${esc(l.itemNombre)}</b> <small class="ii-mut">(actual)</small></span></label>`:''}
        ${cand.map(c=>`<label class="il-op"><input type="radio" name="il-art" value="${esc(c.id)}" onchange="ilArticulo(this.value)"><span><b>${esc(c.nombre)}</b>${c.itemCode?' <small class="ii-mut">('+esc(c.itemCode)+')</small>':''}<small class="ii-mut">${esc(c.razones.join(' · '))}</small></span></label>`).join('')}
        ${buscadorArticulo()}<label class="il-op"><input type="radio" name="il-art" value="" ${l.itemId?'':'checked'} onchange="ilArticulo(this.value)"><span><b>Sin artículo</b></span></label></fieldset>
      <p class="ii-mut">Solo cambia el artículo del catálogo: los datos de la etiqueta, las ${esc(T.unidadFisica(l.categoria).varios)} y su historial no cambian. Queda en la auditoría.</p>
      <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="ilCerrar()">Cancelar</button><button type="button" class="ii-btn" id="il-art-ok" onclick="ilArticuloOk()">Guardar</button></div>`);
  };
  window.ilArticuloOk=async()=>{
    const a=S.articulo;if(!a)return;
    const b=document.getElementById('il-art-ok');if(b)b.disabled=true;errorModal('');
    try{await Z.asignarArticulo(a.id,a.rev,a.elegido);S.articulo=null;ilCerrar();aviso('ok','Artículo del lote actualizado.');repintar();}
    catch(e){errorModal(Z.mensajeError(e));if(b)b.disabled=false;}
  };
  window.ilCrearOk=async()=>{
    const c=S.crear;if(!c)return;
    const b=document.getElementById('il-m-ok');if(b)b.disabled=true;errorModal('');
    const otras=(typeof document.querySelectorAll==='function'?[...document.querySelectorAll('.il-comp-x:checked')]:[]).map(x=>({id:x.value,rev:x.dataset.rev}));
    try{
      const r=await Z.crearLoteDesdeEvidencia(c.id,c.rev,{articuloId:c.articulo,loteDestinoId:c.destino||''});
      // Las demás, una transacción cada una, al MISMO lote (aunque el proveedor se haya leído distinto): si una falla, las otras siguen.
      const hechas=[],fallas=[];
      for(const o of otras){
        if(b)b.textContent='Confirmando '+(hechas.length+fallas.length+2)+' de '+(otras.length+1)+'…';
        try{const x=await Z.crearLoteDesdeEvidencia(o.id,o.rev,{articuloId:c.articulo,loteDestinoId:r.loteId});hechas.push(x.unidadId);}
        catch(e){const ev=EV.porId(o.id);fallas.push((ev?N.tituloEvidencia(ev):o.id)+': '+Z.mensajeError(e));}
      }
      const U=window.iiEvidenciasUI;
      ilCerrar();
      if(U){
        const base=(r.accion==='lote_nuevo'?'Lote ':'Unidad agregada al lote ')+r.loteId+' · unidad '+r.unidadId+' ('+T.ESTADOS[r.estado].toLowerCase()+(r.linea?' en '+r.linea:'')+').';
        const mas=hechas.length?' También se confirmaron '+hechas.length+' foto(s) más del mismo lote ('+hechas.join(', ')+').':'';
        U.aviso(fallas.length?'error':'ok',base+mas+(fallas.length?' No se pudieron confirmar '+fallas.length+': '+fallas.join(' · '):''));U.repintar();
      }
    }catch(e){errorModal(Z.mensajeError(e));if(b)b.disabled=false;}
  };

  /* ---------- corregir la categoría de un lote (T3) ---------- */
  window.ilAbrirCategoria=id=>{
    const l=Z.porId(id);if(!l||!Z.puedeEscribir())return;
    S.categoriaLote={id:l.id,rev:l.rev};
    abrirModal('Cambiar categoría del lote',`<p>Lote <b>${esc(l.loteProveedor)}</b> · ${esc(l.producto)} <small class="ii-mut">(${esc(l.id)})</small></p>
      <p>Categoría actual: <b>${esc(l.categoria)}</b></p>
      <label class="ii-et">Categoría correcta<select id="il-cat">${T.CATEGORIAS_LOTE.map(c=>`<option value="${esc(c)}" ${c===l.categoria?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="ii-et">Motivo<input id="il-cat-motivo" type="text" maxlength="200" placeholder="P. ej.: es una etiqueta, la IA la leyó como preforma"></label>
      <p class="ii-mut">La categoría decide en qué columna del Control de proceso sale el lote y en qué grupo lo ve el supervisor. Los cuadros que ya lo usaron guardan la categoría anterior; el informe de trazabilidad usa la del lote. Queda en la auditoría.</p>
      <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="ilCerrar()">Cancelar</button><button type="button" class="ii-btn" id="il-cat-ok" onclick="ilCategoriaOk()">Guardar</button></div>`);
  };
  window.ilCategoriaOk=async()=>{
    const c=S.categoriaLote;if(!c)return;
    const b=document.getElementById('il-cat-ok');if(b)b.disabled=true;errorModal('');
    try{
      await Z.cambiarCategoria(c.id,c.rev,(document.getElementById('il-cat')||{}).value,(document.getElementById('il-cat-motivo')||{}).value);
      S.categoriaLote=null;ilCerrar();aviso('ok','Categoría del lote '+c.id+' corregida.');repintar();
    }catch(e){errorModal(Z.mensajeError(e));if(b)b.disabled=false;}
  };
  /* ---------- unir un lote repetido con otro (T3) ---------- */
  window.ilAbrirUnir=id=>{
    const l=Z.porId(id);if(!l||!Z.puedeEscribir()||l.unidoEn)return;
    const alnum=v=>T.norm(v).replace(/[^A-Z0-9]/g,'');
    const cand=Z.cache.lotes.filter(x=>x.id!==l.id&&!x.unidoEn&&alnum(x.loteProveedor)===alnum(l.loteProveedor)).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    const uf=T.unidadFisica(l.categoria),usO=T.unidadesDeLote(l,Z.cache.unidades);
    S.unir={origen:l.id,destino:cand.length?cand[0].id:''};
    abrirModal('Unir lote repetido',`<p>Lote <b>${esc(l.id)}</b> · ${esc(l.proveedor)} · ${esc(l.producto)} · lote del proveedor <b>${esc(l.loteProveedor)}</b> · ${usO.length} ${esc(usO.length===1?uf.uno:uf.varios)}</p>
      ${cand.length?`<fieldset class="il-art"><legend>¿A qué lote se une?</legend>${cand.map((x,i)=>{const us=T.unidadesDeLote(x,Z.cache.unidades);return `<label class="il-op"><input type="radio" name="il-unir" value="${esc(x.id)}" ${i===0?'checked':''} onchange="ilUnirDestino(this.value)"><span><b>${esc(x.id)}</b> · ${esc(x.proveedor)}<small class="ii-mut">${esc(x.producto)} · ${esc(x.categoria)} · ${us.length} ${esc(us.length===1?T.unidadFisica(x.categoria).uno:T.unidadFisica(x.categoria).varios)}: ${esc(us.map(u=>u.numero).join(', ')||'—')}</small></span></label>`;}).join('')}</fieldset>
        <label class="ii-et">Motivo<input id="il-unir-motivo" type="text" maxlength="200" placeholder="P. ej.: mismo lote del proveedor, el nombre del proveedor se leyó distinto"></label>
        <p class="ii-mut">Las ${esc(uf.varios)} de <b>${esc(l.id)}</b> (${esc(usO.map(u=>u.numero).join(', ')||'ninguna')}) pasan al lote elegido con su estado, pesos e historial; cada una deja un movimiento. <b>${esc(l.id)}</b> no se borra: queda «unido a» ese lote y las fotos nuevas de este lote irán solas al lote elegido. Si quieres conservar <b>${esc(l.id)}</b>, abre el otro lote y únelo a este.</p>
        <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="ilCerrar()">Cancelar</button><button type="button" class="ii-btn" id="il-unir-ok" onclick="ilUnirOk()">Unir lotes</button></div>`
      :`<p class="ii-mut">No hay otro lote con el lote del proveedor <b>${esc(l.loteProveedor)}</b>. Solo se unen lotes con el mismo lote del proveedor.</p><div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="ilCerrar()">Cerrar</button></div>`}`);
  };
  window.ilUnirDestino=v=>{if(S.unir)S.unir.destino=v;};
  window.ilUnirOk=async()=>{
    const u=S.unir;if(!u||!u.destino)return;
    const b=document.getElementById('il-unir-ok');if(b)b.disabled=true;errorModal('');
    try{
      const r=await Z.unirLotes(u.origen,u.destino,(document.getElementById('il-unir-motivo')||{}).value);
      S.unir=null;ilCerrar();S.sel=r.destinoId;Z.escucharMovimientos(r.destinoId);
      aviso('ok','Lote '+u.origen+' unido a '+r.destinoId+' ('+r.unidades+' movida(s)).');repintar();
    }catch(e){errorModal(Z.mensajeError(e));if(b)b.disabled=false;}
  };

  /* ---------- diálogo «Entregar a línea» (Etapa 2) ---------- */
  /* Entregar varias cajas/bobinas del lote de una vez (T4): todas las que están en almacén, marcadas; una transacción. */
  window.ilAbrirEntregaLote=loteId=>{
    const l=Z.porId(loteId);if(!l||!Z.puedeEscribir())return;
    const us=T.unidadesDeLote(l,Z.cache.unidades).filter(u=>u.estado==='EN_ALMACEN');
    if(!us.length)return;
    const v=T.estadoVencimiento(l.fechaVencimiento,hoyIso(),Z.cache.parametros.diasAvisoVencimiento);
    if(v.tipo==='vencido'){aviso('error','El lote '+l.loteProveedor+' está vencido: no se entrega a línea.');repintar();return;}
    const uf=T.unidadFisica(l.categoria);
    S.entrega={varias:true};
    abrirModal('Entregar a línea',`<p>Lote <b>${esc(l.loteProveedor)}</b> · ${esc(l.producto)} <small class="ii-mut">(${esc(l.id)})</small></p>
      ${v.tipo==='sin_fecha'?'<div class="ii-msg ii-msg-info">El lote no tiene fecha de vencimiento registrada.</div>':v.tipo==='por_vencer'?`<div class="ii-msg ii-msg-error" role="alert">El lote vence en <b>${v.dias}</b> día(s).</div>`:''}
      <fieldset class="il-art"><legend>${esc(uf.varios.charAt(0).toUpperCase()+uf.varios.slice(1))} en almacén</legend>
        <label class="il-op"><input type="checkbox" checked onchange="document.querySelectorAll('.il-ent-u').forEach(x=>x.checked=this.checked)"><span><b>Todas (${us.length})</b></span></label>
        ${us.map(u=>`<label class="il-op"><input type="checkbox" class="il-ent-u" value="${esc(u.id)}" checked><span>${esc(uf.titulo)} <b>${esc(u.numero)}</b> <small class="ii-mut">${esc(kg(u.pesoActual))}${u.cantidad!=null&&u.cantidad!==''?' · '+esc(fmtCant(u.cantidad))+' '+esc(u.unidadCantidad||''):''}</small></span></label>`).join('')}</fieldset>
      <label class="ii-et">Línea a la que se entregan<select id="il-ent-linea"><option value="">Elige la línea…</option>${T.LINEAS.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></label>
      <p class="ii-mut">Cada una pasa a «Entregada a línea» con su movimiento. Si una no se puede entregar, no se entrega ninguna. No se mueve el stock SAP.</p>
      <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="ilCerrar()">Cancelar</button><button type="button" class="ii-btn" id="il-ent-ok" onclick="ilEntregarOk()">Entregar</button></div>`);
  };
  window.ilAbrirEntrega=id=>{
    const u=Z.unidadPorId(id),l=u&&Z.porId(u.loteId);if(!u||!l||!Z.puedeEscribir())return;
    S.entrega={id:u.id};
    const v=T.estadoVencimiento(l.fechaVencimiento,hoyIso(),Z.cache.parametros.diasAvisoVencimiento);
    const venc=v.tipo==='sin_fecha'?'<div class="ii-msg ii-msg-info">El lote no tiene fecha de vencimiento registrada.</div>':
      v.tipo==='por_vencer'?`<div class="ii-msg ii-msg-error" role="alert">El lote vence en <b>${v.dias}</b> día(s) (${esc(fecha(l.fechaVencimiento))}).</div>`:
      `<p class="ii-mut">Vence el ${esc(fecha(l.fechaVencimiento))}${v.dias!==null?' (en '+v.dias+' días)':''}.</p>`;
    abrirModal('Entregar a línea',`<p>Unidad <b>${esc(u.numero)}</b> del lote <b>${esc(l.loteProveedor)}</b> · ${esc(l.producto)} <small class="ii-mut">(${esc(u.id)})</small></p>${venc}
      <label class="ii-et">Línea a la que se entrega<select id="il-ent-linea"><option value="">Elige la línea…</option>${T.LINEAS.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></label>
      <p class="ii-mut">La unidad pasa a «Entregada a línea» y queda un movimiento que no se edita. El supervisor de esa línea podrá marcar este lote como usado en su cuadro. No se mueve el stock SAP.</p>
      <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="ilCerrar()">Cancelar</button><button type="button" class="ii-btn" id="il-ent-ok" onclick="ilEntregarOk()">Entregar</button></div>`);
  };
  window.ilEntregarOk=async()=>{
    const e=S.entrega;if(!e)return;
    const linea=e.lista?e.linea:((document.getElementById('il-ent-linea')||{}).value||'');
    if(!linea){errorModal('Elige la línea a la que se entrega.');return;}
    const ids=e.lista?e.lista.slice():e.varias?[...document.querySelectorAll('.il-ent-u:checked')].map(x=>x.value):[e.id];
    if(!ids.length){errorModal('Marca al menos una.');return;}
    const b=document.getElementById('il-ent-ok');if(b)b.disabled=true;errorModal('');
    try{
      const r=await Z.entregarALinea(ids,linea);
      ilCerrar();if(e.lista)ids.forEach(id=>S.ent.sel.delete(id));S.entrega=null;
      const av=[...new Set(r.entregadas.flatMap(x=>x.avisos||[]))];
      aviso('ok',(ids.length===1?'Unidad '+ids[0]+' entregada':ids.length+' entregadas')+' a '+linea+'.'+(av.length?' '+av.join(' '):''));repintar();
    }catch(err){errorModal(Z.mensajeError(err));if(b)b.disabled=false;}
  };

  /* Observar, liberar, devolver al proveedor o devolver a almacén sin usar (T4). */
  const TXT_MOV={OBSERVAR:['Observar','Queda «Observada»: no se entrega a línea hasta liberarla. P. ej.: caja dañada, etiqueta ilegible, peso dudoso.','Motivo de la observación'],
    LIBERAR:['Liberar','Vuelve a «En almacén» y se puede entregar.','Motivo (opcional)'],
    DEVOLUCION_PROVEEDOR:['Devolver al proveedor','Queda «Devuelta al proveedor» (estado final). No se puede deshacer.','Motivo de la devolución'],
    RETORNO_ALMACEN:['Devolver a almacén','Vuelve de la línea a «En almacén» sin haberse usado (sin consumo).','Motivo (opcional)']};
  window.ilAbrirMover=(id,tipo)=>{
    const u=Z.unidadPorId(id),l=u&&Z.porId(u.loteId),t=TXT_MOV[tipo];if(!u||!l||!t||!Z.puedeEscribir())return;
    S.mover={id:u.id,tipo};
    const req=T.MOV_SIMPLES[tipo]&&T.MOV_SIMPLES[tipo].motivo;
    abrirModal(t[0],`<p>${esc(T.unidadFisica(l.categoria).titulo)} <b>${esc(u.numero)}</b> del lote <b>${esc(l.loteProveedor)}</b> · ${esc(l.producto)} <small class="ii-mut">(${esc(u.id)} · ${esc(T.ESTADOS[u.estado]||u.estado)}${u.linea?' · '+esc(u.linea):''})</small></p>
      <p class="ii-mut">${esc(t[1])}</p>
      <label class="ii-et">${esc(t[2])}<input id="il-mov-motivo" type="text" maxlength="200" ${req?'required':''}></label>
      <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="ilCerrar()">Cancelar</button><button type="button" class="ii-btn" id="il-mov-ok" onclick="ilMoverOk()">${esc(t[0])}</button></div>`);
  };
  window.ilMoverOk=async()=>{
    const m=S.mover;if(!m)return;
    const b=document.getElementById('il-mov-ok');if(b)b.disabled=true;errorModal('');
    try{
      await Z.moverUnidades([m.id],m.tipo,(document.getElementById('il-mov-motivo')||{}).value);
      S.mover=null;ilCerrar();aviso('ok',TXT_MOV[m.tipo][0]+': '+m.id+'.');repintar();
    }catch(e){errorModal(Z.mensajeError(e));if(b)b.disabled=false;}
  };

  const css=`
.ii-p-azul{background:#C6EBFC;color:#0877A6}.il-filtros{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.il-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin-top:8px}
.il-datos th{width:42%}.il-tabla-w{overflow-x:auto}.il-unidades th{text-align:left;font-size:12px;color:#475467;background:#f4f8fc}.il-unidades td{vertical-align:top}.il-unidades td small{display:block}.il-unidades td:nth-child(2){min-width:150px}.il-unidades .ii-pill{white-space:nowrap;max-width:100%}.il-unidades .ii-btn{white-space:nowrap}.il-unidades{table-layout:auto;min-width:760px}.il-unidades td:nth-child(n+4){white-space:nowrap}
.il-tl{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:6px}.il-tl li{background:#f8fbff;border:1px solid var(--ii-linea);border-radius:8px;padding:8px 10px;font-size:13.5px}
.il-art{border:1px solid var(--ii-linea);border-radius:10px;margin:10px 0;padding:8px 12px}.il-art legend{font-weight:600;font-size:13px;padding:0 6px}.il-op{display:flex;gap:8px;align-items:flex-start;padding:6px 0;cursor:pointer}.il-op small{display:block}
.il-nota{font-size:12.5px;margin:6px 0 0}.il-op input[type=radio]{width:auto;min-width:0;height:auto;flex:0 0 auto;margin:3px 0 0;padding:0;box-shadow:none}.il-op span{flex:1 1 auto;text-align:left}.il-busca{margin:6px 0}.il-busca input{width:100%}
.il-vistas{display:flex;gap:6px;margin:0 0 12px;flex-wrap:wrap}.il-vista{border:1px solid var(--ii-linea);background:#fff;border-radius:10px;padding:9px 14px;min-height:44px;font:inherit;font-weight:600;cursor:pointer;color:#0b2a4a}
.il-vista.il-vista-act,.ii .il-vista.il-vista-act{background:#0b2a4a;color:#fff!important;border-color:#0b2a4a}.il-dup{border-color:#f5c2c0;background:#fffafa}.il-err{display:block;color:#b42318}
.il-acc-u{display:flex;gap:6px;flex-wrap:wrap}.il-comp{background:#f8fbff}
.il-ent-barra{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;position:sticky;top:0;z-index:2;background:#fff;padding:8px 0;border-bottom:1px solid var(--ii-linea)}.il-ent-barra .ii-campo{min-width:200px}.il-ent-f{margin:8px 0}
.il-ent-lote{border:1px solid var(--ii-linea);border-radius:10px;padding:6px 12px;margin:6px 0}.il-ent-venc{background:#fffafa;border-color:#f5c2c0}.il-ent-us{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:2px 10px;margin:0 0 4px 26px}
.il-ent-u{align-items:center;flex-wrap:wrap}.il-ent-u small{display:block}.il-ent-lin .il-ent-us{margin-left:0;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}.il-ent-res{margin:6px 0 10px;padding-left:18px;font-size:13.5px}
.il-params summary{cursor:pointer}.il-params-f{display:grid;gap:12px;margin-top:10px;max-width:520px}.il-params .ii-et input{max-width:200px}
@media(max-width:900px){.il-cols{grid-template-columns:1fr}}
@media(max-width:560px){.il-ent-us{margin-left:0;grid-template-columns:1fr 1fr}.il-ent-barra .ii-campo{min-width:0;flex:1 1 100%}.il-filtros{grid-template-columns:1fr}.il-unidades{min-width:0}.il-unidades thead{display:none}.il-unidades,.il-unidades tbody,.il-unidades tr,.il-unidades td{display:block;width:100%}.il-unidades tr{border-top:1px solid #edf2f7;padding:6px 0}.il-unidades td::before{content:attr(data-t) ': ';font-weight:600;color:#475467}}`;

  window.iiLotesUI={html,css,estado:S,diagnostico,usar:h=>{if(h&&typeof h.pintar==='function'&&typeof h.activo==='function')host=h;}};
  window.__trazabilidadLotesPantalla={S,diagnostico,companerasDe,almacenPorCategoria};

  /* Tiempo real: lo que otra persona cree o cambie aparece solo, sin pisar lo que se está escribiendo. */
  Z.alCambiar(()=>{
    if(!host.activo())return;
    if(document.querySelector('.ii input:focus,.ii select:focus,.ii textarea:focus,#modal-root .modal'))return;
    host.pintar();
  });
})();
