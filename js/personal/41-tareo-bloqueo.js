/* =============================================================
   GLACIAL · TAREO — BLOQUEO POR PLAZO
   -------------------------------------------------------------
   Un tareo queda BLOQUEADO (solo lectura) cuando pasan N días desde el fin
   de su turno (2 por defecto; en turno Noche el fin es al día siguiente).
   - La hora sale del SERVIDOR de Firebase: al entrar y cada 15 min se
     calibra con serverTimestamp y luego se avanza con un reloj monótono
     del navegador, así cambiar la hora del equipo no adelanta ni atrasa
     el bloqueo. Si aún no se calibró, se usa la hora del equipo (se avisa).
   - Bloqueado: no se puede editar asistencia, horas, salida de maquinistas,
     personal por día ni eliminar. RRHH y Administrador sí pueden, pero
     deben indicar un MOTIVO (sesión de corrección de 30 min) y cada cambio
     queda en auditoriaTareos como EDITAR_TAREO_BLOQUEADO.
   - Antes del bloqueo el tareo muestra cuánto falta y avisa de personas
     en PENDIENTE o sin hora de salida.
   - Un supervisor puede "Solicitar corrección a RRHH" (pide motivo). Las
     solicitudes las ve RRHH en la pestaña "Bloqueos" y las marca atendidas.
   - El estado (Abierto / Bloqueado) NO se guarda en el tareo: se calcula.
     Va en el Excel de RRHH y en Google Sheets.

   Documentos NUEVOS en Firestore:
     sync/configTareo                     (plazo y horas de fin de turno; solo Administrador escribe)
     relojServidor/{uid}                  (solo para leer la hora del servidor)
     solicitudesCorreccionTareo/{id}      (solicitudes de corrección)
   La estructura de los tareos NO cambia.

   Limitación: como el resto de la app, el bloqueo se valida en el navegador
   (todos los tareos viven en un solo documento y las reglas no pueden mirar
   dentro de él). Protege del uso normal y de errores, no de alguien que
   manipule el código del navegador.

   Cargar DESPUÉS de 13-tareo.js, 38 y 40; antes de 12-init.js.
   ============================================================= */
