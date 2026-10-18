# Fotos privadas en Supabase Storage (reemplazo de Cloudinary)

## Estado por fases
| Fase | Qué | Estado |
|---|---|---|
| 1 | Hojas de producto terminado: fotos nuevas a Supabase (privadas, enlace firmado). Cloudinary queda como respaldo y para las fotos antiguas. | **Hecha** (`06b-fotos-supabase.js`, `glacial_25`) |
| 2 | Migrar las fotos antiguas de Cloudinary (≈152 enlaces en 50 registros de `sync`) a Supabase y reescribir sus referencias. | Pendiente |
| 3 | Mantenimiento (`67d-intervenciones-evidencias.js`) y Asistente de Producción (`72-asistente-pantalla.js`): mismo mecanismo, más rutas permitidas en las reglas. | Pendiente |
| 4 | Quitar Cloudinary del código. | Pendiente |

## Cómo funciona
- Bucket **privado** `glacial-fotos` (jpeg/png/webp, máx. 5 MB). Ruta: `hojas_producto_terminado/<idRegistro>/<idEvidencia>.jpg`.
- En la base se guarda una **referencia**, no un enlace: `url = "supabase:glacial-fotos/<ruta>"`, `publicId = <ruta>`, `proveedor = "supabase"`. Un enlace firmado caduca; la referencia no.
- `window.glacialFotos` (`06b-fotos-supabase.js`): `subir(blob,{carpeta,id})`, `resolver(url)`, `atributosImg(url)` / `atributosEnlace(url)` para escribir HTML. Un observador firma en **una sola llamada** todas las fotos de la pantalla y coloca el enlace (válido 1 hora, en memoria) en `<img src>` / `<a href>`. Si la firma caduca, el clic en «Ver imagen» la renueva antes de abrir.
- Las fotos antiguas de Cloudinary (`url = https://…`) se muestran igual que antes.
- **Respaldo:** si Supabase Storage no responde (por ejemplo, un proyecto donde aún no se aplicó `glacial_25`), `06-registro.js` sube a Cloudinary y el registro no se detiene (queda un aviso en la consola).

## Reglas (`supabase/migraciones/glacial_25_fotos_privadas.sql`, aplicada en PRODUCCIÓN el 2026-10-18)
- **Leer / firmar:** usuario con sesión y perfil registrado, salvo la cuenta compartida de Mantenimiento.
- **Subir:** lo mismo, sin «solo vista», solo bajo `hojas_producto_terminado/`.
- Sin actualizar ni borrar: la evidencia no se puede reemplazar ni eliminar desde la página.
- Verificado con SQL simulando cada rol (se deshizo todo): administrador sube y lee; carpeta ajena, cuenta compartida de Mantenimiento y sin sesión quedan bloqueados.
- **Pendiente:** el proyecto PRUEBAS (`mvxjopvnnagqytegtexi`) no tiene el bucket; hasta aplicarle `glacial_25`, la app de pruebas usa Cloudinary por el respaldo.
- Para aplicarla con el editor SQL de Supabase: crear primero el bucket y luego las 2 reglas por separado (si el editor se queda esperando, poner `set local lock_timeout='10s'` antes de cada `create policy`).

## Límite conocido
Es una sola cuenta de Supabase por usuario, pero las reglas de Storage miran el rol del perfil solo de forma general (con sesión y no cuenta compartida / no solo vista): no distinguen por línea ni por turno. Igual que el resto de las colecciones de producción.

## Pruebas
`node tests/fotos-supabase.test.js` (lógica e integración) y `node tests/fotos-supabase.e2e.js` (navegador: firma en lote, fotos antiguas, errores, renovación al hacer clic).
