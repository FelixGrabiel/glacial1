/* =====================================================================================================================
   GLACIAL · BANCO DE PROVEEDORES (Asistente de Producción › Proveedores) · docs/asistente/proveedores.md
   Problema que resuelve: el proveedor llegaba como TEXTO LIBRE leído de la foto («CORPORACION ASK S.A.», «Corpacim ASK»,
   «FULL PACK' S.A.C.»…) y la llave del lote es proveedor + lote + producto: cada forma distinta creaba otro lote.
   Ahora cada proveedor (o cliente) tiene UNA ficha con los nombres con que aparece en las etiquetas (alias). Al crear un lote
   desde una foto se usa el nombre del banco, así el mismo lote del proveedor queda en un solo lote con todas sus cajas.
   Datos del proveedor: solo lo que trae la etiqueta (decisión del dueño, 07/11/2026): nombre, nombre corto, alias y categorías.
   Colección: insumosProveedores/{id} = { id, tipo:'PROVEEDOR'|'CLIENTE', nombre, nombreCorto, alias[], categorias[], activo,
     rev, historial[], creadoPor, creadoEn, actualizadoPor, actualizadoEn }. Nunca se borra (se desactiva).
   Servidor: glacial_45 (lectura con ii_ver y escritura con ii_esc, como los lotes).
   ===================================================================================================================== */
