/* Registro de producción · números confiables (auditoría 2026-11-05, punto 1):
   registros oficiales (sin repetidos ni borradores sumados), autollenado sin duplicar un producto repetido, B20L sin «sopladas»,
   cumplimiento sin lo producido fuera del plan, paletas acumuladas sin sumar, horas por defecto de NOCHE y datos imposibles al finalizar. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error('no se encontró '+n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}return src.slice(m.index,j+1)+'\n';}
const s06=leer('js/produccion/06-registro.js'),s05=leer('js/nucleo/05-utils.js'),s16=leer('js/produccion/16-paletas.js'),s35=leer('js/produccion/35-autollenado-registro.js');
const G=require('../js/nucleo/45-indicadores.js');

/* ---------- 1) registros oficiales ---------- */
const reg=(linea,fecha,turno,estado,actualizadoEn,ef)=>({linea,fecha,turno,grupoTurno:turno==='NOCHE'?'NOCHE':'DIA_INTERMEDIO',estadoRegistro:estado,actualizadoEn,finalizadoEn:estado==='FINALIZADO'?actualizadoEn:null,ef});
const lista=[reg('PET2','2026-10-15','NOCHE','EN_REGISTRO',1,100),reg('PET2','2026-10-15','NOCHE','EN_REGISTRO',5,200),reg('PET2','2026-10-15','NOCHE','FINALIZADO',3,300),
  reg('PET2','2026-10-15','NOCHE','EN_REGISTRO',9,400),reg('PET1','2026-11-04','DÍA','EN_REGISTRO',1,10),reg('PET1','2026-11-04','DÍA','EN_REGISTRO',2,20),
  reg('PET1','2099-03-01','DÍA','EN_REGISTRO',1,4800),reg('PET1','2099-03-01','INTERMEDIO','EN_REGISTRO',1,2900),{sinLinea:true}];
const of=G.registrosOficiales(lista);
ok(of.filter(r=>r.linea==='PET2').map(r=>r.ef).join()==='300','5 registros de PET2 15/10 Noche (1 finalizado y 4 abiertos): cuenta solo el finalizado');
ok(of.filter(r=>r.linea==='PET1'&&r.fecha==='2026-11-04').map(r=>r.ef).join()==='20','dos abiertos del mismo turno sin finalizar: cuenta solo el último actualizado');
ok(of.filter(r=>r.fecha==='2099-03-01').map(r=>r.ef).join()==='4800,2900','reportes antiguos separados de Día e Intermedio: cuentan los dos');
ok(of.some(r=>r.sinLinea)&&of.length===5,'lo que no tiene línea o fecha se conserva tal cual');
const usos=['js/produccion/09-resumen.js','js/produccion/49-resumen-indicadores.js','js/produccion/29-avance-produccion.js','js/produccion/24-semaforo-produccion-actual.js',
  'js/produccion/23b-tiempos-linea.js','js/produccion/14-exportar-general.js','js/produccion/08-graficos.js','js/produccion/46-proyeccion-avisos.js','js/produccion/47-analisis-paradas.js',
  'js/asistente/72-asistente-pantalla.js','js/asistente/73-reporte-general.js','js/asistente/91-control-proceso-excel.js'];
ok(usos.every(f=>/loadRecordsOficiales\(\)/.test(leer(f))),'Resumen, indicadores, Cierre, Producción actual, tiempos, exportación, gráficos, avisos, análisis y reportes usan los registros oficiales');
ok(/function loadRecordsOficiales\(\)/.test(leer('js/nucleo/45-indicadores.js'))&&!/loadRecordsOficiales/.test(leer('js/produccion/07-historial.js')),'el Historial sigue mostrando todos los registros');

/* ---------- cálculos del registro (06) ---------- */
const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,GlacialIndicadores:G};vm.createContext(sb);sb.window=sb;
vm.runInContext(extraer(s05,'num')+extraer(s05,'calcularHorasTurno')+['calcDerivedLegacy','calcDerivedCuadro','calcDerivedMulti','calcDerived','datosImposiblesCuadro','horasDefectoCuadro'].map(n=>extraer(s06,n)).join(''),sb);
const cu=(x)=>Object.assign({numero:1,marca:'Bells',presentacion:'7 L',horaInicio:'07:00',horaFin:'15:00',horasTurno:8,ratioNominal:1000,produccion:{programada:0,efectiva:0,sopladas:0},paradasProgramadas:[],paradasNoProgramadas:[],mermas:[]},x||{});

