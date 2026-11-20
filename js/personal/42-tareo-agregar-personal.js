/* =============================================================
   GLACIAL · TAREO — AGREGAR PERSONAL (Producción y Mantenimiento)
   -------------------------------------------------------------
   El supervisor puede añadir a una persona al tareo del turno:
     · "Ya registrado": un trabajador activo de la lista de Trabajadores
       que no está en este tareo (antes solo Mantenimiento).
     · "Personal nuevo": alguien que acaba de ingresar y todavía no está
       registrado. Se pide nombre, DNI, cargo y línea (Producción).
   La persona se agrega a este tareo y, si se elige «desde una fecha en adelante», también a los tareos ya creados de la misma
   área desde esa fecha (este turno o ambos; no duplica y respeta tareos cerrados y permisos). No crea ni cambia trabajadores:
   RRHH la verá en Incidencias del Excel como "sin cargo verificado" hasta
   que la registre en Trabajadores (se enlaza luego por DNI).

   En Producción el tareo se sincroniza con la rotación Excel y depura lo
   que no figure en ella; por eso la persona queda marcada con
   agregadoManual y esa depuración la conserva (ver 13-tareo.js).

   Campos nuevos por persona (solo en las agregadas así):
     agregadoManual, nuevoIngreso, agregadoPor, agregadoEn
   No cambia la estructura del tareo. Se audita como AGREGAR_PERSONAL.
   Respeta el bloqueo del tareo (41-tareo-bloqueo.js).

   Cargar DESPUÉS de 13-tareo.js. El orden respecto a 40-tareo-auditoria.js es indiferente: la auditoría
   envuelve estas funciones al iniciar la app, cuando ya cargaron todos los scripts.
   ============================================================= */
