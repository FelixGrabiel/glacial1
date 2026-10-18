# Panel «PARADAS DE HOY»: pausas olvidadas y «Cerrar pausa»

## Qué estaba mal (diagnóstico del 18/10/2026)
- `43-bitacora-mantenimiento.js` mostraba como parada **toda** programación con `estadoOperacion = PAUSA / DETENIDA / LISTA`, sin filtro de día; los minutos eran `ahora − pausaDesde`.
- 7 de las 8 filas eran **«Cambio temporal de producción»**: la presentación anterior «estacionada» al iniciar otra en la misma línea (la línea seguía produciendo). No son paradas y 23b/24 ya las excluían; el panel y 46 no.
- 1 era un **Refrigerio** de B7L (17/10 13:30) olvidado, con un registro de parada sin fin.
- Los planes viejos nunca se finalizaron (siguen con una marca EN PRODUCCIÓN de hace días). Ningún flujo cierra pausas al terminar el turno; «Finalizar línea» sí las cierra, pero solo si alguien lo pulsa.
- «Sin paradas registradas…» salía porque leía otra fuente (eventos de la bitácora del día) que las pausas en vivo.

## Qué hace ahora (`js/produccion/24b-pausas-sin-cerrar.js`, `window.glacialPausas`)
| Cambio | Dónde |
|---|---|
| Solo se muestran como parada las abiertas del día operativo (07:00–07:00) o del turno anterior y de **menos de 24 h**. | `analizar()` · 43 · 46 |
| «Cambio temporal» **no es parada** mientras la línea produce otra presentación; si la línea queda sin producir, alerta a los 30 min. | `analizar()` |
| Umbrales de PARADA PROLONGADA: **Refrigerio 60 min**, **Cambio temporal 30 min**, otras pausas: lo mayor entre el umbral general (`PARADA_ALERTA_MIN`) y su estándar; detenciones: como antes. Todo en `CONFIG` (arriba del archivo). | `CONFIG` |
| Lo olvidado (> 24 h abierto, antes del turno anterior, o presentación EN PRODUCCIÓN con el turno terminado hace > 24 h) va a **«Pausas sin cerrar (revisar)»**, en ámbar, con línea, fecha, turno, marca/presentación, motivo, inicio y tiempo. | `htmlSinCerrar()` en 43 |
| Botón **«Cerrar pausa»** (o «Finalizar» si seguía en producción) solo para Supervisor, Supervisor de Producción, Jefe de Operaciones y Administrador. | `puedeCerrar()` |
| «Sin paradas registradas…» solo si no hay paradas abiertas **ni** pausas por revisar. | `htmlTarjeta()` |
| Tiempo legible desde 60 min («2 h 15 min»). | `fmtDuracion()` |
| **Automático:** al iniciar otra presentación, la pausa real (p. ej. refrigerio) de otra del plan se cierra con esa hora y queda estacionada; al **finalizar el reporte del turno** se cierran las pausas reales abiertas del plan al fin del turno; «Finalizar línea» ya las cerraba. Todo deja registro en `historialAlertas`. | 24 · 06 · `estacionarProgramacion` / `cerrarAlCerrarTurno` |

### Qué hace «Cerrar pausa»
Pide la **hora real de fin** (por defecto: la hora de finalización de la programación si existe; si no, el fin de su turno; nunca antes del inicio ni en el futuro) y una nota opcional. En una transacción sobre `sync/programaciones`: cierra los registros de parada con esa hora, suma lo acumulado, deja la presentación **FINALIZADA** con esa hora y anota en su historial `cierre_parada` (para los cálculos de 23b) y `cierre_manual_pausa` (quién, cuándo, hora indicada, estado anterior, nota). Si otra persona ya la cerró, avisa y no duplica.

## Qué NO cambió
No se borró nada (la función `abiertasEnVivo` de 43 se conserva como respaldo). No se tocó la lógica de OEE, tiempos ni Impacto Económico: solo cambia el dato de entrada de la pausa que se cierra (su hora de fin real).
**Aviso — cálculo histórico:** cerrar el Refrigerio de B7L del 17/10 con su hora real cambiará el tiempo operativo y el OEE de ese turno (hoy cuenta la pausa hasta el fin del turno). Las «Cambio temporal» no entran en esos cálculos, así que cerrarlas no los modifica.

## Pruebas manuales
1. Pausar y reanudar una línea → no queda abierta.
2. Pausar y **Finalizar línea** sin reanudar → la pausa se cierra sola (ya ocurría).
3. Pausar (refrigerio) y luego iniciar otra presentación → la pausa se cierra con esa hora y la primera queda «estacionada».
4. Refrigerio de 40 min → se lista sin alerta; de 70 min → «PARADA PROLONGADA».
5. Finalizar el reporte del turno con una pausa real abierta → se cierra al fin del turno.
6. Las 8 pausas viejas aparecen en «Pausas sin cerrar (revisar)» y se cierran con el botón.
7. Un usuario sin permiso ve el aviso pero no el botón.
8. «Sin paradas registradas…» solo con la lista vacía.

## Cómo limpiar las pausas abiertas actuales (Administrador / Supervisor / Jefe de Operaciones)
En **Inicio** (tarjeta «PARADAS DE HOY» → «Pausas sin cerrar (revisar)»), para cada fila pulsa **Cerrar pausa** (o **Finalizar** en las que siguen EN PRODUCCIÓN) y confirma la hora:
- **PET2 12/10 DÍA** (Merkat, Aro, Cuisine, Scala estacionadas + Bells en producción): deja la hora sugerida (fin del turno, 19:00).
- **B7L 13/10 DÍA** (ARO) y **NOCHE** (BELLS), **PET1 15/10 DÍA** (Cuisine): igual.
- **B7L 17/10 DÍA · Refrigerio**: indica la hora real en que terminó el refrigerio (si no se sabe, la sugerida es el fin del turno; ver el aviso del cálculo histórico).
- Las que sigan EN PRODUCCIÓN de planes viejos (PET2 12/10, B7L 13/10 DÍA/NOCHE, PET1 15/10): «Finalizar» con el fin de su turno.

## Pruebas automáticas
`node tests/pausas-sin-cerrar.test.js` (lógica con los datos reales del 18/10) y `node tests/pausas-sin-cerrar.e2e.js` (panel dibujado en Chromium y ventana «Cerrar pausa»).
