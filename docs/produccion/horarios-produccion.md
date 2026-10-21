# Horario de producción por línea, Noche y cierres históricos

Rama `horarios-1-produccion-por-linea`. **No se publicó nada.**

## Qué hay y cómo se activa
- **Resolvedor central** `glacialHorarios.resolver(línea, fecha operativa, bloque)` (`js/produccion/51b-horarios-produccion.js`): devuelve habilitación, inicio y fin como instantes completos, duración bruta, etiqueta, tolerancia y la regla/versión aplicada.
- **Base:** el horario general de siempre (`sync/configIndicadores → bloques`: 07:00–19:00 y Noche 21:00–07:00). **Sin reglas no cambia nada, ni hacia atrás ni hacia adelante**: instalar no activa ninguna vigencia.
- **Reglas:** `sync/catalogoPlanificacion → horarios {version, reglas[]}` (mismo documento y permiso `planificacion` que el catálogo). Tipo HORARIO (inicio/fin, «Restablecer horario predeterminado», etiqueta) y tipo HABILITACION (independiente: restablecer el horario diurno **no** habilita Noche). Vigencia: una fecha / rango / desde una fecha hasta nuevo cambio, **siempre con fecha de inicio explícita**. Precedencia determinista (fecha > rango > abierta; entre abiertas, la de inicio más reciente); vigencias superpuestas de igual prioridad y ventanas Día/Noche que se solapan **no se guardan**. Nada se borra: se desactiva. Historial en `historialProgramacion` (usuario/UID, hora de servidor, antes/después, vigencia, motivo).
- **Pasos para activar la configuración aprobada:** Planificación → pestaña **Horario de producción** → escribe la **fecha de inicio** (Desde) y la **instrucción de Gerencia** (motivo) → **Aplicar configuración aprobada…**. Crea en una sola operación (**corte de las 19:00**, 21-10-2026): Noche 19:00–07:00 para todas las líneas; Intermedio 14:00–19:00 para C20L y B20L, con su Noche habilitada (pueden producir después de las 19:00). Antes de esa fecha todo conserva su horario original. La configuración anterior (Noche 22:00–07:00; C20L/B20L 14:00–22:00 sin Noche) se mantiene como escenario de prueba. Ver también `docs/00-general/ventana-supervisor.md`.

## Noche y tolerancia
Abre a la hora configurada (22:00), termina a las 07:00 y **tolera hasta las 07:30 solo para completar registro y cierre**: no adelanta la apertura (21:30), no desplaza el inicio (22:30), no cambia las 9 horas productivas ni la capacidad, no finaliza máquinas ni confirma cierres. Entre 07:00 y 07:30 se muestra **«Noche · En tolerancia para registro/cierre»** y Avance/Cierre sigue apuntando a esa Noche. No toca Tareo ni jornadas del personal.

## Dónde se usa
Planificación (duración, disponible, secuencia, «hasta el cierre», vista semanal, opciones, validación y copia), **23b** (disponibilidad y ratio por línea), Completar cantidad (no busca cierre en un bloque deshabilitado), Avance/Cierre (horario por línea, tolerancia, bloque agregado) y la tabla de Programación (oculta líneas deshabilitadas y muestra el horario por línea).

## Generar cierre histórico (Avance/Cierre)
Al elegir una fecha y bloque anteriores aparece **GENERAR CIERRE** (o **VER CIERRE** / **REGENERAR CIERRE** si existe), sin depender de la hora, del día ni de la tolerancia. Opera sobre la **selección**, no sobre el turno del dispositivo. Un cierre regenerado es una **versión nueva** (id con sufijo `vN`, motivo, referencia a la anterior); la anterior se conserva. Si faltan datos se genera igual **identificando qué falta** (registro sin finalizar o inexistente) y no se inventa producción cero. **Crear el reporte no reabre ni finaliza registros**: "Completar cantidad" solo se resuelve con la finalización oficial del registro.

## Pruebas
`node tests/planificacion-horarios.test.js`: base 07–19, 22–07 (9 h), C20L/B20L 14–22 con Noche deshabilitada, excepción y retorno, vigencias, línea sin tocar otras, históricos intactos, tolerancia, capacidad/secuencia/Completar cantidad/copia, historial, permisos y fuentes de Avance.

## Limitaciones
- **No** se integró todavía el horario por línea en Producción Actual (24), distribución de personal (43), proyección/avisos (46) y dashboard (32): siguen leyendo el horario general. Los cálculos de **23b** (disponibilidad y ratio) y Planificación sí usan el horario por línea.
- La tolerancia de las 07:30 no está conectada al bloqueo de edición del Registro de producción (06); solo a Avance/Cierre y a la etiqueta.
- La validación en servidor es la de siempre: las reglas de Firestore autorizan por documento (permiso de Planificación); las validaciones del horario están en el servicio y se repiten dentro de la transacción.
- Los registros antiguos no guardan una referencia de horario: se usan sus datos propios y, si faltan, el horario vigente en su fecha según las reglas (nunca el actual).
- No probado con Firestore/Supabase reales ni en celular físico.
