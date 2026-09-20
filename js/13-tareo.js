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
   ALMACENAMIENTO (FIREBASE + RESPALDO LOCAL)
   =========================================================

   - Firebase es la fuente principal: todos los supervisores
     ven y editan la misma rotación en tiempo real.
   - localStorage queda como copia local (si no hay internet
     se sigue viendo lo último sincronizado).
   - Cada cambio de un campo se guarda de forma puntual
     (solo ese campo), así dos supervisores no se pisan.

   Estructura en Firebase (Realtime Database o Firestore):

   tareo_rotaciones / {rotacionId}
     id, fechaInicio, fechaFin, creadoEn, archivoFilas
     personal / {personalId}
       id, nombre, dni, turno, fecha, orden,
       area, horaIngreso, horaSalida, asistencia, observaciones
   ========================================================= */

/* Nombre de la colección / nodo en Firebase */
const TAREO_FB_COLECCION = "tareo_rotaciones";

/*
 * Si tu proyecto carga Realtime Database Y Firestore y quieres
 * elegir uno, escribe "rtdb" o "firestore". Vacío = automático.
 */
const TAREO_FB_FORZAR = "";

let _tareoRotacionesCache = null;
let _tareoFbPrimeraCarga = true;
let _tareoFbErrorAvisado = false;


/* ---------- Detección de Firebase ---------- */

function tareoFbBackend() {

  if (typeof firebase === "undefined") {
    return null;
  }

  if (!firebase.apps || !firebase.apps.length) {
    return null;
  }

  if (TAREO_FB_FORZAR === "rtdb" || TAREO_FB_FORZAR === "firestore") {
    return TAREO_FB_FORZAR;
  }

  if (typeof firebase.database === "function") {
    return "rtdb";
  }

  if (typeof firebase.firestore === "function") {
    return "firestore";
  }

  return null;

}

function tareoFbError(error) {

  console.error("TAREO: Error con Firebase:", error);

  if (!_tareoFbErrorAvisado) {

    _tareoFbErrorAvisado = true;

    alert(
      "No se pudo sincronizar con Firebase.\n\n" +
      "Los cambios quedaron solo en este equipo. " +
      "Revise la conexión o las reglas de la base de datos."
    );

  }

}


/* ---------- Conversión personal: arreglo <-> mapa ---------- */

function tareoRotacionAFirebase(rotacion) {

  const personal = {};

  (rotacion.personal || []).forEach((p, indice) => {
    personal[p.id] = { ...p, orden: indice };
  });

  return { ...rotacion, personal };

}

function tareoRotacionDesdeFirebase(data, id) {

  const mapa = data.personal || {};

  const personal = Object.keys(mapa)
    .map(clave => ({
      ...TAREO_CAMPOS_SUPERVISOR,
      ...mapa[clave],
      id: mapa[clave].id || clave
    }))
    .sort((a, b) => (a.orden || 0) - (b.orden || 0));

  return { ...data, id: data.id || id, personal };

}


/* ---------- Copia local ---------- */

function obtenerRotaciones() {

  if (Array.isArray(_tareoRotacionesCache)) {
    return _tareoRotacionesCache;
  }

  try {

    const datos = localStorage.getItem(TAREO_ROTACION_STORAGE_KEY);

    const rotaciones = datos ? JSON.parse(datos) : [];

    _tareoRotacionesCache = Array.isArray(rotaciones) ? rotaciones : [];

  } catch (error) {

    console.error("TAREO: Error leyendo rotaciones:", error);

    _tareoRotacionesCache = [];

  }

  return _tareoRotacionesCache;

}

function guardarRotaciones(rotaciones) {

  _tareoRotacionesCache = rotaciones;

  try {

    localStorage.setItem(
      TAREO_ROTACION_STORAGE_KEY,
      JSON.stringify(rotaciones)
    );

  } catch (error) {

    console.error("TAREO: Error guardando copia local:", error);

  }

}


/* ---------- Escrituras en Firebase ---------- */

/*
 * Ejecuta una operación de Firebase sin dejar que un error
 * rompa el Tareo: el dato ya quedó guardado en local.
 */
