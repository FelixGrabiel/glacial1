/* =============================================================
   GLACIAL · INFORME DE TRAZABILIDAD (auditoría 2026-11-06, T1)
   -------------------------------------------------------------
   Responde las dos preguntas de un reclamo o un retiro de producto:
     · HACIA ADELANTE: dado un lote de insumo (LI-…, lote del proveedor o producto), ¿en qué producciones se usó?
       → reportes y cuadros (línea, fecha, turno, marca, presentación, lote de producto, producción efectiva).
     · HACIA ATRÁS: dado un lote de producto (CF3-02112027, CF1…), ¿qué lotes de insumo lleva? → por categoría.
   Fuente: cuadro.lotesInsumo[] de los reportes de producción (lo marca el supervisor en el panel «Lotes de insumo usados», 92) + los lotes y
   sus cajas/bobinas (88). Un lote unido a otro (T3, unidoEn) se cuenta en el lote que lo recibió. Se usan TODOS los reportes vigentes (no solo los
   oficiales): en trazabilidad es mejor de más que de menos; cada fila dice si el reporte está finalizado.
   Solo lectura: no cambia lotes, unidades ni reportes. El lote de producto se arma igual que el Control de proceso (90: código + vencimiento DDMMAAAA,
   y si el cuadro no trae vencimiento, fecha + 1 año; noche desde el día siguiente).
   Núcleo puro (usosDeRegistros, buscar, filasExcel) + pantalla dentro de Asistente › Lotes (89 la muestra con «Informe de trazabilidad»).
   Cargar DESPUÉS de 87, 88, 89 y 90.
   ============================================================= */
