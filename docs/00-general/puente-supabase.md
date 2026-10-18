# Puente Firebase → Supabase (rama `supabase`)

Desde esta rama **los datos de GLACIAL viven en Supabase** y la página ya no carga Firebase.
El resto de los archivos no cambió: siguen usando `firebase`, `db` y `auth`. El archivo
`js/nucleo/00b-puente-supabase.js` define esos mismos objetos y traduce cada llamada a Supabase.

## Qué cambió en la página

| Archivo | Cambio |
|---|---|
| `index.html` | En lugar de los 4 archivos de Firebase carga `supabase-js` (versión fija) y el puente. |
| `js/nucleo/01-config.js` | `CONFIG_PRUEBAS` / `CONFIG_PRODUCCION` tienen la dirección y la clave pública de Supabase. |
| `js/nucleo/00b-puente-supabase.js` | **Nuevo.** El puente. Debe cargarse antes de `01-config.js`. |
| `supabase/functions/fs-cuentas/` | **Nuevo.** Función de servidor: el Administrador crea cuentas sin cerrar su sesión. |

## Entornos

| Entorno | Cuándo | Proyecto de Supabase |
|---|---|---|
| PRODUCCION | La página se abre desde un dominio de `DOMINIOS_PRODUCCION` | `ehtbwmvwoxcdefvlxttu` |
| PRUEBAS | Cualquier otra dirección (franja roja) | `mvxjopvnnagqytegtexi` («GLACIAL pruebas») |

Los dos proyectos tienen la misma estructura, reglas y función `fs-cuentas`. Todo cambio en la base de datos se aplica
primero en PRUEBAS y después en PRODUCCION. Las cuentas de usuario son independientes en cada proyecto.

## Cómo se guardan los datos

- Un documento de Firestore = una fila de la tabla `fs_docs` (`coleccion`, `id`, `datos`).
- **Cada lista de objetos con clave única** (`items`, `paradasOperativas`…; clave `id`, `username`, `clave`, `opId`,
  `email` o `uid`) **se parte: cada elemento es una fila de `fs_items`.** Ya no existe el límite de 1 MiB por documento.
- Al guardar una lista **solo viaja lo que cambió** (altas, cambios y bajas). Por eso, si dos personas guardan la
  misma lista a la vez (dos supervisores registrando paletas), no se pisan.
- Nada se borra físicamente: lo eliminado queda marcado (`eliminado_en`) y se puede recuperar.
- Las reglas de `_archivo/firebase/firestore.rules.etapa2.txt` están trasladadas una a una a la base de datos
  (`glacial_fs.puede_leer` y `glacial_fs.autorizar`). Los permisos salen del documento `sync/perfiles`, igual que antes.

## Tiempo real y varios dispositivos

- Cada guardado produce **un aviso** a todos los dispositivos conectados (la fila del documento con su `version`).
- Si el guardado tocó una lista partida, cada dispositivo pide al servidor **solo lo que cambió desde su versión**
  (`fs_cambios`) y lo aplica de una vez: la página nunca ve un guardado a medias.
- Un aviso perdido se recupera con el siguiente, al reconectar, al volver a la pestaña y cada 3 minutos (una consulta
  pequeña, `fs_versiones`).
- Sin conexión los guardados quedan en cola (mientras la pestaña siga abierta) y se envían solos al volver; un guardado
  cuya respuesta se perdió no se aplica dos veces.
- Las transacciones (`db.runTransaction`) se validan en el servidor: si el documento cambió, se reintentan.

## Funciones de la base de datos que usa el puente

`fs_leer`, `fs_cambios`, `fs_versiones`, `fs_consulta`, `fs_commit`, `fs_es_admin` (esquema `public`) y la función
de servidor `fs-cuentas`. Migraciones `glacial_20a` … `glacial_20h`.

## Lo que el puente admite (y lo que no)

Admite todo lo que la página usa hoy: `collection/doc`, `get/set/update/delete/add`, `onSnapshot` (documentos y
consultas, `docChanges`, `includeMetadataChanges`), `where` (`==`, `<`, `<=`, `>`, `>=`), `orderBy`, `limit`,
`runTransaction`, `batch`, subcolecciones, `FieldValue.serverTimestamp()/delete()`, `Timestamp`, y de la sesión:
`signInWithEmailAndPassword`, `signOut`, `onAuthStateChanged`, `currentUser` (`uid`, `displayName`,
`updatePassword`, `updateProfile`), `setPersistence`, y la app «secundaria» para crear cuentas.

**No admite** (avisar antes de usarlo en código nuevo): `where` con `in`, `array-contains`, `!=`;
`FieldValue.increment/arrayUnion/arrayRemove`; `startAfter/endBefore`; `update()` con rutas con punto (`'a.b'`);
almacenamiento de archivos de Firebase; Cloud Functions de Firebase (`MANT_PIN_MODO='functions'`).

## Reglas de permisos: cómo se trasladan a Supabase

Cada bloque `match /coleccion/{id}` de `_archivo/firebase/firestore.rules.etapa2.txt` tiene su equivalente en las funciones
`glacial_fs.puede_leer` (leer) y `glacial_fs.autorizar` (crear, cambiar, borrar) de la base de datos. Cuando se agrega o
cambia una regla en Firebase hay que agregar la rama equivalente en Supabase, **primero en PRUEBAS y después en
PRODUCCION**, y comprobar que las funciones de los dos proyectos quedan idénticas (misma huella). Los cambios quedan en
`supabase/migraciones/` (por ejemplo `glacial_21_…`, `glacial_22_…`).

Las listas de objetos con `id` se guardan aparte (una fila por elemento) y **no llegan dentro de los datos** que recibe la
regla. Para validarlas:
- largo de una lista: `glacial_fs.largo(n, meta->'conteos', 'campo')` (después) y `glacial_fs.largo(v, meta->'conteos_antes', 'campo')` (antes);
- listas que cambiaron en el guardado: `meta->'partes_tocadas'` (la regla usa `afect_t`, equivalente a `affectedKeys()`);
- «la lista solo crece en uno y lo anterior no cambia» (`historial[0:n] == anterior`): `glacial_fs.lista_solo_agrega(c, d, 'campo', v, n, meta)`.

Colecciones con regla en Supabase (13-10-2026): las de la copia inicial más `entregasTurno`, `compromisosProgramacion`,
`intervenciones`, `planesPreventivos`, `correccionesParada`, `reclasificacionesParada` y (15-10-2026, `glacial_23`)
`tareos` y las 9 del Asistente de Producción (`apInsumos`, `apFactores`, `apMovimientos`, `apSolicitudes`, `apMermas`,
`apConciliaciones`, `apCoordinaciones`, `apParametros`, `apAuditoria`). Toda colección nueva también debe
agregarse a la herramienta de copia (`docs/migracion/copiar-firebase-a-supabase.js`).

## Regla para todo cambio futuro

Lo que se construya debe **verse en tiempo real desde muchos dispositivos**: leer con `onSnapshot`, guardar listas
completas con `set` (el puente envía solo la diferencia) o con `runTransaction` cuando el nuevo valor depende del
anterior, y dar a cada elemento de una lista un `id` único.

## Pruebas

- `node tests/puente-supabase.test.js` — el puente contra un servidor simulado: varios dispositivos, avisos perdidos,
  cortes de conexión, transacciones, consultas, sesión.
- `node tests/puente-pagina.e2e.js` — la página real en un navegador (requiere Playwright): inicio de sesión,
  recorrido del menú, guardado en un dispositivo y aparición en vivo en otro.
