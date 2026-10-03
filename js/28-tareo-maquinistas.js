/* =============================================================
   GLACIAL · MAQUINISTAS: PRODUCCIÓN = FUENTE OFICIAL
   =============================================================

   NUEVO FLUJO:
   - Los MAQUINISTAS se registran/editan SOLO en Tareo Producción.
   - En Tareo Mantenimiento aparecen como ESPEJO DE SOLO LECTURA.
   - Los TÉCNICOS de mantenimiento siguen registrándose en MTTO.
   - No se crea un segundo registro de asistencia del maquinista.
     Mantenimiento lee el mismo dato guardado por Producción.

   Cargar DESPUÉS de 13-tareo.js y ANTES de 12-init.js.
   ============================================================= */
(function instalarMaquinistasProduccionEspejoMtto(){
  'use strict';

  const maquina = /\b(?:sopladora|sop|envasadora|env|etiquetadora|etq|empaquetadora|emp)\b/;
  const directivo = /supervis|jefe|gerent|coordinad|asistent|rrhh|administr/;
  const tecnico = /\b(?:tecnic[oa]s?|mecanic[oa]s?|electricistas?|electromecanic[oa]s?)\b/;
  const mtto = /\b(?:mtto|mantenimiento)\b/;

  function tareoEsMaquinistaEquipo(cargo){
    const valor = tareoNormalizarTexto(cargo);
    return !directivo.test(valor) &&
      (/\bmaquinistas?\b/.test(valor) || maquina.test(valor)) &&
      (!mtto.test(valor) || /\bmaquinistas?\b|operari[oa]|operador/.test(valor));
  }
  window.tareoEsMaquinistaEquipo = tareoEsMaquinistaEquipo;

  function tareoEsTecnicoMantenimiento(cargo){
    const valor = tareoNormalizarTexto(cargo);
    return tecnico.test(valor) && mtto.test(valor) && !directivo.test(valor);
  }
  window.tareoEsTecnicoMantenimiento = tareoEsTecnicoMantenimiento;

  /* El Supervisor de Mantenimiento pertenece al tareo de su área. */
  function tareoEsSupervisorMantenimiento(cargo){
    const valor = tareoNormalizarTexto(cargo);
    return /\bsupervis\w*\b/.test(valor) && mtto.test(valor);
  }
  window.tareoEsSupervisorMantenimiento = tareoEsSupervisorMantenimiento;

  function personalActivo(){
    const lista = typeof loadWorkers === 'function' ? loadWorkers() : [];
    return Array.isArray(lista)
      ? lista.filter(w => w && tareoNormalizarTexto(w.estado) === 'activo')
      : [];
  }

  function encontrarFicha(persona, trabajadores){
    const id = String(persona?.trabajadorId ?? persona?.id ?? '').trim();
    if(id){
      const porId = trabajadores.find(w => String(w.id ?? '').trim() === id);
      if(porId) return porId;
    }

    const dni = tareoNormalizarDNI(persona?.dni);
    if(dni){
      const porDni = trabajadores.find(w => tareoNormalizarDNI(w.dni) === dni);
      if(porDni) return porDni;
    }

    const nombre = tareoNormalizarTexto(persona?.nombre);
    const porNombre = nombre
      ? trabajadores.filter(w => tareoNormalizarTexto(w.nombre) === nombre)
      : [];

    return porNombre.length === 1 ? porNombre[0] : null;
  }

  function clavePersona(persona){
    return String(persona?.trabajadorId ?? persona?.id ??
      tareoNormalizarDNI(persona?.dni) ?? persona?.nombre ?? '');
  }

  function esMaquinistaPersona(persona, trabajadores = personalActivo()){
    const ficha = encontrarFicha(persona, trabajadores);
    return tareoEsMaquinistaEquipo(ficha?.cargo || persona?.cargo || '');
  }

  function maquinistasActivos(){
    return personalActivo().filter(w => tareoEsMaquinistaEquipo(w.cargo));
  }

  /* ---------------------------------------------------------
     1. CARGOS POR ÁREA
     ---------------------------------------------------------
     Mantenimiento ya NO acepta maquinistas como personal propio.
     Producción sí los acepta aunque administrativamente estén en MTTO.
  */
  const cargoAnterior = tareoCargoPermitido;
  tareoCargoPermitido = function(cargo, area){
    if(area === 'Mantenimiento'){
      return tareoEsTecnicoMantenimiento(cargo) ||
        tareoEsSupervisorMantenimiento(cargo);
    }

    if(area === 'Producción' && tareoEsMaquinistaEquipo(cargo)){
      return true;
    }

    return cargoAnterior(cargo, area);
  };
  window.tareoCargoPermitido = tareoCargoPermitido;

  /* ---------------------------------------------------------
     2. PRODUCCIÓN: LA ROTACIÓN EXCEL ES LA ÚNICA FUENTE
     ---------------------------------------------------------
     IMPORTANTE:
     Este archivo NO modifica obtenerPersonalPorRotacion().
     Operarios, maquinistas y supervisores de Producción salen
     exclusivamente de la rotación Excel procesada por 13-tareo.js.

     Antes este bloque consultaba loadWorkers(), reemplazaba
     identidad/cargo/línea y agregaba maquinistas activos aunque
     no estuvieran en el Excel. Eso generaba duplicados.
  */


  /* ---------------------------------------------------------
     3. MANTENIMIENTO: DATOS ESPEJO DESDE PRODUCCIÓN
     --------------------------------------------------------- */
  function tareoProduccionRelacionado(tareoMtto){
    if(!tareoMtto) return null;
    return typeof tareoBuscar === 'function'
      ? tareoBuscar('Producción', tareoMtto.fecha, tareoMtto.turno)
      : null;
  }

  function personaProduccionDeTrabajador(tareoProduccion, trabajador){
    if(!tareoProduccion || !Array.isArray(tareoProduccion.personal)) return null;
    const trabajadores = personalActivo();

    return tareoProduccion.personal.find(p => {
      const ficha = encontrarFicha(p, trabajadores);
      if(ficha && String(ficha.id ?? '') === String(trabajador.id ?? '')) return true;

      const dniW = tareoNormalizarDNI(trabajador.dni);
      const dniP = tareoNormalizarDNI(p.dni);
      if(dniW && dniP && dniW === dniP) return true;

      return tareoNormalizarTexto(p.nombre) === tareoNormalizarTexto(trabajador.nombre);
    }) || null;
  }

  function maquinistasEspejo(tareoMtto){
    const produccion = tareoProduccionRelacionado(tareoMtto);

    if(
      !produccion ||
      !Array.isArray(produccion.personal)
    ){
      return [];
    }

    /*
       FUENTE ÚNICA:
       El espejo de Mantenimiento nace del Tareo de Producción.
       No se consulta loadWorkers() para decidir qué maquinistas
       deben aparecer ni se crea una segunda asistencia.
    */
    return produccion.personal
      .filter(p => {
        const cargo = tareoNormalizarTexto(p?.cargo || '');
        return /\bmaquinista(?:s)?\b/.test(cargo);
      })
      .map(p => ({
        trabajadorId: p.trabajadorId || p.id || '',
        nombre: p.nombre || '',
        tipoDocumento: p.tipoDocumento || (p.dni ? 'DNI' : ''),
        dni: p.dni || '',
        cargo: p.cargo || 'Maquinista de Producción',
        linea: p.linea || '',
        asistencia: p.asistencia || '',
        horaIngreso: p.horaIngreso || '',
        salidaRefrigerio: p.salidaRefrigerio || '',
        retornoRefrigerio: p.retornoRefrigerio || '',
        refrigerio: Number(p.refrigerio || 0),
        horaSalida: p.horaSalida || '',
        horasTrabajadas: Number(p.horasTrabajadas || 0),
        horasExtras: Number(p.horasExtras || 0),
        tardanzaMinutos: Number(p.tardanzaMinutos || 0),
        registradoPor: p.registradoPor || '',
        actualizadoEn: Number(p.actualizadoEn || 0),
        _origenProduccion: true,
        _existeEnProduccion: true,
        salidaEditada: !!p.salidaEditada,
        salidaOriginal: p.salidaOriginal || "",
        edicionesSalida: p.edicionesSalida || [],
        trabajoEnDescanso: !!p.trabajoEnDescanso,
        _tareoId: produccion.id,
        _clave: tareoClavePersona(p),
        _persona: p
      }));
  }

  function claseEstado(persona){
    if(typeof tareoClaseEstado === 'function'){
      return tareoClaseEstado(persona.asistencia);
    }
    return '';
  }

  function htmlEspejoMantenimiento(tareo){
    const lista = maquinistasEspejo(tareo);
    const produccion = tareoProduccionRelacionado(tareo);

    return `
      <div class="panel tar-maq-espejo" id="tareo-maquinistas-espejo">
        <div class="panel-head">
          <div>
            <h3>Maquinistas · información de Producción</h3>
            <span class="small-muted">
              Solo visualización. El ingreso, salida y asistencia se registran desde Tareo de Producción.
            </span>
          </div>
          <span class="tar-maq-lock">🔒 Solo lectura</span>
        </div>
        <div class="panel-body">
          ${!produccion ? `
            <div class="tar-maq-aviso">
              El Tareo de Producción de ${escaparHTML(tareo.turno)} todavía no ha sido iniciado.
              Los maquinistas aparecerán aquí automáticamente cuando Producción registre su asistencia.
            </div>
          ` : ''}

          ${lista.length ? `
            <div class="tareo-table-scroll">
              <table class="tareo-table">
                <thead>
                  <tr>
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
                    <th>Origen</th>
                  </tr>
                </thead>
                <tbody>
                  ${lista.map(p => `
                    <tr class="tar-maq-readonly">
                      <td>
                        <div class="tareo-worker">
                          <strong>${escaparHTML(p.nombre)}</strong>
                          <small>${escaparHTML(p.tipoDocumento || 'DNI')}: ${escaparHTML(p.dni || '—')}</small>
                        </div>
                      </td>
                      <td>${escaparHTML(p.cargo || 'Maquinista')}</td>
                      <td>${p.linea ? escaparHTML(p.linea) : 'Sin línea'}</td>
                      <td>
                        <span class="tareo-status ${claseEstado(p)}">
                          ${escaparHTML(tareoEtiquetaEstado(p.asistencia))}
                        </span>
                      </td>
                      <td>${p.horaIngreso || '—'}</td>
                      <td>${Number(p.refrigerio || 0) > 0 ? escaparHTML(String(p.refrigerio)) + ' h' : '—'}</td>
                      <td>${p.horaSalida || '—'}${tareoMarcaSalidaEditada(p)}${(typeof tareoPuedeEditarSalidaMaquinistas==='function' && tareoPuedeEditarSalidaMaquinistas() && p.horaSalida) ? '<button type="button" class="tar2-inline-btn" onclick="tareoEditarSalidaMaquinista(' + tareoArg(p._tareoId) + ',' + tareoArg(p._clave) + ')">Editar salida</button>' : ''}</td>
                      <td>${formatearHoras(p.horasTrabajadas)}</td>
                      <td>${tareoSaldoHTML(tareoSaldoHoras(p._persona))}</td>
                      <td>${Number(p.tardanzaMinutos || 0) > 0 ? formatearMinutos(p.tardanzaMinutos) : '—'}</td>
                      <td><span class="tar-maq-origin">Producción</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <div class="empty-state">
              <p>No hay maquinistas en el Tareo de Producción para este turno.</p>
            </div>
          `}
        </div>
      </div>
    `;
  }

  function insertarEspejo(tareo){
    if(tareoAreaDe(tareo) !== 'Mantenimiento') return;

    document.getElementById('tareo-maquinistas-espejo')?.remove();

    const main = document.getElementById('main');
    if(!main) return;

    main.insertAdjacentHTML('beforeend', htmlEspejoMantenimiento(tareo));
  }

  /* ---------------------------------------------------------
     4. FORMULARIO MTTO: SOLO TÉCNICOS EDITABLES
     ---------------------------------------------------------
     Los maquinistas antiguos que hayan quedado guardados dentro
     de un tareo MTTO no se borran del historial, pero ya no se
     muestran como editables. Abajo se muestra el espejo oficial
     que viene de Producción.
  */
  const renderFormularioAnterior = renderTareoFormulario;
  renderTareoFormulario = function(tareo){
    if(tareoAreaDe(tareo) !== 'Mantenimiento'){
      return renderFormularioAnterior(tareo);
    }

    const trabajadores = personalActivo();
    const copia = {
      ...tareo,
      personal: (tareo.personal || []).filter(p => !esMaquinistaPersona(p, trabajadores))
    };

    const resultado = renderFormularioAnterior(copia);
    insertarEspejo(tareo);
    return resultado;
  };
  window.renderTareoFormulario = renderTareoFormulario;

  /* Lectura/historial de MTTO: misma regla visual. */
  const renderLecturaAnterior = renderTareoLectura;
  renderTareoLectura = function(tareo){
    if(tareoAreaDe(tareo) !== 'Mantenimiento'){
      return renderLecturaAnterior(tareo);
    }

    const trabajadores = personalActivo();
    const copia = {
      ...tareo,
      personal: (tareo.personal || []).filter(p => !esMaquinistaPersona(p, trabajadores))
    };

    const resultado = renderLecturaAnterior(copia);
    insertarEspejo(tareo);
    return resultado;
  };
  window.renderTareoLectura = renderTareoLectura;

  /* ---------------------------------------------------------
     5. BLOQUEO DE SEGURIDAD A NIVEL DE LÓGICA
     ---------------------------------------------------------
     Aunque un tareo MTTO antiguo conserve un maquinista dentro
     de su arreglo, no permitimos editarlo desde Mantenimiento.
  */
  const editarPersonaAnterior = tareoEditarPersona;
  tareoEditarPersona = function(clave, cambiar){
    const tareo = tareoObtenerActual();

    if(tareo && tareoAreaDe(tareo) === 'Mantenimiento'){
      const persona = (tareo.personal || []).find(
        p => tareoClavePersona(p) === String(clave)
      );

      if(persona && esMaquinistaPersona(persona)){
        alert('Los maquinistas se registran únicamente desde Tareo de Producción. En Mantenimiento son de solo lectura.');
        return;
      }
    }

    return editarPersonaAnterior.apply(this, arguments);
  };
  window.tareoEditarPersona = tareoEditarPersona;

  /* ---------------------------------------------------------
     6. AGREGAR PERSONAL MANUALMENTE
     ---------------------------------------------------------
     En MTTO el selector no ofrece maquinistas.
     En Producción tampoco se agregan manualmente desde Trabajadores:
     los maquinistas provienen exclusivamente de la rotación Excel.
  */

  /* ---------------------------------------------------------
     7. ESTILO DEL ESPEJO
     --------------------------------------------------------- */
  if(!document.getElementById('tar-maq-espejo-style')){
    const style = document.createElement('style');
    style.id = 'tar-maq-espejo-style';
    style.textContent = `
      .tar-maq-espejo{margin-top:16px;border-left:4px solid var(--blue,#005B96)}
      .tar-maq-espejo .panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
      .tar-maq-espejo .panel-head h3{margin:0 0 3px}
      .tar-maq-lock,.tar-maq-origin{display:inline-flex;align-items:center;white-space:nowrap;border-radius:999px;padding:4px 9px;font-size:11px;font-weight:700;background:#eaf5fc;color:#003b5c;border:1px solid #c9e1ef}
      .tar-maq-readonly{background:#f8fafb}
      .tar-maq-readonly td{opacity:.92}
      .tar-maq-aviso{margin-bottom:12px;padding:10px 12px;border-radius:8px;background:#fff4d9;border:1px solid #efd69a;color:#72520e;font-size:12px;line-height:1.45}
      @media(max-width:700px){.tar-maq-espejo .panel-head{align-items:flex-start}.tar-maq-lock{margin-top:2px}}
    `;
    document.head.appendChild(style);
  }

  /* ---------------------------------------------------------
     8. FIREBASE EN TIEMPO REAL
     ---------------------------------------------------------
     02-estado.js ya llama tareoRefrescarFormularioRemoto() al
     llegar cambios de sync/tareos. Como el espejo se dibuja en
     renderTareoFormulario(), el ingreso marcado por Producción
     aparece automáticamente en la pantalla de Mantenimiento.
  */

  /*
     Los cambios en Gestionar trabajadores NO refrescan ni modifican
     el padrón de Producción. El espejo se actualiza con sync/tareos.
  */
})();
