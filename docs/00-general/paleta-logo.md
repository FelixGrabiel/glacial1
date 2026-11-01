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
