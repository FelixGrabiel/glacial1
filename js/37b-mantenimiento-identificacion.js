/* =============================================================
   GLACIAL · MANTENIMIENTO — FASE B · IDENTIFICACIÓN INDIVIDUAL DEL TÉCNICO (PIN)
   -------------------------------------------------------------
   Tras entrar con la cuenta compartida aparece "¿Quién eres?":
     1) se elige el técnico (trabajadores activos de Mantenimiento);
     2) primera vez → crea su PIN (4 a 6 dígitos); después → lo ingresa.
   - Mientras no haya técnico identificado la pantalla queda bloqueada.
   - La identificación vive solo en esta pestaña/teléfono (sessionStorage),
     vence por INACTIVIDAD y por DURACIÓN MÁXIMA, y se puede cerrar o cambiar.
   - 5 intentos fallidos bloquean al técnico 10 minutos.

   MODOS DEL PIN (window.MANT_PIN_MODO, definir antes de cargar este archivo):
     'local'     (por defecto) PBKDF2-SHA256 con sal por técnico, guardado en
                 sync/tecnicosMant. Sirve como TRAZABILIDAD: sin Cloud
                 Functions, cualquiera con la cuenta compartida podría leer el
                 hash en Firestore; no es una barrera de seguridad real.
     'functions' LISTO PARA CLOUD FUNCTIONS: el PIN se crea y verifica en el
                 servidor con las funciones callable mantEstadoPin,
                 mantCrearPin y mantVerificarPin (ejemplo en
                 functions/mantenimiento-pin.js). El navegador nunca ve el
                 hash y el servidor entrega un token de identificación.
   Para pasar a Cloud Functions: desplegar las funciones y poner
   window.MANT_PIN_MODO='functions' en js/01-config.js.

   API para las fases siguientes:
     mantTecnicoActivo()  → {workerId,nombre,inicio,token} | null
     evento 'mant:tecnico' (document) cuando cambia el técnico activo
     mantCerrarIdentificacion()

   Cargar DESPUÉS de 37-mantenimiento-tecnicos.js; antes de 12-init.js.
   ============================================================= */
