/* Fecha operativa del turno NOCHE (js/nucleo/01b-fecha-operativa.js y sus usos).
   Uso: node tests/fecha-operativa.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,m)=>{console.log((c?'✔ ':'✘ FALLA ')+m);if(!c)fallas++;};
const leer=f=>fs.readFileSync(path.join(R,f),'utf8').replace(/\r\n/g,'\n');
/* ms de una hora de Lima (UTC-5) */
const lima=(f,h,m)=>{const [y,mo,d]=f.split('-').map(Number);return Date.UTC(y,mo-1,d,h,m||0)+5*3600000;};

function entorno(extra){
  const sb=Object.assign({console,Date,Promise,Map,Set,Array,Object,String,Number,JSON,Error,RegExp,Math,Intl,URLSearchParams,setTimeout,clearTimeout,setInterval:()=>0},extra||{});
  vm.createContext(sb);sb.window=sb;sb.document={addEventListener(){},body:{appendChild(){}}};
  sb.sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};sb.location={hostname:'x',search:'',protocol:'https:'};
  return sb;
}
const sb=entorno();
vm.runInContext(leer('js/nucleo/01b-fecha-operativa.js'),sb);
const G=sb.GlacialFecha;

/* ===== fecha operativa, turno y zona horaria ===== */
ok(G.fechaOperativa(lima('2026-10-16',1,31))==='2026-10-15','NOCHE a la 01:31 del 16/10 → fecha operativa 15/10 (la captura del supervisor)');
ok(G.fechaOperativa(lima('2026-10-15',23,0))==='2026-10-15','NOCHE a las 23:00 → mismo día');
ok(G.fechaOperativa(lima('2026-10-16',6,50))==='2026-10-15','NOCHE a las 06:50 → día anterior');
ok(G.fechaOperativa(lima('2026-10-16',7,1))==='2026-10-16','07:01 → turno DÍA con la fecha nueva');
ok(G.turnoActual(lima('2026-10-16',7,1))==='DÍA'&&G.turnoActual(lima('2026-10-16',1,30))==='NOCHE'&&G.turnoActual(lima('2026-10-16',22,0))==='NOCHE','turnoActual: DÍA 07:01, NOCHE 01:30 y 22:00');
ok(G.bloqueActual(lima('2026-10-16',16,0))==='DÍA'&&G.bloqueActual(lima('2026-10-16',23,0))==='NOCHE','bloqueActual: INTERMEDIO cuenta como DÍA');
ok(G.fechaOperativa(lima('2026-10-15',18,30))==='2026-10-15'&&G.fechaOperativa(lima('2026-10-15',19,30))==='2026-10-15','DÍA a las 18:30 y 19:30 NO salta al día siguiente por UTC');
ok(G.fechaISOLocal(lima('2026-10-15',19,30))==='2026-10-15'&&G.fechaISOLocal(lima('2026-10-15',23,59))==='2026-10-15',
  'fechaISOLocal usa Lima: a las 19:30 y 23:59 sigue siendo 15/10 (toISOString diría 16/10)');
ok(new Date(lima('2026-10-15',20,0)).toISOString().slice(0,10)==='2026-10-16','(control) toISOString().slice(0,10) a las 20:00 Lima sí da 16/10: por eso no se usa');
ok(G.fechaOperativa(lima('2026-10-16',3,0),'DÍA')==='2026-10-16'&&G.fechaOperativa(lima('2026-10-16',3,0),'NOCHE')==='2026-10-15','fechaOperativa con turno explícito');
ok(G.ahoraLima(lima('2026-10-16',1,31)).texto==='16/10/2026 01:31','ahoraLima.texto = «16/10/2026 01:31»');

/* ===== fin de mes y de año ===== */
ok(G.fechaOperativa(lima('2026-11-01',3,0))==='2026-10-31','31/10 22:00 → 01/11 03:00 = fecha operativa 31/10');
ok(G.fechaOperativa(lima('2027-01-01',3,0))==='2026-12-31','31/12 22:00 → 01/01 03:00 = fecha operativa 31/12');
ok(G.fechaOperativa(lima('2026-10-31',23,0))==='2026-10-31','31/10 23:00 = 31/10');
ok(G.sumarDias('2026-12-31',1)==='2027-01-01'&&G.sumarDias('2026-03-01',-1)==='2026-02-28','sumarDias cruza mes y año');

