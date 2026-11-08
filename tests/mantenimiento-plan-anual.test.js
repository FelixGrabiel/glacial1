/* Mantenimiento · Plan anual (js/mantenimiento/71-plan-anual-nucleo.js): semanas ISO, celdas de semana del Excel, bloques, estados y tarjetas. */
'use strict';
const P=require('../js/mantenimiento/71-plan-anual-nucleo.js');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};

ok(JSON.stringify(P.semanaIso('2026-11-02'))==='{"anio":2026,"semana":45}'&&P.semanaIso('2026-11-08').semana===45&&P.semanaIso('2026-11-09').semana===46,'la semana 45 de 2026 va del lunes 02/11 al domingo 08/11');
ok(JSON.stringify(P.rangoSemana(2026,45))==='{"desde":"2026-11-02","hasta":"2026-11-08"}'&&P.rangoSemana(2026,1).desde==='2025-12-29','rango de la semana 45 (02/11–08/11) y la semana 1 de 2026 empieza el 29/12/2025');
ok(P.semanaIso('2026-01-01').semana===1&&P.semanaIso('2025-12-29').anio===2026&&P.semanaIso('2027-01-03').anio===2026&&P.semanaIso('2027-01-03').semana===53,'bordes de año: 29/12/2025 ya es semana 1 de 2026 y 03/01/2027 es la 53 de 2026');
ok(P.semanasDelAnio(2026)===53&&P.semanasDelAnio(2025)===52,'2026 tiene 53 semanas ISO; 2025, 52');
ok(P.etiquetaSemana(5)==='SEM_05'&&P.etiquetaSemana(45)==='SEM_45','etiqueta SEM_##');

let l=P.leerSemanas('1 - 52');ok(l.todo&&l.semanas.length===52&&l.texto==='1 - 52','«1 - 52» = todo el año');
l=P.leerSemanas('1 -52');ok(l.todo&&l.semanas.length===52,'«1 -52» se interpreta igual');
l=P.leerSemanas(9);ok(!l.todo&&l.semanas.join()==='9','un número suelto = esa semana');
l=P.leerSemanas('17, 19 ,21');ok(l.semanas.join()==='17,19,21'&&l.texto==='17,19,21','varias semanas separadas por coma');
l=P.leerSemanas('');ok(l.semanas.length===0&&!l.error,'vacío = ninguna semana');
ok(!!P.leerSemanas('abc').error&&!!P.leerSemanas('0,3').error&&!!P.leerSemanas('54').error,'texto o semanas fuera de 1–53: error con explicación');

let a=P.armarSemanas(['','','9','','','','','','35','','',''],false);
ok(a.semanas.join()==='9,35'&&a.semanasPorMes[2]==='9'&&a.errores.length===0,'armar las 12 celdas: unión de semanas y textos por mes');
a=P.armarSemanas(['x'].concat(Array(11).fill('')),false);ok(a.errores.length===1&&/Enero/.test(a.errores[0]),'un mes con texto inválido se nombra');
a=P.armarSemanas([],true);ok(a.todo&&a.semanas.length===52&&a.semanasPorMes[0]==='1 - 52'&&a.semanasPorMes[1]==='','«todo el año» arma «1 - 52» combinado');

const acts=[
  {id:1,frecuencia:'SEMANAL',orden:1,bloque_orden:1,semanas:Array.from({length:52},(_,i)=>i+1),es_todo_el_anio:true},
  {id:2,frecuencia:'SEMANAL',orden:2,bloque_orden:1,semanas:Array.from({length:52},(_,i)=>i+1),es_todo_el_anio:true},
  {id:3,frecuencia:'MENSUAL',orden:3,bloque_orden:3,semanas:[1,5,9,13,18,22,26,31,35,39,44,48],es_todo_el_anio:false},
  {id:4,frecuencia:'SEMESTRAL',orden:4,bloque_orden:6,semanas:[9,35],es_todo_el_anio:false}];
const g=P.agruparPorBloque(acts.slice().reverse());
ok(g.map(b=>b.frecuencia+':'+b.items.length).join()==='SEMANAL:2,MENSUAL:1,SEMESTRAL:1','los bloques siguen el orden del Excel, aunque lleguen desordenados');
ok(P.partirActividad('CHUMACERAS / LUBRICACIÓN').equipo==='CHUMACERAS'&&P.partirActividad('CHUMACERAS / LUBRICACIÓN').tarea==='LUBRICACIÓN'&&P.partirActividad('SOLO EQUIPO').tarea==='','equipo y tarea se separan por « / »');

const hoy=P.semanaDeHoy('2026-11-07');
ok(P.estadoSemana(45,hoy)==='actual'&&P.estadoSemana(48,hoy)==='programada','semana actual y semana futura');
ok(P.estadoSemana(9,hoy)==='programada'&&P.estadoSemana(9,hoy,{conRegistros:true})==='vencida','sin registros, lo pasado NO se marca vencida; con registros y sin ejecutar, sí');
ok(P.estadoSemana(9,hoy,{conRegistros:true,ejecutadas:new Set([9])})==='ejecutada'&&P.estadoSemana(45,hoy,{ejecutadas:new Set([45])})==='ejecutada','una semana con registro cerrado/validado es ejecutada');
const r=P.resumen(acts,hoy);
ok(r.total===4&&r.estaSemana===2&&r.proxima.semana===48&&r.proxima.extras===1&&r.vencidas===null,'resumen: 4 actividades, 2 esta semana (S45), próxima con extras S48 (+1), vencidas sin dato mientras no haya registros');
const r2=P.resumen(acts,P.semanaDeHoy('2026-11-07'),{conRegistros:true,ejecutadasDe:(a,s)=>a.id===3&&s<20});
ok(r2.vencidas>0,'con registros las vencidas se cuentan por actividad y semana');
const av=P.avanceAnio(hoy,2026);ok(av.transcurridas===45&&av.total===53&&av.pct===85,'avance del año para la barra semanal (45 de 53)');
process.exit(fallas?1:0);
