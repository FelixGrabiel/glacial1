# Fecha operativa y turno NOCHE después de medianoche

## La regla
- Zona horaria: **America/Lima** (UTC-5). Nunca `toISOString()` / `toJSON()` / `getUTC*` para fechas de negocio: desde las 19:00 Lima darían el día siguiente.
- **Día operativo = 07:00 → 07:00.** Turnos: DÍA 07:00–15:00, INTERMEDIO 15:00–22:00 (DÍA + INTERMEDIO forman el bloque «DÍA», de 07:00 a 22:00), NOCHE 22:00–07:00.
- **La fecha de un NOCHE es el día en que EMPEZÓ.** De 00:00 a 07:00 la fecha operativa es el día anterior. Día juliano y semana salen de esa fecha.

## Fuente única: `js/nucleo/01b-fecha-operativa.js` (`window.GlacialFecha`)
`ahoraMs()` · `ahoraLima(ms?)` · `fechaISOLocal(dateOMs?)` · `turnoActual(ms?)` · `bloqueActual(ms?)` · `fechaOperativa(ms?, turno?)` · `diaJuliano(fecha)` · `semanaISO(fecha)` · `sumarDias(fecha, n)` · `hhmmAMs(fecha, 'HH:MM', turno)` · `simulacion()`.
Las funciones que ya existían conservan su nombre y ahora usan esta fuente: `GlacialIndicadores.turnoVigente/diaOperativo` (45), `obtenerFechaHoy` (13-tareo), `contextoTurnoUsuario` (02-estado).
El lote sigue usando `obtenerSemana` (WEEKNUM, semana desde el domingo); `semanaISO` (lunes–domingo) es una ayuda nueva que aún no reemplaza a nada.

## Qué se corrigió (marcado en el código con `// FECHA-OPERATIVA:`)
| Archivo | Cambio |
|---|---|
| `personal/31-rotacion-supervisores.js` | **Causa del Avance vacío.** El contexto del supervisor usaba la fecha de calendario si tenía asignación hoy (noches consecutivas). Ahora, de madrugada y antes del fin de la NOCHE de ayer, el contexto es el de ayer. Además se recalcula cada minuto (antes quedaba congelado desde el inicio de sesión). |
| `nucleo/02-estado.js` | `SIN_ROTACION`, `SIN_CONFIGURAR` y el horario antiguo ya no usan el día de calendario. |
| `produccion/29-avance-produccion.js` | `avCtx` nunca devuelve una NOCHE con fecha posterior a la del turno en curso; `avGenerar` y `avAbrirFlotante` respetan la fecha/turno elegidos (si no es el turno en curso pide confirmar); el PNG añade «Generado: DD/MM/AAAA HH:MM»; la hora del corte es hora de Lima del servidor. |
| `produccion/06-registro.js` | `blankRecord`: fecha operativa y turno en curso (antes calendario y DÍA fijo → día juliano, semana y lote +1 y reporte duplicado). |
| `produccion/16-paletas.js` | `blankPaleta`: de noche nace como NOCHE; hora de Lima. |
| `produccion/24-semaforo-produccion-actual.js` | Hora de inicio/corrección/corte tecleada en NOCHE de madrugada = día siguiente. |
| `produccion/25-alertas-lineas.js` | «Eventos de hoy» por día operativo. |
| `personal/13-tareo.js` | `obtenerFechaHoy` = día operativo (pantalla de turnos, «Nuevo tareo», rotación vigente, Tareo General, exportaciones RRHH). Hora programada por defecto del catálogo; selector en vez de hora libre. |
| `personal/41-tareo-bloqueo.js` | Catálogo de horas de ingreso (`sync/configTareo.horasIngreso`, `ingresoDia`, `ingresoNoche`); el reloj del servidor admite la hora simulada. |
| `rrhh/26-rrhh-panel.js` | «Noche iniciada» según la hora de ingreso configurada (antes 19:00 fijo). |
| `mantenimiento/67e-preventivos.js`, `produccion/55-valores-economicos.js` | Fecha de ejecución del preventivo y «hoy» de valores = día operativo. |
| `asistente/72`, `produccion/14, 46, 08, 62, 66` | Se quitaron los `toISOString().slice(0,10)` (UTC). |

