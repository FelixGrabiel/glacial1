# Auditoría de seguridad · 18/11/2026

Revisión de solo lectura + simulación de ataque (en PRUEBAS, con transacciones revertidas; en producción solo lecturas).

## Lo que resistió
- Anónimo: solo leía `sync/accesos`; no escribe ni borra nada. Sesión sin perfil: igual.
- Escalada con Operador, Supervisor, cuenta compartida de Almacén y de Mantenimiento: no pudieron hacerse Administrador, falsificar recepciones/entregas de Almacén, crear auditoría o configuración, ni tocar lo económico.
- Lectura por rol (producción): separada; lo económico solo Admin/Gerencia; las cuentas compartidas leen 4 de 65 colecciones.
- Edge Functions: `fs-cuentas` solo Administrador; las otras tres exigen secreto largo (comparación en tiempo constante) y tienen tope diario.
- Publicación: solo `index.html`, `js`, `css`, `assets`; las pruebas corren antes de desplegar.

## Medidas aplicadas (esta rama)
| # | Medida | Estado |
|---|---|---|
| 1 | Cabeceras de seguridad en `vercel.json` (anti-clickjacking, nosniff, referrer, HSTS, permisos; cámara solo propio sitio). No se restringe `script-src`. | En código (aplica al publicar en Vercel; GitHub Pages no admite cabeceras) |
| 2 | `glacial_62`: `sync/accesos` deja de ser público; el login pide el correo de un solo usuario con `fs_acceso_correo`. Si la función no existe, el login usa el método anterior. | PRUEBAS aplicada y verificada · PRODUCCIÓN pendiente |
| 3 | Contraseña mínima 10 (cambio de clave y `fs-cuentas`). Falta activar «protección de contraseñas filtradas» en Supabase (Authentication › Passwords). | En código · `fs-cuentas` por desplegar |
| 4 | Cuentas huérfanas: lista abajo, decisión del dueño (no se borró nada). | Pendiente |
| 5 | `glacial_63`: copia de paletas, tareos, programaciones, perfiles, usuarios y trabajadores cada 12 h (solo si cambiaron, 10 días). | PRUEBAS aplicada y verificada (copias = documentos vivos) · PRODUCCIÓN pendiente |

## Orden para producción
1. `glacial_62`: **hecho en producción** (la página nueva ya estaba publicada).
2. `glacial_63` en 4 partes (tabla, función, tarea, limpieza): pendiente en producción.
3. `fs-cuentas` (mínimo 10): **desplegada** en PRUEBAS y producción.

## Cuentas sin perfil (21 de 43)
- Restos de restablecimientos de clave (sufijo `.1`–`.7`, p. ej. `yennyvertiz.*`, `*.2`): sin uso.
- Sin ingreso nunca y posiblemente reales: `cesarsalazar`, `jacquelinecoronado`, `paola.rrhh`.
- Técnicas: `bot.lectura`, `tv.lectura`.
- Fuera de dominio: una cuenta de Gmail del dueño (creada 09/10, sin ingreso).

## Pendiente / límites
- Sin MFA para el Administrador; un solo Administrador.
- Cualquier usuario con sesión puede reemplazar `sync/paletas` y `sync/tareos` (diseño colaborativo); la copia de `glacial_63` es la red de seguridad.
- Adivinar nombres de usuario uno a uno sigue siendo posible.
- No se probó el límite de intentos de login ni el registro público (el contenedor no llega a Supabase).
- XSS: sin caso explotable confirmado; falta prueba dinámica.
