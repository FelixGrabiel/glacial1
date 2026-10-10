/* Producción Actual: cinco indicadores, panel PARADAS DEL TURNO y colores de estado. */
const fs=require('fs');
const R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const s=fs.readFileSync(R+'/js/produccion/24-semaforo-produccion-actual.js','utf8').replace(/\r\n/g,'\n');
const tablero=s.slice(s.indexOf("tablero.innerHTML="),s.indexOf('cont.prepend(tablero)'));

ok(!/pa-line-kpi-paradas|<small>PARADAS<\/small>/.test(tablero),'sin el indicador PARADAS bajo el semáforo');
ok(['PROGRAMACIÓN VIGENTE','PRODUCCIÓN ACUMULADA','CUMPLIMIENTO','RENDIMIENTO DEL TURNO','RATIO'].every(k=>tablero.includes('<small>'+k+'</small>')),'los cinco indicadores se conservan');
ok(/htmlProyeccion\(g\.proyeccion,g\.porTurno\)/.test(tablero),'PROYECCIÓN DE CIERRE se conserva');
ok(/SECUENCIA DEL TURNO/.test(tablero)&&!/HISTORIAL \/ AVANCE DEL TURNO/.test(tablero),'secuencia conservada y sin HISTORIAL / AVANCE DEL TURNO');
ok(!/◴ PRODUCCIÓN ACTUAL/.test(tablero)&&/PARADAS DEL TURNO/.test(s)&&/Registro de Avance \/ Cierre/.test(s),'panel PARADAS DEL TURNO en lugar de PRODUCCIÓN ACTUAL');
ok(/>Programadas<\/span>/.test(s)&&/>No programadas<\/span>/.test(s)&&!/Total de paradas/i.test(s),'resumen solo con Programadas y No programadas');
ok(!/<tfoot|>TOTAL</.test(s.slice(s.indexOf('const htmlParadasTurno'),s.indexOf('const tarjetaEstado'))),'sin fila TOTAL');
ok(/Sin paradas registradas/.test(s)&&/paradasClasificadas/.test(s),'lista oficial de 23b y mensaje de vacío');
ok(/data-pa-accion="cancelar"/.test(tablero)&&/acciones\(actual,idx\)/.test(tablero),'se conservan Cancelar programación y los controles operativos');
ok(/label:'DETENIDA',rank:1,cls:'detenida'/.test(s),'DETENIDA se distingue de EN PAUSA');
ok(/pa-state-completada\{background:var\(--est-fin-bg\)/.test(s)&&/--est-curso:#F97316/.test(s)&&/--est-pausa:#FACC15/.test(s)&&/--est-det:#EF4444/.test(s)&&/--est-fin:#22C55E/.test(s)&&/--est-pend:#9CA3AF/.test(s),'colores de estado centralizados');
ok(/nivel:g\.texto==='FINALIZADA'\?'verde':g\.nivel/.test(tablero),'FINALIZADA siempre verde en el semáforo');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
