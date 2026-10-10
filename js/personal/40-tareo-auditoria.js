/* =============================================================
   GLACIAL · TAREO — AUDITORÍA (colección auditoriaTareos)
   -------------------------------------------------------------
   Registra, sin tocar la lógica de 13-tareo.js, quién cambió qué en un tareo.
   Cada evento es un documento NUEVO en auditoriaTareos (solo crear; las reglas
   impiden editar o borrar). Se ve en RRHH → Auditoría.

   INSTALACIÓN: las funciones se envuelven al INICIAR la app (cuando ya
   cargaron todos los scripts: DOMContentLoaded), no al cargar este archivo.
   Así el orden de los scripts no importa. tareoAuditoriaInstalar() es
   idempotente (también sirve para pruebas).

   Eventos (campo "accion"):
     CREAR_TAREO
     REGISTRAR_ASISTENCIA / EDITAR_ASISTENCIA
     REGISTRAR_INGRESO    / EDITAR_INGRESO
     REGISTRAR_REFRIGERIO / EDITAR_REFRIGERIO
     REGISTRAR_SALIDA     / EDITAR_SALIDA
     EDITAR_SALIDA_MTTO     Mantenimiento corrige la salida de un maquinista (con motivo)
     SALIDA_VISTA           el supervisor marca como vista una salida editada
     TRABAJO_EN_DESCANSO
     AGREGAR_PERSONAL / QUITAR_PERSONAL / MODIFICAR_PERSONAL (cargo, línea, nombre)
     AGREGAR_POR_DIA / QUITAR_POR_DIA
     REGISTRAR_INGRESO_POR_DIA / EDITAR_INGRESO_POR_DIA (y SALIDA, OBSERVACION, AREA)
     CAMBIAR_ESTADO_TAREO
     ELIMINAR_TAREO
     CAMBIO_NO_CLASIFICADO  red de seguridad: un guardado que no vino de ninguna acción
                            conocida ni de la sincronización (lleva el usuario, el
                            detalle de los cambios y de dónde se llamó)
     (y los de 41-tareo-bloqueo.js: EDITAR_TAREO_BLOQUEADO, solicitudes...)
   REGISTRAR_* = primer valor (de vacío/PENDIENTE a un valor).
   EDITAR_*    = corrección de un valor que ya existía.
   Cada evento lleva esCorreccion, la fecha y hora DEL SERVIDOR (serverTimestamp),
   el usuario y su uid de Firebase (las reglas exigen uid == request.auth.uid).

   CÓMO SE ATRIBUYE UN CAMBIO (sin depender de relojes ni de otros equipos):
   cada acción del usuario se envuelve: se toma una foto del tareo LOCAL justo
   ANTES de la acción y otra en SU guardado, y solo se compara esa pareja.
   Lo que llega de otros usuarios o equipos nunca entra en esa comparación.

   CAMBIOS AUTOMÁTICOS (usuario "SISTEMA"): las sincronizaciones con la rotación
   se envuelven aparte. Si quitan o modifican a una persona que YA tenía asistencia
   u horas, queda un evento con usuario SISTEMA (más "disparadoPor", la persona
   que abrió el tareo). Las altas automáticas sin datos no se registran.

   COBERTURA (funciones que guardan o modifican un tareo):
   ┌────────────────────────────────────┬──────────────────────────────────────────────┐
   │ tareoEditarPersona                 │ ENVUELTA (asistencia, ingreso, refrigerio,   │
   │  (y tareoMarcarAsistio,            │ salida; las demás pasan por ella)            │
   │  actualizarAsistenciaTareo, ...)   │                                              │
   │ tareoMarcarSalidaVista             │ ENVUELTA                                     │
   │ tareoTrabajoEnDescanso             │ ENVUELTA                                     │
   │ tareoAgregarPorDia / QuitarPorDia  │ ENVUELTA                                     │
   │ tareoEditarPorDia                  │ ENVUELTA (horas, observación, área)          │
   │ tareoAgregarPersonal (42)          │ ENVUELTA                                     │
   │ tareoGuardarSalidaMaquinista       │ ENVUELTA (async; transacción propia)         │
   │ guardarTareoActual                 │ ENVUELTA (configuración y creación)          │
   │ tareoAbrir                         │ ENVUELTA solo para CREAR_TAREO               │
   │ eliminarTareo                      │ ENVUELTA (ELIMINAR_TAREO)                    │
   │ tareoSincronizarConRotacion        │ ENVUELTA como SISTEMA                        │
   │ tareoSincronizarPersonalMantenim.  │ ENVUELTA como SISTEMA                        │
   │ tareoSincronizarMaquinistas        │ ENVUELTA como SISTEMA                        │
   │ guardarTareoEnMemoria (central)    │ RED DE SEGURIDAD → CAMBIO_NO_CLASIFICADO     │
   │ tareoGuardarEnNube                 │ EXCLUIDA: solo envía a Firestore lo que el   │
   │                                    │ guardado central ya tiene (no cambia datos)  │
   │ guardarTareos / saveTareos         │ EXCLUIDA salvo eliminarTareo (envuelta); los │
   │                                    │ demás usos son el respaldo sin Firestore y   │
   │                                    │ la migración única de tareos locales viejos  │
   │ tareoNormalizarRegistro            │ EXCLUIDA: normaliza al leer (ej. "Falta" →   │
   │  (dentro de obtenerTareos)         │ "Falta por justificar"); la foto compara con │
   │                                    │ el estado canónico para no verlo como cambio │
   │ recalcularPersonaTareo             │ EXCLUIDA: recalcula horas/tardanza derivadas │
   │                                    │ dentro de las acciones envueltas             │
   └────────────────────────────────────┴──────────────────────────────────────────────┘
   Otros archivos (20, 26, 27, 28, 29, 31, 32, 34, 38, 41) solo LEEN tareos.

   Si registrar un evento falla, NO bloquea el guardado del tareo: solo avisa
   en la consola. No registra nada en el modo "Ver como".
   ============================================================= */
