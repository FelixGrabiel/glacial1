/* Parte 2, commit 2: la disponibilidad sale del módulo. Misma lógica de extracción que horas-ratio-conexion. */
const fs=require('fs'),vm=require('vm'),cp=require('child_process');
const R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const previo=(f,ref)=>cp.execSync('git show '+ref+':'+f,{cwd:R,maxBuffer:1e8}).toString().replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error(n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&!--d)break;}return src.slice(m.index,j+1);}
function ctx(s06,s09,s08){const sb={console,Math,Number,Array,Object};vm.createContext(sb);sb.window=sb;
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  vm.runInContext('var num=v=>{const n=Number(v);return isFinite(n)?n:0;};'+extraer(s06,'calcDerivedCuadro')+extraer(s06,'calcDerivedLegacy')+extraer(s06,'calcDerivedMulti')+extraer(s06,'calcDerived')+(/function glacialAgregarDerivados/.test(s06)?extraer(s06,'glacialAgregarDerivados'):'')+'\nvar agruparMermas=r=>({totalUnidades:0});var produccionEfectivaRecord=r=>0;\n'+extraer(s09,'calcularKPIsPlanta')+extraer(s08,'xlEstadisticasLinea'),sb);return sb;}
const ref=process.env.REF_ANTES||'486e494';
const f06='js/produccion/06-registro.js',f09='js/produccion/09-resumen.js',f08='js/produccion/08-graficos.js';
const nuevo=ctx(leer(f06),leer(f09),leer(f08)),antes=ctx(previo(f06,ref),previo(f09,ref),previo(f08,ref));
const cuadro=(h,prog,np,ef)=>({horasTurno:h,paradasProgramadas:prog?[{tiempoMin:prog}]:[],paradasNoProgramadas:np?[{tiempoMin:np}]:[],ratioNominal:2400,produccion:{efectiva:ef,programada:ef,sopladas:ef}});
const rec=(c)=>({id:1,linea:'PET1',cuadros:[c]});
/* por registro: igual que antes */
[[8,60,45,14400],[8,0,600,0],[7.5,20,13,9000],[8,0,0,19000]].forEach((a,i)=>{
  const x=antes.calcDerivedCuadro(cuadro(...a)),y=nuevo.calcDerivedCuadro(cuadro(...a));
  ok(Math.abs(x.disponibilidad-y.disponibilidad)<1e-9,'registro '+(i+1)+': disponibilidad '+(y.disponibilidad*100).toFixed(2)+' % = a la versión anterior');
});
const c1=nuevo.calcDerivedCuadro(cuadro(8,60,45,14400));
ok(Math.abs(c1.disponibilidad-(420-45)/420)<1e-9,'caso oficial: (480−60 = 420 planificado − 45) ÷ 420 = 89,29 %');
/* planta: (Σ planificado − Σ no programadas) ÷ Σ planificado */
const regs=[rec(cuadro(8,60,45,14400)),rec(cuadro(8,0,240,5000)),rec(cuadro(4,0,0,9000))];
const k=nuevo.calcularKPIsPlanta(regs).disponibilidad;
const esperado=((420+480+240)-(45+240+0))/(420+480+240);
ok(Math.abs(k-esperado)<1e-9,'planta (09): '+(k*100).toFixed(2)+' % = (planificado total − no programadas total) ÷ planificado total');
const e=nuevo.xlEstadisticasLinea(regs).disp;
ok(Math.abs(e-esperado)<1e-9,'gráficos por línea (08): misma cifra '+(e*100).toFixed(2)+' % (antes dividía entre las horas del turno con las pausas)');
console.log('  [antes → ahora] 09 planta: '+(antes.calcularKPIsPlanta(regs).disponibilidad*100).toFixed(2)+' % → '+(k*100).toFixed(2)+' %; 08 línea: '+(antes.xlEstadisticasLinea(regs).disp*100).toFixed(2)+' % → '+(e*100).toFixed(2)+' %');
const s=f=>leer('js/produccion/'+f);
ok(/disp:GlacialIndicadores\.disponibilidad\(planificado,np\)/.test(s('47-analisis-paradas.js'))&&/disp:GlacialIndicadores\.disponibilidad\(plan,np\)/.test(s('47-analisis-paradas.js')),'47: disponibilidad por unidad y promedio del rango del módulo');
ok(/GlacialIndicadores\.disponibilidad\(plan,Math\.max\(0,plan-avail\)\)/.test(s('49-resumen-indicadores.js')),'49: disponibilidad del Resumen del módulo');
ok(!/dispXhoras/.test(s('09-resumen.js')+s('14-exportar-general.js')),'ya no quedan promedios ponderados de disponibilidad en 09 y 14');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
