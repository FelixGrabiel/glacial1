# Planificación · etapa 5 (Completar cantidad, Todo el turno, cálculo parcial y Estado del plan)

Rama `planificacion-5-completar-todo-turno` (desde `main`). **No se publicó nada.** Las cantidades de las capturas son solo referencia: no se cargaron como datos.

## Qué ya existía y qué se agregó
La etapa 4 ya tenía el motor de capacidad (ventanas, preparaciones, colocación), «Ver opciones para completar» y la vista semanal. Esta etapa **no duplica** nada de eso: lo reutiliza.

| Archivo | Cambio |
|---|---|
| `js/produccion/66-planificacion-modos.js` (nuevo) | Modos, cierre confirmado, saldo de la meta, estimación de «Todo el turno», estado del plan y la sección «modo» del formulario. |
| `js/produccion/16-paletas.js` | El escritor único acepta `opc.extra` (modo, meta, estimado, alcance), `opc.validarLista` (se ejecuta **dentro de la transacción** con las filas más recientes) y `opc.historialExtra`. |
| `js/produccion/52-planificacion-pantalla.js` | Selector de modo, columna **Estado del plan**, subtítulos de meta/estimado, tarjetas «Metas entre bloques» y «Todo el turno». |
| `js/produccion/65b`, `65` | Cálculo parcial: `conocidoMin`, `excesoMinimoMin`, texto «Cálculo parcial: falta configurar cambio de marca», botón «Configurar tiempo de cambio». |
| `js/produccion/51`, `64` | La copia no reutiliza cierres ni estimaciones; texto del plan y Excel con modo, meta y estados separados. |
| `js/produccion/65c`, `65d` | Rótulo «Cálculo parcial» (antes «Estimación incompleta»). |

## Datos (sin migración ni reglas nuevas)
En la misma fila de `sync/programaciones` (los campos nuevos son opcionales; una fila sin `modo` es **Cantidad fija**):
- `modo`: `FIJA` | `COMPLETAR` | `TURNO`.
- `meta` (Completar): `{id, total, referencia, vinculos:[{id, cierre:'línea|fecha|bloque|marca|presentación', fecha, bloque, producido, asignado, cierreActualizadoEn, por, en}]}`. El destino guarda **el saldo** en `cantidadProgramada`, no la meta.
- `estimado` y `alcance` (Todo el turno): `{cantidad, ratio, tiempoProdMin, duracionMin, ventanasMin, preparacionMin, otrosMin, parametrosVersion, calculadoEn, por}` y `TODO_TURNO | TIEMPO_RESTANTE`.
- Historial (`historialProgramacion`): `referencia` con el texto de la operación y los campos `modo`, `meta`, `alcance`; autor, UID y hora del servidor como siempre.

## Cómo se calcula
- **Cierre confirmado:** registros del supervisor del bloque con `estadoRegistro = FINALIZADO`, deduplicados por id (Mañana + Intermedio es un bloque: se cuenta una vez), solo del mismo producto (línea, marca y presentación normalizadas). Sin cierre o sin finalizar → **«Pendiente de cierre»** (no se asume cero). Un cierre válido con 0 se distingue del ausente. Si un cuadro con producción no dice marca y presentación → «no permite identificar el producto» y no se inventa la cantidad.
- **Saldo:** `máx(0, meta − Σ asignado)`; cada cierre cuenta **una vez por meta**. Una tercera fila continúa la misma meta (hereda los vínculos de la fila de referencia): no se olvida lo producido antes. Lo asignado de un cierre a distintas metas no puede exceder lo producido (se valida en pantalla **y** dentro de la transacción).
- **Todo el turno:** `tiempo productivo = duración − unión de ventanas − preparaciones (− otros productos si es «tiempo restante»)`; `cantidad = ⌊tiempo ÷ 60 × ratio nominal⌋`. Usa el motor de la etapa 4 (una sola fuente). Falta ratio → pendiente; faltan otros datos → **parcial** (se dice cuáles, se muestra una cota informativa que **no** se guarda). Con otra marca en la línea: conflicto explicado y opción «Producir durante el tiempo restante» (descuenta cantidades fijas, cambios y ventanas; sin tiempo → 0, nunca negativo).
- **Estado del plan:** `Completada` (verde) = producción confirmada ≥ cantidad del bloque; el estado operativo de la línea se muestra aparte («Línea: En pausa»). Sin registro no hay `Completada`. Finalizada con saldo se dice explícitamente. **Todo el turno nunca se completa por alcanzar el estimado**: sigue vigente hasta la finalización confirmada. Completar cantidad muestra el cumplimiento del bloque y, aparte, el de la **meta global**.
- **Cálculo parcial de capacidad:** el desglose conocido se conserva; el requerido se muestra como «≥ conocido»; si lo conocido ya excede el bloque se indica el **exceso mínimo comprobado**; nunca se concluye «Cabe» sin los datos.

