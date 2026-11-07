/* =====================================================================================================================
   GLACIAL · CONVERSIONES DE MERMAS (Asistente de Producción › Conversiones) · docs/asistente/conversiones.md
   Única fuente de cómo se convierte cada merma del Registro (kg → UND, UND → kg). Antes estaban fijas en el código
   (MERMA_DIVISORES_POR_LINEA y MERMA_CONVERSION_FISICA_POR_LINEA en 01-config.js); esos valores siguen siendo la base:
   mientras no exista el documento apParametros/conversiones (o no se pueda leer) se usan tal cual.
   Reglas acordadas con Producción (07/11/2026):
     · Un cambio vale desde su fecha de vigencia (fecha del reporte ≥ vigencia). Los reportes de fechas anteriores
       conservan la conversión que tenían; nada se recalcula hacia atrás.
     · Unidades: UND, PLANCHA o KG. Las unidades por paleta no se tocan aquí.
   Documento: apParametros/conversiones = { id, version, historial[], conversiones[] } donde cada conversión es
     { clave:'LINEA|Item', linea, item, unidad, config, vigenteDesde:'AAAA-MM-DD', version, origen:'codigo'|'manual', motivo, por, en }
   y `config` tiene EXACTAMENTE la forma del código (número de gramos, {divisor,sinMultiplicarPor1000,decimales} o
   {entrada,factor}), para que el cálculo del Registro sea el mismo de siempre.
   ===================================================================================================================== */
