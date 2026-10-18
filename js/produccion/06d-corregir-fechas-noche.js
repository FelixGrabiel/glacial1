/* =============================================================
   GLACIAL · CORREGIR REGISTROS DE LA NOCHE GUARDADOS CON LA FECHA DEL CALENDARIO (solo Administrador)
   -------------------------------------------------------------
   // FECHA-OPERATIVA: antes de la corrección del turno NOCHE, algunos registros hechos entre las 00:00 y las 07:00 se guardaron con la fecha
   del día natural (16/10) en vez de la fecha operativa (15/10, el día en que empezó el turno). Esta herramienta SOLO LISTA y NO cambia nada
   hasta que el Administrador marque los registros, escriba el motivo y confirme.
   Regla de detección (fecha propuesta = un día antes): turno NOCHE, creado entre las 00:00 y las 06:59 (hora de Lima) y con fecha igual al día
   natural en que se creó.
   · CORRIGE (con confirmación, registro por registro o en bloque): Paletas (sync/paletas) y Paradas de avance (sync/avancesTurno → paradasOperativas).
     Cada registro corregido guarda fechaOriginal, fechaCorregidaPor, fechaCorregidaEn y fechaCorregidaMotivo (esa es la auditoría), y antes de
     aplicar se descarga un respaldo JSON con los registros tal como estaban.
   · SOLO LISTA (no se corrigen desde aquí): imágenes de Avance/Cierre ya generadas (las reglas de la base no permiten editarlas), programaciones
     (la fecha forma parte de su clave LINEA|FECHA|TURNO|MARCA|PRESENTACION) y reportes en registro (llevan lote, día juliano y semana).
   Cargar DESPUÉS de 01b-fecha-operativa.js y 02-estado.js; el botón aparece en el Historial para el Administrador.
   ============================================================= */
