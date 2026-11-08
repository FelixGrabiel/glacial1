/* =====================================================================================================================
   MANTENIMIENTO · PLAN ANUAL · núcleo puro (sin pantalla ni base) · docs/mantenimiento/plan-y-registro.md
   Semanas ISO (la semana 45 de 2026 va del 02/11 al 08/11), lectura de las celdas de semana del Excel («1 - 52», «9», «1,3»),
   agrupación por bloque de frecuencia, estado de cada semana y tarjetas resumen. Pruebas: tests/mantenimiento-plan-anual.test.js
   ===================================================================================================================== */
(function(raiz){
  'use strict';
  const BLOQUES=['SEMANAL','QUINCENAL','MENSUAL','BIMESTRAL','TRIMESTRAL','SEMESTRAL','ANUAL','18 MESES','BIANUAL'];
  const MESES=['E','F','M','A','M','J','J','A','S','O','N','D'];
  const MESES_NOMBRE=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const dosD=n=>String(n).padStart(2,'0');
  const esFecha=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''));
  const aUtc=iso=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso||''));return m?Date.UTC(+m[1],+m[2]-1,+m[3]):NaN;};
  const aIso=ms=>{const d=new Date(ms);return d.getUTCFullYear()+'-'+dosD(d.getUTCMonth()+1)+'-'+dosD(d.getUTCDate());};
  const DIA=86400000;

  /** Semana ISO de una fecha «AAAA-MM-DD»: {anio, semana} (el año ISO puede diferir del año de la fecha a fin/inicio de año). */
  function semanaIso(fechaIso){
    const t=aUtc(fechaIso);if(!Number.isFinite(t))return null;
    const d=new Date(t),dia=(d.getUTCDay()+6)%7;                // lunes = 0
    const jueves=new Date(t+(3-dia)*DIA);                       // el jueves de esa semana decide el año ISO
    const anio=jueves.getUTCFullYear(),ene1=Date.UTC(anio,0,1);
    return {anio,semana:1+Math.floor((jueves.getTime()-ene1)/DIA/7)};
  }
  /** Lunes y domingo (AAAA-MM-DD) de la semana ISO. La semana 1 es la que contiene el 4 de enero. */
  function rangoSemana(anio,semana){
    const ene4=Date.UTC(anio,0,4),dia=(new Date(ene4).getUTCDay()+6)%7;
    const lunes=ene4-dia*DIA+(semana-1)*7*DIA;
    return {desde:aIso(lunes),hasta:aIso(lunes+6*DIA)};
  }
  /** 52 o 53: el año tiene 53 semanas ISO si el 28 de diciembre cae en la 53. */
  const semanasDelAnio=anio=>semanaIso(anio+'-12-28').semana;
  const ddmm=f=>{const m=/^\d{4}-(\d{2})-(\d{2})/.exec(f||'');return m?m[2]+'/'+m[1]:'';};
  const ddmmaaaa=f=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(f||'');return m?m[3]+'/'+m[2]+'/'+m[1]:'';};
  /** «SEM_45» */
  const etiquetaSemana=s=>'SEM_'+dosD(s);

  /** Texto de una celda de semana del Excel → {semanas:[…], todo:boolean, texto, error}. «1 - 52» y «1 -52» = todo el año; «9»; «1,3»; «17,19,21»; vacío = ninguna. */
  function leerSemanas(valor){
    const texto=String(valor===undefined||valor===null?'':valor).replace(/\s+/g,' ').trim();
    if(!texto)return {semanas:[],todo:false,texto:''};
    if(/^1\s*-\s*52$/.test(texto))return {semanas:Array.from({length:52},(_,i)=>i+1),todo:true,texto:'1 - 52'};
    if(!/^\d+(\s*,\s*\d+)*$/.test(texto))return {semanas:[],todo:false,texto,error:'Escribe números de semana separados por coma (por ejemplo 1,3) o «1 - 52».'};
    const semanas=[...new Set(texto.split(',').map(x=>+x.trim()))];
    if(semanas.some(n=>n<1||n>53))return {semanas:[],todo:false,texto,error:'Las semanas van de 1 a 53.'};
    return {semanas:semanas.sort((a,b)=>a-b),todo:false,texto:semanas.join(',')};
  }
  /** Las 12 celdas de mes → {semanasPorMes:[12 textos], semanas:[unión], todo, errores:[…]} (para guardar una actividad editada). */
  function armarSemanas(celdas,todoElAnio){
    if(todoElAnio){const l=leerSemanas('1 - 52');return {semanasPorMes:['1 - 52'].concat(Array(11).fill('')),semanas:l.semanas,todo:true,errores:[]};}
    const textos=[],set=new Set(),errores=[];
    for(let i=0;i<12;i++){
      const l=leerSemanas(celdas&&celdas[i]);
      if(l.error)errores.push(MESES_NOMBRE[i]+': '+l.error);
      textos.push(l.texto);l.semanas.forEach(s=>set.add(s));
    }
    return {semanasPorMes:textos,semanas:[...set].sort((a,b)=>a-b),todo:false,errores};
  }

  const bloqueOrden=f=>{const i=BLOQUES.indexOf(String(f||'').trim().toUpperCase());return i<0?BLOQUES.length+1:i+1;};
  /** Actividades de una máquina → bloques [{frecuencia, bloque_orden, items}]: por orden de frecuencia (semanal, mensual…) y dentro de cada una por «orden» (el del Excel). */
  function agruparPorBloque(acts){
    const lista=(acts||[]).slice().sort((a,b)=>(num(a.bloque_orden)||bloqueOrden(a.frecuencia))-(num(b.bloque_orden)||bloqueOrden(b.frecuencia))||num(a.orden)-num(b.orden));
    const out=[];
    lista.forEach(a=>{
      let b=out[out.length-1];
      if(!b||b.frecuencia!==a.frecuencia){b={frecuencia:a.frecuencia,bloque_orden:num(a.bloque_orden)||bloqueOrden(a.frecuencia),items:[]};out.push(b);}
      b.items.push(a);
    });
    return out;
  }
  /** «COMPONENTE / TAREA» → {equipo, tarea}: lo que va antes y después del primer « / ». Sin « / », todo es equipo. */
  function partirActividad(texto){
    const t=String(texto||'').replace(/\s+/g,' ').trim(),i=t.indexOf(' / ');
    return i<0?{equipo:t,tarea:''}:{equipo:t.slice(0,i).trim(),tarea:t.slice(i+3).trim()};
  }

  /** Semana «actual» a partir de hoy. */
  const semanaDeHoy=hoyIso=>semanaIso(hoyIso);
  /**
   * Estado de una semana programada: 'ejecutada' (hay registro cerrado o validado), 'actual', 'vencida' (ya pasó y no tiene registro) o 'programada'.
   * Mientras no exista el módulo de registros (conRegistros = false) no se puede afirmar que algo «venció»: las semanas pasadas quedan como 'programada'.
   */
  function estadoSemana(sem,actual,opc){
    const o=opc||{};
    if(o.ejecutadas&&o.ejecutadas.has&&o.ejecutadas.has(sem))return 'ejecutada';
    if(actual&&sem===actual.semana)return 'actual';
    if(actual&&sem<actual.semana&&o.conRegistros)return 'vencida';
    return 'programada';
  }
  /** Tarjetas resumen de la máquina: total, de esta semana, próxima semana con extras (no semanales) y vencidas. */
  function resumen(acts,actual,opc){
    const o=opc||{},lista=acts||[];
    const estaSemana=actual?lista.filter(a=>(a.semanas||[]).includes(actual.semana)):[];
    let proxima=null;
    if(actual){
      const extras=lista.filter(a=>!a.es_todo_el_anio);
      const futuras=[...new Set(extras.flatMap(a=>(a.semanas||[]).filter(s=>s>actual.semana)))].sort((a,b)=>a-b);
      if(futuras.length){const s=futuras[0];proxima={semana:s,extras:extras.filter(a=>(a.semanas||[]).includes(s)).length};}
    }
    let vencidas=null;
    if(o.conRegistros&&actual){
      vencidas=0;
      lista.forEach(a=>(a.semanas||[]).forEach(s=>{if(s<actual.semana&&!(o.ejecutadasDe&&o.ejecutadasDe(a,s)))vencidas++;}));
    }
    return {total:lista.length,estaSemana:estaSemana.length,proxima,vencidas};
  }
  /** Avance del año para la barra de una actividad semanal: semanas ya transcurridas (incluida la actual) sobre las del año. */
  function avanceAnio(actual,anio){
    if(!actual||actual.anio!==anio)return {transcurridas:0,total:semanasDelAnio(anio),pct:0};
    const total=semanasDelAnio(anio);
    return {transcurridas:actual.semana,total,pct:Math.min(100,Math.round(actual.semana/total*100))};
  }
  /** Texto de una actividad para el filtro de búsqueda. */
  const textoBusqueda=a=>[a.item,a.actividad,a.insumos,a.frecuencia].join(' ').toLowerCase();

  const API={BLOQUES,MESES,MESES_NOMBRE,semanaIso,rangoSemana,semanasDelAnio,ddmm,ddmmaaaa,etiquetaSemana,leerSemanas,armarSemanas,bloqueOrden,agruparPorBloque,partirActividad,
    semanaDeHoy,estadoSemana,resumen,avanceAnio,textoBusqueda};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  raiz.glacialMttoPlan=API;
})(typeof window!=='undefined'?window:globalThis);
