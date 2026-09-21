/* =========================================================
   GLACIAL - TAREO DE PERSONAL
   =========================================================

   Funciones principales:
   - Tareo Día / Noche
   - Personal proveniente de 11-trabajadores.js
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
    'Permiso',
    'Descanso',
    'Vacaciones',
    'Descanso médico',
    'Falta'
];

const TAREO_ESTADOS_FINAL = [
    'Permiso',
    'Descanso',
    'Vacaciones',
    'Descanso médico',
    'Falta'
];

let tareoActualId = null;


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


function tareoCargoPermitido(cargo) {
    const cargoNormalizado = tareoNormalizarTexto(cargo);

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
   PERSONAL
   ========================================================= */

function obtenerPersonalTareo() {

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

    return trabajadores.filter(trabajador => {

        if (!trabajador) return false;

        const estado = tareoNormalizarTexto(
            trabajador.estado
        );

        return (
            estado === 'activo' &&
            tareoCargoPermitido(trabajador.cargo)
        );
    });
}


/* =========================================================
   STORAGE TAREOS
   ========================================================= */

function obtenerTareos() {

    try {

        const datos = localStorage.getItem(
            TAREO_STORAGE_KEY
        );

        if (!datos) return [];

        const tareos = JSON.parse(datos);

        return Array.isArray(tareos)
            ? tareos
            : [];

    } catch (error) {

        console.error(
            'TAREO: Error leyendo almacenamiento:',
            error
        );

        return [];
    }
}


function guardarTareos(tareos) {

    localStorage.setItem(
        TAREO_STORAGE_KEY,
        JSON.stringify(tareos)
    );
}


