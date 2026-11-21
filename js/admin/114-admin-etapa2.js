/* =============================================================
   GLACIAL · PANEL DE ADMINISTRACIÓN · ETAPA 2 — Mermas y consumos · Metas y umbrales · Datos maestros · plantillas de Roles
   -------------------------------------------------------------
   MERMAS Y CONSUMOS (reutiliza las funciones y reglas del Asistente de Producción; nada paralelo):
     · Consumo de insumos → apFactores con guardarFactor (cierra la vigencia anterior y crea una versión nueva desde la fecha indicada; nunca edita la anterior).
       Gana el factor más específico (factorVigente); pendientes = combinaciones producidas sin factor; vista previa del cambio (rojo si ≥ 20 %).
     · Conversión de mermas → apParametros/conversiones con glacialConversiones.panel.guardarCambio (rige desde una fecha ≥ hoy: los reportes pasados conservan su conversión).
     · Causas y etapas → apParametros/merma con guardarParametrosMerma (con versión). Quitar una causa = dejar de ofrecerla: los registros viejos conservan el texto.
     · Tolerancias (nuevo) → adminConfig/tolerancias (glacial_60): merma aceptable y desviación aceptable por línea y si la merma se valida antes de cerrar. Sin valor: como hoy.
   METAS Y UMBRALES / DATOS MAESTROS: muestran los valores vivos y abren el editor que ya existe (no se duplica el editor).
   ROLES: plantillas de permisos editables y roles propios (adminConfig/roles). Cargar después de 112-admin-pantalla.js.
   ============================================================= */
