# Trazabilidad de lotes de insumos (Fase 4) — Etapa 1: Lote

Convierte la evidencia validada de una etiqueta (`docs/asistente/evidencias-insumos.md`) en un **lote rastreable**:

**Recepción (foto) → Validación → Lote y unidad en almacén → Entrega a línea → Uso en el cuadro → Cierre por peso**

La **Etapa 1** (esta) llega hasta «lote y unidad en almacén» (o directo a línea si la foto trae esa leyenda). Entrega a línea con aviso de vencimiento, lotes por cuadro y cierre por
peso son la **Etapa 2**; la copia a Google Drive, las alertas y la respuesta del bot, la **Etapa 3**. El modelo y la máquina de estados ya están completos en el núcleo para que
esas etapas no cambien los datos.

**No toca** stock SAP, cálculo de producción, ratio, paradas, Avance/Cierre, tareo ni impacto económico. Aprobar o crear un lote no registra inventario.

## Archivos
| Archivo | Qué es |
|---|---|
| `js/asistente/87-trazabilidad-lotes-nucleo.js` | Núcleo puro (se prueba con node): llaves de unicidad, leyenda, artículo sugerido, plan de creación, máquina de estados, búsqueda y línea de tiempo. |
| `js/asistente/88-trazabilidad-lotes-datos.js` | Capa de datos del puente: escuchas en vivo y la transacción «Confirmar y crear lote». |
| `js/asistente/89-trazabilidad-lotes-pantalla.js` | Pestaña **Lotes** del Asistente de Producción y el diálogo «Confirmar y crear lote». |
| `js/asistente/84–86` | Evidencias: el botón «Aprobar datos» pasa a «Confirmar y crear lote» cuando 87–89 están cargados; guardan la `leyenda` de la foto. |
| `supabase/migraciones/glacial_34_trazabilidad_lotes.sql` | Reglas de las colecciones nuevas y la columna `leyenda` (**NO aplicada**). |
| `supabase/functions/evidencias-ingesta/` | Acepta `leyenda` (opcional) y la guarda. |
| `tests/trazabilidad-lotes-nucleo.test.js`, `tests/trazabilidad-lotes-datos.test.js` | Pruebas. |

## Modelo de datos (colecciones del puente `fs_docs` / `fs_items`)
| Colección | Id | Contenido |
|---|---|---|
| `insumosLotes` | `LI-000231` | proveedor, producto, categoría, lote del proveedor, fechas, OI/OC, artículo del catálogo (`itemId`, `itemCode`), conteo de unidades, `clave`, `rev`, historial |
| `insumosUnidades` | `LI-000231-07` | n.º caja/bobina, peso neto/bruto/actual, cantidad, **estado**, línea, evidencia de origen (SHA-256), leyenda, `rev`, historial |
| `insumosLoteMovimientos` | `MOV-<evidencia>-<TIPO>` | `RECEPCION`, `ENTREGA_LINEA`, … antes → después, quién, `uid`, hora del servidor. **Inmutable** (solo se crea) |
| `insumosLotesClaves` | llave `PROVEEDOR__LOTE__PRODUCTO` | índice de unicidad → lote. Solo se crea |
| `insumosParametros` | `contador`, `trazabilidad`, `memoriaArticulos` | correlativo `LI-`, parámetros (editables en la Etapa 2) y artículos elegidos antes |

**Unicidad**
- **Lote**: único por proveedor + lote del proveedor + producto (normalizados: sin tildes, mayúsculas, sin separadores). El mismo lote con otro n.º de caja/bobina **suma una unidad** al lote existente (mismo `LI-`).
- **Unidad**: única por lote + n.º. «7», «07» y «007» son la misma. Si ya existe → aviso de **duplicado**, no se crea y la evidencia no se aprueba.
- Dos personas a la vez: el índice `insumosLotesClaves` y la revisión (`rev`) de la evidencia se leen dentro de la transacción; un doble clic cae en la evidencia ya marcada o en el mismo id de movimiento.

**Estados de la unidad**: `EN_ALMACEN → ENTREGADA_LINEA → EN_USO → CONSUMIDA`; `EN_USO → EN_ALMACEN` (devolución parcial); `EN_ALMACEN ↔ OBSERVADA`; `OBSERVADA → DEVUELTA_PROVEEDOR`.
Una unidad observada no se entrega a línea. Las transiciones las exige el núcleo (`motivoNoPermitido`), no solo la pantalla.

## Flujo de la Etapa 1
1. **Evidencias › Confirmar y crear lote** (o «Crear lote desde esta evidencia» para las aprobadas antes de esta fase). El diálogo muestra:
   - qué se creará (lote nuevo o unidad en un lote existente);
   - la **leyenda** con que llegó la foto;
   - el **artículo del catálogo** sugerido por categoría, palabras en común, marca y código (lo ya elegido para ese proveedor+producto va primero y se recuerda);
   - los errores que faltan resolver (proveedor, producto, lote del proveedor, n.º de caja/bobina, peso o cantidad, peso bruto ≥ neto) y el **duplicado** si la unidad ya existe.
