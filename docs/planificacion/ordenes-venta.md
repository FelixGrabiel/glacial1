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

## Adaptación a la hoja real de Ventas (COSTO X PALETA)

- **Una orden = OC + producto.** Una OC trae varias filas (una por producto); cada fila es una orden. Reimportar actualiza, no duplica.
- **Columnas reconocidas:** OC, TIENDA, FECHA EMISION, FECHA ENTREGA, PRODUCTO, UND SOLICITADAS, UND DESPACHO / UND ENVIADA (despachado), OBS / DEVOLUCION (observaciones). NNSS se ignora.
- **Varias pestañas:** cada pestaña (cadena: MAKRO, SPSA, CEN, TAMBO…) se lee con sus propios encabezados; la cadena sale del nombre de la pestaña. Las pestañas ocultas vienen sin marcar al importar.
- **Equivalencias de producto:** el texto de la hoja («SCALA-AGUA-SIN-GAS-BT-1-L») se traduce a línea + marca + presentación con una tabla guardada. Los productos sin equivalencia se avisan en la vista previa, con una sugerencia, y esas filas no se importan hasta confirmarlas. Se editan en «Conexión con Google Sheets».
- **Fecha de corte:** solo entran órdenes con entrega desde esa fecha (se guarda en la configuración y también se puede cambiar al importar).
- **Despachado:** lo ya enviado no necesita producción. La cobertura (programado / producido / falta) se calcula sobre lo pendiente (solicitado − despachado). Totalmente despachada → estado «Despachada». Tarjeta «Nivel de servicio» = despachado / solicitado (sin canceladas).
- **OBS «OC CANCELADA»** crea la orden como cancelada.
- Pendiente: la lectura directa de Google Sheets (el stock del almacén tampoco se descuenta aún del «falta programar»).

## Con el libro real «COSTO X PALETA»

- **Pestañas:** al importar se marcan las pestañas visibles que traen las columnas de ventas (SPSA, MAKRO, CEN, TAMBO…); las de stock, NNSS, resumen y las ocultas quedan sin marcar. Un libro sin esas columnas (p. ej. el de stock de inventario) se rechaza con un mensaje.
- **Año:** por la fecha de entrega, no por el nombre de la pestaña (la pestaña «SPSA 2025» trae entregas hasta 2026). Si hay entregas de 2026 → corte 1-ene-2026; si no, 1-ene-2025.
- **Equivalencias:** 45 textos de producto distintos en el libro; llegan sugeridos (marca con gas/sabor, formato, caja/bidón). Una orden se compara por **marca + formato** (625 ml, 1 L, 2.5 L, 7 L, caja 20 L…), no por el pack ni por la/ln.
- **Vencidas:** una orden sin despachar con más de N días de atraso (30 por defecto, configurable) pasa a «Vencida sin atender»: no cuenta como atraso ni reserva programaciones. Con el libro real hubo ~12 000 líneas de 2026: 710 atrasadas recientes y ~2 800 vencidas.
- Filas de totales o relleno (sin OC, tienda ni fecha) se ignoran.
- Prueba con libros reales: `GLX_VENTAS=/ruta/libro.xlsx GLX_XLSX=…/xlsx.full.min.js GLX_LIBS=… node tests/planificacion-ordenes-venta-xlsx.e2e.js`.
