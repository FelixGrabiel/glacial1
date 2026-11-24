# Notificaciones de paradas de línea · 24/11/2026

GLACIAL avisa en el celular (o la PC) cuando una **línea se detiene** y cuando una **parada pasa su límite**, aunque la app esté cerrada.
Decisión del dueño (24/11/2026): solo **paradas de línea**, **también con la app cerrada**, y las recibe **el mismo que hoy las ve en el
Centro de alertas**.

## Qué avisa
| Aviso | Cuándo | Ejemplo |
|---|---|---|
| Línea detenida | Una detención empezó hace 15 min o menos (se revisa cada minuto) | «PET 1 detenida» · Falla mecánica · desde las 09:55 |
| Parada prolongada | Una parada o pausa pasó su límite (refrigerio 60 min, cambio temporal 30, otras pausas = mayor entre el umbral general y su estándar, detenciones = umbral general de `sync/configAlertas.paradaMin`, 30 por defecto) | «PET 2: parada de 35 min» |

- Mismas reglas que el Centro de alertas: el servidor usa **copias generadas** de `24b-pausas-sin-cerrar.js` y `45-indicadores.js`
  (`scripts/generar-copias-servidor.js`; una prueba avisa si quedaron desactualizadas).
- No avisa en la franja «Planta sin producción». Cada aviso se manda **una sola vez** (`glacial_fs.push_enviados`).
- Al encender el sistema no se avisan paradas que pasaron su límite hace más de 30 min.
- Una notificación por línea: la nueva reemplaza a la anterior de esa línea.

## Quién la recibe
Igual que el Centro de alertas (`ambito()` de `46-proyeccion-avisos.js`): Administrador, Jefatura, Supervisor (solo su línea si tiene
una asignada), cuenta compartida de Mantenimiento, Mantenimiento y quien tenga «Recibir alertas de producción», «Módulo de Mantenimiento»
o «Detener / reanudar líneas». Quien planifica, RRHH y los demás, no.

## Cómo se activa en un equipo
- Al entrar, a quien recibe paradas le aparece abajo **«Avisos de paradas · Activar · Ahora no»**. El permiso del navegador se pide solo al
  tocar «Activar». «Ahora no» lo oculta 7 días.
- **iPhone/iPad**: solo con GLACIAL **instalada** (iOS 16.4 o más). En Safari se indica instalarla.
- **Android y PC**: en el navegador o en la app instalada.
- Cada equipo queda registrado a nombre de la cuenta con sesión. Si entra otra cuenta, pasa a esa cuenta. **Al cerrar sesión el equipo deja
  de recibir** (un celular compartido no sigue recibiendo los avisos de la cuenta anterior).
- Para apagarlos: en los ajustes del teléfono, notificaciones de GLACIAL.

## Piezas
| Pieza | Qué hace |
|---|---|
| `js/nucleo/03d-notificaciones.js` | Oferta «Activar», suscripción del equipo (RPC `push_clave_publica`, `push_suscribir`) y baja al cerrar sesión |
| `sw.js` | Muestra la notificación (`push`) y al tocarla abre o trae al frente GLACIAL (`notificationclick`) |
| `supabase/migraciones/glacial_68_notificaciones_push.sql` | Tablas privadas, RPC de la app y del servidor, y la tarea `glacial-avisos-push` cada minuto |
| `supabase/functions/avisos-push/` | Decide (`logica.js`) y envía Web Push. Claves VAPID generadas por la propia función y guardadas en el Vault |

## Puesta en marcha (por proyecto: PRUEBAS primero)
1. Aplicar `glacial_68` (crea sola la clave del disparador en el Vault).
2. Desplegar la función: `supabase functions deploy avisos-push --no-verify-jwt` (se protege con la clave del Vault, no con sesión).
3. Guardar su dirección en el Vault:
   `select vault.create_secret('https://<proyecto>.supabase.co/functions/v1/avisos-push','push_avisos_url','GLACIAL avisos-push: dirección');`
   Desde ese minuto la tarea empieza a llamarla. La primera llamada genera las claves VAPID.
4. Prueba: llamar a la función con `{"prueba": true}` y la clave del Vault manda «Prueba de GLACIAL» a todos los equipos suscritos.

Estado: **PRUEBAS** listo el 24/11/2026. **PRODUCCION** pendiente de que el dueño lo apruebe (y de publicar la app instalable).

## Pruebas
`node tests/notificaciones-push.test.js`
