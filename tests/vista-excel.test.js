/* Vista previa en Excel (js/nucleo/46-vista-excel.js) y su uso en el Asistente (83) y en el Reporte diario (62b/08). */
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');
const V=require(R+'/js/nucleo/46-vista-excel.js');
const F=(v,f)=>V.formatear(v,f).txt;
ok(F(12420,'#,##0')==='12,420'&&F(0.932,'0.0%')==='93.2%'&&F(7.25,'0.00')==='7.25'&&F(1035.4,'#,##0')==='1,035','formatos: miles, %, decimales');
ok(F(0.3125,'hh:mm')==='07:30'&&F(-1.5,'0.00;[Red]-0.00')==='-1.50'&&V.formatear(-1.5,'0.00;[Red]-0.00').rojo===true,'hh:mm y negativos en rojo');
ok(F(new Date(Date.UTC(2026,10,29)),'dd/mm/yyyy')==='29/11/2026'&&F(46355,'dd/mm/yyyy')==='29/11/2026','fechas (Date y número de serie)');
ok(F(3,undefined)==='3'&&F('texto')==='texto'&&F(null)==='','sin formato, texto y vacío');
ok(V.valorCrudo({formula:'A1+B1',result:42})===42&&V.valorCrudo({richText:[{text:'Ho'},{text:'la'}]})==='Hola','muestra el resultado de las fórmulas y el texto enriquecido');
ok(V.letra(1)==='A'&&V.letra(26)==='Z'&&V.letra(27)==='AA','letras de columna');
const html=leer('index.html'),f83=leer('js/asistente/83-asistente-reportes-pantalla.js'),f73=leer('js/asistente/73-reporte-general.js'),f62b=leer('js/produccion/62b-reporte-diario.js'),f08=leer('js/produccion/08-graficos.js');
ok(/46-vista-excel\.js\?v=/.test(html)&&html.indexOf('46-vista-excel.js')<html.indexOf('73-reporte-general.js')&&html.indexOf('46-vista-excel.js')<html.indexOf('62b-reporte-diario.js'),'index.html carga la vista antes del Asistente y del Reporte diario');
ok(/window\.apRepPrevia=async modo=>\{[\s\S]{0,200}abrirVistaExcel\(\)/.test(f83)&&/glacialVistaExcel\.abrir\(wb/.test(f83)&&/✎ Revisar y corregir/.test(f83)&&/apRepVerExcel/.test(f83),'Asistente: «Previsualizar» abre el Excel; «✎ Revisar y corregir» la corrección de siempre (y vuelve con «Ver como Excel»)');
ok(/asegurarExcelJS,HOJA,FMT\}/.test(f73),'73 entrega su cargador de ExcelJS');
ok(/async function vistaExcel\(\)/.test(f62b)&&/glacialReporteDiario\.vistaExcel\(\)/.test(f08),'Reporte diario: botón «👁 Vista previa Excel»');
// Con ExcelJS (GLX_LIBS): la vista de una hoja real (celdas combinadas, fórmulas, barras, imagen)
let ExcelJS=null;try{ExcelJS=require(process.env.GLX_LIBS?path.join(process.env.GLX_LIBS,'node_modules','exceljs'):'exceljs');}catch(_){ExcelJS=null;}
if(ExcelJS){
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Hoja');
  ws.mergeCells('B2:D2');ws.getCell('B2').value='TÍTULO';ws.getCell('B2').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0B2E4A'}};ws.getCell('B2').font={bold:true,color:{argb:'FFFFFFFF'}};
  ws.getCell('B3').value=8;ws.getCell('C3').value=2;ws.getCell('D3').value={formula:'B3-C3',result:6};ws.getCell('D3').numFmt='0.00';
  ws.getCell('B4').value=-1;ws.addConditionalFormatting({ref:'B4',rules:[{type:'cellIs',operator:'lessThan',formulae:[0],style:{fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFFDECEA'}}}}]});
  ws.getCell('B5').value=50;ws.getCell('B6').value=100;ws.addConditionalFormatting({ref:'B5:B6',rules:[{type:'dataBar',cfvo:[{type:'num',value:0},{type:'max'}],color:{argb:'FF2BA8D8'}}]});
  const id=wb.addImage({base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',extension:'png'});ws.addImage(id,{tl:{col:1,row:7},ext:{width:100,height:50}});
  const h=V.html(ws,wb);
  ok(/colspan="3"/.test(h)&&/background:#0B2E4A/.test(h)&&/>TÍTULO</.test(h),'celdas combinadas con relleno y fuente');
  ok(/title="=B3-C3"[^>]*>[^<]*<span class="vxl-v">6\.00</.test(h),'fórmula: muestra el resultado con su formato y la fórmula al pasar el cursor');
  ok(/background:#FDECEA/.test(h),'formato condicional «menor que 0»');
  ok((h.match(/vxl-barra/g)||[]).length===2&&/width:50%/.test(h)&&/width:100%/.test(h),'barras de datos proporcionales');
  ok(/<img class="vxl-img"[^>]*src="data:image\/png;base64,/.test(h),'imágenes de la hoja');
}else console.log('(sin ExcelJS: se omite la vista de una hoja real)');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
