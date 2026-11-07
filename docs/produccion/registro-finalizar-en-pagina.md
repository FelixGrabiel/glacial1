# Registro de producción · números vacíos, finalizar en la página y barra fija (auditoría 2026-11-05, punto 4 · parte 2)

## Qué cambia en la pantalla
- **Números vacíos:** los campos numéricos editables que valen 0 se ven vacíos, con un «0» gris de referencia, y abren el teclado numérico en el celular. El dato guardado no cambia (un campo vacío vale 0 en todos los cálculos, como antes). Los campos de solo lectura (p. ej. Paletas automático) siguen mostrando su valor.
- **Lo que falta, en la página:** la lista «Falta para finalizar (N)» del estado del reporte tiene un enlace por dato: abre la pestaña de esa producción, lleva al campo (Marca, Presentación, Hora inicio/fin, Sopladas, paradas, fotos de Producto Terminado), lo resalta en rojo y deja el cursor ahí. Cada pestaña de producción muestra cuántos datos le faltan. «Finalizar reporte» y «Finalizar marca» ya no abren una ventana con la lista: llevan al primer dato que falta.
- **Barra fija abajo:** «✓ Guardado · hace 30 s · se guarda solo» (o «Cambios sin guardar», «Guardando…», «No se pudo guardar»), **«Revisar (N)»** y **«✓ Finalizar reporte»**. En PC tiene el ancho del contenido (no tapa el menú); el botón «Avance / Cierre» sube para quedar encima. En un reporte finalizado o en modo VISUALIZAR solo muestra el estado.
- **Indicadores con «—»:** mientras no hay producción efectiva, Disponibilidad, Rendimiento, OEE, Cumplimiento y Producción efectiva muestran «—» en gris (antes 100 % y 0 % en rojo). El cumplimiento también queda en «—» si no hay programado.

## Cómo funciona
- `prepararCamposRegistro()` corre después de cada dibujado del formulario (envoltura `instalarPrepararCamposRegistro` sobre `renderFormTab`): vacía los ceros, pone `inputmode` y agrega la barra.
- `destinoFaltanteRegistro(texto)` traduce cada texto de `validarReporteParaFinalizar()` a {pestaña, campo}; `irAFaltanteRegistro(texto)` lleva y resalta (y vuelve a aplicarse si un guardado redibuja el formulario justo después).
- El estado de la barra sigue a `actualizarIndicadorGuardado` (envuelta) y se refresca cada 10 s.
- `kpisRegistroHtml(d)` dibuja los indicadores en el formulario y en `refreshKpisOnly`.
- Prueba: `tests/registro-finalizar-en-pagina.test.js`.
