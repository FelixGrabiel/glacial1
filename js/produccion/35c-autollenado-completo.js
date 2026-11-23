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
    add('Lote y vencimiento',todos(q=>q.lote&&q.fechaVencimiento)?'auto':'falta');
    add('Insumos (estimados, revísalos)',sum(q=>num(q.insumos&&q.insumos.planchasCarton)+num(q.insumos&&q.insumos.stretchFilmKg)+num(q.insumos&&q.insumos.cajasPreformas)+num(q.insumos&&q.insumos.polietilenoKg))>0?'auto':'falta');
    if(LINEAS_SEC[linea])add(LINEAS_SEC[linea],todos(q=>num(q.produccion&&q.produccion.sopladas)>0)?'ok':'falta');
    if(LINEAS_SEC[linea]&&linea!=='B20L')add('Calidad',todos(q=>num(q.produccion&&q.produccion.calidad)>0)?'ok':'falta');
    add('Mermas',cs.some(q=>(q.mermas||[]).some(m=>num(m&&m.unidades)>0||num(m&&m.peso)>0))?'ok':'falta');
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
        <small style="display:block;font-weight:400">Solo es una guía: lo obligatorio para finalizar es lo que pide «Falta para finalizar».</small></div>
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

  /* ---------- enganches ---------- */
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
    raiz.renderFormTab=function(){const r=rf.apply(this,arguments);try{pintarPanel();}catch(e){console.warn('Para cerrar el turno:',e);}return r;};
  }

  const API={vencimiento,vidaUtilMeses,productosDelTurno,marcasPorAgregar,horasPorPoner,pendientesCierre,completar,panelHtml,VIDA_UTIL_INICIAL};
  raiz.glacialAutollenadoCompleto=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
