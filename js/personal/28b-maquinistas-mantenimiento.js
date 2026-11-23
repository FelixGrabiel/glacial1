/* =============================================================
   GLACIAL · MAQUINISTAS REGISTRADOS POR MANTENIMIENTO (23/11/2026)
   -------------------------------------------------------------
   Antes: los maquinistas se registraban SOLO en el Tareo de Producción y Mantenimiento los veía como espejo de solo lectura
   (28-tareo-maquinistas.js). Si Producción no creaba su Tareo, el espejo quedaba vacío y Mantenimiento no podía registrar ni
   corregir nada (desde el 23/10/2026 no había Tareos de Producción).

   Ahora:
     1. Tareo de Mantenimiento (Día o Noche) SIN Tareo de Producción del mismo turno → el panel «Maquinistas» es EDITABLE para
        quien puede editar la salida de maquinistas (tareoPuedeEditarSalidaMaquinistas: permiso «editar_salida_maquinistas»,
        Administrador o Supervisor/Jefe de Mantenimiento). La lista sale de la Rotación de maquinistas de la semana; se registra
        asistencia, ingreso, refrigerio y salida. Se guarda en el Tareo de Mantenimiento: tareo.maquinistasMtto[] (una fila por
        maquinista, con quién y cuándo).
     2. Cuando Producción abre su Tareo de ese turno, los maquinistas registrados por Mantenimiento se COPIAN a su tareo (solo en
        filas sin asistencia; lo que Producción ya tenía manda) y queda la marca produccion.maquinistasDesdeMtto. Desde ahí manda Producción.
     3. Con Tareo de Producción, el panel vuelve a ser el espejo de solo lectura (con «Registrar / Editar salida»), avisa la copia y
        muestra tachado lo que Producción corrigió de lo que puso Mantenimiento.
   Cargar DESPUÉS de 13-tareo.js, 28-tareo-maquinistas.js, 33-rotacion-maquinistas.js y 37f-tareo-por-tecnico.js.
   ============================================================= */
