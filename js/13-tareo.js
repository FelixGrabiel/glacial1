/* =============================================================
   GLACIAL — TAREO DE PERSONAL
   IMPORTACIÓN DE ROTACIÓN DESDE EXCEL (INDEPENDIENTE)
   =============================================================

   - El Excel es la ÚNICA fuente del personal.
   - NO se consulta la lista de trabajadores (loadWorkers).
   - Del Excel se toma: Nombre y apellido, Turno (y DNI/Fecha si vienen).
   - El SUPERVISOR completa después: Área, Hora de ingreso,
     Hora de salida, Asistencia y Observaciones.
   ============================================================= */


/* =========================================================
   CONFIGURACIÓN
   ========================================================= */

const TAREO_STORAGE_KEY = "GLACIAL_TAREOS";
const TAREO_ROTACION_STORAGE_KEY = "GLACIAL_ROTACION_SEMANAL";

/* Sugerencias de área (el supervisor también puede escribir otra) */
const TAREO_AREAS = [
  "PET1",
  "PET2",
  "B7L",
  "C20L",
  "B20L",
  "Mantenimiento",
  "Almacén",
  "Limpieza",
  "Calidad",
  "Administración"
];

const TAREO_ASISTENCIAS = [
  "Asistió",
  "Falta",
  "Tardanza",
  "Permiso",
  "Descanso",
  "Vacaciones"
];

/* Campos que completa el supervisor */
const TAREO_CAMPOS_SUPERVISOR = {
  area: "",
  horaIngreso: "",
  horaSalida: "",
  asistencia: "",
  observaciones: ""
};


/* =========================================================
   UTILIDADES DE TEXTO
   ========================================================= */

