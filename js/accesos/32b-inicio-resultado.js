/* =========================================================
   INICIO EJECUTIVO · «RESULTADO DE LA PLANTA»
   Tres tarjetas entre Planta de Agua y Planta de Hielo:
     1) Producción contra la meta   → cumplimiento del día y del mes (misma fórmula de Reportes: producido ÷ programado, sin canceladas)
     2) Merma y pérdidas            → merma del día y del mes y los tipos que más pesan (Registro de producción)
     3) Mantenimiento · esta semana → preventivos hechos, vencidos y la máquina con más paradas
   No consulta nada nuevo: usa lo que Reportes (49) y Mantenimiento (68/79) ya tienen escuchando.
   El consumo de insumos del Asistente se suma cuando exista el primer conteo físico (hoy no hay saldos con qué conciliar).
   Cargar después de 49-resumen-indicadores.js y 68-mantenimiento-inicio.js (se llama al pintar, no al cargar).
   ========================================================= */
(function(){
  'use strict';
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>Number(n||0).toLocaleString('es-PE',{maximumFractionDigits:0});
  const pct=v=>v===null||v===undefined||!Number.isFinite(v)?'—':(Math.round(v*10)/10).toLocaleString('es-PE',{maximumFractionDigits:1})+' %';
  const RI=()=>window.glacialReporteIndicadores||null;

  /* Periodo = desde el día 1 del mes de la fecha elegida hasta esa fecha. Devuelve null si Reportes no está o falla. */
  function medir(desde,hasta){
    const R=RI();if(!R||typeof R.recolectar!=='function'||typeof R.agregar!=='function')return null;
    try{const partes=R.filtrarPartes?R.filtrarPartes(R.recolectar(desde,hasta).partes):R.recolectar(desde,hasta).partes;return {a:R.agregar(partes),partes};}
    catch(e){console.warn('Inicio · resultado de la planta:',e&&e.message||e);return null;}
  }
  const nivel=(ind,v)=>{const R=RI();try{return R&&R.nivel?R.nivel(ind,v):'gris';}catch(_){return 'gris';}};
  const color={verde:'#13814a',ambar:'#b86e00',roja:'#c62828',gris:'#5d7283'};
  const barra=(v,n)=>'<div class="rs-bar"><i style="width:'+Math.max(0,Math.min(100,Number.isFinite(v)?v:0)).toFixed(0)+'%;background:'+color[n||'gris']+'"></i></div>';
  const fila=(a,b,cls)=>'<div class="rs-row"><span>'+a+'</span><span'+(cls?' class="'+cls+'"':'')+'>'+b+'</span></div>';

  function tarjetaProduccion(fecha,dia,mes,ayer){
    if(!dia||!mes)return '<div class="rs-card"><h3>Producción contra la meta</h3><div class="rs-sub">Reportes todavía no está listo.</div></div>';
    const cd=dia.a.cumplimiento,cm=mes.a.cumplimiento,ca=ayer&&ayer.a?ayer.a.cumplimiento:null;
    let vs='<span class="rs-mut">sin dato de ayer</span>';
    if(cd!==null&&cd!==undefined&&ca!==null&&ca!==undefined){const d=Math.round((cd-ca)*10)/10;vs='<span class="'+(d>=0?'rs-ok':'rs-mal')+'">'+(d>=0?'▲ ':'▼ ')+Math.abs(d).toLocaleString('es-PE')+' pts vs ayer</span>';}
    return '<div class="rs-card"><h3>Producción contra la meta</h3>'+
      '<div class="rs-big" style="color:'+color[nivel('cumplimiento',cd)]+'">'+pct(cd)+' <small>del día</small></div>'+barra(cd,nivel('cumplimiento',cd))+
      fila('Hoy: '+fmt(dia.a.producidoProg)+' de '+fmt(dia.a.programado)+' UND',vs)+
      fila('Mes: '+fmt(mes.a.producidoProg)+' de '+fmt(mes.a.programado)+' UND',pct(cm),'rs-b')+barra(cm,nivel('cumplimiento',cm))+
      '<div class="rs-nota">Contra lo programado hasta '+esc(fecha.split('-').reverse().join('/'))+', líneas en UND y sin canceladas (igual que Reportes).</div></div>';
  }

  function tarjetaMerma(dia,mes){
    if(!dia||!mes)return '<div class="rs-card"><h3>Merma y pérdidas</h3><div class="rs-sub">Reportes todavía no está listo.</div></div>';
    const tipos=new Map();
    mes.partes.forEach(p=>Object.keys(p.mermas||{}).forEach(c=>{const o=p.mermas[c]||{};tipos.set(c,(tipos.get(c)||0)+(Number(o.unidades)||0));}));
    const top=[...tipos.entries()].filter(x=>x[1]>0).sort((x,y)=>y[1]-x[1]).slice(0,3);
    const md=dia.a.merma,mm=mes.a.merma;
    return '<div class="rs-card"><h3>Merma y pérdidas</h3>'+
      '<div class="rs-big" style="color:'+color[nivel('merma',md)]+'">'+pct(md)+' <small>merma del día</small></div>'+
      fila('Hoy: '+fmt(dia.a.mermaUnidades)+' UND de merma','')+
      fila('Mes: '+fmt(mes.a.mermaUnidades)+' UND',pct(mm),'rs-b')+
      (top.length?'<div class="rs-sub">Lo que más pesa en el mes</div>'+top.map(t=>fila(esc(t[0].charAt(0).toUpperCase()+t[0].slice(1)),fmt(t[1])+' UND')).join(''):'<div class="rs-sub">Sin merma registrada en el mes.</div>')+
      '<div class="rs-nota">Sale del Registro de producción. La desviación de insumos se suma cuando haya primer conteo físico.</div></div>';
  }

  function tarjetaMantenimiento(){
    const M=window.glacialMantInicio;
    if(!M||typeof M.situacionSemana!=='function')return '';
    let x=null;try{x=M.situacionSemana();}catch(_){x=null;}
    if(x===null)return '';                                         // sin acceso al plan de Mantenimiento: la tarjeta no se muestra
    if(x.estado==='cargando')return '<div class="rs-card"><h3>Mantenimiento · esta semana</h3><div class="rs-sub">Leyendo el plan y el Registro…</div></div>';
    if(x.estado==='error')return '<div class="rs-card"><h3>Mantenimiento · esta semana</h3><div class="rs-sub">No se pudo leer el plan.</div></div>';
    const s=x.s;if(!s)return '';
    const P=window.glacialMttoParadas;let top=null,rep=[];
    try{if(P){const t=P.topPorMinutos(1);top=t&&t[0]&&t[0].fallas>0?t[0]:null;rep=P.repetitivas()||[];}}catch(_){top=null;}
    const n=s.pct===null||s.pct===undefined?null:s.pct;
    return '<div class="rs-card"><h3>Mantenimiento · semana '+esc(s.actual&&s.actual.semana)+'</h3>'+
      fila('Preventivos realizados',s.hechas+' de '+s.toca.actividades,s.hechas>=s.toca.actividades&&s.toca.actividades>0?'rs-ok':'rs-b')+barra(n===null?0:n,n===null?'gris':n>=80?'verde':n>=50?'ambar':'roja')+
      fila('Vencidos',String(s.vencidas),s.vencidas?'rs-mal':'rs-ok')+
      fila('«No se realizó» pendientes',String(s.pendientes),s.pendientes?'rs-aten':'')+
      fila('Fallas repetitivas',String(rep.length),rep.length?'rs-mal':'')+
      (top?fila('Más paradas (últimos '+(P.DIAS_VENTANA||'')+' días)',esc(top.maquina.nombre)+' · '+top.fallas):'')+
      '<div class="rs-nota"><button type="button" class="rs-link" onclick="window.goProgramaSemanalMtto&&window.goProgramaSemanalMtto()">Abrir el Programa semanal →</button></div></div>';
  }

  function estilos(){return '<style>'+
    '.rs-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px;margin-bottom:16px;align-items:start}'+
    '.rs-card{background:#fff;border:1px solid var(--cp-line,#d9e5ee);border-radius:14px;box-shadow:0 3px 12px rgba(17,57,91,.055);padding:14px 16px}'+
    '.rs-card h3{margin:0 0 6px;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#033350}'+
    '.rs-big{font-size:28px;font-weight:800;line-height:1.15;margin:2px 0 4px}.rs-big small{font-size:12px;font-weight:600;color:#5d7283}'+
    '.rs-row{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:5px 0;border-bottom:1px solid #eef3f7}.rs-row:last-of-type{border:0}.rs-row span:last-child{font-weight:700;text-align:right}'+
    '.rs-bar{height:7px;border-radius:99px;background:#e4ecf3;overflow:hidden;margin:3px 0 4px}.rs-bar i{display:block;height:100%;border-radius:99px}'+
    '.rs-sub{margin:8px 0 2px;color:#5d7283;font-size:12px}.rs-nota{margin-top:8px;color:#6b8193;font-size:11.5px}.rs-mut{color:#6b8193;font-weight:500}'+
    '.rs-ok{color:#13814a}.rs-mal{color:#c62828}.rs-aten{color:#b86e00}.rs-b{color:#033350}'+
    '.rs-link{border:0;background:none;color:#0877A6;font-weight:700;cursor:pointer;padding:6px 0;min-height:44px;font-size:12.5px}'+
    '</style>';}

  /* fecha: día elegido en el Inicio (AAAA-MM-DD). */
  function html(fecha){
    const R=RI();if(!R||!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha||'')))return '';
    const ini=fecha.slice(0,8)+'01',ayer=R.addDias?R.addDias(fecha,-1):null;
    const dia=medir(fecha,fecha),mes=medir(ini,fecha),prev=ayer?medir(ayer,ayer):null;
    return estilos()+'<div class="cp-planta-tit cp-pt-res"><h2><i aria-hidden="true"></i>RESULTADO DE LA PLANTA</h2><p>Producción, merma y mantenimiento en una sola mirada.</p></div>'+
      '<div class="rs-grid" id="cp-resultado">'+tarjetaProduccion(fecha,dia,mes,prev)+tarjetaMerma(dia,mes)+tarjetaMantenimiento()+'</div>';
  }
  window.glacialInicioResultado={html,medir};
})();
