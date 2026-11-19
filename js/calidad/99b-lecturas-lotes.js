/* =============================================================
   GLACIAL · CALIDAD › LOTES LEÍDOS (datos y foto de lo que lee el bot de WhatsApp)
   -------------------------------------------------------------
   El bot manda cada foto de etiqueta con la lectura de la IA (lote, marca, proveedor, producto, fechas, pesos, advertencias). Eso queda en
   public.evidencias_entrada (glacial_33) y Calidad lo lee con la función calidad_lecturas_listar (glacial_64, misma marca «VER Calidad»).
   · SOLO LECTURA: no mueve stock, no crea lotes ni toca Evidencias.
   · La foto vive en el bucket privado «glacial-fotos»: se muestra con enlace firmado (window.glacialFotos, 06b-fotos-supabase.js).
   · Se actualiza sola cada minuto mientras la pestaña está a la vista, y con «Actualizar».
   Se monta desde 100-calidad-pantalla.js (window.apLecturasLotesUI). Cargar DESPUÉS de 98-calidad-permisos.js.
   ============================================================= */
(function(raiz){
  'use strict';
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const txt=v=>(v==null?'':String(v)).replace(/\s+/g,' ').trim();

  /* Campos que se muestran en el detalle, en este orden (clave de la lectura → etiqueta). */
  const CAMPOS=[['lote','Lote'],['marca','Marca'],['proveedor','Proveedor'],['producto','Producto'],['presentacion','Presentación'],['categoria','Categoría'],
    ['cliente','Cliente'],['medidas','Medidas'],['codigo_producto','Código de producto'],['orden_compra','Orden de compra'],['numero_caja_bobina','N.º de caja / bobina'],
    ['fecha_impresa','Fecha impresa'],['fecha_produccion','Fecha de producción'],['fecha_proceso','Fecha de proceso'],['fecha_etiqueta','Fecha de etiqueta'],['fecha_vencimiento','Vencimiento'],
    ['peso_neto_kg','Peso neto (kg)'],['peso_bruto_kg','Peso bruto (kg)'],['peso_declarado_kg','Peso declarado (kg)'],['cantidad','Cantidad']];
  /* Advertencias fijas del procesador que no dicen nada de la etiqueta. */
  const RUIDO=/^(este revisor|pendiente de validaci)/i;

  /* ---------- lógica pura (se prueba con node) ---------- */
  /** Fila del servidor → fila lista para mostrar (nunca lanza). */
  function normalizar(f){
    f=f&&typeof f==='object'?f:{};
    const x=f.extraccion&&typeof f.extraccion==='object'?f.extraccion:{};
    const lista=v=>(Array.isArray(v)?v:[]).map(a=>txt(a&&typeof a==='object'?(a.campo||a.nombre||JSON.stringify(a)):a)).filter(Boolean);
    const cant=x.cantidad_valor!=null&&x.cantidad_valor!==''?(x.cantidad_valor+(x.cantidad_unidad?' '+x.cantidad_unidad:'')):'';
    const campos={};
    CAMPOS.forEach(([k])=>{const v=k==='cantidad'?cant:x[k];if(v!=null&&String(v).trim()!=='')campos[k]=txt(v);});
    const advertencias=lista(x.advertencias).filter(a=>!RUIDO.test(a));
    const enDuda=lista(f.campos_en_duda);
    const ms=Date.parse(f.recibido_en||'');
    const lote=txt(x.lote);
    return {sha:txt(f.sha256),lote,marca:txt(x.marca),proveedor:txt(x.proveedor),producto:txt(x.producto),presentacion:txt(x.presentacion),
      fechaImpresa:txt(x.fecha_impresa),vencimiento:txt(x.fecha_vencimiento),codigo:txt(x.codigo_producto),ordenCompra:txt(x.orden_compra),
      campos,advertencias,enDuda,cambios:lista(f.cambios_sugeridos),textoRelevante:txt(x.texto_relevante),
      fotoRuta:txt(f.foto_ruta),leyenda:txt(f.leyenda),importada:f.importada===true,estado:txt(f.estado),
      ms:Number.isFinite(ms)?ms:0,sinLote:!lote,pideMirada:!lote||enDuda.length>0||advertencias.length>0};
  }
  function resumen(lista){
    const r={total:lista.length,lotes:new Set(),sinLote:0,conAviso:0,conFoto:0};
    lista.forEach(x=>{if(x.lote)r.lotes.add(x.lote.toUpperCase());if(x.sinLote)r.sinLote++;if(x.pideMirada)r.conAviso++;if(x.fotoRuta)r.conFoto++;});
    r.lotes=r.lotes.size;return r;
  }
  const alnum=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  /** f: {estado:''|'AVISO'|'SINLOTE'|'LIMPIA', texto} */
  function filtrar(lista,f){
    f=f||{};const q=alnum(f.texto);
    return lista.filter(x=>{
      if(f.estado==='AVISO'&&!x.pideMirada)return false;
      if(f.estado==='SINLOTE'&&!x.sinLote)return false;
      if(f.estado==='LIMPIA'&&x.pideMirada)return false;
      if(q&&!alnum([x.lote,x.marca,x.proveedor,x.producto,x.presentacion,x.codigo,x.ordenCompra].join(' ')).includes(q))return false;
      return true;
    }).sort((a,b)=>b.ms-a.ms);
  }
  /** Referencia estable de la foto en el bucket privado (la misma forma que usa 06b-fotos-supabase.js). */
  const refFoto=ruta=>ruta&&/^asistente\/evidencias\/[A-Za-z0-9._-]+$/.test(ruta)?'supabase:glacial-fotos/'+ruta:'';
  const NUCLEO={CAMPOS,normalizar,resumen,filtrar,refFoto};
  if(typeof module!=='undefined'&&module.exports)module.exports=NUCLEO;
  if(typeof window==='undefined'||!window.document)return;

  /* ---------- datos ---------- */
  const W=window;
  const ES={lista:[],listo:false,error:'',cargando:false,dias:30,estado:'',texto:'',abierta:'',visibles:48,disponible:true};
  const oyentes=[];let temporizador=null,activo=false;
  const cliente=()=>W.glacialSupabaseCliente||null;
  const puedeVer=()=>{try{return !!(W.glacialCalidadPermisos&&W.glacialCalidadPermisos.puedeVer());}catch(_){return false;}};
  function msgError(r){
    const m=String((r&&r.message)||''),c=String((r&&r.code)||'');
    if(c==='PGRST202'||c==='42883'||/could not find the function|does not exist|schema cache/i.test(m))return {faltaMigracion:true,texto:'Falta aplicar glacial_64 en Supabase: todavía no existe la lectura de lotes para Calidad.'};
    if(c==='42501'||/sin permiso/i.test(m))return {texto:'No tienes permiso para ver los lotes leídos.'};
    return {texto:m||'No se pudieron leer los lotes.'};
  }
  async function cargar(){
    if(ES.cargando)return;
    const c=cliente();
    if(!c||typeof c.rpc!=='function'){ES.listo=true;ES.disponible=false;ES.error='Supabase no está disponible en esta sesión.';repintar();return;}
    ES.cargando=true;
    try{
      const desde=new Date(Date.now()-ES.dias*86400000).toISOString();
      const r=await c.rpc('calidad_lecturas_listar',{p_desde:desde,p_limite:500});
      if(r&&r.error){const e=msgError(r.error);ES.error=e.texto;ES.disponible=!e.faltaMigracion;}
      else{ES.lista=(Array.isArray(r&&r.data)?r.data:[]).map(normalizar);ES.error='';ES.disponible=true;}
    }catch(e){ES.error=(e&&e.message)||'No se pudieron leer los lotes.';}
    ES.cargando=false;ES.listo=true;repintar();
  }
  function repintar(){oyentes.slice().forEach(f=>{try{f();}catch(_){/* una vista no rompe a otra */}});}
  const bloqueado=()=>!!document.querySelector('.lc input:focus,.lc select:focus');
  function escuchar(){
    if(activo)return;activo=true;cargar();
    temporizador=setInterval(()=>{if(!document.hidden&&!bloqueado())cargar();},60000);
  }
  function detener(){activo=false;if(temporizador){clearInterval(temporizador);temporizador=null;}}
  if(W.glacialCierresSesion)W.glacialCierresSesion.push(()=>{detener();ES.lista=[];ES.listo=false;ES.abierta='';});
  /* Para que otra pantalla (Validación de lotes) pueda mostrar la foto de una evidencia sin abrir esta pestaña. */
  const porSha=sha=>sha?ES.lista.find(x=>x.sha===sha||x.sha.startsWith(sha))||null:null;
  function asegurar(){if(!ES.listo&&!ES.cargando&&puedeVer())cargar();}

  /* ---------- pantalla ---------- */
  const fechaHora=ms=>{if(!ms)return '—';try{return new Date(ms).toLocaleString('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});}catch(_){return '—';}};
  const pill=(t,c)=>`<span class="lc-pill ${c}">${esc(t)}</span>`;
  function imgFoto(x,cls){
    const F=W.glacialFotos,ref=refFoto(x.fotoRuta);
    if(!ref||!F)return `<div class="lc-sinfoto ${cls||''}">Sin foto</div>`;
    return `<img class="lc-foto ${cls||''}" loading="lazy" alt="Etiqueta del lote ${esc(x.lote||'sin lote legible')}" ${F.atributosImg(ref)}>`;
  }
  function tarjetas(r){
    const k=(t,v,s,c)=>`<div class="lc-k ${c||''}"><span>${esc(t)}</span><b>${v}</b>${s?`<small>${esc(s)}</small>`:''}</div>`;
    return `<div class="lc-ks">${k('Lecturas',r.total,r.lotes+' lote'+(r.lotes===1?'':'s')+' distinto'+(r.lotes===1?'':'s'))}${k('Con advertencias',r.conAviso,'conviene mirar la foto',r.conAviso?'lc-k-obs':'')}${k('Sin lote legible',r.sinLote,'la IA no leyó el lote',r.sinLote?'lc-k-mal':'')}${k('Con foto',r.conFoto,'etiqueta original')}</div>`;
  }
  function filtros(){
    const op=(v,t,sel)=>`<option value="${v}" ${sel===v?'selected':''}>${t}</option>`;
    return `<div class="lc-filtros">
      <label>Período<select onchange="lcSet('dias',Number(this.value))">${[7,30,90,180].map(n=>op(String(n),'Últimos '+n+' días',String(ES.dias))).join('')}</select></label>
      <label>Mostrar<select onchange="lcSet('estado',this.value)">${op('','Todas',ES.estado)}${op('AVISO','Con advertencias',ES.estado)}${op('SINLOTE','Sin lote legible',ES.estado)}${op('LIMPIA','Sin advertencias',ES.estado)}</select></label>
      <label class="lc-busca">Buscar<input type="search" placeholder="Lote, proveedor, marca o producto" value="${esc(ES.texto)}" oninput="lcBuscar(this.value)" aria-label="Buscar lotes leídos"></label>
      <button type="button" class="lc-btn" onclick="lcActualizar()" ${ES.cargando?'disabled':''}>${ES.cargando?'Actualizando…':'Actualizar'}</button></div>`;
  }
  function detalle(x){
    const F=W.glacialFotos,ref=refFoto(x.fotoRuta);
    const filas=CAMPOS.filter(([k])=>x.campos[k]).map(([k,t])=>`<tr><th>${esc(t)}</th><td>${esc(x.campos[k])}${x.enDuda.includes(k)?' '+pill('en duda','lc-obs'):''}</td></tr>`).join('');
    const avisos=x.advertencias.length?`<div class="lc-bloque"><h4>Advertencias de la lectura</h4><ul>${x.advertencias.map(a=>`<li>${esc(a)}</li>`).join('')}</ul></div>`:'';
    const etiqueta=k=>(CAMPOS.find(c=>c[0]===k)||[k,k.replace(/_/g,' ')])[1];
    const duda=x.enDuda.length?`<div class="lc-bloque"><h4>Campos en duda</h4><p class="lc-texto">${esc(x.enDuda.map(etiqueta).join(', '))}</p></div>`:'';
    const cambios=x.cambios.length?`<div class="lc-bloque"><h4>Correcciones sugeridas</h4><ul>${x.cambios.map(a=>`<li>${esc(a)}</li>`).join('')}</ul></div>`:'';
    const foto=ref&&F?`<a class="lc-grande" ${F.atributosEnlace(ref)} title="Abrir la foto en tamaño completo">${imgFoto(x,'lc-foto-g')}<span>Abrir en tamaño completo</span></a>`:`<div class="lc-sinfoto">Sin foto</div>`;
    return `<section class="lc-det" aria-label="Detalle de la lectura"><div class="lc-det-foto">${foto}</div>
      <div class="lc-det-datos"><table class="lc-tabla"><tbody>${filas||'<tr><td>La lectura no trajo datos.</td></tr>'}</tbody></table>${avisos}${duda}${cambios}
      ${x.textoRelevante?`<div class="lc-bloque"><h4>Texto leído de la etiqueta</h4><p class="lc-texto">${esc(x.textoRelevante)}</p></div>`:''}
      <p class="lc-mut">Recibida el ${esc(fechaHora(x.ms))}${x.leyenda?` · Leyenda: ${esc(x.leyenda)}`:''}${x.importada?' · Ya importada en Evidencias':''} · Huella ${esc(x.sha.slice(0,12))}…</p></div></section>`;
  }
  function tarjeta(x){
    const ab=ES.abierta===x.sha;
    const sub=[x.proveedor,x.marca&&x.marca!==x.proveedor?x.marca:'',x.producto].filter(Boolean).join(' · ');
    const fechas=[x.fechaImpresa?'Fecha '+x.fechaImpresa:'',x.vencimiento?'Vence '+x.vencimiento:''].filter(Boolean).join(' · ');
    return `<article class="lc-card ${ab?'lc-ab':''}"><button type="button" class="lc-abrir" aria-expanded="${ab}" onclick="lcAbrir('${esc(x.sha)}')">
      ${imgFoto(x,'lc-foto-m')}<span class="lc-info"><span class="lc-lote">${x.lote?esc(x.lote):'<i>Sin lote legible</i>'}</span><span class="lc-sub">${esc(sub||'Sin proveedor ni producto leídos')}</span>
      ${fechas?`<span class="lc-sub">${esc(fechas)}</span>`:''}<span class="lc-pie">${esc(fechaHora(x.ms))}${x.sinLote?' '+pill('Sin lote','lc-mal'):x.pideMirada?' '+pill('Con advertencias','lc-obs'):' '+pill('Lectura limpia','lc-ok')}</span></span></button>${ab?detalle(x):''}</article>`;
  }
  function lista(vis){
    if(!vis.length)return `<div class="lc-vacio">${ES.lista.length?'Ninguna lectura coincide con el filtro.':'Todavía no hay lotes leídos en este período. Cuando el bot lea una etiqueta, aparecerá aquí con su foto.'}</div>`;
    const ver=vis.slice(0,ES.visibles);
    return `<div class="lc-grid">${ver.map(tarjeta).join('')}</div>${vis.length>ver.length?`<div class="lc-mas"><button type="button" class="lc-btn" onclick="lcMas()">Ver más (${vis.length-ver.length} restantes)</button></div>`:''}`;
  }
  function estilos(){return `<style>
.lc{display:grid;gap:14px}.lc *{box-sizing:border-box}
.lc-nota{background:#eaf5fc;border:1px solid #bfdcec;color:#0b4a6b;border-radius:12px;padding:10px 14px;font-size:13px}
.lc-ks{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.lc-k{background:#fff;border:1px solid #d9e7f1;border-radius:14px;padding:12px 14px}.lc-k span{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#587087}
.lc-k b{display:block;font-size:28px;line-height:1.15;margin:4px 0 2px;color:#0b2a4a}.lc-k small{color:#587087;font-size:12px}.lc-k-obs b{color:#b45309}.lc-k-mal b{color:#c62828}
.lc-filtros{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;background:#fff;border:1px solid #d9e7f1;border-radius:14px;padding:12px 14px}
.lc-filtros label{display:grid;gap:4px;font-size:11.5px;font-weight:700;color:#587087;text-transform:uppercase;letter-spacing:.05em}
.lc-filtros select,.lc-filtros input{font:inherit;font-size:15px;font-weight:500;text-transform:none;letter-spacing:0;padding:8px 10px;border:1px solid #cddfec;border-radius:10px;min-height:44px;background:#fff;color:#14263a}
.lc-busca{flex:1 1 220px}.lc-busca input{width:100%}
.lc-btn{min-height:44px;border-radius:10px;border:1px solid #9fd0e6;background:#fff;color:#0877a6;font:inherit;font-weight:700;padding:0 16px;cursor:pointer}.lc-btn:disabled{opacity:.55;cursor:not-allowed}
.lc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;align-items:start}
.lc-card{background:#fff;border:1px solid #d9e7f1;border-radius:14px;overflow:hidden}.lc-ab{grid-column:1/-1;border-color:#0877a6}
.lc-abrir{display:flex;gap:12px;width:100%;text-align:left;border:0;background:none;padding:10px;font:inherit;color:inherit;cursor:pointer;align-items:stretch}.lc-abrir:hover{background:#f4fafe}
.lc-foto{display:block;object-fit:cover;background:#eaf1f7;border-radius:10px}.lc-foto-m{width:96px;height:96px;flex:none}.lc-foto-g{width:100%;max-height:420px;object-fit:contain}
.lc-sinfoto{display:flex;align-items:center;justify-content:center;background:#f1f5f9;color:#587087;font-size:12px;border-radius:10px;min-height:96px;width:96px;flex:none;text-align:center}
.lc-info{display:grid;gap:3px;align-content:start;min-width:0}.lc-lote{font-size:20px;font-weight:800;color:#0b2a4a;overflow-wrap:anywhere}.lc-lote i{font-weight:600;color:#c62828;font-size:16px}
.lc-sub{color:#587087;font-size:13px;overflow-wrap:anywhere}.lc-pie{color:#587087;font-size:12px;margin-top:2px}
.lc-pill{display:inline-block;font-size:11px;font-weight:800;border-radius:999px;padding:3px 10px;white-space:nowrap}
.lc-ok{background:#dff5e7;color:#157a3b}.lc-obs{background:#ffedd5;color:#b45309}.lc-mal{background:#fde8e8;color:#c62828}
.lc-det{display:grid;grid-template-columns:minmax(220px,1fr) minmax(0,1.4fr);gap:16px;padding:12px 14px 16px;border-top:1px solid #eaf1f7;background:#f8fbfe}
.lc-grande{display:grid;gap:6px;color:#0877a6;font-weight:700;font-size:13px;text-decoration:none}
.lc-tabla{width:100%;border-collapse:collapse}.lc-tabla th{width:42%;text-align:left;font-size:12px;color:#587087;font-weight:700;padding:5px 8px 5px 0;vertical-align:top}.lc-tabla td{padding:5px 0;font-weight:600;overflow-wrap:anywhere}
.lc-bloque{margin-top:10px}.lc-bloque h4{margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#587087}.lc-bloque ul{margin:0;padding-left:18px;font-size:13px;display:grid;gap:3px}
.lc-texto{margin:0;font-size:13px;background:#fff;border:1px solid #e3edf5;border-radius:8px;padding:8px 10px;overflow-wrap:anywhere}
.lc-mut{color:#587087;font-size:12px;margin:10px 0 0}.lc-mas{text-align:center}
.lc-vacio{background:#fafcfe;border:1px dashed #c3d8e8;border-radius:12px;padding:22px;text-align:center;color:#587087}
.lc-msg{border-radius:12px;padding:10px 14px}.lc-msg-e{background:#fdecec;color:#991b1b;border:1px solid #f5b5b5}
.lc-abrir:focus-visible,.lc-btn:focus-visible,.lc-grande:focus-visible{outline:3px solid #0ea5e9;outline-offset:2px}
@media(max-width:700px){.lc-det{grid-template-columns:1fr}.lc-grid{grid-template-columns:1fr}.lc-foto-m,.lc-sinfoto{width:80px;height:80px;min-height:80px}}
</style>`;}
  function html(){
    if(!puedeVer())return `<div class="lc-msg lc-msg-e">No tienes permiso para ver los lotes leídos.</div>`;
    escuchar();
    const todas=ES.lista,r=resumen(todas),vis=filtrar(todas,ES);
    return `<div class="lc">${estilos()}<div class="lc-nota" role="note">Aquí aparece cada <b>lote que lee el bot de WhatsApp</b> de la foto de la etiqueta, con sus datos y la foto original. La lectura la hace una IA: <b>compara con la foto</b> antes de confiar en un dato. Es solo consulta: <b>no mueve el stock ni cambia los lotes</b>.</div>
      ${ES.error?`<div class="lc-msg lc-msg-e" role="alert">${esc(ES.error)}</div>`:''}${ES.listo||todas.length?'':'<div class="lc-vacio">Consultando los lotes leídos…</div>'}${tarjetas(r)}${filtros()}${lista(vis)}</div>`;
  }
  W.lcSet=(k,v)=>{ES[k]=v;ES.abierta='';ES.visibles=48;if(k==='dias')cargar();repintar();};
  W.lcBuscar=v=>{ES.texto=v;ES.abierta='';ES.visibles=48;const pos=v.length;repintar();const i=document.querySelector('.lc-busca input');if(i){i.focus();try{i.setSelectionRange(pos,pos);}catch(_){/* tipo search */}}};
  W.lcActualizar=()=>cargar();
  W.lcAbrir=s=>{ES.abierta=ES.abierta===s?'':s;repintar();};
  W.lcMas=()=>{ES.visibles+=48;repintar();};
  W.apLecturasLotesUI={html,usar:o=>{oyentes.length=0;if(o&&o.pintar)oyentes.push(o.pintar);},detener,estado:ES,cargar,porSha,asegurar};
})(typeof window!=='undefined'?window:globalThis);
