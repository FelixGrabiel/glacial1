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
let _rotacionesMantenimientoCache = [];
let _rotacionMaquinistasCache = [];
let _tareosCache = [];
let _preciosCache = {};
let _paletasCache = [];
let _programacionesCache = [];

let _usersReady = false;
let _recordsReady = false;
let _workersReady = false;
let _rotacionesReady = false;
let _rotacionesMantenimientoReady = false;
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
  {key:'nuevo',area:'produccion',label:'Nuevo registro'},
  {key:'historial',area:'produccion',label:'Historial'},
  {key:'graficos',area:'visualizacion',label:'Gráficos'},
  {key:'resumen',area:'visualizacion',label:'Resumen / Reportes'},
  {key:'perdidasSoles',area:'visualizacion',label:'Impacto Económico (paradas no programadas)'},
  {key:'paletas',area:'produccion',label:'Paletas (registro en tiempo real)'},
  {key:'programarPaletas',area:'produccion',label:'Programar producción / Secuencia del turno'},
  {key:'gestionar_rotacion_supervisores',area:'produccion',label:'Gestionar rotación de supervisores'},
  {key:'gestionar_rotacion_mantenimiento',area:'mantenimiento',label:'Gestionar rotación de Mantenimiento y de maquinistas (Rotación semanal MTTO / Rotación maquinista)'},
  {key:'produccionActual',area:'produccion',label:'Producción Actual (ver paletas de TODAS las líneas — Ventas)'},
  {key:'inicioOperativo',area:'visualizacion',label:'Ver Inicio Operativo / Mi turno'},
  {key:'ver_inicio_ejecutivo',area:'visualizacion',label:'Ver Inicio Ejecutivo (resumen corto de planta — Gerencia / Jefatura)'},
  {key:'ver_programacion_turno',area:'visualizacion',label:'Inicio Operativo: ver Programación del turno'},
  {key:'ver_insumos_turno',area:'visualizacion',label:'Inicio Operativo: ver Insumos del turno'},
  {key:'avanceProduccion',area:'produccion',label:'Avance y Cierre de Turno'},
  {key:'control_operativo_lineas',area:'mantenimiento',label:'Control operativo de líneas (Detener / Reanudar / Intervención terminada)'},
  {key:'recibirAlertasProduccion',area:'visualizacion',label:'Recibir notificaciones y alertas de producción'},
  {key:'gestionarPersonal',area:'administracion',label:'Gestionar usuarios y trabajadores (Administración / Supervisores)'},
  {key:'verLineasProduccion',area:'produccion',label:'Ver líneas de producción en el menú lateral'},
  {key:'tareoProduccion',area:'tareo',label:'GESTIONAR Tareo de Producción (registrar, editar, validar)'},
  {key:'ver_tareo_produccion',area:'tareo',label:'VER Tareo de Producción (solo visualización)'},
  {key:'tareoGeneral',area:'tareo',label:'Tareo General (solo lectura — RRHH, ambas áreas)'},
  {key:'moduloMantenimiento',area:'mantenimiento',label:'Módulo de Mantenimiento (Tareo y demás secciones del área — gestiona)'},
  {key:'gestionar_tareo_mantenimiento',area:'mantenimiento',label:'GESTIONAR Tareo de Mantenimiento (registrar, editar, validar)'},
  {key:'ver_tareo_mantenimiento',area:'mantenimiento',label:'VER Tareo de Mantenimiento (solo visualización)'},
  {key:'ver_bitacora_mantenimiento',area:'mantenimiento',label:'VER Bitácora de Mantenimiento y Análisis de paradas (solo lectura)'},
  {key:'completar_motivo_parada',area:'mantenimiento',label:'Completar el motivo de paradas pendientes (necesita ver la bitácora)'},
  {key:'editar_salida_maquinistas',area:'mantenimiento',label:'Editar SOLO la hora de salida de maquinistas (con motivo; no cambia asistencia ni refrigerio)'},
  {key:'moduloRRHH',area:'rrhh',label:'Módulo de RRHH (Tareo, Tareo General, Historial y Resumen mensual — con edición y eliminación)'},
  {key:'exportarExcel',area:'visualizacion',label:'Exportar Excel'},
  {key:'exportarExcelGeneral',area:'visualizacion',label:'Exportar Excel general de planta'},
  {key:'exportarJPG',area:'visualizacion',label:'Exportar JPG'},
  {key:'todasLasLineas',area:'produccion',label:'Todas las líneas'},
  {key:'eliminarRegistros',area:'produccion',label:'Eliminar registros'},
  {key:'reabrirReporteProduccion',area:'produccion',label:'Reabrir reportes de producción finalizados'},
  {key:'reabrirProduccion',area:'produccion',label:'Reabrir producción finalizada'},
  {key:'configurar_umbrales',area:'administracion',label:'Configurar umbrales de avisos, metas de disponibilidad y velocidades estándar'},
  {key:'configuracion',area:'administracion',label:'Configuración'},
  {key:'administracion',area:'administracion',label:'Administración'},
  {key:'moduloAlmacen',area:'almacen',label:'Módulo de Almacén (próximamente)'},
];

