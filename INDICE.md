# GLACIAL · Índice del proyecto

Aplicación web (HTML + JS sin módulos ni empaquetador) con Firebase Auth y Firestore.
Las funciones son **globales** y varios archivos redefinen funciones de otros, por eso
**el orden de carga en `index.html` es parte del código y no debe cambiarse**.

## Estructura

```
index.html                      Página única; carga los scripts en orden
styles.css · tareo.css          Estilos
sidebar-glacial.css · mobile-glacial.css
img/                            Imágenes (logo)
json/                           cors.json
functions/                      Cloud Functions de ejemplo (PIN de técnicos), no se despliegan solas
firestore.rules.*.txt           Reglas de Firestore: etapa1 (abiertas) y etapa2 (estrictas, archivo final; incluye el rol de Mantenimiento)
js/
  nucleo/         base de la app
  accesos/        inicio de sesión, usuarios y permisos
  produccion/     registro, paletas, programación, semáforo, avance, resúmenes
  personal/       trabajadores, tareo y rotación de supervisores
  mantenimiento/  módulo de Mantenimiento y cuenta compartida
  rrhh/           módulo de RRHH y exportaciones
  asistente/      Asistente de Producción (insumos, consumos, mermas, solicitudes a Almacén) y Reporte General
```

## Qué hace cada archivo

### js/nucleo/
| Archivo | Función |
|---|---|
| 00-logo.js | Logo en base64 para portadas de Excel. **No se carga** en `index.html` (pendiente de decidir) |
| 01-config.js | Configuración de Firebase, banderas de seguridad, catálogos |
| 44-estado-datos.js | Insignia «Actualizado a las HH:MM» / «Sin conexión · datos de las HH:MM» (Inicio, Producción Actual, Bitácora y Tareo) |
| 02-estado.js | Estado global, permisos, sincronización con Firestore |
| 04-sidebar.js | Menú lateral y navegación |
| 05-utils.js | Utilidades comunes |
| 12-init.js | Arranque de la app (siempre el último script) |
| 34-integraciones.js | Google Sheets y WhatsApp |

### js/accesos/
| Archivo | Función |
|---|---|
| 03-auth.js | Inicio y cierre de sesión |
| 10-usuarios.js | Gestión de usuarios y permisos |
| 17-modo-trabajo.js | Modo Visualizar / Trabajar |
| 23-gerente-solo-lecutra.js | Roles de solo consulta (Gerencia/Jefatura) |
| 32-dashboard-perfiles.js | Inicio ejecutivo y operativo según perfil |
| 36-seguridad-auth.js | Cuentas seguras con Firebase Authentication |
| 39-vista-como.js | "Ver como" para el Administrador (solo lectura) |

### js/produccion/
| Archivo | Función |
|---|---|
| 06-registro.js | Nuevo registro de producción |
| 07-historial.js | Historial de registros |
| 08-graficos.js | Gráficos y Excel por línea |
| 09-resumen.js | Resumen de producción |
| 14-exportar-general.js | Exportación general de planta |
| 16-paletas.js | Paletas en tiempo real |
| 21-programacion-turno.js | Programación del turno |
| 50-impacto-economico.js | Impacto económico completo (solo Gerencia): cascada en S/, rankings, supuestos y Excel |
| 55-valores-economicos.js | Valores unitarios protegidos por rol (solo Gerencia): lectura/escritura con historial, migración y pantalla «Valores unitarios» |
| 56-impacto-resultados.js | Fuente de datos del dashboard de impacto (eventos por día) y publicación de Gerencia para Jefatura |
| 57-impacto-estado.js | Estado central de filtros y agregación del dashboard (puro, con pruebas) |
| 58-impacto-dashboard.js | Dashboard interactivo de Impacto económico (filtros cruzados, 10 gráficos, detalle) |
| 59-impacto-analisis.js | Análisis automático bajo cada gráfico (puro, con pruebas) |
| 60-impacto-excel.js | Excel de Impacto por rol |
| 23b-tiempos-linea.js | Cálculo central de tiempos y ratios por línea |
| 24-semaforo-produccion-actual.js | Producción actual y semáforo de líneas |
| 25-alertas-lineas.js | Centro de alertas de líneas (detenciones + pestaña Avisos con contador) |
| 47-analisis-paradas.js | Pantalla «Análisis de paradas» (Pareto, tendencia, disponibilidad, MTTR/MTBF, base OEE, Excel) y tarjeta «Disponibilidad de hoy» del Inicio |
| 46-proyeccion-avisos.js | Avisos a–e, tarjeta «Proyección del turno» del Inicio y editor de umbrales (sync/configAlertas) |
| 29-avance-produccion.js | Avance y cierre de turno |
| 35-autollenado-registro.js | Autollenado del registro desde paletas/paradas |
| 29b-correccion-paradas.js | Corregir y reasignar paradas (quitar de una marca, cambiar de marca o de línea) con motivo y constancia |

