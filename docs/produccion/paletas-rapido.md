# Paletas · captura al minuto, cola sin conexión y reglas en SQL (26/11/2026)

Pestaña **Paletas** de *Registro de producción*. Archivos: `js/produccion/16d-paletas-cola.js` (cola y reglas puras), `js/produccion/16e-paletas-rapido.js` (pantalla),
`supabase/migraciones/glacial_68_paletas_integridad.sql` (+ `supabase/pruebas/paletas_integridad.sql`). Pruebas: `tests/paletas-cola.test.js` (rápida),
`tests/paletas-rapido.e2e.js` (Chromium) y la prueba SQL.

## Dónde viven las paletas (hallazgos, verificados en PRUEBAS el 26/11/2026)

- **No existe una tabla «paletas».** Es el documento `sync/paletas` del puente Firestore→Supabase: una *lista partida* en `public.fs_items`
  (`coleccion='sync'`, `doc='paletas'`, `campo='items'`, `id` = id de la paleta, `datos` jsonb), PK `(coleccion, doc, campo, id)`, FK a `public.fs_docs`,
  baja lógica en `eliminado_en` y triggers ya existentes de otras colecciones (`poner_raiz`, `proteger_registros`, `al_cambiar_cuenta`). En PRUEBAS: 870 registros.
- Cada fila es **un acumulado**, no un incremento: `paletas` = «paletas completas acumuladas» del turno para esa marca/presentación, `tipoPaleta` = `COMPLETA` | `INCOMPLETA` (saldo),
  `totalUnidades`, `unidadesPorPaleta`, `unidadesIncompleta`, `hora` (HH:MM de Lima), `creadoEn` (ms). El **último** registro de cada tipo, por turno, manda
  (`ultimoEstado` en `16-paletas.js`: ordena por `creadoEn` y, si empatan, por `hora`). Por eso `creadoEn` de un registro de la cola es el instante del toque.
- Guardar = `db.runTransaction` sobre el documento completo (lee la lista, agrega/reemplaza por `id`, `tx.set`). El puente parte la lista y escribe solo lo que cambió.
  Antes de este cambio **sin conexión el guardado fallaba** (la transacción necesita leer) y el registro se perdía.
- Ya existía idempotencia a dos niveles que se aprovechan: el `id` del registro (un reenvío con el mismo `id` reemplaza, no duplica) y `glacial_fs.commits.clave` (UUID único por commit).
- Reglas previas en SQL: `glacial_fs.autorizar` (permisos; `glacial_32`: no borrar el documento ni quitar más de 10 elementos de golpe). **No había validación del contenido de cada paleta.**
- Las columnas `client_event_id` / `captured_at` no se agregaron a `fs_items` (afectaría a todas las colecciones). Viajan en `datos` y el libro `glacial_fs.paletas_eventos` las expone como columnas reales.

## Comportamiento en la pantalla

1. **Marca y Presentación automáticas.** Con fecha, turno y línea elegidos se busca el primer tramo de la *Secuencia del turno* que aún no terminó (por hora de corte, por cantidad
   producida o «hasta el cierre») y se seleccionan su marca y presentación. Se reevalúa cada 10 s y al cambiar fecha/turno. Si el operario cambia la marca o la presentación a mano,
   la secuencia **deja de tocarlas** en esa fecha/turno/línea (se anota por borrador). Si no hay secuencia o todos los tramos terminaron, no se toca nada.
2. **Corte del tramo anterior.** Al agregar un tramo, si el tramo anterior era «hasta el cierre del turno» (o «por hora» sin hora), se pregunta: *¿cortarlo a las HH:MM (ahora)?*
   Aceptar lo pasa a «por hora» con esa hora (`corteAutomatico:true`); Cancelar lo deja como estaba. Los tramos «por cantidad» ya tienen su fin y no se tocan.
3. **«+1 Paleta (Ahora)».** Toma el minuto exacto del toque (hora de Lima con el reloj del servidor), suma 1 al **acumulado visible** y lo guarda por la cola. El botón muestra a qué
   marca/presentación va y el nuevo acumulado. Se bloquea mientras guarda y 1,2 s después. Si la fecha del borrador no es la del día operativo, pide confirmación.
   Con un registro en edición está deshabilitado. El acumulado, `Saldo (paquetes)`, `Hora` y `Observaciones` se siguen pudiendo editar a mano (registros retroactivos).
