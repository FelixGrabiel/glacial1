/* =====================================================================================================================
   MANTENIMIENTO · PLAN ANUAL · impreso por máquina y exportación a Excel · docs/mantenimiento/plan-y-registro.md (punto 5.2)
   Mismo formato que cada hoja del Excel PLAN-PROGRAMA MTTO: A4 horizontal ajustado a 1 página de ancho, márgenes 0,7" / 0,92" / 0,75", encabezado de página
   (logo · «PLAN/PROGRAMA MANTENIMIENTO MECÁNICO 2026 · PLANTA DE AGUA_LÍNEA PET · MÁQUINA» · «CONSORCIO FRAP S.A.C · MANTENIMIENTO MECÁNICO · CF-CA-PL-002»),
   dos filas de título repetidas en cada hoja, Calibri Light 8 pt centrado, bordes finos y medianos, «1 - 52» combinado en las semanales.
   Los textos salen TAL CUAL vienen del plan (sin corregir ortografía ni numeración) y no se agrega nada de la pantalla de GLACIAL.
   El salto de hoja cae igual que en el Excel: 21 filas de datos por hoja (SOP: hoja 1 = 18 semanales + 3 mensuales; hoja 2 = 8 semestrales + 8 anuales).
   ===================================================================================================================== */
(function(raiz){
  'use strict';
  const N=raiz.glacialMttoPlan||(typeof require!=='undefined'?require('./71-plan-anual-nucleo.js'):null);
  const FILAS_POR_HOJA=21;
  /* Anchos de columna del Excel (unidades de Excel): A..E y los 12 meses. */
  const ANCHOS=[4,35.29,17.14,8.43,10.29,2.86,2.86,3.43,4.29,6.29,4.71,4.29,4.43,4.43,6.57,4.57,4.29];
  const BLOQUES_CON_SEPARACION=['SEMANAL','MENSUAL','SEMESTRAL','ANUAL'];
  const esc=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ordenar=acts=>(acts||[]).slice().sort((a,b)=>(a.bloque_orden||N.bloqueOrden(a.frecuencia))-(b.bloque_orden||N.bloqueOrden(b.frecuencia))||(a.orden||0)-(b.orden||0));
  /** Reparte las filas en hojas de FILAS_POR_HOJA. */
  const paginar=filas=>{const h=[];for(let i=0;i<filas.length;i+=FILAS_POR_HOJA)h.push(filas.slice(i,i+FILAS_POR_HOJA));return h.length?h:[[]];};
  /** ¿Lleva borde mediano debajo? Último ítem de un bloque SEMANAL, MENSUAL, SEMESTRAL o ANUAL (el último ANUAL cierra la tabla). */
  const separaDespues=(filas,i)=>{const f=filas[i],sig=filas[i+1];return BLOQUES_CON_SEPARACION.includes(f.frecuencia)&&(!sig||sig.frecuencia!==f.frecuencia);};
  const titulo=anio=>'PLAN/PROGRAMA MANTENIMIENTO MECÁNICO '+anio;

  function htmlHoja(maquina,anio,hoja,filasTodas,urlLogo,esUltima){
    const total=ANCHOS.reduce((s,x)=>s+x,0);
    const col=ANCHOS.map(a=>'<col style="width:'+(a/total*100).toFixed(3)+'%">').join('');
    const cab='<tr class="r1"><th rowspan="2" class="izq">ITEM</th><th rowspan="2">ACTIVIDAD</th><th rowspan="2">INSUMOS</th><th rowspan="2">NÚMERO TÉCNICOS</th><th rowspan="2">FRECUENCIA</th><th colspan="12" class="der">MES/SEMANA</th></tr>'+
      '<tr class="r2">'+N.MESES.map((m,i)=>'<th'+(i===11?' class="der"':'')+'>'+m+'</th>').join('')+'</tr>';
    const cuerpo=hoja.map(f=>{
      const i=filasTodas.indexOf(f),sep=separaDespues(filasTodas,i);
      const celdas=f.es_todo_el_anio?'<td colspan="12" class="der">'+esc((f.semanas_por_mes||[])[0]||'1 - 52')+'</td>'
        :N.MESES.map((_,k)=>'<td'+(k===11?' class="der"':'')+'>'+esc((f.semanas_por_mes||[])[k]||'')+'</td>').join('');
      return '<tr'+(sep?' class="sep"':'')+'><td class="izq">'+esc(f.item)+'</td><td>'+esc(f.actividad)+'</td><td>'+esc(f.insumos)+'</td><td>'+esc(f.n_tecnicos)+'</td><td>'+esc(f.frecuencia)+'</td>'+celdas+'</tr>';
    }).join('');
    return '<section class="hoja'+(esUltima?' ultima':'')+'"><div class="ph"><div class="ph-i">'+(urlLogo?'<img src="'+esc(urlLogo)+'" alt="">':'')+'</div>'+
      '<div class="ph-c"><b>'+esc(titulo(anio))+'</b><b>PLANTA DE AGUA_LÍNEA '+esc(maquina.linea_impresion||'PET')+'</b><i>'+esc(maquina.nombre)+'</i></div>'+
      '<div class="ph-d">CONSORCIO FRAP S.A.C<br>MANTENIMIENTO MECÁNICO<br>CF-CA-PL-002</div></div>'+
      '<table><colgroup>'+col+'</colgroup><thead>'+cab+'</thead><tbody>'+cuerpo+'</tbody></table></section>';
  }
  const CSS='@page{size:A4 landscape;margin:.3in .7in .75in .7in}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000}'+
    'body{zoom:.93;font-family:"Calibri Light",Calibri,Carlito,Arial,sans-serif;font-size:8pt}'+
    '.hoja{page-break-after:always;break-after:page;padding-top:0}.hoja.ultima{page-break-after:auto;break-after:auto}'+
    '.ph{display:grid;grid-template-columns:30% 1fr 30%;align-items:center;height:.62in;margin-bottom:0}.ph-i img{width:141.75pt;height:44.25pt;object-fit:contain;display:block}'+
    '.ph-c{text-align:center;display:flex;flex-direction:column;font-size:10pt;line-height:1.25}.ph-c b{font-weight:700}.ph-c i{font-style:italic}.ph-d{text-align:right;font-size:9pt;line-height:1.25}'+
    'table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:.5pt solid #000;text-align:center;vertical-align:middle;padding:0 1pt;overflow-wrap:anywhere;word-break:break-word;background:none}'+
    'thead th{font-weight:700;height:16.5pt}tbody td{height:22.5pt}.izq{border-left:1.5pt solid #000}.der{border-right:1.5pt solid #000}'+
    '.r1 th{border-top:1.5pt solid #000}.r2 th{border-bottom:1.5pt solid #000}tr.sep td{border-bottom:1.5pt solid #000}';
  /** Documento HTML completo del impreso de UNA máquina. acts: sus actividades del año. urlLogo: ruta absoluta del logo. */
  function htmlImpresion(maquina,acts,anio,urlLogo){
    const filas=ordenar(acts),hojas=paginar(filas);
    return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>'+esc(titulo(anio)+' · '+maquina.nombre)+'</title><style>'+CSS+'</style></head><body>'+
      hojas.map((h,k)=>htmlHoja(maquina,anio,h,filas,urlLogo,k===hojas.length-1)).join('')+'</body></html>';
  }

  /* ---------- Excel (ExcelJS): una hoja por máquina, misma estructura y configuración de impresión ---------- */
  const FINO={style:'thin',color:{argb:'FF000000'}},MED={style:'medium',color:{argb:'FF000000'}};
  const valorCelda=t=>{const s=String(t==null?'':t).trim();return /^\d+$/.test(s)?Number(s):s;};
  function hojaExcel(wb,maquina,acts,anio){
    const nombre=String(maquina.codigo_hoja||maquina.nombre).replace(/[\\/?*[\]:]/g,'-').slice(0,31);
    const ws=wb.addWorksheet(nombre,{pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,
      margins:{left:.7,right:.7,top:.9239,bottom:.75,header:.3,footer:.3},printTitlesRow:'1:2',horizontalCentered:false}});
    ws.columns=ANCHOS.map(w=>({width:w}));
    const filas=ordenar(acts);
    const base={font:{name:'Calibri Light',size:8},alignment:{horizontal:'center',vertical:'middle',wrapText:true}};
    const r1=['ITEM','ACTIVIDAD','INSUMOS','NÚMERO TÉCNICOS','FRECUENCIA','MES/SEMANA'];
    ws.getRow(1).values=r1;ws.getRow(2).values=['','','','','',...N.MESES];
    ['A','B','C','D','E'].forEach(c=>ws.mergeCells(c+'1:'+c+'2'));ws.mergeCells('F1:Q1');
    ws.getRow(1).height=16.5;ws.getRow(2).height=16.5;
    filas.forEach((f,i)=>{
      const r=ws.getRow(3+i);r.height=22.5;
      const v=[valorCelda(f.item),f.actividad,f.insumos,Number(f.n_tecnicos)||0,f.frecuencia];
      if(f.es_todo_el_anio)v.push('1 - 52');else N.MESES.forEach((_,k)=>v.push(valorCelda((f.semanas_por_mes||[])[k])));
      r.values=v;
      if(f.es_todo_el_anio)ws.mergeCells('F'+(3+i)+':Q'+(3+i));
      if(i>0&&i%FILAS_POR_HOJA===0)ws.getRow(2+i).addPageBreak();                    // salto de hoja como en el Excel (21 filas de datos por hoja)
    });
    const ultima=2+filas.length;
    for(let r=1;r<=ultima;r++)for(let c=1;c<=17;c++){
      const celda=ws.getCell(r,c);Object.assign(celda,{font:base.font,alignment:base.alignment});
      if(r<=2)celda.font=Object.assign({},base.font,{bold:true});
      const f=r>2?filas[r-3]:null;
      const b={top:FINO,left:FINO,bottom:FINO,right:FINO};
      if(c===1)b.left=MED;if(c===17)b.right=MED;if(r===1)b.top=MED;if(r===2)b.bottom=MED;
      if(f&&separaDespues(filas,r-3))b.bottom=MED;
      celda.border=b;
    }
    /* ExcelJS usa el estilo de la celda principal para toda la combinada: se le ponen los bordes del contorno de la zona combinada. */
    for(let c=1;c<=5;c++)ws.getCell(1,c).border={top:MED,bottom:MED,left:c===1?MED:FINO,right:FINO};
    ws.getCell('F1').border={top:MED,bottom:FINO,left:FINO,right:MED};
    filas.forEach((f,i)=>{if(f.es_todo_el_anio)ws.getCell(3+i,6).border={top:FINO,left:FINO,right:MED,bottom:separaDespues(filas,i)?MED:FINO};});
    ws.headerFooter.oddHeader='&L&C&"Calibri Light,Regular"&10'+titulo(anio)+'\nPLANTA DE AGUA_LÍNEA '+(maquina.linea_impresion||'PET')+'\n&I'+maquina.nombre+'&I&R&9CONSORCIO FRAP S.A.C\nMANTENIMIENTO MECÁNICO\nCF-CA-PL-002';
    return ws;
  }
  /** Libro con una hoja por máquina, en el orden del Excel original. maquinas: [{maquina, acts}]. */
  function libroExcel(ExcelJS,items,anio){
    const wb=new ExcelJS.Workbook();wb.creator='GLACIAL';wb.created=new Date();
    items.forEach(it=>hojaExcel(wb,it.maquina,it.acts,anio));
    return wb;
  }

  const API={FILAS_POR_HOJA,ANCHOS,paginar,separaDespues,ordenar,htmlImpresion,hojaExcel,libroExcel,titulo};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  raiz.glacialMttoPlanImpresion=API;
})(typeof window!=='undefined'?window:globalThis);
