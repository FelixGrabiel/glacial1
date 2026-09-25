/* Avance operativo por fecha y turno. Las cantidades ingresadas son acumuladas. */
const avanceEstado = { fecha:'', turno:'TD', linea:'PET1', datos:null, sucio:false, unsubscribe:null, clave:'' };
const AVANCE_LINEAS = ['PET1','PET2','B7L','C20L','B20L','HIELO'];
const AVANCE_NOMBRES = {PET1:'Pet1',PET2:'Pet2',B7L:'B7L',C20L:'Cajas 20L',B20L:'B20L',HIELO:'Hielo'};

function avanceFechaHoy(){
  const hoy = new Date();
  return [hoy.getFullYear(),String(hoy.getMonth()+1).padStart(2,'0'),String(hoy.getDate()).padStart(2,'0')].join('-');
}
function avanceNuevo(){
  return {inicio:'',fin:'',personal:'',presentacion:'',marcas:[],paradas:[],observaciones:'',
    ratio:'',consumo:'',cerrado:false,actualizadoEn:''};
}
function avanceClave(){return `${avanceEstado.fecha}_${avanceEstado.turno}`;}
function avanceRef(){return db.collection('avances').doc(avanceClave());}
function avanceNumero(v){const n=Number(v);return Number.isFinite(n)&&n>=0?n:0;}
function avanceFormato(v){return Math.round(v).toLocaleString('es-PE');}
function avanceEsc(v){return escaparHtml(v??'');}
function avanceLineaValida(linea){return AVANCE_LINEAS.includes(linea);}
function avanceDatosLinea(linea){
  if(!avanceEstado.datos)avanceEstado.datos={};
  if(!avanceEstado.datos[linea])avanceEstado.datos[linea]=avanceNuevo();
  return avanceEstado.datos[linea];
}

function avanceEscuchar(){
  if(avanceEstado.unsubscribe)avanceEstado.unsubscribe();
  const clave=avanceClave();
  avanceEstado.clave=clave;
  avanceEstado.unsubscribe=avanceRef().onSnapshot(snap=>{
    if(avanceEstado.clave!==clave)return;
    // No borrar lo que el supervisor está escribiendo ante una actualización remota.
    if(avanceEstado.sucio)return;
    avanceEstado.datos=snap.exists?(snap.data().lineas||{}):{};
    if(state.currentTab==='avance-produccion')avanceDibujar();
  },err=>{
    console.error('Error leyendo avances:',err);
    const aviso=document.getElementById('avance-estado');
    if(aviso)aviso.textContent='No se pudieron cargar los avances. Revisa conexión y reglas de Firestore.';
  });
}

function renderAvanceProduccion(main){
  if(!tienePermiso('avanceProduccion'))return;
  if(!avanceEstado.fecha)avanceEstado.fecha=avanceFechaHoy();
  main.innerHTML=`<section class="av-modulo">
    <h2>Avance y cierre de producción</h2>
    <p>Registra la producción <strong>acumulada</strong> de cada marca. Guarda durante el turno; el cierre conserva el último corte.</p>
    <div class="av-controles">
      <label>Fecha <input type="date" id="av-fecha" value="${avanceEsc(avanceEstado.fecha)}"></label>
      <label>Turno <select id="av-turno"><option value="TD" ${avanceEstado.turno==='TD'?'selected':''}>TD</option>
      <option value="TN" ${avanceEstado.turno==='TN'?'selected':''}>TN</option></select></label>
      <label>Línea <select id="av-linea">${AVANCE_LINEAS.map(l=>`<option value="${l}" ${avanceEstado.linea===l?'selected':''}>${AVANCE_NOMBRES[l]}</option>`).join('')}</select></label>
    </div>
    <p id="avance-estado" role="status"></p>
    <div id="av-editor"></div>
    <button type="button" id="av-importar" class="btn">Importar datos del registro de agua</button>
    <div class="av-acciones"><button type="button" id="av-guardar" class="btn btn-primary">Guardar avance</button>
      <button type="button" id="av-cerrar" class="btn">Cerrar línea</button>
      <button type="button" id="av-reabrir" class="btn">Reabrir línea</button></div>
    <h3>Mensaje para compartir</h3>
    <div class="av-acciones"><button type="button" id="av-copiar" class="btn">Copiar mensaje</button></div>
    <textarea id="av-mensaje" rows="16" readonly aria-label="Avance o cierre para compartir"></textarea>
  </section>`;
  document.getElementById('av-fecha').addEventListener('change',e=>avanceCambiarCorte(e.target.value,avanceEstado.turno));
  document.getElementById('av-turno').addEventListener('change',e=>avanceCambiarCorte(avanceEstado.fecha,e.target.value));
  document.getElementById('av-linea').addEventListener('change',e=>{
    if(avanceEstado.sucio){
      e.target.value=avanceEstado.linea;
      document.getElementById('avance-estado').textContent='Guarda esta línea antes de cambiar.';
      return;
    }
    avanceEstado.linea=e.target.value;
    avanceDibujar();
  });
  document.getElementById('av-guardar').addEventListener('click',()=>avanceGuardar(false));
  document.getElementById('av-importar').addEventListener('click',avanceImportarRegistro);
  document.getElementById('av-cerrar').addEventListener('click',()=>avanceGuardar(true));
  document.getElementById('av-reabrir').addEventListener('click',avanceReabrir);
  document.getElementById('av-copiar').addEventListener('click',avanceCopiar);
  if(avanceEstado.clave!==avanceClave())avanceEscuchar();
  avanceDibujar();
}

