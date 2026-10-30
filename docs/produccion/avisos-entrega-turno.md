# Aviso «Falta entregar el turno»

**Para qué:** que la entrega de turno (supervisor saliente → entrante) se use. Hasta ahora nadie recordaba hacerla y no había ninguna en producción.

**Qué hace:** en el Centro de alertas (campana), los supervisores, Jefatura y el Administrador ven «Falta entregar el turno DÍA 28/10 al siguiente supervisor · hace 1 h 30 min». Aparece 60 min después de terminar el turno (Día + Intermedio hasta las 19:00, Noche hasta las 07:00), solo si ese turno tiene producción registrada y no existe la entrega (`entregasTurno`, id «AAAA-MM-DD_DIA|INTERMEDIO|NOCHE»). Es ámbar y pasa a rojo desde 12 h de atraso. Desaparece solo al entregar. Tocar el aviso abre «Entrega de turno».

**Umbrales** (editables por Administrador y Jefatura en la pantalla de umbrales, `sync/configAlertas`): `entregaGraciaMin` (60) y `entregaDiasMax` (3 días atrás).

**Bot:** `window.glacialAvisos.pendientesEntrega()` devuelve `{items, total, mensaje}` con el texto listo para WhatsApp («⚠️ FALTA ENTREGAR EL TURNO …»). No avisa mientras la lista de entregas no ha cargado (no hay falsos avisos). El bot se conecta más adelante.

Código: núcleo `entregasPendientes` en `js/nucleo/45-indicadores.js`; conexión en `js/produccion/46-proyeccion-avisos.js`. Prueba: `tests/avisos-entrega.test.js`.
