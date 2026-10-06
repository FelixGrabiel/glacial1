/* La proyección de 23b (datos reales de paradas oficiales + bloque configurado) da los mismos números que las fórmulas puras. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const FECHA='2026-10-05';
const ms=(h,m)=>new Date(2026,9,5,h,m||0).getTime();
const hhmm=t=>{const d=new Date(t);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
function entorno(botones,operativas,bloques){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout,clearTimeout,setInterval:()=>0};
  vm.createContext(sb);sb.window=sb;
  sb.avanceEstado={unsubscribe:true,paradasOperativas:operativas||[]};
  sb.loadProgramaciones=()=>[{linea:'PET1',fecha:FECHA,turno:'DÍA',marca:'Scala',presentacion:'2.5 L',cantidadProgramada:20000,
    estadoOperacion:{estado:'EN_PRODUCCION',inicio:ms(7),paradas:botones||[]}}];
  sb.loadRecords=()=>[];sb.normalizarCuadros=r=>r.cuadros||[];
  sb.normalizarMotivoParada=t=>String(t||'').toLowerCase().trim();
  sb.estandarMotivoParada=t=>/refrigerio/i.test(t)?60:0;
  if(bloques)sb.glacialConfigIndicadores=()=>({bloques});
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  vm.runInContext(leer('js/produccion/23b-tiempos-linea.js'),sb);
  return sb;
}
const op=(descripcion,minutos,tipo)=>({id:'a_'+descripcion,descripcion,minutos,tipo,fecha:FECHA,turno:'DÍA',linea:'PET1',origen:'AVANCE'});
const paradas=[op('Refrigerio',60,'PROGRAMADA'),op('Falla',30,'NO_PROGRAMADA')];

let sb=entorno([],paradas);
let t=sb.calcularTiemposLinea('PET1','DÍA',FECHA,{ahora:ms(16)});
ok(hhmm(t.finTurnoMs)==='19:00','el fin objetivo del bloque Día + Intermedio es 19:00 (ya no 22:00 ni 15:00)');
ok(sb.calcularTiemposLinea('PET1','INTERMEDIO',FECHA,{ahora:ms(16)}).finTurnoMs===t.finTurnoMs,'Día e Intermedio comparten el mismo bloque');
let p=sb.proyectarCierreLinea(t,sb.calcularRatiosLinea(t,{produccion:14400,programado:20000,ahora:ms(16)}),{produccion:14400,programado:20000,ahora:ms(16),
  productos:[{etiqueta:'Scala · 2.5 L',estado:'EN_CURSO',programado:20000,producido:14400,velocidad:2500}]});
ok(p.etiqueta==='EN RIESGO'&&Math.round(p.siguenIgual)===19800&&Math.round(p.sinNuevas)===20160&&hhmm(p.finalEstimadoMs)==='19:07','Caso 1 con paradas oficiales reales: EN RIESGO, 19,800 / 20,160, final 19:07');
ok(Math.round(t.minPausasProgramadas)===60&&Math.round(t.minParadasNoProgramadas)===30,'las paradas oficiales (60 programadas + 30 no programadas) entran una sola vez');
ok(Math.abs(p.ritmoReal-sb.calcularRatiosLinea(t,{produccion:14400,programado:20000,ahora:ms(16)}).ratioEfectivo)<1e-6,'el ritmo real coincide con el ratio efectivo de 23b');
/* DETENER no altera la proyección; solo aparece el aviso */
const det={id:'b',tipo:'DETENCION',motivo:'Falla',clasificacion:'NO_PROGRAMADA',estandarMin:0,inicio:ms(15,30),fin:ms(15,50),origen:'BOTON'};
sb=entorno([det],paradas);t=sb.calcularTiemposLinea('PET1','DÍA',FECHA,{ahora:ms(16)});
const p2=sb.proyectarCierreLinea(t,sb.calcularRatiosLinea(t,{produccion:14400,programado:20000,ahora:ms(16)}),{produccion:14400,programado:20000,ahora:ms(16),detenida:true,
  productos:[{etiqueta:'Scala · 2.5 L',estado:'EN_CURSO',programado:20000,producido:14400,velocidad:2500}]});
