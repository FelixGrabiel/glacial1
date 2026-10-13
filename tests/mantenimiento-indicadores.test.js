/* Mantenimiento · MTTR y MTBF por equipo: espera separada del trabajo, casos incompletos excluidos e identificados, avisos de una misma falla sin duplicar,
   históricos sin equipo conservados sin clasificación inventada, «Datos insuficientes» sin horas de operación, sin cero ni infinito y sin tocar paradas oficiales. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Promise,Error};vm.createContext(sb);sb.window=sb;
vm.runInContext(leer('js/mantenimiento/67-intervenciones-motor.js'),sb);
vm.runInContext(leer('js/mantenimiento/67f-indicadores-equipo.js'),sb);
const M=sb.GlacialIntervenciones,I=sb.glacialIndicadoresEquipo;
const min=n=>n*60000;
const T0=Date.parse('2099-03-01T08:00:00');
const dia=n=>T0+n*86400000;
const por={nombre:'Ana Pérez',tecnicoId:'w1',uid:'uid-cuenta',cuenta:'mant',identificadoPor:'PIN'};

/* Falla cerrada: abre en t0, inicia a +respuesta, trabajo, espera opcional, cierra. */
function falla(o){
  let d=M.nueva({id:o.id,linea:o.linea||'PET1',equipoId:o.equipoId===undefined?'eq_1':o.equipoId,equipoNombre:'Sopladora 1',tipo:o.tipo||'CORRECTIVO',problema:'La máquina se detuvo por una falla',origen:o.origen||{tipo:'PARADA',id:'par_'+o.id,paradaId:'par_'+o.id}},por,o.t0);
  if(o.estado==='PENDIENTE'||o.estado==='ABIERTA')return d;
  d=M.aplicar(d,'INICIAR',{},por,o.t0+min(o.respuesta||10));
  let t=o.t0+min(o.respuesta||10);
  if(o.espera){d=M.aplicar(d,'ESPERA',{motivo:'REPUESTO'},por,t+min(o.trabajoAntes||20));d=M.aplicar(d,'RETOMAR',{},por,t+min(o.trabajoAntes||20)+min(o.espera));t=t+min(o.trabajoAntes||20)+min(o.espera);}
  d=M.aplicar(d,'REPUESTO',{id:'r'+o.id,descripcion:'Sello',cantidad:1,unidad:'UND'},por,t+min(1));
  const fin=o.fin!==undefined?o.fin:t+min(o.trabajo-(o.trabajoAntes&&o.espera?o.trabajoAntes:0));
  if(o.estado==='CANCELADA')return M.aplicar(d,'CANCELAR',{motivo:'No era una falla'},por,fin);
  d=M.aplicar(d,'CERRAR',{equipoId:o.equipoId===undefined?'eq_1':o.equipoId,equipoNombre:'Sopladora 1',equipoJustificacion:'No se pudo identificar el equipo',diagnostico:'Se encontró el elemento dañado',accion:'Se reemplazó el elemento dañado',sinRepuestos:false,
    resultado:o.resultado||'OPERATIVO_VERIFICADO',pendientes:o.resultado==='NO_OPERATIVO'?'Falta repuesto, sigue limitado':'',finRealMs:fin,responsableId:'w1'},por,fin+min(o.admin||0));
  return d;
}
const eqs=[{id:'eq_1',nombre:'Sopladora 1',linea:'PET1',compartidoCon:[],activo:true},{id:'eq_2',nombre:'Envasadora',linea:'PET1',compartidoCon:[],activo:true},{id:'eq_c',nombre:'Compresor',linea:'PLANTA',compartidoCon:['PET1','PET2'],activo:true}];
const expo=(minPorDia,dias)=>(linea,f)=>{if(linea!=='PET1')return null;const n=Math.round((Date.parse(f+'T12:00:00')-Date.parse(new Date(T0).toISOString().slice(0,10)+'T12:00:00'))/86400000);return n>=0&&n<dias?minPorDia:null;};
const opts=(extra)=>Object.assign({desdeMs:T0-86400000,hastaMs:dia(10),equipos:eqs,exposicion:expo(600,10),diaDe:ms=>{const d=new Date(ms);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}},extra||{});

