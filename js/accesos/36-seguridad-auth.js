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
  // Al cerrar sesión (02-estado.js: detenerSincronizacion) el siguiente inicio de sesión vuelve a abrir las escuchas.
  window.reiniciarSincronizacionSegura=function(){sincIniciada=false;};
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
      await (window.__authPersistenciaLista||Promise.resolve());   // la persistencia debe quedar fijada antes de crear la sesión
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
      // Modo visualización general: las reglas de Firestore bloquean TODA escritura de esta cuenta (soloVista).
      if(window.glacialVista&&window.glacialVista.activoDe(u))mapa[u.authUid].soloVista=true;
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
  /* Archivo de texto con las claves temporales (se descarga en el momento, nunca se vuelve a poder). */
  function textoArchivoClaves(titulo,filas){
    const ahora=new Date();
    const fecha=ahora.toLocaleString('es-PE');
    const entorno=typeof ENTORNO!=='undefined'?ENTORNO:'';
    return [
      'GLACIAL · '+titulo+(entorno?' · entorno: '+entorno:'')+' · '+fecha,
      '',
      'ATENCIÓN: estas contraseñas temporales NO se volverán a mostrar. Entrégalas en privado y borra este archivo después.',
      'Cada persona deberá crear su contraseña propia al entrar por primera vez.',
      '',
      'Usuario\tContraseña temporal',
      ...filas.map(f=>f.username+'\t'+f.clave),
      ''
    ].join('\r\n');
  }
  function descargarTexto(nombre,texto,tipo){
    const blob=new Blob(['\ufeff'+texto],{type:(tipo||'text/plain')+';charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=nombre;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},1500);
  }
  window.__descargarTextoSeguridad=descargarTexto;

  function mostrarClaves(titulo,filas){
    const fondo=document.createElement('div');
    fondo.style.cssText='position:fixed;inset:0;background:rgba(10,30,50,.6);display:flex;align-items:center;justify-content:center;z-index:10001;padding:16px;';
    const texto=filas.map(f=>`${f.username}\t${f.clave}`).join('\n');
    let guardadas=false;                       // ¿las copió, imprimió o descargó?
    fondo.innerHTML=`<div class="modal" style="max-width:560px;width:100%;max-height:90vh;overflow:auto;">
      <div class="modal-head"><h3>${esc(titulo)}</h3></div>
      <div class="modal-body">
        <p style="margin:0 0 10px;color:#a92f27;font-size:13px;font-weight:700;">⚠ Estas contraseñas temporales NO se volverán a ver. Descárgalas, cópialas o imprímelas AHORA y entrégalas en privado (cada persona deberá crear la suya al entrar).</p>
        <table class="tareo-table"><thead><tr><th>Usuario</th><th>Contraseña temporal</th></tr></thead>
        <tbody>${filas.map(f=>`<tr><td><strong>${esc(f.username)}</strong></td><td><code style="font-size:14px;">${esc(f.clave)}</code></td></tr>`).join('')}</tbody></table>
        <p class="small-muted" style="margin:10px 0 0;">El archivo descargado contiene contraseñas: guárdalo en un lugar seguro y bórralo cuando las hayas entregado.</p>
        <div class="actions-row" style="justify-content:flex-end;gap:8px;margin-top:14px;flex-wrap:wrap;">
          <button class="btn btn-primary" data-descargar>⬇ Descargar archivo</button>
          <button class="btn btn-ghost" data-copiar>Copiar</button>
          <button class="btn btn-ghost" data-imprimir>Imprimir</button>
          <button class="btn btn-ghost" data-cerrar>Ya las guardé</button>
        </div></div></div>`;
    document.body.appendChild(fondo);
    fondo.querySelector('[data-descargar]').onclick=()=>{
      const d=new Date(),p2=n=>String(n).padStart(2,'0');
      const nombre='contrasenas-temporales-'+d.getFullYear()+p2(d.getMonth()+1)+p2(d.getDate())+'-'+p2(d.getHours())+p2(d.getMinutes())+'.txt';
      descargarTexto(nombre,textoArchivoClaves(titulo,filas));
      guardadas=true;
    };
    fondo.querySelector('[data-cerrar]').onclick=()=>{
      if(!guardadas&&!confirm('Todavía no descargaste, copiaste ni imprimiste las contraseñas, y NO se volverán a mostrar.\n\n¿Cerrar de todos modos?'))return;
      fondo.remove();
    };
    fondo.querySelector('[data-copiar]').onclick=async()=>{
      try{await navigator.clipboard.writeText(texto);guardadas=true;alert('Copiado.');}catch(_){alert('No se pudo copiar; usa Descargar o Imprimir.');}
    };
    fondo.querySelector('[data-imprimir]').onclick=()=>{
      const w=window.open('','_blank');
      if(!w)return;
      guardadas=true;
      w.document.write(`<html><body style="font-family:sans-serif"><h3>${esc(titulo)}</h3><table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Usuario</th><th>Contraseña temporal</th></tr>${filas.map(f=>`<tr><td>${esc(f.username)}</td><td><code>${esc(f.clave)}</code></td></tr>`).join('')}</table></body></html>`);
      w.document.close();w.print();
    };
  }

  /* Ventana para ELEGIR a quién migrar (casillas). Devuelve los usuarios elegidos o null. */
  function elegirUsuariosAMigrar(pendientes){
    return new Promise(resolve=>{
      const yo=(state.user&&state.user.username)||'';
      const fondo=document.createElement('div');
      fondo.style.cssText='position:fixed;inset:0;background:rgba(10,30,50,.6);display:flex;align-items:center;justify-content:center;z-index:10001;padding:16px;';
      fondo.innerHTML=`<div class="modal" style="max-width:560px;width:100%;max-height:90vh;overflow:auto;">
        <div class="modal-head"><h3>Migrar usuarios a cuentas seguras</h3></div>
        <div class="modal-body">
          <p class="small-muted" style="margin:0 0 10px;">Elige a quién migrar ahora (por ejemplo, un piloto de dos personas). A cada uno se le crea una cuenta segura con una contraseña temporal y <strong>su contraseña anterior deja de funcionar</strong>. Los demás siguen igual.</p>
          <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
            <button class="btn btn-ghost btn-sm" data-todos>Seleccionar todos</button>
            <button class="btn btn-ghost btn-sm" data-ninguno>Quitar selección</button>
            <span class="small-muted" data-cuenta style="align-self:center;">0 seleccionados de ${pendientes.length}</span>
          </div>
          <div style="max-height:46vh;overflow:auto;border:1px solid #d5dfe8;border-radius:8px;">
            ${pendientes.map(u=>`<label style="display:flex;gap:10px;align-items:center;padding:9px 12px;border-bottom:1px solid #eef2f6;cursor:pointer;">
              <input type="checkbox" data-usuario="${esc(u.username)}">
              <span><strong>${esc(u.username)}</strong> · ${esc(u.nombre||'')}<br><span class="small-muted">${esc(u.puesto||u.rol||'')}${u.username===yo?' · <b>eres tú: entrarás con la contraseña temporal</b>':''}</span></span>
            </label>`).join('')}
          </div>
          <div class="actions-row" style="justify-content:flex-end;gap:8px;margin-top:14px;">
            <button class="btn btn-ghost" data-cancelar>Cancelar</button>
            <button class="btn btn-primary" data-migrar disabled>Migrar seleccionados</button>
          </div>
        </div></div>`;
      document.body.appendChild(fondo);
      const cajas=()=>Array.from(fondo.querySelectorAll('input[type=checkbox][data-usuario]'));
      const refrescar=()=>{
        const n=cajas().filter(c=>c.checked).length;
        fondo.querySelector('[data-cuenta]').textContent=n+' seleccionados de '+pendientes.length;
        fondo.querySelector('[data-migrar]').disabled=!n;
      };
      fondo.addEventListener('change',refrescar);
      fondo.querySelector('[data-todos]').onclick=()=>{cajas().forEach(c=>{c.checked=true;});refrescar();};
      fondo.querySelector('[data-ninguno]').onclick=()=>{cajas().forEach(c=>{c.checked=false;});refrescar();};
      fondo.querySelector('[data-cancelar]').onclick=()=>{fondo.remove();resolve(null);};
      fondo.querySelector('[data-migrar]').onclick=()=>{
        const elegidos=cajas().filter(c=>c.checked).map(c=>c.getAttribute?c.getAttribute('data-usuario'):c.dataset.usuario);
        if(!elegidos.length)return;
        fondo.remove();resolve(elegidos);
      };
    });
  }

  async function migrarUsuariosASeguro(){
    if(!esAdministrador()){alert('Solo el Administrador puede migrar usuarios.');return;}
    if(!disponible()){alert('Firebase Authentication no está cargado.');return;}
    const usuarios=loadUsers().map(u=>({...u}));
    const sinMigrar=usuarios.filter(u=>u&&!u.authUid);
    if(!sinMigrar.length){alert('Todos los usuarios ya tienen cuenta segura.');return;}
    // Migración por grupos: se elige a quién (p. ej. un piloto de dos usuarios).
    const elegidos=await elegirUsuariosAMigrar(sinMigrar);
    if(!elegidos||!elegidos.length)return;
    const pendientes=sinMigrar.filter(u=>elegidos.includes(u.username));

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
      const anterior={email:u.authEmail||'',uid:u.authUid||'',username};
      const r=await crearConReintentos(username,clave,(u.authIdx||0)+1,usados);
      u.authUid=r.uid;u.authEmail=r.email;u.authIdx=r.idx;
      delete u.password;delete u.passwordHash;delete u.salt;
      await saveUsers(loadUsers().map(x=>x.username===username?u:x));
      // La cuenta anterior queda sin uso en Authentication: se anota para borrarla a mano.
      await registrarCuentaAntigua({...anterior,motivo:'RESTABLECER'});
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

  /* ---------- cuentas de Authentication que quedan sin uso ---------- */
  /* Al restablecer una clave o eliminar un usuario, la cuenta anterior sigue existiendo en
     Firebase Authentication (el cliente no puede borrarla). Se anota su correo en
     sync/cuentasAntiguas para que comprobarMigracion() la liste y se borre a mano. */
  async function registrarCuentaAntigua(c){
    if(!c||!c.email)return false;
    try{
      const ref=db.collection('sync').doc('cuentasAntiguas');
      await db.runTransaction(async tx=>{
        const s=await tx.get(ref);
        const items=(s.exists&&Array.isArray(s.data().items))?s.data().items.slice():[];
        if(!items.some(x=>x&&x.email===c.email)){
          items.push({email:c.email,uid:c.uid||'',username:c.username||'',motivo:c.motivo||'',
            fecha:Date.now(),registradoPor:(state.user&&state.user.username)||''});
        }
        tx.set(ref,{items,updatedAt:Date.now()});
      });
      return true;
    }catch(e){
      console.warn('No se pudo anotar la cuenta antigua '+c.email+' (revísala a mano en Authentication):',e&&e.message||e);
      return false;
    }
  }
  window.registrarCuentaAntigua=registrarCuentaAntigua;

  /* ---------- comprobación de la migración (antes de pasar a la etapa 2) ---------- */
  const ROL_COMPARTIDA='mantenimiento_compartido';
  async function comprobarMigracion(opciones){
    const silencioso=opciones&&opciones.silencioso;
    if(!esAdministrador()){alert('Solo el Administrador puede comprobar la migración.');return null;}
    const u=(typeof loadUsers==='function'?loadUsers():[])||[];
    const [perf,acc,viejas]=await Promise.all([
      db.collection('sync').doc('perfiles').get(),
      db.collection('sync').doc('accesos').get(),
      db.collection('sync').doc('cuentasAntiguas').get().catch(()=>null)
    ]);
    const p=perf.exists?(perf.data().map||{}):{};
    const a=acc.exists?(acc.data().map||{}):{};
    const nombres=l=>l.map(x=>x.username);
    const compartidas=u.filter(x=>x&&String(x.rol||'').trim()===ROL_COMPARTIDA);
    const r={
      entorno:typeof ENTORNO!=='undefined'?ENTORNO:'',
      total:u.length,
      sinCuentaSegura:nombres(u.filter(x=>!x.authUid)),
      conRestosDeClave:nombres(u.filter(x=>x.password||x.passwordHash||x.salt)),
      sinPerfil:nombres(u.filter(x=>x.authUid&&!p[x.authUid])),
      rolDistinto:nombres(u.filter(x=>x.authUid&&p[x.authUid]&&String(p[x.authUid].rol||'')!==String(x.rol||''))),
      sinAcceso:nombres(u.filter(x=>x.authUid&&a[String(x.username).toLowerCase()]!==x.authEmail)),
      perfilesSobrantes:Object.keys(p).filter(uid=>!u.some(x=>x.authUid===uid)),
      adminOk:u.filter(x=>String(x.rol||'').trim()==='Administrador').length>0&&
        u.filter(x=>String(x.rol||'').trim()==='Administrador').every(x=>x.authUid&&p[x.authUid]&&String(p[x.authUid].rol)==='Administrador'),
      cuentaCompartida:{
        existe:compartidas.length>0,
        usuarios:nombres(compartidas),
        conCuentaSegura:compartidas.length>0&&compartidas.every(x=>!!x.authUid),
        enPerfiles:compartidas.length>0&&compartidas.every(x=>x.authUid&&!!p[x.authUid]),
        rolCorrecto:compartidas.length>0&&compartidas.every(x=>x.authUid&&p[x.authUid]&&String(p[x.authUid].rol)===ROL_COMPARTIDA)
      }
    };
    // Cuentas de Authentication que ya no se usan (informativo; no impide pasar a la etapa 2).
    const enUso=new Set(u.map(x=>x.authEmail).filter(Boolean));
    const registradas=((viejas&&viejas.exists&&Array.isArray(viejas.data().items))?viejas.data().items:[])
      .filter(x=>x&&x.email&&!enUso.has(x.email));
    const inferidas=[];
    u.forEach(x=>{
      for(let i=0;i<(Number(x.authIdx)||0);i++){
        const e=emailDe(x.username,i);
        if(enUso.has(e)||registradas.some(c=>c.email===e)||inferidas.some(c=>c.email===e))continue;
        inferidas.push({email:e,username:x.username,motivo:'POSIBLE (por el índice de restablecimientos)'});
      }
    });
    r.cuentasAntiguas={registradas,inferidas};
    const problemas=[];
    if(!r.total)problemas.push('No hay usuarios cargados.');
    if(r.sinCuentaSegura.length)problemas.push('Sin cuenta segura: '+r.sinCuentaSegura.join(', '));
    if(r.conRestosDeClave.length)problemas.push('Con restos de contraseña antigua (usa «Limpiar contraseñas antiguas»): '+r.conRestosDeClave.join(', '));
    if(r.sinPerfil.length)problemas.push('No figuran en perfiles: '+r.sinPerfil.join(', '));
    if(r.rolDistinto.length)problemas.push('Rol distinto en perfiles: '+r.rolDistinto.join(', '));
    if(r.sinAcceso.length)problemas.push('Sin entrada correcta en accesos: '+r.sinAcceso.join(', '));
    if(!r.adminOk)problemas.push('El Administrador no figura correctamente en perfiles.');
    if(!r.cuentaCompartida.existe)problemas.push('No existe la cuenta compartida de Mantenimiento (rol «'+ROL_COMPARTIDA+'»).');
    else{
      if(!r.cuentaCompartida.conCuentaSegura)problemas.push('La cuenta compartida de Mantenimiento no tiene cuenta segura.');
      else if(!r.cuentaCompartida.enPerfiles)problemas.push('La cuenta compartida de Mantenimiento no figura en perfiles.');
      else if(!r.cuentaCompartida.rolCorrecto)problemas.push('La cuenta compartida de Mantenimiento figura en perfiles con otro rol.');
    }
    r.problemas=problemas;
    r.listo=problemas.length===0;
    console.info('Comprobación de migración:',r);
    if(!silencioso)mostrarComprobacion(r);
    return r;
  }
  window.comprobarMigracion=comprobarMigracion;

  function mostrarComprobacion(r){
    const fila=(ok,txt)=>`<li style="margin:4px 0;color:${ok?'#13814a':'#a92f27'};font-weight:700;">${ok?'✔':'✘'} <span style="color:#1b2a38;font-weight:600;">${esc(txt)}</span></li>`;
    const fondo=document.createElement('div');
    fondo.style.cssText='position:fixed;inset:0;background:rgba(10,30,50,.6);display:flex;align-items:center;justify-content:center;z-index:10001;padding:16px;';
    fondo.innerHTML=`<div class="modal" style="max-width:600px;width:100%;max-height:90vh;overflow:auto;">
      <div class="modal-head"><h3>Comprobación de la migración · ${esc(r.entorno)}</h3></div>
      <div class="modal-body">
        <p style="margin:0 0 10px;font-weight:800;color:${r.listo?'#13814a':'#a92f27'};">${r.listo?'LISTO: ya se puede pasar a la etapa 2.':'REVISAR: todavía no se debe activar la etapa 2.'}</p>
        <ul style="list-style:none;padding:0;margin:0;">
          ${fila(r.total>0,r.total+' usuario(s) en total')}
          ${fila(!r.sinCuentaSegura.length,'Todos tienen cuenta segura'+(r.sinCuentaSegura.length?' (faltan: '+r.sinCuentaSegura.join(', ')+')':''))}
          ${fila(!r.conRestosDeClave.length,'Sin restos de contraseña antigua'+(r.conRestosDeClave.length?' ('+r.conRestosDeClave.join(', ')+')':''))}
          ${fila(!r.sinPerfil.length&&!r.rolDistinto.length,'Todos figuran en perfiles con su rol'+((r.sinPerfil.length||r.rolDistinto.length)?' (revisar: '+r.sinPerfil.concat(r.rolDistinto).join(', ')+')':''))}
          ${fila(!r.sinAcceso.length,'Todos figuran en accesos (el login los encuentra)'+(r.sinAcceso.length?' ('+r.sinAcceso.join(', ')+')':''))}
          ${fila(r.adminOk,'El Administrador figura en perfiles como Administrador')}
          ${fila(r.cuentaCompartida.existe&&r.cuentaCompartida.conCuentaSegura&&r.cuentaCompartida.enPerfiles&&r.cuentaCompartida.rolCorrecto,
            r.cuentaCompartida.existe?'Cuenta compartida de Mantenimiento ('+r.cuentaCompartida.usuarios.join(', ')+') con cuenta segura y rol correcto en perfiles':'Existe la cuenta compartida de Mantenimiento')}
        </ul>
        ${(r.cuentasAntiguas.registradas.length||r.cuentasAntiguas.inferidas.length)?`<div style="margin-top:12px;padding:10px 12px;border:1px solid #f0c36a;background:#fff8e6;border-radius:8px;">
          <strong style="font-size:13px;">Cuentas antiguas sin uso (${r.cuentasAntiguas.registradas.length+r.cuentasAntiguas.inferidas.length})</strong>
          <p class="small-muted" style="margin:4px 0 6px;">Bórralas a mano en Firebase Console → Authentication → Usuarios (el cliente no puede borrar cuentas de otros).</p>
          <ul style="margin:0;padding-left:18px;font-size:12px;" data-lista-antiguas>${r.cuentasAntiguas.registradas.concat(r.cuentasAntiguas.inferidas).map(c=>`<li><code>${esc(c.email)}</code> · ${esc(c.username||'')} · <span class="small-muted">${esc(c.motivo||'')}</span></li>`).join('')}</ul>
          <div class="actions-row" style="justify-content:flex-start;gap:8px;margin-top:8px;">
            <button class="btn btn-ghost btn-sm" data-copiar-antiguas>Copiar correos</button>
            ${r.cuentasAntiguas.registradas.length?'<button class="btn btn-ghost btn-sm" data-vaciar-antiguas>Ya las borré (vaciar registro)</button>':''}
          </div></div>`:''}
        ${r.perfilesSobrantes.length?`<p class="small-muted" style="margin:10px 0 0;">Aviso: hay ${r.perfilesSobrantes.length} entrada(s) en perfiles que no corresponden a ningún usuario (no bloquea).</p>`:''}
        <p class="small-muted" style="margin:10px 0 0;">Revisa además en Firebase Console → Authentication que el total de usuarios coincida con ${r.total}.</p>
        <div class="actions-row" style="justify-content:flex-end;margin-top:14px;"><button class="btn btn-primary" data-cerrar>Cerrar</button></div>
      </div></div>`;
    document.body.appendChild(fondo);
    fondo.querySelector('[data-cerrar]').onclick=()=>fondo.remove();
    const copiar=fondo.querySelector('[data-copiar-antiguas]');
    if(copiar)copiar.onclick=async()=>{
      const lista=r.cuentasAntiguas.registradas.concat(r.cuentasAntiguas.inferidas).map(c=>c.email).join('\n');
      try{await navigator.clipboard.writeText(lista);alert('Correos copiados.');}catch(_){alert(lista);}
    };
    const vaciar=fondo.querySelector('[data-vaciar-antiguas]');
    if(vaciar)vaciar.onclick=async()=>{
      if(!confirm('¿Ya borraste esas cuentas en Firebase Console?\n\nSe vaciará el registro de cuentas antiguas.'))return;
      try{await db.collection('sync').doc('cuentasAntiguas').set({items:[],updatedAt:Date.now()});fondo.remove();}
      catch(e){alert('No se pudo vaciar el registro: '+(e&&e.message||e));}
    };
  }

  /* ---------- respaldo de los datos de usuarios (antes de migrar o de cambiar de etapa) ---------- */
  async function respaldarDatosClave(){
    if(!esAdministrador()){alert('Solo el Administrador puede descargar el respaldo.');return;}
    const docs=['users','perfiles','accesos','workers','configMantenimiento','configTareo'];
    const salida={
      generadoEn:new Date().toISOString(),
      entorno:typeof ENTORNO!=='undefined'?ENTORNO:'',
      proyecto:typeof FIREBASE_CONFIG!=='undefined'?FIREBASE_CONFIG.projectId:'',
      aviso:'Contiene datos de usuarios (puede incluir contraseñas antiguas si aún no se migraron). Guárdalo en un lugar seguro.',
      documentos:{}
    };
    for(const d of docs){
      try{
        const snap=await db.collection('sync').doc(d).get();
        salida.documentos[d]=snap.exists?snap.data():null;
      }catch(e){salida.documentos[d]={error:String(e&&e.message||e)};}
    }
    const f=new Date(),p2=n=>String(n).padStart(2,'0');
    descargarTexto('respaldo-glacial-'+(salida.entorno||'entorno').toLowerCase()+'-'+f.getFullYear()+p2(f.getMonth()+1)+p2(f.getDate())+'-'+p2(f.getHours())+p2(f.getMinutes())+'.json',
      JSON.stringify(salida,null,2),'application/json');
    return salida;
  }
  window.respaldarDatosClave=respaldarDatosClave;
})();
