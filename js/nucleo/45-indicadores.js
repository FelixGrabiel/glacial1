/* =========================================================
   MÓDULO ÚNICO DE INDICADORES (funciones puras)

   Una sola fuente de cálculo para todo el sistema. Todas las funciones
   RECIBEN datos y DEVUELVEN el resultado: no leen Firestore, no leen la
   pantalla, no usan el reloj del equipo (la hora se recibe como argumento)
   y no modifican lo que reciben. Cuando un dato falta o el divisor es cero
   devuelven null (nunca 0 inventado).

   Unidades: tiempos en MINUTOS (salvo horasEfectivas, que devuelve HORAS),
   producción en UND, y los porcentajes como FRACCIÓN (0,893 = 89,3 %).

   DEFINICIONES OFICIALES
     Horas efectivas = (tiempo transcurrido − (paradas programadas + no programadas)) ÷ 60
     Ratio (UND/h)   = producción efectiva ÷ horas efectivas
     Tiempo planificado = duración de la programación − paradas programadas
     Disponibilidad  = (tiempo planificado − paradas no programadas) ÷ tiempo planificado
     Rendimiento     = ratio ÷ velocidad estándar (la de sync/configIndicadores)
     OEE             = disponibilidad × rendimiento   (solo con velocidad estándar;
                       «Calidad: no se mide»)
     Merma           = suma de mermas ÷ producción efectiva (con desglose por componente)
     Cumplimiento    = producido ÷ programado
        · Programado: la programación vigente, sin las canceladas.
        · Producido: turno en curso → lo registrado en Paletas;
                     turno cerrado → el registro del turno.
     Estado de línea = la lógica del semáforo (prioridad de estados de las programaciones)
     Día operativo y turno = una sola función, con la hora del servidor (turnoVigente)
     Metas y colores = una sola tabla (sync/configIndicadores); aquí solo se interpreta

   Este archivo no depende de ningún otro (se carga justo después de 01-config.js)
   y también se puede cargar desde Node para las pruebas (tests/indicadores.test.js).
   ========================================================= */
