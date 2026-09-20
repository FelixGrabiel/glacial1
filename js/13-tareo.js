/* =============================================================
   GLACIAL — TAREO DE PERSONAL
   IMPORTACIÓN DE ROTACIÓN DESDE EXCEL
   ============================================================= */


/* =========================================================
   CONFIGURACIÓN
   ========================================================= */

const TAREO_STORAGE_KEY = "GLACIAL_TAREOS";
const TAREO_ROTACION_STORAGE_KEY = "GLACIAL_ROTACION_SEMANAL";


/* =========================================================
   NORMALIZACIÓN DE TEXTO
   ========================================================= */

function tareoNormalizarTexto(valor) {

  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

}


/* =========================================================
   NORMALIZACIÓN DE DNI
   ========================================================= */

function tareoNormalizarDNI(valor) {

  return String(valor || "")
    .replace(/\D/g, "")
    .trim();

}


/* =========================================================
   LIMPIAR ESPACIOS
   ========================================================= */

function tareoLimpiarEspacios(valor) {

  return String(valor || "")
    .replace(/\s+/g, " ")
    .trim();

}


/* =========================================================
   NORMALIZAR TURNO
   ========================================================= */

function normalizarTurno(valor) {

  const texto =
    tareoNormalizarTexto(valor);


  if (!texto) {
    return "";
  }


  /* NOCHE */

  if (
    texto === "n" ||
    texto.includes("noche")
  ) {

    return "Noche";

  }


  /* DÍA */

  if (
    texto === "d" ||
    texto === "dia" ||
    texto.includes("dia")
  ) {

    return "Día";

  }


  return "";

}


/* =========================================================
   ENCONTRAR COLUMNA DEL EXCEL
   ========================================================= */

function encontrarColumna(filas, alternativas) {

  if (
    !Array.isArray(filas) ||
    !filas.length
  ) {

    return null;

  }


  const columnas =
    Object.keys(
      filas[0]
    );


  for (const columna of columnas) {

    const normalizada =
      tareoNormalizarTexto(
        columna
      );


    const encontrada =
      alternativas.some(
        alternativa => {

          return normalizada.includes(
            tareoNormalizarTexto(
              alternativa
            )
          );

        }
      );


    if (encontrada) {

      return columna;

    }

  }


  return null;

}


/* =========================================================
   INTERPRETAR FECHA DE EXCEL
   ========================================================= */

function normalizarFechaExcel(valor) {

  if (!valor) {
    return "";
  }


  /* Si SheetJS ya entregó Date */

  if (
    Object.prototype.toString.call(valor) ===
    "[object Date]"
  ) {

    if (isNaN(valor.getTime())) {
      return "";
    }


    const year =
      valor.getFullYear();


    const month =
      String(
        valor.getMonth() + 1
      ).padStart(2, "0");


    const day =
      String(
        valor.getDate()
      ).padStart(2, "0");


    return `${year}-${month}-${day}`;

  }


  const texto =
    String(valor)
      .trim();


  if (!texto) {
    return "";
  }


  /* YYYY-MM-DD */

  let match =
    texto.match(
      /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/
    );


  if (match) {

    return (
      `${match[1]}-` +
      `${String(match[2]).padStart(2, "0")}-` +
      `${String(match[3]).padStart(2, "0")}`
    );

  }


  /* DD/MM/YYYY */

  match =
    texto.match(
      /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/
    );


  if (match) {

    return (
      `${match[3]}-` +
      `${String(match[2]).padStart(2, "0")}-` +
      `${String(match[1]).padStart(2, "0")}`
    );

  }


  return "";

}


/* =========================================================
   INICIO DE SEMANA
   ========================================================= */

function obtenerInicioSemana(fecha) {

  const fechaObj =
    new Date(
      fecha + "T00:00:00"
    );


  if (isNaN(fechaObj.getTime())) {

    const hoy =
      new Date();


    fechaObj.setTime(
      hoy.getTime()
    );

  }


  const dia =
    fechaObj.getDay();


  /*
   * Domingo = 0
   * Lunes = 1
   */

  const diferencia =
    dia === 0
      ? 6
      : dia - 1;


  fechaObj.setDate(
    fechaObj.getDate() -
    diferencia
  );


  const year =
    fechaObj.getFullYear();


  const month =
    String(
      fechaObj.getMonth() + 1
    ).padStart(2, "0");


  const day =
    String(
      fechaObj.getDate()
    ).padStart(2, "0");


  return `${year}-${month}-${day}`;

}


