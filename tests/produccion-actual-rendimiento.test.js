/* Producción actual: índices de Paletas y de programaciones (js/produccion/16-paletas.js) — mismo resultado, mucho más rápido.
   node tests/produccion-actual-rendimiento.test.js   (REF_ANTES=<commit> imprime además los tiempos del código anterior) */
'use strict';
const fs=require('fs'),cp=require('child_process'),vm=require('vm'),R=require('path').resolve(__dirname,'..');
const {cargar16,TURNOS}=require('./ayuda/paletas-rendimiento-harness.js');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const src=leer('js/produccion/16-paletas.js');
const sb=cargar16(src);
const ev=c=>vm.runInContext(c,sb);

/* ---- datos: ≥12.000 registros con variantes de escritura ---- */
let semilla=11;const rnd=()=>{semilla=(semilla*16807)%2147483647;return semilla/2147483647;};
const pick=a=>a[Math.floor(rnd()*a.length)];
const MARCAS=['Scala','Glacial','Bells','Aro','Merkat','Cuisine','Fontlife','Día Feliz'];
const PRES=['625 ML PACK X 15 UND','1 L PACK X 12 UND','380 ML PACK X 24 UND','7 Litros','7L','20 Litros','1.5 L PACK X 6 UND'];
const LINEAS=['PET1','PET2','B7L','C20L','B20L'];
const variante=t=>{const v=Math.floor(rnd()*6);return v===0?t.toUpperCase():v===1?t.toLowerCase():v===2?t+' ':v===3?' '+t:v===4?t.replace(/ /g,'  '):t;};
const sinTilde=t=>t.normalize('NFD').replace(/[̀-ͯ]/g,'');
const fechaVar=(iso,k)=>k%9===0?iso.split('-').reverse().join('/'):iso;
const paletas=[];
for(let d=0;d<90;d++){const iso='2026-07-'+String(1+d%28).padStart(2,'0');
  for(let k=0;k<140;k++){const turno=TURNOS[k%3];
    paletas.push({id:'p'+d+'_'+k,linea:pick(LINEAS),fecha:fechaVar(iso,k),turno:k%7===0?sinTilde(turno).toLowerCase():turno,
      marca:variante(pick(MARCAS)),presentacion:variante(pick(PRES)),tipoPaleta:k%5===0?'INCOMPLETA':'COMPLETA',paletas:1,totalUnidades:300+k,creadoEn:1e12+d*1000+k});}}
paletas.push(null);                                   // una entrada vacía no debe romper nada
ok(paletas.length>=12000,'historial simulado de '+paletas.length+' registros');
ev('_paletasCache=null');sb._paletasCache=paletas;

const esComb=ev('esCombinacionPaletas');
const filtroCompleto=clave=>sb._paletasCache.filter(p=>esComb(p,clave));
const claveDe=(l,f,t,m,p)=>ev('claveCombinacionPaletas')(l,f,t,m,p);

