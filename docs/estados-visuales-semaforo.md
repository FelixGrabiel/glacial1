# Semáforo de Producción Actual: color por estado y «PRÓXIMO A PRODUCIR»

## Causa comprobada del rojo con «En curso»
En `24-semaforo-produccion-actual.js`, al armar el grupo de cada línea se calculaba el estado (`nivelEstado`, ámbar para En curso) y después:
`nivelFinal = desempeno.nivel !== 'gris' ? desempeno.nivel : nivelEstado` con el comentario «el COLOR refleja el desempeño». Ese `nivelFinal` era el que pintaba la luz y la etiqueta del encabezado. Si el ratio estaba por debajo del necesario (meta no alcanzable), el desempeño salía rojo y pisaba el estado. La tarjeta de marca usa otro resolver (`estadoOrdenItem`), por eso seguía naranja. Ahora `nivelFinal = nivelEstado`; el desempeño se conserva aparte (`nivelDesempeno`) y la alerta roja vive en el panel de proyección.

## Mapa único
`js/produccion/24a-estados-visuales.js` (`glacialEstadosVisuales`): En curso naranja · Próximo a producir amarillo · En pausa amarillo · Detenida rojo · Completada verde · Pendiente gris · Cancelada (rojo, sin cambios). Agrega los niveles `naranja` y `amarilla` a la luz, etiqueta y punto del semáforo (`16-paletas.js` admite esos niveles). Orden de carga: 16 → 24a → 24. «Estado actual de planta» (Resumen) usa los mismos colores.

## PRÓXIMO A PRODUCIR
- Resolver (`aplicarEstadoVisualSecuencia` + `estadoOrdenItem`): una marca **sin evidencia de inicio** (sin estado operativo y sin hora de inicio) que es la siguiente de la secuencia se muestra «PRÓXIMO A PRODUCIR» (amarillo). Se decide por tramo/orden y evidencia de inicio, **no** por producido = 0; la secuencia manda sobre unidades de un tramo anterior (producto repetido).
- El próximo salta tramos finalizados/cancelados. Si la marca activa todavía no arrancó, ella es la próxima y las demás esperan como PENDIENTE.
- Clave interna sigue siendo `PENDIENTE`: indicadores, estado de línea y controles (Iniciar) no cambian; el próximo no activa la línea.
- Ya no se genera la «pausa por secuencia» (`PAUSA_SECUENCIA`): un producto repetido no es una pausa real.
- Pausa real (op `PAUSA`) se conserva. Una `PAUSA` sin hora de inicio ni de pausa (dato antiguo ambiguo) se conserva y queda marcada `requiereRevision`; no se reescribe ningún histórico.
- Contador: «Próximos a producir» separado de «En pausa».

## No cambia
Producción, cantidades, secuencia, paradas, ratio, cumplimiento, proyección y sus fórmulas/umbrales; escritura de estados (no hay escritor nuevo); permisos y botones.

## Límites
- Sin secuencia (`tramosSecuencia`) no hay «próximo»: la marca sigue como PENDIENTE.
- El resolver recibe una fila por marca/presentación; si un mismo producto tiene un tramo en curso y otro posterior, se muestra una sola tarjeta.
- Inicio operativo/Inicio ejecutivo siguen con sus propios estilos (no se tocaron).
- Probado con el resolver real en pruebas (`tests/estados-visuales.test.js`) y colores calculados en `tests/visual/semaforo-estados.html`; no con datos reales ni la versión publicada.
