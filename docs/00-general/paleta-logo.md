# Paleta de colores según el logo

El logo es celeste (#0DB5F3) y blanco. Desde el 02/11/2026 la interfaz parte de ese celeste (paso 1 de la auditoría).

| Uso | Color | Variable |
|---|---|---|
| Marca (logo, franja del ítem activo, pestaña activa) | #0DB5F3 | `--brand` |
| Botones y enlaces (texto blanco, contraste 5,0:1) | #0877A6 | `--blue`, `--brand-600`, `--gl-primary` |
| Títulos y menú lateral | #033350 · #022235 | `--blue-deep` · `--blue-dark` (`--brand-900`, `--brand-950`) |
| Fondos suaves | #E8F7FE · #C6EBFC | `--blue-light` · `--blue-soft` |
| Estados (alerta, bien, mal) | ámbar, verde y rojo | sin cambios |

Rampa completa: `--brand-50` a `--brand-950` en `css/styles.css`. El celeste del logo (#0DB5F3) se usa para detalles y sobre fondo oscuro; sobre blanco no se usa como texto (contraste 2,35:1).

Paso 2 (02/11/2026): los azules escritos dentro de los módulos (JS) se llevaron a la rampa por luminosidad: marinos y azul índigo → #033350/#022235; azules de acción y azul rey → #0877A6; celestes claros → #4FC4F5; fondos claros → #E8F7FE/#C6EBFC. Se dejaron como estaban los grises azulados de texto (#172B3A, #17384d, #1b2a38) y los violetas. Quedan unos 160 usos de azules fuera de la rampa (casi todos tintas de texto y tonos de gráficos).

## Paso 3 · legibilidad (02/11/2026)
- **Tamaño de letra:** ningún texto por debajo de 11 px (184 usos de 5–10,5 px pasaron a 11 px; `<small>` no baja de 11 px; los rótulos de los gráficos de 9 px pasaron a 10 px). El modo TV (`tv-glacial.css`) no se tocó.
- **Contraste:** `--muted` #87949D → #5F7280 y `--steel` #667784 → #5C6E7B (ambos ≥ 4,5:1 sobre el fondo); texto en ámbar → #8A5A00 (5,5:1); texto en verde → #1F7A4D (4,9:1). Solo cambia el color del texto, no el de barras ni fondos.

Títulos de tarjeta (02/11/2026): `--card-title` 16 px, peso 700, azul `--blue-deep`, aplicado a las tarjetas de Tareo, Asistente, Producción actual, Resumen general e Impacto económico.

## Orden del menú (02/11/2026)
El menú de **Producción** sigue el orden del Inicio de Producción: Inicio · Registro por línea · Avance y cierre · Entrega de turno · Resúmenes de turno · Tareo · Rotación de supervisores · Bitácora · Horario. El de **Mantenimiento** sigue el suyo: Inicio · Intervenciones y equipos · Bitácora · Tareo · Análisis de paradas · Velocidades estándar · Productos y parámetros.
