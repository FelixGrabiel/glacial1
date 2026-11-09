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
  const UI={semanaVista:null,reg:null,guardado:'ok',error:'',obs:new Set(),pendiente:false,aviso:''};
  const PANT=()=>window.glacialMttoPlanPantalla;
  const usuario=()=>(typeof state!=='undefined'&&state.user)||null;
  const compartida=()=>{try{return typeof esMantCompartido==='function'&&esMantCompartido(usuario());}catch(_){return false;}};
  const esSup=()=>!!(PANT()&&PANT().puedeEditar());
  const tecnicoActivo=()=>{try{return typeof window.mantTecnicoActivo==='function'?window.mantTecnicoActivo():null;}catch(_){return null;}};
  /* ¿Puede llenar registros? El técnico identificado con su PIN (cuenta compartida) o el supervisor / jefe. */
  const puedeLlenar=()=>esSup()||(compartida()&&!!tecnicoActivo());
  const quien=()=>{const t=tecnicoActivo();return (t&&t.nombre)||(usuario()&&(usuario().nombre||usuario().username))||'';};
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
    UI.reg=reg.id;UI.obs=new Set();UI.guardado='ok';UI.error='';
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
    const est=N.ESTADOS_REG[reg.estado]||N.ESTADOS_REG.PENDIENTE;
    const lista=nombresTrabajadores();
    const dl='<datalist id="rg-personas">'+lista.map(n=>'<option value="'+esc(n)+'">').join('')+'</datalist>';
    const btn=(campo,valor,txt)=>'<button type="button" class="rg-op'+(reg[campo]===valor?' on':'')+'" data-rg-campo="'+campo+'" data-rg-valor="'+valor+'"'+dis+' aria-pressed="'+(reg[campo]===valor)+'">'+txt+'</button>';
    const filas=acts.map(a=>{
      const obsAbierta=UI.obs.has(a.id)||!!a.observacion;
      return '<li class="rg-act'+(a.realizado?' ok':'')+'" data-rg-fila="'+esc(a.id)+'"><button type="button" class="rg-chk" data-rg-marcar="'+esc(a.id)+'" aria-pressed="'+(!!a.realizado)+'" aria-label="'+(a.realizado?'Desmarcar':'Marcar como realizada')+' '+esc(a.equipo)+'"'+dis+'>'+(a.realizado?'✓':'')+'</button>'+
        '<div class="rg-txt"><b>'+esc(a.item)+'. '+esc(a.equipo)+'</b><small>'+esc(a.actividad)+(a.actividad?' · ':'')+esc(a.frecuencia)+'</small>'+
        (obsAbierta?'<textarea class="rg-obs" data-rg-obs="'+esc(a.id)+'" rows="2" maxlength="500" placeholder="Observación"'+dis+'>'+esc(a.observacion)+'</textarea>':(ed?'<button type="button" class="rg-obs-btn" data-rg-obs-abrir="'+esc(a.id)+'">+ Observación</button>':''))+
        (a.marcado_por&&a.realizado?'<small class="rg-quien">'+esc(a.marcado_por)+'</small>':'')+'</div></li>';
    }).join('');
    main.innerHTML='<section class="rg" id="rg-raiz">'+dl+
      '<header class="rg-cab"><button type="button" class="rg-atras" data-rg-volver aria-label="Volver al Programa semanal">‹</button><div><h2>Registro de mantenimiento</h2><small>CFA-CA-F-023 · '+esc(maq.nombre)+' · '+esc(maq.linea_impresion||'PET')+'</small></div>'+
      '<span id="rg-guardado" class="rg-guardado '+UI.guardado+'" role="status">'+(UI.guardado==='guardando'?'Guardando…':UI.guardado==='error'?'No se guardó':'Guardado')+'</span></header>'+
      '<div id="rg-error" class="rg-error" role="alert"'+(UI.error?'':' hidden')+'>'+esc(UI.error)+'</div>'+
      '<div class="rg-prog"><div class="rg-prog-t"><span id="rg-prog-txt">'+pr.hechas+' de '+pr.total+' realizadas</span><span class="ps-est ps-'+est.cls+'">'+est.txt+'</span></div><div class="rg-barra"><i id="rg-prog-bar" style="width:'+pr.pct+'%"></i></div></div>'+
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
    const mk=e.target.closest('[data-rg-marcar]');
    if(mk){
      const a=D.cache.regActs.find(x=>x.id===mk.getAttribute('data-rg-marcar'));if(!a)return;
      const nuevo=!a.realizado,previo={realizado:a.realizado,marcado_por:a.marcado_por,marcado_en:a.marcado_en};
      a.realizado=nuevo;a.marcado_por=quien();repintar(true);                                  // se ve al instante; si falla, vuelve atrás
      guardar(async()=>{try{await D.marcarActividad(a,nuevo,quien());}catch(err){Object.assign(a,previo);throw err;}});return;
    }
    const oa=e.target.closest('[data-rg-obs-abrir]');
    if(oa){UI.obs.add(oa.getAttribute('data-rg-obs-abrir'));repintar(true);const t=document.querySelector('[data-rg-obs="'+oa.getAttribute('data-rg-obs-abrir')+'"]');if(t)t.focus();return;}
    const op=e.target.closest('[data-rg-campo]');
    if(op){const c=op.getAttribute('data-rg-campo'),v=op.getAttribute('data-rg-valor');if(reg[c]===v)return;reg[c]=v;repintar(true);guardar(()=>D.guardarCampos(reg.id,{[c]:v}));return;}
    if(e.target.closest('[data-rg-cerrar]')){
      const pr=N.progresoRegistro(actsDe(reg)),f=pr.total-pr.hechas;
      if(f>0&&!confirm('Quedan '+f+' actividad'+(f===1?'':'es')+' sin marcar. ¿Cerrar el registro de todos modos?'))return;
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
      Object.assign(reg,campos);guardar(()=>D.guardarCampos(reg.id,campos)).then(()=>{if(c==='fecha')repintar(true);});return;
    }
    if(t.hasAttribute('data-rg-obs')){
      const a=D.cache.regActs.find(x=>x.id===t.getAttribute('data-rg-obs'));if(!a||a.observacion===t.value)return;
      a.observacion=t.value;guardar(()=>D.guardarObservacion(a,t.value,quien()));return;
    }
    if(t.hasAttribute('data-rg-pieza')){
      const o=Number(t.getAttribute('data-rg-pieza'));guardar(()=>D.guardarPieza(reg.id,o,t.value));
    }
  });
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
  function avanceEnVivo(){
    const reg=regActual(),t=document.getElementById('rg-prog-txt'),b=document.getElementById('rg-prog-bar');
    if(!reg||!t||!b)return;const pr=N.progresoRegistro(actsDe(reg));t.textContent=pr.hechas+' de '+pr.total+' realizadas';b.style.width=pr.pct+'%';
  }
  D.alCambiar(()=>{avanceEnVivo();repintar(false);});

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
