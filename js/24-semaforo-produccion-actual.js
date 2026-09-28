/* GLACIAL · Estado de líneas por turno y presentación.
   Cargar DESPUÉS de 16-paletas.js, 17-modo-trabajo.js y 23-gerente-solo-lectura.js;
   ANTES de 12-init.js. Usa el documento existente sync/programaciones. */
(function instalarSemaforoActual(){
  'use strict';
  const MARGEN = 0.90; // Amarillo si real < 90% del ritmo nominal esperado.
  const MIN_INICIO = 10; // No marcar atraso en los primeros diez minutos.
  const MS_HORA = 3600000;
  const esc = s => escaparHtml(String(s ?? ''));
  const presUI=(linea,marca,presentacion)=>
    typeof nombrePresentacionUI==='function'
      ? nombrePresentacionUI(linea,marca,presentacion)
      : String(presentacion || '—');
  const fechaLocal = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+
    '-'+String(d.getDate()).padStart(2,'0');
  const turnoCodigo = t => t.key === 'MANANA' ? 'DÍA' :
    t.key === 'TARDE' ? 'INTERMEDIO' : 'NOCHE';
  const turnoVigente = () => {
    const ahora = new Date();
    const t = obtenerTurnoActual(ahora);
    // El reloj de cierre conserva NOCHE hasta las 07:20; el turno
    // productivo DÍA ya comenzó a las 07:00.
    if(t.enTolerancia){
      const inicio=new Date(ahora);inicio.setHours(7,0,0,0);
      const fin=new Date(ahora);fin.setHours(15,0,0,0);
      return {fecha:fechaLocal(inicio),turno:'DÍA',inicio:inicio.getTime(),
        fin:fin.getTime(),activo:true};
    }
    // El cronómetro tolera el cierre nocturno hasta las 07:20;
    // la producción nominal nocturna termina a las 07:00.
    return {fecha:fechaLocal(t.inicio),turno:turnoCodigo(t),
      inicio:t.inicio.getTime(),fin:t.fin.getTime(),
      activo:ahora.getTime() >= t.inicio.getTime() && ahora.getTime() < t.fin.getTime()};
  };
  function horario(fecha,turno,compartida){
    const [y,m,d] = String(fecha).split('-').map(Number);
    if(!y || !m || !d)return null;
    const h = turno === 'DÍA' ? [7,15] :
      turno === 'INTERMEDIO' ? (compartida ? [7,22] : [15,22]) :
      turno === 'NOCHE' ? [22,7] : null;
    if(!h)return null;
    const inicio=new Date(y,m-1,d,h[0]).getTime();
    const fin=new Date(y,m-1,d+(turno==='NOCHE'?1:0),h[1]).getTime();
    return {inicio,fin};
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
    if(['Administrador','Jefe de Producción','Jefe de Operaciones'].includes(u.rol) &&
       tienePermiso('paletas'))return 'supervisor';

    if(u.rol==='Supervisor' && tienePermiso('paletas') &&
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
        x.estadoVisual='EN_PRODUCCION';
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
    const pausaMs=Number(op?.pausaAcumuladaMs || 0)+
      (op?.estado==='PAUSA' && pausa ? Math.max(0,corteOperacion-pausa) : 0);
    const detenidaDesde=Number(op?.detenidaDesde || 0);
    const detencionMs=Number(op?.detencionAcumuladaMs || 0)+
      (op?.estado==='DETENIDA' && detenidaDesde ? Math.max(0,corteOperacion-detenidaDesde) : 0);
    const horas=inicio && rango ? Math.max(0,
      (Math.min(corteOperacion,rango.fin)-Math.max(inicio,rango.inicio)-pausaMs-detencionMs)/MS_HORA) : 0;
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
    else if(op?.estado==='EN_PRODUCCION' && desdeInicio<esperado*MARGEN){
      nivel='ambar';texto='Por debajo del ritmo nominal';
    } else if(op?.estado==='EN_PRODUCCION'){
      nivel='verde';texto='Avanzando';
    }
    return {linea:l,fecha:f,turno:t,turnoPlan,compartida,
      marca:m,presentacion:p,prog,op,
      nivel,texto,horas,ratio,esperado,real:desdeInicio,vivo,
      puede:quienControla(l)};
  }
  function puedeReabrirProduccion(){
    return !!state.user && tienePermiso('reabrirReporteProduccion');
  }

  function acciones(x,idx){
    if(!x.prog || !num(x.prog.cantidadProgramada) || !x.puede)return '';

    const e=x.op?.estado;

    // Una operación ABIERTA debe poder controlarse aunque haya cambiado
    // el bloque horario/supervisor. Esto es necesario para continuidad
    // DÍA -> INTERMEDIO -> NOCHE y para que Mantenimiento pueda intervenir.
    const operacionAbierta=['EN_PRODUCCION','DETENIDA','LISTA','PAUSA'].includes(e);

    // Solo bloqueamos por turno no vigente cuando se intenta actuar sobre
    // una programación que todavía no tiene una operación abierta.
    if(!x.vivo && !operacionAbierta)return '';

    const boton=(accion,label)=>`<button type="button" class="btn btn-ghost btn-sm"
      data-pa-accion="${accion}" data-pa-indice="${idx}">${label}</button>`;
    if(x.puede==='mtto' || x.puede==='control'){
      if(e==='EN_PRODUCCION'){
        return boton('detener','Detener línea')+
          boton('pausa','Pausa programada');
      }
      if(e==='DETENIDA'){
        return boton('lista','Intervención terminada')+
          boton('reanudar','Reanudar producción');
      }
      if(e==='LISTA' || e==='PAUSA'){
        return boton('reanudar','Reanudar producción');
      }
      return '';
    }
    if(e==='CANCELADA')return '';

    if(e==='FINALIZADA'){
      return puedeReabrirProduccion()
        ? boton('reabrir','Reabrir producción')
        : '';
    }

    if(!e || e==='PENDIENTE')return boton('iniciar','Iniciar presentación')+
      boton('cancelar','✕ Cancelar');
    if(e==='DETENIDA' || e==='LISTA')return boton('corregirInicio','Corregir hora inicio')+
      boton('reanudar','Reanudar producción')+boton('finalizar','Finalizar presentación')+
      boton('cancelar','✕ Cancelar');
    if(e==='PAUSA')return boton('corregirInicio','Corregir hora inicio')+
      boton('reanudar','Reanudar producción')+boton('cancelar','✕ Cancelar');
    if(e==='EN_PRODUCCION')return boton('corregirInicio','Corregir hora inicio')+
      boton('detener','Detener línea')+boton('pausa','Pausa programada')+
      boton('finalizar','Finalizar presentación')+boton('cancelar','✕ Cancelar');
    return '';
  }
  function avisoAccion(x){
    if(!x.prog || !num(x.prog.cantidadProgramada))
      return 'Para iniciar, primero debe existir programación para esta línea, fecha, turno y presentación.';
    if(!x.vivo && !['EN_PRODUCCION','DETENIDA','LISTA','PAUSA'].includes(x.op?.estado))
      return 'Los controles para iniciar aparecen únicamente en el turno operativo vigente.';
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
    const ahora=Date.now();
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

    const grupos=LINES.map(line=>{
      // DÍA e INTERMEDIO pueden apuntar a la MISMA programación compartida.
      // No debemos mostrarla ni sumarla dos veces. Si ambos están visibles,
      // conservamos INTERMEDIO porque su resumen ya arrastra lo avanzado en DÍA.
      const candidatos=filasActuales.filter(x=>x.linea===line.key && !x.sinDatos);
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

      const turnoVistaSecuencia=items[0]?.turno || turnos[0];
      const turnoPlanSecuencia=items[0]?.turnoPlan || turnoVistaSecuencia;
      const secuenciaActiva=aplicarEstadoVisualSecuencia(
        items,line.key,fecha,turnoPlanSecuencia,turnoVistaSecuencia,ahora
      );

      const vacios=filasActuales.filter(x=>x.linea===line.key && x.sinDatos);
      if(!items.length && !vacios.length)return null;
      const detenidos=items.filter(x=>x.op?.estado==='DETENIDA');
      const pausas=items.filter(x=>x.op?.estado==='PAUSA');
      const ultimoConProduccion=ultimoProductoConProduccion(items);
      const activosGuardados=items.filter(x=>x.op?.estado==='EN_PRODUCCION');

      // El estado operativo guardado tiene prioridad absoluta.
      // Los registros de paletas sirven para métricas, pero NO pueden volver
      // a abrir visualmente una presentación ya FINALIZADA.
      const activoSecuencia=items.find(x=>x.estadoVisual==='EN_PRODUCCION');
      const pausaSecuencia=items.find(x=>x.estadoVisual==='PAUSA_SECUENCIA');
      const activo=detenidos[0] ||
        activoSecuencia || pausas[0] || activosGuardados[0] ||
        items.find(x=>x.op?.estado==='LISTA') || pausaSecuencia ||
        items.find(x=>!['FINALIZADA','CANCELADA'].includes(x.op?.estado)) ||
        items[0] || vacios[0];

      const hayCurso=items.some(x=>(x.estadoVisual || x.op?.estado)==='EN_PRODUCCION');
      const hayFinalizada=items.some(x=>x.op?.estado==='FINALIZADA');
      const hayPendiente=items.some(x=>!x.op?.estado || x.op?.estado==='PENDIENTE');
      const todosCerrados=items.length>0 && items.every(
        x=>['FINALIZADA','CANCELADA'].includes(x.op?.estado)
      );
      const lineaCerrada=todosCerrados ||
        (!hayCurso && !detenidos.length && !pausas.length && hayFinalizada && !hayPendiente);
      const nivel=detenidos.length?'roja':pausas.length?'ambar':hayCurso?'verde':'gris';
      const texto=detenidos.length?'Línea detenida':
        pausas.length?'Pausa programada':
        hayCurso?'En curso':
        lineaCerrada?'FINALIZADA':'Sin iniciar';
      const turnosLinea=[...new Set([...items,...vacios].map(x=>x.turno))];
      const totalProg=items.reduce((s,x)=>s+(x.op?.estado==='CANCELADA'?0:num(x.prog?.cantidadProgramada)),0);
      const totalProd=items.reduce((s,x)=>s+num(resumenProgramacionCombinacionTurnos(x.linea,x.fecha,[x.turno],x.marca,x.presentacion).unidadesProducidas),0);

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

        const producido=num(
          resumenProgramacionCombinacionTurnos(
            x.linea,x.fecha,[x.turno],x.marca,x.presentacion
          ).unidadesProducidas
        );
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

        const pausaAcumulada=Number(x.op?.pausaAcumuladaMs || 0);
        const detencionAcumulada=Number(x.op?.detencionAcumuladaMs || 0);

        let pausaAbierta=0;
        if(x.op?.estado==='PAUSA' && Number(x.op?.pausaDesde || 0)>0){
          pausaAbierta=Math.max(
            0,
            Math.min(hasta,corteEstado)-Number(x.op.pausaDesde)
          );
        }

        let detencionAbierta=0;
        if(x.op?.estado==='DETENIDA' && Number(x.op?.detenidaDesde || 0)>0){
          detencionAbierta=Math.max(
            0,
            Math.min(hasta,corteEstado)-Number(x.op.detenidaDesde)
          );
        }

        const descuento=Math.max(
          0,
          pausaAcumulada+detencionAcumulada+pausaAbierta+detencionAbierta
        );

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

      // Tiempo de paradas/pausas registrado por los estados operativos.
      // Se mantiene separado del ratio para que el usuario pueda ver
      // claramente cuánto tiempo estuvo detenida la línea.
      const paradaMs=items.reduce((suma,x)=>{
        const op=x.op || {};
        let ms=Number(op.pausaAcumuladaMs || 0)+
          Number(op.detencionAcumuladaMs || 0);

        if(op.estado==='PAUSA' && Number(op.pausaDesde || 0)>0){
          ms+=Math.max(0,Math.min(corteTurnoLinea,finMaxLinea)-Number(op.pausaDesde));
        }
        if(['DETENIDA','LISTA'].includes(op.estado) && Number(op.detenidaDesde || 0)>0){
          ms+=Math.max(0,Math.min(corteTurnoLinea,finMaxLinea)-Number(op.detenidaDesde));
        }
        return suma+ms;
      },0);

      const horasEfectivasTurno=Math.max(
        0,
        horasTurno-(paradaMs/MS_HORA)
      );
      const ratioTurno=horasEfectivasTurno>0
        ? totalProd/horasEfectivasTurno
        : 0;

      return {
        line,items,vacios,activo,nivel,texto,turnosLinea,totalProg,totalProd,
        horasEfectivas,horasTurno,horasEfectivasTurno,ratioTurno,paradaMs,secuenciaActiva,
        totalesPresentacion
      };
    }).filter(Boolean);

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
    const esSupervisor=/\bsupervisor\b/.test(perfilNormalizado);

    const prioridadGrupo=g=>{
      if(g.items.some(x=>(x.estadoVisual || x.op?.estado)==='EN_PRODUCCION'))return 0;
      if(g.items.some(x=>x.op?.estado==='DETENIDA'))return 1;
      if(g.items.some(x=>['PAUSA_SECUENCIA','PAUSA','LISTA'].includes(x.estadoVisual || x.op?.estado)))return 2;
      if(g.items.some(x=>(x.estadoVisual || x.op?.estado)==='FINALIZADA'))return 3;
      return 4;
    };

    let gruposVisibles=grupos.slice().sort((a,b)=>
      prioridadGrupo(a)-prioridadGrupo(b)
    );

    if(!esSupervisor){
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

    const tablero=document.createElement('section');
    tablero.className='panel pa-live-board';
    tablero.innerHTML=`<div class="panel-head"><h3>Estado de las líneas</h3>
      <button type="button" class="btn btn-ghost btn-sm" data-pa-turno-actual>
      Ver turno actual: ${esc(turnoReal.fecha)} · ${esc(turnoReal.turno)}</button></div>
      <div class="panel-body"><p class="small-muted">Vista operativa por línea. Los totales de unidades no se mezclan entre líneas ni presentaciones.</p>
      <div class="pa-oper-kpis">
        <div class="pa-oper-kpi pa-oper-ok"><span>Líneas en producción</span><b>${gruposVisibles.filter(g=>g.nivel==='verde').length}</b></div>
        <div class="pa-oper-kpi pa-oper-stop"><span>Líneas detenidas</span><b>${gruposVisibles.filter(g=>g.nivel==='roja').length}</b></div>
        <div class="pa-oper-kpi pa-oper-wait"><span>Líneas pendientes / pausa</span><b>${gruposVisibles.filter(g=>g.nivel==='gris'||g.nivel==='ambar').length}</b></div>
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
            <div class="pa-line-status">${renderSemaforoWidget({nivel:g.nivel,texto:g.texto})}</div>
          </div>

          <div class="pa-horizontal-body">

            <section class="pa-hcol pa-hcol-programacion">
              <div class="pa-hcol-title">▥ PROGRAMACIÓN DE LÍNEA</div>
              <div class="pa-program-list pa-program-list-horizontal">${
                g.items.length ? g.items.map(x=>{
                  const prog=num(x.prog?.cantidadProgramada);
                  return `<div class="pa-program-row">
                    <span><b>${esc(x.marca || '—')}</b>${x.presentacion
                      ? '<small>'+esc(presUI(x.linea,x.marca,x.presentacion))+'</small>'
                      : ''}</span>
                    <strong>${prog.toLocaleString('es-PE')} UND</strong>
                  </div>`;
                }).join('') :
                '<div class="small-muted">Sin programación para el período seleccionado.</div>'
              }</div>
            </section>

            <section class="pa-hcol pa-hcol-ratio">
              <div class="pa-hcol-title">◴ PRODUCCIÓN ACTUAL</div>
              ${g.activo && !g.activo.sinDatos ? `
                <div class="pa-active-product">
                  ${esc(g.activo.marca)} · ${esc(presUI(
                    g.activo.linea,g.activo.marca,g.activo.presentacion
                  ))}
                </div>
                <div class="pa-metric-row"><span>Ratio nominal</span><b>${
                  g.activo.ratio
                    ? g.activo.ratio.toLocaleString('es-PE')+' UND/h'
                    : 'Sin configurar'
                }</b></div>
                <div class="pa-metric-row pa-metric-turno"><span>Ratio turno</span><b>${
                  g.ratioTurno
                    ? Math.round(g.ratioTurno).toLocaleString('es-PE')+' UND/h'
                    : '—'
                }</b></div>
                <div class="pa-metric-row"><span>Tiempo transcurrido</span><b>${
                  g.horasTurno ? formatoDuracion(g.horasTurno*MS_HORA) : '—'
                }</b></div>
                <div class="pa-metric-row"><span>Tiempo en parada</span><b>${
                  g.paradaMs ? formatoDuracion(g.paradaMs) : '0 min'
                }</b></div>
                ${(()=>{
                  const parada=paradaActual(g.activo);
                  return parada ? `<div class="pa-stop-live">
                    <div><strong>${esc(parada.tipo)}</strong><b>${formatoCronometro(Date.now()-parada.desde)}</b></div>
                    <small>Desde ${new Date(parada.desde).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})} · ${esc(parada.motivo)}</small>
                  </div>` : '';
                })()}
                <div class="pa-metric-divider"></div>
                <div class="pa-metric-row pa-metric-main"><span>Producción desde el inicio</span><b>${
                  Math.round(g.activo.real).toLocaleString('es-PE')
                } UND</b></div>
                <div class="pa-metric-row"><span>Último registro</span><b>${
                  ultimoRegistro(g.activo)
                }</b></div>
                ${g.activo.op?.motivo && g.activo.nivel==='roja'
                  ? `<div class="pa-stop-reason">Motivo: ${esc(g.activo.op.motivo)}</div>`
                  : ''}
                <div class="pa-live-actions">${acciones(g.activo,idxActivo)}</div>
                ${!acciones(g.activo,idxActivo) && g.activo.puede==='control' && !g.activo.op?.estado
                  ? '<div class="small-muted" style="margin-top:8px">Esperando que Producción inicie la presentación.</div>'
                  : ''}
              ` : '<div class="small-muted">Sin producción activa.</div>'}
            </section>

            <section class="pa-hcol pa-hcol-marcas">
              <div class="pa-hcol-title">◆ MARCAS PRODUCIDAS O EN PRODUCCIÓN</div>
              <div class="pa-progress-list">${g.items.length ? g.items.map(x=>{
                const r=resumenProgramacionCombinacionTurnos(
                  x.linea,x.fecha,[x.turno],x.marca,x.presentacion
                );
                const producido=Math.round(num(r.unidadesProducidas));
                const programado=Math.round(num(x.prog?.cantidadProgramada));
                const e=x.estadoVisual || x.op?.estado;
                const cancelado=x.op?.estado==='CANCELADA';
                const metaCumplida=!cancelado && programado>0 && producido>=programado;
                const finalizadoManual=!cancelado && x.op?.estado==='FINALIZADA' && !metaCumplida;
                const otraMarcaActiva=g.items.some(y=>
                  y!==x && ['EN_PRODUCCION','DETENIDA','PAUSA','LISTA'].includes(y.op?.estado)
                );
                const porRetomar=false;
                const terminado=metaCumplida || finalizadoManual;
                const estado=cancelado
                  ? '<i class="cancel"><span class="pa-cancel-x">✕</span>CANCELADO</i>'
                  : metaCumplida
                    ? '<i class="fin"><span class="pa-status-dot"></span>COMPLETADO</i>'
                    : porRetomar
                      ? '<i class="retomar"><span class="pa-status-dot"></span>POR RETOMAR</i>'
                      : (!g.secuenciaActiva && finalizadoManual)
                        ? '<i class="finalizado"><span class="pa-status-dot"></span>FINALIZADO</i>'
                        : e==='EN_PRODUCCION'
                          ? '<i class="curso"><span class="pa-status-dot"></span>EN CURSO</i>'
                        : e==='DETENIDA'
                          ? '<i class="det"><span class="pa-status-dot"></span>DETENIDO</i>'
                          : e==='PAUSA_SECUENCIA'
                            ? '<i class="retomar"><span class="pa-status-dot"></span>EN PAUSA</i>'
                            : '<i class="pend"><span class="pa-status-dot"></span>PENDIENTE</i>';
                const idx=filasActuales.indexOf(x);
                const cancelar=x.puede==='supervisor' && !cancelado && !terminado
                  ? `<button type="button" class="pa-cancel-btn" title="Cancelar programación"
                      data-pa-accion="cancelar" data-pa-indice="${idx}">✕</button>` : '';
                return `<div class="pa-progress-row pa-progress-row-horizontal">
                  <span><b>${esc(x.marca || '—')}</b><small>${
                    x.presentacion ? esc(presUI(x.linea,x.marca,x.presentacion)) : ''
                  }</small></span>
                  <strong>${producido.toLocaleString('es-PE')} / ${programado.toLocaleString('es-PE')} UND</strong>
                  ${estado}${cancelar}
                </div>`;
              }).join('') : '<div class="small-muted">Sin marcas registradas.</div>'}</div>
            </section>

            <section class="pa-hcol pa-hcol-total">
              <div class="pa-hcol-title">⬢ PRODUCCIÓN TOTAL POR PRESENTACIÓN</div>
              <div class="pa-total-pres-list">
                ${g.totalesPresentacion.length
                  ? g.totalesPresentacion.map(t=>{
                      const pct=t.programado>0 ? t.producido/t.programado*100 : 0;
                      return `<div class="pa-total-pres-card">
                        <div class="pa-total-pres-name">${esc(t.etiqueta)}</div>
                        ${t.marcas.length>1
                          ? `<div class="pa-total-pres-brands">${esc(t.marcas.join(' + '))}</div>`
                          : ''}
                        <div class="pa-total-pres-values">
                          <strong>${Math.round(t.producido).toLocaleString('es-PE')}</strong>
                          <span>/ ${Math.round(t.programado).toLocaleString('es-PE')} UND</span>
                        </div>
                        <div class="pa-total-progress">
                          <div style="width:${Math.min(100,pct).toFixed(1)}%"></div>
                        </div>
                        <div class="pa-total-percent">${pct.toFixed(1)}% de la programación</div>
                      </div>`;
                    }).join('')
                  : '<div class="small-muted">Sin producción programada.</div>'}
              </div>
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
    .pa-horizontal-body{display:grid;grid-template-columns:1.05fr 1.05fr 1.45fr .72fr;align-items:stretch}
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
    .pa-total-big{display:flex;align-items:center;gap:14px;min-height:94px;padding:11px;border-radius:10px;background:#edf6fc}
    .pa-total-big small{display:block;color:#5d7180;font-size:10px;margin-bottom:5px}
    .pa-total-big strong{font-size:24px;line-height:1.05;color:#073f68}.pa-total-big strong span{font-size:13px}
    .pa-total-progress{height:8px;border-radius:999px;background:#dce7ee;overflow:hidden;margin-top:12px}.pa-total-progress>div{height:100%;background:#198754}
    .pa-total-percent{text-align:center;margin-top:6px;font-size:11px;font-weight:700;color:#526979}
    @media(max-width:700px){
      .pa-oper-kpis{grid-template-columns:1fr}
      .pa-live-grid{display:grid;grid-template-columns:1fr;overflow:visible}
      .pa-live-card{padding:14px}
      .pa-line-card-horizontal{min-width:0;padding:0}
      .pa-horizontal-body{grid-template-columns:1fr}
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
    const ahora=new Date();
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

    if(inicioMs>Date.now()+60000){
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

  async function cambiarEstado(x,accion){
    if(!x || !turnoActivo(x.fecha,x.turno) || !quienControla(x.linea))return;
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
        'Quedará PENDIENTE y deberá iniciarse manualmente.'
      );
      if(!ok)return;
    }

    let inicioElegido=null;
    if(accion==='iniciar'){
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
      if(!Number.isFinite(ms) || ms>Date.now()+60000){
        alert('La hora indicada no es válida o está en el futuro.');
        return;
      }
      if(!confirm(
        '¿Corregir la hora de inicio de '+x.marca+' de '+horaAnterior+' a '+limpio+'?\n\n'+
        'No se modificarán las unidades producidas ni los registros de Paletas.'
      ))return;
      inicioCorregido={ms,hora:limpio,anterior:inicioActual};
    }

    let motivo='';
    let motivoPausa='';
    if(accion==='detener'){
      motivo=prompt('Motivo de la detención (obligatorio):')?.trim() || '';
      if(!motivo)return;
      motivo=motivo.slice(0,160);
    }
    if(accion==='pausa'){
      motivoPausa=prompt(
        'Motivo de la pausa programada (ej.: refrigerio, limpieza, cambio programado):'
      )?.trim() || 'Pausa programada';
      motivoPausa=motivoPausa.slice(0,160);
    }
    const ref=db.collection('sync').doc('programaciones');
    const k=llave(x.linea,x.fecha,x.turnoPlan || x.turno,x.marca,x.presentacion);
    const itemsGuardados=await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      const items=snap.exists && Array.isArray(snap.data().items)
        ? snap.data().items.slice() : [];
      const i=items.findIndex(p=>p.clave===k);
      if(i<0 || num(items[i].cantidadProgramada)<=0)throw new Error('No hay programación para esta presentación.');
      const ahora=Date.now();
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
          if(j!==i && mismoPlan(p) &&
             ['EN_PRODUCCION','PAUSA','LISTA'].includes(p.estadoOperacion?.estado))
            items[j]={...p,estadoOperacion:{...p.estadoOperacion,estado:'FINALIZADA',actualizadoEn:ahora}};
        });
      }
      const op={...previo,actualizadoEn:ahora,
        actualizadoPor:state.user?.nombre || state.user?.username || 'Usuario'};
      if(accion==='iniciar'){
        Object.assign(op,{
          estado:'EN_PRODUCCION',
          inicio:inicioElegido.ms,
          inicioRegistradoEn:ahora,
          inicioRegistradoPor:state.user?.nombre || state.user?.username || 'Usuario',
          inicioHoraManual:inicioElegido.hora,
          baseUnidades:num(resumenProgramacionCombinacionTurnos(x.linea,x.fecha,
            [x.turno],x.marca,x.presentacion).unidadesProducidas),
          pausaDesde:0,pausaAcumuladaMs:0,detenidaDesde:0,detencionAcumuladaMs:0,motivo:''
        });
      } else if(accion==='corregirInicio'){
        op.inicioAnterior=inicioCorregido.anterior;
        op.inicio=inicioCorregido.ms;
        op.inicioHoraManual=inicioCorregido.hora;
        op.inicioCorregido=true;
        op.inicioCorregidoEn=ahora;
        op.inicioCorregidoPor=state.user?.nombre || state.user?.username || 'Usuario';
      } else if(accion==='detener'){
        op.estado='DETENIDA';op.motivo=motivo;op.detenidaDesde=ahora;
      }
      else if(accion==='pausa'){
        op.estado='PAUSA';
        op.pausaDesde=ahora;
        op.motivoPausa=motivoPausa;
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
      } else if(accion==='cancelar'){
        if(e==='PAUSA' && num(op.pausaDesde)>0)
          op.pausaAcumuladaMs=num(op.pausaAcumuladaMs)+Math.max(0,ahora-num(op.pausaDesde));
        if(['DETENIDA','LISTA'].includes(e) && num(op.detenidaDesde)>0)
          op.detencionAcumuladaMs=num(op.detencionAcumuladaMs)+Math.max(0,ahora-num(op.detenidaDesde));
        op.pausaDesde=0;op.detenidaDesde=0;op.estado='CANCELADA';op.finalizadaEn=ahora;op.motivo='';
      } else if(accion==='finalizar'){
        if(e==='PAUSA' && num(op.pausaDesde)>0)
          op.pausaAcumuladaMs=num(op.pausaAcumuladaMs)+Math.max(0,ahora-num(op.pausaDesde));
        if(['DETENIDA','LISTA'].includes(e) && num(op.detenidaDesde)>0)
          op.detencionAcumuladaMs=num(op.detencionAcumuladaMs)+Math.max(0,ahora-num(op.detenidaDesde));
        op.pausaDesde=0;
        op.detenidaDesde=0;
        op.estado='FINALIZADA';
        op.finalizadaEn=ahora;
        op.finalizadaPor=state.user?.nombre || state.user?.username || 'Usuario';
      } else if(accion==='reabrir'){
        op.estado='PENDIENTE';
        op.reabiertaEn=ahora;
        op.reabiertaPor=state.user?.nombre || state.user?.username || 'Usuario';
        op.reaperturaDesde='FINALIZADA';
        op.finalizadaEn=0;
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
    catch(err){alert('No se pudo actualizar la línea: '+err.message);}
    finally{if(btn.isConnected)btn.disabled=false;}
  });
  setInterval(()=>{
    if(state.user && state.currentTab==='produccion-actual')renderProduccionActualTab();
  },60000);
})();
