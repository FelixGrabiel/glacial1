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
  let mttoSucio = false;   // hay cambios en pantalla aún sin guardar con «Guardar rotación semanal»

  function textoUsuarioMtto(){
    const u = (typeof state !== 'undefined' && state.user) ? state.user : {};
    return tareoNormalizarTexto([
      u.puesto || '',
      u.rol || '',
      u.cargo || ''
    ].join(' '));
  }

  function puedeGestionarRotacionMtto(){
    if(typeof tienePermiso !== 'function') return false;

    // Jefatura/Gerencia solo consultan: nunca gestionan la rotación.
    if(typeof esUsuarioSoloConsulta === 'function' && esUsuarioSoloConsulta(state.user)){
      return false;
    }

    // Permiso explícito asignado por Administración (rotación MTTO y de maquinistas).
    if(tienePermiso('gestionar_rotacion_mantenimiento')) return true;

    if(!tienePermiso('moduloMantenimiento')) return false;

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

    /* Cambios del editor del cuadro aún sin aplicar y cambios sin guardar: se resuelven antes de cambiar de semana. */
  function mttoPuedeSalirDeLaSemana(){
    if(window.glacialRotGrid && !window.glacialRotGrid.resolverPendientes('rot-mtto')) return false;
    if(mttoSucio && !confirm('Hay cambios sin guardar en la rotación de esta semana. ¿Cambiar de semana y descartarlos?')) return false;
    mttoSucio = false;
    if(window.glacialRotGrid) window.glacialRotGrid.limpiar('rot-mtto');
    return true;
  }

  function mttoMoverSemana(dias){
    if(!mttoPuedeSalirDeLaSemana()) return;
    const f = mttoFechaLocal(semanaMttoSeleccionada);
    f.setDate(f.getDate()+dias);
    semanaMttoSeleccionada = mttoLunesSemana(f);
    renderRotacionSemanalMantenimiento();
  }
  window.mttoMoverSemana = mttoMoverSemana;

    function mttoIrSemanaActual(){
    if(!mttoPuedeSalirDeLaSemana()) return;
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

    /* Aplica turno, ingreso y salida de un técnico JUNTOS sobre el borrador de la semana (lo que antes hacían tres controles). Lo llama el
     cuadro tipo Excel; el guardado y los permisos siguen siendo los de «Guardar rotación semanal». */
  function mttoAplicarAsignacion(clave, asig){
    if(!puedeGestionarRotacionMtto()) return {ok:false, error:'Solo el Supervisor de Mantenimiento o Jefe de Mantenimiento puede editar esta rotación.'};
    const p = borradorMtto[String(clave)];
    if(!p) return {ok:false, error:'No se encontró al técnico en la rotación de la semana.'};
    if(!asig || !TURNOS_MTTO[asig.turno]) return {ok:false, error:'Turno no válido.'};
    if(!asig.inicio || !asig.fin) return {ok:false, error:'Indica la hora de ingreso y de salida.'};
    p.turno = asig.turno;
    p.horaIngreso = asig.inicio;
    p.horaSalida = asig.fin;
    p.horario = `${p.horaIngreso} - ${p.horaSalida}`;
    mttoSucio = true;
    return {ok:true};
  }
  window.mttoAplicarAsignacion = mttoAplicarAsignacion;
  window.mttoAplicarAsignacionGrid = (clave, diaIdx, asig) => mttoAplicarAsignacion(clave, asig);
  window.mttoRerenderGrid = () => renderRotacionSemanalMantenimiento({conservar:true});

  /* Datos del cuadro (una celda por técnico: el turno de MTTO es semanal, no por día). */
  function mttoConfigCuadro(tecnicos){
    const f0 = mttoFechaLocal(semanaMttoSeleccionada);
    const NOMBRES = ['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'], LARGOS = ['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
    const dias = NOMBRES.map((etq,i) => {
      const d = new Date(f0); d.setDate(d.getDate()+i);
      const dd = String(d.getDate()).padStart(2,'0'), mm = String(d.getMonth()+1).padStart(2,'0');
      return {fecha:mttoFechaISO(d), etq, corta:dd+'/'+mm, largo:LARGOS[i]+' '+dd+'/'+mm, hoy:mttoFechaISO(d)===mttoFechaISO(new Date())};
    });
    const clases = {'Día':'dia','Intermedio':'intermedio','Noche':'noche'};
    return {
      id:'rot-mtto', col1:'TÉCNICO', etiquetaTabla:'Rotación semanal de Mantenimiento',
      dias, fusion:{etq:'Toda la semana', titulo:'TURNO DE LA SEMANA'},
      filas: tecnicos.map(w => {
        const clave = mttoClaveTrabajador(w), p = borradorMtto[clave] || {};
        return {id:clave, nombre:w.nombre || '', sub:(w.cargo || 'Técnico de Mantenimiento')+(w.dni ? ' · DNI '+w.dni : ''),
          celdas:[{valor:p.turno || 'Día', inicio:p.horaIngreso || '', fin:p.horaSalida || ''}]};
      }),
      catalogo: Object.keys(TURNOS_MTTO).map(t => ({valor:t, etq:t.toUpperCase(), clase:clases[t] || 'otro', horas:true,
        base:{inicio:TURNOS_MTTO[t].ingreso, fin:TURNOS_MTTO[t].salida}})),
      bloqueado:false, aplicar:'mttoAplicarAsignacionGrid', rerender:'mttoRerenderGrid'
    };
  }

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
    // El borrador importado se muestra en el cuadro y queda pendiente de «Guardar rotación semanal».
    mttoSucio = true;
    renderRotacionSemanalMantenimiento({conservar:true});
  }

    function guardarRotacionSemanalMantenimiento(){
    if(!puedeGestionarRotacionMtto()){
      alert('Solo el Supervisor de Mantenimiento o Jefe de Mantenimiento puede guardar esta rotación.');
      return;
    }
    // Lo que está en el editor del cuadro y no se aplicó se aplica o se descarta antes de guardar (no se guarda a medias).
    if(window.glacialRotGrid && !window.glacialRotGrid.resolverPendientes('rot-mtto')) return;


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
    mttoSucio = false;
    alert('Rotación semanal de Mantenimiento guardada correctamente.');
    renderRotacionSemanalMantenimiento();
  }
  window.guardarRotacionSemanalMantenimiento = guardarRotacionSemanalMantenimiento;

    function renderRotacionSemanalMantenimiento(opts){
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

        // Con cambios sin guardar (o al redibujar el cuadro tras «Aplicar») se conserva el borrador; si no, se arma desde lo guardado.
    if(!((opts && opts.conservar) || mttoSucio)) mttoPrepararBorrador();
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
            <span class="small-muted">${guardada ? 'Rotación guardada · puedes actualizarla' : 'Rotación pendiente de guardar'}${mttoSucio ? ' · <strong>cambios sin guardar</strong>' : ''}</span>
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
              Excel: DNI | Técnico | Turno | Hora ingreso | Hora salida | Horario. Selecciona la celda de un técnico para cambiar su turno y horario; luego pulsa «Guardar rotación semanal».
            </div>

            ${window.glacialRotGrid ? window.glacialRotGrid.html(mttoConfigCuadro(tecnicos)) : '<div class="empty-state"><p>No se cargó el cuadro de rotación.</p></div>'}

            <div class="actions-row" style="justify-content:flex-end;margin-top:16px;">
              <button class="btn btn-primary" onclick="guardarRotacionSemanalMantenimiento()">💾 Guardar rotación semanal</button>
            </div>
          ` : `
            <div class="empty-state">
              <h4>No hay técnicos activos</h4>
              <p>Registra técnicos de Mantenimiento activos en Gestionar trabajadores.</p>
            </div>          `}
        </div>
      </div>`;
    if(window.glacialRotGrid) window.glacialRotGrid.activar('rot-mtto');
  }
  window.renderRotacionSemanalMantenimiento = renderRotacionSemanalMantenimiento;

  /* Agrega la pestaña SOLO al Supervisor/Jefe de Mantenimiento. */
  if(typeof tareoRenderTabs === 'function'){
    const tabsAnterior = tareoRenderTabs;
    tareoRenderTabs = function(activa){
      let html = tabsAnterior(activa);
      if(!puedeGestionarRotacionMtto() || !tareoPestanaEnModulo('rotacionMtto')) return html;

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
