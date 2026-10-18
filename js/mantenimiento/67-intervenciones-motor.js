/* =============================================================
   MANTENIMIENTO · INTERVENCIONES (órdenes de trabajo) · MOTOR PURO

   Funciones SIN pantalla ni base de datos: reciben una intervención y devuelven la nueva (o lanzan un error con un mensaje claro). La persistencia
   (67b) las aplica DENTRO de una transacción sobre la versión más reciente del documento, así dos técnicos que tocan campos distintos no se pisan y
   un doble cierre produce una sola transición válida.

   MODELO (colección intervenciones, un documento por intervención; ver docs/mantenimiento/mantenimiento-intervenciones.md)
     estado        PENDIENTE · EN_INTERVENCION · EN_ESPERA (con motivo) · CERRADA · CANCELADA (con motivo). NO es el estado operativo de la línea:
                   cerrar una intervención NO reanuda la línea y reanudar la línea NO cierra la intervención.
     historial     solo se agrega (una entrada por acción: quién, cuándo, de qué estado a cuál, detalle).
     autor         cada acción lleva el técnico identificado (PIN) y, por separado, el uid de la cuenta; el UID compartido no identifica al técnico.
     tiempos       apertura, inicio real, fin real y cierre registrado: el motor separa respuesta, trabajo, espera y tiempo administrativo.
   Nada de esto crea paradas oficiales de Avance/Cierre ni toca el ratio de producción.
   ============================================================= */
