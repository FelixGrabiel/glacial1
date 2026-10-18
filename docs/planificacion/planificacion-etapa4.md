# Planificación · etapa 4 (tiempos previstos, opciones para completar y carga semanal)

Rama `planificacion-4-tiempos-capacidad` (desde `main`). No se publicó nada.

## Qué ya existía y qué se completó
La etapa 3 ya tenía: un valor global de minutos por cambio, minutos fijos por bloque, la secuencia con horas, el traslado de saldo y «Carga N %» en la vista semanal.
Esta etapa lo **reemplaza por un cálculo único** (el motor) y completa lo que faltaba. Los valores de la etapa 3 siguen funcionando como «valores generales de respaldo».

| Archivo | Cambio |
|---|---|
| `js/produccion/65b-planificacion-motor.js` (nuevo) | **Motor puro** (sin pantalla ni base de datos): unión de ventanas, reglas de preparación, capacidad del plan, colocación de la secuencia entre ventanas y capacidad restante. Es la única fuente del cálculo. |
| `js/produccion/65a-planificacion-tiempos.js` (nuevo) | Datos de **reglas** y **ventanas**, versión de parámetros, auditoría, evaluaciones guardadas y la sección «Tiempos previstos» del Catálogo. |
| `js/produccion/65-planificacion-capacidad.js` | Usa el motor. Panel de capacidad con desglose, capacidad restante, escala de capacidad con leyenda propia y **traslado idempotente**. |
| `js/produccion/65c-planificacion-opciones.js` (nuevo) | «Ver opciones para completar». |
| `js/produccion/65d-planificacion-semanal.js` (nuevo) | **La** Vista semanal (reemplaza a la de 53, que se eliminó): 5 líneas × 7 días, bloque Mañana + Intermedio / Noche / Ambos, filtros, detalle de celda. |
| `53`, `54`, `52` | 53: el guardado de valores de respaldo ya no borra reglas ni ventanas; delega la sección en 65a. 54: el historial muestra las filas de «Tiempos previstos». 52: los diálogos comparten el estilo de `#plan-root`. |
| `index.html` | Orden de carga: 64 → 65b → 65a → 65 → 65c → 65d (`?v=20261012-pl5`). |

## Datos (sin colecciones ni reglas nuevas)
Todo vive en `sync/catalogoPlanificacion → tiempos` (documento que ya escribe quien tiene el permiso `planificacion`) y cada cambio deja su rastro en `historialProgramacion`
(acción `EDICION`, referencia `TIEMPOS: …`, usuario/UID, hora del servidor, antes, después, motivo y versión) **en la misma transacción**.
- `reglas[]`: `{id, linea, tipo, aplica, origen, destino, minutos, activo, descripcion, actualizadoPor/Uid/En}`. Tipos: cambio de marca, de presentación/formato, **cambio de marca y formato (una sola intervención)**, limpieza de inicio / fin / entre productos y «otra preparación» (con descripción y cuándo aplica).
- `ventanas[]`: `{id, linea, fecha, bloque, tipo, inicio, fin | duracionMin, motivo, activo, responsable}`. Tipos: mantenimiento previsto, refrigerio con detención de línea, limpieza en ventana fija, otra (con motivo). Una ventana quitada se desactiva (queda auditable); se podan las de más de 120 días.
- `version`: sube con cada cambio. `evaluaciones{fecha|bloque|línea}`: lo que dio el cálculo cuando el plan se guardó (se podan a 90 días).
- `cambioMin / fijoDiaMin / fijoNocheMin`: valores de respaldo de la etapa 3.
- **No hay que publicar reglas de Firestore.** Límite: las reglas validan quién escribe el documento, no el contenido de cada regla; las validaciones de contenido están en el servicio y se repiten dentro de la transacción.

## Cómo se calcula (y cómo se evita contar dos veces)
- **Disponible** = duración del bloque − **unión** de las ventanas previstas (dos ventanas superpuestas descuentan sus minutos comunes una sola vez). Noche cruza la medianoche: todo se mide en minutos desde el inicio del bloque.
- **Requerido** = Σ (UND ÷ velocidad estándar) + preparaciones. Cada tarea cuenta **una** vez:
  - una **limpieza ya registrada como ventana** de limpieza no se suma otra vez como preparación (se explica en pantalla);
  - un cambio de **marca y formato a la vez** usa la regla combinada; sin ella se aplica la **mayor** de las dos, nunca la suma, y se avisa;
  - gana la regla **más específica** (origen/destino) sobre el valor general de la línea, y éste sobre el valor general de respaldo;
  - los minutos fijos antiguos solo se usan si el bloque no tiene ventanas con horario;
  - un producto repetido en la secuencia (SCALA → BELLS → SCALA) reparte entre sus tramos solo lo programado y genera un cambio por cada vez.
- **Faltantes:** no se inventa nada. Velocidad ausente, cambio sin regla ni respaldo, duración del bloque ausente → «Estimación incompleta» con el dato. **Cero explícito** es válido (la regla existe con 0 min); vacío = sin configurar. Disponible 0 → «No cabe» sin porcentaje.
- **Colocación:** con secuencia, se simula el bloque: la producción de un tramo es continua y se detiene mientras dura una ventana; una **preparación no se parte** (necesita un hueco libre). Un total de horas que cabe puede no ser ejecutable → «No cabe» con el motivo. Sin secuencia en Paletas se dice que la colocación no se puede verificar.
- **Capacidad restante** (bloque iniciado): desde «ahora», con el producido oficial, las ventanas **futuras** (las pasadas no se descuentan otra vez) y solo las preparaciones que faltan. Sin producido de algún producto no se calcula ni se propone nada, y se dice por qué. Indica la hora del cálculo.
- **Separación:** nada de esto crea paradas oficiales ni toca el ratio real ni Avance/Cierre (hay una prueba que lo comprueba).