### js/personal/
| Archivo | Función |
|---|---|
| 11-trabajadores.js | Gestión de trabajadores |
| 13n-tareo-nube.js | Tareo: única forma de escribir tareos (transacciones, reintentos, mensajes de error, pendientes, documento por tareo). Cargar antes de 13 |
| 13-tareo.js | Tareo, historial, resumen mensual, rotación semanal |
| 20-tareo-control.js | Control de descansos y auditoría del tareo |
| 28-tareo-maquinistas.js | Reglas de maquinistas y técnicos en el tareo |
| 31-rotacion-supervisores.js | Rotación de supervisores |
| 40-tareo-auditoria.js | Registra en `auditoriaTareos` quién cambió qué en un tareo (solo crea eventos) |
| 41-tareo-bloqueo.js | Bloqueo de tareos por plazo (hora del servidor), correcciones de RRHH con motivo y solicitudes |
| 42-tareo-agregar-personal.js | Agregar personal al tareo (ya registrado o personal nuevo) en Producción y Mantenimiento |

### js/mantenimiento/
| Archivo | Función |
|---|---|
| 18-mantenimiento.js | Módulo de Mantenimiento |
| 30-rotacion-mantenimiento.js | Rotación semanal de Mantenimiento |
| 33-rotacion-maquinistas.js | Rotación semanal de maquinistas |
| 37-mantenimiento-tecnicos.js | Cuenta compartida de Mantenimiento: rol, permisos (ver tareo y operar líneas con PIN) |
| 37b-mantenimiento-identificacion.js | Identificación del técnico con PIN |
| 37c-equipos-catalogo.js | Equipos por línea (sync/configMantenimiento.equipos, en vivo): selector «Equipo» obligatorio en paradas por «Falla de máquina» (Producción Actual, Avance / Cierre y Registro), «Otro equipo — detalle», editor «Equipos por línea» para el Supervisor de Mantenimiento; paradas antiguas = «Equipo sin indicar» |
| 37e-motivos-parada.js | Motivos de parada en dos niveles (sync/configMantenimiento.motivosParada, en vivo; transacción con merge): causas y motivos editables desde «Motivos de parada» (junto a «Equipos por línea»; nada se borra, se desactiva), `pideEquipo` por causa (37c `esFalla` le delega), «Otro» exige detalle de 10 caracteres. Las paradas no programadas guardan `causa`, `motivoCat`, `detalle`, `equipo` y `descripcion` = motivo — detalle. Catálogo inicial sin escribir. Cargar después de 37d |
| 37f-tareo-por-tecnico.js | Cuenta compartida de Mantenimiento: cada técnico identificado con PIN (37b) ve SOLO su información en Tareo General, Historial y Resumen mensual (contadores, HORAS EXTRAS, gráficos, detalle) y en las exportaciones. Filtro único: envuelve `obtenerTareos()` (copias con solo las filas del técnico; ID o DNI); sin técnico devuelve [] y muestra «Identifícate con tu PIN para ver tu tareo»; escucha `mant:tecnico` para redibujar; las copias filtradas son solo lectura. **Límite de seguridad:** es una sola cuenta de Firebase, las reglas de Firestore no separan por técnico; el filtro es de la aplicación, no del servidor. Otros roles, Equipos por línea, Motivos de parada y Producción actual no cambian. Prueba: tests/tareo-por-tecnico.test.js |
| 47b-analisis-paradas-mejoras.js | Mejoras de Análisis de paradas (funciones puras + bloques HTML; no cambia minutos): unidades perdidas (minutos ÷ 60 × velocidad estándar), fallas repetitivas (umbral en configMantenimiento.analisisParadas), frecuencia frente a duración, mapa de calor por hora, calidad del dato (metas verde/ámbar configurables) y técnico desde la intervención ligada (bitácora de respaldo). Cargar después de 47 |
| 67i-graficos.js | Gráficos dinámicos de Mantenimiento (barrasH, columnas, dona; animados, con globo del dato por mouse/toque/teclado, clicables para filtrar) y estilo visual común del módulo (refina mi-*). El globo sirve para cualquier elemento con data-tip (también el Pareto de Análisis de paradas). Cargar antes de 47 y 67c |
| 66-planificacion-modos.js | Planificación: modos Cantidad fija / Completar cantidad (meta entre bloques con cierre confirmado) / Todo el turno (estimación por ratio nominal), estado del plan «Completada» separado del operativo y formulario de modos. Ver docs/planificacion-etapa5-modos.md. Cargar después de 65d |
| 66b-planificacion-secuencia.js | Planificación: secuencia por cantidad, hora y cierre (amplía tramosSecuencia), cantidades estimadas de las marcas sin cantidad, cambio de marca configurable (5 min iniciales; ajuste por línea y por transición) y proyección con la ejecución real. Ver docs/planificacion-etapa5-modos.md. Cargar después de 66 |
| 51b-horarios-produccion.js | Horario de producción por línea, bloque y vigencia: resolvedor central (glacialHorarios.resolver), reglas con precedencia y fecha de inicio explícita, Noche 22:00–07:00 con tolerancia a las 07:30, habilitación de bloques y pestaña «Horario de producción». Sin reglas nada cambia. Ver docs/horarios-produccion.md. Cargar después de 52 |
| 67g-reclasificacion-datos.js | Reclasificación de paradas ya registradas (colección reclasificacionesParada: un documento por parada, id = id de la parada; version + historial con id; nunca se borra ni se edita el historial). Agrupa descripciones parecidas, sugiere causa, `aplicar()` pone la etiqueta nueva (el original queda en `.original`; minutos sin cambio). Escriben Supervisor de Mantenimiento y Administrador. Lee en vivo solo el rango pedido |
| 67h-reclasificacion-pantalla.js | Pestaña «Reclasificar paradas» del módulo Mantenimiento: paradas con causa «Otro», vacía o antigua, agrupadas; «Asignar a las N paradas de este grupo»; contadores de minutos sin clasificar y reclasificados |
| 43-bitacora-mantenimiento.js | Bitácora de Mantenimiento (solo lectura: rangos rápidos por día operativo 07:00–07:00, orden, buscador, vista por parada, motivos pendientes y Excel) y tarjeta «Paradas de hoy» del Inicio |
| 66-entrega-turno.js | Entrega de turno entre supervisores (colección entregasTurno, id fecha_TURNO con DIA/INTERMEDIO/NOCHE): foto automática por línea (reutiliza construirDatos de 48), novedades por línea, entregar/corregir/recibir por transacción, historial por fecha, tarjeta «Entrega de turno pendiente» en el Inicio en vivo y modo consulta para jefatura |

