/* =============================================================
   GLACIAL · TAREO DE MANTENIMIENTO — PERSONAL DEL ÁREA (desde el Inicio del Tareo)
   -------------------------------------------------------------
   En la tabla «Personal de mantenimiento» (Inicio del Tareo) se puede, sin abrir un tareo:
     1) QUITAR a una persona («ya no trabaja aquí») desde una fecha en adelante, o de todos los tareos (se registró por error).
        Usa la misma baja que «✕ Quitar» dentro de un tareo: una exclusión permanente (tareo.personalExcluido) que impide que la
        sincronización y los tareos nuevos la vuelvan a traer, y la borra de los tareos ya creados desde esa fecha. No borra al
        trabajador de Trabajadores. Los quitados se ven en «Personal quitado» y se pueden RESTAURAR.
     2) AGREGAR PERSONAL POR DÍA con un RANGO de fechas: una persona (no planilla) en los tareos ya creados entre dos fechas,
        en el turno Día, Noche o ambos. No duplica; respeta permisos y tareos cerrados. Los días del rango sin tareo creado no se tocan
        (se informan): al abrir ese día se crea el tareo y se puede repetir.
   Solo Mantenimiento. Cargar DESPUÉS de 13-tareo.js y 45-tareo-edicion-continua.js.
   ============================================================= */
