/* =============================================================
   PLANIFICACIÓN · TIEMPOS PREVISTOS (etapa 4): reglas de preparación, ventanas de indisponibilidad, versión y auditoría

   DÓNDE SE GUARDAN (sin colecciones ni reglas nuevas): sync/catalogoPlanificacion → campo «tiempos» (el mismo documento del catálogo, que ya escribe
   quien tiene el permiso «planificacion»). Cada cambio es una TRANSACCIÓN sobre ese documento y deja su rastro en historialProgramacion (accion
   EDICION, referencia «TIEMPOS: …», quién/UID, hora del servidor, antes, después y motivo) dentro de la MISMA transacción: o se guardan los dos o ninguno.
     tiempos.version        número que sube con cada cambio (referencia de los parámetros)
     tiempos.reglas         [{id, linea, tipo, aplica, origen, destino, minutos, activo, descripcion, actualizadoPor/Uid/En}]
     tiempos.ventanas       [{id, linea, fecha, bloque, tipo, inicio, fin|duracionMin, motivo, activo, responsable, actualizadoUid/En}]
     tiempos.evaluaciones   {«fecha|bloque|línea»: {huellaPlan, huellaParam, version, estado, requeridoMin, disponibleMin, …}}: lo que dio el cálculo cuando el
                            plan se guardó. Cambiar una regla NO reescribe estas evaluaciones: la pantalla avisa que los parámetros cambiaron y ofrece
                            «Recalcular» (acción explícita, con la lista de planes afectados).
     tiempos.cambioMin / fijoDiaMin / fijoNocheMin   valores generales de respaldo de la etapa 3 (siguen funcionando; ver el motor).
   Estos tiempos son PREVISIONES: no crean paradas oficiales, no tocan el ratio real y no se descuentan de nuevo del ratio.
   Limitación: las reglas de Firestore validan quién escribe el documento del catálogo, no el contenido de cada regla; las validaciones de
   contenido están aquí (y se repiten dentro de la transacción).
   ============================================================= */