### js/asistente/

Diagnóstico, modelo de datos y permisos: `docs/ASISTENTE-PRODUCCION.md`.

| Archivo | Función |
|---|---|
| 70-asistente-nucleo.js | Cálculo puro: cuadros del bloque, factores con vigencia, requerimientos y reservas derivadas, stock por movimientos, conciliación, mermas, estados de solicitud, migración de factores del código |
| 71-asistente-datos.js | Firestore (`ap*`), permisos por capacidad, transacciones idempotentes y auditoría |
| 72-asistente-pantalla.js | Pantalla «Asistente de Producción» (Resumen, Seguimiento, Insumos, Solicitudes, Consumo, Merma, Parámetros, Historial) y acceso de Almacén |
| 73-reporte-general.js | Reporte General de Producción: un Excel por fecha operativa, 6 hojas, fórmulas vivas y formato aprobado (ExcelJS) |

### js/rrhh/
| Archivo | Función |
|---|---|
| 19-rrhh.js | Módulo de RRHH |
| 26-rrhh-panel.js | Panel de RRHH |
| 27-rrhh-excel-operativo.js | Excel operativo anterior (la exportación actual la reemplaza el 38) |
| 38-tareo-rrhh-exportacion.js | Lista única del tareo, grupos de RRHH, Excel e imagen |

