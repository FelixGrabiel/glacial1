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
/* ---- Carta de control, mezcla por marca y mapa de calor ---- */
const rep=(fecha,turno,bolsas,extra)=>Object.assign({id:fecha+'_'+turno,fecha,turno,estado:'FINALIZADO',produccion:[L('Glacial','3 kg',bolsas)],paradas:[]},extra||{});
const fechaN=i=>RD.sumar('2026-11-05',i);
// 10 días de producción: noche con 1000 bolsas y día con 1000+100·i bolsas de 3 kg → total = 6500 + 325·i kg
const serie=[];for(let i=0;i<10;i++){serie.push(rep(fechaN(i),'NOCHE',1000));serie.push(rep(RD.sumar(fechaN(i),1),'DÍA',1000+100*i));}
{const c=RD.modelo({fecha:RD.sumar(fechaN(9),1),reportes:serie,cfg,catalogo:CATALOGO}).control;
 ok(c.puntos.length===10&&c.puntos[0].kg===6500&&c.puntos[9].kg===9425&&c.puntos[0].fechaTN==='2026-11-05','control: un punto por día de producción (noche + día siguiente), de más antiguo a más reciente');
 ok(c.completos===10&&c.suficiente&&c.mu===7962.5&&c.ucl===8827&&c.lcl===7098,'control: promedio 7,962.5 y límites 7,098 a 8,827 (promedio ± 2.66 × rango móvil medio de 325)');
 ok(c.fuera.join()==='2026-11-05,2026-11-06,2026-11-14'||c.fuera.includes('2026-11-05')&&c.fuera.includes('2026-11-14'),'control: marca los días fuera de los límites ('+c.fuera.join(', ')+')');
 ok(c.racha===null,'control: sin racha cuando los últimos días no están todos del mismo lado');}
{// racha: 3 días altos y 7 bajos → los últimos 7 quedan por debajo del promedio
 const rs=[];for(let i=0;i<10;i++){rs.push(rep(fechaN(i),'NOCHE',1000));rs.push(rep(RD.sumar(fechaN(i),1),'DÍA',i<3?2000:800));}
 const c=RD.modelo({fecha:RD.sumar(fechaN(9),1),reportes:rs,cfg,catalogo:CATALOGO}).control;
 ok(c.racha&&c.racha.n===7&&c.racha.lado==='debajo','control: 7 días seguidos por debajo del promedio = racha');}
{// pocos días: no hay límites
 const rs=serie.slice(0,10),c=RD.modelo({fecha:RD.sumar(fechaN(4),1),reportes:rs,cfg,catalogo:CATALOGO}).control;
 ok(c.completos===5&&!c.suficiente&&c.fuera.length===0&&c.racha===null&&c.mu>0,'control: con menos de 8 días completos no es suficiente: no marca días fuera ni rachas (solo se dibuja el promedio)');}
{// un día con el turno día sin reporte no es punto; uno sin finalizar es provisional y no entra en los límites
 const rs=serie.filter(r=>!(r.fecha===RD.sumar(fechaN(2),1)&&r.turno==='DÍA')).map(r=>r.fecha===RD.sumar(fechaN(9),1)&&r.turno==='DÍA'?Object.assign({},r,{estado:'EN_REGISTRO'}):r);
 const c=RD.modelo({fecha:RD.sumar(fechaN(9),1),reportes:rs,cfg,catalogo:CATALOGO}).control;
 ok(c.puntos.length===9&&!c.puntos.some(p=>p.fechaTN===fechaN(2))&&c.puntos[8].provisional===true&&c.completos===8,'control: un día sin el turno día no es punto; un turno sin finalizar es provisional y no cuenta para los límites');}
