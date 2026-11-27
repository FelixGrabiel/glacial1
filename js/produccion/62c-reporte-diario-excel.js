/* =============================================================
   GLACIAL · REPORTE DIARIO DE PRODUCCIÓN EN EXCEL (23/11/2026)
   -------------------------------------------------------------
   El mismo modelo del Reporte diario (62b-reporte-diario.js › modelo) armado como libro de Excel:
     1. «Reporte diario»: encabezado, 6 cifras, datos del turno, PRODUCCIÓN con una columna por formato y FÓRMULAS vivas
        (horas de producción, horas efectivas, ratio real, ratio sin paradas, diferencia, no cumplida, totales), indicadores
        con semáforo y barras, tiempos, mermas, insumos, paradas, personal, tablas de la semana con % del requerido,
        observaciones y firmas. Listo para imprimir en A4 (una página de ancho).
     2. «Gráficos»: la imagen del Reporte diario (la misma que se envía por WhatsApp).
     3. «Datos»: una fila por formato con todos los campos, en tabla con filtros (para tablas dinámicas).
   construir(ExcelJS, m, {imagenPng}) → workbook; blob(m) (navegador) → Blob .xlsx.
   No calcula nada nuevo: los valores son los del modelo; las fórmulas repiten las mismas reglas para que el Excel se pueda corregir.
   ============================================================= */
