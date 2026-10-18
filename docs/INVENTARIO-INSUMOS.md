# Inventario de insumos (GLACIAL) — Fase 1: catálogo, importador SAP y stock actual

Módulo nuevo para comparar el stock de SAP con el conteo físico de planta. **Fase 1** (este documento): catálogo de insumos, importar el
Excel de SAP como «corte de stock» y la tabla de stock actual con semáforo. Faltan: 2) conteo físico, 3) conciliación y exportar Excel,
4) auditoría completa (hoy ya se audita la importación y la edición del catálogo).

## Archivos
| Archivo | Qué hace |
|---|---|
| `js/asistente/74-inventario-insumos-nucleo.js` | Núcleo puro (se prueba con node): lee el Excel (plano o tabla dinámica), categoría/marca/presentación por nombre, catálogo, cortes, stock, semáforo y filtros. |
| `js/asistente/75-inventario-insumos-datos.js` | Capa de datos (`db.collection`, `onSnapshot`, `runTransaction`: el mismo mecanismo de Paletas y del Asistente), permisos y auditoría. |
| `js/asistente/76-inventario-insumos-pantalla.js` | Pestaña `inventario-insumos`: Stock actual, Catálogo e «Importar stock SAP» (Web Worker). |
| `js/asistente/79-inventario-insumos-auditoria.js` | Fase 4: pestaña «Auditoría» (consulta por fechas, filtros, antes → después). |
| `js/asistente/78-inventario-insumos-conciliacion.js` | Fase 3: pestaña «Conciliación» y Excel (ExcelJS). El cálculo puro es `conciliar()` en 74. |
| `js/asistente/77-inventario-insumos-conteo.js` | Fase 2: pestaña «Conteo físico» (lista de conteos, líneas por ubicación, cerrar/reabrir). |
| `index.html` | Botón `#btn-inventario-insumos` (`goInventarioInsumos`) y los 3 scripts, después del Asistente y antes de `12-init`. |
| `supabase/migraciones/glacial_24_inventario_insumos.sql` | **Aplicada en PRODUCCIÓN (2026-10-18)**: reglas de Supabase de las colecciones nuevas. |
| `tests/inventario-insumos.test.js` | Pruebas del núcleo, de la capa de datos (base simulada) y de la integración. |

Los números de archivo 74–76 siguen al Asistente (70–73); el 17 que sugería el prompt ya existe (`17-modo-trabajo.js`).

## Colecciones nuevas (capa documento: `fs_docs` / `fs_items`, sin tablas SQL nuevas)
| Colección / documento | Contenido |
|---|---|
| `insumosCatalogo/catalogo` | `{ items:[{id, itemCode, nombre, grupo, categoria, subtipo, marca, presentacion, unidad, stockMinimo, puntoReorden, activo, prioritario, precio, alias?}] }` — un ítem por artículo (una fila de `fs_items` cada uno). |
| `insumosCortesIndice/{corteId}` | Metadatos de cada corte: `fechaCorte`, `importadoPor`, `importadoEn`, `archivo`, `formato`, resumen (artículos, nuevos, excluidos, almacenes). Se escucha completo (es liviano). |
| `insumosCortesDetalle/{corteId}` | `{ items:[{id, w:[6 almacenes AP], t}] }` — el stock del corte; solo se escucha el corte elegido. `w` va en el orden Insumos y Suministros, Producción, Inmovilizados, Cuarentena, Devoluciones, Producto terminado. |
| `insumosConteosIndice/{conteoId}` | Fase 2. Metadatos del conteo: `fecha`, `almacen` (`INSUMOS` por defecto, cualquiera de los 6 o `TODOS`), `observacion`, `estado` (`EN_PROCESO` → `CERRADO`), `creadoPor/creadoEn`, `cerradoPor/cerradoEn`, `reaperturas:[{por,en,motivo}]`, `lineas`, `articulos`. Se escucha completo. |
| `insumosConteosDetalle/{conteoId}` | Fase 2. `{ items:[{id, itemId, ubicacion, cantidad, por, uid, en, editadoPor?, editadoEn?}] }` — una fila de `fs_items` por línea (varias líneas por artículo, una por ubicación); solo se escucha el conteo abierto. |
| `insumosConteosComentarios/{conteoId}` | Fase 3. `{ items:[{id: itemId, texto, por, uid, en}] }` — un comentario por artículo de la conciliación (editable también con el conteo cerrado). |
| `insumosAuditoria/{auto}` | Quién, cuándo (hora del servidor), qué cambió (antes → después) y en qué artículo. Solo se crea. |

