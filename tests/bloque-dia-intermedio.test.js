/* Parte B: bloque productivo Día + Intermedio (programado único, continuidad, franja sin producción, relevo vs cierre). */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const G=require('../js/nucleo/45-indicadores.js');
const ms=(h,m,d)=>new Date(2026,9,d||5,h,m||0).getTime();
const hhmm=t=>{const x=new Date(t);return String(x.getHours()).padStart(2,'0')+':'+String(x.getMinutes()).padStart(2,'0');};
const FECHA='2026-10-05';

/* ---------- 1) programado del bloque: UNA función ---------- */
function entorno(progs){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout,clearTimeout,setInterval:()=>0};
  vm.createContext(sb);sb.window=sb;
  sb.loadProgramaciones=()=>progs;sb.loadRecords=()=>[];sb.avanceEstado={unsubscribe:true,paradasOperativas:[]};
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  vm.runInContext(leer('js/produccion/23b-tiempos-linea.js'),sb);
  return sb;
}
const fila=(turno,c,extra)=>Object.assign({clave:'k'+turno+c,linea:'PET1',fecha:FECHA,turno,marca:'Scala',presentacion:'2.5 L',cantidadProgramada:c,estadoOperacion:{estado:'PENDIENTE'}},extra||{});
let sb=entorno([fila('DÍA',12000),fila('INTERMEDIO',8000)]);
let b=sb.glacialProgramadoBloque('PET1',FECHA,'INTERMEDIO');
ok(b.cantidad===20000,'el programado del bloque es la suma de las filas Día (12,000) + Intermedio (8,000) = 20,000');
ok(sb.glacialProgramadoBloque('PET1',FECHA,'DÍA').cantidad===20000,'se obtiene lo mismo se consulte por Día o por Intermedio (no hay regla «si Día > 0»)');
ok(sb.glacialProgramadoBloque('PET1',FECHA,'NOCHE').cantidad===0,'Noche tiene su propia programación (en cero)');
ok(!b.productos[0].duplicadoPosible,'cantidades distintas: no es posible duplicado');
sb=entorno([fila('DÍA',12000),fila('INTERMEDIO',12000)]);
ok(sb.glacialProgramadoBloque('PET1',FECHA,'DÍA').productos[0].duplicadoPosible===true&&sb.glacialProgramadoBloque('PET1',FECHA,'DÍA').cantidad===24000,'misma cantidad en Día e Intermedio: se marca «posible duplicado» y sigue sumando (no se corrige solo)');
sb=entorno([fila('INTERMEDIO',8000)]);
ok(sb.glacialProgramadoBloque('PET1',FECHA,'DÍA').cantidad===8000,'programación solo de Intermedio (ya guardada): vale y cuenta en el bloque');
sb=entorno([fila('DÍA',12000),fila('INTERMEDIO',8000,{estadoOperacion:{estado:'CANCELADA'}})]);
ok(sb.glacialProgramadoBloque('PET1',FECHA,'DÍA').cantidad===12000,'las canceladas no cuentan');
sb=entorno([fila('DÍA',12000),fila('DÍA',3000,{marca:'Bells',clave:'x'})]);
ok(sb.glacialProgramadoBloque('PET1',FECHA,'DÍA').productos.length===2&&sb.glacialProgramadoBloque('PET1',FECHA,'DÍA',{marca:'Bells'}).cantidad===3000,'varios productos: total y detalle por producto (con filtro por marca)');

