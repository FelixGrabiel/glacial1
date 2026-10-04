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
