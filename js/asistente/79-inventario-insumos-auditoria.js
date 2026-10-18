/* =============================================================
   GLACIAL · INVENTARIO DE INSUMOS — AUDITORÍA (Fase 4): pestaña «Auditoría»
   -------------------------------------------------------------
   Libro inmutable (insumosAuditoria, solo se crea) con TODO lo que cambia en el módulo: importaciones de stock, mínimos y datos del catálogo,
   conteos (crear, observación, cerrar, reabrir con motivo), líneas (agregar, editar, borrar) y comentarios de conciliación. Cada evento lleva
   quién, cuándo (hora del servidor), qué artículo y el valor anterior → nuevo, y se escribe en la MISMA transacción que el cambio
   (75-inventario-insumos-datos.js · auditar), como auditoriaTareos en el Tareo.
   La pestaña lee por rango de fechas (por defecto los últimos 30 días, hasta 1.000 eventos) y filtra en la página; no escucha en vivo porque el
   libro crece sin parar: «Actualizar» vuelve a consultar. La ven quienes ven el inventario (también solo consulta). Cargar DESPUÉS de 78.
   ============================================================= */
(function instalarInventarioInsumosAuditoria(global){
  'use strict';
  const N=global.glacialInventarioNucleo,D=global.glacialInventarioDatos;
  if(!N||!D||typeof document==='undefined')return;
  const esc=v=>typeof escaparHtml==='function'?escaparHtml(String(v==null?'':v)):String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const PERU=5*3600000,PASO=100;
  const iso=ms=>new Date(ms-PERU).toISOString().slice(0,10);
  const finDia=f=>Date.parse(f+'T23:59:59.999Z')+PERU;          // fin del día en hora de Perú (UTC-5)
  const iniDia=f=>Date.parse(f+'T00:00:00.000Z')+PERU;
  const hora=ms=>{if(!ms)return '';const d=new Date(Number(ms)-PERU),p=n=>String(n).padStart(2,'0');return p(d.getUTCDate())+'/'+p(d.getUTCMonth()+1)+'/'+d.getUTCFullYear()+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes())+':'+p(d.getUTCSeconds());};
  const K={desde:iso(Date.now()-30*86400000),hasta:iso(Date.now()),grupo:'',tipo:'',usuario:'',texto:'',limite:PASO,eventos:null,truncado:false,cargando:false,error:'',pedido:null,msg:null};
  const repintar=()=>{const p=global.__inventarioInsumosPantalla;if(p)p.pintar();};
  const GRUPO_PILL={IMPORTACION:'ii-p-azul',CATALOGO:'ii-p-naranja',CONTEO:'ii-p-verde',LINEA:'ii-p-gris',COMENTARIO:'ii-p-gris'};

  async function cargar(){
    const clave=K.desde+'|'+K.hasta;K.pedido=clave;K.cargando=true;K.error='';repintar();
    try{
      const r=await D.consultarAuditoria({desdeMs:iniDia(K.desde),hastaMs:finDia(K.hasta),limite:1000});
      if(K.pedido!==clave)return;
      K.eventos=r.eventos;K.truncado=r.truncado;
    }catch(e){if(K.pedido!==clave)return;K.eventos=[];K.error=D.mensajeError(e);}
    K.cargando=false;repintar();
  }
  const visibles=()=>N.filtrarAuditoria(K.eventos||[],{grupo:K.grupo,tipo:K.tipo,usuario:K.usuario,texto:K.texto});
  function fila(e){
    const t=N.TIPOS_AUDITORIA[e.tipo]||{txt:e.tipo,grupo:''};
    const cambios=N.cambiosAuditoria(e);
    const conteo=e.conteoId?D.cache.conteos.find(c=>c.id===e.conteoId):null;
    return `<tr><td class="ii-cod">${esc(hora(e.enMs))}</td><td>${esc(e.usuario||'—')}</td>
      <td><span class="ii-pill ${GRUPO_PILL[t.grupo]||'ii-p-gris'}"><i></i>${esc(t.txt)}</span></td>
      <td class="ii-nom">${esc(e.articulo||'—')}${conteo?`<small class="ii-mut">Conteo ${esc(conteo.fecha)} · ${esc(conteo.almacen)}</small>`:''}</td>
      <td class="ii-cambios">${cambios.length?cambios.map(c=>`<div><b>${esc(c.campo)}:</b> ${c.antes==='—'?esc(c.despues):`<span class="ii-antes">${esc(c.antes)}</span> → <span class="ii-desp">${esc(c.despues)}</span>`}</div>`).join(''):'—'}</td></tr>`;
  }
  function html(){
    if(K.eventos===null&&!K.cargando&&!K.error)setTimeout(cargar,0);
    const ev=K.eventos||[];
    const usuarios=[...new Set(ev.map(e=>e.usuario).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    const f=visibles(),mostrar=f.slice(0,K.limite);
    const sel=(k,lista,todos)=>`<option value="">${esc(todos)}</option>`+lista.map(([v,t])=>`<option value="${esc(v)}" ${K[k]===v?'selected':''}>${esc(t)}</option>`).join('');
    const tipos=Object.entries(N.TIPOS_AUDITORIA).filter(([,t])=>!K.grupo||t.grupo===K.grupo).map(([v,t])=>[v,t.txt]);
    const cuerpo=K.error?`<div class="ii-msg ii-msg-error" role="alert">${esc(K.error)}</div>`:K.eventos===null||K.cargando?'<p class="ii-mut">Consultando la auditoría…</p>'
      :`<div class="ii-tw"><table class="ii-t"><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Artículo / conteo</th><th>Cambio (antes → después)</th></tr></thead>
        <tbody>${mostrar.map(fila).join('')||'<tr><td colspan="5" class="ii-vacio">No hay eventos con esos filtros.</td></tr>'}</tbody></table></div>
        ${f.length>mostrar.length?`<div class="ii-mas"><button type="button" class="ii-btn ii-btn-o" onclick="iiaMas()">Mostrar más (${N.fmt(f.length-mostrar.length,0)} restantes)</button></div>`:''}
        <p class="ii-pie">${N.fmt(f.length,0)} evento(s)${K.truncado?' · se muestran los 1.000 más recientes del rango: acota las fechas para ver el resto':''}. La auditoría solo se puede consultar: nadie puede editarla ni borrarla.</p>`;
    return `<div class="ii-card"><div class="ii-filtros">
      <label class="ii-campo"><span>Desde</span><input type="date" value="${esc(K.desde)}" onchange="iiaFecha('desde',this.value)"></label>
      <label class="ii-campo"><span>Hasta</span><input type="date" value="${esc(K.hasta)}" onchange="iiaFecha('hasta',this.value)"></label>
      <label class="ii-campo"><span>Tipo de movimiento</span><select onchange="iiaFiltro('grupo',this.value)">${sel('grupo',Object.entries(N.GRUPOS_AUDITORIA),'Todos')}</select></label>
      <label class="ii-campo"><span>Acción</span><select onchange="iiaFiltro('tipo',this.value)">${sel('tipo',tipos,'Todas')}</select></label>
      <label class="ii-campo"><span>Usuario</span><select onchange="iiaFiltro('usuario',this.value)">${sel('usuario',usuarios.map(u=>[u,u]),'Todos')}</select></label>
      <label class="ii-campo"><span>Buscar artículo o dato</span><input type="search" id="ii-a-texto" value="${esc(K.texto)}" placeholder="Artículo, ubicación, motivo…" oninput="iiaTexto(this.value)" autocomplete="off"></label>
      <button type="button" class="ii-btn ii-btn-o" onclick="iiaActualizar()">Actualizar</button>
      <button type="button" class="ii-btn" onclick="iiaExportar()" ${f.length?'':'disabled'}>Exportar a Excel</button></div>${K.msg?`<div class="ii-msg ii-msg-${K.msg.tipo}" role="status">${esc(K.msg.texto)}</div>`:''}
      <div id="ii-a-tabla">${cuerpo}</div></div>`;
  }
  let espera=null;
  function pintarTabla(){repintar();}
  global.iiaFecha=(k,v)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return;K[k]=v;K.limite=PASO;K.eventos=null;K.error='';cargar();};
  global.iiaFiltro=(k,v)=>{K[k]=v;if(k==='grupo')K.tipo='';K.limite=PASO;repintar();};
  global.iiaTexto=v=>{K.texto=v;K.limite=PASO;clearTimeout(espera);espera=setTimeout(()=>{const c=document.getElementById('ii-a-tabla');if(!c){repintar();return;}
    const h=document.createElement('div');h.innerHTML=html();const n=h.querySelector('#ii-a-tabla');if(n)c.innerHTML=n.innerHTML;},200);};
  global.iiaExportar=async()=>{
    const X=global.glacialInventarioExcel,f=visibles();if(!X||!f.length)return;
    const partes=[K.grupo&&N.GRUPOS_AUDITORIA[K.grupo],K.tipo&&(N.TIPOS_AUDITORIA[K.tipo]||{}).txt,K.usuario&&'Usuario: '+K.usuario,K.texto&&'Búsqueda: '+K.texto].filter(Boolean);
    try{const n=await X.exportarAuditoria({eventos:f,desde:K.desde,hasta:K.hasta,conteos:D.cache.conteos,filtros:partes.join(' · ')});K.msg={tipo:'ok',texto:'Excel generado: '+n};}
    catch(e){K.msg={tipo:'error',texto:(e&&e.message)||String(e)};}
    repintar();
  };
  global.iiaMas=()=>{K.limite+=PASO;repintar();};
  global.iiaActualizar=()=>{K.eventos=null;K.error='';cargar();};
  const css=`
.ii-cambios{min-width:260px;font-size:13px}.ii-antes{color:#b42318;text-decoration:line-through}.ii-desp{color:#166534;font-weight:600}.ii-nom small{display:block}`;
  global.iiAuditoriaUI={html,css,reiniciar:()=>{K.msg=null;K.eventos=null;K.error='';K.pedido=null;},activoEnEdicion:()=>!!document.querySelector('#ii-a-texto:focus,.ii input[type=date]:focus')};
  global.__inventarioInsumosAuditoria={K,visibles,cargar};
})(typeof window!=='undefined'?window:globalThis);