/* ---------- 2) continuidad: Intermedio ve el mismo programado, producido y avance ---------- */
const s24=leer('js/produccion/24-semaforo-produccion-actual.js');
const a=s24.indexOf('  const resumenTurnosAnterior=resumenProgramacionCombinacionTurnos;');
const z=s24.indexOf('  const uppAnterior=unidadesPorPaletaActiva;');
const trozo=s24.slice(a,z);
const llamadas=[];
const sbr={Math,Number,Array,Object,String,Set};vm.createContext(sbr);sbr.window=sbr;
sbr.num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
sbr.obtenerProgramacionPaleta=()=>({unidadesPorPaleta:1200});
sbr.resumenProgramacionCombinacionTurnos=(l,f,turnos)=>{llamadas.push(turnos.slice());return {cantidadProgramada:20000,unidadesProducidas:12000,unidadesPorPaleta:0};};
vm.runInContext(trozo+';this.R=resumenProgramacionCombinacionTurnos;',sbr);
let r=sbr.R('PET1',FECHA,['DÍA'],'Scala','2.5 L');
ok(llamadas[0].join()==='DÍA,INTERMEDIO'&&r.cantidadProgramada===20000&&r.unidadesProducidas===12000,'consultar solo Día devuelve el BLOQUE: 12,000 / 20,000 (60 %)');
r=sbr.R('PET1',FECHA,['INTERMEDIO'],'Scala','2.5 L');
ok(llamadas[1].join()==='DÍA,INTERMEDIO'&&r.unidadesProducidas===12000&&r.cantidadProgramada===20000,'al entrar Intermedio se ve lo mismo: 12,000 / 20,000, nada se reinicia');
sbr.R('PET1',FECHA,['NOCHE'],'Scala','2.5 L');
ok(llamadas[2].join()==='NOCHE','Noche conserva su propio plan y producción');
sbr.R('PET1',FECHA,['DÍA','NOCHE'],'Scala','2.5 L');
ok(llamadas[3].includes('NOCHE')&&llamadas[3].includes('DÍA')&&llamadas[3].includes('INTERMEDIO'),'una consulta mixta suma el bloque de día y Noche sin duplicar');

/* ---------- 3) bloque vigente y franja sin producción ---------- */
const bv=(h,m)=>G.bloqueVigente(ms(h,m));
ok(bv(12).bloque==='diaInter'&&bv(18,59).activo&&!bv(18,59).enFranja,'de 07:00 a 19:00 el bloque Día + Intermedio está activo (Día e Intermedio son el mismo bloque)');
ok(bv(19).enFranja&&!bv(19).activo&&bv(20,30).enFranja&&hhmm(bv(20).reanudaMs)==='21:00','de 19:00 a 21:00 la planta está parada: no hay bloque y se reanuda a las 21:00');
ok(bv(21).bloque==='noche'&&bv(21).activo&&bv(21).fecha==='2026-10-05'&&bv(23,30).fecha==='2026-10-05','a las 21:00 empieza Noche (su fecha de producción es el día en que empieza)');
ok(bv(2).bloque==='noche'&&bv(2).fecha==='2026-10-04'&&bv(6,59).fecha==='2026-10-04'&&bv(7).bloque==='diaInter','de madrugada sigue la Noche del día anterior hasta las 07:00');
/* los minutos de la franja no cuentan: el tiempo del bloque se corta en el fin del bloque */
sb=entorno([fila('DÍA',20000,{estadoOperacion:{estado:'EN_PRODUCCION',inicio:ms(7),paradas:[]}})]);
let t=sb.calcularTiemposLinea('PET1','DÍA',FECHA,{ahora:ms(20)});
ok(hhmm(t.finMs)==='19:00'&&Math.round(t.tiempoTranscurridoMin)===720&&t.minParadasNoProgramadas===0,'a las 20:00 el tiempo transcurrido es el del bloque (12 h) y no suma minutos de la franja ni como parada');
const p20=sb.proyectarCierreLinea(t,sb.calcularRatiosLinea(t,{produccion:14000,programado:20000,ahora:ms(20)}),{produccion:14000,programado:20000,ahora:ms(20),productos:[{etiqueta:'x',estado:'EN_CURSO',programado:20000,producido:14000,velocidad:2500}]});
ok(p20.estado==='TERMINADO'&&p20.ritmoNecesario==null&&p20.siguenIgual==null&&p20.pendiente===6000,'a las 20:00 no hay proyección activa: el bloque muestra su resultado final y el faltante');
sb=entorno([fila('NOCHE',9000,{estadoOperacion:{estado:'EN_PRODUCCION',inicio:ms(21),paradas:[]}})]);
t=sb.calcularTiemposLinea('PET1','NOCHE',FECHA,{ahora:ms(23)});
ok(Math.round(t.tiempoTranscurridoMin)===120&&hhmm(t.finTurnoMs)==='07:00','Noche empieza a las 21:00 con su propio tiempo (a las 23:00 lleva 2 h) y termina a las 07:00');

