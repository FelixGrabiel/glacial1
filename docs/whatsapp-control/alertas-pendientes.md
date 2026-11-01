# Alertas de pendientes por WhatsApp (guía para quien mantiene `glacial-whatsapp`)

La página ya calcula dos avisos y los entrega listos; el bot solo decide **cuándo** mandarlos.

| Aviso | Función en la página | Texto del grupo |
|---|---|---|
| Reportes sin finalizar | `window.glacialAvisos.pendientesFinalizar()` | «⚠️ REPORTES SIN FINALIZAR» |
| Falta entregar el turno | `window.glacialAvisos.pendientesEntrega()` | «⚠️ FALTA ENTREGAR EL TURNO» |

Ambas devuelven `{ total, items:[{id, nivel, texto, …}], mensaje }`. `pendientesEntrega()` trae además `listo:false` mientras la lista de entregas no ha cargado (en ese caso no se envía nada).

**Cómo usarlo:** copiar `docs/whatsapp-control/alertas-pendientes.js` al bot y llamar a `decidir(...)` cada 30 minutos (ejemplo en el encabezado del archivo). Decide:
- **Un solo mensaje agrupado**, nunca uno por reporte.
- **Sin repetir:** un aviso ya enviado solo vuelve si pasó a rojo o pasaron 4 horas.
- **Silencio de 22:00 a 06:00** (hora de Lima).
- **Tope de 12 mensajes por día.**
- Si la página no cargó o dio error, no se llama a `decidir` y no se envía nada.

El archivo está probado (`tests/bot-alertas.test.js`). Enviar al grupo de supervisores/operaciones, no a todos. Las fechas de inicio y umbrales se ajustan en la pantalla de umbrales de la página (Administrador y Jefatura): `finalizarGraciaMin`, `entregaGraciaMin`, `entregaDesde`.
