/* GLACIAL · app instalable (PWA) (16/11/2026)
   1) Registra el service worker (sw.js, en la raíz) para que GLACIAL se pueda instalar como aplicación y muestre «Sin conexión» si no hay red.
      El service worker NO guarda caché: los datos y el código siguen llegando de la red, en tiempo real, igual en todos los equipos.
   2) En la pantalla de inicio de sesión ofrece «Instalar GLACIAL»:
        · Android y PC (Chrome/Edge): botón que abre la instalación del navegador;
        · iPhone/iPad: indica el camino (Compartir → «Agregar a pantalla de inicio»), porque ahí no existe instalación automática.
      No aparece si ya está instalada, en modo TV, ni dentro de la aplicación (solo en el inicio de sesión). «Ahora no» la oculta 14 días.
   3) ACTUALIZACIONES SIN REINSTALAR (17/11/2026). Quien ya instaló GLACIAL nunca tiene que volver a instalarla para tener la versión nueva:
        · el código: lo trae el aviso «HAY UNA ACTUALIZACIÓN NUEVA» (03-actualizacion.js), igual que en el navegador. Revisa cada 3 minutos
          y al volver a la app; se recarga sola cuando es seguro o muestra «Actualizar ahora». Funciona porque el service worker no guarda caché.
        · el propio sw.js: se registra con updateViaCache 'none' (el navegador nunca usa una copia vieja de sw.js) y se revisa al volver a
          primer plano (como mucho cada 30 min), porque en el celular la app suele quedar abierta días sin recargarse.
        · nombre e íconos (manifest): Android los renueva solo en la app instalada (puede tardar hasta un día); iPhone conserva el ícono
          anterior hasta reinstalar, pero eso es solo apariencia: el contenido sí se actualiza. Por eso «id» y «start_url» del manifiesto no se cambian.
      Lo único que obliga a reinstalar es cambiar de DIRECCIÓN (dominio): la app instalada queda atada a la dirección donde se instaló.
   No depende de ningún otro archivo ni redefine funciones: puede cargarse en cualquier punto. */
