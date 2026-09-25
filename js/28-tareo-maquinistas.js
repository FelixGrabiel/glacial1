/* GLACIAL · Técnicos de MTTO y maquinistas en el tareo de mantenimiento.
   Cargar después de 13-tareo.js y antes de 12-init.js. */
(function instalarMaquinistasEnTareo() {
  'use strict';

  // Acepta el nombre completo o la abreviatura como palabra independiente.
  const maquina = /\b(?:sopladora|sop|envasadora|env|etiquetadora|etq|empaquetadora|emp)\b/;
  const directivo = /supervis|jefe|gerent|coordinad|asistent|rrhh|administr/;
  const tecnico = /\b(?:tecnic[oa]s?|mecanic[oa]s?|electricistas?|electromecanic[oa]s?)\b/;
  const mtto = /\b(?:mtto|mantenimiento)\b/;

  function tareoEsMaquinistaEquipo(cargo) {
    const valor = tareoNormalizarTexto(cargo);
    return !directivo.test(valor) &&
      ( /\bmaquinistas?\b/.test(valor) || maquina.test(valor) ) &&
      // Un técnico que repara una máquina no pasa por ello a Producción.
      (!mtto.test(valor) || /\bmaquinistas?\b|operari[oa]|operador/.test(valor));
  }
  window.tareoEsMaquinistaEquipo = tareoEsMaquinistaEquipo;

  function tareoEsTecnicoMantenimiento(cargo) {
    const valor = tareoNormalizarTexto(cargo);
    return tecnico.test(valor) && mtto.test(valor) && !directivo.test(valor);
  }
  window.tareoEsTecnicoMantenimiento = tareoEsTecnicoMantenimiento;

  const cargoAnterior = tareoCargoPermitido;
  tareoCargoPermitido = function (cargo, area) {
    if (area === 'Mantenimiento') {
      return tareoEsTecnicoMantenimiento(cargo) || tareoEsMaquinistaEquipo(cargo);
    }
    return cargoAnterior(cargo, area) || tareoEsMaquinistaEquipo(cargo);
  };

  function personalActivo() {
    const lista = typeof loadWorkers === 'function' ? loadWorkers() : [];
    return Array.isArray(lista) ? lista.filter(w => w &&
      tareoNormalizarTexto(w.estado) === 'activo') : [];
  }

  function encontrarFicha(persona, trabajadores) {
    const id = String(persona.trabajadorId ?? persona.id ?? '').trim();
    if (id) {
      const porId = trabajadores.find(w => String(w.id ?? '').trim() === id);
      if (porId) return porId;
    }
    const dni = tareoNormalizarDNI(persona.dni);
    if (dni) {
      const porDni = trabajadores.find(w => tareoNormalizarDNI(w.dni) === dni);
      if (porDni) return porDni;
    }
    const nombre = tareoNormalizarTexto(persona.nombre);
    const porNombre = nombre ? trabajadores.filter(w =>
      tareoNormalizarTexto(w.nombre) === nombre) : [];
    return porNombre.length === 1 ? porNombre[0] : null;
  }

  // La rotación puede guardar un cargo/DNI anterior al padrón actualizado.
  const rotacionAnterior = obtenerPersonalPorRotacion;
  obtenerPersonalPorRotacion = function (fecha, turno) {
    const resultado = rotacionAnterior(fecha, turno);
    if (!resultado.tieneRotacion) return resultado;
    const trabajadores = personalActivo();
    return {
      ...resultado,
      personal: resultado.personal.map(p => {
        const ficha = encontrarFicha(p, trabajadores);
        return ficha ? {
          ...p,
          id: ficha.id,
          dni: ficha.dni || p.dni,
          cargo: ficha.cargo || p.cargo,
          linea: ficha.linea || p.linea
        } : p;
      })
    };
  };

  function faltantesMantenimiento(tareo) {
    const presentes = Array.isArray(tareo.personal) ? tareo.personal : [];
    const trabajadores = personalActivo();
    return trabajadores.filter(w => tareoCargoPermitido(w.cargo, 'Mantenimiento') &&
      !presentes.some(p => String(encontrarFicha(p, trabajadores)?.id ?? '') === String(w.id ?? '') ||
        (!!tareoNormalizarDNI(w.dni) &&
          tareoNormalizarDNI(p.dni) === tareoNormalizarDNI(w.dni))));
  }

  // Un tareo ya guardado no se modifica al abrirlo. El responsable decide
  // si incorpora los maquinistas que faltan; quedan sin marcar asistencia.
  function incorporarPersonalMantenimiento() {
    const tareo = tareoObtenerActual();
    if (!tareo || tareoAreaDe(tareo) !== 'Mantenimiento' ||
        !tareoPuedeEditar(tareo)) return;
    const faltantes = faltantesMantenimiento(tareo);
    if (!faltantes.length) return;
    tareo.personal = ordenarPersonalTareo([
      ...(tareo.personal || []),
      ...faltantes.map(w => tareoNuevaPersona(w, 'Mantenimiento'))
    ]);
    guardarTareoEnMemoria(tareo);
    renderTareoFormulario(tareo);
  }
  window.incorporarPersonalMantenimiento = incorporarPersonalMantenimiento;
  window.incorporarMaquinistasMantenimiento = incorporarPersonalMantenimiento;

  const renderAnterior = renderTareoFormulario;
  renderTareoFormulario = function (tareo) {
    renderAnterior(tareo);
    if (tareoAreaDe(tareo) !== 'Mantenimiento' ||
        !tareoPuedeEditar(tareo) || !faltantesMantenimiento(tareo).length) return;
    const agregar = document.querySelector('#tareo-form-view ~ .panel .tar2-quick button[onclick="tareoAbrirAgregarPersonal()"]') ||
      document.querySelector('.tar2-quick button[onclick="tareoAbrirAgregarPersonal()"]');
    if (!agregar) return;
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn btn-ghost btn-sm';
    boton.textContent = '+ Incorporar técnicos y maquinistas';
    boton.onclick = incorporarPersonalMantenimiento;
    agregar.after(boton);
  };
  window.renderTareoFormulario = renderTareoFormulario;

  // Al llegar trabajadores desde Firebase, refresca la lista abierta.
  // El refresco del formulario respeta campos que se estén editando.
  const alActualizarTrabajadores = onWorkersUpdated;
  onWorkersUpdated = function (...args) {
    const resultado = alActualizarTrabajadores.apply(this, args);
    if (document.getElementById('tareo-principal-view')) {
      renderTareoPrincipal();
    } else if (document.getElementById('tareo-form-view')) {
      tareoRefrescarFormularioRemoto();
    }
    return resultado;
  };
})();
