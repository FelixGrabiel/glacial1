/* =============================================================
   PLANIFICACIÓN · VISTAS FUERA DE PLANIFICACIÓN
   -------------------------------------------------------------
   Dos pantallas que eran pestañas de Planificación y ahora se abren desde otro módulo del menú lateral:
     · «Productos y parámetros» (catálogo, velocidad estándar, tiempos de cambio y paradas previstas)  → grupo MANTENIMIENTO
     · «Horario de producción» (reglas de horario por línea y bloque)                                    → grupo PRODUCCIÓN
   Son la MISMA pantalla de siempre (53 y 51b); aquí solo se abre sin la barra de pestañas. Permisos: los de Planificación
   (ver = NS.puedeVer(), editar = NS.puede()). Mismo patrón de navegación que 76-inventario-insumos-pantalla.js.
   Cargar DESPUÉS de 52, 53 y 51b.
   ============================================================= */
(function(){
  'use strict';
  const NS=window.glacialPlanificacion;
  if(!NS)return;
  const VISTAS={
    'productos-parametros':{pestana:'catalogo',boton:'btn-productos-parametros',grupo:'mantenimiento',titulo:'Productos y parámetros',
      sub:'Catálogo de productos (unidades por paleta y velocidad estándar) y tiempos de cambio y paradas previstas que usa Planificación.'},
    'horario-produccion':{pestana:'horarios',boton:'btn-horario-produccion',grupo:'produccion',titulo:'Horario de producción',
      sub:'Reglas de horario de producción por línea y bloque, con la fecha desde la que rigen.'}
  };
  NS.VISTAS_EXTERNAS=VISTAS;
  const puedeEntrar=()=>!!(typeof state!=='undefined'&&state.user)&&NS.puedeVer();

  function ir(tab){
    if(!puedeEntrar()){alert('No tienes permiso para ver esta pantalla.');return;}
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    state.currentTab=tab;
    if(typeof renderSidebar==='function')renderSidebar();
    if(typeof renderMain==='function')renderMain();
  }
  window.goProductosParametros=()=>ir('productos-parametros');
  window.goHorarioProduccion=()=>ir('horario-produccion');

  if(typeof ajustarVistaSegunPermisos==='function'){
    const a=ajustarVistaSegunPermisos;
    ajustarVistaSegunPermisos=function(){if(VISTAS[state.currentTab]&&puedeEntrar())return;return a.apply(this,arguments);};
  }
  if(typeof renderMain==='function'){
    const a=renderMain;
    renderMain=function(){
      const v=VISTAS[state.currentTab];
      if(v&&!state.showWelcome&&puedeEntrar()){NS.renderVista(document.getElementById('main'),v.pestana,v.titulo,v.sub);return;}
      return a.apply(this,arguments);
    };
  }
  if(typeof renderSidebar==='function'){
    const a=renderSidebar;
    renderSidebar=function(){
      const r=a.apply(this,arguments);
      Object.entries(VISTAS).forEach(([tab,v])=>{
        const b=document.getElementById(v.boton);if(!b)return;
        const m=puedeEntrar();b.hidden=!m;b.style.display=m?'':'none';b.classList.toggle('active',m&&state.currentTab===tab);
        if(m&&state.currentTab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
      });
      if(typeof actualizarGruposSidebar==='function')actualizarGruposSidebar();   // los grupos se calcularon antes de mostrar estos accesos
      return r;
    };
  }
})();
