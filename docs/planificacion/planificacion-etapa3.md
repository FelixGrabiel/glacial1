# Planificación · etapa 3 (capacidad, secuencia y traslado de saldo)

## Qué cambió, por archivo
| Archivo | Cambio |
|---|---|
| `js/produccion/65-planificacion-capacidad.js` (nuevo) | Capacidad por línea y bloque (`NS.capacidadLinea`), secuencia con horas estimadas (`NS.secuenciaLinea`), saldo comprobado (`NS.saldoDe`) y traslado de saldo en una transacción (`NS.trasladarSaldo`, `NS.abrirTraslado`). Paneles «Capacidad del bloque» y «Secuencia del bloque» bajo la tabla de Programación. |
| `js/produccion/53-planificacion-catalogo.js` | **Tiempos previstos** (minutos por cambio de marca/formato y paradas previstas de Día y de Noche) en la pestaña Catálogo; se guardan en el mismo documento del catálogo (`sync/catalogoPlanificacion.tiempos`) y **los escritores del catálogo ya no borran ese campo**. Vista semanal: «Carga N %» por línea y bloque. |
| `js/produccion/52-planificacion-pantalla.js` | Contenedores de capacidad y secuencia; botón **Trasladar saldo** (solo Planificación, solo con saldo comprobado). |
| `js/produccion/54-planificacion-solicitudes.js` | El historial muestra «Traslado de saldo». |
| `index.html` | Carga `65-planificacion-capacidad.js` y sube versiones (`?v=20261011-pl3`). |
| Pruebas | `tests/planificacion-etapa3.test.js` (53 comprobaciones) y `tests/visual/planificacion.html` actualizado. |

No hay reglas de Firestore nuevas, ni colecciones nuevas, ni cambios en `01-config.js` ni en las líneas de Firebase de `index.html`.

## Capacidad (estimación de referencia)
Por línea y bloque; las UND de líneas distintas **nunca** se suman para medir capacidad.
- **Producción** = Σ (UND programadas ÷ velocidad estándar del producto). La velocidad es la tabla única (`glacialVelocidadEstandar`: `sync/configIndicadores` con el catálogo base de respaldo).
- **Cambios** = n.º de cambios de producto × minutos por cambio (Catálogo). Con secuencia, los cambios son los de la secuencia; sin ella, productos − 1.
- **Disponible** = duración del bloque (configuración de bloques: Día 07:00–19:00 = 12 h; Noche 21:00–07:00 = 10 h) − paradas previstas del bloque (Catálogo).
- **Cada tiempo se cuenta una sola vez:** las paradas previstas solo restan del disponible y los cambios solo suman al requerido (no se descuenta una ventana y se vuelve a sumar).
- **Estado:** Cabe, Justo (carga ≥ 95 %), No cabe, o **Estimación incompleta** si a algún producto le falta la velocidad estándar o el bloque no tiene duración: se dice qué falta y no se muestra carga inventada (en la vista semanal: «Carga: incompleta»).
- Si no hay tiempos de cambio/paradas configurados, se compara solo producción contra la duración y se avisa en pantalla (no se inventan minutos).
- **Límite:** son supuestos de planificación; no son las paradas oficiales de Avance/Cierre ni miden eficiencia real. En el sistema no existían tiempos de cambio ni ventanas previstas como dato, por eso se agregó la configuración de «Tiempos previstos».

## Secuencia
Usa los tramos que ya existen (`tramosSecuencia`, definidos en Paletas → «Agregar a secuencia»); aquí es solo lectura. Estima inicio y fin de cada tramo desde el inicio del bloque a velocidad estándar, con el cambio entre productos distintos.
- **Un producto repetido no duplica su cantidad** (SCALA → BELLS → SCALA): reparte entre sus tramos solo lo programado; un tramo «hasta una hora» produce lo que cabe y el último toma lo que falta. Ejemplo de la prueba: SCALA 6 000 = 3 000 + 3 000 en dos tramos; 07:00–08:00, 08:30–13:30, 14:00–15:00.
- Sin tramos definidos no se inventa un orden. Tramo sin velocidad → «Estimación incompleta». Productos sin tramo y secuencias que pasan del fin del bloque se avisan. Noche arranca a las 21:00 de la fecha operativa.

