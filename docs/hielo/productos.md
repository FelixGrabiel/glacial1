# Hielo Premium y Hielo en vasos (21/11/2026)

La planta de hielo ahora tiene **tres productos**: **Hielo en cubos** (el de siempre), **Hielo premium** y **Hielo en vasos**. Arriba de cada pantalla de Hielo hay un selector de producto; todas las pantallas (Inicio, Nuevo registro, Avance y cierre, Reporte diario, Historial, Programación y Configuración) muestran el producto elegido. El producto elegido se recuerda en el navegador.

**Lo de cubos no cambia**: sus reportes, sus ids (`fecha_TURNO`), su configuración y su Excel general siguen igual. La tarjeta de Hielo del Inicio general también es la de cubos.

## Qué tiene cada producto (datos de los Excel de la planta; todo editable en Configuración)
| | Cubos | Premium | Vasos |
|---|---|---|---|
| Unidad | bolsas | bolsas | vasos |
| Presentaciones | 3 kg (3.25 kg reales) · 1.5 kg (1.75 kg) | 2 kg (2 kg) · 1.8 kg (1.8 kg) | Vaso (0.25 kg) |
| Marcas | las del catálogo de cubos | Glacial (2 kg), Bell's (1.8 kg), Cuisine & Co (2 kg) | Glacial, OXXO |
| Columna extra del reporte | N° paletas (300 / 600 por paleta) | ninguna | N° jabas (35 vasos por jaba) |
| Capacidad de un turno | 34,000 kg | no se usa (0) | no se usa (0) |
| Medida principal del reporte | kg | kg | vasos (y el peso en kg) |

Premium y Vasos no calculan eficiencia mientras su capacidad sea 0. Si se anota una capacidad en Configuración, se calcula como en cubos.

## Datos nuevos que se pueden anotar (en los tres productos)
En **Nuevo registro**: por cada marca, **tiempo (h)** y **fecha de vencimiento** (opcionales); por turno, **N.º de personas** y **personal del turno** (un nombre por línea). Salen en el Reporte diario y en el Excel (las columnas «Tiempo (H)» y «F. vencimiento» y el bloque «Personal», como los Excel de la planta).

## Reportes
- **Reporte diario** de cada producto: las mismas 7 gráficas, el mismo Excel (con las columnas propias de cada producto) y la misma imagen para WhatsApp. En Vasos, las gráficas y los totales van en vasos y se muestran también el peso y las jabas. En Premium, la gráfica de presentaciones va en bolsas (como el Excel de la planta).
- **Avance y cierre** (texto de WhatsApp e imagen): con el nombre del producto y sus unidades.
- **Resumen de planta (nuevo)**: los tres productos juntos en kg reales (los vasos también en vasos y jabas): total del día, noche y día por producto, la semana apilada por producto, la mezcla de la planta en los últimos 7, 14 o 21 días, las paradas de todos los productos, imagen para descargar y compartir por WhatsApp.

## Datos y servidor
- Los reportes y programaciones de Premium y Vasos están en las mismas colecciones (`hieloReportes`, `hieloProgramacion`): llevan el campo `producto` y su id termina en `_PREMIUM` o `_VASOS`. Un reporte sin `producto` es de cubos.
- La configuración de Premium y Vasos va en `hieloParametros/config` → `productos.{PREMIUM|VASOS}` (marcas, presentaciones, pesos, capacidad, vasos por jaba). Las estaciones, equipos, motivos de parada y mermas son compartidos por los tres productos.
- **No requiere migración**: las reglas del servidor (glacial_46, 50 y 66) no miran el formato del id ni los campos nuevos. Los permisos de Hielo (`docs/hielo/permisos.md`) valen para los tres productos.
- Código: `js/hielo/97-hielo.js` (productos, registro, config), `js/hielo/99-hielo-reporte-diario.js` (reporte diario y resumen de planta). Pruebas: `tests/hielo-productos.test.js` y `tests/hielo-productos.e2e.js`.

## Dónde están Premium y Vasos (21/11/2026)
**Dentro del módulo de Hielo** (se entra por «Reporte Hielo», como siempre). No hay tarjetas ni botones aparte afuera.
- Arriba de cada pantalla hay un selector **Hielo en cubos | Hielo premium | Hielo en vasos**.
- El **menú lateral** de Hielo tiene los 3 productos arriba y, debajo, las secciones del producto elegido: Inicio, Nuevo registro, Avance y cierre, Reporte diario, Resumen de planta, Historial, Programación y Configuración.
- En **Nuevo registro** de cada producto se anotan las cantidades (bolsas o vasos), el lote, el tiempo (h), el vencimiento, el personal y las paradas.
