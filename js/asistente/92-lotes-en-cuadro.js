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
  /* Lotes con cajas/bobinas EN ALMACÉN (de las categorías del panel, sin los unidos a otro), con su vencimiento. Desde el 12/11/2026 lo usa la vista
     «Entregar a líneas» del Asistente de Producción (89): es la Asistente quien elige los lotes y la línea; el supervisor ya no toma del almacén. */
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
  /* ---------- Lote escrito a mano (auditoría 12/11/2026, punto 1) ----------
     Cuando el lote del insumo todavía no existe en el sistema (su foto no se validó), el supervisor escribe el lote del proveedor tal como sale en la
     etiqueta. Queda en el cuadro como {loteId:'MAN-<CAT>-<LOTE>', manual:true, …}: el Control de proceso y el informe lo usan igual. Cuando después se
     valida la foto de ese lote (misma categoría y mismo lote del proveedor), se ENLAZA SOLO al leer (resolverManual): no se reescriben los reportes. */
  const soloAlnum=v=>String(v==null?'':v).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const esManual=m=>!!m&&(m.manual===true||/^MAN-/.test(texto(m.loteId)));
  function claveManual(categoria,loteProveedor){return 'MAN-'+soloAlnum(categoria).slice(0,12)+'-'+soloAlnum(loteProveedor).slice(0,40);}
  /** Valida y arma la entrada manual. Devuelve {ok:true, entrada} o {ok:false, error}. */
  function entradaManual({categoria,loteProveedor,insumo,fechaVencimiento}={}){
    const cat=String(categoria||'').toLowerCase();
    if(!CATEGORIAS.some(c=>c[0]===cat))return {ok:false,error:'Elige la categoría del insumo.'};
    const lote=texto(loteProveedor).replace(/[\u0000-\u001f]/g,'').replace(/\s+/g,' ').trim().slice(0,40);
    if(soloAlnum(lote).length<2)return {ok:false,error:'Escribe el lote del proveedor tal como sale en la etiqueta (al menos 2 letras o números).'};
    const venc=/^\d{4}-\d{2}-\d{2}$/.test(texto(fechaVencimiento))?texto(fechaVencimiento):'';
    return {ok:true,entrada:{loteId:claveManual(cat,lote),manual:true,loteProveedor:lote,categoria:cat,insumo:texto(insumo).replace(/[\u0000-\u001f]/g,'').trim().slice(0,160),
      unidadIds:[],fechaVencimiento:venc}};
  }
  /** Lote del sistema que corresponde a una entrada manual (misma categoría y mismo lote del proveedor, sin separadores). Si está unido a otro, el destino. */
  function resolverManual(m,lotes){
    if(!esManual(m))return null;
    const cat=String(m.categoria||'').toLowerCase(),lp=soloAlnum(m.loteProveedor);
    if(!lp)return null;
    const ls=Array.isArray(lotes)?lotes:[];
    const l=ls.find(x=>x&&!x.unidoEn&&String(x.categoria||'').toLowerCase()===cat&&soloAlnum(x.loteProveedor)===lp)||
            ls.find(x=>x&&String(x.categoria||'').toLowerCase()===cat&&soloAlnum(x.loteProveedor)===lp);
    if(!l)return null;
    if(!l.unidoEn)return l;
    return ls.find(x=>x&&x.id===l.unidoEn)||l;
  }

  /* ---------- Arrastre de los lotes en uso (auditoría 12/11/2026, punto 2) ----------
     Una caja o bobina dura varios turnos. Una producción nueva (cuadro sin lotes todavía) trae ya marcados los lotes de la producción anterior de la
     misma línea: primero la anterior del mismo reporte; si no hay, la última producción con lotes de los reportes de esa línea de hasta 2 días antes.
     Del sistema solo se traen los lotes que siguen en la línea (entregados o en uso); los escritos a mano se traen siempre (no se sabe si se acabaron).
     Cada entrada traída lleva arrastrado:true y el cuadro lotesArrastradosDe con el origen, para que el supervisor quite lo que ya se acabó. */
  const ordenTurno=t=>String(t||'').toUpperCase().includes('NOCHE')?1:0;
  const diasEntre=(a,b)=>{const pa=Date.parse(a+'T00:00:00Z'),pb=Date.parse(b+'T00:00:00Z');return Number.isFinite(pa)&&Number.isFinite(pb)?Math.round((pb-pa)/86400000):NaN;};
  const fFecha=iso=>{const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'/'+m[2]:'';};
  function arrastrables({reporte,indice,registros,unidades,lotes,diasMax}={}){
    const r=reporte||{},cuadros=Array.isArray(r.cuadros)?r.cuadros:[];
    const con=c=>c&&Array.isArray(c.lotesInsumo)&&c.lotesInsumo.length>0;
    let fuente=null,origen='';
    for(let j=Math.min(indice,cuadros.length)-1;j>=0;j--){if(con(cuadros[j])){fuente=cuadros[j].lotesInsumo;origen='Producción '+(Number(cuadros[j].numero)||j+1)+' de este reporte';break;}}
    if(!fuente){
      const fecha=texto(r.fecha).slice(0,10),tr=ordenTurno(r.turno),max=diasMax==null?2:diasMax;
      const previos=(Array.isArray(registros)?registros:[]).filter(x=>{
        if(!x||x.id===r.id||x.linea!==r.linea||x.eliminado||!Array.isArray(x.cuadros)||!x.cuadros.some(con))return false;
        const d=diasEntre(texto(x.fecha).slice(0,10),fecha);
        return Number.isFinite(d)&&d>=0&&d<=max&&(d>0||ordenTurno(x.turno)<tr);
      }).sort((a,b)=>texto(b.fecha).localeCompare(texto(a.fecha))||ordenTurno(b.turno)-ordenTurno(a.turno));
      const p=previos[0];
      if(p){
        const c=p.cuadros.filter(con).sort((a,b)=>(Number(b.numero)||0)-(Number(a.numero)||0))[0];
        fuente=c.lotesInsumo;origen='Producción '+(Number(c.numero)||1)+' · '+fFecha(p.fecha)+' '+(ordenTurno(p.turno)?'Noche':'Día');
      }
    }
    if(!fuente)return {lista:[],origen:''};
    const enLinea=new Map();
    (Array.isArray(unidades)?unidades:[]).forEach(u=>{if(u&&u.linea===r.linea&&ESTADOS_EN_LINEA.includes(u.estado)){if(!enLinea.has(u.loteId))enLinea.set(u.loteId,[]);enLinea.get(u.loteId).push(u.id);}});
    const T=raiz.glacialTrazabilidadNucleo;
    const destino=id=>T&&typeof T.resolverLoteId==='function'?T.resolverLoteId(id,lotes||[]):id;
    const lista=[];
    fuente.forEach(m=>{
      if(!m||!m.loteId||lista.some(x=>x.loteId===m.loteId))return;
      if(esManual(m)){lista.push(Object.assign({},m,{unidadIds:[],arrastrado:true}));return;}
      const ids=enLinea.get(m.loteId)||enLinea.get(destino(m.loteId));
      if(ids&&ids.length)lista.push(Object.assign({},m,{unidadIds:ids.slice(),arrastrado:true}));
    });
    return {lista,origen:lista.length?origen:''};
  }
  const API={CATEGORIAS,disponibles,entradaDeLote,alternar,enAlmacen,marcarConUnidad,esManual,claveManual,entradaManual,resolverManual,arrastrables};
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
        if(a&&/INPUT|SELECT|TEXTAREA/.test(a.tagName)&&!/checkbox|radio|button/.test(String(a.type||'')))return;      // no interrumpe a quien está escribiendo (también el lote a mano)
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
    const cerrado=q.estadoCuadro==='FINALIZADO';
    const editable=!cerrado&&!(typeof reporteEstaBloqueado==='function'&&reporteEstaBloqueado())&&(typeof puedeEscribirRegistro!=='function'||puedeEscribirRegistro());
    const hoyLima=typeof GlacialFecha!=='undefined'&&GlacialFecha.fechaISOLocal?GlacialFecha.fechaISOLocal(Date.now()):(d=>d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0'))(new Date(Date.now()-5*3600000));
    /* Punto 2: una producción nueva (nunca tocó sus lotes) trae los lotes en uso de la anterior. Solo en reportes de hoy o ayer que se pueden editar,
       y cuando ya se leyeron las cajas/bobinas de la línea (para no traer lo que ya se devolvió o se consumió). */
    if(editable&&q.lotesInsumo===undefined&&texto(q.marca).trim()&&cache.listo&&!cache.error&&cache.linea===draft.linea){
      const d=diasEntre(texto(draft.fecha).slice(0,10),hoyLima);
      if(Number.isFinite(d)&&d>=0&&d<=1){
        let regs=[];try{regs=(typeof loadRecords==='function'?loadRecords():[])||[];}catch(_){regs=[];}
        const a=arrastrables({reporte:draft,indice:i,registros:regs,unidades:cache.unidades,lotes:cache.lotes});
        if(a.lista.length){
          q.lotesInsumo=a.lista;q.lotesArrastradosDe=a.origen;
          setTimeout(()=>{if(typeof programarGuardadoAutomaticoReporte==='function')programarGuardadoAutomaticoReporte();},0);
        }
      }
    }
    const marcados=Array.isArray(q.lotesInsumo)?q.lotesInsumo:[];
    const disp=cache.linea===draft.linea?disponibles(cache.lotes,cache.unidades,draft.linea):[];
    const idsDisp=new Set(disp.map(d=>d.lote.id));
    const fuera=marcados.filter(m=>!esManual(m)&&!idsDisp.has(m.loteId));      // marcados que ya no están en la línea (siguen en el reporte)
    const manuales=marcados.filter(esManual);
    const grupos=CATEGORIAS.map(([clave,titulo])=>{
      const items=disp.filter(d=>String(d.lote.categoria).toLowerCase()===clave);
      const extra=fuera.filter(m=>m.categoria===clave);
      const man=manuales.filter(m=>m.categoria===clave);
      if(!items.length&&!extra.length&&!man.length)return '';
      return '<div class="lc-grupo"><b>'+esc(titulo)+'</b>'+items.map(d=>{
        const on=marcados.some(m=>m.loteId===d.lote.id);
        return '<label class="lc-fila"><input type="checkbox" '+(on?'checked ':'')+(cerrado?'disabled ':'')+'onchange="loteCuadroAlternar('+i+',\''+esc(d.lote.id)+'\',this.checked)"> <span><b>'+esc(d.lote.loteProveedor)+'</b> · '+esc(d.lote.producto)+' <small>vence '+esc(fmtVence(d.lote.fechaVencimiento))+' · '+d.unidades.length+' unidad(es) en línea</small></span></label>'+(on?unidadesHtml(i,d.lote.id,cerrado):'');
      }).join('')+extra.map(m=>'<label class="lc-fila"><input type="checkbox" checked '+(cerrado?'disabled ':'')+'onchange="loteCuadroAlternar('+i+',\''+esc(m.loteId)+'\',this.checked)"> <span><b>'+esc(m.loteProveedor)+'</b> · '+esc(m.insumo)+' <small>ya no figura en la línea (se conserva en el reporte)'+(m.arrastrado?' · traído de la producción anterior':'')+'</small></span></label>').join('')+
        man.map(m=>{const l=resolverManual(m,cache.lotes);
          return '<label class="lc-fila"><input type="checkbox" checked '+(cerrado?'disabled ':'')+'onchange="loteCuadroAlternar('+i+',\''+esc(m.loteId)+'\',this.checked)"> <span><b>'+esc(m.loteProveedor)+'</b>'+(m.insumo?' · '+esc(m.insumo):'')+
            ' <small>✍ escrito a mano · '+(l?'ya está en el sistema como '+esc(l.id):'su foto todavía no está validada')+(m.arrastrado?' · traído de la producción anterior':'')+'</small></span></label>';}).join('')+
        '</div>';
    }).join('');
    const msg=cache.error?'<div class="lc-nota lc-err">No se pudieron leer los lotes de la línea. Si el problema sigue, avisa al Administrador.</div>':
      !cache.listo?'<div class="lc-nota">Consultando los lotes de '+esc(draft.linea)+'…</div>':
      !grupos?'<div class="lc-nota">No hay lotes de insumo entregados a '+esc(draft.linea)+' (la Asistente de Producción los entrega desde Asistente › Lotes › «Entregar a líneas»).'+(editable?' Escribe a mano el lote de la etiqueta de cada insumo que usas:':'')+'</div>':'';
    const arrastre=marcados.some(m=>m&&m.arrastrado)&&q.lotesArrastradosDe&&!cerrado?
      '<div class="lc-nota lc-arr">↻ Se trajeron los lotes en uso de <b>'+esc(q.lotesArrastradosDe)+'</b>. Quita el visto de los que ya se acabaron.</div>':'';
    const manualHtml=editable?'<details class="lc-man"'+(!grupos?' open':'')+'><summary>+ Escribir un lote a mano</summary><div class="lc-man-f">'+
      '<select id="lc-mc-'+i+'" aria-label="Categoría del insumo">'+CATEGORIAS.map(([c,t])=>'<option value="'+c+'">'+esc(t)+'</option>').join('')+'</select>'+
      '<input id="lc-ml-'+i+'" type="text" maxlength="40" placeholder="Lote del proveedor (como en la etiqueta)" aria-label="Lote del proveedor" autocomplete="off" onkeydown="if(event.key===\'Enter\'){event.preventDefault();loteCuadroManual('+i+');}">'+
      '<input id="lc-mi-'+i+'" type="text" maxlength="160" placeholder="Insumo (opcional), p. ej. Tapa 28 mm azul" aria-label="Insumo" autocomplete="off">'+
      '<button type="button" class="btn btn-ghost btn-sm" onclick="loteCuadroManual('+i+')">Agregar</button></div>'+
      '<div class="lc-nota lc-err" id="lc-me-'+i+'" role="alert"></div><div class="lc-nota">Úsalo cuando el lote no aparece arriba (su foto aún no se validó). Cuando se valide, se enlaza solo.</div></details>':'';
    return '<div class="panel lc-panel" style="margin:10px 0 0;"><style>.lc-grupo{margin:6px 0}.lc-fila{display:flex;gap:8px;align-items:flex-start;padding:5px 0;font-size:13px;cursor:pointer}.lc-fila small{display:block;color:#5a6b7b}.lc-nota{font-size:13px;color:#5a6b7b}.lc-err{color:#c62828}.lc-uni{margin:0 0 6px 26px;display:grid;gap:4px}.lc-u{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;font-size:13px;padding:4px 8px;border:1px solid #e3e8ee;border-radius:8px}.lc-u .btn{min-height:40px}.lc-arr{background:#eef6fb;border:1px solid #cfe3ef;border-radius:8px;padding:6px 10px;margin:4px 0;color:#0f3a55}.lc-man{margin-top:8px;font-size:13px}.lc-man summary{cursor:pointer;color:#0877A6;font-weight:700;padding:8px 0;min-height:36px}.lc-man-f{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.lc-man-f select,.lc-man-f input{min-height:40px;font-size:14px;padding:6px 8px;border:1px solid #c9d4df;border-radius:8px}.lc-man-f input{flex:1 1 180px;min-width:0}.lc-man-f .btn{min-height:40px}</style>'+
      '<div class="panel-head"><h4 style="margin:0;">Lotes de insumo usados <small style="font-weight:400;color:#5a6b7b">(trazabilidad y Control de proceso)</small></h4></div><div class="panel-body">'+
      arrastre+(grupos||'')+msg+manualHtml+(marcados.length?'<div class="lc-nota" style="margin-top:6px">En este cuadro: '+marcados.map(m=>esc(m.loteProveedor)).join(' · ')+'</div>':'')+'</div></div>';
  };
  raiz.loteCuadroAlternar=function(i,loteId,marcado){
    if(typeof draft==='undefined'||!draft||typeof normalizarCuadros!=='function')return;
    const q=normalizarCuadros(draft)[i];if(!q||q.estadoCuadro==='FINALIZADO')return;
    const actual=(q.lotesInsumo||[]).find(m=>m.loteId===loteId);
    const info=cache.lotes.find(l=>l.id===loteId);
    const entrada=info?entradaDeLote(info,cache.unidades.filter(u=>u.loteId===loteId&&u.linea===draft.linea&&ESTADOS_EN_LINEA.includes(u.estado))):actual;
    if(!entrada)return;
    q.lotesInsumo=alternar(q.lotesInsumo,entrada,!!marcado);
    if(typeof programarGuardadoAutomaticoReporte==='function')programarGuardadoAutomaticoReporte();
    const y=window.scrollY;
    if(typeof renderFormTab==='function'){renderFormTab();requestAnimationFrame(()=>window.scrollTo(0,y));}
  };
  /* Punto 1: agrega al cuadro un lote escrito a mano. */
  raiz.loteCuadroManual=function(i){
    if(typeof draft==='undefined'||!draft||typeof normalizarCuadros!=='function')return;
    const q=normalizarCuadros(draft)[i];if(!q||q.estadoCuadro==='FINALIZADO'||(typeof reporteEstaBloqueado==='function'&&reporteEstaBloqueado()))return;
    const val=id=>{const e=document.getElementById(id);return e?e.value:'';};
    const err=document.getElementById('lc-me-'+i);
    const r=entradaManual({categoria:val('lc-mc-'+i),loteProveedor:val('lc-ml-'+i),insumo:val('lc-mi-'+i)});
    if(!r.ok){if(err)err.textContent=r.error;return;}
    if((q.lotesInsumo||[]).some(m=>m&&m.loteId===r.entrada.loteId)){if(err)err.textContent='Ese lote ya está marcado en esta producción.';return;}
    q.lotesInsumo=alternar(q.lotesInsumo,r.entrada,true);
    if(typeof programarGuardadoAutomaticoReporte==='function')programarGuardadoAutomaticoReporte();
    const y=window.scrollY;
    if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
    if(typeof renderFormTab==='function'){renderFormTab();requestAnimationFrame(()=>window.scrollTo(0,y));}
  };
})(typeof window!=='undefined'?window:globalThis);
