/* =====================================================================================================================
   MANTENIMIENTO · HISTORIAL DE REGISTROS · pantalla · docs/mantenimiento/plan-y-registro.md (punto 4.4)
   Lista de los registros CFA-CA-F-023 de un año, filtrable por máquina, semana, técnico/maquinista y estado. Cada uno se puede abrir (solo lectura si ya
   está cerrado o validado) y reimprimir en su formato de 1 hoja. Se actualiza en vivo: un registro que se cierra o se valida cambia de estado sin recargar.
   ===================================================================================================================== */
(function(){
  'use strict';
  const TAB='historial-mtto',BOTON='btn-historial-mtto';
  const N=window.glacialMttoPlan,D=window.glacialMttoPlanDatos;
  if(!N||!D)return;
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ahoraMs=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const hoyIso=()=>GlacialFecha.fechaISOLocal(ahoraMs());          // fecha de hoy en hora de Lima (01b-fecha-operativa.js)
  const PASO=50;
  const UI={anio:0,maquinaId:'',semana:'',estado:'',texto:'',limite:PASO};
  const PANT=()=>window.glacialMttoPlanPantalla;
  const puedeVer=()=>!!(PANT()&&PANT().puedeVer());
  const hhmmFecha=iso=>{const t=Date.parse(iso||'');return t?new Date(t).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'America/Lima'}):'';};

  function normalizar(){
    if(!UI.anio)UI.anio=N.semanaDeHoy(hoyIso()).anio;
    const hoy=N.semanaDeHoy(hoyIso()).anio;
    return [...new Set([UI.anio,hoy,hoy-1].concat(D.anios()))].sort((a,b)=>b-a);          // el año actual, el anterior y los que ya tengan datos
  }
  function pintar(main){
    estilos();
    const anios=normalizar(),c=D.cache;
    const maqs=c.maquinas.filter(m=>m.activo!==false);
    const todos=c.anioHistorial===UI.anio?c.historial:[];
    const lista=N.filtrarHistorial(todos,c.maquinas,UI),cont=N.conteoEstados(todos);
    const maq=id=>c.maquinas.find(m=>m.id===id)||{nombre:'—',codigo_hoja:''};
    let cuerpo;
    if(c.cargandoHistorial&&!todos.length)cuerpo='<div class="hs-aviso">Cargando el historial…</div>';
    else if(c.errorHistorial)cuerpo='<div class="hs-aviso">'+esc(c.errorHistorial)+' <button type="button" class="btn btn-ghost btn-sm" data-hs-recargar>Reintentar</button></div>';
    else if(!todos.length)cuerpo='<div class="hs-aviso">Todavía no hay registros en '+UI.anio+'. Se crean con «Iniciar» desde el Programa semanal.</div>';
    else if(!lista.length)cuerpo='<div class="hs-aviso">Ningún registro coincide con los filtros.</div>';
    else{
      const vis=lista.slice(0,UI.limite);
      cuerpo='<div class="hs-tw"><table class="hs-t"><thead><tr><th>SEMANA</th><th>MÁQUINA</th><th>TÉCNICO / MAQUINISTA</th><th>ESTADO</th><th>CIERRE / VALIDACIÓN</th><th></th></tr></thead><tbody>'+vis.map(r=>{
        const e=N.ESTADOS_REG[r.estado]||N.ESTADOS_REG.PENDIENTE,rg=N.rangoSemana(r.anio,r.semana);
        return '<tr><td><b>'+esc(N.etiquetaSemana(r.semana))+'</b><span class="hs-rango">del '+esc(N.ddmm(rg.desde))+' al '+esc(N.ddmmaaaa(rg.hasta))+'</span>'+(r.fecha?'<small>Registro del '+esc(N.ddmmaaaa(r.fecha))+'</small>':'')+'</td>'+
          '<td><b>'+esc(maq(r.maquina_id).nombre)+'</b><small>'+esc(r.tipo_mtto?r.tipo_mtto.charAt(0)+r.tipo_mtto.slice(1).toLowerCase():'')+' · '+esc(r.condicion?r.condicion.charAt(0)+r.condicion.slice(1).toLowerCase():'')+'</small></td>'+
          '<td>'+(r.tecnico_senior||r.maquinista?'<b>'+esc(r.tecnico_senior||'—')+'</b>'+(r.maquinista?'<small>'+esc(r.maquinista)+'</small>':''):'<span class="hs-mut">—</span>')+'</td>'+
          '<td><span class="ps-est ps-'+e.cls+'">'+e.txt+'</span></td>'+
          '<td>'+(r.cerrado_en?'<small>Cerró: '+esc(hhmmFecha(r.cerrado_en))+'</small>':'')+(r.validado_en?'<small>Validó: '+esc(r.validado_por||'')+' · '+esc(hhmmFecha(r.validado_en))+'</small>':'')+(!r.cerrado_en&&!r.validado_en?'<span class="hs-mut">—</span>':'')+'</td>'+
          '<td class="hs-acc"><button type="button" class="btn btn-ghost btn-sm" data-hs-ver="'+esc(r.id)+'">Abrir</button> <button type="button" class="btn btn-ghost btn-sm" data-hs-imprimir="'+esc(r.id)+'">Imprimir</button></td></tr>';
      }).join('')+'</tbody></table></div>'+
        (lista.length>vis.length?'<div class="hs-mas"><button type="button" class="btn btn-ghost" data-hs-mas>Mostrar '+Math.min(PASO,lista.length-vis.length)+' más ('+(lista.length-vis.length)+' restantes)</button></div>':'')+
        '<p class="hs-pie">'+lista.length+' registro'+(lista.length===1?'':'s')+(lista.length!==todos.length?' de '+todos.length:'')+' en '+UI.anio+'.</p>';
    }
    /* Semana (13/11/2026): cada opción dice de qué día a qué día es (lunes a domingo, semana ISO) y cuántos registros tiene; la de hoy, marcada. */
    const hoySem=N.semanaDeHoy(hoyIso()),porSemana=new Map();
    todos.forEach(r=>porSemana.set(r.semana,(porSemana.get(r.semana)||0)+1));
    const semanaOpc=Array.from({length:N.semanasDelAnio(UI.anio)},(_,i)=>N.semanasDelAnio(UI.anio)-i).map(sm=>{
      const rg=N.rangoSemana(UI.anio,sm),n=porSemana.get(sm)||0,esHoy=hoySem.anio===UI.anio&&hoySem.semana===sm;
      return '<option value="'+sm+'"'+(String(UI.semana)===String(sm)?' selected':'')+'>'+esc(N.etiquetaSemana(sm))+' · '+esc(N.ddmm(rg.desde))+' al '+esc(N.ddmm(rg.hasta))+(esHoy?' · esta semana':'')+(n?' ('+n+')':'')+'</option>';
    }).join('');
    const estadoOpc=['PENDIENTE','EN_CURSO','CERRADO','VALIDADO'].map(k=>'<option value="'+k+'"'+(UI.estado===k?' selected':'')+'>'+N.ESTADOS_REG[k].txt+' ('+cont[k]+')</option>').join('');
    main.innerHTML='<section class="hs" id="hs-raiz">'+(window.glacialMttoTabs?window.glacialMttoTabs.html('historial'):'')+
      '<header class="hs-cab"><div><small>Planta de Agua · Registros CFA-CA-F-023</small><h2>Historial de registros</h2></div></header>'+
      '<div class="hs-filtros"><label>Año<select data-hs="anio">'+anios.map(a=>'<option'+(a===UI.anio?' selected':'')+'>'+a+'</option>').join('')+'</select></label>'+
      '<label>Máquina<select data-hs="maquinaId"><option value="">Todas</option>'+maqs.map(m=>'<option value="'+esc(m.id)+'"'+(UI.maquinaId===m.id?' selected':'')+'>'+esc(m.codigo_hoja)+' · '+esc(m.nombre)+'</option>').join('')+'</select></label>'+
      '<label>Semana<select data-hs="semana"><option value="">Todas</option>'+semanaOpc+'</select></label>'+
      '<label>Técnico o maquinista<input type="search" data-hs="texto" value="'+esc(UI.texto)+'" placeholder="Nombre"></label>'+
      '<label>Estado<select data-hs="estado"><option value="">Todos</option>'+estadoOpc+'</select></label></div>'+cuerpo+'</section>';
  }

  document.addEventListener('click',e=>{
    const raiz=e.target.closest&&e.target.closest('#hs-raiz');if(!raiz)return;
    const v=e.target.closest('[data-hs-ver]');
    if(v){const r=D.cache.historial.find(x=>x.id===v.getAttribute('data-hs-ver'));const R=window.glacialMttoRegistroPantalla;if(r&&R)R.abrir(r.maquina_id,r.anio,r.semana);return;}
    const im=e.target.closest('[data-hs-imprimir]');
    if(im&&window.glacialMttoRegistroImpresion){window.glacialMttoRegistroImpresion.imprimir(im.getAttribute('data-hs-imprimir'));return;}
    if(e.target.closest('[data-hs-mas]')){UI.limite+=PASO;repintar(false);return;}
    if(e.target.closest('[data-hs-recargar]'))D.cargarHistorial(UI.anio);
  });
  /* El filtro de texto se aplica al escribir sin perder el foco: solo se repinta la lista. */
  function aplicar(t){
    const k=t.getAttribute('data-hs');if(!k)return;
    UI[k]=k==='anio'?Number(t.value):t.value;UI.limite=PASO;
    if(k==='anio'){D.cargarHistorial(UI.anio);}
    repintar(k==='texto');
  }
  document.addEventListener('change',e=>{const t=e.target;if(t&&t.closest&&t.closest('#hs-raiz')&&t.hasAttribute('data-hs')&&t.tagName==='SELECT')aplicar(t);});          // los textos ya se aplican al escribir (input)
  document.addEventListener('input',e=>{const t=e.target;if(t&&t.closest&&t.closest('#hs-raiz')&&t.hasAttribute('data-hs')&&(t.type==='search'||t.type==='number'))aplicar(t);});
  let pintando=false;
  function repintar(conservarFoco){
    if(pintando||typeof state==='undefined'||state.currentTab!==TAB)return;          // al quitar el campo enfocado el navegador dispara «blur»: no se repinta dentro de un repintado
    const m=document.getElementById('main');if(!m)return;pintando=true;try{
    const act=document.activeElement,id=conservarFoco&&act&&act.getAttribute&&act.getAttribute('data-hs'),pos=conservarFoco&&act&&act.selectionStart;
    pintar(m);
    if(id){const n=m.querySelector('[data-hs="'+id+'"]');if(n){n.focus();try{if(typeof pos==='number')n.setSelectionRange(pos,pos);}catch(_){/* número */}}}
    }finally{pintando=false;}
  }
  D.alCambiar(()=>{
    if(typeof state==='undefined'||state.currentTab!==TAB)return;
    const act=document.activeElement;
    repintar(!!(act&&act.closest&&act.closest('#hs-raiz')&&act.hasAttribute('data-hs')));
  });

  function estilos(){
    if(document.getElementById('hs-estilos'))return;
    const s=document.createElement('style');s.id='hs-estilos';
    s.textContent=window.glacialMttoTabs.css+'.hs{max-width:1280px;margin:0 auto;padding:4px 2px 24px}.hs-cab small{color:#5b6b79;font-size:12px}.hs-cab h2{margin:2px 0 12px;font-size:22px}'+
      '.hs-filtros{display:grid;grid-template-columns:110px minmax(180px,1.3fr) minmax(220px,1fr) minmax(160px,1fr) 170px;gap:10px;margin-bottom:12px}.hs-filtros label{display:flex;flex-direction:column;font-size:11.5px;color:#5b6b79;gap:2px;min-width:0}'+
      '.hs-filtros select,.hs-filtros input{min-height:40px;border:1px solid #cfdbe3;border-radius:8px;padding:0 10px;background:#fff;font-size:14px;width:100%;box-sizing:border-box}'+
      '.hs-tw{background:#fff;border:1px solid #dbe5ee;border-radius:var(--card-radius,14px);overflow:auto}.hs-t{border-collapse:collapse;width:100%;min-width:760px;font-size:13.5px}.hs-t th{background:#eef3fa;color:#033350;font-size:11.5px;letter-spacing:.03em;padding:9px 10px;text-align:left}'+
      '.hs-t td{padding:9px 10px;border-top:1px solid #edf2f7;vertical-align:middle}.hs-t td small{display:block;color:#7a8794;font-size:11.5px;margin-top:2px}.hs-rango{display:block;color:#033350;font-size:12.5px;margin-top:2px;white-space:nowrap}.hs-acc{white-space:nowrap;text-align:right}.hs-mut{color:#9aa7b3}'+
      '.hs-aviso{background:#fff;border:1px dashed #cfdbe3;border-radius:12px;padding:16px;color:#46627a;margin:8px 0}.hs-mas{text-align:center;margin:12px 0}.hs-pie{font-size:12px;color:#7a8794;margin-top:8px}'+
      '@media(max-width:900px){.hs-filtros{grid-template-columns:1fr 1fr}.hs-cab h2{font-size:19px}}';
    document.head.appendChild(s);
  }

  /* ---------- navegación (mismo patrón que Plan anual) ---------- */
  function ir(){
    if(!puedeVer()){alert('No tienes permiso para ver esta pantalla.');return;}
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    D.escuchar();normalizar();D.cargarHistorial(UI.anio);
    state.currentTab=TAB;
    if(typeof renderSidebar==='function')renderSidebar();
    if(typeof renderMain==='function')renderMain();
  }
  window.goHistorialMtto=ir;
  window.glacialMttoHistorial={UI,pintar,puedeVer};

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
