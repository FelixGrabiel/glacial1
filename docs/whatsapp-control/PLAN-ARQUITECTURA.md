# GLACIAL · WhatsApp (2 grupos) + AVANCE + control operativo — PLAN DE ARQUITECTURA (sin programar)

Fecha: 2026-10-22 · Base: `PROMPT_GLACIAL_SISTEMA_WHATSAPP_2_GRUPOS_CONTROL_OPERATIVO_COMPLETO.md` (21-oct-2026) + infografía.
Estado: **PROPUESTA. No se ha cambiado código ni base de datos.** Cada afirmación de abajo viene de leer los archivos o consultar Supabase (PRODUCCIÓN, solo lectura).

## 0. AJUSTE DE ALCANCE (2026-10-22) — vigente sobre el resto del documento
Aprobadas las recomendaciones (override B, Chromium con usuario de solo lectura, vínculo por código, tabla de permisos, bot que escribe con número dedicado y límites de ritmo), con este recorte:
- **Por ahora NO se procesan paradas ni reanudaciones** y **ningún mensaje de WhatsApp cambia la página**. Quedan fuera de esta etapa: solicitudes, grupo B de confirmaciones, `wa_solicitudes`, `wa_pausas_linea`, el overlay del semáforo y la migración que los crea. Se retoman en una etapa posterior.
- **Etapa actual: generar por WhatsApp el AVANCE y el CIERRE**, por línea o general, solo lectura:
  `AVANCE` (general), `AVANCE PET1` (una línea), `CIERRE` (general), `CIERRE PET1` (una línea).
- Lo que sí hace falta de la arquitectura: router de mensajes, reconocimiento de comandos, envío de texto + imagen, página en Chromium sin pantalla con usuario de solo lectura, y la identidad/permiso de quien pide (tablas `wa_grupos`, `wa_identidades`, `wa_permisos` de solo lectura de avance).

### Estado de avance (2026-10-22)
- **Hecho y probado en grupos reales**: Fase 0 (envío de texto e imagen, cálculo en Chromium con usuario de solo consulta, identidad por número vía `getContactLidAndPhone`), Fase 1 y 2 (comandos `AVANCE`/`CIERRE`, por línea o general) y Fase 3 en su versión simple: **lista de personas autorizadas por número** (`usuarios-whatsapp.json`, en la PC del bot) en lugar de `VINCULAR`/`wa_identidades`. Activo en GLACIAL CONTROL-OPERATIVO y Pruebas WhatsApp.
- **Cambios respecto a lo aprobado**: la respuesta es **solo la imagen** de la tarjeta de AVANCE/CIERRE (no el reporte por línea), con el resumen recalculado para la línea pedida; el texto queda como respaldo o con `GLACIAL_CMD_MODO=ambos`.
- **Pendiente**: añadir el número al grupo PRODUCCIÓN GLACIAL y activarlo; límite duro de gasto en OpenAI; y, en una etapa posterior, las paradas/reanudaciones con confirmación (secciones 2 a 5 de este documento siguen siendo la propuesta para esa etapa).
- El bot y sus pruebas (113) viven en `C:\Users\felro\Documents\glacial-whatsapp` (fuera de este repositorio).

### Hallazgos de código que fijan el diseño de AVANCE/CIERRE (`js/produccion/29-avance-produccion.js`)
1. **Generar en la página GUARDA**: `avGenerar` llama `avConstruirSnapshot` (cálculo puro) y luego `avGuardarSnapshot` (escribe en `sync/avancesTurno`). El **CIERRE** además es **único por turno** y dispara `sheetsEnviarCierre` (Google Sheets).
2. **WhatsApp debe usar solo el cálculo** (`avConstruirSnapshot`, `avTextoWhatsApp`, `glacialReporteLinea.dibujar`) **sin guardar** y sin Sheets: así AVANCE es solo lectura, como exige el prompt.
3. **CIERRE por WhatsApp** (propuesta): si el cierre del turno YA está guardado, se envía ese (idéntico al de la página, `avUltimoSnapshot('CIERRE')`); si no existe, se envía una **VISTA PREVIA marcada «no oficial, no guardado»** y se indica que el cierre se genera en la página. Nunca crea el cierre ni toca Sheets.
4. **Mismo snapshot para texto e imagen**: se calcula una vez; el texto (`avTextoWhatsApp`) y la imagen (por línea `l.reporte` con `glacialReporteLinea.dibujar`; general con `avCanvasSnapshot`) salen de ese mismo objeto.
5. **Una línea sin producción** no aparece en el AVANCE general (regla `avLineaEnProduccion`); `AVANCE PET1` de una línea sin producción responde «Sin datos de producción registrados para este periodo». El CIERRE conserva su criterio propio.

