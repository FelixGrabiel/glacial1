/* =============================================================
   GLACIAL · SEGURIDAD: FIREBASE AUTHENTICATION (ETAPA 1)
   -------------------------------------------------------------
   Qué hace:
   - Cada usuario tiene una cuenta real de Firebase Authentication.
     El usuario de siempre se traduce a un correo interno
     usuario@AUTH_DOMINIO (ver 01-config.js). No cambia cómo escriben
     su usuario en el login.
   - Migración por CONTRASEÑA TEMPORAL: el Administrador crea las cuentas;
     cada usuario debe cambiar su clave en el primer ingreso. Al migrar,
     se borran del documento de usuarios la contraseña y el hash (ya no
     quedan expuestos).
   - Restablecer contraseña (Administrador): se crea una cuenta nueva
     (usuario.1@…, usuario.2@…) con una clave temporal; la anterior
     queda sin acceso. (Sin servidor no se puede cambiar la clave de otro.)
   - sync/perfiles: mapa uid → {username, rol, permisos}. Las reglas
     estrictas de Firestore (etapa 2) lo usan para saber quién es quién.
   - NO usa servidor ni Cloud Functions.

   Marca de "clave temporal": displayName = 'TEMP' en la cuenta; se
   limpia al cambiar la contraseña (sin escribir en Firestore).

   Cargar DESPUÉS de 03-auth.js, 10-usuarios.js y 23; antes de 12-init.js.
   Etapas y reglas: ver firestore.rules.etapa1.txt / etapa2.txt.
   ============================================================= */
