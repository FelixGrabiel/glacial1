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


  /* ---------- Programa semanal (lo que antes hacía el botón BUSCAR del Excel: la semana se arma sola desde el Plan anual) ---------- */
  const PLURAL={SEMANAL:['semanal','semanales'],QUINCENAL:['quincenal','quincenales'],MENSUAL:['mensual','mensuales'],BIMESTRAL:['bimestral','bimestrales'],TRIMESTRAL:['trimestral','trimestrales'],
    SEMESTRAL:['semestral','semestrales'],ANUAL:['anual','anuales'],'18 MESES':['de 18 meses','de 18 meses'],BIANUAL:['bianual','bianuales']};
  const DIAS=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const MESES_MIN=MESES_NOMBRE.map(m=>m.toLowerCase());
  /** «Lunes 2 al domingo 8 de noviembre de 2026» (o con los dos meses si la semana cruza de mes o de año). */
  function textoRango(anio,semana){
    const r=rangoSemana(anio,semana),a=new Date(aUtc(r.desde)),b=new Date(aUtc(r.hasta));
    const dia=(d)=>DIAS[d.getUTCDay()].replace(/^./,c=>c.toUpperCase());
    const mismoMes=a.getUTCMonth()===b.getUTCMonth()&&a.getUTCFullYear()===b.getUTCFullYear();
    const mes=d=>MESES_MIN[d.getUTCMonth()];
    return mismoMes?dia(a)+' '+a.getUTCDate()+' al '+DIAS[b.getUTCDay()]+' '+b.getUTCDate()+' de '+mes(b)+' de '+b.getUTCFullYear()
      :dia(a)+' '+a.getUTCDate()+' de '+mes(a)+(a.getUTCFullYear()!==b.getUTCFullYear()?' de '+a.getUTCFullYear():'')+' al '+DIAS[b.getUTCDay()]+' '+b.getUTCDate()+' de '+mes(b)+' de '+b.getUTCFullYear();
  }
  /** Semana anterior / siguiente (con cambio de año ISO). */
  function moverSemana(anio,semana,delta){
    const r=rangoSemana(anio,semana),t=aUtc(r.desde)+delta*7*DIA;
    return semanaIso(aIso(t));
  }
  const actividadesDeSemana=(acts,semana)=>(acts||[]).filter(a=>(a.semanas||[]).includes(semana));
  /** «10 semanales + 2 quincenales» (en el orden de las frecuencias). */
  function resumenFrecuencias(acts){
    const c=new Map();
    (acts||[]).slice().sort((a,b)=>bloqueOrden(a.frecuencia)-bloqueOrden(b.frecuencia)).forEach(a=>{const f=String(a.frecuencia||'').toUpperCase();c.set(f,(c.get(f)||0)+1);});
    return [...c].map(([f,n])=>{const p=PLURAL[f]||[f.toLowerCase(),f.toLowerCase()];return n+' '+(n===1?p[0]:p[1]);}).join(' + ');
  }
  const ESTADOS_REG={PENDIENTE:{txt:'PENDIENTE',cls:'pend'},EN_CURSO:{txt:'EN CURSO',cls:'curso'},CERRADO:{txt:'POR VALIDAR',cls:'validar'},VALIDADO:{txt:'VALIDADO',cls:'ok'}};
  /** «hace 4 min» */
  function haceTexto(desdeMs,ahoraMs){
    if(!(desdeMs>0))return '';
    const m=Math.max(0,Math.floor((ahoraMs-desdeMs)/60000));
    return m<1?'hace un momento':m<60?'hace '+m+' min':m<1440?'hace '+Math.floor(m/60)+' h':'hace '+Math.floor(m/1440)+' d';
  }
  /**
   * Una fila del Programa semanal por máquina. registro = fila de mtto_registros de esa máquina y semana (o null), regActs = sus actividades.
   * Con registro, el avance sale del registro (realizadas / actividades copiadas); sin registro, 0 de las que el plan manda esa semana.
   */
  function filaSemana(maquina,actsPlan,semana,registro,regActs,ahoraMs){
    const delPlan=actividadesDeSemana(actsPlan,semana);
    const ra=registro?(regActs||[]):[];
    const total=registro?ra.length:delPlan.length,hechas=ra.filter(a=>a.realizado).length;
    const marcas=ra.map(a=>Date.parse(a.marcado_en||'')||0).filter(x=>x>0),ult=Math.max(registro?Date.parse(registro.actualizado_en||'')||0:0,...marcas,0);
    const estado=registro&&ESTADOS_REG[registro.estado]?registro.estado:'PENDIENTE';
    return {maquina,total,hechas,pct:total?Math.round(hechas/total*100):0,frecuencias:resumenFrecuencias(delPlan),delPlan,registro:registro||null,estado,
      tecnico:registro?registro.tecnico_senior:'',maquinista:registro?registro.maquinista:'',hace:ult?haceTexto(ult,ahoraMs):''};
  }
  /** Tarjetas del Programa semanal. */
  function resumenSemana(filas){
    const t=filas.reduce((s,f)=>s+f.total,0),h=filas.reduce((s,f)=>s+f.hechas,0);
    return {actividades:t,maquinas:filas.length,realizadas:h,abiertos:filas.filter(f=>f.estado==='EN_CURSO').length,porValidar:filas.filter(f=>f.estado==='CERRADO').length};
  }
  /** Últimos eventos para el panel «En vivo»: marcas de actividades y registros cerrados / validados, más recientes primero. */
  function eventosEnVivo(registros,regActs,maquinas,limite){
    const maq=new Map((maquinas||[]).map(m=>[m.id,m])),reg=new Map((registros||[]).map(r=>[r.id,r])),ev=[];
    (regActs||[]).forEach(a=>{const r=reg.get(a.registro_id),t=Date.parse(a.marcado_en||'');if(!r||!t)return;
      ev.push({ms:t,quien:a.marcado_por||'—',texto:(a.realizado?'marcó':'desmarcó')+' «'+[a.equipo,a.actividad].filter(Boolean).join(' / ')+'» en '+((maq.get(r.maquina_id)||{}).nombre||'')});});
    (registros||[]).forEach(r=>{const n=(maq.get(r.maquina_id)||{}).nombre||'';
      const c=Date.parse(r.cerrado_en||''),v=Date.parse(r.validado_en||'');
      if(c)ev.push({ms:c,quien:r.tecnico_senior||'—',texto:'cerró el registro de '+n});
      if(v)ev.push({ms:v,quien:r.validado_por||'—',texto:'validó '+n});});
    return ev.sort((a,b)=>b.ms-a.ms).slice(0,limite||12);
  }

  /* ---------- Registro CFA-CA-F-023 ---------- */
  const INFORME_DEFECTO='Se han realizado las actividades mencionadas en la tabla superior cumpliendo con lo programado. Máquina en condiciones normales de operación.';
  const MAX_IMPRESO=22;
  const sumarDias=(iso,n)=>aIso(aUtc(iso)+n*DIA);
  /** Próxima revisión = fecha + 7 días. */
  const proximaRevision=fecha=>esFecha(fecha)?sumarDias(fecha,7):'';
  /** Actividades de un registro nuevo: las del plan que manda esa semana, por bloque de frecuencia y luego por orden; «equipo» = antes de « / », «actividad» = después. */
  function actividadesParaRegistro(actsPlan,semana){
    const lista=actividadesDeSemana(actsPlan,semana).slice().sort((a,b)=>(num(a.bloque_orden)||bloqueOrden(a.frecuencia))-(num(b.bloque_orden)||bloqueOrden(b.frecuencia))||num(a.orden)-num(b.orden));
    return lista.map((a,i)=>{const p=partirActividad(a.actividad);return {plan_actividad_id:a.id,item:i+1,equipo:p.equipo,actividad:p.tarea,frecuencia:a.frecuencia};});
  }
  /** Avance de un registro: {hechas, total, pct}. */
  function progresoRegistro(regActs){const t=(regActs||[]).length,h=(regActs||[]).filter(a=>a.realizado).length;return {hechas:h,total:t,pct:t?Math.round(h/t*100):0};}
  /** El formato impreso solo muestra las primeras 22 actividades. */
  const excedeImpreso=n=>n>MAX_IMPRESO;
  /** Horas entre dos horas «HH:MM» (si la segunda es menor, cruza la medianoche). */
  function horasEntre(ini,fin){
    const m=h=>{const x=/^(\d{2}):(\d{2})/.exec(h||'');return x?+x[1]*60+ +x[2]:null;};
    const a=m(ini),b=m(fin);if(a===null||b===null)return 0;
    return Math.round(((b>=a?b-a:b+1440-a)/60)*100)/100;
  }
  /** Qué puede hacer cada persona con un registro según su estado: editar (técnico), cerrar, validar, reabrir. sup = supervisor/jefe (marca supmtto). */
  function permisosRegistro(estado,sup,tecnico){
    const e=ESTADOS_REG[estado]?estado:'PENDIENTE';
    return {
      editar:(e==='PENDIENTE'||e==='EN_CURSO')&&(!!sup||!!tecnico),
      cerrar:(e==='PENDIENTE'||e==='EN_CURSO')&&(!!sup||!!tecnico),
      validar:e==='CERRADO'&&!!sup,
      reabrir:(e==='CERRADO'||e==='VALIDADO')&&!!sup,
      soloLectura:!(((e==='PENDIENTE'||e==='EN_CURSO')&&(!!sup||!!tecnico)))
    };
  }

  const API={BLOQUES,MESES,MESES_NOMBRE,semanaIso,rangoSemana,semanasDelAnio,ddmm,ddmmaaaa,etiquetaSemana,leerSemanas,armarSemanas,bloqueOrden,agruparPorBloque,partirActividad,
    semanaDeHoy,estadoSemana,resumen,avanceAnio,textoBusqueda,
    INFORME_DEFECTO,MAX_IMPRESO,proximaRevision,actividadesParaRegistro,progresoRegistro,excedeImpreso,horasEntre,permisosRegistro,sumarDias,textoRango,moverSemana,actividadesDeSemana,resumenFrecuencias,ESTADOS_REG,haceTexto,filaSemana,resumenSemana,eventosEnVivo};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  raiz.glacialMttoPlan=API;
})(typeof window!=='undefined'?window:globalThis);
