/* =============================================================
   GLACIAL · PANEL DE ADMINISTRACIÓN · ETAPA 3 — Trabajadores · Cuentas compartidas · Turnos y horarios · Tareo y cierres · Corrección de registros · Papelera
   -------------------------------------------------------------
   Todo se apoya en lo que ya existe (mismos documentos, mismas funciones, mismas reglas; nada paralelo):
     · Trabajadores → sync/workers con saveWorkers; cambios en borrador, motivo ≥ 10 y auditoría del panel; control de conflicto entre equipos.
     · Cuentas compartidas → almaceneros (js/almacen/102: agregar, activar, reiniciar PIN) y sync/tecnicosMant (solo lectura: se administra en Mantenimiento).
     · Turnos y horarios → ampliacionesTurno y la configuración de bloques (solo lectura + acceso a su editor).
     · Tareo y cierres → estado de bloqueo de los tareos (41-tareo-bloqueo: cierre a los 2 días; solo RRHH y Administrador reabren, desde el tareo).
     · Corrección de registros → reabrir (reabrirReporteProduccion) y eliminar con constancia (deleteRecord): las funciones de siempre, con su motivo y su constancia.
     · Papelera → reportes eliminados: se leen de la constancia (auditoriaRegistros, copia del reporte) y se restauran con saveRecords. La constancia es inmutable: no hay «borrar para siempre».
   Cargar después de 114-admin-etapa2.js.
   ============================================================= */
