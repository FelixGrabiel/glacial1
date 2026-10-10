# Inicio: cinco tarjetas y motivos de las líneas sin producción

## Orden de Inicio (Gerencia / Jefatura / permiso `ver_inicio_ejecutivo`) — `js/accesos/32-dashboard-perfiles.js`
Encabezado (fecha operativa, bloque seleccionado, «Actualizado», etiqueta «Modo visualización» cuando corresponde) → 5 tarjetas → **Líneas sin producción** →
**Producción por línea** (tabla) → **Alertas importantes** → **Resumen de producción** al final (con Paradas de hoy, Proyección del turno y Disponibilidad de hoy
tal como las insertan los módulos 43, 46 y 47). La fecha y el bloque del encabezado los comparten todas las tarjetas (vacío = bloque vigente; la noche que cruza
medianoche conserva la fecha operativa en que empezó). Solo cambia lo que se muestra: no guarda nada.

## Fuente de cada indicador
| Indicador | Fuente |
| --- | --- |
| Avance del turno | `glacialResumenEjecutivoLineas` (misma lógica de Producción Actual): promedio de cumplimiento de las líneas con programación; nunca suma botellas, bidones y cajas. Con una sola unidad muestra «X de Y UND». Sin meta: «—» y «Sin programación para evaluar». |
| Líneas en producción | Estado **operativo real** (botones Iniciar/Reanudar: `estadoOperacion.estado === EN_PRODUCCION`), no la producción acumulada ni paletas antiguas. Denominador = líneas autorizadas al usuario. |
| Paradas del turno / Motivos registrados | **Solo Avance/Cierre**, vía `calcularTiemposLinea` → `paradasClasificadas` (consolidación vigente: no duplica avances y cierres). No mezcla los motivos de no producción ni los botones del semáforo. «Ver detalle» abre la lista completa. |
| Estado del turno | Criterios existentes. Nuevos: **SIN PROGRAMACIÓN** (nada programado en el bloque) y **SIN DATOS PARA EVALUAR** (hay programación pero nada iniciado/producido, o el bloque aún no empieza). «Requiere atención» = línea detenida ahora o desempeño por debajo de lo esperado (una parada histórica no basta). |
| Producción por línea | Estado de Producción Actual (colores aprobados: naranja en curso, amarillo pausa, rojo detenida, verde finalizada, gris pendiente), producción en la unidad de cada línea, cumplimiento, último registro de paletas. `Programada` no existe hoy como estado propio, por eso no se agrega. |

## Líneas sin producción — registro de motivos (`js/produccion/63-incidencias-no-produccion.js`)
Colección nueva `incidenciasNoProduccion` (un documento por fecha operativa + bloque + línea, id `AAAA-MM-DD_DIA|NOCHE_LINEA`): motivo (lista del prompt, «Otra causa» exige descripción),
quién y cuándo, estado VIGENTE/RESUELTA, quién y cuándo se resolvió y `historial` (REGISTRO / CORRECCION / RESOLUCION; lo anterior se conserva). Es **informativo**: no crea paradas en Avance/Cierre,
no suma minutos, no toca ratio ni producción y no es un estado operativo.
- **Quién informa/corrige:** quien controla la línea como Producción en Producción Actual (botón «Informar motivo de no producción» / «Corregir motivo»). Inicio es de consulta; en Modo visualización nadie escribe.
- **Cuándo aparece una línea:** (1) incidencia VIGENTE informada, aunque no haya paletas, avance ni programación; (2) la línea debía producir (el inicio del **bloque** configurado ya pasó, hay programación vigente) y está **detenida** o **no ha iniciado** → si nadie informó: «Motivo pendiente de registrar». No se marca: inicio aún no llegado, finalizadas/canceladas, en pausa programada, bloques sin programación, ni fechas/bloques que no son el vigente. No existe un «inicio previsto» por línea en la programación: se usa el inicio del bloque.
- **Resolución:** solo un **Iniciar** o **Reanudar** real (24-semaforo…) posterior al registro la cierra y queda en el historial. Un evento anterior, abrir Inicio o producción acumulada previa no la cierran. Si quien reanuda no puede escribir (p. ej. cuenta compartida de Mantenimiento), Inicio igualmente deja de mostrarla como vigente cuando la línea está en producción real por un evento posterior.
- **Estado de línea / motivo / tiempos** siguen en fuentes separadas: Producción Actual / este registro / Avance-Cierre.

## Reglas de Firestore — publicar de nuevo `firestore.rules.etapa2.txt`
`match /incidenciasNoProduccion/{id}`: lee todo autenticado salvo la cuenta compartida; escribe quien opera Producción (ya excluye Modo visualización) con su uid y hora del servidor; el historial solo crece; no se borra.

## Pendiente de probar en PRUEBAS con datos reales
Registrar un motivo y verlo desde otra sesión y tras recargar; Iniciar/Reanudar posterior; fecha pasada y noche tras medianoche; sesión en Modo visualización (sin formularios); móvil real.
