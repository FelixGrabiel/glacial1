/* =============================================================
   ROTACIÓN SEMANAL DE SUPERVISORES — GLACIAL
   Usa sync/rotaciones existente. Los registros de este módulo se
   distinguen con tipo:'SUPERVISORES' para no romper el Tareo.
   ============================================================= */

const ROT_SUP_TIPO='SUPERVISORES';
const ROT_SUP_ESTADOS=['BORRADOR','PUBLICADA','CERRADA'];
const ROT_SUP_TURNOS=['DÍA','INTERMEDIO','NOCHE','DESCANSO','VACACIONES','LICENCIA','OTRO'];

const ROT_SUP_HORARIOS_BASE={
  'DÍA':{inicio:'07:00',fin:'15:00'},
  'INTERMEDIO':{inicio:'14:00',fin:'22:00'},
  'NOCHE':{inicio:'22:00',fin:'07:00'}
};

let rotSupSemanaVista=null;
let rotSupFiltroHistorial='';

/* Modo visualización general: la cuenta consulta la rotación pero no la modifica (aunque tenga el permiso guardado). */
function rotSupSoloVista(){
  return !!(window.glacialVista && window.glacialVista.activo());
}
function rotSupPuedeGestionar(){
  return !!state.user && !rotSupSoloVista() && tienePermiso('gestionar_rotacion_supervisores');
}
function rotSupPuedeVer(){
  return rotSupPuedeGestionar() || (rotSupSoloVista() && window.glacialVista.puedeModulo('rotacion_supervisores'));
}

function rotSupFechaISO(d){
  return [
    d.getFullYear(),
    String(d.getMonth()+1).padStart(2,'0'),
    String(d.getDate()).padStart(2,'0')
  ].join('-');
}

function rotSupParseFecha(v){
  const [y,m,d]=String(v||'').split('-').map(Number);
  return y&&m&&d ? new Date(y,m-1,d) : null;
}

function rotSupLunes(fecha=new Date()){
  const d=new Date(fecha.getFullYear(),fecha.getMonth(),fecha.getDate());
  const dia=d.getDay()||7;
  d.setDate(d.getDate()-dia+1);
  return d;
}

function rotSupDomingo(lunes){
  const d=new Date(lunes); d.setDate(d.getDate()+6); return d;
}

function rotSupSemanaISO(fecha=new Date()){
  const d=new Date(Date.UTC(fecha.getFullYear(),fecha.getMonth(),fecha.getDate()));
  const day=d.getUTCDay()||7;
  d.setUTCDate(d.getUTCDate()+4-day);
  const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d-yearStart)/86400000)+1)/7);
}

function rotSupIdSemana(desde){
  return 'ROT-SUP-'+String(desde||'');
}

function rotSupItems(){
  return (loadRotaciones()||[]).filter(r=>r && r.tipo===ROT_SUP_TIPO);
}

function rotSupGuardarColeccion(rotacion){
  if(!rotSupPuedeGestionar()){
    alert('No tienes permiso para modificar la rotación de supervisores.');
    return false;
  }
  const todos=[...(loadRotaciones()||[])];
  const idx=todos.findIndex(r=>r && r.tipo===ROT_SUP_TIPO && r.id===rotacion.id);
  if(idx>=0) todos[idx]=rotacion; else todos.push(rotacion);
  saveRotaciones(todos);
  return true;
}

function rotSupSupervisores(){
  return (loadUsers()||[])
    .filter(u=>u && u.rol==='Supervisor' && u.activo!==false)
    .sort((a,b)=>String(a.nombre||a.username).localeCompare(String(b.nombre||b.username),'es'));
}

function rotSupDias(desde){
  const base=rotSupParseFecha(desde);
  if(!base)return [];
  return Array.from({length:7},(_,i)=>{
    const d=new Date(base); d.setDate(d.getDate()+i); return rotSupFechaISO(d);
  });
}

