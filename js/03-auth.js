/* =============================================================
   SESIÓN, LOGIN/LOGOUT Y SELECCIÓN DE TIPO DE REPORTE
   Parte del sistema GLACIAL — dividido a partir de app.js
   ============================================================= */


/* =========================================================
   SESIÓN / LOGIN
   ========================================================= */

function handleLogin(){

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
      u.username.toLowerCase() === username.toLowerCase() &&
      u.password === pass

  );


  if(!found){

    errBox.textContent =
      'Usuario o contraseña incorrectos.';

    errBox.style.display = 'block';

    return;

  }


  errBox.style.display = 'none';

  state.user = found;


  sessionStorage.setItem(

    DB_SESSION,

    JSON.stringify(found)

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
   CERRAR SESIÓN
   ========================================================= */

function handleLogout(){

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


  document.getElementById('btn-usuarios').style.display =

    state.user.rol === 'Administrador'
    

      ? 'block'

      : 'none';


  document.getElementById('btn-trabajadores').style.display =

    (
      state.user.rol === 'Administrador' ||
      state.user.rol === 'Jefe de Producción' ||
      state.user.rol === 'Supervisor' ||
      state.user.rol === 'Asistente de Producción'  ||
      state.user.rol === 'Jefe de Operaciones'||
      state.user.rol === 'Gerente General'
    )

      ? 'block'

      : 'none';


  renderSidebar();

  renderMain();

}

