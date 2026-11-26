/* =============================================================
   GLACIAL · CALIDAD › VALIDACIÓN DE LOTES
   -------------------------------------------------------------
   Muestra lo que valida el bot de WhatsApp (glacial-whatsapp): una fila por validación con su resultado (OK, OBSERVADO o RECHAZADO), el lote, el vencimiento, el
   turno, la marca, la línea, la FOTO del rótulo, los controles revisados y quién la revisó. Lo deja la función validaciones-lotes-ingesta en
   public.validaciones_lotes (glacial_54; la foto: glacial_64). Es el rótulo del PRODUCTO TERMINADO; las etiquetas de proveedores siguen en Asistente › Evidencias.
   · Solo lectura desde la página, salvo «Marcar como revisada» (quien tiene «calidadRevisar»). NO toca stock, lotes ni evidencias.
   · Permisos propios de Calidad (98-calidad-permisos.js, glacial_55): ver = «calidadVer», revisar = «calidadRevisar». El servidor los exige igual.
   · Se actualiza sola cada minuto mientras la pestaña está a la vista, y con «Actualizar».
   · 26/11/2026: calendario del mes (el día elegido muestra lo validado ese día; por defecto, hoy) y lista separada por LÍNEA, cada una con su resumen.
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
  /* 26/11/2026: calendario y separación por línea. El día es el de Lima (la planta), no el UTC. */
  const pad=n=>String(n).padStart(2,'0');
  function diaLima(ms){
    if(!ms)return '';
    try{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms));
      const g=t=>(p.find(x=>x.type===t)||{}).value;return g('year')+'-'+g('month')+'-'+g('day');}
    catch(_){const d=new Date(ms-5*3600000);return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());}
  }
  /** Solo las del día (AAAA-MM-DD) o, sin día, las del mes (AAAA-MM). */
  const delPeriodo=(lista,f)=>lista.filter(x=>{const d=diaLima(x.ms);return f&&f.dia?d===f.dia:f&&f.mes?d.slice(0,7)===f.mes:true;});
  /** Nombre de la línea tal como la manda el bot («envasadora», «PET1»…); sin línea al final. */
  const nombreLinea=l=>{const t=String(l||'').trim();if(!t)return 'Sin línea';return /^[a-z]/.test(t)?t.charAt(0).toUpperCase()+t.slice(1):t;};
  function porLinea(lista){
    const m=new Map();
    lista.forEach(x=>{const k=String(x.linea||'').trim().toLowerCase();if(!m.has(k))m.set(k,{linea:x.linea||'',nombre:nombreLinea(x.linea),lista:[]});m.get(k).lista.push(x);});
    return [...m.values()].sort((a,b)=>(a.linea?0:1)-(b.linea?0:1)||a.nombre.localeCompare(b.nombre,'es',{numeric:true}));
  }
  /** Calendario de un mes: semanas (lunes a domingo) con el conteo de validaciones y el peor resultado de cada día. */
  function calendario(mes,lista){
    const [y,m]=String(mes).split('-').map(Number);
    const dias=new Date(y,m,0).getDate(),primero=(new Date(y,m-1,1).getDay()+6)%7;
    const cont={};lista.forEach(x=>{const d=diaLima(x.ms);if(d.slice(0,7)!==mes)return;const c=cont[d]||(cont[d]={total:0,OK:0,OBSERVADO:0,RECHAZADO:0});c.total++;c[x.resultado]++;});
    const celdas=[];for(let i=0;i<primero;i++)celdas.push(null);
    for(let d=1;d<=dias;d++){const f=mes+'-'+pad(d),c=cont[f]||{total:0,OK:0,OBSERVADO:0,RECHAZADO:0};celdas.push(Object.assign({fecha:f,dia:d,peor:c.RECHAZADO?'RECHAZADO':c.OBSERVADO?'OBSERVADO':c.total?'OK':''},c));}
    while(celdas.length%7)celdas.push(null);
    const semanas=[];for(let i=0;i<celdas.length;i+=7)semanas.push(celdas.slice(i,i+7));
    return semanas;
  }
  const mesMas=(mes,n)=>{const [y,m]=mes.split('-').map(Number);const d=new Date(y,m-1+n,1);return d.getFullYear()+'-'+pad(d.getMonth()+1);};
  const NUCLEO={RESULTADOS,CONTROL,normalizar,pideRevision,resumen,filtrar,refFoto,diaLima,delPeriodo,porLinea,calendario,mesMas,nombreLinea};
  if(typeof module!=='undefined'&&module.exports)module.exports=NUCLEO;
  if(typeof window==='undefined'||!window.document)return;

  /* ---------- datos ---------- */
  const W=window;
  const hoyLima=()=>diaLima(Date.now());
  const ES={lista:[],listo:false,error:'',cargando:false,mes:hoyLima().slice(0,7),dia:hoyLima(),cargadoDesde:'',resultado:'',revision:'',texto:'',abierta:'',nota:'',guardando:false,aviso:'',disponible:true};
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
      const desde=new Date(ES.mes+'-01T05:00:00Z').toISOString();      // desde el 1.º del mes del calendario, a la medianoche de Lima
      const r=await c.rpc('validaciones_lotes_listar',{p_desde:desde,p_limite:1000});
      ES.cargadoDesde=ES.mes;
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
  const MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const DSEM=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const fechaLarga=f=>{const [y,m,d]=f.split('-').map(Number);return DSEM[new Date(y,m-1,d).getDay()]+' '+d+' de '+MESES[m-1]+' de '+y;};
  function htmlCalendario(){
    const sem=calendario(ES.mes,ES.lista),[y,m]=ES.mes.split('-').map(Number),hoy=hoyLima();
    const cel=c=>{if(!c)return '<td></td>';
      const sel=ES.dia===c.fecha,cls=['vl-cal-d',sel?'sel':'',c.fecha===hoy?'hoy':'',c.total?'con':''].filter(Boolean).join(' ');
      return `<td><button type="button" class="${cls}" onclick="vlDia('${c.fecha}')" aria-pressed="${sel}" aria-label="${esc(fechaLarga(c.fecha))}: ${c.total} validación${c.total===1?'':'es'}">
        <span>${c.dia}</span>${c.total?`<b class="vl-cal-n vl-cal-${c.peor==='RECHAZADO'?'mal':c.peor==='OBSERVADO'?'obs':'ok'}">${c.total}</b>`:''}</button></td>`;};
    return `<div class="vl-cal"><div class="vl-cal-cab"><button type="button" class="vl-btn vl-btn-s" onclick="vlMes(-1)" aria-label="Mes anterior">◀</button>
      <b>${MESES[m-1].charAt(0).toUpperCase()+MESES[m-1].slice(1)} ${y}</b><button type="button" class="vl-btn vl-btn-s" onclick="vlMes(1)" aria-label="Mes siguiente" ${ES.mes>=hoy.slice(0,7)?'disabled':''}>▶</button></div>
      <table class="vl-cal-t"><thead><tr>${['Lu','Ma','Mi','Ju','Vi','Sá','Do'].map(d=>`<th>${d}</th>`).join('')}</tr></thead><tbody>${sem.map(w=>`<tr>${w.map(cel).join('')}</tr>`).join('')}</tbody></table>
      <div class="vl-cal-pie"><button type="button" class="vl-btn vl-btn-s" onclick="vlDia('${hoy}')">Hoy</button><button type="button" class="vl-btn vl-btn-s ${ES.dia?'':'vl-act'}" onclick="vlDia('')">Todo el mes</button></div>
      <div class="vl-cal-ley"><span><i class="vl-cal-ok"></i>validadas</span><span><i class="vl-cal-obs"></i>con observación</span><span><i class="vl-cal-mal"></i>rechazada</span></div></div>`;
  }
  function filtros(){
    const op=(v,t,sel)=>`<option value="${v}" ${sel===v?'selected':''}>${t}</option>`;
    return `<div class="vl-filtros">
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
    return `<tr class="vl-det"><td colspan="7"><div class="vl-det-g">${foto?`<div class="vl-det-foto">${foto}</div>`:''}<div class="vl-det-datos">${datosRotulo(x)}${x.motivo?`<p class="vl-motivo"><b>Motivo:</b> ${esc(x.motivo)}</p>`:''}${ctl}${x.evidencia?`<p class="vl-mut">Evidencia: ${esc(x.evidencia.slice(0,12))}… (ver en Evidencias)</p>`:''}${rev}</div></div></td></tr>`;
  }
  /* Un bloque por línea, cada uno con su resumen y su tabla. */
  function porLineas(lista){
    if(!lista.length)return `<div class="vl-vacio">${ES.dia?'No hay validaciones el '+esc(fechaLarga(ES.dia))+(ES.resultado||ES.revision||ES.texto?' con este filtro':'')+'.':'Ninguna validación en este mes'+(ES.resultado||ES.revision||ES.texto?' con este filtro':'')+'.'} Elige otro día en el calendario.</div>`;
    return porLinea(lista).map(g=>{const r=resumen(g.lista);
      return `<section class="vl-linea"><div class="vl-linea-cab"><h3>${esc(g.nombre)}</h3><span class="vl-mut">${r.total} validación${r.total===1?'':'es'} · ${r.lotes} lote${r.lotes===1?'':'s'}</span>
        <span class="vl-linea-p">${r.OK?pill(r.OK+' validada'+(r.OK===1?'':'s'),'vl-ok'):''}${r.OBSERVADO?pill(r.OBSERVADO+' con observación','vl-obs'):''}${r.RECHAZADO?pill(r.RECHAZADO+' rechazada'+(r.RECHAZADO===1?'':'s'),'vl-mal'):''}${r.pendientes?pill(r.pendientes+' por revisar','vl-obs'):''}</span></div>${tabla(g.lista)}</section>`;}).join('');
  }
  function tabla(lista){
    if(!lista.length)return `<div class="vl-vacio">Ninguna validación coincide con el filtro.</div>`;
    return `<div class="vl-tw"><table class="vl-t"><thead><tr><th>Foto</th><th>Fecha</th><th>Lote</th><th>Producto</th><th>Vence</th><th>Resultado</th><th>Revisión</th></tr></thead><tbody>${lista.map(x=>{
      const ab=ES.abierta===x.clave,r=RESULTADOS[x.resultado];
      return `<tr class="vl-fila ${ab?'vl-ab':''}" tabindex="0" role="button" aria-expanded="${ab}" onclick="vlAbrir('${esc(x.clave)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();vlAbrir('${esc(x.clave)}')}">
        <td data-label="Foto" class="vl-c-foto">${imgFoto(x,'vl-foto-m')}</td><td data-label="Fecha">${esc(fechaHora(x.ms))}</td>
        <td data-label="Lote"><b>${esc(x.lote)}</b>${x.rotulo.turno?`<small>Turno ${esc(x.rotulo.turno)}</small>`:''}${x.proveedor?`<small>${esc(x.proveedor)}</small>`:''}</td>
        <td data-label="Producto">${esc(x.rotulo.marca||x.insumo||x.rotulo.producto||'—')}${x.rotulo.marca&&x.rotulo.producto?`<small>${esc(x.rotulo.producto)}</small>`:''}</td><td data-label="Vence">${esc(x.rotulo.vence||'—')}</td>
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
.vl-c-foto{width:70px}.vl-det-g{display:grid;grid-template-columns:minmax(200px,1fr) minmax(0,1.5fr);gap:16px}.vl-det-g:has(.vl-det-foto:empty){grid-template-columns:minmax(0,1fr)}
.vl-grande{display:grid;gap:6px;color:#0877a6;font-weight:700;font-size:13px;text-decoration:none}
.vl-datos{width:100%;border-collapse:collapse;margin:0 0 8px}.vl-datos th{width:40%;text-align:left;font-size:12px;color:#587087;font-weight:700;padding:4px 8px 4px 0;vertical-align:top}.vl-datos td{padding:4px 0;font-weight:600;overflow-wrap:anywhere}.vl-rev{margin:6px 0;color:#157a3b}
.vl-vacio{background:#fafcfe;border:1px dashed #c3d8e8;border-radius:12px;padding:22px;text-align:center;color:#587087}
.vl-msg{border-radius:12px;padding:10px 14px}.vl-msg-e{background:#fdecec;color:#991b1b;border:1px solid #f5b5b5}.vl-msg-k{background:#e7f6ec;color:#15803d;border:1px solid #b7e4c7}
.vl-fila:focus-visible,.vl-btn:focus-visible,.vl-cal-d:focus-visible{outline:3px solid #0ea5e9;outline-offset:2px}
.vl-arriba{display:grid;grid-template-columns:minmax(0,330px) minmax(0,1fr);gap:14px;align-items:start}.vl-arriba-der{display:grid;gap:14px;align-content:start}
.vl-cal{background:#fff;border:1px solid #d9e7f1;border-radius:14px;padding:12px}.vl-cal-cab{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}.vl-cal-cab b{font-size:16px;color:#0b2a4a}
.vl-btn-s{min-height:36px;padding:0 12px}.vl-act{background:#0877a6;color:#fff;border-color:#0877a6}
.vl-cal-t{width:100%;border-collapse:collapse;table-layout:fixed}.vl-cal-t th{font-size:11px;color:#587087;font-weight:700;padding:4px 0}.vl-cal-t td{padding:2px;text-align:center}
.vl-cal-d{width:100%;min-height:42px;border:1px solid transparent;border-radius:9px;background:#fff;font:inherit;color:#14263a;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:2px}
.vl-cal-d span{font-size:13px}.vl-cal-d.con{background:#f4f9fd}.vl-cal-d:hover{border-color:#9fd0e6}.vl-cal-d.hoy{border-color:#0877a6}.vl-cal-d.sel{background:#0877a6;color:#fff}
.vl-cal-n{font-size:10.5px;font-weight:800;border-radius:999px;padding:0 6px;min-width:18px;line-height:16px;color:#fff}.vl-cal-ok{background:#157a3b}.vl-cal-obs{background:#d97706}.vl-cal-mal{background:#c62828}
.vl-cal-d.sel .vl-cal-n{box-shadow:0 0 0 2px #fff}
.vl-cal-pie{display:flex;gap:8px;margin-top:8px}.vl-cal-ley{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:8px;font-size:11.5px;color:#587087}.vl-cal-ley i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px}
.vl-dia{font-size:18px;color:#0b2a4a;margin:0}
.vl-linea{display:grid;gap:8px}.vl-linea-cab{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;border-left:4px solid #0877a6;padding:2px 0 2px 10px}.vl-linea-cab h3{margin:0;font-size:17px;color:#0b2a4a}.vl-linea-p{display:flex;gap:6px;flex-wrap:wrap}
@media(max-width:860px){.vl-arriba{grid-template-columns:minmax(0,1fr)}}
@media(max-width:700px){.vl-det-g{grid-template-columns:minmax(0,1fr)}.vl-c-foto{width:auto}.vl-t thead{display:none}.vl-t tr.vl-fila{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:10px;border-top:1px solid #eaf1f7}.vl-t td{display:block;border:0;padding:2px 4px}.vl-t td[data-label]::before{content:attr(data-label);display:block;font-size:11px;font-weight:700;color:#587087;text-transform:uppercase}.vl-det td{display:block}.vl-det{display:block}}
</style>`;}
  function html(){
    if(!puedeVer())return `<div class="vl-msg vl-msg-e">No tienes permiso para ver las validaciones de lotes.</div>`;
    escuchar();
    if(ES.listo&&ES.cargadoDesde&&ES.mes<ES.cargadoDesde&&!ES.cargando)cargar();      // un mes anterior a lo cargado
    const lista=delPeriodo(ES.lista,ES),r=resumen(lista),vis=filtrar(lista,ES);
    return `<div class="vl">${estilos()}<div class="vl-nota" role="note">Aquí llega el <b>rótulo de producto terminado</b> que <b>valida el bot de WhatsApp</b> (lote, vencimiento, turno, marca y línea) con la <b>foto original</b>. Las etiquetas de proveedores se revisan en Asistente › Evidencias. Es solo un registro: <b>no mueve el stock ni cambia los lotes</b>. Las observadas y rechazadas esperan que una persona las marque como revisadas.</div>
      ${ES.error?`<div class="vl-msg vl-msg-e" role="alert">${esc(ES.error)}</div>`:''}${ES.aviso?`<div class="vl-msg ${/^No se pudo/.test(ES.aviso)?'vl-msg-e':'vl-msg-k'}" role="status">${esc(ES.aviso)}</div>`:''}
      ${ES.listo||ES.lista.length?'':'<div class="vl-vacio">Consultando las validaciones…</div>'}
      <div class="vl-arriba">${htmlCalendario()}<div class="vl-arriba-der"><h2 class="vl-dia">${ES.dia?esc(fechaLarga(ES.dia).charAt(0).toUpperCase()+fechaLarga(ES.dia).slice(1)):'Todo '+esc(MESES[Number(ES.mes.slice(5,7))-1])+' de '+esc(ES.mes.slice(0,4))}</h2>${tarjetas(r)}${filtros()}</div></div>
      ${porLineas(vis)}</div>`;
  }
  W.vlSet=(k,v)=>{ES[k]=v;ES.abierta='';repintar();};
  W.vlDia=d=>{ES.dia=d;if(d)ES.mes=d.slice(0,7);ES.abierta='';repintar();};
  W.vlMes=n=>{ES.mes=mesMas(ES.mes,n);ES.dia='';ES.abierta='';if(ES.mes<ES.cargadoDesde)cargar();repintar();};
  W.vlBuscar=v=>{ES.texto=v;ES.abierta='';const pos=v.length;repintar();const i=document.querySelector('.vl-busca input');if(i){i.focus();try{i.setSelectionRange(pos,pos);}catch(_){/* tipo search */}}};
  W.vlActualizar=()=>{ES.aviso='';cargar();};
  W.vlAbrir=c=>{ES.abierta=ES.abierta===c?'':c;ES.nota='';ES.aviso='';repintar();};
  W.vlNota=v=>{ES.nota=v;};
  W.vlRevisar=c=>revisar(c);
  W.apValidacionLotesUI={html,usar:o=>{repinta=o&&o.pintar;oyentes.length=0;if(repinta)oyentes.push(repinta);},detener,estado:ES,cargar};
})(typeof window!=='undefined'?window:globalThis);