(function instalarBloqueoTareos(){
  'use strict';

  const DOC_CONFIG='configTareo';
  const COL_RELOJ='relojServidor';
  const COL_SOLICITUDES='solicitudesCorreccionTareo';
  const TZ_MS=-5*3600000;                 // Perú: UTC-5, sin horario de verano
  const DEFECTO={dias:2,finDia:'19:00',finNoche:'07:00'};
  const SESION_MS=30*60000;               // duración de una sesión de corrección de RRHH
  const RECALIBRAR_MS=15*60000;

  let cfg=Object.assign({},DEFECTO);
  let solicitudes=[];
  const sesiones=new Map();               // tareoId → {motivo, hasta, usuario}
  const estadoVisto=new Map();            // tareoId → "bloqueado|sesion" (para refrescar al cambiar)
  let iniciado=false,desuscribir=[];

  const esc=t=>typeof escaparHTML==='function'
    ? escaparHTML(t)
    : String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const usuario=()=>(typeof state!=='undefined'&&state.user)||{};
  const esAdmin=()=>String(usuario().rol||'').trim()==='Administrador';
  /* RRHH = permiso moduloRRHH (el Administrador lo tiene) y NO un rol de solo consulta
     (Jefatura/Gerencia tienen moduloRRHH solo para ver). */
  const esRRHH=()=>{
    try{
      return !!usuario().username&&!esUsuarioSoloConsulta(usuario())&&tienePermiso('moduloRRHH');
    }catch(_){return false;}
  };

  /* ---------------------------------------------------------
     RELOJ DEL SERVIDOR
     --------------------------------------------------------- */
  let baseServidor=null,baseMono=0,calibrando=false;
  const mono=()=>(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
  const ahora=()=>baseServidor===null?Date.now():baseServidor+(mono()-baseMono);
  window.tareoAhoraServidor=ahora;
  window.tareoRelojVerificado=()=>baseServidor!==null;

  function idReloj(){
    try{
      const uid=typeof auth!=='undefined'&&auth&&auth.currentUser&&auth.currentUser.uid;
      if(uid)return uid;
      let d=localStorage.getItem('glacial.deviceId');
      if(!d){d='dev_'+Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem('glacial.deviceId',d);}
      return d;
    }catch(_){return 'dev_sin_almacenamiento';}
  }
  const conLimite=(p,ms)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error('tiempo agotado')),ms))]);

  async function calibrar(){
    if(calibrando||typeof db==='undefined'||window.__vistaComo)return;
    calibrando=true;
    try{
      const ref=db.collection(COL_RELOJ).doc(idReloj());
      const m0=mono();
      await conLimite(ref.set({t:firebase.firestore.FieldValue.serverTimestamp()}),8000);
      const m1=mono();
      const snap=await conLimite(ref.get({source:'server'}),8000);
      const t=snap.exists&&snap.data().t;
      const ms=t&&typeof t.toMillis==='function'?t.toMillis():null;
      if(ms){baseServidor=ms;baseMono=(m0+m1)/2;}   // el servidor marcó la hora hacia la mitad del viaje
    }catch(e){
      console.warn('Bloqueo de tareos: no se pudo leer la hora del servidor ('+(e&&e.message||e)+'). Se usa la hora del equipo hasta lograrlo.');
    }finally{calibrando=false;}
  }

  /* ---------------------------------------------------------
     CÁLCULO DEL BLOQUEO
     --------------------------------------------------------- */
  function finTurnoMs(t){
    const m=String(t&&t.fecha||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return null;
    const noche=typeof normalizarTurno==='function'&&normalizarTurno(t.turno)==='Noche';
    const [hh,mm]=String(noche?cfg.finNoche:cfg.finDia).split(':').map(Number);
    return Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])+(noche?1:0),hh||0,mm||0)-TZ_MS;
  }
  function sesionActiva(id){
    const s=sesiones.get(id);
    if(!s)return null;
    if(ahora()>s.hasta){sesiones.delete(id);return null;}
    return s;
  }
  function info(t){
    const fin=finTurnoMs(t);
    const bloqueaEn=fin===null?null:fin+cfg.dias*86400000;
    const n=ahora();
    const bloqueado=bloqueaEn!==null&&n>=bloqueaEn;
    const s=bloqueado&&t&&t.id?sesionActiva(t.id):null;
    return {bloqueado,bloqueaEn,faltaMs:bloqueaEn===null?null:bloqueaEn-n,sesion:s,motivo:s?s.motivo:''};
  }
  window.tareoBloqueoInfo=info;
  window.tareoEstadoBloqueo=t=>info(t).bloqueado?'Bloqueado':'Abierto';
  window.tareoBloqueoConfig=()=>Object.assign({},cfg);

  /* Datos incompletos de un tareo. */
  function incompletos(t){
    let pendientes=0,sinSalida=0;
    (t.personal||[]).forEach(p=>{
      const e=tareoEstadoCanonico(p.asistencia);
      if(!e)pendientes++;
      else if(e==='Asistió'&&!p.horaSalida)sinSalida++;
    });
    (typeof tareoPorDiaActivos==='function'?tareoPorDiaActivos(t):[]).forEach(p=>{
      if(p.horaIngreso&&!p.horaSalida)sinSalida++;
    });
    return {pendientes,sinSalida};
  }

  /* ---------------------------------------------------------
     PERMISOS (validación real: toda edición pasa por estas dos funciones)
     --------------------------------------------------------- */
  const editarOriginal=tareoPuedeEditar;
  tareoPuedeEditar=function(t){
    const base=editarOriginal.apply(this,arguments);
    if(!base||!t||typeof t!=='object'||!t.fecha)return base;
    const i=info(t);
    if(!i.bloqueado)return base;
    return !!(esRRHH()&&i.sesion);
  };
  window.tareoPuedeEditar=tareoPuedeEditar;
  window.tareoPuedeEditarSinBloqueo=editarOriginal;

  const autorizadoOriginal=tareoAutorizadoEscribir;
  tareoAutorizadoEscribir=function(x){
    const base=autorizadoOriginal.apply(this,arguments);
    if(!base||!x||typeof x==='string')return base;      // llamadas por área (rotaciones) no se bloquean
    const i=info(x);
    if(!i.bloqueado)return base;
    return !!(esRRHH()&&i.sesion);
  };
  window.tareoAutorizadoEscribir=tareoAutorizadoEscribir;

  // Excel / PNG / Sheets / WhatsApp siguen disponibles para quien gestiona el tareo aunque esté bloqueado.
  if(typeof tareoPuedeExportar==='function'){
    tareoPuedeExportar=function(t){
      if(typeof state==='undefined'||!state.user)return false;
      if(esUsuarioSoloConsulta(state.user))return false;
      return (t?editarOriginal(t):tareoAreasEditables().length>0)||tienePermiso('moduloRRHH');
    };
    window.tareoPuedeExportar=tareoPuedeExportar;
  }

  /* ---------------------------------------------------------
     VENTANAS (motivo)
     --------------------------------------------------------- */
  function pedirTexto(opc,alAceptar){
    const root=document.getElementById('modal-root');
    if(!root){const v=window.prompt(opc.titulo);if(v&&v.trim().length>=(opc.min||0))alAceptar(v.trim());return;}
    root.innerHTML=
      '<div class="modal-backdrop" onclick="if(event.target===this)closeModal()">'+
      '<div class="modal" style="max-width:480px;width:96%;">'+
        '<div class="modal-head"><h3>'+esc(opc.titulo)+'</h3><button class="modal-close" onclick="closeModal()">✕</button></div>'+
        '<div class="modal-body">'+
          (opc.ayuda?'<p class="small-muted">'+esc(opc.ayuda)+'</p>':'')+
          '<div class="field-sm"><label>'+esc(opc.etiqueta||'Motivo')+'</label>'+
          '<textarea id="bq-texto" rows="3" maxlength="300" style="width:100%;box-sizing:border-box;"></textarea></div>'+
          '<div class="tareo-control-error" id="bq-error" style="min-height:18px;"></div>'+
          '<div class="actions-row"><button class="btn btn-primary" id="bq-ok">'+esc(opc.boton||'Aceptar')+'</button></div>'+
        '</div></div></div>';
    const ta=document.getElementById('bq-texto');
    ta.focus();
    document.getElementById('bq-ok').onclick=()=>{
      const v=ta.value.trim();
      if(v.length<(opc.min||0)){document.getElementById('bq-error').textContent='Escribe al menos '+opc.min+' caracteres.';return;}
      closeModal();
      alAceptar(v);
    };
  }

  /* ---------------------------------------------------------
     AUDITORÍA (reutiliza el registrador de 40-tareo-auditoria.js)
     --------------------------------------------------------- */
  function auditar(t,accion,campo,extra){
    try{
      if(typeof window.tareoAuditoriaEvento!=='function'||typeof window.tareoAuditoriaRegistrar!=='function')return;
      window.tareoAuditoriaRegistrar(window.tareoAuditoriaEvento(t,accion,campo,extra));
    }catch(e){console.warn('Bloqueo de tareos: no se pudo auditar',e&&e.message||e);}
  }
  const tareoPorId=id=>obtenerTareos().find(x=>x.id===id)||null;

  /* ---------------------------------------------------------
     CORRECCIÓN DE RRHH (sesión con motivo)
     --------------------------------------------------------- */
  function iniciarCorreccion(tareoId,despues){
    const t=tareoPorId(tareoId);
    if(!t)return;
    if(!esRRHH()){alert('Solo RRHH o el Administrador pueden corregir un tareo bloqueado.');return;}
    pedirTexto({
      titulo:'Corregir tareo bloqueado',
      ayuda:'Indica por qué se corrige. Quedará registrado en la auditoría junto con cada cambio. La sesión dura 30 minutos.',
      etiqueta:'Motivo de la corrección',boton:'Iniciar corrección',min:8
    },motivo=>{
      sesiones.set(tareoId,{motivo,hasta:ahora()+SESION_MS,usuario:usuario().username||''});
      auditar(t,'INICIAR_CORRECCION_TAREO','tareo',{motivoCorreccion:motivo,bloqueado:true});
      if(typeof despues==='function')despues();
      else if(typeof editarTareo==='function')editarTareo(tareoId);
    });
  }
  function terminarCorreccion(tareoId){
    sesiones.delete(tareoId);
    const t=tareoPorId(tareoId);
    if(t&&typeof renderTareoLectura==='function')renderTareoLectura(t);
  }
  window.tareoIniciarCorreccion=iniciarCorreccion;
  window.tareoTerminarCorreccion=terminarCorreccion;

  /* Mantenimiento edita la salida de un maquinista con su propia transacción:
     también se bloquea (y RRHH debe tener sesión de corrección). */
  ['tareoEditarSalidaMaquinista','tareoGuardarSalidaMaquinista'].forEach(nombre=>{
    const original=window[nombre];
    if(typeof original!=='function')return;
    const envuelta=function(tareoId){
      const t=tareoPorId(tareoId);
      if(t){
        const i=info(t);
        if(i.bloqueado&&!(esRRHH()&&i.sesion)){
          if(esRRHH()&&nombre==='tareoEditarSalidaMaquinista'){
            iniciarCorreccion(tareoId,()=>original.apply(window,arguments));
            return;
          }
          alert('Este tareo está bloqueado. Solo RRHH puede corregirlo (con motivo).');
          return;
        }
      }
      return original.apply(this,arguments);
    };
    window[nombre]=envuelta;
    try{ // los nombres también son funciones globales declaradas
      if(nombre==='tareoEditarSalidaMaquinista')tareoEditarSalidaMaquinista=envuelta;
      else tareoGuardarSalidaMaquinista=envuelta;
    }catch(_){/* ya queda en window */}
  });

  /* Tras corregir un tareo bloqueado, se vuelve a enviar a Google Sheets (actualiza sus filas). */
  const reenvios=new Map();
  function programarReenvio(id){
    clearTimeout(reenvios.get(id));
    reenvios.set(id,setTimeout(()=>{
      reenvios.delete(id);
      const t=tareoPorId(id);
      if(t&&typeof sheetsEnviarTareo==='function')sheetsEnviarTareo(t,{automatico:true});
    },2500));
  }
  if(typeof guardarTareoEnMemoria==='function'){
    const original=guardarTareoEnMemoria;
    guardarTareoEnMemoria=function(t){
      const r=original.apply(this,arguments);
      try{
        if(t&&t.id&&esRRHH()){const i=info(t);if(i.bloqueado&&i.sesion)programarReenvio(t.id);}
      }catch(e){console.warn('Bloqueo de tareos:',e&&e.message||e);}
      return r;
    };
    window.guardarTareoEnMemoria=guardarTareoEnMemoria;
  }

  /* ---------------------------------------------------------
     SOLICITUDES DE CORRECCIÓN
     --------------------------------------------------------- */
  const msDe=v=>v&&typeof v.toMillis==='function'?v.toMillis():(Number(v)||0);
  const pendientesDe=()=>solicitudes.filter(s=>s.estado==='Pendiente');
  const miSolicitudPendiente=id=>pendientesDe().find(s=>s.tareoId===id&&s.uid===idUsuario());
  function idUsuario(){
    try{return (auth&&auth.currentUser&&auth.currentUser.uid)||usuario().username||'';}catch(_){return usuario().username||'';}
  }

  function solicitarCorreccion(tareoId){
    const t=tareoPorId(tareoId);
    if(!t)return;
    if(miSolicitudPendiente(tareoId)){alert('Ya enviaste una solicitud para este tareo; RRHH la verá en su lista.');return;}
    pedirTexto({
      titulo:'Solicitar corrección a RRHH',
      ayuda:'Explica qué hay que corregir en este tareo. RRHH recibirá tu solicitud.',
      etiqueta:'Motivo / qué corregir',boton:'Enviar solicitud',min:8
    },async motivo=>{
      try{
        const u=usuario();
        await db.collection(COL_SOLICITUDES).add({
          tareoId,area:tareoAreaDe(t),fechaTareo:t.fecha||'',turno:t.turno||'',
          motivo,estado:'Pendiente',
          uid:idUsuario(),solicitadoPor:u.username||'',solicitadoPorNombre:u.nombre||u.username||'',
          creadoEn:firebase.firestore.FieldValue.serverTimestamp()
        });
        auditar(t,'SOLICITAR_CORRECCION_TAREO','tareo',{motivoCorreccion:motivo,bloqueado:true});
        alert('Solicitud enviada a RRHH.');
        const actual=tareoPorId(tareoActualId);
        if(actual)pintarBanner(actual);
      }catch(e){
        alert('No se pudo enviar la solicitud: '+(e&&e.message||e));
      }
    });
  }
  function atenderSolicitud(idDoc){
    const s=solicitudes.find(x=>x.id===idDoc);
    if(!s||!esRRHH())return;
    pedirTexto({
      titulo:'Marcar solicitud como atendida',
      ayuda:'Puedes dejar una nota (opcional) sobre lo que se corrigió.',
      etiqueta:'Nota (opcional)',boton:'Marcar atendida',min:0
    },async nota=>{
      try{
        const u=usuario();
        await db.collection(COL_SOLICITUDES).doc(idDoc).update({
          estado:'Atendida',atendidaPor:u.username||'',atendidaPorNombre:u.nombre||u.username||'',
          atendidaEn:firebase.firestore.FieldValue.serverTimestamp(),nota:nota||''
        });
        auditar(tareoPorId(s.tareoId)||{id:s.tareoId,area:s.area,fecha:s.fechaTareo,turno:s.turno},
          'ATENDER_SOLICITUD_CORRECCION','tareo',{motivoCorreccion:s.motivo,estadoNuevo:nota||null});
      }catch(e){alert('No se pudo actualizar la solicitud: '+(e&&e.message||e));}
    });
  }
  window.tareoSolicitarCorreccion=solicitarCorreccion;
  window.tareoAtenderSolicitud=atenderSolicitud;

  /* ---------------------------------------------------------
     BANNER EN EL TAREO
     --------------------------------------------------------- */
  function textoRestante(ms){
    if(ms<=0)return 'menos de 1 min';
    const min=Math.floor(ms/60000),d=Math.floor(min/1440),h=Math.floor((min%1440)/60),m=min%60;
    if(d>0)return d+' d '+h+' h';
    if(h>0)return h+' h'+(m?' '+m+' min':'');
    return m+' min';
  }
  const fechaLima=ms=>new Date(ms).toLocaleString('es-PE',{timeZone:'America/Lima',weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});

  function htmlBanner(t){
    const i=info(t);
    const caja=(clase,html)=>'<div id="tareo-bloqueo-banner" data-bq="'+clase+'" style="margin:0 0 14px;padding:12px 14px;border-radius:10px;font-size:14px;'+
      (clase==='bloqueado'?'background:#fdecec;border:1px solid #f2b8b8;color:#8a1c1c;':
       clase==='correccion'?'background:#fff4dc;border:1px solid #f0c36a;color:#7a4b00;':
       clase==='urgente'?'background:#fff4dc;border:1px solid #f0c36a;color:#7a4b00;':
       'background:#eef5fb;border:1px solid #c9dcec;color:#0b3a5c;')+'">'+html+'</div>';
    const boton=(txt,fn,extra)=>'<button type="button" class="btn btn-sm '+(extra||'btn-ghost')+'" style="margin-left:10px;" onclick="'+fn+'">'+txt+'</button>';
    const q=esc(t.id).replace(/'/g,'');

    if(i.bloqueado&&i.sesion){
      const resta=textoRestante(i.sesion.hasta-ahora());
      return caja('correccion','🔓 <strong>Corrección de RRHH en curso</strong> · motivo: '+esc(i.sesion.motivo)+
        ' · termina en '+resta+boton('Terminar corrección',"tareoTerminarCorreccion('"+q+"')"));
    }
    if(i.bloqueado){
      let accion='';
      if(esRRHH())accion=boton('Corregir (RRHH)',"tareoIniciarCorreccion('"+q+"')",'btn-primary');
      else if(editarOriginal(t)){
        const mia=miSolicitudPendiente(t.id);
        accion=mia?'<span style="margin-left:10px;font-weight:700;">Solicitud enviada · pendiente de RRHH</span>'
                  :boton('Solicitar corrección a RRHH',"tareoSolicitarCorreccion('"+q+"')",'btn-primary');
      }
      return caja('bloqueado','🔒 <strong>Bloqueado · solo RRHH</strong> · el plazo de edición terminó el '+esc(fechaLima(i.bloqueaEn))+accion);
    }
    if(i.bloqueaEn===null)return '';
    const inc=incompletos(t);
    const urgente=i.faltaMs<6*3600000;
    let txt='⏳ <strong>Se bloquea en '+textoRestante(i.faltaMs)+'</strong> ('+esc(fechaLima(i.bloqueaEn))+')';
    const avisos=[];
    if(inc.pendientes)avisos.push(inc.pendientes+' persona'+(inc.pendientes===1?'':'s')+' en PENDIENTE');
    if(inc.sinSalida)avisos.push(inc.sinSalida+' sin hora de salida');
    if(avisos.length)txt+='<br>⚠ Completa antes del bloqueo: '+avisos.join(' · ');
    if(!window.tareoRelojVerificado())txt+='<br><span style="font-size:12px;">Hora del servidor aún sin verificar: se usa la del equipo.</span>';
    return caja(urgente&&avisos.length?'urgente':'abierto',txt);
  }

  function pintarBanner(t){
    try{
      const main=document.getElementById('main');
      if(!main||!t)return;
      main.querySelectorAll('#tareo-bloqueo-banner').forEach(x=>x.remove());
      const html=htmlBanner(t);
      const i=info(t);
      estadoVisto.set(t.id,i.bloqueado+'|'+!!i.sesion);
      if(!html)return;
      const cab=main.querySelector('.main-head');
      if(cab)cab.insertAdjacentHTML('afterend',html);
      else main.insertAdjacentHTML('afterbegin',html);
    }catch(e){console.warn('Bloqueo de tareos: banner',e&&e.message||e);}
  }

  ['renderTareoFormulario','renderTareoLectura'].forEach(nombre=>{
    const original=window[nombre];
    if(typeof original!=='function')return;
    const envuelta=function(t){
      const r=original.apply(this,arguments);
      pintarBanner(t);
      return r;
    };
    window[nombre]=envuelta;
    try{
      if(nombre==='renderTareoFormulario')renderTareoFormulario=envuelta;
      else renderTareoLectura=envuelta;
    }catch(_){/* ya queda en window */}
  });

  // Cada minuto: actualiza la cuenta regresiva y, si el estado cambió, vuelve a dibujar el tareo.
  setInterval(()=>{
    try{
      if(!document.getElementById('tareo-bloqueo-banner'))return;
      const t=tareoPorId(tareoActualId);
      if(!t)return;
      const i=info(t);
      if(estadoVisto.get(t.id)!==i.bloqueado+'|'+!!i.sesion){
        if(tareoPuedeEditar(t))renderTareoFormulario(t);else renderTareoLectura(t);
      }else pintarBanner(t);
    }catch(_){/* no crítico */}
  },60000);

  /* ---------------------------------------------------------
     CONFIGURACIÓN (Administrador)
     --------------------------------------------------------- */
  function configValida(d){
    const hora=h=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(h||''));
    const dias=Number(d&&d.dias);
    return {
      dias:Number.isFinite(dias)&&dias>=0&&dias<=60?Math.round(dias):DEFECTO.dias,
      finDia:hora(d&&d.finDia)?d.finDia:DEFECTO.finDia,
      finNoche:hora(d&&d.finNoche)?d.finNoche:DEFECTO.finNoche
    };
  }
  function abrirConfig(){
    if(!esAdmin()){alert('Solo el Administrador puede configurar el bloqueo.');return;}
    const root=document.getElementById('modal-root');
    if(!root)return;
    root.innerHTML=
      '<div class="modal-backdrop" onclick="if(event.target===this)closeModal()">'+
      '<div class="modal" style="max-width:460px;width:96%;">'+
        '<div class="modal-head"><h3>Bloqueo de tareos</h3><button class="modal-close" onclick="closeModal()">✕</button></div>'+
        '<div class="modal-body">'+
          '<p class="small-muted">Un tareo se bloquea cuando pasan estos días desde el fin de su turno (hora de Perú, del servidor). El turno Noche termina al día siguiente.</p>'+
          '<div class="field-sm"><label>Días hasta el bloqueo</label><input type="number" id="bq-dias" min="0" max="60" value="'+cfg.dias+'"></div>'+
          '<div class="grid grid-2">'+
            '<div class="field-sm"><label>Fin del turno Día</label><input type="time" id="bq-fin-dia" value="'+esc(cfg.finDia)+'"></div>'+
            '<div class="field-sm"><label>Fin del turno Noche (día siguiente)</label><input type="time" id="bq-fin-noche" value="'+esc(cfg.finNoche)+'"></div>'+
          '</div>'+
          '<div class="actions-row"><button class="btn btn-primary" id="bq-guardar">Guardar</button></div>'+
        '</div></div></div>';
    document.getElementById('bq-guardar').onclick=async()=>{
      const nuevo=configValida({dias:document.getElementById('bq-dias').value,
        finDia:document.getElementById('bq-fin-dia').value,finNoche:document.getElementById('bq-fin-noche').value});
      try{
        await db.collection('sync').doc(DOC_CONFIG).set(Object.assign({},nuevo,{
          actualizadoPor:usuario().username||'',actualizadoEn:Date.now(),updatedAt:Date.now()}));
        auditar({id:'(configuración)',area:'',fecha:'',turno:''},'CONFIGURAR_BLOQUEO_TAREOS','plazo',{
          estadoAnterior:{dias:cfg.dias,finDia:cfg.finDia,finNoche:cfg.finNoche},estadoNuevo:nuevo});
        cfg=nuevo;
        closeModal();
        if(document.getElementById('tareo-bloqueos-view'))renderTareoBloqueos();
      }catch(e){alert('No se pudo guardar: '+(e&&e.message||e));}
    };
  }
  window.tareoBloqueoConfigurar=abrirConfig;

  /* ---------------------------------------------------------
     PESTAÑA "BLOQUEOS" (RRHH y Administrador)
     --------------------------------------------------------- */
  function renderTareoBloqueos(){
    const main=document.getElementById('main');
    if(!main)return;
    if(!esRRHH()){alert('Solo RRHH o el Administrador ven esta pantalla.');return;}
    const fmtMs=ms=>ms?new Date(ms).toLocaleString('es-PE',{timeZone:'America/Lima'}):'—';
    const pend=pendientesDe().sort((a,b)=>msDe(b.creadoEn)-msDe(a.creadoEn));
    const atend=solicitudes.filter(s=>s.estado!=='Pendiente').sort((a,b)=>msDe(b.atendidaEn)-msDe(a.atendidaEn)).slice(0,20);
    const filasSol=lista=>lista.map(s=>
      '<tr><td>'+fmtMs(msDe(s.creadoEn))+'</td><td>'+esc(s.solicitadoPorNombre||s.solicitadoPor)+'</td>'+
      '<td>'+esc(s.area)+' · '+(typeof formatearFecha==='function'?formatearFecha(s.fechaTareo):esc(s.fechaTareo))+' · '+esc(s.turno)+'</td>'+
      '<td>'+esc(s.motivo)+'</td>'+
      '<td>'+(s.estado==='Pendiente'
        ?'<span class="tareo-number-warn">Pendiente</span>'
        :'Atendida por '+esc(s.atendidaPorNombre||s.atendidaPor||'')+'<br><span class="small-muted">'+fmtMs(msDe(s.atendidaEn))+(s.nota?' · '+esc(s.nota):'')+'</span>')+'</td>'+
      '<td><div class="tareo-action-buttons">'+
        '<button class="btn btn-sm btn-ghost" onclick="verTareo(\''+esc(s.tareoId).replace(/'/g,'')+'\')">Ver</button>'+
        (s.estado==='Pendiente'
          ?'<button class="btn btn-sm btn-ghost" onclick="tareoIniciarCorreccion(\''+esc(s.tareoId).replace(/'/g,'')+'\')">Corregir</button>'+
           '<button class="btn btn-sm btn-primary" onclick="tareoAtenderSolicitud(\''+esc(s.id).replace(/'/g,'')+'\')">Marcar atendida</button>'
          :'')+
      '</div></td></tr>').join('');
    const tablaSol=lista=>'<div class="tareo-table-scroll"><table class="tareo-table"><thead><tr><th>Solicitada</th><th>Solicita</th><th>Tareo</th><th>Motivo</th><th>Estado</th><th></th></tr></thead><tbody>'+
      (filasSol(lista)||'<tr><td colspan="6" class="small-muted">Sin solicitudes.</td></tr>')+'</tbody></table></div>';

    const bloqueadosIncompletos=obtenerTareos().map(t=>({t,i:info(t),inc:incompletos(t)}))
      .filter(x=>x.i.bloqueado&&(x.inc.pendientes||x.inc.sinSalida))
      .sort((a,b)=>String(b.t.fecha).localeCompare(String(a.t.fecha)));
    const filasInc=bloqueadosIncompletos.map(({t,i,inc})=>
      '<tr><td>'+esc(tareoAreaDe(t))+'</td><td>'+(typeof formatearFecha==='function'?formatearFecha(t.fecha):esc(t.fecha))+'</td><td>'+esc(t.turno)+'</td>'+
      '<td>'+(inc.pendientes?'<span class="tareo-number-warn">'+inc.pendientes+'</span>':'—')+'</td>'+
      '<td>'+(inc.sinSalida?'<span class="tareo-number-warn">'+inc.sinSalida+'</span>':'—')+'</td>'+
      '<td>'+fmtMs(i.bloqueaEn)+'</td>'+
      '<td><div class="tareo-action-buttons"><button class="btn btn-sm btn-ghost" onclick="verTareo(\''+esc(t.id).replace(/'/g,'')+'\')">Ver</button>'+
      '<button class="btn btn-sm btn-primary" onclick="tareoIniciarCorreccion(\''+esc(t.id).replace(/'/g,'')+'\')">Corregir</button></div></td></tr>').join('');

    main.innerHTML=
      '<div class="main-head" id="tareo-bloqueos-view"><div><h2>Bloqueos de tareos</h2>'+
        '<div class="sub">Plazo: '+cfg.dias+' día(s) después del fin del turno · Día termina '+esc(cfg.finDia)+' · Noche termina '+esc(cfg.finNoche)+' (día siguiente)'+
        (window.tareoRelojVerificado()?'':' · <strong>hora del servidor sin verificar</strong>')+'</div></div>'+
        (esAdmin()?'<div class="tareo-head-actions"><button class="btn btn-ghost" onclick="tareoBloqueoConfigurar()">Configurar plazo</button></div>':'')+
      '</div>'+
      (typeof tareoRenderTabs==='function'?tareoRenderTabs('bloqueos'):'')+
      '<div class="panel"><div class="panel-head"><h3>Solicitudes de corrección pendientes</h3><span class="small-muted">'+pend.length+'</span></div><div class="panel-body">'+tablaSol(pend)+'</div></div>'+
      '<div class="panel"><div class="panel-head"><h3>Tareos bloqueados con datos incompletos</h3><span class="small-muted">'+bloqueadosIncompletos.length+'</span></div><div class="panel-body">'+
        '<div class="tareo-table-scroll"><table class="tareo-table"><thead><tr><th>Área</th><th>Fecha</th><th>Turno</th><th>Pendientes</th><th>Sin salida</th><th>Bloqueado desde</th><th></th></tr></thead><tbody>'+
        (filasInc||'<tr><td colspan="7" class="small-muted">No hay tareos bloqueados con datos incompletos.</td></tr>')+'</tbody></table></div></div></div>'+
      '<div class="panel"><div class="panel-head"><h3>Últimas solicitudes atendidas</h3></div><div class="panel-body">'+tablaSol(atend)+'</div></div>';
  }
  window.renderTareoBloqueos=renderTareoBloqueos;

  // Pestaña en la barra del tareo (RRHH y Administrador), con el número de solicitudes pendientes.
  if(typeof tareoRenderTabs==='function'){
    const anterior=tareoRenderTabs;
    tareoRenderTabs=function(activa){
      const html=anterior.apply(this,arguments);
      if(!esRRHH()||html.indexOf('tareo-tab-bloqueos')>=0)return html;
      const n=pendientesDe().length;
      const boton='<button class="tareo-tab tareo-tab-bloqueos '+(activa==='bloqueos'?'active':'')+'" onclick="renderTareoBloqueos()">Bloqueos'+
        (n?' <span class="tareo-number-warn">('+n+')</span>':'')+'</button>';
      const corte=html.indexOf('<button type="button" id="btn-exportar-rrhh"');
      return corte>=0?html.slice(0,corte)+boton+html.slice(corte):html.replace('</div>',boton+'</div>');
    };
    window.tareoRenderTabs=tareoRenderTabs;
  }

  /* ---------------------------------------------------------
     ARRANQUE AL ENTRAR (no se activa para la cuenta compartida de Mantenimiento)
     --------------------------------------------------------- */
  function detener(){
    desuscribir.forEach(f=>{try{f();}catch(_){/* ya cerrada */}});
    desuscribir=[];iniciado=false;solicitudes=[];sesiones.clear();estadoVisto.clear();
  }
  function iniciar(){
    if(iniciado||typeof db==='undefined')return;
    if(typeof esMantCompartido==='function'&&esMantCompartido())return;
    iniciado=true;
    calibrar();
    const refrescar=()=>{
      if(document.getElementById('tareo-bloqueos-view'))renderTareoBloqueos();
      const t=tareoPorId(tareoActualId);
      if(t&&document.getElementById('tareo-bloqueo-banner'))pintarBanner(t);
    };
    desuscribir.push(db.collection('sync').doc(DOC_CONFIG).onSnapshot(s=>{
      cfg=configValida(s.exists?s.data():DEFECTO);
      refrescar();
    },e=>console.warn('Bloqueo de tareos: configuración:',e&&e.message||e)));
    try{
      const consulta=esRRHH()
        ? db.collection(COL_SOLICITUDES)
        : db.collection(COL_SOLICITUDES).where('uid','==',idUsuario());
      desuscribir.push(consulta.onSnapshot(s=>{
        solicitudes=s.docs.map(d=>({...d.data({serverTimestamps:'estimate'}),id:d.id}));
        refrescar();
      },e=>console.warn('Bloqueo de tareos: solicitudes:',e&&e.message||e)));
    }catch(e){console.warn('Bloqueo de tareos:',e&&e.message||e);}
  }
  setInterval(()=>{if(iniciado)calibrar();},RECALIBRAR_MS);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&iniciado)calibrar();});

  if(typeof enterApp==='function'){
    const original=enterApp;
    enterApp=function(){
      const r=original.apply(this,arguments);
      try{if(!window.__vistaComo)iniciar();}catch(e){console.warn('Bloqueo de tareos:',e&&e.message||e);}
      return r;
    };
    window.enterApp=enterApp;
  }
  if(typeof handleLogout==='function'){
    const original=handleLogout;
    handleLogout=function(){
      const r=original.apply(this,arguments);
      if(!state.user)detener();
      return r;
    };
    window.handleLogout=handleLogout;
  }
})();
