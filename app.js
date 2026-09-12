/* =========================================================
   CONFIGURACIÓN DE FIREBASE (BASE DE DATOS EN LA NUBE)
   =========================================================

   Esto es lo que permite que los datos (usuarios, reportes
   y trabajadores) se vean EN TIEMPO REAL en cualquier
   computadora, y no solo en la que los registró.

   PASOS PARA ACTIVARLO (una sola vez):

   1. Ve a https://console.firebase.google.com y crea un
      proyecto gratuito (plan "Spark").
   2. Dentro del proyecto: Compilación > Firestore Database >
      Crear base de datos (modo producción, la región más
      cercana, ej. "southamerica-east1").
   3. En Firestore > Reglas, pega temporalmente:

        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /{document=**} {
              allow read, write: if true;
            }
          }
        }

      ⚠ Esto deja la base de datos abierta a quien tenga esta
      URL de configuración. Es aceptable para un sistema
      interno de una planta, pero NO la publiques en un sitio
      público. Si más adelante quieres reforzarla, se puede
      agregar autenticación de Firebase.

   4. Ve a Configuración del proyecto (ícono de engranaje) >
      "Tus apps" > icono web (</>) > registra la app.
   5. Copia el objeto "firebaseConfig" que te muestra y
      pégalo reemplazando el de abajo.
*/

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAO86_KLoblDvHq-65q2xbD53-zj_L0tUY",
  authDomain: "jefaturaopglacial-fdb95.firebaseapp.com",
  projectId: "jefaturaopglacial-fdb95",
  storageBucket: "jefaturaopglacial-fdb95.firebasestorage.app",
  messagingSenderId: "949615984456",
  appId: "1:949615984456:web:6664bb183ee09930ad3d7d"
};

firebase.initializeApp(FIREBASE_CONFIG);

const db = firebase.firestore();


const LINES = [
  { key:'PET1', name:'PET 1', ratioDefault:1920 },
  { key:'PET2', name:'PET 2', ratioDefault:1920 },
  { key:'B7L',  name:'B7L',   ratioDefault:600 },
  { key:'C20L', name:'C20L',  ratioDefault:250 },
  { key:'B20L', name:'B20L', ratioDefault:55 },
];


/* =========================================================
   LISTAS MAESTRAS GLACIAL
   ========================================================= */

const MARCAS_POR_LINEA = {

  PET1: [
    'Bells',
    'Scala',
    'Glacial',
    'Aro',
    'Cuisine'
  ],

  PET2: [
    'Bells_Gas',
    'Bells_Manzana',
    'Scala_Gas',
    'Bells',
    'Scala',
    'scala_Manzana',
    'Scala_Maracuya',
    'Scala_Piña_Kion',
    'Cuisine',
    'Glacial',
    'Aro',
    'San Jorgue',
    'Yaqua Farmacias',
    'Cuisine',
    'Merkat'
  ],

  B7L: [
    'BELLS',
    'SCALA',
    'GLACIAL',
    'ARO',
    'FONTLIFE',
    'MERKAT',
    'CUISINE'
  ],

  C20L: [
    'Bells',
    'Scala',
    'Glacial',
    'Aro',
    'Merkat',
    'San Jorge',
    'Cuisine',
    'San Fernando'
  ],

  B20L: [
    'Glacial'
  ]

};


/*
   RATIO NOMINAL (BPH) POR PRESENTACIÓN

   Trasladado directamente de las fórmulas de Excel
   (SI.CONJUNTO / SI.ND) de PET1 y PET2.

   Las claves de este objeto son, a la vez, la lista de
   presentaciones que aparecen en el selector — así el
   dropdown y la tabla de ratios nunca quedan desincronizados.

   Si una presentación no está en esta tabla, el ratio es 0
   (igual que el SI.ND(...;0) de la fórmula original).
*/

const RATIOS_PRESENTACION_PET1 = {

  'Pack_Regular_2.5Lx6und': 1920,
  'Pack_Alcalina_2.5Lx6und': 1920,
  'Pack c/Sticker_Alcalina_2.5Lx6und': 1920,
  'Pack_Alcalina_SC_1Lx12und/lN': 2400

};

const RATIOS_PRESENTACION_PET2 = {

  'Pack_Regular_380mlx24und/la': 3300,
  'Pack_Regular_380mlx24und/ln': 6000,
  'Pack_Regular_625mlx6und/la': 3300,
  'Pack_Regular_625mlx6und/ln': 4500,
  'Pack_Regular_625mlx15und/la': 3300,
  'Pack_Regular_625mlx15und/ln': 5000,
  'Pack_Alcalina_625mlx6und/la': 2800,
  'Pack_Alcalina_625mlx6und/ln': 4500,
  'Pack_Alcalina_625mlx15und/la': 3300,
  'Pack_Alcalina_625mlx15und/ln': 5000,
  'Pack_Alcalina(Y)_625mlx15und/la': 3300,
  'Pack_Alcalina(Y)_625mlx15und/ln': 5000,
  'Pack_Regular_1.5Lx6und': 2400,
  'Pack_Regular_SC_1Lx12und/la': 2400,
  'Pack_Regular_SC_1Lx12und/ln': 4500,
  'Pack_Alcalina_SC_1Lx6und/la': 2200,
  'Pack_Alcalina_SC_1Lx6und/ln': 4000,
  'Pack_Alcalina_SC_1Lx12und/la': 2400,
  'Pack_Alcalina_SC_1Lx12und/ln': 4500,
  'Pack_Alcalina_TP_1Lx6und/la': 2200,
  'Pack_Alcalina_TP_1Lx6und/ln': 4500,
  'Pack_Regular_2.5Lx6und': 1920,
  'Pack_Alcalina_2.5Lx6und': 1920,
  'Pack c/Sticker_Alcalina_2.5Lx6und': 1920,
  'Pack_Alcalina_380mlx24und/LN': 6000

};


/*
   RATIO FIJO (no depende de la presentación)

   B7L    = 600
   C20L   = 250
   B20L   = 55 (pendiente de confirmar; se mantiene el
            valor que ya existía en el sistema)
*/

const RATIO_FIJO_B7L = 600;
const RATIO_FIJO_C20L = 250;
const RATIO_FIJO_B20L = 55;

/*
   CASO ESPECIAL B7L:
   Fontlife en presentación de 10 Litros
   tiene un ratio nominal distinto al resto de B7L.
*/
const RATIO_FONTLIFE_10L = 85;


/* =========================================================
   PRESENTACIONES POR LÍNEA

   Para PET1 y PET2, las opciones del selector son
   exactamente las claves de la tabla de ratios de arriba,
   así el ratio siempre coincide con la presentación elegida.
   ========================================================= */

const PRESENTACIONES_POR_LINEA = {

  PET1: Object.keys(RATIOS_PRESENTACION_PET1),

  PET2: Object.keys(RATIOS_PRESENTACION_PET2),

  B7L: [
    '7 Litros',
    '10 Litros'
  ],

  C20L: [
    'Caja 20 Litros'
  ],

  B20L: [
    'Bidón 20 Litros'
  ]

};


/* =========================================================
   OBTENER RATIO NOMINAL SEGÚN LÍNEA Y PRESENTACIÓN
   ========================================================= */

function obtenerRatioNominal(linea, presentacion, marca){

  if(linea === 'PET1'){

    return RATIOS_PRESENTACION_PET1[presentacion] ?? 0;

  }

  if(linea === 'PET2'){

    return RATIOS_PRESENTACION_PET2[presentacion] ?? 0;

  }

  if(linea === 'B7L'){

    const m = normalizarTexto(marca);

    const p = normalizarTexto(presentacion);


    /*
       Caso especial: Fontlife en presentación
       de 10 Litros tiene ratio 85 (no el fijo
       de B7L).
    */

    if(
      m === 'fontlife' &&
      p.includes('10')
    ){

      return RATIO_FONTLIFE_10L;

    }


    return RATIO_FIJO_B7L;

  }

  if(linea === 'C20L'){

    return RATIO_FIJO_C20L;

  }

  if(linea === 'B20L'){

    return RATIO_FIJO_B20L;

  }

  return 0;

}


/* =========================================================
   LISTAS DE HIELO
   ========================================================= */

const MARCAS_HIELO = [
  'Bells',
  'Scala',
  'Glacial',
  'Listo',
  'Cuisine',
  'Tottus',
  'Aro',
  'Certificado',
  'Austral'
];


const PRESENTACIONES_HIELO = [
  '1.5 kg',
  '3 kg',
  '5 kg'
];


/* =========================================================
   PERSONAL
   ========================================================= */

const PERSONAL_POSICIONES = [
  'Sopladora',
  'Envasadora',
  'Etiquetadora',
  'Empaquetadora',
  'Apoyo Sopladora',
  'Revisión de tapas',
  'Pantallista',
  'Paletizado'
];


/* =========================================================
   CARGOS DE TRABAJADORES (BASE DE DATOS DE PERSONAL)
   ========================================================= */

const CARGOS_TRABAJADOR = [
  'Operario',
  'Operario Polivalente',
  'Supervisor',
  'Técnico de Mantenimiento',
  'Técnico de Calidad',
  'Almacenero',
  'Montacarguista',
  'Practicante',
  'Otro'
];


/* =========================================================
   MERMAS
   ========================================================= */

const MERMA_ITEMS = [
  'Botellas',
  'Preformas',
  'Tapa Plana',
  'Tapa Sport Cap',
  'Etiqueta',
  'Polietileno'
];


/* =========================================================
   PARADAS PROGRAMADAS (LISTA MAESTRA)
   ========================================================= */

const PARADAS_PROGRAMADAS = [
  'Charla de Ingreso Sup. Prod.',
  'Charla de Ingreso Sup. Calid.',
  'Refrigerio',
  'Limpieza de planta',
  'Inicio de turno (Encendido de Máquinas)',
  'Culminación de formato',
  'Llenado de Tanques',
  'Cambio de formato',
  'Cambio de cliente',
  'Reposición de insumos (Bobinas)',
  'Cierre de turno',
  'Encendido de máquinas'
];


/* =========================================================
   BASE DE DATOS LOCAL
   ========================================================= */

const DB_SESSION = 'rdp_session_v1';


/* =========================================================
   ESTADO DE LA APLICACIÓN
   ========================================================= */

let state = {

  user: null,

  currentLine: LINES[0].key,

  currentTab: 'nuevo',

  viewingRecordId: null,

  charts: {}

};


let draft = null;


/* =========================================================
   ALMACENAMIENTO
   ========================================================= */

/* =========================================================
   ALMACENAMIENTO EN TIEMPO REAL (FIRESTORE)
   =========================================================

   Cada "tabla" (usuarios, reportes, trabajadores) vive como
   UN SOLO documento en Firestore, con un campo "items" que
   contiene el arreglo completo — el mismo formato que antes
   se guardaba en localStorage.

   Se escucha cada documento con onSnapshot(): en cuanto una
   computadora guarda un cambio, Firestore lo empuja a todas
   las demás automáticamente (sin recargar la página).

   loadUsers() / loadRecords() / loadWorkers() se mantienen
   síncronas (devuelven el caché local ya actualizado) para
   no tener que reescribir el resto de la aplicación.
   saveUsers() / saveRecords() / saveWorkers() actualizan el
   caché al instante (para que la persona que guarda vea el
   cambio ya mismo) y además lo suben a Firestore.
*/

let _usersCache = [];
let _recordsCache = [];
let _workersCache = [];

let _usersReady = false;
let _recordsReady = false;
let _workersReady = false;


function usuariosPorDefecto(){

  return [

    {
      username:'admin',
      password:'admin123',
      rol:'Administrador',
      linea:null,
      nombre:'Administrador del Sistema'
    },

    {
      username:'jefe',
      password:'jefe123',
      rol:'Jefe de Producción',
      linea:null,
      nombre:'Jefe de Producción'
    },

    {
      username:'supervisor',
      password:'supervisor123',
      rol:'Supervisor',
      linea:null,
      nombre:'Supervisor'
    }

  ];

}


function initRealtimeSync(){

  db.collection('sync').doc('users')

    .onSnapshot(

      snap => {

        if(snap.exists && snap.data().items){

          _usersCache = snap.data().items;

        } else {

          const seed = usuariosPorDefecto();

          _usersCache = seed;

          db.collection('sync').doc('users').set({
            items: seed,
            updatedAt: Date.now()
          });

        }

        _usersReady = true;

        onUsersUpdated();

      },

      err => {

        console.error(
          'Error de sincronización (usuarios):', err
        );

      }

    );


  db.collection('sync').doc('records')

    .onSnapshot(

      snap => {

        _recordsCache =
          (snap.exists && snap.data().items)
            ? snap.data().items
            : [];

        _recordsReady = true;

        onRecordsUpdated();

      },

      err => {

        console.error(
          'Error de sincronización (reportes):', err
        );

      }

    );


  db.collection('sync').doc('workers')

    .onSnapshot(

      snap => {

        _workersCache =
          (snap.exists && snap.data().items)
            ? snap.data().items
            : [];

        _workersReady = true;

        onWorkersUpdated();

      },

      err => {

        console.error(
          'Error de sincronización (trabajadores):', err
        );

      }

    );

}


/*
   Se llama automáticamente cada vez que llega un cambio en
   tiempo real desde Firestore (de esta u otra computadora),
   para refrescar la parte de la pantalla que corresponda.
*/

function onUsersUpdated(){

  if(document.getElementById('userlist')){

    renderUserList();

  }

}


function onWorkersUpdated(){

  if(document.getElementById('workerlist')){

    renderWorkerList();

  }


  const datalist =
    document.getElementById(
      'personal-workers-datalist'
    );

  if(datalist && draft){

    datalist.innerHTML =

      findWorkersForLine(draft.linea).map(

        w => `
          <option value="${w.nombre}">${w.cargo || ''}</option>
        `

      ).join('');

  }

}


function onRecordsUpdated(){

  if(!state.user){
    return;
  }

  /*
     Solo se refresca si la persona está viendo resumen,
     historial o gráficos — así no se interrumpe a nadie
     que esté llenando un registro nuevo.
  */

  if(
    state.currentTab === 'resumen' ||
    state.currentTab === 'historial' ||
    state.currentTab === 'graficos'
  ){

    renderMain();

  }

}


function loadUsers(){

  return _usersCache;

}


function saveUsers(u){

  _usersCache = u;

  db.collection('sync').doc('users').set({
    items: u,
    updatedAt: Date.now()
  });

}


function loadRecords(){

  return _recordsCache;

}


function saveRecords(r){

  _recordsCache = r;

  db.collection('sync').doc('records').set({
    items: r,
    updatedAt: Date.now()
  });

}


/* =========================================================
   TRABAJADORES (OPERARIOS, SUPERVISORES, TÉCNICOS, ETC.)
   ========================================================= */

function loadWorkers(){

  return _workersCache;

}


function saveWorkers(w){

  _workersCache = w;

  db.collection('sync').doc('workers').set({
    items: w,
    updatedAt: Date.now()
  });

}


/*
   Busca un trabajador activo por nombre y apellido
   (comparación insensible a mayúsculas y espacios extra),
   usado para autocompletar el cargo en la tabla de
   personal del reporte diario.
*/

function findWorkerByNombre(nombre){

  const target =
    normalizarTexto(
      (nombre || '').trim()
    );

  if(!target){
    return null;
  }

  return loadWorkers().find(

    w =>
      w.estado !== 'Inactivo' &&
      normalizarTexto(w.nombre.trim()) === target

  ) || null;

}


/*
   Devuelve los trabajadores activos visibles para una
   línea determinada: los asignados a esa línea, más los
   asignados a "Todas las líneas" (linea vacío/null).
*/

function findWorkersForLine(linea){

  return loadWorkers().filter(

    w =>
      w.estado !== 'Inactivo' &&
      (
        !w.linea ||
        w.linea === linea
      )

  );

}


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

  document.getElementById('login-screen').style.display = 'flex';

  document.getElementById('login-user').value = '';

  document.getElementById('login-pass').value = '';

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

  document.getElementById('app-screen').style.display = 'block';


  document.getElementById('user-name').textContent =
    state.user.nombre;


  document.getElementById('user-role').textContent =
    state.user.rol;


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
      state.user.rol === 'Supervisor'
    )

      ? 'block'

      : 'none';


  renderSidebar();

  renderMain();

}


/* =========================================================
   SIDEBAR
   ========================================================= */

function visibleLines(){

  if(
    state.user.rol === 'Supervisor' &&
    state.user.linea
  ){

    return LINES.filter(

      l => l.key === state.user.linea

    );

  }


  return LINES;

}


function renderSidebar(){

  const list =
    document.getElementById('line-list');


  list.innerHTML =

    visibleLines()

      .map(l => `

        <button
          class="line-btn ${
            state.currentLine === l.key &&
            state.currentTab !== 'resumen'
              ? 'active'
              : ''
          }"
          onclick="selectLine('${l.key}')"
        >

          ${l.name}

        </button>

      `)

      .join('');

}


function selectLine(key){

  state.currentLine = key;

  state.currentTab = 'nuevo';

  state.viewingRecordId = null;

  draft = null;

  renderSidebar();

  renderMain();

}


function goResumen(){

  if(state.user.rol === 'Supervisor' && state.user.linea){

    return;

  }


  state.currentTab = 'resumen';

  renderSidebar();

  renderMain();

}


/* =========================================================
   UTILIDADES NUMÉRICAS
   ========================================================= */

function num(v){

  const n = parseFloat(v);

  return isNaN(n) ? 0 : n;

}


function pct(v){

  return (
    v * 100
  ).toFixed(1) + '%';

}


/* =========================================================
   DÍA JULIANO
   ========================================================= */

function obtenerDiaDelAño(fecha){

  if(!fecha){

    return '';

  }


  const partes =
    String(fecha).split('-');


  if(partes.length !== 3){

    return '';

  }


  const año =
    Number(partes[0]);


  const mes =
    Number(partes[1]);


  const dia =
    Number(partes[2]);


  if(
    !año ||
    !mes ||
    !dia
  ){

    return '';

  }


  const fechaActual =
    Date.UTC(
      año,
      mes - 1,
      dia
    );


  const inicioAño =
    Date.UTC(
      año,
      0,
      1
    );


  return Math.floor(

    (
      fechaActual -
      inicioAño
    ) / 86400000

  ) + 1;

}


/* =========================================================
   NORMALIZAR TEXTO
   ========================================================= */

function normalizarTexto(valor){

  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

}


/* =========================================================
   CÓDIGO DE TURNO
   =========================================================

   DÍA   = 2
   NOCHE = 1

   TARDE:
   No tiene código definido por la regla entregada.
   Por eso se deja vacío.
   ========================================================= */

function obtenerCodigoTurno(turno){

  const t = normalizarTexto(turno);

  if(t === 'dia'){
    return '2';
  }

  if(t === 'noche'){
    return '1';
  }

  return '';

}


/* =========================================================
   CALCULAR HORAS DE TURNO
   =========================================================

   Calcula automáticamente las horas de turno a partir
   de la hora de inicio y la hora de fin.

   Si la hora de fin es menor o igual a la hora de inicio,
   se asume que el turno cruza la medianoche (ej: 19:00 a
   07:00 = 12 horas).

   Ejemplos:

   07:00 → 19:00  =  12
   19:00 → 07:00  =  12
   22:00 → 06:00  =   8
   ========================================================= */

function calcularHorasTurno(horaInicio, horaFin){

  if(
    !horaInicio ||
    !horaFin
  ){

    return 0;

  }


  const partesInicio =
    String(horaInicio).split(':');

  const partesFin =
    String(horaFin).split(':');


  if(
    partesInicio.length < 2 ||
    partesFin.length < 2
  ){

    return 0;

  }


  const hInicio =
    Number(partesInicio[0]);

  const mInicio =
    Number(partesInicio[1]);

  const hFin =
    Number(partesFin[0]);

  const mFin =
    Number(partesFin[1]);


  if(
    isNaN(hInicio) ||
    isNaN(mInicio) ||
    isNaN(hFin) ||
    isNaN(mFin)
  ){

    return 0;

  }


  const minutosInicio =
    (hInicio * 60) + mInicio;

  let minutosFin =
    (hFin * 60) + mFin;


  /*
     Si el turno cruza la medianoche,
     sumamos 24 horas al final.
  */

  if(minutosFin <= minutosInicio){

    minutosFin += (24 * 60);

  }


  const horas =
    (minutosFin - minutosInicio) / 60;


  /*
     Redondeamos a 2 decimales
     para evitar errores de coma flotante.
  */

  return Math.round(horas * 100) / 100;

}


/* =========================================================
   SEMANA TIPO EXCEL
   =========================================================

   Equivalente a:

   =WEEKNUM(fecha,1)

   - La semana comienza el DOMINGO.
   - El 1 de enero pertenece a la semana 1.
   ========================================================= */

