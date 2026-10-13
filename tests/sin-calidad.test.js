/* El indicador «Calidad» se retiró de toda la página. Comprueba: (1) que no queda ninguna aparición del indicador y que lo que sí se conserva está en una
   lista cerrada; (2) que el OEE, la disponibilidad, el rendimiento, el cumplimiento y la cascada de pérdidas dan EXACTAMENTE los mismos números que antes
   (se compara contra la versión anterior, commit 67357e4); (3) que las hojas de Excel y el reporte en imagen quedaron coherentes. */
const fs=require('fs'),vm=require('vm'),cp=require('child_process'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const antes=f=>cp.execSync('git show 67357e4:'+f,{cwd:R,maxBuffer:1e8}).toString().replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('(?:async[ ]+)?function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error('no se encontró '+n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}return src.slice(m.index,j+1)+'\n';}

/* ---------- 1) inventario: lo único que puede seguir diciendo «calidad» ---------- */
const archivos=[];
(function rec(d){fs.readdirSync(R+'/'+d,{withFileTypes:true}).forEach(e=>{const p=d+'/'+e.name;if(e.isDirectory())rec(p);else if(/\.js$/.test(e.name))archivos.push(p);});})('js');
const PERMITIDO=[
  /produccion\??\.calidad/,                       // campo «Botellas calidad» del registro (rechazadas): se conserva
  /'Cajas Calidad'|'Bidones Calidad'|'CALIDAD'/,  // etiquetas de ese campo en el formulario
  /calidad:\s*0,/,                                // valor inicial de ese campo
  /Técnico de Calidad/,                           // cargo
  /Charla de Ingreso Sup\. Calid\./,              // parada programada
  /Calidad \/ producto no conforme/,              // motivo de parada
  /calidad del dato/i,                            // «Calidad del dato» de Análisis de paradas (qué tan completos están los datos, no el indicador)
  /alertas de calidad de datos|ALERTAS DE CALIDAD DE DATOS/,   // calidad de los DATOS (hoja de alertas del Excel general)
  /^\s*Calidad:\s*$|JPEG|quality/                 // compresión de imágenes
];
const sobrantes=[];
archivos.forEach(f=>{
  leer(f).split('\n').forEach((l,i)=>{
    if(!/calidad|calid\b|quality/i.test(l))return;
    if(PERMITIDO.some(re=>re.test(l)))return;
    sobrantes.push(f+':'+(i+1)+' '+l.trim().slice(0,100));
  });
});
ok(sobrantes.length===0,'ninguna pantalla, imagen ni Excel conserva el indicador «Calidad» (solo quedan el campo «Botellas calidad», el cargo, la charla y el motivo de parada)'+(sobrantes.length?': '+sobrantes.slice(0,5).join(' | '):''));
ok(!/calidadBot|perdidaCalidad|NOTA_CALIDAD|muestrasCalidad|METAS\.calidad|d\.calidad|\.calidad\b(?!\s*[,)])/.test(archivos.filter(f=>!/06-registro/.test(f)).map(leer).join('\n').replace(/produccion\??\.calidad/g,'')),'no quedan variables ni metas del indicador (calidadBot, perdidaCalidad, NOTA_CALIDAD, METAS.calidad…)');

/* ---------- 2) los números no cambian ---------- */
function motor(leerFn){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,Promise,isFinite,parseInt,parseFloat};vm.createContext(sb);sb.window=sb;
  sb.document={getElementById:()=>null,addEventListener(){},createElement:()=>({style:{}}),head:{appendChild(){}}};
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  sb.GlacialIndicadores=sb.window.GlacialIndicadores;
  const s06=leerFn('js/produccion/06-registro.js'),s08=leerFn('js/produccion/08-graficos.js');
  vm.runInContext('var num=v=>{const n=Number(v);return isFinite(n)?n:0;};'+['glacialAgregarDerivados','calcDerivedLegacy','calcDerivedCuadro','calcDerivedMulti','calcDerived'].map(n=>extraer(s06,n)).join('')+extraer(s08,'calcCascada'),sb);
  return sb;
}
const viejo=motor(antes),nuevo=motor(leer);
const rec=(extra)=>Object.assign({linea:'PET1',fecha:'2026-10-09',turno:'DÍA',horasTurno:12,ratioNominal:2400,
  paradasProgramadas:[{tiempoMin:60}],paradasNoProgramadas:[{tiempoMin:45},{tiempoMin:30}],produccion:{efectiva:19000,programada:21000,sopladas:19500,calidad:150,paletas:12}},extra||{});
