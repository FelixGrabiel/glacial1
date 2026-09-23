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
let _tareosCache = [];
let _preciosCache = {};
let _paletasCache = [];
let _programacionesCache = [];

let _usersReady = false;
let _recordsReady = false;
let _workersReady = false;
let _rotacionesReady = false;
let _tareosReady = false;
let _preciosReady = false;
let _paletasReady = false;
let _programacionesReady = false;


/*
   AVISO DE ERROR AL GUARDAR EN FIRESTORE
   =========================================================

   Antes, si Firestore rechazaba una escritura (por ejemplo,
   por permisos), el error solo quedaba en la consola del
   navegador (F12) y la persona veía el mensaje de "guardado
   con éxito" igual, porque el caché local sí se actualiza
   al instante. Eso hacía that un registro pareciera guardado
   en la computadora que lo creó, pero nunca llegara a existir
   de verdad en la nube — y por lo tanto no apareciera en
   ninguna otra computadora o celular, ni sobreviviera a un
   refresco de página.

   Esta función se usa en TODOS los save*() de abajo para que,
   si Firestore rechaza el guardado, la persona se entere en
   el momento (con una alerta clara) en vez de que el dato
   "desaparezca" silenciosamente más tarde.
*/

function _avisarErrorGuardado(nombreDato, error){

  console.error(
    'Error guardando "' + nombreDato + '" en Firestore:',
    error
  );

  alert(
    'No se pudo guardar "' + nombreDato + '" en la nube.\n\n' +
    'Motivo: ' + (error && error.message ? error.message : error) + '\n\n' +
    'Es probable que falte permiso en las reglas de Firestore ' +
    '(revisa 01-config.js) o que no haya conexión a internet.\n\n' +
    'Lo que acabas de hacer solo quedó guardado en ESTA computadora ' +
    'y se perderá si recargas la página o la abres desde otro equipo.'
  );

}


/* =========================================================
   PUESTOS Y PERMISOS DE USUARIOS
   ========================================================= */
