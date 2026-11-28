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
3. **Registro de producción** (28/11/2026): una tarjeta por línea.
4. **Paradas:** Paradas del turno (NUEVO, la tarjeta de Avance y cierre), Cierre por marca (NUEVO, en Paletas de la línea elegida), Bitácora de producción, Análisis de paradas.
5. **Cierre del turno:** Avance y cierre, Entrega de turno, Resúmenes de turno, Historial de registros (de la línea elegida).
6. **Personal y configuración:** Convocatoria semanal, Tareo de producción, Rotación de supervisores, Horario de producción.

## Menú lateral del grupo Producción

**28/11/2026 · todo dentro de Inicio de Producción.** Para quien tiene «Inicio de Producción», el grupo Producción del menú lateral muestra **solo «Inicio de Producción»** (clase `pi-solo-inicio`). Queda marcado mientras se trabaja en cualquier pantalla del módulo o en una línea.
Todo lo demás se abre desde Inicio:
- **Registro de producción:** nuevo grupo, primero, con una tarjeta por línea. Abre Nuevo registro, o Paletas o Historial según el permiso.
- **Avance y cierre, Paradas del turno, Entrega de turno, Convocatoria semanal, Tareo, Rotación, Bitácora, Resúmenes y Horario:** tarjetas y pasos de Inicio.

Cada pantalla trae arriba «← Inicio de Producción». La bitácora y el registro de línea no lo llevan.
Los botones del menú siguen existiendo, ocultos por CSS, porque su visibilidad decide qué tarjetas se ven. Quien no tiene Inicio conserva el menú de antes.

No cambia ninguna pantalla ni permiso: una tarjeta o un paso solo aparece si el usuario ya podía abrir esa pantalla. «Análisis de paradas» se ve si el usuario tiene ese botón (grupo Mantenimiento).

Fuera del grupo siguen igual los accesos raíz: Producción actual, Planificación y Asistente de Producción.

Pruebas: `tests/produccion-inicio.test.js` y `tests/produccion-inicio.e2e.js` (navegador real, `GLX_LIBS`).