(function(){
  'use strict';
  if(typeof window==='undefined'||!window.document)return;
  const W=window,N=W.glacialAdminNucleo;
  const U=()=>W.glacialAdminUI,DA=()=>W.glacialAdminDatos;
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const S={tq:'',tarea:'Todas',testado:'Todos',borr:{},tab:'almacen',modal:null,guardando:false,msg:null,rf:'',rlinea:'Todas',restado:'Todos',pap:[],papListo:false,amp:[],ampListo:false,tec:null,escuchando:false,nuevoAlm:''};
  const repintar=()=>{try{U().pintar();}catch(_){/* informativo */}};
  const sinFoco=()=>{const a=document.activeElement;if(a&&a.blur)a.blur();repintar();};
  const msgHtml=()=>S.msg?`<div class="adm-msg ${S.msg.t}" role="status">${esc(S.msg.x)}</div>`:'';
  const modal=h=>`<div class="adm-mod" role="dialog" aria-modal="true"><div>${h}</div></div>`;
  const motivoHtml=()=>`<label style="display:grid;gap:4px;font-weight:700;margin-top:8px">Motivo (obligatorio, mínimo ${N.MOTIVO_MIN} caracteres)<textarea maxlength="300" oninput="adm3Motivo(this.value)" placeholder="Escribe por qué haces este cambio">${esc(S.modal&&S.modal.motivo||'')}</textarea></label>${S.modal&&S.modal.error?`<div class="adm-msg e" style="margin-top:8px">${esc(S.modal.error)}</div>`:''}`;
  const botones=(ok,fn)=>`<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button type="button" class="adm-b" onclick="adm3Cerrar()" ${S.guardando?'disabled':''}>Cancelar</button><button type="button" class="adm-b p" onclick="${fn}" ${S.guardando?'disabled':''}>${S.guardando?'Guardando…':esc(ok)}</button></div>`;
  W.adm3Motivo=v=>{if(S.modal)S.modal.motivo=v;};
  W.adm3Cerrar=()=>{if(S.guardando)return;S.modal=null;repintar();};
  const fecha=ms=>U().fmtFecha(ms);
  const trabajadores=()=>{try{return loadWorkers()||[];}catch(_){return [];}};
  const abrir=(fn,txt)=>typeof W[fn]==='function'?`<button type="button" class="adm-b p" onclick="${fn}()">${esc(txt)}</button>`:'';

  function arrancar(){
    if(S.escuchando||typeof db==='undefined')return;S.escuchando=true;
    const sub=(ref,f)=>{try{ref.onSnapshot(f,()=>{});}catch(_){/* sin lectura */}};
    sub(db.collection('sync').doc('workers'),()=>repintar());
    sub(db.collection('sync').doc('tecnicosMant'),s=>{S.tec=s.exists?s.data():null;repintar();});
    try{db.collection('ampliacionesTurno').orderBy('creadoEnMs','desc').limit(60).onSnapshot(s=>{S.amp=s.docs.map(d=>Object.assign({id:d.id},d.data()));S.ampListo=true;repintar();},()=>{S.ampListo=true;});}catch(_){S.ampListo=true;}
    try{db.collection('auditoriaRegistros').orderBy('timestamp','desc').limit(200).onSnapshot(s=>{S.pap=s.docs.map(d=>Object.assign({id:d.id},d.data({serverTimestamps:'estimate'}))).filter(x=>x&&x.accion==='ELIMINAR'&&x.copia);S.papListo=true;repintar();},()=>{S.papListo=true;});}catch(_){S.papListo=true;}
    try{if(W.glacialAlmaceneros)W.glacialAlmaceneros.escuchar();W.glacialAlmaceneros&&W.glacialAlmaceneros.alCambiar(()=>repintar());}catch(_){/* sin lectura */}
  }
  async function ejecutarModal(fn,ok){
    const m=S.modal,e=N.validarMotivo(m.motivo);if(e.length){m.error=e.join(' ');repintar();return;}
    S.guardando=true;m.error='';sinFoco();
    try{await fn();S.msg={t:'k',x:ok};S.modal=null;}catch(err){m.error=(err&&err.message)||String(err);}
    S.guardando=false;repintar();
  }
  const auditar=(modulo,accion,antes,despues,motivo)=>DA().registrar([{modulo,accion,antes,despues,motivo}]);

  /* =========================================================
     TRABAJADORES
     ========================================================= */
  const firmaW=w=>JSON.stringify({estado:w.estado||'Activo',area:w.area||'',cargo:w.cargo||'',linea:w.linea||'',nombre:w.nombre||''});
  function trabajadoresHtml(){
    arrancar();
    const lista=trabajadores(),q=S.tq.trim().toLowerCase();
    const vis=lista.filter(w=>(S.tarea==='Todas'||String(w.area||'')===S.tarea)&&(S.testado==='Todos'||(w.estado||'Activo')===S.testado)&&(!q||(window.glacialBusqueda?window.glacialBusqueda.coincide([w.nombre,w.dni,w.cargo],q):[w.nombre,w.dni,w.cargo].join(' ').toLowerCase().includes(q))));
    const areas=['Todas',...new Set(lista.map(w=>w.area).filter(Boolean))];
    const act=lista.filter(w=>(w.estado||'Activo')!=='Inactivo').length;
    const cambios=Object.keys(S.borr).length;
    return `${msgHtml()}<div class="adm-card"><div class="adm-f"><label>Buscar<input type="search" placeholder="Nombre, DNI o cargo" value="${esc(S.tq)}" oninput="adm3Tq(this.value)"></label>
        <label>Área<select onchange="adm3Tf('tarea',this.value)">${areas.map(a=>`<option ${a===S.tarea?'selected':''}>${esc(a)}</option>`).join('')}</select></label>
        <label>Estado<select onchange="adm3Tf('testado',this.value)">${['Todos','Activo','Inactivo'].map(a=>`<option ${a===S.testado?'selected':''}>${a}</option>`).join('')}</select></label>
        <span style="display:flex;gap:6px;flex-wrap:wrap">${abrir('openWorkersModal','+ Agregar / importar trabajadores')} ${abrir('goRotacionSupervisores','Rotaciones')}</span></div>
      <p class="adm-mut">${lista.length} trabajadores · ${act} activos. Aquí cambias el estado, el área, el cargo y la línea en borrador; agregar, importar la rotación (Excel) y las rotaciones se hacen con las pantallas de siempre.</p>
      <div class="adm-caja"><table class="adm-t"><thead><tr><th>Trabajador</th><th>DNI</th><th>Área</th><th>Cargo</th><th>Línea</th><th>Estado</th></tr></thead><tbody>${vis.slice(0,300).map(w=>{
        const b=S.borr[w.id]?S.borr[w.id].b:w,cambiado=!!S.borr[w.id];
        return `<tr><td><b>${esc(w.nombre)}</b>${cambiado?' <span class="adm-pill" style="background:#ffedd5;color:#b45309">sin guardar</span>':''}</td><td>${esc(w.dni||'—')}</td>
          <td><select aria-label="Área de ${esc(w.nombre)}" onchange="adm3Tw('${esc(w.id)}','area',this.value)">${['Producción','Mantenimiento',''].map(a=>`<option value="${a}" ${a===(b.area||'')?'selected':''}>${a||'—'}</option>`).join('')}</select></td>
          <td><input aria-label="Cargo de ${esc(w.nombre)}" value="${esc(b.cargo||'')}" style="width:150px" oninput="adm3Tw('${esc(w.id)}','cargo',this.value,true)"></td>
          <td><input aria-label="Línea de ${esc(w.nombre)}" value="${esc(b.linea||'')}" style="width:80px" oninput="adm3Tw('${esc(w.id)}','linea',this.value,true)"></td>
          <td><button type="button" class="adm-b" style="min-height:36px" onclick="adm3Tw('${esc(w.id)}','estado','${(b.estado||'Activo')==='Inactivo'?'Activo':'Inactivo'}')">${esc(b.estado||'Activo')}</button></td></tr>`;}).join('')}</tbody></table></div>
      ${vis.length?'':'<div class="adm-vacio">Ningún trabajador coincide.</div>'}${vis.length>300?`<p class="adm-mut">Se muestran 300 de ${vis.length}: acota la búsqueda.</p>`:''}</div>
      ${cambios?`<div class="adm-barra"><span>${cambios} ${cambios===1?'trabajador con cambios':'trabajadores con cambios'} sin guardar</span><span><button type="button" class="adm-b" style="background:transparent;color:#fff" onclick="adm3TDescartar()">Descartar</button> <button type="button" class="adm-b p" style="background:#fff;color:#033350" onclick="adm3TPedir()">Guardar</button></span></div>`:''}
      ${S.modal&&S.modal.tipo==='trab'?modal(`<h2 style="margin:0 0 6px">Guardar cambios de trabajadores</h2><ul>${S.modal.items.map(i=>`<li><b>${esc(i.nombre)}</b>: ${i.d.map(x=>esc(x)).join('; ')}</li>`).join('')}</ul><p class="adm-mut">Se guarda todo junto: si algo falla, no se cambia nada.</p>${motivoHtml()}${botones('Guardar cambios','adm3TGuardar()')}`):''}`;
  }
  W.adm3Tq=v=>{S.tq=v;repintar();};W.adm3Tf=(k,v)=>{S[k]=v;repintar();};
  W.adm3Tw=(id,campo,valor,sinRepintar)=>{
    const w=trabajadores().find(x=>x.id===id);if(!w)return;
    if(!S.borr[id])S.borr[id]={base:firmaW(w),b:Object.assign({},w)};
    S.borr[id].b[campo]=valor;
    if(firmaW(S.borr[id].b)===S.borr[id].base)delete S.borr[id];
    if(!sinRepintar)repintar();
  };
  W.adm3TDescartar=()=>{S.borr={};repintar();};
  const etiquetas={estado:'estado',area:'área',cargo:'cargo',linea:'línea'};
  W.adm3TPedir=()=>{
    const lista=trabajadores();
    const items=Object.keys(S.borr).map(id=>{const w=lista.find(x=>x.id===id);if(!w)return null;const b=S.borr[id].b,d=Object.keys(etiquetas).filter(k=>String(w[k]||(k==='estado'?'Activo':''))!==String(b[k]||(k==='estado'?'Activo':''))).map(k=>etiquetas[k]+': '+(w[k]||(k==='estado'?'Activo':'—'))+' → '+(b[k]||'—'));return d.length?{id,nombre:w.nombre,d}:null;}).filter(Boolean);
    if(!items.length){S.borr={};repintar();return;}
    S.modal={tipo:'trab',items,motivo:'',error:''};repintar();
  };
  W.adm3TGuardar=()=>ejecutarModal(async()=>{
    const m=S.modal,actual=trabajadores().map(w=>Object.assign({},w)),entradas=[];
    const nueva=actual.map(w=>{
      const b=S.borr[w.id];if(!b||!m.items.some(i=>i.id===w.id))return w;
      if(firmaW(w)!==b.base)throw new Error('Esto cambió en otro equipo: «'+w.nombre+'» fue modificado mientras lo editabas. Se volvió a cargar.');
      const n=Object.assign({},w,{estado:b.b.estado||'Activo',area:b.b.area||w.area,cargo:b.b.cargo||'',linea:b.b.linea||''});
      return n;
    });
    if(typeof saveWorkers!=='function')throw new Error('No se pudo guardar: falta la función de trabajadores.');
    saveWorkers(nueva);
    m.items.forEach(i=>entradas.push({modulo:'Trabajadores',accion:'Editó a '+i.nombre,antes:null,despues:i.d.join('; '),motivo:m.motivo}));
    await DA().registrar(entradas);
    S.borr={};
  },'Trabajadores actualizados. Quedó en la auditoría.');

  /* =========================================================
     CUENTAS COMPARTIDAS
     ========================================================= */
  function pinesHtml(){
    arrancar();
    const T=[['almacen','Almacén'],['mantenimiento','Mantenimiento']];
    return `${msgHtml()}<div role="tablist" class="adm-f" style="gap:6px">${T.map(([k,t])=>`<button type="button" role="tab" class="adm-b ${S.tab===k?'p':''}" aria-selected="${S.tab===k}" onclick="adm3Tab('${k}')">${t}</button>`).join('')}</div>${S.tab==='almacen'?pinAlmacen():pinMant()}${S.modal&&S.modal.tipo==='alm'?modal(`<h2 style="margin:0 0 6px">${esc(S.modal.titulo)}</h2>${motivoHtml()}${botones('Confirmar','adm3AlmOk()')}`):''}`;
  }
  W.adm3Tab=t=>{S.tab=t;S.msg=null;repintar();};
  function pinAlmacen(){
    const G=W.glacialAlmaceneros&&W.glacialAlmaceneros.panel;if(!G)return '<div class="adm-card"><div class="adm-vacio">La cuenta compartida de Almacén no está disponible.</div></div>';
    const l=G.lista().sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),'es'));
    return `<div class="adm-card"><p class="adm-mut">Cada almacenero entra a la cuenta compartida con su nombre y su PIN personal; así cada recepción queda a su nombre. (El PIN es de trazabilidad; las reglas del servidor limitan lo que la cuenta puede leer y escribir.)</p>
      <div class="adm-caja"><table class="adm-t"><thead><tr><th>Persona</th><th>PIN</th><th>Estado</th><th></th></tr></thead><tbody>${l.map(a=>`<tr><td><b>${esc(a.nombre)}</b></td><td>${G.tienePin(a)?'Creado':'Sin crear'}</td><td>${a.activo===false?'<span class="adm-pill">Desactivado</span>':'<span class="adm-pill" style="background:#dff5e7;color:#157a3b">Activo</span>'}</td>
        <td style="white-space:nowrap"><button type="button" class="adm-b" style="min-height:36px" onclick="adm3Alm('activar','${esc(a.id)}')">${a.activo===false?'Activar':'Desactivar'}</button> <button type="button" class="adm-b" style="min-height:36px" onclick="adm3Alm('pin','${esc(a.id)}')" ${G.tienePin(a)?'':'disabled'}>Nuevo PIN</button></td></tr>`).join('')}</tbody></table></div>
      ${l.length?'':'<div class="adm-vacio">Todavía no hay almaceneros.</div>'}
      <div class="adm-f" style="margin-top:10px"><label>Agregar persona a esta cuenta<input id="adm3-nuevo-alm" placeholder="Nombre y apellido" value="${esc(S.nuevoAlm)}" oninput="adm3NuevoAlm(this.value)"></label><button type="button" class="adm-b p" onclick="adm3Alm('agregar','')">Agregar</button></div>
      <p class="adm-mut">Tiempos de identificación (bloqueo tras 5 intentos fallidos por 10 min; sesión por inactividad de 30 min, máximo 12 h) son los del sistema.</p></div>`;
  }
  W.adm3NuevoAlm=v=>{S.nuevoAlm=v;};
  W.adm3Alm=(que,id)=>{
    const G=W.glacialAlmaceneros.panel,a=G.lista().find(x=>x.id===id);
    if(que==='agregar'&&String(S.nuevoAlm).trim().length<2){S.msg={t:'e',x:'Escribe el nombre de la persona (mínimo 2 letras).'};repintar();return;}
    S.modal={tipo:'alm',que,id,nombre:a?a.nombre:S.nuevoAlm.trim(),titulo:que==='agregar'?'Agregar a '+S.nuevoAlm.trim():que==='pin'?'Nuevo PIN para '+(a&&a.nombre):(a&&a.activo===false?'Activar a ':'Desactivar a ')+(a&&a.nombre),activo:a?a.activo!==false:true,motivo:'',error:''};repintar();
  };
  W.adm3AlmOk=()=>ejecutarModal(async()=>{
    const m=S.modal,G=W.glacialAlmaceneros.panel;
    if(m.que==='agregar'){await G.agregar(m.nombre);S.nuevoAlm='';}
    else if(m.que==='pin')await G.reiniciarPin(m.id);
    else await G.activar(m.id,!m.activo);
    await auditar('Cuentas compartidas',(m.que==='agregar'?'Agregó a ':m.que==='pin'?'Reinició el PIN de ':m.activo?'Desactivó a ':'Activó a ')+m.nombre+' (Almacén)',null,null,m.motivo);
  },'Listo. Quedó en la auditoría.');
  function pinMant(){
    const d=S.tec,lista=d&&Array.isArray(d.items)?d.items:(d&&Array.isArray(d.tecnicos)?d.tecnicos:(d&&d.map?Object.values(d.map):[]));
    return `<div class="adm-card"><p class="adm-mut">La cuenta compartida de Mantenimiento se administra en Mantenimiento (identificación local, de trazabilidad). Aquí solo se consulta.</p>
      ${lista.length?`<div class="adm-caja"><table class="adm-t"><thead><tr><th>Persona</th><th>PIN</th><th>Estado</th></tr></thead><tbody>${lista.map(t=>`<tr><td><b>${esc(t.nombre||t.name||'—')}</b></td><td>${t.hash||t.pinHash?'Creado':'Sin crear'}</td><td>${t.activo===false?'Desactivado':'Activo'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="adm-vacio">Sin datos (o sin lectura).</div>'}
      <div style="margin-top:10px">${abrir('goMantenimiento','Abrir Mantenimiento')}</div></div>`;
  }

  /* =========================================================
     TURNOS Y HORARIOS
     ========================================================= */
  function turnosHtml(){
    arrancar();
    return `<div class="adm-msg i">Los horarios de producción y las rotaciones se editan donde siempre; las <b>ampliaciones de turno</b> las da el Administrador desde la rotación de supervisores. Aquí ves el estado vivo.</div>
      <div class="adm-card"><div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px">${abrir('goHorarioProduccion','Horario de producción')} ${abrir('goRotacionSupervisores','Rotación de supervisores y ampliaciones')}</div>
      <h2>Ampliaciones de turno recientes</h2>
      ${S.amp.length?`<div class="adm-caja"><table class="adm-t"><thead><tr><th>Cuándo se dio</th><th>Fecha operativa</th><th>Turno</th><th>Minutos</th><th>Estado</th><th>Motivo</th></tr></thead><tbody>${S.amp.slice(0,40).map(a=>`<tr><td>${esc(fecha(a.creadoEnMs))}</td><td>${esc(a.fechaOperativa||'—')}</td><td>${esc(a.turno||'—')}</td><td>${esc(a.minutos||'—')}</td><td>${esc(a.estado==='ANULADA'?'Anulada':'Vigente')}</td><td>${esc(a.motivo||'')}</td></tr>`).join('')}</tbody></table></div>`:`<div class="adm-vacio">${S.ampListo?'No hay ampliaciones registradas.':'Consultando…'}</div>`}</div>`;
  }

  /* =========================================================
     TAREO Y CIERRES
     ========================================================= */
  function tareoHtml(){
    let ts=[];try{ts=typeof obtenerTareos==='function'?(obtenerTareos()||[]):[];}catch(_){ts=[];}
    const info=t=>{try{return W.tareoBloqueoInfo?W.tareoBloqueoInfo(t):{bloqueado:false};}catch(_){return {bloqueado:false};}};
    const bl=ts.filter(t=>info(t).bloqueado),ab=ts.length-bl.length;
    const cfg=(()=>{try{return W.tareoBloqueoConfig?W.tareoBloqueoConfig():null;}catch(_){return null;}})();
    return `<div class="adm-msg i">El tareo se cierra solo (regla de bloqueo). <b>Solo RRHH y el Administrador reabren</b> un tareo cerrado, desde el propio tareo y con motivo: queda en la auditoría de Tareo, que aparece en la Auditoría del panel.</div>
      <div class="adm-kpis"><div class="adm-kpi"><span>Tareos cargados</span><b>${ts.length}</b><small>en esta sesión</small></div><div class="adm-kpi"><span>Abiertos</span><b>${ab}</b><small>se pueden editar</small></div><div class="adm-kpi"><span>Cerrados</span><b>${bl.length}</b><small>bloqueados por la regla</small></div></div>
      <div class="adm-card"><h2>Regla de cierre</h2>${cfg?`<div class="adm-caja"><table class="adm-t"><tbody>${Object.keys(cfg).filter(k=>['string','number','boolean'].includes(typeof cfg[k])).map(k=>`<tr><td>${esc(k)}</td><td><b>${esc(String(cfg[k]))}</b></td></tr>`).join('')}</tbody></table></div>`:'<div class="adm-vacio">Sin datos.</div>'}
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">${abrir('goTareo','Abrir Tareo de Producción')} ${abrir('goRRHH','Abrir RRHH')}</div></div>`;
  }

  /* =========================================================
     CORRECCIÓN DE REGISTROS
     ========================================================= */
  function registrosHtml(){
    arrancar();
    let rs=[];try{rs=loadRecords()||[];}catch(_){rs=[];}
    const lineas=['Todas',...new Set(rs.map(r=>r.linea).filter(Boolean))];
    const est=r=>String(r.estadoRegistro||'FINALIZADO');
    const vis=rs.filter(r=>(S.rlinea==='Todas'||r.linea===S.rlinea)&&(S.restado==='Todos'||est(r)===S.restado)&&(!S.rf||String(r.fecha||'')>=S.rf)).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))||String(a.linea).localeCompare(String(b.linea)));
    const puedeReabrir=typeof usuarioPuedeReabrirReporte==='function'&&usuarioPuedeReabrirReporte();
    return `<div class="adm-msg i">Corregir, reabrir o eliminar usa las funciones de siempre: piden su motivo y dejan su constancia (eliminar guarda una copia que se recupera desde la <b>Papelera</b>).</div>
      <div class="adm-card"><div class="adm-f"><label>Desde<input type="date" value="${esc(S.rf)}" onchange="adm3Rf('rf',this.value)"></label><label>Línea<select onchange="adm3Rf('rlinea',this.value)">${lineas.map(l=>`<option ${l===S.rlinea?'selected':''}>${esc(l)}</option>`).join('')}</select></label>
        <label>Estado<select onchange="adm3Rf('restado',this.value)">${['Todos','EN_REGISTRO','FINALIZADO','REABIERTO'].map(l=>`<option ${l===S.restado?'selected':''}>${l}</option>`).join('')}</select></label></div>
        <div class="adm-caja"><table class="adm-t"><thead><tr><th>Fecha</th><th>Línea</th><th>Turno</th><th>Estado</th><th>Actualizado por</th><th></th></tr></thead><tbody>${vis.slice(0,150).map(r=>`<tr><td>${esc(r.fecha||'—')}</td><td><b>${esc(r.linea||'—')}</b></td><td>${esc(r.turno||'—')}</td><td>${esc(est(r).replace('_',' '))}</td><td>${esc(r.actualizadoPor||r.reabiertoPor||'—')}</td>
          <td style="white-space:nowrap">${est(r)==='FINALIZADO'&&puedeReabrir?`<button type="button" class="adm-b" style="min-height:36px" onclick="adm3Reg('reabrir','${esc(r.id)}')">Reabrir</button> `:''}<button type="button" class="adm-b" style="min-height:36px" onclick="adm3Reg('eliminar','${esc(r.id)}')">Eliminar</button></td></tr>`).join('')}</tbody></table></div>
        ${vis.length?'':'<div class="adm-vacio">Ningún reporte coincide.</div>'}${vis.length>150?`<p class="adm-mut">Se muestran 150 de ${vis.length}: acota con «Desde» o la línea.</p>`:''}</div>`;
  }
  W.adm3Rf=(k,v)=>{S[k]=v;repintar();};
  W.adm3Reg=async(que,id)=>{
    try{
      if(que==='reabrir'&&typeof reabrirReporteProduccion==='function')await reabrirReporteProduccion(id);
      else if(que==='eliminar'&&typeof deleteRecord==='function')await deleteRecord(id);
      else{S.msg={t:'e',x:'Esa función no está disponible en esta sesión.'};}
    }catch(e){S.msg={t:'e',x:(e&&e.message)||String(e)};}
    repintar();
  };

  /* =========================================================
     PAPELERA
     ========================================================= */
  function papeleraHtml(){
    arrancar();
    let rs=[];try{rs=loadRecords()||[];}catch(_){rs=[];}
    const ids=new Set(rs.map(r=>r.id));
    const lista=S.pap.filter(x=>x.registroId&&!ids.has(x.registroId));
    return `${msgHtml()}<div class="adm-msg i">Aquí están los <b>reportes de producción eliminados</b> que se pueden recuperar (su copia quedó en la constancia). <b>No hay «borrar para siempre»</b>: la constancia es inmutable a propósito, para que siempre se sepa quién eliminó qué y por qué. Otros datos eliminados (usuarios, trabajadores) no pasan por papelera.</div>
      <div class="adm-card">${lista.length?`<div class="adm-caja"><table class="adm-t"><thead><tr><th>Eliminado</th><th>Reporte</th><th>Quién y por qué</th><th></th></tr></thead><tbody>${lista.map(x=>`<tr><td>${esc(fecha(N.msDe(x.timestamp)))}</td><td><b>${esc(x.linea||'')}</b> · ${esc(x.fecha||'')} · ${esc(x.turno||'')}</td><td>${esc(x.usuario||'—')}<br><span class="adm-mut">${esc(x.motivo||'')}</span></td><td><button type="button" class="adm-b p" style="min-height:36px" onclick="adm3Restaurar('${esc(x.id)}')">Restaurar</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="adm-vacio">${S.papListo?'La papelera está vacía.':'Consultando…'}</div>`}</div>
      ${S.modal&&S.modal.tipo==='rest'?modal(`<h2 style="margin:0 0 6px">Restaurar reporte</h2><p class="adm-mut">${esc(S.modal.x.linea)} · ${esc(S.modal.x.fecha)} · ${esc(S.modal.x.turno)}. Vuelve a la lista de reportes con su contenido de antes de eliminarse.</p>${motivoHtml()}${botones('Restaurar','adm3RestOk()')}`):''}`;
  }
  W.adm3Restaurar=id=>{const x=S.pap.find(p=>p.id===id);if(!x)return;S.modal={tipo:'rest',x,motivo:'',error:''};repintar();};
  W.adm3RestOk=()=>ejecutarModal(async()=>{
    const m=S.modal,x=m.x,copia=JSON.parse(JSON.stringify(x.copia));
    const actual=loadRecords().slice();
    if(actual.some(r=>r.id===copia.id))throw new Error('Ese reporte ya existe de nuevo.');
    copia.restauradoEn=Date.now();copia.restauradoPor=(state.user&&(state.user.nombre||state.user.username))||'';copia.actualizadoEn=copia.restauradoEn;
    copia.auditoria=(Array.isArray(copia.auditoria)?copia.auditoria:[]).concat([{accion:'RESTAURADO',fecha:copia.restauradoEn,usuario:copia.restauradoPor,motivo:m.motivo}]);
    actual.push(copia);
    if(typeof saveRecords!=='function'||(await saveRecords(actual))===false)throw new Error('No se pudo restaurar: el servidor no lo guardó. Inténtalo de nuevo.');
    await auditar('Papelera','Restauró el reporte de '+x.linea+' '+x.fecha+' '+x.turno,{eliminadoPor:x.usuario,motivoEliminacion:x.motivo},{estado:copia.estadoRegistro||'FINALIZADO'},m.motivo);
  },'Reporte restaurado.');

  U().registrar('trabajadores',{html:trabajadoresHtml});
  U().registrar('pines',{html:pinesHtml});
  U().registrar('turnos',{html:turnosHtml});
  U().registrar('tareo',{html:tareoHtml});
  U().registrar('registros',{html:registrosHtml});
  U().registrar('papelera',{html:papeleraHtml});
  { const irOriginal=W.admIr; W.admIr=function(id){S.modal=null;S.msg=null;return irOriginal.apply(this,arguments);}; }
})();
