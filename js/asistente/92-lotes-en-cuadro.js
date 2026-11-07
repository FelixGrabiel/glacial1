/* =============================================================
   LOTES DE INSUMO USADOS EN EL CUADRO (Etapa 2 de la trazabilidad de lotes)
   -------------------------------------------------------------
   En cada cuadro del reporte, el supervisor marca qué lotes de preforma, tapa, etiqueta y asa usó. Se ofrecen los lotes que tienen unidades
   ENTREGADAS A SU LÍNEA (Lotes › «Entregar a línea»). Cada marca se guarda en cuadro.lotesInsumo[] = {loteId, loteProveedor, categoria, insumo, unidadIds,
   fechaVencimiento}; la categoría decide la columna del Control de proceso (E L.PREFORMA, I L.TAPA, K LOTE etiqueta, M LOTE ASA): el Excel y el Drive se llenan solos.
   NO cambia el estado de las unidades (eso es el siguiente paso: consumo y peso): marcar un lote aquí solo lo anota en el reporte. Solo lectura de lotes y unidades
   (migración glacial_38: la marca «opera» lee insumosLotes e insumosUnidades). Un cuadro finalizado no se puede cambiar.
   Núcleo puro (disponibles, entradaDeLote, alternar) + pieza de pantalla; pensado para cargarse después de 90 y antes de usar el formulario (06-registro.js).
   ============================================================= */