/* ---------- MTTR: trabajo sin espera ---------- */
{
  const a=falla({id:'a',t0:dia(1),respuesta:10,trabajo:60,admin:30});                        // trabajo 60
  const b=falla({id:'b',t0:dia(2),respuesta:20,trabajoAntes:30,espera:90,trabajo:120+30,admin:0});  // 30 + 120 de trabajo = 150? (se calcula abajo)
  const r=I.calcular([a,b],opts());
  const e=r.porEquipo[0];
  const ta=M.tiempos(a,null),tb=M.tiempos(b,null);
  ok(e.equipoId==='eq_1'&&e.fallas===2&&e.casosMttr===2,'2 fallas elegibles del equipo');
  ok(Math.round(ta.trabajoMs/60000)===60&&ta.administrativoMs===min(30)&&tb.esperaMs===min(90),'la intervención A: 60 min de trabajo y 30 de tiempo administrativo; la B: 90 min de espera');
  ok(Math.abs(e.mttrMin-((ta.trabajoMs+tb.trabajoMs)/2/60000))<1e-6&&e.esperaMin===(90)/2&&e.respuestaMin===15&&e.adminMin===15,'MTTR = promedio del trabajo activo SIN esperas; espera, respuesta y administrativo se informan aparte');
  const apertura=((a.cierre.en-a.abiertaMs)+(b.cierre.en-b.abiertaMs))/2/60000;
  ok(e.mttrMin<apertura-20,'no usa indiscriminadamente apertura → cierre (daría '+Math.round(apertura)+' min contra '+Math.round(e.mttrMin)+')');
  ok(e.pocosCasos===true&&e.casosMttr===2,'con menos de 3 casos se marca «pocos casos» y se muestra el número de casos');
}
/* ---------- exclusiones identificadas ---------- */
{
  const cerrada=falla({id:'c',t0:dia(1),trabajo:60});
  const abierta=falla({id:'d',t0:dia(2),estado:'PENDIENTE'});
  const noOp=falla({id:'e',t0:dia(3),trabajo:45,resultado:'NO_OPERATIVO'});
  const prev=falla({id:'f',t0:dia(4),trabajo:30,tipo:'PREVENTIVO',origen:{tipo:'PLAN',id:'pl|1'}});
  const canc=falla({id:'g',t0:dia(5),estado:'CANCELADA',trabajo:5});
  const sinFin=Object.assign({},falla({id:'h',t0:dia(6),trabajo:30}),{finRealMs:0});
  const fuera=falla({id:'i',t0:dia(30),trabajo:30});
  const r=I.calcular([cerrada,abierta,noOp,prev,canc,sinFin,fuera],opts());
  const e=r.porEquipo[0];
  ok(e.fallas===4&&e.casosMttr===1&&e.excluidosMttr.abiertas===1&&e.excluidosMttr.noOperativo===1&&e.excluidosMttr.sinInicioFin===1,'fallas: 4 (cerrada, abierta, no operativa, sin fin real); solo 1 caso entra al MTTR y las otras 3 se identifican con su motivo');
  ok(r.excluidas.preventivas===1&&r.excluidas.canceladas===1&&r.excluidas.fueraDePeriodo===1,'preventivos, canceladas y fuera de período NO entran (y se cuentan)');
  ok(e.casos.filter(c=>c.mttr===null).every(c=>c.motivo.length>5),'cada caso excluido del MTTR dice por qué');
  ok(Math.round(e.mttrMin)===60,'el MTTR solo usa el caso elegible (60 min)');
}
/* ---------- misma falla: sin duplicar ---------- */
{
  const origen={tipo:'PARADA',id:'par_X',paradaId:'par_X'};
  const x1=falla({id:'x1',t0:dia(1),trabajo:30,origen}),x2=falla({id:'x2',t0:dia(1)+min(5),trabajo:40,origen}),x3=falla({id:'x3',t0:dia(1)+min(9),trabajo:50,origen});
  const otraFalla=falla({id:'y',t0:dia(2),trabajo:60});
  const r=I.calcular([x1,x2,x3,otraFalla],opts());
  const e=r.porEquipo[0];
  ok(e.fallas===2&&e.deduplicadas===2,'tres avisos/intervenciones de la misma falla (misma parada y equipo) cuentan UNA falla; otra falla distinta suma 2');
  const otroEquipo=falla({id:'x4',t0:dia(1),trabajo:30,origen,equipoId:'eq_2'});
  const r2=I.calcular([x1,otroEquipo],opts());
  ok(r2.porEquipo.length===2&&r2.porEquipo.every(q=>q.fallas===1),'la misma parada con DOS equipos distintos son dos fallas (cada equipo la suya)');
}
/* ---------- históricos sin equipo ---------- */
{
  const sinEq=falla({id:'s1',t0:dia(1),trabajo:30,equipoId:''});
  ok(sinEq.equipoId===''&&sinEq.equipoJustificacion!==undefined,'un cierre sin equipo exige justificación y queda sin equipo');
  const r=I.calcular([sinEq,falla({id:'s2',t0:dia(2),trabajo:30})],opts());
  ok(r.sinEquipo.length===1&&r.porEquipo.length===1&&r.porEquipo[0].fallas===1&&r.advertencias.some(a=>/sin equipo identificado/.test(a)),'las fallas sin equipo identificado se conservan aparte y NO se atribuyen a ningún equipo');
  const antiguo={id:'viejo',tipo:'CORRECTIVO',estado:'CERRADA',equipoId:'',linea:'PET1',abiertaMs:dia(3),origen:{tipo:'MANUAL'},historial:[],resultado:'OPERATIVO_VERIFICADO'};
  const r2=I.calcular([antiguo],opts());
  ok(r2.sinEquipo.length===1&&r2.porEquipo.length===0&&r2.totales.fallas===0,'un registro sin equipo no inventa ninguno ni cambia los totales por equipo');
}
/* ---------- MTBF ---------- */
{
  const f1=falla({id:'m1',t0:dia(2),trabajo:30}),f2=falla({id:'m2',t0:dia(6),trabajo:30});
  const r=I.calcular([f1,f2],opts());
  const m=r.porEquipo[0].mtbf;
  ok(m.estado==='OK'&&Math.abs(m.horas-50)<1e-9&&m.exposicionH===100&&m.fallasCubiertas===2&&m.coberturaDias===10,'MTBF = 100 h de línea en marcha ÷ 2 fallas = 50 h, con su cobertura (10 de 11 días con horas medidas)');
  ok(Number.isFinite(m.horas)&&m.horas>0,'el MTBF es un número finito mayor que cero');
  const sinHoras=I.calcular([f1,f2],opts({exposicion:()=>null}));
  ok(sinHoras.porEquipo[0].mtbf.estado==='DATOS_INSUFICIENTES'&&sinHoras.porEquipo[0].mtbf.horas===null&&/horas de línea en marcha medidas/.test(sinHoras.porEquipo[0].mtbf.motivo),'sin horas de operación medidas: «Datos insuficientes» e indica qué falta (no usa horas calendario)');
  const sinFuente=I.calcular([f1,f2],opts({exposicion:undefined}));
  ok(sinFuente.porEquipo[0].mtbf.estado==='DATOS_INSUFICIENTES'&&/fuente/.test(sinFuente.porEquipo[0].mtbf.motivo),'sin fuente de horas: «Datos insuficientes»');
  const poco=I.calcular([f1],opts({exposicion:expo(60,3)}));
  ok(poco.porEquipo[0].mtbf.estado==='DATOS_INSUFICIENTES'&&/mínimo/.test(poco.porEquipo[0].mtbf.motivo),'con muy pocas horas medidas (3 h) no se calcula');
  const compartido=I.calcular([falla({id:'cmp',t0:dia(2),trabajo:30,equipoId:'eq_c',linea:'PET1'})],opts());
  ok(compartido.porEquipo[0].mtbf.estado==='DATOS_INSUFICIENTES'&&/compartido/.test(compartido.porEquipo[0].mtbf.motivo),'un equipo compartido entre líneas no recibe MTBF (no se sabe qué línea lo usó)');
  const sinFallas=I.calcular([falla({id:'z1',t0:dia(2),trabajo:30,equipoId:'eq_1'})],opts({desdeMs:dia(8),hastaMs:dia(10)}));
  ok(sinFallas.porEquipo.length===0,'sin fallas en el período no hay MTBF');
  const diaSinCobertura=I.calcular([falla({id:'q1',t0:dia(2),trabajo:30})],opts({exposicion:(l,f)=>f>='2099-03-05'?600:null}));
  ok(diaSinCobertura.porEquipo[0].mtbf.estado==='SIN_FALLAS'&&diaSinCobertura.porEquipo[0].mtbf.horas===null&&/sin horas/.test(diaSinCobertura.porEquipo[0].mtbf.motivo),'una falla ocurrida en un día sin horas medidas no se mezcla con una exposición de otros días (ni sale cero ni infinito)');
  const todos=[].concat(r.porEquipo,sinHoras.porEquipo,sinFuente.porEquipo,poco.porEquipo,compartido.porEquipo,diaSinCobertura.porEquipo);
  ok(todos.every(e=>e.mtbf.horas===null||(Number.isFinite(e.mtbf.horas)&&e.mtbf.horas>0)),'ningún MTBF es cero, infinito o NaN');
}
/* ---------- no toca lo oficial ---------- */
{
  const src=leer('js/mantenimiento/67f-indicadores-equipo.js').replace(/\/\*[^]*?\*\//g,'');
  ok(!/runTransaction|FieldValue|db\.collection|batch\(|\.accion\(|\.abrir\(/.test(src),'los indicadores solo leen: no escriben nada');
  ok(!/avancesTurno|bitacoraMantenimiento|paradasOperativas|estadoOperacion|calcularTiemposLinea/.test(src),'no tocan paradas oficiales, Avance/Cierre ni el ratio de producción');
  ok(/listarUnidades/.test(src)&&/enMarcha/.test(src),'la exposición sale de las horas de línea en marcha de Análisis de paradas (solo lectura)');
  const idx=leer('index.html');
  ok(idx.indexOf('67e-preventivos.js')<idx.indexOf('67f-indicadores-equipo.js'),'index.html carga los indicadores al final');
}
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
