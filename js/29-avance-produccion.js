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
function avSnapshotId(tipo,hora){return `${avanceEstado.fecha}_${avanceEstado.turno}_${tipo}_${String(hora||'CIERRE').replace(':','')}`;}

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

function avProduccionHasta(linea,marca,presentacion,hora,tipo){
  const corte=avCorteMs(hora,tipo);
  const pal=avPaletas().filter(x=>x.linea===linea&&x.marca===marca&&x.presentacion===presentacion);
  if(pal.length){
    return pal.reduce((s,x)=>{
      let ms=Number(x.creadoEn||x.actualizadoEn||0);
      if(x.hora)ms=avHoraMs(avanceEstado.fecha,x.hora,avanceEstado.turno);
      return s+(ms&&ms>corte?0:avNum(x.totalUnidades||x.unidadesIncompleta||0));
    },0);
  }
  const regs=avRegistros().filter(r=>r.linea===linea);
  let total=0;
  regs.forEach(r=>(typeof normalizarCuadros==='function'?normalizarCuadros(r):(r.cuadros||[])).forEach(q=>{
    if(q?.marca===marca&&q?.presentacion===presentacion){
      const ini=avHoraMs(avanceEstado.fecha,q.horaInicio,avanceEstado.turno);
      if(!ini||ini<=corte)total+=avNum(q?.produccion?.efectiva);
    }
  }));
  return total;
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
  const actividad=!!inicio||productos.some(x=>x.produccion>0)||avProgramaciones().some(p=>p.linea===linea&&p?.estadoOperacion?.inicio);
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
  const lineas=AVANCE_LINEAS.map(l=>avLineaSnapshot(l,hora,tipo)).filter(Boolean);
  if(!lineas.length)throw Error('No existe producción ni una línea iniciada para este turno.');
  const totalParadas=lineas.reduce((s,l)=>s+l.totalParadas,0);
  const personalSet=lineas.reduce((s,l)=>s+l.personal,0);
  const totalPlanta=lineas.reduce((s,l)=>s+l.produccionTotal,0);
  const snap={
    id:avSnapshotId(tipo,hora),fecha:avanceEstado.fecha,turno:avanceEstado.turno,
    tipo,horaCorte:tipo==='CIERRE'?avCtx().fin:hora,
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
  },e=>{console.error('Avances turno:',e);avAviso('No se pudo sincronizar el historial de avances.');});
}
function avEstadoTarjeta(tipo,hora){
  const id=avSnapshotId(tipo,hora);
  return avanceEstado.snapshots.find(x=>x.id===id)||null;
}
function avHorarios(){
  const base=(AVANCE_HORARIOS[avanceEstado.turno]||[]).slice();
  return base;
}

function renderAvanceProduccion(main){
  if(!tienePermiso('avanceProduccion'))return;
  const ctx=avCtx();
  avanceEstado.fecha=ctx.fecha;
  avanceEstado.turno=ctx.turno;
  main.innerHTML=`<section class="av2"><div id="av-root"></div></section>`;
  if(!avanceEstado.unsubscribe)avEscuchar(); else avDibujar();
}

