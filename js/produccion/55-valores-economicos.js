/* =============================================================
   VALORES UNITARIOS Y ACCESO ECONÓMICO (protegidos por UID)

   Quién ve qué se decide por el UID de Firebase Auth, NO por el rol (el Administrador asigna roles y permisos, por
   eso el rol no basta). La lista vive en el documento accesoEconomico/{UID}, que solo se crea desde Firebase Console:
     accesoEconomico/{UID} → { nivel: 'gerencia' | 'jefatura', nombre, desde }
   Las reglas de Firestore (firestore.rules.etapa2.txt) hacen cumplir lo siguiente; esta pantalla solo los usa:
     · Gerencia: lee y escribe valoresUnitarios y lee valoresUnitariosHistorial.
     · Jefatura, Administrador, supervisores y demás: permission-denied en valoresUnitarios, su historial y la
       colección anterior configEconomica. Sus navegadores NO abren ninguna escucha hacia esos documentos: este archivo
       solo escucha su propio accesoEconomico/{su UID} (un documento mínimo con el nivel) y, si el nivel es
       'gerencia', valoresUnitarios.

   valoresUnitarios/{id}  (un documento por línea + marca + presentación, o por línea + insumo, o la meta)
     tipo ('producto' | 'insumo' | 'meta'), linea, marca, presentacion (categoría: 625 ml, 1 L…), componente, unidad,
     clave, valorUnitario (el vigente hoy), fechaVigencia (desde cuándo), vigencias {AAAA-MM-DD: valor},
     activo, version, actualizadoPorUid, fechaActualizacion (hora del servidor).
   valoresUnitariosHistorial/{id_version}  solo se crea: valor anterior, valor nuevo, UID y hora del servidor.
   Cada cambio es una transacción que sube la versión y crea su historial; las reglas rechazan un cambio sin su historial.
   Cargar después de 50-impacto-economico.js.
   ============================================================= */
