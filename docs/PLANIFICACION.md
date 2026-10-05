# Módulo Planificación

## Cómo se guardaba y se guarda la programación

- **Dónde:** `sync/programaciones` → arreglo `items`. Cada item: `id`, `clave` (`línea|fecha|turno|marca|presentación`), `linea`, `fecha`, `turno` (`DÍA`, `INTERMEDIO`, `NOCHE`), `marca`, `presentacion`, `cantidadProgramada` (UND), `unidadesPorPaleta`, `paletasProgramadas`, `estadoOperacion` (PENDIENTE, EN_PRODUCCION, PAUSA, DETENIDA/LISTA, FINALIZADA, CANCELADA) y los tramos de secuencia. **No se migró ni se alteró ningún dato.**
- **Quién la crea y edita:** una sola función, `guardarProgramacionPaleta()` (`js/produccion/16-paletas.js`). Busca por la misma clave, transacciona sobre el documento completo (varias personas a la vez no se pisan; la cuenta compartida de Mantenimiento sigue pudiendo actualizar estados), y con cantidad 0 quita la programación. Ahora además: exige el permiso `planificacion`, exige motivo si la programación ya está en producción, y deja el historial.
- **Quién la lee** (sin cambios, siguen leyendo `loadProgramaciones()` / `obtenerProgramacionPaleta()`): tarjeta «Programación del turno» (`21-programacion-turno.js`, no se tocó), Paletas (`16`), Producción actual y semáforo (`24`), tiempos y proyección (`23b`, `46`), Avance (`29`), autollenado del registro (`35`), Resumen general e indicadores (`09`, `49`), Análisis de paradas (`47`), resumen de turno (`48`), Impacto económico (`50`), Inicio (`32`).
- **Carga por Excel:** *no existía* un importador de programación (los Excel que existen son los de rotaciones). Se creó uno en `51-planificacion-nucleo.js` (`leerExcel`) que solo valida y arma filas; la escritura pasa por la misma función única.

## Archivos nuevos

| Archivo | Contenido |
|---|---|
| `js/produccion/51-planificacion-nucleo.js` | Validaciones, copia de programación, lectura de Excel, escuchas y refresco en vivo. |
| `js/produccion/52-planificacion-pantalla.js` | Menú, pestañas y pestaña Programación (crear, editar, copiar, importar). |
| `js/produccion/53-planificacion-catalogo.js` | Catálogo (`sync/catalogoPlanificacion`) y Vista semanal. |
| `js/produccion/54-planificacion-solicitudes.js` | Solicitudes, historial y Cumplimiento. |
| `tests/planificacion.test.js` | Pruebas del módulo. |

## Datos nuevos en Firestore (hay que publicar `firestore.rules.etapa2.txt`)

- `sync/catalogoPlanificacion` — catálogo de productos (unidades por paleta, activo).
- `solicitudesProgramacion` — solicitudes; el solicitante lee las suyas, quien planifica lee todas y las resuelve.
- `historialProgramacion` — historial; solo se crea (uid y hora del servidor).
- `sync/configIndicadores` — quien planifica puede cambiar **solo** `velocidades` (el resto sigue siendo de Jefatura / `configurar_umbrales`).

## Permiso `planificacion`

Por defecto: Administrador, Jefe de Producción, Planificación y Ventas y Planificación. El Administrador lo da (`planificacion`) o lo quita (`-planificacion`) en Gestión de usuarios. Los supervisores ven el plan en solo lectura y piden cambios en Solicitudes.

## Velocidad estándar

No se duplica: el Catálogo muestra y edita `sync/configIndicadores.velocidades`, con la misma escritura que Análisis de paradas. «Cargar velocidades iniciales» copia los ratios fijos del código a esa tabla donde no hay valor. **Quedan solo como respaldo (sin uso mientras la tabla tenga valor)** en `js/nucleo/01-config.js`: `RATIOS_PRESENTACION_PET1`, `RATIOS_PRESENTACION_PET2`, `RATIO_FIJO_B7L`, `RATIO_FIJO_C20L`, `RATIO_FIJO_B20L` y `RATIO_FONTLIFE_10L` (se copia como velocidad propia de Fontlife 10 L).

## Código que quedó sin uso

- `guardarProgramacionDesdeFormulario()` y su botón en `16-paletas.js` (la programación ya no se carga desde Paletas).
- `puedeProgramarPaletas()` sigue gobernando la **secuencia del turno** de Paletas; ya no da permiso para escribir la cantidad programada.
