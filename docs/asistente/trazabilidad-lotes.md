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
| `supabase/migraciones/glacial_34_trazabilidad_lotes.sql` | Reglas de las colecciones nuevas y la columna `leyenda` (**aplicada en PRUEBAS**; PRODUCCIÓN pendiente). |
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

## Migración `glacial_34` (aplicada en PRUEBAS el 2026-10-25; PRODUCCIÓN pendiente)
Agrega las 5 colecciones a `autorizar` (nada se borra; los movimientos y el índice solo se crean; los movimientos exigen `uid` y hora del servidor) y a `puede_leer` (`ii_ver`), y la columna opcional `evidencias_entrada.leyenda` (las filas actuales quedan en `null`; `evidencias_entrada_pendientes` la devuelve). Requiere `glacial_24`, `glacial_31` y `glacial_33`; si falta una ancla o una marca se detiene sin cambiar nada. Se puede ejecutar más de una vez.
**Orden**: primero PRUEBAS (`mvxjopvnnagqytegtexi`), probar «Confirmar y crear lote» con una evidencia real y comparar la huella de las funciones; PRODUCCIÓN (`ehtbwmvwoxcdefvlxttu`) solo con la aprobación del dueño.
En PRODUCCIÓN, mientras no se aplique, el servidor rechaza las lecturas y escrituras de las colecciones nuevas (el Asistente muestra el error); la bandeja de Evidencias sigue funcionando.

## Bot de WhatsApp (proyecto aparte `glacial-whatsapp`)
Contrato nuevo, opcional y compatible hacia atrás: el cuerpo del POST a `evidencias-ingesta` puede traer `leyenda` (texto que acompañó la foto). La función la limpia (sin caracteres de control, máximo 40) y la guarda; el Asistente la interpreta. Lo pendiente en ese proyecto (no está en este repositorio): leer el texto que acompaña la foto y enviarlo en `leyenda`. Ver `docs/asistente/evidencias-ingesta.md`.

## Pruebas
`tests/trazabilidad-lotes-nucleo.test.js`: identificadores, llaves, leyenda, validación, artículo sugerido, crear lote/unidad (nuevo, unidad agregada, duplicado, leyenda de línea), máquina de estados, búsqueda y línea de tiempo.
`tests/trazabilidad-lotes-datos.test.js` (base simulada): transacción única (evidencia + lote + unidad + movimiento + índice + correlativo + memoria + auditoría), doble clic y concurrencia, duplicados, validaciones, permisos por rol, tiempo real, pantallas (Lotes, diálogo, Evidencias con y sin lotes), solo consulta, celular, integración (index.html, pestaña, migración, ingesta) y ninguna colección de stock.

## Guía de uso
Ver `docs/asistente/guia-uso-trazabilidad-lotes.md` (paso a paso, casos frecuentes y prueba rápida en PRUEBAS).

## Cambio en la Etapa 3: la exportación a Drive es el «Control de proceso en el envasado»
El Drive de planta ya lleva el formulario CF - CA - F - 047 (un libro por línea y mes, una hoja por marca, una fila por cuadro). La copia a Drive de la Etapa 3 **genera ese formulario** en vez de la hoja «LOTES GLACIAL» por unidad. Para que se llenen las columnas de lotes, cada entrada de `cuadro.lotesInsumo[]` (Etapa 2) debe guardar también la **`categoria`** de la unidad (`preformas`, `tapas`, `etiquetas`, `asas`). El Excel del mes ya se descarga desde la pestaña Lotes. Diseño, mapeo y preguntas abiertas: `docs/asistente/control-proceso-drive.md`.

