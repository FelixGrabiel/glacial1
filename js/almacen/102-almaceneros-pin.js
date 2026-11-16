/* =============================================================
   GLACIAL · ALMACÉN · ALMACENEROS Y PIN PERSONAL (para la cuenta compartida)
   -------------------------------------------------------------
   La cuenta compartida (rol almacen_compartido, 103-almacen-compartido.js) la usan varios almaceneros. Al entrar aparece «¿Quién eres?»:
     1) se elige el almacenero (los activos de la lista almaceneros/{id});
     2) la primera vez crea su PIN (4 a 6 dígitos); después lo ingresa.
   · La identificación vive solo en esta pestaña (sessionStorage), vence por INACTIVIDAD (30 min) y por DURACIÓN (12 h) y se puede cambiar de persona.
   · 5 intentos fallidos bloquean a ese almacenero 10 minutos en este equipo.
   · El PIN se guarda con PBKDF2-SHA256 y sal propia. Es TRAZABILIDAD (quién recibió cada paleta), no una barrera de seguridad: la cuenta puede leer los hashes, igual que
     en Mantenimiento (modo «local»). La restricción real de la cuenta está en el servidor (glacial_57).
   · La lista (agregar, desactivar, reiniciar PIN) la administran quienes tienen el permiso de Almacén, desde Producto terminado › Almaceneros.
   Cargar DESPUÉS de 101-producto-terminado.js.
   ============================================================= */