function rotSupNombreDia(fecha){
  const d=rotSupParseFecha(fecha);
  return d ? d.toLocaleDateString('es-PE',{weekday:'short',day:'2-digit',month:'2-digit'}) : fecha;
}

function rotSupNueva(desde){
  const lunes=rotSupLunes(rotSupParseFecha(desde)||new Date());
  const d=rotSupFechaISO(lunes), h=rotSupFechaISO(rotSupDomingo(lunes));
  const dias=rotSupDias(d);
  const detalles=rotSupSupervisores().map(u=>({
    username:u.username,
    nombre:u.nombre||u.username,
    linea:u.linea||'',
    dias:Object.fromEntries(dias.map(f=>[f,{estado:'DESCANSO',turno:'DESCANSO',inicio:'',fin:''}]))
  }));
  return {
    id:rotSupIdSemana(d),
    tipo:ROT_SUP_TIPO,
    semana:rotSupSemanaISO(lunes),
    desde:d,
    hasta:h,
    estado:'BORRADOR',
    detalles,
    excepciones:[],
    auditoria:[rotSupAuditoria('CREÓ ROTACIÓN')],
    creadoEn:Date.now(),
    creadoPor:state.user?.username||''
  };
}

function rotSupAuditoria(accion,extra={}){
  return {
    fechaHora:Date.now(),
    usuario:state.user?.username||'',
    nombre:state.user?.nombre||state.user?.username||'',
    accion,
    ...extra
  };
}

function rotSupBuscarSemanaPorFecha(fecha,soloPublicada=false){
  return rotSupItems()
    .filter(r=>fecha>=r.desde && fecha<=r.hasta && (!soloPublicada || r.estado==='PUBLICADA'))
    .sort((a,b)=>num(b.publicadaEn||b.actualizadoEn||0)-num(a.publicadaEn||a.actualizadoEn||0))[0] || null;
}

function rotSupDetalleUsuario(rotacion,username){
  return rotacion?.detalles?.find(d=>String(d.username).toLowerCase()===String(username).toLowerCase()) || null;
}

function rotSupAsignacionFecha(rotacion,username,fecha){
  const ex=(rotacion?.excepciones||[])
    .filter(e=>e.fecha===fecha && (e.supervisorReemplazo===username || e.supervisorOriginal===username))
    .sort((a,b)=>num(b.creadoEn)-num(a.creadoEn))[0];

  if(ex){
    if(ex.supervisorReemplazo===username){
      return {
        estado:'REEMPLAZO',
        turno:ex.turno,
        inicio:ex.inicio||ROT_SUP_HORARIOS_BASE[ex.turno]?.inicio||'',
        fin:ex.fin||ROT_SUP_HORARIOS_BASE[ex.turno]?.fin||'',
        excepcion:ex
      };
    }
    if(ex.supervisorOriginal===username){
      return {estado:'REEMPLAZADO',turno:'DESCANSO',inicio:'',fin:'',excepcion:ex};
    }
  }

  return rotSupDetalleUsuario(rotacion,username)?.dias?.[fecha] || null;
}