function tareoFbSeguro(operacion) {

  const backend = tareoFbBackend();

  if (!backend) {
    return Promise.resolve(false);
  }

  try {

    return Promise.resolve(operacion(backend))
      .then(() => true)
      .catch(error => {
        tareoFbError(error);
        return false;
      });

  } catch (error) {

    tareoFbError(error);

    return Promise.resolve(false);

  }

}

function tareoFbGuardarRotacion(rotacion) {

  return tareoFbSeguro(backend => {

    const data = tareoRotacionAFirebase(rotacion);

    return backend === "rtdb"
      ? firebase.database()
          .ref(`${TAREO_FB_COLECCION}/${rotacion.id}`)
          .set(data)
      : firebase.firestore()
          .collection(TAREO_FB_COLECCION)
          .doc(rotacion.id)
          .set(data);

  });

}

function tareoFbActualizarCampo(rotacionId, personalId, campo, valor) {

  return tareoFbSeguro(backend =>
    backend === "rtdb"
      ? firebase.database()
          .ref(
            `${TAREO_FB_COLECCION}/${rotacionId}/personal/${personalId}/${campo}`
          )
          .set(valor)
      : firebase.firestore()
          .collection(TAREO_FB_COLECCION)
          .doc(rotacionId)
          .update({ [`personal.${personalId}.${campo}`]: valor })
  );

}

function tareoFbAgregarPersona(rotacionId, persona) {

  return tareoFbSeguro(backend =>
    backend === "rtdb"
      ? firebase.database()
          .ref(`${TAREO_FB_COLECCION}/${rotacionId}/personal/${persona.id}`)
          .set(persona)
      : firebase.firestore()
          .collection(TAREO_FB_COLECCION)
          .doc(rotacionId)
          .update({ [`personal.${persona.id}`]: persona })
  );

}

function tareoFbEliminarPersona(rotacionId, personalId) {

  return tareoFbSeguro(backend =>
    backend === "rtdb"
      ? firebase.database()
          .ref(`${TAREO_FB_COLECCION}/${rotacionId}/personal/${personalId}`)
          .remove()
      : firebase.firestore()
          .collection(TAREO_FB_COLECCION)
          .doc(rotacionId)
          .update({
            [`personal.${personalId}`]:
              firebase.firestore.FieldValue.delete()
          })
  );

}


/* ---------- Sincronización en tiempo real ---------- */

function tareoFbProcesarSnapshot(lista) {

  /*
   * Primera carga: si Firebase está vacío pero este equipo
   * ya tenía rotaciones guardadas, se suben una sola vez.
   */
  if (_tareoFbPrimeraCarga) {

    _tareoFbPrimeraCarga = false;

    const locales = obtenerRotaciones();

    if (!lista.length && locales.length) {

      locales.forEach(rotacion => tareoFbGuardarRotacion(rotacion));

      return;

    }

  }

  guardarRotaciones(lista);

  /*
   * No redibujar mientras el supervisor está escribiendo
   * dentro de la tabla (se le borraría lo que teclea).
   */
  const contenedor = tareoContenedorSemanaActivo();

  const editando =
    contenedor &&
    document.activeElement &&
    contenedor.contains(document.activeElement);

  if (contenedor && !editando) {
    renderRotacionSemanal(window._tareoRotacionVista);
  }

}

function tareoIniciarSyncRotacion() {

  const backend = tareoFbBackend();

  if (!backend) {

    console.warn(
      "TAREO: Firebase no está disponible. " +
      "La rotación se guardará solo en este equipo."
    );

    return;

  }

  try {

    if (backend === "rtdb") {

      firebase.database()
        .ref(TAREO_FB_COLECCION)
        .on(
          "value",
          snapshot => {

            const valor = snapshot.val() || {};

            const lista = Object.keys(valor).map(id =>
              tareoRotacionDesdeFirebase(valor[id], id)
            );

            tareoFbProcesarSnapshot(lista);

          },
          tareoFbError
        );

    } else {

      firebase.firestore()
        .collection(TAREO_FB_COLECCION)
        .onSnapshot(
          consulta => {

            const lista = consulta.docs.map(doc =>
              tareoRotacionDesdeFirebase(doc.data(), doc.id)
            );

            tareoFbProcesarSnapshot(lista);

          },
          tareoFbError
        );

    }

  } catch (error) {

    tareoFbError(error);

  }

}

