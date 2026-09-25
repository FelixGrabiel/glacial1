/* GLACIAL · Estado de líneas por turno y presentación.
   Cargar DESPUÉS de 16-paletas.js, 17-modo-trabajo.js y 23-gerente-solo-lectura.js;
   ANTES de 12-init.js. Usa el documento existente sync/programaciones. */
(function instalarSemaforoActual(){
  'use strict';
  const MARGEN = 0.90; // Amarillo si real < 90% del ritmo nominal esperado.
  const MIN_INICIO = 10; // No marcar atraso en los primeros diez minutos.
  const MS_HORA = 3600000;
  const esc = s => escaparHtml(String(s ?? ''));
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
    const pausaMs=Number(op?.pausaAcumuladaMs || 0)+
      (op?.estado==='PAUSA' && pausa ? Math.max(0,ahora-pausa) : 0);
    const horas=inicio && rango ? Math.max(0,
      (Math.min(ahora,rango.fin)-Math.max(inicio,rango.inicio)-pausaMs)/MS_HORA) : 0;
    const esperado=ratio*horas;
    const desdeInicio=Math.max(0,actual-num(op?.baseUnidades));
    let nivel='gris',texto='Sin iniciar';
    if(!prog || !num(r.cantidadProgramada))texto='Sin programación';
    else if(!vivo)texto='Consulta histórica';
    else if(op?.estado==='DETENIDA'){nivel='roja';texto='Línea detenida';}
    else if(op?.estado==='PAUSA')texto='Pausa programada';
    else if(op?.estado==='LISTA')texto='Lista para reanudar';
    else if(op?.estado==='FINALIZADA')texto='Presentación finalizada';
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
    if(!e || e==='FINALIZADA')return boton('iniciar','Iniciar presentación');
    if(e==='DETENIDA' || e==='LISTA')return boton('reanudar','Reanudar producción')+
      boton('finalizar','Finalizar presentación');
    if(e==='PAUSA')return boton('reanudar','Reanudar producción');
    if(e==='EN_PRODUCCION')return boton('detener','Detener línea')+
      boton('pausa','Pausa programada')+boton('finalizar','Finalizar presentación');
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
            filasActuales.push(x);
            turnosConDatos.add(turno);
          }
        }));
      // Muestra la línea incluso cuando el turno seleccionado todavía no
      // tiene una programación ni paletas. En "Todos", prioriza el turno vivo.
      const turnosVisibles=turnos.length===1 ? turnos :
        (fecha===turnoReal.fecha && turnos.includes(turnoReal.turno)
          ? [turnoReal.turno] : []);
      turnosVisibles.forEach(turno=>{
        if(turnosConDatos.has(turno))return;
        filasActuales.push({linea:line.key,fecha,turno,marca:'',presentacion:'',
          prog:null,op:null,nivel:'gris',texto:'Sin programación',ratio:0,
          real:0,vivo:turnoActivo(fecha,turno),puede:quienControla(line.key),
          sinDatos:true});
      });
    });
    cont.classList.add('pa-live-active');
    cont.querySelectorAll('.pl-semaforo-wrap,.pl-resumen-semaforo').forEach(e=>e.remove());
    // El chip antiguo era un porcentaje del total, no un estado de operación.
    cont.querySelector('.pl-kpis .pl-kpi:last-child .pl-semaforo-texto')?.remove();
    const tabla=cont.querySelector('table');
    if(tabla){
      const indice=new Map(filasActuales.map(x=>[llave(x.linea,x.fecha,x.turno,
        x.marca,x.presentacion),x]));
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
    const tablero=document.createElement('section');
    tablero.className='panel pa-live-board';
    tablero.innerHTML=`<div class="panel-head"><h3>Estado de las líneas</h3>
      <button type="button" class="btn btn-ghost btn-sm" data-pa-turno-actual>
      Ver turno actual: ${esc(turnoReal.fecha)} · ${esc(turnoReal.turno)}</button></div>
      <div class="panel-body"><p class="small-muted">El supervisor inicia la presentación
      cuando comienza la producción. Los controles requieren el modo Trabajar.
      Verde: avanzando conforme al ratio nominal. Ámbar: avance inferior al 90 %
      del ritmo nominal desde el inicio de la presentación.
      Rojo: detención registrada.</p>
      <div class="pa-live-grid">${filasActuales.map((x,i)=>`
        <article class="pa-live-card"><div class="pa-live-head"><strong>${esc(
          LINES.find(l=>l.key===x.linea)?.name || x.linea)} · ${esc(x.turno)}</strong>
          ${semaforo(x)}</div><div class="pa-live-producto">${x.sinDatos
            ? 'Aún no hay producto programado' : esc(x.marca)+' · '+esc(x.presentacion)}</div>
          ${x.compartida ? '<div class="small-muted">Plan compartido: DÍA e INTERMEDIO</div>' : ''}
          ${x.sinDatos ? '' : `<div>Ratio nominal: <b>${x.ratio
            ? x.ratio.toLocaleString('es-PE')+' UND/h' : 'Sin configurar'}</b></div>
          <div>Producción desde el inicio: <b>${Math.round(x.real).toLocaleString('es-PE')} UND</b></div>
          <div>Último registro: <b>${ultimoRegistro(x)}</b></div>`}
          ${x.op?.motivo && x.nivel==='roja' ? `<div>Motivo: ${esc(x.op.motivo)}</div>` : ''}
          <div class="pa-live-actions">${acciones(x,i)}</div>
          ${x.sinDatos ? '<p class="small-muted">Jefatura debe programar este turno para activar la línea.</p>' :
            (avisoAccion(x) ? `<p class="small-muted">${esc(avisoAccion(x))}</p>` : '')}
          </article>`).join('')}</div>
      ${filasActuales.length ? '' : '<p class="small-muted">Sin producción ni programación en este período. Pulsa «Ver turno actual» y comprueba la programación.</p>'}
      </div>`;
    cont.prepend(tablero);
  }
  const css=document.createElement('style');
  css.textContent='.pa-live-board{margin-bottom:18px}.pa-live-grid{display:grid;'+
    'grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px}'+
    '.pa-live-card{padding:14px;border:1px solid #dce3e8;border-radius:10px;'+
    'background:#f9fcff;font-size:13px;line-height:1.6}'+
    '.pa-live-head{display:flex;align-items:center;justify-content:space-between;gap:8px}'+
    '.pa-live-producto{font-weight:600;color:#005b96;margin:6px 0}'+
    '.pa-live-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}'+
    '.pa-live-active .pl-grupo-card .pl-semaforo-wrap{display:none}';
  document.head.appendChild(css);

  async function cambiarEstado(x,accion){
    if(!x || !turnoActivo(x.fecha,x.turno) || !quienControla(x.linea))return;
    if(accion==='iniciar' && quienControla(x.linea)!=='supervisor')return;
    if(['reanudar','pausa','finalizar'].includes(accion) &&
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
        iniciar:!e || e==='FINALIZADA',detener:e==='EN_PRODUCCION',
        pausa:e==='EN_PRODUCCION',lista:e==='DETENIDA',
        reanudar:['DETENIDA','LISTA','PAUSA'].includes(e),
        finalizar:['EN_PRODUCCION','DETENIDA','LISTA'].includes(e)
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
          pausaDesde:0,pausaAcumuladaMs:0,motivo:''});
      } else if(accion==='detener'){op.estado='DETENIDA';op.motivo=motivo;op.detenidaDesde=ahora;}
      else if(accion==='pausa'){op.estado='PAUSA';op.pausaDesde=ahora;}
      else if(accion==='lista'){op.estado='LISTA';op.listaDesde=ahora;}
      else if(accion==='reanudar'){
        if(e==='PAUSA')op.pausaAcumuladaMs=num(op.pausaAcumuladaMs)+Math.max(0,ahora-num(op.pausaDesde));
        op.pausaDesde=0;op.estado='EN_PRODUCCION';op.motivo='';
      } else if(accion==='finalizar'){op.estado='FINALIZADA';op.finalizadaEn=ahora;}
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
