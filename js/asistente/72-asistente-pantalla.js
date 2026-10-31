/* =============================================================
   GLACIAL · ASISTENTE DE PRODUCCIÓN — PANTALLA (diseño aprobado)
   -------------------------------------------------------------
   Pestañas: Resumen operativo · Seguimiento del turno · Insumos (Existencias / Factores / Requerimientos / Solicitudes) · Consumo ·
   Merma · Historial y reportes. Solo CONSULTA Programación, Paletas, Avance/Cierre y Tareo; registra únicamente lo suyo (movimientos,
   solicitudes, conciliaciones, mermas y coordinaciones) a través de 71-asistente-datos.js. Los indicadores salen de registros reales.
   Evidencias opcionales: se suben a Supabase Storage (bucket privado «glacial-fotos», carpeta asistente/; 06b-fotos-supabase.js) y en la base
   solo se guarda su referencia; primero se sube el archivo y después se guarda el registro.
   ============================================================= */
(function instalarAsistentePantalla(){
  'use strict';
  const N=window.glacialAsistenteNucleo,D=window.glacialAsistenteDatos;
  const esc=v=>typeof escaparHtml==='function'?escaparHtml(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const fmt=(v,dec)=>v===null||v===undefined||v===''?'—':Number(v).toLocaleString('es-PE',{maximumFractionDigits:dec===undefined?2:dec,minimumFractionDigits:0});
  const hora=ms=>ms?new Date(Number(ms)).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false}):'—';
  const fechaHora=ms=>ms?new Date(Number(ms)).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):'—';
  const puede=k=>D.puede(k);

  /* ---------- íconos de línea (SVG, currentColor) ---------- */
  const P={
    resumen:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    barras:'<path d="M5 20V12M10 20V6M15 20v-9M20 20V9M3 20h18"/>',
    cajas:'<path d="M7 11 3 13v5l4 2 4-2v-5z"/><path d="m17 11-4 2v5l4 2 4-2v-5z"/><path d="m12 3-4 2v5l4 2 4-2V5z"/>',
    lista:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    alerta:'<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
    reloj:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    fabrica:'<path d="M3 21V10l5 3V10l5 3V6l5-3v18z"/><path d="M8 17h2M13 17h2"/>',
    grafico:'<path d="M4 20V10M9 20V5M14 20v-7M19 20V8"/>',
    cubo:'<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="m4 7 8 4 8-4M12 11v10"/>',
    balanza:'<path d="M12 4v16M6 20h12M5 8h14M5 8l-3 6a3 3 0 0 0 6 0zM19 8l-3 6a3 3 0 0 0 6 0z"/>',
    pesa:'<path d="M8 8a4 4 0 1 1 8 0"/><path d="M5 20 7 8h10l2 12z"/>',
    subida:'<path d="M5 20V14M10 20V9M15 20v-5M19 7l-4-4-4 4M15 3v9"/>',
    check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    campana:'<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    capas:'<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    doc:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    usuario:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    enlace:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    mas:'<path d="M12 5v14M5 12h14"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    calendario:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    sol:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    luna:'<path d="M20 14A8 8 0 1 1 10 4a7 7 0 0 0 10 10z"/>',
    excel:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 11l5 6M14 11l-5 6"/>',
    imprimir:'<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    camara:'<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
    reloj_arena:'<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
    flecha:'<path d="M5 12h14M13 6l6 6-6 6"/>',
    chevron:'<path d="m9 6 6 6-6 6"/>',
    ubicacion:'<path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    jerarquia:'<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
    circulo_check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    guardar:'<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h8V3M8 21v-7h8v7"/>',
    cerrar:'<path d="M6 6l12 12M18 6 6 18"/>'
  };
  const ico=(n,cls)=>`<svg class="ap-ico ${cls||''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]||P.info}</svg>`;

  const PESTANAS=[['resumen','Resumen','resumen'],['seguimiento','Seguimiento del turno','barras'],['insumos','Insumos','cajas'],['evidencias','Evidencias','doc'],['lotes','Lotes','cajas'],['consumo','Consumo','lista'],['merma','Merma','alerta'],['historial','Historial','reloj']];
  const SUBINSUMOS=[['existencias','Existencias en Producción'],['factores','Factores'],['requerimientos','Requerimientos'],['solicitudes','Solicitudes'],['prevision','Previsión'],['desviacion','Desviación de consumo']];
  const ESTADO_TXT={EN_PRODUCCION:['En curso','curso'],PAUSA:['En pausa','pausa'],DETENIDA:['Detenida','rojo'],LISTA:['Programada','prog'],PENDIENTE:['Programada','prog'],
    FINALIZADA:['Finalizada','verde'],CANCELADA:['Cancelada','gris']};
  const SOL_TXT={BORRADOR:'Borrador',SOLICITADA:'Solicitada',EN_PREPARACION:'En preparación',ENTREGADA_PARCIAL:'Entregada parcialmente',ENTREGADA:'Entregada',RECIBIDA:'Recibida',
    OBSERVADA:'Observada',CANCELADA:'Cancelada',CERRADA:'Cerrada'};
  const CONC_TXT={SIN_REGISTRO:['Sin registro','gris'],BORRADOR:['Borrador','prog'],EN_REVISION:['Pendiente de revisión','ambar'],CONFIRMADA:['Confirmada','verde']};

  const AP={tab:'resumen',sub:'existencias',fecha:'',bloque:'',linea:'',marca:'',presentacion:'',cuadro:'',insumo:'',msg:null,factLinea:'',factInsumo:'',
    exLinea:'',exEstado:'UTILIZABLE',previDias:3,desvDias:7,histLinea:'',histTipo:'',histResp:'',solSel:'',mermaLinea:''};
  function contextoInicial(){
    if(AP.fecha)return;
    let b=null;try{b=window.GlacialIndicadores.bloqueVigente(D.ahora(),typeof window.glacialBloquesConfig==='function'?window.glacialBloquesConfig():undefined);}catch(_){b=null;}
    AP.fecha=b&&b.fecha||GlacialFecha.fechaOperativa(D.ahora())/* FECHA-OPERATIVA: antes UTC (desde las 19:00 Lima daba mañana) */;
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
    const coordinaciones=(C.coordinaciones||[]).filter(x=>x.bloque===N.bloqueDe(AP.bloque));
    return {cuadros,req,resumen:N.resumenInsumos(req),concil,mermas:mermasBloque,solicitudes,coordinaciones,lineas:lineasPermitidas,
      alertas:N.alertas({requerimientos:req,conciliaciones:concil,mermas:mermasBloque,solicitudes}),
      pendientes:N.pendientesDeCierre({solicitudes,mermas:mermasBloque,conciliaciones:concil})};
  }

  /* ---------- piezas comunes ---------- */
  const pill=(txt,cls,icono)=>`<span class="ap-pill ap-p-${cls}">${icono?ico(icono):'<i></i>'}${esc(txt)}</span>`;
  const kpi=(icono,color,titulo,valor,sub)=>`<div class="ap-kpi ap-k-${color}"><span class="ap-kpi-ico">${ico(icono)}</span><div class="ap-kpi-tx"><span>${esc(titulo)}</span><b>${valor}</b>${sub?`<small>${sub}</small>`:''}</div></div>`;
  const tarjeta=(titulo,cuerpo,o)=>{o=o||{};return `<section class="ap-card ${o.cls||''}">${titulo?`<div class="ap-card-cab">${o.icono?`<span class="ap-card-ico">${ico(o.icono)}</span>`:''}<h3>${titulo}</h3>${o.accion||''}</div>`:''}${cuerpo}</section>`;};
  const pie=(texto,tipo)=>`<div class="ap-pie ap-pie-${tipo||'info'}">${ico(tipo==='aviso'?'alerta':'info')}<span>${texto}</span></div>`;
  const vacio=t=>`<div class="ap-vacio">${esc(t)}</div>`;
  const tabla=(cab,filas,cls)=>`<div class="ap-tw"><table class="ap-t ${cls||''}"><thead><tr>${cab.map(c=>`<th class="${/^#/.test(c)?'ap-num':''}">${esc(c.replace(/^#/,''))}</th>`).join('')}</tr></thead><tbody>${filas}</tbody></table></div>`;
  const presUI=c=>{try{return typeof nombrePresentacionUI==='function'?(nombrePresentacionUI(c.linea,c.marca,c.presentacion)||c.presentacion):c.presentacion;}catch(_){return c.presentacion;}};
  const nombreLinea=l=>N.lineaInfo(l).nombre;
  const nombreCuadro=c=>`${nombreLinea(c.linea)} · ${c.codigo} · ${c.marca} ${presUI(c)}`;
  const EN=()=>window.glacialAlmacenEnlaceDatos||null;
  /* Stock de Almacén (Inventario de insumos) de un insumo → {estado, disponible, base, entregado, …} o null si el enlace no está cargado. */
  const stockAlm=c=>{const e=EN();return e?e.stockDe(c):null;};
  /* Celda «En Almacén»: stock del Inventario (con semáforo contra el mínimo del catálogo) o la razón por la que no hay dato. */
  const txtStockAlm=(c,u)=>{const st=stockAlm(c);if(!st)return '—';
    if(st.estado==='SIN_ENLACE')return pill('Sin código SAP','gris');
    if(st.estado==='SIN_ARTICULO')return pill('Código no está en el Inventario','ambar','alerta');
    if(st.estado==='SIN_FILA')return pill('No viene en el corte','gris');
    if(st.estado!=='OK')return '—';
    const min=num(st.articulo&&st.articulo.stockMinimo);
    return `${fmt(st.disponible)} ${esc(u||'')}${min>0&&st.disponible<min?` ${pill('Bajo mínimo','rojo','alerta')}`:''}`;};
  const insumoDe=c=>D.cache.insumos.find(i=>i.codigo===c)||{codigo:c,nombre:c==='PRODUCTO'?'Producto terminado':c,unidad:''};
  const opcionesInsumos=(sel,filtro)=>D.cache.insumos.filter(i=>i.activo!==false&&(!filtro||filtro(i))).sort((a,b)=>a.nombre.localeCompare(b.nombre))
    .map(i=>`<option value="${esc(i.codigo)}" ${i.codigo===sel?'selected':''}>${esc(i.nombre)}</option>`).join('');
  const opcionesLineas=(sel,todas)=>(todas?`<option value="">Todas</option>`:'')+N.LINEAS.map(l=>`<option value="${l.codigo}" ${sel===l.codigo?'selected':''}>${esc(l.nombre)}</option>`).join('');
  const campo=(etq,control,cls)=>`<label class="ap-campo ${cls||''}"><span>${etq}</span>${control}</label>`;
  const campoIco=(etq,icono,control)=>`<label class="ap-campo"><span>${etq}</span><span class="ap-ctl-ico">${ico(icono)}${control}</span></label>`;
  function aviso(){
    if(!AP.msg)return '';
    return `<div class="ap-msg ap-msg-${AP.msg.tipo}" role="${AP.msg.tipo==='error'?'alert':'status'}">${ico(AP.msg.tipo==='error'?'alerta':'check')}<span>${esc(AP.msg.texto)}</span><button type="button" aria-label="Cerrar" onclick="apCerrarMsg()">${ico('cerrar')}</button></div>`;
  }
  window.apCerrarMsg=()=>{AP.msg=null;pintar();};
  async function ejecutar(fn,ok){
    try{const r=await fn();AP.msg={tipo:'ok',texto:typeof ok==='function'?ok(r):ok};}
    catch(e){AP.msg={tipo:'error',texto:D.mensajeError(e)};console.warn('Asistente:',e);}
    pintar();
  }
  const valor=id=>{const el=document.getElementById(id);return el?el.value:'';};
  window.AP_set=(k,v)=>{AP[k]=v;pintar();};
  /* «Preparar solicitud»: lleva a Solicitudes y deja al usuario en el formulario (aunque ya estuviera en esa pestaña, donde antes parecía no hacer nada). */
  window.apIr=(tab,sub)=>{
    AP.tab=tab;if(sub)AP.sub=sub;pintar();window.scrollTo(0,0);
    if(tab==='insumos'&&sub==='solicitudes')setTimeout(()=>{
      const f=document.getElementById('ap-sol-nueva');
      if(f){f.scrollIntoView({behavior:'smooth',block:'start'});const c=document.querySelector('.ap-sol-cant,#ap-sol-extra');if(c)setTimeout(()=>c.focus({preventScroll:true}),350);}
    },60);
  };
  window.apEnfocar=id=>{const el=document.getElementById(id);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>el.focus(),300);}};
  window.apIrConteo=()=>{AP.tab='insumos';AP.sub='existencias';pintar();window.apEnfocar('ap-mov-cant');};

  /* ---------- evidencia opcional (Supabase Storage privado) ---------- */
  const EVID={tipos:['image/jpeg','image/png','application/pdf'],maxBytes:10*1024*1024};
  function evidenciaHTML(id){
    return `<label class="ap-evid" for="${id}"><span class="ap-evid-ico">${ico('camara')}</span><span><b>Adjuntar evidencia</b> (opcional)<small id="${id}-nombre">JPG, PNG o PDF. Máx. 10 MB.</small></span>
      <input id="${id}" type="file" accept="image/jpeg,image/png,application/pdf" onchange="apEvidNombre('${id}')"></label>`;
  }
  window.apEvidNombre=id=>{const f=document.getElementById(id);const n=document.getElementById(id+'-nombre');if(f&&n)n.textContent=f.files&&f.files[0]?f.files[0].name:'JPG, PNG o PDF. Máx. 10 MB.';};
  async function subirEvidencia(id){
    const f=document.getElementById(id);const file=f&&f.files&&f.files[0];
    if(!file)return '';
    if(!EVID.tipos.includes(file.type))throw new Error('La evidencia debe ser JPG, PNG o PDF.');
    if(file.size>EVID.maxBytes)throw new Error('La evidencia supera 10 MB.');
    /* Supabase Storage (bucket privado, carpeta asistente/AAAA-MM); se guarda la referencia «supabase:…». */
    if(!(window.glacialFotos&&window.glacialFotos.disponible()))throw new Error('El almacenamiento de evidencias (Supabase) no está disponible. El registro no se guardó; revisa tu conexión y reintenta o quita el archivo.');
    try{
      const mes=GlacialFecha.fechaISOLocal().slice(0,7);
      const r=await window.glacialFotos.subir(file,{carpeta:'asistente/'+mes,id:'ev_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7),tipo:file.type});
      return r.url;
    }catch(e){
      throw new Error('No se pudo subir la evidencia: '+((e&&e.message)||e)+'. El registro no se guardó; reintenta o quita el archivo.');
    }
  }

  /* =========================================================== RESUMEN OPERATIVO */
  /* Faltantes del bloque que aún no cubre una solicitud abierta o material ya entregado y sin recibir (evita pedir dos veces lo mismo). */
  function faltantesNetos(ctx){
    const E=window.glacialAlmacenEnlace;const tc=E?E.transitoYComprometido(ctx.solicitudes):{};
    return ctx.resumen.filter(r=>r.faltante>0).map(r=>{const t=tc[r.insumo.codigo]||{transito:0,comprometido:0};
      return {insumo:r.insumo,faltante:r.faltante,cubierto:N.red(t.transito+t.comprometido,4),neto:N.red(Math.max(r.faltante-t.transito-t.comprometido,0),4)};}).filter(x=>x.neto>0);
  }
  /* Un clic: crea y envía a Almacén una solicitud con los faltantes netos del bloque (redondeados hacia arriba). */
  window.apSolicitarFaltantes=()=>{
    const ctx=contexto();const lista=faltantesNetos(ctx);
    if(!lista.length){AP.msg={tipo:'ok',texto:'No hay faltantes por solicitar: lo que falta ya está pedido o en camino.'};pintar();return;}
    const items=lista.map(x=>({insumo:x.insumo.codigo,unidad:x.insumo.unidad,solicitado:Math.ceil(x.neto*100)/100}));
    const resumen=lista.map(x=>`• ${x.insumo.nombre}: ${fmt(Math.ceil(x.neto*100)/100)} ${x.insumo.unidad}${x.cubierto>0?` (ya hay ${fmt(x.cubierto)} pedido o en camino)`:''}`).join('\n');
    if(!confirm('¿Enviar esta solicitud a Almacén?\n\n'+resumen))return;
    ejecutar(()=>D.crearSolicitud({fecha:AP.fecha,bloque:AP.bloque,items,observaciones:'Faltantes del bloque',enviar:true}),id=>'Solicitud '+id+' enviada a Almacén con '+items.length+' insumo(s).');
  };
  function tabResumen(ctx){
    const lineasCon=ctx.lineas.filter(l=>ctx.cuadros.some(c=>c.linea===l&&c.producido>0));
    const falt=ctx.resumen.filter(r=>r.faltante>0);
    const sinConteo=ctx.resumen.filter(r=>!r.conteo);
    const solPend=ctx.solicitudes.filter(s=>!['CERRADA','CANCELADA','RECIBIDA'].includes(s.estado));
    const kpis=`<div class="ap-kpis ap-kpis-4">${kpi('fabrica','azul','Líneas produciendo',`${lineasCon.length} / ${ctx.lineas.length}`)}${kpi('alerta','rojo','Faltantes de insumos',falt.length)}
      ${kpi('doc','ambar','Conteos por verificar',sinConteo.length)}${kpi('reloj','gris','Solicitudes pendientes',solPend.length)}</div>`;
    const cob=ctx.resumen.length?tabla(['Insumo','#Requerido','#Disponible','#Faltante'],ctx.resumen.map(r=>`<tr><td data-label="Insumo">${esc(r.insumo.nombre)}${r.sinFactor?` <small class="ap-mut">(${r.sinFactor} sin factor)</small>`:''}</td>
        <td data-label="Requerido" class="ap-num">${fmt(r.requerido)} ${esc(r.insumo.unidad)}</td><td data-label="Disponible" class="ap-num">${fmt(r.utilizable)} ${esc(r.insumo.unidad)}</td>
        <td data-label="Faltante" class="ap-num"><span class="ap-cel ${r.faltante>0?'ap-cel-rojo':'ap-cel-verde'}">${fmt(r.faltante)} ${esc(r.insumo.unidad)}</span></td></tr>`).join(''))
      +'<p class="ap-nota-pie">Disponible = utilizable − reservado para otras órdenes.</p>'
      :(D.cache.factores.length?vacio('Sin requerimientos para este bloque.'):`<div class="ap-info ap-info-acc">${ico('info','ap-info-ico')}<div><b>Aún no hay factores de consumo.</b> ${puede('gestionarFactores')?'Actívalos con un clic: se copian los del Nuevo registro al catálogo (sin pisar nada).':'Pide a un administrador que los active (Insumos › Factores).'}</div>
        ${puede('gestionarFactores')?`<button type="button" class="ap-btn" onclick="apMigrar(true)">Activar factores</button>`:''}</div>`);
    const atender=[];
    const netos=faltantesNetos(ctx);
    const extra=alertasPrevision();
    const nombres=l=>l.join(', ');
    // Faltantes: UNA línea (antes salía una por insumo, otra «de una vez» y otra por la previsión).
    if(netos.length)atender.push({ico:'doc',cls:'rojo',txt:`${netos.length===1?'Falta':'Faltan'} ${nombres(netos.map(x=>x.insumo.nombre))} para este turno`,
      acc:puede('asistenteProduccion')?'apSolicitarFaltantes()':`apIr('insumos','solicitudes')`,btn:puede('asistenteProduccion')?'Solicitar a Almacén':'Ver detalle'});
    else if(falt.length)atender.push({ico:'reloj',cls:'gris',txt:`Faltantes ya pedidos a Almacén (en camino): ${nombres(falt.map(r=>r.insumo.nombre))}`,acc:`apIr('insumos','solicitudes')`});
    const accDe=x=>x.acc==='solicitudes'?`apIr('insumos','solicitudes')`:x.acc==='desviacion'?`apIr('insumos','desviacion')`:`apIr('insumos','prevision')`;
    const cls=x=>x.nivel==='critico'?'rojo':x.nivel==='atencion'?'ambar':'gris';
    const prevAt=extra.filter(x=>x.tipo==='PREVISION'&&x.nivel==='atencion');
    extra.filter(x=>!(x.tipo==='PREVISION'&&x.nivel==='atencion')).forEach(x=>atender.push({ico:x.nivel==='info'?'reloj':'alerta',cls:cls(x),txt:x.texto,acc:accDe(x)}));
    if(prevAt.length)atender.push({ico:'alerta',cls:'ambar',txt:`Para los próximos días hay que pedir a Almacén: ${nombres(prevAt.map(x=>x.insumo))}`,acc:`apIr('insumos','prevision')`,btn:'Ver previsión'});
    if(sinConteo.length)atender.push({ico:'doc',cls:'ambar',txt:`Verificar conteo de ${nombres(sinConteo.map(r=>r.insumo.nombre))}`,acc:`apIrConteo()`});
    const mp=ctx.mermas.filter(m=>m.estado==='PENDIENTE');
    if(mp.length)atender.push({ico:'reloj',cls:'gris',txt:mp.length===1?`Validar merma de ${insumoDe(mp[0].insumo).nombre} (${nombreLinea(mp[0].linea)})`:`Validar ${mp.length} mermas pendientes`,acc:`apIr('merma')`});
    ctx.concil.filter(c=>c.porRevisar!==null&&Math.abs(c.porRevisar)>0.0001).slice(0,3).forEach(c=>atender.push({ico:'balanza',cls:'ambar',txt:`Revisar consumo: ${c.etiqueta} (${fmt(c.porRevisar)} ${c.unidad})`,acc:`apAbrirConsumo('${esc(c.cuadro.linea)}|${esc(c.cuadro.clave)}|${esc(c.insumo.codigo)}')`}));
    const sf=ctx.req.filter(f=>f.estado==='SIN_FACTOR');
    if(sf.length)atender.push({ico:'alerta',cls:'ambar',txt:`Falta el factor de ${nombres([...new Set(sf.map(f=>f.insumo.nombre))])}`,acc:`apIr('insumos','factores')`});
    ctx.coordinaciones.filter(x=>x.estado==='ABIERTA').forEach(x=>atender.push({ico:'reloj',cls:'gris',txt:`${x.texto} · ${x.responsable}`,acc:`apIr('seguimiento')`}));
    const ORD={rojo:0,ambar:1,gris:2};atender.sort((a,b)=>ORD[a.cls]-ORD[b.cls]);            // lo urgente primero
    const lim=AP.atenderTodo?atender.length:6;
    const porAtender=atender.length?`<ul class="ap-atender">${atender.slice(0,lim).map(a=>`<li><span class="ap-at-ico ap-c-${a.cls}">${ico(a.ico)}</span><span class="ap-at-tx">${esc(a.txt)}</span>
        <button type="button" class="ap-link" onclick="${a.acc}">${esc(a.btn||'Ver detalle')} ${ico('flecha')}</button></li>`).join('')}</ul>${atender.length>6?`<p class="ap-nota-pie"><button type="button" class="ap-link" onclick="AP_set('atenderTodo',${!AP.atenderTodo})">${AP.atenderTodo?'Ver menos':`Ver los ${atender.length-6} restantes`}</button></p>`:''}`:vacio('Nada pendiente por atender.');
    const conteos=D.cache.movimientos.filter(m=>m.tipo==='CONTEO').sort((a,b)=>num(b.en)-num(a.en));
    // «Existencias en Producción» ya no es una tarjeta aparte: su dato (última verificación) va en una línea dentro de «Por atender».
    const lineaConteo=`<p class="ap-linea-conteo">Última verificación: ${conteos.length?`<b>${esc(conteos[0].usuario||'—')}</b> · ${esc(hora(conteos[0].en))}`:'sin conteos registrados'} <button type="button" class="ap-link" onclick="apIr('insumos','existencias')">Ver existencias ${ico('flecha')}</button></p>`;
    const I=window.glacialIncidencias;
    const seg=ctx.lineas.map(l=>{
      const cs=ctx.cuadros.filter(c=>c.linea===l);
      if(!cs.length){
        const d=I&&typeof I.doc==='function'?I.doc(AP.fecha,AP.bloque,l):null;
        return `<li><i class="ap-dot ap-d-${d?'rojo':'gris'}"></i><span class="ap-seg-n">${esc(nombreLinea(l))}</span>${pill(d&&d.motivo?'Sin producción: '+d.motivo.toLowerCase():'Sin programación',d?'rojo':'gris')}<span></span></li>`;
      }
      return cs.map(c=>{const e=ESTADO_TXT[c.estado]||ESTADO_TXT.PENDIENTE;return `<li class="ap-clic" onclick="apVerCuadro('${esc(c.clave)}')"><i class="ap-dot ap-d-${c.producido>0||c.estado==='EN_PRODUCCION'?'verde':'gris'}"></i>
        <span class="ap-seg-n">${esc(nombreLinea(l))} · ${esc(c.marca)}</span>${pill(e[0],e[1])}<span class="ap-chev">${ico('chevron')}</span></li>`;}).join('');
    }).join('');
    return `<h2 class="ap-h2">Resumen operativo</h2>${kpis}
      ${tarjeta('Por atender',lineaConteo+porAtender,{icono:'campana'})}
      <div class="ap-2">${tarjeta('Producción y seguimiento',`<ul class="ap-seg">${seg}</ul>`,{icono:'grafico'})}${tarjeta('Cobertura de la programación',cob,{icono:'capas'})}</div>`;
  }
  window.apVerCuadro=function(clave){
    const ctx=contexto();const c=ctx.cuadros.find(x=>x.clave===clave);if(!c)return;
    const fs=ctx.req.filter(f=>f.cuadro.clave===clave);
    const filas=fs.map(f=>`<tr><td data-label="Insumo">${esc(f.insumo.nombre)}</td><td data-label="Factor">${f.factor?`${fmt(f.factor.factor,4)} ${esc(f.insumo.unidad)} / ${fmt(f.factor.cantidadBase,0)} ${f.factor.base==='PALETA'?'paleta':'UND'}`:'—'}</td>
      <td data-label="Requerido" class="ap-num">${f.estado==='OK'?fmt(f.requerido):f.estado==='PENDIENTE_CIERRE'?'Pendiente del cierre':f.estado==='SIN_BASE'?'Sin UND por paleta':'Pendiente de configurar'}</td>
      <td data-label="Consumido" class="ap-num">${fmt(f.consumido)}</td><td data-label="Reservado otras" class="ap-num">${f.estado==='OK'?fmt(f.reservadoOtros):'—'}</td><td data-label="Disponible" class="ap-num">${f.estado==='OK'?fmt(f.disponible):'—'}</td>
      <td data-label="Faltante" class="ap-num ${f.faltante>0?'ap-rojo':''}">${f.estado==='OK'?fmt(f.faltante):'—'}</td></tr>`).join('');
    modal(esc(nombreCuadro(c)),`<p class="ap-sub">Programado ${fmt(c.programado,0)} · producido ${fmt(c.producido,0)} ${N.lineaInfo(c.linea).unidad} (${esc(c.fuenteProduccion)}) · ${fmt(c.unidadesPorPaleta,0)} UND por paleta${c.reporte&&c.reporte.lote?' · lote '+esc(c.reporte.lote):''}</p>
      ${filas?tabla(['Insumo','Factor','#Requerido','#Consumido','#Reservado otras','#Disponible','#Faltante'],filas):vacio('Sin factores para esta línea.')}`);
  };

  /* =========================================================== SEGUIMIENTO DEL TURNO */
  function tabSeguimiento(ctx){
    const porCuadro=new Map();ctx.req.forEach(f=>{const k=f.cuadro.clave;if(!porCuadro.has(k))porCuadro.set(k,[]);porCuadro.get(k).push(f);});
    const conFalt=ctx.cuadros.filter(c=>(porCuadro.get(c.clave)||[]).some(f=>f.faltante>0)).length;
    const pendCierre=ctx.cuadros.filter(c=>c.completar&&!(c.programado>0)).length;
    const MODO={FIJA:'Cantidad fija',COMPLETAR:'Completar cantidad',TURNO:'Resto del turno',HORA:'Hasta una hora'};
    /* Un producto en secuencia dice cómo termina su tramo (cantidad, hora o cierre); si no, la modalidad de la programación. */
    const modalidadTxt=p=>{if(!p)return 'Sin programación';const t=(p.tramosSecuencia||[]).slice().sort((a,b)=>num(a.orden)-num(b.orden));
      if(!t.length)return MODO[p.modo]||'Programada';
      return t.map(x=>x.tipoFin==='HORA'?'Hasta las '+(x.horaFin||'—'):x.tipoFin==='CIERRE'?'Resto del turno':'Hasta '+fmt(x.cantidadObjetivo,0)+' und').join(' → ');};
    const progs=typeof loadProgramaciones==='function'?loadProgramaciones():[];
    const filas=ctx.cuadros.map(c=>{
      const fs=porCuadro.get(c.clave)||[];
      const falt=fs.filter(f=>f.faltante>0),sin=fs.filter(f=>f.estado==='SIN_FACTOR'||f.estado==='FACTOR_AMBIGUO');
      const est=c.estado==='FINALIZADA'?pill('Finalizada','verde'):c.completar&&!(c.programado>0)?pill('Pendiente del cierre','ambar')
        :falt.length?falt.map(f=>pill('Falta '+f.insumo.nombre.toLowerCase(),'rojo')).join(' '):sin.length?pill(sin.length+' sin factor','ambar')
        :c.estado==='PENDIENTE'&&!(c.producido>0)&&!fs.length?pill('Sin inicio','gris'):fs.length?(fs.every(f=>f.conteo)?pill('Cubierto','verde'):pill('Por verificar','verde')):pill('Sin requerimientos','gris');
      const p=progs.find(x=>c.programaciones.includes(x.id));
      return `<tr><td data-label="Línea">${esc(nombreLinea(c.linea))}</td><td data-label="Marca">${esc(c.marca)} ${esc(presUI(c))}</td><td data-label="Modalidad">${esc(modalidadTxt(p))}</td>
        <td data-label="Materiales">${est}</td><td data-label="Acción"><button type="button" class="ap-btn ap-btn-o ap-btn-s" onclick="apVerCuadro('${esc(c.clave)}')">${ico('doc')} Ver detalle</button></td></tr>`;}).join('');
    const ed=puede('asistenteProduccion');
    const coord=`${ed?`${campo('Observación',`<textarea id="ap-co-tx" rows="3" maxlength="300" placeholder="Registrar pendiente, responsable y seguimiento…"></textarea>`,'ap-ancho')}
      <div class="ap-form ap-form-2">${campo('Responsable',`<select id="ap-co-resp">${D.RESPONSABLES.map(r=>`<option>${esc(r)}</option>`).join('')}</select>`)}
        ${campo('Prioridad',`<select id="ap-co-prio">${D.PRIORIDADES.map(r=>`<option>${esc(r)}</option>`).join('')}</select>`)}</div>
      <div class="ap-acc"><button type="button" class="ap-btn" onclick="apRegistrarCoord()">Registrar seguimiento</button></div>`:''}
      ${ctx.coordinaciones.length?`<ul class="ap-coord">${ctx.coordinaciones.slice().sort((a,b)=>(a.estado==='ABIERTA'?0:1)-(b.estado==='ABIERTA'?0:1)).map(x=>`<li class="${x.estado==='CERRADA'?'ap-cerrada':''}">
        <div><b>${esc(x.texto)}</b><small>${esc(x.responsable)} · prioridad ${esc(String(x.prioridad||'').toLowerCase())} · ${esc(x.creadoPor||'')} ${hora(x.historial&&x.historial[0]&&x.historial[0].en)}</small></div>
        ${x.estado==='ABIERTA'?(ed?`<button type="button" class="ap-btn ap-btn-o ap-btn-s" onclick="apCerrarCoord('${esc(x.id)}',${num(x.version)})">Cerrar</button>`:pill('Abierta','ambar')):pill('Cerrada','verde')}</li>`).join('')}</ul>`:(ed?'':vacio('Sin seguimientos registrados.'))}`;
    return `<h2 class="ap-h2">Programación y seguimiento</h2>
      <div class="ap-kpis ap-kpis-3">${kpi('lista','azul','Órdenes del turno',ctx.cuadros.length)}${kpi('alerta','ambar','Con faltantes',conFalt)}${kpi('reloj','gris','Pendiente de cierre previo',pendCierre)}</div>
      ${tarjeta('Necesidades por programación',filas?tabla(['Línea','Marca','Modalidad','Materiales','Acción'],filas):vacio('Sin programación en este bloque.'))}
      ${tarjeta('Coordinaciones del turno',coord)}`;
  }
  window.apRegistrarCoord=()=>ejecutar(()=>D.registrarCoordinacion({id:D.nuevoId('coo'),fecha:AP.fecha,bloque:AP.bloque,texto:valor('ap-co-tx'),responsable:valor('ap-co-resp'),prioridad:valor('ap-co-prio')}),'Seguimiento registrado.');
  window.apCerrarCoord=(id,v)=>{const n=prompt('Nota de cierre (opcional):','');if(n===null)return;ejecutar(()=>D.cerrarCoordinacion(id,v,n),'Seguimiento cerrado.');};


  /* =========================================================== PREVISIÓN, ALERTAS Y DESVIACIÓN (82-asistente-prevision-nucleo.js) */
  const PV=()=>window.glacialAsistentePrevision;
  const lineasPermitidas=()=>(typeof LINES!=='undefined'?LINES.map(l=>l.key):N.LINEAS.map(l=>l.codigo)).filter(l=>N.LINEAS.some(x=>x.codigo===l));
  /* Cuadros de una fecha (DÍA + NOCHE) con lo programado, lo producido y el factor del catálogo. */
  function cuadrosDeFecha(fecha){
    const lineas=lineasPermitidas();
    const base={fecha,lineas,programaciones:typeof loadProgramaciones==='function'?loadProgramaciones():[],records:typeof loadRecords==='function'?loadRecords():[],
      produccionAlCorte:window.glacialProduccionPaletasAlCorte,unidadesPorPaleta:typeof obtenerUnidadesPorPalet==='function'?obtenerUnidadesPorPalet:null};
    return ['DIA','NOCHE'].flatMap(b=>N.cuadrosDelBloque({...base,bloque:b}));
  }
  function datosPrevision(nDias){
    const E=window.glacialAlmacenEnlace,C=D.cache;
    const dias=[...Array(nDias).keys()].map(i=>{const f=PV().sumarDias(AP.fecha,i);return {fecha:f,cuadros:cuadrosDeFecha(f)};});
    const tc=E?E.transitoYComprometido(C.solicitudes):{};
    const stockProd={},stockAlm={},enCamino={};
    C.insumos.filter(i=>i.activo!==false).forEach(i=>{
      stockProd[i.codigo]=N.saldoInsumo(C.movimientos,i.codigo).utilizable;
      stockAlm[i.codigo]=stockAlm_(i.codigo);
      const t=tc[i.codigo]||{transito:0,comprometido:0};enCamino[i.codigo]=N.red(t.transito+t.comprometido,4);
    });
    return PV().prevision({dias,factores:C.factores,insumos:C.insumos,stockProd,stockAlm,enCamino});
  }
  function stockAlm_(c){const e=EN();return e?e.stockDe(c):null;}
  function datosDesviacion(nDias){
    const C=D.cache,cuadros=[...Array(nDias).keys()].flatMap(i=>cuadrosDeFecha(PV().sumarDias(AP.fecha,-i)));
    return PV().desviacionConsumo({cuadros,factores:C.factores,insumos:C.insumos,movimientos:C.movimientos});
  }
  /* Avisos de la pestaña Resumen que salen de la previsión (3 días), de las demoras de las solicitudes y de la desviación (7 días). */
  function alertasPrevision(){
    try{
      const prev=datosPrevision(3),desv=datosDesviacion(7);
      const mins=[];
      D.cache.insumos.filter(i=>i.activo!==false).forEach(i=>{const st=stockAlm_(i.codigo);
        if(st&&st.estado==='OK'&&st.articulo&&num(st.articulo.stockMinimo)>0)mins.push({insumo:i,disponible:st.disponible,minimo:num(st.articulo.stockMinimo)});});
      return PV().alertasExtra({prevision:prev,desviaciones:desv,solicitudes:D.cache.solicitudes,ahora:D.ahora(),stockMinimoAlmacen:mins});
    }catch(e){console.warn('Asistente: alertas de previsión',e);return [];}
  }
  const diaCorto=f=>{const d=new Date(f+'T00:00:00');return ['dom','lun','mar','mié','jue','vie','sáb'][d.getDay()]+' '+f.slice(8,10)+'/'+f.slice(5,7);};
  window.apPreviDias=n=>{AP.previDias=Number(n)||3;pintar();};
  window.apDesvDias=n=>{AP.desvDias=Number(n)||7;pintar();};
  function subPrevision(ctx){
    const pv=datosPrevision(AP.previDias);
    const sel=`<div class="ap-form ap-form-3">${campo('Días a prever',`<select onchange="apPreviDias(this.value)">${[2,3,5,7].map(n=>`<option value="${n}" ${n===AP.previDias?'selected':''}>${n} días desde ${diaCorto(AP.fecha)}</option>`).join('')}</select>`)}</div>`;
    const pedir=pv.filas.filter(f=>f.faltaProd>0);
    const filas=pv.filas.map(f=>{
      const u=esc(f.insumo.unidad);
      const est=f.estado==='OK'?pill('Alcanza','verde','check'):f.estado==='PEDIR'?pill('Pedir '+fmt(f.faltaProd)+' '+f.insumo.unidad,'ambar','alerta'):pill('No alcanza ni con Almacén','rojo','alerta');
      return `<tr><td data-label="Insumo"><b>${esc(f.insumo.nombre)}</b></td>${pv.dias.map(d=>`<td data-label="${esc(diaCorto(d))}" class="ap-num">${f.porDia[d]>0?fmt(f.porDia[d]):'—'}</td>`).join('')}
        <td data-label="Total" class="ap-num"><b>${fmt(f.total)} ${u}</b></td><td data-label="En Producción" class="ap-num">${fmt(f.stockProd)} ${u}</td><td data-label="En camino" class="ap-num">${f.enCamino>0?fmt(f.enCamino)+' '+u:'—'}</td>
        <td data-label="En Almacén" class="ap-num">${f.stockAlm===null?'—':fmt(f.stockAlm)+' '+u}</td><td data-label="Alcanza hasta">${f.estado==='OK'?'Todo el período':(f.alcanzaHasta?esc(diaCorto(f.alcanzaHasta)):'No alcanza hoy')}</td><td data-label="Estado">${est}</td></tr>`;}).join('');
    const nota=pie('Requerido = lo que falta producir de la programación publicada × el factor vigente. «En camino» es lo pedido a Almacén o entregado y aún sin recibir. «En Almacén» sale del Inventario de insumos (según el último corte y las entregas).'+(pv.sinFactor?` ${pv.sinFactor} cuadro(s) sin factor no entran en el cálculo.`:'')+(pv.pendientesCierre?` ${pv.pendientesCierre} cuadro(s) «completar cantidad» esperan un cierre previo.`:''));
    const btn=puede('asistenteProduccion')&&pedir.length?`<div class="ap-acc"><button type="button" class="ap-btn" onclick="apSolicitarPrevision()">${ico('doc')} Solicitar lo que falta (${pedir.length})</button></div>`:'';
    return `${sel}<div class="ap-card ap-card-in"><h3>Insumos que harán falta</h3>${filas?tabla(['Insumo',...pv.dias.map(diaCorto),'#Total','#En Producción','#En camino','#En Almacén','Alcanza hasta','Estado'].map(c=>/^(lun|mar|mié|jue|vie|sáb|dom) /.test(c)?'#'+c:c),filas,'ap-t-plano'):vacio('No hay producción programada con factor de consumo en estos días.')}</div>
      ${btn}${nota}`;
  }
  window.apSolicitarPrevision=()=>{
    const pv=datosPrevision(AP.previDias);const lista=pv.filas.filter(f=>f.faltaProd>0);
    if(!lista.length){AP.msg={tipo:'ok',texto:'Con lo que hay y lo que viene en camino alcanza para el período.'};pintar();return;}
    const items=lista.map(f=>({insumo:f.insumo.codigo,unidad:f.insumo.unidad,solicitado:Math.ceil(f.faltaProd*100)/100}));
    const txt=lista.map(f=>`• ${f.insumo.nombre}: ${fmt(Math.ceil(f.faltaProd*100)/100)} ${f.insumo.unidad}${f.estado==='SIN_STOCK'?' (Almacén no alcanza)':''}`).join('\n');
    if(!confirm('¿Enviar a Almacén lo que falta para los próximos '+AP.previDias+' días?\n\n'+txt))return;
    ejecutar(()=>D.crearSolicitud({fecha:AP.fecha,bloque:AP.bloque,items,observaciones:'Previsión de '+AP.previDias+' días',enviar:true}),id=>'Solicitud '+id+' enviada a Almacén.');
  };
  function subDesviacion(ctx){
    const dv=datosDesviacion(AP.desvDias);
    const sel=`<div class="ap-form ap-form-3">${campo('Período',`<select onchange="apDesvDias(this.value)">${[3,7,15,30].map(n=>`<option value="${n}" ${n===AP.desvDias?'selected':''}>Últimos ${n} días</option>`).join('')}</select>`)}</div>`;
    const nota=pie('Solo se comparan los cuadros con consumo real confirmado: teórico = producido × factor vigente; real = saldo inicial + recibido − devuelto − saldo final. Tolerancia normal: ±'+(dv.tolerancia*100)+' %.');
    const pc=x=>(x.pct>0?'+':'')+fmt(x.pct*100,1)+' %';
    const pillD=x=>x.estado==='NORMAL'?pill('Normal','verde','check'):x.estado==='EXCESO'?pill('Consumo alto','rojo','alerta'):pill('Consumo bajo','ambar','alerta');
    const fila=(x,conLinea)=>`<tr>${conLinea?`<td data-label="Línea">${esc(nombreLinea(x.linea))}</td>`:''}<td data-label="Insumo"><b>${esc(x.insumo.nombre)}</b></td><td data-label="Teórico" class="ap-num">${fmt(x.teorico)} ${esc(x.insumo.unidad)}</td>
      <td data-label="Real" class="ap-num">${fmt(x.real)} ${esc(x.insumo.unidad)}</td><td data-label="Diferencia" class="ap-num">${fmt(x.desviacion)} ${esc(x.insumo.unidad)}</td><td data-label="%" class="ap-num">${pc(x)}</td><td data-label="Cuadros" class="ap-num">${x.cuadros}</td><td data-label="Estado">${pillD(x)}</td></tr>`;
    return `${sel}<div class="ap-card ap-card-in"><h3>Consumo real frente al teórico</h3>${dv.filas.length?tabla(['Insumo','#Teórico','#Real','#Diferencia','#%','#Cuadros','Estado'],dv.filas.map(x=>fila(x,false)).join(''),'ap-t-plano'):vacio('Aún no hay consumos confirmados en el período (se confirman en Consumo › conciliación).')}</div>
      ${dv.porLinea.length?`<div class="ap-card ap-card-in"><h3>Por línea</h3>${tabla(['Línea','Insumo','#Teórico','#Real','#Diferencia','#%','#Cuadros','Estado'],dv.porLinea.map(x=>fila(x,true)).join(''),'ap-t-plano')}</div>`:''}
      ${nota}`;
  }

  /* =========================================================== EVIDENCIAS (bandeja de validación de etiquetas leídas por la IA)
     La lógica vive en 84-86 (evidencias-insumos-*): aquí solo se monta. No toca stock. */
  function tabEvidencias(){
    const UI=window.iiEvidenciasUI,P=window.__inventarioInsumosPantalla;
    if(!UI||!P)return `<section class="ap-card"><div class="ap-msg ap-msg-info">${ico('info')}<span>La bandeja de evidencias no está disponible en esta versión.</span></div></section>`;
    UI.usar({pintar:()=>pintar(),activo:()=>typeof state!=='undefined'&&state.currentTab==='asistente'&&AP.tab==='evidencias'});
    return `<div class="ii">${P.estilos()}${UI.html()}</div>`;
  }

  /* =========================================================== LOTES (trazabilidad de lotes de insumos; lógica en 87-89). No toca stock SAP. */
  function tabLotes(){
    const UI=window.iiLotesUI,P=window.__inventarioInsumosPantalla;
    if(!UI||!P)return `<section class="ap-card"><div class="ap-msg ap-msg-info">${ico('info')}<span>La trazabilidad de lotes no está disponible en esta versión.</span></div></section>`;
    UI.usar({pintar:()=>pintar(),activo:()=>typeof state!=='undefined'&&state.currentTab==='asistente'&&AP.tab==='lotes'});
    return `<div class="ii">${P.estilos()}${UI.html()}</div>`;
  }

  /* =========================================================== INSUMOS */
  function tabInsumos(ctx){
    const ed=puede('asistenteProduccion');
    const sub=SUBINSUMOS.map(([k,t])=>`<button type="button" class="ap-sub ${AP.sub===k?'ap-sub-act':''}" onclick="AP_set('sub','${k}')">${t}</button>`).join('');
    const cuerpo={existencias:subExistencias,factores:subFactores,requerimientos:subRequerimientos,solicitudes:subSolicitudes,prevision:subPrevision,desviacion:subDesviacion}[AP.sub]||subExistencias;
    return `<section class="ap-card"><div class="ap-tit-acc"><h2 class="ap-h2 ap-h2-in">Existencias y requerimientos</h2><div class="ap-acc">
        ${ed?`<button type="button" class="ap-btn ap-btn-o" onclick="apIrConteo()">${ico('mas')} Registrar conteo</button>
        <button type="button" class="ap-btn" onclick="apIr('insumos','solicitudes')">${ico('doc')} Preparar solicitud</button>`:''}</div></div>
      <nav class="ap-subs">${sub}</nav>${cuerpo(ctx)}</section>`;
  }
  function subExistencias(ctx){
    const ins=D.cache.insumos.filter(i=>i.activo!==false&&(!AP.exLinea||D.cache.factores.some(f=>f.insumo===i.codigo&&f.linea===AP.exLinea&&Number(f.factor)!==0)));
    const filtros=`<div class="ap-form ap-form-3">${campoIco('Ubicación','ubicacion','<select disabled><option>Producción</option></select>')}
      ${campoIco('Línea','jerarquia',`<select onchange="AP_set('exLinea',this.value)">${opcionesLineas(AP.exLinea,true)}</select>`)}
      ${campoIco('Estado','circulo_check',`<select onchange="AP_set('exEstado',this.value)"><option value="UTILIZABLE" ${AP.exEstado==='UTILIZABLE'?'selected':''}>Utilizable</option><option value="OBSERVADO" ${AP.exEstado==='OBSERVADO'?'selected':''}>Observado / dañado</option></select>`)}</div>`;
    const obs=AP.exEstado==='OBSERVADO';
    const filas=ins.map(i=>{
      const s=N.saldoInsumo(D.cache.movimientos,i.codigo);
      const deLinea=ctx.req.filter(f=>f.insumo.codigo===i.codigo&&f.estado==='OK'&&(!AP.exLinea||f.cuadro.linea===AP.exLinea));
      const abiertos=ctx.req.filter(f=>f.insumo.codigo===i.codigo&&f.estado==='OK'&&N.cuadroAbierto(f.cuadro));
      const reqT=N.red(deLinea.reduce((a,f)=>a+f.requerido,0),4);
      const pend=N.red(deLinea.filter(f=>N.cuadroAbierto(f.cuadro)).reduce((a,f)=>a+f.pendiente,0),4);
      const reservOtras=N.red(Math.max(abiertos.reduce((a,f)=>a+f.pendiente,0)-pend,0),4);
      const util=obs?s.observado:s.utilizable;
      const disp=obs?0:N.red(Math.max(util-reservOtras,0),4);
      const falt=obs?0:N.red(Math.max(pend-disp,0),4);
      const u=esc(i.unidad);
      return `<tr><td data-label="Insumo"><b>${esc(i.nombre)}</b></td><td data-label="${obs?'Observado':'Utilizable'}" class="ap-num">${fmt(util)} ${u}</td><td data-label="Reservado otras órdenes" class="ap-num">${fmt(reservOtras)} ${u}</td>
        <td data-label="Disponible" class="ap-num">${obs?pill('No disponible','rojo'):fmt(disp)+' '+u}</td><td data-label="En Almacén" class="ap-num">${txtStockAlm(i.codigo,i.unidad)}</td><td data-label="Requerido" class="ap-num">${fmt(reqT)} ${u}</td><td data-label="Faltante" class="ap-num ${falt>0?'ap-rojo':''}">${fmt(falt)} ${u}</td></tr>`;}).join('');
    const ed=puede('asistenteProduccion');
    const tipos=[['DEVOLUCION','Devolución a Almacén'],['TRANSFERENCIA_ENTRADA','Transferencia recibida'],['TRANSFERENCIA_SALIDA','Transferencia enviada']];
    const sel=D.cache.insumos.filter(i=>i.activo!==false).sort((a,b)=>a.nombre.localeCompare(b.nombre))[0];
    const form=ed?tarjeta('Nuevo conteo físico',`<div class="ap-form ap-form-2">
        ${campo('Insumo',`<select id="ap-mov-insumo" onchange="apMovUnidad()">${opcionesInsumos(sel&&sel.codigo)}</select>`)}${campo('Ubicación','<select disabled><option>Producción</option></select>')}
        ${campo('Cantidad','<input id="ap-mov-cant" type="number" min="0" step="any" inputmode="decimal">')}${campo('Unidad',`<input id="ap-mov-unidad" value="${esc(sel?sel.unidad:'')}" readonly>`)}</div>
        ${campo('Condición','<select id="ap-mov-cond"><option value="UTILIZABLE">Utilizable</option><option value="OBSERVADO">Observado / dañado (no disponible)</option></select>','ap-ancho')}
        <details class="ap-mas" id="ap-mov-otro"><summary>Otro movimiento (devolución o transferencia)</summary><div class="ap-form ap-form-2">
          ${campo('Tipo',`<select id="ap-mov-tipo">${tipos.map(([k,t])=>`<option value="${k}">${t}</option>`).join('')}</select>`)}
          ${campo('Cuadro (marca)',`<select id="ap-mov-cuadro"><option value="">— Elegir —</option>${ctx.cuadros.map(c=>`<option value="${esc(c.clave)}">${esc(nombreCuadro(c))}</option>`).join('')}</select>`)}
          ${campo('Lote (opcional)','<input id="ap-mov-lote" maxlength="40">')}${campo('Motivo','<input id="ap-mov-motivo" maxlength="200">')}</div></details>
        ${evidenciaHTML('ap-mov-evid')}
        <button type="button" class="ap-btn ap-btn-full" onclick="apGuardarMovimiento()">${ico('guardar')} Guardar conteo</button>`):'';
    const conteos=D.cache.movimientos.filter(m=>m.tipo==='CONTEO').sort((a,b)=>num(b.en)-num(a.en));
    const ult=conteos[0];
    const posteriores=ult?D.cache.movimientos.filter(m=>m.tipo!=='CONTEO'&&m.insumo===ult.insumo&&num(m.en)>num(ult.en)).length:0;
    const traz=tarjeta('Último conteo',`<ul class="ap-traz">
        <li>${ico('usuario')}<div><b>Verificado por</b><small>${ult?`${esc(ult.usuario||'—')} · ${esc(fechaHora(ult.en))} · ${esc(insumoDe(ult.insumo).nombre)}${posteriores?` · ${posteriores} movimiento(s) posteriores`:''}`:'Sin conteos registrados'}</small></div></li></ul>
      <button type="button" class="ap-link" onclick="apIr('historial')">Ver movimientos ${ico('flecha')}</button>`);
    return `${filtros}<div class="ap-card ap-card-in"><h3>Saldo verificado y disponibilidad</h3>${filas?tabla(['Insumo',obs?'#Observado':'#Utilizable','#Reservado otras órdenes','#Disponible','#En Almacén','#Requerido','#Faltante'],filas,'ap-t-plano'):vacio('Sin insumos en el catálogo (Factores).')}</div>
      ${pie('Material observado o dañado excluido del disponible.','aviso')}
      <div class="ap-2 ap-2-par">${form}${traz}</div>`;
  }
  window.apMovUnidad=()=>{const u=document.getElementById('ap-mov-unidad');if(u)u.value=insumoDe(valor('ap-mov-insumo')).unidad;};
  window.apGuardarMovimiento=()=>{
    const ctx=contexto();const det=document.getElementById('ap-mov-otro');const otro=!!(det&&det.open);
    const tipo=otro?valor('ap-mov-tipo'):'CONTEO',insumo=valor('ap-mov-insumo'),clave=otro?valor('ap-mov-cuadro'):'';const c=ctx.cuadros.find(x=>x.clave===clave);
    const op=D.nuevoId('mov');
    ejecutar(async()=>{
      const m={opId:op,tipo,insumo,unidad:insumoDe(insumo).unidad,cantidad:valor('ap-mov-cant'),condicion:valor('ap-mov-cond'),lote:otro?valor('ap-mov-lote'):'',motivo:otro?valor('ap-mov-motivo'):'',
        fecha:AP.fecha,bloque:AP.bloque,cuadro:clave,linea:c?c.linea:''};
      const err=D.validarMovimiento(m);if(err.length){const e=new Error(err.join(' · '));e.codigo='VALIDACION';throw e;}
      m.evidencia=await subirEvidencia('ap-mov-evid');
      return D.registrarMovimiento(m);
    },r=>r&&r.duplicado?'Ese movimiento ya estaba guardado (no se duplicó).':(tipo==='CONTEO'?'Conteo guardado: el saldo quedó verificado.':'Movimiento guardado.'));
  };
  function subFactores(){
    const gest=puede('gestionarFactores');
    const ins=D.cache.insumos.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre));
    const fl=D.cache.factores.filter(f=>(!AP.factLinea||f.linea===AP.factLinea)&&(!AP.factInsumo||f.insumo===AP.factInsumo))
      .sort((a,b)=>a.linea.localeCompare(b.linea)||a.insumo.localeCompare(b.insumo)||String(a.presentacion).localeCompare(String(b.presentacion))||String(b.vigenteDesde).localeCompare(String(a.vigenteDesde)));
    const hoy=GlacialFecha.fechaOperativa(D.ahora())/* FECHA-OPERATIVA: antes UTC (desde las 19:00 Lima daba mañana) */;
    const ff=fl.slice(0,400).map(f=>`<tr class="${N.vigenteEn(f,hoy)?'':'ap-anulado'}"><td data-label="Línea">${esc(nombreLinea(f.linea))}</td><td data-label="Insumo">${esc(insumoDe(f.insumo).nombre)}</td><td data-label="Marca">${esc(f.marca)}</td>
      <td data-label="Presentación">${esc(f.presentacion)}</td><td data-label="Factor" class="ap-num">${Number(f.factor)===0?'No aplica':`${fmt(f.factor,4)} ${esc(insumoDe(f.insumo).unidad)} / ${fmt(f.cantidadBase,0)} ${f.base==='PALETA'?'paleta':'UND'}`}</td>
      <td data-label="Vigencia">${esc(f.vigenteDesde)} → ${esc(f.vigenteHasta||'…')}</td><td data-label="Origen">${f.origen==='codigo'?'Código (migrado)':'Manual'} · v${num(f.version)}${f.nota?`<small class="ap-mut ap-blk">${esc(f.nota)}</small>`:''}</td>
      <td data-label="">${gest&&!f.vigenteHasta?`<button type="button" class="ap-btn ap-btn-o ap-btn-s" onclick="apFactorForm('${esc(f.id)}')">Nueva versión</button>`:''} <button type="button" class="ap-btn ap-btn-o ap-btn-s" onclick="apHistorialDoc('apFactores','${esc(f.id)}')">Historial</button></td></tr>`).join('');
    return `${gest&&!D.cache.factores.some(f=>f.origen==='codigo')?`<div class="ap-info ap-info-acc">${ico('info','ap-info-ico')}<div><b>Migración de factores.</b> Los factores del Nuevo registro (05-utils.js) se copian al catálogo como versión 1, sin perder valores. Repetirla no duplica ni pisa lo editado.</div>
        <button type="button" class="ap-btn" onclick="apMigrar()">Migrar factores del código</button></div>`:''}
      <h3 class="ap-h3">Insumos</h3>${ins.length?tabla(['Código','Nombre','Unidad','Tipo','Código SAP','Estado',''],ins.map(i=>`<tr><td data-label="Código">${esc(i.codigo)}</td><td data-label="Nombre">${esc(i.nombre)}</td><td data-label="Unidad">${esc(i.unidad)}</td><td data-label="Tipo">${esc(i.tipo)}</td><td data-label="Código SAP">${i.itemCode?esc(i.itemCode):pill('Sin enlace','gris')}</td>
        <td data-label="Estado">${i.activo===false?pill('Inactivo','gris'):pill('Activo','verde')}</td><td data-label="">${gest?`<button type="button" class="ap-btn ap-btn-o ap-btn-s" onclick="apInsumoForm('${esc(i.codigo)}')">Editar</button>`:''}</td></tr>`).join('')):vacio('Sin insumos.')}
      ${gest?`<div class="ap-acc ap-acc-wrap"><button type="button" class="ap-btn ap-btn-o" onclick="apInsumoForm('')">${ico('mas')} Agregar insumo</button></div>`:''}
      <h3 class="ap-h3">Factores de consumo</h3><div class="ap-form ap-form-3">${campo('Línea',`<select onchange="AP_set('factLinea',this.value)">${opcionesLineas(AP.factLinea,true)}</select>`)}
        ${campo('Insumo',`<select onchange="AP_set('factInsumo',this.value)"><option value="">Todos</option>${opcionesInsumos(AP.factInsumo)}</select>`)}</div>
      ${ff?tabla(['Línea','Insumo','Marca','Presentación','#Factor','Vigencia','Origen',''],ff):vacio('Sin factores para el filtro.')}
      ${gest?`<div class="ap-acc ap-acc-wrap"><button type="button" class="ap-btn" onclick="apFactorForm('')">${ico('mas')} Nuevo factor</button></div>`:'<p class="ap-nota-pie">Solo usuarios con permiso «Administrar insumos y factores» pueden modificarlos. Cada cambio queda auditado.</p>'}`;
  }
  function subRequerimientos(ctx){
    const filas=ctx.req.map(f=>`<tr><td data-label="Línea">${esc(nombreLinea(f.cuadro.linea))}</td><td data-label="Cuadro">${esc(f.cuadro.codigo+' · '+f.cuadro.marca+' '+presUI(f.cuadro))}</td><td data-label="Insumo">${esc(f.insumo.nombre)}</td>
      <td data-label="Requerido" class="ap-num">${f.estado==='OK'?fmt(f.requerido)+' '+esc(f.insumo.unidad):f.estado==='PENDIENTE_CIERRE'?pill('Pendiente del cierre','ambar'):f.estado==='SIN_BASE'?pill('Sin UND por paleta','ambar'):pill('Sin factor','ambar')}</td>
      <td data-label="Consumido" class="ap-num">${fmt(f.consumido)}</td><td data-label="Reservado otras" class="ap-num">${f.estado==='OK'?fmt(f.reservadoOtros):'—'}</td><td data-label="Faltante" class="ap-num ${f.faltante>0?'ap-rojo':''}">${f.estado==='OK'?fmt(f.faltante):'—'}</td></tr>`).join('');
    return filas?tabla(['Línea','Cuadro','Insumo','#Requerido','#Consumido','#Reservado otras','#Faltante'],filas)+'<p class="ap-nota-pie">Las reservas se calculan desde la programación vigente: al cambiarla se recalculan sin duplicarse.</p>':vacio('Sin requerimientos (revisa la programación y los factores).');
  }
  const ORDEN_SOL={SOLICITADA:0,EN_PREPARACION:1,ENTREGADA_PARCIAL:2,OBSERVADA:3,ENTREGADA:4,BORRADOR:5,RECIBIDA:6,CERRADA:7,CANCELADA:8};
  const SOL_ABIERTAS=['SOLICITADA','EN_PREPARACION','ENTREGADA_PARCIAL','OBSERVADA','ENTREGADA','BORRADOR'];
  /* «hace 5 h» desde un instante en ms. */
  const hace=ms=>{if(!ms)return '—';const m=Math.max(Math.round((D.ahora()-num(ms))/60000),0);return m<60?m+' min':m<1440?Math.floor(m/60)+' h':Math.floor(m/1440)+' d';};
  window.apSolVal=el=>{AP.solVal=AP.solVal||{};AP.solVal[el.dataset.insumo]=el.value;};
  window.apSolAgregar=()=>{
    document.querySelectorAll('.ap-sol-cant').forEach(window.apSolVal);
    const c=valor('ap-sol-extra');if(!c)return;AP.solExtra=[...new Set([...(AP.solExtra||[]),c])];pintar();
  };
  function subSolicitudes(ctx){
    const asist=puede('asistenteProduccion'),alm=puede('moduloAlmacen');
    const faltantes=ctx.resumen.filter(r=>r.faltante>0);
    const filtro=AP.solFiltro||'abiertas';
    let lista=D.cache.solicitudes.slice();
    if(filtro==='abiertas')lista=lista.filter(s=>SOL_ABIERTAS.includes(s.estado));
    else if(filtro==='cerradas')lista=lista.filter(s=>!SOL_ABIERTAS.includes(s.estado));
    lista.sort((a,b)=>(ORDEN_SOL[a.estado]??9)-(ORDEN_SOL[b.estado]??9)||String(b.id).localeCompare(String(a.id)));
    const ultimo=s=>((s.historial||[]).slice(-1)[0]||{}).en;
    const itemTxt=i=>`${esc(insumoDe(i.insumo).nombre)} ${num(i.entregado)>0?fmt(i.entregado)+' / ':''}${fmt(i.solicitado)} ${esc(i.unidad)}`;
    const filas=lista.map(s=>`<tr class="ap-clic" onclick="apVerSolicitud('${esc(s.id)}')"><td data-label="Solicitud"><b>${esc(s.id)}</b></td><td data-label="Fecha">${esc(s.fecha)} · ${s.bloque==='NOCHE'?'Noche':'Día'}</td>
      <td data-label="Ítems">${(s.items||[]).map(itemTxt).join(' · ')}</td><td data-label="Espera">${SOL_ABIERTAS.includes(s.estado)?hace(ultimo(s)):'—'}</td><td data-label="Estado">${pillSolicitud(s.estado)}</td></tr>`).join('');
    // Solicitud nueva: solo lo que falta + los insumos que la Asistente agrega a mano.
    const vals=AP.solVal||{},extra=AP.solExtra||[];
    const filasNueva=D.cache.insumos.filter(i=>i.activo!==false).filter(i=>faltantes.some(x=>x.insumo.codigo===i.codigo)||extra.includes(i.codigo)).map(i=>{
      const f=faltantes.find(x=>x.insumo.codigo===i.codigo);const def=f?Math.ceil(f.faltante*100)/100:'';
      return `<tr><td data-label="Insumo">${esc(i.nombre)} (${esc(i.unidad)})</td><td data-label="Faltante" class="ap-num">${f?fmt(f.faltante):'—'}</td><td data-label="En Almacén" class="ap-num">${txtStockAlm(i.codigo,i.unidad)}</td>
        <td data-label="Cantidad"><input class="ap-sol-cant" data-insumo="${esc(i.codigo)}" data-unidad="${esc(i.unidad)}" onchange="apSolVal(this);apAvisoStock()" type="number" min="0" step="any" value="${esc(vals[i.codigo]!==undefined?vals[i.codigo]:def)}"></td></tr>`;}).join('');
    const otros=D.cache.insumos.filter(i=>i.activo!==false&&!faltantes.some(x=>x.insumo.codigo===i.codigo)&&!extra.includes(i.codigo));
    const motivoVacio=D.cache.factores.length?'Con lo registrado hoy no falta ningún insumo para este bloque (o lo que falta ya está pedido o en camino).':'Todavía no hay factores de consumo cargados (pestaña «Factores»): sin ellos el sistema no calcula lo que falta y no inventa valores.';
    const nueva=asist?`<div id="ap-sol-nueva"></div><h3 class="ap-h3">Preparar solicitud a Almacén</h3>${faltantesNetos(ctx).length?`<div class="ap-acc"><button type="button" class="ap-btn" onclick="apSolicitarFaltantes()">${ico('doc')} Solicitar todos los faltantes (${faltantesNetos(ctx).length})</button></div>`:''}
      <p class="ap-sub">${faltantes.length?'Se proponen los faltantes del bloque; ajusta las cantidades si hace falta.':'No hay faltantes calculados. '+motivoVacio+' Agrega a mano los insumos que necesites.'}</p>
      ${filasNueva?tabla(['Insumo','#Faltante','#En Almacén','Cantidad a solicitar'],filasNueva):vacio('Ningún insumo con faltante. Agrega abajo el que necesites.')}
      ${otros.length?`<div class="ap-acc ap-acc-agregar"><select id="ap-sol-extra"><option value="">Agregar otro insumo…</option>${otros.map(i=>`<option value="${esc(i.codigo)}">${esc(i.nombre)}</option>`).join('')}</select><button type="button" class="ap-btn ap-btn-o" onclick="apSolAgregar()">${ico('mas')} Agregar</button></div>`:''}
      <div id="ap-sol-aviso"></div>
      ${campo('Observaciones','<input id="ap-sol-obs" maxlength="200">','ap-ancho')}
      <div class="ap-acc"><button type="button" class="ap-btn ap-btn-o" onclick="apCrearSolicitud(false)">Guardar borrador</button><button type="button" class="ap-btn" onclick="apCrearSolicitud(true)">Enviar a Almacén</button></div>`:'';
    const sel=`<div class="ap-filtros-sol">${['abiertas','cerradas','todas'].map(k=>`<button type="button" class="ap-sub ${filtro===k?'ap-sub-act':''}" onclick="AP_set('solFiltro','${k}')">${{abiertas:'Abiertas',cerradas:'Cerradas',todas:'Todas'}[k]}</button>`).join('')}</div>`;
    const titulo=alm&&!asist?'Solicitudes por entregar':'Solicitudes'+(alm?' · vista de Almacén':'');
    const en=EN(),movs=en?en.movimientosRecientes(AP.fecha):[];
    const panel=movs.length?tarjeta('Entregas y devoluciones de hoy · en tiempo real',tabla(['Hora','Movimiento','Insumo','#Cantidad','Responsable','Solicitud'],movs.map(m=>`<tr><td data-label="Hora">${hora(m.en)}</td>
      <td data-label="Movimiento">${m.origen==='DEVOLUCION'?pill('Devolución de Producción','azul','flecha'):m.tipo==='ANULACION'?pill('Entrega anulada','gris','cerrar'):pill('Entrega a Producción','verde','check')}${m.sinStock?' '+pill('Sin stock autorizado','ambar'):''}</td>
      <td data-label="Insumo">${esc(insumoDe(m.insumo).nombre)}</td><td data-label="Cantidad" class="ap-num">${m.tipo==='ANULACION'?'—':fmt(m.cantidad)+' '+esc(m.unidad||insumoDe(m.insumo).unidad)}</td><td data-label="Responsable">${esc(m.usuario||'—')}</td><td data-label="Solicitud">${esc(m.solicitudId||'—')}</td></tr>`).join('')),{icono:'subida'}):'';
    const nota=pie('Solicitudes, reservas y entregas son operaciones distintas. Solo una recepción confirmada por Producción incrementa las existencias en Producción.');
    return `${nueva}<h3 class="ap-h3">${titulo}</h3>${sel}${filas?tabla(['Solicitud','Fecha','Ítems (entregado / pedido)','Espera','Estado'],filas,'ap-t-click'):vacio(filtro==='abiertas'?'No hay solicitudes abiertas.':'Sin solicitudes en los últimos 60 días.')}
      ${panel}${nota}`;
  }
  const pillSolicitud=e=>{const t=SOL_TXT[e]||e;return ['CERRADA','RECIBIDA'].includes(e)?pill(t,'verde','check'):e==='CANCELADA'?pill(t,'gris'):e==='OBSERVADA'?pill(t,'rojo','alerta'):pill(t,'gris','reloj_arena');};
  /* Avisa (sin impedir pedir) cuando lo solicitado supera el stock que Almacén tiene según el Inventario. */
  window.apAvisoStock=()=>{
    const el=document.getElementById('ap-sol-aviso');if(!el)return;
    const falt=[...document.querySelectorAll('.ap-sol-cant')].map(i=>({i,q:num(i.value),st:stockAlm(i.dataset.insumo)})).filter(x=>x.q>0&&x.st&&x.st.estado==='OK'&&x.q>Math.max(x.st.disponible,0))
      .map(x=>`${esc(insumoDe(x.i.dataset.insumo).nombre)}: pides ${fmt(x.q)} y Almacén tiene ${fmt(Math.max(x.st.disponible,0))}`);
    el.innerHTML=falt.length?pie('Almacén no alcanza para: '+falt.join(' · ')+'. Puedes enviar igual; Almacén entregará lo que tenga.','aviso'):'';
  };
  window.apCrearSolicitud=enviar=>{
    const items=[...document.querySelectorAll('.ap-sol-cant')].map(i=>({insumo:i.dataset.insumo,unidad:i.dataset.unidad,solicitado:i.value})).filter(i=>num(i.solicitado)>0);
    AP.solExtra=[];AP.solVal={};
    ejecutar(()=>D.crearSolicitud({fecha:AP.fecha,bloque:AP.bloque,items,observaciones:valor('ap-sol-obs'),enviar}),id=>'Solicitud '+id+(enviar?' enviada a Almacén.':' guardada como borrador.'));
  };
  window.apVerSolicitud=function(id){
    const s=D.cache.solicitudes.find(x=>x.id===id);if(!s)return;const ctx=contexto();AP.solSel=id;AP.solAbierta={id,version:num(s.version)};
    const asist=puede('asistenteProduccion'),alm=puede('moduloAlmacen');
    const columnaStock=alm&&['EN_PREPARACION','ENTREGADA_PARCIAL','SOLICITADA'].includes(s.estado);
    /* Lo pendiente de entregar, sin pasar de lo que Almacén tiene (si el Inventario no lo informa, lo pendiente completo). */
    const sugeridoEntrega=i=>{const pend=N.red(Math.max(num(i.solicitado)-num(i.entregado),0),4);const st=stockAlm(i.insumo);
      return st&&st.estado==='OK'?N.red(Math.min(pend,Math.max(st.disponible,0)),4)||'':pend||'';};
    const it=(s.items||[]).map(i=>`<tr><td data-label="Insumo">${esc(insumoDe(i.insumo).nombre)}</td><td data-label="Solicitado" class="ap-num">${fmt(i.solicitado)}</td><td data-label="Entregado" class="ap-num">${fmt(i.entregado)}</td><td data-label="Recibido" class="ap-num">${fmt(i.recibido)}</td>${columnaStock?`<td data-label="Stock Almacén" class="ap-num">${txtStockAlm(i.insumo,i.unidad)}</td>`:''}
      <td data-label="">${alm&&['EN_PREPARACION','ENTREGADA_PARCIAL'].includes(s.estado)?`<input class="ap-ent" data-insumo="${esc(i.insumo)}" data-pend="${N.red(Math.max(num(i.solicitado)-num(i.entregado),0),4)}" data-stock="${(()=>{const st=stockAlm(i.insumo);return st&&st.estado==='OK'?N.red(Math.max(st.disponible,0),4):'';})()}" oninput="apEntCheck()" type="number" min="0" step="any" placeholder="Entregar" value="${sugeridoEntrega(i)}">`:''}
      ${asist&&['ENTREGADA','ENTREGADA_PARCIAL','OBSERVADA'].includes(s.estado)&&num(i.entregado)>num(i.recibido)?`<input class="ap-rec" data-insumo="${esc(i.insumo)}" type="number" min="0" step="any" placeholder="Recibido" value="${N.red(num(i.entregado)-num(i.recibido),4)}">`:''}</td></tr>`).join('');
    const b=(estado,txt,cls)=>N.puedeTransicion(s.estado,estado)&&((N.ACTOR_ESTADO[estado]==='almacen'&&alm)||(N.ACTOR_ESTADO[estado]==='asistente'&&asist))
      ?`<button type="button" class="ap-btn ${cls||''}" onclick="apEstadoSolicitud('${esc(s.id)}','${estado}',${num(s.version)})">${txt}</button>`:'';
    const recibir=asist&&['ENTREGADA','ENTREGADA_PARCIAL','OBSERVADA'].includes(s.estado)
      ?`<div class="ap-form ap-form-2">${campo('Cuadro al que se destina',`<select id="ap-rec-cuadro"><option value="">— Elegir —</option>${ctx.cuadros.map(c=>`<option value="${esc(c.clave)}">${esc(nombreCuadro(c))}</option>`).join('')}</select>`)}${campo('Lote (opcional)','<input id="ap-rec-lote" maxlength="40">')}</div>
        <button type="button" class="ap-btn" onclick="apEstadoSolicitud('${esc(s.id)}','RECIBIDA',${num(s.version)})">Confirmar lo recibido</button>`:'';
    const entregar=alm&&['EN_PREPARACION','ENTREGADA_PARCIAL'].includes(s.estado)?`<button type="button" class="ap-btn ap-btn-o" onclick="apEntregarLoQueHay()">Entregar lo que hay</button><button type="button" class="ap-btn" onclick="apEstadoSolicitud('${esc(s.id)}','ENTREGADA',${num(s.version)})">Registrar entrega</button>`:'';
    // Entregas registradas (solo Almacén las anula): una fila por entrega, con su detalle y su estado.
    const entregasReg=(s.historial||[]).filter(h=>h&&h.entrega);
    const listaEntregas=alm&&['ENTREGADA','ENTREGADA_PARCIAL'].includes(s.estado)&&entregasReg.length?`<h4>Entregas registradas</h4>${tabla(['N.º','Cuándo','Responsable','Detalle','Estado',''],entregasReg.map((h,k)=>{
      const n=k+1,anulada=(s.historial||[]).some(x=>x&&x.anulaEntrega===n);
      const det=h.entregas?Object.entries(h.entregas).map(([i,q])=>`${esc(insumoDe(i).nombre)} ${fmt(q)}`).join(' · '):'<span class="ap-mut">sin detalle</span>';
      return `<tr><td data-label="N.º">${n}</td><td data-label="Cuándo">${esc(fechaHora(h.en))}</td><td data-label="Responsable">${esc(h.por||'—')}</td><td data-label="Detalle">${det}</td>
        <td data-label="Estado">${anulada?pill('Anulada','gris','cerrar'):pill('Vigente','verde','check')}</td><td data-label="">${!anulada&&h.entregas?`<button type="button" class="ap-btn ap-btn-o ap-btn-s" onclick="apAnularEntrega('${esc(s.id)}',${n},${num(s.version)})">Anular</button>`:''}</td></tr>`;}).join(''))}`:'';
    const hist=(s.historial||[]).map(h=>`<li>${fechaHora(h.en)} · <b>${esc(SOL_TXT[h.estado]||h.estado)}</b> · ${esc(h.por)}${h.nota?' — '+esc(h.nota):''}</li>`).join('');
    modal('Solicitud '+esc(s.id),`<p class="ap-sub">${esc(s.fecha)} · ${s.bloque==='NOCHE'?'Noche':'Mañana + Intermedio'} · ${pillSolicitud(s.estado)}${s.observaciones?' · '+esc(s.observaciones):''}</p>
      ${tabla(['Insumo','#Solicitado','#Entregado','#Recibido',...(columnaStock?['#Stock Almacén']:[]),''],it)}
      ${alm&&['EN_PREPARACION','ENTREGADA_PARCIAL'].includes(s.estado)&&EN()?`<div id="ap-sin-box" class="ap-form ap-form-2" style="display:none">${pie('Estás entregando más de lo que Almacén tiene según el Inventario. Solo si Almacén lo autoriza, escribe el motivo.','aviso')}${campo('Motivo para entregar sin stock suficiente (obligatorio)','<input id="ap-sin-stock" maxlength="160" placeholder="Ej.: llega camión mañana">','ap-ancho')}</div>`:''}
      ${campo('Nota (opcional)','<input id="ap-sol-nota" maxlength="200">','ap-ancho')}
      <div class="ap-acc ap-acc-wrap">${b('SOLICITADA','Enviar a Almacén')}${b('EN_PREPARACION','Iniciar preparación')}${entregar}${recibir}${b('OBSERVADA','Observar','ap-btn-o')}${b('CERRADA','Cerrar','ap-btn-o')}${b('CANCELADA','Cancelar','ap-btn-o')}</div>
      ${listaEntregas}
      <h4>Historial</h4><ul class="ap-hist">${hist}</ul>`);
  };
  /* Muestra el campo del motivo solo cuando lo escrito supera el stock de Almacén. */
  window.apAnularEntrega=(id,n,version)=>{
    const motivo=(prompt(`Anular la entrega n.º ${n} de la solicitud ${id}.\nEl material vuelve al stock de Almacén y la solicitud queda con menos entregado.\n\nMotivo (mínimo 5 caracteres):`,'')||'').trim();
    if(!motivo)return;
    if(typeof closeModal==='function')closeModal();
    ejecutar(()=>D.anularEntrega(id,n,version,motivo),'Entrega anulada: el stock volvió a Almacén y la solicitud se actualizó.');
  };
  window.apEntCheck=()=>{
    const box=document.getElementById('ap-sin-box');if(!box)return;
    const pasa=[...document.querySelectorAll('.ap-ent')].some(i=>i.dataset.stock!==''&&num(i.value)>num(i.dataset.stock)+1e-9);
    box.style.display=pasa?'':'none';if(!pasa){const m=document.getElementById('ap-sin-stock');if(m)m.value='';}
  };
  /* Rellena cada entrega con lo pendiente, sin pasar del stock (si el Inventario no informa, lo pendiente completo). */
  window.apEntregarLoQueHay=()=>{
    document.querySelectorAll('.ap-ent').forEach(i=>{const pend=num(i.dataset.pend),st=i.dataset.stock===''?pend:num(i.dataset.stock);const q=N.red(Math.min(pend,st),4);i.value=q>0?q:'';});
    window.apEntCheck();
  };
  window.apEstadoSolicitud=(id,estado,version)=>{
    const ent={},rec={};
    document.querySelectorAll('.ap-ent').forEach(i=>{if(num(i.value)>0)ent[i.dataset.insumo]=num(i.value);});
    document.querySelectorAll('.ap-rec').forEach(i=>{if(num(i.value)>0)rec[i.dataset.insumo]=num(i.value);});
    const ctx=contexto();const clave=valor('ap-rec-cuadro');const c=ctx.cuadros.find(x=>x.clave===clave);
    const motivoSS=valor('ap-sin-stock').trim();
    if(estado==='ENTREGADA'||estado==='ENTREGADA_PARCIAL'){
      const E=window.glacialAlmacenEnlace,en=EN();
      if(!Object.keys(ent).length){alert('Escribe lo que vas a entregar.');return;}
      const res=E&&en?E.resumenEntrega(ent,en.stockPorInsumo(Object.keys(ent))):[];
      const linea=r=>`• ${insumoDe(r.insumo).nombre}: ${fmt(r.cantidad)} ${insumoDe(r.insumo).unidad}`+(r.antes===null?' (sin dato de stock en el Inventario)':` · en Almacén ${fmt(r.antes)} → ${fmt(r.despues)}`);
      if(!confirm('¿Registrar esta entrega?\n\n'+(res.length?res.map(linea).join('\n'):Object.keys(ent).map(k=>`• ${insumoDe(k).nombre}: ${fmt(ent[k])}`).join('\n'))+'\n\nQueda en tránsito hasta que Producción confirme la recepción.'))return;
    }
    const datos={entregas:ent,autorizarSinStock:!!motivoSS,motivoSinStock:motivoSS,recepciones:rec,cuadro:clave,linea:c?c.linea:'',lote:valor('ap-rec-lote'),nota:valor('ap-sol-nota')};
    if(typeof closeModal==='function')closeModal();
    ejecutar(()=>D.cambiarEstadoSolicitud(id,estado,version,datos),'Solicitud actualizada.');
  };

  /* =========================================================== CONSUMO */
  function tabConsumo(ctx){
    const lineas=[...new Set(ctx.cuadros.map(c=>c.linea))];
    if(!AP.linea||!lineas.includes(AP.linea))AP.linea=lineas[0]||'';
    const deLinea=ctx.cuadros.filter(c=>c.linea===AP.linea);
    const marcas=[...new Set(deLinea.map(c=>c.marca))];
    if(!marcas.includes(AP.marca))AP.marca=marcas[0]||'';
    const deMarca=deLinea.filter(c=>c.marca===AP.marca);
    const pres=[...new Set(deMarca.map(c=>c.presentacion))];
    if(!pres.includes(AP.presentacion))AP.presentacion=pres[0]||'';
    const cands=deMarca.filter(c=>c.presentacion===AP.presentacion);
    if(!cands.some(c=>c.clave===AP.cuadro))AP.cuadro=cands[0]?cands[0].clave:'';
    const filasC=ctx.concil.filter(x=>x.cuadro.clave===AP.cuadro);
    if(!filasC.some(x=>x.insumo.codigo===AP.insumo))AP.insumo=filasC[0]?filasC[0].insumo.codigo:'';
    const x=filasC.find(f=>f.insumo.codigo===AP.insumo);
    const opt=(arr,sel,et)=>arr.map(v=>`<option value="${esc(v)}" ${v===sel?'selected':''}>${esc(et?et(v):v)}</option>`).join('');
    const sel=`<div class="ap-form ap-form-4">${campo('Línea',`<select onchange="apSel('linea',this.value)">${opt(lineas,AP.linea,nombreLinea)}</select>`)}
      ${campo('Producto',`<select onchange="apSel('marca',this.value)">${opt(marcas,AP.marca)}</select>`)}
      ${campo('Presentación',`<select onchange="apSel('presentacion',this.value)">${opt(pres,AP.presentacion,p=>presUI({linea:AP.linea,marca:AP.marca,presentacion:p}))}</select>`)}
      ${campo('Orden de producción',`<select onchange="apSel('cuadro',this.value)">${cands.map(c=>`<option value="${esc(c.clave)}" ${c.clave===AP.cuadro?'selected':''}>${esc(c.codigo+(c.reporte&&c.reporte.lote?' · lote '+c.reporte.lote:''))}</option>`).join('')}</select>`)}</div>
      ${filasC.length?`<div class="ap-chips" role="tablist" aria-label="Insumo">${filasC.map(f=>`<button type="button" class="ap-chip ${f.insumo.codigo===AP.insumo?'ap-chip-act':''}" onclick="apSel('insumo','${esc(f.insumo.codigo)}')">${esc(f.insumo.nombre)}</button>`).join('')}</div>`:''}`;
    if(!x)return `<section class="ap-card ap-card-grande"><h2 class="ap-h2 ap-h2-in">Consumo real y balance de material</h2>${sel}${vacio(ctx.cuadros.length?'Esta orden no tiene insumos con factor configurado (Insumos › Factores).':'Sin órdenes en este bloque.')}</section>`;
    const u=x.unidad,c=x.cuadro,lu=N.lineaInfo(c.linea).unidad,doc=x.doc,conf=doc&&doc.estado==='CONFIRMADA';
    const ed=puede('asistenteProduccion')&&!conf,val=puede('validarMermas');
    const signo=v=>v===null||v===undefined?'—':(v>0?'+':v<0?'−':'')+fmt(Math.abs(v));
    const fe=x.factor;
    const kpis=`<div class="ap-kpis ap-kpis-4">${kpi('fabrica','azul','Producción real',`${fmt(c.producido,0)} <em>${lu}</em>`)}
      ${kpi('cubo','verde','Consumo teórico',x.teorico===null?'—':`${fmt(x.teorico)} <em>${esc(u)}</em>`)}
      ${kpi('pesa','celeste','Consumo real',x.real===null?'—':`${fmt(x.real)} <em>${esc(u)}</em>`)}
      ${kpi('subida',x.desviacion===null?'gris':x.desviacion>0?'rojo':'verde','Desviación',x.desviacion===null?'—':`${signo(x.desviacion)} <em>${esc(u)}</em>`)}</div>`;
    const fila=(t,v,cls)=>`<tr class="${cls||''}"><td>${t}</td><td class="ap-num">${v}</td></tr>`;
    const inp=(id,v)=>ed?`<input id="${id}" type="number" step="any" value="${v!==null&&v!==undefined?v:''}">`:fmt(v);
    const bal=`<table class="ap-t ap-t-bal"><thead><tr><th>Concepto</th><th class="ap-num">${esc(u)}</th></tr></thead><tbody>
      ${fila('Saldo inicial utilizable',inp('ap-c-si',doc&&doc.saldoInicial))}${fila('Entrega confirmada',signo(x.mov.entregado))}${fila('Transferencias recibidas',signo(x.mov.transfEntrada))}
      ${fila('Devoluciones',x.mov.devuelto?'−'+fmt(x.mov.devuelto):'0')}${fila('Transferencias salientes',x.mov.transfSalida?'−'+fmt(x.mov.transfSalida):'0')}
      ${fila('Saldo final utilizable',inp('ap-c-sf',doc&&doc.saldoFinal))}${fila('<b>Consumo real</b>',`<b>${x.real===null?'Pendiente':fmt(x.real)}</b>`,'ap-tot')}
      ${fila('Merma validada (incluida en el real)',fmt(x.mermaValidada))}${fila('<b>Por revisar</b>',`<b>${x.porRevisar===null?'—':fmt(x.porRevisar)}</b>`,x.porRevisar?'ap-fila-ambar':'')}</tbody></table>
      ${x.pendiente?`<p class="ap-nota-pie">${esc(x.texto)}.</p>`:''}`;
    const est=CONC_TXT[x.estado]||CONC_TXT.SIN_REGISTRO;
    const rev=`<ul class="ap-checks"><li class="${fe?'':'ap-no'}">${ico(fe?'check':'alerta')}${fe?`Factor ${fe.origen==='codigo'?'migrado del código':'aprobado'} · versión ${num(fe.version)||1}`:'Falta el factor de consumo'}</li>
        <li class="${x.mov.entregado||x.mov.devuelto?'':'ap-gris'}">${ico(x.mov.entregado||x.mov.devuelto?'check':'info')}${x.mov.entregado||x.mov.devuelto?'Movimientos sin duplicados':'Sin entregas registradas para esta orden'}</li></ul>
      <div class="ap-estado">${pill(est[0],est[1],x.estado==='CONFIRMADA'?'check':x.estado==='EN_REVISION'?'alerta':'')}</div>
      ${campo('Observaciones (opcional)',ed?`<textarea id="ap-c-obs" rows="3" maxlength="400">${esc(doc&&doc.observaciones||'')}</textarea>`:`<p>${esc(doc&&doc.observaciones||'—')}</p>`,'ap-ancho')}
      <div class="ap-acc ap-acc-wrap">${ed?`<button type="button" class="ap-btn ap-btn-o ap-btn-gris" onclick="apConc('BORRADOR')">Guardar borrador</button><button type="button" class="ap-btn" onclick="apConc('ENVIAR')">Enviar a revisión</button>`:''}
        ${val&&!conf&&doc?`<button type="button" class="ap-btn" onclick="apConc('CONFIRMAR')" ${x.pendiente?'disabled title="Faltan saldos o factor"':''}>Confirmar consumo</button>`:''}${val&&conf?`<button type="button" class="ap-btn ap-btn-o" onclick="apConc('REABRIR')">Reabrir</button>`:''}</div>`;
    const reservas=`<p class="ap-nota-pie">${ico('info')} Una reserva no es consumo: al registrar el consumo se libera la reserva sin duplicar el descuento.</p>`;
    const todas=ctx.concil.map(f=>`<tr class="ap-clic ${f.cuadro.clave===AP.cuadro&&f.insumo.codigo===AP.insumo?'ap-sel':''}" onclick="apSel('todo','${esc(f.cuadro.linea)}|${esc(f.cuadro.clave)}|${esc(f.insumo.codigo)}')">
      <td data-label="Orden">${esc(nombreLinea(f.cuadro.linea)+' · '+f.cuadro.codigo+' · '+f.cuadro.marca)}</td><td data-label="Insumo">${esc(f.insumo.nombre)}</td><td data-label="Teórico" class="ap-num">${f.teorico===null?'Sin factor':fmt(f.teorico)}</td>
      <td data-label="Real" class="ap-num">${f.real===null?'Pendiente':fmt(f.real)}</td><td data-label="Por revisar" class="ap-num ${f.porRevisar?'ap-ambar-tx':''}">${f.porRevisar===null?'—':fmt(f.porRevisar)}</td>
      <td data-label="Estado">${pill((CONC_TXT[f.estado]||CONC_TXT.SIN_REGISTRO)[0],(CONC_TXT[f.estado]||CONC_TXT.SIN_REGISTRO)[1])}</td></tr>`).join('');
    return `<section class="ap-card ap-card-grande"><div class="ap-tit-acc"><h2 class="ap-h2 ap-h2-in">Consumo real y balance de material</h2>${puede('asistenteProduccion')?`<div class="ap-acc"><button type="button" class="ap-btn" onclick="apCierreTurno()">${ico('check')} Cierre del turno (todo en una tabla)</button></div>`:''}</div>${sel}${kpis}
        <div class="ap-2 ap-2-par">${tarjeta('Balance conciliado',bal)}${tarjeta('Revisión del consumo',rev)}</div>${reservas}
        ${pie('La desviación no se convierte automáticamente en merma.','aviso')}</section>
      <details class="ap-card ap-desplegable"><summary><h3>Todas las conciliaciones del bloque (${ctx.concil.length})</h3></summary>${tabla(['Orden','Insumo','#Teórico','#Real','#Por revisar','Estado'],todas,'ap-t-click')}</details>`;
  }
  window.apSel=(k,v)=>{
    if(k==='todo'){const [l,...r]=v.split('|');const ins=r.pop();const clave=r.join('|');const ctx=contexto();const c=ctx.cuadros.find(x=>x.clave===clave);
      AP.linea=l;AP.cuadro=clave;AP.insumo=ins;if(c){AP.marca=c.marca;AP.presentacion=c.presentacion;}}
    else{AP[k]=v;const orden=['linea','marca','presentacion','cuadro','insumo'];orden.slice(orden.indexOf(k)+1).forEach(x=>{AP[x]='';});}
    pintar();
  };
  window.apAbrirConsumo=v=>{AP.tab='consumo';window.apSel('todo',v);window.scrollTo(0,0);};
  /* Cierre del turno: todas las conciliaciones no confirmadas del bloque en una sola tabla (saldo inicial y final por fila). */
  window.apCierreTurno=()=>{
    const ctx=contexto();const filas=ctx.concil.filter(c=>!(c.doc&&c.doc.estado==='CONFIRMADA'));
    if(!filas.length){AP.msg={tipo:'ok',texto:'No hay consumos por cerrar en este bloque.'};pintar();return;}
    AP.cierreFilas=filas.map(c=>({cuadro:c.cuadro.clave,linea:c.cuadro.linea,insumo:c.insumo.codigo,unidad:c.unidad,version:c.doc?num(c.doc.version):0,obs:c.doc&&c.doc.observaciones||''}));
    const f=filas.map((c,k)=>{const d=c.doc||{};const inp=(id,v)=>`<input class="ap-in-s" id="${id}-${k}" type="number" step="any" min="0" value="${v===null||v===undefined?'':esc(v)}">`;
      const est=c.doc?(c.doc.estado==='EN_REVISION'?pill('En revisión','ambar'):pill('Borrador','ambar')):pill('Sin registro','gris');
      return `<tr><td data-label="Línea">${esc(nombreLinea(c.cuadro.linea))}</td><td data-label="Cuadro">${esc(c.cuadro.codigo)} · ${esc(c.cuadro.marca)} ${esc(presUI(c.cuadro))}</td><td data-label="Insumo">${esc(c.insumo.nombre)}</td>
        <td data-label="Saldo inicial" class="ap-num">${inp('ap-ct-ini',d.saldoInicial)}</td><td data-label="Entregado" class="ap-num">${fmt(c.mov.entregado+c.mov.transfEntrada-c.mov.transfSalida)}</td><td data-label="Devuelto" class="ap-num">${fmt(c.mov.devuelto)}</td>
        <td data-label="Saldo final" class="ap-num">${inp('ap-ct-fin',d.saldoFinal)}</td><td data-label="Teórico" class="ap-num">${c.teorico===null?'—':fmt(c.teorico)+' '+esc(c.unidad)}</td><td data-label="Estado">${est}</td></tr>`;}).join('');
    modal('Cierre del turno · '+esc(AP.fecha)+' · '+(AP.bloque==='NOCHE'?'Noche':'Mañana + Intermedio'),`<p class="ap-sub">Escribe el saldo inicial y final de cada insumo. «Guardar» deja borradores; «Guardar y enviar a revisión» envía las filas que ya tienen los dos saldos.</p>
      ${tabla(['Línea','Cuadro','Insumo','#Saldo inicial','#Entregado','#Devuelto','#Saldo final','#Teórico','Estado'],f,'ap-t-plano')}
      <div id="ap-ct-msg"></div><div class="ap-acc ap-acc-wrap"><button type="button" class="ap-btn ap-btn-o" onclick="closeModal()">Cancelar</button>
      <button type="button" class="ap-btn ap-btn-o" onclick="apCierreGuardar(false)">Guardar borradores</button><button type="button" class="ap-btn" onclick="apCierreGuardar(true)">Guardar y enviar a revisión</button></div>`,'ap-modal-xl');
  };
  window.apCierreGuardar=async enviar=>{
    const filas=AP.cierreFilas||[];const msg=document.getElementById('ap-ct-msg');let ok=0,env=0;const err=[];
    for(let k=0;k<filas.length;k++){
      const f=filas[k],ini=valor('ap-ct-ini-'+k),fin=valor('ap-ct-fin-'+k);
      if(ini===''&&fin==='')continue;
      const completa=ini!==''&&fin!=='';
      try{await D.guardarConciliacion({fecha:AP.fecha,bloque:AP.bloque,linea:f.linea,cuadro:f.cuadro,insumo:f.insumo,unidad:f.unidad,saldoInicial:ini===''?null:num(ini),saldoFinal:fin===''?null:num(fin),observaciones:f.obs,nota:'Cierre del turno'},
        enviar&&completa?'ENVIAR':'BORRADOR',f.version);ok++;if(enviar&&completa)env++;}
      catch(e){err.push(`${insumoDe(f.insumo).nombre}: ${D.mensajeError(e)}`);}
    }
    if(!ok&&!err.length){if(msg)msg.innerHTML=pie('No escribiste ningún saldo.','aviso');return;}
    if(err.length){if(msg)msg.innerHTML=`<div class="ap-msg ap-msg-error" role="alert">${ico('alerta')}<span>${ok} guardada(s); ${err.length} con error: ${esc(err.join(' · '))}</span></div>`;return;}
    if(typeof closeModal==='function')closeModal();
    AP.msg={tipo:'ok',texto:`Cierre guardado: ${ok} fila(s)${env?`, ${env} enviadas a revisión`:''}.`};pintar();
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

  /* =========================================================== MERMA */
  function tabMerma(ctx){
    const m=ctx.mermas.slice().sort((a,b)=>String(a.linea).localeCompare(String(b.linea)));
    const val=puede('validarMermas'),ed=puede('asistenteProduccion');
    const obs=D.cache.insumos.map(i=>({i,s:N.saldoInsumo(D.cache.movimientos,i.codigo)})).filter(x=>x.s.observado>0);
    const EST={PENDIENTE:['Pendiente','gris'],VALIDADA:['Validada','verde'],RECHAZADA:['Rechazada','rojo']};
    const filas=m.map(x=>`<tr><td data-label="Línea"><b>${esc(nombreLinea(x.linea))}</b></td><td data-label="Insumo">${x.categoria==='PRODUCTO'?'Producto terminado':esc(insumoDe(x.insumo).nombre)}<small class="ap-mut ap-blk">${esc(x.marca)} ${esc(presUI({linea:x.linea,marca:x.marca,presentacion:x.presentacion}))}</small></td>
      <td data-label="Cantidad" class="ap-num">${fmt(x.cantidad)} ${esc(x.unidad)}</td><td data-label="Motivo">${esc(x.causa)}${x.observaciones?`<small class="ap-mut ap-blk">${esc(x.observaciones)}</small>`:''}</td>
      <td data-label="Estado">${pill(EST[x.estado][0],EST[x.estado][1])}${x.validadoPor?`<small class="ap-mut ap-blk">${esc(x.validadoPor)}</small>`:''}
        ${val&&x.estado==='PENDIENTE'?`<span class="ap-acc-in"><button type="button" class="ap-btn ap-btn-s" onclick="apValidarMerma('${esc(x.id)}','VALIDADA',${num(x.version)})">Validar</button><button type="button" class="ap-btn ap-btn-o ap-btn-s" onclick="apValidarMerma('${esc(x.id)}','RECHAZADA',${num(x.version)})">Rechazar</button></span>`:''}</td></tr>`).join('');
    const lineas=[...new Set(ctx.cuadros.map(c=>c.linea))];
    if(!lineas.includes(AP.mermaLinea))AP.mermaLinea=lineas[0]||'';
    const insIni=D.cache.insumos.filter(i=>i.activo!==false).sort((a,b)=>a.nombre.localeCompare(b.nombre))[0];
    const form=ed?tarjeta('Nueva merma',`<div class="ap-form ap-form-2">${campo('Línea',`<select id="ap-m-linea" onchange="AP_set('mermaLinea',this.value)">${lineas.map(l=>`<option value="${l}" ${l===AP.mermaLinea?'selected':''}>${esc(nombreLinea(l))}</option>`).join('')}</select>`)}
        ${campo('Producto (orden)',`<select id="ap-m-cuadro">${ctx.cuadros.filter(c=>c.linea===AP.mermaLinea).map(c=>`<option value="${esc(c.clave)}">${esc(c.codigo+' · '+c.marca+' '+presUI(c))}</option>`).join('')}</select>`)}
        ${campo('Tipo','<select id="ap-m-cat" onchange="apMermaCat()"><option value="MATERIAL">Materia prima / empaque</option><option value="PRODUCTO">Producto terminado</option></select>')}
        ${campo('Insumo',`<select id="ap-m-insumo" onchange="apMermaUnidad()">${opcionesInsumos(insIni&&insIni.codigo)}</select>`,'ap-m-mat')}
        ${campo('Cantidad',`<span class="ap-con-unidad"><input id="ap-m-cant" type="number" min="0" step="any"><b id="ap-m-und">${esc(insIni?insIni.unidad:'')}</b></span>`)}
        ${campo('Motivo',`<select id="ap-m-causa">${D.causasMerma().map(c=>`<option>${esc(c)}</option>`).join('')}</select>`)}
        ${campo('Etapa',`<select id="ap-m-etapa"><option value="">—</option>${D.etapasMerma().map(c=>`<option>${esc(c)}</option>`).join('')}</select>`)}${campo('Lote afectado','<input id="ap-m-lote" maxlength="40">')}</div>
        ${campo('Descripción','<textarea id="ap-m-obs" rows="2" maxlength="300" placeholder="Material descartado durante el ajuste"></textarea>','ap-ancho')}
        <div class="ap-campo ap-ancho"><span>Adjuntar foto o documento</span>${evidenciaHTML('ap-m-evid')}</div>
        ${campo('Estado','<span class="ap-ctl-ico"><i class="ap-dot ap-d-gris"></i><select disabled><option>Pendiente de validación</option></select></span>','ap-ancho')}
        <button type="button" class="ap-btn ap-btn-full" onclick="apGuardarMerma()">Guardar registro</button>`):'';
    return `<div class="ap-tit-acc"><h2 class="ap-h2">Mermas y material observado</h2>${ed?`<button type="button" class="ap-btn" onclick="apEnfocar('ap-m-cant')">${ico('mas')} Registrar merma</button>`:''}</div>
      <div class="ap-kpis ap-kpis-3">${kpi('doc','naranja','Mermas pendientes',m.filter(x=>x.estado==='PENDIENTE').length)}${kpi('check','verde','Mermas validadas',m.filter(x=>x.estado==='VALIDADA').length)}
        ${kpi('alerta','ambar','Material observado',`${obs.length} <em>registro${obs.length===1?'':'s'}</em>`)}</div>
      <div class="ap-2 ${form?'ap-2-merma':''}"><div>${tarjeta('Registro del turno',(filas?tabla(['Línea','Insumo','#Cantidad','Motivo','Estado'],filas):vacio('Sin mermas en este bloque.'))
          +(obs.length?'<h4 class="ap-h4-obs">Material observado</h4>'+tabla(['Material','#Cantidad','Estado','Disponibilidad'],obs.map(x=>`<tr><td data-label="Material">${esc(x.i.nombre)} <span class="ap-pill ap-p-ambar">Observado</span></td><td data-label="Cantidad" class="ap-num">${fmt(x.s.observado)} ${esc(x.i.unidad)}</td>
          <td data-label="Estado">${pill('Pendiente de evaluación','ambar')}</td><td data-label="Disponibilidad"><span class="ap-pill ap-p-rojo">No disponible para programación</span></td></tr>`).join(''))
          +'<p class="ap-nota-pie">'+ico('info')+' El material observado no se considera merma hasta su evaluación.</p>':''))}
        ${configMerma()}</div>${form}</div>`;
  }
  /* Causas y etapas configurables (apParametros/merma): una por línea. Las mermas ya registradas conservan su causa. */
  function configMerma(){
    if(!D.puedeConfigurarMerma())return '';
    const p=D.cache.parametrosMerma;
    const det=p&&p.actualizadoPor?`<p class="ap-nota-pie">${ico('info')} Última modificación: ${esc(p.actualizadoPor)} · versión ${num(p.version)}</p>`:`<p class="ap-nota-pie">${ico('info')} Hoy se usan las causas predeterminadas.</p>`;
    return `<details class="ap-card ap-desplegable"${AP.confMerma?' open':''} ontoggle="apConfMerma(this.open)"><summary><h3>Configurar causas y etapas de merma</h3></summary>
      <div class="ap-form ap-form-2">${campo('Causas (una por línea)',`<textarea id="ap-cm-causas" rows="9" maxlength="1300">${esc(D.causasMerma().join('\n'))}</textarea>`)}
        ${campo('Etapas (una por línea)',`<textarea id="ap-cm-etapas" rows="9" maxlength="1300">${esc(D.etapasMerma().join('\n'))}</textarea>`)}</div>
      <p class="ap-nota-pie">Con la causa «Otros» se exige describir la merma. Quitar una causa no cambia las mermas ya registradas.</p>${det}
      <div class="ap-acc ap-acc-wrap"><button type="button" class="ap-btn" onclick="apGuardarConfigMerma()">Guardar causas y etapas</button>
        <button type="button" class="ap-btn ap-btn-o" onclick="apHistorialDoc('apParametros','merma')">Historial</button></div></details>`;
  }
  window.apConfMerma=v=>{AP.confMerma=!!v;};
  window.apGuardarConfigMerma=()=>{
    const lista=id=>valor(id).split('\n').map(x=>x.trim()).filter(Boolean);
    const p=D.cache.parametrosMerma;
    ejecutar(()=>D.guardarParametrosMerma({causas:lista('ap-cm-causas'),etapas:lista('ap-cm-etapas')},p?p.version:0),'Causas y etapas de merma guardadas.');
  };
  window.apMermaCat=()=>{const p=valor('ap-m-cat')==='PRODUCTO';document.querySelectorAll('.ap-m-mat').forEach(e=>{e.hidden=p;});
    const und=document.getElementById('ap-m-und');if(und){const ctx=contexto();const c=ctx.cuadros.find(x=>x.clave===valor('ap-m-cuadro'));und.textContent=p?(c?N.lineaInfo(c.linea).unidad:'UND'):insumoDe(valor('ap-m-insumo')).unidad;}};
  window.apMermaUnidad=()=>{const und=document.getElementById('ap-m-und');if(und)und.textContent=insumoDe(valor('ap-m-insumo')).unidad;};
  window.apGuardarMerma=()=>{
    const ctx=contexto();const c=ctx.cuadros.find(x=>x.clave===valor('ap-m-cuadro'));const cat=valor('ap-m-cat');
    const ins=cat==='PRODUCTO'?{codigo:'PRODUCTO',unidad:c?N.lineaInfo(c.linea).unidad:'UND'}:insumoDe(valor('ap-m-insumo'));
    ejecutar(async()=>{
      const m={id:D.nuevoId('mer'),fecha:AP.fecha,bloque:AP.bloque,linea:c?c.linea:'',cuadro:c?c.clave:'',marca:c?c.marca:'',presentacion:c?c.presentacion:'',
        categoria:cat,insumo:ins.codigo,unidad:ins.unidad,cantidad:valor('ap-m-cant'),causa:valor('ap-m-causa'),etapa:valor('ap-m-etapa'),lote:valor('ap-m-lote')||(c&&c.reporte?c.reporte.lote:''),observaciones:valor('ap-m-obs')};
      const err=N.validarMerma(m,D.causasMerma());if(err.length){const e=new Error(err.join(' · '));e.codigo='VALIDACION';throw e;}
      m.evidencia=await subirEvidencia('ap-m-evid');
      return D.registrarMerma(m);
    },'Merma registrada: pendiente de validación.');
  };
  window.apValidarMerma=(id,estado,version)=>{
    let nota='';if(estado==='RECHAZADA'){nota=prompt('Motivo del rechazo (mínimo 5 caracteres):');if(nota===null)return;}
    ejecutar(()=>D.validarMerma(id,estado,version,nota),estado==='VALIDADA'?'Merma validada.':'Merma rechazada.');
  };

  /* =========================================================== HISTORIAL Y REPORTES */
  function tabHistorial(ctx){
    const ev=[];
    const anulados=new Set(D.cache.movimientos.filter(m=>m.tipo==='ANULACION').map(m=>m.anulaA));
    const TIPO_MOV={CONTEO:'Conteo físico',RECEPCION:'Recepción de Almacén',DEVOLUCION:'Devolución a Almacén',TRANSFERENCIA_ENTRADA:'Transferencia recibida',TRANSFERENCIA_SALIDA:'Transferencia enviada',CONSUMO:'Consumo confirmado',ANULACION:'Anulación'};
    D.cache.movimientos.filter(m=>m.fecha===AP.fecha).forEach(m=>ev.push({en:m.en,tipo:'Movimiento',evento:TIPO_MOV[m.tipo]||m.tipo,linea:m.linea,insumo:m.insumo,cant:m.tipo==='ANULACION'?'':fmt(m.cantidad)+' '+(m.unidad||insumoDe(m.insumo).unidad),por:m.usuario,
      estado:anulados.has(m.opId)?['Anulado','gris','cerrar']:m.tipo==='CONTEO'?['Verificado','verde','check']:m.tipo==='CONSUMO'?['Confirmado','verde','check']:['Registrado','gris','doc']}));
    // Requerimientos y reservas: una fila por insumo (suma del bloque), calculadas desde la programación vigente.
    const porIns=new Map();
    ctx.req.filter(f=>f.estado==='OK').forEach(f=>{const k=f.insumo.codigo;if(!porIns.has(k))porIns.set(k,{insumo:f.insumo,req:0,res:0,ordenes:0});const x=porIns.get(k);
      x.req+=f.requerido;x.ordenes++;if(N.cuadroAbierto(f.cuadro))x.res+=f.pendiente;});
    porIns.forEach(x=>{
      if(x.req>0)ev.push({en:null,tipo:'Requerimiento',evento:`Requerimiento (${x.ordenes} orden${x.ordenes===1?'':'es'})`,linea:'',insumo:x.insumo.codigo,cant:fmt(N.red(x.req,4))+' '+x.insumo.unidad,por:'Sistema',estado:['Calculado','gris','doc']});
      if(x.res>0)ev.push({en:null,tipo:'Reserva',evento:'Reserva de órdenes abiertas',linea:'',insumo:x.insumo.codigo,cant:fmt(N.red(x.res,4))+' '+x.insumo.unidad,por:'Sistema',estado:['Activa','ambar','reloj']});
    });
    D.cache.solicitudes.filter(s=>s.fecha===AP.fecha).forEach(s=>(s.items||[]).forEach(i=>{const h=(s.historial||[])[0]||{};ev.push({en:h.en,tipo:'Solicitud',evento:'Solicitud a Almacén',linea:s.linea,insumo:i.insumo,cant:fmt(i.solicitado)+' '+i.unidad,por:h.por,
      estado:['CERRADA','RECIBIDA'].includes(s.estado)?['Recibida','verde','check']:['Pendiente','gris','reloj_arena'],sol:s.id});}));
    ctx.mermas.forEach(m=>ev.push({en:(m.historial||[])[0]&&m.historial[0].en,tipo:'Merma',evento:'Merma · '+m.causa,linea:m.linea,insumo:m.insumo,cant:fmt(m.cantidad)+' '+m.unidad,por:m.creadoPor,
      estado:m.estado==='VALIDADA'?['Validada','verde','check']:m.estado==='RECHAZADA'?['Rechazada','rojo','cerrar']:['Pendiente','gris','reloj_arena']}));
    ctx.concil.filter(c=>c.doc).forEach(c=>{const h=(c.doc.historial||[]).slice(-1)[0]||{};ev.push({en:h.en,tipo:'Consumo',evento:'Conciliación '+c.cuadro.codigo,linea:c.cuadro.linea,insumo:c.insumo.codigo,cant:c.real===null?'':fmt(c.real)+' '+c.unidad,por:h.por,
      estado:c.doc.estado==='CONFIRMADA'?['Confirmada','verde','check']:c.doc.estado==='EN_REVISION'?['En revisión','ambar','reloj']:['Borrador','gris','doc']});});
    const en=EN();
    if(en)en.cache.movs.filter(m=>m.fecha===AP.fecha).forEach(m=>ev.push({en:m.en,tipo:'Entrega de Almacén',evento:m.tipo==='ANULACION'?'Anulación de entrega de Almacén':'Entrega de Almacén',linea:'',insumo:m.insumo,cant:fmt(m.cantidad)+' '+(m.unidad||insumoDe(m.insumo).unidad),por:m.usuario,
      estado:m.tipo==='ANULACION'?['Anulada','gris','cerrar']:m.sinStock?['Sin stock autorizado','ambar','alerta']:['Entregada','verde','check'],sol:m.solicitudId}));
    const tipos=[...new Set(ev.map(e=>e.tipo))],resps=[...new Set(ev.map(e=>e.por).filter(Boolean))];
    const lista=ev.filter(e=>(AP.histSistema||!['Requerimiento','Reserva'].includes(e.tipo)||AP.histTipo===e.tipo)&&(!AP.histTipo||e.tipo===AP.histTipo)&&(!AP.histLinea||e.linea===AP.histLinea)&&(!AP.histResp||e.por===AP.histResp)).sort((a,b)=>num(b.en)-num(a.en));
    const exp=puede('reporteGeneral');
    const filtros=`<section class="ap-card"><div class="ap-filtros">${campoIco('Fecha','calendario',`<input type="date" value="${esc(AP.fecha)}" onchange="apCtx('fecha',this.value)">`)}
      ${campo('Línea',`<select onchange="AP_set('histLinea',this.value)">${opcionesLineas(AP.histLinea,true)}</select>`)}
      ${campo('Tipo',`<select onchange="AP_set('histTipo',this.value)"><option value="">Todos</option>${tipos.map(t=>`<option ${t===AP.histTipo?'selected':''}>${esc(t)}</option>`).join('')}</select>`)}
      ${campo('Responsable',`<select onchange="AP_set('histResp',this.value)"><option value="">Todos</option>${resps.map(t=>`<option ${t===AP.histResp?'selected':''}>${esc(t)}</option>`).join('')}</select>`)}
      <label class="ap-chk"><input type="checkbox" ${AP.histSistema?'checked':''} onchange="AP_set('histSistema',this.checked)"> Mostrar cálculos del sistema</label>
      <div class="ap-acc"><button type="button" class="ap-btn ap-btn-o ap-btn-gris" onclick="window.print()">${ico('imprimir')} Resumen imprimible</button></div></div></section>`;
    const filas=lista.map(e=>`<tr class="${e.sol?'ap-clic':''}" ${e.sol?`onclick="AP_set('solSel','${esc(e.sol)}')"`:''}><td data-label="Hora">${e.en?hora(e.en):'—'}</td><td data-label="Evento">${esc(e.evento)}</td><td data-label="Insumo">${esc(e.insumo?insumoDe(e.insumo).nombre:'—')}</td>
      <td data-label="Cantidad">${esc(e.cant||'—')}</td><td data-label="Responsable">${esc(e.por||'—')}</td><td data-label="Estado">${pill(e.estado[0],e.estado[1],e.estado[2])}</td></tr>`).join('');
    const sols=D.cache.solicitudes.filter(s=>s.fecha===AP.fecha);
    const s=sols.find(x=>x.id===AP.solSel)||sols.slice().sort((a,b)=>String(b.id).localeCompare(String(a.id)))[0];
    const det=s?tarjeta('Detalle de solicitud '+esc(s.id),tabla(['Insumo','#Solicitado','#Entregado','Estado'],(s.items||[]).map(i=>`<tr><td data-label="Insumo">${esc(insumoDe(i.insumo).nombre)}</td><td data-label="Solicitado" class="ap-num">${fmt(i.solicitado)} ${esc(i.unidad)}</td>
        <td data-label="Entregado" class="ap-num">${fmt(i.entregado)} ${esc(i.unidad)}</td><td data-label="Estado">${num(i.recibido)>=num(i.solicitado)&&num(i.solicitado)>0?pill('Recibido','verde','check'):num(i.entregado)>0?pill('Parcial','ambar','reloj'):pill('Pendiente','gris','reloj_arena')}</td></tr>`).join(''))
        +`<div class="ap-info ap-info-sm">${ico('info','ap-info-ico')}<span>Solo una entrega confirmada incrementa existencias en Producción.</span></div>`,{accion:`<button type="button" class="ap-link" onclick="apVerSolicitud('${esc(s.id)}')">Abrir ${ico('flecha')}</button>`})
      :tarjeta('Detalle de solicitud',vacio('Sin solicitudes en esta fecha.'));
    const ultC=D.cache.movimientos.filter(m=>m.tipo==='CONTEO'&&m.fecha===AP.fecha).sort((a,b)=>num(b.en)-num(a.en))[0];
    const aud=tarjeta('Auditoría',ultC?`<div class="ap-aud"><span class="ap-card-ico ap-grande-ico ap-cuadro-ico">${ico('doc')}</span><div><h4>Conteo ${esc(String(ultC.opId).slice(-6).toUpperCase())}</h4>
        <p class="ap-mut">Verificado: ${esc(ultC.usuario||'—')} · ${hora(ultC.en)}</p>
        <p>${esc(insumoDe(ultC.insumo).nombre)}: ${fmt(ultC.cantidad)} ${esc(ultC.unidad||'')}<br>Ajuste vinculado al conteo<br>Versiones y correcciones conservadas</p>
        <button type="button" class="ap-link" onclick="apHistorialDoc('apMovimientos','${esc(ultC.opId)}')">Ver antes y después ${ico('flecha')}</button></div></div>`:vacio('Sin conteos en esta fecha.'));
    const reportes=window.glacialAsistenteReportes?window.glacialAsistenteReportes.tarjeta():'';
    return `<h2 class="ap-h2">Historial y reportes</h2>${reportes}${filtros}${tarjeta('Movimientos y decisiones',filas?tabla(['Hora','Evento','Insumo','Cantidad','Responsable','Estado'],filas):vacio('Sin movimientos en esta fecha.'))}
      <div class="ap-2 ap-2-hist">${det}${aud}</div>`;
  }
  window.apExportar=()=>{
    if(!window.glacialReporteGeneral){AP.msg={tipo:'error',texto:'No se cargó el generador del Reporte General.'};pintar();return;}
    ejecutar(()=>window.glacialReporteGeneral.exportar(AP.fecha),r=>'Reporte General generado: '+r);
  };

  /* ---------- formularios de catálogo (modales) ---------- */
  window.apMigrar=directo=>{if(!directo&&!confirm('¿Copiar al catálogo los factores fijos del Nuevo registro? No se borra ni se pisa nada.'))return;
    ejecutar(()=>D.migrarFactoresDelCodigo(),r=>`Factores activados: ${r.creados} creados, ${r.existentes} ya existían.`);};
  window.apInsumoForm=codigo=>{
    const i=D.cache.insumos.find(x=>x.codigo===codigo)||{codigo:'',nombre:'',unidad:'UND',tipo:'otro',activo:true,version:0};
    modal(codigo?'Editar insumo':'Nuevo insumo',`<div class="ap-form ap-form-2">${campo('Código',`<input id="ap-i-cod" value="${esc(i.codigo)}" ${codigo?'readonly':''} maxlength="40">`)}${campo('Nombre',`<input id="ap-i-nom" value="${esc(i.nombre)}" maxlength="80">`)}
      ${campo('Unidad',`<select id="ap-i-und">${N.UNIDADES.map(u=>`<option ${u===i.unidad?'selected':''}>${u}</option>`).join('')}</select>`)}${campo('Tipo',`<select id="ap-i-tipo">${N.TIPOS_INSUMO.map(u=>`<option ${u===i.tipo?'selected':''}>${u}</option>`).join('')}</select>`)}
      ${campo('Estado',`<select id="ap-i-act"><option value="1">Activo</option><option value="0" ${i.activo===false?'selected':''}>Inactivo</option></select>`)}
      ${campo('Código SAP (enlace con el Inventario de insumos)',`<input id="ap-i-sap" list="ap-i-sap-lista" value="${esc(i.itemCode||'')}" maxlength="40" placeholder="Opcional · ej. código del artículo en SAP">
        <datalist id="ap-i-sap-lista">${(EN()?(i.itemCode?EN().articulos():EN().sugerir(i.nombre).concat(EN().articulos().slice(0,40))):[]).map(a=>`<option value="${esc(a.itemCode)}">${esc(a.nombre)}</option>`).join('')}</datalist>`,'ap-ancho')}</div>
      <p class="ap-sub">${EN()&&EN().articulos().length?'Con el código SAP, cada entrega de Almacén descuenta su stock en el Inventario.':'Importa un corte de stock en el Inventario de insumos para poder elegir el artículo.'}</p>
      <div class="ap-acc"><button type="button" class="ap-btn" onclick="apGuardarInsumo(${num(i.version)})">Guardar</button></div>`);
  };
  window.apGuardarInsumo=version=>{const d={codigo:valor('ap-i-cod').trim().toUpperCase(),nombre:valor('ap-i-nom'),unidad:valor('ap-i-und'),tipo:valor('ap-i-tipo'),itemCode:valor('ap-i-sap').trim().toUpperCase(),activo:valor('ap-i-act')==='1'};
    if(typeof closeModal==='function')closeModal();ejecutar(()=>D.guardarInsumo(d,version),'Insumo guardado.');};
  /* Marca y presentación del factor: «* Todas» o una de las listas del Nuevo registro (01-config.js) para la línea elegida, sin texto libre. */
  const listaDeLinea=(tabla,linea)=>{let t=null;try{t=(0,eval)(tabla);}catch(_){}      // constantes globales de 01-config.js
    return [...new Set(((t&&t[linea])||[]).map(x=>String(x).trim()).filter(Boolean))];};
  const opcionesProducto=(lista,sel)=>`<option value="*">* Todas</option>`+lista.map(x=>`<option value="${esc(x)}" ${x===sel?'selected':''}>${esc(x)}</option>`).join('');
  window.apFactorLinea=()=>{const l=valor('ap-f-lin');
    const m=document.getElementById('ap-f-mar'),p=document.getElementById('ap-f-pre');
    if(m)m.innerHTML=opcionesProducto(listaDeLinea('MARCAS_POR_LINEA',l),'*');if(p)p.innerHTML=opcionesProducto(listaDeLinea('PRESENTACIONES_POR_LINEA',l),'*');};
  window.apFactorForm=id=>{
    const a=D.cache.factores.find(f=>f.id===id);const hoy=GlacialFecha.fechaOperativa(D.ahora())/* FECHA-OPERATIVA: antes UTC (desde las 19:00 Lima daba mañana) */;
    const f=a?{...a,vigenteDesde:hoy}:{insumo:'',linea:'PET1',marca:'*',presentacion:'*',base:'PALETA',cantidadBase:1,factor:'',vigenteDesde:hoy};
    // Sin insumos activos en el catálogo el desplegable quedaría en blanco: se explica cómo cargarlos y no se deja guardar.
    const sinInsumos=!a&&!D.cache.insumos.some(i=>i.activo!==false);
    modal(a?'Nueva versión del factor':'Nuevo factor',`${a?`<p class="ap-sub">La versión actual (${fmt(a.factor,4)} / ${fmt(a.cantidadBase,0)} ${a.base}) queda vigente hasta el día anterior; los datos históricos siguen usando su valor.</p>`:''}
      ${sinInsumos?`<div class="ap-info ap-info-acc">${ico('info','ap-info-ico')}<div><b>No hay insumos en el catálogo.</b> Usa «Migrar factores del código» o «Agregar insumo» en Insumos → Factores y vuelve a abrir este formulario.</div></div>`:''}
      <div class="ap-form ap-form-2">${campo('Línea',`<select id="ap-f-lin" ${a?'disabled':'onchange="apFactorLinea()"'}>${opcionesLineas(f.linea,false)}</select>`)}
      ${campo('Insumo',`<select id="ap-f-ins" ${a?'disabled':''}>${opcionesInsumos(f.insumo)}</select>`)}${campo('Marca',a?`<input id="ap-f-mar" value="${esc(f.marca)}" readonly>`:`<select id="ap-f-mar">${opcionesProducto(listaDeLinea('MARCAS_POR_LINEA',f.linea),f.marca)}</select>`)}
      ${campo('Presentación',a?`<input id="ap-f-pre" value="${esc(f.presentacion)}" readonly>`:`<select id="ap-f-pre">${opcionesProducto(listaDeLinea('PRESENTACIONES_POR_LINEA',f.linea),f.presentacion)}</select>`)}${campo('Base',`<select id="ap-f-base"><option value="PALETA" ${f.base==='PALETA'?'selected':''}>Por paleta</option><option value="UND" ${f.base==='UND'?'selected':''}>Por unidad producida</option></select>`)}
      ${campo('Cantidad base',`<input id="ap-f-cb" type="number" min="0" step="any" value="${esc(f.cantidadBase)}">`)}${campo('Factor (en la unidad del insumo)',`<input id="ap-f-fac" type="number" min="0" step="any" value="${esc(f.factor)}">`)}
      ${campo('Vigente desde',`<input id="ap-f-desde" type="date" value="${esc(f.vigenteDesde)}">`)}</div>
      <p class="ap-sub">Consumo = (producido ÷ cantidad base) × factor, o (paletas ÷ cantidad base) × factor. Factor 0 = «No aplica».</p>
      <div class="ap-acc"><button type="button" class="ap-btn" onclick="apGuardarFactor('${a?esc(a.id):''}')" ${sinInsumos?'disabled':''}>Guardar</button></div>`);
  };
  window.apGuardarFactor=anteriorId=>{
    const a=D.cache.factores.find(f=>f.id===anteriorId);
    const d={insumo:a?a.insumo:valor('ap-f-ins'),linea:a?a.linea:valor('ap-f-lin'),marca:a?a.marca:(valor('ap-f-mar').trim()||'*'),presentacion:a?a.presentacion:(valor('ap-f-pre').trim()||'*'),
      base:valor('ap-f-base'),cantidadBase:valor('ap-f-cb'),factor:valor('ap-f-fac'),vigenteDesde:valor('ap-f-desde')};
    if(typeof closeModal==='function')closeModal();ejecutar(()=>D.guardarFactor(d,anteriorId||null),'Factor guardado (versión con vigencia).');
  };
  window.apHistorialDoc=async(coleccion,id)=>{
    try{const h=await D.auditoriaDe(coleccion,id);
      const resumen=o=>o?esc(JSON.stringify(Object.fromEntries(Object.entries(o).filter(([k])=>['factor','vigenteHasta','estado','cantidad','saldoInicial','saldoFinal','tipo','insumo'].includes(k))))):'—';
      modal('Antes y después',h.length?`<ul class="ap-hist">${h.map(x=>`<li>${fechaHora(x.en&&x.en.toMillis?x.en.toMillis():x.en)} · <b>${esc(x.operacion)}</b> · ${esc(x.usuario)}<br><small>antes: ${resumen(x.antes)} → después: ${resumen(x.despues)}</small></li>`).join('')}</ul>`:vacio('Sin historial.'));}
    catch(e){AP.msg={tipo:'error',texto:D.mensajeError(e)};pintar();}
  };

  /* ---------- modal ---------- */
  function modal(titulo,cuerpo,clase){
    const raiz=document.getElementById('modal-root');if(!raiz)return;
    raiz.innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal ap-modal ${clase||''}" role="dialog" aria-modal="true" aria-label="${titulo}">
      <div class="modal-head"><h3>${titulo}</h3><button class="modal-close" onclick="closeModal()" aria-label="Cerrar">✕</button></div><div class="modal-body ap">${estilos()}${cuerpo}</div></div></div>`;
  }

  /* ---------- render ---------- */
  function cargando(){
    const C=D.cache;const COL={insumos:'apInsumos',factores:'apFactores',movimientos:'apMovimientos',solicitudes:'apSolicitudes',mermas:'apMermas',conciliaciones:'apConciliaciones',coordinaciones:'apCoordinaciones',parametrosMerma:'apParametros'};
    const fallan=Object.keys(C.error).filter(k=>C.error[k]);
    // Se nombran las colecciones que fallan: así se ve si falta publicar solo una parte de las reglas (p. ej. una colección nueva).
    if(fallan.length)return `<div class="ap-msg ap-msg-error" role="alert">${ico('alerta')}<span>No se pudieron leer los datos del Asistente: ${esc(C.error[fallan[0]])} Colecciones afectadas: ${esc(fallan.map(k=>COL[k]||k).join(', '))}.</span><button type="button" class="ap-link" onclick="apReintentar()">Reintentar</button></div>`;
    return ['insumos','factores','movimientos'].every(k=>C.listo[k])?'':`<div class="ap-msg ap-msg-info">${ico('reloj')}<span>Consultando los datos del Asistente…</span></div>`;
  }
  window.apReintentar=()=>{D.detener();D.escucharTodo(AP.fecha);pintar();};
  function pintar(){
    if(state.currentTab!=='asistente')return;
    const main=document.getElementById('main');if(!main)return;
    contextoInicial();D.escucharTodo(AP.fecha);
    if(!puede('ver_asistente')&&puede('moduloAlmacen')){AP.tab='insumos';AP.sub='solicitudes';}
    const ctx=contexto();
    const ev=window.glacialEvidenciasDatos;
    const evVisible=!!(ev&&ev.puedeVer());                                   // la bandeja usa los permisos del Inventario de insumos
    if((AP.tab==='evidencias'||AP.tab==='lotes')&&!evVisible)AP.tab='resumen';
    if(AP.tab!=='evidencias'&&AP.tab!=='lotes'&&ev)ev.detener();                // la escucha en vivo solo está abierta mientras se mira la bandeja o los lotes
    const tz=window.glacialTrazabilidadDatos;
    if(AP.tab!=='lotes'&&AP.tab!=='evidencias'&&tz)tz.detener();
    const tabs=PESTANAS.filter(([k])=>(k!=='evidencias'&&k!=='lotes')||evVisible).map(([k,t,i])=>`<button type="button" role="tab" class="ap-tab ${AP.tab===k?'ap-tab-act':''}" aria-selected="${AP.tab===k}" onclick="AP_set('tab','${k}')">${ico(i)}<span>${t}</span></button>`).join('');
    const cuerpo={resumen:tabResumen,seguimiento:tabSeguimiento,insumos:tabInsumos,evidencias:tabEvidencias,lotes:tabLotes,consumo:tabConsumo,merma:tabMerma,historial:tabHistorial}[AP.tab]||tabResumen;
    const modoVista=!!(window.glacialVista&&window.glacialVista.activo&&window.glacialVista.activo());
    const noche=AP.bloque==='NOCHE';
    const scroll=window.scrollY;
    main.innerHTML=`<section class="ap">${estilos()}<header class="ap-cab"><h1>ASISTENTE DE PRODUCCIÓN</h1>
      <div class="ap-cab-der"><label class="ap-cab-ctl"><span class="ap-cab-etq">Fecha</span><span class="ap-cab-caja">${ico('calendario')}<input type="date" value="${esc(AP.fecha)}" onchange="apCtx('fecha',this.value)" aria-label="Fecha operativa"></span></label>
      <span class="ap-cab-sep" aria-hidden="true"></span>
      <label class="ap-cab-ctl"><span class="ap-cab-etq">Turno</span><span class="ap-cab-caja">${ico(noche?'luna':'sol','ap-sol')}<select onchange="apCtx('bloque',this.value)" aria-label="Turno"><option value="DIA" ${!noche?'selected':''}>MAÑANA + INTERMEDIO</option><option value="NOCHE" ${noche?'selected':''}>NOCHE</option></select></span></label>
      ${modoVista||(!puede('asistenteProduccion')&&!puede('moduloAlmacen'))?'<span class="ap-chip-vista">Solo consulta</span>':''}</div></header>
      <nav class="ap-tabs" role="tablist">${tabs}</nav>${cargando()}${aviso()}${cuerpo(ctx)}</section>`;
    window.scrollTo(0,scroll);
  }
  window.apCtx=(k,v)=>{if(k==='fecha'&&!/^\d{4}-\d{2}-\d{2}$/.test(v))return;AP[k]=v;AP.cuadro='';AP.insumo='';AP.solSel='';pintar();};
  /* ---------- tiempo real ----------
     Todo lo que guarda otra persona (entrega de Almacén, devolución, solicitud nueva, recepción…) llega solo por las escuchas en vivo.
     · Si no estás escribiendo, la pantalla se actualiza sola.
     · Si estás escribiendo o tienes una ventana abierta, NO se te quita lo que haces: sale «Hay información nueva» y se actualiza al terminar.
     · Aparece un aviso emergente con lo que pasó (quién, qué y cuánto). */
  const miUid=()=>{try{return (firebase.auth().currentUser||{}).uid||'';}catch(_){return '';}};
  const bloqueado=()=>!!document.querySelector('.ap input:focus,.ap select:focus,.ap textarea:focus,#modal-root .modal');
  function aviso_(texto,tipo){
    let c=document.getElementById('ap-toasts');
    if(!c){c=document.createElement('div');c.id='ap-toasts';c.setAttribute('aria-live','polite');c.style.cssText='position:fixed;top:14px;right:14px;z-index:90;display:grid;gap:8px;max-width:360px';document.body.appendChild(c);}
    const d=document.createElement('div');
    const col={ok:'#166534',aviso:'#92400e',info:'#0b5cc4'}[tipo||'info'];
    d.style.cssText=`background:#fff;border:1px solid #dde6ef;border-left:5px solid ${col};border-radius:10px;padding:10px 14px;box-shadow:0 8px 24px rgba(15,37,71,.18);font-size:14px;cursor:pointer`;
    d.textContent=texto;d.onclick=()=>d.remove();c.appendChild(d);setTimeout(()=>d.remove(),9000);
  }
  let firmaSol=null;
  function vigilar(){
    const C=D.cache;if(!C.listo.solicitudes)return;
    const sig=new Map(C.solicitudes.map(x=>[x.id,x.estado+'|'+num(x.version)]));
    if(firmaSol===null){firmaSol=sig;return;}
    const yo=miUid(),alm=puede('moduloAlmacen'),asist=puede('asistenteProduccion');
    sig.forEach((v,id)=>{
      if(firmaSol.get(id)===v)return;
      const x=C.solicitudes.find(y=>y.id===id);if(!x)return;
      const h=(x.historial||[]).slice(-1)[0]||{};if(h.uid&&h.uid===yo)return;                 // lo que hice yo no se avisa
      const items=(x.items||[]).map(i=>`${insumoDe(i.insumo).nombre} ${fmt(i.solicitado)}`).join(', ');
      const nuevo=firmaSol.get(id)===undefined;
      if(h.anulaEntrega)aviso_(`${h.por||'Almacén'} anuló la entrega n.º ${h.anulaEntrega} de la solicitud ${id}${h.nota?' ('+h.nota.replace(/^Entrega n\.º \d+ anulada: /,'')+')':''}`,'aviso');
      else if(nuevo&&x.estado==='SOLICITADA'&&alm)aviso_(`Nueva solicitud ${id} de ${h.por||'Producción'}: ${items}`,'info');
      else if(['ENTREGADA','ENTREGADA_PARCIAL'].includes(x.estado)&&(asist||puede('ver_asistente')))aviso_(`${h.por||'Almacén'} entregó ${x.estado==='ENTREGADA'?'completa':'parcialmente'} la solicitud ${id}: ${(x.items||[]).filter(i=>num(i.entregado)>0).map(i=>`${insumoDe(i.insumo).nombre} ${fmt(i.entregado)}`).join(', ')}`,'ok');
      else if(x.estado==='EN_PREPARACION'&&asist)aviso_(`${h.por||'Almacén'} empezó a preparar la solicitud ${id}`,'info');
      else if(x.estado==='RECIBIDA'&&alm)aviso_(`${h.por||'Producción'} confirmó la recepción de ${id}`,'ok');
      else if(x.estado==='OBSERVADA'&&alm)aviso_(`${h.por||'Producción'} observó la solicitud ${id}${h.nota?': '+h.nota:''}`,'aviso');
      else if(x.estado==='CANCELADA'&&alm)aviso_(`${h.por||'Producción'} canceló la solicitud ${id}`,'aviso');
    });
    firmaSol=sig;
    // La solicitud abierta en pantalla cambió mientras se miraba.
    const ab=AP.solAbierta,cur=ab&&C.solicitudes.find(y=>y.id===ab.id);
    const modal_=document.querySelector('#modal-root .ap-modal');
    if(ab&&cur&&modal_&&num(cur.version)!==ab.version&&!document.getElementById('ap-sol-cambio')){
      const b=document.createElement('div');b.id='ap-sol-cambio';b.className='ap-msg ap-msg-info';
      b.innerHTML=`${ico('reloj')}<span>Esta solicitud cambió (${esc(SOL_TXT[cur.estado]||cur.estado)}). </span><button type="button" class="ap-link" onclick="apVerSolicitud('${esc(cur.id)}')">Ver lo nuevo</button>`;
      const body=modal_.querySelector('.modal-body');if(body)body.insertBefore(b,body.firstChild);
    }
  }
  function cartelPendiente(visible){
    let c=document.getElementById('ap-pend');
    if(!visible){if(c)c.remove();return;}
    if(c)return;
    c=document.createElement('div');c.id='ap-pend';c.style.cssText='position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:80;background:#0f2547;color:#fff;border-radius:999px;padding:10px 18px;box-shadow:0 8px 24px rgba(0,0,0,.3);font-size:14px;display:flex;gap:12px;align-items:center';
    c.innerHTML='<span>Hay información nueva</span><button type="button" style="background:#fff;color:#0f2547;border:0;border-radius:999px;padding:5px 12px;cursor:pointer;font-weight:600" onclick="apActualizarYa()">Actualizar ahora</button>';
    document.body.appendChild(c);
  }
  window.apActualizarYa=()=>{AP.pendiente=false;cartelPendiente(false);const a=document.activeElement;if(a&&a.blur)a.blur();pintar();};
  const repintar=()=>{
    if(typeof state==='undefined'||state.currentTab!=='asistente'){cartelPendiente(false);return;}
    vigilar();
    if(bloqueado()){AP.pendiente=true;cartelPendiente(true);return;}
    AP.pendiente=false;cartelPendiente(false);pintar();
  };
  setInterval(()=>{if(AP.pendiente&&typeof state!=='undefined'&&state.currentTab==='asistente'&&!bloqueado()){AP.pendiente=false;cartelPendiente(false);pintar();}},1500);
  D.alCambiar(repintar);
  // 81-almacen-enlace-datos.js se carga después de este archivo: la suscripción se hace en cuanto existe.
  const enganchar=()=>{const EN_=window.glacialAlmacenEnlaceDatos;if(!EN_){setTimeout(enganchar,500);return;}
    EN_.alCambiar(repintar);
    EN_.alEvento(ev=>{const yo=miUid();ev.forEach(e=>{const m=e.mov;if(m.uid&&m.uid===yo)return;
      const ins=insumoDe(m.insumo).nombre,cant=`${fmt(m.cantidad)} ${m.unidad||insumoDe(m.insumo).unidad}`;
      if(e.tipo==='DEVOLUCION')aviso_(`${m.usuario||'Producción'} devolvió a Almacén ${cant} de ${ins}`,'info');});});};
  enganchar();
  ['onPaletasUpdated','onProgramacionesUpdated'].forEach(n=>{const a=globalThis[n];if(typeof a!=='function')return;globalThis[n]=function(){const r=a.apply(this,arguments);if(state.currentTab==='asistente'&&!document.querySelector('.ap input:focus,.ap select:focus,.ap textarea:focus'))pintar();return r;};});

  /* Ayudantes para 83-asistente-reportes-pantalla.js (se carga después). */
  window.glacialAsistenteUI={esc,fmt,ico,pill,pie,vacio,tabla,tarjeta,campo,modal,nombreLinea,puede,AP,pintar,ejecutar};

  /* ---------- navegación (patrón de 43-bitacora-mantenimiento.js) ---------- */
  window.goAsistente=function(tab,sub){
    if(!puede('ver_asistente')&&!puede('moduloAlmacen')){alert('No tienes permiso para ver el Asistente de Producción.');return;}
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    if(tab==='solicitudes'||tab==='parametros'){AP.tab='insumos';AP.sub=tab==='parametros'?'factores':'solicitudes';}
    else if(tab){AP.tab=tab;if(sub)AP.sub=sub;}
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
      // Almacén es un grupo (index.html): «Solicitudes de Producción» es su acceso para quien tiene el permiso moduloAlmacen (no es un segundo inventario).
      const sol=document.getElementById('btn-almacen-solicitudes');
      if(sol){const m=!!(state.user&&puede('moduloAlmacen'));sol.hidden=!m;sol.style.display=m?'':'none';
        const act=m&&state.currentTab==='asistente'&&!puede('ver_asistente');sol.classList.toggle('active',act);if(act)sol.setAttribute('aria-current','page');else sol.removeAttribute('aria-current');}
      return r;
    };
  }

  function estilos(){return `<style id="ap-estilos">
.ap-p-azul{background:#e0f2fe;color:#075985}.ap-acc-agregar{display:flex;gap:8px;margin:10px 0}.ap-acc-agregar select{flex:1;padding:9px;border:1px solid var(--ap-linea);border-radius:8px}.ap-filtros-sol{display:flex;gap:6px;margin:6px 0 10px}
.ap-modal-xl{max-width:1240px!important;width:96%!important}.ap-2-rep{display:grid;grid-template-columns:1fr 1fr;gap:14px}.ap-rep{border:1px solid var(--ap-linea);border-radius:12px;padding:14px}.ap-rep h4{margin:0 0 4px;display:flex;gap:8px;align-items:center}
.ap-chks{display:flex;flex-wrap:wrap;gap:6px 14px;margin:6px 0 10px}.ap-chk{display:inline-flex;gap:6px;align-items:center;font-size:14px}.ap-in-s{width:110px;padding:6px 8px;border:1px solid var(--ap-linea);border-radius:8px;text-align:right}.ap-in-s:disabled{background:#f1f4f8;color:#6b7a8a}
.ap-obs{list-style:none;margin:0 0 12px;padding:0;display:grid;gap:6px}.ap-obs li{font-size:14px}.ap-edit{border:2px solid #f0b429}@media(max-width:760px){.ap-2-rep{grid-template-columns:1fr}}
.ap{--ap-azul:#0b5cc4;--ap-azul-o:#0a4fa8;--ap-linea:#dde6ef;--ap-mut:#5f7382;--ap-nar:#e8710a;color:#0f2547;font-size:15px}
.ap [hidden]{display:none!important}
.ap .ap-ico{width:20px;height:20px;flex:0 0 auto;vertical-align:middle}
.ap-cab{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:0 0 14px}.ap-cab h1{margin:0;font-size:32px;font-weight:800;letter-spacing:-.01em;color:#0f2547}
.ap-cab-der{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap}.ap-cab-ctl{display:flex;flex-direction:column;gap:3px}.ap-cab-etq{font-size:12px;color:var(--ap-mut)}
.ap-cab-caja{display:flex;align-items:center;gap:8px;min-height:42px;padding:0 10px;border:1px solid var(--ap-linea);border-radius:10px;background:#fff;color:#334a66}
.ap .ap-cab-caja input,.ap .ap-cab-caja select{border:0;background:transparent;min-height:38px;padding:0 2px;font-weight:600;color:#0f2547;font-size:14px;width:auto}
.ap .ap-sol{color:#f5a400;width:22px;height:22px}.ap-cab-sep{width:1px;height:38px;background:var(--ap-linea)}.ap-chip-vista{padding:8px 14px;border-radius:10px;background:#dbeafe;color:#0b5cc4;font-size:13px;font-weight:700}
.ap-tabs{display:flex;gap:4px;overflow-x:auto;background:#fff;border:1px solid var(--ap-linea);border-radius:12px;padding:0 10px;margin-bottom:16px;scrollbar-width:thin;box-shadow:0 2px 10px rgba(15,37,71,.04)}
.ap-tab{flex:0 0 auto;display:flex;align-items:center;gap:8px;border:0;background:none;padding:14px 16px;font:inherit;font-size:15px;font-weight:500;color:#334a66;border-bottom:3px solid transparent;cursor:pointer;min-height:52px}
.ap .ap-tab .ap-ico{width:19px;height:19px;color:#51667f}.ap-tab-act{color:var(--ap-nar);font-weight:700;border-bottom-color:var(--ap-nar)}.ap .ap-tab-act .ap-ico{color:var(--ap-nar)}
.ap-h2{margin:6px 0 14px;font-size:30px;font-weight:800;color:#0f2547;letter-spacing:-.01em}.ap .ap-h2-in{margin-top:0}.ap-h3{margin:18px 0 10px;font-size:17px;font-weight:700}
.ap-tit-acc{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:6px}.ap-tit-acc .ap-h2{margin-bottom:8px}
.ap-card{background:#fff;border:1px solid var(--ap-linea);border-radius:14px;padding:18px;margin-bottom:16px;box-shadow:0 3px 14px rgba(15,37,71,.05);min-width:0}
.ap-card .ap-card{box-shadow:none}
.ap-card-in{padding:0;overflow:hidden}.ap-card-in>h3{margin:0;padding:14px 16px;font-size:18px;border-bottom:1px solid var(--ap-linea)}.ap-card-in .ap-tw{border:0;border-radius:0}
.ap-card-cab{display:flex;align-items:center;gap:12px;margin-bottom:14px}.ap-card-cab h3{margin:0;font-size:21px;font-weight:700;flex:1}
.ap-card-ico{display:inline-grid;place-items:center;color:var(--ap-azul)}.ap .ap-card-ico .ap-ico{width:28px;height:28px}
.ap-grande-ico{width:60px;height:60px;border-radius:50%;background:#e8f1fd;flex:0 0 auto}.ap .ap-grande-ico .ap-ico{width:32px;height:32px}.ap-cuadro-ico{border-radius:12px;background:#eef3fa;color:#1d3557}
.ap-kpis{display:grid;gap:14px;margin-bottom:16px}.ap-kpis-4{grid-template-columns:repeat(4,minmax(0,1fr))}.ap-kpis-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.ap-kpi{display:flex;gap:16px;align-items:center;background:#fff;border:1px solid var(--ap-linea);border-radius:14px;padding:18px;box-shadow:0 3px 14px rgba(15,37,71,.05);min-width:0}
.ap-kpi-ico{display:grid;place-items:center;width:64px;height:64px;border-radius:50%;flex:0 0 auto}.ap .ap-kpi-ico .ap-ico{width:32px;height:32px}
.ap-kpi-tx{min-width:0}.ap-kpi-tx>span{display:block;font-size:16px;color:#334a66}.ap-kpi-tx b{display:block;font-size:34px;line-height:1.15;font-weight:800;color:#0f2547}.ap-kpi-tx b em{font-style:normal;font-size:20px;font-weight:700}
.ap-kpi-tx small{display:block;color:var(--ap-mut);font-size:12px}
.ap-k-azul .ap-kpi-ico{background:#e3eefc;color:#0b5cc4}.ap-k-rojo .ap-kpi-ico{background:#fde3e3;color:#d92d20}.ap-k-ambar .ap-kpi-ico{background:#fff1d6;color:#e8a100}
.ap-k-gris .ap-kpi-ico{background:#eceff3;color:#344054}.ap-k-verde .ap-kpi-ico{background:#dcf5e6;color:#12a150}.ap-k-naranja .ap-kpi-ico{background:#ffe2c7;color:#ef6c00}.ap-k-celeste .ap-kpi-ico{background:#e1efff;color:#2563eb}
.ap-card-grande .ap-kpi{box-shadow:none}.ap-card-grande .ap-k-azul{background:#eef5ff;border-color:#cfe0f7}.ap-card-grande .ap-k-verde{background:#eefaf3;border-color:#cfeedb}.ap-card-grande .ap-k-celeste{background:#f0f6ff;border-color:#d6e5fa}
.ap-card-grande .ap-k-rojo{background:#fff1f1;border-color:#f6cfcf}.ap-card-grande .ap-k-rojo b,.ap-card-grande .ap-k-rojo .ap-kpi-tx>span{color:#c0281c}.ap-card-grande .ap-k-verde b{color:#0b7a3b}.ap-card-grande .ap-k-celeste b{color:#1d4ed8}
.ap-kpis-3 .ap-k-naranja{background:#fff6ee;border-color:#fbd9bd}.ap-kpis-3 .ap-k-verde{background:#f0faf4;border-color:#cdeed9}.ap-kpis-3 .ap-k-ambar{background:#fffaeb;border-color:#f6e2a8}
.ap-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.ap-2>*{min-width:0}.ap-2-par{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)}.ap-2-merma{grid-template-columns:minmax(0,1.75fr) minmax(0,1fr)}.ap-2-hist{grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)}
.ap-tw{overflow-x:auto;border:1px solid var(--ap-linea);border-radius:10px}.ap-t{width:100%;border-collapse:collapse;font-size:14.5px;min-width:0}
.ap .ap-t th{background:#eef3fa;text-align:left;padding:11px 14px;font-size:14px;font-weight:700;color:#1d3557;white-space:nowrap;text-transform:none;letter-spacing:0}.ap .ap-t th.ap-num{text-align:right}.ap-t td{padding:12px 14px;border-top:1px solid #e7eef4;vertical-align:middle}
.ap-num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.ap-t-click tr,.ap-clic{cursor:pointer}.ap-sel td{background:#eef6ff}
.ap-cel{display:inline-block;min-width:90px;padding:6px 10px;border-radius:6px;font-weight:700;text-align:right}.ap-cel-rojo{background:#fde3e3;color:#b42318}.ap-cel-verde{background:#dcf5e6;color:#0b7a3b}
.ap-t-bal td{padding:10px 14px}.ap .ap-t-bal input{width:120px;text-align:right;min-height:38px;padding:6px 10px}.ap-tot td{background:#e6f0fc;font-size:16px}.ap-fila-ambar td{background:#fff7e6}.ap-ambar-tx{color:#b26a00;font-weight:700}
.ap-rojo{color:#d92d20;font-weight:700}.ap-anulado td{color:#9aa8b5;text-decoration:line-through}.ap-mut{color:var(--ap-mut)}.ap-blk{display:block;font-size:12.5px}
.ap-pill{display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border-radius:8px;font-size:13.5px;font-weight:600;white-space:nowrap;margin:1px 0}
.ap-pill i{width:9px;height:9px;border-radius:50%;background:currentColor;opacity:.85}.ap .ap-pill .ap-ico{width:17px;height:17px}
.ap-p-curso{background:#ffedd5;color:#9a3412}.ap-p-pausa,.ap-p-prog{background:#fef3c7;color:#92400e}.ap-p-rojo{background:#fee2e2;color:#b42318}.ap-p-verde{background:#dcfce7;color:#166534}
.ap-p-gris{background:#eceff3;color:#344054}.ap-p-ambar{background:#fff1c2;color:#8a5a00}
.ap-p-verde i{background:#22c55e}.ap-p-gris i{background:#98a2b3}.ap-p-ambar i{background:#f5a400}.ap-p-rojo i{background:#ef4444}.ap-p-curso i{background:#f97316}.ap-p-prog i{background:#f5a400}
.ap-p-verde .ap-ico{color:#16a34a}
.ap-dot{display:inline-block;width:10px;height:10px;border-radius:50%;flex:0 0 auto}.ap-d-verde{background:#16a34a}.ap-d-rojo{background:#dc2626}.ap-d-gris{background:#98a2b3}
.ap-form{display:grid;gap:12px;margin-bottom:12px}.ap-form-2{grid-template-columns:repeat(2,minmax(0,1fr))}.ap-form-3{grid-template-columns:repeat(3,minmax(0,1fr))}.ap-form-4{grid-template-columns:repeat(4,minmax(0,1fr))}
.ap-campo{display:flex;flex-direction:column;gap:6px;font-size:14px;color:#334a66;min-width:0}.ap-campo>span:first-child{font-weight:500}.ap-ancho{grid-column:1/-1;margin-bottom:12px}
.ap input,.ap select,.ap textarea{font:inherit;font-size:15px;padding:9px 12px;border:1px solid #c9d6e2;border-radius:8px;min-height:44px;background:#fff;color:#0f2547;max-width:100%;width:100%;box-sizing:border-box}
.ap textarea{min-height:76px;resize:vertical}.ap select:disabled,.ap input[readonly]{background:#f7f9fc;color:#475467}
.ap-ctl-ico{display:flex;align-items:center;border:1px solid #c9d6e2;border-radius:8px;background:#fff;overflow:hidden}.ap .ap-ctl-ico>.ap-ico{margin:0 10px 0 12px;color:#475467}.ap-ctl-ico>.ap-dot{margin:0 4px 0 14px}
.ap .ap-ctl-ico input,.ap .ap-ctl-ico select{border:0;border-left:1px solid #e3e9f0;border-radius:0}.ap .ap-ctl-ico>.ap-dot+select{border-left:0;background:#fff}
.ap-con-unidad{display:flex}.ap .ap-con-unidad input{border-radius:8px 0 0 8px}.ap-con-unidad b{display:grid;place-items:center;min-width:60px;padding:0 10px;border:1px solid #c9d6e2;border-left:0;border-radius:0 8px 8px 0;background:#f7f9fc;font-weight:500}
.ap-acc{display:flex;gap:10px;justify-content:flex-end;align-items:center;flex-wrap:wrap}.ap-acc-wrap{margin-top:12px}.ap-acc-in{display:inline-flex;gap:6px;margin-left:8px}
.ap-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--ap-azul);background:var(--ap-azul);color:#fff;border-radius:9px;padding:10px 20px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;min-height:46px;box-shadow:0 2px 6px rgba(11,92,196,.18)}
.ap-btn:hover{background:var(--ap-azul-o)}.ap-btn-o{background:#fff;color:var(--ap-azul);box-shadow:none}.ap-btn-o:hover{background:#f1f6fd}.ap-btn-gris{color:#1d3557;border-color:#c9d6e2}
.ap-btn-s{padding:6px 12px;min-height:36px;font-size:13.5px}.ap-btn-full{width:100%;margin-top:14px;min-height:50px;font-size:16px}.ap-btn[disabled]{opacity:.5;cursor:not-allowed}
.ap-btn-excel{background:#f0faf4;color:#12733b;border-color:#5cc285;box-shadow:none}.ap-btn-excel:hover{background:#e3f6ea}
.ap-link{display:inline-flex;align-items:center;gap:6px;background:none;border:0;color:var(--ap-azul);font:inherit;font-weight:600;cursor:pointer;padding:6px 0;white-space:nowrap}.ap .ap-link .ap-ico{width:17px;height:17px}
.ap-vacio{padding:18px;color:var(--ap-mut);font-size:14px;text-align:center;border:1px dashed var(--ap-linea);border-radius:10px}
.ap-sub{color:var(--ap-mut);font-size:14px;margin:4px 0 10px}.ap-nota-pie{margin:10px 0 0;color:var(--ap-mut);font-size:13.5px;display:flex;gap:6px;align-items:center}.ap .ap-nota-pie .ap-ico{width:17px;height:17px;color:var(--ap-azul)}
.ap-linea-conteo{margin:0 0 10px;font-size:15px;color:var(--ap-mut)}.ap-linea-conteo b{color:inherit}.ap-h4-obs{margin:14px 0 6px;font-size:15px}
.ap-pie{display:flex;gap:12px;align-items:center;padding:12px 18px;border-radius:12px;margin:0 0 16px;font-size:15px;line-height:1.4}.ap .ap-pie>.ap-ico{width:24px;height:24px}
.ap-pie-info{background:#eef5fd;border:1px solid #d6e6f8;color:#1d3557}.ap .ap-pie-info>.ap-ico{color:var(--ap-azul)}.ap-pie-aviso{background:#fff6dc;border:1px solid #f3dc91;color:#5b4300;font-weight:600}.ap .ap-pie-aviso>.ap-ico{color:#d18a00}
.ap-pie small{color:var(--ap-mut);font-weight:400}
.ap-info{display:flex;gap:12px;align-items:flex-start;background:#eef5fd;border:1px solid #cfe2fb;border-radius:10px;padding:14px 16px;color:#1d3557}.ap-info ul{margin:0;padding-left:18px;line-height:1.9}
.ap .ap-info-ico{width:26px;height:26px;color:#fff;background:var(--ap-azul);border-radius:50%;padding:3px;box-sizing:border-box}.ap-info-acc{align-items:center;margin-bottom:12px}.ap-info-acc>div{flex:1}.ap-info-sm{margin-top:12px;align-items:center}
.ap-msg{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:10px;margin-bottom:14px;font-weight:600;font-size:14.5px}.ap-msg>span{flex:1}
.ap-msg button{border:0;background:none;cursor:pointer;color:inherit}.ap-msg-ok{background:#e5f6ec;color:#13814a}.ap-msg-error{background:#fde8e8;color:#b42318}.ap-msg-info{background:#e8f2ff;color:#0b5cc4}
.ap-atender{list-style:none;margin:0;padding:0;display:grid;gap:10px}.ap-atender li{display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--ap-linea);border-radius:10px}
.ap .ap-at-ico .ap-ico{width:26px;height:26px}.ap-at-tx{flex:1;font-size:15.5px;min-width:0}.ap-c-rojo{color:#d92d20}.ap-c-ambar{color:#e8a100}.ap-c-gris{color:#475467}
.ap-seg{list-style:none;margin:0;padding:0;border:1px solid var(--ap-linea);border-radius:10px;overflow:hidden}.ap-seg li{display:grid;grid-template-columns:auto minmax(0,1fr) auto 20px;align-items:center;gap:12px;padding:9px 14px;border-top:1px solid #edf1f5}
.ap-seg li:first-child{border-top:0}.ap-seg-n{font-size:15px}.ap-chev{color:#98a2b3}.ap-seg .ap-pill{justify-self:end}
.ap-grande{font-size:17px;margin:4px 0 18px}
.ap-subs{display:flex;gap:6px;border-bottom:1px solid var(--ap-linea);margin:0 0 16px;overflow-x:auto}.ap-sub{flex:0 0 auto;border:0;background:none;padding:10px 14px;font:inherit;font-size:16px;color:#334a66;border-bottom:3px solid transparent;cursor:pointer}
.ap-sub-act{color:var(--ap-nar);font-weight:700;border-bottom-color:var(--ap-nar)}
.ap-traz{list-style:none;margin:0;padding:0;display:grid}.ap-traz li{display:flex;gap:14px;padding:12px 0;border-top:1px solid #edf1f5}.ap-traz li:first-child{border-top:0}
.ap .ap-traz .ap-ico{width:26px;height:26px;color:#1d3557;margin-top:2px}.ap-traz div>b{display:block;font-size:15px}.ap-traz small b{font-weight:700;color:#334a66}.ap-traz small{display:block;color:var(--ap-mut);font-size:13.5px;margin-top:2px}
.ap-evid{display:flex;align-items:center;gap:14px;padding:12px 14px;border:1px solid var(--ap-linea);border-radius:10px;background:#fafcff;cursor:pointer;margin-top:12px}.ap .ap-evid input{display:none}
.ap-evid-ico{color:#1d3557}.ap .ap-evid-ico .ap-ico{width:30px;height:30px}.ap-evid b{font-weight:600}.ap-evid small{display:block;color:var(--ap-mut);font-size:12.5px}
.ap-form-merma .ap-evid{border-style:dashed}
.ap-mas{margin:0 0 6px;font-size:14px}.ap-mas summary{cursor:pointer;color:var(--ap-azul);font-weight:600;margin-bottom:8px}
.ap-chips{display:flex;gap:8px;flex-wrap:wrap;margin:-2px 0 14px}.ap-chip{border:1px solid #c9d6e2;background:#fff;border-radius:999px;padding:7px 14px;font:inherit;font-size:14px;cursor:pointer;color:#334a66}
.ap-chip-act{background:#0b5cc4;border-color:#0b5cc4;color:#fff;font-weight:600}
.ap-checks{list-style:none;margin:0 0 14px;padding:0;display:grid;gap:14px;font-size:16px}.ap-checks li{display:flex;align-items:center;gap:12px}
.ap .ap-checks .ap-ico{width:28px;height:28px;color:#fff;background:#16a34a;border-radius:50%;padding:4px;box-sizing:border-box}.ap .ap-checks li.ap-no .ap-ico{background:#e8a100}.ap .ap-checks li.ap-gris .ap-ico{background:#98a2b3}
.ap-estado{margin:0 0 14px}.ap-estado .ap-pill{font-size:15px;padding:9px 16px}
.ap-reservas{display:flex;gap:18px;align-items:center}.ap-reservas h3{margin:0 0 4px;font-size:20px}.ap-reservas p{margin:2px 0;color:#334a66}
.ap-desplegable summary{cursor:pointer}.ap-desplegable summary h3{display:inline;margin:0;font-size:17px}.ap-desplegable[open] summary{margin-bottom:12px}
.ap-coord{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:8px}.ap-coord li{display:flex;align-items:center;gap:10px;justify-content:space-between;padding:10px 12px;border:1px solid var(--ap-linea);border-radius:10px}
.ap-coord small{display:block;color:var(--ap-mut);font-size:13px}.ap-coord li.ap-cerrada{opacity:.65}
.ap-filtros{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto;gap:14px;align-items:end}
.ap-aud{display:flex;gap:16px;align-items:flex-start}.ap-aud h4{margin:0 0 4px;font-size:20px}.ap-aud p{margin:6px 0}
.ap-hist{font-size:14px;padding-left:18px}.ap-modal{max-width:920px}
@media(max-width:1100px){.ap-kpis-4{grid-template-columns:repeat(2,minmax(0,1fr))}.ap-filtros{grid-template-columns:repeat(2,minmax(0,1fr))}.ap-filtros .ap-acc{grid-column:1/-1;justify-content:flex-start}.ap-form-4{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:900px){.ap-2,.ap-2-par,.ap-2-merma,.ap-2-hist{grid-template-columns:1fr}.ap-kpis-3{grid-template-columns:1fr}}
@media(max-width:640px){.ap-cab h1{font-size:24px}.ap-cab-der{width:100%}.ap-cab-ctl{flex:1 1 140px}.ap-cab-sep{display:none}.ap-h2{font-size:23px}
  .ap-kpis-4,.ap-form-2,.ap-form-3,.ap-form-4,.ap-filtros{grid-template-columns:1fr}.ap-kpi{padding:14px}.ap-kpi-ico{width:52px;height:52px}.ap-kpi-tx b{font-size:28px}
  .ap .ap-t{min-width:0!important}.ap-tw{overflow-x:visible;border:0}
  .ap-t thead{display:none}.ap-t,.ap-t tbody,.ap-t tr,.ap-t td{display:block;width:100%;box-sizing:border-box}.ap-t tr{border:1px solid var(--ap-linea);border-radius:10px;padding:6px 4px;margin-bottom:8px}
  .ap-t td{border:0;padding:4px 8px;display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:baseline;gap:4px 8px;text-align:right}
  .ap-t td:before{margin-right:auto;content:attr(data-label);color:var(--ap-mut);font-size:12px;font-weight:700;text-transform:uppercase;text-align:left}
  .ap .ap-t-bal{display:table}.ap .ap-t-bal thead{display:table-header-group}.ap .ap-t-bal tbody{display:table-row-group}.ap .ap-t-bal tr{display:table-row;border:0;margin:0;padding:0}
  .ap .ap-t-bal td,.ap .ap-t-bal th{display:table-cell;text-align:left;border-top:1px solid #e7eef4;padding:8px}.ap .ap-t-bal td:last-child,.ap .ap-t-bal th:last-child{text-align:right}.ap .ap-t-bal td:before{content:none}
  .ap-seg li{grid-template-columns:auto minmax(0,1fr) 20px}.ap-seg .ap-pill{grid-column:2;justify-self:start}.ap-reservas{align-items:flex-start}
  .ap-tit-acc .ap-acc{width:100%}.ap-acc .ap-btn{flex:1 1 auto}.ap-tab{padding:12px}.ap-atender li{flex-wrap:wrap}}
@media print{.ap-tabs,.ap-acc,.ap-form,.ap-cab-der,.ap-filtros,.ap-evid{display:none!important}.ap-card{break-inside:avoid;box-shadow:none}}
</style>`;}
  window.glacialAsistentePantalla={pintar,contexto,AP};
})();
