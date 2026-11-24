# Conservar la sesión al recargar

## Qué se hizo
- **Identidad = Firebase Auth.** `tryResumeSession()` (`03-auth.js`) espera el primer `onAuthStateChanged` de la instancia principal (nunca decide con `auth.currentUser` antes de que Auth termine de inicializar). `rdp_session_v1` (`DB_SESSION`) es solo contexto AUXILIAR: si falta, está corrupto o es de otra cuenta, una sesión de Firebase vigente se recupera igual y el contexto ajeno no se restaura (ni identidad ni permisos).
- **Estados distintos y visibles** (pantalla `#sesion-recuperando` en `index.html`): *cargando* («Recuperando sesión…»; el login no se muestra mientras Auth o el perfil cargan), *error* de red o perfil que no llega (mensaje + «Reintentar» + «Volver a iniciar sesión»; **nunca** se convierte en cierre de sesión), *ausente* (Firebase confirma que no hay sesión → login) y *denegado* (sesión sin perfil: se cierra y el login explica el motivo; no se inventa un perfil).
- **Perfil por UID**: se inicia la sincronización (idempotente), se espera la carga real de usuarios comprobando el resultado (`esperarUsuariosListos` → booleano), se busca el perfil por `authUid` y se reconstruye `state.user` sin contraseña, hash, salt ni tokens, con los permisos VIGENTES. Se respeta el cambio obligatorio de contraseña temporal.
- **Ciclo de vida**: cada recuperación y cada cierre invalidan las anteriores (`_recuperacionSesion.n`); un cierre durante la recuperación impide que una respuesta tardía vuelva a ingresar. `handleLogout` cierra escuchas, limpia el contexto y **espera el cierre de Firebase** (tope 4 s, muestra «Cerrando sesión…») antes de mostrar el login, así una recarga inmediata no reingresa. Ningún manejador de recarga/unload cierra sesión ni borra datos. No se borra todo `localStorage`/`sessionStorage`.
- **Persistencia**: sigue siendo `SESSION` (sobrevive a la recarga de la misma pestaña; se pierde al cerrarla). El error de `setPersistence` ya no se silencia (`01-config.js`: consola + `window.__authPersistenciaError`); el login espera esa promesa antes de iniciar sesión (`36-seguridad-auth.js`) y, si falló, avisa que la sesión no se recordará al recargar.
- **Sin parpadeo del login**: un script mínimo en `index.html` mira solo los NOMBRES de las claves de `sessionStorage` (`rdp_session_v1`, `firebase:authUser:…`) y muestra «Recuperando sesión…» desde el primer instante. Si los scripts no cargan en 30 s, pide recargar.
- «Ver como» no guarda su perfil simulado en el contexto: al recargar vuelve a la identidad real. La cuenta compartida de Mantenimiento conserva su identificación de técnico (otra clave, no se toca).

## Causa
No pude reproducirla con Firebase real (no hay credenciales ni acceso al sitio publicado, y no se piden). Del código se confirmó que: (1) mientras se esperaba Auth y la carga de usuarios (hasta 8 s) el login quedaba visible, y si `esperarUsuariosListos` agotaba el tiempo se continuaba sin comprobar el resultado; (2) un `uid` distinto o un estado nulo borraba el contexto y mandaba al login sin distinguir red/perfil/denegado; (3) el error de `setPersistence` se tragaba. Si tras esta corrección el problema persiste en el sitio publicado, la consola dirá cuál estado se alcanzó (se registra el motivo de cada rama).

## Pruebas
`tests/sesion-recarga.test.js` (Firebase Auth simulado): recarga válida y consecutivas, contexto ausente / JSON inválido / de otra cuenta, perfil lento, error de red + Reintentar, Auth que no responde, sesión ausente, cierre explícito + recarga, cierre durante la recuperación, recuperaciones solapadas, cuenta compartida, «Ver como», perfil denegado, clave temporal, selección de reporte. En la página real (servidor local): sin sesión → login; contexto huérfano sin sesión de Firebase → login y contexto limpiado.

## No comprobado
Login real + F5 contra Firebase (PRUEBAS o producción), recarga forzada real, red real caída, ni el sitio publicado.

## Sesión guardada en el equipo (16/11/2026)
Decisión: **para todos los usuarios**, la sesión queda iniciada al cerrar y volver a abrir GLACIAL (página o app instalada) y **vence a los 7 días sin uso** en ese equipo. Esto reemplaza la política anterior de «Persistencia SESSION» (por pestaña) descrita arriba.

- **Dónde**: `crearAlmacenSesion` en `js/nucleo/00b-puente-supabase.js`. La sesión de Supabase pasa de `sessionStorage` a `localStorage`, con una marca de último uso (`…:ultimo-uso`). `01-config.js` pide persistencia `LOCAL`.
- **Vencimiento**: «uso» = abrir GLACIAL o tenerla abierta (la marca se renueva como mucho una vez por hora). Pasados 7 días sin uso, la sesión se borra del equipo y se pide usuario y contraseña. Una pantalla que nunca se cierra (TV de planta) no vence. Para cambiar el plazo: `SESION_DIAS_SIN_USO`.
- **Sin corte al publicar**: quien ya estaba dentro conserva su sesión (se pasa de la pestaña al equipo).
- **Varias pestañas**: ahora comparten la sesión. Si otra pestaña cierra sesión o entra con otra cuenta (o el servidor la da por terminada), la página se recarga sola y resuelve la identidad de cero; así no quedan permisos de una cuenta con datos de otra. Ya no se pueden tener dos cuentas distintas abiertas en el mismo navegador (sí en navegadores o perfiles distintos, o en una ventana privada).
- **Lo que sigue por pestaña**: el contexto auxiliar `rdp_session_v1` y la identificación del técnico en la cuenta compartida de Mantenimiento (PIN en cada apertura).
- **Permisos**: se siguen leyendo en vivo; quitar un permiso o desactivar un usuario aplica aunque tenga la sesión guardada.
- **Límite**: el vencimiento se controla en el equipo. Para exigirlo también en el servidor: Supabase › Authentication › Sessions (tiempo máximo e inactividad). No se cambió.
- **Pruebas**: `tests/sesion-guardada.test.js` y el bloque 8a de `tests/puente-supabase.test.js`. No comprobado contra Supabase real ni en teléfonos.