(function instalarReporteDiarioExcel(raiz){
  'use strict';
  const C={navy:'0B2E4A',azul:'0877A6',celeste:'E6F2FA',celeste2:'D6ECFA',borde:'CFDDE7',texto:'1D2B36',gris:'5E6D78',blanco:'FFFFFF',
    verde:'2E8B57',verdeClaro:'E2F3DF',ambar:'D08A12',ambarClaro:'FFF4D6',rojo:'C0392B',rojoClaro:'FDECEA',rosa:'EAC3EC',lima:'C9F2A6',turquesa:'9FF0F2',fila:'F7FAFC'};
  const NIVEL={verde:[C.verdeClaro,C.verde,'✔ En meta'],ambar:[C.ambarClaro,C.ambar,'● Cerca'],rojo:[C.rojoClaro,C.rojo,'✖ Bajo meta'],gris:['EEF2F5',C.gris,'— Sin dato']};
  const COLS=['B','C','D','E','F','G','H','I','J','K','L','M'];
  const fill=c=>({type:'pattern',pattern:'solid',fgColor:{argb:'FF'+c}});
  const borde={top:{style:'thin',color:{argb:'FF'+C.borde}},left:{style:'thin',color:{argb:'FF'+C.borde}},bottom:{style:'thin',color:{argb:'FF'+C.borde}},right:{style:'thin',color:{argb:'FF'+C.borde}}};
  const aTiempo=h=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(h||''));return m?(Number(m[1])*60+Number(m[2]))/1440:null;};
  const isoAFecha=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s||''));return m?new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]))):null;};

  function construir(ExcelJS,m,opc){
    opc=opc||{};
    const wb=new ExcelJS.Workbook();
    wb.creator='GLACIAL · Control de Producción';wb.created=new Date();
    const U=m.unidad,UR=m.unidadRatio,t=m.total;
    const ws=wb.addWorksheet('Reporte diario',{properties:{tabColor:{argb:'FF'+C.azul},defaultRowHeight:18},
      views:[{showGridLines:false,state:'frozen',ySplit:4}],
      pageSetup:{paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:0.3,right:0.3,top:0.4,bottom:0.4,header:0.2,footer:0.2}}});
    ws.headerFooter.oddFooter='&L&8GLACIAL · Reporte diario '+m.nombre+' · '+m.fechaTexto+' · turno '+m.bloque+'&R&8Página &P de &N';
    ws.getColumn('A').width=2;COLS.forEach(c=>{ws.getColumn(c).width=11.5;});ws.getColumn('N').width=2;
    let r=1;
    const celda=(ref,v,o)=>{const x=ws.getCell(ref);if(v!==undefined)x.value=v;o=o||{};
      x.font={name:'Arial',size:o.tam||10,bold:!!o.neg,italic:!!o.it,color:{argb:'FF'+(o.color||C.texto)}};
      x.alignment={vertical:'middle',horizontal:o.al||'left',wrapText:!!o.wrap,indent:o.indent||0};
      if(o.fondo)x.fill=fill(o.fondo);if(o.borde!==false&&o.bordeado)x.border=borde;if(o.fmt)x.numFmt=o.fmt;return x;};
    const unir=(a,b,v,o)=>{ws.mergeCells(a+':'+b);const x=celda(a,v,o);if(o&&o.bordeado){/* borde a todo el rango */const [c1,r1]=[a.replace(/\d+/,''),Number(a.replace(/\D+/,''))],[c2,r2]=[b.replace(/\d+/,''),Number(b.replace(/\D+/,''))];
      for(let rr=r1;rr<=r2;rr++)for(let ci=COLS.indexOf(c1);ci<=COLS.indexOf(c2);ci++)ws.getCell(COLS[ci]+rr).border=borde;}return x;};
    const seccion=(texto,color)=>{r++;unir('B'+r,'M'+r,texto,{neg:true,tam:11,color:color?C.navy:C.blanco,fondo:color||C.azul,indent:1});ws.getRow(r).height=22;r++;};

    /* 1) encabezado */
    ws.getRow(1).height=6;r=2;
    unir('B2','E3','GLACIAL',{neg:true,tam:22,color:C.blanco,fondo:C.navy,indent:1});
    unir('F2','J2','REPORTE DIARIO DE PRODUCCIÓN',{neg:true,tam:14,color:C.blanco,fondo:C.navy});
    unir('F3','J3',m.nombre,{neg:true,tam:20,color:C.blanco,fondo:C.navy});
    unir('K2','M2',m.fechaTexto+' · '+m.diaSemana,{neg:true,tam:11,color:C.blanco,fondo:C.navy,al:'right'});
    unir('K3','M3','TURNO '+m.bloque+' · '+m.estado,{neg:true,tam:11,color:'BFE3F5',fondo:C.navy,al:'right'});
    ws.getRow(2).height=26;ws.getRow(3).height=32;
    unir('B4','M4',`Semana ${m.numeroSemana||'—'} · Juliano ${m.juliano||'—'} · Registrado por ${m.turno.registradoPor} · Generado ${new Date().toLocaleString('es-PE')}`,{it:true,tam:9,color:C.gris,fondo:C.celeste,indent:1});
    r=5;

    /* 2) cifras (6 tarjetas de 2 columnas) */
    r++;
    const cifras=[['PRODUCCIÓN EFECTIVA',t.efectiva,U,C.rojo],['PRODUCCIÓN SEMANA',m.semana.totalSemana,U,C.navy],['RATIO REAL (CON PARADAS)',t.ratioReal,UR,C.navy],
      ['RATIO SIN PARADAS',t.ratioSin,UR,C.navy],['DIFERENCIA POR PARADAS',t.diferencia,UR,C.rojo],['CUMPLIMIENTO',t.programada>0?t.efectiva/t.programada:null,'del programado',C.verde]];
    cifras.forEach(([et,v,u,col],i)=>{const a=COLS[i*2],b=COLS[i*2+1];
      unir(a+r,b+r,et,{neg:true,tam:8,color:C.gris,fondo:C.blanco,al:'center',bordeado:true});
      unir(a+(r+1),b+(r+1),v===null||v===undefined?'—':v,{neg:true,tam:16,color:col,fondo:C.blanco,al:'center',fmt:i===5?'0.0%':'#,##0',bordeado:true});
      unir(a+(r+2),b+(r+2),u,{tam:8,color:C.gris,fondo:C.blanco,al:'center',bordeado:true});});
    ws.getRow(r+1).height=28;r+=3;

    /* 3) datos del turno */
    seccion('DATOS DEL TURNO');
    const tl={neg:true,fondo:C.celeste,bordeado:true,tam:9},tv={al:'center',bordeado:true,fondo:C.blanco};
    [[['Fecha',isoAFecha(m.fecha),'dd/mm/yyyy'],['Ingreso del personal',aTiempo(m.turno.ingreso),'hh:mm'],['Salida del personal',aTiempo(m.turno.salida),'hh:mm']],
     [['Turno',m.bloque],['Número de personas',m.turno.personas===null?'—':m.turno.personas],['Horas de producción',m.turno.horasProduccion,'0.00']],
     [['Semana / juliano',(m.numeroSemana||'—')+' / '+(m.juliano||'—')],['Paradas prog. / no prog. (h)',m.turno.pProg.toFixed(2)+' / '+m.turno.pNoProg.toFixed(2)],['Horas efectivas',m.turno.horasEfectivas,'0.00']]]
    .forEach(fila=>{fila.forEach(([et,v,f],k)=>{const c0=COLS[k*4];unir(c0+r,COLS[k*4+1]+r,et,tl);unir(COLS[k*4+2]+r,COLS[k*4+3]+r,v,Object.assign({fmt:f},tv,k===2&&et==='Horas efectivas'?{neg:true,color:C.rojo}:{}));});r++;});

    /* 4) producción: una columna (2 celdas) por formato, con fórmulas */
    seccion('PRODUCCIÓN POR FORMATO (las celdas grises se calculan con fórmula)');
    const cols=m.columnas.length?m.columnas.slice(0,4):[{}];
    const anchoF=Math.floor(8/cols.length)||2;
    const rango=i=>[COLS[4+i*anchoF],COLS[4+i*anchoF+anchoF-1]];
    const filaRef={};
    const filaProd=(clave,et,fn,o)=>{o=o||{};filaRef[clave]=r;
      unir('B'+r,'E'+r,et,{neg:true,tam:9,fondo:o.fondoEt||C.celeste,bordeado:true});
      cols.forEach((c,i)=>{const [a,b]=rango(i);const v=c&&Object.keys(c).length?fn(c,i):'—';
        unir(a+r,b+r,v,{al:'center',bordeado:true,neg:!!o.neg,color:o.color||C.texto,fondo:o.formula?'F1F4F7':(o.fondo||C.blanco),fmt:o.fmt});});
      r++;};
    const ref=(clave,i)=>rango(i)[0]+filaRef[clave];
    filaProd('marca','Marca',c=>c.marca,{neg:true,fondo:C.celeste2});
    filaProd('pres','Presentación',c=>c.presentacion);
    filaProd('nominal',`Ratio nominal (${UR})`,c=>c.ratioNominal,{fmt:'#,##0',color:C.verde,neg:true});
    filaProd('lote','Lote',c=>c.lote);
    filaProd('venc','Fecha de vencimiento',c=>c.vencimiento);
    filaProd('ini','Hora de inicio',c=>aTiempo(c.inicio),{fmt:'hh:mm'});
    filaProd('fin','Hora de fin',c=>aTiempo(c.fin),{fmt:'hh:mm'});
    filaProd('horas','Horas de producción',(c,i)=>({formula:`IF(OR(${ref('ini',i)}="",${ref('fin',i)}=""),0,MOD(${ref('fin',i)}-${ref('ini',i)},1)*24)`,result:c.horas}),{fmt:'0.00',formula:true});
    filaProd('pprog','Paradas programadas (h)',c=>c.pProg,{fmt:'0.00',color:C.ambar});
    filaProd('pnp','Paradas no programadas (h)',c=>c.pNoProg,{fmt:'0.00',color:C.rojo});
    filaProd('hef','Horas efectivas',(c,i)=>({formula:`${ref('horas',i)}-${ref('pprog',i)}-${ref('pnp',i)}`,result:c.horas-c.pProg-c.pNoProg}),{fmt:'0.00;[Red]-0.00',formula:true,neg:true});
    filaProd('prog',`Producción programada (${U})`,c=>c.programada,{fmt:'#,##0'});
    filaProd('ef',`Producción efectiva (${U})`,c=>c.efectiva,{fmt:'#,##0',neg:true,fondo:C.verdeClaro});
    if(m.secundaria)filaProd('sec',m.secundaria,c=>c.secundaria,{fmt:'#,##0'});
    filaProd('cal',m.calidadTitulo,c=>c.calidad,{fmt:'#,##0'});
    filaProd('rreal',`Ratio real — con paradas (${UR})`,(c,i)=>({formula:`IFERROR(${ref('ef',i)}/${ref('horas',i)},0)`,result:c.ratioReal||0}),{fmt:'#,##0',formula:true,neg:true});
    filaProd('rsin',`Ratio sin paradas (${UR})`,(c,i)=>({formula:`IFERROR(${ref('ef',i)}/${ref('hef',i)},0)`,result:c.ratioSin||0}),{fmt:'#,##0',formula:true,neg:true});
    filaProd('dif','Diferencia por paradas',(c,i)=>({formula:`MAX(0,${ref('rsin',i)}-${ref('rreal',i)})`,result:c.diferencia||0}),{fmt:'#,##0',formula:true,color:C.rojo,neg:true});
    filaProd('nc',`Producción no cumplida (${U})`,(c,i)=>({formula:`MAX(0,${ref('prog',i)}-${ref('ef',i)})`,result:c.noCumplida}),{fmt:'#,##0',formula:true,color:C.gris});
    filaProd('pal','N° de paletas',c=>c.paletas,{fmt:'#,##0.##'});
    // horas efectivas negativas en rojo
    ws.addConditionalFormatting({ref:`F${filaRef.hef}:M${filaRef.hef}`,rules:[{type:'cellIs',operator:'lessThan',formulae:[0],style:{fill:fill(C.rojoClaro),font:{color:{argb:'FF'+C.rojo},bold:true}}}]});
    // total del turno
    const sumaF=clave=>cols.map((_,i)=>ref(clave,i)).join(',');
    unir('B'+r,'E'+r,'TOTAL DEL TURNO',{neg:true,color:C.blanco,fondo:C.navy,bordeado:true});
    [['Programada',`SUM(${sumaF('prog')})`,t.programada,'#,##0'],['Efectiva',`SUM(${sumaF('ef')})`,t.efectiva,'#,##0'],['Ratio real',`IFERROR(SUM(${sumaF('ef')})/SUM(${sumaF('horas')}),0)`,t.ratioReal||0,'#,##0'],['Sin paradas',`IFERROR(SUM(${sumaF('ef')})/SUM(${sumaF('hef')}),0)`,t.ratioSin||0,'#,##0']]
      .forEach(([et,f,v,fm],k)=>{const a=COLS[4+k*2],b=COLS[5+k*2];celda(a+r,et,{neg:true,tam:8,color:'BFE3F5',fondo:C.navy,al:'right'});celda(b+r,{formula:f,result:v},{neg:true,color:C.blanco,fondo:C.navy,al:'center',fmt:fm});});
    ws.getRow(r).height=22;r++;

    /* 5) indicadores (izquierda) y tiempos (derecha) */
    seccion('INDICADORES Y TIEMPOS');
    const r0=r;
    unir('B'+r,'C'+r,'Indicador',{neg:true,fondo:C.celeste,bordeado:true,tam:9});celda('D'+r,'Valor',{neg:true,fondo:C.celeste,bordeado:true,al:'center',tam:9});celda('E'+r,'Meta',{neg:true,fondo:C.celeste,bordeado:true,al:'center',tam:9});unir('F'+r,'G'+r,'Estado',{neg:true,fondo:C.celeste,bordeado:true,al:'center',tam:9});r++;
    const nombresInd={disponibilidad:'Disponibilidad',rendimiento:'Rendimiento',calidad:'Calidad',oee:'OEE',cumplimiento:'Cumplimiento',eficiencia:'Eficiencia'};
    m.indicadores.forEach(k=>{const n=NIVEL[k.nivel]||NIVEL.gris;
      unir('B'+r,'C'+r,nombresInd[k.clave]||k.etiqueta,{bordeado:true,fondo:C.blanco});
      celda('D'+r,k.valor===null?'—':k.valor/100,{neg:true,al:'center',fmt:'0.0%',bordeado:true,color:n[1],fondo:C.blanco});
      celda('E'+r,k.meta?k.meta/100:'—',{al:'center',fmt:'0%',bordeado:true,color:C.gris,fondo:C.blanco});
      unir('F'+r,'G'+r,n[2],{neg:true,al:'center',color:n[1],fondo:n[0],bordeado:true});r++;});
    ws.addConditionalFormatting({ref:`D${r0+1}:D${r-1}`,rules:[{type:'dataBar',cfvo:[{type:'num',value:0},{type:'num',value:1.2}],color:{argb:'FF7FB8D8'},gradient:false}]});
    let rr=r0;
    unir('I'+rr,'K'+rr,'Tiempo',{neg:true,fondo:C.celeste,bordeado:true,tam:9});unir('L'+rr,'M'+rr,'Horas',{neg:true,fondo:C.celeste,bordeado:true,al:'center',tam:9});rr++;
    [['Horas de producción',m.turno.horasProduccion,C.texto],['Paradas programadas',m.turno.pProg,C.ambar],['Paradas no programadas',m.turno.pNoProg,C.rojo],['Horas efectivas',m.turno.horasEfectivas,C.verde],['% del tiempo productivo',m.turno.horasProduccion>0?m.turno.horasEfectivas/m.turno.horasProduccion:null,C.navy]]
      .forEach(([et,v,col],k)=>{unir('I'+rr,'K'+rr,et,{bordeado:true,fondo:C.blanco});unir('L'+rr,'M'+rr,v===null?'—':v,{neg:true,al:'center',color:col,bordeado:true,fondo:C.blanco,fmt:k===4?'0.0%':'0.00'});rr++;});
    r=Math.max(r,rr);

    /* 6) mermas (izquierda) e insumos (derecha) */
    seccion('MERMAS E INSUMOS');
    const r1=r;
    [['B','C','Componente'],['D','D','kg'],['E','E','Unidades'],['F','G','% de la efectiva']].forEach(([a,b,et])=>a===b?celda(a+r,et,{neg:true,fondo:C.celeste,bordeado:true,al:'center',tam:9}):unir(a+r,b+r,et,{neg:true,fondo:C.celeste,bordeado:true,al:a==='B'?'left':'center',tam:9}));r++;
    const mm=m.mermasDetalle||m.mermas.map(k=>({item:k.item,peso:null,unidades:null,pct:k.pct}));
    const rm0=r;
    mm.forEach(k=>{unir('B'+r,'C'+r,k.item,{bordeado:true,fondo:C.blanco});celda('D'+r,k.peso===null?'—':k.peso,{al:'center',fmt:'0.00',bordeado:true,fondo:C.blanco});celda('E'+r,k.unidades===null?'—':k.unidades,{al:'center',fmt:'#,##0',bordeado:true,fondo:C.blanco});
      unir('F'+r,'G'+r,k.pct/100,{al:'center',fmt:'0.00%',bordeado:true,fondo:C.blanco,neg:true});r++;});
    if(mm.length)ws.addConditionalFormatting({ref:`F${rm0}:F${r-1}`,rules:[{type:'dataBar',cfvo:[{type:'num',value:0},{type:'max'}],color:{argb:'FF2BA8D8'},gradient:false}]});
    rr=r1;
    unir('I'+rr,'K'+rr,'Insumo',{neg:true,fondo:C.celeste,bordeado:true,tam:9});unir('L'+rr,'M'+rr,'Consumo',{neg:true,fondo:C.celeste,bordeado:true,al:'center',tam:9});rr++;
    m.insumos.forEach(([et,v])=>{unir('I'+rr,'K'+rr,et,{bordeado:true,fondo:C.blanco});unir('L'+rr,'M'+rr,v,{neg:true,al:'center',fmt:'#,##0.00',bordeado:true,fondo:C.blanco});rr++;});
    r=Math.max(r,rr);

    /* 7) paradas */
    seccion('PARADAS DEL TURNO');
    [['B','C','Marca'],['D','E','Tipo'],['F','J','Descripción'],['K','K','Causa'],['L','L','Min'],['M','M','Horas']].forEach(([a,b,et])=>a===b?celda(a+r,et,{neg:true,fondo:C.celeste,bordeado:true,al:'center',tam:9}):unir(a+r,b+r,et,{neg:true,fondo:C.celeste,bordeado:true,tam:9}));r++;
    const rp0=r;
    (m.paradasDetalle||[]).forEach(p=>{unir('B'+r,'C'+r,p.marca,{bordeado:true,fondo:C.blanco,tam:9});unir('D'+r,'E'+r,p.tipo,{bordeado:true,neg:true,tam:9,color:p.tipo==='PROGRAMADA'?C.ambar:C.rojo,fondo:C.blanco});
      unir('F'+r,'J'+r,p.descripcion,{bordeado:true,fondo:C.blanco,tam:9});celda('K'+r,p.causa||'—',{bordeado:true,fondo:C.blanco,tam:9});
      celda('L'+r,p.minutos,{al:'center',bordeado:true,fondo:C.blanco,fmt:'#,##0'});celda('M'+r,{formula:`L${r}/60`,result:p.minutos/60},{al:'center',bordeado:true,fondo:'F1F4F7',fmt:'0.00'});r++;});
    if(!(m.paradasDetalle||[]).length){unir('B'+r,'M'+r,'Sin paradas registradas',{it:true,color:C.gris,bordeado:true,fondo:C.blanco});r++;}
    unir('B'+r,'K'+r,'TOTAL',{neg:true,color:C.blanco,fondo:C.navy,al:'right'});
    celda('L'+r,{formula:`SUM(L${rp0}:L${Math.max(rp0,r-1)})`,result:(m.paradasDetalle||[]).reduce((a,p)=>a+p.minutos,0)},{neg:true,color:C.blanco,fondo:C.navy,al:'center',fmt:'#,##0'});
    celda('M'+r,{formula:`L${r}/60`,result:(m.paradasDetalle||[]).reduce((a,p)=>a+p.minutos,0)/60},{neg:true,color:C.blanco,fondo:C.navy,al:'center',fmt:'0.00'});r++;

    /* 8) personal */
    seccion(`PERSONAL DEL TURNO (${(m.personalLista||[]).length} personas · requerido ${m.requerido||'—'})`);
    const pl=m.personalLista||[];
    const mitad=Math.ceil(pl.length/2);
    [['B','C','Posición'],['D','F','Nombre'],['G','G','Cargo'],['H','I','Posición'],['J','L','Nombre'],['M','M','Cargo']].forEach(([a,b,et])=>a===b?celda(a+r,et,{neg:true,fondo:C.celeste,bordeado:true,tam:9}):unir(a+r,b+r,et,{neg:true,fondo:C.celeste,bordeado:true,tam:9}));r++;
    for(let k=0;k<Math.max(1,mitad);k++){
      [[pl[k],['B','C'],['D','F'],'G'],[pl[k+mitad],['H','I'],['J','L'],'M']].forEach(([p,a,b,c])=>{unir(a[0]+r,a[1]+r,p?p.posicion:'',{bordeado:true,fondo:C.blanco,tam:9});unir(b[0]+r,b[1]+r,p?p.nombre:(pl.length?'':'Sin personal registrado'),{bordeado:true,fondo:C.blanco,tam:9,neg:!!p});celda(c+r,p?p.cargo:'',{bordeado:true,fondo:C.blanco,tam:8,color:C.gris});});
      r++;}

    /* 9) semana */
    const S=m.semana;
    const tablaSem=(titulo,color,filas,pct)=>{
      seccion(titulo,color);
      celda('B'+r,'Turno',{neg:true,fondo:'F4F7FA',bordeado:true,tam:9});
      S.dias.forEach((d,i)=>celda(COLS[1+i]+r,d[0]+' '+d[1],{neg:true,fondo:'F4F7FA',bordeado:true,al:'center',tam:9}));
      unir('J'+r,'K'+r,pct?'Promedio':'Semana',{neg:true,fondo:'F4F7FA',bordeado:true,al:'center',tam:9});r++;
      const rIni=r;
      filas.forEach(([et,vals,total])=>{const neg=et==='Total diario';celda('B'+r,et,{neg:true,bordeado:true,fondo:neg?'FAFBFC':C.blanco,tam:9});
        vals.forEach((v,i)=>{const ce=COLS[1+i]+r;
          if(total==='suma'&&neg)celda(ce,{formula:`IF(SUM(${COLS[1+i]}${rIni}:${COLS[1+i]}${r-1})=0,"",SUM(${COLS[1+i]}${rIni}:${COLS[1+i]}${r-1}))`,result:v||''},{al:'center',bordeado:true,neg:true,fondo:'FAFBFC',fmt:'#,##0'});
          else celda(ce,v===null||v===undefined?'':v,{al:'center',bordeado:true,fondo:C.blanco,fmt:pct?'0':'#,##0'});});
        unir('J'+r,'K'+r,pct?{formula:`IFERROR(AVERAGE(C${r}:I${r}),"")`,result:''}:{formula:`SUM(C${r}:I${r})`,result:vals.reduce((a,v)=>a+(v||0),0)},{al:'center',bordeado:true,neg:true,fondo:C.celeste,fmt:pct?'0.0':'#,##0'});
        r++;
        if(pct){celda('B'+r,'% requerido',{it:true,bordeado:true,fondo:C.blanco,tam:8,color:C.gris});
          vals.forEach((v,i)=>celda(COLS[1+i]+r,v?{formula:`${COLS[1+i]}${r-1}/$L$${r-1}`,result:v/(m.requerido||1)}:'',{al:'center',bordeado:true,fondo:C.blanco,fmt:'0.0%',tam:9,color:C.gris}));
          unir('J'+r,'K'+r,'',{bordeado:true,fondo:C.blanco});r++;}
      });
      return r;};
    tablaSem(`PRODUCCIÓN ${U.toUpperCase()} — SEMANA ${m.numeroSemana||''}`,C.rosa,[['Día',S.prod['DÍA'],'suma'],['Noche',S.prod.NOCHE,'suma'],['Total diario',S.totDia,'suma']]);
    if(m.secundaria)tablaSem(`${m.secundaria.toUpperCase()} — SEMANA ${m.numeroSemana||''}`,C.lima,[['Día',S.sec['DÍA'],'suma'],['Noche',S.sec.NOCHE,'suma'],['Total diario',S.totSec,'suma']]);
    // personal: el requerido va en L (referencia de los %)
    const rPers=r+2;
    tablaSem(`PERSONAL — SEMANA ${m.numeroSemana||''}`,C.turquesa,[['Día',S.pers['DÍA']],['Noche',S.pers.NOCHE]],true);
    celda('L'+(rPers),'Requerido',{neg:true,fondo:'F4F7FA',bordeado:true,al:'center',tam:9});
    for(let k=rPers+1;k<r;k+=2){celda('L'+k,m.requerido||0,{neg:true,al:'center',bordeado:true,fondo:C.ambarClaro,color:C.ambar});}

    /* 10) observaciones y firmas */
    seccion('OBSERVACIONES',C.celeste);
    (m.observaciones.length?m.observaciones:['','']).forEach(o=>{unir('B'+r,'M'+r,o,{wrap:true,tam:10});ws.getCell('B'+r).border={bottom:{style:'thin',color:{argb:'FF'+C.borde}}};r++;});
    r+=2;
    [[m.firmas.lider,'Líder de línea','B','E'],[m.firmas.supervisor,'Supervisor de producción','J','M']].forEach(([n,c,a,b])=>{
      unir(a+r,b+r,n,{neg:true,al:'center'});ws.getCell(a+r).border={top:{style:'thin',color:{argb:'FF'+C.texto}}};
      unir(a+(r+1),b+(r+1),c,{al:'center',tam:9,color:C.gris});});
    r+=2;
    ws.pageSetup.printArea='A1:N'+r;

    /* Hoja 2: imagen del reporte */
    if(opc.imagenPng){
      const wg=wb.addWorksheet('Gráficos',{properties:{tabColor:{argb:'FF'+C.verde}},views:[{showGridLines:false}],pageSetup:{paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:1}});
      wg.getCell('B1').value='Reporte diario '+m.nombre+' · '+m.fechaTexto+' · turno '+m.bloque+' (la misma imagen que se envía por WhatsApp)';
      wg.getCell('B1').font={name:'Arial',bold:true,size:12,color:{argb:'FF'+C.navy}};
      const id=wb.addImage({base64:opc.imagenPng,extension:'png'});
      const ancho=opc.imagenAncho||1080,alto=opc.imagenAlto||2200,escala=720/ancho;
      wg.addImage(id,{tl:{col:1,row:2},ext:{width:ancho*escala,height:alto*escala}});
    }

    /* Hoja 3: datos en tabla (una fila por formato) */
    const wd=wb.addWorksheet('Datos',{properties:{tabColor:{argb:'FF'+C.gris}},views:[{state:'frozen',ySplit:1}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
    const enc=['Fecha','Turno','Línea','Marca','Presentación','Lote','Vencimiento','Inicio','Fin','Horas producción','Paradas prog. (h)','Paradas no prog. (h)','Horas efectivas',
      'Programada','Efectiva',m.secundaria||'Sopladas','Calidad','Ratio nominal','Ratio real','Ratio sin paradas','Diferencia','No cumplida','Paletas'];
    const filasD=(m.columnas||[]).map(c=>[isoAFecha(m.fecha),m.bloque,m.linea,c.marca,c.presentacion,c.lote,c.vencimiento,c.inicio,c.fin,c.horas,c.pProg,c.pNoProg,c.horasEfectivas,
      c.programada,c.efectiva,c.secundaria===null?'':c.secundaria,c.calidad,c.ratioNominal,c.ratioReal,c.ratioSin,c.diferencia,c.noCumplida,c.paletas]);
    wd.addTable({name:'DatosReporte',ref:'A1',headerRow:true,style:{theme:'TableStyleMedium2',showRowStripes:true},columns:enc.map(n=>({name:n,filterButton:true})),rows:filasD.length?filasD:[enc.map(()=>'')]});
    enc.forEach((n,i)=>{wd.getColumn(i+1).width=Math.max(11,n.length+2);
      const h=wd.getCell(1,i+1);h.font={name:'Arial',bold:true,size:10,color:{argb:'FFFFFFFF'}};h.fill=fill(C.navy);h.alignment={vertical:'middle',horizontal:'center',wrapText:true};h.border=borde;
      for(let k=0;k<filasD.length;k++){const c=wd.getCell(k+2,i+1);c.border=borde;c.font={name:'Arial',size:10};if(k%2)c.fill=fill(C.fila);c.alignment={horizontal:i<9&&i!==0?'left':'center'};}});
    wd.getRow(1).height=32;
    wd.getColumn(1).numFmt='dd/mm/yyyy';[10,11,12,13].forEach(i=>wd.getColumn(i).numFmt='0.00');[14,15,16,19,20,21,22].forEach(i=>wd.getColumn(i).numFmt='#,##0');
    return wb;
  }

  /** Navegador: el libro del modelo (carga ExcelJS si hace falta y pone la imagen del reporte en «Gráficos»). */
  async function libro(m){
    const X=raiz.ExcelJS;
    if(!X&&typeof raiz.cargarScriptExterno==='function')await raiz.cargarScriptExterno('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js','ExcelJS');
    if(!raiz.ExcelJS)throw new Error('No se pudo cargar la librería de Excel.');
    let imagenPng=null,imagenAncho=1080,imagenAlto=2200;
    try{const cv=raiz.glacialReporteDiario.dibujar(m);imagenPng=cv.toDataURL('image/png').split(',')[1];imagenAncho=cv.width/2;imagenAlto=cv.height/2;}catch(_){imagenPng=null;}
    return construir(raiz.ExcelJS,m,{imagenPng,imagenAncho,imagenAlto});
  }
  /** Navegador: Blob del .xlsx del modelo. */
  async function blob(m,nombre){
    const wb=await libro(m);
    // correcciones guardadas de este reporte (glacial_71; nombre = el del archivo)
    if(nombre&&raiz.glacialVistaExcel&&raiz.glacialVistaExcel.conCorrecciones)await raiz.glacialVistaExcel.conCorrecciones(wb,nombre);
    const buf=await wb.xlsx.writeBuffer();
    return new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }

  const API={construir,libro,blob};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  raiz.glacialReporteDiarioExcel=API;
})(typeof window!=='undefined'?window:globalThis);