## Fecha de la foto, caja/bobina y artículo (2026-11-04)
**Dos fechas distintas.** La trazabilidad usa la **fecha en que se envió la foto** (cuando llegó o se usó el insumo), no la de validación:
- La evidencia guarda `fotoEn` y `fotoEnOrigen`. Se toma, en este orden: la hora del mensaje de WhatsApp que mande el bot (`enviado_en`, `mensaje_en`, `fecha_mensaje`, `whatsapp_en` o `recibido_en` en la lectura, en ISO o segundos), la llegada a la bandeja del servidor (`evidencias_entrada.recibido_en`), la lectura de la IA (`analizado_en`) y, por último, la importación.
- Al crear el lote: la unidad guarda `recibidaEn`, el lote `recibidoEn` (la foto más antigua) y el movimiento de recepción o entrega `ocurridoEnMs`; `creadoEn` y `enMs` siguen siendo cuándo se validó y registró.
- La ficha muestra **«Foto enviada (recepción)»** y **«Validado y registrado»** por separado; la lista y la línea de tiempo se ordenan por la foto. Los lotes creados antes toman la fecha de su evidencia (sin migrar datos).
- **Pendiente en el bot** (`glacial-whatsapp`): mandar `enviado_en` con la hora del mensaje de WhatsApp. Mientras tanto vale la llegada al servidor, que es casi la misma si el bot envía enseguida.

**Caja / bobina y contenido.** «Unidad» se cambió por el nombre físico según la categoría: **bobina** (etiquetas, bolsas, polietileno) o **caja** (preformas, tapas, asas). El Resumen cuenta cajas/bobinas (cada foto es una) y suma el **contenido** que dice cada etiqueta (p. ej. 1 026 UND). El n.º de la tabla (Bobina 50) es el número impreso en la etiqueta, no una cantidad.

**Artículo del catálogo.** El diálogo «Confirmar y crear lote» tiene un buscador en todo el catálogo (además de los 5 sugeridos). Con «Ninguno / elegir después» el lote se crea igual con todos los datos (queda en el historial) y el artículo se asigna o cambia luego desde la ficha (**Asignar artículo / Cambiar**), con revisión, memoria y auditoría (`CAMBIAR_ARTICULO_LOTE`). Prueba: `tests/lotes-fecha-foto.test.js`.

## Informe de trazabilidad y correcciones del lote (auditoría 2026-11-06: T1, T2, T3)
**T1 · Informe de trazabilidad** (Asistente › Lotes › «Informe de trazabilidad»; `js/asistente/94-trazabilidad-informe.js`). Solo lectura.
- **Hacia adelante:** se busca un lote de insumo (LI-…, lote del proveedor, producto, proveedor o caja/bobina) y muestra dónde se usó: fecha, turno, línea, producción n.º, marca y presentación, **lote de producto**, producido y si el reporte está finalizado.
- **Hacia atrás:** se busca un lote de producto (`CF3-03112027` o solo `CF3`, marca o presentación) y muestra sus lotes de insumo por categoría.
- Filtros de línea y fechas; **Exportar a Excel** baja exactamente lo buscado (una fila por producción × lote de insumo). Aviso de **cobertura**: cuántas producciones tienen lotes marcados y cuántas no se pueden rastrear.
- Fuente: `cuadro.lotesInsumo[]` de **todos** los reportes vigentes (no solo los oficiales: en trazabilidad es mejor de más que de menos). El lote de producto se arma igual que el Control de proceso (`lotePT` de 90: código + vencimiento; sin vencimiento, fecha + 1 año, noche desde el día siguiente). Un lote unido a otro se cuenta en el que lo recibió.

**T2 · Todas las categorías en el cuadro** (`92`): el panel «Lotes de insumo usados» ofrece también **bolsas, cajas y polietileno** (antes solo preformas, tapas, etiquetas y asas). El Control de proceso sigue llenando solo sus 4 columnas; lo demás queda para el informe.

