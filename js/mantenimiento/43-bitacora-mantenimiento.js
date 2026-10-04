/* =========================================================
   BITÁCORA DE MANTENIMIENTO + TARJETA «PARADAS DE HOY»
   Lee la colección bitacoraMantenimiento (la escribe 24-semaforo-produccion-actual.js al
   DETENER / PAUSAR / INTERVENIR / REANUDAR una línea; COMPLETAR_MOTIVO la agrega quien completa
   un motivo pendiente). La bitácora NUNCA se edita: completar un motivo es un evento nuevo.

   · La ven: Administrador, Jefatura/Gerencia, Supervisor de Producción y quien tenga el permiso
     gestionar_rotacion_mantenimiento (Supervisor de Mantenimiento). La cuenta compartida NO.
     Las reglas de la etapa 2 aplican la misma lista (firestore.rules.etapa2.txt).
   · DÍA OPERATIVO = el del semáforo (turnoVigente): de 07:00 a 07:00 del día siguiente, así el turno
     noche no se parte en dos. Todas las fechas de esta pantalla son días operativos.
   · Carga SOLO el rango elegido (consulta por timestamp, tope de eventos, máximo 31 días). Turno,
     línea, técnico, acción, búsqueda y orden se aplican en el navegador: no gastan lecturas.
   · La tarjeta de Inicio escucha únicamente los eventos del día operativo (solo llegan los nuevos).
   · Vista por parada: agrupa DETENER/PAUSAR → INTERVENIR → REANUDAR de una misma presentación.
   Cargar después de 37b-mantenimiento-identificacion.js. No cambia ningún dato existente.
   ========================================================= */