function resolverContextoRotacionSupervisor(usuario=state.user,ahora=new Date()){
  if(!usuario || String(usuario.rol||'')!=='Supervisor')return null;
  if(typeof _rotacionesReady!=='undefined' && !_rotacionesReady)return null;

  let fecha=rotSupFechaISO(ahora);
  let rot=rotSupBuscarSemanaPorFecha(fecha,true);
  let asig=rot ? rotSupAsignacionFecha(rot,usuario.username,fecha) : null;

  // Para turno nocturno después de medianoche, revisar la fecha operativa anterior.
  if(!asig || !['DÍA','INTERMEDIO','NOCHE'].includes(asig.turno)){
    const ant=new Date(ahora); ant.setDate(ant.getDate()-1);
    const fAnt=rotSupFechaISO(ant);
    const rAnt=rotSupBuscarSemanaPorFecha(fAnt,true);
    const aAnt=rAnt ? rotSupAsignacionFecha(rAnt,usuario.username,fAnt) : null;
    if(aAnt?.turno==='NOCHE'){
      const fin=minutosHoraTurno(aAnt.fin);
      const actual=ahora.getHours()*60+ahora.getMinutes();
      if(fin!==null && actual<fin){
        fecha=fAnt; rot=rAnt; asig=aAnt;
      }
    }
  }

  if(!rot || !asig)return null;
  if(!['DÍA','INTERMEDIO','NOCHE'].includes(asig.turno)){
    return {
      turno:'',
      horarioInicio:asig.inicio||'',
      horarioFin:asig.fin||'',
      fechaOperativa:fecha,
      estado:asig.estado||asig.turno||'NO_OPERATIVO',
      automatico:true,
      origen:'ROTACION_SEMANAL',
      rotacionId:rot.id
    };
  }

  const ini=minutosHoraTurno(asig.inicio);
  const fin=minutosHoraTurno(asig.fin);
  const actual=ahora.getHours()*60+ahora.getMinutes();
  const activo=ini===null||fin===null ? true : (fin>ini ? actual>=ini&&actual<fin : actual>=ini||actual<fin);

  return {
    turno:asig.turno,
    horarioInicio:asig.inicio||'',
    horarioFin:asig.fin||'',
    fechaOperativa:fecha,
    estado:activo?'ACTIVO':'FUERA_DE_HORARIO',
    automatico:true,
    origen:asig.excepcion?'EXCEPCION':'ROTACION_SEMANAL',
    rotacionId:rot.id
  };
}

function aplicarContextoRotacionSupervisor(mostrarAviso=true){
  if(!state.user || state.user.rol!=='Supervisor')return;
  const ctx=resolverContextoRotacionSupervisor(state.user,new Date());
  if(ctx){
    state.user={...state.user,contextoRotacion:ctx,turnoOperativo:ctx.turno,
      horarioOperativoInicio:ctx.horarioInicio,horarioOperativoFin:ctx.horarioFin,
      fechaOperativa:ctx.fechaOperativa};
    sessionStorage.setItem(DB_SESSION,JSON.stringify(state.user));
    return;
  }
  delete state.user.contextoRotacion;
  delete state.user.turnoOperativo;
  if(mostrarAviso && typeof _rotacionesReady!=='undefined' && _rotacionesReady){
    alert('No existe una rotación publicada para esta semana. Comuníquese con Jefatura de Producción.');
  }
}

function rotSupSeleccionarSemana(desde){
  if(!rotSupResolverPendientes())return;
  if(window.glacialRotGrid)window.glacialRotGrid.limpiar('rot-sup');
  const lunes=rotSupFechaISO(rotSupLunes(rotSupParseFecha(desde)||new Date()));
  rotSupSemanaVista=lunes;
  renderRotacionSupervisores();
}

function rotSupObtenerVista(){
  const lunes=rotSupSemanaVista || rotSupFechaISO(rotSupLunes(new Date()));
  rotSupSemanaVista=lunes;
  return rotSupItems().find(r=>r.desde===lunes) || rotSupNueva(lunes);
}

function rotSupActualizar(username,fecha,campo,valor){
  if(!rotSupPuedeGestionar())return;
  const r=rotSupObtenerVista();
  if(r.estado==='CERRADA'){alert('La rotación está CERRADA.');return;}
  const d=rotSupDetalleUsuario(r,username);
  if(!d)return;
  d.dias=d.dias||{};
  d.dias[fecha]=d.dias[fecha]||{estado:'DESCANSO',turno:'DESCANSO',inicio:'',fin:''};
  const a=d.dias[fecha];

  if(campo==='turno'){
    a.turno=valor; a.estado=valor;
    const h=ROT_SUP_HORARIOS_BASE[valor];
    a.inicio=h?.inicio||''; a.fin=h?.fin||'';
  }else{
    a[campo]=valor;
  }
  r.actualizadoEn=Date.now();
  r.auditoria=[...(r.auditoria||[]),rotSupAuditoria('MODIFICÓ ASIGNACIÓN',{username,fecha,campo,valor})];
  rotSupGuardarColeccion(r);
}

