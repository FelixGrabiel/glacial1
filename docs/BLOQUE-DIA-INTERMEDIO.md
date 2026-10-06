# Bloque productivo Día + Intermedio (Parte B)

## Reglas
- **Una programación por bloque.** Día e Intermedio comparten UNA programación por línea y producto; Noche tiene la suya. Los tres turnos siguen existiendo para tareo, responsables, permisos y auditoría (`HORARIOS_TURNO` no cambia).
- **Programado del bloque** = suma de las filas DÍA e INTERMEDIO del producto, sin canceladas. Una sola función: `glacialProgramadoBloque` (23b). La usan Producción actual (24), el cálculo central (23b), el Nuevo registro (35, vía el resumen de programación) y Planificación (cumplimiento). Se eliminó la regla «si Día > 0».
- **Horarios de los bloques** (sync/configIndicadores → `bloques`; ver docs/PROYECCION-CIERRE.md): Día + Intermedio 07:00–19:00, planta parada 19:00–21:00, Noche 21:00–07:00 (fecha = día en que empieza).
- **Franja 19:00–21:00:** no hay bloque. La proyección del bloque Día + Intermedio muestra su resultado final; el tiempo no suma como parada ni como disponible (el tiempo del bloque se corta en el fin del bloque); no hay alertas de parada abierta, sin registrar producción ni programación sin iniciar; el semáforo muestra «Planta sin producción hasta las 21:00».
- **Cambio de supervisor ≠ cambio de programación:** al entrar Intermedio se ve el mismo programado, producido, pendiente, avance y proyección (el resumen de programación devuelve siempre el bloque completo).
- **Relevo ≠ cierre:** el «Cierre» de Avance/Cierre generado antes del fin del bloque es un **RELEVO DE TURNO**: se corta a la hora real, queda registrado (`relevo:true`) y NO fija el fin del bloque. Solo «Finalizar presentación» (Producción actual) termina la programación.
- **Trazabilidad:** cada avance, parada y paleta conserva su usuario, turno y hora; la tarjeta de proyección muestra lo producido por turno dentro del bloque. El ritmo y la proyección usan siempre el bloque completo (no se muestra un ratio por supervisor).

## Representación sin duplicar datos
No se crea ninguna segunda programación ni fila de INTERMEDIO nueva: lo de Día + Intermedio se guarda en la fila DÍA (la clave no cambia). Las filas INTERMEDIO ya guardadas siguen valiendo y suman al bloque. Si un producto tiene la **misma cantidad** en Día e Intermedio, Planificación lo marca «posible duplicado» (⚠ en la vista semanal) y no lo corrige.

## Cómo cambia cada pantalla
- **Planificación:** opciones «Día + Intermedio» y «Noche» (programación, solicitudes, copiar); la tabla muestra las filas del bloque con «(fila Intermedio)» y «posible duplicado»; la vista semanal tiene dos columnas por día; el Excel acepta filas INTERMEDIO y las suma al bloque avisándolo en la vista previa; el cumplimiento cuenta el programado sumado y el producido una sola vez.
- **Producción actual:** una sola tarjeta por bloque con programado, producido y proyección del bloque; Noche empieza a las 21:00.
- **Paletas:** sin cambios de uso; el producido del bloque suma las paletas de Día e Intermedio.
- **Nuevo registro:** la cantidad programada autollenada es la del bloque (suma).
- **Resumen de turno y reportes:** el bloque Día + Intermedio ya se tomaba como una unidad; su programado suma las filas y el producido es el del bloque.
- **Planta:** en la franja 19:00–21:00 muestra «Planta sin producción hasta las 21:00».

## Pendiente / límites
- El ratio por supervisor (aparte y con otro nombre) no se implementó: solo se muestra el producido por turno.
- La alerta de proyección baja (46) usa la mitad del bloque con los horarios del bloque.
- No hay pantalla para editar `bloques`.