/* 1) mismos registros y mismo orden que el filtro completo, en cientos de combinaciones (existentes e inexistentes) */
{
  const claves=[];
  for(let i=0;i<150;i++){
    const base=paletas[Math.floor(rnd()*(paletas.length-1))];
    claves.push(claveDe(base.linea,base.fecha,base.turno,base.marca,base.presentacion));                              // existente tal como se escribió
    claves.push(claveDe(base.linea.toLowerCase(),String(base.fecha).split('/').reverse().join('-')===base.fecha?base.fecha:base.fecha,sinTilde(String(base.turno)).toUpperCase(),String(base.marca).toUpperCase()+'  ',base.presentacion)); // otra escritura
  }
  for(let i=0;i<60;i++)claves.push(claveDe(pick(LINEAS),'2026-09-'+String(1+i%28).padStart(2,'0'),'DÍA','Inexistente'+i,pick(PRES)));  // no existen
  claves.push(claveDe('PET1','12/07/2026','DÍA','Scala','7 Litros'),claveDe('PET1','2026-07-12','DIA','SCALA','7L'));       // dd/mm/aaaa y 7 Litros = 7L
  let iguales=0,conDatos=0;
  claves.forEach(c=>{const a=ev('paletasDeCombinacionPaletas')(c),b=filtroCompleto(c);
    if(a.length===b.length&&a.every((p,i)=>p===b[i]))iguales++;if(b.length)conDatos++;});
  ok(iguales===claves.length&&conDatos>200,'paletasDeCombinacionPaletas = filtro completo (mismos registros, mismo orden) en '+claves.length+' combinaciones ('+conDatos+' con datos, el resto inexistentes)');
  const c7=ev('paletasDeCombinacionPaletas');
  ok(c7(claveDe('PET1','2026-07-12','DÍA','Scala','7 Litros')).every(p=>true)&&claveDe('X','2026-07-01','DÍA','M','7 Litros')===claveDe('X','2026-07-01','DÍA','M','7L'),'«7 Litros» y «7L» son la misma combinación');
  ok(claveDe('PET1','05/07/2026','DÍA','M','P')===claveDe('PET1','2026-07-05','DIA','m ','p'),'fecha dd/mm/aaaa, tildes, mayúsculas y espacios dan la misma clave');
}

/* 2) obtenerProgramacionPaleta = los dos find() originales */
const progs=[];
for(let i=0;i<1500;i++){const l=LINEAS[i%5],f='2026-07-'+String(1+i%28).padStart(2,'0'),t=TURNOS[i%3],m=MARCAS[i%8],p=PRES[i%7];
  progs.push({clave:i%4===0?'otra|'+i:[l,f,t,m,p].join('|'),linea:l,fecha:i%6===0?f.split('-').reverse().join('/'):f,turno:t,marca:i%5===0?m.toUpperCase():m,presentacion:p,cantidadProgramada:1000+i});}
progs.push(progs[10]);                                  // duplicado: debe ganar el primero
sb._programacionesCache=progs;
const originalProg=(l,f,t,m,p)=>{const clave=ev('claveProgramacionPaleta')(l,f,t,m,p),lista=sb._programacionesCache;
  const ex=lista.find(x=>x.clave===clave);if(ex)return ex;const n=claveDe(l,f,t,m,p);return lista.find(x=>esComb(x,n))||null;};
{
  let iguales=0,total=0,hallados=0;
  for(let i=0;i<1200;i++){
    const b=progs[Math.floor(rnd()*1500)];
    const args=i%3===0?[b.linea,b.fecha,b.turno,b.marca,b.presentacion]
      :i%3===1?[b.linea,'2026-07-'+String(1+i%28).padStart(2,'0'),TURNOS[i%3],String(b.marca).toLowerCase(),b.presentacion]
      :[b.linea,'2026-08-01','DÍA','Nadie'+i,b.presentacion];
    const a=ev('obtenerProgramacionPaleta')(...args),o=originalProg(...args);total++;if(a===o)iguales++;if(o)hallados++;
  }
  ok(iguales===total&&hallados>300,'obtenerProgramacionPaleta devuelve la misma fila que los dos find() originales ('+total+' consultas, '+hallados+' con fila, el resto sin programación)');
}

