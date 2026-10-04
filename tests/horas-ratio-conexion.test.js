/* Parte 2, commit 1: las pantallas llaman al módulo para horas efectivas y ratio.
   Se extraen las funciones reales de los archivos y se comparan con la versión anterior (git HEAD~) y con el caso oficial. */
const fs=require('fs'),vm=require('vm'),cp=require('child_process');
const R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const previo=(f,ref)=>cp.execSync('git show '+ref+':'+f,{cwd:R,maxBuffer:1e8}).toString().replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error(n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&!--d)break;}return src.slice(m.index,j+1);}
function ctx(src06){const sb={console,Math,Number,Array,Object};vm.createContext(sb);sb.window=sb;
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  vm.runInContext('var num=v=>{const n=Number(v);return isFinite(n)?n:0;};'+extraer(src06,'calcDerivedCuadro')+extraer(src06,'calcDerivedLegacy')+';',sb);return sb;}
const nuevo=ctx(leer('js/produccion/06-registro.js'));
const ref=process.env.REF_ANTES||'a3de9b0';
const antes=ctx(previo('js/produccion/06-registro.js',ref));
const cuadros=[
 {horasTurno:8,paradasProgramadas:[{tiempoMin:60}],paradasNoProgramadas:[{tiempoMin:45}],ratioNominal:2400,produccion:{efectiva:14400,programada:15000,sopladas:15000}},
 {horasTurno:8,paradasProgramadas:[],paradasNoProgramadas:[{tiempoMin:600}],ratioNominal:2400,produccion:{efectiva:0}},
 {horasTurno:7.5,paradasProgramadas:[{tiempoMin:20}],paradasNoProgramadas:[{tiempoMin:13}],ratioNominal:1800,produccion:{efectiva:9000,programada:9000,sopladas:9100}}];
cuadros.forEach((c,i)=>{
  const a=antes.calcDerivedCuadro(c),n=nuevo.calcDerivedCuadro(c);
  ok(Math.abs(a.horasEfectivas-n.horasEfectivas)<1e-9&&Math.abs(a.ratioEfectivo-n.ratioEfectivo)<1e-6,'cuadro '+(i+1)+': horas efectivas '+n.horasEfectivas.toFixed(4)+' h y ratio '+n.ratioEfectivo.toFixed(2)+' = a la versión anterior');
});
const c0=nuevo.calcDerivedCuadro(cuadros[0]);
ok(Math.abs(c0.horasEfectivas-6.25)<1e-9,'caso oficial 480 − (60 + 45) = 375 min = 6,25 h');
ok(Math.abs(c0.ratioEfectivo-2304)<1e-6,'caso oficial: 14 400 ÷ 6,25 h = 2 304 UND/h');
/* código de las pantallas */
const s=f=>leer('js/produccion/'+f);
ok(/GlacialIndicadores\.horasEfectivas\(\{transcurridoMin:transcurrido,paradasProgramadasMin:pausas/.test(s('23b-tiempos-linea.js')),'23b: tiempo operativo sale del módulo');
ok(/sal\.ratioEfectivo=GlacialIndicadores\.ratio\(/.test(s('23b-tiempos-linea.js')),'23b: ratio efectivo sale del módulo');
ok(/GlacialIndicadores\.ratio\(b\.produccionTotal,horasEf\)/.test(s('29-avance-produccion.js')),'29 Avance: ratio del módulo');
ok(/GlacialIndicadores\.ratio\(producido,horasEf\)/.test(s('09-resumen.js')),'09 Resumen: ratio por línea del módulo');
ok(/GlacialIndicadores\.horasEfectivas\(\{transcurridoMin:duracion/.test(s('47-analisis-paradas.js')),'47: tiempo en marcha del módulo');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
