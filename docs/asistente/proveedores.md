# Banco de proveedores · Asistente de Producción › Proveedores

**Problema:** el proveedor llegaba como texto leído de la foto, y la llave del lote es proveedor + lote + producto. Cada forma distinta de escribir al proveedor creaba otro lote.
- En las 70 fotos pendientes del 07/11/2026 el proveedor aparece escrito de **34 formas**, para unos 15 proveedores reales.
- En los lotes ya creados hay 4 variantes de ASK y 2 de San Miguel.

**Solución:** cada proveedor (o cliente) tiene **una sola ficha** con los nombres con que aparece en las etiquetas (alias). Al crear un lote desde una foto se usa el nombre del banco: el mismo lote con muchas cajas queda en un solo lote, y cada cambio de lote queda registrado.

## Decisiones del dueño (07/11/2026)
- Va dentro del Asistente, como pestaña **Proveedores** (con los permisos de Lotes y Evidencias).
- **Consorcio FRAP es el cliente**, no el proveedor. Si una foto lo trae como proveedor, el sistema no crea el lote y pide el proveedor real.
- «SW» es San Miguel Industrias PET mal leído.
- Del proveedor se guarda **solo lo que trae la etiqueta**: nombre, nombre corto, alias y categorías.
- No se desactiva ningún insumo.

## Vistas
- **Proveedores:** lista y ficha de cada proveedor.
  - Nombres leídos y lotes, cajas, observadas o devueltas, y la última recepción.
  - **Historial de lotes por artículo**, con los cambios de lote marcados.
  - Cambios de la ficha (quién, cuándo y por qué).
- **Unificar nombres:** los nombres leídos que aún no están en el banco, agrupados por parecido. Se crea el proveedor (o el cliente) o se agregan a uno existente. Los nombres originales quedan como alias y no se borra nada.
- **Evidencias pendientes:** cuántas fotos pendientes hay de cada tipo:
  - completas,
  - casi completas,
  - sin lote,
  - sin datos útiles.

  También muestra qué lotes se repiten (y con qué categorías leídas) y cuántos nombres faltan en el banco.

## Cómo cambia la creación de lotes
- `87 · planCrearLote({…, proveedorBanco})`: el lote guarda el nombre del banco (`proveedor`), su `proveedorId` y el nombre leído (`proveedorLeido`). Si el texto es del cliente, no crea el lote.
- `88 · crearLoteDesdeEvidencia`: busca el lote por la llave con el nombre del banco y, si no existe, por la llave con el nombre leído (los lotes creados antes). En ese caso la foto se suma a ese lote y la llave del banco queda registrada (`clavesUnidas` y el índice).
- `89`: la ventana «Confirmar y crear lote» muestra el proveedor del banco y el nombre leído, o avisa que no está en el banco.

## Datos y servidor
- Colección `insumosProveedores/{PRV-…}`: `tipo` (PROVEEDOR o CLIENTE), `nombre`, `nombreCorto`, `alias[]`, `categorias[]`, `activo`, `rev` e `historial[]`. Cada alta o cambio queda en `insumosAuditoria` (CREAR_PROVEEDOR / EDITAR_PROVEEDOR).
- `supabase/migraciones/glacial_45_banco_proveedores.sql`: lectura con `ii_ver`; creación y edición con `ii_esc`, como los lotes. Nunca se borra. Está aplicada en PRUEBAS y en PRODUCCIÓN (07/11/2026).

## Pruebas
`tests/proveedores-banco.test.js`: normalización, resolución con nombres reales (ASK, San Miguel, FRAP como cliente), validaciones, agrupación, historial de lotes, resumen de pendientes y la llave única del lote con y sin banco.

## Siguiente parte
Aprobación en bloque de las evidencias completas, por lote.
