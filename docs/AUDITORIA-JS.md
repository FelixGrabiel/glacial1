# Auditoría de js/ — duplicados, solapamientos y código sin uso

Estado: **PARTE 1 de 2** (secciones 1 a 4). La Parte 2 (secciones 5 a 8 y resumen final) se entrega después de tu «continúa».

Alcance y método
- Solo análisis: no se modificó ningún archivo de la app. Este informe es el único archivo nuevo (`docs/AUDITORIA-JS.md`).
- Se revisaron los 52 archivos de `js/` (51 cargados por `index.html` + `js/nucleo/00-logo.js`, que **no** se carga) y `index.html` (3 360 líneas).
- Los datos de inventario (líneas, orden de carga, escuchas, funciones reasignadas) se sacaron con scripts sobre el código; los textos de propósito vienen de la cabecera de cada archivo.
- Cada hallazgo lleva `archivo:línea`. Los números de línea corresponden al commit actual (`96e2c74`). Lo que no pude comprobar con certeza está marcado **por confirmar**.
- Convención de orden de carga: el número de la tabla 1 es la posición real en `index.html` (el archivo `12-init.js` va al final; `39-vista-como.js` justo antes). Ojo: los nombres de archivo **no** siguen el orden de carga (por ejemplo `15-` carga antes que `16-`, y `14-` carga después de `19-`).

---

## 1. INVENTARIO

Leyenda de Firestore: **L** = lee una vez, **E** = escribe, **T** = transacción, «caché» = lee de la copia en memoria que llenan las escuchas de `02-estado.js`. «Escuchas» = `onSnapshot` que el archivo abre.

### 1.1 Archivos de `js/`