function avanceCambiarCorte(fecha,turno){
  if(avanceEstado.sucio&&!confirm('Hay cambios sin guardar. ¿Cambiar de fecha o turno?')){
    document.getElementById('av-fecha').value=avanceEstado.fecha;
    document.getElementById('av-turno').value=avanceEstado.turno;
    return;
  }
  avanceEstado.fecha=fecha;
  avanceEstado.turno=turno;
  avanceEstado.datos=null;
  avanceEstado.sucio=false;
  avanceEscuchar();
  avanceDibujar();
}

function avanceDibujar(){
  const editor=document.getElementById('av-editor');
  if(!editor)return;
  const linea=document.getElementById('av-linea').value;
  const d=avanceDatosLinea(linea);
  const bloqueado=!!d.cerrado;
  editor.innerHTML=`<div class="av-card"><h3>${AVANCE_NOMBRES[linea]} ${bloqueado?'· cerrada':''}</h3>
    <div class="av-grid"><label>Inicio <input type="time" data-av-campo="inicio" value="${avanceEsc(d.inicio)}"></label>
    <label>Fin (solo cierre) <input type="time" data-av-campo="fin" value="${avanceEsc(d.fin)}"></label>
    <label>Presentación <input data-av-campo="presentacion" value="${avanceEsc(d.presentacion)}" placeholder="Ej.: 625 ml / 2.5 L"></label>
    <label>Personal en línea <input type="number" min="0" step="1" data-av-campo="personal" value="${avanceEsc(d.personal)}"></label>
    <label>Ratio medido B/H (opcional) <input type="number" min="0" step="1" data-av-campo="ratio" value="${avanceEsc(d.ratio)}"></label>
    <label>Consumo medido L/H (opcional) <input type="number" min="0" step="1" data-av-campo="consumo" value="${avanceEsc(d.consumo)}"></label></div>
    <h4>${linea==='HIELO'?'Productos de hielo':'Marcas producidas'}</h4>
    <div id="av-marcas">${(d.marcas||[]).map((m,i)=>`<div class="av-fila">
      ${linea==='HIELO'?`<select data-av-lista="marcas" data-av-indice="${i}" data-av-campo="proceso"><option value="MANUAL" ${m.proceso==='MANUAL'?'selected':''}>Tolva manual</option><option value="AUTOMATICA" ${m.proceso==='AUTOMATICA'?'selected':''}>Env. automática</option></select>`:''}
      <input data-av-lista="marcas" data-av-indice="${i}" data-av-campo="nombre" value="${avanceEsc(m.nombre)}" placeholder="${linea==='HIELO'?'Marca y presentación':'Marca'}">
      ${linea==='HIELO'?`<input type="number" min="0.1" step="0.1" data-av-lista="marcas" data-av-indice="${i}" data-av-campo="kg" value="${avanceEsc(m.kg)}" placeholder="kg/bolsa">`:''}
      <input type="number" min="0" step="1" data-av-lista="marcas" data-av-indice="${i}" data-av-campo="unidades" value="${avanceEsc(m.unidades)}" placeholder="Bolsas / unidades">
      <button type="button" data-av-quitar="marcas" data-av-indice="${i}" aria-label="Quitar marca">×</button></div>`).join('')}</div>
    <button type="button" data-av-agregar="marcas" class="btn">+ Marca o producto</button>
    <h4>Paradas</h4><div id="av-paradas">${(d.paradas||[]).map((p,i)=>`<div class="av-fila">
      <input type="number" min="0" step="1" data-av-lista="paradas" data-av-indice="${i}" data-av-campo="minutos" value="${avanceEsc(p.minutos)}" placeholder="Min">
      <input data-av-lista="paradas" data-av-indice="${i}" data-av-campo="descripcion" value="${avanceEsc(p.descripcion)}" placeholder="Motivo de parada">
      <button type="button" data-av-quitar="paradas" data-av-indice="${i}" aria-label="Quitar parada">×</button></div>`).join('')}</div>
    <button type="button" data-av-agregar="paradas" class="btn">+ Parada</button>
    <label class="av-observacion">Observaciones <textarea rows="3" data-av-campo="observaciones">${avanceEsc(d.observaciones)}</textarea></label></div>`;
  editor.querySelectorAll('input,select,textarea,button').forEach(el=>{if(bloqueado)el.disabled=true;});
  editor.oninput=avanceEditar;
  editor.onchange=avanceEditar;
  editor.onclick=avanceClick;
  document.getElementById('av-guardar').disabled=bloqueado;
  document.getElementById('av-cerrar').disabled=bloqueado;
  document.getElementById('av-reabrir').disabled=!bloqueado;
  avanceMostrarMensaje();
}

