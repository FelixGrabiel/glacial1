# Corregir y reasignar paradas · duración en minutos sin horas obligatorias

## Qué cambió

1. **Corregir asignación** (Registro y Avance/Cierre) para el Administrador y para quien tenga el permiso **«Corregir y reasignar paradas»** (`corregir_paradas`).
2. **La hora de inicio y de fin ya no es obligatoria** para ninguna duración (15, 30, 50, 120 min u otra). Basta la duración en minutos.

## Cómo está guardada una parada (y por qué la corrección no la borra)

- La parada que se agrega desde **Agregar paradas** es un evento de la **línea, fecha y turno**: vive en `sync/avancesTurno → paradasOperativas` (id `avp_…`).
- Su asignación a una **marca** vive en el Nuevo registro: `draft.asignacionParadasAvance` = `{idParada: índice del cuadro}`. En el cuadro aparece como fila automática (bloqueada), copia del evento con `origenId = id de la parada`.
- **Quitar de esta marca** pone `asignacionParadasAvance[id] = -1` («Sin asignar»). El evento fuente no se toca: conserva id, descripción, causa, tipo, minutos, autor y origen. Con una sola producción **no** se reasigna sola (el `-1` lo impide); aparece en el aviso «Paradas de Avance/Cierre por asignar» del Registro y se elige de nuevo con el selector existente.
- **Otra marca de esta línea**: cambia el índice en `asignacionParadasAvance`.
- **Otra línea**: una transacción sobre `sync/avancesTurno` cambia solo el campo `linea` del evento (fecha, turno, minutos, tipo y horas no cambian) y agrega una entrada a `historialAsignacion`. En la línea destino queda sin asignar a marca hasta que se elija en su Registro (o se asigna sola si hay una sola producción).
- Una parada pertenece a **una** asignación a la vez; no existe en el modelo repartirla entre varias marcas, por eso no se puede duplicar ni fraccionar.

## Historial y consistencia

| Acción | Dónde queda el historial | Cómo se garantiza la consistencia |
|---|---|---|
| Quitar de la marca / otra marca | `draft.correccionesParadas` (en el mismo registro) y constancia en `correccionesParada` | El cambio y su historial se guardan en el mismo guardado del registro; si el servidor no confirma, se **restaura** la asignación anterior y no se escribe constancia. |
| Otra línea | `parada.historialAsignacion` y constancia en `correccionesParada` | **Una sola transacción** escribe el evento y la constancia. Si falla, no queda nada a medias. |

La constancia (`correccionesParada/{opId}`) guarda: id de cada parada, descripción, minutos, tipo, acción (`QUITAR_MARCA`, `REASIGNAR_MARCA`, `REASIGNAR_LINEA`), de dónde a dónde, motivo, si el cierre ya estaba generado, uid y nombre de quien actuó y la hora del servidor. El id es el de la operación: un doble clic o un reintento no la repite, y las reglas impiden editarla o borrarla.

Dos usuarios: la transacción compara `actualizadoEn` de cada parada con la versión que se revisó; si otra persona la cambió o la movió, no se guarda nada y se pide abrir de nuevo la corrección.

## Permisos

- `corregir_paradas`: Administrador siempre; otros usuarios solo si se les otorga en **Usuarios → Producción**. No se reutilizan permisos de edición general (reabrir reportes, Avance/Cierre, programación).
- Alcance: «Todas las líneas» o la línea del usuario (origen y destino). 
- Modo visualización y cargos de solo consulta: sin escritura, aunque conserven el permiso guardado.
- Interfaz y función validan el permiso; **el servidor** (reglas) lo exige para escribir la constancia (`puedeCorregirParadas()` en `firestore.rules.etapa2.txt`). Los documentos `sync/records` y `sync/avancesTurno` conservan la regla general de siempre (no distingue por permiso), igual que hoy.
- Turnos con cierre ya generado: se puede corregir con el permiso y un motivo obligatorio; el cierre se conserva tal como se generó y Avance/Cierre avisa que hay correcciones posteriores (genera una nueva versión). No se reabre nada automáticamente.
- **Reporte finalizado**: no se cambia la asignación; primero se reabre con el permiso «Reabrir reportes de producción finalizados».

## Duración e intervalo

- Se guarda siempre la **duración en minutos** (mayor que 0; vacío, negativo o texto se rechaza). No se impone minuto entero: se conserva la precisión de antes.
- Hora de inicio y de fin: **opcionales**. Si se escribe un intervalo debe medir lo mismo que la duración (con cruce de medianoche); si no coincide se pide corregir uno de los dos y **no se sobrescribe** lo escrito. Fin sin inicio se rechaza. Si solo hay inicio, el fin se calcula (inicio + duración) y debe caer dentro del turno.
- No se inventan horarios. Las paradas históricas con horas conservan sus datos.
- Si la suma de minutos supera la duración del turno se muestra un aviso (no bloquea).
- «Paradas largas sin hora» en Análisis de paradas pasa a ser **informativo**.

## Límites conocidos

- La corrección de la asignación **por marca** se hace desde el Registro del turno (donde existe esa asignación). Desde Avance/Cierre solo se reasigna de **línea**.
- Los totales de la **línea** (Producción Actual, disponibilidad) no cambian al quitar una parada de una marca (el evento sigue ocurriendo en la línea); sí cambian al pasarla a otra línea.
- Reglas de Firestore: hay que publicar el bloque `correccionesParada` (primero en PRUEBAS). No hay bloque equivalente en Supabase (la colección nueva no existe allí todavía).
- Probado con nube simulada; sin Firestore/Supabase reales ni dispositivos reales.

## Pruebas

`node tests/correccion-paradas.test.js` (permisos, núcleo, quitar y reasignar con el autollenado real, doble clic, dos usuarios, fallo del servidor, reglas, duración/intervalo) y `tests/visual/correccion-paradas.html` (diálogo en 375 px).
