# Fotos privadas en Supabase Storage (reemplazo de Cloudinary)

## Estado por fases
| Fase | Qué | Estado |
|---|---|---|
| 1 | Hojas de producto terminado: fotos nuevas a Supabase (privadas, enlace firmado). Cloudinary queda como respaldo y para las fotos antiguas. | **Hecha** (`06b-fotos-supabase.js`, `glacial_25`) |
| 2 | Migrar las fotos antiguas de Cloudinary (152 enlaces en 50 registros de `sync/records`) a Supabase y reescribir sus referencias. | **Hecha** (18/10/2026, herramienta `06c-migrar-fotos.js`): 0 registros por migrar, 153 objetos en el bucket |
| 3 | Mantenimiento (`67d-intervenciones-evidencias.js`) y Asistente de Producción (`72-asistente-pantalla.js`): mismo mecanismo, más carpetas permitidas en las reglas. | **Hecha** |
| 4 | Quitar Cloudinary del código. | **Hecha**: ya no hay subida ni respaldo a Cloudinary en 06, 67d ni 72 |

## Cómo funciona
- Bucket **privado** `glacial-fotos` (jpeg/png/webp, máx. 5 MB). Ruta: `hojas_producto_terminado/<idRegistro>/<idEvidencia>.jpg`.
- En la base se guarda una **referencia**, no un enlace: `url = "supabase:glacial-fotos/<ruta>"`, `publicId = <ruta>`, `proveedor = "supabase"`. Un enlace firmado caduca; la referencia no.
- `window.glacialFotos` (`06b-fotos-supabase.js`): `subir(blob,{carpeta,id})`, `resolver(url)`, `atributosImg(url)` / `atributosEnlace(url)` para escribir HTML. Un observador firma en **una sola llamada** todas las fotos de la pantalla y coloca el enlace (válido 1 hora, en memoria) en `<img src>` / `<a href>`. Si la firma caduca, el clic en «Ver imagen» la renueva antes de abrir.
- Las fotos antiguas de Cloudinary (`url = https://…`) se muestran igual que antes.
- **Sin respaldo (Fase 4):** si Supabase Storage no responde, el guardado se detiene con un mensaje claro («no se pudo subir la fotografía N…») y no queda nada a medias. Un proyecto sin el bucket (p. ej. PRUEBAS si no se aplicó `glacial_25`) **no puede subir fotos**.

## Reglas (`supabase/migraciones/glacial_25_fotos_privadas.sql`, aplicada en PRODUCCIÓN el 2026-10-18)
- Bucket: jpeg/png/webp/pdf, hasta 10 MB. Carpetas: `hojas_producto_terminado/` · `mantenimiento/` · `asistente/AAAA-MM/`.
- **Leer / firmar:** usuario con sesión y perfil registrado. La cuenta compartida de Mantenimiento solo ve `mantenimiento/`.
- **Subir:** `hojas_producto_terminado/` y `asistente/` → usuario con sesión, sin «solo vista» y que no sea la cuenta compartida; `mantenimiento/` → también la cuenta compartida (los técnicos suben fotos con ella).
- Sin actualizar ni borrar: la evidencia no se puede reemplazar ni eliminar desde la página.
- Verificado con SQL simulando cada rol (se deshizo todo): el administrador sube a las 3 carpetas y lee; carpeta ajena, solo-vista (subir) y sin sesión quedan bloqueados; la cuenta compartida sube y lee solo `mantenimiento/` y no puede subir a las hojas de PT.
- **Pendiente:** el proyecto PRUEBAS (`mvxjopvnnagqytegtexi`) no tiene el bucket: allí no se pueden subir fotos hasta aplicar `glacial_25` (bucket y 2 reglas).
- Para aplicarla con el editor SQL de Supabase: crear primero el bucket y luego las 2 reglas por separado (si el editor se queda esperando, poner `set local lock_timeout='10s'` antes de cada `create policy`).

## Límite conocido
Es una sola cuenta de Supabase por usuario, pero las reglas de Storage miran el rol del perfil solo de forma general (con sesión y no cuenta compartida / no solo vista): no distinguen por línea ni por turno. Igual que el resto de las colecciones de producción.

## Fase 2 — migrar las fotos antiguas (Administrador)
1. Entra como **Administrador** → Producción → **Historial**: aparece el botón **☁ Migrar fotos antiguas (N)** mientras queden fotos de Cloudinary.
2. **Probar descarga**: descarga cada foto desde Cloudinary y comprueba que se puede leer (tamaño, tipo, CORS). No sube ni cambia nada.
3. **Migrar ahora**: por cada registro descarga las fotos, las sube a `hojas_producto_terminado/<registro>/<foto>.<ext>`, comprueba que se pueden firmar y **recién entonces** cambia las referencias de ese registro (una transacción por registro). `url`/`publicId` pasan a Supabase y la dirección anterior queda en `urlCloudinary` / `publicIdCloudinary` (respaldo). Las que fallen quedan como estaban y se listan con su error; se puede repetir.
4. No borra nada de Cloudinary. Con la Fase 4 hecha, ya nada en la aplicación lee ni escribe en Cloudinary: la cuenta se puede cerrar o vaciar cuando quieras (hay una copia de cada foto en Supabase y la dirección anterior queda en `urlCloudinary`).
- **Límite:** se ejecuta en el navegador y necesita que Cloudinary permita leer las imágenes desde la página (CORS). Si «Probar descarga» falla con un mensaje de red/CORS, hay que migrar por otro camino (descarga manual o un script con las claves de Cloudinary).

## Pruebas
`node tests/fotos-supabase.test.js` (lógica e integración), `node tests/fotos-migracion.test.js` (migración de la Fase 2) y `node tests/fotos-supabase.e2e.js` (navegador: firma en lote, fotos antiguas, errores, renovación al hacer clic).

## Fase 4 — qué se quitó
- `06-registro.js`: constantes `CLOUDINARY_*` y la subida a Cloudinary. `67d-intervenciones-evidencias.js`: `subirCloudinary`, el preset `glacial_mant` y las direcciones derivadas. `72-asistente-pantalla.js`: el respaldo a Cloudinary. `67-intervenciones-motor.js`: el proveedor por defecto pasó a `supabase`.
- Se conserva `06c-migrar-fotos.js`: no hace nada si no quedan fotos de Cloudinary (el botón del Historial desaparece); se puede borrar cuando se quiera.
- Antes de quitarlo se comprobó en la base: 0 referencias a Cloudinary sin migrar, ninguna evidencia de mantenimiento ni del Asistente en Cloudinary.
