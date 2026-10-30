/* Calidad en el OEE: Calidad = botellas conformes ÷ sopladas; OEE = disponibilidad × rendimiento × calidad.
   El rendimiento se mide con las sopladas, así Rendimiento × Calidad = conformes ÷ producción nominal y las botellas malas se descuentan UNA vez:
   el OEE de un registro da el MISMO número que antes (versión HEAD~ antes de este cambio: commit 70a5392). */
const fs=require('fs'),vm=require('vm'),cp=require('child_process'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const antes=f=>cp.execSync('git show 70a5392:'+f,{cwd:R,maxBuffer:1e8}).toString().replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('(?:async[ ]+)?function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error('no se encontró '+n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}return src.slice(m.index,j+1)+'\n';}
function motor(leerFn){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,Promise,isFinite,parseInt,parseFloat};vm.createContext(sb);sb.window=sb;
  sb.document={getElementById:()=>null,addEventListener(){},createElement:()=>({style:{}}),head:{appendChild(){}}};
  vm.runInContext(leerFn('js/nucleo/45-indicadores.js'),sb);
  sb.GlacialIndicadores=sb.window.GlacialIndicadores;
  const s06=leerFn('js/produccion/06-registro.js'),s08=leerFn('js/produccion/08-graficos.js');
  vm.runInContext('var num=v=>{const n=Number(v);return isFinite(n)?n:0;};'+['glacialAgregarDerivados','calcDerivedLegacy','calcDerivedCuadro','calcDerivedMulti','calcDerived'].map(n=>extraer(s06,n)).join('')+extraer(s08,'calcCascada'),sb);
  return sb;
}
const viejo=motor(antes),nuevo=motor(leer);
const I=nuevo.GlacialIndicadores;

/* ---------- funciones del módulo ---------- */
ok(Math.abs(I.calidad(95,100)-0.95)<1e-12,'calidad = conformes ÷ sopladas (95 de 100 = 95 %)');
ok(I.calidad(100,0)===null&&I.calidad(0,0)===null,'sin sopladas la calidad es null: no se inventa un 100 %');
ok(I.calidad(120,100)===1,'si las conformes superan a las sopladas (dato mal puesto) la calidad se topa en 100 %');
ok(I.unidadesProducidas(95,100)===100&&I.unidadesProducidas(95,0)===95&&I.unidadesProducidas(120,100)===120,'unidades producidas: las sopladas si hay; si no, las conformes');
ok(Math.abs(I.oee(0.9,1.1,0.95)-0.9*1.1*0.95)<1e-12&&Math.abs(I.oee(0.9,1.1)-0.99)<1e-12&&I.oee(0.9,null,0.95)===null,'OEE = disponibilidad × rendimiento × calidad; sin calidad, disponibilidad × rendimiento; sin rendimiento no se calcula');
ok(I.METAS_INICIALES.calidad&&I.METAS_INICIALES.calidad.verde>I.METAS_INICIALES.calidad.ambar,'hay meta inicial de calidad (verde y ámbar)');
ok(I.DEFINICIONES.some(d=>d[0]==='Calidad')&&I.DEFINICIONES.some(d=>d[0]==='OEE'&&/calidad/.test(d[1])),'las definiciones explican Calidad y el OEE con calidad');

/* ---------- registros: el OEE no cambia, aparece la calidad ---------- */
const rec=extra=>Object.assign({linea:'PET1',fecha:'2026-10-09',turno:'DÍA',horasTurno:12,ratioNominal:2400,
  paradasProgramadas:[{tiempoMin:60}],paradasNoProgramadas:[{tiempoMin:45},{tiempoMin:30}],produccion:{efectiva:19000,programada:21000,sopladas:19500,calidad:150,paletas:12}},extra||{});
const casos=[
  rec(),
  {linea:'PET1',cuadros:[rec(),rec({ratioNominal:2000,horasTurno:6,produccion:{efectiva:9000,programada:12000,sopladas:9100,calidad:0}})]},
  {linea:'PET2',cuadros:[rec({produccion:{efectiva:0,programada:0,sopladas:0,calidad:0}})]},
  {linea:'B7L',cuadros:[rec({ratioNominal:0})]},
  {linea:'C20L',cuadros:[rec({produccion:{efectiva:500,programada:400,sopladas:0,calidad:20}})]}
];
casos.forEach((c,i)=>{
  const a=viejo.calcDerived(JSON.parse(JSON.stringify(c))),b=nuevo.calcDerived(JSON.parse(JSON.stringify(c)));
  ok(Math.abs(a.oee-b.oee)<1e-9&&Math.abs(a.disponibilidad-b.disponibilidad)<1e-9&&Math.abs(a.cumplimiento-b.cumplimiento)<1e-9,'caso '+i+': OEE, disponibilidad y cumplimiento dan el mismo número que antes (OEE '+(b.oee*100).toFixed(2)+' %)');
});
const m=nuevo.calcDerived(casos[1]);
const sop=19500+9100,efe=19000+9000;
ok(Math.abs(m.calidad-efe/sop)<1e-9,'registro con dos cuadros: calidad = conformes ÷ sopladas = '+(m.calidad*100).toFixed(2)+' %');
ok(Math.abs(m.oee-(m.disponibilidad*m.rendimiento*m.calidad))<1e-9||m.cuadros.some(d=>d.conVelocidad===false),'Disponibilidad × Rendimiento × Calidad = OEE cuando todo tiene velocidad y sopladas');
ok(nuevo.calcDerived(casos[4]).calidad===null,'línea sin sopladas: calidad null y OEE = disponibilidad × rendimiento');
const agr=nuevo.glacialAgregarDerivados([nuevo.calcDerived(casos[0]),nuevo.calcDerived(casos[1])]);
ok(agr.calidad>0&&agr.calidad<1&&agr.oee>0,'varios registros: calidad ponderada y OEE');

/* ---------- cascada de pérdidas: cierra contra el OEE ---------- */
const d=nuevo.calcDerived(casos[0]),cas=nuevo.calcCascada(casos[0]);
ok(cas.perdidaCalidad>0&&Math.abs(cas.buena-cas.capacidadTeorica*d.oee)<1e-6,'cascada: capacidad − paradas − ritmo − no conformes = producción buena = capacidad × OEE');

/* ---------- pantallas: la calidad está conectada ---------- */
const s47=leer('js/produccion/47-analisis-paradas.js'),s08=leer('js/produccion/08-graficos.js');
ok(/calidad=GlacialIndicadores\.calidad\(datos\.efectivas,datos\.sopladas\)/.test(s47)&&/<th>Calidad<\/th>/.test(s47)&&/Calidad %/.test(s47),'Análisis de paradas: base del OEE con columna Calidad (pantalla y Excel)');
ok(/perdidaCalidad/.test(s08)&&/No conformes/.test(s08)&&/Calidad \(conformes ÷ sopladas\)/.test(s08),'reporte del turno: cascada con escalón de no conformes y tarjeta de Calidad');
const html=leer('index.html');
ok(['45-indicadores','06-registro','08-graficos','47-analisis-paradas','49-resumen-indicadores'].every(n=>new RegExp(n+'\\.js\\?v=20261030-ca1').test(html)),'index.html: versiones ?v= subidas para los scripts de la Calidad');

console.log(fallas?'\n'+fallas+' fallas':'\nCalidad en el OEE correcta');
process.exit(fallas?1:0);
