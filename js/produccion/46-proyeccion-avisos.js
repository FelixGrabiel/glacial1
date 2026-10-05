/* =========================================================
   LOTE 2 · PROYECCIÓN DEL TURNO + AVISOS (se muestran en el Centro de alertas de 25-alertas-lineas.js)
   · Reutiliza lo que ya existe: proyección de 23b (proyectarCierreLinea), filas del resumen ejecutivo del
     semáforo (glacialResumenEjecutivoLineas) y datos en vivo de programaciones, paletas y tareos.
     NO hace lecturas nuevas: lo único que escucha es el documento sync/configAlertas (umbrales).
   · Avisos (se calculan en cada dispositivo con la hora del servidor, así que todos ven lo mismo):
       a) Parada abierta más de N min                      (paradaMin, 30)
       b) Línea en producción sin paletas en N min          (sinRegistroMin, 60)
       c) Proyección realista < N % pasada la mitad del turno (proyeccionAlertaPct, 90)
       d) Programación sin iniciar N min después del inicio del turno (noIniciadaMin, 15)
       e) Tareo con pendientes que se bloquea en menos de N min (tareoBloqueoMin, 30)
   · Cada aviso desaparece solo cuando la condición se resuelve. «Visto» se guarda en el dispositivo.
   · Cada rol ve lo suyo (ver ambito()). La cuenta compartida de Mantenimiento solo ve paradas.
   · Umbrales: sync/configAlertas, escuchado en vivo; se editan con una transacción que cambia SOLO los
     campos modificados (Administrador y Jefatura).
   Cargar después de 25-alertas-lineas.js y de 43/44.
   ========================================================= */
