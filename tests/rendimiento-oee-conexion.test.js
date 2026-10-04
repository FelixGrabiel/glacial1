/* Parte 2, commit 3: rendimiento y OEE salen del módulo (sin tope, solo con velocidad estándar, sin calidad). */
const fs=require('fs'),vm=require('vm'),cp=require('child_process');
const R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const previo=(f,ref)=>cp.execSync('git show '+ref+':'+f,{cwd:R,maxBuffer:1e8}).toString().replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error(n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&!--d)break;}return src.slice(m.index,j+1);}
function ctx(s06,s09){const sb={console,Math,Number,Array,Object};vm.createContext(sb);sb.window=sb;
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  const agr=/function glacialAgregarDerivados/.test(s06)?extraer(s06,'glacialAgregarDerivados'):'';
  vm.runInContext('var num=v=>{const n=Number(v);return isFinite(n)?n:0;};'+extraer(s06,'calcDerivedCuadro')+extraer(s06,'calcDerivedLegacy')+extraer(s06,'calcDerivedMulti')+extraer(s06,'calcDerived')+agr+'\nvar agruparMermas=r=>({totalUnidades:0});var produccionEfectivaRecord=r=>0;\n'+extraer(s09,'calcularKPIsPlanta'),sb);return sb;}
const ref=process.env.REF_ANTES||'HEAD';
const f06='js/produccion/06-registro.js',f09='js/produccion/09-resumen.js';
const nuevo=ctx(leer(f06),leer(f09)),antes=ctx(previo(f06,ref),previo(f09,ref));
const cuadro=(h,prog,np,ef,vel)=>({horasTurno:h,paradasProgramadas:prog?[{tiempoMin:prog}]:[],paradasNoProgramadas:np?[{tiempoMin:np}]:[],ratioNominal:vel,produccion:{efectiva:ef,programada:ef,sopladas:ef}});
const rec=(...c)=>({id:1,linea:'PET1',cuadros:c});
/* caso oficial: 480 min, 60 prog, 45 no prog, 14400 → ratio 2304; velocidad 2400 */
const c1=nuevo.calcDerivedCuadro(cuadro(8,60,45,14400,2400));
ok(Math.abs(c1.rendimiento-0.96)<1e-9,'caso oficial: rendimiento = 2 304 ÷ 2 400 = 96 %');
ok(Math.abs(c1.oee-(375/420)*0.96)<1e-9,'caso oficial: OEE = 89,29 % × 96 % = '+(c1.oee*100).toFixed(2)+' %');
/* mismo número que antes cuando no hay tope ni calidad que influyan */
const a1=antes.calcDerivedCuadro(cuadro(8,60,45,14400,2400));
ok(Math.abs(a1.oee-c1.oee)<1e-9&&Math.abs(a1.rendimiento-c1.rendimiento)<1e-9,'registro normal: igual que la versión anterior');
/* sin tope */
const s1=nuevo.calcDerivedCuadro(cuadro(8,0,0,24000,2400)),s0=antes.calcDerivedCuadro(cuadro(8,0,0,24000,2400));
ok(Math.abs(s1.rendimiento-1.25)<1e-9&&s0.rendimiento===1,'rendimiento 125 % ya no se topa en 100 % (antes '+(s0.rendimiento*100)+' %, ahora '+(s1.rendimiento*100)+' %)');
ok(Math.abs(s1.oee-1.25)<1e-9,'OEE sin tope = disponibilidad 100 % × 125 %');
/* sin velocidad: no cuenta para el OEE */
const n1=nuevo.calcDerivedCuadro(cuadro(8,0,0,10000,0));
ok(n1.conVelocidad===false&&n1.oee===0&&n1.rendimiento===0,'cuadro sin velocidad estándar: rendimiento y OEE no se calculan (0 en la estructura, fuera de los promedios)');
/* registro con dos cuadros, uno sin velocidad */
const mixto=rec(cuadro(8,0,0,19200,2400),cuadro(8,0,240,6000,0));
const m=nuevo.calcDerived(mixto);
ok(Math.abs(m.rendimiento-1)<1e-9&&Math.abs(m.oee-1)<1e-9,'registro mixto: el cuadro sin velocidad no entra (rendimiento 100 %, OEE 100 % solo del que tiene velocidad)');
/* planta */
const regs=[rec(cuadro(8,60,45,14400,2400)),rec(cuadro(8,0,240,5000,0)),rec(cuadro(4,0,0,9600,2400))];
const k=nuevo.calcularKPIsPlanta(regs).oee;
const disp=((420+240)-(45+0))/(420+240),rend=(14400+9600)/((375/60)*2400+4*2400);
ok(Math.abs(k-disp*rend)<1e-9,'planta (09): OEE '+(k*100).toFixed(2)+' % = disponibilidad × rendimiento de lo que tiene velocidad');
console.log('  [antes → ahora] OEE de planta: '+(antes.calcularKPIsPlanta(regs).oee*100).toFixed(2)+' % → '+(k*100).toFixed(2)+' %');
const s=f=>leer('js/produccion/'+f);
ok(/GlacialIndicadores\.rendimiento\(ratioSop,velocidad\)/.test(s('47-analisis-paradas.js'))&&/GlacialIndicadores\.oee\(u\.disp,rend\)/.test(s('47-analisis-paradas.js')),'47: rendimiento y OEE del módulo; sin calidad');
ok(/GlacialIndicadores\.oee\(dispVF,rendF\)/.test(s('49-resumen-indicadores.js')),'49: OEE del Resumen del módulo');
ok(!/MIN\(K\$\{/.test(s('08-graficos.js'))&&/`Q\$\{f\}\*R\$\{f\}`/.test(s('08-graficos.js')),'Excel por línea: rendimiento sin MIN(…,1) y OEE = disponibilidad × rendimiento');
ok(!/oeeXhoras/.test(s('09-resumen.js')+s('14-exportar-general.js')+s('08-graficos.js')),'ya no quedan promedios de OEE ponderados por horas');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
