# Descansos automáticos (sorteo con reglas)

**28/11/2026.** Antes el supervisor marcaba las «X» a mano en el Excel «DESCANSOS TURNO DÍA / NOCHE». Pasaban tres cosas:

- quedaban personas en «Programar»;
- a veces un equipo entero descansaba el mismo día;
- se marcaba descanso a personas que estaban con descanso médico.

Ahora **GLACIAL arma ese cuadro con un sorteo que respeta las reglas**. El supervisor lo revisa, mueve a mano lo que quiera y lo publica. Al publicar, los descansos pasan a la **convocatoria** (columna DESC.) y al **Tareo** (estado «Descanso» prellenado).

Depende de la convocatoria semanal (`docs/personal-tareo/convocatoria-semanal.md`, glacial_72): las personas del sorteo son las convocadas en la semana.

## Dónde está

- Producción › Inicio de Producción › **Descansos**.
- Recursos Humanos › Descansos.
- Pestaña `descansos`, función `goDescansos`.

## Archivos

| Archivo | Qué hace |
|---|---|
| `js/personal/49d-descansos-nucleo.js` | Lógica pura (node), en `window.glacialDescansos`. Incluye `generarDescansos`, `evaluar`, `mover`, `equidad` y `modeloCuadro`, más `descansaEn` y `mapaDias` para el Tareo y la convocatoria. |
| `js/personal/49e-descansos-pantalla.js` | La pantalla: resumen, cuadro, cambios a mano, exportar, mínimos y días. Tiempo real y cola sin conexión. También guarda en el equipo los descansos publicados (`window.glacialDescansosDatos`) para el Tareo. |
| `js/personal/49c-convocatoria-tareo.js` | El Tareo prellenado: quien descansa ese día entra con «Descanso». |
| `js/personal/13-tareo.js` | Marca junto al nombre: «Su descanso», o en rojo «Trabaja en su descanso» si se le marcó asistencia en su día de descanso. |
| `js/personal/49-convocatoria-nucleo.js` y `49b-convocatoria-pantalla.js` | Columna **DESC.** en la imagen de la convocatoria (DOM resaltado) y título «… · CON DESCANSOS». |
| `supabase/migraciones/glacial_73_descansos.sql` | Tablas, funciones, Tiempo real y RLS. **Aplicada en PRUEBAS y PRODUCCIÓN (28/11/2026).** |

## Reglas del sorteo

Días: 0 = lunes … 6 = domingo.

**Obligatorias** (el sorteo nunca las rompe):

1. **Un descanso por semana** para cada operario convocado (de lunes a domingo).
2. **Mínimo por equipo todos los días:** cada día trabajan al menos el mínimo del equipo.
3. **Domingo con el mínimo exacto:** el domingo cada equipo trabaja con su mínimo; el resto del equipo descansa ese domingo, si puede.
4. **Quien pasa de DÍA a NOCHE** respecto a la semana anterior descansa **el lunes**. Es fijo, no se sortea.
5. **Quien pasa de NOCHE a DÍA** descansa cualquier día **menos el domingo**.
6. **Descanso médico, vacaciones o licencia** esa semana: no recibe descanso sorteado. Su status es «Descanso médico hasta dd/mm» y no cuenta como «trabajando» esos días.
   - Configurable: si el descanso médico termina a mitad de semana, puede recibir su descanso en los días que quedan. Por defecto **no**.

**Equidad** (cómo elige el sorteo):

7. El domingo va primero a quien lleva **más semanas sin descansar domingo**. Se mira el historial de las semanas publicadas, 8 por defecto. El objetivo es un domingo al mes por operario.
8. Reparte parejo los días entre semana: primero dentro del equipo y luego en el total por día.
9. Evita el **mismo día de la semana anterior** si hay otro posible.
10. Desempata **al azar con una semilla** (el «sorteo n.º»), guardada en el servidor. La misma semilla da el mismo resultado; «Volver a sortear» usa una semilla nueva.