(function(){
  'use strict';

  const DEFECTOS={
    paradaMin:30,sinRegistroMin:60,proyeccionAlertaPct:90,noIniciadaMin:15,tareoBloqueoMin:30,
    proyeccionVerdePct:100,proyeccionAmbarPct:90
  };
  const ETIQUETAS=[
    ['paradaMin','Parada abierta más de (min)',1,1440],
    ['sinRegistroMin','Línea en producción sin paletas en (min)',1,1440],
    ['proyeccionAlertaPct','Alerta si la proyección es menor a (%), pasada la mitad del turno',1,200],
    ['noIniciadaMin','Programación sin iniciar tras el inicio del turno (min)',1,1440],
    ['tareoBloqueoMin','Tareo con pendientes que se bloquea en menos de (min)',1,1440],
    ['proyeccionVerdePct','Proyección en verde desde (%)',1,300],
    ['proyeccionAmbarPct','Proyección en ámbar desde (%)',1,300]
  ];
  const JEFATURA=['Jefe de Producción','Jefe de Operaciones','Jefatura','Gerente General','Gerente'];   // = reglas etapa 2
  const TODOS=['parada','paletas','proyeccion','noiniciada','tareo'];
  const MS_MIN=60000;

  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,
    c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hhmm=ms=>new Date(ms).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false});
  const fmt=n=>Math.round(n).toLocaleString('es-PE');
  const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();

  /* ---------- umbrales (sync/configAlertas) ---------- */
  let remota={},desubConfig=null,configListo=false;
  function limpiar(o){
    const r={};
    Object.keys(DEFECTOS).forEach(k=>{const v=Number(o&&o[k]);if(Number.isFinite(v)&&v>0)r[k]=v;});
    return r;
  }
  function config(){return Object.assign({},DEFECTOS,limpiar(remota));}
  window.glacialConfigAlertas=config;

  function escucharConfig(){
    if(desubConfig||typeof db==='undefined'||typeof state==='undefined'||!state.user)return;
    try{
      desubConfig=db.collection('sync').doc('configAlertas').onSnapshot(snap=>{
        remota=snap.exists?(snap.data()||{}):{};configListo=true;
        recalcular(true);
        // Los colores de la proyección dependen de los umbrales: repinta Producción Actual si está abierta.
        try{if(state.currentTab==='produccion-actual'&&typeof renderProduccionActualTab==='function')renderProduccionActualTab();}catch(_){/* informativo */}
      },()=>{desubConfig=null;});          // sin permiso o sin sesión: se reintenta en el siguiente ciclo
    }catch(_){desubConfig=null;}
  }
  function detenerConfig(){
    if(desubConfig){try{desubConfig();}catch(_){/* ya cerrado */}}
    desubConfig=null;remota={};configListo=false;
  }

  /* ---------- quién ve qué ---------- */
  function ambito(u){
    u=u||(typeof state!=='undefined'?state.user:null);
    if(!u||!u.username)return null;
    const rol=String(u.rol||'').trim();
    const tiene=p=>{try{return typeof tienePermiso==='function'&&tienePermiso(p);}catch(_){return false;}};
    if(typeof esMantCompartido==='function'&&esMantCompartido(u))return {tipos:['parada'],lineas:null,tareo:null};
    if(rol==='Administrador'||JEFATURA.includes(rol))return {tipos:TODOS.slice(),lineas:null,tareo:'todas'};
    if(rol==='Supervisor'||rol==='Supervisor de Producción')return {tipos:TODOS.slice(),lineas:u.linea||null,tareo:'Producción'};
    if(rol==='Mantenimiento'||tiene('moduloMantenimiento')||tiene('control_operativo_lineas')||tiene('recibirAlertasProduccion'))
      return {tipos:['parada'],lineas:null,tareo:null};
    return null;
  }
  const puede=()=>ambito()!==null;
  const puedeConfigurar=()=>{
    const u=typeof state!=='undefined'?state.user:null;
    if(!u)return false;
    const rol=String(u.rol||'').trim();
    return rol==='Administrador'||JEFATURA.includes(rol)||(typeof tienePermiso==='function'&&tienePermiso('configurar_umbrales'));
  };
  const puedeVerProyeccion=a=>!!a&&a.tipos.includes('proyeccion');

  /* ---------- «visto» en el dispositivo ---------- */
  const claveVistos=()=>'glacial_avisos_vistos_v1_'+((typeof state!=='undefined'&&state.user&&state.user.username)||'');
  function leerVistos(){try{return JSON.parse(localStorage.getItem(claveVistos())||'{}')||{};}catch(_){return {};}}
  function guardarVistos(v){try{localStorage.setItem(claveVistos(),JSON.stringify(v));}catch(_){/* almacenamiento bloqueado */}}

  /* ---------- cálculo de avisos ---------- */
  function paradasAbiertas(){
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
      salida.push({linea:p.linea||'',motivo,desde,tipo,estandarMin:Number(abierta&&abierta.estandarMin)||0});
    });
    return salida;
  }

  function nombreLinea(k){
    try{const l=(typeof LINES!=='undefined'?LINES:[]).find(x=>x.key===k);return l?l.name:k;}catch(_){return k;}
  }
  const enAmbito=(a,linea)=>!a.lineas||a.lineas===linea;

  function inicioTurnoMs(fecha,turno){
    try{
      const r=window.__tiemposLineaInternos&&window.__tiemposLineaInternos.rangoTurno(fecha,turno,false);
      return r?{ini:r.inicio,fin:r.fin}:null;
    }catch(_){return null;}
  }

  function pendientesTareo(t){
    const personal=Array.isArray(t&&t.personal)?t.personal:[];
    const canon=typeof tareoEstadoCanonico==='function'?tareoEstadoCanonico:(v=>v);
    let sinEstado=0,sinSalida=0;
    personal.forEach(p=>{
      if(!canon(p.asistencia))sinEstado++;
      else if(p.horaIngreso&&!p.horaSalida)sinSalida++;
    });
    return {sinEstado,sinSalida,total:sinEstado+sinSalida};
  }

  function calcular(){
    const a=ambito();
    if(!a)return [];
    const cfg=config();
    const n=ahora();
    const lista=[];
    const add=(id,tipo,linea,texto,desde,extra)=>lista.push(Object.assign({id,tipo,linea,texto,desdeMs:desde,severidad:'ambar'},extra||{}));

    /* a) paradas abiertas */
    if(a.tipos.includes('parada')){
      paradasAbiertas().forEach(p=>{
        if(!enAmbito(a,p.linea))return;
        const min=(n-p.desde)/MS_MIN;
        const umbral=p.tipo==='PAUSA'?Math.max(cfg.paradaMin,p.estandarMin):cfg.paradaMin;
        if(min>umbral)add('par|'+p.linea+'|'+p.desde,'parada',p.linea,
          (p.tipo==='PAUSA'?'Pausa programada':'Parada')+' abierta hace '+fmt(min)+' min'+(p.motivo?' · '+p.motivo:''),
          p.desde,{severidad:'roja'});
      });
    }

    /* b, c) a partir de las filas del semáforo (misma fuente que el Inicio) */
    let resumen=null;
    if(a.tipos.some(t=>['paletas','proyeccion'].includes(t))&&typeof window.glacialResumenEjecutivoLineas==='function'){
      try{resumen=window.glacialResumenEjecutivoLineas();}catch(_){resumen=null;}
    }
    if(resumen&&Array.isArray(resumen.filas)){
      resumen.filas.forEach(f=>{
        if(!enAmbito(a,f.linea)||f.estado!=='EN_CURSO'||!f.tiempos||!f.tiempos.enCurso)return;
        if(a.tipos.includes('paletas')){
          const ultimo=Math.max(Number(f.ultimoMs)||0,Number(f.tiempos.inicioMs)||0);
          if(ultimo&&n-ultimo>cfg.sinRegistroMin*MS_MIN)
            add('pal|'+f.linea+'|'+resumen.fecha+'|'+resumen.turno,'paletas',f.linea,
              'Sin registrar paletas desde las '+hhmm(ultimo)+' ('+fmt((n-ultimo)/MS_MIN)+' min)',ultimo);
        }
        if(a.tipos.includes('proyeccion')&&f.proyeccion&&f.proyeccion.estado==='OK'){
          const r=inicioTurnoMs(resumen.fecha,resumen.turno);
          const mitad=r?r.ini+(r.fin-r.ini)/2:null;
          if(mitad&&n>mitad&&f.proyeccion.pct<cfg.proyeccionAlertaPct)
            add('proy|'+f.linea+'|'+resumen.fecha+'|'+resumen.turno,'proyeccion',f.linea,
              'Proyección de cierre '+f.proyeccion.pct.toFixed(0)+' % del programa ('+(f.proyeccion.diferencia<0?'faltarían '+fmt(-f.proyeccion.diferencia):'sobrarían '+fmt(f.proyeccion.diferencia))+' UND)',
              mitad,{severidad:f.proyeccion.nivel==='roja'?'roja':'ambar'});
        }
      });
    }

    /* d) programación que no se inició a tiempo */
    if(a.tipos.includes('noiniciada')&&typeof window.glacialTurnoVigente==='function'){
      let tv=null;try{tv=window.glacialTurnoVigente();}catch(_){tv=null;}
      const r=tv&&inicioTurnoMs(tv.fecha,tv.turno);
      if(r&&n>r.ini+cfg.noIniciadaMin*MS_MIN){
        const porLinea=new Map();
        let prog=[];try{prog=loadProgramaciones()||[];}catch(_){prog=[];}
        prog.forEach(p=>{
          if(!p||p.fecha!==tv.fecha||Number(p.cantidadProgramada)<=0)return;
          const delTurno=p.turno===tv.turno||(tv.turno==='INTERMEDIO'&&p.turno==='DÍA');
          if(!delTurno)return;
          const e=p.estadoOperacion&&p.estadoOperacion.estado;
          if(e==='CANCELADA')return;
          const o=porLinea.get(p.linea)||{iniciada:false};
          if(e&&e!=='PENDIENTE')o.iniciada=true;
          porLinea.set(p.linea,o);
        });
        porLinea.forEach((o,linea)=>{
          if(o.iniciada||!enAmbito(a,linea))return;
          add('ini|'+linea+'|'+tv.fecha+'|'+tv.turno,'noiniciada',linea,
            'Programación sin iniciar desde las '+hhmm(r.ini+cfg.noIniciadaMin*MS_MIN)+' ('+tv.turno+')',r.ini+cfg.noIniciadaMin*MS_MIN);
        });
      }
    }

    /* e) tareo con pendientes que se bloquea pronto */
    if(a.tipos.includes('tareo')&&a.tareo&&typeof loadTareos==='function'&&typeof window.tareoBloqueoInfo==='function'){
      let tareos=[];try{tareos=loadTareos()||[];}catch(_){tareos=[];}
      const corte=new Date(n-8*86400000).toISOString().slice(0,10);
      tareos.forEach(t=>{
        if(!t||(t.fecha||'')<corte)return;
        if(a.tareo!=='todas'&&t.area!==a.tareo)return;
        let info;try{info=window.tareoBloqueoInfo(t);}catch(_){return;}
        if(!info||info.bloqueado||info.faltaMs==null||info.faltaMs<=0||info.faltaMs>cfg.tareoBloqueoMin*MS_MIN)return;
        const p=pendientesTareo(t);
        if(!p.total)return;
        add('tar|'+(t.id||t.area+'|'+t.fecha+'|'+t.turno),'tareo',t.area,
          'Tareo '+t.area+' · '+t.turno+' ('+t.fecha+'): '+(p.sinEstado?p.sinEstado+' sin estado':'')+(p.sinEstado&&p.sinSalida?' y ':'')+(p.sinSalida?p.sinSalida+' sin salida':'')+
          ' · se bloquea en '+fmt(info.faltaMs/MS_MIN)+' min',info.bloqueaEn-cfg.tareoBloqueoMin*MS_MIN,
          {area:t.area,fecha:t.fecha,turno:t.turno,severidad:'ambar'});
      });
    }

    /* f) solicitudes de programación (54-planificacion-solicitudes.js): pendientes para quien planifica, resultado para quien las pidió */
    if(window.glacialPlanificacion&&typeof window.glacialPlanificacion.avisos==='function'){
      try{window.glacialPlanificacion.avisos().forEach(x=>add(x.id,'solicitud',x.linea||'',x.texto,x.desdeMs,{severidad:x.severidad||'ambar'}));}catch(_){/* informativo */}
    }

    const vistos=leerVistos();
    const activos=new Set(lista.map(x=>x.id));
    let cambio=false;
    Object.keys(vistos).forEach(k=>{if(!activos.has(k)){delete vistos[k];cambio=true;}});   // el aviso se resolvió: se olvida
    if(cambio)guardarVistos(vistos);
    lista.forEach(x=>{x.visto=!!vistos[x.id];});
    const orden={roja:0,ambar:1};
    return lista.sort((x,y)=>(x.visto-y.visto)||(orden[x.severidad]-orden[y.severidad])||x.desdeMs-y.desdeMs);
  }

  function marcarVisto(id){
    const v=leerVistos();v[id]=ahora();guardarVistos(v);
    repintar();
  }
  function ir(id){
    const x=calcular().find(a=>a.id===id);
    if(!x)return;
    try{
      if(x.tipo==='tareo'){
        if(typeof tareoAbrir==='function'&&x.area&&x.fecha&&x.turno){state.currentTab='tareo';if(typeof renderSidebar==='function')renderSidebar();tareoAbrir(x.area,x.fecha,x.turno);return;}
        if(typeof goTareo==='function')goTareo();
        return;
      }
      if(x.tipo==='solicitud'){if(typeof goPlanificacion==='function'){goPlanificacion();if(window.glacialPlanificacion)window.glacialPlanificacion.irASolicitudes();}return;}
      if(typeof goProduccionActual==='function')goProduccionActual();
    }catch(e){console.warn('Aviso: no se pudo abrir la pantalla:',e&&e.message||e);}
  }

  /* ---------- repintado solo cuando cambia algo ---------- */
  let firmaPrevia='';
  function repintar(){
    try{if(typeof window.glacialAlertasPintar==='function')window.glacialAlertasPintar();}catch(_){/* informativo */}
  }
  function recalcular(forzar){
    if(typeof state==='undefined'||!state.user)return;
    escucharConfig();
    const firma=calcular().map(x=>x.id+(x.visto?'v':'')).join(',')+'|'+(window.glacialEstadoDatos&&window.glacialEstadoDatos.enLinea);
    if(forzar||firma!==firmaPrevia){firmaPrevia=firma;repintar();}
    pintarTarjeta();
  }
  setInterval(()=>recalcular(false),20000);
  ['onProgramacionesUpdated','onPaletasUpdated','onTareosUpdated'].forEach(nombre=>{
    const anterior=globalThis[nombre];
    if(typeof anterior!=='function')return;
    globalThis[nombre]=function(){
      const r=anterior.apply(this,arguments);
      try{recalcular(false);}catch(_){/* informativo */}
      return r;
    };
  });
  if(typeof handleLogout==='function'){
    const salirAnterior=handleLogout;
    handleLogout=function(){
      const r=salirAnterior.apply(this,arguments);
      detenerConfig();firmaPrevia='';
      return r;
    };
  }

  /* ---------- editor de umbrales (Administrador y Jefatura) ---------- */
  function abrirConfig(){
    if(!puedeConfigurar()){alert('Solo el Administrador o Jefatura pueden cambiar los umbrales.');return;}
    escucharConfig();
    const actual=config();
    const fondo=document.createElement('div');
    fondo.style.cssText='position:fixed;inset:0;background:rgba(10,30,50,.6);display:flex;align-items:center;justify-content:center;z-index:10060;padding:16px;';
    fondo.innerHTML='<div class="modal" style="max-width:520px;width:100%;max-height:90vh;overflow:auto;background:#fff;border-radius:12px;padding:16px">'+
      '<h3 style="margin:0 0 6px">Umbrales de avisos y proyección</h3>'+
      '<p class="small-muted" style="margin:0 0 10px">Los cambios se ven en todos los dispositivos en segundos. Solo se guardan los campos que cambies.</p>'+
      ETIQUETAS.map(([k,txt,mi,ma])=>'<label style="display:block;margin:8px 0;font-size:13px">'+esc(txt)+
        '<input type="number" data-umbral="'+k+'" min="'+mi+'" max="'+ma+'" value="'+actual[k]+'" style="display:block;width:100%;padding:6px;margin-top:3px"></label>').join('')+
      '<div data-umbral-error style="color:#c62828;font-size:12px;min-height:16px"></div>'+
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px">'+
      '<button type="button" class="btn btn-ghost" data-umbral-x>Cancelar</button>'+
      '<button type="button" class="btn btn-primary" data-umbral-ok>Guardar</button></div></div>';
    document.body.appendChild(fondo);
    const err=t=>{const e=fondo.querySelector('[data-umbral-error]');if(e)e.textContent=t;};
    fondo.querySelector('[data-umbral-x]').onclick=()=>fondo.remove();
    fondo.querySelector('[data-umbral-ok]').onclick=async()=>{
      const nuevos={};
      for(const [k,txt,mi,ma] of ETIQUETAS){
        const el=fondo.querySelector('[data-umbral="'+k+'"]');
        const v=Number(el&&el.value);
        if(!Number.isFinite(v)||v<mi||v>ma){err(txt+': debe estar entre '+mi+' y '+ma+'.');return;}
        if(v!==actual[k])nuevos[k]=v;
      }
      const verde=nuevos.proyeccionVerdePct??actual.proyeccionVerdePct,ambar=nuevos.proyeccionAmbarPct??actual.proyeccionAmbarPct;
      if(ambar>verde){err('El umbral ámbar no puede ser mayor que el verde.');return;}
      if(!Object.keys(nuevos).length){fondo.remove();return;}
      if(window.glacialEstadoDatos&&!window.glacialEstadoDatos.enLinea){err('Sin conexión: no se guardó. Inténtalo cuando vuelva la conexión.');return;}
      err('Guardando…');
      try{
        const ref=db.collection('sync').doc('configAlertas');
        await db.runTransaction(async tx=>{
          await tx.get(ref);
          // Solo los campos cambiados: nunca se reescribe el documento con lo que este equipo tenía en memoria.
          tx.set(ref,Object.assign({},nuevos,{actualizadoPor:(state.user&&state.user.username)||'',actualizadoEn:ahora()}),{merge:true});
        });
        fondo.remove();
        alert('Umbrales guardados. Se actualizan en todos los dispositivos.');
      }catch(e){
        err('No se pudo guardar (¿sin conexión o sin permiso?): '+((e&&e.message)||e));
      }
    };
  }

  /* ---------- tarjeta «Proyección del turno» (Inicio) ---------- */
  const ORDEN_NIVEL={roja:0,ambar:1,verde:2,gris:3};
  function filasProyeccion(){
    const a=ambito();
    if(!puedeVerProyeccion(a)||typeof window.glacialResumenEjecutivoLineas!=='function')return null;
    let r=null;try{r=window.glacialResumenEjecutivoLineas();}catch(_){r=null;}
    if(!r||!Array.isArray(r.filas))return null;
    const filas=r.filas.filter(f=>enAmbito(a,f.linea)&&f.tiempos&&f.tiempos.enCurso&&f.proyeccion&&f.proyeccion.estado!=='SIN_PROYECCION');
    filas.sort((x,y)=>(ORDEN_NIVEL[x.proyeccion.nivel]??3)-(ORDEN_NIVEL[y.proyeccion.nivel]??3)||(x.proyeccion.pct??999)-(y.proyeccion.pct??999));
    return {turno:r.turno,fecha:r.fecha,filas};
  }
  function htmlTarjetaProyeccion(){
    const d=filasProyeccion();
    if(!d)return '';
    const chip=window.glacialEstadoDatos?window.glacialEstadoDatos.chip():'';
    const cuerpo=d.filas.length?d.filas.map(f=>{
      const p=f.proyeccion;
      let detalle;
      if(p.estado==='CALCULANDO')detalle='<span class="pry-det">Calculando… (primeros 30 min de la programación)</span>';
      else if(p.estado!=='OK')detalle='<span class="pry-det">—</span>';
      else{
        const dif=p.diferencia>=0?'<b class="pry-ok">sobrarían '+fmt(p.diferencia)+'</b>':'<b class="pry-mal">faltarían '+fmt(-p.diferencia)+'</b>';
        const hora=p.cumplido?'programa cumplido':(p.horaEstimadaMs?'se completaría hacia las '+hhmm(p.horaEstimadaMs)+(p.minAdicionales>0.5?' (+'+fmt(p.minAdicionales)+' min tras el fin del turno)':''):'');
        detalle='<span class="pry-det"><b>'+fmt(p.siguenIgual)+' UND</b> ('+p.pct.toFixed(0)+' %) · '+dif+' · ritmo necesario <b>'+(p.ritmoNecesario==null?'—':fmt(p.ritmoNecesario))+'</b> vs ratio <b>'+
          (p.ritmoActual==null?'—':fmt(p.ritmoActual))+'</b> UND/h · '+hora+(p.detenida?' · <b class="pry-mal">línea detenida</b>':'')+'</span>';
      }
      return '<div class="pry-fila pry-'+(p.nivel||'gris')+'"><strong>'+esc(f.nombre||f.linea)+'</strong>'+detalle+'</div>';
    }).join(''):'<div class="pry-vacio">No hay líneas con programación activa en este turno.</div>';
    return '<div class="pry-top"><h3>PROYECCIÓN DEL TURNO · '+esc(d.turno)+'</h3>'+chip+'</div>'+cuerpo+
      '<div class="pry-nota">«Si las paradas siguen igual» según lo registrado en paletas. Las líneas en riesgo van primero.</div>';
  }
  function estilos(){
    if(document.getElementById('pry-css'))return;
    const s=document.createElement('style');s.id='pry-css';
    s.textContent='.pry-card{border:1px solid #dfe4ea;border-left:8px solid #9aa9b8;border-radius:12px;background:#fff;padding:12px 16px;margin-bottom:12px;box-shadow:0 3px 12px rgba(17,57,91,.055)}'+
      '.pry-top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.pry-top h3{margin:0;font-size:14px;letter-spacing:.04em;color:#10265f}'+
      '.pry-fila{display:flex;flex-direction:column;gap:2px;margin-top:6px;padding:6px 10px;border-radius:8px;border-left:5px solid #9aa9b8;background:#f7f9fb;font-size:13px}'+
      '.pry-fila.pry-verde{border-left-color:#13814a;background:#effbf4}.pry-fila.pry-ambar{border-left-color:#df8b00;background:#fffbea}.pry-fila.pry-roja{border-left-color:#d93a3a;background:#fff5f5}'+
      '.pry-ok{color:#13814a}.pry-mal{color:#a92f27}.pry-nota,.pry-vacio{font-size:11.5px;color:#5a6b7b;margin-top:6px}';
    document.head.appendChild(s);
  }
  function pintarTarjeta(){
    const el=document.getElementById('pry-turno');
    if(el)el.innerHTML=htmlTarjetaProyeccion();
  }

  if(typeof renderCentroPerfil==='function'){
    const anterior=renderCentroPerfil;
    renderCentroPerfil=function(main){
      const r=anterior.apply(this,arguments);
      try{
        const m=main||document.getElementById('main');
        const a=ambito();
        if(m&&puedeVerProyeccion(a)&&state.currentTab==='centro-perfil'&&!m.querySelector('#pry-turno')){
          const shell=m.querySelector&&m.querySelector('.cp-shell');
          if(shell){
            estilos();
            const html='<section id="pry-turno" class="pry-card" aria-label="Proyección del turno">'+htmlTarjetaProyeccion()+'</section>';
            const pp=m.querySelector('#pp-hoy');
            const titulo=shell.querySelector('.cp-title-row');
            if(pp&&pp.insertAdjacentHTML)pp.insertAdjacentHTML('afterend',html);
            else if(titulo)titulo.insertAdjacentHTML('afterend',html);
            else shell.insertAdjacentHTML('afterbegin',html);
          }
        }
      }catch(e){console.warn('Tarjeta «Proyección del turno»:',e&&e.message||e);}
      return r;
    };
    window.renderCentroPerfil=renderCentroPerfil;
  }

  window.glacialAvisos={puede,ambito,listar:calcular,visto:marcarVisto,ir,puedeConfigurar,abrirConfig,
    recalcular,escucharConfig,defectos:DEFECTOS};
})();