function obtenerSemana(fecha){

  if(!fecha){
    return '';
  }

  const partes = String(fecha).split('-');

  if(partes.length !== 3){
    return '';
  }

  const año = Number(partes[0]);
  const mes = Number(partes[1]);
  const dia = Number(partes[2]);

  if(!año || !mes || !dia){
    return '';
  }

  const fechaActual =
    new Date(
      año,
      mes - 1,
      dia
    );

  const inicioAño =
    new Date(
      año,
      0,
      1
    );

  const diferenciaDias =
    Math.floor(
      (
        fechaActual.getTime() -
        inicioAño.getTime()
      ) / 86400000
    );

  const diaDelAño =
    diferenciaDias + 1;

  const diaSemanaInicioAño =
    inicioAño.getDay();

  const semana =
    Math.floor(
      (
        diaDelAño +
        diaSemanaInicioAño -
        1
      ) / 7
    ) + 1;

  return semana;

}


/* =========================================================
   CÓDIGO DE MARCA / PRESENTACIÓN
   =========================================================

   REGLAS (explícitas por marca, según lo indicado):

   PET1:
   - CF1: SCALA, ARO, FONTLIFE, MERKAT, BELLS, GLACIAL
   - CUISINE = 2

   PET2:
   - Scala Gas / Manzana / Maracuya / Piña Kion = 3
   - Bells Gas / Manzana / Maracuya = 6
   - Cuisine = 2
   - CF4: SCALA, FONTLIFE, BELLS, GLACIAL (presentación regular,
     sin gas/sabor)

   B7L:
   - Cuisine = 2
   - CF3: SCALA, ARO, FONTLIFE, MERKAT, BELLS, GLACIAL

   C20L:
   - San Fernando = 12
   - CF2: SCALA, ARO, CUISINE, MERKAT, BELLS, GLACIAL

   B20L:
   - Glacial = 1
   ========================================================= */

/*
   Listas de marcas por código, normalizadas
   (minúsculas, sin tildes, sin guiones bajos).
*/

const MARCAS_CF1_PET1 = [
  'scala',
  'aro',
  'fontlife',
  'merkat',
  'bells',
  'glacial'
];

const MARCAS_CF4_PET2 = [
  'scala',
  'fontlife',
  'bells',
  'glacial'
];

const MARCAS_CF3_B7L = [
  'scala',
  'aro',
  'fontlife',
  'merkat',
  'bells',
  'glacial'
];

const MARCAS_CF2_C20L = [
  'scala',
  'aro',
  'cuisine',
  'merkat',
  'bells',
  'glacial',
  'san fernando'
];


function obtenerCodigoMarca(linea, marca, presentacion){

  const m = normalizarTexto(marca);

  const combinado = normalizarTexto(
    `${marca || ''} ${presentacion || ''}`
  );


  /* =====================================================
     PET1
     ===================================================== */

  if(linea === 'PET1'){

    if(m === 'cuisine'){
      return '2';
    }

    if(MARCAS_CF1_PET1.includes(m)){
      return 'CF1';
    }

    return 'CF1';
  }


  /* =====================================================
     PET2
     ===================================================== */

  if(linea === 'PET2'){

    if(
      combinado.includes('scala gas') ||
      combinado.includes('scala manzana') ||
      combinado.includes('scala maracuya') ||
      combinado.includes('scala pina kion')
    ){

      return '3';
    }

    if(
      combinado.includes('bells gas') ||
      combinado.includes('bells manzana') ||
      combinado.includes('bells maracuya')
    ){

      return '6';
    }

    if(
      m === 'cuisine' ||
      combinado.includes('cuisine regular') ||
      combinado.includes('cuisine gas')
    ){

      return '2';
    }

    if(MARCAS_CF4_PET2.includes(m)){
      return 'CF4';
    }

    return 'CF4';
  }


  /* =====================================================
     B7L
     ===================================================== */

  if(linea === 'B7L'){

    if(m === 'cuisine'){
      return '2';
    }

    if(MARCAS_CF3_B7L.includes(m)){
      return 'CF3';
    }

    return 'CF3';
  }


  /* =====================================================
     C20L
     ===================================================== */

  if(linea === 'C20L'){

    if(
      m === 'san fernando' ||
      combinado.includes('san fernando')
    ){

      return '12';
    }

    if(MARCAS_CF2_C20L.includes(m)){
      return 'CF2';
    }

    return 'CF2';
  }


  /* =====================================================
     B20L
     ===================================================== */

  if(linea === 'B20L'){

    if(m === 'glacial'){
      return '1';
    }

    return '';
  }


  return '';
}


/* =========================================================
   GENERAR LOTE AUTOMÁTICO
   =========================================================

   DOS CASOS:

   1) Código de marca NUMÉRICO (1, 2, 3, 6, 12):
      El lote se arma completo:

      DIA JULIANO - TURNO + CÓDIGO + SEMANA

      Ejemplos:
      Scala Manzana PET2   → código 3  → 249-2337
      Bells Gas PET2       → código 6  → 249-2637
      Cuisine (cualquier línea) → código 2 → 249-2237
      San Fernando C20L    → código 12 → 249-21237
      Glacial B20L         → código 1  → 249-2137

   2) Código de marca ALFANUMÉRICO (CF1, CF2, CF3, CF4):
      El lote es SOLO ese código, sin día juliano,
      turno ni semana.

      Ejemplos:
      PET1 (Scala/Aro/Fontlife/Merkat/Bells/Glacial) → CF1
      PET2 (Scala/Fontlife/Bells/Glacial regular)    → CF4
      B7L  (Scala/Aro/Fontlife/Merkat/Bells/Glacial) → CF3
      C20L (Scala/Aro/Cuisine/Merkat/Bells/Glacial)  → CF2
   ========================================================= */

function generarLote(){

  if(!draft){
    return '';
  }


  /* =====================================================
     CÓDIGO DE MARCA (numérico o CFx)
     ===================================================== */

  const codigoMarca =
    obtenerCodigoMarca(
      draft.linea,
      draft.marca,
      draft.presentacion
    );


  /*
     Si el código es alfanumérico (CF1, CF2, CF3, CF4),
     el lote es SOLO ese código.
  */

  const esAlfanumerico =
    codigoMarca !== '' &&
    !/^\d+$/.test(
      String(codigoMarca)
    );


  if(esAlfanumerico){

    return String(codigoMarca);

  }


  /* =====================================================
     DÍA JULIANO
     ===================================================== */

  const diaJuliano =
    obtenerDiaDelAño(
      draft.fecha
    );


  /* =====================================================
     SEMANA
     ===================================================== */

  const semana =
    obtenerSemana(
      draft.fecha
    );


  /* =====================================================
     TURNO
     ===================================================== */

  const codigoTurno =
    obtenerCodigoTurno(
      draft.turno
    );


  /* =====================================================
     VALIDACIÓN
     ===================================================== */

  if(
    diaJuliano === '' ||
    semana === '' ||
    codigoTurno === ''
  ){

    return '';
  }


  /* =====================================================
     CONSTRUCCIÓN DEL LOTE (código numérico)
     ===================================================== */

  return (
    String(diaJuliano) +
    '-' +
    String(codigoTurno) +
    String(codigoMarca) +
    String(semana)
  );

}


/* =========================================================
   ACTUALIZAR LOTE
   ========================================================= */

function actualizarLoteDraft(){

  if(!draft){
    return;
  }


  draft.lote =
    generarLote();


  const campoLote =
    document.getElementById('f_lote');


  if(campoLote){

    campoLote.value =
      draft.lote || '';

  }

}


function actualizarLote(){

  if(!draft){
    return;
  }


  draft.lote =
    generarLote();

}


/* =========================================================
   UNIDADES POR PALET

   Se usa para calcular automáticamente el N° de paletas
   (producción efectiva ÷ unidades por palet) según
   línea + marca + presentación.

   Reglas entregadas:

   PET1 y PET2:
   - 2.5L                                   : 324 x palet
   - 1L                                      : 720 x palet
   - 625ml (Scala, Aro, Merkat, Bells,
     Glacial, Cuisine — sin sabor)           : 1500 x palet
   - 625ml (Scala Gas/Manzana/Maracuya/
     Piña Kion, Bells Gas/Manzana/Maracuya)  : 1350 x palet
   - 380ml                                   : 2184 x palet
   - 1.5L                                    : 600 x palet

   B7L:
   - Scala, Cuisine, Merkat, Glacial, Aro,
     Bells                                   : 126 x palet
   - Fontlife                                : 85 x palet

   C20L:
   - Cuisine, San Jorge                      : 40 x palet
   - Aro, Scala, Merkat, Bells, Glacial       : 50 x palet

   B20L:
   - Cualquier marca                         : 32 x palet
   ========================================================= */

   /* =========================================================
   DIVISOR DE CAJAS DE PREFORMAS POR PRESENTACIÓN
   =========================================================
   Trasladado de la fórmula de Excel (SI.CONJUNTO anidado).
   cajasPreformas = producción efectiva ÷ divisor
   Si la presentación no está en la tabla, el valor es 0
   (igual que el " " del Excel original).
   ========================================================= */

const CAJAS_PREFORMAS_DIVISOR = {
  'pack_alcalina_380mlx24und/ln': 21500,
  'pack_regular_380mlx24und/ln': 21500,

  'pack_regular_625mlx6und/la': 18750,
  'pack_regular_625mlx6und/ln': 18750,
  'pack_regular_625mlx15und/la': 18750,
  'pack_regular_625mlx15und/ln': 18750,
  'pack_alcalina_625mlx6und/la': 18750,
  'pack_alcalina_625mlx6und/ln': 18750,
  'pack_alcalina_625mlx15und/la': 18750,
  'pack_alcalina_625mlx15und/ln': 18750,
  'pack_alcalina(y)_625mlx15und/la': 18750,
  'pack_alcalina(y)_625mlx15und/ln': 18750,

  'pack_regular_sc_1lx12und/la': 14250,
  'pack_regular_sc_1lx12und/ln': 14250,
  'pack_alcalina_sc_1lx6und/la': 14250,
  'pack_alcalina_sc_1lx6und/ln': 14250,
  'pack_alcalina_sc_1lx12und/la': 14250,
  'pack_alcalina_sc_1lx12und/ln': 14250,
  'pack_alcalina_tp_1lx6und/la': 14250,
  'pack_alcalina_tp_1lx6und/ln': 14250,

  'pack_regular_1.5lx6und': 9928,

  'pack_regular_2.5lx6und': 7900,
  'pack_alcalina_2.5lx6und': 7900,
  'pack c/sticker_alcalina_2.5lx6und': 7900
};


/* =========================================================
   FACTOR DE CARTÓN POR PRESENTACIÓN (PET1/PET2)
   =========================================================
   planchasCarton = N° de paletas × factor
   ========================================================= */

const FACTOR_CARTON_PET = {
  'pack_alcalina_380mlx24und/ln': 6,
  'pack_regular_380mlx24und/ln': 6,

  'pack_regular_625mlx6und/la': 5,
  'pack_regular_625mlx6und/ln': 5,
  'pack_regular_625mlx15und/la': 5,
  'pack_regular_625mlx15und/ln': 5,
  'pack_alcalina_625mlx6und/la': 5,
  'pack_alcalina_625mlx6und/ln': 5,
  'pack_alcalina_625mlx15und/la': 5,
  'pack_alcalina_625mlx15und/ln': 5,

  'pack_alcalina(y)_625mlx15und/la': 4,
  'pack_alcalina(y)_625mlx15und/ln': 4,
  'pack_regular_sc_1lx12und/la': 4,
  'pack_regular_sc_1lx12und/ln': 4,
  'pack_alcalina_sc_1lx6und/la': 4,
  'pack_alcalina_sc_1lx6und/ln': 4,
  'pack_alcalina_sc_1lx12und/la': 4,
  'pack_alcalina_sc_1lx12und/ln': 4,
  'pack_alcalina_tp_1lx6und/la': 4,
  'pack_alcalina_tp_1lx6und/ln': 4,
  'pack_regular_1.5lx6und': 4,

  'pack_regular_2.5lx6und': 3,
  'pack_alcalina_2.5lx6und': 3,
  'pack c/sticker_alcalina_2.5lx6und': 3
};


/* =========================================================
   FACTOR DE POLIETILENO (KG) POR PRESENTACIÓN (PET1/PET2)
   =========================================================
   polietilenoKg = N° de paletas × factor
   ========================================================= */

const FACTOR_POLIETILENO_PET = {
  'pack_alcalina_380mlx24und/ln': 2.73,
  'pack_regular_380mlx24und/ln': 2.73,

  'pack_regular_625mlx6und/la': 2.93,
  'pack_regular_625mlx6und/ln': 2.93,
  'pack_regular_625mlx15und/la': 2.8,
  'pack_regular_625mlx15und/ln': 2.8,
  'pack_alcalina_625mlx6und/la': 2.93,
  'pack_alcalina_625mlx6und/ln': 2.93,
  'pack_alcalina_625mlx15und/la': 2.8,
  'pack_alcalina_625mlx15und/ln': 2.8,
  'pack_alcalina(y)_625mlx15und/la': 2.8,
  'pack_alcalina(y)_625mlx15und/ln': 2.8,

  'pack_regular_sc_1lx12und/la': 1.8,
  'pack_regular_sc_1lx12und/ln': 1.8,
  'pack_alcalina_sc_1lx6und/la': 3.6,
  'pack_alcalina_sc_1lx6und/ln': 3.6,
  'pack_alcalina_sc_1lx12und/la': 1.8,
  'pack_alcalina_sc_1lx12und/ln': 1.8,
  'pack_alcalina_tp_1lx6und/la': 3.6,
  'pack_alcalina_tp_1lx6und/ln': 3.6,

  'pack_regular_1.5lx6und': 1.89,
  'pack_regular_2.5lx6und': 1.89,
  'pack_alcalina_2.5lx6und': 1.89,
  'pack c/sticker_alcalina_2.5lx6und': 1.89
};


/* =========================================================
   FACTOR DE STRETCH FILM (KG) POR PRESENTACIÓN (PET1/PET2)
   ========================================================= */

const FACTOR_STRETCHFILM_PET = {
  'pack_alcalina_380mlx24und/ln': 0.66,
  'pack_regular_380mlx24und/ln': 0.66,

  'pack_regular_625mlx6und/la': 0.6,
  'pack_regular_625mlx6und/ln': 0.6,
  'pack_regular_625mlx15und/la': 0.6,
  'pack_regular_625mlx15und/ln': 0.6,
  'pack_alcalina_625mlx6und/la': 0.6,
  'pack_alcalina_625mlx6und/ln': 0.6,
  'pack_alcalina_625mlx15und/la': 0.6,
  'pack_alcalina_625mlx15und/ln': 0.6,
  'pack_alcalina(y)_625mlx15und/la': 0.6,
  'pack_alcalina(y)_625mlx15und/ln': 0.6,

  'pack_regular_sc_1lx12und/la': 0.55,
  'pack_regular_sc_1lx12und/ln': 0.55,
  'pack_alcalina_sc_1lx6und/la': 0.55,
  'pack_alcalina_sc_1lx6und/ln': 0.55,
  'pack_alcalina_sc_1lx12und/la': 0.55,
  'pack_alcalina_sc_1lx12und/ln': 0.55,
  'pack_alcalina_tp_1lx6und/la': 0.55,
  'pack_alcalina_tp_1lx6und/ln': 0.55,

  'pack_regular_1.5lx6und': 0.33,
  'pack_regular_2.5lx6und': 0.33,
  'pack_alcalina_2.5lx6und': 0.33,
  'pack c/sticker_alcalina_2.5lx6und': 0.33
};


/* =========================================================
   REGLAS DE CARTÓN — B7L / C20L / B20L
   ========================================================= */

const CARTON_FIJO_B7L = 18;
const CARTON_C20L_SAN_FERNANDO = 2;
const CARTON_C20L_DEFAULT = 1;
const CARTON_FIJO_B20L = 1;


/* =========================================================
   REGLAS DE POLIETILENO — B7L / C20L / B20L
   ========================================================= */

const POLIETILENO_B7L_FACTOR = 2.02;
const POLIETILENO_C20L_FACTOR = 1.65;
const MARCAS_POLIETILENO_B7L_SI = [
  'scala',
  'merkat',
  'cuisine',
  'glacial'
];


/* =========================================================
   REGLAS DE STRETCH FILM — B7L / C20L / B20L
   ========================================================= */

const STRETCHFILM_B7L_FACTOR = 0.25;
const STRETCHFILM_C20L_FACTOR = 0.5;
const STRETCHFILM_B20L_FACTOR = 0.75;


function obtenerDivisorCajasPreformas(presentacion){

  const key = String(presentacion || '').toLowerCase();

  return CAJAS_PREFORMAS_DIVISOR[key] ?? null;

}


function calcularCajasPreformas(){

  if(!draft){
    return 0;
  }

  const efectiva =
    num(draft.produccion?.efectiva);


  if(
    draft.linea === 'PET1' ||
    draft.linea === 'PET2'
  ){

    const divisor =
      obtenerDivisorCajasPreformas(draft.presentacion);

    if(!divisor){
      return 0;
    }

    return Math.round(
      (efectiva / divisor) * 100
    ) / 100;

  }


  if(draft.linea === 'B7L'){

    return Math.round(
      (efectiva / 2900) * 100
    ) / 100;

  }


  /*
     C20L y B20L no usan cajas de preformas.
  */

  return 0;

}


function actualizarCajasPreformas(){

  if(!draft){
    return;
  }

  if(!draft.insumos){
    draft.insumos = {};
  }

  draft.insumos.cajasPreformas =
    calcularCajasPreformas();

}


function obtenerFactorCartonPET(presentacion){

  const key = String(presentacion || '').toLowerCase();

  return FACTOR_CARTON_PET[key] ?? null;

}


function calcularPlanchasCarton(){

  if(!draft){
    return 0;
  }

  const paletas =
    num(draft.produccion?.paletas);


  if(
    draft.linea === 'PET1' ||
    draft.linea === 'PET2'
  ){

    const factor =
      obtenerFactorCartonPET(draft.presentacion);

    if(!factor){
      return 0;
    }

    return Math.round(
      (paletas * factor) * 100
    ) / 100;

  }


  if(draft.linea === 'B7L'){

    return Math.round(
      (paletas * CARTON_FIJO_B7L) * 100
    ) / 100;

  }


  if(draft.linea === 'C20L'){

    const m = normalizarTexto(draft.marca);

    const factor =
      m === 'san fernando'
        ? CARTON_C20L_SAN_FERNANDO
        : CARTON_C20L_DEFAULT;

    return Math.round(
      (paletas * factor) * 100
    ) / 100;

  }


  if(draft.linea === 'B20L'){

    return Math.round(
      (paletas * CARTON_FIJO_B20L) * 100
    ) / 100;

  }


  return 0;

}


function actualizarPlanchasCarton(){

  if(!draft){
    return;
  }

  if(!draft.insumos){
    draft.insumos = {};
  }

  draft.insumos.planchasCarton =
    calcularPlanchasCarton();

}


function obtenerFactorPolietileno(presentacion){

  const key = String(presentacion || '').toLowerCase();

  return FACTOR_POLIETILENO_PET[key] ?? null;

}


function calcularPolietileno(){

  if(!draft){
    return 0;
  }

  const paletas =
    num(draft.produccion?.paletas);


  if(
    draft.linea === 'PET1' ||
    draft.linea === 'PET2'
  ){

    const factor =
      obtenerFactorPolietileno(draft.presentacion);

    if(!factor){
      return 0;
    }

    return Math.round(
      (paletas * factor) * 100
    ) / 100;

  }


  if(draft.linea === 'B7L'){

    const m = normalizarTexto(draft.marca);

    if(MARCAS_POLIETILENO_B7L_SI.includes(m)){

      return Math.round(
        (paletas * POLIETILENO_B7L_FACTOR) * 100
      ) / 100;

    }

    return 0;

  }


  if(draft.linea === 'C20L'){

    return Math.round(
      (paletas * POLIETILENO_C20L_FACTOR) * 100
    ) / 100;

  }


  /* B20L no usa polietileno. */
  return 0;

}


function actualizarPolietileno(){

  if(!draft){
    return;
  }

  if(!draft.insumos){
    draft.insumos = {};
  }

  draft.insumos.polietilenoKg =
    calcularPolietileno();

}


function obtenerFactorStretchFilm(presentacion){

  const key = String(presentacion || '').toLowerCase();

  return FACTOR_STRETCHFILM_PET[key] ?? null;

}