2. Al confirmar, **una sola transacción**: aprueba los datos de la evidencia (si estaba pendiente), crea o actualiza el lote, crea la unidad y el movimiento, el índice, el correlativo y la memoria del artículo, marca la evidencia con su lote y deja auditoría (`CREAR_LOTE` o `AGREGAR_UNIDAD_LOTE`, grupo «Trazabilidad de lotes»).
3. **Leyenda**: sin leyenda (o `RECEPCIÓN`) la unidad queda `EN_ALMACEN` (movimiento `RECEPCION`). Con leyenda de línea (`PET1`, `PET2`, `B7L`, `C20L`, `B20L`) nace `ENTREGADA_LINEA` en esa línea (movimiento `ENTREGA_LINEA`). Se reconocen sin importar mayúsculas ni tildes y con espacios o guiones («Pet 2», «c-20-l»). Dos leyendas distintas = ambigua y se ignora. `DEVOLUCIÓN` se reconoce pero su uso es de la Etapa 2.
4. **Pestaña Lotes**: lista con buscador (lote del proveedor, ID `LI-`, producto, OI) y filtros por estado, categoría y línea. La **ficha** del lote muestra los datos de la etiqueta, las unidades con su estado, pesos y enlace a la foto de origen, y la **línea de tiempo** de movimientos. Todo en tiempo real.

## Decisiones por defecto (configurables; confirmar con el dueño)
1. El bot **no** responde en el grupo (Etapa 3, bandera en el `.env` del bot, apagado).
2. Leyenda **opcional**: sin leyenda la unidad queda `EN_ALMACEN` (`leyendaObligatoria: false` en `insumosParametros/trazabilidad`).
3. Peso final: lo registra el supervisor al cierre del cuadro (Etapa 2).
4. Fotos en Drive: solo enlace (Etapa 3).
5. QR imprimible: fuera de alcance; el ID `LI-…` queda listo.
Los umbrales (tolerancia de consumo, días de aviso de vencimiento) **no se inventan**: están en `null` hasta que se definan en Parámetros (Etapa 2).

## Permisos
Los de Evidencias/Inventario (`inventarioInsumos`): ven Asistente de Producción, Jefe de Operaciones y Administrador; crean lotes (`ii_esc`) Asistente de Producción y Administrador. Los roles de solo consulta ven sin botones; la cuenta compartida de Mantenimiento no entra.

## Migración `glacial_34` (NO aplicada)
Agrega las 5 colecciones a `autorizar` (nada se borra; los movimientos y el índice solo se crean; los movimientos exigen `uid` y hora del servidor) y a `puede_leer` (`ii_ver`), y la columna opcional `evidencias_entrada.leyenda` (las filas actuales quedan en `null`; `evidencias_entrada_pendientes` la devuelve). Requiere `glacial_24`, `glacial_31` y `glacial_33`; si falta una ancla o una marca se detiene sin cambiar nada. Se puede ejecutar más de una vez.
**Orden**: primero PRUEBAS (`mvxjopvnnagqytegtexi`), probar «Confirmar y crear lote» con una evidencia real y comparar la huella de las funciones; PRODUCCIÓN (`ehtbwmvwoxcdefvlxttu`) solo con la aprobación del dueño.
Mientras no se aplique, el servidor rechaza las lecturas y escrituras de las colecciones nuevas (el Asistente muestra el error); la bandeja de Evidencias sigue funcionando.

## Bot de WhatsApp (proyecto aparte `glacial-whatsapp`)
Contrato nuevo, opcional y compatible hacia atrás: el cuerpo del POST a `evidencias-ingesta` puede traer `leyenda` (texto que acompañó la foto). La función la limpia (sin caracteres de control, máximo 40) y la guarda; el Asistente la interpreta. Lo pendiente en ese proyecto (no está en este repositorio): leer el texto que acompaña la foto y enviarlo en `leyenda`. Ver `docs/asistente/evidencias-ingesta.md`.

## Pruebas
`tests/trazabilidad-lotes-nucleo.test.js`: identificadores, llaves, leyenda, validación, artículo sugerido, crear lote/unidad (nuevo, unidad agregada, duplicado, leyenda de línea), máquina de estados, búsqueda y línea de tiempo.
`tests/trazabilidad-lotes-datos.test.js` (base simulada): transacción única (evidencia + lote + unidad + movimiento + índice + correlativo + memoria + auditoría), doble clic y concurrencia, duplicados, validaciones, permisos por rol, tiempo real, pantallas (Lotes, diálogo, Evidencias con y sin lotes), solo consulta, celular, integración (index.html, pestaña, migración, ingesta) y ninguna colección de stock.
