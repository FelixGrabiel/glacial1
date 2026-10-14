# Inicio: cinco tarjetas y motivos de las líneas sin producción

## Orden de Inicio (Gerencia / Jefatura / permiso `ver_inicio_ejecutivo`) — `js/accesos/32-dashboard-perfiles.js`
Encabezado (fecha operativa, bloque seleccionado, «Actualizado», etiqueta «Modo visualización» cuando corresponde) → 5 tarjetas → **Personal por línea** → **Líneas sin producción** →
**Producción por línea** (tabla) → **Alertas importantes** → **Resumen de producción** al final (con Paradas de hoy, Proyección del turno y Disponibilidad de hoy
tal como las insertan los módulos 43, 46 y 47). La fecha y el bloque del encabezado los comparten todas las tarjetas (vacío = bloque vigente; la noche que cruza
medianoche conserva la fecha operativa en que empezó). Solo cambia lo que se muestra: no guarda nada.

## Fuente de cada indicador
| Indicador | Fuente |
| --- | --- |
| Avance del turno | `glacialResumenEjecutivoLineas` (misma lógica de Producción Actual): promedio de cumplimiento de las líneas con programación; nunca suma botellas, bidones y cajas. Con una sola unidad muestra «X de Y UND». Sin meta: «—» y «Sin programación para evaluar». |
| Líneas en producción | **Unidades registradas > 0** en la fecha y el bloque seleccionados (producción física, incluida la fuera de programación; `glacialIncidencias.enProduccion`). Es el mismo criterio de «Líneas sin producción». Una línea con programación pero sin unidades no cuenta. Denominador = líneas autorizadas al usuario. |
| Paradas del turno / Motivos registrados | **Solo Avance/Cierre**, vía `calcularTiemposLinea` → `paradasClasificadas` (consolidación vigente: no duplica avances y cierres). No mezcla los motivos de no producción ni los botones del semáforo. «Ver detalle» abre la lista completa. |
| Estado del turno | Criterios existentes. Nuevos: **SIN PROGRAMACIÓN** (nada programado en el bloque) y **SIN DATOS PARA EVALUAR** (hay programación pero nada iniciado/producido, o el bloque aún no empieza). «Requiere atención» = hay líneas sin producción **sin motivo informado** (se nombra la causa: «N línea(s) sin motivo de no producción»), línea detenida ahora o desempeño por debajo de lo esperado (una parada histórica no basta). Las líneas sin producción que ya tienen motivo no lo disparan por sí solas. |
| Personal por línea | **Distribución de personal** del Tareo (`43-distribucion-personal.js`): el evento vigente al corte del bloque seleccionado (ahora, o su fin si ya terminó). Por línea: estado (en producción / sin producción), personal o «Pendiente de confirmar» y observación. Se resaltan las líneas con personal que no producen y las que producen sin personal confirmado (0 o pendiente). Total = distribuido + apoyo compartido; «Sin asignar» = personal con asistencia en el Tareo del bloque (`disponiblesTareo`) − lo distribuido. La distribución guarda cantidades, no nombres ni cargos. |
| Producción por línea | Estado de Producción Actual (colores aprobados: naranja en curso, amarillo pausa, rojo detenida, verde finalizada, gris pendiente), producción en la unidad de cada línea, cumplimiento, último registro de paletas. `Programada` no existe hoy como estado propio, por eso no se agrega. |

## Líneas sin producción — registro de motivos (`js/produccion/63-incidencias-no-produccion.js`)
Colección nueva `incidenciasNoProduccion` (un documento por fecha operativa + bloque + línea, id `AAAA-MM-DD_DIA|NOCHE_LINEA`): motivo (lista del prompt, «Otra causa» exige descripción),
quién y cuándo, estado VIGENTE/RESUELTA, quién y cuándo se resolvió y `historial` (REGISTRO / CORRECCION / RESOLUCION; lo anterior se conserva). Es **informativo**: no crea paradas en Avance/Cierre,
no suma minutos, no toca ratio ni producción y no es un estado operativo.
- **Quién informa/corrige:** quien controla la línea como Producción en Producción Actual (botón «Informar motivo de no producción» / «Corregir motivo»). Inicio es de consulta; en Modo visualización nadie escribe.
- **Cuándo aparece una línea:** toda línea autorizada **sin unidades** (> 0) en la fecha y el bloque seleccionados aparece una vez: con su motivo VIGENTE informado (motivo, quién y hora); «Sin programación» automático si no tiene programación en el bloque (no exige motivo); «Programación cancelada»; «El bloque aún no inicia» antes del inicio del bloque; y en otro caso **«Motivo pendiente de registrar»** (en rojo; a quien puede informar en esa línea se le ofrece «Registrar en Producción Actual»). Si todas producen: «Todas las líneas están en producción.» También se evalúan fechas y bloques pasados. Una línea que ya produjo en el bloque no figura aunque ahora esté detenida.
- **Resolución:** solo un **Iniciar** o **Reanudar** real (24-semaforo…) posterior al registro la cierra y queda en el historial. Un evento anterior, abrir Inicio o producción acumulada previa no la cierran. Si quien reanuda no puede escribir (p. ej. cuenta compartida de Mantenimiento), Inicio igualmente deja de mostrarla como vigente cuando la línea está en producción real por un evento posterior.
- **Estado de línea / motivo / tiempos** siguen en fuentes separadas: Producción Actual / este registro / Avance-Cierre.

## Reglas de Firestore — publicar de nuevo `firestore.rules.etapa2.txt`
`match /incidenciasNoProduccion/{id}`: lee todo autenticado salvo la cuenta compartida; escribe quien opera Producción (ya excluye Modo visualización) con su uid y hora del servidor; el historial solo crece; no se borra.

## Pendiente de probar en PRUEBAS con datos reales
Registrar un motivo y verlo desde otra sesión y tras recargar; Iniciar/Reanudar posterior; fecha pasada y noche tras medianoche; sesión en Modo visualización (sin formularios); móvil real.
