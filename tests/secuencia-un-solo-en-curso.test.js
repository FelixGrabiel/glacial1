/* Secuencia del turno: un solo producto EN CURSO por línea. Caso real: B7L, BELLS (2 520) → SCALA «hasta las 03:00» (≈ 2 625) → ARO (4 000).
   Al registrar paletas de ARO, 16-paletas.js deja a SCALA con estado guardado «PENDIENTE» (y su hora de inicio) y la pantalla la mostraba EN CURSO
   junto con ARO. Se ejecuta el resolver real (aplicarEstadoVisualSecuencia + estadoOrdenItem). */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('(?:async[ ]+)?function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error('no se encontró '+n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}return src.slice(m.index,j+1)+'\n';}
const s24=leer('js/produccion/24-semaforo-produccion-actual.js'),s16=leer('js/produccion/16-paletas.js'),sEV=leer('js/produccion/24a-estados-visuales.js');

/* ---------- entorno del resolver ---------- */
function entorno(prog,producidos,ahora){
  const sb={Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Error,console};
  vm.createContext(sb);sb.window=sb;
  sb.num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  sb.llave=(l,f,t,m,p)=>[l,f,t,m,p].join('|');
  sb.loadProgramaciones=()=>prog;
  sb.resumenProgramacionCombinacionTurnos=(l,f,t,m)=>({unidadesProducidas:producidos[m]||0});
  sb.horario=()=>({inicio:0,fin:ahora+3600000});
  sb.producidoDe=x=>producidos[x.marca]||0;
  sb.progDe=x=>sb.num(x.prog&&x.prog.cantidadProgramada);
  ['marcaTiempoCorte','producidoTramoSecuencia','secuenciaPlanificada','estadoSecuenciaLinea','aplicarEstadoVisualSecuencia','estadoOrdenItem'].forEach(n=>vm.runInContext(extraer(s24,n),sb));
  vm.runInContext(sEV,sb);
  sb.instanteDeTurno=(f,h)=>new Date(f+'T'+h+':00').getTime();      // turno DÍA: la hora es del mismo día
  return sb;
}
const F='2026-10-13',L='B7L';
/* una programación por marca, con sus tramos de secuencia */
const progDe=(marca,orden,tipo,extra,op)=>Object.assign({linea:L,fecha:F,turno:'DÍA',marca,presentacion:'1 L',clave:L+'|'+marca,cantidadProgramada:1000,estadoOperacion:op,
  tramosSecuencia:[Object.assign({id:'t_'+marca+'_'+orden,orden,tipoFin:tipo||'CANTIDAD',cantidadObjetivo:1000},extra||{})]},{});
const item=(p)=>({linea:p.linea,fecha:p.fecha,turno:'DÍA',turnoPlan:'DÍA',marca:p.marca,presentacion:p.presentacion,prog:p,op:p.estadoOperacion});
function resolver(sb,progs,ahora){
  const items=progs.map(item);
  sb.aplicarEstadoVisualSecuencia(items,L,F,'DÍA','DÍA',ahora);
  return {items,est:items.map(x=>({marca:x.marca,e:sb.estadoOrdenItem(x),visual:x.estadoVisual}))};
}
const por=(r,m)=>r.est.find(x=>x.marca===m).e;
const AHORA=new Date(F+'T10:00:00').getTime();
const enCurso={estado:'EN_PRODUCCION',inicio:AHORA-3600000};


const prog=(marca,orden,tipo,extra,op,cant)=>Object.assign(progDe(marca,orden,tipo,extra,op),{cantidadProgramada:cant});
const caso=(opScala,opAro,ahora)=>{
  const ps=[prog('BELLS',1,'CANTIDAD',{cantidadObjetivo:2520},{estado:'FINALIZADA',inicio:ahora-9e6,finalizadaEn:ahora-5e6},2520),
            prog('SCALA',2,'HORA',{horaFin:'14:00'},opScala,2625),
            prog('ARO',3,'CANTIDAD',{cantidadObjetivo:4000},opAro,4000)];
  return resolver(entorno(ps,{BELLS:2520,SCALA:1386,ARO:500},ahora),ps,ahora);
};
(async()=>{
  const dejadoPorPaletas={estado:'PENDIENTE',inicio:AHORA-5*3600000};
  // 10:00, antes del «hasta las 14:00» de SCALA: la línea ya pasó a ARO (paletas de ARO registradas).
  let r=caso(dejadoPorPaletas,{estado:'EN_PRODUCCION',inicio:AHORA-1800000},AHORA);
  ok(por(r,'ARO').key==='EN_CURSO'&&por(r,'SCALA').key==='COMPLETADA'&&por(r,'BELLS').key==='COMPLETADA','la línea pasó a ARO antes de la hora de SCALA: ARO en curso y SCALA terminada (no dos EN CURSO)');
  ok(r.est.filter(x=>x.e.key==='EN_CURSO').length===1,'un solo producto EN CURSO en la línea');
  // 15:00, después de la hora de SCALA: con estado guardado «PENDIENTE» ya no vuelve a EN CURSO.
  const tarde=new Date(F+'T15:00:00').getTime();
  r=caso({estado:'PENDIENTE',inicio:tarde-8*3600000},{estado:'EN_PRODUCCION',inicio:tarde-3600000},tarde);
  ok(por(r,'SCALA').key==='COMPLETADA'&&por(r,'ARO').key==='EN_CURSO','pasada la hora de SCALA: terminada aunque su estado guardado diga «PENDIENTE»');
  // Iniciado con el botón: SCALA queda en pausa «cambio temporal» (comportamiento de siempre).
  r=caso({estado:'PAUSA',inicio:AHORA-5*3600000,pausaDesde:AHORA-1800000,motivoPausa:'Cambio temporal de producción'},{estado:'EN_PRODUCCION',inicio:AHORA-1800000},AHORA);
  ok(por(r,'ARO').key==='EN_CURSO'&&por(r,'SCALA').key!=='EN_CURSO','iniciado con el botón: SCALA no queda en curso');
  // Sin cambio de producto: SCALA sigue siendo la que corre.
  r=caso({estado:'EN_PRODUCCION',inicio:AHORA-5*3600000},undefined,AHORA);
  ok(por(r,'SCALA').key==='EN_CURSO'&&por(r,'ARO').key!=='EN_CURSO','sin cambio: SCALA en curso y ARO no');
  // Producto repetido más adelante (SCALA → ARO → SCALA): la SCALA anterior no se da por terminada, queda pendiente o próxima.
  const sc=prog('SCALA',2,'HORA',{horaFin:'14:00'},dejadoPorPaletas,2625);sc.tramosSecuencia.push({id:'t_SCALA_4',orden:4,tipoFin:'CANTIDAD',cantidadObjetivo:500});
  const ps=[prog('BELLS',1,'CANTIDAD',{cantidadObjetivo:2520},{estado:'FINALIZADA',inicio:1,finalizadaEn:2},2520),sc,prog('ARO',3,'CANTIDAD',{cantidadObjetivo:4000},{estado:'EN_PRODUCCION',inicio:AHORA-1800000},4000)];
  r=resolver(entorno(ps,{BELLS:2520,SCALA:1386,ARO:500},AHORA),ps,AHORA);
  ok(por(r,'ARO').key==='EN_CURSO'&&por(r,'SCALA').key!=='EN_CURSO'&&por(r,'SCALA').key!=='COMPLETADA','producto repetido más adelante: no queda en curso ni se da por terminado');
  // Línea sin secuencia planificada: otra marca con unidades y estado «PENDIENTE» no aparece EN CURSO si hay una EN PRODUCCIÓN.
  const sinSec=[Object.assign(prog('A',1,'CANTIDAD',null,{estado:'EN_PRODUCCION',inicio:AHORA-60000},1000),{tramosSecuencia:[]}),Object.assign(prog('B',2,'CANTIDAD',null,{estado:'PENDIENTE',inicio:AHORA-9e6},1000),{tramosSecuencia:[]})];
  r=resolver(entorno(sinSec,{A:100,B:300},AHORA),sinSec,AHORA);
  ok(por(r,'A').key==='EN_CURSO'&&por(r,'B').key==='PAUSA','sin secuencia: la que tiene unidades pero ya no corre queda en pausa, no en curso');
  // Sin ninguna en producción guardada, lo de siempre: unidades sin completar = en curso.
  const solo=[Object.assign(prog('A',1,'CANTIDAD',null,undefined,1000),{tramosSecuencia:[]})];
  r=resolver(entorno(solo,{A:100},AHORA),solo,AHORA);
  ok(por(r,'A').key==='EN_CURSO','sin estado guardado: con unidades y sin completar sigue EN CURSO (como antes)');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})();
