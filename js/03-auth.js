/* =============================================================
   SESIÓN, LOGIN/LOGOUT Y SELECCIÓN DE TIPO DE REPORTE
   Parte del sistema GLACIAL — dividido a partir de app.js
   ============================================================= */


/* =========================================================
   SESIÓN / LOGIN
   ========================================================= */

async function handleLogin(){

  const username =
    document.getElementById('login-user').value.trim();

  const pass =
    document.getElementById('login-pass').value;

  const errBox =
    document.getElementById('login-error');


  /*
     Si todavía no llegó la primera respuesta de Firestore
     (conexión muy lenta o sin internet), evitamos decir
     "usuario o contraseña incorrectos" por error.
  */

  if(!_usersReady){

    errBox.textContent =
      'Conectando con la base de datos, intenta de nuevo en un segundo...';

    errBox.style.display = 'block';

    return;

  }


  const users = loadUsers();

  const found = users.find(

    u =>
      u.username.toLowerCase() === username.toLowerCase()

  );


  let passwordCorrecta = false;

  if(found){

    if(found.passwordHash && found.salt){

      /* Formato nuevo: comparar contra el hash guardado. */

      const intento =
        await calcularHashPassword(pass, found.salt);

      passwordCorrecta =
        (intento === found.passwordHash);

    } else if(found.password){

      /*
         Formato antiguo (texto plano), todavía sin migrar.
         Se acepta por compatibilidad, y de inmediato se
         migra este usuario a hash + salt para no dejarlo
         en texto plano ni un minuto más.
      */

      passwordCorrecta =
        (found.password === pass);

      if(passwordCorrecta){
        await migrarUsuarioAPasswordSeguro(found);
      }

    }

  }


  if(!found || !passwordCorrecta){

    errBox.textContent =
      'Usuario o contraseña incorrectos.';

    errBox.style.display = 'block';

    return;

  }


  errBox.style.display = 'none';

  const usuarioLimpio =
    usuarioSinCredenciales(found);

  state.user = usuarioLimpio;


  sessionStorage.setItem(

    DB_SESSION,

    JSON.stringify(usuarioLimpio)

  );


  if(
    found.rol === 'Supervisor' &&
    found.linea
  ){

    state.currentLine = found.linea;

  }


  /* =====================================================
     NUEVO: INFORMACIÓN DEL USUARIO EN LA BIENVENIDA
  ===================================================== */

  const welcomeUser =
    document.getElementById('welcome-user');

  if(welcomeUser){

    welcomeUser.textContent =
      found.nombre ||
      found.name ||
      found.username;

  }


  /* =====================================================
     ENTRAR AL SISTEMA
  ===================================================== */

  enterApp();

}


/* =========================================================
   MIGRAR UN USUARIO A CONTRASEÑA CON HASH + SALT
   =========================================================

   Se llama automáticamente la primera vez que un usuario
   con contraseña antigua (texto plano) inicia sesión
   correctamente. Reemplaza el campo "password" por
   "salt" + "passwordHash" tanto en Firestore como en el
   objeto que ya tenemos en memoria.
   ========================================================= */

async function migrarUsuarioAPasswordSeguro(usuario){

  const cred =
    await crearCredencialPassword(usuario.password);

  const users = loadUsers();

  const idx = users.findIndex(
    u => u.username === usuario.username
  );

  if(idx === -1){
    return;
  }

  delete users[idx].password;

  users[idx].salt = cred.salt;
  users[idx].passwordHash = cred.passwordHash;

  saveUsers(users);


  /* Reflejar el cambio también en el objeto en memoria. */

  delete usuario.password;

  usuario.salt = cred.salt;
  usuario.passwordHash = cred.passwordHash;

}


/* =========================================================
   CERRAR SESIÓN
   ========================================================= */

function handleLogout(){

  if(
    typeof confirmarAbandonoRotacionPendiente === 'function' &&
    !confirmarAbandonoRotacionPendiente()
  ){
    return;
  }

  sessionStorage.removeItem(DB_SESSION);

  state.user = null;

  document.getElementById('app-screen').style.display = 'none';

  document.getElementById('report-select-screen').style.display = 'none';

  document.getElementById('login-screen').style.display = 'flex';

  document.getElementById('login-user').value = '';

  document.getElementById('login-pass').value = '';

}


/* =========================================================
   SELECCIÓN DE TIPO DE REPORTE (PANTALLA DE INICIO)
   ========================================================= */

function goReporteAgua(){

  document.getElementById('report-select-screen').style.display = 'none';

  document.getElementById('app-screen').style.display = 'block';

}


