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
    estadoLineaDesdeItems,PRIORIDAD_ESTADO_LINEA,
    resumenIndicadores,DEFINICIONES
  });

  raiz.GlacialIndicadores=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