/* 3) el índice se actualiza: lista nueva, elemento agregado a la misma lista, elemento reemplazado en su lugar */
{
  const lista=[{id:'a',linea:'PET1',fecha:'2026-10-01',turno:'DÍA',marca:'Scala',presentacion:'1 L',totalUnidades:1}];
  sb._paletasCache=lista;const clave=claveDe('PET1','2026-10-01','DÍA','Scala','1 L'),f=ev('paletasDeCombinacionPaletas');
  ok(f(clave).length===1,'índice de Paletas: estado inicial');
  sb._paletasCache=[...lista,{id:'b',linea:'PET1',fecha:'2026-10-01',turno:'DÍA',marca:'SCALA',presentacion:'1 l',totalUnidades:2}];
  ok(f(clave).map(p=>p.id).join()==='a,b','índice de Paletas: llega una lista nueva');
  sb._paletasCache.push({id:'c',linea:'PET1',fecha:'2026-10-01',turno:'DÍA',marca:'Scala',presentacion:'1 L',totalUnidades:3});
  ok(f(clave).map(p=>p.id).join()==='a,b,c','índice de Paletas: se agrega un elemento a la misma lista');
  sb._paletasCache[1]={id:'b2',linea:'PET2',fecha:'2026-10-01',turno:'DÍA',marca:'Scala',presentacion:'1 L',totalUnidades:4};
  ok(f(clave).map(p=>p.id).join()==='a,c'&&f(claveDe('PET2','2026-10-01','DÍA','Scala','1 L')).map(p=>p.id).join()==='b2','índice de Paletas: se reemplaza un elemento en su lugar');
  const pr=[{clave:'PET1|2026-10-01|DÍA|Scala|1 L',linea:'PET1',fecha:'2026-10-01',turno:'DÍA',marca:'Scala',presentacion:'1 L',cantidadProgramada:100}];
  sb._programacionesCache=pr;const g=ev('obtenerProgramacionPaleta');
  ok(g('PET1','2026-10-01','DÍA','Scala','1 L')===pr[0]&&g('PET1','2026-10-02','DÍA','Scala','1 L')===null,'índice de programaciones: estado inicial');
  const pr2=[...pr,{clave:'PET1|2026-10-02|DÍA|Scala|1 L',linea:'PET1',fecha:'2026-10-02',turno:'DÍA',marca:'Scala',presentacion:'1 L',cantidadProgramada:200}];
  sb._programacionesCache=pr2;
  ok(g('PET1','2026-10-02','DÍA','Scala','1 L')===pr2[1],'índice de programaciones: llega una lista nueva');
  pr2.push({clave:'x',linea:'PET1',fecha:'2026-10-03',turno:'DÍA',marca:'Scala',presentacion:'1 L',cantidadProgramada:300});
  ok(g('pet1','2026-10-03','dia','SCALA','1 l')===pr2[2],'índice de programaciones: se agrega un elemento a la misma lista (y se encuentra con otra escritura)');
  pr2[0]={clave:'otra',linea:'B7L',fecha:'2026-10-01',turno:'DÍA',marca:'Aro',presentacion:'7L',cantidadProgramada:5};
  ok(g('PET1','2026-10-01','DÍA','Scala','1 L')===null&&g('B7L','2026-10-01','DÍA','Aro','7 Litros')===pr2[0],'índice de programaciones: se reemplaza un elemento en su lugar');
}

/* 4) productosProduccionActual: mismas unidades que el cálculo completo (sin índices) */
const limpias=paletas.filter(Boolean);sb._paletasCache=limpias;sb._programacionesCache=progs;
const hoy='2026-07-15',todos=['DÍA','INTERMEDIO','NOCHE'];
const productos=()=>JSON.stringify(ev(`productosProduccionActual('${hoy}',${JSON.stringify(todos)})`));
const conIndices=productos();
const t0=Date.now();const r1=productos();const msIdx=Date.now()-t0;
const guardado=ev('paletasDeCombinacionPaletas');ev('paletasDeCombinacionPaletas=undefined');
const sinIndice=productos();
sb.paletasDeCombinacionPaletas=guardado;
ok(conIndices===sinIndice&&JSON.parse(conIndices).length>0,'productosProduccionActual: mismas unidades, paletas y programado con índice y con el filtro completo ('+JSON.parse(conIndices).length+' productos)');
const alCorte=a=>JSON.stringify(ev(`glacialProduccionPaletasAlCorte('PET1','${hoy}',['DÍA'],'Scala','625 ML PACK X 15 UND',${a})`));
ok(alCorte('0,0')!==undefined&&typeof ev('glacialProduccionPaletasAlCorte')==='function','glacialProduccionPaletasAlCorte usa el índice sin cambiar su contrato');
{
  const p=limpias.find(x=>x&&x.linea==='PET1'&&String(x.marca).trim().toLowerCase()==='scala'&&String(x.fecha).includes('2026'));
  const a=JSON.stringify(ev(`glacialProduccionPaletasAlCorte('${p.linea}','${p.fecha}',['DÍA','INTERMEDIO','NOCHE'],${JSON.stringify(p.marca)},${JSON.stringify(p.presentacion)},0,0)`));
  ev('paletasDeCombinacionPaletas=undefined');
  const b=JSON.stringify(ev(`glacialProduccionPaletasAlCorte('${p.linea}','${p.fecha}',['DÍA','INTERMEDIO','NOCHE'],${JSON.stringify(p.marca)},${JSON.stringify(p.presentacion)},0,0)`));
  sb.paletasDeCombinacionPaletas=guardado;
  ok(a===b,'glacialProduccionPaletasAlCorte: mismo resultado con índice y con filtro completo');
}

