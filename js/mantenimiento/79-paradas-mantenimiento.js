/* =====================================================================================================================
   MANTENIMIENTO ↔ PRODUCCIÓN · paradas por falla de cada máquina del plan (13/11/2026) · docs/mantenimiento/plan-y-registro.md
   Une las paradas que registra Producción (equipo, línea, minutos, motivo: Análisis de paradas) con las máquinas del Plan anual por una tabla de equivalencias
   («Sopladora de PET2» → hoja SOP CARB) guardada en mtto_config.datos.equiposPlan. Solo lee: no escribe paradas.
   Lo usan el Plan anual (tarjeta «Paradas y mantenimiento»), el Registro (paradas de la semana) y el Inicio de Mantenimiento (fallas repetitivas).
   Cargar después de 71, 72 y de Análisis de paradas (47) y de la configuración de motivos (37e).
   ===================================================================================================================== */
(function(){
  'use strict';
  if(typeof window==='undefined'||!window.glacialMttoPlan)return;
  const N=window.glacialMttoPlan,DIAS_VENTANA=30;
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const D=()=>window.glacialMttoPlanDatos,A=()=>window.glacialAnalisisParadas;
  const iso=ms=>{const d=new Date(ms),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
  const hoyOp=()=>{try{if(window.GlacialIndicadores&&window.GlacialIndicadores.diaOperativo)return window.GlacialIndicadores.diaOperativo(ahora());}catch(_){/* fecha local */}return iso(ahora());};
  const restar=(f,n)=>{const d=new Date(f+'T12:00:00');d.setDate(d.getDate()-n);return iso(d.getTime());};
  const ddmm=f=>String(f||'').split('-').reverse().slice(0,2).join('/');
  const min=m=>Math.round(m).toLocaleString('es-PE');
  const nombreLinea=k=>{try{const l=(typeof LINES!=='undefined'?LINES:[]).find(x=>x.key===k);return l?l.name:k;}catch(_){return k;}};

  const tabla=()=>{const c=D()&&D().cache.config;const t=c&&c.datos&&c.datos.equiposPlan;return Array.isArray(t)&&t.length?t:N.EQUIPOS_PLAN_DEFECTO;};
  let memo=null;
  /** Paradas por falla de los últimos 30 días agrupadas por máquina del plan, o null si Análisis de paradas todavía no está listo. */
  function datos(){
    const a=A(),d=D();if(!a||typeof a.listarUnidades!=='function'||!d||!d.cache.listo)return null;
    const hoy=hoyOp(),cfgv=d.cache.config?d.cache.config.version:0,llave=[hoy,cfgv,d.cache.maquinas.length,Math.floor(ahora()/45000)].join('|');
    if(memo&&memo.llave===llave&&memo.a===a)return memo.v;
    let r;try{r=a.listarUnidades(restar(hoy,DIAS_VENTANA),hoy,{});}catch(_){return null;}
    let cfg={fallasUmbral:3,fallasDias:7};try{if(window.glacialMotivosParada&&window.glacialMotivosParada.analisisConfig)cfg=window.glacialMotivosParada.analisisConfig();}catch(_){/* umbral de siempre */}
    const por=N.paradasPorMaquina(r.unidades,d.cache.maquinas,tabla(),a.equipoDeParada,cfg,hoy);
    memo={llave,a,v:{por,hoy,cfg,desde:restar(hoy,DIAS_VENTANA)}};return memo.v;
  }
  const mapeada=m=>tabla().some(r=>r.hoja&&r.hoja===m.codigo_hoja);
  /** Paradas por falla de una semana de la máquina (para el Registro). */
  function deSemana(maq,anio,semana){
    const x=datos();if(!x)return null;const g=x.por.get(maq.id),r=N.rangoSemana(anio,semana);
    return {items:g?g.items.filter(i=>i.fecha>=r.desde&&i.fecha<=r.hasta):[],g:g||null,x};
  }
  /** Fallas repetitivas de todas las máquinas (para el Inicio). */
  function repetitivas(){
    const x=datos();if(!x)return null;
    return [...x.por.values()].filter(g=>g.repetitiva).sort((a,b)=>b.repetitiva.n-a.repetitiva.n||b.repetitiva.minutos-a.repetitiva.minutos);
  }
  function topPorMinutos(n){
    const x=datos();if(!x)return null;
    return [...x.por.values()].sort((a,b)=>b.minutos-a.minutos).slice(0,n);
  }

  /* ---------- piezas de pantalla ---------- */
  function estilos(){
    if(document.getElementById('mpd-estilos'))return;
    const s=document.createElement('style');s.id='mpd-estilos';
    s.textContent='.mpd{background:#fff;border:1px solid #dbe5ee;border-radius:14px;padding:12px 14px;margin:0 0 12px}.mpd h4{margin:0 0 8px;font-size:14px;color:#033350;display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}'+
      '.mpd-ks{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.mpd-k{background:#f6fafd;border:1px solid #dbe5ee;border-radius:10px;padding:8px 10px}.mpd-k span{display:block;font-size:11.5px;color:#5b6b79}.mpd-k b{display:block;font-size:19px;color:#033350;margin:1px 0}.mpd-k small{display:block;font-size:11.5px;color:#5b6b79;overflow-wrap:anywhere}'+
      '.mpd-k.mal{background:#fff6f6;border-color:#f0b9b9}.mpd-k.mal b{color:#b42318}.mpd-k.aten{background:#fff8f2;border-color:#f0c8a0}.mpd-k.aten b{color:#b45309}'+
      '.mpd-alerta{background:#fff4d6;border:1px solid #ecd48b;color:#6b4a00;border-radius:10px;padding:8px 12px;margin:0 0 8px;font-size:13px}.mpd-ok{color:#1a7f4b;font-size:13px}.mpd-nota{font-size:12.5px;color:#5b6b79;margin:6px 0 0}'+
      '.mpd-lista{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:4px}.mpd-lista li{display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap;font-size:12.5px;background:#f6f9fc;border-radius:8px;padding:5px 9px}.mpd-lista small{color:#5b6b79}'+
      '.mpd details summary{cursor:pointer;font-size:13px;color:#065F86;margin-top:8px}.mpd-link{background:none;border:0;color:#065F86;text-decoration:underline;cursor:pointer;font:inherit;padding:0}'+
      '.mpd-eq td,.mpd-eq th{padding:6px 8px;font-size:13px;text-align:left}.mpd-eq select{min-height:36px;border:1px solid #cfdbe3;border-radius:8px;padding:0 8px;max-width:100%}';
    document.head.appendChild(s);
  }
  const k=(t,v,sub,cls)=>'<div class="mpd-k '+(cls||'')+'"><span>'+esc(t)+'</span><b>'+v+'</b>'+(sub?'<small>'+sub+'</small>':'')+'</div>';

  /** Tarjeta «Paradas y mantenimiento» del Plan anual: paradas por falla de la máquina (30 días) frente a su preventivo. ctx: {actual, ejec, desde, editar}. */
  function htmlTarjetaPlan(maq,ctx){
    estilos();
    const x=datos();
    if(!x)return '<section class="mpd"><h4>Paradas y mantenimiento</h4><p class="mpd-nota">Esperando los datos de paradas de Producción…</p></section>';
    const g=x.por.get(maq.id),mape=mapeada(maq);
    const prev=ctx&&ctx.ejec?N.estadoPreventivo(maq.id,D().cache.actividades,ctx.ejec,ctx.actual,ctx.desde):null;
    const eq=ctx&&ctx.editar?'<button type="button" class="mpd-link" data-mpd-equiv>Equivalencias con Producción</button>':'';
    if(!mape&&!g)return '<section class="mpd"><h4>Paradas y mantenimiento '+eq+'</h4><p class="mpd-nota">Esta máquina todavía no tiene un equipo de Producción asociado, por eso no se muestran sus paradas.'+(ctx&&ctx.editar?' Asócialo en «Equivalencias con Producción».':'')+'</p></section>';
    const rep=g&&g.repetitiva?'<div class="mpd-alerta" role="alert"><b>Falla repetitiva:</b> '+g.repetitiva.n+' paradas por falla en los últimos '+g.repetitiva.dias+' días ('+min(g.repetitiva.minutos)+' min, del '+ddmm(g.repetitiva.desde)+' al '+ddmm(g.repetitiva.hasta)+').</div>':'';
    const fallas=g?g.fallas:0;
    const tiles=k('Paradas por falla ('+DIAS_VENTANA+' días)',fallas,fallas?min(g.minutos)+' min · última el '+ddmm(g.ultima):'sin paradas por falla',fallas>=(x.cfg.fallasUmbral||3)?'aten':'')+
      (prev?k('Preventivo vencido',prev.vencidas,prev.vencidas?'semanas pasadas sin hacer':(prev.base?'al día':'aún sin semanas para medir'),prev.vencidas?'mal':'')+
        k('Último preventivo hecho',prev.ultimaHecha?'S'+prev.ultimaHecha.semana:'—',prev.ultimaHecha?esc(String(prev.ultimaHecha.actividad||'').slice(0,60)):'todavía no hay registros hechos'):'');
    const noReal=prev&&prev.noRealizadas.length?'<div class="mpd-alerta"><b>No se realizó:</b> '+prev.noRealizadas.slice(0,3).map(n=>esc(String(n.actividad||'').slice(0,50))+' (S'+n.semana+(n.motivo?' · '+esc(n.motivo):'')+')').join(' · ')+(prev.noRealizadas.length>3?' y '+(prev.noRealizadas.length-3)+' más':'')+'</div>':'';
    const lista=g&&g.items.length?'<details><summary>Ver las últimas paradas por falla ('+Math.min(g.items.length,6)+' de '+g.items.length+')</summary><ul class="mpd-lista">'+g.items.slice(0,6).map(i=>'<li><span><b>'+ddmm(i.fecha)+'</b> · '+esc(nombreLinea(i.linea))+' · '+esc(i.turno||'')+'</span><span>'+min(i.minutos)+' min'+(i.motivo?' <small>· '+esc(String(i.motivo).slice(0,70))+'</small>':'')+'</span></li>').join('')+'</ul></details>':'';
    return '<section class="mpd"><h4>Paradas y mantenimiento '+eq+'</h4>'+rep+noReal+'<div class="mpd-ks">'+tiles+'</div>'+lista+'</section>';
  }
  /** Panel del Registro: paradas por falla de esta máquina en la semana del registro. */
  function htmlPanelRegistro(maq,reg){
    estilos();
    const w=deSemana(maq,reg.anio,reg.semana);
    if(!w)return '';
    if(!mapeada(maq)&&!w.g)return '';
    const rep=w.g&&w.g.repetitiva?'<div class="mpd-alerta" role="alert"><b>Falla repetitiva:</b> '+w.g.repetitiva.n+' paradas por falla en los últimos '+w.g.repetitiva.dias+' días ('+min(w.g.repetitiva.minutos)+' min).</div>':'';
    const items=w.items;
    return '<div class="mpd"><h4>Paradas de Producción de esta semana</h4>'+rep+(items.length?'<p class="mpd-nota">'+items.length+' parada'+(items.length===1?'':'s')+' por falla · '+min(items.reduce((s,i)=>s+i.minutos,0))+' min. Revísalas antes de marcar las actividades.</p><ul class="mpd-lista">'+items.map(i=>'<li><span><b>'+ddmm(i.fecha)+'</b> · '+esc(nombreLinea(i.linea))+' · '+esc(i.turno||'')+'</span><span>'+min(i.minutos)+' min'+(i.motivo?' <small>· '+esc(String(i.motivo).slice(0,80))+'</small>':'')+'</span></li>').join('')+'</ul>':'<p class="mpd-ok">✔ Producción no registró paradas por falla de esta máquina en la semana.</p>')+
      (w.g?'<p class="mpd-nota">En los últimos '+DIAS_VENTANA+' días: '+w.g.fallas+' paradas por falla ('+min(w.g.minutos)+' min).</p>':'')+'</div>';
  }
  /** Bloque del Inicio: fallas repetitivas y las máquinas con más minutos de paradas por falla. */
  function htmlInicio(){
    estilos();
    const rep=repetitivas(),top=topPorMinutos(3);
    if(rep===null)return '';
    const fila=(g,extra)=>'<li><span><button type="button" class="mpd-link" data-mpd-abrir="'+esc(g.maquina.id)+'">'+esc(g.maquina.nombre)+'</button>'+(extra?' <small>'+extra+'</small>':'')+'</span><span>'+g.fallas+' paradas · '+min(g.minutos)+' min</span></li>';
    const alertas=rep.length?'<div class="mpd-alerta" role="alert"><b>Fallas repetitivas:</b> '+rep.map(g=>esc(g.maquina.nombre)+' ('+g.repetitiva.n+' en '+g.repetitiva.dias+' días, '+min(g.repetitiva.minutos)+' min)').join(' · ')+'</div>':'';
    const con=top.filter(g=>g.fallas>0);
    return '<div class="mpd mpd-inicio"><h4>Paradas de Producción por máquina <small style="font-weight:500;color:#5b6b79">últimos '+DIAS_VENTANA+' días</small></h4>'+alertas+(con.length?'<ul class="mpd-lista">'+con.map(g=>fila(g,g.repetitiva?'falla repetitiva':'')).join('')+'</ul>':'<p class="mpd-ok">✔ Sin paradas por falla en las máquinas del plan.</p>')+'</div>';
  }

  /* ---------- equivalencias (solo supervisor / jefe de Mantenimiento) ---------- */
  function abrirEquivalencias(){
    const d=D();if(!d||!d.cache.listo)return;
    const G=window.glacialEquipos,maquinas=d.cache.maquinas.filter(m=>m.activo!==false&&!m.pendiente_confirmar);
    const t=tabla();const filas=[];
    const lineas=(G&&G.LINEAS)||['PET1','PET2','B7L','C20L','B20L'];
    lineas.forEach(l=>{const nombres=(G&&G.lista?G.lista(l):(G&&G.EQUIPOS_DEFECTO&&G.EQUIPOS_DEFECTO[l])||[])||[];
      nombres.forEach(e=>{const r=t.find(x=>x.linea===l&&String(x.equipo).toLowerCase()===String(e).toLowerCase());filas.push({linea:l,equipo:e,hoja:r?r.hoja:(N.maquinaDeParada(l,e,maquinas,[])||{}).codigo_hoja||''});});});
    t.forEach(r=>{if(!filas.some(f=>f.linea===r.linea&&String(f.equipo).toLowerCase()===String(r.equipo).toLowerCase()))filas.push(Object.assign({},r));});
    const fondo=document.createElement('div');fondo.className='mp-modal';fondo.setAttribute('role','dialog');fondo.setAttribute('aria-modal','true');
    estilos();
    fondo.innerHTML='<div class="mp-dlg"><h3>Equivalencias con Producción</h3><p class="mpd-nota">Elige, para cada equipo que Producción usa al registrar una parada por falla, la máquina del Plan anual a la que corresponde. «Ninguna» deja ese equipo fuera.</p>'+
      '<div style="overflow:auto;max-height:55vh"><table class="mpd-eq" style="width:100%;border-collapse:collapse"><thead><tr><th>Línea</th><th>Equipo en Producción</th><th>Máquina del plan</th></tr></thead><tbody>'+
      filas.map((f,i)=>'<tr><td>'+esc(nombreLinea(f.linea))+'</td><td>'+esc(f.equipo)+'</td><td><select data-mpd-fila="'+i+'"><option value="">Ninguna</option>'+maquinas.map(m=>'<option value="'+esc(m.codigo_hoja)+'"'+(m.codigo_hoja===f.hoja?' selected':'')+'>'+esc(m.nombre)+' ('+esc(m.codigo_hoja)+')</option>').join('')+'</select></td></tr>').join('')+'</tbody></table></div>'+
      '<div class="mp-error" id="mpd-err" role="alert"></div><div class="mp-acc"><button type="button" class="btn btn-ghost" id="mpd-x">Cancelar</button><button type="button" class="btn btn-primary" id="mpd-ok">Guardar</button></div></div>';
    document.body.appendChild(fondo);
    const q=x=>fondo.querySelector(x),err=m=>{q('#mpd-err').textContent=m||'';};
    q('#mpd-x').onclick=()=>fondo.remove();
    q('#mpd-ok').onclick=async()=>{
      const nuevas=filas.map((f,i)=>({linea:f.linea,equipo:f.equipo,hoja:fondo.querySelector('[data-mpd-fila="'+i+'"]').value}));
      q('#mpd-ok').disabled=true;err('Guardando…');
      try{await d.guardarEquivalencias(nuevas);memo=null;fondo.remove();if(window.glacialMttoPlanPantalla&&window.glacialMttoPlanPantalla.repintar)window.glacialMttoPlanPantalla.repintar();}
      catch(e){err(e.message||String(e));q('#mpd-ok').disabled=false;}
    };
  }
  document.addEventListener('click',e=>{
    if(e.target.closest&&e.target.closest('[data-mpd-equiv]')){abrirEquivalencias();return;}
    const b=e.target.closest&&e.target.closest('[data-mpd-abrir]');
    if(b){const id=b.getAttribute('data-mpd-abrir'),m=D()&&D().cache.maquinas.find(x=>x.id===id),P=window.glacialMttoPlanPantalla;
      if(m&&P&&P.UI&&typeof window.goPlanAnualMtto==='function'){P.UI.linea=m.linea_impresion||'PET';P.UI.maquina=m.id;window.goPlanAnualMtto();}}
  });
  window.glacialMttoParadas={datos,deSemana,repetitivas,topPorMinutos,htmlTarjetaPlan,htmlPanelRegistro,htmlInicio,abrirEquivalencias,mapeada,DIAS_VENTANA};
})();
