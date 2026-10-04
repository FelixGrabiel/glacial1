/* =========================================================
   REPORTES · PARTE A · RESUMEN GENERAL (indicadores, metas, «Qué pasó», comparativos)

   Agrega, arriba del Resumen general que ya existía, una cabecera con producción, cumplimiento, ratio,
   disponibilidad, merma y OEE, cada uno con su variación frente al periodo anterior equivalente. No cambia
   el resto de la pantalla (solo unifica las fórmulas, ver «DEFINICIONES»).

   DEFINICIONES (únicas en toda la pantalla):
     Horas efectivas = transcurrido − (paradas programadas + no programadas) ÷ 60
     Ratio (UND/h)   = producción efectiva ÷ horas efectivas                (= ratios.ratioEfectivo del semáforo, 23b)
     Planificado     = duración − paradas programadas
     Disponibilidad  = (planificado − no programadas) ÷ planificado
     Merma           = suma de mermas ÷ producción efectiva                 (misma fórmula en toda la pantalla)
     Cumplimiento    = producido ÷ programado
     Rendimiento     = ratio ÷ velocidad estándar     ·     OEE = disponibilidad × rendimiento (Calidad: no se mide)

   DE DÓNDE SALE CADA DATO
     · Día operativo en curso: datos en vivo del semáforo (glacialResumenEjecutivoLineas + calcularTiemposLinea).
     · Turnos anteriores: el registro del turno (sync/records). Si difiere de Paletas o de la bitácora en más de 2 %
       (producción o minutos de parada) se avisa como «dato a revisar».
     · Programado: sync/programaciones, sin las canceladas (estadoOperacion.estado), en la MISMA ventana de fechas.
     · Velocidad estándar: sync/configIndicadores (línea y formato). Es la única tabla: si un formato no está ahí se
       usa el catálogo base de 01-config.js, y Planificación/registro leen esta misma función.
     · Metas: sync/configIndicadores.metasReporte (y metas = disponibilidad). Editables por Administrador y jefatura.
   No lee nada nuevo de Firestore: usa los documentos que la aplicación ya escucha en vivo (cero lecturas extra).
   Cargar después de 47-analisis-paradas.js.
   ========================================================= */
