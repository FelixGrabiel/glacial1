# Incidente 10/11/2026 · login rechazado con «Usuario o contraseña incorrectos» (clave correcta)

**Qué pasó:** después de aplicar glacial_50 en PRODUCCIÓN, varias personas no podían entrar; la pantalla decía «Usuario o contraseña incorrectos» con la clave bien escrita. No era un problema de credenciales ni de glacial_50 (`glacial_fs.ctx()` se probó y funcionaba bien): era un límite de tiempo.

**Causa:** antes de autenticar, el login lee `sync/accesos` (usuario → correo) con el rol `anon` de Supabase, que tenía `statement_timeout = 3s`. La función que arma esa lectura (`fs_leer`, compartida por casi toda la página) tiene picos normales de hasta ~8 s bajo carga (33 980 llamadas registradas: media 454 ms, máximo 7 970 ms). Cuando un pico pasaba de 3 s, Postgres cortaba la consulta («canceling statement due to statement timeout») y el `catch` de `loginEstricto` (`js/accesos/36-seguridad-auth.js`) lo mostraba como clave incorrecta, sin decir la causa real.
El rol `authenticated` (ya con sesión) tenía 8 s, el triple de margen: por eso solo fallaba *antes* de entrar.

**Solución aplicada (PRUEBAS y PRODUCCIÓN):**
```sql
alter role anon set statement_timeout = '8s';  -- antes: 3s; igual que «authenticated»
```
Es un ajuste de configuración del rol, no de código ni de datos: no cambia qué puede leer o escribir `anon`, solo cuánto tiempo se le da antes de cortar una consulta.

**Verificado:** `fs_leer('sync','accesos')` como `anon` responde bien en ambos proyectos; el dueño confirmó que ya puede entrar.

**Pendiente (no es una emergencia):** por qué `fs_leer`/`fs_cambios` tiene picos de varios segundos con tablas chicas (`fs_docs` 16 MB / 12 099 filas, `fs_items` 24 MB / 17 567 filas, con sus índices en orden). Posible saturación puntual del servidor en cambios de turno (muchos inicios de sesión a la vez) u otra causa a investigar con más calma, sin apuro.