/* ---------- 4) alertas y pantalla en la franja ---------- */
const f46=leer('js/produccion/46-proyeccion-avisos.js'),f24=leer('js/produccion/24-semaforo-produccion-actual.js');
ok(/const franja=typeof window\.glacialEnFranjaSinProduccion/.test(f46)&&/a\.tipos\.includes\('parada'\)&&!franja/.test(f46)&&/!franja&&resumen&&Array\.isArray/.test(f46)&&/a\.tipos\.includes\('noiniciada'\)&&!franja/.test(f46),'en la franja no hay alertas de parada abierta, sin registrar producción ni programación sin iniciar');
ok(/Planta sin producción hasta las/.test(f24)&&/pa-franja/.test(f24),'el semáforo muestra «Planta sin producción hasta las 21:00» en lugar de líneas detenidas');
ok(/glacialBloqueVigente/.test(f46)&&/noche'\?'NOCHE':'DÍA'/.test(f46.replace(/\s/g,'')),'«programación sin iniciar» se evalúa por bloque productivo');

/* ---------- 5) relevo vs cierre (29) ---------- */
const s29=leer('js/produccion/29-avance-produccion.js');
const i0=s29.indexOf('function avHorarioBloque()'),i1=s29.indexOf('function avCorteMs(');
const sb29={Math,Number,Array,Object,String,Date,JSON,GlacialIndicadores:G};vm.createContext(sb29);sb29.window=sb29;
let ahora=ms(15);
sb29.avanceEstado={fecha:FECHA,turno:'DÍA'};sb29.tareoAhoraServidor=()=>ahora;
vm.runInContext('function avHoraDesdeMs(ms){return ms?new Date(ms).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit",hour12:false}):"";}function avCtx(){return {fin:"15:00"};}'+s29.slice(i0,i1)+';this.esRelevo=avEsRelevo;this.corte=avCorteCierre;this.titulo=avTituloSnapshot;',sb29);
ok(sb29.esRelevo()===true&&sb29.corte()==='15:00','el cierre del supervisor de Día a las 15:00 es un RELEVO: corta a la hora real y no fija el fin del bloque');
ok(sb29.titulo({tipo:'CIERRE',relevo:true})==='RELEVO DE TURNO'&&sb29.titulo({tipo:'CIERRE',relevo:false})==='CIERRE DE PRODUCCIÓN'&&sb29.titulo({tipo:'AVANCE'})==='AVANCE DE PRODUCCIÓN','el relevo se titula distinto del cierre del bloque');
ahora=ms(19,30);
ok(sb29.esRelevo()===false&&sb29.corte()==='19:00','el cierre después del fin del bloque se corta en el fin del bloque (19:00)');
ok(!/saveProgramaciones|estadoOperacion\s*=/.test(s29),'Avance/Cierre no cierra programaciones: solo «Finalizar presentación» termina el bloque');

/* ---------- 6) una sola función de programado en todas las pantallas ---------- */
ok(f24.includes('glacialProgramadoBloque(l,f,t')&&!f24.includes('Conserva programaciones INTERMEDIO antiguas')&&!f24.includes('if(!dia || num(dia.cantidadProgramada)<=0)'),'Producción actual usa la función única y se eliminó la regla «si Día > 0»');
/* ---------- 7) tarjeta «Programación del turno» (Nuevo registro) y Paletas: el supervisor de Intermedio ve el bloque ---------- */
const s21=leer('js/produccion/21-programacion-turno.js');
const i21=s21.indexOf('  function unidades(p){'),j21=s21.indexOf('  function escape(s){');
const sb21={Math,Number,Array,Object,String,Map};vm.createContext(sb21);
const items21=[{linea:'PET1',fecha:FECHA,turno:'DÍA',marca:'Scala',presentacion:'2.5 L',cantidadProgramada:12000,unidadesPorPaleta:1200},
  {linea:'PET1',fecha:FECHA,turno:'INTERMEDIO',marca:'Scala',presentacion:'2.5 L',cantidadProgramada:8000,unidadesPorPaleta:1200},
  {linea:'PET1',fecha:FECHA,turno:'NOCHE',marca:'Scala',presentacion:'2.5 L',cantidadProgramada:5000,unidadesPorPaleta:1200}];
sb21.loadProgramaciones=()=>items21;sb21.num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};sb21.obtenerUnidadesPorPalet=()=>0;
vm.runInContext(s21.slice(i21,j21)+';this.reg=registros;this.und=unidades;',sb21);
let tarj=sb21.reg({linea:'PET1',fecha:FECHA,turno:'INTERMEDIO'});
ok(tarj.length===1&&sb21.und(tarj[0])===20000,'el supervisor de Intermedio ve en Nuevo registro UNA línea con el programado del bloque Día: 20,000');
tarj=sb21.reg({linea:'PET1',fecha:FECHA,turno:'DÍA'});
ok(tarj.length===1&&sb21.und(tarj[0])===20000,'el supervisor de Día ve exactamente lo mismo (20,000)');
ok(sb21.reg({linea:'PET1',fecha:FECHA,turno:'NOCHE'}).length===1&&sb21.und(sb21.reg({linea:'PET1',fecha:FECHA,turno:'NOCHE'})[0])===5000,'Noche conserva su programación aparte (5,000)');
ok(items21[0].cantidadProgramada===12000,'la suma no modifica las programaciones guardadas');
/* ---------- 8) Avance/Cierre: el turno actual sale del bloque vigente (NOCHE desde las 21:00) ---------- */
{
  const i0=s29.indexOf('function avBloquesCfg()'),i1=s29.indexOf('function avRef()');
  const sbx={Math,Number,Array,Object,String,Date,JSON,GlacialIndicadores:G};vm.createContext(sbx);sbx.window=sbx;
  let hora=ms(21,43);sbx.tareoAhoraServidor=()=>hora;sbx.state={user:{}};sbx.avFechaHoy=()=>FECHA;sbx.avTurnoCanon=v=>String(v||'').toUpperCase().includes('NOCHE')?'NOCHE':'DÍA';
  vm.runInContext(s29.slice(i0,i1)+';this.ctx=avCtx;',sbx);
  ok(sbx.ctx().turno==='NOCHE'&&sbx.ctx().inicio==='21:00'&&sbx.ctx().fin==='07:00','a las 21:43, sin turno asignado por rotación, Avance/Cierre muestra el turno NOCHE (21:00–07:00)');
  hora=ms(12);ok(sbx.ctx().turno==='DÍA'&&sbx.ctx().inicio==='07:00'&&sbx.ctx().fin==='19:00','a las 12:00 muestra DÍA (07:00–19:00)');
  hora=ms(20);ok(sbx.ctx().turno==='DÍA','en la franja sin producción se queda en el bloque Día que acaba de terminar');
  sbx.state.user={turnoOperativo:'NOCHE'};hora=ms(12);ok(sbx.ctx().turno==='NOCHE','el turno asignado por la rotación sigue mandando');
}
ok(s29.includes("['DÍA','NOCHE'].map(t=>")&&!s29.includes("['DÍA','INTERMEDIO','NOCHE'].map(t=>`<button"),'el filtro de turnos de Avance/Cierre ofrece DÍA (incluye Intermedio) y NOCHE (el botón INTERMEDIO dejaba la lista vacía)');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
