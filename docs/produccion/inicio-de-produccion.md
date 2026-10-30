# Inicio de Producción (módulo ordenado)

Igual que Mantenimiento: una pantalla de entrada con tarjetas por tareas (`js/produccion/67-produccion-inicio.js`, tab `prod-inicio`).

- **Cada turno:** Avance y cierre, Entrega de turno, Resúmenes de turno.
- **Personal:** Tareo de producción, Rotación de supervisores.
- **Seguimiento y configuración:** Bitácora de producción, Horario de producción.
- **Atención de hoy:** los avisos de producción del Centro de alertas (paradas, paletas, proyección, programación, tareo, reportes sin finalizar, entrega de turno).

**Menú lateral del grupo Producción:** Inicio de Producción · Registro de producción (las líneas) · Avance y cierre. Lo demás se abre desde las tarjetas; cada pantalla trae arriba «← Inicio de Producción» (la bitácora y el registro de línea no, por ser compartida con Mantenimiento y trabajo diario). No cambia ninguna pantalla ni permiso: una tarjeta solo aparece si el usuario ya tenía ese botón en el menú.

Fuera del grupo siguen igual los accesos raíz: Producción actual, Planificación y Asistente de Producción.

Prueba: `tests/produccion-inicio.test.js`.
