# Tareo: guardado concurrente sin pérdidas, duplicados ni sobrescrituras

## 1. Diagnóstico

**Error reportado:** «No se pudo guardar "tareo" en la nube. Motivo: the stored version (…) does not match the required base version (…)», seguido de «falta permiso o internet».

**Comprobado en el código:**

- **Origen del texto.** La alerta la armaba `_avisarErrorGuardado` (`js/nucleo/02-estado.js`). El texto «falta permiso o internet» era fijo, para cualquier error.
- **Ruta del error.** El error de versión venía de la transacción de `tareoGuardarEnNube` (`js/personal/13-tareo.js`).
  - La otra ruta que usa esa alerta, `saveTareos`, hace un guardado simple que no puede producir ese error.
  - Firestore 10.13 reintenta una transacción hasta 5 veces cuando el documento que leyó cambió antes de confirmar. Cuando se agotan los 5 intentos, devuelve ese mensaje: es un **conflicto de concurrencia**, no un error de permisos ni de conexión.
- **Un solo documento.** `sync/tareos` contenía **todos** los tareos de todas las áreas y fechas, sin archivo. Cualquier marca de cualquier supervisor competía con todas las demás, y el documento crecía hacia el límite de 1 MiB.
- **Varios escritores sobre ese documento:**
  - las operaciones de asistencia (`45`, función `enviar`);
  - el guardado del tareo completo;
  - los identificadores de fila;
  - la corrección de la salida de maquinistas.
- **Escrituras sin que nadie editara.** El formulario sincronizaba maquinistas en cada redibujado (`renderTareoFormulario` → `tareoSincronizarMaquinistas`).
- **Riesgo de pérdida.** Eliminar un tareo reescribía `sync/tareos` completo con la copia local, sin transacción, y podía borrar lo marcado por otros en ese instante.
- **Pendientes solo en memoria.** Lo que no se había confirmado se perdía al recargar.
- **Pérdida silenciosa con relojes desfasados.** Si un supervisor corregía un valor que ya veía, pero el reloj de su equipo iba atrasado, el cambio se descartaba y aun así se mostraba como «guardado».

**No comprobado:** no tuve acceso a los datos reales, así que no sé qué combinación concreta agotó los 5 intentos en este caso ni el tamaño actual de `sync/tareos`. La causa estructural, el documento único compartido, sí está confirmada.

## 2. Fase 1: corrección sin cambiar Firestore

### `js/personal/13n-tareo-nube.js` (nuevo)

Es la única forma de escribir tareos.

- `modificar(ids, fn)` lee **solo** los tareos indicados dentro de una transacción, los modifica y escribe solo esos.
- **Reintentos:** hasta 3 rondas más, con espera creciente, para conflicto, falta de conexión o fallo temporal. Nunca para permisos, tamaño ni validaciones.
- `clasificarError()` asigna el mensaje según el tipo de error:

| Situación | Mensaje |
|---|---|
| Conflicto de versiones | «Este registro cambió en otro equipo. Actualizaremos los datos y conservaremos tu modificación pendiente para revisarla o reintentar de forma segura.» |
| Sin conexión | «Sin conexión. Hay cambios pendientes de sincronización.» |
| Permisos | «Tu usuario no tiene permiso para guardar este tareo.» |
| Error temporal | «No fue posible sincronizar ahora. Se intentará nuevamente sin duplicar el registro.» |
| Confirmado | «Tareo guardado en la nube.» |

- **Pendientes:** las operaciones de asistencia no confirmadas se guardan en el navegador, por usuario y durante 24 horas, y se borran al cerrar sesión.
  - Al recargar se recuperan y se reenvían.
  - Reenviarlas no duplica nada, porque cada operación fija su campo con su propia hora.
  - Se guardan el identificador del trabajador, los campos editados y sus horas. Es el mínimo necesario para no perder la marca.

### `js/personal/45-tareo-edicion-continua.js`

- **Mismo campo editado a la vez por dos usuarios:** el segundo cambio **no pisa** al primero.
  - La fila de ese usuario muestra «Conflicto: revisar», con el valor del otro usuario.
  - Su cambio queda pendiente. Al pulsar «Reintentar», deja su valor por decisión explícita.
- **Corregir algo que ya se veía:** se aplica aunque el reloj del equipo vaya atrasado. Ya no se descarta en silencio.
- **Estados en pantalla:** Guardando… · Guardado en la nube ✓ · Pendiente de sincronización · Conflicto: revisar · Error de permisos. El detalle aparece al pasar el cursor.
- **Reintento automático** tras un fallo de conexión o un fallo temporal: al volver la conexión o a los 30 segundos, como máximo 5 rondas.

### `js/personal/13-tareo.js`

- **Guardado del tareo completo:** pasa por `TareoNube.modificar`. Si falla por conflicto o conexión, el cambio sigue aplicado en pantalla y se reintenta solo, hasta 3 rondas.
- **Eliminar:** una transacción que quita **solo** ese tareo. Antes reescribía todo el documento.
- **Salida de maquinistas:** pasa por la misma capa, con mensajes precisos.
- **Maquinistas de la rotación:** se sincronizan una vez por apertura del tareo, ya no en cada redibujado.

### `js/nucleo/02-estado.js`