/* ---------- 3) B20L: «Bidones disponibles» no es sopladas ---------- */
const b20=sb.calcDerivedMulti({linea:'B20L',cuadros:[cu({produccion:{programada:600,efectiva:600,sopladas:1000},ratioNominal:100})]});
ok(b20.sopladas===0&&b20.calidad===null&&Math.round(b20.rendimiento*100)===75,'B20L: los 1000 bidones disponibles no entran como sopladas (rendimiento 75 %, no 125 %; sin calidad)');
const pet=sb.calcDerivedMulti({linea:'PET1',cuadros:[cu({produccion:{programada:7000,efectiva:7000,sopladas:8000}})]});
ok(pet.sopladas===8000&&pet.calidad>0,'PET1 sigue usando las sopladas');

/* ---------- 4) cumplimiento sin lo producido fuera del plan ---------- */
const cump=sb.calcDerivedMulti({linea:'PET1',cuadros:[cu({produccion:{programada:5000,efectiva:5000}}),cu({numero:2,marca:'Aro',produccion:{programada:0,efectiva:3000}})]});
ok(Math.round(cump.cumplimiento*100)===100&&cump.efectiva===8000,'cumplimiento 100 % (no 160 %): lo producido fuera del plan no suma al numerador; la producción total sigue siendo 8 000');

/* ---------- 6) horas por defecto según el turno ---------- */
const hn=sb.horasDefectoCuadro('NOCHE'),hd=sb.horasDefectoCuadro('DÍA');
ok(hn.inicio!==hd.inicio&&String(G.normalizarBloques(null).noche.inicio)===hn.inicio,'un reporte de NOCHE nace con las horas del bloque Noche ('+hn.inicio+'–'+hn.fin+'), no 07:00–19:00');
ok(/function blankCuadro\(lineKey, numero, turno\)/.test(s06)&&/blankCuadro\(\s*lineKey,\s*n,\s*turnoInicial\s*\)/.test(s06),'blankCuadro recibe el turno del reporte');
ok(/const antes=horasDefectoCuadro\(previo\),ahora=horasDefectoCuadro\(val\)/.test(s06),'al cambiar el turno, las horas por defecto que nadie editó pasan a las del turno nuevo');

/* ---------- 5) datos imposibles al finalizar ---------- */
const rep={linea:'PET1',fecha:'2026-11-04',turno:'DÍA'};
const di=q=>sb.datosImposiblesCuadro(cu(q),rep);
ok(!di({produccion:{programada:5000,efectiva:5000,sopladas:5200}}).length,'un cuadro normal no tiene avisos');
ok(di({paradasNoProgramadas:[{tiempoMin:5000}]}).some(t=>/paradas suman 5000 min/.test(t)),'parada de 5 000 min en un cuadro de 8 h: bloquea');
ok(di({paradasNoProgramadas:[{tiempoMin:-60}]}).some(t=>/negativos/.test(t))&&di({produccion:{efectiva:-500}}).some(t=>/negativa/.test(t)),'minutos o producción negativos: bloquea');
ok(di({horaFin:'07:00'}).some(t=>/iguales/.test(t)),'inicio y fin iguales (07:00–07:00, contaba 24 h): bloquea');
ok(di({horaInicio:'07:00',horaFin:'06:59'}).some(t=>/el cuadro dura/.test(t)),'cuadro más largo que el turno (07:00–06:59): bloquea');
ok(di({produccion:{programada:1,efectiva:999999}}).some(t=>/más del doble/.test(t))&&!di({produccion:{programada:1,efectiva:12000}}).length,'producción imposible (más del doble de la velocidad estándar): bloquea; 1,5 veces no');
ok(di({produccion:{efectiva:23925,sopladas:2485}}).some(t=>/mucho mayor que las botellas sopladas/.test(t))&&!di({produccion:{efectiva:13644,sopladas:13546}}).length,'efectiva mucho mayor que sopladas (23 925 contra 2 485): bloquea; una diferencia chica (13 644 contra 13 546) no');
ok(/datosImposiblesCuadro\(q,draft\)\.forEach/.test(extraer(s06,'validarReporteParaFinalizar'))&&/const n=num\(q\.numero\)/.test(extraer(s06,'validarReporteParaFinalizar')),'«Falta para finalizar» incluye los datos imposibles y usa el número real del cuadro');