/* Arranca solo al cargar la página */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", tareoIniciarSyncRotacion);
} else {
  tareoIniciarSyncRotacion();
}


/* =========================================================
   LECTURA DEL LIBRO DE EXCEL
   =========================================================

   - Si una hoja se llama como "21-09 AL 27-09", esa hoja se usa
     y de su nombre se toma la semana (inicio y fin).
   - Si hay varias así, se usa la de fecha más reciente.
   - Si no, se usa la primera hoja.
   - La fila de encabezados (Trabajador / Turno) se busca sola,
     aunque no esté en la fila 1.
   ========================================================= */

function tareoRangoDesdeNombreHoja(nombre) {

  const m = String(nombre || "").match(
    /(\d{1,2})[-/.](\d{1,2})\s*(?:al|a|-)\s*(\d{1,2})[-/.](\d{1,2})/i
  );

  if (!m) {
    return null;
  }

  const hoy = new Date();

  let anio = hoy.getFullYear();

  let inicio = new Date(anio, Number(m[2]) - 1, Number(m[1]));

  if (
    inicio.getMonth() !== Number(m[2]) - 1 ||
    inicio.getDate() !== Number(m[1])
  ) {
    return null;
  }

  /* Rotación de enero cargada en diciembre, etc. */
  if (inicio.getTime() < hoy.getTime() - 180 * 86400000) {
    anio++;
    inicio = new Date(anio, Number(m[2]) - 1, Number(m[1]));
  }

  let fin = new Date(anio, Number(m[4]) - 1, Number(m[3]));

  if (fin.getTime() < inicio.getTime()) {
    fin = new Date(anio + 1, Number(m[4]) - 1, Number(m[3]));
  }

  return {
    fechaInicio: tareoFormatearFecha(inicio),
    fechaFin: tareoFormatearFecha(fin)
  };

}

function tareoFilasDesdeHoja(hoja) {

  const matriz = XLSX.utils.sheet_to_json(hoja, {
    header: 1,
    defval: ""
  });

  const alternativasNombre = [
    "apellidos y nombres",
    "apellidos nombres",
    "nombre completo",
    "trabajador",
    "personal",
    "empleado",
    "colaborador",
    "nombre",
    "apellidos"
  ].map(tareoNormalizarTexto);

  let filaCabecera = -1;

  for (let i = 0; i < Math.min(matriz.length, 30); i++) {

    const celdas = (matriz[i] || []).map(tareoNormalizarTexto);

    const tieneTurno = celdas.some(c => c && c.includes("turno"));

    const tieneNombre = celdas.some(c =>
      c && alternativasNombre.some(a => c.includes(a))
    );

    if (tieneTurno && tieneNombre) {
      filaCabecera = i;
      break;
    }

  }

  if (filaCabecera < 0) {
    throw new Error(
      "No se encontró la fila de encabezados (Trabajador y Turno)."
    );
  }

  const cabecera = matriz[filaCabecera].map((celda, indice) =>
    tareoLimpiarEspacios(celda) || ("__col" + indice)
  );

  const filas = matriz.slice(filaCabecera + 1).map(fila => {

    const objeto = {};

    cabecera.forEach((columna, indice) => {
      objeto[columna] = fila[indice] === undefined ? "" : fila[indice];
    });

    return objeto;

  });

  return {
    filas,
    primeraFila: filaCabecera + 2
  };

}

