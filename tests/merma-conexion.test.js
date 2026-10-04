/* Parte 2, commit 5: merma = suma de mermas ÷ producción efectiva, con un solo nombre por componente. */
const fs=require('fs'),vm=require('vm'),cp=require('child_process');
const R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const previo=(f,ref)=>cp.execSync('git show '+ref+':'+f,{cwd:R,maxBuffer:1e8}).toString().replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error(n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&!--d)break;}return src.slice(m.index,j+1);}
function ctx(s08,s06,s09){const sb={console,Math,Number,Array,Object,String};vm.createContext(sb);sb.window=sb;
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  vm.runInContext('var num=v=>{const n=Number(v);return isFinite(n)?n:0;};'+extraer(s08,'agruparMermas')+extraer(s06,'calcDerivedCuadro')+extraer(s06,'calcDerivedLegacy')+extraer(s06,'calcDerivedMulti')+extraer(s06,'calcDerived')+(/function glacialAgregarDerivados/.test(s06)?extraer(s06,'glacialAgregarDerivados'):'')+'\nvar produccionEfectivaRecord=r=>(r.cuadros||[]).reduce((a,c)=>a+num(c.produccion&&c.produccion.efectiva),0);'+extraer(s09,'calcularKPIsPlanta'),sb);return sb;}
const ref=process.env.REF_ANTES||'788b482';
const A='js/produccion/08-graficos.js',B='js/produccion/06-registro.js',C='js/produccion/09-resumen.js';
const nuevo=ctx(leer(A),leer(B),leer(C)),antes=ctx(previo(A,ref),previo(B,ref),previo(C,ref));
const rec={linea:'PET1',cuadros:[{horasTurno:8,ratioNominal:2400,produccion:{efectiva:10000,programada:10000,sopladas:10000},
  mermas:[{item:'Botellas',unidades:100},{item:'Botella PET',unidades:50},{item:'Preforma 28 g',unidades:30},{item:'Tapas',unidades:20},{item:'Polietileno',unidades:2,peso:6.5},{item:'Cartón',unidades:4}]}]};
const a=antes.agruparMermas(rec),n=nuevo.agruparMermas(rec);
ok(a.totalUnidades===n.totalUnidades&&n.totalUnidades===206,'el total de mermas no cambia (206 unidades)');
ok(a.filas.length===6&&n.filas.length===5,'antes 6 filas con nombres sueltos; ahora 5 componentes');
const bot=n.filas.find(f=>f.item==='Botellas');
ok(bot&&bot.unidades===150,'«Botellas» y «Botella PET» se suman en un solo componente (150)');
ok(['Botellas','Preformas','Tapas','Polietileno','Cartón'].every(c=>n.filas.some(f=>f.item===c)),'nombres canónicos: Botellas, Preformas, Tapas, Polietileno; lo desconocido conserva su nombre');
const G=vm.runInContext('GlacialIndicadores',nuevo);
ok(Math.abs(G.merma(206,10000)-0.0206)<1e-12&&G.merma(5,0)===null,'merma = 206 ÷ 10 000 = 2,06 %; sin producción → sin dato');
ok(Math.abs(nuevo.calcularKPIsPlanta([rec]).mermaPct-0.0206)<1e-12,'cabecera del Resumen (09): 2,06 %, igual que antes ('+(antes.calcularKPIsPlanta([rec]).mermaPct*100).toFixed(2)+' %)');
const d=G.desgloseMerma([{item:'Botellas',unidades:100},{item:'Polietileno',unidades:2,peso:6.5}]);
ok(d[1].unidad==='kg'&&d[1].cantidad===6.5&&/rollos/.test(d[1].textoUnidad),'Polietileno se muestra en kg y rollos');
const s=f=>leer('js/produccion/'+f);
['08-graficos','09-resumen','14-exportar-general','49-resumen-indicadores'].forEach(f=>ok(/GlacialIndicadores\.merma\(/.test(s(f+'.js')),f+': usa GlacialIndicadores.merma'));
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
