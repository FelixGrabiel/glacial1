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

---

# Incidente 10-11/11/2026 · Cierre de Agua con el horario y las paradas equivocadas (cerrado después de la hora de fin)

**Qué pasó:** el Cierre de Noche del 10/11 (generado a las 07:29, 29 min después de las 07:00) salió con «Horario del turno: 07:00 – 19:00» (el del Día) en vez de 21:00–07:00, y 0 min de paradas en las 5 líneas, aunque el Avance de las 06:06 del mismo turno sí tenía las paradas correctas (951 min).

**Causa:** `avConstruirSnapshot` (`js/produccion/29-avance-produccion.js`) guardaba `inicioTurno`/`finTurno` con `avCtx().inicio/.fin` — el horario del turno que está pasando **ahora mismo** según el reloj — en vez del horario del turno que el reporte está cerrando (`avanceEstado.turno`/`fecha`). Como ya habían pasado las 07:00, `avCtx()` ya daba el turno Día; el reporte, que sí decía «TURNO NOCHE» en el título, quedó con el horario de Día pegado. Eso además hizo que varias líneas no encontraran paradas (el cálculo de paradas de algunas tarjetas depende de esa ventana de horario).

**Dato:** el supervisor y luego el Administrador intentaron generar el cierre más de una vez; quedaron **3 documentos** (`2026-11-10|NOCHE|CIERRE`, `|v2`, `|v3`) con el mismo error, los tres con la misma producción (48 130 UND). No se investigó por qué el aviso «El cierre de este turno ya existe» no impidió los reintentos (pendiente, no es parte de este arreglo).

**Corrección de los datos (PRODUCCIÓN, 11/11/2026):** se copiaron las paradas por línea y los totales del Avance de las 06:06 (el último antes del cierre, con los datos correctos) a los 3 documentos de Cierre, y se corrigió `inicioTurno`/`finTurno` a 21:00/07:00. La producción de cada línea no se tocó. Verificado con un ensayo que se deshizo antes de aplicarlo de verdad.

**Corrección del código (para que no vuelva a pasar):** `avConstruirSnapshot` ahora calcula `inicioTurno`/`finTurno` a partir del turno que se está reportando (`avBloquesCfg()[...]`, el horario configurado para NOCHE o DÍA), no del horario «de ahora mismo». Afecta tanto a Avance como a Cierre; en el caso normal (se genera durante el propio turno) da el mismo resultado de siempre.

**Pendiente (no es una emergencia):** por qué se crearon 3 Cierres del mismo turno en vez de que el segundo y tercer intento fallaran con «ya existe»; si conviene dejar solo uno de los tres documentos.

**Pruebas:** `tests/avance-lineas-en-produccion.test.js` (caso 7: cerrar a las 07:29 un turno que terminó a las 07:00 conserva el horario 21:00–07:00).
