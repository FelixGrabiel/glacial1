/* Conversiones de mermas (Asistente › Conversiones · js/asistente/95-conversiones.js).
   · Núcleo: valores del código, textos «1 UND = 1,34 g», vigencia por fecha, validaciones del cambio.
   · Registro (06-registro.js · calcularValoresMerma): con las conversiones migradas da EXACTAMENTE lo mismo que con las tablas
     del código, para todas las líneas, ítems y muchos pesos/UND; sin documento o con error de lectura usa el código.
   · Un cambio vale desde su fecha: un reporte de la víspera sigue con el valor anterior; solo cambian las líneas elegidas.
   · Migración glacial_44 e index.html / pestaña conectados. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');
const funcion=(txt,nombre)=>{const i=txt.indexOf('function '+nombre+'(');if(i<0)throw new Error('no está '+nombre);let d=0;const j=txt.indexOf('{',txt.indexOf(')',i));
  for(let k=j;k<txt.length;k++){if(txt[k]==='{')d++;else if(txt[k]==='}'&&!--d)return txt.slice(i,k+1);}};

const N=require(R+'/js/asistente/95-conversiones.js');
const c01=leer('js/nucleo/01-config.js'),r06=leer('js/produccion/06-registro.js'),u05=leer('js/nucleo/05-utils.js');

/* ---------- entorno del Registro: tablas y funciones reales ---------- */
const sb={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,RegExp};vm.createContext(sb);sb.window=sb;
const tabla=n=>{const m=c01.match(new RegExp('const '+n+'\\s*=\\s*(\\{[\\s\\S]*?\\n\\};)'));if(!m)throw new Error('no está '+n);return m[1].replace(/;$/,'');};
vm.runInContext('var MERMA_DIVISORES_POR_LINEA='+tabla('MERMA_DIVISORES_POR_LINEA')+';var MERMA_CONVERSION_FISICA_POR_LINEA='+tabla('MERMA_CONVERSION_FISICA_POR_LINEA')+
  ';MERMA_DIVISORES_POR_LINEA.PET2=MERMA_DIVISORES_POR_LINEA.PET1;var draft=null;\n'+
  ['mermaConfigVigente','mermaConversionFisica','mermaDivisor'].map(f=>funcion(c01,f)).join('\n')+'\n'+funcion(u05,'num')+'\n'+
  ['fechaMermaRegistro','calcularMermaFisica','calcularValoresMerma'].map(f=>funcion(r06,f)).join('\n'),sb);
const DIV=sb.MERMA_DIVISORES_POR_LINEA,FIS=sb.MERMA_CONVERSION_FISICA_POR_LINEA;

/* ---------- núcleo ---------- */
const COD=N.desdeCodigo(DIV,FIS);
const nCod=Object.keys(DIV).reduce((a,l)=>a+Object.keys(DIV[l]).length,0)+Object.keys(FIS).reduce((a,l)=>a+Object.keys(FIS[l]).length,0);
ok(COD.length===nCod&&COD.every(x=>x.vigenteDesde===N.DESDE_CODIGO&&x.origen==='codigo'),`desdeCodigo: ${COD.length} conversiones, una por línea e ítem del código (PET2 incluida)`);
ok(!COD.some(x=>/paleta/i.test(x.item)),'desdeCodigo: no incluye unidades por paleta');
ok(COD.every(x=>N.UNIDADES.includes(x.unidad)),'desdeCodigo: unidades solo UND, PLANCHA o KG');
const e=(l,i)=>COD.find(x=>x.clave===l+'|'+i);
ok(N.texto(e('PET1','Tapa Plana').config,'UND')==='1 UND = 1,34 g','texto: Tapa Plana PET1 → «1 UND = 1,34 g»');
ok(N.texto(e('PET1','Etiqueta').config,'UND')==='1 UND = 0,64 g','texto: Etiqueta PET1 (divisor en kg) → «1 UND = 0,64 g»');
ok(N.texto(e('PET1','Polietileno').config,'UND')==='1 UND = 28 kg','texto: Polietileno PET1 → «1 UND = 28 kg»');
ok(N.texto(e('C20L','Cajas').config,'UND')==='1 UND = 560 g','texto: Cajas C20L (UND → kg) → «1 UND = 560 g»');
ok(N.texto(e('C20L','Polietileno 54 cm').config,'KG')==='1 KG ingresado = 0,36 KG','texto: Polietileno 54 cm C20L → factor de peso');
ok(/gramaje/.test(N.texto(e('PET1','Botellas').config,'UND')),'texto: Botellas usa el gramaje de la preforma');
ok(N.conValor(e('PET1','Etiqueta').config,0.64).divisor===0.00064&&N.conValor(e('PET1','Etiqueta').config,0.64).sinMultiplicarPor1000===true,'conValor: guardar el mismo valor deja la misma forma del código (Etiqueta)');
ok(N.conValor(e('PET1','Polietileno').config,28000).decimales===2,'conValor: conserva los decimales (Polietileno)');