### Fases (reemplazan a §7 en esta etapa)
- **Fase 0 — pruebas técnicas, sin tocar datos**: (a) el bot envía un texto y una imagen a un grupo de prueba; (b) Chromium sin pantalla abre GLACIAL con un usuario de solo lectura, espera la carga y ejecuta `avConstruirSnapshot` + `avTextoWhatsApp` + `dibujar`; (c) las cifras del resultado coinciden con las de la pantalla Avance y Cierre del mismo momento.
- **Fase 1 — comandos y texto**: router + `AVANCE`, `AVANCE <línea>`, `CIERRE`, `CIERRE <línea>` solo texto, en grupo de prueba.
- **Fase 2 — imagen** del mismo snapshot, con control de errores parciales.
- **Fase 3 — identidad y permisos** (`VINCULAR`, `wa_identidades`, `wa_permisos`) en PRUEBAS; sin identidad verificada no se entrega nada.
- **Fase 4 — endurecimiento y paso a Producción**: límites de ritmo, deduplicación, pruebas, guía.

## 1. Diagnóstico (probado / preparado / pendiente)

### 1.1 Bot de WhatsApp (`C:\Users\felro\Documents\glacial-whatsapp`)
| Pieza | Estado | Evidencia |
|---|---|---|
| Un solo `Client` + `LocalAuth` (`glacial-prueba`), eventos `message`/`message_create` con deduplicación por ID | **Probado** | `bot.js`, `bot-nucleo.js`, 82 pruebas (`npm test`) y uso real |
| Varios grupos autorizados (`grupo-autorizado.json`, bandera `procesar`) | **Probado** | Trazabilidad lee fotos; Control-Operativo y Pruebas en lista con `procesar:false` |
| Fotos → OpenAI v3 → validador → subidor → Edge Function `evidencias-ingesta` → `evidencias_entrada` → Asistente › Evidencias | **Probado de punta a punta en PRODUCCIÓN** (4 evidencias, costo medido US$ 0,0056/foto) | `monitor-imagenes.js`, `procesador-imagenes-v3.js`, `subidor-evidencias.js` |
| Arranque automático (tarea programada) y salud | **Probado** | `npm run salud` |
| **El bot es SOLO LECTURA: no responde ni escribe en grupos** | Regla vigente | `bot-nucleo.js` (regla 6), `GUIA-24-7.md`. **El prompt exige romperla** (ver §6, decisión 1) |
| Reconocimiento de comandos, solicitudes, AVANCE/ESTADO, vínculo WhatsApp↔usuario | **Pendiente (no existe)** | no hay código |
| Grupo «PRODUCCIÓN GLACIAL (GENERAL)» | **Pendiente**: el número aún no está añadido | captura del teléfono (3 grupos) |
| IDs vigentes | Trazabilidad `120363411410514636@g.us`, Control-Operativo `120363413600698331@g.us`, Pruebas `120363430347135933@g.us` (leídos con `listar-grupos.js`) | el ID de Producción se conocerá al añadir el número |

