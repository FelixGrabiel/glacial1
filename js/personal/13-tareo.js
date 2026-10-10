/* =========================================================
   GLACIAL - TAREO DE PERSONAL
   =========================================================

   Funciones principales:
   - Tareo por ÁREA: Producción y Mantenimiento (cada
     supervisor gestiona solo su área) + Tareo General de
     solo lectura para RRHH
   - Asistencia en tiempo real: estados ASISTIÓ, FALTA POR
     JUSTIFICAR, FALTA JUSTIFICADA, DESCANSO, DESCANSO MÉDICO
     y VACACIONES; al marcar ASISTIÓ se registra sola la hora
     de ingreso y se detecta la tardanza
   - Ficha de la persona al tocar su nombre
   - Tareo Día / Noche
   - Personal de Producción proveniente exclusivamente de la rotación Excel vigente
   - Cargos permitidos
   - Rotación semanal mediante Excel
   - Validación de rotación
   - Orden de asistencia
   - Horas trabajadas
   - Horas extras
   - Tardanzas
   - Historial
   - Resumen mensual
   - Exportación Excel profesional
   - Exportación PNG
   ========================================================= */

const TAREO_STORAGE_KEY = 'GLACIAL_TAREOS';
const TAREO_ROTACION_STORAGE_KEY = 'GLACIAL_ROTACION_SEMANAL';

const TAREO_CARGOS_PERMITIDOS = [
    'Operario de Producción',
    'Maquinista de Producción',
    'Supervisor de Producción'
];

const TAREO_ESTADOS_ASISTENCIA = [
    'Asistió',
    'Falta por justificar',
    'Falta justificada',
    'Descanso',
    'Descanso médico',
    'Vacaciones',
    'Suspensión',
    'Licencia sin goce',
    'Licencia por maternidad',
    'Licencia por paternidad',
    'Fallecimiento de familiar directo',
    'Comisión / trabajo externo',
    'Feriado trabajado'
];

const TAREO_ESTADOS_FINAL =
    TAREO_ESTADOS_ASISTENCIA.filter(
        estado => estado !== 'Asistió'
    );

/*
   Estado global del tareo.
   Se usa `var` intencionalmente porque openTareo() puede ser invocado
   desde botones globales mientras terminan de cargarse/extenderse los
   módulos de Tareo/RRHH. Así evitamos la Temporal Dead Zone de `let`.
*/
var tareoActualId = null;

/* Estado de pantalla del módulo (filtros y área que se está viendo). */

let tareoAreaVista = null;
let tareoFiltroTexto = '';
let tareoFiltroAreaHistorial = '';
let tareoFechaVista = '';

let tareoGeneralFiltros = {
    fecha: '',
    turno: '',
    area: ''
};


/* =========================================================
   AVISO DE ROTACIÓN CARGADA SIN APLICAR
   =========================================================

   El Excel de rotación, al subirse, solo se procesa y se
   muestra como VISTA PREVIA en window._tareoRotacionPendiente
   (una variable en memoria). Nada se guarda de verdad hasta
   que la persona hace clic en "Validar y aplicar rotación"
   (aplicarRotacionPendiente(), que sí escribe en Firestore).

   Esto avisa dos veces si hay una vista previa sin aplicar:
   1) al intentar cerrar/recargar la pestaña (beforeunload)
   2) al intentar navegar a otra sección dentro del propio
      sistema (Tareo, Historial, otras líneas, cerrar sesión,
      etc.) mediante confirmarAbandonoRotacionPendiente()
   ========================================================= */

window.addEventListener('beforeunload', function(evento){

    if(window._tareoRotacionPendiente){

        evento.preventDefault();
        evento.returnValue = '';

        return '';
    }

});


function confirmarAbandonoRotacionPendiente(){

    // Cambios del tareo todavía no confirmados en la nube (45-tareo-edicion-continua.js): se avisa antes de salir.
    if(window.TareoEd && window.TareoEd.sinConfirmar().length){

        const salir = confirm(
            'Hay cambios del tareo que todavía no se confirmaron en la nube.\n\n' +
            'Si sales ahora podrías perderlos. ¿Salir de todas formas?'
        );

        if(!salir) return false;
    }

    if(!window._tareoRotacionPendiente){
        return true;
    }

    return confirm(
        'Cargaste un Excel de rotación semanal que todavía ' +
        'NO se ha aplicado.\n\n' +
        'Si sales de esta pantalla ahora, se perderá y ' +
        'tendrás que volver a subirlo.\n\n' +
        '¿Deseas salir de todas formas sin aplicar la rotación?'
    );

}

window.confirmarAbandonoRotacionPendiente =
    confirmarAbandonoRotacionPendiente;


/* =========================================================
   UTILIDADES
   ========================================================= */

