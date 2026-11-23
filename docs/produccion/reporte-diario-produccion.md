# Reporte diario de producción (formato de la planta)

Desde el 23/11/2026, el botón **Registro › Gráficos › 🖼️ Exportar PNG** genera el *Reporte diario de producción* con el formato de los Excel de la planta, uno por registro (línea, fecha y turno): PET1, PET2, B7L, Cajas 20L y B20L.

Código: `js/produccion/62b-reporte-diario.js` (modelo + dibujo en canvas). Pruebas: `tests/reporte-diario.test.js`.

## Contenido

1. **Encabezado**: línea, fecha, día, turno, semana ISO, juliano y estado, más cuatro cifras: producción efectiva, producción de la semana, ratio real (con paradas) y ratio sin paradas.
2. **Datos del turno**: ingreso y salida del personal (horario del bloque), número de personas (personal del registro con nombre), horas de producción, paradas y horas efectivas.
3. **Producción**: una columna por cuadro (formato) con marca, presentación, ratio nominal, lote, vencimiento, horas, paradas, programada, efectiva, sopladas/disponibles, calidad, ratio real, ratio sin paradas, diferencia por paradas, no cumplida y paletas.
4. **Nueve gráficos**: Producción, Tiempo efectivo vs. paradas, Indicadores, Mermas, Insumos, Tiempo de paradas, Producción de la semana, Sopladas/Disponibles vs. efectivos (en Cajas 20L: Total por turno) y Asistencia del personal.
5. **Tablas de la semana** (lunes a domingo, día y noche): producción, sopladas o disponibles y personal con el % del requerido.
6. **Observaciones** (una por línea) y **firmas**: líder de línea (persona del registro cuyo cargo o posición dice «Líder») y supervisor (quien registró).

## Reglas

| Dato | Cálculo |
|---|---|
| Ratio sin paradas | producción efectiva ÷ horas efectivas (el ratio oficial) |
| Ratio real (con paradas) | producción efectiva ÷ horas de producción (= «Ratio Producción Efectiva» del Excel) |
| Disponibilidad, rendimiento, calidad, OEE, cumplimiento, eficiencia, producción nominal | `calcDerived` del registro (06-registro.js), no las fórmulas del Excel |
| Color de los indicadores | metas configuradas (`glacialMetasIndicadores`) |
| Mermas | unidades ÷ producción efectiva, todos los componentes de la línea |
| Sopladas / disponibles | `produccion.sopladas` del cuadro: botellas sopladas (PET1, PET2), bidones soplados (B7L), bidones disponibles (B20L); Cajas 20L no tiene |
| Semana | registros oficiales de la misma línea, de lunes a domingo |
| Personal requerido | `sync/configIndicadores.personalRequerido`; valores iniciales PET1 7, PET2 8, B7L 11, Cajas 20L 11, B20L 5 |

El **personal requerido** (y la vida útil de la línea) lo cambian el Administrador y la jefatura con el botón **👥 Personal y vida útil** de la misma pestaña.

Lo que el registro no guarda (hora de refrigerio, jornada) no se muestra. Un dato vacío aparece como «—».

La plantilla anterior (`62-reporte-registro.js`) queda de respaldo si el archivo nuevo no carga, y «📈 PNG con gráficos (detalle)» sigue igual.

## WhatsApp y Excel (23/11/2026)

En Registro › Gráficos:

- **📲 Enviar imagen por WhatsApp** y **📲 Enviar Excel por WhatsApp**. En el celular abren el menú de compartir del teléfono con el archivo: se elige WhatsApp y el chat. En la computadora descargan el archivo y abren WhatsApp con un resumen escrito (producción, ratios, paradas, OEE y semana) para adjuntarlo. Es el mismo mecanismo que usa Hielo.
- **📊 Exportar Excel** baja el Reporte diario en Excel (`js/produccion/62c-reporte-diario-excel.js`), con tres hojas:
  - **Reporte diario**: el formato de la planta en A4 (una página de ancho). Usa **fórmulas** para horas de producción (cruza la medianoche), horas efectivas (en rojo si son negativas), ratio real, ratio sin paradas, diferencia, no cumplida y totales. Incluye indicadores con meta y semáforo, mermas con barras, insumos, paradas, personal, tablas de la semana con % del requerido, observaciones y firmas.
  - **Gráficos**: la imagen del reporte.
  - **Datos**: una fila por formato, con filtros.
- **📑 Excel detallado**: el libro anterior de 7 hojas, sin cambios.

Pruebas: `tests/reporte-diario-excel.test.js`. Con `GLX_LIBS` arma el libro con ExcelJS y revisa fórmulas, hojas e imagen; sin la librería, solo revisa la conexión con la página.