ok(Math.round(p2.siguenIgual)===19800&&p2.ritmoReal===p.ritmoReal,'DETENER LÍNEA no cambia ningún cálculo de la proyección');
ok(p2.avisos.some(a=>/detención de \d+ min sin registrar en Avance/.test(a.texto))===false,'sin diferencia entre detención y paradas no programadas oficiales (30 ≥ 20): no hay aviso');
sb=entorno([det],[op('Refrigerio',60,'PROGRAMADA')]);t=sb.calcularTiemposLinea('PET1','DÍA',FECHA,{ahora:ms(16)});
const p3=sb.proyectarCierreLinea(t,sb.calcularRatiosLinea(t,{produccion:14400,programado:20000,ahora:ms(16)}),{produccion:14400,programado:20000,ahora:ms(16),detenida:true,
  productos:[{etiqueta:'x',estado:'EN_CURSO',programado:20000,producido:14400,velocidad:2500}]});
ok(p3.avisos.some(a=>/detención de 20 min sin registrar en Avance/.test(a.texto)),'detención de 20 min sin parada oficial: aviso «Hay una detención de 20 min sin registrar en Avance»');
ok(Math.round(t.minParadasNoProgramadas)===0,'y esos 20 min NO se suman a las paradas oficiales');
/* Parada oficial nueva: cambia el tiempo efectivo y la proyección */
sb=entorno([],[op('Refrigerio',60,'PROGRAMADA')]);t=sb.calcularTiemposLinea('PET1','DÍA',FECHA,{ahora:ms(16)});
const antes=sb.proyectarCierreLinea(t,{},{produccion:14400,programado:20000,ahora:ms(16),productos:[{etiqueta:'x',estado:'EN_CURSO',programado:20000,producido:14400,velocidad:2500}]});
sb.avanceEstado.paradasOperativas=[op('Refrigerio',60,'PROGRAMADA'),op('Falla INJET',45,'NO_PROGRAMADA')];
t=sb.calcularTiemposLinea('PET1','DÍA',FECHA,{ahora:ms(16)});
const despues=sb.proyectarCierreLinea(t,{},{produccion:14400,programado:20000,ahora:ms(16),productos:[{etiqueta:'x',estado:'EN_CURSO',programado:20000,producido:14400,velocidad:2500}]});
ok(despues.efectivoMin===antes.efectivoMin-45&&despues.ritmoReal>antes.ritmoReal,'registrar una parada oficial de 45 min baja el tiempo efectivo y sube el ritmo real');
/* Horario desde la configuración */
sb=entorno([],paradas,{diaInter:{inicio:'07:00',fin:'18:00'}});
ok(hhmm(sb.calcularTiemposLinea('PET1','DÍA',FECHA,{ahora:ms(16)}).finTurnoMs)==='18:00','el fin objetivo sale de sync/configIndicadores (no del código)');
/* Refrigerio previsto aún no registrado */
sb=entorno([],[op('Falla',30,'NO_PROGRAMADA')]);t=sb.calcularTiemposLinea('PET1','DÍA',FECHA,{ahora:ms(12)});
const pr=sb.proyectarCierreLinea(t,{},{produccion:7000,programado:20000,ahora:ms(12),productos:[{etiqueta:'x',estado:'EN_CURSO',programado:20000,producido:7000,velocidad:2500}]});
ok(pr.pausaPendienteMin===60&&Math.round(pr.restanteMin)===360&&Math.round(pr.restanteBrutoMin)===420,'refrigerio previsto sin registrar: se descuenta 60 min del tiempo restante (420 → 360)');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
