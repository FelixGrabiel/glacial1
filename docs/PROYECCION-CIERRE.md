# Proyección de cierre del bloque (Parte A)

## Dónde viven las fórmulas
Todas en `GlacialIndicadores.proyeccionCierre` y `analisisProyeccion` ([45-indicadores.js](../js/nucleo/45-indicadores.js)), puras y con pruebas (`tests/proyeccion-cierre.test.js`, `tests/proyeccion-cierre-23b.test.js`). `proyectarCierreLinea` (23b) solo arma sus datos; la tarjeta (24) y el panel del Inicio (46) solo las muestran.

## Definiciones
- **Paradas oficiales** = programadas + no programadas registradas por el supervisor (Avance/Cierre y registro). DETENER, REANUDAR y PAUSA solo son estado.
- **Tiempo transcurrido** = min(ahora, fin objetivo) − inicio real. **Tiempo efectivo** = transcurrido − paradas oficiales.
- **Ritmo real (ratio)** = producido ÷ tiempo efectivo. **Rendimiento del bloque** = producido ÷ (transcurrido − paradas programadas ya ocurridas).
- **Tiempo restante** = fin objetivo − ahora − pausas previstas aún no registradas.
- **Pendiente** = programado − producido (mín. 0). **Tiempo nominal necesario** = Σ pendiente de cada producto vigente ÷ su velocidad estándar (`sync/configIndicadores`). **Requerimiento** = tiempo nominal necesario ÷ tiempo restante.
- **Si las paradas siguen igual** = producido + rendimiento × restante. **Sin nuevas paradas** = producido + ritmo real × restante.
- **Final estimado** = ahora + pendiente ÷ rendimiento (al minuto más cercano; suma las pausas pendientes). Si pasa del fin objetivo se muestra el retraso.
- **Estado**: CUMPLIBLE (siguen igual ≥ programado) · EN RIESGO (no, pero el tiempo nominal cabe en el restante) · NO ALCANZABLE (no cabe). Sin umbrales por porcentaje; los de `sync/configAlertas` solo se usan para la alerta de proyección baja.
- Casos especiales (sin NaN, Infinity ni negativos): sin inicio real, producido 0 o < 30 min efectivos → «No es posible proyectar todavía» (con motivo, y si la meta cabe o no a capacidad nominal); pendiente 0 → «Meta cumplida»; bloque terminado → resultado y faltante; producto sin velocidad → «Falta velocidad estándar».
- Avisos informativos (no cambian ningún número): detención del semáforo sin parada oficial equivalente y «dato desactualizado desde las HH:MM» (más de 60 min sin registro de producción).

## Configuración (sync/configIndicadores → campo `bloques`)
```json
{ "bloques": {
    "diaInter": { "inicio": "07:00", "fin": "19:00", "pausas": [ { "nombre": "Refrigerio", "min": 60 } ] },
    "noche":    { "inicio": "21:00", "fin": "07:00", "pausas": [ { "nombre": "Refrigerio", "min": 60 } ] } } }
```
Entre `diaInter.fin` y `noche.inicio` la planta está parada. Si el campo no existe o es inválido se usan estos valores iniciales. Los horarios de tareo (`HORARIOS_TURNO`) no cambian. No hay colecciones nuevas y las reglas de etapa 2 no cambian (el documento ya lo escribe quien configura umbrales). Aún no hay pantalla para editar `bloques` (se edita en el documento).

## Cómo se reconoce que una pausa prevista ya fue registrada
Por el **nombre** del motivo: se suman los minutos de las paradas **programadas oficiales** cuyo motivo, normalizado (sin mayúsculas ni acentos), coincide con el nombre de la pausa prevista; solo se descuenta lo que falta hasta los minutos previstos (refrigerio registrado a medias: se descuenta el resto).

## Qué cambió
- 45: bloques, pausas previstas, `proyeccionCierre`, `analisisProyeccion`.
- 23b: `rangoTurno` usa el bloque configurado (Día e Intermedio comparten 07:00–19:00; Noche 21:00–07:00); `proyectarCierreLinea` delega en 45.
- 24: tarjeta de proyección en una sola columna (estado, proyección, avance, faltante, restante, ritmo, necesario/capacidad, final, análisis, avisos, detalle por producto).
- 46: el panel del Inicio muestra el estado nuevo.
- 47: `glacialConfigIndicadores()` expone `bloques`.