(function(){
  'use strict';
  if(typeof window==='undefined'||!window.document)return;
  const W=window,N=W.glacialAdminNucleo;
  const U=()=>W.glacialAdminUI,DA=()=>W.glacialAdminDatos,CF=()=>W.glacialAdminConfig,AD=()=>W.glacialAsistenteDatos,AN=()=>W.glacialAsistenteNucleo,CV=()=>W.glacialConversiones&&W.glacialConversiones.panel;
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(n,d)=>{const x=Number(n);return Number.isFinite(x)?x.toLocaleString('es-PE',{maximumFractionDigits:d===undefined?4:d}):'—';};
  const hoy=()=>{try{return U().hoyLima();}catch(_){return '';}};
  const M={tab:'consumo',fi:'',fl:'Todas',modal:null,guardando:false,conv:{item:''},causas:null,tol:null,msg:null,rolBorr:null,escuchando:false,cmq:''};

  function arrancar(){
    if(M.escuchando)return;M.escuchando=true;
    try{if(AD())AD().escucharCatalogo();}catch(_){/* sin lectura */}
    try{if(W.glacialConversionesEscuchas)W.glacialConversionesEscuchas();}catch(_){/* sin lectura */}
    try{if(CF())CF().escuchar();}catch(_){/* sin lectura */}
    [AD()&&AD().alCambiar,W.glacialConversiones&&W.glacialConversiones.alCambiar,CF()&&CF().alCambiar].forEach(f=>{if(f)f(()=>repintar());});
  }
  const repintar=()=>{try{U().pintar();}catch(_){/* informativo */}};
  const aviso=(t,x)=>{M.msg=x?{t,x}:null;};
  const msgHtml=()=>M.msg?`<div class="adm-msg ${M.msg.t}" role="status">${esc(M.msg.x)}</div>`:'';
  const modal=h=>`<div class="adm-mod" role="dialog" aria-modal="true"><div>${h}</div></div>`;
  const cerrar=()=>{M.modal=null;M.guardando=false;repintar();};
  W.adm2Cerrar=()=>{if(!M.guardando)cerrar();};
  W.adm2Tab=t=>{M.tab=t;M.msg=null;M.modal=null;repintar();};
  const tabsHtml=(lista)=>`<div role="tablist" class="adm-f" style="gap:6px">${lista.map(([k,t])=>`<button type="button" role="tab" class="adm-b ${M.tab===k?'p':''}" aria-selected="${M.tab===k}" onclick="adm2Tab('${k}')">${esc(t)}</button>`).join('')}</div>`;
  const campoMotivo=()=>`<label style="display:grid;gap:4px;font-weight:700;margin-top:8px">Motivo (obligatorio, mínimo ${N.MOTIVO_MIN} caracteres)<textarea maxlength="300" oninput="adm2Motivo(this.value)" placeholder="Ej.: cambió el proveedor de tapas">${esc(M.modal&&M.modal.motivo||'')}</textarea></label>`;
  W.adm2Motivo=v=>{if(M.modal)M.modal.motivo=v;};
  const errHtml=()=>M.modal&&M.modal.error?`<div class="adm-msg e" style="margin-top:8px">${esc(M.modal.error)}</div>`:'';
  const botones=(okTxt,okFn)=>`<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button type="button" class="adm-b" onclick="adm2Cerrar()" ${M.guardando?'disabled':''}>Cancelar</button><button type="button" class="adm-b p" onclick="${okFn}" ${M.guardando?'disabled':''}>${M.guardando?'Guardando…':esc(okTxt)}</button></div>`;
  const pintarSinPerderFoco=()=>{const a=document.activeElement;if(a&&a.blur)a.blur();repintar();};

  /* =========================================================
     MERMAS Y CONSUMOS
     ========================================================= */
  function cuerpoConsumos(){
    arrancar();
    const T=[['consumo','Consumo de insumos'],['conversion','Conversión de mermas'],['causas','Causas y etapas'],['tolerancias','Tolerancias']];
    const c={consumo:tabConsumo,conversion:tabConversion,causas:tabCausas,tolerancias:tabTolerancias}[M.tab]||tabConsumo;
    return tabsHtml(T)+msgHtml()+c()+(M.modal?modalConsumos():'');
  }
  const insumoPor=cod=>((AD()&&AD().cache.insumos)||[]).find(i=>i.codigo===cod)||{codigo:cod,nombre:cod};
  const FACTORES=()=>((AD()&&AD().cache.factores)||[]);

  function tabConsumo(){
    const D=AD(),hoyF=hoy(),insumos=(D&&D.cache.insumos)||[],fs=FACTORES();
    const lineas=['Todas',...N.LINEAS];
    const q=M.fi.trim().toLowerCase();
    const vis=fs.filter(f=>(M.fl==='Todas'||AN().codigoLinea(f.linea)===M.fl)&&(!q||(window.glacialBusqueda?window.glacialBusqueda.coincide([insumoPor(f.insumo).nombre,f.insumo,f.marca||'',f.presentacion||''],q):(insumoPor(f.insumo).nombre+' '+f.insumo+' '+(f.marca||'')+' '+(f.presentacion||'')).toLowerCase().includes(q))))
      .sort((a,b)=>String(insumoPor(a.insumo).nombre).localeCompare(insumoPor(b.insumo).nombre,'es')||String(a.linea).localeCompare(String(b.linea))||String(b.vigenteDesde).localeCompare(String(a.vigenteDesde)));
    let pend=[];
    try{pend=N.combosSinFactor((typeof loadRecords==='function'?loadRecords():[]),insumos,fs,hoyF,AN().factorVigente,(()=>{try{return GlacialFecha.sumarDias(hoyF,-30);}catch(_){return '';}})());}catch(_){pend=[];}
    const err=D&&D.cache.error&&(D.cache.error.factores||D.cache.error.insumos);
    return `<div class="adm-card"><p class="adm-mut">Cada factor dice cuánto insumo se consume por unidad o por paleta. <b>Un cambio crea una versión nueva</b> con su fecha de vigencia y su motivo; la anterior no se edita, así los reportes con fecha anterior conservan su cálculo. Si dos factores empatan en especificidad, el sistema avisa «ambiguo» y no elige al azar.</p>
      ${err?`<div class="adm-msg e">${esc(err)}</div>`:''}
      ${pend.length?`<div class="adm-msg" style="background:#fff7e6;border:1px solid #f3d38b;color:#7a4a00"><b>Pendientes de configurar (${pend.length}):</b> se produjo y falta el factor de algún insumo.
        ${pend.slice(0,12).map(p=>`<div style="margin-top:6px">${esc(p.linea)} · ${esc(p.marca)} ${esc(p.presentacion)} <span class="adm-mut">— falta: ${esc(p.faltan.slice(0,4).map(i=>i.nombre).join(', '))}${p.faltan.length>4?' y '+(p.faltan.length-4)+' más':''}</span> <button type="button" class="adm-b" style="min-height:36px" onclick="adm2NuevoFactor('${esc(p.linea)}','${esc(p.marca)}','${esc(p.presentacion)}')">Configurar</button></div>`).join('')}</div>`:''}
      <div class="adm-f"><label>Buscar<input type="search" value="${esc(M.fi)}" placeholder="Insumo, marca o presentación" oninput="adm2Fi(this.value)"></label>
        <label>Línea<select onchange="adm2Fl(this.value)">${lineas.map(l=>`<option ${l===M.fl?'selected':''}>${l}</option>`).join('')}</select></label>
        <button type="button" class="adm-b p" onclick="adm2NuevoFactor('','','')">+ Nuevo factor</button></div>
      <div class="adm-caja"><table class="adm-t"><thead><tr><th>Insumo</th><th>Línea</th><th>Marca</th><th>Presentación</th><th>Base</th><th>Factor</th><th>Vigente</th><th></th></tr></thead><tbody>${vis.map(f=>{
        const vig=AN().factorVigente(fs,{insumo:f.insumo,linea:f.linea,marca:f.marca==='*'?'':f.marca,presentacion:f.presentacion==='*'?'':f.presentacion,fecha:hoyF}),esVig=vig.factor&&vig.factor.id===f.id,amb=vig.error==='AMBIGUO'&&(vig.candidatos||[]).some(c=>c.id===f.id);
        return `<tr><td><b>${esc(insumoPor(f.insumo).nombre)}</b><br><span class="adm-mut">${esc(f.insumo)}</span></td><td>${esc(f.linea)}</td><td>${esc(f.marca==='*'?'todas':f.marca)}</td><td>${esc(f.presentacion==='*'?'todas':f.presentacion)}</td>
          <td>${f.base==='PALETA'?'por paleta':'por unidad'}</td><td>${fmt(f.factor)} por cada ${fmt(f.cantidadBase)}</td><td style="white-space:nowrap">${esc(f.vigenteDesde)} → ${esc(f.vigenteHasta||'hoy')}<br>${amb?'<span class="adm-pill" style="background:#fdecec;color:#991b1b">ambiguo</span>':esVig?'<span class="adm-pill" style="background:#dff5e7;color:#157a3b">vigente hoy</span>':f.activo===false?'<span class="adm-pill">inactivo</span>':'<span class="adm-pill">no aplica hoy</span>'}</td>
          <td style="white-space:nowrap">${esVig?`<button type="button" class="adm-b" style="min-height:36px" onclick="adm2CambiarFactor('${esc(f.id)}')">Cambiar</button> `:''}<button type="button" class="adm-b" style="min-height:36px" onclick="adm2HistFactor('${esc(f.id)}')">Historial</button></td></tr>`;}).join('')}</tbody></table></div>
      ${vis.length?'':`<div class="adm-vacio">${fs.length?'Ningún factor coincide.':'Todavía no hay factores cargados (Asistente › Factores).'}</div>`}</div>`;
  }
  W.adm2Fi=v=>{M.fi=v;repintar();};W.adm2Fl=v=>{M.fl=v;repintar();};
  const cadena=f=>FACTORES().filter(x=>x.insumo===f.insumo&&x.linea===f.linea&&(x.marca||'*')===(f.marca||'*')&&(x.presentacion||'*')===(f.presentacion||'*')).sort((a,b)=>String(b.vigenteDesde).localeCompare(a.vigenteDesde));
  W.adm2HistFactor=id=>{const f=FACTORES().find(x=>x.id===id);if(!f)return;M.modal={tipo:'hist',f};repintar();};
  W.adm2CambiarFactor=id=>{const f=FACTORES().find(x=>x.id===id);if(!f)return;M.modal={tipo:'cambiar',f,nuevo:String(f.factor),desde:hoy()>f.vigenteDesde?hoy():f.vigenteDesde,motivo:'',prod:'10000',upp:'',error:''};repintar();};
  W.adm2NuevoFactor=(linea,marca,pres)=>{M.modal={tipo:'nuevo',linea:linea||N.LINEAS[0],marca:marca||'*',pres:pres||'*',insumo:'',base:'UND',cb:'1',factor:'',desde:hoy(),motivo:'',error:''};repintar();};
  const campo=(k,v)=>{if(M.modal)M.modal[k]=v;};
  W.adm2Campo=(k,v)=>{campo(k,v);if(['nuevo','prod','upp','desde'].includes(k)&&M.modal&&M.modal.tipo==='cambiar'){const e=document.getElementById('adm2-prev');if(e)e.innerHTML=previewHtml();}};
  function previewHtml(){
    const m=M.modal,f=m.f,a=AN(),nuevo=Number(String(m.nuevo).replace(',','.'));
    const upp=Number(m.upp)||0,prod=Number(m.prod)||0;
    const actual=a.teorico(prod,upp,f),propuesto=Number.isFinite(nuevo)?a.teorico(prod,upp,Object.assign({},f,{factor:nuevo})):null;
    if(actual===null||propuesto===null)return f.base==='PALETA'?'<span class="adm-mut">Escribe las unidades por paleta para ver la vista previa.</span>':'';
    const p=N.variacionPct(actual,propuesto),grande=N.esCambioGrande(p);
    return `Turno típico de <b>${fmt(prod,0)} UND</b>: consumo teórico <b>${fmt(actual)}</b> ${esc(insumoPor(f.insumo).unidad||'')} con el valor actual y <b>${fmt(propuesto)}</b> con el nuevo · <b style="color:${grande?'#c62828':'#157a3b'}">${p===null?'—':(p>0?'+':'')+fmt(p,1)+' %'}</b>${grande?' <b style="color:#c62828">(cambio de 20 % o más: revísalo)</b>':''}`;
  }
  function modalConsumos(){
    const m=M.modal;
    if(m.tipo==='hist'){const ch=cadena(m.f);return modal(`<h2 style="margin:0 0 6px">Historial · ${esc(insumoPor(m.f.insumo).nombre)} · ${esc(m.f.linea)}</h2><div class="adm-caja"><table class="adm-t"><thead><tr><th>Versión</th><th>Factor</th><th>Vigente</th><th>Quién</th></tr></thead><tbody>${ch.map(x=>`<tr><td>${esc(x.version||1)}</td><td>${fmt(x.factor)} por cada ${fmt(x.cantidadBase)}</td><td>${esc(x.vigenteDesde)} → ${esc(x.vigenteHasta||'hoy')}</td><td>${esc(x.actualizadoPor||x.creadoPor||'—')}</td></tr>`).join('')}</tbody></table></div><div style="text-align:right;margin-top:10px"><button type="button" class="adm-b" onclick="adm2Cerrar()">Cerrar</button></div>`);}
    if(m.tipo==='cambiar'){const f=m.f;return modal(`<h2 style="margin:0 0 6px">Cambiar factor</h2><p class="adm-mut">${esc(insumoPor(f.insumo).nombre)} · ${esc(f.linea)} · ${esc(f.marca==='*'?'todas las marcas':f.marca)} ${esc(f.presentacion==='*'?'':f.presentacion)} — ahora ${fmt(f.factor)} por cada ${fmt(f.cantidadBase)} (${f.base==='PALETA'?'por paleta':'por unidad'}).</p>
      <div class="adm-grid"><label>Factor nuevo<input inputmode="decimal" value="${esc(m.nuevo)}" oninput="adm2Campo('nuevo',this.value)"></label><label>Rige desde<input type="date" value="${esc(m.desde)}" min="${esc(f.vigenteDesde)}" oninput="adm2Campo('desde',this.value)"></label>
      <label>Producción de un turno típico (UND)<input inputmode="numeric" value="${esc(m.prod)}" oninput="adm2Campo('prod',this.value)"></label>${f.base==='PALETA'?`<label>Unidades por paleta<input inputmode="numeric" value="${esc(m.upp)}" oninput="adm2Campo('upp',this.value)"></label>`:''}</div>
      <p id="adm2-prev" style="margin:10px 0 0">${previewHtml()}</p>${campoMotivo()}${errHtml()}${botones('Guardar versión nueva','adm2GuardarCambio()')}`);}
    if(m.tipo==='nuevo'){const ins=((AD()&&AD().cache.insumos)||[]).filter(i=>i.activo!==false);return modal(`<h2 style="margin:0 0 6px">Nuevo factor</h2>
      <div class="adm-grid"><label>Insumo<select onchange="adm2Campo('insumo',this.value)"><option value="">— elige —</option>${ins.map(i=>`<option value="${esc(i.codigo)}" ${i.codigo===m.insumo?'selected':''}>${esc(i.nombre)}</option>`).join('')}</select></label>
      <label>Línea<select onchange="adm2Campo('linea',this.value)">${N.LINEAS.map(l=>`<option ${l===m.linea?'selected':''}>${l}</option>`).join('')}</select></label>
      <label>Marca (* = todas)<input value="${esc(m.marca)}" oninput="adm2Campo('marca',this.value)"></label><label>Presentación (* = todas)<input value="${esc(m.pres)}" oninput="adm2Campo('pres',this.value)"></label>
      <label>Base<select onchange="adm2Campo('base',this.value)"><option value="UND" ${m.base==='UND'?'selected':''}>por unidad producida</option><option value="PALETA" ${m.base==='PALETA'?'selected':''}>por paleta</option></select></label>
      <label>Cantidad base<input inputmode="decimal" value="${esc(m.cb)}" oninput="adm2Campo('cb',this.value)"></label><label>Factor<input inputmode="decimal" value="${esc(m.factor)}" oninput="adm2Campo('factor',this.value)"></label><label>Rige desde<input type="date" value="${esc(m.desde)}" oninput="adm2Campo('desde',this.value)"></label></div>
      ${campoMotivo()}${errHtml()}${botones('Guardar factor','adm2GuardarNuevo()')}`);}
    if(m.tipo==='conv'){return modalConv();}
    if(m.tipo==='causas'){return modal(`<h2 style="margin:0 0 6px">Guardar causas y etapas</h2><p class="adm-mut">${m.causas.length} causas · ${m.etapas.length} etapas. Las que quites dejan de ofrecerse; los registros viejos conservan su texto.</p>${campoMotivo()}${errHtml()}${botones('Guardar','adm2GuardarCausas()')}`);}
    return '';
  }
  async function auditar(accion,antes,despues,motivo){try{await DA().registrar([{modulo:'Mermas y consumos',accion,antes,despues,motivo}]);}catch(_){/* queda en la cola de reintento */}}
  async function ejecutar(fn,okMsg){
    const m=M.modal;
    const e=N.validarMotivo(m.motivo);if(e.length){m.error=e.join(' ');repintar();return;}
    M.guardando=true;m.error='';pintarSinPerderFoco();
    try{await fn();M.msg={t:'k',x:okMsg};M.modal=null;}
    catch(err){m.error=(err&&err.message)||String(err);}
    M.guardando=false;repintar();
  }
  W.adm2GuardarCambio=()=>{
    const m=M.modal,f=m.f,fac=Number(String(m.nuevo).replace(',','.'));
    ejecutar(async()=>{
      const n=Object.assign({},f,{factor:fac,vigenteDesde:m.desde,vigenteHasta:null});delete n.id;delete n.version;
      await AD().guardarFactor(n,f.id);
      await auditar('Cambió el factor de '+insumoPor(f.insumo).nombre+' en '+f.linea,{factor:f.factor,desde:f.vigenteDesde},{factor:fac,desde:m.desde},m.motivo);
    },'Factor guardado como versión nueva desde '+m.desde+'. Los reportes anteriores conservan su cálculo.');
  };
  W.adm2GuardarNuevo=()=>{
    const m=M.modal;
    ejecutar(async()=>{
      const n={insumo:m.insumo,linea:m.linea,marca:m.marca||'*',presentacion:m.pres||'*',base:m.base,cantidadBase:Number(String(m.cb).replace(',','.')),factor:Number(String(m.factor).replace(',','.')),vigenteDesde:m.desde,vigenteHasta:null,activo:true,origen:'manual'};
      await AD().guardarFactor(n,null);
      await auditar('Creó un factor de '+insumoPor(m.insumo).nombre+' en '+m.linea,null,{factor:n.factor,base:n.base,desde:n.vigenteDesde},m.motivo);
    },'Factor creado.');
  };

  /* ---------- conversión de mermas ---------- */
  function tabConversion(){
    const C=CV();if(!C)return '<div class="adm-card"><div class="adm-vacio">Las conversiones todavía no están disponibles.</div></div>';
    const gr=C.grupos(),item=M.conv.item&&gr.some(g=>g.item===M.conv.item)?M.conv.item:(gr[0]&&gr[0].item)||'';
    const g=gr.find(x=>x.item===item),hoyF=hoy();
    const filas=g?g.lineas.map(l=>{const e=C.vigenteEntrada(l,item,hoyF),vs=e?C.versiones(e.clave):[];return {l,e,vs};}):[];
    return `<div class="adm-card"><p class="adm-mut">Para cada componente de merma de cada línea: lo que ingresa el supervisor y cómo se convierte. Un cambio pide «rige desde» y motivo; <b>los reportes con fecha anterior conservan su conversión</b>: nada se recalcula hacia atrás. Las preformas por gramaje salen del cuadro del supervisor y no se editan aquí.</p>
      <div class="adm-f"><label>Componente<select onchange="adm2ConvItem(this.value)">${gr.map(x=>`<option ${x.item===item?'selected':''}>${esc(x.item)}</option>`).join('')}</select></label>${item?`<button type="button" class="adm-b p" onclick="adm2ConvCambiar()">Cambiar conversión</button>`:''}</div>
      <div class="adm-caja"><table class="adm-t"><thead><tr><th>Línea</th><th>Conversión vigente hoy</th><th>Se ingresa</th><th>Rige desde</th><th>Versión</th></tr></thead><tbody>${filas.map(({l,e})=>`<tr><td><b>${esc(l)}</b></td><td>${e?esc(C.texto(e.config,e.unidad)):'—'}</td><td>${e?esc(e.unidad):'—'}</td><td>${e?esc(e.vigenteDesde==='0000-00-00'||String(e.vigenteDesde).startsWith('0')?'Desde siempre (código)':e.vigenteDesde):'—'}</td><td>${e?esc(e.version||0):'—'}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  W.adm2ConvItem=v=>{M.conv.item=v;repintar();};
  W.adm2ConvCambiar=()=>{
    const C=CV(),gr=C.grupos(),item=M.conv.item||(gr[0]&&gr[0].item),g=gr.find(x=>x.item===item);if(!g)return;
    const e0=C.vigenteEntrada(g.lineas[0],item,hoy());
    M.modal={tipo:'conv',item,lineas:g.lineas.slice(),sel:g.lineas.slice(),valor:'',unidad:(e0&&e0.unidad)||'UND',desde:hoy(),motivo:'',error:'',base:C.version()};repintar();
  };
  function modalConv(){
    const m=M.modal,C=CV(),hoyF=hoy();
    const act=m.lineas.map(l=>{const e=C.vigenteEntrada(l,m.item,hoyF);return `${esc(l)}: ${e?esc(C.texto(e.config,e.unidad)):'—'}`;}).join(' · ');
    return modal(`<h2 style="margin:0 0 6px">Cambiar conversión · ${esc(m.item)}</h2><p class="adm-mut">Ahora: ${act}</p>
      <div class="adm-grid"><label>Valor nuevo (g por unidad, o el factor del ítem)<input inputmode="decimal" value="${esc(m.valor)}" oninput="adm2Campo('valor',this.value)"></label>
      <label>Unidad<select onchange="adm2Campo('unidad',this.value)">${['UND','PLANCHA','KG'].map(u=>`<option ${u===m.unidad?'selected':''}>${u}</option>`).join('')}</select></label>
      <label>Rige desde (hoy o después)<input type="date" min="${esc(hoyF)}" value="${esc(m.desde)}" oninput="adm2Campo('desde',this.value)"></label></div>
      <div class="adm-f" style="margin-top:8px">${m.lineas.map(l=>`<label style="flex-direction:row;display:flex;gap:6px;align-items:center;text-transform:none"><input type="checkbox" style="min-height:auto" ${m.sel.includes(l)?'checked':''} onchange="adm2ConvLinea('${esc(l)}',this.checked)"> ${esc(l)}</label>`).join('')}</div>
      ${m.desde&&m.desde<hoyF?'':''}${m.desde&&m.desde>hoyF?'':''}<p class="adm-mut">Afecta a los reportes desde ${esc(m.desde||'…')}; los anteriores no cambian.</p>${campoMotivo()}${errHtml()}${botones('Guardar conversión','adm2GuardarConv()')}`);
  }
  W.adm2ConvLinea=(l,on)=>{const m=M.modal;if(!m)return;m.sel=on?[...new Set([...m.sel,l])]:m.sel.filter(x=>x!==l);};
  W.adm2GuardarConv=()=>{
    const m=M.modal,C=CV(),antes=m.sel.map(l=>{const e=C.vigenteEntrada(l,m.item,hoy());return {linea:l,valor:e?C.texto(e.config,e.unidad):'—'};});
    ejecutar(async()=>{
      await C.guardarCambio({item:m.item,lineas:m.sel,valor:Number(String(m.valor).replace(',','.')),unidad:m.unidad,vigenteDesde:m.desde,motivo:m.motivo});
      await auditar('Cambió la conversión de '+m.item+' ('+m.sel.join(', ')+')',antes,{valor:m.valor,unidad:m.unidad,desde:m.desde},m.motivo);
    },'Conversión guardada: rige desde '+m.desde+'. Los reportes anteriores conservan la suya.');
  };

  /* ---------- causas y etapas ---------- */
  function causasActuales(){const D=AD();return {causas:D?D.causasMerma().slice():[],etapas:D?D.etapasMerma().slice():[],version:Number(D&&D.cache.parametrosMerma&&D.cache.parametrosMerma.version)||0};}
  function tabCausas(){
    if(!AD())return '<div class="adm-card"><div class="adm-vacio">El Asistente todavía no está disponible.</div></div>';
    const act=causasActuales();if(!M.causas||M.causas.version!==act.version&&!M.causas.sucio)M.causas=Object.assign({sucio:false},act);
    const b=M.causas;
    const lista=(k,t,ph)=>`<div class="adm-card" style="margin:0"><h2>${t} (${b[k].length})</h2>${b[k].map((x,i)=>`<div style="display:flex;gap:6px;margin:0 0 6px"><input style="flex:1" value="${esc(x)}" oninput="adm2CausaTxt('${k}',${i},this.value)"><button type="button" class="adm-b" onclick="adm2CausaQuitar('${k}',${i})" aria-label="Dejar de ofrecer ${esc(x)}">Quitar</button></div>`).join('')}
      <div style="display:flex;gap:6px"><input id="adm2-nuevo-${k}" style="flex:1" placeholder="${ph}"><button type="button" class="adm-b" onclick="adm2CausaAgregar('${k}')">Agregar</button></div></div>`;
    return `<div class="adm-card"><p class="adm-mut">Causas y etapas que ofrece el Asistente al registrar una merma. Agregar es libre; <b>quitar solo deja de ofrecerla</b>: los registros viejos conservan su texto. Sin documento se usan las de siempre.</p>
      <div class="adm-2">${lista('causas','Causas de merma','Nueva causa')}${lista('etapas','Etapas de merma','Nueva etapa')}</div>
      <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end"><button type="button" class="adm-b" onclick="adm2CausasDescartar()" ${b.sucio?'':'disabled'}>Descartar</button><button type="button" class="adm-b p" onclick="adm2CausasPedir()" ${b.sucio?'':'disabled'}>Guardar cambios</button></div></div>`;
  }
  W.adm2CausaTxt=(k,i,v)=>{M.causas[k][i]=v;M.causas.sucio=true;};
  W.adm2CausaQuitar=(k,i)=>{M.causas[k].splice(i,1);M.causas.sucio=true;pintarSinPerderFoco();};
  W.adm2CausaAgregar=k=>{const e=document.getElementById('adm2-nuevo-'+k),v=e?e.value.trim():'';if(!v)return;M.causas[k].push(v);M.causas.sucio=true;pintarSinPerderFoco();};
  W.adm2CausasDescartar=()=>{M.causas=null;repintar();};
  W.adm2CausasPedir=()=>{M.modal={tipo:'causas',causas:M.causas.causas.slice(),etapas:M.causas.etapas.slice(),version:M.causas.version,motivo:'',error:''};repintar();};
  W.adm2GuardarCausas=()=>{
    const m=M.modal,antes=causasActuales();
    ejecutar(async()=>{
      await AD().guardarParametrosMerma({causas:m.causas,etapas:m.etapas},m.version);
      await auditar('Cambió las causas y etapas de merma',{causas:antes.causas.length,etapas:antes.etapas.length},{causas:m.causas.length,etapas:m.etapas.length},m.motivo);
      M.causas=null;
    },'Causas y etapas guardadas.');
  };

  /* ---------- tolerancias ---------- */
  function tabTolerancias(){
    const CFG=CF(),doc=CFG&&CFG.doc('tolerancias')||{},base=CFG?CFG.version('tolerancias'):0;
    if(!M.tol||M.tol.base!==base&&!M.tol.sucio)M.tol={base,sucio:false,lineas:JSON.parse(JSON.stringify(doc.lineas||{}))};
    const t=M.tol;
    return `<div class="adm-card"><p class="adm-mut">Límites por línea que usa el Asistente para marcar «Por revisar». <b>Vacío = se comporta como hoy.</b> Merma aceptable: la merma (validada + la del Registro) que se tolera como % del consumo teórico. Desviación aceptable: la diferencia sin explicar que se tolera como % del teórico.</p>
      ${CFG&&CFG.listo('tolerancias')?'':'<div class="adm-mut">Consultando…</div>'}
      <div class="adm-caja"><table class="adm-t"><thead><tr><th>Línea</th><th>Merma aceptable (% del teórico)</th><th>Desviación aceptable (%)</th><th>Validar la merma antes de cerrar el turno</th></tr></thead><tbody>${N.LINEAS.map(l=>{const x=t.lineas[l]||{};return `<tr><td><b>${l}</b></td>
        <td><input inputmode="decimal" style="width:120px" value="${esc(x.mermaPct==null?'':x.mermaPct)}" oninput="adm2Tol('${l}','mermaPct',this.value)" placeholder="como hoy"></td>
        <td><input inputmode="decimal" style="width:120px" value="${esc(x.desviacionPct==null?'':x.desviacionPct)}" oninput="adm2Tol('${l}','desviacionPct',this.value)" placeholder="como hoy"></td>
        <td><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" style="min-height:auto" ${x.validarMermaAntes===false?'':'checked'} onchange="adm2Tol('${l}','validarMermaAntes',this.checked)"> Sí, exigirlo</label></td></tr>`;}).join('')}</tbody></table></div>
      <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end"><button type="button" class="adm-b" onclick="adm2TolDescartar()" ${t.sucio?'':'disabled'}>Descartar</button><button type="button" class="adm-b p" onclick="adm2TolPedir()" ${t.sucio?'':'disabled'}>Guardar cambios</button></div></div>`;
  }
  W.adm2Tol=(l,c,v)=>{const t=M.tol;t.lineas[l]=Object.assign({},t.lineas[l]);t.lineas[l][c]=v;t.sucio=true;};
  W.adm2TolDescartar=()=>{M.tol=null;repintar();};
  W.adm2TolPedir=()=>{
    const e=N.validarTolerancias(M.tol.lineas);if(e.length){aviso('e',e.join(' '));repintar();return;}
    M.modal={tipo:'tol',motivo:'',error:'',lineas:N.normalizarTolerancias(M.tol.lineas),base:M.tol.base};repintar();
  };
  const origenModal=modalConsumos;
  modalConsumos=function(){const m=M.modal;if(m&&m.tipo==='tol')return modal(`<h2 style="margin:0 0 6px">Guardar tolerancias</h2><p class="adm-mut">${Object.keys(m.lineas).length} línea(s) con valores. Las demás siguen como hoy.</p>${campoMotivo()}${errHtml()}${botones('Guardar','adm2GuardarTol()')}`);return origenModal();};
  W.adm2GuardarTol=async()=>{
    const m=M.modal,antes=(CF().doc('tolerancias')||{}).lineas||{};
    const e=N.validarMotivo(m.motivo);if(e.length){m.error=e.join(' ');repintar();return;}
    M.guardando=true;pintarSinPerderFoco();
    const r=await CF().guardar('tolerancias',{lineas:m.lineas},m.motivo,m.base,{modulo:'Mermas y consumos',accion:'Cambió las tolerancias de merma',antes,despues:m.lineas});
    M.guardando=false;
    if(!r.ok){m.error=r.msg;if(r.conflicto){M.tol=null;M.modal=null;M.msg={t:'e',x:r.msg};}repintar();return;}
    M.tol=null;M.modal=null;M.msg={t:r.auditoriaPendiente?'e':'k',x:'Tolerancias guardadas (versión '+r.version+'). El Asistente ya las usa.'};repintar();
  };

  /* =========================================================
     METAS Y UMBRALES · DATOS MAESTROS (valores vivos + el editor que ya existe)
     ========================================================= */
  const V={ind:null,ale:null,on:false};
  function leerDocs(){
    if(V.on||typeof db==='undefined')return;V.on=true;
    [['ind','configIndicadores'],['ale','configAlertas']].forEach(([k,id])=>{try{db.collection('sync').doc(id).onSnapshot(s=>{V[k]=s.exists?s.data():null;repintar();},()=>{});}catch(_){/* sin lectura */}});
  }
  const plano=(o,pre,out,prof)=>{if(o===null||o===undefined)return out;if(Array.isArray(o)){out.push([pre,o.length+' elementos']);return out;}if(typeof o!=='object'){out.push([pre,String(o)]);return out;}if(prof>2){out.push([pre,'…']);return out;}Object.keys(o).filter(k=>!['updatedAt','actualizadoEn'].includes(k)).forEach(k=>plano(o[k],pre?pre+' › '+k:k,out,(prof||0)+1));return out;};
  const abrir=(fn,txt)=>typeof W[fn]==='function'?`<button type="button" class="adm-b p" onclick="${fn}()">${esc(txt)}</button>`:`<span class="adm-mut">(${esc(txt)}: no disponible en esta sesión)</span>`;
  function metasHtml(){
    leerDocs();
    const tabla=(titulo,doc,pie)=>{const f=plano(doc,'',[],0).slice(0,40);return `<div class="adm-card"><h2>${esc(titulo)}</h2>${doc?`<div class="adm-caja"><table class="adm-t"><tbody>${f.map(([k,v])=>`<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</tbody></table></div>`:'<div class="adm-vacio">Sin datos (o sin lectura).</div>'}<div style="margin-top:10px">${pie}</div></div>`;};
    return `<div class="adm-msg i">Aquí ves los valores <b>vivos</b>. Se editan con el editor de siempre (mismas reglas y mismo permiso «configurar umbrales»): así no hay dos formas de cambiar lo mismo. Cada cambio de esos editores queda en la auditoría de su módulo.</div>
      <div class="adm-2">${tabla('Metas e indicadores (sync/configIndicadores)',V.ind,abrir('goAnalisisParadas','Abrir Análisis de paradas (metas y velocidades)')+' '+abrir('goVelocidadesEstandar','Abrir Velocidades estándar'))}
      ${tabla('Umbrales de avisos (sync/configAlertas)',V.ale,(W.glacialAvisos&&typeof W.glacialAvisos.abrirConfig==='function')?'<button type="button" class="adm-b p" onclick="glacialAvisos.abrirConfig()">Editar umbrales de avisos</button>':'<span class="adm-mut">El editor de umbrales se abre desde el Inicio.</span>')}</div>`;
  }
  function maestrosHtml(){
    arrancar();
    const D=AD(),c=D&&D.cache||{},n=(a)=>Array.isArray(a)?a.length:'—';
    const card=(t,d,b)=>`<div class="adm-card" style="margin:0"><h2>${esc(t)}</h2><p class="adm-mut">${esc(d)}</p><div>${b}</div></div>`;
    return `<div class="adm-msg i">Cada dato maestro se edita donde ya vive (misma lectura, mismas reglas, misma auditoría). Aquí tienes el resumen y el acceso directo.</div>
      <div class="adm-kpis"><div class="adm-kpi"><span>Insumos</span><b>${n(c.insumos)}</b><small>en el catálogo del Asistente</small></div><div class="adm-kpi"><span>Factores de consumo</span><b>${n(c.factores)}</b><small>versiones guardadas</small></div></div>
      <div class="adm-grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">
      ${card('Productos y unidades por paleta','Catálogo de Planificación (marcas, presentaciones y unidades por paleta).',abrir('goPlanificacion','Abrir Planificación')+' '+abrir('goProductosParametros','Parámetros de productos'))}
      ${card('Insumos y proveedores','Catálogo de insumos, conteos y lotes.',abrir('goInventarioInsumos','Abrir Inventario de insumos'))}
      ${card('Velocidades estándar','Velocidad estándar por línea y producto.',abrir('goVelocidadesEstandar','Abrir Velocidades estándar'))}
      ${card('Horarios de producción','Bloques y horarios por línea.',abrir('goHorarioProduccion','Abrir Horario de producción'))}
      ${card('Equipos, motivos de parada y causas','Catálogo de equipos y causas › motivos.',abrir('goMantenimiento','Abrir Mantenimiento'))}
      ${card('Hielo','Marcas, presentaciones y programación de Hielo.',abrir('goReporteHielo','Abrir Reporte Hielo'))}</div>`;
  }

  /* =========================================================
     ROLES · plantillas editables y roles propios (adminConfig/roles)
     ========================================================= */
  const claves=()=>U().claves();
  const plantillaActual=rol=>U().plantillaDeRol(rol);
  function rolesHtml(){
    arrancar();
    const UI=U(),roles=UI.roles(),sel=M.rolSel&&roles.includes(M.rolSel)?M.rolSel:roles[0],es=sel==='Administrador';
    const doc=CF().doc('roles')||{},propios=(doc.propios||[]).map(r=>r.nombre);
    const actual=plantillaActual(sel),borr=M.rolBorr&&M.rolBorr.rol===sel?M.rolBorr:null;
    const lista=borr?borr.perms:(actual===N.TODOS?claves().slice():actual.slice());
    const on=k=>es||lista.includes(k);
    const us=UI.usuarios().filter(u=>String(u.rol||'').trim()===sel);
    const difieren=us.filter(u=>!N.esAdminPrincipal(u)&&!N.igualesPermisos(u.permisos===N.TODOS?N.TODOS:N.permisosDe(u,claves()).sort(),es?N.TODOS:lista.slice().sort()));
    return `${msgHtml()}<div class="adm-2"><div class="adm-card"><h2>Roles</h2><p class="adm-mut">Cada rol es una plantilla: al crear un usuario recibe sus permisos. Los roles propios no cambian el comportamiento del sistema: solo agrupan permisos.</p>
        ${roles.map(r=>{const n=UI.usuarios().filter(u=>String(u.rol||'').trim()===r).length,p=plantillaActual(r);return `<button type="button" class="adm-b" style="display:flex;justify-content:space-between;width:100%;margin:0 0 6px;${r===sel?'background:#eaf5fc':''}" onclick="adm2Rol('${esc(r)}')"><span>${esc(r)}${propios.includes(r)?' <span class="adm-pill">propio</span>':''}</span><span class="adm-mut">${n} usuarios · ${p===N.TODOS?'todos':p.length} permisos</span></button>`;}).join('')}
        <div class="adm-f" style="margin-top:10px"><label>Nuevo rol<input id="adm2-nuevo-rol" placeholder="Ej.: Calidad"></label><button type="button" class="adm-b" onclick="adm2RolCrear()">Crear</button></div></div>
      <div class="adm-card"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><h2>Plantilla: ${esc(sel)}</h2><span class="adm-mut">${es?'Todos':lista.length} de ${claves().length} permisos · ${us.length} usuarios con este rol</span></div><button type="button" class="adm-b" onclick="adm2RolDuplicar()" ${es?'disabled':''}>Duplicar rol</button></div>
        ${es?'<div class="adm-msg i">El Administrador tiene todos los permisos y no se pueden quitar.</div>':''}
        ${difieren.length?`<div class="adm-msg i">${difieren.length} usuario(s) tienen permisos distintos a la plantilla. <button type="button" class="adm-b p" onclick="admIgualarTodos('${esc(sel)}')">Igualar a la plantilla</button></div>`:''}
        ${AREAS_PERMISOS.map(a=>{const items=PERMISOS_APP.filter(p=>p.area===a.clave);if(!items.length)return '';const n=items.filter(p=>on(p.key)).length;
          return `<div class="adm-ar"><div><b>${esc(a.titulo)}</b><span class="adm-mut">${n}/${items.length}</span></div><div class="adm-pe">${items.map(p=>`<label><input type="checkbox" style="min-height:auto" ${on(p.key)?'checked':''} ${es?'disabled':''} onchange="adm2RolPerm('${esc(sel)}','${p.key}',this.checked)"><span>${esc(p.label)}</span></label>`).join('')}</div></div>`;}).join('')}
        ${borr?`<div class="adm-barra" style="position:static;margin-top:10px"><span>Plantilla con cambios sin guardar</span><span><button type="button" class="adm-b" style="background:transparent;color:#fff" onclick="adm2RolDescartar()">Descartar</button> <button type="button" class="adm-b p" style="background:#fff;color:#033350" onclick="adm2RolPedir()">Guardar plantilla</button></span></div>`:''}</div></div>${M.modal&&M.modal.tipo==='rol'?modal(`<h2 style="margin:0 0 6px">Guardar plantilla · ${esc(M.modal.rol)}</h2><p class="adm-mut">${M.modal.perms.length} permisos. Los usuarios que ya tienen este rol <b>no cambian solos</b>: después puedes usar «Igualar a la plantilla».</p>${campoMotivo()}${errHtml()}${botones('Guardar plantilla','adm2RolGuardar()')}`):''}`;
  }
  W.adm2Rol=r=>{M.rolSel=r;M.rolBorr=null;M.msg=null;repintar();};
  W.adm2RolPerm=(rol,k,on)=>{
    const act=plantillaActual(rol),base=M.rolBorr&&M.rolBorr.rol===rol?M.rolBorr.perms:(act===N.TODOS?claves().slice():act.slice());
    M.rolBorr={rol,perms:on?[...new Set([...base,k])]:base.filter(x=>x!==k)};repintar();
  };
  W.adm2RolDescartar=()=>{M.rolBorr=null;repintar();};
  W.adm2RolPedir=()=>{M.modal={tipo:'rol',rol:M.rolBorr.rol,perms:N.limpiarPlantilla(M.rolBorr.perms,claves()),motivo:'',error:''};repintar();};
  async function guardarRoles(doc,modif,descripcion,antes,despues,motivo){
    const base=CF().version('roles');
    const r=await CF().guardar('roles',doc,motivo,base,{modulo:'Roles y permisos',accion:descripcion,antes,despues});
    return r;
  }
  W.adm2RolGuardar=async()=>{
    const m=M.modal,e=N.validarMotivo(m.motivo);if(e.length){m.error=e.join(' ');repintar();return;}
    const d=CF().doc('roles')||{},plantillas=Object.assign({},d.plantillas||{});
    const antes=plantillaActual(m.rol);plantillas[m.rol]=m.perms;
    M.guardando=true;pintarSinPerderFoco();
    const r=await guardarRoles({plantillas,propios:d.propios||[]},null,'Cambió la plantilla del rol '+m.rol,{permisos:antes===N.TODOS?'todos':antes.length},{permisos:m.perms.length},m.motivo);
    M.guardando=false;if(!r.ok){m.error=r.msg;if(r.conflicto){M.modal=null;M.rolBorr=null;M.msg={t:'e',x:r.msg};}repintar();return;}
    M.modal=null;M.rolBorr=null;M.msg={t:r.auditoriaPendiente?'e':'k',x:'Plantilla guardada. Aplica a los usuarios que se creen desde ahora.'};repintar();
  };
  async function crearRolPropio(nombre,perms,motivo){
    const d=CF().doc('roles')||{},existentes=U().roles(),e=N.validarRolNuevo(nombre,existentes);
    if(e.length){M.msg={t:'e',x:e.join(' ')};repintar();return;}
    const plantillas=Object.assign({},d.plantillas||{});plantillas[nombre]=perms;
    const propios=[...(d.propios||[]),{nombre,desde:hoy()}];
    const r=await guardarRoles({plantillas,propios},null,'Creó el rol '+nombre,null,{permisos:perms.length},motivo);
    if(!r.ok){M.msg={t:'e',x:r.msg};}else{M.rolSel=nombre;M.msg={t:'k',x:'Rol «'+nombre+'» creado. Ya aparece en «Nuevo usuario».'};}
    repintar();
  }
  W.adm2RolCrear=()=>{const e=document.getElementById('adm2-nuevo-rol'),n=e?e.value.trim():'';M.modal={tipo:'rolnuevo',nombre:n,perms:[],motivo:'',error:''};
    const er=N.validarRolNuevo(n,U().roles());if(er.length){M.modal=null;M.msg={t:'e',x:er.join(' ')};}repintar();};
  W.adm2RolDuplicar=()=>{const sel=M.rolSel||U().roles()[0],p=plantillaActual(sel);M.modal={tipo:'rolnuevo',nombre:'Copia de '+sel,perms:p===N.TODOS?claves().slice():p.slice(),motivo:'',error:'',editable:true};repintar();};
  const origen2=rolesHtml;
  const rolesHtml2=()=>{const h=origen2();const m=M.modal;if(m&&m.tipo==='rolnuevo')return h+modal(`<h2 style="margin:0 0 6px">Crear rol</h2><label style="display:grid;gap:4px;font-weight:700">Nombre del rol<input value="${esc(m.nombre)}" oninput="adm2Campo('nombre',this.value)"></label><p class="adm-mut">Empieza con ${m.perms.length} permisos (${m.perms.length?'copiados del rol elegido':'ninguno: los marcas después en su plantilla'}).</p>${campoMotivo()}${errHtml()}${botones('Crear rol','adm2RolNuevoOk()')}`);return h;};
  W.adm2RolNuevoOk=async()=>{
    const m=M.modal,e=N.validarMotivo(m.motivo);if(e.length){m.error=e.join(' ');repintar();return;}
    const er=N.validarRolNuevo(m.nombre,U().roles());if(er.length){m.error=er.join(' ');repintar();return;}
    M.guardando=true;pintarSinPerderFoco();await crearRolPropio(m.nombre.trim(),m.perms,m.motivo);M.guardando=false;M.modal=null;repintar();
  };

  { const irOriginal=W.admIr; W.admIr=function(id){M.modal=null;M.msg=null;return irOriginal.apply(this,arguments);}; }     // al cambiar de sección se cierran sus ventanas
  U().registrar('consumos',{html:cuerpoConsumos});
  U().registrar('metas',{html:metasHtml});
  U().registrar('maestros',{html:maestrosHtml});
  U().registrar('roles',{html:rolesHtml2});
})();
