/* Control quincenal y consulta de auditoría de Tareo.
   Requiere 02-estado.js y 13-tareo.js; se carga después de ambos. */
let tareoAuditoria = [];
let tareoAuditoriaLista = null;
let tareoAuditoriaError = '';
let tareoControlFiltros = null;

function tareoPeriodo(año, mes, quincena) {
    año = Number(año);
    mes = Number(mes);
    quincena = Number(quincena);
    if (!Number.isInteger(año) || año < 2000 ||
        !Number.isInteger(mes) || mes < 1 || mes > 12 ||
        ![1, 2].includes(quincena)) return null;
    const ultimo = new Date(año, mes, 0).getDate();
    const prefijo = `${año}-${String(mes).padStart(2, '0')}-`;
    return {
        año, mes, quincena, ultimo,
        inicio: prefijo + (quincena === 1 ? '01' : '16'),
        fin: prefijo + String(quincena === 1 ? 15 : ultimo).padStart(2, '0')
    };
}

function tareoEvaluarDescansos(año, mes, quincena, area = '') {
    const periodo = tareoPeriodo(año, mes, quincena);
    if (!periodo) return [];
    const personas = new Map();
    const clave = persona => String(persona.trabajadorId ?? persona.id ?? persona.dni ?? persona.nombre);
    const areas = area ? [area] : TAREO_AREAS;
    const llaveDe = (nombreArea, id) => area ? `${nombreArea}|${id}` : id;

    // El padrón vigente se completa con personas presentes en registros
    // históricos del período, aun si hoy están inactivas.
    for (const nombreArea of areas) {
        for (const trabajador of obtenerPersonalTareo(nombreArea)) {
            const id = clave(trabajador);
            const llave = llaveDe(nombreArea, id);
            if (!personas.has(llave)) personas.set(llave, {
                trabajadorId: id, trabajador: trabajador.nombre,
                area: nombreArea, fechas: new Set(), fechasRegistradas: new Set()
            });
            else if (!personas.get(llave).area.includes(nombreArea))
                personas.get(llave).area += ' / ' + nombreArea;
        }
    }
    for (const tareo of obtenerTareos()) {
        if (tareo.fecha < periodo.inicio || tareo.fecha > periodo.fin) continue;
        const nombreArea = tareoAreaDe(tareo);
        if (!areas.includes(nombreArea)) continue;
        for (const persona of (tareo.personal || [])) {
            const id = clave(persona), llave = llaveDe(nombreArea, id);
            let fila = personas.get(llave);
            if (!fila) {
                fila = {
                    trabajadorId: id, trabajador: persona.nombre,
                    area: nombreArea, fechas: new Set(), fechasRegistradas: new Set()
                };
                personas.set(llave, fila);
            }
            if (!fila.area.includes(nombreArea)) fila.area += ' / ' + nombreArea;
            fila.fechasRegistradas.add(tareo.fecha);
            if (tareoEstadoCanonico(persona.asistencia) === 'Descanso')
                fila.fechas.add(tareo.fecha); // una fecha cuenta una sola vez
        }
    }
    return [...personas.values()].map(p => ({
        trabajadorId: p.trabajadorId,
        trabajador: p.trabajador,
        area: p.area,
        periodo: periodo.quincena === 1 ? '01–15' : `16–${periodo.ultimo}`,
        fechaInicio: periodo.inicio,
        fechaFin: periodo.fin,
        descansosRealizados: p.fechas.size,
        descansosEsperados: 2,
        descansosFaltantes: Math.max(0, 2 - p.fechas.size),
        cumple: p.fechas.size >= 2,
        diasConTareo: p.fechasRegistradas.size
    })).sort((a, b) =>
        a.area.localeCompare(b.area, 'es') ||
        a.trabajador.localeCompare(b.trabajador, 'es')
    );
}

function tareoControlActualizar() {
    if (document.getElementById('tareo-control-view'))
        renderControlDescansos(false);
    if (document.getElementById('tareo-auditoria-view'))
        renderAuditoriaTareos();
    tareoAlertaDescansos();
}

