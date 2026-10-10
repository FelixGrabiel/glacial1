/* =============================================================
   VALORES UNITARIOS Y ACCESO ECONÓMICO (protegidos por rol)

   Quién ve y quién edita lo decide un PERMISO EXPLÍCITO por usuario (users[].economico = {ver, gestionar}); el ROL solo define quién es elegible:
     · ver (montos en soles)               → Gerencia (Gerente General, Gerente), Jefatura (Jefe de Producción, Jefe de Operaciones, Jefatura) y
                                              Administrador (temporal, a solicitud del usuario).
     · gestionar (valores unitarios y publicación de resultados) → Gerencia y Administrador (temporal).
     · «Todos los permisos», los permisos de visualización y los operativos NO conceden nada de esto.
     · Compatibilidad: una cuenta de Gerencia SIN el campo economico conserva el acceso que ya tenía (ver y gestionar) hasta que Administración
       le asigne permisos explícitos; Jefatura y Administrador necesitan el permiso explícito (no se concede nada por migración).
   Las reglas de Firestore (firestore.rules.etapa2.txt) leen el mismo permiso desde sync/perfiles[uid].eco y hacen cumplir:
     · gestionar: lee y escribe valoresUnitarios, lee su historial y publica resultadosEconomicos.
     · ver: lee resultadosEconomicos (montos ya calculados, sin valores unitarios).
     · Todos los demás: permission-denied. Sus navegadores NO abren escuchas hacia esos documentos: los valores se escuchan solo con 'gestionar'.
   Nivel interno: 'gerencia' = puede gestionar (calcula con los valores y publica; NO convierte a nadie en Gerente), 'jefatura' = solo consulta.
   El UID del usuario que cambia un valor queda en el documento y en el historial (actualizadoPorUid), como rastro.

   valoresUnitarios/{id}  (un documento por línea + marca + presentación, o por línea + insumo, o la meta)
     tipo ('producto' | 'insumo' | 'meta' | 'linea'), linea, marca, presentacion (categoría: 625 ml, 1 L…), componente, unidad,
     clave, valorUnitario (el vigente hoy), fechaVigencia (desde cuándo), vigencias {AAAA-MM-DD: valor},
     activo, version, actualizadoPorUid, fechaActualizacion (hora del servidor).
   valoresUnitariosHistorial/{id_version}  solo se crea: valor anterior, valor nuevo, UID y hora del servidor.
   Cada cambio es una transacción que sube la versión y crea su historial; las reglas rechazan un cambio sin su historial.
   Cargar después de 50-impacto-economico.js.
   ============================================================= */