| Orden | Archivo | Carpeta | Líneas | Para qué sirve | Pantallas / menú que dibuja | Firestore que lee y escribe | Escuchas en vivo |
|---|---|---|---|---|---|---|---|
| 1 | `01-config.js` | nucleo | 927 | Config de Firebase (`db`, `auth`, `storage`), lista de líneas `LINES` (`:218`), marcas, ratios nominales por presentación (`:404`), mermas, catálogos de motivos de parada (`:751`, `:803`, `:879`), precios por defecto (`:912`) | Ninguna | Solo inicializa (`:169`, `:212`); no lee ni escribe | — |
| 2 | `02-estado.js` | nucleo | 1 651 | Estado global `state`, catálogo de permisos (`:128`, `:209`), cachés y guardado de todos los documentos `sync/*` | Ninguna (alimenta a todas) | `sync/users` (L `:1286`, E `:1316`, T `:1346`), `records`, `workers`, `rotaciones`, `rotacionesMantenimiento`, `rotacionMaquinistas`, `tareos`, `precios`, `paletas`, `programaciones` (E con `set` del arreglo completo `{items,updatedAt}`, `:1390–:1594`) | **10** (`:507–:872`): users, records, workers, rotaciones*, rotacionesMantenimiento, rotacionMaquinistas, tareos, precios*, paletas, programaciones (*vía `_escuchaRestringida` `:452`) |
| 3 | `03-auth.js` | accesos | 624 | Sesión, login/logout, selector Agua/Hielo | Login, selector de reporte | Auth (`onAuthStateChanged` `:374`) | 1 (Auth) |
| 4 | `04-sidebar.js` | nucleo | 604 | Menú lateral y funciones `go*` | Menú: Inicio, Producción actual, Avance, Tareo, Rotación sup., Mantenimiento, RRHH, Resumen, Impacto, Usuarios, Trabajadores | — | — |
| 5 | `05-utils.js` | nucleo | 1 658 | Utilidades de fechas, turnos, lotes, códigos; `normalizarCausaParada` (`:1587`), `calcularHorasTurno` (`:178`) | Ninguna | — | — |
| 6 | `06-registro.js` | produccion | 7 550 | Formulario «Nuevo registro» (4 cuadros), cálculos `calcDerived*` (`:45–:199`), guardado, y el despachador `renderMain` (`:2135`) | Nuevo registro; despacha todas las pestañas (`:2230–:2516`) | `saveRecords` (3 llamadas), `saveDraft` | — |
| 7 | `07-historial.js` | produccion | 1 191 | Historial de registros por línea | Historial | caché `records` | — |
| 8 | `08-graficos.js` | produccion | 5 854 | Pestaña Gráficos, cascada OEE (`:266`), Pareto, mermas, Excel por línea, imagen JPG, `METAS` (`:16`), helpers Excel (`:894–:1029`) | Gráficos | caché `records` | — |
| 9 | `09-resumen.js` | produccion | 4 380 | Resumen general (`renderResumen` `:2528`), tarjetas, bloque industrial (`:2403–:2526`), paneles por presentación/marca | Resumen / Reportes | caché `records`, `programaciones`, `paletas` | — |
| 10 | `10-usuarios.js` | accesos | 1 868 | Gestión de usuarios y permisos | Modal Usuarios | `sync/users` vía `saveUsers` | — |
| 11 | `11-trabajadores.js` | personal | 820 | Gestión de trabajadores | Modal Trabajadores | `sync/workers` vía `saveWorkers` | — |
| 12 | `15-perdidas-soles.js` | produccion | 1 306 | Impacto económico **anterior** (paradas × precio por línea, categorías por texto) | Impacto Económico (versión anterior) | `sync/precios` vía `savePrecios` | — |
| 13 | `22-impacto-para-pegar.js` | produccion | 339 | Parche sobre el 15: línea B10L, unidades, tablas extra | Parte de Impacto Económico anterior | — | — |
| 14 | `16-paletas.js` | produccion | 4 045 | Paletas y programación (alta de programación, paletas, turnos) y base de «Producción actual» | Paletas; contenedor de Producción actual (`:3379`) | `sync/programaciones` (T `:400`, `:568`, `:593`, `:1264`), `sync/paletas` (T `:1226`, `:1557`, `:3953`) | — |
| 15 | `17-modo-trabajo.js` | accesos | 1 049 | Modo visualizar/trabajar, cronómetro de turno, autoguardado de borrador | Barra de modo | `sync/borradoresNuevoRegistro` (E `:674`, `:688`) | 1 (`:606`, restringida) |
| 16 | `18-mantenimiento.js` | mantenimiento | 67 | Punto de entrada del módulo Mantenimiento | Mantenimiento | — | — |
| 17 | `19-rrhh.js` | rrhh | 61 | Punto de entrada del Tareo para RRHH | RRHH | — | — |
| 18 | `14-exportar-general.js` | produccion | 1 741 | Excel general de planta (8 hojas) | Botón «Exportar Excel general» del Resumen | caché `records` | — |
| 19 | `13-tareo.js` | personal | 10 530 | Tareo completo (Producción, Mantenimiento, General), cálculo de horas/extras/tardanza (`:2159–:2240`), rotación, resúmenes | Tareo (todas las pestañas) | `sync/tareos` (T `:1013`, `:4240`) + `saveTareos` | — (usa la caché de 02) |
| 20 | `20-tareo-control.js` | personal | 296 | Control quincenal y consulta de auditoría | Pestañas de control en Tareo/RRHH | `auditoriaTareos` (lectura por escucha) | 1 (`:199–:201`) |
| 21 | `21-programacion-turno.js` | produccion | 227 | Tarjeta de programación en Nuevo registro y Paletas | Tarjeta en Nuevo registro / Paletas | caché `programaciones` | — |
| 22 | `23-gerente-solo-lecutra.js` | accesos | 84 | Modo consulta de jefatura/gerencia, bloquea guardados | Ajusta menús/permisos | Envuelve los `save*` (`:69–:80`) | — |
| 23 | `23b-tiempos-linea.js` | produccion | 555 | **Motor central** de tiempos, paradas, ratios y proyección (`calcularTiemposLinea`, `calcularRatiosLinea` `:426`, `proyectarCierreLinea` `:485`) | Ninguna | `sync/avancesTurno` (escucha) | 1 (`:123`, abierta al cargar la primera vez) |
| 24 | `24-semaforo-produccion-actual.js` | produccion | 2 268 | Producción actual (semáforo), botones INICIAR/DETENER/PAUSAR/FINALIZAR…, resumen ejecutivo (`:2189`) | Producción Actual | T `sync/programaciones` (`:1557`, `:1655`, `:1828`) + **crea** `bitacoraMantenimiento` (`:1608`, `:1653`, `:1826`) | — |
| 25 | `25-alertas-lineas.js` | produccion | 680 | Centro de alertas (campana) + historial diario | Campana de alertas | caché `programaciones` (`historialAlertas`) | — |
| 26 | `26-rrhh-panel.js` | rrhh | 215 | Inicio de RRHH: pendientes del tareo | Inicio RRHH | caché `tareos` | — |
| 27 | `27-rrhh-excel-operativo.js` | rrhh | 169 | Excel de tareo con personal operativo | Botón de Excel en RRHH | caché `tareos` | — |
| 28 | `28-tareo-maquinistas.js` | personal | 406 | Maquinistas: Producción es la fuente, Mantenimiento ve espejo | Pestañas de Tareo | vía 13 | — |
| 29 | `29-avance-produccion.js` | produccion | 1 543 | Avance y Cierre de turno, snapshots, modal de paradas | Avance y Cierre | `sync/avancesTurno` (L `:215`, T `:367`, `:877`), `sync/records` (L `:215`, T `:364`) | 1 (`:960`, solo con la pantalla abierta) |
| 30 | `30-rotacion-mantenimiento.js` | mantenimiento | 567 | Rotación semanal de Mantenimiento | Pestaña del Tareo Mtto | `sync/rotacionesMantenimiento` vía `save*` | — |
| 31 | `33-rotacion-maquinistas.js` | mantenimiento | 319 | Rotación semanal de maquinistas | Pestaña «Rotación maquinista» | `sync/rotacionMaquinistas` vía `save*` | — |
| 32 | `31-rotacion-supervisores.js` | personal | 529 | Rotación semanal de supervisores | Rotación de supervisores | `sync/rotaciones` (tipo SUPERVISORES) | — |
| 33 | `32-dashboard-perfiles.js` | accesos | 975 | Inicio / Mi turno (centro de perfil) | Inicio | L `sync/avancesTurno` (`:385`) | — |
| 34 | `35-autollenado-registro.js` | produccion | 446 | Autollenado del Nuevo registro desde Paletas y paradas | Dentro de Nuevo registro | caché | — |
| 35 | `34-integraciones.js` | nucleo | 264 | Google Sheets y WhatsApp (mensajes de cierre y de tareo) | Botones «Enviar por WhatsApp» | Externo: Apps Script (`SHEETS_URL`) | — |
| 36 | `36-seguridad-auth.js` | accesos | 594 | Firebase Authentication etapa 1: login con correo interno, migración | Pantalla de migración/Cuentas antiguas | `sync/accesos` (L `:111`, E `:188`), `sync/perfiles` (E `:187`, L `:463`), `sync/cuentasAntiguas` (L `:465`, T `:439`, E `:565`) | — |
| 37 | `37-mantenimiento-tecnicos.js` | mantenimiento | 112 | Rol `mantenimiento_compartido` (fase A) | Recorta menú | — | — |
| 38 | `37b-mantenimiento-identificacion.js` | mantenimiento | 589 | Identificación por PIN del técnico (fase B) | «¿Quién eres?» | `sync/tecnicosMant` (T `:226`), `sync/configMantenimiento` (L `:507`, E `:532`) | 2 (`:220`, `:489`) |
| 39 | `38-tareo-rrhh-exportacion.js` | rrhh | 1 156 | Lista única del tareo, grupos de RRHH, Excel e imagen | Exportaciones del Tareo | caché `tareos` | — |
| 40 | `42-tareo-agregar-personal.js` | personal | 158 | Agregar personal al tareo | Modal en Tareo | vía 13 | — |
| 41 | `40-tareo-auditoria.js` | personal | 501 | Auditoría del tareo | Pestaña «Auditoría» (RRHH) | **crea** `auditoriaTareos` (`:311`) | — |
| 42 | `41-tareo-bloqueo.js` | personal | 606 | Bloqueo del tareo por plazo + solicitudes de corrección | Avisos y solicitudes en Tareo | `relojServidor/{uid}` (E `:88`), `solicitudesCorreccionTareo` (E `:311`, `:336`), `sync/configTareo` (E `:473`) | 2 (`:570`, `:578`) |
| 43 | `43-bitacora-mantenimiento.js` | mantenimiento | 888 | Bitácora de Mantenimiento/Producción y tarjeta «Paradas de hoy» | Bitácora de Mantenimiento, Bitácora de producción (menú), tarjeta en Inicio | `bitacoraMantenimiento` (L por rango `:224`, E `:521`) | 2 (`:255` rango, `:659` día) |
| 44 | `44-estado-datos.js` | nucleo | 144 | Chip «Actualizado a las HH:MM» | Chip en Inicio, Producción Actual, Bitácora, Tareo | `sync/users` (solo metadatos) | 1 (`:68`) |
| 45 | `46-proyeccion-avisos.js` | produccion | 407 | Proyección del turno + avisos a–e | Sección en Centro de alertas e Inicio | `sync/configAlertas` (L, T `:319`) | 1 (`:58`) |
| 46 | `47-analisis-paradas.js` | produccion | 856 | Análisis de paradas, disponibilidad, OEE base, editor de metas y velocidades | Análisis de paradas (menú Producción), tarjeta «Disponibilidad de hoy» | `sync/configIndicadores` (T `:702`), lectura de `bitacoraMantenimiento` | 2 (`:109` config, `:326` bitácora) |
| 47 | `48-resumen-turno.js` | produccion | 619 | Resumen de turno automático + pantalla «Resúmenes de turno» | Resúmenes de turno (menú Producción) | `resumenesTurno` (T crear/actualizar, L por escucha) | 2 (`:406` lista, `:416` detalle) |
| 48 | `49-resumen-indicadores.js` | produccion | 947 | Cabecera de indicadores del Resumen, metas, comparativos | Parte superior de Resumen | `sync/configIndicadores` (T al guardar metas, dentro del editor `abrirMetas`) | 0 propias (usa la escucha de 47) |
| 49 | `50-impacto-economico.js` | produccion | 585 | Impacto económico nuevo (cascada, Pareto, supuestos) | Impacto Económico | `configEconomica/{margenes,costos,general}` (L por escucha, T guardado) | 3 (`:87`, un bucle) |
| 50 | `39-vista-como.js` | accesos | 227 | «Ver como» del Administrador (solo lectura) | Botón «Ver como» | Envuelve `Firestore.prototype` (`:68`) para bloquear escrituras | — |
| 51 | `12-init.js` | nucleo | 29 | Inicialización de la app | — | — | — |
| — | `00-logo.js` | nucleo | 18 | Logo en base64 para los Excel e imágenes | — | — | **No se carga** (ver 1.3) |

