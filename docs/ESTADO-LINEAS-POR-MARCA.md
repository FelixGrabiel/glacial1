# Estado de líneas: marca en curso, total aparte y aviso de detenida

Aplica al **Inicio** (tabla/tarjetas «Producción por línea», datos de `glacialResumenEjecutivoLineas`) y al
tablero **Estado de las líneas** de Producción Actual. No se tocó ningún dato guardado ni fórmula de indicadores.

## Qué muestra
- **Marca en curso** con SU avance: producido / programado de esa marca y su %.
- **Total línea (N marcas)** aparte: suma de todas las marcas del bloque (las canceladas no suman al programado).
- **Desglose por marca**: marca y presentación, producido / programado, % y estado. Tabla: se despliega al tocar la
  fila; celular (≤ 620 px): lista corta siempre visible dentro de la tarjeta. Unidades como antes (UND, BID, CAJ).
- **Estado de la línea** = el de la marca en curso. Si otra marca sigue DETENIDA sin finalizar aparece el aviso
  «Marca X quedó detenida desde HH:MM: finalízala o reanúdala», sin cambiar el estado principal.

## Diferencia con el resto de pantallas
`GlacialIndicadores.estadoLineaDesdeItems` **no cambió** (DETENIDA > EN_CURSO > PAUSA > PENDIENTE > COMPLETADA) y sigue
alimentando Resumen general, alertas y proyección (`fila.estado`). Estas dos pantallas usan la función nueva
`GlacialIndicadores.desgloseLineaPorMarca` (`fila.desglose`): si hay una marca EN CURSO, esa define el estado; si no,
se usa la prioridad de siempre. Por eso una línea puede figurar «DETENIDA» en una alerta y «EN CURSO» (con aviso) aquí.

## Tiempo real
Todo sale de lo que ya se escucha con `onSnapshot` (programaciones y paletas): el Inicio se redibuja con
`onPaletasUpdated`/`onProgramacionesUpdated`; las filas desplegadas se recuerdan entre actualizaciones.

Prueba: `node tests/estado-linea-marcas.test.js` (PET2 con 3 marcas: completada, detenida sin finalizar, en curso).
