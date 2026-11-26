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
