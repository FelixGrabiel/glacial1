# Semáforo (estado de la línea) vs. paradas oficiales

## Regla
- **DETENER LÍNEA, REANUDAR y PAUSA PROGRAMADA** (Producción Actual) cambian el **estado** de la línea, registran fecha/hora/usuario y generan las alertas de siempre. Su historial se conserva en `sync/programaciones` → `items[].estadoOperacion.paradas[]`, `historialAlertas` y `detencionAcumuladaMs`, y la tarjeta de la línea lo muestra como **informativo**.
- Las **paradas oficiales** (programadas y no programadas) son solo las que registra el supervisor: Avance/Cierre (`sync/avancesTurno` → `paradasOperativas`) y las filas manuales de Nuevo registro (`sync/records`, sin `auto`).
- Nunca se suman ambos historiales ni se corrige uno con el otro.

## Cálculo (23b-tiempos-linea.js · `calcularTiemposLinea`)
`Tiempo efectivo = tiempo transcurrido − (paradas programadas + no programadas oficiales)`; la fórmula de `GlacialIndicadores` no cambia. Los intervalos con hora se fusionan, el exceso de un motivo programado sobre su estándar pasa a no programada, y no hay doble descuento con el semáforo. Ratio, Cierre, Avance, resumen, análisis de paradas e Impacto Económico (hoy y días cerrados) usan esta misma fuente.

## Qué cambió
- 23b: los intervalos de botón ya no entran en minutos, clasificación, Pareto ni ratio (`detalle` y `fuentes.detenerLinea/pausaProgramada` quedan como historial informativo).
- 24: el estado por presentación ya no usa minutos de DETENER/PAUSA ni evalúa «por debajo del ritmo nominal»; colores y estados (EN CURSO naranja, COMPLETADA verde, DETENIDA/CANCELADA rojo, PENDIENTE gris) no cambian.
- 35: ya no copia DETENER/PAUSA al registro.
- 06 (`normalizarCuadros`): las filas importadas antes desde DETENER/PAUSA (`auto` + origen `PAUSA|DETENER`) se ignoran en todos los cálculos, también en registros y días pasados.
- 29: el aviso del modal de paradas aclara que el historial del semáforo es informativo; ya no hay «duplicado con botón».

## Pendiente (no forma parte de este cambio)
Una alerta de discrepancia entre el tiempo detenido del semáforo y las paradas de Avance.