function tareoLeerRotacionDeLibro(workbook) {

  let elegida = null;

  workbook.SheetNames.forEach(nombreHoja => {

    const rango = tareoRangoDesdeNombreHoja(nombreHoja);

    if (
      rango &&
      (!elegida || rango.fechaInicio > elegida.rango.fechaInicio)
    ) {
      elegida = { nombreHoja, rango };
    }

  });

  const nombreHoja = elegida
    ? elegida.nombreHoja
    : workbook.SheetNames[0];

  const { filas, primeraFila } = tareoFilasDesdeHoja(
    workbook.Sheets[nombreHoja]
  );

  return {
    filas,
    primeraFila,
    nombreHoja,
    fechaInicio: elegida ? elegida.rango.fechaInicio : "",
    fechaFin: elegida ? elegida.rango.fechaFin : ""
  };

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

    const lectura = tareoLeerRotacionDeLibro(workbook);

    if (!lectura.filas.length) {
      throw new Error("El archivo Excel no contiene registros.");
    }

    const resultado = interpretarRotacionExcel(lectura.filas, lectura);

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

/* Quita asteriscos y marcas "NUEVO" del nombre */
function tareoLimpiarNombreRotacion(valor) {

  let texto = String(valor || "");

  const nuevo = /\bnuevo\b/i.test(texto);

  texto = texto
    .replace(/\(?\bnuevo\b\)?/gi, " ")
    .replace(/\*/g, " ");

  return {
    nombre: tareoLimpiarEspacios(texto),
    nuevo
  };

}

function interpretarRotacionExcel(filas, opciones = {}) {

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

  /* Columna de fecha: solo si se llama exactamente Fecha o Día */
  const columnaFecha = Object.keys(filas[0]).find(columna =>
    ["fecha", "dia"].includes(tareoNormalizarTexto(columna))
  ) || null;

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

    const numeroFila = indice + (opciones.primeraFila || 2);

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

    const limpio = tareoLimpiarNombreRotacion(nombre);

    nombre = limpio.nombre;

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
      ...TAREO_CAMPOS_SUPERVISOR,

      observaciones: limpio.nuevo ? "Nuevo" : ""

    });

  });

  let fechaInicio;
  let fechaFin;

  if (opciones.fechaInicio && opciones.fechaFin) {

    /* Semana tomada del nombre de la hoja */
    fechaInicio = opciones.fechaInicio;
    fechaFin = opciones.fechaFin;

  } else {

    if (!fechaDetectada) {
      fechaDetectada = obtenerInicioSemana(obtenerFechaHoy());
    }

    fechaInicio = obtenerInicioSemana(fechaDetectada);
    fechaFin = obtenerFinSemana(fechaInicio);

  }

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
    nombreHoja: opciones.nombreHoja || "",
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

  const contenedor = tareoContenedorPreview();

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
      ${resultado.nombreHoja ? "Hoja «" + tareoEscapeHTML(resultado.nombreHoja) + "» — " : ""}Semana ${tareoEscapeHTML(resultado.fechaInicio)}
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

    /* Se conserva el id para que Firebase reemplace la misma rotación */
    nuevaRotacion.id = rotaciones[existente].id;

    rotaciones[existente] = nuevaRotacion;

  } else {

    rotaciones.push(nuevaRotacion);

  }

  guardarRotaciones(rotaciones);

  tareoFbGuardarRotacion(nuevaRotacion);

  window._tareoRotacionPendiente = null;

  ["tareoRotacionPreview", "tareoPanelPreview"].forEach(id => {
    const preview = document.getElementById(id);
    if (preview) {
      preview.innerHTML = "";
    }
  });

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

  tareoFbActualizarCampo(rotacionId, personalId, campo, valor);

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

  const ordenMax = rotacion.personal.reduce(
    (max, p) => Math.max(max, p.orden || 0),
    -1
  );

  const persona = {
    id: generarIdPersonalRotacion(rotacion.personal.length),
    nombre,
    dni: "",
    turno,
    fecha: "",
    ...TAREO_CAMPOS_SUPERVISOR,
    orden: Math.max(ordenMax, rotacion.personal.length - 1) + 1
  };

  rotacion.personal.push(persona);

  guardarRotaciones(rotaciones);

  tareoFbAgregarPersona(rotacionId, persona);

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

  tareoFbEliminarPersona(rotacionId, personalId);

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

  const contenedor = tareoContenedorSemanaActivo();

  if (!contenedor) {
    return;
  }

  const rotaciones = obtenerRotaciones();

  if (!rotaciones.length) {
    contenedor.innerHTML =
      "<p>Aún no se ha cargado una rotación.</p>";
    return;
  }

  /* Rotación indicada, o la de esta semana, o la más reciente */
  const hoy = obtenerFechaHoy();

  const rotacion =
    rotaciones.find(r => r.id === rotacionId) ||
    rotaciones.find(r => r.fechaInicio <= hoy && hoy <= r.fechaFin) ||
    [...rotaciones].sort((a, b) =>
      b.fechaInicio.localeCompare(a.fechaInicio)
    )[0];

  window._tareoRotacionVista = rotacion.id;

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