(function instalarAuditoriaTareos(){
  'use strict';

  const COLECCION='auditoriaTareos';
  const MAX_EVENTOS_POR_ACCION=200;
  const MAX_CAMBIOS_EN_EVENTO=30;
  const TTL_DUPLICADO_MS=120000;

  const recientes=new Map();   // clave de evento → instante (evita duplicados)
  const base=new Map();        // tareoId → última foto conocida (solo para la red de seguridad)
  let accionActiva=null;       // {id, antes, ahora, ref, clave, sistema, ...}
  let instalada=false;

  const norm=t=>typeof tareoNormalizarTexto==='function'
    ? tareoNormalizarTexto(t)
    : String(t||'').trim().toLowerCase();
  const canonico=v=>typeof tareoEstadoCanonico==='function'?(tareoEstadoCanonico(v)||''):String(v||'');

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
      const ids=typeof tareoIdentidades==='function'?tareoIdentidades(p):[];
      personal[clavePersona(p)]={
        nombre:p.nombre||'',dni:p.dni||'',cargo:p.cargo||'',linea:p.linea||'',
        claves:ids.concat(typeof tareoClavePersona==='function'?[String(tareoClavePersona(p))]:[]),
        asistencia:canonico(p.asistencia),horaIngreso:p.horaIngreso||'',
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
      if(p&&p.id)porDia[p.id]={nombre:p.nombre||'',dni:p.dni||'',quitada:!!p.eliminada,
        horaIngreso:p.horaIngreso||'',horaSalida:p.horaSalida||'',observacion:p.observacion||'',area:p.area||''};
    });
    return {estado:t&&t.estado||'',area:t&&t.area||'',personal,porDia};
  }
  const tieneDatos=n=>!!(n&&(n.asistencia||n.horaIngreso||n.horaSalida||n.salidaRefrigerio||n.retornoRefrigerio));

  function sembrar(){
    try{obtenerTareos().forEach(t=>{if(t&&t.id)base.set(t.id,foto(t));});}
    catch(e){console.warn('Auditoría de tareos: no se pudo preparar',e&&e.message||e);}
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

  /* Diferencias entre dos fotos del MISMO tareo tomadas alrededor de una acción del usuario.
     claveFiltro: si la acción es sobre una persona concreta, solo se miran los cambios de ella. */
  function diferencias(t,antes,ahora,claveFiltro){
    const lista=[];
    if(!antes){
      lista.push(evento(t,'CREAR_TAREO','tareo',{
        estadoNuevo:{personal:Object.keys(ahora.personal).length,estado:ahora.estado}
      }));
      return lista;
    }
    const esDeLaAccion=n=>claveFiltro===undefined||(n.claves||[]).includes(String(claveFiltro));
    if(claveFiltro===undefined&&antes.estado!==ahora.estado){
      lista.push(evento(t,'CAMBIAR_ESTADO_TAREO','estado',{estadoAnterior:antes.estado||null,estadoNuevo:ahora.estado||null}));
    }
    Object.keys(ahora.personal).forEach(k=>{
      const n=ahora.personal[k],a=antes.personal[k];
      if(!esDeLaAccion(n))return;
      const quien={trabajador:n.nombre,dni:n.dni};
      if(!a){
        lista.push(evento(t,'AGREGAR_PERSONAL','personal',Object.assign({estadoNuevo:n.nombre},quien)));
        return;
      }
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
    if(claveFiltro===undefined){
      Object.keys(antes.personal).forEach(k=>{
        if(!ahora.personal[k]){
          const a=antes.personal[k];
          lista.push(evento(t,'QUITAR_PERSONAL','personal',{trabajador:a.nombre,dni:a.dni,estadoAnterior:a.nombre}));
        }
      });
      Object.keys(ahora.porDia).forEach(id=>{
        const n=ahora.porDia[id],a=antes.porDia[id];
        if(!a&&!n.quitada){
          lista.push(evento(t,'AGREGAR_POR_DIA','personalPorDia',{trabajador:n.nombre,dni:n.dni,estadoNuevo:n.nombre}));
        }else if(a&&!a.quitada&&n.quitada){
          lista.push(evento(t,'QUITAR_POR_DIA','personalPorDia',{trabajador:n.nombre,dni:n.dni,estadoAnterior:n.nombre}));
        }else if(a&&!n.quitada){
          const quien={trabajador:n.nombre,dni:n.dni};
          const campos=[['horaIngreso','INGRESO_POR_DIA'],['horaSalida','SALIDA_POR_DIA'],['observacion','OBSERVACION_POR_DIA'],['area','AREA_POR_DIA']];
          campos.forEach(([c,nombre])=>{
            if(a[c]===n[c])return;
            const accion=(c==='horaIngreso'||c==='horaSalida')?accionValor(a[c],n[c],nombre):'EDITAR_'+nombre;
            lista.push(evento(t,accion,c,Object.assign({estadoAnterior:a[c]||null,estadoNuevo:n[c]||null},quien)));
          });
        }
      });
    }
    return lista;
  }

  /* Cambios AUTOMÁTICOS de la sincronización con la rotación: usuario "SISTEMA".
     Solo cuentan las personas que ya tenían asistencia u horas; las altas sin datos no se registran. */
  function diferenciasSistema(t,antes,ahora){
    const lista=[];
    const real=usuarioActual();
    const sis=(accion,campo,extra)=>evento(t,accion,campo,Object.assign({
      usuario:'SISTEMA',usuarioNombre:'SISTEMA',automatico:true,disparadoPor:real.usuario,
      origen:'sincronización con la rotación'},extra));
    Object.keys(antes.personal).forEach(k=>{
      const a=antes.personal[k];
      if(!tieneDatos(a))return;
      const n=ahora.personal[k];
      const quien={trabajador:a.nombre,dni:a.dni};
      if(!n){
        lista.push(sis('QUITAR_PERSONAL','personal',Object.assign({
          estadoAnterior:{asistencia:a.asistencia||null,ingreso:a.horaIngreso||null,salida:a.horaSalida||null}},quien)));
        return;
      }
      const cambia=(campo,nombre)=>{
        if(a[campo]===n[campo])return;
        lista.push(sis(accionValor(a[campo],n[campo],nombre),campo,
          Object.assign({estadoAnterior:a[campo]||null,estadoNuevo:n[campo]||null},quien)));
      };
      cambia('asistencia','ASISTENCIA');cambia('horaIngreso','INGRESO');
      cambia('salidaRefrigerio','REFRIGERIO');cambia('retornoRefrigerio','REFRIGERIO');cambia('horaSalida','SALIDA');
      ['cargo','linea','nombre'].forEach(c=>{
        if(a[c]!==n[c])lista.push(sis('MODIFICAR_PERSONAL',c,Object.assign({estadoAnterior:a[c]||null,estadoNuevo:n[c]||null},quien)));
      });
    });
    Object.keys(ahora.personal).forEach(k=>{
      if(antes.personal[k])return;
      const n=ahora.personal[k];
      if(tieneDatos(n))lista.push(sis('AGREGAR_PERSONAL','personal',{trabajador:n.nombre,dni:n.dni,estadoNuevo:n.nombre}));
    });
    return lista;
  }

  /* Escritura: nunca lanza, nunca bloquea; si falla, solo avisa en consola. */
  function registrar(ev){
    try{
      if(window.__vistaComo||typeof db==='undefined')return;
      const clave=[ev.tareoId,ev.dni||ev.trabajador,ev.accion,ev.campo,JSON.stringify(ev.estadoAnterior),JSON.stringify(ev.estadoNuevo),ev.usuario,ev.cambios?JSON.stringify(ev.cambios):''].join('|');
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
        limpio[k]=v===undefined?null:(k==='timestamp'?v:JSON.parse(JSON.stringify(v)));
      });
      Promise.resolve(db.collection(COLECCION).add(limpio)).catch(e=>
        console.warn('Auditoría de tareos: no se pudo registrar '+ev.accion+':',e&&e.message?e.message:e));
    }catch(e){
      console.warn('Auditoría de tareos: no se pudo registrar',e&&e.message?e.message:e);
    }
  }

  /* Cierra una acción: compara la foto de ANTES con la de su guardado. */
  function procesar(act){
    try{
      if(!act||!act.ahora||!state.user||window.__vistaComo)return;
      const t=act.ref;
      if(!t)return;
      const idTareo=(act.id!==undefined&&act.id!==null)?act.id:t.id;
      if(idTareo)base.set(idTareo,act.ahora);
      if(act.sistema){
        if(!act.antes)return;                                    // alta del tareo: sin personas previas con datos
        diferenciasSistema(t,act.antes,act.ahora).slice(0,MAX_EVENTOS_POR_ACCION).forEach(registrar);
        return;
      }
      if(act.soloCrear&&act.antes)return;                        // abrir un tareo ya existente: lo demás es automático
      if(!act.antes&&!act.permiteCrear)return;
      diferencias(t,act.antes,act.ahora,act.clave).slice(0,MAX_EVENTOS_POR_ACCION).forEach(registrar);
    }catch(e){
      console.warn('Auditoría de tareos:',e&&e.message?e.message:e);
    }
  }

  /* Red de seguridad: un guardado que no pertenece a ninguna acción envuelta ni a la sincronización. */
  function origenLlamada(){
    try{
      const lineas=String(new Error().stack||'').split('\n').slice(1);
      const nombres=[];
      lineas.forEach(l=>{
        const m=/at\s+(?:async\s+)?([^\s(]+)\s*\(/.exec(l);
        if(m&&!/guardarTareoEnMemoria|redDeSeguridad|origenLlamada|nueva|Object\.<anonymous>|anonymous/.test(m[1]))nombres.push(m[1]);
      });
      return nombres.slice(0,4).join(' ← ')||'desconocido';
    }catch(_){return 'desconocido';}
  }
  function redDeSeguridad(t){
    try{
      if(!t||!t.id||!state.user||window.__vistaComo)return;
      const antes=base.get(t.id);
      const ahora=foto(t);
      base.set(t.id,ahora);
      const cambios=antes
        ? diferencias(t,antes,ahora).map(e=>({accion:e.accion,trabajador:e.trabajador||null,campo:e.campo||null,
            anterior:e.estadoAnterior===undefined?null:e.estadoAnterior,nuevo:e.estadoNuevo===undefined?null:e.estadoNuevo}))
        : [];
      if(antes&&!cambios.length)return;                          // guardado sin cambios auditables
      registrar(evento(t,'CAMBIO_NO_CLASIFICADO','tareo',{
        origen:origenLlamada(),
        detalle:antes?'Guardado fuera de una acción conocida':'Guardado de un tareo sin estado previo conocido',
        cambios:cambios.slice(0,MAX_CAMBIOS_EN_EVENTO),totalCambios:cambios.length}));
    }catch(e){console.warn('Auditoría de tareos (red de seguridad):',e&&e.message||e);}
  }

  /* Envuelve una acción del usuario o de la sincronización.
     opciones: tareo(args) → tareo local antes de la acción; clave(args) → persona afectada;
               asincrona → la acción guarda por su cuenta (se lee la foto del caché al terminar);
               permiteCrear / soloCrear → acciones que pueden crear el tareo; sistema → cambios automáticos. */
  function envolver(nombre,opc){
    const original=window[nombre];
    if(typeof original!=='function'||original.__auditada)return;
    const nueva=function(){
      const args=Array.from(arguments);       // las funciones de opciones reciben la lista de argumentos
      let t=null,antes=null;
      try{t=opc.tareo?opc.tareo(args):null;antes=t?foto(t):null;}catch(_){/* sin tareo previo */}
      const act={id:t?t.id:undefined,antes,ahora:null,ref:t,
        clave:opc.clave?opc.clave(args):undefined,
        permiteCrear:!!opc.permiteCrear,soloCrear:!!opc.soloCrear,sistema:!!opc.sistema};
      const previa=accionActiva;
      accionActiva=act;
      let r;
      try{r=original.apply(this,arguments);}
      catch(e){accionActiva=previa;throw e;}
      if(r&&typeof r.then==='function'){
        accionActiva=previa;                  // la parte síncrona ya terminó; no capturar guardados ajenos
        return r.then(v=>{
          try{
            if(opc.asincrona&&act.id){
              const cache=obtenerTareos().find(x=>x.id===act.id);
              if(cache){act.ahora=foto(cache);act.ref=cache;}
            }
          }catch(_){/* sin caché */}
          procesar(act);return v;
        },e=>{throw e;});
      }
      accionActiva=previa;
      procesar(act);
      return r;
    };
    nueva.__auditada=true;
    window[nombre]=nueva;
  }

  const actual=()=>typeof tareoObtenerActual==='function'?tareoObtenerActual():null;
  const claveArg=args=>args[0]===undefined?undefined:String(args[0]);
  const delArg0=args=>args[0]&&typeof args[0]==='object'?args[0]:null;

  function instalar(){
    if(instalada)return;
    instalada=true;
    window.__tareoAuditoriaInstalada=true;

    // Guardado central: la primera guardada de cada acción es la de la acción; el resto, red de seguridad.
    if(typeof window.guardarTareoEnMemoria==='function'&&!window.guardarTareoEnMemoria.__auditada){
      const original=window.guardarTareoEnMemoria;
      const central=function(tareo){
        const r=original.apply(this,arguments);
        try{
          if(tareo&&typeof tareoAutorizadoEscribir==='function'&&tareoAutorizadoEscribir(tareo)){
            const a=accionActiva;
            if(a&&!a.ahora&&(a.id===undefined||a.id===null||a.id===tareo.id)){
              a.ahora=foto(tareo);a.ref=tareo;
              if(tareo.id)base.set(tareo.id,a.ahora);
            }else{
              redDeSeguridad(tareo);
            }
          }
        }catch(e){console.warn('Auditoría de tareos:',e&&e.message||e);}
        return r;
      };
      central.__auditada=true;
      window.guardarTareoEnMemoria=central;
    }

    // Acciones del usuario
    envolver('tareoEditarPersona',{tareo:actual,clave:claveArg});
    envolver('tareoMarcarSalidaVista',{tareo:actual,clave:claveArg});
    envolver('tareoTrabajoEnDescanso',{tareo:actual,clave:claveArg});
    envolver('tareoAgregarPorDia',{tareo:actual});
    envolver('tareoQuitarPorDia',{tareo:actual});
    envolver('tareoEditarPorDia',{tareo:actual});
    envolver('tareoAgregarPersonal',{tareo:actual});
    // Quitar personal (45): la foto del tareo antes/después registra QUITAR_PERSONAL con usuario y hora del servidor.
    if(window.TareoEd&&!window.TareoEd.quitarPersonal.__auditada){
      const quitar=window.TareoEd.quitarPersonal;
      const envuelta=function(){
        const t=actual();const antes=t?foto(t):null;
        const act={id:t?t.id:undefined,antes,ahora:null,ref:t,clave:undefined,permiteCrear:false,soloCrear:false,sistema:false};
        const previa=accionActiva;accionActiva=act;
        try{quitar.apply(this,arguments);}finally{accionActiva=previa;}
        procesar(act);
      };
      envuelta.__auditada=true;window.TareoEd.quitarPersonal=envuelta;
    }
    envolver('tareoGuardarSalidaMaquinista',{
      tareo:a=>obtenerTareos().find(x=>x.id===a[0])||null,clave:a=>a[1]===undefined?undefined:String(a[1]),asincrona:true});
    envolver('guardarTareoActual',{tareo:()=>typeof tareoActualId!=='undefined'&&tareoActualId?actual():null,permiteCrear:true});
    envolver('tareoAbrir',{
      tareo:a=>typeof tareoBuscar==='function'?tareoBuscar(a[0],a[1],normalizarTurno(a[2])||'Día'):null,
      permiteCrear:true,soloCrear:true});

    // Sincronizaciones automáticas: usuario SISTEMA
    ['tareoSincronizarConRotacion','tareoSincronizarPersonalMantenimiento','tareoSincronizarMaquinistas']
      .forEach(n=>envolver(n,{tareo:delArg0,sistema:true}));

    if(typeof window.eliminarTareo==='function'&&!window.eliminarTareo.__auditada){
      const original=window.eliminarTareo;
      const nueva=async function(id){
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
      nueva.__auditada=true;
      window.eliminarTareo=nueva;
    }

    // Lo que llega de Firestore (otros usuarios/equipos) renueva el punto de partida de la red de
    // seguridad ANTES de que otros avisos puedan guardar el tareo.
    if(typeof window.onTareosUpdated==='function'&&!window.onTareosUpdated.__auditada){
      const original=window.onTareosUpdated;
      const nueva=function(){
        sembrar();
        return original.apply(this,arguments);
      };
      nueva.__auditada=true;
      window.onTareosUpdated=nueva;
    }
    sembrar();
  }

  window.tareoAuditoriaInstalar=instalar;
  window.tareoAuditoriaEvento=evento;        // para 41-tareo-bloqueo.js (solicitudes, correcciones)
  window.tareoAuditoriaRegistrar=registrar;

  // Se instala al iniciar la app, cuando ya cargaron TODOS los scripts (no según su orden de carga).
  if(typeof document==='undefined'||document.readyState!=='loading')instalar();
  else document.addEventListener('DOMContentLoaded',instalar);
})();
