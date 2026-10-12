/* =============================================================
   PLANIFICACIÓN · SOLICITUDES, HISTORIAL Y CUMPLIMIENTO (Parte C)

   · Solicitudes (colección solicitudesProgramacion): el supervisor pide un cambio de cantidad o de producto, o pide
     programación cuando no existe, siempre con motivo. Quien planifica las ve al instante y las aprueba o rechaza
     con un comentario. Al aprobar, la programación se cambia con guardarProgramacionPaleta() (la función única).
     El resultado llega en tiempo real al solicitante y al Centro de avisos (46-proyeccion-avisos.js lee NS.avisos()).
   · Historial (colección historialProgramacion): cada creación, edición, copia, importación, aprobación y rechazo
     queda con usuario, uid, hora del servidor, valor anterior, valor nuevo y motivo. Solo se crea.
   · Cumplimiento: programado contra producido por línea, día y semana, con GlacialIndicadores.cumplimiento.
   ============================================================= */
(function(){
  'use strict';
  const NS=window.glacialPlanificacion;
  const {num,norm,esc,iso,addDias,lunesDe,fechaOk,ahoraMs}=NS.util;
  const G=()=>window.GlacialIndicadores;

  /* Se programa por bloque; la solicitud conserva el turno REAL de quien la pide (p. ej. INTERMEDIO) y se aplica al bloque Día. */
  const turnoTxt=t=>t==='INTERMEDIO'?NS.etiquetaBloque(t)+' · pedida desde Intermedio':NS.etiquetaBloque(t);
  const usuario=()=>{
    const u=(typeof firebase!=='undefined'&&firebase.auth&&firebase.auth().currentUser)||null;
    return {uid:(u&&u.uid)||'',nombre:(state.user&&(state.user.nombre||state.user.username))||'',username:(state.user&&state.user.username)||''};
  };
  const marcaTiempo=v=>v&&typeof v.toMillis==='function'?v.toMillis():num(v);
  const fmtFechaHora=ms=>ms?new Date(ms).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
  const serverTs=()=>firebase.firestore.FieldValue.serverTimestamp();

  /* =========================================================
     HISTORIAL DE CAMBIOS
     ========================================================= */
  NS.historialFallo=false;
  NS.registrarHistorial=async function(ev){
    const u=usuario();
    if(!u.uid||typeof db==='undefined')return;
    const doc={
      accion:String(ev.accion||''),linea:ev.linea||'',fecha:ev.fecha||'',turno:ev.turno||'',marca:ev.marca||'',presentacion:ev.presentacion||'',
      anterior:ev.anterior||null,nuevo:ev.nuevo||null,motivo:String(ev.motivo||''),referencia:String(ev.referencia||''),
      usuario:u.nombre,username:u.username,uid:u.uid,timestamp:serverTs()
    };
    try{await db.collection('historialProgramacion').add(doc);NS.historialFallo=false;}
    catch(e){
      // El cambio de programación ya se guardó; si el historial falla se avisa sin deshacerlo.
      NS.historialFallo=true;
      console.warn('Historial de programación: no se pudo registrar (¿reglas de Firestore sin publicar?):',e&&e.message||e);
    }
  };

  /* Arma el evento del historial SIN escribirlo: quien lo llama lo guarda dentro de SU transacción (el cambio y su rastro van juntos,
     todo o nada). ev.extra agrega campos propios (p. ej. «desde» en una unificación). Devuelve {id, doc} o null si no hay sesión. */
  NS.armarEvento=function(ev){
    const u=usuario();
    if(!u.uid)return null;
    return {
      id:'h_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
      doc:Object.assign({
        accion:String(ev.accion||''),linea:ev.linea||'',fecha:ev.fecha||'',turno:ev.turno||'',marca:ev.marca||'',presentacion:ev.presentacion||'',
        anterior:ev.anterior||null,nuevo:ev.nuevo||null,motivo:String(ev.motivo||''),referencia:String(ev.referencia||''),
        usuario:u.nombre,username:u.username,uid:u.uid,timestamp:serverTs()
      },ev.extra||{})
    };
  };

  async function leerHistorial(){
    const snap=await db.collection('historialProgramacion').orderBy('timestamp','desc').limit(150).get();
    return snap.docs.map(d=>Object.assign({id:d.id},d.data()));
  }
  const puedeVerHistorial=()=>NS.puede()||(typeof esUsuarioSoloConsulta==='function'&&esUsuarioSoloConsulta(state.user));
  const TEXTO_ACCION={CREACION:'Creación',EDICION:'Edición',ELIMINACION:'Se quitó',COPIA:'Copia',IMPORTACION:'Importación',APROBACION:'Aprobación de solicitud',RECHAZO_SOLICITUD:'Rechazo de solicitud'};
  const textoValor=v=>v?(num(v.cantidad).toLocaleString('es-PE')+' UND'+(num(v.unidadesPorPaleta)?' · '+num(v.unidadesPorPaleta)+'/paleta':'')):'—';

  async function pintarHistorial(){
    const cont=document.getElementById('sol-historial');
    if(!cont)return;
    cont.innerHTML='<p class="plan-nota">Cargando historial…</p>';
    try{
      const lista=await leerHistorial();
      cont.innerHTML='<div class="plan-scroll"><table class="plan-tabla"><thead><tr><th>Fecha y hora</th><th>Acción</th><th>Producto</th><th>Turno</th><th>Antes</th><th>Después</th><th>Motivo</th><th>Usuario</th></tr></thead><tbody>'+
        (lista.length?lista.map(h=>/^TIEMPOS/.test(h.referencia||'')&&typeof NS.filaHistorialTiempos==='function'?NS.filaHistorialTiempos(h):'<tr><td>'+esc(fmtFechaHora(marcaTiempo(h.timestamp)))+'</td><td>'+esc(/^UNIFICACION/.test(h.referencia||'')?'Unificada en Mañana ('+(TEXTO_ACCION[h.accion]||h.accion).toLowerCase()+')':/^TRASLADO/.test(h.referencia||'')?'Traslado de saldo ('+(TEXTO_ACCION[h.accion]||h.accion).toLowerCase()+')':(TEXTO_ACCION[h.accion]||h.accion))+'</td><td>'+esc(NS.nombreLinea(h.linea))+' · '+esc(h.marca)+' '+esc(NS.etiquetaPresentacion(h.linea,h.marca,h.presentacion))+'</td><td>'+esc(h.fecha)+' · '+esc(h.turno==='INTERMEDIO'?'Intermedio':h.turno==='DÍA'?'Día':h.turno)+'</td><td>'+esc(textoValor(h.anterior))+(h.desde?'<br><small>+ '+esc(num(h.desde.cantidad).toLocaleString('es-PE'))+' UND desde Intermedio</small>':'')+'</td><td>'+esc(textoValor(h.nuevo))+'</td><td>'+esc(h.motivo||'')+'</td><td>'+esc(h.usuario||'')+'</td></tr>').join(''):'<tr><td colspan="8">Todavía no hay cambios registrados.</td></tr>')+'</tbody></table></div>'+
        (NS.historialFallo?'<p class="plan-error">Algún cambio reciente no pudo registrarse en el historial (revisa que las reglas de Firestore estén publicadas).</p>':'');
    }catch(e){cont.innerHTML='<p class="plan-error">No se pudo leer el historial: '+esc((e&&e.message)||e)+'</p>';}
  }

  /* =========================================================
     SOLICITUDES: datos en vivo
     ========================================================= */
  const mapa=new Map();          // id → solicitud (propias + las de todos si planificas)
  let cierreProp=null,cierrePlan=null,uidEscucha='';

  function aplicarSnap(snap){
    snap.docChanges().forEach(c=>{if(c.type==='removed')mapa.delete(c.doc.id);else mapa.set(c.doc.id,Object.assign({id:c.doc.id},c.doc.data({serverTimestamps:'estimate'})));});
    NS.refrescar();
  }
  function asegurarPlanificador(){
    if(NS.puede()&&!cierrePlan&&typeof db!=='undefined'){
      cierrePlan=db.collection('solicitudesProgramacion').orderBy('creadoEn','desc').limit(300)
        .onSnapshot(aplicarSnap,err=>{console.warn('Solicitudes de programación:',err&&err.message||err);cierrePlan=null;});
    }else if(!NS.puede()&&cierrePlan){try{cierrePlan();}catch(_){/* ya cerrada */}cierrePlan=null;}
  }
  NS.alRefrescar.push(asegurarPlanificador);   // si el permiso cambia en vivo, la escucha amplia se abre o se cierra

  NS.escuchas.push(function(){
    if(typeof db==='undefined')return null;
    const u=usuario();
    if(!u.uid)return null;
    uidEscucha=u.uid;
    cierreProp=db.collection('solicitudesProgramacion').where('uid','==',u.uid)
      .onSnapshot(aplicarSnap,err=>console.warn('Mis solicitudes de programación:',err&&err.message||err));
    asegurarPlanificador();
    return function(){
      [cierreProp,cierrePlan].forEach(c=>{try{if(c)c();}catch(_){/* ya cerrada */}});
      cierreProp=null;cierrePlan=null;mapa.clear();
    };
  });

  NS.solicitudes=()=>[...mapa.values()].sort((a,b)=>marcaTiempo(b.creadoEn)-marcaTiempo(a.creadoEn));
  const textoTipo=t=>({CAMBIO_CANTIDAD:'Cambio de cantidad',CAMBIO_PRODUCTO:'Cambio de producto',NUEVA_PROGRAMACION:'Programación nueva'})[t]||t;
  const textoEstado=e=>({PENDIENTE:'Pendiente',APROBADA:'Aprobada',RECHAZADA:'Rechazada'})[e]||e;
  const descProducto=s=>(s.marca?esc(s.marca)+' '+esc(NS.etiquetaPresentacion(s.linea,s.marca,s.presentacion)):'—');

  /* ---------- avisos para el Centro de avisos ---------- */
  NS.avisos=function(){
    const salida=[],u=usuario(),lista=NS.solicitudes();
    if(NS.puede()){
      const pend=lista.filter(s=>s.estado==='PENDIENTE');
      if(pend.length)salida.push({id:'sol|pendientes',linea:'',texto:pend.length+(pend.length===1?' solicitud de programación pendiente':' solicitudes de programación pendientes')+' por revisar',
        desdeMs:Math.min(...pend.map(s=>marcaTiempo(s.creadoEn)||ahoraMs())),severidad:'ambar'});
    }
    const limite=ahoraMs()-48*3600*1000;
    lista.filter(s=>s.uid===u.uid&&s.estado!=='PENDIENTE'&&marcaTiempo(s.resueltaEn)>limite).forEach(s=>{
      salida.push({id:'sol|'+s.id+'|'+s.estado,linea:s.linea||'',texto:'Tu solicitud ('+textoTipo(s.tipo).toLowerCase()+' · '+NS.nombreLinea(s.linea)+' · '+s.fecha+') fue '+textoEstado(s.estado).toLowerCase()+(s.comentario?': '+s.comentario:''),
        desdeMs:marcaTiempo(s.resueltaEn),severidad:s.estado==='RECHAZADA'?'roja':'ambar'});
    });
    return salida;
  };

  /* ---------- crear una solicitud ---------- */
  async function crearSolicitud(s){
    const u=usuario();
    if(!u.uid)throw new Error('No hay sesión activa.');
    if(String(s.motivo||'').trim().length<5)throw new Error('El motivo es obligatorio (mínimo 5 caracteres).');
    if(!s.linea||!fechaOk(s.fecha)||!NS.TURNOS.includes(s.turno))throw new Error('Falta la línea, la fecha o el turno.');
    const doc={
      tipo:s.tipo,linea:s.linea,fecha:s.fecha,turno:s.turno,marca:s.marca||'',presentacion:s.presentacion||'',
      cantidadActual:num(s.cantidadActual),propuesta:s.propuesta||null,motivo:String(s.motivo).trim(),estado:'PENDIENTE',
      uid:u.uid,usuario:u.nombre,creadoEn:serverTs()
    };
    // Versión de la fila sobre la que se pidió el cambio: al aprobar se comprueba que siga igual.
    if(s.tipo!=='NUEVA_PROGRAMACION'&&Number.isFinite(Number(s.baseVersion)))doc.baseVersion=num(s.baseVersion);
    await db.collection('solicitudesProgramacion').add(doc);
  }

  function dialogoSolicitud(base){
    const fondo=NS.abrirDialogo('<h3>'+(base.tipo==='NUEVA_PROGRAMACION'?'Solicitar programación':'Pedir un cambio')+'</h3>'+
      '<div class="small-muted" style="margin-bottom:10px">'+esc(NS.nombreLinea(base.linea))+' · '+esc(base.fecha)+' · '+esc(turnoTxt(base.turno))+(base.marca?' · '+esc(base.marca)+' '+esc(NS.etiquetaPresentacion(base.linea,base.marca,base.presentacion)):'')+(base.cantidadActual?' · programado '+num(base.cantidadActual).toLocaleString('es-PE'):'')+'</div>'+
      '<div class="plan-campos">'+
      (base.tipo!=='NUEVA_PROGRAMACION'?'<label class="completo">¿Qué quieres cambiar?<select id="ps-tipo"><option value="CAMBIO_CANTIDAD">La cantidad</option><option value="CAMBIO_PRODUCTO">El producto</option></select></label>':'')+
      '<label id="ps-b-marca" class="completo">Marca<select id="ps-marca"></select></label>'+
      '<label id="ps-b-pres" class="completo">Presentación<select id="ps-pres"></select></label>'+
      '<label id="ps-b-cant">Cantidad pedida (UND)<input type="number" id="ps-cant" min="1" step="1" inputmode="numeric"></label>'+
      '<label class="completo">Motivo (obligatorio)<textarea id="ps-motivo" rows="3" placeholder="Explica por qué"></textarea></label></div>'+
      '<div class="plan-error" id="ps-error"></div>'+
      '<div class="plan-acciones"><button type="button" class="btn btn-ghost" id="ps-cancelar">Cancelar</button><button type="button" class="btn btn-primary" id="ps-enviar">Enviar solicitud</button></div>');
    const q=i=>fondo.querySelector('#'+i);
    const llenar=()=>{
      q('ps-marca').innerHTML='<option value="">Selecciona…</option>'+NS.marcas(base.linea).map(m=>'<option value="'+esc(m)+'"'+(m===base.marca?' selected':'')+'>'+esc(m)+'</option>').join('');
      q('ps-pres').innerHTML='<option value="">Selecciona…</option>'+NS.presentaciones(base.linea).map(p=>'<option value="'+esc(p.value)+'"'+(p.value===base.presentacion?' selected':'')+'>'+esc(p.label)+'</option>').join('');
    };
    const tipoActual=()=>base.tipo==='NUEVA_PROGRAMACION'?'NUEVA_PROGRAMACION':q('ps-tipo').value;
    const ajustar=()=>{
      const t=tipoActual();
      q('ps-b-marca').style.display=q('ps-b-pres').style.display=t==='CAMBIO_CANTIDAD'?'none':'';
      q('ps-cant').value=q('ps-cant').value||(t==='CAMBIO_PRODUCTO'?base.cantidadActual||'':'');
    };
    llenar();ajustar();
    if(base.tipo!=='NUEVA_PROGRAMACION')q('ps-tipo').onchange=ajustar;
    q('ps-cancelar').onclick=()=>fondo.remove();
    q('ps-enviar').onclick=async()=>{
      q('ps-enviar').disabled=true;q('ps-error').textContent='';
      try{
        const tipo=tipoActual(),cant=Number(q('ps-cant').value),marca=q('ps-marca').value,pres=q('ps-pres').value;
        if(!Number.isInteger(cant)||cant<=0)throw new Error('La cantidad pedida debe ser un entero mayor que cero.');
        if(tipo!=='CAMBIO_CANTIDAD'&&(!marca||!pres))throw new Error('Elige la marca y la presentación.');
        await crearSolicitud({tipo,linea:base.linea,fecha:base.fecha,turno:base.turno,marca:base.marca,presentacion:base.presentacion,cantidadActual:base.cantidadActual,baseVersion:base.baseVersion,
          propuesta:tipo==='CAMBIO_CANTIDAD'?{cantidad:cant}:{marca,presentacion:pres,cantidad:cant},motivo:q('ps-motivo').value});
        fondo.remove();
        alert('Solicitud enviada. Verás el resultado aquí y en el Centro de avisos.');
      }catch(e){q('ps-error').textContent=(e&&e.message)||String(e);q('ps-enviar').disabled=false;}
    };
  }
  NS.solicitarCambio=item=>dialogoSolicitud({tipo:'CAMBIO_CANTIDAD',linea:item.linea,fecha:item.fecha,turno:item.turno,marca:item.marca,presentacion:item.presentacion,cantidadActual:num(item.cantidadProgramada),baseVersion:num(item.version)});
  NS.solicitarProgramacion=(linea,fecha,turno,marca,presentacion)=>dialogoSolicitud({tipo:'NUEVA_PROGRAMACION',linea,fecha,turno,marca:marca||'',presentacion:presentacion||'',cantidadActual:0});

  /* ---------- aprobar o rechazar ----------
     UNA transacción lee la solicitud y la programación, comprueba que la solicitud siga PENDIENTE y que la fila siga igual que cuando se pidió,
     aplica el cambio, escribe su historial y marca la solicitud: todo o nada. Si algo cambió no se aplica nada y el error trae el valor actual. */
  const conflicto=(msg,actual)=>{const e=new Error(msg);e.conflicto=true;e.actual=actual||null;return e;};
  const hallarFila=(items,linea,fecha,turno,marca,pres)=>{
    let f=items.find(x=>x.clave===NS.clave(linea,fecha,turno,marca,pres));
    if(!f&&turno==='INTERMEDIO')f=items.find(x=>x.clave===NS.clave(linea,fecha,'DÍA',marca,pres));
    return f||null;
  };
  const resumenFila=f=>f?num(f.cantidadProgramada).toLocaleString('es-PE')+' UND ('+num(f.unidadesPorPaleta).toLocaleString('es-PE')+' por paleta)':'sin programar';
  NS.resolverSolicitud=async function(solId,aprobar,comentario){
    if(!NS.puede())throw new Error('Solo Planificación puede resolver solicitudes.');
    comentario=String(comentario||'').trim();
    if(comentario.length<3)throw new Error('Escribe un comentario.');
    let s0=mapa.get(solId);
    if(aprobar&&!s0){try{const g=await db.collection('solicitudesProgramacion').doc(solId).get();s0=g.exists?g.data():null;}catch(_){s0=null;}}
    if(aprobar&&s0&&typeof NS.asegurarCompromiso==='function')await NS.asegurarCompromiso(s0.fecha,s0.turno);   // compromiso original (64), sin bloquear
    const u=usuario();
    const refSol=db.collection('solicitudesProgramacion').doc(solId),refProg=db.collection('sync').doc('programaciones');
    let nuevaLista=null;
    await db.runTransaction(async tx=>{
      nuevaLista=null;                              // la transacción puede repetirse: parte siempre de cero
      const ss=await tx.get(refSol);
      if(!ss.exists)throw new Error('La solicitud ya no existe.');
      const sol=Object.assign({id:solId},ss.data());
      if(sol.estado!=='PENDIENTE')throw conflicto('Esta solicitud ya fue resuelta por otra persona ('+textoEstado(sol.estado).toLowerCase()+(sol.resueltaPor?' por '+sol.resueltaPor:'')+(sol.comentario?': '+sol.comentario:'')+'). No se aplicó nada.');
      const eventos=[];
      if(aprobar){
        const ps=await tx.get(refProg);
        const items=ps.exists&&Array.isArray(ps.data().items)?ps.data().items.slice():[];
        const motivo='Solicitud de '+(sol.usuario||'supervisor')+': '+sol.motivo;
        const prop=sol.propuesta||{};
        const aplicar=(f,cant,upp,extra)=>{
          const v=NS.validar({linea:sol.linea,fecha:sol.fecha,turno:sol.turno,marca:f.marca,presentacion:f.presentacion,cantidad:cant,upp});
          if(cant>0&&v.errores.length)throw new Error(v.errores.join(' '));
          const campos={cantidadProgramada:cant,unidadesPorPaleta:upp,paletasProgramadas:upp?cant/upp:0,actualizadoPor:u.nombre,actualizadoEn:Date.now()};
          const r=programacionAplicarEnLista(items,{linea:sol.linea,fecha:sol.fecha,turno:sol.turno,marca:f.marca,presentacion:f.presentacion,cantidadNum:cant,uppNum:upp,campos,motivo},{});
          const ev=NS.armarEvento({accion:extra&&extra.accion||'APROBACION',linea:sol.linea,fecha:sol.fecha,turno:r.turnoFinal,marca:f.marca,presentacion:f.presentacion,
            anterior:programacionValorHistorial(r.previo,true),nuevo:programacionValorHistorial(r.nuevo,false),motivo,referencia:sol.id});
          if(ev)eventos.push(ev);
          return r;
        };
        if(sol.tipo==='NUEVA_PROGRAMACION'){
          const ya=hallarFila(items,sol.linea,sol.fecha,sol.turno,prop.marca,prop.presentacion);
          if(ya&&num(ya.cantidadProgramada)>0)throw conflicto('Ya hay una programación para ese producto: '+resumenFila(ya)+'. No se aplicó la solicitud; revísala con el valor actual.',{cantidad:num(ya.cantidadProgramada)});
          aplicar(prop,num(prop.cantidad),num(NS.uppSugerida(sol.linea,prop.marca,prop.presentacion)));
        }else{
          const actual=hallarFila(items,sol.linea,sol.fecha,sol.turno,sol.marca,sol.presentacion);
          if(!actual)throw conflicto('La programación a cambiar ya no existe (otra persona la quitó). No se aplicó la solicitud.');
          const igual=Number.isFinite(Number(sol.baseVersion))?num(actual.version)===num(sol.baseVersion):num(actual.cantidadProgramada)===num(sol.cantidadActual);
          if(!igual)throw conflicto('La programación cambió desde que se pidió el cambio (se pidió sobre '+num(sol.cantidadActual).toLocaleString('es-PE')+' UND). Valor actual: '+resumenFila(actual)+'. No se aplicó la solicitud.',{cantidad:num(actual.cantidadProgramada),unidadesPorPaleta:num(actual.unidadesPorPaleta)});
          if(sol.tipo==='CAMBIO_CANTIDAD'){
            aplicar({marca:sol.marca,presentacion:sol.presentacion},num(prop.cantidad),num(actual.unidadesPorPaleta)||num(NS.uppSugerida(sol.linea,sol.marca,sol.presentacion)));
          }else{
            const destino=hallarFila(items,sol.linea,sol.fecha,sol.turno,prop.marca,prop.presentacion);
            if(destino&&num(destino.cantidadProgramada)>0)throw conflicto('Ya hay una programación del producto pedido: '+resumenFila(destino)+'. No se aplicó la solicitud.',{cantidad:num(destino.cantidadProgramada)});
            const uppNuevo=num(NS.uppSugerida(sol.linea,prop.marca,prop.presentacion))||num(actual.unidadesPorPaleta);
            // quitar el anterior y crear el nuevo ocurren en la MISMA transacción: si algo falla no se pierde el producto original
            aplicar({marca:sol.marca,presentacion:sol.presentacion},0,num(actual.unidadesPorPaleta),{accion:'ELIMINACION'});
            aplicar(prop,num(prop.cantidad),uppNuevo);
          }
        }
        tx.set(refProg,{items,updatedAt:Date.now()});
        nuevaLista=items;
        eventos.forEach(ev=>tx.set(db.collection('historialProgramacion').doc(ev.id),ev.doc));
      }else{
        const ev=NS.armarEvento({accion:'RECHAZO_SOLICITUD',linea:sol.linea,fecha:sol.fecha,turno:sol.turno,marca:sol.marca,presentacion:sol.presentacion,
          anterior:sol.cantidadActual?{cantidad:num(sol.cantidadActual)}:null,nuevo:null,motivo:comentario,referencia:sol.id});
        if(ev)tx.set(db.collection('historialProgramacion').doc(ev.id),ev.doc);
      }
      tx.update(refSol,{estado:aprobar?'APROBADA':'RECHAZADA',comentario,resueltaPor:u.nombre,resueltaUid:u.uid,resueltaEn:serverTs()});
    });
    if(nuevaLista&&typeof _programacionesCache!=='undefined')_programacionesCache=nuevaLista;
  };
  function dialogoResolver(sol,aprobar){
    const fondo=NS.abrirDialogo('<h3>'+(aprobar?'Aprobar':'Rechazar')+' solicitud</h3>'+
      '<p style="font-size:13px">'+esc(textoTipo(sol.tipo))+' · '+esc(NS.nombreLinea(sol.linea))+' · '+esc(sol.fecha)+' · '+esc(turnoTxt(sol.turno))+'<br>Pide: <b>'+esc(textoPropuesta(sol))+'</b><br>Motivo: '+esc(sol.motivo)+'</p>'+
      '<label style="font-size:12px;color:#5a6b78;display:flex;flex-direction:column;gap:3px">Comentario (obligatorio)<textarea id="pr-comentario" rows="3" style="padding:7px;border:1px solid #cfdbe3;border-radius:7px;font:inherit"></textarea></label>'+
      (aprobar?'<p class="plan-nota">Al aprobar, la programación se actualiza sola.</p>':'')+
      '<div class="plan-error" id="pr-error"></div><div class="plan-acciones"><button type="button" class="btn btn-ghost" id="pr-cancelar">Cancelar</button><button type="button" class="btn btn-primary" id="pr-ok">'+(aprobar?'Aprobar':'Rechazar')+'</button></div>');
    const q=i=>fondo.querySelector('#'+i);
    q('pr-cancelar').onclick=()=>fondo.remove();
    q('pr-ok').onclick=async()=>{
      const comentario=q('pr-comentario').value.trim();
      if(comentario.length<3){q('pr-error').textContent='Escribe un comentario.';return;}
      q('pr-ok').disabled=true;q('pr-error').textContent=aprobar?'Aplicando…':'';
      try{
        await NS.resolverSolicitud(sol.id,aprobar,comentario);
        fondo.remove();
      }catch(e){q('pr-error').textContent=(e&&e.message)||String(e);q('pr-ok').disabled=false;}
    };
  }
  const textoPropuesta=s=>{
    const p=s.propuesta||{};
    if(s.tipo==='CAMBIO_CANTIDAD')return num(p.cantidad).toLocaleString('es-PE')+' UND (ahora '+num(s.cantidadActual).toLocaleString('es-PE')+')';
    return (p.marca||'')+' '+NS.etiquetaPresentacion(s.linea,p.marca,p.presentacion)+' · '+num(p.cantidad).toLocaleString('es-PE')+' UND';
  };

  /* =========================================================
     PESTAÑA SOLICITUDES
     ========================================================= */
  function pintarSolicitudes(cont){
    cont.innerHTML='<div id="sol-lista"></div>'+(puedeVerHistorial()?'<h3 style="margin:22px 0 8px;color:#003b5c">Historial de cambios</h3><div id="sol-historial"></div>':'');
    pintarLista();
    if(puedeVerHistorial())pintarHistorial();
  }
  function pintarLista(){
    const cont=document.getElementById('sol-lista');
    if(!cont)return;
    const planifica=NS.puede(),u=usuario();
    const lista=NS.solicitudes().filter(s=>planifica||s.uid===u.uid);
    const fila=s=>'<tr><td>'+esc(fmtFechaHora(marcaTiempo(s.creadoEn)))+'</td><td>'+esc(textoTipo(s.tipo))+'</td><td>'+esc(NS.nombreLinea(s.linea))+'<br><small>'+esc(s.fecha)+' · '+esc(turnoTxt(s.turno))+'</small></td>'+
      '<td>'+(s.marca?descProducto(s):'—')+'</td><td>'+esc(textoPropuesta(s))+'</td><td>'+esc(s.motivo)+(planifica?'<br><small>'+esc(s.usuario||'')+'</small>':'')+'</td>'+
      '<td><span class="plan-badge '+(s.estado==='APROBADA'?'prod':s.estado==='RECHAZADA'?'stop':'pausa')+'">'+esc(textoEstado(s.estado))+'</span>'+(s.comentario?'<br><small>'+esc(s.comentario)+'</small>':'')+'</td>'+
      '<td class="acc">'+(planifica&&s.estado==='PENDIENTE'?'<button type="button" class="btn btn-primary btn-sm" data-sol-ok="'+esc(s.id)+'">Aprobar</button> <button type="button" class="btn btn-ghost btn-sm" data-sol-no="'+esc(s.id)+'">Rechazar</button>':'')+'</td></tr>';
    cont.innerHTML='<div class="plan-bar"><button type="button" class="btn btn-primary btn-sm" data-sol-nueva>Nueva solicitud</button>'+
      '<span class="plan-nota" style="margin:0">'+(planifica?'Las solicitudes llegan aquí al instante.':'Aquí ves el resultado de tus solicitudes en tiempo real.')+'</span></div>'+
      '<div class="plan-scroll"><table class="plan-tabla"><thead><tr><th>Enviada</th><th>Tipo</th><th>Línea y turno</th><th>Producto actual</th><th>Pide</th><th>Motivo</th><th>Estado</th><th></th></tr></thead><tbody>'+
      (lista.length?lista.map(fila).join(''):'<tr><td colspan="8">No hay solicitudes.</td></tr>')+'</tbody></table></div>';
  }
  function actualizarSolicitudes(){
    pintarLista();
    if(puedeVerHistorial()&&document.getElementById('sol-historial'))pintarHistorial();
  }

  document.addEventListener('click',e=>{
    const raiz=e.target.closest&&e.target.closest('#plan-root');
    if(!raiz||NS.estado.tab!=='solicitudes')return;
    if(e.target.closest('[data-sol-nueva]')){
      const E=NS.estado;
      dialogoSolicitudLibre(E);return;
    }
    const ok=e.target.closest('[data-sol-ok]'),no=e.target.closest('[data-sol-no]');
    const id=(ok||no)&&(ok||no).getAttribute(ok?'data-sol-ok':'data-sol-no');
    if(id){const s=mapa.get(id);if(s)dialogoResolver(s,!!ok);}
  });

  /* «Nueva solicitud» desde la pestaña: pide línea, fecha y turno y luego usa el diálogo común. */
  function dialogoSolicitudLibre(E){
    const fondo=NS.abrirDialogo('<h3>Nueva solicitud</h3><div class="plan-campos">'+
      '<label class="completo">Línea<select id="sn-linea">'+NS.lineas().map(l=>'<option value="'+esc(l.key)+'">'+esc(l.name)+'</option>').join('')+'</select></label>'+
      '<label>Fecha<input type="date" id="sn-fecha" value="'+esc(E.fecha)+'"></label>'+
      '<label>Turno<select id="sn-turno">'+NS.BLOQUES.map(b=>'<option value="'+b.valor+'"'+(b.valor===NS.valorBloque(E.turno)?' selected':'')+'>'+esc(NS.etiquetaBloqueConHorario(b.valor))+'</option>').join('')+'</select></label></div>'+
      '<p class="plan-nota">Si ya hay un producto programado, pide el cambio desde su fila en Programación.</p>'+
      '<div class="plan-acciones"><button type="button" class="btn btn-ghost" id="sn-cancelar">Cancelar</button><button type="button" class="btn btn-primary" id="sn-seguir">Pedir programación</button></div>');
    fondo.querySelector('#sn-cancelar').onclick=()=>fondo.remove();
    fondo.querySelector('#sn-seguir').onclick=()=>{
      const linea=fondo.querySelector('#sn-linea').value,fecha=fondo.querySelector('#sn-fecha').value,turno=fondo.querySelector('#sn-turno').value;
      if(!fechaOk(fecha))return;
      fondo.remove();NS.solicitarProgramacion(linea,fecha,turno,'','');
    };
  }

  NS.pestanas.push({clave:'solicitudes',titulo:'Solicitudes',orden:4,pintar:pintarSolicitudes,actualizar:actualizarSolicitudes});

  /* =========================================================
     PESTAÑA CUMPLIMIENTO
     ========================================================= */
  const FC={desde:'',hasta:'',linea:''};

  function pintarCumplimiento(cont){
    if(!fechaOk(FC.desde)||!fechaOk(FC.hasta)){
      const hoy=G().diaOperativo(ahoraMs());
      FC.desde=lunesDe(hoy);FC.hasta=hoy;
    }
    cont.innerHTML='<div class="plan-bar"><label>Desde<input type="date" id="cu-desde" value="'+esc(FC.desde)+'"></label>'+
      '<label>Hasta<input type="date" id="cu-hasta" value="'+esc(FC.hasta)+'"></label>'+
      '<label>Línea<select id="cu-linea"><option value="">Todas</option>'+NS.lineas().map(l=>'<option value="'+esc(l.key)+'"'+(l.key===FC.linea?' selected':'')+'>'+esc(l.name)+'</option>').join('')+'</select></label>'+
      '<span style="flex:1"></span><button type="button" class="btn btn-ghost btn-sm" data-cu-excel>Exportar a Excel</button></div>'+
      '<div id="cu-cuerpo"></div>'+
      '<p class="plan-nota">Cumplimiento = producido ÷ programado (GlacialIndicadores.cumplimiento). Producido: turno en curso = Paletas; turno cerrado = registro del turno. «Sin registro»: turnos cerrados sin registro del supervisor (no suman al producido).</p>';
    pintarCuerpoCumplimiento();
  }

  /* Reúne programado y producido por línea, día y turno dentro del rango. */
  function calcularCumplimiento(){
    const items=NS.programaciones().filter(p=>p&&fechaOk(p.fecha)&&p.fecha>=FC.desde&&p.fecha<=FC.hasta&&(!FC.linea||p.linea===FC.linea)&&num(p.cantidadProgramada)>0);
    // Por BLOQUE: un producto con filas en Día e Intermedio suma su programado y su producido se cuenta UNA vez
    // (glacialProducidoVigente ya devuelve lo producido por todo el bloque).
    const bloques=new Map();
    items.filter(p=>NS.estadoDe(p)!=='CANCELADA').forEach(p=>{
      const bl=NS.valorBloque(p.turno),k=[p.linea,p.fecha,bl,p.marca,p.presentacion].join('|');
      const o=bloques.get(k);
      if(o)o.programado+=G().programadoVigente([p]);else bloques.set(k,{p,bloque:bl,programado:G().programadoVigente([p])});
    });
    const detalle=[...bloques.values()].map(o=>{
      const p=o.p;
      const prod=typeof window.glacialProducidoVigente==='function'?window.glacialProducidoVigente(p):null;
      // Compromiso original (64): el plan al INICIAR el bloque. Sin documento = no hubo reprogramación registrada → original = vigente.
      const orig=typeof NS.originalDe==='function'?NS.originalDe(p.fecha,o.bloque,p.linea,p.marca,p.presentacion):null;
      return {linea:p.linea,fecha:p.fecha,turno:o.bloque,marca:p.marca,presentacion:p.presentacion,
        programado:o.programado,original:orig===null?o.programado:orig,reprogramado:orig!==null&&orig!==o.programado,producido:prod,semana:lunesDe(p.fecha)};
    });
    // Productos que estaban en el compromiso original y YA NO están en el plan vigente: su incumplimiento no se oculta.
    if(typeof NS.compromisos==='function')NS.compromisos().forEach(c=>{
      if(!fechaOk(c.fecha)||c.fecha<FC.desde||c.fecha>FC.hasta)return;
      const por=new Map();
      (c.filas||[]).forEach(f=>{
        if(FC.linea&&f.linea!==FC.linea)return;
        const k=[f.linea,c.fecha,c.bloque,f.marca,f.presentacion].join('|');
        if(bloques.has(k))return;
        const o=por.get(k)||{f,cant:0};o.cant+=num(f.cantidad);por.set(k,o);
      });
      por.forEach(o=>{
        const f=o.f,prod=typeof window.glacialProducidoVigente==='function'?window.glacialProducidoVigente({linea:f.linea,fecha:c.fecha,turno:c.bloque,marca:f.marca,presentacion:f.presentacion}):null;
        detalle.push({linea:f.linea,fecha:c.fecha,turno:c.bloque,marca:f.marca,presentacion:f.presentacion,programado:0,original:o.cant,reprogramado:true,producido:prod,semana:lunesDe(c.fecha)});
      });
    });
    const hayReprogramacion=detalle.some(d=>d.reprogramado);
    const sumar=(clave)=>{
      const m=new Map();
      detalle.forEach(d=>{
        const k=clave(d),o=m.get(k)||{clave:k,programado:0,original:0,producido:0,sinRegistro:0};
        o.programado+=d.programado;o.original+=d.original;
        if(d.producido===null)o.sinRegistro++;else o.producido+=d.producido;
        m.set(k,o);
      });
      return [...m.values()].sort((a,b)=>String(a.clave).localeCompare(String(b.clave),'es'));
    };
    return {detalle,hayReprogramacion,porLinea:sumar(d=>d.linea),porDia:sumar(d=>d.fecha),porSemana:sumar(d=>d.semana)};
  }
  const color=c=>{
    const t=typeof window.glacialMetasIndicadores==='function'?window.glacialMetasIndicadores():G().METAS_INICIALES;
    return G().colorSegunMeta(c==null?null:c*100,t.cumplimiento);
  };
  const FONDOS={verde:'#e1f4e8',ambar:'#fff4d6',roja:'#fde6e6',gris:'#f1f4f6'};

  function tablaCumplimiento(titulo,filas,etiqueta,conOriginal){
    const total=filas.reduce((a,f)=>({programado:a.programado+f.programado,original:a.original+f.original,producido:a.producido+f.producido,sinRegistro:a.sinRegistro+f.sinRegistro}),{programado:0,original:0,producido:0,sinRegistro:0});
    const pct=c=>c==null?'—':(c*100).toLocaleString('es-PE',{maximumFractionDigits:1})+' %';
    const fila=(nombre,f,negrita)=>{
      const c=G().cumplimiento(f.producido,f.programado),co=G().cumplimiento(f.producido,f.original);
      return '<tr><td>'+(negrita?'<b>'+esc(nombre)+'</b>':esc(nombre))+'</td><td class="num">'+f.programado.toLocaleString('es-PE')+'</td>'+
        (conOriginal?'<td class="num">'+f.original.toLocaleString('es-PE')+'</td>':'')+'<td class="num">'+f.producido.toLocaleString('es-PE')+'</td>'+
        '<td class="num" style="background:'+FONDOS[color(c)]+'"><b>'+pct(c)+'</b></td>'+
        (conOriginal?'<td class="num" style="background:'+FONDOS[color(co)]+'"><b>'+pct(co)+'</b></td>':'')+'<td class="num">'+(f.sinRegistro?f.sinRegistro+' sin registro':'')+'</td></tr>';
    };
    const nc=conOriginal?7:5;
    return '<h4 style="margin:14px 0 6px;color:#003b5c">'+titulo+'</h4><div class="plan-scroll"><table class="plan-tabla"><thead><tr><th>'+etiqueta+'</th><th class="num">Programado vigente</th>'+(conOriginal?'<th class="num">Original al inicio</th>':'')+'<th class="num">Producido</th><th class="num">Cumplimiento vigente</th>'+(conOriginal?'<th class="num">Cumplimiento vs original</th>':'')+'<th class="num">Avisos</th></tr></thead><tbody>'+
      (filas.length?filas.map(f=>fila(etiqueta==='Línea'?NS.nombreLinea(f.clave):etiqueta==='Semana'?'Semana del '+f.clave:f.clave,f)).join('')+fila('Total',total,true):'<tr><td colspan="'+nc+'">Sin programaciones en el rango.</td></tr>')+'</tbody></table></div>';
  }
  function pintarCuerpoCumplimiento(){
    const cont=document.getElementById('cu-cuerpo');
    if(!cont)return;
    if(FC.hasta<FC.desde){cont.innerHTML='<p class="plan-error">La fecha «hasta» no puede ser anterior a «desde».</p>';return;}
    const r=calcularCumplimiento();
    cont.innerHTML=(r.hayReprogramacion?'<p class="plan-nota"><b>Hay reprogramación:</b> «Original al inicio» es el plan al iniciar cada bloque (lo cambiado antes del inicio es planificación); «vigente» es el plan de hoy. Un incumplimiento no desaparece al reprogramar.</p>':'')+
      tablaCumplimiento('Por línea',r.porLinea,'Línea',r.hayReprogramacion)+tablaCumplimiento('Por día',r.porDia,'Día',r.hayReprogramacion)+tablaCumplimiento('Por semana',r.porSemana,'Semana',r.hayReprogramacion);
  }

  function exportarCumplimiento(){
    if(typeof XLSX==='undefined'){alert('No se cargó la librería de Excel.');return;}
    const r=calcularCumplimiento();
    const pct=(p,g)=>{const c=G().cumplimiento(p,g);return c==null?'':+(c*100).toFixed(1);};
    const hoja=(cab,filas,nombre)=>{const ws=XLSX.utils.aoa_to_sheet([cab].concat(filas));ws['!cols']=cab.map(()=>({wch:18}));return [ws,nombre];};
    const resumen=(clave,fn)=>r[clave].map(f=>[fn(f.clave),f.programado,f.original,f.producido,pct(f.producido,f.programado),pct(f.producido,f.original),f.sinRegistro]);
    const libro=XLSX.utils.book_new();
    const cab=['Programado vigente','Original al inicio','Producido','Cumplimiento vigente %','Cumplimiento vs original %','Turnos sin registro'];
    [hoja(['Línea'].concat(cab),resumen('porLinea',NS.nombreLinea),'Por línea'),
     hoja(['Día'].concat(cab),resumen('porDia',x=>x),'Por día'),
     hoja(['Semana (lunes)'].concat(cab),resumen('porSemana',x=>x),'Por semana'),
     hoja(['Fecha','Turno','Línea','Marca','Presentación','Programado vigente','Original al inicio','Producido','Cumplimiento vigente %','Cumplimiento vs original %','Reprogramado'],
       r.detalle.map(d=>[d.fecha,NS.etiquetaBloque(d.turno),NS.nombreLinea(d.linea),d.marca,NS.etiquetaPresentacion(d.linea,d.marca,d.presentacion),d.programado,d.original,d.producido===null?'sin registro':d.producido,d.producido===null?'':pct(d.producido,d.programado),d.producido===null?'':pct(d.producido,d.original),d.reprogramado?'sí':'']),'Detalle')
    ].forEach(([ws,n])=>XLSX.utils.book_append_sheet(libro,ws,n));
    XLSX.writeFile(libro,'cumplimiento-programacion-'+FC.desde+'_'+FC.hasta+'.xlsx');
  }

  document.addEventListener('click',e=>{
    const raiz=e.target.closest&&e.target.closest('#plan-root');
    if(raiz&&NS.estado.tab==='cumplimiento'&&e.target.closest('[data-cu-excel]'))exportarCumplimiento();
  });
  document.addEventListener('change',e=>{
    const t=e.target;
    if(!t||!t.closest||!t.closest('#plan-root')||NS.estado.tab!=='cumplimiento')return;
    if(t.id==='cu-desde'&&fechaOk(t.value))FC.desde=t.value;
    else if(t.id==='cu-hasta'&&fechaOk(t.value))FC.hasta=t.value;
    else if(t.id==='cu-linea')FC.linea=t.value;
    else return;
    pintarCuerpoCumplimiento();
  });

  NS.pestanas.push({clave:'cumplimiento',titulo:'Cumplimiento',orden:5,pintar:pintarCumplimiento,actualizar:pintarCuerpoCumplimiento});
})();