/* Aplica la asignación de UNA celda (turno, inicio y fin a la vez) con los mismos permisos, validaciones, guardado y auditoría de
   rotSupActualizar. Lo llama el cuadro tipo Excel (31a-rotacion-grid.js). Devuelve {ok:true} o {ok:false,error}. */
function rotSupAplicarCelda(username,fecha,asig){
  if(!rotSupPuedeGestionar())return {ok:false,error:'No tienes permiso para modificar la rotación de supervisores.'};
  const r=rotSupObtenerVista();
  if(r.estado==='CERRADA')return {ok:false,error:'La rotación está CERRADA: reábrela para editar.'};
  if(!ROT_SUP_TURNOS.includes(asig&&asig.turno))return {ok:false,error:'Turno no válido.'};
  const conHoras=['DÍA','INTERMEDIO','NOCHE'].includes(asig.turno);
  if(conHoras&&(!asig.inicio||!asig.fin))return {ok:false,error:'Indica la hora de inicio y de fin.'};
  r.detalles=r.detalles||[];
  let d=rotSupDetalleUsuario(r,username);
  if(!d){
    // El supervisor figura en el listado pero la semana aún no lo tenía: se agrega con el mismo formato de rotSupNueva.
    const u=rotSupSupervisores().find(x=>String(x.username).toLowerCase()===String(username).toLowerCase());
    if(!u)return {ok:false,error:'No se encontró al supervisor.'};
    d={username:u.username,nombre:u.nombre||u.username,linea:u.linea||'',dias:{}};
    r.detalles.push(d);
  }
  d.dias=d.dias||{};
  d.dias[fecha]={estado:asig.turno,turno:asig.turno,inicio:conHoras?asig.inicio:'',fin:conHoras?asig.fin:''};
  r.actualizadoEn=Date.now();
  r.auditoria=[...(r.auditoria||[]),rotSupAuditoria('MODIFICÓ ASIGNACIÓN',{username,fecha,turno:asig.turno,inicio:d.dias[fecha].inicio,fin:d.dias[fecha].fin})];
  return rotSupGuardarColeccion(r)?{ok:true}:{ok:false,error:'No se pudo guardar la asignación.'};
}

/* Cambios del editor del cuadro aún sin aplicar: se aplican o se descartan antes de seguir (nunca se pierden en silencio). */
function rotSupResolverPendientes(){
  return !window.glacialRotGrid || window.glacialRotGrid.resolverPendientes('rot-sup');
}

function rotSupGuardarBorrador(){
  if(!rotSupResolverPendientes())return;
  const r=rotSupObtenerVista();
  if(r.estado==='CERRADA')return;

  // Si ya está publicada, guardar cambios NO la devuelve a BORRADOR.
  const estabaPublicada=r.estado==='PUBLICADA';
  if(!estabaPublicada)r.estado='BORRADOR';

  r.actualizadoEn=Date.now();
  r.actualizadoPor=state.user?.username||'';
  r.auditoria=[
    ...(r.auditoria||[]),
    rotSupAuditoria(estabaPublicada ? 'ACTUALIZÓ ROTACIÓN PUBLICADA' : 'GUARDÓ BORRADOR')
  ];
  rotSupGuardarColeccion(r);
  renderRotacionSupervisores();
}

function rotSupValidarPublicacion(r){
  const errores=[];
  if(!r.desde||!r.hasta)errores.push('Fechas incompletas.');
  const vistos=new Set();
  (r.detalles||[]).forEach(d=>{
    if(vistos.has(d.username))errores.push('Supervisor duplicado: '+d.nombre);
    vistos.add(d.username);
    rotSupDias(r.desde).forEach(f=>{
      const a=d.dias?.[f];
      if(!a||!a.turno)errores.push(`${d.nombre}: falta asignación ${f}.`);
      if(['DÍA','INTERMEDIO','NOCHE'].includes(a?.turno) && (!a.inicio||!a.fin)){
        errores.push(`${d.nombre}: falta horario ${f}.`);
      }
    });
  });
  return [...new Set(errores)];
}