(function(raiz){
  'use strict';
  const norm=v=>String(v==null?'':v).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  const texto=v=>String(v==null?'':v).trim();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const CP=()=>raiz.glacialControlProcesoNucleo||null;
  const TN=()=>raiz.glacialTrazabilidadNucleo||null;
  const ORDEN_CAT=['preformas','tapas','etiquetas','asas','bolsas','cajas','polietileno','otro'];
  const NOMBRE_CAT={preformas:'Preformas',tapas:'Tapas',etiquetas:'Etiquetas',asas:'Asas',bolsas:'Bolsas',cajas:'Cajas',polietileno:'Polietileno',otro:'Otro'};

  function resolver(id,lotes){
    const T=TN();
    if(T&&T.resolverLoteId)return T.resolverLoteId(id,lotes);
    return String(id||'');
  }
  /* Lote escrito a mano en el cuadro (92, punto 1): si ya existe en el sistema (misma categoría y lote del proveedor) se cuenta en ese lote. */
  const LC=()=>raiz.GlacialLotesEnCuadro||null;
  const esManual=m=>!!m&&(m.manual===true||/^MAN-/.test(String(m.loteId||'')));
  function lotePTDe(r,c){
    const cp=CP();
    if(cp&&cp.lotePT)return cp.lotePT(c,{fecha:r.fecha,turno:r.turno});
    return texto(c&&c.lote);
  }
  const turnoTexto=t=>String(t||'').toUpperCase().includes('NOCHE')?'Noche':String(t||'').toUpperCase().includes('INTERMEDIO')?'Intermedio':'Día';

  /**
   * Una fila por (cuadro × lote de insumo marcado). registros: reportes (con cuadros[].lotesInsumo); lotes: para resolver uniones y la categoría actual.
   * Devuelve [{loteId, loteIdGuardado, loteProveedor, categoria, insumo, proveedor, unidadIds, reporteId, linea, fecha, turno, cuadro, marca,
   *            presentacion, lotePT, codigoLote, efectiva, estadoReporte, estadoCuadro}] ordenadas por fecha, turno y cuadro.
   */
  function usosDeRegistros(registros,lotes){
    const porId=new Map((lotes||[]).map(l=>[l.id,l]));
    const out=[];
    (Array.isArray(registros)?registros:[]).forEach(r=>{
      if(!r||!Array.isArray(r.cuadros))return;
      r.cuadros.forEach((c,i)=>{
        const lista=Array.isArray(c&&c.lotesInsumo)?c.lotesInsumo:[];
        if(!lista.length)return;
        const lpt=lotePTDe(r,c),vistos=new Set();
        lista.forEach(m=>{
          if(!m||!m.loteId)return;
          const man=esManual(m),enlazado=man&&LC()&&LC().resolverManual?LC().resolverManual(m,lotes):null;
          const id=man?(enlazado?enlazado.id:texto(m.loteId)):resolver(m.loteId,lotes),l=porId.get(id)||null;
          if(vistos.has(id))return;                                   // el mismo lote escrito a mano y luego tomado del sistema: una sola fila
          vistos.add(id);
          out.push({loteId:id,loteIdGuardado:texto(m.loteId),manual:man,loteProveedor:texto((l&&l.loteProveedor)||m.loteProveedor),
            categoria:String((l&&l.categoria)||m.categoria||'otro').toLowerCase(),insumo:texto((l&&l.producto)||m.insumo),proveedor:texto(l&&l.proveedor),
            unidadIds:Array.isArray(m.unidadIds)?m.unidadIds.slice():[],
            reporteId:texto(r.id),linea:texto(r.linea),fecha:texto(r.fecha).slice(0,10),turno:texto(r.turno),cuadro:num(c&&c.numero)||i+1,
            marca:texto(c&&c.marca),presentacion:texto(c&&c.presentacion),lotePT:lpt,codigoLote:texto(c&&c.lote),
            efectiva:num(c&&c.produccion&&c.produccion.efectiva),estadoReporte:texto(r.estadoRegistro)||'EN_REGISTRO',estadoCuadro:texto(c&&c.estadoCuadro)});
        });
      });
    });
    const t=x=>String(x.turno).toUpperCase().includes('NOCHE')?1:0;
    return out.sort((a,b)=>a.fecha.localeCompare(b.fecha)||t(a)-t(b)||a.linea.localeCompare(b.linea)||a.cuadro-b.cuadro||a.loteId.localeCompare(b.loteId));
  }

  /**
   * consulta: texto libre. filtros: {linea, desde, hasta (AAAA-MM-DD)}.
   * Devuelve {insumos:[{lote, unidades, usos}], productos:[{clave, lotePT, linea, fecha, turno, marca, presentacion, efectiva, reportes, insumos:{categoria:[…]}}]}.
   * · Insumo: coincide su ID (LI-…), su lote del proveedor, su producto, su proveedor o una de sus cajas/bobinas (o la consulta es el id de un lote unido a él).
   * · Producto: coincide el lote de producto (CF3-02112027 o solo CF3), la marca o la presentación. Sin consulta: los productos del filtro.
   */
  function buscar(consulta,{lotes,unidades,usos,filtros}={}){
    const q=norm(consulta),qa=q.replace(/[^A-Z0-9]/g,'');
    const f=filtros||{};
    const enFiltro=u=>(!f.linea||u.linea===f.linea)&&(!f.desde||u.fecha>=f.desde)&&(!f.hasta||u.fecha<=f.hasta);
    const usosF=(usos||[]).filter(enFiltro);
    const insumos=[];
    if(q){
      const unidadesPorLote=new Map();
      (unidades||[]).forEach(u=>{if(!unidadesPorLote.has(u.loteId))unidadesPorLote.set(u.loteId,[]);unidadesPorLote.get(u.loteId).push(u);});
      const vistos=new Set();
      (lotes||[]).forEach(l=>{
        if(!l)return;
        const destino=l.unidoEn?resolver(l.id,lotes):l.id;
        const us=unidadesPorLote.get(l.id)||[];
        const coincide=[l.id,l.loteProveedor,l.producto,l.proveedor,l.ordenInterna,l.itemNombre].some(x=>{const n=norm(x);return n&&(n.includes(q)||(qa.length>=3&&n.replace(/[^A-Z0-9]/g,'').includes(qa)));})||
          us.some(u=>norm(u.id).includes(q));
        if(!coincide||vistos.has(destino))return;
        if(l.unidoEn&&norm(l.id)!==q)return;                       // un lote unido solo aparece (como su destino) si se busca por su ID
        vistos.add(destino);
        const lote=(lotes||[]).find(x=>x.id===destino)||l;
        insumos.push({lote,unidades:(unidadesPorLote.get(lote.id)||[]).slice().sort((a,b)=>String(a.numero).localeCompare(String(b.numero),'es',{numeric:true})),
          usos:usosF.filter(u=>u.loteId===lote.id)});
      });
      /* Lotes escritos a mano que todavía no están en el sistema: se agrupan por su clave (MAN-…). */
      const manuales=new Map();
      usosF.filter(u=>/^MAN-/.test(u.loteId)).forEach(u=>{
        const ok=[u.loteId,u.loteProveedor,u.insumo].some(x=>{const n=norm(x);return n&&(n.includes(q)||(qa.length>=3&&n.replace(/[^A-Z0-9]/g,'').includes(qa)));});
        if(!ok)return;
        if(!manuales.has(u.loteId))manuales.set(u.loteId,{lote:{id:u.loteId,manual:true,loteProveedor:u.loteProveedor,producto:u.insumo||'(insumo no indicado)',categoria:u.categoria,proveedor:''},unidades:[],usos:[]});
        manuales.get(u.loteId).usos.push(u);
      });
      manuales.forEach(x=>insumos.push(x));
      insumos.sort((a,b)=>b.usos.length-a.usos.length||String(a.lote.id).localeCompare(String(b.lote.id)));
    }
    const prodMap=new Map();
    usosF.forEach(u=>{
      const okTexto=!q||[u.lotePT,u.codigoLote,u.marca,u.presentacion].some(x=>{const n=norm(x);return n&&(n.includes(q)||(qa.length>=3&&n.replace(/[^A-Z0-9]/g,'').includes(qa)));});
      if(!okTexto)return;
      const clave=[u.lotePT,u.linea,u.fecha,String(u.turno).toUpperCase().includes('NOCHE')?'N':'D',norm(u.marca),norm(u.presentacion)].join('|');
      if(!prodMap.has(clave))prodMap.set(clave,{clave,lotePT:u.lotePT,linea:u.linea,fecha:u.fecha,turno:u.turno,marca:u.marca,presentacion:u.presentacion,efectiva:0,reportes:[],cuadros:new Set(),insumos:{}});
      const p=prodMap.get(clave);
      const ck=u.reporteId+'#'+u.cuadro;
      if(!p.cuadros.has(ck)){p.cuadros.add(ck);p.efectiva+=u.efectiva;p.reportes.push({reporteId:u.reporteId,cuadro:u.cuadro,estadoReporte:u.estadoReporte});}
      if(!p.insumos[u.categoria])p.insumos[u.categoria]=[];
      if(!p.insumos[u.categoria].some(x=>x.loteId===u.loteId))p.insumos[u.categoria].push({loteId:u.loteId,loteProveedor:u.loteProveedor,insumo:u.insumo,proveedor:u.proveedor});
    });
    const productos=[...prodMap.values()].map(p=>{const {cuadros,...resto}=p;return resto;})
      .sort((a,b)=>b.fecha.localeCompare(a.fecha)||a.linea.localeCompare(b.linea)||String(a.lotePT).localeCompare(String(b.lotePT)));
    return {insumos,productos};
  }

  /** Filas planas para el Excel (una por cuadro × lote de insumo), en el orden de las columnas de COLUMNAS_EXCEL. */
  const COLUMNAS_EXCEL=['Lote de insumo (GLACIAL)','Lote del proveedor','Categoría','Insumo','Proveedor','Línea','Fecha','Turno','Producción n.º','Marca','Presentación','Lote de producto','Producción efectiva','Estado del reporte','Cajas/bobinas'];
  function filasExcel(usos){
    return (usos||[]).map(u=>[/^MAN-/.test(u.loteId)?'Escrito a mano (sin foto validada)':u.loteId,u.loteProveedor,NOMBRE_CAT[u.categoria]||u.categoria,u.insumo,u.proveedor,u.linea,u.fecha,turnoTexto(u.turno),u.cuadro,u.marca,u.presentacion,u.lotePT,u.efectiva,
      u.estadoReporte==='FINALIZADO'?'Finalizado':'En registro',u.unidadIds.join(', ')]);
  }
  /** Cobertura: cuántos cuadros producidos tienen al menos un lote de insumo marcado (para saber cuánto falta registrar). */
  function cobertura(registros,filtros){
    const f=filtros||{};let total=0,con=0;
    (Array.isArray(registros)?registros:[]).forEach(r=>{
      if(!r||!Array.isArray(r.cuadros))return;
      const fecha=texto(r.fecha).slice(0,10);
      if((f.linea&&r.linea!==f.linea)||(f.desde&&fecha<f.desde)||(f.hasta&&fecha>f.hasta))return;
      r.cuadros.forEach(c=>{
        if(!c||!texto(c.marca)||!(num(c.produccion&&c.produccion.efectiva)>0))return;
        total++;
        if(Array.isArray(c.lotesInsumo)&&c.lotesInsumo.length)con++;
      });
    });
    return {total,con,sin:total-con};
  }

  const API={ORDEN_CAT,NOMBRE_CAT,COLUMNAS_EXCEL,usosDeRegistros,buscar,filasExcel,cobertura,turnoTexto};
  raiz.glacialTrazabilidadInforme=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;

  /* ---------- pantalla (solo navegador) ---------- */
  if(typeof document==='undefined'||typeof window==='undefined')return;
  const esc=v=>typeof escaparHtml==='function'?escaparHtml(String(v==null?'':v)):String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const S={q:'',linea:'',desde:'',hasta:'',msg:null};
  let repintarHost=()=>{};
  const Z=()=>window.glacialTrazabilidadDatos||null;
  const fmtN=n=>Math.round(num(n)).toLocaleString('es-PE');
  const fFecha=iso=>{const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'/'+m[2]+'/'+m[1]:'—';};
  function registros(){
    try{return (typeof loadRecords==='function'?loadRecords():[])||[];}catch(_){return [];}
  }
  function datos(){
    const z=Z(),lotes=z?z.cache.lotes:[],unidades=z?z.cache.unidades:[];
    const regs=registros();
    return {lotes,unidades,regs,usos:usosDeRegistros(regs,lotes)};
  }
  const filtros=()=>({linea:S.linea,desde:S.desde,hasta:S.hasta});
  const T=()=>TN();
  const lineas=()=>(T()&&T().LINEAS)||['PET1','PET2','B7L','C20L','B20L'];

  function tablaUsos(usos){
    if(!usos.length)return '<p class="ii-mut">Este lote todavía no está marcado en ningún cuadro de producción (con los filtros elegidos).</p>';
    return `<div class="il-tabla-w"><table class="ie-t it-tabla"><thead><tr><th>Fecha</th><th>Turno</th><th>Línea</th><th>Producción</th><th>Marca · presentación</th><th>Lote de producto</th><th>Producido</th><th>Reporte</th></tr></thead><tbody>
      ${usos.map(u=>`<tr><td data-t="Fecha">${esc(fFecha(u.fecha))}</td><td data-t="Turno">${esc(turnoTexto(u.turno))}</td><td data-t="Línea">${esc(u.linea)}</td><td data-t="Producción">${esc(u.cuadro)}</td>
        <td data-t="Marca">${esc(u.marca)} <small class="ii-mut">${esc(u.presentacion)}</small></td><td data-t="Lote de producto"><b>${esc(u.lotePT||'—')}</b></td><td data-t="Producido">${esc(fmtN(u.efectiva))}</td>
        <td data-t="Reporte">${u.estadoReporte==='FINALIZADO'?'<span class="ii-pill ii-p-verde"><i></i>Finalizado</span>':'<span class="ii-pill ii-p-naranja"><i></i>En registro</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function insumoHtml(x){
    const l=x.lote,tn=T(),uf=tn&&tn.unidadFisica?tn.unidadFisica(l.categoria):{varios:'cajas / bobinas'};
    const lineasUsadas=[...new Set(x.usos.map(u=>u.linea))];
    const prod=x.usos.reduce((s,u)=>s+u.efectiva,0);
    return `<article class="ii-card it-card"><div class="ie-det-cab"><div><h4>${esc(l.producto)}</h4><p class="ii-mut">${esc(l.proveedor)} · lote del proveedor <b>${esc(l.loteProveedor)}</b> · ${esc(NOMBRE_CAT[l.categoria]||l.categoria)}</p></div>
      ${l.manual?'<span class="ii-pill ii-p-naranja"><i></i>Escrito a mano · sin foto validada</span>':`<button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="ilSel('${esc(l.id)}')">${esc(l.id)} · ver ficha</button>`}</div>
      <div class="ii-resumen"><div><b>${x.unidades.length}</b><span>${esc(uf.varios)}</span></div><div><b>${x.usos.length}</b><span>producciones</span></div><div><b>${esc(lineasUsadas.join(', ')||'—')}</b><span>líneas</span></div><div><b>${esc(fmtN(prod))}</b><span>producido con este lote</span></div></div>
      <h5 class="ie-g">Dónde se usó (hacia adelante)</h5>${tablaUsos(x.usos)}</article>`;
  }
  function productoHtml(p){
    const cats=ORDEN_CAT.filter(c=>p.insumos[c]&&p.insumos[c].length);
    return `<article class="ii-card it-card"><div class="ie-det-cab"><div><h4>Lote de producto <b>${esc(p.lotePT||'—')}</b></h4><p class="ii-mut">${esc(p.linea)} · ${esc(fFecha(p.fecha))} · ${esc(turnoTexto(p.turno))} · ${esc(p.marca)} ${esc(p.presentacion)} · ${esc(fmtN(p.efectiva))} producidas</p></div></div>
      <h5 class="ie-g">Lotes de insumo que lleva (hacia atrás)</h5>
      <ul class="it-ins">${cats.map(c=>`<li><b>${esc(NOMBRE_CAT[c]||c)}:</b> ${p.insumos[c].map(i=>`<button type="button" class="it-link" onclick="itBuscar('${esc(i.loteId)}')">${esc(i.loteProveedor)}</button> <small class="ii-mut">${esc(i.insumo)}${i.proveedor?' · '+esc(i.proveedor):''} (${/^MAN-/.test(i.loteId)?'escrito a mano':esc(i.loteId)})</small>`).join(' · ')}</li>`).join('')}</ul></article>`;
  }

  function html(){
    const d=datos(),f=filtros();
    const r=buscar(S.q,{lotes:d.lotes,unidades:d.unidades,usos:d.usos,filtros:f});
    const cob=cobertura(d.regs,f);
    const opt=lineas().map(l=>`<option value="${esc(l)}" ${l===S.linea?'selected':''}>${esc(l)}</option>`).join('');
    const avisoCob=cob.total?`<div class="ii-msg ${cob.sin?'ii-msg-error':'ii-msg-info'}" role="note">${cob.con} de ${cob.total} producciones ${f.linea||f.desde||f.hasta?'del filtro ':''}tienen lotes de insumo marcados.${cob.sin?` Las otras <b>${cob.sin}</b> no se pueden rastrear: el supervisor marca los lotes en «Lotes de insumo usados» de cada producción (los que están en el sistema o, si no, escritos a mano).`:''}</div>`:'';
    const resultados=!S.q&&!f.linea&&!f.desde&&!f.hasta?'<p class="ii-mut">Escribe un lote de insumo (LI-…, lote del proveedor o producto) o un lote de producto (p. ej. CF3-02112027), o elige línea y fechas.</p>':
      (r.insumos.length?`<h4 class="ie-g">Lotes de insumo (${r.insumos.length})</h4>${r.insumos.map(insumoHtml).join('')}`:'')+
      (r.productos.length?`<h4 class="ie-g">Lotes de producto (${r.productos.length})</h4>${r.productos.slice(0,60).map(productoHtml).join('')}${r.productos.length>60?`<p class="ii-mut">Se muestran 60 de ${r.productos.length}. Acota con línea y fechas, o exporta a Excel.</p>`:''}`:'')+
      (!r.insumos.length&&!r.productos.length?'<p class="ii-mut">Nada coincide con la búsqueda y los filtros.</p>':'');
    const msg=S.msg?`<div class="ii-msg ii-msg-${S.msg.tipo}" role="${S.msg.tipo==='error'?'alert':'status'}">${esc(S.msg.texto)}</div>`:'';
    return `<div class="ii-card"><div class="ii-fila-t"><h3>Informe de trazabilidad</h3></div>
      <p class="ii-mut">Del lote de insumo a la producción (dónde se usó) y del lote de producto a sus insumos (qué lleva). Sale de los lotes marcados en cada producción del Registro. Solo lectura.</p>
      <div class="it-filtros"><label class="ii-campo it-q"><span>Buscar</span><input type="search" id="it-q" value="${esc(S.q)}" placeholder="LI-000002, PG10016320, preforma 90 g, CF3-02112027…" oninput="itTexto(this.value)" autocomplete="off"></label>
        <label class="ii-campo"><span>Línea</span><select onchange="itFiltro('linea',this.value)"><option value="">Todas</option>${opt}</select></label>
        <label class="ii-campo"><span>Desde</span><input type="date" value="${esc(S.desde)}" onchange="itFiltro('desde',this.value)"></label>
        <label class="ii-campo"><span>Hasta</span><input type="date" value="${esc(S.hasta)}" onchange="itFiltro('hasta',this.value)"></label>
        <div class="it-acc"><button type="button" class="ii-btn" onclick="itExcel()" ${d.usos.length?'':'disabled'}>⬇ Exportar a Excel</button></div></div>
      ${msg}${avisoCob}</div><div id="it-res">${resultados}</div>`;
  }
  let espera=null;
  window.itTexto=v=>{S.q=v;S.msg=null;clearTimeout(espera);espera=setTimeout(()=>{
    const caja=document.getElementById('it-res');if(!caja){repintarHost();return;}
    const tmp=document.createElement('div');tmp.innerHTML=html();const nuevo=tmp.querySelector('#it-res');if(nuevo)caja.innerHTML=nuevo.innerHTML;
  },250);};
  window.itFiltro=(k,v)=>{S[k]=v||'';S.msg=null;repintarHost();};
  window.itBuscar=v=>{S.q=String(v||'');S.msg=null;repintarHost();};
  window.itExcel=async()=>{
    const d=datos(),f=filtros();
    const r=buscar(S.q,{lotes:d.lotes,unidades:d.unidades,usos:d.usos,filtros:f});
    // Lo que se ve: con búsqueda, los usos de los lotes de insumo y de los lotes de producto encontrados; sin búsqueda, todo lo del filtro.
    let usos=d.usos.filter(u=>(!f.linea||u.linea===f.linea)&&(!f.desde||u.fecha>=f.desde)&&(!f.hasta||u.fecha<=f.hasta));
    if(S.q){
      const ids=new Set(r.insumos.map(x=>x.lote.id)),prods=new Set(r.productos.map(p=>p.clave));
      const claveP=u=>[u.lotePT,u.linea,u.fecha,String(u.turno).toUpperCase().includes('NOCHE')?'N':'D',norm(u.marca),norm(u.presentacion)].join('|');
      usos=usos.filter(u=>ids.has(u.loteId)||prods.has(claveP(u)));
    }
    if(!usos.length){S.msg={tipo:'error',texto:'No hay filas para exportar con esta búsqueda y estos filtros.'};repintarHost();return;}
    try{
      const ExcelJS=typeof cargarScriptExterno==='function'?await cargarScriptExterno('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js','ExcelJS'):window.ExcelJS;
      if(!ExcelJS)throw new Error('No se pudo cargar la librería de Excel.');
      const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Trazabilidad',{views:[{state:'frozen',ySplit:4}]});
      ws.addRow(['GLACIAL · Informe de trazabilidad de lotes']).font={bold:true,size:14};
      ws.addRow(['Búsqueda: '+(S.q||'—')+' · Línea: '+(f.linea||'todas')+' · Desde: '+(f.desde?fFecha(f.desde):'—')+' · Hasta: '+(f.hasta?fFecha(f.hasta):'—')+' · Generado: '+new Date().toLocaleString('es-PE')]);
      ws.addRow([]);
      const cab=ws.addRow(COLUMNAS_EXCEL);cab.font={bold:true,color:{argb:'FFFFFFFF'}};
      cab.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0B2A4A'}};c.alignment={vertical:'middle',wrapText:true};});
      filasExcel(usos).forEach(f2=>ws.addRow(f2));
      [16,16,12,34,26,8,12,10,10,16,26,18,12,14,30].forEach((w,i)=>{ws.getColumn(i+1).width=w;});
      ws.autoFilter={from:{row:4,column:1},to:{row:4,column:COLUMNAS_EXCEL.length}};
      const buf=await wb.xlsx.writeBuffer();
      const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);
      a.download='Trazabilidad-lotes'+(f.linea?'-'+f.linea:'')+(S.q?'-'+String(S.q).replace(/[^A-Za-z0-9-]+/g,'_').slice(0,30):'')+'.xlsx';
      document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
      S.msg={tipo:'ok',texto:'Excel descargado: '+usos.length+' fila(s).'};
    }catch(e){S.msg={tipo:'error',texto:'No se pudo generar el Excel: '+((e&&e.message)||e)};}
    repintarHost();
  };
  const css=`.it-filtros{display:grid;grid-template-columns:minmax(0,2fr) repeat(3,minmax(0,1fr)) auto;gap:8px;align-items:end;margin-top:8px}.it-acc{display:flex;align-items:end}
.it-card{margin-top:10px}.it-card h4{margin:0;font-size:16px}.it-card h5{margin:12px 0 4px}.it-tabla th{text-align:left;font-size:12px;color:#475467;background:#f4f8fc}.it-tabla{min-width:720px}
.it-ins{margin:6px 0 0;padding-left:18px;display:grid;gap:6px}.it-link{border:0;background:none;color:#0877A6;font:inherit;font-weight:700;cursor:pointer;padding:4px 0;text-decoration:underline}
@media(max-width:900px){.it-filtros{grid-template-columns:1fr 1fr}.it-q{grid-column:1/-1}}
@media(max-width:560px){.it-filtros{grid-template-columns:1fr}.it-tabla{min-width:0}.it-tabla thead{display:none}.it-tabla,.it-tabla tbody,.it-tabla tr,.it-tabla td{display:block;width:100%}.it-tabla tr{border-top:1px solid #edf2f7;padding:6px 0}.it-tabla td::before{content:attr(data-t) ': ';font-weight:600;color:#475467}}`;
  function estilos(){if(document.getElementById('it-css'))return;const s=document.createElement('style');s.id='it-css';s.textContent=css;document.head.appendChild(s);}
  window.iiTrazabilidadInformeUI={html:()=>{estilos();return html();},usar:f=>{if(typeof f==='function')repintarHost=f;},estado:S};
})(typeof window!=='undefined'?window:globalThis);
