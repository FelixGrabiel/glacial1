/* =============================================================
   GLACIAL · INVENTARIO DE INSUMOS — PANTALLA (Fase 1: Stock actual, Catálogo e Importar stock SAP)
   -------------------------------------------------------------
   Pestaña propia (state.currentTab='inventario-insumos', botón #btn-inventario-insumos, goInventarioInsumos), mismo patrón que el
   Asistente de Producción (72-asistente-pantalla.js): envuelve renderMain, renderSidebar y ajustarVistaSegunPermisos.
   · La lectura del Excel va en un Web Worker (SheetJS): el archivo puede tener más de 100.000 filas; el worker conserva solo los
     almacenes «AP - …» y los grupos 105/106/107/109 y avisa el avance («Procesando… X%»). Sin Worker se lee en la página.
   · Todo sale de lo que se escucha con onSnapshot (75-inventario-insumos-datos.js): al importar o editar en un dispositivo, los demás
     se actualizan solos. La tabla se dibuja de a 150 filas y el buscador espera 200 ms para no frenar la pantalla.
   ============================================================= */
(function instalarInventarioInsumosPantalla(){
  'use strict';
  const N=window.glacialInventarioNucleo,D=window.glacialInventarioDatos;
  if(!N||!D)return;
  const TAB='inventario-insumos';
  const PASO_FILAS=150;
  const esc=v=>typeof escaparHtml==='function'?escaparHtml(String(v==null?'':v)):String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=N.fmt;
  /* Celda de código: el código interno GLACIAL y, debajo, el código SAP si ya lo tiene. */
  const celdaCodigo=x=>`<b>${esc(x.codigo||'—')}</b>${x.itemCode?`<small>SAP ${esc(x.itemCode)}</small>`:''}`;
  const hoyIso=()=>{const d=new Date(Date.now()-5*3600000);return d.toISOString().slice(0,10);};     // fecha de Perú (UTC-5)
  const cederTurno=()=>new Promise(r=>setTimeout(r,0));

  const II={tab:'stock',limite:PASO_FILAS,msg:null,edicion:null,
    f:{categoria:'',marca:'',almacen:'INSUMOS',prioritarios:true,soloBajoMinimo:false,texto:'',inactivos:false,sinUsoAlFinal:true},
    imp:null};

  /* ---------- datos derivados ---------- */
  function filasActuales(){
    const filas=N.filasStock(D.cache.catalogo,D.cache.corte,II.f.almacen);
    return filas;
  }
  function filasFiltradas(){
    const f={categoria:II.f.categoria,marca:II.f.marca,prioritarios:II.f.prioritarios,soloBajoMinimo:II.f.soloBajoMinimo,texto:II.f.texto,activos:!II.f.inactivos};
    return N.ordenarStock(N.filtrarStock(filasActuales(),f),II.f.sinUsoAlFinal);
  }
  const corteElegido=()=>D.cache.cortes.find(c=>c.id===D.cache.corteId)||null;

  /* ---------- piezas ---------- */
  const PILL={rojo:['ii-p-rojo','Bajo mínimo'],naranja:['ii-p-naranja','Reorden'],verde:['ii-p-verde','OK'],gris:['ii-p-gris','Sin mínimo']};
  const semaforoHtml=s=>{const p=PILL[s]||PILL.gris;return `<span class="ii-pill ${p[0]}" title="${esc(N.SEMAFORO_TXT[s]||'')}"><i></i>${p[1]}</span>`;};
  function opciones(lista,sel,todos){return `<option value="">${esc(todos)}</option>`+lista.map(v=>`<option value="${esc(v)}" ${v===sel?'selected':''}>${esc(v)}</option>`).join('');}
  function marcasPresentes(){return [...new Set(D.cache.catalogo.map(c=>c.marca).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));}
  function categoriasPresentes(){const s=new Set(D.cache.catalogo.map(c=>c.categoria));return N.CATEGORIAS.filter(c=>s.has(c));}

  function tarjetas(){
    const r=N.resumenStock(filasActuales().filter(x=>II.f.prioritarios?x.prioritario:true));
    const c=D.cache.cortes[0]||null;                              // «Último corte»: siempre el más reciente, aunque se esté viendo otro
    const t=(cls,titulo,valor,sub)=>`<div class="ii-kpi ${cls}"><span>${esc(titulo)}</span><b>${valor}</b><small>${esc(sub||'')}</small></div>`;
    return `<div class="ii-kpis">${t('ii-k-azul','Artículos',fmt(r.articulos,0),II.f.prioritarios?'Prioritarios con corte':'Con corte')}
      ${t('ii-k-rojo','Bajo mínimo',fmt(r.bajoMinimo,0),'Según el almacén elegido')}
      ${t('ii-k-ambar','Sin stock',fmt(r.sinStock,0),'Stock en 0')}
      ${t('ii-k-gris','Último corte',c?esc(c.fechaCorte):'—',c?('Importó '+c.importadoPor):'Aún no hay cortes')}</div>`;
  }

  const fechaDmy=f=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(f||'');return m?m[3]+'/'+m[2]+'/'+m[1]:(f||'');};
  /* Orden de lectura: primero el artículo, luego el resultado (total SAP, mínimo, semáforo) y al final el detalle del stock SAP por almacén. */
  function tablaStock(filas){
    const alm=N.ALMACENES;
    const mostrar=filas.slice(0,II.limite);
    const c=corteElegido();
    const fc=c?fechaDmy(c.fechaCorte):'';
    const EN=window.glacialAlmacenEnlaceDatos,aj=EN?EN.ajustes():{};
    const esUltimo=!!(c&&D.cache.cortes[0]&&D.cache.cortes[0].id===c.id);
    const hoy=x=>{if(!x.enCorte)return '—';const a=esUltimo&&x.itemCode?aj[String(x.itemCode).trim().toUpperCase()]:null;
      if(!a)return fmt(x.w[0]);
      return `<b>${fmt(x.w[0]+a.neto)}</b><small class="ii-delta" title="Entregado a Producción / devuelto por Producción desde el corte">${a.entregado?'−'+fmt(a.entregado):''}${a.devuelto?' +'+fmt(a.devuelto):''}</small>`;};
    const cab=`<thead><tr class="ii-g"><th colspan="4">ARTÍCULO</th><th colspan="3" class="ii-g-res">RESULTADO SEGÚN SAP</th><th class="ii-g-hoy">TIEMPO REAL</th><th colspan="${alm.length}" class="ii-g-sap">STOCK SAP POR ALMACÉN${fc?' · corte del '+esc(fc):''}</th></tr>
      <tr><th>Código</th><th>Artículo</th><th>Categoría</th><th>Marca</th><th class="ii-num ii-b-res">Total SAP</th><th class="ii-num">Mínimo</th><th>Semáforo</th><th class="ii-num ii-b-hoy" title="Insumos y Suministros del corte, menos lo entregado a Producción y más lo devuelto desde la fecha del corte. Se actualiza solo.">Almacén hoy</th>
      ${alm.map((a,k)=>`<th class="ii-num ${k===0?'ii-b-sap':''} ${a.clave===II.f.almacen?'ii-col-act':''}" title="${esc(a.nombre)}">${esc(a.corto)}</th>`).join('')}</tr></thead>`;
    const cuerpo=mostrar.map(x=>`<tr class="${x.enCorte?'':'ii-sin-corte'} ${x.sinUso?'ii-sin-uso':''}"><td class="ii-cod">${celdaCodigo(x)}</td><td class="ii-nom">${esc(x.nombre)}${x.activo===false?' <em>(inactivo)</em>':''}</td>
      <td>${esc(x.categoria)}${x.subtipo?` <small>${esc(x.subtipo)}</small>`:''}</td><td>${esc(x.marca||'—')}</td>
      <td class="ii-num ii-b-res"><b>${x.enCorte?fmt(x.total):'—'}</b></td><td class="ii-num">${num(x.stockMinimo)>0?fmt(x.stockMinimo):'—'}</td>
      <td>${x.enCorte?semaforoHtml(x.semaforo):'<span class="ii-pill ii-p-gris"><i></i>Sin corte</span>'}${x.sinUso?' <span class="ii-pill ii-p-sinuso" title="Marcado como sin uso: sigue en el inventario pero va al final de la lista">Sin uso</span>':''}</td><td class="ii-num ii-b-hoy">${hoy(x)}</td>
      ${x.w.map((v,k)=>`<td class="ii-num ${k===0?'ii-b-sap':''} ${alm[k].clave===II.f.almacen?'ii-col-act':''}">${x.enCorte?fmt(v):'—'}</td>`).join('')}</tr>`).join('');
    const mas=filas.length>mostrar.length?`<div class="ii-mas"><button type="button" class="ii-btn ii-btn-o" onclick="iiMasFilas()">Mostrar ${Math.min(PASO_FILAS,filas.length-mostrar.length)} más (${fmt(filas.length-mostrar.length,0)} restantes)</button></div>`:'';
    const nSin=filas.filter(x=>x.sinUso).length;
    return `<div class="ii-tw"><table class="ii-t">${cab}<tbody>${cuerpo||`<tr><td colspan="${alm.length+8}" class="ii-vacio">Ningún artículo coincide con los filtros.</td></tr>`}</tbody></table></div>${mas}
      <p class="ii-pie">${fmt(filas.length,0)} artículo(s)${nSin?` · ${fmt(nSin,0)} sin uso${II.f.sinUsoAlFinal?' (al final de la lista)':''}`:''}. El semáforo usa ${II.f.almacen?esc(N.almacenInfo(II.f.almacen).nombre):'el total de los 6 almacenes AP'}.</p>`;
  }
  const num=N.num;

  function filtrosStock(){
    const f=II.f;
    return `<div class="ii-filtros">
      <label class="ii-campo"><span>Buscar</span><input type="search" id="ii-texto" value="${esc(f.texto)}" placeholder="Nombre o código (INS-0001 / SAP)" oninput="iiTexto(this.value)" autocomplete="off"></label>
      <label class="ii-campo"><span>Categoría</span><select onchange="iiFiltro('categoria',this.value)">${opciones(categoriasPresentes(),f.categoria,'Todas')}</select></label>
      <label class="ii-campo"><span>Marca</span><select onchange="iiFiltro('marca',this.value)">${opciones(marcasPresentes(),f.marca,'Todas')}</select></label>
      <label class="ii-campo"><span>Almacén (para el semáforo)</span><select onchange="iiFiltro('almacen',this.value)"><option value="" ${f.almacen===''?'selected':''}>Total (6 almacenes AP)</option>
        ${N.ALMACENES.map(a=>`<option value="${a.clave}" ${a.clave===f.almacen?'selected':''}>${esc(a.nombre)}</option>`).join('')}</select></label>
      <label class="ii-chk"><input type="checkbox" ${f.prioritarios?'checked':''} onchange="iiFiltro('prioritarios',this.checked)"> Solo prioritarios</label>
      <label class="ii-chk"><input type="checkbox" ${f.soloBajoMinimo?'checked':''} onchange="iiFiltro('soloBajoMinimo',this.checked)"> Solo bajo mínimo</label>
      <label class="ii-chk"><input type="checkbox" ${f.sinUsoAlFinal?'checked':''} onchange="iiFiltro('sinUsoAlFinal',this.checked)"> Sin uso al final</label></div>`;
  }

  function selectorCorte(){
    const cortes=D.cache.cortes;
    if(!cortes.length)return '';
    return `<label class="ii-campo ii-corte"><span>Corte de stock</span><select onchange="iiCorte(this.value)">${cortes.map(c=>
      `<option value="${esc(c.id)}" ${c.id===D.cache.corteId?'selected':''}>${esc(c.fechaCorte)} · ${esc(c.archivo||'sin archivo')} · ${esc(c.importadoPor||'')}</option>`).join('')}</select></label>`;
  }

  function tabStock(){
    const hayCatalogo=D.cache.catalogo.length>0;
    if(!hayCatalogo&&D.cache.listo.catalogo){
      return `<div class="ii-card ii-centro"><h3>Todavía no hay stock cargado</h3><p>Importa el Excel de SAP para crear el catálogo y el primer corte de stock.</p>
        ${D.puedeEscribir()?'<button type="button" class="ii-btn" onclick="iiImportar()">Importar stock SAP</button>':'<p class="ii-mut">Pide a la Asistente de Producción que importe el stock.</p>'}</div>`;
    }
    const c=corteElegido();
    const nota=`<div class="ii-msg ii-msg-info ii-nota-sap" role="note"><b>Todas las cantidades de esta pantalla son el stock según SAP</b>${c?` (corte del ${esc(fechaDmy(c.fechaCorte))}, importado por ${esc(c.importadoPor||'—')})`:''}. No es el conteo físico: el conteo se registra en «Conteo físico» y se compara con SAP en «Conciliación».</div>`;
    const detectar=D.puedeEscribir()?'<button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="iiSinMov()" title="Compara los últimos cortes de SAP y propone los artículos cuyo stock no se mueve">Detectar sin movimiento</button>':'';
    return `${tarjetas()}<div class="ii-card">${nota}${filtrosStock()}<div class="ii-fila-sm">${selectorCorte()}${detectar}</div><div id="ii-tabla">${tablaStock(filasFiltradas())}</div></div>`;
  }

  /* ---------- catálogo ---------- */
  function tablaCatalogo(){
    const f=II.f;
    const lista=N.filtrarStock(N.filasStock(D.cache.catalogo,null,''),{categoria:f.categoria,marca:f.marca,prioritarios:f.prioritarios,texto:f.texto,activos:!f.inactivos})
      .sort((a,b)=>String(a.categoria).localeCompare(String(b.categoria),'es')||String(a.nombre).localeCompare(String(b.nombre),'es'));
    const puede=D.puedeEscribir();
    const filas=lista.slice(0,II.limite).map(x=>`<tr><td class="ii-cod">${celdaCodigo(x)}</td><td class="ii-nom">${esc(x.nombre)}</td><td>${esc(x.categoria)}${x.subtipo?` <small>${esc(x.subtipo)}</small>`:''}</td>
      <td>${esc(x.marca||'—')}</td><td>${esc(x.presentacion||'—')}</td><td>${esc(x.unidad)}</td><td class="ii-num">${fmt(x.stockMinimo)}</td><td class="ii-num">${fmt(x.puntoReorden)}</td>
      <td>${x.prioritario?'Sí':'—'}</td><td>${x.activo===false?'No':'Sí'}</td><td>${x.sinUso?'Sí':'—'}</td>${puede?`<td><button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="iiEditar('${esc(x.id).replace(/'/g,'&#39;')}')">Editar</button></td>`:''}</tr>`).join('');
    const mas=lista.length>II.limite?`<div class="ii-mas"><button type="button" class="ii-btn ii-btn-o" onclick="iiMasFilas()">Mostrar más (${fmt(lista.length-II.limite,0)} restantes)</button></div>`:'';
    return `<div class="ii-tw"><table class="ii-t"><thead><tr><th>Código</th><th>Artículo</th><th>Categoría</th><th>Marca</th><th>Presentación</th><th>Unidad</th><th class="ii-num">Stock mínimo</th>
      <th class="ii-num">Punto de reorden</th><th>Prioritario</th><th>Activo</th><th>Sin uso</th>${puede?'<th></th>':''}</tr></thead><tbody>${filas||`<tr><td colspan="12" class="ii-vacio">Ningún artículo coincide con los filtros.</td></tr>`}</tbody></table></div>${mas}
      <p class="ii-pie">${fmt(lista.length,0)} artículo(s). El stock mínimo, el punto de reorden, la unidad, «prioritario» y «activo» se definen aquí y no se sobrescriben al reimportar.</p>`;
  }
  function tabCatalogo(){
    const f=II.f;
    return `<div class="ii-card"><div class="ii-filtros">
      <label class="ii-campo"><span>Buscar</span><input type="search" id="ii-texto" value="${esc(f.texto)}" placeholder="Nombre o código (INS-0001 / SAP)" oninput="iiTexto(this.value)" autocomplete="off"></label>
      <label class="ii-campo"><span>Categoría</span><select onchange="iiFiltro('categoria',this.value)">${opciones(categoriasPresentes(),f.categoria,'Todas')}</select></label>
      <label class="ii-campo"><span>Marca</span><select onchange="iiFiltro('marca',this.value)">${opciones(marcasPresentes(),f.marca,'Todas')}</select></label>
      <label class="ii-chk"><input type="checkbox" ${f.prioritarios?'checked':''} onchange="iiFiltro('prioritarios',this.checked)"> Solo prioritarios</label>
      <label class="ii-chk"><input type="checkbox" ${f.inactivos?'checked':''} onchange="iiFiltro('inactivos',this.checked)"> Incluir inactivos</label></div>
      <div id="ii-tabla">${tablaCatalogo()}</div></div>`;
  }

  /* ---------- pantalla ---------- */
  function mensaje(){
    const e=Object.entries(D.cache.error).filter(([,v])=>v);
    if(e.length)return `<div class="ii-msg ii-msg-error" role="alert">No se pudieron leer los datos del Inventario: ${esc(e[0][1])}</div>`;
    if(II.msg)return `<div class="ii-msg ii-msg-${II.msg.tipo}" role="status">${esc(II.msg.texto)}</div>`;
    return ['catalogo','cortes'].every(k=>D.cache.listo[k])?'':'<div class="ii-msg ii-msg-info" role="status">Consultando el inventario…</div>';
  }
  /* Los artículos sin código interno (p. ej. el catálogo creado antes de existir los códigos) lo reciben al abrir el módulo quien puede escribir. */
  let asignandoCodigos=false,falloCodigos=false;
  function autoCodigos(){
    if(asignandoCodigos||falloCodigos||!D.cache.listo.catalogo||!D.puedeEscribir()||!D.cache.catalogo.some(x=>!x.codigo))return;
    asignandoCodigos=true;
    D.asignarCodigosFaltantes().then(r=>{if(r.asignados){II.msg={tipo:'ok',texto:`Se asignaron ${fmt(r.asignados,0)} códigos internos (INS-0001…).`};}})
      .catch(e=>{falloCodigos=true;II.msg={tipo:'error',texto:D.mensajeError(e)};}).finally(()=>{asignandoCodigos=false;});
  }
  /* «Almacén hoy» (80/81-almacen-enlace): el stock del corte con las entregas y devoluciones hechas en el programa, en tiempo real. */
  let enlaceEnganchado=false;
  function enlazarAlmacen(){
    const EN=window.glacialAlmacenEnlaceDatos;if(!EN)return;
    EN.escuchar();
    if(enlaceEnganchado)return;enlaceEnganchado=true;
    EN.alCambiar(()=>{
      if(typeof state==='undefined'||state.currentTab!==TAB||II.tab!=='stock')return;
      if(document.querySelector('.ii input:focus,.ii select:focus,.ii textarea:focus,#modal-root .modal'))return;
      pintarTabla();
    });
  }
  function pintar(){
    if(state.currentTab!==TAB)return;
    const main=document.getElementById('main');if(!main)return;
    D.escuchar();enlazarAlmacen();
    autoCodigos();
    const modoVista=!D.puedeEscribir();
    const tabs=[['stock','Stock actual'],['conteo','Conteo físico'],['conciliacion','Conciliación'],['auditoria','Auditoría'],['catalogo','Catálogo']].map(([k,t])=>`<button type="button" role="tab" class="ii-tab ${II.tab===k?'ii-tab-act':''}" aria-selected="${II.tab===k}" onclick="iiTab('${k}')">${t}</button>`).join('');
    const scroll=window.scrollY;
    main.innerHTML=`<section class="ii">${estilos()}<header class="ii-cab"><h1>INVENTARIO DE INSUMOS</h1><div class="ii-cab-der">
      ${modoVista?'<span class="ii-chip">Solo consulta</span>':'<button type="button" class="ii-btn" onclick="iiImportar()">Importar stock SAP</button>'}</div></header>
      <nav class="ii-tabs" role="tablist">${tabs}</nav>${mensaje()}${II.tab==='catalogo'?tabCatalogo():II.tab==='conteo'&&window.iiConteoUI?window.iiConteoUI.html():II.tab==='conciliacion'&&window.iiConciliacionUI?window.iiConciliacionUI.html():II.tab==='auditoria'&&window.iiAuditoriaUI?window.iiAuditoriaUI.html():tabStock()}</section>`;
    window.scrollTo(0,scroll);
  }
  function pintarTabla(){
    const c=document.getElementById('ii-tabla');if(!c){pintar();return;}
    c.innerHTML=II.tab==='catalogo'?tablaCatalogo():tablaStock(filasFiltradas());
    const k=document.querySelector('.ii-kpis');if(k&&II.tab==='stock'){const t=document.createElement('div');t.innerHTML=tarjetas();k.replaceWith(t.firstElementChild);}
  }

  /* ---------- acciones de la pantalla ---------- */
  let esperaTexto=null;
  window.iiTexto=v=>{II.f.texto=v;II.limite=PASO_FILAS;clearTimeout(esperaTexto);esperaTexto=setTimeout(pintarTabla,200);};
  window.iiFiltro=(k,v)=>{II.f[k]=v;II.limite=PASO_FILAS;pintar();};
  window.iiTab=k=>{if(k==='auditoria'&&window.iiAuditoriaUI)window.iiAuditoriaUI.reiniciar();II.tab=k;II.limite=PASO_FILAS;II.msg=null;pintar();};
  window.iiMasFilas=()=>{II.limite+=PASO_FILAS;pintarTabla();};
  window.iiCorte=id=>{D.elegirCorte(id,true);};

  /* ---------- edición de un artículo del catálogo ---------- */
  function raiz(){return document.getElementById('modal-root');}
  window.iiCerrar=()=>{if(typeof closeModal==='function')closeModal();else{const r=raiz();if(r)r.innerHTML='';}II.edicion=null;II.imp=null;};
  window.iiEditar=id=>{
    const x=D.cache.catalogo.find(i=>i.id===id);if(!x||!D.puedeEscribir()||!raiz())return;
    II.edicion=id;
    raiz().innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)iiCerrar()"><div class="modal ii-modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>Editar artículo</h3><button class="modal-close" onclick="iiCerrar()" aria-label="Cerrar">✕</button></div>
      <div class="modal-body"><p class="ii-nom-modal">${esc(x.nombre)}</p><p class="ii-mut"><b>${esc(x.codigo||'Sin código')}</b> · ${esc(x.itemCode?'SAP '+x.itemCode:'Sin código SAP (tabla dinámica)')} · ${esc(x.categoria)}</p>
        <div class="ii-form"><label class="ii-campo"><span>Unidad</span><input id="ii-e-unidad" value="${esc(x.unidad)}" maxlength="20"></label>
        <label class="ii-campo"><span>Stock mínimo</span><input id="ii-e-min" type="number" min="0" step="any" value="${esc(x.stockMinimo)}"></label>
        <label class="ii-campo"><span>Punto de reorden</span><input id="ii-e-reorden" type="number" min="0" step="any" value="${esc(x.puntoReorden)}"></label></div>
        <label class="ii-chk"><input id="ii-e-prio" type="checkbox" ${x.prioritario?'checked':''}> Prioritario</label>
        <label class="ii-chk"><input id="ii-e-activo" type="checkbox" ${x.activo!==false?'checked':''}> Activo</label>
        <label class="ii-chk"><input id="ii-e-sinuso" type="checkbox" ${x.sinUso?'checked':''}> Sin uso (sigue en el inventario, pero va al final de la lista)</label>
        <div class="ii-msg ii-msg-error" id="ii-e-error" hidden></div>
        <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="iiCerrar()">Cancelar</button><button type="button" class="ii-btn" id="ii-e-ok" onclick="iiGuardarEdicion()">Guardar</button></div></div></div></div>`;
  };
  window.iiGuardarEdicion=async()=>{
    const id=II.edicion;if(!id)return;
    const g=i=>document.getElementById(i);
    const err=t=>{const e=g('ii-e-error');if(e){e.hidden=!t;e.textContent=t||'';}};
    const cambios={unidad:g('ii-e-unidad').value,stockMinimo:g('ii-e-min').value===''?0:Number(g('ii-e-min').value),puntoReorden:g('ii-e-reorden').value===''?0:Number(g('ii-e-reorden').value),
      prioritario:g('ii-e-prio').checked,activo:g('ii-e-activo').checked,sinUso:g('ii-e-sinuso').checked};
    const b=g('ii-e-ok');if(b)b.disabled=true;err('');
    try{
      const r=await D.guardarEdicion(id,cambios);
      iiCerrar();II.msg={tipo:'ok',texto:r.cambiado?'Artículo actualizado.':'No había cambios que guardar.'};pintar();
    }catch(e){err(D.mensajeError(e));if(b)b.disabled=false;}
  };


  /* ---------- artículos sin movimiento ---------- */
  window.iiSinMov=async()=>{
    if(!D.puedeEscribir()||!raiz())return;
    const abrir=cuerpo=>{raiz().innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)iiCerrar()"><div class="modal ii-modal ii-modal-ancho" role="dialog" aria-modal="true"><div class="modal-head"><h3>Detectar sin movimiento</h3>
      <button class="modal-close" onclick="iiCerrar()" aria-label="Cerrar">✕</button></div><div class="modal-body">${cuerpo}</div></div></div>`;};
    abrir('<p>Comparando los últimos cortes de SAP…</p>');
    try{
      const r=await D.detectarSinMovimiento();
      if(!r.ids.length){abrir(`<p>${r.motivo?esc(r.motivo):`Ningún artículo con stock tiene el mismo total en los últimos ${r.cortes} cortes (desde el ${esc(fechaDmy(r.desde))}).`}</p><div class="ii-acc"><button type="button" class="ii-btn" onclick="iiCerrar()">Cerrar</button></div>`);return;}
      II.sinMov=r.ids;
      const porId=new Map(D.cache.catalogo.map(c=>[c.id,c]));
      abrir(`<p>Estos <b>${fmt(r.ids.length,0)}</b> artículos tienen <b>exactamente el mismo stock</b> en los últimos ${r.cortes} cortes de SAP (desde el ${esc(fechaDmy(r.desde))}, ${r.dias} días). Se marcarán «sin uso»: siguen en tu inventario pero pasan al final de la lista. Puedes quitar la marca después desde el Catálogo.</p>
        <ul class="ii-lista-sm">${r.ids.slice(0,300).map(id=>{const c=porId.get(id)||{};return `<li><b>${esc(c.codigo||'')}</b> ${esc(c.nombre||id)}</li>`;}).join('')}${r.ids.length>300?`<li>… y ${fmt(r.ids.length-300,0)} más</li>`:''}</ul>
        <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="iiCerrar()">Cancelar</button><button type="button" class="ii-btn" id="ii-sm-ok" onclick="iiSinMovOk()">Marcar ${fmt(r.ids.length,0)} como sin uso</button></div>`);
    }catch(e){abrir(`<div class="ii-msg ii-msg-error" role="alert">${esc(D.mensajeError(e))}</div><div class="ii-acc"><button type="button" class="ii-btn" onclick="iiCerrar()">Cerrar</button></div>`);}
  };
  window.iiSinMovOk=async()=>{
    const b=document.getElementById('ii-sm-ok');if(b)b.disabled=true;
    try{const r=await D.marcarSinUso(II.sinMov||[],true);iiCerrar();II.msg={tipo:'ok',texto:`${fmt(r.cambiados,0)} artículos marcados como sin uso.`};}
    catch(e){iiCerrar();II.msg={tipo:'error',texto:D.mensajeError(e)};}
    pintar();
  };

  /* ---------- importar stock SAP ---------- */
  function urlSheetJs(){
    const s=[...document.scripts].map(x=>x.src).find(u=>/xlsx(\.full)?\.min\.js/.test(u)||/sheetjs/.test(u));
    return s||'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  }
  /* El worker lee el libro y conserva solo lo útil (N.prefiltrarFilas). */
  function leerEnWorker(buffer,avance){
    return new Promise((resolve,reject)=>{
      let w;
      try{
        const codigo=`importScripts(${JSON.stringify(urlSheetJs())});
          const prefiltrar=${N.prefiltrarFilas.toString()};
          self.onmessage=function(e){
            try{
              self.postMessage({tipo:'estado',pct:8,texto:'Leyendo el archivo…'});
              const wb=XLSX.read(new Uint8Array(e.data.buf),{type:'array',cellDates:false,cellStyles:false,cellNF:false});
              const hojas=[],n=wb.SheetNames.length;
              wb.SheetNames.forEach(function(nombre,i){
                self.postMessage({tipo:'estado',pct:25+Math.round(60*i/Math.max(1,n)),texto:'Procesando la hoja «'+nombre.trim()+'»…'});
                const filas=XLSX.utils.sheet_to_json(wb.Sheets[nombre],{header:1,raw:true,defval:null,blankrows:false});
                hojas.push({nombre:nombre,filas:prefiltrar(filas)});
              });
              self.postMessage({tipo:'listo',hojas:hojas});
            }catch(err){self.postMessage({tipo:'error',mensaje:String(err&&err.message||err)});}
          };`;
        const url=URL.createObjectURL(new Blob([codigo],{type:'text/javascript'}));
        w=new Worker(url);
        const fin=()=>{try{w.terminate();URL.revokeObjectURL(url);}catch(_){/* ya cerrado */}};
        w.onmessage=e=>{
          const d=e.data||{};
          if(d.tipo==='estado')avance(d.pct,d.texto);
          else if(d.tipo==='listo'){fin();resolve(d.hojas);}
          else if(d.tipo==='error'){fin();reject(new Error(d.mensaje));}
        };
        w.onerror=e=>{fin();reject(new Error('No se pudo leer el archivo en segundo plano.'));};
        w.postMessage({buf:buffer},[buffer]);
      }catch(e){reject(e);}
    });
  }
  async function leerEnPagina(buffer,avance){
    if(typeof XLSX==='undefined')throw new Error('No se cargó la librería de Excel. Revisa tu conexión a internet y recarga la página.');
    avance(10,'Leyendo el archivo…');await cederTurno();
    const wb=XLSX.read(new Uint8Array(buffer),{type:'array',cellDates:false});
    const hojas=[];
    for(let i=0;i<wb.SheetNames.length;i++){
      avance(30+Math.round(55*i/wb.SheetNames.length),'Procesando la hoja «'+wb.SheetNames[i].trim()+'»…');await cederTurno();
      hojas.push({nombre:wb.SheetNames[i],filas:N.prefiltrarFilas(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[i]],{header:1,raw:true,defval:null,blankrows:false}))});
    }
    return hojas;
  }

  function cuerpoImportar(){
    const i=II.imp;if(!i)return '';
    if(i.fase==='elegir')return `<p>Sube el Excel que exportas de SAP Business One (consulta «Consulta2»). Se guardará como un <b>corte de stock</b> y se actualizará el catálogo.</p>
      <label class="ii-campo"><span>Archivo (.xlsx)</span><input type="file" id="ii-archivo" accept=".xlsx,.xlsm,.xls" onchange="iiArchivo(this)"></label>
      <label class="ii-campo"><span>Fecha del corte</span><input type="date" id="ii-fecha" value="${esc(i.fecha)}" onchange="II_fecha(this.value)"></label>`;
    if(i.fase==='procesando'||i.fase==='guardando')return `<p><b>${esc(i.texto||'Procesando…')}</b></p><div class="ii-barra"><i style="width:${Math.max(3,Math.min(100,i.pct||0))}%"></i></div><p class="ii-mut">Procesando… ${Math.round(i.pct||0)}%</p>`;
    if(i.fase==='error')return `<div class="ii-msg ii-msg-error" role="alert">${esc(i.error)}</div><div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="iiImportar()">Elegir otro archivo</button></div>`;
    if(i.fase==='resumen'){
      const l=i.lectura,p=i.previa;
      return `<p><b>${esc(i.archivo)}</b> · hoja «${esc(String(l.hoja||'').trim())}» · formato ${l.formato==='plano'?'plano':'tabla dinámica'}</p>
        <div class="ii-resumen"><div><b>${fmt(l.articulos.length,0)}</b><span>artículos encontrados</span></div><div><b>${fmt(p.nuevos,0)}</b><span>nuevos en el catálogo</span></div>
        <div><b>${fmt(p.existentes,0)}</b><span>ya existían</span></div><div><b>${fmt((l.resumen.excluidosNombre||0)+(l.resumen.fueraDeGrupo||0),0)}</b><span>excluidos</span></div>
        <div><b>${fmt(l.almacenes.length,0)}</b><span>almacenes detectados</span></div></div>
        <p class="ii-mut">Excluidos: ${fmt(l.resumen.excluidosNombre||0,0)} por «NO USAR» / «ETIQUETA ERROR» y ${fmt(l.resumen.fueraDeGrupo||0,0)} fuera de los grupos 105, 106, 107 y 109.
        Almacenes: ${l.almacenes.map(a=>esc(N.almacenInfo(a).corto)).join(', ')||'ninguno'}.</p>
        ${l.avisos.map(a=>`<div class="ii-msg ii-msg-info">${esc(a)}</div>`).join('')}
        <label class="ii-campo"><span>Fecha del corte</span><input type="date" id="ii-fecha" value="${esc(i.fecha)}" onchange="II_fecha(this.value)"></label>
        <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="iiImportar()">Elegir otro archivo</button><button type="button" class="ii-btn" onclick="iiConfirmarImportar()">Guardar corte</button></div>`;
    }
    return '';
  }
  function pintarImportar(){
    const r=raiz();if(!r)return;
    const cerrable=!II.imp||II.imp.fase!=='guardando';
    r.innerHTML=`<div class="modal-backdrop" ${cerrable?'onclick="if(event.target===this)iiCerrar()"':''}><div class="modal ii-modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>Importar stock SAP</h3>${cerrable?'<button class="modal-close" onclick="iiCerrar()" aria-label="Cerrar">✕</button>':''}</div>
      <div class="modal-body" id="ii-imp-cuerpo">${cuerpoImportar()}</div></div></div>`;
  }
  window.II_fecha=v=>{if(II.imp&&/^\d{4}-\d{2}-\d{2}$/.test(v))II.imp.fecha=v;};
  window.iiImportar=()=>{
    if(!D.puedeEscribir())return;
    II.imp={fase:'elegir',fecha:hoyIso(),pct:0,texto:''};pintarImportar();
  };
  window.iiArchivo=async input=>{
    const archivo=input&&input.files&&input.files[0];if(!archivo||!II.imp)return;
    const i=II.imp;i.fase='procesando';i.pct=3;i.texto='Cargando el archivo…';i.archivo=archivo.name;pintarImportar();
    const avance=(pct,texto)=>{if(II.imp!==i)return;i.pct=pct;i.texto=texto;const c=document.getElementById('ii-imp-cuerpo');if(c)c.innerHTML=cuerpoImportar();};
    try{
      const buffer=await archivo.arrayBuffer();
      let hojas;
      try{hojas=await leerEnWorker(buffer.slice(0),avance);}catch(_){hojas=await leerEnPagina(buffer,avance);}   // sin Worker (o sin CDN en el worker) se lee en la página
      avance(90,'Revisando artículos y almacenes…');await cederTurno();
      const lectura=N.leerLibro(hojas);
      if(lectura.error){i.fase='error';i.error=lectura.error;pintarImportar();return;}
      i.lectura=lectura;i.previa=D.vistaPrevia(lectura);i.fase='resumen';pintarImportar();
    }catch(e){i.fase='error';i.error='No se pudo leer el archivo: '+((e&&e.message)||e);pintarImportar();}
  };
  window.iiConfirmarImportar=async()=>{
    const i=II.imp;if(!i||i.fase!=='resumen')return;
    i.fase='guardando';i.pct=40;i.texto='Guardando el corte y el catálogo…';pintarImportar();
    try{
      const r=await D.importarCorte(i.lectura,{fechaCorte:i.fecha,archivo:i.archivo});
      II.imp=null;
      if(typeof closeModal==='function')closeModal();else{const x=raiz();if(x)x.innerHTML='';}
      II.tab='stock';II.msg={tipo:'ok',texto:`Corte guardado: ${fmt(r.resumen.articulos,0)} artículos (${fmt(r.resumen.nuevos,0)} nuevos).`};
      D.elegirCorte(r.id);pintar();
    }catch(e){i.fase='error';i.error=D.mensajeError(e);pintarImportar();}
  };

  /* ---------- navegación (mismo patrón que 72-asistente-pantalla.js) ---------- */
  window.goInventarioInsumos=function(){
    if(!D.puedeVer()){alert('No tienes permiso para ver el Inventario de insumos.');return;}
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    state.currentTab=TAB;II.msg=null;
    if(typeof renderSidebar==='function')renderSidebar();
    if(typeof renderMain==='function')renderMain();
  };
  if(typeof ajustarVistaSegunPermisos==='function'){
    const a=ajustarVistaSegunPermisos;
    ajustarVistaSegunPermisos=function(){if(state.currentTab===TAB&&D.puedeVer())return;return a.apply(this,arguments);};
  }
  if(typeof renderMain==='function'){
    const a=renderMain;
    renderMain=function(){
      if(state.currentTab===TAB&&!state.showWelcome&&D.puedeVer()){pintar();return;}
      if(state.currentTab!==TAB)D.detener();
      return a.apply(this,arguments);
    };
  }
  if(typeof renderSidebar==='function'){
    const a=renderSidebar;
    renderSidebar=function(){
      const r=a.apply(this,arguments);
      const b=document.getElementById('btn-inventario-insumos');
      if(b){const m=!!(state.user&&D.puedeVer());b.hidden=!m;b.style.display=m?'':'none';b.classList.toggle('active',m&&state.currentTab===TAB);
        if(m&&state.currentTab===TAB)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
      /* El grupo «Almacén» se muestra solo si alguno de sus accesos (este o «Solicitudes de Producción») es visible; sin ninguno, queda el aviso «próximamente». */
      if(typeof actualizarGruposSidebar==='function')actualizarGruposSidebar();
      const g=document.getElementById('sidebar-group-almacen'),ph=document.getElementById('btn-almacen');
      if(ph&&g)ph.style.display=(state.user&&g.style.display==='none'&&!(typeof esMantCompartido==='function'&&esMantCompartido()))?'':'none';
      return r;
    };
  }
  // Tiempo real: lo que otro dispositivo guarda (corte, catálogo, ediciones) aparece solo, sin pisar lo que se está escribiendo.
  D.alCambiar(()=>{
    if(typeof state==='undefined'||state.currentTab!==TAB)return;
    if(II.tab==='auditoria')return;       // la auditoría no se escucha en vivo: se consulta con «Actualizar»
    if(II.tab==='conciliacion'&&window.iiConciliacionUI&&!document.querySelector('#modal-root .modal')){if(!window.iiConciliacionUI.activoEnEdicion())pintar();return;}
    if(II.tab==='conteo'&&window.iiConteoUI&&!document.querySelector('#modal-root .modal')){window.iiConteoUI.conservando(pintar);return;}   // el conteo se actualiza con lo que escriben otras personas sin quitarte el cursor
    if(document.querySelector('.ii input:focus,.ii select:focus,#modal-root .modal'))return;

    pintar();
  });

  function estilos(){return `<style id="ii-estilos">${window.iiConteoUI?window.iiConteoUI.css:''}${window.iiConciliacionUI?window.iiConciliacionUI.css:''}${window.iiAuditoriaUI?window.iiAuditoriaUI.css:''}${window.iiEvidenciasUI?window.iiEvidenciasUI.css:''}
.ii,.ii-modal{--ii-azul:#0b5cc4;--ii-linea:#dde6ef;--ii-mut:#5f7382}      /* los modales viven en #modal-root, fuera de .ii: necesitan las mismas variables */
.ii{color:#0f2547;font-size:15px}
.ii-g-hoy{background:#e6f4ea;color:#14532d}.ii-b-hoy{background:#f3faf5}.ii-delta{display:block;font-size:11px;color:#5f7382}
.ii-modal [hidden]{display:none!important}
.ii [hidden]{display:none!important}
.ii-cab{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 14px}.ii-cab h1{margin:0;font-size:30px;font-weight:800;color:#0f2547}
.ii-chip{padding:8px 14px;border-radius:10px;background:#dbeafe;color:#0b5cc4;font-weight:700;font-size:13px}
.ii-tabs{display:flex;gap:4px;overflow-x:auto;background:#fff;border:1px solid var(--ii-linea);border-radius:12px;padding:0 10px;margin-bottom:14px}
.ii-tab{flex:0 0 auto;border:0;background:none;padding:13px 16px;font:inherit;font-weight:500;color:#334a66;border-bottom:3px solid transparent;cursor:pointer}
.ii-tab-act{color:#e8710a;font-weight:700;border-bottom-color:#e8710a}
.ii-card{background:#fff;border:1px solid var(--ii-linea);border-radius:14px;padding:16px;margin-bottom:14px;box-shadow:0 3px 14px rgba(15,37,71,.05);min-width:0}
.ii-centro{text-align:center;padding:34px 18px}.ii-centro h3{margin:0 0 8px;font-size:20px}
.ii-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}
.ii-kpi{background:#fff;border:1px solid var(--ii-linea);border-radius:12px;padding:14px 16px;min-width:0}
.ii-kpi span{display:block;color:#334a66;font-size:14px}.ii-kpi b{display:block;font-size:28px;line-height:1.15;font-weight:800;overflow-wrap:anywhere}.ii-kpi small{color:var(--ii-mut);font-size:12px}
.ii-k-azul b{color:#0b5cc4}.ii-k-rojo b{color:#c0281c}.ii-k-ambar b{color:#b45309}.ii-k-gris b{color:#0f2547;font-size:22px}
.ii-filtros{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;align-items:end;margin-bottom:12px}
.ii-campo{display:flex;flex-direction:column;gap:5px;font-size:13px;color:#334a66;min-width:0}.ii-corte{margin-bottom:12px;max-width:520px}
.ii input[type=search],.ii input[type=text],.ii input[type=number],.ii input[type=date],.ii input[type=file],.ii select,.ii-modal input:not([type=checkbox]){font:inherit;font-size:15px;padding:8px 10px;border:1px solid #c9d6e2;border-radius:8px;min-height:42px;background:#fff;color:#0f2547;max-width:100%;width:100%;box-sizing:border-box}
.ii-chk{display:flex;align-items:center;gap:8px;font-size:14px;min-height:42px}.ii-chk input{width:auto;min-height:0}
.ii-tw{overflow-x:auto;border:1px solid var(--ii-linea);border-radius:10px}.ii-t{width:100%;border-collapse:collapse;font-size:14px}
.ii-t th{background:#eef3fa;text-align:left;padding:10px 12px;font-size:13px;font-weight:700;color:#1d3557;white-space:nowrap}.ii-t td{padding:9px 12px;border-top:1px solid #edf2f7;vertical-align:top}
.ii-num{text-align:right!important;white-space:nowrap;font-variant-numeric:tabular-nums}.ii-col-act{background:#fff8ec}.ii-cod{white-space:nowrap;color:var(--ii-mut);font-size:13px}.ii-cod b{display:block;color:#0f2547}.ii-cod small{display:block;font-size:11px}.ii-nom{min-width:220px}
.ii-sin-corte td{color:#98a2b3}.ii-sin-uso td{color:#7b8794;background:#f7f9fb}
.ii-t .ii-g th{text-align:center;font-size:12px;letter-spacing:.04em;background:#dfe9f6;border-bottom:1px solid #c9d6e2}.ii-t .ii-g .ii-g-res{background:#d6ecde;color:#14532d}.ii-t .ii-g .ii-g-sap{background:#fdebd0;color:#7c2d12}
.ii-b-res{border-left:2px solid #86c79a}.ii-b-sap{border-left:2px solid #f0b46a}.ii-nota-sap{margin-bottom:12px}.ii-fila-sm{display:flex;gap:12px;align-items:end;flex-wrap:wrap;justify-content:space-between;margin-bottom:12px}.ii-fila-sm .ii-corte{margin-bottom:0}
.ii-p-sinuso{background:#e5e7eb;color:#4b5563}.ii-modal-ancho{max-width:640px}.ii-lista-sm{max-height:260px;overflow:auto;margin:8px 0;padding:8px 8px 8px 22px;border:1px solid var(--ii-linea);border-radius:8px;font-size:13px}.ii-vacio{text-align:center;color:var(--ii-mut);padding:24px}.ii-pie,.ii-mut{color:var(--ii-mut);font-size:13px;margin:10px 0 0}
.ii-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:8px;font-size:12.5px;font-weight:600;white-space:nowrap}.ii-pill i{width:9px;height:9px;border-radius:50%;background:currentColor}
.ii-p-rojo{background:#fee2e2;color:#b42318}.ii-p-naranja{background:#ffedd5;color:#9a3412}.ii-p-verde{background:#dcfce7;color:#166534}.ii-p-gris{background:#eceff3;color:#475467}
.ii-btn{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--ii-azul);background:var(--ii-azul);color:#fff;border-radius:9px;padding:10px 18px;font:inherit;font-weight:600;cursor:pointer}
.ii-btn-o{background:#fff;color:var(--ii-azul)}.ii-btn-s{padding:5px 12px;min-height:34px;font-size:13px}.ii-btn[disabled]{opacity:.5;cursor:not-allowed}.ii-mas{text-align:center;margin:12px 0 0}
.ii-msg{padding:10px 14px;border-radius:10px;margin:0 0 12px;font-size:14px}.ii-msg-ok{background:#dcfce7;color:#166534}.ii-msg-error{background:#fee2e2;color:#b42318}.ii-msg-info{background:#e0f2fe;color:#075985}
.ii-modal{max-width:560px;width:96%}.ii-nom-modal{font-weight:700;margin:0 0 2px}.ii-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0}
.ii-acc{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}
.ii-barra{height:12px;border-radius:99px;background:#e6edf3;overflow:hidden;margin:10px 0 6px}.ii-barra i{display:block;height:100%;background:#0b5cc4;border-radius:99px;transition:width .2s}
.ii-resumen{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:12px 0}.ii-resumen div{background:#f4f8fc;border-radius:10px;padding:10px 12px}
.ii-resumen b{display:block;font-size:22px}.ii-resumen span{font-size:12px;color:var(--ii-mut)}
@media(max-width:700px){.ii-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.ii-cab h1{font-size:24px}.ii-form{grid-template-columns:1fr}.ii-nom{min-width:180px}}
</style>`;}

  window.__inventarioInsumosPantalla={II,filasFiltradas,pintar,estilos};      // estilos(): el Asistente de Producción los reutiliza en su pestaña «Evidencias»
})();
