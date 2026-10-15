/* =============================================================
   32-dashboard-perfiles.js
   GLACIAL — INICIO / MI TURNO

   Rediseño operativo del módulo Inicio.
   - Solo consulta fuentes existentes: sesión, rotación, tareo,
     programación y avancesTurno.
   - No crea ni duplica registros.
   - No modifica usuarios, permisos, producción ni reglas Firebase.
   - Insumos: estimación de lectura basada únicamente en factores
     ya existentes en 05-utils.js. Si falta factor, lo informa.
   ============================================================= */

let centroPerfilCharts={}; // Compatibilidad con versiones anteriores.
let cpConsulta={fecha:'',turno:''};
let cpAvancesCache=new Map();
let cpCargaAvancesToken=0;

function cpEsc(v){
  if(typeof escaparHtml==='function')return escaparHtml(v??'');
  return String(v??'').replace(/[&<>"']/g,m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}
function cpNum(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function cpNorm(v){
  if(typeof normalizarTexto==='function')return normalizarTexto(v||'');
  return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
}
function cpFechaISO(d=new Date()){
  if(typeof fechaLocalISO==='function')return fechaLocalISO(d);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function cpFechaBonita(fecha){
  if(!fecha)return '—';
  const d=new Date(`${fecha}T12:00:00`);
  return Number.isNaN(d.getTime())?cpEsc(fecha):d.toLocaleDateString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function cpRol(){
  const r=cpNorm([state.user?.rol,state.user?.puesto,state.user?.cargo].filter(Boolean).join(' '));
  if(r.includes('gerente'))return 'GERENCIA';
  if(r.includes('planific'))return 'PLANIFICACION';
  if(r.includes('venta'))return 'VENTAS';
  if(r.includes('jefe')||r.includes('jefatura'))return 'JEFATURA';
  if(r.includes('administr'))return 'ADMINISTRACION';
  if(r.includes('supervisor'))return 'SUPERVISOR';
  return 'OPERATIVO';
}
function cpEsVistaGeneral(){
  return ['GERENCIA','JEFATURA','PLANIFICACION','VENTAS','ADMINISTRACION'].includes(cpRol());
}
function cpTitulo(){return cpEsVistaGeneral()?'Turno del día':'Mi turno';}
function cpCargo(){return state.user?.puesto||state.user?.cargo||state.user?.rol||'';}
function cpContextoBase(){
  try{
    const c=typeof contextoTurnoUsuario==='function'?contextoTurnoUsuario(state.user,new Date()):null;
    if(c)return c;
  }catch(e){console.warn('Inicio: contexto de turno',e);}
  return {
    turno:state.user?.turnoOperativo||'',
    horarioInicio:state.user?.horarioOperativoInicio||'',
    horarioFin:state.user?.horarioOperativoFin||'',
    fechaOperativa:state.user?.fechaOperativa||cpFechaISO()
  };
}
function cpHorarioBaseTurno(turno){
  const t=String(turno||'').toUpperCase();
  if(t==='NOCHE')return {inicio:'19:00',fin:'07:00'};
  if(t==='INTERMEDIO')return {inicio:'14:00',fin:'22:00'};
  return {inicio:'07:00',fin:'19:00'};
}
function cpCtx(){
  const base=cpContextoBase();
  if(!cpEsVistaGeneral())return {
    // El calendario de Inicio permite consultar otra fecha SIN modificar
    // la asignación, el turno, los registros ni Firebase.
    fechaOperativa:cpConsulta.fecha||base.fechaOperativa||cpFechaISO(),
    turno:String(base.turno||state.user?.turnoOperativo||'').toUpperCase(),
    horarioInicio:base.horarioInicio||state.user?.horarioOperativoInicio||'',
    horarioFin:base.horarioFin||state.user?.horarioOperativoFin||'',
    origen:cpConsulta.fecha?'CONSULTA_FECHA':(base.origen||'')
  };

  if(!cpConsulta.fecha)cpConsulta.fecha=base.fechaOperativa||cpFechaISO();
  if(!cpConsulta.turno)cpConsulta.turno=String(base.turno||'DÍA').toUpperCase();
  const h=cpHorarioBaseTurno(cpConsulta.turno);
  return {
    fechaOperativa:cpConsulta.fecha,
    turno:cpConsulta.turno,
    horarioInicio:h.inicio,
    horarioFin:h.fin,
    origen:'CONSULTA'
  };
}
function cpTurnoCanon(v){
  const t=String(v||'').toUpperCase();
  if(t.includes('NOCHE')||t==='TN')return 'NOCHE';
  if(t.includes('INTERMEDIO'))return 'INTERMEDIO';
  return 'DÍA';
}
function cpTurnoAvance(v){return cpTurnoCanon(v)==='NOCHE'?'NOCHE':'DÍA';}
function cpLineasAutorizadas(){
  try{
    if(typeof visibleLines==='function')return new Set((visibleLines()||[]).map(x=>x.key));
  }catch(_){ }
  return null;
}
function cpUnidadLinea(linea){return linea==='C20L'?'CAJ':'UND';}
function cpNombreLinea(linea){
  if(linea==='C20L')return 'CAJAS 20L';
  return String(linea||'');
}
function cpPresentacionUI(p){
  let s='';
  try{
    if(typeof nombrePresentacionUI==='function')s=nombrePresentacionUI(p.linea,p.marca,p.presentacion)||'';
  }catch(_){ }
  if(!s)s=String(p.presentacion||'').replaceAll('_',' ');
  s=s.replace(/(\d+(?:\.\d+)?)\s*l\b/ig,'$1 L')
     .replace(/(\d+)\s*ml\b/ig,'$1 ml')
     .replace(/pack\s*(?:x|de)?\s*(\d+)\s*und/ig,'Pack x $1')
     .replace(/\s+/g,' ').trim();
  return s||'—';
}
function cpProgramadoUnidades(p){
  const cantidad=cpNum(p?.cantidadProgramada);
  if(cantidad<=0)return 0;
  // Misma compatibilidad usada por 21-programacion-turno.js.
  if(cpNum(p?.unidadesPorPaleta)>0)return cantidad;
  const upp=typeof obtenerUnidadesPorPalet==='function'
    ? cpNum(obtenerUnidadesPorPalet(p.linea,p.marca,p.presentacion)) : 0;
  return upp>0?cantidad*upp:cantidad;
}
function cpProgramaciones(){
  const ctx=cpCtx();
  const all=typeof loadProgramaciones==='function'?(loadProgramaciones()||[]):[];
  const autorizadas=cpLineasAutorizadas();
  const fecha=ctx.fechaOperativa;
  const turno=cpTurnoCanon(ctx.turno);

  return all.filter(p=>{
    if(!p||p.fecha!==fecha||cpProgramadoUnidades(p)<=0)return false;
    if(autorizadas&&!autorizadas.has(p.linea))return false;
    const tp=cpTurnoCanon(p.turno);
    if(turno==='NOCHE')return tp==='NOCHE';
    if(turno==='DÍA')return tp==='DÍA';
    if(turno==='INTERMEDIO'){
      const hayDia=all.some(x=>x&&x.fecha===fecha&&x.linea===p.linea&&cpTurnoCanon(x.turno)==='DÍA'&&cpProgramadoUnidades(x)>0);
      return tp===(hayDia?'DÍA':'INTERMEDIO');
    }
    return false;
  }).sort((a,b)=>String(a.linea||'').localeCompare(String(b.linea||''),'es') ||
    cpNum(a.orden)-cpNum(b.orden) || String(a.marca||'').localeCompare(String(b.marca||''),'es'));
}
function cpFmt(v,dec=0){
  const n=cpNum(v);
  return n.toLocaleString('es-PE',{minimumFractionDigits:dec,maximumFractionDigits:dec});
}
function cpIcon(nombre){
  const common='viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
  const paths={
    user:'<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    clipboard:'<path d="M9 5h6M9 3h6v4H9z"/><rect x="5" y="5" width="14" height="16" rx="2"/><path d="M8 11h8M8 15h8"/>',
    box:'<path d="M21 8l-9 5-9-5 9-5 9 5zM3 8v8l9 5 9-5V8M12 13v8"/>',
    team:'<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20a6 6 0 0 1 12 0M14 15a5 5 0 0 1 7 5"/>',
    report:'<path d="M5 20V10M12 20V4M19 20v-7"/>',
    arrow:'<path d="M5 12h14M14 7l5 5-5 5"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    bars:'<path d="M6 20V12M12 20V5M18 20v-9"/>',
    chart:'<path d="M4 20h16M7 16V9M12 16V5M17 16v-5"/>',
    pause:'<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    list:'<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>',
    pulse:'<path d="M3 12h4l2-6 4 12 2-6h6"/>'
  };
  return `<svg ${common} class="cp-icon">${paths[nombre]||paths.info}</svg>`;
}
function cpPuede(permiso){
  try{return typeof tienePermiso==='function'?!!tienePermiso(permiso):false;}catch(_){return false;}
}

/* =========================================================
   ACCESO AL INICIO OPERATIVO
   Supervisor y Jefe de Producción tienen acceso por función.
   Cualquier otro usuario necesita el permiso "inicioOperativo".
   Este permiso NO concede permisos sobre otros módulos.
   ========================================================= */
function cpPuedeVerInicioOperativo(){
  const rol=cpNorm(state.user?.rol||'');
  const puesto=cpNorm(state.user?.puesto||state.user?.cargo||'');
  const esSupervisor=rol==='supervisor'||puesto.includes('supervisor de produccion');
  const esJefeProduccion=rol==='jefe de produccion'||puesto==='jefe de produccion';
  return esSupervisor||esJefeProduccion||cpPuede('inicioOperativo')||
    cpPuede('ver_programacion_turno')||cpPuede('ver_insumos_turno');
}

/* Acceso por función a secciones del Inicio operativo. Supervisores y
   usuarios con "inicioOperativo" (legado) conservan todas las secciones;
   los demás necesitan el permiso específico de la sección. */
function cpAccesoSeccionOperativa(permiso){
  const rol=cpNorm(state.user?.rol||'');
  const puesto=cpNorm(state.user?.puesto||state.user?.cargo||'');
  const porFuncion=rol==='supervisor'||puesto.includes('supervisor de produccion')||
    rol==='jefe de produccion'||puesto==='jefe de produccion'||cpPuede('inicioOperativo');
  return porFuncion||cpPuede(permiso);
}

/* INICIO EJECUTIVO: se decide por permiso, no por el nombre del rol.
   Gerencia/Jefatura lo reciben por PERMISOS_SOLO_CONSULTA; Administración
   puede asignarlo a cualquier otro usuario desde Gestión de usuarios. */
function cpPuedeVerInicioEjecutivo(){
  return cpPuede('ver_inicio_ejecutivo');
}

function cpInicioGeneral(){
  const nombre=state.user?.nombre||state.user?.name||state.user?.username||'Usuario';
  const cargo=cpCargo()||'Usuario del sistema';
  const accesos=[];
  if(cpPuede('nuevo'))accesos.push({destino:'produccion',icono:'clipboard',titulo:'Registro de producción',texto:'Accede al registro autorizado de producción.'});
  if(cpPuede('tareoProduccion'))accesos.push({destino:'tareo',icono:'team',titulo:'Tareo',texto:'Registra y revisa la asistencia autorizada.'});
  if(cpPuede('avanceProduccion'))accesos.push({destino:'avance',icono:'report',titulo:'Avance y cierre',texto:'Accede al reporte autorizado del turno.'});
  return `<section class="cp-general"><div class="cp-general-welcome"><div class="cp-avatar-icon">${cpIcon('user')}</div><div><span class="cp-general-kicker">GLACIAL · Control operativo</span><h2>Hola, ${cpEsc(nombre)}</h2><p>${cpEsc(cargo)}</p><div class="cp-general-line"></div><h3>Bienvenido al sistema de producción</h3><p class="cp-general-help">Utiliza el menú lateral para acceder a los módulos disponibles según tus permisos.</p></div></div>${accesos.length?`<div class="cp-general-access"><h3>Accesos disponibles</h3><div class="cp-quick-grid">${accesos.map(a=>`<button type="button" onclick="cpIr('${a.destino}')"><span class="cp-quick-icon">${cpIcon(a.icono)}</span><span><b>${cpEsc(a.titulo)}</b><small>${cpEsc(a.texto)}</small></span>${cpIcon('arrow')}</button>`).join('')}</div></div>`:''}<div class="cp-general-note">La información detallada del turno se muestra únicamente a usuarios autorizados con <strong>Inicio Operativo / Mi turno</strong>.</div></section>`;
}
function cpConfirmarNavegacion(){
  return typeof confirmarAbandonoRotacionPendiente!=='function'||confirmarAbandonoRotacionPendiente();
}
function cpIr(destino){
  if(!cpConfirmarNavegacion())return;
  if(destino==='avance'&&typeof goAvanceProduccion==='function')return goAvanceProduccion();
  if(destino==='tareo'&&typeof goTareo==='function')return goTareo();
  if(destino==='produccion'){
    const linea=(typeof visibleLines==='function'?(visibleLines()||[]):[])[0];
    if(!linea)return;
    state.currentLine=linea.key; state.currentTab='nuevo'; state.viewingRecordId=null;
    if(typeof renderSidebar==='function')renderSidebar(); if(typeof renderMain==='function')renderMain();
    return;
  }
  if(destino==='programacion'){
    if(!cpPuede('paletas'))return;
    const primera=cpProgramaciones()[0]?.linea||(typeof visibleLines==='function'?(visibleLines()||[])[0]?.key:'');
    if(!primera)return;
    state.currentLine=primera; state.currentTab='paletas'; state.viewingRecordId=null;
    if(typeof renderSidebar==='function')renderSidebar(); if(typeof renderMain==='function')renderMain();
  }
}

/* ===================== PROGRAMACIÓN ===================== */
/* Avance y estado por marca/presentación, tomados de Producción Actual
   (misma fuente y reglas). Si no están disponibles se muestra "—". */
function cpEstadosProgramacion(){
  const mapa=new Map();
  try{
    if(typeof glacialResumenEjecutivoLineas!=='function')return mapa;
    const ctx=cpCtx();
    const r=glacialResumenEjecutivoLineas(ctx.fechaOperativa,cpTurnoCanon(ctx.turno));
    r.filas.forEach(f=>f.detalle.forEach(d=>mapa.set([f.linea,d.marca,d.presentacion].join('||'),d)));
  }catch(e){console.warn('Inicio: estado de programación',e);}
  return mapa;
}
const CP_EST_OPER={EN_CURSO:'En curso',PAUSA:'Pausa',PENDIENTE:'Pendiente',COMPLETADA:'Completada',
  CANCELADA:'Cancelada',DETENIDA:'Detenida'};
function cpProgramacionCard(){
  const items=cpProgramaciones();
  const estados=cpEstadosProgramacion();
  return `<section class="cp-card cp-programacion">
    <div class="cp-card-head"><div class="cp-card-title">${cpIcon('calendar')}<div><h3>Programación del turno</h3><p>Órdenes vigentes para el contexto operativo seleccionado.</p></div></div>
      ${cpPuede('paletas')?'<button class="cp-btn cp-btn-outline" type="button" onclick="cpIr(\'programacion\')">Ver programación</button>':''}</div>
    ${items.length?`<div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>Línea</th><th>Marca</th><th>Presentación</th><th>Programado</th><th>Avance</th><th>Estado</th></tr></thead><tbody>${items.map(p=>{
      const d=estados.get([p.linea,p.marca,p.presentacion].join('||'));
      const cls=d?(CP_EST_EJEC[d.estado]||CP_EST_EJEC.PENDIENTE).cls:'';
      return `<tr>
      <td><strong>${cpEsc(cpNombreLinea(p.linea))}</strong></td><td>${cpEsc(p.marca||'—')}</td><td>${cpEsc(cpPresentacionUI(p))}</td>
      <td><strong>${cpFmt(cpProgramadoUnidades(p))} ${cpUnidadLinea(p.linea)}</strong></td>
      <td>${d?Math.round(d.avance)+' %':'—'}</td>
      <td>${d?`<span class="cp-ex-badge cp-ex-${cls}"><i></i>${CP_EST_OPER[d.estado]||''}</span>`:'—'}</td></tr>`;}).join('')}</tbody></table></div>`:
      '<div class="cp-empty">No hay programación registrada para este turno.</div>'}
    ${cpTurnoCanon(cpCtx().turno)==='INTERMEDIO'?'<div class="cp-note">'+cpIcon('info')+' Mañana e Intermedio comparten programación cuando existe plan de Mañana.</div>':''}
  </section>`;
}

/* ===================== EQUIPO ===================== */
function cpTareosContexto(){
  const ctx=cpCtx(),turno=cpTurnoCanon(ctx.turno);
  const ts=typeof loadTareos==='function'?(loadTareos()||[]):[];
  return ts.filter(t=>t&&t.area==='Producción'&&t.fecha===ctx.fechaOperativa&&cpTurnoCanon(t.turno)===turno);
}
function cpEquipoData(){
  const ctx=cpCtx();
  const tareos=cpTareosContexto();
  const asignados=new Map(),presentes=new Set(),enComision=new Set();
  tareos.forEach(t=>(t.personal||[]).forEach(p=>{
    const nombre=String(p?.nombre||'').trim(); if(!nombre)return;
    const key=cpNorm(nombre); if(!asignados.has(key))asignados.set(key,{nombre,linea:p.linea||'',puesto:p.puesto||p.cargo||''});
    // Criterio único de asistencia (13-tareo.js): presentes = Asistió + Feriado trabajado + Comisión / trabajo externo.
    if(typeof tareoEsPresente==='function'?tareoEsPresente(p.asistencia):false){
      presentes.add(key);
      if(tareoEstadoCanonico(p.asistencia)==='Comisión / trabajo externo')enComision.add(key);
    }
  }));

  const supervisores=[];
  try{
    if(typeof rotSupBuscarSemanaPorFecha==='function'&&typeof rotSupAsignacionFecha==='function'&&typeof rotSupItems==='function'){
      const rot=rotSupBuscarSemanaPorFecha(ctx.fechaOperativa,true);
      (rot?.detalles||[]).forEach(d=>{
        const a=rotSupAsignacionFecha(rot,d.username,ctx.fechaOperativa);
        const turnoAsignado=String(a?.turno||'').toUpperCase();
        if(a&&['DÍA','INTERMEDIO','NOCHE'].includes(turnoAsignado)&&turnoAsignado===cpTurnoCanon(ctx.turno)){
          supervisores.push(d.nombre||d.username);
        }
      });
    }
  }catch(e){console.warn('Inicio: equipo supervisor',e);}
  if(!supervisores.length&&!cpEsVistaGeneral()&&cpRol()==='SUPERVISOR')supervisores.push(state.user?.nombre||state.user?.username||'');
  return {supervisores:[...new Set(supervisores.filter(Boolean))],asignados:[...asignados.values()],presentes:presentes.size,enComision:enComision.size};
}
function cpEquipoCard(){
  const e=cpEquipoData();
  return `<section class="cp-card cp-half"><div class="cp-card-head"><div class="cp-card-title">${cpIcon('team')}<div><h3>Equipo asignado</h3><p>Asignación y asistencia se muestran por separado.</p></div></div>
    ${(cpPuede('tareoProduccion')||cpPuede('tareoGeneral'))?'<button class="cp-btn cp-btn-outline" type="button" onclick="cpIr(\'tareo\')">Ver equipo</button>':''}</div>
    <div class="cp-team-grid">
      <div><span>Supervisor(es)</span><strong>${e.supervisores.length?cpEsc(e.supervisores.join(', ')):'Sin asignación disponible'}</strong></div>
      <div><span>Personal asignado</span><strong>${e.asignados.length?cpFmt(e.asignados.length):'Sin información'}</strong></div>
      <div><span>Asistencia registrada</span><strong>${e.asignados.length?cpFmt(e.presentes)+(e.enComision?' <small>('+cpFmt(e.enComision)+' en comisión)</small>':''):'—'}</strong></div>
    </div>
    <div class="cp-note">${cpIcon('info')} La asignación no confirma asistencia; la presencia proviene del tareo registrado.</div>
  </section>`;
}

/* ===================== AVANCES / PENDIENTES ===================== */
function cpMinHora(h){
  const m=String(h||'').match(/^(\d{1,2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null;
}
function cpHoraEnRango(h,inicio,fin){
  const x=cpMinHora(h),a=cpMinHora(inicio),b=cpMinHora(fin);
  if(x===null||a===null||b===null)return true;
  if(a===b)return true;
  if(b>a)return x>a&&x<b;
  return x>a||x<b;
}
function cpMsOperativo(fecha,hora,turno){
  if(!fecha||!hora)return 0;
  const d=new Date(`${fecha}T${hora}:00`);
  if(cpTurnoAvance(turno)==='NOCHE'&&Number(String(hora).slice(0,2))<12)d.setDate(d.getDate()+1);
  return d.getTime();
}
function cpSlotsAvance(){
  const ctx=cpCtx(),turno=cpTurnoAvance(ctx.turno);
  const base=(typeof AVANCE_HORARIOS!=='undefined'&&AVANCE_HORARIOS[turno])?AVANCE_HORARIOS[turno]:(turno==='NOCHE'?['01:00','03:00','05:00','07:00']:['09:00','11:00','13:00','15:00','17:00','19:00']);
  const inicio=ctx.horarioInicio||cpHorarioBaseTurno(ctx.turno).inicio;
  const fin=ctx.horarioFin||cpHorarioBaseTurno(ctx.turno).fin;
  const avances=base.filter(h=>h!==fin&&cpHoraEnRango(h,inicio,fin)).map(h=>({tipo:'AVANCE',hora:h}));
  return [...avances,{tipo:'CIERRE',hora:fin}];
}
function cpClaveAvances(){const c=cpCtx();return `${c.fechaOperativa}|${cpTurnoAvance(c.turno)}`;}
function cpEstadoPendientes(snapshots){
  const ctx=cpCtx(),turno=cpTurnoAvance(ctx.turno),ahora=Date.now();
  const slots=cpSlotsAvance(); let proximoMarcado=false;
  return slots.map(slot=>{
    const registrado=(snapshots||[]).some(s=>s&&s.fecha===ctx.fechaOperativa&&cpTurnoAvance(s.turno)===turno&&
      (slot.tipo==='CIERRE'?s.tipo==='CIERRE':s.tipo==='AVANCE'&&(s.horaReferencia===slot.hora||s.horaCorte===slot.hora)));
    if(registrado)return {...slot,estado:'REGISTRADO'};
    const ms=cpMsOperativo(ctx.fechaOperativa,slot.hora,turno);
    if(ms&&ahora>=ms)return {...slot,estado:'PENDIENTE'};
    if(!proximoMarcado){proximoMarcado=true;return {...slot,estado:'PRÓXIMO'};}
    return {...slot,estado:'PROGRAMADO'};
  });
}
function cpPendientesContenido(){
  const key=cpClaveAvances(),dato=cpAvancesCache.get(key);
  if(!dato)return '<div class="cp-loading">Cargando historial real de Avance y Cierre…</div>';
  if(dato.error)return '<div class="cp-empty">No se pudo consultar el historial de Avance y Cierre.</div>';
  const rows=cpEstadoPendientes(dato.items).filter(x=>x.estado!=='PROGRAMADO').slice(0,5);
  if(!rows.length)return '<div class="cp-empty">No hay actividades pendientes para este turno.</div>';
  return `<div class="cp-pending-list">${rows.map(x=>`<div><span>${x.tipo==='CIERRE'?'Cierre':'Avance'}</span><time>${cpEsc(x.hora)}</time><b class="cp-state cp-state-${x.estado.toLowerCase().replace('ó','o')}">${cpEsc(x.estado)}</b></div>`).join('')}</div>`;
}
function cpPendientesCard(){
  return `<section class="cp-card cp-half"><div class="cp-card-head"><div class="cp-card-title">${cpIcon('clipboard')}<div><h3>Pendientes del turno</h3><p>Basado en el historial real de Avance y Cierre.</p></div></div>
    ${cpPuede('avanceProduccion')?'<button class="cp-btn cp-btn-primary" type="button" onclick="cpIr(\'avance\')">Abrir avance y cierre</button>':''}</div>
    <div id="cp-pendientes-contenido">${cpPendientesContenido()}</div>
  </section>`;
}
async function cpCargarAvances(){
  const key=cpClaveAvances(),token=++cpCargaAvancesToken;
  if(cpAvancesCache.has(key))return;
  try{
    // Consulta por la fecha operativa (colección avancesTurnoItems + items que aún queden en el documento antiguo, sin duplicar).
    let items=[];
    const fechaOp=cpCtx().fechaOperativa;
    if(window.glacialAvancesItems&&typeof db!=='undefined'){
      items=await window.glacialAvancesItems.consultarFecha(fechaOp);
    }else if(typeof avanceEstado!=='undefined'&&Array.isArray(avanceEstado.todosSnapshots)){
      items=avanceEstado.todosSnapshots;
    }
    cpAvancesCache.set(key,{items});
  }catch(e){console.error('Inicio · avancesTurno:',e);cpAvancesCache.set(key,{items:[],error:true});}
  if(token!==cpCargaAvancesToken||state.currentTab!=='centro-perfil')return;
  const el=document.getElementById('cp-pendientes-contenido'); if(el)el.innerHTML=cpPendientesContenido();
}

/* ===================== INSUMOS ===================== */
/*
   =============================================================
   CONFIGURACIÓN MAESTRA DE INSUMOS — EDITAR AQUÍ SI CAMBIAN
   =============================================================
   IMPORTANTE:
   - Este bloque NO guarda nada en Firebase.
   - Inicio solo usa estos valores para estimar necesidades.
   - Si cambia una capacidad/factor, cambiarla AQUÍ, no dentro del HTML.
   - Un valor null significa: "Pendiente de configurar".
   - Hielo / Premium / Vasos quedan fuera del cálculo de Agua por ahora.
   =============================================================
*/
const CP_INSUMOS_CONFIG={
  tapas:{
    // PET1 y PET2: CSD6 en todas las presentaciones, excepto 1 L = Sport Cap.
    CSD6:{capacidadEmpaque:5200,unidadEmpaque:'cajas'}, // <-- CAMBIAR AQUÍ si cambia CSD6.
    SPORT_CAP:{capacidadEmpaque:2800,unidadEmpaque:'cajas'} // <-- CAMBIAR AQUÍ si cambia Sport Cap.
  },
  etiquetas:{
    /*
       El peso del rollo NO es fijo. Inicio calcula el PESO NECESARIO:
       kg necesarios = etiquetas necesarias / etiquetasPorKg.
       380 x 5000
○ 625 x 3500
○ 1 LT x 2250
○ 1.5 LT x 1600
       El peso real recibido (ej. 14.7 kg) se registrará en el futuro módulo Insumos.
       Solo se deja activo lo confirmado. Agregar/cambiar factores aquí.
    */
    '625ML':{tipo:'Roll Feed',etiquetasPorKg:3500}, // <-- CAMBIAR AQUÍ si cambia la conversión 625 ml.
    '380ML':{tipo:'Roll Feed',etiquetasPorKg:5000}, // <-- completar cuando se confirme.
    '1L':{tipo:'Etiqueta',etiquetasPorKg:2250},     // <-- completar cuando se confirme.
    '1.5L':{tipo:'Etiqueta',etiquetasPorKg:1600},   // <-- completar cuando se confirme.
    '2.5L':{tipo:'Etiqueta',etiquetasPorKg:570}
        // <-- completar cuando se confirme.
  },
  preformas:{
    /* Capacidades físicas por caja. La relación presentación -> gramaje se deja separada
       para que un cambio de preforma no obligue a cambiar fórmulas. */
    capacidadPorGramaje:{
      '12.7':22000,'13':20000,'15.7':18000,'17.7':18500,
      '21.7':14000,'23.7':14000,'33.7':9928,'42.7':7500,'90':2800
      // <-- CAMBIAR AQUÍ si cambia la cantidad de preformas por caja.
    },
    gramajePorPresentacion:{
      '380ML':12.7,
      '625ML':{
        REGULAR:15.7,
        GAS:21.7,
        SABORIZADA:17.7
      },
      '1L':21.7,
      '1.5L':33.7,
      '2.5L':42.7,
      'B7L':90
      /*
         <-- CAMBIAR AQUÍ si cambia el gramaje aprobado.

         REGLAS ACTUALES:
         380 ml          = 12.7 g (todas las marcas)
         625 ml regular  = 15.7 g
         625 ml con gas  = 21.7 g
         625 ml saborizada = 17.7 g
         1 L             = 21.7 g
         1.5 L           = 33.7 g
         2.5 L           = 42.7 g
         B7L             = 90 g
      */
    }
  },
  b7l:{
    // ETIQUETAS: cada paquete físico contiene 200 etiquetas.
    etiquetasPorPaquete:200,

    // TAPAS B7L: la misma tapa para TODAS las marcas/presentaciones.
    // Indicar aquí la capacidad del paquete/caja cuando se confirme.
    tapas:{
      tipo:'Tapa B7L',
      capacidadEmpaque:null,
      unidadEmpaque:'paquetes'
    },

    // LÁMINA / POLIETILENO B7L:
    // BELLS y FONTILFE NO utilizan lámina. Las demás marcas sí.
    marcasSinPolietileno:['BELLS','FONTILFE','FONTLIFE'],

    // Presentación logística B7L.
    unidadesPorPaqueteEspecial:1,
    unidadesPorPaqueteGeneral:2

    // <-- CAMBIAR AQUÍ únicamente si cambian estas reglas de B7L.
  },
  futuros:{
    // Datos reservados. NO participan en cálculos de Agua hasta habilitar sus módulos.
    hielo:{habilitado:false},premium:{habilitado:false},vasos:{habilitado:false}
  }
};

function cpRedondear(v,d=2){const f=10**d;return Math.round((cpNum(v)+Number.EPSILON)*f)/f;}
function cpFactorSeguro(fn,arg){try{return typeof window[fn]==='function'?window[fn](arg):null;}catch(_){return null;}}
function cpClavePresentacionInsumo(p){
  const t=cpNorm(p?.presentacion||'').replace(/\s+/g,'');
  if(t.includes('380ml'))return '380ML';
  if(t.includes('625ml'))return '625ML';
  if(t.includes('1.5l')||t.includes('1500ml'))return '1.5L';
  if(t.includes('2.5l')||t.includes('2500ml'))return '2.5L';
  if((t.includes('1l')||t.includes('1000ml'))&&!t.includes('1.5'))return '1L';
  return '';
}
function cpTipoAgua625(p){
  /*
     REGLA 625 ml:
     - Si la programación trae explícitamente tipo/variante, se respeta.
     - También se reconocen textos "gas", "con gas", "sabor", "saborizada".
     - Si no existe ninguna marca explícita, se considera AGUA REGULAR.

     Si en el futuro cambia el nombre de estos campos, ajustar SOLO aquí.
  */
  const valores=[
    p?.tipoAgua,p?.tipoProducto,p?.variante,p?.categoria,p?.producto,
    p?.descripcion,p?.presentacion,p?.marca
  ].filter(v=>v!==undefined&&v!==null).join(' ');
  const t=cpNorm(valores);

  if(t.includes('sabor'))return 'SABORIZADA';
  if(t.includes('con gas')||t.includes('gasificada')||t.includes('gasificado')||
     /(^|\s)gas($|\s)/.test(t))return 'GAS';
  return 'REGULAR';
}

function cpGramajePreforma(p){
  const clave=cpClavePresentacionInsumo(p);
  if(clave==='625ML'){
    const tipo=cpTipoAgua625(p);
    return CP_INSUMOS_CONFIG.preformas.gramajePorPresentacion['625ML']?.[tipo] ?? null;
  }
  if(p?.linea==='B7L')return CP_INSUMOS_CONFIG.preformas.gramajePorPresentacion.B7L;
  return CP_INSUMOS_CONFIG.preformas.gramajePorPresentacion[clave] ?? null;
}

function cpFmtInsumo(v,d=2){
  if(v===null||v===undefined||!Number.isFinite(Number(v)))return '—';
  const n=Number(v);return n.toLocaleString('es-PE',{minimumFractionDigits:Number.isInteger(n)?0:d,maximumFractionDigits:d});
}
function cpDatoInsumo(principal='',detalle='',subdetalle='',estado='CALCULADO'){
  return {principal,detalle,subdetalle,estado};
}
function cpPendienteInsumo(detalle='Pendiente de configurar'){
  return cpDatoInsumo('—',detalle,'','PENDIENTE');
}
function cpNoAplicaInsumo(){return cpDatoInsumo('—','No aplica','','NO_APLICA');}

function cpPreformasPET(p,unidades){
  const gramaje=cpGramajePreforma(p);
  const capacidad=gramaje?CP_INSUMOS_CONFIG.preformas.capacidadPorGramaje[String(gramaje)]:null;
  if(capacidad){
    const eq=unidades/capacidad;
    return cpDatoInsumo(`${Math.ceil(eq)} cajas`,`${cpFmt(unidades,0)} und · ${gramaje} g`,`${cpFmtInsumo(eq)} cajas`);
  }
  // Compatibilidad: mientras se confirma el gramaje, usa SOLO el divisor ya existente
  // en GLACIAL para no duplicar ni cambiar la fórmula operativa actual.
  const divisor=cpFactorSeguro('obtenerDivisorCajasPreformas',p.presentacion);
  if(divisor){
    const eq=unidades/divisor;
    return cpDatoInsumo(`${Math.ceil(eq)} cajas`,`${cpFmt(unidades,0)} und`,`${cpFmtInsumo(eq)} cajas · factor actual`);
  }
  return cpPendienteInsumo('Falta gramaje/capacidad');
}
function cpTapasPET(p,unidades){
  const clave=cpClavePresentacionInsumo(p);
  const tipo=clave==='1L'?'SPORT_CAP':'CSD6';
  const cfg=CP_INSUMOS_CONFIG.tapas[tipo];
  if(!cfg?.capacidadEmpaque)return cpPendienteInsumo('Falta capacidad de tapa');
  const eq=unidades/cfg.capacidadEmpaque;
  return cpDatoInsumo(`${Math.ceil(eq)} ${cfg.unidadEmpaque}`,tipo==='SPORT_CAP'?'Sport Cap':'CSD6',`${cpFmt(unidades,0)} und · ${cpFmtInsumo(eq)} ${cfg.unidadEmpaque}`);
}
function cpEtiquetasPET(p,unidades){
  const clave=cpClavePresentacionInsumo(p),cfg=CP_INSUMOS_CONFIG.etiquetas[clave];
  if(!cfg?.etiquetasPorKg)return cpPendienteInsumo(cfg?.tipo||'Falta factor ETQ/kg');
  const kg=unidades/cfg.etiquetasPorKg;
  return cpDatoInsumo(`${cpFmtInsumo(kg)} kg`,`${cpFmt(unidades,0)} etq.`,`${cpFmt(cfg.etiquetasPorKg,0)} etq/kg · ${cfg.tipo}`);
}

function cpEtiquetasB7L(unidades){
  const porPaquete=cpNum(CP_INSUMOS_CONFIG.b7l.etiquetasPorPaquete);
  if(!(porPaquete>0))return cpPendienteInsumo('B7L · falta ETQ/paquete');
  const paquetes=unidades/porPaquete;
  return cpDatoInsumo(
    `${Math.ceil(paquetes)} paquetes`,
    `${cpFmt(unidades,0)} etq.`,
    `${cpFmt(porPaquete,0)} etq/paquete · ${cpFmtInsumo(paquetes)} paquetes`
  );
}

function cpTapasB7L(unidades){
  const cfg=CP_INSUMOS_CONFIG.b7l.tapas;
  if(!(cpNum(cfg?.capacidadEmpaque)>0)){
    // La tapa ya está definida como común para todo B7L; falta únicamente
    // confirmar cuántas tapas contiene cada paquete/caja.
    return cpPendienteInsumo(`${cfg?.tipo||'Tapa B7L'} · misma para todo B7L`);
  }
  const eq=unidades/cpNum(cfg.capacidadEmpaque);
  return cpDatoInsumo(
    `${Math.ceil(eq)} ${cfg.unidadEmpaque}`,
    cfg.tipo||'Tapa B7L',
    `${cpFmt(unidades,0)} tapas · ${cpFmtInsumo(eq)} ${cfg.unidadEmpaque}`
  );
}

function cpUsaPolietilenoB7L(marca){
  const m=cpNorm(marca);
  const excluidas=(CP_INSUMOS_CONFIG.b7l.marcasSinPolietileno||[]).map(cpNorm);
  return !excluidas.some(x=>x&&m.includes(x));
}
function cpFactorPorPaleta(p,unidades,fn,nombreUnidad){
  const upp=typeof obtenerUnidadesPorPalet==='function'?cpNum(obtenerUnidadesPorPalet(p.linea,p.marca,p.presentacion)):0;
  const factor=cpFactorSeguro(fn,p.presentacion);
  if(!(upp>0&&factor))return cpPendienteInsumo('Falta factor/paleta');
  const paletas=unidades/upp,cantidad=paletas*factor;
  return cpDatoInsumo(`${cpFmtInsumo(cantidad)} ${nombreUnidad}`,`${cpFmtInsumo(paletas)} pal.`,`${cpFmtInsumo(factor)} ${nombreUnidad}/pal.`);
}
function cpInsumosFila(p){
  const unidades=cpProgramadoUnidades(p),linea=p.linea,marca=cpNorm(p.marca);
  const base={linea,presentacion:cpPresentacionUI(p),marca:p.marca||'',unidades};

  if(['PET1','PET2'].includes(linea))return {...base,
    preformas:cpPreformasPET(p,unidades),
    etiquetas:cpEtiquetasPET(p,unidades),
    tapas:cpTapasPET(p,unidades),
    carton:cpFactorPorPaleta(p,unidades,'obtenerFactorCartonPET','planchas'),
    polietileno:cpFactorPorPaleta(p,unidades,'obtenerFactorPolietileno','kg'),
    stretch:cpFactorPorPaleta(p,unidades,'obtenerFactorStretchFilm','kg')
  };

  if(linea==='B7L'){
    const especial=marca.includes('bells')||marca.includes('fontlife')||marca.includes('fontilfe');
    const undPack=especial?CP_INSUMOS_CONFIG.b7l.unidadesPorPaqueteEspecial:CP_INSUMOS_CONFIG.b7l.unidadesPorPaqueteGeneral;
    const upp=typeof obtenerUnidadesPorPalet==='function'?cpNum(obtenerUnidadesPorPalet(linea,p.marca,p.presentacion)):0;
    const paletas=upp>0?unidades/upp:null;
    return {...base,
      preformas:cpPreformasPET(p,unidades),
      etiquetas:cpEtiquetasB7L(unidades),
      tapas:cpTapasB7L(unidades),
      carton:paletas!==null?cpDatoInsumo(`${cpFmtInsumo(paletas*(typeof CARTON_FIJO_B7L!=='undefined'?CARTON_FIJO_B7L:12))} planchas`,`${cpFmtInsumo(paletas)} pal.`,`Factor actual GLACIAL`):cpPendienteInsumo(),
      polietileno:!cpUsaPolietilenoB7L(p.marca)
        ? cpNoAplicaInsumo()
        : (paletas!==null&&typeof POLIETILENO_B7L_FACTOR!=='undefined'
            ? cpDatoInsumo(`${cpFmtInsumo(paletas*POLIETILENO_B7L_FACTOR)} kg`,`${cpFmtInsumo(paletas)} pal.`,`Factor actual GLACIAL`)
            : cpPendienteInsumo('B7L · falta factor de lámina/polietileno')),
      stretch:paletas!==null?cpDatoInsumo(`${cpFmtInsumo(paletas*(typeof STRETCHFILM_B7L_FACTOR!=='undefined'?STRETCHFILM_B7L_FACTOR:.25))} kg`,`${cpFmtInsumo(paletas)} pal.`,`Factor actual GLACIAL`):cpPendienteInsumo()
    };
  }

  // C20L/B20L se mantienen visibles, pero no se inventan factores nuevos en Inicio.
  return {...base,preformas:cpNoAplicaInsumo(),etiquetas:cpNoAplicaInsumo(),tapas:cpNoAplicaInsumo(),carton:cpPendienteInsumo(),polietileno:cpPendienteInsumo(),stretch:cpPendienteInsumo()};
}
function cpInsumosFilas(){return cpProgramaciones().map(cpInsumosFila);}
function cpCeldaInsumo(d){
  const cls=d.estado==='PENDIENTE'?' cp-insumo-pendiente':d.estado==='NO_APLICA'?' cp-insumo-na':'';
  return `<div class="cp-insumo-cell${cls}"><strong>${cpEsc(d.principal)}</strong><span>${cpEsc(d.detalle)}</span>${d.subdetalle?`<small>${cpEsc(d.subdetalle)}</small>`:''}</div>`;
}
function cpEstadoFilaInsumos(f){
  const datos=[f.preformas,f.etiquetas,f.tapas,f.carton,f.polietileno,f.stretch];
  const pendientes=datos.filter(x=>x.estado==='PENDIENTE').length;
  return pendientes?`<span class="cp-state cp-state-proximo">${pendientes} por configurar</span>`:'<span class="cp-state cp-state-estimado">Calculado</span>';
}
function cpInsumosCard(){
  const prog=cpProgramaciones(),rows=cpInsumosFilas();
  return `<section class="cp-card cp-insumos"><div class="cp-card-head"><div class="cp-card-title">${cpIcon('box')}<div><h3>Insumos necesarios del turno</h3><p>Necesidad estimada según la programación del turno.</p></div></div>
    <div class="cp-insumos-head-actions"><button class="cp-btn cp-btn-outline" type="button" disabled title="Se habilitará cuando exista el módulo Insumos">Ver detalle en Insumos</button><small>Módulo Insumos · próximamente</small></div></div>
    ${!prog.length?'<div class="cp-empty">No hay programación para calcular necesidades del turno.</div>':
      `<div class="cp-table-wrap cp-insumos-wrap"><table class="cp-table cp-insumos-table"><thead><tr><th>Línea / Presentación</th><th>Preformas</th><th>ETQ</th><th>Tapas</th><th>Cartón</th><th>Polietileno</th><th>Stretch film</th><th>Estado</th></tr></thead><tbody>${rows.map(r=>`<tr>
        <td class="cp-insumo-linea"><strong>${cpEsc(cpNombreLinea(r.linea))}</strong><span>${cpEsc(r.presentacion)}</span><small>${cpFmt(r.unidades,0)} ${cpEsc(cpUnidadLinea(r.linea))}</small></td>
        <td>${cpCeldaInsumo(r.preformas)}</td><td>${cpCeldaInsumo(r.etiquetas)}</td><td>${cpCeldaInsumo(r.tapas)}</td><td>${cpCeldaInsumo(r.carton)}</td><td>${cpCeldaInsumo(r.polietileno)}</td><td>${cpCeldaInsumo(r.stretch)}</td><td>${cpEstadoFilaInsumos(r)}</td>
      </tr>`).join('')}</tbody></table></div>`}
    <div class="cp-note">${cpIcon('info')} Los valores son necesidades estimadas. No representan material entregado, consumido ni stock de almacén.</div>
  </section>`;
}

/* ===================== ACCESOS ===================== */
function cpAccesosRapidos(){
  const items=[];
  if(cpPuede('nuevo'))items.push({icon:'clipboard',titulo:'Registro de producción',desc:'Registra la producción de tu línea.',dest:'produccion'});
  if(cpPuede('paletas'))items.push({icon:'box',titulo:'Registrar paletas',desc:'Registra las paletas producidas.',dest:'programacion'});
  if(cpPuede('tareoProduccion')||cpPuede('tareoGeneral'))items.push({icon:'team',titulo:'Tareo',desc:'Registra y revisa la asistencia.',dest:'tareo'});
  if(cpPuede('avanceProduccion'))items.push({icon:'report',titulo:'Avance y cierre',desc:'Prepara el reporte del turno.',dest:'avance'});
  if(!items.length)return '';
  return `<section class="cp-quick"><h3>Accesos rápidos</h3><div class="cp-quick-grid">${items.map(x=>`<button type="button" onclick="cpIr('${x.dest}')"><span class="cp-quick-icon">${cpIcon(x.icon)}</span><span><b>${cpEsc(x.titulo)}</b><small>${cpEsc(x.desc)}</small></span>${cpIcon('arrow')}</button>`).join('')}</div></section>`;
}

function cpCabecera(){
  const ctx=cpCtx(),nombre=state.user?.nombre||state.user?.username||'Usuario';
  const horario=ctx.horarioInicio&&ctx.horarioFin?`${ctx.horarioInicio} – ${ctx.horarioFin}`:'Sin horario asignado';
  const selector=cpEsVistaGeneral()?`<div class="cp-context-filter" aria-label="Consulta de fecha y turno">
    <label>Fecha<input type="date" value="${cpEsc(ctx.fechaOperativa)}" onchange="cpCambiarContexto('fecha',this.value)"></label>
    <label>Turno<select onchange="cpCambiarContexto('turno',this.value)"><option value="DÍA" ${ctx.turno==='DÍA'?'selected':''}>Mañana</option><option value="INTERMEDIO" ${ctx.turno==='INTERMEDIO'?'selected':''}>Intermedio</option><option value="NOCHE" ${ctx.turno==='NOCHE'?'selected':''}>Noche</option></select></label>
  </div>`:'';
  return `<div class="cp-title-row"><div><h2>${cpTitulo()}</h2><p>${cpEsVistaGeneral()?'Consulta operativa del turno seleccionado.':'Organiza el trabajo y revisa la programación vigente.'}</p></div>${selector}</div>
    <section class="cp-welcome"><div class="cp-greeting"><span class="cp-avatar-icon">${cpIcon('user')}</span><div><h3>Hola, ${cpEsc(nombre)}</h3><p>${cpEsc(cpCargo()||'Usuario GLACIAL')}</p></div></div>
      <div class="cp-shift-facts"><button type="button" class="cp-date-fact" onclick="cpAbrirCalendarioInicio()" aria-label="Seleccionar fecha operativa" title="Seleccionar fecha">${cpIcon('calendar')}<span>Fecha<b>${cpFechaBonita(ctx.fechaOperativa)}</b></span><input id="cp-fecha-operativa-input" class="cp-date-native" type="date" value="${cpEsc(ctx.fechaOperativa)}" onchange="cpCambiarFechaInicio(this.value)" tabindex="-1" aria-hidden="true"></button><div>${cpIcon('sun')}<span>Turno<b>${cpEsc(ctx.turno?GlacialIndicadores.nombreBloque(ctx.turno,'pantalla'):'Sin asignación')}</b></span></div><div>${cpIcon('clock')}<span>Horario<b>${cpEsc(horario)}</b></span></div>${cpHechosTurnoExtra(ctx)}</div>
    </section>`;
}
/* Líneas asignadas, estado del turno y tiempo transcurrido de "Mi turno". */
function cpHechosTurnoExtra(ctx){
  const lineas=[...new Set(cpProgramaciones().map(p=>cpNombreLinea(p.linea)))];
  if(!lineas.length&&state.user?.linea)lineas.push(cpNombreLinea(state.user.linea));
  let estado='—',transcurrido='—';
  const base=cpContextoBase();
  if(cpConsulta.fecha&&cpConsulta.fecha!==base.fechaOperativa){estado='Consulta';}
  else if(ctx.horarioInicio&&ctx.horarioFin){
    const ini=new Date(`${ctx.fechaOperativa}T${ctx.horarioInicio}:00`);
    const fin=new Date(`${ctx.fechaOperativa}T${ctx.horarioFin}:00`);
    if(fin<=ini)fin.setDate(fin.getDate()+1);
    const ahora=Date.now();
    if(ahora<ini.getTime()){estado='Por iniciar';transcurrido='No iniciado';}
    else if(ahora>=fin.getTime()){estado='Finalizado';transcurrido=cpDuracionMin((fin-ini)/60000);}
    else{estado='En curso';transcurrido=cpDuracionMin((ahora-ini.getTime())/60000);}
  }
  return `<div>${cpIcon('clipboard')}<span>Líneas asignadas<b>${cpEsc(lineas.join(', ')||'—')}</b></span></div>
    <div>${cpIcon('info')}<span>Estado del turno<b>${cpEsc(estado)}</b></span></div>
    <div>${cpIcon('clock')}<span>Transcurrido<b>${cpEsc(transcurrido)}</b></span></div>`;
}
function cpCambiarContexto(campo,valor){
  if(!cpEsVistaGeneral())return;
  if(campo==='fecha')cpConsulta.fecha=valor;
  if(campo==='turno')cpConsulta.turno=valor;
  cpAvancesCache.clear();
  if(typeof renderMain==='function')renderMain();
}

function cpAbrirCalendarioInicio(){
  const input=document.getElementById('cp-fecha-operativa-input');
  if(!input)return;
  try{
    if(typeof input.showPicker==='function')input.showPicker();
    else input.click();
  }catch(_){
    input.focus();
    input.click();
  }
}

function cpCambiarFechaInicio(valor){
  if(!valor)return;
  // Solo cambia el contexto visual de Inicio. No guarda ni altera registros.
  cpConsulta.fecha=valor;
  cpAvancesCache.clear();
  if(typeof renderMain==='function')renderMain();
}

function cpStyles(){return `<style id="cp-inicio-estilos">
.cp-shell{--cp-navy:#082b4d;--cp-blue:#0878f9;--cp-blue2:#0b67d8;--cp-bg:#f3f8fc;--cp-card:#fff;--cp-text:#102a43;--cp-muted:#60758a;--cp-line:#d8e5ef;--cp-green:#159455;--cp-orange:#df8b00;--cp-red:#d93a3a;max-width:1440px;margin:0 auto;padding:4px 2px 24px;color:var(--cp-text);font-family:inherit}
.cp-shell *{box-sizing:border-box}.cp-shell .cp-icon{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}
.cp-title-row{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin:0 0 10px}.cp-title-row h2{margin:0;color:#10265f;font-size:28px;line-height:1.05;letter-spacing:-.02em}.cp-title-row>div>p{margin:5px 0 0;color:var(--cp-muted);font-size:13px}
.cp-context-filter{display:flex;gap:8px;align-items:flex-end}.cp-context-filter label{font-size:10px;color:var(--cp-muted);font-weight:800;text-transform:uppercase;letter-spacing:.05em}.cp-context-filter input,.cp-context-filter select{display:block;margin-top:4px;height:36px;border:1px solid var(--cp-line);border-radius:8px;background:#fff;color:var(--cp-text);padding:0 9px;font:inherit;font-size:12px}
.cp-welcome,.cp-card{background:var(--cp-card);border:1px solid var(--cp-line);border-radius:12px;box-shadow:0 3px 12px rgba(17,57,91,.055)}
.cp-welcome{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:13px 18px;margin-bottom:12px;overflow:hidden;position:relative}.cp-welcome:after{content:"";position:absolute;right:-45px;top:-80px;width:220px;height:220px;background:linear-gradient(135deg,transparent 35%,#eef7ff);transform:rotate(12deg);pointer-events:none}
.cp-greeting{display:flex;align-items:center;gap:14px;min-width:250px}.cp-avatar-icon{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:#edf6ff;color:var(--cp-blue)}.cp-avatar-icon .cp-icon{width:27px;height:27px}.cp-greeting h3{margin:0;color:#10265f;font-size:19px}.cp-greeting p{margin:3px 0 0;color:#466ba7;font-size:12px}
.cp-shift-facts{display:flex;flex-wrap:wrap;position:relative;z-index:1}.cp-shift-facts>div,.cp-shift-facts>.cp-date-fact{display:flex;align-items:center;gap:10px;min-width:145px;padding:2px 18px;border:0;border-left:1px solid var(--cp-line);color:var(--cp-blue);background:transparent;font:inherit;text-align:left}.cp-shift-facts>.cp-date-fact{position:relative;cursor:pointer;border-radius:8px}.cp-shift-facts>.cp-date-fact:hover{background:#f2f8ff}.cp-shift-facts>.cp-date-fact:focus-visible{outline:3px solid rgba(8,120,249,.24);outline-offset:2px}.cp-shift-facts>div>.cp-icon,.cp-shift-facts>.cp-date-fact>.cp-icon{width:23px;height:23px}.cp-shift-facts span{font-size:10px;color:#5d75a0}.cp-shift-facts b{display:block;margin-top:2px;color:#10265f;font-size:13px;white-space:nowrap}.cp-date-native{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:50%;bottom:0}
.cp-card{padding:0;margin-bottom:12px;overflow:hidden}.cp-card-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 14px;border-bottom:1px solid #e7eef4}.cp-card-title{display:flex;align-items:center;gap:10px}.cp-card-title>.cp-icon{width:28px;height:28px;padding:5px;border-radius:8px;background:#edf6ff;color:var(--cp-blue)}.cp-card-title h3{margin:0;color:#10265f;font-size:16px}.cp-card-title p{margin:2px 0 0;color:#58769b;font-size:11px}
.cp-btn{min-height:36px;border-radius:8px;padding:0 13px;font:inherit;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap}.cp-btn-outline{background:#fff;border:1px solid #b8d7fb;color:#0870e8}.cp-btn-primary{background:linear-gradient(135deg,#0878f9,#0868db);border:1px solid #0871eb;color:#fff;box-shadow:0 3px 8px rgba(8,120,249,.16)}.cp-btn:focus-visible,.cp-quick button:focus-visible,.cp-context-filter input:focus-visible,.cp-context-filter select:focus-visible{outline:3px solid rgba(8,120,249,.24);outline-offset:2px}
.cp-table-wrap{width:100%;overflow:auto}.cp-table{width:100%;border-collapse:collapse;font-size:11px}.cp-table th{background:#edf6fd;color:#173764;text-align:left;padding:7px 14px;font-size:10px}.cp-table td{padding:7px 14px;border-top:1px solid #e2ebf2;color:#28415a;vertical-align:middle}.cp-table td strong{color:#10265f}.cp-table td small{display:block;margin-top:2px;color:#71859a;font-size:9px}.cp-table tr:hover td{background:#f9fcff}.cp-empty,.cp-loading{padding:22px;text-align:center;color:var(--cp-muted);font-size:12px}.cp-loading{background:linear-gradient(90deg,#fff,#f6faff,#fff)}
.cp-note{display:flex;align-items:center;gap:7px;padding:7px 14px;background:#f2f8fe;color:#4f6e98;font-size:10px;border-top:1px solid #e0edf8}.cp-note .cp-icon{width:14px;height:14px;color:var(--cp-blue)}
.cp-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.cp-half{margin-bottom:12px}.cp-team-grid{display:grid;grid-template-columns:1.35fr .75fr .8fr;padding:10px 14px;gap:12px}.cp-team-grid>div{padding-right:12px;border-right:1px solid #e5edf3}.cp-team-grid>div:last-child{border:0}.cp-team-grid span{display:block;color:#6d82a0;font-size:10px}.cp-team-grid strong{display:block;margin-top:4px;color:#173764;font-size:12px;line-height:1.35}
.cp-pending-list{padding:5px 14px 9px}.cp-pending-list>div{display:grid;grid-template-columns:1fr 70px 110px;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #e8eef3;font-size:11px}.cp-pending-list>div:last-child{border-bottom:0}.cp-pending-list time{color:#536e9a}.cp-state{display:inline-flex;align-items:center;justify-content:center;width:max-content;max-width:100%;padding:3px 8px;border-radius:999px;font-size:9px;font-weight:800;white-space:nowrap}.cp-state-registrado,.cp-state-estimado{background:#e5f6ec;color:#13814a}.cp-state-pendiente{background:#fff1f1;color:#d52d2d}.cp-state-proximo{background:#fff4dc;color:#c67500}.cp-integration{padding:5px 9px;border:1px solid #b9e8cd;border-radius:7px;background:#effbf4;color:#16884f;font-size:10px;font-weight:800}.cp-dash{color:#9aa9b7}
.cp-quick{margin-top:2px}.cp-quick>h3{margin:0 0 7px;color:#10265f;font-size:14px}.cp-quick-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.cp-quick button{min-height:66px;border:1px solid var(--cp-line);border-radius:10px;background:#fff;display:grid;grid-template-columns:42px 1fr 22px;align-items:center;text-align:left;gap:10px;padding:9px 12px;color:var(--cp-blue);cursor:pointer;box-shadow:0 2px 8px rgba(17,57,91,.04);font:inherit}.cp-quick button:hover{border-color:#9bc8fb;background:#f9fcff;transform:translateY(-1px)}.cp-quick-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:9px;background:#edf6ff}.cp-quick-icon .cp-icon{width:23px;height:23px}.cp-quick button b{display:block;color:#10265f;font-size:12px}.cp-quick button small{display:block;margin-top:2px;color:#67809b;font-size:10px}

.cp-insumos-head-actions{display:flex;flex-direction:column;align-items:flex-end;gap:3px}.cp-insumos-head-actions small{font-size:9px;color:#71859a}.cp-insumos-head-actions .cp-btn:disabled{opacity:.55;cursor:not-allowed}
.cp-insumos-table{min-width:1120px}.cp-insumos-table th{text-align:center;white-space:nowrap}.cp-insumos-table th:first-child{text-align:left}.cp-insumos-table td{padding:8px 10px;text-align:center}.cp-insumos-table td:first-child{text-align:left}.cp-insumo-linea{min-width:170px;border-left:3px solid var(--cp-blue)}.cp-insumo-linea>strong{display:block;font-size:13px}.cp-insumo-linea>span{display:block;margin-top:2px;color:#496b96;font-size:10px}.cp-insumo-linea>small{display:block;margin-top:3px;color:#71859a;font-size:9px}.cp-insumo-cell{min-width:115px}.cp-insumo-cell strong{display:block;color:#10265f;font-size:12px;white-space:nowrap}.cp-insumo-cell span{display:block;margin-top:3px;color:#58769b;font-size:9px;white-space:nowrap}.cp-insumo-cell small{display:block;margin-top:2px;color:#8495a8;font-size:8.5px;white-space:nowrap}.cp-insumo-pendiente strong{color:#9aa9b7}.cp-insumo-pendiente span{color:#c27a00}.cp-insumo-na strong,.cp-insumo-na span{color:#9aa9b7}.cp-insumos-table tbody tr:nth-child(even) td{background:#fbfdff}.cp-insumos-table tbody tr:hover td{background:#f5faff}
@media(max-width:980px){.cp-welcome{align-items:flex-start;flex-direction:column}.cp-shift-facts{width:100%}.cp-shift-facts>div{flex:1}.cp-two{grid-template-columns:1fr}.cp-quick-grid{grid-template-columns:1fr 1fr}.cp-title-row{align-items:flex-start;flex-direction:column}.cp-context-filter{width:100%}}
@media(max-width:620px){.cp-insumos-head-actions{width:100%;align-items:stretch}.cp-insumos-head-actions small{text-align:center}.cp-insumos-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}.cp-shell{padding:0 0 84px}.cp-title-row h2{font-size:24px}.cp-context-filter{display:grid;grid-template-columns:1fr 1fr}.cp-context-filter label,.cp-context-filter input,.cp-context-filter select{width:100%}.cp-welcome{padding:13px}.cp-shift-facts{display:grid;grid-template-columns:1fr}.cp-shift-facts>div,.cp-shift-facts>.cp-date-fact{border-left:0;border-top:1px solid var(--cp-line);padding:9px 2px;min-width:0;width:100%}.cp-card-head{align-items:flex-start;flex-direction:column}.cp-card-head .cp-btn{width:100%;min-height:44px}.cp-team-grid{grid-template-columns:1fr}.cp-team-grid>div{border-right:0;border-bottom:1px solid #e5edf3;padding:0 0 8px}.cp-team-grid>div:last-child{border-bottom:0}.cp-quick-grid{grid-template-columns:1fr}.cp-quick button{min-height:68px}.cp-table{min-width:650px}.cp-pending-list>div{grid-template-columns:1fr auto}.cp-pending-list .cp-state{grid-column:1/-1}.cp-integration{width:100%;text-align:center}.cp-card-title h3{font-size:15px}}
.cp-general{max-width:980px;margin:34px auto;padding:0 18px}.cp-general-welcome{display:flex;gap:18px;align-items:flex-start;background:#fff;border:1px solid var(--cp-line);border-radius:16px;padding:28px;box-shadow:0 5px 18px rgba(17,57,91,.06)}.cp-general-welcome .cp-avatar-icon{width:58px;height:58px;flex:0 0 58px}.cp-general-kicker{display:block;color:var(--cp-blue);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.cp-general-welcome h2{margin:5px 0 2px;color:#10265f;font-size:27px}.cp-general-welcome p{margin:0;color:var(--cp-muted);font-size:12px}.cp-general-line{height:1px;background:#e3edf5;margin:17px 0}.cp-general-welcome h3,.cp-general-access h3{margin:0 0 6px;color:#10265f;font-size:16px}.cp-general-help{max-width:620px!important;line-height:1.55}.cp-general-access{margin-top:14px}.cp-general-access>.cp-quick-grid{margin-top:9px}.cp-general-note{margin-top:14px;padding:12px 14px;border:1px solid #dce8f2;border-radius:10px;background:#f7fbfe;color:#60758a;font-size:11px;line-height:1.5}@media(max-width:620px){.cp-general{margin:14px auto;padding:0 12px 82px}.cp-general-welcome{padding:20px 16px;flex-direction:column}.cp-general-welcome h2{font-size:23px}}
@media(prefers-reduced-motion:reduce){.cp-shell *{scroll-behavior:auto!important;transition:none!important;animation:none!important}.cp-quick button:hover{transform:none}}
</style>`;}

/* =========================================================
   INICIO EJECUTIVO (Gerencia / Jefatura / ver_inicio_ejecutivo)
   Solo resume lo que ya calcula Producción Actual (24-semaforo…).
   Sin gráficos ni análisis: el detalle vive en Producción Actual.
   ========================================================= */
const CP_EST_EJEC={
  EN_CURSO:{txt:'EN CURSO',cls:'curso'},PAUSA:{txt:'PAUSA',cls:'pausa'},
  PENDIENTE:{txt:'PENDIENTE',cls:'pendiente'},COMPLETADA:{txt:'COMPLETADA',cls:'completada'},
  DETENIDA:{txt:'DETENIDA',cls:'detenida'},CANCELADA:{txt:'CANCELADA',cls:'detenida'}
};
function cpDuracionMin(min){
  min=Math.max(0,Math.round(min));
  return min>=60?`${Math.floor(min/60)} h ${String(min%60).padStart(2,'0')} min`:`${min} min`;
}
/* Unidad de medida propia de cada línea: nunca se suman unidades distintas. */
const CP_UNIDAD_LINEA={C20L:'CAJ',B20L:'BID',B7L:'BID'};
function cpUnidadEjec(linea){return CP_UNIDAD_LINEA[linea]||'UND';}
const CP_HORARIO_TURNO={'DÍA':'07:00 – 15:00',INTERMEDIO:'15:00 – 22:00',NOCHE:'22:00 – 07:00'};

/* Contexto de consulta del Inicio ejecutivo: vacío = fecha operativa y bloque VIGENTES. Solo cambia lo que se muestra (no guarda nada). */
const cpEjecCtx={fecha:'',bloque:''};
/* Líneas con el desglose por marca desplegado (solo vista: se conserva entre actualizaciones en tiempo real). */
const cpEjecAbiertas=new Set();
function cpEjecAlternar(linea){
  if(cpEjecAbiertas.has(linea))cpEjecAbiertas.delete(linea);else cpEjecAbiertas.add(linea);
  document.querySelectorAll('.cp-ex-fila,.cp-ex-det').forEach(tr=>{
    const fila=tr.classList.contains('cp-ex-fila')?tr:tr.previousElementSibling;
    if(fila&&fila.dataset.linea===linea){tr.classList.toggle('cp-ex-abierta',cpEjecAbiertas.has(linea));if(tr===fila)tr.setAttribute('aria-expanded',String(cpEjecAbiertas.has(linea)));}
  });
}
function cpEjecCambiar(campo,valor){
  if(campo==='fecha')cpEjecCtx.fecha=/^\d{4}-\d{2}-\d{2}$/.test(valor||'')?valor:'';
  if(campo==='bloque')cpEjecCtx.bloque=valor==='NOCHE'||valor==='DIA'?valor:'';
  if(typeof renderMain==='function')renderMain();
}
function cpEjecHoy(){cpEjecCtx.fecha='';cpEjecCtx.bloque='';if(typeof renderMain==='function')renderMain();}
const CP_MOTIVO_PENDIENTE='Motivo pendiente de registrar';
function cpAhoraMs(){return typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();}
function cpHoraCorta(ms){return ms?new Date(Number(ms)).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'}):'—';}
function cpClaveBloqueEjec(turno){return String(turno||'').toUpperCase().includes('NOCHE')?'NOCHE':'DIA';}

function cpDatosEjecutivo(){
  let r=null;
  try{
    if(typeof glacialResumenEjecutivoLineas==='function'){
      const sel=cpEjecCtx.fecha||cpEjecCtx.bloque;
      r=sel?glacialResumenEjecutivoLineas(cpEjecCtx.fecha||undefined,cpEjecCtx.bloque?(cpEjecCtx.bloque==='NOCHE'?'NOCHE':'DÍA'):undefined)
        :glacialResumenEjecutivoLineas();
    }
  }catch(e){console.warn('Inicio ejecutivo: resumen de líneas',e);}
  if(!r)return null;
  const filas=r.filas;
  const vigentes=filas.filter(f=>f.estado!=='CANCELADA'&&f.programado>0);
  // Avance general: promedio del cumplimiento de cada línea (cada una con su propia unidad). No se suman unidades incompatibles.
  const avance=vigentes.length?vigentes.reduce((s,f)=>s+Math.min(100,f.avance),0)/vigentes.length:0;
  const cuenta=e=>filas.filter(f=>f.estado===e).length;
  const cerradas=filas.length>0&&filas.every(f=>['COMPLETADA','CANCELADA'].includes(f.estado));
  const retrasadas=filas.filter(f=>f.retrasoPct>0);
  const alertas=[];
  filas.forEach(f=>{
    if(f.estado==='DETENIDA')alertas.push({tipo:'DETENIDA',linea:f.nombre,
      texto:f.detenidaMin!==null?`${cpDuracionMin(f.detenidaMin)} sin producción.`:'Línea detenida.'});
    else if(f.retrasoPct>0)alertas.push({tipo:'RETRASADA',linea:f.nombre,
      texto:`Avance real ${f.retrasoPct} % por debajo del avance esperado.`});
  });
  // EN PRODUCCIÓN = unidades registradas > 0 en la fecha y el bloque seleccionados (mismo criterio que «Líneas sin producción»,
  // 63-incidencias-no-produccion.js → enProduccion). Una línea con programación pero sin unidades no cuenta.
  const enCursoReal=filas.filter(cpEnProduccion);
  // Paradas del turno: SOLO registros oficiales de Avance/Cierre (calcularTiemposLinea → paradasClasificadas), sin motivos de no producción
  // ni botones del semáforo.
  let progMin=0,noProgMin=0;const motivos=[];
  filas.forEach(f=>{
    const t=f.tiempos;if(!t||!t.ok)return;
    progMin+=Number(t.minPausasProgramadas)||0;noProgMin+=Number(t.minParadasNoProgramadas)||0;
    (t.paradasClasificadas||[]).forEach(p=>motivos.push({linea:f.nombre,motivo:String(p.motivo||'').trim()||'Sin motivo registrado',
      clasif:p.clasif,minutos:Number(p.minutos)||0,exceso:!!p.exceso}));
  });
  const lineasAutorizadas=(typeof LINES!=='undefined'?LINES:[]).map(l=>l.key);
  return {
    ...r,avance,cerradas,alertas,vigentes,
    enCurso:enCursoReal.length,nombresEnCurso:enCursoReal.map(f=>f.nombre),totalLineas:lineasAutorizadas.length,lineasAutorizadas,
    detenidas:cuenta('DETENIDA'),pausadas:cuenta('PAUSA'),pendientes:cuenta('PENDIENTE'),retrasadas:retrasadas.length,
    paradas:{prog:progMin,noProg:noProgMin,motivos}
  };
}
function cpEnProduccion(f){
  const I=window.glacialIncidencias;
  if(I&&typeof I.enProduccion==='function')return I.enProduccion(f);
  return Number(f&&(f.producidoFisico!=null?f.producidoFisico:f.producido))>0;
}
function cpProductoActual(f){
  if(f.estado==='COMPLETADA')return 'Producción finalizada';
  if(f.estado==='CANCELADA')return 'Cancelada';
  if(f.estado==='PENDIENTE')return 'Pendiente';
  return [f.marca,f.presentacion].filter(Boolean).join(' · ')||'—';
}
function cpAvanceTxt(d){return d.vigentes.length?Math.round(d.avance)+' %':'—';}

/* ---------- motivos de no producción: qué líneas se muestran (lógica pura en 63-incidencias-no-produccion.js) ---------- */
function cpContextoBloque(d){
  const cur=typeof window.glacialBloqueVigente==='function'?window.glacialBloqueVigente():null;
  const clave=GlacialIndicadores.claveBloque(d.turno);
  const bloqueActual=!!(cur&&cur.activo&&cur.fecha===d.fecha&&cur.bloque===clave);
  let inicio=0;
  try{
    const h=GlacialIndicadores.horarioBloque(d.fecha,d.turno,typeof window.glacialBloquesConfig==='function'?window.glacialBloquesConfig():undefined);
    inicio=h?h.inicio:0;
  }catch(_){inicio=0;}
  return {bloqueActual,inicio,bloque:clave==='noche'?'NOCHE':'DIA_INTERMEDIO'};
}
function cpFilasSinProduccion(d){
  const I=window.glacialIncidencias;
  if(!I)return {filas:[],estado:'sin_modulo'};
  I.escuchar(d.fecha);
  const ctx=cpContextoBloque(d);
  const est=I.estado();
  const filas=I.sinProduccion({filas:d.filas,lineas:d.lineasAutorizadas,incidencias:I.lista(d.fecha,ctx.bloque),
    inicioBloque:ctx.inicio,ahora:cpAhoraMs()});
  return {filas,estado:est.error?'error':(est.listo&&est.fecha===d.fecha?'listo':'cargando'),inicio:ctx.inicio,error:est.error};
}
function cpVerIncidencia(linea){
  const d=cpDatosEjecutivo();if(!d)return;
  const I=window.glacialIncidencias,ctx=cpContextoBloque(d);
  const doc=I?I.doc(d.fecha,ctx.bloque,linea):null;
  const raiz=document.getElementById('modal-root');if(!raiz)return;
  const paso=h=>`<li><b>${cpEsc(h.accion==='RESOLUCION'?'Resuelta':h.accion==='CORRECCION'?'Corregida':'Registrada')}</b> · ${cpEsc(cpHoraCorta(h.en))} · ${cpEsc(h.por||'—')}${h.motivo?` · ${cpEsc(h.motivo)}`:''}${h.descripcion?` — ${cpEsc(h.descripcion)}`:''}${h.evento?` · por ${cpEsc(h.evento==='INICIAR'?'inicio':'reanudación')} de la línea`:''}</li>`;
  const cuerpo=doc
    ?`<p><b>Estado:</b> ${doc.estado==='VIGENTE'?'Vigente':'Resuelta'}</p><p><b>Motivo:</b> ${cpEsc(doc.motivo)}${doc.descripcion?` — ${cpEsc(doc.descripcion)}`:''}</p>
       <p><b>Registrado por:</b> ${cpEsc(doc.registradoPor||'—')} · ${cpEsc(cpHoraCorta(doc.registradoEn))}</p>
       <h4 style="margin:12px 0 4px">Historial</h4><ul style="margin:0;padding-left:18px">${(doc.historial||[]).slice().reverse().map(paso).join('')}</ul>`
    :`<p>${CP_MOTIVO_PENDIENTE}. Ningún usuario ha informado todavía la situación de esta línea en este bloque.</p>`;
  const ir=cpPuede('produccionActual')?`<button type="button" class="btn btn-primary" onclick="closeModal();goProduccionActual()">Ir a Producción Actual</button>`:'';
  raiz.innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${cpEsc(linea)} · sin producción</h3><button class="modal-close" onclick="closeModal()" aria-label="Cerrar">✕</button></div>
    <div class="modal-body">${cuerpo}<p class="small-muted" style="margin-top:12px">Informativo: no es una parada oficial ni cambia tiempos, ratio o producción.</p>
    <div class="actions-row" style="margin-top:12px">${ir}</div></div></div></div>`;
}
function cpVerMotivosParadas(){
  const d=cpDatosEjecutivo();if(!d)return;
  const raiz=document.getElementById('modal-root');if(!raiz)return;
  const filas=d.paradas.motivos.length
    ?d.paradas.motivos.map(m=>`<tr><td>${cpEsc(m.linea)}</td><td>${cpEsc(m.motivo)}${m.exceso?' <small>(exceso sobre el estándar)</small>':''}</td><td>${m.clasif==='PROGRAMADA'?'Programada':'No programada'}</td><td style="text-align:right;white-space:nowrap"><b>${cpDuracionMin(m.minutos)}</b></td></tr>`).join('')
    :'<tr><td colspan="4">Sin paradas registradas</td></tr>';
  raiz.innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>Motivos registrados</h3><button class="modal-close" onclick="closeModal()" aria-label="Cerrar">✕</button></div>
    <div class="modal-body"><p class="small-muted">Paradas oficiales de Avance/Cierre · ${cpEsc(cpFechaBonita(d.fecha))} · ${cpEsc(GlacialIndicadores.nombreBloque(d.turno,'pantalla'))}</p>
    <div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>Línea</th><th>Motivo</th><th>Tipo</th><th style="text-align:right">Tiempo</th></tr></thead><tbody>${filas}</tbody></table></div>
    <div class="actions-row" style="margin-top:12px">${cpPuede('avanceProduccion')?`<button type="button" class="btn btn-ghost" onclick="closeModal();goAvanceProduccion()">Abrir Avance / Cierre</button>`:''}</div></div></div></div>`;
}
function cpIrLineaInicio(){if(cpPuede('produccionActual')&&typeof goProduccionActual==='function')goProduccionActual();}

/* ---------- DISTRIBUCIÓN DE PERSONAL (Tareo › Distribución de personal, 43-distribucion-personal.js) ----------
   Solo consulta: Inicio no guarda ni edita cantidades. Fuente única: la distribución que el supervisor guarda en Tareo, por fecha operativa
   y bloque (Día = Mañana + Intermedio; Noche aparte). Se toma UN evento: el vigente al corte del bloque seleccionado (ahora, o el fin si ya
   terminó); las versiones no se suman. La caché es por fecha|bloque, así que una respuesta tardía de otro contexto no pisa el seleccionado.
   · Línea: cantidad confirmada (0 incluido) o Pendiente (sin confirmar; nunca se muestra como 0).
   · Asignados a líneas = suma de las líneas CONFIRMADAS. Apoyo compartido va aparte y no se suma a ninguna línea.
   · Total con asistencia = personas distintas con asistencia que trabaja en el Tareo de Producción del bloque (disponiblesTareo: sin
     Mantenimiento ni espejos de maquinistas, una persona en Día e Intermedio cuenta una vez). No es el catálogo de trabajadores.
   · Sin asignar = total con asistencia − asignados − apoyo. La distribución guarda CANTIDADES, no nombres: no se verifica persona por persona. */
let cpPersonalClave='',cpPersonalCerrar=null;
function cpPersonalEscuchar(fecha,bloque){
  const D=window.glacialDistribucionPersonal;if(!D)return;
  const k=fecha+'|'+bloque;
  if(k!==cpPersonalClave){
    if(typeof cpPersonalCerrar==='function'){try{cpPersonalCerrar();}catch(_){/* ya cerrada */}}
    cpPersonalClave=k;          // antes de escuchar: una respuesta inmediata redibuja y no debe abrir otra escucha
    cpPersonalCerrar=null;
    try{cpPersonalCerrar=D.escuchar(fecha,bloque);}catch(_){cpPersonalCerrar=null;}
  }
  if(!window.__cpPersonalOyente){window.__cpPersonalOyente=true;D.alCambiar(cpRefrescarEjecutivo);}
}
/* Reintento tras un error de carga: se cierra la escucha y se vuelve a abrir para el mismo contexto. */
function cpPersonalReintentar(){
  if(typeof cpPersonalCerrar==='function'){try{cpPersonalCerrar();}catch(_){/* ya cerrada */}}
  cpPersonalCerrar=null;cpPersonalClave='';
  cpRefrescarEjecutivo();
}
function cpPersonalPorLinea(d){
  const D=window.glacialDistribucionPersonal;
  if(!D)return null;
  const bloque=d.turno==='NOCHE'?'NOCHE':'DÍA';
  cpPersonalEscuchar(d.fecha,bloque);
  let h=null;try{h=GlacialIndicadores.horarioBloque(d.fecha,d.turno,typeof window.glacialBloquesConfig==='function'?window.glacialBloquesConfig():undefined);}catch(_){h=null;}
  const ahora=cpAhoraMs();
  const corte=h?Math.max(h.inicio,Math.min(ahora,h.fin-1)):ahora;
  const datos=D.datos(d.fecha,bloque);
  const ev=D.vigente(datos.eventos,corte);
  const porLinea=new Map(d.filas.map(f=>[f.linea,f]));
  const lineas=d.lineasAutorizadas.filter(l=>D.LINEAS.includes(l)).map(l=>{
    const p=D.consultar(d.fecha,bloque,l,corte),f=porLinea.get(l),produce=!!f&&cpEnProduccion(f);
    const pendiente=p.estado==='PENDIENTE',cant=pendiente?null:Number(p.cantidad)||0;
    // Advertencias: personal en una línea que no produce; línea que produce sin personal confirmado (0 o pendiente).
    const alerta=!produce&&cant>0?'parado':(produce&&(pendiente||cant===0)?'sinpersonal':'');
    return {linea:l,produce,pendiente,cantidad:cant,alerta};
  });
  const distribuido=lineas.reduce((s,x)=>s+(x.cantidad||0),0);
  const apoyo=ev?Number(ev.apoyoCompartido)||0:0;
  let disponible=null;try{disponible=D.disponiblesTareo(typeof obtenerTareos==='function'?obtenerTareos():[],d.fecha,bloque);}catch(_){disponible=null;}
  const sinAsignar=disponible===null||!ev?null:disponible-distribuido-apoyo;
  const advertencias=lineas.filter(x=>x.alerta).length+(sinAsignar!==null&&sinAsignar<0?1:0);
  return {lineas,distribuido,apoyo,disponible,sinAsignar,advertencias,
    pendientes:ev?lineas.filter(x=>x.pendiente):[],
    error:!!datos.error&&!datos.listo,sincronizado:!!datos.listo,hayDistribucion:!!ev,desdeMs:ev?Number(ev.desdeMs)||0:0,
    usuario:ev?String(ev.usuario||''):''};
}
const CP_DIST_OBS={parado:'Tiene personal y no produce',sinpersonal:'Produce sin personal confirmado'};
/* Tarjeta compacta «Distribución de personal» (reemplaza a «Estado del turno» en la fila superior). */
function cpDistribucionKpi(r){
  const ver=`<button type="button" class="cp-ex-enlace" onclick="cpVerDistribucion()">Ver distribución →</button>`;
  if(!r)return `<div class="cp-ds-msg">No se cargó el módulo de distribución de personal.</div>`;
  if(r.error)return `<div class="cp-ds-msg cp-ds-err" role="alert">No se pudo consultar la distribución de personal.</div>
    <button type="button" class="cp-ex-enlace" onclick="cpPersonalReintentar()">Reintentar ↻</button>`;
  if(!r.sincronizado)return `<div class="cp-ds-msg">Consultando la distribución…</div>`;
  if(!r.hayDistribucion)return `<div class="cp-ds-msg cp-ds-sin">Distribución pendiente de registrar</div>
    <small class="cp-ds-sub">${r.disponible===null?'El Tareo del bloque aún no tiene asistencia.':`Total con asistencia: <b class="cp-ds-inl">${cpFmt(r.disponible)}</b>`}</small>${ver}`;
  const lista=r.lineas.map(x=>`<li class="${x.alerta?'cp-ds-alerta':''}"><span>${cpEsc(cpNombreLinea(x.linea))}${x.alerta?` <i class="cp-ds-warn" title="${CP_DIST_OBS[x.alerta]}" aria-label="${CP_DIST_OBS[x.alerta]}">⚠</i>`:''}</span>
      ${x.pendiente?'<em class="cp-ds-pend">Pendiente</em>':`<strong>${cpFmt(x.cantidad)}</strong>`}</li>`).join('');
  const sa=r.sinAsignar===null?'<strong>—</strong>'
    :r.sinAsignar<0?`<strong class="cp-ds-neg" title="Se asignaron ${cpFmt(-r.sinAsignar)} más que los presentes">⚠ ${cpFmt(r.sinAsignar)}</strong>`:`<strong>${cpFmt(r.sinAsignar)}</strong>`;
  const tot=`<ul class="cp-ds-tot">
      <li><span>Asignados a líneas${r.pendientes.length?'*':''}</span><strong>${cpFmt(r.distribuido)}</strong></li>
      <li><span>Apoyo compartido</span><strong>${cpFmt(r.apoyo)}</strong></li>
      <li><span>Sin asignar</span>${sa}</li>
      <li class="cp-ds-asis"><span>Total con asistencia</span><strong>${r.disponible===null?'Sin Tareo':cpFmt(r.disponible)}</strong></li></ul>`;
  const incompleta=r.pendientes.length?`<small class="cp-ds-inc">* Incompleta: ${r.pendientes.map(x=>cpEsc(cpNombreLinea(x.linea))).join(', ')} pendiente${r.pendientes.length===1?'':'s'}</small>`:'';
  const avisos=r.advertencias?`<button type="button" class="cp-ds-avisos" onclick="cpVerDistribucion()">⚠ ${r.advertencias} advertencia${r.advertencias===1?'':'s'}</button>`:'';
  return `<ul class="cp-ds-lista" aria-label="Personal por línea">${lista}</ul>${tot}${incompleta}
    <div class="cp-ds-pie"><small class="cp-ds-sub">Vigente desde ${cpEsc(cpHoraCorta(r.desdeMs))}</small>${avisos}</div>${ver}`;
}
/* Detalle (modal de consulta): línea · estado de producción · personal · observación, con los totales. Sin acciones de edición. */
function cpDistribucionDetalleHTML(d,r){
  const ctx=`${cpEsc(cpFechaBonita(d.fecha))} · ${cpEsc(GlacialIndicadores.nombreBloque(d.turno,'pantalla'))}`;
  if(!r)return `<p>No se cargó el módulo de distribución de personal.</p>`;
  if(r.error)return `<p class="cp-ds-err" role="alert">No se pudo consultar la distribución de personal (${ctx}).</p><button type="button" class="btn btn-ghost" onclick="cpPersonalReintentar()">Reintentar</button>`;
  if(!r.sincronizado)return `<p>Consultando la distribución de personal…</p>`;
  const filas=r.lineas.map(x=>`<tr class="${x.alerta?'cp-pl-'+x.alerta:''}">
      <td data-label="Línea"><strong>${cpEsc(cpNombreLinea(x.linea))}</strong></td>
      <td data-label="Estado"><span class="cp-ex-badge cp-ex-${x.produce?'curso':'sinprog'}"><i></i>${x.produce?'En producción':'Sin producción'}</span></td>
      <td data-label="Personal">${!r.hayDistribucion||x.pendiente?'<span class="cp-pl-pend">Pendiente</span>':`<b>${cpFmt(x.cantidad)}</b>`}</td>
      <td data-label="Observación">${x.alerta?`<span class="cp-pl-obs">⚠ ${CP_DIST_OBS[x.alerta]}</span>`:'—'}</td></tr>`).join('');
  const notas=[];
  if(!r.hayDistribucion)notas.push('Distribución pendiente de registrar para este bloque (Tareo › Distribución de personal).');
  if(r.pendientes.length)notas.push(`Distribución incompleta: ${r.pendientes.map(x=>cpEsc(cpNombreLinea(x.linea))).join(', ')} sin confirmar. «Asignados a líneas» suma solo las líneas confirmadas y «Sin asignar» incluye al personal de las líneas pendientes.`);
  if(r.sinAsignar!==null&&r.sinAsignar<0)notas.push(`<span class="cp-pl-obs">Inconsistencia: se asignaron ${cpFmt(-r.sinAsignar)} más que los ${cpFmt(r.disponible)} con asistencia en el Tareo. Revisar la distribución o la asistencia.</span>`);
  if(r.disponible===null)notas.push('El Tareo de Producción del bloque no tiene asistencia registrada: no se puede calcular «Sin asignar».');
  const tot=(et,v)=>`<div><span>${et}</span><b>${v}</b></div>`;
  const totales=`<div class="cp-ds-totdet">${tot('Asignados a líneas',r.hayDistribucion?cpFmt(r.distribuido):'—')}${tot('Apoyo compartido',r.hayDistribucion?cpFmt(r.apoyo):'—')}
      ${tot('Sin asignar',r.sinAsignar===null?'—':cpFmt(r.sinAsignar))}${tot('Total con asistencia',r.disponible===null?'Sin Tareo':cpFmt(r.disponible))}</div>`;
  return `<p class="small-muted">${ctx}${r.hayDistribucion?` · vigente desde ${cpEsc(cpHoraCorta(r.desdeMs))}${r.usuario?` · registrada por ${cpEsc(r.usuario)}`:''}`:''}</p>
    ${notas.map(n=>`<p class="cp-ds-nota">${n}</p>`).join('')}
    <div class="cp-table-wrap"><table class="cp-table cp-ex-table cp-pl"><thead><tr><th>Línea</th><th>Estado</th><th>Personal</th><th>Observación</th></tr></thead><tbody>${filas}</tbody></table></div>
    ${totales}
    <p class="small-muted" style="margin-top:10px">Solo consulta. La distribución se registra en Tareo › Distribución de personal y guarda cantidades por línea, no nombres: no se verifica persona por persona. El apoyo compartido no se suma a ninguna línea.</p>`;
}
function cpVerDistribucion(){
  if(!cpPuedeVerInicioEjecutivo())return;          // mismo permiso que la tarjeta: sin él no se exponen cantidades
  const d=cpDatosEjecutivo();if(!d)return;
  const raiz=document.getElementById('modal-root');if(!raiz)return;
  raiz.innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal cp-ds-modal" role="dialog" aria-modal="true" aria-labelledby="cp-ds-titulo" id="cp-ds-modal">
    <div class="modal-head"><h3 id="cp-ds-titulo">Distribución de personal</h3><button class="modal-close" onclick="closeModal()" aria-label="Cerrar">✕</button></div>
    <div class="modal-body" id="cp-ds-cuerpo">${cpDistribucionDetalleHTML(d,cpPersonalPorLinea(d))}</div></div></div>`;
}
/* Si el detalle está abierto y llega un cambio (Tareo guarda otra versión), se actualiza con el mismo contexto. */
function cpRefrescarDistribucionAbierta(){
  const c=document.getElementById('cp-ds-cuerpo');if(!c)return;
  const d=cpDatosEjecutivo();if(d)c.innerHTML=cpDistribucionDetalleHTML(d,cpPersonalPorLinea(d));
}

function cpEjecutivoHTML(){
  const d=cpDatosEjecutivo();
  const hora=new Date().toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'});
  if(!d)return `<div class="cp-empty">No se pudo cargar el estado de producción.</div>`;
  const n=d.totalLineas;
  const modo=!!(window.glacialVista&&window.glacialVista.activo());

  // Encabezado: fecha operativa, bloque seleccionado y última actualización (comparten todas las tarjetas).
  const bloqueSel=cpClaveBloqueEjec(d.turno);
  const esVigente=!cpEjecCtx.fecha&&!cpEjecCtx.bloque;
  const cabecera=`<header class="cp-ex-cab">
      <div class="cp-ex-cab-izq"><h1>INICIO</h1>${modo?`<span class="cp-ex-modo" role="status"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/></svg>Modo visualización</span>`:''}</div>
      <div class="cp-ex-cab-der">
        <label class="cp-ex-ctl">${cpIcon('calendar')}<span class="cp-ex-sr">Fecha operativa</span><input type="date" value="${cpEsc(d.fecha)}" onchange="cpEjecCambiar('fecha',this.value)" aria-label="Fecha operativa"></label>
        <label class="cp-ex-ctl cp-ex-bloque">${cpIcon('sun')}<span class="cp-ex-sr">Bloque</span><select onchange="cpEjecCambiar('bloque',this.value)" aria-label="Bloque de producción"><option value="DIA" ${bloqueSel==='DIA'?'selected':''}>MAÑANA + INTERMEDIO</option><option value="NOCHE" ${bloqueSel==='NOCHE'?'selected':''}>NOCHE</option></select></label>
        ${esVigente?'':`<button type="button" class="cp-btn cp-btn-outline" onclick="cpEjecHoy()">Ver bloque vigente</button>`}
        <div class="cp-ex-meta"><small>Actualizado ${cpEsc(hora)}</small></div>
      </div></header>`;

  // 1) AVANCE DEL TURNO: cumplimiento vigente; nunca se suman botellas, bidones y cajas.
  const unidades=[...new Set(d.vigentes.map(f=>cpUnidadEjec(f.linea)))];
  const totProd=d.vigentes.reduce((s,f)=>s+f.producido,0),totProg=d.vigentes.reduce((s,f)=>s+f.programado,0);
  const barraAv=pct=>`<div class="cp-ex-bar"><i class="azul" style="width:${Math.min(100,Math.max(0,pct)).toFixed(0)}%"></i></div>`;
  const tAvance=d.vigentes.length
    ?`<b>${Math.round(d.avance)} %</b>${barraAv(d.avance)}<small>${unidades.length===1?`${cpFmt(totProd)} de ${cpFmt(totProg)} ${unidades[0]}`:`Promedio de ${d.vigentes.length} línea${d.vigentes.length>1?'s':''} con programación`}</small>`
    :`<b>—</b>${barraAv(0)}<small>Sin programación para evaluar</small>`;

  // 2) LÍNEAS EN PRODUCCIÓN: unidades > 0 en la fecha y el bloque; denominador = líneas autorizadas.
  const tEnCurso=`<b>${d.enCurso} / ${n}</b><small>${d.enCurso?cpEsc(d.nombresEnCurso.join(' · ')):'Ninguna línea con producción'}</small>`;

  // 3) PARADAS DEL TURNO (Avance/Cierre).
  const tParadas=`<div class="cp-ex-par"><span class="cp-pt cp-pt-prog"></span>Programadas: <b>${cpDuracionMin(d.paradas.prog)}</b></div>
      <div class="cp-ex-par"><span class="cp-pt cp-pt-noprog"></span>No programadas: <b>${cpDuracionMin(d.paradas.noProg)}</b></div><small>Registro de Avance/Cierre</small>`;

  // 4) MOTIVOS REGISTRADOS: Línea · Motivo — Tiempo (hechos registrados, no paradas abiertas).
  const mot=d.paradas.motivos.slice().sort((a,b)=>b.minutos-a.minutos);
  const tMotivos=(mot.length
    ?mot.slice(0,3).map(m=>`<div class="cp-ex-mot"><span class="cp-pt ${m.clasif==='PROGRAMADA'?'cp-pt-prog':'cp-pt-noprog'}"></span>${cpEsc(m.linea)} · ${cpEsc(m.motivo)} — <b>${cpDuracionMin(m.minutos)}</b></div>`).join('')
    :`<div class="cp-ex-mot cp-ex-mut">Sin paradas registradas</div>`)
    +`<button type="button" class="cp-ex-enlace" onclick="cpVerMotivosParadas()">Ver detalle →</button>`;

  // 5) DISTRIBUCIÓN DE PERSONAL (reemplaza a «Estado del turno»): consulta de la distribución del Tareo para la fecha y el bloque seleccionados.
  const sp=cpFilasSinProduccion(d);
  const tDistribucion=cpDistribucionKpi(cpPersonalPorLinea(d));

  const tarjeta=(icono,titulo,cuerpo,extra='')=>`<div class="cp-ex-kpi ${extra}"><span class="cp-ex-kpi-t">${cpIcon(icono)}${titulo}</span>${cuerpo}</div>`;
  const kpis=`<div class="cp-ex-kpis">${tarjeta('bars','Avance del turno',tAvance)}${tarjeta('chart','Líneas en producción',tEnCurso)}${tarjeta('pause','Paradas del turno',tParadas)}${tarjeta('list','Motivos registrados',tMotivos)}${tarjeta('team','Distribución de personal',tDistribucion,'cp-ds')}</div>`;

  // LÍNEAS SIN PRODUCCIÓN: todas las líneas autorizadas sin unidades en el bloque, cada una con su motivo, «Sin programación» o «Motivo pendiente».
  // Inicio solo muestra: el motivo lo informa el supervisor en Producción Actual («Informar motivo de no producción»).
  const I=window.glacialIncidencias;
  const textoCausa={SIN_PROGRAMACION:['Sin programación','No tiene programación en este bloque.'],CANCELADA:['Programación cancelada','Toda su programación del bloque está cancelada.'],
    BLOQUE_NO_INICIA:['El bloque aún no inicia',`El bloque empieza a las ${cpEsc(cpHoraCorta(sp.inicio))}.`]};
  const filasSP=sp.filas.map(f=>{
    const irRegistrar=f.pendiente&&I&&I.puedeInformar(f.linea)&&cpPuede('produccionActual')
      ?` <button type="button" class="cp-ex-enlace cp-np-ir" onclick="goProduccionActual()">Registrar en Producción Actual →</button>`:'';
    const cuerpo=f.pendiente
      ?`<b class="cp-np-pend">⚠ ${CP_MOTIVO_PENDIENTE}</b>${irRegistrar}<small>${f.causa==='DETENIDA'?'La línea figura detenida y nadie ha informado el motivo.':'Tiene programación y no registra producción en este bloque.'}</small>`
      :f.causa==='INFORMADA'
        ?`<b>Motivo: ${cpEsc(f.motivo)}</b>${f.descripcion?` <span class="cp-np-desc">— ${cpEsc(f.descripcion)}</span>`:''}<small>Registrado por ${cpEsc(f.por||'—')} · ${cpEsc(cpHoraCorta(f.en))}</small>`
        :`<b class="cp-np-auto">${textoCausa[f.causa][0]}</b><small>${textoCausa[f.causa][1]}</small>`;
    return `<div class="cp-np-fila${f.pendiente?' cp-np-fila-pend':''}"><strong class="cp-np-linea">${cpEsc(cpNombreLinea(f.linea))}</strong><span class="cp-np-chip">Sin producción</span>
      <span class="cp-np-ico" aria-hidden="true">${f.pendiente?'!':'i'}</span><div class="cp-np-motivo">${cuerpo}</div>
      <button type="button" class="cp-ex-enlace" onclick="cpVerIncidencia('${cpEsc(f.linea)}')">Ver detalle →</button></div>`;
  }).join('');
  const vacioSP=sp.estado==='sin_modulo'?'No se cargó el registro de motivos.'
    :sp.estado==='error'?'No se pudo consultar el registro de motivos en este momento.'
    :sp.estado==='cargando'?'Consultando los motivos informados…'
    :'Todas las líneas están en producción.';
  const tarjetaSP=`<section class="cp-card cp-np" aria-label="Líneas sin producción"><div class="cp-card-head"><div class="cp-card-title"><span class="cp-np-alerta" aria-hidden="true">!</span><div><h3>LÍNEAS SIN PRODUCCIÓN</h3>
      <p>Motivo informado por el supervisor de la línea. Es informativo: no es una parada oficial ni suma en Paradas del turno.</p></div></div></div>${filasSP||`<div class="cp-empty">${vacioSP}</div>`}</section>`;


  // PRODUCCIÓN POR LÍNEA: una tabla (línea · estado · producción · cumplimiento · último registro) con las unidades propias de cada línea.
  const porLinea=new Map(d.filas.map(f=>[f.linea,f]));
  const barra=(pct,e)=>`<div class="cp-ex-bar"><i class="${{EN_CURSO:'curso',COMPLETADA:'verde',PAUSA:'ambar',DETENIDA:'rojo',CANCELADA:'rojo'}[e]||'azul'}" style="width:${Math.min(100,Math.max(0,pct)).toFixed(0)}%"></i></div>`;
  const badge=e=>{const x=CP_EST_EJEC[e]||CP_EST_EJEC.PENDIENTE;return `<span class="cp-ex-badge cp-ex-${x.cls}"><i></i>${x.txt}</span>`;};
  const filasTabla=d.lineasAutorizadas.map(k=>{
    const f=porLinea.get(k);
    const nombre=cpEsc(cpNombreLinea(k));
    if(!f)return `<tr><td data-label="Línea"><strong>${nombre}</strong></td><td data-label="Estado"><span class="cp-ex-badge cp-ex-sinprog"><i></i>Sin programación</span></td><td data-label="Producción">—</td><td data-label="Cumplimiento">—</td><td data-label="Último registro">—</td></tr>`
    // Estado de línea = el de la marca EN CURSO (f.desglose). f.estado (prioridad entre marcas) lo siguen usando otras pantallas.
    const g=f.desglose,act=g&&g.actual,u=cpUnidadEjec(k);
    const hayMeta=act?act.programado>0:f.programado>0;
    const abierta=cpEjecAbiertas.has(k);
    const nombreMarca=m=>[m.marca,m.presentacion?cpPresentacionUI({linea:k,marca:m.marca,presentacion:m.presentacion}):''].filter(Boolean).join(' · ')||'—';
    const avisos=(g?g.avisos:[]).map(a=>`<div class="cp-ex-aviso" role="status">⚠ Marca ${cpEsc(a.marca||'—')} quedó detenida${a.desde?` desde ${cpEsc(cpHoraCorta(a.desde))}`:''}: finalízala o reanúdala</div>`).join('');
    const prodActual=act&&(act.producido>0||hayMeta)
      ?`<div class="cp-ex-marca-act"><span class="cp-ex-marca-nom">${cpEsc(nombreMarca(act))}</span><span><b>${cpFmt(act.producido)}</b>${act.programado>0?` / ${cpFmt(act.programado)}`:''} ${u}</span></div>
         <div class="cp-ex-total">Total del plan (${g.total.marcas} marca${g.total.marcas===1?'':'s'}): <b>${cpFmt(g.total.producido)}</b> / ${cpFmt(g.total.programado)} ${u}</div>`
      :'—';
    // Producción de productos sin programación en el bloque (24-semaforo…): se muestra aparte y no cuenta en el cumplimiento.
    const fuera=(f.fueraPlan||[]).length
      ?`<div class="cp-ex-fuera" title="No está en la planificación del bloque; no suma al cumplimiento">⚠ Fuera de programación: ${f.fueraPlan.map(z=>`${cpEsc(nombreMarca(z))} <b>${cpFmt(z.producido)}</b> ${u}`).join(' · ')}</div>`:'';
    const desglose=g?g.marcas.map(m=>{
      const x=CP_EST_EJEC[m.estado]||CP_EST_EJEC.PENDIENTE;
      return `<li class="cp-ex-d-${x.cls}${m===act?' cp-ex-d-act':''}"><span class="cp-ex-d-nom">${cpEsc(nombreMarca(m))}</span>
        <span class="cp-ex-d-num"><b>${cpFmt(m.producido)}</b> / ${cpFmt(m.programado)} ${u} · ${m.programado>0?Math.round(m.avance)+' %':'—'}</span>
        <span class="cp-ex-badge cp-ex-${x.cls}"><i></i>${x.txt}</span></li>`;}).join(''):'';
    const hayDet=g&&g.marcas.length>0;
    return `<tr class="cp-ex-fila ${abierta?'cp-ex-abierta':''}" data-linea="${cpEsc(k)}" ${hayDet?`tabindex="0" role="button" aria-expanded="${abierta}" onclick="cpEjecAlternar('${cpEsc(k)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();cpEjecAlternar('${cpEsc(k)}')}"`:''}>
      <td data-label="Línea"><strong>${nombre}</strong></td><td data-label="Estado">${badge(g&&g.estado||f.estado)}${avisos}</td>
      <td data-label="Producción">${prodActual}${fuera}</td>
      <td data-label="Cumplimiento">${hayMeta?`<span class="cp-ex-pct">${Math.round(act?act.avance:f.avance)} %</span>${barra(act?act.avance:f.avance,g&&g.estado||f.estado)}`:'—'}</td>
      <td data-label="Último registro">${f.ultimoMs?cpHoraCorta(f.ultimoMs):'—'}</td></tr>
      ${hayDet?`<tr class="cp-ex-det ${abierta?'cp-ex-abierta':''}"><td colspan="5"><ul class="cp-ex-d-lista" aria-label="Marcas de ${nombre} en el bloque">${desglose}</ul></td></tr>`:''}`;
  }).join('');
  const btn=cpPuede('produccionActual')?`<button class="cp-btn cp-btn-link" type="button" onclick="goProduccionActual()">Ver Producción Actual →</button>`:'';
  const tarjetaLineas=`<section class="cp-card"><div class="cp-card-head"><div class="cp-card-title">${cpIcon('report')}<div><h3>Producción por línea</h3>
      <p>Cada línea con su propia unidad de medida.</p></div></div>${btn}</div>
    ${n?`<div class="cp-table-wrap"><table class="cp-table cp-ex-table"><thead><tr><th>Línea</th><th>Estado</th><th>Producción</th><th>Cumplimiento</th><th>Último registro</th></tr></thead><tbody>${filasTabla}</tbody></table></div>`
      :'<div class="cp-empty">No hay líneas autorizadas para consultar.</div>'}</section>`;

  const alertas=d.alertas.length
    ?d.alertas.map(a=>`<div class="cp-ex-alert cp-ex-alert-${a.tipo==='DETENIDA'?'detenida':'pausa'}"><b>${cpEsc(a.linea)} — ${a.tipo}</b><span>${cpEsc(a.texto)}</span></div>`).join('')
    :`<div class="cp-ex-ok">${cpIcon('info')} Operación sin alertas críticas.</div>`;
  const tarjetaAlertas=`<section class="cp-card"><div class="cp-card-head"><div class="cp-card-title">${cpIcon('info')}<div><h3>Alertas importantes</h3><p>Solo situaciones vigentes que requieren atención.</p></div></div></div>
      <div class="cp-ex-alerts">${alertas}</div></section>`;

  // Orden: encabezado → 5 tarjetas → líneas sin producción → producción por línea → alertas → RESUMEN DE PRODUCCIÓN al final.
  // La tabla «Personal por línea» ya no se repite aquí: su detalle se abre desde «Ver distribución →» (cpVerDistribucion).
  // Las tarjetas «Paradas de hoy», «Proyección del turno» y «Disponibilidad de hoy» (43, 46 y 47) se insertan justo después de .cp-title-row,
  // por eso siguen dentro del bloque final.
  return `${cabecera}${kpis}${tarjetaSP}${tarjetaLineas}${tarjetaAlertas}
    <section class="cp-resumen-prod" aria-label="Resumen de producción"><div class="cp-title-row"><div><h2>RESUMEN DE PRODUCCIÓN</h2><p>Detalle del turno seleccionado.</p></div></div></section>`;
}
function cpEjecutivoStyles(){return `<style id="cp-ejecutivo-estilos">
.cp-resumen-prod{margin-top:16px;padding:14px 16px 12px;background:#fff;border:1px solid var(--cp-line);border-radius:14px;box-shadow:0 3px 12px rgba(17,57,91,.055)}.cp-resumen-prod .cp-title-row{margin-bottom:10px}
.cp-ex-meta{display:flex;align-items:center;gap:16px}.cp-ex-meta b{display:block;color:#10265f;font-size:14px}.cp-ex-meta small{color:var(--cp-muted);font-size:11px}
.cp-ex-turno{background:linear-gradient(135deg,#0a3a7a,#0868db);border-radius:10px;padding:8px 18px}.cp-ex-turno b,.cp-ex-turno small{color:#fff}
.cp-ex-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px}
.cp-ex-kpi{background:#fff;border:1px solid var(--cp-line);border-radius:12px;padding:12px 16px;box-shadow:0 3px 12px rgba(17,57,91,.055)}
.cp-ex-kpi span{display:block;color:#10265f;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.cp-ex-kpi b{display:block;margin:6px 0 4px;color:#10265f;font-size:30px;line-height:1.1}.cp-ex-kpi small{color:var(--cp-muted);font-size:11px}
.cp-ex-kpi .cp-ex-bar{margin:2px 0 6px}.cp-ex-estado{margin:8px 0 6px!important}
.cp-ex-kpi-alert{border-left:4px solid var(--cp-red)}.cp-ex-kpi-alert b{color:var(--cp-red)}
.cp-ex-badge{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:10px;font-weight:800;white-space:nowrap}
.cp-ex-badge i{width:8px;height:8px;border-radius:50%;background:currentColor}
.cp-ex-kpi .cp-ex-general{display:inline-flex;font-size:13px;padding:6px 16px;letter-spacing:0;text-transform:none;color:inherit}
.cp-ex-curso{background:#fff0d6;color:#b86e00}.cp-ex-pausa{background:#fff8d6;color:#9a7500}.cp-ex-pendiente{background:#eceff2;color:#5f6f7c}
.cp-ex-completada{background:#e5f6ec;color:#13814a}.cp-ex-detenida{background:#fde8e8;color:#c62828}
.cp-ex-bar{height:8px;border-radius:99px;background:#e6edf3;overflow:hidden;min-width:60px}.cp-ex-bar i{display:block;height:100%;border-radius:99px;background:#0878f9}
.cp-ex-bar i.verde{background:#159455}.cp-ex-bar i.ambar{background:#e0a100}.cp-ex-bar i.rojo{background:#d93a3a}.cp-ex-bar i.azul{background:#0878f9}
.cp-ex-estado-actual{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid #e7eef4}
.cp-ex-estado-actual>span:first-child{font-size:10px;font-weight:800;color:var(--cp-muted);letter-spacing:.05em}.cp-ex-estado-actual em{font-style:normal;color:#466ba7;font-size:12px}
.cp-ex-lines{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;padding:12px 14px}
.cp-ex-line{border:1px solid var(--cp-line);border-radius:10px;padding:12px;background:#fbfdff}
.cp-ex-line-top{display:flex;justify-content:space-between;align-items:center;gap:8px}.cp-ex-line-top strong{font-size:16px;color:#10265f}
.cp-ex-line-prod{margin:6px 0 4px;color:#466ba7;font-size:12px;min-height:16px}
.cp-ex-line-qty{color:#10265f;font-size:13px}.cp-ex-line-qty b{font-size:22px}.cp-ex-line-qty small{color:var(--cp-muted);font-weight:700}
.cp-ex-line-bar{display:flex;align-items:center;gap:10px;margin-top:8px}.cp-ex-line-bar .cp-ex-bar{flex:1}.cp-ex-line-bar b{font-size:13px;color:#10265f}
.cp-ex-table td,.cp-ex-table th{padding:10px 14px;font-size:12px}.cp-ex-table td .cp-ex-bar{display:inline-block;width:90px;margin-left:8px;vertical-align:middle}
.cp-ex-pct{font-weight:800;color:#10265f}
.cp-ex-alerts{padding:10px 14px;display:grid;gap:8px}
.cp-ex-alert{display:flex;flex-direction:column;gap:2px;padding:10px 14px;border-radius:8px;border-left:4px solid}
.cp-ex-alert b{font-size:13px}.cp-ex-alert span{font-size:12px}
.cp-ex-alert-detenida{background:#fff5f5;border-color:#d93a3a;color:#a92f27}.cp-ex-alert-pausa{background:#fffbea;border-color:#df8b00;color:#8a5a00}
.cp-ex-ok{display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:8px;background:#effbf4;color:#13814a;font-size:13px;font-weight:700}
@media(max-width:980px){.cp-ex-kpis{grid-template-columns:1fr 1fr}.cp-ex-meta{width:100%;justify-content:space-between}}
@media(max-width:620px){.cp-ex-kpis{grid-template-columns:1fr}.cp-ex-kpi b{font-size:26px}
.cp-ex-table thead{display:none}.cp-ex-table,.cp-ex-table tbody,.cp-ex-table tr,.cp-ex-table td{display:block;width:100%}.cp-ex-table{min-width:0}
.cp-ex-table tr{padding:8px 14px;border-top:1px solid #e2ebf2}.cp-ex-table td{border:0;padding:3px 0;display:flex;justify-content:space-between;align-items:center;gap:10px}
.cp-ex-table td:before{content:attr(data-label);color:var(--cp-muted);font-size:10px;font-weight:700;text-transform:uppercase}}
/* ---- Estado de líneas: marca en curso, total aparte y desglose por marca ---- */
.cp-ex-fila{cursor:pointer}.cp-ex-fila:focus-visible{outline:3px solid rgba(8,120,249,.3);outline-offset:-3px}
.cp-ex-marca-act{display:flex;flex-direction:column;gap:2px}.cp-ex-marca-nom{font-weight:700;color:#10265f}
.cp-ex-total{margin-top:4px;font-size:11px;color:var(--cp-muted)}
.cp-ex-fuera{margin-top:4px;font-size:11px;color:#3730A3;background:#EEF2FF;border-radius:6px;padding:2px 6px;display:inline-block}
.cp-ex-aviso{margin-top:6px;padding:5px 8px;border-radius:6px;background:var(--ie-det-bg,#FEE2E2);color:var(--ie-det-tx,#991B1B);font-size:11px;font-weight:700;line-height:1.3;white-space:normal}
.cp-ex-det{display:none}.cp-ex-det.cp-ex-abierta{display:table-row}.cp-ex-det>td{padding:0 16px 10px!important;background:#f8fafc}
.cp-ex-d-lista{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.cp-ex-d-lista li{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1.2fr) auto;gap:10px;align-items:center;padding:6px 10px;border-left:4px solid #cfd8e0;border-radius:6px;background:#fff;font-size:12px}
.cp-ex-d-lista li.cp-ex-d-act{box-shadow:0 0 0 1px rgba(249,115,22,.4)}
.cp-ex-d-lista li.cp-ex-d-curso{border-left-color:#F97316}.cp-ex-d-lista li.cp-ex-d-detenida{border-left-color:#EF4444}.cp-ex-d-lista li.cp-ex-d-completada{border-left-color:#22C55E}
.cp-ex-d-nom{font-weight:700;color:#10265f;overflow-wrap:anywhere}.cp-ex-d-num{color:#466ba7}
@media(max-width:620px){
  .cp-ex-det,.cp-ex-det.cp-ex-abierta{display:block}.cp-ex-table .cp-ex-det>td{display:block;padding:0 14px 10px!important;background:transparent}
  .cp-ex-table .cp-ex-det>td:before{content:none}
  .cp-ex-table tr.cp-ex-fila{border-top:1px solid #e2ebf2}.cp-ex-table tr.cp-ex-fila td[data-label="Producción"],.cp-ex-table tr.cp-ex-fila td[data-label="Estado"]{align-items:flex-start;text-align:right}
  .cp-ex-marca-act{align-items:flex-end}.cp-ex-aviso{text-align:left}
  .cp-ex-d-lista li{grid-template-columns:1fr auto;gap:2px 8px;padding:6px 8px}.cp-ex-d-num{grid-column:1/2;grid-row:2}
  .cp-ex-d-lista li .cp-ex-badge{grid-column:2;grid-row:1/3}
}
/* ---- Inicio: encabezado, cinco tarjetas, líneas sin producción, tabla por línea (colores de estado aprobados) ---- */
.cp-shell{--ie-curso:#F97316;--ie-curso-bg:#FFEDD5;--ie-curso-tx:#9A3412;--ie-pausa:#FACC15;--ie-pausa-bg:#FEF9C3;--ie-pausa-tx:#713F12;--ie-det:#EF4444;--ie-det-bg:#FEE2E2;--ie-det-tx:#991B1B;--ie-fin:#22C55E;--ie-fin-bg:#DCFCE7;--ie-fin-tx:#166534;--ie-pend:#9CA3AF;--ie-pend-bg:#F3F4F6;--ie-pend-tx:#4B5563}
.cp-shell .cp-ex-curso{background:var(--ie-curso-bg);color:var(--ie-curso-tx)}.cp-shell .cp-ex-pausa{background:var(--ie-pausa-bg);color:var(--ie-pausa-tx)}
.cp-shell .cp-ex-detenida{background:var(--ie-det-bg);color:var(--ie-det-tx)}.cp-shell .cp-ex-completada{background:var(--ie-fin-bg);color:var(--ie-fin-tx)}
.cp-shell .cp-ex-pendiente,.cp-shell .cp-ex-sinprog{background:var(--ie-pend-bg);color:var(--ie-pend-tx)}
.cp-shell .cp-ex-curso i{background:var(--ie-curso)}.cp-shell .cp-ex-pausa i{background:var(--ie-pausa)}.cp-shell .cp-ex-detenida i{background:var(--ie-det)}.cp-shell .cp-ex-completada i{background:var(--ie-fin)}.cp-shell .cp-ex-pendiente i,.cp-shell .cp-ex-sinprog i{background:var(--ie-pend)}
.cp-shell .cp-ex-bar i.curso{background:var(--ie-curso)}.cp-shell .cp-ex-bar i.ambar{background:var(--ie-pausa)}.cp-shell .cp-ex-bar i.rojo{background:var(--ie-det)}.cp-shell .cp-ex-bar i.verde{background:var(--ie-fin)}
.cp-ex-cab{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:0 0 12px}
.cp-ex-cab-izq{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.cp-ex-cab h1{margin:0;font-size:32px;line-height:1;letter-spacing:-.01em;color:#10265f}
.cp-ex-modo{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;background:#e3f0fe;color:#0b5cc4;font-size:13px;font-weight:700}.cp-ex-modo svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2}
.cp-ex-cab-der{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cp-ex-ctl{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;border:1px solid var(--cp-line);border-radius:10px;background:#fff;color:var(--cp-blue)}.cp-ex-ctl input,.cp-ex-ctl select{border:0;background:transparent;font:inherit;font-weight:700;color:#10265f;min-height:40px}
.cp-ex-bloque{background:linear-gradient(135deg,#0a3a7a,#0868db);border-color:#0b62d0;color:#fff}.cp-ex-bloque select{color:#fff}.cp-ex-bloque select option{color:#10265f}
.cp-ex-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.cp-ex-cab .cp-ex-meta{display:block}.cp-ex-cab .cp-ex-meta small{color:var(--cp-muted);font-size:12px}
.cp-shell .cp-ex-kpis{grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
.cp-ex-kpi-t{display:flex!important;align-items:center;gap:8px;color:#10265f}.cp-ex-kpi-t .cp-icon{width:24px;height:24px;padding:4px;border-radius:7px;background:#e8f2ff;color:var(--cp-blue)}
.cp-ex-kpi>b{font-size:30px}.cp-ex-par{margin-top:4px;color:#10265f;font-size:14px}.cp-ex-par b{font-size:17px}
.cp-pt{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:7px;vertical-align:middle}.cp-pt-prog{background:var(--ie-curso)}.cp-pt-noprog{background:var(--ie-det)}
.cp-ex-mot{margin-top:5px;font-size:13px;color:#28415a;line-height:1.3}.cp-ex-mut{color:var(--cp-muted)}
.cp-ex-enlace{display:inline-block;margin-top:6px;padding:4px 0;min-height:32px;background:none;border:0;color:#0b67d8;font:inherit;font-size:13px;font-weight:700;cursor:pointer;text-align:left}
.cp-btn-link{background:none;border:0;color:#0b67d8;font-size:13px}
.cp-np{border-color:#f2d58a;background:#fffdf6}.cp-np .cp-card-head{border-bottom:0}
.cp-np-alerta{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#f5b335;color:#fff;font-weight:900;font-size:20px}
.cp-np-fila{display:grid;grid-template-columns:70px 150px 28px minmax(0,1fr) auto;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid #f0e2b8}
.cp-np-linea{font-size:18px;color:#10265f}.cp-np-chip{display:inline-block;padding:6px 14px;border-radius:999px;background:#eef0f3;color:#33475b;font-weight:700;font-size:13px;text-align:center}
.cp-np-ico{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#f5b335;color:#fff;font-weight:900;font-size:14px}
.cp-np-motivo b{font-size:17px;color:#10265f}.cp-np-motivo small{display:block;color:#5f7382;font-size:13px;margin-top:2px}.cp-np-desc{color:#33475b;font-size:14px}.cp-np-pend{color:#9a5b00!important}
.cp-np-pend{color:#b42318!important}.cp-np-fila-pend{background:#fff5f5}.cp-np-auto{color:#5f7382!important}.cp-np-ir{margin-left:8px}
.cp-pl .cp-ex-table td{vertical-align:middle}.cp-pl-parado td{background:#fff8e6}.cp-pl-sinpersonal td{background:#fff1f1}
.cp-pl-obs{color:#9a3412;font-weight:700;font-size:13px}.cp-pl-pend{color:#9a5b00;font-weight:700;font-size:13px}
.cp-pl-total td{border-top:2px solid var(--cp-line);background:#f7fafc}.cp-pl-total small{color:var(--cp-muted)}.cp-pl-nota{margin:0 0 8px}
.cp-shell .cp-ex-kpi .cp-pt{display:inline-block;font-size:0;margin:0 7px 0 0}.cp-shell .cp-ex-kpi .cp-ex-par b,.cp-shell .cp-ex-kpi .cp-ex-mot b{display:inline;margin:0;font-size:15px}
.cp-shell .cp-ex-kpi .cp-ex-par{font-size:14px;text-transform:none;font-weight:500}.cp-ex-cab select{appearance:none;-webkit-appearance:none;background:transparent!important;border:0!important;box-shadow:none!important;padding:0 18px 0 0;cursor:pointer}
.cp-ex-cab .cp-ex-bloque select{color:#fff!important}.cp-ex-cab .cp-ex-bloque select option{color:#10265f;background:#fff}
.cp-ex-table td,.cp-ex-table th{padding:10px 16px;font-size:13px}.cp-fila-link{cursor:pointer}.cp-fila-link:focus-visible{outline:3px solid rgba(8,120,249,.3);outline-offset:-3px}
.cp-ex-table td .cp-ex-bar{display:inline-block;width:140px;margin-left:10px;vertical-align:middle}
.cp-ex-kpis{align-items:stretch}
/* ---- Distribución de personal: lista compacta (línea a la izquierda, personal a la derecha) ---- */
.cp-shell .cp-ds{display:flex;flex-direction:column}
.cp-shell .cp-ds .cp-ds-lista,.cp-shell .cp-ds .cp-ds-tot{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:2px}
.cp-shell .cp-ds li{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:13px;line-height:1.35;color:#28415a}
.cp-shell .cp-ds li>span{display:inline;font-size:13px;font-weight:600;text-transform:none;letter-spacing:0;color:#28415a;min-width:0;overflow-wrap:anywhere}
.cp-shell .cp-ds li>strong{font-size:15px;color:#10265f;font-variant-numeric:tabular-nums;white-space:nowrap}
.cp-shell .cp-ds .cp-ds-lista li{padding:1px 0;border-bottom:1px dashed #e3ebf2}.cp-shell .cp-ds .cp-ds-lista{margin-top:6px;gap:0}
.cp-shell .cp-ds .cp-ds-lista li.cp-ds-alerta>span{color:#9a3412}
.cp-shell .cp-ds .cp-ds-tot{margin-top:6px;padding-top:4px;border-top:1px solid var(--cp-line);gap:0}
.cp-shell .cp-ds .cp-ds-tot li>span{font-weight:500;color:#466ba7;font-size:12px}.cp-shell .cp-ds .cp-ds-tot li>strong{font-size:14px}
.cp-shell .cp-ds .cp-ds-tot li.cp-ds-asis>span{font-weight:800;color:#10265f}
.cp-ds-pend{font-style:normal;font-size:12px;font-weight:700;padding:1px 8px;border-radius:999px;background:var(--ie-pend-bg,#F3F4F6);color:var(--ie-pend-tx,#4B5563);white-space:nowrap}
.cp-ds-warn{font-style:normal;color:#b45309}.cp-shell .cp-ds .cp-ds-neg{color:#b42318}
.cp-shell .cp-ds .cp-ds-inl{display:inline;font-size:inherit;margin:0}
.cp-ds-msg{margin:10px 0 4px;font-size:14px;font-weight:700;color:#5f6f7c}.cp-ds-sin{color:#4B5563}.cp-ds-err{color:#b42318!important}
.cp-shell .cp-ds small.cp-ds-sub,.cp-shell .cp-ds small.cp-ds-inc{display:block;margin-top:4px}.cp-shell .cp-ds small.cp-ds-inc{color:#9a5b00}
.cp-ds-pie{display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;margin-top:4px}.cp-shell .cp-ds .cp-ds-pie small{margin:0}
.cp-ds-avisos{padding:3px 10px;border:1px solid #f2c08a;border-radius:999px;background:#fff7ed;color:#9a3412;font:inherit;font-size:12px;font-weight:700;cursor:pointer;min-height:28px}
.cp-shell .cp-ds .cp-ex-enlace{margin-top:auto;padding-top:4px;min-height:28px}
.cp-ds-modal{max-width:760px}.cp-ds-modal .cp-ex-sinprog{background:#F3F4F6;color:#4B5563}.cp-ds-modal .cp-ex-sinprog i{background:#9CA3AF}.cp-ds-modal .cp-ex-curso{background:#FFEDD5;color:#9A3412}.cp-ds-modal .cp-ex-curso i{background:#F97316}.cp-ds-nota{margin:6px 0;font-size:13px;color:#5b4a00;background:#fffbea;border-left:3px solid #e0a100;padding:6px 10px;border-radius:6px}
.cp-ds-totdet{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}
.cp-ds-totdet div{border:1px solid var(--cp-line,#dbe5ee);border-radius:10px;padding:8px 10px;background:#f7fafc}
.cp-ds-totdet span{display:block;font-size:11px;font-weight:700;color:#466ba7;text-transform:uppercase}.cp-ds-totdet b{font-size:20px;color:#10265f}
@media(max-width:700px){.cp-ds-totdet{grid-template-columns:1fr 1fr}.cp-shell .cp-ds li>span,.cp-shell .cp-ds li{font-size:14px}}
@media(max-width:1180px){.cp-shell .cp-ex-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:700px){
  .cp-shell .cp-ex-kpis{grid-template-columns:1fr}.cp-ex-cab h1{font-size:26px}.cp-ex-cab-der{width:100%}.cp-ex-ctl{flex:1 1 auto}
  .cp-np-fila{grid-template-columns:auto 1fr;gap:6px 10px}.cp-np-chip{grid-column:2;justify-self:start}.cp-np-ico{display:none}.cp-np-motivo{grid-column:1/-1}.cp-np-fila .cp-ex-enlace{grid-column:1/-1}
  .cp-ex-table-wrap{overflow-x:auto}
}
</style>`;}
function cpRefrescarEjecutivo(){
  if(!state.user||state.currentTab!=='centro-perfil'||!cpPuedeVerInicioEjecutivo())return;
  const main=document.getElementById('main');
  if(main)renderCentroPerfil(main);
  cpRefrescarDistribucionAbierta();
}
// Actualización en tiempo real: mismas señales que usa Producción Actual.
['onPaletasUpdated','onProgramacionesUpdated'].forEach(nombre=>{
  const anterior=globalThis[nombre];
  if(typeof anterior!=='function')return;
  globalThis[nombre]=function(){
    const r=anterior.apply(this,arguments);
    cpRefrescarEjecutivo();
    return r;
  };
});
setInterval(cpRefrescarEjecutivo,60000);
// Los motivos de no producción llegan en vivo (63-incidencias-no-produccion.js): Inicio se actualiza sin duplicar suscripciones.
if(window.glacialIncidencias&&!window.__cpIncOyente){window.__cpIncOyente=true;window.glacialIncidencias.alCambiar(cpRefrescarEjecutivo);}

function renderCentroPerfil(main){
  if(!main)return;
  cpCargaAvancesToken++;

  // Inicio ejecutivo: se decide por permiso. No se muestra junto al operativo.
  if(cpPuedeVerInicioEjecutivo()){
    main.innerHTML=`<section class="cp-shell">${cpStyles()}${cpEjecutivoStyles()}${cpEjecutivoHTML()}</section>`;
    return;
  }

  // Sin permiso: no se consultan ni renderizan datos operativos del turno.
  if(!cpPuedeVerInicioOperativo()){
    main.innerHTML=`<section class="cp-shell">${cpStyles()}${cpInicioGeneral()}</section>`;
    return;
  }

  // Inicio operativo (Mi turno): cada sección respeta su permiso específico.
  const verProg=cpAccesoSeccionOperativa('ver_programacion_turno');
  const verInsumos=cpAccesoSeccionOperativa('ver_insumos_turno');
  main.innerHTML=`<section class="cp-shell">${cpStyles()}${cpEjecutivoStyles()}${cpCabecera()}${verProg?cpProgramacionCard():''}${verInsumos?cpInsumosCard():''}<div class="cp-two">${cpEquipoCard()}${cpPendientesCard()}</div>${cpAccesosRapidos()}</section>`;
  cpCargarAvances();
}

window.renderCentroPerfil=renderCentroPerfil;
window.cpIr=cpIr;
window.cpCambiarContexto=cpCambiarContexto;
window.cpAbrirCalendarioInicio=cpAbrirCalendarioInicio;
window.cpCambiarFechaInicio=cpCambiarFechaInicio;
window.abrirCentroPerfil=window.abrirCentroPerfil||function(){
  if(!state.user)return;
  state.showWelcome=false;state.currentTab='centro-perfil';
  if(typeof renderSidebar==='function')renderSidebar();
  if(typeof renderMain==='function')renderMain();
};