## Separación y protecciones
- No se crean paradas oficiales, no se toca el ratio real ni se finaliza/reanuda una línea (hay una prueba que lo comprueba en el código).
- Guardado protegido contra doble clic/reintento (misma fila en curso), con versión (`versionEsperada`) y revalidación de cierre, producción, asignaciones y versión al confirmar. No se reduce una cantidad por debajo de lo ya producido. Meta completada → no se crea una orden de cantidad cero.
- Un cierre corregido después de aplicar el saldo genera un **aviso con el valor anterior y el actual** en la fila (propuesta de revisión con «Editar»); nunca se sobrescribe solo.
- Copiar a otra fecha **no copia** Completar cantidad ni Todo el turno (hay que revisar la referencia y volver a aplicar). La importación por Excel sigue creando solo Cantidad fija.
- Permisos: el mismo `planificacion` de siempre; consulta no ve botones de escritura y el servicio rechaza la escritura aunque se llame directamente.

## Pruebas
`node tests/planificacion-modos.test.js` (63 comprobaciones con la página real y una nube falsa) y las de las etapas 1–4 (actualizadas: «Cálculo parcial»). Cubren los casos del prompt: meta 24,000 con cierre 18,000; cierre ausente/pendiente/cero/corregido; otro producto; Mañana+Intermedio una vez; fecha operativa de Noche; meta completada; tres bloques y mismo cierre sin duplicar; doble clic y asignación simultánea; dos marcas completas; cambio y velocidad faltantes; exceso mínimo; secuencia repetida y canceladas; Todo el turno (nominal × tiempo, conflicto, tiempo restante, supera el estimado); Completada vs pausa; datos ausentes; copia/exportación; paradas oficiales sin cambios.

## Limitaciones
- **No se probó** con Firestore/Supabase reales ni con registros reales; las velocidades de prueba son inventadas.
- Los tiempos explícitos por producto en «Todo el turno» **no están**: se ofrece «tiempo restante».
- «Todo el turno» guarda la cifra estimada en `cantidadProgramada` (el sistema descarta las filas de cantidad 0 y los demás módulos la leen): se rotula «estimada», pero Producción Actual, Cumplimiento y la vista semanal la siguen mostrando como cantidad del bloque.
- La vista semanal y Cumplimiento no distinguen todavía el modo (solo usan la cantidad); «Cumplimiento» no usa la meta global.
- El cierre confirmado es el registro del supervisor FINALIZADO; no se usa el snapshot CIERRE de Avance/Cierre.
- No se validó en un celular físico: la captura de pantalla del navegador de pruebas falló por tiempo; el diálogo y la tabla se comprobaron por DOM.

## Instalación / publicación
No hay reglas ni migraciones. Para PRUEBAS, cuando lo ordenes: `git push origin planificacion-5-completar-todo-turno:pruebas`. No se publicó ni se desplegó nada.
