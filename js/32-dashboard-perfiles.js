/* =============================================================
   32-dashboard-perfiles.js
   GLACIAL — Centros visuales por perfil
   No duplica registros: consume Records, Programaciones, Paletas
   y los cálculos del Resumen General.
   ============================================================= */

let centroPerfilCharts={};

function cpEsc(v){
  return typeof escaparHtml==='function'?escaparHtml(v??''):String(v??'');
}
function cpNum(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function cpRol(){
  const r=String(state.user?.rol||'').trim().toLowerCase();
  if(r.includes('gerente'))return 'GERENCIA';
  if(r.includes('planific'))return 'PLANIFICACION';
  if(r==='supervisor')return 'SUPERVISOR';
  if(r.includes('venta'))return 'VENTAS';
  if(r.includes('jefe')||r.includes('jefatura'))return 'JEFATURA';
  return 'GENERAL';
}
function cpTitulo(){
  return {
    GERENCIA:'Centro Ejecutivo',
    JEFATURA:'Centro de Control Operativo',
    PLANIFICACION:'Planificación · Plan vs Real',
    SUPERVISOR:'Mi Turno',
    VENTAS:'Avance de Producción',
    GENERAL:'Centro de Producción'
  }[cpRol()];
}
function cpCtx(){
  try{
    const c=typeof contextoTurnoUsuario==='function'?contextoTurnoUsuario(state.user,new Date()):null;
    if(c)return c;
  }catch(_){}
  return {turno:'',horarioInicio:'',horarioFin:'',fechaOperativa:
    typeof fechaHoyResumen==='function'?fechaHoyResumen():new Date().toISOString().slice(0,10)};
}
function cpRecordsHoy(){
  const ctx=cpCtx(),fecha=ctx.fechaOperativa||new Date().toISOString().slice(0,10);
  const all=typeof loadRecords==='function'?loadRecords():[];
  return (all||[]).filter(r=>r.fecha===fecha);
}
function cpData(){
  const rec=cpRecordsHoy();
  if(typeof rsDatosIndustriales==='function')return rsDatosIndustriales(rec);
  return {porLinea:[],pareto:[],tendencia:[]};
}
function cpEstados(){
  return typeof rsEstadoLineas==='function'?rsEstadoLineas():[];
}
function cpDestroy(){
  Object.values(centroPerfilCharts).forEach(c=>{try{c.destroy();}catch(_){}});
  centroPerfilCharts={};
}
function cpChart(id,cfg){
  const el=document.getElementById(id);
  if(!el||typeof Chart==='undefined')return;
  centroPerfilCharts[id]=new Chart(el,cfg);
}
function cpNombreLinea(k){
  return typeof rsLineaNombre==='function'?rsLineaNombre(k):k;
}
function cpFmt(v){return Math.round(cpNum(v)).toLocaleString('es-PE');}
function cpPct(v){return Number.isFinite(v)?(v*100).toFixed(1)+'%':'—';}
function cpIr(tab){
  const mapa={
    resumen:'goResumen',
    produccion:'goProduccionActual',
    avance:'goAvanceProduccion',
    tareo:'goTareo',
    perdidas:'goPerdidasSoles'
  };
  const f=window[mapa[tab]];
  if(typeof f==='function')f();
}
function cpHead(){
  const ctx=cpCtx();
  const fecha=ctx.fechaOperativa||new Date().toISOString().slice(0,10);
  const turno=ctx.turno||state.user?.turnoOperativo||'Vista general';
  const horario=ctx.horarioInicio&&ctx.horarioFin?`${ctx.horarioInicio} → ${ctx.horarioFin}`:'';
  return `<header class="cp-head">
    <div><div class="cp-eyebrow">GLACIAL · ${cpRol()}</div>
      <h2>${cpTitulo()}</h2>
      <p>${cpEsc(fecha)} · ${cpEsc(turno)} ${horario?'· '+cpEsc(horario):''}</p></div>
    <div class="cp-user"><span>Vista</span><b>${cpEsc(state.user?.nombre||state.user?.username||'Usuario')}</b></div>
  </header>`;
}
function cpStatus(estados){
  return `<section class="cp-status"><div class="cp-section-title">Estado actual de planta</div>
    <div class="cp-status-grid">${estados.map(e=>`<article>
      <b>${cpNombreLinea(e.linea)}</b>
      <span><i class="${e.nivel||'off'}"></i>${cpEsc(e.estado)}</span>
    </article>`).join('')||'<p class="cp-muted">Sin estado operativo disponible.</p>'}</div></section>`;
}
function cpKpis(data){
  const p=data.porLinea||[];
  const prod=p.reduce((a,x)=>a+cpNum(x.producido),0);
  const prog=p.reduce((a,x)=>a+cpNum(x.programado),0);
  const stop=p.reduce((a,x)=>a+cpNum(x.minParadas),0);
  const ef=p.reduce((a,x)=>a+cpNum(x.minEfectivos),0)/60;
  const activas=p.filter(x=>x.producido>0).length;
  return `<div class="cp-kpis">
    <article><span>Producción</span><b>${cpFmt(prod)}</b><small>acumulado visible</small></article>
    <article><span>Cumplimiento</span><b>${prog?cpPct(prod/prog):'—'}</b><small>producido / programado</small></article>
    <article><span>Paradas</span><b>${cpFmt(stop)} min</b><small>acumuladas</small></article>
    <article><span>Horas efectivas</span><b>${ef.toFixed(1)} h</b><small>tiempo − paradas</small></article>
    <article><span>Líneas con producción</span><b>${activas}</b><small>del período</small></article>
  </div>`;
}
function cpAcciones(rol){
  const defs={
    GERENCIA:[['Resumen ejecutivo','resumen'],['Impacto económico','perdidas'],['Producción actual','produccion']],
    JEFATURA:[['Producción actual','produccion'],['Resumen general','resumen'],['Avance y cierre','avance'],['Impacto económico','perdidas']],
    PLANIFICACION:[['Producción actual','produccion'],['Resumen general','resumen']],
    SUPERVISOR:[['Nuevo registro','nuevo'],['Registrar paletas','paletas'],['Avance y cierre','avance'],['Tareo','tareo']],
    VENTAS:[['Producción actual','produccion'],['Resumen general','resumen']],
    GENERAL:[['Resumen general','resumen'],['Producción actual','produccion']]
  }[rol]||[];
  return `<div class="cp-actions">${defs.map(([t,k])=>{
    if(k==='nuevo')return `<button onclick="state.currentTab='nuevo';renderSidebar();renderMain()">${t}</button>`;
    if(k==='paletas')return `<button onclick="state.currentTab='paletas';renderSidebar();renderMain()">${t}</button>`;
    return `<button onclick="cpIr('${k}')">${t}</button>`;
  }).join('')}</div>`;
}
function cpGerencia(data){
  const insight=typeof rsInsight==='function'?rsInsight(data):[];
  return `${cpKpis(data)}
    <div class="cp-grid">
      <section class="cp-card"><h3>Cumplimiento del plan</h3><div class="cp-canvas"><canvas id="cp-cumpl"></canvas></div></section>
      <section class="cp-card"><h3>Ratio Turno vs nominal</h3><div class="cp-canvas"><canvas id="cp-ratio"></canvas></div></section>
      <section class="cp-card wide"><h3>Principales causas de parada</h3><div class="cp-canvas"><canvas id="cp-pareto"></canvas></div></section>
    </div>
    <section class="cp-read"><h3>Lectura ejecutiva</h3><ul>${insight.map(x=>`<li>${cpEsc(x)}</li>`).join('')}</ul></section>`;
}
function cpJefatura(data){
  return `${cpKpis(data)}
    <div class="cp-lines">${data.porLinea.map(x=>{
      const pct=x.programado?Math.min(100,x.producido/x.programado*100):0;
      return `<article class="cp-line-card"><div class="cp-line-head"><h3>${cpNombreLinea(x.linea)}</h3>
        <b>${x.programado?cpPct(x.producido/x.programado):'Sin plan'}</b></div>
        <div class="cp-progress"><span style="width:${pct}%"></span></div>
        <div class="cp-line-stats">
          <span>Programado <b>${cpFmt(x.programado)}</b></span>
          <span>Producido <b>${cpFmt(x.producido)}</b></span>
          <span>Ratio turno <b>${cpFmt(x.ratio)}</b></span>
          <span>Paradas <b>${cpFmt(x.minParadas)} min</b></span>
          <span>Personal <b>${x.personal||'—'}</b></span>
        </div></article>`;
    }).join('')||'<p class="cp-muted">Sin datos de línea para el turno.</p>'}</div>
    <section class="cp-card"><h3>Requiere atención</h3><div class="cp-alerts">${
      data.porLinea.filter(x=>x.minParadas||x.programado>x.producido).map(x=>{
        const pend=Math.max(0,x.programado-x.producido);
        return `<div><b>${cpNombreLinea(x.linea)}</b><span>${x.minParadas?cpFmt(x.minParadas)+' min de parada':''}${x.minParadas&&pend?' · ':''}${pend?cpFmt(pend)+' pendientes':''}</span></div>`;
      }).join('')||'<div><b>Sin pendientes calculables</b><span>No hay alertas basadas en los datos visibles.</span></div>'
    }</div></section>`;
}
function cpPlanificacion(data){
  return `${cpKpis(data)}
    <section class="cp-card"><h3>Plan vs real por línea</h3>
      <div class="cp-plan-table"><div class="head"><span>Línea</span><span>Programado</span><span>Producido</span><span>Pendiente</span><span>Cumpl.</span></div>
      ${data.porLinea.map(x=>`<div><b>${cpNombreLinea(x.linea)}</b><span>${cpFmt(x.programado)}</span><span>${cpFmt(x.producido)}</span><span>${cpFmt(Math.max(0,x.programado-x.producido))}</span><strong>${x.programado?cpPct(x.producido/x.programado):'—'}</strong></div>`).join('')}</div>
    </section>
    <section class="cp-card"><h3>Avance del plan</h3><div class="cp-canvas"><canvas id="cp-plan"></canvas></div></section>`;
}
function cpSupervisor(data){
  const ctx=cpCtx();
  return `<section class="cp-shift"><div><span>Turno operativo</span><b>${cpEsc(ctx.turno||'Sin asignación')}</b><small>${cpEsc(ctx.horarioInicio||'')} ${ctx.horarioFin?'→ '+cpEsc(ctx.horarioFin):''}</small></div>
    <div><span>Fecha operativa</span><b>${cpEsc(ctx.fechaOperativa||'—')}</b><small>Rotación / configuración vigente</small></div></section>
    ${cpAcciones('SUPERVISOR')}
    ${cpStatus(cpEstados())}
    ${cpKpis(data)}`;
}
function cpVentas(data){
  return `<div class="cp-sales">${data.porLinea.map(x=>{
    const pct=x.programado?Math.min(100,x.producido/x.programado*100):0;
    return `<article><div><h3>${cpNombreLinea(x.linea)}</h3><strong>${x.programado?cpPct(x.producido/x.programado):'Sin programación'}</strong></div>
      <div class="cp-progress"><span style="width:${pct}%"></span></div>
      <dl><dt>Programado</dt><dd>${cpFmt(x.programado)}</dd><dt>Producido</dt><dd>${cpFmt(x.producido)}</dd><dt>Pendiente</dt><dd>${cpFmt(Math.max(0,x.programado-x.producido))}</dd></dl></article>`;
  }).join('')||'<p class="cp-muted">Sin producción visible hoy.</p>'}</div>`;
}
function cpGraficos(rol,data){
  const labels=data.porLinea.map(x=>cpNombreLinea(x.linea));
  const base={responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true}}};
  if(rol==='GERENCIA'){
    cpChart('cp-cumpl',{type:'bar',data:{labels,datasets:[{label:'Cumplimiento %',data:data.porLinea.map(x=>x.programado?+(x.producido/x.programado*100).toFixed(1):0)}]},options:{...base,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,suggestedMax:100,ticks:{callback:v=>v+'%'}}}}});
    cpChart('cp-ratio',{type:'bar',data:{labels,datasets:[{label:'Nominal',data:data.porLinea.map(x=>x.nominal)},{label:'Ratio Turno',data:data.porLinea.map(x=>x.ratio)}]},options:base});
    let a=0,t=data.pareto.reduce((s,x)=>s+x.minutos,0);
    cpChart('cp-pareto',{data:{labels:data.pareto.map(x=>x.descripcion),datasets:[{type:'bar',label:'Minutos',data:data.pareto.map(x=>x.minutos),yAxisID:'y'},{type:'line',label:'% acumulado',data:data.pareto.map(x=>t?+(a+=x.minutos,a/t*100).toFixed(1):0),yAxisID:'y1'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true},y1:{beginAtZero:true,max:100,position:'right',grid:{drawOnChartArea:false},ticks:{callback:v=>v+'%'}}}}});
  }
  if(rol==='PLANIFICACION'){
    cpChart('cp-plan',{type:'bar',data:{labels,datasets:[{label:'Programado',data:data.porLinea.map(x=>x.programado)},{label:'Producido',data:data.porLinea.map(x=>x.producido)}]},options:base});
  }
}
function renderCentroPerfil(main){
  cpDestroy();
  const rol=cpRol(),data=cpData(),estados=cpEstados();
  main.innerHTML=`<section class="cp-shell">
    <style>
      .cp-shell{--cp-ink:#16384d;--cp-soft:#6d7f8a;--cp-line:#dce6eb;--cp-bg:#f5f8fa;max-width:1380px;margin:auto}
      .cp-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;padding:8px 2px 18px;border-bottom:1px solid var(--cp-line);margin-bottom:16px}.cp-head h2{margin:3px 0;font-size:28px;color:var(--cp-ink)}.cp-head p{margin:0;color:var(--cp-soft);font-size:12px}.cp-eyebrow{font-size:10px;font-weight:800;letter-spacing:.16em;color:#3979a6}.cp-user{text-align:right}.cp-user span{display:block;font-size:10px;color:var(--cp-soft);text-transform:uppercase}.cp-user b{color:var(--cp-ink)}
      .cp-actions{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}.cp-actions button{border:1px solid #cbdbe4;background:#fff;color:#245c80;border-radius:8px;padding:9px 13px;font-weight:700;cursor:pointer}
      .cp-status,.cp-card,.cp-read,.cp-shift{background:#fff;border:1px solid var(--cp-line);border-radius:11px;padding:14px;margin-bottom:12px}.cp-section-title,.cp-card h3,.cp-read h3{font-size:13px;color:var(--cp-ink);margin:0 0 10px}.cp-status-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.cp-status article{border:1px solid #e7edf1;border-radius:8px;padding:9px}.cp-status article b{display:block;font-size:12px;color:var(--cp-ink);margin-bottom:5px}.cp-status article span{font-size:10px;color:var(--cp-soft);font-weight:700}.cp-status i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#aab7bf;margin-right:5px}.cp-status i.run{background:#2e8b57}.cp-status i.stop{background:#c4472b}.cp-status i.pause{background:#d89216}.cp-status i.done{background:#5a9fd6}
      .cp-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;margin-bottom:12px}.cp-kpis article{background:#fff;border:1px solid var(--cp-line);border-radius:10px;padding:13px}.cp-kpis span{font-size:9px;text-transform:uppercase;font-weight:800;color:var(--cp-soft)}.cp-kpis b{display:block;font-size:21px;color:var(--cp-ink);margin:4px 0}.cp-kpis small{font-size:10px;color:#89969e}
      .cp-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.cp-card.wide{grid-column:1/-1}.cp-canvas{height:260px;position:relative}.cp-read ul{margin:0;padding-left:18px}.cp-read li{margin:5px 0;font-size:12px;color:#405966}
      .cp-lines{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:12px}.cp-line-card{background:#fff;border:1px solid var(--cp-line);border-radius:10px;padding:13px}.cp-line-head{display:flex;justify-content:space-between;align-items:center}.cp-line-head h3{margin:0;color:var(--cp-ink)}.cp-line-head>b{color:#3979a6}.cp-progress{height:8px;background:#eaf0f4;border-radius:999px;overflow:hidden;margin:10px 0}.cp-progress span{display:block;height:100%;background:#3979a6;border-radius:inherit}.cp-line-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.cp-line-stats span{font-size:10px;color:var(--cp-soft)}.cp-line-stats b{display:block;color:var(--cp-ink);font-size:12px;margin-top:2px}.cp-alerts>div{display:flex;justify-content:space-between;gap:10px;border-top:1px solid #edf1f3;padding:9px 0;font-size:11px}.cp-alerts>div:first-child{border-top:0}.cp-alerts span{color:var(--cp-soft)}
      .cp-plan-table>div{display:grid;grid-template-columns:1.3fr repeat(4,1fr);gap:8px;padding:9px;border-top:1px solid #edf1f3;font-size:11px}.cp-plan-table .head{background:#f7fafb;border-radius:7px;border:0;color:var(--cp-soft);font-weight:800}.cp-plan-table strong{color:#245c80}
      .cp-shift{display:grid;grid-template-columns:1fr 1fr;gap:12px}.cp-shift span,.cp-shift small{display:block;color:var(--cp-soft);font-size:10px}.cp-shift b{display:block;color:var(--cp-ink);font-size:20px;margin:3px 0}
      .cp-sales{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.cp-sales article{background:#fff;border:1px solid var(--cp-line);border-radius:11px;padding:14px}.cp-sales article>div:first-child{display:flex;justify-content:space-between}.cp-sales h3{margin:0;color:var(--cp-ink)}.cp-sales strong{color:#3979a6}.cp-sales dl{display:grid;grid-template-columns:1fr auto;gap:5px;margin:0;font-size:11px}.cp-sales dt{color:var(--cp-soft)}.cp-sales dd{margin:0;font-weight:800;color:var(--cp-ink)}
      .cp-muted{color:var(--cp-soft);font-size:12px}
      @media(max-width:900px){.cp-status-grid,.cp-kpis{grid-template-columns:repeat(2,1fr)}.cp-grid,.cp-lines,.cp-sales{grid-template-columns:1fr}.cp-card.wide{grid-column:auto}.cp-line-stats{grid-template-columns:repeat(2,1fr)}}@media(max-width:520px){.cp-status-grid,.cp-kpis,.cp-shift{grid-template-columns:1fr}.cp-head{align-items:flex-start}.cp-user{text-align:left}}
    </style>
    ${cpHead()}
    ${rol!=='SUPERVISOR'?cpAcciones(rol):''}
    ${rol!=='SUPERVISOR'?cpStatus(estados):''}
    <div id="cp-body">${
      rol==='GERENCIA'?cpGerencia(data):
      rol==='JEFATURA'?cpJefatura(data):
      rol==='PLANIFICACION'?cpPlanificacion(data):
      rol==='SUPERVISOR'?cpSupervisor(data):
      rol==='VENTAS'?cpVentas(data):
      cpGerencia(data)
    }</div>
  </section>`;
  cpGraficos(rol,data);
}

window.renderCentroPerfil=renderCentroPerfil;
window.abrirCentroPerfil=window.abrirCentroPerfil||function(){
  state.showWelcome=false;state.currentTab='centro-perfil';renderSidebar();renderMain();
};
window.cpIr=cpIr;