function calcularStretchFilm(){

  if(!draft){
    return 0;
  }

  const paletas =
    num(draft.produccion?.paletas);


  if(
    draft.linea === 'PET1' ||
    draft.linea === 'PET2'
  ){

    const factor =
      obtenerFactorStretchFilm(draft.presentacion);

    if(!factor){
      return 0;
    }

    return Math.round(
      (paletas * factor) * 100
    ) / 100;

  }


  if(draft.linea === 'B7L'){

    return Math.round(
      (paletas * STRETCHFILM_B7L_FACTOR) * 100
    ) / 100;

  }


  if(draft.linea === 'C20L'){

    return Math.round(
      (paletas * STRETCHFILM_C20L_FACTOR) * 100
    ) / 100;

  }


  if(draft.linea === 'B20L'){

    return Math.round(
      (paletas * STRETCHFILM_B20L_FACTOR) * 100
    ) / 100;

  }


  return 0;

}


function actualizarStretchFilm(){

  if(!draft){
    return;
  }

  if(!draft.insumos){
    draft.insumos = {};
  }

  draft.insumos.stretchFilmKg =
    calcularStretchFilm();

}

function obtenerUnidadesPorPalet(linea, marca, presentacion){

  const m = normalizarTexto(marca);

  const p = normalizarTexto(presentacion);


  /* =====================================================
     PET1 / PET2
     ===================================================== */

  if(
    linea === 'PET1' ||
    linea === 'PET2'
  ){

    if(p.includes('2.5l')){

      return 324;

    }


    if(p.includes('380ml')){

      return 2184;

    }


    if(p.includes('1.5l')){

      return 600;

    }


    if(p.includes('625ml')){

      const esSaborizada =

        m.includes('scala gas') ||
        m.includes('scala manzana') ||
        m.includes('scala maracuya') ||
        m.includes('scala pina kion') ||
        m.includes('bells gas') ||
        m.includes('bells manzana') ||
        m.includes('bells maracuya');


      return esSaborizada
        ? 1350
        : 1500;

    }


    if(p.includes('1l')){

      return 720;

    }


    return 0;

  }


  /* =====================================================
     B7L
     ===================================================== */

  if(linea === 'B7L'){
    if( m=='glacial' ||  m=='scala' || m=='merkat' || m=='cuisine'){
      
      return 126;

    }
    if(m === 'aro' || m === 'bells'){
      
      return 120;
    }
    if(m === 'fontlife'){

      return 85;

    }


    if(
      m === 'scala' ||
      m === 'cuisine' ||
      m === 'merkat' ||
      m === 'glacial' ||
      m === 'aro' ||
      m === 'bells'
    ){

      return 126;

    }


    return 0;

  }


  /* =====================================================
     C20L
     ===================================================== */

  if(linea === 'C20L'){

    if(
      m === 'cuisine' ||
      m === 'san jorge'
    ){

      return 40;

    }


    if(
      m === 'aro' ||
      m === 'scala' ||
      m === 'merkat' ||
      m === 'bells' ||
      m === 'glacial' ||
      m === 'san fernando'
    ){

      return 50;

    }


    return 0;

  }


  /* =====================================================
     B20L
     ===================================================== */

  if(linea === 'B20L'){

    return 32;

  }


  return 0;

}


/* =========================================================
   CALCULAR N° DE PALETAS (AUTOMÁTICO)

   N° de paletas = producción efectiva ÷ unidades por palet
   ========================================================= */

function calcularPaletas(){

  if(!draft){

    return 0;

  }


  const unidadesPorPalet =
    obtenerUnidadesPorPalet(
      draft.linea,
      draft.marca,
      draft.presentacion
    );


  if(!unidadesPorPalet){

    return 0;

  }


  const efectiva =
    num(
      draft.produccion?.efectiva
    );


  return Math.round(

    (
      efectiva /
      unidadesPorPalet
    ) * 100

  ) / 100;

}


function actualizarPaletas(){

  if(!draft){
    return;
  }


  if(!draft.produccion){

    draft.produccion = {};

  }


  draft.produccion.paletas =
    calcularPaletas();

}


/* =========================================================
   STATUS
   ========================================================= */

function statusClass(v){

  return v >= 0.85

    ? 'is-good'

    : v >= 0.6

      ? 'is-warn'

      : 'is-bad';

}


function badgeClass(v){

  return v >= 0.85

    ? 'good'

    : v >= 0.6

      ? 'warn'

      : 'bad';

}


/* =========================================================
   CÁLCULOS OEE
   ========================================================= */

function calcDerivedLegacy(r){

  const horasTurno = num(r.horasTurno);
  const pProg = num((r.paradasProgramadas || []).reduce((a,p) => a + num(p.tiempoMin), 0)) / 60;
  const pNoProg = num((r.paradasNoProgramadas || []).reduce((a,p) => a + num(p.tiempoMin), 0)) / 60;
  const horasEfectivas = Math.max(horasTurno - pProg - pNoProg, 0);
  const ratio = num(r.ratioNominal);
  const produccionNominal = ratio * horasEfectivas;
  const efectiva = num(r.produccion?.efectiva);
  const programada = num(r.produccion?.programada);
  const sopladas = num(r.produccion?.sopladas);
  const calidadBot = num(r.produccion?.calidad);
  const disponibilidad = horasTurno > 0 ? horasEfectivas / horasTurno : 0;
  const rendimiento = produccionNominal > 0 ? Math.min(efectiva / produccionNominal, 1) : 0;
  const calidad = sopladas > 0 ? Math.min(calidadBot / sopladas, 1) : (efectiva > 0 ? 1 : 0);
  const oee = disponibilidad * rendimiento * calidad;
  const cumplimiento = programada > 0 ? efectiva / programada : 0;
  const eficiencia = produccionNominal > 0 ? efectiva / produccionNominal : 0;
  const noCumplida = Math.max(produccionNominal - efectiva, 0);
  const ratioEfectivo = horasEfectivas > 0 ? efectiva / horasEfectivas : 0;

  return { horasEfectivas, produccionNominal, disponibilidad, rendimiento, calidad, oee,
    cumplimiento, eficiencia, noCumplida, ratioEfectivo, pProg, pNoProg };
}

function calcDerivedCuadro(cuadro){

  const horasTurno = num(cuadro?.horasTurno);
  const pProg = num((cuadro?.paradasProgramadas || []).reduce((a,p) => a + num(p.tiempoMin), 0)) / 60;
  const pNoProg = num((cuadro?.paradasNoProgramadas || []).reduce((a,p) => a + num(p.tiempoMin), 0)) / 60;
  const horasEfectivas = Math.max(horasTurno - pProg - pNoProg, 0);
  const ratio = num(cuadro?.ratioNominal);
  const produccionNominal = ratio * horasEfectivas;
  const efectiva = num(cuadro?.produccion?.efectiva);
  const programada = num(cuadro?.produccion?.programada);
  const sopladas = num(cuadro?.produccion?.sopladas);
  const calidadBot = num(cuadro?.produccion?.calidad);
  const disponibilidad = horasTurno > 0 ? horasEfectivas / horasTurno : 0;
  const rendimiento = produccionNominal > 0 ? Math.min(efectiva / produccionNominal, 1) : 0;
  const calidad = sopladas > 0 ? Math.min(calidadBot / sopladas, 1) : (efectiva > 0 ? 1 : 0);
  const oee = disponibilidad * rendimiento * calidad;
  const cumplimiento = programada > 0 ? efectiva / programada : 0;
  const eficiencia = produccionNominal > 0 ? efectiva / produccionNominal : 0;
  const noCumplida = Math.max(produccionNominal - efectiva, 0);
  const ratioEfectivo = horasEfectivas > 0 ? efectiva / horasEfectivas : 0;

  return { horasEfectivas, produccionNominal, disponibilidad, rendimiento, calidad, oee,
    cumplimiento, eficiencia, noCumplida, ratioEfectivo, pProg, pNoProg };
}

function calcDerivedMulti(r){

  const cuadros = Array.isArray(r?.cuadros) ? r.cuadros : [];
  const ds = cuadros.map(calcDerivedCuadro);

  const horasTurno = ds.reduce((a,d) => a + num(d.horasEfectivas + d.pProg + d.pNoProg), 0);
  const horasEfectivas = ds.reduce((a,d) => a + num(d.horasEfectivas), 0);
  const produccionNominal = ds.reduce((a,d) => a + num(d.produccionNominal), 0);
  const efectiva = cuadros.reduce((a,c) => a + num(c?.produccion?.efectiva), 0);
  const programada = cuadros.reduce((a,c) => a + num(c?.produccion?.programada), 0);
  const sopladas = cuadros.reduce((a,c) => a + num(c?.produccion?.sopladas), 0);
  const calidadBot = cuadros.reduce((a,c) => a + num(c?.produccion?.calidad), 0);
  const pProg = ds.reduce((a,d) => a + num(d.pProg), 0);
  const pNoProg = ds.reduce((a,d) => a + num(d.pNoProg), 0);
  const disponibilidad = horasTurno > 0 ? horasEfectivas / horasTurno : 0;
  const rendimiento = produccionNominal > 0 ? Math.min(efectiva / produccionNominal, 1) : 0;
  const calidad = sopladas > 0 ? Math.min(calidadBot / sopladas, 1) : (efectiva > 0 ? 1 : 0);
  const oee = disponibilidad * rendimiento * calidad;
  const cumplimiento = programada > 0 ? efectiva / programada : 0;
  const eficiencia = produccionNominal > 0 ? efectiva / produccionNominal : 0;
  const noCumplida = Math.max(produccionNominal - efectiva, 0);
  const ratioEfectivo = horasEfectivas > 0 ? efectiva / horasEfectivas : 0;

  return { horasTurno, horasEfectivas, produccionNominal, disponibilidad, rendimiento, calidad,
    oee, cumplimiento, eficiencia, noCumplida, ratioEfectivo, pProg, pNoProg,
    efectiva, programada, sopladas, calidadBot, cuadros: ds };
}

function calcDerived(r){
  return Array.isArray(r?.cuadros) ? calcDerivedMulti(r) : calcDerivedLegacy(r);
}


/* =========================================================
   REGISTRO VACÍO
   ========================================================= */

function blankCuadro(lineKey, numero){

  const marcas = MARCAS_POR_LINEA[lineKey] || [];
  const presentaciones = PRESENTACIONES_POR_LINEA[lineKey] || [];
  const activo = numero === 1;
  const marca = activo && marcas.length ? marcas[0] : '';
  const presentacion = activo && presentaciones.length ? presentaciones[0] : '';
  const horaInicio = activo ? '07:00' : '';
  const horaFin = activo ? '19:00' : '';

  return {
    numero,
    marca,
    presentacion,
    gramajePreforma: 0,
    ratioNominal: activo ? obtenerRatioNominal(lineKey, presentacion, marca) : 0,
    lote: '',
    fechaVencimiento: '',
    horaInicio,
    horaFin,
    horasTurno: horaInicio && horaFin ? calcularHorasTurno(horaInicio, horaFin) : 0,
    produccion: { programada:0, efectiva:0, sopladas:0, calidad:0, paletas:0 },
    paradasProgramadas: [{ descripcion:'', tiempoMin:0 }],
    paradasNoProgramadas: [{ descripcion:'', tiempoMin:0 }],
    insumos: { cajasPreformas:0, planchasCarton:0, polietilenoKg:0, stretchFilmKg:0 },
    mermas: MERMA_ITEMS.map(m => ({item:m, peso:0, unidades:0})),
    observaciones: ''
  };
}

function normalizarCuadros(record){

  if(!record) return [];

  if(!Array.isArray(record.cuadros) || record.cuadros.length !== 4){
    const cuadros = [1,2,3,4].map(n => blankCuadro(record.linea, n));
    const legacy = cuadros[0];

    legacy.marca = record.marca || legacy.marca;
    legacy.presentacion = record.presentacion || legacy.presentacion;
    legacy.gramajePreforma = record.gramajePreforma ?? 0;
    legacy.ratioNominal = record.ratioNominal ?? obtenerRatioNominal(record.linea, legacy.presentacion, legacy.marca);
    legacy.lote = record.lote || '';
    legacy.fechaVencimiento = record.fechaVencimiento || '';
    legacy.horaInicio = record.horaInicio || '07:00';
    legacy.horaFin = record.horaFin || '19:00';
    legacy.horasTurno = num(record.horasTurno) || calcularHorasTurno(legacy.horaInicio, legacy.horaFin);
    legacy.produccion = JSON.parse(JSON.stringify(record.produccion || legacy.produccion));
    legacy.paradasProgramadas = JSON.parse(JSON.stringify(record.paradasProgramadas || legacy.paradasProgramadas));
    legacy.paradasNoProgramadas = JSON.parse(JSON.stringify(record.paradasNoProgramadas || legacy.paradasNoProgramadas));
    legacy.insumos = JSON.parse(JSON.stringify(record.insumos || legacy.insumos));
    legacy.mermas = JSON.parse(JSON.stringify(record.mermas || legacy.mermas));
    legacy.observaciones = record.observaciones || '';
    record.cuadros = cuadros;
  }

  record.cuadros = record.cuadros.slice(0,4).map((c,i) => {
    const base = blankCuadro(record.linea, i+1);
    return {
      ...base,
      ...(c || {}),
      numero:i+1,
      produccion:{...base.produccion, ...(c?.produccion || {})},
      insumos:{...base.insumos, ...(c?.insumos || {})},
      paradasProgramadas:Array.isArray(c?.paradasProgramadas) && c.paradasProgramadas.length ? c.paradasProgramadas : base.paradasProgramadas,
      paradasNoProgramadas:Array.isArray(c?.paradasNoProgramadas) && c.paradasNoProgramadas.length ? c.paradasNoProgramadas : base.paradasNoProgramadas,
      mermas:Array.isArray(c?.mermas) && c.mermas.length ? c.mermas : base.mermas
    };
  });

  return record.cuadros;
}

function syncLegacyFromCuadro1(){
  if(!draft) return;
  const c = normalizarCuadros(draft)[0];
  draft.marca = c.marca;
  draft.presentacion = c.presentacion;
  draft.gramajePreforma = c.gramajePreforma;
  draft.ratioNominal = c.ratioNominal;
  draft.lote = c.lote;
  draft.fechaVencimiento = c.fechaVencimiento;
  draft.horaInicio = c.horaInicio;
  draft.horaFin = c.horaFin;
  draft.horasTurno = c.horasTurno;
  draft.produccion = c.produccion;
  draft.paradasProgramadas = c.paradasProgramadas;
  draft.paradasNoProgramadas = c.paradasNoProgramadas;
  draft.insumos = c.insumos;
  draft.mermas = c.mermas;
  draft.observaciones = c.observaciones;
}

function generarLoteCuadro(cuadro){
  if(!draft || !cuadro) return '';
  const codigoMarca = obtenerCodigoMarca(draft.linea, cuadro.marca, cuadro.presentacion);
  const esAlfanumerico = codigoMarca !== '' && !/^\d+$/.test(String(codigoMarca));
  if(esAlfanumerico) return String(codigoMarca);
  const diaJuliano = obtenerDiaDelAño(draft.fecha);
  const semana = obtenerSemana(draft.fecha);
  const codigoTurno = obtenerCodigoTurno(draft.turno);
  if(diaJuliano === '' || semana === '' || codigoTurno === '') return '';
  return String(diaJuliano) + '-' + String(codigoTurno) + String(codigoMarca) + String(semana);
}

function actualizarLotesCuadros(){
  if(!draft) return;
  normalizarCuadros(draft).forEach(c => { c.lote = generarLoteCuadro(c); });
  syncLegacyFromCuadro1();
}

function calcularPaletasCuadro(cuadro){
  if(!draft || !cuadro) return 0;
  const upp = obtenerUnidadesPorPalet(draft.linea, cuadro.marca, cuadro.presentacion);
  if(!upp) return 0;
  return Math.round((num(cuadro.produccion?.efectiva) / upp) * 100) / 100;
}

function calcularCajasPreformasCuadro(cuadro){
  if(!draft || !cuadro) return 0;
  const efectiva = num(cuadro.produccion?.efectiva);
  if(draft.linea === 'PET1' || draft.linea === 'PET2'){
    const divisor = obtenerDivisorCajasPreformas(cuadro.presentacion);
    return divisor ? Math.round((efectiva/divisor)*100)/100 : 0;
  }
  if(draft.linea === 'B7L') return Math.round((efectiva/2900)*100)/100;
  return 0;
}

function calcularPlanchasCartonCuadro(cuadro){
  if(!draft || !cuadro) return 0;
  const paletas = num(cuadro.produccion?.paletas);
  if(draft.linea === 'PET1' || draft.linea === 'PET2'){
    const factor = obtenerFactorCartonPET(cuadro.presentacion);
    return factor ? Math.round(paletas*factor*100)/100 : 0;
  }
  if(draft.linea === 'B7L') return Math.round(paletas*CARTON_FIJO_B7L*100)/100;
  if(draft.linea === 'C20L'){
    const factor = normalizarTexto(cuadro.marca)==='san fernando' ? CARTON_C20L_SAN_FERNANDO : CARTON_C20L_DEFAULT;
    return Math.round(paletas*factor*100)/100;
  }
  if(draft.linea === 'B20L') return Math.round(paletas*CARTON_FIJO_B20L*100)/100;
  return 0;
}

function calcularPolietilenoCuadro(cuadro){
  if(!draft || !cuadro) return 0;
  const paletas = num(cuadro.produccion?.paletas);
  if(draft.linea === 'PET1' || draft.linea === 'PET2'){
    const factor = obtenerFactorPolietileno(cuadro.presentacion);
    return factor ? Math.round(paletas*factor*100)/100 : 0;
  }
  if(draft.linea === 'B7L'){
    const m = normalizarTexto(cuadro.marca);
    return MARCAS_POLIETILENO_B7L_SI.includes(m) ? Math.round(paletas*POLIETILENO_B7L_FACTOR*100)/100 : 0;
  }
  if(draft.linea === 'C20L') return Math.round(paletas*POLIETILENO_C20L_FACTOR*100)/100;
  return 0;
}

function calcularStretchFilmCuadro(cuadro){
  if(!draft || !cuadro) return 0;
  const paletas = num(cuadro.produccion?.paletas);
  if(draft.linea === 'PET1' || draft.linea === 'PET2'){
    const factor = obtenerFactorStretchFilm(cuadro.presentacion);
    return factor ? Math.round(paletas*factor*100)/100 : 0;
  }
  if(draft.linea === 'B7L') return Math.round(paletas*STRETCHFILM_B7L_FACTOR*100)/100;
  if(draft.linea === 'C20L') return Math.round(paletas*STRETCHFILM_C20L_FACTOR*100)/100;
  if(draft.linea === 'B20L') return Math.round(paletas*STRETCHFILM_B20L_FACTOR*100)/100;
  return 0;
}

function actualizarCuadro(i){
  if(!draft) return null;
  const c = normalizarCuadros(draft)[i];
  if(!c) return null;
  c.ratioNominal = obtenerRatioNominal(draft.linea, c.presentacion, c.marca);
  c.horasTurno = c.horaInicio && c.horaFin ? calcularHorasTurno(c.horaInicio,c.horaFin) : 0;
  c.produccion.paletas = calcularPaletasCuadro(c);
  c.insumos.cajasPreformas = calcularCajasPreformasCuadro(c);
  c.insumos.planchasCarton = calcularPlanchasCartonCuadro(c);
  c.insumos.polietilenoKg = calcularPolietilenoCuadro(c);
  c.insumos.stretchFilmKg = calcularStretchFilmCuadro(c);
  c.lote = generarLoteCuadro(c);
  actualizarMermasAutomaticasCuadro(i);
  return c;
}

function actualizarTodosCuadros(){
  if(!draft) return;
  normalizarCuadros(draft).forEach((_,i) => actualizarCuadro(i));
  syncLegacyFromCuadro1();
}

function blankRecord(lineKey){
  const ahora = new Date();
  const today = ahora.getFullYear() + '-' + String(ahora.getMonth()+1).padStart(2,'0') + '-' + String(ahora.getDate()).padStart(2,'0');
  const diaDelAño = obtenerDiaDelAño(today);
  const semana = obtenerSemana(today);
  const record = {
    id:null, linea:lineKey, fecha:today, diaJuliano:diaDelAño, semana,
    turno:'DÍA',
    cuadros:[1,2,3,4].map(n => blankCuadro(lineKey,n)),
    personal:PERSONAL_POSICIONES.map(p => ({posicion:p,nombre:'',cargo:''})),
    observaciones:'', registradoPor:state.user ? state.user.nombre : '', timestamp:null
  };
  draft = record;
  actualizarTodosCuadros();
  return draft;
}


/* =========================================================
   RENDER PRINCIPAL
   ========================================================= */