(function(raiz){
  'use strict';
  const M={};
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const txt=v=>String(v==null?'':v).trim();

  M.LINEAS=['PET1','PET2','B7L','C20L','B20L'];
  M.ESTADOS={PENDIENTE:'Pendiente',EN_INTERVENCION:'En intervención',EN_ESPERA:'En espera',CERRADA:'Cerrada',CANCELADA:'Cancelada'};
  M.ABIERTOS=['PENDIENTE','EN_INTERVENCION','EN_ESPERA'];
  M.TIPOS={CORRECTIVO:'Correctivo',PREVENTIVO:'Preventivo',MEJORA:'Mejora / modificación',OTRO:'Otro'};
  M.PRIORIDADES={BAJA:'Baja',MEDIA:'Media',ALTA:'Alta',CRITICA:'Crítica'};
  M.MOTIVOS_ESPERA={REPUESTO:'Espera de repuesto',AUTORIZACION:'Espera de autorización',ACCESO:'Espera de acceso al equipo',OTRO:'Otro motivo'};
  M.RESULTADOS={OPERATIVO_VERIFICADO:'Operativo, verificación realizada',OPERATIVO_OBSERVACION:'Operativo con observación o restricción',NO_OPERATIVO:'No operativo; requiere seguimiento'};
  M.UNIDADES=['UND','Juego','Litro','Metro','Kg','Rollo','Caja','Otro'];
  M.MIN_TEXTO=10;                       // diagnóstico y acción realizada: no basta una palabra
  M.SECCIONES_EVIDENCIA={PROBLEMA:'Problema',TRABAJO:'Trabajo realizado',CIERRE:'Cierre'};M.MAX_EVIDENCIAS=12;
  M.MAX_PARTICIPANTES=12;M.MAX_REPUESTOS=40;M.MAX_HISTORIAL=400;M.MAX_SEGUIMIENTOS=20;
  const TRANSICIONES={PENDIENTE:['EN_INTERVENCION','CANCELADA','CERRADA'],EN_INTERVENCION:['EN_ESPERA','CERRADA','CANCELADA'],EN_ESPERA:['EN_INTERVENCION','CERRADA','CANCELADA'],CERRADA:[],CANCELADA:[]};
  M.puedeTransicion=(de,a)=>(TRANSICIONES[de]||[]).includes(a);
  M.estaAbierta=e=>M.ABIERTOS.includes(e);
  M.SIN_EQUIPO='Sin equipo identificado';

  const err=(msg,extra)=>{const e=new Error(msg);if(extra)Object.assign(e,extra);return e;};
  const idCorto=p=>p+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  M.idNuevo=idCorto;

  /* Quién actúa: el técnico identificado (o el usuario) y, por separado, la cuenta. */
  M.autor=q=>({nombre:txt(q&&q.nombre),tecnicoId:txt(q&&q.tecnicoId),uid:txt(q&&q.uid),cuenta:txt(q&&q.cuenta),identificadoPor:txt(q&&q.identificadoPor)||'USUARIO',tokenPin:(q&&q.tokenPin)||null,rol:txt(q&&q.rol)});
  const mismoTecnico=(a,b)=>(a.tecnicoId&&b.tecnicoId)?a.tecnicoId===b.tecnicoId:(a.nombre&&a.nombre===b.nombre);

  function agregarHistorial(d,ahora,accion,por,detalle,de,a,campos){
    const h=(Array.isArray(d.historial)?d.historial:[]).slice();
    if(h.length>=M.MAX_HISTORIAL)throw err('La intervención alcanzó el máximo de movimientos registrados.');
    h.push({id:idCorto('h'),en:ahora,accion,por,detalle:txt(detalle).slice(0,400),de:de||'',a:a||'',campos:campos||null});
    return h;
  }
  const base=d=>Object.assign({},d,{participantes:(d.participantes||[]).slice(),repuestos:(d.repuestos||[]).slice(),seguimiento:(d.seguimiento||[]).slice(),evidencias:(d.evidencias||[]).slice(),historial:(d.historial||[]).slice()});

  /* ---------- apertura ---------- */
  /* datos: {linea, equipoId, equipoNombre, tipo, prioridad, problema, origen:{tipo,id,paradaId,eventoId,plan}, id}. Devuelve el documento nuevo. */
  M.nueva=function(datos,quien,ahora,opciones){
    const o=opciones||{},d=datos||{},por=M.autor(quien);
    const errores=[];
    if(!M.LINEAS.includes(d.linea))errores.push('Elige la línea.');
    const tipo=M.TIPOS[d.tipo]?d.tipo:'CORRECTIVO';
    const prioridad=M.PRIORIDADES[d.prioridad]?d.prioridad:'MEDIA';
    if(txt(d.problema).length<5)errores.push('Describe el problema (mínimo 5 caracteres).');
    if(!por.nombre)errores.push('No se sabe quién abre la intervención: identifícate.');
    if(errores.length)throw err(errores.join(' '),{errores});
    const equipoId=txt(d.equipoId);
    const origen=d.origen&&typeof d.origen==='object'?{tipo:txt(d.origen.tipo)||'MANUAL',id:txt(d.origen.id),paradaId:txt(d.origen.paradaId),eventoId:txt(d.origen.eventoId),plan:d.origen.plan||null}:{tipo:'MANUAL',id:'',paradaId:'',eventoId:'',plan:null};
    const inicia=!!o.iniciar;
    const estado=inicia?'EN_INTERVENCION':'PENDIENTE';
    const doc={
      id:txt(d.id)||idCorto('i'),version:1,linea:d.linea,
      equipoId,equipoNombre:equipoId?txt(d.equipoNombre):'',equipoPendiente:!equipoId,equipoJustificacion:'',
      tipo,prioridad,problema:txt(d.problema).slice(0,600),origen,
      estado,abierta:true,espera:null,
      abiertaPor:por,abiertaMs:ahora,
      participantes:[{tecnicoId:por.tecnicoId,nombre:por.nombre,desde:ahora,rol:'RESPONSABLE'}],
      inicioRealMs:inicia?ahora:0,finRealMs:0,
      diagnostico:'',accion:'',resultado:'',pendientes:'',observaciones:'',
      repuestos:[],sinRepuestos:false,seguimiento:[],evidencias:[],cierre:null,cancelacion:null,verificacion:null,
      tareas:Array.isArray(d.tareas)?d.tareas.map(x=>({id:txt(x.id),titulo:txt(x.titulo),descripcion:txt(x.descripcion),estado:'PENDIENTE',motivo:'',por:null,en:0})):[],plan:d.plan||null,planId:txt(d.planId),planFecha:txt(d.planFecha),
      historial:[]
    };
    doc.historial=agregarHistorial(doc,ahora,'ABRIR',por,(M.TIPOS[tipo]||tipo)+' · '+(equipoId?doc.equipoNombre:M.SIN_EQUIPO+' (por identificar)')+' · '+doc.problema,'',estado);
    return doc;
  };

  /* ---------- acciones sobre una intervención abierta ---------- */
  const exigirAbierta=d=>{if(!M.estaAbierta(d.estado))throw err(d.estado==='CERRADA'?'La intervención ya está cerrada'+(d.cierre?' ('+d.cierre.por.nombre+')':'')+': no se puede modificar. Una corrección requiere permiso, motivo y queda en el historial.':'La intervención está cancelada.',{codigo:'NO_ABIERTA'});};
  const registrarParticipante=(d,por,ahora,rol)=>{
    if(d.participantes.some(p=>mismoTecnico(p,por)))return false;
    if(d.participantes.length>=M.MAX_PARTICIPANTES)throw err('Máximo '+M.MAX_PARTICIPANTES+' participantes.');
    d.participantes.push({tecnicoId:por.tecnicoId,nombre:por.nombre,desde:ahora,rol:rol||'PARTICIPANTE'});
    return true;
  };

  /* Aplica UNA acción y devuelve la intervención nueva (con su entrada de historial). quien = {…técnico…}; ahora = ms del servidor. */
  M.aplicar=function(doc,accion,datos,quien,ahora,permisos){
    const d=base(doc),p=datos||{},por=M.autor(quien),perm=permisos||{};
    if(!por.nombre)throw err('No se sabe quién hace el cambio: identifícate.');
    const de=d.estado;
    const hist=(det,a,campos)=>{d.historial=agregarHistorial(d,ahora,accion,por,det,de,a||de,campos);};
    switch(accion){
      case 'INICIAR':{
        exigirAbierta(d);
        if(de==='EN_INTERVENCION')throw err('La intervención ya está en curso.',{codigo:'YA_EN_CURSO'});
        d.estado='EN_INTERVENCION';d.espera=null;
        if(!d.inicioRealMs)d.inicioRealMs=ahora;
        registrarParticipante(d,por,ahora,d.participantes.length?'PARTICIPANTE':'RESPONSABLE');
        hist('Inició el trabajo','EN_INTERVENCION');break;
      }
      case 'ESPERA':{
        exigirAbierta(d);
        if(de==='EN_ESPERA')throw err('La intervención ya está en espera.',{codigo:'YA_EN_ESPERA'});
        if(!M.MOTIVOS_ESPERA[p.motivo])throw err('Indica el motivo de la espera (repuesto, autorización, acceso al equipo u otro).');
        const detalle=txt(p.detalle);
        if(p.motivo==='OTRO'&&detalle.length<5)throw err('Describe el motivo de la espera (mínimo 5 caracteres).');
        d.estado='EN_ESPERA';d.espera={motivo:p.motivo,detalle:detalle.slice(0,200),desdeMs:ahora,por};
        hist((M.MOTIVOS_ESPERA[p.motivo])+(detalle?': '+detalle:''),'EN_ESPERA');break;
      }
      case 'RETOMAR':{
        exigirAbierta(d);
        if(de!=='EN_ESPERA')throw err('Solo se retoma una intervención que está en espera.',{codigo:'NO_ESTA_EN_ESPERA'});
        d.estado='EN_INTERVENCION';const dur=d.espera?ahora-num(d.espera.desdeMs):0;d.espera=null;
        if(!d.inicioRealMs)d.inicioRealMs=ahora;
        registrarParticipante(d,por,ahora);
        hist('Retomó el trabajo'+(dur>0?' tras '+Math.round(dur/60000)+' min de espera':''),'EN_INTERVENCION');break;
      }
      case 'PARTICIPAR':{
        exigirAbierta(d);
        if(!registrarParticipante(d,por,ahora))throw err('Ya figuras como participante.',{codigo:'YA_PARTICIPA'});
        hist('Se unió a la intervención');break;
      }
      case 'DATOS':{                    // problema, prioridad o tipo (no el estado)
        exigirAbierta(d);
        const cambios={};
        if(p.problema!==undefined){if(txt(p.problema).length<5)throw err('Describe el problema (mínimo 5 caracteres).');cambios.problema=[d.problema,txt(p.problema).slice(0,600)];d.problema=cambios.problema[1];}
        if(p.prioridad!==undefined){if(!M.PRIORIDADES[p.prioridad])throw err('Prioridad no válida.');cambios.prioridad=[d.prioridad,p.prioridad];d.prioridad=p.prioridad;}
        if(p.diagnostico!==undefined){cambios.diagnostico=[d.diagnostico,txt(p.diagnostico).slice(0,800)];d.diagnostico=cambios.diagnostico[1];}
        if(p.accion!==undefined){cambios.accion=[d.accion,txt(p.accion).slice(0,800)];d.accion=cambios.accion[1];}
        if(!Object.keys(cambios).length)throw err('No hay cambios que guardar.');
        hist('Actualizó '+Object.keys(cambios).join(', '),null,cambios);break;
      }
      case 'EQUIPO':{
        exigirAbierta(d);
        const id=txt(p.equipoId);
        if(!id)throw err('Elige el equipo.');
        const antes=d.equipoNombre||M.SIN_EQUIPO;
        d.equipoId=id;d.equipoNombre=txt(p.equipoNombre);d.equipoPendiente=false;d.equipoJustificacion='';
        hist('Equipo: '+d.equipoNombre+' (antes: '+antes+')',null,{equipo:[antes,d.equipoNombre]});break;
      }
      case 'REPUESTO':{
        exigirAbierta(d);
        const descripcion=txt(p.descripcion),codigo=txt(p.codigo),cant=Number(p.cantidad);
        if(!descripcion&&!codigo)throw err('Indica el código o la descripción del repuesto o material.');
        if(!(cant>0)||!Number.isFinite(cant)||cant>100000)throw err('La cantidad debe ser un número mayor que cero.');
        if(!M.UNIDADES.includes(p.unidad))throw err('Elige la unidad.');
        if(d.repuestos.filter(r=>!r.anulado).length>=M.MAX_REPUESTOS)throw err('Máximo '+M.MAX_REPUESTOS+' repuestos por intervención.');
        const id=txt(p.id)||idCorto('r');
        if(d.repuestos.some(r=>r.id===id))throw err('Este repuesto ya estaba registrado.',{codigo:'REPUESTO_DUPLICADO'});
        d.repuestos.push({id,codigo:codigo.slice(0,40),descripcion:descripcion.slice(0,120),cantidad:cant,unidad:p.unidad,observacion:txt(p.observacion).slice(0,160),por,en:ahora});
        d.sinRepuestos=false;
        hist('Repuesto: '+(descripcion||codigo)+' · '+cant+' '+p.unidad);break;
      }
      case 'SIN_REPUESTOS':{
        exigirAbierta(d);
        if(d.repuestos.some(r=>!r.anulado))throw err('Ya hay repuestos registrados: anúlalos primero si en realidad no se usaron.');
        d.sinRepuestos=true;hist('Declaró que no se utilizaron repuestos ni materiales');break;
      }
      case 'ANULAR_REPUESTO':{
        exigirAbierta(d);
        const i=d.repuestos.findIndex(r=>r.id===p.id);
        if(i<0)throw err('El repuesto ya no existe.');
        if(d.repuestos[i].anulado)throw err('El repuesto ya estaba anulado.');
        if(txt(p.motivo).length<5)throw err('Indica el motivo para anular el repuesto (mínimo 5 caracteres).');
        d.repuestos[i]=Object.assign({},d.repuestos[i],{anulado:{por,en:ahora,motivo:txt(p.motivo).slice(0,160)}});
        hist('Anuló el repuesto «'+(d.repuestos[i].descripcion||d.repuestos[i].codigo)+'»: '+txt(p.motivo));break;
      }
      case 'SEGUIMIENTO':{
        exigirAbierta(d);
        if(txt(p.texto).length<5)throw err('Describe el seguimiento (mínimo 5 caracteres).');
        if(d.seguimiento.length>=M.MAX_SEGUIMIENTOS)throw err('Máximo '+M.MAX_SEGUIMIENTOS+' seguimientos.');
        d.seguimiento.push({id:txt(p.id)||idCorto('s'),texto:txt(p.texto).slice(0,300),estado:'PENDIENTE',intervencionId:txt(p.intervencionId),por,en:ahora});
        hist('Seguimiento: '+txt(p.texto));break;
      }
      case 'CERRAR':{
        exigirAbierta(d);
        const v=M.validarCierre(d,p,ahora);
        if(perm.evidenciaRequerida&&!d.evidencias.some(e=>!e.anulada))v.errores.push('Este tipo de trabajo exige al menos una foto de evidencia antes de cerrar.');
        if(v.errores.length)throw err(v.errores.join(' '),{errores:v.errores,codigo:'CIERRE_INVALIDO'});
        if(p.equipoId&&p.equipoId!==d.equipoId){d.equipoId=txt(p.equipoId);d.equipoNombre=txt(p.equipoNombre);d.equipoPendiente=false;}
        if(!d.equipoId)d.equipoJustificacion=txt(p.equipoJustificacion).slice(0,300);
        d.diagnostico=txt(p.diagnostico).slice(0,800);d.accion=txt(p.accion).slice(0,800);
        d.resultado=p.resultado;d.pendientes=txt(p.pendientes).slice(0,500);d.observaciones=txt(p.observaciones).slice(0,500);
        if(p.sinRepuestos){if(d.repuestos.some(r=>!r.anulado))throw err('Hay repuestos registrados: no puedes declarar que no se utilizaron.');d.sinRepuestos=true;}
        if(!d.inicioRealMs)d.inicioRealMs=num(p.inicioRealMs)||d.abiertaMs;
        d.finRealMs=num(p.finRealMs);
        // responsable y participantes: el que cierra queda como participante; el responsable declarado debe ser uno de ellos
        registrarParticipante(d,por,ahora);
        (Array.isArray(p.participantes)?p.participantes:[]).forEach(x=>{if(txt(x.nombre)&&!d.participantes.some(y=>mismoTecnico(y,x))&&d.participantes.length<M.MAX_PARTICIPANTES)d.participantes.push({tecnicoId:txt(x.tecnicoId),nombre:txt(x.nombre),desde:ahora,rol:'PARTICIPANTE'});});
        const resp=d.participantes.find(x=>(x.tecnicoId&&x.tecnicoId===txt(p.responsableId))||(!p.responsableId&&mismoTecnico(x,por)))||null;
        d.participantes=d.participantes.map(x=>Object.assign({},x,{rol:resp&&x===resp?'RESPONSABLE':'PARTICIPANTE'}));
        if(!resp)throw err('Indica el técnico responsable (debe ser uno de los participantes).');
        d.estado='CERRADA';d.abierta=false;d.espera=null;d.cerradaMs=ahora;
        d.cierre={por,en:ahora,responsable:{tecnicoId:resp.tecnicoId,nombre:resp.nombre},
          requiereSeguimiento:p.resultado==='NO_OPERATIVO'||txt(d.pendientes).length>0||d.seguimiento.some(s=>s.estado==='PENDIENTE')};
        hist('Cerró la intervención · '+M.RESULTADOS[p.resultado],'CERRADA',{resultado:p.resultado});break;
      }
      case 'EVIDENCIA':{                // se registra SOLO cuando el archivo ya se subió (nunca una referencia a un archivo que no existe)
        if(d.estado==='CANCELADA')throw err('La intervención está cancelada.');
        if(!M.SECCIONES_EVIDENCIA[p.seccion])throw err('Elige a qué corresponde la foto (problema, trabajo o cierre).');
        if(!txt(p.path))throw err('Falta la referencia del archivo subido.');
        const id=txt(p.id)||idCorto('ev');
        if(d.evidencias.some(e=>e.id===id))throw err('Esta foto ya estaba registrada.',{codigo:'EVIDENCIA_DUPLICADA'});
        if(d.evidencias.filter(e=>!e.anulada).length>=M.MAX_EVIDENCIAS)throw err('Máximo '+M.MAX_EVIDENCIAS+' fotos por intervención.');
        d.evidencias.push({id,seccion:p.seccion,descripcion:txt(p.descripcion).slice(0,160),path:txt(p.path),proveedor:txt(p.proveedor)||'supabase',mime:txt(p.mime)||'image/jpeg',tam:num(p.tam),ancho:num(p.ancho),alto:num(p.alto),por,en:ahora});
        hist('Foto ('+M.SECCIONES_EVIDENCIA[p.seccion]+')'+(txt(p.descripcion)?': '+txt(p.descripcion):''));break;
      }
      case 'ANULAR_EVIDENCIA':{
        if(d.estado==='CANCELADA')throw err('La intervención está cancelada.');
        const i=d.evidencias.findIndex(e=>e.id===p.id);
        if(i<0)throw err('La foto ya no existe.');
        if(d.evidencias[i].anulada)throw err('La foto ya estaba anulada.');
        if(txt(p.motivo).length<5)throw err('Indica el motivo para anular la foto (mínimo 5 caracteres).');
        d.evidencias[i]=Object.assign({},d.evidencias[i],{anulada:{por,en:ahora,motivo:txt(p.motivo).slice(0,160)}});
        hist('Anuló una foto: '+txt(p.motivo));break;
      }
      case 'TAREA':{                    // preventivo: una tarea se marca como realizada o no realizada SOLO por una persona (nunca por llegar la fecha)
        exigirAbierta(d);
        const i=(d.tareas||[]).findIndex(x=>x.id===p.id);
        if(i<0)throw err('La tarea ya no existe en esta ejecución.');
        if(p.estado!=='HECHA'&&p.estado!=='NO_HECHA')throw err('Marca la tarea como realizada o no realizada.');
        if(p.estado==='NO_HECHA'&&txt(p.motivo).length<5)throw err('Indica por qué no se realizó la tarea (mínimo 5 caracteres).');
        d.tareas=d.tareas.slice();
        d.tareas[i]=Object.assign({},d.tareas[i],{estado:p.estado,motivo:p.estado==='NO_HECHA'?txt(p.motivo).slice(0,160):'',por,en:ahora});
        hist('Tarea «'+d.tareas[i].titulo+'»: '+(p.estado==='HECHA'?'realizada':'NO realizada ('+txt(p.motivo)+')'));break;
      }
      case 'CANCELAR':{
        exigirAbierta(d);
        if(txt(p.motivo).length<5)throw err('Indica el motivo de la cancelación (mínimo 5 caracteres).');
        d.estado='CANCELADA';d.abierta=false;d.espera=null;d.cerradaMs=ahora;d.cancelacion={motivo:txt(p.motivo).slice(0,200),por,en:ahora};
        hist('Canceló: '+txt(p.motivo),'CANCELADA');break;
      }
      case 'CORREGIR':{                 // intervención cerrada: solo con permiso, motivo e historial
        if(d.estado!=='CERRADA')throw err('Solo se corrigen intervenciones cerradas.');
        if(!perm.puedeCorregir)throw err('No tienes permiso para corregir una intervención cerrada.',{codigo:'SIN_PERMISO'});
        if(txt(p.motivo).length<5)throw err('Indica el motivo de la corrección (mínimo 5 caracteres).');
        const cambios={};
        ['diagnostico','accion','pendientes','observaciones'].forEach(k=>{if(p[k]!==undefined&&txt(p[k])!==txt(d[k])){cambios[k]=[d[k],txt(p[k]).slice(0,800)];d[k]=cambios[k][1];}});
        if(p.resultado!==undefined&&p.resultado!==d.resultado){if(!M.RESULTADOS[p.resultado])throw err('Resultado no válido.');cambios.resultado=[d.resultado,p.resultado];d.resultado=p.resultado;}
        if(p.equipoId&&p.equipoId!==d.equipoId){cambios.equipo=[d.equipoNombre||M.SIN_EQUIPO,txt(p.equipoNombre)];d.equipoId=txt(p.equipoId);d.equipoNombre=txt(p.equipoNombre);d.equipoPendiente=false;}
        if(!Object.keys(cambios).length)throw err('No hay cambios que guardar.');
        d.correcciones=(Array.isArray(d.correcciones)?d.correcciones:[]).concat([{en:ahora,por,motivo:txt(p.motivo).slice(0,200),cambios}]);
        d.cierre=Object.assign({},d.cierre,{requiereSeguimiento:d.resultado==='NO_OPERATIVO'||txt(d.pendientes).length>0});
        hist('Corrigió '+Object.keys(cambios).join(', ')+' · motivo: '+txt(p.motivo),'CERRADA',cambios);break;
      }
      case 'VERIFICAR':{
        if(d.estado!=='CERRADA')throw err('Solo se verifica una intervención cerrada.');
        if(!perm.puedeVerificar)throw err('No tienes permiso para verificar intervenciones.',{codigo:'SIN_PERMISO'});
        if(d.verificacion)throw err('La intervención ya fue verificada por '+d.verificacion.por.nombre+'.',{codigo:'YA_VERIFICADA'});
        d.verificacion={por,en:ahora,nota:txt(p.nota).slice(0,200)};
        hist('Verificó el cierre'+(txt(p.nota)?': '+txt(p.nota):''));break;
      }
      case 'SEGUIMIENTO_RESUELTO':{       // marca un seguimiento como hecho o vinculado a otra orden (aun con la intervención cerrada)
        const i=d.seguimiento.findIndex(s=>s.id===p.id);
        if(i<0)throw err('El seguimiento ya no existe.');
        if(d.seguimiento[i].estado!=='PENDIENTE')throw err('El seguimiento ya estaba resuelto.',{codigo:'YA_RESUELTO'});
        if(d.estado==='CANCELADA')throw err('La intervención está cancelada.');
        d.seguimiento[i]=Object.assign({},d.seguimiento[i],{estado:txt(p.intervencionId)?'VINCULADO':'HECHO',intervencionId:txt(p.intervencionId),resueltoPor:por,resueltoEn:ahora,nota:txt(p.nota).slice(0,160)});
        hist((txt(p.intervencionId)?'Vinculó el seguimiento a otra orden':'Resolvió el seguimiento')+': '+d.seguimiento[i].texto);break;
      }
      default:throw err('Acción desconocida: '+accion);
    }
    d.version=num(d.version)+1;
    return d;
  };

  /* ---------- validación del cierre ---------- */
  /* p: {equipoId, equipoJustificacion, diagnostico, accion, repuestos? (ya registrados en d), sinRepuestos, resultado, pendientes, finRealMs, inicioRealMs, responsableId, tareas} */
  M.validarCierre=function(d,p,ahora){
    const errores=[],avisos=[];
    const tieneEquipo=!!(txt(p.equipoId)||txt(d.equipoId));
    if(d.tipo==='CORRECTIVO'&&!tieneEquipo&&txt(p.equipoJustificacion).length<10)errores.push('Indica el equipo intervenido, o justifica por qué no se pudo identificar (mínimo 10 caracteres).');
    if(txt(p.diagnostico).length<M.MIN_TEXTO)errores.push('Escribe el diagnóstico: qué se encontró (mínimo '+M.MIN_TEXTO+' caracteres).');
    if(txt(p.accion).length<M.MIN_TEXTO)errores.push('Escribe la acción realizada: qué se hizo (mínimo '+M.MIN_TEXTO+' caracteres).');
    const usados=(d.repuestos||[]).filter(r=>!r.anulado).length;
    if(!usados&&!p.sinRepuestos&&!d.sinRepuestos)errores.push('Registra los repuestos o materiales usados, o marca «No se utilizaron».');
    if(!M.RESULTADOS[p.resultado])errores.push('Elige el resultado.');
    else if((p.resultado==='NO_OPERATIVO'||p.resultado==='OPERATIVO_OBSERVACION')&&txt(p.pendientes).length<5)errores.push('Con este resultado describe los pendientes o la restricción (mínimo 5 caracteres).');
    const fin=num(p.finRealMs),inicio=num(d.inicioRealMs)||num(p.inicioRealMs)||num(d.abiertaMs);
    if(!(fin>0))errores.push('Indica la fecha y hora real de finalización.');
    else{
      if(fin>ahora+5*60000)errores.push('La hora real de finalización no puede estar en el futuro.');
      if(fin<inicio-59999)errores.push('La finalización no puede ser anterior al inicio del trabajo.');   // el formulario captura minutos: se tolera el redondeo de hasta 1 minuto
      if(fin<num(d.abiertaMs)-60000)errores.push('La finalización no puede ser anterior a la apertura.');
    }
    if(!(num(d.inicioRealMs)||num(p.inicioRealMs)))avisos.push('No se registró el inicio real: se tomará la apertura.');
    if(Array.isArray(d.tareas)&&d.tareas.length){
      const t=d.tareas;
      t.forEach(x=>{
        if(x.estado!=='HECHA'&&x.estado!=='NO_HECHA')errores.push('Marca la tarea «'+x.titulo+'» como realizada o no realizada.');
        else if(x.estado==='NO_HECHA'&&txt(x.motivo).length<5)errores.push('Indica por qué no se realizó la tarea «'+x.titulo+'».');
      });
    }
    return {errores,avisos};
  };

  /* ---------- tiempos de una intervención ---------- */
  /* Separa: respuesta (apertura → inicio real), trabajo (inicio real → fin real, sin esperas), espera, indisponibilidad no se calcula aquí, y tiempo
     administrativo (fin real → cierre registrado). Las esperas salen del historial (ESPERA/RETOMAR). Devuelve null en lo que no se puede saber. */
  M.tiempos=function(d,ahora){
    const abierta=num(d.abiertaMs),inicio=num(d.inicioRealMs),fin=num(d.finRealMs);
    const esperas=[];
    let desde=null;
    (d.historial||[]).slice().sort((a,b)=>num(a.en)-num(b.en)).forEach(h=>{
      if(h.a==='EN_ESPERA'&&desde===null&&h.accion==='ESPERA')desde=num(h.en);
      else if(desde!==null&&(h.accion==='RETOMAR'||h.a==='EN_INTERVENCION'||h.a==='CERRADA'||h.a==='CANCELADA')){esperas.push([desde,num(h.en)]);desde=null;}
    });
    if(desde!==null)esperas.push([desde,d.estado==='EN_ESPERA'?(ahora||desde):desde]);
    const solape=(a,b,x,y)=>Math.max(0,Math.min(b,y)-Math.max(a,x));
    const finTrabajo=fin||(M.estaAbierta(d.estado)?ahora:0);
    const espera=inicio&&finTrabajo?esperas.reduce((s,[a,b])=>s+solape(a,b,inicio,finTrabajo),0):esperas.reduce((s,[a,b])=>s+(b-a),0);
    const trabajo=inicio&&finTrabajo&&finTrabajo>=inicio?Math.max(0,finTrabajo-inicio-espera):null;
    const cierreMs=num(d.cierre&&d.cierre.en);
    return {respuestaMs:inicio&&abierta&&inicio>=abierta?inicio-abierta:null,trabajoMs:trabajo,esperaMs:espera,
      administrativoMs:fin&&cierreMs?Math.max(0,cierreMs-fin):null,completa:!!(inicio&&fin&&d.estado==='CERRADA'),esperas};
  };

  /* ¿Hay pendientes visibles? */
  M.pendientes=d=>{
    const s=(d.seguimiento||[]).filter(x=>x.estado==='PENDIENTE');
    const abierto=d.estado==='CERRADA'&&(d.resultado==='NO_OPERATIVO'||txt(d.pendientes).length>0);
    return {seguimientos:s.length,textoCierre:abierto?txt(d.pendientes):'',noOperativo:d.estado==='CERRADA'&&d.resultado==='NO_OPERATIVO',total:s.length+(abierto?1:0)};
  };

  /* Id determinista para abrir desde un evento o parada de origen: el mismo origen y equipo dan el mismo id (sin duplicados por doble clic o reintento). */
  M.idDeOrigen=function(origenId,equipoId){
    const limpio=s=>String(s||'').replace(/[^A-Za-z0-9_-]+/g,'-').slice(0,90);
    return 'o_'+limpio(origenId)+(equipoId?'_'+limpio(equipoId):'');
  };

  M.etiquetaEstado=e=>M.ESTADOS[e]||e;
  raiz.GlacialIntervenciones=M;
  if(typeof module!=='undefined'&&module.exports)module.exports=M;
})(typeof window!=='undefined'?window:globalThis);
