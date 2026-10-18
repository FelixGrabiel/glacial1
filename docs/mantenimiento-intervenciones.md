# Mantenimiento · intervenciones, evidencias, preventivos y equipos

Rama `mantenimiento-1-intervenciones` (desde `main`). No se publicó nada ni se tocó la base de datos.

## Qué existía y qué se agregó
| Existía (se reutilizó) | No existía (se creó) |
|---|---|
| Controles Detener / Pausar / Intervenir / Reanudar (24) y la bitácora operativa (43): **no se modificaron** (en 43 solo se agregó el botón «Abrir/Ver intervención» en cada parada) | Intervenciones (órdenes de trabajo) con cierre trazable |
| Equipo como **texto** en las paradas por «Falla de máquina» (37c) | Catálogo de equipos con ID estable (37d) |
| Identificación del técnico por PIN en la cuenta compartida (37b: `mantTecnicoActivo`) | Evidencias fotográficas |
| Centro de avisos (46), permisos, modo visualización (23b) | Planes preventivos, ejecuciones y avisos de Mantenimiento |
| MTTR/MTBF **por línea** (47: «Análisis de paradas») — no se tocó | MTTR/MTBF **por equipo**, solo con datos suficientes |

## Archivos
| Archivo | Qué hace |
|---|---|
| `js/mantenimiento/37d-equipos-maestro.js` | Catálogo de equipos (id, código, nombre, línea/ubicación, compartidoCon, tipo, activo, datos técnicos). Vive en `sync/configMantenimiento → equiposMaestro` (sin regla nueva). 37c ofrece a Producción los nombres del catálogo cuando la línea tiene equipos. |
| `67-intervenciones-motor.js` | Motor **puro**: estados, transiciones, cierre, repuestos, seguimiento, evidencias, tareas, correcciones, tiempos. |
| `67b-intervenciones-datos.js` | Persistencia por **transacción** (versión + historial), permisos, lectura en vivo, apertura sin duplicados. |
| `67c-intervenciones-pantalla.js` | Pantalla (móvil primero): Intervenciones · Preventivos · Equipos · Indicadores. |
| `67d-intervenciones-evidencias.js` | Fotos: compresión, subida a **Supabase Storage (privado)**, cola con reintento, consulta por equipo, regla de obligatoriedad por tipo. |
| `67e-preventivos.js` | Planes preventivos, ejecuciones, reprogramación, avisos y contrato para Planificación. |
| `67f-indicadores-equipo.js` | MTTR y MTBF por equipo. |
| `firestore.rules.etapa2.txt` | Reglas nuevas de Firestore (**hay que publicarlas**). Las fotos van a Supabase Storage (bucket privado): reglas en `supabase/migraciones/glacial_25_fotos_privadas.sql` (ver `docs/FOTOS-SUPABASE.md`). |
| `docs/supabase-mantenimiento.sql` | Reglas equivalentes de Supabase, **preparadas y sin aplicar**. |

## Intervenciones
- **Estados** (propios; no son el estado operativo de la línea): Pendiente · En intervención · En espera (con motivo: repuesto, autorización, acceso u otro) · Cerrada · Cancelada (con motivo). Los colores de estado y de resultado son distintos de los de Producción.
- **Apertura**: desde una línea detenida sin intervención (panel en la pantalla), desde la bitácora (botón en cada parada) o manual. El id sale del origen (`o_{parada}`), así que dos dispositivos, un doble clic o un reintento obtienen **la misma** intervención; otra intervención en **otro equipo** del mismo origen es legítima. Abrir **no cambia** el estado de la línea.
- **Equipo por identificar**: se puede abrir sin equipo (emergencia). Para cerrar un correctivo hay que indicar el equipo **o justificar** por qué no se pudo identificar. El texto de Producción solo se vincula si coincide **exactamente** con un equipo del catálogo; nunca se infiere por palabras. Lo histórico sin equipo queda «Sin equipo identificado».
- **Cierre** («Cerrar intervención»): equipo, diagnóstico, acción realizada, repuestos o «No se utilizaron», resultado (operativo verificado / con observación / **no operativo, requiere seguimiento**), pendientes (obligatorios si no es «operativo verificado»), fin real, responsable y participantes. «No operativo» se muestra como **no exitoso** y con sus pendientes visibles. **Cerrar no reanuda la línea y reanudar no cierra la intervención** (acciones distintas).
- **Repuestos/materiales**: código o descripción, cantidad, unidad, observación, autor y fecha. Solo lo **utilizado**: no hay stock ni costos. Integración pendiente con Almacén (no hay stock fiable).
- **Concurrencia**: cada acción es una transacción sobre lo último guardado (no se sobrescribe la intervención completa); doble cierre → una sola transición y mensaje claro al segundo; el historial solo crece (una entrada por acción).
- **Autor**: se guarda el **técnico identificado** (PIN) y, aparte, el uid de la cuenta. Limitación conocida: el servidor no valida el PIN; el nombre es trazabilidad, no identidad garantizada.
- **Correcciones** de una intervención cerrada: solo Supervisor de Mantenimiento/Administrador, con motivo, conservando lo anterior. **Verificación** del supervisor: opcional (no se espera aprobación).
- Nada de esto crea paradas oficiales, toca Avance/Cierre ni el ratio (las pruebas lo comprueban).

