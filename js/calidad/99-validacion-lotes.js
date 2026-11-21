/* =============================================================
   GLACIAL · CALIDAD › VALIDACIÓN DE LOTES
   -------------------------------------------------------------
   Muestra lo que valida el bot de WhatsApp (glacial-whatsapp): una fila por validación con su resultado (OK, OBSERVADO o RECHAZADO), el lote, el vencimiento, el
   turno, la marca, la línea, la FOTO del rótulo, los controles revisados y quién la revisó. Lo deja la función validaciones-lotes-ingesta en
   public.validaciones_lotes (glacial_54; la foto: glacial_64). Es el rótulo del PRODUCTO TERMINADO; las etiquetas de proveedores siguen en Asistente › Evidencias.
   · Solo lectura desde la página, salvo «Marcar como revisada» (quien tiene «calidadRevisar»). NO toca stock, lotes ni evidencias.
   · Permisos propios de Calidad (98-calidad-permisos.js, glacial_55): ver = «calidadVer», revisar = «calidadRevisar». El servidor los exige igual.
   · Se actualiza sola cada minuto mientras la pestaña está a la vista, y con «Actualizar».
   Se monta desde 100-calidad-pantalla.js (window.apValidacionLotesUI). Cargar DESPUÉS de 98-calidad-permisos.js.
   ============================================================= */
