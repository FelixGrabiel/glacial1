/* =============================================================
   IMPACTO ECONÓMICO · EXPORTACIÓN A EXCEL (lo que se ve en pantalla, con los mismos filtros)

   · Gerencia: soles, eventos y hoja «Supuestos» (valores unitarios vigentes usados en el periodo).
   · Jefatura: soles y unidades por evento; sin valores unitarios ni supuestos.
   · Los demás: solo minutos y unidades; ninguna columna en soles.
   No se crean hojas ni columnas ocultas: lo que no corresponde al rol simplemente no se escribe.
   Cargar después de 58-impacto-dashboard.js.
   ============================================================= */
(function(){
  'use strict';

  const E=()=>window.GlacialImpactoEstado;
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const r2=n=>Math.round(num(n)*100)/100;

  function hoja(wb,nombre,cols,filas,anchos,titulo){
    const ws=wb.addWorksheet(nombre.slice(0,31));
    ws.addRow([titulo]);ws.getRow(1).font={bold:true,size:13};
    ws.addRow([]);
    const h=ws.addRow(cols);
    h.eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1F4E79'}};});
    filas.forEach(f=>ws.addRow(f));
    (anchos||[]).forEach((w,i)=>{ws.getColumn(i+1).width=w;});
    return ws;
  }

  /* Filas de cada hoja según el rol (puro: se prueba sin ExcelJS). */
  function armar(ctx){
    const v=ctx.vista,econ=!!ctx.econ,med=econ?'s':'min';
    const titulo=(econ?'Impacto económico · ':'Impacto operativo · ')+v.per.etiqueta;
    const filtros=E().chips(ctx.estado).map(c=>c.etq).join(' | ')||'Sin filtros adicionales';
    const hojas=[];
    const t=v.kpis.total,va=v.kpis.variacion;
    const res=[['Periodo',v.per.etiqueta],['Comparado con',v.perPrev?v.perPrev.etiqueta:'—'],['Filtros aplicados',filtros]];
    if(econ)res.push(['Pérdida total (S/)',r2(t.s)]);
    res.push(['Minutos perdidos',r2(t.min)],['Unidades perdidas',r2(t.u)],['Paradas no programadas',t.n]);
    res.push([econ?'Variación de la pérdida vs. periodo comparado':'Variación de minutos vs. periodo comparado',va&&va.pct!=null?r2(va.pct)+' %':'Sin base de comparación']);
    if(v.kpis.topLinea)res.push(['Línea de mayor impacto',v.kpis.topLinea.k]);
    if(v.kpis.topCausa)res.push(['Principal causa',v.kpis.topCausa.k]);
    if(econ&&v.sinValor>0)res.push(['Eventos sin valor configurado (no incluidos en soles)',v.sinValor]);
    hojas.push({nombre:'Resumen',cols:['Concepto','Valor'],filas:res,anchos:[52,46],titulo});
    const cols=['Fecha','Hora','Turno','Línea','Marca','Presentación','Máquina','Causa','Tipo','Minutos','Unidades'].concat(econ?['Pérdida (S/)']:[]);
    hojas.push({nombre:'Eventos',cols,anchos:[12,8,18,14,16,18,16,44,22,10,10,13],titulo,
      filas:v.tabla.slice().sort((a,b)=>(b[med]==null?-1:b[med])-(a[med]==null?-1:a[med])).map(f=>[f.fecha,f.hora||'',f.turno,f.linea,f.marca,f.pres,f.tipo==='P'?(f.maquina||'Sin clasificar'):'',f.causa,E().TIPOS[f.tipo]||f.tipo,r2(f.min),r2(f.u)].concat(econ?[f.s==null?'Sin valor':r2(f.s)]:[]))});
    const ranking=(nombre,lista,etq)=>hojas.push({nombre,cols:[etq].concat(econ?['Pérdida (S/)']:[]).concat(['Minutos','Unidades','Eventos']),anchos:[40,14,12,12,10],titulo,
      filas:lista.map(x=>[x.k].concat(econ?[r2(x.s)]:[]).concat([r2(x.min),r2(x.u),x.n]))});
    ranking('Por línea',v.series.linea,'Línea');ranking('Por causa',v.series.causa,'Causa');ranking('Por máquina',v.series.maquina,'Máquina (paradas)');
    ranking('Por marca',v.series.marca,'Marca');ranking('Por presentación',v.series.pres,'Presentación');ranking('Por turno',v.series.turno,'Turno');ranking('Por tipo',v.series.tipo,'Tipo de pérdida');
    return hojas;
  }

  async function exportar(ctx){
    try{
      const ExcelJS=typeof cargarScriptExterno==='function'?await cargarScriptExterno('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js','ExcelJS'):window.ExcelJS;
      if(!ExcelJS)throw new Error('ExcelJS no está disponible.');
      const wb=new ExcelJS.Workbook();wb.creator=(state.user&&(state.user.nombre||state.user.username))||'GLACIAL';wb.created=new Date();
      armar(ctx).forEach(h=>hoja(wb,h.nombre,h.cols,h.filas,h.anchos,h.titulo));
      if(ctx.gerencia&&window.glacialImpactoEconomico&&window.glacialReporteIndicadores){
        // Supuestos: valores unitarios vigentes que intervienen en el periodo (solo Gerencia).
        const A=window.glacialReporteIndicadores,IE=window.glacialImpactoEconomico,per=ctx.vista.per;
        const rec=A.recolectar(per.desde,per.hasta,{linea:'',motivosSistema:true});
        const r=IE.calcularImpacto(rec.partes,IE.provDefecto());
        hoja(wb,'Supuestos',['Tipo','Concepto','Valor','Unidad','Vigente desde'],r.supuestos.map(s=>[s.tipo,s.etiqueta,s.valor,s.unidad,s.desde||'']),[22,52,12,18,16],'Supuestos usados · '+per.etiqueta);
      }
      const buf=await wb.xlsx.writeBuffer();
      const blob=new Blob([buf],{type:typeof XL_MIME!=='undefined'?XL_MIME:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      const per=ctx.vista.per;
      if(typeof descargarArchivo==='function')descargarArchivo(blob,(ctx.econ?'Impacto_economico_':'Impacto_operativo_')+per.desde+'_'+per.hasta+'.xlsx');
    }catch(e){alert('No se pudo generar el Excel. Verifica tu conexión e inténtalo nuevamente.');console.warn(e);}
  }

  window.glacialImpactoExcel={exportar,armar};
  if(typeof module!=='undefined'&&module.exports)module.exports={armar};
})();