(function(){
  'use strict';

  const COLECCION='bitacoraMantenimiento';
  const LIMITE_EVENTOS=2000;     // tope de lecturas por consulta
  const MAX_DIAS=31;             // rango máximo por consulta
  const HORA_CORTE=7;            // el día operativo empieza a las 07:00 (igual que el semáforo)
  const ACCIONES=['INICIAR','DETENER','PAUSAR','INTERVENIR','REANUDAR','FINALIZAR','CANCELAR','REABRIR','CORREGIR_INICIO','CORREGIR_FIN','COMPLETAR_MOTIVO'];
  const ACCIONES_PRODUCCION=['INICIAR','FINALIZAR','CANCELAR','REABRIR','CORREGIR_INICIO','CORREGIR_FIN'];   // Lote 4 · Parte A
  const TURNOS=['DÍA','INTERMEDIO','NOCHE'];
  const MIN_DETALLE=5;
  const ROLES_LECTURA=['Jefe de Producción','Jefe de Operaciones','Jefatura','Gerente General','Gerente',
    'Supervisor','Supervisor de Producción'];            // = reglas de la etapa 2
  const umbralRojoMin=()=>{
    const v=typeof PARADA_ALERTA_MIN!=='undefined'?Number(PARADA_ALERTA_MIN):30;   // 01-config.js
    return Number.isFinite(v)&&v>0?v:30;
  };

  /* ---------- permisos ---------- */
  function puedeVerBitacoraMtto(usuario){
    const u=usuario||(typeof state!=='undefined'?state.user:null);
    if(!u||!u.username)return false;
    try{
      if(typeof esMantCompartido==='function'&&esMantCompartido(u))return false;
      const rol=String(u.rol||'').trim();
      if(rol==='Administrador')return true;
      if(ROLES_LECTURA.includes(rol))return true;
      return typeof tienePermiso==='function'&&(tienePermiso('gestionar_rotacion_mantenimiento')||tienePermiso('ver_bitacora_mantenimiento'));
    }catch(_){return false;}
  }
  window.puedeVerBitacoraMtto=puedeVerBitacoraMtto;
  // Completar motivos desde la bitácora: Supervisor de Mantenimiento y Administrador.
  function puedeCompletarMotivo(){
    try{
      if(!puedeVerBitacoraMtto())return false;
      if(String(state.user.rol||'').trim()==='Administrador')return true;
      return tienePermiso('gestionar_rotacion_mantenimiento')||tienePermiso('completar_motivo_parada');
    }catch(_){return false;}
  }

  /* ---------- utilidades ---------- */
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,
    c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ahoraMs=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const parseISO=f=>{const [y,m,d]=String(f).split('-').map(Number);return new Date(y,m-1,d,0,0,0,0);};
  const addDias=(f,n)=>{const d=parseISO(f);d.setDate(d.getDate()+n);return iso(d);};
  const dias=(a,b)=>Math.round((parseISO(b)-parseISO(a))/86400000)+1;
  const fechaOk=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''));
  const inicioOperativo=f=>{const d=parseISO(f);d.setHours(HORA_CORTE,0,0,0);return d;};
  const fmtFecha=f=>fechaOk(f)?f.slice(8,10)+'/'+f.slice(5,7)+'/'+f.slice(0,4):'';
  const fmtHora=ms=>ms?new Date(ms).toLocaleString('es-PE',{hour12:false}):'—';
  const fmtHM=ms=>ms?new Date(ms).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false}):'—';
  const fmtDur=ms=>{
    if(ms==null||!Number.isFinite(ms))return '—';
    const s=Math.round(ms/1000);
    if(s<60)return s+' s';
    const m=Math.floor(s/60),h=Math.floor(m/60);
    return h?h+' h '+String(m%60).padStart(2,'0')+' min':m+' min';
  };
  const minutos=ms=>Math.round((ms||0)/60000);
  const norm=t=>String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();

  /* Día operativo actual: el mismo que usa el semáforo (turnoVigente). */
  function diaOperativoActual(){
    try{
      if(typeof window.glacialTurnoVigente==='function'){
        const t=window.glacialTurnoVigente();
        if(t&&fechaOk(t.fecha))return t.fecha;
      }
    }catch(_){/* se usa el cálculo propio */}
    const d=new Date(ahoraMs());
    if(d.getHours()<HORA_CORTE)d.setDate(d.getDate()-1);
    return iso(d);
  }
  function turnoActualNombre(){
    try{
      if(typeof window.glacialTurnoVigente==='function'){const t=window.glacialTurnoVigente();return t&&t.turno||'';}
    }catch(_){/* sin turno */}
    return '';
  }

  /* ---------- motivo pendiente ---------- */
  // Pendiente = sin motivo, «Otro» a secas o «Otro — …» con menos de 5 caracteres de detalle
  // (misma regla que 24-semaforo-produccion-actual.js).
  function esPendiente(m){
    const t=norm(m);
    if(!t||t==='otro'||t==='sin motivo registrado')return true;
    const r=t.match(/^otro\s*[—–-]\s*(.*)$/);
    return !!r&&r[1].trim().length<MIN_DETALLE;
  }

  const fmtN=n=>Math.round(Number(n)||0).toLocaleString('es-PE');
  const horaCorta=ms=>Number(ms)>0?new Date(Number(ms)).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false}):'—';

  /* ORIGEN: quién actuó, PRODUCCION o MANTENIMIENTO. Los eventos nuevos lo traen; los antiguos se infieren. */
  function origenDe(e){
    if(e.origen==='PRODUCCION'||e.origen==='MANTENIMIENTO')return e.origen;
    const rol=String(e.rol||'');
    if(rol==='mantenimiento_compartido'||rol==='Mantenimiento'||String(e.identificadoPor||'').startsWith('PIN'))return 'MANTENIMIENTO';
    if(ACCIONES_PRODUCCION.includes(e.accion))return 'PRODUCCION';
    return rol?'PRODUCCION':'';
  }
  const etiquetaOrigen=o=>o==='PRODUCCION'?'Producción':o==='MANTENIMIENTO'?'Mantenimiento':'—';

  /* Texto de «qué pasó» según el tipo de evento (motivo, valores anterior/nuevo, producido…). */
  function detalleEvento(e){
    const corr=e.motivoCorreccion?' · Motivo de la corrección: '+e.motivoCorreccion:'';
    switch(e.accion){
      case 'COMPLETAR_MOTIVO': return e.motivoDetalle||'';
      case 'INICIAR': return 'Inicio '+horaCorta(e.inicioMs)+(e.inicioHoraManual?' (hora indicada '+e.inicioHoraManual+')':'');
      case 'FINALIZAR': return 'Cierre '+horaCorta(e.cierreMs)+' · producido '+fmtN(e.producido)+' de '+fmtN(e.programado);
      case 'CANCELAR': return e.motivo?'Motivo: '+e.motivo:'Sin motivo indicado';
      case 'REABRIR': return 'Reabierta (cierre anterior a las '+horaCorta(e.finalizadaEnAnterior)+')';
      case 'CORREGIR_INICIO': return 'Inicio '+horaCorta(e.valorAnterior)+' → '+horaCorta(e.valorNuevo)+corr;
      case 'CORREGIR_FIN':{
        const a=e.valorAnterior||{},n=e.valorNuevo||{};
        return 'Cierre '+horaCorta(a.cierre)+' → '+horaCorta(n.cierre)+' · producción '+fmtN(a.produccionFinal)+' → '+fmtN(n.produccionFinal)+
          ' · paradas '+(a.paradas==null?'—':a.paradas)+' → '+(n.paradas==null?'—':n.paradas)+corr;
      }
      default: return e.motivo||'';
    }
  }

  /* ---------- agrupar eventos en paradas ---------- */
  const claveEvento=e=>(e.linea||'')+'|'+(e.claveProgramacion||e.marca||'');
  function armarParadas(eventos){
    const porClave=new Map(),completados=[];
    eventos.forEach(e=>{
      if(e.accion==='COMPLETAR_MOTIVO'){completados.push(e);return;}
      const k=claveEvento(e);
      if(!porClave.has(k))porClave.set(k,[]);
      porClave.get(k).push(e);
    });
    const paradas=[];
    const ahora=ahoraMs();
    porClave.forEach(lista=>{
      lista.sort((a,b)=>a.ts-b.ts);
      let abierta=null;
      const nueva=(tipo,e,incompleta)=>{
        const p={tipo,pasos:[e],linea:e.linea||'',turno:e.turno||'',marca:e.marca||'',presentacion:e.presentacion||'',
          fechaPlan:e.fechaPlan||'',inicio:e.ts,fin:null,duracionMs:null,cerrada:false,sinInicio:!!incompleta,motivo:'',
          paradaId:e.paradaId||null,claveProgramacion:e.claveProgramacion||''};
        paradas.push(p);return p;
      };
      lista.forEach(e=>{
        if(e.accion==='DETENER'||e.accion==='PAUSAR'){
          abierta=nueva(e.accion==='PAUSAR'?'PAUSA':'DETENCION',e,false);
          abierta.motivo=e.motivo||'';
        }else if(e.accion==='INTERVENIR'){
          if(!abierta){abierta=nueva('DETENCION',e,true);}else abierta.pasos.push(e);
        }else if(e.accion==='REANUDAR'){
          if(!abierta){
            abierta=nueva(norm(e.estadoAnterior)==='pausa'?'PAUSA':'DETENCION',e,true);
            abierta.motivo=e.motivo||'';
          }else abierta.pasos.push(e);
          abierta.fin=e.ts;abierta.cerrada=true;
          abierta.duracionMs=Number.isFinite(Number(e.duracionMs))&&e.duracionMs!=null?Number(e.duracionMs)
            :(abierta.sinInicio?null:Math.max(0,e.ts-abierta.inicio));
          if(!abierta.motivo)abierta.motivo=e.motivo||'';
          abierta=null;
        }
      });
    });
    // COMPLETAR_MOTIVO: evento posterior enlazado a la parada (por paradaId o por el id del evento inicial).
    completados.sort((a,b)=>a.ts-b.ts).forEach(c=>{
      const p=paradas.find(x=>(c.paradaId&&x.paradaId===c.paradaId)||(c.paradaEventoId&&x.pasos[0].id===c.paradaEventoId));
      if(p)p.completado={texto:c.motivoDetalle||'',por:c.tecnicoNombre||c.cuenta||'',ts:c.ts,cuenta:c.cuenta||'',evento:c};
    });
    paradas.forEach(p=>{
      if(!p.cerrada&&!p.sinInicio)p.duracionEnCursoMs=Math.max(0,ahora-p.inicio);
      p.duracionTotalMs=p.cerrada?p.duracionMs:(p.duracionEnCursoMs??null);
      p.pendiente=!p.completado&&esPendiente(p.motivo);
      p.motivoTexto=p.completado&&p.completado.texto
        ?((norm(p.motivo)==='otro'||!p.motivo?'Otro':p.motivo)+' — '+p.completado.texto):p.motivo;
      p.iniciador=p.pasos[0].tecnicoNombre||p.pasos[0].cuenta||'—';
    });
    return paradas.sort((a,b)=>b.inicio-a.inicio);
  }

  /* ---------- estado de la pantalla ---------- */
  const F={rango:'hoy',desde:'',hasta:'',turno:'',linea:'',tecnico:'',accion:'',origen:'',q:'',pend:false,orden:'recientes',vista:'paradas'};
  const carga={clave:'',eventos:[],truncado:false,cargando:false,error:'',token:0,cargadoEn:0,usuario:''};

  function aplicarRango(r){
    const hoy=diaOperativoActual();
    F.rango=r;
    if(r==='hoy'){F.desde=F.hasta=hoy;}
    else if(r==='ayer'){F.desde=F.hasta=addDias(hoy,-1);}
    else if(r==='semana'){const d=parseISO(hoy);F.desde=addDias(hoy,-((d.getDay()+6)%7));F.hasta=hoy;}
    else if(r==='mes'){F.desde=hoy.slice(0,8)+'01';F.hasta=hoy;}
    else{F.rango='personalizado';if(!fechaOk(F.desde)||!fechaOk(F.hasta)){F.desde=F.hasta=hoy;}}
  }

  function msDe(v){
    if(!v)return 0;
    if(typeof v.toMillis==='function')return v.toMillis();
    if(typeof v.seconds==='number')return v.seconds*1000+Math.floor((v.nanoseconds||0)/1e6);
    return Number(v)||0;
  }
  const docAEvento=d=>{
    const x=d.data({serverTimestamps:'estimate'});
    return Object.assign({},x,{id:d.id,ts:msDe(x.timestamp)});
  };
  const consultaRango=(ini,fin)=>{
    const T=firebase.firestore.Timestamp;
    return db.collection(COLECCION)
      .where('timestamp','>=',T.fromDate(ini))
      .where('timestamp','<',T.fromDate(fin))
      .orderBy('timestamp','asc')
      .limit(LIMITE_EVENTOS);
  };

  /* ---------- carga por rango en VIVO (nunca la colección completa) ----------
     Escucha solo el rango elegido (máx. 31 días, tope de eventos): primero llegan los del rango y después
     solo los nuevos. Se cierra al cambiar de rango y al salir de la pantalla. */
  let desubBitacora=null;
  function detenerBitacora(){
    if(desubBitacora){try{desubBitacora();}catch(_){/* ya cerrada */}}
    desubBitacora=null;
  }
  async function cargarRango(forzar){
    if(typeof db==='undefined')return;
    const rechazar=msg=>{carga.error=msg;carga.cargando=false;renderBitacoraMtto();};
    if(!fechaOk(F.desde)||!fechaOk(F.hasta))return rechazar('Elige fechas válidas.');
    if(F.hasta<F.desde)return rechazar('La fecha final no puede ser anterior a la inicial.');
    if(dias(F.desde,F.hasta)>MAX_DIAS)
      return rechazar('El rango pedido es de '+dias(F.desde,F.hasta)+' días y el máximo es '+MAX_DIAS+' días por consulta (para no gastar lecturas). Acota las fechas.');
    const clave=F.desde+'|'+F.hasta;
    if(!forzar&&clave===carga.clave&&!carga.error&&desubBitacora)return;       // ya se está escuchando este rango
    const token=++carga.token;
    detenerBitacora();
    carga.cargando=true;carga.error='';
    renderBitacoraMtto();
    try{
      const ini=inicioOperativo(F.desde);
      const fin=inicioOperativo(addDias(F.hasta,1));
      desubBitacora=consultaRango(ini,fin).onSnapshot(snap=>{
        if(token!==carga.token)return;          // llegó una escucha más nueva
        carga.eventos=snap.docs.map(docAEvento);
        carga.truncado=snap.size>=LIMITE_EVENTOS;
        carga.clave=clave;carga.cargadoEn=ahoraMs();carga.cargando=false;carga.error='';
        if(state.currentTab==='bitacora-mtto')renderBitacoraMtto();      // si ya salió de la pantalla, no se redibuja
      },e=>{
        if(token!==carga.token)return;
        carga.error='No se pudo cargar la bitácora: '+((e&&e.message)||e);
        carga.eventos=[];carga.clave='';carga.cargando=false;
        if(state.currentTab==='bitacora-mtto')renderBitacoraMtto();
      });
    }catch(e){
      carga.error='No se pudo cargar la bitácora: '+((e&&e.message)||e);
      carga.eventos=[];carga.clave='';carga.cargando=false;
      renderBitacoraMtto();
    }
  }

  /* ---------- filtros (en el navegador) ---------- */
  const textoEvento=e=>norm([e.tecnicoNombre,e.cuenta,e.linea,e.motivo,e.motivoDetalle,e.motivoCorreccion,e.marca,e.presentacion,e.accion].join(' '));
  const textoParada=p=>norm([p.linea,p.marca,p.presentacion,p.motivoTexto,p.completado&&p.completado.por].concat(
    p.pasos.map(e=>[e.tecnicoNombre,e.cuenta,e.motivoDetalle].join(' '))).join(' '));
  function eventoCumple(e,idsPend){
    if(F.turno&&e.turno!==F.turno)return false;
    if(F.linea&&e.linea!==F.linea)return false;
    if(F.tecnico&&(e.tecnicoNombre||e.cuenta||'')!==F.tecnico)return false;
    if(F.accion&&e.accion!==F.accion)return false;
    if(F.origen&&origenDe(e)!==F.origen)return false;
    if(F.q&&!textoEvento(e).includes(norm(F.q)))return false;
    if(F.pend&&!idsPend.has(e.id))return false;
    return true;
  }
  function paradaCumple(p){
    if(F.turno&&p.turno!==F.turno)return false;
    if(F.linea&&p.linea!==F.linea)return false;
    if(F.tecnico&&!p.pasos.some(e=>(e.tecnicoNombre||e.cuenta||'')===F.tecnico))return false;
    if(F.accion&&!p.pasos.some(e=>e.accion===F.accion)&&!(F.accion==='COMPLETAR_MOTIVO'&&p.completado))return false;
    if(F.origen&&!p.pasos.some(e=>origenDe(e)===F.origen))return false;
    if(F.q&&!textoParada(p).includes(norm(F.q)))return false;
    if(F.pend&&!p.pendiente)return false;
    return true;
  }
  const porDuracion=(a,b)=>(b==null?-1:b)-(a==null?-1:a);
  const duracionEvento=e=>e.duracionMs!=null&&Number.isFinite(Number(e.duracionMs))?Number(e.duracionMs):null;
  const datosFiltrados=()=>{
    const todas=armarParadas(carga.eventos);
    const paradas=todas.filter(paradaCumple);
    const idsPend=new Set();
    todas.filter(p=>p.pendiente).forEach(p=>p.pasos.forEach(e=>idsPend.add(e.id)));
    const eventos=carga.eventos.filter(e=>eventoCumple(e,idsPend));
    if(F.orden==='duracion'){
      paradas.sort((a,b)=>porDuracion(a.duracionTotalMs,b.duracionTotalMs)||b.inicio-a.inicio);
      eventos.sort((a,b)=>porDuracion(duracionEvento(a),duracionEvento(b))||b.ts-a.ts);
    }else{
      paradas.sort((a,b)=>b.inicio-a.inicio);
      eventos.sort((a,b)=>b.ts-a.ts);
    }
    return {paradas,eventos,todas};
  };

  /* ---------- resumen ---------- */
  function resumir(paradas){
    const porLinea=new Map(),porTecnico=new Map();
    const sumar=(m,k,p)=>{
      const r=m.get(k)||{paradas:0,ms:0,pendientes:0,enCurso:0};
      r.paradas++;r.ms+=p.duracionTotalMs||0;if(p.pendiente)r.pendientes++;if(!p.cerrada&&!p.sinInicio)r.enCurso++;
      m.set(k,r);
    };
    paradas.forEach(p=>{sumar(porLinea,p.linea||'—',p);sumar(porTecnico,p.iniciador,p);});
    const tot={paradas:paradas.length,ms:paradas.reduce((s,p)=>s+(p.duracionTotalMs||0),0),
      msProg:paradas.filter(p=>p.tipo==='PAUSA').reduce((s,p)=>s+(p.duracionTotalMs||0),0),
      msNoProg:paradas.filter(p=>p.tipo!=='PAUSA').reduce((s,p)=>s+(p.duracionTotalMs||0),0),
      pendientes:paradas.filter(p=>p.pendiente).length,enCurso:paradas.filter(p=>!p.cerrada&&!p.sinInicio).length};
    const ord=m=>[...m.entries()].map(([k,v])=>Object.assign({k},v)).sort((a,b)=>b.ms-a.ms||b.paradas-a.paradas);
    return {porLinea:ord(porLinea),porTecnico:ord(porTecnico),tot};
  }

  const chip=ts=>window.glacialEstadoDatos?window.glacialEstadoDatos.chip(ts!=null?{ts}:undefined):'';

  /* ---------- estilos ---------- */
  function estilos(){
    if(document.getElementById('bitmtto-css'))return;
    const s=document.createElement('style');s.id='bitmtto-css';
    s.textContent=`
      .bm-resumen{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}
      .bm-kpi{border:1px solid #dfe4ea;border-radius:10px;padding:10px 12px;background:#fff}
      .bm-kpi span{display:block;font-size:12px;color:#5a6b7b}.bm-kpi b{font-size:22px;color:#1b2a38}.bm-kpi small{display:block;color:#5a6b7b;font-size:11px}
      .bm-kpi.warn{border-color:#f0c36a;background:#fff8e6}
      .bm-dos{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:12px}
      .bm-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:12px}
      .bm-card{border:1px solid #dfe4ea;border-left:5px solid #2f7fd0;border-radius:10px;padding:10px 12px;background:#fff}
      .bm-card.pausa{border-left-color:#13814a}.bm-card.pend{border-color:#e0a43a;border-left-color:#e0a43a;background:#fff8e6}
      .bm-card.curso{box-shadow:0 0 0 2px rgba(169,47,39,.25)}
      .bm-card h4{margin:0 0 4px;font-size:15px}.bm-card .meta{font-size:12px;color:#5a6b7b;margin-bottom:6px}
      .bm-chip{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:700;background:#e8eef5;color:#1b2a38;margin-right:4px}
      .bm-chip.warn{background:#f6d58b;color:#6b4300}.bm-chip.bad{background:#f4c7c3;color:#8a1f17}.bm-chip.ok{background:#cdeedd;color:#0c5c34}
      .bm-hist{margin:6px 0 0;padding:0;list-style:none;border-left:3px solid #c5d0db}.bm-hist li{padding:6px 0 6px 12px;border-bottom:1px dashed #e3e8ee;font-size:13px}
      .bm-hist time{font-weight:800;color:#10265f;margin-right:6px}
      .bm-pasos{margin:6px 0 0;padding:0;list-style:none;font-size:12.5px}.bm-pasos li{padding:2px 0;border-top:1px dashed #e3e8ee}
      .bm-aviso{padding:8px 12px;border-radius:8px;background:#fff8e6;border:1px solid #f0c36a;margin-bottom:10px;font-size:13px}
      .bm-error{padding:8px 12px;border-radius:8px;background:#fdecea;border:1px solid #f1b0aa;color:#8a1f17;margin-bottom:10px;font-size:13px}
      .bm-vacio{padding:14px;border:1px dashed #c5d0db;border-radius:10px;color:#4a5b6b;font-size:13px;background:#f8fafc;margin-bottom:10px}
      .bm-rangos{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
      .bm-rangos button{border:1px solid #c5d0db;background:#fff;border-radius:999px;padding:4px 12px;font-size:12px;cursor:pointer}
      .bm-rangos button.active{background:#10265f;color:#fff;border-color:#10265f}
      .pp-card{border:1px solid #dfe4ea;border-left:8px solid #13814a;border-radius:12px;background:#fff;padding:12px 16px;margin-bottom:12px;cursor:pointer;box-shadow:0 3px 12px rgba(17,57,91,.055)}
      .pp-card.ambar{border-left-color:#df8b00;background:#fffbea}.pp-card.rojo{border-left-color:#d93a3a;background:#fff5f5}
      .pp-top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
      .pp-top h3{margin:0;font-size:14px;letter-spacing:.04em;color:#10265f}
      .pp-estado{font-weight:800;font-size:12px;color:#13814a}.pp-card.rojo .pp-estado{color:#a92f27}.pp-card.ambar .pp-estado{color:#8a5a00}
      .pp-abiertas{margin:8px 0;display:grid;gap:4px}
      .pp-abierta{display:flex;justify-content:space-between;gap:10px;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,.7);border:1px solid #e3e8ee;font-size:13px}
      .pp-abierta.larga{background:#fde2e0;border-color:#f1b0aa;color:#8a1f17;font-weight:700}
      .pp-datos{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:12.5px;color:#31475c}
      .pp-datos b{color:#10265f}.pp-datos [data-pp-pend]{cursor:pointer;text-decoration:underline dotted}
      .pp-datos .pp-pend-alerta{color:#8a5a00;font-weight:800}
      .pp-ayuda{font-size:11.5px;color:#5a6b7b;margin-top:6px}
      .pp-vacio{font-size:13px;color:#4a5b6b;padding:4px 0}
      #bm-aviso-cierre{position:fixed;right:16px;bottom:16px;z-index:10050;max-width:360px;background:#fff8e6;border:1px solid #f0c36a;border-left:6px solid #df8b00;border-radius:10px;padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.2);font-size:13px}
      #bm-aviso-cierre ul{margin:6px 0 8px;padding-left:18px}
    `;
    document.head.appendChild(s);
  }

  function opciones(lista,sel,todos){
    return '<option value="">'+todos+'</option>'+lista.map(v=>'<option value="'+esc(v)+'"'+(v===sel?' selected':'')+'>'+esc(v)+'</option>').join('');
  }

  function tablaResumen(titulo,filas,colNombre){
    return '<div class="panel" style="margin:0"><div class="panel-head"><h3>'+esc(titulo)+'</h3></div><div class="panel-body">'+
      (filas.length?'<div class="tareo-table-scroll"><table class="tareo-table"><thead><tr><th>'+esc(colNombre)+'</th><th>Paradas</th><th>Minutos</th><th>Motivo pendiente</th></tr></thead><tbody>'+
        filas.map(r=>'<tr><td>'+esc(r.k)+'</td><td>'+r.paradas+(r.enCurso?' <span class="small-muted">('+r.enCurso+' en curso)</span>':'')+'</td><td>'+minutos(r.ms)+'</td><td>'+(r.pendientes||'—')+'</td></tr>').join('')+
        '</tbody></table></div>':'<p class="small-muted">Sin paradas en el filtro.</p>')+'</div></div>';
  }

  function cuentaTxt(e){
    return esc(e.cuenta||'—')+(String(e.identificadoPor||'').startsWith('PIN')?' <span class="bm-chip">PIN</span>':'');
  }

  function tarjetaParada(p){
    const clase=['bm-card',p.tipo==='PAUSA'?'pausa':'',p.pendiente?'pend':'',(!p.cerrada&&!p.sinInicio)?'curso':''].join(' ');
    const dur=p.cerrada?fmtDur(p.duracionTotalMs):(p.sinInicio?'—':fmtDur(p.duracionTotalMs)+' (en curso)');
    return '<div class="'+clase+'">'+
      '<h4>'+esc(p.linea||'—')+' · '+esc(p.marca||'')+' '+esc(p.presentacion||'')+'</h4>'+
      '<div class="meta">'+esc(p.fechaPlan||'')+' · '+esc(p.turno||'')+'</div>'+
      '<div><span class="bm-chip '+(p.tipo==='PAUSA'?'ok':'bad')+'">'+(p.tipo==='PAUSA'?'PAUSA PROGRAMADA':'DETENCIÓN')+'</span>'+
      (p.pendiente?'<span class="bm-chip warn">MOTIVO PENDIENTE</span>':'')+
      (p.completado?'<span class="bm-chip ok">MOTIVO COMPLETADO</span>':'')+
      (!p.cerrada&&!p.sinInicio?'<span class="bm-chip bad">EN CURSO</span>':'')+
      (p.sinInicio?'<span class="bm-chip">INICIO FUERA DEL RANGO</span>':'')+'</div>'+
      '<div style="margin-top:6px"><b>Motivo:</b> '+(esc(p.motivoTexto)||'<i>sin motivo</i>')+'</div>'+
      (p.completado?'<div class="small-muted">Completado por '+esc(p.completado.por)+' · '+esc(fmtHora(p.completado.ts))+'</div>':'')+
      '<div><b>Duración total:</b> '+esc(dur)+'</div>'+
      '<ul class="bm-pasos">'+p.pasos.map(e=>'<li><b>'+esc(e.accion)+'</b> · '+esc(fmtHora(e.ts))+' · '+esc(e.tecnicoNombre||'—')+
        ' <span class="small-muted">(cuenta '+cuentaTxt(e)+')</span></li>').join('')+'</ul>'+
      (p.pendiente&&puedeCompletarMotivo()?'<div style="margin-top:8px"><button type="button" class="btn btn-primary btn-sm" data-bm-completar="'+esc(p.pasos[0].id)+'">Completar motivo</button></div>':'')+
      '</div>';
  }

  function htmlTablaEventos(eventos){
    return '<div class="tareo-table-scroll"><table class="tareo-table"><thead><tr><th>Hora (servidor)</th><th>Usuario / técnico</th><th>Origen</th><th>Acción</th><th>Línea</th><th>Marca y presentación</th><th>Motivo / detalle</th><th>Duración</th><th>Cuenta</th></tr></thead><tbody>'+
      (eventos.length?eventos.map(e=>'<tr><td>'+esc(fmtHora(e.ts))+'</td><td>'+esc(e.tecnicoNombre||'—')+'<br><small class="small-muted">'+esc(e.rol||'')+'</small></td><td>'+esc(etiquetaOrigen(origenDe(e)))+'</td><td>'+esc(e.accion)+'</td><td>'+esc(e.linea||'')+'</td><td>'+esc((e.marca||'')+' '+(e.presentacion||''))+'</td><td>'+esc(detalleEvento(e))+'</td><td>'+(duracionEvento(e)!=null?esc(fmtDur(duracionEvento(e))):'—')+'</td><td>'+cuentaTxt(e)+'</td></tr>').join('')
        :'<tr><td colspan="9" class="small-muted">'+(carga.eventos.length?'Sin eventos con estos filtros.':'Sin eventos en este rango.')+'</td></tr>')+
      '</tbody></table></div>';
  }

  /* HISTORIA DE LA LÍNEA: todo lo ocurrido en una línea, en orden, por día y turno. */
  function htmlHistoria(){
    if(!F.linea)return '<div class="bm-vacio"><b>Elige una línea</b> en el filtro «Línea» (y, si quieres, un turno) para ver su historia en orden: inicio, paradas, intervenciones, reanudaciones y cierre.</div>';
    const evs=carga.eventos.filter(e=>e.linea===F.linea&&(!F.turno||e.turno===F.turno)).sort((a,b)=>a.ts-b.ts);
    if(!evs.length)return '<div class="bm-vacio"><b>Sin eventos de esta línea en el rango'+(F.turno?' y turno':'')+'.</b></div>';
    const grupos=new Map();
    evs.forEach(e=>{const k=(e.fechaPlan||'')+'|'+(e.turno||'');if(!grupos.has(k))grupos.set(k,[]);grupos.get(k).push(e);});
    return [...grupos.entries()].map(([k,lista])=>{
      const [fecha,turno]=k.split('|');
      return '<div class="bm-card" style="margin-bottom:12px"><h4>'+esc(F.linea)+' · '+esc(fmtFecha(fecha))+' · '+esc(turno||'')+'</h4>'+
        '<ol class="bm-hist">'+lista.map(e=>'<li><time>'+esc(horaCorta(e.ts))+'</time> <b>'+esc(e.accion)+'</b> '+
          '<span class="bm-chip">'+esc(etiquetaOrigen(origenDe(e)))+'</span> '+esc((e.marca||'')+' '+(e.presentacion||''))+
          '<div class="small-muted">'+esc(e.tecnicoNombre||'—')+(e.rol?' · '+esc(e.rol):'')+' · cuenta '+esc(e.cuenta||'—')+'</div>'+
          (detalleEvento(e)?'<div>'+esc(detalleEvento(e))+'</div>':'')+'</li>').join('')+'</ol></div>';
    }).join('');
  }

  function textoFiltros(){
    return 'Rango (días operativos 07:00–07:00): '+F.desde+' a '+F.hasta+' · Turno: '+(F.turno||'todos')+' · Línea: '+(F.linea||'todas')+
      ' · Técnico: '+(F.tecnico||'todos')+' · Acción: '+(F.accion||'todas')+' · Origen: '+(F.origen?etiquetaOrigen(F.origen):'todos')+' · Búsqueda: '+(F.q?'«'+F.q+'»':'—')+
      ' · Solo motivo pendiente: '+(F.pend?'sí':'no')+' · Orden: '+(F.orden==='duracion'?'mayor duración':'más recientes');
  }

  function renderBitacoraMtto(){
    const main=document.getElementById('main');
    if(!main)return;
    if(!puedeVerBitacoraMtto()){main.innerHTML='<div class="empty-state"><h4>Acceso no autorizado</h4></div>';return;}
    estilos();
    if(!fechaOk(F.desde)||!fechaOk(F.hasta))aplicarRango(F.rango==='personalizado'?'personalizado':'hoy');
    const foco=document.activeElement&&document.activeElement.id==='bm-buscar'?document.activeElement:null;
    const posicion=foco&&typeof foco.selectionStart==='number'?foco.selectionStart:null;
    const {paradas,eventos}=datosFiltrados();
    const R=resumir(paradas);
    const lineas=[...new Set(carga.eventos.map(e=>e.linea).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    const tecnicos=[...new Set(carga.eventos.map(e=>e.tecnicoNombre||e.cuenta).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    const hoy=diaOperativoActual();
    const rb=(clave,texto)=>'<button type="button" data-bm-rango="'+clave+'" class="'+(F.rango===clave?'active':'')+'">'+texto+'</button>';
    const sinDatos=!carga.cargando&&!carga.error&&!carga.eventos.length;
    main.innerHTML=
      '<div class="main-head" id="bitmtto-view"><div><h2>'+(F.origen==='PRODUCCION'?'Bitácora de producción':'Bitácora de Mantenimiento')+'</h2>'+
      '<div class="sub">Solo lectura · día operativo de 07:00 a 07:00 · hora del servidor '+
      (carga.cargadoEn?chip():'<span class="small-muted">sin consultar</span>')+'</div></div></div>'+
      '<div class="panel"><div class="panel-body">'+
      '<div class="bm-rangos">'+rb('hoy','Hoy')+rb('ayer','Ayer')+rb('semana','Esta semana')+rb('mes','Este mes')+rb('personalizado','Personalizado')+'</div>'+
      '<div class="tar2-toolbar" style="margin-bottom:10px;gap:10px;flex-wrap:wrap">'+
        '<div class="field-sm"><label>Desde</label><input type="date" id="bm-desde" value="'+esc(F.desde)+'" max="'+esc(hoy)+'"></div>'+
        '<div class="field-sm"><label>Hasta</label><input type="date" id="bm-hasta" value="'+esc(F.hasta)+'" max="'+esc(hoy)+'"></div>'+
        '<div class="field-sm"><label>Turno</label><select id="bm-turno">'+opciones(TURNOS,F.turno,'Todos')+'</select></div>'+
        '<div class="field-sm"><label>Línea</label><select id="bm-linea">'+opciones(lineas,F.linea,'Todas')+'</select></div>'+
        '<div class="field-sm"><label>Técnico</label><select id="bm-tecnico">'+opciones(tecnicos,F.tecnico,'Todos')+'</select></div>'+
        '<div class="field-sm"><label>Acción</label><select id="bm-accion">'+opciones(ACCIONES,F.accion,'Todas')+'</select></div>'+
        '<div class="field-sm"><label>Origen</label><select id="bm-origen"><option value="">Todos</option><option value="PRODUCCION"'+(F.origen==='PRODUCCION'?' selected':'')+'>Producción</option><option value="MANTENIMIENTO"'+(F.origen==='MANTENIMIENTO'?' selected':'')+'>Mantenimiento</option></select></div>'+
        '<div class="field-sm"><label>Ordenar</label><select id="bm-orden"><option value="recientes"'+(F.orden==='recientes'?' selected':'')+'>Más recientes primero</option>'+
          '<option value="duracion"'+(F.orden==='duracion'?' selected':'')+'>Mayor duración primero</option></select></div>'+
        '<div class="field-sm"><label>Buscar</label><input type="search" id="bm-buscar" placeholder="Técnico, línea, motivo…" value="'+esc(F.q)+'"></div>'+
        '<div class="field-sm"><label>&nbsp;</label><label style="font-weight:600"><input type="checkbox" id="bm-pend"'+(F.pend?' checked':'')+'> Solo motivo pendiente</label></div>'+
        '<div class="field-sm"><label>&nbsp;</label><button type="button" class="btn btn-ghost btn-sm" id="bm-actualizar">Actualizar</button> '+
        '<button type="button" class="btn btn-primary btn-sm" id="bm-excel"'+((carga.eventos.length&&!carga.cargando)?'':' disabled')+'>Exportar a Excel</button></div>'+
      '</div>'+
      (carga.cargando?'<div class="bm-aviso">Cargando eventos del rango…</div>':'')+
      (carga.error?'<div class="bm-error">'+esc(carga.error)+'</div>':'')+
      (carga.truncado?'<div class="bm-aviso">Se muestran los primeros '+LIMITE_EVENTOS+' eventos del rango. Acota las fechas para ver el resto.</div>':'')+
      (sinDatos?'<div class="bm-vacio"><b>Sin eventos en este rango ('+esc(fmtFecha(F.desde))+(F.hasta!==F.desde?' – '+esc(fmtFecha(F.hasta)):'')+').</b><br>'+
        'La bitácora registra cada vez que alguien detiene, pausa, interviene o reanuda una línea desde Producción Actual. Si hubo paradas y no aparecen, prueba con «Ayer» o «Esta semana», o pulsa «Actualizar».</div>':'')+
      '<div class="bm-resumen">'+
        '<div class="bm-kpi"><span>Paradas</span><b>'+R.tot.paradas+'</b></div>'+
        '<div class="bm-kpi"><span>Minutos de parada</span><b>'+minutos(R.tot.ms)+'</b><small>No programadas '+minutos(R.tot.msNoProg)+' · programadas '+minutos(R.tot.msProg)+'</small></div>'+
        '<div class="bm-kpi'+(R.tot.pendientes?' warn':'')+'"><span>Motivo pendiente</span><b>'+R.tot.pendientes+'</b><small>= «Otro» sin descripción o sin motivo</small></div>'+
        '<div class="bm-kpi"><span>En curso</span><b>'+R.tot.enCurso+'</b></div>'+
        '<div class="bm-kpi"><span>Eventos en el rango</span><b>'+carga.eventos.length+'</b></div></div>'+
      '<div class="bm-dos">'+tablaResumen('Por línea',R.porLinea,'Línea')+tablaResumen('Por técnico (quien inició la parada)',R.porTecnico,'Técnico')+'</div>'+
      '<div class="tareo-tabs" style="margin-bottom:10px">'+
        '<button type="button" class="tareo-tab '+(F.vista==='paradas'?'active':'')+'" data-bm-vista="paradas">Por parada ('+paradas.length+')</button>'+
        '<button type="button" class="tareo-tab '+(F.vista==='eventos'?'active':'')+'" data-bm-vista="eventos">Todos los eventos ('+eventos.length+')</button>'+
        '<button type="button" class="tareo-tab '+(F.vista==='historia'?'active':'')+'" data-bm-vista="historia">Historia de la línea</button></div>'+
      (F.vista==='paradas'
        ?(paradas.length?'<div class="bm-cards">'+paradas.map(tarjetaParada).join('')+'</div>'
          :'<div class="bm-vacio">'+(carga.eventos.length?'<b>Sin paradas con estos filtros.</b> Quita algún filtro o la búsqueda para ver más.':'<b>Sin paradas en este rango.</b>')+'</div>')
        :F.vista==='historia'?htmlHistoria()
        :htmlTablaEventos(eventos))+
      '</div></div>';
    if(foco){
      const nuevo=document.getElementById('bm-buscar');
      if(nuevo&&typeof nuevo.focus==='function'){nuevo.focus();if(posicion!=null&&nuevo.setSelectionRange)try{nuevo.setSelectionRange(posicion,posicion);}catch(_){/* sin selección */}}
    }
  }
  window.renderBitacoraMtto=renderBitacoraMtto;

  /* ---------- completar un motivo pendiente (evento nuevo, la bitácora no se edita) ---------- */
  async function completarDesdeBitacora(idEventoInicial){
    if(!puedeCompletarMotivo()){alert('No tienes permiso para completar motivos.');return;}
    const p=armarParadas(carga.eventos).find(x=>x.pasos[0].id===idEventoInicial);
    if(!p||!p.pendiente){alert('Esta parada ya no tiene un motivo pendiente.');return;}
    const entrada=prompt('Describe el motivo de la parada de '+(p.linea||'la línea')+' (mínimo '+MIN_DETALLE+' caracteres):');
    if(entrada===null)return;
    const texto=String(entrada).trim().slice(0,160);
    if(texto.length<MIN_DETALLE){alert('La descripción debe tener al menos '+MIN_DETALLE+' caracteres.');return;}
    const u=state.user;
    let uid=null;try{uid=(auth&&auth.currentUser&&auth.currentUser.uid)||null;}catch(_){/* sin sesión segura */}
    const ref=db.collection(COLECCION).doc();
    const base=p.pasos[0];
    const evento={
      timestamp:firebase.firestore.FieldValue.serverTimestamp(),uid,accion:'COMPLETAR_MOTIVO',
      tecnicoNombre:u.nombre||u.username,tecnicoId:null,identificadoPor:'USUARIO',tokenPin:null,cuenta:u.username||'',rol:u.rol||'',
      linea:base.linea||'',fechaPlan:base.fechaPlan||'',turno:base.turno||'',marca:base.marca||'',presentacion:base.presentacion||'',
      claveProgramacion:base.claveProgramacion||'',estadoAnterior:'',estadoNuevo:'',motivo:'',estandarMin:null,duracionMs:null,
      paradaId:base.paradaId||null,paradaEventoId:base.id,motivoAnterior:p.motivo||'',motivoDetalle:texto
    };
    if(window.glacialEstadoDatos&&!window.glacialEstadoDatos.enLinea){
      alert('Sin conexión: el motivo NO se guardó. Inténtalo cuando vuelva la conexión.');return;
    }
    try{
      // Solo se da por hecho cuando el servidor lo confirma (sin conexión, set() queda pendiente y no resuelve).
      await Promise.race([ref.set(evento),new Promise((_,rechazar)=>setTimeout(
        ()=>rechazar(new Error('el servidor no confirmó el guardado (¿sin conexión?)')),10000))]);
      if(!carga.eventos.some(e=>e.id===ref.id))
        carga.eventos.push(Object.assign({},evento,{id:ref.id,ts:ahoraMs(),timestamp:null}));   // la escucha en vivo lo reemplaza
      renderBitacoraMtto();
    }catch(e){alert('No se pudo registrar el motivo: '+((e&&e.message)||e));}
  }

  /* ---------- eventos de la pantalla ---------- */
  document.getElementById('main')?.addEventListener('change',e=>{
    if(!document.getElementById('bitmtto-view'))return;
    const id=e.target.id;
    if(id==='bm-desde'||id==='bm-hasta'){
      F.desde=document.getElementById('bm-desde').value;F.hasta=document.getElementById('bm-hasta').value;
      if(fechaOk(F.desde)&&(!fechaOk(F.hasta)||F.hasta<F.desde))F.hasta=F.desde;
      F.rango='personalizado';
      cargarRango(false);return;
    }
    if(id==='bm-pend'){F.pend=!!e.target.checked;renderBitacoraMtto();return;}
    const mapa={'bm-turno':'turno','bm-linea':'linea','bm-tecnico':'tecnico','bm-accion':'accion','bm-origen':'origen','bm-orden':'orden'};
    if(mapa[id]){F[mapa[id]]=e.target.value;renderBitacoraMtto();}
  });
  let temporizadorBusqueda=null;
  document.getElementById('main')?.addEventListener('input',e=>{
    if(!document.getElementById('bitmtto-view')||e.target.id!=='bm-buscar')return;
    F.q=String(e.target.value||'');
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda=setTimeout(renderBitacoraMtto,200);
  });
  document.getElementById('main')?.addEventListener('click',e=>{
    // Tarjeta «Paradas de hoy» (Inicio)
    const pp=e.target.closest&&e.target.closest('#pp-hoy');
    if(pp){
      if(e.target.closest('[data-pp-pend]'))window.bitacoraMttoAbrir({rango:'hoy',pend:true});
      else window.bitacoraMttoAbrir({rango:'hoy'});
      return;
    }
    if(!document.getElementById('bitmtto-view'))return;
    const vista=e.target.closest('[data-bm-vista]')?.dataset.bmVista;
    if(vista){F.vista=vista;renderBitacoraMtto();return;}
    const rango=e.target.closest('[data-bm-rango]')?.dataset.bmRango;
    if(rango){aplicarRango(rango);if(rango==='personalizado')renderBitacoraMtto();else cargarRango(true);return;}
    const compl=e.target.closest('[data-bm-completar]')?.dataset.bmCompletar;
    if(compl){completarDesdeBitacora(compl);return;}
    if(e.target.closest('#bm-actualizar')){cargarRango(true);return;}
    if(e.target.closest('#bm-excel')){exportarExcel();}
  });

  /* ---------- Excel con los filtros aplicados ---------- */
  async function exportarExcel(){
    if(typeof ExcelJS==='undefined'){alert('No se pudo cargar ExcelJS. Revisa tu conexión a internet y recarga la página.');return;}
    const {paradas,eventos}=datosFiltrados();
    if(!eventos.length&&!paradas.length){alert('No hay datos con esos filtros.');return;}
    const R=resumir(paradas);
    const filtros=textoFiltros();
    const wb=new ExcelJS.Workbook();wb.creator='GLACIAL';wb.created=new Date();
    const cabecera=(ws,titulo,cols)=>{
      ws.addRow([titulo]).font={bold:true,size:14};
      ws.addRow([filtros]).font={italic:true,color:{argb:'FF5A6B7B'}};
      ws.addRow([]);
      const h=ws.addRow(cols);
      h.eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1F4E79'}};
        c.alignment={vertical:'middle',horizontal:'center',wrapText:true};});
      ws.views=[{state:'frozen',ySplit:4}];
      return h.number;
    };
    const wr=wb.addWorksheet('Resumen');
    cabecera(wr,'Bitácora de Mantenimiento · resumen',['Tipo','Nombre','Paradas','Minutos','Motivo pendiente']);
    wr.addRow(['TOTAL','',R.tot.paradas,minutos(R.tot.ms),R.tot.pendientes]).font={bold:true};
    wr.addRow(['No programadas','',paradas.filter(p=>p.tipo!=='PAUSA').length,minutos(R.tot.msNoProg),'']);
    wr.addRow(['Programadas','',paradas.filter(p=>p.tipo==='PAUSA').length,minutos(R.tot.msProg),'']);
    R.porLinea.forEach(r=>wr.addRow(['Línea',r.k,r.paradas,minutos(r.ms),r.pendientes]));
    R.porTecnico.forEach(r=>wr.addRow(['Técnico (inició)',r.k,r.paradas,minutos(r.ms),r.pendientes]));
    [16,34,12,12,16].forEach((w,i)=>wr.getColumn(i+1).width=w);
    const wp=wb.addWorksheet('Paradas');
    const hp=cabecera(wp,'Bitácora de Mantenimiento · paradas',['Inicio (servidor)','Fin','Tipo','Línea','Fecha plan','Turno','Marca','Presentación','Motivo','Motivo pendiente','Motivo completado por','Estado','Duración (min)','Pasos (acción · hora · técnico · cuenta)']);
    paradas.slice().sort((a,b)=>a.inicio-b.inicio).forEach(p=>wp.addRow([
      fmtHora(p.inicio),p.fin?fmtHora(p.fin):'',p.tipo==='PAUSA'?'Pausa programada':'Detención',p.linea,p.fechaPlan,p.turno,p.marca,p.presentacion,
      p.motivoTexto,p.pendiente?'SÍ':'',p.completado?(p.completado.por+' · '+fmtHora(p.completado.ts)):'',
      p.cerrada?'Cerrada':(p.sinInicio?'Sin inicio en el rango':'En curso'),
      p.duracionTotalMs==null?'':minutos(p.duracionTotalMs),
      p.pasos.map(e=>e.accion+' · '+fmtHora(e.ts)+' · '+(e.tecnicoNombre||'—')+' · '+(e.cuenta||'')).join('\n')]));
    wp.autoFilter={from:{row:hp,column:1},to:{row:hp,column:14}};
    [22,22,16,12,12,12,18,16,30,12,30,16,12,70].forEach((w,i)=>wp.getColumn(i+1).width=w);
    wp.eachRow((row,n)=>{if(n>hp)row.alignment={vertical:'top',wrapText:true};});
    const we=wb.addWorksheet('Eventos');
    const he=cabecera(we,'Bitácora de Mantenimiento · eventos',['Hora (servidor)','Técnico / usuario','Acción','Línea','Fecha plan','Turno','Marca','Presentación','Motivo / detalle','Duración (min)','Cuenta','Identificado por','Rol de la cuenta','Origen']);
    eventos.slice().sort((a,b)=>a.ts-b.ts).forEach(e=>we.addRow([
      fmtHora(e.ts),e.tecnicoNombre||'',e.accion,e.linea||'',e.fechaPlan||'',e.turno||'',e.marca||'',e.presentacion||'',
      detalleEvento(e),
      duracionEvento(e)!=null?minutos(duracionEvento(e)):'',e.cuenta||'',e.identificadoPor||'',e.rol||'',etiquetaOrigen(origenDe(e))]));
    we.autoFilter={from:{row:he,column:1},to:{row:he,column:14}};
    [22,26,18,12,12,12,18,16,44,12,16,16,22,16].forEach((w,i)=>we.getColumn(i+1).width=w);

    const buffer=await wb.xlsx.writeBuffer();
    const nombre='Bitacora_Mantenimiento_'+F.desde+(F.hasta!==F.desde?'_a_'+F.hasta:'')+'.xlsx';
    const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const a=document.createElement('a');a.href=url;a.download=nombre;document.body.appendChild(a);a.click();
    setTimeout(()=>{a.remove();URL.revokeObjectURL(url);},1500);
  }
  window.bitacoraMttoExportar=exportarExcel;

  /* =========================================================
     TARJETA «PARADAS DE HOY» (Inicio)
     · Eventos del día operativo: listener con tope (después del primer volcado solo llegan los nuevos).
     · Paradas abiertas ahora: de las programaciones en vivo (la fuente del semáforo), no de la bitácora.
     ========================================================= */
  const dia={clave:'',desub:null,eventos:[],listo:false,error:'',ts:0};

  function ventanaDia(){
    const f=diaOperativoActual();
    return {fecha:f,ini:inicioOperativo(f),fin:inicioOperativo(addDias(f,1))};
  }
  function detenerEscuchaDia(){
    if(dia.desub){try{dia.desub();}catch(_){/* ya cerrada */}}
    dia.desub=null;dia.clave='';dia.listo=false;dia.eventos=[];dia.error='';
  }
  function escucharDia(){
    if(typeof db==='undefined'||!puedeVerBitacoraMtto())return;
    const v=ventanaDia();
    if(dia.desub&&dia.clave===v.fecha)return;
    detenerEscuchaDia();
    dia.clave=v.fecha;
    try{
      dia.desub=consultaRango(v.ini,v.fin).onSnapshot(snap=>{
        dia.eventos=snap.docs.map(docAEvento);
        dia.listo=true;dia.error='';dia.ts=ahoraMs();
        pintarTarjeta();
      },err=>{
        dia.error=(err&&err.message)||String(err);dia.listo=true;
        pintarTarjeta();
      });
    }catch(e){dia.error=(e&&e.message)||String(e);dia.listo=true;}
  }

  /* Paradas abiertas ahora, de las programaciones en vivo. */
  function abiertasEnVivo(){
    const salida=[];
    let prog=[];
    try{prog=typeof loadProgramaciones==='function'?(loadProgramaciones()||[]):[];}catch(_){prog=[];}
    prog.forEach(p=>{
      const op=p&&p.estadoOperacion;
      if(!op)return;
      let desde=0,motivo='',tipo='DETENCION';
      if(op.estado==='DETENIDA'||op.estado==='LISTA'){desde=Number(op.detenidaDesde)||0;motivo=op.motivo||'';}
      else if(op.estado==='PAUSA'){desde=Number(op.pausaDesde)||0;motivo=op.motivoPausa||'Pausa programada';tipo='PAUSA';}
      else return;
      if(!desde)return;
      const abierta=(Array.isArray(op.paradas)?op.paradas:[]).filter(x=>x&&!Number(x.fin)).slice(-1)[0];
      salida.push({linea:p.linea||'',marca:p.marca||'',motivo:op.motivoDetalle?((norm(motivo)==='otro'?'Otro':motivo)+' — '+op.motivoDetalle):motivo,
        desde,tipo,estandarMin:Number(abierta&&abierta.estandarMin)||0});
    });
    return salida.sort((a,b)=>a.desde-b.desde);
  }

  function datosTarjeta(){
    const paradas=armarParadas(dia.eventos);
    const R=resumir(paradas);
    const afectada=R.porLinea.find(r=>r.ms>0)||null;
    const abiertas=abiertasEnVivo();
    const ahora=ahoraMs(),umbral=umbralRojoMin();
    abiertas.forEach(a=>{
      a.min=Math.max(0,Math.floor((ahora-a.desde)/60000));
      // Una pausa programada solo se alarma si pasa de su estándar (p. ej. refrigerio 60 min).
      a.larga=a.min>(a.tipo==='PAUSA'?Math.max(umbral,a.estandarMin):umbral);
    });
    const color=abiertas.some(a=>a.larga)?'rojo':(abiertas.length?'ambar':'verde');
    return {R,afectada,abiertas,color,umbral};
  }

  function htmlTarjeta(d){
    d=d||datosTarjeta();
    const estado={rojo:'PARADA PROLONGADA',ambar:'PARADA ABIERTA',verde:'SIN PARADAS ABIERTAS'}[d.color];
    const cuerpoAbiertas=d.abiertas.length
      ?'<div class="pp-abiertas">'+d.abiertas.map(a=>'<div class="pp-abierta'+(a.larga?' larga':'')+'"><span><b>'+esc(a.linea)+'</b> · '+esc(a.motivo||'sin motivo')+
        (a.tipo==='PAUSA'?' <span class="small-muted">(pausa)</span>':'')+'</span><span data-pp-min="'+a.desde+'">'+a.min+' min</span></div>').join('')+'</div>'
      :'<div class="pp-vacio">No hay paradas abiertas.</div>';
    const T=d.R.tot;
    const datos=dia.error
      ?'<div class="pp-ayuda">No se pudieron leer los eventos del día: '+esc(dia.error)+'</div>'
      :(!dia.listo?'<div class="pp-ayuda">Cargando los eventos del día…</div>'
        :(T.paradas?
          '<div class="pp-datos"><span>Paradas del día: <b>'+T.paradas+'</b></span>'+
          '<span>Minutos: <b>'+minutos(T.ms)+'</b> (no programadas '+minutos(T.msNoProg)+' · programadas '+minutos(T.msProg)+')</span>'+
          '<span>Línea más afectada: <b>'+(d.afectada?esc(d.afectada.k)+' · '+minutos(d.afectada.ms)+' min':'—')+'</b></span>'+
          '<span data-pp-pend class="'+(T.pendientes?'pp-pend-alerta':'')+'">Motivo pendiente: <b>'+T.pendientes+'</b></span></div>'+
          '<div class="pp-ayuda">Motivo pendiente = «Otro» sin descripción o sin motivo. Toca la tarjeta para abrir la bitácora de hoy.</div>'
          :'<div class="pp-vacio">Sin paradas registradas en este día operativo (07:00 a 07:00).</div>'));
    return '<div class="pp-top"><h3>PARADAS DE HOY</h3><span class="pp-estado">'+estado+'</span>'+chip()+'</div>'+cuerpoAbiertas+datos;
  }

  function pintarTarjeta(){
    const el=document.getElementById('pp-hoy');
    if(!el){
      // La tarjeta ya no está en pantalla (se salió de Inicio): se deja de escuchar.
      if(state.currentTab!=='centro-perfil')detenerEscuchaDia();
      return;
    }
    const d=datosTarjeta();
    el.className='pp-card '+d.color;
    el.innerHTML=htmlTarjeta(d);
  }
  // Los minutos avanzan en vivo sin volver a leer nada.
  function avanzarMinutos(){
    const ahora=ahoraMs();
    document.querySelectorAll('[data-pp-min]').forEach(s=>{
      s.textContent=Math.max(0,Math.floor((ahora-Number(s.getAttribute('data-pp-min')))/60000))+' min';
    });
  }
  setInterval(()=>{
    if(typeof state==='undefined'||!state.user)return;
    if(document.getElementById('pp-hoy')){
      if(dia.clave&&dia.clave!==diaOperativoActual())detenerEscuchaDia();   // cambió el día operativo
      escucharDia();pintarTarjeta();
    }else if(dia.desub&&state.currentTab!=='centro-perfil')detenerEscuchaDia();
  },30000);
  setInterval(avanzarMinutos,10000);

  if(typeof renderCentroPerfil==='function'){
    const centroAnterior=renderCentroPerfil;
    renderCentroPerfil=function(main){
      const r=centroAnterior.apply(this,arguments);
      try{
        const m=main||document.getElementById('main');
        if(m&&puedeVerBitacoraMtto()&&state.currentTab==='centro-perfil'){
          const shell=m.querySelector&&m.querySelector('.cp-shell');
          if(shell&&!m.querySelector('#pp-hoy')){
            estilos();
            const d=datosTarjeta();
            const html='<section id="pp-hoy" class="pp-card '+d.color+'" role="button" tabindex="0" aria-label="Paradas de hoy: abrir la bitácora">'+htmlTarjeta(d)+'</section>';
            const titulo=shell.querySelector('.cp-title-row');
            if(titulo)titulo.insertAdjacentHTML('afterend',html);
            else{
              const primero=[...shell.children].find(c=>c.tagName!=='STYLE');
              if(primero)primero.insertAdjacentHTML('beforebegin',html);else shell.insertAdjacentHTML('beforeend',html);
            }
            escucharDia();
          }
        }
      }catch(e){console.warn('Tarjeta «Paradas de hoy»:',e&&e.message||e);}
      return r;
    };
    window.renderCentroPerfil=renderCentroPerfil;
  }

  /* =========================================================
     AVISO AL CERRAR EL TURNO (no bloquea el cierre)
     ========================================================= */
  async function avisoPendientesCierre(){
    try{
      if(!puedeVerBitacoraMtto()||typeof db==='undefined')return;
      const v=ventanaDia();
      let eventos;
      if(dia.desub&&dia.clave===v.fecha&&dia.listo&&!dia.error)eventos=dia.eventos;        // ya escuchado: sin lecturas nuevas
      else{const snap=await consultaRango(v.ini,v.fin).get();eventos=snap.docs.map(docAEvento);}
      const turno=turnoActualNombre();
      const pend=armarParadas(eventos).filter(p=>p.pendiente&&(!turno||!p.turno||p.turno===turno)).sort((a,b)=>a.inicio-b.inicio);
      document.getElementById('bm-aviso-cierre')?.remove();
      if(!pend.length)return;
      estilos();
      const div=document.createElement('div');div.id='bm-aviso-cierre';div.setAttribute('role','status');
      div.innerHTML='<b>Paradas con motivo pendiente ('+pend.length+')</b>'+
        '<ul>'+pend.map(p=>'<li><b>'+esc(p.linea||'—')+'</b> · '+esc(fmtHM(p.inicio))+' · la detuvo '+esc(p.iniciador)+'</li>').join('')+'</ul>'+
        '<div class="small-muted" style="margin-bottom:6px">Completa el motivo desde la Bitácora de Mantenimiento. Este aviso no impide el cierre del turno.</div>'+
        '<button type="button" class="btn btn-primary btn-sm" data-bm-ir>Abrir bitácora</button> '+
        '<button type="button" class="btn btn-ghost btn-sm" data-bm-x>Cerrar aviso</button>';
      div.querySelector('[data-bm-x]').onclick=()=>div.remove();
      div.querySelector('[data-bm-ir]').onclick=()=>{div.remove();window.bitacoraMttoAbrir({rango:'hoy',pend:true});};
      document.body.appendChild(div);
    }catch(e){console.warn('Aviso de motivos pendientes:',e&&e.message||e);}
  }
  window.bitacoraMttoAvisoCierre=avisoPendientesCierre;
  // Al cerrar sesión se cierran las escuchas de la bitácora y de la tarjeta «Paradas de hoy».
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(()=>{detenerBitacora();detenerEscuchaDia();});
  // Paradas con motivo sin completar de un día operativo y turno (una sola consulta; la usa el resumen de turno).
  window.bitacoraMttoPendientes=async function(fecha,turno){
    if(typeof db==='undefined')throw new Error('Sin base de datos.');
    const snap=await consultaRango(inicioOperativo(fecha),inicioOperativo(addDias(fecha,1))).get();
    const esNoche=t=>norm(t).includes('noche');
    return armarParadas(snap.docs.map(docAEvento))
      .filter(p=>p.pendiente&&(!p.turno||esNoche(p.turno)===(esNoche(turno))))
      .sort((a,b)=>a.inicio-b.inicio);
  };
  if(typeof avGenerarCierreAhora==='function'){
    const cierreAnterior=avGenerarCierreAhora;
    avGenerarCierreAhora=function(){
      avisoPendientesCierre();                    // sin await: no retrasa ni bloquea el cierre
      return cierreAnterior.apply(this,arguments);
    };
    window.avGenerarCierreAhora=avGenerarCierreAhora;
  }

  /* ---------- navegación: botón del menú y permisos ---------- */
  window.bitacoraMttoAbrir=function(opciones){
    if(!puedeVerBitacoraMtto()){alert('No tienes permiso para ver la bitácora de Mantenimiento.');return;}
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    const o=opciones||{};
    if(carga.usuario!==state.user.username){carga.usuario=state.user.username;carga.clave='';carga.eventos=[];carga.error='';}
    if(o.rango){aplicarRango(o.rango);}
    else if(F.rango!=='personalizado'||!fechaOk(F.desde)||!fechaOk(F.hasta))aplicarRango(F.rango==='personalizado'?'personalizado':(F.rango||'hoy'));
    F.pend=!!o.pend;
    if(o.rango){F.turno=F.linea=F.tecnico=F.accion=F.q='';F.origen=o.origen||'';}
    else if(o.origen!==undefined)F.origen=o.origen;
    state.currentTab='bitacora-mtto';
    if(typeof renderSidebar==='function')renderSidebar();
    if(typeof renderMain==='function')renderMain();
    cargarRango(!!o.rango);
  };
  window.goBitacoraMtto=()=>window.bitacoraMttoAbrir({origen:''});
  // «Bitácora de producción»: la misma pantalla filtrada por origen Producción (se abre desde el grupo Producción del menú).
  window.goBitacoraProduccion=()=>window.bitacoraMttoAbrir({rango:'hoy',origen:'PRODUCCION'});

  if(typeof ajustarVistaSegunPermisos==='function'){
    const ajustarAnterior=ajustarVistaSegunPermisos;
    ajustarVistaSegunPermisos=function(){
      if(state.currentTab==='bitacora-mtto'&&puedeVerBitacoraMtto())return;
      return ajustarAnterior.apply(this,arguments);
    };
  }
  if(typeof renderMain==='function'){
    const mainAnterior=renderMain;
    renderMain=function(){
      if(state.currentTab==='bitacora-mtto'&&!state.showWelcome&&puedeVerBitacoraMtto()){
        renderBitacoraMtto();return;
      }
      if(desubBitacora&&state.currentTab!=='bitacora-mtto')detenerBitacora();   // salió de la bitácora: deja de leer
      return mainAnterior.apply(this,arguments);
    };
  }
  if(typeof grupoSidebarActivo==='function'){
    const grupoAnterior=grupoSidebarActivo;
    grupoSidebarActivo=function(){
      return state.currentTab==='bitacora-mtto'?(F.origen==='PRODUCCION'?'produccion':'mantenimiento'):grupoAnterior.apply(this,arguments);
    };
  }
  if(typeof renderSidebar==='function'){
    const sidebarAnterior=renderSidebar;
    renderSidebar=function(){
      const r=sidebarAnterior.apply(this,arguments);
      const mostrar=!!(typeof state!=='undefined'&&state.user)&&puedeVerBitacoraMtto();
      let cambio=false;
      [['btn-bitacora-mtto',false],['btn-bitacora-prod',true]].forEach(([id,esProd])=>{
        const b=document.getElementById(id);
        if(!b)return;
        b.hidden=!mostrar;b.style.display=mostrar?'':'none';
        const activo=mostrar&&state.currentTab==='bitacora-mtto'&&((F.origen==='PRODUCCION')===esProd);
        b.classList.toggle('active',activo);
        if(activo)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
        cambio=true;
      });
      if(cambio&&typeof actualizarGruposSidebar==='function')actualizarGruposSidebar();
      return r;
    };
  }
})();
