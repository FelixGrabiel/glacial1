# Calidad en el OEE

**Fórmulas** (`js/nucleo/45-indicadores.js`)
- Calidad = botellas conformes (producción efectiva) ÷ botellas sopladas. Solo donde se registran sopladas (PET 1 y PET 2). Sin sopladas es «sin dato» (no se inventa un 100 %).
- Rendimiento = (botellas producidas ÷ horas efectivas) ÷ velocidad estándar, con las **sopladas** como producidas.
- OEE = Disponibilidad × Rendimiento × Calidad. Sin sopladas: Disponibilidad × Rendimiento.

**Por qué el OEE de un registro no cambia:** Rendimiento × Calidad = conformes ÷ producción nominal, que es lo que ya medía el OEE. Las botellas malas se descuentan una sola vez. Lo que cambia es que ahora se ve cuánto pierde cada factor: el Rendimiento mostrado sube (usa las sopladas) y aparece la Calidad.

**Dónde se ve:** reporte del turno (tarjeta y velocímetro de Calidad, escalón «− No conformes» en la cascada de pérdidas, Excel), Análisis de paradas › Base para el OEE (columna Calidad; aquí el OEE sí baja porque antes no la incluía), definiciones «¿Cómo se calcula?». Meta inicial de Calidad: verde ≥ 98 %, ámbar ≥ 95 % (editable en la tabla de metas).

**Pendiente:** Resumen de indicadores y Reporte de línea no traen las sopladas por parte; su OEE sigue igual (ya excluye las malas) y no muestran Calidad todavía.

Prueba: `tests/calidad-oee.test.js` (reemplaza a `sin-calidad.test.js`, decisión de octubre revertida por el dueño).
