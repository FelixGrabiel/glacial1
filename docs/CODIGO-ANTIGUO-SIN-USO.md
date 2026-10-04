# Código antiguo que quedó sin uso por el módulo único de indicadores

Se lista, no se borra. Cada commit de la Parte 2 agrega su sección.

## Commit 1 — horas efectivas y ratio

| Archivo | Qué queda sin uso |
|---|---|
| `js/produccion/24-semaforo-produccion-actual.js` (~líneas 800 y 866) | `horasEfectivas` (unión de intervalos) y `horasEfectivasTurno` se calculan y se devuelven, pero ninguna pantalla las lee. |
| `js/produccion/23b-tiempos-linea.js` | `ratioTurno` sigue siendo otro indicador (producido ÷ tiempo sin pausas programadas); no es horas efectivas y no se toca. |

## Commit 2 — disponibilidad

| Archivo | Qué queda sin uso |
|---|---|
| `js/produccion/09-resumen.js`, `14-exportar-general.js` | Los promedios de disponibilidad ponderados por horas (`dispXhoras`) se quitaron; la disponibilidad de la planta se calcula con tiempos sumados. El campo `disponibilidad` por línea sigue en el agregado de 14 y ya viene del módulo. |
| `js/produccion/08-graficos.js` (`xlEstadisticasLinea`) | `hTurno` sigue acumulándose pero ya no entra en la disponibilidad (queda sin lectura). |
| `js/produccion/49-resumen-indicadores.js` | Las metas `DEF_METAS.disponibilidad` siguen aquí hasta el commit de metas. |

## Commit 3 — rendimiento y OEE

| Archivo | Qué queda sin uso |
|---|---|
| `js/produccion/06-registro.js` | `calidad`, `calidadBot`, `rechazadas` se siguen calculando (otras pantallas los muestran), pero ya no entran en el OEE. |
| `js/produccion/47-analisis-paradas.js` | `datos.rechazadas` (merma de Botellas) se sigue leyendo, pero ya no se usa para calcular nada. Los comentarios de cabecera líneas 20-21 describen la calidad antigua. |
| `js/produccion/08-graficos.js`, `09-resumen.js` | Siguen mostrando «Calidad» (radar, cascada de pérdidas, metas de calidad, textos de resumen). Como no se mide, queda para decidir si se retira (hoy vale 100 %). |
| `js/produccion/08-graficos.js` | `calcularPromedioMovil` ahora usa la lista de registros; los campos `oee` y `horas` de la serie diaria quedan solo como valor final. |

## Commit 4 — cumplimiento y producido vigente

| Archivo | Qué queda sin uso |
|---|---|
| `js/produccion/24-semaforo-produccion-actual.js` (~línea 1588) | El campo «producción corregida» del cierre sigue guardando `op.produccionFinalCorregida`, pero `producidoDe` ya no lo lee: **editarlo no cambia ningún número**. Decidir si se quita el campo del cierre. |
| `js/produccion/24-semaforo-produccion-actual.js` | `obtenerProgramacionPaleta` y la lógica de cantidad programada por item siguen en el semáforo (el programado vigente por línea lo da `programadoVigente`, pendiente de conectar al sumar items). |
| `js/produccion/16-paletas.js` | `resumenProgramacionCombinacionTurnos` sigue siendo la fuente de Paletas; no se toca. |

## Commit 5 — merma

| Archivo | Qué queda sin uso |
|---|---|
| `js/produccion/08-graficos.js` | Las barras de merma por turno solo muestran unidades; el Polietileno en kg + rollos solo sale en el Resumen general (49). Falta decidir si el gráfico del turno también lo muestra en kg. |
| `js/produccion/09-resumen.js` (`calcularMermaPorLinea`, etc.) | Siguen sumando `agruparMermas(r).totalUnidades`; la fórmula del porcentaje ya es la del módulo. |

## Commit 6 — estado de línea

| Archivo | Qué queda sin uso |
|---|---|
| `js/produccion/24-semaforo-produccion-actual.js` | La constante local `PRIORIDAD_ESTADO_LINEA` (la prioridad ahora vive en el módulo) y las variables `hayCurso`, `hayPausa`, `hayPendiente`, `todosCerrados`, `todosCancelados` ya no existen en el tablero. `estadoOrdenItem` sigue siendo la clasificación POR ÍTEM (el módulo solo agrega). |
| `js/produccion/09-resumen.js` | El Resumen clasifica cada programación solo por `estadoOperacion` (no mira Paletas): una programación sin estado guardado cuenta PENDIENTE aunque ya tenga producción. El semáforo sí mira Paletas. |