(function(raiz){
  'use strict';
  /* Todas las categorías de insumo con lote (auditoría 2026-11-06, T2): las 4 primeras llenan columnas del Control de proceso; bolsas, cajas y
     polietileno también quedan en el cuadro para el informe de trazabilidad (planta de hielo, C20L, B20L…). «otro» no se ofrece. */
  const CATEGORIAS=[['preformas','Preformas'],['tapas','Tapas'],['etiquetas','Etiquetas'],['asas','Asas'],['bolsas','Bolsas'],['cajas','Cajas'],['polietileno','Polietileno']];
  const ESTADOS_EN_LINEA=['ENTREGADA_LINEA','EN_USO'];
  const texto=v=>(typeof v==='string'?v:(typeof v==='number'?String(v):''));

  /* Lotes con unidades en la línea: [{lote, unidades:[…]}] solo de las categorías que llenan el formulario, por categoría y vencimiento más próximo. */
  function disponibles(lotes,unidades,linea){
    const cats=CATEGORIAS.map(c=>c[0]);
    const porLote=new Map();
    (Array.isArray(unidades)?unidades:[]).forEach(u=>{
      if(!u||u.linea!==linea||!ESTADOS_EN_LINEA.includes(u.estado))return;
      if(!porLote.has(u.loteId))porLote.set(u.loteId,[]);
      porLote.get(u.loteId).push(u);
    });
    return (Array.isArray(lotes)?lotes:[]).filter(l=>l&&porLote.has(l.id)&&cats.includes(String(l.categoria||'').toLowerCase()))
      .map(l=>({lote:l,unidades:porLote.get(l.id).sort((a,b)=>String(a.numero).localeCompare(String(b.numero),'es',{numeric:true}))}))
      .sort((a,b)=>cats.indexOf(String(a.lote.categoria).toLowerCase())-cats.indexOf(String(b.lote.categoria).toLowerCase())||texto(a.lote.fechaVencimiento).localeCompare(texto(b.lote.fechaVencimiento))||texto(a.lote.loteProveedor).localeCompare(texto(b.lote.loteProveedor)));
  }
  /* Lo que se guarda en el cuadro por cada lote marcado. */
  function entradaDeLote(lote,unidades){
    return {loteId:texto(lote.id),loteProveedor:texto(lote.loteProveedor),categoria:String(lote.categoria||'').toLowerCase(),insumo:texto(lote.producto).slice(0,160),
      unidadIds:(unidades||[]).map(u=>u.id),fechaVencimiento:texto(lote.fechaVencimiento).slice(0,10)};
  }
  /* Marca o quita un lote de la lista del cuadro (sin repetir). Devuelve una lista nueva. */
  function alternar(lista,entrada,marcado){
    const sin=(Array.isArray(lista)?lista:[]).filter(x=>x&&x.loteId!==entrada.loteId);
    return marcado?sin.concat([entrada]):sin;
  }
  /* T5: lotes con cajas/bobinas EN ALMACÉN (de las categorías del panel, sin los unidos a otro), con su vencimiento: el supervisor las puede tomar para su línea. */
  function enAlmacen(lotes,unidades,{hoy,excluir}={}){
    const cats=CATEGORIAS.map(c=>c[0]),fuera=new Set(excluir||[]);
    const T=raiz.glacialTrazabilidadNucleo;
    const porLote=new Map();
    (Array.isArray(unidades)?unidades:[]).forEach(u=>{
      if(!u||u.estado!=='EN_ALMACEN')return;
      if(!porLote.has(u.loteId))porLote.set(u.loteId,[]);
      porLote.get(u.loteId).push(u);
    });
    return (Array.isArray(lotes)?lotes:[]).filter(l=>l&&!l.unidoEn&&porLote.has(l.id)&&!fuera.has(l.id)&&cats.includes(String(l.categoria||'').toLowerCase()))
      .map(l=>({lote:l,unidades:porLote.get(l.id).sort((a,b)=>String(a.numero).localeCompare(String(b.numero),'es',{numeric:true})),
        vencido:!!(T&&T.estadoVencimiento&&T.estadoVencimiento(l.fechaVencimiento,hoy||'',null).tipo==='vencido')}))
      .sort((a,b)=>texto(a.lote.fechaVencimiento||'9999').localeCompare(texto(b.lote.fechaVencimiento||'9999'))||texto(a.lote.loteProveedor).localeCompare(texto(b.lote.loteProveedor)));
  }
  /* Agrega al cuadro el lote con la caja/bobina tomada (sin repetir unidades). */
  function marcarConUnidad(lista,lote,unidadId){
    const previa=(Array.isArray(lista)?lista:[]).find(x=>x&&x.loteId===lote.id);
    const entrada=entradaDeLote(lote,[]);
    entrada.unidadIds=[...new Set(((previa&&previa.unidadIds)||[]).concat([unidadId]))];
    return alternar(lista,entrada,true);
  }
  const API={CATEGORIAS,disponibles,entradaDeLote,alternar,enAlmacen,marcarConUnidad};
  raiz.GlacialLotesEnCuadro=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;

  /* ---------- pantalla (solo navegador) ---------- */
  if(typeof document==='undefined'||typeof window==='undefined')return;
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cache={lotes:[],unidades:[],almacen:[],linea:'',listo:false,error:''};
  let cierres=[];
  function cerrar(){cierres.forEach(c=>{try{c();}catch(_){/* ya cerrada */}});cierres=[];}
  function escuchar(linea){
    if(!linea||typeof db==='undefined'||typeof state==='undefined'||!state.user)return;
    if(cache.linea===linea&&cierres.length)return;
    cerrar();cache.linea=linea;cache.lotes=[];cache.unidades=[];cache.almacen=[];cache.listo=false;cache.error='';
    const fallo=e=>{cache.error=(e&&(e.code||e.message))||'error';cache.listo=true;repintar();};
    try{
      cierres.push(db.collection('insumosUnidades').where('linea','==',linea).onSnapshot(s=>{cache.unidades=s.docs.map(d=>d.data()).filter(x=>x&&x.id&&x.loteId);cache.listo=true;cache.error='';repintar();},fallo));
      cierres.push(db.collection('insumosLotes').onSnapshot(s=>{cache.lotes=s.docs.map(d=>d.data()).filter(x=>x&&x.id);repintar();},fallo));
      // T5: lo que está en almacén, para que el supervisor lo tome para su línea (glacial_43). Si falla la lectura, solo no se ofrece.
      cierres.push(db.collection('insumosUnidades').where('estado','==','EN_ALMACEN').onSnapshot(s=>{cache.almacen=s.docs.map(d=>d.data()).filter(x=>x&&x.id&&x.loteId);repintar();},()=>{cache.almacen=[];}));
    }catch(e){fallo(e);}
  }
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(()=>{cerrar();cache.linea='';cache.lotes=[];cache.unidades=[];cache.listo=false;});
  let temporizador=null;
  function repintar(){
    clearTimeout(temporizador);
    temporizador=setTimeout(()=>{
      try{
        if(typeof state==='undefined'||!document.querySelector('.lc-panel'))return;
        const a=document.activeElement;
        if(a&&a.closest&&a.closest('.lc-panel')===null&&/INPUT|SELECT|TEXTAREA/.test(a.tagName))return;      // no interrumpe a quien está escribiendo en otro campo
        if(typeof renderFormTab==='function')renderFormTab();
      }catch(_){/* informativo */}
    },400);
  }
  const fmtVence=iso=>{const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'/'+m[2]+'/'+m[1]:'sin fecha';};

  const ETQ_ESTADO={ENTREGADA_LINEA:'Entregada a línea',EN_USO:'En uso'};
  const kg=n=>(Math.round(Number(n||0)*1000)/1000).toLocaleString('es-PE',{maximumFractionDigits:3})+' kg';
  /* UND estimadas por peso con la conversión vigente de la línea (Asistente › Conversiones). Solo si hay UNA conversión para esa
     categoría en la línea (p. ej. tapas de B7L); si hay dos con distinto peso o ninguna, no se estima. Es una referencia: el peso de la
     caja/bobina puede incluir el empaque. */
  function estimadoUnd(categoria,kgv){
    const C=window.glacialConversiones;if(!C||typeof C.opcionesKg!=='function'||!draft)return '';
    try{const ops=C.opcionesKg(draft.linea,categoria,draft.fecha);if(ops.length!==1)return '';
      const u=C.kgAUnidades(ops[0].config,kgv);return u>0?'≈ '+u.toLocaleString('es-PE')+' UND':'';}catch(_){return '';}
  }
  window.loteUnidadesEstimadas=(unidadId,kgv)=>{
    const u=cache.unidades.find(x=>x.id===unidadId);const lote=u&&cache.lotes.find(l=>l.id===u.loteId);
    return lote?estimadoUnd(lote.categoria,kgv):'';
  };
  /* Unidades del lote que están en la línea, con sus botones: «Marcar en uso» y «Registrar peso final» (las acciones las define 93-lotes-uso-cuadro.js). */
  function unidadesHtml(i,loteId,cerrado){
    const acc=typeof window.loteUsoMarcar==='function';
    const us=cache.unidades.filter(u=>u.loteId===loteId&&u.linea===draft.linea&&ESTADOS_EN_LINEA.includes(u.estado)).sort((a,b)=>String(a.numero).localeCompare(String(b.numero),'es',{numeric:true}));
    if(!us.length)return '';
    const lote=cache.lotes.find(l=>l.id===loteId),T=raiz.glacialTrazabilidadNucleo,uf=T&&T.unidadFisica?T.unidadFisica(lote&&lote.categoria):{titulo:'Unidad'};
    return '<div class="lc-uni">'+us.map(u=>'<div class="lc-u"><span><b>'+esc(uf.titulo)+' '+esc(u.numero)+'</b> · '+esc(ETQ_ESTADO[u.estado]||u.estado)+' · '+esc(kg(u.pesoActual))+(estimadoUnd(lote&&lote.categoria,u.pesoActual)?' <small style="color:#5a6b7b">('+esc(estimadoUnd(lote&&lote.categoria,u.pesoActual))+')</small>':'')+'</span>'+
      (acc&&!cerrado?(u.estado==='ENTREGADA_LINEA'?'<button type="button" class="btn btn-ghost btn-sm" onclick="loteUsoMarcar('+i+',\''+esc(u.id)+'\')">Marcar en uso</button>':'<button type="button" class="btn btn-ghost btn-sm" onclick="loteUsoCerrar('+i+',\''+esc(u.id)+'\')">Registrar peso final</button>'):'')+'</div>').join('')+'</div>';
  }

  /* Panel de un cuadro del formulario (lo llama 06-registro.js). */
  raiz.lotesCuadroHtml=function(i){
    if(typeof draft==='undefined'||!draft||typeof normalizarCuadros!=='function')return '';
    const q=normalizarCuadros(draft)[i];if(!q)return '';
    escuchar(draft.linea);
    if(/permission|permiso|denied/i.test(String(cache.error||'')))return '';          // sin la migración glacial_38 el panel no estorba: simplemente no aparece
    const marcados=Array.isArray(q.lotesInsumo)?q.lotesInsumo:[];
    const cerrado=q.estadoCuadro==='FINALIZADO';
    const disp=cache.linea===draft.linea?disponibles(cache.lotes,cache.unidades,draft.linea):[];
    const idsDisp=new Set(disp.map(d=>d.lote.id));
    const fuera=marcados.filter(m=>!idsDisp.has(m.loteId));      // marcados que ya no están en la línea (siguen en el reporte)
    const hoy=typeof GlacialFecha!=='undefined'&&GlacialFecha.fechaISOLocal?GlacialFecha.fechaISOLocal(Date.now()):(d=>d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0'))(new Date(Date.now()-5*3600000));
    const puedeTomar=!cerrado&&typeof window.loteTomarAlmacen==='function'&&!(typeof reporteEstaBloqueado==='function'&&reporteEstaBloqueado());
    const alm=puedeTomar?enAlmacen(cache.lotes,cache.almacen,{hoy}):[];
    const T=raiz.glacialTrazabilidadNucleo;
    const almHtml=clave=>{
      const ls=alm.filter(a=>String(a.lote.categoria).toLowerCase()===clave);
      if(!ls.length)return '';
      return '<details class="lc-alm"><summary>En almacén: tomar para '+esc(draft.linea)+' ('+ls.length+' lote'+(ls.length===1?'':'s')+')</summary>'+ls.map(a=>{
        const uf=T&&T.unidadFisica?T.unidadFisica(a.lote.categoria):{titulo:'Caja'};
        const visibles=a.unidades.slice(0,8);
        return '<div class="lc-fila lc-fila-alm"><span><b>'+esc(a.lote.loteProveedor)+'</b> · '+esc(a.lote.producto)+' <small>vence '+esc(fmtVence(a.lote.fechaVencimiento))+' · '+a.unidades.length+' en almacén</small></span></div>'+
          (a.vencido?'<div class="lc-nota lc-err" style="margin-left:26px">Lote vencido: no se toma.</div>':
          '<div class="lc-uni">'+visibles.map(u=>'<div class="lc-u"><span><b>'+esc(uf.titulo)+' '+esc(u.numero)+'</b> · '+esc(kg(u.pesoActual))+'</span><button type="button" class="btn btn-ghost btn-sm" onclick="loteTomarAlmacen('+i+',\''+esc(u.id)+'\')">Tomar para '+esc(draft.linea)+'</button></div>').join('')+
          (a.unidades.length>visibles.length?'<div class="lc-nota">… y '+(a.unidades.length-visibles.length)+' más.</div>':'')+'</div>');
      }).join('')+'</details>';
    };
    const grupos=CATEGORIAS.map(([clave,titulo])=>{
      const items=disp.filter(d=>String(d.lote.categoria).toLowerCase()===clave);
      const extra=fuera.filter(m=>m.categoria===clave);
      const almacenHtml=almHtml(clave);
      if(!items.length&&!extra.length&&!almacenHtml)return '';
      return '<div class="lc-grupo"><b>'+esc(titulo)+'</b>'+items.map(d=>{
        const on=marcados.some(m=>m.loteId===d.lote.id);
        return '<label class="lc-fila"><input type="checkbox" '+(on?'checked ':'')+(cerrado?'disabled ':'')+'onchange="loteCuadroAlternar('+i+',\''+esc(d.lote.id)+'\',this.checked)"> <span><b>'+esc(d.lote.loteProveedor)+'</b> · '+esc(d.lote.producto)+' <small>vence '+esc(fmtVence(d.lote.fechaVencimiento))+' · '+d.unidades.length+' unidad(es) en línea</small></span></label>'+(on?unidadesHtml(i,d.lote.id,cerrado):'');
      }).join('')+extra.map(m=>'<label class="lc-fila"><input type="checkbox" checked '+(cerrado?'disabled ':'')+'onchange="loteCuadroAlternar('+i+',\''+esc(m.loteId)+'\',this.checked)"> <span><b>'+esc(m.loteProveedor)+'</b> · '+esc(m.insumo)+' <small>ya no figura en la línea (se conserva en el reporte)</small></span></label>').join('')+almacenHtml+'</div>';
    }).join('');
    const msg=cache.error?'<div class="lc-nota lc-err">No se pudieron leer los lotes de la línea. Si el problema sigue, avisa al Administrador.</div>':
      !cache.listo?'<div class="lc-nota">Consultando los lotes de '+esc(draft.linea)+'…</div>':
      !grupos?'<div class="lc-nota">No hay lotes de insumo (preformas, tapas, etiquetas, asas, bolsas, cajas o polietileno) entregados a '+esc(draft.linea)+' ni en almacén. Los lotes nacen de las fotos validadas en Asistente › Evidencias.</div>':'';
    return '<div class="panel lc-panel" style="margin:10px 0 0;"><style>.lc-grupo{margin:6px 0}.lc-fila{display:flex;gap:8px;align-items:flex-start;padding:5px 0;font-size:13px;cursor:pointer}.lc-fila small{display:block;color:#5a6b7b}.lc-nota{font-size:13px;color:#5a6b7b}.lc-err{color:#c62828}.lc-uni{margin:0 0 6px 26px;display:grid;gap:4px}.lc-u{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;font-size:13px;padding:4px 8px;border:1px solid #e3e8ee;border-radius:8px}.lc-alm{margin:4px 0 2px 0;font-size:13px}.lc-alm summary{cursor:pointer;color:#0877A6;font-weight:700;padding:8px 0;min-height:36px}.lc-fila-alm{cursor:default;padding-left:26px}.lc-u .btn{min-height:40px}</style>'+
      '<div class="panel-head"><h4 style="margin:0;">Lotes de insumo usados <small style="font-weight:400;color:#5a6b7b">(trazabilidad y Control de proceso)</small></h4></div><div class="panel-body">'+
      (grupos||'')+msg+(marcados.length?'<div class="lc-nota" style="margin-top:6px">En este cuadro: '+marcados.map(m=>esc(m.loteProveedor)).join(' · ')+'</div>':'')+'</div></div>';
  };
  /* T5: tras tomar una caja/bobina del almacén (93), el lote queda marcado en el cuadro con esa unidad. */
  raiz.loteCuadroMarcarTomada=function(i,lote,unidadId){
    if(typeof draft==='undefined'||!draft||typeof normalizarCuadros!=='function'||!lote)return;
    const q=normalizarCuadros(draft)[i];if(!q||q.estadoCuadro==='FINALIZADO')return;
    q.lotesInsumo=marcarConUnidad(q.lotesInsumo,lote,unidadId);
    if(typeof programarGuardadoAutomaticoReporte==='function')programarGuardadoAutomaticoReporte();
    const y=window.scrollY;
    if(typeof renderFormTab==='function'){renderFormTab();requestAnimationFrame(()=>window.scrollTo(0,y));}
  };
  raiz.loteCuadroAlternar=function(i,loteId,marcado){
    if(typeof draft==='undefined'||!draft||typeof normalizarCuadros!=='function')return;
    const q=normalizarCuadros(draft)[i];if(!q||q.estadoCuadro==='FINALIZADO')return;
    const actual=(q.lotesInsumo||[]).find(m=>m.loteId===loteId);
    const info=cache.lotes.find(l=>l.id===loteId);
    const entrada=info?entradaDeLote(info,cache.unidades.filter(u=>u.loteId===loteId&&u.linea===draft.linea&&ESTADOS_EN_LINEA.includes(u.estado))):actual;
    if(!entrada)return;
    q.lotesInsumo=alternar(q.lotesInsumo,entrada,!!marcado);
    const y=window.scrollY;
    if(typeof renderFormTab==='function'){renderFormTab();requestAnimationFrame(()=>window.scrollTo(0,y));}
  };
})(typeof window!=='undefined'?window:globalThis);