function avDibujar(){
  const root=document.getElementById('av-root');if(!root)return;
  const ctx=avCtx(),horas=avHorarios();
  const cards=horas.map(h=>{
    const s=avEstadoTarjeta('AVANCE',h),estado=s?.estado||'PENDIENTE';
    return `<article class="av2-card ${estado.toLowerCase()}">
      <div><strong>${h}</strong><span>${estado}</span></div>
      <small>${s?`Generado por ${avEsc(s.supervisor||s.generadoPor)}`:'Avance parcial'}</small>
      <div class="av2-actions">
        <button class="btn btn-sm" onclick="avGenerar('${h}','AVANCE')">${s?'ACTUALIZAR':'GENERAR AVANCE'}</button>
        ${s?`<button class="btn btn-ghost btn-sm" onclick="avVer('${s.id}')">VER</button>
        <button class="btn btn-ghost btn-sm" onclick="avCopiar('${s.id}')">COPIAR AVANCE</button>`:''}
      </div></article>`;
  }).join('');
  const cierre=avEstadoTarjeta('CIERRE',ctx.fin);
  root.innerHTML=`
    <style>${AVANCE_CSS}</style>
    <div class="av2-head">
      <div><h2>AVANCE Y CIERRE DE TURNO</h2><p>Resumen automático desde Producción, Paletas, Paradas y Tareo.</p></div>
      <div class="av2-context">
        <b>Turno actual: ${avEsc(avanceEstado.turno)}</b>
        <span>Supervisor: ${avEsc(avNombreUsuario())}</span>
        <span>Inicio turno: ${avEsc(ctx.inicio||'—')} · Cierre: ${avEsc(ctx.fin||'—')}</span>
      </div>
    </div>
    <div id="av-estado" class="av2-status"></div>
    <div class="av2-grid">${cards}
      <article class="av2-card cierre ${cierre?.estado?.toLowerCase()||'pendiente'}">
        <div><strong>CIERRE</strong><span>${cierre?.estado||'PENDIENTE'}</span></div>
        <small>Hora configurada: ${avEsc(ctx.fin||'—')}</small>
        <div class="av2-actions">
          <button class="btn btn-sm" onclick="avGenerar('${avEsc(ctx.fin)}','CIERRE')">${cierre?'ACTUALIZAR':'GENERAR CIERRE'}</button>
          ${cierre?`<button class="btn btn-ghost btn-sm" onclick="avVer('${cierre.id}')">VER</button>
          <button class="btn btn-ghost btn-sm" onclick="avCopiar('${cierre.id}')">COPIAR CIERRE</button>`:''}
        </div>
      </article>
    </div>
    <section class="av2-preview">
      <div class="av2-preview-head"><div><h3>Vista previa para WhatsApp</h3><small>Los símbolos * y _ se conservan al copiar.</small></div></div>
      <textarea id="av-preview" readonly placeholder="Genera o selecciona un avance para visualizarlo aquí.">${avEsc(avanceEstado.preview)}</textarea>
    </section>
    <section class="av2-history">
      <h3>Historial de avances</h3>
      ${avanceEstado.snapshots.length?avanceEstado.snapshots.slice().sort((a,b)=>avNum(a.generadoEn)-avNum(b.generadoEn)).map(s=>`
        <button type="button" onclick="avVer('${s.id}')"><b>${s.tipo==='CIERRE'?'CIERRE':s.horaCorte}</b><span>${s.estado}</span><small>${new Date(s.generadoEn).toLocaleString('es-PE')}</small></button>`).join(''):
        '<p class="small-muted">Todavía no hay avances generados para este turno.</p>'}
    </section>`;
}

const AVANCE_CSS=`
.av2{padding:4px}.av2-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:18px 20px;background:#f4f8fb;border:1px solid #d7e3eb;border-left:5px solid #006da8;border-radius:10px}.av2-head h2{margin:0;color:#082f49}.av2-head p{margin:5px 0 0;color:#647987}.av2-context{display:grid;gap:4px;text-align:right;color:#24475c}.av2-status{min-height:22px;margin:8px 2px;color:#17633c;font-weight:700}.av2-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.av2-card{border:1px solid #d7e3eb;border-radius:10px;padding:13px;background:#fff}.av2-card>div:first-child{display:flex;justify-content:space-between;align-items:center}.av2-card strong{font-size:20px;color:#073f68}.av2-card span{font-size:10px;font-weight:800;padding:4px 7px;border-radius:999px;background:#eef2f4}.av2-card.generado span{background:#e6f3ff;color:#075985}.av2-card.copiado span{background:#e7f6ed;color:#17633c}.av2-card small{display:block;margin-top:5px;color:#70828e}.av2-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.av2-card.cierre{border-left:4px solid #006da8}.av2-preview,.av2-history{margin-top:14px;border:1px solid #d7e3eb;border-radius:10px;background:#fff;padding:15px}.av2-preview h3,.av2-history h3{margin:0 0 8px;color:#073f68}.av2-preview textarea{width:100%;min-height:420px;resize:vertical;font-family:'IBM Plex Mono',monospace;line-height:1.45;padding:14px;border:1px solid #cbd8e0;border-radius:8px;background:#f9fbfc}.av2-history button{width:100%;display:grid;grid-template-columns:100px 100px 1fr;gap:8px;text-align:left;padding:9px 10px;margin-top:6px;border:1px solid #e1e8ed;background:#fafcfd;border-radius:7px;cursor:pointer}@media(max-width:700px){.av2-head{display:block}.av2-context{text-align:left;margin-top:12px}.av2-history button{grid-template-columns:70px 80px 1fr}}
`;
