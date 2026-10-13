/* =============================================================
   PLANIFICACIÓN · MODOS DE PROGRAMACIÓN, META ENTRE BLOQUES, TODO EL TURNO Y ESTADO DEL PLAN

   Tres modos, guardados como DATO ESTRUCTURADO en la misma fila de sync/programaciones (sin migración: una fila sin «modo» es Cantidad fija):
     FIJA        cantidad fija en UND (como siempre).
     COMPLETAR   «Completar cantidad»: una META compartida entre bloques. El bloque de destino guarda el SALDO asignado, no la meta:
                 saldo = máx(0, meta − producción confirmada vinculada). Se alimenta del CIERRE CONFIRMADO de otro bloque (registro del
                 supervisor FINALIZADO) del MISMO producto (línea, marca y presentación normalizadas). Sin cierre confirmado: «Pendiente de cierre»
                 (no se asume cero). Un cierre válido con cero producido se distingue de un cierre ausente. Cada cierre se vincula a una meta UNA vez
                 (clave línea|fecha|bloque|marca|presentación) y la suma de lo asignado a distintas metas no puede exceder lo producido.
                 Mañana + Intermedio es UN bloque: sus registros se cuentan una vez (deduplicados por id).
     TURNO       «Todo el turno»: estimación por ratio NOMINAL durante el tiempo productivo del bloque (duración − unión de ventanas − preparaciones).
                 Se guarda la intención y la cifra estimada con la versión de parámetros; NO es un pedido firme ni se completa al alcanzar la cifra:
                 sigue vigente hasta el cierre/finalización confirmados. Con otra marca en la línea, la estimación pasa a «tiempo restante».
   ESTADO DEL PLAN (cumplimiento) es distinto del estado OPERATIVO de la línea: «Completada» = producción confirmada ≥ cantidad del bloque; no pulsa
   Finalizar/Detener/Reanudar. Datos ausentes o no confirmados nunca marcan Completada.
   Nada de esto crea paradas oficiales ni toca el ratio real.
   Cargar después de 65d-planificacion-semanal.js (usa el motor 65b, 65a y 65).
   ============================================================= */