/* Áreas del catálogo (el orden es el de la pantalla de usuarios). */
const AREAS_PERMISOS=[
  {clave:'produccion',titulo:'Producción'},
  {clave:'tareo',titulo:'Tareo de Producción y general'},
  {clave:'mantenimiento',titulo:'Mantenimiento'},
  {clave:'rrhh',titulo:'Recursos Humanos (RRHH)'},
  {clave:'visualizacion',titulo:'Visualización, reportes y exportación'},
  {clave:'administracion',titulo:'Administración y configuración'},
  {clave:'almacen',titulo:'Almacén'}
];

/* Lista de permisos agrupada por área, con el mismo marcado de siempre (checkbox + etiqueta).
   o.clase: clase de cada casilla · o.onchange: manejador existente · o.seleccionados: claves marcadas
   o.deshabilitado: bloquear (administrador principal). Cada área tiene un botón «marcar toda el área». */
function htmlPermisosPorArea(o){
  const op=Object.assign({clase:'permiso-check',onchange:'',seleccionados:[],deshabilitado:false},o||{});
  return AREAS_PERMISOS.map(a=>{
    const lista=PERMISOS_APP.filter(p=>p.area===a.clave);
    if(!lista.length)return '';
    return '<div style="grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:8px;'+
      'margin-top:10px;padding:6px 0 4px;border-bottom:1px solid #d5dee6;">'+
      '<strong style="font-size:13px;color:#10265f;letter-spacing:.03em;">'+a.titulo.toUpperCase()+'</strong>'+
      (op.deshabilitado?'':'<button type="button" class="btn btn-ghost btn-sm" data-perm-area-btn="'+a.clave+'" '+
        'onclick="marcarAreaPermisos(\''+a.clave+'\',\''+op.clase+'\')">Marcar / quitar toda el área</button>')+'</div>'+
      lista.map(p=>'<label style="display:flex;align-items:center;gap:8px;cursor:'+(op.deshabilitado?'not-allowed':'pointer')+';font-size:13px;">'+
        '<input type="checkbox" class="'+op.clase+'" value="'+p.key+'" data-area="'+a.clave+'"'+
        (op.seleccionados.includes(p.key)?' checked':'')+(op.deshabilitado?' disabled':'')+
        (op.onchange?' onchange="'+op.onchange+'"':'')+'>'+p.label+'</label>').join('');
  }).join('');
}

/* Marca o quita todas las casillas de un área y avisa a los manejadores existentes. */
function marcarAreaPermisos(area,clase){
  const cajas=Array.from(document.querySelectorAll('input.'+clase+'[data-area="'+area+'"]')).filter(c=>!c.disabled);
  if(!cajas.length)return;
  const marcar=cajas.some(c=>!c.checked);
  cajas.forEach(c=>{c.checked=marcar;});
  cajas[cajas.length-1].dispatchEvent(new Event('change',{bubbles:true}));
}

const ROLES_SOLO_CONSULTA = new Set([
  'Jefe de Producción','Jefe de Operaciones','Jefatura','Gerente General','Gerente'
]);
const PERMISOS_SOLO_CONSULTA = [
  'produccionActual','ver_inicio_ejecutivo','resumen','perdidasSoles',
  'moduloMantenimiento','moduloRRHH','ver_tareo_produccion','ver_tareo_mantenimiento',
  'exportarExcel','exportarExcelGeneral','exportarJPG'
];