4. **Hora al minuto.** Mientras nadie edite el campo *Hora* en esa captura, se mantiene en la hora actual (se revisa cada 10 s).
5. **Último registro**: «Último registro: 9 acumuladas · Bells · 2.5 L PACK X 6 UND · 09:54 (hace 3 min)», de la línea/fecha/turno, incluyendo los pendientes.
6. **«Guardar»** de un registro **nuevo** también pasa por la cola. **Editar** un registro existente sigue siendo directo (necesita conexión).

## Cola sin conexión (idempotente)

- Cada toque crea un evento `{clientEventId (UUID), capturadoEn (ISO del toque), registro}`; el `id` del registro es `pal_<clientEventId>`. Se guarda **primero** en `localStorage`
  (`glacial_paletas_cola_v1`) y luego se intenta subir. Sobrevive a recargar o cerrar el navegador (si `localStorage` no está disponible, queda en memoria mientras la pestaña viva).
- **Acumulado visible** = último registro COMPLETO de la combinación entre los *confirmados* y los *pendientes* (sin contar dos veces un pendiente ya confirmado).
- **Sincronización**, siempre en orden de captura y de a uno por transacción: al volver `online`, al enfocar/volver a la ventana, cada 30 s, al cambiar la conexión del puente y tras cada toque.
  Un solo envío a la vez (varias llamadas comparten la misma corrida).
- **Sin duplicar**: antes de escribir, la transacción busca el `id` o el `clientEventId` en el documento; si ya está, no escribe y lo da por subido (respuesta perdida = reintento inofensivo).
  El servidor lo refuerza con la migración (abajo).
- Errores: *red / sesión / conflicto* → se conserva y se reintenta (espera 3, 6, 12… hasta 60 s); *duplicado* → subido; *rechazado* (permiso o regla SQL) → queda marcado,
  **no bloquea a los siguientes** y se puede «Reintentar los rechazados» o «Descartar». Un error desconocido se rechaza tras 8 intentos.
- Indicador: **En línea** · **Sin conexión · N pendientes por subir** · **N pendientes por subir** · **N registros rechazados**.
- Límite conocido: si un registro ya confirmado por el servidor se **elimina** desde la tabla de la pantalla y justo después un reintento atrasado de ese mismo evento llega, el registro reaparecería
  (el reintento solo ocurre si la respuesta se perdió y la cola siguió pendiente; se resuelve borrando de nuevo).

## Migración `glacial_68_paletas_integridad.sql` (NUEVA, no aplicada)

- `glacial_fs.paleta_item_error(datos)`: NULL si el registro es válido o el motivo. Reglas flojas para no bloquear correcciones ni saldos: `tipoPaleta` COMPLETA|INCOMPLETA; `linea`, `marca`,
  `presentacion`, `fecha` (AAAA-MM-DD real) y `turno` (DÍA|INTERMEDIO|NOCHE) obligatorios; `hora` HH:MM si viene; `paletas`, `totalUnidades`, `unidadesPorPaleta`, `unidadesIncompleta` numéricos **≥ 0**
  (0 vale); COMPLETA con `paletas` entero; `clientEventId` UUID y `capturadoEn` ISO-8601 cuando hay evento.
- Triggers `BEFORE INSERT/UPDATE` en `public.fs_items` solo para `sync/paletas/items`: validan el registro **nuevo**; las bajas lógicas nunca se bloquean; una fila vieja no se revalida si no cambia su contenido;
  `clientEventId` no se puede cambiar. Error `23514` con el motivo («paletas: …»).
- Libro `glacial_fs.paletas_eventos`: `client_event_id uuid PRIMARY KEY` (UNIQUE), `captured_at timestamptz`, `recibido_en timestamptz default now()` y el resumen del registro. Triggers `AFTER` lo llenan;
  el mismo evento en **otra** paleta → `23505` (duplicado); el mismo registro reenviado/corregido actualiza el resumen sin mover `captured_at`. Registros antiguos (sin `clientEventId`): **nulos permitidos**, no entran al libro.
  RLS activado sin políticas y sin permisos para `anon`/`authenticated`. Vista `glacial_fs.v_paletas_captura` con `retraso = recibido_en − captured_at`.