## Evidencias fotográficas
- Foto o galería, a **problema**, **trabajo** o **cierre**, con descripción; miniaturas y vista completa. Máximo 12 por intervención.
- **Compresión** en el dispositivo (lado máximo 1600 px, JPEG ≈1,2 MB; miniatura 320 px); se valida formato (JPG/PNG/WebP) y tamaño (15 MB) antes.
- **Orden seguro**: primero se sube el archivo y **solo después** se registra la referencia. Nunca queda una referencia a un archivo inexistente. El texto de la intervención no depende de la foto: «Registro guardado» ≠ «Foto pendiente de subir».
- **Reintento sin duplicados**: id fijo por foto (misma ruta); lo pendiente se guarda en el dispositivo (IndexedDB) y se reanuda solo; si el archivo ya subió pero el registro falló, se reintenta **solo el registro**.
- **Sin base64 en la base de datos** y **sin enlaces públicos permanentes**: se leen con el SDK autenticado. Obligatoriedad: ninguna por defecto; el supervisor puede exigir foto al cerrar **por tipo de trabajo**.
- **Almacenamiento: Supabase Storage** (bucket privado `glacial-fotos`, carpeta `mantenimiento/<intervención>/`; desde la Fase 4 ya no se usa Cloudinary). En la base solo se guarda la **referencia** `supabase:glacial-fotos/<ruta>`; la imagen se muestra con un enlace firmado que caduca (1 hora). La cuenta compartida de Mantenimiento puede subir y ver únicamente `mantenimiento/`.
- **Seguridad:** el bucket es privado y solo usuarios con sesión obtienen enlaces firmados. Las reglas no permiten actualizar ni borrar desde la página.

## Preventivos
- Plan: equipo, título, descripción, **frecuencia de calendario** (cada N días/semanas/meses), próxima fecha, **política de próxima fecha** (visible), responsable o grupo, ventana prevista, tareas, activo, versión. **No hay frecuencias por horas o ciclos**: no existe un contador fiable y no se deducen del tiempo que la página estuvo abierta.
- Política: **Calendario** (fecha programada + frecuencia; si se atrasó salta a la primera fecha futura y anota los ciclos omitidos) o **Ejecución real** (fecha en que se hizo + frecuencia).
- **Ejecución** = intervención preventiva con id determinista `p_{plan}_{fecha}` (sin duplicados entre dispositivos). Copia las tareas **y la versión** del plan al iniciar; cambiar el plan después **no reescribe** ejecuciones anteriores. Una tarea solo pasa a realizada/no realizada (con motivo) cuando una persona la marca. Al **cerrar**, la intervención y el plan avanzan en **una sola transacción** (próxima fecha, última ejecución).
- **Reprogramar** conserva fecha original, anterior, nueva, motivo y autor; el atraso original se sigue mostrando y contando. No se reprograma con una ejecución en curso.
- Estados de consulta: Próximo · Pendiente (hoy) · Vencido · En ejecución · Completado (al día) · Programado · Inactivo (+ «reprogramado con atraso original»).

## Avisos internos (centro de avisos de 46)
Preventivo próximo / de hoy / vencido, intervención en espera (≥ 30 min; rojo desde 8 h) y seguimiento pendiente. Destinatarios **solo con datos reales**: el supervisor/Administrador; la cuenta compartida cuando el plan es del grupo Mantenimiento o el técnico **identificado** es el responsable (o participante de la intervención). Producción y jefatura no los reciben. **No hay WhatsApp/SMS ni «técnico de turno» inventado.** El aviso cambia de identidad cuando cambia el estado (reaparece aunque se haya marcado «visto»).

## Contrato para Planificación (NO conectado)
`glacialPreventivos.ventanasPrevistas(desde, hasta)` devuelve `[{planId, equipoId, linea, fecha, inicio, fin, titulo, estado:'PROPUESTA', origen:'PLAN_PREVENTIVO', confirmada:false}]`. Son **propuestas**: nunca una parada real ni una ventana confirmada. Planificación (65a) **todavía no las consume** y Mantenimiento no escribe en Planificación. Cuando se conecte: una ventana confirmada deberá crearse en Planificación como ventana (65a) y marcarse en el plan (para no registrarla ni descontarla dos veces), y los conflictos con producción se mostrarán para revisar sin cancelar ni mover producción.