(function(){
  'use strict';

  const COL_VAL='valoresUnitarios',COL_HIST='valoresUnitariosHistorial';
  const ROLES_GERENCIA=['Gerente General','Gerente'];
  const ROLES_JEFATURA=['Jefe de Producción','Jefe de Operaciones','Jefatura'];
  const ROLES_ADMIN=['Administrador'];
  /* Líneas con valor GENERAL (clave real del proyecto → nombre visible, unidad que usa el motor: velocidad en UND/h por botella, bidón o caja). */
  const LINEAS_VALOR=[['PET1','PET 1','Botella'],['PET2','PET 2','Botella'],['B7L','B7L','Bidón'],['C20L','CAJAS 20L','Caja'],['B20L','B20L','Bidón']];
  const UNIDAD_LINEA=Object.fromEntries(LINEAS_VALOR.map(x=>[x[0],x[2]]));
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

  /* ---------- permisos económicos explícitos (compartidos con 36-seguridad-auth.js y los formularios de usuarios) ---------- */
  const elegibleVer=rol=>ROLES_GERENCIA.includes(rol)||ROLES_JEFATURA.includes(rol)||ROLES_ADMIN.includes(rol);
  const elegibleGestionar=rol=>ROLES_GERENCIA.includes(rol)||ROLES_ADMIN.includes(rol);
  function permisosEco(u){
    const nulo={ver:false,gestionar:false,elegibleVer:false,elegibleGestionar:false,origen:'ninguno'};
    if(!u)return nulo;
    try{if(typeof esMantCompartido==='function'&&esMantCompartido(u))return nulo;}catch(_){/* sin cuenta compartida */}
    const rol=String(u.rol||'').trim();
    const ev=elegibleVer(rol),eg=elegibleGestionar(rol);
    let ver=false,gestionar=false,origen='ninguno';
    const e=u.economico;
    if(e&&typeof e==='object'){ver=e.ver===true;gestionar=e.gestionar===true;origen='explicito';}
    else if(ROLES_GERENCIA.includes(rol)){ver=true;gestionar=true;origen='gerencia-previo';}   // autorización existente por rol: se conserva hasta que se cambie
    gestionar=gestionar&&eg;ver=(ver||gestionar)&&ev;
    return {ver,gestionar,elegibleVer:ev,elegibleGestionar:eg,origen};
  }
  window.glacialEcoPermisos={de:permisosEco,elegibleVer,elegibleGestionar,ROLES_GERENCIA,ROLES_JEFATURA,ROLES_ADMIN};

  /* ---------- claves ---------- */
  const claveProducto=(linea,marca,pres)=>normKey(linea)+'__'+normKey(marca)+'__'+normKey(pres);
  const claveInsumo=(linea,comp)=>normKey(linea)+'--'+normKey(comp);
  const idProducto=(linea,marca,pres)=>'P__'+claveProducto(linea,marca,pres);
  const claveLinea=linea=>normKey(linea);
  const idLinea=linea=>'L__'+claveLinea(linea);
  const idInsumo=(linea,comp)=>'I__'+claveInsumo(linea,comp);
  const ID_META='META__perdida-mensual';

  /* ---------- estado ---------- */
  let nivel=null,accesoListo=false,listoValores=false,errorValores='';
  let items=[];
  const DOCS={margenes:{valores:{}},costos:{valores:{}},general:{},lineas:{valores:{}}};
  let cierreValores=null;
  const oyentes=[];
  const avisar=()=>{oyentes.forEach(f=>{try{f();}catch(_){/* oyente ajeno */}});};

  function vigenteDe(it,fecha){
    let mejor=null;
    Object.keys(it.vigencias||{}).sort().forEach(d=>{if(d<=fecha&&Number.isFinite(Number(it.vigencias[d])))mejor={desde:d,valor:Number(it.vigencias[d])};});
    return mejor;
  }
  function reconstruir(){
    DOCS.margenes={valores:{}};DOCS.costos={valores:{}};DOCS.general={};DOCS.lineas={valores:{}};
    items.forEach(it=>{
      if(it.activo===false)return;
      const v={};Object.keys(it.vigencias||{}).forEach(d=>{v[d]={valor:Number(it.vigencias[d])};});
      if(it.tipo==='linea')DOCS.lineas.valores[it.linea]={etiqueta:it.linea,v};
      else if(it.tipo==='producto')DOCS.margenes.valores[it.clave]={etiqueta:it.marca+' · '+it.presentacion+' ('+it.linea+')',v};
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
    cerrarValores();nivel=null;accesoListo=false;
  }
  function abrirValores(){
    if(cierreValores||typeof db==='undefined')return;
    let cierre=null;
    cierreValores=()=>{if(cierre)cierre();};      // queda marcada como abierta antes de suscribirse (evita reentradas si el primer aviso llega al instante)
    cierre=db.collection(COL_VAL).onSnapshot(snap=>{
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
  /* Nivel según el rol del usuario con sesión. Se vuelve a evaluar al iniciar sesión y cuando el Administrador cambia el rol
     (02-estado.js llama a esta función en ambos casos): si no cambia nada, no hace nada. */
  function nivelDeUsuario(u){
    const p=permisosEco(u);
    return p.gestionar?'gerencia':p.ver?'jefatura':null;
  }
  window.glacialEconomicoEscuchas=function(){
    if(typeof db==='undefined'||typeof state==='undefined'||!state.user){cerrarTodo();return;}
    const n=nivelDeUsuario(state.user);
    if(accesoListo&&n===nivel&&(n!=='gerencia'||cierreValores))return;
    fijarNivel(n);
  };
  /* Si las escuchas se pidieron antes de que hubiera usuario (o el rol cambió), se resuelve al consultar: así la pantalla nunca se queda en «Cargando permisos». */
  const asegurar=()=>{try{if(typeof state!=='undefined'&&state.user&&(!accesoListo||nivelDeUsuario(state.user)!==nivel||(nivel==='gerencia'&&!cierreValores)))window.glacialEconomicoEscuchas();}catch(_){/* se reintenta en la próxima consulta */}};
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(cerrarTodo);

  /* =========================================================
     ESCRITURA: una transacción por valor (versión + historial); nunca se sobrescribe el documento completo
     ========================================================= */
  /* Fecha real del calendario (rechaza 2026-02-31). */
  const fechaReal=f=>{if(!fechaOk(f))return false;const [y,m,d]=f.split('-').map(Number);const x=new Date(y,m-1,d);return x.getFullYear()===y&&x.getMonth()===m-1&&x.getDate()===d;};
  const MSG_SIN_PERMISO='Solo quien tiene el permiso «Gestionar valores unitarios» (Gerencia o Administrador autorizado) puede registrar valores unitarios.';
  function motivoSinEdicion(){
    if(typeof state==='undefined'||!state.user)return 'No hay sesión activa.';
    if(window.glacialVista&&window.glacialVista.activo())return 'Tu cuenta está en Modo visualización general (solo consulta): no puede guardar valores. Pide a un Administrador que lo desactive en Gestión de usuarios.';
    if(nivel!=='gerencia')return MSG_SIN_PERMISO;
    return '';
  }
  async function guardar(d){
    const sin=motivoSinEdicion();
    if(sin)throw new Error(sin);
    // Un campo vacío NO es cero: se rechaza. El cero explícito sí es un valor válido.
    if(d.valor===null||d.valor===undefined||String(d.valor).trim()==='')throw new Error('Escribe el valor unitario (un campo vacío no se guarda como cero).');
    const valor=Number(String(d.valor).trim().replace(',','.'));
    if(!Number.isFinite(valor)||valor<0)throw new Error('El valor debe ser un número mayor o igual que cero.');
    const fecha=d.fecha||hoy();
    if(!fechaReal(fecha))throw new Error('La fecha de vigencia no es válida.');
    let id,base;
    if(d.tipo==='linea'){
      if(!UNIDAD_LINEA[d.linea])throw new Error('Línea no válida.');
      id=idLinea(d.linea);
      base={tipo:'linea',linea:d.linea,unidad:UNIDAD_LINEA[d.linea],clave:claveLinea(d.linea)};
    }else if(d.tipo==='producto'){
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
    const uid=(typeof auth!=='undefined'&&auth&&auth.currentUser&&auth.currentUser.uid)||'';
    if(!uid)throw new Error('No hay sesión activa.');
    const nombre=String((state.user&&(state.user.nombre||state.user.username))||'').slice(0,80);
    const ref=db.collection(COL_VAL).doc(id);
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      const prev=snap.exists?snap.data():null;
      const version=(prev?num(prev.version):0)+1;
      const vigencias=Object.assign({},prev&&prev.vigencias||{},{[fecha]:valor});
      const vig=vigenteDe({vigencias},hoy());
      const nuevo=Object.assign({},base,{
        valorUnitario:vig?vig.valor:valor,fechaVigencia:vig?vig.desde:fecha,vigencias:{[fecha]:valor},
        activo:d.activo!==false,version,actualizadoPorUid:uid,actualizadoPorNombre:nombre,fechaActualizacion:firebase.firestore.FieldValue.serverTimestamp()
      });
      // set con merge: solo se tocan estos campos y la vigencia nueva; las vigencias anteriores del mapa se conservan.
      tx.set(ref,nuevo,{merge:true});
      tx.set(db.collection(COL_HIST).doc(id+'_'+version),{
        valorId:id,tipo:base.tipo,linea:base.linea||'',marca:base.marca||'',presentacion:base.presentacion||'',componente:base.componente||'',
        version,valorAnterior:prev?num(prev.valorUnitario):null,valorNuevo:valor,fechaVigenciaNueva:fecha,activo:d.activo!==false,
        uid,nombre,timestamp:firebase.firestore.FieldValue.serverTimestamp()
      });
    });
  }
  async function leerHistorial(id){
    if(nivel!=='gerencia')throw new Error('Solo quien gestiona valores unitarios puede consultar el historial.');
    const snap=await db.collection(COL_HIST).where('valorId','==',id).get();
    return snap.docs.map(d=>Object.assign({id:d.id},d.data())).sort((a,b)=>num(b.version)-num(a.version));
  }

  /* =========================================================
     MIGRACIÓN: pasa a la estructura nueva los valores de configEconomica (margen por producto, costo por insumo, meta).
     Solo Gerencia la puede leer. Los precios por línea de sync/precios se muestran como referencia (no son márgenes).
     ========================================================= */
  async function migrarAnteriores(){
    if(nivel!=='gerencia')throw new Error(MSG_SIN_PERMISO);
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
    .vu-sub{color:#5a6b78;font-size:12px}.vu-aviso{padding:10px 12px;background:#eef6fc;border:1px solid #cfe0ee;border-radius:8px;margin:8px 0;color:#0b3a73;font-size:13px}
    .vu-lineas td{vertical-align:middle}.vu-lineas input[type=text],.vu-lineas input[type=date]{padding:9px 8px;border:1px solid #cfdbe3;border-radius:7px;font:inherit;min-height:40px;width:100%;box-sizing:border-box;min-width:130px}
    .vu-lineas .vu-sub-fila td{border-bottom:1px solid #dfe7ed;padding-top:0}
    .vu-est{display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap}.vu-est.ok{background:#e6f4ea;color:#1e7f4e}.vu-est.no{background:#fff1d6;color:#8a5a00}
    .vu-link{background:none;border:0;color:#0b67d8;text-decoration:underline;cursor:pointer;font:inherit;padding:6px}.vu-exc{margin-top:10px}.vu-pie{margin-top:8px;min-height:18px}
    @media(max-width:640px){.vu-panel{padding:12px}.vu-lineas input[type=text],.vu-lineas input[type=date]{min-width:110px}}
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

  /* =========================================================
     FORMULARIO «VALORES UNITARIOS» (quien tiene el permiso «gestionar»: Gerencia / Administrador autorizado)
     Se abre desde el botón CONFIGURAR VALORES UNITARIOS y desde la pestaña «Valores unitarios»: es el MISMO componente. No depende de que
     haya producción, resultados publicados ni gráficos calculados.
     ========================================================= */
  const pintarAvisoEstado=()=>{
    if(!accesoListo)return '<div class="vu-aviso">Resolviendo permisos…</div>';
    if(errorValores)return '<div class="vu-error" role="alert">'+esc(errorValores)+' <button type="button" class="vu-btn" data-vu-reintentar>Reintentar</button></div>';
    if(!listoValores)return '<div class="vu-aviso">Cargando valores unitarios…</div>';
    return '';
  };
  function reintentarValores(){cerrarValores();abrirValores();avisar();}
  const estadoPublicacion=()=>{const R=window.glacialImpactoResultados;return R&&R.estadoPub?R.estadoPub():null;};

  function abrirPantalla(){
    estilos();
    asegurar();
    const sin=motivoSinEdicion();
    const soloVista=!!(window.glacialVista&&window.glacialVista.activo());
    if(sin&&!soloVista){alert(sin);return;}          // sin permiso: mensaje específico (no un botón que aparenta funcionar)
    const fondo=document.createElement('div');fondo.className='vu-fondo';
    fondo.innerHTML='<div class="vu-panel" role="dialog" aria-modal="true" aria-label="Valores unitarios"><div class="vu-cab"><div><h3>Valores unitarios por línea</h3><div class="vu-sub">Registra el valor y su fecha de vigencia para cada línea.</div></div>'+
      '<div><button type="button" class="vu-btn" data-vu-migrar>Importar valores anteriores</button> <button type="button" class="vu-btn" data-vu-x>Cerrar</button></div></div>'+
      (sin?'<div class="vu-error" role="alert">'+esc(sin)+'</div>':'')+
      '<div class="vu-tabs" role="tablist"><button type="button" class="vu-tab on" data-vu-tab="linea">Valores por línea</button><button type="button" class="vu-tab" data-vu-tab="producto">Excepciones por marca y presentación</button><button type="button" class="vu-tab" data-vu-tab="insumo">Insumos de merma</button><button type="button" class="vu-tab" data-vu-tab="meta">Meta mensual</button></div>'+
      '<div id="vu-cuerpo"></div><div class="vu-pie" id="vu-pie"></div></div>';
    document.body.appendChild(fondo);
    let tab='linea',edit=null;
    const borr={};                                   // borradores por línea: lo escrito no se pierde ni se reemplaza sin aviso
    const cuerpo=fondo.querySelector('#vu-cuerpo');
    const bloqueado=!!sin;
    const pintar=()=>{
      fondo.querySelectorAll('[data-vu-tab]').forEach(b=>b.classList.toggle('on',b.getAttribute('data-vu-tab')===tab));
      if(tab==='linea')pintarLineas();else if(tab==='producto')pintarProductos();else if(tab==='insumo')pintarInsumos();else pintarMeta();
      pintarPie();
    };
    const opts=(lista,sel,vacio)=>(vacio?'<option value="">'+vacio+'</option>':'')+lista.map(x=>{const v=typeof x==='string'?x:x.v,t=typeof x==='string'?x:x.t;return '<option value="'+esc(v)+'"'+(v===sel?' selected':'')+'>'+esc(t)+'</option>';}).join('');
    const msg=t=>{const e=cuerpo.querySelector('[data-vu-msg]');if(e)e.innerHTML=t;};
    /* Estado de la publicación de resultados (separado del guardado: un fallo al publicar no significa que el valor se perdió). */
    function pintarPie(){
      const p=estadoPublicacion(),pie=fondo.querySelector('#vu-pie');if(!pie)return;
      if(!p){pie.innerHTML='';return;}
      const hora=p.ultimo?new Date(p.ultimo).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'}):'';
      pie.innerHTML=p.error
        ?'<span class="vu-error">Tu valor está guardado, pero no se pudieron publicar los resultados para Jefatura: '+esc(p.error)+' <button type="button" class="vu-btn" data-vu-publicar>Reintentar publicación</button></span>'
        :(p.publicando?'<span class="vu-aviso">Publicando resultados para Jefatura…</span>':(hora?'<span class="vu-sub">Resultados publicados a las '+esc(hora)+' (Jefatura y otros dispositivos autorizados).</span>':''));
    }
    function pintarLineas(){
      const cargando=!listoValores||!!errorValores||bloqueado;
      const filas=LINEAS_VALOR.map(([k,nombre,unidad])=>{
        const it=items.find(i=>i.tipo==='linea'&&i.linea===k&&i.activo!==false);
        const vig=it?vigenteDe(it,hoy()):null;
        const d=borr[k]||{};
        const valor=d.sucio?d.valor:(vig?String(vig.valor):(it?String(it.valorUnitario):''));
        const fecha=d.sucio?d.fecha:(vig?vig.desde:hoy());
        const configurado=!!(it&&(vig||Number.isFinite(Number(it.valorUnitario))));
        const futuras=it?Object.keys(it.vigencias||{}).filter(f=>f>hoy()).sort():[];
        const quien=it?[it.actualizadoPorNombre,it.fechaActualizacion&&it.fechaActualizacion.toMillis?new Date(it.fechaActualizacion.toMillis()).toLocaleString('es-PE'):''].filter(Boolean).join(' · '):'';
        const cambioRemoto=d.sucio&&it&&d.baseVersion!==undefined&&num(it.version)!==d.baseVersion;
        return '<tr data-vu-fila="'+k+'"><td><strong>'+esc(nombre)+'</strong></td><td>'+esc(unidad)+'</td>'+
          '<td><input type="text" inputmode="decimal" autocomplete="off" data-vu-campo="valor" data-vu-linea="'+k+'" value="'+esc(valor)+'" placeholder="Ingresar valor" aria-label="Valor unitario de '+esc(nombre)+' en soles por '+esc(unidad.toLowerCase())+'"'+(cargando?' disabled':'')+'></td>'+
          '<td><input type="date" data-vu-campo="fecha" data-vu-linea="'+k+'" value="'+esc(fecha)+'" aria-label="Vigente desde, '+esc(nombre)+'"'+(cargando?' disabled':'')+'></td>'+
          '<td><span class="vu-est '+(configurado?'ok':'no')+'">'+(configurado?'● Configurado':'● Sin configurar')+'</span></td>'+
          '<td><button type="button" class="vu-btn p" data-vu-gl="'+k+'"'+(cargando||d.estado==='guardando'?' disabled':'')+'>'+(d.estado==='guardando'?'Guardando…':'Guardar')+'</button> '+
          (it?'<button type="button" class="vu-link" data-vu-hist="'+esc(it.id)+'">Historial</button>':'')+'</td></tr>'+
          '<tr class="vu-sub-fila"><td colspan="6"><small>'+(quien?'Última modificación: '+esc(quien)+'. ':'')+(futuras.length?'Vigencia futura programada: '+futuras.map(f=>fmtFecha(f)+' → '+fmtS(it.vigencias[f])).join(', ')+'. ':'')+'</small>'+
          (cambioRemoto?' <span class="vu-error">Otro usuario cambió este valor mientras lo editabas (versión '+num(it.version)+'); al guardar se registrará un cambio nuevo.</span>':'')+
          (d.estado==='error'?' <span class="vu-error">'+esc(d.msg)+'</span>':d.estado==='guardado'?' <span class="vu-ok">Guardado y confirmado por el servidor.</span>':'')+'</td></tr>';
      }).join('');
      cuerpo.innerHTML=pintarAvisoEstado()+
        '<div class="vu-scroll"><table class="vu-tabla vu-lineas"><thead><tr><th>Línea</th><th>Unidad de cálculo</th><th>Valor unitario (S/ por unidad)</th><th>Vigente desde</th><th>Estado</th><th>Acción</th></tr></thead><tbody>'+filas+'</tbody></table></div>'+
        '<p class="vu-sub">El valor es el parámetro económico que usa el cálculo (S/ por botella, bidón o caja según la línea). Una excepción por marca y presentación tiene prioridad sobre el valor de la línea. Un 0 guardado es un valor válido.</p>'+
        '<details class="vu-exc"><summary>Excepciones por marca y presentación</summary><p class="vu-sub">Para registrar un valor distinto de un producto, usa la pestaña «Excepciones por marca y presentación».</p></details>'+
        '<div class="vu-error" data-vu-msg></div>';
    }
    function pintarProductos(){
      const e=edit||{linea:(lineasLista()[0]||{}).key||'',marca:'',presentacion:'',valor:'',fecha:hoy(),activo:true};
      const filas=items.filter(i=>i.tipo==='producto').sort((a,b)=>(a.linea+a.marca+a.presentacion).localeCompare(b.linea+b.marca+b.presentacion,'es'));
      cuerpo.innerHTML=pintarAvisoEstado()+'<div class="vu-form">'+
        '<label>Línea<select data-vu-f="linea">'+opts(lineasLista().map(l=>({v:l.key,t:l.name})),e.linea)+'</select></label>'+
        '<label>Marca<select data-vu-f="marca">'+opts(marcasDe(e.linea),e.marca,'Selecciona…')+'</select></label>'+
        '<label>Presentación<select data-vu-f="presentacion">'+opts(presentacionesDe(e.linea,e.marca),e.presentacion,'Selecciona…')+'</select></label>'+
        '<label>Valor unitario (S/ por '+esc((UNIDAD_LINEA[e.linea]||'unidad').toLowerCase())+')<input type="text" inputmode="decimal" data-vu-f="valor" value="'+esc(e.valor)+'"></label>'+
        '<label>Vigente desde<input type="date" data-vu-f="fecha" value="'+esc(e.fecha)+'"></label>'+
        '<label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" data-vu-f="activo"'+(e.activo!==false?' checked':'')+'> Activo</label>'+
        '<button type="button" class="vu-btn p" data-vu-guardar="producto"'+(bloqueado?' disabled':'')+'>Guardar</button></div><div class="vu-error" data-vu-msg></div>'+
        '<div class="vu-scroll"><table class="vu-tabla"><thead><tr><th>Línea</th><th>Marca</th><th>Presentación</th><th>Valor vigente</th><th>Desde</th><th>Activo</th><th></th></tr></thead><tbody>'+
        (filas.length?filas.map(i=>'<tr><td>'+esc(i.linea)+'</td><td>'+esc(i.marca)+'</td><td>'+esc(i.presentacion)+'</td><td>'+fmtS(i.valorUnitario)+'</td><td>'+fmtFecha(i.fechaVigencia)+'</td><td>'+(i.activo===false?'No':'Sí')+'</td><td><button type="button" class="vu-btn" data-vu-editar="'+esc(i.id)+'">Editar</button> <button type="button" class="vu-btn" data-vu-hist="'+esc(i.id)+'">Historial</button></td></tr>').join(''):'<tr><td colspan="7">No hay excepciones por producto (el valor de cada línea se aplica a todos sus productos).</td></tr>')+'</tbody></table></div>';
    }
    function pintarInsumos(){
      const filas=items.filter(i=>i.tipo==='insumo').sort((a,b)=>(a.linea+a.componente).localeCompare(b.linea+b.componente,'es'));
      cuerpo.innerHTML=pintarAvisoEstado()+'<div class="vu-form">'+
        '<label>Línea<select data-vu-f="linea">'+opts(lineasLista().map(l=>({v:l.key,t:l.name})),(lineasLista()[0]||{}).key)+'</select></label>'+
        '<label>Componente<select data-vu-f="componente">'+opts(COMPONENTES,'')+'</select></label>'+
        '<label>Costo unitario (S/ por unidad; polietileno por kg)<input type="text" inputmode="decimal" data-vu-f="valor"></label>'+
        '<label>Vigente desde<input type="date" data-vu-f="fecha" value="'+hoy()+'"></label>'+
        '<button type="button" class="vu-btn p" data-vu-guardar="insumo"'+(bloqueado?' disabled':'')+'>Guardar</button></div><div class="vu-error" data-vu-msg></div>'+
        '<div class="vu-scroll"><table class="vu-tabla"><thead><tr><th>Línea</th><th>Componente</th><th>Costo vigente</th><th>Desde</th><th></th></tr></thead><tbody>'+
        (filas.length?filas.map(i=>'<tr><td>'+esc(i.linea)+'</td><td>'+esc(i.componente)+'</td><td>'+fmtS(i.valorUnitario)+' <small>por '+esc(i.unidad)+'</small></td><td>'+fmtFecha(i.fechaVigencia)+'</td><td><button type="button" class="vu-btn" data-vu-hist="'+esc(i.id)+'">Historial</button></td></tr>').join(''):'<tr><td colspan="5">Sin costos cargados.</td></tr>')+'</tbody></table></div>';
    }
    function pintarMeta(){
      const m=items.find(i=>i.tipo==='meta');
      cuerpo.innerHTML=pintarAvisoEstado()+'<div class="vu-form"><label>Meta máxima de pérdida mensual (S/)<input type="text" inputmode="decimal" data-vu-f="valor" value="'+esc(m?m.valorUnitario:'')+'"></label>'+
        '<button type="button" class="vu-btn p" data-vu-guardar="meta"'+(bloqueado?' disabled':'')+'>Guardar</button>'+(m?'<button type="button" class="vu-btn" data-vu-hist="'+esc(m.id)+'">Historial</button>':'')+'</div><div class="vu-error" data-vu-msg></div>';
    }
    const leerForm=()=>{const o={};cuerpo.querySelectorAll('[data-vu-f]').forEach(el=>{o[el.getAttribute('data-vu-f')]=el.type==='checkbox'?el.checked:el.value;});return o;};
    /* Lo escrito en la tabla por línea queda en un borrador (no se pierde al llegar un cambio de otro dispositivo). */
    fondo.addEventListener('input',ev=>{
      const el=ev.target.closest&&ev.target.closest('[data-vu-campo]');if(!el)return;
      const k=el.getAttribute('data-vu-linea'),it=items.find(i=>i.tipo==='linea'&&i.linea===k);
      const fila=cuerpo.querySelector('[data-vu-fila="'+k+'"]');
      borr[k]=Object.assign({},borr[k],{sucio:true,estado:'',valor:fila.querySelector('[data-vu-campo=valor]').value,fecha:fila.querySelector('[data-vu-campo=fecha]').value});
      if(borr[k].baseVersion===undefined)borr[k].baseVersion=it?num(it.version):0;
    });
    fondo.addEventListener('change',ev=>{
      const el=ev.target.closest('[data-vu-f]');
      if(!el||tab!=='producto')return;
      edit=Object.assign({},leerForm());
      if(el.getAttribute('data-vu-f')==='linea'){edit.marca='';edit.presentacion='';}
      if(el.getAttribute('data-vu-f')==='marca')edit.presentacion='';
      pintar();
    });
    const guardando=new Set();
    fondo.addEventListener('click',async ev=>{
      const t=ev.target;
      if(t.closest('[data-vu-x]')||t===fondo){fondo.remove();return;}
      const pestana=t.closest('[data-vu-tab]');
      if(pestana){tab=pestana.getAttribute('data-vu-tab');edit=null;pintar();return;}
      if(t.closest('[data-vu-reintentar]')){reintentarValores();pintar();return;}
      if(t.closest('[data-vu-publicar]')){const R=window.glacialImpactoResultados;if(R)R.publicar(true);setTimeout(pintarPie,300);return;}
      const editar=t.closest('[data-vu-editar]');
      if(editar){const i=items.find(x=>x.id===editar.getAttribute('data-vu-editar'));if(i){edit={linea:i.linea,marca:i.marca,presentacion:i.presentacion,valor:i.valorUnitario,fecha:hoy(),activo:i.activo!==false};pintar();}return;}
      const hist=t.closest('[data-vu-hist]');
      if(hist){
        try{
          const lista=await leerHistorial(hist.getAttribute('data-vu-hist'));
          const h=document.createElement('div');h.className='vu-fondo';h.style.zIndex=10070;
          h.innerHTML='<div class="vu-panel" style="max-width:820px"><div class="vu-cab"><h3>Historial de cambios</h3><button type="button" class="vu-btn" data-vu-hx>Cerrar</button></div><div class="vu-scroll"><table class="vu-tabla"><thead><tr><th>Fecha y hora</th><th>Anterior</th><th>Nuevo</th><th>Vigente desde</th><th>Usuario</th></tr></thead><tbody>'+
            (lista.length?lista.map(x=>'<tr><td>'+esc(x.timestamp&&x.timestamp.toMillis?new Date(x.timestamp.toMillis()).toLocaleString('es-PE'):'')+'</td><td>'+(x.valorAnterior==null?'—':fmtS(x.valorAnterior))+'</td><td>'+fmtS(x.valorNuevo)+'</td><td>'+fmtFecha(x.fechaVigenciaNueva)+'</td><td>'+esc(x.nombre||'')+' <small>'+esc(x.uid)+'</small></td></tr>').join(''):'<tr><td colspan="5">Sin cambios registrados.</td></tr>')+'</tbody></table></div></div>';
          h.addEventListener('click',e2=>{if(e2.target===h||e2.target.closest('[data-vu-hx]'))h.remove();});
          document.body.appendChild(h);
        }catch(e){msg(esc((e&&e.message)||e));}
        return;
      }
      if(t.closest('[data-vu-migrar]')){
        if(bloqueado){msg(esc(sin));return;}
        if(!confirm('Se copiarán a la estructura nueva los valores de la versión anterior (margen por producto, costo de insumos y meta). No se borra nada. ¿Continuar?'))return;
        try{
          msg('Importando…');
          const r=await migrarAnteriores();
          const ref=Object.keys(r.precios).length?'\nPrecios por línea anteriores (solo referencia, no son márgenes ni se importan como valores): '+Object.keys(r.precios).map(k=>k+' '+fmtS(r.precios[k])).join(' · '):'';
          alert('Importados: '+r.productos+' producto(s), '+r.insumos+' insumo(s)'+(r.meta?' y la meta':'')+'.'+(r.sinLinea.length?'\nSin línea asignable (cárgalos a mano): '+r.sinLinea.join(', '):'')+ref);
          pintar();
        }catch(e){msg(esc((e&&e.message)||e));}
        return;
      }
      const gl=t.closest('[data-vu-gl]');
      if(gl){
        const k=gl.getAttribute('data-vu-gl');
        if(guardando.has(k))return;                       // sin dobles envíos
        const fila=cuerpo.querySelector('[data-vu-fila="'+k+'"]');
        const valor=fila.querySelector('[data-vu-campo=valor]').value,fecha=fila.querySelector('[data-vu-campo=fecha]').value;
        guardando.add(k);borr[k]=Object.assign({},borr[k],{sucio:true,valor,fecha,estado:'guardando'});pintar();
        try{
          await guardar({tipo:'linea',linea:k,valor,fecha});
          borr[k]={sucio:false,estado:'guardado'};                 // «Guardado» solo después de la confirmación del servidor
          setTimeout(()=>{if(borr[k]&&borr[k].estado==='guardado'){borr[k]={};if(document.body.contains(fondo)&&tab==='linea'&&!cuerpo.contains(document.activeElement))pintar();}},4000);
        }catch(e){borr[k]=Object.assign({},borr[k],{sucio:true,estado:'error',msg:(e&&e.message)||String(e)});}
        guardando.delete(k);pintar();
        setTimeout(pintarPie,400);
        return;
      }
      const g=t.closest('[data-vu-guardar]');
      if(g){
        const f=leerForm();
        try{
          msg('Guardando…');
          await guardar(Object.assign({tipo:g.getAttribute('data-vu-guardar')},f));
          edit=null;tab=g.getAttribute('data-vu-guardar')==='meta'?'meta':tab;pintar();msg('<span class="vu-ok">Guardado y confirmado. Se ve al instante en tus otros dispositivos.</span>');
        }catch(e){msg(esc((e&&e.message)||e));}
        setTimeout(pintarPie,400);
      }
    });
    // Se repinta cuando llega un cambio de otro dispositivo, sin pisar lo que se está escribiendo.
    const oy=()=>{if(!document.body.contains(fondo)){const i=oyentes.indexOf(oy);if(i>=0)oyentes.splice(i,1);return;}if(!cuerpo.contains(document.activeElement)||document.activeElement.tagName==='BODY')pintar();else pintarPie();};
    oyentes.push(oy);
    pintar();
  }

  window.glacialEconomico={
    puedeGestionar:()=>{asegurar();return nivel==='gerencia';},puedeVer:()=>{asegurar();return nivel==='gerencia'||nivel==='jefatura';},
    motivoSinEdicion:()=>{asegurar();return motivoSinEdicion();},reintentar:reintentarValores,permisos:permisosEco,LINEAS_VALOR,UNIDAD_LINEA,idLinea,
    nivel:()=>{asegurar();return nivel;},esGerencia:()=>{asegurar();return nivel==='gerencia';},esJefatura:()=>{asegurar();return nivel==='jefatura';},accesoListo:()=>{asegurar();return accesoListo;},
    listo:()=>{asegurar();return nivel==='gerencia'&&listoValores;},error:()=>errorValores,docs:()=>DOCS,
    alCambiar:f=>{if(typeof f==='function')oyentes.push(f);},
    guardar,historial:leerHistorial,migrar:migrarAnteriores,abrirPantalla,
    claveProducto,claveInsumo
  };
})();