- No cambia `autorizar` ni `fs_commit`; no toca datos existentes. Se puede ejecutar más de una vez. Marcha atrás: `drop trigger fs_paletas_validar_ins, fs_paletas_validar_upd, fs_paletas_evento_ins, fs_paletas_evento_upd on public.fs_items`.
- Verificado antes de escribirla: las 870 filas de PRUEBAS cumplen todas las reglas (0 violaciones). Ver la prueba abajo.

### Cómo aplicarla (PRUEBAS primero)

1. **PRUEBAS** (`mvxjopvnnagqytegtexi`, SQL Editor): pegar `glacial_68_paletas_integridad.sql` y ejecutar. Luego pegar `supabase/pruebas/paletas_integridad.sql` (termina en `ROLLBACK`; debe imprimir
   `OK glacial_68: 20 comprobaciones`).
2. Probar la página (abajo) contra PRUEBAS.
3. Opcional, antes de PRODUCCIÓN: contar filas que **no** pasarían la regla (debe dar 0):
   `select count(*) from public.fs_items where coleccion='sync' and doc='paletas' and campo='items' and eliminado_en is null and glacial_fs.paleta_item_error(datos) is not null;`
   (se corre ya con la migración puesta en PRUEBAS; en PRODUCCIÓN, tras aprobarla). Las filas viejas inválidas no se bloquean, pero no podrán editarse hasta corregirlas.
4. **PRODUCCIÓN** (`ehtbwmvwoxcdefvlxttu`) solo con la aprobación del dueño. Orden recomendado: subir la página y luego la migración (la página funciona sin la migración; con ella el servidor también valida).

## Cómo probar en http://localhost:5599

1. `node tests/visual/servir.js` y abrir `http://localhost:5599/index.html` (modo PRUEBAS: franja roja «BASE DE PRUEBAS»). Entrar con un usuario con permiso *Paletas* y abrir
   **Producción › PET 1 › Paletas**. Debe verse la barra azul con **+1 Paleta (Ahora)**, **Acumulado actual** y **En línea**.
2. *Secuencia*: con una programación y un tramo vigente para hoy, Marca/Presentación se eligen solas; cambiarlas a mano las deja fijas. Agregar un tramo nuevo con el anterior «hasta el cierre» pregunta si cortarlo ahora.
3. *+1 en línea*: tocar **+1 Paleta (Ahora)**: el acumulado sube 1 y «Último registro» muestra la hora; un doble toque rápido registra una sola paleta.
4. *Corte de red*: DevTools › Network › **Offline** (o apagar el Wi‑Fi). Tocar +1 dos veces: el acumulado visible sigue subiendo y el indicador dice **Sin conexión · 2 pendientes por subir**.
   DevTools › Application › Local Storage › `glacial_paletas_cola_v1` muestra los 2 eventos con su `clientEventId` y `capturadoEn`. (Opcional: recargar la página: siguen ahí.)
5. *Reintento*: volver a **No throttling** (online): en segundos suben solos, en orden, y el indicador vuelve a **En línea**. En PRUEBAS: `select * from glacial_fs.v_paletas_captura order by captured_at desc;`
   (con la migración puesta) muestra `captured_at` (hora del toque) frente a `recibido_en` (hora de subida).
6. *Reintento duplicado*: en la consola del navegador, con la sesión abierta:
   `const r = loadPaletas().slice(-1)[0]; await glacialPaletasRapido.enviarRegistro(r)` → devuelve `'duplicado'` y el conteo de `loadPaletas()` no cambia.
   Para ver el rechazo del servidor (con la migración): `await glacialPaletasRapido.enviarRegistro({...r, id:'pal_x', clientEventId: crypto.randomUUID(), capturadoEn: new Date().toISOString(), paletas: -1})` falla con «paletas: paletas debe ser un número >= 0»;
   y con el mismo `clientEventId` de otro registro, con «duplicado» (`23505`).
7. Automáticas: `node tests/correr-todo.js` (incluye `tests/paletas-cola.test.js`); en navegador real: `node tests/paletas-rapido.e2e.js`.
