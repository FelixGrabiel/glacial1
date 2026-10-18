/* =============================================================
   GLACIAL · INVENTARIO DE INSUMOS — CONTEO FÍSICO (Fase 2): pestaña «Conteo físico»
   -------------------------------------------------------------
   Lista de conteos (EN PROCESO / CERRADO) y detalle de un conteo: buscador grande, filtro por categoría y, por artículo, VARIAS LÍNEAS
   por ubicación («Rack A: 1000», «Patio: 9000») que el sistema suma. Pensada para celular (360 px). Mientras el conteo está EN PROCESO
   cualquiera con permiso de escritura agrega, edita o borra líneas (cada línea guarda quién y cuándo); al cerrarlo queda de solo lectura y
   solo un Administrador puede reabrirlo (con motivo). Todo se guarda en tiempo real con transacciones (75-inventario-insumos-datos.js).
   Se integra en la pantalla de 76-inventario-insumos-pantalla.js (window.iiConteoUI); cargar DESPUÉS de 76 y ANTES de 12-init.js.
   ============================================================= */
(function instalarInventarioInsumosConteo(){
  'use strict';
  const N=window.glacialInventarioNucleo,D=window.glacialInventarioDatos;
  if(!N||!D)return;
  const num=N.num,fmt=N.fmt;
  const esc=v=>typeof escaparHtml==='function'?escaparHtml(String(v==null?'':v)):String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hoyIso=()=>new Date(Date.now()-5*3600000).toISOString().slice(0,10);
  const raiz=()=>document.getElementById('modal-root');
  const repintar=()=>{const p=window.__inventarioInsumosPantalla;if(p)p.pintar();};
  const PASO=60;

  const C={id:'',texto:'',categoria:'',soloPendientes:false,prioritarios:true,limite:PASO,abierto:'',msg:null,modal:null,imp:null};
  const nombreAlmacen=a=>a==='TODOS'?'Todos los almacenes':(N.ALMACENES.find(x=>x.clave===a)||{nombre:a}).nombre;
  const hora=ms=>{if(!ms)return '';const d=new Date(Number(ms)-5*3600000),p=n=>String(n).padStart(2,'0');return p(d.getUTCDate())+'/'+p(d.getUTCMonth()+1)+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes());};
  const fechaTxt=f=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(f||'');return m?m[3]+'/'+m[2]+'/'+m[1]:(f||'');};
  const metaActual=()=>D.cache.conteos.find(c=>c.id===C.id)||null;
  const abierto=m=>!!m&&m.estado==='EN_PROCESO';
  const puedeEditar=m=>abierto(m)&&D.puedeEscribir();
  const lineasActuales=()=>(D.cache.conteoId===C.id&&D.cache.conteo&&Array.isArray(D.cache.conteo.items))?D.cache.conteo.items:[];
  const estadoPill=m=>m.estado==='EN_PROCESO'?'<span class="ii-pill ii-p-naranja"><i></i>En proceso</span>':'<span class="ii-pill ii-p-verde"><i></i>Cerrado</span>';

  /* ---------- lista de conteos ---------- */
  function lista(){
    const cs=D.cache.conteos;
    const nuevo=D.puedeEscribir()?'<span class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="iicImportar()">⬆ Importar conteo del Excel (crea un conteo nuevo)</button><button type="button" class="ii-btn" onclick="iicNuevo()">+ Nuevo conteo</button></span>':'';
    const tarjetas=cs.map(c=>`<button type="button" class="ii-cc" onclick="iicAbrir('${esc(c.id)}')"><span class="ii-cc-t"><b>${esc(fechaTxt(c.fecha))}</b> ${estadoPill(c)}</span>
      <span>${esc(nombreAlmacen(c.almacen))}</span><small>${fmt(c.articulos||0,0)} artículos · ${fmt(c.lineas||0,0)} líneas · creó ${esc(c.creadoPor||'—')}</small>
      ${c.observacion?`<small class="ii-mut">${esc(c.observacion)}</small>`:''}</button>`).join('');
    return `<div class="ii-card"><div class="ii-fila-t"><h3>Conteos físicos</h3>${nuevo}</div>
      ${cs.length?`<div class="ii-conteos">${tarjetas}</div>`:`<p class="ii-mut">${D.cache.listo.conteos?'Aún no hay conteos. Crea el primero con «Nuevo conteo».':'Consultando…'}</p>`}</div>`;
  }

  /* ---------- detalle ---------- */
  function filasDetalle(){
    const tot=N.totalesConteo(lineasActuales(),D.cache.catalogo);
    return {tot,filas:N.filasConteo(D.cache.catalogo,tot,{categoria:C.categoria,texto:C.texto,prioritarios:C.prioritarios,soloPendientes:C.soloPendientes})};
  }
  function lineaHtml(l,editable){
    return `<li class="ii-ln"><span class="ii-ln-u">${esc(l.ubicacion)}</span><b class="ii-ln-c">${fmt(l.cantidad)}</b>
      <small>${esc(l.por||'—')} · ${esc(hora(l.en))}${l.editadoPor?` · editó ${esc(l.editadoPor)}`:''}</small>
      ${editable?`<span class="ii-ln-a"><button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="iicEditarLinea('${esc(l.id)}')">Editar</button><button type="button" class="ii-btn ii-btn-o ii-btn-s ii-peligro" onclick="iicBorrarLinea('${esc(l.id)}')">Borrar</button></span>`:''}</li>`;
  }
  function formLinea(m,r){
    const ubic=N.ubicacionesUsadas(lineasActuales());
    return `<form class="ii-alta" onsubmit="return iicAgregar(event,'${esc(r.id)}')"><label class="ii-campo"><span>Ubicación</span><input type="text" name="ubicacion" list="ii-ubic" maxlength="60" placeholder="Ej. Rack A, Patio" autocomplete="off"></label>
      <label class="ii-campo"><span>Cantidad (${esc(r.unidad||'UND')})</span><input type="number" name="cantidad" inputmode="decimal" step="any" min="0" placeholder="0" required></label>
      <button type="submit" class="ii-btn">Agregar</button><datalist id="ii-ubic">${ubic.map(u=>`<option value="${esc(u)}">`).join('')}</datalist></form>`;
  }
  function tarjetaArticulo(m,r){
    const ed=puedeEditar(m);
    return `<article class="ii-art ${r.contado?'ii-art-ok':''}"><div class="ii-art-c"><div><b class="ii-art-n">${esc(r.nombre)}</b><small class="ii-mut"><b>${esc(r.codigo||'')}</b> ${esc(r.itemCode?'· SAP '+r.itemCode:'')} · ${esc(r.categoria)}${r.marca?' · '+esc(r.marca):''}</small></div>
      <div class="ii-art-t"><span>Contado</span><b>${r.contado?fmt(r.total):'—'}</b></div></div>
      ${r.lineas.length?`<ul class="ii-lns">${r.lineas.map(l=>lineaHtml(l,ed)).join('')}</ul>`:''}
      ${ed?(C.abierto===r.id?formLinea(m,r):`<button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="iicForm('${esc(r.id)}')">+ Agregar línea</button>`):''}</article>`;
  }
  function detalle(){
    const m=metaActual();
    if(!m)return `<div class="ii-card"><p class="ii-mut">${D.cache.listo.conteos?'Ese conteo ya no existe.':'Consultando…'}</p><button type="button" class="ii-btn ii-btn-o" onclick="iicVolver()">Volver</button></div>`;
    if(D.cache.conteoId!==C.id){const id=C.id;setTimeout(()=>{if(D.cache.conteoId!==id)D.escucharConteo(id);},0);}      // venía de otra pestaña que escuchaba otro conteo
    const {tot,filas}=filasDetalle(),prog=N.progresoConteo(D.cache.catalogo,tot,C.prioritarios);
    const cats=N.CATEGORIAS.filter(c=>D.cache.catalogo.some(x=>x.categoria===c));
    const admin=D.esAdmin();
    const accion=abierto(m)?(D.puedeEscribir()?'<button type="button" class="ii-btn" onclick="iicCerrarConteo()">Cerrar conteo</button>':''):(admin?'<button type="button" class="ii-btn ii-btn-o" onclick="iicReabrir()">Reabrir conteo</button>':'');
    const borrar=admin?'<button type="button" class="ii-btn ii-btn-o ii-peligro" onclick="iicBorrarConteo()" title="Solo Administrador">Borrar conteo</button>':'';
    const reab=(m.reaperturas||[]).map(x=>`<li>${esc(hora(x.en))} · ${esc(x.por)}: ${esc(x.motivo)}</li>`).join('');
    const mostrar=filas.slice(0,C.limite);
    return `<div class="ii-card"><div class="ii-fila-t"><div><button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="iicVolver()">← Conteos</button></div><span class="ii-acc">${borrar}${accion}</span></div>
      <h3 class="ii-h">${esc(fechaTxt(m.fecha))} · ${esc(nombreAlmacen(m.almacen))} ${estadoPill(m)}</h3>
      <p class="ii-mut">Creó ${esc(m.creadoPor||'—')} · ${esc(hora(m.creadoEn))}${m.cerradoPor?` · Cerró ${esc(m.cerradoPor)} · ${esc(hora(m.cerradoEn))}`:''}</p>
      ${reab?`<details class="ii-reab"><summary>Reaperturas (${(m.reaperturas||[]).length})</summary><ul>${reab}</ul></details>`:''}
      ${puedeEditar(m)?'<div class="ii-fila-t"><button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="iicImportarExcel()" title="Sube el Excel con el conteo físico: artículo o código y cantidad contada">Importar conteo desde Excel</button></div>':''}
      ${ubicacionesHtml(m)}
      ${puedeEditar(m)?`<label class="ii-campo"><span>Observación general</span><input type="text" id="ii-c-obs" maxlength="500" value="${esc(m.observacion||'')}" onchange="iicObservacion(this.value)"></label>`:(m.observacion?`<p><b>Observación:</b> ${esc(m.observacion)}</p>`:'')}
      <div class="ii-prog"><div class="ii-barra"><i style="width:${prog.pct}%"></i></div><small>${fmt(prog.contados,0)} de ${fmt(prog.total,0)} artículos contados (${prog.pct}%) · ${fmt(lineasActuales().length,0)} líneas</small></div></div>
      <div class="ii-card"><input type="search" id="ii-c-texto" class="ii-grande" value="${esc(C.texto)}" placeholder="Buscar artículo por nombre o código" oninput="iicTexto(this.value)" autocomplete="off">
      <div class="ii-filtros"><label class="ii-campo"><span>Categoría</span><select onchange="iicFiltro('categoria',this.value)"><option value="">Todas</option>${cats.map(c=>`<option ${c===C.categoria?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="ii-chk"><input type="checkbox" ${C.prioritarios?'checked':''} onchange="iicFiltro('prioritarios',this.checked)"> Solo prioritarios</label>
      <label class="ii-chk"><input type="checkbox" ${C.soloPendientes?'checked':''} onchange="iicFiltro('soloPendientes',this.checked)"> Solo pendientes</label></div>
      <div id="ii-c-lista">${listaArticulos(m,mostrar,filas.length)}</div></div>`;
  }
  /* Líneas por ubicación, con «Borrar» para quitar de una vez una importación repetida. */
  function ubicacionesHtml(m){
    const por=new Map();lineasActuales().forEach(l=>por.set(l.ubicacion,(por.get(l.ubicacion)||0)+1));
    if(por.size<2&&!(por.size===1&&puedeEditar(m)))return '';
    const filas=[...por].sort((a,b)=>b[1]-a[1]).map(([u,n])=>`<li><span>«${esc(u)}»</span> <b>${fmt(n,0)}</b> línea(s)${puedeEditar(m)?` <button type="button" class="ii-btn ii-btn-o ii-btn-s ii-peligro" data-ub="${esc(u)}" onclick="iicBorrarUbicacion(this.dataset.ub)">Borrar estas líneas</button>`:''}</li>`).join('');
    return `<details class="ii-reab"${por.size>1?' open':''}><summary>Líneas por ubicación (${por.size})</summary><ul class="ii-lista-sm">${filas}</ul></details>`;
  }
  function listaArticulos(m,mostrar,total){
    const mas=total>mostrar.length?`<div class="ii-mas"><button type="button" class="ii-btn ii-btn-o" onclick="iicMas()">Mostrar más (${fmt(total-mostrar.length,0)} restantes)</button></div>`:'';
    return (mostrar.map(r=>tarjetaArticulo(m,r)).join('')||'<p class="ii-vacio">Ningún artículo coincide con los filtros.</p>')+mas+`<p class="ii-pie">${fmt(total,0)} artículo(s).</p>`;
  }
  function html(){
    const msg=C.msg?`<div class="ii-msg ii-msg-${C.msg.tipo}" role="${C.msg.tipo==='error'?'alert':'status'}">${esc(C.msg.texto)}</div>`:'';
    return msg+(C.id?detalle():lista());
  }

  /* ---------- acciones ---------- */
  const aviso=(tipo,texto)=>{C.msg={tipo,texto};};
  const falloMsg=e=>{aviso('error',D.mensajeError(e));repintar();};
  function pintarLista(){
    const c=document.getElementById('ii-c-lista');if(!c||!C.id){repintar();return;}
    const m=metaActual(),{filas}=filasDetalle();if(!m){repintar();return;}
    c.innerHTML=listaArticulos(m,filas.slice(0,C.limite),filas.length);
  }
  let espera=null;
  window.iicTexto=v=>{C.texto=v;C.limite=PASO;clearTimeout(espera);espera=setTimeout(pintarLista,150);};
  window.iicFiltro=(k,v)=>{C[k]=v;C.limite=PASO;repintar();};
  window.iicMas=()=>{C.limite+=PASO;pintarLista();};
  window.iicAbrir=id=>{C.id=id;C.abierto='';C.texto='';C.limite=PASO;C.msg=null;D.escucharConteo(id);repintar();};
  window.iicVolver=()=>{C.id='';C.msg=null;D.escucharConteo('');repintar();};
  window.iicForm=id=>{C.abierto=id;repintar();setTimeout(()=>{const i=document.querySelector('.ii-alta input[name=ubicacion]');if(i)i.focus();},0);};
  window.iicAgregar=(ev,itemId)=>{
    ev.preventDefault();const f=ev.target,ub=f.ubicacion.value,cant=f.cantidad.value;
    const b=f.querySelector('button');if(b)b.disabled=true;
    D.agregarLinea(C.id,{itemId,ubicacion:ub,cantidad:cant}).then(()=>{C.msg=null;C.abierto=itemId;repintar();setTimeout(()=>{const i=document.querySelector('.ii-alta input[name=ubicacion]');if(i)i.focus();},0);})
      .catch(e=>{if(b)b.disabled=false;falloMsg(e);});
    return false;
  };
  window.iicObservacion=v=>{D.guardarObservacion(C.id,v).then(()=>{aviso('ok','Observación guardada.');repintar();}).catch(falloMsg);};

  function abrirModal(titulo,cuerpo){
    const r=raiz();if(!r)return;
    r.innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)iicCerrarModal()"><div class="modal ii-modal" role="dialog" aria-modal="true"><div class="modal-head"><h3>${esc(titulo)}</h3>
      <button class="modal-close" onclick="iicCerrarModal()" aria-label="Cerrar">✕</button></div><div class="modal-body">${cuerpo}<div class="ii-msg ii-msg-error" id="ii-m-error" hidden></div></div></div></div>`;
  }
  const errorModal=t=>{const e=document.getElementById('ii-m-error');if(e){e.hidden=!t;e.textContent=t||'';}};
  window.iicCerrarModal=()=>{C.modal=null;if(typeof closeModal==='function')closeModal();else{const r=raiz();if(r)r.innerHTML='';}};


  /* ---------- importar el conteo desde Excel ---------- */
  const cederTurno=()=>new Promise(r=>setTimeout(r,0));
  async function leerExcel(archivo){
    if(typeof XLSX==='undefined')throw new Error('No se cargó la librería de Excel. Revisa tu conexión a internet y recarga la página.');
    const wb=XLSX.read(new Uint8Array(await archivo.arrayBuffer()),{type:'array',cellDates:false});
    const hojas=[];
    for(const nombre of wb.SheetNames){await cederTurno();hojas.push({nombre,filas:XLSX.utils.sheet_to_json(wb.Sheets[nombre],{header:1,raw:true,defval:null,blankrows:false})});}
    return hojas;
  }
  const cuerpoImp=()=>{
    const i=C.imp;if(!i)return '';
    if(i.fase==='elegir')return `<p>Sube el Excel del conteo físico. Debe tener una fila de títulos con el <b>artículo</b> (o su <b>código</b>) y una columna <b>«Conteo»</b> o <b>«Cantidad»</b>; si trae <b>«Ubicación»</b> también se guarda. Cada fila se une al catálogo por código interno (INS-), código SAP o nombre, y se agrega como una línea del conteo.</p>
      <label class="ii-campo"><span>Archivo (.xlsx)</span><input type="file" id="ii-imp-archivo" accept=".xlsx,.xlsm,.xls" onchange="iicArchivoExcel(this)"></label>`;
    if(i.fase==='leyendo')return `<p><b>Leyendo el archivo…</b></p>`;
    if(i.fase==='error')return `<div class="ii-msg ii-msg-error" role="alert">${esc(i.error)}</div><div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="iicImportarExcel()">Elegir otro archivo</button></div>`;
    const l=i.lectura,r=l.resumen;
    return `<p><b>${esc(i.archivo)}</b> · hoja «${esc(String(l.hoja||'').trim())}»</p>
      <div class="ii-resumen"><div><b>${fmt(r.unidas,0)}</b><span>líneas listas para guardar</span></div><div><b>${fmt(r.sinUnir,0)}</b><span>sin unir al catálogo</span></div><div><b>${fmt(r.vacias,0)}</b><span>sin cantidad (se omiten)</span></div></div>
      ${r.sinUnir?`<details class="ii-reab"><summary>Ver los ${fmt(r.sinUnir,0)} que no se pudieron unir</summary><ul class="ii-lista-sm">${l.sinUnir.slice(0,200).map(x=>`<li>${esc(x.texto)} · ${esc(x.cantidad)} <small class="ii-mut">(${esc(x.motivo)})</small></li>`).join('')}</ul></details>`:''}
      ${duplicadosImp(l)}
      <p class="ii-mut">Las líneas se agregan al conteo del ${esc(fechaTxt(metaActual()&&metaActual().fecha))}; lo que ya estaba registrado no se borra (si repites un artículo, las cantidades se suman). Después puedes editar o borrar líneas una por una.</p>
      <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="iicImportarExcel()">Elegir otro archivo</button><button type="button" class="ii-btn" id="ii-imp-ok" onclick="iicConfirmarExcel()">Guardar ${fmt(r.unidas,0)} líneas</button></div>`;
  };
  /* Aviso: artículos del Excel que ya tienen líneas en este conteo (se sumarían y duplicarían la cantidad). */
  function duplicadosImp(l){
    const ya=new Set(lineasActuales().map(x=>x.itemId)),n=l.lineas.filter(x=>ya.has(x.itemId)).length;
    return n?`<div class="ii-msg ii-msg-error" role="alert"><b>Atención:</b> ${fmt(n,0)} de estos artículos ya tienen líneas en este conteo. Si guardas, las cantidades se SUMAN y quedan duplicadas. Si ya importaste este archivo, cancela; para repetirlo usa «Borrar estas líneas» en «Líneas por ubicación».</div>`:'';
  }
  function pintarImp(){
    abrirModal('Importar conteo desde Excel',`<div id="ii-imp-cuerpo">${cuerpoImp()}</div>`);
  }
  window.iicImportarExcel=()=>{
    const m=metaActual();if(!puedeEditar(m))return;
    C.imp={fase:'elegir'};pintarImp();
  };
  window.iicArchivoExcel=async input=>{
    const archivo=input&&input.files&&input.files[0];if(!archivo||!C.imp)return;
    const i=C.imp;i.fase='leyendo';i.archivo=archivo.name;pintarImp();
    try{
      const hojas=await leerExcel(archivo);
      const l=N.leerConteoExcel(hojas,D.cache.catalogo);
      if(l.error){i.fase='error';i.error=l.error;}else{i.fase='resumen';i.lectura=l;}
    }catch(e){i.fase='error';i.error='No se pudo leer el archivo: '+((e&&e.message)||e);}
    if(C.imp===i)pintarImp();
  };
  window.iicConfirmarExcel=async()=>{
    const i=C.imp;if(!i||i.fase!=='resumen')return;
    const b=document.getElementById('ii-imp-ok');if(b)b.disabled=true;errorModal('');
    try{
      const ya=new Set(lineasActuales().map(x=>x.itemId)),dup=i.lectura.lineas.filter(x=>ya.has(x.itemId)).length;
      if(dup&&typeof confirm==='function'&&!confirm(dup+' artículos ya tienen líneas en este conteo: las cantidades se sumarán y quedarán duplicadas. ¿Guardar de todos modos?')){if(b)b.disabled=false;return;}
      const r=await D.agregarLineasLote(C.id,i.lectura.lineas,i.archivo);
      C.imp=null;iicCerrarModal();aviso('ok',`Se importaron ${fmt(r.lineas,0)} líneas desde «${i.archivo}».`);repintar();
    }catch(e){errorModal(D.mensajeError(e));if(b)b.disabled=false;}
  };

  window.iicBorrarUbicacion=ub=>{
    const n=lineasActuales().filter(l=>l.ubicacion===ub).length;if(!n)return;C.modal=ub;
    abrirModal('Borrar líneas por ubicación',`<p>¿Borrar las <b>${fmt(n,0)}</b> líneas de la ubicación <b>«${esc(ub)}»</b>? Si esta ubicación viene de una importación repetida, el conteo vuelve a su cantidad real. Queda un solo registro en la auditoría.</p>
      <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="iicCerrarModal()">Cancelar</button><button type="button" class="ii-btn ii-peligro-f" id="ii-m-ok" onclick="iicConfirmarBorrarUbicacion()">Borrar ${fmt(n,0)} líneas</button></div>`);
  };
  window.iicConfirmarBorrarUbicacion=async()=>{
    const b=document.getElementById('ii-m-ok');if(b)b.disabled=true;errorModal('');
    try{const r=await D.borrarLineasUbicacion(C.id,C.modal);iicCerrarModal();aviso('ok',r?'Se borraron '+fmt(r.borradas,0)+' líneas.':'No había líneas en esa ubicación.');repintar();}
    catch(e){errorModal(D.mensajeError(e));if(b)b.disabled=false;}
  };
  window.iicBorrarConteo=()=>{
    const m=metaActual();if(!m||!D.esAdmin())return;
    abrirModal('Borrar conteo',`<p>¿Borrar el conteo del <b>${esc(fechaTxt(m.fecha))}</b> (${esc(nombreAlmacen(m.almacen))}, ${fmt(m.articulos||0,0)} artículos, ${fmt(m.lineas||0,0)} líneas)? Dejará de verse en la lista y en la conciliación. Queda registrado en la auditoría con tu nombre y el motivo.</p>
      <label class="ii-campo"><span>Motivo (obligatorio)</span><input type="text" id="ii-b-motivo" maxlength="300" placeholder="Ej. Importación repetida"></label>
      <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="iicCerrarModal()">Cancelar</button><button type="button" class="ii-btn ii-peligro-f" id="ii-m-ok" onclick="iicConfirmarBorrarConteo()">Borrar conteo</button></div>`);
  };
  window.iicConfirmarBorrarConteo=async()=>{
    const b=document.getElementById('ii-m-ok');if(b)b.disabled=true;errorModal('');
    try{await D.borrarConteo(C.id,document.getElementById('ii-b-motivo').value);iicCerrarModal();C.id='';D.escucharConteo('');aviso('ok','Conteo borrado.');repintar();}
    catch(e){errorModal(D.mensajeError(e));if(b)b.disabled=false;}
  };
  window.iicNuevo=()=>{
    if(!D.puedeEscribir())return;
    abrirModal('Nuevo conteo',`<div class="ii-form1"><label class="ii-campo"><span>Fecha</span><input type="date" id="ii-n-fecha" value="${hoyIso()}"></label>
      <label class="ii-campo"><span>Almacén</span><select id="ii-n-alm"><option value="INSUMOS" selected>${esc(N.almacenInfo('INSUMOS').nombre)}</option>
      ${N.ALMACENES.filter(a=>a.clave!=='INSUMOS').map(a=>`<option value="${a.clave}">${esc(a.nombre)}</option>`).join('')}<option value="TODOS">Todos los almacenes</option></select></label>
      <label class="ii-campo"><span>Observación general (opcional)</span><input type="text" id="ii-n-obs" maxlength="500"></label></div>
      <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="iicCerrarModal()">Cancelar</button><button type="button" class="ii-btn" id="ii-m-ok" onclick="iicCrear()">Crear conteo</button></div>`);
  };
  window.iicCrear=async()=>{
    const g=i=>document.getElementById(i),b=g('ii-m-ok');if(b)b.disabled=true;errorModal('');
    try{
      const m=await D.crearConteo({fecha:g('ii-n-fecha').value,almacen:g('ii-n-alm').value,observacion:g('ii-n-obs').value});
      iicCerrarModal();C.id=m.id;C.abierto='';C.texto='';C.limite=PASO;D.escucharConteo(m.id);aviso('ok','Conteo creado. Ya pueden registrar líneas.');repintar();
    }catch(e){errorModal(D.mensajeError(e));if(b)b.disabled=false;}
  };
  /* ---------- importar el conteo desde el Excel (columna «CONTEO …» de la hoja RESUMEN) ---------- */
  let importacion=null;
  window.iicImportar=()=>{
    if(!D.puedeEscribir())return;importacion=null;
    abrirModal('Importar conteo del Excel',`<p class="ii-mut">Sube tu hoja (por ejemplo «STOCK INVENTARIO», hoja RESUMEN). Se lee la columna <b>CONTEO …</b> (p. ej. «CONTEO 18.10») y se crea un
      conteo con una línea por artículo. Los artículos se unen al catálogo por su nombre.</p>
      <label class="ii-campo"><span>Archivo Excel</span><input type="file" id="ii-i-arch" accept=".xlsx,.xlsm,.xls" onchange="iicLeerExcel(this)"></label><div id="ii-i-prev"></div>`);
  };
  window.iicLeerExcel=async inp=>{
    const prev=document.getElementById('ii-i-prev'),f=inp.files&&inp.files[0];if(!prev||!f)return;errorModal('');
    prev.innerHTML='<p class="ii-mut">Leyendo el archivo…</p>';
    try{
      if(typeof XLSX==='undefined')throw new Error('No se cargó la librería de Excel. Revisa tu conexión a internet y recarga la página.');
      const wb=XLSX.read(new Uint8Array(await f.arrayBuffer()),{type:'array',cellDates:false});
      const hojas=wb.SheetNames.map(n=>({nombre:n,filas:XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:null,blankrows:false})}));
      const r=N.leerConteoResumen(hojas,D.cache.catalogo);
      if(!r)throw new Error('No encontré una columna «CONTEO …» en el archivo. Revisa que la hoja tenga ese título en la fila de encabezados.');
      if(!r.lineas.length)throw new Error('La columna «'+r.titulo+'» no tiene cantidades que coincidan con el catálogo.');
      importacion={archivo:f.name,r};
      const anio=hoyIso().slice(0,4),fecha=r.dia&&r.mes?anio+'-'+String(r.mes).padStart(2,'0')+'-'+String(r.dia).padStart(2,'0'):hoyIso();
      const total=r.lineas.reduce((t,l)=>t+l.cantidad,0);
      prev.innerHTML=`<div class="ii-msg ii-msg-info">Hoja «${esc(r.hoja)}» · columna «${esc(r.titulo)}»: <b>${fmt(r.lineas.length,0)}</b> artículos con cantidad (suma ${fmt(total)}).
        ${r.sinCatalogo.length?`<br><b>${fmt(r.sinCatalogo.length,0)}</b> no están en el catálogo y no se importarán: ${esc(r.sinCatalogo.slice(0,8).map(x=>x.nombre).join(' · '))}${r.sinCatalogo.length>8?'…':''}`:''}
        ${r.repetidos.length?`<br>Se ignoraron ${fmt(r.repetidos.length,0)} filas repetidas.`:''}</div>
        <div class="ii-form1"><label class="ii-campo"><span>Fecha del conteo</span><input type="date" id="ii-i-fecha" value="${fecha}"></label>
        <label class="ii-campo"><span>Almacén contra el que se compara</span><select id="ii-i-alm"><option value="TODOS" selected>Todos los almacenes (suma de los 6, como tu hoja RESUMEN)</option>
        ${N.ALMACENES.map(a=>`<option value="${a.clave}">${esc(a.nombre)}</option>`).join('')}</select></label></div>
        <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="iicCerrarModal()">Cancelar</button><button type="button" class="ii-btn" id="ii-m-ok" onclick="iicConfirmarImportar()">Crear conteo e importar</button></div>`;
    }catch(e){importacion=null;prev.innerHTML='';errorModal(e&&e.message||String(e));}
  };
  window.iicConfirmarImportar=async()=>{
    if(!importacion)return;
    const g=i=>document.getElementById(i),b=g('ii-m-ok');if(b)b.disabled=true;errorModal('');
    try{
      const m=await D.importarConteo({fecha:g('ii-i-fecha').value,almacen:g('ii-i-alm').value,observacion:'Importado de '+importacion.archivo,archivo:importacion.archivo,lineas:importacion.r.lineas});
      iicCerrarModal();importacion=null;C.id=m.id;C.abierto='';C.texto='';C.limite=PASO;D.escucharConteo(m.id);
      aviso('ok','Conteo importado: '+fmt(m.articulos,0)+' artículos. Revísalo y ciérralo cuando esté listo.');repintar();
    }catch(e){errorModal(D.mensajeError(e));if(b)b.disabled=false;}
  };
  const lineaPorId=id=>lineasActuales().find(l=>l.id===id);
  window.iicEditarLinea=id=>{
    const l=lineaPorId(id);if(!l)return;C.modal=id;
    abrirModal('Editar línea',`<p class="ii-nom-modal">${esc((D.cache.catalogo.find(c=>c.id===l.itemId)||{}).nombre||l.itemId)}</p><div class="ii-form1">
      <label class="ii-campo"><span>Ubicación</span><input type="text" id="ii-l-ub" maxlength="60" value="${esc(l.ubicacion)}"></label>
      <label class="ii-campo"><span>Cantidad</span><input type="number" id="ii-l-cant" inputmode="decimal" step="any" min="0" value="${esc(l.cantidad)}"></label></div>
      <p class="ii-mut">Registró ${esc(l.por||'—')} · ${esc(hora(l.en))}</p>
      <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="iicCerrarModal()">Cancelar</button><button type="button" class="ii-btn" id="ii-m-ok" onclick="iicGuardarLinea()">Guardar</button></div>`);
  };
  window.iicGuardarLinea=async()=>{
    const g=i=>document.getElementById(i),b=g('ii-m-ok');if(b)b.disabled=true;errorModal('');
    try{await D.editarLinea(C.id,C.modal,{ubicacion:g('ii-l-ub').value,cantidad:g('ii-l-cant').value});iicCerrarModal();C.msg=null;repintar();}
    catch(e){errorModal(D.mensajeError(e));if(b)b.disabled=false;}
  };
  window.iicBorrarLinea=id=>{
    const l=lineaPorId(id);if(!l)return;C.modal=id;
    abrirModal('Borrar línea',`<p>¿Borrar la línea <b>${esc(l.ubicacion)}: ${fmt(l.cantidad)}</b>? Quedará registrado en la auditoría.</p>
      <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="iicCerrarModal()">Cancelar</button><button type="button" class="ii-btn ii-peligro-f" id="ii-m-ok" onclick="iicConfirmarBorrar()">Borrar</button></div>`);
  };
  window.iicConfirmarBorrar=async()=>{
    const b=document.getElementById('ii-m-ok');if(b)b.disabled=true;errorModal('');
    try{await D.borrarLinea(C.id,C.modal);iicCerrarModal();C.msg=null;repintar();}catch(e){errorModal(D.mensajeError(e));if(b)b.disabled=false;}
  };
  window.iicCerrarConteo=()=>{
    const r=N.resumenCierre(lineasActuales(),D.cache.catalogo);
    abrirModal('Cerrar conteo',`<p>Se cerrará con <b>${fmt(r.articulosContados,0)}</b> artículos y <b>${fmt(r.lineas,0)}</b> líneas. Después será de solo lectura y solo un Administrador podrá reabrirlo.</p>
      ${r.prioritariosPendientes?`<div class="ii-msg ii-msg-info">Faltan ${fmt(r.prioritariosPendientes,0)} de ${fmt(r.prioritariosTotal,0)} artículos prioritarios por contar.</div>`:''}
      <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="iicCerrarModal()">Seguir contando</button><button type="button" class="ii-btn" id="ii-m-ok" onclick="iicConfirmarCierre()">Cerrar conteo</button></div>`);
  };
  window.iicConfirmarCierre=async()=>{
    const b=document.getElementById('ii-m-ok');if(b)b.disabled=true;errorModal('');
    try{await D.cerrarConteo(C.id);iicCerrarModal();aviso('ok','Conteo cerrado.');repintar();}catch(e){errorModal(D.mensajeError(e));if(b)b.disabled=false;}
  };
  window.iicReabrir=()=>{
    if(!D.esAdmin())return;
    abrirModal('Reabrir conteo',`<label class="ii-campo"><span>Motivo de la reapertura</span><input type="text" id="ii-r-motivo" maxlength="300" placeholder="Ej. Falta contar el Patio"></label>
      <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="iicCerrarModal()">Cancelar</button><button type="button" class="ii-btn" id="ii-m-ok" onclick="iicConfirmarReabrir()">Reabrir</button></div>`);
  };
  window.iicConfirmarReabrir=async()=>{
    const b=document.getElementById('ii-m-ok');if(b)b.disabled=true;errorModal('');
    try{await D.reabrirConteo(C.id,document.getElementById('ii-r-motivo').value);iicCerrarModal();aviso('ok','Conteo reabierto.');repintar();}
    catch(e){errorModal(D.mensajeError(e));if(b)b.disabled=false;}
  };

  const css=`
.ii-fila-t{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}.ii-fila-t h3,.ii-h{margin:0;font-size:19px}
.ii-conteos{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.ii-cc{display:flex;flex-direction:column;gap:4px;text-align:left;background:#f8fbff;border:1px solid var(--ii-linea);border-radius:12px;padding:12px 14px;font:inherit;color:inherit;cursor:pointer}.ii-cc-t{display:flex;justify-content:space-between;gap:8px;align-items:center}
.ii-prog small{color:var(--ii-mut)}.ii-grande{font-size:18px!important;min-height:52px!important;margin-bottom:10px}
.ii-art{border:1px solid var(--ii-linea);border-radius:12px;padding:12px;margin-bottom:10px;background:#fff}.ii-art-ok{border-left:5px solid #16a34a}
.ii-art-c{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.ii-art-n{display:block;font-size:15px;overflow-wrap:anywhere}
.ii-art-t{text-align:right;flex:0 0 auto}.ii-art-t span{display:block;font-size:12px;color:var(--ii-mut)}.ii-art-t b{font-size:22px;color:#0b5cc4}
.ii-lns{list-style:none;margin:8px 0;padding:0;display:grid;gap:6px}.ii-ln{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;background:#f4f8fc;border-radius:8px;padding:8px 10px}
.ii-ln-u{font-weight:600}.ii-ln-c{font-size:16px;margin-left:auto}.ii-ln small{flex:1 0 100%;color:var(--ii-mut)}.ii-ln-a{display:flex;gap:6px;flex:1 0 100%}
.ii-peligro{color:#b42318;border-color:#b42318}.ii-peligro-f{background:#b42318;border-color:#b42318}
.ii-alta{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) auto;gap:8px;align-items:end;margin-top:8px}
.ii-form1{display:grid;gap:10px;margin:8px 0}.ii-reab{margin:6px 0;font-size:13px}
@media(max-width:700px){.ii-alta{grid-template-columns:1fr}.ii-alta .ii-btn{min-height:46px}.ii-art-t b{font-size:20px}}`;
  /* Cambios de otras personas: se vuelve a dibujar y se devuelven el texto escrito y el cursor al campo que se estaba llenando. */
  const CAMPOS=['#ii-c-texto','#ii-c-obs','.ii-alta input[name=ubicacion]','.ii-alta input[name=cantidad]'];
  function conservando(dibujar){
    const a=document.activeElement,guardado=CAMPOS.map(q=>{const e=document.querySelector(q);return e?{q,v:e.value,foco:e===a,i:e.selectionStart,f:e.selectionEnd}:null;}).filter(Boolean);
    dibujar();
    guardado.forEach(g=>{const e=document.querySelector(g.q);if(!e)return;e.value=g.v;if(g.foco){e.focus();try{e.setSelectionRange(g.i,g.f);}catch(_){/* type=number no admite cursor */}}});
  }
  window.iiConteoUI={html,css,volver:()=>{C.id='';D.escucharConteo('');},conservando};
  window.__inventarioInsumosConteo={C,lineasActuales,filasDetalle};
})();
