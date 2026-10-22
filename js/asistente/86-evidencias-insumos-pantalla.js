/* =============================================================
   GLACIAL · EVIDENCIAS DE INSUMOS — PANTALLA: pestaña «Evidencias» del Inventario de insumos (Asistente de Producción)
   -------------------------------------------------------------
   Bandeja de validación: lista de fotografías de etiquetas (con filtro por estado) y, al elegir una, la FOTO al lado de los datos que propuso la IA.
   Cada dato muestra lo que la IA leyó (literal), el valor editable, su estado (legible / dudoso / requiere revisión / ausente) y quién lo tocó (imagen,
   regla del validador o una persona). Los datos dudosos (p. ej. 100 vs 1000) exigen «Confirmar» o corregir antes de aprobar.
   Acciones: Guardar cambios · Aprobar datos · Solicitar corrección o nueva foto · Rechazar · Reabrir (solo Administrador). Todo con auditoría.
   APROBAR DATOS NO REGISTRA STOCK: aquí no existe ninguna operación de inventario (recepción, transferencia ni consumo: Fase 4, otro permiso).
   Vive en el ASISTENTE DE PRODUCCIÓN (pestaña «Evidencias» de 72-asistente-pantalla.js): ese módulo llama a window.iiEvidenciasUI.usar({pintar, activo}) y reutiliza
   los estilos del Inventario (__inventarioInsumosPantalla.estilos). Cargar DESPUÉS de 85-evidencias-insumos-datos.js.
   ============================================================= */