**T3 · Correcciones del lote** (ficha del lote, solo quien crea lotes):
- **Cambiar categoría** con motivo (p. ej. `LI-000001`, una etiqueta guardada como preforma). Historial y auditoría `CAMBIAR_CATEGORIA_LOTE`.
- **Unir lotes repetidos** (mismo lote del proveedor con el proveedor o el producto leídos distinto, p. ej. `12158` = `LI-000007`, `LI-000011`, `LI-000014`): las cajas/bobinas pasan al lote elegido con su id, estado, pesos e historial y un movimiento `UNION_LOTE` cada una; el lote de origen **no se borra**, queda `unidoEn` (oculto en la lista salvo que se busque por su ID) y el destino guarda `clavesUnidas` y `lotesUnidos`: las fotos nuevas con la llave vieja van solas al destino y una caja/bobina repetida se detecta aunque su id diga el lote viejo. Si el destino ya tiene el mismo n.º, no se une. Auditoría `UNIR_LOTES`.
- **Aviso de posible repetido al crear:** si ya hay un lote con el mismo lote del proveedor (y misma categoría o palabras del producto en común) pero otra llave, «Confirmar y crear lote» ofrece **agregar la foto a ese lote** (queda marcado por defecto) o crear uno nuevo. Al agregarla se crea su llave en el índice apuntando a ese lote.
- No necesitan migración: las reglas de `glacial_34` ya permiten a `ii_esc` actualizar lotes y unidades y crear movimientos de cualquier tipo.
- Núcleo: `posiblesDuplicados`, `planCambiarCategoria`, `planUnirLotes`, `resolverLoteId`, `planCrearLote({unirAlLote})` (87); datos: `cambiarCategoria`, `unirLotes`, `crearLoteDesdeEvidencia({loteDestinoId})` (88); pantalla (89). Prueba: `tests/trazabilidad-informe-correcciones.test.js`.

## Almacén ágil y el supervisor toma del almacén (06/11/2026: T7, T4, T5)
**T7 · Datos corregidos en PRODUCCIÓN** (06/11/2026, `supabase/datos/2026-11-06_t7_correccion_lotes.sql`): `LI-000001` pasó de preformas a **etiquetas**; `LI-000011` y `LI-000014` (lote del proveedor 12158) se **unieron a `LI-000007`** (3 bobinas: 03, 41, 42). Calculado con el mismo núcleo 87 que la pantalla, con movimientos `UNION_LOTE` y auditoría.

**T4 · Almacén** (ficha del lote, quien crea lotes):
- **«Entregar varias a línea…»**: todas las cajas/bobinas en almacén del lote, marcadas, a una línea, en una transacción (si una no se puede, no se entrega ninguna).
- Botones por caja/bobina según su estado: *En almacén* → Entregar a línea · **Observar** (con motivo); *Observada* → **Liberar** · **Devolver al proveedor** (con motivo, estado final); *Entregada a línea* → **Devolver a almacén** (vuelve sin usar, movimiento nuevo `RETORNO_ALMACEN`: ENTREGADA_LINEA → EN_ALMACEN).
- Núcleo `planMovimientoUnidad` (87), datos `moverUnidades` (88), auditoría `OBSERVAR_UNIDAD`, `LIBERAR_UNIDAD`, `DEVOLVER_PROVEEDOR`, `RETORNO_ALMACEN`.

**T5 · El supervisor toma del almacén** (panel «Lotes de insumo usados» de cada producción):
- Debajo de cada categoría, **«En almacén: tomar para <línea>»** lista los lotes con cajas/bobinas en almacén (sin vencidos ni lotes unidos). **«Tomar para PET1»** pasa esa caja/bobina a *Entregada a línea* (movimiento `ENTREGA_LINEA` con el motivo «Tomada del almacén por el supervisor para …») y **marca el lote en la producción** con esa unidad. Después se usa «Marcar en uso» y «Registrar peso final» como siempre.
- Ya no hace falta que Almacén entregue antes; Almacén sigue pudiendo entregar desde la ficha.
- Servidor: **`glacial_43`** permite a la marca «opera» SOLO EN_ALMACEN → ENTREGADA_LINEA (línea válida; solo estado, línea, rev, actualizadoPor, actualizadoEn e historial: el peso y el lote no cambian) y crear el movimiento `ENTREGA_LINEA`. Aplicada en **PRUEBAS** (06/11/2026) y comprobada (permitido / cambia peso / cambia lote / a consumida / línea inválida / sin «opera»). y en **PRODUCCIÓN** (06/11/2026), con la misma comprobación.
- El supervisor no escribe auditoría (es del Asistente); queda el movimiento inmutable con su uid y la hora del servidor.

Prueba: `tests/trazabilidad-informe-correcciones.test.js` (T4, T5 con base simulada).