(function instalarIdentificacionTecnicos(){
  'use strict';

  const CFG=Object.assign({
    inactividadMin:30,      // cierra la identificación tras N min sin tocar la pantalla
    duracionMaxHoras:12,    // y nunca dura más de N horas
    maxIntentos:5,
    bloqueoMin:10,
    pinMin:4,
    pinMax:6
  },window.MANT_CONFIG||{});
  const MODO=()=>window.MANT_PIN_MODO==='functions'?'functions':'local';
  const CLAVE='glacial.mant.tecnico.v1';
  const DOC='tecnicosMant';
  const esc=t=>typeof escaparHTML==='function'
    ? escaparHTML(t)
    : String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=t=>typeof normalizarTexto==='function'
    ? normalizarTexto(t)
    : String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const ahora=()=>Date.now();

  let cache=[];            // sync/tecnicosMant → items (solo modo local)
  let escuchando=false;
  let sesion=null;         // {workerId,nombre,inicio,actividad,token?}
  let temporizador=null;
  let ultimoGuardadoAct=0;

  /* ---------- sesión del técnico (por pestaña) ---------- */
  function leerSesion(){
    try{return JSON.parse(sessionStorage.getItem(CLAVE)||'null');}catch(_){return null;}
  }
  function guardarSesion(){
    try{
      if(sesion)sessionStorage.setItem(CLAVE,JSON.stringify(sesion));
      else sessionStorage.removeItem(CLAVE);
    }catch(_){/* sin almacenamiento: queda en memoria */}
  }
  function vigente(s){
    if(!s||!s.workerId)return false;
    const t=ahora();
    return t-s.inicio<CFG.duracionMaxHoras*3600000 &&
           t-s.actividad<CFG.inactividadMin*60000;
  }
  window.mantTecnicoActivo=function(){
    if(!window.esMantCompartido())return null;
    if(!sesion)sesion=leerSesion();
    if(!vigente(sesion)){
      if(sesion){sesion=null;guardarSesion();}
      return null;
    }
    return {workerId:sesion.workerId,nombre:sesion.nombre,inicio:sesion.inicio,token:sesion.token||null};
  };
  function emitir(){
    try{document.dispatchEvent(new CustomEvent('mant:tecnico',{detail:window.mantTecnicoActivo()}));}catch(_){/* no crítico */}
  }
  function iniciarSesion(w,token){
    sesion={workerId:w.id,nombre:w.nombre,inicio:ahora(),actividad:ahora(),token:token||null};
    guardarSesion();
    cerrarOverlay();
    pintarChip();
    emitir();
  }
  window.mantCerrarIdentificacion=function(mostrar){
    sesion=null;guardarSesion();
    pintarChip();emitir();
    if(mostrar!==false&&window.esMantCompartido()&&state.user)abrirOverlay();
  };

  /* ---------- técnicos disponibles ---------- */
  function tecnicosDisponibles(){
    const lista=typeof loadWorkers==='function'?(loadWorkers()||[]):[];
    return lista.filter(w=>{
      if(!w||norm(w.estado)!=='activo')return false;
      const cargo=norm(w.cargo);
      if(/supervisor|jefe|gerente|jefatura/.test(cargo))return false;
      if(typeof tareoEsTecnicoMantenimiento==='function'&&tareoEsTecnicoMantenimiento(w.cargo))return true;
      return norm(w.area)==='mantenimiento';
    }).sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),'es'));
  }

  /* ---------- hash local del PIN ---------- */
  const aB64=buf=>btoa(String.fromCharCode(...new Uint8Array(buf)));
  const deB64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  async function derivar(pin,salt){
    if(!(window.crypto&&crypto.subtle))throw new Error('Este navegador no permite crear PIN (requiere https).');
    const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:100000},base,256);
    return aB64(bits);
  }
  function pinValido(pin){
    if(!new RegExp('^\\d{'+CFG.pinMin+','+CFG.pinMax+'}$').test(pin))
      return 'El PIN debe tener de '+CFG.pinMin+' a '+CFG.pinMax+' dígitos.';
    if(/^(\d)\1+$/.test(pin)||['1234','12345','123456','0123','4321','54321','654321'].includes(pin))
      return 'Ese PIN es muy fácil de adivinar. Elige otro.';
    return '';
  }

  /* ---------- proveedor LOCAL ---------- */
  const refDoc=()=>db.collection('sync').doc(DOC);
  function empezarEscucha(){
    if(escuchando||MODO()!=='local'||typeof db==='undefined')return;
    escuchando=true;
    refDoc().onSnapshot(s=>{
      cache=(s.exists&&Array.isArray(s.data().items))?s.data().items:[];
      refrescarOverlay();
    },e=>console.warn('tecnicosMant:',e&&e.message));
  }
  async function actualizarItem(workerId,fn){
    await db.runTransaction(async tx=>{
      const s=await tx.get(refDoc());
      const items=(s.exists&&Array.isArray(s.data().items))?s.data().items.slice():[];
      const i=items.findIndex(x=>x.workerId===workerId);
      const nuevo=fn(i>=0?Object.assign({},items[i]):{workerId});
      if(i>=0)items[i]=nuevo;else items.push(nuevo);
      tx.set(refDoc(),{items,updatedAt:ahora()});
    });
  }
  const Local={
    async estado(w){
      const it=cache.find(x=>x.workerId===w.id);
      return {tienePin:!!(it&&it.hash),bloqueadoHasta:(it&&it.bloqueadoHasta)||0};
    },
    async crear(w,pin){
      const salt=crypto.getRandomValues(new Uint8Array(16));
      const hash=await derivar(pin,salt);
      let yaTenia=false;
      await actualizarItem(w.id,it=>{
        if(it.hash){yaTenia=true;return it;}
        return Object.assign(it,{nombre:w.nombre,salt:aB64(salt),hash,intentos:0,bloqueadoHasta:0,creadoEn:ahora(),ultimoAcceso:ahora()});
      });
      if(yaTenia)return {ok:false,error:'Este técnico ya tiene PIN. Ingrésalo.'};
      return {ok:true};
    },
    async verificar(w,pin){
      const s=await refDoc().get();
      const items=(s.exists&&Array.isArray(s.data().items))?s.data().items:[];
      const it=items.find(x=>x.workerId===w.id);
      if(!it||!it.hash)return {ok:false,error:'Este técnico aún no tiene PIN.',sinPin:true};
      if((it.bloqueadoHasta||0)>ahora())return {ok:false,bloqueadoHasta:it.bloqueadoHasta,error:'Bloqueado por intentos fallidos.'};
      const ok=(await derivar(pin,deB64(it.salt)))===it.hash;
      const res={ok,restantes:0};
      await actualizarItem(w.id,x=>{
        if(ok){x.intentos=0;x.bloqueadoHasta=0;x.ultimoAcceso=ahora();return x;}
        x.intentos=(x.intentos||0)+1;
        if(x.intentos>=CFG.maxIntentos){x.intentos=0;x.bloqueadoHasta=ahora()+CFG.bloqueoMin*60000;res.bloqueadoHasta=x.bloqueadoHasta;}
        res.restantes=Math.max(0,CFG.maxIntentos-x.intentos);
        return x;
      });
      if(!ok)res.error=res.bloqueadoHasta?'Demasiados intentos. Técnico bloqueado.':'PIN incorrecto.';
      return res;
    }
  };

  /* ---------- proveedor CLOUD FUNCTIONS (se activa con MANT_PIN_MODO='functions') ---------- */
  let funcionesListas=null;
  function cargarFunciones(){
    if(funcionesListas)return funcionesListas;
    funcionesListas=new Promise((res,rej)=>{
      if(firebase.functions)return res();
      const s=document.createElement('script');
      s.src='https://www.gstatic.com/firebasejs/10.13.0/firebase-functions-compat.js';
      s.onload=()=>res();
      s.onerror=()=>rej(new Error('No se pudo cargar Cloud Functions.'));
      document.head.appendChild(s);
    });
    return funcionesListas;
  }
  async function llamar(nombre,datos){
    await cargarFunciones();
    const fn=firebase.functions().httpsCallable(nombre);
    return (await fn(datos)).data;
  }
  const Remoto={
    estado:w=>llamar('mantEstadoPin',{workerId:w.id}),
    crear:(w,pin)=>llamar('mantCrearPin',{workerId:w.id,pin}),
    verificar:(w,pin)=>llamar('mantVerificarPin',{workerId:w.id,pin})
  };
  const Proveedor=()=>MODO()==='functions'?Remoto:Local;

  /* ---------- interfaz ---------- */
  function inyectarEstilos(){
    if(document.getElementById('mant-id-css'))return;
    const st=document.createElement('style');
    st.id='mant-id-css';
    st.textContent=[
      '#mant-id-overlay{position:fixed;inset:0;z-index:99999;background:rgba(10,30,50,.92);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:16px}',
      '#mant-id-overlay .mid-card{width:100%;max-width:440px;margin:auto;background:#fff;border-radius:16px;padding:20px;box-shadow:0 12px 40px rgba(0,0,0,.35);color:#0b2a44}',
      '#mant-id-overlay h2{margin:0 0 4px;font-size:20px}',
      '#mant-id-overlay p.mid-sub{margin:0 0 14px;color:#5b6b7a;font-size:13px}',
      '#mant-id-overlay input[type=password],#mant-id-overlay input[type=search]{width:100%;box-sizing:border-box;padding:12px;border:1px solid #c9d4de;border-radius:10px;font-size:16px;margin-bottom:10px}',
      '#mant-id-overlay .mid-lista{display:flex;flex-direction:column;gap:8px;max-height:52vh;overflow:auto}',
      '#mant-id-overlay .mid-tec{display:flex;justify-content:space-between;align-items:center;text-align:left;padding:12px 14px;border:1px solid #d5dfe8;border-radius:12px;background:#f7fafc;font-size:15px;font-weight:700;color:#0b2a44;cursor:pointer}',
      '#mant-id-overlay .mid-tec small{font-weight:600;color:#6b7c8c}',
      '#mant-id-overlay .mid-btn{width:100%;padding:13px;border:0;border-radius:10px;background:#0b5c9e;color:#fff;font-size:16px;font-weight:800;cursor:pointer}',
      '#mant-id-overlay .mid-btn:disabled{opacity:.5}',
      '#mant-id-overlay .mid-link{background:none;border:0;color:#0b5c9e;font-weight:700;cursor:pointer;padding:10px 0;font-size:14px}',
      '#mant-id-overlay .mid-err{color:#b3261e;font-size:13px;font-weight:700;min-height:18px;margin-bottom:6px}',
      '#mant-id-overlay .mid-pin{letter-spacing:.4em;text-align:center;font-size:22px!important}',
      '#mant-id-overlay label.mid-chk{display:flex;gap:6px;align-items:center;font-size:13px;color:#5b6b7a;margin-bottom:10px}',
      '#mant-tecnico-chip{display:inline-block;margin:2px 0 0 6px;padding:1px 8px;border-radius:999px;background:#e3f1ff;border:1px solid #9cc8f0;color:#0b4f87;font-size:10px;font-weight:800;cursor:pointer}'
    ].join('\n');
    document.head.appendChild(st);
  }

  let vista={paso:'lista',worker:null,busqueda:'',error:'',estado:null,ocupado:false};

  function abrirOverlay(){
    if(!window.esMantCompartido()||!state.user||window.__vistaComo)return;   // "Ver como": sin PIN
    inyectarEstilos();
    empezarEscucha();
    if(!document.getElementById('mant-id-overlay')){
      const d=document.createElement('div');
      d.id='mant-id-overlay';
      document.body.appendChild(d);
    }
    vista={paso:'lista',worker:null,busqueda:'',error:'',estado:null,ocupado:false};
    dibujar();
  }
  function cerrarOverlay(){document.getElementById('mant-id-overlay')?.remove();}
  function refrescarOverlay(){
    // Solo repinta la lista; nunca pisa un PIN que se está escribiendo.
    if(document.getElementById('mant-id-overlay')&&vista.paso==='lista')dibujar();
  }

  function dibujar(){
    const o=document.getElementById('mant-id-overlay');
    if(!o)return;
    if(vista.paso==='lista'){
      const q=norm(vista.busqueda);
      const lista=tecnicosDisponibles().filter(w=>!q||norm(w.nombre).includes(q));
      const filas=lista.length
        ? lista.map(w=>'<button type="button" class="mid-tec" data-id="'+esc(w.id)+'"><span>'+esc(w.nombre)+'</span><small>'+esc(w.cargo||'')+'</small></button>').join('')
        : '<p class="mid-sub">No hay técnicos de Mantenimiento activos. Pide al Administrador que los registre en Trabajadores.</p>';
      o.innerHTML='<div class="mid-card"><h2>¿Quién eres?</h2>'+
        '<p class="mid-sub">Cuenta compartida de Mantenimiento. Elige tu nombre para identificarte.</p>'+
        '<input type="search" id="mid-buscar" placeholder="Buscar técnico..." value="'+esc(vista.busqueda)+'" autocomplete="off">'+
        '<div class="mid-lista">'+filas+'</div>'+
        '<button type="button" class="mid-link" id="mid-salir">Salir de la cuenta</button></div>';
      const b=o.querySelector('#mid-buscar');
      b.oninput=()=>{
        vista.busqueda=b.value;
        const pos=b.selectionStart;
        dibujar();
        const n=document.getElementById('mid-buscar');
        n.focus();
        try{n.setSelectionRange(pos,pos);}catch(_){/* no crítico */}
      };
      o.querySelectorAll('.mid-tec').forEach(x=>{x.onclick=()=>elegir(x.dataset.id);});
      o.querySelector('#mid-salir').onclick=()=>{cerrarOverlay();if(typeof handleLogout==='function')handleLogout();};
      return;
    }
    const w=vista.worker,e=vista.estado||{};
    const crear=!e.tienePin;
    const bloqueado=(e.bloqueadoHasta||0)>ahora();
    const hora=bloqueado?new Date(e.bloqueadoHasta).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'}):'';
    const sub=bloqueado
      ? 'Bloqueado hasta las '+hora+' por intentos fallidos.'
      : crear
        ? 'Primera vez: crea tu PIN personal ('+CFG.pinMin+' a '+CFG.pinMax+' dígitos). Solo tú debes conocerlo.'
        : 'Ingresa tu PIN.';
    const campo=(id,ph)=>'<input type="password" class="mid-pin" id="'+id+'" inputmode="numeric" pattern="[0-9]*" maxlength="'+CFG.pinMax+'" placeholder="'+ph+'" autocomplete="off"'+(bloqueado?' disabled':'')+'>';
    o.innerHTML='<div class="mid-card"><h2>'+esc(w.nombre)+'</h2>'+
      '<p class="mid-sub">'+esc(sub)+'</p>'+
      campo('mid-pin','PIN')+(crear?campo('mid-pin2','Repite el PIN'):'')+
      '<label class="mid-chk"><input type="checkbox" id="mid-ver"> Mostrar PIN</label>'+
      '<div class="mid-err" id="mid-err">'+esc(vista.error)+'</div>'+
      '<button type="button" class="mid-btn" id="mid-ok"'+(bloqueado||vista.ocupado?' disabled':'')+'>'+
        (vista.ocupado?'Verificando...':crear?'Crear PIN y entrar':'Entrar')+'</button>'+
      '<button type="button" class="mid-link" id="mid-volver">← Elegir otro técnico</button></div>';
    const p1=o.querySelector('#mid-pin'),p2=o.querySelector('#mid-pin2');
    [p1,p2].forEach(i=>{if(i)i.oninput=()=>{i.value=i.value.replace(/\D/g,'');};});
    o.querySelector('#mid-ver').onchange=ev=>[p1,p2].forEach(i=>{if(i)i.type=ev.target.checked?'text':'password';});
    o.querySelector('#mid-volver').onclick=()=>{vista.paso='lista';vista.error='';dibujar();};
    o.querySelector('#mid-ok').onclick=()=>confirmar(p1.value,p2?p2.value:null);
    [p1,p2].forEach(i=>{if(i)i.addEventListener('keydown',ev=>{if(ev.key==='Enter')confirmar(p1.value,p2?p2.value:null);});});
    if(!bloqueado)p1.focus();
  }

  async function elegir(id){
    const w=tecnicosDisponibles().find(x=>x.id===id);
    if(!w)return;
    vista={paso:'pin',worker:w,busqueda:'',error:'',estado:null,ocupado:false};
    try{vista.estado=await Proveedor().estado(w);}
    catch(err){vista.estado={tienePin:false};vista.error='No se pudo consultar el PIN: '+(err&&err.message||err);}
    dibujar();
  }

  async function confirmar(pin,pin2){
    if(vista.ocupado)return;
    const w=vista.worker,e=vista.estado||{};
    vista.error='';
    if(!e.tienePin){
      const msg=pinValido(pin);
      if(msg)vista.error=msg;
      else if(pin!==pin2)vista.error='Los PIN no coinciden.';
    }else if(!/^\d+$/.test(pin||''))vista.error='Ingresa tu PIN.';
    if(vista.error){dibujar();return;}
    vista.ocupado=true;dibujar();
    try{
      let r;
      if(!e.tienePin){
        r=await Proveedor().crear(w,pin);
        if(r.ok)r=await Proveedor().verificar(w,pin);
      }else r=await Proveedor().verificar(w,pin);
      vista.ocupado=false;
      if(r&&r.ok){iniciarSesion(w,r.token);return;}
      vista.error=(r&&r.error)||'PIN incorrecto.';
      if(r&&r.restantes>0)vista.error+=' Intentos restantes: '+r.restantes+'.';
      if(r&&r.bloqueadoHasta)vista.estado=Object.assign({},e,{bloqueadoHasta:r.bloqueadoHasta});
      if(r&&r.sinPin)vista.estado={tienePin:false};
    }catch(err){
      vista.ocupado=false;
      vista.error='Error: '+(err&&err.message||err);
    }
    dibujar();
  }

  /* ---------- chip del técnico activo en la barra superior ---------- */
  function pintarChip(){
    const cont=document.querySelector('.topbar-title');
    if(!cont)return;
    let chip=document.getElementById('mant-tecnico-chip');
    const t=window.esMantCompartido()?window.mantTecnicoActivo():null;
    if(!t){chip?.remove();return;}
    inyectarEstilos();
    if(!chip){
      chip=document.createElement('span');
      chip.id='mant-tecnico-chip';
      chip.title='Tocar para cambiar de técnico';
      chip.onclick=()=>{
        const act=window.mantTecnicoActivo();
        if(confirm('¿Cerrar la identificación de '+(act?act.nombre:'este técnico')+' y cambiar de técnico?'))
          window.mantCerrarIdentificacion(true);
      };
      cont.appendChild(chip);
    }
    chip.textContent='👤 '+t.nombre+' · cambiar';
  }

  /* ---------- vencimiento por inactividad / duración ---------- */
  function tocar(){
    if(!sesion)return;
    const t=ahora();
    sesion.actividad=t;
    if(t-ultimoGuardadoAct>15000){ultimoGuardadoAct=t;guardarSesion();}
  }
  function vigilar(){
    if(!window.esMantCompartido()||!state.user)return;
    if(!window.mantTecnicoActivo()&&!document.getElementById('mant-id-overlay')){
      pintarChip();emitir();abrirOverlay();
    }
  }
  function armarVigilancia(){
    if(temporizador)return;
    ['pointerdown','keydown','touchstart','scroll'].forEach(ev=>
      document.addEventListener(ev,tocar,{passive:true,capture:true}));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)vigilar();});
    temporizador=setInterval(vigilar,20000);
  }

  /* ---------- enganche con el inicio y cierre de sesión ---------- */
  if(typeof enterApp==='function'){
    const anterior=enterApp;
    enterApp=function(){
      const r=anterior.apply(this,arguments);
      try{
        if(window.esMantCompartido()){
          armarVigilancia();
          empezarEscucha();
          sesion=leerSesion();
          if(vigente(sesion)){pintarChip();emitir();}
          else{sesion=null;guardarSesion();abrirOverlay();}
        }
      }catch(e){console.error('Identificación de técnicos:',e);}
      return r;
    };
    window.enterApp=enterApp;
  }
  if(typeof handleLogout==='function'){
    const anterior=handleLogout;
    handleLogout=function(){
      const r=anterior.apply(this,arguments);
      if(!state.user){sesion=null;guardarSesion();cerrarOverlay();pintarChip();}
      return r;
    };
    window.handleLogout=handleLogout;
  }
  if(typeof renderSidebar==='function'){
    const anterior=renderSidebar;
    renderSidebar=function(){
      const r=anterior.apply(this,arguments);
      try{pintarChip();}catch(_){/* no crítico */}
      return r;
    };
    window.renderSidebar=renderSidebar;
  }
})();
