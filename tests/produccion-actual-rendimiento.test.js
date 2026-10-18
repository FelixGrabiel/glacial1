/* Rendimiento de Producción actual (INP alto al abrir el módulo): los cálculos de «programado vs. producido»
   ya no recorren todo el historial de Paletas en cada consulta. Se comprueba que el índice da EXACTAMENTE
   lo mismo que el recorrido completo, que se rearma cuando cambian los datos, y que es rápido con mucho historial. */
const {leer,extraer}=require('./planificacion-harness.js');
const vm=require('vm');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const s16=leer('js/produccion/16-paletas.js');
const nombres=['normalizarClavePaletas','claveCombinacionPaletas','esCombinacionPaletas','paletasDeCombinacionPaletas','claveProgramacionPaleta','obtenerProgramacionPaleta','datosProgramacionCombinacion','resumenProgramacionCombinacionTurnos','combinacionesConDatosPaletas','productosProduccionActual'];
const sb={console,Math,Number,Array,Object,String,Date,JSON,Set,Map};vm.createContext(sb);sb.window=sb;
vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
sb.LINES=['PET1','PET2','B7L','C20L','B20L'].map(k=>({key:k,name:k}));
sb.num=v=>{const n=Number(v);return isFinite(n)?n:0;};
sb.obtenerUnidadesPorPalet=()=>1000;
vm.runInContext(nombres.map(n=>extraer(s16,n)).join(''),sb);

/* Datos: historial grande con variantes de escritura (tildes, mayúsculas, espacios, «Litros», fecha dd/mm/aaaa). */
const marcas=['Bells','BELLS ','Scala','Fontlife'],pres=['Pack_Regular_2.5Lx6und','1 L · PACK X 12 UND','7 Litros','7L','Regular_625ml'];
const turnos=['DÍA','DIA','INTERMEDIO','NOCHE'];
function generar(n){
  const pal=[],prog=[];const d0=Date.UTC(2026,6,20);
  for(let i=0;i<n;i++){
    const dia=new Date(d0+Math.floor(i/(n/60))*864e5),iso=dia.toISOString().slice(0,10);
    const fecha=i%17===0?iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4):iso;
    const l=sb.LINES[i%5].key,t=turnos[i%4],m=marcas[(i>>1)%4],p=pres[(i>>2)%5];
    pal.push({id:'p'+i,linea:l,fecha,turno:t,marca:m,presentacion:p,totalUnidades:500+(i%7)*100,paletas:1+(i%3),tipoPaleta:i%9===0?'INCOMPLETA':'COMPLETA'});
    if(i%8===0)prog.push({clave:[l,iso,t,m,p].join('|'),linea:l,fecha:iso,turno:t,marca:m,presentacion:p,cantidadProgramada:12000+i,unidadesPorPaleta:1000});
  }
  return {pal,prog};
}
let {pal,prog}=generar(12000);
sb.loadPaletas=()=>pal;sb.loadProgramaciones=()=>prog;

/* Referencias «a la antigua» (recorrido completo), para comparar. */
const viejaPaletas=k=>pal.filter(p=>sb.esCombinacionPaletas(p,k));
const viejaProg=(l,f,t,m,p)=>{const c=sb.claveProgramacionPaleta(l,f,t,m,p);return prog.find(x=>x.clave===c)||prog.find(x=>sb.esCombinacionPaletas(x,sb.claveCombinacionPaletas(l,f,t,m,p)))||null;};

/* 1) Mismos registros, en el mismo orden, para muchas combinaciones (incluidas las que no existen). */
const consultas=[];
for(let i=0;i<400;i++){const r=pal[(i*37)%pal.length];consultas.push([r.linea,r.fecha,turnos[(i>>1)%4],marcas[i%4],pres[(i>>2)%5]]);}
consultas.push(['PET1','2026-07-21','DÍA','NoExiste','Nada']);
let igualesPal=true,igualesProg=true;
consultas.forEach(q=>{
  const k=sb.claveCombinacionPaletas(...q);
  const a=sb.paletasDeCombinacionPaletas(k),b=viejaPaletas(k);
  if(a.length!==b.length||a.some((x,i)=>x!==b[i]))igualesPal=false;
  if(sb.obtenerProgramacionPaleta(...q)!==viejaProg(...q))igualesProg=false;
});
ok(igualesPal,'paletas de una combinación: el índice devuelve los mismos registros y en el mismo orden que el recorrido completo');
ok(igualesProg,'programación de una combinación: misma fila que los dos find() anteriores (clave exacta primero, luego normalizada)');
ok(sb.claveCombinacionPaletas('PET1','05/08/2026','Día','BELLS ','7 Litros')===sb.claveCombinacionPaletas('pet1','2026-08-05','dia','bells','7L'),
  'la normalización con caché sigue tratando igual tildes, mayúsculas, espacios, «Litros» y fechas dd/mm/aaaa');

