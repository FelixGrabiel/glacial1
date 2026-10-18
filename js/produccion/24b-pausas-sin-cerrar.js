/* =============================================================
   GLACIAL · PAUSAS Y PARADAS ABIERTAS — qué se muestra como «PARADA» y cómo se cierran las olvidadas
   -------------------------------------------------------------
   Corrige el panel «PARADAS DE HOY» (43-bitacora-mantenimiento.js) y los avisos (46-proyeccion-avisos.js). Antes se mostraba como parada TODA
   programación con estadoOperacion = PAUSA / DETENIDA / LISTA, sin importar cuándo empezó ni de qué tipo era:
     · «Cambio temporal de producción» NO es una parada: es la presentación anterior «estacionada» cuando se inicia otra en la misma línea
       (la línea sigue produciendo). Ya la excluyen 23b-tiempos-linea.js y 24-semaforo-produccion-actual.js; ahora también el panel.
     · Pausas y paradas que llevan MÁS DE 24 h abiertas son olvidos, no paradas de hoy: van aparte, en «Pausas sin cerrar (revisar)»
       (en ámbar; también lo que empezó antes del turno anterior al día operativo actual), junto con las presentaciones que siguen EN PRODUCCIÓN cuando su turno terminó hace más de 24 h.
   Reglas de «PARADA PROLONGADA» (todas editables en CONFIG):
     · Refrigerio: alerta si pasa de 60 min · Cambio temporal (solo si la línea no tiene otra presentación en producción): 30 min
     · Otras pausas programadas: lo mayor entre el umbral general (PARADA_ALERTA_MIN) y su estándar · Detenciones: umbral general (como antes).
   CERRAR PAUSA (Supervisor, Jefe de Operaciones, Administrador): pide la hora real de fin (por defecto la hora de finalización de la
   programación si ya existe; si no, el fin de su turno), cierra los registros de parada con esa hora, deja la programación FINALIZADA y anota
   en su historial (historialAlertas) quién, cuándo, la hora indicada y el estado anterior. Los cálculos de tiempos (23b) leen ese cierre.
   CIERRE AUTOMÁTICO (para que no se vuelvan a olvidar):
     · FINALIZAR la línea: ya cerraba las pausas del plan (24-semaforo-produccion-actual.js).
     · INICIAR otra presentación: una pausa REAL (p. ej. refrigerio) de otra presentación del plan se cierra con esa hora y la presentación queda
       «estacionada» (24 llama a estacionarProgramacion).
     · FINALIZAR el reporte del turno (06-registro.js): las pausas reales abiertas del plan se cierran al fin del turno (cerrarAlCerrarTurno).
   Cargar DESPUÉS de 24-semaforo-produccion-actual.js y ANTES de 43-bitacora-mantenimiento.js / 46-proyeccion-avisos.js.
   ============================================================= */
