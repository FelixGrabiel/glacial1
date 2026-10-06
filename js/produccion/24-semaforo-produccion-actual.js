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
  const turnoCodigo = t => t.key === 'MANANA' ? 'DÍA' :
    t.key === 'TARDE' ? 'INTERMEDIO' : 'NOCHE';
  // Turno vigente y día operativo: una sola función en el módulo de indicadores (hora del servidor, corte 07:00).
  const turnoVigente = () => GlacialIndicadores.turnoVigente(ahoraServidor());
  const horario = (fecha,turno,compartida) => GlacialIndicadores.horarioTurno(fecha,turno,compartida);   // horarios únicos del módulo
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
    iniciar:'INICIAR',finalizar:'FINALIZAR',cancelar:'CANCELAR',reabrir:'REABRIR',corregirInicio:'CORREGIR_INICIO'};
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
  // Da acceso al tablero a quienes tienen que registrar el estado.
  const permisoAnterior=tienePermiso;
  tienePermiso=function(permiso){
    if(permiso==='produccionActual' && state.user &&
       ((state.user.rol==='Supervisor' && tienePermiso('paletas')) ||
        (state.user.rol==='Mantenimiento' && tienePermiso('moduloMantenimiento'))))return true;
    return permisoAnterior.apply(this,arguments);
  };
  // DÍA e INTERMEDIO comparten plan y producción; NOCHE mantiene plan propio.
  // Conserva programaciones INTERMEDIO antiguas si aún no existe plan de DÍA.
  const resumenTurnosAnterior=resumenProgramacionCombinacionTurnos;
  resumenProgramacionCombinacionTurnos=function(linea,fecha,turnos,marca,presentacion){
    const dia=turnos.includes('INTERMEDIO')
      ? obtenerProgramacionPaleta(linea,fecha,'DÍA',marca,presentacion) : null;
    if(!dia || num(dia.cantidadProgramada)<=0)
      return resumenTurnosAnterior.apply(this,arguments);
    const efectivos=turnos.includes('DÍA') ? turnos : ['DÍA',...turnos];
    const r=resumenTurnosAnterior(linea,fecha,efectivos,marca,presentacion);
    const inter=datosProgramacionCombinacion(linea,fecha,'INTERMEDIO',marca,presentacion);
    const programada=Math.max(0,r.cantidadProgramada-inter.cantidadProgramada);
    const paletas=Math.max(0,r.paletasProgramadas-inter.paletasProgramadas);
    return {...r,cantidadProgramada:programada,paletasProgramadas:paletas,
      unidadesPorPaleta:num(dia.unidadesPorPaleta) || r.unidadesPorPaleta,
      unidadesPendientes:Math.max(0,programada-r.unidadesProducidas),
      sobreproduccion:programada>0 && r.unidadesProducidas>programada,
      porcentajeAvance:programada>0 ? r.unidadesProducidas/programada*100 : 0};
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
  function registroDeTurno(x){
    let recs=[];try{recs=(typeof loadRecords==='function'?loadRecords():[])||[];}catch(_){recs=[];}
    const turno=quitarTilde(x.turno),marca=quitarTilde(x.marca),pres=quitarTilde(x.presentacion);
    const delTurno=recs.filter(r=>r&&r.linea===x.linea&&r.fecha===x.fecha&&quitarTilde(r.turno)===turno);
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
    const t=turnoVigente();
    const enCurso=!!(t&&t.activo&&t.fecha===x.fecha&&t.turno===x.turno);
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

  function marcaTiempoCorte(fecha,hora){
    if(!fecha || !/^\d{2}:\d{2}$/.test(String(hora || '')))return 0;
    const d=new Date(fecha+'T'+hora+':00');
    const ms=d.getTime();
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
        const corte=marcaTiempoCorte(fecha,t.horaFin);
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
        x.estadoVisual=(x.op?.estado==='EN_PRODUCCION' || producido>0)
          ? 'EN_PRODUCCION' : 'PENDIENTE';
        return;
      }

      if(sec.indiceActivo<0){
        x.estadoVisual='FINALIZADA';
        return;
      }

      const tuvoTramo=indices.some(i=>i<sec.indiceActivo);
      const tieneTramoFuturo=indices.some(i=>i>sec.indiceActivo);

      if(tuvoTramo && tieneTramoFuturo){
        x.estadoVisual='PAUSA_SECUENCIA';
      }else if(tuvoTramo){
        x.estadoVisual='FINALIZADA';
      }else{
        x.estadoVisual='PENDIENTE';
      }
    });

    return sec;
  }
  // Una sola clasificación para tarjetas, avances y semáforo de la línea.
  // El estado operativo persistido manda sobre la secuencia y las paletas.
  function estadoOrdenItem(x){
    const producido=Math.round(producidoDe(x));
    const programado=Math.round(num(x.prog?.cantidadProgramada));
    const operativo=x.op?.estado || x.estadoVisual || 'PENDIENTE';
    if(operativo==='CANCELADA')return {key:'CANCELADA',label:'CANCELADA',rank:4,cls:'cancelada'};
    // Al llegar al objetivo, la marca está completada aunque el último
    // estado operativo guardado siga diciendo EN_PRODUCCION.
    if(operativo==='FINALIZADA' || (programado>0 && producido>=programado))
      return {key:'COMPLETADA',label:'COMPLETADA',rank:3,cls:'completada'};
    if(['PAUSA','PAUSA_SECUENCIA','DETENIDA','LISTA'].includes(operativo))
      return {key:'PAUSA',label:'EN PAUSA',rank:1,cls:'pausa'};
    if(operativo==='EN_PRODUCCION')
      return {key:'EN_CURSO',label:'EN CURSO',rank:0,cls:'curso'};

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
  const turnoActivo = (fecha,turno) => {
    const t=turnoVigente();return t.activo && t.fecha===fecha && t.turno===turno;
  };
  function estadoFila(l,f,t,m,p,ahora){
    const dia=t==='INTERMEDIO' ? obtenerProgramacionPaleta(l,f,'DÍA',m,p) : null;
    const compartida=!!dia && num(dia.cantidadProgramada)>0;
    const turnoPlan=compartida ? 'DÍA' : t;
    const prog=compartida ? dia : obtenerProgramacionPaleta(l,f,t,m,p);
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
    else if(op?.estado==='PAUSA')texto='Pausa programada';
    else if(op?.estado==='LISTA')texto='Lista para reanudar';
    else if(op?.estado==='FINALIZADA')texto='Presentación finalizada';
    else if(op?.estado==='CANCELADA')texto='Cancelado';
    else if(op?.estado==='EN_PRODUCCION' && ratio<=0){
      nivel='verde';texto='Avanzando · ratio sin configurar';
    }
    else if(op?.estado==='EN_PRODUCCION' && horas*60<MIN_INICIO){
      nivel='verde';texto='Avanzando · inicio';
    }
    else if(op?.estado==='EN_PRODUCCION'){
      // Sin estado «retrasado» por presentación: el estado se mantiene (en curso) y el desempeño
      // se evalúa a nivel de línea con el ratio de las paradas oficiales.
      nivel='verde';texto='Avanzando';
    }
    return {linea:l,fecha:f,turno:t,turnoPlan,compartida,
      marca:m,presentacion:p,prog,op,
      nivel,texto,horas,ratio,esperado,real:desdeInicio,vivo,
      puede:quienControla(l)};
  }
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
    const compl=motivoPendienteAbierto(x.op) ? boton('completarMotivo','Completar motivo') : '';
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
        programado:x.op?.estado==='CANCELADA'?0:num(x.prog?.cantidadProgramada),
        producido:producidoDe(x),
        velocidad:typeof window.glacialVelocidadEstandar==='function'?num(window.glacialVelocidadEstandar(x.linea,x.presentacion,x.marca)):0
      };
    });
  }
  /* Tarjeta de proyección de cierre del bloque. Orden pensado para el celular (una sola columna):
     estado, proyección al cierre, avance, faltante, tiempo restante, ritmo actual, ritmo necesario y capacidad nominal,
     final estimado y análisis. Todos los números salen de GlacialIndicadores.proyeccionCierre (45-indicadores.js). */
  function htmlProyeccion(p){
    if(!p || p.estado==='SIN_PROYECCION')return '';
    const fmt=n=>(n==null || !Number.isFinite(n)) ? '—' : Math.round(n).toLocaleString('es-PE');
    const pct=v=>(v==null || !Number.isFinite(v)) ? '—' : v.toFixed(1)+' %';
    const hhmm=ms=>new Date(ms).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false});
    const dur=min=>{const m=Math.max(0,Math.round(min || 0));return m>=60 ? Math.floor(m/60)+' h '+String(m%60).padStart(2,'0')+' min' : m+' min';};
    const fila=(t,v)=>'<div class="pa-proy-row"><span>'+t+'</span><b>'+v+'</b></div>';
    const registrado=p.segunRegistradoMs ? hhmm(p.segunRegistradoMs) : hhmm(p.ahora);
    let h='<div class="pa-proy '+(p.nivel || 'gris')+'">'+
      '<div class="pa-proy-top"><b>PROYECCIÓN DE CIERRE</b><small>según lo registrado a las '+registrado+'</small></div>';
    // 1) estado
    h+='<div class="pa-proy-estado '+(p.nivel || 'gris')+'">'+esc(p.etiqueta || 'SIN ESTADO')+'</div>';
    if(p.motivo && p.modo!=='falta_velocidad')h+='<div class="pa-proy-nota info">'+esc(p.motivo)+'</div>';
    if(p.modo==='no_proyectable' && p.veredicto==='NO_ALCANZABLE')h+='<div class="pa-proy-estado roja">META NO ALCANZABLE EN EL TIEMPO RESTANTE</div>';
    // 2) proyección al cierre
    if(p.modo==='normal'){
      const dif=p.diferencia>=0 ? '<span class="pa-proy-dif sobra">sobrarían '+fmt(p.diferencia)+'</span>' : '<span class="pa-proy-dif falta">faltarían '+fmt(-p.diferencia)+'</span>';
      const difS=p.diferenciaSinNuevas>=0 ? '<span class="pa-proy-dif sobra">sobrarían '+fmt(p.diferenciaSinNuevas)+'</span>' : '<span class="pa-proy-dif falta">faltarían '+fmt(-p.diferenciaSinNuevas)+'</span>';
      h+=fila('Si las paradas siguen igual',fmt(p.siguenIgual)+' UND · '+pct(p.pct)+' · '+dif);
      h+=fila('Sin nuevas paradas',(p.sinNuevas==null ? '—' : fmt(p.sinNuevas)+' UND · '+pct(p.pctSinNuevas)+' · '+difS));
    }else if(p.modo==='terminado'){
      h+=fila('Resultado del bloque',fmt(p.producido)+' de '+fmt(p.programado)+' UND · '+pct(p.pct));
    }
    // 3) avance  4) faltante  5) tiempo restante
    h+=fila('Avance',fmt(p.producido)+' / '+fmt(p.programado)+' UND · '+pct(p.avancePct));
    h+=fila(p.modo==='terminado' ? 'Faltante final' : 'Faltante',fmt(p.pendiente)+' UND');
    if(p.modo!=='terminado')h+=fila('Tiempo restante',dur(p.restanteMin)+(p.pausaPendienteMin>0 ? ' <small>(sin '+Math.round(p.pausaPendienteMin)+' min de pausas previstas)</small>' : ''));
    // 6) ritmo actual
    if(p.modo!=='terminado' && p.modo!=='cumplida'){
      h+=fila('Ritmo real (ratio)',(p.ritmoReal==null ? '—' : fmt(p.ritmoReal)+' UND/h')+
        ' <small>· rendimiento del bloque '+(p.rendimiento==null ? '—' : fmt(p.rendimiento)+' UND/h')+'</small>');
      // 7) ritmo necesario, capacidad nominal, requerimiento
      if(p.modo==='no_proyectable')
        h+=fila('Capacidad nominal',(p.capacidadNominal==null ? '—' : fmt(p.capacidadNominal)+' UND/h')+(p.tiempoNominalMin==null ? '' : ' <small>· la meta pide '+dur(p.tiempoNominalMin)+' y quedan '+dur(p.restanteMin)+'</small>'));
      else
      h+=fila('Necesario / capacidad nominal',(p.ritmoNecesario==null ? '—' : fmt(p.ritmoNecesario))+' / '+(p.capacidadNominal==null ? '—' : fmt(p.capacidadNominal))+' UND/h'+
        (p.requerimientoPct==null ? '' : ' <small>· requiere el '+pct(p.requerimientoPct)+' de la capacidad</small>'));
    }
    // 8) final estimado
    if(p.modo==='normal' && p.finalEstimadoMs)
      h+=fila('Final estimado',hhmm(p.finalEstimadoMs)+(p.retrasoMin>0 ? ' <span class="pa-proy-dif falta">· '+p.retrasoMin+' min después del fin ('+hhmm(p.finObjetivoMs)+')</span>' : ' <small>· antes del fin ('+hhmm(p.finObjetivoMs)+')</small>'));
    if(p.modo==='cumplida')h+=fila('Meta cumplida',p.horaCumplidaMs ? 'a las '+hhmm(p.horaCumplidaMs) : 'sí');
    // 9) análisis automático (mismos números)
    const an=GlacialIndicadores.analisisProyeccion(p);
    if(an)h+='<div class="pa-proy-an"><b>Análisis</b> '+esc(an)+'</div>';
    // avisos informativos (no alteran el cálculo)
    (p.avisos || []).forEach(a=>{h+='<div class="pa-proy-nota">⚠ '+esc(a.texto)+'</div>';});
    // detalle por producto
    if((p.productos || []).length>1){
      const et={COMPLETADO:'completado',EN_CURSO:'en curso',PENDIENTE:'pendiente',CANCELADO:'cancelado'};
      h+='<details class="pa-proy-det"><summary>Detalle por producto</summary>'+p.productos.map(x=>
        '<div class="pa-proy-row"><span>'+esc(x.etiqueta)+' <small>('+(et[x.estado] || x.estado.toLowerCase())+')</small></span><b>'+fmt(x.producido)+' / '+fmt(x.programado)+'</b></div>').join('')+'</details>';
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
    const turnoReal=turnoVigente();
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
        const elegido=lista.find(x=>x.nivel==='roja') || lista.find(x=>x.nivel==='ambar') ||
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
        const items=[...unicos.values()];
  
        // Recalcular el estado visual en cada render. Un producto FINALIZADO
        // nunca debe volver a EN CURSO solo porque tenga registros de paletas.
        items.forEach(x=>{ delete x.estadoVisual; });
  
        const turnoVistaSecuencia=items[0]?.turno || turnoFallback;
        const turnoPlanSecuencia=items[0]?.turnoPlan || turnoVistaSecuencia;
        const secuenciaActiva=aplicarEstadoVisualSecuencia(
          items,line.key,fecha,turnoPlanSecuencia,turnoVistaSecuencia,ahora
        );
  
        // * 'vacios' llega filtrado por bloque operativo desde construirGrupoTurno().
        if(!items.length && !vacios.length)return null;
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
        const estadoLineaGrupo=GlacialIndicadores.estadoLineaDesdeItems(
          items.map((x,i)=>x.op?.estado==='DETENIDA'?'DETENIDA':estados[i].key));
        // Regla visual acordada: EN CURSO usa la luz ámbar/naranja; PAUSA usa ámbar/amarillo.
        const nivel=({DETENIDA:'roja',EN_CURSO:'ambar',PAUSA:'ambar',CANCELADA:'roja',COMPLETADA:'verde'})[estadoLineaGrupo]||'gris';
        const texto=({DETENIDA:'Línea detenida',EN_CURSO:'En curso',PAUSA:'Pausa programada',CANCELADA:'CANCELADA',COMPLETADA:'FINALIZADA'})[estadoLineaGrupo]||
          (estadoLineaGrupo==='PENDIENTE'&&hayCompletada?'Pendiente':'Sin iniciar');
        const turnosLinea=[...new Set([...items,...vacios].map(x=>x.turno))];
        const totalProg=items.reduce((s,x)=>s+(x.op?.estado==='CANCELADA'?0:num(x.prog?.cantidadProgramada)),0);
        const totalProd=items.reduce((s,x)=>s+producidoDe(x),0);
  
        // PRODUCCIÓN TOTAL POR PRESENTACIÓN
        // ---------------------------------------------------------
        // No mezclar formatos físicos diferentes de una misma línea.
        // Varias marcas con la MISMA presentación sí se consolidan.
        // Ej.: Aro 380 ml + Bells 380 ml => un total de 380 ml.
        //      Aro 380 ml + Scala 1.5 L => dos totales independientes.
        const mapaTotalesPresentacion=new Map();
        items.forEach(x=>{
          if(x.op?.estado==='CANCELADA')return;
  
          const etiqueta=presUI(x.linea,x.marca,x.presentacion);
          const clave=String(etiqueta || x.presentacion || 'SIN PRESENTACIÓN')
            .trim()
            .toUpperCase();
  
          const producido=producidoDe(x);
          const programado=num(x.prog?.cantidadProgramada);
  
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
        const ratios=calcularRatiosLinea(tiempos,{produccion:totalProd,programado:totalProg,ahora});
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
        // El COLOR refleja el desempeño; el estado queda como etiqueta de texto.
        const nivelFinal=desempeno.nivel!=='gris' ? desempeno.nivel : nivelEstado;

        return {
          line,items,vacios,activo,nivel:nivelFinal,nivelEstado,texto,turnosLinea,totalProg,totalProd,
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
        )
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
        return {tipo:x.op.estado==='LISTA'?'INTERVENCIÓN TERMINADA':'DETENIDA',desde:Number(x.op.detenidaDesde),motivo:x.op.motivo||'Sin motivo registrado'};
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
        return `<article class="pa-live-card pa-line-card pa-line-card-horizontal">
          <div class="pa-line-top">
            <div class="pa-line-ident">
              <div class="pa-line-icon">⚙</div>
              <div>
                <strong class="pa-line-title">${esc(g.line.name)}</strong>
                <div class="pa-line-turnos">${esc(g.turnosLinea.join(' · ') || 'SIN TURNO')}</div>
              </div>
            </div>
            <div class="pa-line-status">
              ${g.tiempos?.pausaSinCerrar ? `<span class="pa-chip-alerta" title="Superó la duración estándar">⚠ Pausa sin cerrar · ${esc(g.tiempos.pausaSinCerrar.motivo)} · ${Math.round(g.tiempos.pausaSinCerrar.transcurridoMin)} min (estándar ${g.tiempos.pausaSinCerrar.estandarMin})</span>` : ''}
              ${g.items.some(x=>x.op?.corregida) ? '<span class="pa-chip-corregida" title="La finalización fue corregida">Corregida</span>' : ''}
              ${renderSemaforoWidget({nivel:g.nivel,texto:g.texto})}</div>
          </div>

          <div class="pa-line-kpis">
            <div class="pa-line-kpi"><small>PROGRAMACIÓN VIGENTE</small><strong>${Math.round(g.totalProg).toLocaleString('es-PE')} <span>UND</span></strong></div>
            <div class="pa-line-kpi"><small>PRODUCCIÓN ACUMULADA</small><strong>${Math.round(g.totalProd).toLocaleString('es-PE')} <span>UND</span></strong></div>
            <div class="pa-line-kpi"><small>CUMPLIMIENTO</small><strong>${(()=>{const c=GlacialIndicadores.cumplimiento(g.totalProd,g.totalProg);return c==null?'0.0':Math.min(999,c*100).toFixed(1);})()}<span>%</span></strong></div>
            <div class="pa-line-kpi" title="Producido ÷ (tiempo transcurrido − pausas programadas). Se usa en la proyección «Si las paradas siguen igual»."><small>RENDIMIENTO DEL TURNO</small><strong>${fmtRatio(g.ratios?.ratioTurno)} <span>UND/h</span></strong></div>
            <div class="pa-line-kpi" title="Ratio = producido ÷ horas efectivas. Horas efectivas = tiempo transcurrido − (paradas programadas + no programadas)."><small>RATIO</small><strong>${fmtRatio(g.ratios?.ratioEfectivo)} <span>UND/h</span></strong></div>
            ${g.tiempos?.enCurso ? `<div class="pa-line-kpi"><small>RATIO NECESARIO</small><strong>${fmtRatio(g.ratios?.ratioNecesario)} <span>UND/h</span></strong></div>` : ''}
            <div class="pa-line-kpi pa-line-kpi-paradas"><small>PARADAS</small><strong>${g.tiempos?.ok ? formatoMin(g.tiempos.minParadasNoProgramadas+g.tiempos.minPausasProgramadas) : '—'}</strong>
              ${g.tiempos?.ok ? `<div class="pa-paradas-desglose">
                <span>No programadas: <b>${formatoMin(g.tiempos.minParadasNoProgramadas)}</b></span>
                <span>Programadas: <b>${formatoMin(g.tiempos.minPausasProgramadas)}</b></span>
                <em title="Las paradas oficiales son las que registra el supervisor en Avance/Cierre. El tiempo detenida o en pausa del semáforo es solo el historial de estados y no se descuenta del ratio.">Oficiales (Avance/Cierre) ${formatoMin(g.tiempos.fuentes.supervisor.noProgramadas+g.tiempos.fuentes.supervisor.programadas)}
                · Estado: detenida ${formatoMin(g.tiempos.fuentes.detenerLinea.noProgramadas)} · en pausa ${formatoMin(g.tiempos.fuentes.pausaProgramada.programadas)} (informativo)</em>
              </div>` : ''}</div>
          </div>

          ${htmlProyeccion(g.proyeccion)}

          <div class="pa-horizontal-body">

            <section class="pa-hcol pa-hcol-programacion">
              <div class="pa-hcol-title">▥ SECUENCIA DEL TURNO</div>
              ${(()=>{
                const ordenados=itemsOrdenadosGrupo(g);
                const original=g.items.reduce((a,x)=>a+num(x.prog?.cantidadProgramada),0);
                const vigente=g.items.reduce((a,x)=>a+(x.op?.estado==='CANCELADA'?0:num(x.prog?.cantidadProgramada)),0);
                const counts={EN_CURSO:0,PAUSA:0,PENDIENTE:0,COMPLETADA:0,CANCELADA:0};
                ordenados.forEach(o=>counts[o.estado.key]++);
                return `<div class="pa-state-counts">
                  <span class="curso">● ${counts.EN_CURSO} En curso</span>
                  <span class="pausa">● ${counts.PAUSA} En pausa</span>
                  <span class="pendiente">● ${counts.PENDIENTE} Pendientes</span>
                  <span class="completada">● ${counts.COMPLETADA} Finalizadas</span>
                  <span class="cancelada">● ${counts.CANCELADA} Canceladas</span>
                </div>
                <div class="pa-program-list pa-program-list-horizontal">${
                  ordenados.length ? ordenados.map(({x,estado})=>{
                    const prog=Math.round(num(x.prog?.cantidadProgramada));
                    return `<div class="pa-program-row pa-program-state-${estado.cls}">
                      <span><b>${esc(x.marca || '—')}</b>${x.presentacion
                        ? '<small>'+esc(presUI(x.linea,x.marca,x.presentacion))+'</small>' : ''}</span>
                      <div class="pa-program-right"><strong>${prog.toLocaleString('es-PE')} UND</strong>${tarjetaEstado(estado)}</div>
                    </div>`;
                  }).join('') : '<div class="small-muted">Sin programación para el período seleccionado.</div>'
                }</div>`;
              })()}
            </section>

            <section class="pa-hcol pa-hcol-ratio">
              <div class="pa-hcol-title">◴ PRODUCCIÓN ACTUAL</div>
              ${(()=>{
                const actualActivo=g.items.find(x=>{
                  const e=estadoOrdenItem(x).key;
                  return e==='EN_CURSO' || e==='PAUSA' || x.op?.estado==='DETENIDA' || x.op?.estado==='LISTA';
                });
                const actualPendiente=g.items.find(x=>estadoOrdenItem(x).key==='PENDIENTE');
                const actual=actualActivo || actualPendiente;
                // Una presentación COMPLETADA o CANCELADA nunca vuelve a mostrarse
                // como "próxima producción". Si no hay curso/pausa/pendiente, la línea terminó.
                if(!actual)return '<div class="pa-empty-current">Sin producción activa en este momento.</div>';
                const idx=filasActuales.indexOf(actual);
                const estado=estadoOrdenItem(actual);
                const parada=paradaActual(actual);
                return `
                  ${!actualActivo ? '<div class="pa-next-production">PRÓXIMA PRODUCCIÓN · AÚN NO INICIADA</div>' : '<div class="pa-now-production">PRODUCIENDO AHORA</div>'}
                  <div class="pa-current-head">
                    <div><strong>${esc(actual.marca)}</strong><small>${esc(presUI(actual.linea,actual.marca,actual.presentacion))}</small></div>
                    ${tarjetaEstado(estado)}
                  </div>
                  <div class="pa-metric-row"><span>Ratio nominal</span><b>${actual.ratio ? actual.ratio.toLocaleString('es-PE')+' UND/h' : 'Sin configurar'}</b></div>
                  <div class="pa-metric-row pa-metric-turno"><span>Ratio</span><b>${fmtRatio(g.ratios?.ratioEfectivo)} UND/h</b></div>
                  <div class="pa-metric-row"><span>Tiempo transcurrido</span><b>${g.tiempos?.ok ? formatoMin(g.tiempos.tiempoTranscurridoMin) : '—'}</b></div>
                  <div class="pa-metric-row"><span>Tiempo operativo</span><b>${g.tiempos?.ok ? formatoMin(g.tiempos.tiempoOperativoMin) : '—'}</b></div>
                  <div class="pa-metric-row"><span>Tiempo en parada</span><b>${g.tiempos?.ok ? formatoMin(g.tiempos.minParadasNoProgramadas+g.tiempos.minPausasProgramadas) : '0 min'}</b></div>
                  ${parada ? `<div class="pa-stop-live"><div><strong>${esc(parada.tipo)}</strong><b>${formatoCronometro(ahoraServidor()-parada.desde)}</b></div>
                    <small>Desde ${new Date(parada.desde).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})} · ${esc(parada.motivo)}</small></div>` : ''}
                  <div class="pa-metric-divider"></div>
                  <div class="pa-metric-row pa-metric-main"><span>Producción desde inicio</span><b>${Math.round(actual.real).toLocaleString('es-PE')} UND</b></div>
                  <div class="pa-metric-row"><span>Último registro</span><b>${ultimoRegistro(actual)}</b></div>
                  <div class="pa-live-actions">${acciones(actual,idx) || `<span class="pa-actions-note">${esc(avisoAccion(actual) || 'Sin controles disponibles para este usuario.')}</span>`}</div>`;
              })()}
            </section>

            <section class="pa-hcol pa-hcol-avance">
              <div class="pa-hcol-title">▰ HISTORIAL / AVANCE DEL TURNO</div>
              <div class="pa-advance-list">${(()=>{
                const ordenados=itemsOrdenadosGrupo(g);
                return ordenados.length ? ordenados.map(({x,estado})=>{
                  const producido=Math.round(producidoDe(x));
                  const programado=Math.round(num(x.prog?.cantidadProgramada));
                  const pct=programado>0 ? producido/programado*100 : 0;
                  const faltante=Math.max(0,programado-producido);
                  const idx=filasActuales.indexOf(x);
                  const cancelar=x.puede==='supervisor' &&
                    !['CANCELADA','COMPLETADA'].includes(estado.key)
                    ? `<button type="button" class="pa-cancel-btn" title="Cancelar programación"
                        data-pa-accion="cancelar" data-pa-indice="${idx}">✕</button>` : '';
                  return `<article class="pa-advance-card pa-advance-${estado.cls}">
                    <div class="pa-advance-top">
                      <div><strong>${esc(x.marca || '—')}</strong><small>${x.presentacion ? esc(presUI(x.linea,x.marca,x.presentacion)) : ''}</small></div>
                      <div class="pa-advance-actions">${tarjetaEstado(estado)}${cancelar}</div>
                    </div>
                    <div class="pa-advance-values"><b>${producido.toLocaleString('es-PE')} / ${programado.toLocaleString('es-PE')} UND</b><strong>${pct.toFixed(1)}%</strong></div>
                    <div class="pa-advance-bar"><div class="${estado.cls}" style="width:${Math.min(100,Math.max(0,pct)).toFixed(1)}%"></div></div>
                    <div class="pa-advance-foot"><span>Faltan: <b>${faltante.toLocaleString('es-PE')} UND</b></span><span>Último registro: <b>${ultimoRegistro(x)}</b></span></div>
                    ${estado.key==='CANCELADA' && x.op?.motivoCancelacion ? `<div class="pa-cancel-reason">Motivo: ${esc(x.op.motivoCancelacion)}</div>` : ''}
                  </article>`;
                }).join('') : '<div class="small-muted">Sin producción programada.</div>';
              })()}</div>
            </section>

          </div>
        </article>`;
      }).join('')}</div></div>`;
    cont.prepend(tablero);
  }

  const css=document.createElement('style');
  css.textContent=`
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
    .pa-progress-row i.curso{color:#a86f00}.pa-progress-row i.curso .pa-status-dot{background:#f5b335;animation:paPulsoProduccion 1.35s ease-in-out infinite;box-shadow:0 0 0 0 rgba(245,179,53,.42)}
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
    .pa-proy-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:4px 18px}
    .pa-proy-grid div b{color:#10265f}.pa-proy-dif.falta{color:#a92f27;font-weight:800}.pa-proy-dif.sobra{color:#13814a;font-weight:800}
    .pa-proy-nota{margin-top:4px;font-size:12px;color:#8a1f17;font-weight:700}.pa-proy-nota.info{color:#5a6b7b;font-weight:600}
    .pa-proy-estado{display:inline-block;margin:2px 0 6px;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:.03em;background:#e8edf2;color:#44566a}
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

    const [hh,mm]=limpio.split(':').map(Number);
    const [yy,mo,dd]=String(x.fecha).split('-').map(Number);
    const fechaInicio=new Date(yy,mo-1,dd,hh,mm,0,0);
    const inicioMs=fechaInicio.getTime();

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
  function pedirMotivoCatalogo(clasificacion){
    return new Promise(resolve=>{
      const programada=clasificacion==='PROGRAMADA';
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
        <small class="pa-modal-nota">${programada
          ? 'El tiempo que exceda el estándar se contará como parada no programada.'
          : 'Queda registrada con hora de inicio; se cierra al reanudar.'}</small>
        <div class="pa-modal-acc"><button type="button" class="btn btn-ghost" data-c>Cancelar</button>
          <button type="button" class="btn btn-primary" data-a>Aceptar</button></div></div>`;
      document.body.appendChild(fondo);
      const sel=fondo.querySelector('#pa-motivo'),wrap=fondo.querySelector('#pa-motivo-detalle-wrap');
      const alternar=()=>{wrap.hidden=!(opciones[sel.value].nombre==='Otro');};
      sel.addEventListener('change',alternar);alternar();
      const cerrar=v=>{fondo.remove();resolve(v);};
      fondo.querySelector('[data-c]').onclick=()=>cerrar(null);
      fondo.addEventListener('click',e=>{if(e.target===fondo)cerrar(null);});
      fondo.querySelector('[data-a]').onclick=()=>{
        const o=opciones[sel.value];
        let motivo=o.nombre;
        if(o.nombre==='Otro'){
          const d=fondo.querySelector('#pa-motivo-detalle').value.trim();
          if(d.length<5){alert('Escribe el detalle del motivo (mínimo 5 caracteres).');return;}
          motivo='Otro — '+d;
        }
        cerrar({motivo,estandarMin:o.estandarMin || 0,clasificacion});
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
          <div><label>Producción final (${esc(x.marca)})</label><input type="number" min="0" step="1" id="pa-c-prod" value="${produccionActual}"></div>
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
        const prod=Number(fondo.querySelector('#pa-c-prod').value);
        if(!motivo){alert('El motivo de la corrección es obligatorio.');return;}
        if(!hc){alert('Indica la hora real de cierre.');return;}
        if(!Number.isFinite(prod) || prod<0){alert('La producción final no es válida.');return;}
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
        if(p.clave===k && datos.prod!==produccionActual)op.produccionFinalCorregida=datos.prod;
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

    // Cuenta compartida de Mantenimiento: sin técnico identificado por PIN no se opera la línea.
    if(ACCIONES_BITACORA[accion] && typeof esMantCompartido==='function' && esMantCompartido() &&
       !(typeof window.mantTecnicoActivo==='function' && window.mantTecnicoActivo())){
      alert('Identifícate con tu PIN antes de operar una línea.');
      if(typeof window.mantCerrarIdentificacion==='function')window.mantCerrarIdentificacion(true);
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
      // Para iniciar una nueva presentación sí se exige el turno vigente.
      if(!operacionAbierta && accion==='iniciar' && !turnoActivo(x.fecha,x.turno))return;
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
      if(!x.vivo){
        const vigente=turnoVigente();
        const ok=confirm(
          `La programación seleccionada es ${x.fecha} · ${x.turno}, pero el turno operativo vigente es ${vigente.fecha} · ${vigente.turno}.\n\n¿Deseas iniciar esta presentación de todas formas?`
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
      const [hh,mm]=limpio.split(':').map(Number);
      const [yy,mo,dd]=String(x.fecha).split('-').map(Number);
      const ms=new Date(yy,mo-1,dd,hh,mm,0,0).getTime();
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
    // El motivo sale del catálogo (con duración estándar para las programadas).
    if(accion==='detener'){
      motivoElegido=await pedirMotivoCatalogo('NO_PROGRAMADA');
      if(!motivoElegido)return;
      motivo=motivoElegido.motivo.slice(0,160);
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
          pausaDesde:0,pausaAcumuladaMs:0,detenidaDesde:0,detencionAcumuladaMs:0,motivo:''
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
        op.estado='DETENIDA';op.motivo=motivo;op.detenidaDesde=ahora;
        // Registro de parada con hora de inicio (fin se completa al reanudar).
        op.paradas=[...(Array.isArray(op.paradas)?op.paradas:[]),{
          id:`${k}|${ahora}|det`,tipo:'DETENCION',motivo,clasificacion:'NO_PROGRAMADA',
          estandarMin:0,inicio:ahora,fin:0,origen:'BOTON',
          creadoPor:nombreOperador()
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
          motivo:e==='PAUSA'?(op.motivoPausa||'Pausa programada'):(op.motivo||'')
        };
        op.pausaDesde=0;op.detenidaDesde=0;op.estado='EN_PRODUCCION';op.motivo='';op.motivoPausa='';
        op.paradas=cerrarParadasAbiertas(op.paradas,ahora);
      } else if(accion==='cancelar'){
        op.paradas=cerrarParadasAbiertas(op.paradas,ahora);
        if(e==='PAUSA' && num(op.pausaDesde)>0)
          op.pausaAcumuladaMs=num(op.pausaAcumuladaMs)+Math.max(0,ahora-num(op.pausaDesde));
        if(['DETENIDA','LISTA'].includes(e) && num(op.detenidaDesde)>0)
          op.detencionAcumuladaMs=num(op.detencionAcumuladaMs)+Math.max(0,ahora-num(op.detenidaDesde));
        op.pausaDesde=0;op.detenidaDesde=0;op.estado='CANCELADA';op.finalizadaEn=ahora;
        op.motivo='';op.motivoCancelacion=motivoCancelacion;op.canceladaEn=ahora;
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
        op.motivo='';
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
        if(accion==='iniciar'){datosEvento.inicioMs=num(op.inicio);datosEvento.inicioHoraManual=op.inicioHoraManual || '';}
        if(accion==='finalizar'){
          datosEvento.cierreMs=ahora;
          datosEvento.producido=Math.round(producidoDe(x));
          datosEvento.programado=Math.round(num(x.prog?.cantidadProgramada));
        }
        if(accion==='reabrir')datosEvento.finalizadaEnAnterior=num(previo.finalizadaEn);
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
    if(event.target.closest('[data-pa-turno-actual]')){
      const t=turnoVigente();
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
    const ahora=ahoraServidor(), tv=turnoVigente();
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

      aplicarEstadoVisualSecuencia(items,line.key,fecha,items[0].turnoPlan || turno,turno,ahora);
      const estados=items.map(x=>({x,e:estadoOrdenItem(x).key,det:x.op?.estado==='DETENIDA'}));
      estados.forEach(o=>{ if(o.det)o.e='DETENIDA'; });
      const claves=estados.map(o=>o.e);
      const estadoLinea=GlacialIndicadores.estadoLineaDesdeItems(claves);
      const activo=(estados.find(o=>o.e===estadoLinea) || estados.find(o=>!['COMPLETADA','CANCELADA'].includes(o.e)) || estados[0]).x;

      const programado=items.reduce((s,x)=>s+(x.op?.estado==='CANCELADA'?0:num(x.prog?.cantidadProgramada)),0);
      const producido=items.reduce((s,x)=>s+producidoDe(x),0);

      // Tiempos y ratios: función central única (23b-tiempos-linea.js).
      const tiempos=calcularTiemposLinea(line.key,turno,fecha,{ahora});
      const ratios=calcularRatiosLinea(tiempos,{produccion:producido,programado,ahora});
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
        avance:programado>0 ? producido/programado*100 : 0,
        ratio:ratios.ratioEfectivo ?? 0,ratios,tiempos,desempeno,
        paradaMs,detenidaMin:null,retrasoPct:null,
        // Estado/avance por marca-presentación (usado por el Inicio operativo).
        detalle:estados.map(({x,e})=>{
          const p=producidoDe(x);
          const g=num(x.prog?.cantidadProgramada);
          return {marca:x.marca,presentacion:x.presentacion,estado:e,producido:p,programado:g,
            avance:g>0 ? p/g*100 : 0};
        })
      };
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