Totales de escuchas abiertas **permanentemente** tras el login (sin abrir pantallas): ≈ **12** (10 de `02`, `44:68`, `23b:123`) + `17:606` si el rol lo permite. Con pantallas abiertas se suman 46, 47, 43, 48, 50, 29, 37b, 41 (ver Parte 2, sección 6).

### 1.2 `index.html`

| Qué | Dónde | Observación |
|---|---|---|
| Librerías externas | Chart.js 4.4.1 (`:51`), SheetJS (`:60`), ExcelJS 4.4.0 (`:65`), Firebase 10.13.0 app/firestore/storage/auth (`:3274–:3277`) | ExcelJS se carga en `<head>` y además `cargarScriptExterno` (`08-graficos.js:894`, `14-exportar-general.js:1661`) vuelve a pedirlo desde jsdelivr: **por confirmar** si es redundante |
| Script en línea | `:3186–:3273` | `togglePassword()` y otras auxiliares de login |
| Menú | botones `btn-*` (ver 1.4) | |
| 51 `<script src="js/...">` con `?v=` | ≈`:3296–:3358` | 52 archivos en disco, 51 cargados, **0 repetidos**, **0 faltantes** |

### 1.3 Archivo que no se carga

- `js/nucleo/00-logo.js`: no aparece en `index.html` y nunca figuró en su historial actual (`git log -S"00-logo.js" -- index.html` no devuelve commits). Define `GLACIAL_LOGO_BASE64` (`:12`) y `GLACIAL_LOGO_RATIO` (`:18`).
- Consecuencia comprobada en el código: `08-graficos.js:2923` y `14-exportar-general.js:548` usan `typeof GLACIAL_LOGO_BASE64 !== 'undefined'` y simplemente **omiten el logo** en las portadas del Excel; `08-graficos.js:3562` lo usa dentro de `try{…}catch(e){}`, así que el error se traga y la imagen JPG sale sin logo. No se rompe nada, pero el logo nunca aparece. (Por confirmar con el usuario si se espera que aparezca.)

### 1.4 Botones de menú → función → archivo que la define

| Botón (`index.html`) | Función | Definida en |
|---|---|---|
| `btn-centro-perfil` | `abrirCentroPerfil` | `04-sidebar.js:428` (envuelta por `37-mantenimiento-tecnicos.js:78`); contenido en `32-dashboard-perfiles.js` |
| `btn-produccion-actual` | `goProduccionActual` | `04-sidebar.js` |
| `btn-avance-produccion` | `goAvanceProduccion` | `04-sidebar.js` |
| `btn-tareo` | `goTareo` | `04-sidebar.js` |
| `btn-rotacion-supervisores` | `goRotacionSupervisores` | `04-sidebar.js` |
| `btn-bitacora-prod` | `goBitacoraProduccion` | `43-bitacora-mantenimiento.js` |
| `btn-resumenes-turno` | `goResumenesTurno` | `48-resumen-turno.js` |
| `btn-mantenimiento` | `goMantenimiento` | `04-sidebar.js` |
| `btn-bitacora-mtto` | `goBitacoraMtto` | `43-bitacora-mantenimiento.js` |
| `btn-analisis-paradas` | `goAnalisisParadas` | `47-analisis-paradas.js` |
| `btn-rrhh` | `goRRHH` | `04-sidebar.js` |
| `btn-resumen` | `goResumen` | `04-sidebar.js:436` |
| `btn-perdidas` | `goPerdidasSoles` | `04-sidebar.js:461` |
| `btn-usuarios` | `openUsersModal` | `10-usuarios.js` |
| `btn-trabajadores` | `openWorkersModal` | `11-trabajadores.js` |
| `btn-almacen` | (sin `onclick` detectado) | **por confirmar** (módulo Almacén sin función de navegación propia en `js/`) |

Pestañas internas (`state.currentTab`) y quién las dibuja: `avance-produccion` → `29`; `resumen` → `09` + `49`; `perdidas` → `15`/`22` (anterior) y `50` (nuevo); `produccion-actual` → `16:3379` + `24`; `analisis-paradas` → `47`; `bitacora-mtto` → `43`; `resumenes-turno` → `48`; `rotacion-supervisores` → `31`; `mantenimiento` → `18`; `rrhh` → `19` + `26`; `tareo` → `13`; `centro-perfil` → `32`; `nuevo`, `historial`, `graficos`, `paletas` → `06`, `07`, `08`, `16`. El despachador está en `06-registro.js:2230–:2516`.

---

## 2. CÁLCULOS REPETIDOS

Definiciones vigentes (las del reglamento de reportes):
- Horas efectivas = tiempo transcurrido − (paradas programadas + no programadas) ÷ 60.
- Ratio (UND/h) = producción efectiva ÷ horas efectivas.
- Tiempo planificado = duración de la programación − paradas programadas.
- Disponibilidad = (planificado − no programadas) ÷ planificado.
- Merma = suma de mermas ÷ producción efectiva (decisión B del Resumen).
- Cumplimiento = producido ÷ programado.
- OEE = disponibilidad × rendimiento; rendimiento = ratio ÷ velocidad estándar; «Calidad: no se mide».

Fuentes de datos que se mezclan en los cálculos:
- **R** = registro del turno (`sync/records`, cuadros que llena el supervisor).
- **S** = estado de la programación y botones (`sync/programaciones` → `23b`), es decir el «semáforo».
- **P** = Paletas (`sync/paletas`).
- **B** = bitácora (`bitacoraMantenimiento`).

### 2.1 Ratio (UND/h)

| Dónde | Fórmula exacta | Pantallas | Fuente |
|---|---|---|---|
| `23b-tiempos-linea.js:435` | `prod ÷ (tiempoOperativoMin/60)` → `ratios.ratioEfectivo` | Semáforo (`24:2242`), Inicio ejecutivo, 46, 47, 48, 49 (hoy) | S |
| `06-registro.js:71`, `:124`, `:175` | `efectiva ÷ horasEfectivas` (horas = `horasTurno − pProg − pNoProg` del cuadro) | Nuevo registro, Historial, Gráficos, Excel por línea | R |
| `09-resumen.js:2417` | `producido ÷ (minEfectivos/60)`, `minEfectivos = minutos entre horaInicio y horaFin − paradas` (`rsMinProduccion` `:2344`, `:2416`) | Resumen, bloque industrial «Ratio Turno vs nominal» | R (con respaldo P para producido `:2412`) |
| `29-avance-produccion.js:607` y `:790` | `produccionTotal ÷ (minutosEfectivos/60)`; `minutosEfectivos = T.tiempoOperativoMin` si hay inicio y `T.ok` (`:595–:605`); si no, `minTurno − totalParadas` | Avance y Cierre, mensaje WhatsApp, Excel/imagen de cierre | S (con respaldo manual) |
| `49-resumen-indicadores.js` (`agregar`) | `Σ producido ÷ Σ horas efectivas` | Cabecera del Resumen, 50 | S hoy, R anteriores |
| `08-graficos.js:1881` | `produccionNominal ÷ horasEfectivas` (es el ratio **nominal**, aunque la celda se llama ratio) | Excel por línea | R — **por confirmar** el rótulo |

