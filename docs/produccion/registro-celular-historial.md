# Registro de producción · celular e Historial (auditoría 2026-11-05, punto 4 · partes 3 y 4)

## Parte 3 · celular
- **Secciones plegables** en cada producción: Paradas programadas, Paradas no programadas, Mermas, Lotes de insumo usados, Insumos y Personal del turno. El encabezado muestra un resumen («1 · 25 min», «2 ítems · 4,1 kg», «1 marcado», «3 personas»). En el celular empiezan **cerradas**; en PC, abiertas. Lo que cada persona abre o cierra se recuerda mientras está en el reporte. Los botones del encabezado (p. ej. «+ Agregar») siguen funcionando sin plegar. Ir a un dato que falta abre su sección.
- **Tablas como tarjetas** en el celular (≤ 640 px): cada fila es una tarjeta y cada dato lleva el nombre de su columna; los campos ocupan el ancho y tienen 44 px de alto. Ya no se salen de la pantalla.
- **Botones ✕ de 44 px** y **nombre accesible** en cada campo (de su columna o de su etiqueta).
- Todo se aplica después de cada dibujado (`plegablesYTarjetasRegistro`, desde `prepararCamposRegistro`), sin cambiar los datos ni las funciones que guardan.

## Parte 4 · Historial
- Filtros nuevos: **Desde / Hasta** (rango de fechas) y **Marca**, además del día, turno y estado de siempre. «×» limpia todos.
- **Resumen** de lo filtrado: «N reportes · X UND producidas (filtrado)».
- **⬇ Exportar Excel** de exactamente lo que se ve: una fila por producción (fecha, turno, línea, estado, n.º, marca, presentación, lote, horas, programada, efectiva, minutos de paradas, registrado y finalizado por) con totales. Con filtro de marca, solo esa marca.
- Funciones: `histMarcasRegistro`, `histFilaPasaFiltros`, `histFilasExcel`, `histExportarExcel` (07-historial.js).

Prueba: `tests/registro-celular-historial.test.js`.