(function instalarAgregarPersonal(){
  'use strict';

  const CARGOS_NUEVOS={
    'Producción':['Operario de Producción','Líder de Producción'],
    'Mantenimiento':['Técnico de Mantenimiento']
  };
  const esc=t=>typeof escaparHTML==='function'
    ? escaparHTML(t)
    : String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=t=>tareoNormalizarTexto(t);
  const nombreUsuario=()=>{
    const u=(typeof state!=='undefined'&&state.user)||{};
    return u.nombre||u.username||'';
  };
  const trabajadores=()=>(typeof loadWorkers==='function'?loadWorkers():[])||[];

  let modo='registrado';   // 'registrado' | 'nuevo'
  let alcance={tipo:'este',desde:'',turnos:'este'};   // dónde se agrega: solo este tareo | desde una fecha en los tareos ya creados (este turno o ambos)

  /* Tareos ya creados de la MISMA área a los que llega «desde una fecha»: fecha >= desde, turno según la elección y que se puedan modificar
     (permiso y tareo no cerrado). El tareo actual no cuenta (siempre se agrega ahí). */
  function otrosTareosAlcanzados(tareo){
    if(alcance.tipo!=='desde'||!/^\d{4}-\d{2}-\d{2}$/.test(alcance.desde))return {tareos:[],bloqueados:0};
    const area=tareoAreaDe(tareo),turno=normalizarTurno(tareo.turno);
    const lista=[];let bloqueados=0;
    obtenerTareos().forEach(t=>{
      if(!t||t.id===tareo.id||tareoAreaDe(t)!==area||String(t.fecha||'')<alcance.desde)return;
      if(alcance.turnos==='este'&&normalizarTurno(t.turno)!==turno)return;
      if(typeof tareoAutorizadoEscribir==='function'&&!tareoAutorizadoEscribir(t)){bloqueados++;return;}
      lista.push(t);
    });
    return {tareos:lista,bloqueados};
  }
  function textoAlcance(tareo){
    if(alcance.tipo!=='desde')return 'Se agrega solo a este tareo.';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(alcance.desde))return 'Elige una fecha válida.';
    const o=otrosTareosAlcanzados(tareo),n=o.tareos.length;
    let t='Se agregará a este tareo y a '+n+' tareo'+(n===1?'':'s')+' más ya creado'+(n===1?'':'s')+' de '+tareoAreaDe(tareo)+' desde el '+(typeof formatearFecha==='function'?formatearFecha(alcance.desde):alcance.desde)+
      (alcance.turnos==='este'?' (solo turno '+normalizarTurno(tareo.turno)+')':' (ambos turnos)')+'. Donde ya esté, no se duplica.';
    if(o.bloqueados)t+=' '+o.bloqueados+' cerrado'+(o.bloqueados===1?'':'s')+' o sin permiso no se tocan.';
    return t+' Los tareos que se creen después se arman con la rotación.';
  }

  function candidatosRegistrados(tareo){
    const yaEstan=new Set((tareo.personal||[]).flatMap(tareoIdentidades));
    return tareoDeduplicarPersonas(trabajadores().filter(w=>
      w&&norm(w.estado)==='activo'&&!tareoIdentidades(w).some(c=>yaEstan.has(c))
    )).sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es',{sensitivity:'base'}));
  }

  function dibujar(tareo){
    const root=document.getElementById('modal-root');
    if(!root)return;
    const area=tareoAreaDe(tareo);
    const registrados=candidatosRegistrados(tareo);
    const cargos=CARGOS_NUEVOS[area]||[];
    const lineas=(typeof LINES!=='undefined'?LINES:[]);
    const boton=(valor,texto)=>'<button type="button" class="btn btn-sm '+(modo===valor?'btn-primary':'btn-ghost')+
      '" onclick="tareoAgregarPersonalModo(\''+valor+'\')">'+texto+'</button>';

    const panelRegistrado=registrados.length
      ? '<div class="field-sm"><label>Trabajador</label>'+
          '<select id="tareo-agregar-select">'+registrados.map(w=>
            '<option value="'+esc(w.id)+'">'+esc(w.nombre)+' — '+esc(w.cargo||'Sin cargo')+'</option>').join('')+'</select></div>'+
        '<p class="small-muted" style="margin:10px 0 0;">Queda como pendiente de registrar.</p>'
      : '<p class="small-muted" style="margin:0;">No hay más trabajadores registrados para agregar. Si es un ingreso nuevo, usa «Personal nuevo».</p>';

    const panelNuevo=
      '<div class="field-sm"><label>Apellidos y nombres</label>'+
        '<input type="text" id="tan-nombre" maxlength="80" autocomplete="off" placeholder="Ej.: PEREZ GOMEZ JUAN CARLOS"></div>'+
      '<div class="grid grid-2">'+
        '<div class="field-sm"><label>DNI</label><input type="text" id="tan-dni" inputmode="numeric" maxlength="12" autocomplete="off" placeholder="8 dígitos"></div>'+
        '<div class="field-sm"><label>Cargo</label><select id="tan-cargo">'+cargos.map(c=>'<option>'+esc(c)+'</option>').join('')+'</select></div>'+
      '</div>'+
      (area==='Producción'
        ? '<div class="field-sm"><label>Línea (opcional)</label><select id="tan-linea"><option value="">Sin línea</option>'+
            lineas.map(l=>'<option value="'+esc(l.name||l.key)+'">'+esc(l.name||l.key)+'</option>').join('')+'</select></div>'
        : '')+
      '<p class="small-muted" style="margin:10px 0 0;">RRHH deberá registrarlo luego en Trabajadores (se enlaza por DNI).</p>';

    const opAlc=(v,titulo,extra)=>'<label class="tar2-qm-op"><input type="radio" name="tan-alcance" value="'+v+'"'+(alcance.tipo===v?' checked':'')+
      ' onchange="tareoAgregarPersonalAlcance(\''+v+'\')"><span><strong>'+titulo+'</strong>'+(extra||'')+'</span></label>';
    const panelAlcance=
      '<div style="margin-top:14px;"><div class="small-muted" style="font-weight:700;margin-bottom:6px;">Dónde agregarla</div><div class="tar2-qm-ops">'+
        opAlc('este','Solo este tareo')+
        opAlc('desde','Desde una fecha en adelante',
          ' <input type="date" id="tan-desde" value="'+esc(alcance.desde||tareo.fecha)+'"'+(alcance.tipo==='desde'?'':' disabled')+' oninput="tareoAgregarPersonalFecha(this.value)">'+
          ' <select id="tan-turnos"'+(alcance.tipo==='desde'?'':' disabled')+' onchange="tareoAgregarPersonalTurnos(this.value)" style="margin-left:8px;font:inherit;padding:2px 6px;">'+
            '<option value="este"'+(alcance.turnos==='este'?' selected':'')+'>Solo turno '+esc(normalizarTurno(tareo.turno))+'</option>'+
            '<option value="ambos"'+(alcance.turnos==='ambos'?' selected':'')+'>Ambos turnos</option></select>')+
        '</div><div id="tan-alcance-texto" class="tar2-qm-resumen" role="status">'+esc(textoAlcance(tareo))+'</div>'+
      '</div>';

    root.innerHTML=
      '<div class="modal-backdrop" onclick="if(event.target===this)closeModal()">'+
      '<div class="modal" style="max-width:520px;width:96%;">'+
        '<div class="modal-head"><h3>Agregar personal · '+esc(area)+'</h3><button class="modal-close" onclick="closeModal()">✕</button></div>'+
        '<div class="modal-body">'+
          '<div class="actions-row" style="margin:0 0 12px;gap:8px;">'+boton('registrado','Ya registrado')+boton('nuevo','Personal nuevo')+'</div>'+
          (modo==='registrado'?panelRegistrado:panelNuevo)+panelAlcance+
          '<div class="actions-row"><button class="btn btn-primary" onclick="tareoAgregarPersonal()"'+
            (modo==='registrado'&&!registrados.length?' disabled':'')+'>Agregar</button></div>'+
        '</div></div></div>';
    const n=document.getElementById('tan-nombre');
    if(n)n.focus();
  }

  function refrescarAlcance(){
    const tareo=tareoObtenerActual();if(!tareo)return;
    const d=document.getElementById('tan-desde'),t=document.getElementById('tan-turnos'),x=document.getElementById('tan-alcance-texto');
    if(d)d.disabled=alcance.tipo!=='desde';if(t)t.disabled=alcance.tipo!=='desde';
    if(x)x.textContent=textoAlcance(tareo);
  }
  window.tareoAgregarPersonalAlcance=function(v){
    const tareo=tareoObtenerActual();if(!tareo)return;
    alcance.tipo=v==='desde'?'desde':'este';
    if(alcance.tipo==='desde'&&!alcance.desde)alcance.desde=tareo.fecha;
    refrescarAlcance();
  };
  window.tareoAgregarPersonalFecha=function(v){alcance.desde=v;refrescarAlcance();};
  window.tareoAgregarPersonalTurnos=function(v){alcance.turnos=v==='ambos'?'ambos':'este';refrescarAlcance();};

  window.tareoAgregarPersonalModo=function(valor){
    modo=valor==='nuevo'?'nuevo':'registrado';
    const tareo=tareoObtenerActual();
    if(tareo)dibujar(tareo);
  };

  tareoAbrirAgregarPersonal=function(){
    const tareo=tareoObtenerActual();
    if(!tareo||!tareoPuedeEditar(tareo))return;
    modo='registrado';
    alcance={tipo:'este',desde:tareo.fecha,turnos:'este'};
    dibujar(tareo);
  };
  window.tareoAbrirAgregarPersonal=tareoAbrirAgregarPersonal;

  tareoAgregarPersonal=function(){
    const tareo=tareoObtenerActual();
    if(!tareo||!tareoPuedeEditar(tareo))return;
    const area=tareoAreaDe(tareo);
    let base=null,nuevoIngreso=false;

    if(modo==='registrado'){
      const id=document.getElementById('tareo-agregar-select')?.value;
      base=trabajadores().find(w=>String(w.id)===String(id));
      if(!base)return;
    }else{
      const nombre=(document.getElementById('tan-nombre')?.value||'').replace(/\s+/g,' ').trim().toLocaleUpperCase('es');
      const dni=tareoNormalizarDNI(document.getElementById('tan-dni')?.value);
      const cargo=document.getElementById('tan-cargo')?.value||(CARGOS_NUEVOS[area]||[''])[0];
      const linea=document.getElementById('tan-linea')?.value||'';
      if(nombre.length<5||nombre.split(' ').length<2){alert('Escribe apellidos y nombres completos.');return;}
      if(dni&&!/^\d{8,12}$/.test(dni)){alert('El DNI debe tener solo números (8 dígitos).');return;}
      if(!dni&&!confirm('No ingresaste DNI. RRHH tendrá que completarlo después.\n\n¿Agregar sin DNI?'))return;
      // ¿Ya está registrado? Se pide usar la otra opción para no duplicar al trabajador.
      const registrado=trabajadores().find(w=>w&&((dni&&tareoNormalizarDNI(w.dni)===dni)||norm(w.nombre)===norm(nombre)));
      if(registrado){
        alert('«'+registrado.nombre+'» ya figura en Trabajadores. Usa la opción «Ya registrado».');
        return;
      }
      base={trabajadorId:'nuevo_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6),nombre,dni,cargo,linea};
      nuevoIngreso=true;
    }

    if(alcance.tipo==='desde'&&!/^\d{4}-\d{2}-\d{2}$/.test(alcance.desde)){alert('Elige una fecha válida.');return;}

    // No duplicar a quien ya está en este tareo (DNI / ID / nombre).
    const yaEsta=(tareo.personal||[]).some(p=>tareoMismaPersonaFlexible(p,base)||tareoIdentidades(p).some(c=>tareoIdentidades(base).includes(c)));
    if(yaEsta){alert('Esa persona ya está en este tareo.');return;}

    // Si estaba quitada del tareo (ya no trabajaba), agregarla de nuevo levanta la exclusión.
    if(window.TareoEd)window.TareoEd.levantarExclusion(tareo,base);
    const persona=tareoNuevaPersona(base,area);
    persona.agregadoManual=true;
    persona.nuevoIngreso=nuevoIngreso;
    persona.agregadoPor=nombreUsuario();
    persona.agregadoEn=Date.now();
    persona.actualizadoEn=typeof tareoAhoraMs==='function'?tareoAhoraMs():Date.now();

    tareo.personal=tareo.personal||[];
    tareo.personal.push(persona);
    tareo.personal=ordenarPersonalTareo(tareo.personal);

    guardarTareoEnMemoria(tareo);

    // «Desde una fecha»: también en los tareos ya creados de esta área (donde aún no esté), sin duplicar.
    let agregadosEn=0;
    if(alcance.tipo==='desde'){
      otrosTareosAlcanzados(tareo).tareos.forEach(t=>{
        const ya=(t.personal||[]).some(p=>tareoMismaPersonaFlexible(p,base)||tareoIdentidades(p).some(c=>tareoIdentidades(base).includes(c)));
        if(ya)return;
        if(window.TareoEd)window.TareoEd.levantarExclusion(t,base);
        const copia=tareoNuevaPersona(base,area);
        copia.agregadoManual=true;copia.nuevoIngreso=nuevoIngreso;copia.agregadoPor=nombreUsuario();copia.agregadoEn=Date.now();
        copia.actualizadoEn=typeof tareoAhoraMs==='function'?tareoAhoraMs():Date.now();
        t.personal=ordenarPersonalTareo([...(t.personal||[]),copia]);
        guardarTareoEnMemoria(t);
        agregadosEn++;
      });
    }
    closeModal();
    renderTareoFormulario(tareo);
    if(alcance.tipo==='desde')alert('«'+(base.nombre||'La persona')+'» se agregó a este tareo y a '+agregadosEn+' tareo'+(agregadosEn===1?'':'s')+' más.');
  };
  window.tareoAgregarPersonal=tareoAgregarPersonal;
})();
