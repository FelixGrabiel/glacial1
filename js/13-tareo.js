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
    'Falta por justificar',
    'Falta justificada',
    'Descanso',
    'Descanso médico',
    'Vacaciones'
];

const TAREO_ESTADOS_FINAL =
    TAREO_ESTADOS_ASISTENCIA.filter(
        estado => estado !== 'Asistió'
    );

let tareoActualId = null;

/* Estado de pantalla del módulo (filtros y área que se está viendo). */

let tareoAreaVista = null;
let tareoFiltroTexto = '';
let tareoFiltroAreaHistorial = '';

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


function tareoAccesoUsuario() {

    const acceso = { editar: [], general: false };

    if (typeof state === 'undefined' || !state.user) {
        return acceso;
    }

    const permisos = normalizarPermisosUsuario(state.user);

    if (permisos === 'todos') {
        return { editar: [...TAREO_AREAS], general: true };
    }

    if (permisos.includes('tareoProduccion')) {
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

    if (permisos.includes('moduloMantenimiento')) {
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

    acceso.general =
        permisos.includes('tareoGeneral') ||
        permisos.includes('moduloRRHH');

    if (acceso.editar.length || acceso.general) {
        return acceso;
    }

    /* Usuario sin permisos de Tareo asignados: regla anterior. */

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
    } else {
        acceso.editar.push('Producción');
    }

    return acceso;
}


function tareoAreasEditables() {
    return tareoAccesoUsuario().editar;
}


function tareoAreasVisibles() {

    const acceso = tareoAccesoUsuario();

    return acceso.general
        ? [...TAREO_AREAS]
        : [...acceso.editar];
}


function tareoPuedeEditar(tareo) {
    return tareoAreasEditables().includes(tareoAreaDe(tareo));
}


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

    return String(valor);
}


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