(function instalarEvidenciasInsumosPantalla(){
  'use strict';
  const N=window.glacialEvidenciasNucleo,E=window.glacialEvidenciasDatos;
  if(!N||!E)return;
  const esc=v=>typeof escaparHtml==='function'?escaparHtml(String(v==null?'':v)):String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const raiz=()=>document.getElementById('modal-root');
  let host={pintar:()=>{},activo:()=>false};       // el módulo anfitrión (Asistente de Producción) dice cómo repintarse y cuándo está a la vista
  const repintar=()=>host.pintar();
  const fotos=()=>window.glacialFotos||null;
  const S={sel:'',estado:'pendiente',texto:'',borr:{},rot:{},msg:null,imp:null,sync:{en:0,enCurso:false,disponible:null}};
  const PILL={pendiente:'ii-p-naranja',requiere_correccion:'ii-p-rojo',aprobado_dato:'ii-p-verde',rechazado:'ii-p-gris',registrado:'ii-p-verde'};
  const hora=ms=>{if(!ms)return '';const d=new Date(Number(ms)-5*3600000),p=n=>String(n).padStart(2,'0');return p(d.getUTCDate())+'/'+p(d.getUTCMonth()+1)+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes());};
  const pill=e=>`<span class="ii-pill ${PILL[e]||'ii-p-gris'}"><i></i>${esc(N.ESTADOS[e]||e)}</span>`;
  const docActual=()=>E.porId(S.sel);
  const puedeEscribir=()=>E.puedeEscribir();
  const editable=d=>!!d&&puedeEscribir()&&N.EDITABLES.includes(d.estado);
  const borrador=()=>S.borr[S.sel]||(S.borr[S.sel]={});
  const hayBorrador=()=>Object.keys(S.borr[S.sel]||{}).length>0;
  const aviso=(tipo,texto)=>{S.msg={tipo,texto};};

  /* ---------- lista ---------- */
  function itemLista(d){
    const c=d.campos,sin=N.camposSinConfirmar(d).length;
    const titulo=(c.producto&&c.producto.valor)||d.archivoOriginal||'Etiqueta sin identificar';
    return `<button type="button" class="ie-item ${d.id===S.sel?'ie-item-act':''}" onclick="ieSel('${esc(d.id)}')"><span class="ie-it-t"><b>${esc(titulo)}</b>${pill(d.estado)}</span>
      <small>${esc((c.proveedor&&c.proveedor.valor)||'Proveedor sin leer')} · ${esc(d.categoria)}</small>
      <small>${sin?`<b class="ie-por-conf">${sin} por confirmar</b> · `:''}${esc(hora(d.creadoEn))}${c.lote&&c.lote.valor?' · lote '+esc(c.lote.valor):''}</small></button>`;
  }
  function listaHtml(){
    const todos=E.cache.lista,lista=N.filtrar(todos,{estado:S.estado,texto:S.texto});
    return lista.map(itemLista).join('')||`<p class="ii-vacio">${todos.length?'Ninguna evidencia coincide con el filtro.':(E.cache.listo?'Aún no hay evidencias. Importa los resultados de la lectura con «Importar».':'Consultando…')}</p>`;
  }
  function filtros(){
    const n=N.contarPorEstado(E.cache.lista);
    const chip=(valor,txt,cant)=>`<button type="button" class="ie-chip ${S.estado===valor?'ie-chip-act':''}" onclick="ieFiltro('${valor}')">${esc(txt)}${cant!==undefined?` <b>${cant}</b>`:''}</button>`;
    return `<div class="ie-chips">${chip('pendiente','Pendientes',n.pendiente)}${chip('requiere_correccion','Con corrección',n.requiere_correccion)}${chip('aprobado_dato','Aprobadas',n.aprobado_dato)}${chip('rechazado','Rechazadas',n.rechazado)}${chip('','Todas',n.total)}</div>
      <label class="ii-campo"><span>Buscar</span><input type="search" id="ie-texto" value="${esc(S.texto)}" placeholder="Producto, proveedor, lote o archivo" oninput="ieTexto(this.value)" autocomplete="off"></label>`;
  }

  /* ---------- detalle ---------- */
  function filaCampo(def,d,edit){
    const c=d.campos[def.campo],b=S.borr[d.id]||{};
    const valor=b[def.campo]!==undefined?b[def.campo]:(c.valor===null||c.valor===undefined?'':c.valor);
    const tipo=def.tipo==='fecha'?'date':def.tipo==='numero'?'number':'text';
    const sin=N.SIN_CONFIRMAR.includes(c.estado);
    const dis=edit?'':'disabled';
    const estadoTxt={legible:'Legible',dudoso:'Dudoso',ausente:'No aparece',requiere_revision:'Confirmar'}[c.estado]||c.estado;
    const claseEstado={legible:'ii-p-verde',dudoso:'ii-p-naranja',ausente:'ii-p-gris',requiere_revision:'ii-p-rojo'}[c.estado]||'ii-p-gris';
    const origen=c.origen==='humano'?'Corregido por una persona':c.origen==='imagen'?'Leído de la foto':'Ajustado por la regla «'+c.origen.replace('regla:','')+'»';
    const acciones=edit?`${sin?`<button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="ieConfirmar('${def.campo}')" title="El dato es correcto tal como está">Confirmar</button>`:''}
      ${c.valor_sugerido!==undefined&&sin?`<button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="ieSugerido('${def.campo}')" title="Usar ${esc(c.valor_sugerido)}">Usar ${esc(def.tipo==='fecha'?N.fechaPantalla(c.valor_sugerido):c.valor_sugerido)}</button>`:''}`:'';
    return `<tr class="ie-f ${sin?'ie-f-dudoso':''}"><th scope="row">${esc(def.etiqueta)}${c.literal!==null&&c.literal!==undefined&&String(c.literal)!==String(c.valor)?`<small>La IA leyó: «${esc(c.literal)}»</small>`:''}</th>
      <td><input class="ie-in" type="${tipo}" ${tipo==='number'?'step="any" min="0" inputmode="decimal"':''} value="${esc(valor)}" data-campo="${def.campo}" oninput="ieCampo('${def.campo}',this.value)" ${dis} aria-label="${esc(def.etiqueta)}">
        ${def.tipo==='fecha'&&valor?`<small class="ii-mut">${esc(N.fechaPantalla(String(valor)))}</small>`:''}${acciones?`<div class="ie-ac">${acciones}</div>`:''}</td>
      <td><span class="ii-pill ${claseEstado}" title="${esc(origen)}"><i></i>${estadoTxt}</span><small class="ii-mut ie-or">${esc(origen)}</small></td></tr>
      ${c.duda?`<tr class="ie-duda"><td colspan="3"><b>Verificar contra la foto:</b> ${esc(c.duda)}</td></tr>`:''}`;
  }
  function selector(id,lista,valor,edit,etiquetas){
    return `<select class="ie-in" onchange="${id}(this.value)" ${edit?'':'disabled'}>${lista.map(v=>`<option value="${esc(v)}" ${v===valor?'selected':''}>${esc((etiquetas&&etiquetas[v])||v)}</option>`).join('')}</select>`;
  }
  function fotoHtml(d){
    const F=fotos(),rot=S.rot[d.id]||0;
    if(!F||!d.foto||!d.foto.url)return '<div class="ie-foto-caja"><p class="ii-mut">Foto no disponible.</p></div>';
    return `<div class="ie-foto-bar"><button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="ieRotar(-90)" aria-label="Girar a la izquierda">⟲ Girar</button>
      <button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="ieRotar(90)" aria-label="Girar a la derecha">Girar ⟳</button>
      <a class="ii-btn ii-btn-o ii-btn-s" ${F.atributosEnlace(d.foto.url)} rel="noopener noreferrer">Abrir foto</a></div>
      <div class="ie-foto-caja"><img class="ie-foto" alt="Fotografía de la etiqueta" ${F.atributosImg(d.foto.url)} style="transform:rotate(${rot}deg)"></div>`;
  }
  function acciones(d){
    if(!puedeEscribir())return '<p class="ii-mut">Solo consulta: tu usuario no puede validar evidencias.</p>';
    if(d.estado==='aprobado_dato')return `<p class="ii-mut">Datos aprobados. No se registró stock: ningún movimiento de inventario nace de esta pantalla.</p>${E.esAdmin()?'<button type="button" class="ii-btn ii-btn-o" onclick="ieEstado(\'pendiente\')">Reabrir…</button>':''}`;
    if(d.estado==='rechazado')return `<p class="ii-mut">Rechazada.</p>${E.esAdmin()?'<button type="button" class="ii-btn ii-btn-o" onclick="ieEstado(\'pendiente\')">Reabrir…</button>':''}`;
    return `<button type="button" class="ii-btn ii-btn-o" onclick="ieGuardar()">Guardar cambios${hayBorrador()?' •':''}</button>
      <button type="button" class="ii-btn" onclick="ieEstado('aprobado_dato')">Aprobar datos</button>
      <button type="button" class="ii-btn ii-btn-o" onclick="ieEstado('requiere_correccion')">Solicitar corrección o nueva foto</button>
      <button type="button" class="ii-btn ii-btn-o ii-peligro" onclick="ieEstado('rechazado')">Rechazar</button>`;
  }
  function detalle(){
    const d=docActual();
    if(!d)return '<div class="ii-card ie-vacio-det"><p class="ii-mut">Elige una evidencia de la lista para ver la foto y los datos que propuso la IA.</p></div>';
    const edit=editable(d),b=S.borr[d.id]||{};
    const grupos=[...new Set(N.CAMPOS.map(c=>c.grupo))];
    const tablas=grupos.map(g=>`<h4 class="ie-g">${esc(g)}</h4><table class="ie-t"><tbody>${N.CAMPOS.filter(c=>c.grupo===g).map(def=>filaCampo(def,d,edit)).join('')}</tbody></table>`).join('');
    const hist=(d.historialEstados||[]).slice().reverse().map(h=>`<li><b>${esc(N.ESTADOS[h.estado]||h.estado)}</b> · ${esc(h.por||'—')} · ${esc(hora(h.en))}${h.motivo?` — ${esc(h.motivo)}`:''}</li>`).join('');
    const sin=N.camposSinConfirmar(d).length;
    return `<div class="ii-card ie-det">
      <div class="ie-det-cab"><div><h3>${esc((d.campos.producto&&d.campos.producto.valor)||d.archivoOriginal||'Etiqueta')}</h3>
        <p class="ii-mut">${esc(d.archivoOriginal)} · leída ${esc(d.analizadoEn?d.analizadoEn.slice(0,16).replace('T',' '):'')} ${d.modelo?'por '+esc(d.modelo):''} · importó ${esc(d.creadoPor||'—')}${d.versionProcesador?' · '+esc(d.versionProcesador):''}</p></div>${pill(d.estado)}</div>
      <div class="ii-msg ii-msg-info" role="note">Aprobar los datos <b>no registra stock</b>. Las entradas, transferencias y consumos se hacen en otra operación, con otro permiso (Fase 4).</div>
      ${sin&&edit?`<div class="ii-msg ii-msg-error" role="status"><b>${sin} dato${sin>1?'s':''} por confirmar.</b> Compáralos con la foto y pulsa «Confirmar» o corrígelos antes de aprobar.</div>`:''}
      <div class="ie-cols"><div class="ie-col-foto">${fotoHtml(d)}</div>
      <div class="ie-col-datos"><div class="ie-top"><label class="ii-campo"><span>Categoría</span>${selector('ieCat',N.CATEGORIAS,b.categoria||d.categoria,edit)}</label>
        <label class="ii-campo"><span>Tipo de documento</span>${selector('ieTipo',N.TIPOS_DOCUMENTO,b.tipoDocumento||d.tipoDocumento,edit,{etiqueta_insumo:'Etiqueta de insumo',hoja_produccion:'Hoja de producción',otro:'Otro'})}</label></div>
        ${tablas}
        ${d.advertencias&&d.advertencias.length?`<details class="ie-adv"><summary>Advertencias de la lectura (${d.advertencias.length})</summary><ul>${d.advertencias.map(a=>`<li>${esc(a)}</li>`).join('')}</ul></details>`:''}
        ${d.textoRelevante?`<details class="ie-adv"><summary>Texto leído de la etiqueta</summary><p class="ie-texto">${esc(d.textoRelevante)}</p></details>`:''}
      </div></div>
      <div class="ie-acc">${acciones(d)}</div>
      <details class="ie-adv"><summary>Historial de estados (${(d.historialEstados||[]).length})</summary><ul>${hist}</ul></details></div>`;
  }
  /* ---------- entrada automática: trae las evidencias que dejó el bot (al abrir, cada minuto y con el botón) ---------- */
  const ocupado=()=>!!(typeof document!=='undefined'&&document.querySelector('.ii input:focus,.ii select:focus,.ii textarea:focus,#modal-root .modal'));
  function sincronizar(manual){
    if(!puedeEscribir()||S.sync.enCurso)return;
    S.sync.enCurso=true;S.sync.en=Date.now();
    E.sincronizarEntrada().then(r=>{
      S.sync.disponible=r.disponible!==false;
      if(r.importadas){aviso('ok',`Se importaron ${r.importadas} evidencia${r.importadas===1?'':'s'} nueva${r.importadas===1?'':'s'} del bot.`);}
      else if(r.errores.length){aviso('error','No se pudieron importar algunas evidencias: '+r.errores.join(' · '));}
      else if(manual)aviso('info',r.disponible===false?'La entrada automática no está configurada en este servidor (falta aplicar glacial_33 y desplegar evidencias-ingesta).':'No hay evidencias nuevas del bot.');
      return r.importadas>0||r.errores.length>0||!!manual;
    }).catch(e=>{if(manual)aviso('error',E.mensajeError(e));return !!manual;})
      .then(repintarAhora=>{S.sync.enCurso=false;if(repintarAhora&&!ocupado())repintar();});
  }
  window.ieBuscarNuevas=()=>sincronizar(true);
  if(typeof setInterval==='function')setInterval(()=>{if(host.activo()&&Date.now()-S.sync.en>=60000&&!(typeof document!=='undefined'&&document.hidden))sincronizar(false);},30000);
  function html(){
    E.escuchar();
    if(puedeEscribir()&&Date.now()-S.sync.en>=60000)setTimeout(()=>sincronizar(false),0);
    const msg=S.msg?`<div class="ii-msg ii-msg-${S.msg.tipo}" role="${S.msg.tipo==='error'?'alert':'status'}">${esc(S.msg.texto)}</div>`:'';
    const error=E.cache.error?`<div class="ii-msg ii-msg-error" role="alert">No se pudieron leer las evidencias: ${esc(E.cache.error)}</div>`:'';
    const importar=puedeEscribir()?'<span class="ie-botones"><button type="button" class="ii-btn ii-btn-o" onclick="ieBuscarNuevas()" title="Trae las fotos que dejó el bot de WhatsApp">Buscar nuevas del bot</button> <button type="button" class="ii-btn" onclick="ieImportar()">Importar evidencias</button></span>':'<span class="ii-chip">Solo consulta</span>';
    return `<div class="ii-card"><div class="ii-fila-t"><h3>Evidencias de etiquetas</h3>${importar}</div>
      <p class="ii-mut">Fotografías del grupo autorizado de WhatsApp, leídas por la IA. La IA solo propone: una persona autorizada valida cada dato contra la foto.</p>${msg}${error}</div>
      <div class="ie-grid"><aside class="ii-card ie-lista"><div class="ie-filtros">${filtros()}</div><div id="ie-lista">${listaHtml()}</div></aside><section>${detalle()}</section></div>`;
  }

  /* ---------- acciones ---------- */
  window.ieSel=id=>{S.sel=id;S.msg=null;repintar();};
  window.ieFiltro=v=>{S.estado=v;repintar();};
  let espera=null;
  window.ieTexto=v=>{S.texto=v;clearTimeout(espera);espera=setTimeout(()=>{const l=document.getElementById('ie-lista');if(l)l.innerHTML=listaHtml();},200);};
  window.ieCampo=(campo,valor)=>{borrador()[campo]=valor;};
  window.ieCat=v=>{borrador().categoria=v;};
  window.ieTipo=v=>{borrador().tipoDocumento=v;};
  window.ieRotar=g=>{S.rot[S.sel]=(((S.rot[S.sel]||0)+g)%360+360)%360;const i=document.querySelector('.ie-foto');if(i)i.style.transform='rotate('+S.rot[S.sel]+'deg)';};
  window.ieSugerido=campo=>{const d=docActual();if(!d)return;const c=d.campos[campo];borrador()[campo]=c.valor_sugerido;repintar();};
  /* Solo viaja lo que cambió respecto al documento. */
  function cambiosPendientes(d){
    const out={},b=S.borr[d.id]||{};
    for(const [k,v] of Object.entries(b)){
      if(k==='categoria'||k==='tipoDocumento'){if(v!==d[k])out[k]=v;continue;}
      const actual=d.campos[k]?d.campos[k].valor:null;
      if(String(v===null||v===undefined?'':v)!==String(actual===null||actual===undefined?'':actual))out[k]=v;
    }
    return out;
  }
  async function ejecutar(promesa,okTxt){
    try{const r=await promesa;if(okTxt)aviso('ok',typeof okTxt==='function'?okTxt(r):okTxt);return r;}
    catch(e){aviso('error',E.mensajeError(e));return null;}
    finally{repintar();}
  }
  window.ieGuardar=async()=>{
    const d=docActual();if(!d||!editable(d))return;
    const cambios=cambiosPendientes(d);
    if(!Object.keys(cambios).length){aviso('info','No hay cambios que guardar.');repintar();return;}
    const r=await ejecutar(E.guardarEdiciones(d.id,d.rev,{cambios}),r=>r&&r.cambiado?'Cambios guardados.':'No había cambios que guardar.');
    if(r)delete S.borr[d.id];
  };
  window.ieConfirmar=async campo=>{
    const d=docActual();if(!d||!editable(d))return;
    if(S.borr[d.id]&&S.borr[d.id][campo]!==undefined){aviso('info','Guarda primero el valor que escribiste en ese campo.');repintar();return;}
    await ejecutar(E.guardarEdiciones(d.id,d.rev,{confirmar:[campo]}),'Dato confirmado.');
  };

  /* ---------- modales ---------- */
  function abrirModal(titulo,cuerpo){
    const r=raiz();if(!r)return;
    r.innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)ieCerrar()"><div class="modal ii-modal ii-modal-ancho" role="dialog" aria-modal="true"><div class="modal-head"><h3>${esc(titulo)}</h3>
      <button class="modal-close" onclick="ieCerrar()" aria-label="Cerrar">✕</button></div><div class="modal-body">${cuerpo}<div class="ii-msg ii-msg-error" id="ie-m-error" hidden></div></div></div></div>`;
  }
  const errorModal=t=>{const e=document.getElementById('ie-m-error');if(e){e.hidden=!t;e.textContent=t||'';}};
  window.ieCerrar=()=>{S.imp=null;if(typeof closeModal==='function')closeModal();else{const r=raiz();if(r)r.innerHTML='';}};
  const TXT_ESTADO={
    aprobado_dato:['Aprobar datos','Se aprueban los DATOS de esta etiqueta. No se registra stock ni ningún movimiento de inventario.'],
    requiere_correccion:['Solicitar corrección o nueva foto','Queda marcada para corregir. Escribe qué falta o qué foto hay que volver a enviar.'],
    rechazado:['Rechazar evidencia','La evidencia queda rechazada y no se usará. Escribe el motivo.'],
    pendiente:['Reabrir evidencia','Solo un Administrador puede reabrirla. Escribe el motivo.']
  };
  window.ieEstado=a=>{
    const d=docActual();if(!d||!puedeEscribir())return;
    if(a==='aprobado_dato'){
      if(hayBorrador()&&Object.keys(cambiosPendientes(d)).length){aviso('error','Tienes cambios sin guardar. Pulsa «Guardar cambios» y luego aprueba.');repintar();return;}
      const v=N.validarAprobacion(d);
      if(v.errores.length){aviso('error',v.errores.join(' '));repintar();return;}
      abrirModal(TXT_ESTADO[a][0],`<p>${esc(TXT_ESTADO[a][1])}</p>${v.avisos.length?`<ul class="ii-lista-sm">${v.avisos.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
        <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="ieCerrar()">Cancelar</button><button type="button" class="ii-btn" id="ie-m-ok" onclick="ieEstadoOk('${a}')">Aprobar datos</button></div>`);
      return;
    }
    const [titulo,texto]=TXT_ESTADO[a];
    abrirModal(titulo,`<p>${esc(texto)}</p><label class="ii-campo"><span>Motivo</span><input type="text" id="ie-motivo" maxlength="300" autocomplete="off"></label>
      <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="ieCerrar()">Cancelar</button><button type="button" class="ii-btn ${a==='rechazado'?'ii-peligro-f':''}" id="ie-m-ok" onclick="ieEstadoOk('${a}')">${esc(titulo)}</button></div>`);
  };
  window.ieEstadoOk=async a=>{
    const d=docActual();if(!d)return;
    const b=document.getElementById('ie-m-ok');if(b)b.disabled=true;errorModal('');
    const m=document.getElementById('ie-motivo');
    try{
      await E.cambiarEstado(d.id,d.rev,a,{motivo:m?m.value:''});
      ieCerrar();aviso('ok',a==='aprobado_dato'?'Datos aprobados. No se registró stock.':a==='rechazado'?'Evidencia rechazada.':a==='requiere_correccion'?'Marcada para corregir.':'Evidencia reabierta.');
      delete S.borr[d.id];repintar();
    }catch(e){errorModal(E.mensajeError(e));if(b)b.disabled=false;}
  };

  /* ---------- importar: resultados -revisado.json + fotos (se unen por la huella SHA-256 de la foto) ---------- */
  window.ieImportar=()=>{
    if(!puedeEscribir())return;
    S.imp={fase:'elegir',items:[]};
    abrirModal('Importar evidencias',`<p>Selecciona a la vez los resultados <b>-revisado.json</b> (carpeta <code>resultados-ia</code>) y sus <b>fotos</b> (carpeta <code>evidencias</code>). Cada foto se une a su resultado por la huella SHA-256: una foto que no es la de ese resultado no se importa.</p>
      <label class="ii-campo"><span>Archivos (.json y fotos)</span><input type="file" id="ie-archivos" multiple accept=".json,application/json,image/jpeg,image/png,image/webp" onchange="ieArchivos(this)"></label><div id="ie-plan"></div>`);
  };
  const leerTexto=f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result));r.onerror=()=>rej(new Error('No se pudo leer '+f.name));r.readAsText(f);});
  window.ieArchivos=async input=>{
    const archivos=[...(input.files||[])];if(!archivos.length||!S.imp)return;
    const plan=document.getElementById('ie-plan');if(plan)plan.innerHTML='<p class="ii-mut">Revisando archivos…</p>';
    const registros=[],fotosPorSha=new Map(),problemas=[];
    for(const f of archivos){
      try{
        if(/\.json$/i.test(f.name)||f.type==='application/json'){
          if(f.size>1024*1024){problemas.push(f.name+': el JSON es demasiado grande.');continue;}
          const r=JSON.parse(await leerTexto(f));
          if(r&&r.extraccion&&typeof r.extraccion==='object')registros.push(r);else problemas.push(f.name+': no es un resultado de lectura de etiquetas.');
        }else if(/^image\/(jpeg|png|webp)$/.test(f.type)){
          if(f.size>10*1024*1024){problemas.push(f.name+': la foto supera los 10 MB.');continue;}
          fotosPorSha.set(await N.sha256Hex(await f.arrayBuffer()),f);
        }else problemas.push(f.name+': tipo de archivo no admitido.');
      }catch(e){problemas.push(f.name+': '+((e&&e.message)||e));}
    }
    const elegidos=N.elegirPorFoto(registros);
    const items=[];
    elegidos.forEach((r,sha)=>{
      const foto=fotosPorSha.get(sha);
      let estado='listo',nota='';
      if(!foto){estado='sin_foto';nota='Falta la foto de este resultado (o es otra foto).';}
      else if(E.porId(sha)){estado='duplicada';nota='Ya está en la bandeja.';}
      items.push({sha,r,foto,estado,nota,nombre:String(r.archivo_original||sha.slice(0,12))});
    });
    const sinResultado=[...fotosPorSha.keys()].filter(h=>!elegidos.has(h)).length;
    S.imp={fase:'plan',items,problemas,sinResultado};
    pintarPlan();
  };
  function pintarPlan(){
    const p=document.getElementById('ie-plan');if(!p||!S.imp)return;
    const {items,problemas,sinResultado}=S.imp,listos=items.filter(i=>i.estado==='listo');
    const txt={listo:'Listo para importar',sin_foto:'Falta la foto',duplicada:'Ya importada',ok:'Importada',error:'Error'};
    p.innerHTML=`<div class="ii-resumen"><div><b>${listos.length}</b><span>listas para importar</span></div><div><b>${items.length-listos.length}</b><span>se omiten</span></div><div><b>${sinResultado}</b><span>fotos sin resultado</span></div></div>
      <ul class="ii-lista-sm">${items.map(i=>`<li><b>${esc(i.nombre)}</b> · ${esc(txt[i.estado]||i.estado)}${i.nota?` <small class="ii-mut">(${esc(i.nota)})</small>`:''}</li>`).join('')||'<li>No se encontró ningún resultado válido.</li>'}</ul>
      ${problemas.length?`<div class="ii-msg ii-msg-info">${problemas.map(esc).join('<br>')}</div>`:''}
      <div class="ii-acc"><button type="button" class="ii-btn ii-btn-o" onclick="ieCerrar()">Cancelar</button><button type="button" class="ii-btn" id="ie-m-ok" onclick="ieImportarOk()" ${listos.length?'':'disabled'}>Importar ${listos.length}</button></div>`;
  }
  window.ieImportarOk=async()=>{
    if(!S.imp||S.imp.fase!=='plan')return;
    const b=document.getElementById('ie-m-ok');if(b)b.disabled=true;errorModal('');
    let n=0;
    for(const i of S.imp.items.filter(x=>x.estado==='listo')){
      try{await E.importar(i.r,i.foto);i.estado='ok';n++;}catch(e){i.estado='error';i.nota=E.mensajeError(e);}
      pintarPlan();
    }
    const fallidas=S.imp.items.filter(i=>i.estado==='error').length;
    if(!fallidas){ieCerrar();aviso('ok',`Se importaron ${n} evidencia${n===1?'':'s'}.`);S.estado='pendiente';repintar();}
    else{aviso(n?'ok':'error',`Se importaron ${n}; ${fallidas} con error (míralas en la lista).`);const bb=document.getElementById('ie-m-ok');if(bb)bb.hidden=true;}
  };

  const css=`
.ie-botones{display:flex;gap:8px;flex-wrap:wrap}
.ie-grid{display:grid;grid-template-columns:minmax(260px,330px) minmax(0,1fr);gap:14px;align-items:start}
.ie-lista{padding:12px}.ie-filtros{display:grid;gap:10px;margin-bottom:10px}
.ie-chips{display:flex;gap:6px;flex-wrap:wrap}.ie-chip{border:1px solid var(--ii-linea);background:#fff;border-radius:99px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer;color:#334a66}
.ie-chip-act{background:#0b5cc4;border-color:#0b5cc4;color:#fff}.ie-chip b{font-weight:700}
.ie-item{display:flex;flex-direction:column;gap:3px;text-align:left;width:100%;background:#f8fbff;border:1px solid var(--ii-linea);border-radius:10px;padding:10px 12px;margin-bottom:8px;font:inherit;color:inherit;cursor:pointer}
.ie-item-act{border-color:#0b5cc4;background:#eaf2fd}.ie-it-t{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.ie-item small{color:var(--ii-mut)}.ie-por-conf{color:#b42318}
.ie-det-cab{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.ie-det-cab h3{margin:0 0 4px;font-size:19px}
.ie-cols{display:grid;grid-template-columns:minmax(220px,38%) minmax(0,1fr);gap:16px;margin-top:12px;align-items:start}
.ie-col-foto{position:sticky;top:8px}.ie-foto-bar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.ie-foto-caja{background:#e6ebef;border-radius:10px;display:flex;align-items:center;justify-content:center;min-height:300px;padding:8px;overflow:auto}
.ie-foto{max-width:100%;max-height:68vh;object-fit:contain;transition:transform .15s}
.ie-top{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:6px}.ie-g{margin:14px 0 6px;font-size:14px;color:#1d3557}
.ie-t{width:100%;border-collapse:collapse;font-size:14px}.ie-t{table-layout:fixed}.ie-t th{text-align:left;text-transform:none;letter-spacing:0;font-size:14px;color:#0f2547;background:transparent;font-weight:600;width:30%;padding:7px 8px 7px 0;vertical-align:top}.ie-t th small{display:block;font-weight:400;color:var(--ii-mut);font-size:11.5px;overflow-wrap:anywhere}
.ie-t td{padding:5px 6px;vertical-align:top;border-top:1px solid #edf2f7}.ie-f-dudoso td,.ie-f-dudoso th{background:#fff7f6}.ie-or{display:block;font-size:11px}.ie-ac{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.ie-in{font:inherit;font-size:14px;padding:6px 8px;border:1px solid #c9d6e2;border-radius:8px;min-height:38px;width:100%;box-sizing:border-box;background:#fff;color:#0f2547}.ie-in:disabled{background:#f4f6f8;color:#475467}
.ie-duda td{background:#fdecea;color:#7a2a22;font-size:13px;padding:6px 10px;border-top:0}
.ie-adv{margin-top:12px;font-size:13px}.ie-adv ul{margin:6px 0 0;padding-left:20px}.ie-texto{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f8fc;border-radius:8px;padding:10px;margin:6px 0 0}
.ie-acc{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:16px;padding-top:14px;border-top:1px solid var(--ii-linea)}
.ie-vacio-det{text-align:center;padding:40px 16px}
@media(max-width:900px){.ie-grid{grid-template-columns:1fr}.ie-cols{grid-template-columns:1fr}.ie-col-foto{position:static}.ie-top{grid-template-columns:1fr}.ie-t th{width:auto}}
@media(max-width:560px){.ie-t,.ie-t tbody,.ie-t tr,.ie-t th,.ie-t td{display:block;width:100%}.ie-t tr{border-top:1px solid #edf2f7;padding:6px 0}.ie-t td{border-top:0}.ie-duda{padding:0!important}}`;

  window.iiEvidenciasUI={html,css,estado:S,hayEdicion:()=>!!S.sel&&hayBorrador(),usar:h=>{if(h&&typeof h.pintar==='function'&&typeof h.activo==='function')host=h;}};
  window.__inventarioInsumosEvidencias={S,cambiosPendientes};

  /* Tiempo real: lo que otra persona valide aparece solo, sin pisar lo que se está escribiendo. */
  E.alCambiar(()=>{
    if(!host.activo())return;
    if(document.querySelector('.ii input:focus,.ii select:focus,.ii textarea:focus,#modal-root .modal'))return;
    host.pintar();
  });
})();
