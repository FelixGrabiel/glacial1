/* =============================================================
   MANTENIMIENTO · INDICADORES POR EQUIPO (MTTR y MTBF) — solo con datos suficientes

   Las métricas por LÍNEA (tiempo medio de reparación y entre fallas) ya existen en Análisis de paradas (47) y NO se tocan ni se atribuyen a equipos. Aquí
   se miden EQUIPOS, solo con identificación fiable, y cada número lleva su período, su número de casos y su fórmula.

   MTTR · tiempo medio de reparación ACTIVA
     = promedio de (fin real − inicio real del trabajo − tiempo en espera) de las fallas elegibles.
     Elegible: intervención CORRECTIVA, CERRADA, con equipo identificado, inicio y fin reales, y resultado distinto de «No operativo» (ese cierre no completó la
     reparación). NO usa apertura → cierre: la espera de repuesto/autorización y el cierre tardío se informan APARTE (espera media, respuesta media y tiempo
     administrativo). La INDISPONIBILIDAD de la línea (tiempo sin producir) es otra medida: sale de las paradas oficiales y no se mezcla aquí.
     Los preventivos, las canceladas y las abiertas NO entran.
   MTBF · tiempo medio entre fallas
     = horas de línea EN MARCHA del período ÷ número de fallas del equipo en días con horas medidas.
     Falla = intervención correctiva con equipo identificado. Varias intervenciones o avisos de la MISMA falla (misma parada u origen y mismo equipo) cuentan UNA vez.
     La exposición es «horas de línea en marcha» (planificado − paradas, según Análisis de paradas): es un SUSTITUTO de las horas de máquina porque no hay un
     contador por equipo; se rotula así y NO son horas calendario ni programadas. Un equipo compartido entre líneas no se calcula (no se sabe qué línea lo usó).
     Sin horas medidas suficientes → «Datos insuficientes» con lo que falta. Sin fallas → «Sin fallas en el período» (nunca 0 ni infinito).
   Las intervenciones SIN equipo identificado se conservan y se cuentan aparte: no inventan un equipo ni entran en métricas específicas.
   Cargar después de 67e-preventivos.js.
   ============================================================= */