/* ===== día juliano y semana ===== */
ok(G.diaJuliano('2026-10-15')===288,'día juliano del 15/10/2026 = 288 (el de la captura)');
ok(G.diaJuliano('2026-10-16')===289,'día juliano del 16/10/2026 = 289 (lo que salía mal)');
ok(G.diaJuliano('2026-12-31')===365&&G.diaJuliano('2028-12-31')===366,'365/366 días');
ok(G.semanaISO('2026-10-15')===42,'semana ISO del 15/10/2026 = 42');
ok(G.semanaISO('2026-12-31')===53&&G.semanaISO('2027-01-01')===53,'ISO: 31/12/2026 y 01/01/2027 = semana 53');

/* ===== hora tecleada dentro de un turno ===== */
ok(G.hhmmAMs('2026-10-15','00:30','NOCHE')===lima('2026-10-16',0,30),'NOCHE del 15/10, «00:30» = 16/10 00:30 (antes: 15/10 00:30)');
ok(G.hhmmAMs('2026-10-15','23:10','NOCHE')===lima('2026-10-15',23,10),'NOCHE del 15/10, «23:10» = 15/10 23:10');
ok(G.hhmmAMs('2026-10-15','09:00','DÍA')===lima('2026-10-15',9,0),'DÍA no suma día');

/* ===== hora simulada: solo Administrador o desarrollo ===== */
{
  const mk=(search,rol,host)=>{
    const e=entorno();
    e.location={hostname:host||'glacial.app',search,protocol:'https:'};
    e.sessionStorage={getItem:k=>k==='rdp_session_v1'&&rol?JSON.stringify({rol}):null,setItem(){},removeItem(){}};
    vm.runInContext(leer('js/nucleo/01b-fecha-operativa.js'),e);return e;
  };
  const e1=mk('?simularHora=2026-10-16T01:30','Supervisor');
  ok(!e1.GlacialFecha.simulacion().activa,'un Supervisor NO puede simular la hora');
  const e2=mk('?simularHora=2026-10-16T01:30','Administrador');
  ok(e2.GlacialFecha.simulacion().activa&&e2.GlacialFecha.fechaOperativa()==='2026-10-15','el Administrador sí: 16/10 01:30 → fecha operativa 15/10');
  ok(Math.abs(e2.GlacialFecha.ahoraMs()-lima('2026-10-16',1,30))<5000,'la hora simulada avanza desde el instante pedido');
  const e3=mk('?simularHora=2026-10-16T01:30',null,'localhost');
  ok(e3.GlacialFecha.simulacion().activa,'en localhost (desarrollo) también');
  const e4=mk('','Administrador');
  ok(!e4.GlacialFecha.simulacion().activa,'sin el parámetro no se simula nada');
}

/* ===== contexto del supervisor (31-rotacion-supervisores.js) ===== */
{
  const e=entorno({state:{user:{rol:'Supervisor',username:'owar'}},_rotacionesReady:true});
  vm.runInContext(leer('js/nucleo/01b-fecha-operativa.js'),e);
  // Dos noches consecutivas: 15/10 y 16/10, ambas NOCHE 22:00–07:00
  e.sessionStorage={getItem:()=>null,setItem(){}};e.DB_SESSION='x';
  vm.runInContext(`
    function rotSupFechaISO(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
    function rotSupBuscarSemanaPorFecha(){return {id:'r1'};}
    function rotSupAsignacionFecha(r,u,f){return {turno:'NOCHE',inicio:'22:00',fin:'07:00'};}
    function minutosHoraTurno(h){const [a,b]=String(h).split(':').map(Number);return a*60+b;}
  `,e);
  const src=leer('js/personal/31-rotacion-supervisores.js');
  const ini=src.indexOf('function resolverContextoRotacionSupervisor'),fin=src.indexOf('function aplicarContextoRotacionSupervisor');
  vm.runInContext(src.slice(ini,fin),e);
  const r=e.resolverContextoRotacionSupervisor(e.state.user,new Date(lima('2026-10-16',1,31)));
  ok(r&&r.fechaOperativa==='2026-10-15'&&r.turno==='NOCHE'&&r.estado==='ACTIVO','supervisor con NOCHE consecutivas a la 01:31 del 16/10 → contexto 15/10 NOCHE (antes: 16/10)');
  const r2=e.resolverContextoRotacionSupervisor(e.state.user,new Date(lima('2026-10-16',23,0)));
  ok(r2&&r2.fechaOperativa==='2026-10-16'&&r2.estado==='ACTIVO','a las 23:00 del 16/10 → 16/10 NOCHE');
  const r3=e.resolverContextoRotacionSupervisor(e.state.user,new Date(lima('2026-10-16',6,50)));
  ok(r3&&r3.fechaOperativa==='2026-10-15','a las 06:50 todavía es la noche del 15/10');
  const r4=e.resolverContextoRotacionSupervisor(e.state.user,new Date(lima('2026-10-16',7,10)));
  ok(r4&&r4.fechaOperativa==='2026-10-16'&&r4.estado==='FUERA_DE_HORARIO','a las 07:10 ya no es la noche del 15 (queda la asignación de hoy, fuera de horario)');
}