/* 2) El índice se rearma cuando cambian los datos. */
const k0=sb.claveCombinacionPaletas(pal[5].linea,pal[5].fecha,pal[5].turno,pal[5].marca,pal[5].presentacion);
const antes=sb.paletasDeCombinacionPaletas(k0).length;
pal=pal.concat([{...pal[5],id:'nuevo'}]);                                  // snapshot nuevo (lista nueva)
ok(sb.paletasDeCombinacionPaletas(k0).length===antes+1,'lista nueva (snapshot o guardado): aparece el registro nuevo');
pal.push({...pal[5],id:'nuevo2'});                                         // misma lista, un elemento más
ok(sb.paletasDeCombinacionPaletas(k0).length===antes+2,'misma lista con un elemento agregado: también se ve');
const i5=pal.findIndex(p=>p.id==='nuevo2');pal[i5]={...pal[i5],marca:'OtraMarca'};   // reemplazo en el mismo lugar
ok(sb.paletasDeCombinacionPaletas(k0).length===antes+1,'elemento reemplazado en su lugar (mismo largo): el índice lo nota');
const pr0=prog[3];const q0=[pr0.linea,pr0.fecha,pr0.turno,pr0.marca,pr0.presentacion];
ok(sb.obtenerProgramacionPaleta(...q0)===pr0,'programación existente encontrada');
prog=prog.map(x=>x===pr0?{...x,cantidadProgramada:999}:x);
ok(sb.obtenerProgramacionPaleta(...q0).cantidadProgramada===999,'programación editada (lista nueva): devuelve la versión nueva, no la vieja');
prog[prog.length]={...pr0,clave:'X|nueva',marca:'MarcaNueva'};
ok(sb.obtenerProgramacionPaleta(pr0.linea,pr0.fecha,pr0.turno,'MarcaNueva',pr0.presentacion)!==null,'programación agregada a la misma lista: se encuentra');

/* 3) Totales de Producción actual iguales a los del cálculo completo. */
const fecha=pal[pal.length-10].fecha;
const prod=sb.productosProduccionActual(fecha,['DÍA','INTERMEDIO','NOCHE']);
let esperadas=0;
sb.LINES.forEach(l=>sb.combinacionesConDatosPaletas(l.key,fecha,['DÍA','INTERMEDIO','NOCHE']).forEach(c=>['DÍA','INTERMEDIO','NOCHE'].forEach(t=>
  viejaPaletas(sb.claveCombinacionPaletas(l.key,fecha,t,c.marca,c.presentacion)).forEach(r=>esperadas+=sb.num(r.totalUnidades)))));
ok(prod.reduce((a,x)=>a+x.unidadesProducidas,0)===esperadas,'Producción actual: unidades producidas iguales al recorrido completo ('+esperadas+')');

/* 4) Rápido con mucho historial (antes: ~50 ms por consulta con 15 000 registros). */
({pal,prog}=generar(20000));
sb.paletasDeCombinacionPaletas(sb.claveCombinacionPaletas('PET1','2026-07-20','DÍA','Bells','x'));   // arma el índice
let t=Date.now();
for(let i=0;i<300;i++){const r=pal[(i*53)%pal.length];sb.resumenProgramacionCombinacionTurnos(r.linea,r.fecha,['DÍA','INTERMEDIO'],r.marca,r.presentacion);}
const ms=Date.now()-t;
ok(ms<3000,'300 consultas de programado vs. producido con 20 000 registros en '+ms+' ms (antes: ~15 000 ms)');

/* 5) index.html carga la versión nueva. */
ok(/16-paletas\.js\?v=20261018-inp1/.test(leer('index.html')),'index.html sube la versión de 16-paletas.js (evita caché)');

console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