function renderMain(){

  const main =
    document.getElementById('main');


  /* =====================================================
     PANTALLA DE BIENVENIDA
     ===================================================== */

  if(state.showWelcome){

    const nombreUsuario =
      state.user?.nombre ||
      state.user?.username ||
      'USUARIO';

    main.innerHTML = `

      <section class="welcome-panel">

        <div class="welcome-content">

          <div class="welcome-tag">
            SISTEMA INTERNO · GLACIAL
          </div>

          <h1>
            JEFATURA DE PRODUCCIÓN
          </h1>

          <p class="welcome-message">
            ¡Bienvenido,
            <strong>
              ${nombreUsuario}
            </strong>!
          </p>

          <p class="welcome-description">
            Has ingresado correctamente al sistema de
            control operativo y seguimiento de producción.
          </p>

          <button
            type="button"
            class="btn btn-glacial"
            onclick="closeWelcome()"
            style="margin-top:24px;"
          >
            Ingresar al sistema →
          </button>

        </div>

        <div class="welcome-logo">

          <img
            src="/img/logo_glacial.png"
            alt="GLACIAL"
          >

        </div>

      </section>

    `;

    return;

  }


  /* =====================================================
     RESUMEN GENERAL
     ===================================================== */

  if(
    state.currentTab === 'resumen'
  ){

    renderResumen(main);

    return;

  }


  /* =====================================================
     BUSCAR LÍNEA ACTUAL
     ===================================================== */

  const line =
    LINES.find(
      l => l.key === state.currentLine
    );


  if(!line){

    return;

  }


  /* =====================================================
     CONTENIDO PRINCIPAL
     ===================================================== */

  main.innerHTML = `

    <div class="main-head">

      <div>

        <h2>
          ${line.name}
        </h2>

        <div class="sub">
          Reporte diario de producción,
          paradas, insumos, mermas y personal
        </div>

      </div>

    </div>


    <div class="tabs">

      <button
        class="tab ${
          state.currentTab === 'nuevo'
            ? 'active'
            : ''
        }"
        onclick="setTab('nuevo')"
      >
        Nuevo registro
      </button>


      <button
        class="tab ${
          state.currentTab === 'historial'
            ? 'active'
            : ''
        }"
        onclick="setTab('historial')"
      >
        Historial
      </button>


      <button
        class="tab ${
          state.currentTab === 'graficos'
            ? 'active'
            : ''
        }"
        onclick="setTab('graficos')"
      >
        Gráficos
      </button>

    </div>


    <div id="tab-content"></div>

  `;


  /* =====================================================
     RENDERIZAR PESTAÑA
     ===================================================== */

  if(
    state.currentTab === 'nuevo'
  ){

    renderFormTab();

  }

  else if(
    state.currentTab === 'historial'
  ){

    renderHistorialTab();

  }

  else{

    renderGraficosTab();

  }

}


function setTab(t){

  state.currentTab = t;

  state.viewingRecordId = null;

  renderMain();

}


/* =========================================================
   TAB NUEVO REGISTRO
   ========================================================= */

function renderFormTab(){

  if(!draft || draft.linea !== state.currentLine){
    draft = blankRecord(state.currentLine);
  }

  normalizarCuadros(draft);
  actualizarTodosCuadros();
  const c = document.getElementById('tab-content');
  const d = calcDerivedMulti(draft);
  const cuadros = draft.cuadros;
  const line = LINES.find(l => l.key === state.currentLine) || {name:state.currentLine,ratioDefault:0};

  const cuadroCard = (q, i) => {
    const dq = calcDerivedCuadro(q);
    const paradaProg = (q.paradasProgramadas||[]).reduce((a,p)=>a+num(p.tiempoMin),0);
    const paradaNoProg = (q.paradasNoProgramadas||[]).reduce((a,p)=>a+num(p.tiempoMin),0);
    const tieneDatos = !!(q.marca || q.presentacion || q.horaInicio || num(q.produccion?.efectiva)>0);
    const marcas = MARCAS_POR_LINEA[state.currentLine] || [];
    const presentaciones = PRESENTACIONES_POR_LINEA[state.currentLine] || [];
    const optionList = arr => arr.length ? arr.map(o=>`<option value="${o}" ${o===q.presentacion?'selected':''}>${o}</option>`).join('') : '<option value="">Sin opciones</option>';
    const marcaList = arr => arr.length ? arr.map(o=>`<option value="${o}" ${o===q.marca?'selected':''}>${o}</option>`).join('') : '<option value="">Sin opciones</option>';
    const field = (label, type, value, handler, extra='') => `<div class="field-sm"><label>${label}</label><input type="${type}" value="${value ?? ''}" ${extra} oninput="${handler}"></div>`;
    const readonly = 'readonly style="background:#f1f3f5;font-weight:700;color:#243746;cursor:not-allowed;"';

    return `
      <div class="production-card" style="border:1px solid #D7DBD4;border-radius:10px;background:#fff;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.05);min-width:0;">
        <div style="background:linear-gradient(135deg,#0f8fc8,#14b8c4);color:#fff;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-size:16px;">Cuadro ${i+1}</strong>
          <span style="font-size:12px;opacity:.95;">${tieneDatos ? 'Producción' : 'Sin producción'}</span>
        </div>
        <div style="padding:12px;">
          <div class="grid grid-2">
            <div class="field-sm"><label>Marca</label><select onchange="updateCuadroField(${i},'marca',this.value)"><option value="">Seleccione...</option>${marcaList(marcas)}</select></div>
            <div class="field-sm"><label>Presentación</label><select onchange="updateCuadroField(${i},'presentacion',this.value)"><option value="">Seleccione...</option>${optionList(presentaciones)}</select></div>
            <div class="field-sm"><label>Lote automático</label><input type="text" value="${q.lote||''}" ${readonly}></div>
            <div class="field-sm"><label for="gramaje_preforma_${i}">Gramaje preforma (g)</label><select id="gramaje_preforma_${i}" name="gramaje_preforma_${i}" class="gramaje-preforma-select" style="width:100%;min-height:38px;display:block;cursor:pointer;" onchange="updateCuadroField(${i},'gramajePreforma',this.value)"><option value="">Seleccione...</option>${['42.7','43.7','45.7','33.7','21.7','23.7','17.7','15.7','13.8','12.7'].map(g=>`<option value="${g}" ${String(q.gramajePreforma ?? '')===g?'selected':''}>${g} g</option>`).join('')}</select></div>
            <div class="field-sm"><label>Hora inicio</label><input type="time" value="${q.horaInicio||''}" onchange="updateCuadroField(${i},'horaInicio',this.value)"></div>
            <div class="field-sm"><label>Hora fin</label><input type="time" value="${q.horaFin||''}" onchange="updateCuadroField(${i},'horaFin',this.value)"></div>
          </div>

          <div style="margin:10px 0;padding:10px;border-radius:8px;background:#EEF8FC;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center;">
            <div><small>Ratio nominal</small><br><strong>${num(q.ratioNominal).toLocaleString('es-PE')} BPH</strong></div>
            <div><small>Horas turno</small><br><strong>${num(q.horasTurno).toFixed(2)} h</strong></div>
            <div><small>Horas efectivas</small><br><strong style="font-size:18px;">${num(dq.horasEfectivas).toFixed(2)} h</strong></div>
          </div>

          <div class="panel" style="margin:10px 0 0;border-left:4px solid #20a86b;">
            <div class="panel-head"><h4 style="margin:0;">Producción</h4></div>
            <div class="panel-body grid grid-2">
              ${field('Programada (bot)','number',q.produccion.programada,`updateCuadroPath(${i},'produccion.programada',this.value)`)}
              ${field('Efectiva (bot)','number',q.produccion.efectiva,`updateCuadroPath(${i},'produccion.efectiva',this.value)`)}
              ${field('Botellas sopladas','number',q.produccion.sopladas,`updateCuadroPath(${i},'produccion.sopladas',this.value)`)}
              ${field('Botellas calidad','number',q.produccion.calidad,`updateCuadroPath(${i},'produccion.calidad',this.value)`)}
              <div class="field-sm"><label>Paletas (automático)</label><input type="text" value="${q.produccion.paletas ?? 0}" ${readonly}></div>
            </div>
          </div>

          <div class="panel accent-amber" style="margin:10px 0 0;">
            <div class="panel-head"><h4 style="margin:0;">Paradas programadas</h4><button class="btn btn-ghost btn-sm" onclick="addParadaCuadro(${i},'paradasProgramadas')">+ Agregar</button></div>
            <div class="panel-body">${paradasTableCuadro('paradasProgramadas',q.paradasProgramadas,i)}</div>
          </div>

          <div class="panel accent-bad" style="margin:10px 0 0;">
            <div class="panel-head"><h4 style="margin:0;">Paradas no programadas</h4><button class="btn btn-ghost btn-sm" onclick="addParadaCuadro(${i},'paradasNoProgramadas')">+ Agregar</button></div>
            <div class="panel-body">${paradasTableCuadro('paradasNoProgramadas',q.paradasNoProgramadas,i)}</div>
          </div>

          <div class="panel" style="margin:10px 0 0;">
            <div class="panel-head"><h4 style="margin:0;">Mermas</h4></div>
            <div class="panel-body">${mermasTableCuadro(q.mermas,q.produccion.efectiva,draft.linea,i)}</div>
          </div>

          <div class="panel" style="margin:10px 0 0;">
            <div class="panel-head"><h4 style="margin:0;">Insumos automáticos</h4></div>
            <div class="panel-body" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;">
              <div class="field-sm"><label>Cajas preformas</label><input type="text" value="${q.insumos.cajasPreformas ?? 0}" ${readonly}></div>
              <div class="field-sm"><label>Planchas cartón</label><input type="text" value="${q.insumos.planchasCarton ?? 0}" ${readonly}></div>
              <div class="field-sm"><label>Polietileno (kg)</label><input type="text" value="${q.insumos.polietilenoKg ?? 0}" ${readonly}></div>
              <div class="field-sm"><label>Stretch film (kg)</label><input type="text" value="${q.insumos.stretchFilmKg ?? 0}" ${readonly}></div>
            </div>
          </div>

          <div style="margin-top:10px;padding:9px;border-radius:8px;background:#F5F8FA;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;text-align:center;font-size:12px;">
            <div><small>Prod. nominal</small><br><strong>${Math.round(dq.produccionNominal).toLocaleString('es-PE')}</strong></div>
            <div><small>Disponibilidad</small><br><strong>${pct(dq.disponibilidad)}</strong></div>
            <div><small>OEE</small><br><strong>${pct(dq.oee)}</strong></div>
            <div><small>Paradas</small><br><strong>${paradaProg+paradaNoProg} min</strong></div>
          </div>
        </div>
      </div>`;
  };

  c.innerHTML = `
    <div class="kpi-row">
      ${kpi('Disponibilidad',pct(d.disponibilidad),d.disponibilidad)}
      ${kpi('Rendimiento',pct(d.rendimiento),d.rendimiento)}
      ${kpi('Calidad',pct(d.calidad),d.calidad)}
      ${kpi('OEE',pct(d.oee),d.oee)}
      ${kpi('Cumplimiento',pct(d.cumplimiento),d.cumplimiento)}
      ${kpi('Producción efectiva',Math.round(d.efectiva||0).toLocaleString('es-PE'),1)}
    </div>

    <div class="panel" style="margin-bottom:14px;">
      <div class="panel-head"><h3>Datos generales · ${line.name}</h3></div>
      <div class="panel-body grid grid-4">
        ${inp('fecha','Fecha','date',draft.fecha)}
        ${inp('diaJuliano','Día juliano','number',draft.diaJuliano)}
        ${inp('semana','Semana','number',draft.semana)}
        ${sel('turno','Turno',['DÍA','NOCHE'],draft.turno)}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:start;">
      ${cuadros.map((q,i)=>cuadroCard(q,i)).join('')}
    </div>

    <div class="panel" style="margin-top:14px;">
      <div class="panel-head"><h3>Personal del turno</h3></div>
      <div class="panel-body">${personalTable(draft.personal,draft.linea)}</div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Observaciones generales</h3></div>
      <div class="panel-body">
        <textarea id="f_observaciones" rows="3" style="width:100%;border:1px solid var(--line-strong);border-radius:3px;padding:10px;font-family:inherit;font-size:14px;" oninput="updateField('observaciones',this.value)">${draft.observaciones||''}</textarea>
      </div>
    </div>

    <div class="actions-row">
      <button class="btn btn-ghost" onclick="resetDraft()">Limpiar formulario</button>
      <button class="btn btn-primary" onclick="saveDraft()">Guardar registro</button>
    </div>
  `;
}


/* =========================================================
   KPI
   ========================================================= */

function kpi(label,value,ratio){

  return `

    <div class="kpi ${statusClass(ratio)}">

      <div class="kpi-label">
        ${label}
      </div>

      <div class="kpi-value">
        ${value}
      </div>

    </div>

  `;

}


/* =========================================================
   INPUT
   ========================================================= */

function inp(
  name,
  label,
  type,
  value
){

  const automatico =
    name === 'diaJuliano' ||
    name === 'semana' ||
    name === 'ratioNominal' ||
    name === 'horasTurno';


  return `

    <div class="field-sm">

      <label>
        ${label}
      </label>

      <input
        id="f_${name}"
        type="${type}"
        ${name === 'gramajePreforma' ? 'min="0" step="0.1" inputmode="decimal"' : ''}
        value="${value ?? ''}"
        ${automatico ? 'readonly' : ''}
        ${automatico ? `
          style="
            background:#f1f3f5;
            cursor:not-allowed;
            font-weight:600;
          "
        ` : ''}
        oninput="
          updateField(
            '${name}',
            this.value
          )
        "
        ${name === 'gramajePreforma' ? `
          onblur="
            actualizarMermasAutomaticas();
            renderFormTab();
          "
        ` : ''}
      >

    </div>

  `;

}


/* =========================================================
   INPUT POR RUTA
   ========================================================= */

function inpPath(
  path,
  label,
  type,
  value
){

  return `

    <div class="field-sm">

      <label>
        ${label}
      </label>

      <input
        type="${type}"
        value="${value ?? ''}"
        oninput="
          updatePath(
            '${path}',
            this.value
          )
        "
      >

    </div>

  `;

}


/* =========================================================
   SELECT
   ========================================================= */

function sel(
  name,
  label,
  options,
  value
){

  return `

    <div class="field-sm">

      <label>
        ${label}
      </label>

      <select
        onchange="
          updateField(
            '${name}',
            this.value
          )
        "
      >

        ${
          options.length

            ? options.map(

                o => `

                  <option
                    value="${o}"
                    ${
                      o === value
                        ? 'selected'
                        : ''
                    }
                  >
                    ${o}
                  </option>

                `

              ).join('')

            : `

              <option value="">
                Sin opciones
              </option>

            `
        }

      </select>

    </div>

  `;

}



function updateCuadroField(i,name,val){
  const q=normalizarCuadros(draft)[i];
  if(!q) return;
  q[name]=val;
  if(name==='marca'||name==='presentacion'){
    q.ratioNominal=obtenerRatioNominal(draft.linea,q.presentacion,q.marca);
    q.lote=generarLoteCuadro(q);
    actualizarCuadro(i);
    renderFormTab();
    return;
  }
  if(name==='horaInicio'||name==='horaFin'){
    actualizarCuadro(i);
    renderFormTab();
    return;
  }
  if(name==='gramajePreforma'){
    q.gramajePreforma=val;
    draft.gramajePreforma=val;
    actualizarMermasAutomaticasCuadro(i);
    return;
  }
  actualizarCuadro(i);
  refreshKpisOnly();
}

function updateCuadroPath(i,path,val){
  const q=normalizarCuadros(draft)[i];
  if(!q) return;
  const [a,b]=path.split('.');
  if(!q[a]) q[a]={};
  q[a][b]=val;
  actualizarCuadro(i);
  if(path==='produccion.efectiva'){
    const scrollY=window.scrollY;
    renderFormTab();
    requestAnimationFrame(()=>window.scrollTo(0,scrollY));
    return;
  }
  refreshKpisOnly();
}

/* =========================================================
   ACTUALIZAR CAMPO
   ========================================================= */

function updateField(
  name,
  val
){

  draft[name] = val;


  if(name === 'fecha'){

    draft.diaJuliano =
      obtenerDiaDelAño(val);

    draft.semana =
      obtenerSemana(val);

    actualizarLote();
    actualizarLotesCuadros();

    renderFormTab();

    return;

  }


  if(name === 'turno'){

    actualizarLote();
    actualizarLotesCuadros();

    renderFormTab();

    return;

  }


  if(name === 'gramajePreforma'){

    // Se conserva el texto mientras se escribe para permitir
    // valores decimales como 21.7, 12.7, etc.
    draft.gramajePreforma = val;

    // No renderizar aquí: si se renderiza en cada tecla,
    // el navegador elimina el punto mientras se escribe.
    actualizarMermasAutomaticas();

    return;
  }


  if(name === 'marca'){

    draft.ratioNominal =
      obtenerRatioNominal(
        draft.linea,
        draft.presentacion,
        val
      );

    actualizarLote();

    actualizarPaletas();
    actualizarCajasPreformas();
    actualizarPlanchasCarton();
    actualizarPolietileno();
    actualizarStretchFilm();

    renderFormTab();

    return;

  }


  if(name === 'presentacion'){

    draft.ratioNominal =
      obtenerRatioNominal(
        draft.linea,
        val,
        draft.marca
      );

    actualizarLote();

    actualizarPaletas();
    actualizarCajasPreformas();
    actualizarPlanchasCarton();
    actualizarPolietileno();
    actualizarStretchFilm();

    renderFormTab();

    return;

  }


  /* =======================================================
     HORA INICIO / HORA FIN
     ======================================================= */

  if(
    name === 'horaInicio' ||
    name === 'horaFin'
  ){

    draft.horasTurno =
      calcularHorasTurno(
        draft.horaInicio,
        draft.horaFin
      );

    renderFormTab();

    return;

  }


  /*
     "horasTurno" es un campo automático:
     no se permite editarlo a mano.
  */

  if(name === 'horasTurno'){

    draft.horasTurno =
      calcularHorasTurno(
        draft.horaInicio,
        draft.horaFin
      );

    return;

  }


  if(name === 'diaJuliano'){

    draft.diaJuliano =
      obtenerDiaDelAño(
        draft.fecha
      );

    actualizarLote();

    return;

  }


  if(name === 'semana'){

    draft.semana =
      obtenerSemana(
        draft.fecha
      );

    actualizarLote();

    return;

  }


  refreshKpisOnly();

}


/* =========================================================
   ACTUALIZAR CAMPO ANIDADO
   ========================================================= */

function updatePath(
  path,
  val
){

  const [a,b] =
    path.split('.');


  if(!draft[a]){

    draft[a] = {};

  }


  draft[a][b] = val;


  /*
     Si cambia la producción efectiva,
     recalculamos el N° de paletas
     automáticamente y refrescamos
     solo ese campo (sin perder el foco
     del resto del formulario).
  */

if(path === 'produccion.efectiva'){

  actualizarMermasAutomaticas();
  actualizarPaletas();
  actualizarCajasPreformas();
  actualizarPlanchasCarton();
  actualizarPolietileno();
  actualizarStretchFilm();

  const campoPaletas =
    document.getElementById('f_paletas');

  if(campoPaletas){
    campoPaletas.value = draft.produccion.paletas ?? 0;
  }

  const campoCajas =
    document.getElementById('f_cajaspreformas');

  if(campoCajas){
    campoCajas.value = draft.insumos.cajasPreformas ?? 0;
  }

  const campoCarton =
    document.getElementById('f_planchascarton');

  if(campoCarton){
    campoCarton.value = draft.insumos.planchasCarton ?? 0;
  }

  const campoPolietileno =
    document.getElementById('f_polietileno');

  if(campoPolietileno){
    campoPolietileno.value = draft.insumos.polietilenoKg ?? 0;
  }

  const campoStretch =
    document.getElementById('f_stretchfilm');

  if(campoStretch){
    campoStretch.value = draft.insumos.stretchFilmKg ?? 0;
  }

}


  refreshKpisOnly();

}


/* =========================================================
   ACTUALIZAR KPI
   ========================================================= */

function refreshKpisOnly(){
  if(!draft) return;
  const d = calcDerived(draft);
  const row=document.querySelector('.kpi-row');
  if(row){
    row.innerHTML=`${kpi('Disponibilidad',pct(d.disponibilidad),d.disponibilidad)}${kpi('Rendimiento',pct(d.rendimiento),d.rendimiento)}${kpi('Calidad',pct(d.calidad),d.calidad)}${kpi('OEE',pct(d.oee),d.oee)}${kpi('Cumplimiento',pct(d.cumplimiento),d.cumplimiento)}${kpi('Producción efectiva',Math.round(d.efectiva ?? num(draft.produccion?.efectiva)).toLocaleString('es-PE'),1)}`;
  }
}



/* =========================================================
   CUADROS DE PRODUCCIÓN — PARADAS
   ========================================================= */

