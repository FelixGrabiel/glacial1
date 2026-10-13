/* =============================================================
   MANTENIMIENTO · GRÁFICOS DINÁMICOS Y ESTILO VISUAL DEL MÓDULO

   Gráficos ligeros (HTML/CSS/SVG, sin librerías) para las pantallas de Mantenimiento y de Análisis de paradas:
     · barrasH   barras horizontales con la etiqueta encima o al lado (se adaptan a cualquier ancho, también a 360 px);
     · columnas  barras verticales (series de tiempo, p. ej. por semana);
     · dona      reparto por estado con leyenda.
   Son DINÁMICOS: se animan al aparecer, se resaltan al pasar el mouse o con el teclado, muestran el dato exacto en un globo (mouse, toque o foco) y cada
   barra/segmento puede ser clicable (atributos data-gm-grupo / data-gm-id) para filtrar o abrir el detalle. Se redibujan solos porque las pantallas se
   repintan con los datos en vivo (onSnapshot). Respetan «reducir movimiento» del sistema.
   El globo funciona con CUALQUIER elemento que tenga data-tip (también las barras SVG del Pareto de Análisis de paradas).
   Además trae el estilo visual común del módulo (pestañas, tarjetas, indicadores, ventanas) que refina las clases mi-* de 67c.
   Cargar antes de 47-analisis-paradas.js y de 67c-intervenciones-pantalla.js (solo necesita document).
   ============================================================= */