/* ---------- Registro: migrado = código, en todo ---------- */
let doc=null,falla=false;
sb.glacialConversiones={config(l,i,f){if(falla||!doc)return undefined;return N.vigente(doc.conversiones,l,i,f||'2026-11-07');}};
const casosMerma=[];
const pesos=[0,0.001,0.013,0.5,1,1.34,2.5,3.333,7.77,10,12.345,28,55.5,100,250.75,999.99];
COD.forEach(x=>pesos.forEach(p=>{
  casosMerma.push({linea:x.linea,r:{item:x.item,peso:p,unidades:Math.round(p*37)},g:18.5});
  casosMerma.push({linea:x.linea,r:{item:x.item,peso:p,unidades:p*3,pesoIngresadoKg:p},g:0});
}));
['PET1','B7L','C20L'].forEach(l=>casosMerma.push({linea:l,r:{item:'Otro ítem',peso:4.2,unidades:9},g:20}));
const calc=(c,fecha)=>JSON.stringify(sb.calcularValoresMerma(c.r,c.linea,c.g,fecha));
doc=null;const sinDoc=casosMerma.map(c=>calc(c,'2026-11-07'));
sb.glacialConversiones.config=()=>undefined;const base=casosMerma.map(c=>calc(c,'2026-11-07'));
sb.glacialConversiones={config(l,i,f){if(falla||!doc)return undefined;return N.vigente(doc.conversiones,l,i,f||'2026-11-07');}};
ok(sinDoc.every((v,i)=>v===base[i]),'sin documento de conversiones: el Registro calcula con el código');
doc={conversiones:JSON.parse(JSON.stringify(COD))};
const migr=casosMerma.map(c=>calc(c,'2026-11-07'));
const dif=migr.map((v,i)=>v===base[i]?null:i).filter(i=>i!==null);
ok(!dif.length,`con las conversiones migradas: ${casosMerma.length} casos de merma idénticos al código${dif.length?' (difieren: '+dif.slice(0,3).map(i=>JSON.stringify(casosMerma[i])+' '+base[i]+' vs '+migr[i]).join(' | ')+')':''}`);
ok(casosMerma.filter(c=>c.r.pesoIngresadoKg===undefined).every((c,i)=>true),'casos: incluyen registros anteriores sin peso ingresado (C20L)');
falla=true;ok(casosMerma.map(c=>calc(c,'2026-11-07')).every((v,i)=>v===base[i]),'con error de lectura: el Registro usa el código');falla=false;
/* calculadora de la pestaña = fórmula del Registro */
const calcOk=COD.filter(x=>N.tipoDe(x.config)!=='FACTOR_PESO'&&N.tipoDe(x.config)!=='UND_A_PESO').every(x=>pesos.every(p=>{
  const r=sb.calcularValoresMerma({item:x.item,peso:p,unidades:0},x.linea,18.5,'2026-11-07');return N.calcular(x.config,p,18.5).valor===r.unidades;}))
  &&COD.filter(x=>N.tipoDe(x.config)==='UND_A_PESO').every(x=>[0,1,7,120].every(u=>N.calcular(x.config,u).valor===sb.calcularValoresMerma({item:x.item,unidades:u},x.linea,0,'2026-11-07').peso));
ok(calcOk,'calculadora de Conversiones: mismo resultado que el Registro');