function tareoAlertaDescansos() {
    if (!state.user || !tienePermiso('moduloRRHH') ||
        typeof _tareosReady === 'undefined' || !_tareosReady ||
        typeof _workersReady === 'undefined' || !_workersReady) return;
    const hoy = new Date();
    const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    if (hoy.getDate() !== 15 && hoy.getDate() !== ultimo) return;
    const q = hoy.getDate() === 15 ? 1 : 2;
    const filas = tareoEvaluarDescansos(hoy.getFullYear(), hoy.getMonth() + 1, q)
        .filter(f => !f.cumple);
    const previo = document.getElementById('tareo-alerta-descansos');
    if (!filas.length) { previo?.remove(); return; }
    const llave = `${hoy.getFullYear()}-${hoy.getMonth() + 1}-${q}`;
    if (sessionStorage.getItem('tareo-descansos-visto') === llave) return;
    if (previo) previo.remove();
    const aviso = document.createElement('aside');
    aviso.id = 'tareo-alerta-descansos';
    aviso.setAttribute('role', 'alert');
    aviso.innerHTML = `<strong>Control de descansos · ${q === 1 ? '01–15' : '16–fin de mes'}</strong>
        <button type="button" aria-label="Cerrar alerta">×</button>
        <p>${filas.length} trabajador(es) tienen descansos pendientes.</p>
        <div class="tareo-alerta-lista"></div>
        <button type="button" class="btn btn-primary" id="tareo-alerta-ver">Ver control</button>`;
    aviso.querySelector('.tareo-alerta-lista').textContent =
        filas.map(f => `${f.trabajador} · ${f.area}: ${f.descansosRealizados}/2, falta(n) ${f.descansosFaltantes}`).join(' | ');
    const cerrar = () => {
        sessionStorage.setItem('tareo-descansos-visto', llave);
        aviso.remove();
    };
    aviso.querySelector('[aria-label="Cerrar alerta"]').onclick = cerrar;
    aviso.querySelector('#tareo-alerta-ver').onclick = () => {
        cerrar();
        tareoControlFiltros = {año: hoy.getFullYear(), mes: hoy.getMonth() + 1, quincena: q, area: ''};
        renderControlDescansos();
    };
    document.body.appendChild(aviso);
}