const PERMISOS_APP=[
  {key:'nuevo',label:'Nuevo registro'},
  {key:'historial',label:'Historial'},
  {key:'graficos',label:'Gráficos'},
  {key:'resumen',label:'Resumen / Reportes'},
  {key:'perdidasSoles',label:'Impacto Económico (paradas no programadas)'},
  {key:'paletas',label:'Paletas (registro en tiempo real)'},
  {key:'produccionActual',label:'Producción Actual (ver paletas de TODAS las líneas — Ventas)'},
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
  if(rol==='Supervisor') return ['nuevo','historial','graficos','paletas','trabajadores'];
  return ['nuevo','historial','graficos','paletas'];
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
      permisos:['nuevo','historial','graficos','paletas','trabajadores'],
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


  /*
     TAREOS (ASISTENCIA DIARIA DE PERSONAL)

     Antes, cada tareo creado se guardaba SOLO con
     localStorage.setItem(...) (13-tareo.js), es decir,
     únicamente en el navegador de la computadora donde se
     creó. Por eso al abrir el sistema desde otra PC o
     celular el tareo "desaparecía": nunca había viajado a
     Firestore, así que no había forma de que otro equipo lo
     viera.

     Se sincroniza ahora exactamente igual que usuarios,
     reportes, trabajadores y rotación semanal: un solo
     documento en Firestore con un campo "items" con el
     arreglo completo de tareos.
  */

  db.collection('sync').doc('tareos')

    .onSnapshot(

      snap => {

        _tareosCache =
          (snap.exists && snap.data().items)
            ? snap.data().items
            : [];

        _tareosReady = true;

        onTareosUpdated();

      },

      err => {

        console.error(
          'Error de sincronización (tareos):', err
        );

      }

    );


  /*
     PRECIOS UNITARIOS POR LÍNEA (PARA "IMPACTO ECONÓMICO")

     Un solo documento en Firestore con el precio (S/.) por
     unidad de cada línea, editable por un Administrador desde
     la pestaña "Impacto Económico" (15-perdidas-soles.js). Si el
     documento todavía no existe, se siembra con los valores
     iniciales de PRECIOS_UNITARIOS_DEFAULT (01-config.js).
  */

  db.collection('sync').doc('precios')

    .onSnapshot(

      snap => {

        if(snap.exists && snap.data().items){

          _preciosCache = snap.data().items;

        } else {

          _preciosCache = { ...PRECIOS_UNITARIOS_DEFAULT };

          db.collection('sync').doc('precios').set({
            items: _preciosCache,
            updatedAt: Date.now()
          });

        }

        _preciosReady = true;

        onPreciosUpdated();

      },

      err => {

        console.error(
          'Error de sincronización (precios):', err
        );

      }

    );


  /*
     PALETAS (REGISTRO EN TIEMPO REAL DE PALETAS PRODUCIDAS)

     Un solo documento en Firestore con el arreglo completo de
     registros de paletas (cada uno: línea, fecha, turno, marca,
     presentación, hora, cantidad de paletas y unidades, usuario
     y observaciones — ver 16-paletas.js). Se sincroniza igual
     que el resto: en cuanto un supervisor guarda "+N paletas"
     desde una computadora o celular, aparece de inmediato en
     cualquier otro equipo conectado (incluyendo, a futuro, una
     vista de solo lectura para Ventas).
  */

  db.collection('sync').doc('paletas')

    .onSnapshot(

      snap => {

        _paletasCache =
          (snap.exists && snap.data().items)
            ? snap.data().items
            : [];

        _paletasReady = true;

        onPaletasUpdated();

      },

      err => {

        console.error(
          'Error de sincronización (paletas):', err
        );

      }

    );


  /*
     PROGRAMACIÓN DE PALETAS POR TURNO (CANTIDAD PROGRAMADA)

     Un solo documento en Firestore con el arreglo completo de
     "cuánto se debe producir" por cada combinación de línea +
     fecha + turno + marca + presentación (ver 16-paletas.js).

     Es un documento APARTE de 'paletas': mientras 'paletas' es
     un historial que se acumula (cada +N queda como un registro
     nuevo), aquí cada combinación tiene UNA sola cantidad
     programada, que se reemplaza (no se duplica) cada vez que
     el supervisor la actualiza, y contra la cual se compara la
     suma de los registros de 'paletas' de esa misma combinación.
  */

  db.collection('sync').doc('programaciones')

    .onSnapshot(

      snap => {

        _programacionesCache =
          (snap.exists && snap.data().items)
            ? snap.data().items
            : [];

        _programacionesReady = true;

        onProgramacionesUpdated();

      },

      err => {

        console.error(
          'Error de sincronización (programación de paletas):', err
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


function onTareosUpdated(){

  /*
     Si la persona tiene abierta la lista principal de Tareo
     o el Historial de Tareo (identificadas por el id que
     lleva su contenedor), se refresca para mostrar los
     tareos tal como quedaron en Firestore — incluyendo los
     creados desde otra computadora o celular.
  */

  if(
    document.getElementById('tareo-principal-view') &&
    typeof renderTareoPrincipal === 'function'
  ){

    renderTareoPrincipal();

  }

  if(
    document.getElementById('tareo-historial-view') &&
    typeof renderHistorialTareo === 'function'
  ){

    renderHistorialTareo();

  }

}


function onPreciosUpdated(){

  /*
     Si la persona tiene abierta la pestaña "Impacto Económico"
     se refresca para reflejar el precio recién guardado —
     desde esta u otra computadora.

     ANTES esto se decidía buscando el contenedor
     'perdidas-soles-view' en el DOM, pero ese id solo existe
     DESPUÉS de que la vista ya se dibujó con datos completos.
     Si _preciosReady se volvía true mientras la vista todavía
     mostraba "Cargando datos..." (sin ese id todavía), este
     chequeo fallaba y la pantalla se quedaba cargando para
     siempre. Ahora se decide por state.currentTab, igual que
     onRecordsUpdated/onTareosUpdated, así el refresco ocurre
     sin importar qué se esté mostrando en ese momento.
  */

  if(
    state.user &&
    state.currentTab === 'perdidas' &&
    typeof renderPerdidasSoles === 'function'
  ){

    renderPerdidasSoles(
      document.getElementById('main')
    );

  }

}


function onPaletasUpdated(){

  /*
     A diferencia de onRecordsUpdated (que vuelve a dibujar
     toda la pestaña), aquí NO se llama a renderMain()/
     renderPaletasTab(): eso reconstruiría también el
     formulario y le haría perder el foco a quien esté
     escribiendo una cantidad en ese momento.

     En su lugar, se delega a actualizarVistaPaletas()
     (16-paletas.js), que solo reemplaza el bloque de
     resultados (KPIs + agrupado + tabla) si la pestaña
     Paletas está abierta ahora mismo.
  */

  if(
    state.user &&
    state.currentTab === 'paletas' &&
    typeof actualizarVistaPaletas === 'function'
  ){

    actualizarVistaPaletas();

  }

  /*
     "Producción Actual" (Ventas) no tiene ningún campo de
     tipeo libre que se pueda interrumpir — solo fecha/turno
     por select — así que ahí sí se puede volver a dibujar la
     pestaña completa cada vez que llega un cambio.
  */

  if(
    state.user &&
    state.currentTab === 'produccion-actual' &&
    typeof renderProduccionActualTab === 'function'
  ){

    renderProduccionActualTab();

  }

}


function onProgramacionesUpdated(){

  /*
     Igual que onPaletasUpdated: NO se reconstruye todo el
     formulario (eso le haría perder el foco a quien esté
     escribiendo). Solo se refresca el bloque de resultados
     (que incluye programado/producido/pendiente/cumplimiento)
     si la pestaña Paletas está abierta ahora mismo — así una
     programación cargada desde otra computadora se refleja de
     inmediato en la vista de "Producción del turno".
  */

  if(
    state.user &&
    state.currentTab === 'paletas' &&
    typeof actualizarVistaPaletas === 'function'
  ){

    actualizarVistaPaletas();

  }

  if(
    state.user &&
    state.currentTab === 'produccion-actual' &&
    typeof renderProduccionActualTab === 'function'
  ){

    renderProduccionActualTab();

  }

}


function onRecordsUpdated(){

  if(!state.user){
    return;
  }

  /*
     Solo se refresca si la persona está viendo resumen,
     historial, gráficos o Impacto Económico — así no se
     interrumpe a nadie que esté llenando un registro nuevo.

     'perdidas' (Impacto Económico) se agrega aquí porque esa
     vista también depende de _recordsReady: si el usuario la
     abre antes de que lleguen los reportes desde Firestore,
     necesita este refresco para salir de "Cargando datos...".
  */

  if(
    state.currentTab === 'resumen' ||
    state.currentTab === 'historial' ||
    state.currentTab === 'graficos' ||
    state.currentTab === 'perdidas'
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
  }).catch(err => _avisarErrorGuardado('usuarios', err));

}


function loadRecords(){

  return _recordsCache;

}


function saveRecords(r){
  _recordsCache = r;

  return db.collection('sync').doc('records').set({
    items: r,
    updatedAt: Date.now()
  }).catch(err => _avisarErrorGuardado('reportes', err));
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
  }).catch(err => _avisarErrorGuardado('trabajadores', err));

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
  }).catch(err => _avisarErrorGuardado('rotación semanal', err));

}


