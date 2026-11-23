/* =============================================================
   GLACIAL · REGISTRO QUE SE LLENA SOLO DURANTE EL TURNO (23/11/2026)
   -------------------------------------------------------------
   Completa lo que 35-autollenado-registro.js (programada, efectiva, paletas y paradas) y 06-registro.js (marca del cuadro 1,
   ratio nominal, lote, insumos estimados) todavía no llenaban, para que al terminar el turno el supervisor solo escriba
   sopladas, calidad, mermas, observaciones y revise los insumos:
     1. MARCAS DEL TURNO: cada producto de la programación del bloque que ya se inició en Producción actual (EN_PRODUCCION,
        PAUSA o FINALIZADA) se pone en la siguiente pestaña vacía del registro (ponerProductoEnCuadro: marca, presentación,
        ratio nominal y lote).
     2. HORAS: inicio = «Iniciar» (estadoOperacion.inicio) y fin = «Finalizar» (estadoOperacion.finalizadaEn) del producto.
        Solo se escriben si la hora está vacía, es la hora por defecto del turno o la puso este mismo llenado (cuadro.autoHoras):
        si el supervisor la cambió a mano, se respeta.
     3. VENCIMIENTO: vacío → fecha del lote + vida útil (la misma regla que Control de proceso: el turno NOCHE lleva la fecha del
        día siguiente). Vida útil por línea en sync/configIndicadores.vidaUtilMeses (12 meses si no hay dato).
     4. PERSONAL: las filas vacías se completan solas con el Tareo de Producción del turno (GlacialPersonalTareo.proponer);
        nunca se pisa un nombre escrito.
     5. LISTA «PARA CERRAR EL TURNO»: qué se llenó solo y qué falta escribir. Solo avisa: no bloquea «Finalizar» (los obligatorios
        de siempre los sigue controlando validarReporteParaFinalizar).
   Solo actúa en registros EN REGISTRO con autollenado (draft.autollenadoV1). Funciones puras exportadas para las pruebas.
   Cargar DESPUÉS de 06-registro.js, 35-autollenado-registro.js y 35b-personal-desde-tareo.js.
   ============================================================= */