## Orden de carga (el de `index.html`)

1. nucleo/01-config.js
2. nucleo/02-estado.js
3. accesos/03-auth.js
4. nucleo/04-sidebar.js
5. nucleo/05-utils.js
6. produccion/06-registro.js
7. produccion/07-historial.js
8. produccion/08-graficos.js
9. produccion/09-resumen.js
10. accesos/10-usuarios.js
11. personal/11-trabajadores.js
14. produccion/16-paletas.js
15. accesos/17-modo-trabajo.js
16. mantenimiento/18-mantenimiento.js
17. rrhh/19-rrhh.js
18. produccion/14-exportar-general.js
19. personal/13-tareo.js
20. personal/20-tareo-control.js
21. produccion/21-programacion-turno.js
22. accesos/23-gerente-solo-lecutra.js
23. produccion/23b-tiempos-linea.js
24. produccion/24-semaforo-produccion-actual.js
25. produccion/25-alertas-lineas.js
26. rrhh/26-rrhh-panel.js
27. rrhh/27-rrhh-excel-operativo.js
28. personal/28-tareo-maquinistas.js
29. produccion/29-avance-produccion.js
30. mantenimiento/30-rotacion-mantenimiento.js
31. mantenimiento/33-rotacion-maquinistas.js
32. personal/31-rotacion-supervisores.js
33. accesos/32-dashboard-perfiles.js
34. produccion/35-autollenado-registro.js
34b. produccion/29b-correccion-paradas.js (después de 29 y 35)
35. nucleo/34-integraciones.js
36. accesos/36-seguridad-auth.js
37. mantenimiento/37-mantenimiento-tecnicos.js
38. mantenimiento/37b-mantenimiento-identificacion.js
38b. mantenimiento/37c-equipos-catalogo.js
38c. mantenimiento/37e-motivos-parada.js
39. rrhh/38-tareo-rrhh-exportacion.js
39b. mantenimiento/37f-tareo-por-tecnico.js (después de 13-tareo, 46, 37b y 38; antes de 12-init)
40. personal/42-tareo-agregar-personal.js
41. personal/40-tareo-auditoria.js
42. personal/41-tareo-bloqueo.js
43. mantenimiento/43-bitacora-mantenimiento.js
44. nucleo/44-estado-datos.js
45. produccion/46-proyeccion-avisos.js
46. produccion/47-analisis-paradas.js
47. accesos/39-vista-como.js
48. nucleo/12-init.js

## Cómo agregar un archivo nuevo

1. Elige la carpeta por **área funcional** (nucleo, accesos, produccion, personal, mantenimiento o rrhh).
2. Nómbralo con el siguiente número libre (`40-...js`). El número no define el orden de carga.
3. Agrega su `<script src="js/<carpeta>/<archivo>.js?v=...">` en `index.html` **después** de los
   archivos cuyas funciones redefine o usa al cargarse, y **antes de `nucleo/12-init.js`**, que debe seguir siendo el último.
