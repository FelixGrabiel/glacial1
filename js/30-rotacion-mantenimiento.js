/* =============================================================
   GLACIAL · ROTACIÓN SEMANAL DE MANTENIMIENTO

   - Solo Supervisor de Mantenimiento / Jefe de Mantenimiento.
   - Muestra únicamente técnicos activos de Mantenimiento.
   - Turnos: Día / Intermedio / Noche.
   - Horario editable por técnico.
   - Se guarda en Firebase: sync/rotacionesMantenimiento.
   - NO modifica la rotación semanal de Producción.
   ============================================================= */

(function instalarRotacionMantenimiento(){
  'use strict';

  const TURNOS_MTTO = {
    'Día':        { ingreso:'07:00', salida:'16:00' },
    'Intermedio': { ingreso:'11:00', salida:'20:00' },
    'Noche':      { ingreso:'19:00', salida:'07:00' }
  };

  let semanaMttoSeleccionada = mttoLunesSemana(new Date());
  let borradorMtto = {};

  function textoUsuarioMtto(){
    const u = (typeof state !== 'undefined' && state.user) ? state.user : {};
    return tareoNormalizarTexto([
      u.puesto || '',
      u.rol || '',
      u.cargo || ''
    ].join(' '));
  }

  function puedeGestionarRotacionMtto(){
    if(typeof tienePermiso !== 'function' || !tienePermiso('moduloMantenimiento')){
      return false;
    }

    const texto = textoUsuarioMtto();
    const esMantenimiento = /mantenimiento|\bmtto\b/.test(texto);
    const esResponsable = /supervisor|jefe/.test(texto);

    return esMantenimiento && esResponsable;
  }
  window.puedeGestionarRotacionMtto = puedeGestionarRotacionMtto;

  function mttoFechaISO(fecha){
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth()+1).padStart(2,'0');
    const d = String(fecha.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }

  function mttoFechaLocal(iso){
    const [y,m,d] = String(iso).split('-').map(Number);
    return new Date(y, (m || 1)-1, d || 1);
  }

  function mttoLunesSemana(fecha){
    const f = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
    const dia = f.getDay();
    const diferencia = dia === 0 ? -6 : 1-dia;
    f.setDate(f.getDate()+diferencia);
    return mttoFechaISO(f);
  }

  function mttoFinSemana(inicioISO){
    const f = mttoFechaLocal(inicioISO);
    f.setDate(f.getDate()+6);
    return mttoFechaISO(f);
  }

  function mttoMoverSemana(dias){
    const f = mttoFechaLocal(semanaMttoSeleccionada);
    f.setDate(f.getDate()+dias);
    semanaMttoSeleccionada = mttoLunesSemana(f);
    renderRotacionSemanalMantenimiento();
  }
  window.mttoMoverSemana = mttoMoverSemana;

  function mttoIrSemanaActual(){
    semanaMttoSeleccionada = mttoLunesSemana(new Date());
    renderRotacionSemanalMantenimiento();
  }
  window.mttoIrSemanaActual = mttoIrSemanaActual;

  function mttoEsTecnico(cargo){
    if(typeof tareoEsTecnicoMantenimiento === 'function'){
      return tareoEsTecnicoMantenimiento(cargo);
    }
    const c = tareoNormalizarTexto(cargo);
    return /tecnic|mecanic|electric|electromecanic/.test(c) &&
           /mantenimiento|mtto/.test(c) &&
           !/supervisor|jefe|gerent|coordinad|asistent/.test(c);
  }

  function mttoTecnicosActivos(){
    const lista = typeof loadWorkers === 'function' ? loadWorkers() : [];
    return (Array.isArray(lista) ? lista : [])
      .filter(w => w && tareoNormalizarTexto(w.estado) === 'activo' && mttoEsTecnico(w.cargo))
      .sort((a,b) => String(a.nombre||'').localeCompare(String(b.nombre||''),'es',{sensitivity:'base'}));
  }

  function mttoClaveTrabajador(w){
    return String(w.id ?? w.dni ?? w.nombre ?? '');
  }

  function mttoRotaciones(){
    if(typeof loadRotacionesMantenimiento !== 'function') return [];
    const r = loadRotacionesMantenimiento();
    return Array.isArray(r) ? r : [];
  }

  function mttoRotacionSemana(inicio){
    return mttoRotaciones().find(r => r && r.fechaInicio === inicio) || null;
  }

  function mttoPrepararBorrador(){
    const tecnicos = mttoTecnicosActivos();
    const guardada = mttoRotacionSemana(semanaMttoSeleccionada);
    const guardados = Array.isArray(guardada?.personal) ? guardada.personal : [];
    const nuevo = {};

    tecnicos.forEach(w => {
      const clave = mttoClaveTrabajador(w);
      const existente = guardados.find(p =>
        String(p.trabajadorId ?? '') === String(w.id ?? '') ||
        (!!w.dni && tareoNormalizarDNI(p.dni) === tareoNormalizarDNI(w.dni))
      );

      const turno = existente?.turno || 'Día';
      const horario = TURNOS_MTTO[turno] || TURNOS_MTTO['Día'];

      nuevo[clave] = {
        trabajadorId: w.id ?? clave,
        nombre: w.nombre || '',
        dni: w.dni || '',
        cargo: w.cargo || '',
        turno,
        horaIngreso: existente?.horaIngreso || horario.ingreso,
        horaSalida: existente?.horaSalida || horario.salida,
        horario: existente?.horario || `${existente?.horaIngreso || horario.ingreso} - ${existente?.horaSalida || horario.salida}`
      };
    });

    borradorMtto = nuevo;
    window.borradorMtto = borradorMtto;
  }

  function mttoCambiarTurno(clave, turno){
    const p = borradorMtto[String(clave)];
    if(!p || !TURNOS_MTTO[turno]) return;

    p.turno = turno;
    p.horaIngreso = TURNOS_MTTO[turno].ingreso;
    p.horaSalida = TURNOS_MTTO[turno].salida;
    p.horario = `${p.horaIngreso} - ${p.horaSalida}`;

    // No volver a renderizar toda la pantalla aquí:
    // hacerlo reconstruía el borrador con la información guardada
    // y provocaba que el turno regresara a "Día".
    const fila = document.querySelector(
      `tr[data-mtto-clave="${CSS.escape(String(clave))}"]`
    );

    if(fila){
      const ingreso = fila.querySelector('[data-mtto-ingreso]');
      const salida = fila.querySelector('[data-mtto-salida]');
      const horario = fila.querySelector('[data-mtto-horario]');

      if(ingreso) ingreso.value = p.horaIngreso;
      if(salida) salida.value = p.horaSalida;
      if(horario) horario.value = p.horario || mttoHorarioTexto(p);
    }
  }
  window.mttoCambiarTurno = mttoCambiarTurno;

  function mttoCambiarHora(clave, campo, valor){
    const p = borradorMtto[String(clave)];
    if(!p || !['horaIngreso','horaSalida'].includes(campo)) return;
    p[campo] = valor || '';
  }
  window.mttoCambiarHora = mttoCambiarHora;

  function mttoCambiarHorario(clave, valor){
    const p = borradorMtto[String(clave)];
    if(!p) return;
    p.horario = String(valor || '').trim();
  }
  window.mttoCambiarHorario = mttoCambiarHorario;

  function mttoHorarioTexto(p){
    if(!p) return '—';
    return p.horario || `${p.horaIngreso || '—'} - ${p.horaSalida || '—'}`;
  }
  window.mttoHorarioTexto = mttoHorarioTexto;
  window.borradorMtto = borradorMtto;


  function mttoNormalizarEncabezado(v){
    return String(v ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .trim().toLowerCase()
      .replace(/\s+/g,' ');
  }

  function mttoValorFilaExcel(fila, nombres){
    const entradas = Object.entries(fila || {});
    for(const nombre of nombres){
      const objetivo = mttoNormalizarEncabezado(nombre);
      const encontrado = entradas.find(([k]) => mttoNormalizarEncabezado(k) === objetivo);
      if(encontrado) return encontrado[1];
    }
    return '';
  }

  function mttoHoraExcel(v){
    if(v === null || v === undefined || v === '') return '';

    if(typeof v === 'number' && isFinite(v)){
      const total = Math.round((v % 1) * 24 * 60);
      const h = Math.floor(total / 60) % 24;
      const m = total % 60;
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    }

    const texto = String(v).trim();
    const m = texto.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
    if(m){
      const h = Math.min(23, Number(m[1]));
      const min = Math.min(59, Number(m[2]));
      return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
    }

    return '';
  }

  function mttoTurnoExcel(v){
    const t = tareoNormalizarTexto(v);
    if(t === 'dia') return 'Día';
    if(t === 'intermedio') return 'Intermedio';
    if(t === 'noche') return 'Noche';
    return '';
  }

  function mttoAbrirImportacionExcel(){
    if(!puedeGestionarRotacionMtto()){
      alert('Solo el Supervisor de Mantenimiento o Jefe de Mantenimiento puede importar una rotación.');
      return;
    }

    if(typeof XLSX === 'undefined'){
      alert('No se encontró SheetJS/XLSX. Verifica que la librería XLSX esté cargada en index.html.');
      return;
    }

    document.getElementById('mtto-excel-input')?.click();
  }
  window.mttoAbrirImportacionExcel = mttoAbrirImportacionExcel;

  async function mttoImportarExcel(input){
    const archivo = input?.files?.[0];
    if(!archivo) return;

    try{
      const datos = await archivo.arrayBuffer();
      const libro = XLSX.read(datos, {type:'array', cellDates:false});
      const nombreHoja = libro.SheetNames[0];

      if(!nombreHoja){
        throw new Error('El Excel no contiene hojas.');
      }

      const filas = XLSX.utils.sheet_to_json(
        libro.Sheets[nombreHoja],
        {defval:'', raw:true}
      );

      if(!filas.length){
        throw new Error('La primera hoja del Excel está vacía.');
      }

      const tecnicos = mttoTecnicosActivos();
      const encontrados = [];
      const noEncontrados = [];
      const errores = [];

      filas.forEach((fila, i) => {
        const numero = i + 2;

        const dni = String(mttoValorFilaExcel(fila, ['DNI','Documento'])).trim();
        const nombre = String(mttoValorFilaExcel(fila, ['Técnico','Tecnico','Nombre','Trabajador'])).trim();
        const turno = mttoTurnoExcel(mttoValorFilaExcel(fila, ['Turno']));
        const ingreso = mttoHoraExcel(mttoValorFilaExcel(fila, ['Hora ingreso','Ingreso','Hora de ingreso']));
        const salida = mttoHoraExcel(mttoValorFilaExcel(fila, ['Hora salida','Salida','Hora de salida']));
        const horarioExcel = String(mttoValorFilaExcel(fila, ['Horario'])).trim();

        if(!dni && !nombre) return;

        const trabajador = tecnicos.find(w =>
          (!!dni && tareoNormalizarDNI(w.dni) === tareoNormalizarDNI(dni)) ||
          (!!nombre && tareoNormalizarTexto(w.nombre) === tareoNormalizarTexto(nombre))
        );

        if(!trabajador){
          noEncontrados.push(`Fila ${numero}: ${nombre || dni}`);
          return;
        }

        if(!turno){
          errores.push(`Fila ${numero}: turno inválido para ${trabajador.nombre}.`);
          return;
        }

        const horarioBase = TURNOS_MTTO[turno];
        const clave = mttoClaveTrabajador(trabajador);

        borradorMtto[clave] = {
          trabajadorId: trabajador.id ?? clave,
          nombre: trabajador.nombre || '',
          dni: trabajador.dni || '',
          cargo: trabajador.cargo || '',
          turno,
          horaIngreso: ingreso || horarioBase.ingreso,
          horaSalida: salida || horarioBase.salida,
          horario: horarioExcel || `${ingreso || horarioBase.ingreso} - ${salida || horarioBase.salida}`
        };

        encontrados.push(trabajador.nombre || dni);
      });

      window.borradorMtto = borradorMtto;

      if(!encontrados.length){
        let msg = 'No se pudo importar ningún técnico.';
        if(noEncontrados.length) msg += '\n\nNo encontrados:\n- ' + noEncontrados.join('\n- ');
        if(errores.length) msg += '\n\nErrores:\n- ' + errores.join('\n- ');
        alert(msg);
        return;
      }

      // Actualiza la tabla conservando el borrador importado.
      mttoRenderTablaDesdeBorrador();

      let resumen = `Excel cargado: ${encontrados.length} técnico(s).`;
      if(noEncontrados.length) resumen += `\nNo encontrados: ${noEncontrados.length}.`;
      if(errores.length) resumen += `\nCon errores: ${errores.length}.`;
      resumen += '\n\nRevisa y edita los horarios antes de Guardar rotación semanal.';
      alert(resumen);

    }catch(err){
      console.error('Error importando rotación MTTO:', err);
      alert('No se pudo leer el Excel: ' + (err?.message || err));
    }finally{
      if(input) input.value = '';
    }
  }
  window.mttoImportarExcel = mttoImportarExcel;

  function mttoRenderTablaDesdeBorrador(){
    Object.entries(borradorMtto).forEach(([clave,p]) => {
      const fila = document.querySelector(
        `tr[data-mtto-clave="${CSS.escape(String(clave))}"]`
      );
      if(!fila) return;

      const turno = fila.querySelector('[data-mtto-turno]');
      const ingreso = fila.querySelector('[data-mtto-ingreso]');
      const salida = fila.querySelector('[data-mtto-salida]');
      const horario = fila.querySelector('[data-mtto-horario]');

      if(turno) turno.value = p.turno || 'Día';
      if(ingreso) ingreso.value = p.horaIngreso || '';
      if(salida) salida.value = p.horaSalida || '';
      if(horario) horario.value = p.horario || mttoHorarioTexto(p);
    });
  }

  function guardarRotacionSemanalMantenimiento(){
    if(!puedeGestionarRotacionMtto()){
      alert('Solo el Supervisor de Mantenimiento o Jefe de Mantenimiento puede guardar esta rotación.');
      return;
    }

    const personal = Object.values(borradorMtto);
    if(!personal.length){
      alert('No hay técnicos activos de Mantenimiento para guardar.');
      return;
    }

    const sinHorario = personal.find(p => !p.turno || !p.horaIngreso || !p.horaSalida);
    if(sinHorario){
      alert('Completa el turno y horario de ' + (sinHorario.nombre || 'todos los técnicos') + '.');
      return;
    }

    const todas = [...mttoRotaciones()];
    const registro = {
      id: 'ROT-MTTO-' + semanaMttoSeleccionada,
      area: 'Mantenimiento',
      fechaInicio: semanaMttoSeleccionada,
      fechaFin: mttoFinSemana(semanaMttoSeleccionada),
      creadoPor: state?.user?.username || '',
      actualizadoEn: Date.now(),
      personal
    };

    const i = todas.findIndex(r => r && r.fechaInicio === semanaMttoSeleccionada);
    if(i >= 0) todas[i] = {...todas[i], ...registro};
    else todas.push(registro);

    saveRotacionesMantenimiento(todas);
    alert('Rotación semanal de Mantenimiento guardada correctamente.');
    renderRotacionSemanalMantenimiento();
  }
  window.guardarRotacionSemanalMantenimiento = guardarRotacionSemanalMantenimiento;

  function renderRotacionSemanalMantenimiento(){
    const main = document.getElementById('main');
    if(!main) return;

    if(!puedeGestionarRotacionMtto()){
      main.innerHTML = `
        <div class="empty-state">
          <h4>Acceso restringido</h4>
          <p>La Rotación semanal de Mantenimiento solo puede ser gestionada por el Supervisor de Mantenimiento o Jefe de Mantenimiento.</p>
          <button class="btn btn-ghost" onclick="renderMantenimientoModulo()">← Volver</button>
        </div>`;
      return;
    }

    mttoPrepararBorrador();
    const tecnicos = mttoTecnicosActivos();
    const guardada = mttoRotacionSemana(semanaMttoSeleccionada);
    const fin = mttoFinSemana(semanaMttoSeleccionada);

    main.innerHTML = `
      <div class="main-head" id="mtto-rotacion-semanal-view">
        <div>
          <h2>Rotación semanal · Mantenimiento</h2>
          <div class="sub">Asignación de turno y horario de los técnicos de Mantenimiento</div>
        </div>
        <button class="btn btn-ghost" onclick="renderMantenimientoModulo()">← Volver</button>
      </div>

      ${typeof tareoRenderTabs === 'function' ? tareoRenderTabs('rotacionMtto') : ''}

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Semana ${formatearFecha(semanaMttoSeleccionada)} — ${formatearFecha(fin)}</h3>
            <span class="small-muted">${guardada ? 'Rotación guardada · puedes actualizarla' : 'Rotación pendiente de guardar'}</span>
          </div>
          <div class="actions-row" style="margin:0;">
            <button class="btn btn-ghost btn-sm" onclick="mttoMoverSemana(-7)">← Semana anterior</button>
            <button class="btn btn-ghost btn-sm" onclick="mttoIrSemanaActual()">Semana actual</button>
            <button class="btn btn-ghost btn-sm" onclick="mttoMoverSemana(7)">Semana siguiente →</button>
          </div>
        </div>

        <div class="panel-body">
          ${tecnicos.length ? `
            <div class="actions-row" style="justify-content:flex-end;margin:0 0 14px 0;gap:8px;flex-wrap:wrap;">
              <input
                id="mtto-excel-input"
                type="file"
                accept=".xlsx,.xls"
                style="display:none"
                onchange="mttoImportarExcel(this)"
              >
              <button class="btn btn-ghost btn-sm" onclick="mttoAbrirImportacionExcel()">
                📥 Importar rotación Excel
              </button>
            </div>
            <div class="small-muted" style="margin-bottom:12px;">
              Excel: DNI | Técnico | Turno | Hora ingreso | Hora salida | Horario. Todos los horarios quedan editables antes de guardar.
            </div>

            <div class="tareo-table-scroll">
              <table class="tareo-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Técnico</th>
                    <th>Cargo</th>
                    <th>Turno</th>
                    <th>Ingreso</th>
                    <th>Salida</th>
                    <th>Horario</th>
                  </tr>
                </thead>
                <tbody>
                  ${tecnicos.map((w,index) => {
                    const clave = mttoClaveTrabajador(w);
                    const p = borradorMtto[clave];
                    const arg = escaparHTML(JSON.stringify(clave));
                    return `
                      <tr data-mtto-clave="${escaparHTML(clave)}">
                        <td>${index+1}</td>
                        <td>
                          <strong>${escaparHTML(w.nombre || '')}</strong>
                          <div class="small-muted">${w.dni ? 'DNI ' + escaparHTML(w.dni) : ''}</div>
                        </td>
                        <td>${escaparHTML(w.cargo || 'Técnico de Mantenimiento')}</td>
                        <td>
                          <select data-mtto-turno onchange="mttoCambiarTurno(${arg}, this.value)">
                            ${Object.keys(TURNOS_MTTO).map(t => `<option value="${t}" ${p.turno===t?'selected':''}>${t}</option>`).join('')}
                          </select>
                        </td>
                        <td><input data-mtto-ingreso type="time" value="${escaparHTML(p.horaIngreso)}" onchange="mttoCambiarHora(${arg},'horaIngreso',this.value); const h=this.closest('tr')?.querySelector('[data-mtto-horario]'); if(h) h.textContent=mttoHorarioTexto(borradorMtto[${arg}]);"></td>
                        <td><input data-mtto-salida type="time" value="${escaparHTML(p.horaSalida)}" onchange="mttoCambiarHora(${arg},'horaSalida',this.value); const h=this.closest('tr')?.querySelector('[data-mtto-horario]'); if(h) h.textContent=mttoHorarioTexto(borradorMtto[${arg}]);"></td>
                        <td>
                          <input
                            data-mtto-horario
                            type="text"
                            value="${escaparHTML(p.horario || mttoHorarioTexto(p))}"
                            placeholder="Ej. 07:00 - 16:00"
                            onchange="mttoCambiarHorario(${arg}, this.value)"
                            style="min-width:150px;"
                          >
                        </td>
                      </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <div class="actions-row" style="justify-content:flex-end;margin-top:16px;">
              <button class="btn btn-primary" onclick="guardarRotacionSemanalMantenimiento()">💾 Guardar rotación semanal</button>
            </div>
          ` : `
            <div class="empty-state">
              <h4>No hay técnicos activos</h4>
              <p>Registra técnicos de Mantenimiento activos en Gestionar trabajadores.</p>
            </div>`}
        </div>
      </div>`;
  }
  window.renderRotacionSemanalMantenimiento = renderRotacionSemanalMantenimiento;

  /* Agrega la pestaña SOLO al Supervisor/Jefe de Mantenimiento. */
  if(typeof tareoRenderTabs === 'function'){
    const tabsAnterior = tareoRenderTabs;
    tareoRenderTabs = function(activa){
      let html = tabsAnterior(activa);
      if(!puedeGestionarRotacionMtto()) return html;

      const boton = `
        <button
          class="tareo-tab ${activa === 'rotacionMtto' ? 'active' : ''}"
          onclick="renderRotacionSemanalMantenimiento()"
        >Rotación semanal MTTO</button>`;

      return html.replace('</div>', boton + '</div>');
    };
    window.tareoRenderTabs = tareoRenderTabs;
  }

})();