(function(raiz){
  'use strict';

  const esNum=v=>typeof v==='number'&&Number.isFinite(v);
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const norm=t=>String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[_\s]+/g,' ').trim();

  /* ---------------------------------------------------------
     TIEMPOS
     --------------------------------------------------------- */

  /* Horas efectivas = (transcurrido − (programadas + no programadas)) ÷ 60. Nunca negativas. */
  function horasEfectivas(t){
    const x=t||{};
    const minutos=num(x.transcurridoMin)-(num(x.paradasProgramadasMin)+num(x.paradasNoProgramadasMin));
    return Math.max(0,minutos)/60;
  }

  /* Tiempo planificado (min) = duración de la programación − paradas programadas. */
  function tiempoPlanificadoMin(duracionMin,paradasProgramadasMin){
    return Math.max(0,num(duracionMin)-num(paradasProgramadasMin));
  }

  /* Ratio (UND/h) = producción efectiva ÷ horas efectivas. */
  function ratio(produccionEfectiva,horasEf){
    return num(horasEf)>0?num(produccionEfectiva)/num(horasEf):null;
  }

  /* Disponibilidad = (planificado − no programadas) ÷ planificado (fracción). */
  function disponibilidad(planificadoMin,paradasNoProgramadasMin){
    const plan=num(planificadoMin);
    if(!(plan>0))return null;
    return Math.max(0,plan-num(paradasNoProgramadasMin))/plan;
  }

  /* Rendimiento = ratio ÷ velocidad estándar (fracción, SIN tope: si pasa de 1 hay que revisar la velocidad). */
  function rendimiento(ratioUndH,velocidadEstandar){
    if(!esNum(ratioUndH)||!(num(velocidadEstandar)>0))return null;
    return ratioUndH/num(velocidadEstandar);
  }
  const rendimientoARevisar=r=>esNum(r)&&r>1;

  /* OEE = disponibilidad × rendimiento. Sin alguno de los dos (sin velocidad estándar) no se calcula. */
  function oee(disp,rend){
    if(!esNum(disp)||!esNum(rend))return null;
    return disp*rend;
  }
  const NOTA_CALIDAD='Calidad: no se mide';

  /* ---------------------------------------------------------
     MERMA
     --------------------------------------------------------- */

  /* Merma = suma de mermas ÷ producción efectiva (fracción). */
  function merma(sumaMermas,produccionEfectiva){
    return num(produccionEfectiva)>0?num(sumaMermas)/num(produccionEfectiva):null;
  }

  /* Componente canónico de un ítem de merma (el mismo nombre en todas las líneas). */
  function componenteMerma(item){
    const t=norm(item);
    if(/botella|bidon/.test(t))return 'Botellas';
    if(/preforma/.test(t))return 'Preformas';
    if(/tapa/.test(t))return 'Tapas';
    if(/etiqueta/.test(t))return 'Etiquetas';
    if(/polietileno/.test(t))return 'Polietileno';
    const original=String(item==null?'':item).trim();
    return original||'Otros';
  }
  const ORDEN_COMPONENTES=['Botellas','Preformas','Tapas','Etiquetas','Polietileno'];

  /* items: [{item, unidades, peso}] → desglose por componente, cada uno en su unidad.
     Polietileno: cantidad en kg (y las unidades equivalentes en rollos); el resto en unidades. */
  function desgloseMerma(items){
    const m=new Map();
    (Array.isArray(items)?items:[]).forEach(x=>{
      if(!x)return;
      const nombre=String(x.item==null?'':x.item).trim();
      if(!nombre)return;
      const c=componenteMerma(nombre);
      const o=m.get(c)||{componente:c,unidades:0,peso:0};
      o.unidades+=num(x.unidades);o.peso+=num(x.peso);m.set(c,o);
    });
    return [...m.values()]
      .sort((a,b)=>{const ia=ORDEN_COMPONENTES.indexOf(a.componente),ib=ORDEN_COMPONENTES.indexOf(b.componente);
        return (ia<0?99:ia)-(ib<0?99:ib)||a.componente.localeCompare(b.componente,'es');})
      .map(o=>o.componente==='Polietileno'
        ?{componente:o.componente,cantidad:o.peso,unidad:'kg',unidades:o.unidades,textoUnidad:'kg ('+o.unidades.toFixed(2)+' rollos)'}
        :{componente:o.componente,cantidad:o.unidades,unidad:'unidades',unidades:o.unidades,textoUnidad:'unidades'});
  }

  /* ---------------------------------------------------------
     CUMPLIMIENTO, PROGRAMADO Y PRODUCIDO
     --------------------------------------------------------- */

  /* Cumplimiento = producido ÷ programado (fracción). */
  function cumplimiento(producido,programado){
    return num(programado)>0?num(producido)/num(programado):null;
  }

  /* Programado = la programación vigente, sin las canceladas (estadoOperacion.estado === 'CANCELADA'). */
  function programadoVigente(programaciones){
    return (Array.isArray(programaciones)?programaciones:[]).reduce((s,p)=>{
      if(!p)return s;
      if(p.estadoOperacion&&p.estadoOperacion.estado==='CANCELADA')return s;
      return s+Math.max(0,num(p.cantidadProgramada));
    },0);
  }

  /* Producido: turno en curso → Paletas; turno cerrado → registro del turno.
     Si falta la fuente que corresponde devuelve null (no se sustituye por la otra). */
  function produccionVigente(d){
    const x=d||{};
    const v=x.turnoEnCurso?x.paletas:x.registro;
    return esNum(v)&&v>=0?v:null;
  }

  /* ---------------------------------------------------------
     COLOR SEGÚN META (una sola tabla de metas)
     --------------------------------------------------------- */

  /* meta = {verde, ambar} en LA MISMA unidad que valor.
     sentido 'mayor' (por defecto): verde si valor ≥ verde, ámbar si valor ≥ ámbar, rojo si no.
     sentido 'menor' (merma): verde si valor ≤ verde, ámbar si valor ≤ ámbar, rojo si no.
     Sin valor o sin meta: 'gris'. */
  function colorSegunMeta(valor,meta,sentido){
    if(!esNum(valor)||!meta||!esNum(meta.verde)||!esNum(meta.ambar))return 'gris';
    if(sentido==='menor')return valor<=meta.verde?'verde':valor<=meta.ambar?'ambar':'roja';
    return valor>=meta.verde?'verde':valor>=meta.ambar?'ambar':'roja';
  }

  /* Valores iniciales de la tabla de metas (en %). Solo se usan mientras Firestore no tenga la tabla;
     la tabla oficial vive en sync/configIndicadores (metasReporte y metas). */
  const METAS_INICIALES=Object.freeze({
    cumplimiento:{verde:95,ambar:85},
    ratio:{verde:95,ambar:85},               // % de la velocidad estándar
    disponibilidad:{verde:90,ambar:80},
    merma:{verde:2,ambar:3},                 // máximo aceptable (%)
    oee:{verde:85,ambar:75}
  });
  const INDICADORES_MENOR=['merma'];

  /* Combina lo que llegó de Firestore (puede venir vacío o incompleto) con los valores iniciales. */
  function normalizarMetas(remota){
    const r=remota||{},sal={};
    Object.keys(METAS_INICIALES).forEach(k=>{
      const o=r[k]||{},ini=METAS_INICIALES[k];
      const v=num(o.verde)>0?num(o.verde):ini.verde;
      const a=num(o.ambar)>0?num(o.ambar):ini.ambar;
      sal[k]=INDICADORES_MENOR.includes(k)?{verde:v,ambar:Math.max(a,v)}:{verde:v,ambar:Math.min(a,v)};
    });
    return sal;
  }

  /* Color de un indicador (valor como FRACCIÓN) con la tabla de metas (en %). */
  function colorIndicador(nombre,valorFraccion,tablaMetas){
    if(!esNum(valorFraccion))return 'gris';
    const tabla=tablaMetas||METAS_INICIALES;
    return colorSegunMeta(valorFraccion*100,tabla[nombre],INDICADORES_MENOR.includes(nombre)?'menor':'mayor');
  }

  /* ---------------------------------------------------------
     DÍA OPERATIVO Y TURNO (hora del servidor recibida como argumento)
     Turnos de producción: DÍA 07:00–15:00, INTERMEDIO 15:00–22:00, NOCHE 22:00–07:00.
     El día operativo empieza a las 07:00: de 00:00 a 07:00 sigue siendo el día anterior
     (turno NOCHE). Es exactamente la regla que ya usa el semáforo.
     --------------------------------------------------------- */
  const HORARIOS_TURNO={'DÍA':[7,15],'INTERMEDIO':[15,22],'NOCHE':[22,7]};
  const fechaISO=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');

  /* Inicio y fin (ms) de un turno de una fecha ISO. compartida: DÍA e INTERMEDIO comparten reporte (07:00–22:00). */
  function horarioTurno(fecha,turno,compartida){
    const m=String(fecha||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return null;
    let h=HORARIOS_TURNO[turno];
    if(!h)return null;
    if(turno==='INTERMEDIO'&&compartida)h=[7,22];
    const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
    return {inicio:new Date(y,mo-1,d,h[0]).getTime(),fin:new Date(y,mo-1,d+(turno==='NOCHE'?1:0),h[1]).getTime()};
  }

  function turnoVigente(ahoraMs){
    const ahora=new Date(Number(ahoraMs));
    if(!Number.isFinite(ahora.getTime()))return null;
    const hora=ahora.getHours();
    let fechaBase=new Date(ahora.getFullYear(),ahora.getMonth(),ahora.getDate());
    let turno;
    if(hora<7){turno='NOCHE';fechaBase=new Date(ahora.getFullYear(),ahora.getMonth(),ahora.getDate()-1);}
    else if(hora<15)turno='DÍA';
    else if(hora<22)turno='INTERMEDIO';
    else turno='NOCHE';
    const fecha=fechaISO(fechaBase);
    const h=horarioTurno(fecha,turno,false);
    return {fecha,turno,inicio:h.inicio,fin:h.fin,activo:ahora.getTime()>=h.inicio&&ahora.getTime()<h.fin};
  }
  const diaOperativo=ahoraMs=>{const t=turnoVigente(ahoraMs);return t?t.fecha:null;};

  /* ---------------------------------------------------------
     ESTADO DE LÍNEA (la lógica del semáforo: 24-semaforo-produccion-actual.js)
     claves: estado final de cada programación de la línea en ese turno
     (EN_CURSO, DETENIDA, PAUSA, PENDIENTE, COMPLETADA, CANCELADA).
     --------------------------------------------------------- */
  const PRIORIDAD_ESTADO_LINEA=['DETENIDA','EN_CURSO','PAUSA','PENDIENTE','COMPLETADA','CANCELADA'];
  function estadoLineaDesdeItems(claves){
    const k=Array.isArray(claves)?claves.filter(Boolean):[];
    if(!k.length)return null;
    if(k.every(x=>x==='CANCELADA'))return 'CANCELADA';
    if(k.every(x=>x==='COMPLETADA'||x==='CANCELADA'))return 'COMPLETADA';
    return PRIORIDAD_ESTADO_LINEA.find(x=>k.includes(x))||null;
  }

  /* ---------------------------------------------------------
     RESUMEN DE UN CONJUNTO DE PARTES (turno · línea · producto)
     parte = { producido, programado, programacionVigente (bool: cuenta para el cumplimiento),
               transcurridoMin | durMin, paradasProgramadasMin | progMin, paradasNoProgramadasMin | npMin,
               mermaTotal, velocidad }
     Devuelve todos los indicadores de arriba para el conjunto, con las mismas definiciones.
     --------------------------------------------------------- */
  function resumenIndicadores(partes){
    let prod=0,progU=0,prodU=0,mermas=0,disponibleMin=0,planMin=0,prodConTiempo=0,npMin=0,progMin=0,durMin=0;
    let standar=0,dispV=0,planV=0,prodV=0,prodConT=0;
    const faltantes=[];
    (Array.isArray(partes)?partes:[]).forEach(p=>{
      if(!p)return;
      const dur=num(p.durMin!==undefined?p.durMin:p.transcurridoMin);
      const pr=num(p.progMin!==undefined?p.progMin:p.paradasProgramadasMin);
      const np=num(p.npMin!==undefined?p.npMin:p.paradasNoProgramadasMin);
      const plan=tiempoPlanificadoMin(dur,pr);
      const disp=Math.max(0,plan-np);                       // minutos en marcha
      const pd=num(p.producido);
      prod+=pd;mermas+=num(p.mermaTotal);
      if(p.programacionVigente){progU+=num(p.programado);prodU+=pd;}
      npMin+=np;progMin+=pr;durMin+=dur;
      if(plan>0)planMin+=plan;
      if(disp>0){
        disponibleMin+=disp;prodConTiempo+=pd;prodConT+=pd;
        const v=num(p.velocidad);
        if(v>0){standar+=disp/60*v;dispV+=disp;planV+=plan;prodV+=pd;}
        else if(pd>0)faltantes.push(p.etiqueta||'(sin nombre)');
      }
    });
    const horas=disponibleMin/60;
    const disp=planMin>0?disponibleMin/planMin:null;
    const rend=standar>0?prodV/standar:null;
    const dispConVel=planV>0?dispV/planV:null;
    return {
      produccion:prod,programado:progU,producidoConProgramacion:prodU,cumplimiento:cumplimiento(prodU,progU),
      horasEfectivas:horas,ratio:ratio(prodConTiempo,horas),disponibilidad:disp,
      merma:merma(mermas,prod),sumaMermas:mermas,
      rendimiento:rend,oee:oee(dispConVel,rend),calidad:NOTA_CALIDAD,
      coberturaVelocidad:prodConT>0?prodV/prodConT:null,faltantesVelocidad:[...new Set(faltantes)],
      paradasNoProgramadasMin:npMin,paradasProgramadasMin:progMin,planificadoMin:planMin,transcurridoMin:durMin
    };
  }

  /* ---------------------------------------------------------
     BLOQUES PRODUCTIVOS Y PAUSAS PREVISTAS (configuración: sync/configIndicadores → campo «bloques»)
     Los bloques definen SOLO el horario productivo (fin objetivo de la proyección); los turnos de tareo y asistencia
     (HORARIOS_TURNO) no cambian.
       diaInter : Día + Intermedio (una sola programación)      noche : Noche (su fecha es la del día en que empieza)
       Entre el fin de diaInter y el inicio de noche la planta está parada (no es bloque productivo).
       pausas   : pausas previstas del bloque {nombre, min}; la que ya figura como parada programada oficial no se vuelve a descontar.
     --------------------------------------------------------- */
    /* NOMBRES VISIBLES de los bloques de producción (solo presentación: no cambian claves, identificadores ni agrupación).
       reporte  → avances, cierres, imágenes, texto de WhatsApp, Excel y reportes históricos: DÍA / NOCHE.
       pantalla → pantallas del sistema: MAÑANA + INTERMEDIO / NOCHE.
     Los turnos individuales del personal (Tareo, Rotaciones) conservan sus nombres propios. Todas las pantallas y reportes
     llaman a nombreBloque(): un solo lugar para cambiar la nomenclatura. */
  const NOMBRES_TURNO=Object.freeze({
    reporte:Object.freeze({diurno:'DÍA',nocturno:'NOCHE'}),
    pantalla:Object.freeze({diurno:'MAÑANA + INTERMEDIO',nocturno:'NOCHE'})
  });
  /* entrada: turno o bloque ('DÍA', 'INTERMEDIO', 'NOCHE', 'diaInter', 'noche'…). contexto: 'reporte' | 'pantalla'. formato: 'titulo' → «Mañana + Intermedio». */
  function nombreBloque(entrada,contexto,formato){
    const noche=String(entrada||'').toUpperCase().includes('NOCHE');
    const set=NOMBRES_TURNO[contexto==='reporte'?'reporte':'pantalla'];
    const base=noche?set.nocturno:set.diurno;
    return formato==='titulo'?base.split(' ').map(p=>p.charAt(0)+p.slice(1).toLowerCase()).join(' '):base;
  }
  const BLOQUES_INICIALES=Object.freeze({
    diaInter:Object.freeze({etiqueta:'MAÑANA + INTERMEDIO',inicio:'07:00',fin:'19:00',pausas:Object.freeze([Object.freeze({nombre:'Refrigerio',min:60})])}),
    noche:Object.freeze({etiqueta:'NOCHE',inicio:'21:00',fin:'07:00',pausas:Object.freeze([Object.freeze({nombre:'Refrigerio',min:60})])})
  });
  const hhmmValida=t=>/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(t||'').trim());
  const aMin=t=>{const [h,m]=String(t).trim().split(':').map(Number);return h*60+m;};
  function normalizarBloques(cfg){
    const c=cfg&&typeof cfg==='object'?cfg:{};
    const una=(clave)=>{
      const base=BLOQUES_INICIALES[clave],x=c[clave]&&typeof c[clave]==='object'?c[clave]:{};
      const inicio=hhmmValida(x.inicio)?String(x.inicio).trim():base.inicio;
      const fin=hhmmValida(x.fin)?String(x.fin).trim():base.fin;
      let pausas=base.pausas.map(p=>({nombre:p.nombre,min:p.min}));
      if(Array.isArray(x.pausas)){
        pausas=x.pausas.filter(p=>p&&String(p.nombre||'').trim()&&num(p.min)>0).map(p=>({nombre:String(p.nombre).trim(),min:num(p.min)}));
      }
      return {etiqueta:base.etiqueta,inicio,fin,pausas};
    };
    return {diaInter:una('diaInter'),noche:una('noche')};
  }
  const claveBloque=turno=>String(turno||'').toUpperCase().includes('NOCHE')?'noche':'diaInter';
  /* Inicio y fin (ms) del BLOQUE productivo de una fecha ISO (la fecha es la del día en que empieza el bloque). */
  function horarioBloque(fecha,turno,cfg){
    const m=String(fecha||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return null;
    const b=normalizarBloques(cfg)[claveBloque(turno)];
    const y=Number(m[1]),mo=Number(m[2])-1,d=Number(m[3]);
    const ini=aMin(b.inicio),fin=aMin(b.fin);
    const ms=(dia,min)=>new Date(y,mo,dia,Math.floor(min/60),min%60).getTime();
    return {inicio:ms(d,ini),fin:ms(fin<=ini?d+1:d,fin),bloque:claveBloque(turno),etiqueta:b.etiqueta};
  }
  /* Bloque productivo vigente a una hora dada (puro). Devuelve:
       {fecha, bloque:'diaInter'|'noche'|null, activo, enFranja, inicio, fin, reanudaMs, etiqueta}
     - fecha = día operativo en que EMPIEZA el bloque (Noche después de medianoche pertenece al día anterior).
     - enFranja = planta sin producción (entre el fin de Día + Intermedio y el inicio de Noche): no hay bloque; reanudaMs = inicio de Noche.
     Es independiente de turnoVigente (tareo/asistencia): solo define los bloques productivos. */
  function bloqueVigente(ahoraMs,cfg){
    const t=Number(ahoraMs);
    if(!Number.isFinite(t))return null;
    const hoy=new Date(t);
    for(let k=-1;k<=0;k++){
      const d=new Date(hoy.getFullYear(),hoy.getMonth(),hoy.getDate()+k);
      const fecha=fechaISO(d);
      const di=horarioBloque(fecha,'DÍA',cfg),no=horarioBloque(fecha,'NOCHE',cfg);
      if(di&&t>=di.inicio&&t<di.fin)return {fecha,bloque:'diaInter',activo:true,enFranja:false,inicio:di.inicio,fin:di.fin,reanudaMs:null,etiqueta:di.etiqueta};
      if(no&&t>=no.inicio&&t<no.fin)return {fecha,bloque:'noche',activo:true,enFranja:false,inicio:no.inicio,fin:no.fin,reanudaMs:null,etiqueta:no.etiqueta};
      if(di&&no&&t>=di.fin&&t<no.inicio)return {fecha,bloque:null,activo:false,enFranja:true,inicio:di.fin,fin:no.inicio,reanudaMs:no.inicio,etiqueta:'Planta sin producción'};
    }
    // Antes del primer bloque del día (p. ej. la franja que cruza la medianoche en una configuración distinta): se toma el día natural.
    const fecha=fechaISO(hoy);
    const di=horarioBloque(fecha,'DÍA',cfg);
    return {fecha,bloque:null,activo:false,enFranja:true,inicio:t,fin:di?di.inicio:t,reanudaMs:di?di.inicio:null,etiqueta:'Planta sin producción'};
  }

  function pausasPrevistas(turno,cfg){return normalizarBloques(cfg)[claveBloque(turno)].pausas;}
  /* Minutos de pausas previstas que todavía NO figuran como parada programada oficial (se reconocen por el nombre del motivo). */
  function pausasPendientesMin(previstas,programadasOficiales){
    const reg=new Map();
    (Array.isArray(programadasOficiales)?programadasOficiales:[]).forEach(p=>{
      const k=norm(p&&p.motivo);if(!k)return;reg.set(k,(reg.get(k)||0)+Math.max(0,num(p.minutos)));
    });
    return (Array.isArray(previstas)?previstas:[]).reduce((s,p)=>s+Math.max(0,num(p&&p.min)-(reg.get(norm(p&&p.nombre))||0)),0);
  }

  /* ---------------------------------------------------------
     PROYECCIÓN DE CIERRE DEL BLOQUE (puro; la usan todas las pantallas)
     Definiciones: ver docs/PROYECCION-CIERRE.md
       Tiempo transcurrido = min(ahora, fin objetivo) − inicio real
       Tiempo efectivo     = transcurrido − paradas oficiales (programadas + no programadas)
       Ritmo real (ratio)  = producido ÷ tiempo efectivo
       Rendimiento bloque  = producido ÷ (transcurrido − paradas programadas ya ocurridas)
       Tiempo restante     = fin objetivo − ahora − pausas previstas aún no registradas
       Pendiente           = programado − producido (mín. 0)
       Tiempo nominal nec. = Σ pendiente de cada producto ÷ su velocidad estándar
       Requerimiento       = tiempo nominal necesario ÷ tiempo restante
       Si las paradas siguen igual = producido + rendimiento × restante      Sin nuevas paradas = producido + ritmo real × restante
       Final estimado      = ahora + pendiente ÷ rendimiento (+ pausas pendientes)
       CUMPLIBLE: «siguen igual» alcanza lo programado · EN RIESGO: no, pero el tiempo nominal cabe · NO ALCANZABLE: no cabe
     Nunca devuelve NaN ni Infinity ni negativos: lo que no se puede calcular es null.
     --------------------------------------------------------- */
  const PROY_MIN_EFECTIVO_MIN=30;
  const PROY_SIN_REGISTRO_MIN=60;
  const finito=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
  function proyeccionCierre(e){
    const x=e||{};
    const ahora=num(x.ahoraMs),ini=num(x.inicioMs),fin=num(x.finObjetivoMs);
    const prog=Math.max(0,num(x.programado)),prod=Math.max(0,num(x.producido));
    const pendiente=Math.max(0,prog-prod);
    const terminado=!!x.terminado||(fin>0&&ahora>=fin);
    const progMin=Math.max(0,num(x.progMin)),npMin=Math.max(0,num(x.npMin));
    const transcurridoMin=ini>0&&ahora>ini?Math.max(0,(Math.min(ahora,fin>0?fin:ahora)-ini)/60000):0;
    const efectivoMin=Math.max(0,transcurridoMin-progMin-npMin);
    const baseRendMin=transcurridoMin-progMin;
    const ritmoReal=efectivoMin>0&&prod>0?prod/(efectivoMin/60):null;
    const rendimiento=baseRendMin>0&&prod>0?prod/(baseRendMin/60):null;
    const pausasPendMin=terminado?0:pausasPendientesMin(x.pausasPrevistas,x.programadasOficiales);
    const restanteBrutoMin=fin>0&&ahora>0?Math.max(0,(fin-ahora)/60000):0;
    const restanteMin=Math.max(0,restanteBrutoMin-pausasPendMin);
    const restanteH=restanteMin/60;

    // productos y capacidad nominal
    let productos=(Array.isArray(x.productos)?x.productos:[]).map(p=>({
      etiqueta:String(p&&p.etiqueta||''),estado:String(p&&p.estado||''),programado:Math.max(0,num(p&&p.programado)),
      producido:Math.max(0,num(p&&p.producido)),velocidad:num(p&&p.velocidad)}));
    if(!productos.length)productos=[{etiqueta:'',estado:'EN_CURSO',programado:prog,producido:prod,velocidad:num(x.velocidad)}];
    const vigentes=productos.filter(p=>p.estado!=='CANCELADO');
    const faltaVelocidad=vigentes.filter(p=>Math.max(0,p.programado-p.producido)>0&&!(p.velocidad>0)).map(p=>p.etiqueta||'Producto');
    const conVel=vigentes.filter(p=>p.velocidad>0&&p.programado>0);
    const tiempoProg=conVel.reduce((s,p)=>s+p.programado/p.velocidad,0);
    const capacidadNominal=tiempoProg>0?conVel.reduce((s,p)=>s+p.programado,0)/tiempoProg:null;
    const tiempoNominalMin=faltaVelocidad.length?null:vigentes.reduce((s,p)=>s+(p.velocidad>0?Math.max(0,p.programado-p.producido)/p.velocidad*60:0),0);
    const cabe=tiempoNominalMin==null?null:tiempoNominalMin<=restanteMin+1e-9;
    const requerimientoPct=tiempoNominalMin!=null&&restanteMin>0?tiempoNominalMin/restanteMin*100:null;
    const ritmoNecesario=!terminado&&pendiente>0&&restanteH>0?pendiente/restanteH:null;

    const siguenIgual=rendimiento!=null?prod+rendimiento*restanteH:null;
    const sinNuevas=ritmoReal!=null?prod+ritmoReal*restanteH:null;
    const pct=siguenIgual!=null&&prog>0?siguenIgual/prog*100:null;
    const finalEstimadoMs=!terminado&&pendiente>0&&rendimiento>0?Math.round((ahora+(pendiente/rendimiento)*3600000+pausasPendMin*60000)/60000)*60000:null;   // al minuto más cercano
    const retrasoMin=finalEstimadoMs!=null&&fin>0?Math.max(0,Math.round((finalEstimadoMs-fin)/60000)):0;

    // avisos informativos (no alteran ningún cálculo)
    const avisos=[];
    const sinReg=Math.round(num(x.detencionSinRegistrarMin));
    if(sinReg>=1)avisos.push({tipo:'detencion',texto:'Hay una detención de '+sinReg+' min sin registrar en Avance.'});
    const ult=num(x.ultimoRegistroMs);
    if(!terminado&&ult>0&&ahora-ult>PROY_SIN_REGISTRO_MIN*60000)avisos.push({tipo:'dato',texto:'Dato desactualizado desde las '+hhmmDe(ult)+'.'});

    const sal={
      estado:'SIN_PROYECCION',modo:'sin_programacion',veredicto:null,nivel:'gris',etiqueta:'',motivo:'',
      producido:prod,programado:prog,pendiente,avancePct:prog>0?prod/prog*100:null,
      transcurridoMin,efectivoMin,restanteMin,restanteBrutoMin,pausaPendienteMin:pausasPendMin,
      ritmoReal,ritmoActual:ritmoReal,rendimiento,ritmoNecesario,capacidadNominal,tiempoNominalMin,requerimientoPct,cabeNominal:cabe,
      siguenIgual,sinMasParadas:sinNuevas,sinNuevas,pct,pctSinNuevas:sinNuevas!=null&&prog>0?sinNuevas/prog*100:null,
      diferencia:siguenIgual!=null?siguenIgual-prog:null,diferenciaSinNuevas:sinNuevas!=null?sinNuevas-prog:null,
      horaEstimadaMs:finalEstimadoMs,finalEstimadoMs,minAdicionales:retrasoMin,retrasoMin,finObjetivoMs:fin,
      cumplido:false,horaCumplidaMs:null,faltaVelocidad,productos,avisos,detenida:!!x.detenida,
      segunRegistradoMs:ult,ahora,minDesdeInicio:ini>0?Math.max(0,(ahora-ini)/60000):0
    };
    if(prog<=0)return sal;
    sal.modo='normal';sal.estado='OK';

    if(terminado){
      sal.modo='terminado';sal.estado='TERMINADO';sal.cumplido=pendiente<=0;
      sal.veredicto=pendiente<=0?'CUMPLIDA':'NO_CUMPLIDA';sal.nivel=pendiente<=0?'verde':'roja';
      sal.etiqueta=pendiente<=0?'BLOQUE TERMINADO · META CUMPLIDA':'BLOQUE TERMINADO · META NO CUMPLIDA';
      sal.ritmoNecesario=null;sal.siguenIgual=null;sal.sinMasParadas=null;sal.sinNuevas=null;sal.pct=prog>0?prod/prog*100:null;
      sal.diferencia=prod-prog;sal.finalEstimadoMs=null;sal.horaEstimadaMs=null;sal.minAdicionales=0;sal.retrasoMin=0;sal.restanteMin=0;
      return sal;
    }
    if(pendiente<=0){
      sal.modo='cumplida';sal.estado='CUMPLIDA';sal.cumplido=true;sal.veredicto='CUMPLIDA';sal.nivel='verde';
      sal.horaCumplidaMs=ult>0?ult:null;sal.etiqueta='META CUMPLIDA';sal.ritmoNecesario=0;sal.siguenIgual=prod;sal.diferencia=prod-prog;
      sal.pct=prog>0?prod/prog*100:null;sal.horaEstimadaMs=null;sal.finalEstimadoMs=null;
      return sal;
    }
    if(faltaVelocidad.length){
      sal.modo='falta_velocidad';sal.estado='FALTA_VELOCIDAD';sal.etiqueta='FALTA VELOCIDAD ESTÁNDAR';
      sal.motivo='Falta velocidad estándar de: '+faltaVelocidad.join(', ')+'. No se puede calcular la capacidad nominal.';
      return sal;
    }
    // ¿se puede proyectar con lo registrado?
    let motivoNo='';
    if(!(ini>0))motivoNo='la programación todavía no tiene inicio real';
    else if(!(prod>0))motivoNo='todavía no hay producción registrada';
    else if(efectivoMin<PROY_MIN_EFECTIVO_MIN)motivoNo='hay menos de '+PROY_MIN_EFECTIVO_MIN+' minutos efectivos de producción';
    else if(rendimiento==null)motivoNo='no hay tiempo suficiente para estimar el ritmo';
    if(motivoNo){
      sal.modo='no_proyectable';sal.estado='NO_PROYECTABLE';sal.motivo=motivoNo.charAt(0).toUpperCase()+motivoNo.slice(1)+'.';
      sal.etiqueta='NO ES POSIBLE PROYECTAR TODAVÍA';
      sal.siguenIgual=null;sal.sinMasParadas=null;sal.sinNuevas=null;sal.pct=null;sal.diferencia=null;sal.finalEstimadoMs=null;sal.horaEstimadaMs=null;sal.minAdicionales=0;sal.retrasoMin=0;
      if(cabe===false){sal.veredicto='NO_ALCANZABLE';sal.nivel='roja';}
      return sal;
    }
    sal.veredicto=siguenIgual>=prog-1e-9?'CUMPLIBLE':(cabe?'EN_RIESGO':'NO_ALCANZABLE');
    sal.nivel=sal.veredicto==='CUMPLIBLE'?'verde':sal.veredicto==='EN_RIESGO'?'ambar':'roja';
    sal.etiqueta=sal.veredicto==='CUMPLIBLE'?'CUMPLIBLE':sal.veredicto==='EN_RIESGO'?'EN RIESGO':'NO ALCANZABLE';
    return sal;
  }
  function hhmmDe(ms){const d=new Date(ms);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
  const fmtN=v=>finito(v)==null?'—':Math.round(v).toLocaleString('es-PE');
  const fmtP=v=>finito(v)==null?'—':v.toLocaleString('es-PE',{minimumFractionDigits:1,maximumFractionDigits:1})+' %';
  const fmtDur=min=>{const m=Math.max(0,Math.round(num(min)));return m>=60?Math.floor(m/60)+' h '+String(m%60).padStart(2,'0')+' min':m+' min';};
  /* Texto del análisis automático, armado con los mismos números (sin mensajes fijos). */
  function analisisProyeccion(p){
    if(!p||p.modo==='sin_programacion')return '';
    const partes=[];
    if(p.modo==='falta_velocidad')return p.motivo;
    if(p.modo==='terminado'){
      partes.push('El bloque terminó con '+fmtN(p.producido)+' de '+fmtN(p.programado)+' UND ('+fmtP(p.pct)+').');
      partes.push(p.pendiente>0?'Faltaron '+fmtN(p.pendiente)+' UND.':'La meta se cumplió.');
      return partes.join(' ');
    }
    if(p.modo==='cumplida')return 'La meta de '+fmtN(p.programado)+' UND está cumplida'+(p.horaCumplidaMs?' (último registro a las '+hhmmDe(p.horaCumplidaMs)+')':'')+'.';
    if(p.modo==='no_proyectable'){
      partes.push('No es posible proyectar todavía: '+p.motivo.charAt(0).toLowerCase()+p.motivo.slice(1));
      if(p.tiempoNominalMin!=null)partes.push(p.cabeNominal
        ?'A capacidad nominal ('+fmtN(p.capacidadNominal)+' UND/h) la meta cabe en el tiempo restante ('+fmtDur(p.restanteMin)+'): harían falta '+fmtDur(p.tiempoNominalMin)+'.'
        :'META NO ALCANZABLE EN EL TIEMPO RESTANTE: a capacidad nominal ('+fmtN(p.capacidadNominal)+' UND/h) harían falta '+fmtDur(p.tiempoNominalMin)+' y quedan '+fmtDur(p.restanteMin)+'.');
      return partes.join(' ');
    }
    partes.push('Con el rendimiento del bloque ('+fmtN(p.rendimiento)+' UND/h) se llegaría a '+fmtN(p.siguenIgual)+' de '+fmtN(p.programado)+' UND ('+fmtP(p.pct)+'): '+(p.diferencia>=0?'sobrarían '+fmtN(p.diferencia):'faltarían '+fmtN(-p.diferencia))+'.');
    if(p.sinNuevas!=null)partes.push('Sin nuevas paradas, con el ritmo real ('+fmtN(p.ritmoReal)+' UND/h), llegaría a '+fmtN(p.sinNuevas)+' ('+fmtP(p.pctSinNuevas)+').');
    if(p.ritmoNecesario!=null)partes.push('Se necesitan '+fmtN(p.ritmoNecesario)+' UND/h en '+fmtDur(p.restanteMin)+(p.requerimientoPct!=null?'; a capacidad nominal ('+fmtN(p.capacidadNominal)+' UND/h) eso es el '+fmtP(p.requerimientoPct)+'.':'.'));
    if(p.veredicto==='EN_RIESGO')partes.push('Está EN RIESGO: no alcanza con el ritmo actual, pero la meta cabe a capacidad nominal.');
    else if(p.veredicto==='NO_ALCANZABLE')partes.push('META NO ALCANZABLE EN EL TIEMPO RESTANTE: aun a capacidad nominal harían falta '+fmtDur(p.tiempoNominalMin)+' y quedan '+fmtDur(p.restanteMin)+'.');
    else if(p.veredicto==='CUMPLIBLE')partes.push('Es CUMPLIBLE si se mantiene el ritmo.');
    if(p.finalEstimadoMs!=null)partes.push('Final estimado: '+hhmmDe(p.finalEstimadoMs)+(p.retrasoMin>0?' ('+p.retrasoMin+' min después del fin objetivo, '+hhmmDe(p.finObjetivoMs)+').':'.'));
    if(p.pausaPendienteMin>0)partes.push('Se descuentan '+Math.round(p.pausaPendienteMin)+' min de pausas previstas aún no registradas.');
    return partes.join(' ');
  }

  /* ---------------------------------------------------------
     DEFINICIONES PARA «¿CÓMO SE CALCULA?» (las mismas que este archivo)
     --------------------------------------------------------- */
  const DEFINICIONES=Object.freeze([
    ['Horas efectivas','Tiempo transcurrido − (paradas programadas + no programadas) ÷ 60.'],
    ['Ratio (UND/h)','Producción efectiva ÷ horas efectivas.'],
    ['Tiempo planificado','Duración de la programación − paradas programadas.'],
    ['Disponibilidad','(Tiempo planificado − paradas no programadas) ÷ tiempo planificado.'],
    ['Rendimiento','Ratio ÷ velocidad estándar (la de la tabla de velocidades). Si pasa de 100 %, se muestra «revisar velocidad estándar».'],
    ['OEE','Disponibilidad × rendimiento. Solo se calcula si el producto tiene velocidad estándar. Calidad: no se mide.'],
    ['Merma','Suma de mermas ÷ producción efectiva, con desglose por componente (cada uno en su unidad).'],
    ['Cumplimiento','Producido ÷ programado. Programado: la programación vigente, sin las canceladas. Producido: en el turno en curso, lo registrado en Paletas; en turnos cerrados, el registro del turno.'],
    ['Estado de línea','El del semáforo: detenida, en curso, pausa, pendiente, completada o cancelada, por prioridad.'],
    ['Día operativo y turno','Día operativo desde las 07:00. Turnos: Día 07:00–15:00, Intermedio 15:00–22:00, Noche 22:00–07:00. Hora del servidor.'],
    ['Metas y colores','Una sola tabla en Firestore (verde, ámbar y rojo según la meta de cada indicador; en la merma la meta es un máximo).']
  ]);

  const API=Object.freeze({
    horasEfectivas,tiempoPlanificadoMin,ratio,disponibilidad,rendimiento,rendimientoARevisar,oee,NOTA_CALIDAD,
    merma,componenteMerma,desgloseMerma,ORDEN_COMPONENTES,
    cumplimiento,programadoVigente,produccionVigente,
    colorSegunMeta,colorIndicador,normalizarMetas,METAS_INICIALES,
    turnoVigente,diaOperativo,horarioTurno,HORARIOS_TURNO,
    BLOQUES_INICIALES,NOMBRES_TURNO,nombreBloque,normalizarBloques,horarioBloque,bloqueVigente,claveBloque,pausasPrevistas,pausasPendientesMin,proyeccionCierre,analisisProyeccion,
    estadoLineaDesdeItems,PRIORIDAD_ESTADO_LINEA,
    resumenIndicadores,DEFINICIONES
  });

  raiz.GlacialIndicadores=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