const casos=[
  rec(),                                                                                    // registro antiguo (sin cuadros)
  {linea:'PET1',cuadros:[rec(),rec({ratioNominal:2000,horasTurno:6,produccion:{efectiva:9000,programada:12000,sopladas:9100,calidad:0}})]},
  {linea:'PET2',cuadros:[rec({produccion:{efectiva:0,programada:0,sopladas:0,calidad:0}})]},   // sin producción
  {linea:'B7L',cuadros:[rec({ratioNominal:0})]},                                               // sin velocidad
  {linea:'C20L',cuadros:[rec({produccion:{efectiva:500,programada:400,sopladas:0,calidad:20}})]}
];
const CLAVES=['horasEfectivas','produccionNominal','disponibilidad','rendimiento','oee','cumplimiento','eficiencia','noCumplida','ratioEfectivo','pProg','pNoProg','efectivaVel','planMinVel','npMinVel'];
let iguales=true,detalle='';
casos.forEach((c,i)=>{
  const a=viejo.calcDerived(JSON.parse(JSON.stringify(c))),b=nuevo.calcDerived(JSON.parse(JSON.stringify(c)));
  CLAVES.forEach(k=>{if(a[k]!==undefined&&!(Math.abs(a[k]-b[k])<1e-12)){iguales=false;detalle+=' caso '+i+' '+k+' '+a[k]+' → '+b[k];}});
  ok(!('calidad' in b)&&!('calidadBot' in b)&&!('muestrasCalidad' in b),'caso '+i+': el resultado ya no trae calidad');
});
ok(iguales,'OEE, disponibilidad, rendimiento, cumplimiento, eficiencia, horas y ratios dan EXACTAMENTE los mismos números que antes en 5 registros (con y sin cuadros, sin producción y sin velocidad)'+detalle);
let cascIguales=true;
casos.forEach((c,i)=>{
  const a=viejo.calcCascada(JSON.parse(JSON.stringify(c))),b=nuevo.calcCascada(JSON.parse(JSON.stringify(c)));
  ['capacidadTeorica','perdidaDisponibilidad','perdidaRendimiento','buena','oee'].forEach(k=>{if(!(Math.abs(a[k]-b[k])<1e-6)){cascIguales=false;detalle+=' casc '+i+' '+k+' '+a[k]+' → '+b[k];}});
  ok(b.perdidaCalidad===undefined&&Math.abs(b.capacidadTeorica-b.perdidaDisponibilidad-b.perdidaRendimiento-b.buena)<1e-6,'cascada del caso '+i+': cierra (capacidad − paradas − ritmo = producción buena) sin escalón de calidad');
});
ok(cascIguales,'la cascada de pérdidas da los mismos números que antes (capacidad, paradas, ritmo y producción buena)'+detalle);
// el caso con producción cero: antes el escalón de calidad no restaba nada porque rendimiento = 0
const sinProd=nuevo.calcCascada(casos[2]);ok(sinProd.buena===0,'registro sin producción: producción buena = 0');

/* ---------- 3) Excel y reportes ---------- */
const s08=leer('js/produccion/08-graficos.js');
ok(/spansKpi = \[\[2,5\],\[6,9\],\[10,13\],\[14,17\],\[18,21\]\]/.test(s08)&&/xlSemaforoCF\(ws, `Q\$\{rc0\}:T\$\{rt\}`\)/.test(s08)&&/\['Cumplimiento'/.test(s08)||/Cumplim\./.test(s08),'Excel del reporte diario: 5 tarjetas que cubren el ancho, tabla por cuadro sin la columna Calidad y con el semáforo en las columnas que quedan (Disponib., Rendim., OEE, Cumplim.)');
ok(/pond\('M', 'oee'\)/.test(s08)&&/sp\('N', 'paradas'\)/.test(s08)&&/K\$\{res\.r0\}:M\$\{res\.rt\}/.test(s08)&&/G\$\{res\.r0\}:K\$\{res\.rt\}/.test(s08),'Excel de historial y de resumen de líneas: fórmulas y rangos de color ajustados a las columnas que quedan');
// hoja de historial: cada fila trae tantos valores como columnas
{
  const cols=(s08.match(/nombre:'Historial línea'[^]*?columnas:\[([^]*?)\],\s*filas:/)||[])[1]||'';
  const nCols=(cols.match(/\{ h:/g)||[]).length;
  const vacia=(s08.match(/\[\['', '', '', '', 'Sin registros'[^\]]*\]\]/)||[''])[0];
  const nVacia=vacia.replace(/^\[\[/,'').replace(/\]\]$/,'').split(',').length;
  ok(nCols===15&&nVacia===15,'Excel de historial: 15 columnas y la fila «Sin registros» tiene 15 celdas ('+nCols+' / '+nVacia+')');
}
{
  const s14=leer('js/produccion/14-exportar-general.js');
  const cab=eval((s14.match(/const XLG_COLUMNAS_DATOS = (\[[^]*?\]);/)||[])[1]);
  const fila=(s14.match(/ws\.addRow\(\[([^]*?)\]\);/)||[])[1];
  const n=fila.split(',').filter(x=>x.trim()).length;
  ok(cab.length===25&&!cab.includes('Calidad')&&cab.includes('Rechazadas')&&n===25,'Excel general (hoja Datos): 25 columnas sin «Calidad», conservando «Rechazadas» ('+cab.length+' encabezados / '+n+' valores)');
  const enc=(s14.slice(s14.indexOf('function xlgHojaMatrizLineas')).match(/const encabezados = (\[[^]*?\]);/)||[])[1];
  const encs=eval(enc);
  ok(encs.length===11&&!encs.includes('Calidad')&&/pct\(dispPlanta\), '—', pct\(oeePlanta\)/.test(s14)&&/getCell\(fila, 7\)\.fill/.test(s14),'Excel general (matriz de líneas): 11 columnas y el color del OEE en la columna que corresponde');
}
{
  const s47=leer('js/produccion/47-analisis-paradas.js');
  ok(/'Rendimiento %','OEE %','Observación'\]/.test(s47)&&/\[12,14,12,16,18,18,14,10,28\]/.test(s47)&&!/NOTA_CALIDAD/.test(s47),'Excel de Análisis de paradas: hoja «OEE base» sin la columna Calidad y con anchos ajustados');
}
{
  const s61=leer('js/produccion/61-reporte-linea.js'),s62=leer('js/produccion/62-reporte-registro.js');
  ok(!/Calidad/.test(s61)&&!/calidad/.test(s62.replace(/disponibilidad|calidad de datos/g,''))&&/iw=iw1\*2\+12/.test(s61),'imagen del reporte: tres indicadores (el OEE ocupa todo el ancho de la segunda fila, sin hueco)');
}
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
