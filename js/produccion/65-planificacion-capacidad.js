/* =============================================================
   PLANIFICACIÓN · CAPACIDAD, SECUENCIA Y TRASLADO DE SALDO (etapa 3)

   CAPACIDAD (por línea y bloque; las UND de líneas distintas NUNCA se suman para medir capacidad):
     tiempo de producción = Σ (UND programadas ÷ velocidad estándar del producto)         ← tabla única de velocidades (sync/configIndicadores)
     tiempo de cambios    = (n.º de cambios de producto) × minutos por cambio de marca/formato   ← configurado en Catálogo
     tiempo disponible    = duración del bloque (configuración de bloques) − paradas previstas del bloque (configurado en Catálogo)
   Cada tiempo se cuenta UNA sola vez: las paradas previstas solo RESTAN del disponible y los cambios solo SUMAN al requerido.
   Si a un producto le falta la velocidad estándar o el bloque no tiene duración, el resultado es «Estimación incompleta» y se dice qué falta
   (no se inventa un valor). Si no hay tiempos de cambio/paradas configurados, se calcula solo con producción y se avisa.
   Es una ESTIMACIÓN de referencia: no mide eficiencia real ni sustituye las paradas oficiales de Avance/Cierre.

   SECUENCIA: usa los tramos que ya existen (tramosSecuencia de cada programación). Un producto puede tener varios tramos
   (SCALA → BELLS → SCALA) SIN duplicar su cantidad: el producto reparte entre sus tramos solo lo programado.

   TRASLADO DE SALDO: mueve a otro bloque lo que falta producir (programado − producido OFICIAL) en UNA transacción: baja el origen, sube el
   destino, deja el historial (origen y destino) y conserva el total. Con el compromiso original (64) el origen no oculta lo incumplido.
   Cargar después de 64-planificacion-avance.js.
   ============================================================= */
