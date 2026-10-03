/* =============================================================
   GLACIAL · TAREO — AUDITORÍA (colección auditoriaTareos)
   -------------------------------------------------------------
   Registra, sin tocar la lógica de 13-tareo.js, quién cambió qué en un tareo.
   Cada evento es un documento NUEVO en auditoriaTareos (solo crear; las reglas
   impiden editar o borrar). Se ve en RRHH → Auditoría.

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
     (y los de 41-tareo-bloqueo.js: EDITAR_TAREO_BLOQUEADO, solicitudes...)
   REGISTRAR_* = primer valor (de vacío/PENDIENTE a un valor).
   EDITAR_*    = corrección de un valor que ya existía.
   Cada evento lleva esCorreccion (true/false), la fecha y hora DEL SERVIDOR
   (serverTimestamp), el usuario y su uid de Firebase (las reglas exigen
   uid == request.auth.uid).

   CÓMO SE ATRIBUYE UN CAMBIO (sin depender de relojes ni de otros equipos):
   cada acción del usuario (editar una persona, marcar salida vista, agregar
   por día, etc.) se envuelve: se toma una foto del tareo LOCAL justo ANTES de
   la acción y otra en SU guardado, y solo se compara esa pareja. Lo que llegue
   de otros usuarios o dispositivos, las sincronizaciones automáticas con la
   rotación y los guardados disparados por refrescos de pantalla nunca entran
   en la comparación, así que no se registran a nombre de quien guarda ni se
   pierde un evento propio por tener el reloj del equipo atrasado.

   Si registrar un evento falla, NO bloquea el guardado del tareo: solo avisa
   en la consola. No registra nada en el modo "Ver como".

   Cargar DESPUÉS de 13-tareo.js, 26-rrhh-panel.js y 42-tareo-agregar-personal.js;
   antes de 41-tareo-bloqueo.js y 12-init.js.
   ============================================================= */
(function instalarAuditoriaTareos(){
  'use strict';

  const COLECCION='auditoriaTareos';
  const MAX_EVENTOS_POR_ACCION=200;
  const TTL_DUPLICADO_MS=120000;

  const recientes=new Map();   // clave de evento → instante (evita duplicados)
  let accionActiva=null;       // {id, antes, ahora, ref, clave, ...} de la acción del usuario en curso

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
      const ids=typeof tareoIdentidades==='function'?tareoIdentidades(p):[];
      personal[clavePersona(p)]={
        nombre:p.nombre||'',dni:p.dni||'',
        claves:ids.concat(typeof tareoClavePersona==='function'?[String(tareoClavePersona(p))]:[]),
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
        if(!a&&!n.quitada)
          lista.push(evento(t,'AGREGAR_POR_DIA','personalPorDia',{trabajador:n.nombre,dni:n.dni,estadoNuevo:n.nombre}));
        else if(a&&!a.quitada&&n.quitada)
          lista.push(evento(t,'QUITAR_POR_DIA','personalPorDia',{trabajador:n.nombre,dni:n.dni,estadoAnterior:n.nombre}));
      });
    }
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
      if(act.soloCrear&&act.antes)return;                 // abrir un tareo ya existente: lo demás es automático
      if(!act.antes&&!act.permiteCrear)return;
      diferencias(t,act.antes,act.ahora,act.clave).slice(0,MAX_EVENTOS_POR_ACCION).forEach(registrar);
    }catch(e){
      console.warn('Auditoría de tareos:',e&&e.message?e.message:e);
    }
  }

  /* El primer guardado dentro de la acción es el de la acción; los posteriores
     (sincronizaciones automáticas al redibujar) no cuentan. */
  if(typeof guardarTareoEnMemoria==='function'){
    const original=guardarTareoEnMemoria;
    guardarTareoEnMemoria=function(tareo){
      const r=original.apply(this,arguments);
      try{
        const a=accionActiva;
        if(a&&!a.ahora&&tareo&&(a.id===undefined||a.id===null||a.id===tareo.id)&&
           typeof tareoAutorizadoEscribir==='function'&&tareoAutorizadoEscribir(tareo)){
          a.ahora=foto(tareo);
          a.ref=tareo;
        }
      }catch(e){console.warn('Auditoría de tareos:',e&&e.message||e);}
      return r;
    };
    window.guardarTareoEnMemoria=guardarTareoEnMemoria;
  }

  /* Envuelve una acción del usuario.
     opciones: tareo(args) → tareo local antes de la acción; clave(args) → persona afectada;
               asincrona → la acción guarda por su cuenta (se lee la foto del caché al terminar);
               permiteCrear / soloCrear → acciones que pueden crear el tareo. */
  function envolver(nombre,opc){
    const original=window[nombre];
    if(typeof original!=='function'||original.__auditada)return;
    const nueva=function(){
      const args=Array.from(arguments);       // las funciones de opciones reciben la lista de argumentos
      let t=null,antes=null;
      try{t=opc.tareo?opc.tareo(args):null;antes=t?foto(t):null;}catch(_){/* sin tareo previo */}
      const act={id:t?t.id:undefined,antes,ahora:null,ref:t,
        clave:opc.clave?opc.clave(args):undefined,
        permiteCrear:!!opc.permiteCrear,soloCrear:!!opc.soloCrear};
      const previa=accionActiva;
      accionActiva=act;
      let r;
      try{r=original.apply(this,arguments);}
      catch(e){accionActiva=previa;throw e;}
      const cerrar=()=>{accionActiva=previa;procesar(act);};
      if(r&&typeof r.then==='function'){
        return r.then(v=>{
          try{
            if(opc.asincrona&&act.id){
              const cache=obtenerTareos().find(x=>x.id===act.id);
              if(cache){act.ahora=foto(cache);act.ref=cache;}
            }
          }catch(_){/* sin caché */}
          cerrar();return v;
        },e=>{accionActiva=previa;throw e;});
      }
      cerrar();
      return r;
    };
    nueva.__auditada=true;
    window[nombre]=nueva;
  }

  const actual=()=>typeof tareoObtenerActual==='function'?tareoObtenerActual():null;
  const claveArg=args=>args[0]===undefined?undefined:String(args[0]);

  envolver('tareoEditarPersona',{tareo:actual,clave:claveArg});
  envolver('tareoMarcarSalidaVista',{tareo:actual,clave:claveArg});
  envolver('tareoTrabajoEnDescanso',{tareo:actual,clave:claveArg});
  envolver('tareoAgregarPorDia',{tareo:actual});
  envolver('tareoQuitarPorDia',{tareo:actual});
  envolver('tareoAgregarPersonal',{tareo:actual});
  envolver('tareoGuardarSalidaMaquinista',{
    tareo:a=>obtenerTareos().find(x=>x.id===a[0])||null,clave:a=>a[1]===undefined?undefined:String(a[1]),asincrona:true});
  envolver('guardarTareoActual',{tareo:()=>tareoActualId?actual():null,permiteCrear:true});
  envolver('tareoAbrir',{
    tareo:a=>typeof tareoBuscar==='function'?tareoBuscar(a[0],a[1],normalizarTurno(a[2])||'Día'):null,
    permiteCrear:true,soloCrear:true});

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
          registrar(evento(antes.t,'ELIMINAR_TAREO','tareo',{estadoAnterior:antes.resumen}));
        }
      }catch(e){console.warn('Auditoría de tareos:',e&&e.message||e);}
      return r;
    };
    window.eliminarTareo=eliminarTareo;
  }

  window.tareoAuditoriaEvento=evento;        // para 41-tareo-bloqueo.js (solicitudes, correcciones)
  window.tareoAuditoriaRegistrar=registrar;
})();