/* =========================================================
   FIN DE SEMANA
   ========================================================= */

function obtenerFinSemana(fechaInicio) {

  const fecha =
    new Date(
      fechaInicio + "T00:00:00"
    );


  fecha.setDate(
    fecha.getDate() + 6
  );


  const year =
    fecha.getFullYear();


  const month =
    String(
      fecha.getMonth() + 1
    ).padStart(2, "0");


  const day =
    String(
      fecha.getDate()
    ).padStart(2, "0");


  return `${year}-${month}-${day}`;

}


/* =========================================================
   FECHA DE HOY
   ========================================================= */

function obtenerFechaHoy() {

  const hoy =
    new Date();


  const year =
    hoy.getFullYear();


  const month =
    String(
      hoy.getMonth() + 1
    ).padStart(2, "0");


  const day =
    String(
      hoy.getDate()
    ).padStart(2, "0");


  return `${year}-${month}-${day}`;

}


/* =========================================================
   ID DE ROTACIÓN
   ========================================================= */

function generarIdRotacion() {

  return (
    "rotacion_" +
    Date.now() +
    "_" +
    Math.random()
      .toString(36)
      .slice(2, 8)
  );

}


/* =========================================================
   OBTENER ROTACIONES
   ========================================================= */

function obtenerRotaciones() {

  try {

    const datos =
      localStorage.getItem(
        TAREO_ROTACION_STORAGE_KEY
      );


    if (!datos) {
      return [];
    }


    const rotaciones =
      JSON.parse(datos);


    return Array.isArray(rotaciones)
      ? rotaciones
      : [];

  } catch (error) {

    console.error(
      "TAREO: Error leyendo rotaciones:",
      error
    );


    return [];

  }

}


/* =========================================================
   GUARDAR ROTACIONES
   ========================================================= */

function guardarRotaciones(rotaciones) {

  localStorage.setItem(

    TAREO_ROTACION_STORAGE_KEY,

    JSON.stringify(
      rotaciones
    )

  );

}


/* =========================================================
   PREVISUALIZAR EXCEL
   ========================================================= */

