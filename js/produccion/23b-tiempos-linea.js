/* =============================================================
   GLACIAL · TIEMPOS Y RATIOS DE LÍNEA (función central única)
   -------------------------------------------------------------
   Todo el sistema (semáforo de Producción Actual, Inicio ejecutivo,
   Avance/Cierre) obtiene tiempos, paradas y ratios de AQUÍ.

   FUENTES DE PARADAS (se unifican; no se crean colecciones nuevas):
   a) BOTONES de Producción Actual (PAUSA PROGRAMADA / DETENER LÍNEA):
      sync/programaciones → items[].estadoOperacion.paradas[]
      { id, tipo:'PAUSA'|'DETENCION', motivo, clasificacion, estandarMin,
        inicio, fin (0 = abierta), origen }.
      Registros antiguos sin ese arreglo se reconstruyen desde
      items[].historialAlertas (detencion/reanudacion, pausa_programada/
      fin_pausa_programada) y desde detencionAcumuladaMs.
   b) SUPERVISOR: Nuevo registro (sync/records → cuadros[].paradas…
      {descripcion,tiempoMin}) y Avance/Cierre (sync/avancesTurno →
      paradasOperativas {descripcion,minutos,tipo, horaInicio?, horaFin?}).
      Si traen hora de inicio/fin se fusionan como intervalos; si solo
      traen minutos se suman, salvo que el MOTIVO ya exista registrado
      por botón en el mismo turno (duplicado: no se suma dos veces).

   REGLAS
   - Los intervalos solapados se fusionan (no se cuenta doble). Si una
     parada coincide con una pausa programada, ese tiempo cuenta como
     programado.
   - Motivo programado con duración estándar: el exceso cuenta como NO
     programada (refrigerio de 75 min = 60 programada + 15 no programada).
   - Ninguna parada cuenta después del cierre de la línea ni del fin de
     turno. Una parada abierta en una línea ya finalizada se cierra:
     programada con estándar → inicio + estándar; otra → hora de cierre.
   - La pausa automática "Cambio temporal de producción" no es parada de
     línea (otra presentación sigue produciendo).
   ============================================================= */
