/* =============================================================
   PLANIFICACIÓN · «VER OPCIONES PARA COMPLETAR» (etapa 4)

   Cuando una línea «No cabe» en su bloque, propone alternativas REVISABLES para el saldo que no cabe. Nunca reprograma sola ni toca prioridades
   comerciales: «Revisar y aplicar» abre el diálogo de traslado (65), que relee todo y pide el motivo antes de escribir.
     · Se traslada CANTIDAD DE UN PRODUCTO (UND enteras), no «horas sobrantes»: cada producto tiene otra velocidad y el destino puede necesitar otros cambios.
     · Cantidad propuesta = lo que hace falta sacar del origen (exceso ÷ velocidad), limitada por lo que CABE en el destino considerando la preparación
       adicional que genere (se busca por tanteo la mayor cantidad entera que deja el destino en «Cabe»: el redondeo nunca excede la capacidad).
     · Solo se traslada el saldo comprobado (programado − producido oficial); un bloque iniciado usa su CAPACIDAD RESTANTE y, si no hay registro de producción,
       no se propone nada (se explica por qué).
     · No se propone otra línea: el catálogo no tiene una compatibilidad de producto validada entre líneas.
     · Cambiar el orden solo se sugiere (informativo) si no hay secuencia definida en Paletas y reduce los tiempos de cambio.
   Toda sugerencia se basa en la velocidad estándar (nominal): se identifica como ESTIMADA y no garantiza el cumplimiento de una fecha.
   Cargar después de 65-planificacion-capacidad.js.
   ============================================================= */