(function instalarSeguridadAuth(){
  'use strict';

  const disponible=()=>typeof auth!=='undefined'&&!!auth;
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  const slug=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9._-]/g,'_').replace(/^_+|_+$/g,'')||'usuario';
  const emailDe=(username,idx)=>`${slug(username)}${idx>0?'.'+idx:''}@${AUTH_DOMINIO}`;

  function claveTemporal(){
    const abc='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes=new Uint32Array(10);crypto.getRandomValues(bytes);
    return Array.from(bytes,b=>abc[b%abc.length]).join('')+'7';
  }

  function esAdministrador(){
    return !!state.user&&String(state.user.rol||'').trim()==='Administrador';
  }
  window.esAdministradorSeguridad=esAdministrador;

  /* ---------- cuentas ---------- */

  /* Crea la cuenta SIN cerrar la sesión de quien la crea (app secundaria). */
  async function crearCuentaSegura(username,clave,idx){
    if(!disponible())throw new Error('Firebase Authentication no está disponible.');
    const email=emailDe(username,idx||0);
    const app2=(firebase.apps.find(a=>a.name==='secundaria'))||firebase.initializeApp(FIREBASE_CONFIG,'secundaria');
    const a2=app2.auth();
    const cred=await a2.createUserWithEmailAndPassword(email,clave);
    try{await cred.user.updateProfile({displayName:'TEMP'});}catch(_){/* no crítico */}
    const uid=cred.user.uid;
    await a2.signOut();
    return {uid,email};
  }
  window.crearCuentaSegura=crearCuentaSegura;

  /* Crea una cuenta probando sufijos si el correo ya existe. */
  async function crearConReintentos(username,clave,desde,usados){
    let idx=desde;
    for(let i=0;i<6;i++,idx++){
      const email=emailDe(username,idx);
      if(usados.has(email))continue;
      try{
        const r=await crearCuentaSegura(username,clave,idx);
        usados.add(r.email);
        return {...r,idx};
      }catch(e){
        if(e&&e.code==='auth/email-already-in-use'){usados.add(email);continue;}
        throw e;
      }
    }
    throw new Error('No se pudo crear una cuenta única para '+username);
  }

  /* ---------- inicio de sesión ---------- */
  window.autenticarConFirebase=async function(usuario,pass){
    if(!disponible())return false;
    try{
      await auth.signInWithEmailAndPassword(usuario.authEmail||emailDe(usuario.username,usuario.authIdx||0),pass);
      return true;
    }catch(e){
      console.warn('Login seguro rechazado:',e&&e.code);
      return false;
    }
  };

  /* ---------- modo ESTRICTO (etapa 2): la lectura exige sesión ---------- */
  let sincIniciada=false;
  window.iniciarSincronizacionSegura=function(){
    if(sincIniciada)return;
    sincIniciada=true;
    initRealtimeSync();
  };
  window.esperarUsuariosListos=async function(ms){
    const limite=Date.now()+(ms||8000);
    while(typeof _usersReady!=='undefined'&&!_usersReady&&Date.now()<limite){
      await new Promise(r=>setTimeout(r,150));
    }
    return typeof _usersReady!=='undefined'&&_usersReady;
  };
  /* Antes de poder leer usuarios hay que autenticarse: el correo de cada
     usuario se busca en sync/accesos (documento público con solo usuario → correo). */
  window.loginEstricto=async function(username,pass){
    try{
      const doc=await db.collection('sync').doc('accesos').get();
      const mapa=doc.exists?(doc.data().map||{}):{};
      const email=mapa[String(username||'').trim().toLowerCase()];
      if(!email)return {ok:false};
      await auth.signInWithEmailAndPassword(email,pass);
      window.iniciarSincronizacionSegura();
      await window.esperarUsuariosListos();
      return {ok:true};
    }catch(e){
      console.warn('Login estricto rechazado:',e&&e.code);
      return {ok:false};
    }
  };

  window.debeCambiarClaveSegura=()=>!!(disponible()&&auth.currentUser&&auth.currentUser.displayName==='TEMP');

  /* Ventana obligatoria para cambiar la clave temporal. Devuelve true si se cambió. */
  window.forzarCambioClave=function(){
    return new Promise(resolve=>{
      const fondo=document.createElement('div');
      fondo.style.cssText='position:fixed;inset:0;background:rgba(10,30,50,.6);display:flex;align-items:center;justify-content:center;z-index:10001;padding:16px;';
      fondo.innerHTML=`<div class="modal" style="max-width:420px;width:100%;">
        <div class="modal-head"><h3>Crea tu contraseña</h3></div>
        <div class="modal-body">
          <p class="small-muted" style="margin:0 0 12px;">Estás usando una contraseña temporal. Crea una nueva para continuar (mínimo 8 caracteres, con letras y números).</p>
          <div class="field-sm"><label>Nueva contraseña</label><input type="password" id="sec-nueva" autocomplete="new-password"></div>
          <div class="field-sm"><label>Repetir contraseña</label><input type="password" id="sec-repetir" autocomplete="new-password"></div>
          <label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="sec-mostrar"> Mostrar contraseña
          </label>
          <div id="sec-error" style="color:#c62828;font-size:12px;min-height:16px;margin-top:6px;"></div>
          <div class="actions-row" style="justify-content:flex-end;gap:8px;">
            <button class="btn btn-ghost" id="sec-cancelar">Cancelar</button>
            <button class="btn btn-primary" id="sec-guardar">Guardar contraseña</button>
          </div></div></div>`;
      document.body.appendChild(fondo);
      const err=t=>{fondo.querySelector('#sec-error').textContent=t;};
      // Mostrar / ocultar lo que se escribe en ambos campos.
      fondo.querySelector('#sec-mostrar').onchange=e=>{
        const tipo=e.target.checked?'text':'password';
        fondo.querySelector('#sec-nueva').type=tipo;
        fondo.querySelector('#sec-repetir').type=tipo;
      };
      fondo.querySelector('#sec-cancelar').onclick=()=>{fondo.remove();resolve(false);};
      fondo.querySelector('#sec-guardar').onclick=async()=>{
        const n=fondo.querySelector('#sec-nueva').value,r=fondo.querySelector('#sec-repetir').value;
        if(n.length<8||!/[A-Za-z]/.test(n)||!/\d/.test(n)){err('Mínimo 8 caracteres, con letras y números.');return;}
        if(n!==r){err('Las contraseñas no coinciden.');return;}
        try{
          await auth.currentUser.updatePassword(n);
          await auth.currentUser.updateProfile({displayName:''});
          fondo.remove();resolve(true);
        }catch(e){err('No se pudo cambiar la contraseña: '+(e&&e.message?e.message:e));}
      };
      fondo.querySelector('#sec-nueva').focus();
    });
  };

  /* ---------- perfiles para las reglas de Firestore ---------- */
  let avisadoPerfiles=false;
  async function publicarPerfiles(){
    if(!esAdministrador())return;
    const usuarios=(typeof loadUsers==='function'?loadUsers():[])||[];
    if(!usuarios.some(u=>u&&u.authUid))return;
    const mapa={};
    usuarios.forEach(u=>{
      if(!u||!u.authUid)return;
      mapa[u.authUid]={username:u.username,rol:String(u.rol||''),
        permisos:u.permisos==='todos'?'todos':(Array.isArray(u.permisos)?u.permisos:[])};
    });
    // Usuario (minúsculas) → correo interno: lo usa el login en modo estricto.
    const accesos={};
    usuarios.forEach(u=>{
      if(u&&u.authUid&&u.authEmail)accesos[String(u.username||'').trim().toLowerCase()]=u.authEmail;
    });
    try{
      await db.collection('sync').doc('perfiles').set({map:mapa,updatedAt:Date.now()});
      await db.collection('sync').doc('accesos').set({map:accesos,updatedAt:Date.now()});
    }catch(e){
      console.warn('No se pudo publicar sync/perfiles:',e);
      if(!avisadoPerfiles){
        avisadoPerfiles=true;
        alert('No se pudo guardar el documento "perfiles" o "accesos".\n\nAgrega \'perfiles\' y \'accesos\' a la lista de documentos de las reglas de Firestore (ver firestore.rules.etapa1.txt).');
      }
    }
  }
  window.publicarPerfiles=publicarPerfiles;

  /* Cada vez que se guardan usuarios, se actualizan los perfiles. */
  if(typeof saveUsers==='function'){
    const original=saveUsers;
    saveUsers=function(){
      const r=original.apply(this,arguments);
      Promise.resolve(r).then(()=>publicarPerfiles()).catch(()=>{});
      return r;
    };
    window.saveUsers=saveUsers;
  }

  /* ---------- pantallas de administración ---------- */
  function mostrarClaves(titulo,filas){
    const fondo=document.createElement('div');
    fondo.style.cssText='position:fixed;inset:0;background:rgba(10,30,50,.6);display:flex;align-items:center;justify-content:center;z-index:10001;padding:16px;';
    const texto=filas.map(f=>`${f.username}\t${f.clave}`).join('\n');
    fondo.innerHTML=`<div class="modal" style="max-width:560px;width:100%;max-height:90vh;overflow:auto;">
      <div class="modal-head"><h3>${esc(titulo)}</h3></div>
      <div class="modal-body">
        <p style="margin:0 0 10px;color:#a92f27;font-size:13px;font-weight:700;">⚠ Estas contraseñas temporales se muestran UNA SOLA VEZ. Cópialas o imprímelas ahora y entrégalas a cada persona (deberá cambiarla al entrar).</p>
        <table class="tareo-table"><thead><tr><th>Usuario</th><th>Contraseña temporal</th></tr></thead>
        <tbody>${filas.map(f=>`<tr><td><strong>${esc(f.username)}</strong></td><td><code style="font-size:14px;">${esc(f.clave)}</code></td></tr>`).join('')}</tbody></table>
        <div class="actions-row" style="justify-content:flex-end;gap:8px;margin-top:14px;">
          <button class="btn btn-ghost" data-copiar>Copiar</button>
          <button class="btn btn-ghost" data-imprimir>Imprimir</button>
          <button class="btn btn-primary" data-cerrar>Ya las guardé</button>
        </div></div></div>`;
    document.body.appendChild(fondo);
    fondo.querySelector('[data-cerrar]').onclick=()=>fondo.remove();
    fondo.querySelector('[data-copiar]').onclick=async()=>{
      try{await navigator.clipboard.writeText(texto);alert('Copiado.');}catch(_){alert('No se pudo copiar; usa Imprimir.');}
    };
    fondo.querySelector('[data-imprimir]').onclick=()=>{
      const w=window.open('','_blank');
      if(!w)return;
      w.document.write(`<html><body style="font-family:sans-serif"><h3>${esc(titulo)}</h3><table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Usuario</th><th>Contraseña temporal</th></tr>${filas.map(f=>`<tr><td>${esc(f.username)}</td><td><code>${esc(f.clave)}</code></td></tr>`).join('')}</table></body></html>`);
      w.document.close();w.print();
    };
  }

  async function migrarUsuariosASeguro(){
    if(!esAdministrador()){alert('Solo el Administrador puede migrar usuarios.');return;}
    if(!disponible()){alert('Firebase Authentication no está cargado.');return;}
    const usuarios=loadUsers().map(u=>({...u}));
    const pendientes=usuarios.filter(u=>u&&!u.authUid);
    if(!pendientes.length){alert('Todos los usuarios ya tienen cuenta segura.');return;}
    if(!confirm(`Se crearán cuentas seguras para ${pendientes.length} usuario(s) con una contraseña temporal.\n\nCada uno deberá cambiarla al entrar. Su contraseña anterior dejará de funcionar.\n\n¿Continuar?`))return;

    const usados=new Set(usuarios.map(u=>u.authEmail).filter(Boolean));
    const filas=[],errores=[];
    for(const u of pendientes){
      const clave=claveTemporal();
      try{
        const r=await crearConReintentos(u.username,clave,0,usados);
        u.authUid=r.uid;u.authEmail=r.email;u.authIdx=r.idx;
        // La contraseña antigua ya no sirve ni debe quedar expuesta.
        delete u.password;delete u.passwordHash;delete u.salt;
        filas.push({username:u.username,clave});
      }catch(e){
        errores.push(`${u.username}: ${e&&e.code?e.code:(e&&e.message)||e}`);
        if(e&&e.code==='auth/operation-not-allowed')break;
      }
    }
    if(filas.length){
      // Solo se actualizan los usuarios migrados (el resto se conserva tal cual).
      const migrados=new Map(pendientes.filter(u=>u.authUid).map(u=>[u.username,u]));
      const finales=loadUsers().map(u=>migrados.get(u.username)||u);
      await saveUsers(finales);
      mostrarClaves('Contraseñas temporales',filas);
      if(typeof renderUserList==='function')renderUserList();
    }
    if(errores.length){
      alert('Algunos usuarios no se migraron:\n\n'+errores.join('\n')+
        (errores.some(e=>e.includes('operation-not-allowed'))
          ?'\n\nActiva "Correo electrónico/contraseña" en Firebase Console > Authentication > Método de acceso.':''));
    }
  }
  window.migrarUsuariosASeguro=migrarUsuariosASeguro;

  async function restablecerClaveUsuario(username){
    if(!esAdministrador()){alert('Solo el Administrador puede restablecer contraseñas.');return;}
    const usuarios=loadUsers().map(u=>({...u}));
    const u=usuarios.find(x=>x&&x.username===username);
    if(!u)return;
    if(!confirm(`¿Restablecer la contraseña de "${username}"?\n\nSe creará una clave temporal y la actual dejará de funcionar.`))return;
    const clave=claveTemporal();
    try{
      const usados=new Set(usuarios.map(x=>x.authEmail).filter(Boolean));
      const r=await crearConReintentos(username,clave,(u.authIdx||0)+1,usados);
      u.authUid=r.uid;u.authEmail=r.email;u.authIdx=r.idx;
      delete u.password;delete u.passwordHash;delete u.salt;
      await saveUsers(loadUsers().map(x=>x.username===username?u:x));
      mostrarClaves('Contraseña temporal',[{username,clave}]);
      if(typeof renderUserList==='function')renderUserList();
    }catch(e){
      alert('No se pudo restablecer: '+(e&&e.message?e.message:e));
    }
  }
  window.restablecerClaveUsuario=restablecerClaveUsuario;

  /* ---------- limpieza de credenciales antiguas ----------
     Quita password, passwordHash y salt de los usuarios que YA tienen cuenta
     segura (authUid). No toca a quienes aún no migraron: perderían su acceso. */
  const CAMPOS_LEGADOS=['password','passwordHash','salt'];
  const tieneRestos=u=>!!u&&CAMPOS_LEGADOS.some(c=>u[c]!==undefined&&u[c]!==null&&u[c]!=='');

  function usuariosConRestos(){
    const todos=(typeof loadUsers==='function'?loadUsers():[])||[];
    return {
      limpiables:todos.filter(u=>u&&u.authUid&&tieneRestos(u)),
      sinMigrar:todos.filter(u=>u&&!u.authUid&&tieneRestos(u))
    };
  }
  window.contarCredencialesLegadas=()=>usuariosConRestos().limpiables.length;

  async function limpiarCredencialesLegadas(){
    if(!esAdministrador()){alert('Solo el Administrador puede limpiar credenciales.');return;}
    const {limpiables,sinMigrar}=usuariosConRestos();
    if(!limpiables.length){
      alert('No hay contraseñas antiguas que limpiar en usuarios con cuenta segura.'+
        (sinMigrar.length?`\n\n${sinMigrar.length} usuario(s) aún no migraron a cuenta segura y conservan su contraseña antigua (migrarlos primero).`:''));
      return;
    }
    const nombres=limpiables.slice(0,15).map(u=>u.username).join(', ')+(limpiables.length>15?'…':'');
    if(!confirm(`Se borrarán la contraseña antigua, su hash y su sal de ${limpiables.length} usuario(s) con cuenta segura:\n\n${nombres}\n\nEstos usuarios seguirán entrando con su cuenta segura. Esta acción no se puede deshacer.\n\n¿Continuar?`))return;
    const claves=new Set(limpiables.map(u=>u.username));
    const finales=loadUsers().map(u=>{
      if(!u||!claves.has(u.username))return u;
      const copia={...u};
      CAMPOS_LEGADOS.forEach(c=>{delete copia[c];});
      return copia;
    });
    try{
      await saveUsers(finales);
      alert(`Listo: se limpiaron ${limpiables.length} usuario(s).`+
        (sinMigrar.length?`\n\nAún conservan contraseña antigua ${sinMigrar.length} usuario(s) sin cuenta segura: migrarlos primero.`:''));
      if(typeof renderUserList==='function')renderUserList();
    }catch(e){
      alert('No se pudo guardar la limpieza: '+(e&&e.message?e.message:e));
    }
  }
  window.limpiarCredencialesLegadas=limpiarCredencialesLegadas;
})();