## Indicadores por equipo
Cada número lleva **período, casos y fórmula** (panel «¿Cómo se calculan?»).
- **MTTR** = promedio de (fin real − inicio real − espera) de fallas correctivas **cerradas**, con equipo identificado e inicio/fin reales, resultado distinto de «No operativo». **No** usa apertura → cierre. Espera, respuesta y tiempo administrativo se informan aparte. Preventivos, canceladas y abiertas no entran; los casos excluidos se identifican con su motivo. La **indisponibilidad** de la línea es otra medida (paradas oficiales) y no se mezcla.
- **MTBF** = horas de **línea en marcha** ÷ fallas del equipo, solo en días con horas medidas (cobertura visible). Es un **sustituto** de las horas de máquina (no hay contador por equipo): no son horas calendario ni programadas. Varios avisos/intervenciones de la misma falla (misma parada y mismo equipo) cuentan **una** vez. Equipo compartido entre líneas: no se calcula. Sin horas medidas → «Datos insuficientes» y qué falta. Sin fallas → «Sin fallas en el período» (nunca 0 ni infinito).
- Lo **sin equipo identificado** se conserva aparte y no entra en métricas de un equipo. Las métricas por línea siguen en Análisis de paradas.
- **Dependencia**: la exposición sale de `glacialAnalisisParadas.listarUnidades` (programaciones con inicio real); sin ellas el MTBF dice «Datos insuficientes».

## Permisos y reglas
- **Ver**: cuenta compartida, Administrador, jefatura/gerencia (consulta), supervisores y quien tenga permisos de Mantenimiento. **Escribir**: cuenta compartida (con técnico identificado) y Supervisor de Mantenimiento/Administrador; **nunca** Jefatura/Gerencia ni cuentas de solo consulta (el servicio lo rechaza aunque se llame directo). No se cambiaron permisos de Producción, Planificación ni Tareo.
- **Firestore** (`firestore.rules.etapa2.txt`): `intervenciones` (versión + 1, +1 entrada de historial, uid y hora del servidor, campos de origen inmutables, canceladas inmutables, cerradas solo seguimiento/evidencias o corrección de supervisor) y `planesPreventivos` (el supervisor define; la cuenta compartida solo avanza el ciclo). Las reglas validan **quién** y la forma del cambio, no cada texto.
- **Supabase**: `docs/supabase-mantenimiento.sql` (preparado, sin aplicar).

## Instalación / publicación (nada se hace solo)
1. Publicar `firestore.rules.etapa2.txt` (reglas nuevas: `intervenciones`, `planesPreventivos`).
2. En el proyecto de Supabase debe estar aplicada `glacial_25_fotos_privadas.sql` (bucket `glacial-fotos` y sus 2 reglas).
3. Cargar el catálogo en **Mantenimiento → Intervenciones → Equipos** (el Supervisor) y los planes en **Preventivos**.
4. Subir a PRUEBAS cuando lo ordenes: `git push origin mantenimiento-1-intervenciones:pruebas`.

## Pruebas
`tests/mantenimiento-intervenciones.test.js`, `mantenimiento-equipos-maestro.test.js`, `mantenimiento-evidencias.test.js`, `mantenimiento-preventivos.test.js`, `mantenimiento-indicadores.test.js` y la página `tests/visual/mantenimiento.html` (datos de prueba; `?u=ana|luis|sup|jefe` para ver cada persona). Cubren: apertura sin duplicados; equipo pendiente y cierre justificado; cierre completo; no operativo con seguimiento; cierre sin reanudar; dos técnicos con la misma cuenta; ediciones concurrentes, doble cierre y permisos; foto fallida, reintento y texto conservado; consulta sin escritura; preventivo vencido, ejecución única, tareas y reprogramación; plan cambiado sin reescribir ejecuciones; MTTR con espera separada y excluidos; MTBF «Datos insuficientes»; avisos de una misma falla sin duplicar; históricos sin equipo; ningún cambio en paradas oficiales, ratio o programación.

## Qué no se probó / limitaciones
- Firebase real (reglas, cuentas), Supabase Storage real: las pruebas usan un almacén de archivos falso; la compresión de imágenes y la cámara del celular solo se validaron en su lógica (no con un teléfono físico).
- El servidor no valida el PIN (cuenta compartida) ni el contenido de cada texto.
- Pendientes que dependen de datos inexistentes: stock de repuestos (Almacén), contador de horas por equipo, integración con Planificación, fotos protegidas con firma (servidor).
- «Indisponibilidad» de línea por falla no se calcula aquí.
