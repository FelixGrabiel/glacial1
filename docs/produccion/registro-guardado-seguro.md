# Registro de producción · guardado seguro (auditoría 2026-11-05, punto 2)

| Problema | Corrección | Dónde |
|---|---|---|
| Dos supervisores en el mismo reporte: ganaba el último que guardaba y borraba lo del otro | El formulario recuerda la versión del servidor que leyó (base). Al guardar, si el servidor tiene otra, **mezcla campo por campo** (`mezclarVersionesReporte`): lo que cambió este equipo se queda, lo demás viene del servidor. Paradas, mermas y fotos por id; auditoría unida; cuadros por posición. `versionReporte` sube en cada guardado | `guardarAvanceReporte`, `fijarBaseReporte` (06) |
| Los cambios de otro equipo solo se veían después de guardar uno mismo (y nunca en VISUALIZAR) | Al llegar la lista de reportes se aplican al reporte abierto (mezclados); si el cursor está en un campo, se espera a que lo suelte | `escucharCambiosDelReporteAbierto`, `sincronizarDraftReporteRemoto` (06) |
| Dos supervisores abrían el formulario vacío a la vez y salían dos reportes del mismo turno | El que guarda segundo se une al reporte abierto del mismo turno (`reporteHermanoAbierto`) | 06 |
| Un reporte eliminado volvía a aparecer con el autoguardado de otro equipo | Si estaba guardado y ya no está en la lista, no se vuelve a crear (aviso) | 06 |
| Otro lo finalizaba y este equipo lo devolvía a «En registro» | Se muestra la versión final; no se guarda encima | 06 |
| Un borrador viejo reabría un reporte finalizado | Al finalizar se borra el borrador del turno; al restaurar, si el reporte ya está en la lista manda la lista (finalizado → nada) | 06, 17-modo-trabajo.js |
| Guardar un borrador antes de cargar la lista borraba los de todas las líneas; se reescribía cada 30 s aunque nada cambiara | Solo con la lista cargada y si cambió algo; no hace falta borrador si el reporte ya está en la lista | 17 |
| VISUALIZAR (y el turno cerrado) guardaba igual por el autollenado | `puedeEscribirRegistro()` en el autoguardado, guardar, finalizar, reabrir y eliminar | 06, 07 |
| «✓ Guardado» con cambios pendientes; reabrir decía «reabierto» aunque no se guardara | El guardado que llega mientras otro está en curso se repite al terminar; reabrir (reporte o producción) solo se confirma si quedó guardado | 06 |
| Eliminar sin confirmación ni rastro | Motivo obligatorio, constancia con copia del reporte en `auditoriaRegistros` (si no se puede dejar, no se elimina), espera la respuesta y borra el borrador | `deleteRecord` (07) |
| Los permisos solo estaban en la pantalla | **glacial_42** (servidor): eliminar o recuperar → «eliminarRegistros»; sacar de FINALIZADO → «reabrirReporteProduccion»; corregir un finalizado → quien opera Producción. Constancias: solo se crean (uid y hora del servidor); las leen Administrador y Jefatura | `supabase/migraciones/glacial_42_protege_reportes_registro.sql` |

Prueba: `tests/registro-guardado-seguro.test.js`. glacial_42 aplicada en PRUEBAS el 2026-11-05 (probada con sesión simulada: sin permiso → 42501 al
cambiar un finalizado, reabrir o eliminar; Administrador permitido; mismo contenido reenviado permitido; datos intactos). PRODUCCIÓN: pendiente de aprobación.
Mientras glacial_42 no esté en PRODUCCIÓN, eliminar desde el Historial no funciona allí (no se puede dejar la constancia): es a propósito.
