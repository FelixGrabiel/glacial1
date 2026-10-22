/* GLACIAL · Estado de líneas por turno y presentación.
   Cargar DESPUÉS de 16-paletas.js, 17-modo-trabajo.js y 23-gerente-solo-lectura.js;
   ANTES de 12-init.js. Usa el documento existente sync/programaciones. */
(function instalarSemaforoActual(){
  'use strict';
  const MARGEN = 0.90; // Amarillo si real < 90% del ritmo nominal esperado.
  const MIN_INICIO = 10; // No marcar atraso en los primeros diez minutos.
  const MS_HORA = 3600000;
  const esc = s => escaparHtml(String(s ?? ''));
  /* Hora ESTIMADA DEL SERVIDOR (la misma que usa el bloqueo de tareos: relojServidor, ver
     41-tareo-bloqueo.js). Inicio y fin de cada parada, el cronómetro y el ratio la comparten,
     así que cambiar la hora del equipo no los distorsiona. Sin calibrar, usa la del equipo. */
  function ahoraServidor(){
    return typeof window.tareoAhoraServidor==='function' ? window.tareoAhoraServidor() : Date.now();
  }
  const presUI=(linea,marca,presentacion)=>
    typeof nombrePresentacionUI==='function'
      ? nombrePresentacionUI(linea,marca,presentacion)
      : String(presentacion || '—');
  const fechaLocal = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+
    '-'+String(d.getDate()).padStart(2,'0');
    // Nombres de pantalla de los bloques de las líneas (MAÑANA + INTERMEDIO / NOCHE), sin repetir el bloque.
  const bloquesTexto = ts => [...new Set((ts || []).map(t => GlacialIndicadores.nombreBloque(t,'pantalla')))].join(' · ');
  const turnoCodigo = t => t.key === 'MANANA' ? 'DÍA' :
    t.key === 'TARDE' ? 'INTERMEDIO' : 'NOCHE';
  // Turno vigente y día operativo: una sola función en el módulo de indicadores (hora del servidor, corte 07:00).
  const turnoVigente = () => GlacialIndicadores.turnoVigente(ahoraServidor());
  // Horario PRODUCTIVO del bloque (Día + Intermedio / Noche), tomado de la configuración (sync/configIndicadores → bloques).
  // Los horarios de tareo y asistencia (GlacialIndicadores.horarioTurno) no cambian.
  const bloqueCfg = () => typeof window.glacialBloquesConfig==='function' ? window.glacialBloquesConfig() : undefined;
  const horario = (fecha,turno) => GlacialIndicadores.horarioBloque(fecha,turno,bloqueCfg());
  const bloqueAhora = () => GlacialIndicadores.bloqueVigente(ahoraServidor(),bloqueCfg());
  const hhmmBloque = ms => new Date(ms).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false});
  // Turno para las pantallas de PRODUCCIÓN: el vigente de siempre, salvo que desde el inicio del bloque Noche (21:00) ya es NOCHE.
  // (El turno de tareo y asistencia, glacialTurnoVigente, no cambia.)
  const turnoProductivo = () => { const tv=turnoVigente(),b=bloqueAhora(); return (tv && b && b.bloque==='noche' && tv.turno!=='NOCHE') ? {...tv,turno:'NOCHE',fecha:b.fecha} : tv; };
  const textoFranja = b => 'Planta sin producción hasta las '+hhmmBloque(b.reanudaMs);
  window.glacialBloqueVigente = () => { try{ return bloqueAhora(); }catch(_){ return null; } };
  window.glacialEnFranjaSinProduccion = () => { try{ const b=bloqueAhora(); return !!(b && b.enFranja); }catch(_){ return false; } };
  /* Quién hizo la acción: el TÉCNICO identificado por PIN cuando se usa la cuenta compartida
     de Mantenimiento (37b-mantenimiento-identificacion.js); si no, el usuario de siempre. */
  function nombreOperador(){
    const tecnico=typeof window.mantNombreOperador==='function' ? window.mantNombreOperador() : null;
    return tecnico || state.user?.nombre || state.user?.username || 'Usuario';
  }

  /* Acciones de control de línea que quedan en bitacoraMantenimiento (solo crear).
     «INTERVENIR» es el botón existente «Intervención terminada» (estado LISTA). */
  const ACCIONES_BITACORA={detener:'DETENER',pausa:'PAUSAR',lista:'INTERVENIR',reanudar:'REANUDAR',
    // Lote 4 · Parte A: acciones de Producción sobre la programación/línea (CORREGIR_FIN se registra en corregirFinalizacion).
    iniciar:'INICIAR',finalizar:'FINALIZAR',cancelar:'CANCELAR',reabrir:'REABRIR',corregirInicio:'CORREGIR_INICIO',
    reactivar:'REABRIR'};   // reactivar una CANCELADA usa el evento REABRIR (la regla del servidor solo admite esas acciones) con tipoReabrir:'CANCELACION'
  const COLECCION_BITACORA='bitacoraMantenimiento';

  function datosQuienOpera(){
    const compartida=typeof esMantCompartido==='function' && esMantCompartido();
    const t=compartida && typeof window.mantTecnicoActivo==='function' ? window.mantTecnicoActivo() : null;
    let uid=null;
    try{uid=(typeof auth!=='undefined' && auth && auth.currentUser && auth.currentUser.uid) || null;}catch(_){/* sin sesión segura */}
    return {
      compartida,
      nombre:t ? t.nombre : (state.user?.nombre || state.user?.username || 'Usuario'),
      tecnicoId:t ? (t.workerId || null) : null,
      token:t ? (t.token || null) : null,
      identificadoPor:t ? (window.MANT_PIN_MODO==='functions' ? 'PIN_SERVIDOR' : 'PIN_LOCAL') : 'USUARIO',
      cuenta:state.user?.username || '',
      rol:state.user?.rol || '',
      uid
    };
  }

  /* ORIGEN del evento: PRODUCCION (supervisor / jefatura / administrador operando) o MANTENIMIENTO
     (cuenta compartida, técnicos, control operativo). Distingue quién actuó. */
  function origenDe(quien,x){
    if(quien&&quien.compartida)return 'MANTENIMIENTO';
    return quienControla(x.linea)==='supervisor'?'PRODUCCION':'MANTENIMIENTO';
  }
  function eventoBitacora(accionBit,quien,x,clave,estadoAnterior,op,extra){
    return Object.assign({
      timestamp:firebase.firestore.FieldValue.serverTimestamp(),   // hora del servidor
      uid:quien.uid,
      origen:origenDe(quien,x),
      accion:accionBit,
      tecnicoNombre:quien.nombre,                                  // nombre y apellido del técnico (no el de la cuenta)
      tecnicoId:quien.tecnicoId,
      identificadoPor:quien.identificadoPor,
      tokenPin:quien.token,
      cuenta:quien.cuenta,
      rol:quien.rol,
      linea:x.linea || '',
      fechaPlan:x.fecha || '',
      turno:x.turnoPlan || x.turno || '',
      marca:x.marca || '',
      presentacion:x.presentacion || '',
      claveProgramacion:clave,
      estadoAnterior:estadoAnterior || '',
      estadoNuevo:op?.estado || '',
      motivo:'',
      estandarMin:null,
      duracionMs:null
    },extra||{});
  }

  function quienControla(linea){
    const u=state.user;

    // Producción Actual puede mostrar controles operativos aunque el usuario
    // tenga el modo global "visualizar". La autorización real la determina
    // el permiso/rol correspondiente, no state.workMode.
    if(!u ||
       (typeof esGerenteSoloLectura==='function' && esGerenteSoloLectura(u)))return '';

    // IMPORTANTE: primero resolvemos los perfiles de Producción.
    // Un Supervisor/Jefatura/Admin puede tener también control_operativo_lineas;
    // ese permiso adicional NO debe degradarlo a "control" (Mantenimiento),
    // porque perdería Iniciar / Finalizar / Cancelar.
    // Aceptar los nombres de rol reales usados por Gestión de Usuarios.
    // Algunos perfiles se muestran/guardan como "Administrador del Sistema"
    // o "Supervisor de Producción". Antes no coincidían con las cadenas
    // estrictas "Administrador" / "Supervisor" y terminaban degradados a
    // control operativo, ocultando los controles propios de Producción.
    const rol=String(u.rol || '').trim().toLocaleLowerCase('es');
    const esAdminOJefatura=[
      'administrador',
      'administrador del sistema',
      'jefe de producción',
      'jefe de operaciones'
    ].includes(rol);
    const esSupervisorProduccion=[
      'supervisor',
      'supervisor de producción'
    ].includes(rol);

    // No depender únicamente del texto del rol. En Gestión de Usuarios el
    // Administrador puede tener todos los permisos aunque su etiqueta visible,
    // nombre o puesto sea distinta. El permiso `administracion` + `paletas`
    // identifica de forma estable a un perfil administrativo con capacidad
    // operativa completa en Producción Actual.
    const esAdministracionOperativa=
      tienePermiso('administracion') && tienePermiso('paletas');

    if((esAdminOJefatura || esAdministracionOperativa) && tienePermiso('paletas'))
      return 'supervisor';

    if(esSupervisorProduccion && tienePermiso('paletas') &&
       (!u.linea || u.linea===linea))return 'supervisor';

    // Mantenimiento u otro usuario autorizado conserva únicamente
    // Detener / Pausa / Reanudar / Intervención terminada.
    if(tienePermiso('control_operativo_lineas')) return 'control';

    return '';
  }
  window.glacialQuienControla=quienControla;   // 63-incidencias-no-produccion.js: quién puede informar el motivo de no producción
  // Da acceso al tablero a quienes tienen que registrar el estado.
  const permisoAnterior=tienePermiso;
  tienePermiso=function(permiso){
    if(permiso==='produccionActual' && state.user &&
       ((state.user.rol==='Supervisor' && tienePermiso('paletas')) ||
        (state.user.rol==='Mantenimiento' && tienePermiso('moduloMantenimiento'))))return true;
    return permisoAnterior.apply(this,arguments);
  };
  // DÍA e INTERMEDIO comparten UNA programación y su producción (el bloque); NOCHE mantiene la suya.
  // Cualquier consulta de Día o de Intermedio devuelve el programado y lo producido del BLOQUE completo (suma de las filas
  // DÍA e INTERMEDIO): al entrar Intermedio no se reinicia nada. Ya no existe la regla «si Día > 0».
  const resumenTurnosAnterior=resumenProgramacionCombinacionTurnos;
  window.glacialResumenPorTurno=resumenTurnosAnterior;           // detalle por turno (trazabilidad por supervisor)
  resumenProgramacionCombinacionTurnos=function(linea,fecha,turnos,marca,presentacion){
    const lista=Array.isArray(turnos) ? turnos : [turnos];
    const delDia=lista.some(t=>t==='DÍA' || t==='INTERMEDIO');
    if(!delDia)return resumenTurnosAnterior.apply(this,arguments);
    const efectivos=[...new Set([...lista.filter(t=>t==='NOCHE'),'DÍA','INTERMEDIO'])];
    const r=resumenTurnosAnterior(linea,fecha,efectivos,marca,presentacion);
    const dia=obtenerProgramacionPaleta(linea,fecha,'DÍA',marca,presentacion);
    return {...r,unidadesPorPaleta:num(dia && dia.unidadesPorPaleta) || r.unidadesPorPaleta};
  };
  const uppAnterior=unidadesPorPaletaActiva;
  unidadesPorPaletaActiva=function(linea,fecha,turno,marca,presentacion){
    const dia=turno==='INTERMEDIO'
      ? obtenerProgramacionPaleta(linea,fecha,'DÍA',marca,presentacion) : null;
    return dia && num(dia.unidadesPorPaleta)>0 ? num(dia.unidadesPorPaleta)
      : uppAnterior.apply(this,arguments);
  };
  const llave = (l,f,t,m,p) => claveProgramacionPaleta(l,f,t,m,p);

  // Producción de una presentación. Si el supervisor corrigió la finalización
  // (producción final), esa cifra manda; si no, la de Paletas.
  /* Producido vigente (módulo de indicadores): turno en curso → Paletas; turno cerrado → registro del turno.
     Si el turno cerrado no tiene registro, no se sustituye por Paletas: devuelve 0 y producidoSinRegistro(x) es true. */
  const quitarTilde=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
  // En la franja sin producción el bloque Día + Intermedio acaba de terminar: su producción sigue saliendo de Paletas
  // (el supervisor todavía no cierra el reporte), no de «sin registro».
  function produccionDesdePaletas(x){
    const bl=bloqueAhora();
    return turnoActivo(x.fecha,x.turno) || !!(bl && bl.enFranja && bl.fecha===x.fecha && GlacialIndicadores.claveBloque(x.turno)==='diaInter');
  }
  function registroDeTurno(x){
    let recs=[];try{recs=(typeof loadRecords==='function'?loadRecords():[])||[];}catch(_){recs=[];}
    const bloque=GlacialIndicadores.claveBloque(x.turno),marca=quitarTilde(x.marca),pres=quitarTilde(x.presentacion);
    // Día e Intermedio comparten reporte: se toman los registros de todo el bloque.
    const delTurno=recs.filter(r=>r&&r.linea===x.linea&&r.fecha===x.fecha&&GlacialIndicadores.claveBloque(r.turno)===bloque);
    if(!delTurno.length)return null;
    let suma=0;
    delTurno.forEach(r=>{
      const cuadros=typeof normalizarCuadros==='function'?normalizarCuadros(r):(r.cuadros||[]);
      cuadros.forEach(q=>{
        if(quitarTilde(q&&q.marca)===marca&&quitarTilde(q&&q.presentacion)===pres)suma+=num(q&&q.produccion&&q.produccion.efectiva);
      });
    });
    return suma;
  }
  function producidoVigenteDe(x){
    const paletas=num(resumenProgramacionCombinacionTurnos(
      x.linea,x.fecha,[x.turno],x.marca,x.presentacion).unidadesProducidas);
    const enCurso=produccionDesdePaletas(x);
    return GlacialIndicadores.produccionVigente({turnoEnCurso:enCurso,paletas,registro:enCurso?null:registroDeTurno(x)});
  }
  const producidoSinRegistro=x=>producidoVigenteDe(x)===null;
  function producidoDe(x){
    const v=producidoVigenteDe(x);
    return v===null?0:v;
  }

  function secuenciaPlanificada(linea,fecha,turnoPlan){
    const salida=[];
    (loadProgramaciones() || []).forEach(p=>{
      if(p.linea!==linea || p.fecha!==fecha || p.turno!==turnoPlan)return;
      (Array.isArray(p.tramosSecuencia) ? p.tramosSecuencia : []).forEach(t=>{
        salida.push({
          ...t,
          linea:p.linea,fecha:p.fecha,turno:p.turno,
          marca:p.marca,presentacion:p.presentacion,
          claveProgramacion:p.clave,
          cantidadProgramada:num(p.cantidadProgramada)
        });
      });
    });
    return salida.sort((a,b)=>num(a.orden)-num(b.orden) || num(a.creadoEn)-num(b.creadoEn));
  }

  /* FECHA-OPERATIVA: instante de una hora HH:MM dentro de un turno de fecha operativa `fecha`.
     En NOCHE las horas anteriores a las 07:00 son del día siguiente (antes se armaban con la fecha del turno: 24 h antes). */
  function instanteDeTurno(fecha,hora,turno){
    if(window.GlacialFecha)return window.GlacialFecha.hhmmAMs(fecha,hora,turno);
    const [yy,mo,dd]=String(fecha).split('-').map(Number),[hh,mm]=String(hora).split(':').map(Number);
    return new Date(yy,mo-1,dd+(String(turno||'').toUpperCase().includes('NOCHE')&&hh<7?1:0),hh,mm,0,0).getTime();
  }

  function marcaTiempoCorte(fecha,hora,turno){
    if(!fecha || !/^\d{2}:\d{2}$/.test(String(hora || '')))return 0;
    const ms=turno ? instanteDeTurno(fecha,hora,turno) : new Date(fecha+'T'+hora+':00').getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  function producidoTramoSecuencia(t,turnoVista){
    return num(resumenProgramacionCombinacionTurnos(
      t.linea,t.fecha,[turnoVista],t.marca,t.presentacion
    ).unidadesProducidas);
  }

  function estadoSecuenciaLinea(linea,fecha,turnoPlan,turnoVista,ahora){
    const tramos=secuenciaPlanificada(linea,fecha,turnoPlan);
    if(!tramos.length)return null;

    let indiceActivo=tramos.length-1;

    for(let i=0;i<tramos.length;i++){
      const t=tramos[i];
      let terminado=false;

      if(t.tipoFin==='HORA'){
        const corte=marcaTiempoCorte(fecha,t.horaFin,turnoPlan);
        terminado=!!corte && ahora>=corte;
      }else if(t.tipoFin==='CANTIDAD'){
        const objetivo=num(t.cantidadObjetivo) || num(t.cantidadProgramada);
        terminado=objetivo>0 && producidoTramoSecuencia(t,turnoVista)>=objetivo;
      }else if(t.tipoFin==='CIERRE'){
        const r=horario(fecha,turnoVista,turnoPlan==='DÍA' && turnoVista==='INTERMEDIO');
        terminado=!!r && ahora>=r.fin;
      }

      if(!terminado){
        indiceActivo=i;
        break;
      }

      if(i===tramos.length-1)indiceActivo=-1;
    }

    return {tramos,indiceActivo,activo:indiceActivo>=0 ? tramos[indiceActivo] : null};
  }

  function aplicarEstadoVisualSecuencia(items,linea,fecha,turnoPlan,turnoVista,ahora){
    const sec=estadoSecuenciaLinea(linea,fecha,turnoPlan,turnoVista,ahora);
    if(!sec || !sec.tramos.length)return null;

    const claveCombo=t=>llave(t.linea,t.fecha,t.turno,t.marca,t.presentacion);
    const activoKey=sec.activo ? claveCombo(sec.activo) : '';
    // Una marca sin evidencia de inicio (ni estado operativo, ni hora de inicio) nunca arrancó. Producido = 0 NO decide: una marca iniciada puede no tener unidades.
    const sinIniciar=x=>(!x.op?.estado || x.op.estado==='PENDIENTE') && !num(x.op?.inicio);
    const cerradas=new Set(items.filter(x=>['FINALIZADA','CANCELADA'].includes(x.op?.estado))
      .map(x=>llave(x.linea,x.fecha,x.turnoPlan || x.turno,x.marca,x.presentacion)));
    // Próximo tramo válido: el siguiente de la secuencia (por tramo, no por marca) que no sea el activo ni esté finalizado/cancelado.
    const proximoKey=(()=>{
      if(sec.indiceActivo<0)return '';
      const itemActivo=items.find(x=>llave(x.linea,x.fecha,x.turnoPlan || x.turno,x.marca,x.presentacion)===activoKey);
      // Si la marca activa todavía no arrancó, ella es la próxima a producir y las demás esperan (PENDIENTE).
      if(!itemActivo || (sinIniciar(itemActivo) && !num(resumenProgramacionCombinacionTurnos(itemActivo.linea,itemActivo.fecha,[itemActivo.turno],itemActivo.marca,itemActivo.presentacion).unidadesProducidas)))return '';
      for(let i=sec.indiceActivo+1;i<sec.tramos.length;i++){
        const c=claveCombo(sec.tramos[i]);
        if(c!==activoKey && !cerradas.has(c))return c;
      }
      return '';
    })();

    items.forEach(x=>{
      if(['FINALIZADA','CANCELADA','DETENIDA','LISTA'].includes(x.op?.estado))return;

      const k=llave(x.linea,x.fecha,x.turnoPlan || x.turno,x.marca,x.presentacion);
      const indices=sec.tramos.map((t,i)=>claveCombo(t)===k ? i : -1).filter(i=>i>=0);
      if(!indices.length)return;

      if(activoKey && k===activoKey){
        // La secuencia indica cuál corresponde producir. Si además ya existen
        // unidades reales registradas para esta marca/presentación, se muestra
        // EN CURSO aunque estadoOperacion no haya sido iniciado manualmente.
        // Es únicamente visual: no se escribe ni inventa estadoOperacion.
        const producido=num(resumenProgramacionCombinacionTurnos(
          x.linea,x.fecha,[x.turno],x.marca,x.presentacion
        ).unidadesProducidas);
        // Si todavía no arrancó es la marca que sigue: PRÓXIMO A PRODUCIR (no inicia sola por hora ni por cantidad estimada).
        x.estadoVisual=(x.op?.estado==='EN_PRODUCCION' || producido>0)
          ? 'EN_PRODUCCION' : (sinIniciar(x) ? 'PROXIMO' : 'PENDIENTE');
        return;
      }

      if(sec.indiceActivo<0){
        x.estadoVisual='FINALIZADA';
        return;
      }

      const tuvoTramo=indices.some(i=>i<sec.indiceActivo);
      const tieneTramoFuturo=indices.some(i=>i>sec.indiceActivo);

      if(tuvoTramo && tieneTramoFuturo){
        // Producto repetido (p. ej. SCALA → BELLS → SCALA): no es una pausa real; es el próximo o sigue pendiente.
        x.estadoVisual=(k===proximoKey && sinIniciar(x)) ? 'PROXIMO' : 'PENDIENTE';
      }else if(tuvoTramo){
        x.estadoVisual='FINALIZADA';
      }else{
        x.estadoVisual=(k===proximoKey && sinIniciar(x)) ? 'PROXIMO' : 'PENDIENTE';
      }
    });

    return sec;
  }
  // Una sola clasificación para tarjetas, avances y semáforo de la línea.
  // El estado operativo persistido manda sobre la secuencia y las paletas.
  function estadoOrdenItem(x){
    const producido=Math.round(producidoDe(x));
    const programado=Math.round(progDe(x));
    const operativo=x.op?.estado || x.estadoVisual || 'PENDIENTE';
    if(operativo==='CANCELADA')return {key:'CANCELADA',label:'CANCELADA',rank:4,cls:'cancelada'};
    // Al llegar al objetivo, la marca está completada aunque el último
    // estado operativo guardado siga diciendo EN_PRODUCCION.
    if(operativo==='FINALIZADA' || (programado>0 && producido>=programado))
      return {key:'COMPLETADA',label:'COMPLETADA',rank:3,cls:'completada'};
    // La clave interna sigue siendo PAUSA (prioridades, contadores y controles no cambian); solo se distingue lo que ve el usuario.
    if(operativo==='DETENIDA')
      return {key:'PAUSA',label:'DETENIDA',rank:1,cls:'detenida'};
    // Pausa real (la registró el supervisor). Una PAUSA sin hora de inicio ni de pausa es un dato antiguo ambiguo: se conserva y se marca para revisión.
    if(operativo==='PAUSA' && !(Number(x.op?.inicio)>0) && !(Number(x.op?.pausaDesde)>0))
      return {key:'PAUSA',label:'EN PAUSA',rank:1,cls:'pausa',requiereRevision:true};
    if(['PAUSA','LISTA'].includes(operativo))
      return {key:'PAUSA',label:'EN PAUSA',rank:1,cls:'pausa'};
    if(operativo==='EN_PRODUCCION')
      return {key:'EN_CURSO',label:'EN CURSO',rank:0,cls:'curso'};

    // La secuencia manda sobre la producción: una marca ya identificada como la próxima (sin inicio) no está en curso aunque tenga unidades de un tramo anterior
    // (producto repetido). Producido = 0 nunca decide por sí solo.
    if(x.estadoVisual==='PROXIMO' && (!x.op?.estado || x.op.estado==='PENDIENTE') && !(Number(x.op?.inicio)>0))
      return {key:'PENDIENTE',label:'PRÓXIMO A PRODUCIR',rank:1.5,cls:'proximo',proximo:true};

    // Si existen unidades reales registradas y la presentación todavía no
    // alcanzó su programación, debe visualizarse EN CURSO aunque el supervisor
    // no haya pulsado "Iniciar presentación". Esto NO modifica estadoOperacion;
    // solo corrige el estado visual usando producción real.
    // FINALIZADA/CANCELADA/PAUSA/DETENIDA ya fueron resueltas arriba y conservan
    // prioridad, por lo que una marca cerrada nunca vuelve a abrirse por paletas.
    if(producido>0 && (programado<=0 || producido<programado))
      return {key:'EN_CURSO',label:'EN CURSO',rank:0,cls:'curso'};

    return {key:'PENDIENTE',label:'PENDIENTE',rank:2,cls:'pendiente'};
  }
  // ¿Está en producción el bloque de este turno? (en la franja sin producción no hay bloque activo)
  const turnoActivo = (fecha,turno) => {
    const b=bloqueAhora();return !!b && b.activo && b.fecha===fecha && b.bloque===GlacialIndicadores.claveBloque(turno);
  };
  // Programado del producto en el BLOQUE (suma Día + Intermedio, sin canceladas).
  const progDe=x=>x.programadoBloque!=null ? x.programadoBloque : num(x.prog?.cantidadProgramada);
  /* Lo programado del PRODUCTO mismo (suma de sus filas del bloque, también si está cancelado). El programado del bloque (progDe) no cuenta las canceladas para no
     inflar el plan; la tarjeta de un producto cancelado, en cambio, debe mostrar lo producido frente a lo que tenía programado y no «producido / 0». */
  function programadoPropio(x){
    const turnos=x.turno==='NOCHE' ? ['NOCHE'] : ['DÍA','INTERMEDIO'];
    return (loadProgramaciones() || []).reduce((s,p)=>s+((p && p.linea===x.linea && p.fecha===x.fecha && p.marca===x.marca &&
      p.presentacion===x.presentacion && turnos.includes(p.turno)) ? num(p.cantidadProgramada) : 0),0);
  }
  const progTarjeta=x=>x.op?.estado==='CANCELADA' ? (programadoPropio(x) || progDe(x)) : progDe(x);
  function estadoFila(l,f,t,m,p,ahora){
    // Fila de programación que lleva el ESTADO del bloque: la de Día si existe; si no, la de Intermedio. El programado
    // del bloque (suma de las filas) se calcula aparte con glacialProgramadoBloque. Noche tiene la suya.
    let prog=obtenerProgramacionPaleta(l,f,t,m,p),turnoPlan=t,compartida=false,filaBloque=!!prog;
    if(t!=='NOCHE'){
      const dia=obtenerProgramacionPaleta(l,f,'DÍA',m,p),inter=obtenerProgramacionPaleta(l,f,'INTERMEDIO',m,p);
      filaBloque=filaBloque || !!dia || !!inter;
      if(dia && num(dia.cantidadProgramada)>0){prog=dia;turnoPlan='DÍA';compartida=t==='INTERMEDIO';}
      else if(inter && num(inter.cantidadProgramada)>0){prog=inter;turnoPlan='INTERMEDIO';}
      // Fila del bloque sin cantidad todavía («Completar cantidad» pendiente de cierre): la misma fila para Día y para Intermedio.
      else if(!prog && (dia || inter)){prog=dia || inter;turnoPlan=dia ? 'DÍA' : 'INTERMEDIO';compartida=!!dia && t==='INTERMEDIO';}
    }
    const programadoBloque=typeof window.glacialProgramadoBloque==='function'
      ? window.glacialProgramadoBloque(l,f,t,{marca:m,presentacion:p}).cantidad : num(prog?.cantidadProgramada);
    // Del plan = tiene fila de programación en el bloque (aunque sea «Completar cantidad» con saldo por calcular). Sin fila, sus unidades son
    // PRODUCCIÓN FUERA DE PROGRAMACIÓN: se muestran aparte y no entran a la secuencia, al estado ni al cumplimiento del plan.
    // Día e Intermedio son un bloque: la fila fuera del plan usa la clave de Día para no contarse dos veces al consultar ambos turnos.
    const fueraPlan=!filaBloque && !(num(programadoBloque)>0);
    if(fueraPlan && t!=='NOCHE')turnoPlan='DÍA';
    const r=resumenProgramacionCombinacionTurnos(l,f,[t],m,p);
    const op=prog?.estadoOperacion;
    const actual=num(r.unidadesProducidas);
    const inicio=Number(op?.inicio || 0);
    const ratio=num(obtenerRatioNominal(l,p,m));
    const rango=horario(f,t,compartida);
    const vivo=turnoActivo(f,t);
    const pausa=Number(op?.pausaDesde || 0);
    const finOperacion=Number(op?.finalizadaEn || 0);
    const corteOperacion=finOperacion || ahora;
    // Los botones DETENER/PAUSA son estado de la línea: sus minutos ya no se descuentan aquí
    // (las paradas oficiales vienen de Avance/Cierre vía calcularTiemposLinea).
    const horas=inicio && rango ? Math.max(0,
      (Math.min(corteOperacion,rango.fin)-Math.max(inicio,rango.inicio))/MS_HORA) : 0;
    const esperado=ratio*horas;
    const desdeInicio=Math.max(0,actual-num(op?.baseUnidades));
    let nivel='gris',texto='Sin iniciar';
    if(!prog || !num(r.cantidadProgramada))texto='Sin programación';
    else if(!vivo)texto='Consulta histórica';
    else if(op?.estado==='DETENIDA'){nivel='roja';texto='Línea detenida';}
    else if(op?.estado==='PAUSA'){nivel='amarilla';texto='Pausa programada';}
    else if(op?.estado==='LISTA'){nivel='amarilla';texto='Lista para reanudar';}
    else if(op?.estado==='FINALIZADA'){nivel='verde';texto='Presentación finalizada';}
    else if(op?.estado==='CANCELADA')texto='Cancelado';
    else if(op?.estado==='EN_PRODUCCION' && ratio<=0){
      nivel='naranja';texto='Avanzando · ratio sin configurar';
    }
    else if(op?.estado==='EN_PRODUCCION' && horas*60<MIN_INICIO){
      nivel='naranja';texto='Avanzando · inicio';
    }
    else if(op?.estado==='EN_PRODUCCION'){
      // Sin estado «retrasado» por presentación: el estado se mantiene (en curso) y el desempeño
      // se evalúa a nivel de línea con el ratio de las paradas oficiales.
      nivel='naranja';texto='Avanzando';
    }
    return {linea:l,fecha:f,turno:t,turnoPlan,compartida,programadoBloque,fueraPlan,
      marca:m,presentacion:p,prog,op,
      nivel,texto,horas,ratio,esperado,real:desdeInicio,vivo,
      puede:quienControla(l)};
  }
  // Reactivar una presentación CANCELADA (por error) es exclusivo del Administrador.
  const esAdministradorPA=()=>!!state.user && (String(state.user.rol||'').trim()==='Administrador' || normalizarPermisosUsuario(state.user)==='todos');
  function puedeReabrirProduccion(){
    return !!state.user && tienePermiso('reabrirProduccion');
  }

  function acciones(x,idx){
    if(!x.prog || !num(x.prog.cantidadProgramada) || !x.puede)return '';

    const e=x.op?.estado;

    // Una operación ABIERTA debe poder controlarse aunque haya cambiado
    // el bloque horario/supervisor. Esto es necesario para continuidad
    // DÍA -> INTERMEDIO -> NOCHE y para que Mantenimiento pueda intervenir.
    const operacionAbierta=['EN_PRODUCCION','DETENIDA','LISTA','PAUSA'].includes(e);

    // Las operaciones abiertas conservan continuidad entre turnos.
    // Una producción FINALIZADA también puede reabrirse fuera del turno
    // vigente, siempre que el usuario tenga el permiso específico.
    const reaperturaAutorizada=e==='FINALIZADA' && puedeReabrirProduccion();
    // No ocultar controles solo porque la vista seleccionada no sea el turno operativo vigente.
    // Las operaciones abiertas mantienen continuidad y una programación pendiente puede
    // iniciarse con confirmación explícita si pertenece a otro turno.
    const inicioFueraTurnoAutorizado=(!e || e==='PENDIENTE') && x.puede==='supervisor';
    // Supervisor/administrador puede corregir una finalización aunque el turno ya terminó.
    const correccionAutorizada=e==='FINALIZADA' && x.puede==='supervisor';
    if(!x.vivo && !operacionAbierta && !reaperturaAutorizada && !correccionAutorizada && !inicioFueraTurnoAutorizado)return '';

    const boton=(accion,label)=>`<button type="button" class="btn btn-ghost btn-sm"
      data-pa-accion="${accion}" data-pa-indice="${idx}">${label}</button>`;
    const compl=(motivoPendienteAbierto(x.op) ? boton('completarMotivo','Completar motivo') : '')+
      (equipoPendienteAbierto(x.op) ? boton('indicarEquipo','Indicar equipo') : '');
    if(x.puede==='mtto' || x.puede==='control'){
      if(e==='EN_PRODUCCION'){
        return boton('detener','Detener línea')+
          boton('pausa','Pausa programada');
      }
      if(e==='DETENIDA'){
        return boton('lista','Intervención terminada')+
          boton('reanudar','Reanudar producción')+compl;
      }
      if(e==='LISTA' || e==='PAUSA'){
        return boton('reanudar','Reanudar producción')+compl;
      }
      return '';
    }
    if(e==='CANCELADA')return '';

    if(e==='FINALIZADA'){
      return (correccionAutorizada ? boton('corregir','Corregir finalización') : '') +
        (puedeReabrirProduccion() ? boton('reabrir','Reabrir línea') : '');
    }

    if(!e || e==='PENDIENTE')return boton('iniciar','Iniciar presentación')+
      boton('cancelar','✕ Cancelar');
    if(e==='DETENIDA' || e==='LISTA')return boton('corregirInicio','Corregir hora inicio')+
      boton('reanudar','Reanudar producción')+compl+boton('finalizar','Finalizar presentación')+
      boton('cancelar','✕ Cancelar');
    if(e==='PAUSA')return boton('corregirInicio','Corregir hora inicio')+
      boton('reanudar','Reanudar producción')+compl+boton('cancelar','✕ Cancelar');
    if(e==='EN_PRODUCCION')return boton('corregirInicio','Corregir hora inicio')+
      boton('detener','Detener línea')+boton('pausa','Pausa programada')+
      boton('finalizar','Finalizar presentación')+boton('cancelar','✕ Cancelar');
    return '';
  }
  function avisoAccion(x){
    if(!x.prog || !num(x.prog.cantidadProgramada))
      return 'Para iniciar, primero debe existir programación para esta línea, fecha, turno y presentación.';
    if(!x.vivo && (!x.op?.estado || x.op?.estado==='PENDIENTE') && x.puede==='supervisor')
      return 'Programación fuera del turno operativo vigente. Al iniciar se solicitará confirmación.';
    if((x.puede==='mtto' || x.puede==='control') && !x.op?.estado)
      return 'El supervisor inicia la presentación; Mantenimiento puede registrar la detención.';
    if(!x.puede)
      return 'Solo el supervisor asignado, Administrador o Jefatura puede iniciar esta presentación.';
    return '';
  }
  let filasActuales=[];
  function semaforo(x){return renderSemaforoWidget({nivel:x.nivel,texto:x.texto});}
  function claveProductoActivo(x){
    return [x.linea,x.marca,x.presentacion].join('||');
  }

  function ultimoProductoConProduccion(items){
    const candidatos=[];
    items.forEach(x=>{
      if(x.op?.estado==='CANCELADA' || x.op?.estado==='FINALIZADA')return;
      loadPaletas().forEach(r=>{
        if(r.linea!==x.linea || r.fecha!==x.fecha ||
           r.marca!==x.marca || r.presentacion!==x.presentacion)return;
        if(!(r.turno===x.turno || (x.compartida && ['DÍA','INTERMEDIO'].includes(r.turno))))return;

        const marcaTiempo=Number(r.actualizadoEn || r.creadoEn || 0);
        let orden=Number.isFinite(marcaTiempo) && marcaTiempo>0 ? marcaTiempo : 0;
        if(!orden){
          const hora=String(r.hora || '');
          if(/^\d{2}:\d{2}$/.test(hora)){
            orden=Number(hora.slice(0,2))*60+Number(hora.slice(3,5));
          }
        }
        candidatos.push({x,orden});
      });
    });
    if(!candidatos.length)return null;
    candidatos.sort((a,b)=>b.orden-a.orden);
    return candidatos[0].x;
  }

  /* Último registro de paletas de las presentaciones de una línea (ms; 0 si no hay). Solo lectura. */
  function ultimoPaletaMs(items){
    let ultimo=0;
    loadPaletas().forEach(r=>{
      if(!items.some(x=>r.linea===x.linea && r.fecha===x.fecha &&
        (r.turno===x.turno || (x.compartida && ['DÍA','INTERMEDIO'].includes(r.turno))) &&
        r.marca===x.marca && r.presentacion===x.presentacion))return;
      const t=Number(r.creadoEn || r.actualizadoEn || 0);
      if(t>ultimo)ultimo=t;
    });
    return ultimo;
  }
  /* Umbrales de color de la proyección: sync/configAlertas (46-proyeccion-avisos.js) o los de 23b. */
  function proyeccionUmbrales(){
    try{
      const c=typeof window.glacialConfigAlertas==='function' ? window.glacialConfigAlertas() : null;
      return c ? {verdePct:c.proyeccionVerdePct,ambarPct:c.proyeccionAmbarPct} : undefined;
    }catch(_){return undefined;}
  }
  /* Datos por presentación para la proyección (completado / en curso / pendiente / cancelado). Solo lectura. */
  function productosProyeccion(items){
    return items.map(x=>{
      const e=estadoOrdenItem(x).key;
      return {
        etiqueta:(x.marca||'')+' · '+presUI(x.linea,x.marca,x.presentacion),
        estado:e==='CANCELADA'?'CANCELADO':e==='COMPLETADA'?'COMPLETADO':(e==='EN_CURSO'||e==='PAUSA')?'EN_CURSO':'PENDIENTE',
        programado:x.op?.estado==='CANCELADA'?0:progDe(x),
        producido:producidoDe(x),
        velocidad:typeof window.glacialVelocidadEstandar==='function'?num(window.glacialVelocidadEstandar(x.linea,x.presentacion,x.marca)):0
      };
    });
  }
  /* Tarjeta de proyección de cierre del bloque. Mantiene el aspecto compacto de siempre (una franja con 4 datos en horizontal) y suma,
     sin cambiar el estilo, el estado (CUMPLIBLE / EN RIESGO / NO ALCANZABLE), el final estimado y el análisis. Todos los números
     salen de GlacialIndicadores.proyeccionCierre (45-indicadores.js). */
  function htmlProyeccion(p,porTurno){
    if(!p || p.estado==='SIN_PROYECCION')return '';
    const fmt=n=>(n==null || !Number.isFinite(n)) ? '—' : Math.round(n).toLocaleString('es-PE');
    const pct=v=>(v==null || !Number.isFinite(v)) ? '—' : v.toFixed(1)+' %';
    const hhmm=ms=>new Date(ms).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false});
    const dur=min=>{const m=Math.max(0,Math.round(min || 0));return m>=60 ? Math.floor(m/60)+' h '+String(m%60).padStart(2,'0')+' min' : m+' min';};
    const registrado=p.segunRegistradoMs ? hhmm(p.segunRegistradoMs) : hhmm(p.ahora);
    const chip=p.etiqueta ? '<span class="pa-proy-estado '+(p.nivel || 'gris')+'">'+esc(p.etiqueta)+'</span>' : '';
    let h='<div class="pa-proy '+(p.nivel || 'gris')+'">'+
      '<div class="pa-proy-top"><b>PROYECCIÓN DE CIERRE</b>'+chip+'<small>según lo registrado a las '+registrado+'</small></div>';
    let celdas=[];
    if(p.modo==='normal'){
      const dif=p.diferencia>=0 ? '<span class="pa-proy-dif sobra">sobrarían '+fmt(p.diferencia)+'</span>' : '<span class="pa-proy-dif falta">faltarían '+fmt(-p.diferencia)+'</span>';
      celdas.push('Si las paradas siguen igual: <b>'+fmt(p.siguenIgual)+' UND</b> ('+pct(p.pct)+') · '+dif);
      celdas.push('Sin más paradas: <b>'+(p.sinNuevas==null ? '—' : fmt(p.sinNuevas)+' UND')+'</b> ('+pct(p.pctSinNuevas)+')');
      celdas.push('Ritmo necesario: <b>'+(p.ritmoNecesario==null ? '—' : fmt(p.ritmoNecesario))+' UND/h</b> · ritmo actual (ratio): <b>'+(p.ritmoReal==null ? '—' : fmt(p.ritmoReal))+' UND/h</b>'+
        '<br><small>capacidad nominal '+(p.capacidadNominal==null ? '—' : fmt(p.capacidadNominal))+' UND/h · requiere el '+pct(p.requerimientoPct)+'</small>');
      celdas.push(p.finalEstimadoMs
        ? 'Final estimado: <b>'+hhmm(p.finalEstimadoMs)+'</b>'+(p.retrasoMin>0 ? ' · <span class="pa-proy-dif falta">'+p.retrasoMin+' min después del fin ('+hhmm(p.finObjetivoMs)+')</span>' : ' <small>(antes del fin, '+hhmm(p.finObjetivoMs)+')</small>')
        : 'Hora estimada: —');
    }else if(p.modo==='no_proyectable'){
      celdas.push('<b>No es posible proyectar todavía</b>: '+esc(p.motivo.charAt(0).toLowerCase()+p.motivo.slice(1)));
      celdas.push('Avance: <b>'+fmt(p.producido)+' / '+fmt(p.programado)+' UND</b> · faltan '+fmt(p.pendiente));
      celdas.push('Capacidad nominal: <b>'+(p.capacidadNominal==null ? '—' : fmt(p.capacidadNominal)+' UND/h')+'</b>'+(p.tiempoNominalMin==null ? '' : '<br><small>la meta pide '+dur(p.tiempoNominalMin)+' y quedan '+dur(p.restanteMin)+'</small>'));
      celdas.push(p.veredicto==='NO_ALCANZABLE' ? '<span class="pa-proy-dif falta">META NO ALCANZABLE EN EL TIEMPO RESTANTE</span>' : (p.cabeNominal ? 'A capacidad nominal la meta cabe en el tiempo restante.' : ''));
    }else if(p.modo==='terminado'){
      celdas.push('Resultado del bloque: <b>'+fmt(p.producido)+' de '+fmt(p.programado)+' UND</b> ('+pct(p.pct)+')');
      celdas.push(p.pendiente>0 ? '<span class="pa-proy-dif falta">faltaron '+fmt(p.pendiente)+'</span>' : '<span class="pa-proy-dif sobra">meta cumplida</span>');
    }else if(p.modo==='cumplida'){
      celdas.push('<span class="pa-proy-dif sobra">Meta cumplida</span>'+(p.horaCumplidaMs ? ' a las <b>'+hhmm(p.horaCumplidaMs)+'</b>' : '')+': <b>'+fmt(p.producido)+' / '+fmt(p.programado)+' UND</b>');
    }else if(p.modo==='falta_velocidad'){
      celdas.push(esc(p.motivo));
    }
    // Versión CORTA siempre visible (una línea): lo esencial de la proyección. El resto (ritmo, capacidad, análisis, notas) queda en «Ver detalle».
    const util=celdas.filter(Boolean);
    const cortas=p.modo==='normal' ? [util[0],util[3]] : p.modo==='no_proyectable' ? [util[0],util[1]] : util;
    const cortoHtml=cortas.filter(Boolean).join(' · ');
    const resto=p.modo==='normal' ? [util[1],util[2]] : p.modo==='no_proyectable' ? util.slice(2) : [];
    h+='<div class="pa-proy-corto">'+cortoHtml+'</div>';
    // análisis automático (mismos números) y avisos informativos
    const an=GlacialIndicadores.analisisProyeccion(p);
    (p.avisos || []).forEach(a=>{h+='<div class="pa-proy-nota">⚠ '+esc(a.texto)+'</div>';});
    let detalle='';
    if(resto.filter(Boolean).length)detalle+='<div class="pa-proy-grid">'+resto.filter(Boolean).map(c=>'<div>'+c+'</div>').join('')+'</div>';
    if(an)detalle+='<div class="pa-proy-an">'+esc(an)+'</div>';
    if(p.pausaPendienteMin>0)detalle+='<div class="pa-proy-nota info">Incluye descontar '+Math.round(p.pausaPendienteMin)+' min de pausas previstas aún no registradas.</div>';
    if(detalle)h+='<details class="pa-proy-det"><summary>Ver detalle de la proyección</summary>'+detalle+'</details>';
    // detalle por producto y producido por turno (desplegables)
    if((p.productos || []).length>1){
      const et={COMPLETADO:'completado',EN_CURSO:'en curso',PENDIENTE:'pendiente',CANCELADO:'cancelado'};
      h+='<details class="pa-proy-det"><summary>Detalle por producto</summary>'+p.productos.map(x=>
        '<div class="pa-proy-row"><span>'+esc(x.etiqueta)+' <small>('+(et[x.estado] || x.estado.toLowerCase())+')</small></span><b>'+fmt(x.producido)+' / '+fmt(x.programado)+'</b></div>').join('')+'</details>';
    }
    if(Array.isArray(porTurno) && porTurno.length){
      h+='<details class="pa-proy-det"><summary>Producido por turno dentro del bloque</summary>'+porTurno.map(f=>
        '<div class="pa-proy-row"><span>'+esc(f.etiqueta)+'</span><b>Mañana '+fmt(f.dia)+' · Intermedio '+fmt(f.inter)+'</b></div>').join('')+
        '<div class="pa-proy-nota info">Cada registro conserva su usuario, turno y hora. El ritmo y la proyección usan siempre el bloque completo.</div></details>';
    }
    return h+'</div>';
  }

  function ultimoRegistro(x){
    const registros=loadPaletas().filter(p=>p.linea===x.linea &&
      p.fecha===x.fecha && (p.turno===x.turno || (x.compartida && p.turno==='DÍA')) &&
      p.marca===x.marca && p.presentacion===x.presentacion);
    if(!registros.length)return 'Sin registros de paletas';
    const valorOrden=r=>{
      const marcaTiempo=Number(r.creadoEn || r.actualizadoEn);
      if(Number.isFinite(marcaTiempo) && marcaTiempo>0)return marcaTiempo;
      const hora=String(r.hora || '');
      return /^\d{2}:\d{2}$/.test(hora)
        ? Number(hora.slice(0,2))*60+Number(hora.slice(3,5)) : 0;
    };
    const ultimo=registros.reduce((a,b)=>valorOrden(b)>valorOrden(a)?b:a);
    const fechaRegistro=Number(ultimo.creadoEn || ultimo.actualizadoEn);
    const fechaValida=Number.isFinite(fechaRegistro) && fechaRegistro>0;
    const d=fechaValida ? new Date(fechaRegistro) : null;
    const hora=String(ultimo.hora || '').trim() || (d && !isNaN(d.getTime())
      ? String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0') : '—');
    return esc(hora)+' · '+num(ultimo.totalUnidades).toLocaleString('es-PE')+' UND';
  }
  function dibujarTablero(){
    if(state.currentTab!=='produccion-actual')return;
    const cont=document.getElementById('produccion-actual-resultados');
    if(!cont)return;
    const fecha=produccionActualFecha || fechaHoyPaletas();
    const turnos=turnosSeleccionadosProduccionActual();
    const ahora=ahoraServidor();
    const turnoReal=turnoProductivo();
    filasActuales=[];

    LINES.forEach(line=>{
      const turnosConDatos=new Set();
      combinacionesConDatosPaletas(line.key,fecha,
        turnos.includes('INTERMEDIO') && !turnos.includes('DÍA') ? ['DÍA',...turnos] : turnos)
        .forEach(combo=>turnos.forEach(turno=>{
          const x=estadoFila(line.key,fecha,turno,combo.marca,combo.presentacion,ahora);
          if(x.prog || num(resumenProgramacionCombinacionTurnos(line.key,fecha,[turno],
            combo.marca,combo.presentacion).unidadesProducidas)){
            filasActuales.push(x);turnosConDatos.add(turno);
          }
        }));
      const turnosVisibles=turnos.length===1 ? turnos :
        (fecha===turnoReal.fecha && turnos.includes(turnoReal.turno) ? [turnoReal.turno] : []);
      turnosVisibles.forEach(turno=>{
        if(turnosConDatos.has(turno))return;
        filasActuales.push({linea:line.key,fecha,turno,marca:'',presentacion:'',prog:null,op:null,
          nivel:'gris',texto:'Sin programación',ratio:0,real:0,vivo:turnoActivo(fecha,turno),
          puede:quienControla(line.key),sinDatos:true});
      });
    });

    cont.classList.add('pa-live-active');
    // Aviso de planta parada (franja sin producción) en lugar de líneas detenidas.
    cont.querySelectorAll('.pa-franja').forEach(e=>e.remove());
    const bFranja=bloqueAhora();
    if(bFranja && bFranja.enFranja && fecha===bFranja.fecha){
      const av=document.createElement('div');av.className='pa-franja';av.setAttribute('role','status');
      av.textContent=textoFranja(bFranja)+' · no hay proyección, alertas de línea ni minutos de parada en este tramo.';
      cont.insertBefore(av,cont.firstChild);
    }
    cont.querySelectorAll('.pl-semaforo-wrap,.pl-resumen-semaforo').forEach(e=>e.remove());
    cont.querySelector('.pl-kpis .pl-kpi:last-child .pl-semaforo-texto')?.remove();

    const tabla=cont.querySelector('table');
    if(tabla){
      const indice=new Map(filasActuales.map(x=>[llave(x.linea,x.fecha,x.turno,x.marca,x.presentacion),x]));
      const nombres=new Map(LINES.map(l=>[l.name,l.key]));
      tabla.querySelectorAll('tbody tr').forEach(tr=>{
        const td=tr.querySelectorAll('td');if(td.length<9)return;
        const linea=nombres.get(td[0].textContent.trim());
        const marca=td[1].textContent.trim(),pres=td[2].textContent.trim();
        const lista=turnos.map(t=>indice.get(llave(linea,fecha,t,marca,pres))).filter(Boolean);
        const elegido=lista.find(x=>x.nivel==='roja') || lista.find(x=>x.nivel==='naranja') || lista.find(x=>x.nivel==='amarilla' || x.nivel==='ambar') ||
          lista.find(x=>x.nivel==='verde') || lista[0];
        td[8].innerHTML=elegido ? renderSemaforoDot(elegido) : '—';
      });
    }

    /*
     ! IMPORTANTE: DÍA + INTERMEDIO comparten un bloque operativo.
     ! NOCHE SIEMPRE se construye como bloque independiente.
     * Esto evita mezclar programación, secuencia, producción y estados nocturnos
     * con la continuidad DÍA/INTERMEDIO cuando se consulta TODOS los turnos.
     */
    function construirGrupoTurno(line,candidatos,vacios,turnoFallback){
        const unicos=new Map();
        candidatos.forEach(x=>{
          const turnoPlan=x.turnoPlan || x.turno;
          const k=llave(x.linea,x.fecha,turnoPlan,x.marca,x.presentacion);
          const anterior=unicos.get(k);
          if(!anterior || x.turno==='INTERMEDIO' ||
             (x.vivo && !anterior.vivo))unicos.set(k,x);
        });
        // Solo los productos del plan forman la secuencia, el estado y el cumplimiento. Lo producido sin programación se conserva aparte
        // (GlacialIndicadores.produccionPlanYFuera): no se atribuye a otra marca ni se crea una programación ficticia con cero.
        const separado=GlacialIndicadores.produccionPlanYFuera([...unicos.values()].map(x=>({
          linea:x.linea,fecha:x.fecha,turno:x.turnoPlan || x.turno,marca:x.marca,presentacion:x.presentacion,
          enPlan:!x.fueraPlan,cancelada:x.op?.estado==='CANCELADA',programado:progDe(x),producido:producidoDe(x),fila:x})));
        const items=separado.plan.map(s=>s.fila);
        const fueraPlan=separado.fuera.map(s=>({...s.fila,producidoFuera:s.producido}));

        // Recalcular el estado visual en cada render. Un producto FINALIZADO
        // nunca debe volver a EN CURSO solo porque tenga registros de paletas.
        items.forEach(x=>{ delete x.estadoVisual; });
  
        const turnoVistaSecuencia=items[0]?.turno || turnoFallback;
        const turnoPlanSecuencia=items[0]?.turnoPlan || turnoVistaSecuencia;
        const secuenciaActiva=aplicarEstadoVisualSecuencia(
          items,line.key,fecha,turnoPlanSecuencia,turnoVistaSecuencia,ahora
        );
  
        // * 'vacios' llega filtrado por bloque operativo desde construirGrupoTurno().
        if(!items.length && !vacios.length && !fueraPlan.length)return null;
        const detenidos=items.filter(x=>x.op?.estado==='DETENIDA');
        const pausas=items.filter(x=>x.op?.estado==='PAUSA');
        const activosGuardados=items.filter(x=>x.op?.estado==='EN_PRODUCCION');
  
        // El estado operativo guardado tiene prioridad absoluta.
        // Los registros de paletas sirven para métricas, pero NO pueden volver
        // a abrir visualmente una presentación ya FINALIZADA.
        const activoSecuencia=items.find(x=>x.estadoVisual==='EN_PRODUCCION');
        const pausaSecuencia=items.find(x=>x.estadoVisual==='PAUSA_SECUENCIA');
        const activo=detenidos[0] ||
          activoSecuencia || pausas[0] || activosGuardados[0] ||
          items.find(x=>x.op?.estado==='LISTA') || pausaSecuencia ||
          items.find(x=>!['COMPLETADA','CANCELADA'].includes(estadoOrdenItem(x).key)) ||
          items[0] || vacios[0];
  
        const estados=items.map(estadoOrdenItem);
        const hayCompletada=estados.some(e=>e.key==='COMPLETADA');
        // Estado de la línea: prioridad única del módulo de indicadores (GlacialIndicadores.estadoLineaDesdeItems).
        // Diferencia con el resto de pantallas (que usan solo estadoLineaDesdeItems): aquí el estado de la tarjeta es el de la marca
        // EN CURSO, y una marca detenida sin finalizar se avisa aparte (GlacialIndicadores.desgloseLineaPorMarca).
        const desglose=GlacialIndicadores.desgloseLineaPorMarca(items.map((x,i)=>({
          marca:x.marca,presentacion:x.presentacion,estado:x.op?.estado==='DETENIDA'?'DETENIDA':estados[i].key,
          producido:producidoDe(x),programado:progDe(x),detenidaDesde:Number(x.op?.detenidaDesde || 0)})));
        const estadoLineaGrupo=desglose.estado;
        // El color del encabezado es el del ESTADO operativo de la línea (mapa único: 24a-estados-visuales.js): En curso naranja, pausa amarilla,
        // detenida roja, finalizada verde, pendiente gris. NO depende del ratio ni de la proyección (esas alertas van en su propio panel).
        const nivel=window.glacialEstadosVisuales.nivelDeEstadoLinea(estadoLineaGrupo);
        const texto=({DETENIDA:'Línea detenida',EN_CURSO:'En curso',PAUSA:'Pausa programada',CANCELADA:'CANCELADA',COMPLETADA:'FINALIZADA'})[estadoLineaGrupo]||
          (estadoLineaGrupo==='PENDIENTE'&&hayCompletada?'Pendiente':'Sin iniciar');
        const turnosLinea=[...new Set([...items,...vacios,...fueraPlan].map(x=>x.turno))];
        // totalProd = producción del PLAN (numerador del cumplimiento); totalFisico = lo que realmente salió de la línea (plan + fuera del plan).
        const totalProg=separado.totales.programado;
        const totalProd=separado.totales.producidoPlan;
        const totalFuera=separado.totales.producidoFuera;
        const totalFisico=separado.totales.producidoFisico;
        // Avance frente al estimado: «Todo el turno», «Tiempo restante» y «Hasta una hora» no son pedidos firmes.
        const esEstimado=x=>!!(window.glacialPlanificacion?.modos?.esTemporal && window.glacialPlanificacion.modos.esTemporal(x.prog));
        const vigentes=items.filter(x=>x.op?.estado!=='CANCELADA');
        const soloEstimado=vigentes.length>0 && vigentes.every(esEstimado);
        const conEstimado=vigentes.some(esEstimado);
  
        // PRODUCCIÓN TOTAL POR PRESENTACIÓN
        // ---------------------------------------------------------
        // No mezclar formatos físicos diferentes de una misma línea.
        // Varias marcas con la MISMA presentación sí se consolidan.
        // Ej.: Aro 380 ml + Bells 380 ml => un total de 380 ml.
        //      Aro 380 ml + Scala 1.5 L => dos totales independientes.
        const mapaTotalesPresentacion=new Map();
        items.forEach(x=>{
          // Un producto cancelado ya no suma programado, pero lo que produjo antes de cancelarse sí cuenta en el total de su presentación.
          const cancelado=x.op?.estado==='CANCELADA';
          if(cancelado && !(producidoDe(x)>0))return;
  
          const etiqueta=presUI(x.linea,x.marca,x.presentacion);
          const clave=String(etiqueta || x.presentacion || 'SIN PRESENTACIÓN')
            .trim()
            .toUpperCase();
  
          const producido=producidoDe(x);
          const programado=cancelado ? 0 : progDe(x);
  
          const actual=mapaTotalesPresentacion.get(clave) || {
            clave,
            etiqueta:etiqueta || x.presentacion || 'Sin presentación',
            producido:0,
            programado:0,
            marcas:new Set()
          };
  
          actual.producido+=producido;
          actual.programado+=programado;
          if(x.marca)actual.marcas.add(x.marca);
          mapaTotalesPresentacion.set(clave,actual);
        });
  
        const totalesPresentacion=[...mapaTotalesPresentacion.values()]
          .map(t=>({...t,marcas:[...t.marcas]}));
  
        // HORAS EFECTIVAS REALES DE LÍNEA
        // ---------------------------------------------------------
        // No se suman las horas de cada marca/presentación, porque
        // pertenecen a la MISMA línea y eso duplicaba/triplicaba el tiempo.
        //
        // Se construye una línea temporal con los intervalos efectivos de
        // cada presentación y se calcula la UNIÓN de esos intervalos.
        // El final de cada intervalo queda limitado por:
        //   1) finalizadaEn, si el supervisor finalizó la presentación;
        //   2) el fin programado del turno;
        //   3) la hora actual, mientras siga trabajando.
        //
        // De esta forma, un turno 07:00-18:30 nunca puede convertirse en
        // 36 horas por tener varias marcas dentro de la misma línea.
        const intervalosEfectivos=[];
  
        items.forEach(x=>{
          const inicio=Number(x.op?.inicio || 0);
          const rango=horario(x.fecha,x.turno,x.compartida);
          if(!inicio || !rango)return;
  
          const finalizadaEn=Number(x.op?.finalizadaEn || 0);
          const canceladaEn=Number(x.op?.canceladaEn || 0);
          const corteEstado=finalizadaEn || canceladaEn || ahora;
          const desde=Math.max(inicio,rango.inicio);
          const hasta=Math.min(corteEstado,rango.fin);
  
          if(hasta<=desde)return;
  
          // DETENER/PAUSA del semáforo son estado de la línea: no descuentan tiempo aquí (las paradas oficiales
          // se descuentan en calcularTiemposLinea).
          const descuento=0;

          // Para evitar sumar dos veces marcas de la misma línea, el intervalo
          // conserva solamente el tiempo efectivo que realmente aportó.
          const duracionEfectiva=Math.max(0,(hasta-desde)-descuento);
          if(duracionEfectiva>0){
            intervalosEfectivos.push({
              desde,
              hasta:desde+duracionEfectiva
            });
          }
        });
  
        intervalosEfectivos.sort((a,b)=>a.desde-b.desde);
  
        const unidos=[];
        intervalosEfectivos.forEach(actual=>{
          const ultimo=unidos[unidos.length-1];
          if(!ultimo || actual.desde>ultimo.hasta){
            unidos.push({...actual});
          }else{
            ultimo.hasta=Math.max(ultimo.hasta,actual.hasta);
          }
        });
  
        const horasEfectivas=unidos.reduce(
          (s,x)=>s+Math.max(0,x.hasta-x.desde),
          0
        )/MS_HORA;
  
        // RATIO TURNO
        // ---------------------------------------------------------
        // Producción acumulada / tiempo calendario transcurrido desde
        // que comenzó la primera presentación de la línea. Las paradas
        // y pausas NO se descuentan: precisamente deben impactar el ratio.
        const iniciosTurno=items
          .map(x=>Number(x.op?.inicio || 0))
          .filter(Boolean);
  
        const inicioTurnoLinea=iniciosTurno.length
          ? Math.min(...iniciosTurno)
          : 0;
  
        const rangosLinea=items
          .map(x=>horario(x.fecha,x.turno,x.compartida))
          .filter(Boolean);
  
        const finMaxLinea=rangosLinea.length
          ? Math.max(...rangosLinea.map(r=>r.fin))
          : ahora;
  
        const cierres=items
          .map(x=>Number(x.op?.finalizadaEn || x.op?.canceladaEn || 0))
          .filter(Boolean);
  
        const todosCerradosOperacion=items.length>0 && items.every(
          x=>['FINALIZADA','CANCELADA'].includes(x.op?.estado)
        );
  
        const corteTurnoLinea=todosCerradosOperacion && cierres.length
          ? Math.max(...cierres)
          : ahora;
  
        const horasTurno=inicioTurnoLinea
          ? Math.max(
              0,
              (Math.min(corteTurnoLinea,finMaxLinea)-inicioTurnoLinea)/MS_HORA
            )
          : 0;
  
        // El Ratio Turno se calcula más abajo con TIEMPO EFECTIVO:
        // tiempo transcurrido - paradas/pausas.
        // Esto evita inflar o distorsionar el indicador.
  
        // Tiempos y ratios: función central única (23b-tiempos-linea.js).
        // Considera SOLO las paradas oficiales del supervisor (Avance/Cierre); DETENER LÍNEA y PAUSA PROGRAMADA son estado, no parada.
        const turnoCalculo=items[0]?.turno || turnoFallback;
        const tiempos=calcularTiemposLinea(line.key,turnoCalculo,fecha,{ahora});
        // Ratio y rendimiento miden la LÍNEA (unidades físicas, incluida la producción fuera del plan; sin productos fuera del plan es lo mismo de
        // siempre). El ratio necesario, el desempeño y la proyección miden el PLAN: lo producido fuera del plan no cubre el pendiente de otra marca.
        const ratiosPlan=calcularRatiosLinea(tiempos,{produccion:totalProd,programado:totalProg,ahora});
        const ratiosFisicos=totalFuera>0 ? calcularRatiosLinea(tiempos,{produccion:totalFisico,programado:totalProg,ahora}) : ratiosPlan;
        const ratios={...ratiosPlan,ratioTurno:ratiosFisicos.ratioTurno,ratioEfectivo:ratiosFisicos.ratioEfectivo};
        // Paradas oficiales (programadas + no programadas) y horas efectivas del turno con ellas.
        const paradaMs=tiempos.ok ? (tiempos.minParadasNoProgramadas+tiempos.minPausasProgramadas)*60000 : 0;
        const horasEfectivasTurno=Math.max(0,horasTurno-(paradaMs/MS_HORA));
        const desempeno=evaluarDesempenoLinea(tiempos,ratios,{produccion:totalProd,programado:totalProg});
        const ratioTurno=ratios.ratioTurno ?? 0;
        // Proyección de cierre (23b-tiempos-linea.js): no cambia ratios ni minutos de parada.
        const proyeccion=proyectarCierreLinea(tiempos,ratios,{
          produccion:totalProd,programado:totalProg,ahora,productos:productosProyeccion(items),
          detenida:items.some(x=>['DETENIDA','LISTA'].includes(x.op?.estado)),
          ultimoRegistroMs:ultimoPaletaMs(items)
        },proyeccionUmbrales());
        const nivelEstado=nivel;
        // Causa del encabezado rojo con «En curso»: antes aquí se tomaba el nivel del DESEMPEÑO (ratio frente al necesario) para pintar la luz.
        // Ahora la luz y la etiqueta usan el estado; el desempeño se conserva aparte (nivelDesempeno) y lo muestra el panel de proyección.
        const nivelFinal=nivelEstado;
        // Franja sin producción (entre el fin de Día + Intermedio y el inicio de Noche): no hay línea «detenida», hay planta parada.
        const bFr=bloqueAhora();
        const enFranja=!!(bFr && bFr.enFranja && fecha===bFr.fecha && GlacialIndicadores.claveBloque(turnoCalculo)==='diaInter' &&
          !['COMPLETADA','CANCELADA'].includes(estadoLineaGrupo));
        const textoFinal=enFranja ? textoFranja(bFr) : texto;
        // Trazabilidad: lo producido en cada turno (cada supervisor) dentro del bloque Día + Intermedio. No cambia ningún cálculo del bloque.
        const porTurno=(()=>{
          if(GlacialIndicadores.claveBloque(turnoCalculo)!=='diaInter' || typeof window.glacialResumenPorTurno!=='function')return null;
          const vistos=new Set(),filas=[];
          items.forEach(x=>{
            const k=x.marca+'||'+x.presentacion;if(vistos.has(k))return;vistos.add(k);
            const d=num(window.glacialResumenPorTurno(x.linea,x.fecha,['DÍA'],x.marca,x.presentacion).unidadesProducidas);
            const i=num(window.glacialResumenPorTurno(x.linea,x.fecha,['INTERMEDIO'],x.marca,x.presentacion).unidadesProducidas);
            filas.push({etiqueta:(x.marca||'')+' · '+presUI(x.linea,x.marca,x.presentacion),dia:d,inter:i});
          });
          return filas.some(f=>f.dia>0 || f.inter>0) ? filas : null;
        })();

        return {
          line,items,vacios,activo,nivel:enFranja ? 'gris' : nivelFinal,nivelEstado,nivelDesempeno:desempeno.nivel,texto:textoFinal,enFranja,porTurno,turnosLinea,totalProg,totalProd,desglose,
          fueraPlan,totalFuera,totalFisico,soloEstimado,conEstimado,esEstimado,
          horasEfectivas:tiempos.ok?tiempos.tiempoOperativoMin/60:horasEfectivas,horasTurno,horasEfectivasTurno,ratioTurno,paradaMs,secuenciaActiva,
          totalesPresentacion,tiempos,ratios,desempeno,proyeccion
        };
    }

    const grupos=LINES.flatMap(line=>{
      const candidatosLinea=filasActuales.filter(x=>x.linea===line.key && !x.sinDatos);
      const vaciosLinea=filasActuales.filter(x=>x.linea===line.key && x.sinDatos);

      const bloques=[];

      // * Bloque compartido DÍA + INTERMEDIO.
      const candidatosDiaInter=candidatosLinea.filter(x=>
        (x.turnoPlan || x.turno)==='DÍA' ||
        ((x.turnoPlan || x.turno)==='INTERMEDIO' && x.turno!=='NOCHE')
      );
      const vaciosDiaInter=vaciosLinea.filter(x=>['DÍA','INTERMEDIO'].includes(x.turno));
      if(candidatosDiaInter.length || vaciosDiaInter.length){
        const fallbackDiaInter=turnos.includes('INTERMEDIO') ? 'INTERMEDIO' : 'DÍA';
        const grupo=construirGrupoTurno(line,candidatosDiaInter,vaciosDiaInter,fallbackDiaInter);
        if(grupo)bloques.push(grupo);
      }

      // ! NOCHE: programación, secuencia, producción y estado propios.
      const candidatosNoche=candidatosLinea.filter(x=>
        (x.turnoPlan || x.turno)==='NOCHE' || x.turno==='NOCHE'
      );
      const vaciosNoche=vaciosLinea.filter(x=>x.turno==='NOCHE');
      if(candidatosNoche.length || vaciosNoche.length){
        const grupo=construirGrupoTurno(line,candidatosNoche,vaciosNoche,'NOCHE');
        if(grupo)bloques.push(grupo);
      }

      return bloques;
    });

    // VISIBILIDAD Y PRIORIDAD DE TARJETAS
    // Supervisor: ve todas las líneas; las activas/detenidas/pausa primero.
    // Perfiles de consulta: ven únicamente líneas con operación activa.
    const textoPerfil=[
      state.user?.rol || '',
      state.user?.puesto || '',
      state.user?.cargo || ''
    ].join(' ');
    const perfilNormalizado=(typeof normalizarTexto==='function'
      ? normalizarTexto(textoPerfil)
      : textoPerfil.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''));
    // Supervisor, Administrador y Jefaturas de Producción/Operaciones deben
    // visualizar todas las tarjetas del tablero. Los perfiles únicamente de
    // consulta conservan el filtro de líneas con operación activa.
    const esSupervisor=/\bsupervisor\b/.test(perfilNormalizado);
    const esAdministrador=
      state.user?.rol==='Administrador' ||
      (tienePermiso('administracion') && tienePermiso('paletas'));
    const esJefaturaProduccion=['Jefe de Producción','Jefe de Operaciones'].includes(state.user?.rol);
    const esMantenimientoCompartido=typeof esMantCompartido==='function' && esMantCompartido();
    const puedeVerTodasLasTarjetas=esSupervisor || esAdministrador || esJefaturaProduccion || esMantenimientoCompartido;

    const prioridadGrupo=g=>{
      if(g.items.some(x=>estadoOrdenItem(x).key==='EN_CURSO'))return 0;
      if(g.items.some(x=>x.op?.estado==='DETENIDA'))return 1;
      if(g.items.some(x=>estadoOrdenItem(x).key==='PAUSA'))return 2;
      if(g.items.length && g.items.every(x=>['COMPLETADA','CANCELADA'].includes(estadoOrdenItem(x).key)))return 3;
      return 4;
    };

    let gruposVisibles=grupos.slice().sort((a,b)=>
      prioridadGrupo(a)-prioridadGrupo(b)
    );

    if(!puedeVerTodasLasTarjetas){
      gruposVisibles=gruposVisibles.filter(g=>
        g.items.some(x=>
          ['EN_PRODUCCION','DETENIDA','PAUSA_SECUENCIA','PAUSA','LISTA']
            .includes(x.estadoVisual || x.op?.estado)
        ) || g.fueraPlan.some(x=>x.vivo)
      );
    }

    const formatoDuracion=ms=>{
      ms=Math.max(0,Number(ms)||0);
      const totalMin=Math.floor(ms/60000);
      const h=Math.floor(totalMin/60);
      const m=totalMin%60;
      return h>0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${m} min`;
    };

    // Minutos (no ms) con el mismo formato legible.
    const formatoMin=min=>formatoDuracion((Number(min)||0)*60000);
    // Ratio faltante o inválido → "-" (nunca NaN/Infinity).
        const fmtRatio=v=>Number.isFinite(v) && v!==null ? Math.round(v).toLocaleString('es-PE') : '—';
    // Corte del ratio y comparación con el último avance (sus datos congelados): el semáforo es en vivo y puede diferir de un avance anterior.
    const avisoCorteRatio=g=>{
      const t=g.tiempos;
      if(!t||!t.ok||!t.finMs)return '';
      const corte=hhmmBloque(t.finMs);
      const u=typeof window.glacialUltimoAvanceLinea==='function'
        ? window.glacialUltimoAvanceLinea(g.line.key,g.items[0]&&g.items[0].fecha,g.items[0]&&g.items[0].turno) : null;
      let extra='';
      if(u){
        const dP=Math.round(g.totalFisico-u.produccion),dT=Math.round(t.tiempoOperativoMin-u.minutosEfectivos);
        const sg=n=>(n>=0?'+':'')+n.toLocaleString('es-PE');
        extra='<br><em title="El avance guardado conserva sus datos de ese corte; el semáforo se calcula al momento. La diferencia se explica por la producción y el tiempo efectivo transcurridos desde entonces.">Último avance '+u.horaCorte+': '+(u.ratioDisponible&&u.ratio!=null?fmtRatio(u.ratio):'—')+' · desde entonces '+sg(dP)+' UND y '+sg(dT)+' min efectivos</em>';
      }
      return '<div class="pa-ratio-corte" style="font-size:11px;opacity:.75">Corte '+corte+extra+'</div>';
    };

    const formatoCronometro=ms=>{
      ms=Math.max(0,Number(ms)||0);
      const totalSeg=Math.floor(ms/1000);
      const h=Math.floor(totalSeg/3600);
      const m=Math.floor((totalSeg%3600)/60);
      const seg=totalSeg%60;
      return [h,m,seg].map(v=>String(v).padStart(2,'0')).join(':');
    };

    const paradaActual=x=>{
      if(!x?.op)return null;
      if(x.op.estado==='PAUSA' && Number(x.op.pausaDesde||0)>0){
        return {tipo:'PAUSA PROGRAMADA',desde:Number(x.op.pausaDesde),motivo:x.op.motivoPausa||'Pausa programada'};
      }
      if(['DETENIDA','LISTA'].includes(x.op.estado) && Number(x.op.detenidaDesde||0)>0){
        return {tipo:x.op.estado==='LISTA'?'INTERVENCIÓN TERMINADA':'DETENIDA',desde:Number(x.op.detenidaDesde),motivo:(x.op.motivo||'Sin motivo registrado')+(x.op.equipo?' · '+x.op.equipo:'')};
      }
      return null;
    };


    const ordenOriginalItem=(x,indice)=>{
      const ordenes=secuenciaPlanificada(x.linea,x.fecha,x.turnoPlan || x.turno);
      const encontrado=ordenes.find(t=>
        t.marca===x.marca && t.presentacion===x.presentacion
      );
      return encontrado ? num(encontrado.orden) : (10000+indice);
    };

    const itemsOrdenadosGrupo=g=>g.items
      .map((x,i)=>({x,i,estado:estadoOrdenItem(x),orden:ordenOriginalItem(x,i)}))
      .sort((a,b)=>a.estado.rank-b.estado.rank || a.orden-b.orden || a.i-b.i);

    // PARADAS DEL TURNO: lee la lista oficial que ya calcula 23b-tiempos-linea.js (registros de Avance/Cierre de la línea, fecha y bloque).
    // No suma nada nuevo ni usa Detener/Pausar del semáforo (solo son estado). Los tiempos del resumen son los mismos del ratio.
    const fmtParada=min=>{
      const t=Math.max(0,Math.round(Number(min)||0)),h=Math.floor(t/60),m=t%60;
      return h>0 ? h+' h '+String(m).padStart(2,'0')+' min' : m+' min';
    };
    const htmlParadasTurno=t=>{
      const lista=t&&t.ok&&Array.isArray(t.paradasClasificadas) ? t.paradasClasificadas : [];
      const prog=t&&t.ok ? t.minPausasProgramadas : 0, noProg=t&&t.ok ? t.minParadasNoProgramadas : 0;
      const filas=lista.map(p=>{
        const esProg=p.clasif==='PROGRAMADA';
        const motivo=String(p.motivo||'').trim() || 'Sin motivo registrado';
        return `<tr><td>${esc(motivo)}${p.exceso ? ' <small>(exceso sobre el estándar)</small>' : ''}</td>
          <td><span class="pa-par-tipo ${esProg?'prog':'noprog'}">${esProg?'Programada':'No programada'}</span></td>
          <td class="pa-par-t">${fmtParada(p.minutos)}</td></tr>`;
      }).join('');
      return `<div class="pa-par-head"><div class="pa-hcol-title">◴ PARADAS DEL TURNO</div></div>
        <div class="pa-par-resumen"><div><span>Programadas</span><b>${fmtParada(prog)}</b></div><div><span>No programadas</span><b>${fmtParada(noProg)}</b></div></div>
        ${filas ? `<div class="pa-par-scroll"><table class="pa-par-tabla"><thead><tr><th scope="col">MOTIVO</th><th scope="col">TIPO</th><th scope="col" class="pa-par-t">TIEMPO</th></tr></thead><tbody>${filas}</tbody></table></div>`
          : '<div class="pa-par-vacio">Sin paradas registradas</div>'}`;
    };

    // Motivo de no producción (informativo; 63-incidencias-no-produccion.js). No es una parada oficial.
    const MNP=window.glacialIncidencias;
    if(MNP)MNP.escuchar(fecha);
    const htmlMotivoNP=g=>{
      if(!MNP)return '';
      const ref=g.items[0] || g.vacios[0];
      if(!ref)return '';
      const f=ref.fecha || fecha, t=ref.turnoPlan || ref.turno;
      const d=MNP.doc(f,MNP.bloqueDe(t),g.line.key);
      const vigente=d && d.estado==='VIGENTE' ? d : null;
      const puede=MNP.puedeInformar(g.line.key);
      if(!vigente && !puede)return '';
      const hora=vigente ? new Date(Number(vigente.registradoEn)||0).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'}) : '';
      return '<div class="pa-np">'+(vigente
        ? '<span class="pa-np-txt"><b>Sin producción · Motivo: '+esc(vigente.motivo)+'</b>'+(vigente.descripcion ? ' — '+esc(vigente.descripcion) : '')+
          ' <small>Registrado por '+esc(vigente.registradoPor||'—')+' · '+esc(hora)+'</small></span>'
        : '<span class="pa-np-txt small-muted">Situación informativa de la línea (no es una parada oficial).</span>')+
        (puede ? '<button type="button" class="btn btn-ghost btn-sm" data-pa-np="'+esc(g.line.key+'|'+f+'|'+t)+'">'+(vigente?'Corregir motivo':'Informar motivo de no producción')+'</button>' : '')+
        '</div>';
    };

    const tarjetaEstado=(estado)=>
      `<span class="pa-state-badge pa-state-${estado.cls}"><span></span>${estado.label}</span>`;

    const tablero=document.createElement('section');
    tablero.className='panel pa-live-board';
    tablero.innerHTML=`<div class="panel-head"><h3>Estado de las líneas</h3>
      <button type="button" class="btn btn-ghost btn-sm" data-pa-turno-actual>
      Ver turno actual: ${esc(turnoReal.fecha)} · ${esc(turnoReal.turno)}</button></div>
      <div class="panel-body"><p class="small-muted">Vista operativa por línea. Los totales de unidades no se mezclan entre líneas ni presentaciones.</p>
      <div class="pa-oper-kpis">
        <div class="pa-oper-kpi pa-oper-ok"><span>Líneas en producción</span><b>${gruposVisibles.filter(g=>
          g.items.some(x=>estadoOrdenItem(x).key==='EN_CURSO')
        ).length}</b></div>
        <div class="pa-oper-kpi pa-oper-stop"><span>Líneas detenidas</span><b>${gruposVisibles.filter(g=>
          g.items.some(x=>x.op?.estado==='DETENIDA')
        ).length}</b></div>
        <div class="pa-oper-kpi pa-oper-wait"><span>Líneas pendientes / pausa</span><b>${gruposVisibles.filter(g=>
          !g.items.some(x=>estadoOrdenItem(x).key==='EN_CURSO') &&
          !g.items.some(x=>x.op?.estado==='DETENIDA') &&
          g.items.some(x=>['PENDIENTE','PAUSA'].includes(estadoOrdenItem(x).key))
        ).length}</b></div>
      </div>
      <div class="pa-live-grid">${gruposVisibles.map(g=>{
        const idxActivo=filasActuales.indexOf(g.activo);
        // Línea sin programación (ni producción fuera de plan) en el bloque: una fila delgada en vez de una tarjeta de ceros.
        if(!g.items.length && !g.fueraPlan.length){
          return `<article class="pa-live-card pa-line-slim"><div class="pa-slim-txt"><strong>${esc(g.line.name)}</strong> · ${esc(bloquesTexto(g.turnosLinea) || 'SIN TURNO')} · Sin programación en este bloque</div>${htmlMotivoNP(g)}</article>`;
        }
        return `<article class="pa-live-card pa-line-card pa-line-card-horizontal">
          <div class="pa-line-top">
            <div class="pa-line-ident">
              <div class="pa-line-icon">⚙</div>
              <div>
                <strong class="pa-line-title">${esc(g.line.name)}</strong>
                <div class="pa-line-turnos">${esc(bloquesTexto(g.turnosLinea) || 'SIN TURNO')}</div>
              </div>
            </div>
            <div class="pa-line-status">
              ${g.tiempos?.pausaSinCerrar ? `<span class="pa-chip-alerta" title="Superó la duración estándar">⚠ Pausa sin cerrar · ${esc(g.tiempos.pausaSinCerrar.motivo)} · ${Math.round(g.tiempos.pausaSinCerrar.transcurridoMin)} min (estándar ${g.tiempos.pausaSinCerrar.estandarMin})</span>` : ''}
              ${g.items.some(x=>x.op?.corregida) ? '<span class="pa-chip-corregida" title="La finalización fue corregida">Corregida</span>' : ''}
              ${g.fueraPlan.length ? `<span class="pa-chip-fuera" title="Hay unidades de productos que no están en la planificación de este bloque">Producción fuera de programación · ${Math.round(g.totalFuera).toLocaleString('es-PE')} UND</span>` : ''}
              ${renderSemaforoWidget({nivel:g.nivel,texto:g.texto})}</div>
          </div>

          ${htmlMotivoNP(g)}

          <div class="pa-line-kpis">
            <div class="pa-line-kpi"><small>PROGRAMACIÓN VIGENTE</small><strong>${Math.round(g.totalProg).toLocaleString('es-PE')} <span>UND</span></strong></div>
            <div class="pa-line-kpi"><small>PRODUCCIÓN ACUMULADA</small><strong>${Math.round(g.totalProd).toLocaleString('es-PE')} <span>UND</span></strong>${g.fueraPlan.length?'<em class="pa-kpi-nota">del plan</em>':''}</div>
            ${g.fueraPlan.length ? `<div class="pa-line-kpi pa-line-kpi-fuera" title="Unidades de productos sin programación en este bloque. No suman al cumplimiento del plan."><small>FUERA DE PROGRAMACIÓN</small><strong>${Math.round(g.totalFuera).toLocaleString('es-PE')} <span>UND</span></strong></div>
            <div class="pa-line-kpi" title="Todo lo que produjo la línea en el bloque: plan + fuera de programación. Es la base del rendimiento y del ratio."><small>PRODUCCIÓN TOTAL DE LA LÍNEA</small><strong>${Math.round(g.totalFisico).toLocaleString('es-PE')} <span>UND</span></strong></div>` : ''}
            <div class="pa-line-kpi"${g.conEstimado&&!g.soloEstimado?' title="Incluye marcas cuya cantidad es estimada (no es un pedido firme)."':''}><small>${g.soloEstimado?'AVANCE FRENTE AL ESTIMADO':g.conEstimado?'CUMPLIMIENTO (INCLUYE ESTIMADOS)':'CUMPLIMIENTO'}</small><strong>${(()=>{const c=GlacialIndicadores.cumplimiento(g.totalProd,g.totalProg);return c==null?'—':Math.min(999,c*100).toFixed(1)+'<span>%</span>';})()}</strong></div>
            <div class="pa-line-kpi" title="Producido ÷ (tiempo transcurrido − pausas programadas). Se usa en la proyección «Si las paradas siguen igual»."><small>RENDIMIENTO DEL TURNO</small><strong>${fmtRatio(g.ratios?.ratioTurno)} <span>UND/h</span></strong></div>
            <div class="pa-line-kpi" title="Ratio = producido ÷ horas efectivas. Horas efectivas = tiempo transcurrido − (paradas programadas + no programadas)."><small>RATIO</small><strong>${fmtRatio(g.ratios?.ratioEfectivo)} <span>UND/h</span></strong>${avisoCorteRatio(g)}</div>
            ${g.tiempos?.enCurso ? `<div class="pa-line-kpi"><small>RATIO NECESARIO</small><strong>${fmtRatio(g.ratios?.ratioNecesario)} <span>UND/h</span></strong></div>` : ''}
          </div>

          ${htmlProyeccion(g.proyeccion,g.porTurno)}
          ${(()=>{
            // Marca en curso con SU propio avance (no el total de la línea) y avisos de marcas detenidas sin finalizar.
            const a=g.desglose.actual;if(!a)return '';
            const f0=n=>Math.round(n).toLocaleString('es-PE');
            const aviso=g.desglose.avisos.map(v=>`<div class="pa-aviso-detenida" role="status">⚠ Marca ${esc(v.marca||'—')} quedó detenida${v.desde?' desde '+esc(hhmmBloque(v.desde)):''}: finalízala o reanúdala</div>`).join('');
            const ax=g.items.find(x=>x.marca===a.marca && x.presentacion===a.presentacion);
            const est=ax && g.esEstimado(ax);
            return `<div class="pa-marca-actual"><small>${g.desglose.estado==='EN_CURSO'?'MARCA EN CURSO':'MARCA ACTUAL'}</small>
              <strong>${esc(a.marca||'—')}${a.presentacion?' · '+esc(presUI(g.line.key,a.marca,a.presentacion)):''}</strong>
              ${g.desglose.total.marcas>1?`<span><b>${f0(a.producido)}</b> / ${f0(a.programado)} UND${est?' estimadas':''} · ${a.programado>0?Math.round(a.avance)+' %'+(est?' del estimado':''):'—'}</span>`:''}</div>${aviso}`;
          })()}

          ${g.desglose.total.marcas>1 ? `<div class="pa-total-linea">Total del plan (${g.desglose.total.marcas} marca${g.desglose.total.marcas===1?'':'s'} programada${g.desglose.total.marcas===1?'':'s'}): programado, producido y ${g.soloEstimado?'avance':'cumplimiento'} suman las marcas del plan del bloque, no solo la actual${g.fueraPlan.length?'; la producción fuera de programación se muestra aparte y no cuenta':''}.${g.conEstimado?' Las marcas en «Todo el turno», «Tiempo restante» o «Hasta una hora» se comparan con su cantidad estimada, no con un pedido firme.':''}</div>` : ''}

          <div class="pa-horizontal-body">

            <section class="pa-hcol pa-hcol-programacion">
              <div class="pa-hcol-title">▥ SECUENCIA DEL TURNO</div>
              ${(()=>{
                const ordenados=itemsOrdenadosGrupo(g);
                const counts={curso:0,proximo:0,pausa:0,detenida:0,pendiente:0,completada:0,cancelada:0};
                ordenados.forEach(o=>counts[o.estado.cls]++);
                const ct=(n,cls,txt)=>n>0 ? `<span class="${cls}">● ${n} ${txt}</span>` : '';
                return `<div class="pa-state-counts">
                  ${ct(counts.curso,'curso','En curso')}
                  ${ct(counts.proximo,'proximo','Próximos a producir')}
                  ${ct(counts.pausa,'pausa','En pausa')}
                  ${ct(counts.detenida,'detenida','Detenidas')}
                  ${ct(counts.completada,'completada','Finalizadas')}
                  ${ct(counts.pendiente,'pendiente','Pendientes')}
                  ${counts.cancelada ? `<span class="cancelada">● ${counts.cancelada} Canceladas</span>` : ''}
                </div>
                <div class="pa-program-list pa-program-list-horizontal">${
                  ordenados.length ? ordenados.map(({x,estado})=>{
                    const prog=Math.round(progTarjeta(x));
                    const idx=filasActuales.indexOf(x);
                    // «Cancelar programación» vivía en el bloque Historial / Avance, que ya no se muestra aquí: se conserva en la fila.
                    const cancelar=x.puede==='supervisor' && !['CANCELADA','COMPLETADA'].includes(estado.key)
                      ? `<button type="button" class="pa-cancel-btn" title="Cancelar programación" aria-label="Cancelar programación"
                          data-pa-accion="cancelar" data-pa-indice="${idx}">✕</button>` : '';
                    const reactivar=estado.key==='CANCELADA' && esAdministradorPA() && x.puede==='supervisor'
                      ? `<button type="button" class="btn btn-ghost btn-sm" style="margin-top:6px" title="Solo el Administrador puede reactivar una programación cancelada"
                          data-pa-accion="reactivar" data-pa-indice="${idx}">↺ Reactivar</button>` : '';
                    return `<div class="pa-program-row pa-program-state-${estado.cls}">
                      <span><b>${esc(x.marca || '—')}</b>${x.presentacion
                        ? '<small>'+esc(presUI(x.linea,x.marca,x.presentacion))+'</small>' : ''}</span>
                      <div class="pa-program-right"><strong>${Math.round(producidoDe(x)).toLocaleString('es-PE')} / ${prog.toLocaleString('es-PE')} UND${g.esEstimado(x)?' estimadas':''}${prog>0?' · '+Math.round(producidoDe(x)/prog*100)+' %'+(g.esEstimado(x)?' del estimado':''):''}</strong><div class="pa-program-right-fila">${tarjetaEstado(estado)}${cancelar}</div>${reactivar}</div>
                    </div>`;
                  }).join('') : '<div class="small-muted">Sin programación para el período seleccionado.</div>'
                }</div>`;
              })()}
            </section>

            ${g.fueraPlan.length ? `<section class="pa-hcol pa-hcol-fuera">
              <div class="pa-hcol-title">⚠ PRODUCCIÓN FUERA DE PROGRAMACIÓN</div>
              <p class="pa-fuera-nota">Estos productos tienen unidades registradas en ${esc(g.line.name)} · ${esc(g.items[0]?.fecha || g.fueraPlan[0].fecha)} · ${esc(bloquesTexto([g.fueraPlan[0].turno]) || g.fueraPlan[0].turno)}, pero no están en la planificación del bloque.
                Se conservan tal cual: no se atribuyen a otra marca, no completan el plan ni crean una programación. Si corresponde, Planificación debe agregarlos o el supervisor corregir el registro.</p>
              <div class="pa-program-list pa-program-list-horizontal">${g.fueraPlan.map(x=>`
                <div class="pa-program-row pa-program-fuera">
                  <span><b>${esc(x.marca || '—')}</b>${x.presentacion ? '<small>'+esc(presUI(x.linea,x.marca,x.presentacion))+'</small>' : ''}</span>
                  <div class="pa-program-right"><strong>${Math.round(x.producidoFuera).toLocaleString('es-PE')} UND</strong>
                    <small>Fuente: ${produccionDesdePaletas(x) ? 'Paletas (bloque en curso)' : 'registro de producción del bloque'} · sin programación</small></div>
                </div>`).join('')}</div>
            </section>` : ''}

            ${(()=>{
              // Controles operativos (Iniciar / Detener / Pausar / Finalizar…): antes vivían en el panel «Producción actual». Se conservan
              // en una franja compacta; no generan paradas oficiales.
              const actualActivo=g.items.find(x=>{
                const e=estadoOrdenItem(x).key;
                return e==='EN_CURSO' || e==='PAUSA' || x.op?.estado==='DETENIDA' || x.op?.estado==='LISTA';
              });
              const actual=actualActivo || g.items.find(x=>estadoOrdenItem(x).key==='PENDIENTE');
              if(!actual)return '';
              const idx=filasActuales.indexOf(actual);
              const parada=paradaActual(actual);
              const botones=acciones(actual,idx);
              if(!botones && !parada)return '';
              return `<section class="pa-hcol pa-hcol-controles">
                <div class="pa-ctl-info"><b>${actualActivo ? 'Produciendo ahora' : 'Próxima producción'}:</b> ${esc(actual.marca||'—')}${actual.presentacion ? ' · '+esc(presUI(actual.linea,actual.marca,actual.presentacion)) : ''}</div>
                ${parada ? `<div class="pa-stop-live"><div><strong>${esc(parada.tipo)}</strong><b>${formatoCronometro(ahoraServidor()-parada.desde)}</b></div>
                  <small>Desde ${new Date(parada.desde).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})} · ${esc(parada.motivo)}</small></div>` : ''}
                ${botones ? `<div class="pa-live-actions">${botones}</div>` : ''}
              </section>`;
            })()}

            <section class="pa-hcol pa-hcol-paradas">
              ${htmlParadasTurno(g.tiempos)}
            </section>

          </div>
        </article>`;
      }).join('')}</div></div>`;
    cont.prepend(tablero);
  }

  const css=document.createElement('style');
  css.textContent=`
    .pa-np{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:8px 18px;border-bottom:1px solid #d8e4ec;background:#fffbea}
    .pa-np-txt small{display:block;color:#6b5a2a;font-weight:500}
    /* Colores de estado de producción (mapa único en 24a-estados-visuales.js): EN CURSO naranja, EN PAUSA / PRÓXIMO A PRODUCIR / PROGRAMADA amarillo, DETENIDA rojo,
       FINALIZADA (COMPLETADA) verde, PENDIENTE gris. Los avisos de meta incumplida son otra señal y conservan su color. */
    .pa-live-board{--est-curso:#F97316;--est-curso-bg:#FFEDD5;--est-curso-tx:#9A3412;--est-pausa:#FACC15;--est-pausa-bg:#FEF9C3;--est-pausa-tx:#713F12;
      --est-det:#EF4444;--est-det-bg:#FEE2E2;--est-det-tx:#991B1B;--est-fin:#22C55E;--est-fin-bg:#DCFCE7;--est-fin-tx:#166534;
      --est-pend:#9CA3AF;--est-pend-bg:#F3F4F6;--est-pend-tx:#4B5563}
    .pa-live-board .pa-state-curso{background:var(--est-curso-bg);color:var(--est-curso-tx)}.pa-live-board .pa-state-curso>span{background:var(--est-curso)}
    .pa-live-board .pa-state-pausa{background:var(--est-pausa-bg);color:var(--est-pausa-tx)}.pa-live-board .pa-state-pausa>span{background:var(--est-pausa)}
    .pa-live-board .pa-state-detenida{background:var(--est-det-bg);color:var(--est-det-tx)}.pa-live-board .pa-state-detenida>span{background:var(--est-det)}
    .pa-live-board .pa-state-completada{background:var(--est-fin-bg);color:var(--est-fin-tx)}.pa-live-board .pa-state-completada>span{background:var(--est-fin)}
    .pa-live-board .pa-state-proximo{background:var(--est-pausa-bg);color:var(--est-pausa-tx)}.pa-live-board .pa-state-proximo>span{background:var(--est-pausa)}
    .pa-live-board .pa-state-pendiente{background:var(--est-pend-bg);color:var(--est-pend-tx)}.pa-live-board .pa-state-pendiente>span{background:var(--est-pend)}
    .pa-live-board .pa-state-counts{font-size:12px}
    .pa-live-board .pa-state-counts .curso{color:var(--est-curso-tx)}.pa-live-board .pa-state-counts .pausa{color:var(--est-pausa-tx)}
    .pa-live-board .pa-state-counts .detenida{color:var(--est-det-tx)}.pa-live-board .pa-state-counts .completada{color:var(--est-fin-tx)}
    .pa-live-board .pa-state-counts .pendiente{color:var(--est-pend-tx)}.pa-live-board .pa-state-counts .proximo{color:var(--est-pausa-tx)}.pa-live-board .pa-state-counts .proximo::first-letter{color:var(--est-pausa)}
    .pa-live-board .pa-state-counts .curso::first-letter{color:var(--est-curso)}.pa-live-board .pa-state-counts .pausa::first-letter{color:var(--est-pausa)}
    .pa-live-board .pa-state-counts .detenida::first-letter{color:var(--est-det)}.pa-live-board .pa-state-counts .completada::first-letter{color:var(--est-fin)}
    .pa-live-board .pa-state-counts .pendiente::first-letter{color:var(--est-pend)}
    .pa-live-board .pa-program-list-horizontal .pa-program-state-curso{border-top-color:var(--est-curso);background:#fff9f1}
    .pa-live-board .pa-program-list-horizontal .pa-program-state-pausa{border-top-color:var(--est-pausa);background:#fffdf0}
    .pa-live-board .pa-program-list-horizontal .pa-program-state-detenida{border-top-color:var(--est-det);background:#fff6f6}
    .pa-live-board .pa-program-list-horizontal .pa-program-state-completada{border-top-color:var(--est-fin);background:#f4fcf6}
    .pa-live-board .pa-program-list-horizontal .pa-program-state-proximo{border-top-color:var(--est-pausa);background:#fffdf0}
    .pa-live-board .pa-program-list-horizontal .pa-program-state-pendiente{border-top-color:var(--est-pend);background:#f8f9fa}
    .pa-marca-actual{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;padding:10px 18px;border-bottom:1px solid #d8e4ec;background:#fff9f1}
    .pa-marca-actual small{font-size:10px;font-weight:800;letter-spacing:.05em;color:#9A3412}.pa-marca-actual strong{color:#073f68;overflow-wrap:anywhere}.pa-marca-actual span{color:#073f68}
    .pa-chip-fuera{display:inline-block;margin-right:8px;padding:2px 8px;border-radius:999px;background:#EEF2FF;border:1px solid #C7D2FE;color:#3730A3;font-size:10px;font-weight:700}
    .pa-live-board .pa-hcol-fuera{grid-column:1/-1;border-top:1px solid #d8e4ec;background:#F5F7FF}
    .pa-fuera-nota{margin:4px 0 8px;font-size:12px;color:#3730A3}
    .pa-live-board .pa-program-list-horizontal .pa-program-fuera{border-top-color:#6366F1;background:#fff}
    .pa-program-fuera .pa-program-right small{display:block;font-size:11px;color:#5f7382;font-weight:500}
    .pa-kpi-nota{display:block;font-size:10px;font-style:normal;color:#5f7382}
    /* «… UND estimadas · N % del estimado» es más largo: en celular puede pasar a la línea siguiente en vez de cortarse. */
    .pa-live-board .pa-program-list-horizontal .pa-program-right strong{white-space:normal;overflow-wrap:anywhere}
    .pa-total-linea{padding:6px 18px;font-size:11px;font-weight:700;color:#5f7382;background:#f4f8fb}
    .pa-aviso-detenida{margin:0;padding:8px 18px;background:#FEE2E2;color:#991B1B;font-size:12px;font-weight:700;border-bottom:1px solid #fbcaca}
    .pa-program-right-fila{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    /* Cuerpo: secuencia, controles y paradas en una sola columna a todo el ancho */
    .pa-live-board .pa-horizontal-body{grid-template-columns:minmax(0,1fr)}
    .pa-live-board .pa-hcol-programacion,.pa-live-board .pa-hcol-paradas,.pa-live-board .pa-hcol-controles{grid-column:1/-1;border-right:0}
    .pa-live-board .pa-hcol-controles{border-top:1px solid #d8e4ec;background:#fbfdff;display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px}
    .pa-live-board .pa-hcol-controles .pa-live-actions{margin-top:0}.pa-live-board .pa-hcol-controles .pa-stop-live{margin:0}
    .pa-ctl-info{font-size:13px;color:#073f68}
    .pa-live-board .pa-line-kpis{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
    @media(min-width:901px){.pa-live-board .pa-line-kpis{grid-template-columns:repeat(5,minmax(0,1fr))}}
    @media(max-width:700px){.pa-live-board .pa-line-kpis{grid-template-columns:1fr 1fr}}
    /* PARADAS DEL TURNO */
    .pa-live-board .pa-hcol-paradas{border-top:1px solid #d8e4ec;padding:16px 18px;background:#fff}
    .pa-par-head .pa-hcol-title{font-size:14px;margin-bottom:2px}.pa-par-sub{color:#5f7382;font-size:13px;margin-bottom:12px}
    .pa-par-resumen{display:grid;grid-template-columns:1fr 1fr;border:1px solid #cfe0ec;border-radius:10px;background:#f3f9fe;margin-bottom:14px}
    .pa-par-resumen>div{padding:10px 14px;text-align:center}.pa-par-resumen>div+div{border-left:1px solid #cfe0ec}
    .pa-par-resumen span{display:block;font-size:13px;color:#4a6376}.pa-par-resumen b{display:block;font-size:22px;color:#073f68;line-height:1.2}
    .pa-par-scroll{overflow-x:auto;border:1px solid #cfe0ec;border-radius:10px}
    .pa-par-tabla{width:100%;min-width:420px;border-collapse:collapse;font-size:13px}
    .pa-par-tabla th{background:#e8f2fa;color:#073f68;font-size:11px;letter-spacing:.04em;text-align:left;padding:8px 12px;text-transform:uppercase}
    .pa-par-tabla td{padding:8px 12px;border-top:1px solid #e1ecf4;color:#1b2a38;vertical-align:middle}
    .pa-par-tabla .pa-par-t{text-align:right;white-space:nowrap;font-weight:800;color:#073f68}
    .pa-par-tabla td small{color:#7a8b98}
    .pa-par-tipo{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap}
    .pa-par-tipo.prog{background:#dbeafe;color:#1e40af}.pa-par-tipo.noprog{background:#fef3c7;color:#78350f}
    .pa-par-vacio{padding:14px;border:1px dashed #cbd8df;border-radius:9px;text-align:center;color:#667784;background:#fafcfd}
    @media(max-width:700px){.pa-live-board .pa-hcol-paradas{padding:14px 12px}.pa-par-resumen b{font-size:18px}}
    .pa-live-board{margin-bottom:18px}
    .pa-oper-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0 16px}
    .pa-oper-kpi{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid #d8e1e7;border-radius:10px;background:#fff}
    .pa-oper-kpi span{font-size:12px;color:#526776;font-weight:600}.pa-oper-kpi b{font-size:24px;color:#103b57}
    .pa-oper-ok{border-left:4px solid #198754}.pa-oper-stop{border-left:4px solid #c9362b}.pa-oper-wait{border-left:4px solid #f5b335}
    .pa-live-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:14px}
    .pa-live-card{padding:18px;border:1px solid #cfdbe3;border-radius:10px;background:#f9fcff;font-size:13px;line-height:1.55}
    .pa-live-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}
    .pa-line-title{font-size:16px;color:#102d42}.pa-line-turnos{font-weight:700;margin-top:2px}
    .pa-section-title{font-weight:800;font-size:13px;margin:14px 0 7px;color:#1d2d39;letter-spacing:.02em}
    .pa-program-list{border-top:1px solid #e1e8ed;border-bottom:1px solid #e1e8ed;padding:7px 0}
    .pa-program-list>div{display:flex;justify-content:space-between;gap:12px;padding:3px 0}.pa-program-list span{font-weight:700;white-space:nowrap}
    .pa-current{padding:10px 0}.pa-current-name{font-weight:700;color:#005b96;margin-bottom:5px}
    .pa-live-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
    .pa-actions-note{display:block;width:100%;padding:8px 10px;border:1px dashed #cbd8e0;border-radius:7px;background:#f8fbfd;color:#667784;font-size:10px;font-weight:700}
    .pa-progress-list{display:grid;gap:7px}.pa-progress-row{display:grid;grid-template-columns:minmax(0,1fr) auto 118px 28px;gap:10px;align-items:center}
    .pa-progress-row>span{min-width:0}.pa-progress-row b{font-size:12px;white-space:nowrap}
    .pa-progress-row i{display:inline-flex;align-items:center;justify-content:flex-start;gap:7px;font-style:normal;font-weight:800;font-size:10px;letter-spacing:.035em;white-space:nowrap}
    .pa-status-dot{flex:0 0 auto;width:10px;height:10px;border-radius:50%;display:inline-block}
    .pa-progress-row i.fin{color:#198754}.pa-progress-row i.fin .pa-status-dot{background:#198754}
    .pa-progress-row i.curso{color:#9A3412}.pa-progress-row i.curso .pa-status-dot{background:#F97316;animation:paPulsoProduccion 1.35s ease-in-out infinite;box-shadow:0 0 0 0 rgba(249,115,22,.42)}
    .pa-progress-row i.det{color:#c9362b}.pa-progress-row i.det .pa-status-dot{background:#c9362b}
    .pa-progress-row i.pend{color:#667784}.pa-progress-row i.pend .pa-status-dot{background:#b8c3ca}
    .pa-progress-row i.cancel{color:#8b3a32}.pa-cancel-x{font-size:13px;font-weight:900}
    .pa-cancel-btn{width:26px;height:26px;border:1px solid #d7dfe4;border-radius:6px;background:#fff;color:#9a4339;font-weight:900;cursor:pointer;line-height:1}
    .pa-cancel-btn:hover{background:#fff1ef;border-color:#d6a19a;color:#b42318}
    @keyframes paPulsoProduccion{0%,100%{opacity:1;transform:scale(1);box-shadow:0 0 0 0 rgba(245,179,53,.38)}50%{opacity:.68;transform:scale(1.2);box-shadow:0 0 0 6px rgba(245,179,53,0)}}
    @media (prefers-reduced-motion:reduce){.pa-progress-row i.curso .pa-status-dot{animation:none}}
    .pa-total{border-top:1px solid #cfdbe3;margin-top:12px;padding-top:10px;font-weight:700}
    .pa-live-active .pl-grupo-card .pl-semaforo-wrap{display:none}
    @media(min-width:701px){
      .pa-live-grid{
        display:grid;
        grid-template-columns:1fr;
        gap:12px;
        overflow:visible;
        padding:2px 0 10px;
      }
      .pa-live-card{
        width:100%;
        max-width:none;
      }
    }
    .pa-line-card-horizontal{padding:0;overflow:hidden;min-width:0;width:100%}
    .pa-line-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 18px;border-bottom:1px solid #d9e5ed;background:#f8fbfd}
    .pa-line-ident{display:flex;align-items:center;gap:12px}.pa-line-icon{font-size:28px;color:#005b96}
    .pa-horizontal-body{display:grid;grid-template-columns:1.05fr .95fr 1.35fr;align-items:stretch}
    .pa-hcol{min-width:0;padding:12px 14px;border-right:1px solid #d8e4ec;background:#fff}
    .pa-hcol:last-child{border-right:0}.pa-hcol-title{font-weight:900;color:#064f80;font-size:12px;letter-spacing:.025em;margin-bottom:12px}
    .pa-program-list-horizontal{border:0;padding:0}.pa-program-row{display:flex!important;align-items:center;justify-content:space-between;gap:12px;padding:8px 10px!important;margin-bottom:6px;border-radius:8px;background:#edf6fc}
    .pa-program-row span{min-width:0}.pa-program-row small,.pa-progress-row-horizontal small{display:block;font-weight:500;color:#5f7382;margin-top:1px;white-space:normal}
    .pa-program-row strong{white-space:nowrap;color:#16344b}
    .pa-active-product{font-weight:800;color:#005b96;margin-bottom:9px}
    .pa-metric-row{display:flex;justify-content:space-between;gap:12px;padding:3px 0}.pa-metric-row b{text-align:right;white-space:nowrap}
    .pa-metric-divider{height:1px;background:#d6e1e8;margin:8px 0}.pa-metric-main{color:#073f68}
    .pa-stop-reason{margin-top:7px;color:#b42318;font-weight:700}
    .pa-metric-turno{margin-top:3px;padding-top:6px;border-top:1px dashed #d8e4ec;color:#073f68}
    .pa-metric-turno b{font-size:16px}
    .pa-stop-live{margin:9px 0 4px;padding:9px 10px;border:1px solid #efc7c2;border-left:4px solid #c9362b;border-radius:8px;background:#fff7f6}
    .pa-stop-live>div{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#a92f27}
    .pa-stop-live>div b{font-family:monospace;font-size:14px}
    .pa-stop-live small{display:block;margin-top:3px;color:#6b4a47}

    .pa-progress-row-horizontal{grid-template-columns:minmax(0,1fr) auto auto 28px;padding:7px 0;border-bottom:1px solid #edf1f4}
    .pa-progress-row-horizontal:last-child{border-bottom:0}.pa-progress-row-horizontal>strong{font-size:11px;white-space:nowrap}
    .pa-total-pres-list{display:grid;gap:9px}
    .pa-total-pres-card{padding:10px 11px;border-radius:10px;background:#edf6fc;border:1px solid #d9e9f3}
    .pa-total-pres-name{font-size:11px;font-weight:800;color:#073f68;text-transform:uppercase;line-height:1.25}
    .pa-total-pres-brands{margin-top:2px;font-size:10px;color:#647987}
    .pa-total-pres-values{display:flex;align-items:baseline;gap:5px;margin-top:7px;color:#073f68}
    .pa-total-pres-values strong{font-size:22px;line-height:1}
    .pa-total-pres-values span{font-size:12px;font-weight:700}
    .pa-total-big{display:flex;align-items:center;gap:14px;min-height:94px;padding:11px;border-radius:10px;background:#edf6fc}    .pa-total-big small{display:block;color:#5d7180;font-size:10px;margin-bottom:5px}
    .pa-total-big strong{font-size:24px;line-height:1.05;color:#073f68}.pa-total-big strong span{font-size:13px}
    .pa-total-progress{height:8px;border-radius:999px;background:#dce7ee;overflow:hidden;margin-top:12px}.pa-total-progress>div{height:100%;background:#198754}
    .pa-total-percent{text-align:center;margin-top:6px;font-size:11px;font-weight:700;color:#526979}
    .pa-program-summary{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:9px}
    .pa-program-summary>div{padding:8px 9px;border:1px solid #dce6ec;border-radius:8px;background:#f8fbfd}
    .pa-program-summary small{display:block;color:#667784;font-size:9px;text-transform:uppercase;font-weight:800}
    .pa-program-summary b{display:block;margin-top:2px;color:#073f68;font-size:13px}
    .pa-state-counts{display:flex;flex-wrap:wrap;gap:5px 9px;margin:0 0 10px;font-size:9px;font-weight:800}
    .pa-state-counts .curso{color:#c46f00}.pa-state-counts .pausa{color:#a77b00}.pa-state-counts .pendiente{color:#667784}
    .pa-state-counts .completada{color:#198754}.pa-state-counts .cancelada{color:#c0392b}
    .pa-program-right{display:flex;align-items:flex-end;flex-direction:column;gap:4px}
    .pa-state-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 7px;border-radius:999px;font-size:9px;font-weight:900;white-space:nowrap}
    .pa-state-badge>span{width:7px;height:7px;border-radius:50%}
    .pa-state-curso{background:#fff0dc;color:#a85d00}.pa-state-curso>span{background:#f28c28}
    .pa-state-pausa{background:#fff7d6;color:#8a6900}.pa-state-pausa>span{background:#e0b400}
    .pa-state-pendiente{background:#eef2f4;color:#667784}.pa-state-pendiente>span{background:#9aa8b1}
    .pa-state-completada{background:#e5f4eb;color:#247246}.pa-state-completada>span{background:#2e8b57}
    .pa-state-cancelada{background:#f8e6e3;color:#a83228}.pa-state-cancelada>span{background:#c0392b}
    .pa-program-row{border-left:3px solid transparent}
    .pa-program-state-curso{border-left-color:#f28c28}.pa-program-state-pausa{border-left-color:#e0b400}
    .pa-program-state-pendiente{border-left-color:#9aa8b1}.pa-program-state-completada{border-left-color:#2e8b57}
    .pa-program-state-cancelada{border-left-color:#c0392b;opacity:.86}
    .pa-current-head,.pa-advance-top,.pa-advance-values,.pa-advance-foot,.pa-advance-actions{display:flex;align-items:center;justify-content:space-between;gap:10px}
    .pa-current-head{margin-bottom:10px}.pa-current-head strong{display:block;font-size:15px;color:#073f68}.pa-current-head small{display:block;color:#667784}
    .pa-empty-current{padding:18px 10px;border:1px dashed #cbd8df;border-radius:9px;text-align:center;color:#667784;background:#fafcfd}
    .pa-advance-list{display:grid;gap:8px}.pa-advance-card{padding:10px 11px;border:1px solid #dce5ea;border-left:4px solid #9aa8b1;border-radius:9px;background:#fff}
    .pa-advance-card.pa-advance-curso{border-left-color:#f28c28}.pa-advance-card.pa-advance-pausa{border-left-color:#e0b400}
    .pa-advance-card.pa-advance-completada{border-left-color:#2e8b57}.pa-advance-card.pa-advance-cancelada{border-left-color:#c0392b}
    .pa-advance-top strong{display:block;color:#173246}.pa-advance-top small{display:block;color:#667784;font-size:10px}
    .pa-advance-values{margin-top:8px}.pa-advance-values>b{font-size:12px;color:#294353}.pa-advance-values>strong{font-size:12px;color:#073f68}
    .pa-advance-bar{height:7px;margin-top:6px;background:#e5ebef;border-radius:999px;overflow:hidden}.pa-advance-bar>div{height:100%;background:#9aa8b1}
    .pa-advance-bar>div.curso{background:#f28c28}.pa-advance-bar>div.pausa{background:#e0b400}.pa-advance-bar>div.completada{background:#2e8b57}.pa-advance-bar>div.cancelada{background:#c0392b}
    .pa-advance-foot{margin-top:6px;color:#647987;font-size:9px;align-items:flex-start;flex-wrap:wrap}.pa-advance-foot b{color:#334d5d}
    .pa-cancel-reason{margin-top:6px;padding-top:6px;border-top:1px dashed #ead0cc;color:#9b3a31;font-size:10px;font-weight:700}
    /* REDISEÑO INDUSTRIAL */
    .pa-chip-alerta{display:inline-block;margin-right:8px;padding:3px 9px;border-radius:999px;background:#fff1d6;border:1px solid #f0c36a;color:#8a5a00;font-size:11px;font-weight:800;animation:paPulsoProduccion 1.6s ease-in-out infinite}
    .pa-chip-corregida{display:inline-block;margin-right:8px;padding:2px 8px;border-radius:999px;background:#eef3f7;border:1px solid #d3dee6;color:#5a7083;font-size:10px;font-weight:700}
    .pa-modal-fondo{position:fixed;inset:0;background:rgba(10,30,50,.45);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
    .pa-modal{background:#fff;border-radius:12px;padding:18px 20px;width:min(420px,100%);max-height:90vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.25)}
    .pa-modal-ancho{width:min(720px,100%)}
    .pa-modal h3{margin:0 0 12px;color:#103b57}.pa-modal label{display:block;margin:10px 0 4px;font-size:12px;font-weight:700;color:#35506a}
    .pa-modal select,.pa-modal input[type=time],.pa-modal input[type=number],.pa-modal input[type=text],.pa-modal textarea{width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #cbd8e0;border-radius:7px;font:inherit}
    .pa-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .pa-modal-nota{display:block;margin-top:8px;color:#667784;font-size:11px;line-height:1.4}
    .pa-modal-error{margin-top:8px;color:#c62828;font-size:12px;font-weight:700}
    .pa-modal-acc{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
    .pa-modal-tabla{overflow:auto;border:1px solid #e1e8ed;border-radius:8px}.pa-modal-tabla table{width:100%;border-collapse:collapse;font-size:12px}
    .pa-modal-tabla th,.pa-modal-tabla td{padding:6px 8px;border-bottom:1px solid #eef2f5;text-align:left}.pa-modal-tabla td small{display:block;color:#7a8b98}
    .pa-paradas-desglose{display:flex;flex-direction:column;gap:1px;margin-top:3px;font-size:10px;color:#526776;line-height:1.35}.pa-paradas-desglose em{font-style:normal;color:#7a8b98}
    .pa-line-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));border-bottom:1px solid #d8e4ec;background:#fff}
    .pa-line-kpi{padding:11px 14px;border-right:1px solid #e2e9ee;min-width:0}.pa-line-kpi:last-child{border-right:0}
    .pa-line-kpi small{display:block;font-size:8px;font-weight:900;letter-spacing:.055em;color:#6b7e8b}.pa-line-kpi strong{display:block;margin-top:2px;font-size:17px;line-height:1.1;color:#073f68}.pa-line-kpi strong span{font-size:9px;color:#647987}
    .pa-horizontal-body{grid-template-columns:minmax(300px,.82fr) minmax(460px,1.18fr)}
    .pa-hcol-programacion{grid-column:1/-1;border-right:0;border-bottom:1px solid #d8e4ec;background:#fbfdff}
    .pa-program-list-horizontal{display:flex!important;align-items:stretch;gap:0;overflow-x:auto;padding:2px 0 5px!important}
    .pa-program-list-horizontal .pa-program-row{position:relative;flex:1 0 190px;display:block!important;margin:0!important;padding:10px 30px 10px 12px!important;border-radius:0;background:transparent;border-left:0;border-top:3px solid #9aa8b1}
    .pa-program-list-horizontal .pa-program-row:not(:last-child)::after{content:'›';position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:22px;font-weight:900;color:#aab7bf}
    .pa-program-list-horizontal .pa-program-state-curso{border-top-color:#f28c28;background:#fff9f1}.pa-program-list-horizontal .pa-program-state-pausa{border-top-color:#e0b400;background:#fffdf3}.pa-program-list-horizontal .pa-program-state-pendiente{border-top-color:#9aa8b1}.pa-program-list-horizontal .pa-program-state-completada{border-top-color:#2e8b57;background:#f6fbf8}.pa-program-list-horizontal .pa-program-state-cancelada{border-top-color:#c0392b;background:#fff8f7}
    .pa-program-list-horizontal .pa-program-right{align-items:flex-start;margin-top:5px}.pa-hcol-ratio{border-right:1px solid #d8e4ec}.pa-hcol-avance{border-right:0}
    .pa-now-production,.pa-next-production{display:inline-flex;margin:-2px 0 9px;padding:4px 8px;border-radius:6px;font-size:8px;font-weight:900;letter-spacing:.06em}.pa-now-production{background:#fff0dc;color:#a85d00}.pa-next-production{background:#eef2f4;color:#667784}
    .pa-hcol-ratio .pa-current-head{padding:10px 11px;border:1px solid #dce6ec;border-radius:9px;background:#f8fbfd}.pa-hcol-ratio .pa-metric-main{margin-top:5px;padding:8px 0}.pa-hcol-ratio .pa-metric-main b{font-size:17px}.pa-advance-list{max-height:410px;overflow:auto;padding-right:3px}
    .pa-proy{margin:0;padding:10px 14px;border-bottom:1px solid #d8e4ec;border-left:6px solid #9aa9b8;background:#f7f9fb;font-size:13px;color:#1b2a38}
    .pa-proy.verde{border-left-color:#13814a;background:#effbf4}.pa-proy.ambar{border-left-color:#df8b00;background:#fffbea}
    .pa-proy.roja{border-left-color:#d93a3a;background:#fff5f5}
    .pa-proy-top{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;margin-bottom:4px}
    .pa-proy-top b{letter-spacing:.04em;color:#10265f}.pa-proy-top small{color:#5a6b7b}
    .pa-proy-corto{font-size:13px;line-height:1.5}.pa-proy-corto b{color:#10265f}
    .pa-line-slim{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:8px 16px;background:#fff;border:1px solid #d8e4ec;border-radius:12px;color:#5f7382}
    .pa-line-slim .pa-slim-txt strong{color:#10265f}.pa-line-slim .pa-np{border:0;background:transparent;padding:0}.pa-line-slim .pa-np-txt.small-muted{display:none}
    .pa-proy-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:4px 18px}
    .pa-proy-grid div b{color:#10265f}.pa-proy-dif.falta{color:#a92f27;font-weight:800}.pa-proy-dif.sobra{color:#13814a;font-weight:800}
    .pa-proy-nota{margin-top:4px;font-size:12px;color:#8a1f17;font-weight:700}.pa-proy-nota.info{color:#5a6b7b;font-weight:600}
    .pa-franja{margin:0 0 10px;padding:10px 14px;border-radius:10px;background:#eef2f6;border:1px solid #cdd8e2;color:#34475a;font-weight:700;font-size:13px}
    .pa-proy-estado{display:inline-block;margin:0;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:.03em;background:#e8edf2;color:#44566a}
    .pa-proy-estado.verde{background:#d9f4e5;color:#0d6b3c}.pa-proy-estado.ambar{background:#ffeec2;color:#8a5a00}.pa-proy-estado.roja{background:#fbdcdc;color:#a02020}
    .pa-proy-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;padding:4px 0;border-bottom:1px dashed #dde6ee}.pa-proy-row span{color:#44566a}.pa-proy-row b{color:#10265f;text-align:right}.pa-proy-row small{font-weight:500;color:#5a6b7b}
    .pa-proy-an{margin-top:8px;font-size:12.5px;line-height:1.5;color:#1b2a38}.pa-proy-det{margin-top:6px;font-size:12.5px}.pa-proy-det summary{cursor:pointer;font-weight:700;color:#10265f;min-height:28px}
    @media(max-width:900px){.pa-line-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.pa-horizontal-body{grid-template-columns:1fr}.pa-hcol-programacion{grid-column:1}.pa-hcol-ratio{border-right:0;border-bottom:1px solid #d8e4ec}}
    @media(max-width:700px){
      .pa-oper-kpis{grid-template-columns:1fr}
      .pa-line-kpis{grid-template-columns:1fr 1fr}
      .pa-line-kpi{border-bottom:1px solid #e2e9ee}
      .pa-line-kpi:last-child{grid-column:1/-1}
      .pa-live-grid{display:grid;grid-template-columns:1fr;overflow:visible}
      .pa-live-card{padding:14px}
      .pa-line-card-horizontal{min-width:0;padding:0}
      .pa-horizontal-body{grid-template-columns:1fr}
      .pa-program-summary{grid-template-columns:1fr 1fr}
      .pa-advance-foot{display:grid;grid-template-columns:1fr}
      .pa-hcol{border-right:0;border-bottom:1px solid #d8e4ec}
      .pa-hcol:last-child{border-bottom:0}
      .pa-line-top{padding:12px 14px}
      .pa-progress-row-horizontal{grid-template-columns:minmax(0,1fr) auto 28px}
      .pa-progress-row-horizontal>strong{grid-column:1;grid-row:2}
      .pa-progress-row-horizontal i{grid-column:2;grid-row:1/3}
      .pa-progress-row-horizontal .pa-cancel-btn{grid-column:3;grid-row:1/3}
      .pa-live-card{padding:14px}.pa-progress-row{grid-template-columns:minmax(0,1fr) auto 28px}.pa-progress-row b{grid-column:1;grid-row:2}.pa-progress-row i{grid-column:2;grid-row:1/3;align-self:center}.pa-cancel-btn{grid-column:3;grid-row:1/3}}
  `;
  document.head.appendChild(css);

  function pedirHoraInicioProduccion(x){
    const ahora=new Date(ahoraServidor());
    const sugerida=
      String(ahora.getHours()).padStart(2,'0')+':' +
      String(ahora.getMinutes()).padStart(2,'0');

    const valor=prompt(
      'Hora real de inicio de producción (HH:MM):',
      sugerida
    );

    if(valor===null)return null;

    const limpio=String(valor).trim();
    if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(limpio)){
      alert('Hora inválida. Usa el formato HH:MM, por ejemplo 07:00.');
      return null;
    }

    const inicioMs=instanteDeTurno(x.fecha,limpio,x.turno);   // FECHA-OPERATIVA: NOCHE de madrugada = día siguiente

    if(!Number.isFinite(inicioMs)){
      alert('No se pudo interpretar la hora de inicio.');
      return null;
    }

    if(inicioMs>ahoraServidor()+60000){
      alert('La hora de inicio no puede estar en el futuro.');
      return null;
    }

    const rango=horario(x.fecha,x.turno,x.compartida);
    if(rango && (inicioMs<rango.inicio || inicioMs>rango.fin)){
      const confirmar=confirm(
        'La hora '+limpio+' está fuera del horario calculado para este turno.\n\n' +
        '¿Deseas usarla de todas formas como hora real de inicio?'
      );
      if(!confirmar)return null;
    }

    return {ms:inicioMs,hora:limpio};
  }

  /* ---------- paradas: catálogo, cierre y corrección de finalización ---------- */
  const horaTxt=ms=>ms?new Date(ms).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false}):'';

  // Cierra los registros de parada abiertos. Al reanudar/cancelar: ahora.
  // Al finalizar sin hora informada (usarEstandar): inicio + estándar si es
  // programada con estándar; si no, la hora de cierre. Nunca después del cierre.
  function cerrarParadasAbiertas(paradas,ahora,finMs,usarEstandar){
    return (Array.isArray(paradas)?paradas:[]).map(r=>{
      if(!r || num(r.fin)>0)return r;
      let fin=ahora;
      if(finMs)fin=Math.min(ahora,finMs);
      else if(usarEstandar && r.clasificacion==='PROGRAMADA' && num(r.estandarMin)>0)
        fin=Math.min(ahora,num(r.inicio)+num(r.estandarMin)*60000);
      return {...r,fin:Math.max(num(r.inicio),fin)};
    });
  }

  // Paradas abiertas (con o sin registro) de las presentaciones del mismo plan.
  function paradasAbiertasDelPlan(x){
    const salida=[];
    (loadProgramaciones() || []).forEach(p=>{
      if(p.linea!==x.linea || p.fecha!==x.fecha)return;
      const mismo=x.turnoPlan==='DÍA' ? ['DÍA','INTERMEDIO'].includes(p.turno) : p.turno===x.turnoPlan;
      if(!mismo)return;
      const op=p.estadoOperacion || {};
      (op.paradas || []).forEach(r=>{
        if(r && !num(r.fin))salida.push({motivo:r.motivo,inicio:num(r.inicio),clasificacion:r.clasificacion,
          estandarMin:num(r.estandarMin)});
      });
      if(!(op.paradas || []).some(r=>!num(r.fin))){
        if(op.estado==='PAUSA' && op.motivoPausa!=='Cambio temporal de producción' && num(op.pausaDesde)>0)
          salida.push({motivo:op.motivoPausa || 'Pausa programada',inicio:num(op.pausaDesde),clasificacion:'PROGRAMADA',estandarMin:0});
        if(['DETENIDA','LISTA'].includes(op.estado) && num(op.detenidaDesde)>0)
          salida.push({motivo:op.motivo || 'Detención de línea',inicio:num(op.detenidaDesde),clasificacion:'NO_PROGRAMADA',estandarMin:0});
      }
    });
    return salida.sort((a,b)=>a.inicio-b.inicio);
  }

  // Pregunta a qué hora se reanudó. undefined = canceló; null = sin dato.
  function pedirHoraReanudacion(abierta){
    const msg='La línea tiene una parada abierta:\n\n'+
      abierta.motivo+' (desde '+horaTxt(abierta.inicio)+')\n\n'+
      '¿A qué hora se reanudó realmente? (HH:MM)\n'+
      'Déjalo vacío si no lo sabes: se cerrará con su duración estándar o con la hora de cierre.';
    for(;;){
      const v=prompt(msg,'');
      if(v===null)return undefined;
      const t=String(v).trim();
      if(!t)return null;
      if(!/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(t)){alert('Hora inválida. Usa HH:MM, por ejemplo 12:45.');continue;}
      const [hh,mm]=t.split(':').map(Number);
      const d=new Date(abierta.inicio);d.setHours(hh,mm,0,0);
      if(d.getTime()<abierta.inicio)d.setDate(d.getDate()+1);   // cruza medianoche
      if(d.getTime()>ahoraServidor()+60000){alert('La hora no puede estar en el futuro.');continue;}
      return d.getTime();
    }
  }

  // Ventana para elegir el motivo del catálogo. Devuelve {motivo,estandarMin,clasificacion} o null.
  /* DETENER LÍNEA: causa › motivo del catálogo de Mantenimiento (37e), detalle (obligatorio en «Otro») y equipo si la causa lo pide.
     Devuelve {motivo (= motivo — detalle),causa,motivoCat,detalle,equipo,estandarMin:0,clasificacion} o null. */
  function pedirCausaMotivo(clasificacion,linea){
    return new Promise(resolve=>{
      const C=window.glacialMotivosParada,G=window.glacialEquipos;
      const fondo=document.createElement('div');
      fondo.className='pa-modal-fondo';
      fondo.innerHTML=`<div class="pa-modal" role="dialog" aria-modal="true">
        <h3>Detener línea</h3>
        <label>Causa</label>
        <select id="pa-causa">${C.opcionesCausa('')}</select>
        <label>Motivo</label>
        <select id="pa-motivo-cat">${C.opcionesMotivo('','')}</select>
        <label id="pa-detalle-et">Detalle (opcional)</label><input id="pa-detalle" maxlength="120">
        ${G?`<div id="pa-equipo-wrap" hidden><label>Equipo que falló (obligatorio)</label>
          <select id="pa-equipo">${G.opciones(linea,'')}</select>
          <div id="pa-equipo-otro-wrap" hidden><input id="pa-equipo-otro" maxlength="80" placeholder="Detalle del equipo (mínimo 5 caracteres)" style="margin-top:6px"></div></div>`:''}
        <div class="pa-modal-error" id="pa-modal-error" role="alert" hidden></div>
        <small class="pa-modal-nota">Queda registrada con hora de inicio; se cierra al reanudar.</small>
        <div class="pa-modal-acc"><button type="button" class="btn btn-ghost" data-c>Cancelar</button>
          <button type="button" class="btn btn-primary" data-a>Aceptar</button></div></div>`;
      document.body.appendChild(fondo);
      const selC=fondo.querySelector('#pa-causa'),selM=fondo.querySelector('#pa-motivo-cat'),det=fondo.querySelector('#pa-detalle'),detEt=fondo.querySelector('#pa-detalle-et');
      const eqWrap=fondo.querySelector('#pa-equipo-wrap'),eqSel=fondo.querySelector('#pa-equipo'),eqOtroWrap=fondo.querySelector('#pa-equipo-otro-wrap'),eqOtro=fondo.querySelector('#pa-equipo-otro');
      const errorEl=fondo.querySelector('#pa-modal-error');
      const mostrarError=t=>{errorEl.textContent=t||'';errorEl.hidden=!t;};
      const alCambiarCausa=()=>{
        const ms=C.motivosDe(selC.value);
        selM.innerHTML=C.opcionesMotivo(selC.value,ms.length===1?ms[0]:'');          // con un solo motivo, queda elegido
        const min=C.detalleMin(selC.value);
        detEt.textContent=min?'Detalle (obligatorio, mínimo '+min+' caracteres)':'Detalle (opcional)';
        if(eqWrap)eqWrap.hidden=!(selC.value&&C.pideEquipo(selC.value));
        mostrarError('');
      };
      selC.addEventListener('change',alCambiarCausa);
      if(eqSel)eqSel.addEventListener('change',()=>{eqOtroWrap.hidden=eqSel.value!=='__otro__';mostrarError('');});
      const cerrar=v=>{fondo.remove();resolve(v);};
      fondo.querySelector('[data-c]').onclick=()=>cerrar(null);
      fondo.addEventListener('click',e=>{if(e.target===fondo)cerrar(null);});
      fondo.querySelector('[data-a]').onclick=()=>{
        const err=C.validar(selC.value,selM.value,det.value);
        if(err){mostrarError(err);return;}
        let equipo='';
        if(G&&C.pideEquipo(selC.value)){
          const e2=G.validar(eqSel.value,eqOtro?eqOtro.value:'');
          if(e2){mostrarError(e2);return;}
          equipo=G.componer(eqSel.value,eqOtro?eqOtro.value:'');
        }
        cerrar({motivo:C.componerDescripcion(selM.value,det.value),causa:selC.value,motivoCat:selM.value,detalle:det.value.trim(),estandarMin:0,clasificacion,equipo});
      };
      selC.focus();
    });
  }

  function pedirMotivoCatalogo(clasificacion,linea){
    if(clasificacion!=='PROGRAMADA'&&window.glacialMotivosParada)return pedirCausaMotivo(clasificacion,linea);
    return new Promise(resolve=>{
      const programada=clasificacion==='PROGRAMADA';
      const G=window.glacialEquipos;
      const opciones=programada
        ? listaMotivosProgramados()
        : CATALOGO_MOTIVOS_PARADA.noProgramadas.map(nombre=>({nombre,estandarMin:0}));
      const fondo=document.createElement('div');
      fondo.className='pa-modal-fondo';
      fondo.innerHTML=`<div class="pa-modal" role="dialog" aria-modal="true">
        <h3>${programada?'Pausa programada':'Detener línea'}</h3>
        <label>Motivo</label>
        <select id="pa-motivo">${opciones.map((o,i)=>`<option value="${i}">${esc(o.nombre)}${o.estandarMin?` · estándar ${o.estandarMin} min`:''}</option>`).join('')}</select>
        <div id="pa-motivo-detalle-wrap" hidden><label>Detalle</label><input id="pa-motivo-detalle" maxlength="120"></div>
        ${!programada&&G?`<div id="pa-equipo-wrap" hidden><label>Equipo que falló (obligatorio)</label>
          <select id="pa-equipo">${G.opciones(linea,'')}</select>
          <div id="pa-equipo-otro-wrap" hidden><input id="pa-equipo-otro" maxlength="80" placeholder="Detalle del equipo (mínimo 5 caracteres)" style="margin-top:6px"></div></div>`:''}
        <div class="pa-modal-error" id="pa-modal-error" role="alert" hidden></div>
        <small class="pa-modal-nota">${programada
          ? 'El tiempo que exceda el estándar se contará como parada no programada.'
          : 'Queda registrada con hora de inicio; se cierra al reanudar.'}</small>
        <div class="pa-modal-acc"><button type="button" class="btn btn-ghost" data-c>Cancelar</button>
          <button type="button" class="btn btn-primary" data-a>Aceptar</button></div></div>`;
      document.body.appendChild(fondo);
      const sel=fondo.querySelector('#pa-motivo'),wrap=fondo.querySelector('#pa-motivo-detalle-wrap');
      const eqWrap=fondo.querySelector('#pa-equipo-wrap'),eqSel=fondo.querySelector('#pa-equipo'),eqOtroWrap=fondo.querySelector('#pa-equipo-otro-wrap'),eqOtro=fondo.querySelector('#pa-equipo-otro');
      const errorEl=fondo.querySelector('#pa-modal-error');
      const mostrarError=t=>{errorEl.textContent=t||'';errorEl.hidden=!t;};
      // El equipo se pide solo cuando el motivo es «Falla de máquina».
      const alternar=()=>{
        wrap.hidden=!(opciones[sel.value].nombre==='Otro');
        if(eqWrap)eqWrap.hidden=!(G&&G.esFalla(opciones[sel.value].nombre));
        mostrarError('');
      };
      sel.addEventListener('change',alternar);alternar();
      if(eqSel)eqSel.addEventListener('change',()=>{eqOtroWrap.hidden=eqSel.value!=='__otro__';mostrarError('');});
      const cerrar=v=>{fondo.remove();resolve(v);};
      fondo.querySelector('[data-c]').onclick=()=>cerrar(null);
      fondo.addEventListener('click',e=>{if(e.target===fondo)cerrar(null);});
      fondo.querySelector('[data-a]').onclick=()=>{
        const o=opciones[sel.value];
        let motivo=o.nombre,equipo='';
        if(o.nombre==='Otro'){
          const d=fondo.querySelector('#pa-motivo-detalle').value.trim();
          if(d.length<5){mostrarError('Escribe el detalle del motivo (mínimo 5 caracteres).');return;}
          motivo='Otro — '+d;
        }
        // «Falla de máquina»: el equipo es obligatorio («Otro equipo» pide un detalle de al menos 5 caracteres).
        if(!programada&&G&&G.esFalla(o.nombre)){
          const err=G.validar(eqSel.value,eqOtro?eqOtro.value:'');
          if(err){mostrarError(err);return;}
          equipo=G.componer(eqSel.value,eqOtro?eqOtro.value:'');
        }
        cerrar({motivo,estandarMin:o.estandarMin || 0,clasificacion,equipo});
      };
      sel.focus();
    });
  }

  /* ---------- CORREGIR FINALIZACIÓN (supervisor / administrador) ---------- */
  async function corregirFinalizacion(x){
    if(!x || quienControla(x.linea)!=='supervisor' || x.op?.estado!=='FINALIZADA')return;
    const mismoPlan=p=>p.linea===x.linea && p.fecha===x.fecha &&
      (x.turnoPlan==='DÍA' ? ['DÍA','INTERMEDIO'].includes(p.turno) : p.turno===x.turnoPlan);
    const k=llave(x.linea,x.fecha,x.turnoPlan || x.turno,x.marca,x.presentacion);
    const plan=(loadProgramaciones() || []).filter(p=>mismoPlan(p) && p.estadoOperacion?.estado==='FINALIZADA');
    const item=plan.find(p=>p.clave===k);
    if(!item){alert('No se encontró la presentación finalizada. Actualiza el tablero.');return;}

    const cierreActual=num(item.estadoOperacion.finalizadaEn);
    const inicioLinea=Math.min(...plan.map(p=>num(p.estadoOperacion?.inicio)).filter(Boolean),cierreActual);
    const produccionActual=Math.round(producidoDe(x));
    const filas=[];
    plan.forEach(p=>paradasEditablesItem(p).forEach(r=>filas.push({...r,itemClave:p.clave,
      presentacion:p.marca+' · '+presUI(p.linea,p.marca,p.presentacion)})));

    const datos=await new Promise(resolve=>{
      const fondo=document.createElement('div');
      fondo.className='pa-modal-fondo';
      fondo.innerHTML=`<div class="pa-modal pa-modal-ancho" role="dialog" aria-modal="true">
        <h3>Corregir finalización · ${esc(x.linea)}</h3>
        <div class="pa-modal-grid">
          <div><label>Hora real de cierre</label><input type="time" id="pa-c-cierre" value="${horaTxt(cierreActual)}"></div>
          <div><label>Producción final (${esc(x.marca)})</label><input type="number" id="pa-c-prod" value="${produccionActual}" readonly disabled title="No se edita aquí"><small class="pa-modal-nota">Sale de Paletas (turno en curso) o del registro de producción (turno cerrado); se corrige allí.</small></div>
        </div>
        <label>Paradas y pausas registradas</label>
        ${filas.length ? `<div class="pa-modal-tabla"><table><thead><tr><th>Motivo</th><th>Tipo</th><th>Inicio</th><th>Fin</th><th>Eliminar</th></tr></thead><tbody>
          ${filas.map((r,i)=>`<tr><td>${esc(r.motivo)}<small>${esc(r.presentacion)}${r.legado?' · registro antiguo':''}</small></td>
            <td>${r.tipo==='PAUSA'?'Pausa':'Detención'}</td>
            <td><input type="time" data-i="${i}" data-c="ini" value="${horaTxt(r.inicio)}"></td>
            <td><input type="time" data-i="${i}" data-c="fin" value="${horaTxt(r.fin)}"></td>
            <td><input type="checkbox" data-i="${i}" data-c="del"></td></tr>`).join('')}</tbody></table></div>`
          : '<p class="pa-modal-nota">No hay paradas registradas.</p>'}
        <label>Motivo de la corrección (obligatorio)</label>
        <textarea id="pa-c-motivo" rows="2" maxlength="200"></textarea>
        <small class="pa-modal-nota">Las paradas abiertas se cierran con la hora de cierre y las que la exceden se recortan. Se recalculan paradas, ratios y cumplimiento, y queda un historial de la corrección.</small>
        <div class="pa-modal-acc"><button type="button" class="btn btn-ghost" data-c>Cancelar</button>
          <button type="button" class="btn btn-primary" data-a>Guardar corrección</button></div></div>`;
      document.body.appendChild(fondo);
      const cerrar=v=>{fondo.remove();resolve(v);};
      fondo.querySelector('[data-c]').onclick=()=>cerrar(null);
      fondo.querySelector('[data-a]').onclick=()=>{
        const aMs=(base,hhmm,despuesDe)=>{
          const [h,m]=String(hhmm).split(':').map(Number);
          const d=new Date(base);d.setHours(h,m,0,0);
          if(despuesDe && d.getTime()<=despuesDe)d.setDate(d.getDate()+1);   // cruza medianoche
          return d.getTime();
        };
        const motivo=fondo.querySelector('#pa-c-motivo').value.trim();
        const hc=fondo.querySelector('#pa-c-cierre').value;
        // La producción sale de producidoDe (Paletas o registro): aquí solo se muestra y queda igual en el historial.
        const prod=produccionActual;
        if(!motivo){alert('El motivo de la corrección es obligatorio.');return;}
        if(!hc){alert('Indica la hora real de cierre.');return;}
        const cierre=aMs(cierreActual,hc,inicioLinea);
        if(cierre<=inicioLinea){alert('El cierre debe ser posterior al inicio de la línea.');return;}
        if(cierre>ahoraServidor()+60000){alert('El cierre no puede estar en el futuro.');return;}
        const nuevas=[];
        for(let i=0;i<filas.length;i++){
          const ini=fondo.querySelector(`[data-i="${i}"][data-c="ini"]`).value;
          const fin=fondo.querySelector(`[data-i="${i}"][data-c="fin"]`).value;
          const del=fondo.querySelector(`[data-i="${i}"][data-c="del"]`).checked;
          if(del){nuevas.push({...filas[i],eliminar:true});continue;}
          if(!ini || !fin){alert('Completa inicio y fin de cada parada (o elimínala).');return;}
          const iMs=aMs(filas[i].inicio,ini,0);
          const fMs=aMs(iMs,fin,iMs);
          nuevas.push({...filas[i],inicio:iMs,fin:fMs,eliminar:false});
        }
        cerrar({motivo,cierre,prod,filas:nuevas});
      };
    });
    if(!datos)return;

    const ref=db.collection('sync').doc('programaciones');
    const itemsGuardados=await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      const items=snap.exists && Array.isArray(snap.data().items) ? snap.data().items.slice() : [];
      const ahora=ahoraServidor();
      const usuario=nombreOperador();
      const idx=items.findIndex(p=>p.clave===k);
      if(idx<0 || items[idx].estadoOperacion?.estado!=='FINALIZADA')
        throw new Error('El estado cambió. Actualiza el tablero.');
      const anterior={
        cierre:cierreActual,produccionFinal:produccionActual,
        paradas:filas.map(f=>({id:f.id,motivo:f.motivo,inicio:f.inicio,fin:f.fin}))
      };
      const nuevo={
        cierre:datos.cierre,produccionFinal:datos.prod,
        paradas:datos.filas.filter(f=>!f.eliminar && f.inicio<datos.cierre)
          .map(f=>({id:f.id,motivo:f.motivo,inicio:f.inicio,fin:Math.min(f.fin,datos.cierre)}))
      };
      items.forEach((p,j)=>{
        if(!mismoPlan(p) || p.estadoOperacion?.estado!=='FINALIZADA')return;
        const op={...p.estadoOperacion};
        op.finalizadaEn=datos.cierre;
        // Todas las paradas pasan a registros con hora; se recortan al cierre.
        op.paradas=datos.filas
          .filter(f=>f.itemClave===p.clave && !f.eliminar && f.inicio<datos.cierre)
          .map(f=>({id:f.legado?`${p.clave}|${f.inicio}|mig`:f.id,tipo:f.tipo,motivo:f.motivo,
            clasificacion:f.clasificacion,estandarMin:f.estandarMin || 0,inicio:f.inicio,
            fin:Math.min(f.fin,datos.cierre),origen:'BOTON'}));
        op.paradasMigradas=true;
        op.pausaDesde=0;op.detenidaDesde=0;
        op.corregida=true;op.corregidaEn=ahora;op.corregidaPor=usuario;
        op.actualizadoEn=ahora;op.actualizadoPor=usuario;
        const historial=Array.isArray(p.historialAlertas) ? p.historialAlertas.slice() : [];
        if(p.clave===k){
          historial.push({
            id:`${k}|${ahora}|correccion`,tipo:'correccion_finalizacion',momento:ahora,
            operador:usuario,motivo:datos.motivo,anterior,nuevo
          });
        }
        items[j]={...p,estadoOperacion:op,historialAlertas:historial.slice(-300)};
      });
      // Lote 4 · Parte A: CORREGIR_FIN con valor anterior y nuevo y el motivo obligatorio, en la MISMA transacción.
      if(!window.__vistaComo){
        const resumirParadas=lista=>({n:lista.length,min:Math.round(lista.reduce((s,f)=>s+Math.max(0,num(f.fin)-num(f.inicio)),0)/60000)});
        const pa=resumirParadas(anterior.paradas),pn=resumirParadas(nuevo.paradas);
        const evento=eventoBitacora('CORREGIR_FIN',datosQuienOpera(),x,k,'FINALIZADA',items[idx].estadoOperacion,{
          motivo:'',
          motivoCorreccion:datos.motivo,
          valorAnterior:{cierre:anterior.cierre,produccionFinal:anterior.produccionFinal,paradas:pa.n,minutosParada:pa.min},
          valorNuevo:{cierre:nuevo.cierre,produccionFinal:nuevo.produccionFinal,paradas:pn.n,minutosParada:pn.min}
        });
        tx.set(db.collection(COLECCION_BITACORA).doc(),evento);
      }
      tx.set(ref,{items,updatedAt:ahora});
      return items;
    });
    _programacionesCache=itemsGuardados;
    if(state.currentTab==='produccion-actual')renderProduccionActualTab();
  }

  /* ---------- MOTIVO PENDIENTE: completarlo después (evento COMPLETAR_MOTIVO) ---------- */
  // Pendiente = sin motivo, «Otro» a secas o «Otro — …» con menos de 5 caracteres de detalle.
  function esMotivoPendiente(m){
    const t=String(m||'').trim().toLowerCase();
    if(!t || t==='otro' || t==='sin motivo registrado')return true;
    const r=t.match(/^otro\s*[—–-]\s*(.*)$/);
    return !!r && r[1].trim().length<5;
  }
  const motivoAbierto=op=>op?.estado==='PAUSA' ? (op.motivoPausa||'') : (op?.motivo||'');
  function motivoPendienteAbierto(op){
    return !!op && ['DETENIDA','LISTA','PAUSA'].includes(op.estado) && !op.motivoDetalle &&
      esMotivoPendiente(motivoAbierto(op));
  }
  function idParadaAbierta(op){
    const abiertas=(Array.isArray(op?.paradas) ? op.paradas : []).filter(p=>p && !num(p.fin));
    return abiertas.length ? (abiertas[abiertas.length-1].id || null) : null;
  }
  window.glacialEsMotivoPendiente=esMotivoPendiente;

  /* ---------- EQUIPO PENDIENTE: una parada por «Falla de máquina» que quedó sin equipo (se indica después con COMPLETAR_MOTIVO) ---------- */
  function equipoPendienteAbierto(op){
    const G=window.glacialEquipos;
    return !!(G && op && ['DETENIDA','LISTA'].includes(op.estado) && G.esFalla(op.causa||op.motivo) && !String(op.equipo||'').trim());
  }
  window.glacialEquipoPendiente=equipoPendienteAbierto;
  // Ventana propia (sin prompt) para elegir el equipo. Devuelve el texto del equipo o null.
  function pedirEquipo(linea){
    return new Promise(resolve=>{
      const G=window.glacialEquipos;
      const fondo=document.createElement('div');
      fondo.className='pa-modal-fondo';
      fondo.innerHTML=`<div class="pa-modal" role="dialog" aria-modal="true">
        <h3>Indicar equipo</h3>
        <label>Equipo que falló</label>
        <select id="pa-equipo">${G.opciones(linea,'')}</select>
        <div id="pa-equipo-otro-wrap" hidden><input id="pa-equipo-otro" maxlength="80" placeholder="Detalle del equipo (mínimo 5 caracteres)" style="margin-top:6px"></div>
        <div class="pa-modal-error" id="pa-modal-error" role="alert" hidden></div>
        <div class="pa-modal-acc"><button type="button" class="btn btn-ghost" data-c>Cancelar</button>
          <button type="button" class="btn btn-primary" data-a>Guardar</button></div></div>`;
      document.body.appendChild(fondo);
      const sel=fondo.querySelector('#pa-equipo'),otroWrap=fondo.querySelector('#pa-equipo-otro-wrap'),otro=fondo.querySelector('#pa-equipo-otro'),err=fondo.querySelector('#pa-modal-error');
      sel.addEventListener('change',()=>{otroWrap.hidden=sel.value!=='__otro__';err.hidden=true;});
      const cerrar=v=>{fondo.remove();resolve(v);};
      fondo.querySelector('[data-c]').onclick=()=>cerrar(null);
      fondo.addEventListener('click',e=>{if(e.target===fondo)cerrar(null);});
      fondo.querySelector('[data-a]').onclick=()=>{
        const e=G.validar(sel.value,otro.value);
        if(e){err.textContent=e;err.hidden=false;return;}
        cerrar(G.componer(sel.value,otro.value));
      };
      sel.focus();
    });
  }
  // Aviso con ventana propia (sin alert).
  function avisoPa(texto){
    return new Promise(resolve=>{
      const f=document.createElement('div');
      f.className='pa-modal-fondo';
      f.innerHTML=`<div class="pa-modal" role="alertdialog" aria-modal="true"><p style="margin:0;color:#35506a">${esc(texto)}</p>
        <div class="pa-modal-acc"><button type="button" class="btn btn-primary" data-a>Entendido</button></div></div>`;
      document.body.appendChild(f);
      f.querySelector('[data-a]').onclick=()=>{f.remove();resolve();};
    });
  }
  async function indicarEquipoLinea(x){
    const op0=x.op || {};
    if(!equipoPendienteAbierto(op0)){await avisoPa('Esta parada ya tiene equipo.');return;}
    if(!['supervisor','mtto','control'].includes(x.puede))return;
    if(typeof esMantCompartido==='function' && esMantCompartido() &&
       !(typeof window.mantTecnicoActivo==='function' && window.mantTecnicoActivo())){
      await avisoPa('Identifícate con tu PIN antes de operar una línea.');
      if(typeof window.mantCerrarIdentificacion==='function')window.mantCerrarIdentificacion(true);
      return;
    }
    const equipo=await pedirEquipo(x.linea);
    if(!equipo)return;
    const k=llave(x.linea,x.fecha,x.turnoPlan || x.turno,x.marca,x.presentacion);
    const ref=db.collection('sync').doc('programaciones');
    const quien=datosQuienOpera();
    const refBit=db.collection(COLECCION_BITACORA).doc();
    let evento=null;
    const items=await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      const lista=snap.exists && Array.isArray(snap.data().items) ? snap.data().items.slice() : [];
      const i=lista.findIndex(p=>p.clave===k);
      if(i<0)throw new Error('No hay programación para esta presentación.');
      const previo=lista[i].estadoOperacion || {};
      if(!equipoPendienteAbierto(previo))throw new Error('La parada ya tiene equipo o ya no está abierta. Actualiza el tablero.');
      const ahora=ahoraServidor();
      const abierta=idParadaAbierta(previo);
      const paradas=(Array.isArray(previo.paradas)?previo.paradas:[]).map(p=>p && abierta && p.id===abierta ? {...p,equipo} : p);
      const op={...previo,equipo,paradas,equipoCompletadoPor:nombreOperador(),equipoCompletadoEn:ahora};
      lista[i]={...lista[i],estadoOperacion:op};
      // La regla de la bitácora exige motivoDetalle de 5 caracteres o más en COMPLETAR_MOTIVO: sin detalle propio se usa «Equipo: <nombre>».
      evento=eventoBitacora('COMPLETAR_MOTIVO',quien,x,k,previo.estado,op,{
        motivo:'',paradaId:abierta,motivoAnterior:motivoAbierto(previo),motivoDetalle:('Equipo: '+equipo).slice(0,160),equipo
      });
      if(quien.compartida)tx.set(refBit,evento);
      tx.set(ref,{items:lista,updatedAt:ahora});
      return lista;
    });
    if(evento && !quien.compartida && !window.__vistaComo){
      Promise.resolve(refBit.set(evento)).catch(e=>
        console.warn('Bitácora de Mantenimiento: no se pudo registrar el equipo:',e && e.message ? e.message : e));
    }
    _programacionesCache=items;
    if(state.currentTab==='produccion-actual')renderProduccionActualTab();
  }

  async function completarMotivoLinea(x){
    const op0=x.op || {};
    if(!motivoPendienteAbierto(op0)){alert('Esta parada no tiene un motivo pendiente.');return;}
    if(!['supervisor','mtto','control'].includes(x.puede))return;
    if(typeof esMantCompartido==='function' && esMantCompartido() &&
       !(typeof window.mantTecnicoActivo==='function' && window.mantTecnicoActivo())){
      alert('Identifícate con tu PIN antes de operar una línea.');
      if(typeof window.mantCerrarIdentificacion==='function')window.mantCerrarIdentificacion(true);
      return;
    }
    const entrada=prompt('Describe el motivo de la parada (mínimo 5 caracteres):');
    if(entrada===null)return;
    const texto=String(entrada).trim().slice(0,160);
    if(texto.length<5){alert('La descripción debe tener al menos 5 caracteres.');return;}
    const k=llave(x.linea,x.fecha,x.turnoPlan || x.turno,x.marca,x.presentacion);
    const ref=db.collection('sync').doc('programaciones');
    const quien=datosQuienOpera();
    const refBit=db.collection(COLECCION_BITACORA).doc();
    let evento=null;
    const items=await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      const lista=snap.exists && Array.isArray(snap.data().items) ? snap.data().items.slice() : [];
      const i=lista.findIndex(p=>p.clave===k);
      if(i<0)throw new Error('No hay programación para esta presentación.');
      const previo=lista[i].estadoOperacion || {};
      if(!motivoPendienteAbierto(previo))throw new Error('La parada ya no tiene un motivo pendiente. Actualiza el tablero.');
      const ahora=ahoraServidor();
      const op={...previo,motivoDetalle:texto,motivoCompletadoPor:nombreOperador(),motivoCompletadoEn:ahora};
      lista[i]={...lista[i],estadoOperacion:op};
      evento=eventoBitacora('COMPLETAR_MOTIVO',quien,x,k,previo.estado,op,{
        motivo:'',paradaId:idParadaAbierta(previo),motivoAnterior:motivoAbierto(previo),motivoDetalle:texto
      });
      if(quien.compartida)tx.set(refBit,evento);          // atómico: sin técnico registrado no se completa
      tx.set(ref,{items:lista,updatedAt:ahora});
      return lista;
    });
    if(evento && !quien.compartida && !window.__vistaComo){
      Promise.resolve(refBit.set(evento)).catch(e=>
        console.warn('Bitácora de Mantenimiento: no se pudo registrar COMPLETAR_MOTIVO:',e && e.message ? e.message : e));
    }
    _programacionesCache=items;
    if(state.currentTab==='produccion-actual')renderProduccionActualTab();
  }

  async function cambiarEstado(x,accion){
    if(!x)return;
    if(accion==='corregir')return corregirFinalizacion(x);
    if(accion==='completarMotivo'){
      try{await completarMotivoLinea(x);}
      catch(err){alert('No se pudo completar el motivo: '+((err&&err.message)||err));}
      return;
    }
    if(accion==='indicarEquipo'){
      try{await indicarEquipoLinea(x);}
      catch(err){await avisoPa('No se pudo guardar el equipo: '+((err&&err.message)||err));}
      return;
    }

    // Cuenta compartida de Mantenimiento: sin técnico identificado por PIN no se opera la línea.
    if(ACCIONES_BITACORA[accion] && typeof esMantCompartido==='function' && esMantCompartido() &&
       !(typeof window.mantTecnicoActivo==='function' && window.mantTecnicoActivo())){
      alert('Identifícate con tu PIN antes de operar una línea.');
      if(typeof window.mantCerrarIdentificacion==='function')window.mantCerrarIdentificacion(true);
      return;
    }

    if(accion==='reactivar' && !esAdministradorPA()){
      alert('Solo el Administrador puede reactivar una programación cancelada.');
      return;
    }
    // Reabrir es una acción administrativa independiente: puede hacerse
    // sobre una producción finalizada aunque el turno ya haya terminado.
    if(accion==='reabrir'){
      if(!puedeReabrirProduccion())return;
    }else{
      const estadoActual=x.op?.estado;
      const operacionAbierta=['EN_PRODUCCION','DETENIDA','LISTA','PAUSA'].includes(estadoActual);
      if(!quienControla(x.linea))return;
      // Una operación abierta conserva sus controles entre cambios de turno.
      // Iniciar una presentación NUEVA fuera del bloque vigente ya no se ignora en silencio: el supervisor la inicia tras una confirmación explícita
      // (más abajo; es lo que anuncia el aviso «Al iniciar se solicitará confirmación»). Caso típico: la línea arranca a las 19:00 y el bloque Noche empieza a las 21:00.
    }

    const controlador=quienControla(x.linea);
    const esSupervisor=controlador==='supervisor';
    const esControlOperativo=['mtto','control'].includes(controlador);

    if(accion==='iniciar' && !esSupervisor)return;

    // Mantenimiento / Control operativo puede DETENER, PAUSAR,
    // REANUDAR y marcar INTERVENCIÓN TERMINADA.
    if(['reanudar','pausa'].includes(accion) &&
       !(esSupervisor || esControlOperativo))return;

    // FINALIZAR y CANCELAR siguen siendo exclusivos de Producción.
    if(['finalizar','cancelar','corregirInicio'].includes(accion) && !esSupervisor)return;

    // REABRIR exige el permiso específico, independientemente del rol.
    if(accion==='reabrir' && !puedeReabrirProduccion())return;

    if(accion==='lista' && !esControlOperativo)return;

    if(accion==='reabrir'){
      const ok=confirm(
        '¿Reabrir esta producción finalizada?\n\n' +
        'No se eliminará ningún dato registrado. La producción quedará ABIERTA ' +
        'para corregir información y, si corresponde, reanudarla o volver a finalizarla.'
      );
      if(!ok)return;
    }

    let inicioElegido=null;
    if(accion==='iniciar'){
      if(!turnoActivo(x.fecha,x.turno)){
        const vigente=turnoVigente(),bl=bloqueAhora();
        const enFranja=!!(bl && bl.enFranja && bl.reanudaMs);
        const ok=confirm(enFranja
          ? `La planta figura «sin producción» hasta las ${hhmmBloque(bl.reanudaMs)} (inicio del bloque ${GlacialIndicadores.nombreBloque(x.turno,'pantalla','titulo')}), pero vas a iniciar ${x.marca} de ${x.linea} (${x.fecha} · ${x.turno}) ahora.\n\nLa hora de inicio que indiques quedará registrada como inicio real.\n\n¿Iniciar esta presentación?`
          : `La programación seleccionada es ${x.fecha} · ${x.turno}, pero el turno operativo vigente es ${vigente.fecha} · ${vigente.turno}.\n\n¿Deseas iniciar esta presentación de todas formas?`
        );
        if(!ok)return;
      }
      inicioElegido=pedirHoraInicioProduccion(x);
      if(!inicioElegido)return;
    }

    let inicioCorregido=null;
    if(accion==='corregirInicio'){
      const inicioActual=Number(x.op?.inicio || 0);
      if(!inicioActual){
        alert('Esta presentación no tiene una hora de inicio registrada.');
        return;
      }

      const d=new Date(inicioActual);
      const horaAnterior=String(d.getHours()).padStart(2,'0')+':' +
        String(d.getMinutes()).padStart(2,'0');
      const valor=prompt('Corregir hora real de inicio (HH:MM):',horaAnterior);
      if(valor===null)return;
      const limpio=String(valor).trim();
      if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(limpio)){
        alert('Hora inválida. Usa HH:MM, por ejemplo 07:00.');
        return;
      }
      const ms=instanteDeTurno(x.fecha,limpio,x.turno);   // FECHA-OPERATIVA: NOCHE de madrugada = día siguiente
      if(!Number.isFinite(ms) || ms>ahoraServidor()+60000){
        alert('La hora indicada no es válida o está en el futuro.');
        return;
      }
      const motivoCorr=String(prompt('Motivo de la corrección (obligatorio, mínimo 5 caracteres):') || '').trim().slice(0,160);
      if(motivoCorr.length<5){
        alert('El motivo de la corrección es obligatorio (mínimo 5 caracteres). No se corrigió la hora.');
        return;
      }
      if(!confirm(
        '¿Corregir la hora de inicio de '+x.marca+' de '+horaAnterior+' a '+limpio+'?\n\n'+
        'No se modificarán las unidades producidas ni los registros de Paletas.'
      ))return;
      inicioCorregido={ms,hora:limpio,anterior:inicioActual,motivo:motivoCorr};
    }

    let motivo='';
    let motivoPausa='';
    let motivoCancelacion='';
    let motivoElegido=null;
    let equipoElegido='';           // equipo que falló (solo en las causas que piden equipo)
    let causaElegida='';            // causa del catálogo de motivos (37e)
    // El motivo sale del catálogo (con duración estándar para las programadas).
    if(accion==='detener'){
      motivoElegido=await pedirMotivoCatalogo('NO_PROGRAMADA',x.linea);
      if(!motivoElegido)return;
      motivo=motivoElegido.motivo.slice(0,160);
      equipoElegido=String(motivoElegido.equipo||'').slice(0,100);
      causaElegida=String(motivoElegido.causa||'').slice(0,80);
    }
    if(accion==='pausa'){
      motivoElegido=await pedirMotivoCatalogo('PROGRAMADA');
      if(!motivoElegido)return;
      motivoPausa=motivoElegido.motivo.slice(0,160);
    }
    // Al finalizar con una pausa/parada abierta, se pregunta cuándo se reanudó realmente.
    let finParadaMs=null;
    if(accion==='finalizar'){
      const abiertas=paradasAbiertasDelPlan(x);
      if(abiertas.length){
        const r=pedirHoraReanudacion(abiertas[0]);
        if(r===undefined)return;          // canceló: no se finaliza
        finParadaMs=r;                    // null = usar estándar / hora de cierre
      }
    }
    let motivoReactivacion='';
    if(accion==='reactivar'){
      if(x.op?.estado!=='CANCELADA'){alert('Esta presentación no está cancelada.');return;}
      motivoReactivacion=String(prompt('Reactivar «'+x.marca+'» ('+x.linea+'): vuelve a quedar disponible para producir.\n\nMotivo (obligatorio, mínimo 5 caracteres):')||'').trim().slice(0,160);
      if(motivoReactivacion.length<5){
        alert('El motivo es obligatorio (mínimo 5 caracteres). No se reactivó.');
        return;
      }
    }
    if(accion==='cancelar'){
      motivoCancelacion=prompt(
        'Motivo de cancelación (opcional):'
      )?.trim() || '';
      motivoCancelacion=motivoCancelacion.slice(0,160);
    }
    const ref=db.collection('sync').doc('programaciones');
    const k=llave(x.linea,x.fecha,x.turnoPlan || x.turno,x.marca,x.presentacion);
    // Bitácora de Mantenimiento: con la cuenta compartida se escribe DENTRO de la misma transacción
    // (si no puede registrarse quién lo hizo, la acción no se aplica); para los demás usuarios se
    // escribe después y un fallo solo avisa en consola (no bloquea la producción).
    const accionBit=ACCIONES_BITACORA[accion] || '';
    const quienOpera=datosQuienOpera();
    const refBit=accionBit ? db.collection(COLECCION_BITACORA).doc() : null;
    let eventoBit=null;
    const itemsGuardados=await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      const items=snap.exists && Array.isArray(snap.data().items)
        ? snap.data().items.slice() : [];
      const i=items.findIndex(p=>p.clave===k);
      if(i<0 || num(items[i].cantidadProgramada)<=0)throw new Error('No hay programación para esta presentación.');
      const ahora=ahoraServidor();
      const previo=items[i].estadoOperacion || {};
      const e=previo.estado;
      const permitido={
        iniciar:!e || e==='FINALIZADA' || e==='PENDIENTE',detener:e==='EN_PRODUCCION',
        pausa:e==='EN_PRODUCCION',lista:e==='DETENIDA',
        reanudar:['DETENIDA','LISTA','PAUSA'].includes(e),
        finalizar:['EN_PRODUCCION','DETENIDA','LISTA'].includes(e),
        cancelar:e!=='CANCELADA' && e!=='FINALIZADA',
        reabrir:e==='FINALIZADA',
        reactivar:e==='CANCELADA',
        corregirInicio:['EN_PRODUCCION','DETENIDA','LISTA','PAUSA'].includes(e)
      };
      // Varios técnicos a la vez: si otro ya hizo esta misma acción, se avisa y NO se duplica la parada.
      const yaHecho={
        detener:['DETENIDA','LISTA'].includes(e) ? 'detuvo esta línea' : '',
        pausa:e==='PAUSA' ? 'puso esta línea en pausa' : '',
        reanudar:e==='EN_PRODUCCION' ? 'reanudó esta línea' : '',
        lista:e==='LISTA' ? 'marcó la intervención como terminada en esta línea' : ''
      }[accion];
      if(yaHecho){
        const hora=num(previo.actualizadoEn)
          ? new Date(num(previo.actualizadoEn)).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'}) : '';
        const error=new Error('Otro usuario ya '+yaHecho+(previo.actualizadoPor ? ' ('+previo.actualizadoPor+(hora?' a las '+hora:'')+')' : '')+
          '. No se duplicó el registro; el tablero se actualizará.');
        error.codigo='YA_REGISTRADO';
        throw error;
      }
      if(!permitido[accion])throw new Error('El estado cambió. Actualiza el tablero.');
      const mismoPlan=p=>p.linea===x.linea && p.fecha===x.fecha &&
        (x.turnoPlan==='DÍA' ? ['DÍA','INTERMEDIO'].includes(p.turno)
          : p.turno===x.turnoPlan);
      if(accion==='iniciar'){
        const otraDetenida=items.some((p,j)=>j!==i && p.linea===x.linea &&
          mismoPlan(p) &&
          p.estadoOperacion?.estado==='DETENIDA');
        if(otraDetenida)throw new Error('Primero resuelve la detención de la otra presentación.');
        items.forEach((p,j)=>{
          if(j===i || !mismoPlan(p))return;
          const estadoOtro=p.estadoOperacion?.estado;
          if(estadoOtro==='EN_PRODUCCION'){
            items[j]={
              ...p,
              estadoOperacion:{
                ...p.estadoOperacion,
                estado:'PAUSA',
                pausaDesde:ahora,
                motivoPausa:'Cambio temporal de producción',
                actualizadoEn:ahora,
                actualizadoPor:nombreOperador()
              }
            };
          } else if(estadoOtro==='PAUSA' && window.glacialPausas){
            // Pausa REAL (p. ej. refrigerio) de otra presentación del plan: al iniciar esta, esa pausa terminó. Se cierra con esta hora
            // (registro de parada y historial) y la otra queda «estacionada» (24b-pausas-sin-cerrar.js). Un «cambio temporal» no se toca.
            items[j]=window.glacialPausas.estacionarProgramacion(p,ahora,nombreOperador());
          }
        });
      }
      const op={...previo,actualizadoEn:ahora,
        actualizadoPor:nombreOperador()};
      if(accion==='iniciar'){
        Object.assign(op,{
          estado:'EN_PRODUCCION',
          inicio:inicioElegido.ms,
          inicioRegistradoEn:ahora,
          inicioRegistradoPor:nombreOperador(),
          inicioHoraManual:inicioElegido.hora,
          baseUnidades:num(resumenProgramacionCombinacionTurnos(x.linea,x.fecha,
            [x.turno],x.marca,x.presentacion).unidadesProducidas),
          pausaDesde:0,pausaAcumuladaMs:0,detenidaDesde:0,detencionAcumuladaMs:0,motivo:'',equipo:''
        });
      } else if(accion==='corregirInicio'){
        op.inicioAnterior=inicioCorregido.anterior;
        op.inicio=inicioCorregido.ms;
        op.inicioHoraManual=inicioCorregido.hora;
        op.inicioCorregidoMotivo=inicioCorregido.motivo;      // campo nuevo: el motivo queda también en la programación
        op.inicioCorregido=true;
        op.inicioCorregidoEn=ahora;
        op.inicioCorregidoPor=nombreOperador();
      } else if(accion==='detener'){
        op.estado='DETENIDA';op.motivo=motivo;op.detenidaDesde=ahora;op.equipo=equipoElegido;op.causa=causaElegida;
        // Registro de parada con hora de inicio (fin se completa al reanudar).
        op.paradas=[...(Array.isArray(op.paradas)?op.paradas:[]),{
          id:`${k}|${ahora}|det`,tipo:'DETENCION',motivo,clasificacion:'NO_PROGRAMADA',
          estandarMin:0,inicio:ahora,fin:0,origen:'BOTON',
          creadoPor:nombreOperador(),
          ...(equipoElegido?{equipo:equipoElegido}:{}),
          ...(causaElegida?{causa:causaElegida}:{})
        }].slice(-100);
      }
      else if(accion==='pausa'){
        op.estado='PAUSA';
        op.pausaDesde=ahora;
        op.motivoPausa=motivoPausa;
        op.paradas=[...(Array.isArray(op.paradas)?op.paradas:[]),{
          id:`${k}|${ahora}|pausa`,tipo:'PAUSA',motivo:motivoPausa,clasificacion:'PROGRAMADA',
          estandarMin:num(motivoElegido?.estandarMin),inicio:ahora,fin:0,origen:'BOTON',
          creadoPor:nombreOperador()
        }].slice(-100);
      }
      else if(accion==='lista'){op.estado='LISTA';op.listaDesde=ahora;}
      else if(accion==='reanudar'){
        if(e==='PAUSA')op.pausaAcumuladaMs=num(op.pausaAcumuladaMs)+Math.max(0,ahora-num(op.pausaDesde));
        if(['DETENIDA','LISTA'].includes(e) && num(op.detenidaDesde)>0)
          op.detencionAcumuladaMs=num(op.detencionAcumuladaMs)+Math.max(0,ahora-num(op.detenidaDesde));
        op.ultimaParada={
          tipo:e==='PAUSA'?'PAUSA_PROGRAMADA':'DETENCION',
          inicio:e==='PAUSA'?num(op.pausaDesde):num(op.detenidaDesde),
          fin:ahora,
          duracionMs:e==='PAUSA'
            ? Math.max(0,ahora-num(op.pausaDesde))
            : Math.max(0,ahora-num(op.detenidaDesde)),
          motivo:e==='PAUSA'?(op.motivoPausa||'Pausa programada'):(op.motivo||''),
          ...(e!=='PAUSA'&&op.equipo?{equipo:op.equipo}:{}),
          ...(e!=='PAUSA'&&op.causa?{causa:op.causa}:{})
        };
        op.pausaDesde=0;op.detenidaDesde=0;op.estado='EN_PRODUCCION';op.motivo='';op.motivoPausa='';op.equipo='';op.causa='';
        op.paradas=cerrarParadasAbiertas(op.paradas,ahora);
      } else if(accion==='reactivar'){
        /* Solo el Administrador. Sin hora de inicio previa vuelve a PENDIENTE; si ya había empezado, queda «Lista para reanudar» (conserva su inicio y lo producido).
           El tiempo cancelado no cuenta como parada. La cancelación queda en op.cancelaciones con su motivo y el de la reactivación. */
        op.cancelaciones=[...(Array.isArray(previo.cancelaciones)?previo.cancelaciones:[]),
          {canceladaEn:num(previo.canceladaEn)||null,motivoCancelacion:previo.motivoCancelacion||'',reactivadaEn:ahora,reactivadaPor:nombreOperador(),motivoReactivacion}].slice(-20);
        op.estado=num(previo.inicio)>0?'LISTA':'PENDIENTE';
        op.finalizadaEn=0;op.canceladaEn=0;op.motivoCancelacion='';op.pausaDesde=0;op.detenidaDesde=0;
        op.motivo='';op.equipo='';op.causa='';op.motivoPausa='';
      } else if(accion==='cancelar'){
        op.paradas=cerrarParadasAbiertas(op.paradas,ahora);
        if(e==='PAUSA' && num(op.pausaDesde)>0)
          op.pausaAcumuladaMs=num(op.pausaAcumuladaMs)+Math.max(0,ahora-num(op.pausaDesde));
        if(['DETENIDA','LISTA'].includes(e) && num(op.detenidaDesde)>0)
          op.detencionAcumuladaMs=num(op.detencionAcumuladaMs)+Math.max(0,ahora-num(op.detenidaDesde));
        op.pausaDesde=0;op.detenidaDesde=0;op.estado='CANCELADA';op.finalizadaEn=ahora;
        op.motivo='';op.equipo='';op.causa='';op.motivoCancelacion=motivoCancelacion;op.canceladaEn=ahora;
      } else if(accion==='finalizar'){
        /*
           FINALIZAR LÍNEA = cierre autoritativo del plan de la línea.
           No basta con cerrar solo la tarjeta activa: si otra presentación
           conserva EN_PRODUCCION/PENDIENTE, el render puede volver a mostrar
           la línea EN CURSO por producción parcial o por la secuencia.

           Al finalizar, cerramos todas las presentaciones del MISMO plan
           (misma línea/fecha y bloque DÍA+INTERMEDIO cuando es compartido),
           excepto las que ya fueron CANCELADAS. No se borra producción,
           programación, paletas ni historial.
        */
        const finalizadaPor=nombreOperador();

        items.forEach((p,j)=>{
          if(!mismoPlan(p))return;

          const previoLinea=p.estadoOperacion || {};
          if(previoLinea.estado==='CANCELADA')return;

          const opLinea={...previoLinea};

          // Hora real de reanudación indicada por el supervisor (o la hora de cierre).
          // Ninguna parada cuenta después del cierre.
          const finParada=Math.min(ahora,finParadaMs || ahora);
          const eraPausaReal=opLinea.estado==='PAUSA' && opLinea.motivoPausa!=='Cambio temporal de producción';
          const eraDetenida=['DETENIDA','LISTA'].includes(opLinea.estado);

          if(opLinea.estado==='PAUSA' && num(opLinea.pausaDesde)>0){
            opLinea.pausaAcumuladaMs=num(opLinea.pausaAcumuladaMs)+
              Math.max(0,finParada-num(opLinea.pausaDesde));
          }

          if(eraDetenida && num(opLinea.detenidaDesde)>0){
            opLinea.detencionAcumuladaMs=num(opLinea.detencionAcumuladaMs)+
              Math.max(0,finParada-num(opLinea.detenidaDesde));
          }

          // Registros de parada abiertos: se cierran (programadas con estándar
          // sin hora informada: inicio + estándar, nunca más allá del cierre).
          opLinea.paradas=cerrarParadasAbiertas(opLinea.paradas,ahora,finParadaMs,true);

          // Datos anteriores a los registros: el historial recibe un cierre explícito.
          if((eraPausaReal || eraDetenida) && !(previoLinea.paradas||[]).some(r=>!num(r.fin))){
            p.historialAlertas=[...(Array.isArray(p.historialAlertas)?p.historialAlertas:[]),{
              id:`${p.clave}|${finParada}|cierre_parada`,tipo:'cierre_parada',momento:finParada,
              operador:nombreOperador()
            }].slice(-300);
          }

          opLinea.pausaDesde=0;
          opLinea.detenidaDesde=0;
          opLinea.estado='FINALIZADA';
          opLinea.finalizadaEn=ahora;
          opLinea.finalizadaPor=finalizadaPor;
          opLinea.actualizadoEn=ahora;
          opLinea.actualizadoPor=finalizadaPor;

          items[j]={...p,estadoOperacion:opLinea};
        });
        // (p.historialAlertas arriba se asigna sobre el mismo objeto antes de copiarse)

        // Mantener la referencia local sincronizada con el elemento ya cerrado.
        Object.assign(op,items[i]?.estadoOperacion || {
          estado:'FINALIZADA',finalizadaEn:ahora,finalizadaPor
        });
      } else if(accion==='reabrir'){
        // Conservar el cierre anterior como trazabilidad antes de desbloquear.
        op.ultimaFinalizacion={
          finalizadaEn:num(previo.finalizadaEn),
          finalizadaPor:previo.finalizadaPor || '',
          reabiertaEn:ahora,
          reabiertaPor:nombreOperador()
        };
        op.estado='LISTA';
        op.reabierta=true;
        op.reabiertaEn=ahora;
        op.reabiertaPor=nombreOperador();
        op.reaperturaDesde='FINALIZADA';
        op.finalizadaEn=0;
        op.finalizadaPor='';
        op.pausaDesde=0;
        op.detenidaDesde=0;
        op.motivo='';op.equipo='';op.causa='';
      }
      // Historial persistente de alertas dentro de la propia programación.
      // Así el historial viaja con sync/programaciones y no requiere
      // crear otro documento ni cambiar las reglas actuales de Firestore.
      const historialAlertas = Array.isArray(items[i].historialAlertas)
        ? items[i].historialAlertas.slice()
        : [];

      if(accion === 'reabrir'){
        historialAlertas.push({
          id: `${k}|${ahora}|reapertura`,
          tipo: 'reapertura_produccion',
          momento: ahora,
          operador: op.reabiertaPor || '',
          estadoAnterior: 'FINALIZADA',
          finalizadaEnAnterior: num(previo.finalizadaEn),
          finalizadaPorAnterior: previo.finalizadaPor || ''
        });
      }

      if(accion === 'cancelar'){
        historialAlertas.push({
          id: `${k}|${ahora}|cancelacion`,
          tipo: 'cancelacion_programacion',
          momento: ahora,
          operador: op.actualizadoPor || '',
          motivo: motivoCancelacion || ''
        });
      }

      if(accion === 'detener'){
        historialAlertas.push({
          id: `${k}|${ahora}|detencion`,
          tipo: 'detencion',
          momento: ahora,
          operador: op.actualizadoPor || '',
          motivo: motivo || ''
        });
      }

      if(accion === 'reanudar' && ['DETENIDA','LISTA'].includes(e)){
        historialAlertas.push({
          id: `${k}|${ahora}|reanudacion`,
          tipo: 'reanudacion',
          momento: ahora,
          operador: op.actualizadoPor || '',
          motivo: previo.motivo || ''
        });
      }

      if(accion === 'pausa'){
        historialAlertas.push({
          id: `${k}|${ahora}|pausa`,
          tipo: 'pausa_programada',
          momento: ahora,
          operador: op.actualizadoPor || '',
          motivo: motivoPausa || 'Pausa programada'
        });
      }

      if(accion === 'reanudar' && e==='PAUSA'){
        historialAlertas.push({
          id: `${k}|${ahora}|fin_pausa`,
          tipo: 'fin_pausa_programada',
          momento: ahora,
          operador: op.actualizadoPor || '',
          motivo: previo.motivoPausa || 'Pausa programada',
          duracionMs: Math.max(0,ahora-num(previo.pausaDesde))
        });
      }

      items[i]={
        ...items[i],
        estadoOperacion:op,
        historialAlertas: historialAlertas.slice(-300)
      };
      if(accionBit){
        const datosEvento={
          motivo:accion==='detener' ? motivo : (accion==='pausa' ? motivoPausa : (accion==='reanudar' ? (previo.motivo || previo.motivoPausa || '') : (accion==='cancelar' ? motivoCancelacion : ''))),
          // Identificador de la parada (mismo id que op.paradas): enlaza DETENER/PAUSAR con sus pasos y con COMPLETAR_MOTIVO.
          paradaId:accion==='detener' ? `${k}|${ahora}|det` : (accion==='pausa' ? `${k}|${ahora}|pausa` : idParadaAbierta(previo)),
          estandarMin:accion==='pausa' ? num(motivoElegido?.estandarMin) : null,
          duracionMs:accion==='reanudar' && op.ultimaParada ? num(op.ultimaParada.duracionMs) : null
        };
        // Lote 4 · Parte A: datos propios de cada acción de Producción.
        if(accion==='detener'&&equipoElegido)datosEvento.equipo=equipoElegido;                    // equipo que falló (bitácora)
        if(accion==='detener'&&causaElegida)datosEvento.causa=causaElegida;                       // causa del catálogo (bitácora)
        if(accion==='reanudar'&&previo.equipo)datosEvento.equipo=previo.equipo;
        if(accion==='reanudar'&&previo.causa)datosEvento.causa=previo.causa;
        if(accion==='iniciar'){datosEvento.inicioMs=num(op.inicio);datosEvento.inicioHoraManual=op.inicioHoraManual || '';}
        if(accion==='finalizar'){
          datosEvento.cierreMs=ahora;
          datosEvento.producido=Math.round(producidoDe(x));
          datosEvento.programado=Math.round(progDe(x));
        }
        if(accion==='reabrir')datosEvento.finalizadaEnAnterior=num(previo.finalizadaEn);
        if(accion==='reactivar'){datosEvento.tipoReabrir='CANCELACION';datosEvento.finalizadaEnAnterior=num(previo.canceladaEn);datosEvento.motivo=motivoReactivacion;}
        if(accion==='corregirInicio'){
          datosEvento.valorAnterior=inicioCorregido.anterior;       // hora de inicio anterior (ms)
          datosEvento.valorNuevo=inicioCorregido.ms;                // hora de inicio nueva (ms)
          datosEvento.motivoCorreccion=inicioCorregido.motivo;
        }
        eventoBit=eventoBitacora(accionBit,quienOpera,x,k,e,op,datosEvento);
        // El evento va en la MISMA transacción para todos los usuarios: no existe un cambio sin su registro.
        // (En «Ver como» del Administrador no se registra: es una simulación.)
        if(!window.__vistaComo)tx.set(refBit,eventoBit);
      }
      tx.set(ref,{items,updatedAt:ahora});
      return items;
    });
    // La transacción ya quedó confirmada. Informa también a esta pestaña:
    // el caché se actualiza antes de que llegue su propio onSnapshot().
    if(typeof procesarAlertasOperacion === 'function')
      procesarAlertasOperacion(itemsGuardados);

    _programacionesCache=itemsGuardados;
    // Un inicio o una reanudación REAL cierra el motivo de no producción vigente de esa línea y bloque (solo si es posterior a su registro).
    if(['iniciar','reanudar'].includes(accion) && window.glacialIncidencias){
      window.glacialIncidencias.resolverPorEvento(x.linea,x.fecha,x.turnoPlan || x.turno,ahoraServidor(),accion==='iniciar' ? 'INICIAR' : 'REANUDAR');
    }
    if(state.currentTab==='produccion-actual')renderProduccionActualTab();
  }
  // Acceso para pruebas: SOLO existe en el entorno PRUEBAS (en producción no se expone).
  if(typeof ENTORNO_PRUEBAS!=='undefined' && ENTORNO_PRUEBAS)window.glacialSemaforo={cambiarEstado};
  window.glacialTurnoVigente=turnoVigente;
  window.glacialProducidoVigente=producidoVigenteDe;   // producido de una programación: turno en curso = Paletas, turno cerrado = registro (null si falta); lo lee Planificación
  const renderAnterior=renderProduccionActualTab;
  renderProduccionActualTab=function(){
    if(!produccionActualFecha)produccionActualFecha=turnoVigente().fecha;
    const resultado=renderAnterior.apply(this,arguments);
    dibujarTablero();
    return resultado;
  };
  document.getElementById('main')?.addEventListener('click',async event=>{
    const np=event.target.closest('[data-pa-np]');
    if(np && window.glacialIncidencias){
      const [l,f,t]=String(np.dataset.paNp).split('|');
      window.glacialIncidencias.abrirFormulario(l,f,t);
      return;
    }
    if(event.target.closest('[data-pa-turno-actual]')){
      const t=turnoProductivo();
      produccionActualFecha=t.fecha;
      produccionActualTurno=t.turno;
      renderProduccionActualTab();
      return;
    }
    const btn=event.target.closest('[data-pa-accion]');
    if(!btn || btn.disabled || state.currentTab!=='produccion-actual')return;
    const x=filasActuales[Number(btn.dataset.paIndice)];
    btn.disabled=true;
    try{await cambiarEstado(x,btn.dataset.paAccion);}
    catch(err){
      alert(err && err.codigo==='YA_REGISTRADO' ? err.message : 'No se pudo actualizar la línea: '+err.message);
      if(err && err.codigo==='YA_REGISTRADO' && state.currentTab==='produccion-actual')renderProduccionActualTab();
    }
    finally{if(btn.isConnected)btn.disabled=false;}
  });
  setInterval(()=>{
    if(state.user && state.currentTab==='produccion-actual')renderProduccionActualTab();
  },60000);

  /* ---------------------------------------------------------
     RESUMEN COMPACTO PARA EL INICIO EJECUTIVO (solo lectura)
     Reutiliza estadoFila / estadoOrdenItem / secuencia del tablero,
     por lo que el estado mostrado en Inicio coincide con Producción
     Actual. No escribe nada ni crea datos nuevos.
     --------------------------------------------------------- */
  const PRIORIDAD_ESTADO_LINEA=['DETENIDA','EN_CURSO','PAUSA','PENDIENTE','COMPLETADA','CANCELADA'];
  window.glacialResumenEjecutivoLineas=function(fechaOpt,turnoOpt){
    const ahora=ahoraServidor(), tv=turnoProductivo();
    const fecha=fechaOpt || tv.fecha, turno=turnoOpt || tv.turno;
    const filas=[];
    LINES.forEach(line=>{
      const vistos=new Set(), items=[];
      combinacionesConDatosPaletas(line.key,fecha,turno==='INTERMEDIO' ? ['DÍA',turno] : [turno])
        .forEach(combo=>{
          const k=combo.marca+'||'+combo.presentacion;
          if(vistos.has(k))return;
          const x=estadoFila(line.key,fecha,turno,combo.marca,combo.presentacion,ahora);
          if(x.prog || num(resumenProgramacionCombinacionTurnos(line.key,fecha,[turno],
            combo.marca,combo.presentacion).unidadesProducidas)){
            vistos.add(k);items.push(x);
          }
        });
      if(!items.length)return;
      // Igual que el tablero: solo los productos del plan dan estado, secuencia y cumplimiento; lo producido sin programación va aparte.
      const separado=GlacialIndicadores.produccionPlanYFuera(items.map(x=>({
        linea:x.linea,fecha:x.fecha,turno:x.turnoPlan || x.turno,marca:x.marca,presentacion:x.presentacion,
        enPlan:!x.fueraPlan,cancelada:x.op?.estado==='CANCELADA',programado:progDe(x),producido:producidoDe(x),fila:x})));
      const fueraPlan=separado.fuera.map(z=>({marca:z.marca,presentacion:z.presentacion,producido:z.producido,
        fuente:produccionDesdePaletas(z.fila) ? 'PALETAS' : 'REGISTRO'}));
      items.splice(0,items.length,...separado.plan.map(z=>z.fila));
      if(!items.length && !fueraPlan.length)return;

      if(items.length)aplicarEstadoVisualSecuencia(items,line.key,fecha,items[0].turnoPlan || turno,turno,ahora);
      const estados=items.map(x=>({x,e:estadoOrdenItem(x).key,det:x.op?.estado==='DETENIDA'}));
      estados.forEach(o=>{ if(o.det)o.e='DETENIDA'; });
      const claves=estados.map(o=>o.e);
      // Sin productos del plan (solo producción fuera de programación) la línea no tiene marca planificada en curso: PENDIENTE.
      const estadoLinea=GlacialIndicadores.estadoLineaDesdeItems(claves) || 'PENDIENTE';
      const activo=((estados.find(o=>o.e===estadoLinea) || estados.find(o=>!['COMPLETADA','CANCELADA'].includes(o.e)) || estados[0]) || {x:{}}).x;

      const programado=separado.totales.programado;
      const producido=separado.totales.producidoPlan;

      // Tiempos y ratios: función central única (23b-tiempos-linea.js). Ratio = unidades físicas de la línea; ratio necesario = plan.
      const tiempos=calcularTiemposLinea(line.key,turno,fecha,{ahora});
      const ratiosPlan=calcularRatiosLinea(tiempos,{produccion:producido,programado,ahora});
      const ratiosFisicos=separado.totales.producidoFuera>0
        ? calcularRatiosLinea(tiempos,{produccion:separado.totales.producidoFisico,programado,ahora}) : ratiosPlan;
      const ratios={...ratiosPlan,ratioTurno:ratiosFisicos.ratioTurno,ratioEfectivo:ratiosFisicos.ratioEfectivo};
      const desempeno=evaluarDesempenoLinea(tiempos,ratios,{produccion:producido,programado});
      const paradaMs=tiempos.ok ? (tiempos.minParadasNoProgramadas+tiempos.minPausasProgramadas)*60000 : 0;

      // Último registro de paletas de la línea (solo lectura).
      let ultimoMs=0;
      loadPaletas().forEach(r=>{
        if(!items.some(x=>r.linea===x.linea && r.fecha===x.fecha &&
          (r.turno===x.turno || (x.compartida && ['DÍA','INTERMEDIO'].includes(r.turno))) &&
          r.marca===x.marca && r.presentacion===x.presentacion))return;
        const t=Number(r.creadoEn || r.actualizadoEn || 0);
        if(t>ultimoMs)ultimoMs=t;
      });

      const fila={
        ultimoMs,
        linea:line.key,nombre:line.name,
        marca:activo.marca || '',presentacion:activo.presentacion ? presUI(activo.linea,activo.marca,activo.presentacion) : '',
        estado:estadoLinea,programado,producido,
        // producido = del plan (cumplimiento). Lo de productos sin programación va aparte y suma solo a la producción física.
        fueraPlan,producidoFuera:separado.totales.producidoFuera,producidoFisico:separado.totales.producidoFisico,
        avance:programado>0 ? producido/programado*100 : 0,
        ratio:ratios.ratioEfectivo ?? 0,ratios,tiempos,desempeno,
        paradaMs,detenidaMin:null,retrasoPct:null,
        // Estado/avance por marca-presentación (usado por el Inicio operativo).
        detalle:estados.map(({x,e})=>{
          const p=producidoDe(x);
          const g=progDe(x);
          return {marca:x.marca,presentacion:x.presentacion,estado:e,producido:p,programado:g,
            avance:g>0 ? p/g*100 : 0,detenidaDesde:Number(x.op?.detenidaDesde || 0)};
        })
      };
      /* Pantalla «Estado de líneas» (Inicio): la marca EN CURSO con SU avance, el desglose por marca y el total aparte.
         `estado` (arriba) sigue siendo el de estadoLineaDesdeItems porque lo usan otras pantallas; aquí se agrega
         `desglose.estado`, el de la marca en curso (ver GlacialIndicadores.desgloseLineaPorMarca). */
      fila.desglose=GlacialIndicadores.desgloseLineaPorMarca(fila.detalle);
      // Estado OPERATIVO real (lo que registraron los botones), sin deducirlo de producción acumulada: lo usa Inicio.
      fila.enProduccionReal=items.some(x=>x.op?.estado==='EN_PRODUCCION');
      fila.detenidaReal=items.some(x=>x.op?.estado==='DETENIDA');
      fila.iniciadaReal=items.some(x=>num(x.op?.inicio)>0);
      fila.ultimaOperacionMs=items.reduce((m,x)=>Math.max(m,num(x.op?.actualizadoEn)),0);
      const det=estados.find(o=>o.det);
      if(det && Number(det.x.op?.detenidaDesde || 0)>0)
        fila.detenidaMin=Math.max(0,Math.round((ahora-Number(det.x.op.detenidaDesde))/60000));
      // Retraso = desempeño no verde (ratio efectivo por debajo del necesario).
      if(estadoLinea==='EN_CURSO' && ['ambar','roja'].includes(desempeno.nivel) && desempeno.razon>=0)
        fila.retrasoPct=Math.max(1,Math.round((1-desempeno.razon)*100));
      fila.proyeccion=proyectarCierreLinea(tiempos,ratios,{
        produccion:producido,programado,ahora,productos:productosProyeccion(items),
        detenida:items.some(x=>['DETENIDA','LISTA'].includes(x.op?.estado)),
        ultimoRegistroMs:ultimoMs
      },proyeccionUmbrales());
      filas.push(fila);
    });
    return {fecha,turno,actualizado:ahora,filas};
  };
})();
