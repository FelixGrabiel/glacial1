# Planificación · etapa 1 (correcciones de la auditoría)

Compatible con Firestore y con la rama `supabase`: solo se usan `runTransaction`, `set`, `update`, `onSnapshot`, `where ==`, ids propios (`h_…`, `prog_…`) y
ninguna construcción que el puente no admita. No hay cambios en `_archivo/firebase/firestore.rules.etapa2.txt` (no hace falta republicar reglas), ni en `01-config.js`, ni en las líneas de Firebase de `index.html`.

## Qué cambió, por archivo
| Archivo | Cambio |
|---|---|
| `js/produccion/52-planificacion-pantalla.js` | **H1:** `LF` definido (importar con posible duplicado ya no falla). **H8:** el formulario recuerda la versión de la fila que se vio al abrirlo; si otra persona la cambia muestra el valor actual (en vivo, sin tocar lo que se escribe) con «Cargar valor actual», y un guardado con versión vieja se rechaza. |
| `js/produccion/16-paletas.js` | Nueva `programacionAplicarEnLista` (la regla de escritura, ahora reutilizable), `programacionConflicto`, `programacionValorHistorial`. `guardarProgramacionPaleta` guarda **cambio + versión + historial en una sola transacción**. Cada fila lleva `version` (sube en 1 en cada cambio de plan; sin versión = 0). |
| `js/produccion/54-planificacion-solicitudes.js` | **H3/H4:** `NS.resolverSolicitud` aprueba o rechaza en **una transacción**: comprueba que la solicitud siga PENDIENTE y que la fila siga igual que cuando se pidió (versión, o cantidad en solicitudes antiguas), aplica el cambio (cambio de producto = quitar + crear en la misma transacción), escribe el historial y marca la solicitud. Si algo cambió no se aplica nada y el error trae el valor actual. `NS.armarEvento` arma el evento del historial (se guarda dentro de la transacción de quien lo llama). Las solicitudes nuevas guardan `baseVersion`. El historial muestra «+ N UND desde Intermedio». |
| `js/produccion/51-planificacion-nucleo.js` | **H5:** `unificarEnDia` en una transacción con **un solo evento** (EDICIÓN/CREACIÓN del Día con `desde` = datos de Intermedio, referencia `UNIFICACION`). Comprueba también la versión de la fila de Intermedio. `NS.quitar` acepta `versionEsperada`. |
| `js/produccion/29a-avances-items.js` | Nueva `medirSync()` (solo Administrador, solo lectura) para **H9**. |
| `index.html` | Solo versiones de scripts (`?v=20261011-pl1`). |
| Pruebas | Nuevo `tests/planificacion-etapa1.test.js` (nube falsa con transacciones optimistas) y ajustes a `tests/planificacion.test.js` y `tests/avances-items.test.js`. Nuevo `tests/visual/planificacion.html` (dos pestañas = dos personas). |

## Resultado de H7 (con datos): NO se confirma
La hipótesis era que Cumplimiento contaba solo el turno de la fila representativa. Con paletas DÍA 5 000 + INTERMEDIO 3 000 y fila DÍA:
- Sin la envoltura de `24-semaforo-produccion-actual.js`, consultar solo DÍA daría 5 000 (referencia).
- Con `24` cargado (como en la app): el producido del bloque es **8 000** (turno en curso) y **7 700** (turno cerrado, registros 4 800 + 2 900), tanto desde la fila DÍA como desde la INTERMEDIO.
`24` reemplaza `resumenProgramacionCombinacionTurnos` para que cualquier consulta de Día o Intermedio devuelva el bloque, y `registroDeTurno` ya agrupa por bloque. Cumplimiento (54) además junta DÍA e INTERMEDIO de un producto en una sola entrada. **No hay corrección que proponer.** (Limitación: la prueba extrae esas funciones del código real; no se ejecutó la pantalla de Producción Actual completa.)

## H9 · tamaño de `sync/programaciones`, `paletas` y `catalogoPlanificacion`
- **Medición real: pendiente.** No tengo acceso a los datos de producción ni los toqué. Con sesión de Administrador, en la consola:
  `await glacialAvancesItems.medirSync()` → por documento: bytes, % del límite de 1 MiB, elementos, bytes por elemento, rango de fechas, crecimiento por día y si cada lista se parte en filas en Supabase. Pásame el resultado y calculo el plazo.
- **Cómo quedan en Supabase** (según `docs/00-general/puente-supabase.md`): toda lista de objetos con clave única (`id`, `username`, `clave`, `opId`, `email` o `uid`) se parte en **filas** (`fs_items`) y se acaba el límite de 1 MiB. Las tres listas tienen `id` en cada elemento por código (`prog_…`, `pal_…`, `cat_…`), así que **quedarían como filas**, siempre que todos los elementos existentes tengan `id` único (si uno no lo tiene, la lista queda como un solo documento). `medirSync()` lo comprueba (`claveUnica`, `seParteEnSupabase`).
- Hasta el 01/11 siguen siendo un solo documento en Firestore; el aviso del 80 % (ya construido) cubre `programaciones`, `paletas` y `catalogoPlanificacion`.