(function(){
  'use strict';

  const COL_VAL='valoresUnitarios',COL_HIST='valoresUnitariosHistorial',COL_ACC='accesoEconomico';
  const A=()=>window.glacialReporteIndicadores;
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  const normKey=t=>norm(t).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtS=n=>'S/ '+num(n).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:3});
  const fmtFecha=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''))?f.slice(8,10)+'/'+f.slice(5,7)+'/'+f.slice(0,4):String(f||'');
  const ahoraMs=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const hoy=()=>{const d=new Date(ahoraMs());return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
  const fechaOk=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''));
  const COMPONENTES=['Botellas','Preformas','Tapas','Etiquetas','Polietileno'];

  /* ---------- claves ---------- */
  const claveProducto=(linea,marca,pres)=>normKey(linea)+'__'+normKey(marca)+'__'+normKey(pres);
  const claveInsumo=(linea,comp)=>normKey(linea)+'--'+normKey(comp);
  const idProducto=(linea,marca,pres)=>'P__'+claveProducto(linea,marca,pres);
  const idInsumo=(linea,comp)=>'I__'+claveInsumo(linea,comp);
  const ID_META='META__perdida-mensual';

  /* ---------- estado ---------- */
  let nivel=null,accesoListo=false,listoValores=false,errorValores='';
  let items=[];
  const DOCS={margenes:{valores:{}},costos:{valores:{}},general:{}};
  let cierreAcceso=null,cierreValores=null;
  const oyentes=[];
  const avisar=()=>{oyentes.forEach(f=>{try{f();}catch(_){/* oyente ajeno */}});};

  function vigenteDe(it,fecha){
    let mejor=null;
    Object.keys(it.vigencias||{}).sort().forEach(d=>{if(d<=fecha&&Number.isFinite(Number(it.vigencias[d])))mejor={desde:d,valor:Number(it.vigencias[d])};});
    return mejor;
  }
  function reconstruir(){
    DOCS.margenes={valores:{}};DOCS.costos={valores:{}};DOCS.general={};
    items.forEach(it=>{
      if(it.activo===false)return;
      const v={};Object.keys(it.vigencias||{}).forEach(d=>{v[d]={valor:Number(it.vigencias[d])};});
      if(it.tipo==='producto')DOCS.margenes.valores[it.clave]={etiqueta:it.marca+' · '+it.presentacion+' ('+it.linea+')',v};
      else if(it.tipo==='insumo')DOCS.costos.valores[it.clave]={etiqueta:it.linea+' · '+it.componente,v};
      else if(it.tipo==='meta')DOCS.general={metaPerdidaMes:num(it.valorUnitario)};
    });
  }

  /* ---------- escuchas: solo el propio acceso; los valores, únicamente si el nivel es 'gerencia' ---------- */
  function cerrarValores(){
    if(cierreValores){try{cierreValores();}catch(_){/* ya cerrada */}}
    cierreValores=null;items=[];listoValores=false;errorValores='';reconstruir();
  }
  function cerrarTodo(){
    if(cierreAcceso){try{cierreAcceso();}catch(_){/* ya cerrada */}}
    cierreAcceso=null;cerrarValores();nivel=null;accesoListo=false;
  }
  function abrirValores(){
    if(cierreValores||typeof db==='undefined')return;
    cierreValores=db.collection(COL_VAL).onSnapshot(snap=>{
      items=snap.docs.map(d=>Object.assign({id:d.id},d.data()));
      reconstruir();listoValores=true;errorValores='';avisar();
    },e=>{errorValores='No se pudieron leer los valores unitarios: '+((e&&e.message)||e);listoValores=true;avisar();});
  }
  function fijarNivel(n){
    const nuevo=(n==='gerencia'||n==='jefatura')?n:null;
    const cambio=nuevo!==nivel||!accesoListo;
    nivel=nuevo;accesoListo=true;
    if(nivel==='gerencia')abrirValores();else cerrarValores();
    if(cambio)avisar();
  }
  window.glacialEconomicoEscuchas=function(){
    cerrarTodo();
    if(typeof db==='undefined'||typeof state==='undefined'||!state.user)return;
    if(typeof esMantCompartido==='function'&&esMantCompartido(state.user)){accesoListo=true;return;}
    let uid='';
    try{uid=(typeof auth!=='undefined'&&auth&&auth.currentUser&&auth.currentUser.uid)||'';}catch(_){uid='';}
    if(!uid){accesoListo=true;return;}
    cierreAcceso=db.collection(COL_ACC).doc(uid).onSnapshot(
      snap=>fijarNivel(snap.exists?snap.data().nivel:null),
      ()=>fijarNivel(null));
  };
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(cerrarTodo);

  /* =========================================================
     ESCRITURA: una transacción por valor (versión + historial); nunca se sobrescribe el documento completo
     ========================================================= */
  async function guardar(d){
    if(nivel!=='gerencia')throw new Error('Solo Gerencia puede registrar valores unitarios.');
    const valor=Number(d.valor);
    if(!Number.isFinite(valor)||valor<0)throw new Error('El valor debe ser un número mayor o igual que cero.');
    const fecha=d.fecha||hoy();
    if(!fechaOk(fecha))throw new Error('La fecha de vigencia no es válida.');
    let id,base;
    if(d.tipo==='producto'){
      if(!d.linea||!d.marca||!d.presentacion)throw new Error('Elige línea, marca y presentación.');
      id=idProducto(d.linea,d.marca,d.presentacion);
      base={tipo:'producto',linea:d.linea,marca:d.marca,presentacion:d.presentacion,clave:claveProducto(d.linea,d.marca,d.presentacion)};
    }else if(d.tipo==='insumo'){
      if(!d.linea||!d.componente)throw new Error('Elige línea y componente.');
      id=idInsumo(d.linea,d.componente);
      base={tipo:'insumo',linea:d.linea,componente:d.componente,unidad:d.componente==='Polietileno'?'kg':'unidad',clave:claveInsumo(d.linea,d.componente)};
    }else if(d.tipo==='meta'){
      id=ID_META;base={tipo:'meta',clave:'meta'};
    }else throw new Error('Tipo de valor desconocido.');
    const uid=(auth&&auth.currentUser&&auth.currentUser.uid)||'';
    if(!uid)throw new Error('No hay sesión activa.');
    const ref=db.collection(COL_VAL).doc(id);
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      const prev=snap.exists?snap.data():null;
      const version=(prev?num(prev.version):0)+1;
      const vigencias=Object.assign({},prev&&prev.vigencias||{},{[fecha]:valor});
      const vig=vigenteDe({vigencias},hoy());
      const nuevo=Object.assign({},base,{
        valorUnitario:vig?vig.valor:valor,fechaVigencia:vig?vig.desde:fecha,vigencias:{[fecha]:valor},
        activo:d.activo!==false,version,actualizadoPorUid:uid,fechaActualizacion:firebase.firestore.FieldValue.serverTimestamp()
      });
      // set con merge: solo se tocan estos campos y la vigencia nueva; las vigencias anteriores del mapa se conservan.
      tx.set(ref,nuevo,{merge:true});
      tx.set(db.collection(COL_HIST).doc(id+'_'+version),{
        valorId:id,tipo:base.tipo,linea:base.linea||'',marca:base.marca||'',presentacion:base.presentacion||'',componente:base.componente||'',
        version,valorAnterior:prev?num(prev.valorUnitario):null,valorNuevo:valor,fechaVigenciaNueva:fecha,activo:d.activo!==false,
        uid,timestamp:firebase.firestore.FieldValue.serverTimestamp()
      });
    });
  }
  async function leerHistorial(id){
    if(nivel!=='gerencia')throw new Error('Solo Gerencia puede consultar el historial.');
    const snap=await db.collection(COL_HIST).where('valorId','==',id).get();
    return snap.docs.map(d=>Object.assign({id:d.id},d.data())).sort((a,b)=>num(b.version)-num(a.version));
  }

  /* =========================================================
     MIGRACIÓN: pasa a la estructura nueva los valores de configEconomica (margen por producto, costo por insumo, meta).
     Solo Gerencia la puede leer. Los precios por línea de sync/precios se muestran como referencia (no son márgenes).
     ========================================================= */
  async function migrarAnteriores(){
    if(nivel!=='gerencia')throw new Error('Solo Gerencia puede migrar los valores.');
    const I=A();
    const [mS,cS,gS,pS]=await Promise.all(['margenes','costos','general'].map(n=>db.collection('configEconomica').doc(n).get()).concat([db.collection('sync').doc('precios').get()]));
    const margenes=(mS.exists&&mS.data().valores)||{},costos=(cS.exists&&cS.data().valores)||{};
    const meta=gS.exists?num(gS.data().metaPerdidaMes):0;
    const precios=(pS.exists&&pS.data().items)||{};
    const informe={productos:0,insumos:0,meta:false,sinLinea:[],precios};
    // Productos: el margen anterior era por producto (marca + presentación), sin línea; se copia a cada línea donde ese producto aparece.
    const hasta=hoy(),desde=I.addDias(hasta,-365);
    const rec=I.recolectar(desde,hasta,{linea:''});
    const combos=new Map();
    rec.partes.forEach(p=>{
      const k=normKey(p.pkey);
      if(!margenes[k])return;
      combos.set(claveProducto(p.linea,p.marcaN,p.cat),{k,linea:p.linea,marca:p.marcaN,presentacion:p.cat});
    });
    const usados=new Set();
    for(const c of combos.values()){
      usados.add(c.k);
      const v=margenes[c.k].v||{};
      for(const f of Object.keys(v).sort()){
        const valor=Number(v[f]&&v[f].valor);
        if(Number.isFinite(valor)){await guardar({tipo:'producto',linea:c.linea,marca:c.marca,presentacion:c.presentacion,valor,fecha:f});}
      }
      informe.productos++;
    }
    Object.keys(margenes).forEach(k=>{if(!usados.has(k))informe.sinLinea.push((margenes[k]&&margenes[k].etiqueta)||k);});
    const lineas=(typeof LINES!=='undefined'?LINES:[]).map(l=>l.key);
    for(const k of Object.keys(costos)){
      const [lk,ck]=k.split('--');
      const linea=lineas.find(l=>normKey(l)===lk),comp=COMPONENTES.find(c=>normKey(c)===ck);
      if(!linea||!comp){informe.sinLinea.push((costos[k]&&costos[k].etiqueta)||k);continue;}
      const v=costos[k].v||{};
      for(const f of Object.keys(v).sort()){
        const valor=Number(v[f]&&v[f].valor);
        if(Number.isFinite(valor))await guardar({tipo:'insumo',linea,componente:comp,valor,fecha:f});
      }
      informe.insumos++;
    }
    if(meta>0){await guardar({tipo:'meta',valor:meta});informe.meta=true;}
    return informe;
  }

  /* =========================================================
     PANTALLA «VALORES UNITARIOS» (solo Gerencia)
     ========================================================= */
  const CSS=`
    .vu-fondo{position:fixed;inset:0;background:rgba(10,30,50,.6);z-index:10060;display:flex;align-items:flex-start;justify-content:center;padding:12px;overflow:auto}
    .vu-panel{background:#fff;border-radius:12px;width:100%;max-width:980px;padding:16px;margin:auto 0;box-shadow:0 18px 55px rgba(0,0,0,.3)}
    .vu-cab{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
    .vu-cab h3{margin:0;color:#003b5c}
    .vu-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0;border-bottom:1px solid #d9e2e8}
    .vu-tab{border:0;background:none;padding:8px 12px;font:inherit;font-weight:700;color:#5a6b78;cursor:pointer;border-bottom:3px solid transparent}
    .vu-tab.on{color:#003b5c;border-bottom-color:#005b96}
    .vu-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;align-items:end;margin:8px 0 12px}
    .vu-form label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:#5a6b78}
    .vu-form input,.vu-form select{padding:9px 8px;border:1px solid #cfdbe3;border-radius:7px;font:inherit;min-height:40px}
    .vu-tabla{width:100%;border-collapse:collapse;font-size:13px}
    .vu-tabla th{background:#eef3f7;text-align:left;padding:8px;font-size:12px;color:#3d5365}
    .vu-tabla td{padding:8px;border-bottom:1px solid #edf1f4}
    .vu-scroll{overflow-x:auto}
    .vu-error{color:#c62828;font-size:12px;min-height:16px;margin:6px 0;white-space:pre-line}
    .vu-ok{color:#1e7f4e;font-size:12px}
    .vu-btn{border:1px solid #cfdbe3;background:#fff;border-radius:8px;padding:9px 14px;font:inherit;font-weight:600;cursor:pointer;min-height:40px}
    .vu-btn.p{background:#005b96;color:#fff;border-color:#005b96}
    @media(max-width:640px){.vu-panel{padding:12px}.vu-tabla td:nth-child(1),.vu-tabla th:nth-child(1){display:none}}
  `;
  function estilos(){if(document.getElementById('vu-css'))return;const s=document.createElement('style');s.id='vu-css';s.textContent=CSS;document.head.appendChild(s);}
  const lineasLista=()=>typeof LINES!=='undefined'?LINES:[];
  function marcasDe(linea){
    const set=new Map();
    ((typeof MARCAS_POR_LINEA!=='undefined'&&MARCAS_POR_LINEA[linea])||[]).forEach(m=>{const c=A().marcaCanon(m);set.set(c,c);});
    return [...set.values()].sort((a,b)=>a.localeCompare(b,'es'));
  }
  function presentacionesDe(linea,marca){
    const set=new Set();
    ((typeof PRESENTACIONES_POR_LINEA!=='undefined'&&PRESENTACIONES_POR_LINEA[linea])||[]).forEach(p=>{const c=A().catPres(linea,p,marca);if(c&&c!=='Otras')set.add(c);});
    const orden=A().ORDEN_PRES||[];
    return [...set].sort((a,b)=>(orden.indexOf(a)<0?99:orden.indexOf(a))-(orden.indexOf(b)<0?99:orden.indexOf(b)));
  }

  function abrirPantalla(){
    if(nivel!=='gerencia'){alert('Los valores unitarios están reservados a Gerencia.');return;}
    estilos();
    const fondo=document.createElement('div');fondo.className='vu-fondo';
    fondo.innerHTML='<div class="vu-panel" role="dialog" aria-modal="true"><div class="vu-cab"><h3>Valores unitarios</h3><div><button type="button" class="vu-btn" data-vu-migrar>Importar valores anteriores</button> <button type="button" class="vu-btn" data-vu-x>Cerrar</button></div></div>'+
      '<div class="vu-tabs"><button type="button" class="vu-tab on" data-vu-tab="producto">Productos</button><button type="button" class="vu-tab" data-vu-tab="insumo">Insumos de merma</button><button type="button" class="vu-tab" data-vu-tab="meta">Meta mensual</button></div>'+
      '<div id="vu-cuerpo"></div></div>';
    document.body.appendChild(fondo);
    let tab='producto',edit=null;
    const cuerpo=fondo.querySelector('#vu-cuerpo');
    const pintar=()=>{
      fondo.querySelectorAll('[data-vu-tab]').forEach(b=>b.classList.toggle('on',b.getAttribute('data-vu-tab')===tab));
      if(tab==='producto')pintarProductos();else if(tab==='insumo')pintarInsumos();else pintarMeta();
    };
    const opts=(lista,sel,vacio)=>(vacio?'<option value="">'+vacio+'</option>':'')+lista.map(x=>{const v=typeof x==='string'?x:x.v,t=typeof x==='string'?x:x.t;return '<option value="'+esc(v)+'"'+(v===sel?' selected':'')+'>'+esc(t)+'</option>';}).join('');
    const msg=t=>{const e=cuerpo.querySelector('[data-vu-msg]');if(e)e.innerHTML=t;};
    function pintarProductos(){
      const e=edit||{linea:(lineasLista()[0]||{}).key||'',marca:'',presentacion:'',valor:'',fecha:hoy(),activo:true};
      const filas=items.filter(i=>i.tipo==='producto').sort((a,b)=>(a.linea+a.marca+a.presentacion).localeCompare(b.linea+b.marca+b.presentacion,'es'));
      cuerpo.innerHTML='<div class="vu-form">'+
        '<label>Línea<select data-vu-f="linea">'+opts(lineasLista().map(l=>({v:l.key,t:l.name})),e.linea)+'</select></label>'+
        '<label>Marca<select data-vu-f="marca">'+opts(marcasDe(e.linea),e.marca,'Selecciona…')+'</select></label>'+
        '<label>Presentación<select data-vu-f="presentacion">'+opts(presentacionesDe(e.linea,e.marca),e.presentacion,'Selecciona…')+'</select></label>'+
        '<label>Valor unitario (S/ por unidad)<input type="number" min="0" step="0.001" inputmode="decimal" data-vu-f="valor" value="'+esc(e.valor)+'"></label>'+
        '<label>Vigente desde<input type="date" data-vu-f="fecha" value="'+esc(e.fecha)+'"></label>'+
        '<label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" data-vu-f="activo"'+(e.activo!==false?' checked':'')+'> Activo</label>'+
        '<button type="button" class="vu-btn p" data-vu-guardar="producto">Guardar</button></div><div class="vu-error" data-vu-msg></div>'+
        '<div class="vu-scroll"><table class="vu-tabla"><thead><tr><th>Línea</th><th>Marca</th><th>Presentación</th><th>Valor vigente</th><th>Desde</th><th>Activo</th><th></th></tr></thead><tbody>'+
        (filas.length?filas.map(i=>'<tr><td>'+esc(i.linea)+'</td><td>'+esc(i.marca)+'</td><td>'+esc(i.presentacion)+'</td><td>'+fmtS(i.valorUnitario)+'</td><td>'+fmtFecha(i.fechaVigencia)+'</td><td>'+(i.activo===false?'No':'Sí')+'</td><td><button type="button" class="vu-btn" data-vu-editar="'+esc(i.id)+'">Editar</button> <button type="button" class="vu-btn" data-vu-hist="'+esc(i.id)+'">Historial</button></td></tr>').join(''):'<tr><td colspan="7">Todavía no hay valores. Elige línea, marca y presentación arriba, o usa «Importar valores anteriores».</td></tr>')+'</tbody></table></div>';
      cuerpo._estado=e;
    }
    function pintarInsumos(){
      const filas=items.filter(i=>i.tipo==='insumo').sort((a,b)=>(a.linea+a.componente).localeCompare(b.linea+b.componente,'es'));
      cuerpo.innerHTML='<div class="vu-form">'+
        '<label>Línea<select data-vu-f="linea">'+opts(lineasLista().map(l=>({v:l.key,t:l.name})),(lineasLista()[0]||{}).key)+'</select></label>'+
        '<label>Componente<select data-vu-f="componente">'+opts(COMPONENTES,'')+'</select></label>'+
        '<label>Costo unitario (S/ por unidad; polietileno por kg)<input type="number" min="0" step="0.001" inputmode="decimal" data-vu-f="valor"></label>'+
        '<label>Vigente desde<input type="date" data-vu-f="fecha" value="'+hoy()+'"></label>'+
        '<button type="button" class="vu-btn p" data-vu-guardar="insumo">Guardar</button></div><div class="vu-error" data-vu-msg></div>'+
        '<div class="vu-scroll"><table class="vu-tabla"><thead><tr><th>Línea</th><th>Componente</th><th>Costo vigente</th><th>Desde</th><th></th></tr></thead><tbody>'+
        (filas.length?filas.map(i=>'<tr><td>'+esc(i.linea)+'</td><td>'+esc(i.componente)+'</td><td>'+fmtS(i.valorUnitario)+' <small>por '+esc(i.unidad)+'</small></td><td>'+fmtFecha(i.fechaVigencia)+'</td><td><button type="button" class="vu-btn" data-vu-hist="'+esc(i.id)+'">Historial</button></td></tr>').join(''):'<tr><td colspan="5">Sin costos cargados.</td></tr>')+'</tbody></table></div>';
    }
    function pintarMeta(){
      const m=items.find(i=>i.tipo==='meta');
      cuerpo.innerHTML='<div class="vu-form"><label>Meta máxima de pérdida mensual (S/)<input type="number" min="0" step="1" inputmode="decimal" data-vu-f="valor" value="'+esc(m?m.valorUnitario:'')+'"></label>'+
        '<button type="button" class="vu-btn p" data-vu-guardar="meta">Guardar</button>'+(m?'<button type="button" class="vu-btn" data-vu-hist="'+esc(m.id)+'">Historial</button>':'')+'</div><div class="vu-error" data-vu-msg></div>';
    }
    const leerForm=()=>{const o={};cuerpo.querySelectorAll('[data-vu-f]').forEach(el=>{o[el.getAttribute('data-vu-f')]=el.type==='checkbox'?el.checked:el.value;});return o;};
    fondo.addEventListener('change',ev=>{
      const el=ev.target.closest('[data-vu-f]');
      if(!el||tab!=='producto')return;
      edit=Object.assign({},leerForm());
      if(el.getAttribute('data-vu-f')==='linea'){edit.marca='';edit.presentacion='';}
      if(el.getAttribute('data-vu-f')==='marca')edit.presentacion='';
      pintar();
    });
    fondo.addEventListener('click',async ev=>{
      const t=ev.target;
      if(t.closest('[data-vu-x]')||t===fondo){fondo.remove();return;}
      const pestana=t.closest('[data-vu-tab]');
      if(pestana){tab=pestana.getAttribute('data-vu-tab');edit=null;pintar();return;}
      const editar=t.closest('[data-vu-editar]');
      if(editar){const i=items.find(x=>x.id===editar.getAttribute('data-vu-editar'));if(i){edit={linea:i.linea,marca:i.marca,presentacion:i.presentacion,valor:i.valorUnitario,fecha:hoy(),activo:i.activo!==false};pintar();}return;}
      const hist=t.closest('[data-vu-hist]');
      if(hist){
        try{
          const lista=await leerHistorial(hist.getAttribute('data-vu-hist'));
          const h=document.createElement('div');h.className='vu-fondo';h.style.zIndex=10070;
          h.innerHTML='<div class="vu-panel" style="max-width:760px"><div class="vu-cab"><h3>Historial de cambios</h3><button type="button" class="vu-btn" data-vu-hx>Cerrar</button></div><div class="vu-scroll"><table class="vu-tabla"><thead><tr><th>Fecha y hora</th><th>Anterior</th><th>Nuevo</th><th>Vigente desde</th><th>UID</th></tr></thead><tbody>'+
            (lista.length?lista.map(x=>'<tr><td>'+esc(x.timestamp&&x.timestamp.toMillis?new Date(x.timestamp.toMillis()).toLocaleString('es-PE'):'')+'</td><td>'+(x.valorAnterior==null?'—':fmtS(x.valorAnterior))+'</td><td>'+fmtS(x.valorNuevo)+'</td><td>'+fmtFecha(x.fechaVigenciaNueva)+'</td><td><small>'+esc(x.uid)+'</small></td></tr>').join(''):'<tr><td colspan="5">Sin cambios registrados.</td></tr>')+'</tbody></table></div></div>';
          h.addEventListener('click',e2=>{if(e2.target===h||e2.target.closest('[data-vu-hx]'))h.remove();});
          document.body.appendChild(h);
        }catch(e){msg(esc((e&&e.message)||e));}
        return;
      }
      if(t.closest('[data-vu-migrar]')){
        if(!confirm('Se copiarán a la estructura nueva los valores de la versión anterior (margen por producto, costo de insumos y meta). No se borra nada. ¿Continuar?'))return;
        try{
          msg('Importando…');
          const r=await migrarAnteriores();
          const ref=Object.keys(r.precios).length?'\nPrecios por línea anteriores (solo referencia, no son márgenes): '+Object.keys(r.precios).map(k=>k+' '+fmtS(r.precios[k])).join(' · '):'';
          alert('Importados: '+r.productos+' producto(s), '+r.insumos+' insumo(s)'+(r.meta?' y la meta':'')+'.'+(r.sinLinea.length?'\nSin línea asignable (cárgalos a mano): '+r.sinLinea.join(', '):'')+ref);
          pintar();
        }catch(e){msg(esc((e&&e.message)||e));}
        return;
      }
      const g=t.closest('[data-vu-guardar]');
      if(g){
        const f=leerForm();
        try{
          msg('Guardando…');
          await guardar(Object.assign({tipo:g.getAttribute('data-vu-guardar')},f));
          edit=null;tab=g.getAttribute('data-vu-guardar')==='meta'?'meta':tab;pintar();msg('<span class="vu-ok">Guardado. Se ve al instante en tus otros dispositivos.</span>');
        }catch(e){msg(esc((e&&e.message)||e));}
      }
    });
    // Se repinta cuando llega un cambio de otro dispositivo (si no se está escribiendo).
    const oy=()=>{if(!document.body.contains(fondo)){const i=oyentes.indexOf(oy);if(i>=0)oyentes.splice(i,1);return;}if(!cuerpo.contains(document.activeElement)||document.activeElement.tagName==='BODY')pintar();};
    oyentes.push(oy);
    pintar();
  }

  window.glacialEconomico={
    nivel:()=>nivel,esGerencia:()=>nivel==='gerencia',esJefatura:()=>nivel==='jefatura',accesoListo:()=>accesoListo,
    listo:()=>nivel==='gerencia'&&listoValores,error:()=>errorValores,docs:()=>DOCS,
    alCambiar:f=>{if(typeof f==='function')oyentes.push(f);},
    guardar,historial:leerHistorial,migrar:migrarAnteriores,abrirPantalla,
    claveProducto,claveInsumo
  };
})();
