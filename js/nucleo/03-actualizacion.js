/* GLACIAL · aviso «HAY UNA ACTUALIZACIÓN NUEVA» (13/11/2026)
   Cada vez que se publica una versión nueva, todas las páginas abiertas lo avisan para que actualicen.
   Cómo: cada pocos minutos (y al volver a la pestaña) se baja index.html SIN caché y se compara con el que cargó esta página:
     · el sello de la publicación (<meta name="glacial-build">, lo pone scripts/construir-publicacion.js) y
     · las versiones «?v=…» de los scripts y estilos (cada cambio de código las sube).
   Si algo cambió, sale una barra arriba con «Actualizar ahora». «Más tarde» la reduce a una etiqueta que vuelve a abrirse a los 10 minutos.
   No recarga sola (se podría perder lo que se está escribiendo). Sin red o sin index.html, no hace nada. */
(function(raiz){
  'use strict';
  const INTERVALO_MS=3*60*1000, RECORDAR_MS=10*60*1000, PRIMERA_REVISION_MS=45*1000, MIN_ENTRE_REVISIONES_MS=30*1000, MIN_RECURSOS=10;

  /** Firma de un index.html (texto): recursos con «?v=» y sello de publicación. Ignora lo que esté entre comentarios. */
  function firmaDeTexto(html){
    const t=String(html||'').replace(/<!--[\s\S]*?-->/g,''),re=/<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']*\?v=[^"']*)["'][^>]*>/gi,set=new Set();
    let m;while((m=re.exec(t)))set.add(m[1]);
    const b=/<meta\s+name=["']glacial-build["']\s+content=["']([^"']*)["']/i.exec(t);
    return {recursos:[...set].sort(),build:b?b[1]:''};
  }
  /** Firma de la página abierta (el DOM ya cargado). */
  function firmaDeDocumento(doc){
    const set=new Set();
    doc.querySelectorAll('script[src],link[href]').forEach(e=>{const v=e.getAttribute('src')||e.getAttribute('href')||'';if(/\?v=/.test(v))set.add(v);});
    const meta=doc.querySelector('meta[name="glacial-build"]');
    return {recursos:[...set].sort(),build:meta?meta.getAttribute('content')||'':''};
  }
  /** ¿La firma publicada es distinta a la de esta página? Una descarga incompleta (muy pocos recursos) no cuenta como cambio. */
  function hayCambio(actual,publicada){
    if(!actual||!publicada||publicada.recursos.length<MIN_RECURSOS)return false;
    if(actual.build&&publicada.build&&actual.build!==publicada.build)return true;
    const mios=new Set(actual.recursos);                                  // un recurso publicado que esta página no cargó = versión nueva (los que cargó un script por su cuenta no cuentan)
    return publicada.recursos.some(r=>!mios.has(r));
  }
  const API={firmaDeTexto,firmaDeDocumento,hayCambio,INTERVALO_MS,RECORDAR_MS};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  if(typeof document==='undefined'||typeof raiz.fetch!=='function'||!raiz.location||raiz.location.protocol==='file:')return;

  let base=null,hay=false,ultima=0,reabrir=null;
  function estilos(){
    if(document.getElementById('gl-act-estilos'))return;
    const s=document.createElement('style');s.id='gl-act-estilos';
    s.textContent='#gl-act{position:fixed;left:0;right:0;top:0;z-index:2147483000;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px 16px;padding:calc(10px + env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) 10px max(16px,env(safe-area-inset-left,0px));background:#b45309;color:#fff;text-align:center;font:600 15px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.3)}'+
      '#gl-act b{font-size:16px;letter-spacing:.03em}#gl-act span{opacity:.95;font-weight:500}#gl-act .gl-btns{display:flex;gap:8px}'+
      '#gl-act button{min-height:44px;padding:0 16px;border-radius:10px;border:2px solid #fff;font:700 15px system-ui,sans-serif;cursor:pointer}'+
      '#gl-act .gl-si{background:#fff;color:#7c2d12}#gl-act .gl-no{background:transparent;color:#fff}'+
      '#gl-act.gl-mini{left:auto;right:12px;top:auto;bottom:calc(12px + env(safe-area-inset-bottom,0px));border-radius:999px;padding:6px 8px 6px 14px;gap:8px;flex-wrap:nowrap}#gl-act.gl-mini span,#gl-act.gl-mini .gl-no{display:none}#gl-act.gl-mini b{font-size:13px}#gl-act.gl-mini button{min-height:36px}'+
      '@media print{#gl-act{display:none!important}}';
    document.head.appendChild(s);
  }
  function pintar(mini){
    estilos();
    let e=document.getElementById('gl-act');
    if(!e){e=document.createElement('div');e.id='gl-act';e.setAttribute('role','alert');document.body.appendChild(e);}
    e.className=mini?'gl-mini':'';
    e.innerHTML='<b>'+(mini?'Actualización nueva':'HAY UNA ACTUALIZACIÓN NUEVA')+'</b><span>Guarda lo que estás haciendo y actualiza la página para tener los últimos cambios.</span>'+
      '<div class="gl-btns"><button type="button" class="gl-si" data-gl-act="ya">'+(mini?'Actualizar':'Actualizar ahora')+'</button><button type="button" class="gl-no" data-gl-act="luego">Más tarde</button></div>';
  }
  function mostrar(){
    hay=true;pintar(false);
    if(reabrir)clearTimeout(reabrir);
  }
  document.addEventListener('click',ev=>{
    const b=ev.target&&ev.target.closest&&ev.target.closest('[data-gl-act]');if(!b)return;
    if(b.getAttribute('data-gl-act')==='ya'){raiz.location.reload();return;}
    pintar(true);reabrir=setTimeout(()=>pintar(false),RECORDAR_MS);                          // «Más tarde»: queda una etiqueta y vuelve a abrirse
  });
  async function revisar(forzar){
    if(hay||!base)return;
    const ahora=Date.now();if(!forzar&&ahora-ultima<MIN_ENTRE_REVISIONES_MS)return;ultima=ahora;
    try{
      const r=await raiz.fetch(new URL('index.html',raiz.location.href).href+'?_='+ahora,{cache:'no-store',credentials:'omit'});
      if(!r.ok)return;
      if(hayCambio(base,firmaDeTexto(await r.text())))mostrar();
    }catch(_){/* sin red: se intenta en la próxima revisión */}
  }
  function iniciar(){
    base=firmaDeDocumento(document);
    setTimeout(()=>revisar(true),PRIMERA_REVISION_MS);
    setInterval(()=>revisar(false),INTERVALO_MS);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)revisar(false);});
    raiz.addEventListener('online',()=>revisar(true));
  }
  API.revisarAhora=()=>revisar(true);API.mostrar=mostrar;API.base=()=>base;
  raiz.glacialActualizacion=API;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})(typeof window!=='undefined'?window:globalThis);