(function(){
  'use strict';
  const UNIDADES=['UND','PLANCHA','KG'];
  const DESDE_CODIGO='2000-01-01';
  const copia=o=>o===undefined?undefined:JSON.parse(JSON.stringify(o));
  const esFecha=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''));

  /* ------------------------------------------------------------------ núcleo puro (sin base de datos) */
  function tipoDe(cfg){
    if(cfg==='gramajePreforma')return 'GRAMAJE';
    if(typeof cfg==='number')return 'PESO_A_UND';
    if(cfg&&cfg.entrada==='peso')return 'FACTOR_PESO';
    if(cfg&&cfg.entrada==='unidades')return 'UND_A_PESO';
    if(cfg&&typeof cfg.divisor==='number')return 'PESO_A_UND';
    return null;
  }
  /* Peso de 1 unidad en gramos (null si la conversión no es «1 unidad = X»). */
  function gramosPorUnidad(cfg){
    const t=tipoDe(cfg);
    if(t==='PESO_A_UND')return typeof cfg==='number'?cfg:(cfg.sinMultiplicarPor1000?cfg.divisor*1000:cfg.divisor);
    if(t==='UND_A_PESO')return cfg.factor*1000;
    return null;
  }
  const redondeo=n=>Number(Number(n).toPrecision(12));        // 0.00064*1000 = 0.64, no 0.6400000000000001
  /* La misma forma que tenía, con el nuevo peso por unidad (en gramos) o el nuevo factor de peso. */
  function conValor(cfg,valor){
    const t=tipoDe(cfg),v=Number(valor);
    if(t==='PESO_A_UND'){
      if(typeof cfg==='number')return redondeo(v);
      return Object.assign({},cfg,{divisor:redondeo(cfg.sinMultiplicarPor1000?v/1000:v)});
    }
    if(t==='UND_A_PESO')return Object.assign({},cfg,{factor:redondeo(v/1000)});
    if(t==='FACTOR_PESO')return Object.assign({},cfg,{factor:redondeo(v)});
    return copia(cfg);
  }
  /* Valor que se edita: gramos por unidad, o el factor (kg calculado por kg ingresado). */
  function valorEditable(cfg){
    const t=tipoDe(cfg);
    if(t==='FACTOR_PESO')return cfg.factor;
    const g=gramosPorUnidad(cfg);return g===null?null:redondeo(g);
  }
  /* 1 234,5 (coma decimal, espacio de miles), igual en todos los navegadores. */
  const fmt=(n,d)=>{
    const x=Number(n);if(!Number.isFinite(x))return '—';
    const t=String(Number(Math.abs(x).toFixed(d===undefined?6:d))).split('.');
    return (x<0?'−':'')+t[0].replace(/\B(?=(\d{3})+(?!\d))/g,' ')+(t[1]?','+t[1]:'');
  };
  function pesoTexto(g){return g>=1000?`${fmt(g/1000)} kg`:`${fmt(g)} g`;}
  /* «1 UND = 1,34 g» · «1 KG ingresado = 0,36 KG» · «1 UND = gramaje de la preforma del cuadro». */
  function texto(cfg,unidad){
    const t=tipoDe(cfg),u=unidad||'UND';
    if(t==='GRAMAJE')return `1 ${u} = gramaje de la preforma del cuadro`;
    if(t==='FACTOR_PESO')return `1 KG ingresado = ${fmt(cfg.factor)} KG`;
    const g=gramosPorUnidad(cfg);return g===null?'—':`1 ${u} = ${pesoTexto(g)}`;
  }
  /* Qué se ingresa en el Registro y qué calcula el sistema. */
  function comoSeUsa(cfg,unidad){
    const t=tipoDe(cfg),u=unidad||'UND';
    if(t==='GRAMAJE')return `Se ingresa el peso (kg) y se calculan las ${u} con el gramaje de la preforma.`;
    if(t==='PESO_A_UND')return `Se ingresa el peso (kg) y se calculan las ${u}.`;
    if(t==='UND_A_PESO')return `Se ingresan las ${u} y se calcula el peso (kg).`;
    if(t==='FACTOR_PESO')return 'Se ingresa el peso (kg) y se calcula el peso corregido (kg).';
    return '';
  }
  /* Calculadora con la MISMA fórmula del Registro (06-registro.js · calcularValoresMerma / calcularMermaFisica). */
  function calcular(cfg,cantidad,gramaje){
    const t=tipoDe(cfg),c=Number(cantidad);const n=Number.isFinite(c)&&c>=0?c:0;
    if(t==='GRAMAJE'){const g=Number(gramaje)||0;return {entrada:'kg',salida:'UND',valor:g>0?Math.round(n*1000/g):0};}
    if(t==='PESO_A_UND'){
      if(typeof cfg==='number')return {entrada:'kg',salida:'UND',valor:Math.round(n*1000/cfg)};
      const v=(cfg.sinMultiplicarPor1000?n:n*1000)/cfg.divisor;
      return {entrada:'kg',salida:'UND',valor:cfg.decimales!==undefined?Number(v.toFixed(cfg.decimales)):Math.round(v)};
    }
    if(t==='UND_A_PESO')return {entrada:'UND',salida:'kg',valor:Math.round(n)*cfg.factor};
    if(t==='FACTOR_PESO')return {entrada:'kg',salida:'kg',valor:n*cfg.factor};
    return {entrada:'',salida:'',valor:0};
  }
  /* Lista inicial con los valores del código (una entrada por línea e ítem; PET2 copia a PET1 como en el código). */
  function desdeCodigo(divisores,fisicas){
    const out=[];
    const agregar=(linea,item,cfg)=>{
      const t=tipoDe(cfg);if(!t)return;
      out.push({clave:linea+'|'+item,linea,item,unidad:t==='FACTOR_PESO'?'KG':'UND',config:copia(cfg),vigenteDesde:DESDE_CODIGO,version:0,origen:'codigo'});
    };
    Object.keys(divisores||{}).forEach(l=>Object.keys(divisores[l]||{}).forEach(i=>agregar(l,i,divisores[l][i])));
    Object.keys(fisicas||{}).forEach(l=>Object.keys(fisicas[l]||{}).forEach(i=>agregar(l,i,fisicas[l][i])));
    return out;
  }
  /* Conversión vigente para la fecha del reporte: la de mayor vigenteDesde ≤ fecha (a igual fecha, la versión mayor). */
  function vigenteEntrada(lista,linea,item,fecha){
    const clave=linea+'|'+item;
    const c=(lista||[]).filter(x=>x&&x.clave===clave&&esFecha(x.vigenteDesde)&&(!esFecha(fecha)||x.vigenteDesde<=fecha));
    if(!c.length)return null;
    c.sort((a,b)=>a.vigenteDesde<b.vigenteDesde?-1:a.vigenteDesde>b.vigenteDesde?1:(Number(a.version)||0)-(Number(b.version)||0));
    return c[c.length-1];
  }
  function vigente(lista,linea,item,fecha){const e=vigenteEntrada(lista,linea,item,fecha);return e?copia(e.config):undefined;}
  /* Versiones de una clave, de la más nueva a la más antigua. */
  function versiones(lista,clave){
    return (lista||[]).filter(x=>x&&x.clave===clave).sort((a,b)=>a.vigenteDesde<b.vigenteDesde?1:a.vigenteDesde>b.vigenteDesde?-1:(Number(b.version)||0)-(Number(a.version)||0));
  }
  /* Claves agrupadas por ítem (para la lista de la izquierda): mismo nombre en varias líneas = un solo insumo. */
  function grupos(lista){
    const m=new Map();
    (lista||[]).forEach(x=>{if(!m.has(x.item))m.set(x.item,new Set());m.get(x.item).add(x.linea);});
    return [...m.entries()].map(([item,ls])=>({item,lineas:[...ls].sort()})).sort((a,b)=>a.item.localeCompare(b.item,'es'));
  }
  /* Cambio de una conversión en una o varias líneas → {conversiones, historial} nuevos, o {errores}. */
  function planCambio(lista,p){
    const errores=[];
    const valor=Number(p.valor);
    if(!(Number.isFinite(valor)&&valor>0))errores.push('El valor debe ser un número mayor que 0.');
    if(!UNIDADES.includes(p.unidad))errores.push('La unidad debe ser UND, PLANCHA o KG.');
    if(!esFecha(p.vigenteDesde))errores.push('Indica la fecha desde la que vale.');
    else if(esFecha(p.hoy)&&p.vigenteDesde<p.hoy)errores.push('La fecha de vigencia no puede ser anterior a hoy: los reportes pasados conservan su conversión.');
    const motivo=String(p.motivo||'').trim();
    if(motivo.length<5)errores.push('Escribe el motivo del cambio (mínimo 5 caracteres).');
    const lineas=[...new Set(p.lineas||[])];
    if(!lineas.length)errores.push('Elige al menos una línea.');
    const nuevas=[];
    lineas.forEach(l=>{
      const act=vigenteEntrada(lista,l,p.item,p.vigenteDesde)||vigenteEntrada(lista,l,p.item,'');
      if(!act){errores.push(`No hay conversión de ${p.item} en ${l}.`);return;}
      const t=tipoDe(act.config);
      if(t==='GRAMAJE'){errores.push(`${p.item} (${l}) usa el gramaje de la preforma del cuadro: no se cambia aquí.`);return;}
      if(t==='FACTOR_PESO'&&p.unidad!=='KG'){errores.push(`${p.item} (${l}) se ingresa en kg: su unidad es KG.`);return;}
      const ver=Math.max(0,...versiones(lista,act.clave).map(x=>Number(x.version)||0))+1;
      nuevas.push({clave:act.clave,linea:l,item:p.item,unidad:p.unidad,config:conValor(act.config,valor),vigenteDesde:p.vigenteDesde,version:ver,
        origen:'manual',motivo,por:p.por||'',uid:p.uid||'',en:p.en||0,antes:valorEditable(act.config)});
    });
    if(errores.length)return {errores};
    const historial={por:p.por||'',uid:p.uid||'',en:p.en||0,item:p.item,lineas,valor,unidad:p.unidad,vigenteDesde:p.vigenteDesde,motivo};
    return {conversiones:[...(lista||[]).map(copia),...nuevas],nuevas,historial};
  }
  /* Clase de insumo (tipo del Asistente o categoría de Lotes) → ítems de merma del Registro que la representan. */
  const PATRONES={tapa:/^Tapa/i,tapas:/^Tapa/i,etiqueta:/^Etiqueta/i,etiquetas:/^Etiqueta/i,asa:/^Asa/i,asas:/^Asa/i,cajas:/^Cajas$/i,caja:/^Cajas$/i,bolsas:/^Bolsas/i,bolsa:/^Bolsas/i};
  /* Conversiones «1 unidad = X g» vigentes en una línea para esa clase (sin repetir el mismo peso). Polietileno y preformas no:
     el polietileno ya se mide en kg y la preforma depende del gramaje del cuadro. */
  function opcionesKg(lista,linea,clase,fecha){
    const re=PATRONES[String(clase||'').toLowerCase()];if(!re)return [];
    const items=[...new Set((lista||[]).filter(x=>x&&x.linea===linea&&re.test(x.item)).map(x=>x.item))];
    const out=[];
    items.forEach(item=>{
      const e=vigenteEntrada(lista,linea,item,fecha);if(!e)return;
      const t=tipoDe(e.config);if(t!=='PESO_A_UND'&&t!=='UND_A_PESO')return;
      if(t==='PESO_A_UND'&&typeof e.config==='object'&&e.config.decimales!==undefined)return;
      const g=gramosPorUnidad(e.config);
      const igual=out.find(o=>o.gramos===g);
      if(igual){igual.items.push(item);return;}
      out.push({item,items:[item],linea,config:copia(e.config),unidad:e.unidad,gramos:g,texto:texto(e.config,e.unidad),vigenteDesde:e.vigenteDesde,version:Number(e.version)||0});
    });
    return out;
  }
  /* kg pesados → unidades enteras, con la misma fórmula del Registro (kg × 1000 ÷ g, redondeado). */
  function kgAUnidades(cfg,kg){
    const t=tipoDe(cfg),n=Number(kg);if(!(Number.isFinite(n)&&n>=0))return 0;
    if(t==='PESO_A_UND')return calcular(cfg,n).valor;
    if(t==='UND_A_PESO')return cfg.factor>0?Math.round(n/cfg.factor):0;
    return 0;
  }
  /* ¿La merma de este ítem se valora por peso (kg)? Sí cuando su conversión solo da kg (p. ej. Polietileno 54 cm de C20L). */
  function mermaPorPeso(lista,linea,item,fecha){
    const e=vigenteEntrada(lista,linea,item,fecha);return !!(e&&tipoDe(e.config)==='FACTOR_PESO');
  }
  /* Variación porcentual del valor (para el aviso antes de guardar). */
  const variacion=(antes,despues)=>Number(antes)>0?((Number(despues)-Number(antes))/Number(antes))*100:null;

  const N={UNIDADES,DESDE_CODIGO,opcionesKg,kgAUnidades,mermaPorPeso,tipoDe,gramosPorUnidad,conValor,valorEditable,texto,comoSeUsa,calcular,desdeCodigo,vigente,vigenteEntrada,versiones,grupos,planCambio,variacion};
  if(typeof module!=='undefined'&&module.exports)module.exports=N;
  if(typeof window==='undefined')return;
  window.GlacialConversionesNucleo=N;

  /* ------------------------------------------------------------------ datos (apParametros/conversiones) */
  const cache={doc:null,listo:false,error:''};
  let cierre=null;const oyentes=[];
  const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(_){/* una vista no rompe a otra */}});
  const hayDb=()=>typeof db!=='undefined'&&db&&typeof db.collection==='function';
  const codigo=()=>desdeCodigo(typeof MERMA_DIVISORES_POR_LINEA!=='undefined'?MERMA_DIVISORES_POR_LINEA:{},
    typeof MERMA_CONVERSION_FISICA_POR_LINEA!=='undefined'?MERMA_CONVERSION_FISICA_POR_LINEA:{});
  function escuchar(){
    if(cierre||!hayDb())return;
    const rol=typeof state!=='undefined'&&state.user?String(state.user.rol||''):'';
    if(rol==='mantenimiento_compartido')return;          // las reglas no le dan lectura: sigue con los valores del código
    cache.listo=false;cache.error='';
    try{
      cierre=db.collection('apParametros').doc('conversiones').onSnapshot(s=>{cache.doc=s.exists?s.data():null;cache.listo=true;cache.error='';avisar();},
        e=>{cache.error=String((e&&e.message)||e);cache.listo=false;avisar();});
    }catch(e){cache.error=String((e&&e.message)||e);}
  }
  function detener(){if(cierre){try{cierre();}catch(_){/* ya cerrada */}}cierre=null;cache.doc=null;cache.listo=false;cache.error='';}
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(detener);
  /* Lista en uso: la del documento si existe; si no, la del código. */
  const lista=()=>cache.listo&&cache.doc&&Array.isArray(cache.doc.conversiones)&&cache.doc.conversiones.length?cache.doc.conversiones:codigo();
  const hoy=()=>{
    if(typeof fechaOperativaDeAhora==='function')return fechaOperativaDeAhora();
    const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  };
  /* Lo que usa el Registro (01-config.js · mermaConfigVigente). undefined = usar el código (sin documento, sin leer o sin entrada). */
  window.glacialConversiones={
    listo:()=>cache.listo&&!cache.error,
    config(linea,item,fecha){
      if(!cierre&&typeof state!=='undefined'&&state.user)escuchar();
      if(!(cache.listo&&!cache.error&&cache.doc&&Array.isArray(cache.doc.conversiones)))return undefined;
      return vigente(cache.doc.conversiones,linea,item,esFecha(fecha)?fecha:hoy());
    },
    /* Para el Asistente, Lotes e Impacto: con la lista en uso (la guardada o la del código) y la fecha indicada. */
    opcionesKg:(linea,clase,fecha)=>opcionesKg(lista(),linea,clase,esFecha(fecha)?fecha:hoy()),
    kgAUnidades,
    mermaPorPeso:(linea,item,fecha)=>mermaPorPeso(lista(),linea,item,esFecha(fecha)?fecha:hoy()),
    lista,escuchar,detener,alCambiar:f=>{oyentes.push(f);return ()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};}
  };
  window.glacialConversionesEscuchas=escuchar;

  const D=()=>window.glacialAsistenteDatos;
  const puede=k=>!!(D()&&D().puede(k));
  const usuario=()=>{
    const u=(typeof firebase!=='undefined'&&firebase.auth&&firebase.auth().currentUser)||null;
    return {uid:(u&&u.uid)||'',nombre:(typeof state!=='undefined'&&state.user&&(state.user.nombre||state.user.username))||''};
  };
  const ahoraMs=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  async function guardarCambio(p){
    if(!puede('gestionarFactores'))throw new Error('No tienes permiso para cambiar conversiones (requiere administrar factores).');
    const ref=db.collection('apParametros').doc('conversiones');const u=usuario();
    const versionEsperada=Number(cache.doc&&cache.doc.version)||0;
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);const antes=s.exists?s.data():null;
      if((Number(antes&&antes.version)||0)!==versionEsperada)throw new Error('Otra persona cambió las conversiones mientras editabas. Vuelve a abrir el cambio.');
      const base=antes&&Array.isArray(antes.conversiones)&&antes.conversiones.length?antes.conversiones:codigo();
      const r=planCambio(base,Object.assign({},p,{hoy:hoy(),por:u.nombre,uid:u.uid,en:ahoraMs()}));
      if(r.errores)throw new Error(r.errores.join(' · '));
      const sello=firebase.firestore.FieldValue.serverTimestamp();
      const d={id:'conversiones',conversiones:r.conversiones,version:versionEsperada+1,historial:[...((antes&&antes.historial)||[]),r.historial],
        actualizadoUid:u.uid,actualizadoPor:u.nombre,actualizadoEn:sello};
      tx.set(ref,d);
      tx.set(db.collection('apAuditoria').doc(),{coleccion:'apParametros',docId:'conversiones',operacion:antes?'CAMBIAR_CONVERSION':'CREAR_CONVERSIONES',
        antes:JSON.parse(JSON.stringify(r.nuevas.map(x=>({clave:x.clave,valor:x.antes})))),despues:JSON.parse(JSON.stringify(r.nuevas.map(x=>({clave:x.clave,config:x.config,unidad:x.unidad,vigenteDesde:x.vigenteDesde,motivo:x.motivo})))),
        uid:u.uid,usuario:u.nombre,en:sello});
    });
  }

  /* ------------------------------------------------------------------ pantalla */
  const esc=s=>String(s===undefined||s===null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const UI={sel:'',buscar:'',calc:'10',gramaje:'',msg:null};
  let host={pintar:()=>{},activo:()=>false};
  let quitarOyente=null;
  const repintar=()=>{if(host.activo())host.pintar();};
  const fechaTxt=f=>f===DESDE_CODIGO?'Desde siempre (código)':esFecha(f)?f.split('-').reverse().join('/'):'—';
  const enTxt=ms=>{if(!ms)return '';const d=new Date(Number(ms));return isNaN(d)?'':d.toLocaleString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});};
  function estilos(){return `<style>
.cv-lay{display:grid;grid-template-columns:260px 1fr;gap:14px;align-items:start}
.cv-lista{display:flex;flex-direction:column;gap:6px}
.cv-it{border:1px solid var(--ap-linea,#dbe3ea);border-radius:10px;padding:9px 11px;background:#fff;text-align:left;font:inherit;cursor:pointer;min-height:44px}
.cv-it b{display:block}.cv-it small{color:#5b6b7c}
.cv-it.cv-act{border-color:#0877A6;box-shadow:inset 4px 0 0 #0877A6;background:#f3f9fc}
.cv-eq{font-weight:800;font-size:15px;white-space:nowrap}
.cv-calc{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:end;margin-top:6px}
.cv-calc label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:#5b6b7c}
.cv-calc input,.cv-form input,.cv-form select,.cv-buscar{font:inherit;font-size:15px;padding:9px 10px;border:1px solid #dbe3ea;border-radius:10px;min-height:42px;width:100%;box-sizing:border-box}
.cv-res{font-size:22px;font-weight:800;color:#0b2a4a;padding:6px 0}
.cv-flecha{font-size:22px;color:#5b6b7c;padding-bottom:12px}
.cv-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:8px 0}
.cv-form label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:#5b6b7c}
.cv-lineas{display:flex;gap:12px;flex-wrap:wrap;margin:6px 0}
.cv-lineas label{display:flex;gap:6px;align-items:center;font-weight:700;min-height:36px}
.cv-aviso{background:#fff7e6;border:1px solid #f5c26b;color:#8a4b00;border-radius:10px;padding:10px 12px;margin:8px 0}
.cv-nota{font-size:12px;color:#5b6b7c;margin-top:6px}
@media(max-width:860px){.cv-lay{grid-template-columns:1fr}.cv-calc{grid-template-columns:1fr}.cv-flecha{display:none}}
</style>`;}
  function html(){
    escuchar();
    if(!quitarOyente)quitarOyente=window.glacialConversiones.alCambiar(repintar);
    const L=lista(),G=grupos(L);
    const delDoc=!!(cache.listo&&cache.doc);
    if(!UI.sel||!G.some(g=>g.item===UI.sel))UI.sel=G.length?G[0].item:'';
    const b=UI.buscar.trim().toLowerCase();
    const items=G.filter(g=>!b||g.item.toLowerCase().includes(b)).map(g=>{
      const cambios=L.filter(x=>x.item===g.item&&x.origen==='manual').length;
      return `<button type="button" class="cv-it ${g.item===UI.sel?'cv-act':''}" onclick="cvSel(${esc(JSON.stringify(g.item))})"><b>${esc(g.item)}</b><small>${esc(g.lineas.join(', '))}${cambios?` · ${cambios} cambio${cambios===1?'':'s'}`:''}</small></button>`;
    }).join('')||'<div class="cv-nota">Sin resultados.</div>';
    const ed=puede('gestionarFactores')&&!(window.glacialVista&&window.glacialVista.activo&&window.glacialVista.activo());
    const g=G.find(x=>x.item===UI.sel);
    const estado=cache.error?`<div class="ap-msg ap-msg-error" role="alert"><span>No se pudieron leer las conversiones guardadas (${esc(cache.error)}). Se muestran y se usan los valores del código.</span></div>`
      :!cache.listo?`<div class="ap-msg ap-msg-info"><span>Consultando las conversiones…</span></div>`
      :!delDoc?`<div class="ap-msg ap-msg-info"><span>Todavía no hay cambios: se usan los valores que estaban en el código. El primer cambio guarda todas las conversiones con su historial.</span></div>`:'';
    const msg=UI.msg?`<div class="ap-msg ap-msg-${UI.msg.tipo==='error'?'error':'ok'}" role="status"><span>${esc(UI.msg.texto)}</span></div>`:'';
    let detalle='';
    if(g){
      const hoyF=hoy();
      const filas=g.lineas.map(l=>{
        const e=vigenteEntrada(L,l,g.item,hoyF);if(!e)return '';
        const prox=versiones(L,e.clave).filter(x=>x.vigenteDesde>hoyF);
        const t=tipoDe(e.config);
        return `<tr><td data-label="Línea"><b>${esc(l)}</b></td><td data-label="Equivalencia" class="cv-eq">${esc(texto(e.config,e.unidad))}</td>
          <td data-label="Cómo se usa">${esc(comoSeUsa(e.config,e.unidad))}</td><td data-label="Vigente desde">${esc(fechaTxt(e.vigenteDesde))}${prox.length?`<br><small>Programado: ${esc(texto(prox[prox.length-1].config,prox[prox.length-1].unidad))} desde ${esc(fechaTxt(prox[prox.length-1].vigenteDesde))}</small>`:''}</td>
          <td data-label="Origen">${e.origen==='codigo'?'<span class="ap-pill ap-p-gris"><i></i>del código</span>':`<span class="ap-pill ap-p-verde"><i></i>v${esc(e.version)} · ${esc(e.por||'')}</span>`}</td>
          <td data-label="">${ed&&t!=='GRAMAJE'?`<button type="button" class="ap-btn ap-btn-o ap-btn-s" onclick="cvCambiar(${esc(JSON.stringify(g.item))},${esc(JSON.stringify(l))})">Cambiar</button>`:''}</td></tr>`;
      }).join('');
      const e0=vigenteEntrada(L,g.lineas[0],g.item,hoyF);
      const r=e0?calcular(e0.config,UI.calc,UI.gramaje):null;
      const calc=r&&tipoDe(e0.config)?`<h3 class="ap-h3">Calculadora (${esc(g.lineas[0])}, valor vigente hoy)</h3>
        <div class="cv-calc"><label>Tengo (${esc(r.entrada)})<input type="number" min="0" step="any" inputmode="decimal" value="${esc(UI.calc)}" oninput="cvCalc(this.value)" aria-label="Cantidad a convertir"></label>
        <div class="cv-flecha" aria-hidden="true">→</div>
        <label>Equivale a<div class="cv-res" id="cv-res">${esc(fmt(r.valor,4))} ${esc(r.salida==='UND'?e0.unidad:r.salida)}</div></label></div>
        ${tipoDe(e0.config)==='GRAMAJE'?`<label class="cv-nota">Gramaje de la preforma (g) <input class="cv-buscar" style="max-width:160px" type="number" min="0" step="any" value="${esc(UI.gramaje)}" oninput="cvGramaje(this.value)"></label>`:''}
        <div class="cv-nota">Misma fórmula que usa el Registro de producción.</div>`:'';
      const hist=g.lineas.flatMap(l=>versiones(L,l+'|'+g.item)).filter(x=>x.origen==='manual')
        .sort((a,b)=>(Number(b.en)||0)-(Number(a.en)||0));
      detalle=`<section class="ap-card"><h2 class="ap-h2">${esc(g.item)}</h2>
        <div class="ap-tw"><table class="ap-t"><thead><tr><th>Línea</th><th>Equivalencia</th><th>Cómo se usa</th><th>Vigente desde</th><th>Origen</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>
        ${calc}</section>
        <section class="ap-card"><h3 class="ap-h3" style="margin-top:0">Dónde se usa</h3>
        <ul class="cv-nota" style="font-size:13px;margin:0;padding-left:18px">
          <li><b>Registro de producción › Mermas:</b> al ingresar o corregir la merma de un reporte con fecha desde la vigencia. El resultado queda guardado en el reporte y de ahí lo leen el Historial, el Reporte General, Inicio y los gráficos.</li>
          <li><b>Asistente › Merma:</b> una merma de tapas, etiquetas, asas, cajas o bolsas se puede ingresar pesada (kg); se guarda en UND con esta conversión y queda constancia del peso.</li>
          <li><b>Lotes:</b> UND estimadas de una caja o bobina en la línea, y del peso que queda al devolverla.</li>
          <li><b>Impacto económico:</b> las mermas cuya conversión da kg se valoran por peso.</li></ul>
        <p class="cv-nota">Los reportes de fechas anteriores no cambian. Cuánto insumo se consume por unidad producida (requerimientos, consumo, desviación y existencias) se define en <b>Insumos › Factores</b>, también con vigencia.</p></section>
        <section class="ap-card"><h3 class="ap-h3" style="margin-top:0">Historial</h3>
        ${hist.length?`<ul class="ap-hist">${hist.map(x=>`<li>${esc(enTxt(x.en))} · <b>${esc(x.linea)}</b> · ${esc(texto(x.config,x.unidad))} desde ${esc(fechaTxt(x.vigenteDesde))} · ${esc(x.por||'')}<br><small>Antes: ${esc(x.antes)} · Motivo: ${esc(x.motivo||'')}</small></li>`).join('')}</ul>`:'<div class="ap-vacio">Sin cambios: valores del código.</div>'}</section>`;
    }
    return `${estilos()}<section class="ap-card"><h2 class="ap-h2">Conversiones de mermas</h2>
      <p class="cv-nota" style="font-size:13px">Cómo se convierte cada merma del Registro entre UND, PLANCHA y KG. Un cambio vale <b>desde su fecha de vigencia</b>: los reportes de fechas anteriores conservan su conversión. Las unidades por paleta no se cambian aquí.</p>
      ${estado}${msg}</section>
      <div class="cv-lay"><aside class="ap-card cv-lista"><input class="cv-buscar" type="search" placeholder="Buscar insumo…" aria-label="Buscar insumo" value="${esc(UI.buscar)}" oninput="cvBuscar(this.value)">${items}</aside>
      <div>${detalle}</div></div>`;
  }
  function usar(h){host=Object.assign({pintar:()=>{},activo:()=>false},h||{});}

  window.cvSel=item=>{UI.sel=item;UI.msg=null;repintar();};
  window.cvBuscar=v=>{UI.buscar=String(v||'');repintar();const i=document.querySelector('.cv-buscar');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}};
  window.cvCalc=v=>{UI.calc=String(v||'');const L=lista(),g=grupos(L).find(x=>x.item===UI.sel);if(!g)return;
    const e=vigenteEntrada(L,g.lineas[0],g.item,hoy());const o=document.getElementById('cv-res');if(!e||!o)return;
    const r=calcular(e.config,UI.calc,UI.gramaje);o.textContent=`${fmt(r.valor,4)} ${r.salida==='UND'?e.unidad:r.salida}`;};
  window.cvGramaje=v=>{UI.gramaje=String(v||'');window.cvCalc(UI.calc);};
  function modal(titulo,cuerpo){
    const raiz=document.getElementById('modal-root');if(!raiz)return;
    raiz.innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal ap-modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="modal-head"><h3>${esc(titulo)}</h3><button class="modal-close" onclick="closeModal()" aria-label="Cerrar">✕</button></div><div class="modal-body ap">${estilos()}${cuerpo}</div></div></div>`;
  }
  window.cvCambiar=(item,linea)=>{
    const L=lista(),hoyF=hoy();
    const e=vigenteEntrada(L,linea,item,hoyF);if(!e)return;
    const t=tipoDe(e.config),v=valorEditable(e.config);
    // Otras líneas con el mismo ítem y el mismo valor: se ofrecen marcadas (p. ej. PET1 y PET2 comparten la tapa).
    const lineas=grupos(L).find(x=>x.item===item).lineas.filter(l=>{const o=vigenteEntrada(L,l,item,hoyF);return o&&tipoDe(o.config)===t;});
    const igual=l=>{const o=vigenteEntrada(L,l,item,hoyF);return l===linea||(o&&valorEditable(o.config)===v);};
    const etq=t==='FACTOR_PESO'?'Nuevo factor (kg calculado por cada kg ingresado)':'Nuevo peso de 1 unidad (en gramos)';
    modal(`Cambiar conversión: ${item}`,`<p><b>Ahora:</b> ${esc(texto(e.config,e.unidad))} <small>(${esc(fechaTxt(e.vigenteDesde))})</small></p>
      <div class="cv-form"><label>${esc(etq)}<input id="cv-valor" type="number" min="0" step="any" inputmode="decimal" value="${esc(v)}" oninput="cvPrevio()"></label>
      <label>Unidad<select id="cv-unidad" ${t==='FACTOR_PESO'?'disabled':''}>${UNIDADES.map(u=>`<option ${u===e.unidad?'selected':''}>${u}</option>`).join('')}</select></label>
      <label>Vigente desde<input id="cv-desde" type="date" min="${esc(hoyF)}" value="${esc(hoyF)}"></label>
      <label style="grid-column:1/-1">Motivo<input id="cv-motivo" maxlength="200" placeholder="Ej.: nuevo molde de tapa, pesado en balanza"></label></div>
      <div>Aplicar en:</div><div class="cv-lineas">${lineas.map(l=>`<label><input type="checkbox" class="cv-l" value="${esc(l)}" ${igual(l)?'checked':''}> ${esc(l)}</label>`).join('')}</div>
      <div id="cv-previo" data-antes="${esc(v)}" data-tipo="${esc(t)}"></div>
      <div class="ap-acc" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" class="ap-btn" id="cv-guardar" onclick="cvGuardar(${esc(JSON.stringify(item))})">Guardar cambio</button><button type="button" class="ap-btn ap-btn-o" onclick="closeModal()">Cancelar</button></div>`);
    window.cvPrevio();
  };
  window.cvPrevio=()=>{
    const p=document.getElementById('cv-previo'),i=document.getElementById('cv-valor');if(!p||!i)return;
    const antes=Number(p.dataset.antes),nuevo=Number(i.value);
    const x=variacion(antes,nuevo);
    if(x===null||!Number.isFinite(nuevo)||nuevo<=0){p.innerHTML='';return;}
    const t=p.dataset.tipo;
    const ej=t==='FACTOR_PESO'?`10 kg ingresados: ${fmt(10*antes,4)} kg → ${fmt(10*nuevo,4)} kg`
      :t==='UND_A_PESO'?`100 UND: ${fmt(100*antes/1000,4)} kg → ${fmt(100*nuevo/1000,4)} kg`
      :`10 kg: ${fmt(Math.round(10000/antes))} UND → ${fmt(Math.round(10000/nuevo))} UND`;
    p.innerHTML=`<div class="cv-aviso">Cambio de <b>${x>0?'+':''}${fmt(x,1)} %</b>. Ejemplo: ${esc(ej)}. Solo afecta a los reportes con fecha desde la vigencia, cuando se ingresa o corrige su merma.</div>`;
  };
  window.cvGuardar=async item=>{
    const v=id=>{const e=document.getElementById(id);return e?e.value:'';};
    const lineas=[...document.querySelectorAll('.cv-l:checked')].map(x=>x.value);
    const b=document.getElementById('cv-guardar');if(b)b.disabled=true;
    try{
      const L=lista();const e=vigenteEntrada(L,lineas[0]||'',item,hoy());
      const unidad=e&&tipoDe(e.config)==='FACTOR_PESO'?'KG':v('cv-unidad');
      await guardarCambio({item,lineas,valor:v('cv-valor'),unidad,vigenteDesde:v('cv-desde'),motivo:v('cv-motivo')});
      if(typeof closeModal==='function')closeModal();
      UI.msg={tipo:'ok',texto:`Conversión de ${item} guardada. Vale desde ${fechaTxt(v('cv-desde'))}.`};repintar();
    }catch(err){
      if(b)b.disabled=false;
      const p=document.getElementById('cv-previo');
      if(p)p.innerHTML=`<div class="ap-msg ap-msg-error" role="alert"><span>${esc(err&&err.message||err)}</span></div>`;
    }
  };
  window.apConversionesUI={html,usar};
})();