function avanceEditar(e){
  const el=e.target;
  if(!el.dataset.avCampo)return;
  const d=avanceDatosLinea(document.getElementById('av-linea').value);
  if(el.dataset.avLista){
    const item=d[el.dataset.avLista][Number(el.dataset.avIndice)];
    if(item)item[el.dataset.avCampo]=el.value;
  }else d[el.dataset.avCampo]=el.value;
  avanceEstado.sucio=true;
  avanceMostrarMensaje();
  document.getElementById('avance-estado').textContent='Cambios sin guardar';
}
function avanceClick(e){
  const el=e.target.closest('button');if(!el)return;
  const d=avanceDatosLinea(document.getElementById('av-linea').value);
  if(el.dataset.avAgregar==='marcas')d.marcas.push({nombre:'',unidades:'',kg:'',proceso:'MANUAL'});
  else if(el.dataset.avAgregar==='paradas')d.paradas.push({minutos:'',descripcion:''});
  else if(el.dataset.avQuitar){d[el.dataset.avQuitar].splice(Number(el.dataset.avIndice),1);}
  else return;
  avanceEstado.sucio=true;avanceDibujar();
}

function avanceImportarRegistro(){
  const linea=document.getElementById('av-linea').value;
  if(linea==='HIELO')return alert('Hielo se registra directamente en esta pantalla.');
  const turnoBuscado=avanceEstado.turno;
  const coincide=r=>r&&r.linea===linea&&r.fecha===avanceEstado.fecha&&
    (String(r.turno).toUpperCase().includes('NOCHE')?'TN':'TD')===turnoBuscado;
  const fuente=coincide(draft)?draft:
    loadRecords().filter(coincide).sort((a,b)=>String(b.timestamp||'').localeCompare(String(a.timestamp||'')))[0];
  if(!fuente)return alert('No hay un registro de esta línea, fecha y turno para importar.');
  const existente=avanceDatosLinea(linea);
  if((existente.marcas.length||existente.paradas.length)&&
      !confirm('¿Reemplazar las marcas y paradas de esta línea con los datos del formulario?'))return;
  const cuadros=(fuente.cuadros||[]).filter(q=>q?.marca&&avanceNumero(q?.produccion?.efectiva)>0);
  if(!cuadros.length)return alert('El registro aún no tiene producción efectiva por marca.');
  existente.marcas=cuadros.map(q=>({nombre:q.marca+(q.presentacion?` (${q.presentacion})`:''),
    unidades:String(Math.round(avanceNumero(q.produccion.efectiva)))}));
  existente.paradas=cuadros.flatMap(q=>[...(q.paradasProgramadas||[]),...(q.paradasNoProgramadas||[])])
    .filter(p=>p.descripcion&&avanceNumero(p.tiempoMin)>0)
    .map(p=>({descripcion:p.descripcion,minutos:String(avanceNumero(p.tiempoMin))}));
  existente.inicio=cuadros.map(q=>q.horaInicio).filter(Boolean).sort()[0]||existente.inicio;
  existente.presentacion=cuadros.length===1?cuadros[0].presentacion||'':existente.presentacion;
  existente.personal=String((fuente.personal||[]).filter(p=>p.nombre?.trim()).length||'');
  existente.observaciones=[fuente.observaciones,...cuadros.map(q=>q.observaciones)]
    .filter(Boolean).join('\n');
  avanceEstado.sucio=true;
  avanceDibujar();
  document.getElementById('avance-estado').textContent='Datos importados. Revisa y guarda el avance.';
}

