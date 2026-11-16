/* =============================================================
   GLACIAL · ALMACÉN › INGRESO DE PRODUCTO TERMINADO
   -------------------------------------------------------------
   Producción anota las paletas que arma (js/produccion/16-paletas.js · sync/paletas). Aquí Almacén las RECIBE:
     · Recibir            → la anotación entra completa.
     · Con diferencia     → llegó otra cantidad: queda la diferencia con su motivo.
     · En observación     → paleta dañada o retenida: no entra al total recibido (motivo obligatorio).
   Solo se reciben las paletas anotadas DESDE HOY (16/11/2026, fecha de inicio acordada con el dueño): lo anotado antes no entra a la bandeja (INICIO_PT).
   Cada recepción es un documento INMUTABLE en almacenPtRecepcion (id <paletaId>_R<n>); corregir = anular (ANUL_<id>, con motivo) y volver a recibir.
   Las reglas del servidor están en glacial_56. NO toca sync/paletas ni el stock de insumos. El «acumulado recibido» NO es un stock: aún no hay despachos.
   Permiso: «moduloAlmacen» (el Administrador lo tiene). En modo «Visualizar» solo se mira.
   Pantalla: state.currentTab='almacen-pt', botón #btn-almacen-pt (grupo Almacén), goAlmacenPT().
   ============================================================= */