(function(){
  'use strict';
  const NS=window.glacialPlanificacion;
  if(!NS||!NS.motor)return;
  const {num,norm,esc,fechaOk,ahoraMs,addDias}=NS.util;
  const M=NS.modos={};
  const fmt=n=>num(n).toLocaleString('es-PE');
  const hm=m=>typeof NS.textoDuracion==='function'?NS.textoDuracion(m):Math.round(m)+' min';

  M.MODOS={FIJA:'Cantidad fija',COMPLETAR:'Completar cantidad',TURNO:'Todo el turno'};
  M.modoDe=item=>item&&M.MODOS[item.modo]?item.modo:'FIJA';          // lo antiguo (sin modo) es Cantidad fija
  M.ALCANCES={TODO_TURNO:'Todo el turno',TIEMPO_RESTANTE:'Producir durante el tiempo restante'};

  /* ---------- bloques ---------- */
  const bl=b=>NS.valorBloque(b);
  /* Orden cronológico de un bloque: Día + Intermedio de una fecha va antes que la Noche que arranca ese mismo día. */
  M.ordenBloque=(fecha,bloque)=>String(fecha)+'|'+(bl(bloque)==='NOCHE'?'1':'0');
  M.bloqueAnterior=(fecha,bloque)=>bl(bloque)==='NOCHE'?{fecha,bloque:'DÍA'}:{fecha:addDias(fecha,-1),bloque:'NOCHE'};
  M.claveCierre=(linea,fecha,bloque,marca,pres)=>[linea,fecha,bl(bloque),marca,pres].join('|');
  M.etiquetaBloque=b=>NS.etiquetaBloque(b);

  /* ---------- CIERRE CONFIRMADO de un producto en un bloque ---------- */
  /* o: {registros, linea, fecha, bloque, marca, presentacion}. Estados:
       SIN_CIERRE / PENDIENTE_CIERRE → «Pendiente de cierre» (producido null: no es cero);
       NO_IDENTIFICABLE → hay cierre pero algún cuadro con producción no dice marca y presentación: no se inventa la cantidad;
       CONFIRMADO → producido (puede ser 0 y es un cierre válido; productoEnCierre dice si el producto aparece). */
  M.cierreReferencia=function(o){
    const bloque=bl(o.bloque),marca=norm(o.marca),pres=norm(o.presentacion);
    const vistos=new Map();
    (o.registros||[]).forEach(r=>{
      if(!r||r.linea!==o.linea||r.fecha!==o.fecha||bl(r.turno)!==bloque)return;
      const k=r.id||JSON.stringify([r.turno,r.creadoEn,r.actualizadoEn]);
      if(!vistos.has(k))vistos.set(k,r);                       // Día e Intermedio comparten reporte: un registro se cuenta una sola vez
    });
    const lista=[...vistos.values()],ids=[...vistos.keys()];
    if(!lista.length)return {estado:'SIN_CIERRE',texto:'Pendiente de cierre',producido:null,registros:[]};
    if(lista.some(r=>r.estadoRegistro!=='FINALIZADO'))return {estado:'PENDIENTE_CIERRE',texto:'Pendiente de cierre',producido:null,registros:ids};
    let suma=0,hay=false,ambiguo=false;
    lista.forEach(r=>{
      (typeof normalizarCuadros==='function'?normalizarCuadros(r):(r.cuadros||[])).forEach(q=>{
        const ef=num(q&&q.produccion&&q.produccion.efectiva),m=norm(q&&q.marca),p=norm(q&&q.presentacion);
        if(!m||!p){if(ef>0)ambiguo=true;return;}
        if(m===marca&&p===pres){suma+=ef;hay=true;}
      });
    });
    const actualizadoEn=Math.max(0,...lista.map(r=>num(r.actualizadoEn)));
    if(ambiguo)return {estado:'NO_IDENTIFICABLE',texto:'El cierre no permite identificar el producto con certeza',producido:null,registros:ids,actualizadoEn};
    return {estado:'CONFIRMADO',texto:'Cierre confirmado',producido:suma,productoEnCierre:hay,registros:ids,actualizadoEn};
  };
  M.registros=()=>{try{return (typeof loadRecords==='function'?loadRecords():[])||[];}catch(_){return [];}};

  /* ---------- asignaciones de un cierre a metas ---------- */
  /* Suma de lo ya asignado de ese cierre a OTRAS metas (no a la meta metaId). items: filas de sync/programaciones. */
  M.asignadoDeCierre=function(items,clave,metaId){
    let s=0;const vistos=new Set();
    (items||[]).forEach(p=>{
      const m=p&&p.meta;if(!m||!Array.isArray(m.vinculos)||m.id===metaId)return;
      m.vinculos.forEach(v=>{const k=m.id+'|'+v.cierre;if(v.cierre===clave&&!vistos.has(k)){vistos.add(k);s+=num(v.asignado);}});
    });
    return s;
  };
  /* Saldo de la meta: máx(0, meta − suma de lo asignado). Cada cierre cuenta UNA vez por meta. */
  M.saldoMeta=function(total,vinculos){
    const por=new Map();(vinculos||[]).forEach(v=>{if(v&&v.cierre&&!por.has(v.cierre))por.set(v.cierre,num(v.asignado));});
    const asignado=[...por.values()].reduce((a,b)=>a+b,0);
    return {total:num(total),asignado,saldo:Math.max(0,num(total)-asignado),completada:num(total)>0&&num(total)-asignado<=0,sobre:Math.max(0,asignado-num(total))};
  };

  /* Planifica un «Completar cantidad». o: {linea,marca,presentacion,fecha,bloque (destino), metaTotal, ref:{fecha,bloque}, cantidadVinculada?, referencia, items, registros, destinoClave, metaIdActual?}
     Devuelve {ok, errores[], avisos[], estado, cierre, elegible, vinculos, saldo, completada, metaId, metaTotal}. No escribe nada. */
  M.planCompletar=function(o){
    const errores=[],avisos=[],r={ok:false,errores,avisos,estado:'INVALIDO',vinculos:[],saldo:null,completada:false};
    const items=o.items||[];
    // referencia previa: una fila del bloque de referencia que ya pertenece a una meta del mismo producto → se CONTINÚA esa meta
    const refFila=items.find(p=>p&&p.linea===o.linea&&p.fecha===(o.ref||{}).fecha&&bl(p.turno)===bl((o.ref||{}).bloque)&&p.marca===o.marca&&p.presentacion===o.presentacion&&p.meta&&p.meta.id&&NS.estadoDe(p)!=='CANCELADA')||null;
    const metaId=(refFila&&refFila.meta.id)||o.metaIdActual||('meta_'+ahoraMs().toString(36)+Math.random().toString(36).slice(2,6));
    const total=refFila?num(refFila.meta.total):num(o.metaTotal);
    r.metaId=metaId;r.metaTotal=total;r.continua=!!refFila;
    if(!Number.isInteger(total)||total<=0)errores.push('La meta total debe ser un entero mayor que cero (UND).');
    if(!o.ref||!fechaOk(o.ref.fecha))errores.push('Elige la fecha del cierre de referencia.');
    if(!errores.length){
      if(M.ordenBloque(o.ref.fecha,o.ref.bloque)>=M.ordenBloque(o.fecha,o.bloque))errores.push('El cierre de referencia debe ser anterior al bloque de destino (no se vincula a sí mismo ni a un cierre posterior).');
    }
    if(errores.length)return r;
    const cierre=M.cierreReferencia({registros:o.registros,linea:o.linea,fecha:o.ref.fecha,bloque:o.ref.bloque,marca:o.marca,presentacion:o.presentacion});
    r.cierre=cierre;r.estado=cierre.estado;
    if(cierre.estado!=='CONFIRMADO'){errores.push(cierre.texto+(cierre.estado==='SIN_CIERRE'||cierre.estado==='PENDIENTE_CIERRE'?': el saldo no es definitivo hasta que el supervisor cierre ese bloque.':'.'));return r;}
    const clave=M.claveCierre(o.linea,o.ref.fecha,o.ref.bloque,o.marca,o.presentacion);
    const otras=M.asignadoDeCierre(items,clave,metaId);
    const elegible=Math.max(0,cierre.producido-otras);
    r.elegible=elegible;r.otrasMetas=otras;r.claveCierre=clave;
    const usar=o.cantidadVinculada===undefined||o.cantidadVinculada===null||o.cantidadVinculada===''?elegible:Number(o.cantidadVinculada);
    if(!Number.isInteger(usar)||usar<0)errores.push('La cantidad vinculada debe ser un entero de cero o más.');
    else if(usar>elegible)errores.push('La cantidad vinculada ('+fmt(usar)+') excede la producción elegible del cierre ('+fmt(elegible)+'): '+fmt(otras)+' UND de ese cierre ya están asignadas a otra meta.');
    if(errores.length)return r;
    if(!cierre.productoEnCierre)avisos.push('El cierre es válido pero no registra este producto: se toma como 0 UND producidas.');
    // vínculos: los de la meta que se continúa (cada cierre una sola vez) + este cierre
    const previos=refFila?refFila.meta.vinculos.map(v=>Object.assign({},v)):[];
    const mapa=new Map(previos.map(v=>[v.cierre,v]));
    // si la fila de referencia ya es parte de la meta, su propio bloque también cuenta (lo producido de su saldo)
    mapa.set(clave,{id:'v_'+clave.replace(/[^a-z0-9]/gi,'').slice(-24)+'_'+(mapa.size+1),cierre:clave,fecha:o.ref.fecha,bloque:bl(o.ref.bloque),producido:cierre.producido,asignado:usar,cierreActualizadoEn:cierre.actualizadoEn||0});
    r.vinculos=[...mapa.values()];
    const s=M.saldoMeta(total,r.vinculos);
    r.saldo=s.saldo;r.completada=s.completada;r.asignado=s.asignado;r.sobre=s.sobre;
    if(s.sobre>0)avisos.push('La producción vinculada supera la meta en '+fmt(s.sobre)+' UND: no se programan cantidades negativas.');
    if(r.completada)avisos.push('Meta completada: no hay saldo por programar.');
    r.ok=true;
    return r;
  };

  /* ---------- TODO EL TURNO: estimación por ratio nominal ---------- */
  /* Estima la producción de UN producto durante el tiempo productivo del bloque con el motor de la etapa 4.
     alcance TODO_TURNO: la línea no puede tener otro producto activo en el bloque (no se reserva el bloque completo para dos productos).
     alcance TIEMPO_RESTANTE: descuenta cantidades fijas, cambios y ventanas de los demás productos.
     Estados: OK (cantidad entera, sin superar el tiempo), PENDIENTE (falta el ratio), PARCIAL (faltan otros datos: se dice cuáles y no se inventa), CONFLICTO, SIN_TIEMPO. */
  M.estimarTodoTurno=function(o){
    const alcance=o.alcance==='TIEMPO_RESTANTE'?'TIEMPO_RESTANTE':'TODO_TURNO';
    const clave=[o.marca,o.presentacion].join('|');
    const otros=(o.items||[]).filter(p=>p&&p.linea===o.linea&&p.fecha===o.fecha&&bl(p.turno)===bl(o.bloque)&&NS.estadoDe(p)!=='CANCELADA'&&num(p.cantidadProgramada)>0&&[p.marca,p.presentacion].join('|')!==clave);
    const base={alcance,estado:'PENDIENTE',cantidad:null,otros:otros.map(p=>({marca:p.marca,presentacion:p.presentacion,cantidad:num(p.cantidadProgramada),modo:M.modoDe(p),alcance:p.alcance||''}))};
    if(alcance==='TODO_TURNO'&&otros.length){base.estado='CONFLICTO';base.motivo='La línea ya tiene otro producto en este bloque: «Todo el turno» no puede reservar el bloque completo para dos productos. Cambia a «Producir durante el tiempo restante» o asigna cantidades.';return base;}
    const conTurno=otros.find(p=>M.modoDe(p)==='TURNO'&&(p.alcance||'TODO_TURNO')==='TODO_TURNO');
    if(conTurno){base.estado='CONFLICTO';base.motivo='«'+conTurno.marca+'» ya ocupa todo el turno en esta línea: primero cámbialo a «Producir durante el tiempo restante».';return base;}
    const vel=num(o.velocidad);
    if(!(vel>0)){base.motivo='Falta la velocidad estándar (ratio nominal) de este producto: no se puede estimar.';base.faltantes=[{dato:'velocidad estándar'}];return base;}
    const filas=otros.map(p=>({marca:p.marca,presentacion:p.presentacion,cantidad:num(p.cantidadProgramada),estado:NS.estadoDe(p)})).concat([{marca:o.marca,presentacion:o.presentacion,cantidad:1,estado:'PENDIENTE'}]);
    const e=NS.entradaMotor(o.fecha,o.bloque,o.linea,filas);
    const c=NS.motor.capacidad(e);
    if(!c){base.motivo='No hay datos del bloque.';return base;}
    const min1=1/vel*60;
    const conocido=c.requeridoMin-min1;                       // lo que ocupan los demás productos y las preparaciones conocidas
    const prod=c.disponibleMin-conocido;
    Object.assign(base,{disponibleMin:c.disponibleMin,duracionMin:c.duracionMin,ventanasMin:c.indisponibleMin,preparacionMin:c.preparacionMin,otrosMin:Math.max(0,c.produccionMin-min1),velocidad:vel,
      parametrosVersion:c.parametrosVersion,faltantes:c.faltantes,notas:c.notas,tiempoProdMin:prod});
    if(c.faltantes.length){
      base.estado='PARCIAL';
      base.motivo='Estimación parcial: falta '+c.faltantes.map(f=>f.dato).join('; ')+'. No se inventa el valor.';
      base.cotaSuperior=prod>0?Math.floor(prod/60*vel+1e-9):0;     // informativa: lo máximo si lo que falta fuera 0 (NO se guarda)
      return base;
    }
    if(!(prod>0)){base.estado='SIN_TIEMPO';base.cantidad=0;base.motivo='No queda tiempo productivo en el bloque (ventanas, preparaciones y otros productos ocupan todo el tiempo).';return base;}
    base.estado='OK';
    base.cantidad=Math.floor(prod/60*vel+1e-9);               // UND enteras sin superar el tiempo calculado
    return base;
  };
  M.estimadoGuardado=(est,usuario)=>({cantidad:est.cantidad,ratio:est.velocidad,tiempoProdMin:Math.round(est.tiempoProdMin*10)/10,duracionMin:est.duracionMin,ventanasMin:est.ventanasMin,preparacionMin:est.preparacionMin,
    otrosMin:Math.round(num(est.otrosMin)*10)/10,parametrosVersion:num(est.parametrosVersion),calculadoEn:ahoraMs(),por:usuario||''});

  /* Conflicto al agregar otro producto a una línea cuyo bloque está reservado «Todo el turno». Devuelve el texto o ''. */
  M.conflictoConTurno=function(items,o){
    const clave=[o.marca,o.presentacion].join('|');
    const t=(items||[]).find(p=>p&&p.linea===o.linea&&p.fecha===o.fecha&&bl(p.turno)===bl(o.bloque)&&NS.estadoDe(p)!=='CANCELADA'&&num(p.cantidadProgramada)>0&&M.modoDe(p)==='TURNO'&&(p.alcance||'TODO_TURNO')==='TODO_TURNO'&&[p.marca,p.presentacion].join('|')!==clave);
    return t?'Esta línea ya tiene «Todo el turno» para '+t.marca+': dos productos no pueden ocupar el bloque completo. Edita ese producto y cámbialo a «Producir durante el tiempo restante» antes de agregar otro.':'';
  };

  /* ---------- ESTADO DEL PLAN (cumplimiento) frente al estado operativo ---------- */
  const claseOperativa=e=>e==='EN_PRODUCCION'?'est-curso':e==='PAUSA'?'est-pausa':(e==='DETENIDA'||e==='LISTA')?'est-det':e==='FINALIZADA'?'est-fin':e==='CANCELADA'?'est-canc':'est-pend';
  M.claseOperativa=claseOperativa;
  /* p: fila de programación; g: grupo del resumen del bloque ({programado,producido|null,...}). */
  M.estadoPlan=function(p,g){
    const modo=M.modoDe(p),est=NS.estadoDe(p);
    const operativo={texto:NS.estadoTexto(est),cls:claseOperativa(est)};
    const prog=g&&g.programado>0?g.programado:num(p.cantidadProgramada),prod=g?g.producido:null;
    const r={modo,operativo,cumplida:false,clave:'',texto:operativo.texto,cls:operativo.cls,nota:''};
    if(est==='CANCELADA'){r.clave='CANCELADA';return r;}
    if(modo==='TURNO'){
      // Todo el turno: no se completa por alcanzar el estimado; sigue vigente hasta la finalización/cierre confirmado.
      if(est==='FINALIZADA'){r.clave='FINALIZADA';r.texto='Finalizada';r.cls='est-fin';r.nota='Cerrada: la cifra estimada es solo informativa.';}
      else{r.clave='VIGENTE';r.nota=prod!==null&&prod>=prog?'Alcanzó el estimado y sigue vigente hasta el cierre confirmado.':'Vigente hasta el cierre confirmado (el estimado es informativo).';}
      return r;
    }
    if(prod!==null&&prog>0&&prod>=prog){r.cumplida=true;r.clave='COMPLETADA';r.texto='Completada';r.cls='est-fin';r.nota='Cumplimiento del plan: es distinto del estado de la línea ('+operativo.texto+').';return r;}
    if(est==='FINALIZADA'&&prod!==null&&prog>0){r.clave='FINALIZADA_CON_SALDO';r.texto='Finalizada con saldo '+fmt(prog-prod)+' UND';r.cls='est-curso';r.nota='Se finalizó sin alcanzar la cantidad del plan.';return r;}
    r.clave=est;
    return r;
  };
  /* Avance de la META global de un «Completar cantidad»: (lo vinculado de bloques anteriores + lo producido en este bloque) frente a la meta. */
  M.avanceMeta=function(p,g){
    const m=p&&p.meta;if(!m||M.modoDe(p)!=='COMPLETAR')return null;
    const previo=M.saldoMeta(m.total,m.vinculos).asignado,prod=g&&g.producido!==null&&g.producido!==undefined?g.producido:null;
    return {total:num(m.total),previo,bloque:prod,acumulado:prod===null?null:previo+prod,pct:prod===null||!(m.total>0)?null:(previo+prod)/m.total,
      cumplida:prod!==null&&previo+prod>=m.total};
  };
  /* Revisión: ¿el cierre de referencia cambió después de aplicar el saldo? Devuelve [{cierre,fecha,bloque,antes,ahora,motivo}] (aviso y propuesta; nunca reescribe). */
  M.revisionesDe=function(p,registros){
    const m=p&&p.meta;if(!m||!Array.isArray(m.vinculos)||M.modoDe(p)!=='COMPLETAR')return [];
    const sal=[];
    m.vinculos.forEach(v=>{
      const partes=String(v.cierre).split('|');
      const c=M.cierreReferencia({registros,linea:partes[0],fecha:v.fecha,bloque:v.bloque,marca:partes[3],presentacion:partes[4]});
      if(c.estado==='CONFIRMADO'&&c.producido!==num(v.producido))sal.push({cierre:v.cierre,fecha:v.fecha,bloque:v.bloque,antes:num(v.producido),ahora:c.producido,motivo:'El cierre se corrigió'});
      else if(c.estado!=='CONFIRMADO')sal.push({cierre:v.cierre,fecha:v.fecha,bloque:v.bloque,antes:num(v.producido),ahora:null,motivo:c.texto});
    });
    return sal;
  };
  /* Revisión de «Todo el turno»: el estimado guardado frente al de hoy (la cifra guardada NO se reescribe en silencio). */
  M.revisionTurno=function(p,items){
    if(!p||M.modoDe(p)!=='TURNO'||!p.estimado)return null;
    const hoy=M.estimarTodoTurno({linea:p.linea,fecha:p.fecha,bloque:p.turno,marca:p.marca,presentacion:p.presentacion,alcance:p.alcance,items:(items||NS.programaciones()),velocidad:typeof NS.velocidadDe==='function'?NS.velocidadDe(p.linea,p.presentacion,p.marca):0});
    if(hoy.estado!=='OK')return {estado:hoy.estado,guardado:num(p.estimado.cantidad),hoy:null,cambio:false};
    return {estado:'OK',guardado:num(p.estimado.cantidad),hoy:hoy.cantidad,cambio:hoy.cantidad!==num(p.estimado.cantidad),version:hoy.parametrosVersion,versionGuardada:num(p.estimado.parametrosVersion)};
  };

  /* ---------- HTML para la tabla ---------- */
  M.htmlSubproducto=function(p,g){
    const modo=M.modoDe(p);
    if(modo==='COMPLETAR'&&p.meta){
      const s=M.saldoMeta(p.meta.total,p.meta.vinculos),ref=(p.meta.vinculos||[]).slice(-1)[0];
      const rev=M.revisionesDe(p,M.registros());
      return '<span class="plan-modo plan-modo-c">Completar cantidad</span><small class="plan-subt">Meta '+fmt(p.meta.total)+' · Cierre anterior '+fmt(s.asignado)+' · Saldo del bloque '+fmt(p.cantidadProgramada)+'</small>'+
        (p.meta.referencia?'<small class="plan-subt">Ref.: '+esc(p.meta.referencia)+'</small>':'')+
        (ref?'<small class="plan-subt">Cierre de referencia: '+esc(ref.fecha)+' · '+esc(M.etiquetaBloque(ref.bloque))+'</small>':'')+
        rev.map(x=>'<small class="plan-subt plan-warn">⚠ '+esc(x.motivo)+' ('+esc(x.fecha)+' · '+esc(M.etiquetaBloque(x.bloque))+')'+(x.ahora!==null?': antes '+fmt(x.antes)+', ahora '+fmt(x.ahora):'')+' — revisa el saldo con «Editar».</small>').join('');
    }
    if(modo==='TURNO'){
      const r=M.revisionTurno(p),e=p.estimado;
      return '<span class="plan-modo plan-modo-t">Todo el turno</span><small class="plan-subt">Meta estimada según ratio nominal'+(e&&e.ratio?' ('+fmt(e.ratio)+' UND/h)':'')+(p.alcance==='TIEMPO_RESTANTE'?' · durante el tiempo restante':'')+'</small>'+
        (r&&r.cambio?'<small class="plan-subt plan-warn">⚠ Con los parámetros de hoy serían '+fmt(r.hoy)+' UND (guardado: '+fmt(r.guardado)+'). Revísalo con «Editar».</small>':'');
    }
    return '';
  };
  M.htmlEstadoPlan=function(p,g,mostrarNota){
    const e=M.estadoPlan(p,g),am=M.avanceMeta(p,g);
    let h='<span class="plan-badge '+e.cls+'">'+esc(e.texto)+'</span>';
    if(am)h+='<small class="plan-subt">Meta global: '+(am.pct===null?'sin registro':Math.round(am.pct*100)+' % ('+fmt(am.acumulado)+' de '+fmt(am.total)+')')+'</small>';
    if(e.cumplida||e.clave==='FINALIZADA_CON_SALDO')h+='<small class="plan-subt">Línea: '+esc(e.operativo.texto)+'</small>';
    if(e.modo==='TURNO'&&mostrarNota!==false)h+='<small class="plan-subt">'+esc(e.nota)+'</small>';
    return h;
  };
  /* Conteos para las tarjetas de resumen del bloque. */
  M.resumenModos=function(items){
    const act=(items||[]).filter(p=>NS.estadoDe(p)!=='CANCELADA');
    return {metas:new Set(act.filter(p=>M.modoDe(p)==='COMPLETAR'&&p.meta).map(p=>p.meta.id)).size,turno:act.filter(p=>M.modoDe(p)==='TURNO').length};
  };

  /* ---------- guardado ---------- */
  const guardando=new Set();
  const quien=()=>(typeof state!=='undefined'&&state.user&&(state.user.nombre||state.user.username))||'';
  /* Valida DENTRO de la transacción con las filas más recientes (otra persona pudo asignar el mismo cierre mientras se revisaba). */
  function validadorLista(extra,fila){
    return actuales=>{
      if(extra.modo==='COMPLETAR'&&extra.meta){
        const clave=NS.clave(fila.linea,fila.fecha,NS.turnoDeGuardado(fila),fila.marca,fila.presentacion);
        const otras=actuales.filter(p=>p&&p.clave!==clave);
        extra.meta.vinculos.forEach(v=>{
          const otra=M.asignadoDeCierre(otras,v.cierre,extra.meta.id);
          const elegible=Math.max(0,num(v.producido)-otra);
          if(num(v.asignado)>elegible)throw Object.assign(new Error('El cierre del '+v.fecha+' ya fue asignado a otra meta mientras revisabas ('+fmt(otra)+' UND). Vuelve a calcular el saldo.'),{conflicto:true});
          const repetido=otras.some(p=>p&&p.meta&&p.meta.id===extra.meta.id&&(p.meta.vinculos||[]).some(x=>x.cierre===v.cierre)&&p.fecha===fila.fecha&&bl(p.turno)===bl(fila.turno));
          if(repetido)throw new Error('Este cierre ya se aplicó a esta meta en otro registro del mismo bloque.');
        });
      }
      if(extra.modo==='TURNO'&&(extra.alcance||'TODO_TURNO')==='TODO_TURNO'){
        const hay=M.conflictoConTurno(actuales,{linea:fila.linea,fecha:fila.fecha,bloque:fila.turno,marca:fila.marca,presentacion:fila.presentacion});
        const otro=actuales.some(p=>p&&p.linea===fila.linea&&p.fecha===fila.fecha&&bl(p.turno)===bl(fila.turno)&&NS.estadoDe(p)!=='CANCELADA'&&num(p.cantidadProgramada)>0&&[p.marca,p.presentacion].join('|')!==[fila.marca,fila.presentacion].join('|'));
        if(otro)throw new Error('La línea ya tiene otro producto en este bloque: «Todo el turno» no puede reservar el bloque completo. Usa «Producir durante el tiempo restante».');
        if(hay)throw new Error(hay);
      }
    };
  }
  /* Guarda un plan con su modo. fila: {linea,fecha,turno,marca,presentacion,upp}; datos: {modo, cantidad, meta?, estimado?, alcance?}; opc: {motivo, versionEsperada}.
     Protegido contra doble clic y reintento (misma clave en curso). Todo pasa por la función única guardarProgramacionPaleta (permiso, versión, historial). */
  M.guardar=async function(fila,datos,opc){
    opc=opc||{};
    if(!NS.puede())throw new Error('Solo Planificación puede crear o editar la programación.');
    const clave=NS.clave(fila.linea,fila.fecha,NS.turnoDeGuardado(fila),fila.marca,fila.presentacion);
    if(guardando.has(clave))throw new Error('Ya se está guardando esta programación: espera un momento.');
    guardando.add(clave);
    try{
      const modo=M.MODOS[datos.modo]?datos.modo:'FIJA';
      const extra={modo,meta:modo==='COMPLETAR'?datos.meta:null,estimado:modo==='TURNO'?datos.estimado:null,alcance:modo==='TURNO'?(datos.alcance==='TIEMPO_RESTANTE'?'TIEMPO_RESTANTE':'TODO_TURNO'):null};
      if(modo==='COMPLETAR'){
        if(!extra.meta||!Array.isArray(extra.meta.vinculos)||!extra.meta.vinculos.length)throw new Error('Falta la referencia del cierre.');
        if(!(num(datos.cantidad)>0))throw new Error('Meta completada: no hay saldo por programar (no se crea una orden de cantidad cero).');
      }
      if(modo==='TURNO'&&!(extra.estimado&&num(extra.estimado.cantidad)>0))throw new Error('La estimación de «Todo el turno» está incompleta: no se guarda un valor inventado.');
      // no reducir por debajo de lo ya producido
      const ex=NS.existente(fila.linea,fila.fecha,NS.turnoDeGuardado(fila),fila.marca,fila.presentacion);
      if(ex&&modo!=='FIJA'){const prod=NS.producidoDe(ex);if(prod!==null&&num(datos.cantidad)<prod)throw new Error('No se puede asignar menos de lo ya producido ('+fmt(prod)+' UND).');}
      const refTxt=modo==='COMPLETAR'?'COMPLETAR: meta '+fmt(extra.meta.total)+' · saldo '+fmt(datos.cantidad)+' · '+extra.meta.vinculos.map(v=>v.fecha+' '+v.bloque+' '+fmt(v.asignado)).join(', ')
        :modo==='TURNO'?'TODO EL TURNO: estimado '+fmt(extra.estimado.cantidad)+' UND a '+fmt(extra.estimado.ratio)+' UND/h (parámetros v'+num(extra.estimado.parametrosVersion)+')':'';
      const f=Object.assign({},fila,{cantidad:Number(datos.cantidad)});
      return await NS.guardar(f,Object.assign({},opc,{extra,validarLista:validadorLista(extra,f),referencia:refTxt||opc.referencia||'',historialExtra:{modo,meta:extra.meta?{id:extra.meta.id,total:extra.meta.total,vinculos:extra.meta.vinculos.length}:null,alcance:extra.alcance}}));
    }finally{guardando.delete(clave);}
  };

  /* ---------- sección «modo» del formulario Agregar/Editar (la monta 52) ---------- */
  const HOY=()=>NS.hoyOperativo?NS.hoyOperativo():new Date().toISOString().slice(0,10);
  M.estilos=function(){
    if(document.getElementById('plan-modos-css'))return;
    const s=document.createElement('style');s.id='plan-modos-css';
    const css=`
      #plan-root .plan-modo,.plan-dialogo .plan-modo{display:inline-block;margin:3px 0 0;padding:1px 9px;border-radius:99px;font-size:11px;font-weight:700}
      .plan-modo-c{background:#EDE9FE;color:#5B21B6}.plan-modo-t{background:#DBEAFE;color:#1E40AF}
      .plan-subt{display:block;font-size:11px;color:#5a6b78;font-weight:500;line-height:1.35}.plan-subt.plan-warn{color:#9A3412;font-weight:700}
      .pm-modos{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border:1px solid #cfdbe3;border-radius:10px;overflow:hidden;margin:0 0 12px}
      .pm-modos label{display:flex;align-items:center;justify-content:center;text-align:center;padding:9px 6px;font-size:13px;font-weight:600;cursor:pointer;background:#f4f8fb;color:#46627a;border-right:1px solid #cfdbe3;margin:0;flex-direction:row}
      .pm-modos label:last-child{border-right:0}.pm-modos input{position:absolute;opacity:0;pointer-events:none}
      .pm-modos label.on{background:#005b96;color:#fff}
      .pm-panel{border:1px solid #e3eaf0;background:#fbfdfe;border-radius:12px;padding:12px;margin:0 0 12px}
      .pm-panel h5{margin:0 0 8px;font-size:13px;color:#003b5c}.pm-res{display:grid;gap:4px;margin-top:10px;padding:10px;border-radius:10px;background:#fff;border:1px solid #e3eaf0;font-size:13px}
      .pm-res .fila{display:flex;justify-content:space-between;gap:10px}.pm-res .grande{font-size:18px;font-weight:800;color:#005b96}
      .pm-ok{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:99px;background:#DCFCE7;color:#166534;font-size:12px;font-weight:700}
      .pm-pend{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:99px;background:#FEF9C3;color:#713F12;font-size:12px;font-weight:700}
      .pm-err{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:99px;background:#FEE2E2;color:#991B1B;font-size:12px;font-weight:700}
      .pm-info{padding:8px 10px;border-radius:8px;background:#E0F2FE;color:#075985;font-size:12px;margin-top:8px}.pm-adv{padding:8px 10px;border-radius:8px;background:#FEF3C7;color:#78350F;font-size:12px;margin-top:8px}
      @media(max-width:640px){.pm-modos{grid-template-columns:1fr}.pm-modos label{border-right:0;border-bottom:1px solid #cfdbe3}.pm-modos label:last-child{border-bottom:0}}`;
    s.textContent=css;document.head.appendChild(s);
  };
  M.htmlSelector=function(existente){
    const m=M.modoDe(existente);
    return '<div class="pm-modos" role="radiogroup" aria-label="Modo de programación">'+Object.keys(M.MODOS).map(k=>'<label class="'+(k===m?'on':'')+'"><input type="radio" name="pm-modo" value="'+k+'"'+(k===m?' checked':'')+'>'+esc(M.MODOS[k])+(k===m?' ✓':'')+'</label>').join('')+'</div>'+
      '<div id="pm-panel-c" class="pm-panel" style="display:none"></div><div id="pm-panel-t" class="pm-panel" style="display:none"></div>';
  };
  /* Monta la lógica de los paneles sobre el diálogo ya creado. ctx: {fondo,f,existente,q,refrescar}. Devuelve {leer()}: valida con los datos más recientes y arma lo que se guarda. */
  M.montar=function(ctx){
    M.estilos();
    const {fondo,f,existente,q}=ctx;
    const modoActual=()=>{const r=fondo.querySelector('input[name="pm-modo"]:checked');return r?r.value:'FIJA';};
    const destBloque=bl(f.turno);
    let calc=null;      // último cálculo del modo activo
    const campos=()=>({linea:q('pe-linea').value,marca:q('pe-marca').value,presentacion:q('pe-pres').value});
    const itemsOtros=()=>NS.programaciones().filter(p=>!existente||p.clave!==existente.clave);

    /* panel COMPLETAR */
    const prev=M.bloqueAnterior(f.fecha,destBloque);
    const mc=existente&&M.modoDe(existente)==='COMPLETAR'&&existente.meta?existente.meta:null;
    const refIni=mc&&mc.vinculos&&mc.vinculos.length?{fecha:mc.vinculos[mc.vinculos.length-1].fecha,bloque:mc.vinculos[mc.vinculos.length-1].bloque}:prev;
    const pc=fondo.querySelector('#pm-panel-c');
    pc.innerHTML='<h5>Completar cantidad con la producción confirmada de otro bloque</h5>'+
      '<div class="plan-campos"><label>Meta total entre bloques (UND)<input type="number" id="pm-meta" min="1" step="1" inputmode="numeric" value="'+esc(mc?mc.total:'')+'"></label>'+
      '<label>Bloque de destino<input type="text" readonly value="'+esc(f.fecha+' · '+M.etiquetaBloque(destBloque))+'"></label>'+
      '<label>Fecha del cierre de referencia<input type="date" id="pm-ref-fecha" value="'+esc(refIni.fecha)+'"></label>'+
      '<label>Bloque del cierre<select id="pm-ref-bloque"><option value="DÍA"'+(bl(refIni.bloque)==='DÍA'?' selected':'')+'>'+esc(M.etiquetaBloque('DÍA'))+'</option><option value="NOCHE"'+(bl(refIni.bloque)==='NOCHE'?' selected':'')+'>'+esc(M.etiquetaBloque('NOCHE'))+'</option></select></label>'+
      '<label class="completo">Cantidad vinculada a esta meta (UND) <small>(déjala vacía para usar toda la producción elegible)</small><input type="number" id="pm-vinc" min="0" step="1" inputmode="numeric"></label>'+
      '<label class="completo">Pedido o referencia (opcional)<input type="text" id="pm-referencia" maxlength="120" value="'+esc(mc?mc.referencia||'':'')+'"></label></div>'+
      '<div id="pm-c-res"></div>';
    /* panel TODO EL TURNO */
    const pt=fondo.querySelector('#pm-panel-t');
    const alcIni=existente&&M.modoDe(existente)==='TURNO'&&existente.alcance==='TIEMPO_RESTANTE'?'TIEMPO_RESTANTE':'TODO_TURNO';
    pt.innerHTML='<h5>Producir durante el bloque, sin una cantidad fija</h5>'+
      '<div class="plan-campos"><label class="completo">Alcance<select id="pm-alcance"><option value="TODO_TURNO"'+(alcIni==='TODO_TURNO'?' selected':'')+'>Todo el turno</option><option value="TIEMPO_RESTANTE"'+(alcIni==='TIEMPO_RESTANTE'?' selected':'')+'>Producir durante el tiempo restante</option></select></label></div>'+
      '<div id="pm-t-res"></div>';

    const cant=q('pe-cant'),guardarBtn=q('pe-guardar');
    const textoBoton=t=>{guardarBtn.textContent=t;};
    const pintarCompletar=()=>{
      const c=campos(),res=pc.querySelector('#pm-c-res');
      if(!c.linea||!c.marca||!c.presentacion){res.innerHTML='<div class="pm-info">Elige línea, marca y presentación.</div>';calc=null;return;}
      const vinc=pc.querySelector('#pm-vinc').value;
      calc=M.planCompletar({linea:c.linea,marca:c.marca,presentacion:c.presentacion,fecha:f.fecha,bloque:destBloque,metaTotal:pc.querySelector('#pm-meta').value,
        ref:{fecha:pc.querySelector('#pm-ref-fecha').value,bloque:pc.querySelector('#pm-ref-bloque').value},cantidadVinculada:vinc,referencia:pc.querySelector('#pm-referencia').value,
        items:itemsOtros(),registros:M.registros(),metaIdActual:mc&&mc.id});
      const metaIn=pc.querySelector('#pm-meta');
      if(calc.continua){metaIn.value=calc.metaTotal;metaIn.readOnly=true;}else metaIn.readOnly=false;
      let h='';
      const cie=calc.cierre;
      if(cie){
        h+='<div>'+(cie.estado==='CONFIRMADO'?'<span class="pm-ok">✓ Cierre confirmado</span> actualizado '+(cie.actualizadoEn?new Date(cie.actualizadoEn).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—'):
          '<span class="'+(cie.estado==='NO_IDENTIFICABLE'?'pm-err':'pm-pend')+'">'+esc(cie.texto)+'</span>')+'</div>';
      }
      if(calc.ok){
        h+='<div class="pm-res"><div class="fila"><span>Meta total'+(calc.continua?' <small>(continúa una meta existente)</small>':'')+'</span><b>'+fmt(calc.metaTotal)+' UND</b></div>'+
          '<div class="fila"><span>Producción elegible del cierre'+(calc.otrasMetas?' <small>('+fmt(calc.otrasMetas)+' ya asignadas a otra meta)</small>':'')+'</span><b>'+fmt(calc.elegible)+' UND</b></div>'+
          '<div class="fila"><span>Vinculado a esta meta</span><b>'+fmt(calc.asignado)+' UND</b></div>'+
          '<div class="fila"><span class="grande">Programar en '+esc(M.etiquetaBloque(destBloque))+'</span><span class="grande">'+fmt(calc.saldo)+' UND</span></div></div>'+
          '<div class="pm-info">24,000 es la meta compartida, no una cantidad adicional: el bloque guarda solo el saldo. Se descuenta solo el mismo producto y el cierre vinculado.</div>'+
          calc.avisos.map(a=>'<div class="pm-adv">'+esc(a)+'</div>').join('');
        cant.value=calc.saldo;
        textoBoton(calc.completada?'Meta completada':'Aplicar saldo de '+fmt(calc.saldo)+' UND');
        guardarBtn.disabled=calc.completada;
      }else{
        h+='<div class="pm-adv">'+calc.errores.map(esc).join('<br>')+'</div>';
        cant.value='';textoBoton('Aplicar saldo');guardarBtn.disabled=true;
      }
      res.innerHTML=h;
    };
    const pintarTurno=()=>{
      const c=campos(),res=pt.querySelector('#pm-t-res');
      if(!c.linea||!c.marca||!c.presentacion){res.innerHTML='<div class="pm-info">Elige línea, marca y presentación.</div>';calc=null;return;}
      const vel=typeof NS.velocidadDe==='function'?NS.velocidadDe(c.linea,c.presentacion,c.marca):0;
      const est=M.estimarTodoTurno({linea:c.linea,fecha:f.fecha,bloque:destBloque,marca:c.marca,presentacion:c.presentacion,alcance:pt.querySelector('#pm-alcance').value,items:itemsOtros(),velocidad:vel});
      calc=est;
      let h='';
      if(est.disponibleMin!==undefined){
        h+='<div class="pm-res"><div class="fila"><span>Duración del bloque</span><b>'+hm(est.duracionMin)+'</b></div><div class="fila"><span>Paradas previstas (ventanas)</span><b>'+hm(est.ventanasMin)+'</b></div>'+
          '<div class="fila"><span>Preparación'+(est.otros.length?' y cambios':'')+'</span><b>'+hm(est.preparacionMin)+'</b></div>'+(est.otrosMin>0?'<div class="fila"><span>Otros productos de la línea</span><b>'+hm(est.otrosMin)+'</b></div>':'')+
          '<div class="fila"><span>Tiempo productivo</span><b>'+hm(Math.max(0,est.tiempoProdMin))+'</b></div><div class="fila"><span>Ratio nominal</span><b>'+fmt(est.velocidad)+' UND/h</b></div>'+
          (est.estado==='OK'?'<div class="fila"><span class="grande">Producción estimada</span><span class="grande">'+fmt(est.cantidad)+' UND</span></div>':'')+'</div>';
      }
      if(est.estado==='OK'){
        h+='<div class="pm-info">Estimada según ratio nominal; no es un pedido confirmado. Alcanzar la cifra no completa el plan: sigue vigente hasta el cierre confirmado.</div>';
        cant.value=est.cantidad;textoBoton('Guardar Todo el turno');guardarBtn.disabled=false;
      }else{
        h+='<div class="pm-adv">'+esc(est.motivo||'Estimación pendiente.')+(est.cotaSuperior?' <br><small>Como referencia, sin lo que falta serían como máximo '+fmt(est.cotaSuperior)+' UND (no se guarda).</small>':'')+'</div>';
        if(est.estado==='CONFLICTO'&&pt.querySelector('#pm-alcance').value==='TODO_TURNO')h+='<div class="pm-info">«Todo el turno» y «Tiempo restante» son distintos: elegir el segundo descuenta las cantidades fijas, los cambios y las ventanas de los demás productos.</div>';
        cant.value='';textoBoton('Guardar Todo el turno');guardarBtn.disabled=true;
      }
      res.innerHTML=h;
    };
    const aplicarModo=()=>{
      const m=modoActual();
      fondo.querySelectorAll('.pm-modos label').forEach(l=>{const r=l.querySelector('input');l.classList.toggle('on',r.checked);l.lastChild.nodeValue=l.lastChild.nodeValue.replace(/ ✓$/,'')+(r.checked?' ✓':'');});
      pc.style.display=m==='COMPLETAR'?'':'none';pt.style.display=m==='TURNO'?'':'none';
      const fija=m==='FIJA';
      cant.readOnly=!fija;cant.closest('label').firstChild.nodeValue=fija?'Cantidad programada (UND)':(m==='COMPLETAR'?'Saldo asignado al bloque (UND)':'Cantidad estimada (UND)');
      if(fija){textoBoton('Guardar');guardarBtn.disabled=false;calc=null;}
      else if(m==='COMPLETAR')pintarCompletar();else pintarTurno();
    };
    fondo.addEventListener('change',e=>{
      const t=e.target;if(!t||!t.id&&t.name!=='pm-modo')return;
      if(t.name==='pm-modo'||/^pm-|^pe-(linea|marca|pres)$/.test(t.id))aplicarModo();
    });
    fondo.addEventListener('input',e=>{if(e.target&&/^pm-(meta|vinc|ref-fecha|referencia)$/.test(e.target.id)&&modoActual()==='COMPLETAR')pintarCompletar();});
    // un cambio remoto (otro dispositivo guardó o cerró) recalcula el modo activo sin tocar lo escrito
    const vigilar=()=>{if(!document.body.contains(fondo)){const i=NS.alRefrescar.indexOf(vigilar);if(i>=0)NS.alRefrescar.splice(i,1);return;}if(modoActual()!=='FIJA'&&!fondo.contains(document.activeElement&&document.activeElement.tagName==='INPUT'?document.activeElement:null))aplicarModo();};
    NS.alRefrescar.push(vigilar);
    aplicarModo();
    return {
      modo:modoActual,
      /* Vuelve a validar con lo más reciente y devuelve {datos, opc} para M.guardar; lanza Error con el motivo si no se puede guardar. */
      leer(){
        const m=modoActual(),c=campos();
        if(m==='FIJA')return {modo:'FIJA',datos:{modo:'FIJA',cantidad:Number(cant.value)}};
        if(m==='COMPLETAR'){
          pintarCompletar();
          if(!calc||!calc.ok)throw new Error(calc&&calc.errores&&calc.errores.length?calc.errores.join(' '):'Completa los datos del cierre de referencia.');
          if(calc.completada)throw new Error('Meta completada: no hay saldo por programar.');
          return {modo:'COMPLETAR',datos:{modo:'COMPLETAR',cantidad:calc.saldo,meta:{id:calc.metaId,total:calc.metaTotal,referencia:pc.querySelector('#pm-referencia').value.trim().slice(0,120),
            vinculos:calc.vinculos.map(v=>Object.assign({},v,{por:quien(),en:ahoraMs()}))}}};
        }
        pintarTurno();
        if(!calc||calc.estado!=='OK')throw new Error(calc&&calc.motivo?calc.motivo:'La estimación está incompleta.');
        return {modo:'TURNO',datos:{modo:'TURNO',cantidad:calc.cantidad,alcance:calc.alcance,estimado:M.estimadoGuardado(calc,quien())}};
      }
    };
  };

  /* Aviso de conflicto al agregar otro producto a una línea reservada «Todo el turno» (lo usa NS.guardar vía validación). */
  const validarAnterior=NS.validar;
  NS.validar=function(f){
    const v=validarAnterior.apply(this,arguments);
    try{
      if(!v.errores.length){
        const c=M.conflictoConTurno(NS.programaciones(),{linea:f.linea,fecha:f.fecha,bloque:f.turno,marca:f.marca,presentacion:f.presentacion});
        if(c)v.errores.push(c);
      }
    }catch(_){/* sin conflicto detectable */}
    return v;
  };
})();