/* =========================================================
   PANEL PROPIO DE ROTACIÓN (FUNCIONA SIN TOCAR TU HTML)
   =========================================================

   Si tu página no tiene los contenedores
   #tareoRotacionPreview y #tareoRotacionSemana, la rotación
   se muestra en un panel emergente propio.

   - Botón flotante "Rotación semanal" (abajo a la derecha).
     Para ocultarlo: TAREO_BOTON_FLOTANTE = false.
   - Puedes abrirlo desde cualquier botón tuyo con:
     abrirRotacionSemanal()
   ========================================================= */

const TAREO_BOTON_FLOTANTE = true;

function tareoPanelAbierto() {

  const panel = document.getElementById("tareoPanelRotacion");

  return !!panel && panel.style.display !== "none";

}

function tareoContenedorSemanaActivo() {

  if (tareoPanelAbierto()) {
    return document.getElementById("tareoPanelSemana");
  }

  return document.getElementById("tareoRotacionSemana");

}

function tareoContenedorPreview() {

  if (tareoPanelAbierto()) {
    return document.getElementById("tareoPanelPreview");
  }

  const host = document.getElementById("tareoRotacionPreview");

  if (host) {
    return host;
  }

  /* No existe contenedor en la página: usar el panel propio */
  abrirRotacionSemanal();

  return document.getElementById("tareoPanelPreview");

}

function tareoCrearPanelRotacion() {

  let panel = document.getElementById("tareoPanelRotacion");

  if (panel) {
    return panel;
  }

  panel = document.createElement("div");

  panel.id = "tareoPanelRotacion";

  panel.style.cssText =
    "display:none;position:fixed;top:0;left:0;right:0;bottom:0;" +
    "z-index:99999;background:rgba(0,0,0,.55);overflow:auto;padding:12px;";

  panel.innerHTML = `
    <style>
      #tareoPanelRotacion table { border-collapse:collapse; width:100%; }
      #tareoPanelRotacion th,
      #tareoPanelRotacion td {
        border:1px solid #ccc; padding:4px 6px; font-size:13px;
        text-align:left; vertical-align:middle;
      }
      #tareoPanelRotacion th { background:#f0f4f8; }
      #tareoPanelRotacion input[type="text"] { width:100%; min-width:110px; }
      #tareoPanelRotacion button { cursor:pointer; padding:6px 10px; margin:4px 0; }
    </style>
    <div style="background:#fff;color:#111;max-width:1150px;margin:0 auto;
                border-radius:10px;padding:16px;">
      <div style="display:flex;justify-content:space-between;
                  align-items:center;gap:8px;flex-wrap:wrap;">
        <h2 style="margin:0;font-size:18px;">Tareo — Rotación semanal</h2>
        <button type="button" onclick="cerrarRotacionSemanal()">Cerrar ✕</button>
      </div>
      <p>
        Subir Excel de rotación:
        <input type="file" accept=".xlsx,.xls"
               onchange="previsualizarRotacionExcel(event)">
      </p>
      <div id="tareoPanelPreview"></div>
      <hr>
      <div id="tareoPanelSemana"></div>
    </div>
  `;

  document.body.appendChild(panel);

  return panel;

}

function abrirRotacionSemanal() {

  const panel = tareoCrearPanelRotacion();

  panel.style.display = "block";

  renderRotacionSemanal(window._tareoRotacionVista);

}

function cerrarRotacionSemanal() {

  const panel = document.getElementById("tareoPanelRotacion");

  if (panel) {
    panel.style.display = "none";
  }

}

function tareoCrearBotonFlotante() {

  if (
    !TAREO_BOTON_FLOTANTE ||
    document.getElementById("tareoBotonRotacion")
  ) {
    return;
  }

  const boton = document.createElement("button");

  boton.id = "tareoBotonRotacion";
  boton.type = "button";
  boton.textContent = "📋 Rotación semanal";
  boton.onclick = abrirRotacionSemanal;

  boton.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:99998;" +
    "padding:10px 14px;border:none;border-radius:24px;" +
    "background:#0b5ed7;color:#fff;font-size:14px;" +
    "box-shadow:0 2px 8px rgba(0,0,0,.35);cursor:pointer;";

  document.body.appendChild(boton);

}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", tareoCrearBotonFlotante);
} else {
  tareoCrearBotonFlotante();
}
