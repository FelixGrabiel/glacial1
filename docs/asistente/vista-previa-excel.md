# Vista previa en Excel

Desde el 23/11/2026 la vista previa de los reportes muestra el **mismo libro de Excel que se descarga**, con el aspecto de Excel:

- pestañas de las hojas abajo, con su color;
- letras de columna y números de fila;
- celdas combinadas, colores, fuentes, bordes y formatos de número;
- resultados de las fórmulas (al pasar el cursor se ve la fórmula);
- barras de datos e imágenes;
- zoom.

Es solo lectura.

Código: `js/nucleo/46-vista-excel.js` (`glacialVistaExcel.abrir(wb, {titulo, nombre, notas, acciones, alDescargar})`). Pruebas: `tests/vista-excel.test.js`.

## Dónde se usa

- **Asistente de Operaciones › Historial › Reportes en Excel**: «Previsualizar» (Resumen general o por línea) abre el Excel, con «⬇ Descargar Excel» y «✎ Revisar y corregir». Este último lleva a la previsualización de siempre, donde se corrigen saldos de consumo y mermas pendientes; desde ahí, «Ver como Excel» vuelve a la vista del libro.
- **Registro › Gráficos › 👁 Vista previa Excel**: el Reporte diario de la línea, con «⬇ Descargar Excel» y «📲 Enviar por WhatsApp».

En el celular abre al 60 % para ver más columnas. La vista muestra hasta 1.500 filas y 60 columnas.
