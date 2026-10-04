/* =========================================================
   «ACTUALIZADO A LAS HH:MM» · estado de los datos en vivo
   Una insignia común para Inicio, Producción Actual, Bitácora y Tareo:
     · Con conexión:  «Actualizado a las HH:MM»        (hora del servidor)
     · Sin conexión, o datos con más de 2 minutos (consultas puntuales):
                      «Sin conexión · datos de las HH:MM»  (ámbar)
   La conexión se detecta con un listener de metadatos del documento sync/users: no genera lecturas
   nuevas (solo cuando ese documento cambia). No modifica ningún dato.
   Uso:  glacialEstadoDatos.chip()            → datos en vivo (listeners)
         glacialEstadoDatos.chip({ts:ms})     → datos de una consulta puntual (la insignia envejece)
   ========================================================= */
(function(){
  'use strict';

  const OBSOLETO_MS=2*60*1000;       // datos de una consulta puntual con más de 2 minutos
  const CONFIRMAR_OFFLINE_MS=6000;   // Firestore tarda unos segundos en declarar que no hay red
  const est={enLinea:true,ultimoEnLinea:null,escuchando:false,desuscribir:null,temporizador:null};

  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const hhmm=ms=>new Date(ms).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false});

  function estado(ts){
    const n=ahora();
    if(!est.enLinea||(typeof navigator!=='undefined'&&navigator.onLine===false)){
      return {warn:true,texto:'Sin conexión · datos de las '+hhmm(est.ultimoEnLinea||ts||n)};
    }
    if(ts!=null&&n-ts>OBSOLETO_MS)return {warn:true,texto:'Sin conexión · datos de las '+hhmm(ts)};
    return {warn:false,texto:'Actualizado a las '+hhmm(ts!=null?ts:n)};
  }

  function estilos(){
    if(typeof document==='undefined'||document.getElementById('gl-act-css'))return;
    const s=document.createElement('style');s.id='gl-act-css';
    s.textContent='.gl-act{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;'+
      'background:#eef2f6;color:#4a5b6b;white-space:nowrap}.gl-act.warn{background:#fff3d6;color:#8a5a00;box-shadow:inset 0 0 0 1px #f0c36a}';
    document.head.appendChild(s);
  }

  function chip(opciones){
    estilos();
    const ts=opciones&&opciones.ts!=null?Number(opciones.ts):null;
    const e=estado(ts);
    return '<span class="gl-act'+(e.warn?' warn':'')+'" data-gl-act'+(ts!=null?' data-gl-ts="'+ts+'"':'')+
      ' role="status">'+e.texto+'</span>';
  }

  function actualizar(){
    if(typeof document==='undefined'||!document.querySelectorAll)return;
    document.querySelectorAll('[data-gl-act]').forEach(el=>{
      const ts=el.getAttribute('data-gl-ts');
      const e=estado(ts!=null&&ts!==''?Number(ts):null);
      el.textContent=e.texto;
      el.classList.toggle('warn',e.warn);
    });
  }

  function marcar(enLinea){
    est.enLinea=!!enLinea;
    if(est.enLinea)est.ultimoEnLinea=ahora();
    actualizar();
  }

  function escuchar(){
    if(est.escuchando||typeof db==='undefined'||typeof state==='undefined'||!state.user)return;
    est.escuchando=true;
    try{
      let pendiente=null;
      est.desuscribir=db.collection('sync').doc('users').onSnapshot({includeMetadataChanges:true},snap=>{
        if(!snap.metadata.fromCache){
          if(pendiente){clearTimeout(pendiente);pendiente=null;}
          marcar(true);
        }else if(!pendiente){
          pendiente=setTimeout(()=>{pendiente=null;marcar(false);},CONFIRMAR_OFFLINE_MS);
        }
      },()=>{est.escuchando=false;est.desuscribir=null;});    // sin permiso o sin sesión: se reintenta
    }catch(_){est.escuchando=false;}
  }

  function arrancar(){
    if(est.temporizador||typeof setInterval==='undefined')return;
    est.temporizador=setInterval(()=>{
      if(est.enLinea&&(typeof navigator==='undefined'||navigator.onLine!==false))est.ultimoEnLinea=ahora();
      escuchar();
      actualizar();
    },15000);
    if(typeof window.addEventListener==='function'){
      window.addEventListener('online',()=>marcar(true));
      window.addEventListener('offline',()=>marcar(false));
    }
  }
  arrancar();
  // Al cerrar sesión se cierra la escucha de conexión; se vuelve a abrir sola al entrar de nuevo.
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(()=>{
    if(typeof est.desuscribir==='function'){try{est.desuscribir();}catch(_){/* ya cerrada */}}
    est.desuscribir=null;est.escuchando=false;
  });

  window.glacialEstadoDatos={chip,estado,actualizar,escuchar,marcarEnLinea:marcar,
    get enLinea(){return est.enLinea;},OBSOLETO_MS};

  /* ---------- dónde se muestra (sin tocar los módulos existentes) ---------- */

  // Tareo (todas sus pantallas): al final de la barra de pestañas.
  if(typeof tareoRenderTabs==='function'){
    const anterior=tareoRenderTabs;
    tareoRenderTabs=function(){
      const html=anterior.apply(this,arguments);
      if(html.indexOf('data-gl-act')>=0)return html;
      escuchar();
      return html.replace('</div>','<span style="margin-left:auto;align-self:center;padding-left:8px">'+chip()+'</span></div>');
    };
    window.tareoRenderTabs=tareoRenderTabs;
  }

  // Producción Actual: encima del tablero.
  if(typeof renderProduccionActualTab==='function'){
    const anterior=renderProduccionActualTab;
    renderProduccionActualTab=function(){
      const r=anterior.apply(this,arguments);
      try{
        const cont=document.getElementById('produccion-actual-resultados');
        if(cont&&cont.parentElement&&!cont.parentElement.querySelector('[data-gl-act-pa]')){
          escuchar();
          cont.insertAdjacentHTML('beforebegin','<div data-gl-act-pa style="margin:0 0 8px;text-align:right">'+chip()+'</div>');
        }
      }catch(_){/* la insignia es solo informativa */}
      return r;
    };
    window.renderProduccionActualTab=renderProduccionActualTab;
  }

  // Inicio: sustituye «Actualizado HH:MM» (hora del equipo) por la insignia con la hora del servidor.
  if(typeof renderCentroPerfil==='function'){
    const anterior=renderCentroPerfil;
    renderCentroPerfil=function(main){
      const r=anterior.apply(this,arguments);
      try{
        escuchar();
        const m=main||document.getElementById('main');
        m&&m.querySelectorAll('.cp-ex-meta small').forEach(s=>{
          if(/^Actualizado\b/.test(s.textContent||'')&&!s.querySelector('[data-gl-act]'))s.innerHTML=chip();
        });
      }catch(_){/* informativo */}
      return r;
    };
    window.renderCentroPerfil=renderCentroPerfil;
  }
})();