## Traslado de saldo
En una fila con saldo comprobado, «Trasladar saldo» abre un diálogo (destino: fecha y bloque; cantidad; motivo ≥ 5 caracteres).
- **Saldo comprobado** = programado − producido oficial (`glacialProducidoVigente`). Sin registro de producción **no se puede comprobar** y no se ofrece. No se puede trasladar más que el saldo ni más que la cantidad de esa fila.
- **Una sola transacción** sobre `sync/programaciones`: baja el origen (lo ya producido se queda), sube o crea el destino y escribe dos eventos de historial (origen y destino, con `traslado` = origen, destino, cantidad, saldo comprobado, programado y producido). El total se conserva (10 000 = 6 500 + 3 500) y no se copia la cantidad original.
- Comprueba la versión de la fila de origen: si cambió mientras se preparaba, no se aplica y muestra el valor actual. Si el destino ya tiene ese producto, se suma.
- **Compromiso original (etapa 2):** si el bloque de origen ya empezó, se guarda su plan original antes de bajarlo, de modo que Cumplimiento no oculta el incumplimiento (original 10 000, vigente 6 500). Si el destino ya empezó, también.
- Historial: acción `EDICION`/`CREACION` con referencia `TRASLADO: …` (como `UNIFICACION`), sin tocar las acciones que permiten las reglas.

## Compatibilidad con Supabase
Solo `runTransaction`, `set`, `onSnapshot` y ids propios; sin `where` `in`/`!=`, `increment`, `arrayUnion`, `update` con rutas con punto ni `startAfter`. Los tiempos viven como un campo más de `sync/catalogoPlanificacion` (documento que ya escribe quien planifica); no hace falta migración de reglas.

## Qué probé
- `node tests/planificacion-etapa3.test.js` (nube falsa con transacciones, reloj controlado, velocidades de prueba): duraciones, cabe/justo/no cabe/incompleta, que cada tiempo cuente una vez, sin tiempos configurados, Noche, Día + Intermedio, fila cancelada; secuencia con SCALA → BELLS → SCALA (horas y cantidades), sin velocidad, producto sin tramo, exceso del bloque, Noche; saldo con y sin registro; traslado (validaciones, éxito, historial, compromiso, destino existente, otra fecha, fila cambiada, fallo de red, sin permiso); paneles; vista semanal; tiempos del catálogo (no borran productos y viceversa); compatibilidad con el puente. Todas las suites pasan (42).
- **Navegador** (`tests/visual/planificacion.html`): panel de capacidad (PET 1 cabe con 68 %, B7L «Estimación incompleta» por falta de velocidad), secuencia con 4 500 + 1 500 de Scala (6 000 en total) y horas 07:00–08:30 / 09:10–11:52 / 12:32–13:02, traslado real de 3 500 UND a Noche (origen 6 500, destino 3 500, dos eventos de historial, compromiso del bloque de origen guardado), validación de motivo en el diálogo, vista semanal con «Carga 54 %» y «Carga: incompleta», guardado de tiempos sin perder el catálogo, y celular a 375 px sin desplazamiento horizontal de la página.

## Qué NO pude probar
- Firestore ni Supabase reales ni cuentas reales; ni con las velocidades reales de la tabla de Análisis de paradas (en pruebas y navegador se usaron velocidades de ejemplo).
- La estimación de capacidad no se contrastó con la producción real: es de referencia.
- **Traslado de saldo con una producción registrada justo entre la comprobación y la confirmación:** el saldo se calcula en el navegador con el producido oficial (no es transaccional con Paletas); la ventana es corta pero existe.
- Dos personas trasladando a la vez desde la interfaz (cubierto por la comprobación de versión en pruebas automáticas).
- Copiar/exportar con los paneles nuevos; celular físico.

## Limitaciones conocidas
- El traslado opera sobre la fila elegida; si un producto tiene fila en Día y en Intermedio, el máximo es el de esa fila.
- La secuencia no se edita desde Planificación (se define en Paletas).

## Etapa siguiente (sin implementar)
Personal e insumos/Almacén («Por confirmar» hasta que haya datos fiables), prioridad/pedido/fecha requerida. «Borrador y publicación» sigue descartado (Producción Actual lee la programación directamente).
