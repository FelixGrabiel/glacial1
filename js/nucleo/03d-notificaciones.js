/* GLACIAL · notificaciones de PARADAS DE LÍNEA en el celular (24/11/2026)
   El servidor (función avisos-push, cada minuto) avisa cuando una línea se detiene y cuando una parada pasa su límite, aunque la app esté
   cerrada. Este archivo solo prepara ESTE equipo para recibirlas:
     · A quien recibe paradas en su Centro de alertas (glacialAvisos.ambito() incluye «parada») le ofrece «Activar avisos». El permiso del
       navegador se pide SOLO al tocar «Activar» (los navegadores lo exigen así; nunca sale solo).
     · Con el permiso dado, suscribe el equipo (Web Push con la clave pública del servidor, RPC push_clave_publica) y lo registra a nombre de
       la cuenta con sesión (RPC push_suscribir). Al entrar otra cuenta en el mismo equipo, pasa a esa cuenta.
     · Al CERRAR SESIÓN se da de baja la suscripción del equipo: un celular compartido no sigue recibiendo los avisos de la cuenta anterior.
     · iPhone/iPad: solo funciona con GLACIAL instalada (iOS 16.4 o más); en Safari se indica instalarla.
   No avisa nada por sí mismo: qué se notifica y a quién lo decide el servidor (supabase/functions/avisos-push/logica.js).
   No redefine funciones de otros archivos. Ver docs/00-general/notificaciones.md. */