Diferencia con el prompt: el catálogo no va en `sync/insumos`. Los documentos `sync/*` dependen de una lista de documentos permitidos que está
dentro de la función `autorizar` de Supabase; con colecciones propias basta agregar una rama (`glacial_24`), como se hizo con el Asistente.

## Permisos
Clave nueva `inventarioInsumos` (Gestión de usuarios → Producción). Por defecto: **Asistente de Producción** (ve y escribe), **Administrador**
(ve y escribe) y **Jefe de Operaciones** (solo ve). Los demás roles no lo ven salvo que se les marque el permiso (entonces ven y, si no son un rol de
consulta como Jefatura/Gerencia/Jefe de Producción, también escriben). `-inventarioInsumos` lo quita. La cuenta compartida de Mantenimiento
nunca lo ve. El botón del menú se muestra u oculta en `76` (igual que el Asistente), no en `03-auth.js`.

## Excel de SAP
- **Plano** (una fila por almacén × artículo; columnas `WhsName, ItemCode, ItemName, ItmsGrpCod, AvgPrice, OnHand`…): se usa tal cual.
- **Tabla dinámica** (artículos en filas agrupados por `ItmsGrpCod`, almacenes en columnas): se lee lo que se ve en la hoja. **No trae `ItemCode`**: esos
  artículos se identifican por grupo + nombre (`id` = `N:105:NOMBRE`). Cuando después llega el export plano, el artículo **adopta su ItemCode** (sin
  duplicarse, conservando mínimos y demás datos; el id viejo queda en `alias` para que los cortes anteriores sigan sirviendo).
- `STOCK_INVENTARI.xlsx` es una tabla dinámica (hoja «Almacenes»; la hoja «RESUMEN» es la planilla de conciliación de la asistente y se ignora porque no
  tiene grupos). Los 108.476 registros planos viven dentro del archivo como caché de la tabla dinámica y no se pueden leer desde el navegador: para
  tener `ItemCode` hay que exportar la consulta plana desde SAP. Leído con este módulo: 237 artículos, 2 excluidos por nombre, 1 grupo fuera (104).
- Solo se guardan los 6 almacenes «AP - …» y los grupos 105, 106, 107 y 109; se excluyen «NO USAR» y «ETIQUETA ERROR».
- La lectura se hace en un **Web Worker** (SheetJS) que conserva solo esas filas y avisa el avance; sin Worker se lee en la página.

## Pantalla
- **Stock actual**: tarjetas (artículos, bajo mínimo, sin stock, último corte), filtros (buscador, categoría, marca, almacén, prioritarios, solo bajo mínimo),
  selector de corte y tabla con una columna por almacén AP, total, mínimo, semáforo (🔴 < mínimo · 🟠 < punto de reorden · 🟢 OK · ⚪ sin mínimo) y fecha del corte.
  El filtro de almacén (por defecto «AP - INSUMOS Y SUMINISTROS») define sobre qué stock se calcula el semáforo; «Total» usa los 6 almacenes. Un artículo
  que no aparece en el corte no se marca en rojo (queda «Sin corte»). La tabla se dibuja de a 150 filas.
- **Catálogo**: categoría, marca, presentación, unidad, stock mínimo, punto de reorden, prioritario y activo; la asistente edita unidad, mínimo, reorden,
  prioritario y activo. Reimportar solo actualiza nombre, grupo (y código/precio): lo definido en GLACIAL no se pisa.
