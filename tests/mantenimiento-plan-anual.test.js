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

/* ---------- Programa semanal ---------- */
ok(P.textoRango(2026,45)==='Lunes 2 al domingo 8 de noviembre de 2026'&&P.textoRango(2026,1)==='Lunes 29 de diciembre de 2025 al domingo 4 de enero de 2026','texto de la semana: «Lunes 2 al domingo 8 de noviembre de 2026» y semanas que cruzan de mes o de año');
ok(JSON.stringify(P.moverSemana(2026,45,1))==='{"anio":2026,"semana":46}'&&JSON.stringify(P.moverSemana(2026,1,-1))==='{"anio":2025,"semana":52}'&&JSON.stringify(P.moverSemana(2026,53,1))==='{"anio":2027,"semana":1}','◀ ▶ cambian de semana también entre años');
ok(P.resumenFrecuencias([{frecuencia:'SEMANAL'},{frecuencia:'SEMANAL'},{frecuencia:'QUINCENAL'},{frecuencia:'QUINCENAL'},{frecuencia:'MENSUAL'}])==='2 semanales + 2 quincenales + 1 mensual'&&P.resumenFrecuencias([{frecuencia:'SEMANAL'}])==='1 semanal','«10 semanales + 2 quincenales»: cantidades por frecuencia, singular y plural');
ok(P.haceTexto(Date.now()-30000,Date.now())==='hace un momento'&&P.haceTexto(Date.now()-4*60000,Date.now())==='hace 4 min'&&P.haceTexto(Date.now()-3*3600000,Date.now())==='hace 3 h'&&P.haceTexto(0,Date.now())==='','«hace X min»');
const ahoraMs=Date.parse('2026-11-07T14:00:00Z');
const mq={id:'m1',nombre:'SOPLADORA'};
let f=P.filaSemana(mq,acts,45,null,[],ahoraMs);
ok(f.total===2&&f.hechas===0&&f.estado==='PENDIENTE'&&f.frecuencias==='2 semanales'&&f.hace==='','sin registro: las actividades que manda el plan esta semana, 0 hechas, PENDIENTE');
f=P.filaSemana(mq,acts,48,null,[],ahoraMs);ok(f.total===3&&f.frecuencias==='2 semanales + 1 mensual','semana 48: 2 semanales + 1 mensual (según las semanas del plan)');
const reg={id:'r1',maquina_id:'m1',estado:'EN_CURSO',tecnico_senior:'CESAR ALPELIMA',maquinista:'ELISEO ARVI',actualizado_en:new Date(ahoraMs-60000).toISOString()};
const ra=[{registro_id:'r1',realizado:true,marcado_en:new Date(ahoraMs-4*60000).toISOString(),marcado_por:'CESAR',equipo:'TOBERAS',actividad:'REVISIÓN'},{registro_id:'r1',realizado:false}];
f=P.filaSemana(mq,acts,45,reg,ra,ahoraMs);
ok(f.total===2&&f.hechas===1&&f.pct===50&&f.estado==='EN_CURSO'&&f.tecnico==='CESAR ALPELIMA'&&f.hace==='hace un momento'||f.hace==='hace 1 min','con registro: avance 1 de 2 (50 %), estado EN CURSO, técnico y maquinista, «hace X»');
const rs=P.resumenSemana([f,P.filaSemana({id:'m2'},acts,45,{id:'r2',estado:'CERRADO'},[{realizado:true}],ahoraMs),P.filaSemana({id:'m3'},acts,45,null,[],ahoraMs)]);
ok(rs.actividades===5&&rs.realizadas===2&&rs.abiertos===1&&rs.porValidar===1&&rs.maquinas===3,'tarjetas: actividades de la semana, realizadas, registros abiertos ahora, por validar');
const ev=P.eventosEnVivo([reg,{id:'r2',maquina_id:'m1',estado:'VALIDADO',cerrado_en:new Date(ahoraMs-3600000).toISOString(),validado_en:new Date(ahoraMs-1800000).toISOString(),validado_por:'CRISTIAN MEZA',tecnico_senior:'JOSÉ'}],ra,[mq],10);
ok(ev.length===3&&/^marcó «TOBERAS \/ REVISIÓN» en SOPLADORA$/.test(ev[0].texto)&&ev[1].texto==='validó SOPLADORA'&&ev[2].texto==='cerró el registro de SOPLADORA'&&ev[0].ms>ev[1].ms&&ev[1].ms>ev[2].ms,'panel «En vivo»: marcas, validaciones y cierres, lo más reciente primero');