(function(raiz){
  'use strict';
  const OCULTAR_MS=7*24*60*60*1000, CLAVE_OCULTO='glacial-noti-oculto', REVISAR_MS=5000;

  /** 'si' · 'instalar' (iPhone en Safari: hay que instalar la app) · 'no'. e: {sw, push, noti, ios, instalada} */
  function soporte(e){
    if(!e||!e.sw)return 'no';
    if(e.ios&&!e.instalada)return 'instalar';
    return e.push&&e.noti?'si':'no';
  }
  /** ¿Ofrecer «Activar avisos»? e: {soporta, permiso, recibeParadas, ocultoHasta, ahora, tv} */
  function debeOfrecer(e){
    if(!e||!e.soporta||!e.recibeParadas||e.tv)return false;
    if(e.permiso&&e.permiso!=='default')return false;
    return !(e.ocultoHasta&&e.ahora<e.ocultoHasta);
  }
  const b64u=s=>s.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  /** Uint8Array → base64url */
  function claveB64(u8){let s='';(u8||[]).forEach(b=>{s+=String.fromCharCode(b);});return b64u((typeof btoa==='function'?btoa(s):Buffer.from(s,'binary').toString('base64')));}
  /** base64url → Uint8Array */
  function deB64(t){
    const b=String(t||'').replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((String(t||'').length+3)%4);
    const bin=typeof atob==='function'?atob(b):Buffer.from(b,'base64').toString('binary');
    return Uint8Array.from(bin,c=>c.charCodeAt(0));
  }
  const API={soporte,debeOfrecer,claveB64,deB64,OCULTAR_MS};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  if(typeof document==='undefined'||!raiz.navigator||!raiz.location)return;

  const nav=raiz.navigator;
  const esIOS=()=>/iPad|iPhone|iPod/.test(nav.userAgent||'')||(nav.platform==='MacIntel'&&nav.maxTouchPoints>1);
  const instalada=()=>{try{return nav.standalone===true||raiz.matchMedia('(display-mode: standalone)').matches;}catch(_){return false;}};
  const sop=()=>soporte({sw:'serviceWorker' in nav,push:'PushManager' in raiz,noti:'Notification' in raiz,ios:esIOS(),instalada:instalada()});
  const permiso=()=>('Notification' in raiz)?raiz.Notification.permission:'default';
  const cliente=()=>raiz.glacialSupabaseCliente||null;
  const usuario=()=>{try{return typeof state!=='undefined'&&state.user?state.user:null;}catch(_){return null;}};
  const uidActual=()=>{try{const u=raiz.firebase&&raiz.firebase.auth&&raiz.firebase.auth().currentUser;return u&&u.uid||null;}catch(_){return null;}};
  const recibeParadas=()=>{try{const a=raiz.glacialAvisos&&raiz.glacialAvisos.ambito&&raiz.glacialAvisos.ambito();return !!(a&&Array.isArray(a.tipos)&&a.tipos.includes('parada'));}catch(_){return false;}};
  const ocultoHasta=()=>{try{return Number(localStorage.getItem(CLAVE_OCULTO))||0;}catch(_){return 0;}};
  const equipo=()=>{const ua=nav.userAgent||'';const so=/Android/.test(ua)?'Android':esIOS()?'iPhone':/Windows/.test(ua)?'Windows':/Mac/.test(ua)?'Mac':'Otro';return so+' · '+(instalada()?'App instalada':'Navegador');};

  let clavePublica=null, listoPara=null, enCurso=false, uidAnterior=null;
  async function obtenerClave(){
    if(clavePublica)return clavePublica;
    const c=cliente();if(!c)return null;
    const r=await c.rpc('push_clave_publica');
    if(r.error||!r.data)return null;
    clavePublica=String(r.data);return clavePublica;
  }
  /** Suscribe este equipo (si hace falta) y lo registra a nombre de la cuenta con sesión. Sin permiso o sin servidor listo, no hace nada. */
  async function asegurar(){
    const uid=uidActual();
    if(enCurso||!uid||listoPara===uid||permiso()!=='granted'||sop()!=='si')return false;
    enCurso=true;
    try{
      const clave=await obtenerClave();
      if(!clave){console.warn('GLACIAL · notificaciones: el servidor aún no tiene su clave (falta desplegar avisos-push).');return false;}
      const reg=await nav.serviceWorker.ready;
      let s=await reg.pushManager.getSubscription();
      const actual=s&&s.options&&s.options.applicationServerKey?claveB64(new Uint8Array(s.options.applicationServerKey)):null;
      if(s&&actual&&actual!==clave){await s.unsubscribe().catch(()=>{});s=null;}       // el servidor cambió de clave: suscribir de nuevo
      if(!s)s=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:deB64(clave)});
      const j=s.toJSON();
      const r=await cliente().rpc('push_suscribir',{p_endpoint:j.endpoint,p_p256dh:j.keys&&j.keys.p256dh,p_auth:j.keys&&j.keys.auth,p_equipo:equipo()});
      if(r.error)throw r.error;
      listoPara=uid;quitar();return true;
    }catch(e){console.warn('GLACIAL · no se pudo activar las notificaciones en este equipo',e);return false;}
    finally{enCurso=false;}
  }
  /** Al cerrar sesión: el equipo deja de recibir (la suscripción vieja queda inválida y el servidor la borra en el próximo envío). */
  async function darDeBaja(){
    listoPara=null;
    try{const reg=await nav.serviceWorker.getRegistration();const s=reg&&await reg.pushManager.getSubscription();if(s)await s.unsubscribe();}catch(_){/* sin suscripción */}
  }

  /* ---------- oferta «Activar avisos» ---------- */
  function quitar(){const e=document.getElementById('gl-noti');if(e)e.remove();}
  function pintar(modo,texto){
    if(document.getElementById('gl-noti'))return;
    if(!document.getElementById('gl-noti-estilos')){
      const s=document.createElement('style');s.id='gl-noti-estilos';
      s.textContent='#gl-noti{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:2147481000;display:flex;flex-wrap:wrap;align-items:center;gap:10px;width:max-content;max-width:min(520px,calc(100vw - 24px));box-sizing:border-box;padding:10px 10px 10px 16px;border-radius:14px;background:#033350;color:#fff;font:500 14px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3)}'+
        '#gl-noti span{flex:1 1 220px;min-width:0}#gl-noti b{font-weight:700}#gl-noti .gl-b{display:flex;gap:8px}'+
        '#gl-noti button{min-height:44px;padding:0 14px;border-radius:10px;font:700 14px system-ui,sans-serif;cursor:pointer;white-space:nowrap}'+
        '#gl-noti .gl-si{border:0;background:#fff;color:#033350}#gl-noti .gl-no{border:1px solid #5c84a3;background:transparent;color:#fff}'+
        '@media print{#gl-noti{display:none!important}}';
      document.head.appendChild(s);
    }
    const d=document.createElement('div');d.id='gl-noti';d.setAttribute('role','region');d.setAttribute('aria-label','Avisos de paradas');
    d.innerHTML=modo==='listo'?'<span role="status">'+texto+'</span>':modo==='instalar'
      ?'<span><b>Avisos de paradas:</b> para recibirlos en este iPhone, instala GLACIAL (Compartir → «Agregar a pantalla de inicio») y ábrela desde su ícono.</span><div class="gl-b"><button type="button" class="gl-no" data-gl-noti="no">Entendido</button></div>'
      :'<span><b>Avisos de paradas:</b> recibe una notificación en este equipo cuando una línea se detenga, aunque GLACIAL esté cerrada.</span><div class="gl-b"><button type="button" class="gl-si" data-gl-noti="si">Activar</button><button type="button" class="gl-no" data-gl-noti="no">Ahora no</button></div>';
    document.body.appendChild(d);
  }
  document.addEventListener('click',async ev=>{
    const b=ev.target&&ev.target.closest&&ev.target.closest('[data-gl-noti]');if(!b)return;
    if(b.getAttribute('data-gl-noti')==='si'){
      quitar();
      let p='default';
      try{p=await raiz.Notification.requestPermission();}catch(_){p='default';}
      if(p==='granted'){
        const okk=await asegurar();
        pintar('listo',okk?'<b>Listo:</b> este equipo recibirá los avisos de paradas.':'No se pudo activar ahora. Se volverá a intentar solo.');
        setTimeout(quitar,5000);
      }
      return;
    }
    try{localStorage.setItem(CLAVE_OCULTO,String(Date.now()+OCULTAR_MS));}catch(_){/* solo esta visita */}
    quitar();
  });

  /* ---------- revisión periódica (sesión, permiso, ámbito) ---------- */
  function revisar(){
    const uid=uidActual(), u=usuario();
    if(uidAnterior&&!uid){quitar();darDeBaja();}                                  // cerró sesión en esta página
    uidAnterior=uid;
    if(!uid||!u)return;
    const tv=document.documentElement.classList.contains('modo-tv');
    if(!recibeParadas()){quitar();return;}
    const s=sop();
    if(s==='si'&&permiso()==='granted'){asegurar();return;}
    if(debeOfrecer({soporta:s!=='no',permiso:s==='instalar'?'default':permiso(),recibeParadas:true,ocultoHasta:ocultoHasta(),ahora:Date.now(),tv}))pintar(s);
  }
  API.activar=async()=>{const p=await raiz.Notification.requestPermission();return p==='granted'?asegurar():false;};
  API.estado=()=>({soporte:sop(),permiso:permiso(),recibeParadas:recibeParadas(),registradoPara:listoPara});
  raiz.glacialNotificaciones=API;
  setInterval(revisar,REVISAR_MS);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)revisar();});
})(typeof window!=='undefined'?window:globalThis);
