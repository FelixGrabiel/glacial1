/* =============================================================
   GLACIAL · ASISTENTE DE PRODUCCIÓN — PANTALLA
   -------------------------------------------------------------
   Pestañas: Resumen · Seguimiento del turno · Insumos · Solicitudes · Consumo · Merma · Parámetros · Historial.
   Solo CONSULTA Programación, Paletas, Avance/Cierre y Tareo; registra únicamente lo suyo (movimientos, solicitudes, conciliaciones
   y mermas) a través de 71-asistente-datos.js. Todos los indicadores salen de registros reales (nada se escribe a mano).
   ============================================================= */
(function instalarAsistentePantalla(){
  'use strict';
  const N=window.glacialAsistenteNucleo,D=window.glacialAsistenteDatos;
  const esc=v=>typeof escaparHtml==='function'?escaparHtml(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const fmt=(v,dec)=>v===null||v===undefined||v===''?'—':Number(v).toLocaleString('es-PE',{maximumFractionDigits:dec===undefined?2:dec,minimumFractionDigits:0});
  const pct=v=>v===null||v===undefined?'—':(v*100).toLocaleString('es-PE',{maximumFractionDigits:1})+' %';
  const hora=ms=>ms?new Date(Number(ms)).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'}):'—';
  const fechaHora=ms=>ms?new Date(Number(ms)).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
  const puede=k=>D.puede(k);
  const PESTANAS=[['resumen','Resumen'],['seguimiento','Seguimiento del turno'],['insumos','Insumos'],['solicitudes','Solicitudes'],['consumo','Consumo'],['merma','Merma'],['parametros','Parámetros'],['historial','Historial']];
  const ESTADO_TXT={EN_PRODUCCION:['En curso','curso'],PAUSA:['En pausa','pausa'],DETENIDA:['Detenida','detenida'],LISTA:['Programada','prog'],PENDIENTE:['Programada','prog'],
    FINALIZADA:['Finalizada','fin'],CANCELADA:['Cancelada','cancel']};
  const SOL_TXT={BORRADOR:'Borrador',SOLICITADA:'Solicitada',EN_PREPARACION:'En preparación',ENTREGADA_PARCIAL:'Entregada parcialmente',ENTREGADA:'Entregada',RECIBIDA:'Recibida',
    OBSERVADA:'Observada',CANCELADA:'Cancelada',CERRADA:'Cerrada'};

  const AP={tab:'resumen',fecha:'',bloque:'',linea:'',cuadro:'',insumo:'',msg:null,factLinea:'',factInsumo:'',histTipo:'',histLinea:''};
  function contextoInicial(){
    if(AP.fecha)return;
    let b=null;try{b=window.GlacialIndicadores.bloqueVigente(D.ahora(),typeof window.glacialBloquesConfig==='function'?window.glacialBloquesConfig():undefined);}catch(_){b=null;}
    AP.fecha=b&&b.fecha||new Date(D.ahora()).toISOString().slice(0,10);
    AP.bloque=b&&b.bloque==='noche'?'NOCHE':'DIA';
  }

  /* ---------- contexto calculado (una sola fuente para todas las pestañas) ---------- */
  function contexto(){
    const C=D.cache;
    const lineasPermitidas=(typeof LINES!=='undefined'?LINES.map(l=>l.key):N.LINEAS.map(l=>l.codigo)).filter(l=>N.LINEAS.some(x=>x.codigo===l));
    const cuadros=N.cuadrosDelBloque({fecha:AP.fecha,bloque:AP.bloque,lineas:lineasPermitidas,
      programaciones:typeof loadProgramaciones==='function'?loadProgramaciones():[],records:typeof loadRecords==='function'?loadRecords():[],
      produccionAlCorte:window.glacialProduccionPaletasAlCorte,unidadesPorPaleta:typeof obtenerUnidadesPorPalet==='function'?obtenerUnidadesPorPalet:null});
    const req=N.requerimientos({cuadros,factores:C.factores,insumos:C.insumos,movimientos:C.movimientos});
    const mermasBloque=C.mermas.filter(m=>m.bloque===N.bloqueDe(AP.bloque));
    const concil=[];
    cuadros.forEach(c=>{
      (C.insumos||[]).filter(i=>i.activo!==false).forEach(i=>{
        const fv=N.factorVigente(C.factores,{insumo:i.codigo,linea:c.linea,marca:c.marca,presentacion:c.presentacion,fecha:c.fecha});
        if(fv.factor&&Number(fv.factor.factor)===0)return;
        if(fv.error&&!(C.factores||[]).some(f=>f.insumo===i.codigo&&f.linea===c.linea))return;
        const doc=C.conciliaciones.find(x=>x.id===D.idConciliacion(c.clave,i.codigo))||null;
        const mv=N.movimientosCuadro(C.movimientos,c.clave,i.codigo);
        const teo=fv.factor?N.teorico(c.producido,c.unidadesPorPaleta,fv.factor):null;
        const mval=N.mermaValidada(mermasBloque,c.clave,i.codigo,i.unidad);
        const r=N.conciliar({saldoInicial:doc?doc.saldoInicial:null,saldoFinal:doc?doc.saldoFinal:null,...mv,teorico:teo,mermaValidada:mval});
        concil.push({cuadro:c,insumo:i,factor:fv.factor||null,factorError:fv.error||'',doc,mov:mv,teorico:teo,mermaValidada:mval,...r,unidad:i.unidad,
          etiqueta:N.lineaInfo(c.linea).nombre+' · '+c.codigo+' · '+i.nombre,estado:doc?doc.estado:'SIN_REGISTRO'});
      });
    });
    const solicitudes=C.solicitudes.filter(s=>s.fecha===AP.fecha&&s.bloque===N.bloqueDe(AP.bloque));
    return {cuadros,req,resumen:N.resumenInsumos(req),concil,mermas:mermasBloque,solicitudes,
      alertas:N.alertas({requerimientos:req,conciliaciones:concil,mermas:mermasBloque,solicitudes}),
      pendientes:N.pendientesDeCierre({solicitudes,mermas:mermasBloque,conciliaciones:concil})};
  }

  /* ---------- piezas comunes ---------- */
  const badge=(txt,cls)=>`<span class="ap-badge ap-b-${cls}">${esc(txt)}</span>`;
  const kpi=(icono,titulo,valor,sub,cls)=>`<div class="ap-kpi ${cls||''}"><span class="ap-kpi-ico" aria-hidden="true">${icono}</span><div><span class="ap-kpi-t">${esc(titulo)}</span><b>${valor}</b>${sub?`<small>${sub}</small>`:''}</div></div>`;
  const vacio=t=>`<div class="ap-vacio">${esc(t)}</div>`;
  /* Presentación con el nombre de pantalla de Paletas (16-paletas.js); los datos guardan la clave original. */
  const presUI=c=>{try{return typeof nombrePresentacionUI==='function'?(nombrePresentacionUI(c.linea,c.marca,c.presentacion)||c.presentacion):c.presentacion;}catch(_){return c.presentacion;}};
  const nombreCuadro=c=>`${N.lineaInfo(c.linea).nombre} · ${c.codigo} · ${c.marca} ${presUI(c)}`;
  /* Nombre de un cuadro a partir de su clave (movimientos e historial); si no es del bloque visible, se arma con la clave. */
  const cuadroDeClave=(ctx,clave)=>{const c=ctx.cuadros.find(x=>x.clave===clave);if(c)return nombreCuadro(c);const p=String(clave||'').split('|');return p.length>=5?`${N.lineaInfo(p[2]).nombre} · ${p[3]} ${p[4]} (${p[0]})`:'—';};
  const opcionesCuadros=(ctx,sel,soloLinea)=>ctx.cuadros.filter(c=>!soloLinea||c.linea===soloLinea).map(c=>`<option value="${esc(c.clave)}" ${c.clave===sel?'selected':''}>${esc(nombreCuadro(c))}</option>`).join('');
  const opcionesInsumos=(sel,filtro)=>D.cache.insumos.filter(i=>i.activo!==false&&(!filtro||filtro(i))).sort((a,b)=>a.nombre.localeCompare(b.nombre))
    .map(i=>`<option value="${esc(i.codigo)}" data-unidad="${esc(i.unidad)}" ${i.codigo===sel?'selected':''}>${esc(i.nombre)} (${esc(i.unidad)})</option>`).join('');
  const insumoDe=c=>D.cache.insumos.find(i=>i.codigo===c)||{codigo:c,nombre:c,unidad:''};
  function aviso(){
    if(!AP.msg)return '';
    return `<div class="ap-msg ap-msg-${AP.msg.tipo}" role="${AP.msg.tipo==='error'?'alert':'status'}">${esc(AP.msg.texto)}<button type="button" aria-label="Cerrar" onclick="apCerrarMsg()">✕</button></div>`;
  }
  window.apCerrarMsg=()=>{AP.msg=null;pintar();};
  async function ejecutar(fn,ok){
    try{const r=await fn();AP.msg={tipo:'ok',texto:typeof ok==='function'?ok(r):ok};}
    catch(e){AP.msg={tipo:'error',texto:D.mensajeError(e)};console.warn('Asistente:',e);}
    pintar();
  }
  const valor=id=>{const el=document.getElementById(id);return el?el.value:'';};

  /* ---------- pestañas ---------- */
  function tabResumen(ctx){
    const c=ctx.cuadros,enCurso=c.filter(x=>['EN_PRODUCCION','PAUSA','DETENIDA'].includes(x.estado)).length,comp=c.filter(x=>x.estado==='FINALIZADA').length;
    const conMeta=c.filter(x=>x.programado>0),prom=conMeta.length?conMeta.reduce((s,x)=>s+x.cumplimiento,0)/conMeta.length:null;
    const mVal=ctx.mermas.filter(m=>m.estado==='VALIDADA').length,mPend=ctx.mermas.filter(m=>m.estado==='PENDIENTE').length;
    const solPend=ctx.solicitudes.filter(s=>!['CERRADA','CANCELADA','RECIBIDA'].includes(s.estado)).length;
    const filas=c.map(x=>{const e=ESTADO_TXT[x.estado]||ESTADO_TXT.PENDIENTE;const u=N.lineaInfo(x.linea).unidad;
      return `<tr><td data-label="Línea"><b>${esc(N.lineaInfo(x.linea).nombre)}</b></td><td data-label="Marca">${esc(x.marca)}</td><td data-label="Presentación">${esc(presUI(x))}</td>
        <td data-label="Cuadro">${esc(x.codigo)}${x.reporte&&x.reporte.lote?` <small>· ${esc(x.reporte.lote)}</small>`:''}</td><td data-label="Programado" class="ap-num">${fmt(x.programado,0)} ${u}</td>
        <td data-label="Producido" class="ap-num">${fmt(x.producido,0)} ${u}<small class="ap-fuente">${esc(x.fuenteProduccion)}</small></td><td data-label="Cumplimiento" class="ap-num">${pct(x.cumplimiento)}</td><td data-label="Estado">${badge(e[0],e[1])}</td></tr>`;}).join('');
    const ins=ctx.resumen.map(r=>`<tr><td data-label="Insumo"><b>${esc(r.insumo.nombre)}</b></td><td data-label="Requerido" class="ap-num">${fmt(r.requerido)} ${esc(r.insumo.unidad)}</td>
      <td data-label="Disponible" class="ap-num">${fmt(r.utilizable)} ${esc(r.insumo.unidad)}</td><td data-label="Pendiente de consumo" class="ap-num">${fmt(r.pendiente)} ${esc(r.insumo.unidad)}</td>
      <td data-label="Faltante" class="ap-num ${r.faltante>0?'ap-rojo':''}">${fmt(r.faltante)} ${esc(r.insumo.unidad)}</td><td data-label="Observación">${r.sinFactor?badge(r.sinFactor+' sin factor','aten'):''}${r.pendienteCierre?badge('Pendiente del cierre','aten'):''}${r.conteo?'':badge('Sin conteo','gris')}</td></tr>`).join('');
    const mer=N.resumenMermas(ctx.mermas).map(m=>`<tr><td data-label="Material">${esc(m.categoria==='PRODUCTO'?'Producto: ':'')}${esc(insumoDe(m.insumo).nombre)}</td><td data-label="Unidad">${esc(m.unidad)}</td><td data-label="Validada" class="ap-num">${fmt(m.validada)}</td><td data-label="Pendiente" class="ap-num">${fmt(m.pendiente)}</td></tr>`).join('');
    const al=ctx.alertas.map(a=>`<li class="ap-al-${a.nivel}">${esc(a.texto)}</li>`).join('');
    const p=ctx.pendientes;
    return `<div class="ap-kpis">${kpi('▤','Cuadros del turno',c.length,`${enCurso} en curso · ${c.length-enCurso-comp} por iniciar · ${comp} finalizados`)}
      ${kpi('◔','Cumplimiento promedio',pct(prom),'promedio simple por cuadro')}
      ${kpi('⚠','Alertas',ctx.alertas.filter(a=>a.nivel!=='info').length,'desabastecimiento, factores y por revisar',ctx.alertas.some(a=>a.nivel==='critico')?'ap-kpi-rojo':'')}
      ${kpi('✓','Mermas',`${mPend} <small>pendientes</small>`,`${mVal} validadas`)}${kpi('⇄','Solicitudes a Almacén',solPend,'sin cerrar')}</div>
      <section class="ap-card"><h3>Programado vs. producido</h3>${c.length?`<div class="ap-tw"><table class="ap-t"><thead><tr><th>Línea</th><th>Marca</th><th>Presentación</th><th>Cuadro</th><th>Programado</th><th>Producido</th><th>Cumplimiento</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table></div>`:vacio('Sin programación ni producción en este bloque.')}</section>
      <div class="ap-2"><section class="ap-card"><h3>Insumos del bloque</h3>${ins?`<div class="ap-tw"><table class="ap-t"><thead><tr><th>Insumo</th><th>Requerido</th><th>Disponible</th><th>Pendiente</th><th>Faltante</th><th></th></tr></thead><tbody>${ins}</tbody></table></div>`:vacio(D.cache.factores.length?'Sin requerimientos para este bloque.':'Aún no hay factores de consumo: cárgalos en Parámetros.')}</section>
      <section class="ap-card"><h3>Alertas</h3>${al?`<ul class="ap-alertas">${al}</ul>`:vacio('Sin alertas.')}
        <h4>Cierre del turno</h4><p class="ap-sub">${p.solicitudes||p.mermas||p.porRevisar||p.sinConciliar?`⚠ El turno tiene pendientes: ${p.solicitudes} solicitud(es) abierta(s) · ${p.mermas} merma(s) por validar · ${p.porRevisar} ítem(s) por revisar · ${p.sinConciliar} consumo(s) sin conciliar.`:'Sin movimientos pendientes.'}</p>
        <h4>Mermas acumuladas</h4>${mer?`<div class="ap-tw"><table class="ap-t"><thead><tr><th>Material</th><th>Unidad</th><th>Validada</th><th>Pendiente</th></tr></thead><tbody>${mer}</tbody></table></div>`:vacio('Sin mermas registradas.')}</section></div>`;
  }

  function tabSeguimiento(ctx){
    const porCuadro=new Map();ctx.req.forEach(f=>{const k=f.cuadro.clave;if(!porCuadro.has(k))porCuadro.set(k,[]);porCuadro.get(k).push(f);});
    const conFalt=ctx.cuadros.filter(c=>(porCuadro.get(c.clave)||[]).some(f=>f.faltante>0)).length;
    const pendCierre=ctx.cuadros.filter(c=>c.completar&&!(c.programado>0)).length;
    const MODO={FIJA:'Cantidad fija',COMPLETAR:'Completar cantidad',TURNO:'Todo el turno',HORA:'Hasta una hora'};
    const filas=ctx.cuadros.map(c=>{
      const fs=porCuadro.get(c.clave)||[];
      const falt=fs.filter(f=>f.faltante>0),sin=fs.filter(f=>f.estado==='SIN_FACTOR'||f.estado==='FACTOR_AMBIGUO');
      const est=c.estado==='FINALIZADA'?badge('Finalizada','fin'):c.completar&&!(c.programado>0)?badge('Pendiente del cierre','aten')
        :falt.length?falt.map(f=>badge('Falta '+f.insumo.nombre.toLowerCase(),'rojo')).join(' '):sin.length?badge(sin.length+' sin factor','aten')
        :fs.length?(fs.every(f=>f.conteo)?badge('Cubierto','fin'):badge('Por verificar','prog')):badge('Sin requerimientos','gris');
      const p=(typeof loadProgramaciones==='function'?loadProgramaciones():[]).find(x=>c.programaciones.includes(x.id));
      return `<tr><td data-label="Línea"><b>${esc(N.lineaInfo(c.linea).nombre)}</b></td><td data-label="Marca">${esc(c.marca)} ${esc(presUI(c))}</td><td data-label="Modalidad">${esc(p?MODO[p.modo]||'Programada':'Sin programación')}</td>
        <td data-label="Materiales">${est}</td><td data-label="Acción"><button type="button" class="ap-btn ap-btn-o" onclick="apVerCuadro('${esc(c.clave)}')">Ver detalle</button></td></tr>`;}).join('');
    return `<div class="ap-kpis ap-kpis-3">${kpi('▤','Órdenes del turno',ctx.cuadros.length,'cuadros del bloque')}${kpi('⚠','Con faltantes',conFalt,'',conFalt?'ap-kpi-ambar':'')}${kpi('◷','Pendiente de cierre previo',pendCierre,'modo «completar cantidad»')}</div>
      <section class="ap-card"><h3>Necesidades por programación</h3>${filas?`<div class="ap-tw"><table class="ap-t"><thead><tr><th>Línea</th><th>Marca</th><th>Modalidad</th><th>Materiales</th><th>Acción</th></tr></thead><tbody>${filas}</tbody></table></div>`:vacio('Sin programación en este bloque.')}</section>
      <section class="ap-card ap-info"><ul><li>Cambiar marca, presentación o cantidad en Planificación actualiza los faltantes al instante (las reservas se calculan, no se duplican).</li>
        <li>Durante la ejecución se calcula lo necesario para terminar: requerido − consumo ya conciliado.</li><li>«Completar cantidad» sin cierre previo: requerimiento pendiente, no cero.</li></ul>
        <p class="ap-sub">Agregar una programación no inicia la producción ni consume material.</p></section>`;
  }
  window.apVerCuadro=function(clave){
    const ctx=contexto();const c=ctx.cuadros.find(x=>x.clave===clave);if(!c)return;
    const fs=ctx.req.filter(f=>f.cuadro.clave===clave);
    const filas=fs.map(f=>`<tr><td>${esc(f.insumo.nombre)}</td><td>${f.factor?`${fmt(f.factor.factor,4)} ${esc(f.insumo.unidad)} / ${fmt(f.factor.cantidadBase,0)} ${f.factor.base==='PALETA'?'paleta':'UND'}`:'—'}</td>
      <td class="ap-num">${f.estado==='OK'?fmt(f.requerido):f.estado==='PENDIENTE_CIERRE'?'Pendiente del cierre':f.estado==='SIN_BASE'?'Sin UND por paleta':'Pendiente de configurar'}</td>
      <td class="ap-num">${fmt(f.consumido)}</td><td class="ap-num">${f.estado==='OK'?fmt(f.reservadoOtros):'—'}</td><td class="ap-num">${f.estado==='OK'?fmt(f.disponible):'—'}</td><td class="ap-num ${f.faltante>0?'ap-rojo':''}">${f.estado==='OK'?fmt(f.faltante):'—'}</td></tr>`).join('');
    modal(`${esc(nombreCuadro(c))}`,`<p class="ap-sub">Programado ${fmt(c.programado,0)} · producido ${fmt(c.producido,0)} ${N.lineaInfo(c.linea).unidad} (${esc(c.fuenteProduccion)}) · ${fmt(c.unidadesPorPaleta,0)} UND por paleta${c.reporte&&c.reporte.lote?' · lote '+esc(c.reporte.lote):''}</p>
      ${filas?`<div class="ap-tw"><table class="ap-t"><thead><tr><th>Insumo</th><th>Factor</th><th>Requerido</th><th>Consumido</th><th>Reservado otras</th><th>Disponible</th><th>Faltante</th></tr></thead><tbody>${filas}</tbody></table></div>`:vacio('Sin factores para esta línea.')}`);
  };

  function tabInsumos(ctx){
    const ins=D.cache.insumos.filter(i=>i.activo!==false);
    const filas=ins.map(i=>{
      const s=N.saldoInsumo(D.cache.movimientos,i.codigo);const r=ctx.resumen.find(x=>x.insumo.codigo===i.codigo);
      const reservado=ctx.req.filter(f=>f.insumo.codigo===i.codigo&&f.estado==='OK'&&N.cuadroAbierto(f.cuadro)).reduce((a,f)=>a+f.pendiente,0);
      return `<tr><td data-label="Insumo"><b>${esc(i.nombre)}</b></td><td data-label="Utilizable" class="ap-num">${fmt(s.utilizable)} ${esc(i.unidad)}</td><td data-label="Observado" class="ap-num">${fmt(s.observado)} ${esc(i.unidad)}</td>
        <td data-label="Reservado (órdenes abiertas)" class="ap-num">${fmt(N.red(reservado,4))} ${esc(i.unidad)}</td><td data-label="Requerido del bloque" class="ap-num">${r?fmt(r.requerido):'—'}</td>
        <td data-label="Faltante" class="ap-num ${r&&r.faltante>0?'ap-rojo':''}">${r?fmt(r.faltante):'—'}</td><td data-label="Último conteo">${s.conteo?`${fmt(s.conteo.cantidad)} · ${esc(s.conteo.usuario)} ${fechaHora(s.conteo.en)}`:badge('Sin conteo','gris')}</td></tr>`;}).join('');
    const puedeReg=puede('asistenteProduccion');
    const form=puedeReg?`<section class="ap-card"><h3>Registrar movimiento</h3>
      <div class="ap-form"><label>Tipo<select id="ap-mov-tipo" onchange="apMovTipo()"><option value="CONTEO">Conteo físico (fija el saldo)</option><option value="DEVOLUCION">Devolución a Almacén</option>
        <option value="TRANSFERENCIA_ENTRADA">Transferencia recibida</option><option value="TRANSFERENCIA_SALIDA">Transferencia enviada</option></select></label>
      <label>Insumo<select id="ap-mov-insumo">${opcionesInsumos('')}</select></label>
      <label class="ap-mov-cuadro" hidden>Cuadro<select id="ap-mov-cuadro"><option value="">— Elegir —</option>${opcionesCuadros(ctx,'')}</select></label>
      <label>Cantidad<input id="ap-mov-cant" type="number" min="0" step="any" inputmode="decimal"></label>
      <label>Condición<select id="ap-mov-cond"><option value="UTILIZABLE">Utilizable</option><option value="OBSERVADO">Observado / dañado (no disponible)</option></select></label>
      <label>Lote (opcional)<input id="ap-mov-lote" maxlength="40"></label><label class="ap-ancho">Observación<input id="ap-mov-motivo" maxlength="200"></label></div>
      <div class="ap-acc"><button type="button" class="ap-btn" onclick="apGuardarMovimiento()">Guardar movimiento</button></div>
      <p class="ap-sub">El conteo ajusta el saldo con historial; no genera una entrega de Almacén. Las entregas entran por <b>Solicitudes</b> al confirmar lo recibido.</p></section>`:'';
    const movs=D.cache.movimientos.slice().sort((a,b)=>num(b.en)-num(a.en)).slice(0,30);
    const anulados=new Set(D.cache.movimientos.filter(m=>m.tipo==='ANULACION').map(m=>m.anulaA));
    const tm=movs.map(m=>`<tr class="${anulados.has(m.opId)?'ap-anulado':''}"><td data-label="Hora">${fechaHora(m.en)}</td><td data-label="Tipo">${esc(m.tipo)}</td><td data-label="Insumo">${esc(insumoDe(m.insumo).nombre)}</td>
      <td data-label="Cantidad" class="ap-num">${m.tipo==='ANULACION'?'—':fmt(m.cantidad)+' '+esc(m.unidad||insumoDe(m.insumo).unidad)}</td><td data-label="Cuadro">${esc(m.cuadro?cuadroDeClave(ctx,m.cuadro):'—')}</td><td data-label="Responsable">${esc(m.usuario)}</td>
      <td data-label="">${puedeReg&&!['ANULACION','CONSUMO'].includes(m.tipo)&&!anulados.has(m.opId)?`<button type="button" class="ap-btn ap-btn-o ap-btn-s" onclick="apAnularMov('${esc(m.opId)}')">Anular</button>`:anulados.has(m.opId)?'Anulado':''}</td></tr>`).join('');
    return `<section class="ap-card"><h3>Saldo verificado y disponibilidad · Producción</h3>${ins.length?`<div class="ap-tw"><table class="ap-t"><thead><tr><th>Insumo</th><th>Utilizable</th><th>Observado</th><th>Reservado (órdenes abiertas)</th><th>Requerido del bloque</th><th>Faltante</th><th>Último conteo</th></tr></thead><tbody>${filas}</tbody></table></div>`:vacio('Sin insumos en el catálogo (Parámetros).')}
      <p class="ap-nota">⚠ El material observado o dañado se excluye del disponible. Saldo = último conteo + recepciones y transferencias recibidas − devoluciones, transferencias enviadas y consumos confirmados. Las existencias de Almacén se gestionan aparte y no se incluyen.</p></section>
      ${form}<section class="ap-card"><h3>Trazabilidad del saldo (últimos movimientos)</h3>${tm?`<div class="ap-tw"><table class="ap-t"><thead><tr><th>Hora</th><th>Tipo</th><th>Insumo</th><th>Cantidad</th><th>Cuadro</th><th>Responsable</th><th></th></tr></thead><tbody>${tm}</tbody></table></div>`:vacio('Sin movimientos.')}</section>`;
  }
  window.apMovTipo=()=>{const t=valor('ap-mov-tipo');document.querySelectorAll('.ap-mov-cuadro').forEach(e=>{e.hidden=t==='CONTEO';});};
  window.apGuardarMovimiento=()=>{
    const ctx=contexto();const tipo=valor('ap-mov-tipo'),insumo=valor('ap-mov-insumo'),clave=valor('ap-mov-cuadro');const c=ctx.cuadros.find(x=>x.clave===clave);
    const op=D.nuevoId('mov');
    ejecutar(()=>D.registrarMovimiento({opId:op,tipo,insumo,unidad:insumoDe(insumo).unidad,cantidad:valor('ap-mov-cant'),condicion:valor('ap-mov-cond'),
      lote:valor('ap-mov-lote'),motivo:valor('ap-mov-motivo'),fecha:AP.fecha,bloque:AP.bloque,cuadro:tipo==='CONTEO'?'':clave,linea:c?c.linea:''}),
      r=>r&&r.duplicado?'Ese movimiento ya estaba guardado (no se duplicó).':'Movimiento guardado.');
  };
  window.apAnularMov=op=>{const m=prompt('Motivo de la anulación (mínimo 5 caracteres):');if(m===null)return;ejecutar(()=>D.anularMovimiento(op,m),'Movimiento anulado (queda en el historial).');};

  function tabSolicitudes(ctx){
    const asist=puede('asistenteProduccion'),alm=puede('moduloAlmacen');
    const faltantes=ctx.resumen.filter(r=>r.faltante>0);
    const lista=D.cache.solicitudes.slice().sort((a,b)=>String(b.id).localeCompare(String(a.id)));
    const filas=lista.map(s=>`<tr><td data-label="Solicitud"><b>${esc(s.id)}</b></td><td data-label="Fecha">${esc(s.fecha)} · ${s.bloque==='NOCHE'?'Noche':'Día'}</td>
      <td data-label="Ítems">${(s.items||[]).map(i=>`${esc(insumoDe(i.insumo).nombre)} ${fmt(i.solicitado)} ${esc(i.unidad)}`).join(' · ')}</td><td data-label="Estado">${badge(SOL_TXT[s.estado]||s.estado,{CERRADA:'fin',RECIBIDA:'fin',CANCELADA:'gris',OBSERVADA:'rojo'}[s.estado]||'aten')}</td>
      <td data-label=""><button type="button" class="ap-btn ap-btn-o ap-btn-s" onclick="apVerSolicitud('${esc(s.id)}')">Abrir</button></td></tr>`).join('');
    const nueva=asist?`<section class="ap-card"><h3>Preparar solicitud</h3>
      <p class="ap-sub">${faltantes.length?'Se proponen los faltantes del bloque; ajusta las cantidades si hace falta.':'No hay faltantes calculados; agrega los insumos que necesites.'}</p>
      <div class="ap-tw"><table class="ap-t"><thead><tr><th>Insumo</th><th>Cantidad</th></tr></thead><tbody>
      ${D.cache.insumos.filter(i=>i.activo!==false).map(i=>{const f=faltantes.find(x=>x.insumo.codigo===i.codigo);return `<tr><td>${esc(i.nombre)} (${esc(i.unidad)})</td><td><input class="ap-sol-cant" data-insumo="${esc(i.codigo)}" data-unidad="${esc(i.unidad)}" type="number" min="0" step="any" value="${f?Math.ceil(f.faltante*100)/100:''}"></td></tr>`;}).join('')}
      </tbody></table></div><label class="ap-ancho">Observaciones<input id="ap-sol-obs" maxlength="200"></label>
      <div class="ap-acc"><button type="button" class="ap-btn ap-btn-o" onclick="apCrearSolicitud(false)">Guardar borrador</button><button type="button" class="ap-btn" onclick="apCrearSolicitud(true)">Enviar a Almacén</button></div></section>`:'';
    return `${nueva}<section class="ap-card"><h3>Solicitudes a Almacén${alm?' · vista de Almacén':''}</h3>${filas?`<div class="ap-tw"><table class="ap-t"><thead><tr><th>Solicitud</th><th>Fecha</th><th>Ítems</th><th>Estado</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>`:vacio('Sin solicitudes en los últimos 60 días.')}
      <p class="ap-nota">ⓘ Solicitudes, reservas y entregas son operaciones distintas. Solo una recepción confirmada por Producción incrementa las existencias en Producción.</p></section>`;
  }
  window.apCrearSolicitud=enviar=>{
    const items=[...document.querySelectorAll('.ap-sol-cant')].map(i=>({insumo:i.dataset.insumo,unidad:i.dataset.unidad,solicitado:i.value})).filter(i=>num(i.solicitado)>0);
    ejecutar(()=>D.crearSolicitud({fecha:AP.fecha,bloque:AP.bloque,items,observaciones:valor('ap-sol-obs'),enviar}),id=>'Solicitud '+id+(enviar?' enviada a Almacén.':' guardada como borrador.'));
  };
  window.apVerSolicitud=function(id){
    const s=D.cache.solicitudes.find(x=>x.id===id);if(!s)return;const ctx=contexto();
    const asist=puede('asistenteProduccion'),alm=puede('moduloAlmacen');
    const it=(s.items||[]).map(i=>`<tr><td>${esc(insumoDe(i.insumo).nombre)}</td><td class="ap-num">${fmt(i.solicitado)}</td><td class="ap-num">${fmt(i.entregado)}</td><td class="ap-num">${fmt(i.recibido)}</td>
      <td>${alm&&['EN_PREPARACION','ENTREGADA_PARCIAL'].includes(s.estado)?`<input class="ap-ent" data-insumo="${esc(i.insumo)}" type="number" min="0" step="any" placeholder="Entregar">`:''}
      ${asist&&['ENTREGADA','ENTREGADA_PARCIAL','OBSERVADA'].includes(s.estado)&&num(i.entregado)>num(i.recibido)?`<input class="ap-rec" data-insumo="${esc(i.insumo)}" type="number" min="0" step="any" placeholder="Recibido" value="${N.red(num(i.entregado)-num(i.recibido),4)}">`:''}</td></tr>`).join('');
    const b=(estado,txt,cls)=>N.puedeTransicion(s.estado,estado)&&((N.ACTOR_ESTADO[estado]==='almacen'&&alm)||(N.ACTOR_ESTADO[estado]==='asistente'&&asist))
      ?`<button type="button" class="ap-btn ${cls||''}" onclick="apEstadoSolicitud('${esc(s.id)}','${estado}',${num(s.version)})">${txt}</button>`:'';
    const recibir=asist&&['ENTREGADA','ENTREGADA_PARCIAL','OBSERVADA'].includes(s.estado)
      ?`<label>Cuadro al que se destina<select id="ap-rec-cuadro"><option value="">— Elegir —</option>${opcionesCuadros(ctx,'')}</select></label><label>Lote (opcional)<input id="ap-rec-lote" maxlength="40"></label>
        <button type="button" class="ap-btn" onclick="apEstadoSolicitud('${esc(s.id)}','RECIBIDA',${num(s.version)})">Confirmar lo recibido</button>`:'';
    const entregar=alm&&['EN_PREPARACION','ENTREGADA_PARCIAL'].includes(s.estado)?`<button type="button" class="ap-btn" onclick="apEstadoSolicitud('${esc(s.id)}','ENTREGADA',${num(s.version)})">Registrar entrega</button>`:'';
    const hist=(s.historial||[]).map(h=>`<li>${fechaHora(h.en)} · <b>${esc(SOL_TXT[h.estado]||h.estado)}</b> · ${esc(h.por)}${h.nota?' — '+esc(h.nota):''}</li>`).join('');
    modal('Solicitud '+esc(s.id),`<p class="ap-sub">${esc(s.fecha)} · ${s.bloque==='NOCHE'?'Noche':'Mañana + Intermedio'} · ${badge(SOL_TXT[s.estado]||s.estado,'aten')}${s.observaciones?' · '+esc(s.observaciones):''}</p>
      <div class="ap-tw"><table class="ap-t"><thead><tr><th>Insumo</th><th>Solicitado</th><th>Entregado</th><th>Recibido</th><th></th></tr></thead><tbody>${it}</tbody></table></div>
      <label class="ap-ancho">Nota (opcional)<input id="ap-sol-nota" maxlength="200"></label>
      <div class="ap-acc ap-acc-wrap">${b('SOLICITADA','Enviar a Almacén')}${b('EN_PREPARACION','Iniciar preparación')}${entregar}${recibir}${b('OBSERVADA','Observar','ap-btn-o')}${b('CERRADA','Cerrar','ap-btn-o')}${b('CANCELADA','Cancelar','ap-btn-o')}</div>
      <h4>Historial</h4><ul class="ap-hist">${hist}</ul>`);
  };
  window.apEstadoSolicitud=(id,estado,version)=>{
    const ent={},rec={};
    document.querySelectorAll('.ap-ent').forEach(i=>{if(num(i.value)>0)ent[i.dataset.insumo]=num(i.value);});
    document.querySelectorAll('.ap-rec').forEach(i=>{if(num(i.value)>0)rec[i.dataset.insumo]=num(i.value);});
    const ctx=contexto();const clave=valor('ap-rec-cuadro');const c=ctx.cuadros.find(x=>x.clave===clave);
    if(typeof closeModal==='function')closeModal();
    ejecutar(()=>D.cambiarEstadoSolicitud(id,estado,version,{entregas:ent,recepciones:rec,cuadro:clave,linea:c?c.linea:'',lote:valor('ap-rec-lote'),nota:valor('ap-sol-nota')}),'Solicitud actualizada.');
  };

  function tabConsumo(ctx){
    const lineas=[...new Set(ctx.cuadros.map(c=>c.linea))];
    if(!AP.linea||!lineas.includes(AP.linea))AP.linea=lineas[0]||'';
    const cuadros=ctx.cuadros.filter(c=>c.linea===AP.linea);
    if(!cuadros.some(c=>c.clave===AP.cuadro))AP.cuadro=cuadros[0]?cuadros[0].clave:'';
    const filasC=ctx.concil.filter(x=>x.cuadro.clave===AP.cuadro);
    if(!filasC.some(x=>x.insumo.codigo===AP.insumo))AP.insumo=filasC[0]?filasC[0].insumo.codigo:'';
    const x=filasC.find(f=>f.insumo.codigo===AP.insumo);
    const sel=`<div class="ap-form ap-form-4"><label>Línea<select onchange="apSel('linea',this.value)">${lineas.map(l=>`<option value="${l}" ${l===AP.linea?'selected':''}>${esc(N.lineaInfo(l).nombre)}</option>`).join('')}</select></label>
      <label>Cuadro<select onchange="apSel('cuadro',this.value)">${cuadros.map(c=>`<option value="${esc(c.clave)}" ${c.clave===AP.cuadro?'selected':''}>${esc(c.codigo+' · '+c.marca+' '+presUI(c))}</option>`).join('')}</select></label>
      <label>Insumo<select onchange="apSel('insumo',this.value)">${filasC.map(f=>`<option value="${esc(f.insumo.codigo)}" ${f.insumo.codigo===AP.insumo?'selected':''}>${esc(f.insumo.nombre)}</option>`).join('')}</select></label></div>`;
    const tabla=ctx.concil.map(f=>`<tr class="${f.cuadro.clave===AP.cuadro&&f.insumo.codigo===AP.insumo?'ap-sel':''}" onclick="apSel('todo','${esc(f.cuadro.linea)}|${esc(f.cuadro.clave)}|${esc(f.insumo.codigo)}')">
      <td data-label="Cuadro">${esc(N.lineaInfo(f.cuadro.linea).nombre+' · '+f.cuadro.codigo)}</td><td data-label="Insumo">${esc(f.insumo.nombre)}</td><td data-label="Teórico" class="ap-num">${f.teorico===null?'Sin factor':fmt(f.teorico)}</td>
      <td data-label="Real" class="ap-num">${f.real===null?'Pendiente':fmt(f.real)}</td><td data-label="Por revisar" class="ap-num ${f.porRevisar?'ap-ambar':''}">${f.porRevisar===null?'—':fmt(f.porRevisar)}</td>
      <td data-label="Estado">${badge({SIN_REGISTRO:'Sin registro',BORRADOR:'Borrador',EN_REVISION:'Pendiente de revisión',CONFIRMADA:'Confirmada'}[f.estado]||f.estado,{CONFIRMADA:'fin',EN_REVISION:'aten',BORRADOR:'prog'}[f.estado]||'gris')}</td></tr>`).join('');
    if(!x)return `<section class="ap-card"><h3>Consumo real y balance de material</h3>${sel}${vacio(ctx.cuadros.length?'Este cuadro no tiene insumos con factor configurado.':'Sin cuadros en este bloque.')}</section>`;
    const u=x.unidad,c=x.cuadro,lu=N.lineaInfo(c.linea).unidad,doc=x.doc,conf=doc&&doc.estado==='CONFIRMADA';
    const ed=puede('asistenteProduccion')&&!conf,val=puede('validarMermas');
    const fila=(t,v,cls)=>`<tr class="${cls||''}"><td>${t}</td><td class="ap-num">${v}</td></tr>`;
    const signo=v=>v===null||v===undefined?'—':(v>0?'+':'')+fmt(v);
    const fe=x.factor;
    return `<section class="ap-card"><h3>Consumo real y balance de material</h3>${sel}
      <div class="ap-kpis">${kpi('▦','Producción real',`${fmt(c.producido,0)} <small>${lu}</small>`,esc(c.fuenteProduccion))}${kpi('⬡','Consumo teórico',x.teorico===null?'—':`${fmt(x.teorico)} <small>${esc(u)}</small>`,fe?`factor ${fmt(fe.factor,4)} / ${fmt(fe.cantidadBase,0)} ${fe.base==='PALETA'?'paleta':'UND'}`:'Pendiente de configurar')}
        ${kpi('⚖','Consumo real',x.real===null?'—':`${fmt(x.real)} <small>${esc(u)}</small>`,x.pendiente?esc(x.texto):'')}${kpi('▲','Desviación',x.desviacion===null?'—':`${signo(x.desviacion)} <small>${esc(u)}</small>`,x.desviacionPct===null?'':pct(x.desviacionPct),x.desviacion>0?'ap-kpi-rojo':'')}</div>
      <div class="ap-2"><div><h4>Balance conciliado (${esc(u)})</h4><table class="ap-t ap-t-bal"><tbody>
        ${fila('Saldo inicial utilizable',ed?`<input id="ap-c-si" type="number" step="any" value="${doc&&doc.saldoInicial!==null&&doc.saldoInicial!==undefined?doc.saldoInicial:''}">`:fmt(doc&&doc.saldoInicial))}
        ${fila('Entrega confirmada',signo(x.mov.entregado))}${fila('Transferencias recibidas',fmt(x.mov.transfEntrada))}${fila('Devoluciones',x.mov.devuelto?'−'+fmt(x.mov.devuelto):'0')}${fila('Transferencias salientes',x.mov.transfSalida?'−'+fmt(x.mov.transfSalida):'0')}
        ${fila('Saldo final utilizable',ed?`<input id="ap-c-sf" type="number" step="any" value="${doc&&doc.saldoFinal!==null&&doc.saldoFinal!==undefined?doc.saldoFinal:''}">`:fmt(doc&&doc.saldoFinal))}
        ${fila('<b>Consumo real</b>',`<b>${x.real===null?'Pendiente':fmt(x.real)}</b>`,'ap-tot')}${fila('Merma validada (incluida en el real)',fmt(x.mermaValidada))}${fila('<b>Por revisar</b>',`<b>${x.porRevisar===null?'—':fmt(x.porRevisar)}</b>`,x.porRevisar?'ap-ambar':'')}</tbody></table></div>
      <div><h4>Revisión del consumo</h4><ul class="ap-check"><li>${fe?`✔ Factor ${fe.origen==='codigo'?'migrado del código':'aprobado'} · versión ${num(fe.version)||1} · vigente desde ${esc(fe.vigenteDesde)}`:'⚠ Falta el factor'}</li>
        <li>${x.mov.entregado||x.mov.devuelto?'✔ Movimientos sin duplicados (id único por operación)':'ⓘ Sin entregas registradas para este cuadro'}</li>
        <li>${badge({SIN_REGISTRO:'Sin registro',BORRADOR:'Borrador',EN_REVISION:'Pendiente de revisión',CONFIRMADA:'Confirmada'}[x.estado]||x.estado,{CONFIRMADA:'fin',EN_REVISION:'aten'}[x.estado]||'gris')}</li></ul>
        <label class="ap-ancho">Observaciones${ed?`<textarea id="ap-c-obs" rows="3" maxlength="400">${esc(doc&&doc.observaciones||'')}</textarea>`:`<p>${esc(doc&&doc.observaciones||'—')}</p>`}</label>
        <div class="ap-acc ap-acc-wrap">${ed?`<button type="button" class="ap-btn ap-btn-o" onclick="apConc('BORRADOR')">Guardar borrador</button><button type="button" class="ap-btn" onclick="apConc('ENVIAR')">Enviar a revisión</button>`:''}
          ${val&&!conf&&doc?`<button type="button" class="ap-btn" onclick="apConc('CONFIRMAR')" ${x.pendiente?'disabled title="Faltan saldos o factor"':''}>Confirmar consumo</button>`:''}${val&&conf?`<button type="button" class="ap-btn ap-btn-o" onclick="apConc('REABRIR')">Reabrir</button>`:''}</div></div></div>
      <div class="ap-card ap-info"><b>Control de reservas.</b> Una reserva no es consumo. Al confirmar el consumo se registra un único movimiento CONSUMO para este cuadro e insumo; la reserva se libera sola, sin duplicar el descuento.</div>
      <p class="ap-nota">⚠ La desviación no se convierte automáticamente en merma. La merma pendiente no cuenta como validada.</p></section>
      <section class="ap-card"><h3>Conciliaciones del bloque</h3><div class="ap-tw"><table class="ap-t ap-t-click"><thead><tr><th>Cuadro</th><th>Insumo</th><th>Teórico</th><th>Real</th><th>Por revisar</th><th>Estado</th></tr></thead><tbody>${tabla}</tbody></table></div></section>`;
  }
  window.apSel=(k,v)=>{
    if(k==='todo'){const [l,...r]=v.split('|');const ins=r.pop();AP.linea=l;AP.cuadro=r.join('|');AP.insumo=ins;}
    else{AP[k]=v;if(k==='linea'){AP.cuadro='';AP.insumo='';}if(k==='cuadro')AP.insumo='';}
    pintar();
  };
  window.apConc=accion=>{
    const ctx=contexto();const x=ctx.concil.find(f=>f.cuadro.clave===AP.cuadro&&f.insumo.codigo===AP.insumo);if(!x)return;
    let nota='';
    if(accion==='REABRIR'){nota=prompt('Motivo para reabrir (mínimo 5 caracteres):');if(nota===null)return;}
    const si=document.getElementById('ap-c-si'),sf=document.getElementById('ap-c-sf');
    ejecutar(()=>D.guardarConciliacion({fecha:AP.fecha,bloque:AP.bloque,linea:x.cuadro.linea,cuadro:x.cuadro.clave,insumo:x.insumo.codigo,unidad:x.unidad,
      saldoInicial:si?si.value:(x.doc?x.doc.saldoInicial:null),saldoFinal:sf?sf.value:(x.doc?x.doc.saldoFinal:null),observaciones:valor('ap-c-obs')||(x.doc&&x.doc.observaciones)||'',real:x.real,nota},accion,x.doc?x.doc.version:0),
      {BORRADOR:'Borrador guardado.',ENVIAR:'Enviado a revisión.',CONFIRMAR:'Consumo confirmado: se registró un único movimiento de consumo.',REABRIR:'Conciliación reabierta; el consumo anterior quedó anulado.'}[accion]);
  };

  function tabMerma(ctx){
    const m=ctx.mermas.slice().sort((a,b)=>String(a.linea).localeCompare(String(b.linea)));
    const val=puede('validarMermas');
    const obs=D.cache.insumos.map(i=>({i,s:N.saldoInsumo(D.cache.movimientos,i.codigo)})).filter(x=>x.s.observado>0);
    const filas=m.map(x=>`<tr><td data-label="Línea"><b>${esc(N.lineaInfo(x.linea).nombre)}</b></td><td data-label="Cuadro">${esc(cuadroDeClave(ctx,x.cuadro))}</td>
      <td data-label="Material">${x.categoria==='PRODUCTO'?'Producto terminado':esc(insumoDe(x.insumo).nombre)}</td><td data-label="Cantidad" class="ap-num">${fmt(x.cantidad)} ${esc(x.unidad)}</td><td data-label="Motivo">${esc(x.causa)}${x.etapa?' · '+esc(x.etapa):''}${x.observaciones?`<small> — ${esc(x.observaciones)}</small>`:''}</td>
      <td data-label="Estado">${badge({PENDIENTE:'Pendiente',VALIDADA:'Validada',RECHAZADA:'Rechazada'}[x.estado],{PENDIENTE:'aten',VALIDADA:'fin',RECHAZADA:'gris'}[x.estado])}${x.validadoPor?`<small> ${esc(x.validadoPor)}</small>`:''}</td>
      <td data-label="">${val&&x.estado==='PENDIENTE'?`<button type="button" class="ap-btn ap-btn-s" onclick="apValidarMerma('${esc(x.id)}','VALIDADA',${num(x.version)})">Validar</button> <button type="button" class="ap-btn ap-btn-o ap-btn-s" onclick="apValidarMerma('${esc(x.id)}','RECHAZADA',${num(x.version)})">Rechazar</button>`:''}</td></tr>`).join('');
    const form=puede('asistenteProduccion')?`<section class="ap-card"><h3>Nueva merma</h3><div class="ap-form">
      <label>Cuadro<select id="ap-m-cuadro"><option value="">— Elegir —</option>${opcionesCuadros(ctx,'')}</select></label>
      <label>Tipo<select id="ap-m-cat" onchange="apMermaCat()"><option value="MATERIAL">Materia prima / empaque</option><option value="PRODUCTO">Producto terminado</option></select></label>
      <label class="ap-m-mat">Insumo<select id="ap-m-insumo">${opcionesInsumos('')}</select></label>
      <label>Cantidad<input id="ap-m-cant" type="number" min="0" step="any"></label><label class="ap-m-und" hidden>Unidad<input id="ap-m-unidad" value="UND"></label>
      <label>Causa<select id="ap-m-causa">${N.CAUSAS_MERMA.map(c=>`<option>${esc(c)}</option>`).join('')}</select></label>
      <label>Etapa<select id="ap-m-etapa"><option value="">—</option>${N.ETAPAS_MERMA.map(c=>`<option>${esc(c)}</option>`).join('')}</select></label>
      <label>Lote afectado<input id="ap-m-lote" maxlength="40"></label><label class="ap-ancho">Descripción<input id="ap-m-obs" maxlength="300"></label></div>
      <div class="ap-acc"><button type="button" class="ap-btn" onclick="apGuardarMerma()">Guardar registro</button></div>
      <p class="ap-sub">Queda «Pendiente de validación». Cada merma tiene un identificador único: no se registra dos veces ni se descuenta del stock aparte (ya está dentro del consumo real).</p></section>`:'';
    return `<div class="ap-kpis ap-kpis-3">${kpi('▤','Mermas pendientes',m.filter(x=>x.estado==='PENDIENTE').length,'',m.some(x=>x.estado==='PENDIENTE')?'ap-kpi-ambar':'')}${kpi('✓','Mermas validadas',m.filter(x=>x.estado==='VALIDADA').length,'')}${kpi('⚠','Material observado',obs.length+' registro'+(obs.length===1?'':'s'),'no disponible para programación')}</div>
      <div class="ap-2"><section class="ap-card"><h3>Registro del turno</h3>${filas?`<div class="ap-tw"><table class="ap-t"><thead><tr><th>Línea</th><th>Cuadro</th><th>Material</th><th>Cantidad</th><th>Motivo</th><th>Estado</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>`:vacio('Sin mermas en este bloque.')}
        <h4>Material observado</h4>${obs.length?`<table class="ap-t"><thead><tr><th>Material</th><th>Cantidad</th><th>Disponibilidad</th></tr></thead><tbody>${obs.map(x=>`<tr><td>${esc(x.i.nombre)}</td><td class="ap-num">${fmt(x.s.observado)} ${esc(x.i.unidad)}</td><td>${badge('No disponible para programación','rojo')}</td></tr>`).join('')}</tbody></table>`:vacio('Sin material observado.')}
        <p class="ap-nota">ⓘ El material observado no se considera merma hasta su evaluación.</p></section>${form}</div>`;
  }
  window.apMermaCat=()=>{const p=valor('ap-m-cat')==='PRODUCTO';document.querySelectorAll('.ap-m-mat').forEach(e=>{e.hidden=p;});document.querySelectorAll('.ap-m-und').forEach(e=>{e.hidden=!p;});};
  window.apGuardarMerma=()=>{
    const ctx=contexto();const c=ctx.cuadros.find(x=>x.clave===valor('ap-m-cuadro'));const cat=valor('ap-m-cat');
    const ins=cat==='PRODUCTO'?{codigo:'PRODUCTO',unidad:c?N.lineaInfo(c.linea).unidad:valor('ap-m-unidad')}:insumoDe(valor('ap-m-insumo'));
    ejecutar(()=>D.registrarMerma({id:D.nuevoId('mer'),fecha:AP.fecha,bloque:AP.bloque,linea:c?c.linea:'',cuadro:c?c.clave:'',marca:c?c.marca:'',presentacion:c?c.presentacion:'',
      categoria:cat,insumo:ins.codigo,unidad:ins.unidad,cantidad:valor('ap-m-cant'),causa:valor('ap-m-causa'),etapa:valor('ap-m-etapa'),lote:valor('ap-m-lote')||(c&&c.reporte?c.reporte.lote:''),observaciones:valor('ap-m-obs')}),
      'Merma registrada: pendiente de validación.');
  };
  window.apValidarMerma=(id,estado,version)=>{
    let nota='';if(estado==='RECHAZADA'){nota=prompt('Motivo del rechazo (mínimo 5 caracteres):');if(nota===null)return;}
    ejecutar(()=>D.validarMerma(id,estado,version,nota),estado==='VALIDADA'?'Merma validada.':'Merma rechazada.');
  };

  function tabParametros(){
    const gest=puede('gestionarFactores');
    const ins=D.cache.insumos.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre));
    const fl=D.cache.factores.filter(f=>(!AP.factLinea||f.linea===AP.factLinea)&&(!AP.factInsumo||f.insumo===AP.factInsumo))
      .sort((a,b)=>a.linea.localeCompare(b.linea)||a.insumo.localeCompare(b.insumo)||String(a.presentacion).localeCompare(String(b.presentacion))||String(b.vigenteDesde).localeCompare(String(a.vigenteDesde)));
    const hoy=new Date(D.ahora()).toISOString().slice(0,10);
    const ff=fl.slice(0,400).map(f=>`<tr class="${N.vigenteEn(f,hoy)?'':'ap-anulado'}"><td data-label="Línea">${esc(N.lineaInfo(f.linea).nombre)}</td><td data-label="Insumo">${esc(insumoDe(f.insumo).nombre)}</td><td data-label="Marca">${esc(f.marca)}</td>
      <td data-label="Presentación">${esc(f.presentacion)}</td><td data-label="Factor" class="ap-num">${Number(f.factor)===0?'No aplica':`${fmt(f.factor,4)} ${esc(insumoDe(f.insumo).unidad)} / ${fmt(f.cantidadBase,0)} ${f.base==='PALETA'?'paleta':'UND'}`}</td>
      <td data-label="Vigencia">${esc(f.vigenteDesde)} → ${esc(f.vigenteHasta||'…')}</td><td data-label="Origen">${f.origen==='codigo'?'Código (migrado)':'Manual'}${f.nota?`<small> ${esc(f.nota)}</small>`:''} · v${num(f.version)}</td>
      <td data-label="">${gest&&!f.vigenteHasta?`<button type="button" class="ap-btn ap-btn-o ap-btn-s" onclick="apFactorForm('${esc(f.id)}')">Nueva versión</button>`:''} <button type="button" class="ap-btn ap-btn-o ap-btn-s" onclick="apHistorialDoc('apFactores','${esc(f.id)}')">Historial</button></td></tr>`).join('');
    return `${gest&&!D.cache.factores.some(f=>f.origen==='codigo')?`<section class="ap-card ap-info"><b>Migración de factores.</b> Los factores del Nuevo registro (05-utils.js) se copian al catálogo como versión 1, sin perder valores. Repetirla no duplica ni pisa lo editado.
        <div class="ap-acc"><button type="button" class="ap-btn" onclick="apMigrar()">Migrar factores del código</button></div></section>`:''}
      <section class="ap-card"><h3>Insumos</h3>${ins.length?`<div class="ap-tw"><table class="ap-t"><thead><tr><th>Código</th><th>Nombre</th><th>Unidad</th><th>Tipo</th><th>Estado</th><th></th></tr></thead><tbody>
        ${ins.map(i=>`<tr><td>${esc(i.codigo)}</td><td>${esc(i.nombre)}</td><td>${esc(i.unidad)}</td><td>${esc(i.tipo)}</td><td>${i.activo===false?badge('Inactivo','gris'):badge('Activo','fin')}</td><td>${gest?`<button type="button" class="ap-btn ap-btn-o ap-btn-s" onclick="apInsumoForm('${esc(i.codigo)}')">Editar</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:vacio('Sin insumos.')}
        ${gest?`<div class="ap-acc"><button type="button" class="ap-btn ap-btn-o" onclick="apInsumoForm('')">Agregar insumo</button></div>`:''}</section>
      <section class="ap-card"><h3>Factores de consumo</h3><div class="ap-form ap-form-4"><label>Línea<select onchange="AP_set('factLinea',this.value)"><option value="">Todas</option>${N.LINEAS.map(l=>`<option value="${l.codigo}" ${AP.factLinea===l.codigo?'selected':''}>${esc(l.nombre)}</option>`).join('')}</select></label>
        <label>Insumo<select onchange="AP_set('factInsumo',this.value)"><option value="">Todos</option>${opcionesInsumos(AP.factInsumo)}</select></label></div>
        ${ff?`<div class="ap-tw"><table class="ap-t"><thead><tr><th>Línea</th><th>Insumo</th><th>Marca</th><th>Presentación</th><th>Factor</th><th>Vigencia</th><th>Origen</th><th></th></tr></thead><tbody>${ff}</tbody></table></div>`:vacio('Sin factores para el filtro.')}
        ${gest?`<div class="ap-acc"><button type="button" class="ap-btn" onclick="apFactorForm('')">Nuevo factor</button></div>`:'<p class="ap-sub">Solo usuarios con permiso «Administrar insumos y factores» pueden modificarlos. Cada cambio queda auditado.</p>'}</section>`;
  }
  window.AP_set=(k,v)=>{AP[k]=v;pintar();};
  window.apMigrar=()=>{if(!confirm('¿Copiar al catálogo los factores fijos del Nuevo registro? No se borra ni se pisa nada.'))return;
    ejecutar(()=>D.migrarFactoresDelCodigo(),r=>`Migración: ${r.creados} creados, ${r.existentes} ya existían.`);};
  window.apInsumoForm=codigo=>{
    const i=D.cache.insumos.find(x=>x.codigo===codigo)||{codigo:'',nombre:'',unidad:'UND',tipo:'otro',activo:true,version:0};
    modal(codigo?'Editar insumo':'Nuevo insumo',`<div class="ap-form"><label>Código<input id="ap-i-cod" value="${esc(i.codigo)}" ${codigo?'readonly':''} maxlength="40"></label><label>Nombre<input id="ap-i-nom" value="${esc(i.nombre)}" maxlength="80"></label>
      <label>Unidad<select id="ap-i-und">${N.UNIDADES.map(u=>`<option ${u===i.unidad?'selected':''}>${u}</option>`).join('')}</select></label><label>Tipo<select id="ap-i-tipo">${N.TIPOS_INSUMO.map(u=>`<option ${u===i.tipo?'selected':''}>${u}</option>`).join('')}</select></label>
      <label>Estado<select id="ap-i-act"><option value="1">Activo</option><option value="0" ${i.activo===false?'selected':''}>Inactivo</option></select></label></div>
      <div class="ap-acc"><button type="button" class="ap-btn" onclick="apGuardarInsumo(${num(i.version)})">Guardar</button></div>`);
  };
  window.apGuardarInsumo=version=>{const d={codigo:valor('ap-i-cod').trim().toUpperCase(),nombre:valor('ap-i-nom'),unidad:valor('ap-i-und'),tipo:valor('ap-i-tipo'),activo:valor('ap-i-act')==='1'};
    if(typeof closeModal==='function')closeModal();ejecutar(()=>D.guardarInsumo(d,version),'Insumo guardado.');};
  window.apFactorForm=id=>{
    const a=D.cache.factores.find(f=>f.id===id);const hoy=new Date(D.ahora()).toISOString().slice(0,10);
    const f=a?{...a,vigenteDesde:hoy}:{insumo:'',linea:'PET1',marca:'*',presentacion:'*',base:'PALETA',cantidadBase:1,factor:'',vigenteDesde:hoy};
    modal(a?'Nueva versión del factor':'Nuevo factor',`${a?`<p class="ap-sub">La versión actual (${fmt(a.factor,4)} / ${fmt(a.cantidadBase,0)} ${a.base}) queda vigente hasta el día anterior; los datos históricos siguen usando su valor.</p>`:''}
      <div class="ap-form"><label>Línea<select id="ap-f-lin" ${a?'disabled':''}>${N.LINEAS.map(l=>`<option value="${l.codigo}" ${l.codigo===f.linea?'selected':''}>${esc(l.nombre)}</option>`).join('')}</select></label>
      <label>Insumo<select id="ap-f-ins" ${a?'disabled':''}>${opcionesInsumos(f.insumo)}</select></label><label>Marca (* = todas)<input id="ap-f-mar" value="${esc(f.marca)}" ${a?'readonly':''}></label>
      <label>Presentación (* = todas)<input id="ap-f-pre" value="${esc(f.presentacion)}" ${a?'readonly':''}></label><label>Base<select id="ap-f-base"><option value="PALETA" ${f.base==='PALETA'?'selected':''}>Por paleta</option><option value="UND" ${f.base==='UND'?'selected':''}>Por unidad producida</option></select></label>
      <label>Cantidad base<input id="ap-f-cb" type="number" min="0" step="any" value="${esc(f.cantidadBase)}"></label><label>Factor (en la unidad del insumo)<input id="ap-f-fac" type="number" min="0" step="any" value="${esc(f.factor)}"></label>
      <label>Vigente desde<input id="ap-f-desde" type="date" value="${esc(f.vigenteDesde)}"></label></div>
      <p class="ap-sub">Consumo = (producido ÷ cantidad base) × factor, o (paletas ÷ cantidad base) × factor. Factor 0 = «No aplica».</p>
      <div class="ap-acc"><button type="button" class="ap-btn" onclick="apGuardarFactor('${a?esc(a.id):''}')">Guardar</button></div>`);
  };
  window.apGuardarFactor=anteriorId=>{
    const a=D.cache.factores.find(f=>f.id===anteriorId);
    const d={insumo:a?a.insumo:valor('ap-f-ins'),linea:a?a.linea:valor('ap-f-lin'),marca:a?a.marca:(valor('ap-f-mar').trim()||'*'),presentacion:a?a.presentacion:(valor('ap-f-pre').trim()||'*'),
      base:valor('ap-f-base'),cantidadBase:valor('ap-f-cb'),factor:valor('ap-f-fac'),vigenteDesde:valor('ap-f-desde')};
    if(typeof closeModal==='function')closeModal();ejecutar(()=>D.guardarFactor(d,anteriorId||null),'Factor guardado (versión con vigencia).');
  };
  window.apHistorialDoc=async(coleccion,id)=>{
    try{const h=await D.auditoriaDe(coleccion,id);
      modal('Historial',h.length?`<ul class="ap-hist">${h.map(x=>`<li>${fechaHora(x.en&&x.en.toMillis?x.en.toMillis():x.en)} · <b>${esc(x.operacion)}</b> · ${esc(x.usuario)}<br><small>antes: ${esc(JSON.stringify(x.antes&&{factor:x.antes.factor,vigenteHasta:x.antes.vigenteHasta,estado:x.antes.estado}||null))} → después: ${esc(JSON.stringify(x.despues&&{factor:x.despues.factor,vigenteHasta:x.despues.vigenteHasta,estado:x.despues.estado}||null))}</small></li>`).join('')}</ul>`:vacio('Sin historial.'));}
    catch(e){AP.msg={tipo:'error',texto:D.mensajeError(e)};pintar();}
  };

  function tabHistorial(ctx){
    const ev=[];
    D.cache.movimientos.filter(m=>m.fecha===AP.fecha).forEach(m=>ev.push({en:m.en,tipo:'Movimiento',evento:m.tipo,linea:m.linea,insumo:m.insumo,cant:m.tipo==='ANULACION'?'':fmt(m.cantidad)+' '+(m.unidad||''),por:m.usuario,estado:m.tipo==='CONTEO'?'Verificado':'Registrado'}));
    ctx.solicitudes.forEach(s=>(s.historial||[]).forEach(h=>ev.push({en:h.en,tipo:'Solicitud',evento:'Solicitud '+s.id,linea:s.linea,insumo:(s.items||[]).map(i=>i.insumo).join(', '),cant:'',por:h.por,estado:SOL_TXT[h.estado]||h.estado})));
    ctx.mermas.forEach(m=>(m.historial||[]).forEach(h=>ev.push({en:h.en,tipo:'Merma',evento:'Merma '+m.causa,linea:m.linea,insumo:m.insumo,cant:fmt(m.cantidad)+' '+m.unidad,por:h.por,estado:h.estado})));
    ctx.concil.filter(c=>c.doc).forEach(c=>(c.doc.historial||[]).forEach(h=>ev.push({en:h.en,tipo:'Consumo',evento:'Conciliación '+c.cuadro.codigo,linea:c.cuadro.linea,insumo:c.insumo.codigo,cant:'',por:h.por,estado:h.estado})));
    const tipos=[...new Set(ev.map(e=>e.tipo))];
    const lista=ev.filter(e=>(!AP.histTipo||e.tipo===AP.histTipo)&&(!AP.histLinea||e.linea===AP.histLinea)).sort((a,b)=>num(b.en)-num(a.en));
    const exp=puede('reporteGeneral');
    return `<section class="ap-card"><div class="ap-form ap-form-4"><label>Tipo<select onchange="AP_set('histTipo',this.value)"><option value="">Todos</option>${tipos.map(t=>`<option ${t===AP.histTipo?'selected':''}>${t}</option>`).join('')}</select></label>
      <label>Línea<select onchange="AP_set('histLinea',this.value)"><option value="">Todas</option>${N.LINEAS.map(l=>`<option value="${l.codigo}" ${AP.histLinea===l.codigo?'selected':''}>${esc(l.nombre)}</option>`).join('')}</select></label>
      <div class="ap-acc">${exp?`<button type="button" class="ap-btn ap-btn-verde" onclick="apExportar()">Exportar Reporte General (Excel)</button>`:''}<button type="button" class="ap-btn ap-btn-o" onclick="window.print()">Resumen imprimible</button></div></div></section>
      <section class="ap-card"><h3>Movimientos y decisiones</h3>${lista.length?`<div class="ap-tw"><table class="ap-t"><thead><tr><th>Hora</th><th>Tipo</th><th>Evento</th><th>Línea</th><th>Insumo</th><th>Cantidad</th><th>Responsable</th><th>Estado</th></tr></thead><tbody>
      ${lista.map(e=>`<tr><td data-label="Hora">${fechaHora(e.en)}</td><td data-label="Tipo">${esc(e.tipo)}</td><td data-label="Evento">${esc(e.evento)}</td><td data-label="Línea">${esc(e.linea?N.lineaInfo(e.linea).nombre:'—')}</td><td data-label="Insumo">${esc(e.insumo?insumoDe(e.insumo).nombre:'—')}</td><td data-label="Cantidad">${esc(e.cant||'—')}</td><td data-label="Responsable">${esc(e.por||'—')}</td><td data-label="Estado">${badge(e.estado,'prog')}</td></tr>`).join('')}</tbody></table></div>`:vacio('Sin movimientos en esta fecha.')}
      <p class="ap-nota">ⓘ Versiones y correcciones se conservan: nada se borra; una corrección es un registro nuevo que anula al anterior.</p></section>`;
  }
  window.apExportar=()=>{
    if(!window.glacialReporteGeneral){AP.msg={tipo:'error',texto:'No se cargó el generador del Reporte General.'};pintar();return;}
    ejecutar(()=>window.glacialReporteGeneral.exportar(AP.fecha),r=>'Reporte General generado: '+r);
  };

  /* ---------- modal ---------- */
  function modal(titulo,cuerpo){
    const raiz=document.getElementById('modal-root');if(!raiz)return;
    raiz.innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal ap-modal" role="dialog" aria-modal="true" aria-label="${titulo}">
      <div class="modal-head"><h3>${titulo}</h3><button class="modal-close" onclick="closeModal()" aria-label="Cerrar">✕</button></div><div class="modal-body ap">${cuerpo}</div></div></div>`;
  }

  /* ---------- render ---------- */
  function cargando(){
    const C=D.cache;const errs=Object.values(C.error).filter(Boolean);
    if(errs.length)return `<div class="ap-msg ap-msg-error" role="alert">No se pudieron leer los datos del Asistente: ${esc(errs[0])} <button type="button" onclick="apReintentar()">Reintentar</button></div>`;
    return ['insumos','factores','movimientos'].every(k=>C.listo[k])?'':'<div class="ap-msg ap-msg-info">Consultando los datos del Asistente…</div>';
  }
  window.apReintentar=()=>{D.detener();D.escucharTodo(AP.fecha);pintar();};
  function pintar(){
    if(state.currentTab!=='asistente')return;
    const main=document.getElementById('main');if(!main)return;
    contextoInicial();D.escucharTodo(AP.fecha);
    const ctx=contexto();
    const tabs=PESTANAS.filter(([k])=>k!=='parametros'||puede('ver_asistente')).map(([k,t])=>`<button type="button" role="tab" class="ap-tab ${AP.tab===k?'ap-tab-act':''}" aria-selected="${AP.tab===k}" onclick="AP_set('tab','${k}')">${t}</button>`).join('');
    const cuerpo={resumen:tabResumen,seguimiento:tabSeguimiento,insumos:tabInsumos,solicitudes:tabSolicitudes,consumo:tabConsumo,merma:tabMerma,parametros:tabParametros,historial:tabHistorial}[AP.tab]||tabResumen;
    const modoVista=!!(window.glacialVista&&window.glacialVista.activo&&window.glacialVista.activo());
    const scroll=window.scrollY;
    main.innerHTML=`<section class="ap">${estilos()}<header class="ap-cab"><h1>ASISTENTE DE PRODUCCIÓN</h1>
      <div class="ap-cab-der"><label class="ap-ctl"><span class="ap-sr">Fecha operativa</span><input type="date" value="${esc(AP.fecha)}" onchange="apCtx('fecha',this.value)"></label>
      <label class="ap-ctl ap-ctl-azul"><span class="ap-sr">Bloque</span><select onchange="apCtx('bloque',this.value)"><option value="DIA" ${AP.bloque!=='NOCHE'?'selected':''}>MAÑANA + INTERMEDIO</option><option value="NOCHE" ${AP.bloque==='NOCHE'?'selected':''}>NOCHE</option></select></label>
      ${modoVista||!puede('asistenteProduccion')?'<span class="ap-chip">Solo consulta</span>':''}</div></header>
      <nav class="ap-tabs" role="tablist">${tabs}</nav>${cargando()}${aviso()}${cuerpo(ctx)}</section>`;
    window.scrollTo(0,scroll);
  }
  window.apCtx=(k,v)=>{if(k==='fecha'&&!/^\d{4}-\d{2}-\d{2}$/.test(v))return;AP[k]=v;AP.cuadro='';AP.insumo='';pintar();};
  D.alCambiar(()=>{if(typeof state!=='undefined'&&state.currentTab==='asistente'&&!document.querySelector('.ap input:focus,.ap select:focus,.ap textarea:focus,#modal-root .modal'))pintar();});
  ['onPaletasUpdated','onProgramacionesUpdated'].forEach(n=>{const a=globalThis[n];if(typeof a!=='function')return;globalThis[n]=function(){const r=a.apply(this,arguments);if(state.currentTab==='asistente'&&!document.querySelector('.ap input:focus,.ap select:focus,.ap textarea:focus'))pintar();return r;};});

  /* ---------- navegación (patrón de 43-bitacora-mantenimiento.js) ---------- */
  window.goAsistente=function(tab){
    if(!puede('ver_asistente')&&!puede('moduloAlmacen')){alert('No tienes permiso para ver el Asistente de Producción.');return;}
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    if(tab)AP.tab=tab;else if(!puede('ver_asistente'))AP.tab='solicitudes';
    state.currentTab='asistente';
    if(typeof renderSidebar==='function')renderSidebar();
    if(typeof renderMain==='function')renderMain();
  };
  const puedeEntrar=()=>!!(typeof state!=='undefined'&&state.user)&&(puede('ver_asistente')||puede('moduloAlmacen'));
  if(typeof ajustarVistaSegunPermisos==='function'){
    const a=ajustarVistaSegunPermisos;
    ajustarVistaSegunPermisos=function(){if(state.currentTab==='asistente'&&puedeEntrar())return;return a.apply(this,arguments);};
  }
  if(typeof renderMain==='function'){
    const a=renderMain;
    renderMain=function(){
      if(state.currentTab==='asistente'&&!state.showWelcome&&puedeEntrar()){pintar();return;}
      if(state.currentTab!=='asistente')D.detener();
      return a.apply(this,arguments);
    };
  }
  if(typeof renderSidebar==='function'){
    const a=renderSidebar;
    renderSidebar=function(){
      const r=a.apply(this,arguments);
      const b=document.getElementById('btn-asistente');
      if(b){const m=puedeEntrar()&&puede('ver_asistente');b.hidden=!m;b.style.display=m?'':'none';b.classList.toggle('active',m&&state.currentTab==='asistente');
        if(m&&state.currentTab==='asistente')b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
      // Almacén deja de ser «próximamente» para quien tiene el permiso: abre las solicitudes de Producción (no es un segundo inventario).
      const al=document.getElementById('btn-almacen');
      if(al&&state.user&&puede('moduloAlmacen')){al.disabled=false;al.classList.remove('sidebar-disabled');al.title='Solicitudes de Producción';al.setAttribute('aria-label','Almacén');
        al.onclick=()=>window.goAsistente('solicitudes');const t=al.querySelector('span:last-child');if(t)t.textContent='Almacén';}
      return r;
    };
  }

  function estilos(){return `<style id="ap-estilos">
.ap [hidden]{display:none!important}
.ap .ap-ctl input,.ap .ap-ctl select{border:0;background:transparent;min-height:40px;padding:0 4px}.ap .ap-ctl-azul select{color:#fff}
.ap{--ap-azul:#0b5cc4;--ap-marino:#0B2540;--ap-linea:#dbe5ee;--ap-mut:#5f7382;color:#10265f}
.ap-cab{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 12px}.ap-cab h1{margin:0;font-size:30px;letter-spacing:-.01em;color:#10265f}
.ap-cab-der{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.ap-ctl{display:flex;align-items:center;min-height:44px;padding:0 12px;border:1px solid var(--ap-linea);border-radius:10px;background:#fff}
.ap-ctl input,.ap-ctl select{border:0;background:transparent;font:inherit;font-weight:700;color:#10265f;min-height:40px}.ap-ctl-azul{background:linear-gradient(135deg,#0a3a7a,#0868db);border-color:#0b62d0}.ap-ctl-azul select{color:#fff}.ap-ctl-azul option{color:#10265f}
.ap-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.ap-chip{padding:7px 14px;border-radius:999px;background:#e3f0fe;color:#0b5cc4;font-size:13px;font-weight:700}
.ap-tabs{display:flex;gap:2px;overflow-x:auto;background:#fff;border:1px solid var(--ap-linea);border-radius:12px;padding:4px;margin-bottom:12px;scrollbar-width:thin}
.ap-tab{flex:0 0 auto;border:0;background:none;padding:10px 14px;font:inherit;font-size:14px;font-weight:600;color:#33475b;border-bottom:3px solid transparent;cursor:pointer;min-height:44px}
.ap-tab-act{color:#e8710a;border-bottom-color:#e8710a}
.ap-card{background:#fff;border:1px solid var(--ap-linea);border-radius:14px;padding:14px 16px;margin-bottom:12px;box-shadow:0 3px 12px rgba(17,57,91,.05)}.ap-card h3{margin:0 0 10px;font-size:18px}.ap-card h4{margin:12px 0 6px;font-size:14px}
.ap-info{background:#f2f8ff;border-color:#cfe2fb}.ap-info ul{margin:0;padding-left:18px}
.ap-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:12px}.ap-kpis-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.ap-kpi{display:flex;gap:12px;align-items:center;background:#fff;border:1px solid var(--ap-linea);border-radius:12px;padding:12px 14px}.ap-kpi-ico{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:#e8f2ff;color:var(--ap-azul);font-size:20px;flex:0 0 auto}
.ap-kpi-t{display:block;font-size:13px;font-weight:700;color:#33475b}.ap-kpi b{display:block;font-size:26px;line-height:1.15}.ap-kpi b small{font-size:13px;font-weight:600}.ap-kpi small{color:var(--ap-mut);font-size:12px}
.ap-kpi-rojo{background:#fff5f5;border-color:#f5c2c2}.ap-kpi-rojo b{color:#b42318}.ap-kpi-ambar{background:#fffbea;border-color:#f2d58a}
.ap-2{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:12px}.ap-2>section,.ap-2>div{min-width:0}
.ap-tw{overflow-x:auto}.ap-t{width:100%;border-collapse:collapse;font-size:13px}.ap-t th{background:#eef4fa;text-align:left;padding:8px 10px;font-size:12px;color:#10265f;white-space:nowrap}
.ap-t td{padding:8px 10px;border-top:1px solid #e7eef4;vertical-align:middle}.ap-num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.ap-t-click tr{cursor:pointer}.ap-sel td{background:#eef6ff}
.ap-t-bal td:last-child{text-align:right}.ap-t-bal input{width:110px;text-align:right}.ap-tot td{background:#e8f2ff}.ap-ambar td,.ap-ambar{background:#fff7e6}.ap-rojo{color:#b42318;font-weight:700}.ap-anulado td{color:#9aa8b5;text-decoration:line-through}
.ap-fuente{display:block;color:var(--ap-mut);font-size:10px}
.ap-badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;margin:1px 0}
.ap-b-curso{background:#FFEDD5;color:#9A3412}.ap-b-pausa{background:#FEF9C3;color:#713F12}.ap-b-detenida,.ap-b-rojo{background:#FEE2E2;color:#991B1B}.ap-b-fin{background:#DCFCE7;color:#166534}
.ap-b-prog{background:#FEF3C7;color:#92400E}.ap-b-gris,.ap-b-cancel{background:#F3F4F6;color:#4B5563}.ap-b-aten{background:#FEF3C7;color:#92400E}
.ap-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:8px}.ap-form-4{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.ap-form label,.ap label.ap-ancho{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:#33475b}.ap-ancho{grid-column:1/-1}
.ap input,.ap select,.ap textarea{font:inherit;font-size:14px;padding:8px 10px;border:1px solid #c9d6e2;border-radius:8px;min-height:40px;background:#fff;color:#10265f;max-width:100%}
.ap-acc{display:flex;gap:8px;justify-content:flex-end;align-items:end;margin-top:8px}.ap-acc-wrap{flex-wrap:wrap}
.ap-btn{border:1px solid #0b5cc4;background:#0b5cc4;color:#fff;border-radius:8px;padding:9px 16px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;min-height:42px}
.ap-btn-o{background:#fff;color:#0b5cc4}.ap-btn-s{padding:5px 10px;min-height:32px;font-size:12px}.ap-btn-verde{background:#fff;color:#13814a;border-color:#13814a}.ap-btn[disabled]{opacity:.5;cursor:not-allowed}
.ap-vacio{padding:14px;color:var(--ap-mut);font-size:13px;text-align:center}.ap-sub{color:var(--ap-mut);font-size:13px;margin:4px 0}.ap-nota{margin:8px 0 0;padding:8px 12px;border-radius:8px;background:#fffbea;color:#5b4a00;font-size:13px}
.ap-msg{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;margin-bottom:10px;font-weight:600;font-size:14px}.ap-msg button{border:0;background:none;cursor:pointer;font:inherit;font-weight:700;color:inherit}
.ap-msg-ok{background:#e5f6ec;color:#13814a}.ap-msg-error{background:#fde8e8;color:#b42318}.ap-msg-info{background:#e8f2ff;color:#0b5cc4}
.ap-alertas{margin:0;padding-left:18px;font-size:13px}.ap-al-critico{color:#b42318;font-weight:700}.ap-al-atencion{color:#92400E}.ap-al-info{color:#0b5cc4}
.ap-check{list-style:none;padding:0;margin:0 0 8px;font-size:14px;display:grid;gap:6px}.ap-hist{font-size:13px;padding-left:18px}.ap-modal{max-width:880px}
@media(max-width:900px){.ap-2{grid-template-columns:1fr}.ap-kpis-3{grid-template-columns:1fr}}
@media(max-width:640px){.ap-cab h1{font-size:24px}.ap-cab-der,.ap-ctl{width:100%}.ap-ctl input,.ap-ctl select{width:100%}
  .ap .ap-t{min-width:0!important}.ap-tw{overflow-x:visible}
  .ap-t thead{display:none}.ap-t,.ap-t tbody,.ap-t tr,.ap-t td{display:block;width:100%;box-sizing:border-box}.ap-t tr{border-top:1px solid #e2ebf2;padding:6px 0}.ap-t td{border:0;padding:3px 4px;display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:baseline;gap:4px 8px;text-align:right}
  .ap-t td:before{margin-right:auto;content:attr(data-label);color:var(--ap-mut);font-size:11px;font-weight:700;text-transform:uppercase;text-align:left}.ap .ap-t-bal{display:table}.ap .ap-t-bal tbody{display:table-row-group}.ap .ap-t-bal tr{display:table-row;padding:0}
  .ap .ap-t-bal td{display:table-cell;text-align:left;border-top:1px solid #e7eef4;padding:6px 4px}.ap .ap-t-bal td:last-child{text-align:right}.ap .ap-t-bal td:before{content:none}.ap-acc{flex-wrap:wrap}.ap-acc .ap-btn{flex:1 1 auto}}
@media print{.ap-tabs,.ap-acc,.ap-form,.ap-cab-der{display:none!important}.ap-card{break-inside:avoid;box-shadow:none}}
</style>`;}
  window.glacialAsistentePantalla={pintar,contexto,AP};
})();