/* ===== formulario de reporte y paleta nacen con la fecha/turno operativos ===== */
{
  const mk=(h,m,f)=>{
    const e=entorno({state:{user:{}},obtenerDiaDelAño:s=>0,obtenerSemana:s=>0});
    vm.runInContext(leer('js/nucleo/01b-fecha-operativa.js'),e);
    e.window.tareoAhoraServidor=()=>lima(f,h,m);
    return e;
  };
  const src=leer('js/produccion/06-registro.js');
  const ini=src.indexOf('function grupoTurnoReporte'),fin=src.indexOf('function esReporteCompartidoDiaIntermedio');
  const ini2=src.indexOf('function blankRecord'),fin2=src.indexOf('  const record = {',ini2);
  ok(ini>0&&ini2>0&&fin2>ini2,'se localizan grupoTurnoReporte y el arranque de blankRecord');
  const cuerpo=src.slice(ini2,fin2)+'  return {fecha:today,turno:turnoInicial,grupo:grupoTurnoReporte(turnoInicial)};\n}';
  const prueba=(h,m,f)=>{const e=mk(h,m,f);vm.runInContext(src.slice(ini,fin)+cuerpo,e);return e.blankRecord('PET1');};
  let b=prueba(1,31,'2026-10-16');ok(b.fecha==='2026-10-15'&&b.turno==='NOCHE'&&b.grupo==='NOCHE','blankRecord a la 01:31 → 15/10 NOCHE');
  b=prueba(23,0,'2026-10-15');ok(b.fecha==='2026-10-15'&&b.turno==='NOCHE','blankRecord a las 23:00 → 15/10 NOCHE');
  b=prueba(7,1,'2026-10-16');ok(b.fecha==='2026-10-16'&&b.turno==='DÍA','blankRecord a las 07:01 → 16/10 DÍA');
  b=prueba(18,30,'2026-10-15');ok(b.fecha==='2026-10-15'&&b.turno==='DÍA'&&b.grupo==='DIA_INTERMEDIO','blankRecord DÍA a las 18:30 → igual que siempre');
}

