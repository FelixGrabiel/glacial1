/* =============================================================
   GLACIAL · BARRAS DE DESPLAZAMIENTO HORIZONTAL VISIBLES EN TODA LA APP
   -------------------------------------------------------------
   Las tablas anchas se desplazan dentro de su contenedor, pero la barra queda al final de la tabla (fuera de la pantalla en tablas largas)
   y en pantallas medianas no se nota que hay más columnas a la derecha. Aquí, a cada contenedor con desplazamiento horizontal real se le
   pone ARRIBA una barra espejo (sincronizada en los dos sentidos) que se ve siempre. Solo aparece cuando el contenido no cabe y se quita
   sola cuando cabe; no toca la tabla ni sus datos.
   Contenedores cubiertos (selector abajo) + cualquier elemento con data-barra-superior. Rendimiento: un solo observador con espera de 200 ms,
   solo mira los contenedores del selector (no recorre toda la página) y no escribe nada si no hay cambios.
   Cargar ANTES de 12-init.js.
   ============================================================= */
(function instalarBarrasDesplazamiento(global){
  'use strict';
  if(typeof document==='undefined')return;
  const SELECTOR=['.ii-tw','.ap-tw','.hist-table-wrap','.hist-v2-table-scroll','.table-scroll','.tabla-responsive','.cp-table-wrap','.hist-report-personal-scroll',
    '.rg-scroll','[data-barra-superior]'].join(',');
  const UMBRAL=3;                                         // px de diferencia para considerar que hay desplazamiento
  const ESTILO=`.barra-sup{overflow-x:auto;overflow-y:hidden;height:14px;margin:0 0 4px;max-width:100%;scrollbar-width:auto;overscroll-behavior-inline:contain}
.barra-sup>div{height:1px}`;
  const barras=new WeakMap();                              // contenedor → {barra, relleno}
  let reloj=null,sincronizando=false;

  function asegurarEstilo(){
    if(document.getElementById('barra-sup-estilo'))return;
    const s=document.createElement('style');s.id='barra-sup-estilo';s.textContent=ESTILO;(document.head||document.documentElement).appendChild(s);
  }
  function quitar(el){
    const b=barras.get(el);
    if(b){if(b.barra.parentNode)b.barra.parentNode.removeChild(b.barra);barras.delete(el);}
  }
  function enganchar(el){
    const barra=document.createElement('div');barra.className='barra-sup';barra.setAttribute('aria-hidden','true');
    const relleno=document.createElement('div');barra.appendChild(relleno);
    el.parentNode.insertBefore(barra,el);
    const par=(a,b)=>()=>{if(sincronizando)return;sincronizando=true;b.scrollLeft=a.scrollLeft;requestAnimationFrame(()=>{sincronizando=false;});};
    barra.addEventListener('scroll',par(barra,el),{passive:true});
    el.addEventListener('scroll',par(el,barra),{passive:true});
    const info={barra,relleno};barras.set(el,info);
    return info;
  }
  function revisar(){
    reloj=null;
    asegurarEstilo();
    document.querySelectorAll(SELECTOR).forEach(el=>{
      if(!el.parentNode||el.closest('.barra-sup'))return;
      const desborda=el.scrollWidth>el.clientWidth+UMBRAL&&el.clientWidth>0;
      let info=barras.get(el);
      if(info&&!info.barra.isConnected){barras.delete(el);info=null;}       // la pantalla se volvió a dibujar
      if(!desborda){if(info)quitar(el);return;}
      if(!info)info=enganchar(el);
      const ancho=el.scrollWidth+'px';
      if(info.relleno.style.width!==ancho)info.relleno.style.width=ancho;
    });
  }
  function programar(){if(reloj)return;reloj=setTimeout(revisar,200);}
  function iniciar(){
    revisar();
    new MutationObserver(muts=>{if(muts.some(m=>!(m.target.classList&&m.target.classList.contains('barra-sup'))&&![...m.addedNodes].every(n=>n.nodeType===1&&n.classList.contains('barra-sup'))))programar();})
      .observe(document.body,{childList:true,subtree:true});
    global.addEventListener('resize',programar,{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
  global.__barrasDesplazamiento={revisar,SELECTOR};
})(typeof window!=='undefined'?window:globalThis);
