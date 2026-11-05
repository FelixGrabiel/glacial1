/* Avance / Cierre: cada línea se separa por FORMATO = tamaño + tipo de agua (regular / con gas / saborizada). El tipo sale de la MARCA
   (MARCAS_POR_LINEA en 01-config.js: «Bells_Gas», «scala_Manzana», «Scala_Maracuya»…). node tests/avance-formato-tipo-agua.test.js */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error('no se encontró '+n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}return src.slice(m.index,j+1)+'\n';}
const s29=leer('js/produccion/29-avance-produccion.js'),c01=leer('js/nucleo/01-config.js');
const sb={console,Math,Number,Array,Object,String,RegExp,JSON};vm.createContext(sb);
vm.runInContext(s29.match(/const AV_TIPOS_AGUA=\{[^}]*\};/)[0]+';var AVANCE_NOMBRES={PET1:"PET1",PET2:"PET2",B7L:"B7L",C20L:"CAJAS 20L",B20L:"B20L"};'+
  ['avTipoAgua','avNombreMarca','avProductoWhatsApp','avTituloPresentacion','avTituloFormato','avVolumenFormatoPresentacion','avClaveFormatoPresentacion'].map(n=>extraer(s29,n)).join(''),sb);

/* Las marcas del código: con gas (Bells, Scala, Cuisine) y saborizadas (Bells, Scala). */
const marcasPet2=vm.runInContext('('+c01.match(/PET2:\s*(\[[\s\S]*?\])/)[1]+')',vm.createContext({}));
const gas=marcasPet2.filter(m=>sb.avTipoAgua(m)==='GAS'),sab=marcasPet2.filter(m=>sb.avTipoAgua(m)==='SABORIZADA');
ok(gas.join()==='Bells_Gas,Scala_Gas,Cuisine_Gas','con gas: Bells, Scala y Cuisine ('+gas.join(', ')+')');
ok(sab.length===6&&sab.every(m=>/^(bells|scala)_/i.test(m)),'saborizadas: Bells y Scala con Manzana, Maracuyá y Piña Kion ('+sab.join(', ')+')');
ok(['Bells','Scala','Cuisine','Glacial','Aro','San Jorgue','Merkat','Fontlife','BELLS','SCALA'].every(m=>sb.avTipoAgua(m)==='REGULAR'),'el resto de marcas: regular');
ok(sb.avNombreMarca('scala_Manzana')==='Scala · Manzana'&&sb.avNombreMarca('Bells_Piña_Kion')==='Bells · Piña Kion'&&sb.avNombreMarca('Bells_Gas')==='Bells · Gas'&&sb.avNombreMarca('SCALA')==='SCALA','nombres legibles: «Scala · Manzana», «Bells · Piña Kion»; las marcas simples quedan igual');
ok(sb.avProductoWhatsApp({marca:'Cuisine',presentacion:'Pack c/Sticker_Regular_2.5Lx6und'})==='Cuisine C/S','se conserva la marca C/S (sticker)');

/* Título: tamaño + tipo; los snapshots anteriores (sin tipo) conservan su título. */
ok(sb.avTituloPresentacion('PET2',{presentacion:'Pack_Regular_625mlx15und/ln',tipo:'SABORIZADA'})==='PET2 – 625 ML · SABORIZADA','título: «PET2 – 625 ML · SABORIZADA»');
ok(sb.avTituloPresentacion('PET2',{presentacion:'Pack_Regular_SC_1Lx6und/ln',tipo:'GAS'})==='PET2 – 1 L · CON GAS'&&sb.avTituloPresentacion('B7L',{presentacion:'7 Litros',tipo:'REGULAR'})==='B7L – 7 L · REGULAR','títulos «1 L · CON GAS» y «7 L · REGULAR»');
ok(sb.avTituloPresentacion('PET1',{presentacion:'Pack_Regular_2.5Lx6und'})==='PET1 – 2.5 L','snapshot anterior sin tipo: el título no cambia');

/* Bloques: la clave junta tamaño y tipo, también al unir los cuadros del registro (paradas y horarios del formato correcto). */
const bloques=extraer(s29,'avCalcularBloquesPresentacion');
ok(/claveBloque=\(presentacion,marca\)=>avClaveFormatoPresentacion\(presentacion\)\+'\|'\+avTipoAgua\(marca\)/.test(bloques)&&/claveBloque\(p\.presentacion,p\.marca\)/.test(bloques)&&/claveBloque\(q\?\.presentacion,q\?\.marca\)/.test(bloques),
  'cada bloque es tamaño + tipo, y los cuadros del registro van al bloque de su tipo');
ok(sb.avClaveFormatoPresentacion('Pack_Regular_625mlx6und/la')===sb.avClaveFormatoPresentacion('Pack_Regular_625mlx15und/ln'),'el mismo tamaño en distinto pack sigue en un bloque (sin cambiar)');
const img=extraer(s29,'avCanvasSnapshot');
ok(/FORMATOS`/.test(img)&&/g\.cabecera/.test(img)&&/ALTO_CABECERA/.test(img),'imagen: encabezado «PET2 · 3 FORMATOS» cuando la línea tiene más de un formato (y se suma a la altura)');
ok((m=>!!m&&m[1]>='20261104')(/29-avance-produccion\.js\?v=(\d{8})-/.exec(leer('index.html'))),'index.html sube la versión de 29-avance-produccion.js');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
