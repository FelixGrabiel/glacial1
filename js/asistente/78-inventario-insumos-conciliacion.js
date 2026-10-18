/* =============================================================
   GLACIAL · INVENTARIO DE INSUMOS — CONCILIACIÓN SAP vs CONTEO (Fase 3): pestaña «Conciliación» y Excel
   -------------------------------------------------------------
   Compara el conteo elegido con el corte de stock SAP elegido, SOLO sobre los almacenes contados (un conteo de «AP - INSUMOS Y SUMINISTROS»
   se compara con ese almacén; «Todos» con la suma de los 6). Estados (sobre el stock SAP): OK ≤ 2 % · OBSERVADO ≤ 10 % · CRÍTICO > 10 % ·
   NO CONTADO (hay stock SAP y no se contó) · SIN STOCK SAP (se contó y SAP tiene 0). Comentario editable por artículo (también con el conteo
   cerrado). El Excel sale con los mismos colores y tipografía que el Reporte general de Producción (73-reporte-general.js).
   Cálculo puro: conciliar() en 74-inventario-insumos-nucleo.js. Cargar DESPUÉS de 77 y ANTES de 12-init.js.
   ============================================================= */
(function instalarInventarioInsumosConciliacion(global){
  'use strict';
  const N=global.glacialInventarioNucleo;
  if(!N)return;
  const num=N.num,fmt=N.fmt;
  const esc=v=>typeof escaparHtml==='function'?escaparHtml(String(v==null?'':v)):String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ---------- Excel (ExcelJS) ---------- */
  const C={marino:'0B2540',sub:'17406B',subTxt:'CFE3F3',alt:'F5F9FC',borde:'D5DEE6',ok:'DCFCE7',okTxt:'166534',obs:'FFEDD5',obsTxt:'9A3412',crit:'FEE2E2',critTxt:'B42318',gris:'ECEFF3',grisTxt:'475467',azul:'DBEAFE',azulTxt:'0B5CC4'};
  const ESTILO={OK:[C.ok,C.okTxt],OBSERVADO:[C.obs,C.obsTxt],CRITICO:[C.crit,C.critTxt],NO_CONTADO:[C.gris,C.grisTxt],SIN_STOCK_SAP:[C.azul,C.azulTxt]};
  const fill=c=>({type:'pattern',pattern:'solid',fgColor:{argb:'FF'+c}});
  const font=o=>({name:'Arial',size:9,...o,color:o&&o.color?{argb:'FF'+o.color}:undefined});
  const bd=()=>{const l={style:'thin',color:{argb:'FF'+C.borde}};return {top:l,left:l,bottom:l,right:l};};
  const FMT_NUM='#,##0.##',FMT_PCT='0.0"%"';
  const col=n=>{let s='';n++;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26);}return s;};
  const dm=f=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(f||'');return m?m[3]+'.'+m[2]:'';};
  const dmy=f=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(f||'');return m?m[3]+'/'+m[2]+'/'+m[1]:(f||'');};
  const hora=ms=>{if(!ms)return '';const d=new Date(Number(ms)-5*3600000),p=n=>String(n).padStart(2,'0');return p(d.getUTCDate())+'/'+p(d.getUTCMonth()+1)+'/'+d.getUTCFullYear()+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes());};
  const nombreAlm=a=>a==='TODOS'?'Todos los almacenes':N.almacenInfo(a).nombre;
  /* Orden de las columnas de almacén en el Excel (el de la hoja de conciliación del usuario) */
  const ORDEN_EXCEL=['CUARENTENA','DEVOLUCIONES','INSUMOS','PRODUCCION','PRODUCTO_TERMINADO','INMOVILIZADOS'];
  const TXT_ESTADO=N.ESTADOS_CONCILIACION;

  /* m: {conteo (meta), corte (meta del corte: fechaCorte), conc (resultado de N.conciliar), detalle (N.detalleUbicaciones)} */
  function escribirExcel(ExcelJS,m){
    const wb=new ExcelJS.Workbook();wb.creator='GLACIAL';wb.created=new Date();
    const pag={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9,margins:{left:0.4,right:0.4,top:0.5,bottom:0.5,header:0.2,footer:0.2}};
    const cab=(ws,ncols,titulo,sub)=>{
      ws.mergeCells(`A1:${col(ncols-1)}1`);const t=ws.getCell('A1');t.value=titulo;t.font=font({size:14,bold:true,color:'FFFFFF'});t.fill=fill(C.marino);t.alignment={vertical:'middle',indent:1};ws.getRow(1).height=26;
      ws.mergeCells(`A2:${col(ncols-1)}2`);const s=ws.getCell('A2');s.value=sub;s.font=font({color:C.subTxt});s.fill=fill(C.sub);s.alignment={vertical:'middle',indent:1};ws.getRow(2).height=18;
    };
    const encabezados=(ws,fila,textos)=>{
      textos.forEach((x,i)=>{const c=ws.getCell(fila,i+1);c.value=x;c.font=font({bold:true,color:'FFFFFF'});c.fill=fill(C.sub);c.border=bd();c.alignment={horizontal:i===0?'left':'center',vertical:'middle',wrapText:true};});
      ws.getRow(fila).height=30;
    };
    const c0=m.conteo,r=m.conc.resumen,claves=ORDEN_EXCEL,idx=claves.map(k=>N.ALMACENES.findIndex(a=>a.clave===k));
    const sub=`Conteo del ${dmy(c0.fecha)} · ${nombreAlm(c0.almacen)} · comparado con el corte SAP del ${dmy(m.corte&&m.corte.fechaCorte)} · ${c0.estado==='CERRADO'?'Conteo cerrado':'Conteo EN PROCESO'}`;

    /* Hoja 1: conciliación (columnas del Excel del usuario; los totales y la diferencia son fórmulas vivas) */
    const ws=wb.addWorksheet('Conciliación',{properties:{tabColor:{argb:'FF'+C.marino}},views:[{state:'frozen',xSplit:1,ySplit:4,showGridLines:false}],pageSetup:pag});
    const heads=['Artículo',...claves.map(k=>k==='INMOVILIZADOS'?'AP - INMOVILIZADOS':N.almacenInfo(k).nombre),'TOTAL SAP','CONTEO '+dm(c0.fecha),'DIFERENCIA','COMENTARIOS','% DIF.','ESTADO'];
    const nc=heads.length;cab(ws,nc,'GLACIAL · Conciliación de inventario de insumos',sub);
    ws.getRow(3).height=6;encabezados(ws,4,heads);
    const cTot=claves.length+2,cCon=cTot+1,cDif=cCon+1,cCom=cDif+1,cPct=cCom+1,cEst=cPct+1;
    m.conc.filas.forEach((f,i)=>{
      const n=5+i,row=ws.getRow(n);
      row.getCell(1).value=f.nombre;
      idx.forEach((k,j)=>{row.getCell(2+j).value=num(f.w[k]);});
      // TOTAL SAP = suma de los almacenes contados (si se contó un solo almacén, ese; con «Todos», los 6)
      const inc=idx.map((k,j)=>({k,j})).filter(x=>m.conc.claves.includes(N.ALMACENES[x.k].clave)).map(x=>col(1+x.j)+n);
      row.getCell(cTot).value={formula:inc.length?inc.join('+'):'0',result:f.sap};
      row.getCell(cCon).value=f.contado?f.conteo:null;
      row.getCell(cDif).value={formula:`${col(cCon-1)}${n}-${col(cTot-1)}${n}`,result:f.contado||f.sap>0?f.diferencia:0};
      row.getCell(cCom).value=f.comentario||'';
      row.getCell(cPct).value=f.pct==null?null:f.pct;
      const e=row.getCell(cEst);e.value=TXT_ESTADO[f.estado];
      for(let c=1;c<=nc;c++){const x=row.getCell(c);x.font=font({bold:c===cTot||c===cCon});x.border=bd();if(i%2===1)x.fill=fill(C.alt);
        if(c>1&&c<cCom)x.numFmt=FMT_NUM;x.alignment={vertical:'middle',wrapText:c===1||c===cCom,horizontal:c>1&&c<cCom?'right':c===cEst?'center':'left'};}
      row.getCell(cPct).numFmt=FMT_PCT;row.getCell(cPct).alignment={horizontal:'right',vertical:'middle'};
      const [bg,tx]=ESTILO[f.estado];e.fill=fill(bg);e.font=font({bold:true,color:tx});
      if(f.estado==='CRITICO'||f.estado==='OBSERVADO'){const d=row.getCell(cDif);d.font=font({bold:true,color:tx});}
    });
    const ult=4+m.conc.filas.length;
    ws.autoFilter={from:{row:4,column:1},to:{row:Math.max(ult,4),column:nc}};
    ws.getColumn(1).width=46;for(let c=2;c<=cCon+1;c++)ws.getColumn(c).width=c<=claves.length+1?14:13;ws.getColumn(cCom).width=38;ws.getColumn(cPct).width=9;ws.getColumn(cEst).width=14;
    ws.getColumn(cTot).width=13;ws.getColumn(cCon).width=13;

    /* Hoja 2: detalle por ubicación */
    const wd=wb.addWorksheet('Detalle por ubicación',{properties:{tabColor:{argb:'FF'+C.sub}},views:[{state:'frozen',ySplit:4,showGridLines:false}],pageSetup:pag});
    cab(wd,7,'GLACIAL · Detalle del conteo por ubicación',sub);wd.getRow(3).height=6;
    encabezados(wd,4,['Artículo','Código','Código SAP','Ubicación','Cantidad','Registró','Fecha y hora']);
    m.detalle.forEach((d,i)=>{
      const row=wd.getRow(5+i);[d.nombre,d.codigo||'',d.itemCode||'',d.ubicacion,d.cantidad,d.por,hora(d.en)].forEach((v,c)=>{const x=row.getCell(c+1);x.value=v;x.font=font({});x.border=bd();if(i%2===1)x.fill=fill(C.alt);
        x.alignment={vertical:'middle',horizontal:c===4?'right':'left',wrapText:c===0};if(c===4)x.numFmt=FMT_NUM;});
    });
    wd.autoFilter={from:{row:4,column:1},to:{row:Math.max(4+m.detalle.length,4),column:7}};
    [46,11,14,22,13,20,18].forEach((w,i)=>{wd.getColumn(i+1).width=w;});

    /* Hoja 3: resumen */
    const wr=wb.addWorksheet('Resumen',{properties:{tabColor:{argb:'FF'+C.azulTxt}},views:[{showGridLines:false}],pageSetup:pag});
    cab(wr,3,'GLACIAL · Resumen de la conciliación',sub);wr.getRow(3).height=6;encabezados(wr,4,['Estado','Artículos','Criterio']);
    [['OK',r.OK,`Diferencia ≤ ${N.UMBRAL_OK} % del stock SAP`],['OBSERVADO',r.OBSERVADO,`Entre ${N.UMBRAL_OK} % y ${N.UMBRAL_OBSERVADO} %`],['CRITICO',r.CRITICO,`Más de ${N.UMBRAL_OBSERVADO} %`],
      ['NO_CONTADO',r.NO_CONTADO,'Hay stock SAP y no se contó'],['SIN_STOCK_SAP',r.SIN_STOCK_SAP,'Se contó y SAP no tiene stock']].forEach(([k,n,crit],i)=>{
      const row=wr.getRow(5+i);row.getCell(1).value=TXT_ESTADO[k];row.getCell(2).value=n;row.getCell(3).value=crit;
      for(let c=1;c<=3;c++){const x=row.getCell(c);x.font=font({});x.border=bd();x.alignment={vertical:'middle',horizontal:c===2?'right':'left'};}
      row.getCell(1).fill=fill(ESTILO[k][0]);row.getCell(1).font=font({bold:true,color:ESTILO[k][1]});row.getCell(2).numFmt='#,##0';});
    const t=wr.getRow(10);t.getCell(1).value='Total de artículos';t.getCell(2).value={formula:'SUM(B5:B9)',result:r.total};t.getCell(3).value=`${r.pctContado} % contado · ${r.conComentario} con comentario`;
    for(let c=1;c<=3;c++){const x=t.getCell(c);x.font=font({bold:true});x.border=bd();x.fill=fill(C.alt);}t.getCell(2).numFmt='#,##0';t.getCell(2).alignment={horizontal:'right'};
    [26,12,48].forEach((w,i)=>{wr.getColumn(i+1).width=w;});
    return wb;
  }
  /* Auditoría a Excel: una fila por cambio (campo, antes, después) para poder filtrar y ordenar. m: {eventos (ya filtrados), desde, hasta, conteos (metadatos), filtros (texto)} */
  function escribirAuditoriaExcel(ExcelJS,m){
    const wb=new ExcelJS.Workbook();wb.creator='GLACIAL';wb.created=new Date();
    const ws=wb.addWorksheet('Auditoría',{properties:{tabColor:{argb:'FF'+C.marino}},views:[{state:'frozen',ySplit:4,showGridLines:false}],
      pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9,margins:{left:0.4,right:0.4,top:0.5,bottom:0.5,header:0.2,footer:0.2}}});
    const heads=['Fecha y hora','Usuario','Acción','Artículo / dato','Conteo','Campo','Valor anterior','Valor nuevo'],nc=heads.length;
    ws.mergeCells(`A1:${col(nc-1)}1`);const t=ws.getCell('A1');t.value='GLACIAL · Auditoría del inventario de insumos';t.font=font({size:14,bold:true,color:'FFFFFF'});t.fill=fill(C.marino);t.alignment={vertical:'middle',indent:1};ws.getRow(1).height=26;
    ws.mergeCells(`A2:${col(nc-1)}2`);const s2=ws.getCell('A2');s2.value=`Del ${dmy(m.desde)} al ${dmy(m.hasta)} · ${m.eventos.length} evento(s)${m.filtros?' · '+m.filtros:''}`;s2.font=font({color:C.subTxt});s2.fill=fill(C.sub);s2.alignment={vertical:'middle',indent:1};ws.getRow(2).height=18;
    ws.getRow(3).height=6;
    heads.forEach((x,i)=>{const c=ws.getCell(4,i+1);c.value=x;c.font=font({bold:true,color:'FFFFFF'});c.fill=fill(C.sub);c.border=bd();c.alignment={horizontal:'center',vertical:'middle',wrapText:true};});
    ws.getRow(4).height=24;
    let n=5,k=0;
    m.eventos.forEach(e=>{
      const tipo=(N.TIPOS_AUDITORIA[e.tipo]||{txt:e.tipo}).txt,cm=(m.conteos||[]).find(c=>c.id===e.conteoId);
      const cambios=N.cambiosAuditoria(e);
      (cambios.length?cambios:[{campo:'',antes:'',despues:''}]).forEach(c=>{
        const row=ws.getRow(n++);
        [hora(e.enMs)+':'+String(new Date(Number(e.enMs)-5*3600000).getUTCSeconds()).padStart(2,'0'),e.usuario||'',tipo,e.articulo||'',cm?dmy(cm.fecha)+' · '+nombreAlm(cm.almacen):'',c.campo,c.antes==='—'?'':c.antes,c.despues==='—'?'':c.despues].forEach((v,i)=>{
          const x=row.getCell(i+1);x.value=v;x.font=font({});x.border=bd();if(k%2===1)x.fill=fill(C.alt);x.alignment={vertical:'middle',wrapText:i>=3};});
      });k++;
    });
    ws.autoFilter={from:{row:4,column:1},to:{row:Math.max(n-1,4),column:nc}};
    [19,18,30,40,26,18,22,22].forEach((w,i)=>{ws.getColumn(i+1).width=w;});
    return wb;
  }
  async function guardarLibro(wb,nombre){
    const buf=await wb.xlsx.writeBuffer();
    const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    if(typeof descargarArchivo==='function')descargarArchivo(blob,nombre);
    else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nombre;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}
    return nombre;
  }
  async function exportarAuditoria(m){return guardarLibro(escribirAuditoriaExcel(await asegurarExcelJS(),m),`GLACIAL_Auditoria_Insumos_${m.desde}_${m.hasta}.xlsx`);}
  async function asegurarExcelJS(){
    if(global.ExcelJS&&global.ExcelJS.Workbook)return global.ExcelJS;
    if(typeof cargarScriptExterno==='function')await cargarScriptExterno('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js','ExcelJS');
    if(!global.ExcelJS||!global.ExcelJS.Workbook)throw new Error('No se pudo cargar la librería de Excel (ExcelJS). Revisa tu conexión a internet.');
    return global.ExcelJS;
  }
  async function exportar(m){
    const wb=escribirExcel(await asegurarExcelJS(),m);
    const buf=await wb.xlsx.writeBuffer(),nombre=`GLACIAL_Conciliacion_Insumos_${m.conteo.fecha}.xlsx`;
    const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    if(typeof descargarArchivo==='function')descargarArchivo(blob,nombre);
    else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nombre;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}
    return nombre;
  }
  const API={escribirExcel,exportar,escribirAuditoriaExcel,exportarAuditoria,ORDEN_EXCEL};
  global.glacialInventarioExcel=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;

  /* ---------- pantalla ---------- */
  const D=global.glacialInventarioDatos;
  if(!D||typeof document==='undefined')return;
  const K={id:'',estado:'',texto:'',limite:150,msg:null};
  const repintar=()=>{const p=global.__inventarioInsumosPantalla;if(p)p.pintar();};
  const metaDe=()=>D.cache.conteos.find(c=>c.id===K.id)||null;
  const corteMeta=()=>D.cache.cortes.find(c=>c.id===D.cache.corteId)||null;
  const PILL={OK:'ii-p-verde',OBSERVADO:'ii-p-naranja',CRITICO:'ii-p-rojo',NO_CONTADO:'ii-p-gris',SIN_STOCK_SAP:'ii-p-azul'};
  const pill=e=>`<span class="ii-pill ${PILL[e]}"><i></i>${esc(TXT_ESTADO[e])}</span>`;
  function modelo(){
    const m=metaDe();if(!m||D.cache.conteoId!==K.id||!D.cache.conteo)return null;
    const lineas=D.cache.conteo.items||[];
    return {conteo:m,corte:corteMeta(),conc:N.conciliar({catalogo:D.cache.catalogo,corte:D.cache.corte,lineas,almacen:m.almacen,comentarios:D.cache.comentarios}),detalle:N.detalleUbicaciones(lineas,D.cache.catalogo)};
  }
  function filasVisibles(mod){
    const t=N.norm(K.texto||'');
    return mod.conc.filas.filter(f=>(!K.estado||f.estado===K.estado)&&(!t||N.norm(f.nombre).includes(t)||N.norm(f.itemCode).includes(t)||N.norm(f.codigo).includes(t)));
  }
  function tarjetas(r){
    const t=(cls,titulo,v,e)=>`<button type="button" class="ii-kpi ii-kb ${cls} ${K.estado===e?'ii-kb-act':''}" onclick="iiqEstado('${e}')"><span>${esc(titulo)}</span><b>${fmt(v,0)}</b></button>`;
    return `<div class="ii-kpis ii-kpis5">${t('ii-k-verde','OK',r.OK,'OK')}${t('ii-k-ambar','Observado',r.OBSERVADO,'OBSERVADO')}${t('ii-k-rojo','Crítico',r.CRITICO,'CRITICO')}${t('ii-k-gris','No contado',r.NO_CONTADO,'NO_CONTADO')}${t('ii-k-azul','Sin stock SAP',r.SIN_STOCK_SAP,'SIN_STOCK_SAP')}</div>`;
  }
  function tabla(mod){
    const puede=D.puedeEscribir(),f=filasVisibles(mod),mostrar=f.slice(0,K.limite);
    const filas=mostrar.map(x=>`<tr><td class="ii-nom">${esc(x.nombre)}<small class="ii-mut"><b>${esc(x.codigo||'')}</b> ${esc(x.itemCode?'· SAP '+x.itemCode:'')} · ${esc(x.categoria)}</small></td><td class="ii-num">${fmt(x.sap)}</td>
      <td class="ii-num"><b>${x.contado?fmt(x.conteo):'—'}</b></td><td class="ii-num ii-dif-${x.estado}">${x.contado||x.sap>0?fmt(x.diferencia):'—'}</td><td class="ii-num">${x.pct==null?'—':fmt(x.pct,1)+' %'}</td><td>${pill(x.estado)}</td>
      <td class="ii-com">${puede?`<input type="text" maxlength="500" value="${esc(x.comentario)}" placeholder="Comentario" data-id="${esc(x.id)}" onchange="iiqComentario(this)">`:esc(x.comentario)}
      ${x.comentario?`<small class="ii-mut">${esc(x.comentarioPor)} · ${esc(hora(x.comentarioEn))}</small>`:''}</td></tr>`).join('');
    const mas=f.length>mostrar.length?`<div class="ii-mas"><button type="button" class="ii-btn ii-btn-o" onclick="iiqMas()">Mostrar más (${fmt(f.length-mostrar.length,0)} restantes)</button></div>`:'';
    return `<div class="ii-tw"><table class="ii-t"><thead><tr><th>Artículo</th><th class="ii-num">Total SAP</th><th class="ii-num">Conteo ${esc(dm(mod.conteo.fecha))}</th><th class="ii-num">Diferencia</th><th class="ii-num">% dif.</th><th>Estado</th><th>Comentario</th></tr></thead>
      <tbody>${filas||'<tr><td colspan="7" class="ii-vacio">Ningún artículo coincide con el filtro.</td></tr>'}</tbody></table></div>${mas}<p class="ii-pie">${fmt(f.length,0)} artículo(s).</p>`;
  }
  function html(){
    if(!D.cache.conteos.length)return `<div class="ii-card ii-centro"><h3>Aún no hay conteos</h3><p>Crea y cierra un conteo en «Conteo físico» para conciliarlo con SAP.</p></div>`;
    if(!K.id||!metaDe())K.id=D.cache.conteos[0].id;
    if(D.cache.conteoId!==K.id){const id=K.id;setTimeout(()=>{if(D.cache.conteoId!==id)D.escucharConteo(id);},0);}      // se escucha fuera del dibujo para no repintar dentro de sí mismo
    const msg=K.msg?`<div class="ii-msg ii-msg-${K.msg.tipo}" role="${K.msg.tipo==='error'?'alert':'status'}">${esc(K.msg.texto)}</div>`:'';
    const mod=modelo();
    const sel=`<div class="ii-filtros"><label class="ii-campo"><span>Conteo</span><select onchange="iiqConteo(this.value)">${D.cache.conteos.map(c=>`<option value="${esc(c.id)}" ${c.id===K.id?'selected':''}>${esc(dmy(c.fecha))} · ${esc(nombreAlm(c.almacen))} · ${c.estado==='CERRADO'?'Cerrado':'En proceso'}</option>`).join('')}</select></label>
      <label class="ii-campo"><span>Corte de stock SAP</span><select onchange="iiCorte(this.value)">${D.cache.cortes.map(c=>`<option value="${esc(c.id)}" ${c.id===D.cache.corteId?'selected':''}>${esc(dmy(c.fechaCorte))} · ${esc(c.archivo||'sin archivo')}</option>`).join('')||'<option>Sin cortes</option>'}</select></label>
      <label class="ii-campo"><span>Buscar</span><input type="search" id="ii-q-texto" value="${esc(K.texto)}" placeholder="Nombre o código" oninput="iiqTexto(this.value)" autocomplete="off"></label>
      <button type="button" class="ii-btn" onclick="iiqExportar()" ${mod&&mod.conc.filas.length?'':'disabled'}>Exportar a Excel</button></div>`;
    if(!mod)return msg+`<div class="ii-card">${sel}<p class="ii-mut">Consultando…</p></div>`;
    const aviso=[];
    if(!D.cache.corte)aviso.push('No hay un corte de stock SAP: importa uno en «Stock actual».');
    else if(mod.corte&&mod.corte.fechaCorte!==mod.conteo.fecha)aviso.push(`El corte SAP es del ${dmy(mod.corte.fechaCorte)} y el conteo del ${dmy(mod.conteo.fecha)}: confirma que son comparables.`);
    if(mod.conteo.estado!=='CERRADO')aviso.push('El conteo sigue EN PROCESO: la conciliación es provisional.');
    if(mod.conc.huerfanas.length)aviso.push(`${mod.conc.huerfanas.length} línea(s) apuntan a artículos que ya no están en el catálogo y no se concilian.`);
    return msg+`<div class="ii-card">${sel}${aviso.map(a=>`<div class="ii-msg ii-msg-info">${esc(a)}</div>`).join('')}
      <p class="ii-mut">Se compara con el stock SAP de: <b>${esc(nombreAlm(mod.conteo.almacen))}</b>. OK ≤ ${N.UMBRAL_OK} % · Observado ≤ ${N.UMBRAL_OBSERVADO} % · Crítico > ${N.UMBRAL_OBSERVADO} % (sobre el stock SAP).</p></div>
      ${tarjetas(mod.conc.resumen)}<div class="ii-card"><div id="ii-q-tabla">${tabla(mod)}</div></div>`;
  }
  let espera=null;
  function pintarTabla(){const c=document.getElementById('ii-q-tabla'),mod=modelo();if(!c||!mod){repintar();return;}c.innerHTML=tabla(mod);}
  global.iiqConteo=id=>{K.id=id;K.estado='';K.limite=150;K.msg=null;D.escucharConteo(id);repintar();};
  global.iiqEstado=e=>{K.estado=K.estado===e?'':e;K.limite=150;repintar();};
  global.iiqTexto=v=>{K.texto=v;K.limite=150;clearTimeout(espera);espera=setTimeout(pintarTabla,150);};
  global.iiqMas=()=>{K.limite+=150;pintarTabla();};
  global.iiqComentario=input=>{
    D.guardarComentario(K.id,input.getAttribute('data-id'),input.value).then(()=>{K.msg=null;}).catch(e=>{K.msg={tipo:'error',texto:D.mensajeError(e)};repintar();});
  };
  global.iiqExportar=async()=>{
    const mod=modelo();if(!mod)return;
    try{const n=await exportar(mod);K.msg={tipo:'ok',texto:'Excel generado: '+n};}catch(e){K.msg={tipo:'error',texto:(e&&e.message)||String(e)};}
    repintar();
  };
  const css=`
.ii-kpis5{grid-template-columns:repeat(5,minmax(0,1fr))}.ii-kb{font:inherit;text-align:left;cursor:pointer;color:inherit}.ii-kb-act{outline:3px solid #0b5cc4}
.ii-k-verde b{color:#166534}.ii-p-azul{background:#dbeafe;color:#0b5cc4}.ii-com{min-width:200px}.ii-com input{min-height:36px!important;font-size:14px!important}
.ii-dif-CRITICO{color:#b42318;font-weight:700}.ii-dif-OBSERVADO{color:#9a3412;font-weight:700}.ii-nom small{display:block}
@media(max-width:700px){.ii-kpis5{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
  global.iiConciliacionUI={html,css,activoEnEdicion:()=>!!document.querySelector('#ii-q-tabla input:focus,#ii-q-texto:focus')};
  global.__inventarioInsumosConciliacion={K,modelo,filasVisibles};
})(typeof window!=='undefined'?window:globalThis);