function paradasTableCuadro(key, rows, cuadroIndex){
  const esProgramada = key === 'paradasProgramadas';
  const safeRows = Array.isArray(rows) && rows.length
    ? rows
    : [{descripcion:'', tiempoMin:0}];

  return `
    <div class="paradas-cuadro-table" style="width:100%;overflow-x:auto;">
      <table style="width:100%;min-width:0;border-collapse:collapse;table-layout:fixed;">
        <thead>
          <tr>
            <th style="width:58%;text-align:left;">Descripción</th>
            <th style="width:27%;text-align:center;">Tiempo (min)</th>
            <th style="width:15%;text-align:center;"></th>
          </tr>
        </thead>
        <tbody>
          ${safeRows.map((r,i)=>`
            <tr>
              <td style="padding:5px;">
                ${esProgramada
                  ? `<select style="width:100%;box-sizing:border-box;" onchange="updateArrItemCuadro(${cuadroIndex},'${key}',${i},'descripcion',this.value)">
                       <option value="">Seleccione...</option>
                       ${PARADAS_PROGRAMADAS.map(o=>`<option value="${o}" ${o===r.descripcion?'selected':''}>${o}</option>`).join('')}
                     </select>`
                  : `<input type="text" value="${r.descripcion||''}" placeholder="Motivo de la parada" style="width:100%;box-sizing:border-box;" oninput="updateArrItemCuadro(${cuadroIndex},'${key}',${i},'descripcion',this.value)">`}
              </td>
              <td style="padding:5px;">
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  value="${r.tiempoMin ?? 0}"
                  placeholder="0"
                  title="Ingrese los minutos de la parada"
                  style="width:100%;box-sizing:border-box;text-align:center;font-weight:600;"
                  oninput="updateArrItemCuadro(${cuadroIndex},'${key}',${i},'tiempoMin',this.value)"
                >
              </td>
              <td style="padding:5px;text-align:center;">
                <button type="button" class="row-del" onclick="removeArrItemCuadro(${cuadroIndex},'${key}',${i})">✕</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

function addParadaCuadro(cuadroIndex,key){
  const q=normalizarCuadros(draft)[cuadroIndex];
  if(!q) return;
  q[key].push({descripcion:'',tiempoMin:0});
  renderFormTab();
}

function updateArrItemCuadro(cuadroIndex,key,i,field,val){
  const q=normalizarCuadros(draft)[cuadroIndex];
  if(!q || !q[key]?.[i]) return;
  q[key][i][field]=field==='tiempoMin' ? Number(val||0) : val;
  actualizarCuadro(cuadroIndex);
  refreshKpisOnly();
}

function removeArrItemCuadro(cuadroIndex,key,i){
  const q=normalizarCuadros(draft)[cuadroIndex];
  if(!q) return;
  q[key].splice(i,1);
  if(!q[key].length) q[key].push({descripcion:'',tiempoMin:0});
  actualizarCuadro(cuadroIndex);
  renderFormTab();
}

/* =========================================================
   CUADROS DE PRODUCCIÓN — MERMAS
   ========================================================= */

function obtenerValoresMermaCuadro(r,linea,cuadro){
  const pesoIngresado=num(r.peso);
  const unidadesIngresadas=Math.round(num(r.unidades));
  if((linea==='PET1'||linea==='PET2') && (r.item==='Botellas'||r.item==='Preformas')){
    const gramaje=num(cuadro?.gramajePreforma);
    return {peso:pesoIngresado,unidades:gramaje>0?Math.round((pesoIngresado*1000)/gramaje):0};
  }
  if((linea==='PET1'||linea==='PET2') && (r.item==='Tapa Plana'||r.item==='Tapa Sport Cap')) return {peso:pesoIngresado,unidades:Math.round((pesoIngresado*1000)/1.34)};
  if((linea==='PET1'||linea==='PET2') && r.item==='Etiqueta') return {peso:pesoIngresado,unidades:Math.round(pesoIngresado/0.00064)};
  if((linea==='PET1'||linea==='PET2') && r.item==='Polietileno') return {peso:pesoIngresado,unidades:Number((pesoIngresado/28).toFixed(2))};
  if(linea==='B7L' && (r.item==='Botellas'||r.item==='Preformas')) return {peso:pesoIngresado,unidades:Math.round((pesoIngresado*1000)/90)};
  if(linea==='B7L' && r.item==='Tapas') return {peso:pesoIngresado,unidades:Math.round((pesoIngresado*1000)/4.72)};
  if(linea==='B7L' && r.item==='Etiqueta') return {peso:pesoIngresado,unidades:Math.round((pesoIngresado*1000)/2.9)};
  if(linea==='B7L' && r.item==='Polietileno') return {peso:pesoIngresado,unidades:Number((pesoIngresado/28).toFixed(2))};
  if(linea==='C20L') return {peso:unidadesIngresadas*0.0906,unidades:unidadesIngresadas};
  return {peso:pesoIngresado,unidades:unidadesIngresadas};
}

function actualizarMermasAutomaticasCuadro(i){
  if(!draft) return;
  const q=normalizarCuadros(draft)[i];
  if(!q || !Array.isArray(q.mermas)) return;
  q.mermas.forEach(r=>{const v=obtenerValoresMermaCuadro(r,draft.linea,q);r.peso=v.peso;r.unidades=Number(num(v.unidades).toFixed(2));});
}

function mermasTableCuadro(rows,produccionEfectiva,linea,cuadroIndex){
  const efectiva=num(produccionEfectiva)||0;
  const q=normalizarCuadros(draft)[cuadroIndex];
  return `<div class="mermas-cuadro-scroll" style="width:100%;max-width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;border:1px solid #D7DBD4;border-radius:8px;background:#fff;"><table style="width:520px;min-width:520px;table-layout:fixed;border-collapse:collapse;font-size:12px;margin:0;"><thead><tr><th style="width:34%;text-align:left;">Componente</th><th style="width:22%;text-align:center;">Peso (kg)</th><th style="width:24%;text-align:center;">Unidades</th><th style="width:20%;text-align:center;">%</th></tr></thead><tbody>
  ${(rows||[]).map((r,i)=>{const v=obtenerValoresMermaCuadro(r,linea,q);const porcentaje=efectiva>0?((v.unidades/efectiva)*100).toFixed(2)+'%':'—';const pesoEdit=linea==='C20L';const unidadesEdit=linea==='C20L'||linea==='B20L';return `<tr><td>${r.item}</td><td><input type="number" min="0" step="0.01" value="${v.peso}" ${pesoEdit?'readonly style="width:100%;box-sizing:border-box;background:#f1f3f5;font-weight:700;cursor:not-allowed;text-align:center;"':'onchange="updateMermaCuadro('+cuadroIndex+','+i+',\'peso\',this.value)" style="width:100%;box-sizing:border-box;text-align:center;"'}></td><td><input type="number" min="0" step="${r.item==='Polietileno'?'0.01':'1'}" value="${r.item==='Polietileno'?Number(v.unidades).toFixed(2):v.unidades}" ${unidadesEdit?'oninput="updateMermaCuadro('+cuadroIndex+','+i+',\'unidades\',this.value)" style="width:100%;box-sizing:border-box;text-align:center;"':'readonly style="width:100%;box-sizing:border-box;background:#f1f3f5;font-weight:700;cursor:not-allowed;text-align:center;"'}></td><td class="small-muted">${porcentaje}</td></tr>`;}).join('')}
  </tbody></table></div>`;
}

function updateMermaCuadro(cuadroIndex,i,field,val){
  const q=normalizarCuadros(draft)[cuadroIndex];
  if(!q?.mermas?.[i]) return;
  if((draft.linea==='PET1'||draft.linea==='PET2'||draft.linea==='B7L')&&field!=='peso') return;
  if(draft.linea==='C20L'&&field!=='unidades') return;
  q.mermas[i][field]=val===''?'':Number(val);
  actualizarMermasAutomaticasCuadro(cuadroIndex);
  renderFormTab();
}

/* =========================================================
   TABLA DE PARADAS
   ========================================================= */

function paradasTable(
  key,
  rows
){

  const esProgramada =
    key === 'paradasProgramadas';


  return `

    <table>

      <thead>

        <tr>

          <th>
            Descripción
          </th>

          <th style="width:140px;">
            Tiempo (min)
          </th>

          <th style="width:40px;">
          </th>

        </tr>

      </thead>


      <tbody>

        ${

          rows.map(

            (r,i) => {

              const celdaDescripcion =

                esProgramada

                  ? `

                    <select
                      onchange="
                        updateArrItem(
                          '${key}',
                          ${i},
                          'descripcion',
                          this.value
                        )
                      "
                    >

                      <option
                        value=""
                        ${
                          r.descripcion
                            ? ''
                            : 'selected'
                        }
                      >
                        Seleccione...
                      </option>


                      ${

                        PARADAS_PROGRAMADAS.map(

                          opcion => `

                            <option
                              value="${opcion}"
                              ${
                                opcion === r.descripcion
                                  ? 'selected'
                                  : ''
                              }
                            >
                              ${opcion}
                            </option>

                          `

                        ).join('')

                      }

                    </select>

                  `

                  : `

                    <input
                      style="width:500%;"
                      value="${r.descripcion}"
                      oninput="
                        updateArrItem(
                          '${key}',
                          ${i},
                          'descripcion',
                          this.value
                        )
                      "
                    >

                  `;


              return `

              <tr>

                <td>

                  ${celdaDescripcion}

                </td>


                <td>

                  <input
                    type="number"
                    value="${r.tiempoMin}"
                    oninput="
                      updateArrItem(
                        '${key}',
                        ${i},
                        'tiempoMin',
                        this.value
                      )
                    "
                  >

                </td>


                <td>

                  <button
                    class="row-del"
                    onclick="
                      removeArrItem(
                        '${key}',
                        ${i}
                      )
                    "
                  >
                    ✕
                  </button>

                </td>

              </tr>

              `;

            }

          ).join('')

        }

      </tbody>

    </table>

  `;

}


function addParada(key){

  draft[key].push({

    descripcion:'',

    tiempoMin:0

  });


  renderFormTab();

}


function updateArrItem(
  key,
  i,
  field,
  val
){

  draft[key][i][field] = val;

  refreshKpisOnly();

}


function removeArrItem(
  key,
  i
){

  draft[key].splice(i,1);

  renderFormTab();

}


/* =========================================================
   TABLA DE MERMAS
   ========================================================= */

function obtenerValoresMerma(r, linea){

  const pesoIngresado = num(r.peso);
  const unidadesIngresadas = Math.round(num(r.unidades));

  /* =====================================================
     PET1 / PET2
     ===================================================== */

  if(
    (linea === 'PET1' || linea === 'PET2') &&
    (r.item === 'Botellas' || r.item === 'Preformas')
  ){

    const gramaje = num(draft.gramajePreforma);

    return {
      peso: pesoIngresado,
      unidades:
        gramaje > 0
          ? Math.round((pesoIngresado * 1000) / gramaje)
          : 0
    };
  }


  if(
    (linea === 'PET1' || linea === 'PET2') &&
    (r.item === 'Tapa Plana' ||
     r.item === 'Tapa Sport Cap')
  ){

    return {
      peso: pesoIngresado,
      unidades:
        Math.round((pesoIngresado * 1000) / 1.34)
    };
  }


  if(
    (linea === 'PET1' || linea === 'PET2') &&
    r.item === 'Etiqueta'
  ){

    return {
      peso: pesoIngresado,
      unidades:
        Math.round(pesoIngresado / 0.00064)
    };
  }


  if(
    (linea === 'PET1' || linea === 'PET2') &&
    r.item === 'Polietileno'
  ){

    return {
      peso: pesoIngresado,
      unidades:
        Number((pesoIngresado / 28).toFixed(2))
    };
  }


  /* =====================================================
     B7L
     ===================================================== */

  if(
    linea === 'B7L' &&
    (r.item === 'Botellas' || r.item === 'Preformas')
  ){

    return {
      peso: pesoIngresado,
      unidades:
        Math.round((pesoIngresado * 1000) / 90)
    };
  }


  if(
    linea === 'B7L' &&
    r.item === 'Tapas'
  ){

    return {
      peso: pesoIngresado,
      unidades:
        Math.round((pesoIngresado * 1000) / 4.72)
    };
  }


  if(
    linea === 'B7L' &&
    r.item === 'Etiqueta'
  ){

    return {
      peso: pesoIngresado,
      unidades:
        Math.round((pesoIngresado * 1000) / 2.9)
    };
  }


  if(
    linea === 'B7L' &&
    r.item === 'Polietileno'
  ){

    return {
      peso: pesoIngresado,
      unidades:
        Number((pesoIngresado / 28).toFixed(2))
    };
  }


  /* =====================================================
     BL7
     ===================================================== */

  if(
    linea === 'BL7' &&
    r.item === 'Tapas'
  ){

    return {
      peso: pesoIngresado,
      unidades:
        Math.round((pesoIngresado * 1000) / 4.72)
    };
  }


  /* =====================================================
     C20L
     ===================================================== */

  if(linea === 'C20L'){

    return {
      peso:
        unidadesIngresadas * 0.0906,
      unidades:
        unidadesIngresadas
    };
  }


  /* =====================================================
     CASO GENERAL
     ===================================================== */

  return {
    peso: pesoIngresado,
    unidades: unidadesIngresadas
  };
}



function actualizarMermasAutomaticas(){
  if(!draft) return;
  if(Array.isArray(draft.cuadros)){
    normalizarCuadros(draft).forEach((_,i)=>actualizarMermasAutomaticasCuadro(i));
    syncLegacyFromCuadro1();
    return;
  }
  if(!Array.isArray(draft.mermas)) return;
  draft.mermas.forEach(r=>{
    const valores=obtenerValoresMerma(r,draft.linea);
    r.peso=valores.peso;
    r.unidades=Number(num(valores.unidades).toFixed(2));
  });
}



function mermasTable(
  rows,
  produccionEfectiva,
  linea
){

  const efectiva =
    num(produccionEfectiva) || 0;


  return `

    <table>

      <thead>

        <tr>

          <th>
            Componente
          </th>

          <th>
            Peso (Kg)
          </th>

          <th>
            Unidades
          </th>

          <th>
            Porcentaje
          </th>

        </tr>

      </thead>


      <tbody>

        ${

          rows.map(

            (r,i) => {

              const valores =
                obtenerValoresMerma(
                  r,
                  linea
                );


              const porcentaje =
                efectiva > 0
                  ? (
                      (
                        valores.unidades /
                        efectiva
                      ) * 100
                    ).toFixed(2) + '%'
                  : '—';


              /*
                 PESO:

                 Se utiliza onchange en lugar de oninput
                 para permitir escribir decimales completos
                 como 1.1, 1.25, 4.35, etc.

                 Con oninput la tabla se renderizaba
                 mientras el usuario escribía.
              */

              const pesoEditable =
                linea === 'C20L'
                  ? ''
                  : `
                    onchange="
                      updateMerma(
                        ${i},
                        'peso',
                        this.value
                      )
                    "
                  `;


              const pesoReadonly =
                linea === 'C20L'
                  ? `
                    readonly
                    tabindex="-1"
                    style="
                      background:#f1f3f5;
                      font-weight:700;
                      color:#243746;
                      cursor:not-allowed;
                    "
                  `
                  : '';


              const unidadesEditable =
                linea === 'C20L' ||
                linea === 'B20L';


              const unidadesReadonly =
                unidadesEditable
                  ? ''
                  : `
                    readonly
                    tabindex="-1"
                    style="
                      background:#f1f3f5;
                      font-weight:700;
                      color:#243746;
                      cursor:not-allowed;
                    "
                  `;


              const unidadesEvento =
                unidadesEditable
                  ? `
                    oninput="
                      updateMerma(
                        ${i},
                        'unidades',
                        this.value
                      )
                    "
                  `
                  : '';


              return `

                <tr>

                  <td>
                    ${r.item}
                  </td>


                  <td>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value="${valores.peso}"
                      ${pesoReadonly}
                      ${pesoEditable}
                    >

                  </td>


                  <td>

                    <input
                      type="number"
                      min="0"
                      step="1"
                      value="${
                        r.item === 'Polietileno'
                          ? Number(valores.unidades).toFixed(2)
                          : valores.unidades
                      }"
                      ${unidadesReadonly}
                      ${unidadesEvento}
                    >

                  </td>


                  <td class="small-muted">
                    ${porcentaje}
                  </td>

                </tr>

              `;

            }

          ).join('')

        }

      </tbody>

    </table>

  `;
}



function updateMerma(
  i,
  field,
  val
){

  if(!draft.mermas[i]){
    return;
  }


  /*
     PET1, PET2 y B7L:
     solo se puede modificar el peso.

     C20L:
     solo se pueden modificar las unidades.

     B20L:
     ambos campos son editables.
  */

  if(
    (draft.linea === 'PET1' ||
     draft.linea === 'PET2' ||
     draft.linea === 'B7L') &&
    field !== 'peso'
  ){
    return;
  }


  if(
    draft.linea === 'C20L' &&
    field !== 'unidades'
  ){
    return;
  }


  /*
     Guardar posición actual de la pantalla
     antes de volver a renderizar.
  */

  const scrollY =
    window.scrollY;


  /*
     Guardar el valor.

     El peso puede contener decimales:
     1.1
     1.25
     4.35
     */

  if(field === 'peso'){

    draft.mermas[i][field] =
      val === ''
        ? ''
        : Number(val);

  }else{

    draft.mermas[i][field] =
      val === ''
        ? ''
        : Number(val);

  }


  actualizarMermasAutomaticas();


  renderFormTab();


  /*
     Restaurar la posición anterior
     después del renderizado.
  */

  requestAnimationFrame(() => {

    window.scrollTo(
      0,
      scrollY
    );

  });

}


/* =========================================================
   TABLA DE PERSONAL
   ========================================================= */

function personalTable(
  rows,
  linea
){

  const trabajadoresDisponibles =
    findWorkersForLine(linea);

  return `

    <datalist id="personal-workers-datalist">

      ${
        trabajadoresDisponibles.map(

          w => `
            <option value="${w.nombre}">
              ${w.cargo || ''}
            </option>
          `

        ).join('')
      }

    </datalist>


    <table>

      <thead>

        <tr>

          <th style="width:160px;">
            Posición
          </th>

          <th>
            Nombre y apellido
          </th>

          <th style="width:160px;">
            Cargo
          </th>

        </tr>

      </thead>


      <tbody>

        ${

          rows.map(

            (r,i) => `

              <tr>

                <td>
                  ${r.posicion}
                </td>


                <td>

                  <input
                    list="personal-workers-datalist"
                    value="${r.nombre}"
                    oninput="
                      updatePersonal(
                        ${i},
                        'nombre',
                        this.value
                      )
                    "
                  >

                </td>


                <td>

                  <input
                    id="personal-cargo-${i}"
                    value="${r.cargo}"
                    oninput="
                      updatePersonal(
                        ${i},
                        'cargo',
                        this.value
                      )
                    "
                  >

                </td>

              </tr>

            `

          ).join('')

        }

      </tbody>

    </table>

  `;

}


function updatePersonal(
  i,
  field,
  val
){

  draft.personal[i][field] = val;


  /*
     Si se escribe/selecciona un nombre que coincide con
     un trabajador registrado en la base de datos, se
     autocompleta su cargo (sin necesidad de re-renderizar
     toda la tabla, para no perder el foco del campo).
  */

  if(field === 'nombre'){

    const worker =
      findWorkerByNombre(val);

    if(worker){

      draft.personal[i].cargo =
        worker.cargo || '';

      const cargoInput =
        document.getElementById(
          'personal-cargo-' + i
        );

      if(cargoInput){

        cargoInput.value =
          worker.cargo || '';

      }

    }

  }

}


/* =========================================================
   LIMPIAR FORMULARIO
   ========================================================= */

function resetDraft(){
  draft=blankRecord(state.currentLine);
  renderFormTab();
}


/* =========================================================
   GUARDAR REGISTRO
   ========================================================= */

function saveDraft(){
  if(!draft) return;
  normalizarCuadros(draft);
  actualizarTodosCuadros();
  actualizarMermasAutomaticas();
  draft.diaJuliano=obtenerDiaDelAño(draft.fecha);
  draft.semana=obtenerSemana(draft.fecha);
  actualizarLotesCuadros();
  syncLegacyFromCuadro1();
  draft.id='r_'+Date.now();
  draft.timestamp=new Date().toISOString();
  draft.registradoPor=state.user.nombre;
  const records=loadRecords();
  records.push(JSON.parse(JSON.stringify(draft)));
  saveRecords(records);
  draft=blankRecord(state.currentLine);
  state.currentTab='historial';
  renderMain();
}


/* =========================================================
   HISTORIAL
   ========================================================= */

