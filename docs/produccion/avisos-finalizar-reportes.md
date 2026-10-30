# Aviso «Reporte sin finalizar» (supervisores) y mensajes del bot

## Qué hace
Cuando un reporte de producción sigue **EN_REGISTRO** o **REABIERTO** y su bloque ya terminó, el Centro de alertas muestra un aviso a los supervisores
(igual que las alertas de parada, proyección o programación sin iniciar). Desaparece solo cuando el reporte se finaliza.

- **Cuándo avisa:** pasados **120 minutos** del fin del bloque (Día + Intermedio termina 19:00, Noche 07:00; los horarios salen de `sync/configIndicadores → bloques`).
- **Hasta cuándo:** reportes de hasta **7 días** atrás; más antiguos se consideran historia y no avisan.
- **Color:** ámbar; **rojo** desde 24 h de atraso.
- **Qué cuenta:** reportes con al menos un cuadro con marca y producción (efectiva o sopladas). Los borradores vacíos no avisan; los reportes antiguos sin estado tampoco.
- **Quién lo ve:** Supervisor (solo su línea, si la tiene asignada), Jefe de Producción/Operaciones, Jefatura y Administrador (todas las líneas).
- **Al tocar el aviso:** abre el reporte para continuarlo (`cargarReporteParaCorreccion`).
- **Umbrales:** `finalizarGraciaMin` (120) y `finalizarDiasMax` (7), editables en «Umbrales de avisos» (Administrador y Jefatura), en `sync/configAlertas`.

Código: cálculo puro en `js/nucleo/45-indicadores.js` (`reportesSinFinalizar`, `textoReporteSinFinalizar`, `mensajeReportesSinFinalizar`); conexión en `js/produccion/46-proyeccion-avisos.js`.
Pruebas: `tests/avisos-finalizar.test.js`.

## Para el bot de WhatsApp (proyecto `glacial-whatsapp`, fuera de este repositorio)
El bot ya abre la página en Chromium sin pantalla con un usuario de solo consulta (así calcula AVANCE y CIERRE). Para los avisos usa la misma vía:

```js
const r = await page.evaluate(() => window.glacialAvisos.pendientesFinalizar());          // todas las líneas
const r2 = await page.evaluate(() => window.glacialAvisos.pendientesFinalizar({linea:'PET1'}));
// r = { generadoEn, total, items:[{id,linea,fecha,turno,estadoRegistro,cuadros,sinFinalizar,finMs,atrasoMin,nivel,texto,textoCorto}], mensaje }
```

- `mensaje` es el texto listo para enviar (vacío si `total === 0`; en ese caso **no se envía nada**).
- No depende de quién mira: sirve con el usuario de solo consulta. No guarda ni modifica nada.
- Los reportes deben estar cargados en la página (esperar la carga, como en AVANCE/CIERRE).

### Reglas recomendadas para el envío (a implementar en el bot)
1. Enviar al grupo de supervisores/operaciones, **no** a todos los grupos.
2. **Sin repetir**: guardar en la PC del bot el `id` de cada item ya avisado y su `nivel`; volver a avisar solo si pasó a rojo o si pasaron 4 h.
3. Horario: no enviar entre las 22:00 y las 06:00 (salvo que se decida otra cosa).
4. Revisar cada 30 minutos; enviar un solo mensaje agrupado, nunca uno por reporte.
5. Límite diario de mensajes y registro de lo enviado (el bot usa una librería no oficial: conviene no abusar).
6. Comando opcional `PENDIENTES` (o `PENDIENTES PET1`) para pedirlo a demanda, con la misma lista de personas autorizadas de AVANCE/CIERRE.

El cambio en el bot lo hace quien mantiene `glacial-whatsapp`; en esta página no hace falta nada más.
