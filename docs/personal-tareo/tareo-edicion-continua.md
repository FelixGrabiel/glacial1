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

## Quitar y agregar personal con alcance (20/11/2026)
**Quitar.** El botón «✕ Quitar» de cada fila (solo quien edita ese tareo; no en Modo visualización) abre una ventana con tres alcances y una vista previa de cuántos tareos se tocan:
- **Solo este tareo:** se quita aquí; mañana vuelve a aparecer si sigue en la rotación.
- **Desde una fecha en adelante** (la fecha se elige; por defecto la del tareo): ya no trabaja aquí. Deja una exclusión permanente en `tareo.personalExcluido` (`permanente`, `desde`, `alcance`) que rige para esa área desde esa fecha: la sincronización con la rotación Excel, con Mantenimiento y con maquinistas, y la creación de tareos nuevos ya no la traen. **Además se borra físicamente de los tareos ya creados de esa área desde esa fecha.**
- **De todos los tareos:** igual pero sin límite de fecha (`desde = 0000-01-01`): pasados y futuros. Pensado para quien se registró por error.
En «desde» y «todos», si algún tareo tiene asistencia u horas de esa persona, se avisa cuántos y hay que marcar una casilla de confirmación porque esas marcaciones se pierden. Los tareos **cerrados por el sistema** (bloqueo de 41-tareo-bloqueo.js) o sin permiso **no se modifican**: la ventana y el aviso final dicen cuántos fueron. Sin pantalla (pruebas) `quitarPersonal(clave)` conserva las dos confirmaciones de siempre; `TareoEd.ejecutarQuitar(clave, {alcance, desde})` ejecuta directo y devuelve `{quitados, conMarcas, bloqueados}`.

**Agregar.** «+ Agregar personal» (ya registrado o personal nuevo) pregunta **dónde agregarla**: solo este tareo (como antes) o **desde una fecha en adelante** en los tareos ya creados de la misma área, en el mismo turno o en ambos. No duplica donde ya esté, levanta una exclusión previa en cada tareo, deja la persona como pendiente de registrar (`agregadoManual`) y respeta tareos cerrados y permisos. Los tareos que se creen después se arman con la rotación; para que entre siempre hay que agregarla a la rotación o a Trabajadores.

Pruebas: `tests/tareo-edicion-continua.test.js` (flujo anterior) y `tests/tareo-quitar-agregar.e2e.js` (ventanas y alcances en navegador real).

### Comportamiento base (sin cambios)
Botón «✕ Quitar» en cada fila (solo quien edita ese tareo; no en Modo visualización). Pide confirmación (avisa si tenía asistencia u horas) y pregunta si **ya no trabaja**:
- **Sí (permanente):** deja una exclusión en `tareo.personalExcluido` que rige para esa área desde la fecha del tareo en adelante: la sincronización con la rotación Excel, con Mantenimiento y con maquinistas, y la creación de tareos nuevos ya no la traen. Los tareos de fechas anteriores no cambian.
- **No:** se quita solo de ese tareo.
Las exclusiones se fusionan entre dispositivos (gana la entrada más nueva por persona), así que una copia vieja no reintroduce a la persona. Se puede **restaurar** desde el panel «Personal quitado de este tareo», o agregándola manualmente (levanta la exclusión). La acción queda en la auditoría (`QUITAR_PERSONAL`, usuario y hora del servidor). No se borra al trabajador de Trabajadores ni de la rotación (para quitarlo de todo, desactívalo allí o cambia el Excel). Una fila con identificación repetida y sin `filaId` no se quita por orden.

## Personal del área desde el Inicio del Tareo de Mantenimiento (23/11/2026)
En la tabla «Personal de mantenimiento» del Inicio (`js/personal/48-tareo-personal-area.js`, `window.TareoArea`):
- **✕ Quitar** (cada fila): ventana con dos alcances. **Desde una fecha en adelante** (fecha de cese; por defecto hoy): sale de los tareos ya creados desde esa fecha y no vuelve en los que se creen. **De todos los tareos**: para quien se registró por error. Muestra una vista previa (cuántos tareos, cuántos con asistencia u horas, cuántos cerrados o sin permiso) y pide una casilla de confirmación si se perderían marcaciones. Es la misma baja que «✕ Quitar» dentro de un tareo (`personalExcluido` permanente); se guarda en cada tareo tocado y en el tareo más reciente desde esa fecha (para que valga en los tareos futuros). No borra al trabajador de Trabajadores. Si no hay ningún tareo desde esa fecha donde guardar la baja, avisa y no hace nada.
- **Personal quitado** (panel debajo de la tabla): lista las bajas vigentes con **Restaurar** (la baja pasa a inactiva, más nueva, en todos los tareos que la tienen).
- **+ Personal por día (rango)**: nombre, DNI y cargo opcionales, **Desde / Hasta** (hasta 62 días), turnos (Día, Noche o ambos) y horas opcionales. Agrega a la persona como personal por día (`personalPorDia`, con `rango {desde, hasta}`) en los tareos de Mantenimiento **ya creados** del rango; no duplica (DNI o nombre), respeta permisos y tareos cerrados. Los turnos del rango sin tareo creado no se tocan (se informan): al crearlos se puede repetir el paso.
- Solo Mantenimiento y solo quien puede modificar ese tareo (no en Modo visualización).
- Pruebas: `tests/tareo-personal-area.e2e.js` (navegador).

## Por qué «se borra» el personal por día y vuelve el personal quitado (causa real, 23/11/2026)
Una lista de objetos con identificador único (`tareo.personalPorDia`, `tareo.personalExcluido`) no se guarda dentro del documento sino en `fs_items` (lista partida). El Tareo recibe los tareos con una **consulta de colección** (`db.collection('tareos').onSnapshot`), y `public.fs_consulta` devolvía solo `fs_docs.datos`, **sin esas listas**: el personal por día agregado «se borraba» al llegar la actualización (en la base seguía guardado) y las bajas «ya no trabaja aquí» no se veían, así que la persona volvía a aparecer en el personal. Arreglo: migración `glacial_67_consulta_con_listas.sql` (la consulta devuelve también las listas partidas). Afecta a cualquier colección con listas partidas consultada así (también `hieloReportes.historial`, `apSolicitudes`…). Sin cambios en la página.
