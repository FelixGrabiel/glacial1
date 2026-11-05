# Registro de producción · números confiables (auditoría 2026-11-05, punto 1)

Auditoría del Registro de producción con los datos reales de PRODUCCIÓN: 147 registros, 81 sin finalizar, 23 grupos línea + fecha + turno
con 2 a 5 registros, 60 % de cuadros vacíos. Este cambio corrige los números; el guardado, la limpieza de datos y la pantalla van aparte.

| Problema | Corrección | Dónde |
|---|---|---|
| Resumen, indicadores, Cierre, Producción actual, gráficos y reportes sumaban también los borradores y los registros repetidos (PET2 15/10 Noche: hasta 5 veces) | Solo cuenta el **registro oficial** de cada línea + fecha + turno: el último FINALIZADO; si no hay, el último actualizado. Los reportes antiguos separados de Día e Intermedio cuentan los dos. **Dos FINALIZADOS del mismo turno que se complementan** (ninguna marca repetida y horarios que no se cruzan más de 30 min, todos los cuadros con hora) **cuentan los dos**: un reporte admite 4 cuadros y una 5.ª marca va en otro reporte (caso PET2 06/10). El Historial y el formulario siguen viendo todos | `GlacialIndicadores.registrosOficiales` y `loadRecordsOficiales()` (45-indicadores.js), usados en 08, 09, 14, 23b, 24, 29, 46, 47, 49, 72, 73 y 91 |
| El autollenado cargaba el total de Paletas y de la programación en cada cuadro del mismo producto (BELLS en dos cuadros: 7 578 en vez de 3 978) | Se cargan solo en el primer cuadro del producto; los siguientes muestran «Mismo producto que la Producción N» | 35-autollenado-registro.js, 06-registro.js |
| B20L guarda «Bidones disponibles» en `produccion.sopladas` y entraba a calidad, rendimiento y OEE | Las sopladas solo cuentan en `LINEAS_CON_SOPLADAS` (PET1, PET2, B7L) | `calcDerivedCuadro(cuadro, linea)`, `calcDerivedMulti`, `calcDerivedLegacy` (06) y sus llamadas en 08 y 14 |
| El cumplimiento contaba lo producido fuera del plan (160 % donde Producción actual daba 100 %) | Numerador: solo lo producido en cuadros con programada > 0 | `calcDerivedMulti` (06) |
| Resumen e indicadores sumaban los acumulados de Paletas fila por fila (1 296 + 1 620 = 2 916 en vez de 1 620) y avisaban diferencias falsas | `glacialPaletasProducidas`: el producido del módulo de Paletas, una vez por producto y bloque | 16-paletas.js, 09-resumen.js, 49-resumen-indicadores.js |
| Un reporte de NOCHE nacía con el cuadro 1 de 07:00 a 19:00 | Horas por defecto del bloque configurado (`horasDefectoCuadro`); al cambiar el turno, las horas que nadie editó pasan a las del turno nuevo | 06-registro.js |
| Se finalizaban datos imposibles | «Falta para finalizar» bloquea: valores negativos, inicio = fin, cuadro más largo que el turno (+1 h), paradas que suman más que el cuadro, efectiva más del doble de la capacidad a velocidad estándar, efectiva más de 50 % mayor que las sopladas. Umbrales elegidos con los datos reales (no marcan diferencias normales) | `datosImposiblesCuadro` (06) |
| La lista de faltantes numeraba los cuadros por posición | Usa el número real del cuadro | `validarReporteParaFinalizar` (06) |

Prueba: `tests/registro-numeros-confiables.test.js`.

Pendiente (siguientes puntos de la auditoría): edición simultánea del mismo reporte, borrador que reabre un finalizado, permisos en el servidor,
eliminación con confirmación y registro; revisar con el dueño los 81 registros abiertos y los 23 repetidos; rediseño del formulario.
El cuadro 1 sigue naciendo con la primera marca y presentación de la lista (se corrige en el rediseño: llenarlo desde la programación).