/* ---------- 7) paletas acumuladas: no se suman fila por fila ---------- */
const sp={console,Math,Number,Array,Object,String,Map,Set,RegExp,JSON};vm.createContext(sp);
let consultas=[];
vm.runInContext(extraer(s05,'num')+extraer(s16,'normalizarClavePaletas')+extraer(s16,'glacialPaletasProducidas'),sp);
sp.resumenProgramacionCombinacionTurnos=(l,f,t,m)=>{consultas.push([l,f,t.join('+'),m].join('|'));return {unidadesProducidas:m==='Bells'?1620:500};};
const pals=[{linea:'PET1',fecha:'F',turno:'DÍA',marca:'Bells',presentacion:'7 L',totalUnidades:1296},{linea:'PET1',fecha:'F',turno:'INTERMEDIO',marca:'BELLS',presentacion:'7 L',totalUnidades:1620},
  {linea:'PET1',fecha:'F',turno:'NOCHE',marca:'Aro',presentacion:'7 L',totalUnidades:500}];
ok(sp.glacialPaletasProducidas(pals)===2120&&consultas.length===2,'«Completa 4 → 1 296» y «Completa 5 → 1 620» cuentan 1 620 (no 2 916): una consulta por producto y bloque');
ok(/glacialPaletasProducidas\(palLinea\)/.test(leer('js/produccion/09-resumen.js'))&&/glacialPaletasProducidas\(delGrupo\)/.test(leer('js/produccion/49-resumen-indicadores.js')),'el Resumen y el aviso de diferencia con Paletas usan el producido real de Paletas');

/* ---------- 2) autollenado: el mismo producto en dos cuadros ---------- */
{
  const FECHA='2026-10-14';
  const s45=leer('js/nucleo/45-indicadores.js');
  const sa={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Promise,Error,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},Intl};
  vm.createContext(sa);sa.window=sa;
  sa.document={getElementById:()=>null,createElement:()=>({appendChild(){},remove(){}}),head:{appendChild(){}},body:{appendChild(){}},querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},activeElement:null};
  vm.runInContext(s45,sa);
  const pal=(id,marca,paletas,und,hora,c)=>({id,linea:'B7L',fecha:FECHA,turno:'DÍA',marca,presentacion:'7 Litros',tipoPaleta:'COMPLETA',paletas,totalUnidades:und,hora,creadoEn:c});
  const cuadro=marca=>({marca,presentacion:'7 Litros',produccion:{programada:0,efectiva:0},paradasProgramadas:[],paradasNoProgramadas:[]});
  sa.__pal=[pal('b1','BELLS',30,3600,'18:07',3),pal('a1','ARO',3,378,'18:06',1)];
  sa.__prog=[{clave:'B7L|'+FECHA+'|DÍA|BELLS|7 Litros',linea:'B7L',fecha:FECHA,turno:'DÍA',marca:'BELLS',presentacion:'7 Litros',cantidadProgramada:4800,unidadesPorPaleta:120}];
  sa.__draft={id:'r1',linea:'B7L',fecha:FECHA,turno:'DÍA',estadoRegistro:'EN_REGISTRO',cuadros:[cuadro('BELLS'),cuadro('ARO'),cuadro('BELLS')]};
  vm.runInContext(`
    var state={user:{nombre:'sup',rol:'Supervisor'},currentTab:'nuevo',currentLine:'B7L'};
    var draft=globalThis.__draft;
    function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
    function normalizarTexto(t){return String(t||'').toLowerCase();}
    function escaparHtml(t){return String(t??'');}
    function tienePermiso(){return true;}
    function loadPaletas(){return globalThis.__pal;} function loadProgramaciones(){return globalThis.__prog;}
    function obtenerUnidadesPorPalet(){return 120;}
    function normalizarCuadros(d){return d.cuadros;} function generarIdParadaProduccion(){return 'p';}
    function reporteEstaBloqueado(){return false;}
    function renderFormTab(){} function renderMain(){} function programarGuardadoAutomaticoReporte(){}
    function onPaletasUpdated(){} function onProgramacionesUpdated(){}
  `,sa);
  vm.runInContext(s16,sa);vm.runInContext(s35,sa);
  vm.runInContext('renderFormTab()',sa);
  const ef=sa.draft.cuadros.map(c=>c.produccion.efectiva),pr=sa.draft.cuadros.map(c=>c.produccion.programada);
  ok(ef.join()==='3600,378,0'&&pr.join()==='4800,0,0','BELLS repetido en el cuadro 3: Paletas y la programación se cargan solo en el primer cuadro (3 978 en total, no 7 578)');
  ok(sa.draft.cuadros[2].autoDuplicadoDe===1&&!sa.draft.cuadros[0].autoDuplicadoDe,'el cuadro repetido queda marcado «mismo producto que la Producción 1»');
  ok(/Mismo producto que la Producción \$\{q\.autoDuplicadoDe\}/.test(s06),'la pantalla muestra el aviso junto a la Efectiva');
}

console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