/* ===== detección de registros ya guardados con fecha equivocada ===== */
{
  const D=entorno();vm.runInContext(leer('js/nucleo/01b-fecha-operativa.js'),D);
  D.state={user:{rol:'Administrador'}};
  vm.runInContext(leer('js/produccion/06d-corregir-fechas-noche.js'),D);
  const C=D.glacialCorregirFechasNoche;
  ok(C.propuesta('2026-10-16','NOCHE',lima('2026-10-16',1,31))==='2026-10-15','creado 16/10 01:31 con fecha 16/10 NOCHE → propone 15/10');
  ok(C.propuesta('2026-10-15','NOCHE',lima('2026-10-16',1,31))===null,'creado 16/10 01:31 con fecha 15/10 (correcto) → no se toca');
  ok(C.propuesta('2026-10-16','NOCHE',lima('2026-10-16',23,0))===null,'creado 23:00 con fecha del día → correcto');
  ok(C.propuesta('2026-10-16','DÍA',lima('2026-10-16',3,0))===null,'un DÍA nunca se propone');
  const d=C.detectar({
    paletas:[{id:'p1',linea:'B7L',turno:'NOCHE',fecha:'2026-10-15',creadoEn:lima('2026-10-15',3,42),marca:'M'},{id:'p2',linea:'B7L',turno:'NOCHE',fecha:'2026-10-14',creadoEn:lima('2026-10-15',3,42)}],
    paradas:[{id:'a1',origen:'AVANCE',turno:'NOCHE',fecha:'2026-10-16',creadoEn:lima('2026-10-16',2,0),linea:'PET2'},{id:'a2',origen:'REGISTRO',turno:'NOCHE',fecha:'2026-10-16',creadoEn:lima('2026-10-16',2,0)}],
    snapshots:[{id:'s1',turno:'NOCHE',fecha:'2026-10-16',generadoEn:lima('2026-10-16',1,31),tipo:'AVANCE'}],
    programaciones:[{clave:'PET1|2026-10-13|NOCHE|Scala|x',turno:'NOCHE',fecha:'2026-10-13',linea:'PET1',estadoOperacion:{inicio:lima('2026-10-13',1,20)}}],
    reportes:[{id:'r1',turno:'NOCHE',fecha:'2026-10-15',estadoRegistro:'EN_REGISTRO',creadoEn:lima('2026-10-15',5,10)},{id:'r2',turno:'NOCHE',fecha:'2026-10-15',estadoRegistro:'FINALIZADO',creadoEn:lima('2026-10-15',5,10)}]});
  ok(d.paletas.length===1&&d.paletas[0].propuesta==='2026-10-14','detecta 1 paleta (la bien fechada no)');
  ok(d.paradas.length===1&&d.paradas[0].id==='a1','detecta solo paradas de origen AVANCE');
  ok(d.snapshots.length===1&&d.programaciones.length===1&&d.reportes.length===1,'lista snapshots, programaciones y solo reportes EN_REGISTRO');
}

/* ===== archivos: los cambios están, con la marca FECHA-OPERATIVA ===== */
{
  const idx=leer('index.html');
  const pos=n=>idx.indexOf(n);
  ok(pos('01b-fecha-operativa.js')>0&&pos('01b-fecha-operativa.js')<pos('45-indicadores.js'),'01b-fecha-operativa.js carga antes de 45-indicadores.js');
  ok(pos('06d-corregir-fechas-noche.js')>pos('06c-migrar-fotos.js'),'06d se carga en index.html');
  for(const f of ['js/produccion/29-avance-produccion.js','js/produccion/06-registro.js','js/produccion/16-paletas.js','js/personal/13-tareo.js','js/personal/31-rotacion-supervisores.js','js/nucleo/02-estado.js','js/produccion/24-semaforo-produccion-actual.js','js/produccion/25-alertas-lineas.js']){
    ok(/FECHA-OPERATIVA/.test(leer(f)),'marca FECHA-OPERATIVA en '+f);
  }
  const todos=[];(function rec(d){fs.readdirSync(path.join(R,d),{withFileTypes:true}).forEach(x=>{const p=d+'/'+x.name;x.isDirectory()?rec(p):/\.js$/.test(x.name)&&todos.push(p);});})('js');
  const malos=todos.filter(f=>!/\/(76|77|79|71)-/.test(f)&&/toISOString\(\)\.slice\(0,\s*10\)/.test(leer(f)));
  ok(malos.length===0,'ningún toISOString().slice(0,10) sobre fechas de negocio'+(malos.length?': '+malos.join(', '):''));
}

/* ===== Avance: avCtx no puede devolver una NOCHE con fecha futura; avGenerar respeta la selección ===== */
{
  const src=leer('js/produccion/29-avance-produccion.js');
  ok(/if\(!avanceEstado\.manual\|\|!avanceEstado\.fecha\|\|!avanceEstado\.turno\)\{avanceEstado\.fecha=ctx\.fecha/.test(src),'avGenerar/avAbrirFlotante respetan la selección manual');
  ok(/avanceEstado\.manual=true;avanceEstado\.fecha=fecha/.test(src)&&/avanceEstado\.manual=true;avanceEstado\.turno=/.test(src),'elegir fecha o turno marca la selección como manual');
  ok(/Generado: /.test(src)&&/avTextoGenerado\(s\)/.test(src),'el PNG indica cuándo se generó (hora de Lima)');
}

console.log(fallas?`\n${fallas} FALLAS`:'\nTodo bien');
process.exit(fallas?1:0);