¿Coinciden? Hoy en vivo, 23b = 29 (cuando hay inicio) = 49 (misma función). Para turnos pasados, 06 y 09 pueden diferir entre sí y del semáforo porque usan horas anotadas, no las reales. La versión única debería ser `23b:435`, alimentada para el pasado con los tiempos del registro mediante una función compartida (propuesta en la sección 8).

### 2.2 Horas efectivas

| Dónde | Fórmula | Fuente |
|---|---|---|
| `23b:410` | `max(0, transcurrido − pausas programadas − paradas no programadas)` (`tiempoOperativoMin`) | S |
| `06-registro.js:50`, `:96` | `max(horasTurno − pProg − pNoProg, 0)` por cuadro; el total del registro suma los cuadros (`:147–:148`) | R |
| `09-resumen.js:2416` | `max(0, minCalendario − minParadas)` (todas las paradas juntas) | R |
| `29:595`, `:787` | `max(0, minTurno − totalParadas)` como respaldo | S/manual |
| `47-analisis-paradas.js:129` | `enMarcha = t.tiempoOperativoMin` | S |
| `49` | `availMin` (registro) o `enMarcha` (hoy) | R/S |

La definición es la misma en todos; lo que cambia es **de dónde salen el tiempo y las paradas**. Versión única: `23b:410`.

### 2.3 Minutos de parada

Tres orígenes distintos para el mismo concepto:
1. **Registro (R)**: `paradasProgramadas` / `paradasNoProgramadas[].tiempoMin` por cuadro. Lo suman `06`, `07:866`, `08:348` y `:1101`, `09:2338–:2414`, `14`, `15:194`, `22`, `49`, `50`.
2. **Estado de programación (S)**: botones y supervisor, con solapes fusionados y duraciones estándar. Lo calcula **solo** `23b:117` (`paradasOperativas`) y `:151` (`paradasSupervisor`); lo usan `24`, `29`, `46`, `47`, `48`.
3. **Bitácora (B)**: eventos DETENER/PAUSAR/REANUDAR con `duracionMs`, agrupados en `43:144` (`armarParadas`).

¿Coinciden? 47 coincide con 24 por diseño (misma función 23b). R vs S pueden diferir; `49` ya avisa cuando difieren más de 2 %. Versión única: S (`23b`) para hoy y para cualquier turno que la bitácora/estado cubra; R solo donde no exista S (turnos antiguos).

### 2.4 Disponibilidad

| Dónde | Fórmula | Pantallas |
|---|---|---|
| `06-registro.js:62–:64`, `:115–:117`, `:166–:168` | `horasEfectivas ÷ (horasTurno − pProg)` (definición vigente, corregida en la Parte A) | Nuevo registro, Gráficos, Historial |
| `47-analisis-paradas.js:126–:127` | `enMarcha ÷ planificado` | Análisis de paradas, tarjeta «Disponibilidad de hoy» |
| `49` (`agregar`) | `Σ(planificado − no prog.) ÷ Σ planificado` | Cabecera del Resumen |
| `09-resumen.js:294–:300` | promedio **ponderado por horas efectivas** de la disponibilidad de cada registro | Tarjeta «Disponibilidad» (ahora sustituida por la de 49 vía `49:843`) |
| `09-resumen.js:1865` | igual (ponderado por horas) | Gráfico de componentes por línea |
| `14-exportar-general.js:208–:209` | igual (ponderado por horas) | Excel general |
| `08-graficos.js:717`, `:781`, `:2665` | OEE ponderado por horas efectivas | Gráficos, Excel por línea |

¿Coinciden? **No siempre.** El promedio ponderado por horas efectivas no es igual a `Σ efectivas ÷ Σ planificadas` salvo que todos los registros tengan la misma disponibilidad. La tarjeta de arriba del Resumen ya usa la versión de 49, pero los gráficos de abajo y el Excel general siguen con el promedio ponderado. Versión única: `Σ(planificado − no prog.) ÷ Σ planificado` (la de 47/49).

### 2.5 Merma

| Dónde | Fórmula | Pantallas |
|---|---|---|
| `08-graficos.js:452` (`agruparMermas`) | suma de `unidades` de los ítems con nombre | Base de casi todo |
| `09-resumen.js:313–:315`, `:1907–:1909` | `mermaTotal ÷ efectivaTotal` | Tarjeta de merma, merma por línea |
| `09-resumen.js:2353–:2359`, `:2475` | `rsMerma` (acepta `unidades` o `cantidad`, formas objeto y arreglo) ÷ producción | Bloque industrial |
| `14-exportar-general.js:199`, `:211` | `mermaUnidades ÷ efectiva` | Excel general |
| `08-graficos.js:5052`, `:5188` | por ítem y total ÷ efectiva | Gráfico de mermas |
| `49` | `Σ mermas ÷ producción efectiva` | Cabecera del Resumen |

¿Coinciden? La fórmula es la misma en todos tras la Parte A. Diferencia de **extracción**: `rsMerma` (`09:2353`) y `agruparMermas` (`08:452`) leen el dato de forma distinta (campos `unidades` vs `unidades||cantidad`, ítems sin nombre); **por confirmar** si algún registro antiguo produce valores distintos.

Además, la «calidad» se trata de **tres formas**: `06-registro.js:59`, `:110`, `:156` fija `rechazadas = 0` (calidad 100 %); `47-analisis-paradas.js:249–:253` toma la merma «Botellas» como rechazadas para su OEE base; `49` declara «Calidad: no se mide».

### 2.6 Cumplimiento

| Dónde | Numerador / denominador | Pantallas |
|---|---|---|
| `06-registro.js:68`, `:121`, `:172` | `efectiva ÷ programada` del **propio registro** | Nuevo registro, Gráficos |
| `07-historial.js:893` | `totalEfectivo ÷ totalProgramado` del registro | Historial |
| `14-exportar-general.js:210` | `efectiva ÷ programada` del registro | Excel general |
| `16-paletas.js:784` (`porcentajeAvance`), `:2937`, `:3574` | `unidadesProducidas (paletas) ÷ cantidadProgramada (programación)` | Paletas, tarjeta de programación |
| `24-semaforo-produccion-actual.js:1144`, `:2241` | `producidoDe` (`:203`: corrección manual si existe, si no paletas) ÷ programación | Semáforo, Inicio |
| `29-avance-produccion.js:614`, `:641` | `produccionTotal ÷ avProgramadoLinea` | Avance y Cierre |
| `09-resumen.js:2423`, `:2473` | `producido (registro, respaldo paletas) ÷ programaciones` | Bloque industrial |
| `49` | `producido ÷ programado` (programaciones sin canceladas, misma ventana) | Cabecera del Resumen |

¿Coinciden? **No necesariamente**: hay **tres numeradores** (paletas, registro, corrección manual) y **dos denominadores** (programación y `produccion.programada` del registro). Versión única: numerador = producción efectiva vigente del turno (la de 24:203), denominador = programación sin canceladas (`estadoOperacion.estado`).