(function(){
  'use strict';

  const FECHA_CAMBIO='2026-10-04';
  const UMBRAL_DIF=0.02;                       // 2 % entre registro, Paletas y bitácora
  const DEF_METAS={
    cumplimiento:{verde:95,ambar:85},
    ratio:{verde:95,ambar:85},                 // % de la velocidad estándar
    disponibilidad:{verde:90,ambar:80},
    merma:{verde:2,ambar:3},                   // máximo aceptable (%)
    oee:{verde:85,ambar:75}
  };
  const NOMBRES={produccion:'Producción',cumplimiento:'Cumplimiento del plan',ratio:'Ratio (UND/h)',
    disponibilidad:'Disponibilidad',merma:'Merma',oee:'OEE'};

  /* ---------- utilidades ---------- */
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,
    c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtN=n=>Math.round(num(n)).toLocaleString('es-PE');
  const fmtD=(n,d)=>num(n).toLocaleString('es-PE',{minimumFractionDigits:d==null?1:d,maximumFractionDigits:d==null?1:d});
  const fmtP=v=>v==null?'—':fmtD(v,1)+' %';
  const fechaOk=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''));
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const parseISO=f=>{const [y,m,d]=f.split('-').map(Number);return new Date(y,m-1,d);};
  const addDias=(f,n)=>{const d=parseISO(f);d.setDate(d.getDate()+n);return iso(d);};
  const diasEntre=(a,b)=>Math.round((parseISO(b)-parseISO(a))/86400000)+1;
  const fmtFecha=f=>fechaOk(f)?f.slice(8,10)+'/'+f.slice(5,7)+'/'+f.slice(0,4):String(f||'');
  const ahoraMs=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const nombreLinea=k=>{try{const l=(typeof LINES!=='undefined'?LINES:[]).find(x=>x.key===k);return l?l.name:k;}catch(_){return k;}};
  const grupoDeTurno=t=>norm(t).includes('noche')?'NOCHE':'DIA';
  const etiquetaGrupo=g=>g==='NOCHE'?'Noche':'Día';
  function hoyOp(){
    try{if(typeof window.glacialTurnoVigente==='function'){const t=window.glacialTurnoVigente();if(t&&fechaOk(t.fecha))return t.fecha;}}catch(_){/* cálculo propio */}
    const d=new Date(ahoraMs());if(d.getHours()<7)d.setDate(d.getDate()-1);
    return iso(d);
  }

  /* =========================================================
     CONFIGURACIÓN: metas y velocidad estándar (sync/configIndicadores)
     ========================================================= */
  const cfg=()=>(typeof window.glacialConfigIndicadores==='function'?window.glacialConfigIndicadores():null)||{metas:{},velocidades:{},metasReporte:{}};
  function metasReporte(){
    const c=cfg(),r=c.metasReporte||{},m=c.metas||{};
    const out={};
    Object.keys(DEF_METAS).forEach(k=>{
      const o=r[k]||{};
      const v=num(o.verde)>0?num(o.verde):DEF_METAS[k].verde;
      const a=num(o.ambar)>0?num(o.ambar):DEF_METAS[k].ambar;
      out[k]=k==='merma'?{verde:v,ambar:Math.max(a,v)}:{verde:v,ambar:Math.min(a,v)};
    });
    // La disponibilidad comparte meta con Análisis de paradas (una sola fuente).
    if(num(m.verdePct)>0){out.disponibilidad={verde:num(m.verdePct),ambar:Math.min(num(m.ambarPct)||DEF_METAS.disponibilidad.ambar,num(m.verdePct))};}
    return out;
  }
  function nivel(ind,valor){
    if(valor==null||!Number.isFinite(valor))return 'gris';
    const m=metasReporte()[ind];
    if(!m)return 'gris';
    if(ind==='merma')return valor<=m.verde?'verde':valor<=m.ambar?'ambar':'roja';
    return valor>=m.verde?'verde':valor>=m.ambar?'ambar':'roja';
  }
  function aplicarMetasAlCodigo(){            // las metas que usaba el código fijo (METAS) siguen a Firestore
    try{
      if(typeof METAS==='undefined')return;
      const m=metasReporte();
      METAS.oee=m.oee.verde/100;METAS.disponibilidad=m.disponibilidad.verde/100;
      METAS.merma=m.merma.verde/100;METAS.rendimiento=m.ratio.verde/100;
    }catch(_){/* sin METAS */}
  }

  /* Velocidad estándar: ÚNICA tabla (sync/configIndicadores) con el catálogo base como respaldo. */
  const normVel=k=>norm(k).replace(/\s+/g,'');
  let indiceVel=null,indiceDe=null;
  function indice(){
    const v=cfg().velocidades||{};
    if(indiceDe!==v||!indiceVel){
      indiceVel=new Map();
      Object.keys(v).forEach(k=>{if(num(v[k])>0)indiceVel.set(normVel(k),num(v[k]));});
      indiceDe=v;
    }
    return indiceVel;
  }
  const catalogoBase=typeof obtenerRatioNominal==='function'?obtenerRatioNominal:null;
  function velTabla(linea,pres,marca){
    const ix=indice(),vars=[pres];
    try{if(typeof normalizarPresentacionRegular==='function')vars.push(normalizarPresentacionRegular(pres));}catch(_){/* sin alias */}
    for(const p of vars){
      if(marca){const a=ix.get(normVel(linea+'|'+p+'|'+marca));if(a>0)return a;}
      const b=ix.get(normVel(linea+'|'+p));if(b>0)return b;
    }
    return 0;
  }
  function velocidadCatalogo(linea,pres,marca){
    try{return catalogoBase?num(catalogoBase(linea,pres,marca)):0;}catch(_){return 0;}
  }
  function velocidadEstandar(linea,pres,marca){
    const t=velTabla(linea,pres,marca);
    return t>0?t:velocidadCatalogo(linea,pres,marca);
  }
  window.glacialVelocidadEstandar=velocidadEstandar;
  window.glacialVelocidadCatalogo=velocidadCatalogo;
  if(catalogoBase){   // Planificación y el registro de producción leen la misma tabla
    obtenerRatioNominal=function(linea,presentacion,marca){
      const t=velTabla(linea,presentacion,marca);
      return t>0?t:catalogoBase.apply(this,arguments);
    };
    window.obtenerRatioNominal=obtenerRatioNominal;
  }

  /* =========================================================
     ESTADO DE FILTROS Y PERIODO
     ========================================================= */
  const F={turno:'',producto:'',desde:'',hasta:'',detalle:null,comoAbierto:false};
  const resumenTieneRango=()=>typeof resumenRangoDias!=='undefined';

  function periodo(){
    const hoy=hoyOp();
    let desde,hasta;
    let r=resumenTieneRango()?resumenRangoDias:30;
    if(r==='rango'&&!(fechaOk(F.desde)&&fechaOk(F.hasta)&&F.hasta>=F.desde))r=30;
    if(r===1){desde=hasta=(typeof resumenFechaDiaria!=='undefined'&&resumenFechaDiaria)||hoy;}
    else if(r==='rango'){desde=F.desde;hasta=F.hasta;}
    else if(!r){
      hasta=hoy;desde=hoy;
      try{
        (loadRecords()||[]).forEach(x=>{if(x&&fechaOk(x.fecha)&&x.fecha<desde)desde=x.fecha;});
        (loadProgramaciones()||[]).forEach(x=>{if(x&&fechaOk(x.fecha)&&x.fecha<desde&&x.fecha<=hoy)desde=x.fecha;});
      }catch(_){/* sin datos */}
    }else{hasta=hoy;desde=addDias(hoy,-(num(r)-1));}
    let previo=null;
    if(r){const n=diasEntre(desde,hasta);previo={desde:addDias(desde,-n),hasta:addDias(desde,-1)};}
    return {desde,hasta,previo,hoy};
  }
  window.glacialRangoEtiqueta=()=>{const p=periodo();return 'del '+fmtFecha(p.desde)+' al '+fmtFecha(p.hasta);};
  function etiquetaPeriodo(p){
    const r=resumenTieneRango()?resumenRangoDias:30;
    if(p.desde===p.hasta)return 'día '+fmtFecha(p.desde);
    if(r===1)return 'día '+fmtFecha(p.desde);
    return 'del '+fmtFecha(p.desde)+' al '+fmtFecha(p.hasta);
  }

  /* =========================================================
     MOTOR DE DATOS: partes (turno · línea · producto) del periodo
     ========================================================= */
  const esSinMotivo=m=>{const t=norm(m);return !t||t==='otro'||t==='sin motivo'||t==='sin descripcion'||t==='sin motivo registrado';};
  const claveProd=(marca,pres)=>String(pres||'').trim()+'|'+String(marca||'').trim();
  const etiquetaProd=(marca,pres)=>{const m=String(marca||'').trim(),p=String(pres||'').trim();return m&&p?m+' · '+p:(m||p||'Sin producto');};
  const componenteMerma=item=>{
    const t=norm(item);
    if(/botella|bidon/.test(t))return 'Botellas';
    if(/preforma/.test(t))return 'Preformas';
    if(/tapa/.test(t))return 'Tapas';
    if(/etiqueta/.test(t))return 'Etiquetas';
    if(/polietileno/.test(t))return 'Polietileno';
    return String(item||'Otros').trim()||'Otros';
  };
  const ORDEN_COMP=['Botellas','Preformas','Tapas','Etiquetas','Polietileno'];

  function parteVacia(u,marca,pres){
    return {linea:u.linea,fecha:u.fecha,grupo:u.grupo,fuente:u.fuente,progUnit:false,marca:marca||'',pres:pres||'',
      pkey:claveProd(marca,pres),producido:0,programado:0,durMin:0,progMin:0,npMin:0,planMin:0,availMin:0,
      mermas:{},mermaTotal:0,paradas:[],vel:0};
  }
  function velParte(p){return velocidadEstandar(p.linea,p.pres,p.marca);}

  function recolectar(desde,hasta){
    const hoy=hoyOp();
    const salida={partes:[],avisos:{sinCierre:[],sinRegistro:[],sinProgramacion:[],sinMotivo:0,sinMotivoEj:[],sinVelocidad:new Set(),discrepancias:[]},
      productos:new Map(),hayVivo:false};
    let permitidas=null;
    try{permitidas=new Set((typeof lineasConsultables==='function'?lineasConsultables():LINES).map(l=>l.key));}catch(_){permitidas=null;}
    const lineaFiltro=(typeof resumenFiltroLinea!=='undefined'&&resumenFiltroLinea!=='TODAS')?resumenFiltroLinea:'';
    const lineaOk=l=>(!permitidas||permitidas.has(l))&&(!lineaFiltro||l===lineaFiltro);
    const unidades=new Map();
    const kU=(l,f,g)=>l+'|'+f+'|'+g;
    const getU=(l,f,g,fuente)=>{const k=kU(l,f,g);let u=unidades.get(k);if(!u){u={key:k,linea:l,fecha:f,grupo:g,fuente,programado:0,partes:new Map(),turnoArg:'',registros:[]};unidades.set(k,u);}return u;};
    const getParte=(u,marca,pres)=>{const pk=claveProd(marca,pres);let p=u.partes.get(pk);if(!p){p=parteVacia(u,marca,pres);u.partes.set(pk,p);}return p;};

    /* 1) Programado: una sola ventana, sin canceladas (estadoOperacion.estado) */
    let progs=[];try{progs=loadProgramaciones()||[];}catch(_){progs=[];}
    progs.forEach(p=>{
      if(!p||!p.linea||!fechaOk(p.fecha)||p.fecha<desde||p.fecha>hasta||p.fecha>hoy||!lineaOk(p.linea))return;
      if(!(num(p.cantidadProgramada)>0))return;
      if(p.estadoOperacion&&p.estadoOperacion.estado==='CANCELADA')return;
      const u=getU(p.linea,p.fecha,grupoDeTurno(p.turno),p.fecha===hoy?'VIVO':'REGISTRO');
      if(!u.turnoArg)u.turnoArg=p.turno;
      if(p.turno==='INTERMEDIO')u.turnoArg='INTERMEDIO';
      u.programado+=num(p.cantidadProgramada);
      const pt=getParte(u,p.marca,p.presentacion);
      pt.programado+=num(p.cantidadProgramada);
    });

    /* 2) Día en curso: datos en vivo del semáforo */
    const vivoEnRango=hoy>=desde&&hoy<=hasta;
    if(vivoEnRango){
      salida.hayVivo=true;
      const A=window.glacialAnalisisParadas;
      let u47=[];
      try{u47=A&&typeof A.listarUnidades==='function'?A.listarUnidades(hoy,hoy,{}).unidades:[];}catch(_){u47=[];}
      ['DIA','NOCHE'].forEach(g=>{
        const arg=g==='NOCHE'?'NOCHE':([...unidades.values()].some(u=>u.fecha===hoy&&u.grupo==='DIA'&&u.turnoArg==='INTERMEDIO')?'INTERMEDIO':'DÍA');
        let filas=[];
        try{if(typeof window.glacialResumenEjecutivoLineas==='function')filas=(window.glacialResumenEjecutivoLineas(hoy,arg)||{}).filas||[];}catch(_){filas=[];}
        filas.forEach(f=>{
          if(!lineaOk(f.linea))return;
          const u=getU(f.linea,hoy,g,'VIVO');
          u.fuente='VIVO';
          // el semáforo manda: se rehace el programado y la producción de esta unidad
          u.partes=new Map();u.programado=num(f.programado);
          const t47=u47.find(x=>x.linea===f.linea&&grupoDeTurno(x.turno)===g);
          const detalle=(Array.isArray(f.detalle)&&f.detalle.length)?f.detalle:[{marca:f.marca,presentacion:f.presentacion,producido:f.producido,programado:f.programado}];
          const items=t47?t47.npItems.map(i=>({motivo:i.motivo,minutos:num(i.minutos)})):[];
          const prodTot=detalle.reduce((s,d)=>s+num(d.producido),0);
          const pesos=detalle.map(d=>{const v=velocidadEstandar(f.linea,d.presentacion,d.marca);return v>0?num(d.producido)/v:0;});
          const usarVel=prodTot>0&&pesos.every((w,i)=>w>0||num(detalle[i].producido)===0)&&pesos.some(w=>w>0);
          const pesoTot=usarVel?pesos.reduce((a,b)=>a+b,0):(prodTot>0?prodTot:detalle.length);
          detalle.forEach((d,i)=>{
            const pt=getParte(u,d.marca,d.presentacion);
            pt.producido=num(d.producido);pt.programado=num(d.programado);
            const w=usarVel?pesos[i]:(prodTot>0?num(d.producido):1);
            const share=pesoTot>0?w/pesoTot:0;
            if(t47){
              pt.durMin=t47.duracion*share;pt.progMin=t47.prog*share;pt.npMin=t47.np*share;
              pt.planMin=t47.planificado*share;pt.availMin=t47.enMarcha*share;
              pt.paradas=items.map(it=>({motivo:it.motivo,minutos:it.minutos*share}));
            }
          });
          u.partes.forEach(pt=>{pt.progUnit=u.programado>0;});
          if(t47)t47.npItems.forEach(it=>{if(esSinMotivo(it.motivo)){salida.avisos.sinMotivo++;if(salida.avisos.sinMotivoEj.length<5)salida.avisos.sinMotivoEj.push(nombreLinea(f.linea)+' · hoy');}});
        });
      });
    }

    /* 3) Registros del turno (turnos anteriores) y mermas */
    let records=[];try{records=loadRecords()||[];}catch(_){records=[];}
    let paletas=[];try{paletas=(typeof loadPaletas==='function'?loadPaletas():[])||[];}catch(_){paletas=[];}
    const cuadrosDe=r=>typeof normalizarCuadros==='function'?normalizarCuadros(r):(r.cuadros||[]);
    records.forEach(r=>{
      if(!r||!r.linea||!fechaOk(r.fecha)||r.fecha<desde||r.fecha>hasta||!lineaOk(r.linea))return;
      const g=r.grupoTurno==='NOCHE'?'NOCHE':(r.grupoTurno==='DIA_INTERMEDIO'?'DIA':grupoDeTurno(r.turno));
      const enVivo=r.fecha===hoy;
      const u=getU(r.linea,r.fecha,g,enVivo?'VIVO':'REGISTRO');
      u.registros.push(r);
      cuadrosDe(r).forEach(q=>{
        const eff=num(q&&q.produccion&&q.produccion.efectiva);
        const mermas=(q&&q.mermas)||[];
        const mermaTotal=mermas.reduce((s,m)=>s+num(m&&m.unidades),0);
        const dur=num(q&&q.horasTurno)*60;
        if(!eff&&!dur&&!mermaTotal)return;
        const pt=getParte(u,q.marca,q.presentacion);
        mermas.forEach(m=>{
          const it=String(m&&m.item||'').trim();if(!it)return;
          const c=componenteMerma(it),o=pt.mermas[c]||(pt.mermas[c]={unidades:0,peso:0});
          o.unidades+=num(m.unidades);o.peso+=num(m.peso);
        });
        pt.mermaTotal+=mermaTotal;
        if(enVivo)return;                              // hoy: producción y tiempos vienen del semáforo; solo se toma la merma
        const prog=(q.paradasProgramadas||[]).reduce((s,p)=>s+num(p&&p.tiempoMin),0);
        const npL=(q.paradasNoProgramadas||[]).filter(p=>num(p&&p.tiempoMin)>0);
        const np=npL.reduce((s,p)=>s+num(p.tiempoMin),0);
        pt.producido+=eff;pt.durMin+=dur;pt.progMin+=prog;pt.npMin+=np;
        const plan=Math.max(dur-prog,0);
        pt.planMin+=plan;pt.availMin+=Math.max(plan-np,0);
        npL.forEach(p=>{
          const desc=String(p.descripcion||'').trim();
          pt.paradas.push({motivo:desc?(typeof normalizarCausaParada==='function'?normalizarCausaParada(desc).descripcion:desc):'Sin motivo',minutos:num(p.tiempoMin)});
          if(esSinMotivo(desc)){salida.avisos.sinMotivo++;if(salida.avisos.sinMotivoEj.length<5)salida.avisos.sinMotivoEj.push(nombreLinea(r.linea)+' · '+fmtFecha(r.fecha));}
        });
      });
    });

    /* 4) Armar partes definitivas, avisos y comprobaciones */
    unidades.forEach(u=>{
      const tieneReg=u.registros.length>0;
      const pasado=u.fecha<hoy;
      if(pasado&&!tieneReg){                           // programado y sin registro: no entra en el cálculo, se lista
        salida.avisos.sinRegistro.push({linea:u.linea,fecha:u.fecha,grupo:u.grupo});
        return;
      }
      if(pasado&&u.registros.some(r=>r.estadoRegistro!=='FINALIZADO'))salida.avisos.sinCierre.push({linea:u.linea,fecha:u.fecha,grupo:u.grupo});
      const prodU=[...u.partes.values()].reduce((s,p)=>s+p.producido,0);
      if(pasado&&u.programado<=0&&prodU>0)salida.avisos.sinProgramacion.push({linea:u.linea,fecha:u.fecha,grupo:u.grupo});
      if(pasado&&tieneReg){                            // registro vs Paletas y vs bitácora (> 2 %)
        const sumP=paletas.reduce((s,p)=>(p&&p.linea===u.linea&&p.fecha===u.fecha&&grupoDeTurno(p.turno)===u.grupo)?s+(num(p.totalUnidades)||num(p.unidadesIncompleta)):s,0);
        if(sumP>0&&Math.abs(prodU-sumP)/Math.max(prodU,sumP)>UMBRAL_DIF)
          salida.avisos.discrepancias.push({tipo:'Producción',linea:u.linea,fecha:u.fecha,grupo:u.grupo,registro:prodU,otro:sumP,fuente:'Paletas'});
        const npReg=[...u.partes.values()].reduce((s,p)=>s+p.npMin,0);
        let t=null;
        try{if(typeof window.calcularTiemposLinea==='function')t=window.calcularTiemposLinea(u.linea,u.turnoArg||(u.grupo==='NOCHE'?'NOCHE':'DÍA'),u.fecha);}catch(_){t=null;}
        if(t&&t.ok){
          const npBit=num(t.minParadasNoProgramadas);
          if((npReg>0||npBit>0)&&Math.abs(npReg-npBit)>=1&&Math.abs(npReg-npBit)/Math.max(npReg,npBit)>UMBRAL_DIF)
            salida.avisos.discrepancias.push({tipo:'Minutos de parada',linea:u.linea,fecha:u.fecha,grupo:u.grupo,registro:npReg,otro:npBit,fuente:'bitácora'});
        }
      }
      u.partes.forEach(p=>{
        p.progUnit=u.programado>0;
        p.vel=velParte(p);
        if(p.producido>0&&p.availMin>0&&!(p.vel>0))salida.avisos.sinVelocidad.add(nombreLinea(p.linea)+' · '+etiquetaProd(p.marca,p.pres));
        salida.productos.set(p.pkey,etiquetaProd(p.marca,p.pres));
        salida.partes.push(p);
      });
    });
    return salida;
  }

  /* ---------- filtros de turno y producto ---------- */
  function filtrarPartes(partes){
    return partes.filter(p=>(!F.turno||p.grupo===F.turno)&&(!F.producto||p.pkey===F.producto));
  }

  /* =========================================================
     AGREGACIÓN (indicadores)
     ========================================================= */
  function agregar(partes){
    let prod=0,progU=0,prodU=0,avail=0,prodT=0,plan=0,merma=0,npMin=0,progMin=0,durMin=0;
    let stdOut=0,availV=0,planV=0,prodV=0,prodConT=0;
    const faltantes=new Set();
    partes.forEach(p=>{
      prod+=p.producido;merma+=p.mermaTotal;
      if(p.progUnit){progU+=p.programado;prodU+=p.producido;}
      if(p.availMin>0){avail+=p.availMin;prodT+=p.producido;}
      if(p.planMin>0)plan+=p.planMin;
      npMin+=p.npMin;progMin+=p.progMin;durMin+=p.durMin;
      if(p.availMin>0){
        prodConT+=p.producido;
        if(p.vel>0){stdOut+=p.availMin/60*p.vel;availV+=p.availMin;planV+=p.planMin;prodV+=p.producido;}
        else if(p.producido>0)faltantes.add(etiquetaProd(p.marca,p.pres));
      }
    });
    const horas=avail/60;
    const disp=plan>0?avail/plan*100:null;
    const rend=stdOut>0?prodV/stdOut*100:null;
    const dispV=planV>0?availV/planV*100:null;
    const oee=(rend!=null&&dispV!=null)?dispV*rend/100:null;
    return {produccion:prod,programado:progU,producidoProg:prodU,cumplimiento:progU>0?prodU/progU*100:null,
      horasEfectivas:horas,ratio:horas>0?prodT/horas:null,disponibilidad:disp,merma:prod>0?merma/prod*100:null,
      mermaUnidades:merma,rendimiento:rend,oee,cobertura:prodConT>0?prodV/prodConT*100:null,faltantes:[...faltantes],
      npMin,progMin,planMin:plan,n:partes.length};
  }
  const valorInd=(ind,a)=>ind==='ratio'?a.ratio:a[ind];
  /* El ratio se compara contra la velocidad estándar para el color: % de la estándar. */
  function nivelDe(ind,a){
    if(ind==='ratio')return nivel('ratio',a.rendimiento);
    if(ind==='produccion')return 'gris';
    return nivel(ind,valorInd(ind,a));
  }
  function variacion(ind,act,prev){
    if(!prev)return null;
    const a=valorInd(ind,act),b=valorInd(ind,prev);
    if(a==null||b==null)return null;
    if(ind==='produccion'||ind==='ratio'){if(!(b>0))return null;return {delta:(a-b)/b*100,tipo:'pct'};}
    return {delta:a-b,tipo:'pts'};
  }
  const buenoAlSubir=ind=>ind!=='merma';

  function agruparPor(partes,fn){
    const m=new Map();
    partes.forEach(p=>{const k=fn(p);if(!m.has(k))m.set(k,[]);m.get(k).push(p);});
    return m;
  }
  function serieDiaria(partes,desde,hasta,ind){
    const porDia=agruparPor(partes,p=>p.fecha);
    const out=[];
    for(let f=desde;f<=hasta;f=addDias(f,1)){
      const ps=porDia.get(f);
      out.push(ps?valorInd(ind,agregar(ps)):null);
      if(out.length>400)break;
    }
    return out;
  }
  function filasComparativo(partes,fnClave,fnEtiqueta,per){
    const filas=[...agruparPor(partes,fnClave)].map(([k,ps])=>{
      const a=agregar(ps);
      return {clave:k,etiqueta:fnEtiqueta(k,ps),a,serie:serieDiaria(ps,per.desde,per.hasta,'cumplimiento')};
    });
    filas.sort((x,y)=>{
      const cx=x.a.cumplimiento,cy=y.a.cumplimiento;
      if(cx==null&&cy==null)return y.a.produccion-x.a.produccion;
      if(cx==null)return 1;if(cy==null)return -1;
      return cy-cx;
    });
    return filas;
  }

  /* =========================================================
     «QUÉ PASÓ»: hasta tres frases con reglas fijas
     ========================================================= */
  function motivoPrincipal(partes,linea){
    const m=new Map();
    partes.filter(p=>p.linea===linea).forEach(p=>p.paradas.forEach(i=>{m.set(i.motivo,(m.get(i.motivo)||0)+i.minutos);}));
    const top=[...m].sort((a,b)=>b[1]-a[1])[0];
    return top&&top[1]>0?{motivo:top[0],minutos:top[1]}:null;
  }
  function quePaso(partes,porLinea){
    const f=[];
    const conPlan=porLinea.filter(x=>x.a.cumplimiento!=null);
    const peor=conPlan.length?conPlan.slice().sort((a,b)=>a.a.cumplimiento-b.a.cumplimiento)[0]:null;
    const mejor=conPlan.length?conPlan.slice().sort((a,b)=>b.a.cumplimiento-a.a.cumplimiento)[0]:null;
    if(peor&&peor.a.cumplimiento<100){
      const mp=motivoPrincipal(partes,peor.clave);
      f.push(esc(peor.etiqueta)+' tuvo el menor cumplimiento ('+fmtP(peor.a.cumplimiento)+'); '+
        (mp?'su principal parada fue «'+esc(mp.motivo)+'» con '+fmtN(mp.minutos)+' min.':'no registró paradas no programadas.'));
    }
    const conMerma=porLinea.filter(x=>x.a.merma!=null&&x.a.merma>0);
    const may=conMerma.length?conMerma.slice().sort((a,b)=>b.a.merma-a.a.merma)[0]:null;
    if(may)f.push(esc(may.etiqueta)+' tuvo la mayor merma ('+fmtP(may.a.merma)+').');
    if(mejor&&(!peor||mejor.clave!==peor.clave||conPlan.length===1)){
      f.push(esc(mejor.etiqueta)+' tuvo el mejor resultado: '+fmtP(mejor.a.cumplimiento)+' de cumplimiento'+
        (mejor.a.ratio!=null?' y ratio de '+fmtN(mejor.a.ratio)+' UND/h.':'.'));
    }
    return f.slice(0,3);
  }

  /* =========================================================
     CÁLCULO COMPLETO DEL REPORTE
     ========================================================= */
  function calcular(){
    const per=periodo();
    const act=recolectar(per.desde,per.hasta);
    const partes=filtrarPartes(act.partes);
    const prev=per.previo?filtrarPartes(recolectar(per.previo.desde,per.previo.hasta).partes):null;
    const a=agregar(partes),ap=prev?agregar(prev):null;
    const porLinea=filasComparativo(partes,p=>p.linea,k=>nombreLinea(k),per);
    const porTurno=filasComparativo(partes,p=>p.grupo,k=>etiquetaGrupo(k),per);
    const porProducto=filasComparativo(partes,p=>p.pkey,(k,ps)=>etiquetaProd(ps[0].marca,ps[0].pres),per);
    const mermaComp={};
    partes.forEach(p=>Object.keys(p.mermas).forEach(c=>{const o=mermaComp[c]||(mermaComp[c]={unidades:0,peso:0});o.unidades+=p.mermas[c].unidades;o.peso+=p.mermas[c].peso;}));
    return {per,partes,productos:act.productos,avisos:act.avisos,hayVivo:act.hayVivo,a,ap,porLinea,porTurno,porProducto,mermaComp,
      kpis:Object.keys(NOMBRES).map(ind=>({ind,valor:valorInd(ind,a),nivel:nivelDe(ind,a),variacion:variacion(ind,a,ap)})),
      queFrases:quePaso(partes,porLinea)};
  }

  /* =========================================================
     INTERFAZ
     ========================================================= */
  function estilos(){
    if(document.getElementById('rgx-css'))return;
    const s=document.createElement('style');s.id='rgx-css';
    s.textContent=`
      .rgx{margin:0 0 18px;font-size:13px;color:#2E3A46}
      .rgx-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin:0 0 8px}
      .rgx-bar h3{margin:0;font-size:15px;color:#073f68}.rgx-sub{color:#6B7784;font-size:12px}
      .rgx-ctl{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
      .rgx-ctl select,.rgx-ctl input[type=date]{padding:5px 8px;border:1px solid #d8e2e8;border-radius:8px;font-size:12px;background:#fff}
      .rgx-btn{border:1px solid #d8e2e8;background:#fff;border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;color:#073f68}
      .rgx-btn.on{background:#073f68;color:#fff;border-color:#073f68}
      .rgx-nota{font-size:11px;color:#6B7784;margin:4px 0 8px}
      .rgx-aviso{background:#FFF7ED;border:1px solid #FCE3C0;color:#8A5A1E;border-radius:10px;padding:9px 12px;margin:8px 0;font-size:12px}
      .rgx-aviso ul{margin:4px 0 0;padding-left:18px}
      .rgx-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:8px 0}
      .rgx-k{background:#fff;border:1px solid #dce5ea;border-left:5px solid #aab7bf;border-radius:10px;padding:10px 12px;cursor:pointer}
      .rgx-k:hover{border-color:#073f68}.rgx-k.verde{border-left-color:#2e8b57}.rgx-k.ambar{border-left-color:#d89216}.rgx-k.roja{border-left-color:#c4472b}
      .rgx-k span{display:block;font-size:11px;text-transform:uppercase;color:#71828d;font-weight:700}
      .rgx-k b{display:block;font-size:22px;color:#17384d;margin:3px 0}.rgx-k small{display:block;color:#6B7784;font-size:11px}
      .rgx-var.bien{color:#2e8b57}.rgx-var.mal{color:#c4472b}.rgx-var.neutro{color:#6B7784}
      .rgx-box{background:#fff;border:1px solid #dce5ea;border-radius:10px;padding:12px 14px;margin:10px 0}
      .rgx-box h4{margin:0 0 8px;font-size:13px;color:#073f68}.rgx-box ol,.rgx-box ul{margin:0;padding-left:18px}.rgx-box li{margin:3px 0}
      .rgx-tabla{width:100%;border-collapse:collapse;font-size:12px}.rgx-tabla th{font-weight:600;color:#6B7784;text-align:right;padding:5px 6px;border-bottom:1px solid #e6ebef}
      .rgx-tabla td{padding:5px 6px;border-bottom:1px solid #eef1f4;text-align:right}.rgx-tabla th:first-child,.rgx-tabla td:first-child{text-align:left}
      .rgx-tabla tr[data-rgx-linea]{cursor:pointer}.rgx-tabla tr[data-rgx-linea]:hover{background:#f4f8fb}
      .rgx-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:#aab7bf}
      .rgx-dot.verde{background:#2e8b57}.rgx-dot.ambar{background:#d89216}.rgx-dot.roja{background:#c4472b}
      .rgx-grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px}
      .rgx-det{border:2px solid #073f68}
      .rgx-como dt{font-weight:700;margin-top:6px}.rgx-como dd{margin:0 0 0 0;color:#435b69}
      @media(max-width:600px){.rgx-kpis{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.appendChild(s);
  }

  function spark(vals){
    const pts=vals.map((v,i)=>({v,i})).filter(x=>x.v!=null);
    if(pts.length<2)return '<span style="color:#aab7bf">—</span>';
    const W=70,H=18,max=Math.max(...pts.map(x=>x.v),1),min=Math.min(...pts.map(x=>x.v),0);
    const n=vals.length-1||1,rg=(max-min)||1;
    const d=pts.map(x=>(x.i/n*W).toFixed(1)+','+(H-((x.v-min)/rg*(H-2))-1).toFixed(1)).join(' ');
    return '<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" aria-hidden="true"><polyline fill="none" stroke="#073f68" stroke-width="1.5" points="'+d+'"/></svg>';
  }
  function textoVar(ind,v){
    if(!v)return '<span class="rgx-var neutro">sin periodo anterior comparable</span>';
    const sube=v.delta>0.05,baja=v.delta<-0.05;
    if(!sube&&!baja)return '<span class="rgx-var neutro">= sin cambio</span>';
    const bueno=(sube&&buenoAlSubir(ind))||(baja&&!buenoAlSubir(ind));
    return '<span class="rgx-var '+(bueno?'bien':'mal')+'">'+(sube?'▲ ':'▼ ')+fmtD(Math.abs(v.delta),1)+(v.tipo==='pct'?' %':' pts')+' vs periodo anterior</span>';
  }
  function valorTexto(ind,v){
    if(v==null)return '—';
    if(ind==='produccion'||ind==='ratio')return fmtN(v);
    return fmtP(v);
  }
  function metaTexto(ind){
    const m=metasReporte()[ind];
    if(!m)return ind==='produccion'?'Sin meta (volumen)':'';
    if(ind==='merma')return 'Meta ≤ '+fmtD(m.verde,1)+' % (ámbar hasta '+fmtD(m.ambar,1)+' %)';
    if(ind==='ratio')return 'Meta ≥ '+fmtD(m.verde,0)+' % de la velocidad estándar';
    return 'Meta ≥ '+fmtD(m.verde,1)+' % (ámbar desde '+fmtD(m.ambar,1)+' %)';
  }
  function notaKpi(ind,R){
    const a=R.a;
    if(ind==='oee'){
      if(a.oee==null)return 'Falta velocidad estándar'+(a.faltantes.length?': '+esc(a.faltantes.slice(0,2).join(', ')):'')+' · Calidad: no se mide';
      return 'Calidad: no se mide'+(a.cobertura!=null&&a.cobertura<99.5?' · parcial ('+fmtD(a.cobertura,0)+' % de la producción con velocidad)':'');
    }
    if(ind==='ratio'&&a.rendimiento!=null)return 'Rendimiento '+fmtP(a.rendimiento)+(a.rendimiento>100?' · revisar velocidad estándar':'');
    return '';
  }

  const puedeConfigurar=()=>typeof window.glacialPuedeConfigurarIndicadores==='function'&&window.glacialPuedeConfigurarIndicadores();

  function htmlAvisos(R){
    const v=R.avisos,filas=[];
    const lst=(arr,f)=>arr.slice(0,5).map(f).join(', ')+(arr.length>5?' y '+(arr.length-5)+' más':'');
    const u=x=>nombreLinea(x.linea)+' '+fmtFecha(x.fecha)+' '+etiquetaGrupo(x.grupo);
    if(v.sinCierre.length)filas.push('<b>'+v.sinCierre.length+' turno(s) sin cierre del registro:</b> '+esc(lst(v.sinCierre,u)));
    if(v.sinRegistro.length)filas.push('<b>'+v.sinRegistro.length+' turno(s) programados sin registro de producción</b> (no entran en el cálculo): '+esc(lst(v.sinRegistro,u)));
    if(v.sinMotivo>0)filas.push('<b>'+v.sinMotivo+' parada(s) sin motivo:</b> '+esc(v.sinMotivoEj.join(', '))+(v.sinMotivo>v.sinMotivoEj.length?' …':''));
    if(v.sinProgramacion.length)filas.push('<b>Falta programación</b> en '+v.sinProgramacion.length+' turno(s) con producción: '+esc(lst(v.sinProgramacion,u)));
    if(v.sinVelocidad.size)filas.push('<b>Falta velocidad estándar</b> (no entra en el OEE): '+esc([...v.sinVelocidad].slice(0,4).join(', '))+(v.sinVelocidad.size>4?' …':''));
    if(v.discrepancias.length)filas.push('<b>Datos a revisar (diferencia &gt; 2 %):</b> '+esc(lst(v.discrepancias,d=>d.tipo+' '+u(d)+' (registro '+fmtN(d.registro)+' vs '+d.fuente+' '+fmtN(d.otro)+')')));
    if(R.a.rendimiento!=null&&R.a.rendimiento>100)filas.push('<b>Rendimiento superior a 100 %:</b> revisar velocidad estándar.');
    if(!filas.length)return '';
    return '<div class="rgx-aviso"><b>Datos incompletos o por revisar en este periodo</b><ul>'+filas.map(f=>'<li>'+f+'</li>').join('')+'</ul></div>';
  }

  function htmlKpis(R){
    return '<div class="rgx-kpis">'+R.kpis.map(k=>{
      const nota=notaKpi(k.ind,R);
      return '<div class="rgx-k '+k.nivel+'" data-rgx-ind="'+k.ind+'" role="button" tabindex="0" title="Ver detalle"><span>'+NOMBRES[k.ind]+'</span><b>'+valorTexto(k.ind,k.valor)+
        (k.ind==='ratio'&&k.valor!=null?' <small style="display:inline">UND/h</small>':'')+'</b>'+textoVar(k.ind,k.variacion)+
        '<small>'+metaTexto(k.ind)+'</small>'+(nota?'<small>'+nota+'</small>':'')+'</div>';
    }).join('')+'</div>';
  }
  function htmlTablaComparativa(titulo,filas,conClick){
    if(!filas.length)return '<div class="rgx-box"><h4>'+titulo+'</h4><div class="rgx-nota">Sin datos en el periodo.</div></div>';
    return '<div class="rgx-box"><h4>'+titulo+' <span class="rgx-sub">(de mejor a peor cumplimiento)</span></h4><table class="rgx-tabla"><thead><tr><th></th><th>Producción</th><th>Cumpl.</th><th>Ratio</th><th>Disp.</th><th>Merma</th><th>Tendencia</th></tr></thead><tbody>'+
      filas.map(f=>{
        const n=nivel('cumplimiento',f.a.cumplimiento);
        return '<tr'+(conClick?' data-rgx-linea="'+esc(f.clave)+'"':'')+'><td><span class="rgx-dot '+n+'"></span>'+esc(f.etiqueta)+'</td><td>'+fmtN(f.a.produccion)+'</td><td>'+fmtP(f.a.cumplimiento)+'</td><td>'+(f.a.ratio==null?'—':fmtN(f.a.ratio))+'</td><td>'+fmtP(f.a.disponibilidad)+'</td><td>'+fmtP(f.a.merma)+'</td><td>'+spark(f.serie)+'</td></tr>';
      }).join('')+'</tbody></table></div>';
  }
  function htmlMerma(R){
    const nombres=Object.keys(R.mermaComp).sort((a,b)=>{const ia=ORDEN_COMP.indexOf(a),ib=ORDEN_COMP.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib)||a.localeCompare(b,'es');});
    if(!nombres.length)return '<div class="rgx-box"><h4>Merma por componente</h4><div class="rgx-nota">Sin mermas registradas en el periodo.</div></div>';
    return '<div class="rgx-box"><h4>Merma por componente <span class="rgx-sub">(cada uno en su unidad)</span></h4><table class="rgx-tabla"><thead><tr><th>Componente</th><th>Cantidad</th><th>Unidad</th></tr></thead><tbody>'+
      nombres.map(c=>{
        const o=R.mermaComp[c];
        if(c==='Polietileno')return '<tr><td>'+c+'</td><td>'+fmtD(o.peso,1)+'</td><td>kg ('+fmtD(o.unidades,2)+' rollos)</td></tr>';
        return '<tr><td>'+esc(c)+'</td><td>'+fmtN(o.unidades)+'</td><td>unidades</td></tr>';
      }).join('')+'</tbody></table><div class="rgx-nota">Merma total = suma de mermas ÷ producción efectiva = '+fmtP(R.a.merma)+'.</div></div>';
  }

  const DEFINICIONES=[
    ['Horas efectivas','Tiempo transcurrido − (paradas programadas + no programadas) ÷ 60.'],
    ['Ratio (UND/h)','Producción efectiva ÷ horas efectivas. Es el mismo ratio del semáforo. El color compara con la velocidad estándar.'],
    ['Tiempo planificado','Duración de la programación − paradas programadas.'],
    ['Disponibilidad','(Tiempo planificado − paradas no programadas) ÷ tiempo planificado.'],
    ['Merma','Suma de las mermas ÷ producción efectiva (una sola fórmula en toda la pantalla).'],
    ['Cumplimiento','Producido ÷ programado, con la misma ventana de fechas y sin programaciones canceladas.'],
    ['Rendimiento','Ratio ÷ velocidad estándar. Si pasa de 100 %, se muestra el aviso «revisar velocidad estándar».'],
    ['OEE','Disponibilidad × rendimiento. Solo se calcula si el producto tiene velocidad estándar. Calidad: no se mide.'],
    ['Fuente de los datos','Día en curso: semáforo en vivo. Turnos anteriores: registro del turno; si difiere de Paletas o de la bitácora en más de 2 % se avisa.'],
    ['Periodo anterior','Día contra el día anterior; 7, 30 y 90 días contra los mismos días inmediatamente anteriores; rango contra el rango previo de igual duración.']
  ];

  function htmlDetalle(R){
    const d=F.detalle;if(!d)return '';
    if(d.tipo==='ind'){
      const ind=d.clave;
      const ent=[...R.porLinea];
      const a=R.a;
      const formula={
        produccion:'Suma de la producción efectiva: '+fmtN(a.produccion)+' unidades.',
        cumplimiento:'Producido '+fmtN(a.producidoProg)+' ÷ programado '+fmtN(a.programado)+' = '+fmtP(a.cumplimiento)+'.',
        ratio:'Producción '+fmtN(a.produccion)+' ÷ horas efectivas '+fmtD(a.horasEfectivas,2)+' h = '+(a.ratio==null?'—':fmtN(a.ratio))+' UND/h.',
        disponibilidad:'(Planificado '+fmtN(a.planMin)+' min − no programadas '+fmtN(a.npMin)+' min) ÷ planificado = '+fmtP(a.disponibilidad)+'.',
        merma:'Mermas '+fmtN(a.mermaUnidades)+' ÷ producción '+fmtN(a.produccion)+' = '+fmtP(a.merma)+'.',
        oee:a.oee==null?'Falta velocidad estándar: no se calcula.':'Disponibilidad × rendimiento = '+fmtP(a.oee)+'. Calidad: no se mide.'
      }[ind];
      const serie=serieDiaria(R.partes,R.per.desde,R.per.hasta,ind);
      const dias=[];for(let f=R.per.desde,i=0;f<=R.per.hasta&&i<400;f=addDias(f,1),i++)dias.push(f);
      return '<div class="rgx-box rgx-det"><div class="rgx-bar"><h4>'+NOMBRES[ind]+' · detalle</h4><button class="rgx-btn" data-rgx-cerrar>Cerrar</button></div>'+
        '<div>'+formula+'</div><div class="rgx-nota">'+metaTexto(ind)+'</div>'+
        '<table class="rgx-tabla" style="margin-top:8px"><thead><tr><th>Línea</th><th>Valor</th></tr></thead><tbody>'+
        ent.map(f=>'<tr data-rgx-linea="'+esc(f.clave)+'"><td>'+esc(f.etiqueta)+'</td><td>'+valorTexto(ind,valorInd(ind,f.a))+'</td></tr>').join('')+'</tbody></table>'+
        '<div class="rgx-nota" style="margin-top:6px">Por día: '+dias.map((f,i)=>serie[i]==null?null:fmtFecha(f).slice(0,5)+' '+valorTexto(ind,serie[i])).filter(Boolean).join(' · ')+'</div></div>';
    }
    const ps=R.partes.filter(p=>p.linea===d.clave);
    const a=agregar(ps);
    const porProd=filasComparativo(ps,p=>p.pkey,(k,x)=>etiquetaProd(x[0].marca,x[0].pres),R.per);
    const mp=motivoPrincipal(ps,d.clave);
    const motivos=new Map();ps.forEach(p=>p.paradas.forEach(i=>motivos.set(i.motivo,(motivos.get(i.motivo)||0)+i.minutos)));
    const topM=[...motivos].sort((x,y)=>y[1]-x[1]).slice(0,5);
    const porDia=[...agruparPor(ps,p=>p.fecha)].sort((x,y)=>x[0].localeCompare(y[0]));
    return '<div class="rgx-box rgx-det"><div class="rgx-bar"><h4>'+esc(nombreLinea(d.clave))+' · detalle</h4><button class="rgx-btn" data-rgx-cerrar>Cerrar</button></div>'+
      '<div class="rgx-kpis">'+Object.keys(NOMBRES).map(ind=>'<div class="rgx-k '+nivelDe(ind,a)+'" style="cursor:default"><span>'+NOMBRES[ind]+'</span><b>'+valorTexto(ind,valorInd(ind,a))+'</b></div>').join('')+'</div>'+
      '<table class="rgx-tabla"><thead><tr><th>Día</th><th>Producción</th><th>Cumpl.</th><th>Ratio</th><th>Disp.</th><th>Merma</th></tr></thead><tbody>'+
      porDia.map(([f,x])=>{const g=agregar(x);return '<tr><td>'+fmtFecha(f)+'</td><td>'+fmtN(g.produccion)+'</td><td>'+fmtP(g.cumplimiento)+'</td><td>'+(g.ratio==null?'—':fmtN(g.ratio))+'</td><td>'+fmtP(g.disponibilidad)+'</td><td>'+fmtP(g.merma)+'</td></tr>';}).join('')+'</tbody></table>'+
      '<h4 style="margin-top:10px">Motivos de parada no programada</h4>'+(topM.length?'<ol>'+topM.map(([m,min])=>'<li>'+esc(m)+' — '+fmtN(min)+' min</li>').join('')+'</ol>':'<div class="rgx-nota">Sin paradas no programadas.</div>')+
      (mp?'':'')+htmlTablaComparativa('Productos de la línea',porProd,false)+'</div>';
  }

  function htmlSeccion(R){
    const per=R.per;
    const prods=[...R.productos].sort((a,b)=>a[1].localeCompare(b[1],'es'));
    const rangoUI=(resumenTieneRango()&&resumenRangoDias==='rango')?
      '<input type="date" data-rgx-fecha="desde" value="'+esc(per.desde)+'"> <input type="date" data-rgx-fecha="hasta" value="'+esc(per.hasta)+'">':'';
    return '<div class="rgx-bar"><div><h3>Indicadores del periodo</h3><div class="rgx-sub">Todas las líneas visibles · '+esc(etiquetaPeriodo(per))+
      (R.hayVivo?' · hoy en vivo desde el semáforo':'')+(per.previo?' · comparado con '+esc(fmtFecha(per.previo.desde)===fmtFecha(per.previo.hasta)?fmtFecha(per.previo.desde):fmtFecha(per.previo.desde)+' – '+fmtFecha(per.previo.hasta)):'')+'</div></div>'+
      '<div class="rgx-ctl"><select data-rgx-filtro="turno" aria-label="Turno"><option value="">Todos los turnos</option><option value="DIA"'+(F.turno==='DIA'?' selected':'')+'>Día</option><option value="NOCHE"'+(F.turno==='NOCHE'?' selected':'')+'>Noche</option></select>'+
      '<select data-rgx-filtro="producto" aria-label="Producto"><option value="">Todos los productos</option>'+prods.map(([k,t])=>'<option value="'+esc(k)+'"'+(F.producto===k?' selected':'')+'>'+esc(t)+'</option>').join('')+'</select>'+
      '<button type="button" class="rgx-btn'+(resumenTieneRango()&&resumenRangoDias==='rango'?' on':'')+'" data-rgx-rango>Rango</button>'+rangoUI+
      (puedeConfigurar()?'<button type="button" class="rgx-btn" data-rgx-metas>⚙ Metas</button>':'')+
      '<button type="button" class="rgx-btn'+(F.comoAbierto?' on':'')+'" data-rgx-como>¿Cómo se calcula?</button></div></div>'+
      '<div class="rgx-nota">Desde el '+fmtFecha(FECHA_CAMBIO)+' todos los periodos, también los pasados, se calculan con las definiciones actuales de disponibilidad, merma y ratio; las cifras de reportes anteriores a esa fecha pueden diferir.'+
      (F.producto?' · Los gráficos de abajo muestran los registros que incluyen ese producto.':'')+'</div>'+
      htmlAvisos(R)+htmlKpis(R)+
      '<div class="rgx-box"><h4>Qué pasó</h4>'+(R.queFrases.length?'<ol>'+R.queFrases.map(t=>'<li>'+t+'</li>').join('')+'</ol>':'<div class="rgx-nota">No hay datos suficientes en el periodo.</div>')+'</div>'+
      htmlDetalle(R)+
      htmlTablaComparativa('Por línea',R.porLinea,true)+
      '<div class="rgx-grid3">'+htmlTablaComparativa('Por turno',R.porTurno,false)+htmlTablaComparativa('Por producto',R.porProducto,false)+'</div>'+
      htmlMerma(R)+
      (F.comoAbierto?'<div class="rgx-box"><h4>¿Cómo se calcula?</h4><dl class="rgx-como">'+DEFINICIONES.map(([t,x])=>'<dt>'+esc(t)+'</dt><dd>'+esc(x)+'</dd>').join('')+'</dl></div>':'');
  }

  let ultimo=null;
  function pintar(){
    const kp=document.getElementById('resumen-kpis');
    if(!kp||!kp.parentNode)return;
    estilos();
    let sec=document.getElementById('rgx');
    if(!sec){sec=document.createElement('section');sec.id='rgx';sec.className='rgx';kp.parentNode.insertBefore(sec,kp);}
    try{
      ultimo=calcular();
      sec.innerHTML=htmlSeccion(ultimo);
    }catch(e){
      console.warn('Indicadores del resumen:',e&&e.message||e);
      sec.innerHTML='<div class="rgx-aviso">No se pudieron calcular los indicadores: '+esc((e&&e.message)||e)+'</div>';
    }
  }
  const mainEl=()=>document.getElementById('main');
  function redibujarTodo(){if(typeof renderResumen==='function')renderResumen(mainEl());}

  /* ---------- editor de metas (Administrador y jefatura) ---------- */
  function abrirMetas(){
    if(!puedeConfigurar()){alert('Solo el Administrador o la jefatura pueden cambiar las metas.');return;}
    if(typeof window.glacialConfigIndicadoresEscuchar==='function')window.glacialConfigIndicadoresEscuchar();
    const m=metasReporte();
    const fondo=document.createElement('div');
    fondo.style.cssText='position:fixed;inset:0;background:rgba(10,30,50,.6);display:flex;align-items:center;justify-content:center;z-index:10060;padding:16px;';
    const fila=ind=>'<tr><td>'+NOMBRES[ind]+(ind==='ratio'?' <small>(% de la velocidad estándar)</small>':'')+'</td><td><input type="number" step="0.1" min="0" data-meta="'+ind+'.verde" data-orig="'+m[ind].verde+'" value="'+m[ind].verde+'" style="width:80px"></td><td><input type="number" step="0.1" min="0" data-meta="'+ind+'.ambar" data-orig="'+m[ind].ambar+'" value="'+m[ind].ambar+'" style="width:80px"></td></tr>';
    fondo.innerHTML='<div class="modal" style="max-width:560px;width:100%;max-height:90vh;overflow:auto;background:#fff;border-radius:12px;padding:16px">'+
      '<h3 style="margin:0 0 6px">Metas de los indicadores</h3><p class="small-muted" style="margin:0 0 10px">Verde cuando se cumple la meta; ámbar entre ambas; rojo fuera. En la merma, la meta es un máximo. Se ven en todos los dispositivos en segundos.</p>'+
      '<table style="width:100%;font-size:13px"><thead><tr><th align="left">Indicador</th><th align="left">Verde (%)</th><th align="left">Ámbar (%)</th></tr></thead><tbody>'+['cumplimiento','ratio','disponibilidad','merma','oee'].map(fila).join('')+'</tbody></table>'+
      '<div data-m-error style="color:#c62828;font-size:12px;min-height:16px;margin-top:6px"></div>'+
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button type="button" class="btn btn-ghost" data-m-x>Cancelar</button><button type="button" class="btn btn-primary" data-m-ok>Guardar</button></div></div>';
    document.body.appendChild(fondo);
    const err=t=>{const e=fondo.querySelector('[data-m-error]');if(e)e.textContent=t;};
    fondo.querySelector('[data-m-x]').onclick=()=>fondo.remove();
    fondo.querySelector('[data-m-ok]').onclick=async()=>{
      const cambios={},disp={};let hay=false;
      for(const el of fondo.querySelectorAll('[data-meta]')){
        const [ind,campo]=el.getAttribute('data-meta').split('.');
        const v=Number(el.value);
        if(!Number.isFinite(v)||v<=0||v>100){err('Cada meta debe estar entre 0 y 100 %.');return;}
        if(String(v)===String(el.getAttribute('data-orig')))continue;
        hay=true;
        if(ind==='disponibilidad')disp[campo==='verde'?'verdePct':'ambarPct']=v;
        else{(cambios[ind]=cambios[ind]||{})[campo]=v;}
      }
      for(const ind of ['cumplimiento','ratio','disponibilidad','oee']){
        const ve=Number(fondo.querySelector('[data-meta="'+ind+'.verde"]').value),am=Number(fondo.querySelector('[data-meta="'+ind+'.ambar"]').value);
        if(am>ve){err('En '+NOMBRES[ind]+', el ámbar no puede ser mayor que el verde.');return;}
      }
      if(Number(fondo.querySelector('[data-meta="merma.ambar"]').value)<Number(fondo.querySelector('[data-meta="merma.verde"]').value)){err('En la merma, el ámbar no puede ser menor que el verde.');return;}
      if(!hay){fondo.remove();return;}
      if(window.glacialEstadoDatos&&window.glacialEstadoDatos.enLinea===false){err('Sin conexión: no se guardó. Inténtalo cuando vuelva la conexión.');return;}
      err('Guardando…');
      try{
        const ref=db.collection('sync').doc('configIndicadores');
        await db.runTransaction(async tx=>{
          await tx.get(ref);
          const datos={actualizadoPor:(state.user&&state.user.username)||'',actualizadoEn:ahoraMs()};
          if(Object.keys(cambios).length)datos.metasReporte=cambios;
          if(Object.keys(disp).length)datos.metas=disp;
          tx.set(ref,datos,{merge:true});          // solo los campos indicados: el resto del documento queda igual
        });
        fondo.remove();
      }catch(e){err('No se pudo guardar (¿sin conexión o sin permiso?): '+((e&&e.message)||e));}
    };
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click',e=>{
    const sec=e.target.closest&&e.target.closest('#rgx');
    if(!sec)return;
    const ind=e.target.closest('[data-rgx-ind]');
    if(ind){F.detalle={tipo:'ind',clave:ind.getAttribute('data-rgx-ind')};pintar();return;}
    const lin=e.target.closest('[data-rgx-linea]');
    if(lin){F.detalle={tipo:'linea',clave:lin.getAttribute('data-rgx-linea')};pintar();return;}
    if(e.target.closest('[data-rgx-cerrar]')){F.detalle=null;pintar();return;}
    if(e.target.closest('[data-rgx-como]')){F.comoAbierto=!F.comoAbierto;pintar();return;}
    if(e.target.closest('[data-rgx-metas]')){abrirMetas();return;}
    if(e.target.closest('[data-rgx-rango]')){
      const p=periodo();
      F.desde=p.desde;F.hasta=p.hasta;
      if(F.desde===F.hasta)F.desde=addDias(F.hasta,-6);
      resumenRangoDias='rango';redibujarTodo();
    }
  });
  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const k=e.target&&e.target.closest&&e.target.closest('[data-rgx-ind]');
    if(k&&e.target.closest('#rgx')){e.preventDefault();F.detalle={tipo:'ind',clave:k.getAttribute('data-rgx-ind')};pintar();}
  });
  document.addEventListener('change',e=>{
    const t=e.target;if(!t||!t.closest||!t.closest('#rgx'))return;
    const f=t.getAttribute('data-rgx-filtro');
    if(f){F[f]=t.value;redibujarTodo();return;}
    const fe=t.getAttribute('data-rgx-fecha');
    if(fe){
      F[fe==='desde'?'desde':'hasta']=t.value;
      if(fechaOk(F.desde)&&fechaOk(F.hasta)){if(F.hasta<F.desde){if(fe==='desde')F.hasta=F.desde;else F.desde=F.hasta;}redibujarTodo();}
    }
  });

  /* ---------- ganchos sobre lo que ya existía ---------- */
  if(typeof renderResumen==='function'){
    const anterior=renderResumen;
    renderResumen=function(main){
      const r=anterior.apply(this,arguments);
      try{pintar();}catch(e){console.warn('Indicadores del resumen:',e&&e.message||e);}
      return r;
    };
    window.renderResumen=renderResumen;
  }
  // Una sola ventana de fechas para todo el reporte (día operativo en curso como último día), turno y producto.
  if(typeof filtrarPorRangoResumen==='function'){
    filtrarPorRangoResumen=function(records){
      const p=periodo();
      return (records||[]).filter(r=>{
        if(!r||!fechaOk(r.fecha)||r.fecha<p.desde||r.fecha>p.hasta)return false;
        if(F.turno){const g=r.grupoTurno==='NOCHE'?'NOCHE':(r.grupoTurno==='DIA_INTERMEDIO'?'DIA':grupoDeTurno(r.turno));if(g!==F.turno)return false;}
        if(F.producto){
          const cu=typeof normalizarCuadros==='function'?normalizarCuadros(r):(r.cuadros||[]);
          if(!cu.some(q=>claveProd(q&&q.marca,q&&q.presentacion)===F.producto))return false;
        }
        return true;
      });
    };
    window.filtrarPorRangoResumen=filtrarPorRangoResumen;
  }
  if(typeof rsFechaEnRango==='function'){
    rsFechaEnRango=function(fecha){const p=periodo();return fechaOk(fecha)&&fecha>=p.desde&&fecha<=p.hasta;};
    window.rsFechaEnRango=rsFechaEnRango;
  }
  if(typeof fechaHoyResumen==='function'){fechaHoyResumen=function(){return hoyOp();};window.fechaHoyResumen=fechaHoyResumen;}
  if(typeof calcularKPIsPlanta==='function'){
    // Las tarjetas de siempre muestran los mismos valores que la cabecera nueva (una sola definición).
    const anterior=calcularKPIsPlanta;
    calcularKPIsPlanta=function(records){
      const base=anterior.apply(this,arguments);
      try{
        const per=periodo(),a=agregar(filtrarPartes(recolectar(per.desde,per.hasta).partes));
        return Object.assign({},base,{oee:a.oee==null?null:a.oee/100,disponibilidad:a.disponibilidad==null?0:a.disponibilidad/100,
          mermaPct:a.merma==null?0:a.merma/100});
      }catch(_){return base;}
    };
    window.calcularKPIsPlanta=calcularKPIsPlanta;
  }

  /* ---------- tiempo real: se redibuja con los mismos datos que ya se escuchan ---------- */
  let temporizador=null;
  function refrescar(){
    clearTimeout(temporizador);
    temporizador=setTimeout(()=>{
      try{
        if(typeof state==='undefined'||!state.user)return;
        if(state.currentTab==='resumen'&&document.getElementById('rgx'))pintar();
      }catch(e){console.warn('Indicadores del resumen:',e&&e.message||e);}
    },350);
  }
  ['onRecordsUpdated','onProgramacionesUpdated','onPaletasUpdated'].forEach(nombre=>{
    const anterior=globalThis[nombre];
    if(typeof anterior!=='function')return;
    globalThis[nombre]=function(){
      const r=anterior.apply(this,arguments);
      try{if(typeof window.glacialConfigIndicadoresEscuchar==='function')window.glacialConfigIndicadoresEscuchar();}catch(_){/* sin config */}
      refrescar();return r;
    };
  });
  const oyentes=window.glacialConfigIndicadoresOyentes=window.glacialConfigIndicadoresOyentes||[];
  oyentes.push(()=>{indiceDe=null;aplicarMetasAlCodigo();refrescar();});
  setInterval(()=>{
    if(typeof state==='undefined'||!state.user)return;
    if(state.currentTab==='resumen'&&document.getElementById('rgx'))refrescar();     // el reloj del semáforo avanza
  },60000);

  /* =========================================================
     EXCEL: hoja «Indicadores» dentro del Excel general
     ========================================================= */
  function agregarHojaIndicadores(wb,R){
    const ws=wb.addWorksheet('Indicadores');
    const per=R.per;
    ws.addRow(['Indicadores del periodo · '+etiquetaPeriodo(per)]).font={bold:true,size:14};
    ws.addRow(['Turno: '+(F.turno?etiquetaGrupo(F.turno):'todos')+' · Producto: '+(F.producto?(R.productos.get(F.producto)||F.producto):'todos')+
      ' · Desde el '+fmtFecha(FECHA_CAMBIO)+' los periodos pasados usan las definiciones actuales.']);
    ws.addRow([]);
    const cab=(cols)=>{const h=ws.addRow(cols);h.eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1F4E79'}};c.alignment={horizontal:'center',wrapText:true};});};
    cab(['Indicador','Valor','Periodo anterior','Variación','Unidad variación','Meta','Estado']);
    R.kpis.forEach(k=>{
      const prev=R.ap?valorInd(k.ind,R.ap):null,v=k.variacion;
      const m=metasReporte()[k.ind];
      ws.addRow([NOMBRES[k.ind],k.valor==null?'—':+(+k.valor).toFixed(2),prev==null?'—':+(+prev).toFixed(2),v?+v.delta.toFixed(2):'—',v?(v.tipo==='pct'?'%':'pts'):'',
        m?(k.ind==='merma'?'≤ '+m.verde:'≥ '+m.verde):'—',({verde:'Verde',ambar:'Ámbar',roja:'Rojo',gris:'Sin meta / sin dato'})[k.nivel]]);
    });
    ws.addRow(['OEE: calidad no se mide'+(R.a.oee==null?' · falta velocidad estándar':'')+(R.a.cobertura!=null&&R.a.cobertura<99.5?' · parcial '+fmtD(R.a.cobertura,0)+' %':'')]);
    ws.addRow([]);
    const tabla=(titulo,filas)=>{
      ws.addRow([titulo]).font={bold:true};
      cab(['','Producción','Programado','Cumplimiento %','Ratio UND/h','Disponibilidad %','Merma %','Rendimiento %','OEE %']);
      filas.forEach(f=>ws.addRow([f.etiqueta,Math.round(f.a.produccion),Math.round(f.a.programado),f.a.cumplimiento==null?'—':+f.a.cumplimiento.toFixed(2),
        f.a.ratio==null?'—':Math.round(f.a.ratio),f.a.disponibilidad==null?'—':+f.a.disponibilidad.toFixed(2),f.a.merma==null?'—':+f.a.merma.toFixed(2),
        f.a.rendimiento==null?'—':+f.a.rendimiento.toFixed(2),f.a.oee==null?'—':+f.a.oee.toFixed(2)]));
      ws.addRow([]);
    };
    tabla('Por línea',R.porLinea);tabla('Por turno',R.porTurno);tabla('Por producto',R.porProducto);
    ws.addRow(['Merma por componente']).font={bold:true};
    cab(['Componente','Cantidad','Unidad']);
    Object.keys(R.mermaComp).forEach(c=>{const o=R.mermaComp[c];ws.addRow(c==='Polietileno'?[c,+o.peso.toFixed(1),'kg ('+o.unidades.toFixed(2)+' rollos)']:[c,Math.round(o.unidades),'unidades']);});
    ws.addRow([]);
    ws.addRow(['Qué pasó']).font={bold:true};
    R.queFrases.forEach(t=>ws.addRow([t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")]));
    ws.addRow([]);
    ws.addRow(['Datos incompletos o por revisar']).font={bold:true};
    const v=R.avisos,u=x=>nombreLinea(x.linea)+' '+fmtFecha(x.fecha)+' '+etiquetaGrupo(x.grupo);
    if(!v.sinCierre.length&&!v.sinRegistro.length&&!v.sinMotivo&&!v.sinProgramacion.length&&!v.sinVelocidad.size&&!v.discrepancias.length)ws.addRow(['Sin avisos']);
    v.sinCierre.forEach(x=>ws.addRow(['Turno sin cierre',u(x)]));
    v.sinRegistro.forEach(x=>ws.addRow(['Programado sin registro',u(x)]));
    if(v.sinMotivo)ws.addRow(['Paradas sin motivo',v.sinMotivo]);
    v.sinProgramacion.forEach(x=>ws.addRow(['Producción sin programación',u(x)]));
    [...v.sinVelocidad].forEach(x=>ws.addRow(['Falta velocidad estándar',x]));
    v.discrepancias.forEach(d=>ws.addRow([d.tipo+' (>2 %)',u(d),'registro '+Math.round(d.registro),d.fuente+' '+Math.round(d.otro)]));
    ws.addRow([]);
    ws.addRow(['Definiciones']).font={bold:true};
    DEFINICIONES.forEach(([t,x])=>ws.addRow([t,x]));
    [34,16,16,16,16,18,18,16,12].forEach((w,i)=>ws.getColumn(i+1).width=w);
    return ws;
  }
  if(typeof xlgHojaDatos==='function'){
    const anterior=xlgHojaDatos;
    xlgHojaDatos=function(wb,ctx){
      const r=anterior.apply(this,arguments);
      try{agregarHojaIndicadores(wb,calcular());}catch(e){console.warn('Hoja de indicadores:',e&&e.message||e);}
      return r;
    };
    window.xlgHojaDatos=xlgHojaDatos;
  }

  aplicarMetasAlCodigo();
  window.glacialReporteIndicadores={calcular,recolectar,agregar,filtrarPartes,metasReporte,nivel,velocidadEstandar,periodo,variacion,quePaso,
    estado:F,pintar,agregarHojaIndicadores,componenteMerma,FECHA_CAMBIO};
})();
