/* Excel del Reporte diario (62c-reporte-diario-excel.js): 3 hojas, fórmulas vivas, imagen y tabla de datos.
   Necesita ExcelJS: GLX_LIBS=/ruta (con node_modules/exceljs). Sin la librería, solo revisa la conexión con la página. */
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');
const html=leer('index.html'),f08=leer('js/produccion/08-graficos.js'),f62b=leer('js/produccion/62b-reporte-diario.js');
ok(html.indexOf('62c-reporte-diario-excel.js?v=')>html.indexOf('62b-reporte-diario.js?v='),'index.html carga 62c después de 62b');
ok(/async function exportarExcel\(\)\{\n  if\(window\.glacialReporteDiario[\s\S]{0,200}return exportarExcelDetallado\(\);\n\}\nasync function exportarExcelDetallado\(\)\{/.test(f08),'«Exportar Excel» baja el Reporte diario; el libro anterior queda en «Excel detallado»');
ok(/glacialReporteDiario\.compartir\('xlsx'\)/.test(f08)&&/exportarExcelDetallado\(\)"/.test(f08)&&/async function exportarExcel\(\)\{/.test(f62b),'botones «Enviar Excel por WhatsApp» y «Excel detallado»');

const LIBS=process.env.GLX_LIBS;
let ExcelJS=null;try{ExcelJS=require(LIBS?path.join(LIBS,'node_modules','exceljs'):'exceljs');}catch(_){ExcelJS=null;}
if(!ExcelJS){console.log('(sin ExcelJS: se omite la generación del libro)');console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);}
const X=require(R+'/js/produccion/62c-reporte-diario-excel.js');
const col=(o)=>Object.assign({marca:'Scala',presentacion:'7L',ratioNominal:600,lote:'CF3',vencimiento:'29/11/2027',inicio:'07:00',fin:'15:00',horas:8,pProg:0.5,pNoProg:0.25,horasEfectivas:7.25,
  programada:6500,efectiva:6210,secundaria:7520,calidad:3,ratioReal:776.25,ratioSin:6210/7.25,diferencia:6210/7.25-776.25,noCumplida:290,paletas:49},o||{});
const dias=[['Lun','23/11'],['Mar','24/11'],['Mié','25/11'],['Jue','26/11'],['Vie','27/11'],['Sáb','28/11'],['Dom','29/11']];
const v=a=>a.concat(Array(7-a.length).fill(null));
const m={linea:'B7L',nombre:'BIDONES 7 L',unidad:'bidones',unidadRatio:'B/H',fecha:'2026-11-29',fechaTexto:'29/11/2026',diaSemana:'DOMINGO',bloque:'NOCHE',numeroSemana:48,juliano:333,estado:'CERRADO',
  turno:{ingreso:'19:00',salida:'07:00',personas:2,horasProduccion:12,horasEfectivas:10.5,pProg:1,pNoProg:0.5,registradoPor:'Félix López'},
  columnas:[col(),col({marca:'Aro',lote:'CF5',inicio:'23:00',fin:'03:00',horas:4})],secundaria:'Bidones soplados',calidadTitulo:'Bidones calidad',
  total:{programada:13000,efectiva:12420,nominal:7200,noCumplida:580,ratioSin:1182.9,ratioReal:1035,diferencia:147.9,horasHombre:24},
  indicadores:[{etiqueta:'Disponib.',clave:'disponibilidad',valor:93.1,nivel:'verde',meta:90},{etiqueta:'OEE',clave:'oee',valor:null,nivel:'gris',meta:85}],
  mermas:[{item:'Bidones',pct:1.2}],mermasDetalle:[{item:'Bidones',peso:3,unidades:74,pct:1.2},{item:'Asa',peso:0,unidades:0,pct:0}],insumos:[['Planchas de cartón',888]],
  semana:{dias,prod:{'DÍA':v([6648,6796]),NOCHE:v([null,null,null,null,null,7114])},sec:{'DÍA':v([4302]),NOCHE:v([])},pers:{'DÍA':v([11,11]),NOCHE:v([])},totDia:v([6648,6796,null,null,null,7114]),totSec:v([4302]),totalSemana:20558,totalSec:4302,totalDia:13444,totalNoche:7114},
  requerido:11,paradasDetalle:[{marca:'Scala',tipo:'PROGRAMADA',descripcion:'Encendido',causa:'',minutos:30},{marca:'Aro',tipo:'NO PROGRAMADA',descripcion:'Falla',causa:'Falla de máquina',minutos:15}],
  personalLista:[{posicion:'Sopladora 1',nombre:'Ana',cargo:'OPERARIO'},{posicion:'Líder',nombre:'Carlos',cargo:'LÍDER'}],observaciones:['Todo normal'],firmas:{lider:'Carlos',supervisor:'Félix López'}};
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const wb=X.construir(ExcelJS,m,{imagenPng:png,imagenAncho:1,imagenAlto:1});
ok(wb.worksheets.map(w=>w.name).join('|')==='Reporte diario|Gráficos|Datos','tres hojas: Reporte diario, Gráficos y Datos');
const ws=wb.getWorksheet('Reporte diario');
const formulas=[];ws.eachRow(r=>r.eachCell(c=>{if(c.formula)formulas.push([c.address,c.formula,c.result]);}));
const f=t=>formulas.find(x=>x[1].includes(t));
ok(f('MOD(')&&/MOD\(\w+\d+-\w+\d+,1\)\*24/.test(f('MOD(')[1]),'horas de producción con fórmula (cruza la medianoche con MOD)');
const aro=formulas.filter(x=>/^J/.test(x[0])&&/MOD\(/.test(x[1]))[0];
ok(aro&&aro[2]===4,'el formato que cruza la medianoche (23:00 → 03:00) da 4 h');
ok(formulas.some(x=>/IFERROR\(\w+\d+\/\w+\d+,0\)/.test(x[1])&&Math.abs(x[2]-776.25)<1e-9),'ratio real = efectiva ÷ horas de producción (fórmula)');
ok(formulas.some(x=>/^MAX\(0,\w+\d+-\w+\d+\)$/.test(x[1])&&x[2]===290),'no cumplida = MAX(0, programada − efectiva)');
ok(formulas.filter(x=>/^SUM\(/.test(x[1])).length>=4,'totales del turno, paradas y semana con SUM');
ok((ws.conditionalFormattings||ws._conditionalFormattings||[]).length>=2||JSON.stringify(ws.model.conditionalFormattings||[]).includes('lessThan'),'formato condicional: horas efectivas negativas en rojo y barras de datos');
let textos='';ws.eachRow(r=>r.eachCell(c=>{if(typeof c.value==='string')textos+=c.value+'|';}));
ok(/BIDONES 7 L/.test(textos)&&/TURNO NOCHE/.test(textos)&&/PARADAS DEL TURNO/.test(textos)&&/PERSONAL — SEMANA 48/.test(textos)&&/Carlos/.test(textos),'encabezado, paradas, personal, semana y firmas');
ok(/— Sin dato/.test(textos)&&/✔ En meta/.test(textos),'semáforo de indicadores (en meta / sin dato)');
ok(wb.getWorksheet('Gráficos').getImages().length===1,'la hoja Gráficos lleva la imagen del reporte');
const wd=wb.getWorksheet('Datos');
ok(wd.getCell('D2').value==='Scala'&&wd.getCell('D3').value==='Aro'&&wd.getCell('O2').value===6210,'Datos: una fila por formato');
ok(ws.pageSetup.fitToWidth===1&&ws.pageSetup.paperSize===9,'impresión A4 en una página de ancho');
wb.xlsx.writeBuffer().then(b=>{ok(b.byteLength>5000,'el libro se escribe ('+b.byteLength+' bytes)');console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);});