### 2.7 Rendimiento

Cuatro significados con el mismo nombre:
- `06-registro.js:63`, `:114`, `:163`: `min(efectiva ÷ (ratioNominal × horasEfectivas), 1)` (con tope).
- `23b-tiempos-linea.js:434`: `ratioTurno = prod ÷ ((transcurrido − pausas programadas)/60)`; se llama «rendimiento del turno» (`:473`, `:492`).
- `47-analisis-paradas.js:263`: `ratioSop ÷ velocidad estándar`, con **sopladas**.
- `49`: `ratio ÷ velocidad estándar`, sin tope.

No coinciden entre sí (distinto numerador, denominador y tope). Versión única: la vigente (`ratio ÷ velocidad estándar`, sin tope, con aviso si supera 100 %); el «rendimiento del turno» de 23b conviene renombrarlo (es otra cosa).

### 2.8 OEE

| Dónde | Fórmula |
|---|---|
| `06-registro.js:67`, `:120`, `:171` | `disp × rendimiento(tope 100 %) × calidad(100 %)` por registro |
| `08-graficos.js:717`, `:781`, `:2665`; `09-resumen.js:306`, `:1565`; `14-exportar-general.js:208`, `:583`, `:863` | promedio ponderado por horas efectivas de lo anterior |
| `47-analisis-paradas.js:272` | `disp × rend(sopladas) × cal` con calidad desde la merma «Botellas» |
| `49` | `disp × rendimiento(sin tope)`, solo si hay velocidad estándar |
| `09-resumen.js:3891` (`oeePorLinea`) | gráfico «OEE por línea» con la fórmula de 06 |

Cuatro definiciones distintas en pantalla. Versión única: la de 49 (disponibilidad × rendimiento).

### 2.9 Proyección de cierre

- Una sola implementación: `23b-tiempos-linea.js:485` (`proyectarCierreLinea`). La usan `24:878` y `:2258` y, a través de las filas del semáforo, `46:162–:176`, `25` y `32:250`.
- Coinciden entre sí. Dos cosas a vigilar: los umbrales viven en **dos sitios** (`23b:49–:55` y `:480–:481`, y `sync/configAlertas` en `46`; `24:516` los pasa por línea), y 29 Avance no proyecta.

### 2.10 Producción del turno

| Dónde | Qué toma |
|---|---|
| `16-paletas.js:715` (`resumenProgramacionCombinacionTurnos`), `:784` | Paletas: `unidadesProducidas` (completas + incompletas) |
| `24-semaforo-produccion-actual.js:203` (`producidoDe`) | `produccionFinalCorregida` si existe; si no, Paletas |
| `06-registro.js` (cuadros) | `produccion.efectiva` escrita por el supervisor |
| `35-autollenado-registro.js` | copia Paletas → `produccion.efectiva` al llenar el registro |
| `29-avance-produccion.js:92`, `:105`, `:131` | efectiva del registro / paletas hasta una hora |
| `09-resumen.js:2410–:2412` | registro, con respaldo Paletas |
| `49` | semáforo hoy, registro anteriores |

Pueden diferir cuando el supervisor edita el registro después del autollenado o hay corrección manual; `49` avisa si superan 2 %. Versión única: la efectiva vigente de `24:203`, copiada al registro al cerrar.

### 2.11 Horas trabajadas, horas extras y tardanza (tareo)

- Definiciones únicas: `13-tareo.js:2159` (`calcularHorasTrabajadas`: salida − ingreso − refrigerio, con paso por medianoche), `:2201` (`calcularHorasExtras`: `max(0, trabajadas − jornada)`, jornada por defecto 8, `:2205`), `:2217` (`calcularTardanza`: minutos de retraso; ajusta cruce de medianoche). Se guardan en la persona (`:5372`, `:5378`) y los totales **suman el campo guardado** (`:804`, `:6545`, `:8935`, `:9126`, `:9560`), no lo recalculan.
- Otra definición de horas: `13-tareo.js:2484` (`tareoHorasPorDia`, para personal por día, **sin** descontar refrigerio).
- **Contadores de asistencia: cinco reglas distintas para «asistieron»** (ver también sección 3, caso H):
  - `13-tareo.js:787–:801`: solo `Asistió`; **todo lo demás** cuenta como ausencia.
  - `34-integraciones.js:236–:244` (WhatsApp): solo `Asistió`; faltas = las 2 de falta; descansos = 2 estados.
  - `32-dashboard-perfiles.js:292` (Inicio, equipo): presentes = `asistio`, `tardanza`, `feriado trabajado`, `comision/trabajo externo` (`tardanza` no es un estado canónico: **por confirmar**).
  - `26-rrhh-panel.js:82–:90`: ausencias = Falta por justificar, Falta justificada y **Descanso médico** (no `Descanso`).
  - `48-resumen-turno.js:64–:80`: asistieron = Asistió + Feriado trabajado + Comisión; faltas = 2; descansos = 2; otros aparte.
- Versión única: una función `tareoContadoresTurno` en `13-tareo.js` (ya existe `tareoContadores` en `:786`) que todos los demás reutilicen; hoy cada uno cuenta a su modo.

---

## 3. INFORMACIÓN MOSTRADA DOS VECES