function esUsuarioSoloConsulta(usuario){
  return !!usuario && ROLES_SOLO_CONSULTA.has(String(usuario.rol||'').trim());
}


/* =========================================================
   GESTIÓN DE TURNO DEL SUPERVISOR
   La configuración vive en el usuario (sync/users), no fija
   en el código. Compatible con usuarios antiguos sin horario.
   ========================================================= */

function minutosHoraTurno(valor){
  const m=String(valor||'').match(/^(\d{1,2}):(\d{2})$/);
  if(!m) return null;
  const h=Number(m[1]), min=Number(m[2]);
  if(h<0 || h>23 || min<0 || min>59) return null;
  return h*60+min;
}

function clasificarTurnoPorHorario(inicio,fin){
  const a=minutosHoraTurno(inicio);
  const b=minutosHoraTurno(fin);
  if(a===null || b===null) return '';
  if(b<=a || a>=20*60) return 'NOCHE';
  if(a>=12*60) return 'INTERMEDIO';
  return 'DÍA';
}

function fechaLocalISO(fecha=new Date()){
  return [
    fecha.getFullYear(),
    String(fecha.getMonth()+1).padStart(2,'0'),
    String(fecha.getDate()).padStart(2,'0')
  ].join('-');
}

function contextoTurnoUsuario(usuario=state.user, ahora=new Date()){
  if(!usuario) return null;

  /*
     Para Supervisores, la fuente oficial es la ROTACIÓN SEMANAL
     PUBLICADA. El horario permanente del usuario deja de decidir
     su turno operativo.
  */
  if(
    String(usuario.rol||'')==='Supervisor' &&
    typeof resolverContextoRotacionSupervisor==='function'
  ){
    const rotacion=resolverContextoRotacionSupervisor(usuario,ahora);
    if(rotacion) return rotacion;

    if(typeof _rotacionesReady!=='undefined' && _rotacionesReady){
      return {
        turno:'',
        horarioInicio:'',
        horarioFin:'',
        fechaOperativa:fechaLocalISO(ahora),
        estado:'SIN_ROTACION',
        automatico:true,
        origen:'ROTACION_SEMANAL'
      };
    }
  }

  // Compatibilidad para usuarios no Supervisor y durante la carga inicial.
  const inicio=String(usuario.horarioInicio||'').trim();
  const fin=String(usuario.horarioFin||'').trim();
  const turnoConfigurado=String(usuario.turnoSupervisor||'').trim();
  const turno=turnoConfigurado || clasificarTurnoPorHorario(inicio,fin);

  if(!turno){
    return {
      turno:'',
      horarioInicio:inicio,
      horarioFin:fin,
      fechaOperativa:fechaLocalISO(ahora),
      estado:'SIN_CONFIGURAR',
      automatico:false
    };
  }

  let fechaOperativa=fechaLocalISO(ahora);
  const ini=minutosHoraTurno(inicio);
  const finMin=minutosHoraTurno(fin);
  const actual=ahora.getHours()*60+ahora.getMinutes();

  if(turno==='NOCHE' && ini!==null && finMin!==null && finMin<=ini && actual<finMin){
    const anterior=new Date(ahora);
    anterior.setDate(anterior.getDate()-1);
    fechaOperativa=fechaLocalISO(anterior);
  }

  let activo=true;
  if(ini!==null && finMin!==null){
    activo=finMin>ini
      ? actual>=ini && actual<finMin
      : actual>=ini || actual<finMin;
  }

  return {
    turno,
    horarioInicio:inicio,
    horarioFin:fin,
    fechaOperativa,
    estado:activo?'ACTIVO':'FUERA_DE_HORARIO',
    automatico:true,
    origen:'USUARIO_LEGACY'
  };
}

function turnoAutomaticoUsuario(usuario=state.user){
  return contextoTurnoUsuario(usuario)?.turno || '';
}

function puedeGestionarPersonal(){
  return !!state.user &&
    ['Administrador','Supervisor'].includes(state.user.rol) &&
    tienePermiso('gestionarPersonal');
}