function renderControlDescansos(primeraVez = true) {
    if (!tienePermiso('moduloRRHH')) return;
    const main = document.getElementById('main');
    if (!main) return;
    const hoy = new Date();
    if (!tareoControlFiltros) tareoControlFiltros = {
        año: hoy.getFullYear(), mes: hoy.getMonth() + 1,
        quincena: hoy.getDate() <= 15 ? 1 : 2, area: ''
    };
    const f = tareoControlFiltros;
    if (!primeraVez && document.getElementById('tareo-control-view')) {
        const nuevo = {
            año: Number(document.getElementById('control-año')?.value),
            mes: Number(document.getElementById('control-mes')?.value),
            quincena: Number(document.getElementById('control-quincena')?.value),
            area: document.getElementById('control-area')?.value || ''
        };
        if (tareoPeriodo(nuevo.año, nuevo.mes, nuevo.quincena))
            tareoControlFiltros = nuevo;
    }
    const filtro = tareoControlFiltros;
    const filas = tareoEvaluarDescansos(filtro.año, filtro.mes, filtro.quincena, filtro.area);
    const faltan = filas.filter(x => !x.cumple);
    const periodo = tareoPeriodo(filtro.año, filtro.mes, filtro.quincena);
    const limite = new Date(periodo.año, periodo.mes - 1, Number(periodo.fin.slice(-2)), 23, 59, 59);
    main.innerHTML = `
        <div id="tareo-control-view" class="main-head"><div><h2>Control de descansos</h2>
        <div class="sub">Mínimo 2 descansos por quincena · solo estado Descanso</div></div></div>
        ${tareoRenderTabs('descansos')}
        <div class="panel"><div class="panel-body">
          <div class="tareo-control-filtros">
            <label>Año <input type="number" min="2000" max="2100" id="control-año" value="${filtro.año}"></label>
            <label>Mes <select id="control-mes">${TAREO_MESES.map((m, i) =>
                `<option value="${i + 1}" ${filtro.mes === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
            <label>Quincena <select id="control-quincena">
              <option value="1" ${filtro.quincena === 1 ? 'selected' : ''}>01 al 15</option>
              <option value="2" ${filtro.quincena === 2 ? 'selected' : ''}>16 al último día</option>
            </select></label>
            <label>Área <select id="control-area">
              <option value="">Todas</option>
              ${TAREO_AREAS.map(a => `<option value="${a}" ${filtro.area === a ? 'selected' : ''}>${a}</option>`).join('')}
            </select></label>
            <button type="button" class="btn btn-primary" onclick="renderControlDescansos(false)">Consultar</button>
          </div>
          <p>Período: ${formatearFecha(periodo.inicio)} al ${formatearFecha(periodo.fin)}
             · ${new Date() > limite ? 'Cerrado' : 'En curso'}</p>
          <div class="tareo-control-kpis">
            <div><b>${filas.length}</b><span>Personal evaluado</span></div>
            <div><b>${filas.length - faltan.length}</b><span>Cumplen</span></div>
            <div><b>${faltan.length}</b><span>Pendientes</span></div>
            <div><b>${faltan.reduce((n, x) => n + x.descansosFaltantes, 0)}</b><span>Descansos faltantes</span></div>
          </div>
          <div class="tareo-table-scroll"><table class="tareo-table"><thead><tr>
            <th>Trabajador</th><th>Área</th><th>Días con tareo</th><th>Realizados</th><th>Faltantes</th><th>Estado</th>
          </tr></thead><tbody>
            ${filas.map(x => `<tr><td>${escaparHTML(x.trabajador)}</td>
                <td>${escaparHTML(x.area)}</td><td>${x.diasConTareo}</td><td>${x.descansosRealizados}</td>
                <td>${x.descansosFaltantes}</td>
                <td><span class="tareo-control-estado ${x.cumple ? 'ok' : x.descansosFaltantes === 1 ? 'warn' : 'bad'}">
                  ${x.cumple ? 'CUMPLE' : `FALTA${x.descansosFaltantes === 1 ? '' : 'N'} ${x.descansosFaltantes} DESCANSO${x.descansosFaltantes === 1 ? '' : 'S'}`}
                </span></td></tr>`).join('') || '<tr><td colspan="6">Sin trabajadores para este período.</td></tr>'}
          </tbody></table></div>
          <p class="small-muted">El resultado depende de los tareos registrados. Revisa los días sin tareo antes de cerrar una quincena.</p>
        </div></div>`;
}

function tareoIniciarAuditoria() {
    if (tareoAuditoriaLista || typeof db === 'undefined') return;
    tareoAuditoriaLista = db.collection('auditoriaTareos')
        .orderBy('timestamp', 'desc').limit(500)
        .onSnapshot(snap => {
            tareoAuditoria = snap.docs.map(d => ({...d.data(), id: d.id}));
            tareoAuditoriaError = '';
            if (document.getElementById('tareo-auditoria-view')) renderAuditoriaTareos();
        }, error => {
            tareoAuditoriaError = error.message;
            if (document.getElementById('tareo-auditoria-view')) renderAuditoriaTareos();
        });
}

function renderAuditoriaTareos() {
    if (!tienePermiso('moduloRRHH')) return;
    tareoIniciarAuditoria();
    const main = document.getElementById('main');
    if (!main) return;
    const resumen = valor => {
        if (valor == null) return '—';
        if (typeof valor === 'object') return JSON.stringify(valor).slice(0, 350);
        return String(valor);
    };
    main.innerHTML = `
      <div class="main-head" id="tareo-auditoria-view"><div><h2>Auditoría de tareos</h2>
      <div class="sub">Últimos 500 eventos, sincronizados en tiempo real</div></div></div>
      ${tareoRenderTabs('auditoria')}
      <div class="panel"><div class="panel-body">
      ${tareoAuditoriaError ? `<p class="tareo-control-error">No se pudo cargar la auditoría: ${escaparHTML(tareoAuditoriaError)}</p>` : ''}
      <div class="tareo-table-scroll"><table class="tareo-table"><thead><tr>
        <th>Fecha y hora</th><th>Usuario / rol</th><th>Área / tareo</th>
        <th>Trabajador</th><th>Acción / campo</th><th>Anterior</th><th>Nuevo</th>
      </tr></thead><tbody>
        ${tareoAuditoria.map(e => `<tr>
          <td>${new Date(e.timestamp).toLocaleString('es-PE')}</td>
          <td>${escaparHTML(e.usuario)}<br>${escaparHTML(e.rol)}</td>
          <td>${escaparHTML(e.area)} · ${formatearFecha(e.fechaTareo)} · ${escaparHTML(e.turno)}</td>
          <td>${escaparHTML(e.trabajador || '—')}</td>
          <td>${escaparHTML(e.accion)} · ${escaparHTML(e.campo)}</td>
          <td title="${escaparHTML(resumen(e.estadoAnterior))}">${escaparHTML(resumen(e.estadoAnterior))}</td>
          <td title="${escaparHTML(resumen(e.estadoNuevo))}">${escaparHTML(resumen(e.estadoNuevo))}</td>
        </tr>`).join('') || '<tr><td colspan="7">Sin eventos registrados todavía.</td></tr>'}
      </tbody></table></div></div></div>`;
}

window.tareoEvaluarDescansos = tareoEvaluarDescansos;
window.renderControlDescansos = renderControlDescansos;
window.renderAuditoriaTareos = renderAuditoriaTareos;
window.tareoAlertaDescansos = tareoAlertaDescansos;
// Cubre también el cambio de fecha si la pestaña queda abierta toda la noche.
setInterval(tareoAlertaDescansos, 60 * 1000);