(function(raiz){
  'use strict';
  const CFG={pinMin:4,pinMax:6,maxIntentos:5,bloqueoMin:10,inactividadMin:30,duracionMaxH:12};
  const CLAVE_SESION='glacial.almacen.persona.v1',CLAVE_INTENTOS='glacial.almacen.intentos.v1';

  /* ---------- lógica pura (se prueba con node) ---------- */
  const b64=bytes=>{let s='';bytes.forEach(b=>{s+=String.fromCharCode(b);});return (typeof btoa==='function'?btoa(s):Buffer.from(s,'binary').toString('base64'));};
  const deB64=t=>{const s=typeof atob==='function'?atob(t):Buffer.from(t,'base64').toString('binary');const o=new Uint8Array(s.length);for(let i=0;i<s.length;i++)o[i]=s.charCodeAt(i);return o;};
  const nuevoSalt=()=>{const a=new Uint8Array(16);(raiz.crypto||globalThis.crypto).getRandomValues(a);return b64(a);};
  async function derivar(pin,salt){
    const c=raiz.crypto||globalThis.crypto;
    const base=await c.subtle.importKey('raw',new TextEncoder().encode(String(pin)),'PBKDF2',false,['deriveBits']);
    const bits=await c.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:deB64(salt),iterations:100000},base,256);
    return b64(new Uint8Array(bits));
  }
  /** Texto del problema o '' si el PIN sirve. */
  function pinValido(pin){
    if(!new RegExp('^\\d{'+CFG.pinMin+','+CFG.pinMax+'}$').test(String(pin||'')))return 'El PIN debe tener de '+CFG.pinMin+' a '+CFG.pinMax+' dígitos.';
    if(/^(\d)\1+$/.test(pin)||['1234','12345','123456','0123','4321','54321','654321'].includes(pin))return 'Ese PIN es muy fácil de adivinar: elige otro.';
    return '';
  }
  const activos=lista=>(lista||[]).filter(a=>a&&a.id&&a.activo!==false).sort((x,y)=>String(x.nombre).localeCompare(String(y.nombre),'es'));
  const tienePin=a=>!!(a&&a.hash&&a.salt);
  /** s: {id,nombre,inicio,ultimo} → true si sigue vigente. */
  function sesionVigente(s,ahora){
    if(!s||!s.id||!s.inicio||!s.ultimo)return false;
    if(ahora-s.inicio>CFG.duracionMaxH*3600000)return false;
    if(ahora-s.ultimo>CFG.inactividadMin*60000)return false;
    return true;
  }
  /** reg: {n, hasta} del almacenero → {bloqueado, minutos}. */
  function estadoBloqueo(reg,ahora){
    if(!reg||!reg.hasta||reg.hasta<=ahora)return {bloqueado:false,minutos:0};
    return {bloqueado:true,minutos:Math.ceil((reg.hasta-ahora)/60000)};
  }
  async function verificar(almacenero,pin){return tienePin(almacenero)&&(await derivar(pin,almacenero.salt))===almacenero.hash;}
  const NUCLEO={CFG,derivar,nuevoSalt,pinValido,activos,tienePin,sesionVigente,estadoBloqueo,verificar};
  if(typeof module!=='undefined'&&module.exports)module.exports=NUCLEO;
  if(typeof window==='undefined'||!window.document)return;

  /* ---------- datos ---------- */
  const W=window;
  const ES={lista:[],listo:false,error:'',escuchando:false,cierre:null,vista:{paso:'lista',id:'',error:'',ocupado:false},msgAdmin:null,nombreNuevo:''};
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ahora=()=>typeof W.tareoAhoraServidor==='function'?W.tareoAhoraServidor():Date.now();
  const store=(tipo)=>{try{return tipo==='local'?W.localStorage:W.sessionStorage;}catch(_){return null;}};
  const leerJSON=(tipo,clave)=>{try{const s=store(tipo);return s?JSON.parse(s.getItem(clave)||'null'):null;}catch(_){return null;}};
  const guardarJSON=(tipo,clave,v)=>{try{const s=store(tipo);if(s){if(v===null)s.removeItem(clave);else s.setItem(clave,JSON.stringify(v));}}catch(_){/* sin almacenamiento: se pide el PIN cada vez */}};
  const oyentes=[];const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(_){/* una vista no rompe a otra */}});
  function escuchar(){
    if(ES.escuchando||typeof db==='undefined')return;ES.escuchando=true;
    ES.cierre=db.collection('almaceneros').onSnapshot(s=>{ES.lista=s.docs.map(d=>d.data()).filter(x=>x&&x.id);ES.listo=true;ES.error='';avisar();repintarOverlay();},
      e=>{ES.error=String((e&&e.message)||e);ES.listo=true;avisar();repintarOverlay();});
  }
  function detener(){ES.escuchando=false;if(ES.cierre){try{ES.cierre();}catch(_){/* ya cerrada */}ES.cierre=null;}}
  if(W.glacialCierresSesion)W.glacialCierresSesion.push(()=>{detener();ES.lista=[];ES.listo=false;guardarJSON('session',CLAVE_SESION,null);cerrarOverlay();});
  const porId=id=>ES.lista.find(a=>a.id===id)||null;
  const quien=()=>{const u=(typeof state!=='undefined'&&state.user)||{};return u.nombre||u.username||'Usuario';};

  /* ---------- persona identificada (solo la cuenta compartida) ---------- */
  function activa(){
    const s=leerJSON('session',CLAVE_SESION);
    if(!sesionVigente(s,ahora())){if(s)guardarJSON('session',CLAVE_SESION,null);return null;}
    return {id:s.id,nombre:s.nombre};
  }
  function tocar(){const s=leerJSON('session',CLAVE_SESION);if(s&&sesionVigente(s,ahora())){s.ultimo=ahora();guardarJSON('session',CLAVE_SESION,s);}}
  function cerrarIdentificacion(){guardarJSON('session',CLAVE_SESION,null);avisar();}
  ['click','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,()=>{try{tocar();}catch(_){/* informativo */}},{passive:true}));
  setInterval(()=>{try{if(W.esAlmacenCompartido&&W.esAlmacenCompartido()&&typeof state!=='undefined'&&state.user&&!activa())abrirIdentificacion();}catch(_){/* informativo */}},30000);

  /* ---------- lista (quienes tienen el permiso de Almacén) ---------- */
  const idNuevo=()=>'alm_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  async function agregar(nombre){
    const n=String(nombre||'').replace(/\s+/g,' ').trim();
    if(n.length<2||n.length>80)throw new Error('Escribe el nombre del almacenero (de 2 a 80 caracteres).');
    if(ES.lista.some(a=>String(a.nombre).toLowerCase()===n.toLowerCase()))throw new Error('Ya hay un almacenero con ese nombre.');
    const id=idNuevo();
    await db.collection('almaceneros').doc(id).set({id,nombre:n,activo:true,creadoEn:ahora(),creadoPor:quien()});
  }
  async function cambiar(id,cambios){
    const a=porId(id);if(!a)throw new Error('El almacenero ya no existe.');
    const nuevo={...a,...cambios,actualizadoEn:ahora(),actualizadoPor:quien()};
    Object.keys(nuevo).forEach(k=>{if(nuevo[k]===undefined)delete nuevo[k];});
    await db.collection('almaceneros').doc(id).set(nuevo);
  }
  const activar=(id,si)=>cambiar(id,{activo:!!si});
  const reiniciarPin=id=>{const a=porId(id);if(!a)return Promise.reject(new Error('El almacenero ya no existe.'));const {salt,hash,pinCreadoEn,pinActualizadoEn,...resto}=a;return db.collection('almaceneros').doc(id).set({...resto,actualizadoEn:ahora(),actualizadoPor:quien()});};
  async function crearPin(id,pin){
    const a=porId(id);if(!a)throw new Error('El almacenero ya no existe.');
    const salt=nuevoSalt();
    await db.collection('almaceneros').doc(id).set({...a,salt,hash:await derivar(pin,salt),pinCreadoEn:ahora(),pinActualizadoEn:ahora()});   // la cuenta compartida solo puede cambiar estos campos (glacial_57)
  }
  const intentos=()=>leerJSON('local',CLAVE_INTENTOS)||{};
  function registrarFallo(id){const t=intentos(),r=t[id]||{n:0,hasta:0};r.n++;if(r.n>=CFG.maxIntentos){r.hasta=ahora()+CFG.bloqueoMin*60000;r.n=0;}t[id]=r;guardarJSON('local',CLAVE_INTENTOS,t);return r;}
  const limpiarFallos=id=>{const t=intentos();delete t[id];guardarJSON('local',CLAVE_INTENTOS,t);};

  /* ---------- «¿Quién eres?» ---------- */
  function estilosOverlay(){return `<style id="alm-id-estilos">
#alm-id-overlay{position:fixed;inset:0;z-index:200;background:rgba(5,25,45,.78);display:grid;place-items:center;padding:16px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
#alm-id-overlay .ai-c{background:#fff;color:#14263a;border-radius:20px;width:min(440px,100%);max-height:92vh;overflow:auto;padding:22px;box-shadow:0 30px 80px rgba(0,20,40,.5)}
#alm-id-overlay h2{margin:0 0 4px;font-size:22px;color:#0b2a4a}#alm-id-overlay p{margin:0 0 12px;color:#587087;font-size:14px}
#alm-id-overlay .ai-l{display:grid;gap:8px}#alm-id-overlay .ai-b{min-height:52px;border-radius:12px;border:1px solid #cddfec;background:#f6fafd;font:inherit;font-size:16px;font-weight:700;color:#0b2a4a;cursor:pointer;text-align:left;padding:0 14px;display:flex;justify-content:space-between;align-items:center}
#alm-id-overlay .ai-b small{font-weight:600;color:#587087}#alm-id-overlay .ai-b:hover{border-color:#0ea5e9}
#alm-id-overlay input{width:100%;min-height:54px;border:1.5px solid #cddfec;border-radius:12px;font:inherit;font-size:24px;letter-spacing:.4em;text-align:center;margin-bottom:10px}
#alm-id-overlay .ai-p{min-height:48px;border:0;border-radius:12px;background:#0877a6;color:#fff;font:inherit;font-weight:700;cursor:pointer;width:100%}#alm-id-overlay .ai-p:disabled{opacity:.55}
#alm-id-overlay .ai-s{min-height:44px;border:0;background:none;color:#0877a6;font:inherit;font-weight:700;cursor:pointer;margin-top:6px}
#alm-id-overlay .ai-e{color:#c62828;font-size:13.5px;margin:0 0 8px;min-height:18px}
</style>`;}
  function htmlOverlay(){
    const v=ES.vista;
    if(v.paso==='lista'){
      const l=activos(ES.lista);
      return `<h2>¿Quién eres?</h2><p>Elige tu nombre para registrar lo que recibes.</p>${ES.error?`<p class="ai-e">${esc(ES.error)}</p>`:''}${!ES.listo?'<p>Cargando…</p>':''}
        <div class="ai-l">${l.map(a=>`<button type="button" class="ai-b" onclick="alElegir('${esc(a.id)}')"><span>${esc(a.nombre)}</span><small>${tienePin(a)?'':'crear PIN'}</small></button>`).join('')}</div>
        ${ES.listo&&!l.length?'<p>No hay almaceneros registrados. Pide a quien administra Almacén que te agregue en Producto terminado › Almaceneros.</p>':''}`;
    }
    const a=porId(v.id);if(!a)return '<p>Ese almacenero ya no está.</p><button type="button" class="ai-s" onclick="alVolver()">Volver</button>';
    const crear=!tienePin(a),b=estadoBloqueo(intentos()[a.id],ahora());
    const campo=(id,ph)=>`<input type="password" id="${id}" inputmode="numeric" pattern="[0-9]*" maxlength="${CFG.pinMax}" placeholder="${ph}" autocomplete="off" ${b.bloqueado?'disabled':''}>`;
    return `<h2>${esc(a.nombre)}</h2><p>${crear?'Es tu primera vez: crea un PIN de '+CFG.pinMin+' a '+CFG.pinMax+' dígitos.':'Ingresa tu PIN.'}</p>${campo('alm-pin','PIN')}${crear?campo('alm-pin2','Repite el PIN'):''}
      <p class="ai-e" role="alert">${b.bloqueado?'Demasiados intentos. Espera '+b.minutos+' min.':esc(v.error)}</p>
      <button type="button" class="ai-p" onclick="alConfirmar()" ${v.ocupado||b.bloqueado?'disabled':''}>${v.ocupado?'Verificando…':crear?'Crear PIN y entrar':'Entrar'}</button><button type="button" class="ai-s" onclick="alVolver()">Elegir a otra persona</button>`;
  }
  function repintarOverlay(forzar){const c=document.querySelector('#alm-id-overlay .ai-c');if(c&&(forzar||!document.querySelector('#alm-id-overlay input:focus')))c.innerHTML=htmlOverlay();}
  function abrirIdentificacion(){
    if(document.getElementById('alm-id-overlay'))return;
    escuchar();ES.vista={paso:'lista',id:'',error:'',ocupado:false};
    const o=document.createElement('div');o.id='alm-id-overlay';o.setAttribute('role','dialog');o.setAttribute('aria-modal','true');o.setAttribute('aria-label','Identificación del almacenero');
    o.innerHTML=estilosOverlay()+`<div class="ai-c">${htmlOverlay()}</div>`;document.body.appendChild(o);
  }
  function cerrarOverlay(){const o=document.getElementById('alm-id-overlay');if(o)o.remove();}
  W.alElegir=id=>{ES.vista={paso:'pin',id,error:'',ocupado:false};repintarOverlay();setTimeout(()=>{const i=document.getElementById('alm-pin');if(i)i.focus();},50);};
  W.alVolver=()=>{ES.vista={paso:'lista',id:'',error:'',ocupado:false};repintarOverlay();};
  W.alConfirmar=async()=>{
    const v=ES.vista,a=porId(v.id);if(!a||v.ocupado)return;
    const pin=(document.getElementById('alm-pin')||{}).value||'',pin2=(document.getElementById('alm-pin2')||{}).value;
    v.error='';
    if(!tienePin(a)){
      const m=pinValido(pin);if(m)v.error=m;else if(pin!==pin2)v.error='Los PIN no coinciden.';
      if(v.error){repintarOverlay(true);return;}
      v.ocupado=true;repintarOverlay(true);
      try{await crearPin(a.id,pin);}catch(e){v.ocupado=false;v.error='No se pudo guardar el PIN: '+((e&&e.message)||e);repintarOverlay(true);return;}
    }else{
      if(!/^\d+$/.test(pin)){v.error='Ingresa tu PIN.';repintarOverlay(true);return;}
      v.ocupado=true;repintarOverlay(true);
      let bien=false;try{bien=await verificar(a,pin);}catch(_){bien=false;}
      if(!bien){const r=registrarFallo(a.id);v.ocupado=false;v.error=r.hasta>ahora()?'':'PIN incorrecto.';repintarOverlay(true);return;}
    }
    limpiarFallos(a.id);guardarJSON('session',CLAVE_SESION,{id:a.id,nombre:a.nombre,inicio:ahora(),ultimo:ahora()});
    cerrarOverlay();avisar();
  };

  /* ---------- administración de la lista (pestaña Almaceneros de Producto terminado) ---------- */
  function htmlAdmin(){
    escuchar();
    const l=ES.lista.slice().sort((x,y)=>String(x.nombre).localeCompare(String(y.nombre),'es'));
    return `<div class="pt-card"><h3>Almaceneros que usan la cuenta compartida</h3>
      <p class="pt-mut">Cada almacenero se identifica con su PIN personal al recibir; así queda registrado quién recibió cada paleta. «Reiniciar PIN» le deja crear uno nuevo.</p>
      ${ES.msgAdmin?`<div class="pt-msg ${ES.msgAdmin.tipo==='error'?'pt-msg-e':'pt-msg-k'}" role="status">${esc(ES.msgAdmin.texto)}</div>`:''}
      <div class="pt-form"><label>Nombre del almacenero<input type="text" maxlength="80" value="${esc(ES.nombreNuevo)}" oninput="alNombre(this.value)" aria-label="Nombre del almacenero"></label><button type="button" class="pt-b pt-b-v" onclick="alAgregar()">Agregar</button></div>
      ${l.length?`<table class="pt-t"><thead><tr><th>Almacenero</th><th>Estado</th><th>PIN</th><th></th></tr></thead><tbody>${l.map(a=>`<tr><td data-l="Almacenero"><b>${esc(a.nombre)}</b></td><td data-l="Estado">${a.activo===false?'<span class="pt-pill pt-obs">Desactivado</span>':'<span class="pt-pill pt-ok">Activo</span>'}</td><td data-l="PIN">${tienePin(a)?'Creado':'<span class="pt-mut">Falta crearlo</span>'}</td>
        <td><div class="pt-ac"><button type="button" class="pt-b" onclick="alActivar('${esc(a.id)}',${a.activo===false?'true':'false'})">${a.activo===false?'Activar':'Desactivar'}</button>${tienePin(a)?`<button type="button" class="pt-b pt-b-r" onclick="alReiniciar('${esc(a.id)}')">Reiniciar PIN</button>`:''}</div></td></tr>`).join('')}</tbody></table>`:`<div class="pt-vacio">${ES.listo?'Todavía no hay almaceneros. Agrega el primero.':'Consultando…'}</div>`}</div>`;
  }
  const hacer=async(f,ok)=>{try{await f();ES.msgAdmin={tipo:'ok',texto:ok};}catch(e){ES.msgAdmin={tipo:'error',texto:(e&&e.message)||String(e)};}avisar();};
  W.alNombre=v=>{ES.nombreNuevo=v;};
  W.alAgregar=()=>hacer(async()=>{await agregar(ES.nombreNuevo);ES.nombreNuevo='';},'Almacenero agregado.');
  W.alActivar=(id,si)=>hacer(()=>activar(id,si),si?'Almacenero activado.':'Almacenero desactivado.');
  W.alReiniciar=id=>hacer(()=>reiniciarPin(id),'PIN reiniciado: creará uno nuevo la próxima vez que entre.');
  W.glacialAlmaceneros={activa,cerrarIdentificacion,abrirIdentificacion,htmlAdmin,escuchar,detener,estado:ES,alCambiar:f=>{oyentes.push(f);}};
  if(W.glacialAlmacenPT&&W.glacialAlmacenPT.repintar)oyentes.push(W.glacialAlmacenPT.repintar);       // la bandeja se actualiza cuando cambia la lista o la persona identificada
})(typeof window!=='undefined'?window:globalThis);
