# Programación desde WhatsApp (25/11/2026)

El mensaje de programación que Planificación envía al grupo de WhatsApp se traduce y se carga solo en **Planificación**. Antes, quien lo envió lo confirma con una palabra.

## Flujo

1. Planificación envía al grupo el mensaje de siempre: «*Programación 24/11 Turno Noche …».
2. El **bot** reconoce el mensaje y escribe **por privado** a quien lo envió con el resumen de lo entendido.
3. La persona responde **OK** para cargar o **NO** para descartar. Si no responde, no se carga nada; el bot puede recordárselo a los 15 minutos.
4. Con **OK**, cada línea y turno se carga con el guardado de «Secuencia de la línea» (`66b`: `S.guardar`). Eso significa:
   - los tramos y el orden se respetan;
   - se **reemplaza** lo programado antes en esa línea y turno, salvo lo que ya está en producción;
   - el historial queda registrado («Programación por WhatsApp · enviada por …»).
5. En Planificación › Programación turno aparece el aviso «📲 Cargada desde WhatsApp», con quién la envió, la hora de confirmación, las notas por línea y la nota de Hielo. Se puede editar como siempre. Si alguien edita a mano la secuencia, la fila deja de decir «WhatsApp».

También existe el botón **«📲 Importar de WhatsApp…»** en Planificación › Programación turno: se pega el mensaje, se pulsa **Leer** y luego **Cargar a Planificación**. Sirve como respaldo y para probar.

## Quién puede enviar

Solo se carga si el número de WhatsApp de quien envía pertenece a un usuario con permiso de **Planificación**. El Administrador registra ese número en **Gestión de usuarios › 📱 WhatsApp**:

- se guarda como `whatsapp` en el usuario, solo dígitos; a un número de 9 dígitos se le antepone 51;
- la comparación usa los últimos 9 dígitos.

## Cómo se lee el mensaje

| Mensaje | Planificación |
|---|---|
| «Programación 24/11 Turno Noche» (Día / Intermedio) | fecha (año más cercano a hoy) y turno |
| «Pet 2.5 L», «Pet 1 2.5L» | PET1 Pack Regular 2.5L x6 |
| «Cuisine Co **+ sticker**» | PET1 Pack c/Sticker 2.5L x6 |
| «Pet 2 1L», «PET2 1L» | PET2, **siempre línea nueva (/ln)** |
| … «con tapa plana» | TP 1L x6 /ln (sin tapa plana: indicar x6 o x12) |
| «Bidones 7L» / «10L» | B7L 7 Litros / 10 Litros |
| «Cajas 20L» | C20L Caja 20 Litros |
| «Bidones 20L» | B20L Bidón 20 Litros |
| «Hielo …» | nota del plan, sin filas |
| `Marca: 9000` (también 9.000 o 9,000) | cantidad fija |
| `Marca: Hasta las 2 AM` | hasta 02:00 (tramo «hasta una hora») |
| `Marca: Resto del turno` / «Hasta el fin de turno» / «Todo el turno» / marca sin número | hasta el cierre: cantidad estimada, siempre el último paso |
| «NO PARA», horario «(De 09:00 PM a 07:00 AM)», «tapa plana celeste» | notas de la línea |

Las marcas se comparan sin mayúsculas, tildes ni «Co» («Cuisine Co» = Cuisine; en B7L, CUISINE). Solo valen las marcas y presentaciones del catálogo de cada línea.

**Ejemplo: B7L del 24/11 Noche.** Scala hasta las 02:00 → Cuisine 2,600 → Aro 600 → Scala hasta el cierre. Scala queda como un solo producto con dos tramos (paso 1 y paso 4), y la cantidad se estima con la velocidad de la línea.

**Lo que no se entiende es un error y no se carga nada:** una marca desconocida, una presentación ambigua o «resto del turno» que no es el último paso. El privado explica qué corregir.

## Funciones para el bot (`window.glacialProgramacionWhatsApp`)

- `leer(texto, {hoy})` → `{programaciones, errores, avisos}`.
- `resumen(lectura)` → texto del privado. Con errores explica qué corregir; sin errores termina en «Responde OK … o NO …».
- `remitente(numero)` → `{ok, usuario, motivo}`.
- `cargar(lectura, {numero, enviadoEn})` → `{ok, resultados, texto}`. Vuelve a validar al remitente y devuelve el texto de confirmación para el privado.