function renderHistorialTab(){

  const c =
    document.getElementById(
      'tab-content'
    );


  const records =

    loadRecords()

      .filter(
        r => r.linea === state.currentLine
      )

      .sort(
        (a,b) =>
          (b.timestamp || '')
            .localeCompare(
              a.timestamp || ''
            )
      );


  if(records.length === 0){

    c.innerHTML = `

      <div class="panel">

        <div class="empty-state">

          <h4>
            Sin registros todavía
          </h4>

          <p>
            Los reportes que guardes
            en "Nuevo registro"
            para esta línea
            aparecerán aquí.
          </p>

        </div>

      </div>

    `;

    return;

  }


  c.innerHTML = `

    <div class="panel">

      <div
        class="panel-body"
        style="padding:0;"
      >

        <table>

          <thead>

            <tr>

              <th>
                Fecha
              </th>

              <th>
                Día juliano
              </th>

              <th>
                Semana
              </th>

              <th>
                Turno
              </th>

              <th>
                Marca
              </th>

              <th>
                Presentación
              </th>

              <th>
                Lote
              </th>

              <th>
                Prod. efectiva
              </th>

              <th>
                OEE
              </th>

              <th>
                Registrado por
              </th>

              <th>
              </th>

            </tr>

          </thead>


          <tbody>

            ${

              records.map(

                r => {

                  normalizarCuadros(r);
                  const d = calcDerived(r);
                  const q1 = r.cuadros?.find(q => num(q.produccion?.efectiva) > 0 || q.marca || q.presentacion) || r.cuadros?.[0] || {};


                  const diaAño =
                    r.diaJuliano ||
                    obtenerDiaDelAño(
                      r.fecha
                    );


                  const semana =
                    r.semana ||
                    obtenerSemana(
                      r.fecha
                    );


                  return `

                    <tr
                      class="hist-row"
                      onclick="
                        viewRecord(
                          '${r.id}'
                        )
                      "
                    >

                      <td>
                        ${r.fecha}
                      </td>


                      <td>
                        ${diaAño || '—'}
                      </td>


                      <td>
                        ${semana || '—'}
                      </td>


                      <td>
                        ${r.turno}
                      </td>


                      <td>
                        ${r.marca || '—'}
                      </td>


                      <td>
                        ${r.presentacion || '—'}
                      </td>


                      <td>
                        <strong>
                          ${
                            q1.lote || r.lote || '—'
                          }
                        </strong>
                      </td>


                      <td>
                        ${
                          num(d.efectiva ?? r.produccion?.efectiva)
                          .toLocaleString(
                            'es-PE'
                          )
                        }
                      </td>


                      <td>

                        <span
                          class="
                            badge
                            ${badgeClass(d.oee)}
                          "
                        >
                          ${pct(d.oee)}
                        </span>

                      </td>


                      <td
                        class="small-muted"
                      >
                        ${
                          r.registradoPor ||
                          '—'
                        }
                      </td>


                      <td>

                        <button
                          class="row-del"
                          onclick="
                            event.stopPropagation();
                            deleteRecord(
                              '${r.id}'
                            )
                          "
                        >
                          ✕
                        </button>

                      </td>


                    </tr>

                  `;

                }

              ).join('')

            }

          </tbody>

        </table>

      </div>

    </div>

  `;

}


/* =========================================================
   ELIMINAR REGISTRO
   ========================================================= */

function deleteRecord(id){

  if(
    state.user.rol === 'Supervisor'
  ){

    return;

  }


  let records =
    loadRecords().filter(
      r => r.id !== id
    );


  saveRecords(records);

  renderHistorialTab();

}


/* =========================================================
   VER REGISTRO
   ========================================================= */

function viewRecord(id){

  state.viewingRecordId = id;

  state.currentTab = 'graficos';

  renderMain();

}


/* =========================================================
   GRÁFICOS
   ========================================================= */

function destroyCharts(){

  Object.values(
    state.charts
  ).forEach(

    ch => {

      if(ch){

        ch.destroy();

      }

    }

  );


  state.charts = {};

}


/* =========================================================
   EXPORTACIÓN — EXCEL Y PNG
   Se ejecuta directamente desde la aplicación.
   Excel: usa SheetJS bajo demanda.
   PNG: genera un dashboard completo a partir de los gráficos
   actuales de Chart.js, sin capturar la pantalla del navegador.
   ========================================================= */

function cargarScriptExterno(url, nombreGlobal){

  return new Promise((resolve, reject) => {

    if(window[nombreGlobal]){
      resolve(window[nombreGlobal]);
      return;
    }

    const existente =
      document.querySelector(`script[src="${url}"]`);

    if(existente){
      existente.addEventListener('load', () => resolve(window[nombreGlobal]));
      existente.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');

    script.src = url;
    script.onload = () => resolve(window[nombreGlobal]);
    script.onerror = () => reject(
      new Error('No se pudo cargar la librería de exportación.')
    );

    document.head.appendChild(script);

  });

}


function descargarArchivo(blob, nombre){

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');

  a.href = url;
  a.download = nombre;

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

}


function nombreArchivoSeguro(texto){

  return String(texto || '')
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'reporte';

}


function obtenerRegistroExportacion(){

  const all = loadRecords()
    .filter(r => r.linea === state.currentLine)
    .sort((a,b) =>
      (a.timestamp || '').localeCompare(b.timestamp || '')
    );

  if(all.length === 0){
    alert('No hay registros guardados para exportar.');
    return null;
  }

  const rec = state.viewingRecordId
    ? all.find(r => r.id === state.viewingRecordId)
    : all[all.length - 1];

  if(!rec){
    alert('No se encontró el registro seleccionado.');
    return null;
  }

  return { rec, all, d: calcDerived(rec) };

}


async function exportarExcel(){
  const data = obtenerRegistroExportacion();

  if(!data){
    return;
  }

  const { rec, all, d } = data;

  try{

    /* =========================================================
       GLACIAL — EXPORTACIÓN EXCEL
       Genera un libro con una presentación similar al
       DEMO BASE.xlsm:
       - Reporte Diario
       - Paradas
       - Mermas
       - Insumos
       - Personal
       - Historial línea
       - Resumen líneas

       Se utiliza ExcelJS para permitir formato, colores,
       bordes, combinaciones de celdas, anchos y congelado.
       ========================================================= */

    const ExcelJS = await cargarScriptExterno(
      'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
      'ExcelJS'
    );

    if(!ExcelJS){
      throw new Error('ExcelJS no está disponible.');
    }

    const wb = new ExcelJS.Workbook();

    wb.creator = 'GLACIAL';
    wb.lastModifiedBy = 'GLACIAL';
    wb.created = new Date();
    wb.modified = new Date();
    wb.subject = 'Reporte Diario de Producción';
    wb.title = 'Reporte Diario de Producción GLACIAL';

    const lineaNombre =
      (LINES.find(l => l.key === rec.linea) || {}).name || rec.linea || '';

    const numero = v =>
      Number.isFinite(Number(v)) ? Number(v) : 0;

    const texto = v =>
      v === null || v === undefined ? '' : String(v);

    const totalParadasProg =
      (rec.paradasProgramadas || [])
        .reduce((a,p) => a + numero(p.tiempoMin), 0);

    const totalParadasNoProg =
      (rec.paradasNoProgramadas || [])
        .reduce((a,p) => a + numero(p.tiempoMin), 0);

    /* =========================================================
       PALETA / ESTILOS
       ========================================================= */

    const COLORS = {
      azul: '17365D',
      azulClaro: 'D9EAF7',
      azulMuyClaro: 'EEF5FB',
      celeste: '5B9BD5',
      gris: 'D9E1F2',
      grisClaro: 'F3F6F9',
      grisTexto: '5B6573',
      blanco: 'FFFFFF',
      negro: '1F2933',
      verde: '70AD47',
      verdeClaro: 'E2F0D9',
      amarillo: 'FFD966',
      amarilloClaro: 'FFF2CC',
      rojo: 'C00000',
      rojoClaro: 'F4CCCC'
    };

    const borderThin = {
      top:    { style:'thin', color:{ argb:'FFB7C9D6' } },
      left:   { style:'thin', color:{ argb:'FFB7C9D6' } },
      bottom: { style:'thin', color:{ argb:'FFB7C9D6' } },
      right:  { style:'thin', color:{ argb:'FFB7C9D6' } }
    };

    function fill(color){
      return {
        type:'pattern',
        pattern:'solid',
        fgColor:{ argb:'FF' + color }
      };
    }

    function setCell(ws, address, value, opts = {}){
      const c = ws.getCell(address);
      c.value = value;

      if(opts.font) c.font = opts.font;
      if(opts.fill) c.fill = fill(opts.fill);
      if(opts.border !== false) c.border = opts.border || borderThin;
      if(opts.alignment) c.alignment = opts.alignment;
      if(opts.numFmt) c.numFmt = opts.numFmt;

      return c;
    }

    function styleTitle(ws, range, value){
      ws.mergeCells(range);
      const c = ws.getCell(range.split(':')[0]);
      c.value = value;
      c.font = {
        name:'Arial',
        size:16,
        bold:true,
        color:{argb:'FF' + COLORS.blanco}
      };
      c.fill = fill(COLORS.azul);
      c.alignment = {
        horizontal:'center',
        vertical:'middle'
      };

      const [a,b] = range.split(':');
      const startCell = ws.getCell(a);
      const endCell = ws.getCell(b);

      for(let r=startCell.row;r<=endCell.row;r++){
        for(let col=startCell.col;col<=endCell.col;col++){
          ws.getCell(r,col).fill = fill(COLORS.azul);
          ws.getCell(r,col).border = borderThin;
        }
      }

      ws.getRow(startCell.row).height = 28;
    }

    function styleSection(ws, range, value){
      ws.mergeCells(range);
      const c = ws.getCell(range.split(':')[0]);
      c.value = value;
      c.font = {
        name:'Arial',
        size:11,
        bold:true,
        color:{argb:'FF' + COLORS.blanco}
      };
      c.fill = fill(COLORS.celeste);
      c.alignment = {
        horizontal:'left',
        vertical:'middle'
      };

      const [a,b] = range.split(':');
      const s = ws.getCell(a);
      const e = ws.getCell(b);

      for(let r=s.row;r<=e.row;r++){
        for(let col=s.col;col<=e.col;col++){
          ws.getCell(r,col).fill = fill(COLORS.celeste);
          ws.getCell(r,col).border = borderThin;
        }
      }

      ws.getRow(s.row).height = 21;
    }

    function styleHeaderRow(ws, row, fromCol, toCol){
      for(let col=fromCol;col<=toCol;col++){
        const c = ws.getCell(row,col);
        c.font = {
          name:'Arial',
          size:9,
          bold:true,
          color:{argb:'FF' + COLORS.negro}
        };
        c.fill = fill(COLORS.azulClaro);
        c.border = borderThin;
        c.alignment = {
          horizontal:'center',
          vertical:'middle',
          wrapText:true
        };
      }
      ws.getRow(row).height = 30;
    }

    function styleBody(ws, fromRow, toRow, fromCol, toCol){
      for(let r=fromRow;r<=toRow;r++){
        for(let col=fromCol;col<=toCol;col++){
          const c = ws.getCell(r,col);
          c.font = {
            name:'Arial',
            size:9,
            color:{argb:'FF' + COLORS.negro}
          };
          c.border = borderThin;
          c.alignment = {
            vertical:'center',
            wrapText:true
          };
        }
      }
    }

    function kpiFill(value){
      const n = numero(value);
      if(n >= 0.85) return COLORS.verdeClaro;
      if(n >= 0.60) return COLORS.amarilloClaro;
      return COLORS.rojoClaro;
    }

    /* =========================================================
       HOJA PRINCIPAL — REPORTE DIARIO
       ========================================================= */

    const ws = wb.addWorksheet('Reporte Diario', {
      views:[{ state:'frozen', ySplit:4 }]
    });

    ws.pageSetup = {
      orientation:'landscape',
      fitToPage:true,
      fitToWidth:1,
      fitToHeight:0,
      paperSize:9
    };

    ws.pageMargins = {
      left:0.25,
      right:0.25,
      top:0.4,
      bottom:0.4,
      header:0.2,
      footer:0.2
    };

    const widths = {
      1:3, 2:18, 3:16, 4:15, 5:15,
      6:22, 7:16, 8:16, 9:16, 10:16,
      11:16, 12:16, 13:16, 14:16, 15:16,
      16:16, 17:16, 18:16, 19:16
    };

    Object.keys(widths).forEach(k => {
      ws.getColumn(Number(k)).width = widths[k];
    });

    styleTitle(
      ws,
      'B2:S2',
      'REPORTE DIARIO DE PRODUCCIÓN — GLACIAL'
    );

    ws.mergeCells('B3:S3');
    setCell(
      ws,
      'B3',
      `${lineaNombre}  |  Fecha: ${texto(rec.fecha)}  |  Turno: ${texto(rec.turno)}  |  Lote: ${texto(rec.lote)}`,
      {
        font:{
          name:'Arial',
          size:10,
          bold:true,
          color:{argb:'FF' + COLORS.grisTexto}
        },
        fill:COLORS.grisClaro,
        alignment:{
          horizontal:'center',
          vertical:'middle'
        }
      }
    );
    ws.getRow(3).height = 22;

    styleSection(ws,'B5:S5','DATOS GENERALES');

    const datos = [
      ['Fecha', texto(rec.fecha), 'Día juliano', texto(rec.diaJuliano), 'Semana', texto(rec.semana)],
      ['Turno', texto(rec.turno), 'Horas turno', numero(rec.horasTurno), 'Registrado por', texto(rec.registradoPor)],
      ['Marca', texto(rec.marca), 'Presentación', texto(rec.presentacion), 'Lote', texto(rec.lote)],
      ['Fecha vencimiento', texto(rec.fechaVencimiento), 'Hora inicio', texto(rec.horaInicio), 'Hora fin', texto(rec.horaFin)]
    ];

    datos.forEach((row,i) => {
      const r = 6+i;
      setCell(ws,`B${r}`,row[0],{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulMuyClaro});
      ws.mergeCells(`C${r}:E${r}`);
      setCell(ws,`C${r}`,row[1]);

      setCell(ws,`F${r}`,row[2],{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulMuyClaro});
      ws.mergeCells(`G${r}:I${r}`);
      setCell(ws,`G${r}`,row[3]);

      setCell(ws,`J${r}`,row[4],{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulMuyClaro});
      ws.mergeCells(`K${r}:S${r}`);
      setCell(ws,`K${r}`,row[5]);
    });

    styleSection(ws,'B11:S11','PRODUCCIÓN');

    const prodHeaders = [
      'Indicador',
      'Valor',
      'Unidad',
      'Indicador',
      'Valor',
      'Unidad',
      'Indicador',
      'Valor',
      'Unidad'
    ];

    prodHeaders.forEach((h,i) => {
      const col = 2+i*2;
      if(col <= 18){
        ws.getCell(12,col).value = h;
        ws.getCell(12,col).font = {name:'Arial',size:9,bold:true};
        ws.getCell(12,col).fill = fill(COLORS.azulClaro);
        ws.getCell(12,col).border = borderThin;
        ws.getCell(12,col).alignment = {horizontal:'center',vertical:'center',wrapText:true};
      }
    });
    ws.getCell(12,19).value = 'Valor';
    ws.getCell(12,19).font = {name:'Arial',size:9,bold:true};
    ws.getCell(12,19).fill = fill(COLORS.azulClaro);
    ws.getCell(12,19).border = borderThin;

    const prodRows = [
      ['Producción programada',numero(rec.produccion?.programada),'Bot',
       'Producción efectiva',numero(rec.produccion?.efectiva),'Bot',
       'Producción nominal',numero(d.produccionNominal),'Bot'],
      ['Botellas sopladas',numero(rec.produccion?.sopladas),'Und',
       'Calidad',numero(rec.produccion?.calidad),'Und',
       'Paletas',numero(rec.produccion?.paletas),'Pal'],
      ['Producción no cumplida',numero(d.noCumplida),'Bot',
       'Ratio nominal',numero(rec.ratioNominal),'B/H',
       'Ratio efectivo',numero(d.ratioEfectivo),'B/H']
    ];

    prodRows.forEach((row,i) => {
      const r = 13+i;
      const cols = [2,4,6,8,10,12,14,16,18];
      row.forEach((v,j) => {
        const col = cols[j];
        setCell(ws,ws.getCell(r,col).address,v);
      });
    });

    styleBody(ws,13,15,2,18);

    styleSection(ws,'B17:S17','OEE Y CUMPLIMIENTO');

    const kpis = [
      ['Disponibilidad',d.disponibilidad],
      ['Rendimiento',d.rendimiento],
      ['Calidad',d.calidad],
      ['OEE',d.oee],
      ['Cumplimiento',d.cumplimiento],
      ['Eficiencia',d.eficiencia]
    ];

    kpis.forEach((item,i) => {
      const startCol = 2 + i*3;
      ws.mergeCells(18,startCol,18,startCol+1);
      ws.getCell(18,startCol).value = item[0];
      ws.getCell(18,startCol).font = {name:'Arial',size:9,bold:true};
      ws.getCell(18,startCol).fill = fill(COLORS.azulMuyClaro);
      ws.getCell(18,startCol).border = borderThin;
      ws.getCell(18,startCol).alignment = {horizontal:'center',vertical:'center'};

      ws.getCell(19,startCol).value = numero(item[1]);
      ws.mergeCells(19,startCol,19,startCol+1);
      ws.getCell(19,startCol).font = {name:'Arial',size:13,bold:true};
      ws.getCell(19,startCol).fill = fill(kpiFill(item[1]));
      ws.getCell(19,startCol).border = borderThin;
      ws.getCell(19,startCol).numFmt = '0.0%';
      ws.getCell(19,startCol).alignment = {horizontal:'center',vertical:'center'};
    });

    ws.getRow(19).height = 25;

    styleSection(ws,'B21:S21','TIEMPOS DE PRODUCCIÓN Y PARADAS');

    const tiempos = [
      ['Horas turno',numero(rec.horasTurno),'h'],
      ['Paradas programadas',totalParadasProg,'min'],
      ['Paradas no programadas',totalParadasNoProg,'min'],
      ['Horas efectivas',numero(d.horasEfectivas),'h']
    ];

    tiempos.forEach((row,i) => {
      const r = 22+i;
      ws.mergeCells(`B${r}:E${r}`);
      setCell(ws,`B${r}`,row[0],{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulMuyClaro});
      ws.mergeCells(`F${r}:Q${r}`);
      setCell(ws,`F${r}`,row[1]);
      setCell(ws,`R${r}`,row[2],{alignment:{horizontal:'center'}});
    });
    styleBody(ws,22,25,2,18);

    styleSection(ws,'B27:S27','PARADAS PROGRAMADAS');

    const pp = rec.paradasProgramadas || [];
    setCell(ws,'B28','N°',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});
    ws.mergeCells('C28:N28');
    setCell(ws,'C28','Descripción',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});
    ws.mergeCells('O28:S28');
    setCell(ws,'O28','Tiempo (min)',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});

    for(let i=0;i<5;i++){
      const r=29+i;
      setCell(ws,`B${r}`,i+1,{alignment:{horizontal:'center'}});
      ws.mergeCells(`C${r}:N${r}`);
      setCell(ws,`C${r}`,texto(pp[i]?.descripcion || ''));
      ws.mergeCells(`O${r}:S${r}`);
      setCell(ws,`O${r}`,numero(pp[i]?.tiempoMin),{numFmt:'0.00'});
    }
    styleBody(ws,29,33,2,18);

    styleSection(ws,'B35:S35','PARADAS NO PROGRAMADAS');

    const pnp = rec.paradasNoProgramadas || [];
    setCell(ws,'B36','N°',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});
    ws.mergeCells('C36:N36');
    setCell(ws,'C36','Descripción',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});
    ws.mergeCells('O36:S36');
    setCell(ws,'O36','Tiempo (min)',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});

    for(let i=0;i<5;i++){
      const r=37+i;
      setCell(ws,`B${r}`,i+1,{alignment:{horizontal:'center'}});
      ws.mergeCells(`C${r}:N${r}`);
      setCell(ws,`C${r}`,texto(pnp[i]?.descripcion || ''));
      ws.mergeCells(`O${r}:S${r}`);
      setCell(ws,`O${r}`,numero(pnp[i]?.tiempoMin),{numFmt:'0.00'});
    }
    styleBody(ws,37,41,2,18);

    styleSection(ws,'B43:S43','MERMAS');

    setCell(ws,'B44','Componente',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro});
    ws.mergeCells('C44:H44');
    setCell(ws,'C44','Peso (kg)',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});
    ws.mergeCells('I44:N44');
    setCell(ws,'I44','Unidades',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});
    ws.mergeCells('O44:S44');
    setCell(ws,'O44','% sobre producción',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});

    const mermas = rec.mermas || [];
    for(let i=0;i<Math.max(mermas.length,6);i++){
      const r=45+i;
      const m=mermas[i] || {};
      setCell(ws,`B${r}`,texto(m.item || ''));
      ws.mergeCells(`C${r}:H${r}`);
      setCell(ws,`C${r}`,numero(m.peso),{numFmt:'0.000'});
      ws.mergeCells(`I${r}:N${r}`);
      setCell(ws,`I${r}`,numero(m.unidades),{numFmt:'#,##0'});
      ws.mergeCells(`O${r}:S${r}`);
      const base = numero(rec.produccion?.efectiva) + numero(rec.produccion?.calidad);
      const porcentaje = base > 0 ? numero(m.unidades)/base : 0;
      setCell(ws,`O${r}`,porcentaje,{numFmt:'0.0%'});
    }
    styleBody(ws,45,50,2,18);

    styleSection(ws,'B52:S52','CONSUMO DE INSUMOS');

    const insumos = [
      ['Cajas preformas',numero(rec.insumos?.cajasPreformas),'Und'],
      ['Planchas de cartón',numero(rec.insumos?.planchasCarton),'Und'],
      ['Polietileno',numero(rec.insumos?.polietilenoKg),'kg'],
      ['Stretch film',numero(rec.insumos?.stretchFilmKg),'kg']
    ];

    insumos.forEach((row,i) => {
      const r=53+i;
      ws.mergeCells(`B${r}:J${r}`);
      setCell(ws,`B${r}`,row[0],{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulMuyClaro});
      ws.mergeCells(`K${r}:Q${r}`);
      setCell(ws,`K${r}`,row[1],{numFmt:'0.00'});
      ws.mergeCells(`R${r}:S${r}`);
      setCell(ws,`R${r}`,row[2],{alignment:{horizontal:'center'}});
    });
    styleBody(ws,53,56,2,18);

    styleSection(ws,'B58:S58','PERSONAL DEL TURNO');

    setCell(ws,'B59','Posición',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro});
    ws.mergeCells('C59:J59');
    setCell(ws,'C59','Nombre y Apellido',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});
    ws.mergeCells('K59:S59');
    setCell(ws,'K59','Cargo',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});

    const personal = rec.personal || [];
    const totalPersonalRows = Math.max(personal.length, PERSONAL_POSICIONES.length);

    for(let i=0;i<totalPersonalRows;i++){
      const r=60+i;
      const p=personal[i] || {};
      setCell(ws,`B${r}`,texto(p.posicion || PERSONAL_POSICIONES[i] || ''));
      ws.mergeCells(`C${r}:J${r}`);
      setCell(ws,`C${r}`,texto(p.nombre || ''));
      ws.mergeCells(`K${r}:S${r}`);
      setCell(ws,`K${r}`,texto(p.cargo || ''));
    }
    styleBody(ws,60,59+totalPersonalRows,2,18);

    const obsRow = 61 + totalPersonalRows;
    styleSection(ws,`B${obsRow}:S${obsRow}`,'OBSERVACIONES');

    ws.mergeCells(`B${obsRow+1}:S${obsRow+3}`);
    setCell(ws,`B${obsRow+1}`,texto(rec.observaciones || ''),{
      alignment:{vertical:'top',wrapText:true}
    });

    const footerRow = obsRow+5;
    ws.mergeCells(`B${footerRow}:S${footerRow}`);
    setCell(
      ws,
      `B${footerRow}`,
      'Documento generado automáticamente por el sistema GLACIAL.',
      {
        font:{name:'Arial',size:8,italic:true,color:{argb:'FF'+COLORS.grisTexto}},
        alignment:{horizontal:'right'}
      }
    );

    ws.autoFilter = {
      from:'B12',
      to:'S12'
    };

    /* =========================================================
       HOJA PARADAS
       ========================================================= */

    const wsParadas = wb.addWorksheet('Paradas');
    wsParadas.columns = [
      {header:'Tipo',key:'tipo',width:20},
      {header:'N°',key:'numero',width:8},
      {header:'Descripción',key:'descripcion',width:50},
      {header:'Tiempo (min)',key:'tiempo',width:18}
    ];

    styleTitle(wsParadas,'A1:D1','PARADAS — ' + lineaNombre);
    wsParadas.getRow(2).values = ['Tipo','N°','Descripción','Tiempo (min)'];
    styleHeaderRow(wsParadas,2,1,4);

    let rr=3;
    for(let i=0;i<5;i++){
      wsParadas.addRow({
        tipo:'Programada',
        numero:i+1,
        descripcion:pp[i]?.descripcion || '',
        tiempo:numero(pp[i]?.tiempoMin)
      });
      rr++;
    }
    for(let i=0;i<5;i++){
      wsParadas.addRow({
        tipo:'No programada',
        numero:i+1,
        descripcion:pnp[i]?.descripcion || '',
        tiempo:numero(pnp[i]?.tiempoMin)
      });
      rr++;
    }

    styleBody(wsParadas,3,rr-1,1,4);
    wsParadas.freezePanes = 'A3';

    /* =========================================================
       HOJA MERMAS
       ========================================================= */

    const wsMermas = wb.addWorksheet('Mermas');
    wsMermas.columns = [
      {header:'Componente',key:'componente',width:28},
      {header:'Peso (kg)',key:'peso',width:15},
      {header:'Unidades',key:'unidades',width:15},
      {header:'% sobre producción',key:'porcentaje',width:20}
    ];

    styleTitle(wsMermas,'A1:D1','MERMAS — ' + lineaNombre);
    wsMermas.getRow(2).values = ['Componente','Peso (kg)','Unidades','% sobre producción'];
    styleHeaderRow(wsMermas,2,1,4);

    const baseMerma =
      numero(rec.produccion?.efectiva) +
      numero(rec.produccion?.calidad);

    (mermas.length ? mermas : [{item:'',peso:0,unidades:0}]).forEach(m=>{
      const u=numero(m.unidades);
      wsMermas.addRow({
        componente:texto(m.item),
        peso:numero(m.peso),
        unidades:u,
        porcentaje:baseMerma>0 ? u/baseMerma : 0
      });
    });

    styleBody(wsMermas,3,wsMermas.rowCount,1,4);
    for(let r=3;r<=wsMermas.rowCount;r++){
      wsMermas.getCell(r,2).numFmt='0.000';
      wsMermas.getCell(r,3).numFmt='#,##0';
      wsMermas.getCell(r,4).numFmt='0.0%';
    }

    /* =========================================================
       HOJA INSUMOS
       ========================================================= */

    const wsInsumos = wb.addWorksheet('Insumos');
    wsInsumos.columns = [
      {header:'Insumo',key:'insumo',width:30},
      {header:'Cantidad',key:'cantidad',width:18},
      {header:'Unidad',key:'unidad',width:15}
    ];

    styleTitle(wsInsumos,'A1:C1','CONSUMO DE INSUMOS — ' + lineaNombre);
    wsInsumos.getRow(2).values=['Insumo','Cantidad','Unidad'];
    styleHeaderRow(wsInsumos,2,1,3);

    [
      ['Cajas preformas',numero(rec.insumos?.cajasPreformas),'Und'],
      ['Planchas cartón',numero(rec.insumos?.planchasCarton),'Und'],
      ['Polietileno',numero(rec.insumos?.polietilenoKg),'kg'],
      ['Stretch film',numero(rec.insumos?.stretchFilmKg),'kg']
    ].forEach(x=>wsInsumos.addRow({
      insumo:x[0],
      cantidad:x[1],
      unidad:x[2]
    }));

    styleBody(wsInsumos,3,wsInsumos.rowCount,1,3);

    /* =========================================================
       HOJA PERSONAL
       ========================================================= */

    const wsPersonal = wb.addWorksheet('Personal');
    wsPersonal.columns = [
      {header:'Posición',key:'posicion',width:28},
      {header:'Nombre y Apellido',key:'nombre',width:34},
      {header:'Cargo',key:'cargo',width:32}
    ];

    styleTitle(wsPersonal,'A1:C1','PERSONAL DEL TURNO — ' + lineaNombre);
    wsPersonal.getRow(2).values=['Posición','Nombre y Apellido','Cargo'];
    styleHeaderRow(wsPersonal,2,1,3);

    const personalRows =
      personal.length
        ? personal
        : PERSONAL_POSICIONES.map(p=>({posicion:p,nombre:'',cargo:''}));

    personalRows.forEach(p=>wsPersonal.addRow({
      posicion:texto(p.posicion),
      nombre:texto(p.nombre),
      cargo:texto(p.cargo)
    }));

    styleBody(wsPersonal,3,wsPersonal.rowCount,1,3);

    /* =========================================================
       HISTORIAL DE LA LÍNEA
       ========================================================= */

    const wsHist = wb.addWorksheet('Historial línea');
    wsHist.columns = [
      {header:'Fecha',key:'fecha',width:14},
      {header:'Línea',key:'linea',width:14},
      {header:'Turno',key:'turno',width:12},
      {header:'Marca',key:'marca',width:22},
      {header:'Presentación',key:'presentacion',width:34},
      {header:'Lote',key:'lote',width:18},
      {header:'Producción programada',key:'programada',width:22},
      {header:'Producción efectiva',key:'efectiva',width:22},
      {header:'OEE %',key:'oee',width:12},
      {header:'Registrado por',key:'usuario',width:28}
    ];

    styleTitle(wsHist,'A1:J1','HISTORIAL DE PRODUCCIÓN — ' + lineaNombre);
    wsHist.getRow(2).values = wsHist.columns.map(c=>c.header);
    styleHeaderRow(wsHist,2,1,10);

    all.forEach(r=>{
      const x=calcDerived(r);
      wsHist.addRow({
        fecha:r.fecha || '',
        linea:(LINES.find(l=>l.key===r.linea)||{}).name || r.linea || '',
        turno:r.turno || '',
        marca:r.marca || '',
        presentacion:r.presentacion || '',
        lote:r.lote || '',
        programada:numero(r.produccion?.programada),
        efectiva:numero(r.produccion?.efectiva),
        oee:numero(x.oee),
        usuario:r.registradoPor || ''
      });
    });

    if(wsHist.rowCount<3){
      wsHist.addRow({});
    }

    styleBody(wsHist,3,wsHist.rowCount,1,10);
    for(let r=3;r<=wsHist.rowCount;r++){
      wsHist.getCell(r,9).numFmt='0.0%';
    }
    wsHist.freezePanes='A3';
    wsHist.autoFilter='A2:J2';

    /* =========================================================
       RESUMEN DE LÍNEAS
       ========================================================= */

    const wsLineas = wb.addWorksheet('Resumen líneas');
    wsLineas.columns = [
      {header:'Línea',key:'linea',width:16},
      {header:'Registros',key:'registros',width:12},
      {header:'Última fecha',key:'fecha',width:16},
      {header:'Producción efectiva',key:'efectiva',width:22},
      {header:'OEE %',key:'oee',width:12},
      {header:'Disponibilidad %',key:'disp',width:18},
      {header:'Rendimiento %',key:'rend',width:18},
      {header:'Calidad %',key:'calidad',width:14}
    ];

    styleTitle(wsLineas,'A1:H1','RESUMEN GENERAL POR LÍNEA');

    wsLineas.getRow(2).values = wsLineas.columns.map(c=>c.header);
    styleHeaderRow(wsLineas,2,1,8);

    LINES.forEach(line=>{
      const registros=loadRecords()
        .filter(r=>r.linea===line.key)
        .sort((a,b)=>(a.timestamp||'').localeCompare(b.timestamp||''));

      const ultimo=registros[registros.length-1];
      const x=ultimo ? calcDerived(ultimo) : null;

      wsLineas.addRow({
        linea:line.name,
        registros:registros.length,
        fecha:ultimo?.fecha || '',
        efectiva:ultimo ? numero(ultimo.produccion?.efectiva) : 0,
        oee:x ? numero(x.oee) : 0,
        disp:x ? numero(x.disponibilidad) : 0,
        rend:x ? numero(x.rendimiento) : 0,
        calidad:x ? numero(x.calidad) : 0
      });
    });

    styleBody(wsLineas,3,wsLineas.rowCount,1,8);

    for(let r=3;r<=wsLineas.rowCount;r++){
      wsLineas.getCell(r,5).numFmt='0.0%';
      wsLineas.getCell(r,6).numFmt='0.0%';
      wsLineas.getCell(r,7).numFmt='0.0%';
      wsLineas.getCell(r,8).numFmt='0.0%';

      [5,6,7,8].forEach(c=>{
        wsLineas.getCell(r,c).fill=fill(
          kpiFill(wsLineas.getCell(r,c).value)
        );
      });
    }

    /* =========================================================
       FORMATO FINAL DE TODAS LAS HOJAS
       ========================================================= */

    wb.worksheets.forEach(sheet=>{
      sheet.eachRow(row=>{
        row.eachCell(cell=>{
          if(!cell.font){
            cell.font={name:'Arial',size:9};
          }
          if(!cell.alignment){
            cell.alignment={vertical:'center'};
          }
        });
      });

      sheet.properties.defaultRowHeight = 18;
      sheet.views = [{showGridLines:false}];
    });

    /* =========================================================
       DESCARGA
       ========================================================= */

    const fechaArchivo =
      nombreArchivoSeguro(
        rec.fecha ||
        new Date().toISOString().slice(0,10)
      );

    const lineaArchivo =
      nombreArchivoSeguro(
        lineaNombre || rec.linea || state.currentLine
      );

    const turnoArchivo =
      nombreArchivoSeguro(
        rec.turno || 'turno'
      );

    const buffer = await wb.xlsx.writeBuffer();

    const blob = new Blob(
      [buffer],
      {
        type:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    );

    descargarArchivo(
      blob,
      `Reporte_Produccion_${lineaArchivo}_${fechaArchivo}_${turnoArchivo}.xlsx`
    );

  }catch(error){

    console.error(error);

    alert(
      'No se pudo generar el Excel con formato GLACIAL. ' +
      'Verifica tu conexión a internet e inténtalo nuevamente.'
    );

  }
}