(function(){
  'use strict';
  const TIPOS=['PROVEEDOR','CLIENTE'];
  const CATEGORIAS=['preformas','tapas','etiquetas','asas','bolsas','cajas','polietileno','otro'];
  /* Terminaciones de razón social que no distinguen a un proveedor (S.A., S.A.C., S.R.L., SMC…). */
  const SUFIJOS=new Set(['S','A','C','R','L','E','I','SA','SAC','SRL','SMC','EIRL','SCRL','LTDA','CIA','SAA']);
  /* Palabras comunes que no identifican al proveedor (para agrupar nombres parecidos). */
  const GENERICAS=new Set(['CORPORACION','CONSORCIO','INDUSTRIAS','INDUSTRIA','DE','DEL','LA','LAS','LOS','EL','Y','EN','GRUPO','COOPERATIVA','INVERSIONES','EMPRESA','COMPANIA','PERU','DEL PERU']);
  const texto=v=>v===undefined||v===null?'':String(v);
  const sinTildes=s=>texto(s).normalize('NFD').replace(/[̀-ͯ]/g,'');
  /** «Corporación ASK S.A.C.» → «CORPORACION ASK». Mayúsculas, sin tildes ni signos, sin la terminación de razón social. */
  function normProveedor(v){
    const t=sinTildes(v).toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().split(' ').filter(Boolean);
    while(t.length>1&&SUFIJOS.has(t[t.length-1]))t.pop();
    return t.join(' ');
  }
  const compacto=v=>normProveedor(v).replace(/ /g,'');
  const distintivas=v=>normProveedor(v).split(' ').filter(x=>x.length>1&&!GENERICAS.has(x));
  function distancia(a,b){
    if(a===b)return 0;const m=a.length,n=b.length;if(!m||!n)return Math.max(m,n);
    let prev=Array.from({length:n+1},(_,j)=>j);
    for(let i=1;i<=m;i++){const cur=[i];for(let j=1;j<=n;j++)cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur;}
    return prev[n];
  }
  /** Parecido entre dos nombres (0 a 1): por la escritura compacta o por palabras distintivas en común. */
  function parecido(a,b){
    const x=compacto(a),y=compacto(b);if(!x||!y)return 0;
    if(x===y)return 1;
    const porTexto=1-distancia(x,y)/Math.max(x.length,y.length);
    const ta=distintivas(a),tb=new Set(distintivas(b));
    const comunes=ta.filter(t=>tb.has(t)).length;
    const porPalabras=comunes?comunes/Math.max(1,Math.min(ta.length,tb.size)):0;
    return Math.max(porTexto,porPalabras*0.9);
  }
  const nombresDe=p=>[p.nombre,p.nombreCorto].concat(Array.isArray(p.alias)?p.alias:[]).filter(Boolean);
  /**
   * Proveedor (o cliente) del banco para un texto leído. Coincidencia EXACTA con su nombre, nombre corto o un alias (normalizados).
   * Si el texto trae dos nombres («SUPERMASK / CONSORCIO FRAP») se prueba cada parte: gana el PROVEEDOR; si solo aparece el cliente,
   * devuelve el cliente (quien llama avisa que falta el proveedor). null si no hay coincidencia.
   */
  function resolver(textoLeido,proveedores){
    const activos=(proveedores||[]).filter(p=>p&&p.activo!==false);
    const buscar=t=>{const c=compacto(t);if(!c)return null;return activos.find(p=>nombresDe(p).some(n=>compacto(n)===c))||null;};
    const entero=buscar(textoLeido);
    if(entero)return entero;
    const partes=texto(textoLeido).split(/\s*[\/|]\s*|\s+-\s+/).filter(Boolean);
    if(partes.length<2)return null;
    const hall=partes.map(buscar).filter(Boolean);
    return hall.find(p=>p.tipo!=='CLIENTE')||hall[0]||null;
  }
  /** Hasta `max` proveedores parecidos (para sugerir cuando no hay coincidencia exacta). */
  function sugerir(textoLeido,proveedores,max){
    return (proveedores||[]).filter(p=>p&&p.activo!==false).map(p=>({p,s:Math.max(...nombresDe(p).map(n=>parecido(textoLeido,n)))}))
      .filter(x=>x.s>=0.6).sort((a,b)=>b.s-a.s).slice(0,max||3).map(x=>x.p);
  }
  /**
   * Agrupa los nombres leídos que todavía no están en el banco: los que se escriben igual (normalizados) o se parecen (≥ 0,75) van juntos.
   * nombres: [{texto, veces}] → [{nombres:[{texto,veces}], sugerido, veces, parecidoA:[proveedores del banco]}] ordenado por veces.
   */
  function agruparNombres(nombres,proveedores){
    const sueltos=(nombres||[]).filter(x=>x&&normProveedor(x.texto)&&!resolver(x.texto,proveedores));
    const grupos=[];
    sueltos.sort((a,b)=>b.veces-a.veces).forEach(x=>{
      const g=grupos.find(g=>g.nombres.some(y=>parecido(x.texto,y.texto)>=0.75));
      if(g)g.nombres.push(x);else grupos.push({nombres:[x]});
    });
    return grupos.map(g=>{
      const veces=g.nombres.reduce((s,x)=>s+x.veces,0);
      const base=g.nombres.slice().sort((a,b)=>b.veces-a.veces||b.texto.length-a.texto.length)[0].texto;
      const sugerido=texto(base).replace(/\s+/g,' ').trim();
      return {nombres:g.nombres,sugerido,veces,parecidoA:sugerir(sugerido,proveedores,2)};
    }).sort((a,b)=>b.veces-a.veces);
  }
  const slug=v=>normProveedor(v).replace(/ /g,'-').slice(0,48);
  const idProveedor=nombre=>'PRV-'+slug(nombre);
  /** Alta o cambio de un proveedor → {doc} o {errores}. Valida que ningún alias pertenezca ya a otro proveedor del banco. */
  function planGuardar({previo,datos,proveedores,usuario,en,motivo}){
    const errores=[];
    const nombre=texto(datos&&datos.nombre).replace(/\s+/g,' ').trim();
    const tipo=TIPOS.includes(datos&&datos.tipo)?datos.tipo:'PROVEEDOR';
    if(normProveedor(nombre).length<3)errores.push('Escribe el nombre como aparece en la etiqueta (mínimo 3 letras).');
    const vistos=new Set();const alias=[];
    [nombre].concat(Array.isArray(datos&&datos.alias)?datos.alias:[]).forEach(a=>{
      const t=texto(a).replace(/\s+/g,' ').trim().slice(0,120);const c=compacto(t);
      if(!c||vistos.has(c))return;vistos.add(c);if(t!==nombre)alias.push(t);
    });
    const id=previo?previo.id:idProveedor(nombre);
    (proveedores||[]).filter(p=>p&&p.id!==id).forEach(p=>{
      const suyos=new Set(nombresDe(p).map(compacto));
      [nombre].concat(alias).forEach(a=>{if(suyos.has(compacto(a)))errores.push(`«${a}» ya es un nombre de ${p.nombre}.`);});
    });
    if(!previo&&(proveedores||[]).some(p=>p&&p.id===id))errores.push(`Ya existe un proveedor con ese nombre (${id}).`);
    const categorias=[...new Set((datos&&datos.categorias||[]).filter(c=>CATEGORIAS.includes(c)))];
    if(errores.length)return {errores:[...new Set(errores)]};
    const ahora=Number(en)||Date.now(),por=texto(usuario).slice(0,80);
    const doc={id,tipo,nombre:nombre.slice(0,120),nombreCorto:texto(datos.nombreCorto).trim().slice(0,30),alias:alias.slice(0,60),categorias,
      activo:datos.activo!==false,rev:(Number(previo&&previo.rev)||0)+1,
      historial:(previo&&Array.isArray(previo.historial)?previo.historial:[]).concat([{accion:previo?'EDITAR':'CREAR',por,en:ahora,motivo:texto(motivo).slice(0,200),
        antes:previo?{nombre:previo.nombre,alias:previo.alias||[],tipo:previo.tipo,activo:previo.activo!==false}:null,
        despues:{nombre,alias,tipo,activo:datos.activo!==false}}]).slice(-100),
      creadoPor:previo?previo.creadoPor:por,creadoEn:previo?previo.creadoEn:ahora,actualizadoPor:por,actualizadoEn:ahora};
    return {doc};
  }
  /* ---------- historial de lotes del proveedor ---------- */
  const articuloDe=l=>l.itemId?('I:'+l.itemId):('P:'+normProveedor(l.producto));
  /** Lotes del proveedor (por su id o por cualquiera de sus nombres), sin los unidos a otro. */
  function lotesDe(p,lotes,proveedores){
    return (lotes||[]).filter(l=>{
      if(!l||l.unidoEn)return false;
      if(l.proveedorId)return l.proveedorId===p.id;
      const r=resolver(l.proveedor,proveedores);return !!(r&&r.id===p.id);
    });
  }
  /**
   * Por artículo: los lotes en orden de llegada y dónde cambió el lote. → [{articulo, nombre, lotes:[{lote, cajas, kg, desde, hasta, cambio}]}]
   */
  function historialLotes(p,lotes,unidades,proveedores){
    const mios=lotesDe(p,lotes,proveedores);
    const porArt=new Map();
    mios.forEach(l=>{const k=articuloDe(l);if(!porArt.has(k))porArt.set(k,[]);porArt.get(k).push(l);});
    return [...porArt.entries()].map(([k,ls])=>{
      const filas=ls.map(l=>{
        const us=(unidades||[]).filter(u=>u.loteId===l.id);
        const fechas=us.map(u=>Number(u.recibidaEn)||0).filter(Boolean);
        return {lote:l,cajas:us.length||Number(l.unidades)||0,kg:us.reduce((s,u)=>s+(Number(u.pesoNeto)||0),0),
          desde:fechas.length?Math.min(...fechas):(Number(l.recibidoEn)||0),hasta:fechas.length?Math.max(...fechas):(Number(l.recibidoEn)||0),
          observadas:us.filter(u=>u.estado==='OBSERVADA').length,devueltas:us.filter(u=>u.estado==='DEVUELTA_PROVEEDOR').length};
      }).sort((a,b)=>a.desde-b.desde);
      filas.forEach((f,i)=>{f.cambio=i>0;});
      const l0=ls[0];
      return {articulo:k,nombre:l0.itemNombre||l0.producto||'(sin producto)',lotes:filas};
    }).sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),'es'));
  }
  function resumen(p,lotes,unidades,proveedores){
    const h=historialLotes(p,lotes,unidades,proveedores);
    const filas=h.flatMap(x=>x.lotes);
    return {lotes:filas.length,cajas:filas.reduce((s,f)=>s+f.cajas,0),observadas:filas.reduce((s,f)=>s+f.observadas,0),devueltas:filas.reduce((s,f)=>s+f.devueltas,0),
      ultima:filas.reduce((m,f)=>Math.max(m,f.hasta||0),0),articulos:h.length,cambios:filas.filter(f=>f.cambio).length};
  }
  /* ---------- resumen de evidencias pendientes ---------- */
  const valor=(doc,c)=>{const x=doc&&doc.campos&&doc.campos[c];return x&&x.valor!==undefined&&x.valor!==null?String(x.valor).trim():'';};
  const alnum=v=>sinTildes(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
  /** Clasifica las evidencias pendientes: completas, casi completas, sin lote o sin datos útiles; lotes que se repiten. */
  function resumenPendientes(evidencias,proveedores){
    const pend=(evidencias||[]).filter(e=>e&&e.estado==='pendiente');
    const grupos={completas:[],casi:[],sinLote:[],sinDatos:[]};
    const porLote=new Map();
    pend.forEach(e=>{
      const prov=valor(e,'proveedor'),lote=valor(e,'lote'),caja=valor(e,'numero_caja_bobina');
      if(prov&&lote&&caja&&e.tipoDocumento==='etiqueta_insumo')grupos.completas.push(e);
      else if(prov&&lote)grupos.casi.push(e);
      else if(prov)grupos.sinLote.push(e);
      else grupos.sinDatos.push(e);
      if(lote){const r=resolver(prov,proveedores);const k=alnum(lote);
        if(!porLote.has(k))porLote.set(k,{lote,proveedores:new Set(),fotos:0,categorias:new Set()});
        const g=porLote.get(k);g.fotos++;g.proveedores.add(r?r.nombre:prov||'(sin proveedor)');g.categorias.add(e.categoria||'otro');}
    });
    const repetidos=[...porLote.values()].filter(g=>g.fotos>1).map(g=>({lote:g.lote,fotos:g.fotos,proveedores:[...g.proveedores],categorias:[...g.categorias]})).sort((a,b)=>b.fotos-a.fotos);
    const sinBanco=new Map();
    pend.forEach(e=>{const p=valor(e,'proveedor');if(p&&!resolver(p,proveedores))sinBanco.set(p,(sinBanco.get(p)||0)+1);});
    return {total:pend.length,grupos,lotesDistintos:porLote.size,repetidos,nombresSinBanco:[...sinBanco.entries()].map(([texto,veces])=>({texto,veces}))};
  }

  const N={TIPOS,CATEGORIAS,normProveedor,compacto,parecido,resolver,sugerir,agruparNombres,idProveedor,planGuardar,lotesDe,historialLotes,resumen,resumenPendientes};
  if(typeof module!=='undefined'&&module.exports)module.exports=N;
  if(typeof window==='undefined')return;
  window.glacialProveedoresNucleo=N;

  /* ------------------------------------------------------------------ datos */
  const COL='insumosProveedores';
  const cache={lista:[],listo:false,error:''};
  let cierre=null;const oyentes=[];
  const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(_){/* una vista no rompe a otra */}});
  const Dinv=()=>window.glacialInventarioDatos;
  const puedeVer=()=>!!(Dinv()&&Dinv().puedeVer&&Dinv().puedeVer());
  const puedeEscribir=()=>!!(Dinv()&&Dinv().puedeEscribir&&Dinv().puedeEscribir())&&!(window.glacialVista&&window.glacialVista.activo&&window.glacialVista.activo());
  function escuchar(){
    if(cierre||typeof db==='undefined'||!puedeVer())return;
    cache.listo=false;cache.error='';
    try{cierre=db.collection(COL).onSnapshot(s=>{cache.lista=s.docs.map(d=>d.data()).filter(x=>x&&x.id);cache.listo=true;cache.error='';avisar();},
      e=>{cache.error=String((e&&e.message)||e);avisar();});}catch(e){cache.error=String((e&&e.message)||e);}
  }
  function detener(){if(cierre){try{cierre();}catch(_){/* ya cerrada */}}cierre=null;cache.lista=[];cache.listo=false;}
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(detener);
  const usuario=()=>(typeof state!=='undefined'&&state.user&&(state.user.nombre||state.user.username))||'';
  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  async function guardar(datos,previoId,motivo){
    if(!puedeEscribir())throw new Error('No tienes permiso para modificar el banco de proveedores.');
    const previo=previoId?cache.lista.find(p=>p.id===previoId)||null:null;
    const r=planGuardar({previo,datos,proveedores:cache.lista,usuario:usuario(),en:ahora(),motivo});
    if(r.errores)throw new Error(r.errores.join(' · '));
    const ref=db.collection(COL).doc(r.doc.id);
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);const actual=s.exists?s.data():null;
      if(!previo&&actual)throw new Error('Otra persona ya creó este proveedor. Se actualizó la pantalla.');
      if(previo&&(!actual||Number(actual.rev)!==Number(previo.rev)))throw new Error('Otra persona cambió este proveedor mientras lo editabas. Vuelve a abrirlo.');
      tx.set(ref,r.doc);
      const A=Dinv()&&Dinv()._ayudas;
      if(A&&typeof A.auditar==='function')A.auditar(tx,previo?'EDITAR_PROVEEDOR':'CREAR_PROVEEDOR',r.doc.id,r.doc.nombre,
        previo?{nombre:previo.nombre,alias:previo.alias||[],tipo:previo.tipo,activo:previo.activo!==false}:null,{nombre:r.doc.nombre,alias:r.doc.alias,tipo:r.doc.tipo,activo:r.doc.activo});
    });
    return r.doc.id;
  }
  /* Lo que usan las evidencias y los lotes (88): proveedor del banco para un texto leído. */
  window.glacialProveedores={
    listo:()=>cache.listo&&!cache.error,lista:()=>cache.lista,
    resolver:t=>{if(!cierre)escuchar();return cache.listo?resolver(t,cache.lista):null;},
    sugerir:t=>sugerir(t,cache.lista,3),escuchar,detener,guardar,puedeEscribir,puedeVer,
    alCambiar:f=>{oyentes.push(f);return ()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};}
  };

  /* ------------------------------------------------------------------ pantalla */
  const esc=s=>String(s===undefined||s===null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const js=v=>esc(JSON.stringify(v));
  const fecha=ms=>{if(!ms)return '—';const d=new Date(Number(ms));return isNaN(d)?'—':[String(d.getDate()).padStart(2,'0'),String(d.getMonth()+1).padStart(2,'0'),d.getFullYear()].join('/');};
  const kg=n=>(Math.round(Number(n||0)*100)/100).toLocaleString('es-PE',{maximumFractionDigits:2})+' kg';
  const S={vista:'proveedores',sel:'',buscar:'',msg:null,form:null};
  let host={pintar:()=>{},activo:()=>false};let quitar=[];
  const repintar=()=>{if(host.activo())host.pintar();};
  const Z=()=>window.glacialTrazabilidadDatos,E=()=>window.glacialEvidenciasDatos;
  function estilos(){return `<style>
.pv-lay{display:grid;grid-template-columns:290px 1fr;gap:14px;align-items:start}
.pv-lista{display:flex;flex-direction:column;gap:6px}
.pv-it{border:1px solid #dbe3ea;border-radius:10px;padding:9px 11px;background:#fff;text-align:left;font:inherit;cursor:pointer;min-height:44px}
.pv-it b{display:block}.pv-it small{color:#5b6b7c}
.pv-it.pv-act{border-color:#0877A6;box-shadow:inset 4px 0 0 #0877A6;background:#f3f9fc}
.pv-in{font:inherit;font-size:15px;padding:9px 10px;border:1px solid #dbe3ea;border-radius:10px;min-height:42px;width:100%;box-sizing:border-box}
.pv-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0}.pv-kpis div{background:#f6f9fc;border-radius:10px;padding:10px}.pv-kpis b{display:block;font-size:20px}
.pv-chips{display:flex;flex-wrap:wrap;gap:6px}.pv-chip{border:1px dashed #dbe3ea;border-radius:8px;padding:4px 8px;font-size:12px;background:#fafcfd}
.pv-tl{border-left:3px solid #dbe3ea;margin:6px 0 10px 6px;padding-left:14px}
.pv-tl .p{position:relative;padding:5px 0 9px}.pv-tl .p:before{content:'';position:absolute;left:-21px;top:9px;width:11px;height:11px;border-radius:50%;background:#0877A6}
.pv-tl .p.c:before{background:#d97706}.pv-tl .p b{display:block}
.pv-grupo{border:1px solid #dbe3ea;border-radius:10px;padding:10px;margin:8px 0;background:#fff}
.pv-grupo label{display:inline-flex;gap:6px;align-items:center;margin:3px 10px 3px 0;min-height:32px}
.pv-fila{display:grid;grid-template-columns:2fr 1fr auto;gap:8px;align-items:end;margin-top:8px}
.pv-fila label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:#5b6b7c}
.pv-barra{height:10px;border-radius:6px;background:#edf2f7;overflow:hidden;display:flex}.pv-barra i{display:block;height:100%}
.pv-nota{font-size:12px;color:#5b6b7c}
@media(max-width:860px){.pv-lay{grid-template-columns:1fr}.pv-kpis{grid-template-columns:repeat(2,1fr)}.pv-fila{grid-template-columns:1fr}}
</style>`;}
  function nombresLeidos(){
    const m=new Map();const sumar=(t,n)=>{const x=String(t||'').trim();if(!x)return;m.set(x,(m.get(x)||0)+(n||1));};
    ((E()&&E().cache.lista)||[]).forEach(e=>sumar(e&&e.campos&&e.campos.proveedor&&e.campos.proveedor.valor));
    ((Z()&&Z().cache.lotes)||[]).forEach(l=>sumar(l.proveedor));
    return [...m.entries()].map(([texto,veces])=>({texto,veces}));
  }
  function vistaProveedores(){
    const L=cache.lista.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
    const lotes=(Z()&&Z().cache.lotes)||[],unidades=(Z()&&Z().cache.unidades)||[];
    if(!S.sel||!L.some(p=>p.id===S.sel))S.sel=L.length?L[0].id:'';
    const b=normProveedor(S.buscar);
    const items=L.filter(p=>!b||nombresDe(p).some(n=>normProveedor(n).includes(b))).map(p=>{
      const r=resumen(p,lotes,unidades,cache.lista);
      return `<button type="button" class="pv-it ${p.id===S.sel?'pv-act':''}" onclick="pvSel(${js(p.id)})"><b>${esc(p.nombreCorto||p.nombre)}</b><small>${p.tipo==='CLIENTE'?'Cliente · ':''}${r.lotes} lote${r.lotes===1?'':'s'} · ${(p.alias||[]).length+1} nombre${(p.alias||[]).length?'s':''}${p.activo===false?' · inactivo':''}</small></button>`;
    }).join('')||'<div class="pv-nota">Todavía no hay proveedores. Empieza por «Unificar nombres».</div>';
    const ed=puedeEscribir();
    const p=L.find(x=>x.id===S.sel);
    let ficha='<section class="ap-card"><div class="ap-vacio">Elige un proveedor.</div></section>';
    if(p){
      const r=resumen(p,lotes,unidades,cache.lista),h=historialLotes(p,lotes,unidades,cache.lista);
      const tl=h.map(a=>`<b style="display:block;margin-top:8px">${esc(a.nombre)}</b><div class="pv-tl">${a.lotes.map(f=>`<div class="p ${f.cambio?'c':''}"><b>${f.cambio?'Cambio de lote → ':''}${esc(f.lote.loteProveedor)} <a href="#" onclick="event.preventDefault();ilVerLote(${js(f.lote.id)})" class="pv-nota">${esc(f.lote.id)}</a></b><span class="pv-nota">${fecha(f.desde)}${f.hasta&&fecha(f.hasta)!==fecha(f.desde)?' → '+fecha(f.hasta):''} · ${f.cajas} caja${f.cajas===1?'':'s'}${f.kg?' · '+kg(f.kg):''}${f.observadas?` · ${f.observadas} observada${f.observadas===1?'':'s'}`:''}${f.devueltas?` · ${f.devueltas} devuelta${f.devueltas===1?'':'s'}`:''}</span></div>`).join('')}</div>`).join('');
      const hist=(p.historial||[]).slice().reverse().slice(0,8).map(x=>`<li>${fecha(x.en)} · <b>${x.accion==='CREAR'?'Creado':'Modificado'}</b> · ${esc(x.por)}${x.motivo?' · '+esc(x.motivo):''}</li>`).join('');
      ficha=`<section class="ap-card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
          <div><h2 class="ap-h2" style="margin:0">${esc(p.nombre)}</h2><span class="pv-nota">${p.tipo==='CLIENTE'?'<b>Cliente</b> (no es proveedor) · ':''}${p.nombreCorto?'Nombre corto: <b>'+esc(p.nombreCorto)+'</b> · ':''}${(p.categorias||[]).length?esc(p.categorias.join(', ')):'sin categorías'}</span></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${p.activo===false?'<span class="ap-pill ap-p-gris"><i></i>Inactivo</span>':'<span class="ap-pill ap-p-verde"><i></i>Activo</span>'}${ed?`<button type="button" class="ap-btn ap-btn-o ap-btn-s" onclick="pvEditar(${js(p.id)})">Editar</button>`:''}</div></div>
        ${p.tipo==='CLIENTE'?'<p class="pv-nota">Si una foto trae este nombre como proveedor, el sistema avisa que es el cliente y pide el proveedor real.</p>':`<div class="pv-kpis"><div><b>${r.lotes}</b>lotes</div><div><b>${r.cajas}</b>cajas o bobinas</div><div><b>${r.observadas+r.devueltas}</b>observadas o devueltas</div><div><b>${fecha(r.ultima)}</b>última recepción</div></div>`}
        <h3 class="ap-h3">Nombres con que aparece en las etiquetas</h3><div class="pv-chips">${nombresDe(p).filter((x,i,a)=>a.indexOf(x)===i).map(n=>`<span class="pv-chip">${esc(n)}</span>`).join('')}</div>
        <p class="pv-nota">Una foto con cualquiera de estos nombres se asigna a ${esc(p.nombreCorto||p.nombre)} y su lote no se duplica.</p></section>
        ${p.tipo==='CLIENTE'?'':`<section class="ap-card"><h3 class="ap-h3" style="margin-top:0">Historial de lotes por artículo</h3><p class="pv-nota">Cada lote se guarda una sola vez con todas sus cajas. En naranja, cuando el proveedor cambió de lote.</p>${tl||'<div class="ap-vacio">Sin lotes todavía.</div>'}</section>`}
        <section class="ap-card"><h3 class="ap-h3" style="margin-top:0">Cambios de la ficha</h3>${hist?`<ul class="ap-hist">${hist}</ul>`:'<div class="ap-vacio">Sin cambios.</div>'}</section>`;
    }
    return `<div class="pv-lay"><aside class="ap-card pv-lista"><input class="pv-in" type="search" id="pv-buscar" placeholder="Buscar proveedor o nombre leído…" aria-label="Buscar proveedor" value="${esc(S.buscar)}" oninput="pvBuscar(this.value)">${items}
      ${ed?'<button type="button" class="ap-btn ap-btn-o" onclick="pvNuevo()">+ Agregar proveedor o cliente</button>':''}</aside><div>${ficha}</div></div>`;
  }
  function vistaUnificar(){
    const ed=puedeEscribir();
    const grupos=agruparNombres(nombresLeidos(),cache.lista);
    S.grupos=grupos;
    const opts=cache.lista.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')).map(p=>`<option value="${esc(p.id)}">${esc(p.nombre)}${p.tipo==='CLIENTE'?' (cliente)':''}</option>`).join('');
    const filas=grupos.map((g,i)=>`<div class="pv-grupo"><div>${g.nombres.map((x,j)=>`<label><input type="checkbox" class="pv-g${i}" value="${j}" checked ${ed?'':'disabled'}> ${esc(x.texto)} <small class="pv-nota">(${x.veces})</small></label>`).join('')}</div>
      ${ed?`<div class="pv-fila"><label>Nombre en el banco<input class="pv-in" id="pv-n${i}" value="${esc(g.sugerido)}"></label>
        <label>Es<select class="pv-in" id="pv-t${i}"><option value="PROVEEDOR">Proveedor</option><option value="CLIENTE">Cliente (no proveedor)</option></select></label>
        <button type="button" class="ap-btn" onclick="pvCrearGrupo(${i})">Crear</button></div>
        ${cache.lista.length?`<div class="pv-fila"><label>…o agregar estos nombres a<select class="pv-in" id="pv-a${i}"><option value="">— elegir —</option>${g.parecidoA.length?g.parecidoA.map(p=>`<option value="${esc(p.id)}" selected>${esc(p.nombre)} (parecido)</option>`).join(''):''}${opts}</select></label><span></span>
        <button type="button" class="ap-btn ap-btn-o" onclick="pvAgregarGrupo(${i})">Agregar</button></div>`:''}`:''}</div>`).join('');
    return `<section class="ap-card"><h2 class="ap-h2">Unificar nombres</h2>
      <p class="pv-nota" style="font-size:13px">Nombres de proveedor leídos en las fotos y en los lotes que todavía no están en el banco, agrupados por parecido. Revisa cada grupo: desmarca lo que no corresponda, corrige el nombre y créalo, o agrégalo a uno que ya existe. Los nombres originales quedan como alias; no se borra nada.</p>
      ${grupos.length?filas:'<div class="ap-vacio">Todos los nombres leídos ya están en el banco.</div>'}</section>`;
  }
  function vistaPendientes(){
    const ev=(E()&&E().cache.lista)||[];
    const r=resumenPendientes(ev,cache.lista);
    if(!r.total)return '<section class="ap-card"><div class="ap-vacio">No hay evidencias pendientes.</div></section>';
    const g=r.grupos,pct=n=>(100*n/r.total).toFixed(1)+'%';
    return `<section class="ap-card"><h2 class="ap-h2">Evidencias pendientes: ${r.total} foto${r.total===1?'':'s'}</h2>
      <div class="pv-barra"><i style="width:${pct(g.completas.length)};background:#16a34a"></i><i style="width:${pct(g.casi.length)};background:#0877A6"></i><i style="width:${pct(g.sinLote.length)};background:#f59e0b"></i><i style="width:${pct(g.sinDatos.length)};background:#dc2626"></i></div>
      <div class="ap-tw" style="margin-top:10px"><table class="ap-t"><thead><tr><th>Grupo</th><th class="ap-num">Fotos</th><th>Qué hacer</th></tr></thead><tbody>
        <tr><td data-label="Grupo"><b>Completas</b><small class="ap-mut ap-blk">proveedor, lote y n.º de caja</small></td><td data-label="Fotos" class="ap-num">${g.completas.length}</td><td data-label="Qué hacer">Revisar y crear el lote en Evidencias (las cajas del mismo lote se confirman juntas).</td></tr>
        <tr><td data-label="Grupo"><b>Casi completas</b><small class="ap-mut ap-blk">falta el n.º de caja o es hoja de producción</small></td><td data-label="Fotos" class="ap-num">${g.casi.length}</td><td data-label="Qué hacer">Completar el n.º o descartar si repite otra foto del mismo lote.</td></tr>
        <tr><td data-label="Grupo"><b>Sin lote</b></td><td data-label="Fotos" class="ap-num">${g.sinLote.length}</td><td data-label="Qué hacer">Volver a tomar la foto o escribir el lote.</td></tr>
        <tr><td data-label="Grupo"><b>Sin datos útiles</b></td><td data-label="Fotos" class="ap-num">${g.sinDatos.length}</td><td data-label="Qué hacer">Rechazar como «foto ilegible» o volver a tomarla.</td></tr></tbody></table></div>
      <p class="pv-nota">Las que tienen lote son <b>${r.lotesDistintos}</b> lotes distintos. ${r.nombresSinBanco.length?`Hay <b>${r.nombresSinBanco.length}</b> nombres de proveedor que aún no están en el banco: <a href="#" onclick="event.preventDefault();pvVista('unificar')">unificarlos</a>.`:'Todos los proveedores están en el banco.'}</p>
      ${r.repetidos.length?`<h3 class="ap-h3">Lotes que se repiten (se guardan una sola vez)</h3><div class="ap-tw"><table class="ap-t"><thead><tr><th>Lote</th><th>Proveedor</th><th class="ap-num">Fotos</th><th>Categorías leídas</th></tr></thead><tbody>
        ${r.repetidos.map(x=>`<tr><td data-label="Lote"><b>${esc(x.lote)}</b></td><td data-label="Proveedor">${esc(x.proveedores.join(' · '))}</td><td data-label="Fotos" class="ap-num">${x.fotos}</td><td data-label="Categorías">${esc(x.categorias.join(', '))}${x.categorias.length>1?' <span class="ap-pill ap-p-ambar"><i></i>revisar</span>':''}</td></tr>`).join('')}</tbody></table></div>`:''}
      <div class="ap-acc" style="margin-top:10px"><button type="button" class="ap-btn ap-btn-o" onclick="AP_set('tab','evidencias')">Ir a Evidencias</button></div></section>`;
  }
  function html(){
    escuchar();
    const z=Z(),e=E();
    if(z&&z.escuchar)z.escuchar();
    if(e&&e.escuchar)e.escuchar();
    if(!quitar.length){
      quitar.push(window.glacialProveedores.alCambiar(repintar));
      if(z&&z.alCambiar)quitar.push(z.alCambiar(repintar));
      if(e&&e.alCambiar)quitar.push(e.alCambiar(repintar));
    }
    const sub=[['proveedores','Proveedores'],['unificar','Unificar nombres'],['pendientes','Evidencias pendientes']].map(([k,t])=>`<button type="button" class="ap-sub ${S.vista===k?'ap-sub-act':''}" onclick="pvVista('${k}')">${t}</button>`).join('');
    const estado=cache.error?`<div class="ap-msg ap-msg-error" role="alert"><span>No se pudo leer el banco de proveedores: ${esc(cache.error)}</span></div>`:(!cache.listo?'<div class="ap-msg ap-msg-info"><span>Consultando el banco de proveedores…</span></div>':'');
    const msg=S.msg?`<div class="ap-msg ap-msg-${S.msg.tipo==='error'?'error':'ok'}" role="status"><span>${esc(S.msg.texto)}</span></div>`:'';
    const cuerpo=S.vista==='unificar'?vistaUnificar():S.vista==='pendientes'?vistaPendientes():vistaProveedores();
    return `${estilos()}<section class="ap-card"><div class="ap-tit-acc"><h2 class="ap-h2 ap-h2-in">Banco de proveedores</h2></div>
      <p class="pv-nota" style="font-size:13px">Cada proveedor tiene una sola ficha con los nombres con que aparece en las etiquetas. Al crear un lote desde una foto se usa el nombre del banco: el mismo lote con muchas cajas queda en un solo lote, y cada cambio de lote queda registrado.</p>
      <div class="ap-subs">${sub}</div>${estado}${msg}</section>${cuerpo}`;
  }
  function usar(h){host=Object.assign({pintar:()=>{},activo:()=>false},h||{});}
  const ok=t=>{S.msg={tipo:'ok',texto:t};repintar();};
  const mal=e=>{S.msg={tipo:'error',texto:String(e&&e.message||e)};repintar();};
  window.pvVista=v=>{S.vista=v;S.msg=null;repintar();};
  window.pvSel=id=>{S.sel=id;S.msg=null;repintar();};
  window.pvBuscar=v=>{S.buscar=String(v||'');repintar();const i=document.getElementById('pv-buscar');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}};
  window.pvCrearGrupo=async i=>{
    const g=S.grupos&&S.grupos[i];if(!g)return;
    const marcados=[...document.querySelectorAll('.pv-g'+i+':checked')].map(x=>g.nombres[Number(x.value)].texto);
    const nombre=(document.getElementById('pv-n'+i)||{}).value||g.sugerido,tipo=(document.getElementById('pv-t'+i)||{}).value||'PROVEEDOR';
    if(!marcados.length)return mal('Marca al menos un nombre.');
    try{const id=await guardar({nombre,tipo,alias:marcados,categorias:[]},null,'Unificar nombres');S.sel=id;ok(`${nombre} creado con ${marcados.length} nombre${marcados.length===1?'':'s'}.`);}catch(e){mal(e);}
  };
  window.pvAgregarGrupo=async i=>{
    const g=S.grupos&&S.grupos[i];if(!g)return;
    const destino=(document.getElementById('pv-a'+i)||{}).value;const p=cache.lista.find(x=>x.id===destino);
    if(!p)return mal('Elige a qué proveedor agregar los nombres.');
    const marcados=[...document.querySelectorAll('.pv-g'+i+':checked')].map(x=>g.nombres[Number(x.value)].texto);
    if(!marcados.length)return mal('Marca al menos un nombre.');
    try{await guardar({nombre:p.nombre,tipo:p.tipo,nombreCorto:p.nombreCorto,categorias:p.categorias,activo:p.activo,alias:(p.alias||[]).concat(marcados)},p.id,'Unificar nombres');ok(`Nombres agregados a ${p.nombre}.`);}catch(e){mal(e);}
  };
  function modal(titulo,cuerpo){
    const raiz=document.getElementById('modal-root');if(!raiz)return;
    raiz.innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal ap-modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="modal-head"><h3>${esc(titulo)}</h3><button class="modal-close" onclick="closeModal()" aria-label="Cerrar">✕</button></div><div class="modal-body ap">${estilos()}${cuerpo}</div></div></div>`;
  }
  function formulario(p){
    S.form=p?p.id:'';
    modal(p?'Editar '+p.nombre:'Nuevo proveedor o cliente',`<div class="ap-form ap-form-2">
      <label class="ap-campo"><span>Nombre (como en la etiqueta)</span><input class="pv-in" id="pv-f-nombre" maxlength="120" value="${esc(p?p.nombre:'')}"></label>
      <label class="ap-campo"><span>Nombre corto</span><input class="pv-in" id="pv-f-corto" maxlength="30" value="${esc(p?p.nombreCorto:'')}"></label>
      <label class="ap-campo"><span>Es</span><select class="pv-in" id="pv-f-tipo"><option value="PROVEEDOR" ${!p||p.tipo!=='CLIENTE'?'selected':''}>Proveedor</option><option value="CLIENTE" ${p&&p.tipo==='CLIENTE'?'selected':''}>Cliente (no proveedor)</option></select></label>
      <label class="ap-campo"><span>Estado</span><select class="pv-in" id="pv-f-activo"><option value="1" ${!p||p.activo!==false?'selected':''}>Activo</option><option value="0" ${p&&p.activo===false?'selected':''}>Inactivo</option></select></label></div>
      <label class="ap-campo ap-ancho"><span>Otros nombres con que aparece (uno por línea)</span><textarea class="pv-in" id="pv-f-alias" rows="5">${esc(p?(p.alias||[]).join('\n'):'')}</textarea></label>
      <div class="ap-campo ap-ancho"><span>Categorías que entrega</span><div>${CATEGORIAS.map(c=>`<label style="display:inline-flex;gap:6px;margin:4px 10px 4px 0"><input type="checkbox" class="pv-f-cat" value="${c}" ${p&&(p.categorias||[]).includes(c)?'checked':''}> ${c}</label>`).join('')}</div></div>
      ${p?'<label class="ap-campo ap-ancho"><span>Motivo del cambio</span><input class="pv-in" id="pv-f-motivo" maxlength="200"></label>':''}
      <div id="pv-f-err" role="alert" style="color:#c62828;font-size:13px;min-height:16px"></div>
      <div class="ap-acc" style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="ap-btn" onclick="pvGuardarForm()">Guardar</button><button type="button" class="ap-btn ap-btn-o" onclick="closeModal()">Cancelar</button></div>`);
  }
  window.pvNuevo=()=>formulario(null);
  window.pvEditar=id=>formulario(cache.lista.find(p=>p.id===id)||null);
  window.pvGuardarForm=async()=>{
    const v=id=>(document.getElementById(id)||{}).value||'';
    const datos={nombre:v('pv-f-nombre'),nombreCorto:v('pv-f-corto'),tipo:v('pv-f-tipo'),activo:v('pv-f-activo')!=='0',
      alias:v('pv-f-alias').split('\n').map(x=>x.trim()).filter(Boolean),categorias:[...document.querySelectorAll('.pv-f-cat:checked')].map(x=>x.value)};
    try{const id=await guardar(datos,S.form||null,v('pv-f-motivo'));if(typeof closeModal==='function')closeModal();S.sel=id;ok('Proveedor guardado.');}
    catch(e){const el=document.getElementById('pv-f-err');if(el)el.textContent=String(e&&e.message||e);}
  };
  window.apProveedoresUI={html,usar};
})();