La cuenta con la que el bot abre la página en Chromium necesita permiso de **Planificación**.

## Pruebas

- `tests/planificacion-whatsapp.test.js`: lectura del mensaje real del 24 y 25/11 y variantes.
- `tests/planificacion-whatsapp-cargar.test.js`: carga con el guardado real de la secuencia en una nube falsa (reemplazo, tramos de Scala, PET2 /ln, origen, historial, permisos).
- `tests/planificacion-whatsapp.e2e.js`: botón y vista previa en la página, y el WhatsApp en Gestión de usuarios.

## Lo que falta en el bot (proyecto aparte `glacial-whatsapp`)

No está en este repositorio. Prompt para la sesión que trabaje en el bot:

> Contexto: el bot de WhatsApp de GLACIAL (carpeta `C:\Users\felro\Documents\glacial-whatsapp`) ya abre la página de GLACIAL en Chromium sin pantalla para AVANCE y CIERRE. La página expone ahora `window.glacialProgramacionWhatsApp` (repo `felixgrabiel/glacial1`, archivo `js/produccion/66w-planificacion-whatsapp.js`, documentación `docs/planificacion/programacion-whatsapp.md`).
>
> Tarea:
> 1. **Reconocer el mensaje.** En el grupo de programación, cuando llegue un mensaje cuyo texto contenga «Programación dd/mm Turno …» (regex `/programaci[oó]n\s*\d{1,2}\s*\/\s*\d{1,2}.*turno/i`):
>    - guarda el texto, el número del remitente y la hora del mensaje;
>    - en la página ejecuta `const lect = await page.evaluate(t => window.glacialProgramacionWhatsApp.leer(t), texto)`;
>    - ejecuta también `const quien = await page.evaluate(n => window.glacialProgramacionWhatsApp.remitente(n), numero)`.
> 2. **Remitente no autorizado.** Si `quien.ok` es falso, escribe por privado `quien.motivo` y no hagas nada más.
> 3. **Mensaje con errores.** Si `lect.errores.length` es mayor que 0, escribe por privado `resumen(lect)`, que explica qué corregir, y termina.
> 4. **Pedir confirmación.** Si no hay errores, escribe por privado `resumen(lect)` y guarda la confirmación pendiente por remitente: texto, lectura, hora y vencimiento de 2 horas.
> 5. **Respuesta en el privado.** Cuando esa persona responda en el privado:
>    - **OK** (sin importar mayúsculas, con o sin punto; también «sí» o «si»): ejecuta `await page.evaluate(([l,n,en]) => window.glacialProgramacionWhatsApp.cargar(l,{numero:n,enviadoEn:en}), [lect, numero, horaMensaje])` y responde con el `texto` que devuelve.
>    - **NO**: descarta y responde «Descartada. No se cargó nada.».
>    - **Otra cosa**: responde «Responde OK para cargar o NO para descartar.».
> 6. **Recordatorio y vencimiento.** Si a los 15 minutos no hay respuesta, recuérdalo una sola vez. A las 2 horas se descarta sin cargar.
> 7. **Programación nueva antes de responder.** Si la misma persona envía otra programación antes de responder, la nueva reemplaza a la pendiente; avísalo en el privado.
> 8. **Errores al cargar.** Si `cargar` lanza un error (sin conexión, sin permiso), responde «No se pudo cargar: <mensaje>. Intenta de nuevo con OK.» y mantén la confirmación pendiente.
> 9. **Registro.** Registra en el log cada lectura, confirmación y carga: remitente, fecha, turno, líneas y resultado.
>
> **Pruebas:**
> - mensaje reconocido con remitente autorizado → privado con el resumen;
> - remitente sin permiso → privado con el motivo;
> - mensaje con error → privado con la corrección;
> - OK → carga;
> - NO → descarta;
> - sin respuesta → recordatorio y vencimiento;
> - dos programaciones seguidas.
>
> **Restricciones:**
> - no escribas en el grupo, solo en el privado del remitente;
> - no cargues nada sin OK;
> - no cambies la lectura (es de la página);
> - la cuenta del bot en la página necesita permiso de Planificación.
