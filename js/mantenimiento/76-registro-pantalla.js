/* =====================================================================================================================
   MANTENIMIENTO · REGISTRO CFA-CA-F-023 · pantalla (pensada primero para el celular) · docs/mantenimiento/plan-y-registro.md (punto 4.3)
   Un registro por máquina y semana. Se crea al «Iniciar» desde el Programa semanal con las actividades que manda el Plan anual; cada marca, observación,
   pieza o dato se guarda al instante (indicador «Guardado») y se propaga en vivo a los demás dispositivos. PENDIENTE → EN CURSO (al marcar la primera)
   → CERRADO (el técnico cierra y firma) → VALIDADO (el supervisor valida; solo el supervisor lo reabre). Las reglas de la base lo exigen también.
   El técnico es quien se identificó con su PIN (37b); el maquinista se propone según la Rotación de Maquinistas y se puede cambiar.
   ===================================================================================================================== */
(function(){
  'use strict';
  const TAB='registro-mtto';
  const N=window.glacialMttoPlan,D=window.glacialMttoPlanDatos;
  if(!N||!D)return;
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ahoraMs=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const hoyIso=()=>GlacialFecha.fechaISOLocal(ahoraMs());          // fecha de hoy en hora de Lima (01b-fecha-operativa.js)
  const UI={semanaVista:null,reg:null,guardado:'ok',error:'',obs:new Set(),pendiente:false,aviso:'',mios:new Map(),avisos:[],fotoAct:null};
  const PANT=()=>window.glacialMttoPlanPantalla;
  const usuario=()=>(typeof state!=='undefined'&&state.user)||null;
  const compartida=()=>{try{return typeof esMantCompartido==='function'&&esMantCompartido(usuario());}catch(_){return false;}};
  const esSup=()=>!!(PANT()&&PANT().puedeEditar());
  const tecnicoActivo=()=>{try{return typeof window.mantTecnicoActivo==='function'?window.mantTecnicoActivo():null;}catch(_){return null;}};
  /* ¿Puede llenar registros? El técnico identificado con su PIN (cuenta compartida) o el supervisor / jefe. */
  const puedeLlenar=()=>esSup()||(compartida()&&!!tecnicoActivo());
  const quien=()=>{const t=tecnicoActivo();return (t&&t.nombre)||(usuario()&&(usuario().nombre||usuario().username))||'';};
  /* ---------- dos personas en el mismo campo: se recuerda lo que escribí yo y se avisa si otra persona lo cambia ---------- */
  const marcarMio=(clave,valor)=>{const l=(UI.mios.get(clave)||[]).filter(x=>Date.now()-x.en<=600000);l.push({v:valor,en:Date.now()});UI.mios.set(clave,l.slice(-6));};
  function textoAvisos(){
    const e=document.getElementById('rg-avisos');if(!e)return;
    e.hidden=!UI.avisos.length;
    e.innerHTML=UI.avisos.map(a=>'<div class="rg-aviso rg-amb" role="alert"><span>'+esc(a.texto)+'</span> <button type="button" class="btn btn-ghost btn-sm" data-rg-aviso-ok="'+esc(a.id)+'">Entendido</button></div>').join('');
  }
  function avisarConflicto(texto){
    if(UI.avisos.some(a=>a.texto===texto))return;
    UI.avisos.push({id:String(Date.now())+Math.random().toString(36).slice(2,5),texto});UI.avisos=UI.avisos.slice(-4);textoAvisos();
  }
  const valorMostrado=v=>v===null||v===undefined||v===''?'(vacío)':v===true?'sí':v===false?'no':String(v).slice(0,60);
  /** Cambio que llega de la base (propio o de otro dispositivo). Solo avisa cuando otra persona pisa algo que esta persona cambió hace poco o está escribiendo ahora. */
  function alRemoto(tabla,previa,nuevo){
    const reg=regActual();if(!reg||!nuevo||!previa)return;
    const activo=document.activeElement,ahora=Date.now();
    const evaluar=(clave,pv,nv,etiqueta,quienCambio,selector)=>{
      const el=selector&&activo&&activo.matches&&activo.matches(selector)?activo:null;
      const editando=el&&el.tagName!=='BUTTON'?el.value:null;
      if(!N.conflictoCampo({previo:pv,nuevo:nv,mios:UI.mios.get(clave),editando,ahora}))return;
      const quien=quienCambio&&quienCambio!==quien_()?quienCambio:'otra persona';
      avisarConflicto(editando!==null?
        'Ojo: '+quien+' cambió '+etiqueta+' mientras lo escribías (ahora dice «'+valorMostrado(nv)+'»). Si sales del campo, lo tuyo reemplaza su cambio.':
        'Ojo: '+quien+' cambió '+etiqueta+' que acabas de cambiar. Quedó su versión: «'+valorMostrado(nv)+'». Si quieres la tuya, vuelve a ponerla.');
    };
    if(tabla==='mtto_registros'&&nuevo.id===reg.id){
      Object.keys(N.CAMPOS_AVISO).forEach(c=>evaluar('r:'+c,previa[c],nuevo[c],N.CAMPOS_AVISO[c],nuevo.actualizado_por,'[data-rg-input="'+c+'"]'));
    }else if(tabla==='mtto_registro_actividades'&&nuevo.registro_id===reg.id){
      const et='la actividad '+nuevo.item+'. '+String(nuevo.equipo||'').slice(0,30);
      evaluar('a:'+nuevo.id+':realizado',!!previa.realizado,!!nuevo.realizado,'la marca de «'+et+'»',nuevo.marcado_por,null);
      evaluar('a:'+nuevo.id+':observacion',previa.observacion,nuevo.observacion,'la observación de «'+et+'»',nuevo.marcado_por,'[data-rg-obs="'+nuevo.id+'"]');
    }else if(tabla==='mtto_registro_piezas'&&nuevo.registro_id===reg.id){
      evaluar('p:'+reg.id+':'+nuevo.orden,previa.descripcion,nuevo.descripcion,'la pieza '+nuevo.orden,'','[data-rg-pieza="'+nuevo.orden+'"]');
    }
  }
  const quien_=()=>quien();
  const regActual=()=>D.cache.registros.find(r=>r.id===UI.reg)||null;
  const maqDe=r=>D.cache.maquinas.find(m=>m.id===r.maquina_id)||{nombre:'',linea_impresion:'PET',planta:'AGUA'};
  const actsDe=r=>D.cache.regActs.filter(a=>a.registro_id===r.id).sort((a,b)=>(a.item||0)-(b.item||0));
  const hhmm=h=>String(h||'').slice(0,5);
  const ddmmaaaa=f=>N.ddmmaaaa(f)||'—';

  /* ---------- guardado: marca de «Guardando…/Guardado/Error» sin repintar lo que se está escribiendo ---------- */
  function estadoGuardado(){
    const e=document.getElementById('rg-guardado');if(!e)return;
    e.className='rg-guardado '+UI.guardado;e.textContent=UI.guardado==='guardando'?'Guardando…':UI.guardado==='error'?'No se guardó':'Guardado';
    const m=document.getElementById('rg-error');if(m){m.textContent=UI.error;m.hidden=!UI.error;}
  }
  async function guardar(fn){
    UI.guardado='guardando';UI.error='';estadoGuardado();
    try{await fn();UI.guardado='ok';}catch(e){UI.guardado='error';UI.error=(e&&e.message)||String(e);}
    estadoGuardado();
    if(UI.guardado==='error')repintar(true);
  }

  /* ---------- abrir / iniciar ---------- */
  const lunesDeSemana=(anio,semana)=>N.rangoSemana(anio,semana).desde;
  function fechaInicial(anio,semana){
    const hoy=hoyIso(),r=N.rangoSemana(anio,semana);
    return hoy>=r.desde&&hoy<=r.hasta?hoy:r.desde;               // dentro de su semana: hoy; si no, el lunes de esa semana
  }
  function proponerMaquinista(fecha){
    try{
      const r=typeof window.rotacionMaquinistasDia==='function'?window.rotacionMaquinistasDia(fecha,'DÍA'):null;
      if(r&&r.trabajan&&r.trabajan.length===1)return {id:r.trabajan[0].trabajadorId,nombre:r.trabajan[0].nombre};
    }catch(_){/* sin rotación */}
    return null;
  }
  /** Abre el registro de la máquina y la semana; si no existe y la persona puede llenarlo, lo crea (Iniciar). */
  async function abrir(maquinaId,anio,semana){
    D.escuchar();
    await D.cargarSemana(anio,semana);
    let reg=D.cache.registros.find(r=>r.maquina_id===maquinaId&&r.anio===anio&&r.semana===semana)||null;
    if(!reg){
      if(!puedeLlenar()){
        if(compartida()&&typeof window.mantAbrirIdentificacion==='function'){alert('Identifícate con tu PIN para iniciar el registro.');window.mantAbrirIdentificacion();}
        else alert('Solo el técnico de Mantenimiento o el supervisor pueden iniciar un registro.');
        return;
      }
      const maq=D.cache.maquinas.find(m=>m.id===maquinaId);if(!maq)return;
      const fecha=fechaInicial(anio,semana),t=tecnicoActivo();
      try{
        reg=await D.iniciarRegistro(maq,anio,semana,{fecha,tecnico:t?{id:t.workerId,nombre:t.nombre}:null,maquinista:proponerMaquinista(fecha),supervisor:esSup()?quien():'',creadoPor:quien()});
      }catch(e){alert('No se pudo iniciar el registro: '+((e&&e.message)||e));return;}
    }
    if(puedeLlenar()){try{await D.traerPendientes(reg);}catch(e){console.warn('Pendientes de semanas anteriores:',e);}}      // lo que se marcó «No se realizó» después de iniciar este registro
    UI.reg=reg.id;UI.obs=new Set();UI.noAbierta=new Set();UI.guardado='ok';UI.error='';UI.avisos=[];UI.mios=new Map();
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    state.currentTab=TAB;
    if(typeof renderSidebar==='function')renderSidebar();
    if(typeof renderMain==='function')renderMain();
  }
  const antes=sm=>!!sm&&N.antesDelInicio(sm.anio,sm.semana,N.inicioRegistros(D.cache.config));
  /** Texto del botón de la fila del Programa semanal según el estado (vacío = sin botón). */
  function botonPara(estado){
    if(estado==='PENDIENTE')return puedeLlenar()&&!antes(UI.semanaVista)?'Iniciar':'';
    if(estado==='EN_CURSO')return puedeLlenar()?'Continuar':'Ver en vivo';
    if(estado==='CERRADO')return esSup()?'Validar':'Ver';
    return 'Ver';
  }

  /* ---------- pintar ---------- */
  const nombresTrabajadores=()=>{try{return (typeof loadWorkers==='function'?(loadWorkers()||[]):[]).filter(w=>w&&String(w.estado||'').toLowerCase()==='activo').map(w=>w.nombre).filter(Boolean);}catch(_){return [];}};
  function pintar(main){
    estilos();document.body.classList.add('rg-abierto');
    const reg=regActual();
    if(!reg){main.innerHTML='<section class="rg"><div class="rg-aviso">No se encontró el registro. <button type="button" class="btn btn-ghost btn-sm" data-rg-volver>‹ Volver al Programa semanal</button></div></section>';return;}
    const maq=maqDe(reg),acts=actsDe(reg),pr=N.progresoRegistro(acts),perm=N.permisosRegistro(reg.estado,esSup(),puedeLlenar()&&!esSup());
    const ed=perm.editar,dis=ed?'':' disabled';
    const piezas=[1,2,3,4].map(o=>(D.cache.piezas.find(p=>p.registro_id===reg.id&&p.orden===o)||{}).descripcion||'');
    const cfg=(D.cache.config&&D.cache.config.datos)||{};
    const insumos=(cfg.insumosQuimicos&&cfg.insumosQuimicos.length?cfg.insumosQuimicos:['Grasa Multipropósito Sanitaria.','Limpiacontacto.','Aflojatodo.','Lubricatodo.']);
    const fotos=D.cache.fotos.filter(f=>f.registro_id===reg.id).sort((a,b)=>String(a.creado_en).localeCompare(String(b.creado_en)));
    const fotosAct=id=>fotos.filter(f=>f.actividad_id===id).length;
    const puedeFoto=ed&&D.cache.fotosOk&&!!(window.glacialFotos&&window.glacialEvidencias);
    const itemDe=id=>{const a=acts.find(x=>x.id===id);return a?'Actividad '+a.item+'. '+String(a.equipo||'').slice(0,28):'';};
    const tarjetaFotos='<div class="rg-card"><h3>Evidencia fotográfica</h3><p class="rg-sub">'+(D.cache.fotosOk?(fotos.length?fotos.length+' foto'+(fotos.length===1?'':'s')+' (máximo 20)':'Fotos del trabajo hecho. Se guardan al instante.'):'Las fotos se activan al aplicar la actualización de la base de datos (glacial_49).')+'</p>'+
      (fotos.length&&window.glacialFotos?'<div class="rg-fotos">'+fotos.map(f=>'<figure class="rg-foto"><a '+window.glacialFotos.atributosEnlace(f.ruta)+' aria-label="Abrir foto"><img '+window.glacialFotos.atributosImg(f.ruta)+' alt="Evidencia" loading="lazy"></a>'+
        '<figcaption>'+(f.actividad_id?'<small>'+esc(itemDe(f.actividad_id))+'</small>':'')+
        '<input type="text" maxlength="200" data-rg-foto-desc="'+esc(f.id)+'" value="'+esc(f.descripcion)+'" placeholder="Descripción (opcional)" aria-label="Descripción de la foto"'+dis+'>'+
        '<small class="rg-quien">'+esc(f.subido_por||'')+'</small>'+(esSup()&&reg.estado!=='VALIDADO'?'<button type="button" class="btn btn-ghost btn-sm" data-rg-foto-quitar="'+esc(f.id)+'">Quitar</button>':'')+'</figcaption></figure>').join('')+'</div>':'')+
      (puedeFoto?'<button type="button" class="btn btn-ghost" data-rg-foto-nueva>📷 Agregar foto</button>':'')+
      '<input type="file" id="rg-foto-input" accept="image/*" multiple hidden></div>';
    const est=N.ESTADOS_REG[reg.estado]||N.ESTADOS_REG.PENDIENTE;
    const lista=nombresTrabajadores();
    const dl='<datalist id="rg-personas">'+lista.map(n=>'<option value="'+esc(n)+'">').join('')+'</datalist>';
    const btn=(campo,valor,txt)=>'<button type="button" class="rg-op'+(reg[campo]===valor?' on':'')+'" data-rg-campo="'+campo+'" data-rg-valor="'+valor+'"'+dis+' aria-pressed="'+(reg[campo]===valor)+'">'+txt+'</button>';
    const filas=acts.map(a=>{
      const obsAbierta=UI.obs.has(a.id)||!!a.observacion;
      const e=N.estadoActividad(a),editaMotivo=e==='no'||UI.noAbierta.has(a.id),origen=N.textoOrigen(a,reg.anio);
      const motivo=editaMotivo?'<div class="rg-motivo"><label for="rg-m-'+esc(a.id)+'">Motivo de por qué no se realizó</label><textarea id="rg-m-'+esc(a.id)+'" class="rg-obs rg-obs-no" data-rg-motivo="'+esc(a.id)+'" rows="2" maxlength="300" placeholder="Obligatorio: escribe el motivo o elige uno"'+dis+'>'+esc(a.motivo_no)+'</textarea>'+
        (ed?'<div class="rg-chips">'+N.MOTIVOS_NO_REALIZADO.map(m=>{const otro=m==='Otros',escrito=String(a.motivo_no||'').trim(),lista=N.MOTIVOS_NO_REALIZADO.filter(x=>x!=='Otros'),on=otro?(!!escrito&&!lista.includes(escrito)):escrito===m;
        return '<button type="button" class="rg-chip'+(on?' on':'')+'" aria-pressed="'+on+'" data-rg-chip="'+esc(a.id)+'" data-rg-valor="'+esc(m)+'">'+esc(m)+(otro?' (escribirlo)':'')+'</button>';}).join('')+'</div>':'')+
        (e==='no'?'<small class="rg-quien">Pasará a las actividades de la próxima semana hasta que se realice.</small>':'<small class="rg-quien">Se guarda al escribir el motivo.</small>')+'</div>':'';
      return '<li class="rg-act'+(e==='ok'?' ok':'')+(e==='no'?' no':'')+(origen?' arr':'')+'" data-rg-fila="'+esc(a.id)+'"><div class="rg-botones"><button type="button" class="rg-chk" data-rg-marcar="'+esc(a.id)+'" aria-pressed="'+(e==='ok')+'" aria-label="'+(e==='ok'?'Desmarcar':'Marcar como realizada')+' '+esc(a.equipo)+'"'+dis+'>'+(e==='ok'?'✓':'')+'</button>'+
        '<button type="button" class="rg-chk rg-nok" data-rg-no="'+esc(a.id)+'" aria-pressed="'+(e==='no'||UI.noAbierta.has(a.id))+'" aria-label="No se realizó: '+esc(a.equipo)+'" title="No se realizó"'+dis+'>'+(e==='no'||UI.noAbierta.has(a.id)?'✗':'')+'</button></div>'+
        '<div class="rg-txt"><b>'+esc(a.item)+'. '+esc(a.equipo)+'</b><small>'+esc(a.actividad)+(a.actividad?' · ':'')+esc(a.frecuencia)+'</small>'+
        (origen?'<small class="rg-origen">'+esc(origen)+(a.motivo_origen?' · Motivo: '+esc(a.motivo_origen):'')+'</small>':'')+motivo+
        (obsAbierta?'<textarea class="rg-obs" data-rg-obs="'+esc(a.id)+'" rows="2" maxlength="500" placeholder="Observación"'+dis+'>'+esc(a.observacion)+'</textarea>':(ed?'<button type="button" class="rg-obs-btn" data-rg-obs-abrir="'+esc(a.id)+'">+ Observación</button>':''))+
        (a.marcado_por&&a.realizado?'<small class="rg-quien">'+esc(a.marcado_por)+'</small>':'')+
        (puedeFoto||fotosAct(a.id)?'<button type="button" class="rg-obs-btn" data-rg-foto-act="'+esc(a.id)+'"'+(puedeFoto?'':' disabled')+' aria-label="Foto de esta actividad">📷'+(fotosAct(a.id)?' '+fotosAct(a.id):'')+'</button>':'')+'</div></li>';
    }).join('');
    main.innerHTML='<section class="rg" id="rg-raiz">'+dl+
      '<header class="rg-cab"><button type="button" class="rg-atras" data-rg-volver aria-label="Volver al Programa semanal">‹</button><div><h2>Registro de mantenimiento</h2><small>CFA-CA-F-023 · '+esc(maq.nombre)+' · '+esc(maq.linea_impresion||'PET')+'</small></div>'+
      '<span id="rg-guardado" class="rg-guardado '+UI.guardado+'" role="status">'+(UI.guardado==='guardando'?'Guardando…':UI.guardado==='error'?'No se guardó':'Guardado')+'</span></header>'+
      '<div id="rg-error" class="rg-error" role="alert"'+(UI.error?'':' hidden')+'>'+esc(UI.error)+'</div>'+
      '<div id="rg-avisos"'+(UI.avisos.length?'':' hidden')+'>'+UI.avisos.map(a=>'<div class="rg-aviso rg-amb" role="alert"><span>'+esc(a.texto)+'</span> <button type="button" class="btn btn-ghost btn-sm" data-rg-aviso-ok="'+esc(a.id)+'">Entendido</button></div>').join('')+'</div>'+
      '<div class="rg-prog"><div class="rg-prog-t"><span id="rg-prog-txt">'+textoProgreso(pr)+'</span><span class="ps-est ps-'+est.cls+'">'+est.txt+'</span></div><div class="rg-barra"><i id="rg-prog-bar" style="width:'+pr.pct+'%"></i></div></div>'+
      (perm.soloLectura&&reg.estado!=='PENDIENTE'?'<div class="rg-aviso rg-info">'+(reg.estado==='VALIDADO'?'Registro validado por '+esc(reg.validado_por||'el supervisor')+'. Solo el supervisor puede reabrirlo.':'Registro cerrado por el técnico: espera la validación del supervisor.')+'</div>':'')+
      (N.excedeImpreso(acts.length)?'<div class="rg-aviso rg-amb">El formato impreso solo muestra las primeras '+N.MAX_IMPRESO+' actividades (este registro tiene '+acts.length+').</div>':'')+
      '<div class="rg-card"><h3>Datos del registro</h3><dl class="rg-datos"><div><dt>Máquina y/o equipo</dt><dd>'+esc(maq.nombre)+'</dd></div><div><dt>Ubicación / Línea</dt><dd>'+esc(maq.planta||'AGUA')+' · '+esc(maq.linea_impresion||'PET')+'</dd></div>'+
      '<div><dt>Fecha</dt><dd><input type="date" data-rg-input="fecha" value="'+esc(reg.fecha)+'"'+dis+'></dd></div><div><dt>Semana</dt><dd>'+esc(N.etiquetaSemana(reg.semana))+'</dd></div>'+
      '<div><dt>Técnico ejecutor</dt><dd><input type="text" list="rg-personas" data-rg-input="tecnico_senior" value="'+esc(reg.tecnico_senior)+'" placeholder="Nombre"'+dis+'>'+(tecnicoActivo()&&tecnicoActivo().nombre===reg.tecnico_senior?'<small class="rg-ok">Identificado con PIN</small>':'')+'</dd></div>'+
      '<div><dt>Maquinista ejecutor</dt><dd><input type="text" list="rg-personas" data-rg-input="maquinista" value="'+esc(reg.maquinista)+'" placeholder="Según rotación"'+dis+'></dd></div>'+
      '<div><dt>Próxima revisión</dt><dd>'+esc(ddmmaaaa(reg.proxima_revision))+'</dd></div><div><dt>Tiempo programado</dt><dd>'+esc(hhmm(reg.hora_inicio_prog))+' – '+esc(hhmm(reg.hora_fin_prog))+' · '+esc(reg.horas_prog)+' h</dd></div></dl>'+
      '<div class="rg-grupo"><span>Tipo de mantenimiento</span><div class="rg-ops">'+btn('tipo_mtto','PREDICTIVO','Predictivo')+btn('tipo_mtto','PREVENTIVO','Preventivo')+btn('tipo_mtto','CORRECTIVO','Correctivo')+'</div></div>'+
      '<div class="rg-grupo"><span>Condición</span><div class="rg-ops dos">'+btn('condicion','INTERNO','Interno')+btn('condicion','EXTERNO','Externo')+'</div></div>'+
      '<div class="rg-horas"><label>Hora real de inicio<input type="time" data-rg-input="hora_inicio_real" value="'+esc(hhmm(reg.hora_inicio_real))+'"'+dis+'></label><label>Hora real de fin<input type="time" data-rg-input="hora_fin_real" value="'+esc(hhmm(reg.hora_fin_real))+'"'+dis+'></label></div></div>'+
      '<div class="rg-card"><h3>Actividades de la semana</h3><p class="rg-sub">Mantenimiento preventivo · traídas del Plan anual</p>'+(acts.length?'<ul class="rg-lista">'+filas+'</ul>':'<p class="rg-sub">El plan no manda actividades para esta máquina en esta semana.</p>')+'</div>'+
      '<div class="rg-card"><h3>Cambio o reparación de piezas</h3>'+piezas.map((d,i)=>'<label class="rg-pieza"><span>'+(i+1)+'.-</span><input type="text" data-rg-pieza="'+(i+1)+'" value="'+esc(d)+'" maxlength="200" placeholder="Pieza y cantidad"'+dis+'></label>').join('')+'</div>'+
      tarjetaFotos+
      '<div class="rg-card"><h3>Insumos químicos usados</h3><p class="rg-sub">Fijos del formato (solo lectura)</p><ol class="rg-insumos">'+insumos.map(i=>'<li>'+esc(i)+'</li>').join('')+'</ol></div>'+
      '<div class="rg-card"><h3>Informe final</h3><textarea class="rg-informe" data-rg-input="informe_final" rows="4"'+dis+'>'+esc(reg.informe_final)+'</textarea></div>'+
      '<div class="rg-barra-acc">'+
        (perm.cerrar?'<button type="button" class="btn btn-primary" data-rg-cerrar>Cerrar registro y firmar</button>':'')+
        (perm.validar?'<button type="button" class="btn btn-primary" data-rg-validar>Validar</button>':'')+
        (perm.reabrir?'<button type="button" class="btn btn-ghost" data-rg-reabrir>Reabrir</button>':'')+
        (window.glacialMttoRegistroImpresion?'<button type="button" class="btn btn-ghost" data-rg-imprimir>Vista de impresión</button>':'')+
      '</div></section>';
  }

  /* ---------- acciones ---------- */
  document.addEventListener('click',e=>{
    const raiz=e.target.closest&&e.target.closest('.rg');if(!raiz)return;
    if(e.target.closest('[data-rg-volver]')){if(typeof window.goProgramaSemanalMtto==='function')window.goProgramaSemanalMtto();return;}
    const reg=regActual();if(!reg)return;
    const ok=e.target.closest('[data-rg-aviso-ok]');
    if(ok){const id=ok.getAttribute('data-rg-aviso-ok');UI.avisos=UI.avisos.filter(a=>a.id!==id);textoAvisos();return;}
    const fn=e.target.closest('[data-rg-foto-nueva]'),fa=e.target.closest('[data-rg-foto-act]');
    if(fn||fa){UI.fotoAct=fa?fa.getAttribute('data-rg-foto-act'):null;const inp=document.getElementById('rg-foto-input');if(inp){inp.value='';inp.click();}return;}
    const fq=e.target.closest('[data-rg-foto-quitar]');
    if(fq){if(confirm('¿Quitar esta foto del registro? El archivo no se borra, solo deja de mostrarse.'))guardar(()=>D.quitarFoto(fq.getAttribute('data-rg-foto-quitar')));return;}
    const mk=e.target.closest('[data-rg-marcar]');
    if(mk){
      const a=D.cache.regActs.find(x=>x.id===mk.getAttribute('data-rg-marcar'));if(!a)return;
      const nuevo=!a.realizado,previo={realizado:a.realizado,marcado_por:a.marcado_por,marcado_en:a.marcado_en,no_realizado:a.no_realizado,motivo_no:a.motivo_no};
      UI.noAbierta.delete(a.id);if(nuevo){a.no_realizado=false;a.motivo_no='';}
      a.realizado=nuevo;a.marcado_por=quien();marcarMio('a:'+a.id+':realizado',nuevo);repintar(true);                                  // se ve al instante; si falla, vuelve atrás
      guardar(async()=>{try{await D.marcarActividad(a,nuevo,quien());}catch(err){Object.assign(a,previo);throw err;}});return;
    }
    const no=e.target.closest('[data-rg-no]');
    if(no){
      const a=D.cache.regActs.find(x=>x.id===no.getAttribute('data-rg-no'));if(!a)return;
      if(a.no_realizado){                                                                              // quitar la marca «No se realizó»
        const previo={no_realizado:a.no_realizado,motivo_no:a.motivo_no};a.no_realizado=false;a.motivo_no='';UI.noAbierta.delete(a.id);marcarMio('a:'+a.id+':realizado',false);repintar(true);
        guardar(async()=>{try{await D.quitarNoRealizada(a);}catch(err){Object.assign(a,previo);throw err;}});return;
      }
      if(UI.noAbierta.has(a.id)){UI.noAbierta.delete(a.id);repintar(true);return;}
      UI.noAbierta.add(a.id);repintar(true);const t=document.querySelector('[data-rg-motivo="'+a.id+'"]');if(t)t.focus();return;
    }
    const chip=e.target.closest('[data-rg-chip]');
    if(chip){
      const id=chip.getAttribute('data-rg-chip'),v=chip.getAttribute('data-rg-valor');
      if(v==='Otros'){                                                                                   // «Otros»: el motivo se escribe a mano
        const t=document.querySelector('[data-rg-motivo="'+id+'"]');
        if(t){if(N.MOTIVOS_NO_REALIZADO.includes(String(t.value).trim()))t.value='';t.placeholder='Escribe aquí el motivo';t.focus();}
        return;
      }
      guardarMotivo(id,v);return;
    }
    const oa=e.target.closest('[data-rg-obs-abrir]');
    if(oa){UI.obs.add(oa.getAttribute('data-rg-obs-abrir'));repintar(true);const t=document.querySelector('[data-rg-obs="'+oa.getAttribute('data-rg-obs-abrir')+'"]');if(t)t.focus();return;}
    const op=e.target.closest('[data-rg-campo]');
    if(op){const c=op.getAttribute('data-rg-campo'),v=op.getAttribute('data-rg-valor');if(reg[c]===v)return;reg[c]=v;marcarMio('r:'+c,v);repintar(true);guardar(()=>D.guardarCampos(reg.id,{[c]:v}));return;}
    if(e.target.closest('[data-rg-cerrar]')){
      const pr=N.progresoRegistro(actsDe(reg)),f=pr.sin;
      if(f>0&&!confirm('Quedan '+f+' actividad'+(f===1?'':'es')+' sin marcar (ni realizadas ni «No se realizó»). ¿Cerrar el registro de todos modos?'))return;
      if(pr.no>0&&!confirm(pr.no+' actividad'+(pr.no===1?'':'es')+' no se realizó y pasará'+(pr.no===1?'':'n')+' a las actividades de la próxima semana hasta que se realice'+(pr.no===1?'':'n')+'. ¿Cerrar el registro?'))return;
      if(!reg.tecnico_senior&&!quien()){alert('Escribe el nombre del técnico ejecutor antes de cerrar.');return;}
      guardar(()=>D.cerrarRegistro(reg,quien()));return;
    }
    if(e.target.closest('[data-rg-validar]')){guardar(()=>D.validarRegistro(reg,quien()));return;}
    if(e.target.closest('[data-rg-reabrir]')){if(confirm('¿Reabrir este registro? Volverá a quedar EN CURSO.'))guardar(()=>D.reabrirRegistro(reg));return;}
    if(e.target.closest('[data-rg-imprimir]')&&window.glacialMttoRegistroImpresion){window.glacialMttoRegistroImpresion.imprimir(reg.id);return;}
  });
  /* Textos: se guardan al salir del campo (y los de fecha/hora al cambiar). */
  document.addEventListener('change',e=>{
    const t=e.target;if(!t||!t.closest||!t.closest('.rg'))return;
    const reg=regActual();if(!reg)return;
    if(t.hasAttribute('data-rg-input')){
      const c=t.getAttribute('data-rg-input');let v=t.value;
      if(['hora_inicio_real','hora_fin_real'].includes(c)&&!v)v=null;
      if(reg[c]===v||(v===null&&!reg[c]))return;
      const campos={[c]:v};
      if(c==='fecha'&&v){campos.proxima_revision=N.proximaRevision(v);}
      Object.keys(campos).forEach(k=>marcarMio('r:'+k,campos[k]));Object.assign(reg,campos);guardar(()=>D.guardarCampos(reg.id,campos)).then(()=>{if(c==='fecha')repintar(true);});return;
    }
    if(t.hasAttribute('data-rg-motivo')){guardarMotivo(t.getAttribute('data-rg-motivo'),t.value);return;}
    if(t.hasAttribute('data-rg-obs')){
      const a=D.cache.regActs.find(x=>x.id===t.getAttribute('data-rg-obs'));if(!a||a.observacion===t.value)return;
      a.observacion=t.value;marcarMio('a:'+a.id+':observacion',t.value);guardar(()=>D.guardarObservacion(a,t.value,quien()));return;
    }
    if(t.id==='rg-foto-input'){subirFotos(reg,[...(t.files||[])],UI.fotoAct);return;}
    if(t.hasAttribute('data-rg-foto-desc')){const id=t.getAttribute('data-rg-foto-desc');guardar(()=>D.guardarDescripcionFoto(id,t.value));return;}
    if(t.hasAttribute('data-rg-pieza')){
      const o=Number(t.getAttribute('data-rg-pieza'));marcarMio('p:'+reg.id+':'+o,t.value);guardar(()=>D.guardarPieza(reg.id,o,t.value));
    }
  });
  /** Guarda «No se realizó» con su motivo (obligatorio). Se ve al instante; si falla, vuelve atrás. */
  function guardarMotivo(id,texto){
    const a=D.cache.regActs.find(x=>x.id===id);if(!a)return;
    const m=String(texto||'').trim().slice(0,300);
    if(!m||m==='Otros'){                                                                                 // vacío o solo «Otros»: no se guarda; si ya tenía motivo, se conserva
      if(a.no_realizado){const t=document.querySelector('[data-rg-motivo="'+id+'"]');if(t)t.value=a.motivo_no;alert('El motivo es obligatorio: escribe por qué no se realizó o quita la marca ✗.');}
      return;
    }
    if(a.no_realizado&&a.motivo_no===m)return;
    const previo={realizado:a.realizado,no_realizado:a.no_realizado,motivo_no:a.motivo_no,marcado_por:a.marcado_por};
    a.realizado=false;a.no_realizado=true;a.motivo_no=m;a.marcado_por=quien();UI.noAbierta.delete(a.id);marcarMio('a:'+a.id+':realizado',false);repintar(true);
    guardar(async()=>{try{await D.marcarNoRealizada(a,m,quien());}catch(err){Object.assign(a,previo);throw err;}});
  }
  /** Comprime cada foto en el dispositivo, la sube a Storage (carpeta mantenimiento/registros/<registro>/) y SOLO después guarda su referencia. */
  async function subirFotos(reg,archivos,actividadId){
    if(!archivos.length)return;
    const E=window.glacialEvidencias,F=window.glacialFotos;
    if(!E||!F||!F.disponible()){UI.guardado='error';UI.error='El almacenamiento de fotos no está disponible. Revisa tu conexión.';estadoGuardado();return;}
    const hechas=D.cache.fotos.filter(f=>f.registro_id===reg.id).length;
    if(hechas+archivos.length>20){UI.guardado='error';UI.error='Un registro admite hasta 20 fotos (ya hay '+hechas+').';estadoGuardado();return;}
    await guardar(async()=>{
      for(let i=0;i<archivos.length;i++){
        const p=await E.preparar(archivos[i]);
        const id='f_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
        const r=await F.subir(p.blob,{carpeta:'mantenimiento/registros/'+String(reg.id).replace(/[^A-Za-z0-9_-]/g,'-'),id,tipo:'image/jpeg'});
        await D.agregarFoto(reg.id,{ruta:r.url,actividadId,descripcion:'',quien:quien()});
      }
    });
    repintar(true);
  }
  /* Un cambio de otro dispositivo no repinta debajo de lo que se está escribiendo: espera a que se salga del campo. */
  document.addEventListener('focusout',()=>{if(UI.pendiente&&!UI.dedo){UI.pendiente=false;setTimeout(()=>repintar(false),50);}});
  /* Tampoco se repinta mientras hay un dedo / clic apretado: si el botón cambia entre «apretar» y «soltar», el toque se pierde. */
  document.addEventListener('pointerdown',()=>{UI.dedo=true;},true);
  const soltar=()=>{UI.dedo=false;if(UI.pendiente){UI.pendiente=false;setTimeout(()=>repintar(false),80);}};
  document.addEventListener('pointerup',soltar,true);document.addEventListener('pointercancel',soltar,true);
  function repintar(forzar){
    if(typeof state==='undefined'||state.currentTab!==TAB)return;
    const m=document.getElementById('main');if(!m)return;
    const act=document.activeElement;
    if(!forzar&&(UI.dedo||(act&&act.closest&&act.closest('.rg')&&/INPUT|TEXTAREA/.test(act.tagName)))){UI.pendiente=true;return;}
    const y=window.scrollY;pintar(m);window.scrollTo(0,y);
  }
  /* El avance se actualiza siempre (sin tocar los campos); lo demás se repinta cuando no se está escribiendo. */
  const textoProgreso=pr=>pr.hechas+' de '+pr.total+' realizadas'+(pr.no?' · '+pr.no+' no realizada'+(pr.no===1?'':'s'):'');
  function avanceEnVivo(){
    const reg=regActual(),t=document.getElementById('rg-prog-txt'),b=document.getElementById('rg-prog-bar');
    if(!reg||!t||!b)return;const pr=N.progresoRegistro(actsDe(reg));t.textContent=textoProgreso(pr);b.style.width=pr.pct+'%';
  }
  D.alCambiar(()=>{avanceEnVivo();repintar(false);});
  D.alCambioRemoto(alRemoto);

  function estilos(){
    if(document.getElementById('rg-estilos'))return;
    const s=document.createElement('style');s.id='rg-estilos';
    s.textContent=(window.glacialMttoTabs?window.glacialMttoTabs.css:'')+'.rg{max-width:760px;margin:0 auto;padding:0 0 90px}.rg-cab{display:flex;align-items:center;gap:10px;background:var(--brand-900,#033350);color:#fff;border-radius:14px;padding:10px 12px;margin-bottom:10px;position:sticky;top:0;z-index:5}'+
      '.rg-cab h2{margin:0;font-size:17px;color:#fff!important;line-height:1.2}.rg-cab small{color:#bcd7e6!important}.rg-abierto .av-floating-trigger{display:none!important}.rg-cab small{color:#bcd7e6;font-size:12px}.rg-cab>div{flex:1;min-width:0}.rg-atras{border:0;background:rgba(255,255,255,.14);color:#fff;border-radius:10px;width:44px;height:44px;font-size:22px;cursor:pointer}'+
      '.rg-guardado{font-size:12px;font-weight:600;white-space:nowrap;color:#7ee2a8}.rg-guardado.guardando{color:#ffe08a}.rg-guardado.error{color:#ffb4b4}.rg-error{background:#fde8e8;color:#9b1c1c;border-radius:10px;padding:10px 12px;margin-bottom:10px;font-size:13px}'+
      '.rg-prog{background:#fff;border:1px solid #dbe5ee;border-radius:12px;padding:10px 12px;margin-bottom:10px}.rg-prog-t{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#46627a;margin-bottom:6px}.rg-barra{height:9px;border-radius:6px;background:#e4ecf3;overflow:hidden}.rg-barra i{display:block;height:100%;background:#1a9a57;transition:width .25s}'+
      '.rg-card{background:#fff;border:1px solid #dbe5ee;border-radius:var(--card-radius,14px);padding:14px;margin-bottom:12px;box-shadow:var(--card-shadow,0 1px 2px rgba(3,51,80,.05))}.rg-card h3{margin:0 0 8px;font-size:16px}.rg-sub{margin:0 0 8px;font-size:12.5px;color:#7a8794}'+
      '.rg-datos{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin:0 0 12px}.rg-datos dt{font-size:11.5px;color:#7a8794;text-transform:uppercase;letter-spacing:.03em}.rg-datos dd{margin:2px 0 0;font-weight:600;color:#033350;font-size:14px}.rg-datos input{width:100%;min-height:44px;border:1px solid #cfdbe3;border-radius:10px;padding:0 10px;font-size:15px;box-sizing:border-box}.rg-ok{display:block;color:#1a7f4b;font-size:11.5px;font-weight:600}'+
      '.rg-grupo{margin:8px 0}.rg-grupo>span{display:block;font-size:12.5px;color:#46627a;margin-bottom:4px}.rg-ops{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.rg-ops.dos{grid-template-columns:repeat(2,1fr)}.rg-op{min-height:46px;border:1px solid #cfdbe3;background:#fff;border-radius:10px;font-size:14px;cursor:pointer}.rg-op.on{background:var(--brand-700,#0877A6);border-color:var(--brand-700,#0877A6);color:#fff;font-weight:700}.rg-op:disabled{opacity:.6}'+
      '.rg-horas{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}.rg-horas label{display:flex;flex-direction:column;font-size:12px;color:#5b6b79;gap:3px}.rg-horas input{min-height:46px;border:1px solid #cfdbe3;border-radius:10px;padding:0 10px;font-size:16px}'+
      '.rg-lista{list-style:none;margin:0;padding:0}.rg-act{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-top:1px solid #edf2f7}.rg-chk{flex:0 0 48px;width:48px;height:48px;border:2px solid #9fb3c4;background:#fff;border-radius:12px;font-size:26px;font-weight:700;color:#fff;cursor:pointer}.rg-act.ok .rg-chk{background:#1a9a57;border-color:#1a9a57}.rg-chk:disabled{opacity:.65}'+
      '.rg-txt{flex:1;min-width:0}.rg-txt b{display:block;font-size:14.5px;color:#033350;overflow-wrap:anywhere}.rg-txt small{display:block;color:#5b6b79;font-size:12.5px;margin-top:2px}.rg-quien{color:#1a7f4b!important}.rg-obs-btn{border:0;background:none;color:var(--brand-700,#0877A6);font-size:13px;padding:6px 0;cursor:pointer;min-height:32px}'+
      '.rg-obs,.rg-informe{width:100%;box-sizing:border-box;border:1px solid #ecd48b;background:#fff8e6;border-radius:10px;padding:8px 10px;font-size:14px;margin-top:6px}.rg-informe{border-color:#cfdbe3;background:#fff}'+
      '.rg-pieza{display:flex;gap:8px;align-items:center;margin:6px 0}.rg-pieza span{color:#7a8794;width:22px}.rg-pieza input{flex:1;min-height:46px;border:1px solid #cfdbe3;border-radius:10px;padding:0 10px;font-size:15px}.rg-insumos{margin:0;padding-left:20px;color:#46627a;font-size:14px}.rg-insumos li{margin:3px 0}'+
      '.rg-aviso{background:#fff;border:1px dashed #cfdbe3;border-radius:12px;padding:12px;color:#46627a;margin-bottom:10px;font-size:13.5px}.rg-amb{background:#fff8e6;border:1px solid #ecd48b;color:#6d4a00}.rg-info{background:#e8f4fb;border:1px solid #bfe0f1;color:#064a68}'+
      '.rg-barra-acc{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #dbe5ee;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));display:flex;gap:8px;flex-wrap:wrap;justify-content:center;z-index:6}.rg-barra-acc .btn{min-height:46px;flex:1 1 150px;max-width:260px}'+
      '[data-rg-foto-act]{margin-left:10px;cursor:pointer}.rg-fotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:8px 0}.rg-foto{margin:0;border:1px solid #dbe5ee;border-radius:10px;overflow:hidden;background:#fff}.rg-foto img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:#eef3f7}.rg-foto figcaption{padding:6px;display:flex;flex-direction:column;gap:4px}.rg-foto input{width:100%;box-sizing:border-box;border:1px solid #cfdbe3;border-radius:8px;min-height:36px;padding:0 8px;font-size:13px}'+
      '.rg-botones{display:flex;flex-direction:column;gap:6px}.rg-nok{flex:0 0 44px;width:44px;height:44px;font-size:22px;border-color:#d6a3a3;color:#fff}.rg-nok[aria-pressed="true"]{background:#c0392b;border-color:#c0392b}.rg-act.no{background:#fff5f4;border-radius:10px}.rg-act.arr{border-left:4px solid #e0a100;padding-left:8px}'+
      '.rg-origen{color:#8a6100!important;font-weight:600}.rg-motivo{margin-top:6px}.rg-motivo label{display:block;font-size:12.5px;color:#9b1c1c;font-weight:600}.rg-obs-no{border-color:#e2a6a0;background:#fff}.rg-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}'+
      '.rg-chip{border:1px solid #cfdbe3;background:#fff;border-radius:999px;padding:6px 10px;font-size:12.5px;color:#033350;cursor:pointer;min-height:34px}.rg-chip:active{background:#e8f7fe}.rg-chip.on{background:#033350;border-color:#033350;color:#fff}'+
      '@media(max-width:520px){.rg-datos{grid-template-columns:1fr}}';
    document.head.appendChild(s);
  }

  /* ---------- navegación ---------- */
  window.glacialMttoRegistroPantalla={abrir,botonPara,pintar,UI,puedeLlenar};
  if(typeof ajustarVistaSegunPermisos==='function'){
    const a=ajustarVistaSegunPermisos;
    ajustarVistaSegunPermisos=function(){if(state.currentTab===TAB&&regActual())return;return a.apply(this,arguments);};
  }
  if(typeof renderMain==='function'){
    const a=renderMain;
    renderMain=function(){
      if(state.currentTab===TAB&&!state.showWelcome&&regActual()){pintar(document.getElementById('main'));return;}
      document.body.classList.remove('rg-abierto');
      return a.apply(this,arguments);
    };
  }
})();
