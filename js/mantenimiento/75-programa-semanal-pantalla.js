/* =====================================================================================================================
   MANTENIMIENTO · PROGRAMA SEMANAL · pantalla · docs/mantenimiento/plan-y-registro.md (punto 4.2)
   Reemplaza al botón BUSCAR del Excel: la semana se arma sola desde el Plan anual. Selector de semana (◀ SEM_45 ▶), una fila por máquina con las
   actividades que manda el plan esa semana (por frecuencia), avance, estado, técnico y maquinista, «hace X min», y un panel «En vivo» con lo último
   que hicieron los técnicos. Los registros (mtto_registros, glacial_48) se leen en tiempo real; llenarlos es la etapa siguiente (Registro CFA-CA-F-023).
   Las máquinas «pendientes de confirmar» (hojas CARB) no entran: duplicarían las actividades de la semana.
   También define la barra de pestañas de Mantenimiento (Plan anual · Programa semanal) que usa el Plan anual.
   ===================================================================================================================== */
(function(){
  'use strict';
  const TAB='programa-semanal-mtto',BOTON='btn-programa-semanal-mtto';
  const N=window.glacialMttoPlan,D=window.glacialMttoPlanDatos;
  if(!N||!D)return;
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ahoraMs=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const hoyIso=()=>GlacialFecha.fechaISOLocal(ahoraMs());          // fecha de hoy en hora de Lima (01b-fecha-operativa.js)
  const hhmm=ms=>new Date(ms).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'America/Lima'});
  const UI={sem:null,linea:'',abiertas:new Set()};
  const PANT=()=>window.glacialMttoPlanPantalla;
  const puedeVer=()=>!!(PANT()&&PANT().puedeVer());

  /* ---------- pestañas de Mantenimiento (las comparte el Plan anual) ---------- */
  const TABS=[{k:'plan',t:'Plan anual',ir:()=>window.goPlanAnualMtto&&window.goPlanAnualMtto()},{k:'semanal',t:'Programa semanal',ir:()=>window.goProgramaSemanalMtto&&window.goProgramaSemanalMtto()}];
  window.glacialMttoTabs={html:activa=>'<nav class="mt-tabs" role="tablist" aria-label="Mantenimiento">'+TABS.map(x=>'<button type="button" role="tab" class="mt-tab'+(x.k===activa?' on':'')+'" aria-selected="'+(x.k===activa)+'" data-mt-tab="'+x.k+'">'+x.t+'</button>').join('')+'</nav>',
    css:'.mt-tabs{display:flex;gap:4px;border-bottom:1px solid #dbe5ee;margin:0 0 12px;overflow-x:auto}.mt-tab{border:0;background:none;padding:10px 14px;font-size:14px;color:#46627a;cursor:pointer;border-bottom:3px solid transparent;white-space:nowrap}.mt-tab.on{color:var(--brand-700,#0877A6);font-weight:700;border-bottom-color:var(--brand,#0DB5F3)}'};
  document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-mt-tab]');if(!b)return;const t=TABS.find(x=>x.k===b.getAttribute('data-mt-tab'));if(t)t.ir();});

  /* ---------- datos de la semana ---------- */
  function filas(){
    const c=D.cache,ms=c.maquinas.filter(m=>m.activo!==false&&!m.pendiente_confirmar&&(m.linea_impresion||'PET')===UI.linea);
    return ms.map(m=>{
      const acts=D.actividadesDe(m.id,UI.sem.anio),reg=c.registros.find(r=>r.maquina_id===m.id)||null;
      return N.filaSemana(m,acts,UI.sem.semana,reg,reg?c.regActs.filter(a=>a.registro_id===reg.id):[],ahoraMs());
    }).filter(f=>f.delPlan.length||f.registro);
  }
  function normalizar(){
    if(!UI.sem)UI.sem=N.semanaDeHoy(hoyIso());
    const lineas=[...new Set(D.cache.maquinas.filter(m=>m.activo!==false).map(m=>m.linea_impresion||'PET'))];
    if(!lineas.includes(UI.linea))UI.linea=lineas[0]||'PET';
    return lineas;
  }
  function pedirSemana(){D.cargarSemana(UI.sem.anio,UI.sem.semana);}

  /* ---------- pintar ---------- */
  const BOTON_ESTADO={PENDIENTE:'Iniciar',EN_CURSO:'Ver en vivo',CERRADO:'Validar',VALIDADO:'Ver'};
  function pintar(main){
    estilos();
    const lineas=normalizar(),c=D.cache,hoy=N.semanaDeHoy(hoyIso());
    const esHoy=hoy.anio===UI.sem.anio&&hoy.semana===UI.sem.semana;
    let cuerpo;
    if(!c.listo){
      cuerpo='<div class="ps-aviso">'+(c.error?esc(c.error)+' <button type="button" class="btn btn-ghost btn-sm" data-ps-recargar>Reintentar</button>':'Cargando el plan…')+'</div>';
    }else{
      const fs=filas(),r=N.resumenSemana(fs),reg=window.glacialMttoRegistroPantalla;
      const ev=N.eventosEnVivo(c.registros,c.regActs,c.maquinas,12);
      const tabla=fs.length?'<div class="ps-tw"><table class="ps-t"><thead><tr><th>MÁQUINA</th><th>AVANCE</th><th>ESTADO</th><th>TÉCNICO / MAQUINISTA</th><th></th></tr></thead><tbody>'+fs.map(f=>{
        const e=N.ESTADOS_REG[f.estado],abierta=UI.abiertas.has(f.maquina.id);
        return '<tr><td><b>'+esc(f.maquina.nombre)+'</b><small>'+esc(f.frecuencias||'sin actividades')+'</small></td>'+
          '<td><div class="ps-av"><div class="ps-barra"><i class="'+(f.pct>=100?'ok':'')+'" style="width:'+f.pct+'%"></i></div><span>'+f.hechas+' / '+f.total+'</span></div></td>'+
          '<td><span class="ps-est ps-'+e.cls+'">'+e.txt+'</span></td>'+
          '<td>'+(f.tecnico||f.maquinista?'<b>'+esc(f.tecnico||'—')+'</b>'+(f.maquinista?' · '+esc(f.maquinista):'')+'<small>'+esc(f.hace)+'</small>':'<span class="ps-mut">—</span>')+'</td>'+
          '<td class="ps-acc"><button type="button" class="btn btn-ghost btn-sm" data-ps-ver="'+esc(f.maquina.id)+'" aria-expanded="'+abierta+'">'+(abierta?'Ocultar':'Actividades')+'</button>'+
          (reg&&reg.abrir?' <button type="button" class="btn btn-ghost btn-sm" data-ps-abrir="'+esc(f.maquina.id)+'">'+BOTON_ESTADO[f.estado]+'</button>':'')+'</td></tr>'+
          (abierta?'<tr class="ps-det"><td colspan="5"><ol>'+f.delPlan.map(a=>{const p=N.partirActividad(a.actividad);return '<li><b>'+esc(p.equipo)+'</b>'+(p.tarea?' / '+esc(p.tarea):'')+' <small>'+esc(a.frecuencia)+(a.insumos&&a.insumos!=='N/A'?' · '+esc(a.insumos):'')+'</small></li>';}).join('')+'</ol></td></tr>':'');
      }).join('')+'</tbody></table></div>':'<div class="ps-aviso">No hay actividades programadas esta semana.</div>';
      cuerpo='<div class="ps-cards">'+
        '<div class="ps-card"><span>Actividades de la semana</span><b>'+r.actividades+' en '+r.maquinas+' máquinas</b></div>'+
        '<div class="ps-card"><span>Realizadas</span><b>'+r.realizadas+' de '+r.actividades+'</b></div>'+
        '<div class="ps-card"><span>Registros abiertos ahora</span><b class="az">'+r.abiertos+'</b></div>'+
        '<div class="ps-card"><span>Por validar (supervisor)</span><b class="am">'+r.porValidar+'</b></div></div>'+
        (c.errorSemana?'<div class="ps-aviso">'+esc(c.errorSemana)+'</div>':'')+
        '<div class="ps-cols">'+tabla+'<aside class="ps-vivo"><h3>En vivo <small class="'+(c.enVivo?'on':'')+'">'+(c.enVivo?'● Actualizando':'○ Sin tiempo real')+'</small></h3>'+
        (ev.length?'<ul>'+ev.map(x=>'<li><span>'+esc(hhmm(x.ms))+'</span> <b>'+esc(x.quien)+'</b> '+esc(x.texto)+'</li>').join('')+'</ul>':'<p class="ps-mut">Aquí aparecerán, al instante, las actividades que marquen los técnicos y los registros que cierren o validen.</p>')+'</aside></div>'+
        '<p class="ps-pie">Reemplaza al botón BUSCAR del Excel: la semana se arma sola desde el Plan anual.'+(reg&&reg.abrir?'':' El registro de cada máquina (CFA-CA-F-023) se llena en la próxima etapa.')+'</p>';
    }
    main.innerHTML='<section class="ps" id="ps-raiz">'+(window.glacialMttoTabs?window.glacialMttoTabs.html('semanal'):'')+
      '<header class="ps-cab"><div class="ps-sem"><button type="button" class="btn btn-ghost" data-ps-mover="-1" aria-label="Semana anterior">‹</button>'+
      '<div><h2>Semana '+UI.sem.semana+(esHoy?' <em>actual</em>':'')+' <small>'+esc(N.etiquetaSemana(UI.sem.semana))+'</small></h2><small>'+esc(N.textoRango(UI.sem.anio,UI.sem.semana))+' · Planta de Agua</small></div>'+
      '<button type="button" class="btn btn-ghost" data-ps-mover="1" aria-label="Semana siguiente">›</button>'+(esHoy?'':'<button type="button" class="btn btn-ghost btn-sm" data-ps-hoy>Ir a esta semana</button>')+'</div>'+
      '<div class="ps-filtros"><label>Línea<select data-ps-linea>'+lineas.map(l=>'<option'+(l===UI.linea?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select></label></div></header>'+cuerpo+'</section>';
  }

  document.addEventListener('click',e=>{
    const raiz=e.target.closest&&e.target.closest('#ps-raiz');if(!raiz)return;
    const mv=e.target.closest('[data-ps-mover]');
    if(mv){UI.sem=N.moverSemana(UI.sem.anio,UI.sem.semana,Number(mv.getAttribute('data-ps-mover')));pedirSemana();repintar();return;}
    if(e.target.closest('[data-ps-hoy]')){UI.sem=N.semanaDeHoy(hoyIso());pedirSemana();repintar();return;}
    const v=e.target.closest('[data-ps-ver]');
    if(v){const k=v.getAttribute('data-ps-ver');if(UI.abiertas.has(k))UI.abiertas.delete(k);else UI.abiertas.add(k);repintar();return;}
    const a=e.target.closest('[data-ps-abrir]');
    if(a&&window.glacialMttoRegistroPantalla&&window.glacialMttoRegistroPantalla.abrir){window.glacialMttoRegistroPantalla.abrir(a.getAttribute('data-ps-abrir'),UI.sem.anio,UI.sem.semana);return;}
    if(e.target.closest('[data-ps-recargar]'))D.cargar();
  });
  document.addEventListener('change',e=>{const t=e.target;if(t&&t.hasAttribute&&t.hasAttribute('data-ps-linea')&&t.closest('#ps-raiz')){UI.linea=t.value;repintar();}});
  function repintar(){
    if(typeof state==='undefined'||state.currentTab!==TAB)return;
    const m=document.getElementById('main');if(m)pintar(m);
  }
  D.alCambiar(repintar);

  function estilos(){
    if(document.getElementById('ps-estilos'))return;
    const s=document.createElement('style');s.id='ps-estilos';
    s.textContent=window.glacialMttoTabs.css+'.ps{max-width:1280px;margin:0 auto;padding:4px 2px 24px}.ps-cab{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px}'+
      '.ps-sem{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.ps-sem h2{margin:0;font-size:22px}.ps-sem h2 small{font-size:13px;color:#7a8794;font-weight:600}.ps-sem h2 em{font-style:normal;font-size:11.5px;background:#e4f4fb;color:var(--brand-700,#0877A6);border-radius:999px;padding:2px 8px;margin-left:6px;vertical-align:middle}'+
      '.ps-sem>div>small{color:#5b6b79;font-size:12.5px}.ps-sem button{min-width:42px;min-height:42px;font-size:20px}.ps-sem .btn-sm{font-size:13px;min-height:36px}.ps-filtros label{display:flex;flex-direction:column;font-size:11.5px;color:#5b6b79;gap:2px}'+
      '.ps-filtros select{min-height:38px;border:1px solid #cfdbe3;border-radius:8px;padding:0 10px;background:#fff;font-size:14px}'+
      '.ps-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:12px}.ps-card{background:#fff;border:1px solid #dbe5ee;border-radius:var(--card-radius,14px);padding:12px 14px;box-shadow:var(--card-shadow,0 1px 2px rgba(3,51,80,.05))}'+
      '.ps-card span{display:block;font-size:12px;color:#5b6b79}.ps-card b{display:block;font-size:20px;margin-top:4px;color:#033350}.ps-card b.az{color:var(--brand-700,#0877A6)}.ps-card b.am{color:#b26a00}'+
      '.ps-cols{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:14px;align-items:start}.ps-tw{background:#fff;border:1px solid #dbe5ee;border-radius:var(--card-radius,14px);overflow:auto}.ps-t{border-collapse:collapse;width:100%;min-width:640px;font-size:13.5px}'+
      '.ps-t th{background:#eef3fa;color:#033350;font-size:11.5px;letter-spacing:.03em;padding:9px 10px;text-align:left}.ps-t td{padding:9px 10px;border-top:1px solid #edf2f7;vertical-align:middle}.ps-t td small{display:block;color:#7a8794;font-size:11.5px;margin-top:2px}'+
      '.ps-av{display:flex;align-items:center;gap:8px;min-width:150px}.ps-barra{flex:1;height:8px;border-radius:5px;background:#e4ecf3;overflow:hidden}.ps-barra i{display:block;height:100%;background:var(--brand,#0DB5F3)}.ps-barra i.ok{background:#1a9a57}.ps-av span{font-size:12px;color:#46627a;white-space:nowrap}'+
      '.ps-est{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:3px 9px;letter-spacing:.02em}.ps-pend{background:#eef1f4;color:#46627a}.ps-curso{background:#dff1fb;color:#065F86}.ps-validar{background:#fff1d6;color:#8a5a00}.ps-ok{background:#dff3e6;color:#14532d}'+
      '.ps-acc{white-space:nowrap;text-align:right}.ps-det td{background:#f6f9fc}.ps-det ol{margin:0;padding-left:22px;columns:2;column-gap:28px;font-size:13px}.ps-det li{margin:3px 0;break-inside:avoid}.ps-det small{display:inline;color:#7a8794}.ps-mut{color:#9aa7b3}'+
      '.ps-vivo{background:#fff;border:1px solid #dbe5ee;border-radius:var(--card-radius,14px);padding:12px 14px}.ps-vivo h3{margin:0 0 8px;font-size:15px;display:flex;justify-content:space-between;align-items:center}.ps-vivo h3 small{font-size:11.5px;color:#9aa7b3;font-weight:400}.ps-vivo h3 small.on{color:#1a7f4b;font-weight:600}'+
      '.ps-vivo ul{list-style:none;margin:0;padding:0}.ps-vivo li{padding:7px 0;border-top:1px solid #edf2f7;font-size:12.5px;color:#46627a;overflow-wrap:anywhere}.ps-vivo li span{color:#7a8794;margin-right:4px}.ps-vivo li b{color:#033350}.ps-vivo p{font-size:12.5px;margin:0}'+
      '.ps-aviso{background:#fff;border:1px dashed #cfdbe3;border-radius:12px;padding:16px;color:#46627a;margin:8px 0}.ps-pie{font-size:12px;color:#7a8794;margin-top:10px}'+
      '@media(max-width:900px){.ps-sem{display:grid;grid-template-columns:auto minmax(0,1fr) auto;width:100%}.ps-sem .btn-sm{grid-column:1/-1;justify-self:start}.ps-cols{grid-template-columns:1fr}.ps-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.ps-det ol{columns:1}.ps-sem h2{font-size:19px}}';
    document.head.appendChild(s);
  }

  /* ---------- navegación (mismo patrón que Plan anual) ---------- */
  function ir(){
    if(!puedeVer()){alert('No tienes permiso para ver esta pantalla.');return;}
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    D.escuchar();normalizar();pedirSemana();
    state.currentTab=TAB;
    if(typeof renderSidebar==='function')renderSidebar();
    if(typeof renderMain==='function')renderMain();
  }
  window.goProgramaSemanalMtto=ir;
  window.glacialMttoProgramaSemanal={UI,pintar,filas,puedeVer};

  if(typeof ajustarVistaSegunPermisos==='function'){
    const a=ajustarVistaSegunPermisos;
    ajustarVistaSegunPermisos=function(){if(state.currentTab===TAB&&puedeVer())return;return a.apply(this,arguments);};
  }
  if(typeof renderMain==='function'){
    const a=renderMain;
    renderMain=function(){
      if(state.currentTab===TAB&&!state.showWelcome&&puedeVer()){pintar(document.getElementById('main'));return;}
      return a.apply(this,arguments);
    };
  }
  if(typeof renderSidebar==='function'){
    const a=renderSidebar;
    renderSidebar=function(){
      const r=a.apply(this,arguments);
      const b=document.getElementById(BOTON);
      if(b){
        const m=puedeVer();b.hidden=!m;b.style.display=m?'':'none';
        b.classList.toggle('active',m&&state.currentTab===TAB);
        if(m&&state.currentTab===TAB)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
      }
      if(typeof actualizarGruposSidebar==='function')actualizarGruposSidebar();
      return r;
    };
  }
})();
