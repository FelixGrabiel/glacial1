/* =============================================================
   GLACIAL · EVIDENCIAS › VALIDAR RÁPIDO (auditoría de trazabilidad 13/11/2026, punto 3)
   -------------------------------------------------------------
   Medido en PRODUCCIÓN: 96 fotos de etiquetas pendientes; 34 ya cumplen todas las reglas y solo esperan que una persona las mire, 39 tienen 1–2 datos
   dudosos. Esta vista es una COLA: una foto a la vez, grande, con solo los datos que se validan (los mismos de Evidencias) y un botón
   «✔ Coincide con la foto · crear lote» que, en dos pasos ya existentes:
     1) guarda lo que se corrigió y confirma los datos dudosos tal como se ven (85 · guardarEdiciones: un evento de auditoría por dato);
     2) aprueba la evidencia y crea el lote o agrega la caja/bobina (88 · crearLoteDesdeEvidencia: las mismas reglas que «Confirmar y crear lote»).
   Luego pasa sola a la siguiente. Orden: primero las listas, luego las que tienen dudas, al final las incompletas; las del mismo lote del proveedor juntas.
   La IA solo propone: la persona mira la foto y valida. Lo que no es simple (posible lote repetido, rechazar, pedir otra foto) se hace en «Abrir completo».
   No necesita migración (usa las mismas reglas del servidor que Evidencias y Lotes).
   ============================================================= */
