# Ratio oficial: 23b y 29

Ratio = producción acumulada al corte ÷ horas efectivas.
Horas efectivas = (transcurrido − paradas oficiales) ÷ 60. Se redondea solo al mostrar o exportar.

- **Paradas oficiales** = las del supervisor (Avance/Cierre y paradas manuales del registro). DETENER/PAUSA del semáforo son estado e historial: no descuentan.
- **Una sola lista por línea y corte**: `avLineaSnapshot` (29) la arma y la envía a `calcularTiemposLinea(..., {inicioMs, finMs, paradasOficiales})` (23b). Un arreglo vacío = sin paradas; sin la opción, 23b busca como antes (hasta el corte).
- **Corte**: hora del reporte, o el fin real de la línea si ya terminó (todas sus presentaciones finalizadas). Si otra presentación sigue produciendo, manda el corte del reporte (un relevo no cierra el bloque).
- Cuadros que empiezan después del corte no entran; paradas con hora se recortan al corte (`horaFinOriginal` conserva la original); solo-minutos se suman como siempre.
- **Ratio no disponible** (`null`, se muestra «—»): sin inicio válido o tiempo efectivo 0. Producción 0 con tiempo efectivo → ratio 0. Snapshots antiguos sin `ratioDisponible` conservan «0 = —».
- **Documental vs descontado**: `totalParadas` es la suma de la lista; `minutosParadasDescontadas` es lo realmente restado (solapes, duración estándar, corte). Si difieren, el detalle en pantalla lo explica.
- **Formatos (presentaciones)**: se calculan al generar y se guardan en `linea.bloques`. Una sola presentación = la línea (mismo inicio y ratio). Varias: cada una en su ventana; las paradas de Avance con hora se descuentan donde ocurrieron, las de solo minutos en la primera. Texto, imagen y pantalla leen lo mismo; reabrir un snapshot no recalcula.
- Noche: inicio y fin de línea se ordenan por instante (01:00 va después de 23:00).

Caso PET2: 32,370 ÷ ((621 − 147) ÷ 60 = 7.9 h) = 4,097.468… → «4,097 B/H». Prueba: `tests/ratio-oficial-23b-29.test.js`.

## Unificación con el semáforo (segunda etapa)

- **Producción de Paletas**: un solo servicio, `glacialProduccionPaletasAlCorte` (`16-paletas.js`). Cada registro es un acumulado; manda el último de cada tipo (completas / saldo) POR TURNO y los turnos del bloque se suman (Día e Intermedio acumulan por separado). Avance/Cierre y Producción Actual lo usan. Antes Avance tomaba un solo registro para todo Día+Intermedio y podía quedar corto.
- **Fuente**: se mantiene la política (avance: Paletas con respaldo en Producción efectiva; cierre: al revés). Nunca se suman. Si existen ambas y difieren, el snapshot guarda la otra en `productos[].produccionAlternativa` y el detalle la muestra como conciliación.
- **Hora única**: `avConstruirSnapshot` toma la hora del servidor una vez (`ahoraMs`) y la pasa a todas las líneas.
- **Snapshot nuevo guarda** (`versionCalculo: 2`): `corteMs`, `inicioMs`, `finProductivoMs`, `bloque`, `fechaBloque`, minutos transcurridos / efectivos / descontados (programados y no programados), ratio sin redondear, bloques por formato y, por producto, fuente y alternativa.
- **Inconsistencia**: si las paradas superan el tiempo transcurrido, el ratio queda «—» y se informa.
- **Varios formatos**: cada formato tiene su ventana (su hora fin, o el inicio del siguiente, o el corte). Sin hora de inicio propia: «Sin tiempo asignado». Las paradas con hora se descuentan en la ventana donde ocurrieron; las de solo minutos, en el primer formato.
- **Detalle** «Cómo se calculó el ratio» en el detalle del avance; el semáforo muestra el corte y la comparación con el último avance (`glacialUltimoAvanceLinea`, solo si Avance ya cargó sus snapshots).
- Snapshots anteriores (sin `versionCalculo`) se conservan tal cual y no muestran el detalle.