**Sin solución:** si en un equipo no alcanzan los días libres (por ejemplo, 3 personas con mínimo 3), el sorteo no inventa nada. Esas personas quedan en **«Programar»** (rojo, como en el Excel) con el motivo, por ejemplo «Bidones 20L: 3 personas y mínimo 3, no hay días libres».

**Cómo se calcula** (`generarDescansos`), equipo por equipo:

1. Primero los fijos: quien pasa a noche, el lunes.
2. Luego los días en que el equipo no opera.
3. Luego el domingo, hasta el cupo exacto.
4. Al final, de lunes a sábado, el día con menos descansos del equipo que todavía tenga cupo.

Con esto, el intercambio de días que proponía el pedido no hace falta. Si no hay cupo, es porque el total de días libres no alcanza; ningún intercambio lo resuelve, y la persona queda en «Programar».

## Mínimos y días (solo Administrador y Jefatura)

Se cambian en «Mínimos y días» (`equipo_descanso_guardar`, `descansos_config_guardar`):

- **Mínimo** (`minimo_descanso`): personas que deben **trabajar** cada día. Vienen cargados los **mínimos de prueba** del pedido; **el dueño debe cargar los reales**:
  - Día: PET 6 · Bidones 7L 12 · Cajas 20L 8 · Hielo 8 · Bidones 20L 2.
  - Noche: Bidones 7L 8 · Hielo 9 · PET 10.
- **Por día** (`minimo_por_dia`): opcional, un valor para cada día de la semana.
- **No opera** (`dias_sin_operar`): ese día no cuenta mínimo y es el descanso de todos los del equipo. La excepción es quien viene de noche, si ese día es domingo.
  - *Por confirmar con el dueño:* que así funcione, por ejemplo, si Bidones 20L no trabaja el domingo.
- **Semanas de historial** para la equidad, 8 por defecto.
- **Descanso médico parcial**, desactivado por defecto.

El mínimo de la convocatoria (el aviso «3 / 4» de cuántos se convocan) es otro dato y no cambia.

## Pantalla

- **Resumen:**
  - semana, estado (Sin sortear, Propuesta o Publicada), n.º de sorteo, cuándo se generó y cuántos operarios hay;
  - checklist de reglas cumplidas;
  - tabla **«Personas trabajando por día»** por equipo de los dos turnos, con el domingo en amarillo y en rojo lo que queda bajo el mínimo.
- **Cuadro «DESCANSOS TURNO DÍA / NOCHE»** con el formato del Excel:
  - columnas N°, NOMBRES APELLIDOS, EQUIPO (nueva) y L M M J V S D con el número del día;
  - X roja en el día de descanso;
  - Status con colores: verde «Asignado» y «Asignado · viene de noche», morado «Asignado · pasa a noche (lunes fijo)», azul «Cambiado a mano (usuario)», gris «Descanso médico hasta dd/mm» y rojo «Programar»;
  - fila roja «Total de descansos por día» con «N de N · 0 por programar»;
  - fila gris «Trabajando …» por equipo contra los mínimos.
- **Filtro por equipo:** es el detalle por equipo para el celular.
- **Cambio a mano:** se toca una celda y la X de esa persona pasa a ese día; tocar su propia X la quita y la deja «por programar».
  - Si el cambio rompe una regla, aparece un aviso amarillo («Tu cambio: …»). No bloquea al supervisor.
  - Queda auditado en `descansos_historial`: quién, cuándo y el día antes y después.
- **Volver a sortear:** si hay cambios a mano, pregunta antes de reemplazarlos. Si ya estaba publicada, vuelve a «Propuesta».
- **Publicar y aplicar a convocatoria.**
- **Exportar:**
  - Imagen PNG para WhatsApp (mismo aspecto del Excel; en el celular se comparte);
  - Excel (.xlsx) con el mismo cuadro;
  - Imprimir / PDF (desde la ventana de impresión se guarda como PDF).
- **Quién edita qué:** el supervisor edita **su turno** (según la rotación de supervisores) y ve el otro en solo lectura. Administrador y Jefatura editan los dos. RRHH solo ve y exporta.
  - *Límite:* que el supervisor edite solo su turno lo controla la pantalla, igual que en la convocatoria. El servidor exige el permiso de editar y deja constancia de cada cambio.

