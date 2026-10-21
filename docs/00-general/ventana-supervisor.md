# Ventana de trabajo del supervisor, tiempo extra y corte de las 19:00

Cambio del 21-10-2026. Archivos: `js/accesos/17b-ventana-supervisor.js` (nuevo), `js/accesos/17c-ampliaciones-turno.js` (nuevo),
`js/accesos/17-modo-trabajo.js`, `js/produccion/06-registro.js`, `js/produccion/29-avance-produccion.js`,
`js/personal/31-rotacion-supervisores.js`, `js/personal/31a-rotacion-grid.js`, `js/produccion/51b-horarios-produccion.js`, `index.html`
y la migración `supabase/migraciones/glacial_28_ampliaciones_turno.sql`.

## Qué hace

Cada supervisor (rol **Supervisor**, los de la rotación) solo puede usar el modo **TRABAJAR** dentro de su ventana de turno.
Fuera de ella queda en **VISUALIZAR**: consulta todo, pero no registra. **Solo el Administrador** puede darle más tiempo.

| Turno (rotación) | Abre | Cierra |
|---|---|---|
| Día 07:00–15:00 | 06:45 | 15:00 |
| Intermedio 14:00–22:00 | 13:45 | 22:00 |
| Noche 22:00–07:00 | 21:45 | **07:30** (30 min de tolerancia, solo Noche) |
| 12 h Día 07:00–19:00 | 06:45 | 19:00 |
| 12 h Noche 19:00–07:00 | 18:45 | **07:30** |

- **Hora:** la del servidor, en hora de Lima. Cambiar la hora del equipo no da más tiempo.
- **Horario:** sale de las horas de la **celda** de la rotación publicada (con sus reemplazos), no del nombre del turno.
- **Descanso, vacaciones, licencia, otro o reemplazado** en la rotación = sin ventana ese día (no se usa el perfil).
- **Sin rotación publicada** (o el supervisor no figura en ella): se usa el horario guardado en su perfil y el cronómetro avisa
  «Sin rotación publicada… Avísale a Jefatura». Sin rotación ni horario en el perfil: no se bloquea (se avisa). Nunca se para la planta
  por falta de datos.
- **Aviso:** en los últimos 15 minutos antes del cierre el cronómetro se pone en ámbar y aparece un mensaje para guardar.
- **Al cerrar:** lo que se estaba escribiendo en «Nuevo registro» se guarda como borrador, la cuenta pasa a VISUALIZAR, aparece
  «🔒 Tu turno cerró» y el botón **Trabajar** queda bloqueado. Avance y Cierre pasa a solo consulta.
- El cronómetro se ve también en VISUALIZAR («🔒 Solo visualización», cuándo cerró o cuándo abre).

## Tiempo extra (solo Administrador)

**Producción → Rotación de supervisores → Tiempo de supervisores** (el panel solo lo ve el Administrador).
Muestra el estado de cada supervisor y el botón **Dar tiempo**: 15, 30, 60 min u otro valor (1–480), con **motivo obligatorio**.

- Los minutos se suman al cierre. Si el turno ya había cerrado, cuentan **desde el momento en que se dan**
  (30 min dados a las 16:00 a un turno que cerró a las 15:00 → hasta las 16:30).
- El supervisor lo recibe en vivo: se le habilita Trabajar sin recargar.
- Una ampliación equivocada se **anula** con motivo (no se borra). Queda quién la dio, cuándo y por qué.
- Se guarda en la colección `ampliacionesTurno`. **Requiere aplicar `glacial_28`** (primero PRUEBAS, después PRODUCCIÓN):
  sin ella el panel avisa que no puede leer ni guardar, y el resto funciona igual.

## Relevo sin cruzarse (entrada 15 min antes)

El borrador de «Nuevo registro» ahora es uno por **línea + fecha operativa + grupo de turno** (Día+Intermedio / Noche).
El supervisor que entra a las 06:45 trabaja en el Día de hoy; el de Noche sigue en la Noche de ayer hasta las 07:30.
Ninguno recupera ni pisa el borrador del otro.

## Turnos de 12 horas

En la rotación, al elegir **DÍA** o **NOCHE** aparecen los botones **12 h día (07:00–19:00)** y **12 h noche (19:00–07:00)**:
solo llenan las horas de la celda. Siguen siendo turnos DÍA y NOCHE (tareo e indicadores no cambian).

## Corte de las 19:00

Toda producción desde las 19:00 pertenece a la **Noche**, incluidos los avances del supervisor intermedio entre 19:00 y 22:00.

- **Activarlo:** Planificación → **Horario de producción** → fecha de inicio (Desde) + motivo → **Aplicar configuración aprobada…**
  (Administrador o usuario con permiso de Planificación). Crea en una sola operación:
  Noche 19:00–07:00 para todas las líneas; C20L y B20L 14:00–19:00 (Intermedio) con Noche habilitada.
  Antes de esa fecha todo conserva su horario anterior.
- Con eso, **Avance y Cierre** y los **reportes nuevos** de «Nuevo registro» siguen al reloj de producción por línea:
  después de las 19:00 van a la Noche. El supervisor intermedio cierra el bloque Día eligiéndolo en Avance y Cierre
  (cierre histórico, como siempre).
- La Noche conserva su única pausa prevista (refrigerio de 60 min).

## Límites conocidos

- **Etapa 1 (esta):** el bloqueo se aplica en el navegador, igual que el bloqueo del tareo. Protege del uso normal y de errores,
  no de alguien que manipule el código. La **etapa 2** es validar en el servidor (`fs_commit`) los guardados del supervisor fuera de su ventana.
- El bloqueo de VISUALIZAR cubre «Nuevo registro», «Paletas» y Avance y Cierre. Otras pantallas operativas siguen como hoy.
- No hay notificación automática a Jefatura cuando falta la rotación: el aviso se muestra al supervisor.
- **Horario general de bloques:** Producción Actual, distribución de personal, proyección/avisos y el dashboard todavía leen el horario
  general (`sync/configIndicadores → bloques`, Noche 21:00 por defecto), no el horario por línea. Para que entre las 19:00 y las 21:00
  tampoco digan «planta sin producción», el bloque Noche general también debe empezar a las 19:00 (pendiente).

## Pruebas

- `node tests/ventana-supervisor.test.js` — núcleo de la ventana (37 casos: aperturas, cierres, tolerancia, 12 h, ampliaciones).
- `node tests/ventana-supervisor-navegador.test.js` — rotación, descanso, perfil, ampliaciones por supervisor, corte 19:00, relevo (24 casos).
- `node tests/ventana-supervisor.e2e.js` — **página real** en Chromium con el servidor simulado y hora simulada: cierre automático a las 15:00,
  botón bloqueado, panel del Administrador, tiempo extra en vivo, relevo de las 06:50, tolerancia 07:25 y corte 19:00. Requiere Playwright.
- `node tests/planificacion-horarios.test.js` — la configuración aprobada nueva (Noche 19:00–07:00, C20L/B20L 14:00–19:00 con Noche).