La alerta genérica de guardado ahora explica la causa real (conflicto, permisos, conexión o tamaño) y deja de decir «falta permiso o internet» para todo.

## 3. Fase 2: un documento por tareo

Con `TAREO_POR_DOCUMENTO` activado en `js/nucleo/01-config.js`:

- **Escritura:** cada tareo se guarda en `tareos/{id}`, donde id es el id del tareo. Solo compiten quienes editan **ese** tareo.
- **Migración al guardar:** si el tareo aún no tiene su documento, la misma transacción lo toma de `sync/tareos`.
- **El documento compartido no se toca:** `sync/tareos` no se modifica ni se borra y queda como historial de solo lectura.
- **Lectura** (`02-estado.js`): se combinan `sync/tareos` y la colección `tareos`.
  - El documento individual se fusiona campo a campo con el del legado. Así, lo que marque un equipo que todavía tiene la versión anterior de la app no se pierde.
- **Eliminar:** el documento queda con `eliminado: true` y conserva sus datos, así que se puede recuperar.
- **Tamaño:** cada documento pesa unos pocos KB y ninguna operación se acerca al límite de 1 MiB.

**Reglas nuevas** (`firestore.rules.etapa2.txt`, `match /tareos/{id}`). Mantienen los mismos permisos que ya tiene `sync/tareos`:

- **Leen:** todos los usuarios con sesión.
- **Escriben:** los usuarios con sesión, salvo los de solo consulta y la cuenta compartida de Mantenimiento.
- **Condición:** el id del documento debe coincidir con el campo `id`.
- **Borrar:** no se permite.

El control por área (Producción / Mantenimiento) sigue en la aplicación, como hoy.

### Cómo activarla (requiere tu aprobación en cada paso)

1. **Publica las reglas en PRUEBAS.** Copia `firestore.rules.etapa2.txt` completo en Firebase Console › Firestore › Reglas del proyecto `pruebas-b11b7` y publícalas.
2. **Activa PRUEBAS.** En `01-config.js` pon `TAREO_POR_DOCUMENTO_POR_ENTORNO = { PRODUCCION: false, PRUEBAS: true }` y publica la app.
3. **Prueba con dos navegadores** siguiendo la sección 5.
4. **Repite en PRODUCCIÓN:** publica las reglas en `jefaturaopglacial-fdb95` y pon `PRODUCCION: true`.

Si activas el interruptor sin haber publicado las reglas, el Tareo no podrá guardar y mostrará «Tu usuario no tiene permiso para guardar este tareo». Para volver, pon el interruptor de nuevo en `false`.

### Respaldo y reversión

- **Antes de activar:** exporta `sync/tareos` desde Firebase Console (o con `gcloud firestore export`).
- **Para volver atrás:** pon `TAREO_POR_DOCUMENTO` en `false`. La app vuelve a leer y escribir solo `sync/tareos`.
  - Atención: lo marcado mientras estuvo activado vive en `tareos/{id}` y no se copia de vuelta automáticamente.
  - Para conservarlo hay que copiarlo a `sync/tareos`. Ese paso se puede preparar si hiciera falta.
- **Nada se borra:** ni `sync/tareos` ni los documentos individuales.

## 4. Lo que no cambia

- Los cuatro controles del Tareo (ingreso, refrigerio, retorno y salida), el cálculo de horas y tardanzas, la auditoría y el historial de correcciones.
- La rotación del Excel como fuente de asignación y los permisos de solo consulta.

## 5. Guía de pruebas con dos navegadores

Abre dos navegadores (o uno normal y uno en ventana privada) con dos supervisores distintos y el mismo tareo abierto.

1. **Trabajadores distintos:** A marca ASISTIÓ a un trabajador y B a otro al mismo tiempo. Los dos quedan guardados y aparecen en ambos navegadores sin recargar.
2. **Campos distintos:** A cambia el refrigerio y B la salida del mismo trabajador. Se conservan ambos.
3. **Mismo campo:** A pone la salida a las 17:00 y, a la vez, B la pone a las 17:30.
   - Uno de los dos ve «Conflicto: revisar» con el valor del otro.
   - Al pulsar «Reintentar», deja su valor.
4. **Tiempo real:** A registra una salida y B la ve aparecer sin recargar.
5. **Sin conexión:** en A, activa el modo avión (o en DevTools › Network › Offline) y marca a alguien.
   - Debe decir «Pendiente de sincronización», nunca «guardado».
   - Al volver la conexión, se guarda una sola vez.
6. **Recarga con pendientes:** con un pendiente sin conexión, recarga la página y vuelve a conectarte. El cambio se recupera y se guarda.
7. **Varios clics:** pulsa ASISTIÓ varias veces. No aparecen filas duplicadas.
8. **Solo lectura:** con un usuario de solo consulta, el Tareo no permite editar, y las reglas rechazan la escritura.
9. **Eliminar:** elimina un tareo mientras otro supervisor marca en otro tareo. La marca del otro supervisor no se pierde.

## Pruebas automáticas

- **`tests/tareo-guardado-concurrente.test.js`:** 55 comprobaciones de los casos anteriores, en los dos modos. La simulación reproduce el error real de versión y los 5 intentos de Firestore.
- **`tests/reglas/etapa2-emulador.js`:** 41 casos de reglas en el emulador, 6 de ellos de `tareos/{id}`.