/* ---------- Historial ---------- */
const mqs=[{id:'a',orden:1,nombre:'SOPLADORA'},{id:'b',orden:2,nombre:'ENVASADORA'}];
const regs=[{id:'1',maquina_id:'b',anio:2026,semana:44,estado:'VALIDADO',tecnico_senior:'José Betancourt',maquinista:'Ana Pérez'},{id:'2',maquina_id:'a',anio:2026,semana:45,estado:'EN_CURSO',tecnico_senior:'CESAR ALPELIMA',maquinista:'ELISEO ARVI'},
  {id:'3',maquina_id:'b',anio:2026,semana:45,estado:'CERRADO',tecnico_senior:'Jose Betancourt',maquinista:''},{id:'4',maquina_id:'a',anio:2026,semana:44,estado:'VALIDADO',tecnico_senior:'César Alpelima',maquinista:''}];
ok(N_ids(P.filtrarHistorial(regs,mqs,{}))==='2,3,4,1','orden: semana más reciente primero y, dentro de la semana, el orden de las máquinas');
function N_ids(l){return l.map(r=>r.id).join();}
ok(N_ids(P.filtrarHistorial(regs,mqs,{maquinaId:'b'}))==='3,1'&&N_ids(P.filtrarHistorial(regs,mqs,{semana:'44'}))==='4,1'&&N_ids(P.filtrarHistorial(regs,mqs,{estado:'VALIDADO'}))==='4,1','filtra por máquina, semana y estado');
ok(N_ids(P.filtrarHistorial(regs,mqs,{texto:'jose'}))==='3,1'&&N_ids(P.filtrarHistorial(regs,mqs,{texto:'CÉSAR'}))==='2,4'&&N_ids(P.filtrarHistorial(regs,mqs,{texto:'arvi'}))==='2','busca técnico o maquinista sin importar tildes ni mayúsculas');
ok(N_ids(P.filtrarHistorial(regs,mqs,{maquinaId:'a',estado:'VALIDADO',texto:'cesar'}))==='4'&&P.filtrarHistorial(regs,mqs,{texto:'nadie'}).length===0,'los filtros se combinan');
const ce=P.conteoEstados(regs);ok(ce.VALIDADO===2&&ce.CERRADO===1&&ce.EN_CURSO===1&&ce.PENDIENTE===0,'conteo por estado para las etiquetas del filtro');

/* ---------- Inicio de los registros: semana 46 de 2026 ---------- */
ok(JSON.stringify(P.inicioRegistros(null))==='{"anio":2026,"semana":46}'&&JSON.stringify(P.inicioRegistros({datos:{inicioRegistros:{anio:2027,semana:3}}}))==='{"anio":2027,"semana":3}'&&P.inicioRegistros({datos:{inicioRegistros:{anio:2026,semana:99}}}).semana===46,'inicio de los registros: semana 46 de 2026 por defecto; se puede cambiar en la configuración y un valor inválido se ignora');
ok(P.antesDelInicio(2026,45)&&!P.antesDelInicio(2026,46)&&!P.antesDelInicio(2026,47)&&P.antesDelInicio(2025,52)&&!P.antesDelInicio(2027,1)&&P.antesDelInicio(2026,45,{anio:2026,semana:46}),'las semanas anteriores a la 46 son «antes del inicio» (no se inician registros); la 46 en adelante sí');
/* ---- dos personas en el mismo campo ---- */
{
  const ahora=1e12,mio=(v,hace)=>({v,en:ahora-hace*1000});
  const c=o=>P.conflictoCampo(Object.assign({ahora},o));
  ok(c({previo:'A',nuevo:'B',mios:[mio('A',60)],editando:null})===true,'lo escribí hace 1 min y otra persona lo cambió: avisa');
  ok(c({previo:'A',nuevo:'A',mios:[mio('A',60)],editando:null})===false,'si el valor no cambió no avisa');
  ok(c({previo:'A',nuevo:'A2',mios:[mio('A',10),mio('A2',5)],editando:null})===false,'el eco de mi propio guardado (un valor mío más reciente) no avisa');
  ok(c({previo:'A',nuevo:'B',mios:[mio('A',20*60)],editando:null})===false,'lo escribí hace 20 min (fuera de la ventana de 5): no avisa');
  ok(c({previo:'A',nuevo:'B',mios:[],editando:null})===false,'algo que no toqué y no estoy escribiendo: no avisa');
  ok(c({previo:'A',nuevo:'B',mios:[],editando:'texto a medias'})===true,'estoy escribiendo y otra persona lo cambió: avisa');
  ok(c({previo:'A',nuevo:'B',mios:[],editando:'B'})===false,'estoy escribiendo lo mismo que llegó: no avisa');
  ok(c({previo:null,nuevo:'',mios:[mio('',5)],editando:null})===false&&c({previo:true,nuevo:false,mios:[mio(true,30)],editando:null})===true,'vacío y null cuentan igual; también funciona con casillas (true/false)');
  ok(P.CAMPOS_AVISO.informe_final==='el informe final'&&Object.keys(P.CAMPOS_AVISO).length===8,'campos vigilados del registro, con su nombre para el aviso');
}
process.exit(fallas?1:0);