4. Si el archivo envuelve una función existente (`const anterior = fn; fn = function(){...}`), debe cargarse después del archivo que la define.
5. Sube el `?v=` de la etiqueta cuando cambies el archivo, para evitar caché.
6. Si agrega documentos a Firestore, actualiza las reglas (`firestore.rules.*.txt`).

## Verificar rutas (PowerShell)

```powershell
$rutas = Select-String -Path index.html -Pattern 'src="(js/[^"?]+)' | ForEach-Object { $_.Matches[0].Groups[1].Value }
$faltan = $rutas | Where-Object { -not (Test-Path $_) }
if ($faltan) { "FALTAN:"; $faltan } else { "OK: $($rutas.Count) scripts existen en disco" }
```

## Correr las pruebas

```
node tests/correr-todo.js              # todas (tests/*.test.js)
node tests/correr-todo.js tareo plan   # solo las que contienen esas palabras
```

Resume cuántas pasaron, muestra el detalle solo de las que fallan y sale con código 1 si alguna falla.

Reglas de Firestore (etapa 2) en el emulador, sin tocar ningún proyecto real. Necesita Java; se corre aparte porque usa dependencias de npm:

```
npm i firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10        # en una carpeta temporal
npx firebase emulators:exec --only firestore --project demo-glacial "node <ruta-del-repo>/tests/reglas/etapa2-emulador.js"
```

Comprueba 35 casos por rol: login, perfiles, cuenta compartida de Mantenimiento, bitácora, Planificación, corrección y reclasificación de paradas, economía y la denegación general.

## Entornos (PRODUCCIÓN y PRUEBAS)

`js/nucleo/01-config.js` guarda las dos configuraciones de Firebase y elige sola:

| Dirección de la página | Entorno | Proyecto Firebase |
|---|---|---|
| solo los dominios de `DOMINIOS_PRODUCCION` (hoy `felixgrabiel.github.io`) | PRODUCCION | `jefaturaopglacial-fdb95` |
| cualquier otra: `localhost`, `127.0.0.1`, `file://`, IPs de red local, otros dominios | PRUEBAS | `pruebas-b11b7` |

Falla hacia el lado seguro: un dominio nuevo que no esté en la lista abre en PRUEBAS. Para publicar en otro
dominio, agrégalo a `DOMINIOS_PRODUCCION` en `js/nucleo/01-config.js`.

`SHEETS_URL` y `SHEETS_CLAVE` están vacías en TODOS los entornos (integración con Google Sheets apagada; el código se conserva). En PRUEBAS además aparece una franja roja
"BASE DE PRUEBAS" y el título de la pestaña empieza con `[PRUEBAS]`. Al iniciar, la consola del navegador muestra
qué proyecto se usa.

### Etapa de seguridad por entorno

`ETAPAS_POR_ENTORNO` (en `js/nucleo/01-config.js`) define `LOGIN_LEGACY_PERMITIDO` y `REGLAS_ESTRICTAS` para cada entorno:
la etapa 2 se puede ensayar en PRUEBAS sin tocar PRODUCCION. En Gestión de usuarios (Administrador): migrar usuarios por grupos,
descargar las contraseñas temporales, respaldar usuarios y trabajadores, y comprobar la migración antes de pasar a la etapa 2.
Al restablecer una clave o eliminar un usuario, el correo anterior se anota en sync/cuentasAntiguas (solo Administrador);
"Comprobar migración" lo lista para borrar esas cuentas a mano en Firebase Console → Authentication. En la etapa 2,
sync/perfiles solo lo lee quien figura en perfiles (el login solo necesita sync/accesos, que es público).