/* =========================================================
   TAREOS (ASISTENCIA DIARIA DE PERSONAL)
   ========================================================= */

function loadTareos(){

  return _tareosCache;

}


function saveTareos(t){

  _tareosCache = t;

  db.collection('sync').doc('tareos').set({
    items: t,
    updatedAt: Date.now()
  }).catch(err => _avisarErrorGuardado('tareo', err));

}


/* =========================================================
   PRECIOS UNITARIOS POR LÍNEA (IMPACTO ECONÓMICO)
   ========================================================= */

function loadPrecios(){

  return Object.keys(_preciosCache).length
    ? _preciosCache
    : { ...PRECIOS_UNITARIOS_DEFAULT };

}


function savePrecios(p){

  _preciosCache = p;

  db.collection('sync').doc('precios').set({
    items: p,
    updatedAt: Date.now()
  }).catch(err => _avisarErrorGuardado('precios por línea', err));

}


/*
   Precio a usar para una línea: el que haya guardado el
   Administrador, o si todavía no lo tocó, el valor inicial
   de PRECIOS_UNITARIOS_DEFAULT (01-config.js).
*/

function precioUnitarioLinea(lineKey){

  const precios = loadPrecios();

  return num(
    precios[lineKey] ??
    PRECIOS_UNITARIOS_DEFAULT[lineKey] ??
    0
  );

}


/* =========================================================
   PALETAS (REGISTRO EN TIEMPO REAL DE PALETAS PRODUCIDAS)
   ========================================================= */

function loadPaletas(){

  return _paletasCache;

}


function savePaletas(p){

  _paletasCache = p;

  return db.collection('sync').doc('paletas').set({
    items: p,
    updatedAt: Date.now()
  }).catch(err => _avisarErrorGuardado('paletas', err));

}


/* =========================================================
   PROGRAMACIÓN DE PALETAS POR TURNO (CANTIDAD PROGRAMADA)
   ========================================================= */

function loadProgramaciones(){

  return _programacionesCache;

}


function saveProgramaciones(p){

  _programacionesCache = p;

  return db.collection('sync').doc('programaciones').set({
    items: p,
    updatedAt: Date.now()
  }).catch(err => _avisarErrorGuardado('programación de paletas', err));

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