## Horas de ingreso del tareo
Catálogo inicial: 07:00, 10:00, 13:00, 14:00, 19:00, 20:00, 21:00, 22:00. Por defecto: Día 07:00, Noche 22:00 (antes la Noche era 19:00 y quien entraba a las 22:10 salía con 190 min de tardanza).
Se edita en **Tareo → Bloqueos → Configurar** (solo el Administrador, porque `sync/configTareo` solo la escribe el Administrador). Para que otro rol pueda editarla hace falta ampliar la regla de la base (`glacial_fs.autorizar`): no se hizo.
El turno DÍA sigue de 7 a 7 (fin de Día del bloqueo = 19:00, sin cambios).

## Registros ya guardados con fecha equivocada
No se modificó nada automáticamente. Botón **«🌙 Corregir fechas de la noche»** (Historial, solo Administrador): lista los registros NOCHE creados de 00:00 a 07:00 con la fecha del calendario y propone el día anterior.
- **Corrige** (marcando y con motivo): paletas y paradas de avance. Descarga un respaldo, guarda `fechaOriginal`, `fechaCorregidaPor/En/Motivo` y no toca un registro que ya cambió.
- **Solo lista**: imágenes de Avance/Cierre (las reglas de la base no permiten editarlas), programaciones (la fecha es parte de su clave) y reportes en registro (llevan lote/juliano/semana): se revisan a mano.

## Simular la hora (solo Administrador o localhost)
`?simularHora=2026-10-16T01:30` (hora de Lima). Quitar: `?simularHora=off`. Desplaza `Date.now()` y `new Date()` y el reloj del servidor; muestra un aviso rojo fijo. **No registres datos reales con la hora simulada** (se guardarían con esa hora): úsalo en PRUEBAS o solo para mirar.

## Checklist de prueba (con `?simularHora=`)
1. NOCHE 23:00 → fecha operativa = ese día; 01:30 y 06:50 → día anterior. El Avance muestra líneas, paletas, paradas y personal del turno; el encabezado dice la fecha operativa y «Generado: …».
2. 07:01 → turno DÍA con la fecha nueva.
3. DÍA 18:30 y 19:30 → no salta al día siguiente.
4. Formulario nuevo a las 01:30: fecha del turno que empezó ayer, turno NOCHE, día juliano y semana de esa fecha.
5. Tareo Noche: crear a las 22:00; quien entra a las 22:10 → 10 min de tardanza; a las 01:30 «Turnos del día» abre el Noche de ayer (no uno nuevo).
6. Excel de un rango que incluya una noche: aparece una sola vez, bajo su fecha de inicio.
7. Fin de mes (31/10 22:00 → 01/11 03:00) y de año (31/12 → 01/01): fecha operativa 31/10 y 31/12.
8. Elegir otra fecha/turno en Avance y generar: respeta lo elegido.

Pruebas automáticas: `node tests/fecha-operativa.test.js`.

## Pendiente / sin tocar (se informa)
- `13-tareo.js` `tareoEsEnTiempoReal` mantiene su corte a las 12:00; `20-tareo-control.js` (alerta de quincena), `33`/`30` (marca «hoy» de las rotaciones), `37b` (lunes de madrugada), `67f`/`67c` (rangos por día natural con fechas manuales) y el límite fijo de 22:00 de `turnoVigente` frente a los bloques configurados siguen como estaban.
- Funciones duplicadas que ya no hacen falta pero no se borraron: `rotSupFechaISO`, `fechaLocalISO`, `tareoFechaISO`, `diaOperativoActual` (43, 47), `hoyOperativo`/`hoyOp`/`diaOp` (46, 67e, 67f, 67h, 49), `inicioDiaOperativo` (24b), `fechaOperativa` (26).
