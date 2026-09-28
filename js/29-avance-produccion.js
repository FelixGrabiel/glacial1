/* =============================================================
   AVANCE Y CIERRE DE TURNO — GLACIAL
   Snapshot automático desde datos existentes.
   No modifica producción, paletas, tareos ni paradas originales.
   ============================================================= */

const AVANCE_LINEAS=['PET1','PET2','B7L','C20L','B20L','HIELO'];
const AVANCE_NOMBRES={PET1:'PET1',PET2:'PET2',B7L:'B7L',C20L:'CAJAS 20L',B20L:'B20L',HIELO:'HIELO'};
const AVANCE_HORARIOS={DÍA:['09:00','11:00','13:00','15:00','17:00'],NOCHE:['01:00','03:00','05:00']};
const avanceEstado={fecha:'',turno:'',horaCorte:'',tipo:'AVANCE',snapshots:[],preview:'',unsubscribe:null};

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
  /* Cada avance es un snapshot independiente. */
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
   PRODUCCIÓN PARA AVANCE / CIERRE
   Fuente oficial: registros de PALETAS.

   IMPORTANTE:
   En Paletas, "Paletas completas acumuladas" es un ACUMULADO.
   Por eso NO se deben sumar todos los registros históricos:
   se toma el último estado de paletas completas hasta el corte
   + el último saldo/incompleta hasta el corte.

   Nuevo Registro (Botellas efectivas) ya NO alimenta la cantidad
   producida del Avance/Cierre.