## Parámetros versionados
Al guardar un plan queda la evaluación con la versión de los parámetros y una huella (parámetros de esa línea y bloque + cantidades del plan). Si se cambia una regla o ventana:
las evaluaciones de planes ya guardados **no se reescriben**: la pantalla muestra lo guardado con el aviso «los parámetros cambiaron», calcula aparte el resultado de hoy y ofrece
**Catálogo → Tiempos previstos → «Revisar y recalcular…»** (lista los planes afectados; recalcular es explícito y queda guardado).

## Opciones para completar («No cabe»)
Propuestas revisables (nada se aplica solo): **completar en Noche**, **en otra fecha** (hasta 7 días), **otro bloque de la misma línea**, y **cambiar el orden** solo como sugerencia informativa (sin secuencia en Paletas y si reduce cambios).
Traslada cantidad de **un producto** (UND enteras): lo necesario para el exceso, limitado por lo que **cabe** en el destino contando la preparación adicional (búsqueda de la mayor cantidad entera que deja el destino en «Cabe»).
Muestra producto, prioridad (no registrada → «por confirmar»), compromiso original, programado, producido, pendiente, cantidad a origen y destino, preparación adicional, capacidad antes y después de ambos bloques y advertencias. No se propone otra línea (no hay compatibilidad validada en el catálogo). Es una estimación con velocidad nominal.
«Revisar y aplicar» abre el diálogo de traslado con los datos prellenados.

## Traslado de saldo (reforzado)
Identificador de traslado (id fijo en el historial): un **doble clic o reintento no se aplica dos veces**. Dentro de la transacción se relee origen y **destino** (versión), se rechaza destino finalizado/cancelado o bloque ya terminado, y se verifica la capacidad del destino (si quedaría en exceso hay que aceptarlo expresamente y queda en el historial). Si algo cambió mientras se revisaba, no se aplica y el diálogo se reabre con la propuesta actualizada. Un bloque que **aún no empezó** tiene el saldo comprobado en cero producido. Conserva el compromiso original y el historial de la etapa 2.

## Vista semanal
Selector de semana, bloque (Mañana + Intermedio / Noche / **Ambos por separado**, nunca sumados), filtro de línea y de estado de capacidad. Cada celda: requerido / disponible, utilización, libre o exceso, nº de productos, estado de capacidad y estado operativo (con los colores acordados). Al tocar una celda: desglose completo y acceso a la programación de ese día y bloque.
**Escala de capacidad** con texto e ícono y leyenda propia, distinta de la operativa: ✓ Cabe (azul) · ◐ Cabe, ajustado (violeta) · ✕ No cabe (fucsia) · ? Estimación incompleta (pizarra, borde punteado) · — Sin programación · ⚠ Datos no disponibles.
La celda y el detalle diario salen de la misma función (`NS.evaluar`), así coinciden.

## Permisos
Configurar tiempos, trasladar y aplicar opciones: permiso `planificacion` (el existente). Consulta: ve plan, carga, desglose y opciones sin botones de escritura, y los servicios rechazan la escritura aunque se llamen directamente.

## Pruebas
`node tests/planificacion-etapa4-motor.test.js` (motor puro), `node tests/planificacion-etapa4.test.js` (con la página real y una nube falsa), `node tests/planificacion-etapa3.test.js` (actualizada) y `tests/visual/planificacion.html` (datos de prueba para ver configuración, exceso, opciones y semana).
Cubren: cabe/excede; cambio de marca y formato sin duplicar; ventanas superpuestas, limpieza fija y refrigerio sin detención; velocidad faltante, tiempo desconocido, cero explícito, disponible cero; Mañana + Intermedio y Noche cruzando medianoche; producto repetido; colocación entre ventanas; cancelados; bloque iniciado; traslado parcial, destino existente, restricciones, dos usuarios, versión, doble clic y reintento; fallo de guardado (todo o nada); compromiso original e historial; semana coherente con el día; consulta sin escritura; configuración sin parada oficiales.

## Qué no se probó / limitaciones
- Firestore y Supabase reales, ni cuentas reales; las velocidades son las de prueba. La estimación no se contrastó con producción real.
- La validación visual se hizo en el navegador con datos de prueba (escritorio y 375 px); no en un celular físico.
- Las velocidades son nominales: las sugerencias son estimadas y no garantizan fechas.
- El traslado opera sobre la fila elegida: si un producto está repartido entre Día e Intermedio, el máximo es el de esa fila.
- El saldo se calcula en el navegador con el producido oficial (no transaccional con Paletas): ventana corta pero existente.
- Prioridad comercial, pedidos, stock y mantenimiento programado: **Por confirmar** (no hay fuente fiable); no hay compatibilidad de producto entre líneas.
- Los valores de respaldo de la etapa 3 se mantienen; conviene migrar a reglas y ventanas y dejarlos vacíos.

## Instalación / publicación
No hay reglas de Firestore ni migraciones. Para PRUEBAS: `git push origin planificacion-4-tiempos-capacidad:pruebas` (solo cuando lo ordenes). Después de publicar, un Planificador debe cargar reglas de preparación y ventanas en **Planificación → Catálogo → Tiempos previstos**; hasta entonces las líneas con cambios de producto dirán «Estimación incompleta» (salvo que usen el valor general de respaldo).
