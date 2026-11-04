# Paradas del supervisor en el AVANCE de WhatsApp — prompt para el bot y resumen de lo hecho

Fecha: 2026-10-22 · Rama: `claude/dreamy-johnson-lbcfee`

## 1. Qué se hizo (en la página)

**Problema.** En la imagen de AVANCE (Turno Día, 22/10/2026 15:24) PET1 y PET2 decían «Sin paradas registradas» y el resumen decía «Paradas: 0 min», aunque el supervisor había ingresado paradas. B7L mostraba 45 min en su bloque, pero esos minutos no entraban al resumen.

**Causa (más probable).** Las paradas que el supervisor guarda en Avance/Cierre viven en `sync/avancesTurno › paradasOperativas` (Supabase, a través del puente). La página solo las carga cuando se abre la pestaña Avance y se activa `avEscuchar()`. El bot calcula en Chromium sin pantalla y, si lo hace antes de que esa escucha cargue, `avanceEstado.paradasOperativas` queda en `[]`. Por eso:
- el total de la línea, el resumen y el ratio salen con 0 paradas;
- las filas «automáticas» copiadas al cuadro del Registro (B7L) se ven en el bloque, pero `avParadasRegistroLinea` las salta a propósito porque supone que las cuenta `paradasOperativas`.

**Cambio.** `js/produccion/29-avance-produccion.js` — nueva función `window.glacialAvancePreparar()`:
- Lee de nuevo `sync/avancesTurno` y carga `paradasOperativas` y `avancesUpdatedAt`.
- Fija la fecha y el turno operativos (salvo que se haya elegido otro a mano).
- Activa `avEscuchar()` si no estaba activa (sin duplicarla).
- Devuelve `{ok, fecha, turno, paradasOperativas}` (cantidad de paradas vigentes del turno).
- Si la lectura falla, **lanza el error** (no se debe generar un reporte con 0 paradas por no haber podido leer).

**Prueba.** `tests/avance-preparar-paradas.test.js` (10 comprobaciones, todas pasan). También pasan `cierre-paradas`, `avance-lineas-en-produccion`, `avances-items` y `bloque-dia-intermedio`. No se corrió la suite completa.

**Documentación.** Nota en `INDICE.md`, fila de `29-avance-produccion.js`.

## 2. Lo que falta (en el bot, fuera de este repositorio)

El bot vive en `C:\Users\felro\Documents\glacial-whatsapp`. Hay que llamar a la función nueva antes de calcular el snapshot. Ese cambio no se pudo hacer desde esta sesión.

## 3. Prompt para la sesión que trabaje en el bot

> Contexto: el bot de WhatsApp de GLACIAL (carpeta `C:\Users\felro\Documents\glacial-whatsapp`) responde a `AVANCE` y `CIERRE` con una imagen generada en Chromium sin pantalla, usando `avConstruirSnapshot` de la página. Hoy la imagen sale sin las paradas que el supervisor agregó en Avance/Cierre (PET1 y PET2 con «Sin paradas registradas», resumen «Paradas: 0 min»), porque el bot calcula antes de que la página haya cargado `sync/avancesTurno › paradasOperativas`.
>
> La página ya expone `window.glacialAvancePreparar()` (rama `claude/dreamy-johnson-lbcfee` del repo `felixgrabiel/glacial1`, archivo `js/produccion/29-avance-produccion.js`). Es asíncrona: lee de nuevo las paradas del supervisor, fija fecha/turno operativos, activa la escucha, devuelve `{ok, fecha, turno, paradasOperativas}` y **lanza error si no puede leer**.
>
> Tarea:
> 1. En el flujo de los comandos `AVANCE`, `AVANCE <línea>`, `CIERRE` y `CIERRE <línea>`, antes de llamar a `avConstruirSnapshot`, ejecuta en la página de Chromium: `await page.evaluate(() => window.glacialAvancePreparar());`
> 2. Si esa llamada lanza error o no devuelve `ok: true`, NO envíes la imagen. Responde en el grupo: «No pude cargar las paradas del turno, intenta de nuevo en un momento.» y registra el error en el log del bot.
> 3. Llama a la función en CADA comando (no una sola vez al arrancar): así cada petición ve lo último que guardó el supervisor.
> 4. Registra en el log la cantidad `paradasOperativas` devuelta, para poder diagnosticar.
> 5. Agrega pruebas (el bot ya tiene 113) que cubran: éxito (se llama antes del snapshot), error de lectura (no se envía imagen y se responde el aviso) y que se llama en cada comando.
> 6. Verifica con datos reales (turno Día) que la imagen muestra las paradas de PET1/PET2 y que «Paradas» del resumen coincide con la suma de las paradas de las líneas.
>
> Restricciones: el AVANCE sigue siendo solo lectura (no guardar snapshot, no tocar Google Sheets, no escribir en la base). No cambies el cálculo de la página. Si tras el cambio la suma de B7L sigue sin coincidir con los 45 min de su bloque, no lo ocultes: repórtalo, porque entonces el problema está en el origen de las filas automáticas del Registro.

## 4. Cómo comprobar que quedó bien

1. Abre Avance y Cierre en la web (Día, 22/10) y genera la vista de pantalla: es la referencia.
2. Escribe `AVANCE` en el grupo de pruebas: la imagen debe mostrar las mismas paradas por formato y el mismo total del resumen.
3. Agrega una parada nueva como supervisor y vuelve a escribir `AVANCE`: debe aparecer sin reiniciar nada.
4. Si hay un error de lectura, el bot debe avisar y no mandar imagen.