## H2 · propuesta para Supabase (no implementada)
Hoy el permiso `planificacion` solo se exige en el navegador porque Producción Actual escribe el estado en el mismo documento. En Supabase los elementos son **filas**, así que se puede exigir en el servidor lo que en Firestore no se puede expresar:
1. En `glacial_fs.autorizar` para `sync/programaciones`: quien tiene `planificacion` (mismas reglas que `puedePlanificar()`) puede crear, cambiar y quitar filas.
2. Quien solo opera (supervisor, Producción Actual, Paletas) solo puede **modificar filas existentes** y únicamente los campos de ejecución: `estadoOperacion`, `tramosSecuencia` y `actualizadoEn`. Se verifica comparando la fila nueva con la anterior sin esos campos (`nuevo − campos == viejo − campos`); altas y bajas, denegadas.
3. El resto de campos del plan (`cantidadProgramada`, `unidadesPorPaleta`, `paletasProgramadas`, `marca`, `presentacion`, `version`, `unificadoDeIntermedio`) solo los cambia un planificador.
4. Sin cambios en el código de la página; el control del navegador queda como primera barrera.
Requiere confirmar la lista exacta de campos de ejecución que escriben `24`, `16` (paletas y secuencia) y `02-estado.js` (`saveProgramaciones`).

## Decisiones registradas para la etapa 2 (sin implementar)
- EN PRODUCCIÓN pasa a naranja también en Planificación.
- Compromiso original = versión vigente al iniciar el bloque (inicio del turno DÍA o NOCHE según la configuración); lo anterior es planificación, lo posterior reprogramación.

## Qué probé
- `node tests/planificacion-etapa1.test.js` (nube falsa con transacciones optimistas, dos «dispositivos»): causa de H1 reproducida con el código anterior (`LF is not defined`) y corregida; importación con y sin confirmar; control de versión (A edita con versión vieja → rechazo con valor actual; filas nuevas simultáneas; filas antiguas sin versión; quitar con versión vieja); atomicidad (fallo de red a mitad: ni la fila ni el historial ni la solicitud cambian); aprobación simultánea (uno aplica, el otro recibe «ya fue resuelta»); fila cambiada después de la solicitud; cambio de producto (éxito, fallo de red, dato inválido, destino ya programado); programación nueva sobre una existente; rechazo; permisos; unificar con un solo evento y con fila cambiada; H7 con datos; compatibilidad con el puente. Todas las suites del proyecto pasan (`for t in tests/*.test.js`).
- **Navegador** (`tests/visual/planificacion.html`, pestañas con la página real de Planificación sobre una nube falsa compartida por `localStorage`): dos personas en dos pestañas; Luis guarda mientras Ana tiene el formulario abierto (el aviso aparece solo, lo que Ana escribió no se toca, la tabla de fondo se actualiza); Ana guarda con versión vieja y se rechaza con el valor actual; «Cargar valor actual» y guardado correcto (versión 3, historial de ambos); aprobación con la fila cambiada (mensaje con el valor actual, solicitud sigue pendiente); **dos aprobadores a la vez** (uno aplica; el otro: «ya fue resuelta por otra persona», un solo evento, versión 2); **falla de red simulada** (sin cambios ni evento; el reintento funciona); **celular** (375 px, el aviso en vivo se ve y no hay desplazamiento horizontal); usuario de solo lectura (sin «Editar», «Pedir cambio» guarda `baseVersion`).

## Qué NO pude probar
- **Firestore ni Supabase reales**: ni el entorno de PRUEBAS publicado ni cuentas reales. La «nube» de las pruebas imita las transacciones con versiones; falta comprobar en PRUEBAS con cuentas reales (dos usuarios distintos, una en celular real) y con las reglas publicadas.
- Unificar en Día, importar Excel y copiar programación desde la **interfaz** en el navegador (cubiertos por pruebas automáticas, no a mano).
- Cambio de producto aprobado desde la interfaz (cubierto por prueba automática).
- La medición real de H9.
- La rama `supabase` no se tocó; el código usa solo lo que el puente documenta, pero no se ejecutó contra él.

## Nota de comportamiento
- Un guardado de programación ahora **falla entero** si el historial no se puede escribir (antes se guardaba el plan y solo se avisaba). Las reglas de `historialProgramacion` ya estaban publicadas.
- La versión de cada fila sube solo con cambios de **plan** (cantidad, unidades por paleta, unificar). Los cambios de estado de Producción Actual no la suben: no provocan conflictos en el formulario de edición.