### 1.2 Página GLACIAL y Supabase
1. **La página NO usa Firebase ni tablas relacionales: corre sobre un «puente» que emula Firebase** (`js/nucleo/00b-puente-supabase.js`) con dos tablas, `fs_docs` (documentos) y `fs_items` (listas), y escritura única vía `fs_commit` con control de versión. Datos vivos en PRODUCCIÓN: `sync/programaciones` (290 ítems, v213), `sync/avancesTurno` (584), `sync/users` (16 usuarios), `sync/records` (107), `sync/paletas` (1 685)…
2. **Existe un esquema relacional paralelo** (`g_lineas`, `g_eventos_linea`, `g_solicitudes_cambio`, `g_paradas`… y ~60 funciones `g_*` como `g_estado_linea`) con **0 filas y ninguna referencia desde la página**. No es la fuente de verdad. **Propuesta: no usarlo** (ni como base ni para «reusar»): evita dos verdades.
3. **Estado de línea hoy**: ítem de `sync/programaciones`, campo `estadoOperacion.estado` ∈ `EN_PRODUCCION | DETENIDA | PAUSA | LISTA | PENDIENTE | COMPLETADA | CANCELADA` (`js/produccion/24-semaforo-produccion-actual.js`, `cambiarEstado`, líneas ~2082-2440). Los botones DETENER/PAUSAR/REANUDAR escriben ese estado, registran `op.paradas[]` (origen `BOTON`) y la bitácora `bitacoraMantenimiento`.
4. **La regla «los botones no cuentan para el ratio» YA se cumple en el código**: `js/produccion/23b-tiempos-linea.js` (cabecera) dice que las paradas de los botones son solo historial; las paradas oficiales salen solo de lo que registra el supervisor (`sync/records` y `sync/avancesTurno › paradasOperativas`).
5. **Dos diferencias con el prompt**: (a) el botón REANUDAR de hoy **fuerza `EN_PRODUCCION`** (`op.estado='EN_PRODUCCION'`), y el prompt pide NO forzar `En curso` sin producción real; (b) hoy no existe un «override informativo» separado del estado calculado.
6. **Permisos hoy**: `quienControla(linea)` (semáforo): Administrador / Jefe de Producción / Jefe de Operaciones / Supervisor = `supervisor`; el permiso `control_operativo_lineas` = `control` (puede pausar/reanudar/«intervención terminada», no iniciar/finalizar). La autorización de escritura vive en `glacial_fs.autorizar` (SQL). Los 16 usuarios **no tienen teléfono ni identidad de WhatsApp** en su ficha.
7. **AVANCE**: el texto sale de `avTextoWhatsApp(s)` y la imagen de `window.glacialReporteLinea.dibujar(modelo)` (canvas de 1080 px, `js/produccion/61-reporte-linea.js`), ambos **en el navegador** y sobre el estado global de la página (`29-avance-produccion.js`, 2 172 líneas). El backend no puede llamarlos tal cual.
8. Hallazgo de seguridad menor (no bloquea): 5 tablas de respaldo de `glacial_fs` tienen RLS desactivado (el aviso de Supabase). Verifiqué que `anon` y `authenticated` **no tienen SELECT** sobre ellas, así que hoy no están expuestas; conviene activar RLS cuando se decida (SQL propuesto por el propio aviso, sin aplicar).

## 2. Diagrama de flujo (dos grupos + fotos)

```
 GRUPO A «PRODUCCIÓN»                    BOT (1 cliente)                         SERVIDOR (Edge Function + Postgres)
 ───────────────────                    ───────────────                         ───────────────────────────────────
 foto de insumo ───────────────────────► router ──(foto, grupo con procesar)──► [flujo actual] OpenAI → subidor → bandeja
 «AVANCE PET1» ────────────────────────► router ──comando──────────────────────► wa-comandos(AVANCE): valida grupo/identidad/permiso
                                                                                  → snapshot único → texto + imagen
 ◄──── texto, luego imagen ◄───────────── bot envía ◄─────────────────────────── (lectura, sin confirmación)
 «PET1 se paró por falta de material» ──► router ──intención (reglas)───────────► wa-comandos(SOLICITAR): identidad + permiso solicitar
                                                                                  + dedupe + estado vigente → fila PENDIENTE (2 min)
                                         bot envía a GRUPO B ◄──────────────────── solicitud #4821
 GRUPO B «CONTROL OPERATIVO»
 «CONFIRMAR 4821» ─────────────────────► router ──comando──────────────────────► wa-comandos(CONFIRMAR): grupo B + identidad + permiso
                                                                                  confirmar + vigencia + estado esperado → RPC ATÓMICA:
                                                                                  consume solicitud + aplica pausa informativa + auditoría
 ◄── resultado (ambos grupos) ◄────────── bot envía ◄──────────────────────────── éxito / cancelada / vencida / conflicto
                                                                                  ↓ Realtime → Producción Actual muestra «En pausa (WhatsApp)»
```
Regla de oro: **el bot no lleva llaves de Supabase** (como hoy): habla solo con una Edge Function con secreto; todo permiso se decide en el servidor.