- **Conteo físico** (Fase 2): lista de conteos (fecha, almacén, estado, líneas) y «+ Nuevo conteo» (fecha, almacén —por defecto AP - INSUMOS Y SUMINISTROS—, observación).
  Dentro del conteo: buscador grande, categoría, «solo prioritarios» y «solo pendientes», avance (X de N artículos) y, por artículo, **varias líneas «ubicación: cantidad»**
  que el sistema suma (reemplaza `=1000+9000`). Cada línea guarda quién y cuándo; se edita o borra mientras el conteo está EN PROCESO. «Cerrar conteo» lo deja de solo lectura
  (avisa cuántos prioritarios faltan; no cierra uno sin líneas). Solo un **Administrador** lo reabre, con motivo (queda en `reaperturas`). Cada operación es una transacción que
  vuelve a leer el estado: si alguien cerró el conteo mientras otra persona escribía, el guardado se rechaza con un aviso. Las líneas de otras personas aparecen solas (onSnapshot)
  sin quitarle el cursor a quien está escribiendo. Pensado para celular (360 px, campos grandes).
- **Conciliación** (Fase 3): se elige el conteo y el corte SAP (por defecto el más reciente; avisa si las fechas no coinciden o el conteo sigue EN PROCESO). Se compara **solo con el
  stock SAP de los almacenes contados** (conteo de Insumos → almacén Insumos; «Todos» → suma de los 6). Diferencia % = |conteo − SAP| / SAP:
  **OK** ≤ 2 % · **OBSERVADO** ≤ 10 % · **CRÍTICO** > 10 % · **NO CONTADO** (hay stock SAP y no se contó) · **SIN STOCK SAP** (se contó y SAP tiene 0). No se listan los artículos
  sin stock SAP que tampoco se contaron. Tarjetas por estado (filtran), buscador, comentario editable por artículo (con autor y hora) y **Exportar a Excel**: hoja «Conciliación»
  (`Artículo | AP - CUARENTENA | AP - DEVOLUCIONES | AP - INSUMOS Y SUMINISTROS | AP - PRODUCCIÓN | AP - PRODUCTO TERMINADO | AP - INMOVILIZADOS | TOTAL SAP | CONTEO dd.mm | DIFERENCIA |
  COMENTARIOS`, más `% DIF.` y `ESTADO` al final; TOTAL SAP y DIFERENCIA son fórmulas), «Detalle por ubicación» y «Resumen», con la tipografía y colores del Reporte general.
  `TOTAL SAP` es la suma de los almacenes contados (no de los 6), para que coincida con lo comparado.
- **Auditoría** (Fase 4): libro inmutable `insumosAuditoria` (solo se crea; el código nunca la actualiza ni la borra). Cubre **importaciones** (`IMPORTAR_STOCK`), **mínimos y datos del catálogo**
  (`EDITAR_ARTICULO`), **conteos** (`CREAR_CONTEO`, `EDITAR_CONTEO`, `CERRAR_CONTEO`, `REABRIR_CONTEO` con motivo), **líneas** (`CREAR_LINEA`, `EDITAR_LINEA`, `BORRAR_LINEA`) y **comentarios**
  (`COMENTARIO_CONCILIACION`). Cada evento va en la misma transacción que el cambio y guarda quién (nombre y uid), cuándo (hora del servidor + `enMs`), artículo, conteo y valor anterior → nuevo.
  La pestaña consulta por rango de fechas (últimos 30 días por defecto, hasta 1.000 eventos; avisa si hay más) y filtra por tipo de movimiento, acción, usuario y texto. No escucha en vivo
  (el libro crece sin parar): «Actualizar» vuelve a consultar. **Exportar a Excel** baja lo que se ve con los filtros aplicados (hoja «Auditoría», una fila por cambio: fecha y hora, usuario, acción, artículo, conteo, campo, valor anterior y nuevo; con filtros). La ven todos los que ven el inventario, incluido el Jefe de Operaciones (solo consulta).
- **Importar stock SAP**: archivo + fecha del corte (hoy por defecto, hora de Perú) → resumen (encontrados, nuevos, ya existían, excluidos, almacenes) → «Guardar corte».
  Una sola transacción guarda catálogo + corte + índice + auditoría.