function permisosPorRolAnterior(rol){
  if(rol==='Administrador') return 'todos';
  if(ROLES_SOLO_CONSULTA.has(rol)) return [...PERMISOS_SOLO_CONSULTA];
  if(rol==='Supervisor') return ['inicioOperativo','verLineasProduccion','nuevo','historial','graficos','paletas','programarPaletas','avanceProduccion','tareoProduccion','exportarExcel','exportarJPG'];
  return ['nuevo','historial','graficos','paletas'];
}

function normalizarPermisosUsuario(u){
  if(!u) return [];

  // ADMINISTRADOR: acceso total siempre.
  // El rol prevalece sobre cualquier arreglo de permisos guardado en Firestore.
  if(String(u.rol||'').trim()==='Administrador'){
    return 'todos';
  }

  // Los cargos de solo consulta conservan el bloqueo de edición, pero
  // respetan en tiempo real los permisos de VISUALIZACIÓN asignados por
  // Administración. Así Historial/Gráficos pueden activarse o retirarse
  // sin convertir al usuario en un perfil operativo.
  if(esUsuarioSoloConsulta(u)){
    const asignados = Array.isArray(u.permisos)
      ? u.permisos
      : [...PERMISOS_SOLO_CONSULTA];

    const permitidosSoloConsulta = new Set([
      ...PERMISOS_SOLO_CONSULTA,
      'historial',
      'graficos',
      'verLineasProduccion',
      'todasLasLineas',
      'gestionar_rotacion_supervisores',
      'recibirAlertasProduccion',
      'inicioOperativo'
    ]);

    const base = asignados.filter(p => permitidosSoloConsulta.has(p));

    // La rotación de supervisores NO se concede por cargo.
    // Se respeta exclusivamente el permiso guardado por Administración,
    // permitiendo activarlo o retirarlo en tiempo real vía sync/users.
    return [...new Set(base)];
  }
  if(u.permisos==='todos') return 'todos';
  if(Array.isArray(u.permisos)){
    // Los permisos del Supervisor son explícitos. Nunca se concede
    // automáticamente acceso a Gestión de usuarios/trabajadores.
    if(u.rol==='Supervisor'){
      return [...new Set([
        ...u.permisos.filter(p=>p!=='gestionarPersonal'),
        'avanceProduccion'
      ])];
    }
    return u.permisos;
  }
  return permisosPorRolAnterior(u.rol);
}

/* Alias con nombre funcional. Reutilizan permisos ya guardados en
   sync/users; no crean datos nuevos ni duplican permisos. */
const PERMISOS_ALIAS={
  ver_produccion_actual:['produccionActual'],
  gestionar_produccion:['paletas','programarPaletas'],
  gestionar_tareo_produccion:['tareoProduccion']
};

/* Puertas de entrada de menú a los tareos. VER ≠ GESTIONAR: la edición
   se valida aparte en 13-tareo.js (tareoAutorizadoEscribir). */
function puedeEntrarTareoProduccion(){
  return tienePermiso('tareoProduccion') || tienePermiso('tareoGeneral') ||
    tienePermiso('ver_tareo_produccion');
}
function puedeEntrarMantenimiento(){
  // Jefatura/Gerencia solo consultan: entran únicamente con ver_tareo_mantenimiento.
  if(esUsuarioSoloConsulta(state.user))return tienePermiso('ver_tareo_mantenimiento');
  return tienePermiso('moduloMantenimiento') ||
    tienePermiso('gestionar_tareo_mantenimiento') ||
    tienePermiso('ver_tareo_mantenimiento');
}