## 3. Archivos

### Bot (carpeta `glacial-whatsapp`)
| Archivo | Acción | Propósito / riesgo |
|---|---|---|
| `bot.js` | editar | Delega todo mensaje en un router; **cambia de solo lectura a poder enviar** (riesgo de baneo del número: ver §6) |
| `bot-nucleo.js` | editar | Se mantiene para fotos; el router decide texto/foto por grupo |
| `whatsapp-router.js` | nuevo | Un solo punto de entrada: grupo → tipo → handler; filtra `fromMe`; dedupe |
| `intenciones-operativas.js` | nuevo (puro, con pruebas) | Reglas deterministas: AVANCE/ESTADO/PARAR/REANUDAR, negaciones, preguntas, histórico, futuro |
| `cliente-comandos.js` | nuevo | Llamadas a la Edge Function (secreto, reintentos seguros) |
| `enviador.js` | nuevo | Envío de texto e imagen con límite de ritmo y manejo de error parcial |
| `grupo-autorizado.json` | editar | Añadir `rol: "produccion" \| "control" \| "evidencias"` por grupo |
| `.env.ejemplo`, `GUIA-24-7.md`, `salud.js`, `tests/*` | editar/nuevos | Variables sin secretos, guía, salud, pruebas |

### GLACIAL (repositorio)
| Archivo | Acción | Propósito / riesgo |
|---|---|---|
| `supabase/migraciones/glacial_34_whatsapp_control.sql` | nuevo | Tablas `wa_*` + RPC atómica (RLS, sin acceso directo) |
| `supabase/functions/whatsapp-comandos/` | nuevo | Edge Function (secreto, JWT off) con la lógica de permisos |
| `js/produccion/24-semaforo-produccion-actual.js` | editar (mínimo) | Superponer «En pausa (reportada por WhatsApp)» sin tocar `estadoOperacion` — **archivo de 2 744 líneas, riesgo medio** |
| pantalla de administración (nueva, en Accesos) | nuevo | Vincular identidades y dar permisos WhatsApp por línea |
| `docs/whatsapp-control/` y `tests/` | nuevo | Documentación y pruebas |

## 4. Esquema propuesto (incremental; reutiliza la forma de `glacial_33`)
Todas en `public`, **RLS activada sin políticas**, sin permisos para `anon`/`authenticated`; solo la función de servidor (service role) las toca; la página lee por RPC con permiso (patrón de `evidencias_entrada_pendientes`).

| Tabla | Para qué |
|---|---|
| `wa_grupos` | IDs de grupo y su rol (`produccion`, `control`, `evidencias`), activo. Nunca se confía en el nombre visible |
| `wa_identidades` | `sender_id` de WhatsApp (`@c.us` y/o `@lid`) ↔ usuario GLACIAL; estado (`pendiente`/`verificada`/`revocada`), quién la verificó, fecha |
| `wa_permisos` | usuario × línea × acción (`solicitar`, `confirmar`, `leer_avance`, `leer_estado`), vigencia |
| `wa_solicitudes` | `id` uuid, `codigo` corto, línea, operación (`PAUSAR`/`REANUDAR`), `version_esperada`, estado `PENDIENTE|CONFIRMADA|CANCELADA|VENCIDA|CONFLICTO`, `expira_en` (2 min, hora del servidor), solicitante, confirmante, ids de chat/mensaje, motivo. Índice único parcial: una `PENDIENTE` por (línea, operación) |
| `wa_pausas_linea` | override informativo vigente por línea: `activa`, `version`, desde, origen, solicitud |
| `wa_auditoria` | evento inmutable: antes/después, solicitante, confirmante, grupo, resultado |
| `wa_mensajes` | idempotencia: ID de mensaje procesado (único) |

**Transiciones**: `PENDIENTE → CONFIRMADA | CANCELADA | VENCIDA | CONFLICTO`; ninguna sale de un estado final. **Confirmar** = una sola transacción con bloqueo de fila: comprueba vigencia (`now() < expira_en`), `PENDIENTE`, grupo B, permiso del confirmante para esa línea y `version_esperada`; si algo falló, no cambia nada. Doble confirmación o dos aprobadores a la vez → uno gana por el bloqueo; el otro recibe «ya resuelta».

