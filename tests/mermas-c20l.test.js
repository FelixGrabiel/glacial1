/* Mermas de CAJAS 20L: peso CALCULADO en kg por componente; el dato ingresado nunca se sobrescribe. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const cfg=leer('js/nucleo/01-config.js'),reg=leer('js/produccion/06-registro.js');
function extraer(src,n){const m=new RegExp('function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error('falta '+n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&!--d)break;}return src.slice(m.index,j+1);}
const a=cfg.indexOf('const MERMA_DIVISORES_POR_LINEA'),b=cfg.indexOf('MERMA_DIVISORES_POR_LINEA.PET1;',a)+'MERMA_DIVISORES_POR_LINEA.PET1;'.length;
const c1=cfg.indexOf('const MERMA_CONVERSION_FISICA_POR_LINEA'),c2=cfg.indexOf('/* PET2 usa exactamente');
const sb={console,Math,Number,Array,Object,String};vm.createContext(sb);sb.window=sb;
let renders=0;sb.renderFormTab=()=>{renders++;};sb.requestAnimationFrame=f=>f();sb.scrollTo=()=>{};sb.document={getElementById:()=>null};
sb.draft=null;sb.normalizarCuadros=d=>d.cuadros;
vm.runInContext('var num=v=>{const n=Number(v);return isFinite(n)?n:0;};'+cfg.slice(a,b)+
  ['calcularMermaFisica','calcularValoresMerma','obtenerValoresMermaCuadro','obtenerValoresMerma','actualizarMermasAutomaticasCuadro','actualizarMermasAutomaticas','mermaCampoEditableC20L','mermaEntradaValida','updateMermaCuadro','updateMerma','mermaKgTexto','mermasTableC20L','syncLegacyFromCuadro1']
  .map(n=>n==='syncLegacyFromCuadro1'?'function syncLegacyFromCuadro1(){}':extraer(reg,n)).join('\n'),sb);
const fila=item=>({item,peso:0,unidades:0});
const nuevoDraft=()=>{sb.draft={linea:'C20L',cuadros:[{mermas:['Cajas','Bolsas Trilaminadas','Tapa','Polietileno 54 cm'].map(fila),produccion:{efectiva:10000}}]};return sb.draft.cuadros[0].mermas;};
const upd=(i,campo,v)=>sb.updateMermaCuadro(0,i,campo,v);
const cerca=(x,y)=>Math.abs(x-y)<1e-9;

/* ---- casos de aceptación ---- */
let m=nuevoDraft();
upd(0,'unidades','100');upd(1,'unidades','100');upd(2,'unidades','100');upd(3,'pesoIngresadoKg','10');
ok(cerca(m[0].peso,56)&&m[0].unidades===100,'100 cajas → 56 kg calculados');
ok(cerca(m[1].peso,90.6),'100 bolsas trilaminadas → 90.6 kg (factor 0.906, no 0.0906)');
ok(cerca(m[2].peso,11.14),'100 tapas → 11.14 kg');
ok(cerca(m[3].peso,3.6)&&m[3].pesoIngresadoKg===10&&m[3].unidades===0,'10 kg de polietileno → 3.6 kg calculados; el peso original (10) se conserva y no genera UND');
upd(3,'pesoIngresadoKg','0.5');ok(cerca(m[3].peso,0.18)&&m[3].pesoIngresadoKg===0.5,'0.5 kg de polietileno → 0.18 kg');
upd(3,'pesoIngresadoKg','10');
ok(cerca(56+90.6+11.14+3.6,161.34),'total de los cuatro casos = 161.34 kg');
ok(cerca(m.reduce((s,r)=>s+r.peso,0),161.34),'la suma de los pesos calculados del formulario es 161.34 kg');

/* ---- idempotencia: recalcular, editar otra fila, guardar y reabrir ---- */
for(let k=0;k<5;k++)sb.actualizarMermasAutomaticasCuadro(0);
upd(0,'unidades','100');
const guardado=JSON.parse(JSON.stringify(sb.draft));      // guardar y reabrir
sb.draft=guardado;m=guardado.cuadros[0].mermas;
for(let k=0;k<3;k++)sb.actualizarMermasAutomaticasCuadro(0);
ok(cerca(m[3].peso,3.6)&&m[3].pesoIngresadoKg===10,'recalcular varias veces, cambiar otra fila, guardar y reabrir: sigue 3.6 kg y el original 10 kg (nunca 1.296)');
ok(cerca(m[0].peso,56)&&m[0].unidades===100,'las UND de cajas tampoco cambian');

/* ---- bloqueos ---- */
const antes=JSON.stringify(m);
upd(0,'peso','999');upd(0,'pesoIngresadoKg','5');upd(3,'unidades','50');upd(3,'peso','7');upd(2,'pesoIngresadoKg','1');
ok(JSON.stringify(m)===antes,'el peso calculado no se edita y cada componente solo acepta su dato (UND o kg)');
upd(0,'unidades','-5');upd(0,'unidades','abc');upd(3,'pesoIngresadoKg','-1');upd(3,'pesoIngresadoKg','Infinity');
ok(JSON.stringify(m)===antes,'valores negativos o inválidos se rechazan');
upd(0,'unidades','');upd(3,'pesoIngresadoKg','');
ok(m[0].peso===0&&m[3].peso===0&&[m[0].peso,m[0].unidades,m[3].peso].every(Number.isFinite),'campos vacíos → 0, sin NaN ni Infinity');
upd(0,'unidades','0');ok(m[0].peso===0,'cero es válido');
ok(sb.mermaEntradaValida('1.5')&&sb.mermaEntradaValida('')&&!sb.mermaEntradaValida('-0.1')&&!sb.mermaEntradaValida('NaN'),'validación de entrada');