function avanceValidar(d,linea,cierre){
  if(!d.inicio)throw Error('Ingresa la hora de inicio.');
  if(cierre&&!d.fin)throw Error('Ingresa la hora de fin antes de cerrar.');
  if(!d.marcas.some(m=>m.nombre.trim()&&avanceNumero(m.unidades)>0))throw Error('Ingresa al menos una marca con producción.');
  for(const m of d.marcas){
    if(!m.nombre.trim()||!Number.isInteger(Number(m.unidades))||Number(m.unidades)<0)throw Error('Completa la marca y las unidades enteras de cada fila.');
    if(linea==='HIELO'&&!(avanceNumero(m.kg)>0))throw Error('Indica los kg por bolsa de cada producto de hielo.');
  }
  for(const p of d.paradas){
    if(!p.descripcion.trim()||!Number.isInteger(Number(p.minutos))||Number(p.minutos)<0)throw Error('Completa minutos y motivo de cada parada.');
  }
}

async function avanceGuardar(cierre){
  if(!tienePermiso('avanceProduccion'))return;
  const linea=document.getElementById('av-linea').value;
  const d=avanceDatosLinea(linea);
  try{avanceValidar(d,linea,cierre);}catch(err){alert(err.message);return;}
  const boton=document.getElementById(cierre?'av-cerrar':'av-guardar');
  boton.disabled=true;
  const copia=JSON.parse(JSON.stringify(d));
  if(cierre)copia.cerrado=true;
  copia.actualizadoEn=new Date().toISOString();
  copia.registradoPor=state.user?.nombre||state.user?.username||'';
  try{
    // Transacción: una línea no pisa el avance concurrente de otra línea.
    const ref=avanceRef();
    await db.runTransaction(async trans=>{
      const snap=await trans.get(ref);
      const anterior=snap.exists?(snap.data().lineas||{}):{};
      const remoto=anterior[linea];
      if(remoto?.actualizadoEn&&remoto.actualizadoEn!==d.actualizadoEn){
        throw Error('Otra persona actualizó esta línea. Recarga la página antes de guardar para no reemplazar sus datos.');
      }
      trans.set(ref,{fecha:avanceEstado.fecha,turno:avanceEstado.turno,
        lineas:{...anterior,[linea]:copia},updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    });
    avanceEstado.datos[linea]=copia;
    avanceEstado.sucio=false;
    avanceDibujar();
    document.getElementById('avance-estado').textContent=cierre?'Cierre guardado.':'Avance guardado.';
  }catch(err){console.error(err);alert('No se guardó el avance: '+err.message);boton.disabled=false;}
}

async function avanceReabrir(){
  const linea=document.getElementById('av-linea').value;
  const d=avanceDatosLinea(linea);
  if(!confirm(`¿Reabrir ${AVANCE_NOMBRES[linea]} para corregir el cierre?`))return;
  d.cerrado=false;
  avanceEstado.sucio=true;
  await avanceGuardar(false);
}

function avanceDuracion(d,fecha,cierre){
  if(!d.inicio)return 0;
  const inicio=new Date(`${fecha}T${d.inicio}:00`);
  const final=cierre&&d.fin?new Date(`${fecha}T${d.fin}:00`):new Date();
  if(cierre&&final<=inicio)final.setDate(final.getDate()+1);
  return Math.max(0,(final-inicio)/60000);
}
function avanceTexto(datos,fecha,turno,ahora=new Date()){
  const lineas=AVANCE_LINEAS.filter(l=>datos[l]?.marcas?.some(m=>avanceNumero(m.unidades)>0));
  const cerrado=lineas.length>0&&lineas.every(l=>datos[l].cerrado);
  const fechaLegible=fecha.split('-').reverse().join('/');
  const salida=[`*${cerrado?'Cierre':'Avance'} de producción ${turno}*`,fechaLegible,`Corte: ${ahora.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})}`];
  for(const linea of lineas){
    const d=datos[linea],marcas=d.marcas.filter(m=>m.nombre.trim());
    salida.push('',`*${AVANCE_NOMBRES[linea]}${d.presentacion?' '+d.presentacion:''}${d.cerrado?' (cerrada)':''}*`);
    salida.push(`*Hora de inicio:* ${d.inicio||'—'}`);
    if(d.cerrado&&d.fin)salida.push(`*Hora de fin:* ${d.fin}`);
    let total=0,litros=0;
    for(const m of marcas){
      const n=avanceNumero(m.unidades);total+=n;
      if(linea==='HIELO')litros+=n*avanceNumero(m.kg);
      salida.push(`* ${linea==='HIELO'?(m.proceso==='AUTOMATICA'?'ENV. AUTOMÁTICA · ':'TOLVA MANUAL · '):''}${m.nombre}: ${avanceFormato(n)}${linea==='HIELO'?' bolsas':''}`);
    }
    if(linea==='HIELO'){
      const kg=new Map();for(const m of marcas){const k=avanceNumero(m.kg);kg.set(k,(kg.get(k)||0)+avanceNumero(m.unidades));}
      for(const [k,n] of kg)salida.push(`*Producción ${k} kg:* ${avanceFormato(n)} bolsas / ${avanceFormato(n*k)} kg`);
      salida.push(`*Producción general:* ${avanceFormato(total)} bolsas / ${avanceFormato(litros)} kg`);
    }else{
      const minParadas=(d.paradas||[]).reduce((s,p)=>s+avanceNumero(p.minutos),0);
      const transcurrido=avanceDuracion(d,fecha,d.cerrado);
      const horas=Math.max(0,(transcurrido-minParadas)/60);
      const ratio=d.ratio!==''?avanceNumero(d.ratio):horas>0?total/horas:0;
      const volumen=Number(String(d.presentacion||'').replace(',','.').match(/(\d+(?:\.\d+)?)\s*(ml|l)\b/i)?.[1]);
      const unidad=String(d.presentacion||'').match(/(ml|l)\b/i)?.[1]?.toLowerCase();
      const litrosPorUnidad=unidad==='ml'?volumen/1000:unidad==='l'?volumen:(linea==='B7L'?7:linea==='C20L'||linea==='B20L'?20:0);
      const consumo=d.consumo!==''?avanceNumero(d.consumo):litrosPorUnidad?ratio*litrosPorUnidad:0;
      salida.push(`*Ratio:* ${ratio?avanceFormato(ratio)+' B/H':'—'}`);
      salida.push(`*Consumo:* ${consumo?avanceFormato(consumo)+' L/H':'—'}`);
      salida.push(`*Producción general:* ${avanceFormato(total)}`);
    }
    if(linea!=='HIELO')salida.push(`*Personal por línea:* ${d.personal!==''?d.personal:'—'}`);
    if(d.paradas?.length){
      salida.push('*Tiempo de parada:*');
      d.paradas.forEach(p=>salida.push(`* ${p.minutos} min ${p.descripcion}`));
    }
    salida.push(`*Total paradas:* ${avanceFormato((d.paradas||[]).reduce((s,p)=>s+avanceNumero(p.minutos),0))} min`);
    salida.push(`*Observaciones:* ${d.observaciones?.trim()||'—'}`);
  }
  if(!lineas.length)salida.push('Aún no hay producción registrada.');
  return salida.join('\n');
}

function avanceMostrarMensaje(){
  const area=document.getElementById('av-mensaje');
  if(area)area.value=avanceTexto(avanceEstado.datos||{},avanceEstado.fecha,avanceEstado.turno);
}
async function avanceCopiar(){
  const area=document.getElementById('av-mensaje');
  try{await navigator.clipboard.writeText(area.value);document.getElementById('avance-estado').textContent='Mensaje copiado.';}
  catch{area.select();document.execCommand('copy');document.getElementById('avance-estado').textContent='Mensaje copiado.';}
}