function rotSupPublicar(){
  if(!rotSupPuedeGestionar())return;
  if(!rotSupResolverPendientes())return;
  const r=rotSupObtenerVista();
  const errores=rotSupValidarPublicacion(r);
  if(errores.length){alert('No se puede publicar:\n\n'+errores.slice(0,12).join('\n'));return;}
  const yaPublicada=r.estado==='PUBLICADA';
  const pregunta=yaPublicada
    ? `¿Deseas actualizar la rotación publicada de la semana ${r.semana}?`
    : `¿Deseas publicar la rotación de la semana ${r.semana}?`;
  if(!confirm(pregunta))return;

  const todos=[...(loadRotaciones()||[])];
  todos.forEach(x=>{
    if(x?.tipo===ROT_SUP_TIPO && x.id!==r.id && x.estado==='PUBLICADA' &&
       !(x.hasta<r.desde || x.desde>r.hasta)){
      x.estado='CERRADA';
      x.cerradaEn=Date.now();
    }
  });
  const ahora=Date.now();
  r.estado='PUBLICADA';

  if(!yaPublicada || !r.publicadaEn){
    r.publicadaEn=ahora;
    r.publicadaPor=state.user?.username||'';
  }

  r.actualizadoEn=ahora;
  r.actualizadoPor=state.user?.username||'';
  if(yaPublicada)r.ultimaActualizacionPublicadaEn=ahora;

  r.auditoria=[
    ...(r.auditoria||[]),
    rotSupAuditoria(yaPublicada ? 'ACTUALIZÓ ROTACIÓN PUBLICADA' : 'PUBLICÓ ROTACIÓN')
  ];
  const idx=todos.findIndex(x=>x?.tipo===ROT_SUP_TIPO&&x.id===r.id);
  if(idx>=0)todos[idx]=r;else todos.push(r);
  saveRotaciones(todos);
  renderRotacionSupervisores();
}

function rotSupCerrar(){
  if(!rotSupPuedeGestionar())return;
  const r=rotSupObtenerVista();
  if(!confirm(`¿Cerrar la rotación de la semana ${r.semana}?`))return;
  r.estado='CERRADA'; r.cerradaEn=Date.now();
  r.auditoria=[...(r.auditoria||[]),rotSupAuditoria('CERRÓ ROTACIÓN')];
  rotSupGuardarColeccion(r);
  renderRotacionSupervisores();
}

function rotSupReabrir(){
  if(!rotSupPuedeGestionar())return;

  const r=rotSupObtenerVista();
  if(r.estado!=='CERRADA')return;

  const ok=confirm(
    `¿Reabrir la rotación de la semana ${r.semana}?\n\n` +
    'La rotación volverá a PUBLICADA y podrás modificar turnos y horarios.'
  );
  if(!ok)return;

  const ahora=Date.now();

  r.estado='PUBLICADA';
  r.reabiertaEn=ahora;
  r.reabiertaPor=state.user?.username||'';
  r.actualizadoEn=ahora;
  r.actualizadoPor=state.user?.username||'';

  r.auditoria=[
    ...(r.auditoria||[]),
    rotSupAuditoria('REABRIÓ ROTACIÓN CERRADA',{
      estadoAnterior:'CERRADA',
      estadoNuevo:'PUBLICADA'
    })
  ];

  rotSupGuardarColeccion(r);
  renderRotacionSupervisores();
}