(function(raiz){
  'use strict';
  const RESULTADOS={OK:['Validado','vl-ok'],OBSERVADO:['Con observación','vl-obs'],RECHAZADO:['Rechazado','vl-mal']};
  const CONTROL={OK:['OK','vl-ok'],FALLA:['Falla','vl-mal'],NA:['No aplica','vl-gris']};
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};

  /* ---------- lógica pura (se prueba con node) ---------- */
  /** Fila del servidor → fila lista para mostrar (nunca lanza). */
  function normalizar(f){
    f=f&&typeof f==='object'?f:{};
    const res=RESULTADOS[f.resultado]?f.resultado:'OBSERVADO';
    const ms=Date.parse(f.validada_en||f.recibido_en||'');
    const controles=(Array.isArray(f.controles)?f.controles:[]).filter(c=>c&&typeof c==='object').map(c=>({nombre:String(c.nombre||'—'),resultado:CONTROL[c.resultado]?c.resultado:'NA',detalle:String(c.detalle||'')}));
    const d=f.datos&&typeof f.datos==='object'&&!Array.isArray(f.datos)?f.datos:{};
    const t=v=>v==null?'':String(v).replace(/\s+/g,' ').trim();
    const rotulo={producto:t(d.producto),marca:t(d.marca),turno:t(d.turno),semana:t(d.semana),diaJuliano:t(d.dia_juliano),fechaProduccion:t(d.fecha_produccion),vence:t(d.vence),leido:t(d.texto_rotulo)};
    const foto=/^calidad\/rotulos\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(String(f.foto_ruta||''))?String(f.foto_ruta):'';
    return {clave:String(f.clave||''),lote:String(f.lote||'—'),resultado:res,insumo:String(f.insumo||''),proveedor:String(f.proveedor||''),linea:String(f.linea||''),motivo:String(f.motivo||''),
      rotulo,fotoRuta:foto,controles,fallas:controles.filter(c=>c.resultado==='FALLA').length,evidencia:String(f.evidencia_sha256||''),ms:Number.isFinite(ms)?ms:0,
      revisada:f.revision_estado==='REVISADA',revisadaPor:String(f.revisada_por||''),revisadaMs:Date.parse(f.revisada_en||'')||0,nota:String(f.revision_nota||'')};
  }
  /** Una validación pide mirada si no es OK y todavía no la revisó una persona. */
  const pideRevision=x=>x.resultado!=='OK'&&!x.revisada;
  function resumen(lista){
    const r={total:lista.length,OK:0,OBSERVADO:0,RECHAZADO:0,pendientes:0,lotes:new Set()};
    lista.forEach(x=>{r[x.resultado]++;if(pideRevision(x))r.pendientes++;r.lotes.add(x.lote.toUpperCase());});
    r.lotes=r.lotes.size;return r;
  }
  const alnum=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  /** f: {resultado:''|OK|OBSERVADO|RECHAZADO, revision:''|PENDIENTE|REVISADA|PIDE, texto} */
  function filtrar(lista,f){
    f=f||{};const q=alnum(f.texto);
    return lista.filter(x=>{
      if(f.resultado&&x.resultado!==f.resultado)return false;
      if(f.revision==='REVISADA'&&!x.revisada)return false;
      if(f.revision==='PIDE'&&!pideRevision(x))return false;
      if(q&&!((typeof window!=='undefined'&&window.glacialBusqueda&&window.glacialBusqueda.coincide([x.lote,x.insumo,x.proveedor,x.linea,x.motivo,x.rotulo.producto,x.rotulo.marca,x.rotulo.turno,x.rotulo.vence],f.texto))||alnum([x.lote,x.insumo,x.proveedor,x.linea,x.motivo,x.rotulo.producto,x.rotulo.marca,x.rotulo.turno,x.rotulo.vence].join(' ')).includes(q)))return false;
      return true;
    }).sort((a,b)=>b.ms-a.ms);
  }
  const refFoto=ruta=>ruta?'supabase:glacial-fotos/'+ruta:'';
  const NUCLEO={RESULTADOS,CONTROL,normalizar,pideRevision,resumen,filtrar,refFoto};
  if(typeof module!=='undefined'&&module.exports)module.exports=NUCLEO;
  if(typeof window==='undefined'||!window.document)return;

  /* ---------- datos ---------- */
  const W=window;
  const ES={lista:[],listo:false,error:'',cargando:false,dias:30,resultado:'',revision:'',texto:'',abierta:'',nota:'',guardando:false,aviso:'',disponible:true};
  const oyentes=[];let temporizador=null,repinta=null,activo=false;
  const cliente=()=>W.glacialSupabaseCliente||null;
  const puedeVer=()=>{try{return !!(W.glacialCalidadPermisos&&W.glacialCalidadPermisos.puedeVer());}catch(_){return false;}};
  const puedeEscribir=()=>{try{return !!(W.glacialCalidadPermisos&&W.glacialCalidadPermisos.puedeRevisar());}catch(_){return false;}};
  function msgError(r){
    const m=String((r&&r.message)||''),c=String((r&&r.code)||'');
    if(c==='PGRST202'||c==='42883'||/could not find the function|does not exist|schema cache/i.test(m))return {faltaMigracion:true,texto:'Falta aplicar glacial_54 en Supabase: todavía no existe la tabla de validaciones.'};
    if(c==='42501'||/sin permiso/i.test(m))return {texto:'No tienes permiso para ver las validaciones de lotes.'};
    return {texto:m||'No se pudieron leer las validaciones.'};
  }
  async function cargar(){
    if(ES.cargando)return;
    const c=cliente();
    if(!c||typeof c.rpc!=='function'){ES.listo=true;ES.disponible=false;ES.error='Supabase no está disponible en esta sesión.';repintar();return;}
    ES.cargando=true;
    try{
      const desde=new Date(Date.now()-ES.dias*86400000).toISOString();
      const r=await c.rpc('validaciones_lotes_listar',{p_desde:desde,p_limite:500});
      if(r&&r.error){const e=msgError(r.error);ES.error=e.texto;ES.disponible=!e.faltaMigracion;}
      else{ES.lista=(Array.isArray(r&&r.data)?r.data:[]).map(normalizar);ES.error='';ES.disponible=true;}
    }catch(e){ES.error=(e&&e.message)||'No se pudieron leer las validaciones.';}
    ES.cargando=false;ES.listo=true;repintar();
  }
  function repintar(){oyentes.slice().forEach(f=>{try{f();}catch(_){/* una vista no rompe a otra */}});}
  function escuchar(){
    if(activo)return;activo=true;cargar();
    temporizador=setInterval(()=>{if(!document.hidden&&!bloqueado())cargar();},60000);
  }
  function detener(){activo=false;if(temporizador){clearInterval(temporizador);temporizador=null;}}
  const bloqueado=()=>!!document.querySelector('.vl input:focus,.vl textarea:focus,.vl select:focus');
  if(W.glacialCierresSesion)W.glacialCierresSesion.push(()=>{detener();ES.lista=[];ES.listo=false;ES.abierta='';});

  async function revisar(clave){
    if(ES.guardando||!puedeEscribir())return;
    ES.guardando=true;ES.aviso='';repintar();
    try{
      const r=await cliente().rpc('validaciones_lotes_revisar',{p_clave:clave,p_nota:ES.nota||null});
      if(r&&r.error)throw new Error(msgError(r.error).texto);
      ES.aviso=r&&r.data?'Marcada como revisada.':'Ya estaba revisada.';ES.abierta='';ES.nota='';
      ES.guardando=false;await cargar();
    }catch(e){ES.guardando=false;ES.aviso='No se pudo guardar: '+((e&&e.message)||e);repintar();}
  }

  /* ---------- pantalla ---------- */
  const fechaHora=ms=>{if(!ms)return '—';try{return new Date(ms).toLocaleString('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});}catch(_){return '—';}};
  const pill=(txt,cls)=>`<span class="vl-pill ${cls}">${esc(txt)}</span>`;
  function tarjetas(r){
    const k=(t,v,s,c)=>`<div class="vl-k ${c||''}"><span>${esc(t)}</span><b>${v}</b>${s?`<small>${esc(s)}</small>`:''}</div>`;
    return `<div class="vl-ks">${k('Validaciones',r.total,r.lotes+' lote'+(r.lotes===1?'':'s'))}${k('Validadas',r.OK,'sin problema','vl-k-ok')}${k('Con observación',r.OBSERVADO,'revisar el motivo',r.OBSERVADO?'vl-k-obs':'')}${k('Rechazadas',r.RECHAZADO,'no usar el lote',r.RECHAZADO?'vl-k-mal':'')}${k('Por revisar',r.pendientes,'observadas o rechazadas sin revisar',r.pendientes?'vl-k-obs':'')}</div>`;
  }
  function filtros(){
    const op=(v,t,sel)=>`<option value="${v}" ${sel===v?'selected':''}>${t}</option>`;
    return `<div class="vl-filtros">
      <label>Período<select onchange="vlSet('dias',Number(this.value))">${[7,30,90,180].map(n=>op(String(n),'Últimos '+n+' días',String(ES.dias))).join('')}</select></label>
      <label>Resultado<select onchange="vlSet('resultado',this.value)">${op('','Todos',ES.resultado)}${op('OK','Validadas',ES.resultado)}${op('OBSERVADO','Con observación',ES.resultado)}${op('RECHAZADO','Rechazadas',ES.resultado)}</select></label>
      <label>Revisión<select onchange="vlSet('revision',this.value)">${op('','Todas',ES.revision)}${op('PIDE','Por revisar',ES.revision)}${op('REVISADA','Revisadas',ES.revision)}</select></label>
      <label class="vl-busca">Buscar<input type="search" placeholder="Lote, producto, marca o turno" value="${esc(ES.texto)}" oninput="vlBuscar(this.value)" aria-label="Buscar validaciones"></label>
      <button type="button" class="vl-btn" onclick="vlActualizar()" ${ES.cargando?'disabled':''}>${ES.cargando?'Actualizando…':'Actualizar'}</button></div>`;
  }
  function imgFoto(x,cls){
    const F=W.glacialFotos,ref=refFoto(x.fotoRuta);
    if(!ref||!F)return `<span class="vl-sinfoto ${cls||''}">Sin foto</span>`;
    return `<img class="vl-foto ${cls||''}" loading="lazy" alt="Rótulo del lote ${esc(x.lote)}" ${F.atributosImg(ref)}>`;
  }
  /* Datos del rótulo que mandó el bot (los que no vienen, no se muestran). */
  function datosRotulo(x){
    const r=x.rotulo,fil=[['Lote validado',x.lote],['Producto',r.producto],['Marca / presentación',r.marca||x.insumo],['Turno',r.turno],['Línea',x.linea],['Fecha de producción',r.fechaProduccion],['Vencimiento',r.vence],['Semana',r.semana],['Día juliano',r.diaJuliano],['Texto leído en la foto',r.leido]].filter(([,v])=>v);
    return `<table class="vl-datos"><tbody>${fil.map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
  }
  function detalle(x){
    const ctl=x.controles.length?`<ul class="vl-ctl">${x.controles.map(c=>`<li>${pill(CONTROL[c.resultado][0],CONTROL[c.resultado][1])}<span><b>${esc(c.nombre)}</b>${c.detalle?` · ${esc(c.detalle)}`:''}</span></li>`).join('')}</ul>`:'<p class="vl-mut">El bot no envió controles detallados.</p>';
    const rev=x.revisada?`<p class="vl-rev">Revisada por <b>${esc(x.revisadaPor||'—')}</b> el ${esc(fechaHora(x.revisadaMs))}${x.nota?` · ${esc(x.nota)}`:''}</p>`
      :puedeEscribir()?`<div class="vl-accion"><label>Nota de la revisión (opcional)<textarea rows="2" maxlength="300" oninput="vlNota(this.value)">${esc(ES.nota)}</textarea></label>
          <button type="button" class="vl-btn vl-btn-p" onclick="vlRevisar('${esc(x.clave)}')" ${ES.guardando?'disabled':''}>${ES.guardando?'Guardando…':'Marcar como revisada'}</button></div>`
      :'<p class="vl-mut">Una persona autorizada puede marcarla como revisada.</p>';
    const foto=x.fotoRuta&&W.glacialFotos?`<a class="vl-grande" ${W.glacialFotos.atributosEnlace(refFoto(x.fotoRuta))} title="Abrir la foto en tamaño completo">${imgFoto(x,'vl-foto-g')}<span>Abrir en tamaño completo</span></a>`:'';
    return `<tr class="vl-det"><td colspan="8"><div class="vl-det-g">${foto?`<div class="vl-det-foto">${foto}</div>`:''}<div class="vl-det-datos">${datosRotulo(x)}${x.motivo?`<p class="vl-motivo"><b>Motivo:</b> ${esc(x.motivo)}</p>`:''}${ctl}${x.evidencia?`<p class="vl-mut">Evidencia: ${esc(x.evidencia.slice(0,12))}… (ver en Evidencias)</p>`:''}${rev}</div></div></td></tr>`;
  }
  function tabla(lista){
    if(!lista.length)return `<div class="vl-vacio">${ES.lista.length?'Ninguna validación coincide con el filtro.':'Todavía no hay validaciones en este período. Cuando el bot suba una, aparecerá aquí.'}</div>`;
    return `<div class="vl-tw"><table class="vl-t"><thead><tr><th>Foto</th><th>Fecha</th><th>Lote</th><th>Producto</th><th>Línea</th><th>Vence</th><th>Resultado</th><th>Revisión</th></tr></thead><tbody>${lista.map(x=>{
      const ab=ES.abierta===x.clave,r=RESULTADOS[x.resultado];
      return `<tr class="vl-fila ${ab?'vl-ab':''}" tabindex="0" role="button" aria-expanded="${ab}" onclick="vlAbrir('${esc(x.clave)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();vlAbrir('${esc(x.clave)}')}">
        <td data-label="Foto" class="vl-c-foto">${imgFoto(x,'vl-foto-m')}</td><td data-label="Fecha">${esc(fechaHora(x.ms))}</td>
        <td data-label="Lote"><b>${esc(x.lote)}</b>${x.rotulo.turno?`<small>Turno ${esc(x.rotulo.turno)}</small>`:''}${x.proveedor?`<small>${esc(x.proveedor)}</small>`:''}</td>
        <td data-label="Producto">${esc(x.rotulo.marca||x.insumo||x.rotulo.producto||'—')}${x.rotulo.marca&&x.rotulo.producto?`<small>${esc(x.rotulo.producto)}</small>`:''}</td><td data-label="Línea">${esc(x.linea||'—')}</td><td data-label="Vence">${esc(x.rotulo.vence||'—')}</td>
        <td data-label="Resultado">${pill(r[0],r[1])}${x.controles.length&&x.fallas?`<small>${x.fallas} control${x.fallas===1?'':'es'} con falla</small>`:''}</td>
        <td data-label="Revisión">${x.revisada?pill('Revisada','vl-ok'):x.resultado==='OK'?'<span class="vl-mut">No requiere</span>':pill('Por revisar','vl-obs')}</td></tr>${ab?detalle(x):''}`;}).join('')}</tbody></table></div>`;
  }
  function estilos(){return `<style>
.vl{display:grid;gap:14px}.vl *{box-sizing:border-box}
.vl-nota{background:#eaf5fc;border:1px solid #bfdcec;color:#0b4a6b;border-radius:12px;padding:10px 14px;font-size:13px}
.vl-ks{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.vl-k{background:#fff;border:1px solid #d9e7f1;border-radius:14px;padding:12px 14px}.vl-k span{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#587087}
.vl-k b{display:block;font-size:28px;line-height:1.15;margin:4px 0 2px;color:#0b2a4a}.vl-k small{color:#587087;font-size:12px}
.vl-k-ok b{color:#157a3b}.vl-k-obs b{color:#b45309}.vl-k-mal b{color:#c62828}
.vl-filtros{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;background:#fff;border:1px solid #d9e7f1;border-radius:14px;padding:12px 14px}
.vl-filtros label,.vl-accion label{display:grid;gap:4px;font-size:11.5px;font-weight:700;color:#587087;text-transform:uppercase;letter-spacing:.05em}
.vl-filtros select,.vl-filtros input,.vl-accion textarea{font:inherit;font-size:15px;font-weight:500;text-transform:none;letter-spacing:0;padding:8px 10px;border:1px solid #cddfec;border-radius:10px;min-height:44px;background:#fff;color:#14263a}
.vl-busca{flex:1 1 220px}.vl-busca input{width:100%}
.vl-btn{min-height:44px;border-radius:10px;border:1px solid #9fd0e6;background:#fff;color:#0877a6;font:inherit;font-weight:700;padding:0 16px;cursor:pointer}.vl-btn:disabled{opacity:.55;cursor:not-allowed}
.vl-btn-p{background:#0877a6;color:#fff;border-color:#0877a6;margin-top:8px}
.vl-tw{background:#fff;border:1px solid #d9e7f1;border-radius:14px;overflow-x:auto}
.vl-t{width:100%;border-collapse:collapse}.vl-t th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#587087;background:#f4f9fd;text-align:left;padding:10px}
.vl-t td{padding:10px;border-top:1px solid #eaf1f7;vertical-align:top}.vl-t td small{display:block;color:#587087;font-size:12px}
.vl-fila{cursor:pointer}.vl-fila:hover td{background:#f4fafe}.vl-ab td{background:#eef7fc}
.vl-pill{display:inline-block;font-size:11px;font-weight:800;border-radius:999px;padding:3px 10px;white-space:nowrap}
.vl-ok{background:#dff5e7;color:#157a3b}.vl-obs{background:#ffedd5;color:#b45309}.vl-mal{background:#fde8e8;color:#c62828}.vl-gris{background:#e8eef4;color:#587087}
.vl-det td{background:#f8fbfe;padding:14px 16px}.vl-motivo{margin:0 0 8px}.vl-ctl{list-style:none;margin:0 0 8px;padding:0;display:grid;gap:6px}.vl-ctl li{display:flex;gap:10px;align-items:baseline}
.vl-mut{color:#587087;font-size:12.5px;margin:4px 0}
.vl-foto{display:block;object-fit:cover;background:#eaf1f7;border-radius:8px}.vl-foto-m{width:56px;height:56px}.vl-foto-g{width:100%;max-height:460px;object-fit:contain}
.vl-sinfoto{display:flex;align-items:center;justify-content:center;width:56px;height:56px;background:#f1f5f9;color:#587087;font-size:10px;border-radius:8px;text-align:center}
.vl-c-foto{width:70px}.vl-det-g{display:grid;grid-template-columns:minmax(200px,1fr) minmax(0,1.5fr);gap:16px}.vl-det-g:has(.vl-det-foto:empty){grid-template-columns:1fr}
.vl-grande{display:grid;gap:6px;color:#0877a6;font-weight:700;font-size:13px;text-decoration:none}
.vl-datos{width:100%;border-collapse:collapse;margin:0 0 8px}.vl-datos th{width:40%;text-align:left;font-size:12px;color:#587087;font-weight:700;padding:4px 8px 4px 0;vertical-align:top}.vl-datos td{padding:4px 0;font-weight:600;overflow-wrap:anywhere}.vl-rev{margin:6px 0;color:#157a3b}
.vl-vacio{background:#fafcfe;border:1px dashed #c3d8e8;border-radius:12px;padding:22px;text-align:center;color:#587087}
.vl-msg{border-radius:12px;padding:10px 14px}.vl-msg-e{background:#fdecec;color:#991b1b;border:1px solid #f5b5b5}.vl-msg-k{background:#e7f6ec;color:#15803d;border:1px solid #b7e4c7}
.vl-fila:focus-visible,.vl-btn:focus-visible{outline:3px solid #0ea5e9;outline-offset:2px}
@media(max-width:700px){.vl-det-g{grid-template-columns:1fr}.vl-c-foto{width:auto}.vl-t thead{display:none}.vl-t tr.vl-fila{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:10px;border-top:1px solid #eaf1f7}.vl-t td{display:block;border:0;padding:2px 4px}.vl-t td[data-label]::before{content:attr(data-label);display:block;font-size:11px;font-weight:700;color:#587087;text-transform:uppercase}.vl-det td{display:block}.vl-det{display:block}}
</style>`;}
  function html(){
    if(!puedeVer())return `<div class="vl-msg vl-msg-e">No tienes permiso para ver las validaciones de lotes.</div>`;
    escuchar();
    const lista=ES.lista,r=resumen(lista),vis=filtrar(lista,ES);
    return `<div class="vl">${estilos()}<div class="vl-nota" role="note">Aquí llega el <b>rótulo de producto terminado</b> que <b>valida el bot de WhatsApp</b> (lote, vencimiento, turno, marca y línea) con la <b>foto original</b>. Las etiquetas de proveedores se revisan en Asistente › Evidencias. Es solo un registro: <b>no mueve el stock ni cambia los lotes</b>. Las observadas y rechazadas esperan que una persona las marque como revisadas.</div>
      ${ES.error?`<div class="vl-msg vl-msg-e" role="alert">${esc(ES.error)}</div>`:''}${ES.aviso?`<div class="vl-msg ${/^No se pudo/.test(ES.aviso)?'vl-msg-e':'vl-msg-k'}" role="status">${esc(ES.aviso)}</div>`:''}
      ${ES.listo||lista.length?'':'<div class="vl-vacio">Consultando las validaciones…</div>'}${tarjetas(r)}${filtros()}${tabla(vis)}</div>`;
  }
  W.vlSet=(k,v)=>{ES[k]=v;ES.abierta='';if(k==='dias'){cargar();}repintar();};
  W.vlBuscar=v=>{ES.texto=v;ES.abierta='';const pos=v.length;repintar();const i=document.querySelector('.vl-busca input');if(i){i.focus();try{i.setSelectionRange(pos,pos);}catch(_){/* tipo search */}}};
  W.vlActualizar=()=>{ES.aviso='';cargar();};
  W.vlAbrir=c=>{ES.abierta=ES.abierta===c?'':c;ES.nota='';ES.aviso='';repintar();};
  W.vlNota=v=>{ES.nota=v;};
  W.vlRevisar=c=>revisar(c);
  W.apValidacionLotesUI={html,usar:o=>{repinta=o&&o.pintar;oyentes.length=0;if(repinta)oyentes.push(repinta);},detener,estado:ES,cargar};
})(typeof window!=='undefined'?window:globalThis);
