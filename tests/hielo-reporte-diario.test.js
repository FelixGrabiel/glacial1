/* Reporte diario de Hielo (js/hielo/99-hielo-reporte-diario.js): el modelo reproduce el Excel de la planta del 19/11/2026
   (noche 18/11 + día 19/11). node tests/hielo-reporte-diario.test.js   (la parte de Excel usa GLX_LIBS/node_modules/exceljs si existe) */
'use strict';
const fs=require('fs'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const H=require('../js/hielo/97-hielo.js'),RD=require('../js/hielo/99-hielo-reporte-diario.js');
const CATALOGO=[['Certificado','3 kg'],['Rappi','3 kg'],['Glacial','3 kg'],["Bell's",'3 kg'],['Listo','3 kg'],['Tottus CD','3 kg'],['Cusine & Co','3 kg'],['Molitalia','3 kg'],['Hoteles','3 kg'],['Precio Uno','1.5 kg'],['Glacial','1.5 kg'],['Scala','1.5 kg'],['Listo','1.5 kg'],['Austral','1.5 kg']];
const L=(marca,presentacion,bolsas,lote)=>({marca,presentacion,bolsas,lote:lote||''});
/* Reporte de la planta: NOCHE 18/11 (9,350.25 kg de 3 kg + 2,100 kg de 1.5 kg) y DÍA 19/11 (11,960 kg + 3,150 kg). */
const noche={id:'2026-11-18_NOCHE',fecha:'2026-11-18',turno:'NOCHE',estado:'FINALIZADO',supervisor:'Mark Murayari',horaInicio:'21:00',horaFin:'07:00',
  produccion:[L('Rappi','3 kg',680,'11147323'),L("Bell's",'3 kg',1897,'16147323'),L('Molitalia','3 kg',300,'21347322'),L('Glacial','1.5 kg',600,'11147323'),L('Listo','1.5 kg',600,'17147323')],
  paradas:[{motivo:'Falla de equipo',equipo:'Envasadora',minutos:260}],observaciones:'ENVASADORA AUTOMATICA PRESENTA PARADAS CONSTANTE'};
const dia={id:'2026-11-19_DÍA',fecha:'2026-11-19',turno:'DÍA',estado:'FINALIZADO',supervisor:'Yeikari Marquez',horaInicio:'07:00',horaFin:'19:00',
  produccion:[L('Rappi','3 kg',520,'21147323'),L('Glacial','3 kg',750,'21147323'),L('Cusine & Co','3 kg',1500,'22147323'),L('Molitalia','3 kg',310),L('Hoteles','3 kg',600,'21147323'),L('Glacial','1.5 kg',1200,'21147323'),L('Listo','1.5 kg',600,'27147323')],
  paradas:[{motivo:'Falla de equipo',minutos:30},{motivo:'Otros',minutos:10}],observaciones:'M5 ENCENDIDA 12:35PM'};
const otra=Object.assign({},dia,{id:'2026-11-12_DÍA',fecha:'2026-11-12'});
const cfg=H.DEFECTO;
const m=RD.modelo({fecha:'2026-11-19',reportes:[noche,dia,otra],cfg,catalogo:CATALOGO});

ok(RD.semanaISO('2026-11-19')===47&&RD.semanaISO('2026-01-01')===1&&RD.semanaISO('2026-12-31')===53,'semana ISO: 19/11/2026 es la semana 47');
ok(RD.sumar('2026-03-01',-1)==='2026-02-28'&&RD.diaSemana('2026-11-15')===0&&RD.diaSemana('2026-11-19')===4,'fechas: sumar días y día de la semana (15/11 es domingo)');
ok(m.fNoche==='2026-11-18'&&m.semanaNum===47&&/^jueves, 19 de noviembre de 2026$/.test(m.fechaLarga),'el día de producción 19/11 usa la noche del 18/11 y se llama «jueves, 19 de noviembre de 2026»');
ok(m.noche.kg===11450.25&&m.dia.kg===15110&&m.totalDiaKg===26560.25,'kilos del Excel: noche 11,450.25 · día 15,110.00 · total 26,560.25');
ok(m.noche.eficiencia===33.68&&m.dia.eficiencia===44.44,'eficiencia: 33.68 % la noche y 44.44 % el día (con 34,000 kg por turno)');
ok(m.filas.length===14&&m.filas.map(f=>f.etiqueta).join('|').startsWith('CERTIFICADO (3KG)|RAPPI (3KG)|GLACIAL (3KG)|BELL\'S (3KG)')&&m.filas[13].etiqueta==='AUSTRAL (1.5KG)','las 14 filas del catálogo, en el orden del Excel');
const fila=n=>m.filas.find(f=>f.etiqueta===n);
ok(fila('RAPPI (3KG)').noche.bolsas===680&&fila('RAPPI (3KG)').noche.kg===2210&&fila('RAPPI (3KG)').noche.paletas===2.27&&fila('RAPPI (3KG)').noche.lote==='11147323','Rappi noche: 680 bolsas, 2,210 kg, 2.27 paletas, lote 11147323');
ok(fila("BELL'S (3KG)").noche.kg===6165.25&&fila("BELL'S (3KG)").noche.paletas===6.32,"Bell's noche: 6,165.25 kg y 6.32 paletas");
ok(fila('GLACIAL (3KG)').dia.kg===2437.5&&fila('GLACIAL (3KG)').dia.paletas===2.5&&fila('MOLITALIA (3KG)').dia.paletas===1.03&&fila('HOTELES (3KG)').dia.kg===1950,'día: Glacial 3 kg 2,437.5 kg / 2.50 paletas · Molitalia 1.03 · Hoteles 1,950 kg');
ok(fila('GLACIAL (1.5KG)').noche.kg===1050&&fila('GLACIAL (1.5KG)').noche.paletas===1&&fila('LISTO (1.5KG)').dia.paletas===1,'1.5 kg: 600 bolsas = 1,050 kg = 1.00 paleta (600 por paleta)');
ok(fila('CERTIFICADO (3KG)').noche.bolsas===0&&fila('CERTIFICADO (3KG)').dia.kg===0,'una marca sin producción queda en blanco (bolsas 0)');
const pr=p=>m.presentaciones.find(x=>x.presentacion===p);
ok(pr('3 kg').noche.bolsas===2877&&pr('3 kg').noche.kg===9350.25&&pr('1.5 kg').noche.bolsas===1200&&pr('1.5 kg').noche.kg===2100,'resumen por presentación, noche: 2,877 bolsas = 9,350.25 kg y 1,200 = 2,100 kg (como la hoja 2 del Excel)');
ok(pr('3 kg').dia.bolsas===3680&&pr('3 kg').dia.kg===11960&&pr('1.5 kg').dia.bolsas===1800&&pr('1.5 kg').dia.kg===3150,'resumen por presentación, día: 3,680 = 11,960 kg y 1,800 = 3,150 kg');
ok(m.noche.supervisor==='Mark Murayari'&&m.noche.ingreso==='21:00'&&m.noche.salida==='07:00'&&m.noche.jornadaH===10&&m.dia.jornadaH===12,'turno: supervisor, ingreso, salida y jornada (la noche cruza la medianoche)');
// Semana
ok(m.semana.inicio==='2026-11-15'&&m.semana.fin==='2026-11-21'&&m.semana.dias.map(d=>d.nombre).join()===RD.DIAS.join(),'semana de domingo 15/11 a sábado 21/11');
const mie=m.semana.dias[3];
ok(mie.fechaTN==='2026-11-18'&&mie.fechaTD==='2026-11-19'&&mie.kgTN===11450.25&&mie.kgTD===15110&&mie.total===26560.25&&mie.actual,'miércoles = noche 18/11 + día 19/11 = 26,560.25 kg (el día del reporte)');
const dom=m.semana.dias[0];
ok(!dom.hayDatos&&dom.total===0,'un día sin reportes queda sin datos');
const mar=m.semana.dias.find(d=>d.fechaTD==='2026-11-12')||null;
ok(!mar,'el día 12/11 es de OTRA semana y no entra en esta');
ok(m.totalSemanaKg===26560.25&&m.semana.promedio===26560.25,'total y promedio de la semana con lo registrado');
const m2=RD.modelo({fecha:'2026-11-13',reportes:[noche,dia,otra],cfg,catalogo:CATALOGO});
ok(m2.semana.dias.find(d=>d.fechaTD==='2026-11-12').kgTD===15110&&m2.semana.dias.find(d=>d.fechaTD==='2026-11-12').hayTN===false,'otra semana: el día 12/11 aparece en la columna del 11/11 (noche sin datos)');
// Paradas
ok(m.paradas.length===2&&m.paradas[0].motivo==='Falla de equipo'&&m.paradas[0].minutos===290&&m.paradas[0].eventos===2&&m.paradasMin===300,'paradas por motivo (Pareto): falla de equipo 290 min en 2 eventos, y otros 10');
ok(m.noche.observaciones.includes('ENVASADORA')&&m.dia.estado==='FINALIZADO'&&RD.modelo({fecha:'2026-11-25',reportes:[],cfg,catalogo:CATALOGO}).hayDatos===false,'observaciones, estado del turno y un día sin reportes');
// Lo producido y no catalogado se agrega al final; pesos y capacidad configurables
{const e=Object.assign({},dia,{produccion:dia.produccion.concat([L('Nueva marca','3 kg',100)])});
 const mx=RD.modelo({fecha:'2026-11-19',reportes:[noche,e],cfg:Object.assign({},cfg,{capacidadTurnoKg:40000,pesos:{'3 kg':3.3}}),catalogo:CATALOGO});
 ok(mx.filas.length===15&&mx.filas[14].etiqueta==='NUEVA MARCA (3KG)'&&mx.filas[14].dia.kg===330,'una marca fuera del catálogo se agrega al final, con el peso configurado');
 ok(mx.capacidad===40000&&mx.noche.eficiencia===r2(mx.noche.kg/40000*100),'la capacidad y los pesos de Configuración mandan');}
function r2(v){return Math.round(v*100)/100;}
// Excel
let ExcelJS=null;try{ExcelJS=require(require('path').join(process.env.GLX_LIBS||'','node_modules','exceljs'));}catch(_){/* sin ExcelJS: se omite */}
(async()=>{
  if(!ExcelJS){console.log('· (Excel omitido: falta GLX_LIBS/node_modules/exceljs)');}
  else{
    const wb=RD.construirExcel(ExcelJS,m,{}),buf=await wb.xlsx.writeBuffer(),w2=new ExcelJS.Workbook();await w2.xlsx.load(buf);
    const ws=w2.getWorksheet('Reporte diario'),h2=w2.getWorksheet('Resumen y semana');
    ok(!!ws&&!!h2&&ws.getCell('A1').value==='REPORTE DIARIO DE PRODUCCIÓN'&&ws.getCell('A2').value==='HIELO EN CUBOS','Excel: dos hojas y título');
    ok(ws.getCell('B5').value===11450.25&&ws.getCell('B6').value===15110&&ws.getCell('B7').value===26560.25&&ws.getCell('G5').value===47,'Excel: cabecera con kg de noche, de día, total de la semana y semana 47');
    let rr=0;ws.eachRow((r,n)=>{if(/RAPPI \(3KG\)/.test(String(r.getCell(1).value)))rr=n;});
    ok(rr>0&&ws.getCell('B'+rr).value===680&&ws.getCell('D'+rr).value===2.27&&ws.getCell('E'+rr).value==='11147323'&&ws.getCell('G'+rr).value===2210&&ws.getCell('H'+rr).value===520&&ws.getCell('M'+rr).value===1690,'Excel: fila Rappi con bolsas, paletas, lote y peso de los dos turnos');
    let tot=0;ws.eachRow((r,n)=>{if(r.getCell(1).value==='TOTAL')tot=n;});
    ok(tot>0&&ws.getCell('G'+tot).value===11450.25&&ws.getCell('M'+tot).value===15110&&ws.getCell('B'+tot).value===4077&&ws.getCell('H'+tot).value===5480,'Excel: fila TOTAL (11,450.25 kg y 4,077 bolsas la noche; 15,110 kg y 5,480 bolsas el día)');
    const fp=e=>{let n=0;h2.eachRow((r,i)=>{if(r.getCell(1).value===e)n=i;});return n;},p3=fp('PRESENTACIÓN 3.0 KG'),p15=fp('PRESENTACIÓN 1.5 KG');
    ok(p3>0&&h2.getCell('B'+p3).value===2877&&h2.getCell('C'+p3).value===9350.25&&h2.getCell('D'+p3).value===3680&&h2.getCell('E'+p3).value===11960,'Excel hoja 2: presentación 3.0 KG, noche y día (bolsas y kg)');
    ok(p15>0&&h2.getCell('B'+p15).value===1200&&h2.getCell('C'+p15).value===2100&&h2.getCell('D'+p15).value===1800&&h2.getCell('E'+p15).value===3150,'Excel hoja 2: presentación 1.5 KG, noche y día');
    let efi=null,sem=null;h2.eachRow(r=>{if(r.getCell(1).value==='EFICIENCIA REAL (%)')efi=[r.getCell(2).value,r.getCell(4).value];if(String(r.getCell(1).value).startsWith('PRODUCCIÓN TOTAL SEMANA'))sem=r.getCell(2).value;});
    ok(efi&&efi[0]===33.68&&efi[1]===44.44&&sem===26560.25,'Excel hoja 2: eficiencia 33.68 / 44.44 y total de la semana');
    const nums=[];ws.eachRow(r=>r.eachCell(c=>{if(typeof c.value==='number')nums.push(c.value);}));
    ok(!nums.some(v=>v>0&&v<0.5&&v!==0.1),'Excel: ningún valor tipo 0.011111 (kilos y paletas normales)');
  }
  console.log(fallas?'\n'+fallas+' falla(s)':'\nTodo correcto');
})();
