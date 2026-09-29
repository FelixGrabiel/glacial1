/* =============================================================
   AVANCE Y CIERRE DE TURNO — GLACIAL
   Snapshot automático desde datos existentes.
   No modifica producción, paletas, tareos ni paradas originales.
   ============================================================= */

const AVANCE_LINEAS=['PET1','PET2','B7L','C20L','B20L','HIELO'];
const AVANCE_NOMBRES={PET1:'PET1',PET2:'PET2',B7L:'B7L',C20L:'CAJAS 20L',B20L:'B20L',HIELO:'HIELO'};
const AVANCE_HORARIOS={DÍA:['09:00','11:00','13:00','15:00','17:00'],NOCHE:['01:00','03:00','05:00']};
const avanceEstado={
  fecha:'',turno:'',horaCorte:'',tipo:'AVANCE',
  snapshots:[],todosSnapshots:[],preview:'',previewId:'',
  unsubscribe:null,mesCalendario:null,filtroTipo:'TODOS',pagina:1,
  imagenActual:null
};

function avNum(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function avEsc(v){return typeof escaparHtml==='function'?escaparHtml(v??''):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function avFmt(v){return Math.round(avNum(v)).toLocaleString('es-PE');}
function avFechaHoy(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
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
  return `${avanceEstado.fecha}|${avanceEstado.turno}|AVANCE|${hora}`;
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

function avParadasLinea(linea,hora,tipo){
  const corte=avCorteMs(hora,tipo),out=[];
  avRegistros().filter(r=>r.linea===linea).forEach(r=>{
    (typeof normalizarCuadros==='function'?normalizarCuadros(r):(r.cuadros||[])).forEach(q=>{
      const ini=avHoraMs(avanceEstado.fecha,q.horaInicio,avanceEstado.turno);
      if(ini&&ini>corte)return;
      (q.paradasProgramadas||[]).forEach(p=>{
        if(p?.descripcion&&avNum(p.tiempoMin)>0)out.push({
          descripcion:p.descripcion,minutos:avNum(p.tiempoMin),tipo:'PROGRAMADA',
          maquina:p.maquina||p.equipo||'',observacion:p.observacion||p.observaciones||'',origen:'REGISTRO'
        });
      });
      (q.paradasNoProgramadas||[]).forEach(p=>{
        if(p?.descripcion&&avNum(p.tiempoMin)>0)out.push({
          descripcion:p.descripcion,minutos:avNum(p.tiempoMin),tipo:'NO_PROGRAMADA',
          maquina:p.maquina||p.equipo||'',observacion:p.observacion||p.observaciones||'',origen:'REGISTRO'
        });
      });
    });
  });
  return out;
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

  // Respaldo transparente: volumen ponderado por la producción * Ratio turno.
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
  const actividad=
    !!inicio ||
    productos.some(x=>x.produccion>0) ||
    avProgramaciones().some(p=>p.linea===linea) ||
    avPaletas().some(p=>p.linea===linea);

  if(!actividad)return null;

  const corte=tipo==='CIERRE'?(avFinLinea(linea)||avCtx().fin):hora;
  const minTurno=inicio?avMinEntre(avanceEstado.fecha,inicio,corte,avanceEstado.turno):0;
  const paradas=avParadasLinea(linea,hora,tipo);
  const totalParadas=paradas.reduce((s,p)=>s+p.minutos,0);

  // Ratio Turno del reporte:
  // producción acumulada / horas efectivas.
  // Horas efectivas = tiempo transcurrido - paradas acumuladas.
  const minutosEfectivos=Math.max(0,minTurno-totalParadas);
  const ratio=minutosEfectivos>0?produccionTotal/(minutosEfectivos/60):0;

  return {
    linea,nombre:AVANCE_NOMBRES[linea],inicio,
    fin:tipo==='CIERRE'?(avFinLinea(linea)||corte):'',
    productos,produccionTotal,
    programado:avProgramadoLinea(linea),
    cumplimiento:avProgramadoLinea(linea)>0?(produccionTotal/avProgramadoLinea(linea))*100:0,
    ratio,unidadRatio:avUnidadRatio(linea),
    consumo:avConsumoLinea(linea,productos,ratio),
    personal:avPersonalLinea(linea),paradas,totalParadas,
    paradasProgramadas:paradas.filter(p=>p.tipo==='PROGRAMADA').reduce((s,p)=>s+p.minutos,0),
    paradasNoProgramadas:paradas.filter(p=>p.tipo==='NO_PROGRAMADA').reduce((s,p)=>s+p.minutos,0),
    observaciones:avObservacionesLinea(linea),
    minutosTranscurridos:minTurno,minutosEfectivos,
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
  const cumplimiento=totalProgramado>0?(totalPlanta/totalProgramado)*100:0;
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

function avTextoWhatsApp(s){
  const fecha=s.fecha.split('-').reverse().join('/');
  const out=[
    `*${s.tipo==='CIERRE'?'CIERRE DE PRODUCCIÓN':'AVANCE DE PRODUCCIÓN'} – TURNO ${s.turno}*`,
    '',
    `*Fecha: ${fecha}*`,
    `*Hora: ${s.horaCorte}*`
  ];
  s.lineas.forEach((l,idx)=>{
    out.push('',`*${l.nombre}*`,'',`Inicio: ${l.inicio||'—'}`);
    if(s.tipo==='CIERRE')out.push(`Término: ${l.fin||'—'}`);
    out.push('');
    if(l.sinProduccion)out.push('Línea iniciada – Sin producción registrada.');
    else l.productos.filter(p=>p.produccion>0).forEach(p=>out.push(`${avProductoWhatsApp(p)}: ${avFmt(p.produccion)} ${avUnidadProduccion(l.linea)}`));
    out.push('',`Ratio Turno: ${l.ratio?avFmt(l.ratio)+' '+l.unidadRatio:'—'}`);
    out.push(`Consumo: ${l.consumo?avFmt(l.consumo)+' L/H':'—'}`);
    out.push(`Personal en línea: ${l.personal}`);
    if(!l.sinProduccion)out.push('',`Producción total: ${avFmt(l.produccionTotal)} ${avUnidadProduccion(l.linea)}`);
    out.push('','*PARADAS*','');
    if(l.paradas.length)l.paradas.forEach(p=>out.push(`${p.descripcion} – ${avFmt(p.minutos)} min`));
    else out.push('Sin paradas registradas.');
    out.push('',`Total paradas: ${avFmt(l.totalParadas)} min`);
    if(idx<s.lineas.length-1)out.push('','---');
  });
  out.push('','====================','');
  if(s.tipo==='CIERRE'){
    out.push('*RESUMEN GENERAL DEL TURNO*','',
      `Producción total planta: ${avFmt(s.resumen.produccionTotal)}`,
      `Tiempo total de paradas: ${avFmt(s.resumen.totalParadas)} min`,
      `Personal registrado: ${s.resumen.personal}`,
      `Líneas trabajadas: ${s.resumen.lineasTrabajadas}`);
  }else{
    out.push('*TOTAL PLANTA*','',
      `Producción acumulada: ${avFmt(s.resumen.produccionTotal)}`,
      `Tiempo total de paradas: ${avFmt(s.resumen.totalParadas)} min`,
      `Personal operativo: ${s.resumen.personal}`);
  }
  out.push('','Generado por:',s.supervisor||s.generadoPor||'—','','GLACIAL - Control de Producción');
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
  return turno==='NOCHE'?['01:00','03:00','05:00']:['09:00','11:00','13:00','15:00','17:00'];
}
function avSlotActual(){
  const slots=avSlotsTurno(avanceEstado.turno);
  const ahora=Date.now();
  const pasados=slots.filter(h=>avHoraMs(avanceEstado.fecha,h,avanceEstado.turno)<=ahora);
  return pasados.slice(-1)[0]||slots[0];
}
function avSnapshotPorReferencia(tipo,ref){
  return avanceEstado.snapshots.find(s=>s.tipo===tipo&&(tipo==='CIERRE'||s.horaReferencia===ref))||null;
}
async function avGenerar(hora,tipo='AVANCE'){
  try{
    if(!avPuedeGenerar())throw Error('Tu usuario tiene acceso de consulta y no puede generar avances o cierres.');
    const ctx=avCtx();
    avanceEstado.fecha=ctx.fecha;
    avanceEstado.turno=ctx.turno;
    const referencia=tipo==='CIERRE'?'CIERRE':(hora||avSlotActual());
    if(avSnapshotPorReferencia(tipo,referencia)){
      throw Error(tipo==='CIERRE'?'El cierre de este turno ya existe.':`El avance ${referencia} ya fue generado.`);
    }
    const s=avConstruirSnapshot(referencia,tipo);
    await avGuardarSnapshot(s);
    avanceEstado.preview=s.texto||'';
    avanceEstado.previewId=s.id;
    avAviso(tipo==='CIERRE'?'Cierre generado correctamente.':'Avance generado correctamente.');
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
    avanceEstado.todosSnapshots=doc.exists&&Array.isArray(doc.data().items)?doc.data().items:[];
    avAplicarSeleccion();
    if(state.currentTab==='avance-produccion')avDibujar();
    avInstalarBotonFlotante();
    if(document.getElementById('av-float-modal')?.classList.contains('open'))avDibujarFlotante();
  },e=>{
    console.error('Avances turno:',e);
    avAviso('No se pudo sincronizar el historial de avances.');
  });
}
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
  return avSlotsTurno(avanceEstado.turno).map(h=>({hora:h,snapshot:avSnapshotPorReferencia('AVANCE',h)}));
}
function avProximoAvance(){
  const pendiente=avEstadoSlots().find(x=>!x.snapshot);
  return pendiente?.hora||'Completados';
}
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
          <div><small>PRÓXIMO AVANCE</small><strong>${avEsc(avProximoAvance())}</strong><span>${slots.filter(x=>x.snapshot).length}/${slots.length} generados</span></div>
        </section>
        <div class="av-slot-strip">
          ${slots.map(x=>`<div class="${x.snapshot?'done':'pending'}"><b>${x.hora}</b><span>${x.snapshot?'✓ Generado':'○ Pendiente'}</span></div>`).join('')}
          <div class="${cierre?'done':'pending'}"><b>${ctx.fin}</b><span>${cierre?'✓ Cierre':'○ Cierre'}</span></div>
        </div>
        ${avPuedeGenerar()?`<div class="av-float-actions">
          <button class="btn btn-primary" onclick="avGenerarAhora()">GENERAR AVANCE AHORA</button>
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
  </div>`;
}
async function avGenerarAhora(){
  const slot=avSlotActual();
  await avGenerar(slot,'AVANCE');
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

function avCanvasSnapshot(s){
  const W=1080,H=1350,c=document.createElement('canvas');
  c.width=W;c.height=H;
  const x=c.getContext('2d');

  const BLUE='#005B96',DARK='#003B5C',INK='#172B3A',STEEL='#667784',
        MUTED='#87949D',BG='#F3F6F8',LINE='#DCE3E8',WHITE='#FFFFFF',
        GOOD='#2E8B57',WARN='#D89216',BAD='#C0392B';

  const rr=(cx,cy,cw,ch,r=10)=>{
    x.beginPath();
    x.moveTo(cx+r,cy);x.arcTo(cx+cw,cy,cx+cw,cy+ch,r);
    x.arcTo(cx+cw,cy+ch,cx,cy+ch,r);x.arcTo(cx,cy+ch,cx,cy,r);
    x.arcTo(cx,cy,cx+cw,cy,r);x.closePath();
  };
  const card=(cx,cy,cw,ch,fill=WHITE,stroke=LINE)=>{
    x.fillStyle=fill;rr(cx,cy,cw,ch,9);x.fill();
    x.strokeStyle=stroke;x.lineWidth=1;rr(cx,cy,cw,ch,9);x.stroke();
  };
  const section=(title,y)=>{
    x.fillStyle=BLUE;rr(24,y,W-48,52,8);x.fill();
    x.fillStyle=WHITE;x.font='700 23px Arial';x.fillText(title,42,y+34);
  };
  const textFit=(txt,maxWidth,fontSize=18,weight='400')=>{
    let size=fontSize;
    do{x.font=`${weight} ${size}px Arial`;size--;}while(size>10&&x.measureText(String(txt)).width>maxWidth);
    return x.font;
  };

  x.fillStyle=BG;x.fillRect(0,0,W,H);

  /* HEADER */
  x.fillStyle=DARK;x.fillRect(0,0,W,190);
  x.fillStyle=WHITE;
  x.font='700 31px Arial';x.fillText('GLACIAL',55,56);
  x.font='700 42px Arial';x.fillText(s.tipo==='CIERRE'?'CIERRE DE PRODUCCIÓN':'AVANCE DE PRODUCCIÓN',275,62);
  x.font='700 27px Arial';x.fillText(`TURNO ${s.turno}`,275,102);
  x.font='20px Arial';
  x.fillText(`Fecha: ${avFechaBonita(s.fecha)}`,55,158);
  x.fillText(`Hora: ${s.horaCorte||'—'}`,335,158);
  x.fillText(`Turno: ${s.turno} (${avTurnoHorario(s.turno,s)})`,555,158);

  /* PRODUCCIÓN POR LÍNEA — sin tarjetas KPI superiores */
  let y=215;
  section('PRODUCCIÓN POR LÍNEA',y);y+=66;

  const lineas=(s.lineas||[]).slice(0,6);
  const rowH=105;

  lineas.forEach(l=>{
    card(24,y,W-48,rowH);
    x.fillStyle='#EAF5FC';rr(24,y,160,rowH,9);x.fill();

    x.fillStyle=DARK;x.font='700 25px Arial';
    textFit(l.nombre||l.linea,125,25,'700');
    x.fillText(l.nombre||l.linea,46,y+40);

    const prodUnidad=avUnidadProduccion(l.linea).toUpperCase();
    const cols=[
      {x:205,w:145,t:'Producción',v:`${avFmt(l.produccionTotal)} ${prodUnidad}`},
      {x:355,w:135,t:'Inicio de línea',v:l.inicio||'—'},
      {x:495,w:210,t:'Estado',v:l.produccionTotal>0?'En producción':'Línea iniciada',sub:l.produccionTotal>0?'Producción registrada.':'Sin producción registrada.'},
      {x:710,w:95,t:'Personal',v:avFmt(l.personal)},
      {x:810,w:115,t:'Ratio Turno',v:l.ratio?`${avFmt(l.ratio)}`:'—',sub:l.ratio?l.unidadRatio:''},
      {x:930,w:120,t:'Consumo',v:l.consumo?`${avFmt(l.consumo)}`:'—',sub:l.consumo?'L/H':''}
    ];

    cols.forEach((col,i)=>{
      if(i>0){x.strokeStyle='#E3E9ED';x.beginPath();x.moveTo(col.x-10,y+18);x.lineTo(col.x-10,y+87);x.stroke();}
      x.fillStyle=STEEL;x.font='14px Arial';x.fillText(col.t,col.x,y+29);
      x.fillStyle=i===2?(l.produccionTotal>0?GOOD:WARN):INK;
      textFit(col.v,col.w-8,19,'700');x.fillText(col.v,col.x,y+55);
      if(col.sub){x.fillStyle=MUTED;textFit(col.sub,col.w-6,12,'400');x.fillText(col.sub,col.x,y+77);}
    });
    y+=rowH+10;
  });

  /* PARADAS */
  y+=6;section('PARADAS',y);y+=66;
  const r=s.resumen||{};
  const stopW=(W-72)/3;
  const stops=[
    {title:'PROGRAMADAS',value:`${avFmt(r.totalParadasProgramadas)} min`,sub:'Sin paradas registradas.',fill:'#FFF8E8',accent:WARN},
    {title:'NO PROGRAMADAS',value:`${avFmt(r.totalParadasNoProgramadas)} min`,sub:'Sin paradas registradas.',fill:'#FDEEEE',accent:BAD},
    {title:'TOTAL',value:`${avFmt(r.totalParadas)} min`,sub:'Tiempo total de paradas.',fill:'#F3F8FB',accent:BLUE}
  ];
  stops.forEach((st,i)=>{
    const cx=24+i*(stopW+12);
    card(cx,y,stopW,120,st.fill,LINE);
    x.fillStyle=st.accent;x.beginPath();x.arc(cx+35,y+37,16,0,Math.PI*2);x.fill();
    x.fillStyle=STEEL;x.font='700 15px Arial';x.fillText(st.title,cx+66,y+30);
    x.fillStyle=DARK;x.font='700 27px Arial';x.fillText(st.value,cx+66,y+62);
    x.fillStyle=STEEL;x.font='13px Arial';x.fillText(st.sub,cx+66,y+87);
  });
  y+=138;

  /* PERSONAL */
  card(24,y,W-48,64,'#F8FBFD',LINE);
  x.fillStyle=BLUE;x.font='700 18px Arial';x.fillText('PERSONAL OPERATIVO',82,y+39);
  x.textAlign='right';x.fillStyle=DARK;x.font='700 20px Arial';x.fillText(`Total: ${avFmt(r.personal)}`,W-48,y+39);x.textAlign='left';
  y+=80;

  /* OBSERVACIONES */
  const observaciones=[...new Set((s.lineas||[]).flatMap(l=>l.observaciones||[]).filter(Boolean))];
  card(24,y,W-48,100,'#F8FBFD',LINE);
  x.fillStyle=DARK;x.font='700 17px Arial';x.fillText('OBSERVACIONES',82,y+31);
  x.fillStyle=STEEL;x.font='14px Arial';
  const obs=observaciones.length?observaciones.slice(0,2).join(' · '):'—  Sin observaciones registradas.';
  textFit(obs,W-150,14,'400');x.fillText(obs,82,y+62);

  /* FOOTER */
  const footerY=1265;
  x.strokeStyle=LINE;x.beginPath();x.moveTo(24,footerY-22);x.lineTo(W-24,footerY-22);x.stroke();
  x.fillStyle=STEEL;x.font='16px Arial';x.fillText('Generado por:',30,footerY+10);
  x.fillStyle=INK;x.font='700 17px Arial';x.fillText(s.supervisor||s.generadoPor||'—',165,footerY+10);
  x.fillStyle=DARK;x.font='700 22px Arial';x.textAlign='right';x.fillText('GLACIAL',W-55,footerY+10);
  x.fillStyle=STEEL;x.font='14px Arial';x.fillText('Control de Producción',W-55,footerY+32);x.textAlign='left';
  x.fillStyle=STEEL;x.font='14px Arial';x.fillText(`${avFechaBonita(s.fecha)} ${s.horaCorte||''}`,165,footerY+35);

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
  avRestaurarPosicionFlotante(btn);let drag=false,movio=false,ox=0,oy=0;
  btn.addEventListener('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;const r=btn.getBoundingClientRect();drag=true;movio=false;ox=e.clientX-r.left;oy=e.clientY-r.top;btn.classList.add('dragging');try{btn.setPointerCapture(e.pointerId)}catch(_){}e.preventDefault();});
  btn.addEventListener('pointermove',e=>{if(!drag)return;const p=avLimitarPosicionFlotante(btn,e.clientX-ox,e.clientY-oy);movio=true;btn.style.left=p.left+'px';btn.style.top=p.top+'px';btn.style.right='auto';btn.style.bottom='auto';e.preventDefault();});
  btn.addEventListener('pointerup',e=>{if(!drag)return;drag=false;btn.classList.remove('dragging');try{btn.releasePointerCapture(e.pointerId)}catch(_){}avGuardarPosicionFlotante(btn);if(!movio)avAbrirFlotante();});
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
  const slots=avSlotsTurno(avanceEstado.turno),cierre=avUltimoSnapshot('CIERRE');
  return `<div class="av-timeline">${slots.map(h=>{const s=avSnapshotPorReferencia('AVANCE',h);return `<div class="av-time-row ${s?'done':'pending'}"><time>${h}</time><div><b>${s?'AVANCE DE PRODUCCIÓN':'AVANCE PENDIENTE'}</b>${s?`<small>Generado ${avEsc(s.horaCorte)} por ${avEsc(s.supervisor||s.generadoPor||'—')}</small>${avAccionesSnapshot(s)}`:'<small>Sin generar</small>'}</div></div>`}).join('')}<div class="av-time-row ${cierre?'done':'pending'}"><time>${avCtx().fin}</time><div><b>${cierre?'CIERRE DE TURNO':'CIERRE PENDIENTE'}</b>${cierre?`<small>Generado por ${avEsc(cierre.supervisor||cierre.generadoPor||'—')}</small>${avAccionesSnapshot(cierre)}`:'<small>Sin generar</small>'}</div></div></div>`;
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
    ${actual&&avPuedeGenerar()?`<div class="av-module-actions"><button class="btn btn-primary" onclick="avGenerarAhora()">GENERAR AVANCE AHORA</button><button class="btn btn-ghost" onclick="avGenerarCierreAhora()">GENERAR CIERRE DE TURNO</button></div>`:''}
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
@media(max-width:900px){.av-module-grid{grid-template-columns:1fr}.av-detail-kpis{grid-template-columns:repeat(2,1fr)}.av-slot-strip{grid-template-columns:repeat(3,1fr)}}
@media(max-width:700px){.av2-head{display:block}.av2-context{text-align:left;margin-top:10px}.av-module-actions{display:grid}.av-float-modal,.av-detail-modal,.av-image-modal{padding:0}.av-float-dialog,.av-detail-dialog,.av-image-dialog{width:100%;height:100dvh;max-height:100dvh;border-radius:0}.av-float-actions{grid-template-columns:1fr}.av-shift-status{grid-template-columns:1fr 1fr}.av-detail-kpis{grid-template-columns:1fr 1fr}.av-line-metrics{grid-template-columns:1fr 1fr}.av-personal-grid{grid-template-columns:1fr}.av-detail-footer,.av-image-dialog>footer{flex-wrap:wrap}.av-floating-trigger{right:12px;bottom:12px}.av-slot-strip{grid-template-columns:repeat(2,1fr)}}
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