function tareoNormalizarTexto(valor) {
    return String(valor || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}


function tareoNormalizarDNI(valor) {
    return String(valor || '')
        .replace(/\D/g, '')
        .trim();
}


function tareoCargoPermitido(cargo, area) {
    const cargoNormalizado = tareoNormalizarTexto(cargo);

    /*
       Mantenimiento: cualquier cargo que mencione
       "mantenimiento" (Técnico de Mantenimiento, Supervisor de
       Mantenimiento, etc.). Producción: lista TAREO_CARGOS_PERMITIDOS.
    */

    if (area === 'Mantenimiento') {
        return cargoNormalizado.includes('mantenimiento');
    }

    return TAREO_CARGOS_PERMITIDOS.some(cargoPermitido =>
        tareoNormalizarTexto(cargoPermitido) === cargoNormalizado
    );
}


function escaparHTML(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


function obtenerFechaHoy() {
    const ahora = new Date();

    const año = ahora.getFullYear();
    const mes = String(ahora.getMonth() + 1).padStart(2, '0');
    const dia = String(ahora.getDate()).padStart(2, '0');

    return `${año}-${mes}-${dia}`;
}


function formatearFecha(fecha) {
    if (!fecha) return '-';

    const partes = String(fecha).split('-');

    if (partes.length !== 3) return fecha;

    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}


/* =========================================================
   ÁREAS DEL TAREO (PRODUCCIÓN / MANTENIMIENTO) Y PERMISOS
   =========================================================

   Cada tareo pertenece a un ÁREA (tareo.area). Los tareos
   guardados antes de este cambio no tienen ese campo y se
   tratan como "Producción".

   Quién puede qué (permisos que asigna el Administrador en
   Gestión de usuarios, ver PERMISOS_APP en 02-estado.js):

   - tareoProduccion     → registra el Tareo de Producción
                            (aquí, en la pantalla "Tareo" de
                            siempre)
   - moduloMantenimiento → registra el Tareo de Mantenimiento,
                            pero SOLO desde el módulo de
                            Mantenimiento propio (sidebar →
                            "Mantenimiento" → Tareo, ver
                            18-mantenimiento.js). Este permiso
                            reutiliza toda esta lógica de área
                            "Mantenimiento" tal cual, así que
                            un usuario con moduloMantenimiento
                            SÍ aparece aquí como área editable
                            — la diferencia es de dónde se
                            entra, no de qué se ve.
   - tareoGeneral        → RRHH (solo lectura): ve ambos tareos
                            (Producción y Mantenimiento), pero
                            no puede editar ni eliminar
   - moduloRRHH          → módulo de RRHH completo (19-rrhh.js):
                            además de ver Tareo General, edita y
                            elimina el Tareo de AMBAS áreas. No
                            trae Rotación semanal (eso sigue
                            siendo solo de tareoProduccion)
   - "Todos los permisos" → todo lo anterior

   NOTA (antes tareoMantenimiento): el Tareo de Mantenimiento
   se movió por completo al módulo de Mantenimiento. Ya NO se
   registra desde la pantalla genérica de Tareo aunque el
   usuario tenga tareoProduccion — solo desde el módulo nuevo,
   y solo con el permiso moduloMantenimiento.

   COMPATIBILIDAD: un usuario que todavía NO tiene ninguno de
   esos permisos conserva el comportamiento anterior: si su
   puesto/rol menciona RRHH / recursos humanos ve el Tareo
   General (solo lectura); en cualquier otro caso registra
   Producción. Ya NO se asigna Mantenimiento por texto del
   puesto — ese acceso ahora depende siempre del permiso
   moduloMantenimiento, y la edición/eliminación por parte de
   RRHH depende siempre del permiso moduloRRHH.
   ========================================================= */

const TAREO_AREAS = ['Producción', 'Mantenimiento'];

function tareoAreaDe(tareo) {
    const area = tareoNormalizarTexto(tareo && tareo.area);

    return area === 'mantenimiento'
        ? 'Mantenimiento'
        : 'Producción';
}


/*
   VER ≠ GESTIONAR
   - acceso.editar  → áreas que el usuario puede registrar/editar/validar/eliminar
                      (gestionar_tareo_produccion ≡ tareoProduccion;
                       gestionar_tareo_mantenimiento o moduloMantenimiento).
   - acceso.ver     → áreas que puede CONSULTAR (ver_tareo_produccion,
                      ver_tareo_mantenimiento; tareoGeneral/moduloRRHH = ambas).
                      Incluye siempre las áreas editables.
   Jefatura/Gerencia (roles de solo consulta) NUNCA editan, aunque se
   les marque un permiso de gestión: solo consultan según ver_tareo_*.
*/
function tareoAccesoUsuario() {

    const acceso = { editar: [], ver: [], general: false };

    if (typeof state === 'undefined' || !state.user) {
        return acceso;
    }

    const permisos = normalizarPermisosUsuario(state.user);

    const tiene = clave =>
        permisos === 'todos' ||
        (Array.isArray(permisos) && permisos.includes(clave));

    // Jefatura y Gerencia consultan, sin acceso a formularios.
    if (esUsuarioSoloConsulta(state.user)) {

        if (tiene('ver_tareo_produccion') || tiene('tareoGeneral')) {
            acceso.ver.push('Producción');
        }

        if (tiene('ver_tareo_mantenimiento') || tiene('tareoGeneral')) {
            acceso.ver.push('Mantenimiento');
        }

        acceso.general = acceso.ver.length > 0;

        return acceso;
    }

    if (permisos === 'todos') {
        return {
            editar: [...TAREO_AREAS],
            ver: [...TAREO_AREAS],
            general: true
        };
    }

    if (tiene('tareoProduccion') || tiene('gestionar_tareo_produccion')) {
        acceso.editar.push('Producción');
    }

    /*
       moduloMantenimiento da acceso de edición al área
       "Mantenimiento" dentro de esta misma lógica (por eso el
       Tareo de Mantenimiento sigue funcionando igual: mismo
       storage, mismo historial, mismo resumen, misma
       exportación). Lo único que cambió es la puerta de
       entrada: ya no hay un permiso "tareoMantenimiento" que
       lo habilite desde la pantalla genérica de Tareo, solo
       moduloMantenimiento desde 18-mantenimiento.js.
    */

    if (
        permisos.includes('moduloMantenimiento') ||
        permisos.includes('gestionar_tareo_mantenimiento')
    ) {
        acceso.editar.push('Mantenimiento');
    }

    /*
       moduloRRHH: el módulo de RRHH (19-rrhh.js). A diferencia
       de tareoGeneral (que solo VE, de solo lectura), moduloRRHH
       puede editar y eliminar el Tareo de cualquiera de las dos
       áreas — por eso agrega ambas a acceso.editar y también
       prende acceso.general (para la pestaña "Tareo General").
       No agrega por sí solo la pestaña "Rotación semanal": esa
       sigue reservada a quien tenga tareoProduccion de verdad
       (ver tareoRenderTabs).
    */
    if (permisos.includes('moduloRRHH')) {

        if (!acceso.editar.includes('Producción')) {
            acceso.editar.push('Producción');
        }

        if (!acceso.editar.includes('Mantenimiento')) {
            acceso.editar.push('Mantenimiento');
        }

    }

    // Consulta por permiso específico (independiente por área).
    if (permisos.includes('ver_tareo_produccion')) acceso.ver.push('Producción');
    if (permisos.includes('ver_tareo_mantenimiento')) acceso.ver.push('Mantenimiento');

    // Tareo General (RRHH, solo lectura) y moduloRRHH ven ambas áreas.
    if (
        permisos.includes('tareoGeneral') ||
        permisos.includes('moduloRRHH')
    ) {
        TAREO_AREAS.forEach(area => acceso.ver.push(area));
    }

    acceso.editar.forEach(area => acceso.ver.push(area));
    acceso.ver = TAREO_AREAS.filter(area => acceso.ver.includes(area));

    acceso.general =
        permisos.includes('tareoGeneral') ||
        permisos.includes('moduloRRHH') ||
        permisos.includes('ver_tareo_produccion') ||
        permisos.includes('ver_tareo_mantenimiento');

    if (acceso.editar.length || acceso.general) {
        return acceso;
    }

    /*
       Usuario sin permisos de Tareo asignados: ya NO se le concede
       edición de Producción por defecto (la escritura exige permiso
       explícito). Solo se conserva la regla anterior de RRHH por texto.
    */

    const texto = tareoNormalizarTexto(
        (state.user.puesto || '') + ' ' + (state.user.rol || '')
    );

    if (
        texto.includes('rrhh') ||
        texto.includes('recursos humanos') ||
        texto.includes('gestion humana') ||
        texto.includes('talento humano')
    ) {
        acceso.general = true;
        acceso.ver = [...TAREO_AREAS];
    }

    return acceso;
}


function tareoAreasEditables() {
    return tareoAccesoUsuario().editar;
}


function tareoAreasVisibles() {
    return [...tareoAccesoUsuario().ver];
}

/* Supervisor responsable del tareo (quien lo abrió), con su nombre si existe. */
function tareoResponsable(tareo) {

    const usuario = String((tareo && tareo.creadoPor) || '').trim();

    if (!usuario) return '—';

    try {
        const encontrado = (typeof loadUsers === 'function' ? loadUsers() : [])
            .find(u => String(u.username || '').toLowerCase() === usuario.toLowerCase());

        return (encontrado && encontrado.nombre) || usuario;
    } catch (_) {
        return usuario;
    }
}

/* ¿Solo puede consultar (no gestiona ninguna área)? */
function tareoEsSoloConsulta() {

    const acceso = tareoAccesoUsuario();

    return !acceso.editar.length && acceso.ver.length > 0;
}

/*
   Validación de ESCRITURA (no solo visual). Se invoca antes de
   cualquier guardado/eliminación, así que ejecutar una función
   a mano desde la consola tampoco permite modificar el tareo.
*/
function tareoAutorizadoEscribir(tareoOArea) {

    if (typeof state === 'undefined' || !state.user) return false;

    if (esUsuarioSoloConsulta(state.user)) return false;

    const area = typeof tareoOArea === 'string'
        ? tareoOArea
        : tareoAreaDe(tareoOArea);

    return tareoAreasEditables().includes(area);
}

function tareoAvisoSinPermisoEscritura(contexto) {

    console.warn(
        'TAREO: operación bloqueada por permisos (solo visualización)' +
        (contexto ? ': ' + contexto : '')
    );
}

/*
   Identidad única de una persona: DNI, ID interno o, como último
   recurso, el nombre. Dos filas son la misma persona si comparten
   CUALQUIERA de esos datos (no vacíos).
*/
function tareoIdentidades(persona) {

    const claves = [];

    const dni = tareoNormalizarDNI(persona && persona.dni);
    const id = String(
        (persona && (persona.trabajadorId || persona.id)) || ''
    ).trim();
    const nombre = tareoNormalizarTexto(persona && persona.nombre)
        .replace(/\s+/g, ' ');

    if (dni) claves.push('DNI:' + dni);
    if (id) claves.push('ID:' + id);
    // El nombre solo identifica cuando no hay DNI ni ID (evita fusionar homónimos).
    if (!claves.length && nombre) claves.push('NOM:' + nombre);

    return claves;
}

/* Elimina repetidos conservando la primera aparición. */
function tareoDeduplicarPersonas(lista) {

    const vistos = new Set();

    return (Array.isArray(lista) ? lista : []).filter(persona => {

        const claves = tareoIdentidades(persona);

        if (!claves.length) return false;

        if (claves.some(clave => vistos.has(clave))) return false;

        claves.forEach(clave => vistos.add(clave));

        return true;
    });
}


function tareoPuedeEditar(tareo) {
    return tareoAreasEditables().includes(tareoAreaDe(tareo));
}


/* Excel, PNG, Sheets y WhatsApp: solo quien gestiona el tareo (supervisores,
   Supervisor de Mantenimiento), RRHH y Administrador. Quien solo tiene
   permiso de visualización (Jefatura, Gerencia, ver_tareo_*) no los ve. */
function tareoPuedeExportar(tareo) {

    if (typeof state === 'undefined' || !state.user) return false;

    if (esUsuarioSoloConsulta(state.user)) return false;

    return (tareo ? tareoPuedeEditar(tareo) : tareoAreasEditables().length > 0) ||
        tienePermiso('moduloRRHH');
}
window.tareoPuedeExportar = tareoPuedeExportar;


function tareoTareosVisibles() {

    const visibles = tareoAreasVisibles();

    return obtenerTareos().filter(
        tareo => visibles.includes(tareoAreaDe(tareo))
    );
}


/* =========================================================
   ESTADOS DE ASISTENCIA
   =========================================================

   Valor guardado ('' = todavía sin registrar / pendiente):

     Asistió · Falta por justificar · Falta justificada ·
     Descanso · Descanso médico · Vacaciones

   Los tareos antiguos usaban "Falta" y "Permiso": se leen
   como "Falta por justificar" y "Falta justificada".
   ========================================================= */

function tareoEstadoCanonico(valor) {

    const texto = tareoNormalizarTexto(valor);

    if (!texto) return '';
    if (texto === 'asistio') return 'Asistió';

    if (
        texto === 'falta' ||
        texto === 'falta por justificar'
    ) {
        return 'Falta por justificar';
    }

    if (
        texto === 'permiso' ||
        texto === 'falta justificada'
    ) {
        return 'Falta justificada';
    }

    if (texto === 'descanso') return 'Descanso';
    if (texto === 'descanso medico') return 'Descanso médico';
    if (texto === 'vacaciones') return 'Vacaciones';
    if (texto === 'suspension') return 'Suspensión';
    if (texto === 'licencia sin goce' || texto === 'licencia sin goce') return 'Licencia sin goce';
    if (texto === 'licencia por maternidad') return 'Licencia por maternidad';
    if (texto === 'licencia por paternidad') return 'Licencia por paternidad';
    if (texto === 'fallecimiento de familiar directo' || texto === 'fallecimiento por familiar directo') return 'Fallecimiento de familiar directo';
    if (texto === 'comision / trabajo externo' || texto === 'comision' || texto === 'trabajo externo') return 'Comisión / trabajo externo';
    if (texto === 'feriado trabajado') return 'Feriado trabajado';

    return String(valor);
}


/* =========================================================
   CRITERIO ÚNICO DE ASISTENCIA (se define aquí y en ningún otro lugar)
   =========================================================

   Lo usan: las pantallas del Tareo, el mensaje de WhatsApp, el Inicio,
   el resumen de turno, el panel de RRHH, la imagen del tareo y los Excel.

   Grupos (siempre suman el total de personas):
     Presentes      = Asistió + Feriado trabajado + Comisión / trabajo externo
                      («en comisión» = los de Comisión / trabajo externo)
     Faltas         = Falta por justificar + Falta justificada
     Descansos      = Descanso + Descanso médico
     Otros ausentes = Vacaciones, Suspensión, licencias y fallecimiento
                      de familiar directo
     Sin registrar  = sin estado

   Tardanzas: personas con minutos de tardanza > 0 DENTRO de los presentes.
   ========================================================= */

const TAREO_ESTADOS_PRESENTE = ['Asistió', 'Feriado trabajado', 'Comisión / trabajo externo'];
const TAREO_ESTADO_COMISION = 'Comisión / trabajo externo';
const TAREO_ESTADOS_FALTA = ['Falta por justificar', 'Falta justificada'];
const TAREO_ESTADOS_DESCANSO = ['Descanso', 'Descanso médico'];

/* Devuelve: 'presentes' | 'faltas' | 'descansos' | 'otros' | 'sinRegistrar' */
function tareoGrupoAsistencia(estado) {

    const e = tareoEstadoCanonico(estado);

    if (!e) return 'sinRegistrar';
    if (TAREO_ESTADOS_PRESENTE.includes(e)) return 'presentes';
    if (TAREO_ESTADOS_FALTA.includes(e)) return 'faltas';
    if (TAREO_ESTADOS_DESCANSO.includes(e)) return 'descansos';

    return 'otros';

}

function tareoEsPresente(estado) {
    return tareoGrupoAsistencia(estado) === 'presentes';
}

/* lista: personas del tareo (campos asistencia y tardanzaMinutos) u otras filas
   con acc = { estado: fila => ..., tardanza: fila => ... }. */
function tareoResumenAsistencia(lista, acc) {

    const a = Object.assign({
        estado: p => p && p.asistencia,
        tardanza: p => p && p.tardanzaMinutos
    }, acc || {});

    const r = {
        total: 0, presentes: 0, enComision: 0, faltas: 0,
        descansos: 0, otros: 0, sinRegistrar: 0, tardanzas: 0
    };

    (Array.isArray(lista) ? lista : []).forEach(p => {

        r.total++;

        const e = tareoEstadoCanonico(a.estado(p));
        const g = tareoGrupoAsistencia(e);

        r[g]++;

        if (g === 'presentes') {
            if (e === TAREO_ESTADO_COMISION) r.enComision++;
            if (Number(a.tardanza(p)) > 0) r.tardanzas++;
        }

    });

    /* nombres de siempre, para no romper a quien ya los usa */
    r.asistieron = r.presentes;
    r.pendientes = r.sinRegistrar;

    return r;

}

/* «6 presentes, 1 en comisión» */
function tareoTextoPresentes(r) {

    const n = Number(r && (r.presentes !== undefined ? r.presentes : r.asistieron)) || 0;
    const c = Number(r && r.enComision) || 0;

    return n + (n === 1 ? ' presente' : ' presentes') +
        (c ? ', ' + c + ' en comisión' : '');

}
window.tareoResumenAsistencia = tareoResumenAsistencia;
window.tareoTextoPresentes = tareoTextoPresentes;
window.tareoEsPresente = tareoEsPresente;
window.tareoGrupoAsistencia = tareoGrupoAsistencia;



function tareoEtiquetaEstado(estado) {

    const canonico = tareoEstadoCanonico(estado);

    return canonico
        ? canonico.toUpperCase()
        : 'PENDIENTE';
}


function tareoNormalizarRegistro(tareo) {

    if (!tareo) return tareo;

    if (!tareo.area) {
        tareo.area = 'Producción';
    }

    if (Array.isArray(tareo.personal)) {

        tareo.personal.forEach(persona => {

            const canonico =
                tareoEstadoCanonico(persona.asistencia);

            if (canonico !== persona.asistencia) {
                persona.asistencia = canonico;
            }

            if (!persona.area) {
                persona.area = tareo.area;
            }
        });

        tareo.personal =
            ordenarPersonalTareo(tareo.personal);

        // Filas que comparten identificación: reciben un filaId persistente (una sola vez) para no combinarse (45-tareo-edicion-continua.js).
        if (window.TareoEd) window.TareoEd.asegurarFilaIds(tareo);
    }

    return tareo;
}


/* =========================================================
   FECHA / HORA EN TIEMPO REAL
   ========================================================= */

function tareoFechaISO(fecha) {

    const año = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');

    return `${año}-${mes}-${dia}`;
}


function tareoHoraActual() {

    const ahora = new Date();

    return (
        String(ahora.getHours()).padStart(2, '0') +
        ':' +
        String(ahora.getMinutes()).padStart(2, '0')
    );
}


/*
   La hora de ingreso solo se toma sola cuando el tareo es
   "de ahora": el del día de hoy, o el turno Noche de ayer
   mientras todavía es de madrugada. En un tareo de otra
   fecha la hora del reloj no tiene sentido, así que se
   deja para escribirla a mano.
*/

function tareoEsEnTiempoReal(tareo) {

    const ahora = new Date();

    if (tareo.fecha === tareoFechaISO(ahora)) {
        return true;
    }

    if (normalizarTurno(tareo.turno) === 'Noche') {

        const ayer = new Date(
            ahora.getFullYear(),
            ahora.getMonth(),
            ahora.getDate() - 1
        );

        return (
            tareo.fecha === tareoFechaISO(ayer) &&
            ahora.getHours() < 12
        );
    }

    return false;
}


/* =========================================================
   CONTADORES DE UN TAREO
   ========================================================= */

/* =========================================================
   HORAS EXTRAS = SALDO (horas trabajadas − jornada)
   =========================================================
   Horas trabajadas ya descuentan el refrigerio y resuelven turnos de
   noche que cruzan la medianoche. Positivo = a favor (+, verde);
   negativo = en contra (−, rojo); exacto = 0:00 (gris). Solo se calcula
   cuando hay ingreso y salida; si no, es null ("—").
   NO modifica persona.horasExtras (campo guardado, sigue igual).
*/

function tareoSaldoHoras(persona, jornada) {

    const j = Number(jornada) || 8;

    if (!persona) return null;

    if (persona.tipo === 'POR DÍA') {

        if (!persona.horaIngreso || !persona.horaSalida) return null;

        return tareoHorasPorDia(persona) - j;
    }

    if (
        tareoEstadoCanonico(persona.asistencia) !== 'Asistió' ||
        !persona.horaIngreso ||
        !persona.horaSalida
    ) {
        return null;
    }

    const refrigerio = calcularMinutosRefrigerio(
        persona.salidaRefrigerio,
        persona.retornoRefrigerio
    ) / 60;

    return calcularHorasTrabajadas(
        persona.horaIngreso,
        persona.horaSalida,
        refrigerio
    ) - j;
}

/* Texto H:MM con signo. */
function tareoTextoSaldo(saldo) {

    if (saldo === null || saldo === undefined || Number.isNaN(saldo)) return '—';

    const minutos = Math.round(Math.abs(saldo) * 60);

    if (minutos === 0) return '0:00';

    return (saldo > 0 ? '+' : '-') +
        Math.floor(minutos / 60) + ':' + String(minutos % 60).padStart(2, '0');
}

function tareoSaldoHTML(saldo) {

    if (saldo === null || saldo === undefined || Number.isNaN(saldo)) return '—';

    const minutos = Math.round(Math.abs(saldo) * 60);

    const clase = minutos === 0
        ? 'tareo-saldo-cero'
        : (saldo > 0 ? 'tareo-saldo-pos' : 'tareo-saldo-neg');

    return `<strong class="${clase}">${tareoTextoSaldo(saldo)}</strong>`;
}

/* Saldo para exportar a Excel: horas decimales con signo (sumable). */
function tareoSaldoNumero(saldo) {

    return saldo === null || saldo === undefined || Number.isNaN(saldo)
        ? ''
        : Number(saldo.toFixed(2));
}

function tareoContadores(personal, jornada) {

    const c = {
        total: personal.length,
        asistieron: 0,
        pendientes: 0,
        ausencias: 0,
        tardanzas: 0,
        horas: 0,
        extras: 0,
        saldo: 0,
        saldoFavor: 0,
        saldoContra: 0
    };

    const g = tareoResumenAsistencia(personal);

    c.asistieron = g.presentes;
    c.enComision = g.enComision;
    c.faltas = g.faltas;
    c.descansos = g.descansos;
    c.otros = g.otros;
    c.pendientes = g.sinRegistrar;
    c.ausencias = g.faltas + g.descansos + g.otros;
    c.tardanzas = g.tardanzas;

    personal.forEach(persona => {

        /* la asistencia se cuenta con el criterio único (tareoResumenAsistencia) */

        c.horas += Number(persona.horasTrabajadas || 0);
        c.extras += Number(persona.horasExtras || 0);

        const s = tareoSaldoHoras(persona, jornada);

        if (s !== null) {
            c.saldo += s;
            if (s > 0) c.saldoFavor += s;
            if (s < 0) c.saldoContra += -s;
        }
    });

    c.registrados = c.total - c.pendientes;

    return c;
}


function tareoBuscar(area, fecha, turno) {

    return obtenerTareos().find(
        tareo =>
            tareoAreaDe(tareo) === area &&
            tareo.fecha === fecha &&
            normalizarTurno(tareo.turno) === normalizarTurno(turno)
    ) || null;
}


/* =========================================================
   GUARDADO EN TIEMPO REAL SIN PISAR A OTROS
   =========================================================

   Todos los tareos viven en UN solo documento de Firestore
   (sync/tareos). Guardar el arreglo completo desde cada
   navegador haría que, si dos supervisores marcan asistencia
   casi a la vez (Producción y Mantenimiento), el último en
   guardar borre lo que marcó el otro.

   Por eso cada guardado se hace en una TRANSACCIÓN: se lee
   el documento tal como está en la nube, se combina SOLO el
   tareo modificado (persona por persona, gana el cambio más
   reciente según "actualizadoEn") y recién entonces se
   escribe. Los tareos de los demás no se tocan.
   ========================================================= */

window._tareoEscriturasPendientes = 0;

/*
   Cola local de escrituras de Tareo.

   Firestore ya reintenta una transacción cuando OTRO cliente cambia
   sync/tareos. El problema aparece cuando ESTE MISMO navegador lanza
   varias transacciones sobre el mismo documento casi al mismo tiempo
   (por ejemplo, varias marcaciones seguidas): esas transacciones
   compiten entre sí y pueden terminar con el error de versión/base.

   La cola NO cambia la lógica del Tareo ni el formato guardado:
   únicamente hace que las transacciones originadas en este navegador
   entren una por una. Cada transacción sigue leyendo la versión más
   reciente de Firestore y sigue usando tareoFusionar().
*/
window._tareoColaGuardado = Promise.resolve();


/* Hora para marcar los cambios del tareo: la del servidor (calibrada), no la del equipo, para que un reloj atrasado o adelantado
   no haga perder la fusión entre dispositivos. */
function tareoAhoraMs() {
    return typeof window !== 'undefined' && typeof window.tareoAhoraServidor === 'function'
        ? window.tareoAhoraServidor() : Date.now();
}

/* Une dos listas de personas: la lista y el orden son los de la primera (la copia más nueva); de cada persona se toma el
   registro con mayor actualizadoEn entre ambas copias. */
function tareoPersonalMasReciente(principal, otra, config) {
    // Campo a campo (gana el cambio más reciente de CADA campo, no el de toda la persona) y con claves únicas: filas con la misma
    // identificación no se combinan. Ver 45-tareo-edicion-continua.js.
    if (window.TareoEd) return window.TareoEd.mezclarListas(principal, otra, false, config);
    const porClave = new Map();
    otra.forEach(persona => porClave.set(tareoClavePersona(persona), persona));
    return principal.map(persona => {
        const otraPersona = porClave.get(tareoClavePersona(persona));
        return (otraPersona && Number(otraPersona.actualizadoEn || 0) > Number(persona.actualizadoEn || 0))
            ? otraPersona : persona;
    });
}

function tareoFusionar(remoto, local) {

    // Quita las personas con una exclusión activa (la entrada más nueva por persona decide).
    const tareoSinExcluidos = (lista, excluidos) =>
        (typeof window !== 'undefined' && window.TareoEd && excluidos && excluidos.length)
            ? window.TareoEd.filtrarExcluidos(lista, excluidos)
            : lista;

    const localMasNuevo =
        Number(local.actualizadoEn || 0) >=
        Number(remoto.actualizadoEn || 0);

    const base = localMasNuevo ? local : remoto;
    const otro = localMasNuevo ? remoto : local;

    const configLocal =
        Number(local.configActualizadoEn || 0) >=
        Number(remoto.configActualizadoEn || 0);

    const config = configLocal ? local : remoto;

    /*
       PRODUCCIÓN:
       La nómina NO se fusiona sumando personas de la copia vieja.
       La copia más nueva es autoritativa porque ya fue construida
       desde la rotación Excel. Esto permite ELIMINAR de Firestore
       las filas antiguas provenientes de Gestionar trabajadores.

       Antes, el Map unía "remoto + local"; por eso cada limpieza
       volvía a traer los duplicados desde Firestore.
    */
    if (tareoAreaDe(base) === 'Producción') {

        return {
            ...base,

            observaciones:
                config.observaciones || '',

            horaProgramadaIngreso:
                config.horaProgramadaIngreso,

            jornadaNormal:
                config.jornadaNormal,

            configActualizadoEn:
                config.configActualizadoEn || 0,

            actualizadoEn:
                Math.max(
                    Number(local.actualizadoEn || 0),
                    Number(remoto.actualizadoEn || 0)
                ),

            /*
               La lista de personas la define la copia más nueva (así se siguen depurando filas antiguas), PERO cada persona
               conserva su registro MÁS RECIENTE (persona.actualizadoEn). Sin esto, si el supervisor marca varias salidas seguidas
               y llega un cambio de la nube entre una y otra, la copia siguiente (armada con datos un instante viejos) pisaba
               las salidas ya guardadas: «le coloco la hora de salida y no se queda guardada».
            */
            personalExcluido:
                window.TareoEd
                    ? window.TareoEd.mezclarExcluidos(base.personalExcluido, otro.personalExcluido)
                    : (base.personalExcluido || []),

            personal:
                tareoSinExcluidos(
                    ordenarPersonalTareo(
                        tareoPersonalMasReciente(
                            Array.isArray(base.personal) ? base.personal : [],
                            Array.isArray(otro.personal) ? otro.personal : [],
                            { jornadaNormal: config.jornadaNormal, horaProgramadaIngreso: config.horaProgramadaIngreso }
                        )
                    ),
                    window.TareoEd ? window.TareoEd.mezclarExcluidos(base.personalExcluido, otro.personalExcluido) : []
                ),

            personalPorDia:
                tareoFusionarPorDia(remoto, local)
        };
    }

    /*
       MANTENIMIENTO conserva la fusión histórica por persona.
    */
    /*
       Antes la clave era String(trabajadorId ?? dni ?? nombre): una cadena vacía NO pasa al siguiente valor, así que varias personas
       con trabajadorId '' compartían la misma clave y se fusionaban en una. Ahora se usa la identidad única (id → DNI → nombre,
       normalizados; filas repetidas con su filaId) y la mezcla es campo a campo.
    */
    if (window.TareoEd) {

        return {
            ...base,

            observaciones: config.observaciones || '',
            horaProgramadaIngreso: config.horaProgramadaIngreso,
            jornadaNormal: config.jornadaNormal,
            configActualizadoEn: config.configActualizadoEn || 0,

            actualizadoEn:
                Math.max(
                    Number(local.actualizadoEn || 0),
                    Number(remoto.actualizadoEn || 0)
                ),

            personalExcluido:
                window.TareoEd.mezclarExcluidos(base.personalExcluido, otro.personalExcluido),

            personal:
                tareoSinExcluidos(
                    ordenarPersonalTareo(
                        window.TareoEd.mezclarListas(
                            Array.isArray(base.personal) ? base.personal : [],
                            Array.isArray(otro.personal) ? otro.personal : [],
                            true,
                            { jornadaNormal: config.jornadaNormal, horaProgramadaIngreso: config.horaProgramadaIngreso }
                        )
                    ),
                    window.TareoEd.mezclarExcluidos(base.personalExcluido, otro.personalExcluido)
                ),

            personalPorDia:
                tareoFusionarPorDia(remoto, local)
        };
    }

    const clave = persona => String(
        persona.trabajadorId || persona.dni || persona.nombre
    );

    const mapa = new Map();

    (otro.personal || []).forEach(
        persona => mapa.set(clave(persona), persona)
    );

    (base.personal || []).forEach(persona => {

        const previo =
            mapa.get(
                clave(persona)
            );

        if (
            !previo ||
            Number(persona.actualizadoEn || 0) >=
            Number(previo.actualizadoEn || 0)
        ) {
            mapa.set(
                clave(persona),
                persona
            );
        }
    });

    return {
        ...base,

        observaciones:
            config.observaciones || '',

        horaProgramadaIngreso:
            config.horaProgramadaIngreso,

        jornadaNormal:
            config.jornadaNormal,

        configActualizadoEn:
            config.configActualizadoEn || 0,

        actualizadoEn:
            Math.max(
                Number(local.actualizadoEn || 0),
                Number(remoto.actualizadoEn || 0)
            ),

        personal:
            ordenarPersonalTareo(
                Array.from(
                    mapa.values()
                )
            ),

        personalPorDia:
            tareoFusionarPorDia(remoto, local)
    };
}


function tareoGuardarEnNube(tareo) {

    if (!tareoAutorizadoEscribir(tareo)) {
        tareoAvisoSinPermisoEscritura('guardar tareo');
        return;
    }

    if (
        typeof db === 'undefined' ||
        typeof db.runTransaction !== 'function'
    ) {

        /* Respaldo: comportamiento anterior. */

        guardarTareos(obtenerTareos());

        return;
    }

    /*
       EDICIÓN DE UNA PERSONA (asistencia / horas): se guarda como OPERACIÓN concreta (campos cambiados + valor capturado) aplicada
       a la versión actual leída dentro de la transacción, sin enviar una copia vieja de la persona. Ver 45-tareo-edicion-continua.js.
    */
    if (window.TareoEd && window.TareoEd.hayOpsSinEnviar(tareo.id)) {

        window.TareoEd.enviar();

        // Edición de una persona: solo viaja la operación. Cualquier otro guardado del tareo (personas agregadas, configuración…)
        // sigue su camino normal y se encola detrás de las operaciones.
        if (window._tareoGuardandoOperacion) return;
    }

    const referencia = db.collection('sync').doc('tareos');

    /*
       Se congela exactamente el cambio solicitado en este instante.
       La fusión con la versión más reciente se hace dentro de la
       transacción cuando a esta escritura le corresponda su turno.
    */
    const copia = JSON.parse(JSON.stringify(tareo));

    // La copia en vuelo se reaplica sobre lo que llegue de la nube mientras no se confirme (reconciliación).
    if (window.TareoEd) window.TareoEd.legacyIniciar(copia);

    window._tareoEscriturasPendientes++;

    const ejecutarGuardado = () =>
        db.runTransaction(async transaccion => {

            const snap = await transaccion.get(referencia);

            const items =
                (snap.exists && Array.isArray(snap.data().items))
                    ? snap.data().items.slice()
                    : [];

            const indice = items.findIndex(
                item => item.id === copia.id
            );

            if (indice >= 0) {
                items[indice] = tareoFusionar(items[indice], copia);
            } else {
                items.push(copia);
            }

            transaccion.set(referencia, {
                items,
                updatedAt: Date.now()
            });
        });

    /*
       IMPORTANTE: no se ejecutan dos transacciones de Tareo de este
       navegador al mismo tiempo. Un error anterior tampoco bloquea
       la siguiente escritura.
    */
    const operacion = window._tareoColaGuardado
        .catch(() => undefined)
        .then(ejecutarGuardado);

    window._tareoColaGuardado = operacion;

    operacion
    .catch(error => {

        if (typeof _avisarErrorGuardado === 'function') {
            _avisarErrorGuardado('tareo', error);
        } else {
            console.error('TAREO: error guardando', error);
        }
    })
    .finally(() => {

        if (window.TareoEd) window.TareoEd.legacyTerminar(copia);

        window._tareoEscriturasPendientes--;

        if (window._tareoEscriturasPendientes <= 0) {

            window._tareoEscriturasPendientes = 0;

            tareoRefrescarFormularioRemoto();
        }
    });
}


/* =========================================================
   TABS DEL MÓDULO
   ========================================================= */

/* Pestañas que solo se muestran en el módulo al que pertenecen (state.currentTab):
   Rotación semanal → Producción ('tareo'); Rotación semanal MTTO, Rotación maquinista e Identificación
   de técnicos → Mantenimiento; Auditoría → Producción y Mantenimiento. El panel de RRHH no las muestra. */
const TAREO_PESTANA_MODULOS = {
    rotacion: ['tareo'],
    rotacionMtto: ['mantenimiento'],
    rotacionMaq: ['mantenimiento'],
    identificacion: ['mantenimiento'],
        auditoria: ['tareo', 'mantenimiento'],
    distribucion: ['tareo']
};
function tareoPestanaEnModulo(clave) {
    const modulos = TAREO_PESTANA_MODULOS[clave] || [];
    return modulos.includes(state && state.currentTab);
}
window.tareoPestanaEnModulo = tareoPestanaEnModulo;

function tareoRenderTabs(activa) {

    const acceso = tareoAccesoUsuario();

    const tabs = [];

    if (acceso.editar.length) {
        tabs.push(['tareo', 'Tareo', 'renderTareoPrincipal()']);
    }

    if (acceso.general) {
        tabs.push(['general', 'Tareo General', 'renderTareoGeneral()']);
    }

        // Distribución de personal por línea (Producción): edita quien tiene el permiso; el resto la consulta.
    if (
        typeof renderDistribucionPersonal === 'function' &&
        tareoPestanaEnModulo('distribucion') &&
        (acceso.editar.includes('Producción') || acceso.ver.includes('Producción'))
    ) {
        tabs.push(['distribucion', 'Distribución de personal', 'renderDistribucionPersonal()']);
    }

    tabs.push(['historial', 'Historial', 'renderHistorialTareo()']);
    tabs.push(['resumen', 'Resumen mensual', 'renderResumenMensualTareoUI()']);

    /*
       Rotación semanal: atada al permiso tareoProduccion en sí
       (no a "editar incluye Producción" en general), para que
       moduloRRHH — que también edita Producción, pero desde el
       módulo de RRHH — no la herede sin que se la asignen aparte.
    */
    if (tienePermiso('tareoProduccion') && tareoPestanaEnModulo('rotacion')) {
        tabs.push(['rotacion', 'Rotación semanal', 'renderRotacionSemanal()']);
    }

    return `
        <div class="tareo-tabs">
            ${tabs.map(([clave, texto, accion]) => `
                <button
                    class="tareo-tab ${clave === activa ? 'active' : ''}"
                    onclick="${
                        clave === activa
                            ? accion
                            : 'if(confirmarAbandonoRotacionPendiente())' + accion
                    }"
                >
                    ${texto}
                </button>
            `).join('')}
        </div>
        ${tareoEsSoloConsulta() ? tareoInsigniaConsulta() : ''}
    `;
}

/* Indicador discreto de modo consulta. */
function tareoInsigniaConsulta() {

    return `
        <div class="tareo-consulta-badge" role="status">
            Modo consulta — Solo visualización
        </div>
    `;
}


/* =========================================================
   ESTILOS PROPIOS DE LAS PANTALLAS DE ÁREAS
   ========================================================= */

function tareoInyectarEstilos() {

    if (
        typeof document === 'undefined' ||
        document.getElementById('tareo-areas-css')
    ) {
        return;
    }

    const estilo = document.createElement('style');

    estilo.id = 'tareo-areas-css';

    estilo.textContent = `
        .tar2-live{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--text-soft,#5a6b78);}
        .tar2-live::before{content:'';width:8px;height:8px;border-radius:50%;background:#1e9e5a;box-shadow:0 0 0 3px rgba(30,158,90,.18);}
        .tar2-area-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px;}
        .tar2-area-pill{border:1px solid var(--line,#d9e2e8);background:#fff;border-radius:999px;padding:7px 16px;font-weight:600;font-size:13px;cursor:pointer;color:var(--text-soft,#405261);}
        .tar2-area-pill.active{background:#003B5C;border-color:#003B5C;color:#fff;}
        .tar2-turno-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;}
        .tar2-card{border:1px solid var(--line,#d9e2e8);border-radius:10px;padding:14px;background:#fff;display:flex;flex-direction:column;gap:10px;}
        .tar2-card-head{display:flex;justify-content:space-between;align-items:center;gap:8px;}
        .tar2-card-title{font-weight:700;font-size:14px;}
        .tar2-card-state{font-size:12px;font-weight:600;}
        .tar2-card-state.open{color:#1e7f4e;}
        .tar2-card-state.none{color:#8a6d1d;}
        .tar2-card-meta{font-size:13px;color:var(--text-soft,#5a6b78);line-height:1.5;}
        .tar2-progress{height:8px;border-radius:999px;background:#e8eef2;overflow:hidden;}
        .tar2-progress span{display:block;height:100%;background:#2f8f6b;border-radius:999px;transition:width .3s;}
        .tar2-name-btn{background:none;border:0;padding:2px 0;margin:0;font:inherit;font-weight:700;color:#005B96;cursor:pointer;text-align:left;text-decoration:underline;text-decoration-color:rgba(0,91,150,.35);text-underline-offset:3px;min-height:28px;}
        .tar2-name-btn:hover,.tar2-name-btn:focus-visible{text-decoration-color:currentColor;outline:none;}
        .tar2-quick{display:flex;gap:6px;align-items:center;flex-wrap:wrap;}
        .tar2-quick select{max-width:160px;}
        .tar2-auto{display:block;font-size:11px;color:#1e7f4e;margin-top:2px;}
        .tar2-inline-btn{border:1px solid var(--line,#d9e2e8);background:#fff;border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;margin-left:4px;}
        .tar2-row-pendiente td{background:#fffdf3;}
        .tareo-status.pendiente{background:#fff4d6;color:#8a6d1d;}
        .tar2-area-badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#e6f0f7;color:#003B5C;}
        .tar2-area-badge.mant{background:#fdf0e1;color:#8a4b0f;}
        .tar2-toolbar{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;}
        .tar2-toolbar .field-sm{min-width:150px;}
        .tar2-ficha-head{margin-bottom:6px;}
        .tar2-ficha-head strong{font-size:17px;display:block;}
        .tar2-ficha-head span{font-size:13px;color:var(--text-soft,#5a6b78);}
        .tar2-ficha-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:8px 0 16px;}
        .tar2-ficha-item{border:1px solid var(--line,#d9e2e8);border-radius:8px;padding:9px 11px;}
        .tar2-ficha-item span{display:block;font-size:11px;color:var(--text-soft,#5a6b78);}
        .tar2-ficha-item strong{font-size:15px;}
        .tar2-ficha-sub{font-weight:700;font-size:13px;margin:14px 0 4px;}
        .tareo-saldo-pos{color:#1e7f4e;}
        .tareo-saldo-neg{color:#c62828;}
        .tareo-saldo-cero{color:#8a98a5;}
        .tar2-salida-orig{display:block;font-size:10px;color:#8a98a5;text-decoration:line-through;}
        .tar2-editado{display:inline-block;margin-left:4px;font-size:11px;color:#8a4b0f;cursor:help;}
        .tar2-alerta-salida{margin:0 0 12px;padding:10px 12px;border:1px solid #efc98a;border-left:4px solid #e0a100;border-radius:8px;background:#fff8e6;color:#6b4a00;font-size:13px;display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;}
        .tar2-chip-descanso{display:inline-block;margin-left:4px;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:700;background:#eceff2;color:#5a7083;}
        .tar2-chip-trabajo-desc{background:#fdf0e1;color:#8a4b0f;}
        .tar2-totales{margin:0 0 12px;padding:8px 12px;border:1px solid var(--line,#d9e2e8);border-radius:8px;background:#f3f8fc;font-size:13px;color:var(--text-soft,#405261);}
        .tar2-totales strong{color:#003B5C;}
        .tar2-tecnicos{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;font-size:12px;}
        .tar2-tecnicos li{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:2px 0;border-bottom:1px dashed #e5edf3;}
        .tareo-consulta-badge{display:inline-flex;align-items:center;gap:6px;margin:0 0 12px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;background:#eef3f7;color:#4a6072;border:1px solid #d3dee6;}
        .tareo-consulta-badge::before{content:'👁';font-size:11px;}
        @media (max-width:640px){.tar2-ficha-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
    `;

    document.head.appendChild(estilo);
}


/*
   Tocar / hacer clic en el nombre de una persona (en cualquier
   tabla del Tareo) abre su ficha. Un solo listener para toda
   la página: los nombres llevan data-tareo-ficha.
*/

document.addEventListener('click', function(evento) {

    const boton = evento.target.closest
        ? evento.target.closest('[data-tareo-ficha]')
        : null;

    if (boton) {
        tareoAbrirFicha(
            boton.getAttribute('data-tareo-ficha'),
            boton.getAttribute('data-tareo-id') || ''
        );
    }
});


function tareoBotonNombre(persona, tareoId) {

    return `
        <button
            type="button"
            class="tar2-name-btn"
            data-tareo-ficha="${escaparHTML(persona.trabajadorId ?? persona.id ?? '')}"
            data-tareo-id="${escaparHTML(tareoId || '')}"
        >
            ${escaparHTML(persona.nombre)}
        </button>
    `;
}


function tareoInsigniaArea(area) {

    return `
        <span class="tar2-area-badge ${area === 'Mantenimiento' ? 'mant' : ''}">
            ${escaparHTML(area)}
        </span>
    `;
}


/* Identificador estable de una persona dentro de un tareo. */

function tareoClavePersona(persona) {

    /*
       IMPORTANTE:
       ?? no sirve aquí porque '' no es null/undefined.
       Varias personas importadas desde Excel podían tener trabajadorId=''
       y todas terminaban con la MISMA clave vacía. Entonces al editar una
       fila, .find() modificaba a la primera persona con clave ''.

       La clave ahora usa el primer valor REALMENTE no vacío.
    */
    const trabajadorId =
        String(persona?.trabajadorId || persona?.id || '').trim();

    if (trabajadorId) {
        return trabajadorId;
    }

    const dni =
        tareoNormalizarDNI(persona?.dni || '');

    if (dni) {
        return 'DNI-' + dni;
    }

    const nombre =
        tareoNormalizarTexto(persona?.nombre || '')
            .replace(/\s+/g, ' ')
            .trim();

    return 'NOMBRE-' + nombre;
}


/* Valor listo para usarse como argumento dentro de un onclick="...". */

function tareoArg(valor) {

    return escaparHTML(
        JSON.stringify(String(valor))
    );
}


/* =========================================================
   PERSONAL
   ========================================================= */

function obtenerPersonalTareo(area) {

    const areaBuscada = area || 'Producción';

    if (typeof loadWorkers !== 'function') {

        console.error(
            'TAREO: No se encontró loadWorkers().'
        );

        return [];
    }

    let trabajadores = [];

    try {
        trabajadores = loadWorkers();
    } catch (error) {

        console.error(
            'TAREO: Error al cargar trabajadores:',
            error
        );

        return [];
    }

    if (!Array.isArray(trabajadores)) {
        return [];
    }

    // Un mismo trabajador no debe repetirse aunque esté duplicado en la lista.
    return tareoDeduplicarPersonas(trabajadores.filter(trabajador => {

        if (!trabajador) return false;

        const estado = tareoNormalizarTexto(
            trabajador.estado
        );

        return (
            estado === 'activo' &&
            tareoCargoPermitido(trabajador.cargo, areaBuscada)
        );
    }));
}


/* =========================================================
   STORAGE TAREOS
   =========================================================

   Antes, los tareos se guardaban SOLO con localStorage
   (únicamente en el navegador de la computadora donde se
   creaban). Por eso al entrar desde otra PC o celular no
   aparecían: nunca habían salido de ese navegador.

   Ahora se guardan en Firestore (igual que usuarios,
   reportes, trabajadores y rotación semanal), a través de
   loadTareos()/saveTareos() definidas en 02-estado.js — así
   quedan disponibles en tiempo real en cualquier equipo.

   TAREO_STORAGE_KEY se mantiene solo para migrar, una única
   vez, los tareos que hayan quedado guardados localmente en
   este navegador antes de este cambio (para no perderlos).
*/

function _obtenerTareosBase() {

    if (typeof loadTareos !== 'function') {

        console.error(
            'TAREO: No se encontró loadTareos().'
        );

        return [];
    }

    let tareos = [];

    try {
        tareos = loadTareos();
    } catch (error) {

        console.error(
            'TAREO: Error al cargar tareos:',
            error
        );

        return [];
    }

    if (Array.isArray(tareos) && tareos.length) {
        return tareos;
    }

    /*
       Solo se intenta la migración desde localStorage una
       vez que Firestore YA confirmó (_tareosReady) que de
       verdad no hay datos en la nube. Si se migrara antes de
       esa confirmación, se correría el riesgo de pisar datos
       recién llegados de Firestore con una copia local vieja,
       apenas por haber consultado unos milisegundos antes de
       que llegara la respuesta real.
    */

    if (typeof _tareosReady !== 'undefined' && !_tareosReady) {
        return Array.isArray(tareos) ? tareos : [];
    }

    /* Migración única de tareos guardados localmente. */

    try {

        const datosLocales = localStorage.getItem(
            TAREO_STORAGE_KEY
        );

        if (datosLocales) {

            const tareosLocales = JSON.parse(datosLocales);

            if (
                Array.isArray(tareosLocales) &&
                tareosLocales.length
            ) {

                guardarTareos(tareosLocales);

                localStorage.removeItem(
                    TAREO_STORAGE_KEY
                );

                return tareosLocales;
            }
        }

    } catch (error) {

        console.error(
            'TAREO: Error migrando tareos locales:',
            error
        );
    }

    return Array.isArray(tareos) ? tareos : [];
}


/*
   Lectura de tareos con normalización: los tareos anteriores a
   las áreas se leen como "Producción" y sus estados antiguos
   ("Falta", "Permiso") se leen con los nombres nuevos.
*/

function obtenerTareos() {

    const tareos = _obtenerTareosBase();

    tareos.forEach(tareoNormalizarRegistro);

    return tareos;
}



function guardarTareos(tareos) {

    // Escritura masiva: solo quien gestiona al menos un área del tareo.
    if (
        esUsuarioSoloConsulta(state.user) ||
        !tareoAreasEditables().length
    ) {
        tareoAvisoSinPermisoEscritura('guardar tareos');
        return;
    }

    if (typeof saveTareos !== 'function') {

        console.error(
            'TAREO: No se encontró saveTareos().'
        );

        return;
    }

    saveTareos(tareos);
}


function guardarTareoEnMemoria(tareo) {

    if (!tareoAutorizadoEscribir(tareo)) {
        tareoAvisoSinPermisoEscritura('guardar tareo');
        return;
    }

    tareo.actualizadoEn = tareoAhoraMs();

    /*
       1) Se actualiza de inmediato la copia local, para que
          la pantalla responda al instante.
       2) Se guarda en la nube con una transacción que combina
          este tareo con lo que otros hayan marcado mientras
          tanto (ver tareoGuardarEnNube).
    */

    const tareos = obtenerTareos();

    const indice = tareos.findIndex(
        item => item.id === tareo.id
    );

    if (indice >= 0) {
        tareos[indice] = tareo;
    } else {
        tareos.push(tareo);
    }

    tareoGuardarEnNube(tareo);
}


/* =========================================================
   ROTACIÓN SEMANAL
   ========================================================= */

/*
   La rotación semanal se guarda en Firestore (igual que
   usuarios/reportes/trabajadores), a través de
   loadRotaciones()/saveRotaciones() definidas en
   02-estado.js. Así queda disponible en tiempo real en
   cualquier computadora, y no solo en la que la cargó.

   TAREO_ROTACION_STORAGE_KEY se mantiene solo para migrar,
   una única vez, una rotación que haya quedado guardada
   localmente en este navegador antes de este cambio.
*/

function obtenerRotaciones() {

    if (typeof loadRotaciones !== 'function') {

        console.error(
            'TAREO: No se encontró loadRotaciones().'
        );

        return [];
    }

    let rotaciones = [];

    try {
        rotaciones = loadRotaciones();
    } catch (error) {

        console.error(
            'TAREO: Error al cargar rotaciones:',
            error
        );

        return [];
    }

    if (Array.isArray(rotaciones) && rotaciones.length) {
        return rotaciones;
    }

    /*
       Solo se intenta la migración desde localStorage una
       vez que Firestore YA confirmó (_rotacionesReady) que
       de verdad no hay datos en la nube. Si se migrara antes
       de esa confirmación, se correría el riesgo de pisar
       datos recién llegados de Firestore con una copia local
       vieja, apenas por haber consultado unos milisegundos
       antes de que llegara la respuesta real.
    */

    if (typeof _rotacionesReady !== 'undefined' && !_rotacionesReady) {
        return Array.isArray(rotaciones) ? rotaciones : [];
    }

    /* Migración única de una rotación guardada localmente. */

    try {

        const datosLocales = localStorage.getItem(
            TAREO_ROTACION_STORAGE_KEY
        );

        if (datosLocales) {

            const rotacionesLocales = JSON.parse(datosLocales);

            if (
                Array.isArray(rotacionesLocales) &&
                rotacionesLocales.length
            ) {

                guardarRotaciones(rotacionesLocales);

                localStorage.removeItem(
                    TAREO_ROTACION_STORAGE_KEY
                );

                return rotacionesLocales;
            }
        }

    } catch (error) {

        console.error(
            'TAREO: Error migrando rotaciones locales:',
            error
        );
    }

    return Array.isArray(rotaciones) ? rotaciones : [];
}


function guardarRotaciones(rotaciones) {

    if (typeof saveRotaciones !== 'function') {

        console.error(
            'TAREO: No se encontró saveRotaciones().'
        );

        return;
    }

    saveRotaciones(rotaciones);
}


function generarIdRotacion() {

    return (
        'ROT-' +
        Date.now().toString(36) +
        '-' +
        Math.random().toString(36).substring(2, 8)
    ).toUpperCase();
}


/* =========================================================
   SEMANA
   ========================================================= */

function obtenerInicioSemana(fecha) {

    const partes = String(fecha).split('-');

    if (partes.length !== 3) {
        return fecha;
    }

    const fechaObj = new Date(
        Number(partes[0]),
        Number(partes[1]) - 1,
        Number(partes[2])
    );

    const dia = fechaObj.getDay();

    const diferencia = dia === 0
        ? -6
        : 1 - dia;

    fechaObj.setDate(
        fechaObj.getDate() + diferencia
    );

    const año = fechaObj.getFullYear();
    const mes = String(
        fechaObj.getMonth() + 1
    ).padStart(2, '0');

    const día = String(
        fechaObj.getDate()
    ).padStart(2, '0');

    return `${año}-${mes}-${día}`;
}


function obtenerFinSemana(fecha) {

    const inicio = obtenerInicioSemana(fecha);

    const partes = inicio.split('-');

    const fechaObj = new Date(
        Number(partes[0]),
        Number(partes[1]) - 1,
        Number(partes[2])
    );

    fechaObj.setDate(
        fechaObj.getDate() + 6
    );

    const año = fechaObj.getFullYear();

    const mes = String(
        fechaObj.getMonth() + 1
    ).padStart(2, '0');

    const día = String(
        fechaObj.getDate()
    ).padStart(2, '0');

    return `${año}-${mes}-${día}`;
}


function fechaDentroDeRotacion(
    fecha,
    rotacion
) {

    return (
        fecha >= rotacion.fechaInicio &&
        fecha <= rotacion.fechaFin
    );
}


/* =========================================================
   BUSCAR ROTACIÓN VIGENTE
   ========================================================= */

function obtenerRotacionVigente(fecha) {

    const rotaciones = obtenerRotaciones();

    const vigentes = rotaciones.filter(
        rotacion =>
            fechaDentroDeRotacion(
                fecha,
                rotacion
            )
    );

    if (!vigentes.length) {
        return null;
    }

    vigentes.sort(
        (a, b) =>
            String(b.creadoEn || '')
                .localeCompare(
                    String(a.creadoEn || '')
                )
    );

    return vigentes[0];
}


/* =========================================================
   NORMALIZAR TURNO
   ========================================================= */

function normalizarTurno(valor) {

    const texto = tareoNormalizarTexto(valor);

    if (
        texto.includes('noche') ||
        texto === 'n'
    ) {
        return 'Noche';
    }

    if (
        texto.includes('dia') ||
        texto.includes('día') ||
        texto === 'd'
    ) {
        return 'Día';
    }

    return '';
}


/* =========================================================
   PERSONAL SEGÚN ROTACIÓN
   ========================================================= */


function tareoFirmaNombreMigracion(nombre) {

    return tareoNormalizarTexto(nombre || '')
        .replace(/[^a-z0-9ñ\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .sort()
        .join('|');
}


function obtenerPersonalPorRotacion(
    fecha,
    turno
) {

    const rotacion =
        obtenerRotacionVigente(
            fecha
        );

    if (!rotacion) {
        return {
            tieneRotacion: false,
            rotacion: null,
            personal: []
        };
    }

    const turnoNormalizado =
        normalizarTurno(
            turno
        );

    const registros =
        Array.isArray(rotacion.personal)
            ? rotacion.personal
            : [];

    const vistos =
        new Set();

    const personal =
        [];

    registros.forEach((registro, indice) => {

        if (
            normalizarTurno(
                registro.turno
            ) !== turnoNormalizado
        ) {
            return;
        }

        const nombre =
            String(
                registro.nombre || ''
            )
                .replace(/\s+/g, ' ')
                .trim();

        if (!nombre) {
            return;
        }

        const firma =
            tareoFirmaNombreMigracion(
                nombre
            );

        /*
           Durante la migración, nombres con las mismas palabras
           en distinto orden se consideran la misma persona.
           El dato que se conserva es SIEMPRE el de la rotación.
        */
        const clave =
            firma + '|' + turnoNormalizado;

        if (vistos.has(clave)) {
            return;
        }

        vistos.add(clave);

        const trabajadorId =
            String(
                registro.trabajadorId ||
                registro.id ||
                ''
            ).trim() ||
            tareoIdRotacionDesdeFila(
                registro.dni || '',
                nombre
            );

        personal.push({
            id: trabajadorId,
            trabajadorId,
            nombre,
            dni: registro.dni || '',
            cargo:
                registro.cargo ||
                registro.puesto ||
                '',
            linea:
                registro.linea || '',
            turno: turnoNormalizado,
            origen: 'ROTACION_EXCEL'
        });
    });

    return {
        tieneRotacion: true,
        rotacion,
        personal
    };
}


/* =========================================================
   ORDEN PERSONAL
   ========================================================= */

function obtenerPrioridadAsistencia(
    asistencia
) {

    const estado =
        tareoNormalizarTexto(
            tareoEstadoCanonico(
                asistencia
            )
        );

    /* Sin registrar primero: es lo que el supervisor debe atender. */

    if (!estado) return 0;
    if (estado === 'asistio') return 1;
    if (estado === 'descanso') return 2;
    if (estado === 'vacaciones') return 3;
    if (estado === 'descanso medico') return 4;
    if (estado === 'falta justificada') return 5;
    if (estado === 'falta por justificar') return 6;

    return 7;
}


function ordenarPersonalTareo(personal) {

    /*
       Orden operativo del tareo:
       1. Pendiente
       2. Asistió
       3. Descanso
       4. Descanso médico
       5. Falta
       6. Demás estados según obtenerPrioridadAsistencia()

       El cambio de posición es únicamente visual.
       La edición se aplica a la persona correcta mediante
       tareoClavePersona(), que ya evita IDs vacíos compartidos.
    */

    return [...personal].sort((a, b) => {

        const prioridadA =
            obtenerPrioridadAsistencia(
                a.asistencia
            );

        const prioridadB =
            obtenerPrioridadAsistencia(
                b.asistencia
            );

        if (prioridadA !== prioridadB) {
            return prioridadA - prioridadB;
        }

        return String(a.nombre || '')
            .localeCompare(
                String(b.nombre || ''),
                'es',
                {
                    sensitivity: 'base'
                }
            );
    });
}


/* =========================================================
   CREAR PERSONAL PARA TAREO
   ========================================================= */

function crearPersonalTareo(
    fecha,
    turno,
    area
) {

    const areaTareo = area || 'Producción';

    /*
       Producción: el personal sale de la rotación semanal.
       Mantenimiento: todos los trabajadores activos con cargo
       de mantenimiento (no usa la rotación del Excel).
    */

    const baseBruta =
        areaTareo === 'Mantenimiento'
            ? tareoPersonalMantenimientoTurno(fecha, normalizarTurno(turno) || 'Día')
            : obtenerPersonalPorRotacion(
                fecha,
                turno
            ).personal;

    // Personas que ya no trabajan (exclusión permanente de un tareo anterior de esta área): no se vuelven a traer.
    const excluida = window.TareoEd
        ? window.TareoEd.filtroExclusion({ id: '', area: areaTareo, fecha })
        : () => false;

    const base = baseBruta.filter(trabajador => !excluida(trabajador));

    const personal =
        base.map(
            trabajador => tareoNuevaPersona(
                trabajador,
                areaTareo
            )
        );

    return ordenarPersonalTareo(
        personal
    );
}


/*
   Persona nueva dentro de un tareo: arranca SIN REGISTRAR
   (asistencia vacía). El supervisor la marca conforme llega.
*/

function tareoNuevaPersona(
    trabajador,
    area
) {

    return {

        trabajadorId:
            String(
                trabajador.trabajadorId ||
                trabajador.id ||
                tareoIdRotacionDesdeFila(
                    trabajador.dni || '',
                    trabajador.nombre || ''
                )
            ).trim(),

        nombre:
            trabajador.nombre || '',

        tipoDocumento:
            trabajador.tipoDocumento || 'DNI',

        dni:
            trabajador.dni || '',

        cargo:
            trabajador.cargo || '',

        area,

        linea:
            trabajador.linea || '',

        asistencia:
            '',

        horaIngreso:
            '',

        salidaRefrigerio:
            '',

        retornoRefrigerio:
            '',

        refrigerio:
            0,

        horaSalida:
            '',

        horasTrabajadas:
            0,

        horasExtras:
            0,

        tardanzaMinutos:
            0,

        actualizadoEn:
            0,

        // Identificador persistente de la fila: se asigna una sola vez al crear la persona en el tareo.
        filaId:
            window.TareoEd ? window.TareoEd.nuevoFilaId() : ''

    };
}


/* =========================================================
   HORAS
   ========================================================= */

function convertirHoraMinutos(hora) {

    if (!hora) return null;

    const partes =
        String(hora).split(':');

    if (partes.length < 2) {
        return null;
    }

    const horas =
        Number(partes[0]);

    const minutos =
        Number(partes[1]);

    if (
        Number.isNaN(horas) ||
        Number.isNaN(minutos)
    ) {
        return null;
    }

    return (
        horas * 60 +
        minutos
    );
}


function calcularMinutosRefrigerio(salidaRefrigerio, retornoRefrigerio) {
    const salida = convertirHoraMinutos(salidaRefrigerio);
    const retorno = convertirHoraMinutos(retornoRefrigerio);
    if (salida === null || retorno === null) return 0;
    let minutos = retorno - salida;
    if (minutos < 0) minutos += 1440;
    return Math.max(0, minutos);
}

function calcularHorasTrabajadas(
    horaIngreso,
    horaSalida,
    refrigerio
) {

    const ingreso =
        convertirHoraMinutos(
            horaIngreso
        );

    const salida =
        convertirHoraMinutos(
            horaSalida
        );

    if (
        ingreso === null ||
        salida === null
    ) {
        return 0;
    }

    let minutos =
        salida - ingreso;

    if (minutos < 0) {
        minutos += 1440;
    }

    const descanso =
        Number(refrigerio) || 0;

    minutos -= descanso * 60;

    return Math.max(
        0,
        minutos / 60
    );
}


function calcularHorasExtras(
    horasTrabajadas,
    jornadaNormal
) {

    const jornada =
        Number(jornadaNormal) || 8;

    return Math.max(
        0,
        Number(horasTrabajadas || 0) -
        jornada
    );
}


function calcularTardanza(
    horaIngreso,
    horaProgramada
) {

    const ingreso =
        convertirHoraMinutos(
            horaIngreso
        );

    const programada =
        convertirHoraMinutos(
            horaProgramada
        );

    if (
        ingreso === null ||
        programada === null
    ) {
        return 0;
    }

    let diferencia =
        ingreso - programada;

    if (diferencia < -720) {
        diferencia += 1440;
    }

    return Math.max(
        0,
        diferencia
    );
}


function formatearHoras(horas) {

    const valor =
        Number(horas) || 0;

    return valor.toFixed(2);
}


function formatearMinutos(minutos) {

    const valor =
        Number(minutos) || 0;

    if (valor < 60) {
        return `${valor} min`;
    }

    const horas =
        Math.floor(valor / 60);

    const mins =
        valor % 60;

    return `${horas} h ${mins} min`;
}


/* =========================================================
   ID TAREO
   ========================================================= */

function generarIdTareo() {

    return (
        'TAR-' +
        Date.now().toString(36) +
        '-' +
        Math.random()
            .toString(36)
            .substring(2, 7)
    ).toUpperCase();
}


/* =========================================================
   OPEN TAREO
   ========================================================= */

function openTareo() {

    tareoActualId = null;

    const acceso = tareoAccesoUsuario();

    if (!acceso.editar.length && !acceso.general) {

        alert(
            'No tienes acceso al Tareo. Pide al Administrador que te asigne un permiso de Tareo (Producción, Mantenimiento o General).'
        );

        return;
    }

    if (acceso.editar.length) {
        renderTareoPrincipal();
    } else {
        renderTareoGeneral();
    }
}


/* =========================================================
   PRINCIPAL
   ========================================================= */

function tareoAreaActiva() {

    const editables = tareoAreasEditables();

    if (
        !tareoAreaVista ||
        !editables.includes(tareoAreaVista)
    ) {
        tareoAreaVista = editables[0] || null;
    }

    return tareoAreaVista;
}


function tareoCambiarAreaVista(area) {

    tareoAreaVista = area;

    renderTareoPrincipal();
}

function tareoCambiarFechaVista(fecha) {

    tareoFechaVista = fecha;

    renderTareoPrincipal();
}


/* =========================================================
   PROGRAMADOS POR TURNO (según la rotación semanal vigente)
   =========================================================
   Producción: rotación Excel semanal.
   Mantenimiento: rotación semanal de Mantenimiento
   (sync/rotacionesMantenimiento, pestaña "Rotación semanal MTTO").
   El turno "Intermedio" de Mantenimiento se agrupa con Día.
   No se guarda nada nuevo: solo se lee.
*/

function tareoRotacionMttoSemana(fecha) {

    const lista = typeof loadRotacionesMantenimiento === 'function'
        ? (loadRotacionesMantenimiento() || [])
        : [];

    return lista.find(
        r => r && r.fechaInicio &&
            r.fechaInicio <= fecha &&
            fecha <= (r.fechaFin || r.fechaInicio)
    ) || null;
}

function tareoProgramadosPorTurno(area, fecha) {

    const res = { tieneRotacion: false, turnos: { 'Día': [], 'Noche': [] } };

    if (area === 'Mantenimiento') {

        const rot = tareoRotacionMttoSemana(fecha);

        if (!rot) return res;

        res.tieneRotacion = true;

        (rot.personal || []).forEach(p => {

            const t = tareoNormalizarTexto(p.turno).includes('noche')
                ? 'Noche'
                : 'Día';

            res.turnos[t].push(p);
        });

        return res;
    }

    res.maquinistas = { 'Día': null, 'Noche': null };

    ['Día', 'Noche'].forEach(t => {

        const r = obtenerPersonalPorRotacion(fecha, t);

        if (r.tieneRotacion) res.tieneRotacion = true;

        res.turnos[t] = r.personal;

        // Con rotación de maquinistas vigente, ellos se cuentan aparte.
        if (typeof rotacionMaquinistasDia === 'function') {

            const m = rotacionMaquinistasDia(fecha, t);

            if (m.tieneRotacion) {

                const enRot = [...m.trabajan, ...m.descansan];

                res.turnos[t] = r.personal.filter(
                    p => !enRot.some(x => tareoMismaPersonaFlexible(x, p))
                );

                res.maquinistas[t] = m.trabajan.length;
            }
        }
    });

    return res;
}

/*
   Personal de Mantenimiento que le toca a un turno. Si existe rotación
   de Mantenimiento para la semana, un técnico asignado al OTRO turno no
   se incluye; el Supervisor de Mantenimiento (que no rota) y quienes no
   figuran en la rotación entran a ambos. Sin rotación: todos (como antes).
*/
function tareoPersonalMantenimientoTurno(fecha, turno) {

    const base = obtenerPersonalTareo('Mantenimiento');

    const prog = tareoProgramadosPorTurno('Mantenimiento', fecha);

    if (!prog.tieneRotacion) return base;

    const otro = turno === 'Noche' ? 'Día' : 'Noche';

    const ids = lista => new Set(lista.flatMap(tareoIdentidades));

    const delOtro = ids(prog.turnos[otro]);
    const propios = ids(prog.turnos[turno === 'Noche' ? 'Noche' : 'Día']);

    return base.filter(trabajador => {

        const claves = tareoIdentidades(trabajador);

        if (claves.some(c => propios.has(c))) return true;

        return !claves.some(c => delOtro.has(c));
    });
}

/* ---------- Personal POR DÍA (no planilla): campo nuevo tareo.personalPorDia ---------- */

function tareoPorDiaActivos(tareo) {

    return (Array.isArray(tareo && tareo.personalPorDia) ? tareo.personalPorDia : [])
        .filter(p => p && !p.eliminada);
}

function tareoPorDiaDelDia(area, fecha) {

    return obtenerTareos()
        .filter(t => tareoAreaDe(t) === area && t.fecha === fecha)
        .reduce((total, t) => total + tareoPorDiaActivos(t).length, 0);
}

/* Horas trabajadas de una persona por día (ingreso → salida). */
function tareoHorasPorDia(persona) {

    const a = convertirHoraMinutos(persona.horaIngreso);
    const b = convertirHoraMinutos(persona.horaSalida);

    if (a === null || b === null || a === undefined || b === undefined) return 0;

    let min = b - a;

    if (min < 0) min += 24 * 60;

    return min / 60;
}

function tareoTarjetaTurnoHTML(area, fecha, turno) {

    const tareo = tareoBuscar(area, fecha, turno);

    const c = tareo
        ? tareoContadores(tareo.personal || [])
        : null;

    const porcentaje = c && c.total
        ? Math.round(c.registrados * 100 / c.total)
        : 0;

    const prog = tareoProgramadosPorTurno(area, fecha);
    const programados = prog.turnos[turno] || [];
    const porDia = tareo ? tareoPorDiaActivos(tareo).length : 0;

    /* Mantenimiento: técnicos del turno con su estado de asistencia. */
    const estadoDe = persona => {

        if (!tareo) return '';

        const claves = tareoIdentidades(persona);

        const fila = (tareo.personal || []).find(
            item => tareoIdentidades(item).some(k => claves.includes(k))
        );

        if (!fila) return '';

        return `<span class="tareo-status ${tareoClaseEstado(fila.asistencia)}">${escaparHTML(tareoEtiquetaEstado(fila.asistencia))}</span>`;
    };

    const tecnicos = area === 'Mantenimiento' && programados.length
        ? `<ul class="tar2-tecnicos">${programados.map(p => `
              <li><span>${escaparHTML(p.nombre || '')}</span>${estadoDe(p)}</li>`).join('')}</ul>`
        : '';

    const nMaq = prog.maquinistas ? prog.maquinistas[turno] : null;

    const lineaProgramados = `
        <div class="tar2-card-meta">
            ${
                prog.tieneRotacion
                    ? `<strong>${programados.length}</strong> ${area === 'Mantenimiento' ? (programados.length === 1 ? 'técnico' : 'técnicos') : 'programados'}`
                    : '<span class="tareo-warn">Sin rotación</span>'
            }
            ${nMaq !== null && nMaq !== undefined ? ` · Maquinistas: <strong>${nMaq}</strong>` : ''}
            ${porDia ? ` · Por día: <strong>${porDia}</strong>` : ''}
        </div>
        ${tecnicos}
    `;

    return `
        <div class="tar2-card">

            <div class="tar2-card-head">

                <span class="tareo-shift-badge ${turno === 'Noche' ? 'night' : 'day'}">
                    ${turno}
                </span>

                <span class="tar2-card-state ${tareo ? 'open' : 'none'}">
                    ${tareo ? 'Tareo abierto' : 'Sin iniciar'}
                </span>

            </div>

            ${lineaProgramados}

            ${
                tareo
                    ? `
                    <div class="tar2-progress">
                        <span style="width:${porcentaje}%"></span>
                    </div>

                    <div class="tar2-card-meta">
                        <strong>${c.registrados} de ${c.total}</strong> registrados ·
                        ${tareoTextoPresentes(c)} ·
                        ${c.pendientes} pendientes
                        ${
                            c.tardanzas
                                ? ` · <span class="tareo-late">${c.tardanzas} con tardanza</span>`
                                : ''
                        }
                    </div>
                    `
                    : `
                    <div class="tar2-card-meta">
                        Aún no se registra la asistencia de este turno.
                    </div>
                    `
            }

            <button
                class="btn btn-primary btn-sm"
                onclick="tareoAbrir('${area}','${fecha}','${turno}')"
            >
                ${tareo ? 'Continuar registro' : 'Iniciar tareo'}
            </button>

        </div>
    `;
}


function renderTareoPrincipal() {

    const main =
        document.getElementById('main');

    if (!main) return;

    const area = tareoAreaActiva();

    /* Usuario que solo tiene Tareo General (RRHH). */

    if (!area) {
        renderTareoGeneral();
        return;
    }

    const editables = tareoAreasEditables();

    const hoy = obtenerFechaHoy();
    const fechaVista =
        area === 'Mantenimiento'
            ? (tareoFechaVista || hoy)
            : hoy;

    const personal =
        area === 'Producción'
            ? (() => {
                const rotacion = obtenerRotacionVigente(hoy);
                if (!rotacion || !Array.isArray(rotacion.personal)) return [];

                const vistos = new Set();

                return rotacion.personal.filter(persona => {
                    const clave =
                        String(persona.trabajadorId || '').trim() ||
                        ('NOMBRE:' + tareoNormalizarTexto(persona.nombre || ''));

                    if (!clave || vistos.has(clave)) return false;
                    vistos.add(clave);
                    return true;
                });
            })()
            : obtenerPersonalTareo('Mantenimiento');

    const tareosArea = obtenerTareos().filter(
        tareo => tareoAreaDe(tareo) === area
    );

    const ultima = [...tareosArea].sort(
        (a, b) =>
            String(b.fecha || '')
                .localeCompare(String(a.fecha || ''))
    )[0];

    const rotacionVigente =
        area === 'Producción'
            ? obtenerRotacionVigente(hoy)
            : null;

    main.innerHTML = `

        <div class="main-head" id="tareo-principal-view">

            <div>

                <h2>Tareo de ${escaparHTML(area)}</h2>

                <div class="sub">
                    Registro de asistencia en tiempo real
                    del personal de ${escaparHTML(area.toLowerCase())}
                    <span class="tar2-live">En vivo</span>
                </div>

            </div>

            <div class="tareo-head-actions">

                <button
                    class="btn btn-primary"
                    onclick="nuevoTareo()"
                >
                    + Nuevo Tareo
                </button>

            </div>

        </div>


        ${tareoRenderTabs('tareo')}


        ${
            editables.length > 1
                ? `
                <div class="tar2-area-tabs">
                    ${editables.map(item => `
                        <button
                            class="tar2-area-pill ${item === area ? 'active' : ''}"
                            onclick="tareoCambiarAreaVista('${item}')"
                        >
                            ${item}
                        </button>
                    `).join('')}
                </div>
                `
                : ''
        }


        <div class="panel">

            <div class="panel-head">

                <h3>Turnos del día · ${formatearFecha(fechaVista)}</h3>

                ${
                    area === 'Mantenimiento'
                        ? `
                        <div class="field-sm">
                            <label for="tareo-fecha-vista">Fecha del tareo</label>
                            <input
                                type="date"
                                id="tareo-fecha-vista"
                                value="${escaparHTML(fechaVista)}"
                                onchange="tareoCambiarFechaVista(this.value)"
                            >
                        </div>
                        `
                        : `
                        <span class="small-muted">
                            Toca un turno para registrar a quienes van llegando
                        </span>
                        `
                }

            </div>

            <div class="panel-body">

                ${(() => {

                    const p = tareoProgramadosPorTurno(area, fechaVista);
                    const d = p.turnos['Día'].length;
                    const n = p.turnos['Noche'].length;
                    const porDia = tareoPorDiaDelDia(area, fechaVista);

                    return `
                        <div class="tar2-totales">
                            ${
                                p.tieneRotacion
                                    ? `Día: <strong>${d}</strong> · Noche: <strong>${n}</strong> · Total: <strong>${d + n}</strong>`
                                    : '<span class="tareo-warn">Sin rotación</span>'
                            }
                            ${p.maquinistas && p.maquinistas['Día'] !== null ? ` · Maquinistas: <strong>${(p.maquinistas['Día'] || 0) + (p.maquinistas['Noche'] || 0)}</strong>` : ''}
                            ${porDia ? ` · Por día: <strong>${porDia}</strong>` : ''}
                        </div>
                        ${
                            !p.tieneRotacion && area === 'Mantenimiento'
                                ? '<div class="small-muted" style="margin:-4px 0 10px;">Asigna el turno de cada técnico en la pestaña "Rotación semanal MTTO".</div>'
                                : ''
                        }
                    `;
                })()}

                <div class="tar2-turno-grid">
                    ${tareoTarjetaTurnoHTML(area, fechaVista, 'Día')}
                    ${tareoTarjetaTurnoHTML(area, fechaVista, 'Noche')}
                </div>

            </div>

        </div>


        <div class="tareo-kpi-grid">

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Personal activo</span>
                <strong>${personal.length}</strong>
                <small>${escaparHTML(area)}</small>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Tareos registrados</span>
                <strong>${tareosArea.length}</strong>
                <small>Histórico</small>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Último tareo</span>
                <strong>
                    ${ultima ? formatearFecha(ultima.fecha) : '-'}
                </strong>
                <small>
                    ${ultima ? escaparHTML(ultima.turno) : 'Sin registros'}
                </small>
            </div>

            ${
                area === 'Producción'
                    ? `
                    <div class="tareo-kpi">
                        <span class="tareo-kpi-label">Rotación vigente</span>
                        <strong class="${rotacionVigente ? 'tareo-good' : 'tareo-warn'}">
                            ${rotacionVigente ? 'ACTIVA' : 'PENDIENTE'}
                        </strong>
                        <small>Semana actual</small>
                    </div>
                    `
                    : ''
            }

        </div>


        <div class="panel">

            <div class="panel-head">

                <h3>Personal de ${escaparHTML(area.toLowerCase())}</h3>

                <span class="small-muted">
                    ${personal.length} trabajadores
                </span>

            </div>

            <div class="panel-body">

                ${
                    personal.length
                        ? `
                        <div class="tareo-table-wrap">

                            <table class="tareo-table">

                                <thead>
                                    <tr>
                                        <th>Trabajador</th>
                                        <th>DNI</th>
                                        <th>Cargo</th>
                                        <th>Línea</th>
                                    </tr>
                                </thead>

                                <tbody>

                                    ${[...personal].sort(
                                        (a, b) => String(a.nombre || '')
                                            .localeCompare(
                                                String(b.nombre || ''),
                                                'es',
                                                { sensitivity: 'base' }
                                            )
                                    ).map(
                                        trabajador => `
                                        <tr>
                                            <td>${tareoBotonNombre(trabajador, '')}</td>
                                            <td>${escaparHTML(trabajador.dni)}</td>
                                            <td>${escaparHTML(trabajador.cargo)}</td>
                                            <td>${trabajador.linea ? escaparHTML(trabajador.linea) : 'Sin línea'}</td>
                                        </tr>
                                    `).join('')}

                                </tbody>

                            </table>

                        </div>
                        `
                        : `
                        <div class="empty-state">

                            <h4>No hay personal disponible</h4>

                            <p>
                                ${
                                    area === 'Mantenimiento'
                                        ? 'Registra trabajadores activos con un cargo de mantenimiento (por ejemplo "Técnico de Mantenimiento") en Gestionar trabajadores.'
                                        : 'Verifica los trabajadores activos registrados.'
                                }
                            </p>

                        </div>
                        `
                }

            </div>

        </div>

    `;
}


/* =========================================================
   NUEVO TAREO
   ========================================================= */

function nuevoTareo() {

    const editables = tareoAreasEditables();

    if (!editables.length) {

        alert(
            'No tienes permiso para registrar tareos.'
        );

        return;
    }

    const root =
        document.getElementById('modal-root');

    if (!root) return;

    const areaInicial = tareoAreaActiva() || editables[0];

    root.innerHTML = `
        <div class="modal-backdrop" onclick="if(event.target===this)closeModal()">
            <div class="modal">

                <div class="modal-head">
                    <h3>Nuevo tareo</h3>
                    <button class="modal-close" onclick="closeModal()">✕</button>
                </div>

                <div class="modal-body">

                    <div class="grid grid-2">

                        <div class="field-sm">
                            <label>Área</label>
                            <select id="tareo-nuevo-area">
                                ${editables.map(item => `
                                    <option value="${item}" ${item === areaInicial ? 'selected' : ''}>
                                        ${item}
                                    </option>
                                `).join('')}
                            </select>
                        </div>

                        <div class="field-sm">
                            <label>Turno</label>
                            <select id="tareo-nuevo-turno">
                                <option value="Día">Día</option>
                                <option value="Noche">Noche</option>
                            </select>
                        </div>

                        <div class="field-sm">
                            <label>Fecha</label>
                            <input
                                type="date"
                                id="tareo-nuevo-fecha"
                                value="${obtenerFechaHoy()}"
                            >
                        </div>

                    </div>

                    <p class="small-muted" style="margin:12px 0 0;">
                        Si ya existe el tareo de esa área, fecha y turno,
                        se abre el mismo (no se crea uno duplicado).
                    </p>

                    <div class="actions-row">
                        <button class="btn btn-primary" onclick="tareoConfirmarNuevo()">
                            Abrir tareo
                        </button>
                    </div>

                </div>

            </div>
        </div>
    `;
}


function tareoConfirmarNuevo() {

    const area =
        document.getElementById('tareo-nuevo-area')?.value;

    const turno =
        document.getElementById('tareo-nuevo-turno')?.value;

    const fecha =
        document.getElementById('tareo-nuevo-fecha')?.value;

    closeModal();

    tareoAbrir(area, fecha, turno);
}


function tareoGenerarIdDeterministico(area, fecha, turno) {

    return (
        'TAR-' +
        (area === 'Mantenimiento' ? 'MAN' : 'PRO') +
        '-' + fecha +
        '-' + (normalizarTurno(turno) === 'Noche' ? 'N' : 'D')
    );
}


/*
   Abre el tareo de un área / fecha / turno. Si todavía no
   existe, lo crea con el personal del área (todos "sin
   registrar"). El identificador es siempre el mismo para la
   misma combinación, así que dos supervisores que lo abran
   a la vez terminan en el MISMO tareo, no en dos.
*/

/* =========================================================
   SINCRONIZAR TAREO EXISTENTE CON ROTACIÓN SEMANAL
   =========================================================
   Si la rotación cambia después de haberse creado el tareo,
   actualizamos la nómina sin borrar asistencia/horas ya
   registradas de las personas que continúan en el turno.
*/
function tareoSincronizarConRotacion(tareo) {

    if (!tareo || tareoAreaDe(tareo) !== 'Producción') {
        return tareo;
    }

    const resultado = obtenerPersonalPorRotacion(
        tareo.fecha,
        tareo.turno
    );

    if (!resultado.tieneRotacion || !resultado.rotacion) {
        return tareo;
    }

    const normalNombre = persona =>
        tareoNormalizarTexto(persona?.nombre || '')
            .replace(/\s+/g, ' ')
            .trim();

    const porId = new Map();
    const porDni = new Map();
    const porNombre = new Map();

    (tareo.personal || []).forEach(persona => {

        const id = String(persona?.trabajadorId ?? persona?.id ?? '').trim();
        const dni = tareoNormalizarDNI(persona?.dni || '');
        const nombre = normalNombre(persona);
        const firmaNombre = tareoFirmaNombreMigracion(persona?.nombre || '');

        if (id) {
            if (!porId.has(id)) porId.set(id, []);
            porId.get(id).push(persona);
        }

        if (dni) {
            if (!porDni.has(dni)) porDni.set(dni, []);
            porDni.get(dni).push(persona);
        }

        if (nombre) {
            if (!porNombre.has(nombre)) porNombre.set(nombre, []);
            porNombre.get(nombre).push(persona);
        }

        if (firmaNombre) {
            const claveFirma = 'FIRMA:' + firmaNombre;
            if (!porNombre.has(claveFirma)) porNombre.set(claveFirma, []);
            porNombre.get(claveFirma).push(persona);
        }
    });

    const puntajeRegistro = persona => {
        let puntos = 0;
        if (tareoEstadoCanonico(persona?.asistencia)) puntos += 100;
        if (persona?.horaIngreso) puntos += 20;
        if (persona?.salidaRefrigerio) puntos += 5;
        if (persona?.retornoRefrigerio) puntos += 5;
        if (persona?.horaSalida) puntos += 20;
        puntos += Number(persona?.horasTrabajadas || 0);
        puntos += Number(persona?.horasExtras || 0);
        puntos += Number(persona?.actualizadoEn || 0) / 1e15;
        return puntos;
    };

    const mejorAnterior = trabajador => {

        const id = String(
            trabajador?.trabajadorId ?? trabajador?.id ?? ''
        ).trim();

        const dni = tareoNormalizarDNI(trabajador?.dni || '');
        const nombre = normalNombre(trabajador);

        let candidatos = [];

        if (id && porId.has(id)) {
            candidatos = porId.get(id);
        } else if (dni && porDni.has(dni)) {
            candidatos = porDni.get(dni);
        } else if (nombre && porNombre.has(nombre)) {
            candidatos = porNombre.get(nombre);
        } else {
            const firma =
                tareoFirmaNombreMigracion(
                    trabajador?.nombre || ''
                );

            const claveFirma =
                'FIRMA:' + firma;

            if (firma && porNombre.has(claveFirma)) {
                /*
                   Solo para migrar tareos antiguos:
                   "LUIS MANUEL PACHECO MIERES" y
                   "PACHECO MIERES LUIS MANUEL" apuntan a la
                   misma asistencia. La fila final conserva el
                   nombre/puesto del Excel.
                */
                candidatos =
                    porNombre.get(
                        claveFirma
                    );
            }
        }

        if (!candidatos.length) return null;

        return [...candidatos].sort(
            (a, b) => puntajeRegistro(b) - puntajeRegistro(a)
        )[0];
    };

    const vistos = new Set();

    // Quitadas del tareo (personal que ya no trabaja): la rotación Excel no las vuelve a traer.
    const excluidaRot = window.TareoEd ? window.TareoEd.filtroExclusion(tareo) : () => false;

    const nuevoPersonal = resultado.personal
        .filter(trabajador => {

            if (excluidaRot(trabajador)) return false;

            const clave =
                String(trabajador.trabajadorId || '').trim() ||
                ('NOMBRE:' + normalNombre(trabajador));

            if (!clave || vistos.has(clave)) return false;

            vistos.add(clave);
            return true;
        })
        .map(trabajador => {

            const nueva =
                tareoNuevaPersona(
                    trabajador,
                    'Producción'
                );

            const anterior =
                mejorAnterior(trabajador);

            if (!anterior) {
                return nueva;
            }

            return {
                ...nueva,

                /*
                   Solo se conservan datos OPERATIVOS del tareo.
                   Nombre, puesto, turno e identidad siguen viniendo
                   exclusivamente de la rotación Excel.
                */
                asistencia:
                    anterior.asistencia || '',

                horaIngreso:
                    anterior.horaIngreso || '',

                salidaRefrigerio:
                    anterior.salidaRefrigerio || '',

                retornoRefrigerio:
                    anterior.retornoRefrigerio || '',

                refrigerio:
                    Number(anterior.refrigerio || 0),

                horaSalida:
                    anterior.horaSalida || '',

                horasTrabajadas:
                    Number(anterior.horasTrabajadas || 0),

                horasExtras:
                    Number(anterior.horasExtras || 0),

                tardanzaMinutos:
                    Number(anterior.tardanzaMinutos || 0),

                observacion:
                    anterior.observacion || '',

                actualizadoEn:
                    Number(anterior.actualizadoEn || 0),

                /* Campos de maquinistas: se conservan al sincronizar con la rotación Excel. */
                ...(anterior.origenMaquinista ? { origenMaquinista: anterior.origenMaquinista } : {}),
                ...(anterior.trabajoEnDescanso ? { trabajoEnDescanso: true } : {}),
                ...(anterior.salidaEditada
                    ? {
                        salidaEditada: true,
                        salidaOriginal: anterior.salidaOriginal || '',
                        edicionesSalida: anterior.edicionesSalida || []
                    }
                    : {})
            };
        });

    // Maquinistas agregados por la rotación de maquinistas (no están en el Excel).
    (tareo.personal || []).forEach(previa => {

        if (
            previa &&
            (previa.origenMaquinista === 'ROT_MAQ' || previa.trabajoEnDescanso || previa.agregadoManual) &&
            !nuevoPersonal.some(n => tareoMismaPersonaFlexible(n, previa))
        ) {
            nuevoPersonal.push(previa);
        }
    });

    /*
       IMPORTANTE:
       No se arrastran filas antiguas que no existan en el Excel.
       Así un tareo viejo creado desde "Trabajadores" queda depurado
       y la nómina visible coincide 1:1 con la rotación del turno.
    */
    tareo.personal =
        ordenarPersonalTareo(
            nuevoPersonal
        );

    tareo.rotacionId =
        resultado.rotacion.id;

    tareo.fuentePersonal =
        'ROTACION_EXCEL';

    /*
       Marca explícita de limpieza. guardarTareoEnMemoria() vuelve
       a actualizar actualizadoEn justo antes de enviarlo a Firestore.
    */
    tareo.depurarPersonalTrabajadores =
        true;

    tareo.actualizadoEn =
        Date.now();

    guardarTareoEnMemoria(tareo);

    return tareo;
}


/*
   Tareo de Mantenimiento ya creado: agrega al personal de Mantenimiento
   que todavía no figura (por ejemplo el Supervisor de Mantenimiento) y
   elimina repetidos. NO toca la asistencia ya registrada ni agrega
   maquinistas (esos llegan como espejo desde Producción).
*/
function tareoSincronizarPersonalMantenimiento(tareo) {

    if (!tareo || tareoAreaDe(tareo) !== 'Mantenimiento') return tareo;

    if (!tareoAutorizadoEscribir('Mantenimiento')) return tareo;

    const actuales = tareo.personal || [];

    const unicos = window.TareoEd ? window.TareoEd.deduplicarPersonal(actuales) : tareoDeduplicarPersonas(actuales);

    const identidades = new Set(unicos.flatMap(tareoIdentidades));

    const excluidaMtto = window.TareoEd ? window.TareoEd.filtroExclusion(tareo) : () => false;

    const nuevos = tareoPersonalMantenimientoTurno(tareo.fecha, normalizarTurno(tareo.turno) || 'Día')
        .filter(
            trabajador =>
                !excluidaMtto(trabajador) &&
                !tareoIdentidades(trabajador).some(clave => identidades.has(clave))
        )
        .map(trabajador => tareoNuevaPersona(trabajador, 'Mantenimiento'));

    if (!nuevos.length && unicos.length === actuales.length) return tareo;

    tareo.personal = ordenarPersonalTareo([...unicos, ...nuevos]);

    guardarTareoEnMemoria(tareo);

    return tareo;
}


function tareoAbrir(area, fecha, turno) {

    // Al abrir un tareo el orden por asistencia se calcula de nuevo (dentro de la sesión de edición queda fijo).
    if (window.TareoEd) window.TareoEd.resetVista();

    if (!tareoAreasEditables().includes(area)) {

        alert(
            'No tienes permiso para registrar el Tareo de ' + area + '.'
        );

        return;
    }

    if (!fecha) {

        alert('Elige una fecha.');

        return;
    }

    const turnoTareo = normalizarTurno(turno) || 'Día';

    const existente = tareoBuscar(area, fecha, turnoTareo);

    if (existente) {

        const tareoActualizado =
            area === 'Producción'
                ? tareoSincronizarConRotacion(existente)
                : tareoSincronizarPersonalMantenimiento(existente);

        tareoActualId = tareoActualizado.id;

        renderTareoFormulario(tareoActualizado);

        return;
    }

    let rotacionId = null;

    if (area === 'Producción') {

        const resultado =
            obtenerPersonalPorRotacion(
                fecha,
                turnoTareo
            );

        if (!resultado.tieneRotacion || !resultado.rotacion) {

            alert(
                'No hay rotación cargada para esta fecha.'
            );

            return;
        }

        if (
            resultado.personal.length === 0
        ) {

            alert(
                'La rotación vigente no tiene personal asignado al turno ' +
                turnoTareo + ' para esta fecha.'
            );

            return;
        }

        rotacionId = resultado.rotacion.id;
    }

    const personal =
        crearPersonalTareo(
            fecha,
            turnoTareo,
            area
        );

    if (!personal.length) {

        alert(
            area === 'Mantenimiento'
                ? 'No hay personal activo de Mantenimiento. Registra trabajadores con un cargo de mantenimiento (por ejemplo "Técnico de Mantenimiento") en Gestionar trabajadores.'
                : 'No hay personal asignado en la rotación vigente para este turno.'
        );

        return;
    }

    const tareo = {

        id:
            tareoGenerarIdDeterministico(
                area,
                fecha,
                turnoTareo
            ),

        area,

        fecha,

        turno: turnoTareo,

        horaProgramadaIngreso:
            turnoTareo === 'Noche'
                ? '19:00'
                : '07:00',

        jornadaNormal:
            8,

        estado:
            'Abierto',

        observaciones:
            '',

        rotacionId,

        fuentePersonal:
            area === 'Producción'
                ? 'ROTACION_EXCEL'
                : 'TRABAJADORES_MANTENIMIENTO',

        creadoPor:
            (state.user && state.user.username) || '',

        configActualizadoEn:
            Date.now(),

        personal

    };

    guardarTareoEnMemoria(
        tareo
    );

    tareoActualId =
        tareo.id;

    renderTareoFormulario(
        tareo
    );
}


/* =========================================================
   FORMULARIO
   ========================================================= */

function renderTareoFormulario(tareo) {

    const main =
        document.getElementById('main');

    if (!main) return;

    tareoActualId =
        tareo.id;

    /* Quien no gestiona esta área solo puede verla. */

    if (!tareoPuedeEditar(tareo)) {

        renderTareoLectura(tareo);

        return;
    }

    const area = tareoAreaDe(tareo);

    // Maquinistas según la rotación de maquinistas (bloque aparte).
    tareoSincronizarMaquinistas(tareo);

    const maqCtx = tareoMaquinistasContexto(tareo);

    const personal = tareoPersonalSinMaquinistas(tareo, maqCtx);

    const rotacion =
        area === 'Producción'
            ? obtenerRotacionVigente(tareo.fecha)
            : null;

    const c = tareoContadores(personal, tareo.jornadaNormal);

    const filtro = tareoNormalizarTexto(tareoFiltroTexto);

    /*
       Orden estable de la vista: las filas NO se mueven mientras el supervisor marca varias personas o escribe una hora. El orden por
       asistencia se vuelve a aplicar con el botón «Ordenar» o al reabrir el tareo. «completo» es el tareo con TODAS las personas
       (en Mantenimiento la pantalla recibe una copia sin maquinistas).
    */
    const completo = obtenerTareos().find(t => t.id === tareo.id) || tareo;

    const personalVista = window.TareoEd
        ? window.TareoEd.ordenarVista(tareo, personal)
        : personal;

    if (window.TareoEd) {

        window.TareoEd.registrarRender(completo);

        const ksCompleto = window.TareoEd.clavesUnicas(completo.personal || []);

        window.TareoEd.setClaveMain(
            (completo.personal || [])
                .map((p, i) => personal.includes(p) ? ksCompleto[i] : null)
                .filter(Boolean)
        );
    }

    const scrollY = window.scrollY;
    const scrollMain = main.scrollTop;

    main.innerHTML = `

        <div class="main-head" id="tareo-form-view">

            <div>

                <h2>Tareo de ${escaparHTML(area)}</h2>

                <div class="sub">
                    ${formatearFecha(tareo.fecha)}
                    · Turno ${escaparHTML(tareo.turno)}
                    <span class="tar2-live">En vivo</span>
                    <span id="tareo-estado-guardado" class="tareo-guardado" role="status" aria-live="polite"></span>
                </div>

            </div>

            <button
                class="btn btn-ghost"
                onclick="renderTareoPrincipal()"
            >
                ← Volver
            </button>

        </div>

        ${tareoAlertasSalidaHTML(tareo)}

        <div class="tareo-kpi-grid">

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Registrados</span>
                <strong>${c.registrados}/${c.total}</strong>
                <small>${c.pendientes} pendientes</small>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Presentes</span>
                <strong class="tareo-good">${c.asistieron}</strong>${c.enComision ? '<small>' + c.enComision + ' en comisión externa</small>' : ''}
                
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Tardanzas</span>
                <strong class="${c.tardanzas ? 'tareo-warn' : ''}">${c.tardanzas}</strong>
                <small>Ingreso después de la hora programada</small>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Ausencias / descansos</span>
                <strong>${c.ausencias}</strong>
                <small>Faltas, descansos, vacaciones</small>
            </div>

        </div>


        <div class="panel tareo-config-panel">

            <div class="panel-head">

                <h3>Configuración del turno</h3>

                ${
                    area === 'Producción'
                        ? (
                            rotacion
                                ? '<span class="tareo-rotation-active">ROTACIÓN VIGENTE</span>'
                                : '<span class="tareo-rotation-pending">SIN ROTACIÓN</span>'
                        )
                        : tareoInsigniaArea(area)
                }

            </div>

            <div class="panel-body">

                <div class="grid grid-4">

                    <div class="field-sm">
                        <label>Fecha</label>
                        <input
                            type="date"
                            id="tareo-fecha"
                            value="${escaparHTML(tareo.fecha)}"
                            disabled
                        >
                    </div>

                    <div class="field-sm">
                        <label>Turno</label>
                        <select id="tareo-turno" disabled>
                            <option value="Día" ${tareo.turno === 'Día' ? 'selected' : ''}>Día</option>
                            <option value="Noche" ${tareo.turno === 'Noche' ? 'selected' : ''}>Noche</option>
                        </select>
                    </div>

                    <div class="field-sm">
                        <label>Hora programada</label>
                        <input
                            type="time"
                            id="tareo-hora-programada"
                            value="${escaparHTML(tareo.horaProgramadaIngreso)}"
                            onchange="tareoActualizarConfig()"
                        >
                    </div>

                    <div class="field-sm">
                        <label>Jornada normal</label>
                        <input
                            type="number"
                            id="tareo-jornada"
                            min="1"
                            max="24"
                            step="0.5"
                            value="${Number(tareo.jornadaNormal || 8)}"
                            onchange="tareoActualizarConfig()"
                        >
                    </div>

                </div>

                <div class="tareo-rotation-note">

                    ${
                        area === 'Producción' && !rotacion
                            ? `
                            <span>
                                ⚠ No existe una rotación semanal vigente para esta fecha.
                            </span>

                            <button
                                type="button"
                                class="btn btn-sm btn-ghost"
                                onclick="renderRotacionSemanal()"
                            >
                                Cargar rotación
                            </button>
                            `
                            : `
                            <span>
                                ${
                                    area === 'Producción'
                                        ? `✓ Rotación: <strong>${formatearFecha(rotacion.fechaInicio)} — ${formatearFecha(rotacion.fechaFin)}</strong>`
                                        : 'Personal: técnicos activos de mantenimiento'
                                }
                            </span>

                            <span>
                                Personal cargado:
                                <strong>${personal.length}</strong>
                                ${maqCtx.tiene ? ` · Maquinistas: <strong>${maqCtx.filas.length}</strong>` : ''}
                            </span>
                            `
                    }

                </div>

            </div>

        </div>


        <div class="panel">

            <div class="panel-head">

                <div>

                    <h3>Personal</h3>

                    <div class="small-muted">
                        Marca ASISTIÓ al llegar: la hora de ingreso se registra sola.
                        Toca un nombre para ver su ficha.
                    </div>

                </div>

                <div class="tar2-quick">

                    <input
                        type="search"
                        placeholder="Buscar nombre o DNI..."
                        value="${escaparHTML(tareoFiltroTexto)}"
                        oninput="tareoFiltrarPersonal(this.value)"
                    >

                    <button
                        class="btn btn-ghost btn-sm"
                        onclick="tareoAbrirAgregarPersonal()"
                    >
                        + Agregar personal
                    </button>

                    <button
                        class="btn btn-ghost btn-sm"
                        type="button"
                        title="Vuelve a ordenar por asistencia (las filas no se mueven solas mientras registras)"
                        onclick="window.TareoEd && TareoEd.reordenarVista()"
                    >
                        ↕ Ordenar
                    </button>

                    <span class="tareo-count-badge">
                        ${personal.length} personas
                    </span>

                </div>

            </div>


            <div class="panel-body tareo-table-panel">

                <div class="tareo-table-scroll">

                    <table class="tareo-table tareo-edit-table">

                        <thead>

                            <tr>
                                <th>#</th>
                                <th>Trabajador</th>
                                <th>Cargo</th>
                                <th>Línea</th>
                                <th>Asistencia</th>
                                <th>Ingreso</th>
                                <th>Salida refrigerio</th>
                                <th>Retorno refrigerio</th>
                                <th>Salida</th>
                                <th>Horas</th>
                                <th>HORAS EXTRAS</th>
                                <th>Tardanza</th>
                            </tr>

                        </thead>

                        <tbody>

                            ${personalVista.map(
                                (persona, index) =>
                                    renderFilaPersonalTareo(
                                        persona,
                                        index,
                                        tareo.id,
                                        filtro,
                                        completo.personal
                                    )
                            ).join('')}

                        </tbody>

                    </table>

                </div>

            </div>

        </div>


        ${window.TareoEd ? window.TareoEd.htmlQuitados(completo) : ''}

        ${maqCtx.tiene ? tareoBloqueMaquinistasHTML(tareo, maqCtx) : ''}

        ${tareoSeccionPorDiaHTML(tareo, true)}


        <div class="panel">

            <div class="panel-head">
                <h3>Observaciones</h3>
            </div>

            <div class="panel-body">

                <textarea
                    id="tareo-observaciones"
                    class="tareo-observaciones"
                    rows="3"
                    placeholder="Ingrese observaciones del turno..."
                    onchange="tareoActualizarConfig()"
                >${escaparHTML(tareo.observaciones || '')}</textarea>

            </div>

        </div>


        <div class="actions-row tareo-actions">

            <button
                class="btn btn-ghost"
                onclick="renderTareoPrincipal()"
            >
                Volver
            </button>

            <button
                class="btn btn-ghost"
                onclick="wspEnviarTareo(tareoActualId)"
            >
                📲 Enviar por WhatsApp
            </button>

            <button
                class="btn btn-primary"
                onclick="guardarTareoActual()"
            >
                Guardar Tareo
            </button>

        </div>

    `;

    window.scrollTo(0, scrollY);
    main.scrollTop = scrollMain;

    if (window.TareoEd) window.TareoEd.pintarEstados();
}


/* Buscador: oculta filas sin volver a dibujar (no pierde el cursor). */

function tareoFiltrarPersonal(valor) {

    tareoFiltroTexto = valor || '';

    const filtro = tareoNormalizarTexto(tareoFiltroTexto);

    document.querySelectorAll('tr[data-tareo-buscar]').forEach(fila => {

        fila.style.display =
            !filtro ||
            fila.getAttribute('data-tareo-buscar').includes(filtro)
                ? ''
                : 'none';
    });
}


/* Vuelve a dibujar el formulario cuando otro equipo cambió el tareo. */

function tareoRefrescarFormularioRemoto() {

    if (!document.getElementById('tareo-form-view')) return;

    /*
       Con 45-tareo-edicion-continua.js los cambios de otros equipos se reflejan fila por fila (sin reconstruir la pantalla, sin perder
       foco, búsqueda ni desplazamiento). Solo si cambió la estructura (personas nuevas o quitadas) se vuelve a dibujar, y
       únicamente cuando no hay un campo en uso ni cambios sin confirmar.
    */
    if (window.TareoEd) {

        const actual = tareoObtenerActual();

        if (!actual) return;

        if (window.TareoEd.sincronizarVista(actual)) return;

        if (
            window._tareoEscriturasPendientes > 0 ||
            window.TareoEd.campoActivo() ||
            window.TareoEd.hayPendientes()
        ) {
            return;
        }

        renderTareoFormulario(actual);

        return;
    }

    if (window._tareoEscriturasPendientes > 0) return;

    const main = document.getElementById('main');

    const activo = document.activeElement;

    if (
        main && activo && main.contains(activo) &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(activo.tagName)
    ) {
        return;
    }

    const tareo = tareoObtenerActual();

    if (!tareo) return;

    renderTareoFormulario(tareo);
}


/* =========================================================
   AGREGAR PERSONAL A UN TAREO
   ========================================================= */

/* =========================================================
   MAQUINISTAS · rotación, bloque del Tareo de Producción y
   edición de SALIDA por Mantenimiento
   =========================================================
   - Los maquinistas siguen guardándose en tareo.personal (misma
     estructura de siempre), así Mantenimiento los refleja sin duplicar.
   - La rotación de maquinistas vive en sync/rotacionMaquinistas
     (33-rotacion-maquinistas.js) y decide quién aparece en cada turno.
   - Campos nuevos por persona: origenMaquinista, trabajoEnDescanso,
     salidaEditada, salidaOriginal, edicionesSalida[].
*/

function tareoEsMaquinista(persona) {

    if (!persona) return false;

    if (typeof tareoEsMaquinistaEquipo === 'function') {
        return tareoEsMaquinistaEquipo(persona.cargo || '');
    }

    return /\bmaquinista/.test(tareoNormalizarTexto(persona.cargo));
}

/* Misma persona por DNI/ID o, si faltan, por nombre. */
function tareoMismaPersonaFlexible(a, b) {

    const ca = tareoIdentidades(a);
    const cb = tareoIdentidades(b);

    if (ca.some(k => cb.includes(k))) return true;

    const na = tareoNormalizarTexto(a && a.nombre).replace(/\s+/g, ' ');
    const nb = tareoNormalizarTexto(b && b.nombre).replace(/\s+/g, ' ');

    return !!na && na === nb;
}

function tareoMaquinistasContexto(tareo) {

    const vacio = { tiene: false, filas: [], descanso: [], total: 0 };

    if (
        !tareo ||
        tareoAreaDe(tareo) !== 'Producción' ||
        typeof rotacionMaquinistasDia !== 'function'
    ) {
        return vacio;
    }

    const r = rotacionMaquinistasDia(tareo.fecha, tareo.turno);

    if (!r.tieneRotacion) return vacio;

    const personal = tareo.personal || [];

    const buscar = p => personal.find(x => tareoMismaPersonaFlexible(x, p));

    const filas = [];
    const descanso = [];

    r.trabajan.forEach(p => {
        const fila = buscar(p);
        if (fila) filas.push(fila);
    });

    r.descansan.forEach(p => {

        const fila = buscar(p);

        if (
            fila &&
            (fila.trabajoEnDescanso || tareoEstadoCanonico(fila.asistencia) === 'Asistió')
        ) {
            filas.push(fila);
        } else {
            descanso.push(p);
        }
    });

    return {
        tiene: true,
        filas,
        descanso,
        total: filas.length,
        enRotacion: [...r.trabajan, ...r.descansan]
    };
}

/* Personal de planilla sin los maquinistas que maneja el bloque aparte. */
function tareoPersonalSinMaquinistas(tareo, ctx) {

    if (!ctx || !ctx.tiene) return tareo.personal || [];

    return (tareo.personal || []).filter(
        p => !ctx.enRotacion.some(m => tareoMismaPersonaFlexible(m, p))
    );
}

/* Agrega al tareo a los maquinistas que tocan según la rotación (sin duplicar). */
function tareoSincronizarMaquinistas(tareo) {

    if (
        !tareo ||
        tareoAreaDe(tareo) !== 'Producción' ||
        typeof rotacionMaquinistasDia !== 'function' ||
        !tareoAutorizadoEscribir('Producción')
    ) {
        return;
    }

    const r = rotacionMaquinistasDia(tareo.fecha, tareo.turno);

    if (!r.tieneRotacion) return;

    tareo.personal = tareo.personal || [];

    let cambio = false;

    const excluidaMaq = window.TareoEd ? window.TareoEd.filtroExclusion(tareo) : () => false;

    r.trabajan.forEach(m => {

        if (excluidaMaq(m)) return;

        if (tareo.personal.some(x => tareoMismaPersonaFlexible(x, m))) return;

        const persona = tareoNuevaPersona({
            trabajadorId: m.trabajadorId,
            nombre: m.nombre,
            dni: m.dni,
            cargo: 'Maquinista de Producción',
            linea: m.linea
        }, 'Producción');

        persona.origenMaquinista = 'ROT_MAQ';

        tareo.personal.push(persona);

        cambio = true;
    });

    if (cambio) {

        tareo.personal = ordenarPersonalTareo(tareo.personal);

        guardarTareoEnMemoria(tareo);
    }
}

function tareoTrabajoEnDescanso(clave) {

    const tareo = tareoObtenerActual();

    if (!tareo || !tareoPuedeEditar(tareo)) return;

    const r = rotacionMaquinistasDia(tareo.fecha, tareo.turno);

    const m = r.descansan.find(p => tareoIdentidades(p).includes(clave));

    if (!m) return;

    tareo.personal = tareo.personal || [];

    let persona = tareo.personal.find(x => tareoMismaPersonaFlexible(x, m));

    if (!persona) {

        persona = tareoNuevaPersona({
            trabajadorId: m.trabajadorId,
            nombre: m.nombre,
            dni: m.dni,
            cargo: 'Maquinista de Producción',
            linea: m.linea
        }, 'Producción');

        tareo.personal.push(persona);
    }

    persona.origenMaquinista = 'ROT_MAQ';
    persona.trabajoEnDescanso = true;
    persona.actualizadoEn = tareoAhoraMs();

    tareo.personal = ordenarPersonalTareo(tareo.personal);

    guardarTareoEnMemoria(tareo);

    renderTareoFormulario(tareo);
}

function tareoBloqueMaquinistasHTML(tareo, ctx) {

    const filas = ctx.filas;

    return `
        <div class="panel" id="tareo-maquinistas-panel">

            <div class="panel-head">
                <div>
                    <h3>Maquinistas</h3>
                    <div class="small-muted">
                        Según la rotación de maquinistas de esta semana. No se suman al personal de Producción.
                    </div>
                </div>
                <span class="tareo-count-badge">Maquinistas: ${filas.length}</span>
            </div>

            <div class="panel-body tareo-table-panel">
                <div class="tareo-table-scroll">
                    <table class="tareo-table tareo-edit-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Trabajador</th>
                                <th>Cargo</th>
                                <th>Línea</th>
                                <th>Asistencia</th>
                                <th>Ingreso</th>
                                <th>Salida refrigerio</th>
                                <th>Retorno refrigerio</th>
                                <th>Salida</th>
                                <th>Horas</th>
                                <th>HORAS EXTRAS</th>
                                <th>Tardanza</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filas.map((persona, i) =>
                                renderFilaPersonalTareo(persona, i, tareo.id, '', tareo.personal)
                            ).join('')}
                            ${ctx.descanso.map((m, i) => `
                                <tr class="tareo-row-no-asistencia">
                                    <td>${filas.length + i + 1}</td>
                                    <td><strong>${escaparHTML(m.nombre)}</strong>
                                        <small>DNI: ${escaparHTML(m.dni || '—')}</small></td>
                                    <td>Maquinista</td>
                                    <td>${escaparHTML(m.linea || 'Sin línea')}</td>
                                    <td colspan="8">
                                        <span class="tar2-chip-descanso">Descanso según rotación</span>
                                        <button type="button" class="tar2-inline-btn"
                                            onclick="tareoTrabajoEnDescanso(${tareoArg(tareoIdentidades(m)[0] || '')})">
                                            Trabajó en descanso
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                            ${!filas.length && !ctx.descanso.length
                                ? '<tr><td colspan="12" class="small-muted">Ningún maquinista programado para este turno.</td></tr>'
                                : ''}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    `;
}

/* ---------- Edición de la hora de SALIDA de maquinistas (Mantenimiento) ---------- */

function tareoPuedeEditarSalidaMaquinistas() {

    if (typeof state === 'undefined' || !state.user) return false;

    if (esUsuarioSoloConsulta(state.user)) return false;

    const permisos = normalizarPermisosUsuario(state.user);

    if (
        permisos === 'todos' ||
        (Array.isArray(permisos) && permisos.includes('editar_salida_maquinistas'))
    ) {
        return true;
    }

    // Supervisor / Jefe de Mantenimiento.
    return typeof puedeGestionarRotacionMtto === 'function' &&
        puedeGestionarRotacionMtto();
}

/* Original tachado + ícono de editado. */
function tareoMarcaSalidaEditada(persona) {

    if (!persona || !persona.salidaEditada) return '';

    const ultima = (persona.edicionesSalida || []).slice(-1)[0] || {};

    const titulo = 'Salida editada por ' +
        (ultima.usuarioNombre || ultima.usuario || 'Mantenimiento') +
        (ultima.motivo ? ': ' + ultima.motivo : '');

    return (
        (persona.salidaOriginal
            ? `<span class="tar2-salida-orig">${escaparHTML(persona.salidaOriginal)}</span>`
            : '') +
        `<span class="tar2-editado" title="${escaparHTML(titulo)}">✎</span>`
    );
}

/* Botón "Editar salida" para quien tiene el permiso (solo maquinistas con salida). */
function tareoBotonEditarSalida(tareo, persona) {

    if (
        !tareoPuedeEditarSalidaMaquinistas() ||
        tareoAreaDe(tareo) !== 'Producción' ||
        !tareoEsMaquinista(persona) ||
        !persona.horaSalida
    ) {
        return '';
    }

    return `<button type="button" class="tar2-inline-btn"
        onclick="tareoEditarSalidaMaquinista(${tareoArg(tareo.id)}, ${tareoArg(tareoClavePersona(persona))})">
        Editar salida</button>`;
}

function tareoEditarSalidaMaquinista(tareoId, clave) {

    if (!tareoPuedeEditarSalidaMaquinistas()) {
        alert('No tienes permiso para editar la salida de maquinistas.');
        return;
    }

    const tareo = obtenerTareos().find(t => t.id === tareoId);

    const persona = tareo && (tareo.personal || []).find(
        p => tareoClavePersona(p) === String(clave)
    );

    if (!persona || !tareoEsMaquinista(persona)) return;

    const root = document.getElementById('modal-root');

    if (!root) return;

    root.innerHTML = `
        <div class="modal-backdrop" onclick="if(event.target===this)closeModal()">
            <div class="modal">
                <div class="modal-head">
                    <h3>Editar salida · ${escaparHTML(persona.nombre)}</h3>
                    <button class="modal-close" onclick="closeModal()">✕</button>
                </div>
                <div class="modal-body">
                    <p class="small-muted" style="margin:0 0 10px;">
                        Salida actual: <strong>${escaparHTML(persona.horaSalida || '—')}</strong>
                        ${persona.salidaOriginal ? ` · Original: ${escaparHTML(persona.salidaOriginal)}` : ''}.
                        Solo se modifica la hora de salida; la original queda guardada.
                    </p>
                    <div class="field-sm">
                        <label>Nueva hora de salida</label>
                        <input type="time" id="tsm-hora" value="${escaparHTML(persona.horaSalida || '')}">
                    </div>
                    <div class="field-sm">
                        <label>Motivo (obligatorio)</label>
                        <textarea id="tsm-motivo" rows="2" maxlength="200"></textarea>
                    </div>
                    <div class="actions-row">
                        <button class="btn btn-primary"
                            onclick="tareoGuardarSalidaMaquinista(${tareoArg(tareoId)}, ${tareoArg(clave)})">
                            Guardar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function tareoGuardarSalidaMaquinista(tareoId, clave) {

    if (!tareoPuedeEditarSalidaMaquinistas()) return;

    const hora = document.getElementById('tsm-hora')?.value || '';
    const motivo = (document.getElementById('tsm-motivo')?.value || '').trim();

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
        alert('Indica una hora de salida válida.');
        return;
    }

    if (!motivo) {
        alert('El motivo es obligatorio.');
        return;
    }

    if (typeof db === 'undefined' || typeof db.runTransaction !== 'function') {
        alert('Sin conexión con la nube. No se pudo guardar.');
        return;
    }

    const referencia = db.collection('sync').doc('tareos');

    try {

        const actualizado = await db.runTransaction(async transaccion => {

            const snap = await transaccion.get(referencia);

            const items = snap.exists && Array.isArray(snap.data().items)
                ? snap.data().items.slice()
                : [];

            const i = items.findIndex(t => t.id === tareoId);

            if (i < 0) throw new Error('No se encontró el tareo.');

            const tareo = JSON.parse(JSON.stringify(items[i]));

            const persona = (tareo.personal || []).find(
                p => tareoClavePersona(p) === String(clave)
            );

            // Solo maquinistas del Tareo de Producción y solo la hora de salida.
            if (!persona || tareoAreaDe(tareo) !== 'Producción' || !tareoEsMaquinista(persona)) {
                throw new Error('Solo se puede editar la salida de maquinistas.');
            }

            const anterior = persona.horaSalida || '';

            if (anterior === hora) throw new Error('La hora no cambió.');

            const ahora = Date.now();

            if (!persona.salidaOriginal) persona.salidaOriginal = anterior;

            persona.edicionesSalida = [
                ...(Array.isArray(persona.edicionesSalida) ? persona.edicionesSalida : []),
                {
                    horaAnterior: anterior,
                    horaNueva: hora,
                    usuario: state.user.username || '',
                    usuarioNombre: state.user.nombre || state.user.username || '',
                    momento: ahora,
                    motivo,
                    vista: false
                }
            ];

            persona.horaSalida = hora;
            persona.salidaEditada = true;
            persona.actualizadoEn = ahora;

            // Recalcula horas trabajadas y saldo con la hora nueva.
            recalcularPersonaTareo(persona, tareo);

            tareo.actualizadoEn = ahora;

            items[i] = tareo;

            transaccion.set(referencia, { items, updatedAt: ahora });

            return tareo;
        });

        // Reflejo inmediato local (el listener en tiempo real lo confirmará).
        const cache = loadTareos();
        const j = cache.findIndex(t => t.id === tareoId);

        if (j >= 0) cache[j] = actualizado;

        closeModal();

        const actual = tareoObtenerActual();

        if (actual) {

            if (tareoPuedeEditar(actual)) renderTareoFormulario(actual);
            else renderTareoLectura(actual);
        }

    } catch (error) {

        alert('No se pudo guardar: ' + (error && error.message ? error.message : error));
    }
}

/* Alertas para el supervisor de Producción: salidas editadas aún no vistas. */
function tareoAlertasSalidaHTML(tareo) {

    if (tareoAreaDe(tareo) !== 'Producción') return '';

    const alertas = [];

    (tareo.personal || []).forEach(persona => {

        const ultima = (persona.edicionesSalida || []).slice(-1)[0];

        if (ultima && !ultima.vista) alertas.push({ persona, ultima });
    });

    return alertas.map(({ persona, ultima }) => `
        <div class="tar2-alerta-salida">
            <span>
                ⚠ Mantenimiento cambió la salida de <strong>${escaparHTML(persona.nombre)}</strong>
                de ${escaparHTML(ultima.horaAnterior || '—')} a ${escaparHTML(ultima.horaNueva)}.
                Motivo: ${escaparHTML(ultima.motivo)}
                <small>(${escaparHTML(ultima.usuarioNombre || ultima.usuario || '')})</small>
            </span>
            <button type="button" class="btn btn-sm btn-ghost"
                onclick="tareoMarcarSalidaVista(${tareoArg(tareoClavePersona(persona))})">Visto</button>
        </div>
    `).join('');
}

function tareoMarcarSalidaVista(clave) {

    const tareo = tareoObtenerActual();

    if (!tareo || !tareoPuedeEditar(tareo)) return;

    const persona = (tareo.personal || []).find(
        p => tareoClavePersona(p) === String(clave)
    );

    const ultima = persona && (persona.edicionesSalida || []).slice(-1)[0];

    if (!ultima) return;

    ultima.vista = true;
    ultima.vistaPor = state.user.nombre || state.user.username || '';
    ultima.vistaEn = Date.now();
    persona.actualizadoEn = tareoAhoraMs();

    guardarTareoEnMemoria(tareo);

    renderTareoFormulario(tareo);
}

window.tareoTrabajoEnDescanso = tareoTrabajoEnDescanso;
window.tareoEditarSalidaMaquinista = tareoEditarSalidaMaquinista;
window.tareoGuardarSalidaMaquinista = tareoGuardarSalidaMaquinista;
window.tareoMarcarSalidaVista = tareoMarcarSalidaVista;
window.tareoPuedeEditarSalidaMaquinistas = tareoPuedeEditarSalidaMaquinistas;
window.tareoMarcaSalidaEditada = tareoMarcaSalidaEditada;


/* =========================================================
   PERSONAL POR DÍA (NO PLANILLA)
   =========================================================
   Se guarda dentro del propio tareo, en el campo NUEVO
   tareo.personalPorDia (arreglo de {id, tipo:'POR DÍA', nombre, dni,
   area, horaIngreso, horaSalida, observacion, ...}). No toca
   tareo.personal, por lo que no suma a "Personal activo", a la
   rotación ni a los contadores de asistencia.
*/

function tareoFusionarPorDia(remoto, local) {

    const mapa = new Map();

    [remoto, local].forEach(tareo =>
        (Array.isArray(tareo && tareo.personalPorDia) ? tareo.personalPorDia : [])
            .forEach(p => {

                if (!p || !p.id) return;

                const previo = mapa.get(p.id);

                if (
                    !previo ||
                    Number(p.actualizadoEn || 0) >= Number(previo.actualizadoEn || 0)
                ) {
                    mapa.set(p.id, p);
                }
            })
    );

    return Array.from(mapa.values());
}

/* Personas por día registradas antes (sugerencias), la más reciente primero. */
function tareoPorDiaPrevios() {

    const mapa = new Map();

    obtenerTareos().forEach(t =>
        (t.personalPorDia || []).forEach(p => {

            if (!p || !p.nombre) return;

            const clave = tareoNormalizarDNI(p.dni) ||
                tareoNormalizarTexto(p.nombre).replace(/\s+/g, ' ');

            const previo = mapa.get(clave);

            if (!previo || Number(p.actualizadoEn || 0) >= Number(previo.actualizadoEn || 0)) {
                mapa.set(clave, p);
            }
        })
    );

    return Array.from(mapa.values()).sort(
        (a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es', { sensitivity: 'base' })
    );
}

function tareoSeccionPorDiaHTML(tareo, editable) {

    const lista = tareoPorDiaActivos(tareo);

    return `
        <div class="panel" id="tareo-por-dia-panel">

            <div class="panel-head">

                <div>
                    <h3>Personal por día (no planilla)</h3>
                    <div class="small-muted">
                        Aparte del personal de planilla: no suma a «Personal activo» ni a los totales de la rotación.
                    </div>
                </div>

                <div class="tar2-quick">
                    ${
                        editable
                            ? `<button class="btn btn-ghost btn-sm" onclick="tareoAbrirAgregarPorDia()">+ Agregar personal por día</button>`
                            : ''
                    }
                    <span class="tareo-count-badge">Por día: ${lista.length}</span>
                </div>

            </div>

            <div class="panel-body tareo-table-panel">
                ${
                    lista.length
                        ? `
                        <div class="tareo-table-scroll">
                            <table class="tareo-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Nombres y apellidos</th>
                                        <th>DNI</th>
                                        <th>Área / línea</th>
                                        <th>Ingreso</th>
                                        <th>Salida</th>
                                        <th>Horas</th>
                                        <th>HORAS EXTRAS</th>
                                        <th>Observación</th>
                                        ${editable ? '<th></th>' : ''}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${lista.map((p, i) => `
                                        <tr>
                                            <td>${i + 1}</td>
                                            <td><strong>${escaparHTML(p.nombre)}</strong>
                                                <small class="tar2-auto" style="color:#8a6d1d">POR DÍA</small></td>
                                            <td>${escaparHTML(p.dni || '—')}</td>
                                            <td>${escaparHTML(p.area || '—')}</td>
                                            ${
                                                editable
                                                    ? `
                                                    <td><input type="time" value="${escaparHTML(p.horaIngreso || '')}"
                                                        onchange="tareoEditarPorDia('${p.id}','horaIngreso',this.value)"></td>
                                                    <td><input type="time" value="${escaparHTML(p.horaSalida || '')}"
                                                        onchange="tareoEditarPorDia('${p.id}','horaSalida',this.value)"></td>
                                                    <td id="tpd-h-${p.id}">${formatearHoras(tareoHorasPorDia(p))} h</td>
                                                    <td id="tpd-s-${p.id}">${tareoSaldoHTML(tareoSaldoHoras(p))}</td>
                                                    <td><input type="text" maxlength="160" value="${escaparHTML(p.observacion || '')}"
                                                        onchange="tareoEditarPorDia('${p.id}','observacion',this.value)"></td>
                                                    <td><button class="btn btn-sm btn-danger" onclick="tareoQuitarPorDia('${p.id}')">Quitar</button></td>
                                                    `
                                                    : `
                                                    <td>${escaparHTML(p.horaIngreso || '—')}</td>
                                                    <td>${escaparHTML(p.horaSalida || '—')}</td>
                                                    <td>${formatearHoras(tareoHorasPorDia(p))} h</td>
                                                    <td>${tareoSaldoHTML(tareoSaldoHoras(p))}</td>
                                                    <td>${escaparHTML(p.observacion || '—')}</td>
                                                    `
                                            }
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        `
                        : '<div class="empty-state"><p>Sin personal por día en este turno.</p></div>'
                }
            </div>

        </div>
    `;
}

function tareoAbrirAgregarPorDia() {

    const tareo = tareoObtenerActual();

    if (!tareo || !tareoPuedeEditar(tareo)) return;

    const root = document.getElementById('modal-root');

    if (!root) return;

    const previos = tareoPorDiaPrevios();

    const areas = tareoAreaDe(tareo) === 'Mantenimiento'
        ? ['Mantenimiento']
        : (typeof LINES !== 'undefined' ? LINES.map(l => l.name) : []);

    root.innerHTML = `
        <div class="modal-backdrop" onclick="if(event.target===this)closeModal()">
            <div class="modal">

                <div class="modal-head">
                    <h3>Agregar personal por día</h3>
                    <button class="modal-close" onclick="closeModal()">✕</button>
                </div>

                <div class="modal-body">

                    <datalist id="tpd-nombres">
                        ${previos.map(p => `<option value="${escaparHTML(p.nombre)}">${escaparHTML(p.dni || '')}</option>`).join('')}
                    </datalist>
                    <datalist id="tpd-dnis">
                        ${previos.filter(p => p.dni).map(p => `<option value="${escaparHTML(p.dni)}">${escaparHTML(p.nombre)}</option>`).join('')}
                    </datalist>
                    <datalist id="tpd-areas">
                        ${areas.map(a => `<option value="${escaparHTML(a)}"></option>`).join('')}
                    </datalist>

                    <div class="field-sm">
                        <label>Nombres y apellidos *</label>
                        <input type="text" id="tpd-nombre" list="tpd-nombres" maxlength="80"
                               autocomplete="off" oninput="tareoAutocompletarPorDia('nombre')">
                    </div>

                    <div class="field-sm">
                        <label>DNI (opcional)</label>
                        <input type="text" id="tpd-dni" list="tpd-dnis" maxlength="12" inputmode="numeric"
                               autocomplete="off" oninput="tareoAutocompletarPorDia('dni')">
                    </div>

                    <div class="field-sm">
                        <label>Área o línea</label>
                        <input type="text" id="tpd-area" list="tpd-areas" maxlength="40" autocomplete="off">
                    </div>

                    <div class="grid grid-2">
                        <div class="field-sm">
                            <label>Hora de ingreso</label>
                            <input type="time" id="tpd-ingreso" value="${tareoHoraActual()}">
                        </div>
                        <div class="field-sm">
                            <label>Hora de salida</label>
                            <input type="time" id="tpd-salida">
                        </div>
                    </div>

                    <div class="field-sm">
                        <label>Observación</label>
                        <input type="text" id="tpd-obs" maxlength="160">
                    </div>

                    <p class="small-muted" style="margin:10px 0 0;">
                        Se guarda como personal «POR DÍA», aparte de la planilla.
                    </p>

                    <div class="actions-row">
                        <button class="btn btn-primary" onclick="tareoAgregarPorDia()">Agregar</button>
                    </div>

                </div>

            </div>
        </div>
    `;

    document.getElementById('tpd-nombre')?.focus();
}

/* Al escribir nombre o DNI, completa los datos de una persona ya registrada antes. */
function tareoAutocompletarPorDia(origen) {

    const nombre = document.getElementById('tpd-nombre');
    const dni = document.getElementById('tpd-dni');
    const area = document.getElementById('tpd-area');

    if (!nombre || !dni) return;

    const previos = tareoPorDiaPrevios();

    const encontrada = origen === 'dni'
        ? previos.find(p => tareoNormalizarDNI(p.dni) && tareoNormalizarDNI(p.dni) === tareoNormalizarDNI(dni.value))
        : previos.find(p => tareoNormalizarTexto(p.nombre) === tareoNormalizarTexto(nombre.value));

    if (!encontrada) return;

    if (origen === 'dni') nombre.value = encontrada.nombre;
    else if (!dni.value) dni.value = encontrada.dni || '';

    if (area && !area.value) area.value = encontrada.area || '';
}

function tareoAgregarPorDia() {

    const tareo = tareoObtenerActual();

    if (!tareo || !tareoPuedeEditar(tareo)) return;

    const nombre = (document.getElementById('tpd-nombre')?.value || '')
        .replace(/\s+/g, ' ').trim();

    const dni = tareoNormalizarDNI(document.getElementById('tpd-dni')?.value);

    if (!nombre) {
        alert('Escribe los nombres y apellidos.');
        return;
    }

    if (dni && !/^\d{8,12}$/.test(dni)) {
        alert('El DNI debe tener solo números (8 dígitos).');
        return;
    }

    const yaEsta = tareoPorDiaActivos(tareo).some(p =>
        (dni && tareoNormalizarDNI(p.dni) === dni) ||
        (!dni && !tareoNormalizarDNI(p.dni) &&
            tareoNormalizarTexto(p.nombre) === tareoNormalizarTexto(nombre))
    );

    if (yaEsta) {
        alert('Esa persona ya está en el personal por día de este turno.');
        return;
    }

    const ahora = Date.now();

    const persona = {
        id: 'pd_' + ahora + '_' + Math.random().toString(36).slice(2, 7),
        tipo: 'POR DÍA',
        nombre,
        dni,
        area: (document.getElementById('tpd-area')?.value || '').trim(),
        horaIngreso: document.getElementById('tpd-ingreso')?.value || tareoHoraActual(),
        horaSalida: document.getElementById('tpd-salida')?.value || '',
        observacion: (document.getElementById('tpd-obs')?.value || '').trim(),
        registradoPor: (state.user && (state.user.nombre || state.user.username)) || '',
        creadoEn: ahora,
        actualizadoEn: ahora
    };

    tareo.personalPorDia = [
        ...(Array.isArray(tareo.personalPorDia) ? tareo.personalPorDia : []),
        persona
    ];

    guardarTareoEnMemoria(tareo);

    closeModal();

    renderTareoFormulario(tareo);
}

function tareoEditarPorDia(id, campo, valor) {

    if (!['horaIngreso', 'horaSalida', 'observacion', 'area'].includes(campo)) return;

    const tareo = tareoObtenerActual();

    if (!tareo || !tareoPuedeEditar(tareo)) return;

    const persona = (tareo.personalPorDia || []).find(p => p.id === id);

    if (!persona) return;

    persona[campo] = valor || '';
    persona.actualizadoEn = tareoAhoraMs();

    guardarTareoEnMemoria(tareo);

    const celda = document.getElementById('tpd-h-' + id);

    if (celda) celda.textContent = formatearHoras(tareoHorasPorDia(persona)) + ' h';
    const celdaSaldo = document.getElementById("tpd-s-" + id);
    if (celdaSaldo) celdaSaldo.innerHTML = tareoSaldoHTML(tareoSaldoHoras(persona));
}

function tareoQuitarPorDia(id) {

    const tareo = tareoObtenerActual();

    if (!tareo || !tareoPuedeEditar(tareo)) return;

    const persona = (tareo.personalPorDia || []).find(p => p.id === id);

    if (!persona) return;

    if (!confirm('¿Quitar a ' + persona.nombre + ' del personal por día de este turno?')) return;

    // Baja lógica: así la eliminación también se refleja al fusionar con otros equipos.
    persona.eliminada = true;
    persona.actualizadoEn = tareoAhoraMs();

    guardarTareoEnMemoria(tareo);

    renderTareoFormulario(tareo);
}

window.tareoAbrirAgregarPorDia = tareoAbrirAgregarPorDia;
window.tareoAgregarPorDia = tareoAgregarPorDia;
window.tareoAutocompletarPorDia = tareoAutocompletarPorDia;
window.tareoEditarPorDia = tareoEditarPorDia;
window.tareoQuitarPorDia = tareoQuitarPorDia;


function tareoAbrirAgregarPersonal() {

    const tareoProduccionActual =
        obtenerTareos().find(item => item.id === tareoActualId);

    if (
        tareoProduccionActual &&
        tareoAreaDe(tareoProduccionActual) === 'Producción'
    ) {

        alert(
            'El personal de Producción se administra únicamente mediante la rotación Excel vigente.'
        );

        return;
    }


    const tareo = tareoObtenerActual();

    if (!tareo || !tareoPuedeEditar(tareo)) return;

    const root =
        document.getElementById('modal-root');

    if (!root) return;

    const yaEstan = new Set(
        (tareo.personal || []).flatMap(tareoIdentidades)
    );

    const candidatos = tareoDeduplicarPersonas((
        typeof loadWorkers === 'function'
            ? loadWorkers()
            : []
    ).filter(
        trabajador =>
            trabajador &&
            tareoNormalizarTexto(trabajador.estado) === 'activo' &&
            !tareoIdentidades(trabajador).some(clave => yaEstan.has(clave))
    )).sort(
        (a, b) => String(a.nombre || '')
            .localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' })
    );

    root.innerHTML = `
        <div class="modal-backdrop" onclick="if(event.target===this)closeModal()">
            <div class="modal">

                <div class="modal-head">
                    <h3>Agregar personal</h3>
                    <button class="modal-close" onclick="closeModal()">✕</button>
                </div>

                <div class="modal-body">

                    ${
                        candidatos.length
                            ? `
                            <div class="field-sm">
                                <label>Trabajador</label>
                                <select id="tareo-agregar-select">
                                    ${candidatos.map(trabajador => `
                                        <option value="${escaparHTML(trabajador.id)}">
                                            ${escaparHTML(trabajador.nombre)}
                                            — ${escaparHTML(trabajador.cargo || 'Sin cargo')}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>

                            <p class="small-muted" style="margin:10px 0 0;">
                                Se agrega solo a este tareo, como pendiente de registrar.
                            </p>

                            <div class="actions-row">
                                <button class="btn btn-primary" onclick="tareoAgregarPersonal()">
                                    Agregar
                                </button>
                            </div>
                            `
                            : `
                            <p class="small-muted" style="margin:0;">
                                No hay más trabajadores activos para agregar.
                            </p>
                            `
                    }

                </div>

            </div>
        </div>
    `;
}


function tareoAgregarPersonal() {

    const tareoProduccionActual =
        obtenerTareos().find(item => item.id === tareoActualId);

    if (
        tareoProduccionActual &&
        tareoAreaDe(tareoProduccionActual) === 'Producción'
    ) {

        alert(
            'El personal de Producción se administra únicamente mediante la rotación Excel vigente.'
        );

        return;
    }


    const tareo = tareoObtenerActual();

    if (!tareo || !tareoPuedeEditar(tareo)) return;

    const id = document.getElementById('tareo-agregar-select')?.value;

    const trabajador = (
        typeof loadWorkers === 'function'
            ? loadWorkers()
            : []
    ).find(item => String(item.id) === String(id));

    if (!trabajador) return;

    // No duplicar a una persona que ya está en este tareo (DNI / ID).
    const yaEsta = new Set(
        (tareo.personal || []).flatMap(tareoIdentidades)
    );

    if (tareoIdentidades(trabajador).some(clave => yaEsta.has(clave))) {

        alert('Esa persona ya está en este tareo.');

        return;
    }

    const persona = tareoNuevaPersona(
        trabajador,
        tareoAreaDe(tareo)
    );

    persona.actualizadoEn = tareoAhoraMs();

    tareo.personal.push(persona);

    tareo.personal = ordenarPersonalTareo(tareo.personal);

    guardarTareoEnMemoria(tareo);

    closeModal();

    renderTareoFormulario(tareo);
}


/* =========================================================
   FILA PERSONAL
   ========================================================= */

function renderFilaPersonalTareo(
    persona,
    index,
    tareoId,
    filtro,
    listaCompleta
) {

    const asistencia =
        tareoEstadoCanonico(persona.asistencia);

    const pendiente = !asistencia;

    const asistio = asistencia === 'Asistió';

    const deshabilitado =
        !asistio
            ? 'disabled'
            : '';

    const tarde =
        Number(persona.tardanzaMinutos || 0) > 0;

    // Clave de la fila: la identificación de la persona o, si se repite en el tareo, con su filaId (ver 45-tareo-edicion-continua.js).
    const claveFila =
        window.TareoEd
            ? window.TareoEd.claveFila(persona, listaCompleta || (obtenerTareos().find(t => t.id === tareoId) || {}).personal)
            : tareoClavePersona(persona);

    const clave =
        tareoArg(claveFila);

    const textoBusqueda =
        tareoNormalizarTexto(
            (persona.nombre || '') + ' ' + (persona.dni || '')
        );

    const oculta =
        filtro && !textoBusqueda.includes(filtro)
            ? 'display:none;'
            : '';

    return `

        <tr
            data-tareo-persona="${index}"
            data-tareo-fila="${escaparHTML(claveFila)}"
            data-tareo-firma="${escaparHTML(window.TareoEd ? window.TareoEd.firma(persona) : '')}"
            data-tareo-buscar="${escaparHTML(textoBusqueda)}"
            style="${oculta}"
            class="${
                pendiente
                    ? 'tar2-row-pendiente'
                    : (!asistio ? 'tareo-row-no-asistencia' : '')
            }"
        >

            <td>
                <span class="tareo-row-number">
                    ${index + 1}
                </span>
            </td>


            <td>

                <div class="tareo-worker">

                    ${tareoBotonNombre(persona, tareoId)}
                    <span class="tar2-est" data-tar2-est role="status" aria-live="polite"></span>
                    ${window.TareoEd && tareoPuedeEditar(obtenerTareos().find(t => t.id === tareoId) || {}) && !esUsuarioSoloConsulta(state.user)
                        ? `<button type="button" class="tar2-quitar" title="Quitar a esta persona del tareo (ya no trabaja)" onclick="TareoEd.quitarPersonal(${clave})">✕ Quitar</button>`
                        : ''}
                    ${persona.trabajoEnDescanso ? '<span class="tar2-chip-descanso tar2-chip-trabajo-desc">Trabajó en descanso</span>' : ''}

                    <small>
                        ${escaparHTML(persona.tipoDocumento || 'DNI')}:
                        ${escaparHTML(persona.dni)}
                    </small>

                </div>

            </td>


            <td>
                ${escaparHTML(persona.cargo)}
            </td>


            <td>
                ${
                    persona.linea
                        ? escaparHTML(persona.linea)
                        : 'Sin línea'
                }
            </td>


            <td>

                <div class="tar2-quick">

                    ${
                        pendiente
                            ? `
                            <button
                                type="button"
                                class="btn btn-primary btn-sm"
                                onclick="tareoMarcarAsistio(${clave})"
                            >
                                ✔ ASISTIÓ
                            </button>
                            `
                            : ''
                    }

                    <select
                        class="tareo-asistencia-select"
                        onchange="actualizarAsistenciaTareo(${clave}, this.value)"
                    >

                        <option value="" ${pendiente ? 'selected' : ''}>
                            PENDIENTE
                        </option>

                        ${TAREO_ESTADOS_ASISTENCIA
                            .map(
                                estado => `
                                <option
                                    value="${escaparHTML(estado)}"
                                    ${asistencia === estado ? 'selected' : ''}
                                >
                                    ${escaparHTML(estado.toUpperCase())}
                                </option>
                                `
                            ).join('')}

                    </select>

                </div>

            </td>


            <td>

                <input
                    type="time"
                    title="${asistio ? 'Puedes corregir manualmente la hora de ingreso' : 'Marca ASISTIÓ para registrar horas'}"
                    value="${escaparHTML(persona.horaIngreso || '')}"
                    ${deshabilitado}
                    onchange="actualizarHoraIngresoTareo(${clave}, this.value)"
                >

                ${
                    asistio && persona.horaIngresoAuto
                        ? '<span class="tar2-auto">registrada al marcar</span>'
                        : ''
                }

            </td>


            <td>
                <div class="tar2-marcacion">
                    <input type="time"
                        value="${escaparHTML(persona.salidaRefrigerio || '')}"
                        ${deshabilitado}
                        onchange="actualizarSalidaRefrigerioTareo(${clave}, this.value)">
                    ${asistio && !persona.salidaRefrigerio ? `
                    <button type="button" class="tar2-action-btn"
                        onclick="tareoSalidaRefrigerioAhora(${clave})">🍽 SALIDA REFRIGERIO</button>` : ''}
                </div>
            </td>

            <td>
                <div class="tar2-marcacion">
                    <input type="time"
                        value="${escaparHTML(persona.retornoRefrigerio || '')}"
                        ${deshabilitado}
                        onchange="actualizarRetornoRefrigerioTareo(${clave}, this.value)">
                    ${asistio && persona.salidaRefrigerio && !persona.retornoRefrigerio ? `
                    <button type="button" class="tar2-action-btn"
                        onclick="tareoRetornoRefrigerioAhora(${clave})">↩ RETORNO</button>` : ''}
                    ${persona.salidaRefrigerio && persona.retornoRefrigerio ? `
                    <span class="tar2-auto">${calcularMinutosRefrigerio(persona.salidaRefrigerio, persona.retornoRefrigerio)} min</span>` : ''}
                </div>
            </td>


            <td>

              <div class="tar2-marcacion">

                <input
                    type="time"
                    value="${escaparHTML(persona.horaSalida || '')}"
                    ${deshabilitado}
                    onchange="actualizarHoraSalidaTareo(${clave}, this.value)"
                >

                ${tareoMarcaSalidaEditada(persona)}

                ${
                    asistio && persona.horaIngreso && !persona.horaSalida
                        ? `
                        <button
                            type="button"
                            class="tar2-inline-btn"
                            title="Registrar la hora actual como salida"
                            onclick="tareoSalidaAhora(${clave})"
                        >
                            🚪 SALIDA
                        </button>
                        `
                        : ''
                }

              </div>

            </td>


            <td>

                <strong class="tareo-hours">
                    ${formatearHoras(persona.horasTrabajadas)}
                </strong>

            </td>


            <td>

                ${tareoSaldoHTML(tareoSaldoHoras(persona, (obtenerTareos().find(t => t.id === tareoId) || {}).jornadaNormal))}

            </td>


            <td>

                <span class="${tarde ? 'tareo-late' : 'tareo-on-time'}">
                    ${
                        tarde
                            ? formatearMinutos(persona.tardanzaMinutos)
                            : (asistio && persona.horaIngreso ? 'A tiempo' : '—')
                    }
                </span>

            </td>

        </tr>

    `;
}


/* =========================================================
   CAMBIAR TURNO
   ========================================================= */

function tareoObtenerActual() {

    return obtenerTareos().find(
        item => item.id === tareoActualId
    ) || null;
}


/*
   Aplica un cambio a UNA persona del tareo abierto, recalcula
   sus horas/tardanza, guarda (en la nube, en el momento) y
   vuelve a dibujar la pantalla.
*/

function tareoEditarPersona(clave, cambiar) {

    const tareo = tareoObtenerActual();

    if (!tareo) return;

    if (!tareoPuedeEditar(tareo)) {

        alert(
            'No tienes permiso para modificar el Tareo de ' + tareoAreaDe(tareo) + '.'
        );

        return;
    }

    /*
       Tareo + persona + campo: la persona se identifica por su clave de fila (id → DNI → nombre; con filaId si se repite), NUNCA por
       posición ni por «la primera coincidencia». Una clave ambigua no se modifica.
    */
    const hallada = window.TareoEd
        ? window.TareoEd.resolver(tareo, clave)
        : { persona: tareo.personal.find(item => tareoClavePersona(item) === String(clave)) };

    if (hallada.ambigua) {

        alert(
            'Hay varias personas con la misma identificación en este tareo y no se puede saber a cuál corresponde este cambio. ' +
            'No se modificó nada. Avisa al administrador para corregir los datos de la persona.'
        );

        return;
    }

    // Clave provisional («|~n»): fila repetida cuyo identificador todavía no se guardó en la nube. Se evita atribuir la marca por orden.
    if (window.TareoEd && String(clave).indexOf('|~') > 0) {

        alert(
            'Se están guardando los identificadores de las filas con el mismo nombre. Vuelve a intentarlo en unos segundos; ' +
            'no se modificó nada.'
        );

        return;
    }

    const persona = hallada.persona;

    if (!persona) return;

    if (!window.TareoEd) {

        cambiar(persona, tareo);

        persona.actualizadoEn = tareoAhoraMs();

        recalcularPersonaTareo(persona, tareo);

        tareo.personal = ordenarPersonalTareo(tareo.personal);

        guardarTareoEnMemoria(tareo);

        renderTareoFormulario(tareo);

        return;
    }

    const Ed = window.TareoEd;

    const antes = Ed.captura(persona);

    cambiar(persona, tareo);

    // Solo lo que cambió de verdad: si el usuario canceló una corrección no queda nada a medias (asistencia, autor o fechas).
    const campos = Ed.diferencias(antes, persona);

    if (!Object.keys(campos).length) {

        Ed.sincronizarVista(tareo, { persona });

        return;
    }

    const ts = Ed.nuevoTs();

    Ed.aplicarMarcas(persona, campos, ts);

    recalcularPersonaTareo(persona, tareo);

    Ed.registrarOp(tareo, persona, campos, ts, clave);

    // No se reordena ni se reconstruye la tabla: el orden se aplica con una acción explícita.
    window._tareoGuardandoOperacion = true;

    try {
        guardarTareoEnMemoria(tareo);
    } finally {
        window._tareoGuardandoOperacion = false;
    }

    if (!Ed.sincronizarVista(tareo, { persona })) {

        // Estructura distinta (personas nuevas o quitadas): solo si no hay un campo en uso.
        if (!Ed.campoActivo()) renderTareoFormulario(tareo);
    }
}


function tareoMarcarAsistio(clave) {
    actualizarAsistenciaTareo(clave, 'Asistió');
}


/*
   Cambia el estado. Al marcar ASISTIÓ se toma la hora actual
   como hora de ingreso (si el tareo es de ahora) y el sistema
   calcula si llegó tarde respecto a la hora programada.
*/

function actualizarAsistenciaTareo(
    clave,
    asistencia
) {

    const estado =
        tareoEstadoCanonico(asistencia);

    tareoEditarPersona(clave, (persona, tareo) => {

        const anterior =
            tareoEstadoCanonico(persona.asistencia);

        // Marcar ASISTIÓ de nuevo (mismo estado) no cambia nada: ni reinicia horas ni reemplaza autor y fecha.
        if (estado === anterior) return;

        persona.asistencia = estado;

        const registradoEnNuevo =
            estado
                ? new Date().toISOString()
                : '';

        const registradoPorNuevo =
            estado
                ? ((state.user && state.user.username) || '')
                : '';

        if (estado === 'Asistió') {

            persona.registradoEn = registradoEnNuevo;
            persona.registradoPor = registradoPorNuevo;

            if (anterior !== 'Asistió') {

                /*
                   Si ya existen horas porque se está corrigiendo un registro,
                   NO las sobrescribimos con la hora actual.
                */
                const yaTieneMarcaciones =
                    Boolean(
                        persona.horaIngreso ||
                        persona.salidaRefrigerio ||
                        persona.retornoRefrigerio ||
                        persona.horaSalida
                    );

                if (!yaTieneMarcaciones) {

                    if (tareoEsEnTiempoReal(tareo)) {

                        persona.horaIngreso = tareoHoraActual();
                        persona.horaIngresoAuto = true;

                    } else {

                        persona.horaIngreso = '';
                        persona.horaIngresoAuto = false;
                    }
                }
            }

            return;
        }

        /*
           CORRECCIÓN DE ASISTENCIA:
           al pasar de ASISTIÓ a otro estado no se borran las horas
           silenciosamente. Se solicita confirmación.
        */
        const tieneMarcaciones =
            Boolean(
                persona.horaIngreso ||
                persona.salidaRefrigerio ||
                persona.retornoRefrigerio ||
                persona.horaSalida
            );

        if (anterior === 'Asistió' && tieneMarcaciones) {

            const limpiar =
                confirm(
                    'Esta persona tiene horas registradas.\n\n' +
                    '¿Deseas cambiar la asistencia a "' +
                    (estado || 'PENDIENTE') +
                    '" y limpiar las horas registradas?'
                );

            if (!limpiar) {

                /*
                   Se cancela la corrección completa.
                   Dejamos el estado anterior para no perder información.
                */
                persona.asistencia = anterior;
                return;
            }
        }

        // Confirmado: recién ahora se registra quién y cuándo (cancelar no deja cambios parciales).
        persona.registradoEn = registradoEnNuevo;
        persona.registradoPor = registradoPorNuevo;

        persona.horaIngreso = '';
        persona.horaIngresoAuto = false;
        persona.salidaRefrigerio = '';
        persona.retornoRefrigerio = '';
        persona.refrigerio = 0;
        persona.horaSalida = '';
        persona.horasTrabajadas = 0;
        persona.horasExtras = 0;
        persona.tardanzaMinutos = 0;
    });
}


/* =========================================================
   ACTUALIZACIONES
   ========================================================= */




function recalcularPersonaTareo(
    persona,
    tareo
) {

    if (
        persona.asistencia !== 'Asistió'
    ) {

        persona.horasTrabajadas = 0;
        persona.horasExtras = 0;
        persona.tardanzaMinutos = 0;

        return;
    }

    const minutosRefrigerio = calcularMinutosRefrigerio(
        persona.salidaRefrigerio,
        persona.retornoRefrigerio
    );
    persona.refrigerio = minutosRefrigerio / 60;

    persona.horasTrabajadas =
        calcularHorasTrabajadas(
            persona.horaIngreso,
            persona.horaSalida,
            persona.refrigerio
        );

    persona.horasExtras =
        calcularHorasExtras(
            persona.horasTrabajadas,
            tareo.jornadaNormal
        );

    persona.tardanzaMinutos =
        calcularTardanza(
            persona.horaIngreso,
            tareo.horaProgramadaIngreso
        );
}


function actualizarHoraIngresoTareo(
    clave,
    hora
) {

    tareoEditarPersona(clave, persona => {

        persona.horaIngreso = hora;

        /* Corregida a mano: ya no es la hora automática. */

        persona.horaIngresoAuto = false;
    });
}


function actualizarRefrigerioTareo(clave, valor) {
    /* Compatibilidad con registros antiguos que guardaban horas de refrigerio. */
    tareoEditarPersona(clave, persona => {
        persona.refrigerio = Number(valor) || 0;
    });
}

function actualizarSalidaRefrigerioTareo(clave, hora) {
    tareoEditarPersona(clave, persona => {
        persona.salidaRefrigerio = hora;
        if (!hora) persona.retornoRefrigerio = '';
    });
}

function actualizarRetornoRefrigerioTareo(clave, hora) {
    tareoEditarPersona(clave, persona => {
        persona.retornoRefrigerio = hora;
    });
}

function tareoSalidaRefrigerioAhora(clave) {
    tareoEditarPersona(clave, persona => {
        persona.salidaRefrigerio = tareoHoraActual();
        persona.retornoRefrigerio = '';
    });
}

function tareoRetornoRefrigerioAhora(clave) {
    tareoEditarPersona(clave, persona => {
        if (!persona.salidaRefrigerio) {
            alert('Primero registra la salida a refrigerio.');
            return;
        }
        persona.retornoRefrigerio = tareoHoraActual();
    });
}

function actualizarHoraSalidaTareo(
    clave,
    hora
) {

    tareoEditarPersona(clave, persona => {

        persona.horaSalida = hora;
    });
}


function tareoSalidaAhora(clave) {
    const tareo = tareoObtenerActual();
    const persona = window.TareoEd
        ? window.TareoEd.resolver(tareo, clave).persona
        : tareo?.personal?.find(item => tareoClavePersona(item) === String(clave));
    if (persona?.salidaRefrigerio && !persona?.retornoRefrigerio) {
        if (!confirm('No se registró el retorno de refrigerio. ¿Registrar SALIDA de todas formas?')) return;
    }
    tareoEditarPersona(clave, personaEditada => {
        personaEditada.horaSalida = tareoHoraActual();
    });
}


/*
   Cambios de configuración del turno (hora programada,
   jornada, observaciones): se guardan al momento y las
   tardanzas / horas ya registradas se recalculan.
*/

function tareoActualizarConfig() {

    const tareo = tareoObtenerActual();

    if (!tareo || !tareoPuedeEditar(tareo)) return;

    tareo.horaProgramadaIngreso =
        document.getElementById('tareo-hora-programada')?.value ||
        tareo.horaProgramadaIngreso;

    tareo.jornadaNormal =
        Number(document.getElementById('tareo-jornada')?.value) || 8;

    tareo.observaciones =
        document.getElementById('tareo-observaciones')?.value || '';

    tareo.configActualizadoEn = Date.now();

    tareo.personal.forEach(persona => {

        const antes =
            persona.tardanzaMinutos + '|' +
            persona.horasTrabajadas + '|' +
            persona.horasExtras;

        recalcularPersonaTareo(persona, tareo);

        const despues =
            persona.tardanzaMinutos + '|' +
            persona.horasTrabajadas + '|' +
            persona.horasExtras;

        if (antes !== despues) {
            persona.actualizadoEn = tareoAhoraMs();
        }
    });

    guardarTareoEnMemoria(tareo);

    renderTareoFormulario(tareo);
}


/* =========================================================
   GUARDAR TAREO
   ========================================================= */

function guardarTareoActual() {

    const tareo =
        tareoObtenerActual();

    if (!tareo) {

        alert(
            'No se encontró el tareo.'
        );

        return;
    }

    if (!tareoPuedeEditar(tareo)) {

        alert(
            'No tienes permiso para modificar este tareo.'
        );

        return;
    }

    /*
       La asistencia ya se va guardando en la nube en el momento
       en que se marca. Este botón guarda además la configuración
       y las observaciones que estén en pantalla.
    */

    tareo.horaProgramadaIngreso =
        document.getElementById('tareo-hora-programada')?.value ||
        tareo.horaProgramadaIngreso;

    tareo.jornadaNormal =
        Number(document.getElementById('tareo-jornada')?.value) || 8;

    tareo.observaciones =
        document.getElementById('tareo-observaciones')?.value || '';

    tareo.configActualizadoEn = Date.now();

    tareo.personal.forEach(persona => {

        const antes =
            persona.tardanzaMinutos + '|' +
            persona.horasTrabajadas + '|' +
            persona.horasExtras;

        recalcularPersonaTareo(persona, tareo);

        const despues =
            persona.tardanzaMinutos + '|' +
            persona.horasTrabajadas + '|' +
            persona.horasExtras;

        if (antes !== despues) {
            persona.actualizadoEn = tareoAhoraMs();
        }
    });

    tareo.personal =
        ordenarPersonalTareo(
            tareo.personal
        );

    tareo.estado =
        'Abierto';

    if (tareoAreaDe(tareo) === 'Producción') {

        const rotacion =
            obtenerRotacionVigente(
                tareo.fecha
            );

        tareo.rotacionId =
            rotacion
                ? rotacion.id
                : null;
    }

    guardarTareoEnMemoria(
        tareo
    );

    alert(
        'Tareo guardado correctamente.'
    );

    renderTareoPrincipal();
}


/* =========================================================
   HISTORIAL
   ========================================================= */

function renderHistorialTareo() {

    const main =
        document.getElementById('main');

    if (!main) return;

    const areasVisibles = tareoAreasVisibles();

    if (
        tareoFiltroAreaHistorial &&
        !areasVisibles.includes(tareoFiltroAreaHistorial)
    ) {
        tareoFiltroAreaHistorial = '';
    }

    const tareos =
        tareoTareosVisibles()
            .filter(
                tareo =>
                    !tareoFiltroAreaHistorial ||
                    tareoAreaDe(tareo) === tareoFiltroAreaHistorial
            )
            .sort(
                (a, b) =>
                    String(b.fecha || '')
                        .localeCompare(String(a.fecha || '')) ||
                    String(a.turno || '')
                        .localeCompare(String(b.turno || ''))
            );

    const puedeCrear = tareoAreasEditables().length > 0;

    main.innerHTML = `

        <div class="main-head" id="tareo-historial-view">

            <div>

                <h2>
                    Historial de Tareo
                </h2>

                <div class="sub">
                    Registros históricos del personal
                </div>

            </div>

            ${
                puedeCrear
                    ? `
                    <button
                        class="btn btn-primary"
                        onclick="nuevoTareo()"
                    >
                        + Nuevo Tareo
                    </button>
                    `
                    : ''
            }

        </div>


        ${tareoRenderTabs('historial')}


        <div class="panel">

            <div class="panel-head">

                <h3>
                    Registros
                </h3>

                <div class="tar2-quick">

                    ${
                        typeof sheetsCantidadPendientes === 'function' && sheetsCantidadPendientes() &&
                        tareoPuedeExportar()
                            ? `<button class="btn btn-sm btn-ghost" onclick="sheetsReenviarPendientes()">Reenviar pendientes a Google Sheets (${sheetsCantidadPendientes()})</button>`
                            : ''
                    }

                    ${
                        areasVisibles.length > 1
                            ? `
                            <select onchange="tareoFiltroAreaHistorial = this.value; renderHistorialTareo();">
                                <option value="">Todas las áreas</option>
                                ${areasVisibles.map(item => `
                                    <option value="${item}" ${tareoFiltroAreaHistorial === item ? 'selected' : ''}>${item}</option>
                                `).join('')}
                            </select>
                            `
                            : ''
                    }

                    <span class="small-muted">
                        ${tareos.length} tareos
                    </span>

                </div>

            </div>

            <div class="panel-body">

                ${
                    tareos.length
                        ? `
                        <div class="tareo-table-scroll">

                            <table class="tareo-table">

                                <thead>

                                    <tr>

                                        <th>Fecha</th>
                                        <th>Área</th>
                                        <th>Turno</th>
                                        <th>Personal</th>
                                        <th>Presentes</th>
                                        <th>Ausencias</th>
                                        <th>Sin registrar</th>
                                        <th>Tardanzas</th>
                                        <th>HORAS EXTRAS</th>
                                        <th>Por día</th>
                                        <th>Acciones</th>

                                    </tr>

                                </thead>

                                <tbody>

                                    ${tareos.map(
                                        tareo => {

                                            const c = tareoContadores(
                                                tareo.personal || []
                                            );

                                            const puedeEditar =
                                                tareoPuedeEditar(tareo);

                                            return `

                                                <tr>

                                                    <td>
                                                        <strong>
                                                            ${formatearFecha(tareo.fecha)}
                                                        </strong>
                                                    </td>

                                                    <td>
                                                        ${tareoInsigniaArea(tareoAreaDe(tareo))}
                                                    </td>

                                                    <td>
                                                        <span class="tareo-shift-badge ${tareo.turno === 'Noche' ? 'night' : 'day'}">
                                                            ${escaparHTML(tareo.turno)}
                                                        </span>
                                                    </td>

                                                    <td>${c.total}</td>

                                                    <td>
                                                        <span class="tareo-number-good">
                                                            ${c.asistieron}
                                                        </span>
                                                    </td>

                                                    <td>${c.ausencias}</td>

                                                    <td>
                                                        ${
                                                            c.pendientes
                                                                ? `<span class="tareo-number-warn">${c.pendientes}</span>`
                                                                : '—'
                                                        }
                                                    </td>

                                                    <td>
                                                        ${
                                                            c.tardanzas
                                                                ? `<span class="tareo-number-warn">${c.tardanzas}</span>`
                                                                : '—'
                                                        }
                                                    </td>

                                                    <td>
                                                        ${tareoSaldoHTML(c.saldo)}
                                                    </td>

                                                    <td>
                                                        ${tareoPorDiaActivos(tareo).length || '—'}
                                                    </td>

                                                    <td>

                                                        <div class="tareo-action-buttons">

                                                            <button
                                                                class="btn btn-sm btn-ghost"
                                                                onclick="verTareo('${tareo.id}')"
                                                            >
                                                                Ver
                                                            </button>

                                                            ${
                                                                puedeEditar
                                                                    ? `
                                                                    <button
                                                                        class="btn btn-sm btn-ghost"
                                                                        onclick="editarTareo('${tareo.id}')"
                                                                    >
                                                                        Editar
                                                                    </button>
                                                                    `
                                                                    : ''
                                                            }

                                                            ${
                                                                tareoPuedeExportar(tareo)
                                                                    ? `
                                                            <button
                                                                class="btn btn-sm btn-primary"
                                                                onclick="exportarTareoExcel('${tareo.id}')"
                                                            >
                                                                Excel
                                                            </button>

                                                            <button
                                                                class="btn btn-sm btn-ghost"
                                                                onclick="exportarTareoPNG('${tareo.id}')"
                                                            >
                                                                PNG
                                                            </button>`
                                                                    : ''
                                                            }

                                                            ${
                                                                tareoPuedeExportar(tareo)
                                                                    ? `
                                                            <button
                                                                class="btn btn-sm btn-ghost"
                                                                onclick="sheetsReenviarTareo('${tareo.id}')"
                                                                title="Enviar a Google Sheets"
                                                            >
                                                                Sheets${
                                                                    typeof sheetsPendiente === 'function' &&
                                                                    sheetsPendiente('tareo', tareo.id)
                                                                        ? ' ⏳ pendiente'
                                                                        : ''
                                                                }
                                                            </button>

                                                            <button
                                                                class="btn btn-sm btn-ghost"
                                                                onclick="wspEnviarTareo('${tareo.id}')"
                                                            >
                                                                WhatsApp
                                                            </button>`
                                                                    : ''
                                                            }

                                                            ${
                                                                (
                                                                    puedeEditar &&
                                                                    (tienePermiso('eliminarRegistros') ||
                                                                    tienePermiso('moduloRRHH'))
                                                                )
                                                                    ? `
                                                                    <button
                                                                        class="btn btn-sm btn-danger"
                                                                        onclick="eliminarTareo('${tareo.id}')"
                                                                    >
                                                                        Eliminar
                                                                    </button>
                                                                    `
                                                                    : ''
                                                            }

                                                        </div>

                                                    </td>

                                                </tr>

                                            `;
                                        }
                                    ).join('')}

                                </tbody>

                            </table>

                        </div>
                        `
                        : `
                        <div class="empty-state">

                            <h4>
                                No hay tareos registrados
                            </h4>

                            <p>
                                Cree el primer tareo para
                                comenzar a registrar asistencia.
                            </p>

                        </div>
                        `
                }

            </div>

        </div>

    `;
}


/* =========================================================
   VER TAREO
   ========================================================= */

function verTareo(id) {

    const tareo =
        obtenerTareos().find(
            item => item.id === id
        );

    if (!tareo) return;

    tareoActualId = id;

    renderTareoLectura(
        tareo
    );
}


function editarTareo(id) {

    const tareo =
        obtenerTareos().find(
            item => item.id === id
        );

    if (!tareo) return;

    if (!tareoPuedeEditar(tareo)) {

        alert(
            'No tienes permiso para modificar el Tareo de ' + tareoAreaDe(tareo) + '.'
        );

        return;
    }

    tareoActualId = id;

    renderTareoFormulario(
        tareo
    );
}


/* =========================================================
   CONFIRMACIÓN PERSONALIZADA PARA ELIMINAR TAREO
   Evita el confirm() nativo ("127.0.0.1:5500 dice") y reutiliza
   el contenedor global #modal-root de GLACIAL.
   ========================================================= */

function confirmarEliminacionTareo(tareo) {

    return new Promise(resolve => {

        const root = document.getElementById('modal-root');

        if (!root) {
            console.error('No se encontró #modal-root para confirmar la eliminación del tareo.');
            resolve(false);
            return;
        }

        const area = tareoAreaDe(tareo);
        const fecha = formatearFecha(tareo.fecha);
        const turno = tareo.turno || '—';

        let resuelto = false;

        const terminar = valor => {

            if (resuelto) return;
            resuelto = true;

            document.removeEventListener('keydown', manejarTecla);
            root.innerHTML = '';
            resolve(valor);
        };

        const manejarTecla = evento => {

            if (evento.key === 'Escape') {
                terminar(false);
            }
        };

        root.innerHTML = `
            <div
                class="modal-backdrop"
                id="tareo-confirm-backdrop"
                role="presentation"
            >
                <div
                    class="modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="tareo-confirm-title"
                    aria-describedby="tareo-confirm-desc"
                    style="max-width:500px;"
                >
                    <div class="modal-head">
                        <h3 id="tareo-confirm-title">
                            Confirmar eliminación
                        </h3>

                        <button
                            type="button"
                            class="modal-close"
                            id="tareo-confirm-close"
                            aria-label="Cerrar"
                        >
                            ✕
                        </button>
                    </div>

                    <div class="modal-body">

                        <div style="text-align:center;padding:8px 8px 4px;">

                            <div
                                aria-hidden="true"
                                style="
                                    width:58px;
                                    height:58px;
                                    margin:0 auto 16px;
                                    display:flex;
                                    align-items:center;
                                    justify-content:center;
                                    border-radius:50%;
                                    background:#fff3e8;
                                    border:1px solid #efc1a8;
                                    color:#b6532d;
                                    font-size:27px;
                                    font-weight:700;
                                "
                            >
                                !
                            </div>

                            <p
                                id="tareo-confirm-desc"
                                style="
                                    margin:0;
                                    color:#344653;
                                    font-size:14px;
                                    line-height:1.6;
                                "
                            >
                                ¿Eliminar el tareo de
                                <strong>${area}</strong>
                                del <strong>${fecha}</strong>
                                (<strong>${turno}</strong>)?
                            </p>

                            <div
                                style="
                                    margin-top:16px;
                                    padding:11px 13px;
                                    border:1px solid #f0d5c7;
                                    border-radius:8px;
                                    background:#fff8f4;
                                    color:#8c4a30;
                                    font-size:12.5px;
                                    font-weight:600;
                                "
                            >
                                Esta acción no se puede deshacer.
                            </div>

                        </div>

                        <div
                            class="actions-row"
                            style="
                                margin-top:22px;
                                display:flex;
                                justify-content:flex-end;
                                gap:10px;
                            "
                        >
                            <button
                                type="button"
                                class="btn btn-ghost"
                                id="tareo-confirm-cancelar"
                            >
                                Cancelar
                            </button>

                            <button
                                type="button"
                                class="btn"
                                id="tareo-confirm-eliminar"
                                style="
                                    background:#b6532d;
                                    border-color:#b6532d;
                                    color:#fff;
                                "
                            >
                                Eliminar tareo
                            </button>
                        </div>

                    </div>
                </div>
            </div>
        `;

        const backdrop = document.getElementById('tareo-confirm-backdrop');
        const cancelar = document.getElementById('tareo-confirm-cancelar');
        const eliminar = document.getElementById('tareo-confirm-eliminar');
        const cerrar = document.getElementById('tareo-confirm-close');

        cancelar?.addEventListener('click', () => terminar(false));
        cerrar?.addEventListener('click', () => terminar(false));
        eliminar?.addEventListener('click', () => terminar(true));

        backdrop?.addEventListener('click', evento => {
            if (evento.target === backdrop) {
                terminar(false);
            }
        });

        document.addEventListener('keydown', manejarTecla);

        setTimeout(() => eliminar?.focus(), 0);
    });
}


/* =========================================================
   ELIMINAR TAREO
   ========================================================= */

async function eliminarTareo(id) {

    if (esUsuarioSoloConsulta(state.user)) {
        alert('Jefatura y Gerencia solo pueden consultar los tareos.');
        return;
    }

    /*
       Eliminar un tareo: con el permiso general 'eliminarRegistros'
       (igual que siempre) O con 'moduloRRHH' — este último solo
       para tareos, no habilita eliminar reportes de producción ni
       paletas (esos siguen exigiendo 'eliminarRegistros').
    */
    if (
        !tienePermiso('eliminarRegistros') &&
        !tienePermiso('moduloRRHH')
    ) {

        alert(
            'No tienes permiso para eliminar tareos.'
        );

        return;
    }

    const tareo =
        obtenerTareos().find(
            item => item.id === id
        );

    if (!tareo) return;

    if (!tareoAutorizadoEscribir(tareo)) {

        alert(
            'No tienes permiso para gestionar el Tareo de ' + tareoAreaDe(tareo) + '.'
        );

        return;
    }

    const confirmar = await confirmarEliminacionTareo(tareo);

    if (!confirmar) {
        return;
    }

    guardarTareos(
        obtenerTareos().filter(
            item => item.id !== id
        )
    );

    if (tareoActualId === id) {
        tareoActualId = null;
    }

    alert(
        'Tareo eliminado correctamente.'
    );

    renderHistorialTareo();
}


/* =========================================================
   LECTURA
   ========================================================= */

function renderTareoLectura(tareo) {

    const main =
        document.getElementById('main');

    if (!main) return;

    const area = tareoAreaDe(tareo);

    const personal =
        ordenarPersonalTareo(
            tareo.personal || []
        );

    const c = tareoContadores(personal);

    const puedeEditar = tareoPuedeEditar(tareo);

    main.innerHTML = `

        <div class="main-head">

            <div>

                <h2>
                    Tareo de ${escaparHTML(area)} · ${formatearFecha(tareo.fecha)}
                </h2>

                <div class="sub">
                    ${escaparHTML(tareo.turno)}
                    · Responsable: ${escaparHTML(tareoResponsable(tareo))}
                    · Estado: ${escaparHTML(tareo.estado || 'Abierto')}
                    · ${escaparHTML(tareo.id)}
                </div>

                ${puedeEditar ? '' : tareoInsigniaConsulta()}

            </div>

            <div class="tareo-head-actions">

                <button
                    class="btn btn-ghost"
                    onclick="renderHistorialTareo()"
                >
                    ← Historial
                </button>

                <button
                    class="btn btn-ghost"
                    onclick="wspEnviarTareo('${tareo.id}')"
                >
                    📲 Enviar por WhatsApp
                </button>

                ${
                    puedeEditar
                        ? `
                        <button
                            class="btn btn-primary"
                            onclick="editarTareo('${tareo.id}')"
                        >
                            Editar
                        </button>
                        `
                        : ''
                }

                ${
                    (
                        puedeEditar &&
                        (tienePermiso('eliminarRegistros') ||
                        tienePermiso('moduloRRHH'))
                    )
                        ? `
                        <button
                            class="btn btn-danger"
                            onclick="eliminarTareo('${tareo.id}')"
                        >
                            Eliminar
                        </button>
                        `
                        : ''
                }

            </div>

        </div>


        <div class="tareo-kpi-grid">

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Personal</span>
                <strong>${c.total}</strong>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Presentes</span>
                <strong class="tareo-good">${c.asistieron}</strong>${c.enComision ? '<small>' + c.enComision + ' en comisión externa</small>' : ''}
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Ausencias</span>
                <strong>${c.ausencias}</strong>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Sin registrar</span>
                <strong class="${c.pendientes ? 'tareo-warn' : ''}">${c.pendientes}</strong>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Tardanzas</span>
                <strong>${c.tardanzas}</strong>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">HORAS EXTRAS</span>
                <strong>${tareoSaldoHTML(c.saldo)}</strong>
            </div>

        </div>


        <div class="panel">

            <div class="panel-head">

                <h3>Registro del personal</h3>

                <span class="small-muted">
                    ${formatearHoras(c.horas)} horas acumuladas
                </span>

            </div>

            <div class="panel-body">

                <div class="tareo-table-scroll">

                    <table class="tareo-table">

                        <thead>
                            <tr>
                                <th>Trabajador</th>
                                <th>Cargo</th>
                                <th>Línea</th>
                                <th>Asistencia</th>
                                <th>Ingreso</th>
                                <th>Refrigerio</th>
                                <th>Salida</th>
                                <th>Horas</th>
                                <th>HORAS EXTRAS</th>
                                <th>Tardanza</th>
                            </tr>
                        </thead>

                        <tbody>

                            ${personal.map(
                                persona => `
                                <tr>

                                    <td>
                                        <div class="tareo-worker">
                                            ${tareoBotonNombre(persona, tareo.id)}
                                            <small>DNI: ${escaparHTML(persona.dni)}</small>
                                        </div>
                                    </td>

                                    <td>${escaparHTML(persona.cargo)}</td>

                                    <td>${persona.linea ? escaparHTML(persona.linea) : 'Sin línea'}</td>

                                    <td>
                                        <span class="tareo-status ${tareoClaseEstado(persona.asistencia)}">
                                            ${escaparHTML(tareoEtiquetaEstado(persona.asistencia))}
                                        </span>
                                    </td>

                                    <td>${persona.horaIngreso || '—'}</td>

                                    <td>
                                        ${
                                            Number(persona.refrigerio || 0) > 0
                                                ? `${persona.refrigerio} h`
                                                : '—'
                                        }
                                    </td>

                                    <td>${persona.horaSalida || "—"}${tareoMarcaSalidaEditada(persona)}${tareoBotonEditarSalida(tareo, persona)}</td>

                                    <td>${formatearHoras(persona.horasTrabajadas)} h</td>

                                    <td>${tareoSaldoHTML(tareoSaldoHoras(persona, tareo.jornadaNormal))}</td>

                                    <td>
                                        ${
                                            Number(persona.tardanzaMinutos || 0) > 0
                                                ? formatearMinutos(persona.tardanzaMinutos)
                                                : '—'
                                        }
                                    </td>

                                </tr>
                            `).join('')}

                        </tbody>

                    </table>

                </div>

            </div>

        </div>


        ${
            tareoPorDiaActivos(tareo).length
                ? tareoSeccionPorDiaHTML(tareo, false)
                : ''
        }


        ${
            tareo.observaciones
                ? `
                <div class="panel">

                    <div class="panel-head">
                        <h3>Observaciones</h3>
                    </div>

                    <div class="panel-body">
                        <p class="tareo-observations-read">
                            ${escaparHTML(tareo.observaciones)}
                        </p>
                    </div>

                </div>
                `
                : ''
        }

    `;
}


/* =========================================================
   FICHA DE UNA PERSONA (al tocar su nombre)
   ========================================================= */

const TAREO_MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];


function tareoResumenDeRegistros(registros, año, mes) {

    const r = {
        turnos: 0,
        asistencias: 0,          // solo «Asistió»
        feriados: 0,             // Feriado trabajado
        comisiones: 0,           // Comisión / trabajo externo
        diasTrabajados: 0,       // Asistió + Feriado trabajado + Comisión externa
        faltasPorJustificar: 0,
        faltasJustificadas: 0,
        descansos: 0,
        descansosMedicos: 0,
        vacaciones: 0,
        tardanzas: 0,
        minutosTardanza: 0,
        horas: 0,
        extras: 0,
        saldo: 0
    };

    registros.forEach(({ tareo, persona }) => {

        const partes = String(tareo.fecha || '').split('-');

        if (
            Number(partes[0]) !== Number(año) ||
            Number(partes[1]) !== Number(mes)
        ) {
            return;
        }

        const estado = tareoEstadoCanonico(persona.asistencia);

        if (!estado) return;

        r.turnos++;

        if (tareoEsPresente(estado)) r.diasTrabajados++;

        if (estado === 'Asistió') r.asistencias++;
        else if (estado === 'Feriado trabajado') r.feriados++;
        else if (estado === TAREO_ESTADO_COMISION) r.comisiones++;
        else if (estado === 'Falta por justificar') r.faltasPorJustificar++;
        else if (estado === 'Falta justificada') r.faltasJustificadas++;
        else if (estado === 'Descanso') r.descansos++;
        else if (estado === 'Descanso médico') r.descansosMedicos++;
        else if (estado === 'Vacaciones') r.vacaciones++;

        r.horas += Number(persona.horasTrabajadas || 0);
        r.extras += Number(persona.horasExtras || 0);
        { const s = tareoSaldoHoras(persona); if (s !== null) r.saldo += s; }

        if (Number(persona.tardanzaMinutos || 0) > 0) {
            r.tardanzas++;
            r.minutosTardanza += Number(persona.tardanzaMinutos);
        }
    });

    return r;
}


function tareoAbrirFicha(clave, tareoId) {

    const root =
        document.getElementById('modal-root');

    if (!root) return;

    const registros = [];

    tareoTareosVisibles().forEach(tareo => {

        (tareo.personal || []).forEach(persona => {

            if (String(persona.trabajadorId) === String(clave)) {
                registros.push({ tareo, persona });
            }
        });
    });

    registros.sort(
        (a, b) =>
            String(b.tareo.fecha).localeCompare(String(a.tareo.fecha)) ||
            String(b.tareo.turno).localeCompare(String(a.tareo.turno))
    );

    const seleccionado = tareoId
        ? registros.find(item => item.tareo.id === tareoId)
        : null;

    const referencia = seleccionado || registros[0] || null;

    let datos = referencia ? referencia.persona : null;

    /*
       No completar fichas de Producción desde Gestionar trabajadores.
       Si no existe en un tareo/rotación, no se inventa una ficha.
    */
    if (!datos && typeof loadWorkers === 'function') {

        const trabajador = loadWorkers().find(
            item =>
                String(item.id) === String(clave) &&
                tareoCargoPermitido(item.cargo, 'Mantenimiento')
        );

        if (trabajador) {
            datos = {
                nombre: trabajador.nombre,
                dni: trabajador.dni,
                cargo: trabajador.cargo,
                linea: trabajador.linea,
                area: 'Mantenimiento'
            };
        }
    }

    if (!datos) return;

    const fechaReferencia = referencia
        ? referencia.tareo.fecha
        : obtenerFechaHoy();

    const [año, mes] = fechaReferencia.split('-').map(Number);

    const resumen =
        tareoResumenDeRegistros(registros, año, mes);

    const area = referencia
        ? tareoAreaDe(referencia.tareo)
        : (datos.area || '');

    const turnoActual = seleccionado
        ? seleccionado.persona
        : null;

    const dato = (etiqueta, valor) => `
        <div class="tar2-ficha-item">
            <span>${etiqueta}</span>
            <strong>${valor}</strong>
        </div>
    `;

    root.innerHTML = `
        <div class="modal-backdrop" onclick="if(event.target===this)closeModal()">
            <div class="modal">

                <div class="modal-head">
                    <h3>Ficha de Tareo</h3>
                    <button class="modal-close" onclick="closeModal()">✕</button>
                </div>

                <div class="modal-body">

                    <div class="tar2-ficha-head">

                        <strong>${escaparHTML(datos.nombre)}</strong>

                        <span>
                            ${datos.dni ? 'DNI ' + escaparHTML(datos.dni) + ' · ' : ''}
                            ${escaparHTML(datos.cargo || 'Sin cargo')}
                            ${datos.linea ? ' · ' + escaparHTML(datos.linea) : ''}
                        </span>

                        ${area ? `<div style="margin-top:6px;">${tareoInsigniaArea(area)}</div>` : ''}

                    </div>


                    ${
                        turnoActual
                            ? `
                            <div class="tar2-ficha-sub">
                                Registro del ${formatearFecha(seleccionado.tareo.fecha)} · ${escaparHTML(seleccionado.tareo.turno)}
                            </div>

                            <div class="tar2-ficha-grid">
                                ${dato('Estado', `<span class="tareo-status ${tareoClaseEstado(turnoActual.asistencia)}">${escaparHTML(tareoEtiquetaEstado(turnoActual.asistencia))}</span>`)}
                                ${dato('Ingreso', turnoActual.horaIngreso ? escaparHTML(turnoActual.horaIngreso) : '—')}
                                ${dato('Hora programada', escaparHTML(seleccionado.tareo.horaProgramadaIngreso || '—'))}
                                ${dato('Tardanza', Number(turnoActual.tardanzaMinutos || 0) > 0 ? formatearMinutos(turnoActual.tardanzaMinutos) : (turnoActual.horaIngreso ? 'A tiempo' : '—'))}
                                ${dato('Salida', turnoActual.horaSalida ? escaparHTML(turnoActual.horaSalida) : '—')}
                                ${dato('Horas / HORAS EXTRAS', `${formatearHoras(turnoActual.horasTrabajadas)} / ${tareoTextoSaldo(tareoSaldoHoras(turnoActual))}`)}
                            </div>

                            ${
                                turnoActual.registradoEn
                                    ? `
                                    <div class="small-muted">
                                        Registrado el ${escaparHTML(new Date(turnoActual.registradoEn).toLocaleString('es-PE'))}
                                        ${turnoActual.registradoPor ? ' por ' + escaparHTML(turnoActual.registradoPor) : ''}
                                    </div>
                                    `
                                    : ''
                            }
                            `
                            : ''
                    }


                    <div class="tar2-ficha-sub">
                        Resumen de ${TAREO_MESES[mes - 1]} ${año}
                    </div>

                    <div class="tar2-ficha-grid">
                        ${dato('Asistió', resumen.asistencias)}
                        ${dato('Feriado trabajado', resumen.feriados)}
                        ${dato('Comisión externa', resumen.comisiones)}
                        ${dato('Días trabajados', resumen.diasTrabajados)}
                        ${dato('Faltas por justificar', resumen.faltasPorJustificar)}
                        ${dato('Faltas justificadas', resumen.faltasJustificadas)}
                        ${dato('Descansos', resumen.descansos)}
                        ${dato('Descanso médico', resumen.descansosMedicos)}
                        ${dato('Vacaciones', resumen.vacaciones)}
                        ${dato('Tardanzas', resumen.tardanzas ? `${resumen.tardanzas} (${formatearMinutos(resumen.minutosTardanza)})` : '0')}
                        ${dato('Horas trabajadas', `${formatearHoras(resumen.horas)} h`)}
                        ${dato('HORAS EXTRAS (saldo)', tareoTextoSaldo(resumen.saldo))}
                    </div>


                    <div class="tar2-ficha-sub">
                        Últimos registros
                    </div>

                    ${
                        registros.length
                            ? `
                            <div class="tareo-table-scroll">

                                <table class="tareo-table">

                                    <thead>
                                        <tr>
                                            <th>Fecha</th>
                                            <th>Turno</th>
                                            <th>Estado</th>
                                            <th>Ingreso</th>
                                            <th>Tardanza</th>
                                            <th>Horas</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        ${registros.slice(0, 10).map(({ tareo, persona }) => `
                                            <tr>
                                                <td>${formatearFecha(tareo.fecha)}</td>
                                                <td>${escaparHTML(tareo.turno)}</td>
                                                <td>
                                                    <span class="tareo-status ${tareoClaseEstado(persona.asistencia)}">
                                                        ${escaparHTML(tareoEtiquetaEstado(persona.asistencia))}
                                                    </span>
                                                </td>
                                                <td>${persona.horaIngreso || '—'}</td>
                                                <td>${Number(persona.tardanzaMinutos || 0) > 0 ? formatearMinutos(persona.tardanzaMinutos) : '—'}</td>
                                                <td>${formatearHoras(persona.horasTrabajadas)} h</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>

                                </table>

                            </div>
                            `
                            : `
                            <p class="small-muted" style="margin:0;">
                                Todavía no tiene registros de tareo.
                            </p>
                            `
                    }

                </div>

            </div>
        </div>
    `;
}


/* =========================================================
   TAREO GENERAL (RRHH · SOLO LECTURA · AMBAS ÁREAS)
   ========================================================= */

function tareoGeneralFiltrar() {

    tareoGeneralFiltros.fecha =
        document.getElementById('tareo-general-fecha')?.value ||
        obtenerFechaHoy();

    tareoGeneralFiltros.turno =
        document.getElementById('tareo-general-turno')?.value || '';

    tareoGeneralFiltros.area =
        document.getElementById('tareo-general-area')?.value || '';

    renderTareoGeneral();
}


function tareoGeneralDatos() {

    // Un filtro de área que ya no es visible para este usuario se descarta.
    if (
        tareoGeneralFiltros.area &&
        !tareoAreasVisibles().includes(tareoGeneralFiltros.area)
    ) {
        tareoGeneralFiltros.area = '';
    }

    const { fecha, turno, area } = tareoGeneralFiltros;

    const areas = tareoAreasVisibles().filter(
        item => !area || item === area
    );

    const turnos = turno ? [turno] : ['Día', 'Noche'];

    const tareos = obtenerTareos().filter(
        tareo =>
            tareo.fecha === fecha &&
            areas.includes(tareoAreaDe(tareo)) &&
            turnos.includes(normalizarTurno(tareo.turno))
    );

    const filas = [];

    tareos.forEach(tareo => {

        (tareo.personal || []).forEach(persona => {
            filas.push({ tareo, persona });
        });
    });

    filas.sort((a, b) =>
        tareoAreaDe(a.tareo).localeCompare(tareoAreaDe(b.tareo)) ||
        String(a.tareo.turno).localeCompare(String(b.tareo.turno)) ||
        obtenerPrioridadAsistencia(a.persona.asistencia) -
            obtenerPrioridadAsistencia(b.persona.asistencia) ||
        String(a.persona.nombre || '').localeCompare(
            String(b.persona.nombre || ''), 'es', { sensitivity: 'base' }
        )
    );

    return { areas, turnos, tareos, filas };
}


function renderTareoGeneral() {

    const main =
        document.getElementById('main');

    if (!main) return;

    if (!tareoAccesoUsuario().general) {

        alert('No tienes acceso al Tareo General.');

        return;
    }

    if (!tareoGeneralFiltros.fecha) {
        tareoGeneralFiltros.fecha = obtenerFechaHoy();
    }

    const { fecha, turno, area } = tareoGeneralFiltros;

    const { areas, turnos, filas } = tareoGeneralDatos();

    const c = tareoContadores(filas.map(item => item.persona));

    main.innerHTML = `

        <div class="main-head" id="tareo-general-view">

            <div>

                <h2>${tareoAreasVisibles().length === 1 ? 'Tareo de ' + escaparHTML(tareoAreasVisibles()[0]) : 'Tareo General'}</h2>

                <div class="sub">
                    ${tareoAreasVisibles().length === 1 ? 'Consulta del tareo por turno' : 'Producción y Mantenimiento en una sola vista'}
                    <span class="tar2-live">En vivo</span>
                </div>

            </div>

            <div class="tareo-head-actions">

                <button
                    class="btn btn-primary"
                    onclick="exportarTareoGeneralExcel()"
                >
                    Exportar Excel
                </button>

            </div>

        </div>


        ${tareoRenderTabs('general')}


        <div class="panel">

            <div class="panel-body">

                <div class="tar2-toolbar">

                    <div class="field-sm">
                        <label>Fecha</label>
                        <input
                            type="date"
                            id="tareo-general-fecha"
                            value="${escaparHTML(fecha)}"
                            onchange="tareoGeneralFiltrar()"
                        >
                    </div>

                    <div class="field-sm">
                        <label>Turno</label>
                        <select id="tareo-general-turno" onchange="tareoGeneralFiltrar()">
                            <option value="">Todos</option>
                            <option value="Día" ${turno === 'Día' ? 'selected' : ''}>Día</option>
                            <option value="Noche" ${turno === 'Noche' ? 'selected' : ''}>Noche</option>
                        </select>
                    </div>

                    <div class="field-sm">
                        <label>Área</label>
                        <select id="tareo-general-area" onchange="tareoGeneralFiltrar()">
                            ${tareoAreasVisibles().length > 1 ? '<option value="">Ambas</option>' : ''}
                            ${tareoAreasVisibles().map(item => `
                                <option value="${item}" ${area === item ? 'selected' : ''}>${item}</option>
                            `).join('')}
                        </select>
                    </div>

                </div>

            </div>

        </div>


        <div class="panel">

            <div class="panel-head">
                <h3>Estado por área y turno</h3>
            </div>

            <div class="panel-body">

                <div class="tar2-turno-grid">

                    ${areas.map(itemArea => turnos.map(itemTurno => {

                        const tareo = tareoBuscar(itemArea, fecha, itemTurno);

                        const k = tareo
                            ? tareoContadores(tareo.personal || [])
                            : null;

                        const porcentaje = k && k.total
                            ? Math.round(k.registrados * 100 / k.total)
                            : 0;

                        return `
                            <div class="tar2-card">

                                <div class="tar2-card-head">

                                    <span class="tar2-card-title">
                                        ${tareoInsigniaArea(itemArea)}
                                        · ${itemTurno}
                                    </span>

                                    <span class="tar2-card-state ${tareo ? 'open' : 'none'}">
                                        ${tareo ? 'Con tareo' : 'Sin tareo'}
                                    </span>

                                </div>

                                ${
                                    tareo
                                        ? `
                                        <div class="tar2-progress">
                                            <span style="width:${porcentaje}%"></span>
                                        </div>

                                        <div class="tar2-card-meta">
                                            <strong>${k.registrados}/${k.total}</strong> registrados ·
                                            ${tareoTextoPresentes(k)} ·
                                            ${k.ausencias} ausentes ·
                                            ${k.pendientes} pendientes
                                            ${
                                                k.tardanzas
                                                    ? ` · <span class="tareo-late">${k.tardanzas} con tardanza</span>`
                                                    : ''
                                            }
                                        </div>
                                        ${
                                            tareoPorDiaActivos(tareo).length
                                                ? `<div class="tar2-card-meta">Por día: <strong>${tareoPorDiaActivos(tareo).length}</strong></div>`
                                                : ''
                                        }
                                        <div class="tar2-card-meta">
                                            Responsable: <strong>${escaparHTML(tareoResponsable(tareo))}</strong>
                                            · Estado: ${escaparHTML(tareo.estado || 'Abierto')}
                                        </div>
                                        `
                                        : `
                                        <div class="tar2-card-meta">
                                            El supervisor aún no abre el tareo de este turno.
                                        </div>
                                        `
                                }

                            </div>
                        `;

                    }).join('')).join('')}

                </div>

            </div>

        </div>


        <div class="tareo-kpi-grid">

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Personal</span>
                <strong>${c.total}</strong>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Presentes</span>
                <strong class="tareo-good">${c.asistieron}</strong>${c.enComision ? '<small>' + c.enComision + ' en comisión externa</small>' : ''}
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Ausencias</span>
                <strong>${c.ausencias}</strong>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Sin registrar</span>
                <strong class="${c.pendientes ? 'tareo-warn' : ''}">${c.pendientes}</strong>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Tardanzas</span>
                <strong>${c.tardanzas}</strong>
            </div>

        </div>


        <div class="panel">

            <div class="panel-head">

                <h3>Personal del día</h3>

                <span class="small-muted">
                    ${filas.length} personas · toca un nombre para ver su ficha
                </span>

            </div>

            <div class="panel-body">

                ${
                    filas.length
                        ? `
                        <div class="tareo-table-scroll">

                            <table class="tareo-table">

                                <thead>
                                    <tr>
                                        <th>Área</th>
                                        <th>Turno</th>
                                        <th>Trabajador</th>
                                        <th>Cargo</th>
                                        <th>Asistencia</th>
                                        <th>Ingreso</th>
                                        <th>Tardanza</th>
                                        <th>Refrigerio</th>
                                        <th>Salida</th>
                                        <th>Horas</th>
                                        <th>HORAS EXTRAS</th>
                                    </tr>
                                </thead>

                                <tbody>

                                    ${filas.map(({ tareo, persona }) => `
                                        <tr>
                                            <td>${tareoInsigniaArea(tareoAreaDe(tareo))}</td>
                                            <td>${escaparHTML(tareo.turno)}</td>
                                            <td>${tareoBotonNombre(persona, tareo.id)}</td>
                                            <td>${escaparHTML(persona.cargo)}</td>
                                            <td>
                                                <span class="tareo-status ${tareoClaseEstado(persona.asistencia)}">
                                                    ${escaparHTML(tareoEtiquetaEstado(persona.asistencia))}
                                                </span>
                                            </td>
                                            <td>${persona.horaIngreso || '—'}</td>
                                            <td>
                                                ${
                                                    Number(persona.tardanzaMinutos || 0) > 0
                                                        ? `<span class="tareo-late">${formatearMinutos(persona.tardanzaMinutos)}</span>`
                                                        : '—'
                                                }
                                            </td>
                                            <td>${Number(persona.refrigerio || 0) > 0 ? escaparHTML(String(persona.refrigerio)) + ' h' : '—'}</td>
                                            <td>${persona.horaSalida || "—"}${tareoMarcaSalidaEditada(persona)}</td>
                                            <td>${formatearHoras(persona.horasTrabajadas)} h</td>
                                            <td>${tareoSaldoHTML(tareoSaldoHoras(persona, tareo.jornadaNormal))}</td>
                                        </tr>
                                    `).join('')}

                                </tbody>

                            </table>

                        </div>
                        `
                        : `
                        <div class="empty-state">

                            <h4>Sin registros para esta fecha</h4>

                            <p>
                                Cuando los supervisores abran sus tareos,
                                aparecerán aquí en tiempo real.
                            </p>

                        </div>
                        `
                }

            </div>

        </div>

        ${tareoPorDiaGeneralHTML()}

    `;
}

/* Agrega al libro una hoja con el personal por día de los tareos dados (si hay). */
function tareoAgregarHojaPorDia(libro, tareos, nombreHoja) {

    const datos = [];

    tareos.forEach(tareo =>
        tareoPorDiaActivos(tareo).forEach(persona => datos.push({
            'Fecha': tareo.fecha,
            'Área': tareoAreaDe(tareo),
            'Turno': tareo.turno,
            'Tipo': 'POR DÍA',
            'Nombres y apellidos': persona.nombre,
            'DNI': persona.dni || '',
            'Área / línea': persona.area || '',
            'Hora ingreso': persona.horaIngreso || '',
            'Hora salida': persona.horaSalida || '',
            'Horas trabajadas': Number(tareoHorasPorDia(persona).toFixed(2)),
            'Observación': persona.observacion || ''
        }))
    );

    if (!datos.length) return;

    const hoja = XLSX.utils.json_to_sheet(datos);

    aplicarEstiloExcelTareo(hoja, Object.keys(datos[0]));

    hoja['!autofilter'] = { ref: hoja['!ref'] };

    hoja['!cols'] = [
        { wch: 12 }, { wch: 15 }, { wch: 8 }, { wch: 10 },
        { wch: 32 }, { wch: 12 }, { wch: 18 }, { wch: 13 },
        { wch: 12 }, { wch: 16 }, { wch: 30 }
    ];

    XLSX.utils.book_append_sheet(libro, hoja, nombreHoja);
}

/* Bloque separado de personal por día en Tareo General. */
function tareoPorDiaGeneralHTML() {

    const { tareos } = tareoGeneralDatos();

    const filas = [];

    tareos.forEach(tareo =>
        tareoPorDiaActivos(tareo).forEach(persona => filas.push({ tareo, persona }))
    );

    return `
        <div class="panel">

            <div class="panel-head">
                <h3>Personal por día (no planilla)</h3>
                <span class="small-muted">${filas.length} personas · no incluidas en los totales de arriba</span>
            </div>

            <div class="panel-body">
                ${
                    filas.length
                        ? `
                        <div class="tareo-table-scroll">
                            <table class="tareo-table">
                                <thead>
                                    <tr>
                                        <th>Área</th>
                                        <th>Turno</th>
                                        <th>Nombres y apellidos</th>
                                        <th>DNI</th>
                                        <th>Área / línea</th>
                                        <th>Ingreso</th>
                                        <th>Salida</th>
                                        <th>Horas</th>
                                        <th>HORAS EXTRAS</th>
                                        <th>Observación</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${filas.map(({ tareo, persona }) => `
                                        <tr>
                                            <td>${tareoInsigniaArea(tareoAreaDe(tareo))}</td>
                                            <td>${escaparHTML(tareo.turno)}</td>
                                            <td><strong>${escaparHTML(persona.nombre)}</strong></td>
                                            <td>${escaparHTML(persona.dni || '—')}</td>
                                            <td>${escaparHTML(persona.area || '—')}</td>
                                            <td>${escaparHTML(persona.horaIngreso || '—')}</td>
                                            <td>${escaparHTML(persona.horaSalida || '—')}</td>
                                            <td>${formatearHoras(tareoHorasPorDia(persona))} h</td>
                                            <td>${tareoSaldoHTML(tareoSaldoHoras(persona))}</td>
                                            <td>${escaparHTML(persona.observacion || '—')}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        `
                        : '<div class="empty-state"><p>Sin personal por día para esta fecha.</p></div>'
                }
            </div>

        </div>
    `;
}


function exportarTareoGeneralExcel() {

    if (typeof XLSX === 'undefined') {

        alert('SheetJS no está disponible.');

        return;
    }

    const { filas } = tareoGeneralDatos();

    if (!filas.length) {

        alert('No hay registros para exportar en esta fecha.');

        return;
    }

    const datos = filas.map(({ tareo, persona }) => ({
        'Fecha': tareo.fecha,
        'Área': tareoAreaDe(tareo),
        'Turno': tareo.turno,
        'DNI': persona.dni,
        'Trabajador': persona.nombre,
        'Cargo': persona.cargo,
        'Línea': persona.linea || 'Sin línea',
        'Asistencia': tareoEtiquetaEstado(persona.asistencia),
        'Hora programada': tareo.horaProgramadaIngreso || '',
        'Hora ingreso': persona.horaIngreso || '',
        'Tardanza (min)': Number(persona.tardanzaMinutos || 0),
        'Hora salida': persona.horaSalida || '',
        'Horas trabajadas': Number(Number(persona.horasTrabajadas || 0).toFixed(2)),
        'HORAS EXTRAS': tareoSaldoNumero(tareoSaldoHoras(persona, tareo.jornadaNormal)),
        'Registrado por': persona.registradoPor || ''
    }));

    const hoja = XLSX.utils.json_to_sheet(datos);

    aplicarEstiloExcelTareo(hoja, Object.keys(datos[0]));

    hoja['!autofilter'] = { ref: hoja['!ref'] };

    hoja['!cols'] = [
        { wch: 12 }, { wch: 15 }, { wch: 8 }, { wch: 12 },
        { wch: 32 }, { wch: 28 }, { wch: 12 }, { wch: 22 },
        { wch: 15 }, { wch: 13 }, { wch: 14 }, { wch: 12 },
        { wch: 16 }, { wch: 13 }, { wch: 16 }
    ];

    const libro = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(libro, hoja, 'Tareo General');

    // Personal por día (no planilla): hoja aparte.
    tareoAgregarHojaPorDia(
        libro,
        tareoGeneralDatos().tareos,
        'Personal por día'
    );

    XLSX.writeFile(
        libro,
        `Tareo_General_${tareoGeneralFiltros.fecha}.xlsx`
    );
}


function tareoClaseEstado(
    estado
) {

    const texto =
        tareoNormalizarTexto(
            tareoEstadoCanonico(
                estado
            )
        );

    if (!texto) return 'pendiente';
    if (texto === 'asistio') return 'asistio';
    if (texto === 'falta por justificar') return 'falta';

    if (
        texto === 'falta justificada' ||
        texto === 'descanso medico'
    ) {
        return 'warn';
    }

    return 'neutral';
}


/* =========================================================
   ROTACIÓN - INTERFAZ
   ========================================================= */

function renderRotacionSemanal() {

    const main =
        document.getElementById('main');

    if (!main) return;

    if (!tareoAreasEditables().includes('Producción')) {

        alert(
            'La rotación semanal la gestiona el área de Producción.'
        );

        return;
    }

    const rotaciones =
        [...obtenerRotaciones()].sort(
            (a, b) =>
                String(b.fechaInicio || '')
                    .localeCompare(
                        String(a.fechaInicio || '')
                    )
        );

    main.innerHTML = `

        <div class="main-head">

            <div>

                <h2>
                    Rotación semanal
                </h2>

                <div class="sub">
                    Cargue el Excel enviado por
                    la planta para asignar
                    Día y Noche
                </div>

            </div>

            <button
                class="btn btn-ghost"
                onclick="if(confirmarAbandonoRotacionPendiente())renderTareoPrincipal()"
            >
                ← Volver
            </button>

        </div>


        ${tareoRenderTabs('rotacion')}


        <div class="panel tareo-rotation-upload">

            <div class="panel-head">

                <h3>
                    Cargar rotación
                </h3>

            </div>

            <div class="panel-body">

                <div class="tareo-upload-box">

                    <div class="tareo-upload-icon">
                        ↑
                    </div>

                    <strong>
                        Seleccione el Excel de rotación
                    </strong>

                    <span>
                        El sistema validará trabajadores,
                        cargos y turnos antes de aplicar
                        la rotación.
                    </span>

                    <label class="btn btn-primary">

                        Seleccionar Excel

                        <input
                            type="file"
                            id="tareo-rotacion-file"
                            accept=".xlsx,.xls,.csv"
                            onchange="previsualizarRotacionExcel(event)"
                            hidden
                        >

                    </label>

                </div>


                <div
                    id="tareo-rotacion-preview"
                    class="tareo-rotation-preview"
                ></div>

            </div>

        </div>


        <div class="panel">

            <div class="panel-head">

                <h3>
                    Rotaciones registradas
                </h3>

                <span class="small-muted">
                    Historial de vigencias
                </span>

            </div>

            <div class="panel-body">

                ${
                    rotaciones.length
                        ? `
                        <div class="tareo-table-scroll">

                            <table class="tareo-table">

                                <thead>

                                    <tr>

                                        <th>Vigencia</th>
                                        <th>Registros</th>
                                        <th>Día</th>
                                        <th>Noche</th>
                                        <th>Fecha de carga</th>
                                        <th>Estado</th>

                                    </tr>

                                </thead>

                                <tbody>

                                    ${rotaciones.map(
                                        rotacion => {

                                            /*
                                               Compatibilidad con rotaciones antiguas:
                                               algunos registros históricos pueden no
                                               tener el arreglo `personal`.
                                            */
                                            const personalRotacion =
                                                Array.isArray(rotacion.personal)
                                                    ? rotacion.personal
                                                    : [];

                                            const dia =
                                                personalRotacion.filter(
                                                    persona =>
                                                        normalizarTurno(
                                                            persona.turno
                                                        ) ===
                                                        'Día'
                                                ).length;

                                            const noche =
                                                personalRotacion.filter(
                                                    persona =>
                                                        normalizarTurno(
                                                            persona.turno
                                                        ) ===
                                                        'Noche'
                                                ).length;

                                            const vigente =
                                                obtenerRotacionVigente(
                                                    obtenerFechaHoy()
                                                );

                                            const activa =
                                                vigente &&
                                                vigente.id ===
                                                rotacion.id;

                                            return `

                                                <tr>

                                                    <td>

                                                        <strong>
                                                            ${formatearFecha(
                                                                rotacion.fechaInicio
                                                            )}
                                                            —
                                                            ${formatearFecha(
                                                                rotacion.fechaFin
                                                            )}
                                                        </strong>

                                                    </td>

                                                    <td>
                                                        ${
                                                            personalRotacion
                                                                .length
                                                        }
                                                    </td>

                                                    <td>
                                                        ${dia}
                                                    </td>

                                                    <td>
                                                        ${noche}
                                                    </td>

                                                    <td>
                                                        ${
                                                            rotacion.creadoEn
                                                                ? new Date(
                                                                    rotacion.creadoEn
                                                                  ).toLocaleString(
                                                                    'es-PE'
                                                                  )
                                                                : '—'
                                                        }
                                                    </td>

                                                    <td>

                                                        <span
                                                            class="tareo-status ${
                                                                activa
                                                                    ? 'asistio'
                                                                    : 'neutral'
                                                            }"
                                                        >
                                                            ${
                                                                activa
                                                                    ? 'Vigente'
                                                                    : 'Histórica'
                                                            }
                                                        </span>

                                                    </td>

                                                </tr>

                                            `;
                                        }
                                    ).join('')}

                                </tbody>

                            </table>

                        </div>
                        `
                        : `
                        <div class="empty-state">

                            <h4>
                                No hay rotaciones cargadas
                            </h4>

                            <p>
                                La primera rotación puede
                                cargarse mediante Excel.
                            </p>

                        </div>
                        `
                }

            </div>

        </div>

    `;
}


/* =========================================================
   LECTOR EXCEL
   ========================================================= */

async function previsualizarRotacionExcel(
    event
) {

    const archivo =
        event.target.files?.[0];

    if (!archivo) return;

    const contenedor =
        document.getElementById(
            'tareo-rotacion-preview'
        );

    if (!contenedor) return;

    contenedor.innerHTML = `
        <div class="tareo-loading">
            Procesando archivo...
        </div>
    `;

    try {

        if (
            typeof XLSX ===
            'undefined'
        ) {

            throw new Error(
                'SheetJS (XLSX) no está disponible.'
            );
        }

        const datos =
            await archivo.arrayBuffer();

        const workbook =
            XLSX.read(
                datos,
                {
                    type: 'array',
                    cellDates: true
                }
            );

        const hoja =
            workbook.Sheets[
                workbook.SheetNames[0]
            ];

        const filas =
            XLSX.utils.sheet_to_json(
                hoja,
                {
                    defval: ''
                }
            );

        if (!filas.length) {

            throw new Error(
                'El archivo no contiene registros.'
            );
        }

        const resultado =
            interpretarRotacionExcel(
                filas,
                workbook.SheetNames[0] || ''
            );

        window._tareoRotacionPendiente =
            resultado;

        renderPreviewRotacion(
            resultado
        );

    } catch (error) {

        console.error(
            'TAREO ROTACIÓN:',
            error
        );

        contenedor.innerHTML = `

            <div class="tareo-import-error">

                <strong>
                    No se pudo procesar el archivo
                </strong>

                <span>
                    ${escaparHTML(
                        error.message
                    )}
                </span>

            </div>

        `;
    }
}


/* =========================================================
   DETECCIÓN DE COLUMNAS
   ========================================================= */

function encontrarColumna(
    filas,
    alternativas
) {

    if (!filas.length) return null;

    const columnas =
        Object.keys(
            filas[0]
        );

    for (
        const columna
        of columnas
    ) {

        const normalizada =
            tareoNormalizarTexto(
                columna
            );

        const encontrada =
            alternativas.some(
                alternativa =>
                    normalizada.includes(
                        tareoNormalizarTexto(
                            alternativa
                        )
                    )
            );

        if (encontrada) {
            return columna;
        }
    }

    return null;
}


/* =========================================================
   INTERPRETAR EXCEL
   ========================================================= */

function tareoCargoDesdePuesto(valor) {
    const puesto = tareoNormalizarTexto(valor).replace(/\s+/g, ' ').trim();

    if (puesto === 'op' || puesto === 'operario') {
        return 'Operario de Producción';
    }
    if (puesto === 'maquinista') {
        return 'Maquinista de Producción';
    }
    if (puesto === 'sup' || puesto === 'supervisor') {
        return 'Supervisor de Producción';
    }
    return '';
}

function tareoIdRotacionDesdeFila(dni, nombre) {
    const doc = tareoNormalizarDNI(dni);
    if (doc) return 'ROT-DNI-' + doc;

    const normal = tareoNormalizarTexto(nombre)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toUpperCase();

    return normal ? 'ROT-NOMBRE-' + normal : '';
}

function tareoVigenciaDesdeNombreHoja(nombreHoja) {
    const texto = String(nombreHoja || '').trim();
    const m = texto.match(/(\d{1,2})[\s.\/-]+(\d{1,2})(?:[\s.\/-]+(\d{2,4}))?\s*(?:AL|A|HASTA|-)\s*(\d{1,2})[\s.\/-]+(\d{1,2})(?:[\s.\/-]+(\d{2,4}))?/i);
    if (!m) return null;

    const hoy = new Date();
    const normalizarAnio = v => {
        if (!v) return hoy.getFullYear();
        const n = Number(v);
        return n < 100 ? 2000 + n : n;
    };

    let anioInicio = normalizarAnio(m[3]);
    let anioFin = normalizarAnio(m[6] || m[3]);
    const mesInicio = Number(m[2]);
    const mesFin = Number(m[5]);

    if (!m[6] && mesFin < mesInicio) anioFin = anioInicio + 1;

    const iso = (a, mes, dia) => `${a}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
    return {
        fechaInicio: iso(anioInicio, mesInicio, Number(m[1])),
        fechaFin: iso(anioFin, mesFin, Number(m[4]))
    };
}


function interpretarRotacionExcel(
    filas,
    nombreHoja = ''
) {

    const columnaNombre =
        encontrarColumna(
            filas,
            [
                'trabajador',
                'trabajadores',
                'nombre',
                'personal',
                'empleado',
                'colaborador'
            ]
        );

    const columnaTurno =
        encontrarColumna(
            filas,
            [
                'turno',
                'jornada',
                'horario'
            ]
        );

    const columnaPuesto =
        encontrarColumna(
            filas,
            [
                'puesto',
                'cargo',
                'posicion',
                'posición'
            ]
        );

    const columnaDNI =
        encontrarColumna(
            filas,
            [
                'dni',
                'documento',
                'n documento',
                'n° documento',
                'numero documento',
                'nro documento'
            ]
        );

    if (!columnaNombre) {
        throw new Error(
            'No se encontró la columna TRABAJADOR/TRABAJADORES.'
        );
    }

    if (!columnaTurno) {
        throw new Error(
            'No se encontró la columna TURNO.'
        );
    }

    if (!columnaPuesto) {
        throw new Error(
            'No se encontró la columna PUESTO.'
        );
    }

    const registros = [];
    const invalidos = [];
    const duplicados = [];
    const contradicciones = [];

    const porNombre = new Map();
    const porAsignacion = new Set();

    filas.forEach((fila, indice) => {

        const numeroFila = indice + 2;

        const nombre =
            String(
                fila[columnaNombre] || ''
            )
                .replace(/\s+/g, ' ')
                .trim();

        const turnoOriginal =
            String(
                fila[columnaTurno] || ''
            ).trim();

        const puestoOriginal =
            String(
                fila[columnaPuesto] || ''
            ).trim();

        const turno =
            normalizarTurno(
                turnoOriginal
            );

        const cargo =
            tareoCargoDesdePuesto(
                puestoOriginal
            );

        const dni =
            columnaDNI
                ? tareoNormalizarDNI(
                    fila[columnaDNI] || ''
                  )
                : '';

        const errores = [];

        if (!nombre) {
            errores.push('Falta TRABAJADOR');
        }

        if (!turno) {
            errores.push(
                'Turno no reconocido: ' +
                (turnoOriginal || '(vacío)')
            );
        }

        if (!cargo) {
            errores.push(
                'Puesto no reconocido: ' +
                (puestoOriginal || '(vacío)')
            );
        }

        if (errores.length) {
            invalidos.push({
                fila: numeroFila,
                nombre,
                turno: turnoOriginal,
                puesto: puestoOriginal,
                motivo: errores.join(' · ')
            });
            return;
        }

        /*
           IMPORTANTE:
           Este identificador nace SOLO del Excel.
           Nunca se consulta ni se reutiliza un ID de
           Gestionar trabajadores.
        */
        const trabajadorId =
            tareoIdRotacionDesdeFila(
                dni,
                nombre
            );

        const nombreNorm =
            tareoNormalizarTexto(nombre)
                .replace(/\s+/g, ' ')
                .trim();

        const firma =
            tareoFirmaNombreMigracion(nombre);

        const claveAsignacion =
            firma + '|' + turno + '|' + cargo;

        if (porAsignacion.has(claveAsignacion)) {
            duplicados.push({
                fila: numeroFila,
                nombre,
                turno,
                puesto: cargo,
                motivo:
                    'La misma persona/asignación aparece más de una vez en el Excel.'
            });
        }

        porAsignacion.add(claveAsignacion);

        const anteriores =
            porNombre.get(firma) || [];

        anteriores.forEach(anterior => {

            if (
                anterior.turno !== turno ||
                anterior.cargo !== cargo
            ) {
                contradicciones.push({
                    fila: numeroFila,
                    nombre,
                    turno,
                    puesto: cargo,
                    motivo:
                        'El mismo nombre aparece con turno o puesto diferente.'
                });
            }
        });

        anteriores.push({
            fila: numeroFila,
            turno,
            cargo
        });

        porNombre.set(
            firma,
            anteriores
        );

        registros.push({
            trabajadorId,
            id: trabajadorId,
            nombre,
            dni,
            cargo,
            puesto: cargo,
            linea: '',
            turno,
            filaExcel: numeroFila,
            origen: 'ROTACION_EXCEL'
        });
    });

    const vigencia =
        tareoVigenciaDesdeNombreHoja(
            nombreHoja
        );

    const fechaInicio =
        vigencia?.fechaInicio ||
        obtenerInicioSemana(
            obtenerFechaHoy()
        );

    const fechaFin =
        vigencia?.fechaFin ||
        obtenerFinSemana(
            fechaInicio
        );

    return {
        archivoFilas: filas.length,
        registros,
        sinCoincidencia: [],
        invalidos,
        duplicados,
        contradicciones,
        fechaInicio,
        fechaFin,
        columnaDNI,
        columnaNombre,
        columnaTurno,
        columnaFecha: null,
        columnaCargo: columnaPuesto,
        nombreHoja,
        origen: 'ROTACION_EXCEL'
    };
}


/* =========================================================
   FECHA EXCEL
   ========================================================= */

function normalizarFechaExcel(
    valor
) {

    if (!valor) return '';

    if (valor instanceof Date) {

        const año =
            valor.getFullYear();

        const mes =
            String(
                valor.getMonth() + 1
            ).padStart(2, '0');

        const dia =
            String(
                valor.getDate()
            ).padStart(2, '0');

        return `${año}-${mes}-${dia}`;
    }

    const texto =
        String(valor)
            .trim();

    if (
        /^\d{4}-\d{2}-\d{2}$/.test(
            texto
        )
    ) {
        return texto;
    }

    const match =
        texto.match(
            /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/
        );

    if (match) {

        let dia =
            Number(match[1]);

        let mes =
            Number(match[2]);

        let año =
            Number(match[3]);

        if (año < 100) {
            año += 2000;
        }

        return (
            `${año}-` +
            `${String(mes).padStart(2, '0')}-` +
            `${String(dia).padStart(2, '0')}`
        );
    }

    return '';
}


/* =========================================================
   PREVIEW ROTACIÓN
   ========================================================= */

function renderPreviewRotacion(
    resultado
) {

    const contenedor =
        document.getElementById(
            'tareo-rotacion-preview'
        );

    if (!contenedor) return;

    const dia =
        resultado.registros.filter(
            registro =>
                registro.turno ===
                'Día'
        ).length;

    const noche =
        resultado.registros.filter(
            registro =>
                registro.turno ===
                'Noche'
        ).length;

    const valido =
        resultado.registros.length > 0 &&
        resultado.invalidos.length === 0;

    contenedor.innerHTML = `

        <div
            style="
                display:flex;
                align-items:center;
                gap:10px;
                background:#FFF4E5;
                border:2px solid #F5A623;
                border-radius:8px;
                padding:12px 14px;
                margin-bottom:14px;
                font-weight:600;
                color:#7A4A00;
            "
        >
            <span style="font-size:20px;">⚠</span>
            <span>
                Este archivo todavía NO está guardado.
                Debes hacer clic en <u>"Validar y aplicar rotación"</u>
                más abajo, o se perderá si sales de esta pantalla,
                recargas o cierras la página.
            </span>
        </div>


        <div class="tareo-preview-head">

            <div>

                <span class="tareo-preview-label">
                    VIGENCIA DETECTADA
                </span>

                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px;">
                    <input
                        type="date"
                        id="tareo-rotacion-fecha-inicio"
                        value="${escaparHTML(resultado.fechaInicio || '')}"
                        onchange="window._tareoRotacionPendiente.fechaInicio=this.value"
                    >
                    <span>—</span>
                    <input
                        type="date"
                        id="tareo-rotacion-fecha-fin"
                        value="${escaparHTML(resultado.fechaFin || '')}"
                        onchange="window._tareoRotacionPendiente.fechaFin=this.value"
                    >
                </div>

            </div>

            <span
                class="tareo-preview-status ${
                    valido
                        ? 'valid'
                        : 'warning'
                }"
            >
                ${
                    valido
                        ? 'VALIDACIÓN CORRECTA'
                        : 'REVISAR ANTES DE APLICAR'
                }
            </span>

        </div>


        <div class="tareo-preview-kpis">

            <div>
                <span>
                    Registros Excel
                </span>
                <strong>
                    ${resultado.archivoFilas}
                </strong>
            </div>

            <div>
                <span>
                    Trabajadores válidos
                </span>
                <strong class="good">
                    ${resultado.registros.length}
                </strong>
            </div>

            <div>
                <span>
                    Día
                </span>
                <strong>
                    ${dia}
                </strong>
            </div>

            <div>
                <span>
                    Noche
                </span>
                <strong>
                    ${noche}
                </strong>
            </div>

            <div>
                <span>
                    Sin coincidencia en Trabajadores
                </span>
                <strong class="${
                    resultado.sinCoincidencia.length
                        ? 'bad'
                        : 'good'
                }">
                    ${resultado.sinCoincidencia.length}
                </strong>
            </div>

            <div>
                <span>
                    Inválidos
                </span>
                <strong class="${
                    resultado.invalidos.length
                        ? 'bad'
                        : 'good'
                }">
                    ${resultado.invalidos.length}
                </strong>
            </div>

        </div>


        ${
            resultado.sinCoincidencia.length
                ? `

                <div class="tareo-import-warning">

                    <strong>
                        Sin coincidencia en la base de Trabajadores
                    </strong>

                    <p style="margin:4px 0 8px;font-size:13px;color:var(--text-soft);">
                        Estos registros no están en la base de
                        Trabajadores (11-trabajadores.js), pero
                        de todas formas se importarán con los
                        datos tal como vienen del Excel.
                    </p>

                    <ul>

                        ${resultado.sinCoincidencia
                            .slice(0, 20)
                            .map(
                                item => `
                                <li>
                                    Fila ${item.fila}:
                                    ${
                                        escaparHTML(
                                            item.nombre ||
                                            item.dni ||
                                            'Sin identificación'
                                        )
                                    }
                                    —
                                    ${escaparHTML(
                                        item.turno
                                    )}
                                </li>
                                `
                            )
                            .join('')}

                    </ul>

                    ${
                        resultado.sinCoincidencia.length > 20
                            ? `
                            <small>
                                Se muestran los primeros
                                20 registros.
                            </small>
                            `
                            : ''
                    }

                </div>

                `
                : ''
        }


        ${
            (resultado.duplicados || []).length || (resultado.contradicciones || []).length
                ? `
                <div class="tareo-import-warning">
                    <strong>Duplicados o asignaciones contradictorias</strong>
                    <ul>
                        ${[...(resultado.duplicados || []), ...(resultado.contradicciones || [])]
                            .slice(0, 20)
                            .map(item => `
                                <li>
                                    Fila ${item.fila}: ${escaparHTML(item.nombre || 'Sin nombre')}
                                    — ${escaparHTML(item.motivo || 'Revisar')}
                                </li>
                            `).join('')}
                    </ul>
                </div>
                `
                : ''
        }


        ${
            resultado.invalidos.length
                ? `

                <div class="tareo-import-error">

                    <strong>
                        Registros inválidos
                    </strong>

                    <ul>

                        ${resultado.invalidos
                            .slice(0, 20)
                            .map(
                                item => `
                                <li>
                                    Fila ${item.fila}:
                                    ${escaparHTML(
                                        item.motivo
                                    )}
                                </li>
                                `
                            )
                            .join('')}

                    </ul>

                </div>

                `
                : ''
        }


        <div class="tareo-preview-table-wrap">

            <table class="tareo-table">

                <thead>

                    <tr>

                        <th>Trabajador</th>
                        <th>DNI</th>
                        <th>Puesto</th>
                        <th>Línea</th>
                        <th>Turno</th>

                    </tr>

                </thead>

                <tbody>

                    ${resultado.registros
                        .slice(0, 50)
                        .map(
                            registro => `

                            <tr>

                                <td>
                                    ${escaparHTML(
                                        registro.nombre
                                    )}
                                </td>

                                <td>
                                    ${escaparHTML(
                                        registro.dni
                                    )}
                                </td>

                                <td>
                                    ${escaparHTML(
                                        registro.cargo
                                    )}
                                </td>

                                <td>
                                    ${
                                        registro.linea
                                            ? escaparHTML(
                                                registro.linea
                                              )
                                            : 'Sin línea'
                                    }
                                </td>

                                <td>

                                    <span class="tareo-shift-badge ${
                                        registro.turno ===
                                        'Noche'
                                            ? 'night'
                                            : 'day'
                                    }">

                                        ${escaparHTML(
                                            registro.turno
                                        )}

                                    </span>

                                </td>

                            </tr>

                        `
                        )
                        .join('')}

                </tbody>

            </table>

        </div>


        <div
            class="actions-row"
            style="
                position:sticky;
                bottom:0;
                background:#fff;
                padding:14px 0 4px;
                border-top:1px solid #E3E8EC;
                margin-top:10px;
            "
        >

            <button
                class="btn btn-ghost"
                onclick="cancelarRotacionPendiente()"
            >
                Cancelar
            </button>

            <button
                class="btn btn-primary"
                style="
                    font-size:16px;
                    font-weight:700;
                    padding:12px 26px;
                    box-shadow:0 0 0 3px rgba(245,166,35,0.35);
                "
                ${
                    !valido
                        ? 'disabled'
                        : ''
                }
                onclick="aplicarRotacionPendiente()"
            >
                ✓ Validar y aplicar rotación (guardar)
            </button>

        </div>

    `;
}


/* =========================================================
   APLICAR ROTACIÓN
   ========================================================= */

function aplicarRotacionPendiente() {

    // Escritura de la rotación de Producción: exige gestionar el Tareo de Producción.
    if (!tareoAutorizadoEscribir('Producción')) {
        alert('No tienes permiso para gestionar la rotación del Tareo de Producción.');
        return;
    }

    const resultado = window._tareoRotacionPendiente;

    if (!resultado) {
        alert('No existe una rotación pendiente de aplicar.');
        return;
    }

    /*
       Sincronizar la vigencia directamente desde los inputs.
       No depender de una función auxiliar inexistente.
    */
    const inputInicio =
        document.getElementById('tareo-rotacion-fecha-inicio');

    const inputFin =
        document.getElementById('tareo-rotacion-fecha-fin');

    if (inputInicio) {
        resultado.fechaInicio =
            String(inputInicio.value || '').trim();
    }

    if (inputFin) {
        resultado.fechaFin =
            String(inputFin.value || '').trim();
    }

    if (!resultado.fechaInicio || !resultado.fechaFin || resultado.fechaInicio > resultado.fechaFin) {
        alert('Revisa la vigencia de la rotación antes de aplicar.');
        return;
    }

    if (!resultado.registros.length) {
        alert('No existen registros válidos para aplicar.');
        return;
    }

    const invalidos =
        Array.isArray(resultado.invalidos)
            ? resultado.invalidos
            : [];

    const contradicciones =
        Array.isArray(resultado.contradicciones)
            ? resultado.contradicciones
            : [];

    if (invalidos.length || contradicciones.length) {
        alert('Corrige las filas marcadas para revisión antes de aplicar la rotación.');
        return;
    }

    /*
       Si ya existen asistencias en el periodo, avisamos antes de cambiar
       la asignación de turno/puesto de esas personas. No se borra ni se
       reinicia ningún tareo histórico.
    */
    const porIdNuevo = new Map(
        resultado.registros.map(r => [String(r.trabajadorId), r])
    );
    const conflictos = [];

    obtenerTareos()
        .filter(t => tareoAreaDe(t) === 'Producción' && t.fecha >= resultado.fechaInicio && t.fecha <= resultado.fechaFin)
        .forEach(t => {
            (t.personal || []).forEach(p => {
                const tieneAsistencia = !!tareoEstadoCanonico(p.asistencia) || !!p.horaIngreso || !!p.horaSalida;
                if (!tieneAsistencia) return;

                const nuevo = porIdNuevo.get(String(p.trabajadorId || ''));
                if (!nuevo) {
                    conflictos.push(`${p.nombre}: tiene asistencia el ${formatearFecha(t.fecha)} (${t.turno}) y ya no aparece en la nueva rotación.`);
                    return;
                }

                const cambioTurno = normalizarTurno(nuevo.turno) !== normalizarTurno(t.turno);
                const cambioPuesto = tareoNormalizarTexto(nuevo.cargo) !== tareoNormalizarTexto(p.cargo);
                if (cambioTurno || cambioPuesto) {
                    conflictos.push(`${p.nombre}: asistencia registrada el ${formatearFecha(t.fecha)}; la nueva rotación cambia ${cambioTurno ? 'turno' : ''}${cambioTurno && cambioPuesto ? ' y ' : ''}${cambioPuesto ? 'puesto' : ''}.`);
                }
            });
        });

    if (conflictos.length) {
        const detalle = conflictos.slice(0,12).join('\n• ');
        const confirmar = confirm(
            'Se detectaron conflictos con asistencias ya registradas:\n\n• ' + detalle +
            (conflictos.length > 12 ? `\n• ... y ${conflictos.length - 12} más.` : '') +
            '\n\nLa asistencia histórica NO se borrará ni reiniciará. ¿Deseas aplicar igualmente la nueva rotación?'
        );
        if (!confirmar) return;
    }

    const rotaciones = obtenerRotaciones();
    const existente = rotaciones.findIndex(rotacion =>
        rotacion.fechaInicio === resultado.fechaInicio &&
        rotacion.fechaFin === resultado.fechaFin
    );

    const nuevaRotacion = {
        id: existente >= 0 ? rotaciones[existente].id : generarIdRotacion(),
        fechaInicio: resultado.fechaInicio,
        fechaFin: resultado.fechaFin,
        personal: resultado.registros.map(registro => ({
            trabajadorId: registro.trabajadorId,
            nombre: registro.nombre,
            dni: registro.dni || '',
            cargo: registro.cargo,
            puestoRotacion: registro.puestoRotacion || '',
            linea: registro.linea || '',
            turno: registro.turno,
            fecha: registro.fecha || '',
            filaExcel: registro.filaExcel
        })),
        creadoEn: existente >= 0 ? (rotaciones[existente].creadoEn || new Date().toISOString()) : new Date().toISOString(),
        actualizadoEn: new Date().toISOString(),
        archivoFilas: resultado.archivoFilas,
        archivoHoja: resultado.nombreHoja || '',
        fuenteAsignacion: 'Excel rotación'
    };

    if (existente >= 0) {
        const confirmar = confirm(
            'Ya existe una rotación para esta vigencia. ¿Deseas actualizarla? Los tareos y asistencias ya registrados se conservarán.'
        );
        if (!confirmar) return;
        rotaciones[existente] = nuevaRotacion;
    } else {
        rotaciones.push(nuevaRotacion);
    }

    try {

        guardarRotaciones(rotaciones);

        window._tareoRotacionPendiente =
            null;

        alert(
            'Rotación aplicada correctamente. Producción utilizará únicamente esta rotación para asignar personal, turno y puesto.'
        );

        renderRotacionSemanal();

    } catch (error) {

        console.error(
            'TAREO: error al guardar la rotación',
            error
        );

        alert(
            'No se pudo guardar la rotación. Revisa la consola para ver el error. La vista previa se conservará para que no pierdas los datos.'
        );
    }
}


function cancelarRotacionPendiente() {

    window._tareoRotacionPendiente =
        null;

    const file =
        document.getElementById(
            'tareo-rotacion-file'
        );

    if (file) {
        file.value = '';
    }

    const preview =
        document.getElementById(
            'tareo-rotacion-preview'
        );

    if (preview) {
        preview.innerHTML = '';
    }
}


/* =========================================================
   RESUMEN MENSUAL
   ========================================================= */

function obtenerResumenMensualTareo(
    año,
    mes,
    area
) {

    /*
       area vacía = todas las áreas que la persona puede ver.
       Cada fila lleva su área; una misma persona no se mezcla
       entre áreas.
    */

    const areas = tareoAreasVisibles().filter(
        item => !area || item === area
    );

    const mapa = new Map();

    const nuevaFila = (persona, areaFila) => ({
        trabajadorId: persona.trabajadorId ?? persona.id,
        nombre: persona.nombre || '',
        dni: persona.dni || '',
        cargo: persona.cargo || '',
        linea: persona.linea || '',
        area: areaFila,
        asistencias: 0,          // solo «Asistió»
        feriados: 0,             // Feriado trabajado
        comisiones: 0,           // Comisión / trabajo externo
        diasTrabajados: 0,       // Asistió + Feriado trabajado + Comisión externa
        faltas: 0,
        permisos: 0,
        descansos: 0,
        vacaciones: 0,
        descansosMedicos: 0,
        tardanzas: 0,
        minutosTardanza: 0,
        horasTrabajadas: 0,
        horasExtras: 0,
        saldoFavor: 0,
        saldoContra: 0
    });

    areas.forEach(areaFila => {

        /*
           Producción NO se precarga desde Gestionar trabajadores.
           Sus filas salen exclusivamente de los tareos creados con
           la rotación Excel. Mantenimiento conserva su fuente actual.
        */
        if (areaFila === 'Producción') {
            return;
        }

        obtenerPersonalTareo('Mantenimiento').forEach(trabajador => {

            mapa.set(
                areaFila + '|' + String(trabajador.id),
                nuevaFila(trabajador, areaFila)
            );
        });
    });

    obtenerTareos()
        .filter(tareo => {

            if (!areas.includes(tareoAreaDe(tareo))) {
                return false;
            }

            const partes = String(tareo.fecha || '').split('-');

            return (
                partes.length === 3 &&
                Number(partes[0]) === Number(año) &&
                Number(partes[1]) === Number(mes)
            );
        })
        .forEach(tareo => {

            const areaFila = tareoAreaDe(tareo);

            (tareo.personal || []).forEach(persona => {

                const clave =
                    areaFila + '|' + String(persona.trabajadorId);

                if (!mapa.has(clave)) {
                    mapa.set(clave, nuevaFila(persona, areaFila));
                }

                const resumen = mapa.get(clave);

                /*
                   faltas   = Falta por justificar
                   permisos = Falta justificada
                   (los nombres de campo se conservan; en pantalla y
                   en el Excel se muestran con su nombre real)
                */

                switch (tareoEstadoCanonico(persona.asistencia)) {

                    case 'Asistió':
                        resumen.asistencias++;
                        resumen.diasTrabajados++;
                        break;

                    case 'Feriado trabajado':
                        resumen.feriados++;
                        resumen.diasTrabajados++;
                        break;

                    case TAREO_ESTADO_COMISION:
                        resumen.comisiones++;
                        resumen.diasTrabajados++;
                        break;

                    case 'Falta por justificar':
                        resumen.faltas++;
                        break;

                    case 'Falta justificada':
                        resumen.permisos++;
                        break;

                    case 'Descanso':
                        resumen.descansos++;
                        break;

                    case 'Vacaciones':
                        resumen.vacaciones++;
                        break;

                    case 'Descanso médico':
                        resumen.descansosMedicos++;
                        break;
                }

                resumen.horasTrabajadas +=
                    Number(persona.horasTrabajadas || 0);

                {
                    const s = tareoSaldoHoras(persona, tareo.jornadaNormal);
                    if (s !== null && s > 0) resumen.saldoFavor += s;
                    if (s !== null && s < 0) resumen.saldoContra += -s;
                }

                resumen.horasExtras +=
                    Number(persona.horasExtras || 0);

                if (Number(persona.tardanzaMinutos || 0) > 0) {

                    resumen.tardanzas++;

                    resumen.minutosTardanza +=
                        Number(persona.tardanzaMinutos);
                }
            });
        });

    return Array.from(mapa.values()).sort(
        (a, b) =>
            a.area.localeCompare(b.area) ||
            String(a.nombre).localeCompare(
                String(b.nombre), 'es', { sensitivity: 'base' }
            )
    );
}


/* =========================================================
   UI RESUMEN MENSUAL
   ========================================================= */

function renderResumenMensualTareoUI() {

    const hoy =
        new Date();

    const año =
        hoy.getFullYear();

    const mes =
        hoy.getMonth() + 1;

    const main =
        document.getElementById('main');

    if (!main) return;

    const areasVisibles = tareoAreasVisibles();

    main.innerHTML = `

        <div class="main-head">

            <div>

                <h2>
                    Resumen mensual
                </h2>

                <div class="sub">
                    Consolidado del personal por área
                </div>

            </div>

            <button
                class="btn btn-ghost"
                onclick="${tareoAreasEditables().length ? 'renderTareoPrincipal()' : 'renderTareoGeneral()'}"
            >
                ← Volver
            </button>

        </div>


        ${tareoRenderTabs('resumen')}


        <div class="panel">

            <div class="panel-body">

                ${window.TareoHE ? `
                <div style="margin-bottom:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
                    ${window.TareoHE.htmlControlesPeriodo()}
                    <span class="small-muted">Período de HORAS EXTRAS y gráficos. «Mes» usa el año y mes de abajo; los contadores generales siguen siendo del mes elegido.</span>
                </div>` : ''}

                <div class="grid grid-2">

                    <div class="field-sm">
                        <label>Año</label>
                        <input
                            type="number"
                            id="tareo-resumen-año"
                            value="${año}"
                            min="2020"
                            max="2100"
                            onchange="actualizarResumenMensualTareo()"
                        >
                    </div>

                    <div class="field-sm">
                        <label>Mes</label>
                        <select
                            id="tareo-resumen-mes"
                            onchange="actualizarResumenMensualTareo()"
                        >
                            ${TAREO_MESES.map(
                                (nombre, indice) => `
                                <option
                                    value="${indice + 1}"
                                    ${indice + 1 === mes ? 'selected' : ''}
                                >
                                    ${nombre}
                                </option>
                            `
                            ).join('')}
                        </select>
                    </div>

                    ${
                        areasVisibles.length > 1
                            ? `
                            <div class="field-sm">
                                <label>Área</label>
                                <select
                                    id="tareo-resumen-area"
                                    onchange="actualizarResumenMensualTareo()"
                                >
                                    <option value="">Todas</option>
                                    ${areasVisibles.map(item => `
                                        <option value="${item}">${item}</option>
                                    `).join('')}
                                </select>
                            </div>
                            `
                            : ''
                    }

                </div>

            </div>

        </div>


        <div id="tareo-resumen-contenido"></div>

    `;

    actualizarResumenMensualTareo();
}


function actualizarResumenMensualTareo() {

    const año =
        Number(
            document.getElementById(
                'tareo-resumen-año'
            )?.value
        );

    const mes =
        Number(
            document.getElementById(
                'tareo-resumen-mes'
            )?.value
        );

    const area =
        document.getElementById(
            'tareo-resumen-area'
        )?.value || '';

    const contenedor =
        document.getElementById(
            'tareo-resumen-contenido'
        );

    if (!contenedor) return;

    const resumen =
        obtenerResumenMensualTareo(
            año,
            mes,
            area
        );

    const totales =
        resumen.reduce(
            (total, item) => {

                total.asistencias += item.asistencias;
                total.feriados += item.feriados;
                total.comisiones += item.comisiones;
                total.dias += item.diasTrabajados;
                total.faltas += item.faltas;
                total.permisos += item.permisos;
                total.descansos += item.descansos;
                total.vacaciones += item.vacaciones;
                total.medicos += item.descansosMedicos;
                total.horas += item.horasTrabajadas;
                total.extras += item.horasExtras;
                total.favor += item.saldoFavor;
                total.contra += item.saldoContra;

                return total;
            },
            {
                asistencias: 0,
                feriados: 0,
                comisiones: 0,
                dias: 0,
                faltas: 0,
                permisos: 0,
                descansos: 0,
                vacaciones: 0,
                medicos: 0,
                horas: 0,
                extras: 0,
                favor: 0,
                contra: 0
            }
        );

    contenedor.innerHTML = `

        <!--
            Primera fila: Asistió · Feriado trabajado · Días trabajados · HORAS EXTRAS. Segunda fila: Faltas por justificar · Faltas
            justificadas · Descansos. La tarjeta COMISIÓN EXTERNA se retiró de este resumen visual: el estado, sus registros y su
            tratamiento en los cálculos (Días trabajados) y en las exportaciones no cambian.
        -->
        <div class="he-kpis">

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Asistió</span>
                <strong class="tareo-good">${totales.asistencias}</strong>
            </div>
            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Feriado trabajado</span>
                <strong>${totales.feriados}</strong>
            </div>
            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Días trabajados</span>
                <strong class="tareo-good">${totales.dias}</strong>
            </div>

            <div id="tareo-he-tarjeta" class="he-slot"></div>

        </div>

        <div class="he-kpis3">

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Faltas por justificar</span>
                <strong class="tareo-bad">${totales.faltas}</strong>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Faltas justificadas</span>
                <strong>${totales.permisos}</strong>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Descansos</span>
                <strong>${totales.descansos}</strong>
            </div>

        </div>

        <div id="tareo-he-raiz"></div>


        <div class="panel">

            <div class="panel-head">

                <h3>Personal</h3>

                <span class="small-muted">
                    ${resumen.length} trabajadores
                </span>

            </div>

            <div class="panel-body">

                <div class="tareo-table-scroll">

                    <table class="tareo-table">

                        <thead>
                            <tr>
                                <th>Trabajador</th>
                                <th>Área</th>
                                <th>DNI</th>
                                <th>Cargo</th>
                                <th>Asistió</th>
                                <th>Feriado trab.</th>
                                <th>Comisión ext.</th>
                                <th>Días trabajados</th>
                                <th>F. por justif.</th>
                                <th>F. justif.</th>
                                <th>Descansos</th>
                                <th>Vacaciones</th>
                                <th>Médico</th>
                                <th>Tardanzas</th>
                                <th>Horas</th>
                                <th>HORAS EXTRAS a favor</th>
                                <th>HORAS EXTRAS en contra</th>
                            </tr>
                        </thead>

                        <tbody>

                            ${resumen.map(
                                item => `
                                <tr>

                                    <td>${tareoBotonNombre(item, '')}</td>

                                    <td>${tareoInsigniaArea(item.area)}</td>

                                    <td>${escaparHTML(item.dni)}</td>

                                    <td>${escaparHTML(item.cargo)}</td>

                                    <td class="tareo-number-good">${item.asistencias}</td>
                                    <td>${item.feriados}</td>
                                    <td>${item.comisiones}</td>
                                    <td class="tareo-number-good"><strong>${item.diasTrabajados}</strong></td>

                                    <td>${item.faltas}</td>

                                    <td>${item.permisos}</td>

                                    <td>${item.descansos}</td>

                                    <td>${item.vacaciones}</td>

                                    <td>${item.descansosMedicos}</td>

                                    <td>${item.tardanzas ? `${item.tardanzas}` : '—'}</td>

                                    <td>${formatearHoras(item.horasTrabajadas)} h</td>

                                    <td>${item.saldoFavor ? `<strong class="tareo-saldo-pos">+${tareoTextoSaldo(item.saldoFavor).replace("+", "")}</strong>` : "—"}</td>
                                    <td>${item.saldoContra ? `<strong class="tareo-saldo-neg">-${tareoTextoSaldo(item.saldoContra).replace("+", "")}</strong>` : "—"}</td>

                                </tr>
                            `
                            ).join('')}

                        </tbody>

                    </table>

                </div>

            </div>

        </div>

        ${tareoResumenPorDiaHTML(año, mes, area)}

    `;

    // Tarjeta HORAS EXTRAS, gráficos y jornadas laboradas (46-tareo-horas-extras.js): consulta, no guarda nada.
    if (window.TareoHE) window.TareoHE.refrescar();
}

/*
   Resumen mensual del personal POR DÍA: una fila por persona con el total
   de días trabajados en el mes (un día cuenta una vez aunque aparezca en
   más de un turno). Bloque separado del personal de planilla.
*/
function tareoResumenPorDiaMensual(año, mes, area) {

    const areas = tareoAreasVisibles().filter(
        item => !area || item === area
    );

    const prefijo = `${año}-${String(mes).padStart(2, '0')}-`;

    const mapa = new Map();

    obtenerTareos()
        .filter(t =>
            areas.includes(tareoAreaDe(t)) &&
            String(t.fecha || '').startsWith(prefijo)
        )
        .forEach(t =>
            tareoPorDiaActivos(t).forEach(p => {

                const clave = (tareoNormalizarDNI(p.dni) ||
                    tareoNormalizarTexto(p.nombre).replace(/\s+/g, ' ')) +
                    '|' + tareoAreaDe(t);

                if (!mapa.has(clave)) {
                    mapa.set(clave, {
                        nombre: p.nombre,
                        dni: p.dni || '',
                        area: tareoAreaDe(t),
                        dias: new Set(),
                        horas: 0,
                        favor: 0,
                        contra: 0
                    });
                }

                const fila = mapa.get(clave);

                fila.dias.add(t.fecha);
                fila.horas += tareoHorasPorDia(p);

                const saldo = tareoSaldoHoras(p, t.jornadaNormal);

                if (saldo !== null && saldo > 0) fila.favor += saldo;
                if (saldo !== null && saldo < 0) fila.contra += -saldo;

                if (!fila.dni && p.dni) fila.dni = p.dni;
            })
        );

    return Array.from(mapa.values())
        .map(f => ({ ...f, totalDias: f.dias.size }))
        .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es', { sensitivity: 'base' }));
}

function tareoResumenPorDiaHTML(año, mes, area) {

    const filas = tareoResumenPorDiaMensual(año, mes, area);

    return `
        <div class="panel">

            <div class="panel-head">
                <h3>Personal por día (no planilla)</h3>
                <span class="small-muted">${filas.length} personas · aparte del personal de planilla</span>
            </div>

            <div class="panel-body">
                ${
                    filas.length
                        ? `
                        <div class="tareo-table-scroll">
                            <table class="tareo-table">
                                <thead>
                                    <tr>
                                        <th>Nombres y apellidos</th>
                                        <th>DNI</th>
                                        <th>Área</th>
                                        <th>Días trabajados</th>
                                        <th>Horas</th>
                                        <th>HORAS EXTRAS a favor</th>
                                        <th>HORAS EXTRAS en contra</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${filas.map(f => `
                                        <tr>
                                            <td><strong>${escaparHTML(f.nombre)}</strong></td>
                                            <td>${escaparHTML(f.dni || '—')}</td>
                                            <td>${tareoInsigniaArea(f.area)}</td>
                                            <td class="tareo-number-good">${f.totalDias}</td>
                                            <td>${formatearHoras(f.horas)} h</td>
                                            <td>${f.favor ? `<strong class="tareo-saldo-pos">+${tareoTextoSaldo(f.favor).replace("+", "")}</strong>` : '—'}</td>
                                            <td>${f.contra ? `<strong class="tareo-saldo-neg">-${tareoTextoSaldo(f.contra).replace("+", "")}</strong>` : '—'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        `
                        : '<div class="empty-state"><p>Sin personal por día en este mes.</p></div>'
                }
            </div>

        </div>
    `;
}


/* =========================================================
   EXPORTACIÓN EXCEL PROFESIONAL
   ========================================================= */

function exportarTareoExcel(id) {

    const tareo =
        obtenerTareos().find(
            item =>
                item.id === id
        );

    if (!tareo) {

        alert(
            'No se encontró el tareo.'
        );

        return;
    }

    if (
        typeof XLSX ===
        'undefined'
    ) {

        alert(
            'SheetJS no está disponible.'
        );

        return;
    }

    const personal =
        ordenarPersonalTareo(
            tareo.personal || []
        );


    /* =====================================================
       HOJA 01 - TAREO
       ===================================================== */

    const datosTareo =
        personal.map(
            persona => ({

                'Fecha':
                    tareo.fecha,

                'Turno':
                    tareo.turno,

                'DNI':
                    persona.dni,

                'Trabajador':
                    persona.nombre,

                'Área': tareoAreaDe(tareo),

                'Cargo':
                    persona.cargo,

                'Línea':
                    persona.linea ||
                    'Sin línea',

                'Asistencia':
                    tareoEtiquetaEstado(persona.asistencia),

                'Hora ingreso':
                    persona.horaIngreso ||
                    '',

                'Refrigerio (h)':
                    Number(
                        persona.refrigerio ||
                        0
                    ),

                'Hora salida':
                    persona.horaSalida ||
                    '',

                'Horas trabajadas':
                    Number(
                        persona.horasTrabajadas ||
                        0
                    ),

                'HORAS EXTRAS':
                    tareoSaldoNumero(tareoSaldoHoras(persona, tareo.jornadaNormal)),


                'Tardanza (min)':
                    Number(
                        persona.tardanzaMinutos ||
                        0
                    ),

                'Observaciones':
                    tareo.observaciones ||
                    ''

            })
        );


    /* =====================================================
       HOJA 02 - RESUMEN
       ===================================================== */

    const gAsis = tareoResumenAsistencia(personal);

    const asistieron = gAsis.presentes;

    const faltas =
        personal.filter(
            persona =>
                tareoEstadoCanonico(persona.asistencia) === 'Falta por justificar'
        ).length;

    const permisos =
        personal.filter(
            persona =>
                tareoEstadoCanonico(persona.asistencia) === 'Falta justificada'
        ).length;

    const descansos =
        personal.filter(
            persona =>
                tareoEstadoCanonico(persona.asistencia) === 'Descanso'
        ).length;

    const vacaciones =
        personal.filter(
            persona =>
                tareoEstadoCanonico(persona.asistencia) === 'Vacaciones'
        ).length;

    const medicos =
        personal.filter(
            persona =>
                tareoEstadoCanonico(persona.asistencia) === 'Descanso médico'
        ).length;

    const tardanzas = gAsis.tardanzas;

    const horasTrabajadas =
        personal.reduce(
            (
                total,
                persona
            ) =>
                total +
                Number(
                    persona.horasTrabajadas ||
                    0
                ),
            0
        );

    const horasExtras =
        personal.reduce(
            (
                total,
                persona
            ) =>
                total +
                Number(
                    persona.horasExtras ||
                    0
                ),
            0
        );

    const datosResumen = [
        {
            'Indicador':
                'Área',
            'Valor':
                tareoAreaDe(tareo)
        },

        {
            'Indicador':
                'Fecha',

            'Valor':
                tareo.fecha
        },

        {
            'Indicador':
                'Turno',

            'Valor':
                tareo.turno
        },

        {
            'Indicador':
                'Hora programada',

            'Valor':
                tareo.horaProgramadaIngreso
        },

        {
            'Indicador':
                'Jornada normal',

            'Valor':
                Number(
                    tareo.jornadaNormal ||
                    8
                )
        },

        {
            'Indicador':
                'Total personal',

            'Valor':
                personal.length
        },

        {
            'Indicador':
                'Presentes (asistió, feriado trabajado y comisión)',
            'Valor':
                asistieron
        },

        {
            'Indicador':
                'En comisión / trabajo externo (incluidos en presentes)',
            'Valor':
                gAsis.enComision
        },

        {
            'Indicador':
                'Faltas por justificar',

            'Valor':
                faltas
        },

        {
            'Indicador':
                'Faltas justificadas',

            'Valor':
                permisos
        },

        {
            'Indicador':
                'Descansos',

            'Valor':
                descansos
        },

        {
            'Indicador':
                'Vacaciones',

            'Valor':
                vacaciones
        },

        {
            'Indicador':
                'Descanso médico',

            'Valor':
                medicos
        },

        {
            'Indicador':
                'Total faltas (por justificar + justificadas)',
            'Valor':
                gAsis.faltas
        },

        {
            'Indicador':
                'Total descansos (descanso + descanso médico)',
            'Valor':
                gAsis.descansos
        },

        {
            'Indicador':
                'Otros ausentes (vacaciones, suspensión, licencias)',
            'Valor':
                gAsis.otros
        },

        {
            'Indicador':
                'Sin registrar',
            'Valor':
                gAsis.sinRegistrar
        },

        {
            'Indicador':
                'Trabajadores con tardanza',

            'Valor':
                tardanzas
        },

        {
            'Indicador':
                'Horas trabajadas',

            'Valor':
                Number(
                    horasTrabajadas.toFixed(2)
                )
        },

        {
            'Indicador':
                'HORAS EXTRAS (saldo neto)',

            'Valor':
                Number(
                    tareoContadores(personal, tareo.jornadaNormal).saldo.toFixed(2)
                )
        }

    ];


    /* =====================================================
       HOJA 03 - PERSONAL
       ===================================================== */

    const datosPersonal =
        personal.map(
            persona => ({

                'DNI':
                    persona.dni,

                'Trabajador':
                    persona.nombre,

                'Área': tareoAreaDe(tareo),

                'Cargo':
                    persona.cargo,

                'Línea':
                    persona.linea ||
                    'Sin línea',

                'Estado':
                    tareoEtiquetaEstado(persona.asistencia),

                'Hora ingreso':
                    persona.horaIngreso ||
                    '',

                'Hora salida':
                    persona.horaSalida ||
                    '',

                'Horas trabajadas':
                    Number(
                        persona.horasTrabajadas ||
                        0
                    ),

                'HORAS EXTRAS':
                    tareoSaldoNumero(tareoSaldoHoras(persona, tareo.jornadaNormal)),

                'Tardanza':
                    Number(
                        persona.tardanzaMinutos ||
                        0
                    )

            })
        );


    const workbook =
        XLSX.utils.book_new();

    const wsTareo =
        XLSX.utils.json_to_sheet(
            datosTareo
        );

    const wsResumen =
        XLSX.utils.json_to_sheet(
            datosResumen
        );

    const wsPersonal =
        XLSX.utils.json_to_sheet(
            datosPersonal
        );


    /* =====================================================
       ESTILOS
       ===================================================== */

    aplicarEstiloExcelTareo(
        wsTareo,
        [
            'Fecha',
            'Turno',
            'DNI',
            'Trabajador',
            'Área',
            'Cargo',
            'Línea',
            'Asistencia',
            'Hora ingreso',
            'Refrigerio (h)',
            'Hora salida',
            'Horas trabajadas',
            'HORAS EXTRAS',
            'Tardanza (min)',
            'Observaciones'
        ]
    );

    aplicarEstiloExcelTareo(
        wsResumen,
        [
            'Indicador',
            'Valor'
        ]
    );

    aplicarEstiloExcelTareo(
        wsPersonal,
        [
            'DNI',
            'Trabajador',
            'Área',
            'Cargo',
            'Línea',
            'Estado',
            'Hora ingreso',
            'Hora salida',
            'Horas trabajadas',
            'HORAS EXTRAS',
            'Tardanza'
        ]
    );


    wsTareo['!freeze'] = {
        xSplit: 0,
        ySplit: 1
    };

    wsPersonal['!freeze'] = {
        xSplit: 0,
        ySplit: 1
    };


    wsTareo['!autofilter'] = {
        ref:
            wsTareo['!ref']
    };

    wsPersonal['!autofilter'] = {
        ref:
            wsPersonal['!ref']
    };


    wsTareo['!cols'] = [

        { wch: 13 },
        { wch: 10 },
        { wch: 14 },
        { wch: 30 },
        { wch: 15 },
        { wch: 28 },
        { wch: 16 },
        { wch: 18 },
        { wch: 15 },
        { wch: 17 },
        { wch: 15 },
        { wch: 18 },
        { wch: 15 },
        { wch: 17 },
        { wch: 35 }

    ];

    wsResumen['!cols'] = [
        { wch: 30 },
        { wch: 22 }
    ];

    wsPersonal['!cols'] = [

        { wch: 14 },
        { wch: 30 },
        { wch: 15 },
        { wch: 28 },
        { wch: 16 },
        { wch: 20 },
        { wch: 15 },
        { wch: 15 },
        { wch: 18 },
        { wch: 15 },
        { wch: 15 }

    ];


    XLSX.utils.book_append_sheet(
        workbook,
        wsTareo,
        '01_TAREO'
    );

    XLSX.utils.book_append_sheet(
        workbook,
        wsResumen,
        '02_RESUMEN'
    );

    XLSX.utils.book_append_sheet(
        workbook,
        wsPersonal,
        '03_PERSONAL'
    );

    // Personal por día (no planilla): hoja aparte, solo si hay.
    tareoAgregarHojaPorDia(workbook, [tareo], '04_POR_DIA');


    XLSX.writeFile(
        workbook,
        `Tareo_${tareoNormalizarTexto(tareoAreaDe(tareo))}_${tareo.fecha}_${tareo.turno}.xlsx`
    );
}


/* =========================================================
   ESTILOS EXCEL
   ========================================================= */

function aplicarEstiloExcelTareo(
    hoja,
    columnas
) {

    if (
        !hoja ||
        !hoja['!ref']
    ) {
        return;
    }

    const rango =
        XLSX.utils.decode_range(
            hoja['!ref']
        );

    for (
        let columna = rango.s.c;
        columna <= rango.e.c;
        columna++
    ) {

        const celda =
            hoja[
                XLSX.utils.encode_cell({
                    r: 0,
                    c: columna
                })
            ];

        if (!celda) continue;

        celda.s = {

            font: {
                bold: true,
                color: {
                    rgb: 'FFFFFF'
                }
            },

            fill: {
                fgColor: {
                    rgb: '005B96'
                }
            },

            alignment: {
                horizontal:
                    'center',
                vertical:
                    'center'
            }

        };
    }
}


/* =========================================================
   EXPORTAR PNG
   ========================================================= */

function exportarTareoPNG(id) {

    const tareo =
        obtenerTareos().find(
            item =>
                item.id === id
        );

    if (!tareo) return;

    const personal =
        ordenarPersonalTareo(
            tareo.personal || []
        );

    const canvas =
        document.createElement(
            'canvas'
        );

    const ctx =
        canvas.getContext(
            '2d'
        );

    const ancho =
        1600;

    const alto =
        260 +
        personal.length * 48 +
        100;

    canvas.width =
        ancho;

    canvas.height =
        alto;

    ctx.fillStyle =
        '#FFFFFF';

    ctx.fillRect(
        0,
        0,
        ancho,
        alto
    );

    ctx.fillStyle =
        '#003B5C';

    ctx.fillRect(
        0,
        0,
        ancho,
        130
    );

    ctx.fillStyle =
        '#FFFFFF';

    ctx.font =
        'bold 38px Arial';

    ctx.fillText(
        `GLACIAL — TAREO DE PERSONAL · ${tareoAreaDe(tareo).toUpperCase()}`,
        50,
        58
    );

    ctx.font =
        '20px Arial';

    ctx.fillText(
        `${formatearFecha(
            tareo.fecha
        )} · Turno ${tareo.turno}`,
        50,
        98
    );

    const columnas = [
        'TRABAJADOR',
        'CARGO',
        'LÍNEA',
        'ASISTENCIA',
        'INGRESO',
        'SALIDA',
        'HORAS',
        'EXTRAS'
    ];

    const posiciones = [
        50,
        410,
        700,
        870,
        1080,
        1190,
        1300,
        1430
    ];

    ctx.fillStyle =
        '#F2F6F8';

    ctx.fillRect(
        30,
        155,
        ancho - 60,
        55
    );

    ctx.fillStyle =
        '#405261';

    ctx.font =
        'bold 16px Arial';

    columnas.forEach(
        (
            columna,
            indice
        ) => {

            ctx.fillText(
                columna,
                posiciones[indice],
                190
            );
        }
    );

    personal.forEach(
        (
            persona,
            indice
        ) => {

            const y =
                245 +
                indice * 48;

            if (
                indice % 2 === 0
            ) {

                ctx.fillStyle =
                    '#F8FAFB';

                ctx.fillRect(
                    30,
                    y - 30,
                    ancho - 60,
                    48
                );
            }

            ctx.fillStyle =
                '#172B3A';

            ctx.font =
                '15px Arial';

            ctx.fillText(
                String(
                    persona.nombre ||
                    ''
                ).substring(
                    0,
                    32
                ),
                posiciones[0],
                y
            );

            ctx.fillText(
                String(
                    persona.cargo ||
                    ''
                ).substring(
                    0,
                    25
                ),
                posiciones[1],
                y
            );

            ctx.fillText(
                String(
                    persona.linea ||
                    'Sin línea'
                ),
                posiciones[2],
                y
            );

            ctx.fillText(
                tareoEtiquetaEstado(persona.asistencia),
                posiciones[3],
                y,
                200
            );

            ctx.fillText(
                persona.horaIngreso ||
                    '—',
                posiciones[4],
                y
            );

            ctx.fillText(
                persona.horaSalida ||
                    '—',
                posiciones[5],
                y
            );

            ctx.fillText(
                formatearHoras(
                    persona.horasTrabajadas
                ),
                posiciones[6],
                y
            );

            ctx.fillText(
                formatearHoras(
                    persona.horasExtras
                ),
                posiciones[7],
                y
            );
        }
    );

    const enlace =
        document.createElement(
            'a'
        );

    enlace.download =
        `Tareo_${tareoNormalizarTexto(tareoAreaDe(tareo))}_${tareo.fecha}_${tareo.turno}.png`;

    enlace.href =
        canvas.toDataURL(
            'image/png'
        );

    enlace.click();
}


/* =========================================================
   EXPORTAR RESUMEN MENSUAL
   ========================================================= */

function exportarResumenMensualTareo() {

    const año =
        Number(
            document.getElementById(
                'tareo-resumen-año'
            )?.value
        );

    const mes =
        Number(
            document.getElementById(
                'tareo-resumen-mes'
            )?.value
        );

    const area =
        document.getElementById(
            'tareo-resumen-area'
        )?.value || '';

    const resumen =
        obtenerResumenMensualTareo(
            año,
            mes,
            area
        );

    if (
        typeof XLSX ===
        'undefined'
    ) {

        alert(
            'SheetJS no está disponible.'
        );

        return;
    }

    const datos =
        resumen.map(
            item => ({
                'DNI': item.dni,
                'Trabajador': item.nombre,
                'Área': item.area,
                'Cargo': item.cargo,
                'Línea': item.linea || 'Sin línea',
                'Asistió': item.asistencias,
                'Feriado trabajado': item.feriados,
                'Comisión externa': item.comisiones,
                'Días trabajados': item.diasTrabajados,
                'Faltas por justificar': item.faltas,
                'Faltas justificadas': item.permisos,
                'Descansos': item.descansos,
                'Vacaciones': item.vacaciones,
                'Descanso médico': item.descansosMedicos,
                'Tardanzas': item.tardanzas,
                'Minutos tardanza': item.minutosTardanza,
                'Horas trabajadas': Number(item.horasTrabajadas.toFixed(2)),
                'HORAS EXTRAS a favor': Number(item.saldoFavor.toFixed(2)),
                'HORAS EXTRAS en contra': Number(item.saldoContra.toFixed(2))
            })
        );

    const workbook =
        XLSX.utils.book_new();

    const hoja =
        XLSX.utils.json_to_sheet(
            datos
        );

    aplicarEstiloExcelTareo(
        hoja,
        Object.keys(
            datos[0] || {}
        )
    );

    hoja['!autofilter'] = {
        ref:
            hoja['!ref']
    };

    hoja['!freeze'] = {
        xSplit: 0,
        ySplit: 1
    };

    hoja['!cols'] = [
        { wch: 14 },
        { wch: 30 },
        { wch: 15 },
        { wch: 28 },
        { wch: 16 },
        { wch: 13 },
        { wch: 17 },
        { wch: 16 },
        { wch: 15 },
        { wch: 20 },
        { wch: 18 },
        { wch: 12 },
        { wch: 14 },
        { wch: 18 },
        { wch: 13 },
        { wch: 18 },
        { wch: 18 },
        { wch: 15 }
    ];

    XLSX.utils.book_append_sheet(
        workbook,
        hoja,
        'Resumen mensual'
    );

    // Personal por día (no planilla): hoja aparte con días trabajados del mes.
    const porDia = tareoResumenPorDiaMensual(año, mes, area);

    if (porDia.length) {

        const datosPorDia = porDia.map(f => ({
            'Nombres y apellidos': f.nombre,
            'DNI': f.dni,
            'Área': f.area,
            'Tipo': 'POR DÍA',
            'Días trabajados': f.totalDias,
            'Horas trabajadas': Number(f.horas.toFixed(2))
        }));

        const hojaPorDia = XLSX.utils.json_to_sheet(datosPorDia);

        aplicarEstiloExcelTareo(hojaPorDia, Object.keys(datosPorDia[0]));

        hojaPorDia['!cols'] = [
            { wch: 32 }, { wch: 12 }, { wch: 15 },
            { wch: 10 }, { wch: 16 }, { wch: 16 }
        ];

        XLSX.utils.book_append_sheet(workbook, hojaPorDia, 'Personal por día');
    }

    XLSX.writeFile(
        workbook,
        `Resumen_Tareo${area ? '_' + tareoNormalizarTexto(area) : ''}_${año}_${String(
            mes
        ).padStart(2, '0')}.xlsx`
    );
}


/* =========================================================
   INICIALIZACIÓN
   ========================================================= */

window.openTareo =
    openTareo;

window.nuevoTareo =
    nuevoTareo;

window.renderTareoPrincipal =
    renderTareoPrincipal;

window.guardarTareoActual =
    guardarTareoActual;

window.verTareo =
    verTareo;

window.editarTareo =
    editarTareo;

window.eliminarTareo =
    eliminarTareo;

window.renderHistorialTareo =
    renderHistorialTareo;

window.exportarTareoExcel =
    exportarTareoExcel;

window.exportarTareoPNG =
    exportarTareoPNG;

window.actualizarAsistenciaTareo =
    actualizarAsistenciaTareo;

window.actualizarHoraIngresoTareo =
    actualizarHoraIngresoTareo;

window.actualizarRefrigerioTareo =
    actualizarRefrigerioTareo;

window.actualizarHoraSalidaTareo =
    actualizarHoraSalidaTareo;

window.obtenerResumenMensualTareo =
    obtenerResumenMensualTareo;

window.renderResumenMensualTareoUI =
    renderResumenMensualTareoUI;

window.actualizarResumenMensualTareo =
    actualizarResumenMensualTareo;

window.renderRotacionSemanal =
    renderRotacionSemanal;

window.previsualizarRotacionExcel =
    previsualizarRotacionExcel;

window.aplicarRotacionPendiente =
    aplicarRotacionPendiente;

window.cancelarRotacionPendiente =
    cancelarRotacionPendiente;

window.renderTareoGeneral =
    renderTareoGeneral;
window.exportarTareoGeneralExcel =
    exportarTareoGeneralExcel;
window.tareoGeneralFiltrar =
    tareoGeneralFiltrar;
window.tareoAbrir =
    tareoAbrir;
window.tareoConfirmarNuevo =
    tareoConfirmarNuevo;
window.tareoCambiarAreaVista =
    tareoCambiarAreaVista;
window.tareoMarcarAsistio =
    tareoMarcarAsistio;
window.tareoSalidaAhora =
    tareoSalidaAhora;
window.tareoActualizarConfig =
    tareoActualizarConfig;
window.tareoFiltrarPersonal =
    tareoFiltrarPersonal;
window.tareoAbrirAgregarPersonal =
    tareoAbrirAgregarPersonal;
window.tareoAgregarPersonal =
    tareoAgregarPersonal;
window.tareoAbrirFicha =
    tareoAbrirFicha;
window.tareoRefrescarFormularioRemoto =
    tareoRefrescarFormularioRemoto;

window.exportarResumenMensualTareo =
    exportarResumenMensualTareo;
    exportarResumenMensualTareo;


/*
   Última barrera de escritura: la función de bajo nivel que reemplaza
   TODO el documento sync/tareos solo actúa para quien gestiona al menos
   un área. Una llamada manual desde la consola de un usuario de solo
   visualización no modifica nada.
*/
(function protegerGuardadoTareos() {

    if (typeof saveTareos !== 'function') return;

    const guardarOriginal = saveTareos;

    saveTareos = function (tareos) {

        if (
            typeof state === 'undefined' ||
            !state.user ||
            esUsuarioSoloConsulta(state.user) ||
            !tareoAreasEditables().length
        ) {
            tareoAvisoSinPermisoEscritura('saveTareos');
            return;
        }

        // No se permite agregar/quitar tareos de un área que no gestiona.
        const editables = tareoAreasEditables();

        const idsFuera = lista =>
            (Array.isArray(lista) ? lista : [])
                .filter(t => t && !editables.includes(tareoAreaDe(t)))
                .map(t => t.id)
                .sort()
                .join('|');

        if (idsFuera(tareos) !== idsFuera(loadTareos())) {
            tareoAvisoSinPermisoEscritura('saveTareos fuera de su área');
            return;
        }

        return guardarOriginal.apply(this, arguments);
    };

})();


tareoInyectarEstilos();