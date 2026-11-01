/* Control de proceso en el envasado (CF - CA - F - 047): núcleo (filas del mes, hojas por marca, lote de producción, lotes de insumo), libro Excel con el formato del Drive
   (se compara con el libro original «C.P_BIDON_7L-OCTUBRE») e integración. Solo LEE reportes; no toca producción, stock SAP ni tareo. Necesita «exceljs» (EXCELJS o NODE_PATH); sin él se omite el Excel. */
'use strict';
const fs=require('fs'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const P=require('../js/asistente/90-control-proceso-nucleo.js');
require('../js/asistente/70-asistente-nucleo.js');const A=globalThis.glacialAsistenteNucleo;

/* ---------- reportes de ejemplo: las 6 filas de la hoja SCALA del libro original ---------- */
const LOTES_SCALA=[{categoria:'preformas',loteProveedor:'2605008F300'},{categoria:'tapas',loteProveedor:'30/05-B'},{categoria:'etiquetas',loteProveedor:'0468-26'},{categoria:'asas',loteProveedor:'01/06-B'}];
const cuadro=(o={})=>({estadoCuadro:'FINALIZADO',numero:1,marca:'SCALA',presentacion:'7L',lote:'CF3',fechaVencimiento:'2027-10-01',produccion:{programada:0,efectiva:0,sopladas:0,calidad:0,paletas:0},lotesInsumo:LOTES_SCALA,...o,produccion:{programada:0,efectiva:0,sopladas:0,calidad:0,paletas:0,...(o.produccion||{})}});
const reg=(fecha,turno,cuadros,linea='B7L')=>({id:'r-'+fecha+turno,fecha,turno,linea,cuadros});
const REG=[
  reg('2026-10-01','DÍA',[cuadro({fechaVencimiento:'2027-10-01',produccion:{efectiva:6552,sopladas:6552}})]),
  reg('2026-10-01','NOCHE',[cuadro({fechaVencimiento:'2027-10-02',produccion:{efectiva:5808,sopladas:5808}})]),
  reg('2026-10-02','DÍA',[cuadro({fechaVencimiento:'2027-10-02',produccion:{efectiva:3608,sopladas:3608}})]),
  reg('2026-10-05','DÍA',[cuadro({fechaVencimiento:'2027-10-05',produccion:{efectiva:5718,sopladas:5718}})]),
  reg('2026-10-05','NOCHE',[cuadro({fechaVencimiento:'2027-10-06',produccion:{efectiva:5355,sopladas:5355}})]),
  reg('2026-10-06','NOCHE',[cuadro({fechaVencimiento:'2027-10-07',produccion:{efectiva:4546,sopladas:4546}})])
];
const ORIGINAL_SCALA=[['CF3-01102027',6552,'2026-10-01','D'],['CF3-02102027',5808,'2026-10-01','N'],['CF3-02102027',3608,'2026-10-02','D'],['CF3-05102027',5718,'2026-10-05','D'],['CF3-06102027',5355,'2026-10-05','N'],['CF3-07102027',4546,'2026-10-06','N']];

/* ================= núcleo ================= */
ok(P.ddmmaaaa('2027-10-01')==='01102027'&&P.ddmmaaaa('2027-12-31')==='31122027'&&P.ddmmaaaa('2027-02-30')===''&&P.ddmmaaaa('')===''&&P.ddmmaaaa(null)==='','vencimiento → DDMMAAAA (fechas imposibles o vacías no valen)');
ok(P.lotePT({lote:'CF3'},{fecha:'2026-10-01',turno:'DÍA'})==='CF3-01102027'&&P.lotePT({lote:'CF3'},{fecha:'2026-10-01',turno:'NOCHE'})==='CF3-02102027'&&P.lotePT({lote:'CF3'},{fecha:'2026-12-31',turno:'NOCHE'})==='CF3-01012028'&&P.lotePT({lote:'CF3',fechaVencimiento:'2027-05-09'},{fecha:'2026-10-01',turno:'DÍA'})==='CF3-09052027','sin vencimiento en el cuadro se calcula: un año después, y la noche con la fecha del día siguiente');
ok(P.lotePT({lote:'CF3',fechaVencimiento:'2027-10-01'})==='CF3-01102027'&&P.lotePT({lote:'CF3'})==='CF3'&&P.lotePT({lote:'',fechaVencimiento:'2027-10-01'})===''&&P.lotePT({lote:' 2-1 ',fechaVencimiento:'2027-10-01'})==='2-1-01102027','lote de producción como en el Drive: código + «-» + vencimiento (sin vencimiento, solo el código)');
ok(P.turnoLetra('DÍA')==='D'&&P.turnoLetra('INTERMEDIO')==='D'&&P.turnoLetra('NOCHE')==='N'&&P.turnoLetra('noche')==='N'&&P.turnoLetra('')==='','turno: D (día e intermedio) o N (noche)');
ok(P.claveCuadro('2026-10-01','DÍA','B7L','Scala','7L')===A.claveCuadro('2026-10-01','DÍA','B7L','Scala','7L')&&P.claveCuadro('2026-10-01','INTERMEDIO','B7L','Scala','7L')===A.claveCuadro('2026-10-01','INTERMEDIO','B7L','Scala','7L'),'la clave del cuadro es la misma que usa el Asistente de Producción');
{
  const l=P.lotesDelCuadro(cuadro({lotesInsumo:[{categoria:'tapas',loteProveedor:'30/05-B'},{categoria:'tapas',loteProveedor:'31/05-A'},{categoria:'tapas',loteProveedor:'30/05-B'},{categoria:'preformas',loteProveedor:'2605008F300'},{categoria:'otro',loteProveedor:'X'},{categoria:'asas',loteProveedor:''}]}));
  ok(l.tapa==='30/05-B + 31/05-A'&&l.preforma==='2605008F300'&&l.etiqueta===''&&l.asa==='','lotes del cuadro por categoría: si se cambió de lote salen unidos con « + » sin repetir; categorías que no son del formulario o sin lote se ignoran');
  ok(P.lotesDelCuadro({}).preforma===''&&P.lotesDelCuadro(null).tapa==='','un cuadro sin lotes registrados no rompe: columnas vacías');
}
{
  const f=P.filasDeRegistros(REG,{linea:'B7L',anio:2026,mes:10});
  ok(f.length===6&&f.every((x,i)=>x.lotePT===ORIGINAL_SCALA[i][0]&&x.envasado===ORIGINAL_SCALA[i][1]&&x.fecha===ORIGINAL_SCALA[i][2]&&x.turno===ORIGINAL_SCALA[i][3]),'las 6 filas de la hoja SCALA del Drive se reproducen: lote de producción, cantidad, fecha y turno');
  ok(f[0].preforma==='2605008F300'&&f[0].tapa==='30/05-B'&&f[0].etiqueta==='0468-26'&&f[0].asa==='01/06-B'&&f[0].sinLotes.length===0&&f[0].soplado===6552&&f[0].empaquetado===6552,'lotes de insumo y cantidades de soplado / envasado / empaquetado por defecto');
  ok(P.filasDeRegistros(REG,{linea:'B7L',anio:2026,mes:11}).length===0&&P.filasDeRegistros(REG,{linea:'PET1',anio:2026,mes:10}).length===0&&P.filasDeRegistros(REG,{linea:'B7L',anio:2025,mes:10}).length===0,'solo entran los reportes de esa línea y de ese mes');
  const mezcla=[reg('2026-10-03','NOCHE',[cuadro({numero:2,produccion:{efectiva:10}}),cuadro({numero:1,produccion:{efectiva:20}})]),reg('2026-10-03','DÍA',[cuadro({produccion:{efectiva:30}})]),reg('2026-09-30','DÍA',[cuadro({produccion:{efectiva:1}})]),
    reg('2026-10-04','DÍA',[cuadro({produccion:{programada:500}}),cuadro({marca:'',produccion:{efectiva:5}}),cuadro({numero:3,produccion:{sopladas:7}})]),reg('2026-10-03','DÍA',null),null,{}];
  const g=P.filasDeRegistros(mezcla,{linea:'B7L',anio:2026,mes:10});
  ok(g.map(x=>x.turno+x.numero).join()==='D1,N1,N2,D3','orden: fecha, luego día antes que noche, luego n.º de cuadro; el cuadro solo programado y el que no tiene marca no entran; uno con solo sopladas sí');
  const mp=P.filasDeRegistros([reg('2026-10-01','DÍA',[cuadro({produccion:{sopladas:7000,efectiva:6900}})])],{linea:'B7L',anio:2026,mes:10});
  ok(mp[0].soplado===7000&&mp[0].envasado===6900&&mp[0].empaquetado===6900,'por defecto: soplado = botellas sopladas; envasado y empaquetado = producción efectiva');
  const mc=P.filasDeRegistros([reg('2026-10-01','DÍA',[cuadro({produccion:{sopladas:7000,efectiva:6900}})])],{linea:'B7L',anio:2026,mes:10,mapeo:{soplado:'efectiva'}});
  ok(mc[0].soplado===6900,'el origen de cada CANT es configurable (mapeo)');
  const sin=P.filasDeRegistros([reg('2026-10-01','DÍA',[cuadro({lotesInsumo:[{categoria:'tapas',loteProveedor:'T1'}],produccion:{efectiva:5}})])],{linea:'B7L',anio:2026,mes:10});
  ok(sin[0].sinLotes.join()==='preforma,etiqueta,asa'&&sin[0].tapa==='T1','una fila sabe qué lotes de insumo le faltan');
}
{
  const u=new Set();
  ok(P.nombreHoja('SCALA',u)==='SCALA'&&P.nombreHoja('scala',u)==='scala (2)'&&P.nombreHoja('A/B?[C]:*D',new Set())==='A B C D'&&P.nombreHoja('X'.repeat(40),new Set()).length===31&&P.nombreHoja('',new Set())==='SIN MARCA','nombre de hoja válido: sin caracteres prohibidos, máximo 31 y sin repetirse');
  const m=P.modeloMes(REG.concat([reg('2026-10-07','DÍA',[cuadro({marca:'Bells',produccion:{efectiva:1200},lotesInsumo:[],fechaVencimiento:''}),cuadro({numero:2,marca:'Aro',produccion:{efectiva:900}})])]),{linea:'B7L',anio:2026,mes:10});
  ok(!m.error&&m.total===8&&m.hojas.map(h=>h.nombre).join()==='ARO,BELLS,SCALA'&&m.hojas[2].filas.length===6&&m.hojas[2].presentacion==='7L','el modelo del mes tiene una hoja por marca (orden alfabético) con sus filas');
  ok(m.archivo==='C.P_BIDON_7L-OCTUBRE-2026.xlsx'&&m.sinLotes===1&&m.sinLotesPorColumna.preforma===1&&m.sinVencimiento===0&&m.mesNombre==='OCTUBRE'&&m.nombreLinea==='BIDÓN 7L','nombre del archivo como el del Drive; cuenta las filas sin lotes de insumo y sin vencimiento');
  ok(P.modeloMes(REG,{linea:'PET1',anio:2026,mes:10}).error&&P.modeloMes(REG,{linea:'B7L',anio:2026,mes:13}).error&&P.modeloMes(REG,{linea:'B7L',anio:1999,mes:1}).error&&P.modeloMes(null,{linea:'B7L',anio:2026,mes:10}).total===0,'una línea sin formulario o un mes no válido da error claro; sin reportes, cero filas');
  ok(P.FORMULARIO.codigo==='CF - CA - F - 047'&&P.FORMULARIO.titulo==='CONTROL DE PORCESO EN EL ENVASADO'&&P.MESES.length===12&&P.MESES[9]==='OCTUBRE','el formulario conserva su código y su título tal como están en el Drive');
}

/* ================= Excel (formato del Drive) ================= */
let ExcelJS=null;try{ExcelJS=require(process.env.EXCELJS||'exceljs');}catch(_){console.log('Se omite el Excel: falta el paquete exceljs (EXCELJS).');}
(async()=>{
  if(ExcelJS){
    const X=require('../js/asistente/91-control-proceso-excel.js');
    const logo=(/GLACIAL_LOGO_BASE64\s*=\s*"([^"]+)"/.exec(leer('js/nucleo/00-logo.js'))||[])[1];
    const REGISTROS=REG.concat([reg('2026-10-07','DÍA',[cuadro({marca:'Bells',produccion:{efectiva:1200}})])]);
    const modelo=P.modeloMes(REGISTROS,{linea:'B7L',anio:2026,mes:10});
    const wb=X.construirLibro(ExcelJS,modelo,{logoBase64:logo,logoRatio:205/129});
    const buf=await wb.xlsx.writeBuffer();
    const rd=new ExcelJS.Workbook();await rd.xlsx.load(buf);
    ok(rd.worksheets.map(w=>w.name).join()==='BELLS,SCALA','el libro tiene una hoja por marca');
    const ws=rd.getWorksheet('SCALA');
    ok(ws.getCell('B1').value===P.FORMULARIO.titulo&&ws.getCell('K1').value==='CF - CA - F - 047'&&ws.getCell('B1').font.size===28&&ws.getCell('B1').font.bold&&ws.getCell('K1').font.size===18,'título (28 negrita) y código del formulario (18 negrita) como en el original');
    const merges=[...ws.model.merges].sort().join();
    ok(merges===['B1:J3','B5:C5','B7:G7','E5:F5','H7:J7','I5:K5','K1:O3','K7:L7','M7:O7'].sort().join(),'las 9 celdas combinadas del original: título, código, PRODUCTO, PRESENTACION y los 4 grupos');
    ok(ws.getCell('B5').value==='PRODUCTO:'&&ws.getCell('E5').value==='SCALA'&&ws.getCell('I5').value==='PRESENTACION:'&&ws.getCell('L5').value==='7L','PRODUCTO: SCALA · PRESENTACION: 7L');
    ok(ws.getCell('B7').value==='SOPLADO '&&ws.getCell('H7').value==='ENVASADO '&&ws.getCell('K7').value==='ETIQUETADO'&&ws.getCell('M7').value==='EMPAQUETADO','grupos SOPLADO · ENVASADO · ETIQUETADO · EMPAQUETADO');
    const enc=[];for(let c=1;c<=16;c++)enc.push(ws.getCell(8,c).value);
    ok(enc.join('|')==='LOTE PROD|MAN|LAV|LLEN|L.PREFORMA|CIERRE|CANT|CANT|L. TAPA|CONF|LOTE |ROTUL|LOTE ASA|CONF|CANT|FECHA','encabezados A…P idénticos a los del Drive');
    const ancho=[12.89,5.33,5.33,5.33,13,6.89,7.89,8,11.55,6.11,9,6.89,9.44,6.89,9.89,11.89,10.66];
    ok(ancho.every((w,i)=>Math.abs((ws.getColumn(i+1).width||9)-w)<0.01),'anchos de columna del original');
    ok(ws.getRow(1).height===27&&ws.getRow(9).height===15.75&&ws.getColumn(18).hidden===true,'alturas de fila del original y la clave del cuadro en una columna oculta');
    for(let i=0;i<6;i++){
      const r=9+i,o=ORIGINAL_SCALA[i];
      const fecha=ws.getCell(r,16).value;
      ok(ws.getCell(r,1).value===o[0]&&ws.getCell(r,5).value==='2605008F300'&&ws.getCell(r,7).value===o[1]&&ws.getCell(r,8).value===o[1]&&ws.getCell(r,9).value==='30/05-B'&&ws.getCell(r,11).value==='0468-26'&&ws.getCell(r,13).value==='01/06-B'&&ws.getCell(r,15).value===o[1]&&fecha.toISOString().slice(0,10)===o[2]&&ws.getCell(r,17).value===o[3],'fila '+r+' igual a la del Drive: '+o[0]+' · '+o[1]+' · '+o[2]+' · '+o[3]);
    }
    ok(['B','C','D','F','J','L','N'].every(c=>[9,10,11,12,13,14].every(r=>ws.getCell(c+r).value===null||ws.getCell(c+r).value===undefined)),'MAN, LAV, LLEN, CIERRE y los CONF / ROTUL quedan vacíos para planta');
    ok(ws.getCell(9,18).value==='r-2026-10-01DÍA#1','la clave de la fila (reporte + n.º de cuadro) viaja oculta en la columna R');
    ok(ws.getCell('A9').border.left.style==='thin'&&ws.getCell('P9').border.bottom.style==='thin'&&ws.getCell('A30').border.top.style==='thin'&&ws.getCell('A30').value===null&&!(ws.getCell('A31').border&&ws.getCell('A31').border.top),'filas con borde fino y, como el formulario impreso, se completan filas vacías (hasta 22: caben en una hoja A4 horizontal)');
    ok(ws.getCell('P9').numFmt==='dd/mm/yyyy'&&ws.getCell('G9').numFmt==='#,##0','fecha dd/mm/aaaa y cantidades con separador de miles');
    ok(ws.pageSetup.orientation==='landscape'&&ws.pageSetup.paperSize===9&&ws.views[0].ySplit===8&&ws.getImages().length===1,'A4 horizontal, encabezado fijo y el logo de GLACIAL');
    const bells=rd.getWorksheet('BELLS');
    ok(bells.getCell('E5').value==='BELLS'&&bells.getCell('A9').value==='CF3-01102027'&&bells.getCell('H9').value===1200,'cada marca va en su hoja con su nombre en PRODUCTO:');
    const sinLogo=X.construirLibro(ExcelJS,modelo,{});
    ok((await sinLogo.xlsx.writeBuffer()).length>0,'sin logo disponible igual se genera el libro');
  }

  /* ================= integración ================= */
  const html=leer('index.html'),pos=n=>html.indexOf('js/asistente/'+n);
  ok(pos('90-control-proceso-nucleo.js')>pos('89-trazabilidad-lotes-pantalla.js')&&pos('91-control-proceso-excel.js')>pos('90-control-proceso-nucleo.js')&&pos('91-control-proceso-excel.js')<html.indexOf('js/nucleo/12-init.js'),'index.html carga 90 y 91 después de Lotes y antes de 12-init');
  const p89=leer('js/asistente/89-trazabilidad-lotes-pantalla.js'),p76=leer('js/asistente/76-inventario-insumos-pantalla.js');
  ok(/iiControlProcesoUI/.test(p89)&&/CP\.html\(\)/.test(p89)&&/iiControlProcesoUI\.css/.test(p76),'la tarjeta vive en la pestaña Lotes y sus estilos viajan con los del Inventario');
  const codigo=['90-control-proceso-nucleo','91-control-proceso-excel'].map(n=>leer('js/asistente/'+n+'.js')).join('\n');
  ok(!/saveRecords|db\.collection|runTransaction|insumosCortes|insumosConteos|insumosCatalogo|apMovimientos|tareo/i.test(codigo.replace(/Solo LEE[^\n]*|NO toca[^\n]*|no modifica[^\n]*/gi,'')),'solo lee reportes: no escribe en ninguna colección ni toca stock SAP, producción o tareo');
  const doc=leer('docs/asistente/control-proceso-drive.md');
  ok(/CF - CA - F - 047/.test(doc)&&/MAN/.test(doc)&&/Etapa 3/.test(doc)&&/Preguntas abiertas/i.test(doc),'el documento de diseño existe y recoge el formulario, la Etapa 3 y las preguntas abiertas');
  { // solo entran los cuadros finalizados (FINALIZAR MARCA) o de un reporte finalizado
    const R=(id,est,cuadros)=>({id,fecha:'2026-10-09',turno:'DÍA',linea:'B7L',estadoRegistro:est,cuadros});
    const C=(n,est)=>cuadro({numero:n,marca:'SCALA',estadoCuadro:est,produccion:{efectiva:100,sopladas:100}});
    const m=P.modeloMes([R('a','EN_REGISTRO',[C(1,'FINALIZADO'),C(2,'ABIERTO'),C(3,undefined)]),R('b','FINALIZADO',[C(1,'ABIERTO'),C(2,undefined)]),R('c','REABIERTO',[C(1,'ABIERTO')])],{linea:'B7L',anio:2026,mes:10});
    ok(m.total===3&&m.sinFinalizar===3&&P.cuadroFinalizado({estadoRegistro:'FINALIZADO'},{})&&!P.cuadroFinalizado({estadoRegistro:'EN_REGISTRO'},{estadoCuadro:'ABIERTO'}),'solo entran los cuadros finalizados o de un reporte finalizado; los demás se cuentan como «sin finalizar»');
  }
  console.log(fallas?('\n'+fallas+' fallas'):'\ntodo correcto');
})();

