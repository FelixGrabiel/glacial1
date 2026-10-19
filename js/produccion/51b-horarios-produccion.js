/* =============================================================
   PLANIFICACIÓN · HORARIO DE PRODUCCIÓN POR LÍNEA, BLOQUE Y VIGENCIA

   UNA función central resuelve el horario: glacialHorarios.resolver(línea, fecha operativa, bloque) → {habilitado, inicioMs, finMs, duracionMin, horario, etiqueta, tolerancia,
   origen/reglaId/versionHorarios}. Es la que usan Planificación (capacidad, secuencia, vista semanal), 23b (tiempos de línea: disponibilidad y ratio), Avance/Cierre y Completar cantidad.

   BASE: el horario global de siempre (sync/configIndicadores → bloques: Mañana + Intermedio 07:00–19:00 y Noche 21:00–07:00 hasta que se configure otra cosa). SIN reglas, nada cambia
   (ni para el pasado ni para el futuro): instalar esto no activa ninguna vigencia. Las reglas se crean desde Planificación → «Horario de producción» con FECHA DE INICIO EXPLÍCITA; el
   pasado conserva su horario original (no se reescribe nada retroactivamente).

   REGLAS (sync/catalogoPlanificacion → horarios {version, reglas[]}, mismo documento y permiso «planificacion» que el catálogo; cada cambio queda en historialProgramacion):
     · kind HORARIO: inicio y fin (el fin ≤ inicio cruza la medianoche) o «base» (Restablecer horario predeterminado). Puede llevar una etiqueta (p. ej. «Intermedio»).
     · kind HABILITACION: habilita o deshabilita un bloque en una línea. Es independiente del horario: restablecer el horario diurno NO habilita Noche.
     · Líneas: una o varias, solo las marcadas. Vigencia: una fecha, un rango, o desde una fecha hasta nuevo cambio.
     · PRECEDENCIA determinista: una fecha > rango > desde-hasta-nuevo-cambio; entre abiertas gana la de fecha de inicio más reciente. Dos reglas de la misma línea, bloque,
       tipo y especificidad con vigencias que se superponen NO se pueden guardar (no se resuelve por orden accidental).
     · Nada se borra: una regla se desactiva y queda el historial.
   NOCHE: abre a la hora configurada (22:00 en la configuración aprobada), termina a las 07:00 del día siguiente y TOLERA hasta 30 min después (07:30) SOLO para completar registro y cierre:
   no adelanta la apertura, no desplaza el inicio, no aumenta la duración productiva ni la capacidad, no finaliza máquinas ni confirma cierres.
   No toca Tareo ni las jornadas del personal. Cargar después de 51-planificacion-nucleo.js.
   ============================================================= */