(function(raiz){
  'use strict';
  const OCULTAR_MS=14*24*60*60*1000, CLAVE='glacial-instalar-oculto';

  /** ¿La página ya corre como aplicación instalada? e: {standalone (iOS), displayStandalone} */
  function yaInstalada(e){ return !!(e&&(e.standalone||e.displayStandalone)); }
  /** ¿Es iPhone/iPad? (el iPad moderno se presenta como Mac con pantalla táctil) */
  function esIOS(ua,plataforma,toques){ return /iPad|iPhone|iPod/.test(String(ua||''))||(plataforma==='MacIntel'&&Number(toques)>1); }
  /** ¿Se puede ofrecer la instalación ahora? e: {instalada, tv, enLogin, ocultoHasta, ahora, hayAviso, ios} */
  function debeOfrecer(e){
    if(!e||e.instalada||e.tv||!e.enLogin)return false;
    if(e.ocultoHasta&&e.ahora<e.ocultoHasta)return false;
    return !!(e.hayAviso||e.ios);
  }
  const REVISAR_SW_MS=30*60*1000;
  /** ¿Toca pedirle al navegador que revise si hay un sw.js nuevo? (al volver a primer plano, como mucho cada 30 min) */
  function tocaRevisarSW(ultima,ahora){ return !ultima||ahora-ultima>=REVISAR_SW_MS; }
  const API={yaInstalada,esIOS,debeOfrecer,tocaRevisarSW,OCULTAR_MS,REVISAR_SW_MS};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  if(typeof document==='undefined'||!raiz.navigator||!raiz.location)return;

  const nav=raiz.navigator, local=/^(localhost|127\.0\.0\.1)$/.test(raiz.location.hostname);
  if('serviceWorker' in nav&&(raiz.location.protocol==='https:'||local)){
    let registro=null,ultimaRevision=Date.now();
    raiz.addEventListener('load',()=>{
      nav.serviceWorker.register('sw.js',{updateViaCache:'none'})
        .then(r=>{registro=r;})
        .catch(e=>console.warn('GLACIAL · no se pudo registrar la app instalable',e));
    });
    document.addEventListener('visibilitychange',()=>{                      // al volver a la app: ¿hay un sw.js nuevo?
      if(document.hidden||!registro||!tocaRevisarSW(ultimaRevision,Date.now()))return;
      ultimaRevision=Date.now();
      registro.update().catch(()=>{/* sin red: se intenta la próxima vez */});
    });
  }

  let aviso=null;                                                             // el «beforeinstallprompt» del navegador, guardado para el botón
  const ocultoHasta=()=>{try{return Number(localStorage.getItem(CLAVE))||0;}catch(_){return 0;}};
  function estado(){
    const login=document.getElementById('login-screen');
    let displayStandalone=false;try{displayStandalone=raiz.matchMedia('(display-mode: standalone)').matches;}catch(_){/* sin matchMedia */}
    return {instalada:yaInstalada({standalone:nav.standalone===true,displayStandalone}),
      tv:document.documentElement.classList.contains('modo-tv'),
      enLogin:!!(login&&raiz.getComputedStyle(login).display!=='none'),
      ocultoHasta:ocultoHasta(),ahora:Date.now(),hayAviso:!!aviso,ios:esIOS(nav.userAgent,nav.platform,nav.maxTouchPoints)};
  }
  function quitar(){const e=document.getElementById('gl-inst');if(e)e.remove();}
  function estilos(){
    if(document.getElementById('gl-inst-estilos'))return;
    const s=document.createElement('style');s.id='gl-inst-estilos';
    s.textContent='#gl-inst{position:fixed;left:50%;transform:translateX(-50%);top:calc(10px + env(safe-area-inset-top,0px));z-index:2147482000;display:flex;align-items:center;gap:10px;width:max-content;max-width:min(460px,calc(100vw - 24px));box-sizing:border-box;padding:8px 8px 8px 16px;border-radius:14px;background:#fff;color:#0f172a;font:600 14px/1.3 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.28)}'+
      '#gl-inst span{flex:1;min-width:0}#gl-inst button{min-height:44px;padding:0 14px;border-radius:10px;border:0;font:700 14px system-ui,sans-serif;cursor:pointer;white-space:nowrap}'+
      '#gl-inst .gl-si{background:#0877A6;color:#fff}#gl-inst .gl-no{background:transparent;color:#475569}'+
      '@media print{#gl-inst{display:none!important}}';
    document.head.appendChild(s);
  }
  function pintar(){
    const e=estado();
    if(!debeOfrecer(e)){quitar();return;}
    if(document.getElementById('gl-inst'))return;
    estilos();
    const d=document.createElement('div');d.id='gl-inst';d.setAttribute('role','region');d.setAttribute('aria-label','Instalar GLACIAL');
    d.innerHTML=e.hayAviso
      ?'<span>Instala GLACIAL como aplicación en este equipo.</span><button type="button" class="gl-si" data-gl-inst="si">Instalar</button><button type="button" class="gl-no" data-gl-inst="no">Ahora no</button>'
      :'<span>Para instalar GLACIAL: toca <b>Compartir</b> y luego <b>«Agregar a pantalla de inicio»</b>.</span><button type="button" class="gl-no" data-gl-inst="no">Entendido</button>';
    document.body.appendChild(d);
  }
  raiz.addEventListener('beforeinstallprompt',ev=>{ev.preventDefault();aviso=ev;pintar();});
  raiz.addEventListener('appinstalled',()=>{aviso=null;quitar();});
  document.addEventListener('click',ev=>{
    const b=ev.target&&ev.target.closest&&ev.target.closest('[data-gl-inst]');if(!b)return;
    if(b.getAttribute('data-gl-inst')==='si'&&aviso){
      const a=aviso;aviso=null;quitar();
      try{a.prompt();}catch(_){/* el navegador ya no lo permite: queda la opción del menú */}
      return;
    }
    try{localStorage.setItem(CLAVE,String(Date.now()+OCULTAR_MS));}catch(_){/* sin almacenamiento: se oculta solo en esta visita */}
    quitar();
  });
  function iniciar(){
    pintar();
    const login=document.getElementById('login-screen');                      // al entrar o salir cambia su «display»: ahí se quita o vuelve la oferta
    if(login&&typeof MutationObserver!=='undefined')new MutationObserver(pintar).observe(login,{attributes:true,attributeFilter:['style','class']});
  }
  API.instalar=()=>{if(!aviso)return false;const a=aviso;aviso=null;quitar();a.prompt();return true;};
  raiz.glacialAppInstalable=API;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})(typeof window!=='undefined'?window:globalThis);