(function(){
  'use strict';
  const NS=window.glacialPlanificacion;
  const {num,esc,fechaOk,addDias,ahoraMs}=NS.util;
  const fmt=n=>num(n).toLocaleString('es-PE');

  /* ---------- tiempos y velocidades ---------- */
  const velDe=(l,p,m)=>typeof window.glacialVelocidadEstandar==='function'?num(window.glacialVelocidadEstandar(l,p,m)):0;
  NS.velocidadDe=velDe;
  NS.duracionBloqueMin=turno=>{
    const m=/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/.exec(NS.horarioBloque(turno)||'');
    if(!m)return 0;
    const a=Number(m[1])*60+Number(m[2]),b=Number(m[3])*60+Number(m[4]);
    return ((b-a)+1440)%1440||0;                 // Noche cruza la medianoche (21:00–07:00 = 10 h)
  };
  /* Tiempos previstos configurados (Catálogo): {cambioMin, paradasMin|null}. */
  NS.tiemposDe=turno=>{
    const t=typeof NS.tiemposPlan==='function'?NS.tiemposPlan():{};
    const cambio=Number.isFinite(Number(t.cambioMin))&&t.cambioMin!==null&&t.cambioMin!==''?Number(t.cambioMin):null;
    const k=NS.valorBloque(turno)==='NOCHE'?'fijoNocheMin':'fijoDiaMin';
    const par=Number.isFinite(Number(t[k]))&&t[k]!==null&&t[k]!==''?Number(t[k]):null;
    return {cambioMin:cambio,paradasMin:par};
  };
  const hm=min=>{const s=min<0?'-':'',a=Math.round(Math.abs(min));return s+Math.floor(a/60)+' h '+String(a%60).padStart(2,'0')+' min';};
  NS.textoDuracion=hm;
  const hhmm=ms=>new Date(ms).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false});
  const horaAMs=(fecha,hora,bloque)=>{
    if(!/^\d{1,2}:\d{2}$/.test(String(hora||''))||!fechaOk(fecha))return 0;
    const d=new Date(fecha+'T'+String(hora).padStart(5,'0')+':00');
    if(bloque==='NOCHE'&&Number(String(hora).slice(0,2))<12)d.setDate(d.getDate()+1);
    return d.getTime();
  };

  /* ---------- secuencia (tramos existentes) ---------- */
  const filasBloque=(fecha,turno)=>NS.items(fecha,turno).filter(p=>NS.estadoDe(p)!=='CANCELADA');
  /* Tramos del bloque y línea, ordenados. Cada tramo conoce su producto. */
  NS.tramosDe=(fecha,turno,linea)=>{
    const salida=[];
    filasBloque(fecha,turno).forEach(p=>{
      if(p.linea!==linea)return;
      (Array.isArray(p.tramosSecuencia)?p.tramosSecuencia:[]).forEach(t=>salida.push(Object.assign({},t,{marca:p.marca,presentacion:p.presentacion,clave:p.clave})));
    });
    return salida.sort((a,b)=>num(a.orden)-num(b.orden)||num(a.creadoEn)-num(b.creadoEn));
  };
  const productosDe=(fecha,turno,linea)=>{
    const m=new Map();
    filasBloque(fecha,turno).forEach(p=>{
      if(p.linea!==linea)return;
      const k=p.marca+'|'+p.presentacion,o=m.get(k)||{marca:p.marca,presentacion:p.presentacion,cantidad:0};
      o.cantidad+=num(p.cantidadProgramada);m.set(k,o);
    });
    return [...m.values()];
  };

  /* ---------- capacidad de una línea en un bloque ---------- */
  /* estado: CABE | JUSTO (carga ≥ 95 %) | EXCESO | INCOMPLETA. Devuelve null si la línea no tiene programación en el bloque. */
  NS.capacidadLinea=function(fecha,turno,linea){
    const prods=productosDe(fecha,turno,linea).filter(p=>p.cantidad>0);
    if(!prods.length)return null;
    const bloque=NS.valorBloque(turno),duracion=NS.duracionBloqueMin(turno),t=NS.tiemposDe(turno);
    const faltantes=[],detalle=[];let prodMin=0;
    prods.forEach(p=>{
      const v=velDe(linea,p.presentacion,p.marca);
      if(!(v>0)){faltantes.push({marca:p.marca,presentacion:p.presentacion,dato:'velocidad estándar'});detalle.push(Object.assign({},p,{vel:0,min:null}));return;}
      const min=p.cantidad/v*60;prodMin+=min;detalle.push(Object.assign({},p,{vel:v,min}));
    });
    if(!(duracion>0))faltantes.push({marca:'',presentacion:'',dato:'duración del bloque'});
    const tramos=NS.tramosDe(fecha,turno,linea);
    let cambios=Math.max(0,prods.length-1);
    if(tramos.length>1){cambios=0;for(let i=1;i<tramos.length;i++)if(tramos[i].clave!==tramos[i-1].clave)cambios++;}
    const notas=[];
    if(t.cambioMin===null||t.paradasMin===null)notas.push('Faltan tiempos previstos de cambio de marca/formato o de paradas (Catálogo → Tiempos previstos): la comparación usa solo el tiempo de producción'+(t.cambioMin===null?'':' y los cambios')+'.');
    const cambiosMin=cambios*(t.cambioMin||0),paradasMin=t.paradasMin||0;
    const disponible=duracion-paradasMin,requerido=prodMin+cambiosMin;
    const r={fecha,bloque,linea,productos:detalle,faltantes,notas,duracionMin:duracion,paradasMin,cambios,cambiosMin,produccionMin:prodMin,requeridoMin:requerido,
      disponibleMin:disponible,holguraMin:disponible-requerido,cargaPct:null,estado:'INCOMPLETA',parcial:t.cambioMin===null||t.paradasMin===null,secuencia:tramos.length>0};
    if(faltantes.length||!(disponible>0))return r;
    r.cargaPct=requerido/disponible*100;
    r.estado=requerido>disponible?'EXCESO':r.cargaPct>=95?'JUSTO':'CABE';
    return r;
  };
  NS.cargaCelda=(fecha,bloque,linea)=>{const c=NS.capacidadLinea(fecha,bloque,linea);return c&&c.estado!=='INCOMPLETA'?{pct:c.cargaPct,estado:c.estado}:null;};

  /* ---------- secuencia con horas estimadas ---------- */
  /* Inicio y fin estimados de cada tramo. Cada producto reparte SOLO lo programado entre sus tramos (no se duplica):
     un tramo «hasta una hora» produce lo que cabe hasta esa hora; el último tramo del producto (cantidad o cierre) toma lo que le falta. */
  NS.secuenciaLinea=function(fecha,turno,linea){
    const tramos=NS.tramosDe(fecha,turno,linea);
    if(!tramos.length)return null;
    const bloque=NS.valorBloque(turno),t=NS.tiemposDe(turno);
    const inicio=NS.inicioBloqueMs(fecha,bloque),finBloque=inicio+NS.duracionBloqueMin(turno)*60000;
    const rest=new Map(),ultimo=new Map(),avisos=[];
    productosDe(fecha,turno,linea).forEach(p=>rest.set(p.marca+'|'+p.presentacion,p.cantidad));
    tramos.forEach((x,i)=>ultimo.set(x.marca+'|'+x.presentacion,i));
    let cursor=inicio,previo=null,incompleta=!inicio;
    const sal=[];
    tramos.forEach((x,i)=>{
      const k=x.marca+'|'+x.presentacion,v=velDe(linea,x.presentacion,x.marca);
      const fila={orden:x.orden,marca:x.marca,presentacion:x.presentacion,tipoFin:x.tipoFin,horaFin:x.horaFin,inicioMs:null,finMs:null,qty:null,estimado:false};
      if(!inicio||!(v>0)||incompleta){incompleta=true;fila.motivo=!(v>0)?'falta la velocidad estándar de este producto':'sin inicio de bloque';sal.push(fila);return;}
      if(previo!==null&&previo!==k&&t.cambioMin)cursor+=t.cambioMin*60000;      // cambio de marca/formato entre tramos distintos
      previo=k;
      fila.inicioMs=cursor;
      const queda=rest.get(k)||0;
      let fin,qty;
      if(x.tipoFin==='HORA'){
        fin=horaAMs(fecha,x.horaFin,bloque);
        if(!fin||fin<cursor){avisos.push('El tramo '+x.orden+' termina a una hora anterior al fin del tramo previo.');fin=cursor;}
        qty=Math.min(queda,v*(fin-cursor)/3600000);
      }else{
        if(i!==ultimo.get(k))avisos.push('El producto '+x.marca+' tiene varios tramos con «fin por cantidad o cierre»: su cantidad no se duplica; este tramo toma lo que le falta.');
        qty=queda;fin=cursor+qty/v*3600000;
      }
      rest.set(k,Math.max(0,queda-qty));
      fila.finMs=fin;fila.qty=qty;fila.estimado=true;cursor=Math.max(cursor,fin);sal.push(fila);
    });
    const sinTramo=[];rest.forEach((q,k)=>{if(q>0.5&&!tramos.some(x=>x.marca+'|'+x.presentacion===k)){const [m,p]=k.split('|');sinTramo.push({marca:m,presentacion:p,cantidad:q});}});
    const quedan=[];rest.forEach((q,k)=>{if(q>0.5&&tramos.some(x=>x.marca+'|'+x.presentacion===k)){const [m,p]=k.split('|');quedan.push({marca:m,presentacion:p,cantidad:Math.round(q)});}});
    if(!incompleta&&cursor>finBloque)avisos.push('La secuencia estimada termina '+hm((cursor-finBloque)/60000)+' después del fin del bloque.');
    return {tramos:sal,incompleta,avisos,sinTramo,quedan,finEstimadoMs:incompleta?null:cursor,finBloqueMs:finBloque};
  };

  /* =========================================================
     PANEL EN PROGRAMACIÓN: capacidad y secuencia
     ========================================================= */
  const ETQ={CABE:['Cabe','est-fin'],JUSTO:['Justo','est-pausa'],EXCESO:['No cabe','est-det'],INCOMPLETA:['Estimación incompleta','est-pend']};
  NS.pintarExtras=function(){
    const cap=document.getElementById('plan-capacidad');
    if(!cap)return;
    const E=NS.estado,t=NS.tiemposDe(E.turno),dur=NS.duracionBloqueMin(E.turno);
    const filas=[];let hayDatos=false;
    NS.lineas().forEach(l=>{
      const c=NS.capacidadLinea(E.fecha,E.turno,l.key);
      if(!c)return;
      hayDatos=true;
      const [txt,cls]=ETQ[c.estado];
      const falta=c.faltantes.length?'<br><small style="color:#6b7280">Falta: '+c.faltantes.map(f=>esc(f.dato)+(f.marca?' de '+esc(f.marca)+' '+esc(NS.etiquetaPresentacion(l.key,f.marca,f.presentacion)):'')).join('; ')+' (Catálogo)</small>':'';
      filas.push('<tr><td><b>'+esc(l.name)+'</b></td><td class="num">'+hm(c.produccionMin)+(c.faltantes.length?'*':'')+'</td><td class="num">'+hm(c.cambiosMin)+' <small>('+c.cambios+')</small></td>'+
        '<td class="num">'+hm(c.disponibleMin)+'</td><td class="num">'+(c.estado==='INCOMPLETA'?'—':'<b style="color:'+(c.holguraMin<0?'#991B1B':'#166534')+'">'+(c.holguraMin<0?'Exceso ':'Libre ')+hm(Math.abs(c.holguraMin))+'</b>')+'</td>'+
        '<td class="num">'+(c.cargaPct===null?'—':Math.round(c.cargaPct)+' %')+'</td><td><span class="plan-badge '+cls+'">'+txt+'</span>'+falta+'</td></tr>');
    });
    cap.innerHTML=!hayDatos?'':'<h4 style="margin:18px 0 6px;color:#003b5c">Capacidad del bloque <small style="font-weight:500;color:#5a6b78">(estimación de referencia)</small></h4>'+
      '<p class="plan-nota">Duración del bloque: <b>'+hm(dur)+'</b> · paradas previstas: <b>'+(t.paradasMin===null?'sin configurar':hm(t.paradasMin))+'</b> (se restan del tiempo disponible) · cambio de marca/formato: <b>'+(t.cambioMin===null?'sin configurar':hm(t.cambioMin))+'</b> (se suma al requerido). Cada tiempo se cuenta una sola vez. Las UND de líneas distintas no se suman.</p>'+
      '<div class="plan-scroll"><table class="plan-tabla"><thead><tr><th>Línea</th><th class="num">Producción a velocidad estándar</th><th class="num">Cambios (n.º)</th><th class="num">Disponible</th><th class="num">Holgura</th><th class="num">Carga</th><th>Estado</th></tr></thead><tbody>'+filas.join('')+'</tbody></table></div>'+
      '<p class="plan-nota">* sin los productos que no tienen velocidad estándar. Una estimación incompleta no se presenta como verdadera: completa el dato que falta.</p>'+
      (t.cambioMin===null||t.paradasMin===null?'<p class="plan-nota" style="color:#9A3412">No hay tiempos previstos de paradas y cambios configurados: el resultado compara solo producción contra la duración del bloque. '+(NS.puede()?'Configúralos en Catálogo → Tiempos previstos.':'Pídele a Planificación que los configure.')+'</p>':'');
    // secuencia
    const sec=document.getElementById('plan-secuencia');
    if(!sec)return;
    const bloques=[];
    NS.lineas().forEach(l=>{
      const s=NS.secuenciaLinea(E.fecha,E.turno,l.key);
      if(!s)return;
      const f=s.tramos.map(x=>'<tr><td class="num">'+esc(x.orden)+'</td><td>'+esc(x.marca)+' '+esc(NS.etiquetaPresentacion(l.key,x.marca,x.presentacion))+'</td><td>'+esc(x.tipoFin==='HORA'?'Hasta '+x.horaFin:x.tipoFin==='CANTIDAD'?'Hasta completar su cantidad':x.tipoFin==='CIERRE'?'Hasta el cierre del turno':'Sin condición')+'</td>'+
        '<td class="num">'+(x.estimado?hhmm(x.inicioMs):'—')+'</td><td class="num">'+(x.estimado?hhmm(x.finMs):'—')+'</td><td class="num">'+(x.estimado?fmt(Math.round(x.qty)):'—')+'</td>'+(x.motivo?'<td><small style="color:#6b7280">Estimación incompleta: '+esc(x.motivo)+'</small></td>':'<td></td>')+'</tr>').join('');
      bloques.push('<h5 style="margin:12px 0 4px;color:#003b5c">'+esc(l.name)+(s.finEstimadoMs?' <small style="font-weight:500;color:#5a6b78">· termina hacia las '+hhmm(s.finEstimadoMs)+'</small>':'')+'</h5>'+
        '<div class="plan-scroll"><table class="plan-tabla"><thead><tr><th class="num">Orden</th><th>Producto</th><th>Fin del tramo</th><th class="num">Inicio estimado</th><th class="num">Fin estimado</th><th class="num">UND estimadas</th><th></th></tr></thead><tbody>'+f+'</tbody></table></div>'+
        (s.avisos.length?'<p class="plan-nota" style="color:#9A3412">'+s.avisos.map(esc).join('<br>')+'</p>':'')+
        (s.sinTramo.length?'<p class="plan-nota">Sin posición en la secuencia: '+s.sinTramo.map(x=>esc(x.marca)+' '+esc(NS.etiquetaPresentacion(l.key,x.marca,x.presentacion))+' ('+fmt(x.cantidad)+' UND)').join(', ')+'.</p>':'')+
        (s.quedan.length?'<p class="plan-nota">Quedan sin asignar a un tramo: '+s.quedan.map(x=>esc(x.marca)+' '+fmt(x.cantidad)+' UND').join(', ')+'.</p>':''));
    });
    sec.innerHTML=bloques.length?'<h4 style="margin:18px 0 4px;color:#003b5c">Secuencia del bloque <small style="font-weight:500;color:#5a6b78">(tramos definidos en Paletas · horas estimadas a velocidad estándar)</small></h4>'+bloques.join('')+
      '<p class="plan-nota">Un producto que aparece en varios tramos (p. ej. SCALA → BELLS → SCALA) reparte entre ellos solo lo programado: su cantidad no se duplica.</p>':'';
  };

  /* =========================================================
     TRASLADO DE SALDO
     ========================================================= */
  const usuarioNombre=()=>(typeof state!=='undefined'&&state.user&&(state.user.nombre||state.user.username))||'';
  const conflicto=(msg,actual)=>{const e=new Error(msg);e.conflicto=true;e.actual=actual||null;return e;};
  /* Saldo comprobado de la fila: {programado, producido, saldo, max} o {error}. Sin registro NO es cero: no se puede comprobar. */
  NS.saldoDe=function(item){
    const r=NS.resumenBloque(item.fecha,item.turno),g=r.grupos.get([item.linea,item.marca,item.presentacion].join('|'));
    if(!g||!(g.programado>0))return {error:'Esta programación no tiene cantidad activa.'};
    if(g.producido===null)return {error:'No hay registro de producción de este producto: no se puede comprobar el saldo.',programado:g.programado};
    const saldo=Math.max(0,g.programado-g.producido);
    return {programado:g.programado,producido:g.producido,saldo,max:Math.min(saldo,num(item.cantidadProgramada))};
  };
  NS.trasladarSaldo=async function(o){
    if(!NS.puede())throw new Error('Solo Planificación puede trasladar saldo.');
    const item=o.item,cant=Number(o.cantidad),motivo=String(o.motivo||'').trim(),destBloque=NS.valorBloque(o.destTurno),origBloque=NS.valorBloque(item.turno);
    if(motivo.length<5)throw new Error('Indica el motivo del traslado (mínimo 5 caracteres).');
    if(!fechaOk(o.destFecha))throw new Error('La fecha de destino no es válida.');
    if(o.destFecha===item.fecha&&destBloque===origBloque)throw new Error('El destino debe ser otro bloque o otra fecha.');
    const s=NS.saldoDe(item);
    if(s.error)throw new Error(s.error);
    if(!Number.isInteger(cant)||cant<=0)throw new Error('La cantidad a trasladar debe ser un entero mayor que cero.');
    if(cant>s.max)throw new Error('Solo se pueden trasladar '+fmt(s.max)+' UND (saldo comprobado: programado '+fmt(s.programado)+' − producido '+fmt(s.producido)+' = '+fmt(s.saldo)+').');
    // compromiso original (64) de los bloques que ya empezaron: se guarda antes del cambio, sin bloquear
    if(typeof NS.asegurarCompromiso==='function'){await NS.asegurarCompromiso(item.fecha,item.turno);await NS.asegurarCompromiso(o.destFecha,destBloque);}
    const quien=usuarioNombre(),ref=db.collection('sync').doc('programaciones');
    const info={origen:{fecha:item.fecha,bloque:origBloque},destino:{fecha:o.destFecha,bloque:destBloque},cantidad:cant,saldoComprobado:s.saldo,programadoOrigen:s.programado,producidoOrigen:s.producido};
    let lista=null;
    await db.runTransaction(async tx=>{
      lista=null;
      const snap=await tx.get(ref);
      const items=snap.exists&&Array.isArray(snap.data().items)?snap.data().items.slice():[];
      const eventos=[];
      const orig=items.find(p=>p.clave===item.clave);
      if(!orig)throw conflicto('La programación de origen ya no existe (otra persona la quitó). No se trasladó nada.');
      if(num(orig.version)!==num(item.version))throw conflicto('La programación de origen cambió mientras preparabas el traslado. Valor actual: '+fmt(orig.cantidadProgramada)+' UND. No se trasladó nada.',{cantidad:num(orig.cantidadProgramada)});
      if(cant>num(orig.cantidadProgramada))throw conflicto('La cantidad de origen es ahora '+fmt(orig.cantidadProgramada)+' UND: no alcanza para trasladar '+fmt(cant)+'.',{cantidad:num(orig.cantidadProgramada)});
      const upp=num(orig.unidadesPorPaleta)||num(NS.uppSugerida(item.linea,item.marca,item.presentacion));
      const campos=(c,u)=>({cantidadProgramada:c,unidadesPorPaleta:u,paletasProgramadas:u?c/u:0,actualizadoPor:quien,actualizadoEn:Date.now()});
      const base={linea:item.linea,marca:item.marca,presentacion:item.presentacion};
      // origen: baja lo trasladado (lo producido se queda)
      const nuevaOrig=num(orig.cantidadProgramada)-cant;
      const rO=programacionAplicarEnLista(items,Object.assign({},base,{fecha:item.fecha,turno:item.turno,cantidadNum:nuevaOrig,uppNum:upp,campos:campos(nuevaOrig,upp),motivo:'Traslado de saldo: '+motivo}),{versionEsperada:num(item.version)});
      // destino: crea o suma
      const claveDest=NS.clave(item.linea,o.destFecha,destBloque,item.marca,item.presentacion);
      const dest=items.find(p=>p.clave===claveDest)||null;
      const nuevaDest=(dest?num(dest.cantidadProgramada):0)+cant,uppDest=num(dest&&dest.unidadesPorPaleta)||upp;
      const rD=programacionAplicarEnLista(items,Object.assign({},base,{fecha:o.destFecha,turno:destBloque,cantidadNum:nuevaDest,uppNum:uppDest,campos:campos(nuevaDest,uppDest),motivo:'Traslado de saldo: '+motivo}),{});
      tx.set(ref,{items,updatedAt:Date.now()});
      lista=items;
      const ev=(r,fecha,turno,ref2)=>NS.armarEvento(Object.assign({accion:r.nuevo?(r.previo?'EDICION':'CREACION'):'ELIMINACION',linea:item.linea,fecha,turno,marca:item.marca,presentacion:item.presentacion,
        anterior:programacionValorHistorial(r.previo,true),nuevo:programacionValorHistorial(r.nuevo,false),motivo,referencia:ref2},{extra:{traslado:info}}));
      [ev(rO,item.fecha,rO.turnoFinal,'TRASLADO: a '+o.destFecha+' '+destBloque),ev(rD,o.destFecha,rD.turnoFinal,'TRASLADO: desde '+item.fecha+' '+origBloque)]
        .forEach(e=>{if(e)tx.set(db.collection('historialProgramacion').doc(e.id),e.doc);});
    });
    if(lista&&typeof _programacionesCache!=='undefined')_programacionesCache=lista;
    return info;
  };

  NS.abrirTraslado=function(clave){
    if(!NS.puede())return;
    const item=NS.programaciones().find(p=>p.clave===clave);
    if(!item){alert('Esta programación ya no existe.');return;}
    const s=NS.saldoDe(item);
    if(s.error){alert(s.error);return;}
    if(!(s.max>0)){alert('No hay saldo por trasladar: producido '+fmt(s.producido)+' de '+fmt(s.programado)+' UND.');return;}
    const origBloque=NS.valorBloque(item.turno);
    const sigFecha=origBloque==='NOCHE'?addDias(item.fecha,1):item.fecha,sigBloque=origBloque==='NOCHE'?'DÍA':'NOCHE';
    const fondo=NS.abrirDialogo('<h3>Trasladar saldo</h3>'+
      '<p style="font-size:13px">'+esc(NS.nombreLinea(item.linea))+' · '+esc(item.marca)+' '+esc(NS.etiquetaPresentacion(item.linea,item.marca,item.presentacion))+' · '+esc(item.fecha)+' · '+esc(NS.etiquetaBloque(item.turno))+'<br>'+
      'Programado <b>'+fmt(s.programado)+'</b> − producido <b>'+fmt(s.producido)+'</b> = saldo <b>'+fmt(s.saldo)+' UND</b>'+(s.max<s.saldo?' (en esta fila se pueden trasladar hasta '+fmt(s.max)+')':'')+'.</p>'+
      '<div class="plan-campos"><label>Fecha de destino<input type="date" id="tr-fecha" value="'+esc(sigFecha)+'"></label>'+
      '<label>Bloque de destino<select id="tr-bloque">'+NS.BLOQUES.map(b=>'<option value="'+b.valor+'"'+(b.valor===sigBloque?' selected':'')+'>'+esc(NS.etiquetaBloqueConHorario(b.valor))+'</option>').join('')+'</select></label>'+
      '<label class="completo">Cantidad a trasladar (UND)<input type="number" id="tr-cant" min="1" max="'+s.max+'" step="1" value="'+s.max+'"></label>'+
      '<label class="completo">Motivo (obligatorio)<textarea id="tr-motivo" rows="2" maxlength="200"></textarea></label></div>'+
      '<div class="plan-aviso" id="tr-aviso"></div><div class="plan-error" id="tr-error"></div>'+
      '<p class="plan-nota">El origen baja y el destino sube en la misma operación: el total no se duplica. Lo ya producido se queda en el origen y el plan original del bloque (si ya empezó) queda guardado. Queda en el historial.</p>'+
      '<div class="plan-acciones"><button type="button" class="btn btn-ghost" id="tr-cancelar">Cancelar</button><button type="button" class="btn btn-primary" id="tr-ok">Trasladar</button></div>');
    const q=i=>fondo.querySelector('#'+i);
    const aviso=()=>{
      const f=q('tr-fecha').value,b=q('tr-bloque').value,c=num(q('tr-cant').value);
      const ex=fechaOk(f)?NS.existente(item.linea,f,b,item.marca,item.presentacion):null;
      q('tr-aviso').textContent=ex&&num(ex.cantidadProgramada)>0?'En el destino ya hay '+fmt(ex.cantidadProgramada)+' UND de este producto: quedarán '+fmt(num(ex.cantidadProgramada)+c)+' UND.':'';
    };
    ['tr-fecha','tr-bloque','tr-cant'].forEach(i=>q(i).addEventListener('input',aviso));aviso();
    q('tr-cancelar').onclick=()=>fondo.remove();
    q('tr-ok').onclick=async()=>{
      q('tr-ok').disabled=true;q('tr-error').textContent='Trasladando…';
      try{
        await NS.trasladarSaldo({item,destFecha:q('tr-fecha').value,destTurno:q('tr-bloque').value,cantidad:q('tr-cant').value,motivo:q('tr-motivo').value});
        fondo.remove();if(typeof NS.pintarPestana==='function')NS.pintarPestana();
      }catch(e){q('tr-error').textContent=(e&&e.message)||String(e);q('tr-ok').disabled=false;}
    };
  };
  document.addEventListener('click',e=>{
    const raiz=e.target.closest&&e.target.closest('#plan-root');
    if(!raiz||!NS.estado||NS.estado.tab!=='programacion')return;
    const b=e.target.closest('[data-plan-trasladar]');
    if(b)NS.abrirTraslado(b.getAttribute('data-plan-trasladar'));
  });
})();