function goReporteHielo(){

  const root =
    document.getElementById('modal-root');

  root.innerHTML = `
    <div class="modal-backdrop" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="modal-head">
          <h3>Reporte Hielo</h3>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>

        <div class="modal-body">
          <p style="margin:0;color:var(--text-soft);font-size:14px;line-height:1.6;">
            El módulo de <strong>Reporte Hielo</strong> está en desarrollo.
            Próximamente podrás ingresar aquí los datos de producción de hielo.
          </p>
        </div>
      </div>
    </div>
  `;

}


/* =========================================================
   VOLVER A LA SELECCIÓN DE TIPO DE REPORTE
   ========================================================= */

function goReportSelect(){

  if(
    typeof confirmarAbandonoRotacionPendiente === 'function' &&
    !confirmarAbandonoRotacionPendiente()
  ){
    return;
  }

  document.getElementById('app-screen').style.display = 'none';

  document.getElementById('report-select-screen').style.display = 'flex';

}


/* =========================================================
   RECUPERAR SESIÓN
   ========================================================= */

function tryResumeSession(){

  const s = JSON.parse(

    sessionStorage.getItem(DB_SESSION) || 'null'

  );


  if(s){

    state.user = s;


    if(
      s.rol === 'Supervisor' &&
      s.linea
    ){

      state.currentLine = s.linea;

    }


    enterApp();

  }

}


/* =========================================================
   ENTRAR A LA APLICACIÓN
   ========================================================= */

function enterApp(){

  document.getElementById('login-screen').style.display = 'none';

  document.getElementById('app-screen').style.display = 'none';


  /* =====================================================
     PANTALLA DE SELECCIÓN DE TIPO DE REPORTE
  ===================================================== */

  const reportSelectUsername =
    document.getElementById('report-select-username');

  if(reportSelectUsername){

    reportSelectUsername.textContent =
      state.user.nombre ||
      state.user.username;

  }

  document.getElementById('report-select-screen').style.display = 'flex';


  document.getElementById('user-name').textContent =
    state.user.nombre;


  document.getElementById('user-role').textContent =
    state.user.puesto || state.user.rol || 'Usuario';


  document.getElementById('user-avatar').textContent =

    state.user.nombre

      .split(' ')

      .map(w => w[0])

      .slice(0,2)

      .join('')

      .toUpperCase();


  /* =====================================================
     VISIBILIDAD SEGÚN PERMISOS DEL USUARIO
     ===================================================== */

  const puedeGestionarUsuarios =
    tienePermiso('usuarios') ||
    tienePermiso('gestionarUsuarios');

  const btnUsuarios =
    document.getElementById('btn-usuarios');

  if(btnUsuarios){
    btnUsuarios.style.display =
      puedeGestionarUsuarios ? '' : 'none';
  }


  const btnTrabajadores =
    document.getElementById('btn-trabajadores');

  if(btnTrabajadores){
    btnTrabajadores.style.display =
      tienePermiso('trabajadores') ? '' : 'none';
  }


  /*
     "Producción actual" (16-paletas.js) es la vista de solo
     lectura para Ventas: en vez de atarla a un rol por nombre
     (como arriba), se muestra según el permiso 'produccionActual'
     que el Administrador asigna desde Gestión de usuarios — así
     puede dárselo a cualquier usuario, no solo a uno con rol
     "Ventas" literal.
  */
  const btnProduccionActual =
    document.getElementById('btn-produccion-actual');

  if(btnProduccionActual){

    btnProduccionActual.style.display =

      tienePermiso('produccionActual')

        ? 'block'

        : 'none';

  }


  /*
     Botón "Mantenimiento" (18-mantenimiento.js): mismo patrón
     que btnProduccionActual — visible solo con el permiso
     'moduloMantenimiento' que asigna el Administrador.
  */
  const btnMantenimiento =
    document.getElementById('btn-mantenimiento');

  if(btnMantenimiento){

    btnMantenimiento.style.display =

      tienePermiso('moduloMantenimiento')

        ? 'block'

        : 'none';

  }


  /*
     Botón "RRHH" (19-rrhh.js): mismo patrón que
     btnMantenimiento, gateado por el permiso 'moduloRRHH'.
  */
  const btnRRHH =
    document.getElementById('btn-rrhh');

  if(btnRRHH){

    btnRRHH.style.display =

      tienePermiso('moduloRRHH')

        ? 'block'

        : 'none';

  }

  /*
    Botón "Almacen" (xx-almacen.js): mismo patrón que
    btnMantenimiento, gateado por el permiso 'moduloAlmacen'.
  
  */
  const btnAlmacen =
    document.getElementById('btn-almacen');
    if(btnAlmacen){

      btnAlmacen.style.display = 
      tienePermiso('moduloAlmacen')
        ? 'block'
        : 'none';
    } 




  renderSidebar();

  renderMain();

}