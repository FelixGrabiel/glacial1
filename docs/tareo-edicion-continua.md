# Tareo: marcar varias filas seguidas sin reinicios, sin horas cruzadas y sin perder cambios

## Causa reproducida
Con las funciones REALES de `13-tareo.js` (versión del commit anterior) y una base simulada con latencia (un documento `sync/tareos`, transacciones, snapshots atrasados):

| Escenario | Antes | Después |
| --- | --- | --- |
| 10 ASISTIÓ seguidos con snapshots atrasados | formulario reconstruido **10 veces** (el reinicio que ve el supervisor) | **0** reconstrucciones, 10 asistencias guardadas |
| Marcar ASISTIÓ y, con un snapshot atrasado en medio, escribir la salida de esa persona | la nube queda **sin ASISTIÓ** (`asistencia:""`) | ASISTIÓ + salida |
| Dos dispositivos: refrigerio 12:10 (A) y salida 18:05 (B) de la misma persona | se pierde el refrigerio | se conservan ambos |
| Fusión de Mantenimiento con `trabajadorId` vacío (dos personas) | **1** persona (se combinan) | 2 personas |
| Repetir ASISTIÓ con horas | (ya conservaba las horas; cambiaba autor y fecha) | no cambia nada |

Causas activas (comprobadas, no todas las del informe son la causa de la versión publicada):
1. `tareoEditarPersona` reordenaba y llamaba a `renderTareoFormulario` (reemplaza todo `main`) en **cada** marcación → reinicio de la tabla, filas que se mueven bajo el cursor y clics que caen en otra fila.
2. El listener de `sync/tareos` (02-estado.js) **reemplazaba `_tareosCache`** con lo recibido: un snapshot atrasado revertía en pantalla marcaciones aún pendientes, y la siguiente edición partía de esa copia vieja.
3. El guardado enviaba la **persona completa** copiada de esa caché y la fusión elegía el registro entero por `actualizadoEn`: una copia vieja pisaba campos recientes (ASISTIÓ, refrigerio…).
4. La fusión de Mantenimiento usaba `String(trabajadorId ?? dni ?? nombre)`: un `''` no pasa al siguiente valor y varias personas compartían clave.
5. `obtenerTareos()` reordena el arreglo en cada lectura y `tareoEditarPersona` usaba `.find()` sobre la clave (primera coincidencia con claves repetidas).
6. Marcar ASISTIÓ cambiaba `registradoEn/registradoPor` antes de la confirmación (cancelar dejaba cambios a medias) y aunque el estado no cambiara.

## Qué se cambió
Nuevo `js/personal/45-tareo-edicion-continua.js` (`window.TareoEd`) y ajustes puntuales en `13-tareo.js` y `02-estado.js`; se reutilizan la transacción y la cola local existentes (no hay otra cola ni otra colección ni migración).
- **Identidad**: una sola clave (`tareoClavePersona`: id → DNI → nombre, normalizados). Filas que la comparten reciben un `filaId` persistente (se guarda **una sola vez en la nube**, el resto lo adopta; mientras tanto esa fila no se edita y se avisa); las personas nuevas nacen con `filaId`. Una clave ambigua **no se modifica** y se avisa. Homónimos sin documento ya no se eliminan al sincronizar Mantenimiento.
- **Operaciones concretas**: cada edición es `{tareoId, persona, campos cambiados, valor, ts}` y se aplica a la versión actual **dentro** de la transacción. Campo a campo gana el cambio más reciente (`persona.camposTs`); las ediciones concurrentes del mismo campo se resuelven igual en cualquier orden. Las horas calculadas se recalculan sobre la persona correcta.
- **Actualizaciones recibidas**: el listener reconcilia lo recibido con las operaciones aún no confirmadas (y con copias completas en vuelo); nada pendiente se pierde.
- **Sin reconstruir la tabla**: se actualiza solo la fila afectada, los indicadores y, si lo recibido cambió, las filas de otros equipos (una fila con un campo en uso se pone al día al salir del campo). El orden se congela mientras se trabaja (botón «↕ Ordenar» o reabrir el tareo). Foco, búsqueda y desplazamiento se conservan.
- **Estado de guardado**: por fila y global («Guardando… / Todos los cambios guardados ✓ / N cambios sin guardar · Reintentar»); «Guardado» solo tras confirmar la transacción; los errores conservan la edición y se reintentan sin duplicar. Se avisa al cambiar de pantalla o cerrar con cambios sin confirmar.
- Se conservan la auditoría (misma llamada a `guardarTareoEnMemoria`), permisos, Modo visualización (sin operaciones ni escrituras), maquinistas y personal por día.

## Pruebas
`tests/tareo-edicion-continua.test.js` (+ `tests/tareo-harness.js`): funciones reales con una nube simulada y varias sesiones — 16 escenarios del prompt (diez ASISTIÓ con latencia; ingresos, refrigerios, retornos y salidas con escritura manual y botones «Ahora»; escribir y clic inmediato; snapshot remoto entre marcaciones; dos sesiones con trabajadores o campos distintos; repetir ASISTIÓ; ordenar/filtrar; ids vacíos/espacios/repetidos/homónimos; fallo y reintento; cambio de tareo con pendientes; recarga; Producción y Mantenimiento; solo visualización) más agregar personas junto a operaciones pendientes y cancelar una corrección.
En el navegador (app real, base simulada con latencia): 6 clics seguidos en ASISTIÓ → 0 reemplazos de pantalla, orden estable, fila no tocada intacta, indicador «Guardando…» → «Todos los cambios guardados ✓»; un cambio remoto en otra fila se refleja sin reconstruir, el campo en uso conserva foco y valor escrito.

## Pendiente de probar en PRUEBAS (dispositivos reales)
Dos supervisores con red real sobre el mismo tareo; tareo de Mantenimiento con maquinistas; noche tras medianoche; una fila con nombre repetido (se guardan los `filaId` la primera vez que se abre).