// Mezcla por marca (últimos 14 días)
{const rs=[rep('2026-11-19','DÍA',1000,{produccion:[L('Glacial','3 kg',1000),L('Glacial','1.5 kg',400),L('Rappi','3 kg',2000)]}),rep('2026-11-18','NOCHE',500,{produccion:[L('Rappi','3 kg',500),L('Listo','1.5 kg',800)]}),rep('2026-10-01','DÍA',9999,{produccion:[L('Vieja','3 kg',9999)]})];
 const mx=RD.modelo({fecha:'2026-11-19',reportes:rs,cfg,catalogo:CATALOGO});
 ok(mx.periodo.dias===14&&mx.periodo.desde==='2026-11-06'&&mx.periodo.hasta==='2026-11-19','mezcla: período de 14 días hasta la fecha del reporte');
 ok(mx.marcas.map(a=>a.marca).join()==='Rappi,Glacial,Listo'&&mx.marcas[0].kg===8125&&mx.marcas[1].kg===3250+700&&mx.marcas[1].kgPorPres['3 kg']===3250&&mx.marcas[1].kgPorPres['1.5 kg']===700&&mx.marcas[2].kg===1400,'mezcla: kilos reales por marca (Rappi 8,125 · Glacial 3,250 + 700 · Listo 1,400), ordenado de mayor a menor');
 ok(mx.kgPeriodo===8125+3950+1400&&Math.abs(mx.marcas.reduce((s,a)=>s+a.pct,0)-100)<0.1&&!mx.marcas.some(a=>a.marca==='Vieja'),'mezcla: el total suma 100 % y no entra lo anterior al período');
 ok(RD.modelo({fecha:'2026-11-19',dias:7,reportes:rs,cfg,catalogo:CATALOGO}).periodo.dias===7&&RD.modelo({fecha:'2026-11-19',dias:99,reportes:rs,cfg,catalogo:CATALOGO}).periodo.dias===14,'mezcla: el período puede ser 7, 14 o 21 días; otro valor vuelve a 14');
 // Mapa
 ok(mx.mapa.fechas.length===14&&mx.mapa.fechas[0]==='2026-11-06'&&mx.mapa.fechas[13]==='2026-11-19','mapa: una columna por fecha del período');
 const i18=mx.mapa.fechas.indexOf('2026-11-18'),i19=mx.mapa.fechas.indexOf('2026-11-19');
 ok(mx.mapa.noche[i18]===r2(500*3.25+800*1.75)&&mx.mapa.dia[i19]===r2(1000*3.25+400*1.75+2000*3.25)&&mx.mapa.dia[i18]===null&&mx.mapa.noche[i19]===null,'mapa: kilos reales por turno y fecha; null = sin reporte');
 ok(mx.mapa.diasConAmbos===0,'mapa: cuenta solo los días con los dos turnos reportados');}
{const rs=[];for(let i=0;i<5;i++){rs.push(rep(RD.sumar('2026-11-10',i),'DÍA',1000));rs.push(rep(RD.sumar('2026-11-10',i),'NOCHE',i<3?1500:500));}
 const mm=RD.modelo({fecha:'2026-11-14',reportes:rs,cfg,catalogo:CATALOGO}).mapa;ok(mm.diasConAmbos===5&&mm.nochePorEncima===3,'mapa: la noche produjo más que el día en 3 de 5 días');}
// Vista por turno: solo noche (fecha del propio turno) y solo día
{const mn=RD.modelo({fecha:'2026-11-18',turno:'NOCHE',reportes:[noche,dia,otra],cfg,catalogo:CATALOGO}),md=RD.modelo({fecha:'2026-11-19',turno:'DIA',reportes:[noche,dia,otra],cfg,catalogo:CATALOGO});
 ok(mn.vista==='NOCHE'&&mn.noche.kg===11450.25&&mn.dia.kg===0&&mn.dia.reportes===0&&mn.totalDiaKg===11450.25&&mn.fNoche==='2026-11-18'&&/miércoles, 18 de noviembre/.test(mn.fechaLarga),'solo noche: la fecha es la del propio turno (18/11) y no suma el día');
 ok(md.vista==='DIA'&&md.dia.kg===15110&&md.noche.kg===0&&md.totalDiaKg===15110&&md.dia.eficiencia===44.44&&/ · TURNO DÍA$/.test(md.subtitulo),'solo día: 15,110 kg y 44.44 %, sin la noche');
 ok(mn.totalSemanaKg===11450.25&&md.totalSemanaKg===15110&&mn.semana.dias.filter(d=>d.hayDatos).length===1,'la semana solo suma el turno elegido');
 ok(md.semana.dias.find(d=>d.actual).fechaMostrar==='2026-11-19'&&mn.semana.dias.find(d=>d.actual).fechaMostrar==='2026-11-18','la columna actual de la semana muestra la fecha del turno');
 ok(mn.paradas.length===1&&mn.paradas[0].minutos===260&&md.paradas.length===2&&md.paradasMin===40,'las paradas son solo las del turno');
 ok(mn.marcas.every(a=>a.kg>0)&&Math.round(mn.kgPeriodo)===11450&&Math.round(md.kgPeriodo)===30220,'mezcla por marca: solo el turno elegido en el período (el 12/11 día repite 15,110)');
 ok(mn.mapa.noche.some(v=>v>0)&&mn.mapa.dia.every(v=>v===null)&&md.mapa.noche.every(v=>v===null)&&mn.periodo.hasta==='2026-11-18','mapa de calor: solo la fila del turno y el período termina en la fecha del turno');
 const mx=RD.modelo({fecha:'2026-11-19',turno:'XX',reportes:[noche,dia],cfg,catalogo:CATALOGO});ok(mx.vista==='AMBOS'&&mx.totalDiaKg===26560.25,'un turno inválido vuelve al día de producción completo');
 H.__vistas={mn,md};}
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
  if(ExcelJS){const wn=await new ExcelJS.Workbook().xlsx.load(await RD.construirExcel(ExcelJS,H.__vistas.mn,{}).xlsx.writeBuffer()),sn=wn.getWorksheet('Reporte diario');
    ok(sn.getCell('B5').value===11450.25&&sn.getCell('B6').value===null&&/NO INCLUIDO/.test(String(sn.getCell('H9').value))&&sn.getCell('A2').value==='HIELO EN CUBOS · TURNO NOCHE'&&/SOLO NOCHE/.test(String(sn.getCell('A7').value)),'Excel solo noche: el día queda marcado como no incluido y la semana dice «solo noche»');}
  console.log(fallas?'\n'+fallas+' falla(s)':'\nTodo correcto');
})();
