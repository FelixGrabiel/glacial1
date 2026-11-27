# Vista previa en Excel · editar y guardar correcciones

**Archivos:** `js/nucleo/46-vista-excel.js` · migración `supabase/migraciones/glacial_71_excel_correcciones.sql` · pruebas `tests/vista-excel.test.js`, `tests/vista-excel-editar.e2e.js` y `supabase/pruebas/excel_correcciones.sql`.

## Qué hace
- En cualquier vista previa de Excel (Asistente: Hielo cubos/premium/vasos, Resumen general y por línea; Reporte diario de producción), **«✎ Editar»** permite tocar una celda y escribir. Las celdas con fórmula no se editan (se recalculan al abrir el Excel).
- Cada corrección **se guarda sola en el sistema** (glacial_71): reporte (= nombre del archivo, p. ej. `Reporte-diario-Hielo-2026-11-26-dia`), hoja, celda, valor, **valor original** que generó el sistema, quién y cuándo, con historial.
- Al volver a abrir ese reporte —en cualquier equipo— o al descargarlo (desde la vista o con el botón directo del módulo Hielo, del Asistente, del Resumen general o del Reporte diario), las correcciones se aplican y se marcan en amarillo (al pasar el dedo/ratón: quién, cuándo y el valor del sistema).
- **Si el dato del sistema cambió después** (el original ya no coincide), esa corrección no se aplica y la vista lo avisa.
- **Quitar una corrección:** escribir el valor original.
- No cambia los registros de origen (registros, paletas, paradas, reportes de Hielo): corrige el Excel del reporte.
- Permisos: ver correcciones = quien ve reportes (`ctx.resumen`); guardar = quien opera (`ctx.opera`). Sin glacial_71 aplicada, la edición solo va en la descarga y la vista lo dice.

## Estado
- glacial_71 aplicada en **PRUEBAS** (27/11/2026, prueba SQL 9/9). **No** en producción.
