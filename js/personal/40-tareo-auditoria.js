/* =============================================================
   GLACIAL · TAREO — AUDITORÍA (colección auditoriaTareos)
   -------------------------------------------------------------
   Registra, sin tocar 13-tareo.js, quién cambió qué en un tareo.
   Cada evento es un documento NUEVO en auditoriaTareos (solo crear;
   las reglas impiden editar o borrar). Se ve en RRHH → Auditoría.

   Eventos (campo "accion"):
     CREAR_TAREO
     REGISTRAR_ASISTENCIA / EDITAR_ASISTENCIA
     REGISTRAR_INGRESO    / EDITAR_INGRESO
     REGISTRAR_REFRIGERIO / EDITAR_REFRIGERIO
     REGISTRAR_SALIDA     / EDITAR_SALIDA
     EDITAR_SALIDA_MTTO     Mantenimiento corrige la salida de un maquinista (con motivo)
     SALIDA_VISTA           el supervisor marca como vista una salida editada
     TRABAJO_EN_DESCANSO
     AGREGAR_PERSONAL / QUITAR_PERSONAL
     AGREGAR_POR_DIA / QUITAR_POR_DIA
     CAMBIAR_ESTADO_TAREO
     ELIMINAR_TAREO
   REGISTRAR_* = primer valor (de vacío/PENDIENTE a un valor).
   EDITAR_*    = corrección de un valor que ya existía.
   Cada evento lleva además esCorreccion (true/false) para filtrar.

   Cada evento guarda: fecha y hora DEL SERVIDOR (serverTimestamp), usuario,
   uid de Firebase (las reglas exigen uid == request.auth.uid), rol, área,
   tareo, trabajador, campo, valor anterior y valor nuevo.

   Cómo detecta los cambios: guarda una "foto" de cada tareo y, después de
   cada guardado, compara. La foto se renueva ANTES de cualquier otra cosa
   cada vez que llegan datos desde Firestore, y los cambios de una persona
   solo se atribuyen si su marca actualizadoEn no es anterior a la de la foto:
   así un cambio hecho por otro usuario o dispositivo nunca se registra a
   nombre de quien guarda después.

   Si registrar un evento falla, NO bloquea el guardado del tareo: solo
   avisa en la consola. No registra nada en el modo "Ver como".

   Cargar DESPUÉS de 13-tareo.js y 26-rrhh-panel.js; antes de 12-init.js.
   ============================================================= */