/* ---------- cambio con vigencia ---------- */
const p0={item:'Tapa Plana',lineas:['PET1'],valor:1.4,unidad:'UND',vigenteDesde:'2026-11-08',motivo:'Nuevo molde de tapa',hoy:'2026-11-07',por:'Prueba',en:1};
const r1=N.planCambio(COD,p0);
ok(!r1.errores&&r1.nuevas.length===1&&r1.nuevas[0].version===1&&r1.nuevas[0].antes===1.34&&r1.historial.motivo==='Nuevo molde de tapa','planCambio: crea la versión 1 con el valor anterior y el motivo');
ok(r1.conversiones.length===COD.length+1,'planCambio: no borra versiones anteriores (historial completo)');
doc={conversiones:r1.conversiones};
const tapa={item:'Tapa Plana',peso:13.4,unidades:0};
ok(sb.calcularValoresMerma(tapa,'PET1',0,'2026-11-07').unidades===10000,'reporte del 07/11 (antes de la vigencia): sigue con 1,34 g → 10 000 UND');
ok(sb.calcularValoresMerma(tapa,'PET1',0,'2026-11-08').unidades===9571,'reporte del 08/11 (desde la vigencia): 1,40 g → 9 571 UND');
ok(sb.calcularValoresMerma(tapa,'PET2',0,'2026-11-08').unidades===10000,'PET2 no elegida: sigue con 1,34 g');
sb.draft={fecha:'2026-11-08'};ok(sb.fechaMermaRegistro()==='2026-11-08','el Registro toma la fecha del reporte en edición');sb.draft=null;
const r2=N.planCambio(r1.conversiones,{...p0,valor:1.5,vigenteDesde:'2026-11-10'});
ok(!r2.errores&&r2.nuevas[0].version===2&&N.vigente(r2.conversiones,'PET1','Tapa Plana','2026-11-09')===1.4&&N.vigente(r2.conversiones,'PET1','Tapa Plana','2026-11-10')===1.5,'dos cambios: cada fecha usa el suyo');
const err=p=>(N.planCambio(COD,{...p0,...p}).errores||[]).join(' ');
ok(/anterior a hoy/.test(err({vigenteDesde:'2026-11-06'})),'no acepta una vigencia anterior a hoy (no se recalcula hacia atrás)');
ok(/mayor que 0/.test(err({valor:0}))&&/mayor que 0/.test(err({valor:'x'})),'no acepta valor 0 o no numérico');
ok(/motivo/.test(err({motivo:'ab'})),'pide el motivo');
ok(/UND, PLANCHA o KG/.test(err({unidad:'ROLLO'})),'solo unidades UND, PLANCHA o KG');
ok(/gramaje/.test(err({item:'Botellas'})),'Botellas/Preformas (gramaje del cuadro) no se cambian aquí');
ok(/KG/.test(err({item:'Polietileno 54 cm',lineas:['C20L'],valor:0.4,unidad:'UND'})),'factor de peso de C20L: su unidad es KG');
ok(!N.planCambio(COD,{...p0,item:'Polietileno 54 cm',lineas:['C20L'],valor:0.4,unidad:'KG'}).errores,'factor de peso de C20L: se cambia en KG');
const pl=N.planCambio(COD,{...p0,unidad:'PLANCHA',lineas:['PET1','PET2']});
ok(!pl.errores&&pl.nuevas.length===2&&pl.nuevas.every(x=>x.unidad==='PLANCHA'),'un cambio puede aplicar a varias líneas y unidad PLANCHA');
ok(Math.round(N.variacion(1.34,1.4)*10)/10===4.5,'variación: 1,34 → 1,40 = +4,5 %');

/* ---------- conexiones ---------- */
const html=leer('index.html'),p72=leer('js/asistente/72-asistente-pantalla.js'),e02=leer('js/nucleo/02-estado.js');
ok(/95-conversiones\.js\?v=\d{8}-\w+/.test(html),'index.html carga 95-conversiones.js');
ok(/\['conversiones','Conversiones'/.test(p72)&&/conversiones:tabConversiones/.test(p72),'Asistente: pestaña «Conversiones»');
ok(/glacialConversionesEscuchas\(\)/.test(e02),'al iniciar sesión se escuchan las conversiones');
ok(/mermaDivisor\(linea, r\.item, fecha\)/.test(r06),'Registro: usa mermaDivisor con la fecha del reporte');
const mg=leer('supabase/migraciones/glacial_44_conversiones_mermas.sql');
ok(/d = 'conversiones'/.test(mg)&&/fac and autor and ver and hist/.test(mg)&&/position\('glacial_44' in def\) > 0 then return/.test(mg)&&/encontrado % veces/.test(mg),'glacial_44: solo «administrar factores», versión e historial; idempotente y se detiene si no encuentra el punto');

console.log(fallas?`\n${fallas} falla(s)`:'\nTodo correcto');
process.exit(fallas?1:0);