function tareoContadores(personal) {

    const c = {
        total: personal.length,
        asistieron: 0,
        pendientes: 0,
        ausencias: 0,
        tardanzas: 0,
        horas: 0,
        extras: 0
    };

    personal.forEach(persona => {

        const estado = tareoEstadoCanonico(persona.asistencia);

        if (!estado) {
            c.pendientes++;
        } else if (estado === 'Asistió') {
            c.asistieron++;
        } else {
            c.ausencias++;
        }

        if (Number(persona.tardanzaMinutos) > 0) {
            c.tardanzas++;
        }

        c.horas += Number(persona.horasTrabajadas || 0);
        c.extras += Number(persona.horasExtras || 0);
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


function tareoFusionar(remoto, local) {

    const localMasNuevo =
        Number(local.actualizadoEn || 0) >=
        Number(remoto.actualizadoEn || 0);

    const base = localMasNuevo ? local : remoto;
    const otro = localMasNuevo ? remoto : local;

    const configLocal =
        Number(local.configActualizadoEn || 0) >=
        Number(remoto.configActualizadoEn || 0);

    const config = configLocal ? local : remoto;

    const clave = persona => String(
        persona.trabajadorId ?? persona.dni ?? persona.nombre
    );

    const mapa = new Map();

    (otro.personal || []).forEach(
        persona => mapa.set(clave(persona), persona)
    );

    (base.personal || []).forEach(persona => {

        const previo = mapa.get(clave(persona));

        if (
            !previo ||
            Number(persona.actualizadoEn || 0) >=
            Number(previo.actualizadoEn || 0)
        ) {
            mapa.set(clave(persona), persona);
        }
    });

    return {
        ...base,

        observaciones: config.observaciones || '',
        horaProgramadaIngreso: config.horaProgramadaIngreso,
        jornadaNormal: config.jornadaNormal,
        configActualizadoEn: config.configActualizadoEn || 0,

        actualizadoEn: Math.max(
            Number(local.actualizadoEn || 0),
            Number(remoto.actualizadoEn || 0)
        ),

        personal: ordenarPersonalTareo(
            Array.from(mapa.values())
        )
    };
}


function tareoGuardarEnNube(tareo) {

    if (
        typeof db === 'undefined' ||
        typeof db.runTransaction !== 'function'
    ) {

        /* Respaldo: comportamiento anterior. */

        guardarTareos(obtenerTareos());

        return;
    }

    const referencia = db.collection('sync').doc('tareos');

    const copia = JSON.parse(JSON.stringify(tareo));

    window._tareoEscriturasPendientes++;

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
    })
    .catch(error => {

        if (typeof _avisarErrorGuardado === 'function') {
            _avisarErrorGuardado('tareo', error);
        } else {
            console.error('TAREO: error guardando', error);
        }
    })
    .finally(() => {

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

function tareoRenderTabs(activa) {

    const acceso = tareoAccesoUsuario();

    const tabs = [];

    if (acceso.editar.length) {
        tabs.push(['tareo', 'Tareo', 'renderTareoPrincipal()']);
    }

    if (acceso.general) {
        tabs.push(['general', 'Tareo General', 'renderTareoGeneral()']);
    }

    tabs.push(['historial', 'Historial', 'renderHistorialTareo()']);
    tabs.push(['resumen', 'Resumen mensual', 'renderResumenMensualTareoUI()']);

    /*
       Rotación semanal: atada al permiso tareoProduccion en sí
       (no a "editar incluye Producción" en general), para que
       moduloRRHH — que también edita Producción, pero desde el
       módulo de RRHH — no la herede sin que se la asignen aparte.
    */
    if (tienePermiso('tareoProduccion')) {
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

    return String(
        persona.trabajadorId ?? persona.dni ?? persona.nombre
    );
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

    return trabajadores.filter(trabajador => {

        if (!trabajador) return false;

        const estado = tareoNormalizarTexto(
            trabajador.estado
        );

        return (
            estado === 'activo' &&
            tareoCargoPermitido(trabajador.cargo, areaBuscada)
        );
    });
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

    if (typeof saveTareos !== 'function') {

        console.error(
            'TAREO: No se encontró saveTareos().'
        );

        return;
    }

    saveTareos(tareos);
}


function guardarTareoEnMemoria(tareo) {

    tareo.actualizadoEn = Date.now();

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

    const base =
        areaTareo === 'Mantenimiento'
            ? obtenerPersonalTareo('Mantenimiento')
            : obtenerPersonalPorRotacion(
                fecha,
                turno
            ).personal;

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
            trabajador.trabajadorId ??
            trabajador.id,

        nombre:
            trabajador.nombre || '',

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
            0

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


function tareoTarjetaTurnoHTML(area, fecha, turno) {

    const tareo = tareoBuscar(area, fecha, turno);

    const c = tareo
        ? tareoContadores(tareo.personal || [])
        : null;

    const porcentaje = c && c.total
        ? Math.round(c.registrados * 100 / c.total)
        : 0;

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

            ${
                tareo
                    ? `
                    <div class="tar2-progress">
                        <span style="width:${porcentaje}%"></span>
                    </div>

                    <div class="tar2-card-meta">
                        <strong>${c.registrados}/${c.total}</strong> registrados ·
                        ${c.asistieron} asistieron ·
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

    const personal = obtenerPersonalTareo(area);

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

                <h3>Turnos de hoy · ${formatearFecha(hoy)}</h3>

                <span class="small-muted">
                    Toca un turno para registrar a quienes van llegando
                </span>

            </div>

            <div class="panel-body">

                <div class="tar2-turno-grid">
                    ${tareoTarjetaTurnoHTML(area, hoy, 'Día')}
                    ${tareoTarjetaTurnoHTML(area, hoy, 'Noche')}
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

function tareoAbrir(area, fecha, turno) {

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

        tareoActualId = existente.id;

        renderTareoFormulario(existente);

        return;
    }

    let rotacionId = null;

    if (area === 'Producción') {

        const resultado =
            obtenerPersonalPorRotacion(
                fecha,
                turnoTareo
            );

        if (
            resultado.tieneRotacion &&
            resultado.personal.length === 0
        ) {

            alert(
                'La rotación semanal está activa, pero no se encontraron trabajadores asignados al turno ' +
                turnoTareo + ' para esta fecha.'
            );

            return;
        }

        rotacionId = resultado.rotacion
            ? resultado.rotacion.id
            : null;
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
                : 'No hay personal activo de producción disponible para crear el tareo.'
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

    const personal = tareo.personal || [];

    const rotacion =
        area === 'Producción'
            ? obtenerRotacionVigente(tareo.fecha)
            : null;

    const c = tareoContadores(personal);

    const filtro = tareoNormalizarTexto(tareoFiltroTexto);

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
                </div>

            </div>

            <button
                class="btn btn-ghost"
                onclick="renderTareoPrincipal()"
            >
                ← Volver
            </button>

        </div>


        <div class="tareo-kpi-grid">

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Registrados</span>
                <strong>${c.registrados}/${c.total}</strong>
                <small>${c.pendientes} pendientes</small>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Asistieron</span>
                <strong class="tareo-good">${c.asistieron}</strong>
                <small>Con hora de ingreso</small>
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
                                        index,
                                        tareo.id,
                                        filtro
                                    )
                            ).join('')}

                        </tbody>

                    </table>

                </div>

            </div>

        </div>


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
                class="btn btn-primary"
                onclick="guardarTareoActual()"
            >
                Guardar Tareo
            </button>

        </div>

    `;

    window.scrollTo(0, scrollY);
    main.scrollTop = scrollMain;
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

function tareoAbrirAgregarPersonal() {

    const tareo = tareoObtenerActual();

    if (!tareo || !tareoPuedeEditar(tareo)) return;

    const root =
        document.getElementById('modal-root');

    if (!root) return;

    const yaEstan = new Set(
        (tareo.personal || []).map(
            persona => String(persona.trabajadorId)
        )
    );

    const candidatos = (
        typeof loadWorkers === 'function'
            ? loadWorkers()
            : []
    ).filter(
        trabajador =>
            trabajador &&
            tareoNormalizarTexto(trabajador.estado) === 'activo' &&
            !yaEstan.has(String(trabajador.id))
    ).sort(
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

    const tareo = tareoObtenerActual();

    if (!tareo || !tareoPuedeEditar(tareo)) return;

    const id = document.getElementById('tareo-agregar-select')?.value;

    const trabajador = (
        typeof loadWorkers === 'function'
            ? loadWorkers()
            : []
    ).find(item => String(item.id) === String(id));

    if (!trabajador) return;

    const persona = tareoNuevaPersona(
        trabajador,
        tareoAreaDe(tareo)
    );

    persona.actualizadoEn = Date.now();

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
    filtro
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

    const clave =
        tareoArg(tareoClavePersona(persona));

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

                    <small>
                        DNI:
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

                        ${
                            pendiente
                                ? '<option value="" selected>Otro estado…</option>'
                                : '<option value="">PENDIENTE</option>'
                        }

                        ${TAREO_ESTADOS_ASISTENCIA
                            .filter(estado => !pendiente || estado !== 'Asistió')
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

                <input
                    type="number"
                    min="0"
                    max="4"
                    step="0.25"
                    value="${Number(persona.refrigerio || 0)}"
                    ${deshabilitado}
                    onchange="actualizarRefrigerioTareo(${clave}, this.value)"
                >

            </td>


            <td>

                <input
                    type="time"
                    value="${escaparHTML(persona.horaSalida || '')}"
                    ${deshabilitado}
                    onchange="actualizarHoraSalidaTareo(${clave}, this.value)"
                >

                ${
                    asistio && persona.horaIngreso && !persona.horaSalida
                        ? `
                        <button
                            type="button"
                            class="tar2-inline-btn"
                            title="Registrar la hora actual como salida"
                            onclick="tareoSalidaAhora(${clave})"
                        >
                            Ahora
                        </button>
                        `
                        : ''
                }

            </td>


            <td>

                <strong class="tareo-hours">
                    ${formatearHoras(persona.horasTrabajadas)}
                </strong>

            </td>


            <td>

                <strong class="tareo-hours-extra">
                    ${formatearHoras(persona.horasExtras)}
                </strong>

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

    const persona = tareo.personal.find(
        item => tareoClavePersona(item) === String(clave)
    );

    if (!persona) return;

    cambiar(persona, tareo);

    persona.actualizadoEn = Date.now();

    recalcularPersonaTareo(persona, tareo);

    tareo.personal = ordenarPersonalTareo(tareo.personal);

    guardarTareoEnMemoria(tareo);

    renderTareoFormulario(tareo);
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

        persona.asistencia = estado;

        persona.registradoEn =
            estado
                ? new Date().toISOString()
                : '';

        persona.registradoPor =
            estado
                ? ((state.user && state.user.username) || '')
                : '';

        if (estado === 'Asistió') {

            if (anterior !== 'Asistió') {

                if (tareoEsEnTiempoReal(tareo)) {

                    persona.horaIngreso = tareoHoraActual();
                    persona.horaIngresoAuto = true;

                } else {

                    persona.horaIngreso = '';
                    persona.horaIngresoAuto = false;
                }
            }

            return;
        }

        persona.horaIngreso = '';
        persona.horaIngresoAuto = false;
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


function actualizarRefrigerioTareo(
    clave,
    valor
) {

    tareoEditarPersona(clave, persona => {

        persona.refrigerio =
            Number(valor) || 0;
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

    tareoEditarPersona(clave, persona => {

        persona.horaSalida = tareoHoraActual();
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
            persona.actualizadoEn = Date.now();
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
            persona.actualizadoEn = Date.now();
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
                                        <th>Asistieron</th>
                                        <th>Ausencias</th>
                                        <th>Sin registrar</th>
                                        <th>Tardanzas</th>
                                        <th>Horas extra</th>
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
                                                        ${formatearHoras(c.extras)} h
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
                                                                (
                                                                    tienePermiso('eliminarRegistros') ||
                                                                    tienePermiso('moduloRRHH')
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

    if (!tareoAreasVisibles().includes(tareoAreaDe(tareo))) {

        alert(
            'No tienes acceso al Tareo de ' + tareoAreaDe(tareo) + '.'
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
                    · ${escaparHTML(tareo.id)}
                </div>

            </div>

            <div class="tareo-head-actions">

                <button
                    class="btn btn-ghost"
                    onclick="renderHistorialTareo()"
                >
                    ← Historial
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
                        tienePermiso('eliminarRegistros') ||
                        tienePermiso('moduloRRHH')
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
                <span class="tareo-kpi-label">Asistieron</span>
                <strong class="tareo-good">${c.asistieron}</strong>
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
                <span class="tareo-kpi-label">Horas extra</span>
                <strong>${formatearHoras(c.extras)} h</strong>
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

                                    <td>${persona.horaSalida || '—'}</td>

                                    <td>${formatearHoras(persona.horasTrabajadas)} h</td>

                                    <td>${formatearHoras(persona.horasExtras)} h</td>

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
        asistencias: 0,
        faltasPorJustificar: 0,
        faltasJustificadas: 0,
        descansos: 0,
        descansosMedicos: 0,
        vacaciones: 0,
        tardanzas: 0,
        minutosTardanza: 0,
        horas: 0,
        extras: 0
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

        if (estado === 'Asistió') r.asistencias++;
        else if (estado === 'Falta por justificar') r.faltasPorJustificar++;
        else if (estado === 'Falta justificada') r.faltasJustificadas++;
        else if (estado === 'Descanso') r.descansos++;
        else if (estado === 'Descanso médico') r.descansosMedicos++;
        else if (estado === 'Vacaciones') r.vacaciones++;

        r.horas += Number(persona.horasTrabajadas || 0);
        r.extras += Number(persona.horasExtras || 0);

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

    if (!datos && typeof loadWorkers === 'function') {

        const trabajador = loadWorkers().find(
            item => String(item.id) === String(clave)
        );

        if (trabajador) {
            datos = {
                nombre: trabajador.nombre,
                dni: trabajador.dni,
                cargo: trabajador.cargo,
                linea: trabajador.linea,
                area: ''
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
                                ${dato('Horas / extras', `${formatearHoras(turnoActual.horasTrabajadas)} / ${formatearHoras(turnoActual.horasExtras)}`)}
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
                        ${dato('Asistencias', resumen.asistencias)}
                        ${dato('Faltas por justificar', resumen.faltasPorJustificar)}
                        ${dato('Faltas justificadas', resumen.faltasJustificadas)}
                        ${dato('Descansos', resumen.descansos)}
                        ${dato('Descanso médico', resumen.descansosMedicos)}
                        ${dato('Vacaciones', resumen.vacaciones)}
                        ${dato('Tardanzas', resumen.tardanzas ? `${resumen.tardanzas} (${formatearMinutos(resumen.minutosTardanza)})` : '0')}
                        ${dato('Horas trabajadas', `${formatearHoras(resumen.horas)} h`)}
                        ${dato('Horas extra', `${formatearHoras(resumen.extras)} h`)}
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

                <h2>Tareo General</h2>

                <div class="sub">
                    Producción y Mantenimiento en una sola vista
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
                            <option value="">Ambas</option>
                            ${TAREO_AREAS.map(item => `
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
                                            ${k.asistieron} asistieron ·
                                            ${k.ausencias} ausentes ·
                                            ${k.pendientes} pendientes
                                            ${
                                                k.tardanzas
                                                    ? ` · <span class="tareo-late">${k.tardanzas} con tardanza</span>`
                                                    : ''
                                            }
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
                <span class="tareo-kpi-label">Asistieron</span>
                <strong class="tareo-good">${c.asistieron}</strong>
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
                                        <th>Salida</th>
                                        <th>Horas</th>
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
                                            <td>${persona.horaSalida || '—'}</td>
                                            <td>${formatearHoras(persona.horasTrabajadas)} h</td>
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
        'Horas extras': Number(Number(persona.horasExtras || 0).toFixed(2)),
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
        asistencias: 0,
        faltas: 0,
        permisos: 0,
        descansos: 0,
        vacaciones: 0,
        descansosMedicos: 0,
        tardanzas: 0,
        minutosTardanza: 0,
        horasTrabajadas: 0,
        horasExtras: 0
    });

    areas.forEach(areaFila => {

        obtenerPersonalTareo(areaFila).forEach(trabajador => {

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
                total.faltas += item.faltas;
                total.permisos += item.permisos;
                total.descansos += item.descansos;
                total.vacaciones += item.vacaciones;
                total.medicos += item.descansosMedicos;
                total.horas += item.horasTrabajadas;
                total.extras += item.horasExtras;

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
                <span class="tareo-kpi-label">Asistencias</span>
                <strong class="tareo-good">${totales.asistencias}</strong>
            </div>

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

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Horas trabajadas</span>
                <strong>${formatearHoras(totales.horas)} h</strong>
            </div>

            <div class="tareo-kpi">
                <span class="tareo-kpi-label">Horas extra</span>
                <strong>${formatearHoras(totales.extras)} h</strong>
            </div>

        </div>


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
                                <th>Asist.</th>
                                <th>F. por justif.</th>
                                <th>F. justif.</th>
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

                                    <td>${tareoBotonNombre(item, '')}</td>

                                    <td>${tareoInsigniaArea(item.area)}</td>

                                    <td>${escaparHTML(item.dni)}</td>

                                    <td>${escaparHTML(item.cargo)}</td>

                                    <td class="tareo-number-good">${item.asistencias}</td>

                                    <td>${item.faltas}</td>

                                    <td>${item.permisos}</td>

                                    <td>${item.descansos}</td>

                                    <td>${item.vacaciones}</td>

                                    <td>${item.descansosMedicos}</td>

                                    <td>${item.tardanzas ? `${item.tardanzas}` : '—'}</td>

                                    <td>${formatearHoras(item.horasTrabajadas)} h</td>

                                    <td>${formatearHoras(item.horasExtras)} h</td>

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
                'Falta por justificar'
        ).length;

    const permisos =
        personal.filter(
            persona =>
                persona.asistencia ===
                'Falta justificada'
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
                'Asistieron',

            'Valor':
                asistieron
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
                'Asistencias': item.asistencias,
                'Faltas por justificar': item.faltas,
                'Faltas justificadas': item.permisos,
                'Descansos': item.descansos,
                'Vacaciones': item.vacaciones,
                'Descanso médico': item.descansosMedicos,
                'Tardanzas': item.tardanzas,
                'Minutos tardanza': item.minutosTardanza,
                'Horas trabajadas': Number(item.horasTrabajadas.toFixed(2)),
                'Horas extras': Number(item.horasExtras.toFixed(2))
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


tareoInyectarEstilos();
