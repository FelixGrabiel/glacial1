/* =============================================================
   GLACIAL · CONTROL DE PROCESO EN EL ENVASADO (CF - CA - F - 047) — EXCEL + TARJETA EN LA PESTAÑA «LOTES»
   -------------------------------------------------------------
   Genera el libro del mes con el MISMO formato del Drive (un libro por línea y mes, una hoja por marca, una fila por cuadro): título y código del formulario,
   logo, «PRODUCTO / PRESENTACION», grupos SOPLADO · ENVASADO · ETIQUETADO · EMPAQUETADO y la rejilla de 17 columnas. Los datos salen del núcleo (90): lote de producción,
   cantidades, fecha, turno y lotes de insumo. Las columnas de verificación (MAN, LAV, LLEN, CIERRE, CONF, ROTUL) quedan vacías para que las complete planta.
   La columna R (oculta) guarda la clave del cuadro: es lo que usará la copia automática a Drive (Etapa 3) para actualizar la fila en vez de duplicarla.
   Solo LEE los reportes (loadRecords) y los lotes registrados en cada cuadro. No modifica producción, stock SAP ni tareo.
   Cargar DESPUÉS de 90-control-proceso-nucleo.js. La tarjeta la monta 89-trazabilidad-lotes-pantalla.js dentro de la pestaña Lotes.
   ============================================================= */
