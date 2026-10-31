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
  const CATEGORIAS=[['preformas','Preformas'],['tapas','Tapas'],['etiquetas','Etiquetas'],['asas','Asas']];
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
  const API={CATEGORIAS,disponibles,entradaDeLote,alternar};
  raiz.GlacialLotesEnCuadro=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;

  /* ---------- pantalla (solo navegador) ---------- */
  if(typeof document==='undefined'||typeof window==='undefined')return;
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cache={lotes:[],unidades:[],linea:'',listo:false,error:''};
  let cierres=[];
  function cerrar(){cierres.forEach(c=>{try{c();}catch(_){/* ya cerrada */}});cierres=[];}
  function escuchar(linea){
    if(!linea||typeof db==='undefined'||typeof state==='undefined'||!state.user)return;
    if(cache.linea===linea&&cierres.length)return;
    cerrar();cache.linea=linea;cache.lotes=[];cache.unidades=[];cache.listo=false;cache.error='';
    const fallo=e=>{cache.error=(e&&(e.code||e.message))||'error';cache.listo=true;repintar();};
    try{
      cierres.push(db.collection('insumosUnidades').where('linea','==',linea).onSnapshot(s=>{cache.unidades=s.docs.map(d=>d.data()).filter(x=>x&&x.id&&x.loteId);cache.listo=true;cache.error='';repintar();},fallo));
      cierres.push(db.collection('insumosLotes').onSnapshot(s=>{cache.lotes=s.docs.map(d=>d.data()).filter(x=>x&&x.id);repintar();},fallo));
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

  /* Panel de un cuadro del formulario (lo llama 06-registro.js). */
  raiz.lotesCuadroHtml=function(i){
    if(typeof draft==='undefined'||!draft||typeof normalizarCuadros!=='function')return '';
    const q=normalizarCuadros(draft)[i];if(!q)return '';
    escuchar(draft.linea);
    const marcados=Array.isArray(q.lotesInsumo)?q.lotesInsumo:[];
    const cerrado=q.estadoCuadro==='FINALIZADO';
    const disp=cache.linea===draft.linea?disponibles(cache.lotes,cache.unidades,draft.linea):[];
    const idsDisp=new Set(disp.map(d=>d.lote.id));
    const fuera=marcados.filter(m=>!idsDisp.has(m.loteId));      // marcados que ya no están en la línea (siguen en el reporte)
    const grupos=CATEGORIAS.map(([clave,titulo])=>{
      const items=disp.filter(d=>String(d.lote.categoria).toLowerCase()===clave);
      const extra=fuera.filter(m=>m.categoria===clave);
      if(!items.length&&!extra.length)return '';
      return '<div class="lc-grupo"><b>'+esc(titulo)+'</b>'+items.map(d=>{
        const on=marcados.some(m=>m.loteId===d.lote.id);
        return '<label class="lc-fila"><input type="checkbox" '+(on?'checked ':'')+(cerrado?'disabled ':'')+'onchange="loteCuadroAlternar('+i+',\''+esc(d.lote.id)+'\',this.checked)"> <span><b>'+esc(d.lote.loteProveedor)+'</b> · '+esc(d.lote.producto)+' <small>vence '+esc(fmtVence(d.lote.fechaVencimiento))+' · '+d.unidades.length+' unidad(es) en línea</small></span></label>';
      }).join('')+extra.map(m=>'<label class="lc-fila"><input type="checkbox" checked '+(cerrado?'disabled ':'')+'onchange="loteCuadroAlternar('+i+',\''+esc(m.loteId)+'\',this.checked)"> <span><b>'+esc(m.loteProveedor)+'</b> · '+esc(m.insumo)+' <small>ya no figura en la línea (se conserva en el reporte)</small></span></label>').join('')+'</div>';
    }).join('');
    const msg=cache.error?'<div class="lc-nota lc-err">No se pudieron leer los lotes de la línea. Si el problema sigue, avisa al Administrador.</div>':
      !cache.listo?'<div class="lc-nota">Consultando los lotes de '+esc(draft.linea)+'…</div>':
      !grupos?'<div class="lc-nota">No hay lotes de preforma, tapa, etiqueta o asa entregados a '+esc(draft.linea)+'. Pide al Asistente de Producción que los entregue a línea (Asistente › Lotes).</div>':'';
    return '<div class="panel lc-panel" style="margin:10px 0 0;"><style>.lc-grupo{margin:6px 0}.lc-fila{display:flex;gap:8px;align-items:flex-start;padding:5px 0;font-size:13px;cursor:pointer}.lc-fila small{display:block;color:#5a6b7b}.lc-nota{font-size:13px;color:#5a6b7b}.lc-err{color:#c62828}</style>'+
      '<div class="panel-head"><h4 style="margin:0;">Lotes de insumo usados <small style="font-weight:400;color:#5a6b7b">(llenan el Control de proceso)</small></h4></div><div class="panel-body">'+
      (grupos||'')+msg+(marcados.length?'<div class="lc-nota" style="margin-top:6px">En este cuadro: '+marcados.map(m=>esc(m.loteProveedor)).join(' · ')+'</div>':'')+'</div></div>';
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
