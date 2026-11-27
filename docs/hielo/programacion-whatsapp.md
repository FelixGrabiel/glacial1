# Programación de Hielo desde WhatsApp (26/11/2026)

Planificación (Ventas) envía al grupo de Hielo la **imagen** de la programación del turno. El bot la lee con visión, la interpreta con esta página
(`js/hielo/97w-hielo-programacion-whatsapp.js`, `window.glacialHieloProgramacionWhatsApp`) y la carga en **Reporte Hielo › Programación**
(`hieloProgramacion/{fecha_TURNO}`; los vasos en `…_VASOS`). Quien la envió recibe por privado el resumen de lo cargado.

- `interpretarTexto(texto, opciones)`: lo mismo para el TEXTO «PROGRAMACIÓN TN / TD / TI» con una marca por línea («Glacial 1.5kg - 600 bolsas», «Envasadora Automática» como título, «Vasos Glacial - 70 unidades»); sin fecha usa la del turno en curso.
- `interpretar(lectura, opciones)`: puro. Suma las bolsas por marca y presentación; la máquina, «diferido», «envasadora automática» y «URGENTE» quedan en el mensaje de confirmación.
- `cargar(lectura, {numero, enviadoEn})`: guarda cada turno con `guardarProgramacion` (reemplaza lo programado de ese turno y producto) y deja `origen: WHATSAPP` y quién la envió en el historial.
- Quien envía debe estar en Gestión de usuarios › 📱 WhatsApp con su número y «Puede enviar la programación por WhatsApp»; la cuenta con la que el bot abre la página necesita el permiso de programar Hielo.
- Lo que no se entiende (marca, peso, cantidad, fecha, turno) es un error y no se carga nada. Pruebas: `tests/hielo-programacion-whatsapp.test.js`.