function tareoNormalizarTexto(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tareoNormalizarDNI(valor) {
  return String(valor || "")
    .replace(/\D/g, "")
    .trim();
}

function tareoLimpiarEspacios(valor) {
  return String(valor || "")
    .replace(/\s+/g, " ")
    .trim();
}

function tareoEscapeHTML(valor) {
  return String(valor === undefined || valor === null ? "" : valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


/* =========================================================
   NORMALIZAR TURNO
   ========================================================= */

function normalizarTurno(valor) {

  const texto = tareoNormalizarTexto(valor);

  if (!texto) {
    return "";
  }

  if (texto === "n" || texto.includes("noche")) {
    return "Noche";
  }

  if (texto === "d" || texto === "dia" || texto.includes("dia")) {
    return "Día";
  }

  return "";

}


/* =========================================================
   ENCONTRAR COLUMNA DEL EXCEL
   ========================================================= */

function encontrarColumna(filas, alternativas) {

  if (!Array.isArray(filas) || !filas.length) {
    return null;
  }

  const columnas = Object.keys(filas[0]);

  for (const columna of columnas) {

    const normalizada = tareoNormalizarTexto(columna);

    const encontrada = alternativas.some(alternativa =>
      normalizada.includes(tareoNormalizarTexto(alternativa))
    );

    if (encontrada) {
      return columna;
    }

  }

  return null;

}


/* =========================================================
   FECHAS
   ========================================================= */

function tareoFormatearFecha(fecha) {

  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, "0");
  const day = String(fecha.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;

}

function normalizarFechaExcel(valor) {

  if (!valor) {
    return "";
  }

  if (Object.prototype.toString.call(valor) === "[object Date]") {

    if (isNaN(valor.getTime())) {
      return "";
    }

    return tareoFormatearFecha(valor);

  }

  const texto = String(valor).trim();

  if (!texto) {
    return "";
  }

  /* YYYY-MM-DD */
  let match = texto.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);

  if (match) {
    return (
      `${match[1]}-` +
      `${String(match[2]).padStart(2, "0")}-` +
      `${String(match[3]).padStart(2, "0")}`
    );
  }

  /* DD/MM/YYYY */
  match = texto.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);

  if (match) {
    return (
      `${match[3]}-` +
      `${String(match[2]).padStart(2, "0")}-` +
      `${String(match[1]).padStart(2, "0")}`
    );
  }

  return "";

}

function obtenerInicioSemana(fecha) {

  const fechaObj = new Date(fecha + "T00:00:00");

  if (isNaN(fechaObj.getTime())) {
    fechaObj.setTime(new Date().getTime());
  }

  /* Domingo = 0, Lunes = 1 */
  const dia = fechaObj.getDay();
  const diferencia = dia === 0 ? 6 : dia - 1;

  fechaObj.setDate(fechaObj.getDate() - diferencia);

  return tareoFormatearFecha(fechaObj);

}

function obtenerFinSemana(fechaInicio) {

  const fecha = new Date(fechaInicio + "T00:00:00");

  fecha.setDate(fecha.getDate() + 6);

  return tareoFormatearFecha(fecha);

}

function obtenerFechaHoy() {
  return tareoFormatearFecha(new Date());
}


/* =========================================================
   IDs
   ========================================================= */

function generarIdRotacion() {
  return (
    "rotacion_" +
    Date.now() +
    "_" +
    Math.random().toString(36).slice(2, 8)
  );
}

function generarIdPersonalRotacion(indice) {
  return (
    "rot_" +
    Date.now() +
    "_" +
    indice +
    "_" +
    Math.random().toString(36).slice(2, 7)
  );
}


/* =========================================================
   ALMACENAMIENTO
   ========================================================= */

function obtenerRotaciones() {

  try {

    const datos = localStorage.getItem(TAREO_ROTACION_STORAGE_KEY);

    if (!datos) {
      return [];
    }

    const rotaciones = JSON.parse(datos);

    return Array.isArray(rotaciones) ? rotaciones : [];

  } catch (error) {

    console.error("TAREO: Error leyendo rotaciones:", error);

    return [];

  }

}

function guardarRotaciones(rotaciones) {

  localStorage.setItem(
    TAREO_ROTACION_STORAGE_KEY,
    JSON.stringify(rotaciones)
  );

}


/* =========================================================
   PREVISUALIZAR EXCEL
   ========================================================= */

async function previsualizarRotacionExcel(event) {

  const archivo = event.target.files[0];

  if (!archivo) {
    return;
  }

  try {

    const datos = await archivo.arrayBuffer();

    const workbook = XLSX.read(datos, {
      type: "array",
      cellDates: true
    });

    if (!workbook.SheetNames || !workbook.SheetNames.length) {
      throw new Error("El archivo no contiene hojas.");
    }

    const hoja = workbook.Sheets[workbook.SheetNames[0]];

    const filas = XLSX.utils.sheet_to_json(hoja, { defval: "" });

    if (!filas.length) {
      throw new Error("El archivo Excel no contiene registros.");
    }

    const resultado = interpretarRotacionExcel(filas);

    window._tareoRotacionPendiente = resultado;

    renderPreviewRotacion(resultado);

  } catch (error) {

    console.error("TAREO: Error al importar Excel:", error);

    alert(
      "No se pudo leer la rotación.\n\n" +
      error.message
    );

  }

  /* Permite volver a subir el mismo archivo */
  event.target.value = "";

}


/* =========================================================
   INTERPRETAR ROTACIÓN
   =========================================================

   INDEPENDIENTE: NO usa loadWorkers().

   Del Excel solo se leen:
   - Nombre y apellido (una columna, o dos: Apellidos + Nombres)
   - Turno
   - DNI y Fecha (opcionales)

   Área, ingreso, salida, asistencia y observaciones quedan
   vacíos para que los llene el supervisor.
   ========================================================= */

function interpretarRotacionExcel(filas) {

  const columnaDNI = encontrarColumna(filas, [
    "dni",
    "documento",
    "n documento",
    "nº documento",
    "numero documento",
    "nro documento",
    "nro. documento"
  ]);

  /* Nombre completo en una sola columna */
  let columnaNombre = encontrarColumna(filas, [
    "apellidos y nombres",
    "apellidos nombres",
    "nombre completo",
    "trabajador",
    "personal",
    "empleado",
    "colaborador",
    "nombre"
  ]);

  /* Alternativa: columnas separadas de apellidos y nombres */
  const columnaApellidos = encontrarColumna(filas, [
    "apellidos",
    "apellido"
  ]);

  const columnaNombres = encontrarColumna(filas, [
    "nombres",
    "nombre"
  ]);

  const usarColumnasSeparadas =
    columnaApellidos &&
    columnaNombres &&
    columnaApellidos !== columnaNombres &&
    (
      !columnaNombre ||
      columnaNombre === columnaNombres ||
      columnaNombre === columnaApellidos
    );

  const columnaTurno = encontrarColumna(filas, [
    "turno",
    "jornada",
    "horario"
  ]);

  const columnaFecha = encontrarColumna(filas, [
    "fecha",
    "dia",
    "día"
  ]);

  if (!columnaNombre && !usarColumnasSeparadas) {
    throw new Error(
      "No se encontró la columna de nombre del trabajador."
    );
  }

  if (!columnaTurno) {
    throw new Error("No se encontró la columna de Turno.");
  }

  const registros = [];
  const invalidos = [];

  let fechaDetectada = "";

  filas.forEach((fila, indice) => {

    const numeroFila = indice + 2;

    let nombre;

    if (usarColumnasSeparadas) {

      nombre = tareoLimpiarEspacios(
        tareoLimpiarEspacios(fila[columnaNombres]) +
        " " +
        tareoLimpiarEspacios(fila[columnaApellidos])
      );

    } else {

      nombre = tareoLimpiarEspacios(fila[columnaNombre]);

    }

    const dni = columnaDNI
      ? tareoNormalizarDNI(fila[columnaDNI])
      : "";

    const turno = normalizarTurno(fila[columnaTurno]);

    const turnoOriginal = String(fila[columnaTurno] || "").trim();

    /* Ignorar filas vacías */
    if (!nombre && !dni && !turnoOriginal) {
      return;
    }

    if (!nombre) {
      invalidos.push({
        fila: numeroFila,
        nombre: "",
        dni,
        turno,
        motivo: "No se encontró el nombre del trabajador."
      });
      return;
    }

    if (!turno) {
      invalidos.push({
        fila: numeroFila,
        nombre,
        dni,
        turno: "",
        motivo: "Turno no reconocido."
      });
      return;
    }

    let fecha = "";

    if (columnaFecha) {

      fecha = normalizarFechaExcel(fila[columnaFecha]);

      if (fecha) {
        fechaDetectada = fecha;
      }

    }

    registros.push({

      id: generarIdPersonalRotacion(indice),

      /* Vienen del Excel */
      nombre,
      dni,
      turno,
      fecha,

      /* Los completa el supervisor */
      ...TAREO_CAMPOS_SUPERVISOR

    });

  });

  if (!fechaDetectada) {
    fechaDetectada = obtenerInicioSemana(obtenerFechaHoy());
  }

  const fechaInicio = obtenerInicioSemana(fechaDetectada);
  const fechaFin = obtenerFinSemana(fechaInicio);

  /* Duplicados: mismo DNI (o nombre) + mismo turno */
  const claves = new Set();
  const duplicados = [];

  const registrosUnicos = registros.filter(registro => {

    const identificador = registro.dni
      ? "dni-" + registro.dni
      : "nombre-" + tareoNormalizarTexto(registro.nombre);

    const clave =
      identificador + "-" + tareoNormalizarTexto(registro.turno);

    if (claves.has(clave)) {
      duplicados.push(registro);
      return false;
    }

    claves.add(clave);

    return true;

  });

  return {
    archivoFilas: filas.length,
    registros: registrosUnicos,
    invalidos,
    duplicados,
    fechaInicio,
    fechaFin,
    columnaDNI,
    columnaNombre: usarColumnasSeparadas
      ? `${columnaApellidos} + ${columnaNombres}`
      : columnaNombre,
    columnaTurno,
    columnaFecha
  };

}


/* =========================================================
   VISTA PREVIA (SOLO LECTURA: NOMBRE Y TURNO)
   =========================================================
   Contenedor: <div id="tareoRotacionPreview"></div>
   Si ya tienes otra función renderPreviewRotacion en tu
   proyecto, elimina una de las dos para evitar duplicados.
   ========================================================= */

function renderPreviewRotacion(resultado) {

  const contenedor = document.getElementById("tareoRotacionPreview");

  if (!contenedor) {
    return;
  }

  const filasHTML = resultado.registros.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${tareoEscapeHTML(r.nombre)}</td>
      <td>${tareoEscapeHTML(r.dni)}</td>
      <td>${tareoEscapeHTML(r.turno)}</td>
    </tr>
  `).join("");

  const invalidosHTML = resultado.invalidos.length
    ? `
      <p style="color:#b00020;">
        ${resultado.invalidos.length} fila(s) inválida(s):
      </p>
      <ul>
        ${resultado.invalidos.map(x => `
          <li>Fila ${x.fila}: ${tareoEscapeHTML(x.motivo)}
            ${x.nombre ? "(" + tareoEscapeHTML(x.nombre) + ")" : ""}
          </li>
        `).join("")}
      </ul>
    `
    : "";

  const duplicadosHTML = resultado.duplicados.length
    ? `<p>${resultado.duplicados.length} duplicado(s) omitido(s).</p>`
    : "";

  contenedor.innerHTML = `
    <p>
      Semana ${tareoEscapeHTML(resultado.fechaInicio)}
      al ${tareoEscapeHTML(resultado.fechaFin)} —
      ${resultado.registros.length} trabajador(es)
    </p>
    ${invalidosHTML}
    ${duplicadosHTML}
    <div style="overflow-x:auto;">
      <table class="tabla-tareo">
        <thead>
          <tr>
            <th>N°</th>
            <th>Nombre y apellido</th>
            <th>DNI</th>
            <th>Turno</th>
          </tr>
        </thead>
        <tbody>${filasHTML}</tbody>
      </table>
    </div>
    <button type="button" onclick="aplicarRotacionPendiente()">
      Aplicar rotación
    </button>
  `;

}


/* =========================================================
   APLICAR ROTACIÓN
   ========================================================= */

function aplicarRotacionPendiente() {

  const resultado = window._tareoRotacionPendiente;

  if (!resultado) {
    alert("No existe una rotación pendiente de aplicar.");
    return;
  }

  if (!resultado.registros || !resultado.registros.length) {
    alert("No existen registros válidos para aplicar.");
    return;
  }

  if (resultado.invalidos && resultado.invalidos.length) {
    alert("Corrija los registros inválidos antes de aplicar la rotación.");
    return;
  }

  const rotaciones = obtenerRotaciones();

  const nuevaRotacion = {
    id: generarIdRotacion(),
    fechaInicio: resultado.fechaInicio,
    fechaFin: resultado.fechaFin,
    personal: resultado.registros.map(registro => ({ ...registro })),
    creadoEn: new Date().toISOString(),
    archivoFilas: resultado.archivoFilas
  };

  const existente = rotaciones.findIndex(rotacion =>
    rotacion.fechaInicio === nuevaRotacion.fechaInicio &&
    rotacion.fechaFin === nuevaRotacion.fechaFin
  );

  if (existente >= 0) {

    const confirmar = confirm(
      "Ya existe una rotación para esta semana. " +
      "Se perderán el área, ingreso y demás datos ya llenados. " +
      "¿Desea reemplazarla?"
    );

    if (!confirmar) {
      return;
    }

    rotaciones[existente] = nuevaRotacion;

  } else {

    rotaciones.push(nuevaRotacion);

  }

  guardarRotaciones(rotaciones);

  window._tareoRotacionPendiente = null;

  const preview = document.getElementById("tareoRotacionPreview");
  if (preview) {
    preview.innerHTML = "";
  }

  alert("Rotación semanal aplicada correctamente.");

  renderRotacionSemanal();

}


/* =========================================================
   EDICIÓN POR EL SUPERVISOR
   ========================================================= */

function actualizarCampoRotacion(rotacionId, personalId, campo, valor) {

  if (!Object.prototype.hasOwnProperty.call(TAREO_CAMPOS_SUPERVISOR, campo)) {
    return;
  }

  const rotaciones = obtenerRotaciones();

  const rotacion = rotaciones.find(r => r.id === rotacionId);

  if (!rotacion) {
    return;
  }

  const persona = rotacion.personal.find(p => p.id === personalId);

  if (!persona) {
    return;
  }

  persona[campo] = valor;

  guardarRotaciones(rotaciones);

}

/* Permite al supervisor agregar a alguien que no venía en el Excel */
function agregarPersonalRotacion(rotacionId) {

  const nombre = tareoLimpiarEspacios(
    prompt("Nombre y apellido del trabajador:")
  );

  if (!nombre) {
    return;
  }

  const turno = normalizarTurno(
    prompt("Turno (Día / Noche):")
  );

  if (!turno) {
    alert("Turno no válido. Escriba Día o Noche.");
    return;
  }

  const rotaciones = obtenerRotaciones();

  const rotacion = rotaciones.find(r => r.id === rotacionId);

  if (!rotacion) {
    return;
  }

  rotacion.personal.push({
    id: generarIdPersonalRotacion(rotacion.personal.length),
    nombre,
    dni: "",
    turno,
    fecha: "",
    ...TAREO_CAMPOS_SUPERVISOR
  });

  guardarRotaciones(rotaciones);

  renderRotacionSemanal(rotacionId);

}

function eliminarPersonalRotacion(rotacionId, personalId) {

  if (!confirm("¿Quitar a este trabajador de la rotación?")) {
    return;
  }

  const rotaciones = obtenerRotaciones();

  const rotacion = rotaciones.find(r => r.id === rotacionId);

  if (!rotacion) {
    return;
  }

  rotacion.personal = rotacion.personal.filter(p => p.id !== personalId);

  guardarRotaciones(rotaciones);

  renderRotacionSemanal(rotacionId);

}


/* =========================================================
   RENDER DE LA ROTACIÓN SEMANAL (EDITABLE)
   =========================================================
   Contenedor: <div id="tareoRotacionSemana"></div>

   Columnas:
   - Nombre y apellido  (del Excel)
   - Turno              (del Excel)
   - Área               (supervisor)
   - Hora de ingreso    (supervisor)
   - Hora de salida     (supervisor)
   - Asistencia         (supervisor)
   - Observaciones      (supervisor)

   Si ya tienes otra renderRotacionSemanal, reemplázala
   por esta.
   ========================================================= */

function renderRotacionSemanal(rotacionId) {

  const contenedor = document.getElementById("tareoRotacionSemana");

  if (!contenedor) {
    return;
  }

  const rotaciones = obtenerRotaciones();

  if (!rotaciones.length) {
    contenedor.innerHTML =
      "<p>Aún no se ha cargado una rotación.</p>";
    return;
  }

  /* Rotación indicada, o la de la semana actual, o la más reciente */
  const inicioActual = obtenerInicioSemana(obtenerFechaHoy());

  const rotacion =
    rotaciones.find(r => r.id === rotacionId) ||
    rotaciones.find(r => r.fechaInicio === inicioActual) ||
    [...rotaciones].sort((a, b) =>
      b.fechaInicio.localeCompare(a.fechaInicio)
    )[0];

  const idRot = tareoEscapeHTML(rotacion.id);

  const datalistAreas = `
    <datalist id="tareoListaAreas">
      ${TAREO_AREAS.map(a =>
        `<option value="${tareoEscapeHTML(a)}"></option>`
      ).join("")}
    </datalist>
  `;

  const filasHTML = rotacion.personal.map((p, i) => {

    const idP = tareoEscapeHTML(p.id);

    const opcionesAsistencia = [
      `<option value=""></option>`,
      ...TAREO_ASISTENCIAS.map(a =>
        `<option value="${tareoEscapeHTML(a)}"
          ${p.asistencia === a ? "selected" : ""}>
          ${tareoEscapeHTML(a)}
        </option>`
      )
    ].join("");

    return `
      <tr>
        <td>${i + 1}</td>
        <td>${tareoEscapeHTML(p.nombre)}</td>
        <td>${tareoEscapeHTML(p.turno)}</td>
        <td>
          <input type="text" list="tareoListaAreas"
            value="${tareoEscapeHTML(p.area)}"
            onchange="actualizarCampoRotacion('${idRot}','${idP}','area',this.value)">
        </td>
        <td>
          <input type="time"
            value="${tareoEscapeHTML(p.horaIngreso)}"
            onchange="actualizarCampoRotacion('${idRot}','${idP}','horaIngreso',this.value)">
        </td>
        <td>
          <input type="time"
            value="${tareoEscapeHTML(p.horaSalida)}"
            onchange="actualizarCampoRotacion('${idRot}','${idP}','horaSalida',this.value)">
        </td>
        <td>
          <select
            onchange="actualizarCampoRotacion('${idRot}','${idP}','asistencia',this.value)">
            ${opcionesAsistencia}
          </select>
        </td>
        <td>
          <input type="text"
            value="${tareoEscapeHTML(p.observaciones)}"
            onchange="actualizarCampoRotacion('${idRot}','${idP}','observaciones',this.value)">
        </td>
        <td>
          <button type="button"
            onclick="eliminarPersonalRotacion('${idRot}','${idP}')">✕</button>
        </td>
      </tr>
    `;

  }).join("");

  contenedor.innerHTML = `
    ${datalistAreas}
    <p>
      Semana ${tareoEscapeHTML(rotacion.fechaInicio)}
      al ${tareoEscapeHTML(rotacion.fechaFin)} —
      ${rotacion.personal.length} trabajador(es)
    </p>
    <div style="overflow-x:auto;">
      <table class="tabla-tareo">
        <thead>
          <tr>
            <th>N°</th>
            <th>Nombre y apellido</th>
            <th>Turno</th>
            <th>Área</th>
            <th>Ingreso</th>
            <th>Salida</th>
            <th>Asistencia</th>
            <th>Observaciones</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${filasHTML}</tbody>
      </table>
    </div>
    <button type="button"
      onclick="agregarPersonalRotacion('${idRot}')">
      + Agregar trabajador
    </button>
  `;

}
