/* Semáforo vs paradas oficiales: DETENER/PAUSA son estado de la línea; solo las paradas del supervisor (Avance/Cierre) cuentan. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');

const FECHA='2026-10-05';
const ms=h=>{const [H,M]=h.split(':').map(Number);return new Date(2026,9,5,H,M).getTime();};
function entorno(botones,operativas,registros){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout,clearTimeout,setInterval:()=>0};
  vm.createContext(sb);sb.window=sb;
  sb.avanceEstado={unsubscribe:true,paradasOperativas:operativas||[]};
  sb.loadProgramaciones=()=>[{linea:'PET1',fecha:FECHA,turno:'DÍA',marca:'Scala',presentacion:'2.5 L',cantidadProgramada:5000,
    estadoOperacion:{estado:'EN_PRODUCCION',inicio:ms('07:00'),paradas:botones||[]}}];
  sb.loadRecords=()=>registros||[];
  sb.normalizarCuadros=r=>r.cuadros||[];
  sb.normalizarMotivoParada=t=>String(t||'').toLowerCase().trim();
  sb.estandarMotivoParada=t=>/refrigerio/i.test(t)?60:0;
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  vm.runInContext(leer('js/produccion/23b-tiempos-linea.js'),sb);
  return sb;
}
const calc=sb=>sb.calcularTiemposLinea('PET1','DÍA',FECHA,{ahora:ms('11:00')});
const det=(ini,fin,motivo)=>({id:'b'+ini,tipo:'DETENCION',motivo,clasificacion:'NO_PROGRAMADA',estandarMin:0,inicio:ms(ini),fin:ms(fin),origen:'BOTON'});
const pausa=(ini,fin,motivo,std)=>({id:'p'+ini,tipo:'PAUSA',motivo,clasificacion:'PROGRAMADA',estandarMin:std,inicio:ms(ini),fin:ms(fin),origen:'BOTON'});
const op=(descripcion,minutos,tipo)=>({id:'avp_'+descripcion,descripcion,minutos,tipo,fecha:FECHA,turno:'DÍA',linea:'PET1',origen:'AVANCE'});

/* PRUEBA 1/2 · DETENER + REANUDAR (10:20 → 10:35) */
let t=calc(entorno([det('10:20','10:35','Falla de máquina')]));
ok(t.ok&&Math.round(t.tiempoTranscurridoMin)===240,'transcurrido 07:00 → 11:00 = 240 min');
ok(t.minParadasNoProgramadas===0&&t.minPausasProgramadas===0,'DETENER/REANUDAR (15 min) NO crean minutos oficiales de parada');
ok(Math.round(t.tiempoOperativoMin)===240,'el tiempo efectivo no descuenta el tiempo detenido del semáforo');
ok(Math.round(t.fuentes.detenerLinea.noProgramadas)===15&&t.detalle.length===1,'el historial del semáforo se conserva (detenida 15 min, informativo)');
ok(t.paradasClasificadas.length===0,'el semáforo no genera paradas clasificadas (Pareto, Impacto)');
/* PRUEBA 3 · PAUSA PROGRAMADA */
t=calc(entorno([pausa('09:00','10:00','Refrigerio',60)]));
ok(t.minPausasProgramadas===0&&Math.round(t.tiempoOperativoMin)===240&&Math.round(t.fuentes.pausaProgramada.programadas)===60,'PAUSA PROGRAMADA del semáforo: sin parada programada oficial, historial conservado (60 min)');
/* PRUEBA 4 · parada desde Avance: NO PROGRAMADA 15 min */
t=calc(entorno([],[op('Falla INJET',15,'NO_PROGRAMADA')]));
ok(Math.round(t.minParadasNoProgramadas)===15&&Math.round(t.tiempoOperativoMin)===225,'parada NO PROGRAMADA de Avance (15 min) → tiempo efectivo 225');
ok(t.paradasClasificadas.length===1&&t.paradasClasificadas[0].motivo==='Falla INJET','la parada oficial llega a la lista de análisis una sola vez');
/* PRUEBA 5 · programada 60 min */
t=calc(entorno([],[op('Refrigerio',60,'PROGRAMADA')]));
ok(Math.round(t.minPausasProgramadas)===60&&Math.round(t.tiempoOperativoMin)===180,'parada PROGRAMADA de Avance (60 min) → tiempo efectivo 180');
/* Ejemplo del documento: 30 programadas + 20 no programadas = 190 */
t=calc(entorno([],[op('Charla',30,'PROGRAMADA'),op('Falla',20,'NO_PROGRAMADA')]));
ok(Math.round(t.tiempoOperativoMin)===190,'240 − 30 − 20 = 190 min efectivos');
/* PRUEBA 6 · semáforo 15 + Avance 15 = 15 (no 30) */
t=calc(entorno([det('10:20','10:35','Falla de máquina')],[op('Falla INJET',15,'NO_PROGRAMADA')]));
ok(Math.round(t.minParadasNoProgramadas)===15&&Math.round(t.tiempoOperativoMin)===225,'detenida 15 min + Avance 15 min → se contabilizan 15, no 30');
t=calc(entorno([det('10:20','10:35','Falla INJET')],[op('Falla INJET',15,'NO_PROGRAMADA')]));
ok(Math.round(t.minParadasNoProgramadas)===15,'aunque el motivo sea idéntico, solo cuenta la parada de Avance (15)');
/* PRUEBA 7 · modificar 15 → 20 */
const sb7=entorno([],[op('Falla INJET',15,'NO_PROGRAMADA')]);
ok(Math.round(calc(sb7).tiempoOperativoMin)===225,'antes: 15 min → 225');
sb7.avanceEstado.paradasOperativas=[op('Falla INJET',20,'NO_PROGRAMADA')];
t=calc(sb7);ok(Math.round(t.minParadasNoProgramadas)===20&&Math.round(t.tiempoOperativoMin)===220,'después: 20 min → 220 (no conserva los 15 anteriores)');
sb7.avanceEstado.paradasOperativas=[];
ok(Math.round(calc(sb7).tiempoOperativoMin)===240,'al eliminar la parada el tiempo efectivo vuelve a 240');
/* Mismo motivo, horarios distintos: dos eventos */
t=calc(entorno([],[Object.assign(op('Falla máquina',10,'NO_PROGRAMADA'),{id:'a'}),Object.assign(op('Falla máquina',15,'NO_PROGRAMADA'),{id:'b'})]));
ok(Math.round(t.minParadasNoProgramadas)===25,'dos paradas con el mismo motivo suman 25 (no se deduplica por nombre)');
/* Ratio en tiempo real: 5 000 UND en 240 min con 20 y luego 35 min oficiales */
let sb=entorno([],[op('A',20,'NO_PROGRAMADA')]);let r=sb.calcularRatiosLinea(calc(sb),{produccion:5000,programado:10000,ahora:ms('11:00')});
ok(Math.abs(r.ratioEfectivo-5000/(220/60))<0.01,'ratio con 220 min efectivos');
sb.avanceEstado.paradasOperativas=[op('A',20,'NO_PROGRAMADA'),op('INJET',15,'NO_PROGRAMADA')];
r=sb.calcularRatiosLinea(calc(sb),{produccion:5000,programado:10000,ahora:ms('11:00')});
ok(Math.abs(r.ratioEfectivo-5000/(205/60))<0.01,'al agregar INJET 15 min el ratio se recalcula con 205 min efectivos');
/* El registro del supervisor (Nuevo registro) sigue siendo oficial; las filas auto no se duplican */
const reg={linea:'PET1',fecha:FECHA,turno:'DÍA',grupoTurno:'DIA_INTERMEDIO',cuadros:[{paradasNoProgramadas:[{descripcion:'Calibración',tiempoMin:10},{descripcion:'Copia',tiempoMin:7,auto:true,origen:'AVANCE'}],paradasProgramadas:[]}]};
t=calc(entorno([],[],[reg]));
ok(Math.round(t.minParadasNoProgramadas)===10,'Nuevo registro (manual) cuenta; las filas automáticas no se vuelven a sumar');