| # | Qué se repite | Dónde | ¿Coinciden los números? | Cuál conviene conservar |
|---|---|---|---|---|
| A | **Estado de la línea** (en producción, pausa, detenida) | `24` (estado visual con secuencia de programación), `09-resumen.js:2387` (`rsEstadoLineas`, lee `estadoOperacion.estado` crudo: «EN_PRODUCCION», «DETENIDA»…), `32:250` (usa el resumen ejecutivo de 24) | Puede no coincidir: 09 no aplica la secuencia ni la prioridad de estados de 24 (`PRIORIDAD_ESTADO_LINEA` `24:2188`); además 24 llama «EN_CURSO» a lo que 09 llama «EN_PRODUCCION» | Conservar 24 (`glacialResumenEjecutivoLineas` `:2189`); que 09 lo use |
| B | **Paradas por línea / minutos** | Semáforo `24:1060–:1127`; bitácora `43` (por parada y por técnico); Análisis `47` (MTTR, Pareto); Resumen `09:2427–:2438`, `:1928`; Impacto `15`/`22`/`50`; Historial `07:866`; Gráficos `08:348`; Avance `29` (modal y mensaje); resumen de turno `48` (top 3) | 24, 47, 29, 46, 48 coinciden (todos 23b). 09, 07, 08, 15/22 usan el **registro** (R) y pueden diferir de 23b; 43 usa eventos (B) | Conservar 23b para el cálculo; las demás pantallas deben leerlo. Es la mayor repetición del sistema |
| C | **Programado vs producido por línea** | Tarjetas `24` y `32` («Mi turno»); `16-paletas.js:784`; gráfico «Programado vs producido» `09:2505`; `29` Avance; comparativos `49`; resumen de turno `48` | Numeradores distintos (paletas / registro / corrección, ver 2.6) | Conservar 24 (con `producidoDe`) y que 09/49/48/29 lean la misma fila |
| D | **Pareto de causas de parada** | `09:2438` (top 10 por texto), `47` (`armarPareto`), `50` (en soles), `08:348` (por registro), `14:1105` (hoja Excel), `15`/`22` (por máquina/área con expresiones regulares sobre el texto, `15:128`) | Agrupan distinto: por texto normalizado (09, 08, 14), por motivo del sistema (47, 50) o por categoría deducida del texto (15) | Conservar 47 (motivo del sistema) para minutos y 50 para soles; 15/22 es la versión vieja |
| E | **Resumen en frases del periodo** | `09:2451` (`rsInsight`), `generarInsight*` en `09:1602–:2113` (≈10 cajas), `49` «Qué pasó» | Distintas reglas; cuentan cosas parecidas (línea con más paradas, mejor cumplimiento) | Conservar «Qué pasó» (49: reglas fijas y acotadas a 3 frases) y retirar de 09 `rsInsight`; las cajas por gráfico son de apoyo |
| F | **Tarjetas de indicadores del Resumen** | 4 en `09:3602–:3627`, 5 en el bloque industrial (`09:2497–:2503`), 6 en `49` (cabecera) | Tras la Parte A usan casi las mismas fórmulas, pero hay tres juegos en una pantalla | Conservar el juego de 49; los otros dos duplican |
| G | **Impacto económico** | `15`/`22` (precio por línea en `sync/precios`, solo paradas) y `50` (margen por producto, velocidad, mermas, en `configEconomica`) | No coinciden por diseño (otra fórmula y otros precios) | Conservar 50; mantener 15/22 solo como «cálculo anterior» hasta que se retire |
| H | **Tareo: recuentos y mensajes** | Contadores en `13:786`, `26:82`, `32:292`, `34:236`, `48:64`; texto WhatsApp (`34:mensajeTareo`) vs imagen y Excel (`38`, lista única) vs Excel operativo `27` | Reglas de «asistió» distintas (2.11). `38` ya unificó imagen y Excel, pero `27` y `34` no usan la misma lista | Unificar contadores en `13:786` y lista en `38` (`tareoListaUnica`) |
| I | **Cierre del turno en 4 formatos** | `29` (snapshot y texto), `34` (mensaje de WhatsApp del cierre), envío a Sheets (`34`/`sheetsEnviarCierre`), `48` (imagen y Excel del resumen de turno) | El resumen de turno se calcula aparte de `29`; mismas ideas, distinto armado. Los números del semáforo coinciden con 48 por diseño; con 29 en ratio y paradas sí, pero **por confirmar** en producción final | Dejar `29` como cierre oficial y que `48` lea su snapshot en vez de recalcular |
| J | **Alertas y avisos** | Centro de alertas `25` (eventos de líneas del historial `historialAlertas`), avisos a–e de `46` (parada abierta, sin paletas, proyección, sin iniciar, tareo por bloquear), aviso al cerrar `43:783`, avisos de datos de `49`/`44` | «Parada abierta» aparece en 25 (evento DETENCIÓN) y en 46 (a): podría salir dos veces para la misma parada (**por confirmar**: no se probó en pantalla) | Conservar 46 para avisos calculados y 25 como bandeja/historial; evitar que ambos disparen la misma parada |
| K | **Inicios / tableros por perfil** | `32` (Inicio / Mi turno), tarjeta «Paradas de hoy» (`43`), «Disponibilidad de hoy» (`47`), sección de proyección (`46`) en el Centro de alertas, Inicio RRHH (`26`) | Cada tarjeta lee su fuente; las paradas de hoy en `43` vienen de eventos (B) y en `47` de S | Mantener las tarjetas pero con una sola fuente de minutos |
| L | **Velocidades y ratios nominales** | Tablas de `01-config.js` (ratios por presentación, `:404`) y `sync/configIndicadores.velocidades` (47) | Unificadas en la Parte A mediante `obtenerRatioNominal` envuelta (`49:132`); el catálogo base sigue existiendo como respaldo | Conservar la tabla de Firestore y retirar el catálogo cuando todos los formatos estén cargados |
| M | **Metas y umbrales** | `METAS` (`08:16`), `sync/configIndicadores.metas` (47) y `.metasReporte` (49), `UMBRALES` (`23b:49`, `:480`), `sync/configAlertas` (46) | Cinco lugares; `49` sincroniza `METAS` con Firestore, pero `23b` y `46` siguen por su cuenta | Una sola colección de configuración |
| N | **Excel** | `08` (por línea), `14` (general), y exportaciones propias de `27`, `38`, `43`, `47`, `48`, `49`, `50` | Cada uno arma sus hojas; reglas de formato repetidas | Conservar los helpers de `08:894–:1029` y que los nuevos los reutilicen |

---

## 4. FUNCIONES Y DATOS DUPLICADOS

### 4a. Mismo nombre definido en más de un archivo (declaraciones globales)

Solo hay **dos** nombres globales declarados en dos archivos (se midió con script sobre declaraciones `function` y `const/let` de primer nivel):

| Nombre | Archivos | Cuál gana |
|---|---|---|
| `cambiarTodosLosPermisos` | `02-estado.js:429` y `10-usuarios.js:823` | `10-usuarios.js` (carga después, orden 10) |
| `actualizarEstadoTodosLosPermisos` | `02-estado.js:433` y `10-usuarios.js:869` | `10-usuarios.js` |

La versión de `02-estado.js` queda **sin efecto** (se sobrescribe al cargar `10`): **por confirmar** si alguien la llama antes de que cargue `10`.

Nota: los nombres repetidos dentro de IIFE (no globales) **no chocan**, pero sí son duplicación de código (ver 4c).

### 4b. Funciones que otro archivo reemplaza o envuelve (cadena completa, en orden de carga)

Cada «↳» envuelve a la anterior (llama a la versión previa y agrega algo) o la reemplaza sin llamarla. Se detectaron con script (reasignaciones con sangría ≤ 10) más los bucles `globalThis[nombre]=…`.

**Funciones de pantalla y arranque**

- `renderMain` (7 capas): `06-registro.js:2135` → `17-modo-trabajo.js:963` → `21-programacion-turno.js:199` → `43-bitacora-mantenimiento.js:854` → `47-analisis-paradas.js:799` → `48-resumen-turno.js:573` → `50-impacto-economico.js:570`.
- `renderSidebar` (7): `04-sidebar.js:131` → `37-mantenimiento-tecnicos.js:104` → `37b-mantenimiento-identificacion.js:579` → `43:870` → `47:811` → `48:585` → `39-vista-como.js:209`.
- `handleLogout` (9): `03-auth.js:262` → `25-alertas-lineas.js:605` → `37b:570` → `41-tareo-bloqueo.js:598` → `46-proyeccion-avisos.js:279` → `47:748` → `48:601` → `50:578` → `39-vista-como.js:218`.
- `enterApp` (5): `03-auth.js:439` → `17-modo-trabajo.js:949` → `25:597` → `37b:552` → `41:589`.
- `ajustarVistaSegunPermisos` (4): `04-sidebar.js:103` → `43:847` → `47:792` → `48:566`.
- `grupoSidebarActivo` (4): `04-sidebar.js:256` → `43:864` → `47:807` → `48:581`.
- `renderCentroPerfil` (5): `32-dashboard-perfiles.js:941` → `43:755` → `44-estado-datos.js:130` → `46:381` → `47:829`.
- `renderFormTab` (4): `06-registro.js:3185` → `17:979` → `21:206` → `35-autollenado-registro.js:402`.
- `renderPerdidasSoles` (3): `15-perdidas-soles.js:390` → `22-impacto-para-pegar.js:181` → `50-impacto-economico.js:547`.
- `renderProduccionActualTab` (3): `16-paletas.js:3379` → `24:2153` → `44:113`.
- `renderPaletasTab` (3): `16:2408` → `16:3646` (el propio archivo la reasigna) → `21:213`.
- `renderResumen` (2): `09:2528` → `49:812`. `renderRRHHModulo` (2): `19-rrhh.js:34` → `26:131`.
- `tareoRenderTabs` (9): `13-tareo.js:1088` → `20:282` → `26:180` → `30-rotacion-mantenimiento.js:551` → `33-rotacion-maquinistas.js:309` → `37b:540` → `38-tareo-rrhh-exportacion.js:1146` → `41:541` → `44:101`.
- `abrirCentroPerfil` (2): `04-sidebar.js:428` → `37-mantenimiento-tecnicos.js:78`.
- `avGenerar` (2): `29:906` → `48:216`. `avGenerarCierreAhora` (2): `29:1071` → `43:818`.