(function instalarCorregirFechasNoche(global){
  'use strict';
  const GF=()=>global.GlacialFecha;
  const esAdmin=()=>typeof state!=='undefined'&&state&&state.user&&state.user.rol==='Administrador';
  const ESC=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const esNoche=t=>String(t||'').toUpperCase().includes('NOCHE');

  /* ¿Este registro de NOCHE se guardó con la fecha del calendario en madrugada? → fecha propuesta o null. Función pura. */
  function propuesta(fecha,turno,creadoMs){
    const g=GF();
    if(!g||!esNoche(turno)||!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha||''))||!Number.isFinite(Number(creadoMs))||!Number(creadoMs))return null;
    const l=g.ahoraLima(Number(creadoMs));
    if(l.hora>=g.HORA_FIN_NOCHE)return null;                 // creado de 07:00 en adelante: la fecha no pudo ser la del calendario por error
    if(fecha!==l.fecha)return null;                          // ya tiene una fecha distinta a la del calendario
    return g.sumarDias(fecha,-1);
  }

  /* Devuelve {paletas,paradas,snapshots,programaciones,reportes}; cada entrada {id,etiqueta,fecha,propuesta,creado}. No modifica nada. */
  function detectar(datos){
    const d=datos||{},g=GF();
    const txt=ms=>g?g.ahoraLima(ms).texto:'';
    const arr=x=>Array.isArray(x)?x:[];
    const salida={paletas:[],paradas:[],snapshots:[],programaciones:[],reportes:[]};
    arr(d.paletas).forEach(p=>{
      const pr=p&&propuesta(p.fecha,p.turno,p.creadoEn);
      if(pr)salida.paletas.push({id:p.id,etiqueta:`${p.linea} · ${p.marca||''} ${p.presentacion||''} · ${p.paletas||''} pal. · ${p.hora||''}`,fecha:p.fecha,propuesta:pr,creado:txt(p.creadoEn)});
    });
    arr(d.paradas).forEach(p=>{
      const pr=p&&p.origen==='AVANCE'&&propuesta(p.fecha,p.turno,p.creadoEn);
      if(pr)salida.paradas.push({id:p.id,etiqueta:`${p.linea} · ${p.descripcion||p.motivo||'parada'} · ${p.minutos||0} min`,fecha:p.fecha,propuesta:pr,creado:txt(p.creadoEn)});
    });
    arr(d.snapshots).forEach(s=>{
      const pr=s&&propuesta(s.fecha,s.turno,s.generadoEn);
      if(pr)salida.snapshots.push({id:s.id,etiqueta:`${s.tipo||'AVANCE'} · ${s.horaCorte||''}`,fecha:s.fecha,propuesta:pr,creado:txt(s.generadoEn)});
    });
    arr(d.programaciones).forEach(p=>{
      const ms=p&&p.estadoOperacion&&Number(p.estadoOperacion.inicio);
      const pr=ms&&propuesta(p.fecha,p.turno,ms);
      if(pr)salida.programaciones.push({id:p.clave,etiqueta:`${p.linea} · ${p.marca||''} ${p.presentacion||''}`,fecha:p.fecha,propuesta:pr,creado:txt(ms)});
    });
    arr(d.reportes).forEach(r=>{
      const ms=Number(r&&(r.creadoEn||r.horaInicio));
      const pr=r&&r.estadoRegistro==='EN_REGISTRO'&&propuesta(r.fecha,r.turno,ms);
      if(pr)salida.reportes.push({id:r.id,etiqueta:`${r.linea} · ${r.marca||''}`,fecha:r.fecha,propuesta:pr,creado:txt(ms)});
    });
    return salida;
  }

  /* Aplica la corrección a los ids marcados de UN documento sync/<doc> (campo `campo`). Devuelve los ids corregidos. */
  async function corregirEnDocumento(doc,campo,seleccion,motivo){
    const ref=db.collection('sync').doc(doc),ids=new Map(seleccion.map(s=>[s.id,s]));
    const ahora=Date.now(),quien=(state.user&&(state.user.nombre||state.user.username))||'';
    return db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      const items=snap.exists&&Array.isArray(snap.data()[campo])?snap.data()[campo].slice():[];
      const hechos=[];
      items.forEach((it,i)=>{
        const s=it&&ids.get(it.id);
        // Solo si el registro sigue como se listó (misma fecha): si alguien ya lo cambió, no se toca.
        if(!s||it.fecha!==s.fecha)return;
        items[i]=Object.assign({},it,{fecha:s.propuesta,fechaOriginal:it.fecha,fechaCorregidaPor:quien,fechaCorregidaEn:ahora,fechaCorregidaMotivo:motivo,
          actualizadoEn:ahora});
        hechos.push(it.id);
      });
      if(hechos.length)tx.set(ref,{[campo]:items,updatedAt:ahora},{merge:true});
      return hechos;
    });
  }

  function descargarRespaldo(nombre,obj){
    try{
      const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}),a=document.createElement('a');
      a.href=URL.createObjectURL(blob);a.download=nombre;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),2000);
    }catch(_){/* el respaldo es una ayuda; la corrección no depende de él */}
  }

  async function leerDatos(){
    const leer=async(doc,campo)=>{const s=await db.collection('sync').doc(doc).get();return s.exists&&Array.isArray(s.data()[campo])?s.data()[campo]:[];};
    const [paletas,paradas,programaciones,reportes]=await Promise.all([
      leer('paletas','items'),leer('avancesTurno','paradasOperativas'),leer('programaciones','items'),leer('records','items')]);
    let snapshots=[];
    try{
      if(global.glacialAvancesItems&&global.glacialAvancesItems.consultarRango){
        const g=GF(),hoy=g.fechaOperativa();
        snapshots=await global.glacialAvancesItems.consultarRango(g.sumarDias(hoy,-120),g.sumarDias(hoy,1));
      }
    }catch(e){console.warn('Corregir fechas de la noche: no se pudieron leer los avances:',e&&e.message||e);}
    return {paletas,paradas,snapshots,programaciones,reportes};
  }

  let estado=null;
  function tabla(titulo,lista,tipo,corregible){
    if(!lista.length)return `<h4>${titulo}</h4><p class="small-muted">Sin registros afectados.</p>`;
    const filas=lista.map((x,i)=>`<tr>${corregible?`<td><input type="checkbox" data-cfn="${tipo}" data-i="${i}" checked></td>`:'<td></td>'}`
      +`<td>${ESC(x.etiqueta)}</td><td>${ESC(x.fecha)}</td><td><b>${ESC(x.propuesta)}</b></td><td>${ESC(x.creado)}</td></tr>`).join('');
    return `<h4>${titulo} (${lista.length})${corregible?'':' · solo lista'}</h4><div style="max-height:180px;overflow:auto"><table class="tbl" style="width:100%"><thead><tr><th></th><th>Registro</th><th>Fecha guardada</th><th>Fecha operativa</th><th>Creado (Lima)</th></tr></thead><tbody>${filas}</tbody></table></div>`;
  }
  function pintar(){
    const root=document.getElementById('modal-root');if(!root||!estado)return;
    const e=estado.detectado;
    root.innerHTML='<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal" style="max-width:860px;width:96%;">'
      +'<div class="modal-head"><h3>Registros de la noche con fecha del calendario</h3><button class="modal-close" onclick="closeModal()">✕</button></div>'
      +'<div class="modal-body"><p class="small-muted">Turno NOCHE creado entre las 00:00 y las 07:00 y guardado con la fecha del día natural. La fecha operativa correcta es el día en que empezó el turno. '
      +'No se cambia nada hasta que marques los registros, escribas el motivo y confirmes. Antes de aplicar se descarga un respaldo.</p>'
      +tabla('Paletas',e.paletas,'paletas',true)+tabla('Paradas de avance',e.paradas,'paradas',true)
      +tabla('Imágenes de Avance/Cierre ya generadas',e.snapshots,'snapshots',false)
      +tabla('Programaciones',e.programaciones,'programaciones',false)+tabla('Reportes en registro',e.reportes,'reportes',false)
      +'<div class="field-sm"><label>Motivo de la corrección (obligatorio)</label><input type="text" id="cfn-motivo" maxlength="160" placeholder="Ej.: turno noche guardado con la fecha del calendario"></div>'
      +'<div class="actions-row"><button class="btn btn-primary" id="cfn-aplicar">Corregir los marcados</button></div><p id="cfn-msg" class="small-muted"></p></div></div></div>';
    document.getElementById('cfn-aplicar').onclick=aplicarMarcados;
  }
  async function aplicarMarcados(){
    const msg=document.getElementById('cfn-msg'),motivo=String((document.getElementById('cfn-motivo')||{}).value||'').trim();
    if(!esAdmin()){msg.textContent='Solo el Administrador.';return;}
    if(motivo.length<5){msg.textContent='Escribe el motivo (mínimo 5 caracteres).';return;}
    const marcados=tipo=>Array.from(document.querySelectorAll(`input[data-cfn="${tipo}"]:checked`)).map(c=>estado.detectado[tipo][Number(c.dataset.i)]);
    const sel={paletas:marcados('paletas'),paradas:marcados('paradas')};
    const total=sel.paletas.length+sel.paradas.length;
    if(!total){msg.textContent='No marcaste ningún registro.';return;}
    if(!confirm(`Se corregirá la fecha de ${total} registro(s) (${sel.paletas.length} paletas y ${sel.paradas.length} paradas). ¿Confirmas?`))return;
    document.getElementById('cfn-aplicar').disabled=true;msg.textContent='Aplicando…';
    try{
      descargarRespaldo(`respaldo_fechas_noche_${GF().ahoraLima(GF().ahoraMs()).fecha}.json`,
        {generado:GF().ahoraLima(GF().ahoraMs()).texto,por:state.user.nombre||state.user.username,motivo,seleccion:sel});
      const hp=sel.paletas.length?await corregirEnDocumento('paletas','items',sel.paletas,motivo):[];
      const hd=sel.paradas.length?await corregirEnDocumento('avancesTurno','paradasOperativas',sel.paradas,motivo):[];
      msg.textContent=`Listo: ${hp.length} paleta(s) y ${hd.length} parada(s) corregidas. Los que ya habían cambiado no se tocaron.`;
      document.getElementById('cfn-aplicar').style.display='none';
    }catch(e){msg.textContent='No se pudo corregir: '+(e&&e.message||e);document.getElementById('cfn-aplicar').disabled=false;}
  }
  async function abrir(){
    if(!esAdmin()){alert('Solo el Administrador puede usar esta herramienta.');return;}
    try{
      const datos=await leerDatos();
      estado={datos,detectado:detectar(datos)};
      pintar();
    }catch(e){alert('No se pudieron leer los datos: '+(e&&e.message||e));}
  }

  global.glacialCorregirFechasNoche={propuesta,detectar,abrir,visible:esAdmin};
})(window);