(function(raiz){
  'use strict';
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const ESTADOS={PENDIENTE:['Por recibir','pt-pen'],RECIBIDA:['Recibida','pt-ok'],DIFERENCIA:['Con diferencia','pt-dif'],OBSERVADA:['En observación','pt-obs']};
  const idRecepcion=(paletaId,n)=>String(paletaId)+'_R'+n;
  const idAnulacion=opId=>'ANUL_'+opId;

  /** Primer día que cuenta: las paletas anotadas antes no se reciben en Almacén. */
  const INICIO_PT='2026-11-16';

  /* ---------- lógica pura (se prueba con node) ---------- */
  /** paletas: registros de sync/paletas; recs: documentos de almacenPtRecepcion → una fila por anotación con su estado vigente. */
  function bandeja(paletas,recs,desdeFecha){
    const anuladas=new Set(),porPaleta=new Map();
    (recs||[]).forEach(r=>{if(r&&r.tipo==='ANULACION'&&r.anulaA)anuladas.add(r.anulaA);});
    (recs||[]).forEach(r=>{if(!r||r.tipo!=='RECEPCION'||!r.paletaId)return;if(!porPaleta.has(r.paletaId))porPaleta.set(r.paletaId,[]);porPaleta.get(r.paletaId).push(r);});
    return (paletas||[]).filter(p=>p&&p.id&&num(p.totalUnidades)>0&&(!desdeFecha||String(p.fecha||'')>=desdeFecha)).map(p=>{
      const lista=(porPaleta.get(p.id)||[]).slice().sort((a,b)=>num(a.secuencia)-num(b.secuencia));
      const vigentes=lista.filter(r=>!anuladas.has(r.opId));
      const v=vigentes.length?vigentes[vigentes.length-1]:null;
      return {id:p.id,paleta:p,estado:v?v.estado:'PENDIENTE',recepcion:v,historial:lista,siguiente:(lista.length?num(lista[lista.length-1].secuencia):0)+1,
        anulada:lista.length>0&&!v,cambioPosterior:!!(v&&num(p.actualizadoEn)>num(v.anotadoActualizadoEn||0)),
        ms:num(p.creadoEn)||num(p.actualizadoEn)||0};
    }).sort((a,b)=>b.ms-a.ms);
  }
  /** datos: {tipo:'RECIBIDA'|'DIFERENCIA'|'OBSERVADA', unidadesRecibidas, motivo} → lista de errores (vacía si está bien). */
  function validarRecepcion(item,datos){
    const e=[],anot=num(item&&item.paleta&&item.paleta.totalUnidades),d=datos||{};
    if(!item||item.estado!=='PENDIENTE')return ['Esta anotación ya está recibida: para corregirla, anula la recepción primero.'];
    if(!['RECIBIDA','DIFERENCIA','OBSERVADA'].includes(d.tipo))e.push('Elige cómo se recibe.');
    const motivo=String(d.motivo||'').trim();
    if(d.tipo==='DIFERENCIA'){
      const q=Number(d.unidadesRecibidas);
      if(!Number.isInteger(q)||q<0)e.push('Escribe las unidades que llegaron (número entero, 0 o más).');
      else if(q===anot)e.push('Llegó lo mismo que se anotó: usa «Recibir».');
      if(motivo.length<5)e.push('Escribe el motivo de la diferencia (mínimo 5 caracteres).');
    }
    if(d.tipo==='OBSERVADA'&&motivo.length<5)e.push('Escribe qué le pasó a la paleta (mínimo 5 caracteres).');
    return e;
  }
  /** Documento de la recepción (sin uid ni guardadoEn: los pone la capa de datos). */
  function construirDocumento(item,datos){
    const p=item.paleta,anot=num(p.totalUnidades),tipo=datos.tipo;
    const rec=tipo==='RECIBIDA'?anot:tipo==='DIFERENCIA'?Number(datos.unidadesRecibidas):0;
    const opId=idRecepcion(p.id,item.siguiente);
    return {opId,tipo:'RECEPCION',estado:tipo,paletaId:p.id,secuencia:item.siguiente,linea:p.linea||'',fecha:p.fecha||'',turno:p.turno||'',marca:p.marca||'',presentacion:p.presentacion||'',hora:p.hora||'',
      paletasAnotadas:num(p.paletas),unidadesAnotadas:anot,unidadesRecibidas:rec,diferencia:rec-anot,
      motivo:String(datos.motivo||'').trim().slice(0,300),anotadoActualizadoEn:num(p.actualizadoEn),anotadoPor:String(p.usuario||'')};
  }
  function documentoAnulacion(item,motivo){
    const r=item.recepcion;
    return {opId:idAnulacion(r.opId),tipo:'ANULACION',anulaA:r.opId,paletaId:item.id,motivo:String(motivo||'').trim().slice(0,300)};
  }
  function resumen(items,hoy){
    const r={pendientes:0,unidadesPendientes:0,paletasPendientes:0,recibidas:0,recibidasHoyPaletas:0,recibidasHoyUnidades:0,diferencias:0,faltante:0,observadas:0,pendientesAntiguas:0};
    items.forEach(x=>{
      if(x.estado==='PENDIENTE'){r.pendientes++;r.unidadesPendientes+=num(x.paleta.totalUnidades);r.paletasPendientes+=num(x.paleta.paletas);}
      else if(x.estado==='OBSERVADA')r.observadas++;
      else{r.recibidas++;if(x.estado==='DIFERENCIA'){r.diferencias++;r.faltante+=Math.max(0,-num(x.recepcion.diferencia));}
        if(hoy&&x.paleta.fecha===hoy){r.recibidasHoyPaletas+=num(x.paleta.paletas);r.recibidasHoyUnidades+=num(x.recepcion.unidadesRecibidas);}}
    });
    return r;
  }
  /** Agrupa las anotaciones por línea y producto: total de paletas y unidades de cada grupo (para «Por recibir»). */
  function agrupar(items){
    const m=new Map();
    (items||[]).forEach(x=>{
      const p=x.paleta,k=[p.linea||'',p.marca||'',p.presentacion||''].join('|');
      if(!m.has(k))m.set(k,{clave:k,linea:p.linea||'',marca:p.marca||'',presentacion:p.presentacion||'',items:[],paletas:0,unidades:0,incompletas:0});
      const g=m.get(k);g.items.push(x);g.paletas+=num(p.paletas);g.unidades+=num(p.totalUnidades);if(p.tipoPaleta==='INCOMPLETA')g.incompletas++;
    });
    return [...m.values()].sort((a,b)=>String(a.linea).localeCompare(String(b.linea),'es')||String(a.marca+a.presentacion).localeCompare(String(b.marca+b.presentacion),'es'));
  }
  /** Acumulado recibido por línea y producto (RECIBIDA y DIFERENCIA suman lo que llegó; OBSERVADA no). No es un stock: no hay despachos. */
  function acumulado(items,desdeFecha){
    const m=new Map();
    items.forEach(x=>{
      if(!x.recepcion||!['RECIBIDA','DIFERENCIA'].includes(x.estado))return;
      if(desdeFecha&&String(x.paleta.fecha||'')<desdeFecha)return;
      const k=[x.paleta.linea,x.paleta.marca,x.paleta.presentacion].join('|');
      const o=m.get(k)||{linea:x.paleta.linea||'',marca:x.paleta.marca||'',presentacion:x.paleta.presentacion||'',paletas:0,unidades:0};
      o.paletas+=x.estado==='RECIBIDA'?num(x.paleta.paletas):0;o.unidades+=num(x.recepcion.unidadesRecibidas);m.set(k,o);
    });
    return [...m.values()].sort((a,b)=>b.unidades-a.unidades);
  }
  const NUCLEO={INICIO_PT,agrupar,ESTADOS,idRecepcion,idAnulacion,bandeja,validarRecepcion,construirDocumento,documentoAnulacion,resumen,acumulado};
  if(typeof module!=='undefined'&&module.exports)module.exports=NUCLEO;
  if(typeof window==='undefined'||!window.document)return;

  /* ---------- datos ---------- */
  const W=window;
  function leerUnidad(){try{return localStorage.getItem('glacial.almacen.pt.unidad')==='und'?'und':'paletas';}catch(_){return 'paletas';}}
  const ES={unidad:leerUnidad(),grupo:'',inicio:INICIO_PT,recs:[],listo:false,error:'',tab:'pendientes',dias:7,abierto:'',modo:'',unidades:'',motivo:'',msg:null,guardando:false};
  let cierre=null,activo=false;
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>Number(n||0).toLocaleString('es-PE',{maximumFractionDigits:0});
  const hoyISO=()=>{try{return GlacialFecha.fechaOperativa();}catch(_){return (typeof cpFechaISO==='function')?cpFechaISO():'';}};
  const hace=d=>{try{return GlacialFecha.sumarDias(hoyISO(),-d);}catch(_){return '';}};
  const vistaActiva=()=>!!(W.glacialVista&&typeof W.glacialVista.activo==='function'&&W.glacialVista.activo());
  const puede=()=>{try{return !!(state&&state.user&&tienePermiso('moduloAlmacen'));}catch(_){return false;}};
  const compartida=()=>typeof W.esAlmacenCompartido==='function'&&W.esAlmacenCompartido();
  const persona=()=>{try{return W.glacialAlmaceneros?W.glacialAlmaceneros.activa():null;}catch(_){return null;}};     // el almacenero identificado con su PIN (solo la cuenta compartida)
  const puedeEscribir=()=>puede()&&!vistaActiva()&&(!compartida()||!!persona());
  const paletas=()=>{try{return typeof loadPaletas==='function'?(loadPaletas()||[]):[];}catch(_){return [];}};
  const serverTs=()=>firebase.firestore.FieldValue.serverTimestamp();
  const msgError=e=>{const c=String((e&&e.code)||'').replace(/^firestore\//,'');return c==='permission-denied'?'No tienes permiso para registrar en Almacén (falta aplicar glacial_56 o tu usuario no tiene el permiso).':((e&&e.message)||String(e));};
  function escuchar(){
    if(activo||typeof db==='undefined')return;
    activo=true;ES.listo=false;ES.error='';
    cierre=db.collection('almacenPtRecepcion').onSnapshot(s=>{ES.recs=s.docs.map(d=>d.data()).filter(x=>x&&x.opId);ES.listo=true;ES.error='';pintar();},
      e=>{ES.error=msgError(e);ES.listo=true;pintar();});
  }
  function detener(){activo=false;if(cierre){try{cierre();}catch(_){/* ya cerrada */}cierre=null;}}
  if(W.glacialCierresSesion)W.glacialCierresSesion.push(()=>{detener();ES.recs=[];ES.listo=false;ES.abierto='';});
  const items=()=>bandeja(paletas(),ES.recs,ES.inicio);
  const quien=()=>{const u=(typeof state!=='undefined'&&state.user)||{};return {uid:(function(){try{return firebase.auth().currentUser.uid;}catch(_){return '';}})(),usuario:u.nombre||u.username||'Usuario',username:u.username||''};};

  async function guardar(doc){
    const q=quien();
    const p=persona();
    await db.collection('almacenPtRecepcion').doc(doc.opId).set({...doc,uid:q.uid,usuario:q.usuario,usuarioUsername:q.username,almacenero:p?{id:p.id,nombre:p.nombre}:null,guardadoEn:serverTs()});
  }
  async function recibir(item,datos){
    if(!puedeEscribir()||ES.guardando)return;
    const e=validarRecepcion(item,datos);if(e.length){ES.msg={tipo:'error',texto:e.join(' ')};pintar();return;}
    ES.guardando=true;ES.msg=null;pintar();
    try{
      await guardar(construirDocumento(item,datos));
      ES.msg={tipo:'ok',texto:datos.tipo==='RECIBIDA'?'Recibida.':datos.tipo==='DIFERENCIA'?'Recibida con diferencia.':'Paleta puesta en observación.'};ES.abierto='';ES.modo='';ES.unidades='';ES.motivo='';
    }catch(err){ES.msg={tipo:'error',texto:'No se pudo guardar: '+msgError(err)};}
    ES.guardando=false;pintar();
  }
  async function anular(item,motivo){
    if(!puedeEscribir()||ES.guardando)return;
    if(String(motivo||'').trim().length<5){ES.msg={tipo:'error',texto:'Escribe el motivo de la anulación (mínimo 5 caracteres).'};pintar();return;}
    ES.guardando=true;ES.msg=null;pintar();
    try{await guardar(documentoAnulacion(item,motivo));ES.msg={tipo:'ok',texto:'Recepción anulada: la paleta vuelve a «Por recibir».'};ES.abierto='';ES.modo='';ES.motivo='';}
    catch(err){ES.msg={tipo:'error',texto:'No se pudo anular: '+msgError(err)};}
    ES.guardando=false;pintar();
  }

  /* ---------- pantalla ---------- */
  const pill=(est)=>{const p=ESTADOS[est]||ESTADOS.PENDIENTE;return `<span class="pt-pill ${p[1]}">${esc(p[0])}</span>`;};
  const hora=ms=>{try{return new Date(ms).toLocaleTimeString('es-PE',{timeZone:'America/Lima',hour:'2-digit',minute:'2-digit',hour12:false});}catch(_){return '';}};
  const hace_=ms=>{if(!ms)return '';const m=Math.max(0,Math.round((Date.now()-ms)/60000));return m<60?`hace ${m} min`:m<1440?`hace ${Math.floor(m/60)} h`:`hace ${Math.floor(m/1440)} d`;};
  const nombreLinea=k=>{try{return cpNombreLinea?cpNombreLinea(k):k;}catch(_){return k||'';}};
  function estilos(){return `<style>
.pt{color:#033350;font-size:15px;display:grid;gap:14px}.pt *{box-sizing:border-box}
.pt-cab h1{margin:0;font-size:32px;font-weight:800;letter-spacing:-.01em}.pt-sub{margin:2px 0 0;color:#587087;font-size:14px}
.pt-tabs{display:flex;gap:6px;border-bottom:1px solid #d9e7f1;overflow-x:auto}.pt-tab{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border:0;background:none;color:#587087;font:inherit;font-weight:700;cursor:pointer;border-bottom:3px solid transparent;white-space:nowrap}
.pt-tab[aria-selected="true"]{color:#0877a6;border-bottom-color:#0877a6}.pt-tab:focus-visible,.pt-b:focus-visible{outline:3px solid #0ea5e9;outline-offset:-3px}
.pt-ks{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.pt-k{background:#fff;border:1px solid #d9e7f1;border-radius:14px;padding:12px 14px}.pt-k span{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#587087}
.pt-k b{display:block;font-size:28px;line-height:1.15;margin:4px 0 2px;color:#0b2a4a}.pt-k small{color:#587087;font-size:12px}.pt-k-am b{color:#b45309}.pt-k-ro b{color:#c62828}.pt-k-vd b{color:#157a3b}
.pt-card{background:#fff;border:1px solid #d9e7f1;border-radius:14px;padding:14px 16px;overflow-x:auto}.pt-card h3{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:#3c5a75}
.pt-t{width:100%;border-collapse:collapse}.pt-t th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#587087;background:#f4f9fd;text-align:left;padding:9px 10px}.pt-t td{padding:10px;border-top:1px solid #eaf1f7;vertical-align:top}.pt-t td small{display:block;color:#587087;font-size:12px}
.pt-n{text-align:right;font-variant-numeric:tabular-nums}.pt-n b{display:block}
.pt-grp{border:1px solid #d9e7f1;border-radius:12px;margin:0 0 12px;padding:10px 12px;background:#fcfdff;display:grid;gap:8px}.pt-grp-c{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.pt-grp-c b{font-size:16px}.pt-grp-c small{display:block;color:#587087;font-size:12px}.pt-grp-t{text-align:right}.pt-grp-t b{display:block;font-size:20px;color:#b45309}.pt-grp-t small{font-size:12px}
.pt-pill{display:inline-block;font-size:11px;font-weight:800;border-radius:999px;padding:3px 10px;white-space:nowrap}.pt-pen{background:#ffedd5;color:#b45309}.pt-ok{background:#dff5e7;color:#157a3b}.pt-dif{background:#fde8e8;color:#c62828}.pt-obs{background:#e8e4fb;color:#5b3fb5}
.pt-ac{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.pt-b{min-height:44px;padding:0 14px;border-radius:10px;border:1px solid #9fd0e6;background:#fff;color:#0877a6;font:inherit;font-weight:700;cursor:pointer}.pt-b:disabled{opacity:.55;cursor:not-allowed}
.pt-b-v{background:#0877a6;color:#fff;border-color:#0877a6}.pt-b-r{border-color:#f0b4b4;color:#c62828}.pt-b-o{border-color:#cbbff0;color:#5b3fb5}
.pt-f{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;background:#fff;border:1px solid #d9e7f1;border-radius:14px;padding:12px 14px}.pt-f label,.pt-form label{display:grid;gap:4px;font-size:11.5px;font-weight:700;color:#587087;text-transform:uppercase;letter-spacing:.05em}
.pt-f select,.pt-form input,.pt-form textarea{font:inherit;font-size:15px;font-weight:500;text-transform:none;letter-spacing:0;padding:8px 10px;border:1px solid #cddfec;border-radius:10px;min-height:44px;background:#fff;color:#14263a}
.pt-det td{background:#f8fbfe}.pt-form{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}.pt-form textarea{min-width:260px}
.pt-msg{border-radius:12px;padding:10px 14px}.pt-msg-e{background:#fdecec;color:#991b1b;border:1px solid #f5b5b5}.pt-msg-k{background:#e7f6ec;color:#15803d;border:1px solid #b7e4c7}.pt-msg-i{background:#eaf5fc;color:#0b4a6b;border:1px solid #bfdcec}
.pt-vacio{background:#fafcfe;border:1px dashed #c3d8e8;border-radius:12px;padding:22px;text-align:center;color:#587087}.pt-mut{color:#587087;font-size:12.5px}.pt-av{color:#b45309;font-size:12px;font-weight:700}
@media(max-width:700px){.pt-t thead{display:none}.pt-t tr{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:10px 0;border-top:1px solid #eaf1f7}.pt-t td{display:block;border:0;padding:2px 4px}.pt-t td[data-l]::before{content:attr(data-l);display:block;font-size:11px;font-weight:700;color:#587087;text-transform:uppercase}.pt-det{display:block}.pt-det td{display:block}}
</style>`;}
  /** Cantidad con la unidad elegida arriba (por defecto PALETAS, que es lo que Almacén cuenta); la otra va en chico. */
  function cant(pal,und){
    const a=`${fmt(pal)} ${num(pal)===1?'paleta':'paletas'}`,b=`${fmt(und)} UND`;
    return ES.unidad==='und'?`<b>${b}</b><small>${a}</small>`:`<b>${a}</b><small>${b}</small>`;
  }
  function filaItem(x){
    const p=x.paleta,ab=ES.abierto===x.id,r=x.recepcion;
    const acciones=x.estado==='PENDIENTE'?(puedeEscribir()?`<div class="pt-ac"><button type="button" class="pt-b pt-b-v" onclick="ptAccion('${esc(x.id)}','RECIBIDA')" ${ES.guardando?'disabled':''}>Recibir</button><button type="button" class="pt-b pt-b-r" onclick="ptAccion('${esc(x.id)}','DIFERENCIA')">Con diferencia</button><button type="button" class="pt-b pt-b-o" onclick="ptAccion('${esc(x.id)}','OBSERVADA')">Dañada</button></div>`:'<span class="pt-mut">Solo consulta</span>')
      :(puedeEscribir()?`<div class="pt-ac"><button type="button" class="pt-b" onclick="ptAccion('${esc(x.id)}','ANULAR')">Anular recepción</button></div>`:'');
    const det=r?`<small>${esc((r.almacenero&&r.almacenero.nombre)||r.usuario||'')} · ${esc(hora(r.guardadoEn&&r.guardadoEn.toMillis?r.guardadoEn.toMillis():num(r.guardadoEn)))}${r.estado==='DIFERENCIA'?` · llegaron ${fmt(r.unidadesRecibidas)} (${r.diferencia>0?'+':''}${fmt(r.diferencia)})`:''}${r.motivo?` · «${esc(r.motivo)}»`:''}</small>`:'';
    const form=ab?`<tr class="pt-det"><td colspan="6">${formulario(x)}</td></tr>`:'';
    return `<tr><td data-l="Anotada">${esc(hora(x.ms))}<small>${esc(p.fecha||'')} · ${esc(hace_(x.ms))}</small></td><td data-l="Línea"><b>${esc(nombreLinea(p.linea))}</b></td><td data-l="Producto">${esc(p.marca||'')} ${esc(p.presentacion||'')}<small>${esc(p.turno||'')}${p.usuario?' · '+esc(p.usuario):''}${p.tipoPaleta==='INCOMPLETA'?' · incompleta':''}</small></td>
      <td data-l="Cantidad" class="pt-n">${cant(p.paletas,p.totalUnidades)}</td><td data-l="Estado">${pill(x.estado)}${x.cambioPosterior?'<small class="pt-av">Producción cambió la anotación después de recibirla: revísala</small>':''}${det}</td><td>${acciones}</td></tr>${form}`;
  }
  const CABECERA='<thead><tr><th>Anotada</th><th>Línea</th><th>Producto</th><th class="pt-n">Cantidad</th><th>Estado</th><th></th></tr></thead>';
  /** «Por recibir»: un bloque por línea y producto, con el total de paletas y «Recibir todo» (cada anotación se guarda como su propia recepción). */
  function tablaPendientes(lista){
    if(!lista.length)return '<div class="pt-vacio">No hay paletas por recibir en este período. Cuando Producción anote una paleta, aparecerá aquí.</div>';
    const grupos=agrupar(lista.slice(0,300));
    return grupos.map(g=>{
      const abierto=ES.grupo===g.clave,n=g.items.length;
      const accion=puedeEscribir()&&n>1?(abierto?`<div class="pt-form"><span>¿Confirmas que llegaron las <b>${fmt(g.paletas)} paletas</b> (${fmt(g.unidades)} UND) de ${n} anotaciones?</span><button type="button" class="pt-b pt-b-v" onclick="ptGrupoConfirmar()" ${ES.guardando?'disabled':''}>${ES.guardando?'Guardando…':'Sí, recibir todo'}</button><button type="button" class="pt-b" onclick="ptGrupo('')">Cancelar</button></div>`
        :`<button type="button" class="pt-b pt-b-v" onclick="ptGrupo(this.dataset.k)" data-k="${esc(g.clave)}">Recibir todo (${fmt(g.paletas)} ${g.paletas===1?'paleta':'paletas'})</button>`):'';
      return `<div class="pt-grp"><div class="pt-grp-c"><div><b>${esc(nombreLinea(g.linea))} · ${esc(g.marca)} ${esc(g.presentacion)}</b><small>${n} ${n===1?'anotación':'anotaciones'}${g.incompletas?' · '+g.incompletas+' incompleta'+(g.incompletas===1?'':'s'):''}</small></div><div class="pt-grp-t">${cant(g.paletas,g.unidades)}</div></div>${accion}
        <table class="pt-t">${CABECERA}<tbody>${g.items.map(filaItem).join('')}</tbody></table></div>`;
    }).join('')+(lista.length>300?`<p class="pt-mut">Se muestran las 300 más recientes de ${fmt(lista.length)}. Acota el período para ver las demás.</p>`:'');
  }
  function tabla(lista,modo){
    if(modo==='pendientes')return tablaPendientes(lista);
    if(!lista.length)return `<div class="pt-vacio">${modo==='pendientes'?'No hay paletas por recibir en este período. Cuando Producción anote una paleta, aparecerá aquí.':'Todavía no hay nada en esta lista.'}</div>`;
    return `<table class="pt-t">${CABECERA}<tbody>${lista.slice(0,300).map(filaItem).join('')}</tbody></table>${lista.length>300?`<p class="pt-mut">Se muestran las 300 más recientes de ${fmt(lista.length)}. Acota el período para ver las demás.</p>`:''}`;
  }
  function formulario(x){
    const m=ES.modo;
    if(m==='RECIBIDA')return `<div class="pt-form"><span>¿Confirmas que llegó todo lo anotado (<b>${fmt(x.paleta.totalUnidades)} UND</b>)?</span><button type="button" class="pt-b pt-b-v" onclick="ptConfirmar('${esc(x.id)}')" ${ES.guardando?'disabled':''}>Sí, recibir</button><button type="button" class="pt-b" onclick="ptCerrar()">Cancelar</button></div>`;
    if(m==='DIFERENCIA')return `<div class="pt-form"><label>Unidades que llegaron<input type="number" min="0" step="1" inputmode="numeric" value="${esc(ES.unidades)}" oninput="ptCampo('unidades',this.value)" aria-label="Unidades que llegaron"></label>
      <label>Motivo de la diferencia<textarea rows="2" maxlength="300" oninput="ptCampo('motivo',this.value)">${esc(ES.motivo)}</textarea></label><span class="pt-mut">Se anotaron ${fmt(x.paleta.totalUnidades)} UND.</span>
      <button type="button" class="pt-b pt-b-r" onclick="ptConfirmar('${esc(x.id)}')" ${ES.guardando?'disabled':''}>Guardar diferencia</button><button type="button" class="pt-b" onclick="ptCerrar()">Cancelar</button></div>`;
    if(m==='OBSERVADA')return `<div class="pt-form"><label>¿Qué le pasó a la paleta?<textarea rows="2" maxlength="300" oninput="ptCampo('motivo',this.value)">${esc(ES.motivo)}</textarea></label><span class="pt-mut">No entra al total recibido hasta que se resuelva (anula y vuelve a recibir).</span>
      <button type="button" class="pt-b pt-b-o" onclick="ptConfirmar('${esc(x.id)}')" ${ES.guardando?'disabled':''}>Poner en observación</button><button type="button" class="pt-b" onclick="ptCerrar()">Cancelar</button></div>`;
    if(m==='ANULAR')return `<div class="pt-form"><label>Motivo de la anulación<textarea rows="2" maxlength="300" oninput="ptCampo('motivo',this.value)">${esc(ES.motivo)}</textarea></label><span class="pt-mut">La paleta vuelve a «Por recibir». La recepción anterior queda en el historial.</span>
      <button type="button" class="pt-b pt-b-r" onclick="ptConfirmar('${esc(x.id)}')" ${ES.guardando?'disabled':''}>Anular recepción</button><button type="button" class="pt-b" onclick="ptCerrar()">Cancelar</button></div>`;
    return '';
  }
  function cuerpo(todas){
    const desde=ES.dias?hace(ES.dias):'';
    const enPeriodo=x=>!desde||String(x.paleta.fecha||'')>=desde;
    if(ES.tab==='almaceneros'&&!compartida()&&W.glacialAlmaceneros)return W.glacialAlmaceneros.htmlAdmin();
    if(ES.tab==='recibidas')return `<div class="pt-card"><h3>Recibidas</h3>${tabla(todas.filter(x=>['RECIBIDA','DIFERENCIA'].includes(x.estado)&&enPeriodo(x)),'recibidas')}</div>`;
    if(ES.tab==='diferencias')return `<div class="pt-card"><h3>Con diferencia y en observación</h3>${tabla(todas.filter(x=>['DIFERENCIA','OBSERVADA'].includes(x.estado)&&enPeriodo(x)),'diferencias')}</div>`;
    if(ES.tab==='acumulado'){
      const a=acumulado(todas,desde);
      return `<div class="pt-card"><h3>Acumulado recibido por producto</h3>${a.length?`<table class="pt-t"><thead><tr><th>Línea</th><th>Producto</th><th class="pt-n">Paletas completas</th><th class="pt-n">Unidades recibidas</th></tr></thead><tbody>${a.map(o=>`<tr><td data-l="Línea"><b>${esc(nombreLinea(o.linea))}</b></td><td data-l="Producto">${esc(o.marca)} ${esc(o.presentacion)}</td><td data-l="Paletas" class="pt-n">${fmt(o.paletas)}</td><td data-l="Unidades" class="pt-n">${fmt(o.unidades)}</td></tr>`).join('')}</tbody></table>`:'<div class="pt-vacio">Todavía no hay recepciones en este período.</div>'}
        <p class="pt-mut">Es lo que Almacén recibió, no un stock: todavía no se registran los despachos.</p></div>`;
    }
    return `<div class="pt-card"><h3>Por recibir</h3>${tabla(todas.filter(x=>x.estado==='PENDIENTE'&&enPeriodo(x)),'pendientes')}</div>`;
  }
  function html(){
    const todas=items(),r=resumen(todas,hoyISO()),desde=ES.dias?hace(ES.dias):'';
    const antiguas=desde?todas.filter(x=>x.estado==='PENDIENTE'&&String(x.paleta.fecha||'')<desde).length:0;
    const k=(t,v,s,c)=>`<div class="pt-k ${c||''}"><span>${esc(t)}</span><b>${v}</b><small>${esc(s)}</small></div>`;
    const tab=(id,t)=>`<button type="button" role="tab" class="pt-tab" aria-selected="${ES.tab===id}" onclick="ptTab('${id}')">${esc(t)}</button>`;
    const op=(v,t)=>`<option value="${v}" ${String(ES.dias)===String(v)?'selected':''}>${t}</option>`;
    return `<section class="pt">${estilos()}<header class="pt-cab"><h1>ALMACÉN · Producto terminado</h1><p class="pt-sub">Las paletas que Producción anota llegan aquí para que Almacén las reciba (desde el 16/11/2026).${puedeEscribir()?'':' <b>Solo consulta.</b>'}</p></header>
      ${ES.error?`<div class="pt-msg pt-msg-e" role="alert">${esc(ES.error)}</div>`:''}${ES.msg?`<div class="pt-msg ${ES.msg.tipo==='error'?'pt-msg-e':'pt-msg-k'}" role="status">${esc(ES.msg.texto)}</div>`:''}
      ${compartida()&&!persona()?'<div class="pt-msg pt-msg-e" role="alert">Identifícate con tu PIN para recibir paletas.</div>':''}
      ${antiguas?`<div class="pt-msg pt-msg-i" role="note">Hay <b>${fmt(antiguas)}</b> paletas anotadas antes de este período que siguen por recibir. <button type="button" class="pt-b" onclick="ptDias(0)">Ver todas</button></div>`:''}
      <div class="pt-ks">${k('Por recibir',ES.unidad==='und'?fmt(r.unidadesPendientes)+' UND':fmt(r.paletasPendientes)+(r.paletasPendientes===1?' paleta':' paletas'),(ES.unidad==='und'?fmt(r.paletasPendientes)+' paletas':fmt(r.unidadesPendientes)+' UND')+' · '+fmt(r.pendientes)+(r.pendientes===1?' anotación':' anotaciones'),'pt-k-am')}${k('Recibidas hoy',ES.unidad==='und'?fmt(r.recibidasHoyUnidades)+' UND':fmt(r.recibidasHoyPaletas)+(r.recibidasHoyPaletas===1?' paleta':' paletas'),ES.unidad==='und'?fmt(r.recibidasHoyPaletas)+' paletas':fmt(r.recibidasHoyUnidades)+' UND','pt-k-vd')}${k('Con diferencia',fmt(r.diferencias),r.faltante?'faltan '+fmt(r.faltante)+' UND':'sin faltantes',r.diferencias?'pt-k-ro':'')}${k('En observación',fmt(r.observadas),'paletas retenidas')}</div>
      <nav class="pt-tabs" role="tablist" aria-label="Producto terminado">${tab('pendientes','Por recibir · '+fmt(r.pendientes))}${tab('recibidas','Recibidas')}${tab('diferencias','Diferencias y observadas')}${tab('acumulado','Acumulado recibido')}${!compartida()&&puedeEscribir()?tab('almaceneros','Almaceneros'):''}</nav>
      <div class="pt-f"><label>Mostrar en<select onchange="ptUnidad(this.value)"><option value="paletas" ${ES.unidad==='paletas'?'selected':''}>Paletas</option><option value="und" ${ES.unidad==='und'?'selected':''}>Unidades</option></select></label><label>Período<select onchange="ptDias(Number(this.value))">${op(1,'Hoy')}${op(3,'Últimos 3 días')}${op(7,'Últimos 7 días')}${op(30,'Últimos 30 días')}${op(0,'Todo')}</select></label>${ES.listo?'':'<span class="pt-mut">Consultando…</span>'}</div>
      ${cuerpo(todas)}</section>`;
  }
  function pintar(){
    if(typeof state==='undefined'||state.currentTab!=='almacen-pt')return;
    if(bloqueado())return;
    const main=document.getElementById('main');if(!main)return;
    const y=window.scrollY;main.innerHTML=html();window.scrollTo(0,y);
  }
  const bloqueado=()=>!!document.querySelector('.pt-form input:focus,.pt-form textarea:focus');
  W.ptTab=t=>{ES.tab=t;ES.abierto='';ES.modo='';ES.msg=null;pintar();};
  W.ptUnidad=u=>{ES.unidad=u==='und'?'und':'paletas';try{localStorage.setItem('glacial.almacen.pt.unidad',ES.unidad);}catch(_){/* sin almacenamiento */}pintar();};
  W.ptGrupo=k=>{ES.grupo=k||'';ES.abierto='';ES.modo='';ES.msg=null;pintar();};
  W.ptGrupoConfirmar=async()=>{
    if(!puedeEscribir()||ES.guardando||!ES.grupo)return;
    const g=agrupar(items().filter(x=>x.estado==='PENDIENTE')).find(x=>x.clave===ES.grupo);if(!g){ES.grupo='';pintar();return;}
    ES.guardando=true;ES.msg=null;pintar();
    let hechas=0,fallo='';
    for(const it of g.items){
      const d={tipo:'RECIBIDA',unidadesRecibidas:NaN,motivo:''};
      const e=validarRecepcion(it,d);if(e.length){fallo=e.join(' ');break;}
      try{await guardar(construirDocumento(it,d));hechas++;}catch(err){fallo=msgError(err);break;}
    }
    ES.guardando=false;ES.grupo=fallo?ES.grupo:'';
    ES.msg=fallo?{tipo:'error',texto:'Se recibieron '+hechas+' de '+g.items.length+' anotaciones y se detuvo: '+fallo}:{tipo:'ok',texto:'Recibidas '+fmt(g.paletas)+' paletas ('+g.items.length+' anotaciones) de '+(nombreLinea(g.linea)+' · '+g.marca+' '+g.presentacion).trim()+'.'};
    pintar();
  };
  W.ptDias=d=>{ES.dias=d;ES.abierto='';pintar();};
  W.ptAccion=(id,modo)=>{ES.abierto=id;ES.modo=modo;ES.unidades='';ES.motivo='';ES.msg=null;pintar();};
  W.ptCerrar=()=>{ES.abierto='';ES.modo='';pintar();};
  W.ptCampo=(k,v)=>{ES[k]=v;};
  W.ptConfirmar=id=>{
    const it=items().find(x=>x.id===id);if(!it)return;
    if(ES.modo==='ANULAR')return anular(it,ES.motivo);
    return recibir(it,{tipo:ES.modo,unidadesRecibidas:ES.unidades===''?NaN:Number(ES.unidades),motivo:ES.motivo});
  };

  /* ---------- navegación (mismo patrón que Calidad e Inventario de insumos) ---------- */
  const TAB='almacen-pt';
  W.goAlmacenPT=function(){
    if(!puede()){alert('No tienes permiso para ver el ingreso de producto terminado.');return;}
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    state.currentTab=TAB;ES.msg=null;
    if(typeof renderSidebar==='function')renderSidebar();
    if(typeof renderMain==='function')renderMain();
  };
  if(typeof ajustarVistaSegunPermisos==='function'){const a=ajustarVistaSegunPermisos;ajustarVistaSegunPermisos=function(){if(state.currentTab===TAB&&puede())return;return a.apply(this,arguments);};}
  if(typeof renderMain==='function'){
    const a=renderMain;
    renderMain=function(){
      if(state.currentTab===TAB&&!state.showWelcome&&puede()){escuchar();const main=document.getElementById('main');if(main){const y=window.scrollY;main.innerHTML=html();window.scrollTo(0,y);}return;}
      if(state.currentTab!==TAB)detener();
      return a.apply(this,arguments);
    };
  }
  if(typeof renderSidebar==='function'){
    const a=renderSidebar;
    renderSidebar=function(){
      const r=a.apply(this,arguments);
      const b=document.getElementById('btn-almacen-pt');
      if(b){const m=puede();b.hidden=!m;b.style.display=m?'':'none';b.classList.toggle('active',m&&state.currentTab===TAB);if(m&&state.currentTab===TAB)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
      if(typeof actualizarGruposSidebar==='function')actualizarGruposSidebar();
      return r;
    };
  }
  // Producción anota paletas en tiempo real: la bandeja se actualiza sola (sin pisar lo que se escribe).
  ['onPaletasUpdated'].forEach(n=>{const a=W[n];if(typeof a!=='function')return;W[n]=function(){const r=a.apply(this,arguments);try{pintar();}catch(_){/* informativo */}return r;};});
  W.glacialAlmacenPT={html,estado:ES,detener,repintar:()=>{try{pintar();}catch(_){/* informativo */}}};
})(typeof window!=='undefined'?window:globalThis);
