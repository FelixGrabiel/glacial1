/* =============================================================
   GLACIAL · MAPA ÚNICO DE ESTADOS VISUALES DE PRODUCCIÓN
   -------------------------------------------------------------
   El COLOR de un estado operativo sale de aquí y de ningún otro lado. Solo depende del estado real de la línea o de la marca
   (lo que registraron las acciones Iniciar / Pausar / Detener / Reanudar / Finalizar), nunca de ratio, cumplimiento, meta,
   proyección ni alertas: esas son otra señal (panel de proyección, avisos) y conservan su propio color.

     EN_CURSO     naranja   (nivel 'naranja')
     PROXIMO      amarillo  (nivel 'amarilla')  «PRÓXIMO A PRODUCIR»: la siguiente marca de la secuencia que todavía no arrancó
     PAUSA        amarillo  (nivel 'amarilla')  pausa real (el supervisor la registró)
     DETENIDA     rojo      (nivel 'roja')
     COMPLETADA   verde     (nivel 'verde')     finalizada / completada
     PENDIENTE    gris      (nivel 'gris')
     CANCELADA    rojo      (nivel 'roja')      sin cambios: conserva su estilo anterior (no es una detención)

   Los niveles 'roja' / 'ambar' / 'verde' / 'gris' son los de siempre (16-paletas.js). Aquí se agregan 'naranja' y 'amarilla' para la luz,
   la etiqueta y el punto del semáforo. Cargar DESPUÉS de 16-paletas.js y ANTES de 24-semaforo-produccion-actual.js.
   ============================================================= */
(function instalarEstadosVisuales(){
  'use strict';
  const MAPA=Object.freeze({
    EN_CURSO:{etiqueta:'EN CURSO',cls:'curso',nivel:'naranja',color:'#F97316',fondo:'#FFEDD5',texto:'#9A3412'},
    PROXIMO:{etiqueta:'PRÓXIMO A PRODUCIR',cls:'proximo',nivel:'amarilla',color:'#FACC15',fondo:'#FEF9C3',texto:'#713F12'},
    PAUSA:{etiqueta:'EN PAUSA',cls:'pausa',nivel:'amarilla',color:'#FACC15',fondo:'#FEF9C3',texto:'#713F12'},
    DETENIDA:{etiqueta:'DETENIDA',cls:'detenida',nivel:'roja',color:'#EF4444',fondo:'#FEE2E2',texto:'#991B1B'},
    COMPLETADA:{etiqueta:'COMPLETADA',cls:'completada',nivel:'verde',color:'#22C55E',fondo:'#DCFCE7',texto:'#166534'},
    PENDIENTE:{etiqueta:'PENDIENTE',cls:'pendiente',nivel:'gris',color:'#9CA3AF',fondo:'#F3F4F6',texto:'#4B5563'},
    CANCELADA:{etiqueta:'CANCELADA',cls:'cancelada',nivel:'roja',color:'#EF4444',fondo:'#FEE2E2',texto:'#991B1B'}
  });
  /* Nivel de semáforo de un estado (clave del mapa); desconocido → gris. */
  const nivelDe=clave=>(MAPA[clave]||MAPA.PENDIENTE).nivel;

  function estilos(){
    if(typeof document==='undefined'||document.getElementById('estados-visuales-css'))return;
    const s=document.createElement('style');s.id='estados-visuales-css';
    const N=MAPA.EN_CURSO,A=MAPA.PROXIMO;
    s.textContent=
      '.pl-semaforo-wrap .pl-semaforo-luz.encendida.pl-luz-naranja{background:radial-gradient(circle at 35% 30%,#fdba74,'+N.color+');box-shadow:0 0 8px 3px rgba(249,115,22,.75),inset 0 0 2px rgba(0,0,0,.25)}'+
      '.pl-semaforo-wrap .pl-semaforo-luz.encendida.pl-luz-amarilla{background:radial-gradient(circle at 35% 30%,#fef08a,'+A.color+');box-shadow:0 0 8px 3px rgba(250,204,21,.75),inset 0 0 2px rgba(0,0,0,.25)}'+
      '.pl-semaforo-texto.pl-semaforo-texto-naranja{color:'+N.texto+';background:'+N.fondo+'}'+
      '.pl-semaforo-texto.pl-semaforo-texto-amarilla{color:'+A.texto+';background:'+A.fondo+'}'+
      '.pl-semaforo-dot.pl-semaforo-dot-naranja{background:'+N.color+';box-shadow:0 0 5px 1px rgba(249,115,22,.65)}'+
      '.pl-semaforo-dot.pl-semaforo-dot-amarilla{background:'+A.color+';box-shadow:0 0 5px 1px rgba(250,204,21,.65)}';
    document.head.appendChild(s);
  }
  estilos();

  window.glacialEstadosVisuales={MAPA,nivelDe,
    /* Estado de la LÍNEA (clave de GlacialIndicadores.estadoLineaDesdeItems) → nivel del semáforo. */
    nivelDeEstadoLinea:nivelDe};
})();