/* Auditoría de código */
const f06=leer('js/produccion/06-registro.js'),f35=leer('js/produccion/35-autollenado-registro.js'),f24=leer('js/produccion/24-semaforo-produccion-actual.js');
ok(/function esParadaDeEstadoSemaforo/.test(f06)&&/filter\(p=>!esParadaDeEstadoSemaforo\(p\)\)/.test(f06),'registros guardados: las filas importadas de DETENER/PAUSA se ignoran en todos los cálculos (incluye días pasados)');
ok(/function paradasBoton\(q\)\{\s*return \[\];/.test(f35),'35 ya no copia DETENER/PAUSA al registro');
ok(!/pausaAcumuladaMs|detencionAcumuladaMs/.test(f24.slice(f24.indexOf('function estadoFila'),f24.indexOf('function puedeReabrirProduccion'))),'estado por presentación: ya no usa minutos de DETENER/PAUSA ni evalúa «por debajo del ritmo»');
ok(!/Por debajo del ritmo nominal/.test(f24),'no existe el estado «por debajo del ritmo nominal» por presentación');
ok(/detenerLinea/.test(f24)&&/estado='DETENIDA'/.test(f24)||/op\.estado='DETENIDA'/.test(f24),'los controles DETENER/REANUDAR/PAUSA siguen cambiando el estado de la línea');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