**Señales de actualización en vivo** (envueltas con bucles `globalThis[nombre]`, por eso el script no las listó):
- `onProgramacionesUpdated` (**10 capas**): `02-estado.js:1190` → `21:220` → `25:591` → `32:931` → `35:434` → `46:269` → `47:734` → `48:605` → `49:866` → `50:560`.
- `onPaletasUpdated` (7): `02:1145` → `32` → `35` → `46` → `48` → `49` → `50`.
- `onRecordsUpdated` (4): `02:1225` → `47:734` → `48:605` → `49:866`.
- `onTareosUpdated` (4): `02:1051` → `26:189` → `46:269` → `48:605`.
- `onUsersUpdated` (2): `02:908` → `25:584`.

**Guardado y permisos**
- `saveUsers`: `02:1263` → `36-seguridad-auth.js:202` → `23-gerente-solo-lecutra.js:76` (más el bucle de `23` para `saveRecords/saveWorkers/saveRotaciones/saveTareos/savePrecios/savePaletas/saveProgramaciones`).
- `saveTareos`: `02:1500` → `13:10497` → `23`.
- `guardarTareoEnMemoria`: `13:1505` → `41:280`. `guardarTareoActual`: `13:5516` → `34:201`. `saveDraft`: `06:7547` → `17:1010`.
- `tienePermiso`: `02-estado.js:417` → `24-semaforo-produccion-actual.js:167` (**una pantalla de producción cambia la función de permisos global**; da acceso a «produccionActual» a supervisores con `paletas` y a Mantenimiento con `moduloMantenimiento`).
- `normalizarPermisosUsuario`: `02:344` → `23:25` → `37:49`. `rolTieneTodosLosPermisos`: `10:20` → `23:41`. `cambiarRolNuevoUsuario`: `10:410` → `23:54` → `37:61`. `puedeProgramarPaletas`: `02` → `23:47`.
- `tareoPuedeEditar`: `13:510` → `41:147`. `tareoAutorizadoEscribir`: `13:445` → `41:158`. `tareoPuedeExportar`: `13:518` → `41:169`. `tareoCargoPermitido`: `13:151` → `28:92`.

**Datos y cálculos**
- `obtenerRatioNominal`: `01-config.js:404` → `49-resumen-indicadores.js:132` (lee la tabla única de velocidades antes del catálogo).
- `agruparParadasNoProgramadas`: `15:174` → `22:38` (reemplazo completo: B10L, unidades).
- `calcularKPIsPlanta`: `09:276` → `49:843`. `filtrarPorRangoResumen`: `09:224` → `49:821`. `rsFechaEnRango`: `09:2361` → `49:836`. `xlgHojaDatos`: `14:1328` → `49:934`. (`fechaHoyResumen` también la reemplaza 49.)
- `resumenProgramacionCombinacionTurnos` (`16:715`), `unidadesPorPaletaActiva` (`16:283`): reemplazadas por `24:176` y `24:193`. `blankPaleta`, `guardarPaleta`, `renderPaletasResultados`, `resumenPaletas`: `16` las reasigna dentro de sí mismo (`:3637`, `:3797`, `:3766`, `:3600`) — **dos versiones en el mismo archivo**.
- `paradasTableCuadro`: `06:5608` → `22:140`.
- `tareoEditarPersona`, `renderTareoFormulario`, `renderTareoLectura`: `13` → `28`. `renderTareoGeneral`: `13:6840` → `38:1130`. `tareoAbrirAgregarPersonal`, `tareoAgregarPersonal`: `13` → `42:101/:109`.

Riesgo común (más en la Parte 2, sección 7): el orden de carga define el resultado; cambiar el orden de un script cambia el comportamiento sin ningún aviso.

### 4c. Funciones distintas que hacen lo mismo con otro nombre

