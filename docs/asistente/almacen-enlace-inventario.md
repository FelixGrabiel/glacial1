# Asistente de Producción ↔ Inventario de insumos: descuento por entregas de Almacén

## Qué hace
Cuando Almacén **entrega** lo que Producción pidió, el stock de Almacén baja de inmediato en el Inventario de insumos, sin esperar al siguiente corte de SAP.

```
Producción solicita ──► (comprometido: no mueve stock)
Almacén entrega     ──► Insumos y Suministros −N      (libro apAlmacenMov, tipo ENTREGA)
                        queda «en tránsito» hacia Producción
Producción recibe   ──► Producción +N                 (libro apMovimientos, tipo RECEPCION: ya existía)
```

**Stock de Almacén = columna «AP - INSUMOS Y SUMINISTROS» del último corte − entregas con fecha posterior a la fecha del corte** (ignora las anuladas).
Un corte nuevo de SAP pasa a ser la base y las entregas anteriores a su fecha dejan de restar (SAP ya las trae). Las entregas del mismo día del corte se consideran incluidas en el corte.

## Unión de los dos maestros
`apInsumos.itemCode` = código SAP del artículo del catálogo del Inventario (`insumosCatalogo`). Se elige al crear/editar el insumo (Insumos → Factores → editar insumo; la lista sugiere por nombre). **Sin código SAP no hay descuento** para ese insumo.

## Reglas
- Entregar más de lo que Almacén tiene se rechaza, salvo autorización con motivo (≥ 5 caracteres) escrito en el campo «Entregar sin stock suficiente». El movimiento queda marcado `sinStock:true`.
- El movimiento se escribe en la **misma transacción** que el cambio de estado de la solicitud; su id es determinista (`<solicitud>_ENT<n>_<insumo>`): un reintento no descuenta dos veces.
- El libro `apAlmacenMov` es inmutable (solo se crea). Una corrección se hace con un movimiento `ANULACION` (`anulaA`).
- Al solicitar, el Asistente ve «En Almacén» por insumo y un aviso si pide más de lo que hay (no se bloquea el pedido).
- En «Existencias» se agrega la columna «En Almacén». La pantalla de la solicitud (Almacén) muestra el stock y propone entregar lo pendiente sin pasar del stock.
- **No incluido (a propósito):** las devoluciones de Producción a Almacén no suman al stock de Almacén hasta que SAP las refleje en un corte; el material «en tránsito» no se descuenta dos veces.

## Datos y permisos
| Pieza | Detalle |
|---|---|
| Colección nueva `apAlmacenMov` | `{opId, tipo ENTREGA/ANULACION, insumo, itemCode, cantidad, unidad, fecha, solicitudId, sinStock, motivo, en, uid, usuario, guardadoEn}` |
| Escribe | quien tiene `moduloAlmacen` (entregas) — regla `glacial_27` |
| Lee | catálogo y cortes del Inventario: `inventarioInsumos`, Asistente (`ap_asis`) y Almacén (`ap_alm`); `apAlmacenMov`: igual que el resto del Asistente |
| Migración | `supabase/migraciones/glacial_27_almacen_enlace_inventario.sql` (requiere glacial_23 y 24). PRUEBAS y PRODUCCIÓN: aplicada (2026-10-21) |

Pruebas: `node tests/almacen-enlace.test.js`.

## Previsión, alertas y desviación de consumo (`82-asistente-prevision-nucleo.js`)
- **Insumos › Previsión:** para 2, 3, 5 o 7 días, lo que falta producir de la programación publicada × el factor vigente, frente a lo que hay en Producción, lo que viene en camino (pedido o entregado sin recibir) y el stock de Almacén. Dice hasta qué día alcanza y permite **Solicitar lo que falta** en un clic.
- **Insumos › Desviación de consumo:** consumo real confirmado (conciliaciones) frente al teórico, por insumo y por línea, en 3/7/15/30 días. Tolerancia normal ±3 %.
- **Alertas en «Por atender» (Resumen):** no alcanza ni con Almacén, hay que pedir a Almacén, solicitud sin entregar > 4 h, entregada sin recibir > 12 h, consumo fuera de tolerancia (≥ 2 cuadros) y stock de Almacén bajo el mínimo del catálogo.
- Pruebas: `node tests/asistente-prevision.test.js`.

## Reportes en Excel con previsualización y corrección (`83-asistente-reportes-pantalla.js`)
Historial › **Reportes en Excel**, para el día elegido:
- **Resumen general:** todas las líneas (Resumen del día + una hoja por línea).
- **Resumen por línea:** solo las líneas marcadas.
Cada uno tiene **Previsualizar** (lo mismo que irá al Excel, con avisos y detalle por línea) y **Descargar Excel** (se arma otra vez con los datos vivos: sale con las correcciones).
En la previsualización se corrige en el **dato original** (con historial, motivo y auditoría):
- ✎ Saldos inicial y final del consumo (conciliación). Una conciliación **confirmada** solo la reabre quien valida (botón «Reabrir»).
- ✎ Mermas **pendientes** de validar (material, cantidad, cuadro, causa, etapa, lote, observaciones): `editarMerma` (71) + regla `glacial_28`. Una merma validada no se edita.
Programación, Paletas, Cierre, paradas y Tareo se ven pero se corrigen en su módulo. Migración: `glacial_28_asistente_corrige_mermas.sql` (PRUEBAS y PRODUCCIÓN: aplicada el 2026-10-21). Pruebas: `node tests/asistente-reportes-edicion.test.js`.
