/* Mantenimiento: ejecución del plan según el Registro y «Esta semana en Mantenimiento». Datos inventados (semana actual: 2026-S47, registros desde la S46). */
const fs=require('fs'),path=require('path');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const N=require('../js/mantenimiento/71-plan-anual-nucleo.js');
const leer=f=>fs.readFileSync(path.resolve(__dirname,'..',f),'utf8');

const actual={anio:2026,semana:47},inicio={anio:2026,semana:46};
const maquinas=[{id:'m1',codigo_hoja:'SOP',nombre:'Sopladora'},{id:'m2',codigo_hoja:'HORNO',nombre:'Horno'},{id:'m3',codigo_hoja:'CARB',nombre:'Carbonatador',pendiente_confirmar:true}];
const A=(id,m,sem,todo)=>({id,maquina_id:m,anio:2026,semanas:sem,es_todo_el_anio:!!todo,frecuencia:todo?'SEMANAL':'MENSUAL'});
const act=[A('a1','m1',[44,45,46,47,48],true),A('a2','m1',[46,47]),A('a3','m2',[47,48]),A('a4','m3',[47])];
const registros=[{id:'r1',maquina_id:'m1',anio:2026,semana:46,estado:'CERRADO'},{id:'r2',maquina_id:'m1',anio:2026,semana:47,estado:'EN_CURSO'}];
const regActs=[
  {id:'x1',registro_id:'r1',plan_actividad_id:'a1',realizado:true},                                         // S46 a1 hecha
  {id:'x2',registro_id:'r1',plan_actividad_id:'a2',no_realizado:true,motivo_no:'Falta de repuesto'},         // S46 a2 no realizada → pasó a la S47
  {id:'x3',registro_id:'r2',plan_actividad_id:'a2',realizado:true,origen_actividad_id:'x2'},                 // S47: la arrastrada se hizo
  {id:'x4',registro_id:'r2',plan_actividad_id:'a1',realizado:false},                                         // S47 a1 sin marcar
  {id:'x5',registro_id:'r2',plan_actividad_id:'a2',realizado:false}                                          // S47 a2 propia, sin marcar
];
const ejec=N.mapaEjecucion(registros,regActs);
ok(ejec.get('a1').get(46).estado==='ok'&&ejec.get('a1').get(47).estado==='curso','mapa: hecha en S46 y en curso en S47');
ok(ejec.get('a2').get(46).estado==='tarde'&&ejec.get('a2').get(46).motivo==='Falta de repuesto','no se realizó en S46 pero se hizo después (copia arrastrada realizada): «hecha tarde», con su motivo');
ok(!ejec.get('a2').has(48)&&ejec.get('a2').get(47).estado==='curso','la copia arrastrada no cuenta como la actividad propia de otra semana');

ok(N.semanaDesde(2026,inicio)===46&&N.semanaDesde(2027,inicio)===1&&N.semanaDesde(2025,inicio)===Infinity,'«vencidas» se cuentan desde la semana en que empezó el Registro');
ok(N.estadoSemana(46,actual,{conRegistros:true,desde:46,ejecucion:ejec.get('a1')})==='ejecutada'&&N.estadoSemana(45,actual,{conRegistros:true,desde:46,ejecucion:ejec.get('a1')})==='programada','antes del Registro no se marca vencida; la hecha sale «ejecutada»');
ok(N.estadoSemana(44,actual,{conRegistros:true,desde:44})==='vencida'&&N.estadoSemana(47,actual,{conRegistros:true,desde:46})==='actual','sin registro y ya pasada: vencida; la semana en curso: actual');
ok(N.estadoSemana(46,actual,{conRegistros:true,desde:46,ejecucion:new Map([[46,{estado:'no'}]])})==='noreal','«No se realizó» pendiente sale en naranja');

const c1=N.cumplimiento([act[0]],actual,ejec,46);
ok(c1.base===1&&c1.hechas===1&&c1.vencidas===0&&c1.pct===100,'cumplimiento de a1 (solo S46 cuenta): 1 de 1 = 100 %');
const c2=N.cumplimiento([act[1]],actual,ejec,46);
ok(c2.base===1&&c2.hechas===1&&c2.pct===100,'a2: lo «hecha tarde» cuenta como hecha');
const c3=N.cumplimiento([act[0]],actual,N.mapaEjecucion([],[]),44);
ok(c3.base===3&&c3.hechas===0&&c3.vencidas===3&&c3.pct===0,'sin registros, las 3 semanas pasadas desde la 44 están vencidas');

const sit=N.situacionSemana({maquinas,actividades:act,registros,acts:regActs,actual,inicio,diaSemana:4});
ok(sit.toca.actividades===3&&sit.toca.maquinas===2,'esta semana toca: 3 actividades en 2 máquinas (la hoja CARB pendiente de confirmar no cuenta)');
ok(sit.hechas===0&&sit.pct===0,'avance: ninguna marcada en la S47');
ok(sit.sinRegistro.map(m=>m.codigo_hoja).join()==='HORNO'&&sit.aviso===true,'sin registro: HORNO; jueves o después: avisa');
ok(N.situacionSemana({maquinas,actividades:act,registros,acts:regActs,actual,inicio,diaSemana:2}).aviso===false,'lunes o martes: no avisa todavía');
ok(sit.vencidas===0&&sit.porValidar===1&&sit.pendientes===0,'vencidas 0 · 1 registro cerrado por validar · sin pendientes abiertas (la arrastrada ya se hizo)');
const sit2=N.situacionSemana({maquinas,actividades:act,registros,acts:regActs.filter(a=>a.id!=='x3'),actual,inicio,diaSemana:5});
ok(sit2.pendientes===1&&sit2.vencidas===1&&sit2.topVencidas[0].maquina.codigo_hoja==='SOP','si la arrastrada no se hizo: 1 pendiente abierta y a2 (S46) vencida en SOP');

/* conexión */
const d72=leer('js/mantenimiento/72-plan-anual-datos.js'),p73=leer('js/mantenimiento/73-plan-anual-pantalla.js'),p68=leer('js/mantenimiento/68-mantenimiento-inicio.js');
ok(/cargarEjecucion/.test(d72)&&/programarEjecucion/.test(d72)&&/mtto_registro_actividades/.test(d72),'datos: lee la ejecución del año y la vuelve a leer cuando cambia el Registro');
ok(/leerEjecucion\(\)/.test(p73)&&/mp-cal-noreal/.test(p73)&&/Cumplimiento del plan/.test(p73)&&/vencChip/.test(p73),'Plan anual: pinta lo hecho / no realizado / vencido, cumplimiento y vencidas por máquina');
ok(/Esta semana en Mantenimiento/.test(p68)&&/situacionSemana/.test(p68)&&/Sin registro iniciado/.test(p68)&&/data-mi-sem/.test(p68),'Inicio de Mantenimiento: tarjeta «Esta semana en Mantenimiento»');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