async function previsualizarRotacionExcel(event) {

  const archivo =
    event.target.files[0];


  if (!archivo) {
    return;
  }


  try {

    const datos =
      await archivo.arrayBuffer();


    const workbook =
      XLSX.read(
        datos,
        {
          type: "array",
          cellDates: true
        }
      );


    if (
      !workbook.SheetNames ||
      !workbook.SheetNames.length
    ) {

      throw new Error(
        "El archivo no contiene hojas."
      );

    }


    const nombreHoja =
      workbook.SheetNames[0];


    const hoja =
      workbook.Sheets[
        nombreHoja
      ];


    const filas =
      XLSX.utils.sheet_to_json(
        hoja,
        {
          defval: ""
        }
      );


    if (!filas.length) {

      throw new Error(
        "El archivo Excel no contiene registros."
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
      "TAREO: Error al importar Excel:",
      error
    );


    alert(
      "No se pudo leer la rotación.\n\n" +
      error.message
    );

  }

}


/* =========================================================
   INTERPRETAR ROTACIÓN
   =========================================================

   IMPORTANTE:

   NO utiliza loadWorkers().

   El Excel es la fuente del personal.

   No importa si la persona pertenece a:
   - Producción
   - Mantenimiento
   - Almacén
   - Limpieza
   - Calidad
   - Administración
   - etc.

   Si aparece en el Excel, entra al Tareo.
   ========================================================= */

function interpretarRotacionExcel(filas) {

  const columnaDNI =
    encontrarColumna(
      filas,
      [
        "dni",
        "documento",
        "n documento",
        "nº documento",
        "numero documento",
        "nro documento",
        "nro. documento"
      ]
    );


  const columnaNombre =
    encontrarColumna(
      filas,
      [
        "trabajador",
        "nombre",
        "personal",
        "empleado",
        "colaborador",
        "apellidos y nombres",
        "apellidos nombres",
        "nombre completo"
      ]
    );


  const columnaTurno =
    encontrarColumna(
      filas,
      [
        "turno",
        "jornada",
        "horario"
      ]
    );


  const columnaFecha =
    encontrarColumna(
      filas,
      [
        "fecha",
        "dia",
        "día"
      ]
    );


  if (!columnaNombre) {

    throw new Error(
      "No se encontró la columna de nombre del trabajador."
    );

  }


  if (!columnaTurno) {

    throw new Error(
      "No se encontró la columna de Turno."
    );

  }


  const registros = [];

  const invalidos = [];

  let fechaDetectada = "";


  filas.forEach(
    (fila, indice) => {

      const numeroFila =
        indice + 2;


      const nombre =
        tareoLimpiarEspacios(
          fila[columnaNombre]
        );


      const dni =
        columnaDNI
          ? tareoNormalizarDNI(
              fila[columnaDNI]
            )
          : "";


      const turno =
        normalizarTurno(
          fila[columnaTurno]
        );


      const turnoOriginal =
        String(
          fila[columnaTurno] || ""
        ).trim();


      /*
       * Ignorar filas completamente vacías.
       */

      if (
        !nombre &&
        !dni &&
        !turnoOriginal
      ) {

        return;

      }


      /*
       * Validar nombre.
       */

      if (!nombre) {

        invalidos.push({

          fila:
            numeroFila,

          nombre:
            "",

          dni,

          turno,

          motivo:
            "No se encontró el nombre del trabajador."

        });

        return;

      }


      /*
       * Validar turno.
       */

      if (!turno) {

        invalidos.push({

          fila:
            numeroFila,

          nombre,

          dni,

          turno:
            "",

          motivo:
            "Turno no reconocido."

        });

        return;

      }


      /*
       * Fecha.
       */

      let fecha = "";


      if (columnaFecha) {

        fecha =
          normalizarFechaExcel(
            fila[columnaFecha]
          );


        if (fecha) {

          fechaDetectada =
            fecha;

        }

      }


      /*
       * CREAR DIRECTAMENTE
       *
       * No se llama loadWorkers().
       */

      registros.push({

        id:
          "rot_" +
          Date.now() +
          "_" +
          indice +
          "_" +
          Math.random()
            .toString(36)
            .slice(2, 7),

        nombre,

        dni,

        turno,

        fecha

      });

    }
  );


  /*
   * Si no vino fecha desde Excel,
   * utilizar la semana actual.
   */

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


  /*
   * DUPLICADOS
   */

  const claves =
    new Set();


  const duplicados = [];


  const registrosUnicos =
    registros.filter(
      registro => {

        let identificador;


        if (registro.dni) {

          identificador =
            "dni-" +
            registro.dni;

        } else {

          identificador =
            "nombre-" +
            tareoNormalizarTexto(
              registro.nombre
            );

        }


        const clave =
          identificador +
          "-" +
          tareoNormalizarTexto(
            registro.turno
          );


        if (
          claves.has(
            clave
          )
        ) {

          duplicados.push(
            registro
          );

          return false;

        }


        claves.add(
          clave
        );


        return true;

      }
    );


  return {

    archivoFilas:
      filas.length,

    registros:
      registrosUnicos,

    /*
     * Se mantiene por compatibilidad
     * con el resto del Tareo,
     * pero ya NO se utiliza.
     */

    noEncontrados:
      [],

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
   APLICAR ROTACIÓN
   ========================================================= */

function aplicarRotacionPendiente() {

  const resultado =
    window._tareoRotacionPendiente;


  if (!resultado) {

    alert(
      "No existe una rotación pendiente de aplicar."
    );

    return;

  }


  if (
    !resultado.registros ||
    !resultado.registros.length
  ) {

    alert(
      "No existen registros válidos para aplicar."
    );

    return;

  }


  if (
    resultado.invalidos &&
    resultado.invalidos.length
  ) {

    alert(
      "Corrija los registros inválidos antes de aplicar la rotación."
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

          return {
            ...registro
          };

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
        "Ya existe una rotación para esta semana. ¿Desea reemplazarla?"
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
    "Rotación semanal aplicada correctamente."
  );


  renderRotacionSemanal();

}
