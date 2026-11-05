# Registro de producción · una marca a la vez (auditoría 2026-11-05, punto 4 · parte 1)

## Qué cambia en la pantalla
- **Pestañas de marca** arriba de las producciones: «1 · Glacial», «2 · Aro ✓»… Solo se ve la producción elegida (antes, las 4 a la vez: en celular la página medía ~12 400 px; ahora ~5 300 px).
- Las pestañas muestran las producciones en uso (con marca, producción, paradas o finalizadas). **«+ Agregar marca»** abre la siguiente (máximo 4) y le pone el **siguiente producto de la programación** que aún no está en el reporte.
- **«✕ Quitar esta producción»** en la última pestaña agregada, solo si no tiene producción efectiva ni paradas (no borra datos).
- **Cuadro 1 desde la programación:** en un reporte abierto, si el cuadro 1 todavía tiene la 1.ª marca del catálogo (puesta por defecto), toma el producto programado del turno: el que está en curso; si no, el primer pendiente. Si el supervisor ya eligió la marca, no se toca. Sin programación, queda como antes.

## Cómo funciona
- Los 4 cuadros siguen en el reporte y en la página (todo lo que los busca por `data-cuadro-index` sigue igual); solo cambia cuál se ve. Cambiar de pestaña no redibuja el formulario (no se pierde lo que se escribe).
- La pestaña elegida y las agregadas son solo de la pantalla (`_vistaCuadros`); no se guardan en el reporte.
- `blankCuadro` marca el cuadro 1 con `marcaPorDefecto: true`; elegir marca o presentación lo pone en `false` (se usa `false`, no se borra, para que la mezcla de versiones no lo reponga).
- Funciones: `cuadrosVisiblesRegistro`, `seleccionarCuadroRegistro`, `agregarMarcaRegistro`, `quitarMarcaRegistro`, `productosProgramadosRegistro`, `siguienteProductoProgramado`, `cuadro1DesdeProgramacion` (06-registro.js); el autollenado (35) llama a `cuadro1DesdeProgramacion`.
- Prueba: `tests/registro-una-marca-a-la-vez.test.js`.