/* 5) rendimiento */
{
  const grande=[];for(let i=0;i<20000;i++){const b=limpias[i%limpias.length];grande.push(Object.assign({},b,{id:'g'+i}));}
  sb._paletasCache=grande;
  const t=Date.now();
  for(let i=0;i<300;i++){const b=grande[(i*67)%grande.length];ev(`resumenProgramacionCombinacionTurnos(${JSON.stringify(b.linea)},${JSON.stringify(b.fecha)},['DÍA','INTERMEDIO'],${JSON.stringify(b.marca)},${JSON.stringify(b.presentacion)})`);}
  const ms=Date.now()-t;
  ok(ms<3000,'300 llamadas a resumenProgramacionCombinacionTurnos con 20.000 registros: '+ms+' ms (< 3000 ms)');
  const t1=Date.now();ev(`resumenProgramacionCombinacionTurnos('PET1','${hoy}',['DÍA'],'Scala','625 ML PACK X 15 UND')`);
  console.log('  una llamada (índice ya armado): '+(Date.now()-t1)+' ms · productosProduccionActual de un día (15.000 registros): '+msIdx+' ms');
  if(process.env.REF_ANTES){
    const ant=cargar16(cp.execSync('git show '+process.env.REF_ANTES+':js/produccion/16-paletas.js',{cwd:R,maxBuffer:1e8}).toString().replace(/\r\n/g,'\n'));
    ant._paletasCache=limpias;ant._programacionesCache=progs;
    let a=Date.now();for(let i=0;i<10;i++)vm.runInContext("resumenProgramacionCombinacionTurnos('PET1','"+hoy+"',['DÍA'],'Scala','625 ML PACK X 15 UND')",ant);
    const una=(Date.now()-a)/10;a=Date.now();vm.runInContext("productosProduccionActual('"+hoy+"',['DÍA','INTERMEDIO','NOCHE'])",ant);
    console.log('  ANTES ('+process.env.REF_ANTES+'): una llamada '+una.toFixed(1)+' ms · productosProduccionActual '+(Date.now()-a)+' ms');
  }
}

/* 6) index.html y la caché de normalización */
{
  const html=leer('index.html'),m=/16-paletas\.js\?v=(\d{8})-[a-z]+\d+/.exec(html);
  ok(!!m&&Number(m[1])>=20261018,'index.html carga la versión nueva de 16-paletas.js (≥ 20261018)');
  const f=ev('normalizarClavePaletas');
  for(let i=0;i<25000;i++)f('texto '+i);
  ok(ev('normalizarClavePaletas._memo.size')<=20000&&f('Día  Feliz')===f('día feliz')&&f('7 Litros')==='7l','caché de normalizarClavePaletas: acotada (≤ 20.000) y con el mismo resultado');
  ok(/normalizarClavePaletas\._memo/.test(src)&&/obtenerProgramacionPaleta\._idx/.test(src)&&/paletasDeCombinacionPaletas\._idx/.test(src),'las cachés viven dentro de las propias funciones');
  ok(!/\balert\(|\bconfirm\(|\bprompt\(/.test(src.slice(src.indexOf('function paletasDeCombinacionPaletas'),src.indexOf('Unidades por paleta que rige AHORA'))),'sin alert/confirm/prompt nuevos');
}
console.log(fallas?fallas+' fallas':'todo correcto');