function rotSupCopiarAnterior(){
  if(!rotSupPuedeGestionar())return;
  if(!rotSupResolverPendientes())return;
  const actual=rotSupObtenerVista();
  const anteriores=rotSupItems().filter(r=>r.desde<actual.desde).sort((a,b)=>b.desde.localeCompare(a.desde));
  const ant=anteriores[0];
  if(!ant){alert('No existe una semana anterior para copiar.');return;}
  const diasN=rotSupDias(actual.desde), diasA=rotSupDias(ant.desde);
  actual.detalles=rotSupSupervisores().map(u=>{
    const prev=rotSupDetalleUsuario(ant,u.username);
    const dias={};
    diasN.forEach((f,i)=>{
      const a=prev?.dias?.[diasA[i]]||{estado:'DESCANSO',turno:'DESCANSO',inicio:'',fin:''};
      dias[f]={...a};
    });
    return {username:u.username,nombre:u.nombre||u.username,linea:u.linea||'',dias};
  });
  actual.auditoria=[...(actual.auditoria||[]),rotSupAuditoria('COPIÓ SEMANA ANTERIOR',{origen:ant.id})];
  rotSupGuardarColeccion(actual);
  renderRotacionSupervisores();
}

function rotSupAgregarExcepcion(){
  if(!rotSupPuedeGestionar())return;
  const r=rotSupObtenerVista();
  if(r.estado!=='PUBLICADA'){alert('Publica la rotación antes de registrar una cobertura excepcional.');return;}
  const fecha=document.getElementById('rot-sup-ex-fecha')?.value;
  const original=document.getElementById('rot-sup-ex-original')?.value;
  const reemplazo=document.getElementById('rot-sup-ex-reemplazo')?.value;
  const turno=document.getElementById('rot-sup-ex-turno')?.value;
  const motivo=document.getElementById('rot-sup-ex-motivo')?.value.trim();
  if(!fecha||!original||!reemplazo||original===reemplazo||!turno||!motivo){
    alert('Completa fecha, supervisor original, reemplazo, turno y motivo.');return;
  }
  const h=ROT_SUP_HORARIOS_BASE[turno]||{};
  r.excepciones=[...(r.excepciones||[]),{
    id:'EX-'+Date.now(),fecha,supervisorOriginal:original,supervisorReemplazo:reemplazo,
    turno,inicio:h.inicio||'',fin:h.fin||'',motivo,creadoEn:Date.now(),creadoPor:state.user?.username||''
  }];
  r.auditoria=[...(r.auditoria||[]),rotSupAuditoria('CAMBIO EXCEPCIONAL',{fecha,original,reemplazo,turno,motivo})];
  rotSupGuardarColeccion(r);
  renderRotacionSupervisores();
}