**REANUDAR**: quita el override y **recalcula** con las reglas actuales de la página; no fuerza `En curso`. **PARAR/REANUDAR nunca escriben** en paradas de Avance/Cierre, `records`, ratio, mermas ni insumos.

## 5. Pruebas y reversión
- Las 24 pruebas de aceptación del prompt se convierten en pruebas automatizadas (núcleo de intenciones con ~60 frases, función con base simulada, RPC con transacciones concurrentes) y una lista de pruebas manuales con dos grupos de prueba.
- Todo se desarrolla y prueba primero en **Supabase PRUEBAS** y con grupos de prueba; el `.env` del bot se cambia de proyecto con una sola línea.
- **Reversión**: cada migración trae su script inverso (solo borra tablas/funciones `wa_*`); el bot vuelve a solo-lectura quitando el router (la copia de seguridad actual está en `respaldo-multigrupo-2026-10-21/`); el overlay del semáforo se apaga con una bandera de configuración.

## 6. Decisiones y bloqueos reales (necesito tu respuesta antes de programar)
1. **Romper el «solo lectura»**: para responder y avisar el bot debe ESCRIBIR en los grupos. `whatsapp-web.js` no es oficial; enviar mensajes aumenta el riesgo de que WhatsApp limite o banee el número (ya hay `npm audit` con 9 altas). ¿Se acepta con un número dedicado y límites de ritmo, o se prefiere la API oficial (Cloud API) más adelante?
2. **Pausa informativa**: (A) usar el mismo `estadoOperacion` que los botones, o (B) un override aparte (`wa_pausas_linea`) superpuesto en el semáforo. **Recomiendo B**: el prompt lo pide en §7, el botón REANUDAR actual fuerza `En curso`, y escribir desde el servidor dentro de `sync/programaciones` (290 ítems que la página reescribe) arriesga pisar cambios.
3. **Imagen de AVANCE idéntica a la página**: la forma más fiel es **Chromium sin pantalla** (ya instalado por `whatsapp-web.js`) abriendo la página con un usuario de solo lectura y llamando las mismas funciones. Implica guardar ese usuario en el `.env` de la PC. Alternativa: reescribir el cálculo en Node (más trabajo y riesgo de cifras distintas). ¿Se acepta el usuario de solo lectura?
4. **Vínculo WhatsApp ↔ usuario** (hoy no existe): propongo que el administrador genere en la página un código de un solo uso por usuario y esa persona escriba `VINCULAR <código>` en el grupo; el bot captura su ID (`@lid`/`@c.us`) y el administrador lo verifica. ¿De acuerdo, o prefieres cargar los números a mano?
5. **Permisos**: ¿una tabla explícita `wa_permisos` (usuario × línea × acción, administrada en la página) o derivarlos de los roles actuales (`quienControla`)? **Recomiendo la tabla explícita** (mínimo privilegio, sin duplicar la lógica de roles en SQL).
6. **Grupos**: falta añadir el número al grupo PRODUCCIÓN GLACIAL. Para probar sin riesgo necesitamos **dos grupos de prueba** (A y B); hoy solo existe «Pruebas WhatsApp». El grupo Trazabilidad **sigue solo con fotos** como ahora.
7. **Alcance de «leer palabras clave»**: confirma que, fuera de los comandos del prompt, los demás mensajes de texto no se guardan ni se interpretan.

## 7. Fases propuestas (cada una con pruebas y aprobación)
0. **Pruebas técnicas** (sin tocar producción): envío de mensajes desde el bot, dibujar el reporte con Chromium, lectura del estado de línea.
1. Router + `ESTADO` + `AVANCE` (solo texto) en grupo de prueba.
2. `AVANCE` con imagen del mismo snapshot.
3. Migración `glacial_34` + función de servidor + identidades y permisos (PRUEBAS).
4. Solicitud → confirmación → pausa informativa + overlay del semáforo + Realtime.
5. Endurecimiento, las 24 pruebas, revisión de dependencias, guía y paso a PRODUCCIÓN.