(function instalarAutollenadoCompleto(raiz){
  'use strict';
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const VIDA_UTIL_INICIAL=12;
  const INICIADO=new Set(['EN_PRODUCCION','PAUSA','FINALIZADA']);
  const LINEAS_SEC={PET1:'Botellas sopladas',PET2:'Botellas sopladas',B7L:'Bidones soplados',B20L:'Bidones disponibles'};
  const clave=v=>typeof normalizarClavePaletas==='function'?normalizarClavePaletas(v):String(v==null?'':v).toLowerCase().replace(/\s+/g,'').trim();
  const mismoProducto=(a,b)=>clave(a.marca)===clave(b.marca)&&clave(a.presentacion)===clave(b.presentacion);
  const esNoche=t=>String(t||'').toUpperCase().includes('NOCHE');
  const hhmm=ms=>{const n=num(ms);if(!n)return '';const d=new Date(n);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};

  /* ---------- configuración ---------- */
  function vidaUtilMeses(linea){
    let c=null;try{c=typeof raiz.glacialConfigIndicadores==='function'?raiz.glacialConfigIndicadores():null;}catch(_){c=null;}
    const v=num(c&&c.vidaUtilMeses&&c.vidaUtilMeses[linea]);
    return v>0?v:VIDA_UTIL_INICIAL;
  }
  /** Vencimiento ISO = fecha del lote + meses (NOCHE: el lote lleva la fecha del día siguiente). */
  function vencimiento(fecha,turno,meses){
    const m=String(fecha||'').match(/^(\d{4})-(\d{2})-(\d{2})/);if(!m)return '';
    const f=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])));
    if(esNoche(turno))f.setUTCDate(f.getUTCDate()+1);
    const dia=f.getUTCDate();f.setUTCDate(1);f.setUTCMonth(f.getUTCMonth()+(num(meses)||VIDA_UTIL_INICIAL));
    const ultimo=new Date(Date.UTC(f.getUTCFullYear(),f.getUTCMonth()+1,0)).getUTCDate();f.setUTCDate(Math.min(dia,ultimo));
    return f.getUTCFullYear()+'-'+String(f.getUTCMonth()+1).padStart(2,'0')+'-'+String(f.getUTCDate()).padStart(2,'0');
  }

  /* ---------- puras ---------- */
  /** Productos de la programación del bloque del registro, en orden de inicio, con su estado de operación. */
  function productosDelTurno(d,programaciones){
    const bloque=esNoche(d&&d.turno)?['NOCHE']:['DÍA','INTERMEDIO'];
    const vistos=new Set();
    return (Array.isArray(programaciones)?programaciones:[])
      .filter(p=>p&&d&&p.linea===d.linea&&p.fecha===d.fecha&&bloque.includes(p.turno)&&p.marca&&p.presentacion&&
        !(p.estadoOperacion&&p.estadoOperacion.estado==='CANCELADA'))
      .map(p=>({marca:p.marca,presentacion:p.presentacion,op:p.estadoOperacion||{},posicion:num(p.posicion)||1e9,creadoEn:num(p.creadoEn)}))
      .sort((a,b)=>(num(a.op.inicio)||9e15)-(num(b.op.inicio)||9e15)||a.posicion-b.posicion||a.creadoEn-b.creadoEn)
      .filter(p=>{const k=clave(p.marca)+'|'+clave(p.presentacion);if(vistos.has(k))return false;vistos.add(k);return true;})
      .map(p=>({marca:p.marca,presentacion:p.presentacion,iniciado:INICIADO.has(p.op.estado)||num(p.op.inicio)>0,
        inicio:hhmm(p.op.inicio),fin:p.op.estado==='FINALIZADA'?hhmm(p.op.finalizadaEn):''}));
  }
  /** Marcas iniciadas que aún no tienen pestaña → [{i, producto}] (i = primera pestaña libre). */
  function marcasPorAgregar(d,productos){
    const cs=Array.isArray(d&&d.cuadros)?d.cuadros:[];
    const usados=cs.filter(q=>q&&q.marca&&!q.marcaPorDefecto);
    const libres=cs.map((q,i)=>({q,i})).filter(({q})=>q&&q.estadoCuadro!=='FINALIZADO'&&(!String(q.marca||'').trim()||q.marcaPorDefecto)&&!num(q.produccion&&q.produccion.efectiva));
    const res=[];
    (productos||[]).filter(p=>p.iniciado&&!usados.some(q=>mismoProducto(q,p))).forEach(p=>{const l=libres.shift();if(l)res.push({i:l.i,producto:p});});
    return res;
  }
  /** Horas a escribir en un cuadro: {horaInicio?, horaFin?}. No pisa lo que el supervisor cambió a mano. */
  function horasPorPoner(q,producto,porDefecto){
    if(!q||!producto||q.estadoCuadro==='FINALIZADO')return {};
    const auto=q.autoHoras||{},def=porDefecto||{},res={};
    const libre=(actual,previoAuto,valorDef)=>!actual||actual===previoAuto||(!previoAuto&&actual===valorDef);
    if(producto.inicio&&producto.inicio!==q.horaInicio&&libre(q.horaInicio,auto.inicio,def.inicio))res.horaInicio=producto.inicio;
    if(producto.fin&&producto.fin!==q.horaFin&&libre(q.horaFin,auto.fin,def.fin))res.horaFin=producto.fin;
    return res;
  }
  /* ---------- obligatorios para finalizar y horas efectivas negativas (23/11/2026) ---------- */
  const minutosParadas=q=>[...(q&&q.paradasProgramadas||[]),...(q&&q.paradasNoProgramadas||[])].filter(x=>x&&!x.eliminada).reduce((a,x)=>a+Math.max(0,num(x.tiempoMin)),0);
  /** Horas efectivas SIN el tope en 0: duración − paradas (negativo = las paradas superan la duración). null sin duración. */
  function horasEfectivasReales(q){
    const dur=num(q&&q.horasTurno)*60;if(!(dur>0))return null;
    return (dur-minutosParadas(q))/60;
  }
  const insumosDe=q=>['cajasPreformas','planchasCarton','polietilenoKg','stretchFilmKg'].reduce((a,k)=>a+num(q&&q.insumos&&q.insumos[k]),0);
  const tieneMermas=q=>(q&&q.mermas||[]).some(m=>num(m&&m.unidades)>0||num(m&&m.peso)>0||num(m&&m.kg)>0||num(m&&m.pesoIngresadoKg)>0);
  const cuadrosUsados=d=>(Array.isArray(d&&d.cuadros)?d.cuadros:[]).filter(q=>q&&(q.marca||q.presentacion||q.horaInicio||q.horaFin||num(q.produccion&&q.produccion.programada)>0||num(q.produccion&&q.produccion.efectiva)>0)&&!q.marcaPorDefecto);
  /** Datos que ahora son obligatorios para finalizar (se suman a validarReporteParaFinalizar). Los reabiertos no los exigen. */
  function obligatoriosCierre(d){
    if(!d||d.estadoRegistro==='REABIERTO'||d.estadoRegistro==='FINALIZADO')return [];
    const out=[],linea=d.linea;
    cuadrosUsados(d).forEach((q,i)=>{
      const n=num(q.numero)||(d.cuadros.indexOf(q)+1)||i+1,p=q.produccion||{};
      if(!(num(p.efectiva)>0))out.push(`Producción ${n}: producción efectiva`);
      else if(!(num(p.paletas)>0)&&!(q.autoPaletas&&num(q.autoPaletas.paletas)>0))out.push(`Producción ${n}: paletas`);
      if(!String(q.lote||'').trim())out.push(`Producción ${n}: lote`);
      if(['PET1','PET2','B7L'].includes(linea)&&!(num(p.calidad)>0))out.push(`Producción ${n}: ${linea==='B7L'?'bidones':'botellas'} de calidad`);
      if(linea==='B20L'&&!(num(p.sopladas)>0))out.push(`Producción ${n}: bidones disponibles`);
      if(!tieneMermas(q)&&!q.sinMermas)out.push(`Producción ${n}: mermas (o marca «Sin mermas en esta producción»)`);
      if(!(insumosDe(q)>0))out.push(`Producción ${n}: insumos`);
    });
    if(!(Array.isArray(d.personal)?d.personal:[]).some(x=>x&&String(x.nombre||'').trim()))out.push('Personal del turno: al menos una persona');
    return out;
  }

  /** Lista «Para cerrar el turno»: [{etiqueta, estado:'auto'|'ok'|'falta'|'opcional', detalle}]. */
  function pendientesCierre(d){
    const cs=(Array.isArray(d&&d.cuadros)?d.cuadros:[]).filter(q=>q&&String(q.marca||'').trim()&&!q.marcaPorDefecto);
    const linea=d&&d.linea;
    const sum=f=>cs.reduce((a,q)=>a+num(f(q)),0);
    const paradas=cs.reduce((a,q)=>a+[...(q.paradasProgramadas||[]),...(q.paradasNoProgramadas||[])].filter(r=>r&&num(r.tiempoMin)>0).length,0);
    const minParadas=cs.reduce((a,q)=>a+[...(q.paradasProgramadas||[]),...(q.paradasNoProgramadas||[])].reduce((s,r)=>s+num(r&&r.tiempoMin),0),0);
    const personas=(Array.isArray(d&&d.personal)?d.personal:[]).filter(p=>p&&String(p.nombre||'').trim()).length;
    const todos=(fn)=>cs.length>0&&cs.every(fn);
    const items=[];
    const add=(etiqueta,estado,detalle)=>items.push({etiqueta,estado,detalle:detalle||''});
    add(`Marcas del turno (${cs.length})`,cs.length?'auto':'falta',cs.map(q=>q.marca).join(' · '));
    add('Horas de inicio y fin',todos(q=>q.horaInicio&&q.horaFin)?(cs.some(q=>q.autoHoras)?'auto':'ok'):'falta',
      cs.filter(q=>!(q.horaInicio&&q.horaFin)).length?'Falta la hora de fin de: '+cs.filter(q=>!(q.horaInicio&&q.horaFin)).map(q=>q.marca).join(', '):'');
    add('Producción programada y efectiva',sum(q=>q.produccion&&q.produccion.efectiva)>0?(cs.some(q=>q.autoPaletas)?'auto':'ok'):'falta',
      `${sum(q=>q.produccion&&q.produccion.efectiva).toLocaleString('es-PE')} de ${sum(q=>q.produccion&&q.produccion.programada).toLocaleString('es-PE')}`);
    add(`Paletas (${sum(q=>q.autoPaletas?q.autoPaletas.paletas:q.produccion&&q.produccion.paletas)})`,sum(q=>q.produccion&&q.produccion.paletas)>0||cs.some(q=>q.autoPaletas)?'auto':'falta');
    add(`Paradas (${paradas} · ${(minParadas/60).toFixed(2)} h)`,cs.some(q=>q.autoParadasSig)||paradas?(cs.some(q=>q.autoParadasSig)?'auto':'ok'):'opcional',paradas?'':'Sin paradas registradas');
    add(`Personal (${personas})`,personas?(d.autoPersonal?'auto':'ok'):'falta',personas?'':'Llena el Tareo del turno o escribe los nombres');
    const negativos=cs.filter(q=>{const h=horasEfectivasReales(q);return h!==null&&h<0;});
    add('Horas efectivas',negativos.length?'falta':'ok',negativos.length?'Negativas en '+negativos.map(q=>q.marca+' ('+horasEfectivasReales(q).toFixed(2)+' h)').join(', ')+': las paradas superan la duración':'');
    add('Lote y vencimiento',todos(q=>q.lote&&q.fechaVencimiento)?'auto':'falta');
    add('Insumos (estimados, revísalos)',todos(q=>insumosDe(q)>0)?'auto':'falta');
    if(LINEAS_SEC[linea])add(LINEAS_SEC[linea],todos(q=>num(q.produccion&&q.produccion.sopladas)>0)?'ok':'falta');
    if(LINEAS_SEC[linea]&&linea!=='B20L')add('Calidad',todos(q=>num(q.produccion&&q.produccion.calidad)>0)?'ok':'falta');
    add('Mermas',todos(q=>tieneMermas(q)||q.sinMermas)?'ok':'falta',cs.some(q=>q.sinMermas&&!tieneMermas(q))?'Confirmado «Sin mermas» en: '+cs.filter(q=>q.sinMermas&&!tieneMermas(q)).map(q=>q.marca).join(', '):'');
    add('Observaciones',String(d&&d.observaciones||'').trim()?'ok':'opcional');
    return items;
  }

  /* ---------- aplicar al registro abierto ---------- */
  /* Globales de otros archivos (algunas son let/const: no están en window) se leen por su nombre. */
  const draftActual=()=>typeof draft!=='undefined'?draft:null;
  function activo(d){
    return !!d&&d.autollenadoV1===true&&(!d.estadoRegistro||d.estadoRegistro==='EN_REGISTRO')&&
      !(typeof reporteEstaBloqueado==='function'&&reporteEstaBloqueado());
  }
  function completar(d){
    if(!activo(d))return false;
    let cambio=false;
    const progs=typeof loadProgramaciones==='function'?loadProgramaciones():[];
    const productos=productosDelTurno(d,progs);
    const cs=typeof normalizarCuadros==='function'?normalizarCuadros(d):d.cuadros;
    // 1) marcas iniciadas sin pestaña
    marcasPorAgregar(d,productos).forEach(({i,producto})=>{
      const q=cs[i];if(!q)return;
      if(typeof ponerProductoEnCuadro==='function')ponerProductoEnCuadro(q,producto);
      else{q.marca=producto.marca;q.presentacion=producto.presentacion;q.marcaPorDefecto=false;}
      q.autoMarca=true;cambio=true;
      if(typeof actualizarCuadro==='function')actualizarCuadro(i);
    });
    // 2) horas desde Iniciar / Finalizar
    const def=typeof horasDefectoCuadro==='function'?horasDefectoCuadro(d.turno):null;
    cs.forEach((q,i)=>{
      if(!q||!q.marca||q.marcaPorDefecto)return;
      const p=productos.find(x=>mismoProducto(x,q));
      const h=horasPorPoner(q,p,i===0?def:null);
      if(!h.horaInicio&&!h.horaFin)return;
      q.autoHoras=Object.assign({},q.autoHoras||{});
      if(h.horaInicio){q.horaInicio=h.horaInicio;q.autoHoras.inicio=h.horaInicio;}
      if(h.horaFin){q.horaFin=h.horaFin;q.autoHoras.fin=h.horaFin;}
      if(typeof actualizarCuadro==='function')actualizarCuadro(i);
      cambio=true;
    });
    // 3) vencimiento
    cs.forEach(q=>{
      if(!q||!q.marca||q.marcaPorDefecto||q.fechaVencimiento||q.estadoCuadro==='FINALIZADO')return;
      const v=vencimiento(d.fecha,d.turno,vidaUtilMeses(d.linea));
      if(v){q.fechaVencimiento=v;q.autoVencimiento=true;cambio=true;}
    });
    // 4) personal desde el Tareo
    const T=raiz.GlacialPersonalTareo;
    if(T&&Array.isArray(d.personal)&&d.personal.some(f=>f&&!String(f.nombre||'').trim())){
      const lista=T.presentes(typeof loadTareos==='function'?loadTareos():[],d.fecha,d.turno,typeof loadWorkers==='function'?loadWorkers():[],typeof tareoAreaDe==='function'?tareoAreaDe:null);
      if(lista){
        const prop=T.proponer(lista,d.personal,d.linea);
        prop.forEach(x=>{d.personal[x.i].nombre=x.nombre;d.personal[x.i].cargo=x.cargo;});
        if(prop.length){d.autoPersonal=true;cambio=true;}
      }
    }
    if(cambio&&typeof syncLegacyFromCuadro1==='function')syncLegacyFromCuadro1();
    return cambio;
  }

  /* ---------- pantalla ---------- */
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function panelHtml(d){
    const items=pendientesCierre(d);
    const faltan=items.filter(x=>x.estado==='falta').length;
    const marca={auto:['✔ automático','#166534'],ok:['✔ ingresado','#166534'],falta:['● falta','#B45309'],opcional:['○ opcional','#6B7280']};
    return `<div class="reg-para-cerrar" style="margin:12px 0;border:1px solid ${faltan?'#F0C36D':'#9AD3B0'};border-radius:10px;background:#fff;overflow:hidden">
      <div style="padding:10px 12px;background:${faltan?'#FFF4D6':'#E8F6EE'};color:${faltan?'#7A5200':'#14532D'};font-weight:700">
        ${faltan?`Para cerrar el turno faltan ${faltan} dato(s). Lo demás se llenó solo.`:'Para cerrar el turno: todo listo.'}
        <small style="display:block;font-weight:400">Lo marcado «● falta» es obligatorio para finalizar el reporte.</small></div>
      <ul style="list-style:none;margin:0;padding:0 12px">${items.map(x=>`<li style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #EEF2F5;font-size:13.5px">
        <span>${esc(x.etiqueta)}${x.detalle?`<small style="display:block;color:#6B7280">${esc(x.detalle)}</small>`:''}</span>
        <b style="color:${marca[x.estado][1]};white-space:nowrap">${marca[x.estado][0]}</b></li>`).join('')}</ul></div>`;
  }
  function pintarPanel(){
    const d=draftActual();
    const main=typeof document!=='undefined'&&document.getElementById('main');
    if(!main||!d||!activo(d)||!(typeof state!=='undefined'&&state&&state.currentTab==='nuevo'))return;
    main.querySelectorAll('.reg-para-cerrar').forEach(e=>e.remove());
    const ancla=main.querySelector('.reporte-cierre-panel');
    if(!ancla)return;
    const div=document.createElement('div');div.innerHTML=panelHtml(d);
    ancla.parentNode.insertBefore(div.firstElementChild,ancla);
  }

  /* Aviso en vivo en cada pestaña: horas efectivas negativas. Casilla «Sin mermas en esta producción». */
  function pintarCuadros(){
    const d=draftActual();
    const main=typeof document!=='undefined'&&document.getElementById('main');
    if(!main||!d||!(typeof state!=='undefined'&&state&&state.currentTab==='nuevo'))return;
    const bloqueado=typeof reporteEstaBloqueado==='function'&&reporteEstaBloqueado();
    main.querySelectorAll('.reg-horas-negativas,.reg-sin-mermas').forEach(e=>e.remove());
    (Array.isArray(d.cuadros)?d.cuadros:[]).forEach((q,i)=>{
      const card=document.getElementById('reg-cuadro-'+i);if(!card||!q)return;
      const h=horasEfectivasReales(q);
      if(h!==null&&h<0){
        const div=document.createElement('div');div.className='reg-horas-negativas';div.setAttribute('role','alert');
        div.style.cssText='margin:0 0 10px;padding:10px 12px;border-radius:8px;background:#FDECEA;border:1px solid #F5B7B1;border-left:5px solid #C0392B;color:#7B241C;font-size:13.5px';
        div.innerHTML=`<b>⚠ Horas efectivas negativas: ${esc(h.toFixed(2))} h.</b> Las paradas suman ${esc(minutosParadas(q))} min y esta producción dura ${esc(Math.round(num(q.horasTurno)*60))} min (${esc(q.horaInicio||'—')} a ${esc(q.horaFin||'—')}). Revisa la hora de inicio, la de fin o los minutos de las paradas. No se puede finalizar así.`;
        card.insertBefore(div,card.firstChild);
        // El resumen del cuadro muestra 0,00 h (el cálculo no baja de 0): aquí se muestra el valor real en rojo.
        const et=[...card.querySelectorAll('small')].find(x=>/^\s*Horas efectivas\s*$/.test(x.textContent||''));
        const val=et&&et.parentElement&&et.parentElement.querySelector('strong');
        if(val){val.textContent=h.toFixed(2)+' h';val.style.color='#C0392B';}
      }
      if(bloqueado||tieneMermas(q)||q.estadoCuadro==='FINALIZADO')return;
      const head=[...card.querySelectorAll('.panel-head')].find(x=>/^\s*Mermas\s*$/i.test((x.querySelector('h4')||{}).textContent||''));
      if(!head)return;
      const lab=document.createElement('label');lab.className='reg-sin-mermas';
      lab.style.cssText='display:inline-flex;align-items:center;gap:6px;margin-left:12px;font-size:13px;font-weight:600;cursor:pointer';
      lab.innerHTML=`<input type="checkbox" data-no-autosave ${q.sinMermas?'checked':''} onchange="registroSinMermas(${i},this.checked)"> Sin mermas en esta producción`;
      head.appendChild(lab);
    });
  }
  if(typeof window!=='undefined')window.registroSinMermas=function(i,v){
    const d=draftActual();if(!d||!d.cuadros||!d.cuadros[i])return;
    if(v)d.cuadros[i].sinMermas=true;else delete d.cuadros[i].sinMermas;
    if(typeof programarGuardadoAutomaticoReporte==='function')programarGuardadoAutomaticoReporte();
    if(typeof renderFormTab==='function')renderFormTab();
  };

  /* ---------- enganches ---------- */
  if(typeof document!=='undefined'&&typeof raiz.validarReporteParaFinalizar==='function'){
    // Lo nuevo obligatorio se suma a lo de siempre: la barra «Revisar», «Falta para finalizar» y «Finalizar reporte» lo usan.
    const val=raiz.validarReporteParaFinalizar;
    raiz.validarReporteParaFinalizar=function(){
      const base=val.apply(this,arguments)||[];
      let extra=[];try{extra=obligatoriosCierre(draftActual());}catch(e){console.warn('Obligatorios del cierre:',e);}
      return [...new Set(base.concat(extra))];
    };
  }
  if(typeof document!=='undefined'&&typeof raiz.destinoFaltanteRegistro==='function'){
    const dest=raiz.destinoFaltanteRegistro;
    raiz.destinoFaltanteRegistro=function(texto){
      const r=dest.apply(this,arguments);
      if(r&&r.tipo==='cuadro'&&!r.campo){
        const t=String(texto||'').toLowerCase();
        r.campo=/de calidad/.test(t)?'produccion.calidad':/disponibles/.test(t)?'produccion.sopladas':/paletas/.test(t)?'produccion.paletas':'';
      }
      return r;
    };
  }
  if(typeof document!=='undefined'&&typeof raiz.cuadro1DesdeProgramacion==='function'){
    // preparar() y refrescar() de 35 llaman a cuadro1DesdeProgramacion en cada pintado y cada minuto: se completa ahí mismo.
    const original=raiz.cuadro1DesdeProgramacion;
    raiz.cuadro1DesdeProgramacion=function(){
      let c=false;
      try{c=original.apply(this,arguments);}catch(e){console.warn('Autollenado (cuadro 1):',e);}
      try{c=completar(draftActual())||c;}catch(e){console.warn('Autollenado completo:',e);}
      return c;
    };
  }
  if(typeof document!=='undefined'&&typeof raiz.renderFormTab==='function'){
    const rf=raiz.renderFormTab;
    raiz.renderFormTab=function(){const r=rf.apply(this,arguments);try{pintarPanel();}catch(e){console.warn('Para cerrar el turno:',e);}try{pintarCuadros();}catch(e){console.warn('Avisos del registro:',e);}return r;};
  }

  const API={horasEfectivasReales,obligatoriosCierre,vencimiento,vidaUtilMeses,productosDelTurno,marcasPorAgregar,horasPorPoner,pendientesCierre,completar,panelHtml,VIDA_UTIL_INICIAL};
  raiz.glacialAutollenadoCompleto=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
