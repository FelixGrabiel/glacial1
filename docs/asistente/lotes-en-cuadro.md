# Etapa 2a · Entrega a línea y lotes de insumo usados en el cuadro

**Para qué:** que las columnas de lote del Control de proceso (E L.PREFORMA, I L.TAPA, K LOTE etiqueta, M LOTE ASA) se llenen solas, sin escribir lotes a mano.

**Flujo**
1. **Entrega a línea** (Asistente de Producción / Administrador): Asistente › Lotes › ficha del lote › botón **«Entregar a línea»** en cada unidad que está en almacén. Se elige la línea. La unidad pasa a «Entregada a línea» y queda un movimiento `ENTREGA_LINEA` que no se edita. **Un lote vencido no se entrega** (la unidad se puede marcar como observada); si no tiene fecha de vencimiento se avisa. El aviso «por vencer» solo existe cuando se define `diasAvisoVencimiento` en los parámetros (no se inventó ningún umbral).
2. **Lotes usados en el cuadro** (supervisor): en cada cuadro del reporte, panel **«Lotes de insumo usados»** con los lotes de preforma, tapa, etiqueta y asa que tienen unidades en su línea. Marca los que usó. Se guarda en `cuadro.lotesInsumo[]` = `{loteId, loteProveedor, categoria, insumo, unidadIds, fechaVencimiento}`. Un cuadro finalizado no se puede cambiar.
3. **Control de proceso:** el Excel y la copia a Drive leen `lotesInsumo` por su categoría (`preformas`→E, `tapas`→I, `etiquetas`→K, `asas`→M); varios lotes en un cuadro salen unidos con « + ».

**Lo que NO hace todavía (siguiente paso):** no cambia el estado de la unidad al usarla (EN_USO / CONSUMIDA), no registra devolución parcial ni peso final, y no avisa por vencimiento mientras no se defina el umbral. Marcar un lote en el cuadro solo lo anota en el reporte.

**Servidor:** migración `glacial_38` — la marca «opera» (supervisores, jefes, Administrador) LEE `insumosLotes` e `insumosUnidades`; no escribe, ni lee movimientos, índice, parámetros ni evidencias. Aplicada en PRUEBAS; **PRODUCCIÓN pendiente**. Sin ella, en producción el panel del supervisor avisa que no pudo leer los lotes.

Archivos: `87` (estadoVencimiento, planEntregaLinea), `88` (entregarALinea), `89` (botón y diálogo), `92-lotes-en-cuadro.js` (panel), `06-registro.js` (lo muestra). Prueba: `tests/lotes-en-cuadro.test.js`.
