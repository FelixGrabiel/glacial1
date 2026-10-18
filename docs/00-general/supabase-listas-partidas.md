# Supabase · reglas y listas partidas

> Esta sección pertenece a `docs/00-general/puente-supabase.md` (que vive en la rama `supabase`, no en `main`). Se deja aquí para pasarla ahí cuando las ramas se junten.

El puente guarda **aparte** (tabla `fs_items`) toda lista de objetos con un id único (`historial`, `novedades`, `tareas`, `filas`…). Esas listas **no llegan dentro de `n`** (los datos nuevos) en `glacial_fs.autorizar`: una regla que pregunta `jsonb_typeof(n->'lista') = 'array'` o su largo `jsonb_array_length(n->'lista')` rechaza un guardado válido.

Cómo se escribe una regla que depende de una lista partida (migración `glacial_21_listas_partidas_mantenimiento`, ya aplicada en PRUEBAS y PRODUCCIÓN):
- **Largo de una lista:** `glacial_fs.largo(n, meta->'conteos', 'campo')` (el «después»). Para el «antes»: `glacial_fs.largo(v, meta->'conteos_antes', 'campo')`. Devuelve el largo tanto si la lista está partida como si viene dentro de los datos, y `null` si no es una lista.
- **Si una lista cambió:** `meta->'partes_tocadas'` trae las listas partidas que se modificaron. La regla usa `afect_t = afect + partes_tocadas`, el equivalente de `affectedKeys` de Firestore.
- Ejemplos: `entregasTurno` (novedades), `compromisosProgramacion` (filas), `intervenciones` (historial: +1 por cambio) y `planesPreventivos` (tareas).

Al escribir una regla nueva en `_archivo/firebase/firestore.rules.etapa2.txt` que valide una lista, indica en el commit **qué listas valida** para que la regla equivalente de Supabase use `glacial_fs.largo()`.
