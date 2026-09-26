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
    if(!u || state.workMode==='visualizar' ||
       (typeof esGerenteSoloLectura==='function' && esGerenteSoloLectura(u)))return '';
    if(['Administrador','Jefe de Producción','Jefe de Operaciones'].includes(u.rol) &&
       tienePermiso('paletas'))return 'supervisor';
    if(u.rol==='Supervisor' && tienePermiso('paletas') &&
       (!u.linea || u.linea===linea))return 'supervisor';
    if(u.rol==='Mantenimiento' && tienePermiso('moduloMantenimiento'))return 'mtto';
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
  function acciones(x,idx){
    if(!x.vivo || !x.prog || !num(x.prog.cantidadProgramada) || !x.puede)return '';
    const boton=(accion,label)=>`<button type="button" class="btn btn-ghost btn-sm"
      data-pa-accion="${accion}" data-pa-indice="${idx}">${label}</button>`;
    const e=x.op?.estado;
    if(x.puede==='mtto'){
      if(e==='EN_PRODUCCION')return boton('detener','Detener línea');
      if(e==='DETENIDA')return boton('lista','Intervención terminada');
      return '';
    }
    if(e==='CANCELADA')return '';
    if(!e || e==='FINALIZADA' || e==='PENDIENTE')return boton('iniciar','Iniciar presentación')+
      boton('cancelar','✕ Cancelar');
    if(e==='DETENIDA' || e==='LISTA')return boton('reanudar','Reanudar producción')+
      boton('finalizar','Finalizar presentación')+boton('cancelar','✕ Cancelar');
    if(e==='PAUSA')return boton('reanudar','Reanudar producción')+boton('cancelar','✕ Cancelar');
    if(e==='EN_PRODUCCION')return boton('detener','Detener línea')+
      boton('pausa','Pausa programada')+boton('finalizar','Finalizar presentación')+
      boton('cancelar','✕ Cancelar');
    return '';
  }
  function avisoAccion(x){
    if(!x.prog || !num(x.prog.cantidadProgramada))
      return 'Para iniciar, primero debe existir programación para esta línea, fecha, turno y presentación.';
    if(!x.vivo)
      return 'Los controles aparecen únicamente en el turno activo. Pulsa «Ver turno actual».';
    if(state.workMode==='visualizar')return 'Cambia al modo Trabajar para usar los controles.';
    if(x.puede==='mtto' && !x.op?.estado)
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
      const vacios=filasActuales.filter(x=>x.linea===line.key && x.sinDatos);
      if(!items.length && !vacios.length)return null;
      const detenidos=items.filter(x=>x.op?.estado==='DETENIDA');
      const pausas=items.filter(x=>x.op?.estado==='PAUSA');
      const ultimoConProduccion=ultimoProductoConProduccion(items);
      const activosGuardados=items.filter(x=>x.op?.estado==='EN_PRODUCCION');
      const activo=detenidos[0] || pausas[0] || ultimoConProduccion ||
        activosGuardados[0] || items.find(x=>x.op?.estado==='LISTA') || items[0] || vacios[0];

      // Para la vista, EN CURSO sigue el último producto que realmente
      // recibió un registro de producción. No altera Firestore ni el histórico.
      if(ultimoConProduccion && !detenidos.length && !pausas.length){
        items.forEach(x=>{
          if(x.op?.estado==='CANCELADA' || x.op?.estado==='FINALIZADA')return;
          if(x===ultimoConProduccion){
            x.estadoVisual='EN_PRODUCCION';
          }else if(x.op?.estado==='EN_PRODUCCION'){
            x.estadoVisual='PENDIENTE';
          }
        });
      }

      const hayCurso=items.some(x=>(x.estadoVisual || x.op?.estado)==='EN_PRODUCCION');
      const nivel=detenidos.length?'roja':pausas.length?'ambar':hayCurso?'verde':'gris';
      const texto=detenidos.length?'Línea detenida':pausas.length?'Pausa programada':hayCurso?'En curso':'Sin iniciar';
      const turnosLinea=[...new Set([...items,...vacios].map(x=>x.turno))];
      const totalProg=items.reduce((s,x)=>s+(x.op?.estado==='CANCELADA'?0:num(x.prog?.cantidadProgramada)),0);
      const totalProd=items.reduce((s,x)=>s+num(resumenProgramacionCombinacionTurnos(x.linea,x.fecha,[x.turno],x.marca,x.presentacion).unidadesProducidas),0);
      // Ratio real de LÍNEA: producto terminado total / horas efectivas acumuladas.
      // Las horas efectivas descuentan pausas programadas y detenciones registradas.
      const horasEfectivas=items.reduce((s,x)=>s+num(x.horas),0);
      const ratioReal=horasEfectivas>0 ? totalProd/horasEfectivas : 0;
      return {line,items,vacios,activo,nivel,texto,turnosLinea,totalProg,totalProd,horasEfectivas,ratioReal};
    }).filter(Boolean);

    const tablero=document.createElement('section');
    tablero.className='panel pa-live-board';
    tablero.innerHTML=`<div class="panel-head"><h3>Estado de las líneas</h3>
      <button type="button" class="btn btn-ghost btn-sm" data-pa-turno-actual>
      Ver turno actual: ${esc(turnoReal.fecha)} · ${esc(turnoReal.turno)}</button></div>
      <div class="panel-body"><p class="small-muted">Vista operativa por línea. Los totales de unidades no se mezclan entre líneas ni presentaciones.</p>
      <div class="pa-oper-kpis">
        <div class="pa-oper-kpi pa-oper-ok"><span>Líneas en producción</span><b>${grupos.filter(g=>g.nivel==='verde').length}</b></div>
        <div class="pa-oper-kpi pa-oper-stop"><span>Líneas detenidas</span><b>${grupos.filter(g=>g.nivel==='roja').length}</b></div>
        <div class="pa-oper-kpi pa-oper-wait"><span>Líneas pendientes / pausa</span><b>${grupos.filter(g=>g.nivel==='gris'||g.nivel==='ambar').length}</b></div>
      </div>
      <div class="pa-live-grid">${grupos.map(g=>{
        const idxActivo=filasActuales.indexOf(g.activo);
        return `<article class="pa-live-card pa-line-card">
          <div class="pa-live-head"><div><strong class="pa-line-title">${esc(g.line.name)}</strong>
          <div class="pa-line-turnos">${esc(g.turnosLinea.join(' · ') || 'SIN TURNO')}</div></div>
          ${renderSemaforoWidget({nivel:g.nivel,texto:g.texto})}</div>
          <div class="pa-section-title">PROGRAMACIÓN DE LÍNEA</div>
          <div class="pa-program-list">${g.items.length ? g.items.map(x=>{
            const prog=num(x.prog?.cantidadProgramada);
            return `<div><b>${esc(x.marca || '—')}</b>${x.presentacion?' · '+esc(presUI(x.linea,x.marca,x.presentacion)):''}<span>${prog.toLocaleString('es-PE')} UND</span></div>`;
          }).join('') : '<div class="small-muted">Sin programación para el período seleccionado.</div>'}</div>
          ${g.activo && !g.activo.sinDatos ? `<div class="pa-current">
            <div class="pa-current-name">${esc(g.activo.marca)} · ${esc(presUI(g.activo.linea,g.activo.marca,g.activo.presentacion))}</div>
            <div>Ratio nominal: <b>${g.activo.ratio ? g.activo.ratio.toLocaleString('es-PE')+' UND/h':'Sin configurar'}</b></div>
            <div>Ratio real línea: <b>${g.ratioReal ? Math.round(g.ratioReal).toLocaleString('es-PE')+' UND/h':'—'}</b></div>
            <div>Horas efectivas línea: <b>${g.horasEfectivas ? g.horasEfectivas.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2})+' h':'—'}</b></div>
            <div>Producción desde el inicio: <b>${Math.round(g.activo.real).toLocaleString('es-PE')} UND</b></div>
            <div>Último registro: <b>${ultimoRegistro(g.activo)}</b></div>
            ${g.activo.op?.motivo && g.activo.nivel==='roja'?`<div>Motivo: ${esc(g.activo.op.motivo)}</div>`:''}
            <div class="pa-live-actions">${acciones(g.activo,idxActivo)}</div>
          </div>`:''}
          <div class="pa-section-title">LISTA DE MARCAS PRODUCIDAS O EN PRODUCCIÓN</div>
          <div class="pa-progress-list">${g.items.length ? g.items.map(x=>{
            const r=resumenProgramacionCombinacionTurnos(x.linea,x.fecha,[x.turno],x.marca,x.presentacion);
            const producido=num(r.unidadesProducidas), programado=num(x.prog?.cantidadProgramada);
            const e=x.estadoVisual || x.op?.estado;
            const cancelado=x.op?.estado==='CANCELADA';
            const terminado=!cancelado && (e==='FINALIZADA' || (programado>0 && producido>=programado));
            const estado=cancelado
              ? '<i class="cancel"><span class="pa-cancel-x">✕</span>CANCELADO</i>'
              : terminado
                ? '<i class="fin"><span class="pa-status-dot"></span>COMPLETADO</i>'
                : e==='EN_PRODUCCION'
                  ? '<i class="curso"><span class="pa-status-dot"></span>EN CURSO</i>'
                  : e==='DETENIDA'
                    ? '<i class="det"><span class="pa-status-dot"></span>DETENIDO</i>'
                    : '<i class="pend"><span class="pa-status-dot"></span>PENDIENTE</i>';
            const idx=filasActuales.indexOf(x);
            const cancelar=x.puede==='supervisor' && !cancelado && !terminado
              ? `<button type="button" class="pa-cancel-btn" data-pa-accion="cancelar" data-pa-indice="${idx}" title="Cancelar marca" aria-label="Cancelar ${esc(x.marca || 'marca')}">✕</button>`
              : '';
            return `<div class="pa-progress-row"><span>${esc(x.marca || '—')}${x.presentacion?' · '+esc(presUI(x.linea,x.marca,x.presentacion)):''}</span>
              <b>${Math.round(producido).toLocaleString('es-PE')} / ${Math.round(programado).toLocaleString('es-PE')} UND</b>
              ${estado}${cancelar}</div>`;
          }).join(''):'<div class="small-muted">Aún no hay marcas registradas.</div>'}</div>
          <div class="pa-total">PRODUCCIÓN TOTAL: <b>${Math.round(g.totalProd).toLocaleString('es-PE')} / ${Math.round(g.totalProg).toLocaleString('es-PE')} UND</b></div>
          ${g.activo && avisoAccion(g.activo)?`<p class="small-muted">${esc(avisoAccion(g.activo))}</p>`:''}
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
    @media(max-width:700px){.pa-oper-kpis{grid-template-columns:1fr}.pa-live-grid{grid-template-columns:1fr}.pa-live-card{padding:14px}.pa-progress-row{grid-template-columns:minmax(0,1fr) auto 28px}.pa-progress-row b{grid-column:1;grid-row:2}.pa-progress-row i{grid-column:2;grid-row:1/3;align-self:center}.pa-cancel-btn{grid-column:3;grid-row:1/3}}
  `;
  document.head.appendChild(css);

  async function cambiarEstado(x,accion){
    if(!x || !turnoActivo(x.fecha,x.turno) || !quienControla(x.linea))return;
    if(accion==='iniciar' && quienControla(x.linea)!=='supervisor')return;
    if(['reanudar','pausa','finalizar','cancelar'].includes(accion) &&
       quienControla(x.linea)!=='supervisor')return;
    if(accion==='lista' && quienControla(x.linea)!=='mtto')return;
    let motivo='';
    if(accion==='detener'){
      motivo=prompt('Motivo de la detención (obligatorio):')?.trim() || '';
      if(!motivo)return;
      motivo=motivo.slice(0,160);
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
        cancelar:e!=='CANCELADA' && e!=='FINALIZADA'
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
        Object.assign(op,{estado:'EN_PRODUCCION',inicio:ahora,
          baseUnidades:num(resumenProgramacionCombinacionTurnos(x.linea,x.fecha,
            [x.turno],x.marca,x.presentacion).unidadesProducidas),
          pausaDesde:0,pausaAcumuladaMs:0,detenidaDesde:0,detencionAcumuladaMs:0,motivo:''});
      } else if(accion==='detener'){
        op.estado='DETENIDA';op.motivo=motivo;op.detenidaDesde=ahora;
      }
      else if(accion==='pausa'){op.estado='PAUSA';op.pausaDesde=ahora;}
      else if(accion==='lista'){op.estado='LISTA';op.listaDesde=ahora;}
      else if(accion==='reanudar'){
        if(e==='PAUSA')op.pausaAcumuladaMs=num(op.pausaAcumuladaMs)+Math.max(0,ahora-num(op.pausaDesde));
        if(['DETENIDA','LISTA'].includes(e) && num(op.detenidaDesde)>0)
          op.detencionAcumuladaMs=num(op.detencionAcumuladaMs)+Math.max(0,ahora-num(op.detenidaDesde));
        op.pausaDesde=0;op.detenidaDesde=0;op.estado='EN_PRODUCCION';op.motivo='';
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
        op.pausaDesde=0;op.detenidaDesde=0;op.estado='FINALIZADA';op.finalizadaEn=ahora;
      }
      items[i]={...items[i],estadoOperacion:op};
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
