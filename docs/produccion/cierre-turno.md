# Cierre progresivo de marcas y Cierre de turno (Paletas)

**Archivos:** `js/produccion/16f-cierre-marcas.js` · `supabase/migraciones/glacial_69_cierre_turno.sql` · prueba SQL `supabase/pruebas/cierre_turno.sql` · pruebas `tests/cierre-marcas.test.js` y `tests/cierre-marcas.e2e.js`.

## Qué hace
Debajo de la **Secuencia del turno** (Producción › Paletas) aparece el panel **«Cierre de turno»**:

1. **Franja de estado**: `N pendientes por subir` (cola offline del equipo), `N de M marcas cerradas` y «Todo listo para envío rápido» o la advertencia que corresponda.
2. **Tarjetas por tramo** de la secuencia:
   - *Cerrado ✓*: hora de corte, paletas del tramo, saldo (paq) y quién cerró. La última cerrada tiene «Reabrir» (pide motivo).
   - *En curso*: acumulado de paletas completas, campo **Saldo (paq)** (vacío = 0) y botón **«Cerrar marca»**.
   - *En espera*: el resto.
3. **«Cerrar marca»** fija la hora de corte real (hora de Lima del equipo), congela las paletas completas acumuladas, guarda el saldo, bloquea la tarjeta y activa la siguiente. La captura rápida de paletas pasa sola a la siguiente marca.
4. **La última marca** no tiene botón propio: se cierra con **«Enviar cierre de turno»**, que queda deshabilitado mientras haya registros sin subir, rechazados, marcas anteriores abiertas o sin conexión con el servidor.

Paletas por tramo = acumulado de la marca/presentación − lo ya congelado en tramos anteriores cerrados de la misma marca (ej. Scala retoma después de Bells).

## Reglas en el servidor (glacial_69)
- Tablas `public.cierre_tramos` (estado abierto/cerrado, hora de corte, `cerrado_en`, paletas acumuladas y del tramo, saldo, quién, evento del equipo, reapertura) y `public.cierres_turno` (consolidado: `closed_at`, `closed_by`, `resumen`, totales, observaciones, `sync_estado`, evento).
- Sin acceso directo desde el navegador (RLS sin políticas); todo pasa por funciones:
  - `cierre_turno_listar(linea, fecha, turno)` — permiso de ver resumen.
  - `cierre_tramo_cerrar(p)` — permiso de operar; exige orden, rechaza doble cierre (23505), idempotente por `client_event_id`, hora de corte no anterior al tramo previo (turno noche cruza medianoche).
  - `cierre_turno_enviar(p)` — todas las marcas menos la última cerradas, 0 pendientes; cierra la última y consolida. Reintento con el mismo evento devuelve el mismo cierre.
  - `cierre_tramo_reabrir(...)` — solo la última cerrada, con motivo; si el turno ya se envió solo Administrador/Jefe y se anula el envío.
- No cambia `fs_items`, snapshots ni migraciones anteriores.

## Estado
- glacial_69 aplicada en **PRUEBAS**; **no** en producción (se aplica con «Aplica en producción»). Sin ella el panel muestra «Falta aplicar glacial_69».

## Paradas por marca (glacial_70 · 16g-paradas-tramo.js)
**Archivos:** `js/produccion/16g-paradas-tramo.js` (lógica y tiempo real) · `16f-cierre-marcas.js` (panel) · `29-avance-produccion.js` (modal «Agregar paradas», texto e imagen) · `supabase/migraciones/glacial_70_paradas_tramo.sql` · pruebas `tests/paradas-tramo.test.js`, `tests/paradas-tramo.e2e.js` (dos equipos a la vez) y `supabase/pruebas/paradas_tramo.sql`.

### Reglas
1. Toda parada pertenece a un **tramo** (marca + presentación de la Secuencia del turno), venga de Nuevo registro o de Avance/Cierre.
2. **Automática por hora de inicio:** el tramo cuyo intervalo `[inicio, hora de corte)` la contiene; el tramo en curso va hasta «ahora». Las de Nuevo registro van al tramo de su cuadro (si la marca se repite, decide la hora del cuadro). El supervisor puede elegir otra a mano (queda «elegida a mano» y constancia en el servidor).
3. **Sin hora:** el supervisor elige la marca; mientras no la tenga queda **pendiente** (franja amarilla con «Asignar»).
4. **Cruza la hora de corte:** se parte en partes enlazadas (`paradaPadreId`); el total no cambia. Vale para el refrigerio.
5. **Cambio de formato:** se carga a la marca que **entra** (programada, etiqueta CAMB) y se muestra como tarjeta «Cambio X → Y».
6. **Ratio de la marca** = producción del tramo (paletas × unidades por paleta) ÷ horas efectivas (duración del tramo − programadas − no programadas).
7. **Total turno** = suma de marcas; las pendientes también suman minutos de parada.
8. **Cerrar marca** abre una confirmación con el resumen y la lista de paradas; exige «Revisé las paradas de esta marca». La última marca pide la misma casilla antes de «Enviar cierre de turno».
9. **Enviar cierre de turno** se bloquea con paradas pendientes (pantalla y servidor). En turnos anteriores al 26/11/2026 las pendientes no bloquean.
10. **Marca cerrada:** se le pueden agregar paradas olvidadas («+ Parada olvidada a X») sin reabrirla; se recalcula su resumen y queda quién y cuándo.
11. **Avance y Cierre (texto de WhatsApp e imagen):** un bloque general por línea con la producción de cada marca, producción total, horas efectivas, ratio del turno, personal y una sola lista de PARADAS ordenada por hora (las sin hora al final con «—»), con el pie Programadas / No programadas / Total.

### Tiempo real y sin conexión
- Las paradas de `sync/avancesTurno` se escuchan desde el panel aunque no esté abierta la pestaña Avance. `cierre_tramos`, `cierres_turno` y `paradas_tramo` están en Supabase Realtime (solo lectura para quien ve el resumen): si un supervisor agrega una parada o cierra una marca, las demás pantallas se actualizan solas. El panel no quita el foco a quien está escribiendo.
- Las constancias a glacial_70 pasan por una cola local que se reintenta al volver la conexión; son idempotentes (`client_event_id`) y hay una fila por parada (dos equipos = una parada).

### Estado
- glacial_70 aplicada en **PRUEBAS** (prueba SQL 17/17; la de glacial_69 sigue 21/21). **No** en producción.