*/
function avProduccionHasta(linea,marca,presentacion,hora,tipo){
  const corte=avCorteMs(hora,tipo);

  const pal=avPaletas()
    .filter(x=>
      x.linea===linea &&
      x.marca===marca &&
      x.presentacion===presentacion
    )
    .map((x,indice)=>{
      let ms=Number(x.creadoEn||x.actualizadoEn||0);

      // La hora ingresada por el supervisor representa el momento
      // operativo real del registro y tiene prioridad para el corte.
      if(x.hora){
        ms=avHoraMs(
          avanceEstado.fecha,
          x.hora,
          avanceEstado.turno
        );
      }

      return {registro:x,ms,indice};
    })
    .filter(x=>!x.ms || !corte || x.ms<=corte);

  if(!pal.length)return 0;

  let completas=null;
  let saldo=null;

  const esMasReciente=(actual,candidato)=>{
    if(!actual)return true;
    if(candidato.ms!==actual.ms)return candidato.ms>actual.ms;
    return candidato.indice>actual.indice;
  };

  pal.forEach(item=>{
    const tipoPaleta=String(item.registro?.tipoPaleta||'').toUpperCase();

    if(tipoPaleta==='INCOMPLETA'){
      if(esMasReciente(saldo,item))saldo=item;
    }else{
      if(esMasReciente(completas,item))completas=item;
    }
  });

  const unidadesCompletas=avNum(
    completas?.registro?.totalUnidades
  );

  const unidadesSaldo=avNum(
    saldo?.registro?.totalUnidades ??
    saldo?.registro?.unidadesIncompleta
  );

  return unidadesCompletas+unidadesSaldo;
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
      [...(q.paradasProgramadas||[]),...(q.paradasNoProgramadas||[])].forEach(p=>{
        if(p?.descripcion&&avNum(p.tiempoMin)>0)out.push({descripcion:p.descripcion,minutos:avNum(p.tiempoMin),origen:'REGISTRO'});
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
  return [...mapa.values()].map(x=>({...x,produccion:avProduccionHasta(linea,x.marca,x.presentacion,hora,tipo)}));
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
    productos,produccionTotal,ratio,unidadRatio:avUnidadRatio(linea),
    consumo:avConsumoLinea(linea,productos,ratio),
    personal:avPersonalLinea(linea),paradas,totalParadas,
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
  const personalSet=lineas.reduce((s,l)=>s+l.personal,0);
  const totalPlanta=lineas.reduce((s,l)=>s+l.produccionTotal,0);
  const snap={
    id:avSnapshotId(tipo,hora),fecha:avanceEstado.fecha,turno:avanceEstado.turno,
    tipo,horaCorte:horaReal,
    horaReferencia:tipo==='CIERRE'?'CIERRE':hora,
    supervisor:avNombreUsuario(),generadoPor:state.user?.username||'',
    generadoEn:Date.now(),estado:'GENERADO',lineas,
    resumen:{produccionTotal:totalPlanta,totalParadas,personal:personalSet,lineasTrabajadas:lineas.length}
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

function avTextoWhatsApp(s){
  const fecha=s.fecha.split('-').reverse().join('/');
  const out=[
    `*${s.tipo==='CIERRE'?'CIERRE DE PRODUCCIÓN':'AVANCE DE PRODUCCIÓN'} – TURNO ${s.turno}*`,
    '',
    `*Fecha: ${fecha}*`,
    `*Hora de corte: ${s.horaCorte}*`
  ];
  s.lineas.forEach((l,idx)=>{
    out.push('',`*${l.nombre}*`,'',`Inicio: ${l.inicio||'—'}`);
    if(s.tipo==='CIERRE')out.push(`Término: ${l.fin||'—'}`);
    out.push('');
    if(l.sinProduccion)out.push('Línea iniciada – Sin producción registrada.');
    else l.productos.filter(p=>p.produccion>0).forEach(p=>out.push(`${avProductoWhatsApp(p)}: ${avFmt(p.produccion)} und`));
    out.push('',`Ratio Turno: ${l.ratio?avFmt(l.ratio)+' '+l.unidadRatio:'—'}`);
    out.push(`Consumo: ${l.consumo?avFmt(l.consumo)+' L/H':'—'}`);
    out.push(`Personal en línea: ${l.personal}`);
    if(!l.sinProduccion)out.push('',`Producción total: ${avFmt(l.produccionTotal)} und`);
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
  return out.join('\n');
}

async function avGuardarSnapshot(s){
  const ref=avRef();
  await db.runTransaction(async tx=>{
    const doc=await tx.get(ref);
    const arr=doc.exists&&Array.isArray(doc.data().items)?doc.data().items.slice():[];
    const idx=arr.findIndex(x=>x.id===s.id);
    if(idx>=0)arr[idx]=s; else arr.push(s);
    tx.set(ref,{items:arr,updatedAt:Date.now()},{merge:true});
  });
  avanceEstado.preview=s.texto;
}

async function avGenerar(hora,tipo='AVANCE'){
  try{
    const s=avConstruirSnapshot(hora,tipo);
    await avGuardarSnapshot(s);
    avAviso(tipo==='CIERRE'?'Cierre generado correctamente.':'Avance generado correctamente.');
    avEscuchar();
  }catch(e){console.error(e);alert(e.message||'No se pudo generar el avance.');}
}
async function avCopiar(id){
  const s=avanceEstado.snapshots.find(x=>x.id===id);
  if(!s)return;
  try{await navigator.clipboard.writeText(s.texto);}
  catch{
    const ta=document.getElementById('av-preview');if(ta){ta.value=s.texto;ta.select();document.execCommand('copy');}
  }
  s.estado='COPIADO';s.copiadoEn=Date.now();s.copiadoPor=state.user?.username||'';
  await avGuardarSnapshot(s);
  avAviso(s.tipo==='CIERRE'?'Cierre copiado correctamente.':'Avance copiado correctamente.');
  avEscuchar();
}
function avVer(id){
  const s=avanceEstado.snapshots.find(x=>x.id===id);
  if(s){avanceEstado.preview=s.texto;avDibujar();}
}
function avAviso(t){const e=document.getElementById('av-estado');if(e)e.textContent=t;}

function avEscuchar(){
  if(avanceEstado.unsubscribe)avanceEstado.unsubscribe();
  avanceEstado.unsubscribe=avRef().onSnapshot(doc=>{
    const todos=doc.exists&&Array.isArray(doc.data().items)?doc.data().items:[];
    avanceEstado.snapshots=todos.filter(x=>x.fecha===avanceEstado.fecha&&x.turno===avanceEstado.turno);
    if(state.currentTab==='avance-produccion')avDibujar();
    avInstalarBotonFlotante();
    if(document.getElementById('av-float-modal')?.classList.contains('open'))avDibujarFlotante();
  },e=>{console.error('Avances turno:',e);avAviso('No se pudo sincronizar el historial de avances.');});
}
function avUltimoSnapshot(tipo){
  return avanceEstado.snapshots
    .filter(x=>x.tipo===tipo)
    .slice()
    .sort((a,b)=>avNum(b.generadoEn)-avNum(a.generadoEn))[0]||null;
}

function avAbrirFlotante(){
  avInstalarEstilos();
  const ctx=avCtx();
  avanceEstado.fecha=ctx.fecha;
  avanceEstado.turno=ctx.turno;

  // El flotante puede abrirse desde cualquier pantalla, incluso si
  // nunca se abrió antes el módulo Avance y Cierre.
  if(!avanceEstado.unsubscribe)avEscuchar();

  let modal=document.getElementById('av-float-modal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='av-float-modal';
    modal.className='av-float-modal';
    modal.addEventListener('click',e=>{
      if(e.target===modal)avCerrarFlotante();
    });
    document.body.appendChild(modal);
  }
  modal.classList.add('open');
  avDibujarFlotante();
}
function avCerrarFlotante(){
  document.getElementById('av-float-modal')?.classList.remove('open');
}
function avDibujarFlotante(){
  const modal=document.getElementById('av-float-modal');
  if(!modal)return;
  const ctx=avCtx();
  const ultimo=avUltimoSnapshot('AVANCE');
  const cierre=avUltimoSnapshot('CIERRE');
  const ahora=avHoraActual();

  modal.innerHTML=`
    <div class="av-float-dialog" role="dialog" aria-modal="true" aria-label="Avance y cierre de turno">
      <header class="av-float-head">
        <div>
          <h2>Avance y cierre de turno</h2>
          <p>${avEsc(avanceEstado.fecha||ctx.fecha)} · Turno ${avEsc(avanceEstado.turno||ctx.turno)} · ${ahora}</p>
        </div>
        <button type="button" class="av-float-x" onclick="avCerrarFlotante()" aria-label="Cerrar">✕</button>
      </header>

      <div class="av-float-body">
        <div class="av-float-actions">
          <button type="button" class="btn btn-primary" onclick="avGenerarAhora()">GENERAR AVANCE AHORA</button>
          <button type="button" class="btn btn-ghost" onclick="avGenerarCierreAhora()">GENERAR CIERRE DE TURNO</button>
        </div>

        <section class="av-float-last">
          <div class="av-float-last-head">
            <div>
              <small>ÚLTIMO AVANCE</small>
              <strong>${ultimo?`Generado ${avEsc(ultimo.horaCorte)}`:'Todavía no generado'}</strong>
            </div>
            ${ultimo?`<span>${avEsc(ultimo.estado||'GENERADO')}</span>`:''}
          </div>
          ${ultimo?`
            <div class="av-float-last-actions">
              <button type="button" class="btn btn-ghost btn-sm" onclick="avVerFlotante('${ultimo.id}')">VER</button>
              <button type="button" class="btn btn-primary btn-sm" onclick="avCopiar('${ultimo.id}')">COPIAR PARA WHATSAPP</button>
            </div>`:''}
        </section>

        ${cierre?`
        <section class="av-float-last">
          <div class="av-float-last-head">
            <div><small>CIERRE DE TURNO</small><strong>Generado ${avEsc(cierre.horaCorte)}</strong></div>
            <span>${avEsc(cierre.estado||'GENERADO')}</span>
          </div>
          <div class="av-float-last-actions">
            <button type="button" class="btn btn-ghost btn-sm" onclick="avVerFlotante('${cierre.id}')">VER</button>
            <button type="button" class="btn btn-primary btn-sm" onclick="avCopiar('${cierre.id}')">COPIAR CIERRE</button>
          </div>
        </section>`:''}

        <section class="av-float-preview">
          <div class="av-float-preview-head">
            <strong>Vista previa para WhatsApp</strong>
            <small>${avanceEstado.preview?'Lista para copiar':'Genera o selecciona un avance'}</small>
          </div>
          <textarea id="av-float-preview" readonly placeholder="Aquí aparecerá el avance o cierre.">${avEsc(avanceEstado.preview)}</textarea>
        </section>
      </div>
    </div>`;
}
async function avGenerarAhora(){
  await avGenerar(avHoraActual(),'AVANCE');
  const ultimo=avUltimoSnapshot('AVANCE');
  if(ultimo)avanceEstado.preview=ultimo.texto||'';
  avDibujarFlotante();
}
async function avGenerarCierreAhora(){
  if(!confirm('¿Generar el cierre de turno con la información registrada hasta este momento?'))return;
  await avGenerar(avHoraActual(),'CIERRE');
  const cierre=avUltimoSnapshot('CIERRE');
  if(cierre)avanceEstado.preview=cierre.texto||'';
  avDibujarFlotante();
}
function avVerFlotante(id){
  const s=avanceEstado.snapshots.find(x=>x.id===id);
  if(!s)return;
  avanceEstado.preview=s.texto||'';
  avDibujarFlotante();
}

function avPantallaOperativaVisible(){
  const app=document.getElementById('app-screen');
  const selector=document.getElementById('report-select-screen');

  const appVisible=
    !!app &&
    getComputedStyle(app).display!=='none';

  const selectorVisible=
    !!selector &&
    getComputedStyle(selector).display!=='none';

  return appVisible && !selectorVisible;
}

function avLimitarPosicionFlotante(btn,left,top){
  const margen=8;
  const maxLeft=Math.max(margen,window.innerWidth-btn.offsetWidth-margen);
  const maxTop=Math.max(margen,window.innerHeight-btn.offsetHeight-margen);
  return {
    left:Math.min(Math.max(margen,left),maxLeft),
    top:Math.min(Math.max(margen,top),maxTop)
  };
}

function avGuardarPosicionFlotante(btn){
  try{
    const r=btn.getBoundingClientRect();
    localStorage.setItem('glacial_avance_flotante_pos',JSON.stringify({
      left:Math.round(r.left),
      top:Math.round(r.top)
    }));
  }catch(_){}
}

function avRestaurarPosicionFlotante(btn){
  try{
    const raw=localStorage.getItem('glacial_avance_flotante_pos');
    if(!raw)return;
    const pos=JSON.parse(raw);
    if(!Number.isFinite(pos.left)||!Number.isFinite(pos.top))return;
    const p=avLimitarPosicionFlotante(btn,pos.left,pos.top);
    btn.style.left=p.left+'px';
    btn.style.top=p.top+'px';
    btn.style.right='auto';
    btn.style.bottom='auto';
  }catch(_){}
}

function avActivarArrastre(btn){
  avRestaurarPosicionFlotante(btn);

  let arrastrando=false;
  let movio=false;
  let offsetX=0;
  let offsetY=0;

  const iniciar=e=>{
    if(e.pointerType==='mouse' && e.button!==0)return;
    const r=btn.getBoundingClientRect();
    arrastrando=true;
    movio=false;
    offsetX=e.clientX-r.left;
    offsetY=e.clientY-r.top;
    btn.classList.add('dragging');
    try{btn.setPointerCapture(e.pointerId);}catch(_){}
    e.preventDefault();
  };

  const mover=e=>{
    if(!arrastrando)return;
    const p=avLimitarPosicionFlotante(
      btn,
      e.clientX-offsetX,
      e.clientY-offsetY
    );
    if(Math.abs(e.clientX-(p.left+offsetX))>2 ||
       Math.abs(e.clientY-(p.top+offsetY))>2)movio=true;
    btn.style.left=p.left+'px';
    btn.style.top=p.top+'px';
    btn.style.right='auto';
    btn.style.bottom='auto';
    e.preventDefault();
  };

  const terminar=e=>{
    if(!arrastrando)return;
    arrastrando=false;
    btn.classList.remove('dragging');
    try{btn.releasePointerCapture(e.pointerId);}catch(_){}
    avGuardarPosicionFlotante(btn);

    if(!movio){
      avAbrirFlotante();
    }
  };

  btn.addEventListener('pointerdown',iniciar);
  btn.addEventListener('pointermove',mover);
  btn.addEventListener('pointerup',terminar);
  btn.addEventListener('pointercancel',()=>{
    arrastrando=false;
    btn.classList.remove('dragging');
  });

  window.addEventListener('resize',()=>{
    if(!document.body.contains(btn))return;
    const r=btn.getBoundingClientRect();
    const p=avLimitarPosicionFlotante(btn,r.left,r.top);
    btn.style.left=p.left+'px';
    btn.style.top=p.top+'px';
    btn.style.right='auto';
    btn.style.bottom='auto';
    avGuardarPosicionFlotante(btn);
  });
}

function avInstalarBotonFlotante(){
  avInstalarEstilos();

  const existente=document.getElementById('av-floating-trigger');

  /*
     El acceso flotante pertenece al sistema operativo de AGUA.
     No debe aparecer en Login ni en la pantalla inicial donde se
     selecciona Reporte Agua / Reporte Hielo.
  */
  if(
    !state?.user ||
    !tienePermiso('avanceProduccion') ||
    !avPantallaOperativaVisible()
  ){
    existente?.remove();
    return;
  }

  if(existente)return;
  const b=document.createElement('button');
  b.id='av-floating-trigger';
  b.type='button';
  b.className='av-floating-trigger';
  b.innerHTML='<span class="av-drag-handle" title="Arrastrar">⋮⋮</span><span>▤</span><b>AVANCE / CIERRE</b>';
  document.body.appendChild(b);
  avActivarArrastre(b);
}

function renderAvanceProduccion(main){
  avInstalarEstilos();
  if(!tienePermiso('avanceProduccion'))return;
  const ctx=avCtx();
  avanceEstado.fecha=ctx.fecha;
  avanceEstado.turno=ctx.turno;
  main.innerHTML=`<section class="av2">
    <div class="av2-head">
      <div><h2>AVANCE Y CIERRE DE TURNO</h2><p>Generación rápida con información actual de Producción, Paletas, Paradas y Tareo.</p></div>
      <div class="av2-context"><b>Turno actual: ${avEsc(ctx.turno)}</b><span>Supervisor: ${avEsc(avNombreUsuario())}</span></div>
    </div>
    <div class="av2-simple">
      <button class="btn btn-primary" onclick="avAbrirFlotante()">ABRIR AVANCE / CIERRE</button>
      <p>También puedes usar el botón flotante disponible mientras trabajas en otros módulos.</p>
    </div>
    <section class="av2-history">
      <h3>Historial de avances</h3>
      <div id="av-history-list"></div>
    </section>
  </section>`;
  avInstalarBotonFlotante();
  if(!avanceEstado.unsubscribe)avEscuchar(); else avDibujar();
}

function avDibujar(){
  const list=document.getElementById('av-history-list');
  if(list){
    list.innerHTML=avanceEstado.snapshots.length
      ? avanceEstado.snapshots.slice().sort((a,b)=>avNum(b.generadoEn)-avNum(a.generadoEn)).map(s=>`
        <button type="button" onclick="avVerDesdeModulo('${s.id}')">
          <b>${s.tipo==='CIERRE'?'CIERRE':avEsc(s.horaCorte)}</b>
          <span>${avEsc(s.estado||'GENERADO')}</span>
          <small>${new Date(s.generadoEn).toLocaleString('es-PE')}</small>
        </button>`).join('')
      : '<p class="small-muted">Todavía no hay avances generados para este turno.</p>';
  }
  avInstalarBotonFlotante();
  if(document.getElementById('av-float-modal')?.classList.contains('open'))avDibujarFlotante();
}
function avVerDesdeModulo(id){
  const s=avanceEstado.snapshots.find(x=>x.id===id);
  if(!s)return;
  avanceEstado.preview=s.texto||'';
  avAbrirFlotante();
}

const AVANCE_CSS=`
.av2{padding:4px}
.av2-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:18px 20px;background:#f4f8fb;border:1px solid #d7e3eb;border-left:5px solid #006da8;border-radius:10px}
.av2-head h2{margin:0;color:#082f49}.av2-head p{margin:5px 0 0;color:#647987}.av2-context{display:grid;gap:4px;text-align:right;color:#24475c}
.av2-simple{margin-top:14px;padding:24px;border:1px solid #d7e3eb;border-radius:10px;background:#fff;text-align:center}.av2-simple p{margin:9px 0 0;color:#70828e;font-size:12px}
.av2-history{margin-top:14px;border:1px solid #d7e3eb;border-radius:10px;background:#fff;padding:15px}.av2-history h3{margin:0 0 8px;color:#073f68}
.av2-history button{width:100%;display:grid;grid-template-columns:100px 100px 1fr;gap:8px;text-align:left;padding:9px 10px;margin-top:6px;border:1px solid #e1e8ed;background:#fafcfd;border-radius:7px;cursor:pointer}
.av-floating-trigger{position:fixed;touch-action:none;user-select:none;-webkit-user-select:none;right:22px;bottom:22px;z-index:950;display:flex;align-items:center;gap:8px;padding:12px 16px;border:0;border-radius:999px;background:#005b96;color:#fff;box-shadow:0 10px 30px rgba(0,59,92,.28);cursor:pointer;font-family:inherit}
.av-floating-trigger:hover{background:#003b5c}
.av-floating-trigger.dragging{cursor:grabbing;opacity:.92;box-shadow:0 14px 36px rgba(0,59,92,.36)}
.av-drag-handle{font-weight:900;letter-spacing:-2px;opacity:.75;cursor:grab}.av-floating-trigger span{font-size:18px}.av-floating-trigger b{font-size:11px;letter-spacing:.04em}
.av-float-modal{display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,31,50,.55);padding:18px;align-items:center;justify-content:center}
.av-float-modal.open{display:flex}
.av-float-dialog{width:min(760px,96vw);max-height:92vh;display:flex;flex-direction:column;background:#f5f8fa;border:1px solid #d7e3eb;border-radius:14px;box-shadow:0 28px 80px rgba(0,31,50,.3);overflow:hidden}
.av-float-head{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;background:#003b5c;color:#fff}.av-float-head h2{margin:0;font-size:18px;text-transform:uppercase}.av-float-head p{margin:4px 0 0;font-size:11px;opacity:.8}.av-float-x{width:36px;height:36px;border:0;border-radius:7px;background:rgba(255,255,255,.1);color:#fff;cursor:pointer}
.av-float-body{padding:16px;overflow:auto}.av-float-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.av-float-last{margin-top:12px;padding:13px;border:1px solid #d7e3eb;border-radius:9px;background:#fff}.av-float-last-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.av-float-last-head div{display:grid;gap:3px}.av-float-last-head small{font-size:9px;color:#70828e;font-weight:800;letter-spacing:.06em}.av-float-last-head strong{color:#073f68}.av-float-last-head>span{font-size:9px;font-weight:800;padding:4px 7px;border-radius:999px;background:#e7f6ed;color:#17633c}.av-float-last-actions{display:flex;gap:7px;margin-top:10px}
.av-float-preview{margin-top:12px}.av-float-preview-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:6px}.av-float-preview-head strong{color:#073f68}.av-float-preview-head small{color:#70828e}.av-float-preview textarea{width:100%;min-height:310px;resize:vertical;padding:12px;border:1px solid #cbd8e0;border-radius:8px;background:#fff;font-family:'IBM Plex Mono',monospace;font-size:11px;line-height:1.45}
@media(max-width:700px){.av2-head{display:block}.av2-context{text-align:left;margin-top:12px}.av2-history button{grid-template-columns:70px 80px 1fr}.av-floating-trigger{right:12px;bottom:12px;padding:11px 13px}.av-float-modal{padding:0}.av-float-dialog{width:100%;height:100dvh;max-height:100dvh;border-radius:0}.av-float-actions{grid-template-columns:1fr}.av-float-preview textarea{min-height:45vh}}
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