## Tiempo real y varios equipos a la vez

- Canal de Supabase sobre `descansos_semana`, `descansos_asignacion`, `descansos_config`, `equipos_trabajo` y `convocatoria_asignaciones`: lo que hace un supervisor aparece al instante en los otros equipos.
- **Cambios a mano:** van uno por persona, con `client_event_id`; un reintento no duplica. Sin conexión quedan en la cola del equipo (`localStorage glacial:descansos:cola`) y se envían al volver.
- **Volver a sortear:** envía la versión que vio la pantalla. Si otra persona cambió los descansos mientras tanto, el servidor lo rechaza («otra persona cambió estos descansos; se recargó el cuadro») y no pisa nada.

## Integración

- **Convocatoria:** con descansos publicados, la imagen sale «… · CON DESCANSOS», con la columna **DESC.** (LUN…DOM, DOM resaltado) y la leyenda «DOM = descansa domingo». Si un turno aún no está publicado, su columna sale vacía.
- **Tareo:** con la convocatoria y los descansos publicados, quien descansa ese día entra con **«Descanso»** y el supervisor ya no lo marca.
  - Si se le marca asistencia ese día, junto al nombre sale **«Trabaja en su descanso»** (rojo), como diferencia visible.
  - Las horas extras siguen sus reglas actuales.
- **Historial:** las semanas publicadas alimentan la equidad de las siguientes, sobre todo para los domingos.

## Datos (glacial_73)

| Objeto | Qué guarda |
|---|---|
| `descansos_config` | Semanas de historial y descanso médico parcial. |
| `descansos_semana` | Una por semana y turno: estado PROPUESTA o PUBLICADA, semilla, versión, quién generó y quién publicó. |
| `descansos_asignacion` | Persona, equipo, día (0–6 o null), status, origen (AUTO, FIJO, MANUAL o EXCLUIDO), motivo, quién y cuándo, `client_event_id`. |
| `descansos_eventos` | Idempotencia. |
| `descansos_historial` | Auditoría. |
| `equipos_trabajo` | Más `minimo_descanso`, `minimo_por_dia` y `dias_sin_operar`. |

- Funciones `security definer` con los permisos de la convocatoria (`glacial_fs.conv_cap`).
- RLS: lectura para quien ve la convocatoria; escritura solo por las funciones.
- La marcha atrás está en la cabecera de la migración.

## Pruebas

- `tests/descansos.test.js` (node, 26 comprobaciones). Usa una semana con la forma de la del 30/11: 49 de día + 37 de noche + 1 descanso médico, con los mínimos de prueba. Nombres **ficticios**. Comprueba:
  - un descanso cada uno, nadie bajo el mínimo y domingo exacto (23 descansan);
  - quienes pasan a noche, el lunes; quienes pasan a día, nunca domingo; el descanso médico, sin X;
  - misma semilla da el mismo resultado y otra semilla da otra solución válida;
  - el caso sin solución da «Programar» con el motivo;
  - mínimo por día, día sin operar y descanso médico parcial;
  - cambio a mano con aviso;
  - equidad en 8 semanas: cada uno descansa 2 o 3 domingos, nadie 0;
  - formato del cuadro y Tareo.
- `tests/descansos.e2e.js` (Chromium, 18 comprobaciones): dos supervisores (día en celular, noche en PC):
  - sorteo y Tiempo real; cada uno edita solo su turno;
  - cambio a mano visto en vivo; sin conexión;
  - publicar; Tareo con «Descanso» y «Trabaja en su descanso»; imagen de la convocatoria con DESC.;
  - PNG; celular sin desborde.
- `supabase/pruebas/descansos.sql`: 14 comprobaciones de glacial_73 (termina en ROLLBACK). Pasó en PRUEBAS el 28/11/2026.

## Pendiente

- Cargar los **mínimos reales** en «Mínimos y días».
- Confirmar cómo funciona un equipo que no opera el domingo.