/* ---- factores no intercambiados ---- */
const v=(item,campo,val)=>{const r=fila(item);r[campo]=val;return sb.calcularValoresMerma(r,'C20L');};
ok(cerca(v('Cajas','unidades',1).peso,0.56)&&cerca(v('Bolsas Trilaminadas','unidades',1).peso,0.906)&&cerca(v('Tapa','unidades',1).peso,0.1114)&&cerca(v('Polietileno 54 cm','pesoIngresadoKg',1).peso,0.36),'cada componente usa su propio factor');
ok(cerca(v('Tapa','unidades',3).peso,0.3342),'precisión completa (3 tapas = 0.3342 kg), sin redondear el factor');

/* ---- registros anteriores ---- */
const viejo={item:'Polietileno 54 cm',peso:9.06,unidades:100};
const rv=sb.calcularValoresMerma(viejo,'C20L');
ok(rv.peso===9.06&&rv.unidades===100&&rv.sinPesoIngresado===true&&viejo.pesoIngresadoKg===undefined,'polietileno antiguo (sin peso original): se conserva tal cual, no se trata como peso capturado ni se recalcula');
const html=sb.mermasTableC20L([viejo,fila('Cajas')],10000,'C20L',(i,c)=>`f(${i},'${c}')`,null,false);
ok(/Registro anterior/.test(html)&&/ingresa el peso en kg/.test(html),'el formulario pide capturar el peso si no se puede recuperar');

/* ---- formularios ---- */
nuevoDraft();sb.draft.cuadros[0].mermas[0].unidades=100;sb.draft.cuadros[0].mermas[3].pesoIngresadoKg=10;sb.actualizarMermasAutomaticasCuadro(0);
const h=sb.mermasTableC20L(sb.draft.cuadros[0].mermas,10000,'C20L',(i,c)=>`updateMermaCuadro(0,${i},'${c}',this.value)`,sb.draft.cuadros[0],true);
const filas=h.split('<tr>').slice(2);   // sin cabecera
ok(filas.length===5&&filas.slice(0,4).every(f=>(f.match(/readonly/g)||[]).length===1),'cada fila tiene exactamente un campo de solo lectura (el peso calculado)');
ok(/Peso calculado \(kg\)/.test(h)&&/Dato ingresado/.test(h)&&/kg ingresados/.test(h)&&/UND/.test(h),'etiquetas claras: dato ingresado vs peso calculado');
ok(/value="3\.6"/.test(h)&&/value="10"/.test(h)&&/value="56"/.test(h),'se muestran 10 kg ingresados y 3.6 kg calculados por separado');
const polFila=filas[3];ok(/>—</.test(polFila),'polietileno: porcentaje «—» (no se divide kg entre UND)');
ok(/1\.0000|>0\.56%|1\.00%/.test(filas[0]),'cajas conserva su porcentaje por unidades (100 ÷ 10,000 = 1.00%)');
ok(/161\.34 kg|56\.0|<b>[\d.]+ kg/.test(h)&&h.includes('<b>'+sb.mermaKgTexto(56+0+0+3.6)+' kg</b>'),'el total suma solo pesos calculados en kg');
const hc=sb.mermasTableC20L(sb.draft.cuadros[0].mermas,10000,'C20L',(i,c)=>`updateMerma(${i},'${c}',this.value)`,null,false);
ok(/updateMerma\(3,'pesoIngresadoKg'/.test(hc)&&!/mermas-cuadro-scroll/.test(hc),'el formulario compatible usa las mismas reglas sin el contenedor del cuadro');

/* formulario compatible (draft.mermas) */
sb.draft={linea:'C20L',mermas:['Cajas','Bolsas Trilaminadas','Tapa','Polietileno 54 cm'].map(fila)};
sb.updateMerma(1,'unidades','100');sb.updateMerma(3,'pesoIngresadoKg','10');sb.updateMerma(3,'peso','99');sb.updateMerma(0,'pesoIngresadoKg','5');
for(let k=0;k<4;k++)sb.actualizarMermasAutomaticas();
const mc=sb.draft.mermas;
ok(cerca(mc[1].peso,90.6)&&cerca(mc[3].peso,3.6)&&mc[3].pesoIngresadoKg===10&&mc[0].pesoIngresadoKg===undefined,'formulario compatible: mismas fórmulas, bloqueos e idempotencia');

/* ---- otras líneas no cambian ---- */
const p=(linea,item,peso,gram)=>sb.calcularValoresMerma({item,peso,unidades:0},linea,gram);
ok(p('PET1','Botellas',2.8,28).unidades===100&&p('PET1','Tapa Plana',1.34).unidades===1000,'PET1 conserva sus fórmulas');
ok(p('B7L','Tapa',4.72).unidades===1000&&p('B7L','Polietileno 48cm',28).unidades===1,'B7L conserva sus fórmulas');
const b20=sb.calcularValoresMerma({item:'Bidones',peso:3,unidades:7},'B20L');
ok(b20.peso===3&&b20.unidades===7,'B20L conserva su comportamiento (sin factor de C20L)');
ok(!/0\.0906|CAMBIAR AQUI EL PESO/.test(reg),'ya no existe el factor genérico 0.0906 ni el 0.56 aplicado a todos los componentes');
ok((reg.match(/0\.56|0\.906|0\.1114/g)||[]).length===0&&/0\.56/.test(cfg)&&/0\.906\b/.test(cfg),'los factores viven solo en 01-config.js');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
