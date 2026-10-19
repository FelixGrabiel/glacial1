/* =============================================================
   GLACIAL · REPORTES → RESUMEN GENERAL — GRÁFICOS DIFERIDOS (rendimiento / INP)
   -------------------------------------------------------------
   Al entrar a Resumen general, renderResumen() (09-resumen.js) arma el HTML, calcula todo y crea unos 13 gráficos de Chart.js en el MISMO
   turno del clic; el navegador no pinta hasta terminar (INP ~250 ms). Este módulo NO cambia ningún cálculo ni el aspecto final:
     · mientras corre renderResumen, el constructor global Chart se sustituye por uno «diferido» que devuelve un objeto con destroy()
       (lo único que el resumen usa de esos gráficos) y encola la creación real;
     · al terminar el render se restaura Chart y las creaciones reales se hacen de una en una, cada una en su propio turno
       (setTimeout 0), así el navegador pinta la pantalla y atiende clics entre gráfico y gráfico;
     · cada creación real va sin animación de entrada (Chart.defaults.animation solo se apaga durante esa creación y se restaura);
     · un render nuevo, un destroy() o salir de la pantalla (canvas ya no está en el documento) cancelan las creaciones pendientes.
   Cargar DESPUÉS de 09-resumen.js, 08-graficos.js y 49-resumen-indicadores.js; ANTES de 12-init.js.
   ============================================================= */
(function instalarGraficosDiferidosResumen(){
  'use strict';
  if(typeof renderResumen!=='function')return;

  const original=renderResumen;
  let generacion=0,cola=[],renderizando=false;

  /* PERF: una creación real por turno; el resto espera. */
  function siguiente(gen){
    if(gen!==generacion)return;
    const tarea=cola.shift();
    if(!tarea)return;
    if(tarea.fn){                                             // GRAFICOS (fase 2): creación de un ApexCharts/ECharts diferida (glacialDiferirGrafico)
      try{tarea.fn();}catch(e){console.warn('Resumen general: no se pudo crear un gráfico:',e&&e.message||e);}
      if(cola.length)setTimeout(()=>siguiente(gen),0);
      return;
    }
    const Real=tarea.Real;
    if(!tarea.objeto.cancelado&&tarea.el&&tarea.el.isConnected!==false){
      const defaults=Real&&Real.defaults;
      const previa=defaults?defaults.animation:undefined;
      try{
        if(defaults)defaults.animation=false;                 // sin animación de entrada solo en esta creación
        tarea.objeto.real=new Real(tarea.el,tarea.config);
      }catch(e){
        console.warn('Resumen general: no se pudo crear un gráfico:',e&&e.message||e);
      }finally{
        if(defaults)defaults.animation=previa;
      }
    }
    if(cola.length)setTimeout(()=>siguiente(gen),0);
  }

  renderResumen=function(main){
    const Real=window.Chart;
    const conChart=typeof Real==='function';

    generacion++;
    const gen=generacion;
    cola=[];                                                  // lo pendiente de un render anterior ya no hace falta

    function Diferido(el,config){
      const objeto={
        real:null,cancelado:false,
        destroy(){this.cancelado=true;if(this.real){try{this.real.destroy();}catch(_){/* ya destruido */}this.real=null;}},
        update(){if(this.real)this.real.update.apply(this.real,arguments);},
        resize(){if(this.real)this.real.resize.apply(this.real,arguments);}
      };
      cola.push({Real,el,config,objeto});
      return objeto;
    }
    if(conChart)Object.setPrototypeOf(Diferido,Real);         // Chart.defaults, Chart.register… siguen funcionando

    try{
      renderizando=true;
      if(conChart)window.Chart=Diferido;
      return original.apply(this,arguments);
    }finally{
      renderizando=false;
      if(conChart)window.Chart=Real;
      if(cola.length)setTimeout(()=>siguiente(gen),0);
    }
  };
  /* GRAFICOS (fase 2): los gráficos del Resumen son ApexCharts / ECharts. Durante renderResumen, glacialDiferirGrafico(fn) encola la creación
     (una por turno, como antes con Chart.js); fuera de renderResumen se ejecuta de inmediato. Un render nuevo cancela lo pendiente. */
  window.glacialDiferirGrafico=function(fn){
    if(!renderizando){fn();return;}
    cola.push({fn});
  };
  window.renderResumen=renderResumen;

  window.__resumenGraficosDiferidos={pendientes:()=>cola.length};
})();