(function instalarPersonalArea(){
  'use strict';
  const AREA='Mantenimiento';
  const esc=t=>typeof escaparHTML==='function'
    ? escaparHTML(t)
    : String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const FECHA_OK=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''))&&!Number.isNaN(new Date(f+'T00:00:00').getTime());
  const MAX_DIAS=62;
  const usuario=()=>(typeof state!=='undefined'&&state.user)||{};
  const nombreUsuario=()=>usuario().nombre||usuario().username||'';
  const fLinda=f=>typeof formatearFecha==='function'?formatearFecha(f):String(f||'');
  const hoy=()=>{if(typeof obtenerFechaHoy==='function')return obtenerFechaHoy();const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
  const ids=p=>typeof tareoIdentidades==='function'?tareoIdentidades(p):[];
  const mismas=(a,b)=>(a||[]).some(i=>(b||[]).includes(i));
  const marcas=p=>!!(p&&(p.asistencia||p.horaIngreso||p.salidaRefrigerio||p.retornoRefrigerio||p.horaSalida));
  const tareosArea=()=>(typeof obtenerTareos==='function'?obtenerTareos():[]).filter(t=>t&&tareoAreaDe(t)===AREA);
  const editable=t=>typeof tareoAutorizadoEscribir!=='function'||tareoAutorizadoEscribir(t);
  const ts=()=>window.TareoEd&&window.TareoEd.nuevoTs?window.TareoEd.nuevoTs():Date.now();
  /* ¿Puede este usuario modificar el personal de Mantenimiento desde aquí? (permiso del área y fuera del modo solo consulta) */
  function puede(){
    try{
      if(typeof esUsuarioSoloConsulta==='function'&&esUsuarioSoloConsulta(usuario()))return false;
      return typeof tareoAutorizadoEscribir!=='function'||!!tareoAutorizadoEscribir(AREA);
    }catch(_){return false;}
  }

  /* ---------- personas del área y su baja ---------- */
  const personasArea=()=>(typeof obtenerPersonalTareo==='function'?obtenerPersonalTareo(AREA):[])||[];
  const clavePersona=p=>String(typeof tareoClavePersona==='function'?tareoClavePersona(p):(p.trabajadorId||p.dni||p.nombre));
  const porClave=k=>personasArea().find(p=>clavePersona(p)===k)||null;
  /* Quita de la lista a quien tiene una baja vigente hoy (la entrada más nueva por persona decide; restaurar la anula). */
  function visibles(area,lista){
    if(area!==AREA||!window.TareoEd||!window.TareoEd.filtroExclusion)return lista;
    try{
      const excl=window.TareoEd.filtroExclusion({id:'',area:AREA,fecha:hoy()});
      return (lista||[]).filter(p=>!excl(p));
    }catch(_){return lista;}
  }
  /* Bajas vigentes (permanentes y activas) en los tareos del área: una por persona, la más nueva. */
  function bajasVigentes(){
    const por=[];
    tareosArea().forEach(t=>(Array.isArray(t.personalExcluido)?t.personalExcluido:[]).forEach(e=>{
      if(!e||!e.permanente)return;
      const i=por.findIndex(x=>mismas(x.ids,e.ids));
      if(i<0)por.push(e);else if(Number(e.en||0)>Number(por[i].en||0))por[i]=e;
    }));
    return por.filter(e=>e.activa);
  }

  /* Tareos de la persona que alcanza la baja: fecha >= desde, que la tengan y se puedan modificar. */
  function alcanceBaja(p,alcance,desde){
    const mis=ids(p),piso=alcance==='todos'?'':String(desde||'');
    const lista=[];let conMarcas=0,bloqueados=0,sinPermiso=0;
    tareosArea().forEach(t=>{
      if(piso&&String(t.fecha||'')<piso)return;
      const q=(t.personal||[]).find(x=>mismas(ids(x),mis));
      if(!q)return;
      if(!editable(t)){bloqueados++;return;}
      lista.push(t);if(marcas(q))conMarcas++;
    });
    return {lista,conMarcas,bloqueados};
  }
  /* Tareo más reciente (de fecha >= desde) que se puede modificar: guarda la baja para los tareos que se creen después. */
  function anfitrion(desde){
    return tareosArea().filter(t=>editable(t)&&String(t.fecha||'')>=String(desde||''))
      .sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||''))||String(b.turno||'').localeCompare(String(a.turno||'')))[0]||null;
  }
  /* Ejecuta la baja. Devuelve {quitados, conMarcas, bloqueados} o lanza Error con el motivo. */
  function ejecutarQuitar(p,alcance,desde){
    if(!puede())throw new Error('No tienes permiso para modificar el personal de Mantenimiento.');
    const d=alcance==='todos'?'0000-01-01':String(desde||'');
    if(alcance==='desde'&&!FECHA_OK(d))throw new Error('Elige una fecha válida.');
    const alc=alcanceBaja(p,alcance,d);
    const host=anfitrion(d);
    if(!alc.lista.length&&!host)throw new Error('No hay ningún tareo de Mantenimiento desde esa fecha donde guardar la baja. Elige una fecha anterior o igual a la del último tareo.');
    const mis=ids(p);
    const entrada={clave:clavePersona(p),ids:mis,nombre:p.nombre||'',dni:p.dni||'',cargo:p.cargo||'',linea:p.linea||'',trabajadorId:p.trabajadorId||'',
      tipoDocumento:p.tipoDocumento||'DNI',por:nombreUsuario(),en:ts(),activa:true,permanente:true,desde:d,alcance,teniaMarcas:alc.conMarcas>0,origen:'INICIO'};
    const sellar=(t,quitarPersona)=>{
      t.personalExcluido=[...(Array.isArray(t.personalExcluido)?t.personalExcluido:[]).filter(e=>!mismas(e.ids,mis)),entrada];
      if(quitarPersona){
        t.personal=(t.personal||[]).filter(x=>!mismas(ids(x),mis));
        if(window.TareoEd&&window.TareoEd.descartarOps)window.TareoEd.descartarOps(t.id,clavePersona(p));
      }
      guardarTareoEnMemoria(t);
    };
    alc.lista.forEach(t=>sellar(t,true));
    if(host&&!alc.lista.includes(host))sellar(host,false);      // solo guarda la baja (no toca a nadie más)
    return {quitados:alc.lista.length,conMarcas:alc.conMarcas,bloqueados:alc.bloqueados};
  }
  /* Restaurar: la baja pasa a inactiva (más nueva) en todos los tareos que la tienen; la persona vuelve cuando se abra/sincronice un tareo. */
  function restaurar(clave){
    if(!puede())return alert('No tienes permiso para modificar el personal de Mantenimiento.');
    const baja=bajasVigentes().find(e=>e.clave===clave);
    if(!baja)return;
    const nuevo=ts();let n=0;
    tareosArea().forEach(t=>{
      if(!editable(t))return;
      let cambio=false;
      (Array.isArray(t.personalExcluido)?t.personalExcluido:[]).forEach(e=>{if(e&&e.activa&&mismas(e.ids,baja.ids)){e.activa=false;e.en=nuevo;e.restauradoPor=nombreUsuario();cambio=true;}});
      if(cambio){guardarTareoEnMemoria(t);n++;}
    });
    /* La baja puede estar en tareos que ya no se pueden modificar (cerrados): para que igual deje de valer, se guarda una entrada
       «restaurada» más nueva en el tareo más reciente que sí se puede modificar (la entrada más nueva por persona decide en todos los tareos). */
    const host=tareosArea().filter(editable).sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||''))||String(b.turno||'').localeCompare(String(a.turno||'')))[0];
    if(host){
      const mis=baja.ids||[];
      const entrada=Object.assign({},baja,{activa:false,permanente:true,desde:'0000-01-01',en:ts(),restauradoPor:nombreUsuario()});
      host.personalExcluido=[...(Array.isArray(host.personalExcluido)?host.personalExcluido:[]).filter(e=>!mismas(e.ids,mis)),entrada];
      guardarTareoEnMemoria(host);
    }
    redibujar();
    alert((baja.nombre||'La persona')+' volvió al personal de Mantenimiento'+(host||n?'':' (no se encontró ningún tareo modificable donde guardarlo)')+'. Aparecerá en los tareos que se abran o se creen.');
  }

  /* ---------- ventana ---------- */
  const raiz=()=>document.getElementById('modal-root');
  function cerrar(){const r=raiz();if(r)r.innerHTML='';E.q=null;E.d=null;E.pd=null;}
  function redibujar(){try{if(typeof renderTareoPrincipal==='function')renderTareoPrincipal();}catch(_){/* pantalla no disponible */}}
  const E={q:null,d:null,pd:null};
  function marco(titulo,cuerpo,pie){
    return '<div class="modal-backdrop" onclick="if(event.target===this)TareoArea.cerrar()"><div class="modal" style="max-width:580px;width:96%;max-height:92vh;overflow:auto;">'+
      '<div class="modal-head"><h3>'+titulo+'</h3><button class="modal-close" onclick="TareoArea.cerrar()">✕</button></div>'+
      '<div class="modal-body">'+cuerpo+'<div class="actions-row">'+pie+'</div></div></div></div>';
  }

  /* --- quitar --- */
  function abrirQuitar(clave){
    if(!puede())return alert('No tienes permiso para modificar el personal de Mantenimiento.');
    const p=porClave(clave);if(!p)return;
    E.q={clave,alcance:'desde',desde:hoy()};
    dibujarQuitar();
  }
  function dibujarQuitar(){
    const r=raiz(),q=E.q;if(!r||!q)return;
    const p=porClave(q.clave);if(!p)return cerrar();
    const op=(v,titulo,ayuda,extra)=>'<label class="tar2-qm-op"><input type="radio" name="tpa-alc" value="'+v+'"'+(q.alcance===v?' checked':'')+' onchange="TareoArea.qAlcance(this.value)"><span><strong>'+titulo+'</strong>'+(extra||'')+'<small class="small-muted">'+ayuda+'</small></span></label>';
    r.innerHTML=marco('Quitar a '+esc(p.nombre||'esta persona'),
      '<p class="small-muted" style="margin:0 0 10px;">'+esc(p.cargo||'Sin cargo')+' · DNI '+esc(p.dni||'—')+' · Personal de Mantenimiento</p>'+
      '<div class="tar2-qm-ops">'+
        op('desde','Desde una fecha en adelante','Ya no trabaja aquí (fecha de cese): sale de los tareos desde esa fecha y no vuelve en los que se creen.',
          ' <input type="date" id="tpa-fecha" value="'+esc(q.desde)+'"'+(q.alcance==='desde'?'':' disabled')+' oninput="TareoArea.qFecha(this.value)">')+
        op('todos','De todos los tareos','Se registró por error: se borra de todos los tareos de Mantenimiento, pasados y futuros.')+
      '</div><div id="tpa-resumen" class="tar2-qm-resumen" role="status"></div>'+
      '<label id="tpa-confirma-fila" class="tar2-qm-confirma" hidden><input type="checkbox" id="tpa-confirma"> Entiendo que se borrarán las marcaciones de esos tareos.</label>'+
      '<p class="small-muted" style="margin:10px 0 0;">No se elimina de Trabajadores. Se puede restaurar en «Personal quitado».</p>',
      '<button class="btn btn-ghost" onclick="TareoArea.cerrar()">Cancelar</button><button class="btn btn-danger" onclick="TareoArea.qConfirmar()">Quitar</button>');
    resumenQuitar();
  }
  function resumenQuitar(){
    const q=E.q,c=document.getElementById('tpa-resumen');if(!q||!c)return;
    const p=porClave(q.clave);if(!p)return;
    const d=q.alcance==='todos'?'0000-01-01':q.desde,f=document.getElementById('tpa-fecha');if(f)f.disabled=q.alcance!=='desde';
    if(q.alcance==='desde'&&!FECHA_OK(q.desde)){c.textContent='Elige una fecha válida.';return;}
    const a=alcanceBaja(p,q.alcance,d),n=a.lista.length;
    let t='Se quitará de '+n+' tareo'+(n===1?'':'s')+' ya creado'+(n===1?'':'s')+'.';
    t+=a.conMarcas?' '+a.conMarcas+' tienen asistencia u horas que se perderán.':' Ninguno tiene asistencia ni horas registradas.';
    if(a.bloqueados)t+=' '+a.bloqueados+' cerrado'+(a.bloqueados===1?'':'s')+' o sin permiso no se tocan.';
    if(!n&&!anfitrion(d))t+=' No hay ningún tareo desde esa fecha donde guardar la baja.';
    c.textContent=t;
    const fila=document.getElementById('tpa-confirma-fila');if(fila)fila.hidden=!(a.conMarcas>0);
  }
  function qConfirmar(){
    const q=E.q;if(!q)return;
    const p=porClave(q.clave);if(!p)return cerrar();
    const d=q.alcance==='todos'?'0000-01-01':q.desde;
    const a=alcanceBaja(p,q.alcance,d);
    if(a.conMarcas>0){const ch=document.getElementById('tpa-confirma');if(!ch||!ch.checked){alert('Marca la casilla para confirmar que se borrarán las marcaciones.');return;}}
    try{
      const r=ejecutarQuitar(p,q.alcance,q.alcance==='todos'?'':q.desde);
      const nombre=p.nombre||'La persona';
      cerrar();redibujar();
      alert(nombre+' ya no figura en el personal de Mantenimiento.\n\nSe quitó de '+r.quitados+' tareo'+(r.quitados===1?'':'s')+'.'+(r.bloqueados?'\n'+r.bloqueados+' cerrado'+(r.bloqueados===1?'':'s')+' o sin permiso no se tocaron.':''));
    }catch(e){alert(e&&e.message?e.message:'No se pudo quitar.');}
  }

  /* --- personal por día con rango --- */
  const TURNOS=['Día','Noche'];
  const turnoDe=t=>typeof normalizarTurno==='function'?normalizarTurno(t.turno):t.turno;
  function diasDelRango(desde,hasta){
    const dias=[];if(!FECHA_OK(desde)||!FECHA_OK(hasta)||desde>hasta)return dias;
    for(let f=new Date(desde+'T00:00:00');dias.length<=MAX_DIAS+1;f.setDate(f.getDate()+1)){
      const s=f.getFullYear()+'-'+String(f.getMonth()+1).padStart(2,'0')+'-'+String(f.getDate()).padStart(2,'0');
      dias.push(s);if(s>=hasta)break;
    }
    return dias;
  }
  function yaEsta(t,nombre,dni){
    const act=typeof tareoPorDiaActivos==='function'?tareoPorDiaActivos(t):(t.personalPorDia||[]).filter(p=>p&&!p.eliminada);
    const nn=tareoNormalizarTexto(String(nombre||'').replace(/\s+/g,' ').trim()),dd=typeof tareoNormalizarDNI==='function'?tareoNormalizarDNI(dni):dni;
    return act.some(p=>(dd&&(typeof tareoNormalizarDNI==='function'?tareoNormalizarDNI(p.dni):p.dni)===dd)||(!dd&&tareoNormalizarTexto(String(p.nombre||'').replace(/\s+/g,' ').trim())===nn));
  }
  /* Qué tareos alcanza el rango: los ya creados (área, fechas, turno) que se pueden modificar y donde aún no está la persona. */
  function alcanceRango(d){
    const dias=diasDelRango(d.desde,d.hasta),turnos=d.turnos==='ambos'?TURNOS:[d.turnos];
    const lista=[];let duplicados=0,bloqueados=0,sinTareo=0;
    dias.forEach(f=>turnos.forEach(tn=>{
      const t=tareosArea().find(x=>x.fecha===f&&turnoDe(x)===tn);
      if(!t){sinTareo++;return;}
      if(!editable(t)){bloqueados++;return;}
      if(yaEsta(t,d.nombre,d.dni)){duplicados++;return;}
      lista.push(t);
    }));
    return {lista,duplicados,bloqueados,sinTareo,dias:dias.length};
  }
  function abrirPorDia(){
    if(!puede())return alert('No tienes permiso para modificar el personal de Mantenimiento.');
    E.d={nombre:'',dni:'',cargo:'',desde:hoy(),hasta:hoy(),turnos:'ambos',ingreso:'',salida:'',sref:'',rref:'',obs:''};
    dibujarPorDia();
  }
  function leerForm(){
    const d=E.d;if(!d)return;
    const v=id=>{const e=document.getElementById(id);return e?e.value:null;};
    ['nombre','dni','cargo','desde','hasta','turnos','ingreso','salida','sref','rref','obs'].forEach(k=>{const x=v('tpa-'+k);if(x!==null)d[k]=x;});
  }
  function dibujarPorDia(){
    const r=raiz(),d=E.d;if(!r||!d)return;
    const campo=(id,etq,html)=>'<div class="field" style="margin:0 0 10px;"><label for="tpa-'+id+'" style="display:block;font-size:12px;color:#587087;margin-bottom:3px;">'+etq+'</label>'+html+'</div>';
    const inp=(id,tipo,extra)=>'<input id="tpa-'+id+'" type="'+tipo+'" value="'+esc(d[id])+'" oninput="TareoArea.dCambia()" '+(extra||'')+' style="width:100%;box-sizing:border-box;min-height:42px;">';
    r.innerHTML=marco('Agregar personal por día (rango de fechas)',
      '<p class="small-muted" style="margin:0 0 10px;">Una persona que no está en planilla, en los tareos de Mantenimiento ya creados entre dos fechas.</p>'+
      campo('nombre','Nombres y apellidos *',inp('nombre','text','maxlength="80" placeholder="Nombre y apellido" autocomplete="off"'))+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'+campo('dni','DNI (opcional)',inp('dni','text','inputmode="numeric" maxlength="12"'))+campo('cargo','Cargo / área (opcional)',inp('cargo','text','maxlength="60"'))+'</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'+campo('desde','Desde *',inp('desde','date'))+campo('hasta','Hasta *',inp('hasta','date'))+'</div>'+
      campo('turnos','Turnos','<select id="tpa-turnos" onchange="TareoArea.dCambia()" style="width:100%;min-height:42px;"><option value="ambos"'+(d.turnos==='ambos'?' selected':'')+'>Día y Noche</option><option value="Día"'+(d.turnos==='Día'?' selected':'')+'>Solo Día</option><option value="Noche"'+(d.turnos==='Noche'?' selected':'')+'>Solo Noche</option></select>')+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'+campo('ingreso','Hora de ingreso (opcional)',inp('ingreso','time'))+campo('salida','Hora de salida (opcional)',inp('salida','time'))+'</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'+campo('sref','Salida a refrigerio (opcional)',inp('sref','time'))+campo('rref','Retorno de refrigerio (opcional)',inp('rref','time'))+'</div>'+
      campo('obs','Observación (opcional)',inp('obs','text','maxlength="120"'))+
      '<div id="tpa-resumen" class="tar2-qm-resumen" role="status"></div>',
      '<button class="btn btn-ghost" onclick="TareoArea.cerrar()">Cancelar</button><button class="btn btn-primary" onclick="TareoArea.dConfirmar()">Agregar</button>');
    resumenPorDia();
  }
  function resumenPorDia(){
    const d=E.d,c=document.getElementById('tpa-resumen');if(!d||!c)return;
    if(!FECHA_OK(d.desde)||!FECHA_OK(d.hasta)){c.textContent='Elige las dos fechas.';return;}
    if(d.desde>d.hasta){c.textContent='La fecha «Desde» no puede ser posterior a «Hasta».';return;}
    const dias=diasDelRango(d.desde,d.hasta).length;
    if(dias>MAX_DIAS){c.textContent='El rango es de más de '+MAX_DIAS+' días: divídelo en partes.';return;}
    const a=alcanceRango(d),n=a.lista.length;
    let t='Se agregará a '+n+' tareo'+(n===1?'':'s')+' de Mantenimiento ('+dias+' día'+(dias===1?'':'s')+' en el rango).';
    if(a.duplicados)t+=' '+a.duplicados+' ya lo tienen y no se repiten.';
    if(a.sinTareo)t+=' '+a.sinTareo+' turno'+(a.sinTareo===1?'':'s')+' sin tareo creado no se tocan (se agrega al crearlos: repite este paso).';
    if(a.bloqueados)t+=' '+a.bloqueados+' cerrado'+(a.bloqueados===1?'':'s')+' o sin permiso no se tocan.';
    c.textContent=t;
  }
  function dConfirmar(){
    leerForm();const d=E.d;if(!d)return;
    const nombre=String(d.nombre||'').replace(/\s+/g,' ').trim();
    const dni=typeof tareoNormalizarDNI==='function'?tareoNormalizarDNI(d.dni):String(d.dni||'').replace(/\D/g,'');
    if(!nombre)return alert('Escribe los nombres y apellidos.');
    if(dni&&!/^\d{8,12}$/.test(dni))return alert('El DNI debe tener solo números (8 dígitos).');
    if(!FECHA_OK(d.desde)||!FECHA_OK(d.hasta)||d.desde>d.hasta)return alert('Revisa las fechas: «Desde» no puede ser posterior a «Hasta».');
    if(diasDelRango(d.desde,d.hasta).length>MAX_DIAS)return alert('El rango es de más de '+MAX_DIAS+' días: divídelo en partes.');
    if(d.ingreso&&d.salida&&d.ingreso===d.salida)return alert('La hora de ingreso y la de salida no pueden ser iguales.');
    if(!puede())return alert('No tienes permiso para modificar el personal de Mantenimiento.');
    const a=alcanceRango({...d,nombre,dni});
    if(!a.lista.length)return alert('No hay tareos donde agregarlo'+(a.duplicados?' (ya está en todos los del rango)':a.sinTareo?' (los días del rango no tienen tareo creado)':'')+'.');
    const ahora=Date.now();
    a.lista.forEach((t,i)=>{
      const persona={id:'pd_'+ahora+'_'+i+'_'+Math.random().toString(36).slice(2,6),tipo:'POR DÍA',nombre,dni,area:String(d.cargo||'').trim(),
        horaIngreso:d.ingreso||'',horaSalida:d.salida||'',salidaRefrigerio:d.sref||'',retornoRefrigerio:d.sref?(d.rref||''):'',observacion:String(d.obs||'').trim(),registradoPor:nombreUsuario(),creadoEn:ahora,actualizadoEn:ahora,
        rango:{desde:d.desde,hasta:d.hasta}};
      t.personalPorDia=[...(Array.isArray(t.personalPorDia)?t.personalPorDia:[]),persona];
      guardarTareoEnMemoria(t);
    });
    cerrar();redibujar();
    alert(nombre+' se agregó como personal por día a '+a.lista.length+' tareo'+(a.lista.length===1?'':'s')+'.'+(a.sinTareo?'\n'+a.sinTareo+' turno'+(a.sinTareo===1?'':'s')+' del rango no tienen tareo creado.':''));
  }

  /* --- quitar personal POR DÍA desde una fecha / en un rango / de todos --- */
  const claveDia=p=>{const d=typeof tareoNormalizarDNI==='function'?tareoNormalizarDNI(p.dni):String(p.dni||'').replace(/\D/g,'');return d||('N:'+tareoNormalizarTexto(String(p.nombre||'').replace(/\s+/g,' ').trim()));};
  const activosDia=t=>(Array.isArray(t.personalPorDia)?t.personalPorDia:[]).filter(p=>p&&!p.eliminada);
  /* Personas por día de los tareos de Mantenimiento: una fila por persona, con cuántos tareos y entre qué fechas. */
  function porDiaAgrupado(){
    const mapa=new Map();
    tareosArea().forEach(t=>{
      const vistos=new Set();
      activosDia(t).forEach(p=>{
        const k=claveDia(p),g=mapa.get(k)||{clave:k,nombre:p.nombre||'',dni:p.dni||'',cargo:p.area||'',tareos:0,repetidos:0,desde:'',hasta:''};
        if(vistos.has(k))g.repetidos++;else{vistos.add(k);g.tareos++;}
        const f=String(t.fecha||'');if(!g.desde||f<g.desde)g.desde=f;if(!g.hasta||f>g.hasta)g.hasta=f;
        mapa.set(k,g);
      });
    });
    return [...mapa.values()].sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),'es',{sensitivity:'base'}));
  }
  /* Tareos que alcanza la baja de una persona por día: alcance 'desde' (fecha >= desde), 'rango' (desde <= fecha <= hasta) o 'todos'. */
  function alcancePorDia(clave,alc){
    const lista=[];let bloqueados=0;
    tareosArea().forEach(t=>{
      const f=String(t.fecha||'');
      if(alc.tipo==='desde'&&f<alc.desde)return;
      if(alc.tipo==='rango'&&(f<alc.desde||f>alc.hasta))return;
      if(!activosDia(t).some(p=>claveDia(p)===clave))return;
      if(!editable(t)){bloqueados++;return;}
      lista.push(t);
    });
    return {lista,bloqueados};
  }
  function ejecutarQuitarPorDia(clave,alc){
    if(!puede())throw new Error('No tienes permiso para modificar el personal de Mantenimiento.');
    if(alc.tipo!=='todos'&&!FECHA_OK(alc.desde))throw new Error('Elige una fecha válida.');
    if(alc.tipo==='rango'&&(!FECHA_OK(alc.hasta)||alc.desde>alc.hasta))throw new Error('Revisa las fechas: «Desde» no puede ser posterior a «Hasta».');
    const a=alcancePorDia(clave,alc),ahora=ts();
    a.lista.forEach(t=>{
      activosDia(t).forEach(p=>{if(claveDia(p)===clave){p.eliminada=true;p.eliminadaPor=nombreUsuario();p.actualizadoEn=ahora;}});     // baja lógica (se fusiona entre equipos)
      guardarTareoEnMemoria(t);
    });
    return {quitados:a.lista.length,bloqueados:a.bloqueados};
  }
  /* Deja una sola vez a la persona en los tareos donde quedó repetida (conserva la primera). */
  function quitarRepetidosDia(clave){
    if(!puede())return;
    let n=0;const ahora=ts();
    tareosArea().forEach(t=>{
      if(!editable(t))return;
      const mias=activosDia(t).filter(p=>claveDia(p)===clave);
      if(mias.length<2)return;
      mias.sort((a,b)=>Number(a.creadoEn||0)-Number(b.creadoEn||0)).slice(1).forEach(p=>{p.eliminada=true;p.eliminadaPor=nombreUsuario();p.actualizadoEn=ahora;});
      guardarTareoEnMemoria(t);n++;
    });
    redibujar();
    alert(n?'Se quitaron los repetidos en '+n+' tareo'+(n===1?'':'s')+'.':'No hay repetidos que quitar.');
  }
  function abrirQuitarPorDia(clave){
    if(!puede())return alert('No tienes permiso para modificar el personal de Mantenimiento.');
    const g=porDiaAgrupado().find(x=>x.clave===clave);if(!g)return;
    E.pd={clave,tipo:'desde',desde:hoy(),hasta:hoy()};
    dibujarQuitarPorDia();
  }
  function dibujarQuitarPorDia(){
    const r=raiz(),q=E.pd;if(!r||!q)return;
    const g=porDiaAgrupado().find(x=>x.clave===q.clave);if(!g)return cerrar();
    const op=(v,titulo,ayuda,extra)=>'<label class="tar2-qm-op"><input type="radio" name="tpa-pd" value="'+v+'"'+(q.tipo===v?' checked':'')+' onchange="TareoArea.pdTipo(this.value)"><span><strong>'+titulo+'</strong>'+(extra||'')+'<small class="small-muted">'+ayuda+'</small></span></label>';
    r.innerHTML=marco('Quitar a '+esc(g.nombre)+' (personal por día)',
      '<p class="small-muted" style="margin:0 0 10px;">'+esc(g.cargo||'Personal por día')+(g.dni?' · DNI '+esc(g.dni):'')+' · en '+g.tareos+' tareo'+(g.tareos===1?'':'s')+' ('+esc(fLinda(g.desde))+' a '+esc(fLinda(g.hasta))+')</p>'+
      '<div class="tar2-qm-ops">'+
        op('desde','Desde una fecha en adelante','Sale de los tareos de Mantenimiento ya creados desde esa fecha.',' <input type="date" id="tpa-pd-desde" value="'+esc(q.desde)+'" oninput="TareoArea.pdFecha(\'desde\',this.value)">')+
        op('rango','Solo un rango de fechas','Sale únicamente entre las dos fechas.',' <input type="date" id="tpa-pd-d2" value="'+esc(q.desde)+'" oninput="TareoArea.pdFecha(\'desde\',this.value)"> <input type="date" id="tpa-pd-h2" value="'+esc(q.hasta)+'" oninput="TareoArea.pdFecha(\'hasta\',this.value)">')+
        op('todos','De todos los tareos','Se registró por error: sale de todos.')+
      '</div><div id="tpa-resumen" class="tar2-qm-resumen" role="status"></div>',
      '<button class="btn btn-ghost" onclick="TareoArea.cerrar()">Cancelar</button><button class="btn btn-danger" onclick="TareoArea.pdConfirmar()">Quitar</button>');
    resumenQuitarPorDia();
  }
  function alcDe(q){return {tipo:q.tipo,desde:q.desde,hasta:q.hasta};}
  function resumenQuitarPorDia(){
    const q=E.pd,c=document.getElementById('tpa-resumen');if(!q||!c)return;
    const a=document.getElementById('tpa-pd-desde'),b=document.getElementById('tpa-pd-d2'),h=document.getElementById('tpa-pd-h2');
    if(a)a.disabled=q.tipo!=='desde';if(b)b.disabled=q.tipo!=='rango';if(h)h.disabled=q.tipo!=='rango';
    if(q.tipo!=='todos'&&!FECHA_OK(q.desde)){c.textContent='Elige una fecha válida.';return;}
    if(q.tipo==='rango'&&(!FECHA_OK(q.hasta)||q.desde>q.hasta)){c.textContent='Elige un rango válido: «Desde» no puede ser posterior a «Hasta».';return;}
    const r=alcancePorDia(q.clave,alcDe(q)),n=r.lista.length;
    c.textContent='Se quitará de '+n+' tareo'+(n===1?'':'s')+' ya creado'+(n===1?'':'s')+'.'+(r.bloqueados?' '+r.bloqueados+' cerrado'+(r.bloqueados===1?'':'s')+' o sin permiso no se tocan.':'');
  }
  function pdConfirmar(){
    const q=E.pd;if(!q)return;
    const g=porDiaAgrupado().find(x=>x.clave===q.clave);
    try{
      const r=ejecutarQuitarPorDia(q.clave,alcDe(q));
      cerrar();redibujar();
      alert((g?g.nombre:'La persona')+' se quitó del personal por día de '+r.quitados+' tareo'+(r.quitados===1?'':'s')+'.'+(r.bloqueados?'\n'+r.bloqueados+' cerrado'+(r.bloqueados===1?'':'s')+' o sin permiso no se tocaron.':''));
    }catch(e){alert(e&&e.message?e.message:'No se pudo quitar.');}
  }
  function porDiaHTML(area){
    if(area!==AREA)return '';
    const l=porDiaAgrupado();if(!l.length)return '';
    const mod=puede();
    return '<div class="panel" id="tareo-por-dia-area"><div class="panel-head"><div><h3>Personal por día ('+l.length+')</h3><div class="small-muted">Personas que no están en planilla y figuran en los tareos de Mantenimiento.</div></div></div><div class="panel-body"><ul class="tar2-quitados">'+
      l.map(g=>'<li><span><strong>'+esc(g.nombre)+'</strong>'+(g.dni?' · DNI '+esc(g.dni):'')+(g.cargo?' · '+esc(g.cargo):'')+' · <em>'+g.tareos+' tareo'+(g.tareos===1?'':'s')+', '+esc(fLinda(g.desde))+(g.hasta!==g.desde?' a '+esc(fLinda(g.hasta)):'')+'</em>'+(g.repetidos?' <small style="color:#b26a00">repetido en '+g.repetidos+' lugar'+(g.repetidos===1?'':'es')+'</small>':'')+'</span>'+
        (mod?'<span>'+(g.repetidos?'<button type="button" class="btn btn-ghost btn-sm" data-k="'+esc(g.clave)+'" onclick="TareoArea.quitarRepetidos(this.dataset.k)">Quitar repetidos</button> ':'')+'<button type="button" class="tar2-quitar" data-k="'+esc(g.clave)+'" onclick="TareoArea.quitarPorDia(this.dataset.k)">✕ Quitar</button></span>':'')+'</li>').join('')+'</ul></div></div>';
  }

  /* --- registrar en Trabajadores a quien se agregó solo a tareos («personal nuevo») --- */
  const trabajadoresLista=()=>(typeof loadWorkers==='function'?loadWorkers():[])||[];
  const mismoTrabajador=(w,p)=>{
    const dni=typeof tareoNormalizarDNI==='function'?tareoNormalizarDNI(p.dni):String(p.dni||'').replace(/\D/g,'');
    return !!w&&((dni&&(typeof tareoNormalizarDNI==='function'?tareoNormalizarDNI(w.dni):w.dni)===dni)||tareoNormalizarTexto(String(w.nombre||'').replace(/\s+/g,' ').trim())===tareoNormalizarTexto(String(p.nombre||'').replace(/\s+/g,' ').trim()));
  };
  /* Crea al trabajador en Trabajadores (activo, del área) si aún no existe (por DNI o nombre). Devuelve {ok, worker, existente, motivo}. */
  function crearTrabajador(p,area){
    try{
      if(typeof puedeGestionarPersonal!=='function'||!puedeGestionarPersonal())return {ok:false,motivo:'No tienes permiso para registrar trabajadores.'};
      const ws=trabajadoresLista();
      const ya=ws.find(w=>mismoTrabajador(w,p));
      if(ya)return {ok:true,existente:true,worker:ya};
      const dni=typeof tareoNormalizarDNI==='function'?tareoNormalizarDNI(p.dni):String(p.dni||'').replace(/\D/g,'');
      const w={id:'w_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),nombre:String(p.nombre||'').replace(/\s+/g,' ').trim().toLocaleUpperCase('es'),
        tipoDocumento:p.tipoDocumento||'DNI',dni,area:area||AREA,cargo:p.cargo||'',linea:p.linea||'',puestoMaquina:'',estado:'Activo',
        registradoDesde:'TAREO',registradoPor:nombreUsuario(),registradoEn:Date.now()};
      saveWorkers([...ws,w]);
      if(!trabajadoresLista().some(x=>x&&x.id===w.id))return {ok:false,motivo:'Todavía se están cargando los trabajadores: no se registró. Espera unos segundos y vuelve a intentarlo.'};
      return {ok:true,worker:w};
    }catch(e){return {ok:false,motivo:(e&&e.message)||'No se pudo registrar.'};}
  }
  /* Personas agregadas a tareos como «personal nuevo» que todavía no están en Trabajadores (no salen en la rotación). */
  function sinRegistrar(){
    const mapa=new Map(),ws=trabajadoresLista();
    tareosArea().forEach(t=>(t.personal||[]).forEach(p=>{
      if(!p||!(p.nuevoIngreso||String(p.trabajadorId||'').startsWith('nuevo_')))return;
      if(ws.some(w=>mismoTrabajador(w,p)))return;
      const k=claveDia(p),g=mapa.get(k)||{clave:k,nombre:p.nombre||'',dni:p.dni||'',cargo:p.cargo||'',linea:p.linea||'',tareos:0};
      g.tareos++;mapa.set(k,g);
    }));
    return [...mapa.values()].sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),'es',{sensitivity:'base'}));
  }
  function registrarTrabajadorClave(k){
    const g=sinRegistrar().find(x=>x.clave===k);if(!g)return;
    const r=crearTrabajador(g,AREA);
    if(!r.ok)return alert(r.motivo);
    redibujar();
    alert(g.nombre+' quedó registrado en Trabajadores (Mantenimiento, activo). Ya puede salir en la rotación semanal de Mantenimiento.');
  }
  function sinRegistrarHTML(area){
    if(area!==AREA||typeof puedeGestionarPersonal!=='function'||!puedeGestionarPersonal())return '';
    const l=sinRegistrar();if(!l.length)return '';
    return '<div class="panel" id="tareo-sin-registrar"><div class="panel-head"><div><h3>Agregados a tareos y sin registrar en Trabajadores ('+l.length+')</h3><div class="small-muted">No salen en la rotación semanal ni en la tabla de personal hasta que se registren.</div></div></div><div class="panel-body"><ul class="tar2-quitados">'+
      l.map(g=>'<li><span><strong>'+esc(g.nombre)+'</strong>'+(g.dni?' · DNI '+esc(g.dni):' · sin DNI')+(g.cargo?' · '+esc(g.cargo):'')+' · <em>en '+g.tareos+' tareo'+(g.tareos===1?'':'s')+'</em></span>'+
        '<button type="button" class="btn btn-primary btn-sm" data-k="'+esc(g.clave)+'" onclick="TareoArea.registrarTrabajador(this.dataset.k)">Registrar en Trabajadores</button></li>').join('')+'</ul></div></div>';
  }

  /* ---------- piezas para la pantalla del Inicio ---------- */
  function botonesHTML(area){
    if(area!==AREA||!puede())return '';
    return '<button type="button" class="btn btn-ghost btn-sm" onclick="TareoArea.abrirPorDia()">+ Personal por día (rango)</button>';
  }
  function celdaHTML(p,area){
    if(area!==AREA||!puede())return '';
    return '<button type="button" class="tar2-quitar" title="Quitar del personal de Mantenimiento" data-k="'+esc(clavePersona(p))+'" onclick="TareoArea.quitar(this.dataset.k)">✕ Quitar</button>';
  }
  function quitadosHTML(area){
    if(area!==AREA)return '';
    const l=bajasVigentes();if(!l.length)return '';
    return '<div class="panel" id="tareo-quitados-area"><div class="panel-head"><div><h3>Personal quitado ('+l.length+')</h3><div class="small-muted">Ya no aparecen en la tabla ni vuelven en los tareos nuevos. Puedes restaurarlos.</div></div></div><div class="panel-body"><ul class="tar2-quitados">'+
      l.map(e=>'<li><span><strong>'+esc(e.nombre)+'</strong> · '+esc(e.cargo||'')+' · <em>'+(e.desde==='0000-01-01'?'quitada de todos los tareos':'desde '+esc(fLinda(e.desde)))+'</em> <small class="small-muted">quitado por '+esc(e.por||'—')+'</small></span>'+
        (puede()?'<button type="button" class="btn btn-ghost btn-sm" data-k="'+esc(e.clave)+'" onclick="TareoArea.restaurar(this.dataset.k)">Restaurar</button>':'')+'</li>').join('')+'</ul></div></div>';
  }

  window.TareoArea={
    visibles,botonesHTML,celdaHTML,quitadosHTML,porDiaHTML,sinRegistrarHTML,sinRegistrar,crearTrabajador,registrarTrabajador:registrarTrabajadorClave,porDiaAgrupado,alcancePorDia,ejecutarQuitarPorDia,quitarRepetidos:quitarRepetidosDia,quitarPorDia:abrirQuitarPorDia,puede,bajasVigentes,alcanceBaja,ejecutarQuitar,restaurar,alcanceRango,diasDelRango,
    quitar:abrirQuitar,abrirPorDia,cerrar,
    qAlcance(v){if(!E.q)return;E.q.alcance=v==='todos'?'todos':'desde';resumenQuitar();},
    qFecha(v){if(!E.q)return;E.q.desde=v;resumenQuitar();},
    qConfirmar,
    dCambia(){leerForm();resumenPorDia();},
    dConfirmar,
    pdTipo(v){if(!E.pd)return;E.pd.tipo=['desde','rango','todos'].includes(v)?v:'desde';resumenQuitarPorDia();},
    pdFecha(k,v){if(!E.pd)return;E.pd[k]=v;resumenQuitarPorDia();},
    pdConfirmar
  };
})();
