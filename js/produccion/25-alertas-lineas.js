/* GLACIAL · Centro de alertas + historial diario.
   Cargar después de 24-semaforo-produccion-actual.js y antes de 12-init.js.
   El historial se guarda dentro de sync/programaciones -> historialAlertas.
   No requiere crear un documento nuevo en Firestore. */
(function instalarAlertasLineas(){
  'use strict';

  const PREF_SONIDO = 'glacial_alertas_lineas_silenciadas';
  let eventos = [];
  let idsConocidos = new Set();
  let primeraCarga = true;
  let vista = 'avisos';
  let abierto = false;
  let audio = null;

  /* Lote 2: avisos calculados (46-proyeccion-avisos.js). Cada rol recibe los suyos. */
  const avisosApi = () => (typeof window !== 'undefined' && window.glacialAvisos) || null;
  const conPermisoEventos = () =>
    typeof tienePermiso==='function' && tienePermiso('recibirAlertasProduccion');

  function autorizado(){
    if(
      !state.user ||
      typeof tienePermiso!=='function' ||
      (!conPermisoEventos() && !(avisosApi() && avisosApi().puede()))
    ) return false;

    // El Centro de alertas solo pertenece a la aplicación operativa.
    // No debe aparecer en Login ni en el selector Reporte Agua / Reporte Hielo.
    const appScreen = document.getElementById('app-screen');
    const selector = document.getElementById('report-select-screen');

    if(!appScreen) return false;

    const estiloApp = window.getComputedStyle(appScreen);
    const appVisible =
      estiloApp.display !== 'none' &&
      estiloApp.visibility !== 'hidden' &&
      appScreen.getClientRects().length > 0;

    const selectorVisible = selector
      ? (
          window.getComputedStyle(selector).display !== 'none' &&
          window.getComputedStyle(selector).visibility !== 'hidden' &&
          selector.getClientRects().length > 0
        )
      : false;

    return appVisible && !selectorVisible;
  }

  function esc(valor){
    return String(valor ?? '').replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function fechaLocal(ms){
    const d = new Date(Number(ms));
    if(Number.isNaN(d.getTime())) return '';
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,'0');
    const dia=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dia}`;
  }

  function hoyLocal(){
    return fechaLocal(Date.now());
  }

  function fmtHora(ms){
    return new Date(Number(ms)).toLocaleTimeString('es-PE',{
      hour:'2-digit', minute:'2-digit'
    });
  }

  function sonidoSilenciado(){
    try{return localStorage.getItem(PREF_SONIDO)==='1';}
    catch(_){return false;}
  }

  function silenciar(valor){
    try{localStorage.setItem(PREF_SONIDO,valor ? '1':'0');}
    catch(_){}
  }

  const css=document.createElement('style');
  css.textContent=`
    /* ! Centro de alertas integrado en el TOPBAR real.
       * El estado cerrado ocupa su espacio junto a Visualizar / Trabajar.
       * El panel abierto se despliega debajo sin mover la cabecera. */
    #alertas-topbar-slot{
      position:relative;display:flex;align-items:center;justify-content:flex-end;
      flex:0 0 auto;margin-right:12px;z-index:10020
    }
    #al-host{
      position:relative;z-index:10020;width:256px;
      font:13px/1.45 "IBM Plex Sans",system-ui,sans-serif;color:#17334a
    }
    /* ! El host NO cambia de ancho al abrirse.
       * Así nunca empuja ni invade Visualizar / Trabajar. */
    #al-host.open{width:256px}
    #al-host .al-panel{
      border:1px solid #cbdbe5;background:#fff;border-radius:11px;overflow:hidden
    }
    #al-host:not(.open) .al-panel{box-shadow:0 3px 12px rgba(11,40,73,.07)}

    /* * Abierto: solo el panel sale del flujo y cae debajo del botón.
       ? right:0 mantiene alineado el borde derecho del panel con el botón. */
    #al-host.open .al-panel{
      position:absolute;right:0;top:calc(100% + 10px);
      width:410px;max-width:calc(100vw - 28px);
      filter:drop-shadow(0 12px 26px rgba(10,35,55,.18))
    }
    #al-host .al-bar{background:#053d60;color:#fff;display:flex;align-items:center;
      justify-content:space-between;gap:8px;padding:10px 12px}
    #al-host:not(.open) .al-bar{
      min-height:44px;background:#fff;color:#17324d;padding:0 11px
    }
    #al-host .al-bar strong{white-space:nowrap}
    /* Cerrado: el botón de configuración (⚙) solo aparece con el panel abierto, para que quepa en la cabecera. */
    #al-host:not(.open) [data-al-config]{display:none}
    #al-host .al-bar-actions{display:flex;gap:6px;align-items:center}
    #al-host button{font:inherit;cursor:pointer}
    #al-host .al-icon-btn{border:1px solid rgba(255,255,255,.55);border-radius:7px;
      padding:5px 7px;background:transparent;color:#fff;font-size:11px}
    #al-host:not(.open) .al-icon-btn{
      border-color:#cfe0f2;color:#31526f;background:#fff
    }
    #al-host .al-resumen{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;
      padding:9px 10px;background:#f6f9fb;border-bottom:1px solid #e1e9ee}
    #al-host .al-kpi{padding:7px 6px;border:1px solid #dbe5eb;border-radius:8px;
      background:#fff;text-align:center}
    #al-host .al-kpi b{display:block;font-size:15px}
    #al-host .al-kpi span{font-size:10.5px;color:#5b6e7d}
    #al-host .al-tabs{display:flex;border-bottom:1px solid #e1e9ee;background:#fff}
    #al-host .al-tab{flex:1;border:0;background:#fff;padding:9px 8px;color:#526879;font-weight:700}
    #al-host .al-tab.activo{color:#053d60;box-shadow:inset 0 -3px 0 #0b6fa4}
    #al-host .al-list{max-height:min(52vh,390px);overflow-y:auto}
    #al-host .al-aviso{padding:11px 12px;border-top:1px solid #e9eef2;
      border-left:4px solid #198754;background:#fff}
    #al-host .al-aviso.al-detencion{border-left-color:#d53d31;background:#fff8f6}
    #al-host .al-aviso b{display:block;margin-bottom:2px}
    #al-host .al-aviso small{display:block;color:#516578;margin-top:3px}
    #al-host .al-vacio{padding:22px 14px;text-align:center;color:#6b7d89}
    #al-host .al-badge{display:inline-block;min-width:20px;padding:1px 6px;margin-left:6px;border-radius:999px;
      background:#d53d31;color:#fff;font-size:11px;font-weight:800;text-align:center}
    #al-host .al-badge.cero{background:#8aa0b2}
    #al-host .al-aviso.al-av-roja{border-left-color:#d53d31;background:#fff8f6}
    #al-host .al-aviso.al-av-ambar{border-left-color:#df8b00;background:#fffbea}
    #al-host .al-aviso.al-visto{opacity:.55}
    #al-host .al-av-acc{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}
    #al-host .al-av-acc button{border:1px solid #c5d0db;background:#fff;border-radius:7px;padding:4px 9px;font-size:12px}
    #al-host .al-cerrado{display:none}
    #al-host:not(.open) .al-body{display:none}

    /* * Tablet: conserva el acceso, reduciendo el ancho del botón. */
    @media(max-width:1100px){
      #al-host,
      #al-host.open{width:190px}
      #alertas-topbar-slot{margin-right:8px}
    }

    /* ==========================================================================
     * MÓVIL · CENTRO DE ALERTAS
     * ==========================================================================
     ! IMPORTANTE: solo cambia presentación responsive.
     ! No modifica permisos, Firebase, historial, sonido ni generación de alertas.
     * Inspirado en el mockup aprobado: botón compacto en cabecera y panel
     * centrado, legible y táctil al desplegarse.
     */
    @media(max-width:800px){
      #alertas-topbar-slot{
        order:2;
        margin-left:auto;
        margin-right:8px;
        display:flex;
        align-items:center;
        min-width:0;
      }

      /* * Botón cerrado: campana + acceso compacto en el topbar. */
      #al-host,
      #al-host.open{
        width:52px;
        min-width:52px;
      }

      #al-host:not(.open) .al-panel{
        border-radius:12px;
        overflow:visible;
      }

      #al-host:not(.open) .al-bar{
        width:52px;
        min-width:52px;
        min-height:46px;
        padding:0;
        justify-content:center;
        border-radius:12px;
        border:1px solid #CFE0F2;
        background:#fff;
      }

      #al-host:not(.open) .al-bar strong{
        width:100%;
        overflow:hidden;
        white-space:nowrap;
        font-size:0;
        text-align:center;
      }

      #al-host:not(.open) .al-bar strong::before{
        content:"🔔";
        font-size:20px;
        line-height:1;
      }

      #al-host:not(.open) .al-bar-actions{
        display:none;
      }

      /* * Panel abierto: tarjeta flotante centrada bajo la cabecera. */
      #al-host.open .al-panel{
        position:fixed;
        z-index:10050;
        top:78px;
        left:50%;
        right:auto;
        transform:translateX(-50%);
        width:min(430px,calc(100vw - 24px));
        max-width:none;
        max-height:calc(100dvh - 92px);
        overflow:hidden;
        border-radius:14px;
        box-shadow:0 18px 50px rgba(11,40,73,.24);
        filter:none;
      }

      #al-host.open .al-bar{
        min-height:58px;
        padding:10px 14px;
        background:#0B4D73;
      }

      #al-host.open .al-bar strong{
        font-size:16px;
      }

      #al-host.open .al-icon-btn{
        min-width:40px;
        min-height:40px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        border-radius:9px;
      }

      #al-host .al-resumen{
        gap:8px;
        padding:10px;
      }

      #al-host .al-kpi{
        min-height:78px;
        padding:10px 5px;
        display:flex;
        flex-direction:column;
        justify-content:center;
      }

      #al-host .al-kpi b{
        font-size:18px;
      }

      #al-host .al-kpi span{
        font-size:11px;
      }

      #al-host .al-tab{
        min-height:48px;
        padding:10px 6px;
        font-size:13px;
      }

      #al-host .al-list{
        max-height:calc(100dvh - 330px);
        overflow-y:auto;
        overscroll-behavior:contain;
      }

      #al-host .al-aviso{
        padding:13px 14px;
      }

      #al-host .al-vacio{
        padding:28px 14px;
      }
    }

    @media(max-width:600px){
      #alertas-topbar-slot{
        margin-right:6px;
      }

      #al-host,
      #al-host.open{
        width:48px;
        min-width:48px;
      }

      #al-host:not(.open) .al-bar{
        width:48px;
        min-width:48px;
        min-height:44px;
      }

      #al-host.open .al-panel{
        top:70px;
        width:calc(100vw - 20px);
        max-height:calc(100dvh - 82px);
      }

      #al-host.open .al-bar{
        min-height:56px;
        padding:8px 12px;
      }

      #al-host .al-resumen{
        gap:6px;
        padding:8px;
      }

      #al-host .al-kpi{
        min-height:72px;
      }

      #al-host .al-kpi b{
        font-size:17px;
      }

      #al-host .al-kpi span{
        font-size:10px;
      }

      #al-host .al-list{
        max-height:calc(100dvh - 305px);
      }
    }

    @media(max-width:390px){
      #al-host.open .al-panel{
        top:66px;
        width:calc(100vw - 12px);
      }

      #al-host .al-resumen{
        grid-template-columns:repeat(3,minmax(0,1fr));
      }

      #al-host .al-kpi{
        padding:8px 3px;
      }

      #al-host .al-tab{
        font-size:12px;
      }
    }
  `;
  document.head.appendChild(css);

  function panel(){
    let el=document.getElementById('al-host');
    if(!autorizado()){
      el?.remove();
      return null;
    }
    if(!el){
      el=document.createElement('aside');
      el.id='al-host';
      el.setAttribute('aria-label','Centro de alertas de producción');

      // ! El anclaje del topbar evita depender de top/right según la resolución.
      const slot=document.getElementById('alertas-topbar-slot');
      (slot || document.body).appendChild(el);
    }
    return el;
  }

  function eventosHoy(){
    const hoy=hoyLocal();
    return eventos
      .filter(e=>fechaLocal(e.momento)===hoy)
      .sort((a,b)=>Number(b.momento)-Number(a.momento));
  }

  function activasHoy(){
    const hoy=eventosHoy();
    const ultimoPorClave=new Map();
    [...hoy].sort((a,b)=>Number(a.momento)-Number(b.momento)).forEach(e=>{
      ultimoPorClave.set(e.clave,e);
    });
    return [...ultimoPorClave.values()]
      .filter(e=>e.tipo==='detencion')
      .sort((a,b)=>Number(b.momento)-Number(a.momento));
  }

  function pintar(){
    const el=panel();
    if(!el)return;

    const hoy=eventosHoy();
    const activas=activasHoy();
    const detenciones=hoy.filter(e=>e.tipo==='detencion').length;
    const resueltas=hoy.filter(e=>e.tipo==='reanudacion').length;
    const api=avisosApi();
    const avisos=api ? api.listar() : [];
    const noVistos=avisos.filter(a=>!a.visto).length;
    const verEventos=conPermisoEventos();
    if(vista==='avisos' && !api) vista='activas';
    if(vista!=='avisos' && !verEventos) vista='avisos';
    const lista=vista==='historial' ? hoy : activas;
    const sonido=sonidoSilenciado() ? '🔇' : '🔊';
    const nombreLinea=k=>{
      try{const l=(typeof LINES!=='undefined'?LINES:[]).find(x=>x.key===k);return l?l.name:k;}catch(_){return k;}
    };
    const chipEstado=window.glacialEstadoDatos ? window.glacialEstadoDatos.chip() : '';
    const htmlAvisos=avisos.length ? avisos.map(a=>`
            <div class="al-aviso al-av-${esc(a.severidad)} ${a.visto?'al-visto':''}">
              <b>${a.severidad==='roja'?'🔴':'🟠'} ${esc(a.tipo==='tareo'?a.linea:nombreLinea(a.linea))}</b>
              <div>${esc(a.texto)}</div>
              <small>Desde las ${esc(fmtHora(a.desdeMs))}${a.visto?' · visto en este dispositivo':''}</small>
              <div class="al-av-acc">
                <button type="button" data-av-ir="${esc(a.id)}">Ir a la pantalla</button>
                ${a.visto?'':`<button type="button" data-av-visto="${esc(a.id)}">Marcar como visto</button>`}
              </div>
            </div>`).join('')
      : '<div class="al-vacio">Sin avisos: todo en orden.</div>';

    // * Solo refleja el estado visual; no altera la lógica de las alertas.
    el.classList.toggle('open',abierto);

    el.innerHTML=`<div class="al-panel">
      <div class="al-bar">
        <strong>🔔 Centro de alertas${api?`<span class="al-badge ${noVistos?'':'cero'}" data-al-contador title="Avisos sin ver en este dispositivo">${noVistos}</span>`:''}</strong>
        <div class="al-bar-actions">
          ${api&&api.puedeConfigurar()?'<button type="button" class="al-icon-btn" data-al-config title="Umbrales de avisos y proyección">⚙</button>':''}
          <button type="button" class="al-icon-btn" data-al-sonido
            title="${sonidoSilenciado()?'Activar sonido':'Silenciar alertas'}">${sonido}</button>
          <button type="button" class="al-icon-btn" data-al-toggle
            title="${abierto?'Minimizar':'Abrir'}">${abierto?'−':'+'}</button>
        </div>
      </div>
      <div class="${abierto?'':'al-cerrado'}">
        <div style="padding:6px 10px;background:#f6f9fb;border-bottom:1px solid #e1e9ee;text-align:right">${chipEstado}</div>
        ${verEventos?`<div class="al-resumen">
          <div class="al-kpi"><b>${activas.length}</b><span>Activas</span></div>
          <div class="al-kpi"><b>${detenciones}</b><span>Detenciones hoy</span></div>
          <div class="al-kpi"><b>${resueltas}</b><span>Reanudaciones</span></div>
        </div>`:''}
        <div class="al-tabs">
          ${api?`<button type="button" class="al-tab ${vista==='avisos'?'activo':''}"
            data-al-vista="avisos">Avisos · ${avisos.length}</button>`:''}
          ${verEventos?`<button type="button" class="al-tab ${vista==='activas'?'activo':''}"
            data-al-vista="activas">Alertas activas</button>
          <button type="button" class="al-tab ${vista==='historial'?'activo':''}"
            data-al-vista="historial">Historial de hoy · ${hoy.length}</button>`:''}
        </div>
        <div class="al-list" aria-live="polite">
          ${vista==='avisos' ? htmlAvisos : lista.length ? lista.map(a=>`
            <div class="al-aviso ${a.tipo==='detencion'?'al-detencion':''}">
              <b>${a.tipo==='detencion'?'🔴 Línea detenida':'🟢 Producción reanudada'} · ${esc(a.linea)}</b>
              <div>${esc(a.marca)} · ${esc(a.presentacion)}</div>
              <small>${esc(a.turno)} · ${esc(fmtHora(a.momento))}
                ${a.operador?' · '+esc(a.operador):''}</small>
              ${a.motivo ? '<small>Motivo: '+esc(a.motivo)+'</small>' : ''}
            </div>`).join('')
            : `<div class="al-vacio">${vista==='historial'
                ? 'No hay alertas registradas hoy.'
                : 'No hay alertas activas.'}</div>`}
        </div>
      </div>
    </div>`;
  }

  async function desbloquearAudio(){
    if(!autorizado() || sonidoSilenciado())return;
    if(audio?.state==='running')return;
    try{
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)return;
      if(!audio)audio=new Audio();
      if(audio.state==='suspended')await audio.resume();
    }catch(err){
      console.debug('El navegador bloqueó el sonido de alertas:',err);
    }
    pintar();
  }

  function tono(frecuencia,comienzo,duracion){
    const oscilador=audio.createOscillator();
    const volumen=audio.createGain();
    oscilador.type='sine';
    oscilador.frequency.value=frecuencia;
    volumen.gain.setValueAtTime(0,comienzo);
    volumen.gain.linearRampToValueAtTime(.11,comienzo+.015);
    volumen.gain.exponentialRampToValueAtTime(.001,comienzo+duracion);
    oscilador.connect(volumen);
    volumen.connect(audio.destination);
    oscilador.start(comienzo);
    oscilador.stop(comienzo+duracion+.01);
  }

  function sonar(tipo){
    if(sonidoSilenciado() || !audio || audio.state!=='running')return;
    try{
      const t=audio.currentTime+.03;
      if(tipo==='detencion'){
        tono(440,t,.19);tono(370,t+.24,.19);tono(330,t+.48,.27);
      }else{
        tono(660,t,.17);tono(880,t+.23,.26);
      }
    }catch(err){
      console.debug('No se pudo emitir el sonido:',err);
    }
  }

  function turnoMostrado(p,momento){
    if(p.turno!=='DÍA')return p.turno;
    const hora=new Date(Number(momento)).getHours();
    return hora>=15 && hora<22 ? 'INTERMEDIO' : 'DÍA';
  }

  function extraerEventos(items){
    const salida=[];
    (Array.isArray(items)?items:[]).forEach(p=>{
      const clave=p.clave || [p.linea,p.fecha,p.turno,p.marca,p.presentacion].join('|');
      const linea=LINES.find(l=>l.key===p.linea)?.name || p.linea;
      (Array.isArray(p.historialAlertas)?p.historialAlertas:[]).forEach(a=>{
        const momento=Number(a.momento);
        if(!Number.isFinite(momento)||momento<=0)return;
        salida.push({
          id:a.id || `${clave}|${momento}|${a.tipo}`,
          clave,
          tipo:a.tipo,
          momento,
          linea,
          marca:p.marca,
          presentacion:p.presentacion,
          turno:turnoMostrado(p,momento),
          operador:a.operador || '',
          motivo:a.motivo || ''
        });
      });
    });
    return salida;
  }

  function procesarAlertasOperacion(items){
    const nuevosEventos=extraerEventos(items);
    const idsNuevos=new Set(nuevosEventos.map(e=>e.id));

    if(!primeraCarga && autorizado()){
      nuevosEventos.forEach(e=>{
        if(!idsConocidos.has(e.id)){
          sonar(e.tipo);
          if(e.tipo==='detencion'){
            vista='activas';
            abierto=true;
          }
        }
      });
    }

    eventos=nuevosEventos;
    idsConocidos=idsNuevos;
    primeraCarga=false;
    pintar();
  }

  globalThis.procesarAlertasOperacion=procesarAlertasOperacion;
  globalThis.glacialAlertasPintar=pintar;          // 46-proyeccion-avisos.js lo llama cuando cambian los avisos

  // Aplicar altas/bajas del permiso inmediatamente cuando sync/users cambie
  // en Firestore, sin cerrar sesión ni recargar la página.
  const usuariosActualizadosAnterior=onUsersUpdated;
  onUsersUpdated=function(...args){
    const resultado=usuariosActualizadosAnterior.apply(this,args);
    pintar();
    return resultado;
  };

  const actualizarAnterior=onProgramacionesUpdated;
  onProgramacionesUpdated=function(...args){
    procesarAlertasOperacion(loadProgramaciones());
    return actualizarAnterior.apply(this,args);
  };

  const entrarAnterior=enterApp;
  enterApp=function(...args){
    const resultado=entrarAnterior.apply(this,args);
    primeraCarga=true;
    procesarAlertasOperacion(loadProgramaciones());
    return resultado;
  };

  const salirAnterior=handleLogout;
  handleLogout=function(...args){
    const resultado=salirAnterior.apply(this,args);
    document.getElementById('al-host')?.remove();
    eventos=[];
    idsConocidos.clear();
    primeraCarga=true;
    return resultado;
  };

  // Vigila cambios de pantalla: si se vuelve al selector inicial/login,
  // retira el Centro de alertas inmediatamente.
  const vigilarPantalla = new MutationObserver(()=>{
    const host=document.getElementById('al-host');
    if(host && !autorizado()) host.remove();
  });

  const iniciarVigilancia=()=>{
    const appScreen=document.getElementById('app-screen');
    const selector=document.getElementById('report-select-screen');

    [appScreen,selector].filter(Boolean).forEach(el=>{
      vigilarPantalla.observe(el,{
        attributes:true,
        attributeFilter:['style','class','hidden']
      });
    });
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',iniciarVigilancia,{once:true});
  }else{
    iniciarVigilancia();
  }

  document.addEventListener('keydown',desbloquearAudio);

  document.addEventListener('click',event=>{
    const host=event.target.closest('#al-host');
    if(!host){
      void desbloquearAudio();
      return;
    }
    if(!autorizado())return;

    const irBtn=event.target.closest('[data-av-ir]');
    if(irBtn && avisosApi()){avisosApi().ir(irBtn.dataset.avIr);return;}
    const vistoBtn=event.target.closest('[data-av-visto]');
    if(vistoBtn && avisosApi()){avisosApi().visto(vistoBtn.dataset.avVisto);return;}
    if(event.target.closest('[data-al-config]') && avisosApi()){avisosApi().abrirConfig();return;}

    const vistaBtn=event.target.closest('[data-al-vista]');
    if(vistaBtn){
      vista=vistaBtn.dataset.alVista;
      pintar();
      return;
    }

    if(event.target.closest('[data-al-toggle]')){
      abierto=!abierto;
      pintar();
      return;
    }

    if(event.target.closest('[data-al-sonido]')){
      if(sonidoSilenciado()){
        silenciar(false);
        pintar();
        void desbloquearAudio();
      }else{
        silenciar(true);
        pintar();
      }
    }
  });
})();