Lote 2: la proyección de cierre vive en 23b-tiempos-linea.js (proyectarCierreLinea). Definiciones oficiales: horas efectivas = transcurrido − (paradas programadas + no programadas) ÷ 60; RATIO = producido ÷ horas efectivas; RENDIMIENTO DEL TURNO = producido ÷ (transcurrido − pausas programadas) (solo para «Si las paradas siguen igual»). Los umbrales de avisos y de color se guardan en sync/configAlertas (lectura: todo usuario autenticado; escritura: Administrador y Jefatura).

Lote 3: «Análisis de paradas» (47-analisis-paradas.js) toma los minutos de calcularTiemposLinea() (23b: campo aditivo paradasClasificadas), así que coincide con el semáforo. Disponibilidad = tiempo en marcha ÷ tiempo planificado; MTTR = minutos de paradas no programadas ÷ cantidad; MTBF = tiempo en marcha ÷ cantidad; OEE (base) = disponibilidad × rendimiento (rendimiento con sopladas totales ÷ horas efectivas ÷ velocidad estándar). El indicador «Calidad» se retiró de toda la página (ver «Calidad retirada» al final). Metas y velocidades estándar: sync/configIndicadores (lectura: usuarios autenticados; escritura: Administrador y Jefatura).

Permisos por área (pantalla de usuarios): Producción, Tareo, Mantenimiento, RRHH, Visualización y reportes, Administración y Almacén (PERMISOS_APP en 02-estado.js, con campo area). Permisos nuevos: ver_bitacora_mantenimiento (bitácora y análisis, también en las reglas), completar_motivo_parada y configurar_umbrales (también en las reglas), moduloAlmacen.

Lote 4 · Parte A: la bitácora (bitacoraMantenimiento) registra también INICIAR, FINALIZAR, CANCELAR, REABRIR, CORREGIR_INICIO y CORREGIR_FIN (campo origen PRODUCCION o MANTENIMIENTO en todos los eventos nuevos). El evento va en la misma transacción que el cambio de estado (24-semaforo-produccion-actual.js). Las correcciones exigen motivo (mínimo 5 caracteres) y llevan valorAnterior y valorNuevo. Solo se crea: nadie edita ni borra. La bitácora tiene filtro por origen y la vista «Historia de la línea».

Lote 4 · Parte B: Resumen de turno automático (js/produccion/48-resumen-turno.js). Se genera al pulsar «GENERAR CIERRE DE TURNO» (envuelve avGenerar 'CIERRE'). Colección nueva resumenesTurno, un documento por fecha y turno (id AAAA-MM-DD_DIA o _NOCHE), creado con transacción que no pisa uno existente; «Actualizar resumen» cambia solo datos, actualizadoPor/En y actualizaciones. Mientras el turno no cierra se ve como «Resumen preliminar» calculado en vivo. Imagen vertical de 1080 px y Excel; sin DNI ni nombres. Pantalla «Resúmenes de turno» en el grupo Producción. Reglas: etapa 1 abierta; etapa 2 con puedeGenerarResumen() para crear/actualizar y puedeLeerBitacoraMtto() para leer. Nueva función bitacoraMttoPendientes(fecha,turno) en 43-bitacora-mantenimiento.js.

Reportes · Parte A (Resumen general): js/produccion/49-resumen-indicadores.js agrega arriba del Resumen la cabecera de indicadores (producción, cumplimiento, ratio, disponibilidad, merma, OEE) con variación contra el periodo anterior equivalente, metas configurables (sync/configIndicadores.metasReporte y metas), «Qué pasó», comparativos por línea/turno/producto, detalle en pantalla, avisos de datos incompletos, «¿Cómo se calcula?», filtros de turno, producto y rango, y una hoja «Indicadores» en el Excel general. Fórmulas únicas: disponibilidad = (planificado − no programadas) ÷ planificado (también en calcDerived de 06-registro.js), merma = suma de mermas ÷ producción efectiva (también en el bloque industrial de 09-resumen.js), ratio = producción ÷ horas efectivas (igual que el semáforo). Velocidad estándar: única tabla en sync/configIndicadores; obtenerRatioNominal (Planificación y registro) la lee primero y usa el catálogo de 01-config.js como respaldo. Hoy usa el semáforo en vivo; los turnos anteriores, el registro del turno (aviso si difiere más de 2 % de Paletas o de la bitácora). No lee nada nuevo de Firestore ni crea colecciones.