(function(){
  'use strict';
  const NS=window.glacialPlanificacion,M=NS.motor;
  const {num,norm,esc,fechaOk,addDias,iso,ahoraMs}=NS.util;
  const REF=()=>db.collection('sync').doc('catalogoPlanificacion');
  const DIAS_VENTANAS=120,DIAS_EVALUACIONES=90;

  NS.tiemposDatos=()=>M.normalizarTiempos(typeof NS.tiemposPlan==='function'?NS.tiemposPlan():{});
  const quien=()=>{
    const u=(typeof state!=='undefined'&&state.user)||{};
    let uid='';try{uid=(firebase.auth().currentUser||{}).uid||'';}catch(_){/* sin sesión segura */}
    return {nombre:u.nombre||u.username||'',uid};
  };
  const sinConexion=()=>!!(window.glacialEstadoDatos&&window.glacialEstadoDatos.enLinea===false);
  const idNuevo=p=>p+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  /* Bloque de una fecha. Con línea, el horario sale del resolvedor central (por línea, fecha y vigencia: 51b); sin línea o sin reglas, el horario general de siempre. */
  const bloqueDe=(fecha,bloque,linea)=>{
    const r=linea&&window.glacialHorarios?window.glacialHorarios.resolver(linea,fecha,bloque):null;
    if(r&&r.duracionMin>0)return {inicioMs:r.inicioMs,duracionMin:r.duracionMin,horario:r.horario,habilitado:r.habilitado,version:r.versionHorarios,origen:r.origen};
    return {inicioMs:NS.inicioBloqueMs(fecha,bloque),duracionMin:NS.duracionBloqueMin(bloque)};
  };
  NS.bloqueDe=bloqueDe;

  /* ---------- huellas ---------- */
  const hash=t=>{let h=5381;for(let i=0;i<t.length;i++)h=((h<<5)+h+t.charCodeAt(i))|0;return String(h>>>0);};
  /* Huella de los parámetros que afectan a ESTE bloque y línea (reglas de la línea, ventanas del día y bloque, valores de respaldo). */
  NS.huellaParametros=function(tp,linea,fecha,bloque){
    const r=tp.reglas.filter(x=>x.linea===linea).map(x=>[x.id,x.tipo,x.aplica,x.minutos,x.activo,JSON.stringify(x.origen),JSON.stringify(x.destino)].join(',')).sort();
    const v=tp.ventanas.filter(x=>x.linea===linea&&x.fecha===fecha&&x.bloque===bloque).map(x=>[x.id,x.tipo,x.inicio,x.fin,x.duracionMin,x.activo].join(',')).sort();
    return hash(r.join(';')+'|'+v.join(';')+'|'+[tp.legacy.cambioMin,tp.legacy.fijoDiaMin,tp.legacy.fijoNocheMin].join(','));
  };

  /* =========================================================
     VALIDACIÓN
     ========================================================= */
  NS.validarRegla=function(r,existentes){
    const errores=[];
    if(!NS.lineas().some(l=>l.key===r.linea))errores.push('Elige la línea.');
    if(!M.TIPOS_REGLA[r.tipo])errores.push('Elige el tipo de preparación.');
    const min=r.minutos===null||r.minutos===undefined||String(r.minutos).trim()===''?null:Number(r.minutos);
    if(min===null)errores.push('Indica los minutos (0 si confirmas que no hay tiempo adicional). Un campo vacío significa «sin configurar».');
    else if(!Number.isInteger(min)||min<0||min>M.MAX_MIN)errores.push('Los minutos deben ser un entero entre 0 y '+M.MAX_MIN+'.');
    if(r.tipo==='OTRA'){
      if(String(r.descripcion||'').trim().length<3)errores.push('Describe la otra preparación.');
      if(!M.APLICA_OTRA[r.aplica])errores.push('Indica cuándo aplica la otra preparación.');
    }
    ['origen','destino'].forEach(c=>{
      const p=r[c];if(!p)return;
      if(p.marca&&NS.lineas().some(l=>l.key===r.linea)&&!NS.marcas(r.linea).includes(p.marca))errores.push('La marca «'+p.marca+'» no existe en '+NS.nombreLinea(r.linea)+'.');
      if(p.presentacion&&NS.lineas().some(l=>l.key===r.linea)&&!NS.presentacionesBrutas(r.linea).includes(p.presentacion))errores.push('La presentación «'+p.presentacion+'» no es válida para '+NS.nombreLinea(r.linea)+'.');
    });
    const clave=x=>[x.linea,x.tipo,x.aplica||'',JSON.stringify(x.origen||null),JSON.stringify(x.destino||null)].join('|');
    if(!errores.length&&(existentes||[]).some(x=>x.activo!==false&&r.activo!==false&&x.id!==r.id&&clave(x)===clave(r)))
      errores.push('Ya existe una regla activa igual para esta línea: edítala en lugar de repetirla.');
    return {errores,minutos:min};
  };
  NS.validarVentanaNueva=function(v,existentes){
    return M.validarVentana(v,bloqueDe(v.fecha,v.bloque,v.linea),existentes);
  };

  /* =========================================================
     ESCRITURA (transacción + auditoría en la misma operación)
     ========================================================= */
  function podar(lista,campoFecha,dias){
    const limite=addDias(NS.hoyOperativo?NS.hoyOperativo():iso(new Date(ahoraMs())),-dias);
    return lista.filter(x=>String(x[campoFecha]||'')>=limite);
  }
  async function escribir(mutar){
    if(!NS.puede())throw new Error('Solo Planificación puede configurar los tiempos previstos.');
    if(sinConexion())throw new Error('Sin conexión: los cambios NO se guardaron.');
    const q=quien();
    if(!q.uid)throw new Error('No hay una sesión segura activa: no se puede registrar quién hizo el cambio.');
    let salida=null;
    await db.runTransaction(async tx=>{
      const snap=await tx.get(REF());
      const doc=snap.exists?snap.data():{};
      const t=Object.assign({},doc.tiempos||{});
      t.reglas=Array.isArray(t.reglas)?t.reglas.slice():[];
      t.ventanas=Array.isArray(t.ventanas)?t.ventanas.slice():[];
      const aud=mutar(t,M.normalizarTiempos(t),q);
      t.ventanas=podar(t.ventanas,'fecha',DIAS_VENTANAS);
      t.version=num(t.version)+1;t.actualizadoPor=q.nombre;t.actualizadoUid=q.uid;t.actualizadoEn=ahoraMs();
      tx.set(REF(),Object.assign({},doc,{tiempos:t,updatedAt:Date.now()}));
      const ev=NS.armarEvento({accion:'EDICION',linea:aud.linea||'',fecha:aud.fecha||iso(new Date(ahoraMs())),turno:aud.turno||'',motivo:aud.motivo||'',referencia:'TIEMPOS: '+aud.resumen,
        extra:{tiempos:{antes:aud.antes||'',despues:aud.despues||'',version:t.version}}});
      if(!ev)throw new Error('No hay una sesión segura activa: no se puede registrar quién hizo el cambio.');
      tx.set(db.collection('historialProgramacion').doc(ev.id),ev.doc);
      salida=Object.assign({version:t.version},aud.resultado||{});
    });
    if(typeof NS.refrescar==='function')NS.refrescar();
    return salida;
  }
  const textoRegla=r=>r?((M.TIPOS_REGLA[r.tipo]||r.tipo)+' · '+NS.nombreLinea(r.linea)+(r.origen?' · de '+[r.origen.marca,r.origen.presentacion].filter(Boolean).join(' '):'')+(r.destino?' · a '+[r.destino.marca,r.destino.presentacion].filter(Boolean).join(' '):'')+' · '+r.minutos+' min'+(r.activo===false?' (inactiva)':'')):'—';
  const textoVentana=v=>v?((M.TIPOS_VENTANA[v.tipo]||v.tipo)+' · '+NS.nombreLinea(v.linea)+' · '+v.fecha+' '+(v.bloque==='NOCHE'?'Noche':'Día')+' · '+v.inicio+(v.fin?'–'+v.fin:' +'+v.duracionMin+' min')+(v.motivo?' · '+v.motivo:'')+(v.activo===false?' (quitada)':'')):'—';

  /* Crea o edita UNA regla. r.esperadoEn = marca de la versión que se estaba editando (si cambió, no se pisa). */
  NS.guardarRegla=async function(r){
    const lim=x=>x&&(x.marca||x.presentacion)?{marca:x.marca||'',presentacion:x.presentacion||''}:null;
    const reg={id:r.id||'',linea:r.linea,tipo:r.tipo,aplica:r.tipo==='OTRA'?(r.aplica||''):'',origen:r.tipo==='LIMPIEZA_INICIO'?null:lim(r.origen),destino:r.tipo==='LIMPIEZA_FIN'?null:lim(r.destino),
      minutos:r.minutos,activo:r.activo!==false,descripcion:String(r.descripcion||'').trim().slice(0,120)};
    if(reg.tipo==='LIMPIEZA_INICIO')reg.origen=null;
    if(reg.tipo==='LIMPIEZA_FIN')reg.destino=null;
    return escribir((t,norm0,q)=>{
      const v=NS.validarRegla(reg,norm0.reglas);
      if(v.errores.length)throw new Error(v.errores.join(' '));
      reg.minutos=v.minutos;
      const i=reg.id?t.reglas.findIndex(x=>x.id===reg.id):-1;
      if(reg.id&&i<0)throw new Error('La regla ya no existe (otra persona la quitó).');
      if(i>=0&&r.esperadoEn!==undefined&&num(t.reglas[i].actualizadoEn)!==num(r.esperadoEn))
        throw new Error('La regla cambió mientras la editabas ('+textoRegla(t.reglas[i])+'). Ciérrala y vuelve a abrirla para ver el valor actual.');
      const antes=i>=0?textoRegla(t.reglas[i]):'';
      const nueva=Object.assign({},reg,{id:reg.id||idNuevo('rg'),actualizadoPor:q.nombre,actualizadoUid:q.uid,actualizadoEn:ahoraMs()});
      if(i>=0)t.reglas[i]=nueva;else t.reglas.push(nueva);
      return {linea:nueva.linea,resumen:(i>=0?'Regla modificada':'Regla nueva')+' · '+textoRegla(nueva),antes,despues:textoRegla(nueva),motivo:r.motivo||'',resultado:{id:nueva.id}};
    });
  };
  NS.cambiarActivoRegla=async function(id,activo){
    return escribir((t,n,q)=>{
      const i=t.reglas.findIndex(x=>x.id===id);
      if(i<0)throw new Error('La regla ya no existe.');
      const antes=textoRegla(t.reglas[i]);
      t.reglas[i]=Object.assign({},t.reglas[i],{activo:!!activo,actualizadoPor:q.nombre,actualizadoUid:q.uid,actualizadoEn:ahoraMs()});
      return {linea:t.reglas[i].linea,resumen:(activo?'Regla activada':'Regla desactivada')+' · '+textoRegla(t.reglas[i]),antes,despues:textoRegla(t.reglas[i])};
    });
  };
  /* Crea una o varias ventanas (una por línea marcada) en una sola transacción. */
  NS.guardarVentanas=async function(base,lineas){
    if(!Array.isArray(lineas)||!lineas.length)throw new Error('Elige al menos una línea.');
    return escribir((t,norm0,q)=>{
      const creadas=[];
      lineas.forEach(l=>{
        const v={id:idNuevo('vt'),linea:l,fecha:base.fecha,bloque:NS.valorBloque(base.bloque),tipo:base.tipo,inicio:base.inicio,fin:base.fin||'',duracionMin:base.fin?null:Number(base.duracionMin),
          motivo:String(base.motivo||'').trim().slice(0,120),activo:true,responsable:q.nombre,actualizadoUid:q.uid,actualizadoEn:ahoraMs()};
        const val=NS.validarVentanaNueva(v,norm0.ventanas.concat(creadas));
        if(val.errores.length)throw new Error(NS.nombreLinea(l)+': '+val.errores.join(' '));
        creadas.push(v);t.ventanas.push(v);
      });
      return {linea:lineas.length===1?lineas[0]:'',fecha:base.fecha,turno:NS.valorBloque(base.bloque),resumen:'Ventana prevista · '+creadas.map(textoVentana).join(' | '),antes:'',despues:creadas.map(textoVentana).join(' | '),motivo:base.motivo||'',resultado:{ids:creadas.map(x=>x.id)}};
    });
  };
  NS.quitarVentana=async function(id,motivo){
    return escribir((t,n,q)=>{
      const i=t.ventanas.findIndex(x=>x.id===id);
      if(i<0)throw new Error('La ventana ya no existe.');
      const antes=textoVentana(t.ventanas[i]);
      t.ventanas[i]=Object.assign({},t.ventanas[i],{activo:false,actualizadoUid:q.uid,actualizadoEn:ahoraMs()});
      return {linea:t.ventanas[i].linea,fecha:t.ventanas[i].fecha,turno:t.ventanas[i].bloque,resumen:'Ventana quitada · '+antes,antes,despues:textoVentana(t.ventanas[i]),motivo:motivo||''};
    });
  };
  /* Valores generales de respaldo (etapa 3): se guardan sin tocar reglas ni ventanas y con rastro. */
  NS.guardarRespaldo=async function(v){
    const lee=x=>{if(x===null||x===undefined||String(x).trim()==='')return null;const n=Number(x);if(!Number.isInteger(n)||n<0||n>M.MAX_MIN)throw new Error('Los minutos deben ser enteros entre 0 y '+M.MAX_MIN+'.');return n;};
    const nuevo={cambioMin:lee(v.cambioMin),fijoDiaMin:lee(v.fijoDiaMin),fijoNocheMin:lee(v.fijoNocheMin)};
    return escribir((t)=>{
      const txt=o=>'cambio '+(o.cambioMin===null||o.cambioMin===undefined?'sin configurar':o.cambioMin)+' · paradas Día '+(o.fijoDiaMin===null||o.fijoDiaMin===undefined?'sin configurar':o.fijoDiaMin)+' · Noche '+(o.fijoNocheMin===null||o.fijoNocheMin===undefined?'sin configurar':o.fijoNocheMin);
      const antes=txt(t);Object.assign(t,nuevo);
      return {resumen:'Valores generales de respaldo',antes,despues:txt(t),motivo:''};
    });
  };

  /* =========================================================
     EVALUACIONES GUARDADAS (lo que dio el cálculo cuando se guardó el plan)
     ========================================================= */
  const claveEval=(fecha,bloque,linea)=>fecha+'|'+bloque+'|'+linea;
  NS.evaluacionGuardada=(fecha,turno,linea)=>{const t=typeof NS.tiemposPlan==='function'?NS.tiemposPlan():{};return (t.evaluaciones||{})[claveEval(fecha,NS.valorBloque(turno),linea)]||null;};
  /* Datos de entrada del motor para una línea y bloque reales. */
  NS.entradaMotor=function(fecha,turno,linea,filasOpc){
    const bloqueClave=NS.valorBloque(turno),b=bloqueDe(fecha,bloqueClave,linea);
    const filas=filasOpc||NS.items(fecha,turno).filter(p=>p.linea===linea&&NS.estadoDe(p)!=='CANCELADA').map(p=>({marca:p.marca,presentacion:p.presentacion,cantidad:num(p.cantidadProgramada),estado:NS.estadoDe(p),fila:p}));
    let rs=null;                                   // el resumen del bloque (producido oficial) solo se arma si hace falta (capacidad restante)
    const estados=new Map();filas.forEach(f=>{if(f.fila)estados.set((f.marca+'|'+f.presentacion),f.estado);});
    return {fecha,bloqueClave,bloque:b,linea,filas,tramos:NS.tramosDe(fecha,turno,linea),tp:NS.tiemposDatos(),vel:NS.velocidadDe?((m,p)=>NS.velocidadDe(linea,p,m)):(()=>0),
      etiqueta:(m,p)=>NS.etiquetaPresentacion(linea,m,p),ahora:ahoraMs(),
      estado:(m,p)=>estados.get(m+'|'+p)||'PENDIENTE',
      producido:(m,p)=>{rs=rs||NS.resumenBloque(fecha,turno);const g=rs.grupos.get([linea,m,p].join('|'));return g?g.producido:null;}};
  };
  /* Capacidad vigente (con los parámetros de hoy). */
  NS.capacidadVigente=(fecha,turno,linea)=>M.capacidad(NS.entradaMotor(fecha,turno,linea));
  /* Lo que se muestra para un bloque y línea: la evaluación vigente, o —si los parámetros cambiaron desde que se guardó el plan— la evaluación guardada,
     avisando que está desfasada (no se reescribe en silencio). */
  NS.evaluar=function(fecha,turno,linea){
    const bloque=NS.valorBloque(turno);
    const entrada=NS.entradaMotor(fecha,turno,linea);
    const vigente=M.capacidad(entrada);
    if(!vigente)return null;
    const g=NS.evaluacionGuardada(fecha,turno,linea);
    const tp=NS.tiemposDatos();
    const huellaPlan=M.huella(entrada.filas);
    const huellaParam=NS.huellaParametros(tp,linea,fecha,bloque);
    const desfasada=!!g&&g.huellaPlan===huellaPlan&&g.huellaParam!==huellaParam;
    return {vigente,guardada:g&&g.huellaPlan===huellaPlan?g:null,desfasada,mostrar:desfasada?Object.assign({},vigente,{estado:g.estado,requeridoMin:g.requeridoMin,disponibleMin:g.disponibleMin,
      holguraMin:g.disponibleMin-g.requeridoMin,cargaPct:g.cargaPct,congelada:true,versionGuardada:g.version}):vigente,huellaPlan,huellaParam};
  };
  const registro=(fecha,bloque,linea,c,tp)=>({huellaPlan:M.huella(NS.entradaMotor(fecha,bloque,linea).filas),huellaParam:NS.huellaParametros(tp,linea,fecha,NS.valorBloque(bloque)),version:tp.version,
    estado:c.estado,requeridoMin:Math.round(c.requeridoMin*10)/10,disponibleMin:Math.round(c.disponibleMin*10)/10,cargaPct:c.cargaPct===null?null:Math.round(c.cargaPct*10)/10,en:ahoraMs(),por:quien().nombre});
  /* Guarda la evaluación de las líneas de un bloque (al guardar o trasladar un plan, o al recalcular). Nunca bloquea el guardado del plan. */
  NS.registrarEvaluaciones=async function(fecha,turno,lineasOpc){
    try{
      if(!NS.puede()||typeof db==='undefined'||sinConexion())return false;
      const bloque=NS.valorBloque(turno),tp0=NS.tiemposDatos();
      const lineas=lineasOpc||NS.lineas().map(l=>l.key);
      const nuevas={};
      lineas.forEach(l=>{const c=NS.capacidadVigente(fecha,bloque,l);nuevas[claveEval(fecha,bloque,l)]=c&&c.estado!=='INCOMPLETA'?registro(fecha,bloque,l,c,tp0):null;});
      await db.runTransaction(async tx=>{
        const snap=await tx.get(REF());
        const doc=snap.exists?snap.data():{};
        const t=Object.assign({},doc.tiempos||{}),ev=Object.assign({},t.evaluaciones||{});
        Object.keys(nuevas).forEach(k=>{if(nuevas[k]===null)delete ev[k];else ev[k]=Object.assign({},nuevas[k],{version:num(t.version)});});
        const limite=addDias(NS.hoyOperativo(),-DIAS_EVALUACIONES);
        Object.keys(ev).forEach(k=>{if(k.split('|')[0]<limite)delete ev[k];});
        t.evaluaciones=ev;
        tx.set(REF(),Object.assign({},doc,{tiempos:t,updatedAt:Date.now()}));
      });
      NS.evaluacionFallo='';
      return true;
    }catch(e){NS.evaluacionFallo=(e&&e.message)||String(e);console.warn('Planificación: no se pudo guardar la evaluación de capacidad (el plan sí quedó guardado):',NS.evaluacionFallo);return false;}
  };
  const pendientesEval=new Map();let tEval=null;
  NS.programarEvaluacion=function(fecha,turno){
    pendientesEval.set(fecha+'|'+NS.valorBloque(turno),{fecha,turno});
    clearTimeout(tEval);
    tEval=setTimeout(async()=>{
      const lote=[...pendientesEval.values()];pendientesEval.clear();
      for(const x of lote)await NS.registrarEvaluaciones(x.fecha,x.turno);
    },1500);
  };
  // al guardar un plan por la vía de Planificación, queda la evaluación con los parámetros de ese momento
  const guardarAnterior=NS.guardar;
  if(typeof guardarAnterior==='function'){
    NS.guardar=async function(f){
      const r=await guardarAnterior.apply(this,arguments);
      try{NS.programarEvaluacion(f.fecha,NS.turnoDeGuardado(f));}catch(_){/* informativo */}
      return r;
    };
  }
  /* Planes cuya evaluación guardada se hizo con otros parámetros (solo los que siguen siendo el mismo plan). */
  NS.planesDesfasados=function(){
    const t=typeof NS.tiemposPlan==='function'?NS.tiemposPlan():{},ev=t.evaluaciones||{},sal=[];
    Object.keys(ev).forEach(k=>{
      const [fecha,bloque,linea]=k.split('|');
      if(!fechaOk(fecha))return;
      const r=NS.evaluar(fecha,bloque,linea);
      if(r&&r.desfasada)sal.push({clave:k,fecha,bloque,linea,guardada:r.guardada,vigente:r.vigente});
    });
    return sal.sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.linea.localeCompare(b.linea));
  };
  NS.recalcularPlanes=async function(lista){
    const porBloque=new Map();
    lista.forEach(x=>{const k=x.fecha+'|'+x.bloque,o=porBloque.get(k)||{fecha:x.fecha,bloque:x.bloque,lineas:[]};o.lineas.push(x.linea);porBloque.set(k,o);});
    let n=0;
    for(const o of porBloque.values()){if(await NS.registrarEvaluaciones(o.fecha,o.bloque,o.lineas))n+=o.lineas.length;}
    return n;
  };

  /* =========================================================
     PANTALLA: sección «Tiempos previstos» del Catálogo
     ========================================================= */
  const F={linea:'',desde:'',hasta:'',estado:'',msg:''};
  const fmtMin=m=>m===null||m===undefined?'—':num(m).toLocaleString('es-PE')+' min';
  const textoBloque=b=>b==='NOCHE'?'Noche':'Mañana + Intermedio';
  const fechaTxt=f=>String(f).slice(8,10)+'/'+String(f).slice(5,7);
  const fechaHora=ms=>ms?new Date(ms).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—';
  const parteTxt=p=>p?esc([p.marca,p.presentacion?NS.etiquetaPresentacion('',p.marca,p.presentacion):''].filter(Boolean).join(' ')):'<span class="plan-nota">cualquiera</span>';
  function marcarEstado(txt,error){
    F.msg=txt;
    const el=document.getElementById('ti-estado');
    if(el){el.textContent=txt;el.style.color=error?'#c62828':txt.indexOf('Guardado')===0?'#166534':'#5a6b78';}
  }
  async function guardando(promesa,okTxt){
    marcarEstado('Guardando…',false);
    try{const r=await promesa;marcarEstado('Guardado ✓ '+(okTxt||''),false);return r;}
    catch(e){marcarEstado('Error: '+((e&&e.message)||e),true);throw e;}
  }

  NS.pintarTiemposUI=function(cont){
    if(!cont)return;
    if(cont.querySelector('input:focus,select:focus'))return;
    const planifica=NS.puede(),tp=NS.tiemposDatos(),t=typeof NS.tiemposPlan==='function'?NS.tiemposPlan():{};
    if(!fechaOk(F.desde)){F.desde=NS.hoyOperativo();F.hasta=addDias(F.desde,13);}
    const reglas=tp.reglas.filter(r=>!F.linea||r.linea===F.linea).sort((a,b)=>a.linea.localeCompare(b.linea)||a.tipo.localeCompare(b.tipo)||(b.activo?1:0)-(a.activo?1:0));
    const ventanas=tp.ventanas.filter(v=>v.activo!==false&&(!F.linea||v.linea===F.linea)&&v.fecha>=F.desde&&v.fecha<=F.hasta).sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.linea.localeCompare(b.linea)||a.inicio.localeCompare(b.inicio));
    const desf=NS.planesDesfasados?NS.planesDesfasados():[];
    const v=x=>x===null||x===undefined?'':esc(x);
    cont.innerHTML='<h4 class="plan-h4">Tiempos previstos <small>(previsiones de planificación: no son paradas oficiales ni cambian el ratio real)</small></h4>'+
      '<div class="plan-bar" style="margin-bottom:8px"><label>Línea<select id="ti-linea"><option value="">Todas</option>'+NS.lineas().map(l=>'<option value="'+esc(l.key)+'"'+(l.key===F.linea?' selected':'')+'>'+esc(l.name)+'</option>').join('')+'</select></label>'+
      '<span class="plan-nota" style="margin:0">Parámetros versión <b>'+num(tp.version)+'</b>'+(t.actualizadoPor?' · última modificación: '+esc(t.actualizadoPor)+' ('+esc(fechaHora(t.actualizadoEn))+')':'')+'</span>'+
      '<span id="ti-estado" class="plan-nota" style="margin:0 0 0 auto" role="status" aria-live="polite">'+esc(F.msg)+'</span></div>'+
      (desf.length?'<div class="plan-aviso" style="padding:8px 12px;background:#fff8e6;border:1px solid #f0c36a;border-radius:10px"><b>'+desf.length+(desf.length===1?' plan evaluado':' planes evaluados')+' con parámetros anteriores.</b> Sus números guardados no cambiaron. '+
        (planifica?'<button type="button" class="btn btn-ghost btn-sm" data-ti-recalcular>Revisar y recalcular…</button>':'')+'</div>':'')+
      /* A. cambios y limpieza */
      '<h5 style="margin:16px 0 6px;color:#003b5c">A. Cambios y limpieza</h5>'+
      '<p class="plan-nota">Gana la regla más específica (origen y destino); un valor general de la línea (sin origen ni destino) sirve de respaldo. Si cambian marca y formato a la vez es una sola intervención: usa «Cambio de marca y formato»; sin esa regla se aplica la mayor de las dos, nunca la suma. No necesitas configurar todas las combinaciones para empezar.</p>'+
      (planifica?'<p><button type="button" class="btn btn-ghost btn-sm" data-ti-regla-nueva>+ Agregar regla</button></p>':'')+
      '<div class="plan-scroll"><table class="plan-tabla"><thead><tr><th>Línea</th><th>Tipo</th><th>De</th><th>A</th><th class="num">Minutos</th><th>Estado</th><th>Modificó</th><th></th></tr></thead><tbody>'+
      (reglas.length?reglas.map(r=>'<tr'+(r.activo===false?' style="opacity:.55"':'')+'><td>'+esc(NS.nombreLinea(r.linea))+'</td><td>'+esc(M.TIPOS_REGLA[r.tipo])+(r.tipo==='OTRA'?'<br><small>'+esc(r.descripcion)+' · '+esc(M.APLICA_OTRA[r.aplica]||'')+'</small>':'')+'</td>'+
        '<td>'+(r.tipo==='LIMPIEZA_INICIO'||r.tipo==='OTRA'&&r.aplica==='INICIO'?'—':parteTxt(r.origen))+'</td><td>'+(r.tipo==='LIMPIEZA_FIN'?'—':parteTxt(r.destino))+'</td><td class="num"><b>'+r.minutos+'</b></td><td>'+(r.activo===false?'Inactiva':'Activa')+'</td>'+
        '<td><small>'+esc(r.actualizadoPor)+'<br>'+esc(fechaHora(r.actualizadoEn))+'</small></td><td class="acc">'+(planifica?'<button type="button" class="btn btn-ghost btn-sm" data-ti-regla-editar="'+esc(r.id)+'">Editar</button> <button type="button" class="btn btn-ghost btn-sm" data-ti-regla-activo="'+esc(r.id)+'">'+(r.activo===false?'Activar':'Desactivar')+'</button>':'')+'</td></tr>').join('')
        :'<tr><td colspan="8" class="plan-nota">Todavía no hay reglas'+(F.linea?' para esta línea':'')+'. Las capacidades con cambio de producto dirán «Estimación incompleta» hasta configurar el tiempo del cambio (o un valor general de respaldo).</td></tr>')+'</tbody></table></div>'+
      /* B. ventanas */
      '<h5 style="margin:18px 0 6px;color:#003b5c">B. Ventanas de indisponibilidad <small style="font-weight:500;color:#5a6b78">(mantenimiento previsto, refrigerio con detención, limpieza fija, otras)</small></h5>'+
      '<p class="plan-nota">Registra solo lo que realmente detiene la línea: el refrigerio del personal no detiene la línea por sí solo. Las ventanas superpuestas se descuentan una sola vez (unión).</p>'+
      '<div class="plan-bar" style="margin-bottom:8px"><label>Desde<input type="date" id="ti-desde" value="'+esc(F.desde)+'"></label><label>Hasta<input type="date" id="ti-hasta" value="'+esc(F.hasta)+'"></label>'+
      (planifica?'<span style="flex:1"></span><button type="button" class="btn btn-ghost btn-sm" data-ti-ventana-nueva>+ Agregar ventana</button>':'')+'</div>'+
      '<div class="plan-scroll"><table class="plan-tabla"><thead><tr><th>Fecha</th><th>Línea</th><th>Bloque</th><th>Tipo</th><th>Horario</th><th class="num">Duración</th><th>Motivo</th><th>Registró</th><th></th></tr></thead><tbody>'+
      (ventanas.length?ventanas.map(x=>{const p=M.posicionVentana(x,bloqueDe(x.fecha,x.bloque,x.linea));return '<tr><td>'+esc(fechaTxt(x.fecha))+'</td><td>'+esc(NS.nombreLinea(x.linea))+'</td><td>'+esc(textoBloque(x.bloque))+'</td><td>'+esc(M.TIPOS_VENTANA[x.tipo])+'</td>'+
        '<td>'+esc(x.inicio)+(x.fin?'–'+esc(x.fin):'')+(p.error?' <span class="plan-error" style="display:inline" title="'+esc(p.error)+'">⚠ inválida</span>':'')+'</td><td class="num">'+(p.error?'—':(p.z-p.a)+' min')+'</td><td>'+esc(x.motivo)+'</td><td><small>'+esc(x.responsable)+'</small></td>'+
        '<td class="acc">'+(planifica?'<button type="button" class="btn btn-ghost btn-sm" data-ti-ventana-quitar="'+esc(x.id)+'">Quitar</button>':'')+'</td></tr>';}).join('')
        :'<tr><td colspan="9" class="plan-nota">No hay ventanas registradas en este rango.</td></tr>')+'</tbody></table></div>'+
      /* C. respaldo */
      '<details style="margin-top:16px"'+(t.cambioMin!==undefined&&t.cambioMin!==null||t.fijoDiaMin!==undefined&&t.fijoDiaMin!==null||t.fijoNocheMin!==undefined&&t.fijoNocheMin!==null?' open':'')+'><summary style="cursor:pointer;font-weight:700;color:#003b5c">C. Valores generales de respaldo (etapa anterior)</summary>'+
      '<p class="plan-nota">Se usan solo cuando no hay una regla para la transición (cambios) o una ventana con horario en esa línea y día (paradas). Vacío = sin configurar; 0 = confirmas que no hay tiempo adicional.</p>'+
      '<div class="plan-campos" style="max-width:720px">'+
      '<label>Minutos por cambio de marca o formato (todas las líneas)<input type="number" id="ti-cambio" min="0" max="'+M.MAX_MIN+'" step="1" inputmode="numeric" value="'+v(t.cambioMin)+'"'+(planifica?'':' disabled')+' placeholder="sin configurar"></label>'+
      '<label>Paradas previstas · Mañana + Intermedio (min, sin horario)<input type="number" id="ti-dia" min="0" max="'+M.MAX_MIN+'" step="1" inputmode="numeric" value="'+v(t.fijoDiaMin)+'"'+(planifica?'':' disabled')+' placeholder="sin configurar"></label>'+
      '<label>Paradas previstas · Noche (min, sin horario)<input type="number" id="ti-noche" min="0" max="'+M.MAX_MIN+'" step="1" inputmode="numeric" value="'+v(t.fijoNocheMin)+'"'+(planifica?'':' disabled')+' placeholder="sin configurar"></label></div>'+
      (planifica?'<p><button type="button" class="btn btn-ghost btn-sm" data-cat-tiempos-guardar>Guardar valores de respaldo</button> <span class="plan-error" id="ti-error" style="display:inline"></span></p>':'')+'</details>'+
      (planifica?'':'<p class="plan-nota">Solo Planificación puede cambiar estos tiempos. Tú puedes consultarlos.</p>');
  };

  /* ---------- diálogos de edición ---------- */
  function opcionesMarcas(linea,sel,vacio){return '<option value="">'+vacio+'</option>'+NS.marcas(linea).map(m=>'<option value="'+esc(m)+'"'+(m===sel?' selected':'')+'>'+esc(m)+'</option>').join('');}
  function opcionesPres(linea,sel,vacio){return '<option value="">'+vacio+'</option>'+NS.presentaciones(linea).map(p=>'<option value="'+esc(p.value)+'"'+(p.value===sel?' selected':'')+'>'+esc(p.label)+'</option>').join('');}

  function abrirRegla(id){
    if(!NS.puede())return;
    const tp=NS.tiemposDatos(),x=id?tp.reglas.find(r=>r.id===id):null;
    const base=x||{linea:F.linea||(NS.lineas()[0]&&NS.lineas()[0].key)||'',tipo:'CAMBIO_MARCA_FORMATO',aplica:'ENTRE',origen:null,destino:null,minutos:'',activo:true,descripcion:''};
    const fondo=NS.abrirDialogo('<h3>'+(x?'Editar regla':'Agregar regla')+'</h3><div class="plan-campos">'+
      '<label>Línea<select id="rg-linea"'+(x?' disabled':'')+'>'+NS.lineas().map(l=>'<option value="'+esc(l.key)+'"'+(l.key===base.linea?' selected':'')+'>'+esc(l.name)+'</option>').join('')+'</select></label>'+
      '<label>Tipo<select id="rg-tipo"'+(x?' disabled':'')+'>'+Object.keys(M.TIPOS_REGLA).map(k=>'<option value="'+k+'"'+(k===base.tipo?' selected':'')+'>'+esc(M.TIPOS_REGLA[k])+'</option>').join('')+'</select></label>'+
      '<label class="completo" id="rg-l-aplica">Cuándo aplica<select id="rg-aplica">'+Object.keys(M.APLICA_OTRA).map(k=>'<option value="'+k+'"'+(k===base.aplica?' selected':'')+'>'+esc(M.APLICA_OTRA[k])+'</option>').join('')+'</select></label>'+
      '<label class="completo" id="rg-l-desc">Descripción<input type="text" id="rg-desc" maxlength="120" value="'+esc(base.descripcion)+'" placeholder="Qué preparación es"></label>'+
      '<label id="rg-l-om">Origen · marca<select id="rg-om"></select></label><label id="rg-l-op">Origen · presentación<select id="rg-op"></select></label>'+
      '<label id="rg-l-dm">Destino · marca<select id="rg-dm"></select></label><label id="rg-l-dp">Destino · presentación<select id="rg-dp"></select></label>'+
      '<label class="completo">Duración (minutos)<input type="number" id="rg-min" min="0" max="'+M.MAX_MIN+'" step="1" inputmode="numeric" value="'+esc(base.minutos)+'" placeholder="Escribe 0 solo si confirmas que no hay tiempo adicional"></label>'+
      '<label class="completo">Motivo del cambio (para el historial)<input type="text" id="rg-motivo" maxlength="120"></label>'+
      '<label class="completo" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="rg-activo"'+(base.activo!==false?' checked':'')+'> Regla activa</label></div>'+
      '<p class="plan-nota" id="rg-ayuda"></p><div class="plan-error" id="rg-error"></div>'+
      '<div class="plan-acciones"><button type="button" class="btn btn-ghost" id="rg-cancelar">Cancelar</button><button type="button" class="btn btn-primary" id="rg-guardar">Guardar</button></div>');
    const q=i=>fondo.querySelector('#'+i);
    const llenar=()=>{
      const l=q('rg-linea').value,t=q('rg-tipo').value;
      q('rg-om').innerHTML=opcionesMarcas(l,(base.origen||{}).marca,'Cualquiera');q('rg-op').innerHTML=opcionesPres(l,(base.origen||{}).presentacion,'Cualquiera');
      q('rg-dm').innerHTML=opcionesMarcas(l,(base.destino||{}).marca,'Cualquiera');q('rg-dp').innerHTML=opcionesPres(l,(base.destino||{}).presentacion,'Cualquiera');
      const mostrar=(id,s)=>{q(id).style.display=s?'':'none';};
      const sinOrigen=t==='LIMPIEZA_INICIO'||(t==='OTRA'&&['INICIO','BLOQUE'].includes(q('rg-aplica').value)),sinDestino=t==='LIMPIEZA_FIN'||(t==='OTRA'&&['FIN','BLOQUE'].includes(q('rg-aplica').value));
      mostrar('rg-l-aplica',t==='OTRA');mostrar('rg-l-desc',t==='OTRA');mostrar('rg-l-om',!sinOrigen);mostrar('rg-l-op',!sinOrigen);mostrar('rg-l-dm',!sinDestino);mostrar('rg-l-dp',!sinDestino);
      q('rg-ayuda').textContent=({CAMBIO_MARCA:'Se aplica cuando cambia la marca y la presentación se mantiene.',CAMBIO_FORMATO:'Se aplica cuando cambia la presentación y la marca se mantiene.',
        CAMBIO_MARCA_FORMATO:'Se aplica cuando cambian marca y presentación a la vez (una sola intervención): no se suma al cambio de marca ni al de formato.',
        LIMPIEZA_INICIO:'Se suma una vez al inicio del bloque. Si ya registraste esa limpieza como ventana de indisponibilidad, no se suma otra vez.',LIMPIEZA_FIN:'Se suma una vez al final del bloque (se omite si hay una ventana de limpieza).',
        LIMPIEZA_ENTRE:'Se suma en cada cambio de producto. Si tu tiempo de cambio ya incluye la limpieza, no configures esta regla.',OTRA:'Preparación propia: descríbela y di cuándo aplica.'})[t]||'';
    };
    llenar();q('rg-linea').onchange=()=>{base.origen=null;base.destino=null;llenar();};q('rg-tipo').onchange=llenar;q('rg-aplica').onchange=llenar;
    q('rg-cancelar').onclick=()=>fondo.remove();
    q('rg-guardar').onclick=async()=>{
      q('rg-guardar').disabled=true;q('rg-error').textContent='';
      const par=(m,p)=>{const mv=q(m).value,pv=q(p).value;return mv||pv?{marca:mv,presentacion:pv}:null;};
      try{
        await guardando(NS.guardarRegla({id:x?x.id:'',esperadoEn:x?x.actualizadoEn:undefined,linea:q('rg-linea').value,tipo:q('rg-tipo').value,aplica:q('rg-aplica').value,descripcion:q('rg-desc').value,
          origen:q('rg-l-om').style.display==='none'?null:par('rg-om','rg-op'),destino:q('rg-l-dm').style.display==='none'?null:par('rg-dm','rg-dp'),minutos:q('rg-min').value,activo:q('rg-activo').checked,motivo:q('rg-motivo').value}),'regla');
        fondo.remove();NS.pintarTiemposUI(document.getElementById('cat-tiempos'));
      }catch(e){q('rg-error').textContent=(e&&e.message)||String(e);q('rg-guardar').disabled=false;}
    };
  }

  function abrirVentana(){
    if(!NS.puede())return;
    const fecha0=NS.estado&&fechaOk(NS.estado.fecha)?NS.estado.fecha:NS.hoyOperativo();
    const fondo=NS.abrirDialogo('<h3>Agregar ventana de indisponibilidad</h3><div class="plan-campos">'+
      '<label class="completo">Líneas (se crea una ventana por línea)<span style="display:flex;gap:10px;flex-wrap:wrap;font-weight:500">'+NS.lineas().map(l=>'<label style="flex-direction:row;align-items:center;gap:4px;font-weight:500"><input type="checkbox" class="vt-linea" value="'+esc(l.key)+'"'+(l.key===F.linea?' checked':'')+'> '+esc(l.name)+'</label>').join('')+'</span></label>'+
      '<label>Fecha<input type="date" id="vt-fecha" value="'+esc(fecha0)+'"></label>'+
      '<label>Bloque<select id="vt-bloque">'+NS.BLOQUES.map(b=>'<option value="'+b.valor+'"'+(NS.estado&&NS.valorBloque(NS.estado.turno)===b.valor?' selected':'')+'>'+esc(NS.etiquetaBloqueConHorario(b.valor))+'</option>').join('')+'</select></label>'+
      '<label>Tipo<select id="vt-tipo">'+Object.keys(M.TIPOS_VENTANA).map(k=>'<option value="'+k+'">'+esc(M.TIPOS_VENTANA[k])+'</option>').join('')+'</select></label>'+
      '<label>Hora de inicio<input type="time" id="vt-inicio"></label>'+
      '<label>Hora de fin<input type="time" id="vt-fin"></label>'+
      '<label>o duración (min)<input type="number" id="vt-dur" min="1" max="'+M.MAX_MIN+'" step="1" inputmode="numeric" placeholder="si no pones la hora de fin"></label>'+
      '<label class="completo">Motivo<input type="text" id="vt-motivo" maxlength="120" placeholder="Obligatorio para «Otra parada prevista»"></label></div>'+
      '<p class="plan-nota">Noche cruza la medianoche (por ejemplo 23:30–00:30). La ventana debe quedar dentro del horario del bloque.</p>'+
      '<div class="plan-aviso" id="vt-aviso"></div><div class="plan-error" id="vt-error"></div>'+
      '<div class="plan-acciones"><button type="button" class="btn btn-ghost" id="vt-cancelar">Cancelar</button><button type="button" class="btn btn-primary" id="vt-guardar">Guardar</button></div>');
    const q=i=>fondo.querySelector('#'+i);
    const lineasSel=()=>[...fondo.querySelectorAll('.vt-linea')].filter(c=>c.checked).map(c=>c.value);
    const leer=l=>({id:'nuevo',linea:l,fecha:q('vt-fecha').value,bloque:NS.valorBloque(q('vt-bloque').value),tipo:q('vt-tipo').value,inicio:q('vt-inicio').value,fin:q('vt-fin').value,duracionMin:q('vt-fin').value?null:Number(q('vt-dur').value)||null,motivo:q('vt-motivo').value});
    const previa=()=>{
      const tp=NS.tiemposDatos(),av=[],er=[];
      lineasSel().forEach(l=>{const r=NS.validarVentanaNueva(leer(l),tp.ventanas);r.avisos.forEach(a=>av.push(NS.nombreLinea(l)+': '+a));});
      q('vt-aviso').textContent=av.join('\n');
      if(!q('vt-fin').value&&q('vt-dur').value&&!q('vt-inicio').value)er.push('');
    };
    ['vt-fecha','vt-bloque','vt-tipo','vt-inicio','vt-fin','vt-dur'].forEach(i=>q(i).addEventListener('input',previa));fondo.querySelectorAll('.vt-linea').forEach(c=>c.addEventListener('change',previa));
    q('vt-cancelar').onclick=()=>fondo.remove();
    q('vt-guardar').onclick=async()=>{
      q('vt-guardar').disabled=true;q('vt-error').textContent='';
      const l=lineasSel(),b=leer(l[0]||'');
      try{
        if(!fechaOk(b.fecha))throw new Error('La fecha no es válida.');
        await guardando(NS.guardarVentanas({fecha:b.fecha,bloque:b.bloque,tipo:b.tipo,inicio:b.inicio,fin:b.fin,duracionMin:b.duracionMin,motivo:b.motivo},l),'ventana');
        fondo.remove();NS.pintarTiemposUI(document.getElementById('cat-tiempos'));
      }catch(e){q('vt-error').textContent=(e&&e.message)||String(e);q('vt-guardar').disabled=false;}
    };
  }

  function abrirRecalculo(){
    if(!NS.puede())return;
    const lista=NS.planesDesfasados();
    if(!lista.length)return;
    const fondo=NS.abrirDialogo('<h3>Planes evaluados con parámetros anteriores</h3>'+
      '<p class="plan-nota">Estos planes se guardaron con otros tiempos previstos. Sus números guardados <b>no cambiaron</b>. Si recalculas, se guardará la evaluación con los parámetros de hoy (versión actual). Es una acción explícita y queda registrada.</p>'+
      '<div class="plan-scroll"><table class="plan-tabla"><thead><tr><th>Fecha</th><th>Bloque</th><th>Línea</th><th>Antes (guardado)</th><th>Con parámetros de hoy</th></tr></thead><tbody>'+
      lista.map(x=>'<tr><td>'+esc(fechaTxt(x.fecha))+'</td><td>'+esc(textoBloque(x.bloque))+'</td><td>'+esc(NS.nombreLinea(x.linea))+'</td><td>'+esc(({CABE:'Cabe',JUSTO:'Cabe (justo)',EXCESO:'No cabe',INCOMPLETA:'Incompleta'})[x.guardada.estado]||x.guardada.estado)+' · '+fmtMin(x.guardada.requeridoMin)+' / '+fmtMin(x.guardada.disponibleMin)+'</td>'+
        '<td>'+esc(({CABE:'Cabe',JUSTO:'Cabe (justo)',EXCESO:'No cabe',INCOMPLETA:'Incompleta'})[x.vigente.estado]||x.vigente.estado)+' · '+fmtMin(x.vigente.requeridoMin)+' / '+fmtMin(x.vigente.disponibleMin)+'</td></tr>').join('')+'</tbody></table></div>'+
      '<div class="plan-error" id="rc-error"></div><div class="plan-acciones"><button type="button" class="btn btn-ghost" id="rc-cancelar">Ahora no</button><button type="button" class="btn btn-primary" id="rc-ok">Recalcular '+lista.length+'</button></div>',true);
    const q=i=>fondo.querySelector('#'+i);
    q('rc-cancelar').onclick=()=>fondo.remove();
    q('rc-ok').onclick=async()=>{
      q('rc-ok').disabled=true;q('rc-error').textContent='Recalculando…';
      try{const n=await NS.recalcularPlanes(lista);fondo.remove();marcarEstado('Guardado ✓ '+n+' evaluación(es) recalculada(s)',false);if(NS.pintarPestana)NS.pintarPestana();}
      catch(e){q('rc-error').textContent=(e&&e.message)||String(e);q('rc-ok').disabled=false;}
    };
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click',async e=>{
    const raiz=e.target.closest&&e.target.closest('#plan-root');
    if(!raiz||!NS.estado||NS.estado.tab!=='catalogo')return;
    const cont=()=>document.getElementById('cat-tiempos');
    if(e.target.closest('[data-ti-regla-nueva]')){abrirRegla('');return;}
    const ed=e.target.closest('[data-ti-regla-editar]');if(ed){abrirRegla(ed.getAttribute('data-ti-regla-editar'));return;}
    const ac=e.target.closest('[data-ti-regla-activo]');
    if(ac){
      const id=ac.getAttribute('data-ti-regla-activo'),r=NS.tiemposDatos().reglas.find(x=>x.id===id);
      if(r){try{await guardando(NS.cambiarActivoRegla(id,r.activo===false),'regla');NS.pintarTiemposUI(cont());}catch(_){/* el estado ya muestra el error */}}
      return;
    }
    if(e.target.closest('[data-ti-ventana-nueva]')){abrirVentana();return;}
    const qv=e.target.closest('[data-ti-ventana-quitar]');
    if(qv){
      const id=qv.getAttribute('data-ti-ventana-quitar');
      const fondo=NS.abrirDialogo('<h3>Quitar ventana</h3><p>La ventana deja de descontarse del tiempo disponible. Queda en el historial.</p><label class="plan-campos" style="display:block"><span style="font-size:12px;font-weight:600;color:#5a6b78">Motivo (opcional)</span><input type="text" id="qv-motivo" maxlength="120" style="width:100%"></label><div class="plan-error" id="qv-error"></div><div class="plan-acciones"><button type="button" class="btn btn-ghost" id="qv-no">Cancelar</button><button type="button" class="btn btn-primary" id="qv-si">Quitar</button></div>');
      fondo.querySelector('#qv-no').onclick=()=>fondo.remove();
      fondo.querySelector('#qv-si').onclick=async()=>{
        fondo.querySelector('#qv-si').disabled=true;
        try{await guardando(NS.quitarVentana(id,fondo.querySelector('#qv-motivo').value),'ventana quitada');fondo.remove();NS.pintarTiemposUI(cont());}
        catch(err){fondo.querySelector('#qv-error').textContent=(err&&err.message)||String(err);fondo.querySelector('#qv-si').disabled=false;}
      };
      return;
    }
    if(e.target.closest('[data-ti-recalcular]')){abrirRecalculo();return;}
  });
  // «Guardar valores de respaldo»: reemplaza al guardado antiguo (que reescribía todo el objeto «tiempos» y habría borrado reglas y ventanas)
  document.addEventListener('click',async e=>{
    const b=e.target.closest&&e.target.closest('[data-cat-tiempos-guardar]');
    if(!b||!b.closest('#plan-root'))return;
    e.stopImmediatePropagation();
    const er=document.getElementById('ti-error');if(er)er.textContent='';
    try{
      await guardando(NS.guardarRespaldo({cambioMin:document.getElementById('ti-cambio').value,fijoDiaMin:document.getElementById('ti-dia').value,fijoNocheMin:document.getElementById('ti-noche').value}),'valores de respaldo');
    }catch(err){if(er)er.textContent=(err&&err.message)||String(err);}
  },true);
  document.addEventListener('change',e=>{
    if(!e.target||!e.target.closest||!e.target.closest('#plan-root')||NS.estado.tab!=='catalogo')return;
    const cont=document.getElementById('cat-tiempos');
    if(e.target.id==='ti-linea'){F.linea=e.target.value;NS.pintarTiemposUI(cont);}
    if((e.target.id==='ti-desde'||e.target.id==='ti-hasta')&&fechaOk(e.target.value)){
      if(e.target.id==='ti-desde')F.desde=e.target.value;else F.hasta=e.target.value;
      NS.pintarTiemposUI(cont);
    }
  });

  /* ---------- historial: filas de «Tiempos previstos» ---------- */
  NS.filaHistorialTiempos=function(h){
    const t=h.tiempos||{};
    const hora=h.timestamp&&typeof h.timestamp.toMillis==='function'?h.timestamp.toMillis():num(h.timestamp&&h.timestamp.seconds)*1000;
    return '<tr><td>'+esc(fechaHora(hora))+'</td><td>Tiempos previstos</td><td>'+esc(h.linea?NS.nombreLinea(h.linea):'Todas las líneas')+'<br><small>'+esc(String(h.referencia||'').replace(/^TIEMPOS:\s*/,''))+'</small></td><td>'+esc(h.fecha)+(h.turno?' · '+esc(h.turno):'')+
      '</td><td>'+esc(t.antes||'—')+'</td><td>'+esc(t.despues||'—')+'</td><td>'+esc(h.motivo||'')+'</td><td>'+esc(h.usuario||'')+'</td></tr>';
  };
})();
