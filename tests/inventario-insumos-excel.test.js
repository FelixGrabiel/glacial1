/* Excel de la conciliación (Fase 3). Necesita el paquete npm «exceljs» (EXCELJS=/ruta/a/node_modules/exceljs); sin él se omite.
   Uso: node tests/inventario-insumos-excel.test.js */
'use strict';
const path=require('path');
let ExcelJS=null;try{ExcelJS=require(process.env.EXCELJS||'exceljs');}catch(_){console.log('Se omite: falta el paquete exceljs (EXCELJS).');process.exit(0);}
let fallas=0;const ok=(c,m)=>{if(c)console.log('✔ '+m);else{fallas++;console.log('✘ FALLA '+m);}};
global.window=global;
const N=require('../js/asistente/74-inventario-insumos-nucleo.js');
const X=require('../js/asistente/78-inventario-insumos-conciliacion.js');
(async()=>{
  const cat=['A','B','C'].map(k=>({id:k,itemCode:'X'+k,nombre:'ARTÍCULO '+k,categoria:'BOLSA',activo:true,prioritario:true}));
  const corte={fechaCorte:'2026-10-15',items:[{id:'A',w:[100,0,0,0,0,0],t:100},{id:'B',w:[100,20,0,0,0,0],t:120},{id:'C',w:[0,0,0,0,0,0],t:0}]};
  const lineas=[{id:'1',itemId:'A',ubicacion:'Rack A',cantidad:60,por:'Ana',en:Date.UTC(2026,9,15,17,0)},{id:'2',itemId:'A',ubicacion:'Patio',cantidad:50,por:'Ana',en:Date.UTC(2026,9,15,17,5)},{id:'3',itemId:'C',ubicacion:'X',cantidad:3,por:'Luis',en:1}];
  const conc=N.conciliar({catalogo:cat,corte,lineas,almacen:'INSUMOS',comentarios:[{id:'A',texto:'Sobran 10',por:'Ana',en:1}]});
  const m={conteo:{fecha:'2026-10-15',almacen:'INSUMOS',estado:'CERRADO'},corte,conc,detalle:N.detalleUbicaciones(lineas,cat)};
  const wb=X.escribirExcel(ExcelJS,m);
  const buf=await wb.xlsx.writeBuffer();
  const wb2=new ExcelJS.Workbook();await wb2.xlsx.load(buf);
  ok(wb2.worksheets.map(w=>w.name).join('|')==='Conciliación|Detalle por ubicación|Resumen','tres hojas: conciliación, detalle por ubicación y resumen');
  const ws=wb2.getWorksheet('Conciliación');
  const cab=ws.getRow(4).values.slice(1).map(String).join('|');
  ok(cab==='Artículo|AP - CUARENTENA|AP - DEVOLUCIONES|AP - INSUMOS Y SUMINISTROS|AP - PRODUCCIÓN|AP - PRODUCTO TERMINADO|AP - INMOVILIZADOS|TOTAL SAP|CONTEO 15.10|DIFERENCIA|COMENTARIOS|% DIF.|ESTADO','columnas: '+cab);
  const fila=n=>ws.getRow(n).values.slice(1);
  const fa=ws.getRow(5).values;const fil=[5,6,7].map(n=>ws.getRow(n).getCell(1).value);
  const a=[5,6,7].map(n=>ws.getRow(n)).find(r=>r.getCell(1).value==='ARTÍCULO A');
  ok(a&&a.getCell(4).value===100&&a.getCell(8).value.result===100&&a.getCell(9).value===110&&a.getCell(10).value.result===10&&a.getCell(11).value==='Sobran 10'&&a.getCell(13).value==='Observado','fila con stock por almacén, total SAP, conteo (60+50), diferencia, comentario y estado');
  ok(/^[A-Z]+\d+(\+[A-Z]+\d+)*$/.test(a.getCell(8).value.formula)&&/^I\d+-H\d+$/.test(a.getCell(10).value.formula),'TOTAL SAP y DIFERENCIA son fórmulas vivas');
  const b=[5,6,7].map(n=>ws.getRow(n)).find(r=>r.getCell(1).value==='ARTÍCULO B');ok(b&&b.getCell(13).value==='No contado'&&b.getCell(9).value==null&&b.getCell(8).value.result===100,'artículo sin contar: NO CONTADO y solo cuenta el almacén contado (no los 20 de Producción)');
  const wd=wb2.getWorksheet('Detalle por ubicación');ok(wd.getRow(5).getCell(3).value==='Patio'||wd.getRow(5).getCell(3).value==='Rack A','detalle: una fila por línea con ubicación');
  ok(wd.getRow(5).getCell(6).value==='15/10/2026 12:00'||wd.getRow(5).getCell(6).value==='15/10/2026 12:05','fecha y hora en hora de Perú');
  ok(wb2.getWorksheet('Resumen').getRow(10).getCell(2).value.result===3,'resumen: total de artículos');
  ok(ws.autoFilter&&ws.views[0].state==='frozen'&&ws.getCell('A1').font.name==='Arial','filtros, panel congelado y tipografía del resto de Excels');
  const ev=[{tipo:'EDITAR_LINEA',usuario:'Ana',articulo:'ARTÍCULO A',conteoId:'k1',enMs:Date.UTC(2026,9,15,17,0,7),antes:{cantidad:1000,ubicacion:'Rack A'},despues:{cantidad:1500,ubicacion:'Rack A'}},
    {tipo:'IMPORTAR_STOCK',usuario:'Luis',articulo:'STOCK.xlsx',enMs:Date.UTC(2026,9,14,15,0,0),antes:null,despues:{fechaCorte:'2026-10-14',articulos:144}}];
  const wa=X.escribirAuditoriaExcel(ExcelJS,{eventos:ev,desde:'2026-09-18',hasta:'2026-10-18',conteos:[{id:'k1',fecha:'2026-10-15',almacen:'INSUMOS'}],filtros:'Líneas de conteo'});
  const wb3=new ExcelJS.Workbook();await wb3.xlsx.load(await wa.xlsx.writeBuffer());const au=wb3.getWorksheet('Auditoría');
  ok(au.getRow(4).values.slice(1).join('|')==='Fecha y hora|Usuario|Acción|Artículo / dato|Conteo|Campo|Valor anterior|Valor nuevo','auditoría: columnas');
  const filas=[5,6,7,8].map(n=>au.getRow(n).values.slice(1));
  ok(filas.length===4&&filas[0][0]==='15/10/2026 12:00:07'&&filas[0][1]==='Ana'&&filas[0][2]==='Línea editada'&&filas[0][4]==='15/10/2026 · AP - INSUMOS Y SUMINISTROS'&&filas.some(f=>f[5]==='Cantidad'&&f[6]==='1,000'&&f[7]==='1,500'),'auditoría: una fila por cambio, con fecha/hora de Perú, usuario, acción, conteo y antes → después');
  ok(filas.some(f=>f[2]==='Importación de stock SAP'&&f[5]==='Artículos'&&f[7]==='144')&&au.autoFilter&&/Líneas de conteo/.test(au.getCell('A2').value),'auditoría: importación, filtros y subtítulo con el filtro aplicado');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})();