Reportes · Parte B (Impacto económico): js/produccion/50-impacto-economico.js reemplaza el contenido de la pantalla «Impacto Económico» (renderPerdidasSoles; la vista anterior con precio por línea se retiró). Cascada: producción potencial, pérdida por paradas no programadas, por velocidad reducida y por mermas, en unidades y en soles; el incumplimiento del plan se muestra aparte (no se suma). Margen por producto y costo por componente con fecha de vigencia (se conserva el anterior); meta máxima de pérdida mensual. Colección nueva configEconomica (documentos margenes, costos y general), siempre por campos con merge. Permiso: el mismo perdidasSoles (reglas etapa 2: puedeVerImpacto). Pareto en soles por motivo, línea y turno, cinco eventos más caros, acumulado/proyección/mes anterior, supuestos y Excel. Motivos: los del sistema cuando coinciden con el registro (±2 %); si no, texto del registro marcado «clasificación estimada». recolectar() de 49 acepta {linea, motivosSistema}.

Información económica (protegida por rol): ver docs/ECONOMICO-SEGURIDAD.md. Valores unitarios en la colección valoresUnitarios (solo Gerencia lee/escribe) con historial valoresUnitariosHistorial; resultados en soles agregados en resultadosEconomicos (Gerencia escribe; Gerencia y Jefatura leen). sync/precios y configEconomica quedaron cerrados y se borran tras migrar. Los precios ya no se escriben en el código.

Tareo · guardado concurrente (13n-tareo-nube.js): toda escritura de tareos pasa por TareoNube.modificar (transacción solo sobre los tareos tocados, reintentos limitados, mensajes según el error, pendientes conservados en el navegador por usuario 24 h). Mismo campo editado a la vez: «Conflicto: revisar», sin sobrescritura silenciosa. Eliminar ya no reescribe el documento completo. Fase 2: un documento por tareo (tareos/{id}) con el interruptor TAREO_POR_DOCUMENTO de 01-config.js, apagado hasta publicar las reglas; sync/tareos queda de solo lectura y no se borra. Detalle, activación, reversión y guía de pruebas: docs/TAREO-GUARDADO-CONCURRENTE.md. Pruebas: tests/tareo-guardado-concurrente.test.js y tests/reglas/etapa2-emulador.js.

Avance de Producción, solo líneas en producción (29-avance-produccion.js): en el AVANCE una línea aparece solo si produjo (> 0 unidades) en la fecha y el turno del reporte. La programación, un inicio o paradas sin unidades no bastan, y una línea que produjo y luego paró sigue apareciendo. Lo registrado fuera de la ventana del turno (Noche 21:00–07:00; p. ej. una paleta de la mañana guardada como NOCHE o un cuadro que empieza a las 07:00) no cuenta como producción ni como inicio: avVentanaProduccion y el parámetro desdeMs de glacialProduccionPaletasAlCorte (16). Sin líneas produciendo, el reporte dice «No hay líneas en producción en este turno.» con el resumen en 0. El CIERRE conserva su criterio. En la imagen, la altura de cada tarjeta sale de los mismos pasos del dibujo (las paradas largas ocupan varias filas) y las columnas del resumen se ubican por el ancho real del texto. Pruebas: tests/avance-lineas-en-produccion.test.js y tests/visual/avance-imagen.html (capturas en docs/capturas-avance/).

