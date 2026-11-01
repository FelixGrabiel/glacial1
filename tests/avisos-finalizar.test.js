/* Aviso «Reporte sin finalizar» (supervisores) y mensaje para el bot.
   Núcleo puro: js/nucleo/45-indicadores.js (reportesSinFinalizar, textoReporteSinFinalizar, mensajeReportesSinFinalizar).
   Conexión al Centro de alertas: js/produccion/46-proyeccion-avisos.js (tipo «finalizar», umbrales, pendientesFinalizar para el bot).
   node tests/avisos-finalizar.test.js */
'use strict';
const fs=require('fs'),path=require('path');
const I=require('../js/nucleo/45-indicadores.js');
const raiz=path.join(__dirname,'..'),leer=r=>fs.readFileSync(path.join(raiz,r),'utf8');
let fallas=0,total=0;
const ok=(c,t)=>{total++;console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const L=(y,m,d,h,mi)=>new Date(y,m-1,d,h,mi||0).getTime();
const cuadro=(o={})=>Object.assign({marca:'Scala',estadoCuadro:'ABIERTO',produccion:{efectiva:1000,sopladas:1050}},o);
const rep=(o={})=>Object.assign({id:'r1',linea:'PET1',fecha:'2026-10-28',turno:'DÍA',estadoRegistro:'EN_REGISTRO',cuadros:[cuadro()]},o);

/* Bloque Día + Intermedio de la configuración inicial: 07:00–19:00. Con 120 min de gracia, el aviso empieza a las 21:00. */
{
  const dentro=I.reportesSinFinalizar([rep()],L(2026,10,28,20,59));
  const fuera=I.reportesSinFinalizar([rep()],L(2026,10,28,21,0));
  ok(dentro.length===0&&fuera.length===1,'no avisa antes de 2 h tras terminar el bloque; a las 2 h exactas sí');
  const x=fuera[0];
  ok(x.id==='r1'&&x.linea==='PET1'&&x.fecha==='2026-10-28'&&x.atrasoMin===120&&x.nivel==='ambar'&&x.cuadros===1&&x.sinFinalizar===1,'datos del aviso: reporte, línea, atraso (120 min), ámbar, cuadros y cuadros sin finalizar');
}
{
  const n=L(2026,10,29,19,30);   // 24 h y 30 min después del fin del bloque
  const x=I.reportesSinFinalizar([rep()],n)[0];
  ok(x.nivel==='roja'&&x.atrasoMin===1470,'desde 24 h de atraso el aviso es rojo');
}
{ // Noche: 21:00 → 07:00 del día siguiente
  const r=rep({id:'n1',turno:'NOCHE',fecha:'2026-10-28'});
  ok(I.reportesSinFinalizar([r],L(2026,10,29,8,59)).length===0&&I.reportesSinFinalizar([r],L(2026,10,29,9,0)).length===1,'turno NOCHE: el bloque termina a las 07:00 del día siguiente');
}
/* Borrador viejo de un turno que ya tiene su reporte FINALIZADO: quedó reemplazado */
{
  const n=L(2026,10,30,12,0);
  const borrador=rep({id:'b1',fecha:'2026-10-28'}),final=rep({id:'f1',fecha:'2026-10-28',estadoRegistro:'FINALIZADO'});
  ok(I.reportesSinFinalizar([borrador,final],n).length===0,'un borrador del mismo turno (línea, fecha y turno) con otro reporte FINALIZADO ya no avisa');
  ok(I.reportesSinFinalizar([borrador,rep({id:'f2',linea:'PET2',fecha:'2026-10-28',estadoRegistro:'FINALIZADO'})],n).length===1,'otro turno u otra línea finalizada no tapa al borrador');
  ok(I.reportesSinFinalizar([rep({id:'r9',estadoRegistro:'REABIERTO',fecha:'2026-10-28'}),rep({id:'r9',estadoRegistro:'FINALIZADO',fecha:'2026-10-28'})],n).length===1,'el mismo registro no se tapa a sí mismo');
}
/* Lo que no debe avisar */
{
  const n=L(2026,10,30,12,0);
  const sin=[rep({id:'a',estadoRegistro:'FINALIZADO'}),rep({id:'b',estadoRegistro:undefined}),rep({id:'c',cuadros:[cuadro({produccion:{efectiva:0,sopladas:0}})]}),rep({id:'d',cuadros:[cuadro({marca:''})]}),rep({id:'e',cuadros:[]}),null,{}];
  ok(I.reportesSinFinalizar(sin,n).length===0,'finalizados, antiguos sin estado, borradores sin producción, cuadros sin marca y datos vacíos no avisan');
  ok(I.reportesSinFinalizar([rep({id:'v',fecha:'2026-10-20'})],n).length===0,'con más de 7 días de atraso ya no avisa (historia)');
  ok(I.reportesSinFinalizar([rep({id:'v',fecha:'2026-10-20'})],n,null,{diasMax:30}).length===1,'el límite de días es configurable');
  ok(I.reportesSinFinalizar([rep()],NaN).length===0&&I.reportesSinFinalizar(undefined,n).length===0,'hora inválida o sin reportes: lista vacía');
}
/* REABIERTO cuenta; filtro por línea; orden del más atrasado al menos */
{
  const n=L(2026,10,30,8,0);
  const lista=I.reportesSinFinalizar([rep({id:'p1',linea:'PET1',fecha:'2026-10-29'}),rep({id:'b7',linea:'B7L',fecha:'2026-10-27',estadoRegistro:'REABIERTO'}),rep({id:'p2',linea:'PET2',fecha:'2026-10-28'})],n);
  ok(lista.map(x=>x.id).join()==='b7,p2,p1','ordenados del más atrasado al menos atrasado (el REABIERTO también cuenta)');
  ok((()=>{const r=I.reportesSinFinalizar([rep({linea:'PET1'}),rep({id:'x',linea:'B7L'})],L(2026,10,29,22,0),null,{linea:'B7L'});return r.length===1&&r[0].linea==='B7L';})(),'se puede pedir una sola línea');
}
/* Cuadros finalizados dentro de un reporte sin finalizar */
{
  const r=rep({cuadros:[cuadro({estadoCuadro:'FINALIZADO'}),cuadro(),cuadro({marca:'Aro'})]});
  const x=I.reportesSinFinalizar([r],L(2026,10,28,21,30))[0];
  ok(x.cuadros===3&&x.sinFinalizar===2,'cuenta los cuadros con producción y los que siguen sin finalizar');
}
/* Textos (pantalla y bot) */
{
  const x=I.reportesSinFinalizar([rep({cuadros:[cuadro({estadoCuadro:'FINALIZADO'}),cuadro()]})],L(2026,10,29,8,30))[0];
  const t=I.textoReporteSinFinalizar(x);
  ok(/^PET1 · DÍA 28\/10: reporte sin finalizar \(1 de 2 cuadros sin finalizar\) · hace 13 h 30 min$/.test(t),'texto del aviso: línea, turno, fecha, cuadros y atraso → '+t);
  ok(!/^PET1/.test(I.textoReporteSinFinalizar(x,true))&&/^DÍA 28\/10:/.test(I.textoReporteSinFinalizar(x,true)),'versión sin línea para la pantalla (la línea ya sale como título)');
  const m=I.mensajeReportesSinFinalizar([x]);
  ok(/^⚠️ \*REPORTES SIN FINALIZAR\*\n• PET1 · DÍA 28\/10/.test(m)&&/Historial › Continuar reporte\.$/.test(m)&&I.mensajeReportesSinFinalizar([])==='','mensaje listo para WhatsApp; vacío si no hay pendientes');
  ok(/hace 1 d 3 h/.test(I.textoReporteSinFinalizar({linea:'PET1',turno:'DÍA',fecha:'2026-10-28',cuadros:1,sinFinalizar:1,atrasoMin:1620})),'atrasos de un día o más se escriben en días y horas');
}
/* Entradas congeladas: no se modifican */
{
  const entrada=Object.freeze([Object.freeze(rep({cuadros:Object.freeze([Object.freeze(cuadro())])}))]);
  let e=null;try{I.reportesSinFinalizar(entrada,L(2026,10,29,9,0));}catch(err){e=err;}
  ok(e===null,'la función no modifica sus argumentos');
}
/* Conexión con el Centro de alertas */
{
  const s46=leer('js/produccion/46-proyeccion-avisos.js'),html=leer('index.html');
  ok(/const TODOS=\[[^\]]*'finalizar'[^\]]*\]/.test(s46)&&/finalizarGraciaMin:120,finalizarDiasMax:7/.test(s46),'tipo «finalizar» para los roles con avisos y umbrales por defecto (120 min, 7 días)');
  ok(/\['finalizarGraciaMin'/.test(s46)&&/\['finalizarDiasMax'/.test(s46),'los dos umbrales se editan en la pantalla de umbrales (Administrador y Jefatura)');
  ok(/a\.tipos\.includes\('finalizar'\)/.test(s46)&&/add\('fin\|'\+x\.id,'finalizar'/.test(s46)&&/enAmbito\(a,x\.linea\)/.test(s46),'el aviso se calcula con el mismo cálculo y respeta la línea del supervisor');
  ok(/x\.tipo==='finalizar'/.test(s46)&&/cargarReporteParaCorreccion\(x\.registroId\)/.test(s46),'al tocar el aviso se abre el reporte para continuarlo');
  ok(/pendientesFinalizar\}\);|,pendientesFinalizar[,}]/.test(s46)&&/function pendientesFinalizar/.test(s46),'el bot dispone de glacialAvisos.pendientesFinalizar()');
  ok(!/ambito\(\)[^;]*pendientesFinalizar/.test(s46.slice(s46.indexOf('function pendientesFinalizar'),s46.indexOf('function pendientesEntrega'))),'pendientesFinalizar no depende de quién mira (sirve a un usuario de solo consulta)');
  ok(/46-proyeccion-avisos\.js\?v=2026(10(2[7-9]|3\d)|1[12]\d\d)-[a-z]+\d+/.test(html)&&/45-indicadores\.js\?v=20261030/.test(html),'index.html con versión nueva de 45 y 46');
  ok(fs.existsSync(path.join(raiz,'docs/produccion/avisos-finalizar-reportes.md')),'documento para el bot: docs/produccion/avisos-finalizar-reportes.md');
}
console.log('\n'+(total-fallas)+' de '+total+' pruebas correctas'+(fallas?' · '+fallas+' FALLAN':''));
