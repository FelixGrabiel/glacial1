/* GLACIAL · Centro de alertas + historial diario.
   Cargar después de 24-semaforo-produccion-actual.js y antes de 12-init.js.
   El historial se guarda dentro de sync/programaciones -> historialAlertas.
   No requiere crear un documento nuevo en Firestore. */
(function instalarAlertasLineas(){
  'use strict';

  const DESTINATARIOS = new Set([
    'Gerente General','Gerente','Jefe de Producción','Jefe de Operaciones',
    'Planificación','Ventas','Ventas y Planificación'
  ]);

  const PREF_SONIDO = 'glacial_alertas_lineas_silenciadas';
  let eventos = [];
  let idsConocidos = new Set();
  let primeraCarga = true;
  let vista = 'activas';
  let abierto = true;
  let audio = null;

  function autorizado(){
    return !!state.user && DESTINATARIOS.has(String(state.user.rol || '').trim());
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
    #al-host{position:fixed;right:18px;bottom:18px;z-index:10020;
      width:min(410px,calc(100vw - 28px));font:13px/1.45 system-ui,sans-serif;
      color:#17334a;filter:drop-shadow(0 10px 24px rgba(10,35,55,.18))}
    #al-host .al-panel{border:1px solid #cbdbe5;background:#fff;border-radius:14px;overflow:hidden}
    #al-host .al-bar{background:#053d60;color:#fff;display:flex;align-items:center;
      justify-content:space-between;gap:8px;padding:10px 12px}
    #al-host .al-bar-actions{display:flex;gap:6px;align-items:center}
    #al-host button{font:inherit;cursor:pointer}
    #al-host .al-icon-btn{border:1px solid rgba(255,255,255,.55);border-radius:7px;
      padding:5px 7px;background:transparent;color:#fff;font-size:11px}
    #al-host .al-resumen{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;
      padding:9px 10px;background:#f6f9fb;border-bottom:1px solid #e1e9ee}
    #al-host .al-kpi{padding:7px 6px;border:1px solid #dbe5eb;border-radius:8px;
      background:#fff;text-align:center}
    #al-host .al-kpi b{display:block;font-size:15px}
    #al-host .al-kpi span{font-size:10.5px;color:#5b6e7d}
    #al-host .al-tabs{display:flex;border-bottom:1px solid #e1e9ee;background:#fff}
    #al-host .al-tab{flex:1;border:0;background:#fff;padding:9px 8px;color:#526879;
      font-weight:700}
    #al-host .al-tab.activo{color:#053d60;box-shadow:inset 0 -3px 0 #0b6fa4}
    #al-host .al-list{max-height:min(52vh,390px);overflow-y:auto}
    #al-host .al-aviso{padding:11px 12px;border-top:1px solid #e9eef2;
      border-left:4px solid #198754;background:#fff}
    #al-host .al-aviso.al-detencion{border-left-color:#d53d31;background:#fff8f6}
    #al-host .al-aviso b{display:block;margin-bottom:2px}
    #al-host .al-aviso small{display:block;color:#516578;margin-top:3px}
    #al-host .al-vacio{padding:22px 14px;text-align:center;color:#6b7d89}
    #al-host .al-cerrado{display:none}
    @media(max-width:600px){#al-host{right:10px;bottom:10px;width:calc(100vw - 20px)}}
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
      document.body.appendChild(el);
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
    const lista=vista==='historial' ? hoy : activas;
    const sonido=sonidoSilenciado() ? '🔇' : '🔊';

    el.innerHTML=`<div class="al-panel">
      <div class="al-bar">
        <strong>🔔 Centro de alertas</strong>
        <div class="al-bar-actions">
          <button type="button" class="al-icon-btn" data-al-sonido
            title="${sonidoSilenciado()?'Activar sonido':'Silenciar alertas'}">${sonido}</button>
          <button type="button" class="al-icon-btn" data-al-toggle
            title="${abierto?'Minimizar':'Abrir'}">${abierto?'−':'+'}</button>
        </div>
      </div>
      <div class="${abierto?'':'al-cerrado'}">
        <div class="al-resumen">
          <div class="al-kpi"><b>${activas.length}</b><span>Activas</span></div>
          <div class="al-kpi"><b>${detenciones}</b><span>Detenciones hoy</span></div>
          <div class="al-kpi"><b>${resueltas}</b><span>Reanudaciones</span></div>
        </div>
        <div class="al-tabs">
          <button type="button" class="al-tab ${vista==='activas'?'activo':''}"
            data-al-vista="activas">Alertas activas</button>
          <button type="button" class="al-tab ${vista==='historial'?'activo':''}"
            data-al-vista="historial">Historial de hoy · ${hoy.length}</button>
        </div>
        <div class="al-list" aria-live="polite">
          ${lista.length ? lista.map(a=>`
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

  document.addEventListener('keydown',desbloquearAudio);

  document.addEventListener('click',event=>{
    const host=event.target.closest('#al-host');
    if(!host){
      void desbloquearAudio();
      return;
    }
    if(!autorizado())return;

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