Producción fuera de programación: Producción Actual, Inicio y los resúmenes en vivo separan las marcas con paletas pero sin fila de programación en el bloque. Esas marcas no entran a la secuencia, al estado ni al cumplimiento del plan. Se muestran aparte y suman a la producción física de la línea. Función pura: GlacialIndicadores.produccionPlanYFuera (45-indicadores.js). Detalle y causa: docs/PRODUCCION-FUERA-DE-PROGRAMACION.md. Pruebas: tests/fuera-de-programacion.test.js y tests/visual/fuera-de-programacion.html (capturas en docs/capturas-fuera-programacion/).

Calidad retirada: el indicador «Calidad» ya no existe en ninguna pantalla, imagen ni Excel (OEE = disponibilidad × rendimiento). Se conservan, aunque contengan la palabra: el campo «Botellas calidad» del registro (produccion.calidad), el motivo de parada «Calidad / producto no conforme», «Charla de Ingreso Sup. Calid.» y el cargo «Técnico de Calidad». Los registros ya guardados no se tocaron. Prueba: tests/sin-calidad.test.js.

Equipo que falló (Producción 2): texto en la parada (equipo), solo con causa/motivo «Falla de máquina»; no cambia minutos ni indicadores. Bitácora de Mantenimiento: columna, filtro, «Indicar equipo» (evento COMPLETAR_MOTIVO nuevo con motivoDetalle «Equipo: …») y tabla «Por equipo». Análisis de paradas: Pareto por equipo. Resumen de turno: equipo con más minutos de falla. Pruebas: tests/equipos.test.js. Sin cambios de reglas Firestore.

Entrega de turno (Producción 3): js/produccion/66-entrega-turno.js. Colección entregasTurno (un documento por fecha operativa y turno saliente). Crear: fecha, turno, estado ENTREGADA, resumen, novedades, entregaUid/Por/Nombre, entregadaEn. Corregir (solo quien entregó, mientras ENTREGADA): resumen, novedades, actualizadaEn, actualizaciones. Recibir (otro usuario): estado RECIBIDA, recibeUid/Por/Nombre, recibidaEn, observacionRecibe. Regla nueva en firestore.rules.etapa2.txt (bloque match /entregasTurno/{id}): hay que publicarla en Firebase; la equivalente de Supabase se aplica aparte. Pruebas: tests/entrega-turno.test.js. Módulo de modo consulta: entrega_turno (23b-modo-visualizacion.js).

Planificación etapa 4 (tiempos previstos): js/produccion/65b-planificacion-motor.js (cálculo puro de capacidad), 65a-planificacion-tiempos.js (reglas de preparación, ventanas de indisponibilidad, versión, auditoría y evaluaciones en sync/catalogoPlanificacion → tiempos), 65-planificacion-capacidad.js (panel, capacidad restante y traslado idempotente), 65c-planificacion-opciones.js («Ver opciones para completar») y 65d-planificacion-semanal.js (Vista semanal de carga). Sin colecciones ni reglas nuevas. Detalle en docs/planificacion-etapa4.md. Pruebas: tests/planificacion-etapa4-motor.test.js y tests/planificacion-etapa4.test.js.

Mantenimiento (intervenciones, evidencias, preventivos y equipos): js/mantenimiento/37d-equipos-maestro.js (catálogo de equipos en sync/configMantenimiento), 67-intervenciones-motor.js (motor puro), 67b-intervenciones-datos.js (persistencia por transacción, colección intervenciones), 67c-intervenciones-pantalla.js (pantalla), 67d-intervenciones-evidencias.js (fotos en Cloudinary), 67e-preventivos.js (colección planesPreventivos, avisos), 67f-indicadores-equipo.js (MTTR/MTBF por equipo). Detalle y límites en docs/mantenimiento-intervenciones.md. Reglas nuevas: firestore.rules.etapa2.txt; la migración aplicada en Supabase es supabase/migraciones/glacial_21_listas_partidas_mantenimiento.sql (docs/supabase-mantenimiento.sql quedó reemplazado, no ejecutar); ver docs/supabase-listas-partidas.md.
