/* =============================================================
   GLACIAL · REPORTE GENERAL DE PRODUCCIÓN (Excel consolidado, formato aprobado)
   -------------------------------------------------------------
   Un archivo por fecha operativa: GLACIAL_Reporte_General_AAAA-MM-DD.xlsx con 6 hojas en orden: Resumen general, PET1, PET2, B7L,
   CAJAS 20L y B20L (todas las líneas configuradas aunque no hayan producido: su hoja dice el motivo y «Sin registros»).
   · modelo(fuentes) es PURO: arma los datos desde Programación / Paletas / reporte diario / Tareo / Asistente (mermas, conciliaciones,
     movimientos, factores). No inventa datos: lo que falta queda vacío o «Pendiente de conciliación».
   · escribir(ExcelJS, modelo) arma el libro con ExcelJS: fórmulas VIVAS (SUMIFS, COUNTIFS, INDEX/MATCH; nada posterior a Excel 2010),
     referencias por código de cuadro (nunca por posición fija de otra hoja), formato condicional, enlaces internos, paneles fijos, sin
     cuadrícula, horizontal ajustado al ancho. Los gráficos del Resumen se insertan como imagen (ExcelJS no escribe gráficos nativos).
   · exportar(fecha) (navegador): reúne las fuentes, dibuja los dos gráficos con Chart.js y descarga el archivo.
   ============================================================= */