(function(){
  'use strict';
  const NS=window.glacialPlanificacion,M=NS.motor;
  const {num,esc,fechaOk,addDias,ahoraMs}=NS.util;
  const fmt=n=>num(n).toLocaleString('es-PE');
  const hm=min=>NS.textoDuracion(min);
  const DIAS_ADELANTE=7;
  const finBloque=(fecha,bloque)=>NS.inicioBloqueMs(fecha,bloque)+NS.duracionBloqueMin(bloque)*60000;
  const nombreBloque=b=>b==='NOCHE'?'Noche':'Mañana + Intermedio';

  /* Un bloque sin programación se considera comprobado en cero SOLO si todavía no empezó (antes del inicio no se pudo producir nada). */
  const saldoAntesDeIniciar=NS.saldoDe;
  NS.saldoDe=function(item){
    const r=saldoAntesDeIniciar(item);
    if(r&&r.error&&/no hay registro de producción/i.test(r.error)&&NS.inicioBloqueMs(item.fecha,item.turno)>ahoraMs()){
      const programado=num(r.programado);
      return {programado,producido:0,saldo:programado,max:Math.min(programado,num(item.cantidadProgramada)),antesDeIniciar:true};
    }
    return r;
  };

  /* Filas reales (de la nube) de un producto en un bloque y línea: la de mayor cantidad es la que se puede reducir en un traslado. */
  const filaDeProducto=(fecha,bloque,linea,marca,pres)=>NS.items(fecha,bloque).filter(p=>p.linea===linea&&p.marca===marca&&p.presentacion===pres&&NS.estadoDe(p)!=='CANCELADA')
    .sort((a,b)=>num(b.cantidadProgramada)-num(a.cantidadProgramada))[0]||null;

  /* Tiempo disponible de un bloque vacío (para ubicar destinos): duración − unión de ventanas (o respaldo general). */
  function disponibleBloque(fecha,bloque,linea,tp){
    const b=NS.bloqueDe(fecha,bloque);
    if(!(b.duracionMin>0))return null;
    const vt=M.ventanasDe(tp,linea,fecha,bloque,b);
    if(vt.lista.length)return b.duracionMin-vt.unionMin;
    const g=bloque==='NOCHE'?tp.legacy.fijoNocheMin:tp.legacy.fijoDiaMin;
    return b.duracionMin-(g||0);
  }
  /* Mayor cantidad entera q en [0, tope] que deja el DESTINO en «Cabe» (o «Cabe, ajustado»); 0 si ni la primera unidad cabe. */
  function maxQueCabe(item,destFecha,destBloque,tope){
    const ok=q=>{const d=NS.simularTraslado(item,destFecha,destBloque,q).destino.despues;return d.estado==='CABE'||d.estado==='JUSTO';};
    if(tope<1||!ok(1))return 0;
    if(ok(tope))return tope;
    let lo=1,hi=tope;                        // ok(lo) cierto, ok(hi) falso
    while(hi-lo>1){const mid=Math.floor((lo+hi)/2);if(ok(mid))lo=mid;else hi=mid;}
    return lo;
  }

  /* =========================================================
     MOTOR DE OPCIONES (sin pantalla)
     ========================================================= */
  /* Devuelve {ok, motivo?, linea, excesoMin, base, productos[], producto, opciones[], orden, limitaciones[], calculadoEn}. productoClave = 'marca|presentacion'. */
  NS.opcionesCompletar=function(fecha,turno,linea,productoClave){
    const bloque=NS.valorBloque(turno),ahora=ahoraMs(),tp=NS.tiemposDatos();
    const res={ok:false,fecha,bloque,linea,calculadoEn:ahora,limitaciones:['Estimación con la velocidad estándar (nominal): no garantiza el cumplimiento de una fecha.',
      'No se propone otra línea: no hay compatibilidad de producto entre líneas validada en el catálogo.'],opciones:[],productos:[],orden:null,descartadas:[]};
    const ev=NS.evaluar(fecha,bloque,linea);
    if(!ev)return Object.assign(res,{motivo:'Esta línea no tiene programación en el bloque.'});
    const vig=ev.vigente,rest=NS.capacidadRestante(fecha,bloque,linea);
    // base del exceso: capacidad restante si el bloque ya inició; si no, la del plan
    let excesoMin=0,base='plan';
    if(rest&&rest.aplica){
      if(rest.estado==='SIN_DATOS'||rest.estado==='INCOMPLETA')return Object.assign(res,{motivo:'El bloque ya inició y no se puede calcular la capacidad restante: '+rest.motivo+' No se propone ni se aplica ninguna reprogramación automática.',base:'restante',restante:rest});
      base='restante';excesoMin=rest.estado==='EXCESO'?-rest.holguraMin:0;
    }else{
      if(vig.estado==='INCOMPLETA')return Object.assign(res,{motivo:'La estimación está incompleta (falta '+vig.faltantes.map(f=>f.dato).join('; ')+'): no se puede calcular cuánto excede.'});
      if(vig.estado!=='EXCESO')return Object.assign(res,{motivo:'La línea cabe en este bloque: no hay nada que completar.'});
      excesoMin=Math.max(1,-vig.holguraMin>0?-vig.holguraMin:((vig.colocacion&&vig.colocacion.excedeMin)||60));
    }
    if(!(excesoMin>0))return Object.assign(res,{motivo:'La línea cabe en este bloque (capacidad '+(base==='restante'?'restante':'del plan')+'): no hay nada que completar.',base});
    excesoMin=Math.round(excesoMin*1e6)/1e6;
    res.base=base;res.excesoMin=excesoMin;res.motivoExceso=vig.motivoExceso||'';
    // productos con saldo comprobado
    const rs=NS.resumenBloque(fecha,bloque);
    const productos=[];
    vig.productos.forEach(p=>{
      const fila=filaDeProducto(fecha,bloque,linea,p.marca,p.presentacion);
      if(!fila)return;
      const s=NS.saldoDe(fila),g=rs.grupos.get([linea,p.marca,p.presentacion].join('|'));
      const orig=NS.originalDe(fecha,bloque,linea,p.marca,p.presentacion);
      productos.push({clave:p.marca+'|'+p.presentacion,marca:p.marca,presentacion:p.presentacion,etiqueta:p.etiqueta||NS.etiquetaPresentacion(linea,p.marca,p.presentacion),vel:p.vel,
        programado:g?g.programado:num(fila.cantidadProgramada),producido:g&&g.producido!==null?g.producido:null,pendiente:g&&g.pendiente!==null?g.pendiente:null,
        original:orig,prioridad:null,saldo:s.error?0:s.saldo,max:s.error?0:s.max,error:s.error||'',fila});
    });
    res.productos=productos;
    const elegido=productos.find(p=>p.clave===productoClave)||productos.filter(p=>p.max>0&&p.vel>0).sort((a,b)=>b.max-a.max)[0]||productos[0];
    res.producto=elegido||null;
    res.ok=true;
    if(!elegido||!(elegido.max>0)||!(elegido.vel>0)){
      res.limitaciones.push(!elegido?'Sin productos.':elegido.error||'Este producto no tiene saldo para trasladar o le falta la velocidad estándar.');
      res.sinTraslado=true;
    }else{
      const need=Math.min(elegido.max,Math.ceil(Math.round(excesoMin*elegido.vel/60*1e6)/1e6));
      const item=elegido.fila,cands=[];
      const tpD=tp;
      for(let d=0;d<=DIAS_ADELANTE;d++){
        const f=addDias(fecha,d);
        ['DÍA','NOCHE'].forEach(b=>{
          if(f===fecha&&b===bloque)return;
          if(ahora>=finBloque(f,b))return;                                             // bloque que ya terminó
          if(f===fecha&&b==='DÍA'&&bloque==='NOCHE')return;                            // el Día de la misma fecha operativa es anterior a la Noche
          const destFila=NS.existente(linea,f,b,elegido.marca,elegido.presentacion);
          if(destFila&&['FINALIZADA'].includes(NS.estadoDe(destFila))){res.descartadas.push({fecha:f,bloque:b,motivo:'El producto ya está finalizado en ese bloque: no se reabre producción.'});return;}
          if(destFila&&NS.estadoDe(destFila)==='CANCELADA'&&num(destFila.cantidadProgramada)>0){res.descartadas.push({fecha:f,bloque:b,motivo:'El producto está cancelado en ese bloque.'});return;}
          const capD=NS.capacidadVigente(f,b,linea);
          if(capD&&capD.estado==='INCOMPLETA'){res.descartadas.push({fecha:f,bloque:b,motivo:'Su capacidad es una estimación incompleta ('+capD.faltantes.map(x=>x.dato).join('; ')+'): no se puede ubicar el saldo con fiabilidad.'});return;}
          if(capD&&capD.estado==='EXCESO'){res.descartadas.push({fecha:f,bloque:b,motivo:'Ese bloque ya no cabe con su propio plan.'});return;}
          const libre=capD?capD.holguraMin:disponibleBloque(f,b,linea,tpD);
          if(libre===null||libre<=0){res.descartadas.push({fecha:f,bloque:b,motivo:'No tiene tiempo libre.'});return;}
          const q=maxQueCabe(item,f,b,need);
          if(q<1){res.descartadas.push({fecha:f,bloque:b,motivo:'No cabe ni la primera unidad contando la preparación adicional.'});return;}
          cands.push({fecha:f,bloque:b,q,libre,destFila});
        });
      }
      const tipoDe=c=>c.fecha===fecha&&c.bloque==='NOCHE'?'NOCHE':c.fecha===fecha?'BLOQUE':'FECHA';
      cands.forEach(c=>{
        const sim=NS.simularTraslado(item,c.fecha,c.bloque,c.q);
        const advertencias=['Estimación con la velocidad estándar (nominal); no garantiza cumplir la fecha.'];
        const parcial=c.q<need;
        if(parcial)advertencias.push('En este destino solo caben '+fmt(c.q)+' UND de las '+fmt(need)+' que hacen falta: en el origen quedaría un exceso de '+hm(Math.max(0,-sim.origen.despues.holguraMin))+' (base: '+(base==='restante'?'capacidad restante':'plan')+').');
        if(sim.destino.despues.estado==='JUSTO')advertencias.push('El destino quedaría muy ajustado (carga ≥ 95 %).');
        if(c.destFila&&num(c.destFila.cantidadProgramada)>0)advertencias.push('El destino ya tiene '+fmt(c.destFila.cantidadProgramada)+' UND de este producto: quedarían '+fmt(num(c.destFila.cantidadProgramada)+c.q)+' UND.');
        if(base==='restante')advertencias.push('El origen usa capacidad restante calculada a las '+new Date(ahora).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false})+'.');
        const prepAd=Math.max(0,Math.round((sim.destino.despues.requeridoMin-sim.destino.antes.requeridoMin-c.q/elegido.vel*60)*10)/10);
        res.opciones.push({id:c.fecha+'|'+c.bloque,tipo:tipoDe(c),etiqueta:tipoDe(c)==='NOCHE'?'Completar en Noche':tipoDe(c)==='FECHA'?'Completar en otra fecha':'Usar otro bloque disponible de la misma línea',
          destFecha:c.fecha,destBloque:c.bloque,cantidad:c.q,cantidadNecesaria:need,quedaOrigen:num(item.cantidadProgramada)-c.q,prepAdicionalMin:prepAd,capacidad:sim,parcial,
          completo:!parcial,advertencias,estimada:true,destVersion:num(c.destFila&&c.destFila.version),destCantidadActual:num(c.destFila&&c.destFila.cantidadProgramada),clave:item.clave,
          motivo:'Excede el tiempo '+(base==='restante'?'restante':'disponible')+' del bloque en '+hm(excesoMin)+'.'});
      });
      // orden: primero lo que completa todo, luego el más cercano
      res.opciones.sort((a,b)=>(b.completo?1:0)-(a.completo?1:0)||(a.tipo==='NOCHE'?0:1)-(b.tipo==='NOCHE'?0:1)||a.destFecha.localeCompare(b.destFecha)||(a.destBloque==='DÍA'?0:1)-(b.destBloque==='DÍA'?0:1));
      const todas=res.opciones,mismaNoche=todas.find(o=>o.tipo==='NOCHE');
      res.opciones=todas.slice(0,6);
      if(mismaNoche&&!res.opciones.includes(mismaNoche))res.opciones[5]=mismaNoche;       // «Completar en Noche» siempre se muestra, aunque solo quepa una parte
    }
    // cambio de orden: solo si no hay secuencia definida y reduce los tiempos de cambio
    res.orden=sugerirOrden(fecha,bloque,linea,tp);
    return res;
  };

  NS.sugerirOrden=(fecha,turno,linea)=>sugerirOrden(fecha,NS.valorBloque(turno),linea,NS.tiemposDatos());
  /* Orden de productos que minimiza los minutos de cambio (solo si no hay tramos definidos en Paletas y se conocen todos los tiempos). */
  function sugerirOrden(fecha,bloque,linea,tp){
    const tramos=NS.tramosDe(fecha,bloque,linea);
    if(tramos.length)return {aplica:false,motivo:'La secuencia ya está definida en Paletas (con horas o cantidades): no se propone cambiarla.'};
    const prods=M.agrupar(NS.entradaMotor(fecha,bloque,linea).filas,(m,p)=>NS.etiquetaPresentacion(linea,m,p));
    if(prods.length<3)return {aplica:false,motivo:'Con menos de tres productos, cambiar el orden no reduce los cambios.'};
    if(prods.length>6)return {aplica:false,motivo:'Hay más de seis productos: el orden se define en Paletas.'};
    const coste=(a,b)=>{const c=M.resolverCambio(tp,linea,a,b);return c.minutos;};
    const total=orden=>{let t=0;for(let i=1;i<orden.length;i++){const c=coste(orden[i-1],orden[i]);if(c===null)return null;t+=c;}return t;};
    const actual=total(prods);
    if(actual===null)return {aplica:false,motivo:'Faltan tiempos de cambio para comparar órdenes.'};
    let mejor=null;
    const perm=(arr,acc)=>{if(!arr.length){const t=total(acc);if(t!==null&&(!mejor||t<mejor.t))mejor={t,orden:acc.slice()};return;}arr.forEach((x,i)=>perm(arr.filter((_,j)=>j!==i),acc.concat([x])));};
    perm(prods,[]);
    if(!mejor||actual-mejor.t<1)return {aplica:false,motivo:'El orden actual ya tiene los menores tiempos de cambio.'};
    return {aplica:true,actualMin:actual,propuestoMin:mejor.t,ahorroMin:actual-mejor.t,orden:mejor.orden.map(p=>p.marca+' '+p.etiqueta),
      nota:'Sugerencia informativa: el orden de producción se define en Paletas (Agregar a secuencia). No cambia la cantidad ni las prioridades comerciales; compara solo los tiempos de cambio.'};
  }

  /* =========================================================
     DIÁLOGO
     ========================================================= */
  function htmlCap(c,tit){
    const e=({CABE:'cabe',JUSTO:'cabe, ajustado',EXCESO:'no cabe',INCOMPLETA:'estimación incompleta',SIN_PROG:'sin programación'})[c.estado]||c.estado;
    return tit+': <b>'+esc(e)+'</b>'+(c.estado==='SIN_PROG'||c.estado==='INCOMPLETA'?'':' · '+hm(c.requeridoMin)+' / '+hm(c.disponibleMin));
  }
  function pintarOpciones(fondo,fecha,turno,linea,claveProd){
    const r=NS.opcionesCompletar(fecha,turno,linea,claveProd);
    const cont=fondo.querySelector('#op-cuerpo');
    let h='<p class="plan-nota">Cálculo hecho a las '+new Date(r.calculadoEn).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false})+' con los datos actuales.</p>';
    if(!r.ok){
      h+='<div class="plan-aviso" style="font-weight:700">'+esc(r.motivo)+'</div>';
    }else{
      h+='<div class="plan-aviso" style="font-weight:700;color:#86198F">Exceso: '+hm(r.excesoMin)+' ('+(r.base==='restante'?'sobre la capacidad restante':'sobre el plan del bloque')+'). '+esc(r.motivoExceso||'')+'</div>';
      h+='<label style="font-size:12px;font-weight:700;color:#5a6b78;display:block;margin:8px 0 2px">Producto a trasladar</label><select id="op-prod">'+r.productos.map(p=>'<option value="'+esc(p.clave)+'"'+(r.producto&&p.clave===r.producto.clave?' selected':'')+'>'+esc(p.marca)+' '+esc(p.etiqueta)+' — saldo '+fmt(p.saldo)+' UND</option>').join('')+'</select>';
      if(r.producto){
        const p=r.producto;
        h+='<div class="plan-scroll" style="margin-top:8px"><table class="plan-tabla"><tbody>'+
          '<tr><td>Prioridad</td><td>'+(p.prioridad||'<span class="plan-nota">No registrada en el sistema (por confirmar)</span>')+'</td></tr>'+
          '<tr><td>Compromiso original</td><td>'+(p.original===null?'<span class="plan-nota">sin reprogramación registrada (vale el plan vigente)</span>':fmt(p.original)+' UND')+'</td></tr>'+
          '<tr><td>Programado vigente</td><td>'+fmt(p.programado)+' UND</td></tr><tr><td>Producido (oficial)</td><td>'+(p.producido===null?'sin registro':fmt(p.producido)+' UND')+'</td></tr>'+
          '<tr><td>Cantidad pendiente</td><td><b>'+fmt(p.saldo)+' UND</b>'+(p.error?' <span class="plan-error" style="display:inline">'+esc(p.error)+'</span>':'')+'</td></tr></tbody></table></div>';
      }
      if(r.sinTraslado)h+='<div class="plan-aviso">'+esc(r.limitaciones[r.limitaciones.length-1])+'</div>';
      else if(!r.opciones.length)h+='<div class="plan-aviso" style="font-weight:700">No hay un bloque de la misma línea con tiempo libre suficiente en los próximos '+DIAS_ADELANTE+' días para este producto.</div>';
      r.opciones.forEach((o,i)=>{
        h+='<div class="plan-seq" style="margin-top:10px"><h5>'+(i+1)+'. '+esc(o.etiqueta)+' <small>· '+esc(o.destFecha)+' · '+esc(nombreBloque(o.destBloque))+(o.parcial?' · parcial':' · completa el exceso')+'</small></h5>'+
          '<div class="plan-scroll"><table class="plan-tabla"><tbody>'+
          '<tr><td>Cantidad propuesta para el destino</td><td><b>'+fmt(o.cantidad)+' UND</b> <small>(hacen falta '+fmt(o.cantidadNecesaria)+')</small></td></tr>'+
          '<tr><td>Cantidad que puede quedar en origen</td><td>'+fmt(o.quedaOrigen)+' UND</td></tr>'+
          '<tr><td>Preparación adicional necesaria</td><td>'+hm(o.prepAdicionalMin)+'</td></tr>'+
          '<tr><td>Capacidad · origen</td><td>'+htmlCap(o.capacidad.origen.antes,'antes')+' → '+htmlCap(o.capacidad.origen.despues,'después')+'</td></tr>'+
          '<tr><td>Capacidad · destino</td><td>'+htmlCap(o.capacidad.destino.antes,'antes')+' → '+htmlCap(o.capacidad.destino.despues,'después')+'</td></tr>'+
          '<tr><td>Motivo</td><td>'+esc(o.motivo)+'</td></tr></tbody></table></div>'+
          '<p class="plan-nota" style="color:#7A5200">'+o.advertencias.map(esc).join('<br>')+'</p>'+
          '<button type="button" class="btn btn-primary btn-sm" data-op-aplicar="'+i+'">Revisar y aplicar…</button></div>';
      });
      if(r.orden){
        h+='<div class="plan-seq" style="margin-top:10px"><h5>Cambiar el orden de producción</h5>'+(r.orden.aplica?'<p>Orden sugerido: <b>'+r.orden.orden.map(esc).join(' → ')+'</b><br>Tiempo de cambios: '+hm(r.orden.actualMin)+' → '+hm(r.orden.propuestoMin)+' (ahorro '+hm(r.orden.ahorroMin)+').</p><p class="plan-nota">'+esc(r.orden.nota)+'</p>':'<p class="plan-nota">'+esc(r.orden.motivo)+'</p>')+'</div>';
      }
      if(r.descartadas.length)h+='<details style="margin-top:10px"><summary class="plan-nota" style="cursor:pointer">Destinos descartados ('+r.descartadas.length+')</summary><ul class="plan-nota">'+r.descartadas.slice(0,12).map(d=>'<li>'+esc(d.fecha)+' · '+esc(nombreBloque(d.bloque))+': '+esc(d.motivo)+'</li>').join('')+'</ul></details>';
      h+='<p class="plan-nota">'+r.limitaciones.map(esc).join('<br>')+'</p>';
    }
    cont.innerHTML=h;
    cont._r=r;
  }
  NS.abrirOpciones=function(fecha,turno,linea){
    if(!NS.puede())return;
    const fondo=NS.abrirDialogo('<h3>Opciones para completar · '+esc(NS.nombreLinea(linea))+'</h3><p class="plan-nota">'+esc(fecha)+' · '+esc(NS.etiquetaBloqueConHorario(turno))+'. Son propuestas para revisar: nada se aplica sin tu confirmación.</p><div id="op-cuerpo"></div>'+
      '<div class="plan-acciones"><button type="button" class="btn btn-ghost" id="op-actualizar">Actualizar propuesta</button><button type="button" class="btn btn-primary" id="op-cerrar">Cerrar</button></div>',true);
    const refrescar=()=>pintarOpciones(fondo,fecha,turno,linea,(fondo.querySelector('#op-prod')||{}).value);
    refrescar();
    fondo.addEventListener('change',e=>{if(e.target&&e.target.id==='op-prod')refrescar();});
    fondo.querySelector('#op-actualizar').onclick=refrescar;
    fondo.querySelector('#op-cerrar').onclick=()=>fondo.remove();
    fondo.addEventListener('click',e=>{
      const b=e.target.closest&&e.target.closest('[data-op-aplicar]');
      if(!b)return;
      const r=fondo.querySelector('#op-cuerpo')._r,o=r&&r.opciones[Number(b.getAttribute('data-op-aplicar'))];
      if(!o)return;
      fondo.remove();
      NS.abrirTraslado(o.clave,{destFecha:o.destFecha,destTurno:o.destBloque,cantidad:o.cantidad,destVersion:o.destVersion,
        motivo:'Completar en '+(o.destBloque==='NOCHE'?'Noche':'Mañana + Intermedio')+' del '+o.destFecha+': el bloque no cabe en '+NS.nombreLinea(linea)+'.'});
    });
  };
})();
