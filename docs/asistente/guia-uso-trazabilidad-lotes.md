# Guía de uso · Trazabilidad de lotes de insumos (Etapa 1)

Para: Asistente de Producción, Jefe de Operaciones y Administrador. Estado: disponible en **PRUEBAS** (la migración `glacial_34` está aplicada ahí; en PRODUCCIÓN todavía no).

## 1. Para qué sirve
Cada caja o bobina de insumo que llega con etiqueta se convierte en una **unidad de un lote** con su propio código, su peso y su historia. Así se sabe qué lote del proveedor entró, cuándo, quién lo validó y en qué estado está.
Esta etapa llega hasta «la unidad está en almacén» (o ya entregada a una línea si la foto trae esa leyenda). Entregar a línea desde pantalla, usar en el cuadro y cerrar por peso son la Etapa 2.
No mueve el stock SAP ni toca producción, paradas, Avance/Cierre ni tareo.

## 2. Dónde está
**Asistente de Producción** tiene dos pestañas relacionadas:
- **Evidencias**: la bandeja donde se validan las fotos de etiquetas.
- **Lotes**: la lista de lotes ya creados, con su ficha.
Las ven Asistente de Producción, Jefe de Operaciones y Administrador. Crean lotes la **Asistente de Producción** y el **Administrador**; el Jefe de Operaciones y los demás roles de solo consulta ven todo sin botones.

## 3. Paso a paso
### Paso 1 · Que llegue la evidencia
- **Del bot de WhatsApp**: las fotos aparecen solas en Evidencias (al abrir la pestaña y cada minuto). Si quieres traerlas ya, pulsa **«Buscar nuevas del bot»**.
- **A mano**: **«Importar evidencias»** → selecciona a la vez los archivos `-revisado.json` y sus fotos. Cada foto se une a su resultado por su huella; una foto que no corresponde no se importa.
> En PRUEBAS el bot no está conectado: usa «Importar evidencias».

### Paso 2 · Validar los datos contra la foto
1. Elige la evidencia de la lista. La **foto** queda al lado de los datos (puedes girarla y abrirla).
2. Revisa cada dato: muestra lo que leyó la IA, el valor editable y su estado. Los marcados **«Confirmar»** (dudosos) se comparan con la foto y se confirman o se corrigen.
3. Corrige lo que haga falta y pulsa **«Guardar cambios»**.
Para crear el lote **deben estar bien**: proveedor, producto, **lote del proveedor**, **n.º de caja o bobina**, y **peso neto o cantidad**. El peso bruto no puede ser menor que el neto. La categoría no puede quedar en «otro».

### Paso 3 · Confirmar y crear lote
1. Pulsa **«Confirmar y crear lote»** (en las evidencias que ya estaban aprobadas antes de esta etapa dice **«Crear lote desde esta evidencia»**).
2. El diálogo te dice **qué va a pasar**:
   - *Lote nuevo*, o *se agregará la unidad al lote existente* (mismo proveedor + lote + producto).
   - La **leyenda** con que llegó la foto y en qué estado quedará la unidad.
   - El **artículo del catálogo** sugerido (por categoría, nombre, marca y código). Elige el correcto o «Ninguno / elegir después». GLACIAL recuerda tu elección para el mismo proveedor y producto.
   - Los **errores** que faltan resolver, o el aviso de **duplicado**. Mientras haya errores el botón no se activa.
3. Pulsa **«Confirmar y crear lote»**. En un solo paso se aprueban los datos, se crea el lote y la unidad (código `LI-000231-07`), se guarda el movimiento y queda la auditoría. Aparece el aviso con el código del lote y la unidad.
Ejemplo: lote del proveedor `2410-118`, bobina `07`, neto 25.40 kg → lote **LI-000231**, unidad **LI-000231-07**, en almacén.

### Paso 4 · Consultar en Lotes
- **Buscar** por lote del proveedor, código `LI-…` (o de unidad), producto u OI.
- **Filtrar** por estado, categoría y línea.
- Al elegir un lote ves su **ficha**: datos de la etiqueta (proveedor, OI, OC, fechas, artículo), las **unidades** con su estado, peso neto y peso actual, el botón **«Ver foto»** y **«Evidencia»** (te lleva a la evidencia de origen), y la **línea de tiempo** con cada movimiento (qué pasó, quién y cuándo).
- Desde una evidencia con lote, **«Ver el lote»** te lleva a su ficha.
Todo se actualiza solo en todos los celulares y PC abiertos; no hace falta recargar.

