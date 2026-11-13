/* =============================================================
   MANTENIMIENTO · INICIO (pantalla de entrada del módulo, ordenada por tareas)
   -------------------------------------------------------------
   Antes cada pantalla de Mantenimiento tenía su botón suelto en el menú. Esta pantalla las reúne en tarjetas agrupadas por lo que la
   persona quiere hacer: lo de hoy, el trabajo diario, el análisis y los datos de las máquinas. NO cambia ninguna pantalla existente ni
   sus permisos: cada tarjeta solo aparece si el botón correspondiente del menú está disponible para ese usuario, y abre la misma pantalla.
   También ordena el grupo «Mantenimiento» del menú lateral (Inicio primero) y muestra los avisos de hoy (paradas y mantenimiento).
   Cargar DESPUÉS de 43, 47, 52b, 67c–67h y 69 (velocidades).
   ============================================================= */
(function(){
  'use strict';
  const TAB='mant-inicio',BOTON='btn-mant-inicio';
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* Cada tarjeta: botón del menú que decide si se muestra (permiso), qué abre y cómo se explica. */
  const GRUPOS=[
    {titulo:'Lo de hoy y el trabajo diario',subtitulo:'Lo que se usa todos los turnos.',color:'#065F86',tarjetas:[
      {boton:'btn-intervenciones',icono:'🛠',titulo:'Intervenciones',desc:'Registrar y seguir reparaciones y mantenimientos: pendientes, en espera y cerradas.',abrir:()=>window.goIntervenciones&&window.goIntervenciones()},
      {boton:'btn-bitacora-mtto',icono:'📒',titulo:'Bitácora de Mantenimiento',desc:'Todas las paradas por día y línea, con su motivo, equipo y quién las atendió.',abrir:()=>window.goBitacoraMtto&&window.goBitacoraMtto()},
      {boton:'btn-intervenciones',icono:'🗓',titulo:'Preventivos',desc:'Planes de mantenimiento por calendario: próximos, de hoy y vencidos.',abrir:()=>window.intervencionesAbrir&&window.intervencionesAbrir({tab:'preventivos'})},
      {boton:'btn-plan-anual-mtto',icono:'📅',titulo:'Plan anual de mantenimiento',desc:'Actividades de cada máquina de la Planta de Agua por semana del año, igual que el Excel PLAN-PROGRAMA MTTO.',abrir:()=>window.goPlanAnualMtto&&window.goPlanAnualMtto()},
      {boton:'btn-programa-semanal-mtto',icono:'🗓️',titulo:'Programa semanal de mantenimiento',desc:'Qué actividades toca cada semana en cada máquina, con avance y estado en vivo. Reemplaza al botón BUSCAR del Excel.',abrir:()=>window.goProgramaSemanalMtto&&window.goProgramaSemanalMtto()},
      {boton:'btn-historial-mtto',icono:'🗂️',titulo:'Historial de registros de mantenimiento',desc:'Los registros CFA-CA-F-023 de cada máquina y semana: filtrar, revisar su estado y reimprimirlos.',abrir:()=>window.goHistorialMtto&&window.goHistorialMtto()},
      {boton:'btn-mantenimiento',icono:'👷',titulo:'Tareo de mantenimiento',desc:'Asistencia y horas del personal técnico.',abrir:()=>typeof goMantenimiento==='function'&&goMantenimiento()}
    ]},
    {titulo:'Análisis',subtitulo:'Para entender dónde se pierde tiempo.',color:'#7a3fb0',tarjetas:[
      {boton:'btn-analisis-paradas',icono:'📊',titulo:'Análisis de paradas',desc:'Qué causas y qué equipos paran más las líneas, con minutos y unidades perdidas.',abrir:()=>window.goAnalisisParadas&&window.goAnalisisParadas()},
      {boton:'btn-intervenciones',icono:'⏱',titulo:'Indicadores por equipo',desc:'Tiempo medio de reparación (MTTR) y entre fallas (MTBF) de cada máquina.',abrir:()=>window.intervencionesAbrir&&window.intervencionesAbrir({tab:'indicadores'})},
      {boton:'btn-intervenciones',icono:'🗄️',titulo:'Banco de paradas',desc:'Paradas sin clasificar y ya reclasificadas, en una lista para consultar y descargar.',abrir:()=>window.intervencionesAbrir&&window.intervencionesAbrir({tab:'banco-paradas'})},
      {boton:'btn-intervenciones',icono:'🔁',titulo:'Reclasificar paradas',desc:'Corregir la causa o el equipo de una parada ya registrada.',abrir:()=>window.intervencionesAbrir&&window.intervencionesAbrir({tab:'reclasificar'})}
    ]},
    {titulo:'Máquinas y datos de referencia',subtitulo:'Lo que se configura pocas veces y alimenta el resto del sistema.',color:'#1a7f4b',tarjetas:[
      {boton:'btn-intervenciones',icono:'⚙️',titulo:'Equipos',desc:'Catálogo de máquinas de cada línea: marca, modelo, serie y estado.',abrir:()=>window.intervencionesAbrir&&window.intervencionesAbrir({tab:'equipos'})},
      {boton:'btn-velocidades',icono:'🚀',titulo:'Velocidades estándar',desc:'Unidades por hora de cada línea y formato. Base del rendimiento y del OEE; guarda el historial de cambios.',abrir:()=>window.goVelocidadesEstandar&&window.goVelocidadesEstandar()},
      {boton:'btn-productos-parametros',icono:'📦',titulo:'Productos y parámetros',desc:'Catálogo de productos, unidades por paleta, tiempos de cambio y paradas previstas.',abrir:()=>typeof goProductosParametros==='function'&&goProductosParametros()}
    ]}
  ];
  const ABRIR=[];            // las funciones abrir() de las tarjetas pintadas (se llaman por número)

  const visible=id=>{const b=document.getElementById(id);return !!b&&!b.hidden&&b.style.display!=='none';};
  const botonesDelGrupo=()=>['btn-intervenciones','btn-bitacora-mtto','btn-analisis-paradas','btn-velocidades','btn-productos-parametros','btn-mantenimiento','btn-plan-anual-mtto','btn-programa-semanal-mtto','btn-historial-mtto'];
  const hayAcceso=()=>botonesDelGrupo().some(visible);

  /* El menú lateral de Mantenimiento muestra solo «Inicio»: lo demás se abre desde las tarjetas. Los botones siguen existiendo (ocultos por CSS) porque su visibilidad decide qué tarjetas se ven. */
  if(!document.getElementById('mi-menu-css')){
    const m=document.createElement('style');m.id='mi-menu-css';
    m.textContent='#sidebar-panel-mantenimiento .sidebar-subaction:not(#btn-mant-inicio){display:none!important}';
    document.head.appendChild(m);
  }

  function estilos(){
    if(document.getElementById('mi-inicio-css'))return;
    const s=document.createElement('style');s.id='mi-inicio-css';
    s.textContent=
      '.mi-wrap{max-width:1100px}'+
      '.mi-hoy{border:1px solid #d5e3ec;background:#f6fafd;border-radius:12px;padding:12px 14px;margin:6px 0 18px}'+
      '.mi-hoy h3{margin:0 0 6px;font-size:14px;color:#033350}'+
      '.mi-hoy.mi-alerta{background:#fff8f2;border-color:#f0c8a0}'+
      '.mi-hoy ul{margin:0;padding-left:18px;font-size:13px}.mi-hoy li{margin:3px 0}'+
      '.mi-hoy .mi-ok{font-size:13px;color:#1a7f4b}'+
      '.mi-sem{border:1px solid #d5e3ec;background:#fff;border-radius:12px;padding:14px;margin:0 0 18px}.mi-sem h3{margin:0 0 10px;font-size:15px;color:#033350}'+
      '.mi-ks{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.mi-k{background:#f6fafd;border:1px solid #dbe5ee;border-radius:10px;padding:10px 12px}.mi-k span{display:block;font-size:12px;color:#5a6b7b}'+
      '.mi-k b{display:block;font-size:24px;color:#033350;margin:2px 0}.mi-k b small{font-size:12px;font-weight:500;color:#5a6b7b}.mi-k small{display:block;font-size:12px;color:#5a6b7b;overflow-wrap:anywhere}'+
      '.mi-k.mi-mal{background:#fff6f6;border-color:#f0b9b9}.mi-k.mi-mal b{color:#b42318}.mi-k.mi-aten{background:#fff8f2;border-color:#f0c8a0}.mi-k.mi-aten b{color:#b45309}'+
      '.mi-barra{display:block;height:8px;border-radius:6px;background:#e4ecf3;overflow:hidden;margin-top:6px}.mi-barra i{display:block;height:100%;background:linear-gradient(90deg,#8ec9e6,#0DB5F3)}'+
      '.mi-aviso{background:#fff4d6;border:1px solid #ecd48b;color:#6b4a00;border-radius:10px;padding:9px 12px;margin:0 0 10px;font-size:13.5px}.mi-sem-acc{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}'+
      '.mi-sec{margin:22px 0 2px;font-size:16px;color:#033350}'+
      '.mi-sub{margin:0 0 10px;font-size:13px;color:#5a6b7b}'+
      '.mi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}'+
      '.mi-card{display:flex;flex-direction:column;gap:6px;text-align:left;background:#fff;border:1px solid #d5e3ec;border-left:5px solid var(--mi-color,#065F86);border-radius:12px;padding:14px;cursor:pointer;font:inherit;color:inherit;min-height:132px;transition:box-shadow .15s,transform .15s}'+
      '.mi-card:hover,.mi-card:focus-visible{box-shadow:0 4px 14px rgba(3,51,80,.15);transform:translateY(-1px);outline:none}'+
      '.mi-card:focus-visible{outline:3px solid #4FC4F5}'+
      '.mi-ico{font-size:24px;line-height:1}'+
      '.mi-tit{font-weight:700;font-size:15px;color:#033350}'+
      '.mi-desc{font-size:13px;color:#4a5b6b;line-height:1.35;flex:1}'+
      '.mi-go{font-size:12px;font-weight:700;color:var(--mi-color,#065F86)}'+
      '.mi-vacio{padding:18px;border:1px dashed #b8c6d2;border-radius:12px;color:#5a6b7b}'+
      '@media (max-width:520px){.mi-grid{grid-template-columns:1fr}.mi-card{min-height:0}}';
    document.head.appendChild(s);
  }

  /* Avisos de hoy: los mismos que muestra el Centro de alertas, solo los de Mantenimiento y paradas. */
  function avisosHoy(){
    try{
      const A=window.glacialAvisos;if(!A||!A.puede||!A.puede())return null;
      return A.listar().filter(x=>x.tipo==='parada'||x.tipo==='mant');
    }catch(_){return null;}
  }
  function htmlHoy(){
    const av=avisosHoy();
    if(av===null)return '';
    if(!av.length)return '<div class="mi-hoy"><h3>Atención de hoy</h3><div class="mi-ok">✔ Sin avisos de paradas ni de mantenimiento en este momento.</div></div>';
    const filas=av.slice(0,5).map(x=>'<li><b>'+esc(x.severidad==='roja'?'🔴':'🟠')+' '+esc(typeof nombreLineaCorto==='function'?nombreLineaCorto(x.linea):x.linea||'')+'</b> · '+esc(x.texto)+'</li>').join('');
    return '<div class="mi-hoy mi-alerta"><h3>Atención de hoy · '+av.length+(av.length===1?' aviso':' avisos')+'</h3><ul>'+filas+'</ul>'+(av.length>5?'<div class="mi-sub">Y '+(av.length-5)+' más en el Centro de alertas (campana de arriba).</div>':'')+'</div>';
  }

  /* «Esta semana en Mantenimiento»: lo que toca, cuánto se hizo, lo vencido, lo pendiente y lo que falta iniciar o validar. Sale de las mismas tablas del Plan anual y del Registro. */
  const D=()=>window.glacialMttoPlanDatos,NP=()=>window.glacialMttoPlan;
  const ddmm=iso=>NP().ddmm?NP().ddmm(iso):iso;
  function situacion(){
    const d=D(),n=NP();if(!d||!n||!n.situacionSemana||!visible('btn-plan-anual-mtto'))return null;
    d.escuchar();
    const c=d.cache;if(!c.listo)return {estado:c.error?'error':'cargando',error:c.error};
    const ahora=typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
    if(typeof GlacialFecha==='undefined')return {estado:'cargando'};                        // la fecha de Lima la da 01b-fecha-operativa.js
    const hoy=GlacialFecha.fechaISOLocal(ahora);
    const actual=n.semanaDeHoy(hoy),ej=d.ejecucion(actual.anio);
    if(!ej)return {estado:'cargando'};
    const dia=((new Date(hoy+'T12:00:00').getDay()+6)%7)+1;
    return {estado:'ok',s:n.situacionSemana({maquinas:c.maquinas,actividades:c.actividades,registros:ej.registros,acts:ej.acts,actual,inicio:n.inicioRegistros(c.config),diaSemana:dia}),error:ej.error};
  }
  function htmlSemana(){
    const x=situacion();if(x===null)return '';
    if(x.estado==='cargando')return '<div class="mi-sem" id="mi-semana"><h3>Esta semana en Mantenimiento</h3><div class="mi-sub">Leyendo el plan y el Registro…</div></div>';
    if(x.estado==='error')return '<div class="mi-sem" id="mi-semana"><h3>Esta semana en Mantenimiento</h3><div class="mi-sub">No se pudo leer el plan: '+esc(x.error)+'</div></div>';
    const s=x.s;if(!s)return '';
    const k=(titulo,valor,sub,cls)=>'<div class="mi-k '+(cls||'')+'"><span>'+esc(titulo)+'</span><b>'+valor+'</b>'+(sub?'<small>'+sub+'</small>':'')+'</div>';
    const lista=(arr,f)=>arr.slice(0,3).map(f).join(', ')+(arr.length>3?' y '+(arr.length-3)+' más':'');
    const nom=m=>esc(m.codigo_hoja||m.nombre);
    const barra='<span class="mi-barra" role="img" aria-label="'+(s.pct||0)+' % hecho"><i style="width:'+(s.pct||0)+'%"></i></span>';
    return '<div class="mi-sem" id="mi-semana"><h3>Esta semana en Mantenimiento · S'+s.actual.semana+' · '+esc(ddmm(s.rango.desde))+' al '+esc(ddmm(s.rango.hasta))+'</h3>'+
      (s.aviso?'<div class="mi-aviso" role="alert">Ya pasó el miércoles y '+s.sinRegistro.length+' máquina'+(s.sinRegistro.length===1?'':'s')+' todavía no tiene registro: <b>'+lista(s.sinRegistro,nom)+'</b>.</div>':'')+
      '<div class="mi-ks">'+
        k('Toca esta semana',s.toca.actividades+' <small>actividades</small>','en '+s.toca.maquinas+' máquina'+(s.toca.maquinas===1?'':'s'))+
        k('Avance',(s.pct===null?'—':s.pct+' %'),s.hechas+' de '+s.toca.actividades+' hechas'+barra)+
        k('Sin registro iniciado',s.sinRegistro.length,s.sinRegistro.length?lista(s.sinRegistro,nom):'todas ya empezaron',s.sinRegistro.length&&s.aviso?'mi-mal':'')+
        k('Vencidas',s.vencidas,s.vencidas?lista(s.topVencidas,t=>nom(t.maquina)+' ('+t.n+')'):'al día desde que empezó el Registro',s.vencidas?'mi-mal':'')+
        k('Pendientes «No se realizó»',s.pendientes,s.pendientes?'pasan a la próxima semana hasta que se hagan':'ninguna pendiente',s.pendientes?'mi-aten':'')+
        k('Registros por validar',s.porValidar,s.porValidar?'cerrados, esperan al supervisor':'ninguno',s.porValidar?'mi-aten':'')+
      '</div><div class="mi-sem-acc"><button type="button" class="btn btn-primary btn-sm" data-mi-sem="programa">Abrir el Programa semanal</button><button type="button" class="btn btn-ghost btn-sm" data-mi-sem="plan">Ver el Plan anual</button></div></div>';
  }
  let oyenteSemana=false;
  function repintarSemana(){
    try{
      if(typeof state==='undefined'||state.currentTab!==TAB)return;
      const caja=document.getElementById('mi-semana'),nuevo=htmlSemana();
      if(!nuevo)return;const t=document.createElement('div');t.innerHTML=nuevo;
      if(caja){if(t.firstChild&&t.firstChild.outerHTML!==caja.outerHTML)caja.replaceWith(t.firstChild);}
      else{const h=document.querySelector('#mi-inicio .mi-hoy');if(h)h.insertAdjacentElement('afterend',t.firstChild);}
    }catch(_){/* informativo */}
  }
  function pintar(main){
    estilos();
    ABRIR.length=0;
    const grupos=GRUPOS.map(g=>{
      const t=g.tarjetas.filter(c=>visible(c.boton));
      if(!t.length)return '';
      return '<h3 class="mi-sec">'+esc(g.titulo)+'</h3><p class="mi-sub">'+esc(g.subtitulo)+'</p><div class="mi-grid" style="--mi-color:'+g.color+'">'+
        t.map(c=>{ABRIR.push(c.abrir);return '<button type="button" class="mi-card" data-mi-ir="'+(ABRIR.length-1)+'"><span class="mi-ico" aria-hidden="true">'+c.icono+'</span><span class="mi-tit">'+esc(c.titulo)+'</span><span class="mi-desc">'+esc(c.desc)+'</span><span class="mi-go">Abrir →</span></button>';}).join('')+'</div>';
    }).join('');
    if(!oyenteSemana&&D()&&D().alCambiar){oyenteSemana=true;D().alCambiar(repintarSemana);}
    main.innerHTML='<div class="mi-wrap" id="mi-inicio"><div class="main-head"><div><h2>Mantenimiento</h2><div class="sub">Todo el área en un solo lugar: lo de hoy, el trabajo diario, el análisis y los datos de las máquinas.</div></div>'+
      (window.glacialEstadoDatos?'<div>'+window.glacialEstadoDatos.chip()+'</div>':'')+'</div>'+
      (grupos?htmlHoy()+htmlSemana()+grupos:'<div class="mi-vacio">Tu usuario no tiene pantallas de Mantenimiento disponibles. Si las necesitas, pídele al Administrador el permiso.</div>')+'</div>';
  }

  document.addEventListener('click',e=>{
    const sm=e.target.closest&&e.target.closest('[data-mi-sem]');
    if(sm&&sm.closest('#mi-inicio')){const f=sm.getAttribute('data-mi-sem')==='plan'?window.goPlanAnualMtto:window.goProgramaSemanalMtto;try{if(typeof f==='function')f();}catch(err){console.warn('Mantenimiento · inicio:',err&&err.message||err);}return;}
    const b=e.target.closest&&e.target.closest('[data-mi-ir]');
    if(!b||!b.closest('#mi-inicio'))return;
    const f=ABRIR[Number(b.getAttribute('data-mi-ir'))];
    try{if(typeof f==='function')f();}catch(err){console.warn('Mantenimiento · inicio:',err&&err.message||err);}
  });

  function ir(){
    if(!hayAcceso()){alert('No tienes pantallas de Mantenimiento disponibles.');return;}
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    state.currentTab=TAB;
    if(typeof renderSidebar==='function')renderSidebar();
    if(typeof renderMain==='function')renderMain();
  }
  window.goMantenimientoInicio=ir;
  window.glacialMantInicio={GRUPOS,pintar,hayAcceso,estilos};      // estilos: también los usa el inicio de Producción

  if(typeof ajustarVistaSegunPermisos==='function'){
    const a=ajustarVistaSegunPermisos;
    ajustarVistaSegunPermisos=function(){if(state.currentTab===TAB&&hayAcceso())return;return a.apply(this,arguments);};
  }
  if(typeof renderMain==='function'){
    const a=renderMain;
    renderMain=function(){
      if(state.currentTab===TAB&&!state.showWelcome&&hayAcceso()){pintar(document.getElementById('main'));return;}
      return a.apply(this,arguments);
    };
  }
  if(typeof renderSidebar==='function'){
    const a=renderSidebar;
    renderSidebar=function(){
      const r=a.apply(this,arguments);
      const b=document.getElementById(BOTON);
      if(b){
        const m=hayAcceso();b.hidden=!m;b.style.display=m?'':'none';
        b.classList.toggle('active',m&&state.currentTab===TAB);
        if(m&&state.currentTab===TAB)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
      }
      if(typeof actualizarGruposSidebar==='function')actualizarGruposSidebar();
      botonVolver();
      return r;
    };
  }
  /* Botón «Inicio de Mantenimiento» arriba de cada pantalla del módulo, dentro de #main. Cada pantalla repinta #main entero, por eso un observador lo vuelve a poner. */
  const PANTALLAS=['intervenciones','bitacora-mtto','analisis-paradas','velocidades-estandar','productos-parametros','mantenimiento'];
  function botonVolver(){
    const main=document.getElementById('main');
    if(!main)return;
    const actual=main.querySelector(':scope > #mi-volver');
    const mostrar=typeof state!=='undefined'&&PANTALLAS.includes(state.currentTab)&&!state.showWelcome&&hayAcceso();
    if(!mostrar){if(actual)actual.remove();return;}
    const dePro=state.currentTab==='bitacora-mtto'&&window.__bitDesdeProduccion===true&&typeof window.goProduccionInicio==='function';   // la bitácora de Producción comparte pantalla con esta
    if(actual){const t=dePro?'← Inicio de Producción':'← Inicio de Mantenimiento';if(actual.textContent!==t)actual.textContent=t;actual.dataset.destino=dePro?'prod':'mtto';}
    if(actual&&main.firstElementChild===actual)return;
    const b=actual||document.createElement('button');
    if(!actual){b.type='button';b.id='mi-volver';b.className='btn btn-ghost btn-sm';b.textContent=dePro?'← Inicio de Producción':'← Inicio de Mantenimiento';b.dataset.destino=dePro?'prod':'mtto';b.style.cssText='margin:0 0 10px;display:inline-block';b.addEventListener('click',()=>{if(b.dataset.destino==='prod'&&typeof window.goProduccionInicio==='function')window.goProduccionInicio();else ir();});}
    main.insertBefore(b,main.firstChild);
  }
  (function vigilar(){
    const main=document.getElementById('main');
    if(!main){document.addEventListener('DOMContentLoaded',vigilar,{once:true});return;}
    new MutationObserver(()=>botonVolver()).observe(main,{childList:true});
  })();
  /* Los avisos cambian solos: si la pantalla está abierta, se repinta el recuadro de hoy cada 30 s sin tocar las tarjetas. */
  setInterval(()=>{
    try{
      if(typeof state==='undefined'||state.currentTab!==TAB)return;
      const caja=document.querySelector('#mi-inicio .mi-hoy'),nuevo=htmlHoy();
      if(caja&&nuevo){const t=document.createElement('div');t.innerHTML=nuevo;if(t.firstChild&&t.firstChild.outerHTML!==caja.outerHTML)caja.replaceWith(t.firstChild);}
    }catch(_){/* informativo */}
  },30000);
})();