## Reglas (Firebase y Supabase) — pendientes de publicar
Sin reglas, el módulo mostrará «no tienes permiso… falta publicar las reglas del Inventario de insumos». Equivalente en `firestore.rules.etapa2.txt` (NO modificado):
```
match /insumosCatalogo/{id}      { allow read: if iiVer();  allow create, update: if iiEscribir() && id == 'catalogo'; allow delete: if false; }
match /insumosCortesIndice/{id}  { allow read: if iiVer();  allow create: if iiEscribir() && request.resource.data.id == id; allow update, delete: if false; }
match /insumosCortesDetalle/{id} { allow read: if iiVer();  allow create: if iiEscribir() && request.resource.data.id == id; allow update, delete: if false; }
match /insumosConteosIndice/{id}  { allow read: if iiVer();  allow create, update: if iiEscribir(); allow delete: if false; }
match /insumosConteosDetalle/{id} { allow read: if iiVer();  allow create, update: if iiEscribir(); allow delete: if false; }
match /insumosAuditoria/{id}     { allow read: if iiVer();  allow create: if iiEscribir() && request.resource.data.uid == request.auth.uid && request.resource.data.en == request.time; allow update, delete: if false; }
```
(`iiVer()` / `iiEscribir()` = `capacidadAp('inventarioInsumos', [...])` como `asistenteProduccion`; ver la migración.) En Supabase: `glacial_24_inventario_insumos.sql`
(aplicada en PRODUCCIÓN el 2026-10-18).

## Cómo probarlo con STOCK_INVENTARI.xlsx (PRUEBAS)
1. Publicar `glacial_24` en PRUEBAS (o probar solo la pantalla: la lectura del Excel funciona sin reglas; guardar no).
2. Entrar como Asistente de Producción o Administrador → botón **Inventario de insumos**.
3. **Importar stock SAP** → elegir el archivo → ver el resumen (≈ 237 artículos, 6 almacenes, aviso de tabla dinámica) → **Guardar corte**.
4. En **Catálogo** ponerle mínimo y punto de reorden a un artículo prioritario; volver a **Stock actual** y ver el semáforo.
5. Reimportar el mismo archivo con otra fecha: el catálogo no se duplica ni pierde lo editado y aparece un segundo corte.
6. En otro dispositivo (o ventana) con otro usuario: el corte y las ediciones aparecen solos.
7. Con un usuario Jefe de Operaciones: ve todo, sin botón de importar ni «Editar».

## Pasos de prueba del conteo (Fase 2)
1. Con el stock ya importado: pestaña **Conteo físico** → **+ Nuevo conteo** (almacén por defecto Insumos y Suministros) → **Crear**.
2. Buscar «bobina», **+ Agregar línea**: `Rack A` 1000 y luego `Patio` 9000 → el artículo muestra **Contado 10,000** y cada línea quién y cuándo.
3. En otro dispositivo con otro usuario abrir el mismo conteo y agregar una línea al mismo artículo: aparece sola y no se pierde ninguna.
4. Editar y borrar una línea; **Cerrar conteo** → queda de solo lectura (sin «Agregar», «Editar» ni «Borrar»).
5. Como Administrador: **Reabrir conteo** con un motivo → vuelve a EN PROCESO y se ve en «Reaperturas». La Asistente no ve ese botón.
6. Jefe de Operaciones: ve los conteos pero no crea ni registra.
**Límite conocido:** «solo el Administrador reabre» lo exige la aplicación; las reglas de Supabase (como las de Firebase aquí) no comparan estado anterior → nuevo.

## Pasos de prueba de la conciliación (Fase 3)
1. Pestaña **Conciliación**: elegir el conteo cerrado y el corte SAP de la misma fecha.
2. Revisar tarjetas y estados (probar con un artículo con 2 %, 6 % y 15 % de diferencia); hacer clic en una tarjeta para filtrar.
3. Escribir un comentario y salir del campo: queda con tu nombre y hora; otro dispositivo lo ve solo.
4. **Exportar a Excel**: comprobar las 3 hojas, las columnas y que TOTAL SAP / DIFERENCIA se recalculan si cambias un valor.

## Pendiente
Las 4 fases están construidas. `glacial_24` ya está aplicada en PRODUCCIÓN. Falta probar con el Excel real. Idea futura: un aviso de bajo mínimo. La auditoría cubre la importación (`IMPORTAR_STOCK`), la edición del catálogo (`EDITAR_ARTICULO`) y el conteo (`CREAR_CONTEO`, `CREAR_LINEA`, `EDITAR_LINEA`, `BORRAR_LINEA`, `EDITAR_CONTEO`, `CERRAR_CONTEO`, `REABRIR_CONTEO`, `COMENTARIO_CONCILIACION`; todas con quién, cuándo y antes → después).
