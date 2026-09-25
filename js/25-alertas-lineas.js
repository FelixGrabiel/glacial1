/* GLACIAL · Avisos de detención y reanudación para gerencia, jefatura y ventas.
   Cargar después de 24-semaforo-produccion-actual.js y antes de 12-init.js.
   Usa la sincronización ya existente de sync/programaciones. */
(function instalarAlertasLineas(){
  'use strict';
  const DESTINATARIOS = new Set([
    'Gerente General','Gerente','Jefe de Producción','Jefe de Operaciones',
    'Planificación','Ventas','Ventas y Planificación'
  ]);
  const PREF_SONIDO = 'glacial_alertas_lineas_silenciadas';
  let fotoAnterior = null;
  let avisos = [];
  const vistos = new Set();
  let audio = null;

  function autorizado(){
    return !!state.user && DESTINATARIOS.has(String(state.user.rol || '').trim());
  }
  function esc(valor){
    return String(valor ?? '').replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function sonidoSilenciado(){
    try{return localStorage.getItem(PREF_SONIDO)==='1';}
    catch(_){return false;}
  }
  function silenciar(valor){
    try{localStorage.setItem(PREF_SONIDO,valor ? '1':'0');}
    catch(_){/* Puede estar deshabilitado el almacenamiento local. */}
  }
  const css=document.createElement('style');
  css.textContent=`
    #al-host{position:fixed;right:18px;bottom:18px;z-index:10020;
      width:min(370px,calc(100vw - 28px));font:13px/1.45 system-ui,sans-serif;
      color:#17334a;filter:drop-shadow(0 9px 20px rgba(10,35,55,.18))}
    #al-host .al-panel{border:1px solid #cbdbe5;background:#fff;border-radius:12px;
      overflow:hidden}
    #al-host .al-bar{background:#053d60;color:#fff;display:flex;
      align-items:center;justify-content:space-between;gap:8px;padding:9px 11px}
    #al-host .al-bar strong{font-size:13px}
    #al-host button{font:inherit;cursor:pointer}
    #al-host .al-sound{border:1px solid rgba(255,255,255,.6);border-radius:6px;
      padding:5px 7px;background:transparent;color:#fff;white-space:nowrap;font-size:11px}
    #al-host .al-list{max-height:min(54vh,360px);overflow-y:auto}
    #al-host .al-aviso{position:relative;padding:11px 36px 11px 12px;
      border-top:1px solid #e6edf1;border-left:4px solid #198754}
    #al-host .al-aviso.al-detencion{border-left-color:#d53d31;background:#fff8f6}
    #al-host .al-aviso b{display:block;margin-bottom:2px}
    #al-host .al-aviso small{display:block;color:#516578;margin-top:3px}
    #al-host .al-cerrar{position:absolute;top:8px;right:8px;border:0;
      border-radius:5px;background:transparent;color:#516578;font-size:17px;
      width:25px;height:25px;line-height:23px}
    #al-host .al-cerrar:hover{background:#e8eef1}
    @media(max-width:600px){#al-host{right:10px;bottom:10px}}
  `;
  document.head.appendChild(css);

  function panel(){
    let el=document.getElementById('al-host');
    if(!autorizado()){
      el?.remove();avisos=[];
      return null;
    }
    if(!el){
      el=document.createElement('aside');
      el.id='al-host';
      el.setAttribute('aria-label','Alertas de líneas de producción');
      document.body.appendChild(el);
    }
    return el;
  }
  function pintar(){
    const el=panel();
    if(!el)return;
    const sonido=sonidoSilenciado() ? 'Sonido apagado' :
      audio?.state==='running' ? 'Sonido activo' : 'Activar sonido';
    el.innerHTML=`<div class="al-panel"><div class="al-bar">
      <strong>🔔 Alertas de líneas${avisos.length ? ' · '+avisos.length : ''}</strong>
      <button type="button" class="al-sound" data-al-sonido
        aria-label="${sonidoSilenciado() ? 'Activar sonido' : 'Silenciar alertas'}">${sonido}</button>
      </div><div class="al-list" aria-live="polite">
      ${avisos.map((a,i)=>`<div class="al-aviso ${a.tipo==='detencion'?'al-detencion':''}"
        ${a.tipo==='detencion'?'role="alert"':''}>
        <b>${a.tipo==='detencion'?'🔴 Línea detenida':'🟢 Producción reanudada'} · ${esc(a.linea)}</b>
        <div>${esc(a.marca)} · ${esc(a.presentacion)}</div>
        <small>${esc(a.turno)} · ${esc(a.hora)}${a.operador?' · '+esc(a.operador):''}</small>
        ${a.tipo==='detencion' && a.motivo ? '<small>Motivo: '+esc(a.motivo)+'</small>' : ''}
        <button type="button" class="al-cerrar" data-al-cerrar="${i}"
          aria-label="Cerrar aviso">×</button></div>`).join('')}</div></div>`;
  }
  async function desbloquearAudio(){
    if(!autorizado() || sonidoSilenciado())return;
    if(audio?.state==='running')return;
    try{
      const Audio = window.AudioContext || window.webkitAudioContext;
      if(!Audio)return;
      if(!audio)audio=new Audio();
      if(audio.state==='suspended')await audio.resume();
    }catch(err){console.debug('El navegador bloqueó el sonido de alertas:',err);}
    pintar();
  }
  function tono(frecuencia,comienzo,duracion){
    const oscilador=audio.createOscillator();
    const volumen=audio.createGain();
    oscilador.type='sine';oscilador.frequency.value=frecuencia;
    volumen.gain.setValueAtTime(0,comienzo);
    volumen.gain.linearRampToValueAtTime(.11,comienzo+.015);
    volumen.gain.exponentialRampToValueAtTime(.001,comienzo+duracion);
    oscilador.connect(volumen);volumen.connect(audio.destination);
    oscilador.start(comienzo);oscilador.stop(comienzo+duracion+.01);
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
    }catch(err){console.debug('No se pudo emitir el sonido:',err);}
  }
  function cambio(previo,actual){
    const de=previo?.estadoOperacion?.estado;
    const a=actual?.estadoOperacion?.estado;
    if(de==='EN_PRODUCCION' && a==='DETENIDA')return 'detencion';
    if((de==='DETENIDA'||de==='LISTA') && a==='EN_PRODUCCION')return 'reanudacion';
    return '';
  }
  function turnoMostrado(p,momento){
    if(p.turno!=='DÍA')return p.turno;
    const hora=new Date(momento).getHours();
    return hora>=15 && hora<22 ? 'INTERMEDIO' : 'DÍA';
  }
  function nuevaAlerta(p,tipo){
    const op=p.estadoOperacion;
    const momento=Number(op.actualizadoEn);
    if(!Number.isFinite(momento)||momento<=0)return;
    const linea=LINES.find(l=>l.key===p.linea)?.name || p.linea;
    const id=[p.clave || [p.linea,p.fecha,p.turno,p.marca,p.presentacion].join('|'),
      momento,tipo].join('|');
    if(vistos.has(id))return;
    vistos.add(id);
    const d=new Date(momento);
    avisos.unshift({id,tipo,linea,marca:p.marca,presentacion:p.presentacion,
      turno:turnoMostrado(p,momento),
      hora:d.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'}),
      operador:op.actualizadoPor,motivo:op.motivo});
    avisos=avisos.slice(0,6);
    pintar();sonar(tipo);
  }
  // La primera foto solo establece el punto de partida: abrir la app no
  // repite alertas históricas. Los siguientes cambios sí llegan en vivo.
  function procesarAlertasOperacion(items){
    if(!Array.isArray(items))return;
    const siguiente=new Map(items.map(p=>[
      p.clave || [p.linea,p.fecha,p.turno,p.marca,p.presentacion].join('|'),p
    ]));
    if(fotoAnterior && autorizado()){
      siguiente.forEach((p,k)=>{
        const anterior=fotoAnterior.get(k);
        if(!anterior)return;
        const tipo=cambio(anterior,p);
        if(tipo && Number(p.estadoOperacion?.actualizadoEn)>
            Number(anterior.estadoOperacion?.actualizadoEn || 0))nuevaAlerta(p,tipo);
      });
    }
    fotoAnterior=siguiente;
    if(!autorizado())panel();
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
    pintar();
    return resultado;
  };
  const salirAnterior=handleLogout;
  handleLogout=function(...args){
    const resultado=salirAnterior.apply(this,args);
    document.getElementById('al-host')?.remove();
    avisos=[];
    return resultado;
  };
  document.addEventListener('keydown',desbloquearAudio);
  document.addEventListener('click',event=>{
    const el=event.target.closest('#al-host');
    if(!el){void desbloquearAudio();return;}
    if(!autorizado())return;
    const cerrar=event.target.closest('[data-al-cerrar]');
    if(cerrar){avisos.splice(Number(cerrar.dataset.alCerrar),1);pintar();return;}
    if(event.target.closest('[data-al-sonido]')){
      if(sonidoSilenciado()){
        silenciar(false);pintar();void desbloquearAudio();
      }else if(audio?.state==='running'){
        silenciar(true);pintar();
      }else void desbloquearAudio();
    }
  });
})();
