# Planificación · mejora del diseño visual

Solo cambia la presentación: no se tocó ninguna lógica, dato, regla ni permiso. Mismos textos y mismas acciones; los colores de estado siguen siendo los de Producción Actual.

## Qué cambió
| Zona | Antes | Ahora |
|---|---|---|
| Pestañas | Subrayado simple | Control segmentado (pastilla blanca sobre fondo gris azulado); en celular se desplaza sin saltar de línea |
| Barra de Programación | Controles sueltos | Tarjeta con: fecha, grupo «Día anterior · Hoy · Día siguiente», selector de bloque en dos líneas (nombre + horario) y acciones agrupadas a la derecha |
| Resumen del bloque | No existía | **Cuatro tarjetas**: Programado, Producido, Pendiente (con sobreproducción) y **Atención** (líneas que no caben, sin registro, estimaciones incompletas, reprogramaciones, solicitudes pendientes). Las UND de líneas distintas se suman solo como referencia y lo dice |
| Tabla de Programación | 12 columnas, mucho desplazamiento horizontal | 11 columnas (las UND por paleta pasaron bajo «Paletas»), cabeceras en mayúsculas pequeñas, borde de color por línea, filas alternas por línea, barra de avance (naranja en curso, verde al llegar al 100 %), estados con punto de color, botones alineados |
| Capacidad | Tabla | **Tarjetas por línea**: porcentaje grande, barra de carga, tiempos (producción, cambios, disponible, holgura) y, si falta un dato, el aviso en gris |
| Secuencia | Tabla | **Barra de tiempo del bloque** con un tramo por producto (hueco = cambio), eje de horas y marca roja si pasa del fin del bloque; la tabla de tramos queda en «Detalle de tramos» |
| Vista semanal | Texto suelto | Carga como etiqueta de color (verde, amarillo, rojo, gris «incompleta») |
| Formularios y diálogos | Planos | Bordes y sombras suaves, foco visible, título con separador, acciones separadas |
| **Celular (≤ 640 px)** | Tabla con desplazamiento | **Una tarjeta por producto** con etiquetas (Marca, Cantidad, Paletas, Producido, Pendiente, Avance, Estado) y botones debajo; subtotales y líneas sin programación también como tarjetas; botones de 40 px |

## Archivos
`js/produccion/52-planificacion-pantalla.js` (estilos, barra, tarjetas de resumen, tabla), `65-planificacion-capacidad.js` (capacidad y secuencia), `53-planificacion-catalogo.js` (etiqueta de carga), `index.html` (versión `?v=20261011-pl4`), `tests/visual/planificacion.html` y `tests/visual/vista-ancha.html` (para ver escritorio y celular).

## Qué probé
- Las 4 suites de Planificación y las demás (42) siguen pasando: los textos y las clases que comprueban se conservaron.
- Navegador, datos de prueba: vista de escritorio a 1180 px (la tabla de Programación ya no necesita desplazamiento horizontal a 1098 px de contenedor), vista de celular a 560 px (tarjetas por producto, subtotales, líneas sin programación, avance con «Meta alcanzada»), tarjetas de capacidad, barra de secuencia SCALA → BELLS → SCALA, vista semanal.

## Qué NO pude probar
- La página real de GLACIAL (con su menú lateral, tipografías y CSS global): las pruebas visuales usan una página de validación con estilos mínimos para `.btn`. Conviene mirar PRUEBAS con tus cuentas y un celular real.
- Anchos intermedios de tablet y navegadores distintos de Chromium.
- Pestañas Catálogo, Solicitudes y Cumplimiento: heredan los estilos de tabla y de campos, pero no se rediseñaron una por una.
