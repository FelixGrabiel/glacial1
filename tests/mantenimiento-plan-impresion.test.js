/* Mantenimiento · Plan anual · impreso A4 horizontal y exportación a Excel (js/mantenimiento/74-plan-anual-impresion.js). Con datos reales de la hoja SOP. */
'use strict';
const fs=require('fs'),path=require('path');
const I=require('../js/mantenimiento/74-plan-anual-impresion.js');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const M=JSON.parse(fs.readFileSync(path.join(__dirname,'datos','mtto-plan-muestra.json'),'utf8'));
const sop=M.maquinas.find(m=>m.codigo_hoja==='SOP'),acts=M.actividades.filter(a=>a.maquina_id===sop.id);
const html=I.htmlImpresion(sop,acts,2026,'file:///logo.png');

const hojas=(html.match(/<section class="hoja/g)||[]).length;
ok(acts.length===37&&hojas===2,'SOP (37 actividades) sale en 2 hojas A4 horizontales');
const secciones=html.split('<section class="hoja').slice(1);
const filas=s=>(s.match(/<tbody>[\s\S]*<\/tbody>/)[0].match(/<tr/g)||[]).length;
ok(filas(secciones[0])===21&&filas(secciones[1])===16,'hoja 1 = 21 filas (18 semanales + 3 mensuales) · hoja 2 = 16 (8 semestrales + 8 anuales)');
ok(/<frec/.test('')||secciones[0].includes('MENSUAL')&&!secciones[0].includes('SEMESTRAL')&&secciones[1].includes('SEMESTRAL')&&secciones[1].includes('ANUAL')&&!secciones[1].includes('>SEMANAL<'),'los saltos de hoja caen donde en el Excel');
ok(secciones.every(s=>/<thead><tr class="r1">[\s\S]*<tr class="r2">/.test(s)&&/MES\/SEMANA/.test(s)&&/NÚMERO TÉCNICOS/.test(s)),'las dos filas de título (ITEM … MES/SEMANA y E F M A M J J A S O N D) se repiten en cada hoja');
ok(secciones.every(s=>/PLAN\/PROGRAMA MANTENIMIENTO MECÁNICO 2026/.test(s)&&/PLANTA DE AGUA_LÍNEA PET/.test(s)&&/<i>SOPLADORA<\/i>/.test(s)&&/CONSORCIO FRAP S\.A\.C<br>MANTENIMIENTO MECÁNICO<br>CF-CA-PL-002/.test(s)&&/<img src="file:\/\/\/logo.png"/.test(s)),'encabezado de página en cada hoja: logo · título · máquina en cursiva · CONSORCIO FRAP / CF-CA-PL-002');
ok(/@page\{size:A4 landscape;margin:\.3in \.7in \.75in \.7in\}/.test(html)&&/Calibri Light/.test(html)&&/font-size:8pt/.test(html)&&/height:16\.5pt/.test(html)&&/height:22\.5pt/.test(html),'A4 horizontal, márgenes del Excel, Calibri Light 8 pt, filas de 16,5 y 22,5 pt');
ok((secciones[0].match(/colspan="12" class="der">1 - 52</g)||[]).length===18,'las 18 semanales muestran «1 - 52» combinado en F:Q');
ok(html.includes('VETILADOR SOPLADOR / LIMPIEZA')&&html.includes('ELECTROVÁVULAS/REEMPLAZO')&&html.includes('FAJAS DE RODILLLOS')&&(html.match(/<td class="izq">16<\/td>/g)||[]).length===2,'los textos salen tal cual: VETILADOR, ELECTROVÁVULAS, RODILLLOS y el ítem 16 repetido');
ok((html.match(/<tr class="sep">/g)||[]).length===4,'borde mediano debajo del último ítem de SEMANAL, MENSUAL, SEMESTRAL y ANUAL');
ok(!/GLACIAL|Generado|Página|Elaborado|Aprobado|En vivo|Editar/.test(html.replace(/<title>[\s\S]*?<\/title>/,'')),'el impreso no lleva nada de la interfaz de GLACIAL (ni firmas, ni pies de página)');
const mes=secciones[1].match(/<td>9<\/td>/g);ok(!!mes&&secciones[1].includes('<td class="izq">1</td>'),'las semanas van en la columna de su mes con el texto original');
ok(I.paginar(Array.from({length:22})).length===2&&I.paginar([]).length===1&&I.paginar(Array.from({length:21})).length===1,'paginado: 21 filas por hoja (una hoja vacía si no hay actividades)');

/* Excel: solo si hay ExcelJS (GLX_LIBS o EXCELJS_DIST); si no, se omite esta parte */
let ExcelJS=null;
for(const p of [process.env.GLX_LIBS&&path.join(process.env.GLX_LIBS,'node_modules','exceljs'),process.env.EXCELJS_DIST&&path.join(process.env.EXCELJS_DIST,'..'),path.join(__dirname,'..','node_modules','exceljs')].filter(Boolean)){
  try{ExcelJS=require(p);break;}catch(_){/* siguiente */}
}
(async()=>{
  if(!ExcelJS){console.log('(Se omite la comprobación del Excel: falta ExcelJS.)');process.exit(fallas?1:0);}
  const wb=I.libroExcel(ExcelJS,[{maquina:sop,acts}],2026);
  const buf=await wb.xlsx.writeBuffer();
  const rd=new ExcelJS.Workbook();await rd.xlsx.load(buf);
  const ws=rd.getWorksheet('SOP');
  ok(!!ws&&ws.rowCount===39&&ws.getCell('A1').value==='ITEM'&&ws.getCell('F1').value==='MES/SEMANA'&&ws.getCell('F2').value==='E'&&ws.getCell('Q2').value==='D','hoja «SOP» con los títulos y los 12 meses (39 filas como el Excel)');
  const merges=Object.keys(ws._merges||{});
  ok(merges.includes('F1')&&merges.includes('A1')&&merges.includes('F3')&&merges.includes('F20'),'combinadas: A1:A2 … E1:E2, F1:Q1 y «1 - 52» en F:Q de las 18 semanales');
  ok(ws.getCell('F3').value==='1 - 52'&&ws.getCell('F48')!==undefined&&typeof ws.getCell('F21').value==='number','«1 - 52» como texto y las semanas como números');
  ok(ws.getCell('F21').value===1&&ws.getCell('G21').value===5&&ws.getCell('Q21').value===48,'mensuales: semanas 1, 5 … 48 en sus meses');
  ok(Math.abs(ws.getColumn(2).width-35.29)<.01&&Math.abs(ws.getColumn(17).width-4.29)<.01&&ws.getRow(1).height===16.5&&ws.getRow(3).height===22.5,'anchos de columna y alturas de fila del Excel');
  ok(ws.pageSetup.orientation==='landscape'&&ws.pageSetup.paperSize===9&&ws.pageSetup.fitToWidth===1&&ws.pageSetup.fitToHeight===0&&Math.abs(ws.pageSetup.margins.top-.9239)<.001&&ws.pageSetup.printTitlesRow==='1:2','A4 horizontal, 1 página de ancho, márgenes y filas 1:2 repetidas');
  ok(/PLAN\/PROGRAMA MANTENIMIENTO MECÁNICO 2026/.test(ws.headerFooter.oddHeader)&&/CF-CA-PL-002/.test(ws.headerFooter.oddHeader)&&/SOPLADORA/.test(ws.headerFooter.oddHeader),'encabezado de página del Excel');
  ok(ws.getCell('A3').border.left.style==='medium'&&ws.getCell('A1').border.top.style==='medium'&&ws.getCell('G2').border.bottom.style==='medium'&&ws.getCell('B3').border.top.style==='thin','bordes: medianos a la izquierda, arriba y bajo los meses; finos adentro');
  ok(ws.getCell('B20').border.bottom.style==='medium'&&ws.getCell('B23').border.bottom.style==='medium'&&ws.getCell('B39').border.bottom.style==='medium'&&ws.getCell('B19').border.bottom.style==='thin','borde mediano al final de cada bloque');
  ok(ws.getCell('Q3').border.right.style==='medium'&&ws.getCell('Q30').border.right.style==='medium','borde mediano a la derecha de la columna Q');
  ok(ws.getCell('B3').font.name==='Calibri Light'&&ws.getCell('B3').font.size===8,'Calibri Light 8 pt');
  process.exit(fallas?1:0);
})();