function tienePermiso(permiso){
  if(!state.user) return false;
  if(PERMISOS_ALIAS[permiso]) return PERMISOS_ALIAS[permiso].some(k=>tienePermiso(k));
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

/* =========================================================
   ESCUCHAS RESTRINGIDAS (rotaciones, precios, borradores)
   La cuenta compartida de Mantenimiento no puede leer estos
   documentos (ver firestore.rules.etapa2.txt), así que no se
   escuchan para ese rol: evita errores de permiso en consola.
   - Reglas abiertas (etapa 1): arrancan al inicio, como siempre,
     y se detienen al entrar si el rol es Mantenimiento compartido.
   - Reglas estrictas (etapa 2): arrancan al entrar a la app, ya con
     sesión, y solo si el rol no es Mantenimiento compartido.
   ========================================================= */

const _escuchasRestringidas = {};

function _escuchaRestringida(nombre, iniciar){

  _escuchasRestringidas[nombre] = _escuchasRestringidas[nombre] ||
    { iniciar:null, detener:null, activa:false };

  _escuchasRestringidas[nombre].iniciar = iniciar;

  const estricto =
    typeof REGLAS_ESTRICTAS !== 'undefined' && REGLAS_ESTRICTAS;

  if(!estricto) activarEscuchaRestringida(nombre);

}

function activarEscuchaRestringida(nombre){

  const e = _escuchasRestringidas[nombre];

  if(!e || e.activa || typeof e.iniciar !== 'function') return;

  e.detener = e.iniciar();
  e.activa = true;

}

function detenerEscuchaRestringida(nombre){

  const e = _escuchasRestringidas[nombre];

  if(!e || !e.activa) return;

  if(typeof e.detener === 'function') e.detener();

  e.detener = null;
  e.activa = false;

}

/* Se llama al entrar a la app (enterApp), con state.user ya definido. */
function sincronizarEscuchasPorRol(){

  const soloMantenimiento =
    typeof esMantCompartido === 'function' && esMantCompartido();

  Object.keys(_escuchasRestringidas).forEach(nombre =>
    soloMantenimiento
      ? detenerEscuchaRestringida(nombre)
      : activarEscuchaRestringida(nombre)
  );

}


function initRealtimeSync(){

  db.collection('sync').doc('users')

    .onSnapshot(

      snap => {

        /*
           SEGURIDAD: Firestore es la fuente oficial de usuarios.
           Nunca sembrar usuarios predeterminados automáticamente aquí,
           porque una respuesta vacía/incompleta podría reemplazar una
           lista real de usuarios. Los defaults quedan disponibles solo
           como referencia/arranque manual, no como escritura automática.
        */
        if(
          snap.exists &&
          Array.isArray(snap.data().items)
        ){

          _usersCache = snap.data().items;

        } else {

          _usersCache = [];

          console.error(
            'sync/users no existe o no contiene un arreglo items válido. ' +
            'Por seguridad NO se crearán usuarios predeterminados automáticamente.'
          );

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

  _escuchaRestringida('rotaciones', () => db.collection('sync').doc('rotaciones')

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

    ));


  /*
     ROTACIÓN SEMANAL DE MANTENIMIENTO

     Documento independiente de la rotación de Producción.
     Contiene las asignaciones semanales de los técnicos de
     Mantenimiento: turno (Día / Intermedio / Noche) y horario.
  */

  db.collection('sync').doc('rotacionesMantenimiento')

    .onSnapshot(

      snap => {

        _rotacionesMantenimientoCache =
          (snap.exists && snap.data().items)
            ? snap.data().items
            : [];

        _rotacionesMantenimientoReady = true;

        onRotacionesMantenimientoUpdated();

      },

      err => {

        console.error(
          'Error de sincronización (rotación semanal de mantenimiento):', err
        );

      }

    );


  /*
     ROTACIÓN SEMANAL DE MAQUINISTAS (nodo nuevo e independiente)

     sync/rotacionMaquinistas → items: una semana por elemento, con la
     grilla lunes–domingo (DÍA / NOCHE / DESCANSO) y la línea de cada
     maquinista. No modifica ninguna otra rotación.
  */

  db.collection('sync').doc('rotacionMaquinistas')

    .onSnapshot(

      snap => {

        _rotacionMaquinistasCache =
          (snap.exists && snap.data().items)
            ? snap.data().items
            : [];

        if(typeof onRotacionMaquinistasUpdated === 'function'){
          onRotacionMaquinistasUpdated();
        }

      },

      err => {

        console.error(
          'Error de sincronización (rotación de maquinistas):', err
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

  _escuchaRestringida('precios', () => db.collection('sync').doc('precios')

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

    ));


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

  /*
     Mantener la sesión actual sincronizada con Firestore.
     Antes _usersCache se actualizaba, pero state.user conservaba
     la copia de permisos obtenida al iniciar sesión.
  */
  if(state.user){

    const usernameActual=
      String(state.user.username || '').trim().toLowerCase();

    const usuarioActualizado=
      (_usersCache || []).find(
        u =>
          String(u?.username || '').trim().toLowerCase()
          === usernameActual
      );

    if(usuarioActualizado){

      const permisosAntes=
        JSON.stringify(normalizarPermisosUsuario(state.user));

      state.user={
        ...state.user,
        ...usuarioActualizado
      };

      const permisosAhora=
        JSON.stringify(normalizarPermisosUsuario(state.user));

      /*
         Si el administrador cambió permisos desde otro usuario/equipo,
         refrescar la interfaz actual para aplicar el cambio sin relogin.
      */
      if(permisosAntes !== permisosAhora){

        if(typeof renderSidebar === 'function'){
          renderSidebar();
        }

        if(typeof renderMain === 'function'){
          renderMain();
        }

      }

    }

  }


  if(document.getElementById('userlist')){

    renderUserList();

  }

}


function onWorkersUpdated(){

  if(typeof tareoControlActualizar === 'function') tareoControlActualizar();

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

  if(typeof aplicarContextoRotacionSupervisor==='function'){
    aplicarContextoRotacionSupervisor(false);
  }

  if(
    state.user &&
    state.currentTab==='rotacion-supervisores' &&
    typeof renderRotacionSupervisores==='function'
  ){
    renderRotacionSupervisores();
  }

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


function onRotacionesMantenimientoUpdated(){

  if(
    document.getElementById('mtto-rotacion-semanal-view') &&
    typeof renderRotacionSemanalMantenimiento === 'function'
  ){

    renderRotacionSemanalMantenimiento();

  }

}


function onTareosUpdated(){

  if(typeof tareoControlActualizar === 'function') tareoControlActualizar();

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


  /*
     Tareo en tiempo real: si la persona tiene abierto el
     formulario de asistencia (supervisor) o el Tareo General
     (RRHH), se actualiza con lo que marcaron desde otros
     equipos. El formulario no se redibuja mientras la persona
     está escribiendo en un campo, ni mientras haya un guardado
     propio en camino (ver tareoRefrescarFormularioRemoto).
  */

  if(
    document.getElementById('tareo-form-view') &&
    typeof tareoRefrescarFormularioRemoto === 'function'
  ){

    tareoRefrescarFormularioRemoto();

  }

  if(
    document.getElementById('tareo-general-view') &&
    typeof renderTareoGeneral === 'function'
  ){

    renderTareoGeneral();

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

  if(!Array.isArray(u)){
    console.error('saveUsers(): se rechazó un valor que no es un arreglo.', u);
    alert('No se guardaron los usuarios: la lista recibida no es válida.');
    return Promise.resolve(false);
  }

  /*
     Guardar el documento completo sigue siendo compatible con la arquitectura
     actual, pero primero se consulta Firestore para impedir que un caché vacío
     o incompleto sobrescriba silenciosamente una lista mayor.

     Las reducciones intencionales NO pasan por aquí: el Administrador elimina con
     eliminarUsuarioEnFirestore(username) (más abajo), que quita exactamente a ese
     usuario de la lista ACTUAL de Firestore dentro de una transacción. Así esta
     protección sigue activa contra cualquier otra lista desactualizada o incompleta.
  */
  const nuevaLista = u.map(usuario => ({ ...usuario }));
  const anteriorCache = Array.isArray(_usersCache)
    ? _usersCache.map(usuario => ({ ...usuario }))
    : [];

  return db.collection('sync').doc('users').get()
    .then(snap => {
      const remotos =
        snap.exists && Array.isArray(snap.data().items)
          ? snap.data().items
          : [];

      if(remotos.length > nuevaLista.length){
        console.error(
          'Protección de usuarios: escritura bloqueada porque Firestore contiene ' +
          remotos.length + ' usuarios y se intentó guardar solo ' +
          nuevaLista.length + '.',
          { remotos, nuevaLista }
        );

        _usersCache = remotos;
        onUsersUpdated();

        alert(
          'Guardado de usuarios bloqueado por seguridad.\n\n' +
          'Firestore contiene ' + remotos.length + ' usuario(s), pero esta operación ' +
          'intentó guardar solo ' + nuevaLista.length + '.\n\n' +
          'La lista de Firestore se conservó sin cambios.'
        );

        return false;
      }

      _usersCache = nuevaLista;

      return db.collection('sync').doc('users').set({
        items: nuevaLista,
        updatedAt: Date.now()
      }).then(() => true);
    })
    .catch(err => {
      _usersCache = anteriorCache;
      _avisarErrorGuardado('usuarios', err);
      return false;
    });

}


/* Eliminación intencional de UN usuario (solo Administrador).
   - Parte de la lista actual de Firestore (no del caché del navegador) y quita únicamente a
     ese usuario, dentro de una transacción: si alguien más agregó o cambió usuarios, se conservan.
   - Devuelve { ok, eliminado, motivo }. 'eliminado' es el registro tal como estaba en Firestore
     (con authEmail/authUid, para anotar la cuenta antigua).
   - No se puede eliminar 'admin' ni al último Administrador. */
function eliminarUsuarioEnFirestore(username){
  const nombre = String(username || '').trim();
  const clave = x => String((x && x.username) || '').trim();
  const esAdmin = x => String((x && x.rol) || '').trim() === 'Administrador';
  const anteriorCache = Array.isArray(_usersCache) ? _usersCache : [];

  if(!nombre) return Promise.resolve({ ok:false, motivo:'Usuario no válido.' });
  if(nombre === 'admin')
    return Promise.resolve({ ok:false, motivo:'El usuario administrador principal no puede eliminarse.' });

  const ref = db.collection('sync').doc('users');

  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const remotos = snap.exists && Array.isArray(snap.data().items) ? snap.data().items : [];
    const objetivo = remotos.find(x => clave(x) === nombre);

    if(!objetivo) return { ok:true, yaNoExiste:true, lista:remotos, eliminado:null };

    const nueva = remotos.filter(x => clave(x) !== nombre);

    if(nueva.length !== remotos.length - 1)
      return { ok:false, motivo:'Había más de un registro con ese nombre de usuario. No se eliminó nada.' };

    if(esAdmin(objetivo) && !nueva.some(esAdmin))
      return { ok:false, motivo:'No se puede eliminar al único Administrador.' };

    tx.set(ref, { items:nueva, updatedAt:Date.now() });
    return { ok:true, lista:nueva, eliminado:{ ...objetivo } };
  }).then(r => {
    if(r.ok && Array.isArray(r.lista)){
      _usersCache = r.lista.map(x => ({ ...x }));
      onUsersUpdated();
    }
    return r;
  }).catch(err => {
    _usersCache = anteriorCache;
    _avisarErrorGuardado('usuarios', err);
    return { ok:false, motivo:'No se pudo guardar: ' + ((err && err.message) || err) };
  });
}
window.eliminarUsuarioEnFirestore = eliminarUsuarioEnFirestore;


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
   ROTACIÓN SEMANAL DE MANTENIMIENTO
   ========================================================= */

function loadRotacionesMantenimiento(){

  return _rotacionesMantenimientoCache;

}


function saveRotacionesMantenimiento(r){

  _rotacionesMantenimientoCache = Array.isArray(r) ? r : [];

  db.collection('sync').doc('rotacionesMantenimiento').set({
    items: _rotacionesMantenimientoCache,
    updatedAt: Date.now()
  }).catch(err => _avisarErrorGuardado('rotación semanal de mantenimiento', err));

}


/* =========================================================
   ROTACIÓN SEMANAL DE MAQUINISTAS
   ========================================================= */

function loadRotacionMaquinistas(){

  return _rotacionMaquinistasCache;

}


function saveRotacionMaquinistas(r){

  _rotacionMaquinistasCache = Array.isArray(r) ? r : [];

  db.collection('sync').doc('rotacionMaquinistas').set({
    items: _rotacionMaquinistasCache,
    updatedAt: Date.now()
  }).catch(err => _avisarErrorGuardado('rotación de maquinistas', err));

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
