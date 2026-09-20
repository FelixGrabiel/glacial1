/* =============================================================
   ESTADO DE LA APP, ALMACENAMIENTO LOCAL/FIRESTORE Y PERMISOS
   Parte del sistema GLACIAL — dividido a partir de app.js
   ============================================================= */


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
let _rotacionesCache = [];

let _usersReady = false;
let _recordsReady = false;
let _workersReady = false;
let _rotacionesReady = false;


/* =========================================================
   PUESTOS Y PERMISOS DE USUARIOS
   ========================================================= */
const PERMISOS_APP=[
  {key:'nuevo',label:'Nuevo registro'},
  {key:'historial',label:'Historial'},
  {key:'graficos',label:'Gráficos'},
  {key:'resumen',label:'Resumen / Reportes'},
  {key:'trabajadores',label:'Trabajadores'},
  {key:'usuarios',label:'Usuarios'},
  {key:'exportarExcel',label:'Exportar Excel'},
  {key:'exportarExcelGeneral',label:'Exportar Excel general de planta'},
  {key:'exportarJPG',label:'Exportar JPG'},
  {key:'todasLasLineas',label:'Todas las líneas'},
  {key:'eliminarRegistros',label:'Eliminar registros'},
  {key:'configuracion',label:'Configuración'},
  {key:'administracion',label:'Administración'},
  {key:'Gestionar de usuarios',label:'Gestión de usuarios'},
];

function permisosPorRolAnterior(rol){
  if(rol==='Administrador'||rol==='Jefe de Producción') return 'todos';
  if(rol==='Supervisor') return ['nuevo','historial','graficos','trabajadores'];
  return ['nuevo','historial','graficos'];
}

function normalizarPermisosUsuario(u){
  if(!u) return [];
  if(u.permisos==='todos') return 'todos';
  if(Array.isArray(u.permisos)) return u.permisos;
  return permisosPorRolAnterior(u.rol);
}

function tienePermiso(permiso){
  if(!state.user) return false;
  const p=normalizarPermisosUsuario(state.user);
  return p==='todos'||p.includes(permiso);
}

function escaparHtml(v){
  return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function cambiarTodosLosPermisos(checked){
  document.querySelectorAll('.permiso-check').forEach(c=>c.checked=checked);
}

function actualizarEstadoTodosLosPermisos(){
  const checks=Array.from(document.querySelectorAll('.permiso-check'));
  const master=document.getElementById('nu-permisos-todos');
  if(master&&checks.length) master.checked=checks.every(c=>c.checked);
}

function usuariosPorDefecto(){
  return [
    {
      username:'admin',password:'admin123',rol:'Administrador',
      puesto:'Administrador',permisos:'todos',linea:null,
      nombre:'Administrador del Sistema'
    },
    {
      username:'jefe',password:'jefe123',rol:'Jefe de Producción',
      puesto:'Jefe de Producción',permisos:'todos',linea:null,
      nombre:'Jefe de Producción'
    },
    {
      username:'supervisor',password:'supervisor123',rol:'Supervisor',
      puesto:'Supervisor',
      permisos:['nuevo','historial','graficos','trabajadores'],
      linea:null,nombre:'Supervisor'
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


  /*
     ROTACIÓN SEMANAL (TAREO)

     Se sincroniza igual que usuarios/reportes/trabajadores:
     un solo documento en Firestore con un campo "items" que
     contiene el arreglo completo de rotaciones cargadas
     (cada una con su semana y su lista de personal, tal
     como viene del Excel). Así la rotación queda visible
     en tiempo real en cualquier computadora, sin depender
     de guardarse solo en este navegador.
  */

  db.collection('sync').doc('rotaciones')

    .onSnapshot(

      snap => {

        _rotacionesCache =
          (snap.exists && snap.data().items)
            ? snap.data().items
            : [];

        _rotacionesReady = true;

        onRotacionesUpdated();

      },

      err => {

        console.error(
          'Error de sincronización (rotación semanal):', err
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


function onRotacionesUpdated(){

  /*
     Si la persona tiene abierta la pantalla de "Rotación
     semanal" del Tareo (identificada por el contenedor de
     la vista previa de importación), se refresca la lista
     de rotaciones para reflejar lo que se acaba de cargar
     desde esta u otra computadora.
  */

  if(
    document.getElementById('tareo-rotacion-preview') &&
    typeof renderRotacionSemanal === 'function'
  ){

    renderRotacionSemanal();

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

  return db.collection('sync').doc('records').set({
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


/* =========================================================
   ROTACIÓN SEMANAL (TAREO)
   ========================================================= */

function loadRotaciones(){

  return _rotacionesCache;

}


function saveRotaciones(r){

  _rotacionesCache = r;

  db.collection('sync').doc('rotaciones').set({
    items: r,
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
