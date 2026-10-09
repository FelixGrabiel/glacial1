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
