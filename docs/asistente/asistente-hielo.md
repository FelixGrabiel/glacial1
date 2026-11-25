# Asistente de Producción · pestaña Hielo (25/11/2026)

Nueva pestaña **Hielo** en el Asistente de Producción (`js/asistente/99-asistente-hielo.js`). Usa la fecha y el turno del encabezado: MAÑANA + INTERMEDIO (Día + Intermedio) o NOCHE. Es **solo lectura**: los datos son los del Reporte Hielo (`glacialHieloDatos`, 97-hielo.js) y no escribe nada.

## Contenido

- **Resumen arriba:** kilos y bolsas de Hielo en cubos (con el % del programado), Premium, Vasos (con los kilos aproximados), cantidad de mermas y minutos de paradas.
- **Un bloque por producto** (Cubos, Premium y Vasos), cada uno con:
  - **Estado de cada reporte:** en registro, finalizado o sin reporte, con supervisor, horario y personas.
  - **Producción** por presentación (bolsas o vasos y kilos reales) y **por marca**, más el programado y el cumplimiento.
  - **Consumo de bolsas (o vasos) por la bolsa usada:**
    - si Tottus CD se envasó en bolsa Glacial, cuenta como bolsa Glacial («también para Tottus CD»);
    - las bolsas de la merma («Bolsas», UND) se suman a la marca de la merma en su propia fila, porque la merma no dice la presentación.
  - **Mermas, paradas y observaciones.**
  - **Vista previa Excel** y **Descargar Excel:** el mismo libro del Reporte diario de Hielo (por estación, con la bolsa usada, la merma y las gráficas) para ese producto y turno. Se abre en el visor de Excel de la página.
- **«Abrir Reporte Hielo»:** lleva al módulo de Hielo.

Los kilos usan el **peso real** de cada bolsa de la Configuración de Hielo (3 kg → 3.25 · 1.5 kg → 1.75), como el Reporte diario.

## Visor de Excel (46-vista-excel.js)

Las imágenes del libro se ubican ahora según la posición **real** de su fila y columna, una vez dibujada la hoja. Antes se sumaban los altos teóricos de las filas; como el texto ajustado agranda las filas, las gráficas quedaban encima de la tabla. Esto vale para todas las vistas previas: Asistente, Reporte diario de Producción y Hielo.

## Pruebas

- `tests/asistente-hielo.e2e.js`: estado, kilos reales, consumo por bolsa usada con merma, vasos, vista previa del Excel y gráficas debajo de la tabla, sin errores de consola.
- `tests/vista-excel.test.js` y `tests/asistente-tiempo-real.e2e.js` siguen pasando.
