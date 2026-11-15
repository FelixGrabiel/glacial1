/* =============================================================
   GLACIAL · CALIDAD (módulo propio del menú lateral)
   -------------------------------------------------------------
   Pestaña de la aplicación: state.currentTab='calidad', grupo «Calidad» del menú (#btn-calidad-validacion), goCalidad(tab).
   Hoy tiene una sola pantalla: «Validación de lotes» (lo que valida el bot de WhatsApp; lógica en 99-validacion-lotes.js).
   · Permisos: los mismos que Evidencias y Lotes (Inventario de insumos: Asistente de Producción, Jefe de Operaciones y Administrador). El servidor los exige igual.
   · No toca stock, lotes ni evidencias.
   Mismo patrón de navegación que 76-inventario-insumos-pantalla.js. Cargar DESPUÉS de 99-validacion-lotes.js.
   ============================================================= */
(function(){
  'use strict';
  const TAB='calidad';
  const PANTALLAS=[['validacion','Validación de lotes']];
  const CAL={tab:'validacion'};
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const puede=()=>{try{return !!(typeof state!=='undefined'&&state.user&&window.glacialInventarioDatos&&window.glacialInventarioDatos.puedeVer&&window.glacialInventarioDatos.puedeVer());}catch(_){return false;}};
  const VL=()=>window.apValidacionLotesUI||null;

  function estilos(){return `<style>
.cal{color:#033350;font-size:15px;display:grid;gap:14px}
.cal-cab{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.cal-cab h1{margin:0;font-size:32px;font-weight:800;letter-spacing:-.01em;color:#033350}
.cal-sub{margin:2px 0 0;color:#587087;font-size:14px}
.cal-tabs{display:flex;gap:6px;border-bottom:1px solid #d9e7f1;overflow-x:auto}
.cal-tab{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border:0;background:none;color:#587087;font:inherit;font-weight:700;cursor:pointer;border-bottom:3px solid transparent;white-space:nowrap}
.cal-tab svg{width:19px;height:19px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.cal-tab[aria-selected="true"]{color:#0877a6;border-bottom-color:#0877a6}.cal-tab:focus-visible{outline:3px solid #0ea5e9;outline-offset:-3px}
</style>`;}

  function pintar(){
    if(typeof state==='undefined'||state.currentTab!==TAB)return;
    const main=document.getElementById('main');if(!main)return;
    const UI=VL();
    const tabs=PANTALLAS.map(([k,t])=>`<button type="button" role="tab" class="cal-tab" aria-selected="${CAL.tab===k}" onclick="goCalidad('${k}')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M8.5 12l2.5 2.5L16 9.5"/></svg><span>${esc(t)}</span></button>`).join('');
    let cuerpo='<div class="vl-msg vl-msg-e">La validación de lotes no está disponible en esta versión.</div>';
    if(UI){UI.usar({pintar});cuerpo=UI.html();}
    const y=window.scrollY;
    main.innerHTML=`<section class="cal">${estilos()}<header class="cal-cab"><div><h1>CALIDAD</h1><p class="cal-sub">Validación de lotes que hace el bot de WhatsApp.</p></div></header><nav class="cal-tabs" role="tablist" aria-label="Pantallas de Calidad">${tabs}</nav>${cuerpo}</section>`;
    window.scrollTo(0,y);
  }

  window.goCalidad=function(tab){
    if(!puede()){alert('No tienes permiso para ver Calidad.');return;}
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    if(tab&&PANTALLAS.some(p=>p[0]===tab))CAL.tab=tab;
    state.currentTab=TAB;
    if(typeof renderSidebar==='function')renderSidebar();
    if(typeof renderMain==='function')renderMain();
  };
  if(typeof ajustarVistaSegunPermisos==='function'){
    const a=ajustarVistaSegunPermisos;
    ajustarVistaSegunPermisos=function(){if(state.currentTab===TAB&&puede())return;return a.apply(this,arguments);};
  }
  if(typeof renderMain==='function'){
    const a=renderMain;
    renderMain=function(){
      if(state.currentTab===TAB&&!state.showWelcome&&puede()){pintar();return;}
      if(state.currentTab!==TAB&&VL())VL().detener();                    // la consulta de validaciones solo corre mientras se mira Calidad
      return a.apply(this,arguments);
    };
  }
  if(typeof renderSidebar==='function'){
    const a=renderSidebar;
    renderSidebar=function(){
      const r=a.apply(this,arguments);
      const b=document.getElementById('btn-calidad-validacion');
      if(b){const m=puede();b.hidden=!m;b.style.display=m?'':'none';b.classList.toggle('active',m&&state.currentTab===TAB);
        if(m&&state.currentTab===TAB)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
      if(typeof actualizarGruposSidebar==='function')actualizarGruposSidebar();      // el grupo se ve solo si alguno de sus accesos es visible
      return r;
    };
  }
  window.glacialCalidadUI={pintar,PANTALLAS};
})();