(function instalarTiemposLinea(){
  'use strict';
  /* Hora estimada del servidor (la misma de las paradas del semáforo); sin calibrar, la del equipo. */
  function ahoraServidor(){
    return typeof window.tareoAhoraServidor==='function' ? window.tareoAhoraServidor() : Date.now();
  }

  const MS_MIN=60000;
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const norm=t=>typeof normalizarMotivoParada==='function'
    ? normalizarMotivoParada(t)
    : String(t||'').toLowerCase().trim();
  const estandar=t=>typeof estandarMotivoParada==='function'?estandarMotivoParada(t):0;

  /* Umbrales del semáforo de DESEMPEÑO (editar aquí si cambian). */
  const UMBRALES={
    enCursoVerde:1.00,   // turno en curso: ratio efectivo / ratio necesario
    enCursoAmbar:0.90,
    cierreVerde:0.95,    // turno terminado: cumplimiento de la programación
    cierreAmbar:0.85
  };

  const CAMBIO_TEMPORAL='Cambio temporal de producción';

  function rangoTurno(fecha,turno,compartida){
    const [y,m,d]=String(fecha||'').split('-').map(Number);
    if(!y||!m||!d)return null;
    const h=turno==='DÍA'?[7,15]:turno==='INTERMEDIO'?(compartida?[7,22]:[15,22]):
      turno==='NOCHE'?[22,7]:null;
    if(!h)return null;
    return {
      inicio:new Date(y,m-1,d,h[0]).getTime(),
      // NOCHE cruza la medianoche: termina al día siguiente.
      fin:new Date(y,m-1,d+(turno==='NOCHE'?1:0),h[1]).getTime()
    };
  }

  const bloqueTurno=t=>t==='NOCHE'?'NOCHE':'DIA_INTERMEDIO';

  function itemsBloque(linea,fecha,turno){
    const todos=typeof loadProgramaciones==='function'?(loadProgramaciones()||[]):[];
    return todos.filter(p=>p&&p.linea===linea&&p.fecha===fecha&&
      bloqueTurno(p.turno)===bloqueTurno(turno)&&num(p.cantidadProgramada)>0);
  }

  /* ---------- intervalos ---------- */
  function unir(intervalos){
    const orden=intervalos.filter(i=>i.fin>i.inicio).sort((a,b)=>a.inicio-b.inicio);
    const salida=[];
    orden.forEach(i=>{
      const ult=salida[salida.length-1];
      if(ult&&i.inicio<=ult.fin)ult.fin=Math.max(ult.fin,i.fin);
      else salida.push({inicio:i.inicio,fin:i.fin});
    });
    return salida;
  }
  const medir=lista=>lista.reduce((s,i)=>s+(i.fin-i.inicio),0);
  function interseccion(a,b){
    let ms=0,i=0,j=0;
    while(i<a.length&&j<b.length){
      const ini=Math.max(a[i].inicio,b[j].inicio),fin=Math.min(a[i].fin,b[j].fin);
      if(fin>ini)ms+=fin-ini;
      if(a[i].fin<b[j].fin)i++;else j++;
    }
    return ms;
  }
  /* a \ b (ambos ya unidos) */
  function restar(a,b){
    const salida=[];
    a.forEach(seg=>{
      let desde=seg.inicio;
      b.forEach(x=>{
        if(x.fin<=desde||x.inicio>=seg.fin)return;
        if(x.inicio>desde)salida.push({inicio:desde,fin:x.inicio});
        desde=Math.max(desde,x.fin);
      });
      if(desde<seg.fin)salida.push({inicio:desde,fin:seg.fin});
    });
    return salida;
  }

  /* ---------- paradas del supervisor ---------- */
  let cacheOperativas=null,escuchando=false;
  function paradasOperativas(){
    if(typeof avanceEstado!=='undefined'&&avanceEstado&&avanceEstado.unsubscribe)
      return avanceEstado.paradasOperativas||[];
    if(!escuchando&&typeof db!=='undefined'){
      escuchando=true;
      try{
        db.collection('sync').doc('avancesTurno').onSnapshot(doc=>{
          const d=doc.exists?doc.data():{};
          cacheOperativas=Array.isArray(d.paradasOperativas)?d.paradasOperativas:[];
          refrescarVistas();
        },()=>{});
      }catch(_){/* sin conexión: se usa lo disponible */}
    }
    return cacheOperativas||(typeof avanceEstado!=='undefined'?avanceEstado.paradasOperativas:[])||[];
  }
  window.paradasOperativasActuales=()=>paradasOperativas();
  function refrescarVistas(){
    try{
      if(typeof state==='undefined'||!state.user)return;
      if(typeof registroAutoRefrescar==='function')registroAutoRefrescar();
      if(state.currentTab==='produccion-actual'&&typeof renderProduccionActualTab==='function')
        renderProduccionActualTab();
      else if(typeof cpRefrescarEjecutivo==='function')cpRefrescarEjecutivo();
    }catch(_){/* la vista se refresca en el siguiente ciclo */}
  }

  function horaAMs(fecha,hora,turno){
    if(!fecha||!/^\d{1,2}:\d{2}$/.test(String(hora||'')))return 0;
    const d=new Date(`${fecha}T${String(hora).padStart(5,'0')}:00`);
    if(turno==='NOCHE'&&Number(String(hora).slice(0,2))<12)d.setDate(d.getDate()+1);
    return d.getTime();
  }

  /* Lista de paradas del supervisor: {motivo,clasif,minutos,inicio?,fin?,origen}. */
  function paradasSupervisor(linea,fecha,turno){
    const salida=[];
    const records=typeof loadRecords==='function'?(loadRecords()||[]):[];
    records.forEach(r=>{
      if(!r||r.linea!==linea||r.fecha!==fecha)return;
      const grupo=r.grupoTurno||(typeof grupoTurnoReporte==='function'
        ?grupoTurnoReporte(r.turno):bloqueTurno(r.turno));
      if(grupo!==bloqueTurno(turno))return;
      const cuadros=typeof normalizarCuadros==='function'?normalizarCuadros(r):(r.cuadros||[]);
      cuadros.forEach(q=>{
        [['paradasNoProgramadas','NO_PROGRAMADA'],['paradasProgramadas','PROGRAMADA']].forEach(([k,clasif])=>{
          (q?.[k]||[]).forEach(p=>{
            // Filas automáticas (importadas de Paletas/semáforo/Avance): ya se cuentan en su origen.
            if(p?.auto)return;
            if(p?.descripcion&&num(p.tiempoMin)>0)
              salida.push({motivo:p.descripcion,clasif,minutos:num(p.tiempoMin),origen:'REGISTRO'});
          });
        });
      });
    });
    // Mismo criterio de turno que Avance/Cierre (INTERMEDIO se agrupa con DÍA).
    const canon=t=>String(t||'').toUpperCase().includes('NOCHE')?'NOCHE':'DÍA';
    paradasOperativas().forEach(p=>{
      if(!p||p.eliminada||p.linea!==linea||p.fecha!==fecha||canon(p.turno)!==canon(turno))return;
      const e={motivo:p.descripcion||'',clasif:p.tipo==='PROGRAMADA'?'PROGRAMADA':'NO_PROGRAMADA',
        minutos:num(p.minutos),origen:'AVANCE'};
      const ini=horaAMs(fecha,p.horaInicio,canon(turno)),fin=horaAMs(fecha,p.horaFin,canon(turno));
      if(ini&&fin&&fin>ini){e.inicio=ini;e.fin=fin;e.minutos=(fin-ini)/MS_MIN;}
      if(e.minutos>0)salida.push(e);
    });
    return salida;
  }

  /* ---------- registros de botón + reconstrucción de históricos ---------- */
  function registrosItem(p,finCalculo){
    const op=p.estadoOperacion||{};
    const cerrado=['FINALIZADA','CANCELADA'].includes(op.estado);
    const cierreOp=num(op.finalizadaEn)||num(op.canceladaEn)||0;
    const lista=[];

    (Array.isArray(op.paradas)?op.paradas:[]).forEach(r=>{
      if(!r||num(r.inicio)<=0)return;
      const std=num(r.estandarMin);
      let fin=num(r.fin);
      let abierta=false;
      if(!fin){
        if(cerrado&&cierreOp){
          // Parada que nunca se reanudó en una línea ya cerrada.
          fin=(r.clasificacion==='PROGRAMADA'&&std>0)
            ?Math.min(num(r.inicio)+std*MS_MIN,cierreOp):cierreOp;
        }else{fin=finCalculo;abierta=true;}
      }
      lista.push({id:r.id||'',tipo:r.tipo==='DETENCION'?'DETENCION':'PAUSA',
        motivo:r.motivo||'',clasif:r.clasificacion==='PROGRAMADA'?'PROGRAMADA':'NO_PROGRAMADA',
        estandarMin:std,inicio:num(r.inicio),fin,abierta,origen:'BOTON'});
    });

    // Eventos históricos (datos anteriores a los registros de parada).
    const legado=[];
    let legadoDetMs=0;
    if(!op.paradasMigradas){
      const eventos=(Array.isArray(p.historialAlertas)?p.historialAlertas:[])
        .filter(e=>e&&num(e.momento)>0).sort((a,b)=>num(a.momento)-num(b.momento));
      const tope=cierreOp||finCalculo;
      let abDet=0,abPausa=0,loggedDetMs=0;
      eventos.forEach(e=>{
        const t=num(e.momento);
        if(e.tipo==='detencion'){abDet=t;}
        else if(e.tipo==='reanudacion'&&abDet){legado.push({tipo:'DETENCION',clasif:'NO_PROGRAMADA',inicio:abDet,fin:t});loggedDetMs+=t-abDet;abDet=0;}
        else if(e.tipo==='pausa_programada'){abPausa=t;}
        else if(e.tipo==='fin_pausa_programada'&&abPausa){legado.push({tipo:'PAUSA',clasif:'PROGRAMADA',inicio:abPausa,fin:t});abPausa=0;}
        else if(e.tipo==='cierre_parada'){
          // Cierre explícito al finalizar la línea (hora real de reanudación).
          if(abDet){legado.push({tipo:'DETENCION',clasif:'NO_PROGRAMADA',inicio:abDet,fin:t});loggedDetMs+=t-abDet;abDet=0;}
          if(abPausa){legado.push({tipo:'PAUSA',clasif:'PROGRAMADA',inicio:abPausa,fin:t});abPausa=0;}
        }
      });
      const parado=['DETENIDA','LISTA'].includes(op.estado);
      if(abDet)legado.push({tipo:'DETENCION',clasif:'NO_PROGRAMADA',inicio:abDet,fin:parado?finCalculo:Math.max(abDet,cierreOp||abDet)});
      else if(parado&&num(op.detenidaDesde)>0&&!(op.paradas||[]).some(r=>!num(r.fin)))
        legado.push({tipo:'DETENCION',clasif:'NO_PROGRAMADA',inicio:num(op.detenidaDesde),fin:finCalculo});
      const pausadoReal=op.estado==='PAUSA'&&op.motivoPausa!==CAMBIO_TEMPORAL;
      if(abPausa)legado.push({tipo:'PAUSA',clasif:'PROGRAMADA',inicio:abPausa,fin:op.estado==='PAUSA'?finCalculo:Math.max(abPausa,tope)});
      else if(pausadoReal&&num(op.pausaDesde)>0&&!(op.paradas||[]).some(r=>!num(r.fin)))
        legado.push({tipo:'PAUSA',clasif:'PROGRAMADA',inicio:num(op.pausaDesde),fin:finCalculo});
      legadoDetMs=Math.max(0,num(op.detencionAcumuladaMs)-loggedDetMs);
    }
    return {lista,legado,legadoDetMs};
  }

  /* =========================================================
     calcularTiemposLinea(linea, turno, fecha, opciones)
     opciones: {ahora, inicioMs, finMs}  (Avance/Cierre fija el corte)
     Devuelve minutos. ok=false si falta el inicio real de la línea.
     ========================================================= */
  function calcularTiemposLinea(linea,turno,fecha,opciones){
    const opts=opciones||{};
    const ahora=opts.ahora||ahoraServidor();
    const items=itemsBloque(linea,fecha,turno);
    const activos=items.filter(p=>p.estadoOperacion?.estado!=='CANCELADA');
    const compartida=turno==='INTERMEDIO'&&items.some(p=>p.turno==='DÍA');
    const rango=rangoTurno(fecha,turno,compartida);

    const inicios=activos.map(p=>num(p.estadoOperacion?.inicio)).filter(Boolean);
    let inicio=opts.inicioMs!==undefined?num(opts.inicioMs):(inicios.length?Math.min(...inicios):0);
    if(opts.inicioMs===undefined&&inicio&&rango)inicio=Math.max(inicio,rango.inicio);

    const finalizada=activos.length>0&&activos.every(p=>p.estadoOperacion?.estado==='FINALIZADA');
    const cierres=activos.map(p=>num(p.estadoOperacion?.finalizadaEn)).filter(Boolean);
    let fin;
    if(opts.finMs!==undefined)fin=num(opts.finMs);
    else if(finalizada&&cierres.length)fin=Math.max(...cierres);        // ratio congelado al cerrar
    else fin=rango?Math.min(ahora,rango.fin):ahora;

    const vacio={
      ok:false,linea,turno,fecha,inicioMs:inicio||0,finMs:fin||0,finTurnoMs:rango?rango.fin:0,
      finalizada,enCurso:false,
      tiempoTranscurridoMin:0,minParadasNoProgramadas:0,minPausasProgramadas:0,tiempoOperativoMin:0,
      fuentes:{supervisor:{noProgramadas:0,programadas:0},detenerLinea:{noProgramadas:0},
        pausaProgramada:{programadas:0},boton:{noProgramadas:0,programadas:0}},
      solapeMin:0,duplicados:[],pausaSinCerrar:null,detalle:[]
    };
    if(!inicio||!fin||fin<=inicio)return vacio;

    const transcurridoMs=fin-inicio;
    const recortar=i=>({...i,inicio:Math.max(i.inicio,inicio),fin:Math.min(i.fin,fin)});

    /* 1) Recolectar entradas de todas las fuentes */
    const registros=[],legado=[];
    let legadoDetMs=0;
    activos.forEach(p=>{
      const r=registrosItem(p,fin);
      registros.push(...r.lista);legado.push(...r.legado);legadoDetMs+=r.legadoDetMs;
    });
    const sup=paradasSupervisor(linea,fecha,turno);

    /* 2) Duplicados: motivo del supervisor ya registrado por botón */
    const motivosBoton=new Set(registros.map(r=>norm(r.motivo)).filter(Boolean));
    const duplicados=[];
    const supValidas=sup.filter(s=>{
      const dup=motivosBoton.has(norm(s.motivo));
      if(!dup)return true;
      // Con hora: se fusiona por intervalo; solo-minutos: se omite para no sumar dos veces.
      if(s.inicio&&s.fin)return true;
      duplicados.push({motivo:s.motivo,minutos:s.minutos,origen:s.origen});
      return false;
    });

    /* 3) Intervalos clasificados (programada / no programada) */
    const progBoton=[],npBoton=[],progSup=[],npSup=[];
    const detalle=[];
    let pausaSinCerrar=null;
    const clasificar=(e,progLista,npLista)=>{
      const seg=recortar(e);
      if(seg.fin<=seg.inicio)return;
      const std=e.clasif==='PROGRAMADA'?(num(e.estandarMin)||estandar(e.motivo)):0;
      const dur=seg.fin-seg.inicio;
      if(e.clasif==='PROGRAMADA'){
        if(std>0&&dur>std*MS_MIN){
          progLista.push({inicio:seg.inicio,fin:seg.inicio+std*MS_MIN});
          npLista.push({inicio:seg.inicio+std*MS_MIN,fin:seg.fin});
        }else progLista.push({inicio:seg.inicio,fin:seg.fin});
      }else npLista.push({inicio:seg.inicio,fin:seg.fin});
    };
    registros.forEach(r=>{
      clasificar(r,progBoton,npBoton);
      const seg=recortar(r);
      detalle.push({id:r.id,tipo:r.tipo,motivo:r.motivo,clasif:r.clasif,inicio:seg.inicio,fin:seg.fin,
        abierta:r.abierta,estandarMin:r.estandarMin||estandar(r.motivo),origen:'BOTON',
        minutos:Math.max(0,(seg.fin-seg.inicio)/MS_MIN)});
      const std=r.estandarMin||estandar(r.motivo);
      if(r.abierta&&r.clasif==='PROGRAMADA'&&std>0&&(fin-r.inicio)/MS_MIN>std&&!finalizada){
        pausaSinCerrar={motivo:r.motivo,transcurridoMin:(fin-r.inicio)/MS_MIN,estandarMin:std,
          excesoMin:(fin-r.inicio)/MS_MIN-std};
      }
    });
    // Datos antiguos sin registro: solo cuentan donde no hay registro de botón.
    const cubierto=unir([...progBoton,...npBoton]);
    const registrosTodos=unir(registros.map(recortar));
    legado.map(recortar).filter(i=>i.fin>i.inicio).forEach(i=>{
      restar([i],registrosTodos).forEach(seg=>(i.clasif==='PROGRAMADA'?progBoton:npBoton).push(seg));
    });
    void cubierto;

    const durProg=[],durNp=[];  // solo minutos (sin hora)
    supValidas.forEach(s=>{
      if(s.inicio&&s.fin){clasificar(s,progSup,npSup);return;}
      const std=s.clasif==='PROGRAMADA'?estandar(s.motivo):0;
      if(s.clasif==='PROGRAMADA'){
        if(std>0&&s.minutos>std){durProg.push(std);durNp.push(s.minutos-std);}
        else durProg.push(s.minutos);
      }else durNp.push(s.minutos);
    });

    /* 4) Fusión y totales */
    const Pb=unir(progBoton),Nb=restar(unir(npBoton),Pb);
    const Ps=unir(progSup),Ns=unir(npSup);
    const P=unir([...Pb,...Ps]);
    const Ntodo=unir([...npBoton,...npSup]);
    const N=restar(Ntodo,P);                        // lo solapado cuenta como programado
    const solapeMs=medir(Ntodo)-medir(N);

    const transcurrido=transcurridoMs/MS_MIN;
    const sum=a=>a.reduce((s,v)=>s+v,0);
    const botonProgMin=medir(Pb)/MS_MIN;
    const botonNpMin=(medir(Nb)+legadoDetMs)/MS_MIN;
    const pausas=Math.min(transcurrido,medir(P)/MS_MIN+sum(durProg));
    const noProg=Math.min(Math.max(0,transcurrido-pausas),(medir(N)+legadoDetMs)/MS_MIN+sum(durNp));

    /* Lista de paradas para el análisis (Pareto, MTTR, MTBF): CAMPO NUEVO, no cambia ningún total.
       Cada parada con su motivo, clasificación y minutos (recortados al período). El exceso sobre el
       estándar de un motivo programado se separa como parada NO programada (mismo criterio que arriba).
       'ajusteNpMin' / 'ajusteProgMin' = diferencia entre los totales de arriba y la suma de la lista
       (solapes fusionados, topes): permite que el Pareto cuadre exactamente con el semáforo. */
    const paradasClasificadas=[];
    const empujar=(motivo,clasif,minutos,datos)=>{
      if(!(minutos>0))return;
      paradasClasificadas.push(Object.assign({motivo:motivo||'',clasif,minutos},datos||{}));
    };
    const partirPorEstandar=(motivo,clasif,minutos,stdMin,datos)=>{
      if(clasif==='PROGRAMADA'&&stdMin>0&&minutos>stdMin){
        empujar(motivo,'PROGRAMADA',stdMin,datos);
        empujar(motivo,'NO_PROGRAMADA',minutos-stdMin,Object.assign({},datos,{exceso:true}));
      }else empujar(motivo,clasif,minutos,datos);
    };
    registros.forEach(r=>{
      const seg=recortar(r);
      if(seg.fin<=seg.inicio)return;
      const std=r.clasif==='PROGRAMADA'?(num(r.estandarMin)||estandar(r.motivo)):0;
      partirPorEstandar(r.motivo,r.clasif,(seg.fin-seg.inicio)/MS_MIN,std,
        {origen:'BOTON',id:r.id||'',inicio:seg.inicio,fin:seg.fin,abierta:!!r.abierta});
    });
    legado.map(recortar).filter(i=>i.fin>i.inicio).forEach(i=>
      empujar(i.tipo==='PAUSA'?'Pausa programada':'Detención de línea',i.clasif,(i.fin-i.inicio)/MS_MIN,
        {origen:'HISTORICO',inicio:i.inicio,fin:i.fin}));
    if(legadoDetMs>0)
      empujar('Detención de línea','NO_PROGRAMADA',legadoDetMs/MS_MIN,{origen:'HISTORICO'});
    supValidas.forEach(s=>{
      if(s.inicio&&s.fin){
        const seg=recortar(s);
        if(seg.fin<=seg.inicio)return;
        partirPorEstandar(s.motivo,s.clasif,(seg.fin-seg.inicio)/MS_MIN,s.clasif==='PROGRAMADA'?estandar(s.motivo):0,
          {origen:s.origen||'SUPERVISOR',inicio:seg.inicio,fin:seg.fin});
      }else partirPorEstandar(s.motivo,s.clasif,s.minutos,s.clasif==='PROGRAMADA'?estandar(s.motivo):0,{origen:s.origen||'SUPERVISOR'});
    });
    const sumaClasif=c=>paradasClasificadas.filter(x=>x.clasif===c).reduce((a,x)=>a+x.minutos,0);
    const ajusteNpMin=noProg-sumaClasif('NO_PROGRAMADA');
    const ajusteProgMin=pausas-sumaClasif('PROGRAMADA');

    // Aporte por tipo de botón (para el desglose de la tarjeta).
    const minTipo=tipo=>medir(unir(registros.filter(r=>r.tipo===tipo).map(recortar)))/MS_MIN;
    const supMin=medir(unir([...progSup,...npSup]))/MS_MIN+sum(durProg)+sum(durNp);

    return {
      ...vacio,ok:true,
      enCurso:!finalizada&&opts.finMs===undefined&&!!rango&&ahora>=inicio&&ahora<rango.fin,
      tiempoTranscurridoMin:transcurrido,
      minParadasNoProgramadas:noProg,
      minPausasProgramadas:pausas,
      tiempoOperativoMin:Math.max(0,transcurrido-pausas-noProg),
      fuentes:{
        supervisor:{noProgramadas:medir(Ns)/MS_MIN+sum(durNp),programadas:medir(Ps)/MS_MIN+sum(durProg),total:supMin},
        detenerLinea:{noProgramadas:minTipo('DETENCION')+legadoDetMs/MS_MIN},
        pausaProgramada:{programadas:minTipo('PAUSA')},
        boton:{noProgramadas:botonNpMin,programadas:botonProgMin}
      },
      solapeMin:solapeMs/MS_MIN,
      duplicados,pausaSinCerrar,detalle,
      paradasClasificadas,ajusteNpMin,ajusteProgMin
    };
  }

  /* =========================================================
     Ratios (UND/h). null = dato faltante → la interfaz muestra "-".
     ========================================================= */
  function calcularRatiosLinea(t,datos){
    const prod=Math.max(0,num(datos&&datos.produccion));
    const prog=Math.max(0,num(datos&&datos.programado));
    const ahora=(datos&&datos.ahora)||ahoraServidor();
    const sal={ratioTurno:null,ratioEfectivo:null,ratioNecesario:null,restanteMin:null};
    if(!t||!t.ok)return sal;

    const baseBruta=t.tiempoTranscurridoMin-t.minPausasProgramadas;
    if(baseBruta>0)sal.ratioTurno=prod/(baseBruta/60);
    if(t.tiempoOperativoMin>0)sal.ratioEfectivo=prod/(t.tiempoOperativoMin/60);

    if(t.enCurso&&t.finTurnoMs){
      const restante=Math.max(0,(t.finTurnoMs-ahora)/MS_MIN);
      sal.restanteMin=restante;
      const pendiente=Math.max(0,prog-prod);
      if(pendiente<=0)sal.ratioNecesario=0;
      else if(restante>0)sal.ratioNecesario=pendiente/(restante/60);
    }
    return sal;
  }

  /* Color = DESEMPEÑO (no el estado). nivel: verde | ambar | roja | gris */
  function evaluarDesempenoLinea(t,ratios,datos){
    const prod=num(datos&&datos.produccion),prog=num(datos&&datos.programado);
    if(!t||!t.ok)return {nivel:'gris',motivo:'Sin datos de inicio'};
    if(t.enCurso){
      if(ratios.ratioNecesario===0)return {nivel:'verde',motivo:'Programación alcanzada'};
      if(ratios.ratioNecesario>0&&ratios.ratioEfectivo!==null){
        const r=ratios.ratioEfectivo/ratios.ratioNecesario;
        const nivel=r>=UMBRALES.enCursoVerde?'verde':r>=UMBRALES.enCursoAmbar?'ambar':'roja';
        return {nivel,razon:r,motivo:'Ratio efectivo vs. necesario'};
      }
      return {nivel:'gris',motivo:'Ratio no disponible'};
    }
    if(prog>0){
      const c=prod/prog;
      return {nivel:c>=UMBRALES.cierreVerde?'verde':c>=UMBRALES.cierreAmbar?'ambar':'roja',
        razon:c,motivo:'Cumplimiento de la programación'};
    }
    return {nivel:'gris',motivo:'Sin programación'};
  }

  /* =========================================================
     PROYECCIÓN DE CIERRE (solo lectura; NO modifica nada de lo anterior)
     Definiciones oficiales de GLACIAL:
       Horas efectivas = tiempo transcurrido − (paradas programadas + no programadas) ÷ 60
       RATIO (UND/h)   = producido ÷ horas efectivas                     → ratios.ratioEfectivo
       RENDIMIENTO DEL TURNO = producido ÷ ((transcurrido − pausas programadas) ÷ 60)
                                                                          → ratios.ratioTurno
     Dos escenarios con el tiempo restante (hasta el fin del turno, descontando el refrigerio si aún no se tomó):
       «Sin más paradas»            = producido + RATIO × restante
       «Si las paradas siguen igual» = producido + RENDIMIENTO × restante   (proyección realista)
     Si las horas efectivas son ≤ 0 el ratio es null y la interfaz muestra «—».
     ========================================================= */
  const UMBRALES_PROYECCION={
    verdePct:100,        // proyección realista ≥ 100 % → verde
    ambarPct:90,         // entre 90 % y 99 % → ámbar; por debajo → rojo
    minCalculoMin:30     // durante los primeros 30 min de la programación: «Calculando»
  };
  function proyectarCierreLinea(t,ratios,datos,umbrales){
    const u=Object.assign({},UMBRALES_PROYECCION,umbrales||{});
    const prod=Math.max(0,num(datos&&datos.produccion));
    const prog=Math.max(0,num(datos&&datos.programado));
    const ahora=(datos&&datos.ahora)||ahoraServidor();
    const sal={estado:'SIN_PROYECCION',producido:prod,programado:prog,restanteMin:null,pausaPendienteMin:0,
      sinMasParadas:null,siguenIgual:null,pct:null,diferencia:null,nivel:'gris',
      ritmoNecesario:null,ritmoActual:ratios?ratios.ratioEfectivo:null,rendimiento:ratios?ratios.ratioTurno:null,
      horaEstimadaMs:null,minAdicionales:0,detenida:!!(datos&&datos.detenida),
      segunRegistradoMs:(datos&&datos.ultimoRegistroMs)||0,ahora};
    if(!t||!t.ok||!t.enCurso||!t.finTurnoMs||prog<=0)return sal;
    const desdeInicioMin=(ahora-num(t.inicioMs))/MS_MIN;
    if(!(desdeInicioMin>=u.minCalculoMin)){sal.estado='CALCULANDO';sal.minDesdeInicio=Math.max(0,desdeInicioMin);return sal;}

    const restanteBruto=Math.max(0,(t.finTurnoMs-ahora)/MS_MIN);
    const tomado=(t.detalle||[]).some(d=>norm(d.motivo)==='refrigerio');
    const std=estandar('Refrigerio');
    const pausaPend=(!tomado&&std>0&&restanteBruto>std)?std:0;     // el refrigerio aún no tomado se descuenta
    const restante=Math.max(0,restanteBruto-pausaPend);
    const rH=restante/60;
    sal.restanteMin=restante;sal.pausaPendienteMin=pausaPend;

    const ratio=ratios&&ratios.ratioEfectivo!=null?ratios.ratioEfectivo:null;     // oficial
    const rend=ratios&&ratios.ratioTurno!=null?ratios.ratioTurno:null;            // rendimiento del turno
    if(ratio!==null)sal.sinMasParadas=prod+ratio*rH;
    if(rend===null){sal.estado='SIN_RITMO';return sal;}
    sal.siguenIgual=prod+rend*rH;
    sal.estado='OK';
    sal.pct=sal.siguenIgual/prog*100;
    sal.diferencia=sal.siguenIgual-prog;                                           // + sobrarían / − faltarían
    sal.nivel=sal.pct>=u.verdePct?'verde':sal.pct>=u.ambarPct?'ambar':'roja';
    sal.ritmoNecesario=prod>=prog?0:(rH>0?(prog-prod)/rH:null);
    if(prod>=prog){sal.horaEstimadaMs=null;sal.cumplido=true;}
    else if(rend>0){
      const minNecesarios=(prog-prod)/rend*60+pausaPend;
      sal.horaEstimadaMs=ahora+minNecesarios*MS_MIN;
      sal.minAdicionales=Math.max(0,(sal.horaEstimadaMs-t.finTurnoMs)/MS_MIN);
    }
    return sal;
  }

  window.calcularTiemposLinea=calcularTiemposLinea;
  window.calcularRatiosLinea=calcularRatiosLinea;
  window.proyectarCierreLinea=proyectarCierreLinea;
  window.UMBRALES_PROYECCION_LINEA=UMBRALES_PROYECCION;
  window.evaluarDesempenoLinea=evaluarDesempenoLinea;
  window.UMBRALES_DESEMPENO_LINEA=UMBRALES;
  /* Paradas editables de una presentación (registros + históricos ya
     reconstruidos como intervalos). Se usa en "Corregir finalización". */
  window.paradasEditablesItem=function(p){
    const op=p.estadoOperacion||{};
    const cierreOp=num(op.finalizadaEn)||num(op.canceladaEn)||ahoraServidor();
    const r=registrosItem(p,cierreOp);
    const salida=r.lista.map(x=>({id:x.id||`reg:${x.inicio}`,legado:false,tipo:x.tipo,motivo:x.motivo,
      clasificacion:x.clasif,estandarMin:x.estandarMin,inicio:x.inicio,fin:x.fin}));
    r.legado.forEach((x,i)=>{
      if(x.fin<=x.inicio)return;
      salida.push({id:`legado:${x.tipo}:${x.inicio}:${i}`,legado:true,tipo:x.tipo,
        motivo:x.tipo==='PAUSA'?'Pausa programada':(op.motivo||'Detención de línea'),
        clasificacion:x.clasif,estandarMin:0,inicio:x.inicio,fin:x.fin});
    });
    return salida.sort((a,b)=>a.inicio-b.inicio);
  };
  window.paradasBotonLinea=function(linea,fecha,turno){
    const out=[];
    itemsBloque(linea,fecha,turno).forEach(p=>(p.estadoOperacion?.paradas||[]).forEach(r=>out.push({...r,presentacionClave:p.clave})));
    return out;
  };
  window.__tiemposLineaInternos={unir,medir,interseccion,restar,rangoTurno};
})();
