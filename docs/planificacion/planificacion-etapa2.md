# Planificación · etapa 2 (avance del plan, compromiso original, colores y exportación)

## Qué cambió, por archivo
| Archivo | Cambio |
|---|---|
| `js/produccion/64-planificacion-avance.js` (nuevo) | Avance por producto de un bloque (`NS.resumenBloque`), paletas completas + UND (`NS.paletasTexto`), compromiso original (`NS.asegurarCompromiso`, `originalDe`, `cambiosDesdeInicio`, escucha en vivo) y exportación (`NS.textoPlan`, `copiarPlan`, `excelPlan`). |
| `js/produccion/52-planificacion-pantalla.js` | Tabla de Programación con **Producido, Pendiente, Sobreproducción y Avance**, paletas «45 + 100 UND», **subtotales por línea**, total aclarado, «Meta alcanzada», marca de **original al inicio**, panel «Reprogramado después del inicio del bloque», botones **Copiar plan** y **Excel del plan** (para cualquier usuario) y **colores de estado**. |
| `js/produccion/54-planificacion-solicitudes.js` | Cumplimiento con **«Original al inicio»** y **«Cumplimiento vs original»** (solo cuando hubo reprogramación) y en el Excel; incluye lo que se quitó después del inicio. Aprobar guarda antes el compromiso. |
| `js/produccion/51-planificacion-nucleo.js` | `guardar`, `quitar` y `unificarEnDia` guardan antes el compromiso del bloque (nunca bloquean). |
| `_archivo/firebase/firestore.rules.etapa2.txt` | Nuevo bloque `match /compromisosProgramacion/{id}` (**hay que publicarlo**). |
| `index.html` | Carga `64-planificacion-avance.js` y sube versiones (`?v=20261011-pl2`). |
| Pruebas | `tests/planificacion-etapa2.test.js` (+ `tests/planificacion-harness.js`) y `tests/visual/planificacion.html` actualizado. |

## Decisiones aplicadas
- **EN PRODUCCIÓN pasa a naranja** también en Planificación, con los mismos colores de Producción Actual: EN PRODUCCIÓN naranja (`#FFEDD5/#9A3412`), PAUSA amarillo, DETENIDA y LISTA rojo, FINALIZADA verde, PENDIENTE gris. No se cambió ninguna lógica de estados. **Cancelada** ya no se ve igual que Detenida (gris tachado). Los badges de Solicitudes (aprobada/rechazada/pendiente) conservan sus colores.
- **Compromiso original** = el plan vigente al **iniciar el bloque** (inicio de Día 07:00 / Noche 21:00 según la configuración de bloques; Noche se mide contra las 21:00 de la fecha operativa). Lo cambiado antes del inicio es planificación; lo posterior, reprogramación.
  - Cómo se guarda: un documento por bloque `compromisosProgramacion/AAAA-MM-DD_DIA|NOCHE` con las filas (`id` = clave de la programación). Lo crea el planificador **justo antes del primer cambio posterior al inicio**, así que no hace falta nadie conectado a la hora de inicio. Solo se crea; no se edita ni se borra.
  - Si un bloque no tiene documento, no se registró reprogramación y el original = vigente.
  - Es una escritura **aparte** de la del plan (no atómica con ella): si falla (p. ej. reglas sin publicar), el cambio de plan sí se guarda, se avisa en pantalla y Cumplimiento usa el plan vigente. Ventana mínima: otra persona podría cambiar el plan entre las dos escrituras.

## Otros cambios de comportamiento
- El **total del bloque** ya no suma las filas CANCELADA (coherente con `programadoVigente`); antes las sumaba. Aclara que mezcla UND de líneas distintas.
- **Sin registro ≠ cero:** si el turno cerrado no tiene registro, se muestra «Sin registro»; pendiente, sobreproducción y avance quedan vacíos y no suma al subtotal.
- **Meta alcanzada** (producido ≥ programado) es independiente del estado «Finalizada».
- Día + Intermedio de un producto: producido pedido **una vez** (se muestra en la primera fila).
- Cumplimiento: las columnas de original aparecen solo si hay reprogramación en el rango.
- **Corrección a la auditoría:** el encabezado de Planificación ya tenía la insignia «Actualizado a las HH:MM / Sin conexión · datos de las HH:MM» (`glacialEstadoDatos`); escribí que faltaba la hora de actualización y era un error mío. No se tocó.

## Para publicar / Supabase (importante)
1. **Firestore:** publicar `_archivo/firebase/firestore.rules.etapa2.txt` (bloque `compromisosProgramacion`). Sin él, el código funciona pero no guarda ni lee el compromiso (aviso en pantalla y en consola).
2. **Supabase:** `compromisosProgramacion` es una colección nueva; hay que agregarla a `glacial_fs.puede_leer` y `glacial_fs.autorizar` con la misma regla (lectura: usuario con sesión salvo cuenta compartida; creación: quien puede planificar, sin modo visualización, `uid` propio, id = `fecha_bloque`, `bloque` en DÍA/NOCHE, solo crear). Esto **no lo puedo hacer yo** (es de la rama `supabase`). Mientras no esté, el código degrada igual que con las reglas de Firestore sin publicar. Usa solo `runTransaction`, `set`, `onSnapshot` con `orderBy('fecha','desc').limit(200)` y ids propios.

## Qué probé
- `node tests/planificacion-etapa2.test.js` (nube falsa con transacciones, reloj controlado): paletas 5 500/120 = 45 + 100 UND; agrupación Día + Intermedio; producido = programado, sobreproducción separada del pendiente, cero ≠ sin registro, Finalizada ≠ meta alcanzada, cancelada fuera de los totales; tabla HTML real; texto y Excel del plan; compromiso (antes del inicio no se guarda, primer cambio posterior lo guarda con el plan previo, los siguientes no lo reescriben, Noche 20:00 vs 22:30, aprobar y quitar también, no bloquea si falla); Cumplimiento con original (PET 1: vigente 6 500, original 17 000 incluyendo lo que se quitó, 41,2 % vs original y 107,7 % vigente); colores; reglas; compatibilidad con el puente. Todas las suites pasan.
- **Navegador** (`tests/visual/planificacion.html`, dos pestañas = dos personas): tabla con producido, pendiente, sobreproducción (+500), «Meta alcanzada», subtotal por línea y paletas «8 + 400 UND»; Noche con «Sin registro»; un cambio posterior al inicio guarda el compromiso (10 000 / 6 000 a las 07:00) y muestra «Reprogramado después del inicio»; **otra pestaña** ve el cambio en vivo y su propio cambio no reescribe el compromiso; Cumplimiento con original y «Cumplimiento vs original»; celular a 375 px sin desplazamiento horizontal de la página (la tabla se desplaza dentro de su contenedor).

## Qué NO pude probar
- Firestore ni Supabase reales, ni cuentas reales, ni con las reglas publicadas; tampoco celular físico.
- `glacialProducidoVigente` real de Producción Actual (en el navegador se usó un doble que suma paletas; en pruebas automáticas, un doble). La fórmula real se verificó en la etapa 1 (H7).
- Copiar plan al portapapeles y descargar el Excel reales (probados con dobles).
- Importar, copiar y unificar desde la interfaz con el compromiso activo (cubiertos por pruebas automáticas).

## Pendiente para la etapa 3 (sin implementar)
Capacidad por línea y bloque, secuencia de marcas con inicio/fin estimados, traslado de saldo, personal e insumos, prioridad y pedido.