(function instalarControlProcesoExcel(global){
  'use strict';
  const P=global.glacialControlProcesoNucleo;
  if(!P)return;

  /* Anchos de columna del formulario original (A…Q) y R = clave oculta. */
  const ANCHOS=[12.89,5.33,5.33,5.33,13,6.89,7.89,8,11.55,6.11,9,6.89,9.44,6.89,9.89,11.89,10.66,14];
  const ENCABEZADOS=['LOTE PROD','MAN','LAV','LLEN','L.PREFORMA','CIERRE','CANT','CANT','L. TAPA','CONF','LOTE ','ROTUL','LOTE ASA','CONF','CANT','FECHA','TURNO','CLAVE GLACIAL'];
  const GRUPOS=[['B7:G7','SOPLADO '],['H7:J7','ENVASADO '],['K7:L7','ETIQUETADO'],['M7:O7','EMPAQUETADO']];
  const FUENTE={name:'Calibri',size:11};
  const fino={style:'thin'},medio={style:'medium'};

  const dentro=(rango)=>{
    const [a,b]=rango.split(':'),col=s=>s.replace(/\d+/g,'').split('').reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0),fila=s=>Number(s.replace(/\D+/g,''));
    return {c1:col(a),f1:fila(a),c2:col(b),f2:fila(b)};
  };
  /** Borde exterior de un rango (también de los combinados). */
  function caja(ws,rango,estilo){
    const {c1,f1,c2,f2}=dentro(rango);
    for(let f=f1;f<=f2;f++)for(let c=c1;c<=c2;c++){
      const cel=ws.getCell(f,c),b=Object.assign({},cel.border||{});
      if(f===f1)b.top=estilo;if(f===f2)b.bottom=estilo;if(c===c1)b.left=estilo;if(c===c2)b.right=estilo;
      cel.border=b;
    }
  }
  const fechaExcel=iso=>{const [a,m,d]=iso.split('-').map(Number);return new Date(Date.UTC(a,m-1,d));};

  function hoja(wb,h,modelo,{logoId,logoAncho,logoAlto,minFilas}){
    const ws=wb.addWorksheet(h.nombre,{
      pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:0.51,right:0.71,top:0.75,bottom:0.75,header:0,footer:0},printTitlesRow:'1:8'},
      views:[{state:'frozen',ySplit:8,showGridLines:false}]
    });
    ANCHOS.forEach((w,i)=>{ws.getColumn(i+1).width=w;});
    ws.getColumn(18).hidden=true;
    [1,2,3].forEach(r=>{ws.getRow(r).height=27;});ws.getRow(4).height=14.4;ws.getRow(5).height=14.4;ws.getRow(8).height=14.4;

    /* Título y código del formulario */
    ws.mergeCells('B1:J3');ws.mergeCells('K1:O3');
    const t=ws.getCell('B1');t.value=P.FORMULARIO.titulo;t.font={name:'Calibri',size:28,bold:true};t.alignment={horizontal:'center',vertical:'middle',wrapText:true};
    const k=ws.getCell('K1');k.value=P.FORMULARIO.codigo;k.font={name:'Calibri',size:18,bold:true};k.alignment={horizontal:'center',vertical:'middle'};
    caja(ws,'B1:J3',medio);caja(ws,'K1:O3',medio);
    if(logoId!==undefined)ws.addImage(logoId,{tl:{col:1.07,row:1.3},ext:{width:logoAncho,height:logoAlto}});

    /* PRODUCTO / PRESENTACION */
    ws.mergeCells('B5:C5');ws.mergeCells('E5:F5');ws.mergeCells('I5:K5');
    [['B5','PRODUCTO:'],['E5',h.marca],['I5','PRESENTACION:'],['L5',h.presentacion||modelo.presentacion]].forEach(([c,v])=>{
      const x=ws.getCell(c);x.value=v;x.font={...FUENTE,bold:true};x.alignment={horizontal:'center'};
    });
    for(let c=4;c<=8;c++)ws.getCell(5,c).border={bottom:fino};
    for(let c=12;c<=15;c++)ws.getCell(5,c).border={bottom:fino};

    /* Grupos (fila 7) y encabezados (fila 8) */
    GRUPOS.forEach(([r,v])=>{ws.mergeCells(r);const x=ws.getCell(r.split(':')[0]);x.value=v;x.font={...FUENTE,bold:true};x.alignment={horizontal:'center',vertical:'middle'};caja(ws,r,medio);});
    ENCABEZADOS.forEach((v,i)=>{
      const x=ws.getCell(8,i+1);x.value=v;x.font={...FUENTE,bold:true};x.alignment={horizontal:'center'};x.border={left:fino,right:fino,top:fino,bottom:fino};
    });

    /* Filas: una por cuadro; se completa con filas vacías con borde (como el formulario impreso). */
    const total=Math.max(h.filas.length,minFilas);
    for(let i=0;i<total;i++){
      const f=h.filas[i],r=9+i;ws.getRow(r).height=15.75;
      const v=f?[f.lotePT,null,null,null,f.preforma,null,f.soplado||null,f.envasado||null,f.tapa,null,f.etiqueta,null,f.asa,null,f.empaquetado||null,f.fecha?fechaExcel(f.fecha):null,f.turno,f.clave]:[];
      for(let c=1;c<=17;c++){
        const x=ws.getCell(r,c);
        if(f&&v[c-1]!==null&&v[c-1]!==undefined&&v[c-1]!=='')x.value=v[c-1];
        x.font=FUENTE;x.border={left:fino,right:fino,top:fino,bottom:fino};
        if(c===1)x.alignment={vertical:'middle'};
        if([9,13,16,17].includes(c))x.alignment={horizontal:'center',vertical:'middle'};
        if([7,8,15].includes(c))x.numFmt='#,##0';
        if(c===16)x.numFmt='dd/mm/yyyy';
      }
      if(f)ws.getCell(r,18).value=f.clave;
    }
    return ws;
  }

  /** ExcelJS + modelo de 90 → libro. minFilas: filas con borde por hoja (22 caben en una A4 horizontal) aunque haya pocos datos. */
  function construirLibro(ExcelJS,modelo,{logoBase64,logoRatio,minFilas}={}){
    const wb=new ExcelJS.Workbook();
    wb.creator='GLACIAL';wb.created=new Date();wb.title=P.FORMULARIO.titulo+' · '+modelo.nombreLinea+' · '+modelo.mesNombre+' '+modelo.anio;
    const alto=46,ancho=Math.round(alto*(logoRatio||205/129));
    let logoId;
    if(logoBase64){try{logoId=wb.addImage({base64:logoBase64,extension:'png'});}catch(e){logoId=undefined;}}
    modelo.hojas.forEach(h=>hoja(wb,h,modelo,{logoId,logoAncho:ancho,logoAlto:alto,minFilas:minFilas||22}));
    return wb;
  }

  /* ---------- tarjeta en la pestaña Lotes ---------- */
  const esc=v=>typeof escaparHtml==='function'?escaparHtml(String(v==null?'':v)):String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const limaHoy=()=>new Date(Date.now()-5*3600000).toISOString().slice(0,7);
  const S={linea:'B7L',mes:limaHoy(),msg:null,ocupado:false,drive:{filas:[],disponible:null,error:'',en:0,enCurso:false,sincronizando:false}};
  const registros=()=>typeof loadRecords==='function'?loadRecords():[];
  const modeloActual=()=>{const [a,m]=S.mes.split('-').map(Number);return P.modeloMes(registros(),{linea:S.linea,anio:a,mes:m});};
  let repintar=()=>{};

  function resumenHtml(m){
    if(m.error)return `<div class="ii-msg ii-msg-error" role="alert">${esc(m.error)}</div>`;
    if(!m.total)return `<div class="ii-msg ii-msg-info" role="status">No hay cuadros producidos en ${esc(m.nombreLinea)} en ${esc(m.mesNombre.toLowerCase())} de ${m.anio}.</div>`;
    const faltan=m.sinLotes?`<li><b>${m.sinLotes}</b> de ${m.total} filas no tienen todos los lotes de insumo (preforma ${m.sinLotesPorColumna.preforma}, tapa ${m.sinLotesPorColumna.tapa}, etiqueta ${m.sinLotesPorColumna.etiqueta}, asa ${m.sinLotesPorColumna.asa}). Salen en blanco: se llenan al registrar el uso de lotes en cada cuadro.</li>`:'<li>Todas las filas traen sus lotes de insumo.</li>';
    const venc=m.sinVencimiento?`<li><b>${m.sinVencimiento}</b> filas sin fecha de vencimiento: el lote de producción sale solo con su código.</li>`:'';
    return `<div class="ii-resumen"><div><b>${m.total}</b><span>filas (cuadros)</span></div><div><b>${m.hojas.length}</b><span>hojas (marcas)</span></div></div>
      <ul class="ii-lista-sm">${faltan}${venc}<li>Hojas: ${esc(m.hojas.map(h=>h.nombre+' ('+h.filas.length+')').join(' · '))}.</li></ul>`;
  }
  /* ---------- copia a Drive (estado y «Sincronizar ahora») ---------- */
  const cliente=()=>global.glacialSupabaseCliente||null;
  const puedeSincronizar=()=>!global.glacialTrazabilidadDatos||global.glacialTrazabilidadDatos.puedeEscribir();
  const faltaFuncion=(cod,m)=>cod==='PGRST202'||cod==='42883'||/could not find the function|does not exist|schema cache/i.test(String(m||''));
  async function cargarDrive(){
    const c=cliente(),D=S.drive;
    if(!c||typeof c.rpc!=='function'||D.enCurso)return;
    D.enCurso=true;D.en=Date.now();
    try{
      const r=await c.rpc('control_proceso_estado');
      if(r&&r.error){
        if(faltaFuncion(String(r.error.code||''),r.error.message)){D.disponible=false;D.error='';}
        else{D.disponible=true;D.error=String(r.error.message||'No se pudo leer el estado de la copia a Drive.');}
      }else{D.filas=Array.isArray(r&&r.data)?r.data:[];D.disponible=true;D.error='';}
    }catch(e){D.error=String((e&&e.message)||e);}
    finally{D.enCurso=false;repintar();}
  }
  const hace=ms=>{const s=Math.max(0,Math.round((Date.now()-Date.parse(ms))/1000));return s<90?'unos segundos':s<3600?'hace '+Math.round(s/60)+' min':s<172800?'hace '+Math.round(s/3600)+' h':'hace '+Math.round(s/86400)+' días';};
  const enlaceLibro=u=>/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+/.test(String(u||''))?`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">Abrir en Drive</a>`:'';
  function driveHtml(m){
    if(m.error)return '';
    const D=S.drive,fila=D.filas.find(x=>x.linea===S.linea&&x.mes===S.mes);
    let estado;
    if(D.disponible===false)estado='<span class="ii-mut">La copia a Drive no está activada en este servidor (falta aplicar glacial_35 y desplegar control-proceso-drive).</span>';
    else if(D.error)estado=`<span class="cp-err">No se pudo leer el estado: ${esc(D.error)}</span>`;
    else if(!D.filas.length&&D.en===0)estado='<span class="ii-mut">Consultando…</span>';
    else if(!fila)estado='<span class="ii-mut">Este mes todavía no se copió a Drive. Cuando Drive esté configurado se copia solo cada 5 minutos.</span>';
    else if(fila.ok)estado=`<span class="cp-ok">✓ Copiado a Drive ${esc(hace(fila.sincronizado_en))}</span> · ${esc(fila.filas==null?'':fila.filas+' filas')} ${enlaceLibro(fila.libro_url)}`;
    else estado=`<span class="cp-err">La última copia a Drive falló: ${esc(fila.error||'error desconocido')}</span> <span class="ii-mut">(reintentos: ${esc(fila.intentos)}; se vuelve a intentar sola)</span> ${enlaceLibro(fila.libro_url)}`;
    const boton=D.disponible===false||!puedeSincronizar()?'':`<button type="button" class="ii-btn ii-btn-o" onclick="cpSincronizar()" ${D.sincronizando||!m.total?'disabled':''}>${D.sincronizando?'Sincronizando…':'Sincronizar ahora con Drive'}</button>`;
    return `<div class="cp-drive"><b>Drive:</b> ${estado} ${boton}</div>`;
  }
  function html(){
    if(Date.now()-S.drive.en>60000&&!S.drive.enCurso)setTimeout(cargarDrive,0);
    const m=modeloActual();
    const msg=S.msg?`<div class="ii-msg ii-msg-${S.msg.tipo}" role="${S.msg.tipo==='error'?'alert':'status'}">${esc(S.msg.texto)}</div>`:'';
    const puede=!m.error&&m.total>0&&!S.ocupado;
    return `<div class="ii-card cp-card"><div class="ii-fila-t"><h3>Control de proceso en el envasado (${esc(P.FORMULARIO.codigo)})</h3></div>
      <p class="ii-mut">Excel del mes con el formato del Drive: una hoja por marca y una fila por cuadro (lote de producción, cantidades, fecha, turno y lotes de insumo). Las columnas MAN, LAV, LLEN, CIERRE, CONF y ROTUL quedan vacías para planta.</p>
      <div class="cp-controles"><label class="ii-campo"><span>Línea</span><select onchange="cpLinea(this.value)">${Object.values(P.LINEAS).map(l=>`<option value="${esc(l.codigo)}" ${l.codigo===S.linea?'selected':''}>${esc(l.codigo)} · ${esc(l.nombre)}</option>`).join('')}</select></label>
        <label class="ii-campo"><span>Mes</span><input type="month" value="${esc(S.mes)}" onchange="cpMes(this.value)"></label>
        <button type="button" class="ii-btn" onclick="cpExportar()" ${puede?'':'disabled'}>${S.ocupado?'Generando…':'Descargar Excel'}</button></div>
      ${msg}${resumenHtml(m)}${driveHtml(m)}</div>`;
  }
  global.cpSincronizar=async()=>{
    const c=cliente(),D=S.drive;
    if(!c||!c.functions||D.sincronizando||!puedeSincronizar())return;
    D.sincronizando=true;S.msg=null;repintar();
    try{
      const r=await c.functions.invoke('control-proceso-drive',{body:{forzar:true,mes:S.mes}});
      const data=r&&r.data,res=data&&Array.isArray(data.resultados)?data.resultados[0]:null;
      if(r&&r.error&&!res)throw new Error(r.error.message||'La función de Drive no respondió.');
      if(res&&res.ok)S.msg={tipo:'ok',texto:res.estado==='sincronizado'?'Copiado a Drive: '+res.filas+' filas en '+res.hojas+' hojas.':res.estado==='sin_datos'?'No hay cuadros para copiar en ese mes.':'Ya estaba al día en Drive.'};
      else S.msg={tipo:'error',texto:'No se pudo copiar a Drive: '+((res&&res.error)||(data&&data.error)||'error desconocido')};
    }catch(e){S.msg={tipo:'error',texto:'No se pudo copiar a Drive: '+((e&&e.message)||e)};}
    finally{D.sincronizando=false;D.en=0;repintar();}
  };
  global.cpLinea=v=>{S.linea=v;S.msg=null;repintar();};
  global.cpMes=v=>{if(/^\d{4}-\d{2}$/.test(v)){S.mes=v;S.msg=null;repintar();}};
  global.cpExportar=async()=>{
    const m=modeloActual();
    if(m.error||!m.total||S.ocupado)return;
    S.ocupado=true;S.msg=null;repintar();
    try{
      const ExcelJS=await cargarScriptExterno('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js','ExcelJS');
      if(!ExcelJS)throw new Error('ExcelJS no está disponible.');
      const wb=construirLibro(ExcelJS,m,{logoBase64:typeof GLACIAL_LOGO_BASE64!=='undefined'?GLACIAL_LOGO_BASE64:'',logoRatio:typeof GLACIAL_LOGO_RATIO!=='undefined'?GLACIAL_LOGO_RATIO:undefined});
      const buf=await wb.xlsx.writeBuffer();
      descargarArchivo(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),m.archivo);
      S.msg={tipo:'ok',texto:'Se descargó '+m.archivo+' ('+m.total+' filas en '+m.hojas.length+' hojas).'};
    }catch(e){S.msg={tipo:'error',texto:'No se pudo generar el Excel: '+((e&&e.message)||e)};}
    finally{S.ocupado=false;repintar();}
  };

  const css=`.cp-drive{margin-top:10px;padding-top:10px;border-top:1px solid var(--ii-linea,#dfe6ee);display:flex;gap:10px;flex-wrap:wrap;align-items:center}.cp-ok{color:#166534;font-weight:600}.cp-err{color:#b42318}.cp-drive a{color:#0b5cc4}.cp-controles{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin:10px 0}.cp-card .ii-resumen{margin-top:8px}@media(max-width:560px){.cp-controles .ii-btn{width:100%}}`;
  global.iiControlProcesoUI={html,css,estado:S,usar:f=>{if(typeof f==='function')repintar=f;},construirLibro,ANCHOS,ENCABEZADOS};
  if(typeof module!=='undefined'&&module.exports)module.exports={construirLibro,ANCHOS,ENCABEZADOS};
})(typeof window!=='undefined'?window:globalThis);
