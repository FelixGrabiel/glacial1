/* =============================================================
   AVANCE Y CIERRE DE TURNO — GLACIAL
   Snapshot automático desde datos existentes.
   No modifica producción, paletas, tareos ni paradas originales.
   ============================================================= */

const AVANCE_LINEAS=['PET1','PET2','B7L','C20L','B20L','HIELO'];
const AVANCE_NOMBRES={PET1:'PET1',PET2:'PET2',B7L:'B7L',C20L:'CAJAS 20L',B20L:'B20L',HIELO:'HIELO'};
// Los avances pueden generarse en CUALQUIER momento del turno.
// Estas horas quedan solo como referencia documental; nunca bloquean la generación.
const AVANCE_HORARIOS={DÍA:['09:00','11:00','13:00','15:00','17:00','19:00'],NOCHE:['01:00','03:00','05:00','07:00']};
const avanceEstado={
  fecha:'',turno:'',horaCorte:'',tipo:'AVANCE',
  snapshots:[],todosSnapshots:[],preview:'',previewId:'',
  unsubscribe:null,mesCalendario:null,filtroTipo:'TODOS',pagina:1,
  imagenActual:null,
  paradasOperativas:[],paradasModal:null
};

function avNum(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function avEsc(v){return typeof escaparHtml==='function'?escaparHtml(v??''):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function avFmt(v){return Math.round(avNum(v)).toLocaleString('es-PE');}
function avFechaHoy(){return GlacialIndicadores.diaOperativo((typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now()));}   // día operativo (07:00), hora del servidor
function avHoraActual(){const d=new Date();return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
function avNombreUsuario(){return state.user?.nombre||state.user?.username||'';}
function avTurnoCanon(v){
  v=String(v||'').toUpperCase();
  if(v.includes('NOCHE')||v==='TN')return 'NOCHE';
  if(v.includes('INTERMEDIO'))return 'DÍA';
  return 'DÍA';
}
function avTurnoRecord(r){return avTurnoCanon(r?.turno);}
function avCtx(){
  const c=state.user?.contextoRotacion;
  const turno=avTurnoCanon(state.user?.turnoOperativo||c?.turno||'DÍA');
  return {
    turno,
    fecha:state.user?.fechaOperativa||c?.fechaOperativa||avFechaHoy(),
    inicio:state.user?.horarioOperativoInicio||c?.horarioInicio||(turno==='NOCHE'?'19:00':'07:00'),
    fin:state.user?.horarioOperativoFin||c?.horarioFin||(turno==='NOCHE'?'07:00':'19:00')
  };
}
function avRef(){return db.collection('sync').doc('avancesTurno');}
function avSnapshotId(tipo,hora){
  if(tipo==='CIERRE')return `${avanceEstado.fecha}|${avanceEstado.turno}|CIERRE`;
  // ID único: permite varios avances incluso dentro de la misma hora/minuto.
  return `${avanceEstado.fecha}|${avanceEstado.turno}|AVANCE|${hora}|${Date.now()}`;
}

function avHoraMs(fecha,hora,turno){
  if(!fecha||!hora)return 0;
  const d=new Date(`${fecha}T${hora}:00`);
  if(turno==='NOCHE' && Number(hora.slice(0,2))<12)d.setDate(d.getDate()+1);
  return d.getTime();
}
function avHoraDesdeMs(ms){return ms?new Date(ms).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false}):'';}
function avMinEntre(fecha,inicio,fin,turno){
  const a=avHoraMs(fecha,inicio,turno),b=avHoraMs(fecha,fin,turno);
  return a&&b?Math.max(0,(b-a)/60000):0;
}
function avPresentacion(linea,marca,p){
  if(typeof nombrePresentacionUI==='function')return nombrePresentacionUI(linea,marca,p);
  return String(p||'').replaceAll('_',' ');
}
function avUnidadRatio(linea){return linea==='C20L'?'C/H':'B/H';}

function avRegistros(){
  const rs=typeof loadRecords==='function'?loadRecords():[];
  return rs.filter(r=>r&&AVANCE_LINEAS.includes(r.linea)&&r.fecha===avanceEstado.fecha&&avTurnoRecord(r)===avanceEstado.turno);
}
function avPaletas(){
  const ps=typeof loadPaletas==='function'?loadPaletas():(typeof _paletasCache!=='undefined'?_paletasCache:[]);
  return (ps||[]).filter(p=>p&&AVANCE_LINEAS.includes(p.linea)&&p.fecha===avanceEstado.fecha&&avTurnoCanon(p.turno)===avanceEstado.turno);
}
function avProgramaciones(){
  const ps=typeof loadProgramaciones==='function'?loadProgramaciones():(typeof _programacionesCache!=='undefined'?_programacionesCache:[]);
  return (ps||[]).filter(p=>p&&AVANCE_LINEAS.includes(p.linea)&&p.fecha===avanceEstado.fecha&&avTurnoCanon(p.turno)===avanceEstado.turno);
}
function avCorteMs(hora,tipo){
  if(tipo==='CIERRE')return avHoraMs(avanceEstado.fecha,avCtx().fin,avanceEstado.turno);
  return avHoraMs(avanceEstado.fecha,hora,avanceEstado.turno);
}

/*
   =========================================================
   PRODUCCIÓN PARA AVANCE / CIERRE
   =========================================================
   AVANCE: Paletas como fuente preferida; Producción Efectiva como respaldo.
   CIERRE: Producción Efectiva como fuente oficial; Paletas como respaldo.
   Nunca se suman ambas fuentes.
*/
function avProduccionEfectiva(linea,marca,presentacion){
  let total=0,encontrada=false;
  avRegistros().filter(r=>r.linea===linea).forEach(r=>{
    const cuadros=typeof normalizarCuadros==='function'?normalizarCuadros(r):(r.cuadros||[]);
    cuadros.forEach(q=>{
      if(q?.marca!==marca || q?.presentacion!==presentacion)return;
      const efectiva=avNum(q?.produccion?.efectiva);
      if(efectiva>0){encontrada=true;total+=efectiva;}
    });
  });
  return {valor:total,encontrada};
}

function avProduccionPaletasHasta(linea,marca,presentacion,hora,tipo){
  const corte=avCorteMs(hora,tipo);
  const pal=avPaletas()
    .filter(x=>x.linea===linea&&x.marca===marca&&x.presentacion===presentacion)
    .map((x,indice)=>{
      let ms=Number(x.creadoEn||x.actualizadoEn||0);
      if(x.hora)ms=avHoraMs(avanceEstado.fecha,x.hora,avanceEstado.turno);
      return {registro:x,ms,indice};
    })
    .filter(x=>!x.ms||!corte||x.ms<=corte);
  if(!pal.length)return {valor:0,encontrada:false};

  let completas=null,saldo=null;
  const reciente=(a,b)=>!a||b.ms!==a.ms?(!a||b.ms>a.ms):b.indice>a.indice;
  pal.forEach(item=>{
    const t=String(item.registro?.tipoPaleta||'').toUpperCase();
    if(t==='INCOMPLETA'){if(reciente(saldo,item))saldo=item;}
    else if(reciente(completas,item))completas=item;
  });
  return {
    valor:avNum(completas?.registro?.totalUnidades)+
          avNum(saldo?.registro?.totalUnidades??saldo?.registro?.unidadesIncompleta),
    encontrada:true
  };
}

function avProduccionHasta(linea,marca,presentacion,hora,tipo){
  const efectiva=avProduccionEfectiva(linea,marca,presentacion);
  const paletas=avProduccionPaletasHasta(linea,marca,presentacion,hora,tipo);

  if(tipo==='CIERRE'){
    if(efectiva.encontrada)return {valor:efectiva.valor,fuente:'PRODUCCION_EFECTIVA'};
    return {valor:paletas.valor,fuente:paletas.encontrada?'PALETAS':'SIN_REGISTRO'};
  }

  if(paletas.encontrada&&paletas.valor>0)return {valor:paletas.valor,fuente:'PALETAS'};
  if(efectiva.encontrada)return {valor:efectiva.valor,fuente:'PRODUCCION_EFECTIVA'};
  return {valor:0,fuente:paletas.encontrada?'PALETAS':'SIN_REGISTRO'};
}

function avPersonalLinea(linea){
  // Prioridad: personal realmente asignado en el reporte de línea.
  const nombres=new Set();
  avRegistros().filter(r=>r.linea===linea).forEach(r=>(r.personal||[]).forEach(p=>{
    if(String(p?.nombre||'').trim())nombres.add(String(p.nombre).trim().toLowerCase());
  }));
  if(nombres.size)return nombres.size;

  // Respaldo: tareo de Producción con línea asignada y asistencia válida.
  const ts=typeof loadTareos==='function'?loadTareos():(typeof _tareosCache!=='undefined'?_tareosCache:[]);
  const validos=new Set(['ASISTIO','ASISTIÓ','TARDANZA','FERIADO TRABAJADO','COMISION/TRABAJO EXTERNO','COMISIÓN/TRABAJO EXTERNO']);
  (ts||[]).filter(t=>t?.area==='Producción'&&t.fecha===avanceEstado.fecha&&avTurnoCanon(t.turno)===avanceEstado.turno)
    .forEach(t=>(t.personal||[]).forEach(p=>{
      if(String(p?.linea||'').toUpperCase()===linea && validos.has(String(p?.asistencia||'').toUpperCase()) && p.nombre)
        nombres.add(String(p.nombre).trim().toLowerCase());
    }));
  return nombres.size;
}

function avIdParadaRegistro(recordId,cuadroIndex,key,index,p){
  return String(p?.id||`reg:${recordId||'legacy'}:${cuadroIndex}:${key}:${index}`);
}
function avParadasRegistroLinea(linea,hora,tipo){
  const corte=avCorteMs(hora,tipo),out=[];
  avRegistros().filter(r=>r.linea===linea).forEach(r=>{
    (typeof normalizarCuadros==='function'?normalizarCuadros(r):(r.cuadros||[])).forEach((q,qi)=>{
      const ini=avHoraMs(avanceEstado.fecha,q.horaInicio,avanceEstado.turno);
      if(ini&&corte&&ini>corte)return;
      [['paradasProgramadas','PROGRAMADA'],['paradasNoProgramadas','NO_PROGRAMADA']].forEach(([key,tipoParada])=>{
        (q[key]||[]).forEach((p,pi)=>{
          // Las filas automáticas del registro vienen de este mismo origen: no se duplican.
          if(p?.auto)return;
          if(!p?.descripcion||avNum(p.tiempoMin)<=0)return;
          out.push({
            id:avIdParadaRegistro(r.id,qi,key,pi,p),descripcion:p.descripcion,minutos:avNum(p.tiempoMin),estadoRegistro:r.estadoRegistro||'',
            tipo:tipoParada,causa:p.causa||'',maquina:p.maquina||p.equipo||'',observacion:p.observacion||p.observaciones||'',
            origen:'REGISTRO',recordId:r.id||'',cuadroIndex:qi,key,index:pi,paradaId:p.id||''
          });
        });
      });
    });
  });
  return out;
}
function avParadasOperativasLinea(linea){
  return (avanceEstado.paradasOperativas||[]).filter(p=>
    p&&p.fecha===avanceEstado.fecha&&avTurnoCanon(p.turno)===avanceEstado.turno&&p.linea===linea&&!p.eliminada
  ).map(p=>({...p,minutos:avNum(p.minutos),origen:'AVANCE'}));
}
function avParadasLinea(linea,hora,tipo){
  // Fuente común: registros de producción + eventos generales del turno.
  // Los eventos generales NO se copian a cada marca/cuadro y por ello no duplican minutos.
  return [...avParadasRegistroLinea(linea,hora,tipo),...avParadasOperativasLinea(linea)];
}
function avPuedeEditarParadas(){
  if(!avPuedeGenerar())return false;
  const cierre=avanceEstado.snapshots?.some(s=>s.tipo==='CIERRE'&&s.fecha===avanceEstado.fecha&&s.turno===avanceEstado.turno);
  if(!cierre)return true;
  return typeof tienePermiso==='function'&&tienePermiso('reabrirReporteProduccion');
}
function avIdParadaNueva(){return `avp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;}
function avCatalogoMotivos(){
  const a=typeof PARADAS_PROGRAMADAS!=='undefined'?PARADAS_PROGRAMADAS:[];
  return [...new Set(a)].filter(Boolean);
}
function avTipoMotivo(descripcion,tipoActual){
  if(avCatalogoMotivos().includes(String(descripcion||'').trim()))return 'PROGRAMADA';
  return tipoActual==='PROGRAMADA'?'NO_PROGRAMADA':(tipoActual||'NO_PROGRAMADA');
}
async function avAbrirParadas(linea,fecha,turno){
  try{const [ad,rd]=await Promise.all([avRef().get(),db.collection('sync').doc('records').get()]);avanceEstado.avancesUpdatedAt=avNum(ad.exists?ad.data().updatedAt:0);avanceEstado.recordsUpdatedAt=avNum(rd.exists?rd.data().updatedAt:0);if(ad.exists&&Array.isArray(ad.data().paradasOperativas))avanceEstado.paradasOperativas=ad.data().paradasOperativas;}catch(e){console.error('Leyendo versión de paradas:',e);}
  if(fecha)avanceEstado.fecha=fecha;
  if(turno)avanceEstado.turno=avTurnoCanon(turno);
  linea=linea||AVANCE_LINEAS[0];
  const existentes=avParadasLinea(linea,avHoraActual(),'AVANCE').map(p=>({...p,tipoOriginal:p.tipo||''}));
  avanceEstado.paradasModal={
    linea,fecha:avanceEstado.fecha,turno:avanceEstado.turno,filas:existentes,
    baseAvancesUpdatedAt:avanceEstado.avancesUpdatedAt||0,
    baseRecordsUpdatedAt:avanceEstado.recordsUpdatedAt||0,
    guardando:false,error:''
  };
  avRenderParadasModal();
}
function avCambiarLineaParadas(linea){if(!avanceEstado.paradasModal)return;avanceEstado.paradasModal.linea=linea;avanceEstado.paradasModal.filas=avParadasLinea(linea,avHoraActual(),'AVANCE').map(p=>({...p,tipoOriginal:p.tipo||''}));avRenderParadasModal();}
function avCerrarParadas(){
  if(avanceEstado.paradasModal?.guardando)return;
  document.getElementById('av-paradas-modal')?.remove();
  avanceEstado.paradasModal=null;
  if(!document.querySelector('.av-float-modal.open,.av-detail-modal.open,.av-image-modal.open'))document.body.classList.remove('av-modal-open');
}
function avParadaAgregarFila(){
  const m=avanceEstado.paradasModal;if(!m||m.guardando)return;
  m.filas.push({id:avIdParadaNueva(),descripcion:'',minutos:0,tipo:'',tipoOriginal:'',causa:'',origen:'AVANCE',nueva:true});
  avRenderParadasModal();
}
function avParadaCampo(i,campo,valor){
  const m=avanceEstado.paradasModal,p=m?.filas?.[i];if(!p||m.guardando)return;
  p[campo]=campo==='minutos'?Number(valor||0):valor;
  if(campo==='tipo'){
    if(valor==='PROGRAMADA')p.causa='';
    // El tipo cambia la estructura de la fila (muestra/oculta Causa),
    // por eso solo en este caso es necesario volver a dibujar el modal.
    avRenderParadasModal();
    return;
  }
  // Motivo y minutos se actualizan SIN reconstruir el modal.
  // Así el input conserva foco/cursor mientras el supervisor escribe.
  if(campo==='minutos')avActualizarTotalParadasModal();
}
/* Hora de inicio/fin opcional: con ambas, los minutos se calculan y la parada
   se fusiona por intervalo con las registradas por botón (sin contar doble). */
function avParadaHora(i,campo,valor){
  const m=avanceEstado.paradasModal,p=m?.filas?.[i];if(!p||m.guardando)return;
  p[campo]=valor||'';
  if(p.horaInicio&&p.horaFin){
    const a=avHoraMs(m.fecha,p.horaInicio,m.turno),b=avHoraMs(m.fecha,p.horaFin,m.turno);
    const fin=b<=a?b+86400000:b;
    p.minutos=Math.max(0,Math.round((fin-a)/60000));
  }
  avRenderParadasModal();
}
/* Paradas ya registradas por los botones PAUSA PROGRAMADA / DETENER LÍNEA. */
function avParadasBotonModal(m){
  if(typeof calcularTiemposLinea!=='function')return [];
  try{return calcularTiemposLinea(m.linea,m.turno,m.fecha).detalle||[];}catch(_){return [];}
}
function avParadasBotonHtml(m){
  const lista=avParadasBotonModal(m);
  if(!lista.length)return '';
  return `<div class="av-paradas-note"><b>Ya registradas desde Producción Actual</b> (no las vuelvas a ingresar; ya se suman al total):
    <ul style="margin:6px 0 0 16px;padding:0">${lista.map(p=>`<li>${avEsc(p.motivo)} · ${avHoraDesdeMs(p.inicio)}–${p.abierta?'abierta':avHoraDesdeMs(p.fin)} · ${avFmt(Math.round(p.minutos))} min · ${p.clasif==='PROGRAMADA'?'Programada':'No programada'}</li>`).join('')}</ul></div>`;
}
/* Avisa los motivos que ya existen por botón en el turno (no se suman dos veces). */
function avDuplicadosConBoton(m,filas){
  const motivos=new Set(avParadasBotonModal(m).map(p=>String(p.motivo||'').trim().toLowerCase()));
  return filas.filter(p=>{
    const d=String(p.descripcion||'').trim().toLowerCase();
    return d&&motivos.has(d)&&!(p.horaInicio&&p.horaFin);
  });
}
function avParadaQuitar(i){
  const m=avanceEstado.paradasModal,p=m?.filas?.[i];if(!p||m.guardando)return;
  if(p.origen==='REGISTRO')p.eliminarSolicitado=true;
  else m.filas.splice(i,1);
  avRenderParadasModal();
}
function avActualizarTotalParadasModal(){
  const m=avanceEstado.paradasModal,total=(m?.filas||[]).filter(p=>!p.eliminarSolicitado).reduce((a,p)=>a+avNum(p.minutos),0);
  const e=document.getElementById('av-paradas-total');if(e)e.textContent=`${avFmt(total)} min`;
}
function avRenderParadasModal(){
  avInstalarEstilos();const m=avanceEstado.paradasModal;if(!m)return;
  let modal=document.getElementById('av-paradas-modal');if(!modal){modal=document.createElement('div');modal.id='av-paradas-modal';modal.className='av-paradas-modal';document.body.appendChild(modal);}
  const opciones=avCatalogoMotivos().map(x=>`<option value="${avEsc(x)}"></option>`).join('');
  const causas=(typeof CAUSAS_PARADA_NO_PROGRAMADA!=='undefined'?CAUSAS_PARADA_NO_PROGRAMADA:[]);
  const total=m.filas.filter(p=>!p.eliminarSolicitado).reduce((a,p)=>a+avNum(p.minutos),0);
  const puedeEditar=avPuedeEditarParadas();
  modal.innerHTML=`<div class="av-paradas-dialog"><header><div><small>REGISTRO SIMPLE DE PARADAS</small><h2>Agregar paradas</h2><p>${avFechaBonita(m.fecha)} · ${avEsc(m.turno)}</p><select class="av-paradas-linea" onchange="avCambiarLineaParadas(this.value)">${AVANCE_LINEAS.map(l=>`<option value="${l}" ${m.linea===l?'selected':''}>${AVANCE_NOMBRES[l]||l}</option>`).join('')}</select></div><button onclick="avCerrarParadas()" ${m.guardando?'disabled':''}>✕</button></header>
  <div class="av-paradas-body"><datalist id="av-paradas-catalogo">${opciones}</datalist>
  <div class="av-paradas-note">Selecciona primero si la parada es <b>Programada</b> o <b>No programada</b>. Las paradas de <b>Nuevo registro</b> y <b>Avance/Cierre</b> se muestran juntas y no se copian a todas las marcas.</div>
  ${avParadasBotonHtml(m)}
  ${!puedeEditar?`<div class="av-paradas-note"><b>Modo consulta:</b> el turno está cerrado o tu usuario no tiene permiso de edición.</div>`:''}
  ${m.error?`<div class="av-paradas-error">${avEsc(m.error)}</div>`:''}
  <div class="av-paradas-list">${m.filas.map((p,i)=>p.eliminarSolicitado?'':`<div class="av-parada-row ${p.tipo==='NO_PROGRAMADA'?'is-np':'is-p'}">
    <div class="av-parada-tipo"><label>Tipo de parada</label><select onchange="avParadaCampo(${i},'tipo',this.value)" ${m.guardando||!puedeEditar?'disabled':''}>
      <option value="" ${!p.tipo?'selected':''}>Seleccionar…</option>
      <option value="PROGRAMADA" ${p.tipo==='PROGRAMADA'?'selected':''}>Programada</option>
      <option value="NO_PROGRAMADA" ${p.tipo==='NO_PROGRAMADA'?'selected':''}>No programada</option>
    </select></div>
    <div class="av-parada-motivo"><label>Motivo de parada</label><input ${p.tipo==='PROGRAMADA'?'list="av-paradas-catalogo"':''} value="${avEsc(p.descripcion||'')}" placeholder="${p.tipo==='NO_PROGRAMADA'?'Ej. Calibración envasadora':'Elige del catálogo o escribe'}" oninput="avParadaCampo(${i},'descripcion',this.value)" ${m.guardando||!puedeEditar?'disabled':''}></div>
    ${p.tipo==='NO_PROGRAMADA'?`<div class="av-parada-causa"><label>Causa</label><select onchange="avParadaCampo(${i},'causa',this.value)" ${m.guardando||!puedeEditar?'disabled':''}><option value="">Seleccionar…</option>${causas.map(c=>`<option value="${avEsc(c)}" ${p.causa===c?'selected':''}>${avEsc(c)}</option>`).join('')}</select></div>`:''}
    <div class="av-parada-min"><label>Minutos</label><input type="number" min="1" step="1" value="${avNum(p.minutos)||''}" oninput="avParadaCampo(${i},'minutos',this.value)" ${m.guardando||!puedeEditar?'disabled':''}></div>
    ${p.origen==='REGISTRO'?'':`<div class="av-parada-min"><label>Desde (opc.)</label><input type="time" value="${avEsc(p.horaInicio||'')}" onchange="avParadaHora(${i},'horaInicio',this.value)" ${m.guardando||!puedeEditar?'disabled':''}></div>
    <div class="av-parada-min"><label>Hasta (opc.)</label><input type="time" value="${avEsc(p.horaFin||'')}" onchange="avParadaHora(${i},'horaFin',this.value)" ${m.guardando||!puedeEditar?'disabled':''}></div>`}
    <button class="av-parada-remove" title="Quitar fila" onclick="avParadaQuitar(${i})" ${m.guardando||!puedeEditar?'disabled':''}>✕</button>
    <small>${p.origen==='REGISTRO'?'Origen: Nuevo registro':'Origen: Avance/Cierre'}${p.tipo?` · ${p.tipo==='PROGRAMADA'?'Programada':'No programada'}`:''}</small>
  </div>`).join('')||'<p class="small-muted">Sin paradas. Usa “+ Agregar otra”.</p>'}</div>
  <button class="btn btn-ghost av-parada-add" onclick="avParadaAgregarFila()" ${m.guardando||!puedeEditar?'disabled':''}>+ Agregar otra</button></div>
  <footer><div>Total de minutos <strong id="av-paradas-total">${avFmt(total)} min</strong></div><div><button class="btn btn-ghost" onclick="avCerrarParadas()" ${m.guardando?'disabled':''}>Cancelar</button><button class="btn btn-primary" onclick="avGuardarParadasModal()" ${m.guardando||!puedeEditar?'disabled':''}>${m.guardando?'Guardando…':'Guardar paradas'}</button></div></footer></div>`;
  modal.classList.add('open');document.body.classList.add('av-modal-open');
}
function avBuscarParadaRegistro(records,p){
  const ri=records.findIndex(r=>r?.id===p.recordId);if(ri<0)return null;
  const r=records[ri],cuadros=Array.isArray(r.cuadros)?r.cuadros:[];
  const q=cuadros[p.cuadroIndex];if(!q||!Array.isArray(q[p.key]))return null;
  let pi=p.paradaId?q[p.key].findIndex(x=>x?.id===p.paradaId):-1;
  if(pi<0)pi=p.index;
  if(pi<0||!q[p.key][pi])return null;
  return {r,q,pi,item:q[p.key][pi]};
}
function avConTimeout(promesa,ms=15000){
  return Promise.race([
    promesa,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error(
      'El guardado está tardando demasiado. Revisa tu conexión a internet y vuelve a abrir esta ventana para confirmar si Firestore recibió el cambio.'
    )),ms))
  ]);
}
async function avGuardarParadasModal(){
  const m=avanceEstado.paradasModal;if(!m||m.guardando||!avPuedeEditarParadas())return;
  const activas=m.filas.filter(p=>!p.eliminarSolicitado);
  const invalida=activas.find(p=>!['PROGRAMADA','NO_PROGRAMADA'].includes(p.tipo)||!String(p.descripcion||'').trim()||avNum(p.minutos)<=0||(p.tipo==='NO_PROGRAMADA'&&!String(p.causa||'').trim()));
  if(invalida){m.error='Completa Tipo, Motivo y Minutos. En una parada No programada también debes seleccionar la Causa.';avRenderParadasModal();return;}

  // Motivos que ya fueron registrados por botón en este turno: se avisa y no se suman dos veces.
  const duplicadas=avDuplicadosConBoton(m,activas);
  if(duplicadas.length){
    alert('Estas paradas ya fueron registradas con el botón de Producción Actual y NO se sumarán dos veces:\n\n- '+
      duplicadas.map(p=>`${p.descripcion} (${avNum(p.minutos)} min)`).join('\n- ')+
      '\n\nPuedes quitarlas, o indicar "Desde/Hasta" si es otra parada distinta.');
  }

  // Solo tocamos sync/records si realmente se está editando/eliminando
  // una parada cuyo origen es Nuevo registro. Las paradas creadas aquí
  // viven únicamente en sync/avancesTurno.
  const requiereRecords=m.filas.some(p=>p.origen==='REGISTRO');

  m.guardando=true;m.error='';avRenderParadasModal();
  try{
    const avancesRef=avRef(),recordsRef=db.collection('sync').doc('records');
    let resultado=null;

    const operacion=db.runTransaction(async tx=>{
      const adoc=await tx.get(avancesRef);
      const ad=adoc.exists?adoc.data():{};
      if(avNum(ad.updatedAt)!==avNum(m.baseAvancesUpdatedAt)){
        throw Error('Otro usuario modificó Avance/Cierre mientras tenías abierta la ventana. Vuelve a abrirla para revisar los cambios antes de guardar.');
      }

      let rd={},records=[];
      if(requiereRecords){
        const rdoc=await tx.get(recordsRef);
        rd=rdoc.exists?rdoc.data():{};
        if(avNum(rd.updatedAt)!==avNum(m.baseRecordsUpdatedAt)){
          throw Error('Otro usuario modificó Nuevo registro mientras tenías abierta la ventana. Vuelve a abrirla para revisar los cambios antes de guardar.');
        }
        records=Array.isArray(rd.items)?JSON.parse(JSON.stringify(rd.items)):[];
      }

      const operativas=Array.isArray(ad.paradasOperativas)?ad.paradasOperativas.slice():[];
      const ahora=Date.now(),usuario=state.user?.nombre||state.user?.username||'';

      if(requiereRecords){
        m.filas.forEach(p=>{
          if(p.origen!=='REGISTRO')return;
          const ref=avBuscarParadaRegistro(records,p);
          if(!ref)throw Error(`No se encontró una parada original de Nuevo registro (${p.descripcion||p.id}).`);
          if(p.eliminarSolicitado){
            ref.q[p.key].splice(ref.pi,1);
          }else{
            const destino=p.tipo==='PROGRAMADA'?'paradasProgramadas':'paradasNoProgramadas';
            const item={...ref.item,descripcion:String(p.descripcion).trim(),tiempoMin:avNum(p.minutos)};
            if(!item.id)item.id=p.id.startsWith('reg:')?`pr_${ahora}_${Math.random().toString(36).slice(2,7)}`:p.id;
            if(destino==='paradasNoProgramadas')item.causa=p.causa||'';else delete item.causa;
            if(p.key===destino)ref.q[p.key][ref.pi]=item;
            else{
              ref.q[p.key].splice(ref.pi,1);
              if(!Array.isArray(ref.q[destino]))ref.q[destino]=[];
              ref.q[destino].push(item);
            }
          }
          ref.r.actualizadoEn=ahora;ref.r.actualizadoPor=usuario;
        });
      }

      const idsModal=new Set(m.filas.filter(p=>p.origen==='AVANCE').map(p=>p.id));
      for(let i=operativas.length-1;i>=0;i--){
        const p=operativas[i];
        if(p.fecha===m.fecha&&avTurnoCanon(p.turno)===m.turno&&p.linea===m.linea&&!idsModal.has(p.id))operativas.splice(i,1);
      }

      m.filas.filter(p=>p.origen==='AVANCE'&&!p.eliminarSolicitado).forEach(p=>{
        const obj={...p,descripcion:String(p.descripcion).trim(),minutos:avNum(p.minutos),tipo:p.tipo,fecha:m.fecha,turno:m.turno,linea:m.linea,origen:'AVANCE',actualizadoPor:usuario,actualizadoEn:ahora};
        delete obj.nueva;delete obj.eliminarSolicitado;delete obj.tipoOriginal;
        const i=operativas.findIndex(x=>x.id===obj.id);
        if(i>=0){
          obj.creadoEn=operativas[i].creadoEn||ahora;obj.creadoPor=operativas[i].creadoPor||usuario;operativas[i]=obj;
        }else{
          obj.creadoEn=ahora;obj.creadoPor=usuario;operativas.push(obj);
        }
      });

      tx.set(avancesRef,{paradasOperativas:operativas,updatedAt:ahora},{merge:true});
      if(requiereRecords)tx.set(recordsRef,{items:records,updatedAt:ahora},{merge:true});
      return {operativas,updatedAt:ahora};
    });

    resultado=await avConTimeout(operacion,15000);

    // Reflejo inmediato local. onSnapshot confirmará después el mismo estado
    // en este y en los demás dispositivos.
    avanceEstado.paradasOperativas=resultado.operativas;
    avanceEstado.avancesUpdatedAt=resultado.updatedAt;
    m.baseAvancesUpdatedAt=resultado.updatedAt;

    // Firestore ya confirmó la escritura: liberar el estado antes de cerrar.
    // avCerrarParadas() bloquea el cierre mientras guardando=true.
    m.guardando=false;
    avAviso('Paradas guardadas correctamente.');
    avCerrarParadas();
    if(state.currentTab==='avance-produccion')avDibujar();
  }catch(e){
    console.error('Guardando paradas:',e);
    m.guardando=false;
    m.error=e?.message||'No se pudieron guardar las paradas.';
    avRenderParadasModal();
  }
}

function avEstadoOperacion(linea,marca,presentacion){
  const p=avProgramaciones().find(x=>x.linea===linea&&x.marca===marca&&x.presentacion===presentacion);
  return p?.estadoOperacion||{};
}
function avInicioLinea(linea){
  const horas=[];
  avRegistros().filter(r=>r.linea===linea).forEach(r=>(typeof normalizarCuadros==='function'?normalizarCuadros(r):(r.cuadros||[])).forEach(q=>{
    if(q?.horaInicio&&(q?.marca||avNum(q?.produccion?.efectiva)>0))horas.push(q.horaInicio);
  }));
  avProgramaciones().filter(p=>p.linea===linea).forEach(p=>{if(p?.estadoOperacion?.inicio)horas.push(avHoraDesdeMs(p.estadoOperacion.inicio));});
  return horas.sort()[0]||'';
}
function avFinLinea(linea){
  const horas=[];
  avRegistros().filter(r=>r.linea===linea).forEach(r=>(typeof normalizarCuadros==='function'?normalizarCuadros(r):(r.cuadros||[])).forEach(q=>{
    if(q?.horaFin&&q?.estadoCuadro==='FINALIZADO')horas.push(q.horaFin);
  }));
  avProgramaciones().filter(p=>p.linea===linea).forEach(p=>{if(p?.estadoOperacion?.finalizadaEn)horas.push(avHoraDesdeMs(p.estadoOperacion.finalizadaEn));});
  return horas.sort().slice(-1)[0]||'';
}

function avProductosLinea(linea,hora,tipo){
  const mapa=new Map();
  const agregar=(marca,presentacion)=>{
    if(!marca||!presentacion)return;
    const k=`${marca}|${presentacion}`;
    if(!mapa.has(k))mapa.set(k,{marca,presentacion,etiqueta:avPresentacion(linea,marca,presentacion)});
  };
  // Los cuadros históricos del turno son fuente de participación aunque ya estén FINALIZADOS.
  // No filtrar aquí por estado EN_CURSO: hacerlo ocultaría líneas/productos ya terminados.
  avRegistros().filter(r=>r.linea===linea).forEach(r=>(typeof normalizarCuadros==='function'?normalizarCuadros(r):(r.cuadros||[])).forEach(q=>agregar(q?.marca,q?.presentacion)));
  avProgramaciones().filter(p=>p.linea===linea).forEach(p=>agregar(p.marca,p.presentacion));
  avPaletas().filter(p=>p.linea===linea).forEach(p=>agregar(p.marca,p.presentacion));
  return [...mapa.values()].map(x=>{
    const prod=avProduccionHasta(linea,x.marca,x.presentacion,hora,tipo);
    return {...x,produccion:prod.valor,fuenteProduccion:prod.fuente};
  });
}

function avConsumoLinea(linea,productos,ratio){
  // Reutiliza consumo explícito si existe en registros futuros/legacy.
  const vals=[];
  avRegistros().filter(r=>r.linea===linea).forEach(r=>{
    ['consumo','consumoLH','consumoLh'].forEach(k=>{if(avNum(r[k])>0)vals.push(avNum(r[k]));});
  });
  if(vals.length)return vals.reduce((a,b)=>a+b,0)/vals.length;

  // Respaldo transparente: volumen ponderado por la producción * ratio.
  let litros=0,und=0;
  productos.forEach(x=>{
    const t=String(x.presentacion||'').toLowerCase();
    let m=t.match(/(\d+(?:[.,]\d+)?)\s*ml/),l=0;
    if(m)l=Number(m[1].replace(',','.'))/1000;
    else if((m=t.match(/(\d+(?:[.,]\d+)?)\s*l/)))l=Number(m[1].replace(',','.'));
    if(!l){if(linea==='B7L')l=7;else if(linea==='C20L'||linea==='B20L')l=20;}
    litros+=x.produccion*l;und+=x.produccion;
  });
  return und&&ratio?(litros/und)*ratio:0;
}


function avProgramadoLinea(linea){
  return avProgramaciones()
    .filter(p=>p.linea===linea)
    .reduce((s,p)=>{
      const cantidad=avNum(p.cantidadProgramada);
      if(avNum(p.unidadesPorPaleta)>0)return s+cantidad;
      if(typeof obtenerUnidadesPorPalet==='function'){
        return s+(cantidad*avNum(obtenerUnidadesPorPalet(p.linea,p.marca,p.presentacion)));
      }
      return s+cantidad;
    },0);
}
function avObservacionesLinea(linea){
  const out=[];
  avRegistros().filter(r=>r.linea===linea).forEach(r=>{
    [r.observaciones,r.observacion,r.observacionesGenerales].forEach(v=>{
      if(String(v||'').trim())out.push(String(v).trim());
    });
    (typeof normalizarCuadros==='function'?normalizarCuadros(r):(r.cuadros||[])).forEach(q=>{
      [q?.observaciones,q?.observacion].forEach(v=>{
        if(String(v||'').trim())out.push(String(v).trim());
      });
    });
  });
  return [...new Set(out)];
}

function avLineaSnapshot(linea,hora,tipo){
  const productos=avProductosLinea(linea,hora,tipo);
  const inicio=avInicioLinea(linea);
  const produccionTotal=productos.reduce((s,x)=>s+x.produccion,0);
  /*
     Una línea debe aparecer en Avance/Cierre si existe cualquiera
     de estas evidencias del turno:
     - inicio operativo,
     - producción registrada en Paletas,
     - programación,
     - o registros de Paletas aunque el corte seleccionado sea
       anterior a la hora del primer registro.

     Esto evita que PET1 desaparezca del reporte solo porque su
     producción fue registrada después de la hora de corte.
  */
  // IMPORTANTE:
  // Una línea NO desaparece del Avance/Cierre por haber sido FINALIZADA.
  // Si participó en este turno, se conserva en todos los avances posteriores
  // y en el cierre. Esto aplica también a CAJAS 20L.
  const tieneRegistroTurno=avRegistros().some(r=>{
    if(r?.linea!==linea)return false;
    const cuadros=typeof normalizarCuadros==='function'?normalizarCuadros(r):(r.cuadros||[]);
    return cuadros.some(q=>
      !!q?.horaInicio ||
      avNum(q?.produccion?.efectiva)>0 ||
      !!q?.marca ||
      !!q?.presentacion
    );
  });

  const actividad=
    !!inicio ||
    tieneRegistroTurno ||
    productos.some(x=>x.produccion>0) ||
    avProgramaciones().some(p=>p.linea===linea) ||
    avPaletas().some(p=>p.linea===linea);

  if(!actividad)return null;

  const corte=tipo==='CIERRE'?(avFinLinea(linea)||avCtx().fin):hora;
  const minTurno=inicio?avMinEntre(avanceEstado.fecha,inicio,corte,avanceEstado.turno):0;
  const paradas=avParadasLinea(linea,hora,tipo);
  const totalParadas=paradas.reduce((s,p)=>s+p.minutos,0);

  // Ratio del reporte (oficial: producido ÷ horas efectivas):
  // producción acumulada / horas efectivas.
  // Horas efectivas = tiempo transcurrido - paradas acumuladas.
  // También se descuentan DETENER LÍNEA y PAUSA PROGRAMADA (Producción Actual),
  // calculadas por la función central (23b-tiempos-linea.js) hasta este corte.
  // Las paradas del supervisor ya están en totalParadas: no se vuelven a sumar.
  // Se usa la función central: unifica supervisor + botones, fusiona solapes,
  // aplica duraciones estándar y evita contar dos veces un mismo motivo.
  let opNoProg=0,opProg=0,minutosEfectivos=Math.max(0,minTurno-totalParadas);
  if(typeof calcularTiemposLinea==='function'&&inicio){
    const T=calcularTiemposLinea(linea,avanceEstado.turno,avanceEstado.fecha,{
      inicioMs:avHoraMs(avanceEstado.fecha,inicio,avanceEstado.turno),
      finMs:avHoraMs(avanceEstado.fecha,corte,avanceEstado.turno)
    });
    if(T.ok){
      opNoProg=T.fuentes.boton.noProgramadas;
      opProg=T.fuentes.boton.programadas;
      minutosEfectivos=T.tiempoOperativoMin;
    }
  }
  const ratio=minutosEfectivos>0?produccionTotal/(minutosEfectivos/60):0;

  return {
    linea,nombre:AVANCE_NOMBRES[linea],inicio,
    fin:tipo==='CIERRE'?(avFinLinea(linea)||corte):'',
    productos,produccionTotal,
    programado:avProgramadoLinea(linea),
    cumplimiento:(GlacialIndicadores.cumplimiento(produccionTotal,avProgramadoLinea(linea))??0)*100,
    ratio,unidadRatio:avUnidadRatio(linea),
    consumo:avConsumoLinea(linea,productos,ratio),
    personal:avPersonalLinea(linea),paradas,totalParadas,
    paradasProgramadas:paradas.filter(p=>p.tipo==='PROGRAMADA').reduce((s,p)=>s+p.minutos,0),
    paradasNoProgramadas:paradas.filter(p=>p.tipo==='NO_PROGRAMADA').reduce((s,p)=>s+p.minutos,0),
    observaciones:avObservacionesLinea(linea),
    minutosTranscurridos:minTurno,minutosEfectivos,
    paradasOperacion:{noProgramadas:opNoProg,programadas:opProg},
    sinProduccion:produccionTotal<=0
  };
}

function avConstruirSnapshot(hora,tipo='AVANCE'){
  /*
     Las horas configuradas (09:00, 11:00, etc.) identifican el avance,
     pero el corte operativo es la hora REAL en que el supervisor lo genera.
  */
  const horaReal=tipo==='CIERRE'?avCtx().fin:avHoraActual();
  const lineas=AVANCE_LINEAS.map(l=>avLineaSnapshot(l,horaReal,tipo)).filter(Boolean);
  if(!lineas.length)throw Error('No existe producción ni una línea iniciada para este turno.');
  const totalParadas=lineas.reduce((s,l)=>s+l.totalParadas,0);
  const totalParadasProgramadas=lineas.reduce((s,l)=>s+avNum(l.paradasProgramadas),0);
  const totalParadasNoProgramadas=lineas.reduce((s,l)=>s+avNum(l.paradasNoProgramadas),0);
  const personalSet=lineas.reduce((s,l)=>s+l.personal,0);
  const totalPlanta=lineas.reduce((s,l)=>s+l.produccionTotal,0);
  const totalProgramado=lineas.reduce((s,l)=>s+avNum(l.programado),0);
  const cumplimiento=(GlacialIndicadores.cumplimiento(totalPlanta,totalProgramado)??0)*100;
  const ctx=avCtx();
  const snap={
    id:avSnapshotId(tipo,hora),fecha:avanceEstado.fecha,turno:avanceEstado.turno,
    tipo,horaCorte:horaReal,
    horaReferencia:tipo==='CIERRE'?'CIERRE':hora,
    inicioTurno:ctx.inicio,finTurno:ctx.fin,
    supervisor:avNombreUsuario(),generadoPor:state.user?.username||'',
    createdAt:Date.now(),createdBy:state.user?.username||'',
    generadoEn:Date.now(),estado:'GENERADO',lineas,
    resumen:{
      produccionTotal:totalPlanta,programado:totalProgramado,cumplimiento,
      faltante:Math.max(0,totalProgramado-totalPlanta),
      excedente:Math.max(0,totalPlanta-totalProgramado),
      totalParadas,totalParadasProgramadas,totalParadasNoProgramadas,
      personal:personalSet,lineasTrabajadas:lineas.length
    }
  };
  snap.texto=avTextoWhatsApp(snap);
  return snap;
}

function avProductoWhatsApp(p){
  const marca=String(p?.marca||'').trim();
  const codigo=String(p?.presentacion||'').toLowerCase();
  const conSticker=codigo.includes('sticker')||codigo.includes('(y)');
  return `${marca}${conSticker?' C/S':''}`;
}
function avUnidadProduccion(linea){
  if(linea==='C20L')return 'caj';
  if(linea==='B20L')return 'bid';
  return 'und';
}

function avClaveFormatoPresentacion(presentacion){
  /*
     Agrupa por FORMATO FÍSICO (volumen), no por variante comercial
     ni por cantidad de unidades del pack.

     Ejemplos:
       2.5L x6 normal + 2.5L x6 C/S => mismo bloque 2.5 L
       1L x6 + 1L x12              => mismo bloque 1 L
       1.5L y 1L                   => bloques distintos
  */
  let t=String(presentacion||'').toLowerCase().trim();
  if(!t)return 'SIN_PRESENTACION';

  t=t
    .replace(/sticker/g,'')
    .replace(/\(y\)/g,'')
    .replace(/c\s*\/\s*s/g,'')
    .replace(/con\s*sticker/g,'')
    .replace(/_/g,' ');

  // Primero ML para evitar confundir cadenas compactas.
  let m=t.match(/(\d+(?:[.,]\d+)?)\s*ml(?=\s|x|\/|_|-|$)/i);
  if(m)return `ML:${m[1].replace(',','.')}`;

  // Admite: 1Lx12und, 1.5 L, 7 Litros, 10 litros, 20L, etc.
  m=t.match(/(\d+(?:[.,]\d+)?)\s*l(?:itro|itros)?(?=\s|x|\/|_|-|$)/i);
  if(m)return `L:${m[1].replace(',','.')}`;

  if(t.includes('caja')&&t.includes('20'))return 'L:20';
  if((t.includes('bidon')||t.includes('bidón'))&&t.includes('20'))return 'L:20';

  return t.replace(/[_\s-]+/g,'');
}

function avVolumenFormatoPresentacion(presentacion,linea){
  const t=String(presentacion||'').toLowerCase().replace(/_/g,' ');

  let m=t.match(/(\d+(?:[.,]\d+)?)\s*ml(?=\s|x|\/|_|-|$)/i);
  if(m){
    const ml=Number(m[1].replace(',','.'));
    if(ml===1000)return '1 L';
    if(ml===1500)return '1.5 L';
    if(ml===2500)return '2.5 L';
    if(ml===7000)return '7 L';
    if(ml===10000)return '10 L';
    if(ml===20000)return '20 L';
    return `${ml} ML`;
  }

  m=t.match(/(\d+(?:[.,]\d+)?)\s*l(?:itro|itros)?(?=\s|x|\/|_|-|$)/i);
  if(m)return `${m[1].replace(',','.')} L`;

  if(linea==='C20L'||linea==='B20L')return '20 L';
  return '';
}

function avBloquesPresentacionLinea(l){
  const mapa=new Map();
  (l.productos||[]).filter(p=>avNum(p.produccion)>0).forEach(p=>{
    const clave=avClaveFormatoPresentacion(p.presentacion);
    if(!mapa.has(clave))mapa.set(clave,{
      claveFormato:clave,
      presentacion:p.presentacion||'',
      etiqueta:p.etiqueta||avPresentacion(l.linea,p.marca,p.presentacion),
      productos:[],inicio:'',fin:'',paradas:[],observaciones:[],produccionTotal:0,
      ratio:0,consumo:0,personal:l.personal
    });
    const b=mapa.get(clave);
    b.productos.push(p);
    b.produccionTotal+=avNum(p.produccion);
  });

  // Inicio/fin, paradas y observaciones se incorporan al bloque del mismo FORMATO.
  // Así Cuisine normal y Cuisine C/S de 2.5 L no crean dos secciones distintas.
  avRegistros().filter(r=>r.linea===l.linea).forEach(r=>{
    const cuadros=typeof normalizarCuadros==='function'?normalizarCuadros(r):(r.cuadros||[]);
    cuadros.forEach(q=>{
      const clave=avClaveFormatoPresentacion(q?.presentacion);
      const b=mapa.get(clave); if(!b)return;
      if(q?.horaInicio && (!b.inicio || q.horaInicio<b.inicio))b.inicio=q.horaInicio;
      if(q?.horaFin && (!b.fin || q.horaFin>b.fin))b.fin=q.horaFin;
      (q?.paradasProgramadas||[]).forEach(p=>{if(p?.descripcion&&avNum(p.tiempoMin)>0)b.paradas.push({descripcion:p.descripcion,minutos:avNum(p.tiempoMin),tipo:'PROGRAMADA'});});
      (q?.paradasNoProgramadas||[]).forEach(p=>{if(p?.descripcion&&avNum(p.tiempoMin)>0)b.paradas.push({descripcion:p.descripcion,minutos:avNum(p.tiempoMin),tipo:'NO_PROGRAMADA'});});
      [q?.observaciones,q?.observacion].forEach(v=>{if(String(v||'').trim())b.observaciones.push(String(v).trim());});
    });
  });

  [...mapa.values()].forEach(b=>{
    /*
       Para producción proveniente de Paletas puede no existir horaInicio
       dentro del cuadro de Nuevo registro. En ese caso usamos el inicio
       real de la línea (l.inicio), que ya es el mismo que se muestra en
       el avance. Sin este respaldo el texto mostraba "Inicio: 07:00",
       pero internamente calculaba 0 minutos y Ratio/Consumo quedaban en —.

       Las paradas del bloque + las paradas operativas de Avance/Cierre
       se descuentan una sola vez para calcular las horas efectivas.
    */
    const inicioCalculo=b.inicio||l.inicio||'';
    const fin=b.fin||l.fin||avanceEstado.horaCorte||avHoraActual();

    const paradasOperativas=(l.paradas||[])
      .filter(p=>p.origen==='AVANCE')
      .reduce((s,p)=>s+avNum(p.minutos),0);

    b.totalParadas=b.paradas.reduce((a,p)=>a+avNum(p.minutos),0);
    const totalParadasCalculo=b.totalParadas+paradasOperativas;

    const min=inicioCalculo
      ? avMinEntre(avanceEstado.fecha,inicioCalculo,fin,avanceEstado.turno)
      : 0;

    const horasEf=GlacialIndicadores.horasEfectivas({transcurridoMin:min,paradasProgramadasMin:0,paradasNoProgramadasMin:totalParadasCalculo});

    b.inicio=b.inicio||inicioCalculo;
    b.ratio=GlacialIndicadores.ratio(b.produccionTotal,horasEf) ?? 0;

    b.consumo=avConsumoLinea(
      l.linea,
      b.productos,
      b.ratio
    );

    b.observaciones=[...new Set(b.observaciones)];
  });
  return [...mapa.values()].sort((a,b)=>String(a.inicio||'99:99').localeCompare(String(b.inicio||'99:99')));
}

function avTituloPresentacion(linea,b){
  const volumen=avVolumenFormatoPresentacion(b?.presentacion,linea);
  if(volumen)return `${AVANCE_NOMBRES[linea]||linea} – ${volumen}`;

  const etiqueta=String(b?.etiqueta||'').trim();
  if(!etiqueta)return AVANCE_NOMBRES[linea]||linea;
  const m=etiqueta.match(/\b(\d+(?:[.,]\d+)?)\s*L\b/i);
  const pres=m?`${m[1].replace(',','.')} L`:etiqueta.replace(/\s*C\/S\s*/gi,'').trim();
  return `${AVANCE_NOMBRES[linea]||linea} – ${pres}`;
}

function avTextoWhatsApp(s){
  const fecha=s.fecha.split('-').reverse().join('/');
  const out=[
    `*${s.tipo==='CIERRE'?'CIERRE DE PRODUCCIÓN':'AVANCE DE PRODUCCIÓN'} – TURNO ${s.turno}*`,
    '',`*Fecha: ${fecha}*`,`*Hora: ${s.horaCorte}*`];

  s.lineas.forEach((l,idxLinea)=>{
    const bloques=avBloquesPresentacionLinea(l);
    if(!bloques.length){
      out.push('',`*${l.nombre}*`,'',`Inicio: ${l.inicio||'—'}`,'','Línea iniciada – Sin producción registrada.','',
        'Ratio: —','Consumo: —',`Personal en línea: ${l.personal}`,'','*PARADAS*','',
        l.paradas.length?l.paradas.map(p=>`${p.descripcion} – ${avFmt(p.minutos)} min`).join('\n'):'Sin paradas registradas.','',
        `Total paradas: ${avFmt(l.totalParadas)} min`);
    }else{
      bloques.forEach((b,idxBloque)=>{
        out.push('',`*${avTituloPresentacion(l.linea,b)}*`,'',`Inicio: ${b.inicio||l.inicio||'—'}`);
        if(s.tipo==='CIERRE')out.push(`Término: ${b.fin||l.fin||'—'}`);
        out.push('');
        b.productos.forEach(p=>out.push(`${avProductoWhatsApp(p)}: ${avFmt(p.produccion)} ${avUnidadProduccion(l.linea)}`));
        out.push('',`Ratio: ${b.ratio?avFmt(b.ratio)+' '+l.unidadRatio:'—'}`,
          `Consumo: ${b.consumo?avFmt(b.consumo)+' L/H':'—'}`,
          `Personal en línea: ${b.personal}`,
          '',`Producción total: ${avFmt(b.produccionTotal)} ${avUnidadProduccion(l.linea)}`);

        /*
           PARADAS UNIFICADAS:
           - Las de Nuevo registro pertenecientes a esta presentación.
           - Las agregadas desde Avance/Cierre se muestran una sola vez
             en el primer bloque de la línea.
           Así nunca aparecen dos títulos: PARADAS / PARADAS GENERALES.
        */
        const paradasMostrar=[...(b.paradas||[])];
        if(idxBloque===0){
          paradasMostrar.push(...(l.paradas||[]).filter(p=>p.origen==='AVANCE'));
        }
        const totalParadasMostrar=paradasMostrar.reduce((s,p)=>s+avNum(p.minutos),0);

        out.push('','*PARADAS*','');
        if(paradasMostrar.length){
          paradasMostrar.forEach(p=>out.push(`${p.descripcion} – ${avFmt(p.minutos)} min`));
        }else{
          out.push('Sin paradas registradas.');
        }
        out.push('',`Total paradas: ${avFmt(totalParadasMostrar)} min`);

        if(b.observaciones.length){out.push('','*OBSERVACIONES*');b.observaciones.forEach(o=>out.push(`- ${o}`));}
        // Separación entre presentaciones de la misma línea. NO se genera "TOTAL PET2".
        if(idxBloque<bloques.length-1)out.push('','---');
      });
    }
    if(idxLinea<s.lineas.length-1)out.push('','---');
  });

  // El texto de WhatsApp termina con la última línea trabajada.
  // Se elimina TOTAL PLANTA / RESUMEN GENERAL DEL TURNO tanto en AVANCE como en CIERRE.
  out.push('','','Generado por:',s.supervisor||s.generadoPor||'—','','GLACIAL - Control de Producción');
  return out.join('\n');
}

async function avGuardarSnapshot(s){
  const ref=avRef();
  await db.runTransaction(async tx=>{
    const doc=await tx.get(ref);
    const arr=doc.exists&&Array.isArray(doc.data().items)?doc.data().items.slice():[];
    const idx=arr.findIndex(x=>x.id===s.id);
    if(idx>=0){
      throw Error(s.tipo==='CIERRE'
        ?'El cierre de este turno ya fue generado.'
        :`El avance ${s.horaReferencia} de este turno ya fue generado.`);
    }
    arr.push(s);
    tx.set(ref,{items:arr,updatedAt:Date.now()},{merge:true});
  });
  avanceEstado.preview=s.texto;
}


function avPuedeGenerar(){
  if(!state?.user || !tienePermiso('avanceProduccion'))return false;
  if(typeof esUsuarioSoloConsulta==='function' && esUsuarioSoloConsulta(state.user))return false;
  return true;
}
function avSlotsTurno(turno){
  // Solo referencias visuales/documentales. No restringen la generación.
  return turno==='NOCHE'?['01:00','03:00','05:00','07:00']:['09:00','11:00','13:00','15:00','17:00','19:00'];
}
function avSlotActual(){ return avHoraActual(); }
function avSnapshotPorReferencia(tipo,ref){
  return avanceEstado.snapshots.find(s=>s.tipo===tipo&&(tipo==='CIERRE'||s.horaReferencia===ref))||null;
}
async function avGenerar(hora,tipo='AVANCE'){
  try{
    if(!avPuedeGenerar())throw Error('Tu usuario tiene acceso de consulta y no puede generar avances o cierres.');
    const ctx=avCtx();
    avanceEstado.fecha=ctx.fecha;
    avanceEstado.turno=ctx.turno;
    const referencia=tipo==='CIERRE'?'CIERRE':avHoraActual();
    // Solo el CIERRE es único por turno. Los AVANCES son libres e ilimitados.
    if(tipo==='CIERRE' && avUltimoSnapshot('CIERRE')){
      throw Error('El cierre de este turno ya existe.');
    }
    const s=avConstruirSnapshot(referencia,tipo);
    await avGuardarSnapshot(s);
    avanceEstado.preview=s.texto||'';
    avanceEstado.previewId=s.id;
    avAviso(tipo==='CIERRE'?'Cierre generado correctamente.':'Avance generado correctamente.');
    // Envío automático a Google Sheets (no bloquea ni afecta el cierre si falla).
    if(tipo==='CIERRE'&&typeof sheetsEnviarCierre==='function')sheetsEnviarCierre(s,{automatico:true});
  }catch(e){
    console.error(e);
    alert(e.message||'No se pudo generar el avance.');
  }
}
async function avCopiar(id){
  const s=avanceEstado.todosSnapshots.find(x=>x.id===id)||avanceEstado.snapshots.find(x=>x.id===id);
  if(!s)return;
  const texto=s.texto||avTextoWhatsApp(s);
  try{await navigator.clipboard.writeText(texto);}
  catch{
    const ta=document.createElement('textarea');
    ta.value=texto;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
  }
  avAviso(s.tipo==='CIERRE'?'Cierre copiado correctamente.':'Avance copiado correctamente.');
}
function avVer(id){
  const s=avanceEstado.todosSnapshots.find(x=>x.id===id)||avanceEstado.snapshots.find(x=>x.id===id);
  if(!s)return;
  avanceEstado.preview=s.texto||avTextoWhatsApp(s);
  avanceEstado.previewId=s.id;
  avAbrirDetalle(s);
}
function avAviso(t){
  const e=document.getElementById('av-estado');
  if(e)e.textContent=t;
  const f=document.getElementById('av-float-estado');
  if(f)f.textContent=t;
}
function avAplicarSeleccion(){
  avanceEstado.snapshots=avanceEstado.todosSnapshots.filter(x=>
    x.fecha===avanceEstado.fecha&&x.turno===avanceEstado.turno
  );
}
function avEscuchar(){
  if(avanceEstado.unsubscribe)avanceEstado.unsubscribe();
  avanceEstado.unsubscribe=avRef().onSnapshot(doc=>{
    const data=doc.exists?doc.data():{};
    avanceEstado.todosSnapshots=Array.isArray(data.items)?data.items:[];
    avanceEstado.paradasOperativas=Array.isArray(data.paradasOperativas)?data.paradasOperativas:[];
    avanceEstado.avancesUpdatedAt=avNum(data.updatedAt);
    avAplicarSeleccion();
    if(state.currentTab==='avance-produccion')avDibujar();
    avInstalarBotonFlotante();
    if(document.getElementById('av-float-modal')?.classList.contains('open'))avDibujarFlotante();
  },e=>{
    console.error('Avances turno:',e);
    avAviso('No se pudo sincronizar el historial de avances.');
  });
}
// Al cerrar sesión se cierra la escucha de avances y se vacían los datos en memoria.
if(window.glacialCierresSesion)window.glacialCierresSesion.push(()=>{
  if(typeof avanceEstado.unsubscribe==='function'){try{avanceEstado.unsubscribe();}catch(_){/* ya cerrada */}}
  avanceEstado.unsubscribe=null;
  avanceEstado.todosSnapshots=[];avanceEstado.snapshots=[];avanceEstado.paradasOperativas=[];
});
function avUltimoSnapshot(tipo){
  return avanceEstado.snapshots.filter(x=>x.tipo===tipo).slice()
    .sort((a,b)=>avNum(b.generadoEn)-avNum(a.generadoEn))[0]||null;
}
function avFechaBonita(fecha){
  if(!fecha)return '—';
  const d=new Date(fecha+'T12:00:00');
  return d.toLocaleDateString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function avTurnoHorario(turno,s){
  if(s?.inicioTurno||s?.finTurno)return `${s.inicioTurno||'—'} - ${s.finTurno||'—'}`;
  return turno==='NOCHE'?'22:00 - 07:00':turno==='INTERMEDIO'?'15:00 - 22:00':'07:00 - 15:00';
}
function avEstadoSlots(){
  return avanceEstado.snapshots.filter(s=>s.tipo==='AVANCE').slice().sort((a,b)=>avNum(a.generadoEn)-avNum(b.generadoEn));
}
function avProximoAvance(){ return 'Cuando lo necesites'; }

function avAbrirFlotante(){
  avInstalarEstilos();
  const ctx=avCtx();
  avanceEstado.fecha=ctx.fecha;
  avanceEstado.turno=ctx.turno;
  if(!avanceEstado.mesCalendario)avanceEstado.mesCalendario=ctx.fecha.slice(0,7);
  if(!avanceEstado.unsubscribe)avEscuchar(); else avAplicarSeleccion();
  let modal=document.getElementById('av-float-modal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='av-float-modal';
    modal.className='av-float-modal';
    modal.addEventListener('click',e=>{if(e.target===modal)avCerrarFlotante();});
    document.body.appendChild(modal);
  }
  modal.classList.add('open');
  document.body.classList.add('av-modal-open');
  avDibujarFlotante();
}
function avCerrarFlotante(){
  document.getElementById('av-float-modal')?.classList.remove('open');
  if(!document.querySelector('.av-detail-modal.open,.av-image-modal.open'))document.body.classList.remove('av-modal-open');
}
function avDibujarFlotante(){
  const modal=document.getElementById('av-float-modal');
  if(!modal)return;
  const ctx=avCtx(),ultimo=avUltimoSnapshot('AVANCE'),cierre=avUltimoSnapshot('CIERRE');
  const slots=avEstadoSlots();
  modal.innerHTML=`
    <div class="av-float-dialog" role="dialog" aria-modal="true" aria-label="Avance y cierre de turno">
      <header class="av-float-head">
        <div>
          <span class="av-eyebrow">CONTROL OPERATIVO</span>
          <h2>AVANCE Y CIERRE DE TURNO</h2>
          <p>${avFechaBonita(ctx.fecha)} · ${avEsc(ctx.turno)} · ${avEsc(avTurnoHorario(ctx.turno))}</p>
          <p>Supervisor: <b>${avEsc(avNombreUsuario()||'—')}</b></p>
        </div>
        <button class="av-float-x" onclick="avCerrarFlotante()" aria-label="Cerrar">✕</button>
      </header>
      <div class="av-float-body">
        <section class="av-shift-status">
          <div><small>TURNO ACTUAL</small><strong>${avEsc(ctx.turno)}</strong><span>${avEsc(avTurnoHorario(ctx.turno))}</span></div>
          <div><small>GENERACIÓN LIBRE</small><strong>En cualquier momento</strong><span>${slots.length} avance(s) guardado(s)</span></div>
        </section>
        <div class="av-slot-strip">
          ${slots.slice(-5).map(x=>`<div class="done"><b>${avEsc(x.horaCorte||x.horaReferencia||'—')}</b><span>✓ Avance</span></div>`).join('') || '<div class="pending"><b>AHORA</b><span>○ Sin avances todavía</span></div>'}
          <div class="${cierre?'done':'pending'}"><b>CIERRE</b><span>${cierre?'✓ Generado':'○ Pendiente'}</span></div>
        </div>
        ${avPuedeGenerar()?`<div class="av-float-actions">
          <button class="btn btn-primary" onclick="avGenerarAhora()">GENERAR AVANCE AHORA</button>
          <button class="btn btn-ghost" onclick="avAbrirParadas()">+ AGREGAR PARADAS</button>
          <button class="btn btn-ghost" onclick="avGenerarCierreAhora()">GENERAR CIERRE DE TURNO</button>
        </div>`:`<div class="av-readonly">Modo consulta: puedes ver, copiar y generar imagen de los registros existentes.</div>`}
        <section class="av-float-last">
          <div class="av-float-last-head"><div><small>ÚLTIMO AVANCE</small><strong>${ultimo?`${ultimo.horaReferencia||ultimo.horaCorte} · GENERADO`:'Todavía no generado'}</strong></div></div>
          ${ultimo?avAccionesSnapshot(ultimo,true):''}
        </section>
        <section class="av-float-last">
          <div class="av-float-last-head"><div><small>CIERRE DEL TURNO</small><strong>${cierre?`${cierre.horaCorte||ctx.fin} · GENERADO`:`${ctx.fin} · PENDIENTE`}</strong></div></div>
          ${cierre?avAccionesSnapshot(cierre,true):''}
        </section>
        <div id="av-float-estado" class="av-inline-status"></div>
      </div>
      <footer class="av-float-footer"><span>GLACIAL · Control de Producción</span><button class="btn btn-ghost btn-sm" onclick="avCerrarFlotante()">CERRAR</button></footer>
    </div>`;
}
function avAccionesSnapshot(s,flotante=false){
  return `<div class="av-float-last-actions">
    <button class="btn btn-ghost btn-sm" onclick="avVer('${s.id}')">VER</button>
    <button class="btn btn-primary btn-sm" onclick="avCopiar('${s.id}')">📋 COPIAR TEXTO</button>
    <button class="btn btn-ghost btn-sm" onclick="avGenerarImagen('${s.id}')">🖼 GENERAR IMAGEN</button>
    ${s.tipo==='CIERRE'?`<button class="btn btn-ghost btn-sm" onclick="wspEnviarCierre('${s.id}')">📲 Enviar por WhatsApp</button>
    <button class="btn btn-ghost btn-sm" onclick="sheetsReenviarCierre('${s.id}')">Enviar a Google Sheets</button>`:''}
  </div>`;
}
async function avGenerarAhora(){
  await avGenerar(avHoraActual(),'AVANCE');
  avDibujarFlotante();
}
async function avGenerarCierreAhora(){
  if(!confirm('¿Deseas generar el cierre definitivo del turno?'))return;
  await avGenerar('CIERRE','CIERRE');
  avDibujarFlotante();
}
function avVerFlotante(id){avVer(id);}

function avAbrirDetalle(s){
  let modal=document.getElementById('av-detail-modal');
  if(!modal){
    modal=document.createElement('div');modal.id='av-detail-modal';modal.className='av-detail-modal';
    modal.addEventListener('click',e=>{if(e.target===modal)avCerrarDetalle();});
    document.body.appendChild(modal);
  }
  const r=s.resumen||{};
  modal.innerHTML=`<div class="av-detail-dialog">
    <header class="av-detail-head"><div><small>${s.tipo==='CIERRE'?'CIERRE DE PRODUCCIÓN':'AVANCE DE PRODUCCIÓN'}</small><h2>${avFechaBonita(s.fecha)} · ${avEsc(s.turno)} · ${avEsc(s.horaCorte||'')}</h2></div><button onclick="avCerrarDetalle()">✕</button></header>
    <div class="av-detail-body">
      <div class="av-detail-tabs"><button onclick="avIrDetalle('avd-resumen')">RESUMEN</button><button onclick="avIrDetalle('avd-produccion')">PRODUCCIÓN</button><button onclick="avIrDetalle('avd-paradas')">PARADAS</button><button onclick="avIrDetalle('avd-personal')">PERSONAL</button><button onclick="avIrDetalle('avd-observaciones')">OBSERVACIONES</button></div>
      <section id="avd-resumen" class="av-detail-kpis">
        <div><small>PRODUCCIÓN</small><strong>${avFmt(r.produccionTotal)}</strong><span>UND equivalentes</span></div>
        <div><small>PROGRAMADO</small><strong>${avFmt(r.programado)}</strong><span>Meta del turno</span></div>
        <div><small>CUMPLIMIENTO</small><strong>${avNum(r.cumplimiento).toFixed(1)}%</strong><span>${r.faltante?`Faltan ${avFmt(r.faltante)}`:`Excedente ${avFmt(r.excedente)}`}</span></div>
        <div><small>PARADAS</small><strong>${avFmt(r.totalParadas)} min</strong><span>P ${avFmt(r.totalParadasProgramadas)} · NP ${avFmt(r.totalParadasNoProgramadas)}</span></div>
        <div><small>PERSONAL</small><strong>${avFmt(r.personal)}</strong><span>Registrado</span></div>
      </section>
      <section id="avd-produccion" class="av-detail-section"><h3>Producción por línea</h3>
        ${(s.lineas||[]).map(l=>`<article class="av-line-card"><div class="av-line-title"><strong>${avEsc(l.nombre||l.linea)}</strong><b>${avFmt(l.produccionTotal)} ${avUnidadProduccion(l.linea).toUpperCase()}</b></div>
        <div class="av-line-metrics"><span>Inicio <b>${avEsc(l.inicio||'—')}</b></span><span>Ratio <b>${l.ratio?avFmt(l.ratio)+' '+l.unidadRatio:'—'}</b></span><span>Consumo <b>${l.consumo?avFmt(l.consumo)+' L/H':'—'}</b></span><span>Personal <b>${avFmt(l.personal)}</b></span></div>
        <div class="av-products">${(l.productos||[]).filter(p=>p.produccion>0).map(p=>`<span>${avEsc(p.marca)} · ${avEsc(p.etiqueta)} <b>${avFmt(p.produccion)}</b></span>`).join('')||'<span>Sin producción registrada</span>'}</div></article>`).join('')}
      </section>
      <section id="avd-paradas" class="av-detail-section"><h3>Paradas</h3>
        ${(s.lineas||[]).filter(l=>(l.paradas||[]).length).map(l=>`<article class="av-stop-line"><strong>${avEsc(l.nombre||l.linea)}</strong>${l.paradas.map(p=>`<div><span class="${p.tipo==='NO_PROGRAMADA'?'np':'p'}">${p.tipo==='NO_PROGRAMADA'?'NO PROGRAMADA':'PROGRAMADA'}</span><b>${avEsc(p.descripcion)}</b><em>${avFmt(p.minutos)} min</em></div>`).join('')}</article>`).join('')||'<p class="small-muted">Sin paradas registradas.</p>'}
      </section>
      <section id="avd-personal" class="av-detail-section"><h3>Personal</h3><div class="av-personal-grid">${(s.lineas||[]).map(l=>`<div><span>${avEsc(l.nombre||l.linea)}</span><b>${avFmt(l.personal)}</b></div>`).join('')}</div></section>
      <section id="avd-observaciones" class="av-detail-section"><h3>Observaciones</h3>${(s.lineas||[]).filter(l=>(l.observaciones||[]).length).map(l=>`<div class="av-observation"><b>${avEsc(l.nombre||l.linea)}</b>${l.observaciones.map(o=>`<p>${avEsc(o)}</p>`).join('')}</div>`).join('')||'<p class="small-muted">Sin observaciones registradas.</p>'}</section>
      <details class="av-whatsapp-preview"><summary>VER TEXTO PARA WHATSAPP</summary><textarea readonly>${avEsc(s.texto||avTextoWhatsApp(s))}</textarea></details>
    </div>
    <footer class="av-detail-footer">${avAccionesSnapshot(s)}<button class="btn btn-ghost btn-sm" onclick="avCerrarDetalle()">CERRAR</button></footer>
  </div>`;
  modal.classList.add('open');document.body.classList.add('av-modal-open');
}
function avCerrarDetalle(){
  document.getElementById('av-detail-modal')?.classList.remove('open');
  if(!document.querySelector('.av-float-modal.open,.av-image-modal.open'))document.body.classList.remove('av-modal-open');
}
function avIrDetalle(id){document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'});}

/*
  ============================================================
  TAMAÑO DE LETRAS — IMAGEN AVANCE / CIERRE
  ============================================================
  MODIFICA SOLO ESTE VALOR si quieres cambiar todas las letras:
  1.00 = original | 1.20 = +20% | 1.25 = +25% | 1.30 = +30% | 1.40 = +40%
*/
const AV_IMAGEN_ESCALA_TEXTO = 1.25;

function avCanvasSnapshot(s){
  const W=1080, PAD=28;
  const BLUE='#005B96',DARK='#003B5C',INK='#172B3A',STEEL='#667784',MUTED='#87949D',BG='#F3F6F8',LINE='#DCE3E8',WHITE='#FFFFFF',GOOD='#2E8B57',WARN='#D89216',BAD='#C0392B';

  /*
     IMPORTANTE:
     La imagen usa EXACTAMENTE la misma agrupación física que el texto:
       LÍNEA -> FORMATO FÍSICO -> MARCAS.
     Ejemplos:
       PET1 2.5 L: Cuisine + Cuisine C/S + Scala = UN SOLO BLOQUE.
       PET2 1.5 L y PET2 1 L = DOS BLOQUES DISTINTOS.
  */
  const grupos=[];
  (s.lineas||[]).forEach(l=>{
    const bloques=avBloquesPresentacionLinea(l);
    if(bloques.length){
      bloques.forEach(b=>grupos.push({linea:l,bloque:b,sinProduccion:false}));
    }else{
      grupos.push({linea:l,bloque:null,sinProduccion:true});
    }
  });

  const altoGrupo=g=>{
    if(g.sinProduccion){
      const paradas=Math.max(1,(g.linea.paradas||[]).length);
      const obs=(g.linea.observaciones||[]).length;
      return 170+30+paradas*30+(obs?55+obs*27:0);
    }
    const b=g.bloque;
    const productos=Math.max(1,(b.productos||[]).length);
    const paradas=Math.max(1,(b.paradas||[]).length);
    const obs=(b.observaciones||[]).length;
    return 170+productos*34+paradas*30+(obs?55+obs*27:0);
  };

  /*
     ALTURA REAL DE LA IMAGEN
     ------------------------
     Antes el canvas calculaba su alto usando solo las paradas propias del bloque.
     Después, al dibujar, se agregaban también las paradas operativas de Avance/Cierre.
     Resultado: las tarjetas crecían, pero el canvas NO; las últimas líneas
     (por ejemplo CAJAS 20L) quedaban recortadas aunque sí existieran en el snapshot/texto.

     Calculamos aquí exactamente la misma altura que se usará al dibujar cada tarjeta.
  */
  const altoRealGrupo=g=>{
    const l=g.linea,b=g.bloque;
    const prods=g.sinProduccion?[]:(b?.productos||[]);
    const paradasBloque=g.sinProduccion?(l.paradas||[]):(b?.paradas||[]);
    const paradasOperativas=g.sinProduccion?[]:(l.paradas||[]).filter(p=>p.origen==='AVANCE');
    const paradas=[...paradasBloque,...paradasOperativas];
    const observaciones=g.sinProduccion?(l.observaciones||[]):(b?.observaciones||[]);
    const escalaEspacio=Math.max(1,AV_IMAGEN_ESCALA_TEXTO);
    // ESPACIADO VERTICAL: aumenta junto con la letra para evitar superposición y recortes.
    const hNecesario=205+
      (prods.length||1)*30*escalaEspacio+
      (paradas.length||1)*29*escalaEspacio+
      (observaciones.length?(55+observaciones.length*22)*escalaEspacio:0);
    return Math.max(altoGrupo(g),hNecesario);
  };

  const H=Math.max(1350,250+grupos.reduce((a,g)=>a+altoRealGrupo(g)+18,0)+180);
  const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  const rr=(cx,cy,cw,ch,r=10)=>{x.beginPath();x.moveTo(cx+r,cy);x.arcTo(cx+cw,cy,cx+cw,cy+ch,r);x.arcTo(cx+cw,cy+ch,cx,cy+ch,r);x.arcTo(cx,cy+ch,cx,cy,r);x.arcTo(cx,cy,cx+cw,cy,r);x.closePath();};
  const card=(cx,cy,cw,ch,fill=WHITE,stroke=LINE)=>{x.fillStyle=fill;rr(cx,cy,cw,ch,9);x.fill();x.strokeStyle=stroke;x.lineWidth=1;rr(cx,cy,cw,ch,9);x.stroke();};
  const fit=(txt,max,size=18,weight='400')=>{
    // También respeta AV_IMAGEN_ESCALA_TEXTO al ajustar textos largos.
    let z=Math.round(size*AV_IMAGEN_ESCALA_TEXTO);
    const minimo=Math.max(10,Math.round(10*AV_IMAGEN_ESCALA_TEXTO));
    do{x.font=`${weight} ${z}px Arial`;z--;}while(z>minimo&&x.measureText(String(txt)).width>max);
    return x.font;
  };
  const divider=(y)=>{x.strokeStyle=LINE;x.beginPath();x.moveTo(PAD+18,y);x.lineTo(W-PAD-18,y);x.stroke();};
  const wrap=(txt,maxWidth)=>{const words=String(txt||'').split(/\s+/);const rows=[];let row='';for(const w of words){const test=row?row+' '+w:w;if(x.measureText(test).width>maxWidth&&row){rows.push(row);row=w;}else row=test;}if(row)rows.push(row);return rows;};

  x.fillStyle=BG;x.fillRect(0,0,W,H);
  x.fillStyle=DARK;x.fillRect(0,0,W,205);
  x.fillStyle=WHITE;x.font=`700 ${Math.round(31*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText('GLACIAL',55,56);
  x.font=`700 ${Math.round(40*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText(s.tipo==='CIERRE'?'CIERRE DE PRODUCCIÓN':'AVANCE DE PRODUCCIÓN',275,62);
  x.font=`700 ${Math.round(26*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText(`TURNO ${s.turno}`,275,101);
  x.font=`${Math.round(19*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText(`Fecha: ${avFechaBonita(s.fecha)}`,55,154);x.fillText(`Hora: ${s.horaCorte||'—'}`,330,154);
  x.font=`${Math.round(16*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillStyle='#D9EAF3';x.fillText(`Horario del turno: ${avTurnoHorario(s.turno,s)}`,55,184);

  let y=228;
  x.fillStyle=BLUE;rr(PAD,y,W-PAD*2,48,8);x.fill();x.fillStyle=WHITE;x.font=`700 ${Math.round(22*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText('DETALLE DE PRODUCCIÓN POR FORMATO',48,y+31);y+=64;

  grupos.forEach(g=>{
    const l=g.linea,b=g.bloque;
    const prods=g.sinProduccion?[]:(b.productos||[]);
    const paradasBloque=g.sinProduccion?(l.paradas||[]):(b.paradas||[]);
    const paradasOperativas=g.sinProduccion?[]:(l.paradas||[]).filter(p=>p.origen==='AVANCE');
    const paradas=[...paradasBloque,...paradasOperativas];
    const observaciones=g.sinProduccion?(l.observaciones||[]):(b.observaciones||[]);
    const produccionTotal=g.sinProduccion?0:b.produccionTotal;
    const inicio=g.sinProduccion?(l.inicio||'—'):(b.inicio||l.inicio||'—');
    const ratio=g.sinProduccion?0:b.ratio;
    const consumo=g.sinProduccion?0:b.consumo;
    const personal=g.sinProduccion?l.personal:b.personal;
    const totalParadas=paradas.reduce((s,p)=>s+avNum(p.minutos),0);
    const titulo=g.sinProduccion?(l.nombre||l.linea):avTituloPresentacion(l.linea,b);
    // Usar exactamente el mismo cálculo empleado para dimensionar el canvas.
    // Así ninguna línea finalizada queda fuera de la imagen por recorte vertical.
    const h=altoRealGrupo(g);

    card(PAD,y,W-PAD*2,h);
    x.fillStyle='#EAF5FC';rr(PAD,y,W-PAD*2,58,9);x.fill();
    x.fillStyle=DARK;x.font=`700 ${Math.round(25*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText(titulo,PAD+20,y+37);
    x.textAlign='right';x.fillStyle=g.sinProduccion?WARN:GOOD;x.font=`700 ${Math.round(15*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText(g.sinProduccion?'LÍNEA INICIADA':'PRODUCCIÓN REGISTRADA',W-PAD-20,y+35);x.textAlign='left';

    let cy=y+82;
    const metrics=[
      ['Inicio',inicio],
      ['Producción',`${avFmt(produccionTotal)} ${avUnidadProduccion(l.linea).toUpperCase()}`],
      ['Ratio',ratio?`${avFmt(ratio)} ${l.unidadRatio}`:'—'],
      ['Consumo',consumo?`${avFmt(consumo)} L/H`:'—'],
      ['Personal',avFmt(personal)]
    ],mw=(W-PAD*2-40)/5;
    metrics.forEach((m,i)=>{const mx=PAD+20+i*mw;x.fillStyle=STEEL;x.font=`${Math.round(13*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText(m[0],mx,cy);x.fillStyle=INK;fit(m[1],mw-12,17,'700');x.fillText(m[1],mx,cy+24);});
    cy+=55;divider(cy);cy+=27;

    x.fillStyle=BLUE;x.font=`700 ${Math.round(15*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText('MARCAS PRODUCIDAS',PAD+20,cy);cy+=Math.round(26*Math.max(1,AV_IMAGEN_ESCALA_TEXTO));
    if(prods.length){
      prods.forEach(p=>{
        x.fillStyle=INK;x.font=`700 ${Math.round(16*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText(avProductoWhatsApp(p),PAD+28,cy);
        x.textAlign='right';x.fillStyle=DARK;x.font=`700 ${Math.round(16*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText(`${avFmt(p.produccion)} ${avUnidadProduccion(l.linea).toUpperCase()}`,W-PAD-22,cy);x.textAlign='left';cy+=Math.round(30*Math.max(1,AV_IMAGEN_ESCALA_TEXTO));
      });
    }else{x.fillStyle=MUTED;x.font=`${Math.round(14*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText('Sin producción registrada.',PAD+28,cy);cy+=Math.round(30*Math.max(1,AV_IMAGEN_ESCALA_TEXTO));}

    divider(cy);cy+=27;
    x.fillStyle=BAD;x.font=`700 ${Math.round(15*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText(`PARADAS DE ${titulo}`,PAD+20,cy);
    x.textAlign='right';x.fillText(`TOTAL: ${avFmt(totalParadas)} min`,W-PAD-20,cy);x.textAlign='left';cy+=Math.round(26*Math.max(1,AV_IMAGEN_ESCALA_TEXTO));
    if(paradas.length){
      paradas.forEach(p=>{
        x.fillStyle=p.tipo==='NO_PROGRAMADA'?BAD:WARN;x.font=`700 ${Math.round(12*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText(p.tipo==='NO_PROGRAMADA'?'NO PROG.':'PROGRAMADA',PAD+28,cy);
        x.fillStyle=INK;x.font=`${Math.round(14*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;fit(p.descripcion,650,14,'400');x.fillText(p.descripcion,PAD+180,cy); //!TAMAÑO LENTRAS
        x.textAlign='right';x.fillStyle=DARK;x.font=`700 ${Math.round(14*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText(`${avFmt(p.minutos)} min`,W-PAD-22,cy);x.textAlign='left';cy+=Math.round(29*Math.max(1,AV_IMAGEN_ESCALA_TEXTO));
      });
    }else{x.fillStyle=MUTED;x.font=`${Math.round(14*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText('Sin paradas registradas.',PAD+28,cy);cy+=Math.round(29*Math.max(1,AV_IMAGEN_ESCALA_TEXTO));}

    if(observaciones.length){
      divider(cy);cy+=25;x.fillStyle=BLUE;x.font=`700 ${Math.round(14*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText('OBSERVACIONES',PAD+20,cy);cy+=23;
      observaciones.forEach(o=>{x.fillStyle=STEEL;x.font=`${Math.round(13*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;const rows=wrap('• '+o,W-PAD*2-60).slice(0,2);rows.forEach(r=>{x.fillText(r,PAD+28,cy);cy+=22;});});
    }
    y+=h+18;
  });

  const r=s.resumen||{};
  card(PAD,y,W-PAD*2,105,'#F8FBFD',LINE);x.fillStyle=BLUE;x.font=`700 ${Math.round(17*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText('RESUMEN DEL AVANCE',PAD+20,y+28);
  const rs=[`Producción planta: ${avFmt(r.produccionTotal)}`,`Paradas: ${avFmt(r.totalParadas)} min`,`Personal: ${avFmt(r.personal)}`,`Líneas: ${avFmt(r.lineasTrabajadas)}`];
  rs.forEach((t,i)=>{x.fillStyle=i===1?BAD:DARK;x.font=`700 ${Math.round(17*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText(t,PAD+20+i*245,y+70);});
  y+=128;x.strokeStyle=LINE;x.beginPath();x.moveTo(PAD,y);x.lineTo(W-PAD,y);x.stroke();y+=28;
  x.fillStyle=STEEL;x.font=`${Math.round(15*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText(`Generado por: ${s.supervisor||s.generadoPor||'—'}`,PAD,y);
  x.textAlign='right';x.fillStyle=DARK;x.font=`700 ${Math.round(20*AV_IMAGEN_ESCALA_TEXTO)}px Arial`;x.fillText('GLACIAL · Control de Producción',W-PAD,y);x.textAlign='left';
  return c;
}

async function avGenerarImagen(id){
  const s=avanceEstado.todosSnapshots.find(x=>x.id===id)||avanceEstado.snapshots.find(x=>x.id===id);
  if(!s)return;
  const canvas=avCanvasSnapshot(s);
  avanceEstado.imagenActual={id,canvas,snapshot:s};
  avAbrirImagen(canvas,s);
}
function avAbrirImagen(canvas,s){
  let modal=document.getElementById('av-image-modal');
  if(!modal){modal=document.createElement('div');modal.id='av-image-modal';modal.className='av-image-modal';modal.addEventListener('click',e=>{if(e.target===modal)avCerrarImagen();});document.body.appendChild(modal);}
  modal.innerHTML=`<div class="av-image-dialog"><header><div><small>IMAGEN GENERADA</small><h2>${s.tipo==='CIERRE'?'CIERRE':'AVANCE'} · ${avFechaBonita(s.fecha)}</h2></div><button onclick="avCerrarImagen()">✕</button></header><div class="av-image-preview"></div><footer><button class="btn btn-primary" onclick="avDescargarImagen()">DESCARGAR PNG</button><button class="btn btn-ghost" onclick="avCopiarImagen()">COPIAR IMAGEN</button>${navigator.share?'<button class="btn btn-ghost" onclick="avCompartirImagen()">COMPARTIR</button>':''}</footer></div>`;
  modal.querySelector('.av-image-preview').appendChild(canvas);
  modal.classList.add('open');document.body.classList.add('av-modal-open');
}
function avCerrarImagen(){document.getElementById('av-image-modal')?.classList.remove('open');if(!document.querySelector('.av-float-modal.open,.av-detail-modal.open'))document.body.classList.remove('av-modal-open');}
function avCanvasBlob(){return new Promise(resolve=>avanceEstado.imagenActual?.canvas?.toBlob(resolve,'image/png',1));}
async function avDescargarImagen(){
  const blob=await avCanvasBlob();if(!blob)return;
  const s=avanceEstado.imagenActual.snapshot,a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=`GLACIAL_${s.tipo}_${s.fecha}_${s.turno}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function avCopiarImagen(){
  try{
    const blob=await avCanvasBlob();
    if(!blob||!navigator.clipboard||typeof ClipboardItem==='undefined')throw Error();
    await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
    avAviso('Imagen copiada al portapapeles.');
  }catch{alert('Este navegador no permite copiar imágenes directamente. Usa Descargar PNG.');}
}
async function avCompartirImagen(){
  try{
    const blob=await avCanvasBlob();if(!blob)return;
    const s=avanceEstado.imagenActual.snapshot,file=new File([blob],`GLACIAL_${s.tipo}_${s.fecha}.png`,{type:'image/png'});
    if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:`GLACIAL ${s.tipo}`});
    else alert('Tu dispositivo no permite compartir archivos desde el navegador.');
  }catch(e){if(e?.name!=='AbortError')console.error(e);}
}

function avPantallaOperativaVisible(){
  const app=document.getElementById('app-screen'),selector=document.getElementById('report-select-screen');
  return !!app&&getComputedStyle(app).display!=='none'&&(!selector||getComputedStyle(selector).display==='none');
}
function avLimitarPosicionFlotante(btn,left,top){
  const margen=8,maxLeft=Math.max(margen,innerWidth-btn.offsetWidth-margen),maxTop=Math.max(margen,innerHeight-btn.offsetHeight-margen);
  return {left:Math.min(Math.max(margen,left),maxLeft),top:Math.min(Math.max(margen,top),maxTop)};
}
function avGuardarPosicionFlotante(btn){try{const r=btn.getBoundingClientRect();localStorage.setItem('glacial_avance_flotante_pos',JSON.stringify({left:Math.round(r.left),top:Math.round(r.top)}));}catch(_){}}
function avRestaurarPosicionFlotante(btn){
  try{const raw=localStorage.getItem('glacial_avance_flotante_pos');if(!raw)return;const p=JSON.parse(raw),lim=avLimitarPosicionFlotante(btn,avNum(p.left),avNum(p.top));btn.style.left=lim.left+'px';btn.style.top=lim.top+'px';btn.style.right='auto';btn.style.bottom='auto';}catch(_){}
}
function avActivarArrastre(btn){
  avRestaurarPosicionFlotante(btn);
  let drag=false,movio=false,ox=0,oy=0,x0=0,y0=0;
  const UMBRAL=8;

  btn.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    const r=btn.getBoundingClientRect();
    drag=true;movio=false;
    x0=e.clientX;y0=e.clientY;
    ox=e.clientX-r.left;oy=e.clientY-r.top;
    btn.classList.add('dragging');
    try{btn.setPointerCapture(e.pointerId)}catch(_){}
  });

  btn.addEventListener('pointermove',e=>{
    if(!drag)return;
    const dx=Math.abs(e.clientX-x0),dy=Math.abs(e.clientY-y0);
    if(!movio&&dx<UMBRAL&&dy<UMBRAL)return;
    movio=true;
    const p=avLimitarPosicionFlotante(btn,e.clientX-ox,e.clientY-oy);
    btn.style.left=p.left+'px';btn.style.top=p.top+'px';
    btn.style.right='auto';btn.style.bottom='auto';
    if(e.cancelable)e.preventDefault();
  });

  const terminar=e=>{
    if(!drag)return;
    drag=false;btn.classList.remove('dragging');
    try{btn.releasePointerCapture(e.pointerId)}catch(_){}
    if(movio)avGuardarPosicionFlotante(btn);
    else avAbrirFlotante();
  };

  btn.addEventListener('pointerup',terminar);
  btn.addEventListener('pointercancel',()=>{drag=false;movio=false;btn.classList.remove('dragging');});

  // Respaldo para navegadores móviles donde Pointer Events/touch-action
  // pueden impedir que un toque corto llegue correctamente a pointerup.
  btn.addEventListener('click',e=>{
    if(movio){e.preventDefault();return;}
    if(!drag && e.detail===0)avAbrirFlotante();
  });
}
function avInstalarBotonFlotante(){
  avInstalarEstilos();const existente=document.getElementById('av-floating-trigger');
  if(!state?.user||!tienePermiso('avanceProduccion')||!avPantallaOperativaVisible()){existente?.remove();return;}
  if(existente)return;
  const b=document.createElement('button');b.id='av-floating-trigger';b.type='button';b.className='av-floating-trigger';b.innerHTML='<span class="av-drag-handle">⋮⋮</span><span>▤</span><b>AVANCE / CIERRE</b>';document.body.appendChild(b);avActivarArrastre(b);
}

function avMesBase(){
  const [y,m]=(avanceEstado.mesCalendario||avanceEstado.fecha.slice(0,7)).split('-').map(Number);
  return new Date(y,m-1,1,12);
}
function avMoverMes(delta){
  const d=avMesBase();d.setMonth(d.getMonth()+delta);
  avanceEstado.mesCalendario=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;avDibujar();
}
function avSeleccionarFecha(fecha){avanceEstado.fecha=fecha;avanceEstado.pagina=1;avAplicarSeleccion();avDibujar();}
function avSeleccionarTurno(turno){avanceEstado.turno=turno;avanceEstado.pagina=1;avAplicarSeleccion();avDibujar();}
function avCalendarioHtml(){
  const d=avMesBase(),y=d.getFullYear(),m=d.getMonth(),first=(new Date(y,m,1,12).getDay()+6)%7,days=new Date(y,m+1,0).getDate();
  const titulo=d.toLocaleDateString('es-PE',{month:'long',year:'numeric'}).toUpperCase();
  let cells='';for(let i=0;i<first;i++)cells+='<span class="empty"></span>';
  for(let day=1;day<=days;day++){
    const f=`${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const regs=avanceEstado.todosSnapshots.filter(s=>s.fecha===f);
    const cierre=regs.some(s=>s.tipo==='CIERRE'),avances=regs.some(s=>s.tipo==='AVANCE');
    const cls=cierre?'closed':avances?'partial':'none';
    cells+=`<button class="${cls} ${f===avanceEstado.fecha?'selected':''}" onclick="avSeleccionarFecha('${f}')"><b>${day}</b><i></i></button>`;
  }
  return `<div class="av-calendar"><div class="av-calendar-head"><button onclick="avMoverMes(-1)">‹</button><strong>${titulo}</strong><button onclick="avMoverMes(1)">›</button></div><div class="av-week"><span>LU</span><span>MA</span><span>MI</span><span>JU</span><span>VI</span><span>SA</span><span>DO</span></div><div class="av-days">${cells}</div><div class="av-legend"><span><i class="blue"></i>Avances</span><span><i class="green"></i>Cierre</span><span><i class="gray"></i>Sin registros</span></div></div>`;
}
function avTimelineHtml(){
  const avances=avanceEstado.snapshots.filter(s=>s.tipo==='AVANCE').slice().sort((a,b)=>avNum(a.generadoEn)-avNum(b.generadoEn));
  const cierre=avUltimoSnapshot('CIERRE');
  const filas=avances.map(s=>`<div class="av-time-row done"><time>${avEsc(s.horaCorte||'—')}</time><div><b>AVANCE DE PRODUCCIÓN</b><small>Corte ${avEsc(s.horaCorte||'—')} · generado ${avEsc(avHoraDesdeMs(s.generadoEn)||s.horaCorte||'—')} por ${avEsc(s.supervisor||s.generadoPor||'—')}</small>${avAccionesSnapshot(s)}</div></div>`).join('');
  return `<div class="av-timeline">${filas||'<div class="av-time-row pending"><time>—</time><div><b>SIN AVANCES GENERADOS</b><small>Puedes generar un avance en cualquier momento del turno.</small></div></div>'}<div class="av-time-row ${cierre?'done':'pending'}"><time>${cierre?avEsc(cierre.horaCorte||'—'):'—'}</time><div><b>${cierre?'CIERRE DE TURNO':'CIERRE PENDIENTE'}</b>${cierre?`<small>Generado ${avEsc(avHoraDesdeMs(cierre.generadoEn)||cierre.horaCorte||'—')} por ${avEsc(cierre.supervisor||cierre.generadoPor||'—')}</small>${avAccionesSnapshot(cierre)}`:'<small>El cierre se genera manualmente cuando corresponda.</small>'}</div></div></div>`;
}
function avHistorialGeneralHtml(){
  const tipo=avanceEstado.filtroTipo;
  let rows=avanceEstado.todosSnapshots.slice();
  if(tipo!=='TODOS')rows=rows.filter(s=>s.tipo===tipo);
  rows.sort((a,b)=>avNum(b.generadoEn)-avNum(a.generadoEn));
  const pageSize=10,pages=Math.max(1,Math.ceil(rows.length/pageSize));avanceEstado.pagina=Math.min(avanceEstado.pagina,pages);
  rows=rows.slice((avanceEstado.pagina-1)*pageSize,avanceEstado.pagina*pageSize);
  return `<section class="av-general"><div class="av-section-head"><div><h3>HISTORIAL GENERAL</h3><p>Avances y cierres guardados como snapshots.</p></div><select onchange="avanceEstado.filtroTipo=this.value;avanceEstado.pagina=1;avDibujar()"><option value="TODOS" ${tipo==='TODOS'?'selected':''}>Todos</option><option value="AVANCE" ${tipo==='AVANCE'?'selected':''}>Avances</option><option value="CIERRE" ${tipo==='CIERRE'?'selected':''}>Cierres</option></select></div><div class="av-table-wrap"><table><thead><tr><th>FECHA</th><th>TURNO</th><th>TIPO</th><th>HORA</th><th>PRODUCCIÓN</th><th>ESTADO</th><th>ACCIONES</th></tr></thead><tbody>${rows.map(s=>`<tr><td>${avFechaBonita(s.fecha)}</td><td>${avEsc(s.turno)}</td><td>${s.tipo}</td><td>${avEsc(s.horaCorte||'—')}</td><td>${avFmt(s.resumen?.produccionTotal)}</td><td><span class="av-badge-ok">GENERADO</span></td><td>${avAccionesSnapshot(s)}</td></tr>`).join('')||'<tr><td colspan="7">Sin registros.</td></tr>'}</tbody></table></div><div class="av-pages"><button ${avanceEstado.pagina<=1?'disabled':''} onclick="avanceEstado.pagina--;avDibujar()">Anterior</button><span>${avanceEstado.pagina} / ${pages}</span><button ${avanceEstado.pagina>=pages?'disabled':''} onclick="avanceEstado.pagina++;avDibujar()">Siguiente</button></div></section>`;
}
function renderAvanceProduccion(main){
  avInstalarEstilos();if(!tienePermiso('avanceProduccion'))return;
  const ctx=avCtx();
  if(!avanceEstado.fecha)avanceEstado.fecha=ctx.fecha;
  if(!avanceEstado.turno)avanceEstado.turno=ctx.turno;
  if(!avanceEstado.mesCalendario)avanceEstado.mesCalendario=avanceEstado.fecha.slice(0,7);
  main.innerHTML=`<section class="av2"><div id="av-module-content"></div></section>`;
  avInstalarBotonFlotante();
  if(!avanceEstado.unsubscribe)avEscuchar();else{avAplicarSeleccion();avDibujar();}
}
function avDibujar(){
  const root=document.getElementById('av-module-content');if(!root)return;
  const ctx=avCtx(),actual=avanceEstado.fecha===ctx.fecha&&avanceEstado.turno===ctx.turno;
  root.innerHTML=`
    <header class="av2-head"><div><span class="av-eyebrow">GESTIÓN OPERATIVA</span><h2>AVANCE Y CIERRE DE TURNO</h2><p>Gestión y consulta de avances/cierres con información de Producción, Paletas, Paradas y Personal.</p></div><div class="av2-context"><b>${actual?'TURNO ACTUAL':'CONSULTA HISTÓRICA'} · ${avEsc(avanceEstado.turno)}</b><span>${avFechaBonita(avanceEstado.fecha)}</span><span>Supervisor actual: ${avEsc(avNombreUsuario()||'—')}</span></div></header>
    ${actual&&avPuedeGenerar()?`<div class="av-module-actions"><button class="btn btn-primary" onclick="avGenerarAhora()">GENERAR AVANCE AHORA</button><button class="btn btn-ghost" onclick="avAbrirParadas()">+ AGREGAR PARADAS</button><button class="btn btn-ghost" onclick="avGenerarCierreAhora()">GENERAR CIERRE DE TURNO</button></div>`:''}
    <div id="av-estado" class="av-inline-status"></div>
    <div class="av-module-grid"><aside>${avCalendarioHtml()}<div class="av-turn-filter"><strong>TURNOS</strong>${['DÍA','INTERMEDIO','NOCHE'].map(t=>`<button class="${avanceEstado.turno===t?'active':''}" onclick="avSeleccionarTurno('${t}')">${t}<small>${avTurnoHorario(t)}</small></button>`).join('')}</div></aside><main><div class="av-section-head"><div><h3>${avFechaBonita(avanceEstado.fecha)} · ${avEsc(avanceEstado.turno)}</h3><p>Historial del turno seleccionado.</p></div></div>${avTimelineHtml()}</main></div>
    ${avHistorialGeneralHtml()}`;
  avInstalarBotonFlotante();
}
function avVerDesdeModulo(id){avVer(id);}
const AVANCE_CSS=`
body.av-modal-open{overflow:hidden}
.av2{padding:4px}.av-eyebrow{display:block;font-size:9px;font-weight:800;letter-spacing:.12em;color:#5f7c8c;margin-bottom:4px}
.av2-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:18px 20px;background:#f4f8fb;border:1px solid #d7e3eb;border-left:5px solid #005b96;border-radius:10px}
.av2-head h2{margin:0;color:#082f49}.av2-head p{margin:5px 0 0;color:#647987}.av2-context{display:grid;gap:4px;text-align:right;color:#24475c}
.av-module-actions{display:flex;gap:8px;margin:14px 0}.av-inline-status{min-height:18px;color:#2e6b49;font-size:11px;font-weight:700}
.av-module-grid{display:grid;grid-template-columns:340px 1fr;gap:14px;margin-top:10px}.av-module-grid>aside,.av-module-grid>main,.av-general{background:#fff;border:1px solid #d7e3eb;border-radius:10px;padding:14px}
.av-calendar-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.av-calendar-head button{border:0;background:#eef5f9;color:#005b96;width:32px;height:32px;border-radius:6px}.av-calendar-head strong{font-size:12px;color:#003b5c}
.av-week,.av-days{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.av-week span{text-align:center;font-size:8px;color:#87949d;font-weight:800}.av-days button,.av-days .empty{min-height:38px;border:1px solid transparent;background:#f8fafb;border-radius:6px;position:relative}.av-days button:hover{border-color:#a8c7d9}.av-days button.selected{outline:2px solid #005b96}.av-days button i{position:absolute;width:6px;height:6px;border-radius:50%;bottom:4px;left:50%;transform:translateX(-50%)}.av-days button.partial i{background:#005b96}.av-days button.closed i{background:#2e8b57}.av-days button.none i{background:#cbd4da}
.av-legend{display:flex;gap:10px;flex-wrap:wrap;margin-top:9px;font-size:8px;color:#667784}.av-legend span{display:flex;align-items:center;gap:4px}.av-legend i{width:6px;height:6px;border-radius:50%}.av-legend .blue{background:#005b96}.av-legend .green{background:#2e8b57}.av-legend .gray{background:#cbd4da}
.av-turn-filter{display:grid;gap:6px;margin-top:14px}.av-turn-filter>strong{font-size:9px;color:#667784}.av-turn-filter button{display:flex;justify-content:space-between;align-items:center;padding:9px;border:1px solid #dce3e8;border-radius:6px;background:#fff;color:#27495d;font-weight:700}.av-turn-filter button.active{background:#eaf5fc;border-color:#005b96;color:#003b5c}.av-turn-filter small{font-weight:500;color:#87949d}
.av-section-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.av-section-head h3{margin:0;color:#003b5c}.av-section-head p{margin:3px 0 0;color:#87949d;font-size:11px}.av-section-head select{padding:7px;border:1px solid #dce3e8;border-radius:6px}
.av-timeline{margin-top:12px}.av-time-row{display:grid;grid-template-columns:70px 1fr;gap:12px;padding:10px 0;border-bottom:1px solid #edf1f3}.av-time-row time{font-family:'IBM Plex Mono',monospace;font-weight:700;color:#003b5c}.av-time-row>div{display:grid;gap:4px}.av-time-row small{color:#87949d}.av-time-row.done{border-left:3px solid #2e8b57;padding-left:10px}.av-time-row.pending{border-left:3px solid #d89216;padding-left:10px}
.av-general{margin-top:14px}.av-table-wrap{overflow-x:auto;margin-top:10px}.av-table-wrap table{width:100%;border-collapse:collapse;min-width:850px}.av-table-wrap th,.av-table-wrap td{padding:9px;border-bottom:1px solid #e7edf1;text-align:left;font-size:10px}.av-table-wrap th{color:#667784;background:#f8fafb}.av-badge-ok{display:inline-block;padding:3px 6px;border-radius:999px;background:#e5f4eb;color:#2e8b57;font-size:8px;font-weight:800}.av-pages{display:flex;justify-content:flex-end;gap:8px;align-items:center;margin-top:10px}.av-pages button{border:1px solid #dce3e8;background:#fff;border-radius:5px;padding:5px 8px}
.av-floating-trigger{position:fixed;touch-action:none;user-select:none;right:22px;bottom:22px;z-index:950;display:flex;align-items:center;gap:8px;padding:12px 16px;border:0;border-radius:999px;background:#005b96;color:#fff;box-shadow:0 10px 30px rgba(0,59,92,.28);cursor:pointer}.av-floating-trigger:hover{background:#003b5c}.av-floating-trigger.dragging{cursor:grabbing;opacity:.92}.av-drag-handle{font-weight:900;letter-spacing:-2px;opacity:.75;cursor:grab}
.av-float-modal,.av-detail-modal,.av-image-modal{display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,31,50,.58);padding:18px;align-items:center;justify-content:center}.av-float-modal.open,.av-detail-modal.open,.av-image-modal.open{display:flex}
.av-float-dialog,.av-detail-dialog,.av-image-dialog{width:min(820px,97vw);max-height:92vh;display:flex;flex-direction:column;background:#f5f8fa;border:1px solid #d7e3eb;border-radius:12px;overflow:hidden;box-shadow:0 28px 80px rgba(0,31,50,.3)}
.av-float-head,.av-detail-head,.av-image-dialog>header{flex:0 0 auto;display:flex;justify-content:space-between;align-items:flex-start;padding:16px 18px;background:#003b5c;color:#fff}.av-float-head h2,.av-detail-head h2,.av-image-dialog h2{margin:0;font-size:18px}.av-float-head p{margin:3px 0 0;font-size:10px;opacity:.86}.av-float-x,.av-detail-head button,.av-image-dialog header button{width:36px;height:36px;border:0;border-radius:6px;background:rgba(255,255,255,.12);color:#fff}
.av-float-body,.av-detail-body,.av-image-preview{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;padding:16px}.av-float-footer,.av-detail-footer,.av-image-dialog>footer{flex:0 0 auto;display:flex;justify-content:space-between;gap:7px;align-items:center;padding:10px 14px;background:#fff;border-top:1px solid #d7e3eb}.av-float-footer span{font-size:9px;color:#87949d}
.av-shift-status{display:grid;grid-template-columns:1fr 1fr;gap:8px}.av-shift-status>div{padding:11px;background:#fff;border:1px solid #d7e3eb;border-radius:8px}.av-shift-status small,.av-shift-status span{display:block;color:#87949d;font-size:9px}.av-shift-status strong{display:block;color:#003b5c;font-size:18px;margin:2px 0}
.av-slot-strip{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;margin-top:9px}.av-slot-strip>div{padding:7px 5px;border-radius:6px;background:#fff;border:1px solid #dce3e8;text-align:center}.av-slot-strip b,.av-slot-strip span{display:block}.av-slot-strip b{font-size:10px}.av-slot-strip span{font-size:8px;color:#87949d}.av-slot-strip .done{border-color:#b9dec8;background:#f2faf5}.av-slot-strip .done span{color:#2e8b57}.av-slot-strip .pending{border-color:#ead39e;background:#fffaf0}
.av-float-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.av-readonly{margin-top:10px;padding:9px;border-radius:6px;background:#eef3f6;color:#667784;font-size:10px}.av-float-last{margin-top:10px;padding:12px;border:1px solid #d7e3eb;border-radius:8px;background:#fff}.av-float-last-head small{display:block;font-size:8px;color:#87949d;font-weight:800}.av-float-last-head strong{color:#003b5c}.av-float-last-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.av-detail-dialog{width:min(1080px,98vw)}.av-detail-tabs{position:sticky;top:-16px;z-index:3;display:flex;gap:4px;overflow-x:auto;padding:7px 0;background:#f5f8fa}.av-detail-tabs button{border:1px solid #dce3e8;background:#fff;border-radius:5px;padding:6px 8px;font-size:9px;font-weight:800;color:#456273}.av-detail-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}.av-detail-kpis>div{padding:10px;background:#fff;border:1px solid #dce3e8;border-radius:7px}.av-detail-kpis small,.av-detail-kpis span{display:block;color:#87949d;font-size:8px}.av-detail-kpis strong{display:block;color:#003b5c;font-size:18px;margin:3px 0}.av-detail-section{scroll-margin-top:40px;margin-top:14px}.av-detail-section h3{margin:0 0 7px;color:#003b5c}.av-line-card,.av-stop-line,.av-observation{padding:10px;background:#fff;border:1px solid #dce3e8;border-radius:7px;margin-top:7px}.av-line-title{display:flex;justify-content:space-between}.av-line-title b{color:#005b96}.av-line-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:7px}.av-line-metrics span,.av-products span{font-size:9px;color:#667784}.av-products{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.av-products span{padding:4px 6px;background:#f3f7f9;border-radius:4px}.av-stop-line>div{display:grid;grid-template-columns:100px 1fr 70px;gap:6px;padding:6px 0;border-top:1px solid #edf1f3}.av-stop-line span{font-size:8px;font-weight:800}.av-stop-line .np{color:#c0392b}.av-stop-line .p{color:#d89216}.av-stop-line em{text-align:right;font-style:normal}.av-personal-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.av-personal-grid>div{display:flex;justify-content:space-between;padding:8px;background:#fff;border:1px solid #dce3e8;border-radius:6px}.av-whatsapp-preview{margin-top:14px;background:#fff;border:1px solid #dce3e8;border-radius:7px;padding:9px}.av-whatsapp-preview summary{cursor:pointer;font-size:10px;font-weight:800;color:#005b96}.av-whatsapp-preview textarea{width:100%;min-height:260px;margin-top:8px;padding:9px;border:1px solid #dce3e8;border-radius:6px;resize:vertical;font-family:'IBM Plex Mono',monospace;font-size:10px}
.av-image-dialog{width:min(780px,96vw)}.av-image-preview{background:#dfe7ec;text-align:center}.av-image-preview canvas{width:min(100%,540px);height:auto;background:#fff;box-shadow:0 4px 18px rgba(0,0,0,.12)}

.av-paradas-modal{display:none;position:fixed;inset:0;z-index:2600;background:rgba(0,31,50,.62);padding:18px;align-items:center;justify-content:center}.av-paradas-modal.open{display:flex}.av-paradas-dialog{width:min(760px,98vw);max-height:92vh;display:flex;flex-direction:column;background:#f5f8fa;border-radius:12px;overflow:hidden;box-shadow:0 25px 70px rgba(0,0,0,.28)}.av-paradas-dialog>header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:15px 18px;background:#003b5c;color:#fff}.av-paradas-dialog>header h2{margin:2px 0;font-size:18px}.av-paradas-dialog>header p{margin:2px 0;font-size:10px}.av-paradas-dialog>header>button{width:36px;height:36px;border:0;border-radius:6px;background:rgba(255,255,255,.12);color:#fff}.av-paradas-linea{margin-top:7px;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.35);background:#fff;color:#003b5c;font-weight:800}.av-paradas-body{padding:14px;overflow-y:auto}.av-paradas-note{padding:9px 10px;background:#eaf5fc;border:1px solid #c8deeb;border-radius:7px;color:#35586b;font-size:10px;margin-bottom:10px}.av-paradas-error{padding:9px 10px;background:#fff0ee;border:1px solid #efc0b9;color:#a22d22;border-radius:7px;margin-bottom:10px;font-size:10px}.av-paradas-list{display:grid;gap:8px}.av-parada-row{display:grid;grid-template-columns:150px minmax(180px,1fr) 180px 95px 38px;gap:8px;align-items:end;padding:10px;background:#fff;border:1px solid #d7e3eb;border-radius:8px}.av-parada-row label{display:block;font-size:9px;font-weight:800;color:#667784;margin-bottom:4px}.av-parada-row input,.av-parada-row select{width:100%;box-sizing:border-box;padding:9px;border:1px solid #cfdbe3;border-radius:6px;background:#fff}.av-parada-row.is-p{border-left:4px solid #2e9d62}.av-parada-row.is-np{border-left:4px solid #d16b2f}.av-parada-row:not(.is-np) .av-parada-causa{display:none}.av-parada-row small{grid-column:1/-1;color:#87949d;font-size:8px}.av-parada-remove{height:36px;border:1px solid #efc0b9;background:#fff;color:#c0392b;border-radius:6px}.av-parada-add{margin-top:10px}.av-paradas-dialog>footer{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 14px;background:#fff;border-top:1px solid #d7e3eb}.av-paradas-dialog>footer>div:last-child{display:flex;gap:7px}.av-paradas-dialog>footer strong{color:#003b5c;margin-left:6px}
@media(max-width:900px){.av-module-grid{grid-template-columns:1fr}.av-detail-kpis{grid-template-columns:repeat(2,1fr)}.av-slot-strip{grid-template-columns:repeat(3,1fr)}}
@media(max-width:700px){.av-paradas-modal{padding:0}.av-paradas-dialog{width:100%;height:100dvh;max-height:100dvh;border-radius:0}.av-parada-row{grid-template-columns:1fr 95px 38px}.av-parada-tipo,.av-parada-motivo,.av-parada-causa{grid-column:1/-1}.av-parada-min{grid-column:1/3}.av-paradas-dialog>footer{align-items:stretch;flex-direction:column}.av-paradas-dialog>footer>div:last-child{display:grid;grid-template-columns:1fr 1fr}.av-paradas-dialog>footer .btn{min-height:44px}.av2-head{display:block}.av2-context{text-align:left;margin-top:10px}.av-module-actions{display:grid}.av-float-modal,.av-detail-modal,.av-image-modal{padding:0}.av-float-dialog,.av-detail-dialog,.av-image-dialog{width:100%;height:100dvh;max-height:100dvh;border-radius:0}.av-float-actions{grid-template-columns:1fr}.av-shift-status{grid-template-columns:1fr 1fr}.av-detail-kpis{grid-template-columns:1fr 1fr}.av-line-metrics{grid-template-columns:1fr 1fr}.av-personal-grid{grid-template-columns:1fr}.av-detail-footer,.av-image-dialog>footer{flex-wrap:wrap}.av-floating-trigger{right:12px;bottom:max(12px,env(safe-area-inset-bottom));touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.av-float-modal.open,.av-detail-modal.open,.av-image-modal.open{display:flex!important;visibility:visible!important;opacity:1!important}
.av-float-dialog,.av-detail-dialog,.av-image-dialog{height:100dvh;max-height:100dvh}
.av-float-head,.av-detail-head,.av-image-dialog>header{padding-top:max(16px,env(safe-area-inset-top))}
.av-float-footer,.av-detail-footer,.av-image-dialog>footer{padding-bottom:max(10px,env(safe-area-inset-bottom))}
.av-slot-strip{grid-template-columns:repeat(2,1fr)}}
`;

/* Inyectar estilos del módulo una sola vez.
   La versión anterior definía AVANCE_CSS pero no lo agregaba al <head>. */
function avInstalarEstilos(){
  if(document.getElementById('av-estilos-globales'))return;
  const style=document.createElement('style');
  style.id='av-estilos-globales';
  style.textContent=AVANCE_CSS;
  document.head.appendChild(style);
}

/* =========================================================
   BOOTSTRAP GLOBAL · BOTÓN FLOTANTE AVANCE / CIERRE
   =========================================================
   29-avance-produccion.js carga antes de 12-init.js. Por eso no
   podemos depender de que el usuario haya abierto primero el módulo
   "Avance y Cierre". Esperamos a que state.user esté disponible y
   montamos el acceso flotante globalmente.
*/
(function avBootstrapFlotante(){
  let intentos=0;

  const instalar=()=>{
    intentos++;

    try{
      if(
        typeof state!=='undefined' &&
        state?.user &&
        typeof tienePermiso==='function'
      ){
        if(tienePermiso('avanceProduccion')){
          avInstalarBotonFlotante();
          return;
        }
      }
    }catch(err){
      console.debug('Avance/Cierre: esperando inicialización...',err);
    }

    if(intentos<120){
      setTimeout(instalar,500);
    }
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>setTimeout(instalar,250),{once:true});
  }else{
    setTimeout(instalar,250);
  }

  /*
     Si cambia la pantalla después del login o navegación, verificamos
     nuevamente sin duplicar el botón.
  */
  window.addEventListener('focus',()=>{
    try{ avInstalarBotonFlotante(); }catch(_){}
  });

  document.addEventListener('click',()=>{
    setTimeout(()=>{
      try{ avInstalarBotonFlotante(); }catch(_){}
    },50);
  });
})();