(function instalarAuditoriaTareos(){
  'use strict';

  const COLECCION='auditoriaTareos';
  const MAX_EVENTOS_POR_GUARDADO=200;
  const TTL_DUPLICADO_MS=120000;

  const base=new Map();        // tareoId → foto del último estado conocido
  const recientes=new Map();   // clave de evento → instante (evita duplicados)
  let sembrada=false;

  const norm=t=>typeof tareoNormalizarTexto==='function'
    ? tareoNormalizarTexto(t)
    : String(t||'').trim().toLowerCase();

  function clavePersona(p){
    const ids=typeof tareoIdentidades==='function'?tareoIdentidades(p):[];
    return ids[0]||('NOM:'+norm(p&&p.nombre));
  }

  /* Foto mínima de un tareo: solo lo que se audita. */
  function foto(t){
    const personal={};
    (Array.isArray(t&&t.personal)?t.personal:[]).forEach(p=>{
      if(!p)return;
      const ediciones=Array.isArray(p.edicionesSalida)?p.edicionesSalida:[];
      personal[clavePersona(p)]={
        nombre:p.nombre||'',dni:p.dni||'',id:p.trabajadorId||p.id||'',
        ts:Number(p.actualizadoEn||0),
        asistencia:p.asistencia||'',horaIngreso:p.horaIngreso||'',
        salidaRefrigerio:p.salidaRefrigerio||'',retornoRefrigerio:p.retornoRefrigerio||'',
        horaSalida:p.horaSalida||'',
        nEdSalida:ediciones.length,
        ultimaEd:ediciones.length?ediciones[ediciones.length-1]:null,
        vista:!!(ediciones.length&&ediciones[ediciones.length-1].vista),
        trabajoEnDescanso:!!p.trabajoEnDescanso
      };
    });
    const porDia={};
    (Array.isArray(t&&t.personalPorDia)?t.personalPorDia:[]).forEach(p=>{
      if(p&&p.id)porDia[p.id]={nombre:p.nombre||'',dni:p.dni||'',quitada:!!p.eliminada};
    });
    return {estado:t&&t.estado||'',area:t&&t.area||'',personal,porDia};
  }

  function sembrar(){
    try{
      obtenerTareos().forEach(t=>{if(t&&t.id)base.set(t.id,foto(t));});
      sembrada=true;
    }catch(e){console.warn('Auditoría de tareos: no se pudo preparar',e&&e.message||e);}
  }

  /* ---------- eventos ---------- */
  function usuarioActual(){
    const u=(typeof state!=='undefined'&&state.user)||{};
    let uid=null;
    try{uid=(typeof auth!=='undefined'&&auth&&auth.currentUser&&auth.currentUser.uid)||null;}catch(_){/* sin sesión segura */}
    return {usuario:u.username||'',usuarioNombre:u.nombre||u.username||'',uid,rol:u.rol||''};
  }
  const esCorreccion=accion=>/^(EDITAR_|QUITAR_|ELIMINAR_)/.test(accion);
  function marcaServidor(){
    try{return firebase.firestore.FieldValue.serverTimestamp();}
    catch(_){return null;}
  }

  function evento(t,accion,campo,extra){
    const ev=Object.assign({
      timestamp:marcaServidor(),     // fecha y hora del servidor, no del dispositivo
      ...usuarioActual(),
      area:typeof tareoAreaDe==='function'?tareoAreaDe(t):(t.area||''),
      tareoId:t.id||'',
      fechaTareo:t.fecha||'',
      turno:t.turno||'',
      trabajador:'',
      dni:'',
      accion,
      esCorreccion:esCorreccion(accion),
      campo:campo||'',
      estadoAnterior:null,
      estadoNuevo:null
    },extra||{});
    // Tareo bloqueado corregido por RRHH/Administrador (con motivo): acción propia.
    try{
      const b=typeof window.tareoBloqueoInfo==='function'?window.tareoBloqueoInfo(t):null;
      if(b&&b.bloqueado&&b.sesion&&!/^(INICIAR_|SOLICITAR_|ATENDER_|CONFIGURAR_|CREAR_)/.test(accion)){
        ev.accionOriginal=accion;
        ev.accion='EDITAR_TAREO_BLOQUEADO';
        ev.motivoCorreccion=b.motivo||'';
        ev.bloqueado=true;
        ev.esCorreccion=true;
      }
    }catch(_){/* sin módulo de bloqueo */}
    return ev;
  }

  /* REGISTRAR (primer valor) o EDITAR (corrección de un valor existente). */
  function accionValor(anterior,nuevo,nombre){
    const previo=anterior!==undefined&&anterior!==null&&String(anterior).trim()!==''&&norm(anterior)!=='pendiente';
    return (previo?'EDITAR_':'REGISTRAR_')+nombre;
  }

  function diferencias(t,antes,ahora){
    const lista=[];
    if(!antes){
      lista.push(evento(t,'CREAR_TAREO','tareo',{
        estadoNuevo:{personal:Object.keys(ahora.personal).length,estado:ahora.estado}
      }));
      return lista;
    }
    if(antes.estado!==ahora.estado){
      lista.push(evento(t,'CAMBIAR_ESTADO_TAREO','estado',{estadoAnterior:antes.estado||null,estadoNuevo:ahora.estado||null}));
    }
    Object.keys(ahora.personal).forEach(k=>{
      const n=ahora.personal[k],a=antes.personal[k];
      const quien={trabajador:n.nombre,dni:n.dni};
      if(!a){
        lista.push(evento(t,'AGREGAR_PERSONAL','personal',Object.assign({estadoNuevo:n.nombre},quien)));
        return;
      }
      // Solo se atribuye lo que ESTE dispositivo cambió: si la persona de la foto es más
      // reciente que la local, la diferencia viene de otro usuario/dispositivo (copia vieja).
      if(n.ts<a.ts)return;
      const cambia=(campo,nombre)=>{
        if(a[campo]===n[campo])return;
        lista.push(evento(t,accionValor(a[campo],n[campo],nombre),campo,
          Object.assign({estadoAnterior:a[campo]||null,estadoNuevo:n[campo]||null},quien)));
      };
      cambia('asistencia','ASISTENCIA');
      cambia('horaIngreso','INGRESO');
      cambia('salidaRefrigerio','REFRIGERIO');
      cambia('retornoRefrigerio','REFRIGERIO');
      if(n.nEdSalida>a.nEdSalida){
        // Mantenimiento corrigió la salida de un maquinista (queda el motivo).
        const ed=n.ultimaEd||{};
        lista.push(evento(t,'EDITAR_SALIDA_MTTO','horaSalida',Object.assign({
          estadoAnterior:a.horaSalida||ed.horaAnterior||null,estadoNuevo:n.horaSalida||null,
          motivo:ed.motivo||'',editadaPor:ed.usuarioNombre||ed.usuario||''},quien)));
      }else{
        cambia('horaSalida','SALIDA');
      }
      if(!a.vista&&n.vista&&n.nEdSalida===a.nEdSalida)
        lista.push(evento(t,'SALIDA_VISTA','salidaVista',Object.assign({estadoNuevo:n.horaSalida||null},quien)));
      if(a.trabajoEnDescanso!==n.trabajoEnDescanso)
        lista.push(evento(t,'TRABAJO_EN_DESCANSO','trabajoEnDescanso',Object.assign({estadoAnterior:a.trabajoEnDescanso,estadoNuevo:n.trabajoEnDescanso},quien)));
    });
    Object.keys(antes.personal).forEach(k=>{
      if(!ahora.personal[k]){
        const a=antes.personal[k];
        lista.push(evento(t,'QUITAR_PERSONAL','personal',{trabajador:a.nombre,dni:a.dni,estadoAnterior:a.nombre}));
      }
    });
    Object.keys(ahora.porDia).forEach(id=>{
      const n=ahora.porDia[id],a=antes.porDia[id];
      if(!a&&!n.quitada)
        lista.push(evento(t,'AGREGAR_POR_DIA','personalPorDia',{trabajador:n.nombre,dni:n.dni,estadoNuevo:n.nombre}));
      else if(a&&!a.quitada&&n.quitada)
        lista.push(evento(t,'QUITAR_POR_DIA','personalPorDia',{trabajador:n.nombre,dni:n.dni,estadoAnterior:n.nombre}));
    });
    Object.keys(antes.porDia).forEach(id=>{
      if(!ahora.porDia[id]&&!antes.porDia[id].quitada)
        lista.push(evento(t,'QUITAR_POR_DIA','personalPorDia',{trabajador:antes.porDia[id].nombre,dni:antes.porDia[id].dni,estadoAnterior:antes.porDia[id].nombre}));
    });
    return lista;
  }

  /* Escritura: nunca lanza, nunca bloquea; si falla, solo avisa en consola. */
  function registrar(ev){
    try{
      if(window.__vistaComo||typeof db==='undefined')return;
      const clave=[ev.tareoId,ev.dni||ev.trabajador,ev.accion,ev.campo,JSON.stringify(ev.estadoAnterior),JSON.stringify(ev.estadoNuevo)].join('|');
      const t=Date.now();
      if(recientes.has(clave)&&t-recientes.get(clave)<TTL_DUPLICADO_MS)return;
      recientes.set(clave,t);
      if(recientes.size>2000){
        for(const [k,v] of recientes){if(t-v>TTL_DUPLICADO_MS)recientes.delete(k);}
      }
      // undefined no es válido en Firestore; la marca del servidor se conserva tal cual.
      const limpio={};
      Object.keys(ev).forEach(k=>{
        const v=ev[k];
        limpio[k]=v===undefined?null:(k==='timestamp'?v:JSON.parse(JSON.stringify(v===undefined?null:v)));
      });
      Promise.resolve(db.collection(COLECCION).add(limpio)).catch(e=>
        console.warn('Auditoría de tareos: no se pudo registrar '+ev.accion+':',e&&e.message?e.message:e));
    }catch(e){
      console.warn('Auditoría de tareos: no se pudo registrar',e&&e.message?e.message:e);
    }
  }

  function auditar(t){
    try{
      if(!sembrada||!t||!t.id||!state.user||window.__vistaComo)return;
      const antes=base.get(t.id);
      const ahora=foto(t);
      base.set(t.id,ahora);
      diferencias(t,antes,ahora).slice(0,MAX_EVENTOS_POR_GUARDADO).forEach(registrar);
    }catch(e){
      console.warn('Auditoría de tareos:',e&&e.message?e.message:e);
    }
  }

  /* ---------- enganches (no cambian el comportamiento de los originales) ---------- */
  if(typeof guardarTareoEnMemoria==='function'){
    const original=guardarTareoEnMemoria;
    guardarTareoEnMemoria=function(tareo){
      const r=original.apply(this,arguments);
      try{
        // Si el original no tenía permiso para guardar, no se audita nada.
        if(tareo&&typeof tareoAutorizadoEscribir==='function'&&tareoAutorizadoEscribir(tareo))auditar(tareo);
      }catch(e){console.warn('Auditoría de tareos:',e&&e.message||e);}
      return r;
    };
    window.guardarTareoEnMemoria=guardarTareoEnMemoria;
  }

  // La edición de salida de maquinistas (Mantenimiento) guarda con su propia transacción.
  if(typeof tareoGuardarSalidaMaquinista==='function'){
    const original=tareoGuardarSalidaMaquinista;
    tareoGuardarSalidaMaquinista=async function(tareoId){
      const r=await original.apply(this,arguments);
      try{
        const t=obtenerTareos().find(x=>x.id===tareoId);
        if(t)auditar(t);
      }catch(e){console.warn('Auditoría de tareos:',e&&e.message||e);}
      return r;
    };
    window.tareoGuardarSalidaMaquinista=tareoGuardarSalidaMaquinista;
  }

  if(typeof eliminarTareo==='function'){
    const original=eliminarTareo;
    eliminarTareo=async function(id){
      let antes=null;
      try{
        const t=obtenerTareos().find(x=>x.id===id);
        if(t)antes={t,resumen:{estado:t.estado||'',personal:(t.personal||[]).length}};
      }catch(_){/* sin datos previos */}
      const r=await original.apply(this,arguments);
      try{
        if(antes&&!obtenerTareos().some(x=>x.id===id)){
          base.delete(id);
          registrar(evento(antes.t,'ELIMINAR_TAREO','tareo',{estadoAnterior:antes.resumen}));
        }
      }catch(e){console.warn('Auditoría de tareos:',e&&e.message||e);}
      return r;
    };
    window.eliminarTareo=eliminarTareo;
  }

  // Lo que llega de Firestore (cambios de otros usuarios o dispositivos) pasa a ser el
  // punto de partida. Se renueva ANTES de ejecutar los demás avisos, porque algunos
  // pueden guardar el tareo al refrescarse y eso no debe atribuir cambios ajenos.
  if(typeof onTareosUpdated==='function'){
    const original=onTareosUpdated;
    onTareosUpdated=function(){
      sembrar();
      return original.apply(this,arguments);
    };
    window.onTareosUpdated=onTareosUpdated;
  }
  // Por si los tareos ya estaban cargados cuando se cargó este archivo.
  try{if(typeof obtenerTareos==='function'&&obtenerTareos().length)sembrar();}catch(_){/* aún no hay datos */}

  window.tareoAuditoriaEvento=evento;        // para 41-tareo-bloqueo.js (solicitudes, correcciones)
  window.tareoAuditoriaRegistrar=registrar;
  window.tareoAuditarCambios=auditar;   // para pruebas: tareoAuditarCambios(tareo)
})();
