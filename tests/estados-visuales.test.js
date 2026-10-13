/* Semáforo de Producción Actual: colores por ESTADO (no por rendimiento) y «PRÓXIMO A PRODUCIR».
   Se ejecuta el resolver real (aplicarEstadoVisualSecuencia + estadoOrdenItem) con una secuencia simulada, el mapa único de colores y el widget del semáforo. */
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

(async()=>{
  /* ---------- mapa único de colores ---------- */
  {
    const sb=entorno([],{},AHORA),EV=sb.glacialEstadosVisuales;
    const n=k=>EV.nivelDeEstadoLinea(k);
    ok(n('EN_CURSO')==='naranja'&&n('PROXIMO')==='amarilla'&&n('PAUSA')==='amarilla'&&n('DETENIDA')==='roja'&&n('COMPLETADA')==='verde'&&n('PENDIENTE')==='gris'&&n('X')==='gris','mapa: En curso naranja, Próximo y pausa amarillo, Detenida rojo, Completada verde, Pendiente gris');
    ok(EV.MAPA.CANCELADA.cls==='cancelada'&&EV.MAPA.CANCELADA.cls!==EV.MAPA.DETENIDA.cls,'Cancelada conserva su semántica propia (no se mezcla con Detenida)');
    ok(EV.MAPA.PROXIMO.etiqueta==='PRÓXIMO A PRODUCIR','etiqueta exacta «PRÓXIMO A PRODUCIR»');
    ok(!/db\.|runTransaction|\.set\(|\.update\(/.test(sEV),'el mapa de estados no escribe nada (no es un escritor de estados)');
  }

  /* ---------- causa del rojo: el encabezado ya no toma el color del desempeño ---------- */
  {
    ok(/const nivelFinal=nivelEstado;/.test(s24)&&!/desempeno\.nivel!=='gris' \? desempeno\.nivel : nivelEstado/.test(s24),'el encabezado usa el nivel del ESTADO, no el del desempeño');
    ok(/nivelDesempeno:desempeno\.nivel/.test(s24),'el desempeño se conserva aparte (nivelDesempeno) y no se elimina');
    ok(/const nivel=window\.glacialEstadosVisuales\.nivelDeEstadoLinea\(estadoLineaGrupo\)/.test(s24)&&!/EN_CURSO:'ambar'/.test(s24),'el nivel de la línea sale del mapa central (En curso ya no es ámbar)');
    ok(/nivel:g\.nivel,texto:g\.texto/.test(s24.slice(s24.indexOf('tablero.innerHTML='),s24.indexOf('cont.prepend(tablero)'))),'la luz y la etiqueta del encabezado usan el mismo nivel');
    ok(/htmlProyeccion\(g\.proyeccion,g\.porTurno\)/.test(s24)&&/class="pa-proy '\+\(p\.nivel/.test(s24),'la alerta de proyección sigue en su panel con su propio color');
    ok(!/\.proyeccion\.nivel|desempeno\.nivel/.test(s24.slice(s24.indexOf('const nivelFinal=nivelEstado'),s24.indexOf('const bFr=bloqueAhora()'))),'ni la proyección ni el desempeño se copian al color del encabezado');
  }

  /* ---------- marcas: En curso, Próximo, Pendiente ---------- */
  {
    // C: Bells en curso, Scala por iniciar, Cheve pendiente
    const progs=[progDe('BELLS',1,'CANTIDAD',null,enCurso),progDe('SCALA',2),progDe('CHEVE',3)];
    const sb=entorno(progs,{BELLS:100},AHORA),r=resolver(sb,progs,AHORA);
    ok(por(r,'BELLS').key==='EN_CURSO'&&por(r,'BELLS').cls==='curso'&&por(r,'BELLS').label==='EN CURSO','Bells iniciada → EN CURSO');
    const sc=por(r,'SCALA');
    ok(sc.label==='PRÓXIMO A PRODUCIR'&&sc.cls==='proximo'&&sc.proximo===true,'Scala siguiente y sin iniciar → PRÓXIMO A PRODUCIR (nunca «En pausa»)');
    ok(sc.key==='PENDIENTE','su clave interna sigue siendo PENDIENTE: no activa la línea ni cambia indicadores');
    ok(por(r,'CHEVE').label==='PENDIENTE'&&por(r,'CHEVE').cls==='pendiente','las marcas posteriores esperan como PENDIENTE');
    ok(r.est.filter(x=>x.e.cls==='proximo').length===1,'un solo próximo a producir');
    // B/A: producido 0 pero iniciada → sigue En curso
    const p2=[progDe('BELLS',1,'CANTIDAD',null,enCurso),progDe('SCALA',2)];
    const r2=resolver(entorno(p2,{},AHORA),p2,AHORA);
    ok(por(r2,'BELLS').key==='EN_CURSO','marca iniciada sin unidades registradas conserva EN CURSO (producido = 0 no decide)');
    // marca activa pero sin iniciar: es el próximo a producir, no «en pausa» ni «en curso»
    const p3=[progDe('BELLS',1),progDe('SCALA',2)];
    const r3=resolver(entorno(p3,{},AHORA),p3,AHORA);
    ok(por(r3,'BELLS').label==='PRÓXIMO A PRODUCIR'&&por(r3,'SCALA').label==='PENDIENTE','antes de pulsar Iniciar, la marca que corresponde es PRÓXIMO A PRODUCIR y la siguiente PENDIENTE');
    ok(por(r3,'BELLS').key!=='EN_CURSO','el horario o la cantidad estimada NO la inician sola');
  }

  /* ---------- pausa real ---------- */
  {
    const pausa={estado:'PAUSA',inicio:AHORA-7200000,pausaDesde:AHORA-600000,motivoPausa:'Pausa programada'};
    for(const prod of [0,500]){
      const progs=[progDe('BELLS',1,'CANTIDAD',null,pausa),progDe('SCALA',2)];
      const r=resolver(entorno(progs,{BELLS:prod},AHORA),progs,AHORA);
      ok(por(r,'BELLS').key==='PAUSA'&&por(r,'BELLS').label==='EN PAUSA'&&!por(r,'BELLS').requiereRevision,'pausa auténtica '+(prod?'con':'sin')+' unidades: conserva EN PAUSA');
    }
    const antigua=[progDe('BELLS',1,'CANTIDAD',null,{estado:'PAUSA'}),progDe('SCALA',2)];
    const ra=resolver(entorno(antigua,{},AHORA),antigua,AHORA);
    ok(por(ra,'BELLS').key==='PAUSA'&&por(ra,'BELLS').requiereRevision===true,'PAUSA sin inicio ni hora de pausa: dato antiguo ambiguo → se conserva y se señala «requiere revisión» (no se reescribe)');
    ok(!/PAUSA_SECUENCIA'/.test(extraer(s24,'aplicarEstadoVisualSecuencia')),'ya no se genera la pausa «por secuencia»');
  }

  /* ---------- producto repetido y finalizados ---------- */
  {
    // SCALA → BELLS (activo) → SCALA: el segundo tramo de Scala es el próximo, no una pausa
    const sc=progDe('SCALA',1,'CANTIDAD',null,null);
    sc.tramosSecuencia=[{id:'t_s1',orden:1,tipoFin:'CANTIDAD',cantidadObjetivo:500},{id:'t_s2',orden:3,tipoFin:'CANTIDAD',cantidadObjetivo:500}];
    const be=progDe('BELLS',2,'CANTIDAD',null,enCurso);
    const r=resolver(entorno([sc,be],{SCALA:500,BELLS:100},AHORA),[sc,be],AHORA);
    ok(por(r,'SCALA').label==='PRÓXIMO A PRODUCIR'&&por(r,'SCALA').key!=='PAUSA'&&por(r,'BELLS').key==='EN_CURSO','SCALA → BELLS → SCALA: Scala (tramo posterior) es PRÓXIMO y Bells sigue EN CURSO; no se llama «En pausa»');
    // A (en curso), B finalizada, C: el próximo salta lo finalizado
    const a=progDe('A',1,'CANTIDAD',null,enCurso),b=progDe('B',2,'CANTIDAD',null,{estado:'FINALIZADA',inicio:AHORA-9000000,finalizadaEn:AHORA-5000000}),c=progDe('C',3);
    const r2=resolver(entorno([a,b,c],{A:10},AHORA),[a,b,c],AHORA);
    ok(por(r2,'C').label==='PRÓXIMO A PRODUCIR'&&por(r2,'B').key==='COMPLETADA'&&por(r2,'B').cls==='completada','el próximo excluye finalizados: B finalizada (verde) y C próximo');
    // finalizar el tramo activo: el siguiente pasa a próximo
    const a2=progDe('A',1,'CANTIDAD',null,{estado:'FINALIZADA',inicio:AHORA-9000000,finalizadaEn:AHORA-100}),b2=progDe('B',2),c2=progDe('C',3);
    const r3=resolver(entorno([a2,b2,c2],{A:1000},AHORA),[a2,b2,c2],AHORA);
    ok(por(r3,'A').key==='COMPLETADA'&&por(r3,'B').label==='PRÓXIMO A PRODUCIR'&&por(r3,'C').label==='PENDIENTE','al finalizar un tramo: queda verde y el siguiente se presenta como próximo (sin estado activo por caché)');
    // todos finalizados
    const t=['A','B'].map((m,i)=>progDe(m,i+1,'CANTIDAD',null,{estado:'FINALIZADA',inicio:AHORA-9000000,finalizadaEn:AHORA-1000}));
    const r4=resolver(entorno(t,{A:1000,B:1000},AHORA),t,AHORA);
    ok(r4.est.every(x=>x.e.key==='COMPLETADA'),'todos finalizados: ninguno queda En curso ni Próximo');
  }

  /* ---------- detención, completada, línea con varias marcas, contaminación ---------- */
  {
    const det=progDe('BELLS',1,'CANTIDAD',null,{estado:'DETENIDA',inicio:AHORA-3600000,detenidaDesde:AHORA-60000});
    const sb=entorno([det],{BELLS:3},AHORA),r=resolver(sb,[det],AHORA);
    ok(por(r,'BELLS').label==='DETENIDA'&&por(r,'BELLS').cls==='detenida'&&sb.glacialEstadosVisuales.nivelDe('DETENIDA')==='roja','detención real → DETENIDA en rojo, sin depender del cumplimiento');
    const prog3=[progDe('A',1,'CANTIDAD',null,{estado:'FINALIZADA',inicio:AHORA-9000000,finalizadaEn:AHORA-5000000}),progDe('B',2,'CANTIDAD',null,enCurso),progDe('C',3)];
    const r3=resolver(entorno(prog3,{A:1000},AHORA),prog3,AHORA);
    const IND={};vm.runInContext(leer('js/nucleo/45-indicadores.js'),Object.assign(vm.createContext({Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Error,console,window:IND}),{}));
    const G=IND.GlacialIndicadores;
    const linea=G.estadoLineaDesdeItems(r3.est.map(x=>x.e.key));
    ok(linea==='EN_CURSO'&&entorno([],{},AHORA).glacialEstadosVisuales.nivelDeEstadoLinea(linea)==='naranja','varias marcas: con una realmente En curso la línea es EN CURSO y naranja (finalizada verde, próxima no la activa)');
    const sinCurso=[progDe('A',1),progDe('B',2)];
    const r4=resolver(entorno(sinCurso,{},AHORA),sinCurso,AHORA);
    ok(G.estadoLineaDesdeItems(r4.est.map(x=>x.e.key))!=='EN_CURSO','una marca próxima no activa la línea');
    // otra fecha / otra línea no contamina
    const otra=progDe('X',1,'CANTIDAD',null,enCurso);otra.fecha='2026-10-12';
    const sb5=entorno([progDe('A',1,'CANTIDAD',null,enCurso),otra],{A:5},AHORA);
    const itemOtra=item(otra);
    const sec=sb5.aplicarEstadoVisualSecuencia([itemOtra],L,F,'DÍA','DÍA',AHORA);
    ok(itemOtra.estadoVisual===undefined,'un item de otra fecha no recibe estado visual de esta secuencia');
    ok(sec===null||sec===undefined||!sec.tramos.some(t=>t.fecha==='2026-10-12'),'la secuencia de esta fecha no incluye tramos de otra fecha');
  }

  /* ---------- semáforo (DOM) y contadores ---------- */
  {
    const sb={};vm.createContext(sb);vm.runInContext(extraer(s16,'renderSemaforoWidget'),sb);
    const w=n=>sb.renderSemaforoWidget({nivel:n,texto:'T'});
    const nar=w('naranja'),ama=w('amarilla'),roj=w('roja');
    ok(/pl-semaforo-ambar encendida pl-luz-naranja/.test(nar.replace(/\s+/g,' '))&&/pl-semaforo-texto-naranja/.test(nar)&&!/pl-semaforo-roja encendida/.test(nar),'widget naranja: luz central naranja encendida, etiqueta naranja, roja apagada');
    ok(/pl-luz-amarilla/.test(ama)&&/pl-semaforo-texto-amarilla/.test(ama)&&/pl-semaforo-roja encendida/.test(roj.replace(/\s+/g,' ')),'widget amarillo y rojo');
    ok(/pl-semaforo-ambar encendida/.test(w('ambar').replace(/\s+/g,' '))&&!/pl-luz-/.test(w('ambar')),'el nivel ámbar de otros módulos no cambia');
    const tablero=s24.slice(s24.indexOf('tablero.innerHTML='),s24.indexOf('cont.prepend(tablero)'));
    ok(/Próximos a producir/.test(tablero)&&/counts\.proximo/.test(tablero)&&/counts\.pausa\} En pausa/.test(tablero),'contadores: «Próximos a producir» separado de «En pausa» (pausas reales)');
    ok(/pa-state-proximo\{background:var\(--est-pausa-bg\)/.test(s24)&&/pa-program-state-proximo/.test(s24),'estilos de la tarjeta y la etiqueta del próximo (amarillo)');
    ok(/data-pa-accion|acciones\(actual,idx\)/.test(tablero)&&/estadoOrdenItem\(x\)\.key==='PENDIENTE'/.test(tablero),'los controles (Iniciar para el próximo) siguen usando la misma clave; el próximo no se trata como pausado');
    const html=leer('index.html');
    ok(html.indexOf('16-paletas.js')<html.indexOf('24a-estados-visuales.js')&&html.indexOf('24a-estados-visuales.js')<html.indexOf('24-semaforo-produccion-actual.js'),'orden de carga: 16 → 24a → 24');
  }

  console.log(fallas?'\nFALLAS: '+fallas:'\nTodo en orden');
  process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