function cargarImagenCanvas(src){

  return new Promise((resolve, reject) => {

    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;

  });

}


async function exportarPNG(){

  const data = obtenerRegistroExportacion();

  if(!data){
    return;
  }

  const { rec, d } = data;

  try{

    const ids = [
      'chart-oee',
      'chart-prod',
      'chart-paradas',
      'chart-mermas',
      'chart-insumos',
      'chart-tendencia'
    ];

    const imagenes = [];

    for(const id of ids){

      const chart = state.charts[
        id.replace('chart-', '')
      ];

      if(!chart){
        continue;
      }

      imagenes.push({
        id,
        img: await cargarImagenCanvas(chart.toBase64Image()),
        titulo: document
          .getElementById(id)
          ?.closest('.chart-box')
          ?.querySelector('h4')
          ?.innerText || ''
      });

    }

    const W = 1800;
    const headerH = 300;
    const boxW = 840;
    const boxH = 390;
    const gap = 40;
    const rows = Math.ceil(imagenes.length / 2);
    const H = headerH + rows * (boxH + gap) + gap;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#F5F7F9';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(40, 35, W - 80, headerH - 50);

    ctx.fillStyle = '#1F2933';
    ctx.font = 'bold 34px Arial';
    ctx.fillText('REPORTE DIARIO DE PRODUCCIÓN', 75, 85);

    ctx.font = '22px Arial';
    ctx.fillStyle = '#52606D';
    ctx.fillText(
      `${rec.linea || ''} · ${rec.fecha || ''} · ${rec.turno || ''} · Lote: ${rec.lote || '—'}`,
      75,
      125
    );

    const kpis = [
      ['OEE', `${(num(d.oee) * 100).toFixed(1)}%`],
      ['Disponibilidad', `${(num(d.disponibilidad) * 100).toFixed(1)}%`],
      ['Rendimiento', `${(num(d.rendimiento) * 100).toFixed(1)}%`],
      ['Calidad', `${(num(d.calidad) * 100).toFixed(1)}%`],
      ['Producción efectiva', `${num(rec.produccion?.efectiva).toLocaleString('es-PE')}`]
    ];

    const cardW = 315;
    const cardY = 165;
    const cardGap = 20;

    kpis.forEach((k, i) => {

      const x = 75 + i * (cardW + cardGap);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x, cardY, cardW, 85);

      ctx.strokeStyle = '#D9E2EC';
      ctx.strokeRect(x, cardY, cardW, 85);

      ctx.fillStyle = '#7B8794';
      ctx.font = '16px Arial';
      ctx.fillText(k[0], x + 15, cardY + 28);

      ctx.fillStyle = '#1F2933';
      ctx.font = 'bold 25px Arial';
      ctx.fillText(k[1], x + 15, cardY + 62);

    });

    for(let i = 0; i < imagenes.length; i++){

      const item = imagenes[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 40 + col * (boxW + gap);
      const y = headerH + gap + row * (boxH + gap);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x, y, boxW, boxH);

      ctx.strokeStyle = '#D9E2EC';
      ctx.strokeRect(x, y, boxW, boxH);

      ctx.fillStyle = '#1F2933';
      ctx.font = 'bold 20px Arial';
      ctx.fillText(item.titulo, x + 20, y + 32);

      const maxW = boxW - 40;
      const maxH = boxH - 65;
      const scale = Math.min(
        maxW / item.img.width,
        maxH / item.img.height
      );

      const iw = item.img.width * scale;
      const ih = item.img.height * scale;
      const ix = x + (boxW - iw) / 2;
      const iy = y + 45 + (maxH - ih) / 2;

      ctx.drawImage(item.img, ix, iy, iw, ih);

    }

    canvas.toBlob(blob => {

      if(!blob){
        alert('No se pudo generar la imagen PNG.');
        return;
      }

      const fecha = nombreArchivoSeguro(rec.fecha || new Date().toISOString().slice(0,10));
      const linea = nombreArchivoSeguro(rec.linea || state.currentLine);

      descargarArchivo(
        blob,
        `Dashboard_Produccion_${linea}_${fecha}.png`
      );

    }, 'image/png');

  }catch(error){

    console.error(error);

    alert('No se pudo generar el PNG. Verifica que los gráficos estén visibles e inténtalo nuevamente.');

  }

}