## Aviso al finalizar y validación en bloque (06/11/2026)
**Aviso de lotes al finalizar** (`06-registro.js`, `cuadrosSinLotesInsumo`): si una producción con producción efectiva no tiene lotes de insumo marcados, el estado del reporte lo muestra («⚠ Sin lotes de insumo marcados: Producción 1 · Bells…») y las confirmaciones de **Finalizar reporte** y **Finalizar marca** lo recuerdan. **No bloquea**: sin lotes, esa producción no se podrá rastrear. Solo aparece si el panel de lotes (92) está cargado.

**Validación en bloque** (Evidencias › «Confirmar y crear lote», `89`, `companerasDe`): el diálogo lista las otras fotos sin lote con el **mismo lote del proveedor y la misma categoría**. Vienen marcadas solo las que cumplen todas las reglas de aprobación (datos confirmados, etiqueta de insumo, sin errores) y tienen otro n.º de caja/bobina; las demás aparecen con su motivo para revisarlas una por una contra su foto (la IA solo propone: una persona valida). Al confirmar, la foto abierta crea o amplía el lote y las marcadas se confirman **en el mismo lote** (una transacción cada una; si una falla, las demás siguen y el aviso dice cuáles). Mismo artículo del catálogo para todas.

## La Asistente de Producción elige los lotes y la línea (12/11/2026) — reemplaza T5
**Antes (T5):** en el Registro de producción, el panel «Lotes de insumo usados» de cada producción mostraba «En almacén: tomar para <línea>» y el supervisor sacaba cajas/bobinas del almacén.
**Ahora:** eso se quitó del Registro de producción. Quien decide qué lotes salen del almacén y a qué línea van es la **Asistente de Producción**:
- **Asistente › Lotes › «Entregar a líneas»** (`89`): por categoría (preformas, tapas, etiquetas, asas, bolsas, cajas, polietileno) los lotes con cajas/bobinas en almacén, el que vence antes primero, con buscador. Se marca el lote entero o cajas/bobinas sueltas (de varias categorías a la vez), se elige la línea y **«Entregar N a PET2»** muestra un resumen y las entrega en una transacción (`Z.entregarALinea`: movimiento `ENTREGA_LINEA` y auditoría `ENTREGAR_LINEA` por cada una; si una no se puede, no se entrega ninguna). Un lote vencido se ve en rojo y no se puede elegir.
- **«En cada línea ahora»**: lo entregado y en uso por línea; «Devolver a almacén» corrige una caja/bobina que fue a la línea equivocada sin usarse.
- Los roles de solo consulta (Jefe de Operaciones) ven el almacén y el reparto sin botones.
- **Supervisor** (Registro de producción, `92`/`93`): solo ve los lotes **ya entregados a su línea**, los marca en la producción y usa «Marcar en uso» y «Registrar peso final» como siempre. Si no hay ninguno, el panel le dice que la Asistente los entrega desde «Entregar a líneas». Se quitaron `loteTomarAlmacen`, `loteCuadroMarcarTomada` y la lectura de unidades en almacén del panel. Las funciones puras `enAlmacen` y `marcarConUnidad` de `92` siguen exportadas (pruebas).
- **Servidor:** **`glacial_52`** revierte `glacial_43`: quita a «opera» el paso EN_ALMACEN → ENTREGADA_LINEA y el movimiento `ENTREGA_LINEA` (vuelve a USO_CUADRO, CONSUMO y DEVOLUCION). La Asistente y el Administrador siguen entregando con `ii_esc`; lo de `glacial_39` no cambia; no toca datos (las entregas ya hechas por supervisores quedan). Comprobada en seco contra la función de PRUEBAS (12/11/2026: el bloque se encuentra una vez y el resultado no deja rastro de glacial_43). **Pendiente aplicar**: PRUEBAS primero, PRODUCCIÓN con la aprobación del dueño.

Prueba: `tests/trazabilidad-informe-correcciones.test.js` (T5: vista por categoría, vencido no elegible, sin línea no entrega, entrega de varias categorías, «En cada línea ahora», solo consulta; y el registro sin «Tomar»).
