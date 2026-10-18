# Comparación de indicadores: lo que muestra hoy cada pantalla y lo que daría el módulo único

Generado por `node tests/comparar-indicadores.js --guardar`. Ejecuta el **código real** de cada pantalla (tal como está en `js/`) sobre datos de ejemplo y lo compara con `js/nucleo/45-indicadores.js`.

**Datos de ejemplo** (no son datos reales de planta; el repositorio no los trae):
- *Caso oficial*: PET 1, un producto, 480 min, 60 min de parada programada, 45 min no programados, 14.400 UND producidas, 16.000 programadas, velocidad 2.500 UND/h, merma de 288 botellas.
- *Día de planta*: PET 1 (Día) con dos productos (9.800 y 3.000 UND), PET 2 (Noche) con 16.000 UND y una programación cancelada de 5.000; Paletas de PET 1 = 12.600 UND frente a 12.800 del registro.

Columna **¿Cambia?**: «**SÍ**» si el valor que muestra hoy es distinto del que daría el módulo.

| Indicador | Pantalla | Hoy | Con el módulo | ¿Cambia? |
|---|---|---|---|---|
| Horas efectivas | Caso oficial · PET1: Nuevo registro, Historial, Gráficos (06) | 6.25 h | 6.25 h | no |
| Horas efectivas | Caso oficial · PET1: Resumen, bloque «Planta» (09) | 6.25 h | 6.25 h | no |
| Horas efectivas | Caso oficial · PET1: Semáforo, Avance, Análisis (23b/29/47) | 6.25 h | 6.25 h | no |
| Ratio (UND/h) | Caso oficial · PET1: Nuevo registro, Historial, Gráficos (06) | 2,304 | 2,304 | no |
| Ratio (UND/h) | Caso oficial · PET1: Resumen, bloque «Planta» (09) | 2,304 | 2,304 | no |
| Ratio (UND/h) | Caso oficial · PET1: Semáforo (23b) | 2,304 | 2,304 | no |
| Disponibilidad | Caso oficial · PET1: Nuevo registro, Gráficos (06, por registro) | 89.3 % | 89.3 % | no |
| Disponibilidad | Caso oficial · PET1: Excel general y gráficos del Resumen (14 y 09, promedio por horas) | 89.3 % | 89.3 % | no |
| Disponibilidad | Caso oficial · PET1: Análisis de paradas (47) | 89.3 % | 89.3 % | no |
| Rendimiento | Caso oficial · PET1: Gráficos del Resumen (09, con tope 100 %) | 92.2 % | 92.2 % | no |
| Rendimiento | Caso oficial · PET1: Análisis de paradas (47, con sopladas) | 92.2 % | 92.2 % | no |
| OEE | Caso oficial · PET1: Nuevo registro, Gráficos (06, calidad 100 %) | 82.3 % | 82.3 % | no |
| OEE | Caso oficial · PET1: Excel general (14, promedio por horas) | 82.3 % | 82.3 % | no |
| OEE | Caso oficial · PET1: Análisis de paradas (47, con calidad por botellas) | 80.6 % | 82.3 % | **SÍ** |
| Cumplimiento | Caso oficial · PET1: Nuevo registro, Historial, Excel general (06/07/14: programada del registro) | 90.0 % | 90.0 % | no |
| Cumplimiento | Caso oficial · PET1: Resumen, bloque «Planta» (09: programaciones) | 90.0 % | 90.0 % | no |
| Cumplimiento | Caso oficial · PET1: Semáforo y Paletas (turno en curso: Paletas ÷ programado) | 87.5 % | 87.5 % | no |
| Cumplimiento | Caso oficial · PET1: Semáforo y Paletas con el turno CERRADO (hoy sigue usando Paletas; el módulo usa el registro del turno) | 87.5 % | 90.0 % | **SÍ** |
| Merma | Caso oficial · PET1: Excel general (14) y merma por línea (09) | 2.0 % | 2.0 % | no |
| Merma | Caso oficial · PET1: Resumen, bloque «Planta» (09) | 2.0 % | 2.0 % | no |
| Horas efectivas | Día de planta · PET1: Nuevo registro, Historial, Gráficos (06) | 6.50 h | 6.50 h | no |
| Horas efectivas | Día de planta · PET1: Resumen, bloque «Planta» (09) | 6.50 h | 6.50 h | no |
| Horas efectivas | Día de planta · PET1: Semáforo, Avance, Análisis (23b/29/47) | 6.50 h | 6.50 h | no |
| Ratio (UND/h) | Día de planta · PET1: Nuevo registro, Historial, Gráficos (06) | 1,969 | 1,969 | no |
| Ratio (UND/h) | Día de planta · PET1: Resumen, bloque «Planta» (09) | 1,969 | 1,969 | no |
| Ratio (UND/h) | Día de planta · PET1: Semáforo (23b) | 1,969 | 1,969 | no |
| Disponibilidad | Día de planta · PET1: Nuevo registro, Gráficos (06, por registro) | 89.7 % | 89.7 % | no |
| Disponibilidad | Día de planta · PET1: Excel general y gráficos del Resumen (14 y 09, promedio por horas) | 89.7 % | 89.7 % | no |
| Disponibilidad | Día de planta · PET1: Análisis de paradas (47) | 89.7 % | 89.7 % | no |
| Rendimiento | Día de planta · PET1: Gráficos del Resumen (09, con tope 100 %) | 85.2 % | 85.2 % | no |
| Rendimiento | Día de planta · PET1: Análisis de paradas (47, con sopladas) | 85.9 % | 85.2 % | **SÍ** |
| OEE | Día de planta · PET1: Nuevo registro, Gráficos (06, calidad 100 %) | 76.4 % | 76.4 % | no |
| OEE | Día de planta · PET1: Excel general (14, promedio por horas) | 76.4 % | 76.4 % | no |
| OEE | Día de planta · PET1: Análisis de paradas (47, con calidad por botellas) | 76.3 % | 76.4 % | **SÍ** |
| Cumplimiento | Día de planta · PET1: Nuevo registro, Historial, Excel general (06/07/14: programada del registro) | 90.8 % | 90.8 % | no |
| Cumplimiento | Día de planta · PET1: Resumen, bloque «Planta» (09: programaciones) | 90.8 % | 90.8 % | no |
| Cumplimiento | Día de planta · PET1: Semáforo y Paletas (turno en curso: Paletas ÷ programado) | 89.4 % | 89.4 % | no |
| Cumplimiento | Día de planta · PET1: Semáforo y Paletas con el turno CERRADO (hoy sigue usando Paletas; el módulo usa el registro del turno) | 89.4 % | 90.8 % | **SÍ** |
| Merma | Día de planta · PET1: Excel general (14) y merma por línea (09) | 2.5 % | 2.5 % | no |
| Merma | Día de planta · PET1: Resumen, bloque «Planta» (09) | 2.5 % | 2.5 % | no |
| Horas efectivas | Día de planta · PET2: Nuevo registro, Historial, Gráficos (06) | 5.50 h | 5.50 h | no |
| Horas efectivas | Día de planta · PET2: Resumen, bloque «Planta» (09) | 5.50 h | 5.50 h | no |
| Horas efectivas | Día de planta · PET2: Semáforo, Avance, Análisis (23b/29/47) | 5.50 h | 5.50 h | no |
| Ratio (UND/h) | Día de planta · PET2: Nuevo registro, Historial, Gráficos (06) | 2,909 | 2,909 | no |
| Ratio (UND/h) | Día de planta · PET2: Resumen, bloque «Planta» (09) | 2,909 | 2,909 | no |
| Ratio (UND/h) | Día de planta · PET2: Semáforo (23b) | 2,909 | 2,909 | no |
| Disponibilidad | Día de planta · PET2: Nuevo registro, Gráficos (06, por registro) | 78.6 % | 78.6 % | no |
| Disponibilidad | Día de planta · PET2: Excel general y gráficos del Resumen (14 y 09, promedio por horas) | 78.6 % | 78.6 % | no |
| Disponibilidad | Día de planta · PET2: Análisis de paradas (47) | 78.6 % | 78.6 % | no |
| Rendimiento | Día de planta · PET2: Gráficos del Resumen (09, con tope 100 %) | 100.0 % | 116.4 % | **SÍ** |
| Rendimiento | Día de planta · PET2: Análisis de paradas (47, con sopladas) | 116.4 % | 116.4 % | no |
| OEE | Día de planta · PET2: Nuevo registro, Gráficos (06, calidad 100 %) | 78.6 % | 91.4 % | **SÍ** |
| OEE | Día de planta · PET2: Excel general (14, promedio por horas) | 78.6 % | 91.4 % | **SÍ** |
| OEE | Día de planta · PET2: Análisis de paradas (47, con calidad por botellas) | 89.1 % | 91.4 % | **SÍ** |
| Cumplimiento | Día de planta · PET2: Nuevo registro, Historial, Excel general (06/07/14: programada del registro) | 80.0 % | 80.0 % | no |
| Cumplimiento | Día de planta · PET2: Resumen, bloque «Planta» (09: programaciones) | 80.0 % | 80.0 % | no |
| Cumplimiento | Día de planta · PET2: Semáforo y Paletas (turno en curso: Paletas ÷ programado) | 80.0 % | 80.0 % | no |
| Cumplimiento | Día de planta · PET2: Semáforo y Paletas con el turno CERRADO (hoy sigue usando Paletas; el módulo usa el registro del turno) | 80.0 % | 80.0 % | no |
| Merma | Día de planta · PET2: Excel general (14) y merma por línea (09) | 2.5 % | 2.5 % | no |
| Merma | Día de planta · PET2: Resumen, bloque «Planta» (09) | 2.5 % | 2.5 % | no |
| Disponibilidad | Día de planta · PLANTA: Excel general y gráficos (promedio ponderado por horas efectivas) | 84.6 % | 84.2 % | **SÍ** |
| OEE | Día de planta · PLANTA: Excel general (promedio ponderado) | 77.4 % | 84.3 % | **SÍ** |
| Cumplimiento | Día de planta · PLANTA: Excel general (programada del registro) | 84.5 % | 84.5 % | no |
| Merma | Día de planta · PLANTA: Resumen (tarjeta) | 2.5 % | 2.5 % | no |
| Estado de línea | PET 1 con una programación finalizada y otra pendiente: Resumen «Estado actual de planta» (09) | FINALIZADA | PENDIENTE | **SÍ** |
| Estado de línea | PET 1 detenida y otra en pausa: Resumen (09) | DETENIDA | DETENIDA | no |
| Día operativo y turno | 10/10 a las 03:00: semáforo (24) | 2026-10-09 NOCHE | 2026-10-09 NOCHE | no |
| Día operativo y turno | 10/10 a las 03:00: Avance y Paletas (fecha de calendario: 29 y 16) | 2026-10-10 | 2026-10-09 | **SÍ** |
| Día operativo y turno | 10/10 a las 03:00: cronómetro de turno (17) | NOCHE | NOCHE | no |
| Día operativo y turno | 10/10 a las 06:59: semáforo (24) | 2026-10-09 NOCHE | 2026-10-09 NOCHE | no |
| Día operativo y turno | 10/10 a las 06:59: Avance y Paletas (fecha de calendario: 29 y 16) | 2026-10-10 | 2026-10-09 | **SÍ** |
| Día operativo y turno | 10/10 a las 06:59: cronómetro de turno (17) | NOCHE | NOCHE | no |
| Día operativo y turno | 10/10 a las 07:10: semáforo (24) | 2026-10-10 DÍA | 2026-10-10 DÍA | no |
| Día operativo y turno | 10/10 a las 07:10: Avance y Paletas (fecha de calendario: 29 y 16) | 2026-10-10 | 2026-10-10 | no |
| Día operativo y turno | 10/10 a las 07:10: cronómetro de turno (17) | NOCHE (tolerancia) | DÍA | **SÍ** |
| Día operativo y turno | 10/10 a las 14:00: semáforo (24) | 2026-10-10 DÍA | 2026-10-10 DÍA | no |
| Día operativo y turno | 10/10 a las 14:00: Avance y Paletas (fecha de calendario: 29 y 16) | 2026-10-10 | 2026-10-10 | no |
| Día operativo y turno | 10/10 a las 14:00: cronómetro de turno (17) | MANANA | DÍA | no |
| Día operativo y turno | 10/10 a las 22:30: semáforo (24) | 2026-10-10 NOCHE | 2026-10-10 NOCHE | no |
| Día operativo y turno | 10/10 a las 22:30: Avance y Paletas (fecha de calendario: 29 y 16) | 2026-10-10 | 2026-10-10 | no |
| Día operativo y turno | 10/10 a las 22:30: cronómetro de turno (17) | NOCHE | NOCHE | no |
| Día operativo y turno | 10/10 a las 00:15: semáforo (24) | 2026-10-09 NOCHE | 2026-10-09 NOCHE | no |
| Día operativo y turno | 10/10 a las 00:15: Avance y Paletas (fecha de calendario: 29 y 16) | 2026-10-10 | 2026-10-09 | **SÍ** |
| Día operativo y turno | 10/10 a las 00:15: cronómetro de turno (17) | NOCHE | NOCHE | no |