(function(){
  'use strict';
  const NS=window.glacialPlanificacion;
  if(!NS||!window.GlacialIndicadores)return;
  const G=window.GlacialIndicadores;
  const {num,esc,fechaOk,addDias,ahoraMs}=NS.util;
  const H=window.glacialHorarios={};
  const TOLERANCIA_MIN=30;
  H.TOLERANCIA_MIN=TOLERANCIA_MIN;
  const bl=b=>String(b||'').toUpperCase().includes('NOCHE')?'NOCHE':'DÍA';
  const hhmmOk=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(t||''));
  const aMin=t=>{const [h,m]=String(t).split(':').map(Number);return h*60+m;};
  const hhmm=ms=>{const d=new Date(ms);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
  const LINEAS=()=>(typeof LINES!=='undefined'?LINES:[]).map(l=>l.key);

  /* ---------- datos (lectura en vivo) ---------- */
  let doc={version:0,reglas:[]},listo=false;
  const normalizar=raw=>{
    raw=raw&&typeof raw==='object'?raw:{};
    const reglas=(Array.isArray(raw.reglas)?raw.reglas:[]).filter(r=>r&&r.id&&Array.isArray(r.lineas)&&r.lineas.length&&(r.kind==='HORARIO'||r.kind==='HABILITACION')&&fechaOk(r.desde)).map(r=>({
      id:String(r.id),kind:r.kind,lineas:r.lineas.map(String),bloque:bl(r.bloque),base:!!r.base,inicio:hhmmOk(r.inicio)?r.inicio:'',fin:hhmmOk(r.fin)?r.fin:'',habilitado:r.habilitado!==false,
      etiqueta:String(r.etiqueta||'').slice(0,40),tipoVigencia:['FECHA','RANGO','ABIERTA'].includes(r.tipoVigencia)?r.tipoVigencia:'ABIERTA',desde:r.desde,hasta:fechaOk(r.hasta)?r.hasta:'',
      motivo:String(r.motivo||''),responsable:String(r.responsable||''),activo:r.activo!==false,actualizadoPor:String(r.actualizadoPor||''),actualizadoUid:String(r.actualizadoUid||''),actualizadoEn:num(r.actualizadoEn)}));
    return {version:num(raw.version),reglas};
  };
  NS.escuchas.push(function(){
    if(typeof db==='undefined')return null;
    return db.collection('sync').doc('catalogoPlanificacion').onSnapshot(snap=>{
      doc=normalizar(snap.exists?snap.data().horarios:null);listo=true;
      if(typeof NS.refrescar==='function')NS.refrescar();
    },err=>console.warn('Horarios de producción:',err&&err.message||err));
  });
  H.datos=()=>({version:doc.version,reglas:doc.reglas.map(r=>Object.assign({},r)),listo});

  /* ---------- resolución ---------- */
  const cfgBloques=()=>typeof window.glacialBloquesConfig==='function'?window.glacialBloquesConfig():undefined;
  const ESP={FECHA:3,RANGO:2,ABIERTA:1};
  const vigente=(r,fecha)=>r.activo&&fecha>=r.desde&&(r.tipoVigencia==='FECHA'?fecha===r.desde:!r.hasta||fecha<=r.hasta);
  const elegir=(reglas,linea,fecha,bloque,kind)=>reglas.filter(r=>r.kind===kind&&r.bloque===bloque&&r.lineas.includes(linea)&&vigente(r,fecha))
    .sort((a,b)=>(ESP[b.tipoVigencia]-ESP[a.tipoVigencia])||b.desde.localeCompare(a.desde)||a.id.localeCompare(b.id))[0]||null;
  const inst=(fecha,min,dia)=>{const [y,m,d]=fecha.split('-').map(Number);return new Date(y,m-1,d+dia,Math.floor(min/60),min%60).getTime();};
  /* reglas: opcional (para simular antes de guardar). Siempre devuelve instantes completos de la fecha operativa en que EMPIEZA el bloque. */
  H.resolver=function(linea,fecha,bloque,reglas){
    const bk=bl(bloque);
    const base=G.horarioBloque(fecha,bk,cfgBloques());
    if(!base)return null;
    const rs=reglas||doc.reglas;
    const rh=elegir(rs,linea,fecha,bk,'HORARIO'),rb=elegir(rs,linea,fecha,bk,'HABILITACION');
    let inicioMs=base.inicio,finMs=base.fin,origen='BASE',reglaId='',etiqueta=NS.etiquetaBloque(bk);
    if(rh){
      origen=rh.base?'RESTABLECIDO':'REGLA';reglaId=rh.id;
      if(!rh.base&&rh.inicio&&rh.fin){const a=aMin(rh.inicio),z=aMin(rh.fin);inicioMs=inst(fecha,a,0);finMs=inst(fecha,z,z<=a?1:0);}
      if(rh.etiqueta)etiqueta=rh.etiqueta;
    }
    const habilitado=rb?rb.habilitado:true;
    const r={linea,fecha,bloque:bk,habilitado,inicioMs,finMs,duracionMin:(finMs-inicioMs)/60000,horario:hhmm(inicioMs)+'–'+hhmm(finMs),inicioHHMM:hhmm(inicioMs),finHHMM:hhmm(finMs),etiqueta,
      origen,reglaId,habilitacionReglaId:rb?rb.id:'',versionHorarios:doc.version,
      tolerancia:bk==='NOCHE'&&habilitado?{min:TOLERANCIA_MIN,finMs:finMs+TOLERANCIA_MIN*60000,hasta:hhmm(finMs+TOLERANCIA_MIN*60000)}:null};
    return r;
  };
  /* Referencia inmutable al horario aplicado (se guarda en planes/registros/reportes nuevos). */
  H.referencia=(linea,fecha,bloque)=>{const r=H.resolver(linea,fecha,bloque);return r?{horario:r.horario,inicioMs:r.inicioMs,finMs:r.finMs,origen:r.origen,reglaId:r.reglaId,version:r.versionHorarios}:null;};
  H.habilitado=(linea,fecha,bloque)=>{const r=H.resolver(linea,fecha,bloque);return !r||r.habilitado;};
  /* ¿Ahora (ms) está en la tolerancia de registro/cierre de una Noche? → {fecha,bloque:'NOCHE',lineas:[…],finMs,hasta} o null. Busca en el día operativo anterior y en el actual. */
  H.toleranciaActual=function(ahora,lineas){
    const t=Number.isFinite(Number(ahora))?Number(ahora):ahoraMs();
    const d0=new Date(t);
    for(let k=-1;k<=0;k++){
      const f=NS.util.iso(new Date(d0.getFullYear(),d0.getMonth(),d0.getDate()+k));
      const ls=(lineas||LINEAS()).map(l=>H.resolver(l,f,'NOCHE')).filter(r=>r&&r.habilitado&&r.tolerancia&&t>=r.finMs&&t<r.tolerancia.finMs);
      if(ls.length)return {fecha:f,bloque:'NOCHE',lineas:ls.map(r=>r.linea),finMs:ls[0].finMs,hasta:ls[0].tolerancia.hasta};
    }
    return null;
  };
  H.textoTolerancia=()=>'Noche · En tolerancia para registro/cierre';

  /* ---------- validación y guardado ---------- */
  const intersecta=(a,b)=>{
    const af=a.tipoVigencia==='FECHA'?a.desde:(a.hasta||'9999-12-31'),bf=b.tipoVigencia==='FECHA'?b.desde:(b.hasta||'9999-12-31');
    return a.desde<=bf&&b.desde<=af;
  };
  const textoVig=r=>r.tipoVigencia==='FECHA'?'el '+r.desde:r.tipoVigencia==='RANGO'?'del '+r.desde+' al '+r.hasta:'desde el '+r.desde+' hasta nuevo cambio';
  H.textoRegla=r=>(r.kind==='HABILITACION'?(r.habilitado?'Habilitar':'Deshabilitar'):r.base?'Restablecer horario predeterminado de':'Horario '+r.inicio+'–'+r.fin+(r.etiqueta?' ('+r.etiqueta+')':'')+' en')+' '+(r.bloque==='NOCHE'?'Noche':'Mañana + Intermedio')+' · '+r.lineas.map(l=>NS.nombreLinea(l)).join(', ')+' · '+textoVig(r);
  /* r: {kind,lineas,bloque,base,inicio,fin,habilitado,etiqueta,tipoVigencia,desde,hasta,motivo}. existentes: reglas vigentes del documento. Devuelve errores[]. */
  H.validar=function(r,existentes){
    const e=[];
    if(!r.lineas||!r.lineas.length)e.push('Elige al menos una línea.');
    else if(r.lineas.some(l=>!LINEAS().includes(l)))e.push('Hay una línea que no es válida.');
    if(r.kind!=='HORARIO'&&r.kind!=='HABILITACION')e.push('Elige si cambias el horario o habilitas el bloque.');
    if(!['FECHA','RANGO','ABIERTA'].includes(r.tipoVigencia))e.push('Elige la vigencia.');
    if(!fechaOk(r.desde))e.push('Indica la fecha de inicio de la vigencia (no se asume ninguna).');
    if(r.tipoVigencia==='RANGO'&&(!fechaOk(r.hasta)||r.hasta<r.desde))e.push('El rango necesita una fecha final igual o posterior a la inicial.');
    if(r.kind==='HORARIO'&&!r.base){
      if(!hhmmOk(r.inicio)||!hhmmOk(r.fin))e.push('Indica la hora de inicio y la de fin (HH:MM).');
      else{const d=(aMin(r.fin)-aMin(r.inicio)+1440)%1440;if(d<=0)e.push('La duración debe ser positiva (el inicio y el fin no pueden ser iguales).');}
    }
    if(String(r.motivo||'').trim().length<5)e.push('Escribe el motivo o la instrucción de Gerencia (mínimo 5 caracteres).');
    if(e.length)return e;
    // vigencias superpuestas de igual especificidad (no se resuelven por orden accidental)
    (existentes||[]).filter(x=>x.activo&&x.kind===r.kind&&x.bloque===r.bloque&&x.id!==r.id&&x.tipoVigencia===r.tipoVigencia&&x.lineas.some(l=>r.lineas.includes(l))).forEach(x=>{
      if(r.tipoVigencia==='ABIERTA'?x.desde===r.desde:intersecta(x,r))e.push('Se superpone con otra regla de igual prioridad ('+H.textoRegla(x)+'): desactívala o cambia las fechas.');
    });
    if(e.length)return e;
    // conflicto de ventanas productivas de una misma línea (Mañana + Intermedio y Noche no pueden solaparse)
    if(r.kind==='HORARIO'||r.kind==='HABILITACION'){
      const cand=Object.assign({activo:true,id:r.id||'__nueva'},r);
      const todas=(existentes||[]).filter(x=>x.id!==r.id).concat([cand]);
      const fechas=[r.desde];if(r.hasta)fechas.push(r.hasta);fechas.push(addDias(r.desde,1));
      r.lineas.forEach(l=>fechas.forEach(f=>{
        const par=[[H.resolver(l,f,'DÍA',todas),H.resolver(l,f,'NOCHE',todas)],[H.resolver(l,addDias(f,-1),'NOCHE',todas),H.resolver(l,f,'DÍA',todas)]];
        par.forEach(([a,b])=>{
          if(!a||!b||!a.habilitado||!b.habilitado)return;
          if(a.inicioMs<b.finMs&&b.inicioMs<a.finMs){const m=NS.nombreLinea(l)+': el horario '+(a.bloque==='NOCHE'?'de Noche':'diurno')+' ('+a.horario+') se solapa con el de '+(b.bloque==='NOCHE'?'Noche':'Mañana + Intermedio')+' ('+b.horario+') cerca del '+f+'.';if(!e.includes(m))e.push(m);}
        });
      }));
    }
    return e;
  };
  const quien=()=>{const u=(typeof state!=='undefined'&&state.user)||{};let uid='';try{uid=(firebase.auth().currentUser||{}).uid||'';}catch(_){/* sin sesión */}return {nombre:u.nombre||u.username||'',uid};};
  const sinConexion=()=>!!(window.glacialEstadoDatos&&window.glacialEstadoDatos.enLinea===false);
  const idNuevo=()=>'hr_'+ahoraMs().toString(36)+Math.random().toString(36).slice(2,6);
  /* Escribe UNA O VARIAS reglas (o un cambio de activo) en una transacción, con versión e historial. lista: [{...regla}] (id vacío = nueva). */
  async function escribir(lista,opc){
    if(!NS.puede())throw new Error('Solo Planificación puede configurar el horario de producción.');
    if(window.glacialVista&&window.glacialVista.activo&&window.glacialVista.activo())throw new Error('En modo visualización no se puede cambiar el horario.');
    if(sinConexion())throw new Error('Sin conexión: el cambio NO se guardó. Inténtalo cuando vuelva la conexión.');
    const q=quien();
    if(!q.uid)throw new Error('No hay una sesión segura activa: no se puede registrar quién cambia el horario.');
    const ref=db.collection('sync').doc('catalogoPlanificacion');
    let resultado=null;
    await db.runTransaction(async tx=>{
      resultado=null;
      const snap=await tx.get(ref),actual=snap.exists?snap.data():{};
      const d=normalizar(actual.horarios);
      const reglas=d.reglas.slice(),eventos=[];
      lista.forEach(x=>{
        const idx=x.id?reglas.findIndex(r=>r.id===x.id):-1;
        if(x.id&&idx<0)throw new Error('La regla ya no existe (otra persona la quitó).');
        if(idx>=0&&x.esperadoEn!==undefined&&num(reglas[idx].actualizadoEn)!==num(x.esperadoEn))throw new Error('La regla cambió mientras la editabas. Ciérrala y vuelve a abrirla.');
        const nueva=Object.assign({},idx>=0?reglas[idx]:{},x,{id:x.id||idNuevo(),activo:x.activo!==false,responsable:x.responsable||q.nombre,actualizadoPor:q.nombre,actualizadoUid:q.uid,actualizadoEn:ahoraMs()});
        delete nueva.esperadoEn;
        const antes=idx>=0?H.textoRegla(reglas[idx])+(reglas[idx].activo?'':' (desactivada)'):'';
        if(idx>=0)reglas[idx]=nueva;else reglas.push(nueva);
        eventos.push({antes,despues:H.textoRegla(nueva)+(nueva.activo?'':' (desactivada)'),regla:nueva});
      });
      // Se valida el RESULTADO completo (varias reglas de un mismo lote dependen unas de otras, p. ej. Intermedio 14:00–22:00 y Noche 22:00–07:00).
      if(!(opc&&opc.soloActivo))eventos.forEach(ev=>{
        const errores=ev.regla.activo?H.validar(ev.regla,reglas.filter(r=>r.id!==ev.regla.id)):[];
        if(errores.length)throw new Error(errores.join('\n'));
      });
      const version=d.version+1;
      tx.set(ref,Object.assign({},actual,{horarios:{version,reglas},updatedAt:Date.now()}));
      eventos.forEach(ev=>{
        const h=typeof NS.armarEvento==='function'?NS.armarEvento({accion:'EDICION',linea:ev.regla.lineas.join(','),fecha:ev.regla.desde,turno:ev.regla.bloque,motivo:(opc&&opc.motivo)||ev.regla.motivo,referencia:'HORARIOS: '+ev.despues,
          extra:{horarios:{antes:ev.antes,despues:ev.despues,vigencia:textoVig(ev.regla),version,lineas:ev.regla.lineas,bloque:ev.regla.bloque}}}):null;
        if(h)tx.set(db.collection('historialProgramacion').doc(h.id),h.doc);
      });
      resultado={version,reglas:eventos.map(e=>e.regla)};
    });
    doc=normalizar({version:resultado.version,reglas:doc.reglas.filter(r=>!resultado.reglas.some(x=>x.id===r.id)).concat(resultado.reglas)});
    if(typeof NS.refrescar==='function')NS.refrescar();
    return resultado;
  }
  H.guardarRegla=r=>escribir([r],{});
  H.cambiarActivo=async function(id,activo,motivo){
    const r=doc.reglas.find(x=>x.id===id);
    if(!r)throw new Error('La regla ya no existe.');
    return escribir([Object.assign({},r,{activo:!!activo})],{soloActivo:!activo,motivo:motivo||(activo?'Regla activada':'Regla desactivada')});
  };
  /* Restablecer horario predeterminado: desde la fecha indicada, las líneas elegidas vuelven al horario base de ese bloque. NO cambia la habilitación. */
  H.restablecer=(lineas,bloque,desde,motivo)=>escribir([{kind:'HORARIO',base:true,lineas,bloque:bl(bloque),tipoVigencia:'ABIERTA',desde,hasta:'',inicio:'',fin:'',etiqueta:'',habilitado:true,motivo}],{});
  /* Configuración aprobada (NO se activa sola): Noche 22:00–07:00 para las líneas con Noche, C20L/B20L Intermedio 14:00–22:00 sin Noche. Exige fecha de inicio explícita. */
  H.configuracionAprobada=function(desde,motivo){
    const base={tipoVigencia:'ABIERTA',desde,hasta:'',motivo,habilitado:true};
    const conNoche=LINEAS().filter(l=>!['C20L','B20L'].includes(l));
    return [Object.assign({kind:'HORARIO',lineas:conNoche,bloque:'NOCHE',inicio:'22:00',fin:'07:00',etiqueta:''},base),
      Object.assign({kind:'HORARIO',lineas:LINEAS().filter(l=>['C20L','B20L'].includes(l)),bloque:'DÍA',inicio:'14:00',fin:'22:00',etiqueta:'Intermedio'},base),
      Object.assign({kind:'HABILITACION',lineas:LINEAS().filter(l=>['C20L','B20L'].includes(l)),bloque:'NOCHE'},base,{habilitado:false})];
  };
  H.aplicarConfiguracionAprobada=function(desde,motivo){
    if(!fechaOk(desde))return Promise.reject(new Error('Indica la fecha de inicio de la vigencia: no se asume ninguna.'));
    return escribir(H.configuracionAprobada(desde,motivo),{motivo});
  };

  /* ---------- integración con Planificación ---------- */
  NS.horarios=H;
  /* Horario por línea de una selección (texto corto). */
  H.horarioTexto=(linea,fecha,bloque)=>{const r=H.resolver(linea,fecha,bloque);return r?r.horario:'';};
  /* Una línea con otro horario que el global: para mostrar el horario por línea en vistas que agrupan líneas. */
  H.resumenSeleccion=function(fecha,bloque){
    return LINEAS().map(l=>H.resolver(l,fecha,bloque)).filter(Boolean);
  };

  /* Resumen visible en Programación: horario POR LÍNEA de la selección (no un único inicio/fin como si valiera para todas) y la etiqueta de tolerancia de Noche. */
  H.htmlResumen=function(fecha,bloque){
    if(!fechaOk(fecha))return '';
    const bk=bl(bloque),rs=H.resumenSeleccion(fecha,bk),hab=rs.filter(r=>r.habilitado),des=rs.filter(r=>!r.habilitado);
    const dist=[...new Set(hab.map(r=>r.horario))];
    const etq=r=>r.etiqueta&&r.etiqueta!==NS.etiquetaBloque(bk)?' ('+esc(r.etiqueta)+')':'';
    let h='<div class="plan-nota" id="plan-horarios-linea"><b>Horario de producción · '+esc(NS.etiquetaBloque(bk))+'</b>: '+
      (!hab.length?'ninguna línea habilitada':dist.length===1&&!hab.some(r=>etq(r))?esc(dist[0])+' (líneas habilitadas: '+hab.map(r=>esc(NS.nombreLinea(r.linea))).join(', ')+')':hab.map(r=>esc(NS.nombreLinea(r.linea))+' '+esc(r.horario)+etq(r)).join(' · '))+
      (des.length?' · <span class="plan-chip gris">Deshabilitado: '+des.map(r=>esc(NS.nombreLinea(r.linea))).join(', ')+'</span>':'');
    const t=bk==='NOCHE'?H.toleranciaActual(ahoraMs()):null;
    if(t&&t.fecha===fecha)h+=' · <span class="plan-chip naranja">'+esc(H.textoTolerancia())+' (hasta '+esc(t.hasta)+')</span>';
    return h+'</div>';
  };

  /* No se crean planes nuevos en un bloque deshabilitado (los históricos existentes se conservan). */
  const validarAnterior=NS.validar;
  NS.validar=function(f){
    const v=validarAnterior.apply(this,arguments);
    try{
      if(!v.errores.length&&f&&f.linea&&fechaOk(f.fecha)){
        const r=H.resolver(f.linea,f.fecha,f.turno);
        const ex=NS.existente(f.linea,f.fecha,NS.turnoDeGuardado(f),f.marca,f.presentacion);
        if(r&&!r.habilitado&&!(ex&&NS.filaVigente&&NS.filaVigente(ex)))v.errores.push((r.bloque==='NOCHE'?'Noche':'Este bloque')+' está deshabilitado para '+NS.nombreLinea(f.linea)+' en esa fecha: no se programa producción nueva.');
      }
    }catch(_){/* sin horario configurado */}
    return v;
  };

  /* ---------- pestaña «Horario de producción» ---------- */
  const fechaTxt=f=>String(f).split('-').reverse().join('/');
  /* Origen legible del horario (nunca el id interno de la regla). */
  const textoOrigen=r=>{
    const x=doc.reglas.find(y=>y.id===r.reglaId);
    return x?'configurado '+textoVig(x)+(x.motivo?' · '+x.motivo:''):'configurado';
  };
  function pintar(cont){
    const E=NS.estado,planifica=NS.puede();
    const filas=NS.lineas().map(l=>{
      const d=H.resolver(l.key,E.fecha,'DÍA'),n=H.resolver(l.key,E.fecha,'NOCHE');
      const celda=r=>r?(r.habilitado?'<b>'+esc(r.horario)+'</b>'+(r.etiqueta&&r.bloque==='DÍA'&&r.etiqueta!==NS.etiquetaBloque('DÍA')?' <small>('+esc(r.etiqueta)+')</small>':'')+(r.tolerancia?'<small class="plan-subt">tolerancia de registro/cierre hasta '+esc(r.tolerancia.hasta)+'</small>':''):'<span class="plan-chip gris">Deshabilitado</span>')+
        '<small class="plan-subt">'+(r.origen==='BASE'?'horario predeterminado':r.origen==='RESTABLECIDO'?'restablecido al predeterminado':esc(textoOrigen(r)))+'</small>':'—';
      return '<tr><td><b>'+esc(l.name)+'</b></td><td>'+celda(d)+'</td><td>'+celda(n)+'</td></tr>';
    }).join('');
    const reglas=H.datos().reglas.slice().sort((a,b)=>b.desde.localeCompare(a.desde)||b.actualizadoEn-a.actualizadoEn);
    const hoy=E.fecha;
    const estadoR=r=>!r.activo?'Desactivada':r.tipoVigencia!=='ABIERTA'&&(r.tipoVigencia==='FECHA'?r.desde:r.hasta)<hoy?'Vencida':r.desde>hoy?'Futura':'Vigente';
    const opcLin=NS.lineas().map(l=>'<label style="flex-direction:row;align-items:center;gap:6px;font-weight:500"><input type="checkbox" name="hz-linea" value="'+esc(l.key)+'"> '+esc(l.name)+'</label>').join('');
    cont.innerHTML='<div class="plan-bar" style="margin-bottom:10px"><label class="plan-f">Fecha operativa<input type="date" id="hz-fecha" value="'+esc(E.fecha)+'"></label><span class="plan-nota" style="align-self:center">Horarios resueltos para esa fecha (el pasado conserva su horario original).</span></div>'+
      '<div class="plan-scroll"><table class="plan-tabla"><thead><tr><th>Línea</th><th>Mañana + Intermedio</th><th>Noche</th></tr></thead><tbody>'+filas+'</tbody></table></div>'+
      '<p class="plan-nota">Noche termina a las 07:00 y tolera hasta 30 min después solo para completar el registro y el cierre: no suma capacidad, no adelanta la apertura ni finaliza máquinas. Sin reglas rige el horario general de siempre.</p>'+
      (planifica?'<h4 class="plan-h4">Configurar horario de producción</h4><div class="plan-campos" id="hz-form" style="background:#fff;border:1px solid #e3eaf0;border-radius:12px;padding:12px">'+
        '<label class="completo">Líneas<span style="display:flex;gap:12px;flex-wrap:wrap">'+opcLin+'</span></label>'+
        '<label>Qué cambias<select id="hz-kind"><option value="HORARIO">Horario de producción</option><option value="HABILITACION">Habilitar o deshabilitar el bloque</option></select></label>'+
        '<label>Bloque<select id="hz-bloque"><option value="DÍA">Mañana + Intermedio</option><option value="NOCHE">Noche</option></select></label>'+
        '<label class="hz-h">Hora de inicio<input type="time" id="hz-ini"></label><label class="hz-h">Hora de fin<input type="time" id="hz-fin"></label>'+
        '<label class="hz-h completo">Etiqueta (opcional, p. ej. Intermedio)<input type="text" id="hz-etq" maxlength="40"></label>'+
        '<label class="hz-e" style="display:none">Estado del bloque<select id="hz-hab"><option value="1">Habilitado</option><option value="0">Deshabilitado</option></select></label>'+
        '<label>Vigencia<select id="hz-vig"><option value="ABIERTA">Desde una fecha hasta nuevo cambio</option><option value="FECHA">Una sola fecha</option><option value="RANGO">Rango de fechas</option></select></label>'+
        '<label>Desde<input type="date" id="hz-desde"></label><label class="hz-r" style="display:none">Hasta<input type="date" id="hz-hasta"></label>'+
        '<label class="completo">Motivo o instrucción de Gerencia<textarea id="hz-motivo" rows="2" maxlength="200"></textarea></label>'+
        '<label class="completo">Responsable del cambio<input type="text" id="hz-resp" readonly value="'+esc((state.user&&(state.user.nombre||state.user.username))||'')+'"></label></div>'+
        '<div class="plan-error" id="hz-error" role="alert"></div><div class="plan-acciones" style="justify-content:flex-start;flex-wrap:wrap"><button type="button" class="btn btn-primary" id="hz-guardar">Guardar horario</button>'+
        '<button type="button" class="btn btn-ghost" id="hz-restablecer">Restablecer horario predeterminado</button><button type="button" class="btn btn-ghost" id="hz-aprobada">Aplicar configuración aprobada…</button></div>':'<p class="plan-nota">Solo lectura: configurar el horario requiere el permiso de Planificación.</p>')+
      '<h4 class="plan-h4">Reglas</h4><div class="plan-scroll"><table class="plan-tabla"><thead><tr><th>Regla</th><th>Estado</th><th>Motivo</th><th>Responsable</th><th></th></tr></thead><tbody>'+
      (reglas.length?reglas.map(r=>'<tr><td>'+esc(H.textoRegla(r))+'</td><td>'+estadoR(r)+'</td><td>'+esc(r.motivo)+'</td><td>'+esc(r.responsable||r.actualizadoPor)+'<small class="plan-subt">'+esc(new Date(r.actualizadoEn).toLocaleString('es-PE'))+'</small></td><td>'+
        (planifica?'<button type="button" class="btn btn-ghost btn-sm" data-hz-activo="'+esc(r.id)+'" data-v="'+(r.activo?'0':'1')+'">'+(r.activo?'Desactivar':'Activar')+'</button>':'')+'</td></tr>').join(''):'<tr><td colspan="5" class="plan-nota">Todavía no hay reglas: rige el horario general de siempre (nada se activa solo).</td></tr>')+'</tbody></table></div>';
  }
  const q=id=>document.getElementById(id);
  const leerForm=()=>{
    const lineas=[...document.querySelectorAll('input[name="hz-linea"]:checked')].map(x=>x.value);
    const kind=q('hz-kind').value;
    return {kind,lineas,bloque:q('hz-bloque').value,base:false,inicio:kind==='HORARIO'?q('hz-ini').value:'',fin:kind==='HORARIO'?q('hz-fin').value:'',etiqueta:kind==='HORARIO'?q('hz-etq').value.trim():'',
      habilitado:kind==='HABILITACION'?q('hz-hab').value==='1':true,tipoVigencia:q('hz-vig').value,desde:q('hz-desde').value,hasta:q('hz-vig').value==='RANGO'?q('hz-hasta').value:'',motivo:q('hz-motivo').value.trim()};
  };
  document.addEventListener('change',e=>{
    const t=e.target;if(!t||!t.id||!document.getElementById('hz-form'))return;
    if(t.id==='hz-kind'){document.querySelectorAll('.hz-h').forEach(x=>x.style.display=t.value==='HORARIO'?'':'none');document.querySelectorAll('.hz-e').forEach(x=>x.style.display=t.value==='HABILITACION'?'':'none');}
    if(t.id==='hz-vig'){document.querySelectorAll('.hz-r').forEach(x=>x.style.display=t.value==='RANGO'?'':'none');}
    if(t.id==='hz-fecha'&&fechaOk(t.value)){NS.estado.fecha=t.value;const c=document.getElementById('plan-cuerpo');if(c)pintar(c);}
  });
  const accion=async(btn,f)=>{
    const err=q('hz-error');if(err)err.textContent='';btn.disabled=true;
    try{await f();const c=document.getElementById('plan-cuerpo');if(c)pintar(c);}
    catch(x){const e2=q('hz-error');if(e2)e2.textContent=(x&&x.message)||String(x);}
    finally{btn.disabled=false;}
  };
  document.addEventListener('click',e=>{
    const b=e.target.closest&&e.target.closest('#hz-guardar,#hz-restablecer,#hz-aprobada,[data-hz-activo]');
    if(!b||!document.getElementById('plan-root'))return;
    if(b.id==='hz-guardar')accion(b,()=>H.guardarRegla(leerForm()));
    else if(b.id==='hz-restablecer')accion(b,()=>{const f=leerForm();return H.restablecer(f.lineas,f.bloque,f.desde,f.motivo);});
    else if(b.id==='hz-aprobada')accion(b,()=>{const f=leerForm();return H.aplicarConfiguracionAprobada(f.desde,f.motivo);});
    else accion(b,()=>H.cambiarActivo(b.getAttribute('data-hz-activo'),b.getAttribute('data-v')==='1',q('hz-motivo')?q('hz-motivo').value.trim():''));
  });
  /* «Horario de producción» ya no es una pestaña de Planificación: se abre desde el grupo Producción del menú (52b-planificacion-vistas.js). */
  NS.pestanas.push({clave:'horarios',titulo:'Horario de producción',orden:6,pintar,actualizar:()=>{const c=document.getElementById('plan-cuerpo');if(c&&NS.estado.tab==='horarios'&&!document.activeElement.closest('#hz-form'))pintar(c);}});
})();