## 4. La leyenda de la foto
El texto que acompaña la foto en WhatsApp define dónde empieza la unidad:
| Leyenda | La unidad queda |
|---|---|
| (sin leyenda) o **RECEPCIÓN** | **En almacén** |
| **PET1, PET2, B7L, C20L, B20L** | **Entregada a línea** en esa línea |
Se reconoce con o sin tildes, mayúsculas o espacios («Pet 2», «b-7-l»). Si trae dos leyendas distintas se ignora y la unidad queda en almacén. DEVOLUCIÓN se reconoce, pero se usa en la Etapa 2.

## 5. Casos frecuentes
| Situación | Qué pasa | Qué hacer |
|---|---|---|
| Otra bobina del **mismo lote** | Se suma una unidad al lote existente (mismo `LI-`) | Nada especial |
| La **misma bobina** otra vez («7» = «07») | Aviso de **duplicado**; no se crea nada y la evidencia sigue pendiente | Revisa si es otra foto de la misma bobina; rechaza la repetida con motivo |
| Falta lote, n.º de bobina, peso o cantidad | El diálogo lo lista y no deja confirmar | Corrige el dato (o «Solicitar corrección o nueva foto») |
| Dato dudoso sin confirmar | No se puede crear | Confirma o corrige contra la foto |
| Dos personas validan a la vez | Gana la primera; a la segunda le sale «Otra persona cambió esta evidencia» | Revisa la pantalla actualizada |
| Doble clic | No se crea dos veces | Nada |
| «Tienes cambios sin guardar» | No se abre el diálogo | Pulsa «Guardar cambios» y vuelve a intentar |
| Una evidencia ya con lote | No se puede reabrir ni crear otro lote | Los cambios de estado de la unidad llegan en la Etapa 2 |

## 6. Prueba rápida en PRUEBAS (10 minutos)
1. Entra a PRUEBAS con un usuario Asistente de Producción o Administrador → **Asistente de Producción › Evidencias**.
2. **Importar evidencias** con un `-revisado.json` y su foto (o usa una que ya esté en la bandeja).
3. Confirma los datos dudosos, **Guardar cambios**, **Confirmar y crear lote**. Anota el código `LI-` que aparece.
4. Ve a **Lotes**: busca ese código, abre la ficha, comprueba unidad, peso, foto y línea de tiempo.
5. Importa otra foto del mismo lote con **otro n.º de bobina** → debe sumar una unidad al mismo lote.
6. Importa de nuevo la **misma bobina** → debe avisar de duplicado.
7. Entra con un usuario de solo consulta (Jefe de Operaciones) → debe ver Lotes y Evidencias sin botones.
8. Abre dos pestañas: crea un lote en una y comprueba que aparece solo en la otra.
Si algo sale distinto, anota el código del lote y la hora y avísame.

## 7. Qué todavía no hace (siguientes etapas)
- **Etapa 2**: entregar a línea desde pantalla (con aviso de vencimiento), lotes prellenados en el cuadro de producción, cierre por peso con consumo frente al teórico, pestaña de Trazabilidad adelante/atrás con informe Excel y Parámetros (tolerancia, días de vencimiento, leyendas).
- **Etapa 3**: copia de solo los lotes a Google Drive («LOTES GLACIAL»), alertas (vencido, observado en uso, diferencia de peso), aprobar varias a la vez, respuesta del bot en el grupo y control de nitidez de la foto.
- **Bot**: que envíe la leyenda con la foto (falta en el proyecto `glacial-whatsapp`; hasta entonces la unidad nace en almacén).

## 8. Seguridad y auditoría
Cada operación queda en la auditoría (**Inventario de insumos › Auditoría**, grupo «Trazabilidad de lotes») con antes → después, quién y cuándo. Los movimientos de una unidad no se editan ni se borran: una corrección es un movimiento nuevo. Nada de esto modifica el stock SAP.
