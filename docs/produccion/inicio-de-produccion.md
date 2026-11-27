# Inicio de Producción (módulo ordenado)

Igual que Mantenimiento: una pantalla de entrada con tarjetas por tareas (`js/produccion/67-produccion-inicio.js`, tab `prod-inicio`).
**27/11/2026:** ordenado como se trabaja el turno y con lo nuevo de paradas (una sola parada, vista por marca: `docs/produccion/cierre-turno.md`).

## Pantalla

1. **Tu turno, paso a paso** (arriba). Se elige la línea con botones (por defecto la del usuario, o la última abierta) y cada paso abre su pantalla:
   1. **Nuevo registro** → registro de la línea.
   2. **Paletas** → Paletas de la línea.
   3. **+ Parada** (NUEVO) → abre Paletas de la línea y, con su fecha y turno operativos, el formulario único de paradas (`avAbrirParadas`). Solo si el usuario puede editar paradas.
   4. **Cerrar marca** (NUEVO) → Paletas de la línea, baja al panel «Cierre de turno» (`#ct-panel`).
   5. **Avance y cierre** → «Enviar cierre de turno».
   6. **Entrega de turno**.
   Un paso aparece solo si el usuario ya tiene esa pantalla (permiso de la línea o botón del menú).
2. **Atención de hoy:** los avisos de producción del Centro de alertas; también la rotación sin publicar y los reportes sin finalizar.
3. **Paradas:** Paradas del turno (NUEVO, la tarjeta de Avance y cierre), Cierre por marca (NUEVO, en Paletas de la línea elegida), Bitácora de producción, Análisis de paradas.
4. **Cierre del turno:** Avance y cierre, Entrega de turno, Resúmenes de turno, Historial de registros (de la línea elegida).
5. **Personal y configuración:** Tareo de producción, Rotación de supervisores, Horario de producción.

## Menú lateral del grupo Producción

Inicio de Producción · Registro de producción (las líneas) · Avance y cierre · **Paradas del turno** (`goParadasTurno`: abre Avance y cierre en «Paradas del turno»; se ve igual que Avance y cierre) · **Entrega de turno**.
Tareo, rotación, bitácora, resúmenes y horario se abren desde las tarjetas; cada pantalla trae arriba «← Inicio de Producción» (la bitácora y el registro de línea no).

No cambia ninguna pantalla ni permiso: una tarjeta o un paso solo aparece si el usuario ya podía abrir esa pantalla. «Análisis de paradas» se ve si el usuario tiene ese botón (grupo Mantenimiento).

Fuera del grupo siguen igual los accesos raíz: Producción actual, Planificación y Asistente de Producción.

Pruebas: `tests/produccion-inicio.test.js` y `tests/produccion-inicio.e2e.js` (navegador real, `GLX_LIBS`).
