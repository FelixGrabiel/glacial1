/* Marcas ajenas al plan y cumplimiento mezclado (caso PET2 · 13/10/2026 · Noche: plan Fontlife, Paletas con Scala).
   Causa: Producción Actual (24-semaforo…, dibujarTablero y glacialResumenEjecutivoLineas) metía en la lista de la línea toda
   combinación con unidades en Paletas aunque no tuviera programación; esa marca quedaba EN CURSO (producido > 0, programado 0)
   y sus unidades entraban al total producido que se divide por el programado de las marcas del plan.
   Datos aislados de prueba: no se leen ni se modifican registros reales. */
const fs=require('fs'),vm=require('vm');
const R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('(?:async[ ]+)?function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error('no se encontró '+n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}return src.slice(m.index,j+1)+'\n';}
const G=require(R+'/js/nucleo/45-indicadores.js');
const s24=leer('js/produccion/24-semaforo-produccion-actual.js'),s16=leer('js/produccion/16-paletas.js');

const L='PET2',F='2026-10-13';
const it=(o)=>Object.assign({linea:L,fecha:F,turno:'NOCHE',presentacion:'1 L · PACK X 12 UND',enPlan:true,programado:0,producido:0},o);
const FONT=it({marca:'Fontlife',enPlan:true,programado:45000,producido:0});
const SCALA=it({marca:'Scala',enPlan:false,producido:24696});
const ctxNoche={linea:L,fecha:F,bloque:'noche'};

/* ---------- reproducción: la agregación anterior ---------- */
const antes=G.cumplimiento(FONT.producido+SCALA.producido,FONT.programado);
ok(Math.abs(antes*100-54.88)<0.01,'reproducción: sumar Scala al producido de la línea daba 24 696 / 45 000 = 54.9 % (el defecto de la captura)');

/* 2 y 3 · misma línea, fecha y bloque: fuera de programación, sin completar el plan de Fontlife */
let r=G.produccionPlanYFuera([FONT,SCALA],ctxNoche);
ok(r.plan.length===1&&r.plan[0].marca==='Fontlife','2 · el plan solo tiene Fontlife (Scala no se agrega como tramo con cero)');
ok(r.fuera.length===1&&r.fuera[0].marca==='Scala'&&r.fuera[0].producido===24696,'2 · Scala aparece como producción fuera de programación con sus 24 696 UND');
ok(r.totales.cumplimientoPlan===0&&r.totales.producidoPlan===0&&r.totales.programado===45000,'3 · Fontlife 0 / 45 000: cumplimiento del plan 0 %, no 54.9 %');

/* 1 y 7 · Scala de otro bloque (Día + Intermedio del mismo día, o bloque anterior/futuro): no aparece */
r=G.produccionPlanYFuera([FONT,it({marca:'Scala',turno:'DÍA',enPlan:false,producido:24696})],ctxNoche);
ok(r.fuera.length===0&&r.ajenos.length===1&&r.totales.producidoFisico===0,'1 · Scala producida en Día + Intermedio no aparece en la Noche (ni en totales)');
r=G.produccionPlanYFuera([it({marca:'Fontlife',turno:'DÍA',enPlan:true,programado:30000,producido:30000})],ctxNoche);
ok(r.plan.length===0&&r.totales.producidoPlan===0,'7 · un bloque futuro/otro no hereda producción ni estado del bloque anterior');

/* 4 · mismo volumen, distinta marca o empaque */
r=G.produccionPlanYFuera([FONT,it({marca:'Fontlife',presentacion:'1 L · PACK X 6 UND',enPlan:false,producido:1200}),it({marca:'Scala',enPlan:false,producido:500})],ctxNoche);
ok(r.plan.length===1&&r.fuera.length===2&&r.totales.producidoPlan===0,'4 · 1 L × 6 no se une con 1 L × 12 ni Scala con Fontlife por compartir volumen');

/* 5 · PET1 y PET2 aislados */
r=G.produccionPlanYFuera([FONT,it({linea:'PET1',marca:'Fontlife',enPlan:true,programado:45000,producido:40000})],ctxNoche);
ok(r.plan.length===1&&r.plan[0].linea==='PET2'&&r.totales.producidoPlan===0&&r.ajenos.length===1,'5 · la producción de PET1 no cuenta en PET2');

/* 6 · Noche después de medianoche conserva la fecha operativa */
const madrugada=new Date(2026,9,14,2,30).getTime();
ok(G.diaOperativo(madrugada)==='2026-10-13'&&G.claveBloque('NOCHE')==='noche','6 · 14/10 02:30 pertenece al día operativo 13/10, bloque Noche');

/* 8 · Paletas y cierre no se suman */
ok(G.produccionVigente({turnoEnCurso:true,paletas:5000,registro:4800})===5000&&G.produccionVigente({turnoEnCurso:false,paletas:5000,registro:4800})===4800,
  '8 · bloque en curso → Paletas; cerrado → registro; nunca la suma');

/* 9, 12 y 16 · Completar cantidad pendiente y Todo el turno: siguen en el plan sin cantidad firme; pendiente ≠ cero */
const COMPLETAR=it({marca:'Bells',enPlan:true,programado:0,producido:0});
r=G.produccionPlanYFuera([COMPLETAR,it({marca:'Bells',turno:'DÍA',enPlan:true,programado:0,producido:9000})],ctxNoche);
ok(r.plan.length===1&&r.totales.producidoPlan===0,'9 · el cierre de referencia (otro bloque) no se suma al producido del bloque destino');
ok(r.totales.cumplimientoPlan===null,'16 · saldo «Por calcular» (programado 0) da cumplimiento sin dato (null), no 0 % ni 100 %');
r=G.produccionPlanYFuera([FONT,COMPLETAR],ctxNoche);
ok(r.plan.length===2,'12 · «Todo el turno» y «Completar cantidad» pendiente no se eliminan por no tener cantidad firme');

/* 17 · totales reconciliados; Día e Intermedio cuentan una vez */
const DI=o=>it(Object.assign({turno:'DÍA'},o));
r=G.produccionPlanYFuera([DI({marca:'Bells',programado:10000,producido:8000}),DI({marca:'Bells',turno:'INTERMEDIO',programado:10000,producido:8000}),
  DI({marca:'Scala',enPlan:false,producido:3000}),DI({marca:'Scala',turno:'INTERMEDIO',enPlan:false,producido:3000})],{linea:L,fecha:F,bloque:'diaInter'});
ok(r.totales.programado===10000&&r.totales.producidoPlan===8000&&r.totales.producidoFuera===3000&&r.totales.producidoFisico===11000,
  '17 · Día + Intermedio: plan 8 000 / 10 000, fuera 3 000, total físico 11 000 (sin doble conteo)');

/* ---------- estadoFila (24): marca fuera del plan solo lo que no tiene fila de programación en el bloque ---------- */
function filaDe(progs,linea,fecha,turno,marca,pres){
  const sb={console,Math,Number,Array,Object,String,window:{}};vm.createContext(sb);
  sb.GlacialIndicadores=G;sb.window.GlacialIndicadores=G;
  sb.loadProgramaciones=()=>progs;sb.obtenerRatioNominal=()=>0;sb.horario=()=>null;sb.turnoActivo=()=>true;sb.quienControla=()=>'';
  sb.resumenProgramacionCombinacionTurnos=()=>({unidadesProducidas:24696,cantidadProgramada:0});
  vm.runInContext('var num=v=>{const n=Number(v);return isFinite(n)?n:0;};var MS_HORA=3600000,MIN_INICIO=10;'+
    extraer(s16,'claveProgramacionPaleta')+extraer(s16,'obtenerProgramacionPaleta')+extraer(s24,'estadoFila'),sb);
  return vm.runInContext('estadoFila',sb)(linea,fecha,turno,marca,pres,Date.now());
}
const P=(t,m,c,extra)=>Object.assign({clave:[L,F,t,m,'1L12'].join('|'),linea:L,fecha:F,turno:t,marca:m,presentacion:'1L12',cantidadProgramada:c},extra||{});
const plan=[P('NOCHE','Fontlife',45000,{modo:'TURNO'})];
ok(filaDe(plan,L,F,'NOCHE','Scala','1L12').fueraPlan===true,'estadoFila: Scala sin fila de programación en la Noche → fuera del plan');
ok(filaDe(plan,L,F,'NOCHE','Fontlife','1L12').fueraPlan===false,'estadoFila: Fontlife (Todo el turno) → del plan');
const conPendiente=[P('DÍA','Bells',0,{modo:'COMPLETAR',meta:{resolucion:{estado:'PENDIENTE_CIERRE'}}})];
const xInter=filaDe(conPendiente,L,F,'INTERMEDIO','Bells','1L12');
ok(xInter.fueraPlan===false&&xInter.prog&&xInter.turnoPlan==='DÍA','estadoFila: «Completar cantidad» pendiente (fila con 0) sigue en el plan y Día e Intermedio usan la misma fila');
const xFuera=filaDe([],L,F,'INTERMEDIO','Scala','1L12');
ok(xFuera.fueraPlan===true&&xFuera.turnoPlan==='DÍA','estadoFila: fuera del plan en Intermedio usa la clave del bloque (Día) para no contarse dos veces');

/* ---------- 10 y 11 · quitar/sustituir reconcilia la secuencia; repeticiones legítimas se conservan ---------- */
{
  const sb={console,Math,Number,Array,Object,String,Error};vm.createContext(sb);
  vm.runInContext('var num=v=>{const n=Number(v);return isFinite(n)?n:0;};'+extraer(s16,'claveProgramacionPaleta')+extraer(s16,'programacionConflicto')+extraer(s16,'programacionAplicarEnLista')+extraer(s24,'secuenciaPlanificada'),sb);
  const filas=[P('NOCHE','Scala',20000,{tramosSecuencia:[{id:'t1',orden:1,tipoFin:'CANTIDAD'},{id:'t3',orden:3,tipoFin:'CIERRE'}]}),
    P('NOCHE','Bells',10000,{tramosSecuencia:[{id:'t2',orden:2,tipoFin:'CANTIDAD'}]})];
  sb.loadProgramaciones=()=>filas;
  const sec=vm.runInContext('secuenciaPlanificada',sb)(L,F,'NOCHE').map(t=>t.marca).join('→');
  ok(sec==='Scala→Bells→Scala','11 · repetición legítima SCALA → BELLS → SCALA conservada por id de tramo');
  const r2=vm.runInContext('programacionAplicarEnLista',sb)(filas.slice(),{linea:L,fecha:F,turno:'NOCHE',marca:'Scala',presentacion:'1L12',cantidadNum:0,uppNum:12,campos:{}},{});
  sb.loadProgramaciones=()=>r2.items;
  ok(vm.runInContext('secuenciaPlanificada',sb)(L,F,'NOCHE').map(t=>t.marca).join('→')==='Bells','10 · quitar Scala del plan elimina su fila y sus tramos: la secuencia ya no lo trae de vuelta');
  ok(filaDe(r2.items,L,F,'NOCHE','Scala','1L12').fueraPlan===true,'10 · si Scala siguió produciendo después de quitarla, sus unidades quedan fuera de programación (no se borran)');
}

/* ---------- conexión en las pantallas (estructura del código) ---------- */
const grupo=s24.slice(s24.indexOf('function construirGrupoTurno'),s24.indexOf('const grupos=LINES.flatMap'));
ok(/GlacialIndicadores\.produccionPlanYFuera\(/.test(grupo)&&/const items=separado\.plan\.map/.test(grupo),'tablero: la secuencia, el estado y el cumplimiento se arman solo con los productos del plan');
ok(/aplicarEstadoVisualSecuencia\(\s*items,/.test(grupo)&&/desgloseLineaPorMarca\(items\.map/.test(grupo),'13 · próximo producto y estado de la línea salen de la secuencia vigente del plan (sin la marca fuera del plan)');
ok(/const totalProd=separado\.totales\.producidoPlan/.test(grupo)&&/const totalFisico=separado\.totales\.producidoFisico/.test(grupo),'tablero: cumplimiento con producción del plan; producción total de la línea aparte');
ok(/PRODUCCIÓN FUERA DE PROGRAMACIÓN/.test(s24)&&/FUERA DE PROGRAMACIÓN<\/small>/.test(s24)&&/PRODUCCIÓN TOTAL DE LA LÍNEA/.test(s24),'tablero: sección y KPIs diferenciados de producción fuera de programación');
ok(/Fuente: \$\{produccionDesdePaletas\(x\)/.test(s24),'tablero: cada producto fuera del plan indica su fuente (Paletas o registro del bloque)');
ok(/AVANCE FRENTE AL ESTIMADO/.test(s24)&&/del estimado/.test(s24),'Todo el turno / Hasta una hora: «Avance frente al estimado», no pedido firme');
const ejec=s24.slice(s24.indexOf('window.glacialResumenEjecutivoLineas'));
ok(/produccionPlanYFuera\(/.test(ejec)&&/producidoFuera:separado\.totales\.producidoFuera/.test(ejec),'Inicio y resúmenes (glacialResumenEjecutivoLineas): mismo criterio que el tablero');
ok(/p\.progUnit&&!p\.fueraPlan/.test(leer('js/produccion/49-resumen-indicadores.js')),'Resumen de indicadores en vivo: lo de fuera del plan no entra al cumplimiento (sí a la producción física)');
ok(/Fuera de programación/.test(leer('js/accesos/32-dashboard-perfiles.js'))&&/fueraDePlan/.test(s16),'Inicio y tabla técnica de Producción Actual marcan la producción fuera de programación');

console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
