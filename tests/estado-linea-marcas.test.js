/* Estado de líneas: marca en curso con su propio avance, total de la línea aparte y aviso de marca detenida.
   Se ejecuta con:   node tests/estado-linea-marcas.test.js */
'use strict';
const fs=require('fs'),R=require('path').resolve(__dirname,'..');
const I=require('../js/nucleo/45-indicadores.js');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const desde=new Date(2026,9,12,8,40).getTime();

/* PET2, 12/10: una completada, una detenida sin finalizar y Merkat en curso. Programado total 44,000. */
const pet2=[
  {marca:'Aro',presentacion:'625_ML_PACK_X_15',estado:'COMPLETADA',producido:20000,programado:20000},
  {marca:'Bells',presentacion:'625_ML_PACK_X_15',estado:'DETENIDA',producido:17695,programado:18000,detenidaDesde:desde},
  {marca:'Merkat',presentacion:'625_ML_PACK_X_15',estado:'EN_CURSO',producido:1305,programado:6000}
];
const d=I.desgloseLineaPorMarca(pet2);
ok(d.actual.marca==='Merkat'&&d.actual.producido===1305&&d.actual.programado===6000,'marca actual: Merkat 1,305 / 6,000 (no el total de la línea)');
ok(Math.round(d.actual.avance)===22,'avance de la marca actual = 22 %');
ok(d.total.programado===44000&&d.total.producido===39000&&d.total.marcas===3,'total línea (3 marcas): 39,000 / 44,000');
ok(d.estado==='EN_CURSO','estado de la línea = el de la marca en curso (no DETENIDA)');
ok(d.avisos.length===1&&d.avisos[0].marca==='Bells'&&d.avisos[0].desde===desde,'aviso por la marca Bells detenida, con su hora de inicio');
const hhmm=new Date(d.avisos[0].desde).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false});
ok(hhmm==='08:40','la hora del aviso es 08:40');
ok(d.marcas.map(m=>m.estado).join()==='COMPLETADA,DETENIDA,EN_CURSO'&&d.marcas.length===3,'desglose conserva las 3 marcas con su estado');

/* estadoLineaDesdeItems NO cambia: otras pantallas siguen viendo DETENIDA con las mismas marcas */
ok(I.estadoLineaDesdeItems(pet2.map(m=>m.estado))==='DETENIDA','estadoLineaDesdeItems sigue dando DETENIDA (otras pantallas intactas)');

/* Sin ninguna en curso se usa la prioridad de siempre y no hay aviso duplicado */
const sin=I.desgloseLineaPorMarca([{marca:'A',estado:'COMPLETADA',producido:5,programado:5},{marca:'B',estado:'DETENIDA',producido:1,programado:9,detenidaDesde:desde}]);
ok(sin.estado==='DETENIDA'&&sin.actual.marca==='B'&&sin.avisos.length===0,'sin marca en curso: estado DETENIDA, sin aviso aparte');
ok(I.desgloseLineaPorMarca([]).actual===null&&I.desgloseLineaPorMarca().estado===null,'sin marcas: vacío sin errores');
const canc=I.desgloseLineaPorMarca([{marca:'A',estado:'EN_CURSO',producido:1,programado:10},{marca:'B',estado:'CANCELADA',producido:0,programado:99}]);
ok(canc.total.programado===10,'las canceladas no suman al programado');

/* Conexión con las pantallas */
const s24=fs.readFileSync(R+'/js/produccion/24-semaforo-produccion-actual.js','utf8'),s32=fs.readFileSync(R+'/js/accesos/32-dashboard-perfiles.js','utf8');
ok(/fila\.desglose=GlacialIndicadores\.desgloseLineaPorMarca\(/.test(s24)&&/estadoLineaDesdeItems\(claves\)/.test(s24),'resumen ejecutivo: agrega desglose y conserva estado con estadoLineaDesdeItems');
ok(/Total del plan \(\$\{g\.total\.marcas\} marca/.test(s32)&&/quedó detenida/.test(s32)&&/finalízala o reanúdala/.test(s32),'Inicio: total rotulado y aviso de marca detenida');
ok(/MARCA EN CURSO/.test(s24)&&/Total del plan \(/.test(s24)&&/finalízala o reanúdala/.test(s24),'tablero de Producción Actual: marca en curso y aviso');
console.log(fallas?fallas+' fallas':'todo correcto');
