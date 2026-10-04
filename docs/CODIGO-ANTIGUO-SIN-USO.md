# Código antiguo que quedó sin uso por el módulo único de indicadores

Se lista, no se borra. Cada commit de la Parte 2 agrega su sección.

## Commit 1 — horas efectivas y ratio

| Archivo | Qué queda sin uso |
|---|---|
| `js/produccion/24-semaforo-produccion-actual.js` (~líneas 800 y 866) | `horasEfectivas` (unión de intervalos) y `horasEfectivasTurno` se calculan y se devuelven, pero ninguna pantalla las lee. |
| `js/produccion/23b-tiempos-linea.js` | `ratioTurno` sigue siendo otro indicador (producido ÷ tiempo sin pausas programadas); no es horas efectivas y no se toca. |