function renderGraficosTab(){

  const c =
    document.getElementById(
      'tab-content'
    );


  const all =

    loadRecords()

      .filter(
        r => r.linea === state.currentLine
      )

      .sort(
        (a,b) =>
          (a.timestamp || '')
            .localeCompare(
              b.timestamp || ''
            )
      );


  if(all.length === 0){

    c.innerHTML = `

      <div class="panel">

        <div class="empty-state">

          <h4>
            Aún no hay datos para graficar
          </h4>

          <p>
            Guarda al menos un registro
            en "Nuevo registro"
            para ver el tablero
            de esta línea.
          </p>

        </div>

      </div>

    `;

    return;

  }


  const rec =

    state.viewingRecordId

      ? all.find(
          r =>
            r.id ===
            state.viewingRecordId
        )

      : all[all.length - 1];


  if(!rec){

    return;

  }


  const d =
    calcDerived(rec);


  c.innerHTML = `

    <div
      class="main-head"
      style="margin-bottom:14px;"
    >

      <div class="sub">

        Mostrando registro del
        ${rec.fecha}

        · día juliano
        ${
          rec.diaJuliano ||
          obtenerDiaDelAño(rec.fecha)
        }

        · semana
        ${
          rec.semana ||
          obtenerSemana(rec.fecha)
        }

        · turno
        ${rec.turno}

        · lote
        <strong>
          ${rec.lote || '—'}
        </strong>

        ${
          state.viewingRecordId

            ? `
              <span class="small-muted">
                (seleccionado desde historial)
              </span>
            `

            : `
              <span class="small-muted">
                (último registro)
              </span>
            `
        }

      </div>

    </div>


    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:0 0 18px 0;">

      <button
        type="button"
        class="btn"
        onclick="exportarExcel()"
      >
        📊 Exportar Excel
      </button>

      <button
        type="button"
        class="btn"
        onclick="exportarPNG()"
      >
        🖼️ Exportar PNG
      </button>

    </div>


    <div class="chart-grid">


      <div class="chart-box">

        <h4>
          OEE y sus componentes
        </h4>

        <div class="gauge-wrap">

          <canvas id="chart-oee">
          </canvas>

          <div class="gauge-num">

            <div class="v">
              ${pct(d.oee)}
            </div>

            <div class="l">
              OEE
            </div>

          </div>

        </div>

      </div>


      <div class="chart-box">

        <h4>
          Producción:
          nominal vs. programada vs. efectiva
        </h4>

        <canvas id="chart-prod">
        </canvas>

      </div>


      <div class="chart-box">

        <h4>
          Paradas (minutos)
        </h4>

        <canvas id="chart-paradas">
        </canvas>

      </div>


      <div class="chart-box">

        <h4>
          Mermas por componente (unidades)
        </h4>

        <canvas id="chart-mermas">
        </canvas>

      </div>


      <div class="chart-box">

        <h4>
          Consumo de insumos
        </h4>

        <canvas id="chart-insumos">
        </canvas>

      </div>


      <div class="chart-box">

        <h4>
          Tendencia de OEE y producción efectiva
        </h4>

        <canvas id="chart-tendencia">
        </canvas>

      </div>


    </div>

  `;


  destroyCharts();


  const F = {

    family:'IBM Plex Sans',

    size:12

  };


  Chart.defaults.font = F;

  Chart.defaults.color =
    '#3A4551';


  state.charts.oee =

    new Chart(

      document.getElementById(
        'chart-oee'
      ),

      {

        type:'doughnut',

        data:{

          labels:[

            'Disponibilidad',

            'Rendimiento',

            'Calidad',

            'Pérdida'

          ],

          datasets:[{

            data:[

              d.disponibilidad,

              d.rendimiento,

              d.calidad,

              Math.max(

                0,

                3 -

                (
                  d.disponibilidad +
                  d.rendimiento +
                  d.calidad
                )

              )

            ],

            backgroundColor:[

              '#2F6690',

              '#F2A93B',

              '#3F8F5F',

              '#E8EAE4'

            ],

            borderWidth:0

          }]

        },

        options:{

          cutout:'68%',

          plugins:{

            legend:{

              position:'bottom',

              labels:{

                boxWidth:10,

                padding:10

              }

            }

          }

        }

      }

    );


  state.charts.prod =

    new Chart(

      document.getElementById(
        'chart-prod'
      ),

      {

        type:'bar',

        data:{

          labels:[

            'Nominal',

            'Programada',

            'Efectiva'

          ],

          datasets:[{

            data:[

              d.produccionNominal,

              num(
                rec.produccion.programada
              ),

              num(
                rec.produccion.efectiva
              )

            ],

            backgroundColor:[

              '#B7C4CC',

              '#F2A93B',

              '#3F8F5F'

            ],

            borderRadius:2

          }]

        },

        options:{

          plugins:{

            legend:{
              display:false
            }

          },

          scales:{

            y:{
              beginAtZero:true
            }

          }

        }

      }

    );


  const pProgMin =

    (rec.paradasProgramadas || []).reduce(

      (a,p) =>
        a + num(p.tiempoMin),

      0

    );


  const pNoProgMin =

    (rec.paradasNoProgramadas || []).reduce(

      (a,p) =>
        a + num(p.tiempoMin),

      0

    );


  state.charts.paradas =

    new Chart(

      document.getElementById(
        'chart-paradas'
      ),

      {

        type:'doughnut',

        data:{

          labels:[

            'Programadas',

            'No programadas'

          ],

          datasets:[{

            data:[

              pProgMin,

              pNoProgMin

            ],

            backgroundColor:[

              '#2F6690',

              '#C4472B'

            ],

            borderWidth:0

          }]

        },

        options:{

          plugins:{

            legend:{

              position:'bottom'

            }

          }

        }

      }

    );


  state.charts.mermas =

    new Chart(

      document.getElementById(
        'chart-mermas'
      ),

      {

        type:'bar',

        data:{

          labels:

            (rec.mermas || []).map(
              m => m.item
            ),

          datasets:[{

            label:'Unidades',

            data:

              (rec.mermas || []).map(

                m =>
                  num(m.unidades)

              ),

            backgroundColor:
              '#C97F14',

            borderRadius:2

          }]

        },

        options:{

          plugins:{

            legend:{
              display:false
            }

          },

          scales:{

            y:{
              beginAtZero:true
            }

          },

          indexAxis:'y'

        }

      }

    );


  state.charts.insumos =

    new Chart(

      document.getElementById(
        'chart-insumos'
      ),

      {

        type:'bar',

        data:{

          labels:[

            'Cajas preformas',

            'Planchas cartón',

            'Polietileno (kg)',

            'Strech film (kg)'

          ],

          datasets:[{

            data:[

              rec.insumos?.cajasPreformas,

              rec.insumos?.planchasCarton,

              rec.insumos?.polietilenoKg,

              rec.insumos?.stretchFilmKg

            ].map(num),

            backgroundColor:
              '#2F6690',

            borderRadius:2

          }]

        },

        options:{

          plugins:{

            legend:{
              display:false
            }

          },

          scales:{

            y:{
              beginAtZero:true
            }

          }

        }

      }

    );


  state.charts.tendencia =

    new Chart(

      document.getElementById(
        'chart-tendencia'
      ),

      {

        type:'line',

        data:{

          labels:

            all.map(
              r => r.fecha
            ),

          datasets:[

            {

              label:'OEE %',

              data:

                all.map(

                  r =>
                    calcDerived(r).oee *
                    100

                ),

              borderColor:
                '#F2A93B',

              backgroundColor:
                '#F2A93B',

              yAxisID:'y',

              tension:0.25

            },

            {

              label:
                'Producción efectiva',

              data:

                all.map(

                  r =>
                    num(
                      r.produccion?.efectiva
                    )

                ),

              borderColor:
                '#2F6690',

              backgroundColor:
                '#2F6690',

              yAxisID:'y1',

              tension:0.25

            }

          ]

        },

        options:{

          scales:{

            y:{

              position:'left',

              min:0,

              max:100,

              title:{

                display:true,

                text:'OEE %'

              }

            },

            y1:{

              position:'right',

              beginAtZero:true,

              grid:{

                drawOnChartArea:false

              },

              title:{

                display:true,

                text:'Botellas'

              }

            }

          }

        }

      }

    );

}


/* =========================================================
   RESUMEN GENERAL
   ========================================================= */

function renderResumen(main){

  main.innerHTML = `

    <div class="main-head">

      <div>

        <h2>
          Resumen general
        </h2>

        <div class="sub">

          Comparativo de OEE entre
          todas las líneas —
          último registro de cada una

        </div>

      </div>

    </div>


    <div
      class="kpi-row"
      id="resumen-kpis"
    ></div>


    <div class="chart-box">

      <h4>
        OEE por línea
      </h4>

      <canvas
        id="chart-resumen"
      ></canvas>

    </div>

  `;


  const all =
    loadRecords();


  const last =

    LINES.map(

      l => {

        const recs =

          all

            .filter(
              r =>
                r.linea === l.key
            )

            .sort(

              (a,b) =>

                (
                  a.timestamp || ''
                ).localeCompare(

                  b.timestamp || ''

                )

            );


        return {

          line:l,

          rec:

            recs.length

              ? recs[recs.length - 1]

              : null

        };

      }

    );


  document.getElementById(
    'resumen-kpis'
  ).innerHTML =

    last.map(

      x => {

        if(!x.rec){

          return `

            <div class="kpi">

              <div class="kpi-label">

                ${x.line.name}

              </div>

              <div
                class="kpi-value small-muted"
                style="font-size:15px;"
              >

                Sin datos

              </div>

            </div>

          `;

        }


        const d =
          calcDerived(x.rec);


        return `

          <div
            class="kpi
            ${statusClass(d.oee)}"
          >

            <div class="kpi-label">

              ${x.line.name}

            </div>


            <div class="kpi-value">

              ${pct(d.oee)}

            </div>

          </div>

        `;

      }

    ).join('');


  destroyCharts();


  state.charts.resumen =

    new Chart(

      document.getElementById(
        'chart-resumen'
      ),

      {

        type:'bar',

        data:{

          labels:

            last.map(
              x => x.line.name
            ),

          datasets:[{

            data:

              last.map(

                x =>

                  x.rec

                    ? calcDerived(
                        x.rec
                      ).oee * 100

                    : 0

              ),

            backgroundColor:
              '#2F6690',

            borderRadius:2

          }]

        },

        options:{

          plugins:{

            legend:{
              display:false
            }

          },

          scales:{

            y:{

              beginAtZero:true,

              max:100,

              title:{

                display:true,

                text:'OEE %'

              }

            }

          }

        }

      }

    );

}


/* =========================================================
   GESTIÓN DE USUARIOS
   ========================================================= */

function openUsersModal(){

  const root =
    document.getElementById(
      'modal-root'
    );


  const users =
    loadUsers();


  root.innerHTML = `

    <div
      class="modal-backdrop"
      onclick="
        if(event.target===this)
          closeModal()
      "
    >

      <div class="modal">

        <div class="modal-head">

          <h3>
            Gestionar usuarios
          </h3>


          <button
            class="modal-close"
            onclick="closeModal()"
          >
            ✕
          </button>

        </div>


        <div class="modal-body">

          <div
            class="userlist"
            id="userlist"
          ></div>


          <div class="section-title">

            Nuevo usuario

          </div>


          <div class="grid grid-2">


            <div class="field-sm">

              <label>
                Nombre completo
              </label>

              <input
                id="nu-nombre"
              >

            </div>


            <div class="field-sm">

              <label>
                Usuario
              </label>

              <input
                id="nu-username"
              >

            </div>


            <div class="field-sm">

              <label>
                Contraseña
              </label>

              <input
                id="nu-password"
                type="text"
              >

            </div>


            <div class="field-sm">

              <label>
                Rol
              </label>


              <select
                id="nu-rol"
                onchange="
                  toggleLineaField()
                "
              >

                <option>
                  supervisor
                </option>

                <option>
                  Jefe de Producción
                </option>

                <option>
                  Administrador
                </option>

              </select>

            </div>


            <div
              class="field-sm"
              id="nu-linea-wrap"
            >

              <label>
                Línea asignada
              </label>


              <select
                id="nu-linea"
              >

                ${

                  LINES.map(

                    l => `

                      <option
                        value="${l.key}"
                      >
                        ${l.name}
                      </option>

                    `

                  ).join('')

                }

              </select>

            </div>


          </div>


          <div class="actions-row">

            <button
              class="btn btn-primary"
              onclick="addUser()"
            >
              Crear usuario
            </button>

          </div>


        </div>

      </div>

    </div>

  `;


  renderUserList();

}


/* =========================================================
   LISTA DE USUARIOS
   ========================================================= */

function renderUserList(){

  const users =
    loadUsers();


  const container =
    document.getElementById(
      'userlist'
    );


  if(!container){

    return;

  }


  container.innerHTML =

    users.map(

      u => `

        <div
          class="userlist-row"
        >

          <div>

            <div
              style="
                font-weight:600;
              "
            >

              ${u.nombre}

            </div>


            <div
              class="small-muted"
            >

              ${u.username}

              ·

              ${u.rol}

              ${
                u.linea

                  ? ' · ' + u.linea

                  : ''
              }

            </div>

          </div>


          ${
            u.username !== 'admin'

              ? `

                <button
                  class="
                    btn
                    btn-danger
                    btn-sm
                  "
                  onclick="
                    removeUser(
                      '${u.username}'
                    )
                  "
                >
                  Eliminar
                </button>

              `

              : ''

          }

        </div>

      `

    ).join('');

}


/* =========================================================
   MOSTRAR / OCULTAR LÍNEA
   ========================================================= */

function toggleLineaField(){

  const wrap =
    document.getElementById(
      'nu-linea-wrap'
    );


  if(!wrap){

    return;

  }


  wrap.style.display =

    document.getElementById(
      'nu-rol'
    ).value === 'Supervisor'

      ? 'block'

      : 'none';

}


/* =========================================================
   AGREGAR USUARIO
   ========================================================= */

function addUser(){

  const nombre =
    document.getElementById(
      'nu-nombre'
    ).value.trim();


  const username =
    document.getElementById(
      'nu-username'
    ).value.trim();


  const password =
    document.getElementById(
      'nu-password'
    ).value;


  const rol =
    document.getElementById(
      'nu-rol'
    ).value;


  const linea =

    rol === 'Supervisor'

      ? document.getElementById(
          'nu-linea'
        ).value

      : null;


  if(
    !nombre ||
    !username ||
    !password
  ){

    alert(
      'Completa nombre, usuario y contraseña.'
    );

    return;

  }


  const users =
    loadUsers();


  if(

    users.some(

      u =>
        u.username.toLowerCase() ===
        username.toLowerCase()

    )

  ){

    alert(
      'Ese usuario ya existe.'
    );

    return;

  }


  users.push({

    nombre,

    username,

    password,

    rol,

    linea

  });


  saveUsers(users);

  renderUserList();


  document.getElementById(
    'nu-nombre'
  ).value = '';


  document.getElementById(
    'nu-username'
  ).value = '';


  document.getElementById(
    'nu-password'
  ).value = '';

}


/* =========================================================
   ELIMINAR USUARIO
   ========================================================= */

function removeUser(
  username
){

  saveUsers(

    loadUsers().filter(

      u =>
        u.username !==
        username

    )

  );


  renderUserList();

}


/* =========================================================
   GESTIÓN DE TRABAJADORES
   (Operarios, Supervisores, Técnicos de Mtto., etc.)
   ========================================================= */

let workerEditId = null;
let workerSearchTerm = '';


function openWorkersModal(){

  const root =
    document.getElementById(
      'modal-root'
    );


  workerEditId = null;
  workerSearchTerm = '';


  root.innerHTML = `

    <div
      class="modal-backdrop"
      onclick="
        if(event.target===this)
          closeModal()
      "
    >

      <div class="modal">

        <div class="modal-head">

          <h3>
            Gestionar trabajadores
          </h3>


          <button
            class="modal-close"
            onclick="closeModal()"
          >
            ✕
          </button>

        </div>


        <div class="modal-body">

          <div class="field-sm">

            <label>
              Buscar
            </label>

            <input
              id="tw-search"
              placeholder="Nombre, cargo o DNI..."
              oninput="filterWorkerList(this.value)"
            >

          </div>


          <div
            class="userlist"
            id="workerlist"
          ></div>


          <div
            class="section-title"
            id="worker-form-title"
          >
            Nuevo trabajador
          </div>


          <div class="grid grid-2">


            <div class="field-sm">

              <label>
                Nombre completo
              </label>

              <input
                id="tw-nombre"
              >

            </div>


            <div class="field-sm">

              <label>
                DNI / N° documento
              </label>

              <input
                id="tw-dni"
              >

            </div>


            <div class="field-sm">

              <label>
                Cargo
              </label>

              <input
                id="tw-cargo"
                list="cargos-trabajador-datalist"
              >

              <datalist id="cargos-trabajador-datalist">

                ${
                  CARGOS_TRABAJADOR.map(

                    c => `
                      <option value="${c}"></option>
                    `

                  ).join('')
                }

              </datalist>

            </div>


            <div class="field-sm">

              <label>
                Línea / área asignada
              </label>

              <select id="tw-linea">

                <option value="">
                  Todas las líneas
                </option>

                ${
                  LINES.map(

                    l => `
                      <option value="${l.key}">
                        ${l.name}
                      </option>
                    `

                  ).join('')
                }

              </select>

            </div>


            <div class="field-sm">

              <label>
                Estado
              </label>

              <select id="tw-estado">

                <option value="Activo">
                  Activo
                </option>

                <option value="Inactivo">
                  Inactivo
                </option>

              </select>

            </div>


          </div>


          <div class="actions-row">

            <button
              class="btn btn-primary"
              id="worker-form-btn"
              onclick="saveWorkerForm()"
            >
              Registrar trabajador
            </button>

            <button
              class="btn btn-ghost btn-sm"
              id="worker-form-cancel"
              onclick="cancelWorkerEdit()"
              style="display:none;"
            >
              Cancelar edición
            </button>

          </div>


        </div>

      </div>

    </div>

  `;


  renderWorkerList();

}


/* =========================================================
   LISTA DE TRABAJADORES (con filtro de búsqueda)
   ========================================================= */

function filterWorkerList(term){

  workerSearchTerm = term;

  renderWorkerList();

}


function renderWorkerList(){

  const container =
    document.getElementById(
      'workerlist'
    );

  if(!container){
    return;
  }


  const term =
    normalizarTexto(
      (workerSearchTerm || '').trim()
    );


  const workers =
    loadWorkers().filter(

      w => {

        if(!term){
          return true;
        }

        return (
          normalizarTexto(w.nombre || '').includes(term) ||
          normalizarTexto(w.cargo || '').includes(term) ||
          normalizarTexto(w.dni || '').includes(term)
        );

      }

    );


  if(!workers.length){

    container.innerHTML = `
      <div class="small-muted" style="padding:10px 0;">
        No hay trabajadores registrados.
      </div>
    `;

    return;

  }


  container.innerHTML =

    workers.map(

      w => {

        const lineaInfo =
          LINES.find(l => l.key === w.linea);

        const lineaNombre =
          w.linea
            ? (lineaInfo ? lineaInfo.name : w.linea)
            : 'Todas las líneas';

        return `

          <div class="userlist-row">

            <div>

              <div style="font-weight:600;">

                ${w.nombre}

                ${
                  w.estado === 'Inactivo'
                    ? ' · <span style="color:var(--danger);">Inactivo</span>'
                    : ''
                }

              </div>


              <div class="small-muted">

                ${w.cargo || 'Sin cargo'}
                ·
                ${lineaNombre}
                ${w.dni ? ' · DNI ' + w.dni : ''}

              </div>

            </div>


            <div style="display:flex; gap:6px;">

              <button
                class="btn btn-ghost btn-sm"
                onclick="startEditWorker('${w.id}')"
              >
                Editar
              </button>

              <button
                class="btn btn-danger btn-sm"
                onclick="removeWorker('${w.id}')"
              >
                Eliminar
              </button>

            </div>

          </div>

        `;

      }

    ).join('');

}


/* =========================================================
   CREAR / ACTUALIZAR TRABAJADOR
   ========================================================= */

function saveWorkerForm(){

  const nombre =
    document.getElementById('tw-nombre').value.trim();

  const dni =
    document.getElementById('tw-dni').value.trim();

  const cargo =
    document.getElementById('tw-cargo').value.trim();

  const linea =
    document.getElementById('tw-linea').value;

  const estado =
    document.getElementById('tw-estado').value;


  if(!nombre){

    alert(
      'Ingresa el nombre y apellido del trabajador.'
    );

    return;

  }


  const workers =
    loadWorkers();


  if(workerEditId){

    const idx =
      workers.findIndex(w => w.id === workerEditId);

    if(idx > -1){

      workers[idx] = {
        ...workers[idx],
        nombre,
        dni,
        cargo,
        linea,
        estado
      };

    }

  } else {

    const nombreNormalizado =
      normalizarTexto(nombre);

    if(
      workers.some(
        w => normalizarTexto(w.nombre) === nombreNormalizado
      )
    ){

      alert(
        'Ya existe un trabajador registrado con ese nombre.'
      );

      return;

    }


    workers.push({

      id:
        'w_' + Date.now() + '_' +
        Math.random().toString(36).slice(2,8),

      nombre,
      dni,
      cargo,
      linea,
      estado: estado || 'Activo'

    });

  }


  saveWorkers(workers);

  cancelWorkerEdit();

  renderWorkerList();

}


/* =========================================================
   EDITAR TRABAJADOR
   ========================================================= */

function startEditWorker(id){

  const worker =
    loadWorkers().find(w => w.id === id);

  if(!worker){
    return;
  }


  workerEditId = id;


  document.getElementById('tw-nombre').value = worker.nombre || '';
  document.getElementById('tw-dni').value = worker.dni || '';
  document.getElementById('tw-cargo').value = worker.cargo || '';
  document.getElementById('tw-linea').value = worker.linea || '';
  document.getElementById('tw-estado').value = worker.estado || 'Activo';


  document.getElementById('worker-form-title').textContent =
    'Editando: ' + worker.nombre;

  document.getElementById('worker-form-btn').textContent =
    'Guardar cambios';

  document.getElementById('worker-form-cancel').style.display =
    'inline-flex';

}


function cancelWorkerEdit(){

  workerEditId = null;


  const nombreField = document.getElementById('tw-nombre');

  if(!nombreField){
    return;
  }


  nombreField.value = '';
  document.getElementById('tw-dni').value = '';
  document.getElementById('tw-cargo').value = '';
  document.getElementById('tw-linea').value = '';
  document.getElementById('tw-estado').value = 'Activo';


  document.getElementById('worker-form-title').textContent =
    'Nuevo trabajador';

  document.getElementById('worker-form-btn').textContent =
    'Registrar trabajador';

  document.getElementById('worker-form-cancel').style.display =
    'none';

}


/* =========================================================
   ELIMINAR TRABAJADOR
   ========================================================= */

function removeWorker(id){

  if(
    !confirm(
      '¿Eliminar este trabajador de la base de datos?'
    )
  ){

    return;

  }


  saveWorkers(

    loadWorkers().filter(
      w => w.id !== id
    )

  );


  if(workerEditId === id){

    cancelWorkerEdit();

  }


  renderWorkerList();

}


/* =========================================================
   CERRAR MODAL
   ========================================================= */

function closeModal(){

  document.getElementById(
    'modal-root'
  ).innerHTML = '';

}


/* =========================================================
   INICIALIZACIÓN
   ========================================================= */

initRealtimeSync();

tryResumeSession();