| Qué hacen | Dónde | Observación |
|---|---|---|
| **Día operativo / fecha de hoy / turno vigente** | `02-estado.js:298` (`fechaOperativa`), `17-modo-trabajo.js:128` (`obtenerTurnoActual`), `24:24` (`turnoVigente`, exportada como `glacialTurnoVigente`), `43:82` (`diaOperativoActual`), `47:56` (`diaOperativoActual`), `48:55` (`turnoVigente`), `49:61` (`hoyOp`), `26-rrhh-panel.js:62` (`fechaOperativa`), `09-resumen.js:27` (`fechaHoyResumen`, **fecha de calendario** hasta que 49 la reemplazó), `16:842` (`fechaHoyPaletas`) | Nueve versiones; cuatro esperan la hora 7, otras no |
| Escapar HTML | `esc` definido en ≥ 22 sitios (`24:9`, `43:59`, `46:39`, `47:42`, `48:32`, `49:46`, `50:43`, `08:1248/:1270/:1380/:3101`, `14:292/:450`, `36:30`, `38:885`…) frente a `escaparHtml` global (`02-estado.js:424`) | Cada módulo repite `esc` |
| Convertir a número | `num` en `05-utils.js:11` (global, usa `parseFloat`) y en 7 IIFE (`23b:42`, `34:29`, `35:32`, `47:40`, `48:31`, `49:44`, `50:40`, con `Number`) | **Distinto comportamiento**: `parseFloat('12abc')` = 12 y `Number('12abc')` = NaN→0 |
| Normalizar texto (sin acentos) | `norm` en 12 archivos (`43:79`, `46:43`, `47:41`, `49:45`, `50:41`, `23b:43`, `35:33`, `33:28`, `37b:70`, `40:93`, `42:35`, `38:47`) y `normalizarTexto` global (`05-utils.js`) | Variantes ligeramente distintas |
| Hora del servidor | `ahoraMs`/`ahoraServidor`/`ahoraSrv` en ≥ 12 archivos (`24:13`, `23b:37`, `43:61`, `44:19`, `46:38`, `47:44`, `48:34`, `49:57`, `50:49`, `37b:73`, `41:69`, `26:136`…) | Todos terminan en `tareoAhoraServidor` (`41-tareo-bloqueo.js:70`) con respaldo `Date.now()` |
| Fechas ISO (`iso`, `parseISO`, `addDias`, `diasEntre`, `fechaOk`) | `43:62–:66`, `47:45–:49`, `49:51–:54`, `13:7846`, `33:32`, `37b:104` | Cinco copias |
| Formato de números y fechas (`fmtN`, `fmtP`, `fmtFecha`) | `43:110`, `47:50`, `48:38`, `49:48–:56`, `50:45–:48` | Copias |
| Nombre de línea | `rsLineaNombre` (`09:2386`, «CAJAS 20L»), `AVANCE_NOMBRES` (`29:8`), `nombreLinea` (`25:421`, `46:117`, `47:67`, `48:97`, `49:58` → `LINES[].name`), `NOMBRES_LINEA` (`50:101`, «Cajas 20 L», «Bidones 7 L») | Rótulos distintos para la misma línea |
| Marca base / presentación | `marcaBasePresentacion` y `categoriaPresentacion` (`09:744`, `:774`) frente a `marcaCanon` y `catPres` (`49`) | 49 las envuelve parcialmente; reglas de agrupación distintas (`BELLS` ≠ `Bells` en 09) |
| Clave de producto | `combo.marca+'||'+combo.presentacion` (`24:2197`), `${marca}|${presentacion}` (`29:479`), `claveVel` (`47:81`), `claveProd` (`49`), `claveMargen` (`50`) | Cinco formatos de clave |
| Motivo pendiente | `esMotivoPendiente` (`24:1619`), `esPendiente` (`43:103`, comentario «misma regla que 24»), `esSinMotivo` (`49:174`) | Tres copias de la regla |
| Descarga de archivos | `descargarArchivo` (`08:927`), `descargarBlob` (`38:529`, `48:323`), `descargarTexto` (`36:227`), `descargarImagen` (`38:822`) | Cuatro helpers |
| Contar mermas | `agruparMermas` (`08:452`), `rsMerma` (`09:2353`), `componenteMerma` (`49`) | Tres lectores de los mismos datos |
| Agrupar paradas | `agruparParadas` (`08:348`), `agruparParadasPlanta` (`09:1928`), `rsParadas` (`09:2338`), `agruparParadasNoProgramadas` (`15:174`/`22:38`), `armarPareto` (`47`), `armarParadas` (`43:144`) | Seis agrupadores |
| Cargar ExcelJS | `<script>` en `index.html:62`, `cargarScriptExterno` (`08:894`) | Posible doble carga |

### 4d. Constantes y configuraciones repetidas

**Metas y umbrales** (5 lugares):
- `METAS` en `08-graficos.js:16` (OEE 0,85; disponibilidad 0,90; rendimiento 0,95; calidad 0,99; merma 0,02), sincronizada con Firestore por `49` (`aplicarMetasAlCodigo`).
- `DEF_METAS` en `47:33` (verde 90, ámbar 80) y `sync/configIndicadores.metas`.
- `DEF_METAS` de reportes en `49:30–:36` y `sync/configIndicadores.metasReporte`.
- `UMBRALES` y `UMBRALES_PROYECCION` en `23b:49–:55`, `:480–:481`.
- `sync/configAlertas` (`46`) y `24:516` (`proyeccionVerdePct`, `proyeccionAmbarPct`).

**Horarios de turno** (siete criterios distintos):
- Estándar 07:00–19:00 / 19:00–07:00: `32:68–:70`, `29:39–:40`, `06:1117–:1122`, `:1277–:1282`, `13:3411`, `41:41` (`finDia:'19:00'`, `finNoche:'07:00'`).
- Supervisores: `31-rotacion-supervisores.js:12–:14` (DÍA 07:00–15:00, **NOCHE 22:00–07:00**).
- Mantenimiento: `30-rotacion-mantenimiento.js:16–:18` (Día 07:00–16:00, Noche 19:00–07:00), `37b:58`.
- Corte del día operativo: `43:24` (`HORA_CORTE=7`), `47:29` (`HORA_CORTE=7`), y 7 fijo en `49`/`48`.
- Horas de avance: `29:11`, `:900` (09,11,13,15,17,19 y 01,03,05,07).

**Listas de líneas** (además de `LINES` en `01-config.js:218`): `09-resumen.js:2125`, `:2249`, `:2390`, `:2404`; `33-rotacion-maquinistas.js:21` (`LINEAS_MAQ`); `29:7` (`AVANCE_LINEAS`, incluye `HIELO`); `22:8–:15` (incluye `B10L`); `06:3662`; `32:620`.

**Estados de producción** (nombres que significan casi lo mismo): `EN_PRODUCCION` (`09`, `16`, `24`), `EN_CURSO` (`24`, `32`, `46`), `FINALIZADA` (`09`, `16`, `23b`, `24`), `COMPLETADA` (`24`, `32`), `PAUSA`, `PENDIENTE`, y los del registro `FINALIZADO`/`EN_REGISTRO`/`REABIERTO` (`06:2078`, `:2810`, `:2828`).

**Turnos**: `DÍA/INTERMEDIO/NOCHE` (programación y semáforo), `Día/Noche` (tareo, `13:1781` `normalizarTurno`), `DIA/NOCHE` (`48`, `49`, `avTurnoCanon` de `29`), `DIA_INTERMEDIO` (`06:2597`).

**Motivos de parada**: `PARADAS_PROGRAMADAS` (`01:751`, lista), `CATALOGO_MOTIVOS_PARADA` (`01:803`, objetos con `estandarMin`), `CAUSAS_PARADA_NO_PROGRAMADA` (`01:879`, lista), `CATEGORIAS_IMPACTO_ECONOMICO` (`15:128`, expresiones regulares), `normalizarCausaParada` (`05:1587`).

**Listas de roles y permisos con nombres distintos para lo mismo**
- Roles de jefatura repetidos en 10 sitios: `02:209` (`ROLES_SOLO_CONSULTA`), `04:74`, `06:2116`, `10:481`, `24:943`, `43:29`, `46:34`, `47:34`, `48:28`, `39:34`; y deben coincidir **a mano** con las funciones de las reglas de Firestore (`esJefatura`, `puedeLeerBitacoraMtto`, `puedeVerImpacto`, `puedeOperarProduccion`).
- Permisos que autorizan lo mismo con distinto nombre: generar el cierre de turno se autoriza con `paletas` y con `avanceProduccion` (`48:51`); ver bitácora con `ver_bitacora_mantenimiento` **o** `gestionar_rotacion_mantenimiento` (`43`); ver todas las líneas con `verLineasProduccion` (`04:70`) y `todasLasLineas` (`22`).
- Estilos mezclados: camelCase (`perdidasSoles`, `exportarExcelGeneral`, `avanceProduccion`) y snake_case (`ver_bitacora_mantenimiento`, `completar_motivo_parada`, `configurar_umbrales`, `control_operativo_lineas`, `ver_tareo_produccion`) para la misma familia.
- Los textos de la maqueta mencionaban un permiso `impacto_economico`; en el código sigue siendo `perdidasSoles` (`02:130`, `04:461`, `15:399`).

---

**Fin de la Parte 1.** Cuando digas «continúa» entrego la Parte 2: código sin uso (5), tiempo real y varios dispositivos (6), riesgos de estructura (7), plan de consolidación con el módulo único de indicadores (8) y el resumen final con las diez duplicaciones más importantes.