(function(){
  'use strict';
  const M=window.GlacialIntervenciones;
  const DIA=86400000,MIN_EXPOSICION_H=8,POCOS_CASOS=3;
  const txt=v=>String(v==null?'':v).trim();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const iso=ms=>{const d=new Date(ms);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
  const media=l=>l.length?l.reduce((s,x)=>s+x,0)/l.length:null;

  /* ---------- núcleo puro ---------- */
  /* intervs: intervenciones (abiertas y cerradas) · o: {desdeMs, hastaMs, equipos:[{id,nombre,linea,compartidoCon,activo}], exposicion(linea,fechaISO)→minutos|null, diaDe(ms)→fechaISO} */
  function calcular(intervs,o){
    const desde=o.desdeMs,hasta=o.hastaMs,diaDe=o.diaDe||iso;
    const equipos=new Map((o.equipos||[]).map(e=>[e.id,e]));
    const res={desdeMs:desde,hastaMs:hasta,porEquipo:[],sinEquipo:[],excluidas:{preventivas:0,canceladas:0,fueraDePeriodo:0},advertencias:[]};
    const grupos=new Map();
    (intervs||[]).forEach(d=>{
      if(d.estado==='CANCELADA'){res.excluidas.canceladas++;return;}
      if(d.tipo!=='CORRECTIVO'){res.excluidas.preventivas++;return;}
      const t=num(d.abiertaMs);
      if(t<desde||t>hasta){res.excluidas.fueraDePeriodo++;return;}
      if(!txt(d.equipoId)){res.sinEquipo.push(d);return;}
      const origen=txt(d.origen&&(d.origen.paradaId||d.origen.id))||d.id;          // misma falla = mismo origen y mismo equipo
      const k=d.equipoId+'|'+origen;
      const g=grupos.get(k)||{equipoId:d.equipoId,linea:d.linea,origen,intervenciones:[]};
      g.intervenciones.push(d);grupos.set(k,g);
    });
    const porEq=new Map();
    grupos.forEach(g=>{
      const lista=g.intervenciones.slice().sort((a,b)=>num(a.abiertaMs)-num(b.abiertaMs));
      g.fechaMs=num(lista[0].abiertaMs);g.dia=diaDe(g.fechaMs);g.deduplicadas=lista.length-1;
      // representante para el MTTR: la última intervención cerrada de esa falla
      const cerradas=lista.filter(d=>d.estado==='CERRADA').sort((a,b)=>num(b.cerradaMs)-num(a.cerradaMs));
      g.rep=cerradas[0]||null;
      const arr=porEq.get(g.equipoId)||[];arr.push(g);porEq.set(g.equipoId,arr);
    });
    const dias=[];for(let t=new Date(diaDe(desde)+'T12:00:00').getTime();t<=hasta+DIA/2;t+=DIA)dias.push(diaDe(t));
    porEq.forEach((fallas,equipoId)=>{
      const eq=equipos.get(equipoId),ref=fallas[0].intervenciones[0];
      const nombre=eq?eq.nombre:(ref.equipoNombre||'Equipo'),linea=eq?eq.linea:ref.linea;
      const compartido=!!(eq&&eq.compartidoCon&&eq.compartidoCon.length);
      const r={equipoId,nombre,linea,compartido,fallas:fallas.length,deduplicadas:fallas.reduce((s,g)=>s+g.deduplicadas,0),casos:[],excluidosMttr:{abiertas:0,noOperativo:0,sinInicioFin:0},
        mttrMin:null,casosMttr:0,esperaMin:null,respuestaMin:null,adminMin:null,pocosCasos:false,mtbf:{estado:'DATOS_INSUFICIENTES',horas:null,motivo:'',exposicionH:0,coberturaDias:0,diasPeriodo:dias.length,fallasCubiertas:0}};
      const trab=[],esp=[],resp=[],adm=[];
      fallas.forEach(g=>{
        const d=g.rep;
        const caso={falla:g,intervencionId:d?d.id:g.intervenciones[0].id,dia:g.dia,mttr:null,motivo:''};
        if(!d){const abierta=g.intervenciones.some(x=>M.estaAbierta(x.estado));caso.motivo=abierta?'Falla aún abierta (no entra al MTTR)':'Sin intervención cerrada';r.excluidosMttr.abiertas++;}
        else if(d.resultado==='NO_OPERATIVO'){caso.motivo='Cierre «No operativo»: la reparación no se completó';r.excluidosMttr.noOperativo++;}
        else{
          const t=M.tiempos(d,null);
          if(!t.completa||t.trabajoMs===null){caso.motivo='Falta el inicio o el fin real del trabajo';r.excluidosMttr.sinInicioFin++;}
          else{caso.mttr=t;trab.push(t.trabajoMs);esp.push(t.esperaMs);if(t.respuestaMs!==null)resp.push(t.respuestaMs);if(t.administrativoMs!==null)adm.push(t.administrativoMs);}
        }
        r.casos.push(caso);
      });
      r.casosMttr=trab.length;
      if(trab.length){r.mttrMin=media(trab)/60000;r.esperaMin=media(esp)/60000;r.respuestaMin=resp.length?media(resp)/60000:null;r.adminMin=adm.length?media(adm)/60000:null;r.pocosCasos=trab.length<POCOS_CASOS;}
      /* MTBF */
      const m=r.mtbf;
      if(compartido){m.motivo='Equipo compartido entre varias líneas: no se sabe qué línea lo usó, no hay una exposición confiable.';}
      else if(typeof o.exposicion!=='function'){m.motivo='No hay una fuente de horas de línea en marcha.';}
      else{
        let minutos=0,cubiertos=new Set();
        dias.forEach(f=>{const x=o.exposicion(linea,f);if(x!==null&&x!==undefined&&x>0){minutos+=x;cubiertos.add(f);}});
        m.exposicionH=minutos/60;m.coberturaDias=cubiertos.size;
        const cub=fallas.filter(g=>cubiertos.has(g.dia));
        m.fallasCubiertas=cub.length;
        if(!cubiertos.size)m.motivo='No hay horas de línea en marcha medidas en el período (faltan programaciones con inicio real).';
        else if(m.exposicionH<MIN_EXPOSICION_H)m.motivo='Solo hay '+m.exposicionH.toFixed(1)+' h de línea en marcha medidas (mínimo '+MIN_EXPOSICION_H+' h).';
        else if(!cub.length){m.estado='SIN_FALLAS';m.motivo=fallas.length?'Las fallas del período ocurrieron en días sin horas de línea medidas.':'Sin fallas en el período: el MTBF no es calculable (no es cero ni infinito).';}
        else{m.estado='OK';m.horas=m.exposicionH/cub.length;m.motivo='';}
      }
      res.porEquipo.push(r);
    });
    res.porEquipo.sort((a,b)=>b.fallas-a.fallas||a.nombre.localeCompare(b.nombre,'es'));
    res.totales={fallas:res.porEquipo.reduce((s,e)=>s+e.fallas,0),sinEquipo:res.sinEquipo.length,equipos:res.porEquipo.length};
    if(res.sinEquipo.length)res.advertencias.push(res.sinEquipo.length+' intervención(es) correctiva(s) sin equipo identificado: se conservan, pero no entran en las métricas de un equipo.');
    return res;
  }
  const fmtMin=m=>m===null||m===undefined?'—':(m>=60?Math.floor(m/60)+' h '+String(Math.round(m%60)).padStart(2,'0')+' min':Math.round(m)+' min');

  window.glacialIndicadoresEquipo={calcular,fmtMin,MIN_EXPOSICION_H,POCOS_CASOS};
  if(typeof document==='undefined'||!window.glacialMantPestanas)return;

  /* =========================================================
     PANTALLA
     ========================================================= */
  const UIM=()=>window.glacialMantUI,API=()=>window.glacialIntervenciones,EQ=()=>window.glacialEquiposMaestro;
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const ST={dias:90,desde:'',hasta:'',cargando:false,error:'',datos:null,historico:null,parcial:false,res:null};
  const fmtDia=ms=>new Date(ms).toLocaleDateString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric'});
  const diaOp=ms=>{try{if(window.GlacialIndicadores&&window.GlacialIndicadores.diaOperativo)return window.GlacialIndicadores.diaOperativo(ms);}catch(_){/* local */}return iso(ms);};

  /* Horas de línea en marcha por línea y día: unidades de Análisis de paradas (planificado − paradas de cada bloque con inicio real). */
  function mapaExposicion(desdeIso,hastaIso){
    const A=window.glacialAnalisisParadas;
    if(!A||typeof A.listarUnidades!=='function')return null;
    let r;try{r=A.listarUnidades(desdeIso,hastaIso,{});}catch(_){return null;}
    const m=new Map();
    (r.unidades||[]).forEach(u=>{const k=u.linea+'|'+u.fecha;m.set(k,(m.get(k)||0)+num(u.enMarcha));});
    return (linea,fecha)=>m.has(linea+'|'+fecha)?m.get(linea+'|'+fecha):null;
  }
  async function cargar(){
    const A=API();ST.cargando=true;ST.error='';pintar();
    try{
      const hasta=ST.hasta?new Date(ST.hasta+'T23:59:59').getTime():ahora();
      const desde=ST.desde?new Date(ST.desde+'T00:00:00').getTime():hasta-ST.dias*DIA;
      const snap=await A.historicoDesde(desde-30*DIA);                     // cerradas del período (y un margen) + abiertas en memoria
      const todas=new Map();snap.docs.forEach(d=>todas.set(d.id,d));A.abiertas().forEach(d=>todas.set(d.id,d));
      ST.parcial=snap.parcial;
      const E=EQ(),exp=mapaExposicion(diaOp(desde),diaOp(hasta));
      ST.res=calcular([...todas.values()],{desdeMs:desde,hastaMs:hasta,equipos:E?E.lista():[],exposicion:exp,diaDe:diaOp});
      ST.res.sinExposicion=!exp;
    }catch(e){ST.error='No se pudieron calcular los indicadores: '+((e&&e.message)||e);ST.res=null;}
    ST.cargando=false;pintar();
  }
  function pintar(){const c=document.getElementById('mi-cuerpo');if(c&&UIM().UI.tab==='indicadores')pintarIndicadores(c,true);}
  function tarjeta(e,ds){
    const m=e.mtbf;
    return '<div class="mi-card" data-ie-abrir="'+esc(e.equipoId)+'" tabindex="0" role="button" style="--c:#0e7490"><h4>'+esc(e.nombre)+' <small style="font-weight:500;color:#5a6b78">· '+esc(UIM().nombreLinea(e.linea))+(e.compartido?' · compartido':'')+'</small></h4>'+
      '<table class="mi-tabla"><tbody>'+
      '<tr><td>Fallas en el período</td><td><b>'+e.fallas+'</b>'+(e.deduplicadas?' <small>('+e.deduplicadas+' aviso(s)/intervención(es) de la misma falla no se cuentan otra vez)</small>':'')+'</td></tr>'+
      '<tr><td>MTTR (reparación activa)</td><td>'+(e.mttrMin===null?'<i>Datos insuficientes</i> <small>(0 casos elegibles de '+e.fallas+')</small>':'<b>'+fmtMin(e.mttrMin)+'</b> <small>· '+e.casosMttr+' caso(s)'+(e.pocosCasos?' · pocos casos':'')+'</small>')+'</td></tr>'+
      (e.mttrMin!==null?'<tr><td>Espera media / respuesta media / administrativo</td><td><small>'+fmtMin(e.esperaMin)+' / '+fmtMin(e.respuestaMin)+' / '+fmtMin(e.adminMin)+'</small></td></tr>':'')+
      '<tr><td>MTBF (horas de línea en marcha)</td><td>'+(m.estado==='OK'?'<b>'+m.horas.toFixed(1)+' h</b> <small>· '+m.fallasCubiertas+' falla(s) · '+m.exposicionH.toFixed(0)+' h de línea en marcha · cobertura '+m.coberturaDias+' de '+m.diasPeriodo+' días</small>'
        :m.estado==='SIN_FALLAS'?'<i>Sin fallas en el período</i> <small>('+m.exposicionH.toFixed(0)+' h de línea en marcha)</small>':'<i>Datos insuficientes</i> <small>— '+esc(m.motivo)+'</small>')+'</td></tr></tbody></table></div>';
  }
  /* Gráficos dinámicos (67i) de los equipos con fallas: cada barra abre el detalle del equipo. */
  function graficosEquipos(r){
    const G=window.glacialGraficos;if(!G)return '';
    const fallas=r.porEquipo.slice().sort((a,b)=>b.fallas-a.fallas).slice(0,8).map(e=>({id:e.equipoId,etiqueta:e.nombre,valor:e.fallas,color:'#d93a3a'}));
    const mttr=r.porEquipo.filter(e=>e.mttrMin!==null&&e.mttrMin!==undefined).sort((a,b)=>b.mttrMin-a.mttrMin).slice(0,8).map(e=>({id:e.equipoId,etiqueta:e.nombre,valor:Math.round(e.mttrMin),sub:e.casosMttr+' caso(s)',color:'#0e7490'}));
    return '<div class="gm-panel" style="padding-top:12px"><div class="gm-grid"><div class="gm-card"><h5>Fallas por equipo</h5>'+G.barrasH(fallas,{grupo:'ie-equipo',unidad:'fallas'})+'</div>'+
      '<div class="gm-card"><h5>MTTR por equipo (min)</h5>'+G.barrasH(mttr,{grupo:'ie-equipo',unidad:'min',vacio:'Aún no hay casos con inicio y fin reales para calcular el MTTR.'})+'</div></div></div>';
  }
  function pintarIndicadores(cont,noCargar){
    const A=API();
    if(!noCargar&&!ST.cargando&&!ST.res&&!ST.error)cargar();
    const r=ST.res;
    cont.innerHTML=
      '<div class="mi-filtros"><label>Período<select data-ie-p><option value="30"'+(ST.dias===30&&!ST.desde?' selected':'')+'>Últimos 30 días</option><option value="90"'+(ST.dias===90&&!ST.desde?' selected':'')+'>Últimos 90 días</option><option value="180"'+(ST.dias===180&&!ST.desde?' selected':'')+'>Últimos 180 días</option></select></label>'+
      '<label>Desde<input type="date" data-ie-d value="'+esc(ST.desde)+'"></label><label>Hasta<input type="date" data-ie-h value="'+esc(ST.hasta)+'"></label></div>'+
      '<div class="mi-acc"><button type="button" class="btn btn-ghost btn-sm" data-ie-recalcular>Actualizar</button></div>'+
      '<details class="mi-aviso"><summary style="cursor:pointer;font-weight:700">¿Cómo se calculan?</summary><div style="margin-top:6px;font-size:13px">'+
        '<b>MTTR</b> = promedio de (fin real − inicio real del trabajo − espera) de fallas correctivas cerradas con equipo identificado e inicio y fin reales; excluye preventivos, canceladas, abiertas y cierres «No operativo». No usa apertura → cierre: la espera, la respuesta y el tiempo administrativo se muestran aparte. La indisponibilidad de la línea es otra medida (paradas oficiales, Análisis de paradas).<br>'+
        '<b>MTBF</b> = horas de línea en marcha ÷ fallas del equipo, solo en días con horas medidas. «Horas de línea en marcha» es un <i>sustituto</i> de las horas de máquina (no hay contador por equipo); no son horas calendario ni programadas. Varios avisos o intervenciones de la misma falla cuentan una vez. Equipos compartidos entre líneas: no se calcula.<br>'+
        'Las métricas por línea siguen en «Análisis de paradas» y no se atribuyen a equipos.</div></details>'+
      (ST.error?'<div class="mi-error">'+esc(ST.error)+'</div>':ST.cargando?'<div class="mi-vacio">Calculando…</div>':!r?'<div class="mi-vacio">Pulsa «Actualizar».</div>':
        '<p class="mi-meta">Período: <b>'+esc(fmtDia(r.desdeMs))+' – '+esc(fmtDia(r.hastaMs))+'</b> · '+r.totales.fallas+' falla(s) con equipo identificado en '+r.totales.equipos+' equipo(s)'+(ST.parcial?' · <b style="color:#8c1d18">datos parciales: se alcanzó el límite de lectura</b>':'')+
          (r.sinExposicion?' · <b style="color:#8c1d18">no hay horas de línea en marcha disponibles (Análisis de paradas no cargado): MTBF no calculable</b>':'')+'</p>'+
        (r.advertencias.map(a=>'<div class="mi-aviso">'+esc(a)+'</div>').join(''))+
        (r.porEquipo.length?graficosEquipos(r)+r.porEquipo.map(e=>tarjeta(e)).join(''):'<div class="mi-vacio"><b>No hay fallas con equipo identificado en este período.</b><br>Los indicadores aparecen cuando las intervenciones correctivas se cierran con el equipo identificado.</div>')+
        (r.sinEquipo.length?'<div class="mi-vacio" style="margin-top:8px"><b>Sin equipo identificado: '+r.sinEquipo.length+'</b> intervención(es). Se conservan en la lista de Intervenciones; no se les asigna ningún equipo.</div>':''));
  }
  function detalleEquipo(id){
    const r=ST.res,e=r&&r.porEquipo.find(x=>x.equipoId===id);if(!e)return;
    UIM().modal('<h3>'+esc(e.nombre)+'</h3><div class="mi-meta">Casos del período (cada falla cuenta una vez).</div><table class="mi-tabla"><thead><tr><th>Fecha</th><th>MTTR</th><th></th></tr></thead><tbody>'+
      e.casos.map(c=>'<tr><td>'+esc(c.dia)+'</td><td>'+(c.mttr?esc(fmtMin(c.mttr.trabajoMs/60000))+' <small>(espera '+esc(fmtMin(c.mttr.esperaMs/60000))+')</small>':'<small>'+esc(c.motivo)+'</small>')+'</td><td><a href="#" data-pv-ir="'+esc(c.intervencionId)+'">ver</a></td></tr>').join('')+'</tbody></table>'+
      '<div class="mi-acc"><button type="button" class="btn btn-ghost" data-mi-cerrar>Cerrar</button></div>');
  }
  document.addEventListener('click',e=>{
    const t=e.target;if(!t||!t.closest)return;
    if(t.closest('[data-ie-recalcular]')){cargar();return;}
    const a=t.closest('[data-ie-abrir]');if(a){detalleEquipo(a.dataset.ieAbrir);return;}
    const gm=t.closest('[data-gm-grupo="ie-equipo"]');if(gm){detalleEquipo(gm.dataset.gmId);return;}
  });
  document.addEventListener('change',e=>{
    const t=e.target;if(!t||!t.dataset)return;
    if(t.dataset.ieP!==undefined){ST.dias=Number(t.value);ST.desde='';ST.hasta='';cargar();}
    if(t.dataset.ieD!==undefined){ST.desde=t.value;cargar();}
    if(t.dataset.ieH!==undefined){ST.hasta=t.value;cargar();}
  });
  window.glacialMantPestanas.push({clave:'indicadores',titulo:'Indicadores',orden:4,pintar:c=>pintarIndicadores(c,false),visible:()=>true});
})();
