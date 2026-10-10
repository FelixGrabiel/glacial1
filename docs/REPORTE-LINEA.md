# Reporte de producción por línea (PET1, PET2, B7L, C20L, B20L)

Archivo: `js/produccion/61-reporte-linea.js` (carga después de `29-avance-produccion.js`). B20L usa el mismo diseño que B7L (bidones).

## Un solo modelo, congelado
`glacialReporteLinea.modelo(línea, ctx)` se calcula UNA vez al generar el avance o cierre y se guarda dentro del snapshot (`lineas[].reporte`, `version: 1`). Pantalla, PNG y texto leen ese snapshot; abrir o exportar un histórico no consulta la hora actual ni recalcula. Los snapshots anteriores no tienen el modelo: no muestran el botón del reporte.

Contenido: encabezado (estado CERRADO solo si es el cierre del bloque; avance o relevo = PARCIAL), resumen (programado, producido, pendiente, excedente aparte, cumplimiento, ratio, tiempo efectivo, tiempo transcurrido, paradas), franja (transcurrido, paradas, personal y horas hombre de la Distribución de personal), producción por marca, indicadores, producción por hora, paradas, insumos y mermas, acciones.

## Reglas
- Ratio, tiempos y paradas = los del snapshot (23b). Pendiente = máx(0, programado − producido); el excedente se muestra aparte.
- Marcas suman el total producido. Paradas mostradas = paradas descontadas (programadas + no programadas); si la suma listada difiere (solapes, estándar), se avisa.
- Disponibilidad = (planificado − no programadas) ÷ planificado. Rendimiento = ratio ÷ velocidad estándar ponderada por producto (sin velocidad: «Sin datos suficientes»). OEE = disponibilidad × rendimiento (definición del sistema). **Calidad: «Sin datos suficientes»** (no hay base: no se mide). Colores según las metas configuradas.
- Producción por hora: intervalos horarios a partir de los acumulados de Paletas (único registro con hora). Intervalo sin registro = «—», no cero; Noche cruza medianoche. Si no hay registros horarios no se dibuja gráfico. Si el total del reporte usa Producción efectiva (cierre), se indica la diferencia con Paletas.
- Insumos y mermas: filas del catálogo real de la línea (`obtenerItemsMerma`). Merma = lo capturado (C20L: UND y kg calculados con los factores guardados; polietileno en kg, sin % porque no hay base). Consumo: solo lo calculado en el registro (polietileno, stretch, cartón), marcado «est.». «—» = sin registro (no hay confirmación de cero). Los factores de merma NO son recetas de consumo.
- Acciones: solo hallazgos reales (pendiente → Planificación; parada → «Por asignar»; paradas excesivas; personal pendiente). Estado «Por validar». Si no hay hallazgos, ninguna.
- Sin importes económicos.

## Imagen
Canvas de 1080 px de ancho, altura según el contenido (listas largas agrandan la imagen; no hay paginación). Logo `img/logo_glacial.png` en blanco sobre el encabezado azul marino. Desde el detalle de un avance/cierre: botón «REPORTE <línea> (PNG)» → vista previa, descargar, copiar y compartir (las mismas acciones de la imagen existente).

## Validación visual
`node tests/visual/servir.js` y abrir `http://localhost:5599/tests/visual/reporte-linea.html`: dibuja ocho reportes con datos de PRUEBA (cinco líneas, dos marcas, mermas de C20L, lista larga, personal pendiente, producción superior al programa, Noche con medianoche). Prueba automática: `tests/reporte-linea.test.js`.

## Límites
- No hay consolidado diario ni páginas adicionales; Excel sin cambios.
- La producción por hora depende de los registros de Paletas.
- El «0 confirmado» de mermas no existe como dato: un 0 se muestra «—».
- El resumen de turno de planta (`48-resumen-turno.js`) conserva su propio personal (asistencia del Tareo); no se tocó.

## Formato aprobado en el flujo real de «Exportar PNG» (pestaña Gráficos)
**Por qué seguía saliendo el formato anterior:** el reporte `Reporte_Diario_<línea>_<fecha>.png` no lo genera Avance/Cierre (`29`) sino el botón **«Exportar PNG» de la pestaña Gráficos** → `exportarPNG()` en `08-graficos.js`, que dibujaba su propio diseño (cascada, Pareto, merma, análisis). La plantilla aprobada solo estaba conectada al botón «REPORTE <línea> (PNG)» del detalle de Avance/Cierre.

**Ahora:** `exportarPNG()` → `glacialReporteRegistro.exportar()` (`62-reporte-registro.js`) → `modelo(rec, d)` → `glacialReporteLinea.dibujar()` (`61-reporte-linea.js`) → descarga `Reporte_Diario_<línea>_<fecha>.png`. El diseño anterior sigue como salida secundaria: botón «PNG con gráficos (detalle)» → `exportarPNGDetalle()`. No hay redefiniciones (una sola `exportarPNG`) ni handlers duplicados.

**Datos:** el adaptador solo presenta los valores que ya entrega el flujo (`calcDerived`, `agruparParadas`, `construirAnalisisAccionReporte`, Paletas, Distribución de personal); no recalcula nada. Calidad se muestra con su valor actual. Sin dato → «—» o «Pendiente de confirmar». Estado: CERRADO solo si el registro está FINALIZADO; si no, PARCIAL.

**Archivos a incluir al subir:** `js/produccion/08-graficos.js`, `js/produccion/61-reporte-linea.js`, `js/produccion/62-reporte-registro.js` (nuevo), `index.html`, `tests/reporte-registro.test.js` (nuevo), `tests/reporte-linea.test.js`, `docs/REPORTE-LINEA.md`, `docs/capturas-formato/*`.
