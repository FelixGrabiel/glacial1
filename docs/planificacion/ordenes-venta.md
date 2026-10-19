# Planificación · Órdenes de ventas

Los pedidos de Ventas (cliente, producto, cantidad, fecha de entrega) comparados con lo **programado** y lo **producido**. Pestaña «Órdenes de ventas» de Planificación.

## Qué cambió en Planificación
| Antes | Ahora |
|---|---|
| Pestaña «Órdenes de ventas» (en realidad el catálogo de productos) | Pestaña **Órdenes de ventas** real (esta). El catálogo pasa a **«Productos y parámetros»**, dentro del grupo **Mantenimiento** del menú. |
| Pestaña «Horario de producción» | Dentro del grupo **Producción** del menú (misma pantalla). |
| Pestaña «Solicitudes» (el supervisor pedía cambios) | **Retirada.** Se pide por llamada. El código queda apagado (`SOLICITUDES_ACTIVAS=false` en `54-planificacion-solicitudes.js`) y los datos de `solicitudesProgramacion` no se tocan. El **Historial de cambios** pasó al pie de «Programación turno». |

Pestañas de Planificación hoy: Programación turno · Programación semanal · Órdenes de ventas · Cumplimiento de turno.

## Cómo se calcula
- Una orden = N.º, cliente, producto (**marca + presentación**; la línea es opcional), cantidad (UND), fecha de entrega, fecha del pedido (opcional), observaciones.
- Cada orden abierta se cubre con las programaciones **de su mismo producto**, repartidas por **fecha de entrega** (la más urgente primero; a igual fecha, la más antigua). Solo cuentan programaciones desde la **fecha del pedido** (si no hay, desde hoy − 30 días). Si la orden indica línea, solo cuentan programaciones de esa línea. Las programaciones canceladas no cubren nada.
- **Producido**: el de cada programación (`glacialProducidoVigente`, la misma regla de Producción actual), repartido en el mismo orden. Nunca modifica ninguna programación.
- **Estados** (se calculan; solo ABIERTA / CANCELADA / RETIRADA se guardan): Sin programar · Programada en parte · Programada · En producción · Completa · **Atrasada** (entrega vencida sin completar) · Cancelada · Retirada de la fuente. «Por vencer» = entrega en 3 días o menos.

## Dónde se guardan
`sync/catalogoPlanificacion` → campos **`ordenesVenta`** (lista) y **`ordenesVentaConfig`** (mapa de columnas). Es el mismo documento del catálogo, con su permiso `planificacion`; cada escritura es una transacción que conserva el resto del documento. No hay colecciones ni reglas nuevas.
- Quien tiene el permiso **Planificación** crea, edita, cancela e importa; el resto solo ve.
- Si algún día hay miles de órdenes, conviene pasarlas a una colección propia: toda la lectura/escritura está en `66v-planificacion-ordenes-venta.js` (`mutar`) y el cálculo en `66u-…-nucleo.js`.

## Excel / CSV (hoy) y Google Sheets (preparado)
Una sola ruta para todas las fuentes: `glacialPlanificacion.ventas.aplicarFuente(filas, {origen, retirarAusentes})`, con `filas = [{encabezado: valor}]`.
- **Columnas** (se reconocen por nombre habitual o por el mapa configurado en «Conexión con Google Sheets»): N.º orden · Cliente · Marca · Presentación · Cantidad (UND) · Fecha de entrega · *opcionales:* Línea · Fecha del pedido · Estado («Cancelado» cancela) · Observaciones.
- Si el **N.º ya existe** → se **actualiza** (no se duplica). Si es nuevo → se crea. Con `retirarAusentes`, la orden de una fuente que ya no aparece se marca **«Retirada»** (no se borra). Las órdenes creadas **a mano** nunca se retiran. Una orden cancelada a mano no se reabre desde la fuente.
- Las filas con error (cantidad 0, fecha inválida, N.º repetido…) se informan con su número de fila y **no** se importan. La vista previa muestra nuevas / por actualizar / sin cambios / errores antes de aplicar.
- Fechas: `2026-10-30`, `30/10/2026`, `30/10/26`, fecha de Excel o serie numérica. Cantidades: `12000`, `12,000`.

### Para conectar la hoja de Google (pendiente)
1. Una hoja con una fila por orden y las columnas de arriba (o escribir sus encabezados en el mapa).
2. Obtener las filas: lo más simple es **publicar la hoja como CSV** (Archivo → Compartir → Publicar en la web → CSV) o un **Apps Script** que devuelva JSON. Si la hoja es privada, hacerlo desde una Edge Function de Supabase (para no exponer claves en el navegador).
3. Implementar `glacialPlanificacion.ventas.fuentes.sheets.obtenerFilas = async () => [...]`, poner `disponible = true` y habilitar el botón «Sincronizar Google Sheets» (hoy apagado). `fuentes.sheets.sincronizar()` ya llama a `aplicarFuente(filas, {origen:'sheets', retirarAusentes:true})`.

## Archivos
`js/produccion/66u-planificacion-ordenes-venta-nucleo.js` (cálculo puro) · `66v-planificacion-ordenes-venta.js` (pestaña, guardado, importación) · `52b-planificacion-vistas.js` (abre «Productos y parámetros» y «Horario de producción» desde el menú) · pruebas: `tests/planificacion-ordenes-venta.test.js` y `tests/planificacion-ordenes-venta.e2e.js`.