function guardarTareoEnMemoria(tareo) {

    const tareos = obtenerTareos();

    const indice = tareos.findIndex(
        item => item.id === tareo.id
    );

    if (indice >= 0) {
        tareos[indice] = tareo;
    } else {
        tareos.push(tareo);
    }

    guardarTareos(tareos);
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

function obtenerPersonalPorRotacion(
    fecha,
    turno
) {

    const personalBase = obtenerPersonalTareo();

    const rotacion = obtenerRotacionVigente(
        fecha
    );

    if (!rotacion) {

        return {
            tieneRotacion: false,
            rotacion: null,
            personal: personalBase
        };
    }

    const turnoNormalizado =
        normalizarTurno(turno);

    const registros =
        Array.isArray(rotacion.personal)
            ? rotacion.personal
            : [];

    /*
       El personal del tareo se arma directamente con los
       datos guardados en la rotación (nombre, DNI, cargo,
       línea), sin depender de que exista un trabajador con
       ese mismo DNI en la base de Trabajadores.

       Si sí existe una coincidencia en la base de
       Trabajadores, se usa para completar/actualizar cargo
       y línea con el dato más reciente; si no existe, se
       usa tal cual vino en la rotación (y por lo tanto en
       el Excel original).
    */

    const vistos = new Set();

    const personalDeRotacion = [];

    registros.forEach(registro => {

        if (
            normalizarTurno(
                registro.turno
            ) !== turnoNormalizado
        ) {
            return;
        }

        let trabajador = null;

        if (registro.trabajadorId) {

            trabajador =
                personalBase.find(
                    persona =>
                        String(persona.id) ===
                        String(registro.trabajadorId)
                );
        }

        if (
            !trabajador &&
            registro.dni
        ) {

            const dni =
                tareoNormalizarDNI(
                    registro.dni
                );

            if (dni) {

                trabajador =
                    personalBase.find(
                        persona =>
                            tareoNormalizarDNI(
                                persona.dni
                            ) === dni
                    );
            }
        }

        const id =
            registro.trabajadorId ||
            (trabajador ? trabajador.id : null) ||
            registro.dni ||
            registro.nombre;

        const clave = String(id);

        if (vistos.has(clave)) {
            return;
        }

        vistos.add(clave);

        personalDeRotacion.push({

            id,

            nombre:
                (trabajador && trabajador.nombre) ||
                registro.nombre ||
                '',

            dni:
                (trabajador && trabajador.dni) ||
                registro.dni ||
                '',

            cargo:
                (trabajador && trabajador.cargo) ||
                registro.cargo ||
                '',

            linea:
                (trabajador && trabajador.linea) ||
                registro.linea ||
                ''

        });
    });

    return {
        tieneRotacion: true,
        rotacion,
        personal: personalDeRotacion
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
            asistencia
        );

    if (estado === 'asistio') return 1;
    if (estado === 'permiso') return 2;
    if (estado === 'descanso') return 3;
    if (estado === 'vacaciones') return 4;
    if (estado === 'descanso medico') return 5;
    if (estado === 'falta') return 6;

    return 7;
}


function ordenarPersonalTareo(personal) {

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
    turno
) {

    const resultado =
        obtenerPersonalPorRotacion(
            fecha,
            turno
        );

    const personal =
        resultado.personal.map(
            trabajador => ({

                trabajadorId:
                    trabajador.id,

                nombre:
                    trabajador.nombre || '',

                dni:
                    trabajador.dni || '',

                cargo:
                    trabajador.cargo || '',

                area:
                    'Producción',

                linea:
                    trabajador.linea || '',

                asistencia:
                    'Asistió',

                horaIngreso:
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
                    0

            })
        );

    return ordenarPersonalTareo(
        personal
    );
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

    renderTareoPrincipal();
}


/* =========================================================
   PRINCIPAL
   ========================================================= */

function renderTareoPrincipal() {

    const main =
        document.getElementById('main');

    if (!main) return;

    const tareos =
        obtenerTareos();

    const personal =
        obtenerPersonalTareo();

    const ultima =
        [...tareos].sort(
            (a, b) =>
                String(b.fecha || '')
                    .localeCompare(
                        String(a.fecha || '')
                    )
        )[0];

    main.innerHTML = `

        <div class="main-head">

            <div>

                <h2>Tareo de Personal</h2>

                <div class="sub">
                    Control de asistencia,
                    jornada y horas del personal
                    de producción
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


        <div class="tareo-tabs">

            <button
                class="tareo-tab active"
                onclick="renderTareoPrincipal()"
            >
                Tareo
            </button>

            <button
                class="tareo-tab"
                onclick="renderHistorialTareo()"
            >
                Historial
            </button>

            <button
                class="tareo-tab"
                onclick="renderResumenMensualTareoUI()"
            >
                Resumen mensual
            </button>

            <button
                class="tareo-tab"
                onclick="renderRotacionSemanal()"
            >
                Rotación semanal
            </button>

        </div>


        <div class="tareo-kpi-grid">

            <div class="tareo-kpi">

                <span class="tareo-kpi-label">
                    Personal activo
                </span>

                <strong>
                    ${personal.length}
                </strong>

                <small>
                    Producción
                </small>

            </div>


            <div class="tareo-kpi">

                <span class="tareo-kpi-label">
                    Tareos registrados
                </span>

                <strong>
                    ${tareos.length}
                </strong>

                <small>
                    Histórico
                </small>

            </div>


            <div class="tareo-kpi">

                <span class="tareo-kpi-label">
                    Último tareo
                </span>

                <strong>
                    ${
                        ultima
                            ? formatearFecha(
                                ultima.fecha
                              )
                            : '-'
                    }
                </strong>

                <small>
                    ${
                        ultima
                            ? escaparHTML(
                                ultima.turno
                              )
                            : 'Sin registros'
                    }
                </small>

            </div>


            <div class="tareo-kpi">

                <span class="tareo-kpi-label">
                    Rotación vigente
                </span>

                <strong
                    class="${
                        obtenerRotacionVigente(
                            obtenerFechaHoy()
                        )
                        ? 'tareo-good'
                        : 'tareo-warn'
                    }"
                >
                    ${
                        obtenerRotacionVigente(
                            obtenerFechaHoy()
                        )
                        ? 'ACTIVA'
                        : 'PENDIENTE'
                    }
                </strong>

                <small>
                    Semana actual
                </small>

            </div>

        </div>


        <div class="panel">

            <div class="panel-head">

                <h3>
                    Personal de producción
                </h3>

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
                                        <th>Estado</th>

                                    </tr>

                                </thead>

                                <tbody>

                                    ${ordenarPersonalTareo(
                                        personal.map(
                                            trabajador => ({
                                                ...trabajador,
                                                asistencia:
                                                    'Asistió'
                                            })
                                        )
                                    ).map(
                                        trabajador => `

                                        <tr>

                                            <td>
                                                <strong>
                                                    ${escaparHTML(
                                                        trabajador.nombre
                                                    )}
                                                </strong>
                                            </td>

                                            <td>
                                                ${escaparHTML(
                                                    trabajador.dni
                                                )}
                                            </td>

                                            <td>
                                                ${escaparHTML(
                                                    trabajador.cargo
                                                )}
                                            </td>

                                            <td>
                                                ${
                                                    trabajador.linea
                                                        ? escaparHTML(
                                                            trabajador.linea
                                                          )
                                                        : 'Sin línea'
                                                }
                                            </td>

                                            <td>
                                                <span class="tareo-status asistio">
                                                    Activo
                                                </span>
                                            </td>

                                        </tr>

                                    `
                                    ).join('')}

                                </tbody>

                            </table>

                        </div>
                        `
                        : `
                        <div class="empty-state">

                            <h4>
                                No hay personal disponible
                            </h4>

                            <p>
                                Verifica los trabajadores
                                activos registrados.
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

    const fecha =
        obtenerFechaHoy();

    const turno = 'Día';

    const resultado =
        obtenerPersonalPorRotacion(
            fecha,
            turno
        );

    if (
        resultado.tieneRotacion &&
        resultado.personal.length === 0
    ) {

        alert(
            'La rotación semanal está activa, pero no se encontraron trabajadores asignados al turno Día para esta fecha.'
        );

        return;
    }

    const personal =
        crearPersonalTareo(
            fecha,
            turno
        );

    if (!personal.length) {

        alert(
            'No hay personal activo de producción disponible para crear el tareo.'
        );

        return;
    }

    const tareo = {

        id:
            generarIdTareo(),

        fecha,

        turno,

        horaProgramadaIngreso:
            turno === 'Noche'
                ? '19:00'
                : '07:00',

        jornadaNormal:
            8,

        estado:
            'Abierto',

        observaciones:
            '',

        rotacionId:
            resultado.rotacion
                ? resultado.rotacion.id
                : null,

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

    const personal =
        ordenarPersonalTareo(
            tareo.personal || []
        );

    const rotacion =
        obtenerRotacionVigente(
            tareo.fecha
        );

    main.innerHTML = `

        <div class="main-head">

            <div>

                <h2>
                    ${tareo.id
                        ? 'Registro de Tareo'
                        : 'Nuevo Tareo'}
                </h2>

                <div class="sub">
                    Control diario del personal
                    de producción
                </div>

            </div>

            <button
                class="btn btn-ghost"
                onclick="renderTareoPrincipal()"
            >
                ← Volver
            </button>

        </div>


        <div class="panel tareo-config-panel">

            <div class="panel-head">

                <h3>
                    Configuración del turno
                </h3>

                ${
                    rotacion
                        ? `
                        <span class="tareo-rotation-active">
                            ROTACIÓN VIGENTE
                        </span>
                        `
                        : `
                        <span class="tareo-rotation-pending">
                            SIN ROTACIÓN
                        </span>
                        `
                }

            </div>


            <div class="panel-body">

                <div class="grid grid-4">

                    <div class="field-sm">

                        <label>
                            Fecha
                        </label>

                        <input
                            type="date"
                            id="tareo-fecha"
                            value="${escaparHTML(
                                tareo.fecha
                            )}"
                        >

                    </div>


                    <div class="field-sm">

                        <label>
                            Turno
                        </label>

                        <select
                            id="tareo-turno"
                            onchange="cambiarTurnoTareo()"
                        >

                            <option
                                value="Día"
                                ${
                                    tareo.turno === 'Día'
                                        ? 'selected'
                                        : ''
                                }
                            >
                                Día
                            </option>

                            <option
                                value="Noche"
                                ${
                                    tareo.turno === 'Noche'
                                        ? 'selected'
                                        : ''
                                }
                            >
                                Noche
                            </option>

                        </select>

                    </div>


                    <div class="field-sm">

                        <label>
                            Hora programada
                        </label>

                        <input
                            type="time"
                            id="tareo-hora-programada"
                            value="${escaparHTML(
                                tareo.horaProgramadaIngreso
                            )}"
                        >

                    </div>


                    <div class="field-sm">

                        <label>
                            Jornada normal
                        </label>

                        <input
                            type="number"
                            id="tareo-jornada"
                            min="1"
                            max="24"
                            step="0.5"
                            value="${Number(
                                tareo.jornadaNormal || 8
                            )}"
                        >

                    </div>

                </div>


                <div class="tareo-rotation-note">

                    ${
                        rotacion
                            ? `
                            <span>
                                ✓ Rotación:
                                <strong>
                                    ${formatearFecha(
                                        rotacion.fechaInicio
                                    )}
                                    —
                                    ${formatearFecha(
                                        rotacion.fechaFin
                                    )}
                                </strong>
                            </span>

                            <span>
                                Personal cargado:
                                <strong>
                                    ${personal.length}
                                </strong>
                            </span>
                            `
                            : `
                            <span>
                                ⚠ No existe una rotación semanal
                                vigente para esta fecha.
                            </span>

                            <button
                                type="button"
                                class="btn btn-sm btn-ghost"
                                onclick="renderRotacionSemanal()"
                            >
                                Cargar rotación
                            </button>
                            `
                    }

                </div>

            </div>

        </div>


        <div class="panel">

            <div class="panel-head">

                <div>

                    <h3>
                        Personal
                    </h3>

                    <div class="small-muted">
                        Asistencia y jornada del turno
                    </div>

                </div>

                <span class="tareo-count-badge">
                    ${personal.length} personas
                </span>

            </div>


            <div class="panel-body tareo-table-panel">

                <div class="tareo-table-scroll">

                    <table
                        class="tareo-table tareo-edit-table"
                    >

                        <thead>

                            <tr>

                                <th>#</th>
                                <th>Trabajador</th>
                                <th>Cargo</th>
                                <th>Línea</th>
                                <th>Asistencia</th>
                                <th>Ingreso</th>
                                <th>Refrigerio</th>
                                <th>Salida</th>
                                <th>Horas</th>
                                <th>Extras</th>
                                <th>Tardanza</th>

                            </tr>

                        </thead>

                        <tbody>

                            ${personal.map(
                                (persona, index) =>
                                    renderFilaPersonalTareo(
                                        persona,
                                        index
                                    )
                            ).join('')}

                        </tbody>

                    </table>

                </div>

            </div>

        </div>


        <div class="panel">

            <div class="panel-head">

                <h3>
                    Observaciones
                </h3>

            </div>

            <div class="panel-body">

                <textarea
                    id="tareo-observaciones"
                    class="tareo-observaciones"
                    rows="3"
                    placeholder="Ingrese observaciones del turno..."
                >${escaparHTML(
                    tareo.observaciones || ''
                )}</textarea>

            </div>

        </div>


        <div class="actions-row tareo-actions">

            <button
                class="btn btn-ghost"
                onclick="renderTareoPrincipal()"
            >
                Cancelar
            </button>

            <button
                class="btn btn-primary"
                onclick="guardarTareoActual()"
            >
                Guardar Tareo
            </button>

        </div>

    `;
}


/* =========================================================
   FILA PERSONAL
   ========================================================= */

function renderFilaPersonalTareo(
    persona,
    index
) {

    const asistencia =
        persona.asistencia ||
        'Asistió';

    const deshabilitado =
        asistencia !== 'Asistió'
            ? 'disabled'
            : '';

    return `

        <tr
            data-tareo-persona="${index}"
            class="${
                asistencia !== 'Asistió'
                    ? 'tareo-row-no-asistencia'
                    : ''
            }"
        >

            <td>
                <span class="tareo-row-number">
                    ${index + 1}
                </span>
            </td>


            <td>

                <div class="tareo-worker">

                    <strong>
                        ${escaparHTML(
                            persona.nombre
                        )}
                    </strong>

                    <small>
                        DNI:
                        ${escaparHTML(
                            persona.dni
                        )}
                    </small>

                </div>

            </td>


            <td>
                ${escaparHTML(
                    persona.cargo
                )}
            </td>


            <td>
                ${
                    persona.linea
                        ? escaparHTML(
                            persona.linea
                          )
                        : 'Sin línea'
                }
            </td>


            <td>

                <select
                    class="tareo-asistencia-select"
                    onchange="
                        actualizarAsistenciaTareo(
                            ${index},
                            this.value
                        )
                    "
                >

                    ${TAREO_ESTADOS_ASISTENCIA.map(
                        estado => `
                        <option
                            value="${escaparHTML(
                                estado
                            )}"
                            ${
                                asistencia === estado
                                    ? 'selected'
                                    : ''
                            }
                        >
                            ${escaparHTML(
                                estado
                            )}
                        </option>
                        `
                    ).join('')}

                </select>

            </td>


            <td>

                <input
                    type="time"
                    value="${escaparHTML(
                        persona.horaIngreso || ''
                    )}"
                    ${deshabilitado}
                    onchange="
                        actualizarHoraIngresoTareo(
                            ${index},
                            this.value
                        )
                    "
                >

            </td>


            <td>

                <input
                    type="number"
                    min="0"
                    max="4"
                    step="0.25"
                    value="${
                        Number(
                            persona.refrigerio || 0
                        )
                    }"
                    ${deshabilitado}
                    onchange="
                        actualizarRefrigerioTareo(
                            ${index},
                            this.value
                        )
                    "
                >

            </td>


            <td>

                <input
                    type="time"
                    value="${escaparHTML(
                        persona.horaSalida || ''
                    )}"
                    ${deshabilitado}
                    onchange="
                        actualizarHoraSalidaTareo(
                            ${index},
                            this.value
                        )
                    "
                >

            </td>


            <td>

                <strong class="tareo-hours">
                    ${formatearHoras(
                        persona.horasTrabajadas
                    )}
                </strong>

            </td>


            <td>

                <strong class="tareo-hours-extra">
                    ${formatearHoras(
                        persona.horasExtras
                    )}
                </strong>

            </td>


            <td>

                <span
                    class="${
                        Number(
                            persona.tardanzaMinutos || 0
                        ) > 0
                            ? 'tareo-late'
                            : 'tareo-on-time'
                    }"
                >
                    ${
                        Number(
                            persona.tardanzaMinutos || 0
                        ) > 0
                            ? formatearMinutos(
                                persona.tardanzaMinutos
                              )
                            : '—'
                    }
                </span>

            </td>

        </tr>

    `;
}


/* =========================================================
   CAMBIAR TURNO
   ========================================================= */

function cambiarTurnoTareo() {

    const tareos =
        obtenerTareos();

    const tareo =
        tareos.find(
            item =>
                item.id === tareoActualId
        );

    if (!tareo) return;

    const turno =
        document.getElementById(
            'tareo-turno'
        )?.value || 'Día';

    const fecha =
        document.getElementById(
            'tareo-fecha'
        )?.value || tareo.fecha;

    const resultado =
        obtenerPersonalPorRotacion(
            fecha,
            turno
        );

    tareo.fecha = fecha;
    tareo.turno = turno;

    tareo.horaProgramadaIngreso =
        turno === 'Noche'
            ? '19:00'
            : '07:00';

    if (resultado.personal.length) {

        const personalActual =
            tareo.personal || [];

        tareo.personal =
            resultado.personal.map(
                trabajador => {

                    const anterior =
                        personalActual.find(
                            persona =>
                                String(
                                    persona.trabajadorId
                                ) ===
                                String(
                                    trabajador.id
                                )
                        );

                    if (anterior) {
                        return anterior;
                    }

                    return {
                        trabajadorId:
                            trabajador.id,
                        nombre:
                            trabajador.nombre || '',
                        dni:
                            trabajador.dni || '',
                        cargo:
                            trabajador.cargo || '',
                        area:
                            'Producción',
                        linea:
                            trabajador.linea || '',
                        asistencia:
                            'Asistió',
                        horaIngreso:
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
                            0
                    };
                }
            );
    }

    tareo.personal =
        ordenarPersonalTareo(
            tareo.personal
        );

    guardarTareoEnMemoria(
        tareo
    );

    renderTareoFormulario(
        tareo
    );
}


/* =========================================================
   ACTUALIZACIONES
   ========================================================= */

function actualizarAsistenciaTareo(
    index,
    asistencia
) {

    const tareos =
        obtenerTareos();

    const tareo =
        tareos.find(
            item =>
                item.id === tareoActualId
        );

    if (!tareo) return;

    const persona =
        tareo.personal[index];

    if (!persona) return;

    persona.asistencia =
        asistencia;

    if (asistencia !== 'Asistió') {

        persona.horaIngreso = '';
        persona.refrigerio = 0;
        persona.horaSalida = '';
        persona.horasTrabajadas = 0;
        persona.horasExtras = 0;
        persona.tardanzaMinutos = 0;
    }

    tareo.personal =
        ordenarPersonalTareo(
            tareo.personal
        );

    guardarTareoEnMemoria(
        tareo
    );

    renderTareoFormulario(
        tareo
    );
}


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
    index,
    hora
) {

    const tareo =
        obtenerTareos().find(
            item =>
                item.id === tareoActualId
        );

    if (!tareo) return;

    const persona =
        tareo.personal[index];

    if (!persona) return;

    persona.horaIngreso =
        hora;

    recalcularPersonaTareo(
        persona,
        tareo
    );

    guardarTareoEnMemoria(
        tareo
    );

    renderTareoFormulario(
        tareo
    );
}


function actualizarRefrigerioTareo(
    index,
    valor
) {

    const tareo =
        obtenerTareos().find(
            item =>
                item.id === tareoActualId
        );

    if (!tareo) return;

    const persona =
        tareo.personal[index];

    if (!persona) return;

    persona.refrigerio =
        Number(valor) || 0;

    recalcularPersonaTareo(
        persona,
        tareo
    );

    guardarTareoEnMemoria(
        tareo
    );

    renderTareoFormulario(
        tareo
    );
}


function actualizarHoraSalidaTareo(
    index,
    hora
) {

    const tareo =
        obtenerTareos().find(
            item =>
                item.id === tareoActualId
        );

    if (!tareo) return;

    const persona =
        tareo.personal[index];

    if (!persona) return;

    persona.horaSalida =
        hora;

    recalcularPersonaTareo(
        persona,
        tareo
    );

    guardarTareoEnMemoria(
        tareo
    );

    renderTareoFormulario(
        tareo
    );
}


/* =========================================================
   GUARDAR TAREO
   ========================================================= */

function guardarTareoActual() {

    const tareos =
        obtenerTareos();

    const tareo =
        tareos.find(
            item =>
                item.id === tareoActualId
        );

    if (!tareo) {

        alert(
            'No se encontró el tareo.'
        );

        return;
    }

    const fecha =
        document.getElementById(
            'tareo-fecha'
        )?.value;

    const turno =
        document.getElementById(
            'tareo-turno'
        )?.value;

    const horaProgramada =
        document.getElementById(
            'tareo-hora-programada'
        )?.value;

    const jornada =
        Number(
            document.getElementById(
                'tareo-jornada'
            )?.value
        ) || 8;

    const observaciones =
        document.getElementById(
            'tareo-observaciones'
        )?.value || '';

    tareo.fecha =
        fecha || tareo.fecha;

    tareo.turno =
        turno || tareo.turno;

    tareo.horaProgramadaIngreso =
        horaProgramada ||
        tareo.horaProgramadaIngreso;

    tareo.jornadaNormal =
        jornada;

    tareo.observaciones =
        observaciones;

    tareo.personal =
        ordenarPersonalTareo(
            tareo.personal
        );

    tareo.personal.forEach(
        persona =>
            recalcularPersonaTareo(
                persona,
                tareo
            )
    );

    tareo.estado =
        'Abierto';

    const rotacion =
        obtenerRotacionVigente(
            tareo.fecha
        );

    tareo.rotacionId =
        rotacion
            ? rotacion.id
            : null;

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

    const tareos =
        [...obtenerTareos()].sort(
            (a, b) =>
                String(b.fecha || '')
                    .localeCompare(
                        String(a.fecha || '')
                    )
        );

    main.innerHTML = `

        <div class="main-head">

            <div>

                <h2>
                    Historial de Tareo
                </h2>

                <div class="sub">
                    Registros históricos
                    del personal de producción
                </div>

            </div>

            <button
                class="btn btn-primary"
                onclick="nuevoTareo()"
            >
                + Nuevo Tareo
            </button>

        </div>


        <div class="tareo-tabs">

            <button
                class="tareo-tab"
                onclick="renderTareoPrincipal()"
            >
                Tareo
            </button>

            <button
                class="tareo-tab active"
                onclick="renderHistorialTareo()"
            >
                Historial
            </button>

            <button
                class="tareo-tab"
                onclick="renderResumenMensualTareoUI()"
            >
                Resumen mensual
            </button>

            <button
                class="tareo-tab"
                onclick="renderRotacionSemanal()"
            >
                Rotación semanal
            </button>

        </div>


        <div class="panel">

            <div class="panel-head">

                <h3>
                    Registros
                </h3>

                <span class="small-muted">
                    ${tareos.length} tareos
                </span>

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
                                        <th>Turno</th>
                                        <th>Personal</th>
                                        <th>Asistieron</th>
                                        <th>Ausencias</th>
                                        <th>Tardanzas</th>
                                        <th>Horas extra</th>
                                        <th>Estado</th>
                                        <th>Acciones</th>

                                    </tr>

                                </thead>

                                <tbody>

                                    ${tareos.map(
                                        tareo => {

                                            const personal =
                                                tareo.personal || [];

                                            const asistieron =
                                                personal.filter(
                                                    persona =>
                                                        persona.asistencia ===
                                                        'Asistió'
                                                ).length;

                                            const ausencias =
                                                personal.filter(
                                                    persona =>
                                                        persona.asistencia !==
                                                        'Asistió'
                                                ).length;

                                            const tardanzas =
                                                personal.filter(
                                                    persona =>
                                                        Number(
                                                            persona.tardanzaMinutos
                                                        ) > 0
                                                ).length;

                                            const horasExtra =
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

                                            return `

                                                <tr>

                                                    <td>
                                                        <strong>
                                                            ${formatearFecha(
                                                                tareo.fecha
                                                            )}
                                                        </strong>
                                                    </td>

                                                    <td>
                                                        <span class="tareo-shift-badge ${tareo.turno === 'Noche' ? 'night' : 'day'}">
                                                            ${escaparHTML(
                                                                tareo.turno
                                                            )}
                                                        </span>
                                                    </td>

                                                    <td>
                                                        ${personal.length}
                                                    </td>

                                                    <td>
                                                        <span class="tareo-number-good">
                                                            ${asistieron}
                                                        </span>
                                                    </td>

                                                    <td>
                                                        ${ausencias}
                                                    </td>

                                                    <td>
                                                        ${
                                                            tardanzas
                                                                ? `
                                                                <span class="tareo-number-warn">
                                                                    ${tardanzas}
                                                                </span>
                                                                `
                                                                : '—'
                                                        }
                                                    </td>

                                                    <td>
                                                        ${formatearHoras(
                                                            horasExtra
                                                        )} h
                                                    </td>

                                                    <td>
                                                        <span class="badge good">
                                                            ${escaparHTML(
                                                                tareo.estado ||
                                                                'Abierto'
                                                            )}
                                                        </span>
                                                    </td>

                                                    <td>

                                                        <div class="tareo-action-buttons">

                                                            <button
                                                                class="btn btn-sm btn-ghost"
                                                                onclick="verTareo('${tareo.id}')"
                                                            >
                                                                Ver
                                                            </button>

                                                            <button
                                                                class="btn btn-sm btn-ghost"
                                                                onclick="editarTareo('${tareo.id}')"
                                                            >
                                                                Editar
                                                            </button>

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
                                                            </button>

                                                            ${
                                                                tienePermiso('eliminarRegistros')
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

    tareoActualId = id;

    renderTareoFormulario(
        tareo
    );
}


/* =========================================================
   ELIMINAR TAREO
   ========================================================= */

function eliminarTareo(id) {

    if (
        !tienePermiso(
            'eliminarRegistros'
        )
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

    const confirmar =
        confirm(
            `¿Eliminar el tareo del ${formatearFecha(tareo.fecha)} ` +
            `(${tareo.turno})? Esta acción no se puede deshacer.`
        );

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

    const personal =
        ordenarPersonalTareo(
            tareo.personal || []
        );

    const asistieron =
        personal.filter(
            persona =>
                persona.asistencia ===
                'Asistió'
        ).length;

    const ausencias =
        personal.length -
        asistieron;

    const horas =
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

    const extras =
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

    main.innerHTML = `

        <div class="main-head">

            <div>

                <h2>
                    Tareo ${formatearFecha(
                        tareo.fecha
                    )}
                </h2>

                <div class="sub">
                    ${escaparHTML(
                        tareo.turno
                    )}
                    ·
                    ${escaparHTML(
                        tareo.id
                    )}
                </div>

            </div>

            <div class="tareo-head-actions">

                <button
                    class="btn btn-ghost"
                    onclick="renderHistorialTareo()"
                >
                    ← Historial
                </button>

                <button
                    class="btn btn-primary"
                    onclick="editarTareo('${tareo.id}')"
                >
                    Editar
                </button>

                ${
                    tienePermiso('eliminarRegistros')
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

                <span class="tareo-kpi-label">
                    Personal
                </span>

                <strong>
                    ${personal.length}
                </strong>

            </div>

            <div class="tareo-kpi">

                <span class="tareo-kpi-label">
                    Asistieron
                </span>

                <strong class="tareo-good">
                    ${asistieron}
                </strong>

            </div>

            <div class="tareo-kpi">

                <span class="tareo-kpi-label">
                    Ausencias
                </span>

                <strong>
                    ${ausencias}
                </strong>

            </div>

            <div class="tareo-kpi">

                <span class="tareo-kpi-label">
                    Horas extra
                </span>

                <strong>
                    ${formatearHoras(
                        extras
                    )} h
                </strong>

            </div>

        </div>


        <div class="panel">

            <div class="panel-head">

                <h3>
                    Registro del personal
                </h3>

                <span class="small-muted">
                    ${formatearHoras(
                        horas
                    )} horas acumuladas
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
                                <th>Extras</th>
                                <th>Tardanza</th>

                            </tr>

                        </thead>

                        <tbody>

                            ${personal.map(
                                persona => `

                                <tr>

                                    <td>

                                        <div class="tareo-worker">

                                            <strong>
                                                ${escaparHTML(
                                                    persona.nombre
                                                )}
                                            </strong>

                                            <small>
                                                DNI:
                                                ${escaparHTML(
                                                    persona.dni
                                                )}
                                            </small>

                                        </div>

                                    </td>

                                    <td>
                                        ${escaparHTML(
                                            persona.cargo
                                        )}
                                    </td>

                                    <td>
                                        ${
                                            persona.linea
                                                ? escaparHTML(
                                                    persona.linea
                                                  )
                                                : 'Sin línea'
                                        }
                                    </td>

                                    <td>
                                        <span class="tareo-status ${tareoClaseEstado(persona.asistencia)}">
                                            ${escaparHTML(
                                                persona.asistencia
                                            )}
                                        </span>
                                    </td>

                                    <td>
                                        ${persona.horaIngreso || '—'}
                                    </td>

                                    <td>
                                        ${
                                            Number(
                                                persona.refrigerio || 0
                                            ) > 0
                                                ? `${persona.refrigerio} h`
                                                : '—'
                                        }
                                    </td>

                                    <td>
                                        ${persona.horaSalida || '—'}
                                    </td>

                                    <td>
                                        ${formatearHoras(
                                            persona.horasTrabajadas
                                        )} h
                                    </td>

                                    <td>
                                        ${formatearHoras(
                                            persona.horasExtras
                                        )} h
                                    </td>

                                    <td>
                                        ${
                                            Number(
                                                persona.tardanzaMinutos ||
                                                0
                                            ) > 0
                                                ? formatearMinutos(
                                                    persona.tardanzaMinutos
                                                  )
                                                : '—'
                                        }
                                    </td>

                                </tr>

                            `
                            ).join('')}

                        </tbody>

                    </table>

                </div>

            </div>

        </div>


        ${
            tareo.observaciones
                ? `
                <div class="panel">

                    <div class="panel-head">

                        <h3>
                            Observaciones
                        </h3>

                    </div>

                    <div class="panel-body">

                        <p class="tareo-observations-read">
                            ${escaparHTML(
                                tareo.observaciones
                            )}
                        </p>

                    </div>

                </div>
                `
                : ''
        }

    `;
}


function tareoClaseEstado(
    estado
) {

    const texto =
        tareoNormalizarTexto(
            estado
        );

    if (texto === 'asistio') {
        return 'asistio';
    }

    if (
        texto === 'permiso' ||
        texto === 'descanso'
    ) {
        return 'neutral';
    }

    if (
        texto === 'vacaciones' ||
        texto === 'descanso medico'
    ) {
        return 'warn';
    }

    if (texto === 'falta') {
        return 'falta';
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


        <div class="tareo-tabs">

            <button
                class="tareo-tab"
                onclick="if(confirmarAbandonoRotacionPendiente())renderTareoPrincipal()"
            >
                Tareo
            </button>

            <button
                class="tareo-tab"
                onclick="if(confirmarAbandonoRotacionPendiente())renderHistorialTareo()"
            >
                Historial
            </button>

            <button
                class="tareo-tab"
                onclick="if(confirmarAbandonoRotacionPendiente())renderResumenMensualTareoUI()"
            >
                Resumen mensual
            </button>

            <button
                class="tareo-tab active"
                onclick="renderRotacionSemanal()"
            >
                Rotación semanal
            </button>

        </div>


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

                                            const dia =
                                                rotacion.personal.filter(
                                                    persona =>
                                                        normalizarTurno(
                                                            persona.turno
                                                        ) ===
                                                        'Día'
                                                ).length;

                                            const noche =
                                                rotacion.personal.filter(
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
                                                            rotacion.personal
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
                filas
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

function interpretarRotacionExcel(
    filas
) {

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

    const columnaNombre =
        encontrarColumna(
            filas,
            [
                'trabajador',
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

    const columnaFecha =
        encontrarColumna(
            filas,
            [
                'fecha',
                'dia',
                'día'
            ]
        );

    const columnaCargo =
        encontrarColumna(
            filas,
            [
                'cargo',
                'puesto',
                'posicion',
                'posición'
            ]
        );

    const columnaLinea =
        encontrarColumna(
            filas,
            [
                'linea',
                'línea',
                'area',
                'área'
            ]
        );

    if (
        !columnaDNI &&
        !columnaNombre
    ) {

        throw new Error(
            'No se encontró una columna de DNI/documento ni una columna de trabajador/nombre.'
        );
    }

    if (!columnaTurno) {

        throw new Error(
            'No se encontró la columna de Turno.'
        );
    }

    /*
       La base de trabajadores (11-trabajadores.js) ya NO es
       requisito para poder subir la rotación: cada fila del
       Excel se importa con sus propios datos (nombre, DNI,
       cargo, línea). Si el DNI o el nombre coinciden con un
       trabajador registrado, se usa para completar datos que
       falten en el Excel (cargo/línea) y para mantener el
       mismo identificador entre semanas — pero la ausencia
       de coincidencia ya no descarta la fila.
    */

    const personalBase =
        obtenerPersonalTareo();

    const porDNI =
        new Map();

    const porNombre =
        new Map();

    personalBase.forEach(
        trabajador => {

            const dni =
                tareoNormalizarDNI(
                    trabajador.dni
                );

            if (dni) {
                porDNI.set(
                    dni,
                    trabajador
                );
            }

            const nombre =
                tareoNormalizarTexto(
                    trabajador.nombre
                );

            if (nombre) {
                porNombre.set(
                    nombre,
                    trabajador
                );
            }
        }
    );

    let fechaDetectada = '';

    const registros = [];
    const sinCoincidencia = [];
    const invalidos = [];

    filas.forEach(
        (fila, indice) => {

            const dni =
                columnaDNI
                    ? tareoNormalizarDNI(
                        fila[columnaDNI]
                      )
                    : '';

            const nombre =
                columnaNombre
                    ? String(
                        fila[columnaNombre] || ''
                      ).trim()
                    : '';

            const turno =
                normalizarTurno(
                    fila[columnaTurno]
                );

            if (!turno) {

                invalidos.push({

                    fila:
                        indice + 2,

                    nombre,
                    dni,

                    motivo:
                        'Turno no reconocido'

                });

                return;
            }

            if (
                !dni &&
                !nombre
            ) {

                invalidos.push({

                    fila:
                        indice + 2,

                    nombre,
                    dni,

                    motivo:
                        'Falta el nombre y el DNI del trabajador'

                });

                return;
            }

            let trabajador = null;

            if (dni) {

                trabajador =
                    porDNI.get(
                        dni
                    );
            }

            if (
                !trabajador &&
                nombre
            ) {

                trabajador =
                    porNombre.get(
                        tareoNormalizarTexto(
                            nombre
                        )
                    );
            }

            if (!trabajador) {

                sinCoincidencia.push({

                    fila:
                        indice + 2,

                    nombre,

                    dni,

                    turno

                });
            }

            const cargoExcel =
                columnaCargo
                    ? String(
                        fila[columnaCargo] || ''
                      ).trim()
                    : '';

            const lineaExcel =
                columnaLinea
                    ? String(
                        fila[columnaLinea] || ''
                      ).trim()
                    : '';

            let fecha =
                columnaFecha
                    ? normalizarFechaExcel(
                        fila[columnaFecha]
                      )
                    : '';

            if (fecha) {
                fechaDetectada =
                    fecha;
            }

            registros.push({

                trabajadorId:
                    trabajador
                        ? trabajador.id
                        : ('EXCEL-' + (dni || tareoNormalizarTexto(nombre))),

                nombre:
                    nombre ||
                    (trabajador ? trabajador.nombre : ''),

                dni:
                    dni ||
                    (trabajador ? trabajador.dni : ''),

                cargo:
                    cargoExcel ||
                    (trabajador ? trabajador.cargo : '') ||
                    '',

                linea:
                    lineaExcel ||
                    (trabajador ? trabajador.linea : '') ||
                    '',

                turno,

                fecha

            });
        }
    );

    if (!fechaDetectada) {

        fechaDetectada =
            obtenerInicioSemana(
                obtenerFechaHoy()
            );
    }

    const fechaInicio =
        obtenerInicioSemana(
            fechaDetectada
        );

    const fechaFin =
        obtenerFinSemana(
            fechaInicio
        );

    const duplicados = [];

    const claves =
        new Set();

    registros.forEach(
        registro => {

            const clave =
                `${registro.trabajadorId}-${registro.turno}`;

            if (claves.has(clave)) {

                duplicados.push(
                    registro
                );

            } else {

                claves.add(clave);
            }
        }
    );

    const registrosUnicos =
        registros.filter(
            registro => {

                const clave =
                    `${registro.trabajadorId}-${registro.turno}`;

                if (
                    !registro._procesado
                ) {

                    registro._procesado =
                        true;

                    return true;
                }

                return false;
            }
        );

    return {

        archivoFilas:
            filas.length,

        registros:
            registrosUnicos,

        sinCoincidencia,

        invalidos,

        duplicados,

        fechaInicio,

        fechaFin,

        columnaDNI,

        columnaNombre,

        columnaTurno,

        columnaFecha

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

                <strong>
                    ${formatearFecha(
                        resultado.fechaInicio
                    )}
                    —
                    ${formatearFecha(
                        resultado.fechaFin
                    )}
                </strong>

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
                        <th>Cargo</th>
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

    const resultado =
        window._tareoRotacionPendiente;

    if (!resultado) {

        alert(
            'No existe una rotación pendiente de aplicar.'
        );

        return;
    }

    if (
        !resultado.registros.length
    ) {

        alert(
            'No existen registros válidos para aplicar.'
        );

        return;
    }

    if (
        resultado.invalidos.length
    ) {

        alert(
            'Corrija los registros inválidos antes de aplicar la rotación.'
        );

        return;
    }

    const rotaciones =
        obtenerRotaciones();

    const nuevaRotacion = {

        id:
            generarIdRotacion(),

        fechaInicio:
            resultado.fechaInicio,

        fechaFin:
            resultado.fechaFin,

        personal:
            resultado.registros.map(
                registro => {

                    const copia = {
                        ...registro
                    };

                    delete copia._procesado;

                    return copia;
                }
            ),

        creadoEn:
            new Date().toISOString(),

        archivoFilas:
            resultado.archivoFilas

    };

    const existente =
        rotaciones.findIndex(
            rotacion =>
                rotacion.fechaInicio ===
                    nuevaRotacion.fechaInicio &&
                rotacion.fechaFin ===
                    nuevaRotacion.fechaFin
        );

    if (existente >= 0) {

        const confirmar =
            confirm(
                'Ya existe una rotación para esta semana. ¿Desea reemplazarla?'
            );

        if (!confirmar) {
            return;
        }

        rotaciones[existente] =
            nuevaRotacion;

    } else {

        rotaciones.push(
            nuevaRotacion
        );
    }

    guardarRotaciones(
        rotaciones
    );

    window._tareoRotacionPendiente =
        null;

    alert(
        'Rotación semanal aplicada correctamente.'
    );

    renderRotacionSemanal();
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
    mes
) {

    const tareos =
        obtenerTareos();

    const personal =
        obtenerPersonalTareo();

    const mapa =
        new Map();

    personal.forEach(
        trabajador => {

            mapa.set(
                String(
                    trabajador.id
                ),
                {

                    trabajadorId:
                        trabajador.id,

                    nombre:
                        trabajador.nombre || '',

                    dni:
                        trabajador.dni || '',

                    cargo:
                        trabajador.cargo || '',

                    linea:
                        trabajador.linea || '',

                    asistencias:
                        0,

                    faltas:
                        0,

                    permisos:
                        0,

                    descansos:
                        0,

                    vacaciones:
                        0,

                    descansosMedicos:
                        0,

                    tardanzas:
                        0,

                    minutosTardanza:
                        0,

                    horasTrabajadas:
                        0,

                    horasExtras:
                        0

                }
            );
        }
    );

    tareos
        .filter(
            tareo => {

                const fecha =
                    String(
                        tareo.fecha || ''
                    );

                if (!fecha) return false;

                const partes =
                    fecha.split('-');

                if (
                    partes.length !== 3
                ) {
                    return false;
                }

                return (
                    Number(partes[0]) ===
                        Number(año) &&
                    Number(partes[1]) ===
                        Number(mes)
                );
            }
        )
        .forEach(
            tareo => {

                (
                    tareo.personal || []
                ).forEach(
                    persona => {

                        const clave =
                            String(
                                persona.trabajadorId
                            );

                        if (
                            !mapa.has(
                                clave
                            )
                        ) {

                            mapa.set(
                                clave,
                                {

                                    trabajadorId:
                                        persona.trabajadorId,

                                    nombre:
                                        persona.nombre || '',

                                    dni:
                                        persona.dni || '',

                                    cargo:
                                        persona.cargo || '',

                                    linea:
                                        persona.linea || '',

                                    asistencias:
                                        0,

                                    faltas:
                                        0,

                                    permisos:
                                        0,

                                    descansos:
                                        0,

                                    vacaciones:
                                        0,

                                    descansosMedicos:
                                        0,

                                    tardanzas:
                                        0,

                                    minutosTardanza:
                                        0,

                                    horasTrabajadas:
                                        0,

                                    horasExtras:
                                        0

                                }
                            );
                        }

                        const resumen =
                            mapa.get(
                                clave
                            );

                        switch (
                            persona.asistencia
                        ) {

                            case 'Asistió':
                                resumen.asistencias++;
                                break;

                            case 'Falta':
                                resumen.faltas++;
                                break;

                            case 'Permiso':
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
                            Number(
                                persona.horasTrabajadas ||
                                0
                            );

                        resumen.horasExtras +=
                            Number(
                                persona.horasExtras ||
                                0
                            );

                        if (
                            Number(
                                persona.tardanzaMinutos ||
                                0
                            ) > 0
                        ) {

                            resumen.tardanzas++;

                            resumen.minutosTardanza +=
                                Number(
                                    persona.tardanzaMinutos
                                );
                        }
                    }
                );
            }
        );

    return ordenarPersonalTareo(
        Array.from(
            mapa.values()
        ).map(
            item => ({
                ...item,
                asistencia:
                    'Asistió'
            })
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

    main.innerHTML = `

        <div class="main-head">

            <div>

                <h2>
                    Resumen mensual
                </h2>

                <div class="sub">
                    Consolidado del personal
                    de producción
                </div>

            </div>

            <button
                class="btn btn-ghost"
                onclick="renderTareoPrincipal()"
            >
                ← Volver
            </button>

        </div>


        <div class="tareo-tabs">

            <button
                class="tareo-tab"
                onclick="renderTareoPrincipal()"
            >
                Tareo
            </button>

            <button
                class="tareo-tab"
                onclick="renderHistorialTareo()"
            >
                Historial
            </button>

            <button
                class="tareo-tab active"
                onclick="renderResumenMensualTareoUI()"
            >
                Resumen mensual
            </button>

            <button
                class="tareo-tab"
                onclick="renderRotacionSemanal()"
            >
                Rotación semanal
            </button>

        </div>


        <div class="panel">

            <div class="panel-body">

                <div class="grid grid-2">

                    <div class="field-sm">

                        <label>
                            Año
                        </label>

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

                        <label>
                            Mes
                        </label>

                        <select
                            id="tareo-resumen-mes"
                            onchange="actualizarResumenMensualTareo()"
                        >

                            ${[
                                'Enero',
                                'Febrero',
                                'Marzo',
                                'Abril',
                                'Mayo',
                                'Junio',
                                'Julio',
                                'Agosto',
                                'Septiembre',
                                'Octubre',
                                'Noviembre',
                                'Diciembre'
                            ].map(
                                (nombre, indice) => `

                                <option
                                    value="${indice + 1}"
                                    ${
                                        indice + 1 === mes
                                            ? 'selected'
                                            : ''
                                    }
                                >
                                    ${nombre}
                                </option>

                            `
                            ).join('')}

                        </select>

                    </div>

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

    const contenedor =
        document.getElementById(
            'tareo-resumen-contenido'
        );

    if (!contenedor) return;

    const resumen =
        obtenerResumenMensualTareo(
            año,
            mes
        );

    const totales =
        resumen.reduce(
            (
                total,
                item
            ) => {

                total.asistencias +=
                    item.asistencias;

                total.faltas +=
                    item.faltas;

                total.permisos +=
                    item.permisos;

                total.descansos +=
                    item.descansos;

                total.vacaciones +=
                    item.vacaciones;

                total.medicos +=
                    item.descansosMedicos;

                total.horas +=
                    item.horasTrabajadas;

                total.extras +=
                    item.horasExtras;

                return total;

            },
            {
                asistencias: 0,
                faltas: 0,
                permisos: 0,
                descansos: 0,
                vacaciones: 0,
                medicos: 0,
                horas: 0,
                extras: 0
            }
        );

    contenedor.innerHTML = `

        <div class="tareo-kpi-grid">

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">
                    Asistencias
                </span>
                <strong class="tareo-good">
                    ${totales.asistencias}
                </strong>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">
                    Faltas
                </span>
                <strong class="tareo-bad">
                    ${totales.faltas}
                </strong>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">
                    Permisos
                </span>
                <strong>
                    ${totales.permisos}
                </strong>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">
                    Descansos
                </span>
                <strong>
                    ${totales.descansos}
                </strong>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">
                    Horas trabajadas
                </span>
                <strong>
                    ${formatearHoras(
                        totales.horas
                    )} h
                </strong>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">
                    Horas extra
                </span>
                <strong>
                    ${formatearHoras(
                        totales.extras
                    )} h
                </strong>
            </div>

        </div>


        <div class="panel">

            <div class="panel-head">

                <h3>
                    Personal
                </h3>

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
                                <th>DNI</th>
                                <th>Cargo</th>
                                <th>Asist.</th>
                                <th>Faltas</th>
                                <th>Permisos</th>
                                <th>Descansos</th>
                                <th>Vacaciones</th>
                                <th>Médico</th>
                                <th>Tardanzas</th>
                                <th>Horas</th>
                                <th>Extras</th>

                            </tr>

                        </thead>

                        <tbody>

                            ${resumen.map(
                                item => `

                                <tr>

                                    <td>
                                        <strong>
                                            ${escaparHTML(
                                                item.nombre
                                            )}
                                        </strong>
                                    </td>

                                    <td>
                                        ${escaparHTML(
                                            item.dni
                                        )}
                                    </td>

                                    <td>
                                        ${escaparHTML(
                                            item.cargo
                                        )}
                                    </td>

                                    <td class="tareo-number-good">
                                        ${item.asistencias}
                                    </td>

                                    <td>
                                        ${item.faltas}
                                    </td>

                                    <td>
                                        ${item.permisos}
                                    </td>

                                    <td>
                                        ${item.descansos}
                                    </td>

                                    <td>
                                        ${item.vacaciones}
                                    </td>

                                    <td>
                                        ${item.descansosMedicos}
                                    </td>

                                    <td>
                                        ${
                                            item.tardanzas
                                                ? `${item.tardanzas}`
                                                : '—'
                                        }
                                    </td>

                                    <td>
                                        ${formatearHoras(
                                            item.horasTrabajadas
                                        )} h
                                    </td>

                                    <td>
                                        ${formatearHoras(
                                            item.horasExtras
                                        )} h
                                    </td>

                                </tr>

                            `
                            ).join('')}

                        </tbody>

                    </table>

                </div>

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

                'Área':
                    'Producción',

                'Cargo':
                    persona.cargo,

                'Línea':
                    persona.linea ||
                    'Sin línea',

                'Asistencia':
                    persona.asistencia,

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

                'Horas extras':
                    Number(
                        persona.horasExtras ||
                        0
                    ),

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

    const asistieron =
        personal.filter(
            persona =>
                persona.asistencia ===
                'Asistió'
        ).length;

    const faltas =
        personal.filter(
            persona =>
                persona.asistencia ===
                'Falta'
        ).length;

    const permisos =
        personal.filter(
            persona =>
                persona.asistencia ===
                'Permiso'
        ).length;

    const descansos =
        personal.filter(
            persona =>
                persona.asistencia ===
                'Descanso'
        ).length;

    const vacaciones =
        personal.filter(
            persona =>
                persona.asistencia ===
                'Vacaciones'
        ).length;

    const medicos =
        personal.filter(
            persona =>
                persona.asistencia ===
                'Descanso médico'
        ).length;

    const tardanzas =
        personal.filter(
            persona =>
                Number(
                    persona.tardanzaMinutos ||
                    0
                ) > 0
        ).length;

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
                'Asistieron',

            'Valor':
                asistieron
        },

        {
            'Indicador':
                'Faltas',

            'Valor':
                faltas
        },

        {
            'Indicador':
                'Permisos',

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
                'Horas extras',

            'Valor':
                Number(
                    horasExtras.toFixed(2)
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

                'Área':
                    'Producción',

                'Cargo':
                    persona.cargo,

                'Línea':
                    persona.linea ||
                    'Sin línea',

                'Estado':
                    persona.asistencia,

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

                'Horas extras':
                    Number(
                        persona.horasExtras ||
                        0
                    ),

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
            'Horas extras',
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
            'Horas extras',
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


    XLSX.writeFile(
        workbook,
        `Tareo_${tareo.fecha}_${tareo.turno}.xlsx`
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
        'GLACIAL — TAREO DE PERSONAL',
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
                String(
                    persona.asistencia ||
                    ''
                ),
                posiciones[3],
                y
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
        `Tareo_${tareo.fecha}_${tareo.turno}.png`;

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

    const resumen =
        obtenerResumenMensualTareo(
            año,
            mes
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

                'DNI':
                    item.dni,

                'Trabajador':
                    item.nombre,

                'Cargo':
                    item.cargo,

                'Línea':
                    item.linea ||
                    'Sin línea',

                'Asistencias':
                    item.asistencias,

                'Faltas':
                    item.faltas,

                'Permisos':
                    item.permisos,

                'Descansos':
                    item.descansos,

                'Vacaciones':
                    item.vacaciones,

                'Descanso médico':
                    item.descansosMedicos,

                'Tardanzas':
                    item.tardanzas,

                'Minutos tardanza':
                    item.minutosTardanza,

                'Horas trabajadas':
                    Number(
                        item.horasTrabajadas
                            .toFixed(2)
                    ),

                'Horas extras':
                    Number(
                        item.horasExtras
                            .toFixed(2)
                    )

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
        { wch: 28 },
        { wch: 16 },
        { wch: 13 },
        { wch: 10 },
        { wch: 12 },
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

    XLSX.writeFile(
        workbook,
        `Resumen_Tareo_${año}_${String(
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

window.cambiarTurnoTareo =
    cambiarTurnoTareo;

window.exportarResumenMensualTareo =
<<<<<<< HEAD
    exportarResumenMensualTareo;
=======
    exportarResumenMensualTareo;
>>>>>>> 49d4ce5 (Cambios recientes app GLACIAL)