(function instalarReporteGeneral(global){
  'use strict';
  const N=global.glacialAsistenteNucleo;
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const C={marino:'0B2540',sub:'17406B',subTxt:'CFE3F3',acento:'0E7CC1',alt:'F5F9FC',franja:'DCEAF6',kpi:'EAF4FB',kpiTxt:'5F7387',capt:'1F4FB4',
    porCompletar:'FFF9E0',verde:'DCFCE7',verdeTx:'166534',ambar:'FEF3C7',ambarTx:'92400E',rojo:'FEE2E2',rojoTx:'991B1B',azulClaro:'E0F2FE',azulTx:'075985',blanco:'FFFFFF',gris:'5F7387'};
  const FMT={miles:'#,##0;\\-#,##0;\\–',pct:'0.0%',hora:'hh:mm',dec2:'#,##0.00;\\-#,##0.00;\\–',factor:'0.000000',horas:'0.00;\\-0.00;\\–',kg:'#,##0.00;\\-#,##0.00;\\–'};
  const HOJA={PET1:'PET1',PET2:'PET2',B7L:'B7L',C20L:'CAJAS 20L',B20L:'B20L'};
  const ref=(hoja,celda)=>(/[^A-Za-z0-9_]/.test(hoja)?`'${hoja}'`:hoja)+'!'+celda;
  const fechaTxt=f=>{const m=String(f||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'/'+m[2]+'/'+m[1]:String(f||'');};
  const horaFrac=h=>{const m=String(h||'').match(/^(\d{1,2}):(\d{2})/);return m?(Number(m[1])*60+Number(m[2]))/1440:null;};
  const BLOQUE_TXT={DIA:'Mañana + Intermedio',NOCHE:'Noche'};

  /* ---------- modelo (puro) ---------- */
  /* f: {fecha, simulado, programaciones, records, produccionAlCorte, unidadesPorPaleta, mermas, conciliaciones, movimientos, factores, insumos,
         tareos, paradasAvance(linea,fecha,bloque)→[{tipo,minutos,motivo,equipo}], motivoSinProduccion(linea,fecha)→texto} */
  function modelo(f){
    const lineasCod=N.LINEAS.map(l=>l.codigo);
    const insumoDe=c=>(f.insumos||[]).find(i=>i.codigo===c)||{codigo:c,nombre:c==='PRODUCTO'?'Producto terminado':c,unidad:''};
    const cuadrosDia=[];
    ['DIA','NOCHE'].forEach(b=>N.cuadrosDelBloque({fecha:f.fecha,bloque:b,lineas:lineasCod,programaciones:f.programaciones,records:f.records,
      produccionAlCorte:f.produccionAlCorte,unidadesPorPaleta:f.unidadesPorPaleta}).forEach(c=>cuadrosDia.push(c)));
    const observaciones=[];
    const lineas=N.LINEAS.map(L=>{
      const cs=cuadrosDia.filter(c=>c.linea===L.codigo).sort((a,b)=>(a.bloque===b.bloque?0:a.bloque==='DIA'?-1:1)||String(a.codigo).localeCompare(String(b.codigo)));
      cs.forEach((c,i)=>{c.codigoDia='C'+String(i+1).padStart(2,'0');});      // código único en la hoja (Día y Noche juntos)
      const codigoDe=clave=>{const c=cs.find(x=>x.clave===clave);return c?c.codigoDia:'';};
      const cuadros=cs.map(c=>({codigo:c.codigoDia,clave:c.clave,bloque:c.bloque,marca:c.marca,presentacion:c.presentacion,lote:c.reporte&&c.reporte.lote||'',
        inicio:horaFrac(c.reporte&&c.reporte.horaInicio),fin:horaFrac(c.reporte&&c.reporte.horaFin),programado:num(c.programado),producido:num(c.producido),
        cierre:c.reporte&&c.reporte.finalizado?'Confirmado':(num(c.producido)>0?'Sin cierre':'Sin producción'),supervisor:c.reporte&&c.reporte.supervisor||'',
        unidadesPorPaleta:c.unidadesPorPaleta,fuente:c.fuenteProduccion}));
      // Paradas: las del reporte diario (por cuadro). Si la línea no tiene reporte en un bloque, las de Avance/Cierre: con un solo cuadro se le
      // asignan; con varios quedan «Sin asignar» (se cuentan en el total de la línea, no en un cuadro) y se avisa en Observaciones.
      const paradas=[];
      cs.forEach(c=>{if(!c.reporte)return;
        c.reporte.paradasProgramadas.forEach(p=>paradas.push({cuadro:c.codigoDia,tipo:'Programada',equipo:p.equipo||'Línea',minutos:num(p.minutos),motivo:p.descripcion}));
        c.reporte.paradasNoProgramadas.forEach(p=>paradas.push({cuadro:c.codigoDia,tipo:'No programada',equipo:p.equipo||'—',minutos:num(p.minutos),motivo:p.descripcion||p.causa}));});
      ['DIA','NOCHE'].forEach(b=>{
        const delBloque=cs.filter(c=>c.bloque===b);
        if(delBloque.some(c=>c.reporte)||typeof f.paradasAvance!=='function')return;
        let av=[];try{av=f.paradasAvance(L.codigo,f.fecha,b)||[];}catch(_){av=[];}
        if(!av.length)return;
        const destino=delBloque.length===1?delBloque[0].codigoDia:'Sin asignar';
        if(destino==='Sin asignar')observaciones.push({nivel:'atencion',texto:`${L.nombre}: ${av.length} parada(s) de Avance/Cierre sin asignar a un cuadro (${BLOQUE_TXT[b]}).`});
        av.forEach(p=>paradas.push({cuadro:destino,tipo:p.tipo==='PROGRAMADA'?'Programada':'No programada',equipo:p.equipo||'—',minutos:num(p.minutos),motivo:p.motivo||''}));
      });
      paradas.forEach((p,i)=>{p.evento='P'+String(i+1).padStart(2,'0');});
      const mermas=(f.mermas||[]).filter(m=>m&&m.linea===L.codigo&&m.fecha===f.fecha&&m.estado!=='RECHAZADA').map((m,i)=>({evento:'M'+String(i+1).padStart(2,'0'),
        cuadro:codigoDe(m.cuadro)||'Sin cuadro',material:insumoDe(m.insumo).nombre,unidad:m.unidad,cantidad:num(m.cantidad),validacion:m.estado==='VALIDADA'?'Validada':'Pendiente',causa:m.causa,categoria:m.categoria}));
      mermas.filter(m=>m.cuadro==='Sin cuadro').forEach(m=>observaciones.push({nivel:'atencion',texto:`${L.nombre}: la merma ${m.evento} no corresponde a un cuadro del día.`}));
      // Insumos y consumo: cada cuadro × insumo con factor (≠ 0) o con datos del Asistente.
      const insumos=[];
      cs.forEach(c=>{
        (f.insumos||[]).filter(i=>i.activo!==false).forEach(i=>{
          const fv=N.factorVigente(f.factores,{insumo:i.codigo,linea:c.linea,marca:c.marca,presentacion:c.presentacion,fecha:f.fecha});
          const doc=(f.conciliaciones||[]).find(x=>x.cuadro===c.clave&&x.insumo===i.codigo)||null;
          const mov=N.movimientosCuadro(f.movimientos,c.clave,i.codigo);
          const tieneMov=mov.entregado||mov.devuelto||mov.transfEntrada||mov.transfSalida;
          if(fv.factor&&Number(fv.factor.factor)===0&&!doc&&!tieneMov)return;
          if(fv.error&&!doc&&!tieneMov&&!(f.factores||[]).some(x=>x.insumo===i.codigo&&x.linea===c.linea))return;
          let porUnd=null;
          if(fv.factor){const fa=fv.factor;porUnd=fa.base==='PALETA'?(num(c.unidadesPorPaleta)>0?num(fa.factor)/num(fa.cantidadBase||1)/num(c.unidadesPorPaleta):null):num(fa.factor)/num(fa.cantidadBase||1);}
          insumos.push({cuadro:c.codigoDia,insumo:i.nombre,unidad:i.unidad,factorPorUnd:porUnd===null?null:N.red(porUnd,10),
            saldoInicial:doc&&doc.saldoInicial!==null&&doc.saldoInicial!==undefined?num(doc.saldoInicial):null,
            entregado:N.red(mov.entregado+mov.transfEntrada-mov.transfSalida,4),devuelto:mov.devuelto,
            saldoFinal:doc&&doc.saldoFinal!==null&&doc.saldoFinal!==undefined?num(doc.saldoFinal):null,conTransferencias:!!(mov.transfEntrada||mov.transfSalida)});
        });
      });
      // Personal: Tareo de Producción del día con la línea del trabajador; sin línea → Resumen (apoyo / sin asignar).
      const personal=[];
      (f.tareos||[]).filter(t=>t&&t.fecha===f.fecha&&String(t.area||'Producción')!=='Mantenimiento').forEach(t=>{
        const b=N.bloqueDe(t.turno);
        (t.personal||[]).forEach(p=>{if(N.codigoLinea(p.linea)!==L.codigo)return;personal.push(filaPersonal(p,b));});
      });
      const motivo=cs.some(c=>c.producido>0)?'':(typeof f.motivoSinProduccion==='function'?(f.motivoSinProduccion(L.codigo,f.fecha)||'Sin producción registrada'):'Sin producción registrada');
      if(motivo)observaciones.push({nivel:'critico',texto:`${L.nombre}: ${motivo.charAt(0).toLowerCase()+motivo.slice(1)}.`});
      const bloques=[...new Set(cs.map(c=>c.bloque))];
      // Etiqueta del bloque: la del horario configurado de la línea (p. ej. «Intermedio 14:00–22:00»), o la general del bloque.
      const etq=b=>{let t='';try{t=typeof f.etiquetaBloque==='function'?f.etiquetaBloque(L.codigo,f.fecha,b):'';}catch(_){t='';}return t||BLOQUE_TXT[b];};
      return {...L,hoja:HOJA[L.codigo],cuadros,paradas,mermas,insumos,personal,motivo,bloques:bloques.length?bloques.map(etq).join(' / '):'—',
        supervisor:[...new Set(cuadros.map(c=>c.supervisor).filter(Boolean))].join(', ')};
    });
    const apoyo=[];
    (f.tareos||[]).filter(t=>t&&t.fecha===f.fecha&&String(t.area||'Producción')!=='Mantenimiento').forEach(t=>{
      (t.personal||[]).forEach(p=>{if(!N.codigoLinea(p.linea))apoyo.push({...filaPersonal(p,N.bloqueDe(t.turno)),asignacion:String(p.linea||'').trim()?'Apoyo compartido':'Sin asignar'});});
    });
    // Una persona en varias filas (por ejemplo Día e Intermedio) se lista una vez por línea (no se duplica).
    lineas.forEach(l=>{l.personal=dedup(l.personal);});
    if(f.simulado)observaciones.push({nivel:'info',texto:'Factores, identidades y cantidades de este archivo son simulados.'});
    lineas.forEach(l=>l.insumos.filter(i=>i.conTransferencias).slice(0,1).forEach(()=>observaciones.push({nivel:'info',texto:`${l.nombre}: «Entregado» incluye transferencias netas entre líneas.`})));
    return {fecha:f.fecha,simulado:!!f.simulado,lineas,apoyo:dedup(apoyo),observaciones};
  }
  function filaPersonal(p,bloque){
    return {codigo:String(p.trabajadorId||p.dni||p.codigo||'').trim()||'—',nombre:String(p.nombre||p.trabajador||'').trim(),puesto:String(p.cargo||p.puesto||'').trim(),
      bloque:BLOQUE_TXT[bloque],asistencia:asistenciaTxt(p.asistencia),ingreso:horaFrac(p.horaIngreso),salida:horaFrac(p.horaSalida)};
  }
  const asistenciaTxt=a=>{const s=String(a||'').trim();if(!s)return 'Sin registro';return /^asisti/i.test(s)?'Asistió':s.charAt(0).toUpperCase()+s.slice(1).toLowerCase();};
  function dedup(lista){const v=new Set();return lista.filter(p=>{const k=p.codigo+'|'+p.nombre;if(v.has(k))return false;v.add(k);return true;});}

  /* ---------- escritura con ExcelJS ---------- */
  const fill=c=>({type:'pattern',pattern:'solid',fgColor:{argb:'FF'+c}});
  const font=(o)=>({name:'Arial',size:9,...o,color:o&&o.color?{argb:'FF'+o.color}:undefined});
  const borde=(c,estilo)=>({style:estilo||'thin',color:{argb:'FF'+(c||'D5DEE6')}});
  const col=n=>{let s='';n++;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26);}return s;};   // 0 → A
  function escribir(ExcelJS,m,opc){
    opc=opc||{};
    const wb=new ExcelJS.Workbook();
    wb.creator='GLACIAL';wb.created=new Date();wb.calcProperties={fullCalcOnLoad:true};
    const res=wb.addWorksheet('Resumen general',{properties:{tabColor:{argb:'FF'+C.marino}},views:[{state:'frozen',ySplit:4,showGridLines:false}],
      pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9,margins:{left:0.4,right:0.4,top:0.5,bottom:0.5,header:0.2,footer:0.2}}});
    const hojas={};
    m.lineas.forEach(l=>{hojas[l.codigo]=wb.addWorksheet(l.hoja,{properties:{tabColor:{argb:'FF'+l.color}},views:[{state:'frozen',ySplit:4,showGridLines:false}],
      pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9,margins:{left:0.4,right:0.4,top:0.5,bottom:0.5,header:0.2,footer:0.2}}});});
    const pos={};
    m.lineas.forEach(l=>{pos[l.codigo]=hojaLinea(hojas[l.codigo],l,m);});
    hojaResumen(res,m,pos,opc);
    return wb;
  }

  /* Utilidades de hoja */
  function encabezado(ws,ncols,titulo,sub1,sub2,simulado,enlace){
    const ult=col(ncols-1);
    ws.mergeCells(`A2:${col(ncols-3)}2`);ws.getCell('A2').value=titulo;
    for(let c=0;c<ncols;c++){ws.getCell(2,c+1).fill=fill(C.marino);ws.getCell(3,c+1).fill=fill(C.sub);ws.getCell(4,c+1).fill=fill(C.sub);}
    ws.getCell('A2').font=font({size:17,bold:true,color:C.blanco});ws.getRow(2).height=30;
    ws.mergeCells(`A3:${col(ncols-3)}3`);ws.getCell('A3').value=sub1;ws.getCell('A3').font=font({size:9.5,color:C.subTxt});
    ws.mergeCells(`A4:${col(ncols-3)}4`);ws.getCell('A4').value=sub2;ws.getCell('A4').font=font({size:9.5,color:C.subTxt});
    if(enlace){ws.mergeCells(`${col(ncols-2)}2:${ult}2`);const c=ws.getCell(`${col(ncols-2)}2`);c.value={text:enlace.texto,hyperlink:enlace.destino};c.font=font({size:10,bold:true,color:C.blanco,underline:true});c.alignment={horizontal:'right',vertical:'middle'};}
    if(simulado){ws.mergeCells(`${col(ncols-2)}3:${ult}3`);const c=ws.getCell(`${col(ncols-2)}3`);c.value='DATOS SIMULADOS';c.font=font({size:9,bold:true,color:'7A1F1F'});c.fill=fill('FDE2E2');c.alignment={horizontal:'center'};}
  }
  function seccion(ws,fila,ncols,texto){
    const c=ws.getCell(fila,1);c.value=texto;c.font=font({size:10.5,bold:true,color:C.marino});
    for(let i=1;i<=ncols;i++)ws.getCell(fila,i).border={bottom:borde(C.acento,'medium')};
  }
  function cabeceraTabla(ws,fila,titulos,merges){
    titulos.forEach((t,i)=>{if(t===null)return;const c=ws.getCell(fila,i+1);c.value=t;c.font=font({bold:true,color:C.blanco});c.fill=fill(C.marino);
      c.alignment={horizontal:i>=(titulos.numDesde||99)?'right':'left',vertical:'middle',wrapText:true};c.border={bottom:borde(C.marino)};});
    (merges||[]).forEach(r=>{ws.mergeCells(fila,r[0]+1,fila,r[1]+1);const c=ws.getCell(fila,r[0]+1);c.fill=fill(C.marino);});
    ws.getRow(fila).height=24;
  }
  function celda(ws,fila,c,valor,o){
    const x=ws.getCell(fila,c+1);
    if(valor&&typeof valor==='object'&&valor.f!==undefined)x.value={formula:valor.f};
    else x.value=valor===undefined?null:valor;
    o=o||{};
    x.font=font({color:o.captura?C.capt:(o.color||'1A2B3C'),bold:!!o.bold,size:o.size||9,italic:!!o.italic});
    if(o.fmt)x.numFmt=o.fmt;
    if(o.fill)x.fill=fill(o.fill);
    x.alignment={vertical:'middle',horizontal:o.align||(typeof valor==='number'||(valor&&valor.f&&o.fmt)?'right':'left'),wrapText:!!o.wrap,indent:o.indent||0};
    x.border={bottom:borde('E2EBF2')};
    return x;
  }
  const alterna=(ws,fila,ncols,i)=>{if(i%2===1)for(let c=1;c<=ncols;c++){const x=ws.getCell(fila,c);if(!x.fill||!x.fill.fgColor||x.fill.fgColor.argb==='FF'+C.alt||!x.fill.fgColor.argb)x.fill=fill(C.alt);}};
  function sinRegistros(ws,fila,ncols,texto){
    ws.mergeCells(fila,1,fila,ncols);const c=ws.getCell(fila,1);c.value=texto||'Sin registros';c.font=font({italic:true,color:C.gris});c.alignment={horizontal:'center'};
  }
  function cf(ws,refRango,rules){ws.addConditionalFormatting({ref:refRango,rules});}
  const regla=(formula,bg,tx,prio)=>({type:'expression',formulae:[formula],priority:prio||1,style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:'FF'+bg}},font:{color:{argb:'FF'+tx},bold:true}}});
  /* ancho: columnas por tarjeta (número) o lista de anchos por tarjeta. */
  function kpis(ws,fila,lista,ancho){
    const anchos=lista.map((_,i)=>Array.isArray(ancho)?ancho[i]:ancho);
    lista.forEach((k,i)=>{
      const c0=anchos.slice(0,i).reduce((s,x)=>s+x,0);const c1=c0+anchos[i]-1;
      [fila,fila+1,fila+2].forEach(r=>{ws.mergeCells(r,c0+1,r,c1+1);for(let c=c0;c<=c1;c++){ws.getCell(r,c+1).fill=fill(C.kpi);}});
      for(let c=c0;c<=c1;c++){ws.getCell(fila,c+1).border={top:borde(C.acento,'medium')};}
      const t=ws.getCell(fila,c0+1);t.value=k.titulo;t.font=font({size:8,bold:true,color:C.kpiTxt});t.alignment={horizontal:'left',indent:1};
      const v=ws.getCell(fila+1,c0+1);v.value={formula:k.valor};v.font=font({size:22,bold:true,color:C.marino});v.numFmt=k.fmt||FMT.miles;v.alignment={horizontal:'left',vertical:'middle',indent:1};
      const s=ws.getCell(fila+2,c0+1);s.value=k.sub&&k.sub.f?{formula:k.sub.f}:k.sub;s.font=font({size:8.5,color:C.gris});s.numFmt=k.subFmt||'General';s.alignment={horizontal:'left',indent:1};
    });
    ws.getRow(fila+1).height=33.75;
  }

  /* ---------- hoja de línea (17 columnas A..Q) ---------- */
  function hojaLinea(ws,l,m){
    const NC=17;
    [10,15,13,14,14,13,12,12,11,13,12,12,12,11,11,15,18].forEach((w,i)=>{ws.getColumn(i+1).width=w;});
    const marcas=[...new Set(l.cuadros.map(c=>c.marca+' '+c.presentacion))];
    encabezado(ws,NC,'GLACIAL · Línea '+l.nombre,`Fecha operativa ${fechaTxt(m.fecha)}  ·  Cierre general de Producción`,
      `Unidad: ${l.unidad}   ·   Bloque: ${l.bloques}   ·   ${marcas.length} marca${marcas.length===1?'':'s'}${marcas.length?': '+marcas.join(', '):''}${l.motivo?'   ·   '+l.motivo:''}`,m.simulado,{texto:'← Resumen general',destino:"#'Resumen general'!A1"});
    seccion(ws,6,NC,'RESUMEN DE LA LÍNEA '+l.nombre);
    // Posiciones (se calculan antes para que las tarjetas apunten a los totales).
    let r=12;
    const P={};
    P.prodTit=r;P.prodCab=r+1;P.prodIni=r+2;P.prodFin=P.prodIni+Math.max(l.cuadros.length,1)-1;P.prodTot=P.prodFin+1;
    P.parTit=P.prodTot+3;P.parCab=P.parTit+1;P.parIni=P.parCab+1;P.parFin=P.parIni+Math.max(l.paradas.length,1)-1;P.parTot=P.parFin+1;
    P.merTit=P.parTot+3;P.merCab=P.merTit+1;P.merIni=P.merCab+1;P.merFin=P.merIni+Math.max(l.mermas.length,1)-1;P.merTot=P.merFin+1;
    P.insTit=P.merTot+3;P.insCab=P.insTit+1;P.insIni=P.insCab+1;P.insFin=P.insIni+Math.max(l.insumos.length,1)-1;
    P.perTit=P.insFin+3;P.perCab=P.perTit+1;P.perIni=P.perCab+1;P.perFin=P.perIni+Math.max(l.personal.length,1)-1;P.perTot=P.perFin+1;
    P.notas=P.perTot+2;
    const T=P.prodTot;
    kpis(ws,8,[
      {titulo:'CUMPLIMIENTO',valor:`IF(J${T}="","–",J${T})`,fmt:FMT.pct,sub:{f:`"Producido: "&TEXT(H${T},"#,##0")&" ${l.unidad}"`}},
      {titulo:'SALDO PENDIENTE',valor:`I${T}`,sub:{f:`"Programado: "&TEXT(G${T},"#,##0")`}},
      {titulo:'PARADAS',valor:`M${T}`,sub:{f:`"No programadas: "&L${T}&" min"`}},
      {titulo:'HORAS EFECTIVAS',valor:`N${T}`,fmt:FMT.horas,sub:{f:`IF(O${T}="","Sin producción","Ratio: "&TEXT(O${T},"#,##0")&" ${l.unidad==='cajas'?'C/H':'B/H'}")`}},
      {titulo:'PERSONAL PRESENTE',valor:`COUNTIFS(G${P.perIni}:G${P.perFin},"Asistió")`,sub:{f:`COUNTA(A${P.perIni}:A${P.perFin})-COUNTIFS(A${P.perIni}:A${P.perFin},"Sin registros")&" registrados"`}},
      {titulo:'MERMAS PENDIENTES',valor:`COUNTIFS(H${P.merIni}:H${P.merFin},"Pendiente")`,sub:{f:`(COUNTIFS(P${P.insIni}:P${P.insFin},">0.0001")+COUNTIFS(P${P.insIni}:P${P.insFin},"<-0.0001"))&" ítems por revisar"`}}
    ],[3,3,3,3,3,2]);                        // 17 columnas: A:C, D:F, G:I, J:L, M:O y P:Q

    // PRODUCCIÓN POR MARCA
    seccion(ws,P.prodTit,NC,'PRODUCCIÓN POR MARCA');
    const cabP=['Cuadro','Marca','Presentación','Lote','Inicio','Fin','Programado','Producido','Saldo','Cumplimiento','Paradas prog. (min)','Paradas no prog. (min)','Paradas total (min)','H efectivas','Ratio / h','Cierre','Supervisor'];cabP.numDesde=4;
    cabeceraTabla(ws,P.prodCab,cabP);
    const pr=`$D$${P.parIni}:$D$${P.parFin}`,pt=`$E$${P.parIni}:$E$${P.parFin}`,pm=`$G$${P.parIni}:$G$${P.parFin}`;
    if(!l.cuadros.length){sinRegistros(ws,P.prodIni,NC,l.motivo?'Sin registros · '+l.motivo:'Sin registros');}
    l.cuadros.forEach((c,i)=>{
      const f=P.prodIni+i;
      celda(ws,f,0,c.codigo,{bold:true});celda(ws,f,1,c.marca,{captura:true});celda(ws,f,2,c.presentacion,{captura:true});celda(ws,f,3,c.lote||null,{captura:true});
      celda(ws,f,4,c.inicio,{captura:true,fmt:FMT.hora,align:'right'});celda(ws,f,5,c.fin,{captura:true,fmt:FMT.hora,align:'right'});
      celda(ws,f,6,c.programado,{captura:true,fmt:FMT.miles});celda(ws,f,7,c.producido,{captura:true,fmt:FMT.miles});
      celda(ws,f,8,{f:`MAX(G${f}-H${f},0)`},{fmt:FMT.miles});celda(ws,f,9,{f:`IF(G${f}>0,H${f}/G${f},"")`},{fmt:FMT.pct});
      celda(ws,f,10,{f:`SUMIFS(${pm},${pr},$A${f},${pt},"Programada")`},{fmt:FMT.miles});celda(ws,f,11,{f:`SUMIFS(${pm},${pr},$A${f},${pt},"No programada")`},{fmt:FMT.miles});
      celda(ws,f,12,{f:`K${f}+L${f}`},{fmt:FMT.miles});
      celda(ws,f,13,{f:`IF(AND(ISNUMBER(E${f}),ISNUMBER(F${f})),ROUND(MOD(F${f}-E${f},1)*24-M${f}/60,4),"")`},{fmt:FMT.horas});
      celda(ws,f,14,{f:`IF(AND(ISNUMBER(N${f}),N${f}>0),H${f}/N${f},"")`},{fmt:FMT.miles});
      celda(ws,f,15,c.cierre,{align:'center'});
      const s=celda(ws,f,16,c.supervisor||null,{captura:true});if(!c.supervisor)s.fill=fill(C.porCompletar);
      alterna(ws,f,NC-1,i);
    });
    const a=P.prodIni,b=P.prodFin,t=T;
    celda(ws,t,0,'TOTAL '+l.nombre,{bold:true,fill:C.franja});
    for(let c=1;c<NC;c++)ws.getCell(t,c+1).fill=fill(C.franja);
    const tot=(c,f,fmt)=>{const x=celda(ws,t,c,{f},{fmt,bold:true});x.fill=fill(C.franja);};
    tot(4,`IF(COUNT(E${a}:E${b})=0,"",MIN(E${a}:E${b}))`,FMT.hora);tot(5,`IF(COUNT(F${a}:F${b})=0,"",MAX(F${a}:F${b}))`,FMT.hora);
    tot(6,`SUM(G${a}:G${b})`,FMT.miles);tot(7,`SUM(H${a}:H${b})`,FMT.miles);tot(8,`SUM(I${a}:I${b})`,FMT.miles);tot(9,`IF(G${t}>0,H${t}/G${t},"")`,FMT.pct);
    // Paradas de la línea: TODAS (también las «Sin asignar»), por tipo, desde la tabla de paradas.
    tot(10,`SUMIFS(G${P.parIni}:G${P.parFin},E${P.parIni}:E${P.parFin},"Programada")`,FMT.miles);tot(11,`SUMIFS(G${P.parIni}:G${P.parFin},E${P.parIni}:E${P.parFin},"No programada")`,FMT.miles);
    tot(12,`K${t}+L${t}`,FMT.miles);tot(13,`IF(COUNT(N${a}:N${b})=0,"",SUM(N${a}:N${b}))`,FMT.horas);tot(14,`IF(AND(ISNUMBER(N${t}),N${t}>0),H${t}/N${t},"")`,FMT.miles);
    const cierreL=!l.cuadros.some(c=>c.producido>0)?'Sin producción':(l.cuadros.filter(c=>c.producido>0).every(c=>c.cierre==='Confirmado')?'Confirmado':'Sin cierre');
    const xc=celda(ws,t,15,cierreL,{bold:true,align:'center'});xc.fill=fill(C.franja);
    const xs=celda(ws,t,16,l.supervisor||null,{bold:true});xs.fill=fill(l.supervisor?C.franja:C.porCompletar);
    cf(ws,`J${a}:J${t}`,[{type:'dataBar',priority:1,minLength:0,maxLength:100,cfvo:[{type:'num',value:0},{type:'num',value:1}],color:{argb:'FF'+C.acento}},
      regla(`AND(ISNUMBER(J${a}),J${a}>=0.98)`,C.verde,C.verdeTx,2),regla(`AND(ISNUMBER(J${a}),J${a}>=0.9,J${a}<0.98)`,C.ambar,C.ambarTx,3),regla(`AND(ISNUMBER(J${a}),J${a}<0.9)`,C.rojo,C.rojoTx,4)]);
    cf(ws,`P${a}:P${t}`,[regla(`ISNUMBER(SEARCH("Sin producción",P${a}))`,C.rojo,C.rojoTx,5),regla(`ISNUMBER(SEARCH("Confirmado",P${a}))`,C.verde,C.verdeTx,6)]);

    // PARADAS
    seccion(ws,P.parTit,NC,'PARADAS');
    const cabPa=['Evento','Marca','Presentación','Cuadro','Tipo','Equipo','Minutos','Tiempo (h)','Motivo'];cabPa.numDesde=6;
    cabeceraTabla(ws,P.parCab,cabPa.concat(new Array(8).fill(null)),[[8,16]]);
    const look=(colDato,fila,colCuadro)=>`IFERROR(INDEX($${colDato}$${P.prodIni}:$${colDato}$${P.prodFin},MATCH($${colCuadro}${fila},$A$${P.prodIni}:$A$${P.prodFin},0)),"")`;
    if(!l.paradas.length){for(let c=0;c<9;c++)celda(ws,P.parIni,c,c===0?'Sin registros':null,{italic:true,color:C.gris});ws.mergeCells(P.parIni,9,P.parIni,17);}
    l.paradas.forEach((p,i)=>{
      const f=P.parIni+i;
      celda(ws,f,0,p.evento,{bold:true});celda(ws,f,1,{f:look('B',f,'D')});celda(ws,f,2,{f:look('C',f,'D')});celda(ws,f,3,p.cuadro,{captura:true});
      celda(ws,f,4,p.tipo,{captura:true,align:'center'});celda(ws,f,5,p.equipo,{captura:true});celda(ws,f,6,p.minutos,{captura:true,fmt:FMT.miles});
      celda(ws,f,7,{f:`G${f}/60`},{fmt:FMT.horas});ws.mergeCells(f,9,f,17);celda(ws,f,8,p.motivo,{captura:true,wrap:true});alterna(ws,f,9,i);
    });
    const pa=P.parIni,pb=P.parFin;
    celda(ws,P.parTot,0,'TOTAL PARADAS',{bold:true,fill:C.franja});for(let c=1;c<9;c++)ws.getCell(P.parTot,c+1).fill=fill(C.franja);
    celda(ws,P.parTot,6,{f:`SUM(G${pa}:G${pb})`},{bold:true,fmt:FMT.miles,fill:C.franja});celda(ws,P.parTot,7,{f:`SUM(H${pa}:H${pb})`},{bold:true,fmt:FMT.horas,fill:C.franja});
    ws.mergeCells(P.parTot,9,P.parTot,17);
    celda(ws,P.parTot,8,{f:`"Programadas: "&SUMIFS(G${pa}:G${pb},E${pa}:E${pb},"Programada")&" min   ·   No programadas: "&SUMIFS(G${pa}:G${pb},E${pa}:E${pb},"No programada")&" min"`},{bold:true,fill:C.franja});
    cf(ws,`E${pa}:E${pb}`,[regla(`E${pa}="No programada"`,C.ambar,C.ambarTx,7),regla(`E${pa}="Programada"`,C.azulClaro,C.azulTx,8)]);

    // MERMAS
    seccion(ws,P.merTit,NC,'MERMAS');
    const cabM=['Evento','Marca','Presentación','Cuadro','Material','Unidad','Cantidad','Validación','Causa'];cabM.numDesde=6;
    cabeceraTabla(ws,P.merCab,cabM.concat(new Array(8).fill(null)),[[8,16]]);
    if(!l.mermas.length){for(let c=0;c<9;c++)celda(ws,P.merIni,c,c===0?'Sin registros':null,{italic:true,color:C.gris});ws.mergeCells(P.merIni,9,P.merIni,17);}
    l.mermas.forEach((x,i)=>{
      const f=P.merIni+i;
      celda(ws,f,0,x.evento,{bold:true});celda(ws,f,1,{f:look('B',f,'D')});celda(ws,f,2,{f:look('C',f,'D')});celda(ws,f,3,x.cuadro,{captura:true});
      celda(ws,f,4,x.material,{captura:true});celda(ws,f,5,x.unidad,{captura:true,align:'center'});celda(ws,f,6,x.cantidad,{captura:true,fmt:x.unidad==='kg'?FMT.kg:FMT.dec2});
      celda(ws,f,7,x.validacion,{captura:true,align:'center'});ws.mergeCells(f,9,f,17);celda(ws,f,8,x.causa,{captura:true});alterna(ws,f,9,i);
    });
    const ma=P.merIni,mb=P.merFin;
    celda(ws,P.merTot,0,'RESUMEN MERMAS',{bold:true,fill:C.franja});for(let c=1;c<17;c++)ws.getCell(P.merTot,c+1).fill=fill(C.franja);
    ws.mergeCells(P.merTot,5,P.merTot,17);
    celda(ws,P.merTot,4,{f:`"Validadas: "&COUNTIFS(H${ma}:H${mb},"Validada")&"   ·   Pendientes: "&COUNTIFS(H${ma}:H${mb},"Pendiente")&"   ·   kg y UND no se suman entre sí"`},{bold:true,fill:C.franja});
    cf(ws,`H${ma}:H${mb}`,[regla(`H${ma}="Pendiente"`,C.ambar,C.ambarTx,9),regla(`H${ma}="Validada"`,C.verde,C.verdeTx,10)]);

    // INSUMOS Y CONSUMO
    seccion(ws,P.insTit,NC,'INSUMOS Y CONSUMO');
    const cabI=['Cuadro','Marca','Presentación','Insumo','Unidad','Producido','Factor por UND','Teórico','Saldo inicial','Entregado','Devuelto','Saldo final','Real conciliado','Desviación','Merma validada','Por revisar'];cabI.numDesde=5;
    cabeceraTabla(ws,P.insCab,cabI.concat([null]));ws.getCell(P.insCab,17).fill=fill(C.marino);
    if(!l.insumos.length){sinRegistros(ws,P.insIni,NC,l.cuadros.length?'Sin registros (sin factores de consumo configurados)':'Sin registros');}
    const ia=P.insIni,ib=P.insFin;
    l.insumos.forEach((x,i)=>{
      const f=P.insIni+i;
      celda(ws,f,0,x.cuadro,{bold:true});celda(ws,f,1,{f:look('B',f,'A')});celda(ws,f,2,{f:look('C',f,'A')});celda(ws,f,3,x.insumo,{captura:true});celda(ws,f,4,x.unidad,{captura:true,align:'center'});
      celda(ws,f,5,{f:`IFERROR(INDEX($H$${P.prodIni}:$H$${P.prodFin},MATCH($A${f},$A$${P.prodIni}:$A$${P.prodFin},0)),0)`},{fmt:FMT.miles});
      celda(ws,f,6,x.factorPorUnd,{captura:true,fmt:FMT.factor});
      celda(ws,f,7,{f:`IF(ISNUMBER(G${f}),ROUND(F${f}*G${f},4),"Sin factor")`},{fmt:FMT.kg});
      celda(ws,f,8,x.saldoInicial,{captura:true,fmt:FMT.kg});celda(ws,f,9,x.entregado,{captura:true,fmt:FMT.kg});celda(ws,f,10,x.devuelto,{captura:true,fmt:FMT.kg});celda(ws,f,11,x.saldoFinal,{captura:true,fmt:FMT.kg});
      celda(ws,f,12,{f:`IF(AND(ISNUMBER(I${f}),ISNUMBER(L${f})),ROUND(I${f}+J${f}-K${f}-L${f},4),"Pendiente de conciliación")`},{fmt:FMT.kg});
      celda(ws,f,13,{f:`IF(AND(ISNUMBER(M${f}),ISNUMBER(H${f})),ROUND(M${f}-H${f},4),"")`},{fmt:FMT.kg});
      celda(ws,f,14,{f:`SUMIFS($G$${ma}:$G$${mb},$D$${ma}:$D$${mb},$A${f},$E$${ma}:$E$${mb},$D${f},$F$${ma}:$F$${mb},$E${f},$H$${ma}:$H$${mb},"Validada")`},{fmt:FMT.kg});
      celda(ws,f,15,{f:`IF(ISNUMBER(N${f}),ROUND(N${f}-O${f},4),"")`},{fmt:FMT.kg});
      if(x.saldoInicial===null)ws.getCell(f,9).fill=fill(C.porCompletar);
      if(x.saldoFinal===null)ws.getCell(f,12).fill=fill(C.porCompletar);
      if(i>0&&l.insumos[i-1].cuadro!==x.cuadro)for(let c=1;c<=16;c++)ws.getCell(f,c).border={...ws.getCell(f,c).border,top:borde(C.acento,'medium')};
    });
    cf(ws,`P${ia}:P${ib}`,[regla(`AND(ISNUMBER(P${ia}),ABS(P${ia})>0.0001)`,C.ambar,C.ambarTx,11)]);

    // PERSONAL
    seccion(ws,P.perTit,NC,'PERSONAL');
    const cabPe=['Código','Trabajador',null,'Puesto','Bloque',null,'Asistencia','Ingreso','Salida','Jornada (h)'];cabPe.numDesde=7;
    cabeceraTabla(ws,P.perCab,cabPe,[[1,2],[4,5]]);
    const pe1=P.perIni,pe2=P.perFin;
    if(!l.personal.length){for(let c=0;c<10;c++)celda(ws,pe1,c,c===0?'Sin registros':null,{italic:true,color:C.gris});ws.mergeCells(pe1,2,pe1,3);ws.mergeCells(pe1,5,pe1,6);}
    l.personal.forEach((p,i)=>{
      const f=pe1+i;
      celda(ws,f,0,p.codigo,{captura:true});ws.mergeCells(f,2,f,3);celda(ws,f,1,p.nombre,{captura:true});celda(ws,f,3,p.puesto,{captura:true});
      ws.mergeCells(f,5,f,6);celda(ws,f,4,p.bloque,{captura:true});celda(ws,f,6,p.asistencia,{captura:true,align:'center'});
      celda(ws,f,7,p.ingreso,{captura:true,fmt:FMT.hora});celda(ws,f,8,p.salida,{captura:true,fmt:FMT.hora});
      celda(ws,f,9,{f:`IF(AND(ISNUMBER(H${f}),ISNUMBER(I${f})),MOD(I${f}-H${f},1)*24,"")`},{fmt:FMT.horas});alterna(ws,f,10,i);
    });
    celda(ws,P.perTot,0,'TOTAL PERSONAL',{bold:true,fill:C.franja});for(let c=1;c<10;c++)ws.getCell(P.perTot,c+1).fill=fill(C.franja);
    celda(ws,P.perTot,3,{f:`COUNTA(A${pe1}:A${pe2})-COUNTIFS(A${pe1}:A${pe2},"Sin registros")&" registrados"`},{bold:true,fill:C.franja});
    celda(ws,P.perTot,6,{f:`"Presentes: "&COUNTIFS(G${pe1}:G${pe2},"Asistió")`},{bold:true,fill:C.franja});
    celda(ws,P.perTot,9,{f:`SUM(J${pe1}:J${pe2})`},{bold:true,fmt:FMT.horas,fill:C.franja});
    cf(ws,`G${pe1}:G${pe2}`,[regla(`G${pe1}="Asistió"`,C.verde,C.verdeTx,12),regla(`AND(G${pe1}<>"",G${pe1}<>"Asistió",G${pe1}<>"Sin registros")`,C.rojo,C.rojoTx,13)]);

    // Notas de cálculo
    const notas=['Azul = cantidades capturadas · Fondo amarillo = por completar (Supervisor, saldos) · Resto = fórmulas.',
      'Saldo por cuadro = máx(programado − producido, 0); saldo de la línea = suma de saldos por cuadro (no compensa entre marcas). Cumplimiento = producido / programado.',
      'H efectivas = (fin − inicio) − paradas del cuadro / 60, con cruce de medianoche. Ratio / h = producido / H efectivas.',
      'Real conciliado = saldo inicial + entregado − devuelto − saldo final. Desviación = real − teórico. Por revisar = desviación − merma validada (no se convierte en merma).',
      'Jornada = salida − ingreso (sin descontar refrigerio ni calcular horas extra). kg y UND nunca se suman entre sí.'];
    notas.forEach((n,i)=>{const f=P.notas+i;ws.mergeCells(f,1,f,NC);const c=ws.getCell(f,1);c.value=n;c.font=font({size:8.5,italic:true,color:C.gris});c.alignment={wrapText:true,vertical:'top'};ws.getRow(f).height=i===0?14:24;});
    // Saltos de página por sección.
    [P.parTit,P.merTit,P.insTit,P.perTit].forEach(f=>{try{ws.getRow(f-1).addPageBreak();}catch(_){/* versión sin saltos */}});
    return {...P,hoja:l.hoja};
  }

  /* ---------- Resumen general (14 columnas A..N) ---------- */
  function hojaResumen(ws,m,pos,opc){
    const NC=14;
    [14,20,16,11,18,13,12,13,12,12,14,14,22,20].forEach((w,i)=>{ws.getColumn(i+1).width=w;});
    const turnos=m.lineas.filter(l=>l.cuadros.length).reduce((acc,l)=>{(acc[l.bloques]=acc[l.bloques]||[]).push(l.nombre);return acc;},{});
    encabezado(ws,NC,'GLACIAL · Resumen general de Producción',`Fecha operativa ${fechaTxt(m.fecha)}  ·  Cierre general de Producción`,
      'Turnos:  '+(Object.keys(turnos).map(k=>`${k} → ${turnos[k].join(' · ')}`).join('     |     ')||'sin producción registrada'),m.simulado,null);
    seccion(ws,6,NC,'RESUMEN DEL CIERRE');
    const L=m.lineas;
    const rango=(l,colL,ini,fin)=>ref(l.hoja,`${colL}${pos[l.codigo][ini]}:${colL}${pos[l.codigo][fin]}`);
    const sumaHojas=fn=>L.map(fn).join('+');
    const filaL=14,filaU=filaL+L.length-1;
    // Apoyo y sin asignar (posición calculada más abajo).
    // Filas de cada sección, calculadas antes de escribir porque las tarjetas apuntan a rangos de más abajo.
    const yProd=21+18,nFilasProd=L.reduce((s,l)=>s+1+Math.max(l.cuadros.length,1)+1,0);
    const yMer=yProd+2+nFilasProd+1;
    const mermasMat=resumenMermasLineas(m);
    const yApoyo=yMer+Math.max(2+Math.max(mermasMat.length,1),1+Math.max(m.observaciones.length,1))+2;
    const ap1=yApoyo+2,ap2=ap1+Math.max(m.apoyo.length,1)-1;
    kpis(ws,8,[
      {titulo:'LÍNEAS CON PRODUCCIÓN',valor:`COUNTIFS(D${filaL}:D${filaU},">0")`,sub:{f:`"de "&COUNTA(A${filaL}:A${filaU})&" líneas incluidas"`}},
      {titulo:'CUADROS AL 100 %',valor:sumaHojas(l=>`COUNTIFS(${rango(l,'J','prodIni','prodFin')},">=1")`),sub:{f:`"de "&(${sumaHojas(l=>`COUNTIFS(${rango(l,'G','prodIni','prodFin')},">0")`)})&" cuadros programados"`}},
      {titulo:'CUMPLIMIENTO PROMEDIO',valor:`IFERROR(AVERAGE(${L.map(l=>rango(l,'J','prodIni','prodFin')).join(',')}),"")`,fmt:FMT.pct,sub:'promedio simple por cuadro'},
      {titulo:'PARADAS TOTALES',valor:`SUM(G${filaL}:H${filaU})`,sub:{f:`"programadas: "&SUM(G${filaL}:G${filaU})&" min"`}},
      {titulo:'PARADAS NO PROGRAMADAS',valor:`SUM(H${filaL}:H${filaU})`,sub:{f:`TEXT(IFERROR(SUM(H${filaL}:H${filaU})/SUM(G${filaL}:H${filaU}),0),"0.0%")&" del tiempo de parada"`}},
      {titulo:'PERSONAL PRESENTE',valor:`SUM(J${filaL}:J${filaU})+COUNTIFS(F${ap1}:F${ap2},"Asistió")`,sub:{f:`"de "&(${sumaHojas(l=>`(COUNTA(${rango(l,'A','perIni','perFin')})-COUNTIFS(${rango(l,'A','perIni','perFin')},"Sin registros"))`)}+COUNTA(A${ap1}:A${ap2})-COUNTIFS(A${ap1}:A${ap2},"Sin registros"))&" registrados"`}},
      {titulo:'MERMAS PENDIENTES',valor:sumaHojas(l=>`COUNTIFS(${rango(l,'H','merIni','merFin')},"Pendiente")`),sub:{f:`(${sumaHojas(l=>`COUNTIFS(${rango(l,'H','merIni','merFin')},"Validada")`)})&" validadas"`}}
    ],2);

    seccion(ws,12,NC,'RESUMEN POR LÍNEA');
    const cab=['Línea','Unidad','Programado','Producido','Saldo','Cumplimiento','Paradas prog. (min)','Paradas no prog. (min)','Cuadros producidos','Personal','Supervisor','Cierre','Motivo / observación','Bloque'];cab.numDesde=2;
    cabeceraTabla(ws,13,cab);
    L.forEach((l,i)=>{
      const f=filaL+i,P=pos[l.codigo],t=P.prodTot,h=l.hoja;
      const c0=ws.getCell(f,1);c0.value={text:l.nombre,hyperlink:`#${ref(h,'A1')}`};c0.font=font({bold:true,color:C.acento,underline:true});c0.border={bottom:borde('E2EBF2')};
      celda(ws,f,1,l.unidad,{align:'center'});
      celda(ws,f,2,{f:ref(h,'G'+t)},{fmt:FMT.miles});celda(ws,f,3,{f:ref(h,'H'+t)},{fmt:FMT.miles});celda(ws,f,4,{f:ref(h,'I'+t)},{fmt:FMT.miles});
      celda(ws,f,5,{f:`IF(C${f}>0,D${f}/C${f},"")`},{fmt:FMT.pct});celda(ws,f,6,{f:ref(h,'K'+t)},{fmt:FMT.miles});celda(ws,f,7,{f:ref(h,'L'+t)},{fmt:FMT.miles});
      celda(ws,f,8,{f:`COUNTIFS(${rango(l,'H','prodIni','prodFin')},">0")`},{fmt:FMT.miles});
      celda(ws,f,9,{f:`COUNTIFS(${rango(l,'G','perIni','perFin')},"Asistió")`},{fmt:FMT.miles});
      const s=celda(ws,f,10,{f:`IF(${ref(h,'Q'+t)}="","",${ref(h,'Q'+t)})`});if(!l.supervisor)s.fill=fill(C.porCompletar);
      celda(ws,f,11,{f:ref(h,'P'+t)},{align:'center'});celda(ws,f,12,l.motivo||'—',{wrap:true});celda(ws,f,13,l.bloques);
      alterna(ws,f,NC,i);
    });
    ws.mergeCells(filaU+1,1,filaU+1,NC);
    const nota=ws.getCell(filaU+1,1);nota.value='Haz clic en el nombre de la línea para ir a su hoja. Saldo por línea = suma de saldos por cuadro; CAJAS 20L se expresa en cajas.';nota.font=font({size:8.5,italic:true,color:C.gris});
    cf(ws,`F${filaL}:F${filaU}`,[{type:'dataBar',priority:1,minLength:0,maxLength:100,cfvo:[{type:'num',value:0},{type:'num',value:1}],color:{argb:'FF'+C.acento}},
      regla(`AND(ISNUMBER(F${filaL}),F${filaL}>=0.98)`,C.verde,C.verdeTx,2),regla(`AND(ISNUMBER(F${filaL}),F${filaL}>=0.9,F${filaL}<0.98)`,C.ambar,C.ambarTx,3),regla(`AND(ISNUMBER(F${filaL}),F${filaL}<0.9)`,C.rojo,C.rojoTx,4)]);
    cf(ws,`L${filaL}:L${filaU}`,[regla(`ISNUMBER(SEARCH("Sin producción",L${filaL}))`,C.rojo,C.rojoTx,5),regla(`ISNUMBER(SEARCH("Confirmado",L${filaL}))`,C.verde,C.verdeTx,6)]);

    // GRÁFICOS (imágenes de Chart.js; en su ausencia, aviso)
    seccion(ws,21,NC,'INDICADORES GRÁFICOS');
    if(opc.graficos&&opc.graficos.length){
      opc.graficos.forEach((g,i)=>{const id=ws.workbook.addImage({base64:g,extension:'png'});ws.addImage(id,{tl:{col:i===0?0:7,row:22},ext:{width:560,height:300}});});
    }else{ws.mergeCells(23,1,23,NC);const c=ws.getCell(23,1);c.value='Gráficos no disponibles en esta exportación (se generan al exportar desde la aplicación).';c.font=font({italic:true,color:C.gris});}

    // PRODUCCIÓN POR LÍNEA, MARCA Y PRESENTACIÓN
    seccion(ws,yProd,NC,'PRODUCCIÓN POR LÍNEA, MARCA Y PRESENTACIÓN');
    const cab2=['Línea','Marca','Presentación','Cuadro','Lote','Programado','Producido','Saldo','Cumplimiento','Paradas prog. (min)','Paradas no prog. (min)','Ratio / h','Cierre','Supervisor'];cab2.numDesde=5;
    cabeceraTabla(ws,yProd+1,cab2);
    let f=yProd+2;
    L.forEach(l=>{
      const P=pos[l.codigo],t=P.prodTot,h=l.hoja;
      const marcas=[...new Set(l.cuadros.map(c=>c.marca))].length;
      for(let c=1;c<=NC;c++)ws.getCell(f,c).fill=fill(C.franja);
      const a0=ws.getCell(f,1);a0.value={text:l.nombre,hyperlink:`#${ref(h,'A1')}`};a0.font=font({bold:true,color:C.marino,underline:true});a0.fill=fill(C.franja);
      ws.mergeCells(f,2,f,5);celda(ws,f,1,`${marcas?(marcas===1?'MARCA':'MARCAS')+' ('+marcas+')':'SIN MARCAS'}  ·  ${l.unidad}  ·  ${l.bloques}`,{bold:true,fill:C.franja});
      [[5,'G'],[6,'H'],[7,'I']].forEach(([c,x])=>celda(ws,f,c,{f:ref(h,x+t)},{fmt:FMT.miles,bold:true,fill:C.franja}));
      celda(ws,f,8,{f:`IF(${ref(h,'J'+t)}="","",${ref(h,'J'+t)})`},{fmt:FMT.pct,bold:true,fill:C.franja});
      celda(ws,f,9,{f:ref(h,'K'+t)},{fmt:FMT.miles,bold:true,fill:C.franja});celda(ws,f,10,{f:ref(h,'L'+t)},{fmt:FMT.miles,bold:true,fill:C.franja});
      celda(ws,f,11,{f:`IF(${ref(h,'O'+t)}="","",${ref(h,'O'+t)})`},{fmt:FMT.miles,bold:true,fill:C.franja});celda(ws,f,12,{f:ref(h,'P'+t)},{bold:true,align:'center',fill:C.franja});
      celda(ws,f,13,{f:`IF(${ref(h,'Q'+t)}="","",${ref(h,'Q'+t)})`},{bold:true,fill:C.franja});
      f++;
      if(!l.cuadros.length){ws.mergeCells(f,2,f,NC);celda(ws,f,1,'Sin registros'+(l.motivo?' · '+l.motivo:''),{italic:true,color:C.gris,indent:2});f++;}
      l.cuadros.forEach((c,i)=>{
        const r=P.prodIni+i;
        celda(ws,f,1,{f:`"▸ "&${ref(h,'B'+r)}`},{indent:2});celda(ws,f,2,{f:ref(h,'C'+r)});celda(ws,f,3,{f:ref(h,'A'+r)});celda(ws,f,4,{f:`IF(${ref(h,'D'+r)}="","",${ref(h,'D'+r)})`});
        celda(ws,f,5,{f:ref(h,'G'+r)},{fmt:FMT.miles});celda(ws,f,6,{f:ref(h,'H'+r)},{fmt:FMT.miles});celda(ws,f,7,{f:ref(h,'I'+r)},{fmt:FMT.miles});
        celda(ws,f,8,{f:`IF(${ref(h,'J'+r)}="","",${ref(h,'J'+r)})`},{fmt:FMT.pct});celda(ws,f,9,{f:ref(h,'K'+r)},{fmt:FMT.miles});celda(ws,f,10,{f:ref(h,'L'+r)},{fmt:FMT.miles});
        celda(ws,f,11,{f:`IF(${ref(h,'O'+r)}="","",${ref(h,'O'+r)})`},{fmt:FMT.miles});celda(ws,f,12,{f:ref(h,'P'+r)},{align:'center'});celda(ws,f,13,{f:`IF(${ref(h,'Q'+r)}="","",${ref(h,'Q'+r)})`});
        f++;
      });
      f++;
    });
    const finProd=f-1;
    cf(ws,`I${yProd+2}:I${finProd}`,[regla(`AND(ISNUMBER(I${yProd+2}),I${yProd+2}>=0.98)`,C.verde,C.verdeTx,7),regla(`AND(ISNUMBER(I${yProd+2}),I${yProd+2}>=0.9,I${yProd+2}<0.98)`,C.ambar,C.ambarTx,8),regla(`AND(ISNUMBER(I${yProd+2}),I${yProd+2}<0.9)`,C.rojo,C.rojoTx,9)]);
    cf(ws,`M${yProd+2}:M${finProd}`,[regla(`ISNUMBER(SEARCH("Sin producción",M${yProd+2}))`,C.rojo,C.rojoTx,10),regla(`ISNUMBER(SEARCH("Confirmado",M${yProd+2}))`,C.verde,C.verdeTx,11)]);

    // MERMAS POR MATERIAL (todas las líneas) + OBSERVACIONES
    const yM=yMer;
    seccion(ws,yM,5,'MERMAS POR MATERIAL (TODAS LAS LÍNEAS)');
    const titObs=ws.getCell(yM,7);titObs.value='OBSERVACIONES DEL REPORTE';titObs.font=font({size:10.5,bold:true,color:C.marino});for(let c=7;c<=NC;c++)ws.getCell(yM,c).border={bottom:borde(C.acento,'medium')};
    const cabMM=['Material','Unidad','Validada','Pendiente','Total'];cabMM.numDesde=2;cabeceraTabla(ws,yM+1,cabMM);
    if(!mermasMat.length){ws.mergeCells(yM+2,1,yM+2,5);celda(ws,yM+2,0,'Sin registros',{italic:true,color:C.gris});}
    mermasMat.forEach((x,i)=>{
      const r=yM+2+i;
      celda(ws,r,0,x.material);celda(ws,r,1,x.unidad,{align:'center'});
      const suma=estado=>L.map(l=>`SUMIFS(${rango(l,'G','merIni','merFin')},${rango(l,'E','merIni','merFin')},$A${r},${rango(l,'F','merIni','merFin')},$B${r},${rango(l,'H','merIni','merFin')},"${estado}")`).join('+');
      const fm=x.unidad==='kg'?FMT.kg:FMT.dec2;
      celda(ws,r,2,{f:suma('Validada')},{fmt:fm});celda(ws,r,3,{f:suma('Pendiente')},{fmt:fm});celda(ws,r,4,{f:`C${r}+D${r}`},{fmt:fm,bold:true});alterna(ws,r,5,i);
    });
    const obs=m.observaciones.length?m.observaciones:[{nivel:'info',texto:'Sin observaciones.'}];
    obs.forEach((o,i)=>{
      const r=yM+1+i;const color={critico:'C62828',atencion:'B26A00',info:C.acento}[o.nivel]||C.acento;
      const b=ws.getCell(r,7);b.value='●';b.font=font({size:11,color});b.alignment={horizontal:'center'};
      ws.mergeCells(r,8,r,NC);const t=ws.getCell(r,8);t.value=o.texto;t.font=font({size:9,color:'1A2B3C'});t.alignment={wrapText:true,vertical:'middle'};
    });

    // PERSONAL DE APOYO Y SIN ASIGNAR
    seccion(ws,yApoyo,NC,'PERSONAL DE APOYO Y SIN ASIGNAR (NO PERTENECE A UNA LÍNEA)');
    const cabA=['Código','Trabajador','Asignación','Puesto','Bloque','Asistencia','Ingreso','Salida','Jornada (h)'];cabA.numDesde=6;cabeceraTabla(ws,yApoyo+1,cabA);
    if(!m.apoyo.length){for(let c=0;c<9;c++)celda(ws,ap1,c,c===0?'Sin registros':null,{italic:true,color:C.gris});}
    m.apoyo.forEach((p,i)=>{
      const r=ap1+i;
      celda(ws,r,0,p.codigo,{captura:true});celda(ws,r,1,p.nombre,{captura:true});celda(ws,r,2,p.asignacion,{captura:true});celda(ws,r,3,p.puesto,{captura:true});celda(ws,r,4,p.bloque,{captura:true});
      celda(ws,r,5,p.asistencia,{captura:true,align:'center'});celda(ws,r,6,p.ingreso,{captura:true,fmt:FMT.hora});celda(ws,r,7,p.salida,{captura:true,fmt:FMT.hora});
      celda(ws,r,8,{f:`IF(AND(ISNUMBER(G${r}),ISNUMBER(H${r})),MOD(H${r}-G${r},1)*24,"")`},{fmt:FMT.horas});alterna(ws,r,9,i);
    });
    cf(ws,`F${ap1}:F${ap2}`,[regla(`F${ap1}="Asistió"`,C.verde,C.verdeTx,12),regla(`AND(F${ap1}<>"",F${ap1}<>"Asistió",F${ap1}<>"Sin registros")`,C.rojo,C.rojoTx,13)]);

    // HOJAS POR LÍNEA
    const yH=ap2+3;
    seccion(ws,yH,NC,'HOJAS POR LÍNEA');
    L.forEach((l,i)=>{
      const r=yH+1+i;ws.mergeCells(r,1,r,2);const c=ws.getCell(r,1);c.value={text:'→ '+l.nombre,hyperlink:`#${ref(l.hoja,'A1')}`};c.font=font({bold:true,color:C.acento,underline:true});
      ws.mergeCells(r,3,r,NC);const d=ws.getCell(r,3);d.value='indicadores de la línea, producción por marca, paradas, mermas, insumos y consumo, y personal.';d.font=font({color:C.gris});
    });
    const yF=yH+L.length+2;ws.mergeCells(yF,1,yF,NC);
    const fu=ws.getCell(yF,1);fu.value=m.simulado?'Fuente: datos ficticios preparados para ilustrar el reporte consolidado GLACIAL. No son resultados reales de planta.'
      :'Fuente: GLACIAL — Programación, Paletas, Avance/Cierre, Tareo y Asistente de Producción. Las celdas calculadas son fórmulas: si se corrige un dato, el reporte se recalcula.';
    fu.font=font({size:8.5,italic:true,color:C.gris});
    [yProd,yM,yApoyo].forEach(r=>{try{ws.getRow(r-1).addPageBreak();}catch(_){/* sin saltos */}});
  }
  /* Material + unidad presentes en las mermas de todas las líneas (una fila por material Y unidad). */
  function resumenMermasLineas(m){
    const v=new Map();
    m.lineas.forEach(l=>l.mermas.forEach(x=>{const k=x.material+'|'+x.unidad;if(!v.has(k))v.set(k,{material:x.material,unidad:x.unidad});}));
    return [...v.values()].sort((a,b)=>a.material.localeCompare(b.material)||a.unidad.localeCompare(b.unidad));
  }

  /* ---------- exportación desde la aplicación ---------- */
  async function asegurarExcelJS(){
    if(global.ExcelJS)return global.ExcelJS;
    if(typeof cargarScriptExterno==='function'){await cargarScriptExterno('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js','ExcelJS');}
    if(!global.ExcelJS)throw new Error('No se pudo cargar la librería de Excel (ExcelJS).');
    return global.ExcelJS;
  }
  function graficos(m){
    if(typeof Chart==='undefined'||typeof document==='undefined')return [];
    const L=m.lineas;const pngs=[];
    const dibujar=cfg=>{const cv=document.createElement('canvas');cv.width=1120;cv.height=600;cv.style.display='none';document.body.appendChild(cv);
      const ch=new Chart(cv.getContext('2d'),{...cfg,options:{...cfg.options,animation:false,responsive:false,devicePixelRatio:1}});
      const url=cv.toDataURL('image/png');ch.destroy();cv.remove();return url;};
    const cumpl=L.map(l=>{const p=l.cuadros.reduce((s,c)=>s+c.programado,0),q=l.cuadros.reduce((s,c)=>s+c.producido,0);return p>0?Math.round(q/p*1000)/10:0;});
    pngs.push(dibujar({type:'bar',data:{labels:L.map(l=>l.nombre),datasets:[{label:'Cumplimiento (%)',data:cumpl,backgroundColor:cumpl.map(v=>v>=98?'#22C55E':v>=90?'#F59E0B':'#EF4444')}]},
      options:{plugins:{title:{display:true,text:'Cumplimiento por línea (%)',font:{size:22}},legend:{display:false}},scales:{y:{beginAtZero:true,max:110}}}}));
    const prog=L.map(l=>l.paradas.filter(p=>p.tipo==='Programada').reduce((s,p)=>s+p.minutos,0)),nop=L.map(l=>l.paradas.filter(p=>p.tipo==='No programada').reduce((s,p)=>s+p.minutos,0));
    pngs.push(dibujar({type:'bar',data:{labels:L.map(l=>l.nombre),datasets:[{label:'Programadas',data:prog,backgroundColor:'#7DD3FC'},{label:'No programadas',data:nop,backgroundColor:'#F59E0B'}]},
      options:{plugins:{title:{display:true,text:'Paradas por línea (min)',font:{size:22}}},scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true}}}}));
    return pngs.map(u=>u.replace(/^data:image\/png;base64,/,''));
  }
  async function exportar(fecha){
    const D=global.glacialAsistenteDatos;
    if(!D||!D.puede('reporteGeneral'))throw new Error('No tienes permiso para exportar el Reporte General.');
    if(global.glacialVista&&global.glacialVista.activo&&global.glacialVista.activo()&&typeof tienePermiso==='function'&&!tienePermiso('exportarExcel'))throw new Error('El modo visualización no permite exportar.');
    const extra=await D.cargarFecha(fecha);
    let factores=D.cache.factores,insumos=D.cache.insumos;
    if(!D.cache.listo.factores){const [a,b]=await Promise.all([db.collection('apFactores').get(),db.collection('apInsumos').get()]);factores=a.docs.map(d=>d.data());insumos=b.docs.map(d=>d.data());}
    const I=global.glacialIncidencias;
    const m=modelo({fecha,programaciones:typeof loadProgramaciones==='function'?loadProgramaciones():[],records:typeof loadRecords==='function'?loadRecords():[],
      produccionAlCorte:global.glacialProduccionPaletasAlCorte,unidadesPorPaleta:typeof obtenerUnidadesPorPalet==='function'?obtenerUnidadesPorPalet:null,
      mermas:extra.mermas,conciliaciones:extra.conciliaciones,movimientos:D.cache.movimientos.concat(extra.movimientos.filter(x=>!D.cache.movimientos.some(y=>y.opId===x.opId))),
      factores,insumos,tareos:typeof obtenerTareos==='function'?obtenerTareos():[],
      paradasAvance:(linea,f,b)=>{if(typeof global.calcularTiemposLinea!=='function')return [];const t=global.calcularTiemposLinea(linea,b==='NOCHE'?'NOCHE':'DÍA',f,{});
        return (t&&t.paradasClasificadas||[]).filter(p=>p.minutos>0).map(p=>({tipo:p.clasif==='PROGRAMADA'?'PROGRAMADA':'NO_PROGRAMADA',minutos:Math.round(p.minutos),motivo:p.motivo,equipo:p.equipo}));},
      etiquetaBloque:(linea,f,b)=>{const H=global.glacialHorarios;if(!H||typeof H.resolver!=='function')return '';const r=H.resolver(linea,f,b==='NOCHE'?'NOCHE':'DÍA');
        return r&&r.origen==='REGLA'?`${r.etiqueta} ${r.horario}`:'';},
      motivoSinProduccion:(linea,f)=>{if(!I||typeof I.doc!=='function')return '';const d=I.doc(f,'DIA',linea)||I.doc(f,'NOCHE',linea);return d&&d.motivo?'Sin producción: '+d.motivo+(d.descripcion?' ('+d.descripcion+')':''):'';}});
    const ExcelJS=await asegurarExcelJS();
    const wb=escribir(ExcelJS,m,{graficos:graficos(m)});
    const buf=await wb.xlsx.writeBuffer();
    const nombre=`GLACIAL_Reporte_General_${fecha}.xlsx`;
    const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    if(typeof descargarArchivo==='function')descargarArchivo(blob,nombre);
    else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nombre;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}
    return nombre;
  }

  global.glacialReporteGeneral={modelo,escribir,exportar,HOJA,FMT};
})(typeof window!=='undefined'?window:globalThis);