(function instalarPausasSinCerrar(global){
  'use strict';
  const CAMBIO='Cambio temporal de producción';
  const CONFIG={
    refrigerioMin:60,                 // «Refrigerio» solo alerta si pasa de este tiempo
    cambioTemporalMin:30,             // «Cambio temporal de producción» (si la línea no tiene otra presentación produciendo)
    horasSinCerrar:24,                // más de este tiempo abierta = «Pausas sin cerrar (revisar)»
    arrastreTurnoAnteriorHoras:12,    // además de hoy (07:00 a 07:00) se admite el turno anterior; lo que empezó antes también va a «sin cerrar»
    rolesCierre:['Supervisor','Supervisor de Producción','Jefe de Operaciones','Administrador']
  };
  const HORA=3600000;
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const norm=t=>String(t==null?'':t).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
  const esCambioTemporal=m=>norm(m)===norm(CAMBIO);
  const esRefrigerio=m=>norm(m).indexOf('refrigerio')>=0;
  const ahoraServ=()=>typeof ahoraServidor==='function'?ahoraServidor():Date.now();
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad=n=>String(n).padStart(2,'0');

  /* 135 → «2 h 15 min»; 45 → «45 min»; 120 → «2 h». */
  function fmtDuracion(min){
    min=Math.max(0,Math.round(num(min)));
    if(min<60)return min+' min';
    const h=Math.floor(min/60),m=min%60;
    return h+' h'+(m?' '+m+' min':'');
  }
  const fmtFechaHora=ms=>{
    if(!ms)return '—';
    const d=new Date(ms);
    return pad(d.getDate())+'/'+pad(d.getMonth()+1)+' '+pad(d.getHours())+':'+pad(d.getMinutes());
  };

  /* Fin del turno de una programación (por línea y fecha: usa el mismo resolvedor de horarios que los tiempos). */
  function finDeTurno(fecha,turno,linea){
    try{
      const f=global.__tiemposLineaInternos&&global.__tiemposLineaInternos.rangoTurno;
      const r=f?f(fecha,turno,false,linea):null;
      if(r&&num(r.fin)>0)return num(r.fin);
    }catch(_){/* se usa el horario general */}
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha||''));
    if(!m)return 0;
    const dia=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),0,0,0,0).getTime();
    return turno==='NOCHE'?dia+31*HORA:dia+19*HORA;          // NOCHE termina 07:00 del día siguiente; DÍA/INTERMEDIO 19:00
  }

  /* Inicio del día operativo (07:00) al que pertenece el instante ms. */
  function inicioDiaOperativo(ms){
    const d=new Date(ms);
    if(d.getHours()<7)d.setDate(d.getDate()-1);
    d.setHours(7,0,0,0);
    return d.getTime();
  }

  /* Estado de una programación como «registro abierto»: {tipo, motivo, desde, estandarMin} o null. */
  function registroAbierto(p){
    const op=p&&p.estadoOperacion;
    if(!op)return null;
    const abierta=(Array.isArray(op.paradas)?op.paradas:[]).filter(x=>x&&!num(x.fin)).slice(-1)[0];
    if(op.estado==='PAUSA'){
      const desde=num(op.pausaDesde);
      return desde?{tipo:'PAUSA',motivo:op.motivoPausa||'Pausa programada',desde,estandarMin:num(abierta&&abierta.estandarMin)}:null;
    }
    if(op.estado==='DETENIDA'||op.estado==='LISTA'){
      const desde=num(op.detenidaDesde);
      const motivo=op.motivoDetalle?((norm(op.motivo)==='otro'?'Otro':op.motivo||'')+' — '+op.motivoDetalle):(op.motivo||'');
      return desde?{tipo:'DETENCION',motivo,desde,estandarMin:num(abierta&&abierta.estandarMin)}:null;
    }
    return null;
  }

  /* ---------- análisis (puro) ----------
     programaciones: lista de sync/programaciones · ahora (ms) · opc: {umbralRojoMin}
     → {abiertas:[…se muestran como parada…], sinCerrar:[…revisar…]}.  opc.iniDia: inicio del día operativo (ms; por defecto las 07:00 de hoy). Cada entrada: {clave, linea, fecha, turno, marca, presentacion, estado, tipo,
        motivo, desde, min, estandarMin, larga?}. tipo: PAUSA · DETENCION · PRODUCCION (sigue EN PRODUCCIÓN con el turno terminado hace > 24 h). */
  function analizar(programaciones,ahora,opc){
    opc=opc||{};
    const umbralRojo=num(opc.umbralRojoMin)>0?num(opc.umbralRojoMin):30;
    const limiteMs=CONFIG.horasSinCerrar*HORA;
    // Día operativo actual: 07:00 a 07:00. Solo cuentan las abiertas que empezaron en él o, como máximo, en el turno anterior (12 h antes).
    const iniDia=num(opc.iniDia)>0?num(opc.iniDia):inicioDiaOperativo(ahora);
    const desdeMinimo=iniDia-CONFIG.arrastreTurnoAnteriorHoras*HORA;
    const prog=(programaciones||[]).filter(p=>p&&p.estadoOperacion);
    const produccionObsoleta=p=>ahora-finDeTurno(p.fecha,p.turno,p.linea)>limiteMs;
    const lineaProduciendo=new Set();
    prog.forEach(p=>{if(p.estadoOperacion.estado==='EN_PRODUCCION'&&!produccionObsoleta(p))lineaProduciendo.add(p.linea);});
    const abiertas=[],sinCerrar=[];
    prog.forEach(p=>{
      const op=p.estadoOperacion;
      const base={clave:p.clave||'',linea:p.linea||'',fecha:p.fecha||'',turno:p.turno||'',marca:p.marca||'',presentacion:p.presentacion||'',estado:op.estado};
      if(op.estado==='EN_PRODUCCION'){
        if(produccionObsoleta(p)){
          const desde=num(op.inicio)||finDeTurno(p.fecha,p.turno,p.linea);
          sinCerrar.push({...base,tipo:'PRODUCCION',motivo:'Sigue en producción (turno terminado)',desde,min:Math.floor((ahora-desde)/60000),estandarMin:0});
        }
        return;
      }
      const r=registroAbierto(p);
      if(!r)return;
      const e={...base,...r,min:Math.max(0,Math.floor((ahora-r.desde)/60000))};
      if(e.min>CONFIG.horasSinCerrar*60||e.desde<desdeMinimo){sinCerrar.push(e);return;}
      // «Cambio temporal»: la presentación anterior estacionada mientras la línea produce otra → no es una parada.
      if(e.tipo==='PAUSA'&&esCambioTemporal(e.motivo)&&lineaProduciendo.has(p.linea))return;
      let umbral=umbralRojo;
      if(e.tipo==='PAUSA'){
        if(esCambioTemporal(e.motivo))umbral=CONFIG.cambioTemporalMin;
        else if(esRefrigerio(e.motivo))umbral=CONFIG.refrigerioMin;
        else umbral=Math.max(umbralRojo,e.estandarMin);
      }
      e.umbralMin=umbral;e.larga=e.min>umbral;
      abiertas.push(e);
    });
    abiertas.sort((a,b)=>a.desde-b.desde);
    sinCerrar.sort((a,b)=>a.desde-b.desde);
    return {abiertas,sinCerrar};
  }

  /* ---------- cierres (puros sobre estadoOperacion) ---------- */
  function cerrarRegistros(paradas,finMs){
    return (Array.isArray(paradas)?paradas:[]).map(r=>{
      if(!r||num(r.fin)>0)return r;
      return {...r,fin:Math.max(num(r.inicio),finMs)};
    });
  }
  /* Programación → FINALIZADA con hora de fin indicada (cierra paradas y suma lo acumulado). */
  function finalizarConHora(p,finMs,ahora,quien,nota){
    const op={...(p.estadoOperacion||{})},e=op.estado,r=registroAbierto(p);
    if(e==='PAUSA'&&num(op.pausaDesde)>0)op.pausaAcumuladaMs=num(op.pausaAcumuladaMs)+Math.max(0,finMs-num(op.pausaDesde));
    if(['DETENIDA','LISTA'].includes(e)&&num(op.detenidaDesde)>0)op.detencionAcumuladaMs=num(op.detencionAcumuladaMs)+Math.max(0,finMs-num(op.detenidaDesde));
    op.paradas=cerrarRegistros(op.paradas,finMs);
    if(r)op.ultimaParada={tipo:r.tipo==='PAUSA'?'PAUSA_PROGRAMADA':'DETENCION',inicio:r.desde,fin:finMs,duracionMs:Math.max(0,finMs-r.desde),motivo:r.motivo,cierreManual:true};
    op.cierreManual={por:quien,en:ahora,finMs,estadoAnterior:e,motivo:r?r.motivo:'',nota:nota||''};
    op.pausaDesde=0;op.detenidaDesde=0;op.motivo='';op.motivoPausa='';op.equipo='';op.causa='';
    op.estado='FINALIZADA';op.finalizadaEn=finMs;op.finalizadaPor=quien;op.actualizadoEn=ahora;op.actualizadoPor=quien;
    const historial=[...(Array.isArray(p.historialAlertas)?p.historialAlertas:[])];
    if(r)historial.push({id:`${p.clave}|${finMs}|cierre_parada`,tipo:'cierre_parada',momento:finMs,operador:quien});   // 23b: cierra la pausa/detención abierta con esta hora
    historial.push({id:`${p.clave}|${ahora}|cierre_manual`,tipo:'cierre_manual_pausa',momento:ahora,operador:quien,finMs,estadoAnterior:e,motivo:r?r.motivo:'',nota:nota||''});
    return {...p,estadoOperacion:op,historialAlertas:historial.slice(-300)};
  }
  /* Pausa REAL (p. ej. refrigerio) → cerrada con finMs; la presentación queda «estacionada» (cambio temporal), como cuando se inicia otra. */
  function estacionarProgramacion(p,finMs,quien){
    const ahora=ahoraServ();
    const op={...(p.estadoOperacion||{})},r=registroAbierto(p);
    if(!r||r.tipo!=='PAUSA'||esCambioTemporal(r.motivo))return p;
    const fin=Math.max(r.desde,Math.min(finMs||ahora,ahora));
    op.pausaAcumuladaMs=num(op.pausaAcumuladaMs)+Math.max(0,fin-r.desde);
    op.paradas=cerrarRegistros(op.paradas,fin);
    op.ultimaParada={tipo:'PAUSA_PROGRAMADA',inicio:r.desde,fin,duracionMs:Math.max(0,fin-r.desde),motivo:r.motivo,cierreAutomatico:true};
    op.estado='PAUSA';op.pausaDesde=fin;op.motivoPausa=CAMBIO;op.actualizadoEn=ahora;op.actualizadoPor=quien||op.actualizadoPor||'';
    const historial=[...(Array.isArray(p.historialAlertas)?p.historialAlertas:[])];
    historial.push({id:`${p.clave}|${fin}|cierre_parada`,tipo:'cierre_parada',momento:fin,operador:quien||''});
    historial.push({id:`${p.clave}|${ahora}|cierre_pausa_auto`,tipo:'cierre_pausa_auto',momento:ahora,operador:quien||'',finMs:fin,motivo:r.motivo});
    return {...p,estadoOperacion:op,historialAlertas:historial.slice(-300)};
  }

  /* ---------- permisos ---------- */
  function puedeCerrar(usuario){
    const u=usuario||(typeof state!=='undefined'?state.user:null);
    if(!u)return false;
    if(u.soloVista===true||u.rol==='mantenimiento_compartido')return false;
    if(typeof window!=='undefined'&&global.glacialVista&&typeof global.glacialVista.activo==='function'&&global.glacialVista.activo())return false;   // «Visualizar»: solo lectura
    return CONFIG.rolesCierre.includes(String(u.rol||'').trim());
  }
  const quienSoy=()=>(typeof state!=='undefined'&&state.user&&(state.user.nombre||state.user.username))||'';

  /* ---------- guardar (transacción sobre sync/programaciones, como 24) ---------- */
  function publicar(items,ahora){
    try{if(typeof _programacionesCache!=='undefined')_programacionesCache=items;}catch(_){/* el siguiente onSnapshot lo actualiza */}
    try{if(typeof procesarAlertasOperacion==='function')procesarAlertasOperacion(items);}catch(_){/* no bloquea */}
    try{document.dispatchEvent(new CustomEvent('glacial:pausas'));}catch(_){/* sin DOM */}
    try{if(typeof state!=='undefined'&&state.currentTab==='produccion-actual'&&typeof renderProduccionActualTab==='function')renderProduccionActualTab();}catch(_){/* nada */}
  }
  /* Hora de fin sugerida: la de finalización de la programación si existe; si no, el fin de su turno (nunca antes del inicio ni después de ahora). */
  function finPorDefecto(p,ahora){
    const op=(p&&p.estadoOperacion)||{},r=registroAbierto(p);
    const desde=r?r.desde:num(op.inicio);
    let f=num(op.finalizadaEn)>0?num(op.finalizadaEn):finDeTurno(p.fecha,p.turno,p.linea);
    if(!f||f<desde)f=ahora;
    return Math.max(desde,Math.min(f,ahora));
  }
  async function cerrar(clave,{finMs,nota}){
    if(!puedeCerrar())throw new Error('Solo un Supervisor, el Jefe de Operaciones o un Administrador pueden cerrar pausas.');
    const ref=db.collection('sync').doc('programaciones'),quien=quienSoy();
    const ahora=ahoraServ();
    let resumen=null;
    const guardados=await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      const items=snap.exists&&Array.isArray(snap.data().items)?snap.data().items.slice():[];
      const i=items.findIndex(p=>p&&p.clave===clave);
      if(i<0)throw new Error('La programación ya no existe.');
      const p=items[i],e=p.estadoOperacion&&p.estadoOperacion.estado,r=registroAbierto(p);
      if(!['PAUSA','DETENIDA','LISTA','EN_PRODUCCION'].includes(e))throw new Error('Esta programación ya no está abierta (estado: '+e+'). Actualiza la pantalla.');
      const desde=r?r.desde:num(p.estadoOperacion.inicio);
      const fin=Math.min(ahora,num(finMs)||finPorDefecto(p,ahora));
      if(desde&&fin<desde)throw new Error('La hora de fin no puede ser anterior al inicio ('+fmtFechaHora(desde)+').');
      items[i]=finalizarConHora(p,fin,ahora,quien,nota);
      tx.set(ref,{items,updatedAt:ahora});
      resumen={clave,estadoAnterior:e,finMs:fin,desde,minutos:desde?Math.round((fin-desde)/60000):0};
      return items;
    });
    publicar(guardados,ahora);
    return resumen;
  }
  /* Al finalizar el reporte del turno: pausas REALES abiertas del plan se cierran al fin del turno (o ahora). No bloquea el cierre. */
  async function cerrarAlCerrarTurno({linea,fecha,turno}){
    const ref=db.collection('sync').doc('programaciones'),quien=quienSoy(),ahora=ahoraServ();
    const plan=turno==='INTERMEDIO'?'DÍA':turno;
    const mismo=p=>p&&p.linea===linea&&p.fecha===fecha&&(plan==='DÍA'?['DÍA','INTERMEDIO'].includes(p.turno):p.turno===plan);
    let n=0;
    const guardados=await db.runTransaction(async tx=>{
      n=0;
      const snap=await tx.get(ref);
      const items=snap.exists&&Array.isArray(snap.data().items)?snap.data().items.slice():[];
      items.forEach((p,j)=>{
        if(!mismo(p))return;
        const r=registroAbierto(p);
        if(!r||r.tipo!=='PAUSA'||esCambioTemporal(r.motivo))return;
        items[j]=estacionarProgramacion(p,Math.min(ahora,finDeTurno(p.fecha,p.turno,p.linea)||ahora),quien);n++;
      });
      if(!n)return null;
      tx.set(ref,{items,updatedAt:ahora});
      return items;
    });
    if(guardados)publicar(guardados,ahora);
    return n;
  }

  /* ---------- pantalla: ventana para indicar la hora real de fin ---------- */
  const aLocal=ms=>{const d=new Date(ms);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());};
  function cerrarVentana(){const f=document.getElementById('pausa-cierre-fondo');if(f)f.remove();}
  function abrirCierre(clave){
    if(!puedeCerrar())return;
    const prog=typeof loadProgramaciones==='function'?(loadProgramaciones()||[]):[];
    const p=prog.find(x=>x&&x.clave===clave);if(!p)return;
    const ahora=ahoraServ(),r=registroAbierto(p),desde=r?r.desde:num(p.estadoOperacion.inicio),def=finPorDefecto(p,ahora);
    const que=r?(r.tipo==='PAUSA'?'la pausa':'la parada'):'la producción';
    cerrarVentana();
    const f=document.createElement('div');f.id='pausa-cierre-fondo';
    f.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(10,20,40,.55);display:flex;align-items:center;justify-content:center;padding:16px';
    f.innerHTML=`<div role="dialog" aria-modal="true" style="background:#fff;border-radius:14px;padding:18px 20px;width:min(480px,100%);max-height:90vh;overflow:auto">
      <h3 style="margin:0 0 6px">${r?'Cerrar pausa':'Finalizar presentación'}</h3>
      <p style="margin:0 0 8px;font-size:13px;color:#46627a"><b>${esc(p.linea)}</b> · ${esc(p.fecha)} · ${esc(p.turno)} · ${esc(p.marca)} ${esc(p.presentacion)}<br>${esc(r?r.motivo:'Sigue en producción')} · desde ${esc(fmtFechaHora(desde))}</p>
      <label style="display:block;font-size:13px;margin:8px 0 4px">Hora real en que terminó ${que}</label>
      <input type="datetime-local" id="pausa-cierre-fin" value="${aLocal(def)}" min="${aLocal(desde||def)}" max="${aLocal(ahora)}" style="width:100%;padding:9px;border:1px solid #c9d6e2;border-radius:8px;font:inherit">
      <label style="display:block;font-size:13px;margin:10px 0 4px">Nota (opcional)</label>
      <input type="text" id="pausa-cierre-nota" maxlength="160" placeholder="Ej. el refrigerio duró 40 min" style="width:100%;padding:9px;border:1px solid #c9d6e2;border-radius:8px;font:inherit">
      <p style="font-size:12px;color:#7a5a00;background:#fff7e6;border-radius:8px;padding:8px 10px;margin:10px 0">La presentación quedará <b>FINALIZADA</b> con esa hora y se registrará quién la cerró y cuándo. Los tiempos de ese turno se calcularán con esta hora de fin.</p>
      <div id="pausa-cierre-error" role="alert" style="color:#a92f27;font-size:13px;margin:6px 0" hidden></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="btn btn-ghost" id="pausa-cierre-cancelar">Cancelar</button><button type="button" class="btn btn-primary" id="pausa-cierre-ok">Cerrar</button></div></div>`;
    document.body.appendChild(f);
    f.addEventListener('click',e=>{if(e.target===f)cerrarVentana();});
    f.querySelector('#pausa-cierre-cancelar').onclick=cerrarVentana;
    f.querySelector('#pausa-cierre-ok').onclick=async()=>{
      const err=f.querySelector('#pausa-cierre-error'),btn=f.querySelector('#pausa-cierre-ok');
      const v=f.querySelector('#pausa-cierre-fin').value,ms=v?new Date(v).getTime():0;
      const mostrar=t=>{err.hidden=!t;err.textContent=t||'';};
      mostrar('');
      if(!ms||!Number.isFinite(ms)){mostrar('Indica la hora de fin.');return;}
      if(ms>ahoraServ()+60000){mostrar('La hora de fin no puede estar en el futuro.');return;}
      if(desde&&ms<desde){mostrar('La hora de fin no puede ser anterior al inicio ('+fmtFechaHora(desde)+').');return;}
      btn.disabled=true;
      try{await cerrar(clave,{finMs:ms,nota:f.querySelector('#pausa-cierre-nota').value.trim().slice(0,160)});cerrarVentana();}
      catch(e){mostrar((e&&e.message)||String(e));btn.disabled=false;}
    };
  }

  global.glacialPausas={CONFIG,CAMBIO,fmtDuracion,fmtFechaHora,esCambioTemporal,esRefrigerio,finDeTurno,registroAbierto,analizar,
    finalizarConHora,estacionarProgramacion,puedeCerrar,finPorDefecto,cerrar,cerrarAlCerrarTurno,abrirCierre,cerrarVentana};
})(typeof window!=='undefined'?window:globalThis);
