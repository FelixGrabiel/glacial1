/* =============================================================
   GLACIAL · TABLAS ANCHAS EN TELÉFONO Y TABLET (21/11/2026)
   -------------------------------------------------------------
   En pantallas angostas la página recorta lo que se sale por la derecha (html/body con overflow-x:hidden) y las tablas tienen un ancho mínimo (css/styles.css),
   así que una tabla fuera de un contenedor con desplazamiento quedaba CORTADA y no se podía ver (ni deslizar). Aquí, solo en pantallas de hasta 900 px, cada tabla que
   no cabe y que no está ya dentro de un contenedor con desplazamiento horizontal se envuelve en uno (.tw-movil): se desliza con el dedo, sin cortar columnas.
   No toca tablas que caben ni las que ya tienen su propio desplazamiento; en computador no hace nada. Un solo observador con espera de 250 ms.
   Cargar DESPUÉS de 12b-barras-desplazamiento.js.
   ============================================================= */
(function instalarTablasMovil(global){
  'use strict';
  if(typeof document==='undefined')return;
  const ANCHO_MAX=900,CLASE='tw-movil';
  const ESTILO='.'+CLASE+'{overflow-x:auto;overflow-y:hidden;max-width:100%;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}.'+CLASE+'>table{margin:0}';
  let reloj=null;
  function asegurarEstilo(){
    if(document.getElementById('tw-movil-estilo'))return;
    const s=document.createElement('style');s.id='tw-movil-estilo';s.textContent=ESTILO;(document.head||document.documentElement).appendChild(s);
  }
  /** ¿Algún contenedor de la tabla ya se desliza en horizontal? */
  function yaDesliza(t){
    for(let p=t.parentElement;p&&p!==document.body&&p!==document.documentElement;p=p.parentElement){
      const o=getComputedStyle(p).overflowX;if(o==='auto'||o==='scroll')return true;
    }
    return false;
  }
  function revisar(){
    reloj=null;
    const ancho=document.documentElement.clientWidth;
    if(!ancho||ancho>ANCHO_MAX)return;
    asegurarEstilo();
    document.querySelectorAll('table').forEach(t=>{
      const p=t.parentElement;
      if(!p||p.classList.contains(CLASE)||t.closest('.'+CLASE))return;
      if(getComputedStyle(t).display!=='table'){                   // tablas que se apilan en bloques en el teléfono: no necesitan desplazarse ni el ancho mínimo de las tablas
        if(parseFloat(getComputedStyle(t).minWidth)>0&&t.getBoundingClientRect().right>ancho+2)t.style.minWidth='0';
        return;
      }
      const caja=p.getBoundingClientRect();
      if(!caja.width||t.getBoundingClientRect().width<=p.clientWidth+2&&t.getBoundingClientRect().right<=ancho+2)return;   // cabe
      if(yaDesliza(t))return;
      const w=document.createElement('div');w.className=CLASE;p.insertBefore(w,t);w.appendChild(t);
    });
  }
  const agendar=()=>{if(reloj)return;reloj=setTimeout(revisar,250);};
  function iniciar(){
    revisar();
    if(typeof MutationObserver!=='undefined')new MutationObserver(agendar).observe(document.body,{childList:true,subtree:true});
    global.addEventListener('resize',agendar);global.addEventListener('orientationchange',agendar);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
  global.glacialTablasMovil={revisar};
})(typeof window!=='undefined'?window:this);
