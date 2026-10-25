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
  const S={sel:'',texto:'',estado:'',categoria:'',linea:'',msg:null,crear:null};
  const PILL={EN_ALMACEN:'ii-p-verde',ENTREGADA_LINEA:'ii-p-azul',EN_USO:'ii-p-naranja',CONSUMIDA:'ii-p-gris',OBSERVADA:'ii-p-rojo',DEVUELTA_PROVEEDOR:'ii-p-gris'};
  const pill=e=>`<span class="ii-pill ${PILL[e]||'ii-p-gris'}"><i></i>${esc(T.ESTADOS[e]||e)}</span>`;
  const hora=ms=>{if(!ms)return '';const d=new Date(Number(ms)-5*3600000),p=n=>String(n).padStart(2,'0');return p(d.getUTCDate())+'/'+p(d.getUTCMonth()+1)+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes());};
  const fecha=iso=>N.fechaPantalla(iso||'');
  const kg=n=>n===null||n===undefined||n===''?'—':(Math.round(Number(n)*1000)/1000).toLocaleString('es-PE',{maximumFractionDigits:3})+' kg';
  const aviso=(tipo,texto)=>{S.msg={tipo,texto};};
  const loteActual=()=>Z.porId(S.sel);
  const fotos=()=>window.glacialFotos||null;

  /* ---------- lista ---------- */
  function itemLista(l){
    const r=T.resumenLote(l,Z.cache.unidades);
    const est=Object.entries(r.porEstado).filter(([,n])=>n).map(([k,n])=>`${n} ${T.ESTADOS[k].toLowerCase()}`).join(' · ');
    return `<button type="button" class="ie-item ${l.id===S.sel?'ie-item-act':''}" onclick="ilSel('${esc(l.id)}')"><span class="ie-it-t"><b>${esc(l.producto)}</b><span class="ii-pill ii-p-azul"><i></i>${esc(l.id)}</span></span>
      <small>${esc(l.proveedor)} · lote ${esc(l.loteProveedor)}</small><small>${r.total} unidad${r.total===1?'':'es'}${est?' · '+esc(est):''} · ${esc(hora(l.creadoEn))}</small></button>`;
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
  function fichaHtml(){
    const l=loteActual();
    if(!l)return '<div class="ii-card ie-vacio-det"><p class="ii-mut">Elige un lote de la lista para ver sus datos, sus unidades y su línea de tiempo.</p></div>';
    const us=T.unidadesDeLote(l,Z.cache.unidades),r=T.resumenLote(l,Z.cache.unidades);
    const tl=T.lineaDeTiempo(Z.cache.movimientos,{loteId:l.id});
    const unidades=us.map(u=>`<tr><td data-t="Unidad"><b>${esc(u.numero)}</b><small class="ii-mut">${esc(u.id)}</small></td><td data-t="Estado">${pill(u.estado)}</td>
      <td data-t="Línea">${esc(u.linea)||'<span class="ii-mut">—</span>'}</td><td data-t="Peso neto">${kg(u.pesoNeto)}</td><td data-t="Peso actual">${kg(u.pesoActual)}</td>
      <td data-t="Cantidad">${u.cantidad===null||u.cantidad===undefined?'—':esc(u.cantidad)+' '+esc(u.unidadCantidad||'')}</td><td data-t="Origen">${fotoDe(u)}</td></tr>`).join('');
    const hist=tl.map(m=>`<li><b>${esc(hora(m.enMs))}</b> · ${esc(m.unidadId)} · ${esc(T.textoMovimiento(m))} <span class="ii-mut">— ${esc(m.por||'—')}</span></li>`).join('');
    return `<div class="ii-card ie-det"><div class="ie-det-cab"><div><h3>${esc(l.producto)}</h3><p class="ii-mut">${esc(l.proveedor)} · lote del proveedor <b>${esc(l.loteProveedor)}</b></p></div><span class="ii-pill ii-p-azul"><i></i>${esc(l.id)}</span></div>
      <div class="ii-msg ii-msg-info" role="note">El lote es trazabilidad: <b>no mueve el stock SAP</b>. Cada cambio de una unidad queda como un movimiento que no se edita ni se borra.</div>
      <div class="il-cols"><div><h4 class="ie-g">Datos de la etiqueta</h4><table class="ie-t il-datos"><tbody>
        ${fila('Proveedor',esc(l.proveedor))}${fila('Producto',esc(l.producto))}${fila('Categoría',esc(l.categoria))}${fila('Lote del proveedor',esc(l.loteProveedor))}${fila('Orden interna (OI)',esc(l.ordenInterna))}${fila('Orden de compra',esc(l.ordenCompra))}
        ${fila('Fecha de producción',esc(fecha(l.fechaProduccion)))}${fila('Fecha de vencimiento',esc(fecha(l.fechaVencimiento)))}${fila('Artículo del catálogo',l.itemNombre?esc(l.itemNombre)+(l.itemCode?' <small class="ii-mut">('+esc(l.itemCode)+')</small>':''):'')}
        ${fila('Creado',esc(hora(l.creadoEn))+' · '+esc(l.creadoPor||'—'))}</tbody></table></div>
        <div><h4 class="ie-g">Resumen</h4><div class="ii-resumen"><div><b>${r.total}</b><span>unidades</span></div><div><b>${r.porEstado.EN_ALMACEN}</b><span>en almacén</span></div><div><b>${r.porEstado.ENTREGADA_LINEA+r.porEstado.EN_USO}</b><span>en línea</span></div><div><b>${esc(kg(r.pesoActualKg))}</b><span>peso actual</span></div></div></div></div>
      <h4 class="ie-g">Unidades (caja / bobina)</h4><div class="il-tabla-w"><table class="ie-t il-unidades"><thead><tr><th>Unidad</th><th>Estado</th><th>Línea</th><th>Peso neto</th><th>Peso actual</th><th>Cantidad</th><th>Origen</th></tr></thead><tbody>${unidades||'<tr><td colspan="7" class="ii-mut">Sin unidades.</td></tr>'}</tbody></table></div>
      <h4 class="ie-g">Línea de tiempo</h4>${Z.cache.listo.movimientos?(hist?`<ul class="il-tl">${hist}</ul>`:'<p class="ii-mut">Sin movimientos.</p>'):'<p class="ii-mut">Consultando…</p>'}</div>`;
  }

  function html(){
    Z.escuchar();EV.escuchar();
    const msg=S.msg?`<div class="ii-msg ii-msg-${S.msg.tipo}" role="${S.msg.tipo==='error'?'alert':'status'}">${esc(S.msg.texto)}</div>`:'';
    const error=Z.cache.error?`<div class="ii-msg ii-msg-error" role="alert">No se pudieron leer los lotes: ${esc(Z.cache.error)}</div>`:'';
    return `<div class="ii-card"><div class="ii-fila-t"><h3>Lotes de insumos</h3>${Z.puedeEscribir()?'':'<span class="ii-chip">Solo consulta</span>'}</div>
      <p class="ii-mut">Cada etiqueta validada en Evidencias se convierte en una unidad de un lote rastreable: del proveedor a la línea y al cuadro de producción. No mueve el stock SAP.</p>${msg}${error}</div>
      <div class="ie-grid"><aside class="ii-card ie-lista"><div class="ie-filtros">${filtros()}</div><div id="il-lista">${listaHtml()}</div></aside><section>${fichaHtml()}</section></div>`;
  }

  window.ilSel=id=>{S.sel=id;S.msg=null;Z.escucharMovimientos(id);repintar();};
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
  window.ilCerrar=()=>{S.crear=null;if(typeof closeModal==='function')closeModal();else{const r=raiz();if(r)r.innerHTML='';}};

  /** Qué pasaría al crear: lote nuevo o unidad en un lote existente, duplicado, leyenda y errores. Puro sobre la caché. */
  function diagnostico(d){
    const p=Z.cache.parametros,edit=N.EDITABLES.includes(d.estado);
    const errores=[],avisos=[];
    if(edit){const v=N.validarAprobacion(d);errores.push(...v.errores);avisos.push(...v.avisos);}
    const v=T.validarParaLote(d,{parametros:p});
    v.errores.forEach(e=>{if(!errores.includes(e))errores.push(e);});v.avisos.forEach(a=>{if(!avisos.includes(a))avisos.push(a);});
    const datos=v.datos||T.datosDeEvidencia(d),clave=T.claveLote(datos);
    const lote=Z.cache.lotes.find(l=>l.clave===clave)||null;
    const unidad=lote&&datos.numero?Z.unidadPorId(T.idUnidad(lote.id,datos.numero)):null;
    if(unidad)errores.unshift('La unidad '+datos.numero+' del lote '+datos.loteProveedor+' ya existe ('+unidad.id+'): es un duplicado y no se crea otra.');
    return {errores,avisos,datos,lote,unidad,leyenda:T.interpretarLeyenda(d.leyenda,p),clave};
  }

  window.ilAbrirCrear=id=>{
    const d=EV.porId(id);if(!d||!Z.puedeEscribir())return;
    const U=window.iiEvidenciasUI;
    if(U&&U.hayEdicion()&&Object.keys(U.cambiosPendientes(d)).length){U.aviso('error','Tienes cambios sin guardar. Pulsa «Guardar cambios» y luego confirma el lote.');U.repintar();return;}
    const g=diagnostico(d),s=Z.sugerencias(d);
    S.crear={id:d.id,rev:d.rev,articulo:s.candidatos.length?s.candidatos[0].id:'',candidatos:s.candidatos};
    const l=g.leyenda,estado=l.tipo==='LINEA'?'ENTREGADA_LINEA':'EN_ALMACEN';
    const que=g.lote?`Se agregará la unidad <b>${esc(g.datos.numero)}</b> al lote existente <b>${esc(g.lote.id)}</b> (${esc(g.lote.loteProveedor)}).`:`Se creará un <b>lote nuevo</b> para el lote del proveedor <b>${esc(g.datos.loteProveedor)}</b> y su unidad <b>${esc(g.datos.numero)}</b>.`;
    const leyenda=d.leyenda?(l.ambigua?`<div class="ii-msg ii-msg-error">La leyenda «${esc(d.leyenda)}» es ambigua (trae más de una): se ignora.</div>`:l.leyenda?`<p>Leyenda de la foto: <b>${esc(l.leyenda)}</b> → la unidad quedará <b>${esc(T.ESTADOS[estado])}</b>${l.linea?' en '+esc(l.linea):''}.</p>`:`<p class="ii-mut">Leyenda de la foto: «${esc(d.leyenda)}» (no es una leyenda válida; la unidad queda en almacén).</p>`):'<p class="ii-mut">La foto llegó sin leyenda: la unidad queda <b>En almacén</b>.</p>';
    const cand=s.candidatos.length?`<fieldset class="il-art"><legend>Artículo del catálogo del Inventario</legend>${s.candidatos.map((c,i)=>`<label class="il-op"><input type="radio" name="il-art" value="${esc(c.id)}" ${i===0?'checked':''} onchange="ilArticulo(this.value)"><span><b>${esc(c.nombre)}</b>${c.itemCode?' <small class="ii-mut">('+esc(c.itemCode)+')</small>':''}<small class="ii-mut">${esc(c.razones.join(' · '))}</small></span></label>`).join('')}
      <label class="il-op"><input type="radio" name="il-art" value="" onchange="ilArticulo(this.value)"><span><b>Ninguno / elegir después</b></span></label></fieldset>`:'<p class="ii-mut">No hay artículo del catálogo que coincida: el lote se crea sin artículo (se puede completar después).</p>';
    const ok=!g.errores.length;
    abrirModal(d.estado==='aprobado_dato'?'Crear lote':'Confirmar y crear lote',`<p>${que}</p>
      ${g.errores.length?`<div class="ii-msg ii-msg-error" role="alert"><b>No se puede crear todavía:</b><ul class="ii-lista-sm">${g.errores.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
      ${g.avisos.length?`<ul class="ii-lista-sm">${g.avisos.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
      <table class="ie-t il-datos"><tbody>${fila('Proveedor',esc(g.datos.proveedor))}${fila('Producto',esc(g.datos.producto))}${fila('Lote del proveedor',esc(g.datos.loteProveedor))}${fila('N.º caja / bobina',esc(g.datos.numero))}${fila('Peso neto',esc(kg(g.datos.pesoNeto)))}${fila('Peso bruto',esc(kg(g.datos.pesoBruto)))}${fila('OI / OC',esc([g.datos.ordenInterna,g.datos.ordenCompra].filter(Boolean).join(' · ')))}</tbody></table>
      ${leyenda}${cand}
      <p class="ii-mut">${d.estado==='aprobado_dato'?'Los datos ya estaban aprobados.':'Al confirmar también se aprueban los datos de la evidencia.'} No se registra stock SAP.</p>
      <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="ilCerrar()">Cancelar</button><button type="button" class="ii-btn" id="il-m-ok" onclick="ilCrearOk()" ${ok?'':'disabled'}>${d.estado==='aprobado_dato'?'Crear lote':'Confirmar y crear lote'}</button></div>`);
  };
  window.ilArticulo=v=>{if(S.crear)S.crear.articulo=v;};
  window.ilCrearOk=async()=>{
    const c=S.crear;if(!c)return;
    const b=document.getElementById('il-m-ok');if(b)b.disabled=true;errorModal('');
    try{
      const r=await Z.crearLoteDesdeEvidencia(c.id,c.rev,{articuloId:c.articulo});
      const U=window.iiEvidenciasUI;
      ilCerrar();
      if(U){U.aviso('ok',(r.accion==='lote_nuevo'?'Lote ':'Unidad agregada al lote ')+r.loteId+' · unidad '+r.unidadId+' ('+T.ESTADOS[r.estado].toLowerCase()+(r.linea?' en '+r.linea:'')+').');U.repintar();}
    }catch(e){errorModal(Z.mensajeError(e));if(b)b.disabled=false;}
  };

  const css=`
.ii-p-azul{background:#dbeafe;color:#1d4ed8}.il-filtros{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.il-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin-top:8px}
.il-datos th{width:42%}.il-tabla-w{overflow-x:auto}.il-unidades th{text-align:left;font-size:12px;color:#475467;background:#f4f8fc}.il-unidades td{vertical-align:top}.il-unidades td small{display:block}
.il-tl{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:6px}.il-tl li{background:#f8fbff;border:1px solid var(--ii-linea);border-radius:8px;padding:8px 10px;font-size:13.5px}
.il-art{border:1px solid var(--ii-linea);border-radius:10px;margin:10px 0;padding:8px 12px}.il-art legend{font-weight:600;font-size:13px;padding:0 6px}.il-op{display:flex;gap:8px;align-items:flex-start;padding:6px 0;cursor:pointer}.il-op small{display:block}
@media(max-width:900px){.il-cols{grid-template-columns:1fr}}
@media(max-width:560px){.il-filtros{grid-template-columns:1fr}.il-unidades thead{display:none}.il-unidades,.il-unidades tbody,.il-unidades tr,.il-unidades td{display:block;width:100%}.il-unidades tr{border-top:1px solid #edf2f7;padding:6px 0}.il-unidades td::before{content:attr(data-t) ': ';font-weight:600;color:#475467}}`;

  window.iiLotesUI={html,css,estado:S,usar:h=>{if(h&&typeof h.pintar==='function'&&typeof h.activo==='function')host=h;}};
  window.__trazabilidadLotesPantalla={S,diagnostico};

  /* Tiempo real: lo que otra persona cree o cambie aparece solo, sin pisar lo que se está escribiendo. */
  Z.alCambiar(()=>{
    if(!host.activo())return;
    if(document.querySelector('.ii input:focus,.ii select:focus,.ii textarea:focus,#modal-root .modal'))return;
    host.pintar();
  });
})();
