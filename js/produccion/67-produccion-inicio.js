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

  /* 27/11/2026 · ordenado como se trabaja el turno (docs/produccion/inicio-de-produccion.md): «Tu turno, paso a paso» arriba y, debajo, Paradas,
     Cierre del turno y Personal y configuración. Una tarjeta se ve si existe su botón del menú para el usuario (boton) o si su permiso lo deja (puede). */
  const GRUPOS=[
    {titulo:'Paradas',subtitulo:'Registrar, revisar y analizar las paradas.',color:'#c2410c',tarjetas:[
      {boton:'btn-paradas-turno',icono:'⏱',titulo:'Paradas del turno',nuevo:true,desc:'Todas las paradas del turno juntas, por hora y marca, con «+ Parada».',abrir:()=>irParadasTurno()},
      {puede:()=>puedeLinea('paletas'),icono:'🏷',titulo:'Cierre por marca',nuevo:true,desc:'Paradas, minutos y ratio de cada marca (en Paletas de la línea elegida arriba).',abrir:()=>abrirLinea(lineaElegida(),'paletas','#ct-panel')},
      {boton:'btn-bitacora-prod',icono:'📒',titulo:'Bitácora de producción',desc:'Paradas por día y línea con su motivo.',abrir:()=>typeof goBitacoraProduccion==='function'&&goBitacoraProduccion()},
      {boton:'btn-analisis-paradas',icono:'📊',titulo:'Análisis de paradas',desc:'Qué causas y equipos paran más las líneas, con minutos y unidades perdidas.',abrir:()=>window.goAnalisisParadas&&window.goAnalisisParadas()}
    ]},
    {titulo:'Cierre del turno',subtitulo:'Lo que se hace al terminar el turno.',color:'#065F86',tarjetas:[
      {boton:'btn-avance-produccion',icono:'📈',titulo:'Avance y cierre',desc:'Avance del turno por línea y «Enviar cierre de turno».',abrir:()=>window.goAvanceProduccion&&window.goAvanceProduccion()},
      {boton:'btn-entrega-turno',icono:'🤝',titulo:'Entrega de turno',desc:'Entregar pendientes al siguiente supervisor y confirmar lo recibido.',abrir:()=>window.goEntregaTurno&&window.goEntregaTurno()},
      {boton:'btn-resumenes-turno',icono:'🧾',titulo:'Resúmenes de turno',desc:'Cómo cerró cada turno: producción, paradas y pendientes.',abrir:()=>window.goResumenesTurno&&window.goResumenesTurno()},
      {puede:()=>puedeLinea('historial'),icono:'🗂',titulo:'Historial de registros',desc:'Reportes anteriores de la línea elegida arriba y sus correcciones.',abrir:()=>abrirLinea(lineaElegida(),'historial')}
    ]},
    {titulo:'Personal y configuración',subtitulo:'Quién trabaja, en qué turno y con qué horario.',color:'#1a7f4b',tarjetas:[
      {boton:'btn-convocatoria',icono:'📋',titulo:'Convocatoria semanal',nuevo:true,desc:'Quién va a cada equipo esta semana; la imagen de WhatsApp sale sola y prellena el Tareo.',abrir:()=>typeof goConvocatoria==='function'&&goConvocatoria()},
      {boton:'btn-tareo',icono:'🗒',titulo:'Tareo de producción',desc:'Asistencia, horas y horas extras del personal de Producción.',abrir:()=>typeof goTareo==='function'&&goTareo()},
      {boton:'btn-rotacion-supervisores',icono:'🔄',titulo:'Rotación de supervisores',desc:'Qué supervisor cubre cada turno de la semana.',abrir:()=>typeof goRotacionSupervisores==='function'&&goRotacionSupervisores()},
      {boton:'btn-horario-produccion',icono:'⏰',titulo:'Horario de producción',desc:'Horarios de turno y de cada línea.',abrir:()=>typeof goHorarioProduccion==='function'&&goHorarioProduccion()}
    ]}
  ];

  /* ---------- Líneas y pasos del turno ---------- */
  const lineas=()=>{try{return typeof visibleLines==='function'?visibleLines():[];}catch(_){return [];}};
  const permiso=p=>{try{return typeof tienePermiso==='function'&&tienePermiso(p);}catch(_){return false;}};
  const puedeLinea=tab=>lineas().length>0&&permiso(tab);
  let elegida=null;
  function lineaElegida(){
    const ls=lineas();if(!ls.length)return null;
    if(elegida&&ls.some(l=>l.key===elegida))return elegida;
    const u=typeof state!=='undefined'&&state.user&&state.user.linea;
    if(u&&ls.some(l=>l.key===u))return u;
    if(typeof state!=='undefined'&&state.currentLine&&ls.some(l=>l.key===state.currentLine))return state.currentLine;
    return ls[0].key;
  }
  /* Espera (hasta ~4 s) a que la pantalla pinte un elemento y lo muestra; o corre una función cuando la condición se cumple. */
  function cuando(cond,hacer,ms){
    const fin=Date.now()+(ms||4000);
    (function paso(){let v=null;try{v=cond();}catch(_){v=null;}if(v){try{hacer(v);}catch(_){}return;}if(Date.now()<fin)setTimeout(paso,120);})();
  }
  const mostrar=sel=>cuando(()=>document.querySelector(sel),el=>{el.scrollIntoView({behavior:'smooth',block:'start'});el.classList.add('pi-resalta');setTimeout(()=>el.classList.remove('pi-resalta'),2200);});
  /* Abre una pestaña de la línea (Nuevo registro, Paletas, Historial), como el menú, y opcionalmente baja hasta una parte de la pantalla. */
  function abrirLinea(key,tab,sel){
    if(!key||!lineas().some(l=>l.key===key)||!permiso(tab))return false;
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return false;
    if(tab==='nuevo'&&typeof selectLine==='function'&&permiso('nuevo')){selectLine(key);if(state.currentTab!=='nuevo'){state.currentTab='nuevo';if(typeof renderSidebar==='function')renderSidebar();renderMain();}}
    else{state.currentLine=key;state.currentTab=tab;state.viewingRecordId=null;if(typeof renderSidebar==='function')renderSidebar();if(typeof renderMain==='function')renderMain();}
    if(sel)mostrar(sel);
    return true;
  }
  const puedeParadas=()=>typeof window.avAbrirParadas==='function'&&typeof window.avPuedeEditarParadas==='function'&&(()=>{try{return window.avPuedeEditarParadas();}catch(_){return false;}})();
  /* «+ Parada»: abre Paletas de la línea (que conoce la fecha y el turno operativos) y, en cuanto los tiene, el formulario único de paradas. */
  function nuevaParada(key){
    if(!abrirLinea(key,'paletas'))return;
    cuando(()=>typeof draftPaleta!=='undefined'&&draftPaleta&&draftPaleta.linea===key&&draftPaleta.fecha&&draftPaleta.turno&&draftPaleta,d=>window.avAbrirParadas(key,d.fecha,d.turno));
  }
  function irParadasTurno(){
    if(typeof window.goAvanceProduccion!=='function')return;
    window.goAvanceProduccion();
    mostrar('#pu-avance');
  }
  window.goParadasTurno=irParadasTurno;
  const PASOS=[
    {n:1,titulo:'Nuevo registro',desc:'Abrir el turno de la línea',puede:()=>puedeLinea('nuevo'),abrir:k=>abrirLinea(k,'nuevo')},
    {n:2,titulo:'Paletas',desc:'+1 paleta al minuto',puede:()=>puedeLinea('paletas'),abrir:k=>abrirLinea(k,'paletas')},
    {n:3,titulo:'+ Parada',desc:'Un solo formulario, por marca',nuevo:true,puede:()=>puedeLinea('paletas')&&puedeParadas(),abrir:k=>nuevaParada(k)},
    {n:4,titulo:'Cerrar marca',desc:'Al terminar cada marca',nuevo:true,puede:()=>puedeLinea('paletas'),abrir:k=>abrirLinea(k,'paletas','#ct-panel')},
    {n:5,titulo:'Avance y cierre',desc:'«Enviar cierre de turno»',puede:()=>visible('btn-avance-produccion'),abrir:()=>window.goAvanceProduccion&&window.goAvanceProduccion()},
    {n:6,titulo:'Entrega de turno',desc:'Pendientes al siguiente',puede:()=>visible('btn-entrega-turno'),abrir:()=>window.goEntregaTurno&&window.goEntregaTurno()}
  ];
  function htmlPasos(){
    const ps=PASOS.filter(p=>p.puede());
    if(!ps.length)return '';
    const ls=lineas(),k=lineaElegida();
    const nombre=l=>typeof nombreLineaCorto==='function'?nombreLineaCorto(l.key):(l.name||l.key);
    const chips=ls.length>1?'<div class="pi-lineas" role="group" aria-label="Línea"><span>Línea:</span>'+ls.map(l=>'<button type="button" class="pi-chip'+(l.key===k?' on':'')+'" data-pi-linea="'+esc(l.key)+'" aria-pressed="'+(l.key===k)+'">'+esc(nombre(l))+'</button>').join('')+'</div>'
      :(ls.length===1?'<div class="pi-lineas"><span>Línea: <b>'+esc(nombre(ls[0]))+'</b></span></div>':'');
    return '<div class="pi-pasos" id="pi-pasos"><h3>Tu turno, paso a paso</h3>'+chips+'<div class="pi-fila">'+
      ps.map(p=>'<button type="button" class="pi-paso'+(p.nuevo?' nuevo':'')+'" data-pi-paso="'+p.n+'">'+(p.nuevo?'<span class="pi-badge">NUEVO</span>':'')+'<span class="pi-n">'+p.n+'</span><b>'+esc(p.titulo)+'</b><span class="pi-d">'+esc(p.desc)+'</span></button>').join('')+'</div></div>';
  }
  const ABRIR=[];
  const OTROS=['btn-tareo','btn-rotacion-supervisores','btn-bitacora-prod','btn-resumenes-turno','btn-horario-produccion'];
  const visible=id=>{const b=document.getElementById(id);return !!b&&!b.hidden&&b.style.display!=='none';};
  const hayAcceso=()=>['btn-avance-produccion','btn-entrega-turno','btn-paradas-turno'].concat(OTROS).some(visible);

  /* Menú lateral de Producción: Inicio, Registro de producción (líneas), Avance y cierre, Paradas del turno y Entrega de turno. Los demás botones siguen existiendo (ocultos por CSS) porque su visibilidad decide qué tarjetas se ven. */
  if(!document.getElementById('pi-menu-css')){
    const m=document.createElement('style');m.id='pi-menu-css';
    m.textContent=OTROS.map(id=>'#sidebar-panel-produccion #'+id).join(',')+'{display:none!important}';
    document.head.appendChild(m);
  }

  const TIPOS_HOY=['parada','paletas','proyeccion','noiniciada','tareo','finalizar','entrega','sinprogramacion'];
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

  /* A · Reportes sin finalizar de turnos ya terminados (últimos días), todos con su botón «Abrir». Antes solo salían mezclados en «Atención de hoy»
     (máximo 6) y pasaban desapercibidos: del 03 al 06/11/2026 quedaron 39 reportes sin finalizar. Mismo cálculo y alcance que el aviso (46). */
  function pendientesFinalizar(){
    const A=window.glacialAvisos;
    if(!A||typeof A.ambito!=='function'||typeof A.pendientesFinalizar!=='function')return null;
    const a=A.ambito();if(!a||!a.tipos.includes('finalizar'))return null;
    try{return (A.pendientesFinalizar().items||[]).filter(x=>!a.lineas||a.lineas===x.linea);}catch(_){return null;}
  }
  function htmlSinFinalizar(){
    const items=pendientesFinalizar();
    if(!items||!items.length)return '';
    const nom=l=>typeof nombreLineaCorto==='function'?nombreLineaCorto(l):l;
    const ddmm=f=>String(f||'').split('-').reverse().slice(0,2).join('/');
    const filas=items.map(x=>'<li class="pi-fin-item"><span><b>'+esc(x.nivel==='roja'?'🔴':'🟠')+' '+esc(nom(x.linea))+'</b> · '+esc(x.turno)+' '+esc(ddmm(x.fecha))+' · '+
      esc(x.sinFinalizar)+' de '+esc(x.cuadros)+(x.cuadros===1?' cuadro':' cuadros')+' sin finalizar</span><button type="button" class="btn btn-ghost btn-sm" data-pi-reporte="'+esc(x.id)+'">Abrir</button></li>').join('');
    return '<div class="mi-hoy mi-alerta" id="pi-sin-finalizar"><h3>Reportes sin finalizar · '+items.length+'</h3><p class="mi-sub">Turnos que ya terminaron. Mientras no se finalicen, los reportes que se complementan no suman en los indicadores.</p><ul class="pi-fin">'+filas+'</ul></div>';
  }
  /* B · Rotación de supervisores sin publicar: la semana en curso (roja) y, desde el jueves, la siguiente (ámbar). El turno de cada supervisor sale
     de la rotación publicada: sin ella el sistema no sabe quién cubre cada turno. Solo para quien gestiona la rotación, Jefatura y Administrador. */
  function avisoRotacion(){
    if(typeof rotSupBuscarSemanaPorFecha!=='function'||!window.GlacialFecha)return null;
    if(typeof _rotacionesReady!=='undefined'&&!_rotacionesReady)return null;
    const rol=String((typeof state!=='undefined'&&state.user&&state.user.rol)||'');
    if(!(visible('btn-rotacion-supervisores')||rol==='Administrador'||['Jefe de Producción','Jefe de Operaciones','Jefatura'].includes(rol)))return null;
    const G=window.GlacialFecha,hoy=G.fechaOperativa();
    const [y,m,d]=hoy.split('-').map(Number);const dow=new Date(y,m-1,d).getDay()||7;     // 1 = lunes … 7 = domingo (desde las partes: sin zona horaria)
    const lunes=G.sumarDias(hoy,1-dow),proximo=G.sumarDias(lunes,7);
    const txt=f=>f.split('-').reverse().slice(0,2).join('/');
    if(!rotSupBuscarSemanaPorFecha(hoy,true))return {nivel:'roja',texto:'No hay rotación de supervisores publicada para esta semana ('+txt(lunes)+' al '+txt(G.sumarDias(lunes,6))+', semana '+G.semanaISO(hoy)+').'};
    if(dow>=4&&!rotSupBuscarSemanaPorFecha(proximo,true))return {nivel:'ambar',texto:'Falta publicar la rotación de la próxima semana ('+txt(proximo)+' al '+txt(G.sumarDias(proximo,6))+').'};
    return null;
  }
  function htmlRotacion(){
    const a=avisoRotacion();if(!a)return '';
    const ir=typeof goRotacionSupervisores==='function'?'<button type="button" class="btn btn-ghost btn-sm" data-pi-rotacion="1">Abrir rotación</button>':'';
    return '<div class="mi-hoy mi-alerta" id="pi-rotacion"><h3>'+esc(a.nivel==='roja'?'🔴':'🟠')+' Rotación de supervisores</h3><div class="pi-fin-item"><span>'+esc(a.texto)+'</span>'+ir+'</div></div>';
  }
  function estilosPendientes(){
    if(document.getElementById('pi-pend-css'))return;
    const s=document.createElement('style');s.id='pi-pend-css';
    s.textContent='.pi-fin{list-style:none;margin:8px 0 0;padding:0}.pi-fin-item{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0;border-top:1px solid rgba(0,0,0,.06);flex-wrap:wrap}.pi-fin-item .btn{min-height:40px}'+
      '.pi-pasos{background:#fff;border:1px solid #dce5eb;border-radius:14px;padding:14px 16px;margin:12px 0}.pi-pasos h3{margin:0 0 6px;font-size:16px}'+
      '.pi-lineas{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 10px;font-size:13px;color:#4b6475}'+
      '.pi-chip{border:1.5px solid #c9d6e2;border-radius:999px;padding:6px 14px;font-weight:700;color:#0b3a5c;background:#fff;min-height:36px;cursor:pointer}.pi-chip.on{background:#065F86;color:#fff;border-color:#065F86}'+
      '.pi-fila{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}'+
      '.pi-paso{position:relative;display:grid;gap:3px;justify-items:start;text-align:left;border:1.5px solid #d6e2ec;border-radius:12px;padding:10px 12px;background:#f9fbfd;cursor:pointer;font:inherit;color:inherit;min-height:92px}'+
      '.pi-paso:hover{border-color:#065F86}.pi-paso.nuevo{border-color:#e0a100;background:#fff9e8}.pi-paso b{font-size:14px}.pi-d{font-size:12px;color:#4b6475}'+
      '.pi-n{width:24px;height:24px;border-radius:50%;background:#065F86;color:#fff;display:grid;place-items:center;font-size:12px;font-weight:700}'+
      '.pi-badge{position:absolute;top:8px;right:8px;background:#b45309;color:#fff;font-size:10px;font-weight:800;border-radius:6px;padding:2px 6px;letter-spacing:.04em}'+
      '.mi-card .pi-badge{position:static;display:inline-block;margin-left:6px;vertical-align:middle}'+
      '.pi-resalta{outline:3px solid #e0a100;outline-offset:3px;border-radius:12px;transition:outline-color .6s}'+
      '@media (prefers-color-scheme:dark){.pi-pasos,.pi-chip,.pi-paso{background:#13222d;border-color:#2b3f4d;color:#e6eef3}.pi-paso.nuevo{background:#2a2312}.pi-d,.pi-lineas{color:#9fb3c2}.pi-chip.on{background:#0b7fb0;color:#fff}}';
    document.head.appendChild(s);
  }

  function pintar(main){
    if(window.glacialMantInicio&&window.glacialMantInicio.estilos)window.glacialMantInicio.estilos();
    ABRIR.length=0;
    const grupos=GRUPOS.map(g=>{
      const t=g.tarjetas.filter(c=>c.puede?c.puede():visible(c.boton));
      if(!t.length)return '';
      return '<h3 class="mi-sec">'+esc(g.titulo)+'</h3><p class="mi-sub">'+esc(g.subtitulo)+'</p><div class="mi-grid" style="--mi-color:'+g.color+'">'+
        t.map(c=>{ABRIR.push(c.abrir);return '<button type="button" class="mi-card" data-pi-ir="'+(ABRIR.length-1)+'"><span class="mi-ico" aria-hidden="true">'+c.icono+'</span><span class="mi-tit">'+esc(c.titulo)+(c.nuevo?'<span class="pi-badge">NUEVO</span>':'')+'</span><span class="mi-desc">'+esc(c.desc)+'</span><span class="mi-go">Abrir →</span></button>';}).join('')+'</div>';
    }).join('');
    main.innerHTML='<div class="mi-wrap" id="pi-inicio"><div class="main-head"><div><h2>Producción</h2><div class="sub">Ordenado como se trabaja el turno. Todo lo de paradas, en un solo grupo.</div></div>'+
      (window.glacialEstadoDatos?'<div>'+window.glacialEstadoDatos.chip()+'</div>':'')+'</div>'+
      (estilosPendientes(),htmlPasos())+htmlRotacion()+htmlSinFinalizar()+
      (grupos?htmlHoy()+grupos:'<div class="mi-vacio">Tu usuario no tiene más pantallas de Producción disponibles. Usa el registro de tu línea en el menú.</div>')+'</div>';
  }

  document.addEventListener('click',e=>{
    const ch=e.target.closest&&e.target.closest('[data-pi-linea]');
    if(ch&&ch.closest('#pi-inicio')){elegida=ch.getAttribute('data-pi-linea');const caja=document.getElementById('pi-pasos'),t=document.createElement('div');t.innerHTML=htmlPasos();if(caja&&t.firstChild)caja.replaceWith(t.firstChild);return;}
    const pa=e.target.closest&&e.target.closest('[data-pi-paso]');
    if(pa&&pa.closest('#pi-inicio')){const p=PASOS.find(x=>String(x.n)===pa.getAttribute('data-pi-paso'));try{if(p&&p.puede())p.abrir(lineaElegida());}catch(err){console.warn('Producción · inicio:',err&&err.message||err);}return;}
    const rep=e.target.closest&&e.target.closest('[data-pi-reporte]');
    if(rep&&rep.closest('#pi-inicio')){try{if(typeof cargarReporteParaCorreccion==='function')cargarReporteParaCorreccion(rep.getAttribute('data-pi-reporte'));else if(typeof goHistorial==='function')goHistorial();}catch(err){console.warn('Producción · inicio:',err&&err.message||err);}return;}
    const rot=e.target.closest&&e.target.closest('[data-pi-rotacion]');
    if(rot&&rot.closest('#pi-inicio')){try{goRotacionSupervisores();}catch(err){console.warn('Producción · inicio:',err&&err.message||err);}return;}
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
  window.glacialProdInicio={GRUPOS,PASOS,pintar,hayAcceso,pendientesFinalizar,avisoRotacion,abrirLinea,lineaElegida};

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
      const pt=document.getElementById('btn-paradas-turno'),av=document.getElementById('btn-avance-produccion');
      if(pt&&av){const v=visible('btn-avance-produccion');pt.hidden=!v;pt.style.display=v?'':'none';}
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