(function(){
  'use strict';
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const fmt=n=>(Math.round(num(n)*10)/10).toLocaleString('es-PE',{maximumFractionDigits:1});
  const PALETA=['#2f7fd0','#df8b00','#13814a','#7a4fd0','#d93a3a','#0e7490','#a21caf','#64748b'];

  /* ---------- HTML de los gráficos ---------- */
  /* filas: [{id,etiqueta,valor,sub?,color?,tip?}]; opc: {grupo (atributo data-gm-grupo), unidad, max, vacio, activo (id resaltado)} */
  function barrasH(filas,opc){
    const o=opc||{};
    const lista=(filas||[]).filter(f=>f&&num(f.valor)>=0);
    if(!lista.length)return '<div class="gm-vacio">'+esc(o.vacio||'Sin datos para graficar.')+'</div>';
    const max=num(o.max)||Math.max(...lista.map(f=>num(f.valor)),0)||1;
    return '<div class="gm-bars" role="list">'+lista.map((f,i)=>{
      const p=Math.max(num(f.valor)>0?2:0,num(f.valor)/max*100),color=f.color||PALETA[0];
      const tip=f.tip||(f.etiqueta+': '+fmt(f.valor)+(o.unidad?' '+o.unidad:''));
      const clic=o.grupo&&f.id!==undefined&&f.id!==null;
      return '<div class="gm-row'+(clic?' gm-clic':'')+(o.activo!==undefined&&o.activo!==null&&o.activo===f.id?' gm-activo':'')+'" role="listitem" data-tip="'+esc(tip)+'"'+(clic?' data-gm-grupo="'+esc(o.grupo)+'" data-gm-id="'+esc(f.id)+'" tabindex="0"':'')+'>'+
        '<div class="gm-lab"><span>'+esc(f.etiqueta)+'</span>'+(f.sub?'<small>'+esc(f.sub)+'</small>':'')+'</div>'+
        '<div class="gm-track"><div class="gm-fill" style="width:'+p.toFixed(1)+'%;background:'+esc(color)+';animation-delay:'+(i*50)+'ms"></div></div>'+
        '<div class="gm-val">'+fmt(f.valor)+(o.unidad?'<small> '+esc(o.unidad)+'</small>':'')+'</div></div>';
    }).join('')+'</div>';
  }
  /* serie: [{id,etiqueta,valor,tip?}] */
  function columnas(serie,opc){
    const o=opc||{},lista=serie||[];
    if(!lista.length||!lista.some(s=>num(s.valor)>0))return '<div class="gm-vacio">'+esc(o.vacio||'Sin datos para graficar.')+'</div>';
    const max=Math.max(...lista.map(s=>num(s.valor)))||1;
    return '<div class="gm-cols" role="list" style="--h:'+(o.altura||120)+'px">'+lista.map((s,i)=>{
      const p=Math.max(num(s.valor)>0?3:0,num(s.valor)/max*100),clic=o.grupo&&s.id!==undefined;
      return '<div class="gm-col'+(clic?' gm-clic':'')+'" role="listitem" data-tip="'+esc(s.tip||(s.etiqueta+': '+fmt(s.valor)+(o.unidad?' '+o.unidad:'')))+'"'+(clic?' data-gm-grupo="'+esc(o.grupo)+'" data-gm-id="'+esc(s.id)+'" tabindex="0"':'')+'>'+
        '<b>'+(num(s.valor)>0?fmt(s.valor):'')+'</b><div class="gm-colbar" style="height:calc(var(--h,120px)*'+(p/100).toFixed(3)+');background:'+esc(s.color||o.color||PALETA[0])+';animation-delay:'+(i*45)+'ms"></div><span>'+esc(s.etiqueta)+'</span></div>';
    }).join('')+'</div>';
  }
  /* partes: [{id,etiqueta,valor,color}]; opc: {grupo,centro (texto grande),subcentro} */
  function dona(partes,opc){
    const o=opc||{},lista=(partes||[]).filter(p=>num(p.valor)>0),total=lista.reduce((s,p)=>s+num(p.valor),0);
    if(!total)return '<div class="gm-vacio">'+esc(o.vacio||'Sin datos para graficar.')+'</div>';
    let acum=0;
    const segs=lista.map(p=>{
      const pc=num(p.valor)/total*100,clic=o.grupo&&p.id!==undefined;
      const s='<circle class="gm-seg'+(clic?' gm-clic':'')+'" cx="21" cy="21" r="15.9155" fill="none" stroke="'+esc(p.color||PALETA[0])+'" stroke-width="6" stroke-dasharray="'+pc.toFixed(2)+' '+(100-pc).toFixed(2)+'" stroke-dashoffset="'+(25-acum).toFixed(2)+'" data-tip="'+esc(p.etiqueta+': '+fmt(p.valor)+' ('+Math.round(pc)+' %)')+'"'+(clic?' data-gm-grupo="'+esc(o.grupo)+'" data-gm-id="'+esc(p.id)+'" tabindex="0"':'')+'></circle>';
      acum+=pc;return s;
    }).join('');
    return '<div class="gm-dona"><svg viewBox="0 0 42 42" role="img" aria-label="'+esc(o.aria||'Reparto')+'"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="#e8eef3" stroke-width="6"></circle>'+segs+
      '<text x="21" y="21.5" text-anchor="middle" class="gm-dona-n">'+esc(o.centro!==undefined?o.centro:fmt(total))+'</text><text x="21" y="26.5" text-anchor="middle" class="gm-dona-s">'+esc(o.subcentro||'total')+'</text></svg>'+
      '<ul class="gm-leyenda">'+lista.map(p=>'<li'+(o.grupo&&p.id!==undefined?' class="gm-clic" data-gm-grupo="'+esc(o.grupo)+'" data-gm-id="'+esc(p.id)+'" tabindex="0"':'')+' data-tip="'+esc(p.etiqueta+': '+fmt(p.valor))+'"><i style="background:'+esc(p.color||PALETA[0])+'"></i>'+esc(p.etiqueta)+' <b>'+fmt(p.valor)+'</b></li>').join('')+'</ul></div>';
  }

  /* ---------- globo con el dato exacto (mouse, toque y teclado) ---------- */
  let globo=null,ocultar=null;
  function asegurarGlobo(){
    if(globo&&document.body.contains(globo))return globo;
    globo=document.createElement('div');globo.className='gm-tip';globo.setAttribute('role','tooltip');globo.hidden=true;document.body.appendChild(globo);return globo;
  }
  function mostrar(el,x,y,ms){
    const g=asegurarGlobo();g.textContent=el.getAttribute('data-tip')||'';if(!g.textContent){g.hidden=true;return;}
    g.hidden=false;
    const w=g.offsetWidth,h=g.offsetHeight,vw=window.innerWidth,vh=window.innerHeight;
    let px=x+12,py=y-h-12;
    if(px+w>vw-6)px=Math.max(6,vw-w-6);
    if(py<6)py=y+18;
    if(py+h>vh-6)py=Math.max(6,vh-h-6);
    g.style.left=px+'px';g.style.top=py+'px';
    clearTimeout(ocultar);if(ms)ocultar=setTimeout(()=>{g.hidden=true;},ms);
  }
  const ocultarYa=()=>{clearTimeout(ocultar);if(globo)globo.hidden=true;};
  if(typeof document!=='undefined'){
    const conTip=e=>e.target&&e.target.closest?e.target.closest('[data-tip]'):null;
    document.addEventListener('mouseover',e=>{const t=conTip(e);if(t)mostrar(t,e.clientX,e.clientY);else ocultarYa();});
    document.addEventListener('mousemove',e=>{if(globo&&!globo.hidden){const t=conTip(e);if(t)mostrar(t,e.clientX,e.clientY);}});
    document.addEventListener('mouseout',e=>{if(!e.relatedTarget)ocultarYa();});
    document.addEventListener('focusin',e=>{const t=conTip(e);if(t){const r=t.getBoundingClientRect();mostrar(t,r.left+r.width/2,r.top);}});
    document.addEventListener('focusout',ocultarYa);
    document.addEventListener('touchstart',e=>{const t=conTip(e);if(t&&e.touches&&e.touches[0])mostrar(t,e.touches[0].clientX,e.touches[0].clientY,2800);else ocultarYa();},{passive:true});
    document.addEventListener('scroll',ocultarYa,true);
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape')ocultarYa();
      if((e.key==='Enter'||e.key===' ')&&e.target&&e.target.matches&&e.target.matches('[data-gm-grupo]')){e.preventDefault();e.target.click();}   // barras y segmentos clicables también con teclado
    });
  }

  /* ---------- estilos ---------- */
  const CSS=`
    .gm-panel{background:#fff;border-radius:16px;box-shadow:0 2px 12px rgba(0,43,70,.08);padding:4px 14px 12px;margin:0 0 14px}
    .gm-panel>summary{cursor:pointer;font-weight:800;color:#003b5c;padding:10px 0;list-style:none;display:flex;align-items:center;justify-content:space-between}
    .gm-panel>summary::after{content:'▾';color:#5a6b78;transition:transform .2s}.gm-panel:not([open])>summary::after{transform:rotate(-90deg)}
    .gm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
    .gm-card h5{margin:0 0 8px;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#5a6b78}
    .gm-bars{display:grid;gap:8px}
    .gm-row{display:grid;grid-template-columns:minmax(80px,34%) 1fr auto;gap:8px;align-items:center;padding:3px 4px;border-radius:8px;transition:background .15s}
    .gm-row:hover,.gm-row:focus-visible,.gm-row.gm-activo{background:#eef4f9;outline:none}
    .gm-lab{font-size:13px;line-height:1.2;color:#1b2a38;overflow:hidden}.gm-lab span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gm-lab small{display:block;color:#7a8a99;font-size:11px}
    .gm-track{height:14px;background:#e8eef3;border-radius:999px;overflow:hidden}
    .gm-fill{height:100%;border-radius:999px;transform-origin:left center;animation:gm-grow .6s cubic-bezier(.2,.8,.2,1) both;transition:filter .15s}
    .gm-row:hover .gm-fill,.gm-row:focus-visible .gm-fill{filter:brightness(1.12) saturate(1.1)}
    .gm-val{font-size:13px;font-weight:800;color:#103b57;font-variant-numeric:tabular-nums;min-width:28px;text-align:right}.gm-val small{font-weight:500;color:#7a8a99}
    .gm-clic{cursor:pointer}
    @media (max-width:520px){.gm-row{grid-template-columns:1fr auto;grid-template-areas:'l v' 't t'}.gm-row .gm-lab{grid-area:l}.gm-row .gm-val{grid-area:v}.gm-row .gm-track{grid-area:t}}
    .gm-cols{display:flex;align-items:flex-end;gap:6px;height:calc(var(--h,120px) + 38px);padding-top:6px}
    .gm-col{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;border-radius:8px;transition:background .15s}
    .gm-col:hover,.gm-col:focus-visible{background:#eef4f9;outline:none}
    .gm-col b{font-size:11px;color:#103b57;margin-bottom:2px}
    .gm-colbar{width:70%;max-width:34px;border-radius:6px 6px 2px 2px;transform-origin:bottom center;animation:gm-rise .6s cubic-bezier(.2,.8,.2,1) both;height:0;margin:0 auto;flex:0 0 auto}
    .gm-col span{font-size:10px;color:#5a6b78;margin-top:4px;white-space:nowrap}
    .gm-dona{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.gm-dona svg{width:132px;height:132px;flex:0 0 auto}
    .gm-seg{transition:stroke-width .15s,opacity .15s;animation:gm-fade .7s ease both}.gm-seg:hover,.gm-seg:focus-visible{stroke-width:7.4;outline:none}
    .gm-dona-n{font-size:7px;font-weight:800;fill:#003b5c}.gm-dona-s{font-size:2.8px;fill:#5a6b78}
    .gm-leyenda{list-style:none;margin:0;padding:0;display:grid;gap:4px;font-size:13px;flex:1;min-width:130px}
    .gm-leyenda li{display:flex;align-items:center;gap:6px;padding:2px 6px;border-radius:6px}.gm-leyenda li:hover{background:#eef4f9}.gm-leyenda i{width:10px;height:10px;border-radius:3px;flex:0 0 auto}.gm-leyenda b{margin-left:auto}
    .gm-vacio{padding:12px;border:1px dashed #c5d0db;border-radius:10px;color:#5a6b78;font-size:12px;background:#f8fafc}
    .gm-tip{position:fixed;z-index:10100;max-width:260px;background:#0f2a3d;color:#fff;font-size:12px;line-height:1.35;padding:6px 10px;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.28);pointer-events:none}
    .gm-svg-bar{transform-box:fill-box;transform-origin:bottom center;animation:gm-rise .6s cubic-bezier(.2,.8,.2,1) both;transition:filter .15s}.gm-svg-bar:hover{filter:brightness(1.15)}
    .gm-svg-barh{transform-box:fill-box;transform-origin:left center;animation:gm-grow .6s cubic-bezier(.2,.8,.2,1) both}
    @keyframes gm-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
    @keyframes gm-rise{from{transform:scaleY(0)}to{transform:scaleY(1)}}
    @keyframes gm-fade{from{opacity:0}to{opacity:1}}
    @media (prefers-reduced-motion:reduce){.gm-fill,.gm-colbar,.gm-seg,.gm-svg-bar,.gm-svg-barh{animation:none!important}}

    /* ----- estilo visual común del módulo de Mantenimiento (refina las clases mi-*) ----- */
    body .mi-tabs{background:linear-gradient(180deg,#eaf1f6,#dfe9f0);border-radius:14px;padding:5px;position:sticky;top:0;z-index:6;box-shadow:0 2px 6px rgba(0,43,70,.08)}
    body .mi-tab{border-radius:10px;padding:10px 16px;transition:background .18s,color .18s,box-shadow .18s}
    body .mi-tab:not(.active):hover{background:rgba(255,255,255,.65);color:#003b5c}
    body .mi-tab.active{background:#fff;box-shadow:0 2px 8px rgba(0,43,70,.18)}
    body .mi-kpis{gap:10px}
    body .mi-kpi{border:0;border-top:4px solid var(--c,#64748b);border-radius:14px;box-shadow:0 2px 10px rgba(0,43,70,.08);padding:10px 12px;transition:transform .15s,box-shadow .15s}
    body .mi-kpi:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,43,70,.14)}
    body .mi-kpi b{font-size:28px;line-height:1.1}
    body .mi-card{border:0;border-radius:14px;box-shadow:0 2px 10px rgba(0,43,70,.08);position:relative;padding:12px 14px 12px 18px;overflow:hidden;transition:transform .15s,box-shadow .15s;animation:gm-fade .35s ease both}
    body .mi-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:6px;background:var(--c,#64748b)}
    body .mi-card:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,43,70,.15)}
    body .mi-card h4{font-size:16px}
    body .mi-chip{padding:2px 10px;box-shadow:inset 0 0 0 1px var(--b,#94a3b8)}
    body .mi-aviso,body .mi-error,body .mi-vacio,body .mi-pend{border-radius:12px}
    body .mi-filtros{background:#fff;border-radius:12px;padding:10px;box-shadow:0 1px 6px rgba(0,43,70,.06)}
    body .mi-filtros select,body .mi-filtros input,body .mi-form select,body .mi-form input,body .mi-form textarea{border-radius:10px;border-color:#c9d6e0;transition:border-color .15s,box-shadow .15s}
    body .mi-filtros select:focus,body .mi-filtros input:focus,body .mi-form select:focus,body .mi-form input:focus,body .mi-form textarea:focus{outline:none;border-color:#2f7fd0;box-shadow:0 0 0 3px rgba(47,127,208,.2)}
    body .mi-fondo{backdrop-filter:blur(3px)}
    body .mi-modal{border-radius:18px;box-shadow:0 20px 56px rgba(0,0,0,.35);animation:gm-pop .22s ease both}
    body .mi-tabla th{background:#f3f7fa}body .mi-tabla tr:hover td{background:#f8fbfd}
    body #mi-cuerpo .btn{border-radius:10px;transition:transform .12s,box-shadow .12s}body #mi-cuerpo .btn:active{transform:scale(.97)}
    body .mi-crono{border-left-color:#9ec5ea}
    @keyframes gm-pop{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
    @media (prefers-reduced-motion:reduce){body .mi-card,body .mi-modal{animation:none!important}}
  `;
  if(typeof document!=='undefined'&&document.head&&!document.getElementById('gm-css')){
    const s=document.createElement('style');s.id='gm-css';s.textContent=CSS;document.head.appendChild(s);
  }

  window.glacialGraficos={PALETA,barrasH,columnas,dona,fmt,mostrar,ocultar:ocultarYa};
})();