(function instalarMaquinistasMantenimiento(raiz){
  'use strict';
  const CAMPOS=['asistencia','horaIngreso','salidaRefrigerio','retornoRefrigerio','horaSalida'];
  const esc=t=>typeof escaparHTML==='function'?escaparHTML(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=t=>typeof tareoNormalizarTexto==='function'?tareoNormalizarTexto(t):String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  const turnoBloque=t=>{const n=norm(t);return n.includes('noche')?'NOCHE':n.includes('intermedio')?'INTERMEDIO':'DIA';};

  /* ---------- puras ---------- */
  /** Clave estable de un maquinista: id del trabajador, DNI o nombre. */
  function claveMaq(p){
    const id=String(p&&(p.trabajadorId||p.id)||'').trim();if(id)return 'id:'+id;
    const dni=String(p&&p.dni||'').replace(/\D/g,'');if(dni)return 'dni:'+dni;
    return 'n:'+norm(p&&p.nombre);
  }
  function mismaPersona(a,b){
    if(!a||!b)return false;
    const ida=String(a.trabajadorId||'').trim(),idb=String(b.trabajadorId||'').trim();if(ida&&idb&&ida===idb)return true;
    const da=String(a.dni||'').replace(/\D/g,''),db=String(b.dni||'').replace(/\D/g,'');if(da&&db&&da===db)return true;
    return !!norm(a.nombre)&&norm(a.nombre)===norm(b.nombre);
  }
  /** Filas del panel cuando registra Mantenimiento: la rotación del turno + lo ya registrado (aunque no esté en la rotación). */
  function filasPanel(rot,guardados){
    const g=Array.isArray(guardados)?guardados:[];
    const trabajan=(rot&&rot.trabajan)||[],descansan=(rot&&rot.descansan)||[],inter=(rot&&rot.intermedio)||[];
    const filas=[],usados=new Set();
    const tomar=(p,extra)=>{const reg=g.find(x=>mismaPersona(x,p));if(reg)usados.add(reg);
      filas.push(Object.assign({trabajadorId:p.trabajadorId||'',nombre:p.nombre||'',dni:p.dni||'',linea:p.linea||''},reg||{},{_clave:claveMaq(reg||p),_registrado:!!reg},extra||{}));};
    trabajan.forEach(p=>tomar(p,{_intermedio:inter.some(x=>mismaPersona(x,p))}));
    const descanso=[];
    descansan.forEach(p=>{const reg=g.find(x=>mismaPersona(x,p));if(reg){tomar(p,{_enDescanso:true});}else descanso.push(p);});
    g.forEach(x=>{if(!usados.has(x))filas.push(Object.assign({},x,{_clave:claveMaq(x),_registrado:true,_fueraRotacion:true}));});
    return {filas,descanso};
  }
  /** Copia los maquinistas de Mantenimiento al Tareo de Producción. Solo llena filas sin asistencia; lo de Producción manda.
      Devuelve cuántos se copiaron (0 = nada que hacer). Muta produccion. */
  function copiarAProduccion(produccion,mtto,quien,ahora){
    const lista=(mtto&&Array.isArray(mtto.maquinistasMtto)?mtto.maquinistasMtto:[]).filter(x=>x&&CAMPOS.some(c=>String(x[c]||'').trim()));
    if(!produccion||!lista.length)return 0;
    const marca=produccion.maquinistasDesdeMtto||{ids:[]};
    const hechos=new Set(marca.ids||[]);
    produccion.personal=Array.isArray(produccion.personal)?produccion.personal:[];
    let n=0;
    lista.forEach(x=>{
      const k=claveMaq(x)+'@'+(x.actualizadoEn||0);
      if(hechos.has(k))return;
      let p=produccion.personal.find(y=>mismaPersona(y,x));
      const vacia=!p||!String(p.asistencia||'').trim();
      if(!p){p={trabajadorId:x.trabajadorId||'',nombre:x.nombre||'',dni:x.dni||'',tipoDocumento:x.dni?'DNI':'',cargo:x.cargo||'Maquinista de Producción',linea:x.linea||''};produccion.personal.push(p);}
      if(vacia){
        CAMPOS.forEach(c=>{if(String(x[c]||'').trim())p[c]=x[c];});
        if(x.trabajoEnDescanso)p.trabajoEnDescanso=true;
        p.registradoPorArea='Mantenimiento';p.registradoMttoPor=x.registradoPor||'';p.valoresMtto=CAMPOS.reduce((o,c)=>(o[c]=x[c]||'',o),{});
        p.actualizadoEn=ahora;
        if(typeof recalcularPersonaTareo==='function')recalcularPersonaTareo(p,produccion);
        n++;
      }
      hechos.add(k);
    });
    produccion.maquinistasDesdeMtto={ids:[...hechos],copiados:(marca.copiados||0)+n,en:n?ahora:(marca.en||0),por:n?quien:(marca.por||''),deMtto:(mtto.maquinistasMtto||[]).map(x=>x.registradoPor).filter(Boolean)[0]||marca.deMtto||''};
    return n;
  }

  /* ---------- contexto ---------- */
  /* state es «let» en 02-estado.js (no está en window): se lee por su nombre. */
  const quienSoy=()=>{try{return (state&&state.user&&(state.user.nombre||state.user.username))||'';}catch(_){return '';}};   // eslint-disable-line no-undef
  const puede=()=>typeof tareoPuedeEditarSalidaMaquinistas==='function'&&tareoPuedeEditarSalidaMaquinistas();
  const compartida=()=>typeof raiz.esMantCompartido==='function'&&raiz.esMantCompartido();
  const produccionDe=t=>typeof tareoBuscar==='function'?tareoBuscar('Producción',t.fecha,t.turno):null;
  const mttoDe=t=>typeof tareoBuscar==='function'?tareoBuscar('Mantenimiento',t.fecha,t.turno):null;
  const rotacion=t=>typeof rotacionMaquinistasDia==='function'?rotacionMaquinistasDia(t.fecha,t.turno):{tieneRotacion:false,trabajan:[],descansan:[],intermedio:[]};
  const ingresoDef=t=>String(t.horaProgramadaIngreso||'')||(turnoBloque(t.turno)==='NOCHE'?'19:00':'07:00');
  const estados=()=>{try{return TAREO_ESTADOS_ASISTENCIA;}catch(_){return ['Asistió','Tardanza','Falta por justificar','Descanso','Descanso médico','Vacaciones'];}};   // eslint-disable-line no-undef
  const arg=v=>typeof tareoArg==='function'?tareoArg(v):JSON.stringify(String(v)).replace(/"/g,'&quot;');
  /* Estados en los que se registran horas (los del tareo: Asistió, Feriado trabajado, Comisión / trabajo externo). */
  const presenteEstado=a=>{try{return TAREO_ESTADOS_PRESENTE.includes(a);}catch(_){return a==='Asistió';}};   // eslint-disable-line no-undef
  const fechaTxt=f=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(f||''));return m?m[3]+'/'+m[2]+'/'+m[1]:String(f||'');};
  const fmtH=h=>typeof formatearHoras==='function'?formatearHoras(h):(Math.round((Number(h)||0)*10)/10)+' h';

  /* ---------- panel editable (Mantenimiento sin Tareo de Producción) ---------- */
  function panelRegistro(t){
    const rot=rotacion(t),ed=puede()&&!compartida();
    const {filas,descanso}=filasPanel(rot,t.maquinistasMtto);
    const inp=(f,campo)=>ed?`<input type="time" class="tmm-in" value="${esc(f[campo]||'')}" onchange="tareoMaqMttoCampo(${arg(t.id)},${arg(f._clave)},'${campo}',this.value)" aria-label="${campo} de ${esc(f.nombre)}">`:esc(f[campo]||'—');
    const sel=f=>ed?`<select class="tmm-in" onchange="tareoMaqMttoCampo(${arg(t.id)},${arg(f._clave)},'asistencia',this.value)" aria-label="Asistencia de ${esc(f.nombre)}"><option value="">Sin registro</option>${estados().map(e=>`<option ${f.asistencia===e?'selected':''}>${esc(e)}</option>`).join('')}</select>`:esc(f.asistencia||'Sin registro');
    const origen=f=>f._registrado&&CAMPOS.some(c=>String(f[c]||'').trim())?`<span class="tmm-chip mt" title="${esc((f.registradoPor||'')+(f.actualizadoEn?' · '+new Date(f.actualizadoEn).toLocaleString('es-PE'):''))}">Mantenimiento</span>`:'<span class="tmm-chip pe">Pendiente</span>';
    const presente=f=>presenteEstado(f.asistencia);
    const filasHtml=filas.map((f,i)=>`<tr><td>${i+1}</td><td><strong>${esc(f.nombre)}</strong><small>${f.dni?'DNI: '+esc(f.dni):''}${f._fueraRotacion?' · fuera de rotación':''}${f._enDescanso?' · trabajó en descanso':''}</small></td>
      <td>${esc(f.linea||'Sin línea')}${f._intermedio?' · Intermedio':''}</td><td>${sel(f)}</td>
      <td>${presente(f)||!ed?inp(f,'horaIngreso'):'—'}</td><td>${presente(f)||!ed?inp(f,'salidaRefrigerio'):'—'}</td><td>${presente(f)||!ed?inp(f,'retornoRefrigerio'):'—'}</td><td>${presente(f)||!ed?inp(f,'horaSalida'):'—'}</td>
      <td>${f.horasTrabajadas?fmtH(f.horasTrabajadas):'—'}</td><td>${f.horasExtras?(f.horasExtras>0?'+':'')+fmtH(f.horasExtras):'—'}</td><td>${origen(f)}</td></tr>`).join('');
    const descHtml=descanso.map((p,i)=>`<tr class="tmm-desc"><td>${filas.length+i+1}</td><td><strong>${esc(p.nombre)}</strong></td><td>${esc(p.linea||'Sin línea')}</td>
      <td colspan="8"><span class="tmm-chip lock">Descanso según rotación</span>${ed?` <button type="button" class="tar2-inline-btn" onclick="tareoMaqMttoDescanso(${arg(t.id)},${arg(claveMaq(p))})">Trabajó en descanso</button>`:''}</td></tr>`).join('');
    const faltan=filas.filter(f=>!String(f.asistencia||'').trim()).length;
    return `<div class="panel tar-maq-espejo tmm-panel" id="tareo-maquinistas-espejo">
      <div class="panel-head"><div><h3>Maquinistas</h3><span class="small-muted">Producción todavía no inició su Tareo de este turno${ed?': Mantenimiento puede registrarlos':''}. Cuando Producción cree su Tareo, se le copian y desde ahí manda Producción.</span></div>
        <span class="tmm-chip mt">${ed?'✎ Registra Mantenimiento':'Registrado por Mantenimiento'}</span></div>
      <div class="panel-body">
        <div class="tmm-aviso">⚠ <b>No hay Tareo de Producción</b> para el ${esc(t.turno)} del ${esc(fechaTxt(t.fecha))}. ${rot.tieneRotacion?`Lista tomada de la <b>Rotación de maquinistas</b> de esta semana (${rot.trabajan.length} trabajan, ${rot.descansan.length} descansan).`:'<b>No hay Rotación de maquinistas</b> guardada para esta semana: agrega a los maquinistas a mano.'}</div>
        ${ed?`<div class="tmm-acc">${faltan?`<button type="button" class="btn btn-primary btn-sm" onclick="tareoMaqMttoMarcarTodos(${arg(t.id)})">✓ Marcar «Asistió» a los que faltan (${faltan}), ingreso ${esc(ingresoDef(t))}</button>`:''}<button type="button" class="btn btn-ghost btn-sm" onclick="tareoMaqMttoAgregar(${arg(t.id)})">+ Agregar maquinista (fuera de rotación)</button></div>`:''}
        ${filas.length||descanso.length?`<div class="tareo-table-scroll"><table class="tareo-table"><thead><tr><th>#</th><th>Trabajador</th><th>Línea</th><th>Asistencia</th><th>Ingreso</th><th>Salida refrigerio</th><th>Retorno refrigerio</th><th>Salida</th><th>Horas</th><th>HORAS EXTRAS</th><th>Origen</th></tr></thead><tbody>${filasHtml}${descHtml}</tbody></table></div>`
          :'<div class="empty-state"><p>No hay maquinistas para este turno.</p></div>'}
        <p class="small-muted" style="margin:8px 0 0">Se guarda al cambiar cada dato. Cada cambio queda con quién lo hizo y a qué hora. Horas y HORAS EXTRAS se calculan igual que en Producción.</p>
      </div></div>`;
  }

  /* ---------- con Tareo de Producción: avisos sobre el espejo ---------- */
  function decorarEspejo(t,prod){
    const panel=document.getElementById('tareo-maquinistas-espejo');if(!panel||!prod)return;
    const reg=Array.isArray(t.maquinistasMtto)?t.maquinistasMtto.filter(x=>CAMPOS.some(c=>String(x[c]||'').trim())):[];
    if(!reg.length)return;
    const body=panel.querySelector('.panel-body');
    const m=prod.maquinistasDesdeMtto;
    if(body){const d=document.createElement('div');d.className='tmm-aviso ok';
      d.innerHTML=m&&m.copiados?`✔ Lo registrado por Mantenimiento se copió al Tareo de Producción${m.en?' el '+esc(new Date(m.en).toLocaleString('es-PE')):''} (${m.copiados} maquinista(s)). Ahora manda Producción.`
        :`ℹ Mantenimiento registró ${reg.length} maquinista(s) antes de que existiera este Tareo de Producción. Se copiarán cuando Producción abra su tareo.`;
      body.insertBefore(d,body.firstChild);}
    // Lo que Producción corrigió de lo que puso Mantenimiento: tachado
    panel.querySelectorAll('tbody tr').forEach(tr=>{
      const nom=(tr.querySelector('strong')||{}).textContent||'';
      const p=(prod.personal||[]).find(x=>norm(x.nombre)===norm(nom));
      if(!p||!p.valoresMtto)return;
      const celdas=tr.children,col={horaIngreso:4,horaSalida:7};
      Object.entries(col).forEach(([c,i])=>{const v=p.valoresMtto[c],act=p[c];
        if(v&&act&&v!==act&&celdas[i]){celdas[i].insertAdjacentHTML('afterbegin',`<span class="tmm-tach" title="Lo que puso Mantenimiento">${esc(v)}</span> `);tr.classList.add('tmm-dif');}});
    });
  }

  /* ---------- guardado ---------- */
  function filaBase(t,clave){
    const rot=rotacion(t);
    const todos=[...(rot.trabajan||[]),...(rot.descansan||[])];
    const p=todos.find(x=>claveMaq(x)===clave)||(typeof loadWorkers==='function'?loadWorkers():[]).find(w=>claveMaq({trabajadorId:w.id,dni:w.dni,nombre:w.nombre})===clave);
    if(!p)return null;
    return {trabajadorId:String(p.trabajadorId||p.id||''),nombre:p.nombre||'',dni:p.dni||'',linea:p.linea||'',cargo:p.cargo||'Maquinista de Producción'};
  }
  async function modificarMtto(tareoId,fn,etiqueta){
    if(!puede()||compartida()){alert('Tu usuario no puede registrar maquinistas.');return;}
    if(!raiz.TareoNube){alert('Sin conexión con la nube. No se pudo guardar.');return;}
    try{
      const actualizado=await raiz.TareoNube.modificar([tareoId],ctx=>{
        const original=ctx.obtener(tareoId);if(!original)throw new Error('No se encontró el tareo.');
        const t=JSON.parse(JSON.stringify(original));
        if(typeof tareoAreaDe==='function'&&tareoAreaDe(t)!=='Mantenimiento')throw new Error('Solo en el Tareo de Mantenimiento.');
        if(produccionDe(t))throw new Error('Producción ya tiene su Tareo de este turno: los maquinistas se registran allí.');
        t.maquinistasMtto=Array.isArray(t.maquinistasMtto)?t.maquinistasMtto:[];
        fn(t);
        t.actualizadoEn=Date.now();
        ctx.guardar(t);return t;
      },{etiqueta:etiqueta||'maquinistas desde Mantenimiento'});
      const cache=typeof loadTareos==='function'?loadTareos():null;
      if(cache){const j=cache.findIndex(x=>x.id===tareoId);if(j>=0)cache[j]=actualizado;}
      repintar();
    }catch(e){
      const c=raiz.TareoNube&&raiz.TareoNube.clasificarError?raiz.TareoNube.clasificarError(e):{tipo:'',mensaje:''};
      alert('No se pudo guardar: '+(c.tipo==='validacion'||!c.mensaje?(e&&e.message?e.message:e):c.mensaje));
    }
  }
  function tocar(t,clave,cambio){
    const quien=quienSoy();
    let fila=t.maquinistasMtto.find(x=>claveMaq(x)===clave);
    if(!fila){const b=filaBase(t,clave);if(!b)throw new Error('No se encontró al maquinista.');fila=Object.assign({id:'maq-'+clave.replace(/[^\w-]/g,'_')},b);t.maquinistasMtto.push(fila);}
    cambio(fila);
    // Falta, descanso, vacaciones…: sin horas (vacío = todavía sin registrar: se conservan).
    if(fila.asistencia&&!presenteEstado(fila.asistencia))['horaIngreso','salidaRefrigerio','retornoRefrigerio','horaSalida'].forEach(c=>{fila[c]='';});
    if(typeof recalcularPersonaTareo==='function')recalcularPersonaTareo(fila,t);
    fila.registradoPor=quien;fila.actualizadoEn=Date.now();
    fila.historial=[...(Array.isArray(fila.historial)?fila.historial.slice(-19):[]),{por:quien,en:fila.actualizadoEn,cambio:Object.keys(cambio.campos||{}).join(',')}];
  }
  raiz.tareoMaqMttoCampo=(tareoId,clave,campo,valor)=>{
    if(!CAMPOS.includes(campo))return;
    if(campo!=='asistencia'&&valor&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(valor)){alert('Indica una hora válida.');return;}
    const f=fila=>{fila[campo]=valor;};f.campos={[campo]:1};
    return modificarMtto(tareoId,t=>tocar(t,clave,f));
  };
  raiz.tareoMaqMttoMarcarTodos=tareoId=>{
    const t=(typeof obtenerTareos==='function'?obtenerTareos():[]).find(x=>x.id===tareoId);if(!t)return;
    const ing=ingresoDef(t);
    const {filas}=filasPanel(rotacion(t),t.maquinistasMtto);
    const claves=filas.filter(f=>!String(f.asistencia||'').trim()).map(f=>f._clave);
    if(!claves.length)return;
    return modificarMtto(tareoId,x=>claves.forEach(k=>{const f=fila=>{fila.asistencia='Asistió';if(!fila.horaIngreso)fila.horaIngreso=ing;};f.campos={asistencia:1,horaIngreso:1};tocar(x,k,f);}),'maquinistas: marcar asistencia');
  };
  raiz.tareoMaqMttoDescanso=(tareoId,clave)=>{const f=fila=>{fila.trabajoEnDescanso=true;};f.campos={trabajoEnDescanso:1};return modificarMtto(tareoId,t=>tocar(t,clave,f),'maquinista: trabajó en descanso');};
  raiz.tareoMaqMttoAgregar=tareoId=>{
    const t=(typeof obtenerTareos==='function'?obtenerTareos():[]).find(x=>x.id===tareoId);if(!t)return;
    const {filas}=filasPanel(rotacion(t),t.maquinistasMtto);
    const ws=(typeof loadWorkers==='function'?loadWorkers():[]).filter(w=>w&&!/inactiv|cesad|baja/i.test(String(w.estado||''))&&(typeof tareoEsMaquinistaEquipo==='function'?tareoEsMaquinistaEquipo(w.cargo||''):/maquinista/i.test(w.cargo||'')))
      .filter(w=>!filas.some(f=>mismaPersona(f,{trabajadorId:String(w.id),dni:w.dni,nombre:w.nombre}))).sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),'es'));
    const root=document.getElementById('modal-root');if(!root)return;
    root.innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal"><div class="modal-head"><h3>Agregar maquinista</h3><button class="modal-close" onclick="closeModal()" aria-label="Cerrar">✕</button></div>
      <div class="modal-body">${ws.length?`<div class="field-sm"><label for="tmm-w">Maquinista (fuera de la rotación de este turno)</label><select id="tmm-w">${ws.map(w=>`<option value="${esc(claveMaq({trabajadorId:String(w.id),dni:w.dni,nombre:w.nombre}))}">${esc(w.nombre)}${w.linea?' · '+esc(w.linea):''}</option>`).join('')}</select></div>
        <div class="actions-row"><button class="btn btn-primary" onclick="tareoMaqMttoAgregarOk(${arg(tareoId)})">Agregar</button></div>`:'<p>No hay más maquinistas activos para agregar.</p>'}</div></div></div>`;
  };
  raiz.tareoMaqMttoAgregarOk=tareoId=>{const v=(document.getElementById('tmm-w')||{}).value;if(!v)return;if(typeof closeModal==='function')closeModal();
    const f=fila=>{if(!fila.asistencia)fila.asistencia='';};f.campos={agregado:1};return modificarMtto(tareoId,t=>tocar(t,v,f),'maquinista agregado');};

  /* ---------- copia al Tareo de Producción (al abrirlo quien puede editarlo) ---------- */
  const enCopia=new Set();
  async function copiarSiHaceFalta(prod){
    if(!prod||enCopia.has(prod.id)||!raiz.TareoNube)return;
    if(typeof tareoPuedeEditar==='function'&&!tareoPuedeEditar(prod))return;
    const mt=mttoDe(prod);
    if(!mt||!Array.isArray(mt.maquinistasMtto)||!mt.maquinistasMtto.length)return;
    const prueba=JSON.parse(JSON.stringify(prod));
    if(!copiarAProduccion(prueba,mt,'',0)&&JSON.stringify((prueba.maquinistasDesdeMtto||{}).ids)===JSON.stringify(((prod.maquinistasDesdeMtto)||{}).ids))return;
    enCopia.add(prod.id);
    try{
      const quien=quienSoy();
      const act=await raiz.TareoNube.modificar([prod.id],ctx=>{const o=ctx.obtener(prod.id);if(!o)throw new Error('No se encontró el tareo.');const t=JSON.parse(JSON.stringify(o));
        copiarAProduccion(t,mttoDe(t)||mt,quien,Date.now());t.actualizadoEn=Date.now();ctx.guardar(t);return t;},{etiqueta:'maquinistas copiados desde Mantenimiento'});
      const cache=typeof loadTareos==='function'?loadTareos():null;if(cache){const j=cache.findIndex(x=>x.id===prod.id);if(j>=0)cache[j]=act;}
      repintar();
    }catch(e){console.warn('Maquinistas desde Mantenimiento: no se pudo copiar al Tareo de Producción:',e&&e.message||e);}
    finally{setTimeout(()=>enCopia.delete(prod.id),5000);}
  }
  function avisoProduccion(t){
    const panel=document.getElementById('tareo-maquinistas-panel');const m=t.maquinistasDesdeMtto;
    if(!panel||!m||!m.copiados)return;
    const d=document.createElement('div');d.className='tmm-aviso az';
    d.innerHTML=`ℹ <b>${m.copiados} maquinista(s) registrados por Mantenimiento</b>${m.deMtto?' ('+esc(m.deMtto)+')':''} se cargaron en este tareo. Revísalos: desde ahora los datos de los maquinistas se editan aquí.`;
    const head=panel.querySelector('.panel-head');if(head)head.insertAdjacentElement('afterend',d);
    panel.querySelectorAll('tbody tr').forEach(tr=>{const s=tr.querySelector('strong');if(!s)return;const p=(t.personal||[]).find(x=>norm(x.nombre)===norm(s.textContent));
      if(p&&p.registradoPorArea==='Mantenimiento')s.insertAdjacentHTML('afterend',' <span class="tmm-chip mt">Mantenimiento</span>');});
  }

  /* ---------- pintado ---------- */
  function repintar(){
    const actual=typeof tareoObtenerActual==='function'?tareoObtenerActual():null;if(!actual)return;
    if(typeof tareoPuedeEditar==='function'&&tareoPuedeEditar(actual))raiz.renderTareoFormulario(actual);else raiz.renderTareoLectura(actual);
  }
  function despues(t){
    if(!t||typeof document==='undefined')return;
    const area=typeof tareoAreaDe==='function'?tareoAreaDe(t):t.area;
    if(area==='Producción'){avisoProduccion(t);copiarSiHaceFalta(t);return;}
    if(area!=='Mantenimiento'||compartida())return;
    if(turnoBloque(t.turno)==='INTERMEDIO')return;
    const prod=produccionDe(t);
    if(prod){decorarEspejo(t,prod);return;}
    const viejo=document.getElementById('tareo-maquinistas-espejo');
    const nuevo=document.createElement('div');nuevo.innerHTML=panelRegistro(t);
    if(viejo)viejo.replaceWith(nuevo.firstElementChild);
    else{const main=document.getElementById('main');if(main)main.appendChild(nuevo.firstElementChild);}
  }
  function estilos(){
    if(typeof document==='undefined'||document.getElementById('tmm-estilos'))return;
    const s=document.createElement('style');s.id='tmm-estilos';
    s.textContent=`.tmm-chip{display:inline-block;font-size:11.5px;font-weight:800;padding:3px 9px;border-radius:20px;white-space:nowrap}
.tmm-chip.mt{background:#E0F2FE;color:#075985}.tmm-chip.pe{background:#FEF3C7;color:#92400E}.tmm-chip.lock{background:#EEF2F5;color:#475569}
.tmm-aviso{margin:0 0 10px;padding:10px 12px;border-radius:8px;font-size:13.5px;line-height:1.45;background:#FFF7E6;border:1px solid #F5C26B;color:#7A4A00}
.tmm-aviso.ok{background:#ECFDF3;border-color:#9AD3B0;color:#14532D}.tmm-aviso.az{background:#EEF6FB;border-color:#BFDDEF;color:#0F3A55;margin:10px 14px 0}
.tmm-acc{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px}.tmm-in{min-height:36px;max-width:130px}.tmm-desc td{background:#FAFBFC;color:#6B7280}
.tmm-tach{text-decoration:line-through;color:#9AA7B1}.tmm-dif td{background:#FFFBF0}
.tmm-panel td small{display:block;color:#6B7280;font-size:11px}`;
    document.head.appendChild(s);
  }
  if(typeof document!=='undefined'){
    ['renderTareoFormulario','renderTareoLectura'].forEach(nombre=>{
      const original=raiz[nombre];if(typeof original!=='function')return;
      const envuelta=function(tareo){const r=original.apply(this,arguments);try{estilos();despues(tareo);}catch(e){console.warn('Maquinistas desde Mantenimiento:',e);}return r;};
      raiz[nombre]=envuelta;
    });
  }

  const API={claveMaq,mismaPersona,filasPanel,copiarAProduccion,panelRegistro,CAMPOS};
  raiz.glacialMaquinistasMtto=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