(function(raiz){
  'use strict';
  const alnum=v=>String(v==null?'':v).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const ES_DUDA=/^Confirma o corrige antes de aprobar/;
  /** {tipo:'lista'|'dudas'|'incompleta', dudosos:[campo], errores:[...]} a partir del diagnóstico de Lotes (89) y de los campos sin confirmar. */
  function clasificar(dudosos,errores){
    const err=(errores||[]).filter(e=>!ES_DUDA.test(e));
    const dud=Array.isArray(dudosos)?dudosos:[];
    return {tipo:err.length?'incompleta':dud.length?'dudas':'lista',dudosos:dud,errores:err};
  }
  const RANGO={lista:0,dudas:1,incompleta:2};
  /** items: [{id, tipo, categoria, lote, fotoMs}] → mismo arreglo ordenado: tipo, luego grupo (categoría + lote del proveedor, el más antiguo primero), luego foto. */
  function ordenarCola(items){
    const lista=(Array.isArray(items)?items:[]).slice();
    const primeraDeGrupo=new Map();
    lista.forEach(x=>{const g=x.categoria+'|'+alnum(x.lote);const m=primeraDeGrupo.get(g);if(m===undefined||x.fotoMs<m)primeraDeGrupo.set(g,x.fotoMs);});
    const grupo=x=>x.categoria+'|'+alnum(x.lote);
    return lista.sort((a,b)=>(RANGO[a.tipo]-RANGO[b.tipo])||(primeraDeGrupo.get(grupo(a))-primeraDeGrupo.get(grupo(b)))||grupo(a).localeCompare(grupo(b))||(a.fotoMs-b.fotoMs)||String(a.id).localeCompare(String(b.id)));
  }
  /** Lo que cambió en el formulario respecto del documento. valores: {campo: texto}; categoria: texto. Devuelve {cambios, confirmar}. */
  function cambiosDe(doc,valores,categoria,camposVisibles,sinConfirmar){
    const cambios={},confirmar=[];
    (camposVisibles||[]).forEach(def=>{
      const c=doc.campos&&doc.campos[def.campo];if(!c)return;
      const antes=c.valor===null||c.valor===undefined?'':String(c.valor);
      const ahora=String(valores&&valores[def.campo]!==undefined?valores[def.campo]:antes).trim();
      if(ahora!==antes.trim())cambios[def.campo]=ahora;
      else if((sinConfirmar||[]).includes(c.estado))confirmar.push(def.campo);
    });
    if(categoria&&categoria!==doc.categoria)cambios.categoria=categoria;
    return {cambios,confirmar};
  }
  const API={clasificar,ordenarCola,cambiosDe};
  raiz.glacialValidarRapido=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;

  /* ---------- pantalla (solo navegador) ---------- */
  if(typeof document==='undefined'||typeof window==='undefined')return;
  const N=()=>window.glacialEvidenciasNucleo,EV=()=>window.glacialEvidenciasDatos,T=()=>window.glacialTrazabilidadNucleo,Z=()=>window.glacialTrazabilidadDatos;
  const L=()=>window.iiLotesUI,F=()=>window.glacialFotos||null;
  const listo=()=>!!(N()&&EV()&&T()&&Z()&&L()&&typeof L().diagnostico==='function');
  const esc=v=>typeof escaparHtml==='function'?escaparHtml(String(v==null?'':v)):String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const S={abierto:false,filtro:'',actual:'',saltadas:new Set(),rot:{},msg:null,ocupado:false,hechas:0,hechasIds:new Set()};

  function candidatas(){
    const n=N(),ev=EV();
    return (ev.cache.lista||[]).filter(d=>d&&!d.loteId&&!S.hechasIds.has(d.id)&&n.EDITABLES.includes(d.estado)&&d.tipoDocumento==='etiqueta_insumo');
  }
  function cola(){
    const n=N();
    const items=candidatas().map(d=>{
      let g;try{g=L().diagnostico(d);}catch(e){g={errores:[String(e&&e.message||e)],avisos:[],duplicados:[],datos:{}};}
      const k=clasificar(n.camposSinConfirmar(d),g.errores);
      return {id:d.id,doc:d,diag:g,tipo:k.tipo,dudosos:k.dudosos,errores:k.errores,categoria:d.categoria,lote:(d.campos&&d.campos.lote&&d.campos.lote.valor)||'',fotoMs:Number(n.fechaFoto(d).ms)||0};
    });
    return ordenarCola(items);
  }
  const filtroEfectivo=k=>S.filtro||(k.lista?'lista':k.dudas?'dudas':'todas');
  const cuenta=c=>({lista:c.filter(x=>x.tipo==='lista').length,dudas:c.filter(x=>x.tipo==='dudas').length,incompleta:c.filter(x=>x.tipo==='incompleta').length});

  /* Botón de la cabecera de Evidencias (86 lo pinta si existe). */
  window.ieVrBoton=()=>{
    if(!listo()||!EV().puedeEscribir()||!Z().puedeEscribir())return '';
    const n=candidatas().length;if(!n)return '';
    let lis=0;try{lis=cuenta(cola()).lista;}catch(_){lis=0;}
    return ' <button type="button" class="ii-btn" onclick="ieVrAbrir()" title="Una foto a la vez: mira la foto, corrige si hace falta y crea el lote con un clic">⚡ Validar rápido'+(lis?' ('+lis+' lista'+(lis===1?'':'s')+')':'')+'</button>';
  };

  function campoHtml(def,d,dudoso){
    const c=d.campos[def.campo],n=N();
    const v=c.valor===null||c.valor===undefined?'':String(c.valor);
    const tipo=def.tipo==='fecha'?'date':def.tipo==='numero'?'number':'text';
    const sug=dudoso&&c.valor_sugerido!==undefined&&c.valor_sugerido!==null?`<button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="ieVrSugerido('${esc(def.campo)}')">Usar ${esc(def.tipo==='fecha'?n.fechaPantalla(c.valor_sugerido):c.valor_sugerido)}</button>`:'';
    return `<label class="vr-campo ${dudoso?'vr-duda':''}"><span>${esc(def.etiqueta)}${dudoso?' <b class="vr-tag">revisar</b>':''}</span>
      <input class="ie-in" id="vr-c-${esc(def.campo)}" data-campo="${esc(def.campo)}" type="${tipo}" ${tipo==='number'?'step="any" inputmode="decimal"':''} value="${esc(v)}" autocomplete="off">
      ${dudoso&&c.duda?`<small class="vr-motivo">IA: ${esc(c.duda)}</small>`:''}${sug}</label>`;
  }
  function fotoHtml(d){
    const f=F(),rot=S.rot[d.id]||0;
    if(!f||!d.foto||!d.foto.url)return '<div class="vr-foto-caja"><p class="ii-mut">Foto no disponible: valida desde «Abrir completo».</p></div>';
    return `<div class="vr-foto-bar"><button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="ieVrRotar(-90)" aria-label="Girar a la izquierda">⟲</button><button type="button" class="ii-btn ii-btn-o ii-btn-s" onclick="ieVrRotar(90)" aria-label="Girar a la derecha">⟳</button>
      <a class="ii-btn ii-btn-o ii-btn-s" ${f.atributosEnlace(d.foto.url)} rel="noopener noreferrer">Abrir foto</a></div>
      <div class="vr-foto-caja"><img class="vr-foto" alt="Fotografía de la etiqueta" ${f.atributosImg(d.foto.url)} style="transform:rotate(${rot}deg)"></div>`;
  }
  function destinoHtml(x){
    const g=x.diag,t=T();
    if(g.duplicados&&g.duplicados.length)return `<div class="ii-msg ii-msg-error" role="note">⚠ Posible lote repetido (mismo lote del proveedor con otro proveedor o producto: ${g.duplicados.map(y=>esc(y.lote.id)).join(', ')}). Ábrela completa para elegir si va a ese lote o a uno nuevo.</div>`;
    const uf=t.unidadFisica(x.categoria);
    const donde=g.leyenda&&g.leyenda.tipo==='LINEA'&&g.leyenda.linea?'entregada a <b>'+esc(g.leyenda.linea)+'</b>':'en <b>almacén</b>';
    const art=(Z().sugerencias(x.doc).candidatos||[])[0];
    const recordado=art&&art.razones&&art.razones.some(r=>/elegido antes/.test(r));
    return `<p class="vr-dest">${g.lote?`Se agrega una ${esc(uf.uno)} al lote <b>${esc(g.lote.id)}</b> (${esc(g.lote.loteProveedor)})`:`Se crea un <b>lote nuevo</b>${g.datos&&g.datos.loteProveedor?' para el lote del proveedor <b>'+esc(g.datos.loteProveedor)+'</b>':''}`}; quedará ${donde}.
      <br><small class="ii-mut">Artículo del catálogo: ${recordado?'<b>'+esc(art.nombre)+'</b> (elegido antes para este proveedor y producto)':'se asigna después desde la ficha del lote'}.</small></p>`;
  }
  const CLAVES=['proveedor','producto','lote','cantidad_valor','cantidad_unidad','peso_neto_kg'];
  function cuerpo(){
    const zc=Z().cache||{};
    if(!(zc.listo&&zc.listo.lotes&&zc.listo.unidades)&&!zc.error)return '<p class="ii-mut vr-vacio">Consultando los lotes para saber a cuál va cada foto…</p>';
    const c=cola(),k=cuenta(c);
    const filtro=filtroEfectivo(k);
    const vis=c.filter(x=>filtro==='todas'||x.tipo===filtro);
    let x=vis.find(y=>y.id===S.actual)||vis.find(y=>!S.saltadas.has(y.id))||vis[0]||null;
    if(x)S.actual=x.id;
    const chip=(v,t,n)=>`<button type="button" class="vr-chip ${filtro===v?'vr-chip-act':''}" onclick="ieVrFiltro('${v}')">${t} <b>${n}</b></button>`;
    const chips=`<div class="vr-chips">${chip('lista','Listas',k.lista)}${chip('dudas','Con dudas',k.dudas)}${chip('incompleta','Incompletas',k.incompleta)}${chip('todas','Todas',c.length)}</div>`;
    const msg=S.msg?`<div class="ii-msg ii-msg-${S.msg.tipo}" role="${S.msg.tipo==='error'?'alert':'status'}">${S.msg.texto}</div>`:'';
    if(!x)return chips+msg+`<p class="ii-mut vr-vacio">${c.length?'No hay fotos en este filtro.':'¡No quedan fotos de etiquetas por validar!'}${S.hechas?' Validaste '+S.hechas+' en esta sesión.':''}</p>`;
    const n=N(),d=x.doc,pos=vis.indexOf(x)+1;
    const dud=new Set(x.dudosos);
    /* Siempre los datos de la llave del lote y la cantidad; los demás solo si traen valor o hay que revisarlos (el resto, plegado). */
    const tieneValor=def=>{const c=d.campos[def.campo];return c&&c.valor!==null&&c.valor!==undefined&&c.valor!=='';};
    const visibles=n.CAMPOS_VISIBLES.filter(def=>CLAVES.includes(def.campo)||tieneValor(def)||dud.has(def.campo));
    const plegados=n.CAMPOS_VISIBLES.filter(def=>!visibles.includes(def));
    const campos=visibles.map(def=>campoHtml(def,d,dud.has(def.campo))).join('')+
      (plegados.length?`<details class="vr-mas"><summary>Otros datos vacíos (${plegados.map(x=>esc(x.etiqueta)).join(', ')})</summary>${plegados.map(def=>campoHtml(def,d,false)).join('')}</details>`:'');
    const cats=n.CATEGORIAS.map(cat=>`<option value="${esc(cat)}" ${cat===d.categoria?'selected':''}>${esc(cat)}</option>`).join('');
    const etiqueta={lista:'<span class="ii-pill ii-p-verde"><i></i>Lista</span>',dudas:'<span class="ii-pill ii-p-naranja"><i></i>'+x.dudosos.length+' por revisar</span>',incompleta:'<span class="ii-pill ii-p-rojo"><i></i>Incompleta</span>'}[x.tipo];
    const errores=x.errores.length?`<div class="ii-msg ii-msg-error" role="note"><b>Falta resolver:</b> ${x.errores.map(esc).join(' ')}</div>`:'';
    const bloqueo=x.diag.duplicados&&x.diag.duplicados.length;
    return chips+msg+`<div class="vr-cab"><span>Foto <b>${pos}</b> de ${vis.length} · ${esc(n.tituloEvidencia(d))} ${etiqueta}</span><small class="ii-mut">foto ${esc(new Date((Number(n.fechaFoto(d).ms)||0)-5*3600000).toISOString().slice(0,16).replace('T',' '))}${d.leyenda?' · leyenda «'+esc(d.leyenda)+'»':''}</small></div>
      <div class="vr-cols"><div class="vr-col-foto">${fotoHtml(d)}</div>
      <div class="vr-col-datos"><label class="vr-campo"><span>Categoría</span><select class="ie-in" id="vr-cat">${cats}</select></label>${campos}${errores}${destinoHtml(x)}</div></div>
      <div class="vr-acc"><button type="button" class="ii-btn ii-btn-o" onclick="ieVrSaltar()">Saltar →</button><button type="button" class="ii-btn ii-btn-o" onclick="ieVrCompleto()">Abrir completo</button>
        <button type="button" class="ii-btn" id="vr-ok" onclick="ieVrOk()" ${bloqueo||S.ocupado?'disabled':''}>✔ Coincide con la foto · crear lote</button></div>
      <p class="ii-mut vr-nota">Al confirmar, los datos marcados «revisar» quedan confirmados tal como los ves (o con tu corrección) y se crea el lote con las mismas reglas de «Confirmar y crear lote». Para rechazar o pedir otra foto, usa «Abrir completo».</p>`;
  }
  function pintar(){
    const r=document.getElementById('modal-root');if(!r||!S.abierto)return;
    r.innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)ieVrCerrar()"><div class="modal ii-modal ii-modal-ancho vr-modal" role="dialog" aria-modal="true" aria-label="Validar rápido"><div class="modal-head"><h3>⚡ Validar rápido</h3>
      <button class="modal-close" onclick="ieVrCerrar()" aria-label="Cerrar">✕</button></div><div class="modal-body" id="vr-cuerpo">${cuerpo()}</div></div></div>`;
    estilos();
  }
  let espera=null;
  window.ieVrAbrir=()=>{
    if(!listo())return;
    S.abierto=true;S.msg=null;S.saltadas=new Set();S.actual='';S.filtro='';
    try{Z().escuchar();}catch(_){/* la pantalla avisa si no se pueden leer */}
    pintar();
    clearInterval(espera);
    espera=setInterval(()=>{const zc=Z().cache||{};if(!S.abierto||(zc.listo&&zc.listo.lotes&&zc.listo.unidades)||zc.error){clearInterval(espera);if(S.abierto)pintar();}},300);
  };
  window.ieVrCerrar=()=>{S.abierto=false;if(typeof closeModal==='function')closeModal();else{const r=document.getElementById('modal-root');if(r)r.innerHTML='';}
    const U=window.iiEvidenciasUI;if(U&&S.hechas)U.repintar();};
  window.ieVrFiltro=f=>{S.filtro=f;S.actual='';S.msg=null;pintar();};
  window.ieVrRotar=g=>{if(!S.actual)return;S.rot[S.actual]=((S.rot[S.actual]||0)+g+360)%360;const i=document.querySelector('.vr-foto');if(i)i.style.transform='rotate('+S.rot[S.actual]+'deg)';};
  window.ieVrSugerido=campo=>{const d=EV().porId(S.actual);const c=d&&d.campos[campo];const i=document.getElementById('vr-c-'+campo);if(c&&i&&c.valor_sugerido!=null)i.value=String(c.valor_sugerido);};
  window.ieVrSaltar=()=>{
    if(!S.actual)return;
    S.saltadas.add(S.actual);S.msg=null;
    const c=cola(),f=filtroEfectivo(cuenta(c)),vis=c.filter(x=>f==='todas'||x.tipo===f);
    const i=vis.findIndex(x=>x.id===S.actual);
    const sig=vis.slice(i+1).find(x=>!S.saltadas.has(x.id))||vis.find(x=>!S.saltadas.has(x.id));
    if(!sig)S.saltadas=new Set();
    S.actual=sig?sig.id:'';pintar();
  };
  window.ieVrCompleto=()=>{
    const id=S.actual;ieVrCerrar();
    if(id&&typeof window.ieSel==='function')window.ieSel(id);
  };
  window.ieVrOk=async()=>{
    const id=S.actual,ev=EV(),z=Z(),n=N();
    const d=ev.porId(id);if(!d||S.ocupado)return;
    const valores={};document.querySelectorAll('#vr-cuerpo [data-campo]').forEach(i=>{valores[i.dataset.campo]=i.value;});
    const cat=(document.getElementById('vr-cat')||{}).value||d.categoria;
    const {cambios,confirmar}=cambiosDe(d,valores,cat,n.CAMPOS_VISIBLES,n.SIN_CONFIRMAR);
    S.ocupado=true;const b=document.getElementById('vr-ok');if(b){b.disabled=true;b.textContent='Guardando…';}
    let doc=d;
    try{
      if(Object.keys(cambios).length||confirmar.length){const r=await ev.guardarEdiciones(id,d.rev,{cambios,confirmar});doc=r.doc||d;}
      const g=L().diagnostico(doc);
      if(g.errores.length){S.ocupado=false;S.msg={tipo:'error',texto:'Se guardaron tus correcciones, pero falta: '+g.errores.map(esc).join(' ')};pintar();return;}
      if(g.duplicados&&g.duplicados.length){S.ocupado=false;S.msg={tipo:'error',texto:'Posible lote repetido: ábrela completa para elegir el lote.'};pintar();return;}
      const art=(z.sugerencias(doc).candidatos||[])[0];
      const articuloId=art&&art.razones&&art.razones.some(r=>/elegido antes/.test(r))?art.id:'';
      if(b)b.textContent='Creando el lote…';
      const r=await z.crearLoteDesdeEvidencia(id,doc.rev,{articuloId});
      S.hechas++;S.hechasIds.add(id);
      S.msg={tipo:'ok',texto:'✔ '+esc(n.tituloEvidencia(doc))+': '+(r.accion==='lote_nuevo'?'lote nuevo ':'agregada al lote ')+'<b>'+esc(r.loteId)+'</b> · '+esc(r.unidadId)+'.'};
      S.saltadas.delete(id);S.actual='';
    }catch(e){
      S.msg={tipo:'error',texto:esc((z.mensajeError||ev.mensajeError)(e))};
    }
    S.ocupado=false;
    setTimeout(pintar,350);                    // deja llegar el cambio en vivo (la evidencia ya con su lote sale de la cola)
  };

  const css=`.modal.vr-modal{max-width:1180px;width:calc(100vw - 24px)}.vr-mas{font-size:13px}.vr-mas summary{cursor:pointer;color:#0877A6;padding:6px 0}.vr-mas .vr-campo{margin-top:6px}.vr-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.vr-chip{border:1px solid #cfe0ea;background:#fff;border-radius:999px;padding:7px 12px;min-height:36px;font-size:13px;cursor:pointer;color:#033350}.vr-chip-act{background:#033350;color:#fff;border-color:#033350}
.vr-cab{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;justify-content:space-between;margin:4px 0 10px}
.vr-cols{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:14px}.vr-foto-bar{display:flex;gap:6px;margin-bottom:6px}
.vr-foto-caja{background:#0f2537;border-radius:10px;display:flex;align-items:center;justify-content:center;min-height:320px;max-height:62vh;overflow:hidden}
.vr-foto{max-width:100%;max-height:62vh;object-fit:contain;transition:none}
.vr-col-datos{display:grid;gap:8px;align-content:start}.vr-campo{display:grid;gap:3px;font-size:13px}.vr-campo>span{font-weight:700;color:#033350}
.vr-campo .ie-in{min-height:42px;font-size:15px}.vr-duda .ie-in{border-color:#d97706;background:#fffbeb}.vr-tag{color:#b45309;font-size:11px;text-transform:uppercase;margin-left:4px}
.vr-motivo{color:#92400e}.vr-dest{font-size:13.5px;margin:6px 0 0;padding:8px 10px;background:#f6fafc;border:1px solid #cfe0ea;border-radius:8px}
.vr-acc{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:12px}.vr-acc .ii-btn{min-height:44px}.vr-nota{font-size:12px;margin:8px 0 0}.vr-vacio{padding:24px 0;text-align:center}
@media(max-width:760px){.vr-cols{grid-template-columns:1fr}.vr-foto-caja{min-height:220px;max-height:46vh}.vr-foto{max-height:46vh}.vr-acc .ii-btn{flex:1 1 100%}}`;
  function estilos(){if(document.getElementById('vr-css'))return;const s=document.createElement('style');s.id='vr-css';s.textContent=css;document.head.appendChild(s);}
})(typeof window!=='undefined'?window:globalThis);
