/* =============================================================
   PRODUCCIÓN · INICIO (pantalla de entrada del módulo, ordenada por tareas)
   -------------------------------------------------------------
   Igual que el inicio de Mantenimiento (68): reúne en tarjetas las pantallas del grupo «Producción» según lo que la persona quiere hacer. NO cambia
   ninguna pantalla ni permiso: cada tarjeta aparece solo si el botón del menú existe para ese usuario, y abre la misma pantalla.
   El menú lateral deja «Inicio de Producción», «Registro de producción» (las líneas) y «Avance y cierre» (lo que se usa en cada turno); el resto
   (tareo, rotación, bitácora, resúmenes, entrega de turno, horario) se abre desde las tarjetas. Cada pantalla trae arriba «← Inicio de Producción».
   Muestra los avisos de hoy de producción (paradas, paletas, proyección, programación, tareo, reportes sin finalizar, entrega de turno).
   Cargar DESPUÉS de 66-entrega-turno.js y de 68-mantenimiento-inicio.js (usa sus estilos).
   ============================================================= */
(function(){
  'use strict';
  const TAB='prod-inicio',BOTON='btn-prod-inicio';
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const GRUPOS=[
    {titulo:'Cada turno',subtitulo:'Lo que se usa todos los días en planta.',color:'#006b8f',tarjetas:[
      {boton:'btn-avance-produccion',icono:'📈',titulo:'Avance y cierre',desc:'Avance del turno por línea y cierre al terminar.',abrir:()=>window.goAvanceProduccion&&window.goAvanceProduccion()},
      {boton:'btn-entrega-turno',icono:'🤝',titulo:'Entrega de turno',desc:'Entregar pendientes al siguiente supervisor y confirmar lo recibido.',abrir:()=>window.goEntregaTurno&&window.goEntregaTurno()},
      {boton:'btn-resumenes-turno',icono:'🧾',titulo:'Resúmenes de turno',desc:'Cómo cerró cada turno: producción, paradas y pendientes.',abrir:()=>window.goResumenesTurno&&window.goResumenesTurno()}
    ]},
    {titulo:'Personal',subtitulo:'Quién trabaja y en qué turno.',color:'#1a7f4b',tarjetas:[
      {boton:'btn-tareo',icono:'🗒',titulo:'Tareo de producción',desc:'Asistencia, horas y horas extras del personal de Producción.',abrir:()=>typeof goTareo==='function'&&goTareo()},
      {boton:'btn-rotacion-supervisores',icono:'🔄',titulo:'Rotación de supervisores',desc:'Qué supervisor cubre cada turno de la semana.',abrir:()=>typeof goRotacionSupervisores==='function'&&goRotacionSupervisores()}
    ]},
    {titulo:'Seguimiento y configuración',subtitulo:'Para revisar lo que pasó y ajustar los horarios.',color:'#7a3fb0',tarjetas:[
      {boton:'btn-bitacora-prod',icono:'📒',titulo:'Bitácora de producción',desc:'Paradas por día y línea con su motivo.',abrir:()=>typeof goBitacoraProduccion==='function'&&goBitacoraProduccion()},
      {boton:'btn-horario-produccion',icono:'⏰',titulo:'Horario de producción',desc:'Horarios de turno y de cada línea.',abrir:()=>typeof goHorarioProduccion==='function'&&goHorarioProduccion()}
    ]}
  ];
  const ABRIR=[];
  const OTROS=['btn-tareo','btn-rotacion-supervisores','btn-bitacora-prod','btn-resumenes-turno','btn-entrega-turno','btn-horario-produccion'];
  const visible=id=>{const b=document.getElementById(id);return !!b&&!b.hidden&&b.style.display!=='none';};
  const hayAcceso=()=>['btn-avance-produccion'].concat(OTROS).some(visible);

  /* Menú lateral de Producción: Inicio, Registro de producción (líneas) y Avance y cierre. Los demás botones siguen existiendo (ocultos por CSS) porque su visibilidad decide qué tarjetas se ven. */
  if(!document.getElementById('pi-menu-css')){
    const m=document.createElement('style');m.id='pi-menu-css';
    m.textContent=OTROS.map(id=>'#sidebar-panel-produccion #'+id).join(',')+'{display:none!important}';
    document.head.appendChild(m);
  }

  const TIPOS_HOY=['parada','paletas','proyeccion','noiniciada','tareo','finalizar','entrega'];
  function avisosHoy(){
    try{const A=window.glacialAvisos;if(!A||!A.puede||!A.puede())return null;return A.listar().filter(x=>TIPOS_HOY.includes(x.tipo));}catch(_){return null;}
  }
  function htmlHoy(){
    const av=avisosHoy();
    if(av===null)return '';
    if(!av.length)return '<div class="mi-hoy"><h3>Atención de hoy</h3><div class="mi-ok">✔ Sin avisos de producción en este momento.</div></div>';
    const filas=av.slice(0,6).map(x=>'<li><b>'+esc(x.severidad==='roja'?'🔴':'🟠')+' '+esc(x.linea&&typeof nombreLineaCorto==='function'?nombreLineaCorto(x.linea):x.linea||'')+'</b> '+(x.linea?'· ':'')+esc(x.texto)+'</li>').join('');
    return '<div class="mi-hoy mi-alerta"><h3>Atención de hoy · '+av.length+(av.length===1?' aviso':' avisos')+'</h3><ul>'+filas+'</ul>'+(av.length>6?'<div class="mi-sub">Y '+(av.length-6)+' más en el Centro de alertas (campana de arriba).</div>':'')+'</div>';
  }

  function pintar(main){
    if(window.glacialMantInicio&&window.glacialMantInicio.estilos)window.glacialMantInicio.estilos();
    ABRIR.length=0;
    const grupos=GRUPOS.map(g=>{
      const t=g.tarjetas.filter(c=>visible(c.boton));
      if(!t.length)return '';
      return '<h3 class="mi-sec">'+esc(g.titulo)+'</h3><p class="mi-sub">'+esc(g.subtitulo)+'</p><div class="mi-grid" style="--mi-color:'+g.color+'">'+
        t.map(c=>{ABRIR.push(c.abrir);return '<button type="button" class="mi-card" data-pi-ir="'+(ABRIR.length-1)+'"><span class="mi-ico" aria-hidden="true">'+c.icono+'</span><span class="mi-tit">'+esc(c.titulo)+'</span><span class="mi-desc">'+esc(c.desc)+'</span><span class="mi-go">Abrir →</span></button>';}).join('')+'</div>';
    }).join('');
    main.innerHTML='<div class="mi-wrap" id="pi-inicio"><div class="main-head"><div><h2>Producción</h2><div class="sub">Lo de cada turno, el personal y el seguimiento. El registro de cada línea está en el menú de la izquierda.</div></div>'+
      (window.glacialEstadoDatos?'<div>'+window.glacialEstadoDatos.chip()+'</div>':'')+'</div>'+
      (grupos?htmlHoy()+grupos:'<div class="mi-vacio">Tu usuario no tiene más pantallas de Producción disponibles. Usa el registro de tu línea en el menú.</div>')+'</div>';
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest&&e.target.closest('[data-pi-ir]');
    if(!b||!b.closest('#pi-inicio'))return;
    const f=ABRIR[Number(b.getAttribute('data-pi-ir'))];
    try{if(typeof f==='function')f();}catch(err){console.warn('Producción · inicio:',err&&err.message||err);}
  });

  function ir(){
    if(!hayAcceso())return;
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    state.currentTab=TAB;
    if(typeof renderSidebar==='function')renderSidebar();
    if(typeof renderMain==='function')renderMain();
  }
  window.goProduccionInicio=ir;
  window.glacialProdInicio={GRUPOS,pintar,hayAcceso};

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
  /* «← Inicio de Producción» arriba de las pantallas del módulo (dentro de #main; un observador lo vuelve a poner cuando la pantalla repinta). La bitácora y el registro de línea no lo llevan: comparten pantalla con Mantenimiento o son el trabajo diario. */
  const PANTALLAS=['avance-produccion','tareo','rotacion-supervisores','resumenes-turno','entrega-turno','horario-produccion'];
  function botonVolver(){
    const main=document.getElementById('main');
    if(!main)return;
    const actual=main.querySelector(':scope > #pi-volver');
    const mostrar=typeof state!=='undefined'&&PANTALLAS.includes(state.currentTab)&&!state.showWelcome&&hayAcceso();
    if(!mostrar){if(actual)actual.remove();return;}
    if(actual&&main.firstElementChild===actual)return;
    const b=actual||document.createElement('button');
    if(!actual){b.type='button';b.id='pi-volver';b.className='btn btn-ghost btn-sm';b.textContent='← Inicio de Producción';b.style.cssText='margin:0 0 10px;display:inline-block';b.addEventListener('click',ir);}
    main.insertBefore(b,main.firstChild);
  }
  (function vigilar(){
    const main=document.getElementById('main');
    if(!main){document.addEventListener('DOMContentLoaded',vigilar,{once:true});return;}
    new MutationObserver(()=>botonVolver()).observe(main,{childList:true});
  })();
  setInterval(()=>{
    try{
      if(typeof state==='undefined'||state.currentTab!==TAB)return;
      const caja=document.querySelector('#pi-inicio .mi-hoy'),nuevo=htmlHoy();
      if(caja&&nuevo){const t=document.createElement('div');t.innerHTML=nuevo;if(t.firstChild&&t.firstChild.outerHTML!==caja.outerHTML)caja.replaceWith(t.firstChild);}
    }catch(_){/* informativo */}
  },30000);
})();