function rotSupEsc(v){
  return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

const ROT_SUP_DIAS_ETQ=['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'];
const ROT_SUP_DIAS_LARGO=['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
function rotSupFechaVisible(iso){return String(iso||'').split('-').reverse().join('/');}
const ROT_SUP_CLASE_TURNO={'DÍA':'dia','INTERMEDIO':'intermedio','NOCHE':'noche','DESCANSO':'descanso','VACACIONES':'vacaciones','LICENCIA':'licencia','OTRO':'otro'};

/* Datos del cuadro tipo Excel a partir de la rotación REAL de la semana (mismo modelo y catálogo de siempre). */
function rotSupConfigCuadro(r,dias,supervisores,bloqueado){
  const hoy=rotSupFechaISO(new Date());
  return {
    id:'rot-sup',col1:'SUPERVISOR',etiquetaTabla:'Rotación de supervisores, semana '+r.semana,
    dias:dias.map((f,i)=>{const p=f.split('-');return {fecha:f,etq:ROT_SUP_DIAS_ETQ[i],corta:p[2]+'/'+p[1],largo:ROT_SUP_DIAS_LARGO[i]+' '+p[2]+'/'+p[1],hoy:f===hoy};}),
    filas:supervisores.map(u=>{
      const d=rotSupDetalleUsuario(r,u.username)||{dias:{}};
      return {id:u.username,nombre:u.nombre||u.username,sub:u.linea||'Todas las líneas',
        celdas:dias.map(f=>{const a=d.dias?.[f]||{turno:'DESCANSO',inicio:'',fin:''};return {valor:a.turno||'DESCANSO',inicio:a.inicio||'',fin:a.fin||''};})};
    }),
    catalogo:ROT_SUP_TURNOS.map(t=>({valor:t,etq:t,clase:ROT_SUP_CLASE_TURNO[t]||'otro',horas:['DÍA','INTERMEDIO','NOCHE'].includes(t),base:ROT_SUP_HORARIOS_BASE[t]||null})),
    bloqueado,mensajeBloqueo:'La rotación está CERRADA: reábrela para editar.',
    aplicar:'rotSupAplicarCeldaGrid',rerender:'renderRotacionSupervisores'
  };
}
/* El cuadro llama con (filaId, índiceDeDía, asignación): se traduce a (usuario, fecha). */
function rotSupAplicarCeldaGrid(username,diaIdx,asig){
  const r=rotSupObtenerVista();
  const fecha=rotSupDias(r.desde)[diaIdx];
  if(!fecha)return {ok:false,error:'Día no válido.'};
  return rotSupAplicarCelda(username,fecha,asig);
}

function renderRotacionSupervisores(){
  const main=document.getElementById('main');
  if(!main)return;
  if(!rotSupPuedeVer()){
    main.innerHTML='<div class="empty-state"><h4>Sin permiso</h4><p>No puedes gestionar la rotación de supervisores.</p></div>';
    return;
  }

  const r=rotSupObtenerVista();
  const soloVer=!rotSupPuedeGestionar();
  const dias=rotSupDias(r.desde);
  const supervisores=rotSupSupervisores();
  const prev=new Date(rotSupParseFecha(r.desde));prev.setDate(prev.getDate()-7);
  const next=new Date(rotSupParseFecha(r.desde));next.setDate(next.getDate()+7);
  const bloqueado=!rotSupPuedeGestionar() || r.estado==='CERRADA';
  const opciones=ROT_SUP_TURNOS.map(t=>`<option value="${t}">${t}</option>`).join('');

  main.innerHTML=`
  <section class="rot-sup-page">
    <style>
      .rot-sup-page{padding:18px;max-width:1500px;margin:auto}.rot-sup-head,.rot-sup-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      .rot-sup-head{justify-content:space-between}.rot-sup-card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px;margin-top:14px}
            .rot-sup-badge{font-weight:800;font-size:12px;padding:6px 10px;border-radius:999px;background:#eef3f6}
      .rot-sup-badge.pub{background:#e3f4ea;color:#14532d}.rot-sup-badge.cer{background:#fde7e5;color:#8a1c13}.rot-sup-badge.bor{background:#fff4dc;color:#7a5200}
      .rot-sup-audit{font-size:12px;max-height:180px;overflow:auto}.rot-sup-muted{color:var(--muted);font-size:12px}
      .rot-sup-page{overflow-x:clip}
      @media(max-width:700px){.rot-sup-page{padding:12px 10px}.rot-sup-actions .btn{min-height:44px;flex:1 1 auto}}
    </style>
    <div class="rot-sup-head">
      <div><h2 style="margin:0">Rotación de supervisores</h2>
        <div class="rot-sup-muted">Semana ${r.semana} · ${rotSupFechaVisible(r.desde)} al ${rotSupFechaVisible(r.hasta)}</div>
        ${r.estado==='PUBLICADA'?`<div class="rot-sup-muted" style="margin-top:4px">
          PUBLICADA · Última actualización: ${
            new Date(r.ultimaActualizacionPublicadaEn || r.actualizadoEn || r.publicadaEn || Date.now())
              .toLocaleString('es-PE')
          } · por ${rotSupEsc(r.actualizadoPor || r.publicadaPor || '')}
        </div>`:''}</div>
      <span class="rot-sup-badge ${r.estado==='PUBLICADA'?'pub':r.estado==='CERRADA'?'cer':'bor'}">${r.estado}</span>
    </div>

    <div class="rot-sup-actions" style="margin-top:12px">
      <button class="btn btn-ghost" onclick="rotSupSeleccionarSemana('${rotSupFechaISO(prev)}')">← Semana anterior</button>
      <button class="btn btn-ghost" onclick="rotSupSeleccionarSemana('${rotSupFechaISO(rotSupLunes(new Date()))}')">Semana actual</button>
      <button class="btn btn-ghost" onclick="rotSupSeleccionarSemana('${rotSupFechaISO(next)}')">Semana siguiente →</button>
      ${soloVer?'':`<button class="btn btn-ghost" onclick="rotSupCopiarAnterior()" ${bloqueado?'disabled':''}>Copiar semana anterior</button>
      <button class="btn btn-ghost" onclick="rotSupGuardarBorrador()" ${bloqueado?'disabled':''}>${r.estado==='PUBLICADA'?'Guardar cambios':'Guardar borrador'}</button>
      <button class="btn btn-glacial" onclick="rotSupPublicar()" ${bloqueado?'disabled':''}>${r.estado==='PUBLICADA'?'Actualizar publicación':'Publicar rotación'}</button>
      ${r.estado==='PUBLICADA'?`<button class="btn btn-ghost" onclick="rotSupCerrar()">Cerrar semana</button>`:''}
      ${r.estado==='CERRADA'?`<button class="btn btn-glacial" onclick="rotSupReabrir()">Reabrir rotación</button>`:''}`}
    </div>

    ${window.glacialRotGrid?window.glacialRotGrid.html(rotSupConfigCuadro(r,dias,supervisores,bloqueado)):'<div class="empty-state"><p>No se cargó el cuadro de rotación.</p></div>'}

    <div class="rot-sup-card">
      <h3 style="margin-top:0">Cambio / cobertura excepcional</h3>
      ${soloVer?'':`<div class="rot-sup-actions">
        <input id="rot-sup-ex-fecha" type="date" min="${r.desde}" max="${r.hasta}" value="${r.desde}">
        <select id="rot-sup-ex-original"><option value="">Supervisor original</option>${supervisores.map(u=>`<option value="${rotSupEsc(u.username)}">${rotSupEsc(u.nombre||u.username)}</option>`).join('')}</select>
        <select id="rot-sup-ex-reemplazo"><option value="">Supervisor reemplazo</option>${supervisores.map(u=>`<option value="${rotSupEsc(u.username)}">${rotSupEsc(u.nombre||u.username)}</option>`).join('')}</select>
        <select id="rot-sup-ex-turno"><option value="">Turno</option>${['DÍA','INTERMEDIO','NOCHE'].map(t=>`<option>${t}</option>`).join('')}</select>
        <input id="rot-sup-ex-motivo" placeholder="Motivo: cobertura, falta, emergencia...">
        <button class="btn btn-ghost" onclick="rotSupAgregarExcepcion()" ${r.estado!=='PUBLICADA'?'disabled':''}>Registrar excepción</button>
      </div>`}
      ${(r.excepciones||[]).map(e=>`<div class="rot-sup-muted" style="margin-top:8px">${e.fecha} · ${rotSupEsc(e.supervisorOriginal)} → ${rotSupEsc(e.supervisorReemplazo)} · ${e.turno} · ${rotSupEsc(e.motivo)}</div>`).join('') || '<div class="rot-sup-muted">Sin excepciones.</div>'}
    </div>

    <div class="rot-sup-card">
      <h3 style="margin-top:0">Historial / auditoría</h3>
      <div class="rot-sup-audit">
        ${(r.auditoria||[]).slice().reverse().map(a=>`<div>${new Date(a.fechaHora).toLocaleString('es-PE')} · <strong>${rotSupEsc(a.nombre||a.usuario)}</strong> · ${rotSupEsc(a.accion)}</div>`).join('') || 'Sin movimientos.'}
            </div>
    </div>
  </section>`;
  if(window.glacialRotGrid)window.glacialRotGrid.activar('rot-sup');
}
