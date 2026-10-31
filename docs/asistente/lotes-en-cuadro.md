# Etapa 2 · Entrega a línea, lotes en el cuadro, uso y peso final

**Para qué:** que las columnas de lote del Control de proceso (E L.PREFORMA, I L.TAPA, K LOTE etiqueta, M LOTE ASA) se llenen solas, sin escribir lotes a mano.

**Flujo**
1. **Entrega a línea** (Asistente de Producción / Administrador): Asistente › Lotes › ficha del lote › botón **«Entregar a línea»** en cada unidad que está en almacén. Se elige la línea. La unidad pasa a «Entregada a línea» y queda un movimiento `ENTREGA_LINEA` que no se edita. **Un lote vencido no se entrega** (la unidad se puede marcar como observada); si no tiene fecha de vencimiento se avisa. El aviso «por vencer» solo existe cuando se define `diasAvisoVencimiento` en los parámetros (no se inventó ningún umbral).
2. **Lotes usados en el cuadro** (supervisor): en cada cuadro del reporte, panel **«Lotes de insumo usados»** con los lotes de preforma, tapa, etiqueta y asa que tienen unidades en su línea. Marca los que usó. Se guarda en `cuadro.lotesInsumo[]` = `{loteId, loteProveedor, categoria, insumo, unidadIds, fechaVencimiento}`. Un cuadro finalizado no se puede cambiar.
3. **Control de proceso:** el Excel y la copia a Drive leen `lotesInsumo` por su categoría (`preformas`→E, `tapas`→I, `etiquetas`→K, `asas`→M); varios lotes en un cuadro salen unidos con « + ».

**Etapa 2b: uso y peso final (supervisor)**
- En el mismo panel, cada unidad del lote marcado muestra su estado y su botón: **«Marcar en uso»** (ENTREGADA_LINEA → EN_USO, queda el cuadro) y, ya en uso, **«Registrar peso final»**: *se consumió completa* (CONSUMIDA, peso 0) o *sobró* (vuelve a almacén con el peso que queda: mayor que 0 y no mayor que el que tenía; devolución parcial). Cada acción es una transacción (unidad + movimiento inmutable `USO_CUADRO`, `CONSUMO` o `DEVOLUCION` con los kg consumidos). Archivos: `87` (planUsoEnCuadro, planCierreUnidad), `93-lotes-uso-cuadro.js`.
- **Parámetros** (Asistente › Lotes › «Parámetros de lotes», solo quien crea lotes): *días de aviso de vencimiento* (vacío = sin aviso; si se define, la lista y la ficha marcan «Vence en N d») y *la foto debe traer leyenda*.

**Servidor**
- `glacial_38`: los supervisores LEEN lotes y unidades.
- `glacial_39`: los supervisores pueden, sobre una unidad, SOLO pasar ENTREGADA_LINEA → EN_USO (misma línea) y EN_USO → CONSUMIDA / EN_ALMACEN con el peso entre 0 y el anterior, tocando solo estado, línea, bloque, fecha, cuadro, peso, rev, actualizadoPor, actualizadoEn e historial; y crear solo movimientos USO_CUADRO, CONSUMO o DEVOLUCION. Aplicadas en PRUEBAS; **PRODUCCIÓN pendiente**. Sin ellas el panel no aparece (lectura) o avisa que falta el permiso (acciones) y no cambia nada.

**Lo que sigue sin hacerse**
- **Tolerancia de consumo:** no tiene una definición única (peso contra unidades, por cuadro o por turno), así que no se implementó ni se inventó un número. Cuando se defina cómo medirla, se agrega.
- **Etapa 3, copia a Drive:** construida y probada con un Google simulado; falta que tú publiques el Apps Script y cargues las claves (ver `control-proceso-drive.md`).

Archivos: `87` (estadoVencimiento, planEntregaLinea, planUsoEnCuadro, planCierreUnidad), `88` (entregarALinea, guardarParametros), `89` (botón, parámetros, vencimiento), `92-lotes-en-cuadro.js` (panel), `93-lotes-uso-cuadro.js` (acciones), `06-registro.js` (lo muestra). Prueba: `tests/lotes-en-cuadro.test.js`.
