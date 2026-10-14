# Producción fuera de programación (marcas ajenas al plan)

## Incidencia

PET2 · 13/10/2026 · Noche. El plan solo tenía **Fontlife 1 L × 12** («Todo el turno», ~45 000 UND estimadas). Producción Actual mostraba
además **Scala 1 L × 12 En curso con 24 696 / 0 UND**, a Fontlife como «Próximo a producir» y un total de **2 marcas con 54.9 %**
(24 696 ÷ 45 000).

## Causa comprobada

No hay filas fantasma persistidas. Los escritores están bien: `programacionAplicarEnLista` (16-paletas.js) borra la fila al quitar un
producto (con sus `tramosSecuencia`), y la secuencia vive en la fila de cada producto. El defecto estaba en el **lector** de
Producción Actual (`js/produccion/24-semaforo-produccion-actual.js`):

1. `dibujarTablero()` arma las marcas de la línea con `combinacionesConDatosPaletas()`, que junta las programaciones **y toda marca con
   paletas** del bloque. Se agregaba una fila si `x.prog || producido > 0`, así que Scala, que solo tenía paletas, entraba como una marca más.
2. En `construirGrupoTurno()` esa fila entraba a `items`. Como `estadoOrdenItem()` marca **EN CURSO** cuando producido > 0 y programado ≤ 0,
   Scala aparecía En curso. Además, `totalProd` sumaba sus 24 696 UND y se dividía por el programado de Fontlife (45 000): **54.9 %**.
3. `glacialResumenEjecutivoLineas()` (Inicio, Resumen del turno y Resumen de indicadores) repetía la misma suma.
4. Defecto relacionado: al consultar Día e Intermedio a la vez, una marca sin plan se contaba dos veces, porque su clave usaba el turno
   y no el bloque.

Las paletas de Scala sí tienen línea PET2, fecha 13/10 y turno NOCHE, porque `resumenProgramacionCombinacionTurnos` filtra por esos tres datos.
Si en la realidad pertenecen a otro bloque, es un error de registro en Paletas y lo corrige el supervisor.

Reproducción: `tests/visual/fuera-de-programacion.html?caso=antes` (carga los módulos reales con datos de prueba) y la primera
comprobación de `tests/fuera-de-programacion.test.js`.

## Corrección

- **Del plan** = el producto tiene fila de programación en el bloque. Cuenta también una fila de «Completar cantidad» con saldo por calcular.
  «Todo el turno» y «Hasta una hora» guardan su estimado. `estadoFila()` agrega `fueraPlan`. Para Día + Intermedio, la fila fuera del plan
  usa la clave del bloque (Día).
- `GlacialIndicadores.produccionPlanYFuera(items, ctx)` (45-indicadores.js, función pura) separa `plan`, `fuera` y `ajenos` (lo que es de
  otra línea, fecha o bloque). Compara línea, fecha, bloque, marca y presentación **exactas**: no hay coincidencias aproximadas.
  Devuelve `programado`, `producidoPlan`, `producidoFuera`, `producidoFisico` y `cumplimientoPlan`.
- **Tablero**: la secuencia, el estado, la marca actual, la próxima marca, el cumplimiento, el ratio necesario y la proyección usan solo el
  plan. Los productos sin programación aparecen en la sección **Producción fuera de programación**, con producto, cantidad, fuente
  (Paletas o registro del bloque) y contexto. También tienen su chip y los KPIs «Fuera de programación» y «Producción total de la línea».
  No se crea programación ni se borra ningún registro. **Rendimiento del turno** y **Ratio** siguen midiendo unidades físicas de la línea.
  Sin producción fuera del plan dan el mismo resultado que antes.
- Si todas las marcas vigentes son estimadas, el KPI se llama **Avance frente al estimado**; si solo algunas, «Cumplimiento (incluye
  estimados)». Las filas muestran «UND estimadas · N % del estimado». Sin programado, el cumplimiento muestra «—» y no 0 %.
- **Inicio** (32) muestra «⚠ Fuera de programación» bajo la producción de la línea. **Resumen de indicadores** en vivo (49): la producción
  fuera del plan suma a la producción física (rendimiento, OEE), pero no al cumplimiento. **Tabla técnica** de Producción Actual (16):
  «Fuera de programación» en lugar de «—».

## Alcance y límites

- No se migran datos ni se cambian proveedores, reglas o fórmulas de ratio y OEE.
- **Resumen del turno** (48) recibe el producido del plan, coherente con su cumplimiento. La producción fuera del plan no se muestra ahí.
- **Resumen de indicadores, bloques cerrados** (49, ruta de registros): no cambia. Sigue comparando todo el registro del bloque con el
  programado de la línea. Cambiarlo alteraría indicadores históricos ya reportados.
- El tablero se dibuja de forma síncrona con la selección actual y las cachés completas de `sync/programaciones` y `sync/paletas`. No hay
  cargas por selección que una respuesta tardía pueda pisar. Otros dispositivos reciben el cambio por las escuchas existentes.
- Las comprobaciones de recarga y de dos dispositivos reales no se pueden automatizar aquí.