**16 de 84 combinaciones cambian.**

## Pantallas que ya dan el mismo número (no cambian)

- Cabecera del Resumen general, sus tarjetas y el Impacto económico: ya usan las mismas definiciones (49 y 50).
- Semáforo, Avance, proyección y alertas: ya usan el ratio de 23b (horas efectivas y ratio).
- Merma: todas las pantallas ya usan suma de mermas ÷ producción efectiva.
- Asistencia: no se toca (A1).

## Dónde cambia y por qué

1. **OEE y rendimiento en Análisis de paradas (47):** hoy usa las sopladas y una calidad calculada con las botellas de merma; el módulo no tiene calidad («Calidad: no se mide») y usa el ratio sobre la producción efectiva.
2. **OEE, rendimiento y disponibilidad de PLANTA en el Excel general y los gráficos del Resumen:** hoy promedian por horas efectivas y topan el rendimiento en 100 %; el módulo suma los tiempos de todas las partes y no topa (si pasa de 100 % avisa «revisar velocidad estándar»).
3. **Cumplimiento de un turno cerrado en el semáforo y Paletas:** hoy sigue usando Paletas; la definición pide el registro del turno.
4. **Estado de línea en el Resumen:** hoy toma el primer estado que encuentra (una programación finalizada hace que se vea FINALIZADA aunque haya otra pendiente); el semáforo da prioridad a la pendiente.
5. **Fecha en Avance y Paletas (29 y 16):** hoy usan la fecha de calendario del equipo; entre 00:00 y 07:00 el día operativo sigue siendo el anterior.
6. **Cronómetro de turno (17):** mantiene NOCHE hasta las 07:20 (tolerancia); el módulo cambia a DÍA a las 07:00, como el semáforo.
