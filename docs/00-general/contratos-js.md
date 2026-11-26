# GLACIAL · Contratos de los scripts globales

> **Documento generado** por `node scripts/generar-contratos.js` a partir de `index.html` y de `js/**`. No se edita a mano: el motivo de cada sobrescritura vive en `scripts/sobrescrituras-permitidas.json`. Vuelve a generarlo cuando añadas, muevas o renombres funciones globales (`node scripts/generar-contratos.js --verificar` dice si está al día).

La aplicación no usa módulos ES ni empaquetador: todo `<script>` comparte el ámbito global (`window`) y **el orden de carga de `index.html` es parte del código**. Este documento fija, por archivo, tres cosas: **qué expone**, **de qué otros archivos depende** y **qué funciones de otros archivos sobrescribe a propósito**. Complementa a `INDICE.md` (qué hace cada archivo) y a `docs/00-general/auditoria-js.md` (auditoría histórica).

## Cómo se valida (antes de cada push)

```
node tests/correr-todo.js           # incluye tests/carga-scripts.test.js (existencia, sobrescrituras y ?v=)
node scripts/validar-carga.js       # solo el chequeo de carga, con el detalle; compara contra origin/main
node scripts/validar-carga.js --base <commit>   # otra base de comparación para los ?v=
node scripts/validar-carga.js --sin-git         # sin la revisión de ?v= (existencia + sobrescrituras)
```

`scripts/validar-carga.js` falla (código 1) si:

1. Un `<script src>` / `<link href>` local de `index.html` no existe en disco, o un script se carga dos veces.
2. Un nombre global se redefine o se reasigna desde **otro archivo** y no está en la lista blanca `scripts/sobrescrituras-permitidas.json` (o su cadena de archivos cambió de orden). Un `let`/`const`/`class` repetido entre archivos es siempre error: el navegador no carga el segundo script.
3. Un archivo de `js/` o `css/` cambió respecto de la base de git y su `?v=` en `index.html` es el mismo (los celulares y tablets seguirían con la copia en caché). Formato: `?v=AAAAMMDD-xxx`.

### Cómo añadir una sobrescritura a propósito

1. Escribe la función nueva **guardando la anterior** (`const anterior = window.nombre; window.nombre = function(){ … anterior.apply(this, arguments); … }`) y cárgala DESPUÉS del archivo que la define.
2. Agrega la entrada a `scripts/sobrescrituras-permitidas.json`: `nombre`, `archivos` (en el orden de `index.html`) y un `motivo` real.
3. Sube el `?v=` de los archivos que tocaste, corre `node scripts/generar-contratos.js` y `node tests/correr-todo.js`.

## Resumen

- **199** scripts locales en `index.html` (más los de CDN) · **2196** nombres globales · **109** sobrescrituras permitidas entre archivos.
- Los números de orden de abajo son la **posición real de carga** (no el prefijo numérico del nombre: `15-` puede cargar antes que `14-`).
- Escrituras con nombre calculado que no se pueden resolver solas (revisar a mano si se tocan): `nucleo/00c-espacios-nombres.js`, `accesos/23b-modo-visualizacion.js`, `personal/40-tareo-auditoria.js`.

## Sobrescrituras intencionales

Gana siempre el **último** archivo de la cadena (el que carga después). «Asignación» = reasigna un global ya declarado; «envoltura» = lo reemplaza por una función que llama a la anterior.

### 1. Capas del Tareo (28)

Capas del Tareo: 13-tareo define la función base; los archivos posteriores la envuelven (permisos, bloqueo por plazo, Mantenimiento por técnico, maquinistas, exportaciones) y delegan en la anterior.

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `_tareoColaGuardado` | `13-tareo` → `45-tareo-edicion-continua` |
| `_tareoEscriturasPendientes` | `13-tareo` → `45-tareo-edicion-continua` |
| `eliminarTareo` | `13-tareo` → `40-tareo-auditoria` |
| `exportarTareoExcel` | `13-tareo` → `27-rrhh-excel-operativo` → `38-tareo-rrhh-exportacion` |
| `exportarTareoGeneralExcel` | `13-tareo` → `27-rrhh-excel-operativo` → `38-tareo-rrhh-exportacion` |
| `exportarTareoPNG` | `13-tareo` → `38-tareo-rrhh-exportacion` |
| `guardarTareoActual` | `13-tareo` → `34-integraciones` |
| `guardarTareoEnMemoria` | `13-tareo` → `37f-tareo-por-tecnico` → `40-tareo-auditoria` → `41-tareo-bloqueo` |
| `guardarTareos` | `13-tareo` → `37f-tareo-por-tecnico` |
| `obtenerResumenMensualTareo` | `13-tareo` → `37f-tareo-por-tecnico` |
| `obtenerTareos` | `13-tareo` → `37f-tareo-por-tecnico` |
| `renderTareoFormulario` | `13-tareo` → `28-tareo-maquinistas` → `37f-tareo-por-tecnico` → `28b-maquinistas-mantenimiento` → `41-tareo-bloqueo` |
| `renderTareoGeneral` | `13-tareo` → `38-tareo-rrhh-exportacion` |
| `renderTareoLectura` | `13-tareo` → `28-tareo-maquinistas` → `37f-tareo-por-tecnico` → `28b-maquinistas-mantenimiento` → `41-tareo-bloqueo` |
| `sheetsReenviarTareo` | `34-integraciones` → `38-tareo-rrhh-exportacion` |
| `tareoAbrirAgregarPersonal` | `13-tareo` → `42-tareo-agregar-personal` |
| `tareoAgregarPersonal` | `13-tareo` → `42-tareo-agregar-personal` |
| `tareoAreaVista` | `04-sidebar` → `18-mantenimiento` → `13-tareo` |
| `tareoAutorizadoEscribir` | `13-tareo` → `41-tareo-bloqueo` |
| `tareoCargoPermitido` | `13-tareo` → `28-tareo-maquinistas` |
| `tareoEditarPersona` | `13-tareo` → `28-tareo-maquinistas` |
| `tareoEditarSalidaMaquinista` | `13-tareo` → `41-tareo-bloqueo` |
| `tareoGuardarEnNube` | `13-tareo` → `37f-tareo-por-tecnico` |
| `tareoGuardarSalidaMaquinista` | `13-tareo` → `41-tareo-bloqueo` |
| `tareoPuedeEditar` | `13-tareo` → `41-tareo-bloqueo` |
| `tareoPuedeExportar` | `13-tareo` → `41-tareo-bloqueo` |
| `tareoRenderTabs` | `13-tareo` → `20-tareo-control` → `26-rrhh-panel` → `30-rotacion-mantenimiento` → `33-rotacion-maquinistas` → `37b-mantenimiento-identificacion` → `37c-equipos-catalogo` → `37e-motivos-parada` → `38-tareo-rrhh-exportacion` → `41-tareo-bloqueo` → `44-estado-datos` |
| `wspEnviarTareo` | `34-integraciones` → `38-tareo-rrhh-exportacion` |

### 2. Capa de permisos (19)

Capa de permisos: 23b-modo-visualizacion (y, según el caso, 23-gerente-solo-lectura, 37-mantenimiento-tecnicos, 103-almacen-compartido o el archivo de permisos de su módulo) guarda la función anterior, la reasigna y delega en ella; el módulo que carga después añade su regla sin reescribir la original.

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `_avisarErrorGuardado` | `02-estado` → `23b-modo-visualizacion` |
| `abrirCentroPerfil` | `04-sidebar` → `37-mantenimiento-tecnicos` → `103-almacen-compartido` |
| `cambiarRolNuevoUsuario` | `10-usuarios` → `23-gerente-solo-lectura` → `37-mantenimiento-tecnicos` → `103-almacen-compartido` |
| `editarPermisosUsuario` | `10-usuarios` → `10b-modo-visualizacion-form` → `10c-impacto-economico-permisos` |
| `esUsuarioSoloConsulta` | `02-estado` → `23b-modo-visualizacion` |
| `guardarPermisosUsuario` | `10-usuarios` → `10b-modo-visualizacion-form` |
| `normalizarPermisosUsuario` | `02-estado` → `23-gerente-solo-lectura` → `23b-modo-visualizacion` → `37-mantenimiento-tecnicos` → `103-almacen-compartido` |
| `permisoNavegacion` | `04-sidebar` → `23b-modo-visualizacion` |
| `permisoPestanaLinea` | `06-registro` → `23b-modo-visualizacion` |
| `primeraVistaAutorizada` | `04-sidebar` → `23b-modo-visualizacion` |
| `puedeAccederPaletas` | `06-registro` → `23b-modo-visualizacion` |
| `puedeEntrarMantenimiento` | `02-estado` → `23b-modo-visualizacion` |
| `puedeEntrarPlanificacion` | `04-sidebar` → `23b-modo-visualizacion` |
| `puedeEntrarTareoProduccion` | `02-estado` → `23b-modo-visualizacion` |
| `puedeProgramarPaletas` | `06-registro` → `23-gerente-solo-lectura` |
| `rolTieneTodosLosPermisos` | `10-usuarios` → `23-gerente-solo-lectura` |
| `selectLine` | `04-sidebar` → `23b-modo-visualizacion` |
| `tienePermiso` | `02-estado` → `23b-modo-visualizacion` → `24-semaforo-produccion-actual` → `71-asistente-datos` → `75-inventario-insumos-datos` → `98-calidad-permisos` |
| `visibleLines` | `04-sidebar` → `23b-modo-visualizacion` |

### 3. Enganche en cadena (11)

Enganche en cadena: cada módulo guarda la versión anterior, la reasigna para añadir su pantalla/comportamiento y llama a la anterior. El orden de carga en index.html define el orden de la cadena.

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `ajustarVistaSegunPermisos` | `04-sidebar` → `23b-modo-visualizacion` → `43-bitacora-mantenimiento` → `47-analisis-paradas` → `48-resumen-turno` → `52b-planificacion-vistas` → `66-entrega-turno` → `67c-intervenciones-pantalla` → `69-velocidades-estandar` → `75-programa-semanal-pantalla` → `76-registro-pantalla` → `78-historial-pantalla` → `73-plan-anual-pantalla` → `68-mantenimiento-inicio` → `67-produccion-inicio` → `72-asistente-pantalla` → `76-inventario-insumos-pantalla` → `100-calidad-pantalla` → `101-producto-terminado` → `103-almacen-compartido` → `111-admin-acceso-datos` |
| `grupoSidebarActivo` | `04-sidebar` → `43-bitacora-mantenimiento` → `47-analisis-paradas` → `48-resumen-turno` → `66-entrega-turno` → `67c-intervenciones-pantalla` |
| `renderCentroPerfil` | `32-dashboard-perfiles` → `43-bitacora-mantenimiento` → `44-estado-datos` → `46-proyeccion-avisos` → `47-analisis-paradas` → `66-entrega-turno` → `98-hielo-inicio` |
| `renderFormTab` | `06-registro` → `17-modo-trabajo` → `21-programacion-turno` → `35-autollenado-registro` → `35c-autollenado-completo` |
| `renderMain` | `06-registro` → `17-modo-trabajo` → `21-programacion-turno` → `23b-modo-visualizacion` → `43-bitacora-mantenimiento` → `47-analisis-paradas` → `48-resumen-turno` → `52b-planificacion-vistas` → `66-entrega-turno` → `67c-intervenciones-pantalla` → `69-velocidades-estandar` → `75-programa-semanal-pantalla` → `76-registro-pantalla` → `78-historial-pantalla` → `73-plan-anual-pantalla` → `68-mantenimiento-inicio` → `67-produccion-inicio` → `72-asistente-pantalla` → `76-inventario-insumos-pantalla` → `100-calidad-pantalla` → `101-producto-terminado` → `103-almacen-compartido` → `111-admin-acceso-datos` |
| `renderMantenimientoModulo` | `18-mantenimiento` → `30-rotacion-mantenimiento` |
| `renderPaletasTab` | `16-paletas` → `21-programacion-turno` → `16c-saldo-entrega` → `16e-paletas-rapido` |
| `renderProduccionActualTab` | `16-paletas` → `24-semaforo-produccion-actual` → `44-estado-datos` |
| `renderRRHHModulo` | `19-rrhh` → `26-rrhh-panel` |
| `renderRotacionSupervisores` | `31-rotacion-supervisores` → `17c-ampliaciones-turno` |
| `renderSidebar` | `04-sidebar` → `23b-modo-visualizacion` → `37-mantenimiento-tecnicos` → `37b-mantenimiento-identificacion` → `43-bitacora-mantenimiento` → `47-analisis-paradas` → `48-resumen-turno` → `52b-planificacion-vistas` → `66-entrega-turno` → `67c-intervenciones-pantalla` → `69-velocidades-estandar` → `75-programa-semanal-pantalla` → `78-historial-pantalla` → `73-plan-anual-pantalla` → `68-mantenimiento-inicio` → `67-produccion-inicio` → `72-asistente-pantalla` → `76-inventario-insumos-pantalla` → `100-calidad-pantalla` → `101-producto-terminado` → `103-almacen-compartido` → `111-admin-acceso-datos` → `39-vista-como` |

### 4. Bloqueo de escritura (10)

Bloqueo de escritura: 23-gerente-solo-lectura (rol de consulta) y 23b-modo-visualizacion (modo visualización) envuelven los save* para impedir guardados; la original de 02-estado sigue siendo la que escribe cuando está permitido.

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `saveDraft` | `06-registro` → `17-modo-trabajo` |
| `savePaletas` | `02-estado` → `23-gerente-solo-lectura` → `23b-modo-visualizacion` |
| `saveProgramaciones` | `02-estado` → `23-gerente-solo-lectura` → `23b-modo-visualizacion` |
| `saveRecords` | `02-estado` → `23-gerente-solo-lectura` → `23b-modo-visualizacion` |
| `saveRotacionMaquinistas` | `02-estado` → `23b-modo-visualizacion` |
| `saveRotaciones` | `02-estado` → `23-gerente-solo-lectura` → `23b-modo-visualizacion` |
| `saveRotacionesMantenimiento` | `02-estado` → `23b-modo-visualizacion` |
| `saveTareos` | `02-estado` → `13-tareo` → `23-gerente-solo-lectura` → `23b-modo-visualizacion` |
| `saveUsers` | `02-estado` → `23-gerente-solo-lectura` → `23b-modo-visualizacion` → `36-seguridad-auth` |
| `saveWorkers` | `02-estado` → `23-gerente-solo-lectura` → `23b-modo-visualizacion` |

### 5. 49-resumen-indicadores reemplaza/envuelve funciones del Resumen de 09-resumen para usar… (9)

49-resumen-indicadores reemplaza/envuelve funciones del Resumen de 09-resumen para usar el módulo único de indicadores (45-indicadores).

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `calcularKPIsPlanta` | `09-resumen` → `49-resumen-indicadores` |
| `fechaHoyResumen` | `09-resumen` → `49-resumen-indicadores` |
| `filtrarPorRangoResumen` | `09-resumen` → `49-resumen-indicadores` |
| `obtenerRatioNominal` | `01-config` → `49-resumen-indicadores` |
| `renderResumen` | `09-resumen` → `49-resumen-indicadores` → `49b-resumen-graficos-diferidos` |
| `resumenFiltroLinea` | `09-resumen` → `49-resumen-indicadores` |
| `resumenRangoDias` | `09-resumen` → `49-resumen-indicadores` |
| `rsFechaEnRango` | `09-resumen` → `49-resumen-indicadores` |
| `xlgHojaDatos` | `14-exportar-general` → `49-resumen-indicadores` |

### 6. Variable global compartida (5)

Variable global compartida: se declara en el primer archivo y los posteriores la reasignan directamente (estado de pantalla o caché), sin redeclararla.

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `_paletasCache` | `02-estado` → `16-paletas` → `16e-paletas-rapido` |
| `_programacionesCache` | `02-estado` → `16-paletas` → `24-semaforo-produccion-actual` → `16e-paletas-rapido` |
| `draft` | `02-estado` → `04-sidebar` → `17-modo-trabajo` → `23b-modo-visualizacion` |
| `produccionActualFecha` | `16-paletas` → `24-semaforo-produccion-actual` |
| `produccionActualTurno` | `16-paletas` → `24-semaforo-produccion-actual` |

### 7. Cadena de ganchos de actualización en vivo (02-estado los llama al llegar datos) (5)

Cadena de ganchos de actualización en vivo (02-estado los llama al llegar datos): cada módulo conserva el anterior, ejecuta el suyo después y refresca su pantalla.

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `onPaletasUpdated` | `02-estado` → `32-dashboard-perfiles` → `35-autollenado-registro` → `46-proyeccion-avisos` → `48-resumen-turno` → `49-resumen-indicadores` → `72-asistente-pantalla` → `101-producto-terminado` |
| `onProgramacionesUpdated` | `02-estado` → `21-programacion-turno` → `25-alertas-lineas` → `32-dashboard-perfiles` → `35-autollenado-registro` → `46-proyeccion-avisos` → `47-analisis-paradas` → `48-resumen-turno` → `49-resumen-indicadores` → `66p-planificacion-modos` → `67h-reclasificacion-pantalla` → `70-banco-paradas` → `72-asistente-pantalla` |
| `onRecordsUpdated` | `02-estado` → `06-registro` → `47-analisis-paradas` → `48-resumen-turno` → `49-resumen-indicadores` → `66p-planificacion-modos` → `67h-reclasificacion-pantalla` → `70-banco-paradas` |
| `onTareosUpdated` | `02-estado` → `46-tareo-horas-extras` → `26-rrhh-panel` → `40-tareo-auditoria` → `46-proyeccion-avisos` → `48-resumen-turno` |
| `onUsersUpdated` | `02-estado` → `23b-modo-visualizacion` → `25-alertas-lineas` → `111-admin-acceso-datos` |

### 8. 35c-autollenado-completo reemplaza esta función de 06-registro (autollenado completo de… (4)

35c-autollenado-completo reemplaza esta función de 06-registro (autollenado completo del Nuevo registro); la versión de 06 queda como respaldo.

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `cuadro1DesdeProgramacion` | `06-registro` → `35c-autollenado-completo` |
| `destinoFaltanteRegistro` | `06-registro` → `35c-autollenado-completo` |
| `updateMermaCuadro` | `06-registro` → `35c-autollenado-completo` |
| `validarReporteParaFinalizar` | `06-registro` → `35c-autollenado-completo` |

### 9. Variable global de Paletas que 16e-paletas-rapido reasigna al guardar (nuevo borrador t… (3)

Variable global de Paletas que 16e-paletas-rapido reasigna al guardar (nuevo borrador tras guardar, candado de guardado, caché tras subir la cola): estado compartido, sin redeclararlo.

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `_guardandoPaleta` | `16-paletas` → `16e-paletas-rapido` |
| `draftPaleta` | `16-paletas` → `16e-paletas-rapido` |
| `paletaEditId` | `16-paletas` → `16e-paletas-rapido` |

### 10. DUPLICADO REAL (2)

DUPLICADO REAL: la misma función está declarada en 02-estado y en 10-usuarios; gana la de 10-usuarios (carga después). Pendiente unificar en una sola.

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `actualizarEstadoTodosLosPermisos` | `02-estado` → `10-usuarios` |
| `cambiarTodosLosPermisos` | `02-estado` → `10-usuarios` |

### 11. Módulos posteriores (48-resumen-turno, 43-bitacora-mantenimiento) envuelven la generaci… (2)

Módulos posteriores (48-resumen-turno, 43-bitacora-mantenimiento) envuelven la generación del cierre de turno de 29-avance-produccion para registrar el resumen/bitácora al cerrar.

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `avGenerar` | `29-avance-produccion` → `48-resumen-turno` |
| `avGenerarCierreAhora` | `29-avance-produccion` → `43-bitacora-mantenimiento` |

### 12. Enganche de ciclo de sesión (2)

Enganche de ciclo de sesión: varios módulos se suman al inicio/cierre de sesión (alertas, identificación de técnico, bloqueo de tareo, vista como…) guardando la función anterior y llamándola.

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `enterApp` | `03-auth` → `17-modo-trabajo` → `25-alertas-lineas` → `37b-mantenimiento-identificacion` → `41-tareo-bloqueo` → `103-almacen-compartido` → `113-admin-config` |
| `handleLogout` | `03-auth` → `25-alertas-lineas` → `37b-mantenimiento-identificacion` → `41-tareo-bloqueo` → `46-proyeccion-avisos` → `47-analisis-paradas` → `48-resumen-turno` → `66-entrega-turno` → `39-vista-como` |

### 13. 24-semaforo-produccion-actual reemplaza esta función de 16-paletas con la versión que e… (2)

24-semaforo-produccion-actual reemplaza esta función de 16-paletas con la versión que entiende combinaciones de turnos y producción actual.

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `resumenProgramacionCombinacionTurnos` | `16-paletas` → `24-semaforo-produccion-actual` |
| `unidadesPorPaletaActiva` | `16-paletas` → `24-semaforo-produccion-actual` |

### 14. 16e-paletas-rapido envuelve el cambio de campos del formulario solo para anotar que el … (1)

16e-paletas-rapido envuelve el cambio de campos del formulario solo para anotar que el operario eligió marca/presentación a mano (la secuencia deja de cambiarlas en esa fecha/turno/línea).

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `actualizarPaletaCampoYRerenderizar` | `16-paletas` → `16e-paletas-rapido` |

### 15. 16e-paletas-rapido envuelve el refresco en vivo de Paletas para repintar también la bar… (1)

16e-paletas-rapido envuelve el refresco en vivo de Paletas para repintar también la barra (acumulado, último registro, estado de sincronización).

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `actualizarVistaPaletas` | `16-paletas` → `16e-paletas-rapido` |

### 16. Cada etapa del Panel de administración (114, 115, 116) reasigna admIr para añadir sus p… (1)

Cada etapa del Panel de administración (114, 115, 116) reasigna admIr para añadir sus pestañas y delega en la anterior.

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `admIr` | `112-admin-pantalla` → `114-admin-etapa2` → `115-admin-etapa3` → `116-admin-etapa4` |

### 17. 16e-paletas-rapido envuelve el alta de tramos (1)

16e-paletas-rapido envuelve el alta de tramos: tras agregar uno, si el tramo anterior no tenía hora de corte ofrece cortarlo a la hora actual (corteAutomatico).

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `agregarTramoSecuenciaDesdeFormulario` | `16-paletas` → `16e-paletas-rapido` |

### 18. 97-hielo reemplaza el acceso al Reporte Hielo que 03-auth declaró como marcador (el mód… (1)

97-hielo reemplaza el acceso al Reporte Hielo que 03-auth declaró como marcador (el módulo Hielo carga después).

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `goReporteHielo` | `03-auth` → `97-hielo` |

### 19. 16e-paletas-rapido envuelve guardarPaleta (1)

16e-paletas-rapido envuelve guardarPaleta: un registro NUEVO se guarda por la cola sin conexión (clientEventId + capturadoEn, reenvío sin duplicar); editar un registro existente delega en la versión anterior, directa y en línea.

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `guardarPaleta` | `16-paletas` → `16e-paletas-rapido` |

### 20. Enganche: 16f-cierre-marcas añade el panel «Cierre de turno» (cierre progresivo de marc… (1)

Enganche: 16f-cierre-marcas añade el panel «Cierre de turno» (cierre progresivo de marcas) debajo de la Secuencia del turno y llama a la versión anterior.

| Nombre | Cadena de carga (primero define, el resto sobrescribe) |
|---|---|
| `htmlSecuenciaTurnoPaletas` | `16-paletas` → `16f-cierre-marcas` |

## Hallazgos de la revisión (26/11/2026)

1. **Declaración duplicada real**: `actualizarEstadoTodosLosPermisos` y `cambiarTodosLosPermisos` están declaradas con `function` en `02-estado.js` y otra vez en `10-usuarios.js`. Gana `10-usuarios.js` (carga después); la de `02-estado.js` nunca se ejecuta. Pendiente unificar.
2. **Reasignación antes de la declaración**: `tareoAreaVista` se reasigna en `04-sidebar` (carga 14) pero se declara en `13-tareo` (carga 35). Funciona porque la reasignación ocurre dentro de funciones que se llaman después de cargar todo; no la muevas a código que corra al cargar.
3. **Funciones que cuelgan de muchos módulos** (cadenas largas, cada módulo se engancha al anterior): `renderMain` (23 archivos), `renderSidebar` (23 archivos), `ajustarVistaSegunPermisos` (21 archivos), `onProgramacionesUpdated` (13 archivos), `tareoRenderTabs` (11 archivos), `handleLogout` (9 archivos), `onPaletasUpdated` (8 archivos), `onRecordsUpdated` (8 archivos). Son los puntos más frágiles ante un cambio de orden en `index.html`.
4. **Funciones con nombre genérico declaradas globalmente** (riesgo de colisión futura): `inp` (produccion/06-registro.js), `sel` (produccion/06-registro.js), `num` (nucleo/05-utils.js), `pct` (nucleo/05-utils.js). Las demás copias son locales y no chocan; no las promuevas a global.
5. **Reemplazos de funciones del navegador** (afectan a toda la página, están en `nativos` de la lista blanca): `Date` en `01b-fecha-operativa`, `print` en `23b-modo-visualizacion`, `open` en `23b-modo-visualizacion`, `fetch` en `39-vista-como`. Cualquier otro `window.<nombre del navegador> = …` nuevo hace fallar `validar-carga.js`.
6. **`?v=` con formato fuera de patrón**: `18-mantenimiento.js` (`20261002-tareo-permisos-1`) y `39-vista-como.js` (`20261003-vista-1`) tienen sufijos con guiones; se aceptan. `19-rrhh.js` se carga **sin `?v=`** (está en la lista de excepciones): sus cambios no invalidan la caché del celular hasta que se le ponga uno.

## Espacios de nombres (`window.Glacial.<Area>`)

`js/nucleo/00c-espacios-nombres.js` (carga antes de `01-config.js`) crea `window.Glacial` con:

| Función | Para qué |
|---|---|
| `Glacial.exponer(area, miembros, {alias})` | Cuelga `miembros` de `Glacial.<Area>` y, si se pide, deja el nombre global de siempre como **alias a la misma función** (`alias:true`, `alias:['a','b']` o `alias:{globalViejo:'miembroNuevo'}`). Si el nombre global ya existe y es otro valor, no lo pisa: lo anota en `Glacial.conflictos()`. |
| `Glacial.definirArea(nombre)` | Crea el área vacía (PascalCase). |
| `Glacial.areas()` / `Glacial.conflictos()` | Diagnóstico desde la consola. |

**Estado de la migración (piloto):** `Glacial.Fecha` = `window.GlacialFecha` (`js/nucleo/01b-fecha-operativa.js`, módulo puro). El global `GlacialFecha` sigue existiendo; cualquier llamada actual funciona igual.

**Plan incremental (sin romper compatibilidad):**

1. *Hecho*: base `Glacial` + piloto `Fecha`.
2. Módulos puros que ya cuelgan de un objeto global propio (`GlacialIndicadores`, `glacialHieloDatos`, `glacialAsistenteUI`…): añadir una línea `Glacial.exponer(...)` al final de cada archivo, sin tocar el resto.
3. Funciones sueltas de un área (p. ej. `tareo*`): reunirlas en `Glacial.Tareo` con `alias:true` y, cuando se usen solo desde el área, empezar a llamarlas por el espacio de nombres en el código **nuevo**.
4. Solo cuando ningún archivo use el alias global (se comprueba con `node scripts/analizar-globales.js`) se puede retirar el alias. Nada de esto exige cambiar el orden de carga.

## Contrato por archivo (en orden de carga)

Leyenda: **Expone** = nombres globales que define el archivo (`ƒ` función, `v` variable/constante, `w` asignada a `window`; `_x` son privados por convención y solo se cuentan). **Depende de** = otros archivos que definen nombres que este usa, con el número de nombres entre paréntesis; **⚠ carga después** marca los que se cargan *después* de este (válido solo si se usan dentro de funciones llamadas tras el arranque). **Sobrescribe** = nombres de otros archivos que reasigna a propósito (ver lista de arriba). Es un análisis estático: una dependencia puede ser un falso positivo si un nombre coincide con una variable local.

### Núcleo · `js/nucleo/`

| # | Archivo (`?v=`) | Propósito | Expone | Depende de | Sobrescribe |
|---|---|---|---|---|---|
| 1 | `00b-puente-supabase` <sub>20261112-cl1</sub> | GLACIAL · PUENTE DE COMPATIBILIDAD  Firebase → Supabase — La página sigue usando `firebase`, `db` y `auth` como siempre. Este archivo define esos | `glacialSupabaseCliente`w `firebase`w · 1 _priv | `36-seguridad-auth`(1) ⚠, `102-almaceneros-pin`(1) ⚠ | — |
| 2 | `03-actualizacion` <sub>20261113-ac2</sub> | GLACIAL · aviso «HAY UNA ACTUALIZACIÓN NUEVA» — Cada vez que se publica una versión nueva, todas las páginas abiertas lo avisan para que actualicen. | `glacialActualizacion`w | `06-registro`(2) ⚠ | — |
| 3 | `00c-espacios-nombres` <sub>20261126-ns1</sub> | GLACIAL · ESPACIOS DE NOMBRES LIGEROS · window.Glacial.<Area> | `Glacial`w | — | — |
| 4 | `01-config` <sub>20261121-hc2</sub> | CONFIGURACIÓN Y LISTAS MAESTRAS (Firebase, líneas, marcas, ratios) | `normalizarPresentacionRegular`ƒ `obtenerRatioNominal`ƒ `posicionesPersonalLinea`ƒ `obtenerItemsMerma`ƒ `mermaConfigVigente`ƒ `mermaConversionFisica`ƒ `mermaDivisor`ƒ … +46 · 2 _priv | `00b-puente-supabase`(1), `05-utils`(1) ⚠, `95-conversiones`(1) ⚠ | — |
| 5 | `01b-fecha-operativa` <sub>20261126-ns1</sub> | GLACIAL · FECHA OPERATIVA — UNA SOLA FUENTE DE VERDAD — // FECHA-OPERATIVA: reglas de negocio (America/Lima, UTC-5, sin horario de verano; NUNCA UT… | `glacialSimulacionOffsetMs`w `Date`w `GlacialFecha`w | `41-tareo-bloqueo`(1) ⚠ | — |
| 6 | `04b-busqueda` <sub>20261121-bq2</sub> | GLACIAL · Búsqueda de texto común — Una sola regla para todos los buscadores de la página, para que «preforma 13», «bolsa 3 kg», «Maria Perez» o «p… | `glacialBusqueda`w | — | — |
| 7 | `45-indicadores` <sub>20261105-rc2</sub> | MÓDULO ÚNICO DE INDICADORES (funciones puras) | `loadRecordsOficiales`ƒ `GlacialIndicadores`w | `01b-fecha-operativa`(1), `02-estado`(1) ⚠ | — |
| 8 | `46-vista-excel` <sub>20261125-pt14</sub> | GLACIAL · VISTA PREVIA EN EXCEL — Muestra un libro de ExcelJS tal como se verá en Excel, sin descargarlo: pestañas de hojas abajo (con su color), l… | `glacialVistaExcel`w | — | — |
| 9 | `45b-velocidades-vigencia` <sub>20261030-ve1</sub> | VELOCIDAD ESTÁNDAR CON VIGENCIA E HISTORIAL (funciones puras) | `GlacialVelocidades`w | — | — |
| 10 | `02b-permisos-hielo` <sub>20261121-ph2</sub> | GLACIAL · PERMISOS DE HIELO — Una sola definición de «quién puede hacer qué» en Hielo, para la pantalla de Hielo, la gestión de usuarios y el Panel… | `glacialPermisosHielo`w | — | — |
| 11 | `02-estado` <sub>20261121-ad2</sub> | ESTADO DE LA APP, ALMACENAMIENTO LOCAL/FIRESTORE Y PERMISOS | `htmlPermisosPorArea`ƒ `actualizarCuentaPermisos`ƒ `marcarAreaPermisos`ƒ `esUsuarioSoloConsulta`ƒ `minutosHoraTurno`ƒ `clasificarTurnoPorHorario`ƒ `fechaLocalISO`ƒ … +61 · 22 _priv | `01-config`(4), `04-sidebar`(1) ⚠, `05-utils`(1) ⚠, `06-registro`(1) ⚠, `10-usuarios`(1) ⚠, `11-trabajadores`(1) ⚠, `16-paletas`(2) ⚠, `13n-tareo-nube`(1) ⚠ … +18 | — |
| 14 | `04-sidebar` <sub>20261117-ad1</sub> | BETTER COMMENTS · SIDEBAR GLACIAL | `sidebarSvg`ƒ `sidebarChevronSvg`ƒ `refinarIconosSidebar`ƒ `visibleLines`ƒ `lineasConsultables`ƒ `puedeVerLineasProduccion`ƒ `permisoNavegacion`ƒ … +29 | `01-config`(1), `02-estado`(7), `06-registro`(1) ⚠, `13-tareo`(7) ⚠, `23b-modo-visualizacion`(3) ⚠, `37-mantenimiento-tecnicos`(1) ⚠, `38-tareo-rrhh-exportacion`(1) ⚠, `71-asistente-datos`(1) ⚠ … +2 | `draft` |
| 15 | `05-utils` <sub>20261015-fc1</sub> | UTILIDADES (fechas, turnos, lotes, códigos, cajas) | `num`ƒ `pct`ƒ `obtenerDiaDelA`ƒ `normalizarTexto`ƒ `obtenerCodigoTurno`ƒ `calcularHorasTurno`ƒ `obtenerSemana`ƒ … +46 | `02-estado`(1), `71-asistente-datos`(1) ⚠ | — |
| 70 | `34-integraciones` <sub>20261011-av1</sub> | GLACIAL · INTEGRACIONES: GOOGLE SHEETS Y WHATSAPP — Sin servidor y sin tocar Firebase. | `sheetsPendiente`w `sheetsCantidadPendientes`w `enviarASheets`w `sheetsEnviarTareo`w `sheetsReenviarTareo`w `sheetsEnviarCierre`w `sheetsReenviarCierre`w … +4 | `01-config`(2), `13-tareo`(17), `29a-avances-items`(1), `29-avance-produccion`(1), `37f-tareo-por-tecnico`(1) ⚠, `41-tareo-bloqueo`(2) ⚠ | `guardarTareoActual` |
| 88 | `44-estado-datos` <sub>20261004-b1</sub> | «ACTUALIZADO A LAS HH:MM» · estado de los datos en vivo | `glacialEstadoDatos`w `tareoRenderTabs`w `renderProduccionActualTab`w `renderCentroPerfil`w | `01-config`(1), `02-estado`(1), `16-paletas`(1), `13-tareo`(1), `20-tareo-control`(1), `30-rotacion-mantenimiento`(1), `33-rotacion-maquinistas`(1), `32-dashboard-perfiles`(1) … +10 | `renderCentroPerfil` `renderProduccionActualTab` `tareoRenderTabs` |
| 196 | `12b-barras-desplazamiento` <sub>20261121-bs3</sub> | GLACIAL · BARRAS DE DESPLAZAMIENTO HORIZONTAL VISIBLES EN TODA LA APP |  · 1 _priv | — | — |
| 197 | `12c-tablas-movil` <sub>20261121-tm2</sub> | GLACIAL · TABLAS ANCHAS EN TELÉFONO Y TABLET — En pantallas angostas la página recorta lo que se sale por la derecha (html/body con overflow-x:hidd… | `glacialTablasMovil`w | — | — |
| 198 | `12-init` <sub>20261003-seguridad</sub> | CERRAR MODAL E INICIALIZACIÓN DE LA APP | `closeModal`ƒ | `01-config`(1), `02-estado`(1), `03-auth`(1) | — |

### Accesos · `js/accesos/`

| # | Archivo (`?v=`) | Propósito | Expone | Depende de | Sobrescribe |
|---|---|---|---|---|---|
| 12 | `03-auth` <sub>20261112-gr1</sub> | SESIÓN, LOGIN/LOGOUT Y SELECCIÓN DE TIPO DE REPORTE | `handleLogin`ƒ `migrarUsuarioAPasswordSeguro`ƒ `handleLogout`ƒ `goReporteAgua`ƒ `goReporteHielo`ƒ `goReportSelect`ƒ `leerContextoSesion`ƒ … +12 · 2 _priv | `01-config`(4), `02-estado`(10), `04-sidebar`(1) ⚠, `05-utils`(3) ⚠, `06-registro`(1) ⚠, `13-tareo`(1) ⚠, `23b-modo-visualizacion`(3) ⚠, `31-rotacion-supervisores`(1) ⚠ … +7 | — |
| 13 | `03b-login-carrusel` <sub>20261114-lg1</sub> | Login · carrusel de la izquierda (css/login-glacial.css). Texto fijo: no lee datos de planta ni de usuarios. | — | — | — |
| 24 | `10-usuarios` <sub>20261125-pw1</sub> | GESTIÓN DE USUARIOS | `rolTieneTodosLosPermisos`ƒ `openUsersModal`ƒ `cambiarRolNuevoUsuario`ƒ `mostrarAvisoPermisosAutomaticos`ƒ `quitarAvisoPermisosAutomaticos`ƒ `renderUserList`ƒ `toggleLineaField`ƒ … +9 | `01-config`(1), `02b-permisos-hielo`(1), `02-estado`(12), `05-utils`(1), `10d-whatsapp-usuario`(1) ⚠, `23b-modo-visualizacion`(1) ⚠, `36-seguridad-auth`(7) ⚠, `113-admin-config`(1) ⚠ | `actualizarEstadoTodosLosPermisos` `cambiarTodosLosPermisos` |
| 25 | `10d-whatsapp-usuario` <sub>20261125-pw1</sub> | GESTIÓN DE USUARIOS · NÚMERO DE WHATSAPP | `normalizarWhatsappUsuario`w `puedeEditarWhatsappUsuario`w `editarWhatsappUsuario`w | `02-estado`(4), `10-usuarios`(1), `36-seguridad-auth`(2) ⚠ | — |
| 26 | `10b-modo-visualizacion-form` <sub>20261121-pal3</sub> | GLACIAL · FORMULARIO «MODO VISUALIZACIÓN GENERAL» (Gestionar usuarios → Editar permisos) | `vistaAlternarModo`w `vistaMarcarTodos`w `editarPermisosUsuario`w `guardarPermisosUsuario`w | `02b-permisos-hielo`(1), `02-estado`(7), `10-usuarios`(3), `23b-modo-visualizacion`(1) ⚠, `36-seguridad-auth`(1) ⚠, `10c-impacto-economico-permisos`(1) ⚠ | `editarPermisosUsuario` `guardarPermisosUsuario` |
| 29 | `17b-ventana-supervisor` <sub>20261021-vs2</sub> | GLACIAL · VENTANA DE TRABAJO DEL SUPERVISOR — Decide, con la hora del SERVIDOR (hora de Lima), si un supervisor puede usar el modo TRABAJAR en este… | `glacialVentanaSupervisor`w | `01-config`(2), `01b-fecha-operativa`(1), `02-estado`(4), `31-rotacion-supervisores`(2) ⚠, `41-tareo-bloqueo`(1) ⚠, `51b-horarios-produccion`(1) ⚠ | — |
| 30 | `17-modo-trabajo` <sub>20261112-op1</sub> | MODO VISUALIZAR / TRABAJAR · CRONÓMETRO DE TURNO · | `obtenerTurnoActual`ƒ `esSupervisorParaCronometro`ƒ `iniciarCronometroTurno`ƒ `detenerCronometroTurno`ƒ `renderCronometroVentana`ƒ `renderCronometroTurno`ƒ `esModoSoloLectura`ƒ … +16 · 27 _priv | `01-config`(1), `45-indicadores`(1), `02-estado`(5), `03-auth`(1), `05-utils`(1), `06-registro`(5), `17b-ventana-supervisor`(1), `23b-modo-visualizacion`(2) ⚠ … +6 | `draft` `enterApp` `renderFormTab` `renderMain` `saveDraft` |
| 42 | `23-gerente-solo-lectura` <sub>20261018-ord2</sub> | GLACIAL: Jefatura y Gerencia en modo de consulta. | `esGerenteSoloLectura`w | `02-estado`(5), `06-registro`(1), `10-usuarios`(2), `23b-modo-visualizacion`(2) ⚠, `37-mantenimiento-tecnicos`(1) ⚠, `103-almacen-compartido`(1) ⚠ | `cambiarRolNuevoUsuario` `normalizarPermisosUsuario` `puedeProgramarPaletas` `rolTieneTodosLosPermisos` `savePaletas` `saveProgramaciones` … +5 |
| 43 | `23b-modo-visualizacion` <sub>20261102-pal2</sub> | GLACIAL · MODO VISUALIZACIÓN GENERAL (por usuario) — El Administrador activa este modo a una cuenta concreta (Jefatura, Gerencia o cualquiera), eli… | `normalizarPermisosUsuario`w `esUsuarioSoloConsulta`w `tienePermiso`w `selectLine`w `renderMain`w `renderSidebar`w `glacialLineasPermitidas`w … +5 | `00b-puente-supabase`(1), `01-config`(1), `02-estado`(9), `04-sidebar`(8), `06-registro`(3), `13-tareo`(1), `29-avance-produccion`(1) ⚠, `37-mantenimiento-tecnicos`(1) ⚠ … +6 | `_avisarErrorGuardado` `ajustarVistaSegunPermisos` `draft` `esUsuarioSoloConsulta` `normalizarPermisosUsuario` `onUsersUpdated` … +21 |
| 63 | `17c-ampliaciones-turno` <sub>20261102-pal2</sub> | GLACIAL · TIEMPO EXTRA DE SUPERVISORES (solo Administrador) — Panel dentro de «Rotación de supervisores», visible SOLO para el Administrador. Muest… | `renderRotacionSupervisores`w `ampTurnoAbrir`w `ampTurnoCancelar`w `ampTurnoLimpiarMsg`w `ampTurnoElegir`w `ampTurnoConfirmar`w `ampCierreGuardar`w … +1 | `00b-puente-supabase`(1), `01-config`(2), `02-estado`(1), `17b-ventana-supervisor`(1), `17-modo-trabajo`(1), `31-rotacion-supervisores`(2) | `renderRotacionSupervisores` |
| 64 | `32-dashboard-perfiles` <sub>20261121-in4</sub> | 32-dashboard-perfiles.js | `cpEsc`ƒ `cpNum`ƒ `cpNorm`ƒ `cpFechaISO`ƒ `cpFechaBonita`ƒ `cpRol`ƒ `cpEsVistaGeneral`ƒ … +112 · 2 _priv | `01-config`(2), `45-indicadores`(1), `02-estado`(7), `04-sidebar`(6), `05-utils`(5), `06-registro`(1), `16-paletas`(1), `13-tareo`(4) … +18 | `onPaletasUpdated` `onProgramacionesUpdated` `renderCentroPerfil` |
| 65 | `32b-inicio-resultado` <sub>20261114-in1</sub> | INICIO EJECUTIVO · «RESULTADO DE LA PLANTA» | `glacialInicioResultado`w | `49-resumen-indicadores`(1) ⚠, `79-paradas-mantenimiento`(1) ⚠, `68-mantenimiento-inicio`(1) ⚠ | — |
| 71 | `36-seguridad-auth` <sub>20261023-lg2</sub> | GLACIAL · SEGURIDAD: FIREBASE AUTHENTICATION (ETAPA 1) — Qué hace: | `esAdministradorSeguridad`w `crearCuentaSegura`w `crearCuentaSeguraLibre`w `autenticarConFirebase`w `iniciarSincronizacionSegura`w `glacialTurnoCarga`w `glacialLiberarTurnoCarga`w … +14 · 1 _priv | `00b-puente-supabase`(2), `01-config`(6), `02-estado`(6), `10-usuarios`(1), `23b-modo-visualizacion`(1), `55-valores-economicos`(1) ⚠ | `saveUsers` |
| 98 | `10c-impacto-economico-permisos` <sub>20261102-pal2</sub> | GLACIAL · PERMISOS DE IMPACTO ECONÓMICO POR USUARIO — El rol dice quién PUEDE tener acceso; el permiso explícito dice quién LO TIENE: | `editarPermisosUsuario`w `glacialEcoUsuarios`w | `02-estado`(4), `10-usuarios`(2), `10b-modo-visualizacion-form`(1), `36-seguridad-auth`(1), `55-valores-economicos`(1) | `editarPermisosUsuario` |
| 195 | `39-vista-como` <sub>20261003-vista-1</sub> | GLACIAL · VISTA COMO (solo Administrador) — Permite al Administrador ver la aplicación tal como la ve otro | `fetch`w `salirVistaComo`w `abrirVistaComo`w `renderSidebar`w `handleLogout`w · 1 _priv | `00b-puente-supabase`(1), `01-config`(1), `02-estado`(3), `03-auth`(3), `04-sidebar`(1), `13-tareo`(1), `23b-modo-visualizacion`(1), `37-mantenimiento-tecnicos`(1) … +4 | `handleLogout` `renderSidebar` |

### Producción · `js/produccion/`

| # | Archivo (`?v=`) | Propósito | Expone | Depende de | Sobrescribe |
|---|---|---|---|---|---|
| 16 | `06b-fotos-supabase` <sub>20261023-rg1</sub> | GLACIAL · FOTOS EN SUPABASE STORAGE (privadas, con enlace firmado) | `glacialFotos`w | `00b-puente-supabase`(1) | — |
| 17 | `06c-migrar-fotos` <sub>20261102-pal2</sub> | GLACIAL · MIGRAR LAS FOTOS ANTIGUAS DE CLOUDINARY A SUPABASE (solo Administrador) | `glacialMigrarFotos`w | `01-config`(1), `02-estado`(2), `06b-fotos-supabase`(1) | — |
| 18 | `06d-corregir-fechas-noche` <sub>20261018-fe1</sub> | GLACIAL · CORREGIR REGISTROS DE LA NOCHE GUARDADOS CON LA FECHA DEL CALENDARIO (solo Administrador) | `glacialCorregirFechasNoche`w | `01-config`(1), `01b-fecha-operativa`(1), `02-estado`(1), `29a-avances-items`(1) ⚠ | — |
| 19 | `06-registro` <sub>20261113-rc8</sub> | FORMULARIO DE NUEVO REGISTRO (KPI, inputs, tablas, guardar) | `statusClass`ƒ `badgeClass`ƒ `calcDerivedLegacy`ƒ `calcDerivedCuadro`ƒ `calcDerivedMulti`ƒ `glacialAgregarDerivados`ƒ `calcDerived`ƒ … +135 · 13 _priv | `01-config`(11), `01b-fecha-operativa`(1), `45-indicadores`(1), `02-estado`(9), `04-sidebar`(3), `05-utils`(29), `06b-fotos-supabase`(1), `07-historial`(1) ⚠ … +35 | `onRecordsUpdated` `renderFormTab` |
| 20 | `07-historial` <sub>20261107-rc3</sub> | HISTORIAL DE REGISTROS | `histEsc`ƒ `histCuadrosActivos`ƒ `histPresentacionNombre`ƒ `histPresentaciones`ƒ `histAplicarFiltros`ƒ `histLimpiarFiltros`ƒ `histEstadoTexto`ƒ … +22 | `00b-puente-supabase`(1), `01-config`(1), `45-indicadores`(1), `02-estado`(4), `05-utils`(1), `06b-fotos-supabase`(1), `06c-migrar-fotos`(1), `06d-corregir-fechas-noche`(1) … +8 | — |
| 21 | `08a-graficos-base` <sub>20261112-gr1</sub> | GLACIAL · BASE DE GRÁFICOS (ApexCharts · ECharts · canvas-gauges) | `glacialGraficosBase`w | `45-indicadores`(1), `49-resumen-indicadores`(1) ⚠ | — |
| 22 | `08-graficos` <sub>20261123-pt13</sub> | graficos Y REPORTES VISUALES | `colorSegunMeta`ƒ `formatearNumero`ƒ `calcCascada`ƒ `agruparParadas`ƒ `cambiarRangoTendencia`ƒ `agruparMermas`ƒ `agruparInsumos`ƒ … +65 | `01-config`(2), `01b-fecha-operativa`(1), `45-indicadores`(2), `46-vista-excel`(1), `02-estado`(4), `05-utils`(5), `06-registro`(5), `08a-graficos-base`(1) … +4 | — |
| 23 | `09-resumen` <sub>20261121-rc2</sub> | RESUMEN GENERAL | `fechaHoyResumen`ƒ `cambiarRangoResumen`ƒ `cambiarFechaDiariaResumen`ƒ `cambiarModoPresentacionMarca`ƒ `cambiarMesPresentacionMarca`ƒ `cambiarAnioPresentacionMarca`ƒ `etiquetaMesResumen`ƒ … +86 | `01-config`(2), `45-indicadores`(2), `02-estado`(7), `04-sidebar`(1), `05-utils`(4), `06-registro`(3), `08a-graficos-base`(1), `08-graficos`(8) … +9 | — |
| 28 | `16-paletas` <sub>20261117-sl1</sub> | PALETAS — REGISTRO EN TIEMPO REAL DE PALETAS PRODUCIDAS | `nombrePresentacionUI`ƒ `clavePresentacionVisualPaletas`ƒ `etiquetaPresentacionVisualPaletas`ƒ `presentacionesUnicasPaletas`ƒ `claveProgramacionPaleta`ƒ `normalizarClavePaletas`ƒ `claveCombinacionPaletas`ƒ … +62 · 1 _priv | `01-config`(4), `01b-fecha-operativa`(1), `45-indicadores`(1), `02-estado`(8), `04-sidebar`(1), `05-utils`(3), `06-registro`(2), `23b-modo-visualizacion`(1) ⚠ … +4 | `_paletasCache` `_programacionesCache` |
| 33 | `14-exportar-general` <sub>20261121-rc3</sub> | EXPORTACIÓN A EXCEL — GENERAL DE PLANTA (TODAS LAS LÍNEAS) | `xlgFont`ƒ `xlgColorSemaforo`ƒ `xlgColorFuerteSegunMeta`ƒ `obtenerLitrosPorUnidad`ƒ `litrosCuadro`ƒ `litrosRegistro`ƒ `datosExportacionGeneral`ƒ … +23 | `01-config`(1), `01b-fecha-operativa`(1), `45-indicadores`(2), `02-estado`(2), `04-sidebar`(1), `05-utils`(5), `06-registro`(4), `08-graficos`(14) … +7 | — |
| 41 | `21-programacion-turno` <sub>20261102-leg3</sub> | Programación visible en Nuevo registro y Paletas, sin modificar el formulario. | — | `45-indicadores`(1), `02-estado`(5), `04-sidebar`(1), `05-utils`(2), `06-registro`(5), `16-paletas`(2), `23b-modo-visualizacion`(2) ⚠, `35-autollenado-registro`(1) ⚠ … +4 | `onProgramacionesUpdated` `renderFormTab` `renderMain` `renderPaletasTab` |
| 44 | `23b-tiempos-linea` <sub>20261105-rc1</sub> | GLACIAL · TIEMPOS Y RATIOS DE LÍNEA (función central única) — Todo el sistema (semáforo de Producción Actual, Inicio ejecutivo, | `paradasOperativasActuales`w `glacialProgramadoBloque`w `calcularTiemposLinea`w `calcularRatiosLinea`w `proyectarCierreLinea`w `glacialBloquesConfig`w `UMBRALES_PROYECCION_LINEA`w … +4 · 1 _priv | `01-config`(3), `45-indicadores`(2), `02-estado`(3), `06-registro`(2), `16-paletas`(1), `29-avance-produccion`(1) ⚠, `32-dashboard-perfiles`(1) ⚠, `35-autollenado-registro`(1) ⚠ … +5 | — |
| 45 | `24a-estados-visuales` <sub>20261013-ev1</sub> | GLACIAL · MAPA ÚNICO DE ESTADOS VISUALES DE PRODUCCIÓN — El COLOR de un estado operativo sale de aquí y de ningún otro lado. Solo depende del estad… | `glacialEstadosVisuales`w | — | — |
| 46 | `24-semaforo-produccion-actual` <sub>20261121-cf4</sub> | GLACIAL · Estado de líneas por turno y presentación. — Cargar DESPUÉS de 16-paletas.js, 17-modo-trabajo.js y 23-gerente-solo-lectura.js; | `glacialBloqueVigente`w `glacialEnFranjaSinProduccion`w `glacialQuienControla`w `glacialResumenPorTurno`w `glacialEsMotivoPendiente`w `glacialEquipoPendiente`w `glacialSemaforo`w … +3 | `00b-puente-supabase`(1), `01-config`(7), `01b-fecha-operativa`(1), `45-indicadores`(2), `02-estado`(8), `05-utils`(2), `06-registro`(1), `16-paletas`(13) … +20 | `_programacionesCache` `produccionActualFecha` `produccionActualTurno` `renderProduccionActualTab` `resumenProgramacionCombinacionTurnos` `tienePermiso` … +1 |
| 47 | `24b-pausas-sin-cerrar` <sub>20261018-pz1</sub> | GLACIAL · PAUSAS Y PARADAS ABIERTAS — qué se muestra como «PARADA» y cómo se cierran las olvidadas | `glacialPausas`w | `01-config`(1), `02-estado`(4), `16-paletas`(1), `23b-modo-visualizacion`(1), `23b-tiempos-linea`(1), `25-alertas-lineas`(1) ⚠, `44-estado-datos`(1) ⚠ | — |
| 48 | `25-alertas-lineas` <sub>20261102-leg3</sub> | GLACIAL · Centro de alertas + historial diario. — Cargar después de 24-semaforo-produccion-actual.js y antes de 12-init.js. | `procesarAlertasOperacion`w `glacialAlertasPintar`w | `01-config`(1), `01b-fecha-operativa`(1), `02-estado`(5), `03-auth`(2), `23b-modo-visualizacion`(2), `37b-mantenimiento-identificacion`(2) ⚠, `41-tareo-bloqueo`(2) ⚠, `44-estado-datos`(1) ⚠ … +6 | `enterApp` `handleLogout` `onProgramacionesUpdated` `onUsersUpdated` |
| 52 | `29a-avances-items` <sub>20261011-pl2</sub> | AVANCES Y CIERRES · UN DOCUMENTO POR SNAPSHOT (colección avancesTurnoItems) | `glacialAvancesItems`w | `00b-puente-supabase`(1), `01-config`(2), `02-estado`(1) | — |
| 53 | `29-avance-produccion` <sub>20261127-pm1</sub> | AVANCE Y CIERRE DE TURNO — GLACIAL | `avNum`ƒ `avEsc`ƒ `avFmt`ƒ `avFechaHoy`ƒ `avHoraActual`ƒ `avNombreUsuario`ƒ `avTurnoCanon`ƒ … +209 · 1 _priv | `01-config`(3), `01b-fecha-operativa`(1), `45-indicadores`(2), `02-estado`(11), `04-sidebar`(1), `05-utils`(1), `06-registro`(1), `16-paletas`(2) … +22 | — |
| 54 | `61-reporte-linea` <sub>20261123-rr1</sub> | GLACIAL · REPORTE DE PRODUCCIÓN POR LÍNEA (PET1, PET2, B7L, C20L, B20L) | `glacialReporteLinea`w | `01-config`(1), `45-indicadores`(1), `06-registro`(1), `16-paletas`(1), `29-avance-produccion`(2), `49-resumen-indicadores`(2) ⚠ | — |
| 55 | `62-reporte-registro` <sub>20261018-fe1</sub> | GLACIAL · REPORTE DIARIO DE UNA LÍNEA (botón «Exportar PNG» de la pestaña Gráficos) | `glacialReporteRegistro`w | `01b-fecha-operativa`(1), `45-indicadores`(1), `02-estado`(1), `06-registro`(1), `08-graficos`(7), `16-paletas`(1), `61-reporte-linea`(1), `43-distribucion-personal`(1) ⚠ … +1 | — |
| 56 | `62b-reporte-diario` <sub>20261123-pt13</sub> | GLACIAL · REPORTE DIARIO DE PRODUCCIÓN (formato del Excel de la planta) — 23/11/2026 | `glacialReporteDiario`w | `01-config`(2), `45-indicadores`(2), `46-vista-excel`(1), `02-estado`(1), `06-registro`(2), `08-graficos`(5), `16-paletas`(1), `62c-reporte-diario-excel`(1) ⚠ … +4 | — |
| 57 | `62c-reporte-diario-excel` <sub>20261123-pt13</sub> | GLACIAL · REPORTE DIARIO DE PRODUCCIÓN EN EXCEL | `glacialReporteDiarioExcel`w | `02-estado`(1), `08-graficos`(1), `62b-reporte-diario`(1) | — |
| 58 | `63-incidencias-no-produccion` <sub>20261102-leg3</sub> | GLACIAL · MOTIVOS DE NO PRODUCCIÓN (incidencias informativas por línea) | `glacialIncidencias`w | `00b-puente-supabase`(1), `01-config`(1), `02-estado`(2), `23b-modo-visualizacion`(1), `24-semaforo-produccion-actual`(1), `37-mantenimiento-tecnicos`(1) ⚠, `41-tareo-bloqueo`(1) ⚠ | — |
| 66 | `35-autollenado-registro` <sub>20261105-rc2</sub> | GLACIAL · AUTOLLENADO DEL NUEVO REGISTRO (Paletas + paradas) | `autollenarRegistro`w `registroEditarEnOrigen`w `registroUsarPaletas`w `registroUsarProgramada`w `registroAsignarParada`w `registroActualizarCuadro`w `registroFilaAuto`w … +3 · 1 _priv | `01-config`(1), `02-estado`(5), `04-sidebar`(2), `06-registro`(10), `16-paletas`(4), `23b-modo-visualizacion`(2), `23b-tiempos-linea`(2), `29-avance-produccion`(1) … +5 | `onPaletasUpdated` `onProgramacionesUpdated` `renderFormTab` |
| 67 | `35b-personal-desde-tareo` <sub>20261123-pt9</sub> | PERSONAL DEL TURNO DESDE EL TAREO (formulario de registro › «Personal del turno») | `GlacialPersonalTareo`w `personalTareoHtml`w `personalTareoCompletar`w `personalTareoPoner`w | `02-estado`(4), `06-registro`(1), `13-tareo`(1), `35-autollenado-registro`(1), `35c-autollenado-completo`(1) ⚠ | — |
| 68 | `35c-autollenado-completo` <sub>20261123-pt11</sub> | GLACIAL · REGISTRO QUE SE LLENA SOLO DURANTE EL TURNO | `updateMermaCuadro`w `validarReporteParaFinalizar`w `destinoFaltanteRegistro`w `cuadro1DesdeProgramacion`w `renderFormTab`w `glacialAutollenadoCompleto`w | `02-estado`(6), `06-registro`(11), `16-paletas`(1), `13-tareo`(1), `35-autollenado-registro`(1), `35b-personal-desde-tareo`(1), `47-analisis-paradas`(1) ⚠ | `cuadro1DesdeProgramacion` `destinoFaltanteRegistro` `renderFormTab` `updateMermaCuadro` `validarReporteParaFinalizar` |
| 69 | `29b-correccion-paradas` <sub>20261102-pal2</sub> | GLACIAL · CORREGIR Y REASIGNAR PARADAS — Una parada de Avance/Cierre (sync/avancesTurno → paradasOperativas) es un evento de la LÍNEA, turno y fech… | `glacialCorreccionParadas`w | `00b-puente-supabase`(1), `01-config`(1), `02-estado`(5), `06-registro`(5), `23b-modo-visualizacion`(3), `29-avance-produccion`(7), `35-autollenado-registro`(3), `35c-autollenado-completo`(1) … +5 | — |
| 89 | `46-proyeccion-avisos` <sub>20261105-rc1</sub> | LOTE 2 · PROYECCIÓN DEL TURNO + AVISOS (se muestran en el Centro de alertas de 25-alertas-lineas.js) | `glacialConfigAlertas`w `renderCentroPerfil`w `glacialAvisos`w | `01-config`(2), `01b-fecha-operativa`(1), `45-indicadores`(2), `02-estado`(6), `03-auth`(1), `04-sidebar`(4), `06-registro`(1), `16-paletas`(1) … +21 | `handleLogout` `onPaletasUpdated` `onProgramacionesUpdated` `onTareosUpdated` `renderCentroPerfil` |
| 91 | `47-analisis-paradas` <sub>20261123-pt9</sub> | LOTE 3 · ANÁLISIS DE PARADAS E INDICADORES DE LÍNEA (solo lectura) | `glacialConfigIndicadores`w `glacialConfigIndicadoresOyentes`w `glacialConfigIndicadoresEscuchar`w `glacialPuedeConfigurarIndicadores`w `glacialGuardarConfigIndicadores`w `analisisParadasAbrir`w `goAnalisisParadas`w … +2 | `00b-puente-supabase`(1), `01-config`(3), `45-indicadores`(2), `02-estado`(5), `03-auth`(1), `04-sidebar`(4), `06-registro`(3), `13-tareo`(1) … +25 | `ajustarVistaSegunPermisos` `grupoSidebarActivo` `handleLogout` `onProgramacionesUpdated` `onRecordsUpdated` `renderCentroPerfil` … +2 |
| 92 | `47b-analisis-paradas-mejoras` <sub>20261102-leg3</sub> | ANÁLISIS DE PARADAS · MEJORAS (funciones puras + bloques de pantalla) | `glacialAnalisisMejoras`w | `02-estado`(1) | — |
| 93 | `48-resumen-turno` <sub>20261102-pal2</sub> | LOTE 4 · PARTE B · RESUMEN DE TURNO AUTOMÁTICO + pantalla «Resúmenes de turno» | `avGenerar`w `resumenTurnoAbrir`w `goResumenesTurno`w `glacialResumenTurno`w | `00b-puente-supabase`(1), `01-config`(2), `45-indicadores`(1), `02-estado`(4), `03-auth`(1), `04-sidebar`(4), `06-registro`(1), `13-tareo`(5) … +13 | `ajustarVistaSegunPermisos` `avGenerar` `grupoSidebarActivo` `handleLogout` `onPaletasUpdated` `onProgramacionesUpdated` … +4 |
| 94 | `49-resumen-indicadores` <sub>20261105-rc1</sub> | REPORTES · PARTE A · RESUMEN GENERAL (indicadores, metas, «Qué pasó», comparativos) | `glacialMetasIndicadores`w `glacialVelocidadEstandar`w `glacialVelocidadCatalogo`w `obtenerRatioNominal`w `glacialRangoEtiqueta`w `renderResumen`w `filtrarPorRangoResumen`w … +6 | `01-config`(4), `45-indicadores`(2), `45b-velocidades-vigencia`(1), `02-estado`(5), `04-sidebar`(1), `05-utils`(1), `06-registro`(1), `08-graficos`(1) … +9 | `calcularKPIsPlanta` `fechaHoyResumen` `filtrarPorRangoResumen` `obtenerRatioNominal` `onPaletasUpdated` `onProgramacionesUpdated` … +6 |
| 95 | `49b-resumen-graficos-diferidos` <sub>20261019-gx3</sub> | GLACIAL · REPORTES → RESUMEN GENERAL — GRÁFICOS DIFERIDOS (rendimiento / INP) | `Chart`w `glacialDiferirGrafico`w `renderResumen`w · 1 _priv | `09-resumen`(1), `49-resumen-indicadores`(1) | `renderResumen` |
| 96 | `50-impacto-economico` <sub>20261107-cv2</sub> | IMPACTO ECONÓMICO · MOTOR DE CÁLCULO (cascada de pérdidas por evento) | `renderPerdidasSoles`w `glacialImpactoEconomico`w | `45-indicadores`(1), `02-estado`(1), `37-mantenimiento-tecnicos`(1), `37d-equipos-maestro`(1), `49-resumen-indicadores`(1), `55-valores-economicos`(1) ⚠, `58-impacto-dashboard`(1) ⚠, `95-conversiones`(1) ⚠ | — |
| 97 | `55-valores-economicos` <sub>20261102-pal2</sub> | VALORES UNITARIOS Y ACCESO ECONÓMICO (protegidos por rol) | `glacialEcoPermisos`w `glacialEconomicoEscuchas`w `glacialEconomico`w | `00b-puente-supabase`(1), `01-config`(5), `01b-fecha-operativa`(1), `02-estado`(2), `23b-modo-visualizacion`(1), `37-mantenimiento-tecnicos`(1), `41-tareo-bloqueo`(1), `49-resumen-indicadores`(1) … +1 | — |
| 99 | `56-impacto-resultados` <sub>20261010-eco1</sub> | IMPACTO ECONÓMICO · FUENTE DE DATOS DEL DASHBOARD Y PUBLICACIÓN PARA JEFATURA | `glacialImpactoResultados`w | `00b-puente-supabase`(1), `01-config`(2), `02-estado`(1), `41-tareo-bloqueo`(1), `49-resumen-indicadores`(1), `50-impacto-economico`(1), `55-valores-economicos`(1) | — |
| 100 | `57-impacto-estado` <sub>20261007-dash1</sub> | IMPACTO ECONÓMICO · ESTADO CENTRAL DE FILTROS Y AGREGACIÓN (puro: se prueba sin pantalla) | `GlacialImpactoEstado`w | `05-utils`(1) | — |
| 101 | `59-impacto-analisis` <sub>20261007-dash1</sub> | IMPACTO ECONÓMICO · ANÁLISIS AUTOMÁTICO (puro: se prueba sin pantalla) | `GlacialImpactoAnalisis`w | — | — |
| 102 | `58-impacto-dashboard` <sub>20261121-gr2</sub> | IMPACTO ECONÓMICO · DASHBOARD INTERACTIVO (Gerencia, Jefatura y vista operativa) | `glacialImpactoDashboard`w | `02-estado`(4), `23b-modo-visualizacion`(1), `49-resumen-indicadores`(1), `50-impacto-economico`(1), `55-valores-economicos`(1), `10c-impacto-economico-permisos`(1), `56-impacto-resultados`(1), `57-impacto-estado`(1) … +5 | — |
| 103 | `60-impacto-excel` <sub>20261007-dash1</sub> | IMPACTO ECONÓMICO · EXPORTACIÓN A EXCEL (lo que se ve en pantalla, con los mismos filtros) | `glacialImpactoExcel`w | `02-estado`(1), `08-graficos`(3), `49-resumen-indicadores`(1), `50-impacto-economico`(1), `57-impacto-estado`(1) | — |
| 104 | `51-planificacion-nucleo` <sub>20261102-pal2</sub> | PLANIFICACIÓN · NÚCLEO (Parte A) | `glacialPlanificacion`w `glacialPlanificacionEscuchas`w `glacialPlanificacionRefrescar`w | `01-config`(4), `45-indicadores`(1), `02-estado`(6), `04-sidebar`(2), `05-utils`(1), `16-paletas`(6), `23b-modo-visualizacion`(1), `23b-tiempos-linea`(1) … +6 | — |
| 105 | `52-planificacion-pantalla` <sub>20261121-cf3</sub> | PLANIFICACIÓN · PANTALLA (Parte A) | `renderPlanificacion`w | `45-indicadores`(1), `02-estado`(1), `44-estado-datos`(1) | — |
| 106 | `51b-horarios-produccion` <sub>20261021-hz10</sub> | PLANIFICACIÓN · HORARIO DE PRODUCCIÓN POR LÍNEA, BLOQUE Y VIGENCIA | `glacialHorarios`w | `00b-puente-supabase`(1), `01-config`(2), `45-indicadores`(1), `02-estado`(1), `23b-modo-visualizacion`(1), `23b-tiempos-linea`(1), `44-estado-datos`(1) | — |
| 107 | `53-planificacion-catalogo` <sub>20261030-pl9</sub> | PLANIFICACIÓN · CATÁLOGO Y VISTA SEMANAL (Parte B) | — | `01-config`(1), `02-estado`(1), `47-analisis-paradas`(2), `49-resumen-indicadores`(2) | — |
| 108 | `54-planificacion-solicitudes` <sub>20261102-pal2</sub> | PLANIFICACIÓN · SOLICITUDES, HISTORIAL Y CUMPLIMIENTO (Parte C) | — | `00b-puente-supabase`(1), `01-config`(1), `45-indicadores`(1), `02-estado`(3), `16-paletas`(2), `23b-modo-visualizacion`(1), `24-semaforo-produccion-actual`(1), `49-resumen-indicadores`(1) | — |
| 109 | `64-planificacion-avance` <sub>20261013-pl8</sub> | PLANIFICACIÓN · AVANCE DEL PLAN, COMPROMISO ORIGINAL Y EXPORTACIÓN (etapa 2) | — | `00b-puente-supabase`(1), `01-config`(1), `02-estado`(1), `24-semaforo-produccion-actual`(1) | — |
| 110 | `65b-planificacion-motor` <sub>20261113-cf2</sub> | PLANIFICACIÓN · MOTOR DE TIEMPOS Y CAPACIDAD (etapa 4) | `glacialPlanificacion`w | — | — |
| 111 | `65a-planificacion-tiempos` <sub>20261102-pal2</sub> | PLANIFICACIÓN · TIEMPOS PREVISTOS (etapa 4): reglas de preparación, ventanas de indisponibilidad, versión y auditoría | — | `00b-puente-supabase`(1), `01-config`(1), `02-estado`(1), `44-estado-datos`(1), `51b-horarios-produccion`(1) | — |
| 112 | `65-planificacion-capacidad` <sub>20261102-pal2</sub> | PLANIFICACIÓN · CAPACIDAD, SECUENCIA Y TRASLADO DE SALDO (etapas 3 y 4) | — | `01-config`(1), `02-estado`(2), `05-utils`(1), `16-paletas`(2), `49-resumen-indicadores`(1), `52b-planificacion-vistas`(1) ⚠ | — |
| 113 | `65c-planificacion-opciones` <sub>20261012-pl5</sub> | PLANIFICACIÓN · «VER OPCIONES PARA COMPLETAR» (etapa 4) | — | — | — |
| 114 | `65d-planificacion-semanal` <sub>20261102-leg3</sub> | PLANIFICACIÓN · VISTA SEMANAL DE CARGA Y CAPACIDAD (etapa 4) | — | `02-estado`(1) | — |
| 115 | `66p-planificacion-modos` <sub>20261121-cf3</sub> | PLANIFICACIÓN · MODOS DE PROGRAMACIÓN, META ENTRE BLOQUES, TODO EL TURNO Y ESTADO DEL PLAN | — | `00b-puente-supabase`(1), `01-config`(1), `01b-fecha-operativa`(1), `02-estado`(3), `05-utils`(1), `06-registro`(1), `23b-modo-visualizacion`(2), `37-mantenimiento-tecnicos`(1) … +2 | `onProgramacionesUpdated` `onRecordsUpdated` |
| 116 | `66b-planificacion-secuencia` <sub>20261125-pw1</sub> | PLANIFICACIÓN · SECUENCIA POR CANTIDAD, HORA Y CIERRE, CON CAMBIO DE MARCA CONFIGURABLE | — | `01-config`(1), `02-estado`(2), `16-paletas`(2) | — |
| 117 | `66w-planificacion-whatsapp` <sub>20261125-pw2</sub> | PLANIFICACIÓN · PROGRAMACIÓN DESDE WHATSAPP | `glacialProgramacionWhatsApp`w | `01-config`(2), `02-estado`(2) | — |
| 118 | `66u-planificacion-ordenes-venta-nucleo` <sub>20261022-ov10</sub> | PLANIFICACIÓN · ÓRDENES DE VENTAS — NÚCLEO DE CÁLCULO (puro: sin Firestore ni pantalla) | `glacialOrdenesVentaNucleo`w | — | — |
| 119 | `66v-planificacion-ordenes-venta` <sub>20261102-pal2</sub> | PLANIFICACIÓN · ÓRDENES DE VENTAS — PESTAÑA | — | `01-config`(1), `02-estado`(1), `24-semaforo-produccion-actual`(1), `66u-planificacion-ordenes-venta-nucleo`(1) | — |
| 120 | `52b-planificacion-vistas` <sub>20261019-ov1</sub> | PLANIFICACIÓN · VISTAS FUERA DE PLANIFICACIÓN | `goProductosParametros`w `goHorarioProduccion`w | `02-estado`(1), `04-sidebar`(3), `06-registro`(1), `13-tareo`(1), `23b-modo-visualizacion`(2), `37-mantenimiento-tecnicos`(1), `37b-mantenimiento-identificacion`(1), `39-vista-como`(1) ⚠ | `ajustarVistaSegunPermisos` `renderMain` `renderSidebar` |
| 121 | `66-entrega-turno` <sub>20261121-pal3</sub> | ENTREGA DE TURNO entre supervisores de Producción | `renderCentroPerfil`w `entregaTurnoAbrir`w `goEntregaTurno`w `glacialEntregaTurno`w | `00b-puente-supabase`(1), `01-config`(2), `02-estado`(4), `03-auth`(1), `04-sidebar`(4), `06-registro`(1), `13-tareo`(1), `23b-modo-visualizacion`(5) … +16 | `ajustarVistaSegunPermisos` `grupoSidebarActivo` `handleLogout` `renderCentroPerfil` `renderMain` `renderSidebar` |
| 142 | `67-produccion-inicio` <sub>20261107-av1</sub> | PRODUCCIÓN · INICIO (pantalla de entrada del módulo, ordenada por tareas) | `goProduccionInicio`w `glacialProdInicio`w | `01b-fecha-operativa`(1), `02-estado`(3), `04-sidebar`(6), `06-registro`(2), `13-tareo`(1), `23b-modo-visualizacion`(2), `31-rotacion-supervisores`(1), `37-mantenimiento-tecnicos`(1) … +9 | `ajustarVistaSegunPermisos` `renderMain` `renderSidebar` |
| 175 | `16c-saldo-entrega` <sub>20261117-sl1</sub> | GLACIAL · PRODUCCIÓN › PALETAS › «SALDOS POR ENTREGAR A ALMACÉN» | `slEntregar`w `slAnularAbrir`w `slCerrar`w `slCantidad`w `slMotivo`w `slConfirmar`w `slAnular`w … +1 | `00b-puente-supabase`(1), `01-config`(1), `02-estado`(4), `16-paletas`(3), `23b-modo-visualizacion`(3), `71-asistente-datos`(1), `75-inventario-insumos-datos`(1), `98-calidad-permisos`(1) … +1 | `renderPaletasTab` |
| 176 | `16d-paletas-cola` <sub>20261126-pc1</sub> | GLACIAL · PRODUCCIÓN › PALETAS › COLA SIN CONEXIÓN CON IDEMPOTENCIA | `glacialPaletasCola`w | — | — |
| 177 | `16e-paletas-rapido` <sub>20261126-pc1</sub> | GLACIAL · PRODUCCIÓN › PALETAS › CAPTURA AL MINUTO | `paletaMasUnoAhora`w `paletaColaReintentar`w `paletaColaDescartar`w `glacialPaletasRapido`w | `01-config`(1), `01b-fecha-operativa`(1), `02-estado`(7), `04-sidebar`(1), `06-registro`(1), `16-paletas`(20), `23b-modo-visualizacion`(1), `71-asistente-datos`(1) … +3 | `_guardandoPaleta` `_paletasCache` `_programacionesCache` `actualizarPaletaCampoYRerenderizar` `actualizarVistaPaletas` `agregarTramoSecuenciaDesdeFormulario` … +4 |
| 178 | `16f-cierre-marcas` <sub>20261127-pm1</sub> | GLACIAL · PRODUCCIÓN › PALETAS › CIERRE PROGRESIVO DE MARCAS Y CIERRE DE TURNO | — | `02-estado`(5), `16-paletas`(9), `23b-modo-visualizacion`(2), `29-avance-produccion`(2), `71-asistente-datos`(1), `75-inventario-insumos-datos`(1), `98-calidad-permisos`(1) | `htmlSecuenciaTurnoPaletas` |
| 179 | `16g-paradas-tramo` <sub>20261127-pm1</sub> | GLACIAL · PRODUCCIÓN › PARADAS POR MARCA (TRAMO) › «Paradas por marca» | — | `01-config`(1), `45-indicadores`(1), `02-estado`(1), `06-registro`(1), `29-avance-produccion`(3) | — |

### Personal / Tareo · `js/personal/`

| # | Archivo (`?v=`) | Propósito | Expone | Depende de | Sobrescribe |
|---|---|---|---|---|---|
| 27 | `11-trabajadores` <sub>20261121-pu2</sub> | GESTIÓN DE TRABAJADORES | `rrhhAreaTrabajador`ƒ `rrhhActualizarPuestos`ƒ `openWorkersModal`ƒ `filterWorkerList`ƒ `renderWorkerList`ƒ `saveWorkerForm`ƒ `startEditWorker`ƒ … +10 | `01-config`(2), `04b-busqueda`(1), `02-estado`(4), `05-utils`(1) | — |
| 34 | `13n-tareo-nube` <sub>20261014-tc1</sub> | GLACIAL · TAREO — GUARDADO EN LA NUBE (concurrencia, errores, pendientes y documento por tareo) | `TareoNube`w | `01-config`(2), `02-estado`(1), `13-tareo`(1) ⚠ | — |
| 35 | `13-tareo` <sub>20261123-pa6</sub> | GLACIAL - TAREO DE PERSONAL | `confirmarAbandonoRotacionPendiente`ƒ `tareoNormalizarTexto`ƒ `tareoNormalizarDNI`ƒ `tareoCargoPermitido`ƒ `tareoTrabajadorActivo`ƒ `tareoEsDeArea`ƒ `escaparHTML`ƒ … +211 · 8 _priv | `01-config`(2), `01b-fecha-operativa`(1), `04b-busqueda`(1), `02-estado`(13), `13n-tareo-nube`(1), `45-tareo-edicion-continua`(3) ⚠, `46-tareo-horas-extras`(1) ⚠, `47-horas-extras-registro`(1) ⚠ … +13 | `eliminarTareo` `exportarTareoExcel` `exportarTareoGeneralExcel` `exportarTareoPNG` `guardarTareoActual` `obtenerResumenMensualTareo` … +8 |
| 36 | `20-tareo-control` <sub>20261004-pestanas</sub> | Control quincenal y consulta de auditoría de Tareo. | `tareoPeriodo`ƒ `tareoEvaluarDescansos`ƒ `tareoControlActualizar`ƒ `tareoAlertaDescansos`ƒ `renderControlDescansos`ƒ `tareoIniciarAuditoria`ƒ `tareoEventoEsCorreccion`ƒ … +9 | `01-config`(1), `02-estado`(5), `13-tareo`(10), `23b-modo-visualizacion`(2) ⚠, `30-rotacion-mantenimiento`(1) ⚠, `33-rotacion-maquinistas`(1) ⚠, `37b-mantenimiento-identificacion`(1) ⚠, `37c-equipos-catalogo`(1) ⚠ … +8 | `tareoRenderTabs` |
| 37 | `45-tareo-edicion-continua` <sub>20261120-qa1</sub> | GLACIAL · TAREO — EDICIÓN CONTINUA (varias filas seguidas sin reinicios ni horas cruzadas) | `TareoEd`w · 2 _priv | `01-config`(1), `02-estado`(2), `13n-tareo-nube`(1), `13-tareo`(23), `23b-modo-visualizacion`(1) ⚠, `28-tareo-maquinistas`(1) ⚠, `37f-tareo-por-tecnico`(1) ⚠, `40-tareo-auditoria`(1) ⚠ … +2 | `_tareoColaGuardado` `_tareoEscriturasPendientes` |
| 38 | `46-tareo-horas-extras` <sub>20261121-gr2</sub> | GLACIAL · TAREO — HORAS EXTRAS, GRÁFICOS Y JORNADA LABORADA — Consulta (solo lectura) sobre los tareos reales: nunca guarda nada ni edita marcaciones. | `onTareosUpdated`w `TareoHE`w | `45-indicadores`(1), `02-estado`(1), `13-tareo`(14), `20-tareo-control`(1), `30-rotacion-mantenimiento`(1) ⚠, `33-rotacion-maquinistas`(1) ⚠, `37b-mantenimiento-identificacion`(1) ⚠, `37c-equipos-catalogo`(1) ⚠ … +7 | `onTareosUpdated` |
| 39 | `47a-horas-extras-nucleo` <sub>20261121-he2</sub> | GLACIAL · TAREO — HORAS EXTRAS (REGISTRO): NÚCLEO PURO — Sin pantalla ni base de datos: reglas del registro de horas extras con justificación y aut… | `glacialHorasExtrasNucleo`w | `04b-busqueda`(1) | — |
| 40 | `47-horas-extras-registro` <sub>20261121-pal3</sub> | GLACIAL · TAREO — HORAS EXTRAS CON JUSTIFICACIÓN Y AUTORIZACIÓN (pestaña «Horas extras») | `glacialHorasExtras`w `renderHorasExtrasRegistro`w | `01-config`(5), `02-estado`(4), `13-tareo`(6), `20-tareo-control`(1), `47a-horas-extras-nucleo`(1), `23b-modo-visualizacion`(2) ⚠, `30-rotacion-mantenimiento`(1) ⚠, `33-rotacion-maquinistas`(1) ⚠ … +9 | — |
| 51 | `28-tareo-maquinistas` <sub>20261102-ms2</sub> | GLACIAL · MAQUINISTAS: PRODUCCIÓN = FUENTE OFICIAL — NUEVO FLUJO: | `tareoEsMaquinistaEquipo`w `tareoEsTecnicoMantenimiento`w `tareoEsSupervisorMantenimiento`w `tareoCargoPermitido`w `renderTareoFormulario`w `renderTareoLectura`w `tareoEditarPersona`w | `02-estado`(1), `13-tareo`(23) | `renderTareoFormulario` `renderTareoLectura` `tareoCargoPermitido` `tareoEditarPersona` |
| 59 | `31a-rotacion-grid` <sub>20261102-pal2</sub> | GLACIAL · CUADRO DE ROTACIÓN TIPO EXCEL (componente compartido) | `glacialRotGrid`w · 1 _priv | `02-estado`(1) | — |
| 62 | `31-rotacion-supervisores` <sub>20261021-vs1</sub> | ROTACIÓN SEMANAL DE SUPERVISORES — GLACIAL | `rotSupSoloVista`ƒ `rotSupPuedeGestionar`ƒ `rotSupPuedeVer`ƒ `rotSupFechaISO`ƒ `rotSupParseFecha`ƒ `rotSupLunes`ƒ `rotSupDomingo`ƒ … +41 | `01b-fecha-operativa`(1), `02-estado`(7), `05-utils`(1), `23b-modo-visualizacion`(2), `31a-rotacion-grid`(1), `71-asistente-datos`(1) ⚠, `75-inventario-insumos-datos`(1) ⚠, `98-calidad-permisos`(1) ⚠ | — |
| 79 | `28b-maquinistas-mantenimiento` <sub>20261123-pt14</sub> | GLACIAL · MAQUINISTAS REGISTRADOS POR MANTENIMIENTO | `tareoMaqMttoCampo`w `tareoMaqMttoMarcarTodos`w `tareoMaqMttoDescanso`w `tareoMaqMttoAgregar`w `tareoMaqMttoAgregarOk`w `glacialMaquinistasMtto`w | `02-estado`(3), `13n-tareo-nube`(1), `13-tareo`(15), `28-tareo-maquinistas`(3), `33-rotacion-maquinistas`(1), `37-mantenimiento-tecnicos`(1), `37f-tareo-por-tecnico`(1), `41-tareo-bloqueo`(1) ⚠ … +1 | `renderTareoFormulario` `renderTareoLectura` |
| 80 | `42-tareo-agregar-personal` <sub>20261123-pa4</sub> | GLACIAL · TAREO — AGREGAR PERSONAL (Producción y Mantenimiento) | `tareoAgregarPersonalAlcance`w `tareoAgregarPersonalFecha`w `tareoAgregarPersonalTurnos`w `tareoAgregarPersonalModo`w `tareoAbrirAgregarPersonal`w `tareoAgregarPersonal`w | `01-config`(1), `02-estado`(3), `13-tareo`(20), `45-tareo-edicion-continua`(1), `28-tareo-maquinistas`(1), `37f-tareo-por-tecnico`(1), `48-tareo-personal-area`(1) ⚠, `40-tareo-auditoria`(1) ⚠ … +2 | `tareoAbrirAgregarPersonal` `tareoAgregarPersonal` |
| 81 | `48-tareo-personal-area` <sub>20261123-pa6</sub> | GLACIAL · TAREO DE MANTENIMIENTO — PERSONAL DEL ÁREA (desde el Inicio del Tareo) | `TareoArea`w | `02-estado`(5), `13-tareo`(15), `45-tareo-edicion-continua`(1), `23b-modo-visualizacion`(1), `37f-tareo-por-tecnico`(1), `40-tareo-auditoria`(1) ⚠, `41-tareo-bloqueo`(2) ⚠ | — |
| 82 | `43-distribucion-personal` <sub>20261121-dp2</sub> | GLACIAL · DISTRIBUCIÓN DE PERSONAL POR LÍNEA (fuente compartida) | `glacialDistribucionPersonal`w | `00b-puente-supabase`(1), `01-config`(1), `45-indicadores`(1), `02-estado`(2), `13-tareo`(1), `23b-modo-visualizacion`(1), `41-tareo-bloqueo`(1) ⚠, `47-analisis-paradas`(1) ⚠ … +3 | — |
| 83 | `44-distribucion-personal-pantalla` <sub>20261121-leg4</sub> | GLACIAL · TAREO · DISTRIBUCIÓN DE PERSONAL (pantalla) — Pestaña «Distribución de personal» del Tareo de Producción. Edita y consulta la fuente comp… | `glacialDistribucionPantalla`w `renderDistribucionPersonal`w | `45-indicadores`(1), `02-estado`(1), `13-tareo`(2), `20-tareo-control`(1), `30-rotacion-mantenimiento`(1), `33-rotacion-maquinistas`(1), `37b-mantenimiento-identificacion`(1), `37c-equipos-catalogo`(1) … +7 | — |
| 84 | `45-supervisor-en-turno` <sub>20261127-sp1</sub> | GLACIAL · SUPERVISOR EN TURNO (quién está en cada área) — Cada supervisor, al entrar a su turno, indica en qué área está: | `glacialSupervisorTurno`w | `00b-puente-supabase`(1), `01-config`(1), `45-indicadores`(1), `02-estado`(2), `17b-ventana-supervisor`(1), `23b-modo-visualizacion`(2), `41-tareo-bloqueo`(1) ⚠, `47-analisis-paradas`(1) ⚠ … +3 | — |
| 85 | `40-tareo-auditoria` <sub>20261120-qa1</sub> | GLACIAL · TAREO — AUDITORÍA (colección auditoriaTareos) — Registra, sin tocar la lógica de 13-tareo.js, quién cambió qué en un tareo. | `guardarTareoEnMemoria`w `eliminarTareo`w `onTareosUpdated`w `tareoAuditoriaInstalar`w `tareoAuditoriaEvento`w `tareoAuditoriaRegistrar`w · 1 _priv | `00b-puente-supabase`(1), `01-config`(2), `02-estado`(2), `13-tareo`(13), `45-tareo-edicion-continua`(1), `46-tareo-horas-extras`(1), `37f-tareo-por-tecnico`(1), `41-tareo-bloqueo`(3) ⚠ … +1 | `eliminarTareo` `guardarTareoEnMemoria` `onTareosUpdated` |
| 86 | `41-tareo-bloqueo` <sub>20261102-pal2</sub> | GLACIAL · TAREO — BLOQUEO POR PLAZO — Un tareo queda BLOQUEADO (solo lectura) cuando pasan N días desde el fin | `tareoAhoraServidor`w `tareoRelojVerificado`w `tareoBloqueoInfo`w `tareoEstadoBloqueo`w `tareoBloqueoConfig`w `tareoHorasIngreso`w `tareoPuedeEditar`w … +13 | `00b-puente-supabase`(1), `01-config`(2), `01b-fecha-operativa`(1), `02-estado`(3), `03-auth`(2), `13-tareo`(19), `20-tareo-control`(1), `23b-modo-visualizacion`(2) … +18 | `enterApp` `guardarTareoEnMemoria` `handleLogout` `renderTareoFormulario` `renderTareoLectura` `tareoAutorizadoEscribir` … +5 |

### Mantenimiento · `js/mantenimiento/`

| # | Archivo (`?v=`) | Propósito | Expone | Depende de | Sobrescribe |
|---|---|---|---|---|---|
| 31 | `18-mantenimiento` <sub>20261002-tareo-permisos-1</sub> | MÓDULO DE MANTENIMIENTO | `renderMantenimientoModulo`ƒ | `02-estado`(1), `13-tareo`(5) ⚠, `38-tareo-rrhh-exportacion`(1) ⚠ | `renderMantenimientoModulo` `tareoAreaVista` |
| 60 | `30-rotacion-mantenimiento` <sub>20261010-vis1</sub> | GLACIAL · ROTACIÓN SEMANAL DE MANTENIMIENTO — Solo Supervisor de Mantenimiento / Jefe de Mantenimiento. | `puedeGestionarRotacionMtto`w `mttoRotacionSoloVer`w `mttoMoverSemana`w `mttoIrSemanaActual`w `borradorMtto`w `mttoCambiarTurno`w `mttoAplicarAsignacion`w … +11 | `02-estado`(6), `18-mantenimiento`(1), `13-tareo`(5), `20-tareo-control`(1), `23b-modo-visualizacion`(3), `28-tareo-maquinistas`(2), `31a-rotacion-grid`(1), `33-rotacion-maquinistas`(1) ⚠ … +9 | `renderMantenimientoModulo` `tareoRenderTabs` |
| 61 | `33-rotacion-maquinistas` <sub>20261102-pal2</sub> | GLACIAL · ROTACIÓN SEMANAL DE MAQUINISTAS — Pestaña "Rotación maquinista" del Tareo (junto a "Rotación semanal"). | `puedeGestionarRotacionMaquinistas`w `rotacionMaquinistasDia`w `rotacionMaquinistasVigente`w `onRotacionMaquinistasUpdated`w `renderRotacionMaquinistas`w `rotMaqAplicarAsignacion`w `rotMaqQuitarId`w … +12 | `02-estado`(6), `13-tareo`(9), `20-tareo-control`(1), `23b-modo-visualizacion`(3), `28-tareo-maquinistas`(1), `31a-rotacion-grid`(1), `30-rotacion-mantenimiento`(2), `37b-mantenimiento-identificacion`(1) ⚠ … +6 | `tareoRenderTabs` |
| 72 | `37-mantenimiento-tecnicos` <sub>20261102-leg3</sub> | GLACIAL · MANTENIMIENTO — CUENTA COMPARTIDA CON IDENTIFICACIÓN INDIVIDUAL | `ROL_MANT_COMPARTIDO`w `PERMISOS_MANT_COMPARTIDO`w `esMantCompartido`w `cambiarRolNuevoUsuario`w `abrirCentroPerfil`w `renderSidebar`w | `02-estado`(3), `04-sidebar`(2), `10-usuarios`(1), `23b-modo-visualizacion`(3), `37b-mantenimiento-identificacion`(1) ⚠, `71-asistente-datos`(1) ⚠, `75-inventario-insumos-datos`(1) ⚠, `98-calidad-permisos`(1) ⚠ … +2 | `abrirCentroPerfil` `cambiarRolNuevoUsuario` `normalizarPermisosUsuario` `renderSidebar` |
| 73 | `37b-mantenimiento-identificacion` <sub>20261121-leg4</sub> | GLACIAL · MANTENIMIENTO — FASE B · IDENTIFICACIÓN INDIVIDUAL DEL TÉCNICO (PIN) | `mantTecnicoActivo`w `mantNombreOperador`w `mantCerrarIdentificacion`w `mantAbrirIdentificacion`w `mantConfigurarIdentificacion`w `tareoRenderTabs`w `enterApp`w … +2 · 1 _priv | `00b-puente-supabase`(1), `01-config`(2), `04b-busqueda`(1), `02-estado`(4), `03-auth`(2), `04-sidebar`(1), `05-utils`(1), `13-tareo`(3) … +14 | `enterApp` `handleLogout` `renderSidebar` `tareoRenderTabs` |
| 74 | `37c-equipos-catalogo` <sub>20261012-pm1</sub> | EQUIPOS POR LÍNEA · catálogo editable y selector «Equipo» para las paradas por «Falla de máquina» | `tareoRenderTabs`w `glacialEquipos`w | `01-config`(1), `02-estado`(3), `13-tareo`(2), `20-tareo-control`(1), `23b-modo-visualizacion`(1), `30-rotacion-mantenimiento`(2), `33-rotacion-maquinistas`(1), `37-mantenimiento-tecnicos`(1) … +6 | `tareoRenderTabs` |
| 75 | `37d-equipos-maestro` <sub>20261101-ie3</sub> | MANTENIMIENTO · CATÁLOGO DE EQUIPOS (maestro) | `glacialEquiposMaestro`w | `01-config`(2), `02-estado`(2), `23b-modo-visualizacion`(2), `30-rotacion-mantenimiento`(1), `37-mantenimiento-tecnicos`(1), `41-tareo-bloqueo`(1) ⚠, `44-estado-datos`(1) ⚠ | — |
| 76 | `37e-motivos-parada` <sub>20261102-pal2</sub> | MOTIVOS DE PARADA · catálogo de causas y motivos (dos niveles) editable, para las paradas NO programadas | `tareoRenderTabs`w `glacialMotivosParada`w | `01-config`(1), `02-estado`(3), `13-tareo`(2), `20-tareo-control`(1), `23b-modo-visualizacion`(1), `30-rotacion-mantenimiento`(2), `33-rotacion-maquinistas`(1), `37-mantenimiento-tecnicos`(1) … +5 | `tareoRenderTabs` |
| 78 | `37f-tareo-por-tecnico` <sub>20261016-tt1</sub> | GLACIAL · MANTENIMIENTO — TAREO POR TÉCNICO EN LA CUENTA COMPARTIDA | `obtenerTareos`w `obtenerResumenMensualTareo`w `guardarTareos`w · 1 _priv | `02-estado`(3), `13-tareo`(8), `20-tareo-control`(1), `30-rotacion-mantenimiento`(1), `33-rotacion-maquinistas`(1), `37-mantenimiento-tecnicos`(1), `37b-mantenimiento-identificacion`(2), `37c-equipos-catalogo`(1) … +4 | `guardarTareoEnMemoria` `guardarTareos` `obtenerResumenMensualTareo` `obtenerTareos` `renderTareoFormulario` `renderTareoLectura` … +1 |
| 87 | `43-bitacora-mantenimiento` <sub>20261103-fx6</sub> | BITÁCORA DE MANTENIMIENTO + TARJETA «PARADAS DE HOY» | `puedeVerBitacoraMtto`w `renderBitacoraMtto`w `bitacoraMttoEquipoDe`w `bitacoraMttoExportar`w `renderCentroPerfil`w `bitacoraMttoAvisoCierre`w `bitacoraMttoPendientes`w … +4 · 2 _priv | `00b-puente-supabase`(1), `01-config`(3), `02-estado`(4), `04-sidebar`(4), `06-registro`(1), `13-tareo`(1), `23b-modo-visualizacion`(4), `24-semaforo-produccion-actual`(1) … +19 | `ajustarVistaSegunPermisos` `avGenerarCierreAhora` `grupoSidebarActivo` `renderCentroPerfil` `renderMain` `renderSidebar` |
| 90 | `67i-graficos` <sub>20261102-leg3</sub> | MANTENIMIENTO · GRÁFICOS DINÁMICOS Y ESTILO VISUAL DEL MÓDULO | `glacialGraficos`w | `02-estado`(1) | — |
| 122 | `67-intervenciones-motor` <sub>20261018-fo3</sub> | MANTENIMIENTO · INTERVENCIONES (órdenes de trabajo) · MOTOR PURO | `GlacialIntervenciones`w | — | — |
| 123 | `67b-intervenciones-datos` <sub>20261030-bp1</sub> | MANTENIMIENTO · INTERVENCIONES · PERSISTENCIA, PERMISOS Y LECTURA EN VIVO | `glacialIntervenciones`w | `00b-puente-supabase`(1), `01-config`(1), `02-estado`(3), `23b-modo-visualizacion`(3), `37-mantenimiento-tecnicos`(1), `37b-mantenimiento-identificacion`(1), `37d-equipos-maestro`(1), `41-tareo-bloqueo`(1) … +6 | — |
| 124 | `67c-intervenciones-pantalla` <sub>20261121-pal3</sub> | MANTENIMIENTO · INTERVENCIONES · PANTALLA (Intervenciones · Preventivos · Equipos · Indicadores) | `glacialMantPestanas`w `intervencionesAbrir`w `goIntervenciones`w `glacialMantUI`w | `01-config`(1), `04b-busqueda`(1), `02-estado`(4), `04-sidebar`(4), `06-registro`(1), `13-tareo`(1), `23b-modo-visualizacion`(2), `28-tareo-maquinistas`(1) … +11 | `ajustarVistaSegunPermisos` `grupoSidebarActivo` `renderMain` `renderSidebar` |
| 125 | `67d-intervenciones-evidencias` <sub>20261102-leg3</sub> | MANTENIMIENTO · INTERVENCIONES · EVIDENCIAS FOTOGRÁFICAS (desde el celular) | `glacialEvidenciasHtml`w `glacialEvidenciasPostRender`w `glacialFotosDeEquipo`w `glacialEvidenciasConfigHtml`w `glacialEvidencias`w | `02-estado`(2), `06b-fotos-supabase`(1), `37d-equipos-maestro`(1), `44-estado-datos`(1), `67-intervenciones-motor`(1), `67b-intervenciones-datos`(1), `67c-intervenciones-pantalla`(2) | — |
| 126 | `67e-preventivos` <sub>20261121-pal3</sub> | MANTENIMIENTO · PLAN PREVENTIVO (por equipo) · tareas, responsables, ejecuciones y avisos internos | `glacialMantAvisos`w `glacialPreventivosResumen`w `glacialPreventivosDetalleHtml`w `glacialPreventivos`w | `00b-puente-supabase`(1), `01-config`(1), `01b-fecha-operativa`(1), `04b-busqueda`(1), `45-indicadores`(1), `02-estado`(3), `37-mantenimiento-tecnicos`(1), `37b-mantenimiento-identificacion`(1) … +6 | — |
| 127 | `67f-indicadores-equipo` <sub>20261013-gm1</sub> | MANTENIMIENTO · INDICADORES POR EQUIPO (MTTR y MTBF) — solo con datos suficientes | `glacialIndicadoresEquipo`w | `45-indicadores`(1), `02-estado`(1), `37d-equipos-maestro`(1), `41-tareo-bloqueo`(1), `67i-graficos`(1), `47-analisis-paradas`(1), `67-intervenciones-motor`(1), `67b-intervenciones-datos`(1) … +1 | — |
| 128 | `67g-reclasificacion-datos` <sub>20261030-rc2</sub> | RECLASIFICAR PARADAS · persistencia, lectura en vivo y reglas de la reclasificación | `glacialReclasificaciones`w | `00b-puente-supabase`(1), `01-config`(1), `02-estado`(1), `37-mantenimiento-tecnicos`(1), `37c-equipos-catalogo`(1), `37e-motivos-parada`(1), `41-tareo-bloqueo`(1), `44-estado-datos`(1) … +2 | — |
| 129 | `67h-reclasificacion-pantalla` <sub>20261013-gm1</sub> | RECLASIFICAR PARADAS · pantalla (pestaña «Reclasificar paradas» del módulo Mantenimiento) | `glacialReclasificarPantalla`w | `01-config`(1), `45-indicadores`(1), `02-estado`(2), `37c-equipos-catalogo`(1), `37e-motivos-parada`(1), `41-tareo-bloqueo`(1), `67i-graficos`(1), `47-analisis-paradas`(1) … +2 | `onProgramacionesUpdated` `onRecordsUpdated` |
| 130 | `70-banco-paradas` <sub>20261121-bp2</sub> | BANCO DE PARADAS POR CLASIFICAR (Mantenimiento › Intervenciones y equipos › Banco de paradas) | `glacialBancoParadas`w | `01-config`(1), `04b-busqueda`(1), `45-indicadores`(1), `02-estado`(2), `41-tareo-bloqueo`(1), `47-analisis-paradas`(1), `67g-reclasificacion-datos`(1) | `onProgramacionesUpdated` `onRecordsUpdated` |
| 131 | `69-velocidades-estandar` <sub>20261102-pal2</sub> | MANTENIMIENTO · VELOCIDADES ESTÁNDAR (UND/h por línea y formato) con historial | `glacialConfigIndicadoresOyentes`w `goVelocidadesEstandar`w `glacialVelocidadesPantalla`w | `01-config`(3), `01b-fecha-operativa`(1), `45b-velocidades-vigencia`(1), `02-estado`(3), `04-sidebar`(3), `06-registro`(1), `13-tareo`(1), `23b-modo-visualizacion`(3) … +10 | `ajustarVistaSegunPermisos` `renderMain` `renderSidebar` |
| 132 | `71-plan-anual-nucleo` <sub>20261121-fo7</sub> | MANTENIMIENTO · PLAN ANUAL · núcleo puro (sin pantalla ni base) | `glacialMttoPlan`w | `04b-busqueda`(1), `05-utils`(1) | — |
| 133 | `72-plan-anual-datos` <sub>20261113-fo5</sub> | MANTENIMIENTO · PLAN ANUAL · datos (tablas mtto_* de la migración glacial_47) | `glacialMttoPlanDatos`w | `00b-puente-supabase`(1), `71-plan-anual-nucleo`(1) | — |
| 134 | `74-plan-anual-impresion` <sub>20261108-pa4</sub> | MANTENIMIENTO · PLAN ANUAL · impreso por máquina y exportación a Excel (punto 5.2) | `glacialMttoPlanImpresion`w | `71-plan-anual-nucleo`(1) | — |
| 135 | `75-programa-semanal-pantalla` <sub>20261121-s47</sub> | MANTENIMIENTO · PROGRAMA SEMANAL · pantalla (punto 4.2) | `glacialMttoTabs`w `goProgramaSemanalMtto`w `glacialMttoProgramaSemanal`w | `01b-fecha-operativa`(1), `02-estado`(2), `04-sidebar`(3), `06-registro`(1), `13-tareo`(1), `23b-modo-visualizacion`(2), `37-mantenimiento-tecnicos`(1), `37b-mantenimiento-identificacion`(1) … +7 | `ajustarVistaSegunPermisos` `renderMain` `renderSidebar` |
| 136 | `76-registro-pantalla` <sub>20261121-fo6</sub> | MANTENIMIENTO · REGISTRO CFA-CA-F-023 · pantalla (pensada primero para el celular) (punto 4.3) | `glacialMttoRegistroPantalla`w | `01b-fecha-operativa`(1), `02-estado`(3), `04-sidebar`(2), `06b-fotos-supabase`(1), `06-registro`(1), `13-tareo`(1), `23b-modo-visualizacion`(2), `33-rotacion-maquinistas`(1) … +11 | `ajustarVistaSegunPermisos` `renderMain` |
| 137 | `77-registro-impresion` <sub>20261113-hs3</sub> | MANTENIMIENTO · REGISTRO CFA-CA-F-023 · impreso A4 horizontal, 1 sola hoja (punto 5.1) | `glacialMttoRegistroImpresion`w `glacialMttoRegistroImpresionPuro`w | `71-plan-anual-nucleo`(1), `72-plan-anual-datos`(1) | — |
| 138 | `78-historial-pantalla` <sub>20261113-hs2</sub> | MANTENIMIENTO · HISTORIAL DE REGISTROS · pantalla (punto 4.4) | `goHistorialMtto`w `glacialMttoHistorial`w | `01b-fecha-operativa`(1), `02-estado`(2), `04-sidebar`(3), `06-registro`(1), `13-tareo`(1), `23b-modo-visualizacion`(2), `37-mantenimiento-tecnicos`(1), `37b-mantenimiento-identificacion`(1) … +8 | `ajustarVistaSegunPermisos` `renderMain` `renderSidebar` |
| 139 | `79-paradas-mantenimiento` <sub>20261113-pr1</sub> | MANTENIMIENTO ↔ PRODUCCIÓN · paradas por falla de cada máquina del plan | `glacialMttoParadas`w | `01-config`(1), `45-indicadores`(1), `02-estado`(1), `37c-equipos-catalogo`(1), `37e-motivos-parada`(1), `41-tareo-bloqueo`(1), `47-analisis-paradas`(1), `71-plan-anual-nucleo`(1) … +2 | — |
| 140 | `73-plan-anual-pantalla` <sub>20261121-hs6</sub> | MANTENIMIENTO · PLAN ANUAL · pantalla | `goPlanAnualMtto`w `glacialMttoPlanPantalla`w | `01b-fecha-operativa`(1), `04b-busqueda`(1), `02-estado`(3), `04-sidebar`(3), `06-registro`(1), `13-tareo`(1), `23b-modo-visualizacion`(4), `37-mantenimiento-tecnicos`(2) … +12 | `ajustarVistaSegunPermisos` `renderMain` `renderSidebar` |
| 141 | `68-mantenimiento-inicio` <sub>20261121-hs5</sub> | MANTENIMIENTO · INICIO (pantalla de entrada del módulo, ordenada por tareas) | `goMantenimientoInicio`w `glacialMantInicio`w | `01b-fecha-operativa`(1), `02-estado`(2), `04-sidebar`(4), `06-registro`(1), `13-tareo`(1), `23b-modo-visualizacion`(2), `37-mantenimiento-tecnicos`(1), `37b-mantenimiento-identificacion`(1) … +16 | `ajustarVistaSegunPermisos` `renderMain` `renderSidebar` |

### RRHH · `js/rrhh/`

| # | Archivo (`?v=`) | Propósito | Expone | Depende de | Sobrescribe |
|---|---|---|---|---|---|
| 32 | `19-rrhh` <sub>sin ?v=</sub> | MÓDULO DE RRHH | `renderRRHHModulo`ƒ | `02-estado`(1), `13-tareo`(1) ⚠, `23b-modo-visualizacion`(1) ⚠, `71-asistente-datos`(1) ⚠, `75-inventario-insumos-datos`(1) ⚠, `98-calidad-permisos`(1) ⚠ | `renderRRHHModulo` |
| 49 | `26-rrhh-panel` <sub>20261121-pal3</sub> | GLACIAL · Inicio de RRHH: pendientes del tareo en tiempo real. | `renderRRHHModulo`w | `02-estado`(5), `19-rrhh`(1), `13-tareo`(12), `20-tareo-control`(3), `46-tareo-horas-extras`(1), `23b-modo-visualizacion`(2), `30-rotacion-mantenimiento`(1) ⚠, `33-rotacion-maquinistas`(1) ⚠ … +10 | `onTareosUpdated` `renderRRHHModulo` `tareoRenderTabs` |
| 50 | `27-rrhh-excel-operativo` <sub>20261120-fl1</sub> | GLACIAL · Excel de tareo con personal operativo y responsables. | `exportarTareoExcel`w `exportarTareoGeneralExcel`w | `02-estado`(2), `13-tareo`(15), `28-tareo-maquinistas`(1) ⚠, `38-tareo-rrhh-exportacion`(2) ⚠, `37f-tareo-por-tecnico`(1) ⚠ | `exportarTareoExcel` `exportarTareoGeneralExcel` |
| 77 | `38-tareo-rrhh-exportacion` <sub>20261120-fl1</sub> | GLACIAL · TAREO — LISTA ÚNICA, GRUPOS DE RRHH, EXCEL E IMAGEN | `tareoGrupoRRHH`w `TAREO_GRUPOS_RRHH`w `tareoListaUnica`w `exportarExcelRRHH`w `tareoGenerarImagenesRRHH`w `abrirExportacionRRHH`w `exportarTareoExcel`w … +5 · 7 _priv | `02-estado`(3), `13-tareo`(32), `20-tareo-control`(1), `27-rrhh-excel-operativo`(2), `28-tareo-maquinistas`(1), `30-rotacion-mantenimiento`(1), `33-rotacion-maquinistas`(1), `37b-mantenimiento-identificacion`(1) … +5 | `exportarTareoExcel` `exportarTareoGeneralExcel` `exportarTareoPNG` `renderTareoGeneral` `sheetsReenviarTareo` `tareoRenderTabs` … +1 |

### Asistente · `js/asistente/`

| # | Archivo (`?v=`) | Propósito | Expone | Depende de | Sobrescribe |
|---|---|---|---|---|---|
| 143 | `70-asistente-nucleo` <sub>20261117-ad4</sub> | GLACIAL · ASISTENTE DE PRODUCCIÓN — NÚCLEO DE CÁLCULO (puro, sin Firestore ni pantalla) | `glacialAsistenteNucleo`w | — | — |
| 144 | `71-asistente-datos` <sub>20261116-pm2</sub> | GLACIAL · ASISTENTE DE PRODUCCIÓN — DATOS (Firestore), PERMISOS Y AUDITORÍA | `tienePermiso`w `glacialFactoresCatalogoEscuchas`w `glacialFactoresCatalogo`w `glacialAsistenteDatos`w | `00b-puente-supabase`(1), `01-config`(1), `02-estado`(3), `23b-modo-visualizacion`(2), `41-tareo-bloqueo`(1), `70-asistente-nucleo`(1), `75-inventario-insumos-datos`(1) ⚠, `98-calidad-permisos`(1) ⚠ … +1 | `tienePermiso` |
| 145 | `72-asistente-pantalla` <sub>20261125-kx3</sub> | GLACIAL · ASISTENTE DE PRODUCCIÓN — PANTALLA (diseño aprobado) | `apCerrarMsg`w `AP_set`w `apIr`w `apEnfocar`w `apIrConteo`w `apEvidNombre`w `apSolicitarFaltantes`w … +47 | `00b-puente-supabase`(1), `01-config`(1), `01b-fecha-operativa`(1), `45-indicadores`(2), `02-estado`(4), `04-sidebar`(2), `05-utils`(1), `06b-fotos-supabase`(1) … +26 | `ajustarVistaSegunPermisos` `onPaletasUpdated` `onProgramacionesUpdated` `renderMain` `renderSidebar` |
| 146 | `73-reporte-general` <sub>20261123-pt13</sub> | GLACIAL · REPORTE GENERAL DE PRODUCCIÓN (Excel consolidado, formato aprobado) | `glacialReporteGeneral`w | `01-config`(1), `45-indicadores`(1), `02-estado`(4), `05-utils`(2), `06-registro`(1), `08-graficos`(2), `16-paletas`(1), `13-tareo`(1) … +9 | — |
| 147 | `74-inventario-insumos-nucleo` <sub>20261121-lc7</sub> | GLACIAL · INVENTARIO DE INSUMOS — NÚCLEO (puro: sin Firestore ni pantalla; se prueba con node) | `glacialInventarioNucleo`w | `04b-busqueda`(1) | — |
| 148 | `75-inventario-insumos-datos` <sub>20261116-pm2</sub> | GLACIAL · INVENTARIO DE INSUMOS — DATOS (capa documento: db.collection / onSnapshot / runTransaction), PERMISOS Y AUDITORÍA | `tienePermiso`w `glacialInventarioDatos`w | `00b-puente-supabase`(1), `01-config`(1), `02-estado`(3), `23b-modo-visualizacion`(2), `41-tareo-bloqueo`(1), `71-asistente-datos`(1), `74-inventario-insumos-nucleo`(1), `98-calidad-permisos`(1) ⚠ | `tienePermiso` |
| 149 | `76-inventario-insumos-pantalla` <sub>20261121-al8</sub> | GLACIAL · INVENTARIO DE INSUMOS — PANTALLA (Fase 1: Stock actual, Catálogo e Importar stock SAP) | `iiTexto`w `iiFiltro`w `iiTab`w `iiMasFilas`w `iiCorte`w `iiCerrar`w `iiEditar`w … +14 · 1 _priv | `02-estado`(2), `04-sidebar`(3), `06-registro`(1), `13-tareo`(1), `23b-modo-visualizacion`(2), `37-mantenimiento-tecnicos`(2), `37b-mantenimiento-identificacion`(1), `74-inventario-insumos-nucleo`(1) … +10 | `ajustarVistaSegunPermisos` `renderMain` `renderSidebar` |
| 150 | `77-inventario-insumos-conteo` <sub>20261121-pal3</sub> | GLACIAL · INVENTARIO DE INSUMOS — CONTEO FÍSICO (Fase 2): pestaña «Conteo físico» | `iicTexto`w `iicFiltro`w `iicMas`w `iicAbrir`w `iicVolver`w `iicForm`w `iicAgregar`w … +23 · 1 _priv | `02-estado`(1), `74-inventario-insumos-nucleo`(1), `75-inventario-insumos-datos`(1), `76-inventario-insumos-pantalla`(1), `12-init`(1) ⚠ | — |
| 151 | `78-inventario-insumos-conciliacion` <sub>20261121-pal3</sub> | GLACIAL · INVENTARIO DE INSUMOS — CONCILIACIÓN SAP vs CONTEO (Fase 3): pestaña «Conciliación» y Excel | `glacialInventarioExcel`w `iiqConteo`w `iiqEstado`w `iiqTexto`w `iiqMas`w `iiqComentario`w `iiqExportar`w … +1 · 1 _priv | `04b-busqueda`(1), `02-estado`(2), `08-graficos`(2), `74-inventario-insumos-nucleo`(1), `75-inventario-insumos-datos`(1), `76-inventario-insumos-pantalla`(1) | — |
| 152 | `79-inventario-insumos-auditoria` <sub>20261018-ii9</sub> | GLACIAL · INVENTARIO DE INSUMOS — AUDITORÍA (Fase 4): pestaña «Auditoría» | `iiaFecha`w `iiaFiltro`w `iiaTexto`w `iiaExportar`w `iiaMas`w `iiaActualizar`w `iiAuditoriaUI`w · 1 _priv | `02-estado`(1), `74-inventario-insumos-nucleo`(1), `75-inventario-insumos-datos`(1), `76-inventario-insumos-pantalla`(1), `78-inventario-insumos-conciliacion`(1) | — |
| 153 | `84-evidencias-insumos-nucleo` <sub>20261121-calc2</sub> | GLACIAL · EVIDENCIAS DE INSUMOS — NÚCLEO (puro: sin Firestore ni pantalla; se prueba con node) | `glacialEvidenciasNucleo`w | `04b-busqueda`(1) | — |
| 154 | `85-evidencias-insumos-datos` <sub>20261121-lc5</sub> | GLACIAL · EVIDENCIAS DE INSUMOS — DATOS (capa documento + foto privada + auditoría) | `glacialEvidenciasDatos`w | `00b-puente-supabase`(1), `01-config`(1), `06b-fotos-supabase`(1), `75-inventario-insumos-datos`(1), `84-evidencias-insumos-nucleo`(1) | — |
| 155 | `86-evidencias-insumos-pantalla` <sub>20261121-ev2</sub> | GLACIAL · EVIDENCIAS DE INSUMOS — PANTALLA: pestaña «Evidencias» del Inventario de insumos (Asistente de Producción) | `ieUsarCalc`w `ieCalc`w `ieBuscarNuevas`w `ieSel`w `ieFiltro`w `ieTexto`w `ieCampo`w … +13 · 1 _priv | `02-estado`(1), `06b-fotos-supabase`(1), `06-registro`(1), `84-evidencias-insumos-nucleo`(1), `85-evidencias-insumos-datos`(1), `89-trazabilidad-lotes-pantalla`(1) ⚠, `95-conversiones`(1) ⚠, `98-validar-rapido`(1) ⚠ … +1 | — |
| 156 | `87-trazabilidad-lotes-nucleo` <sub>20261121-ev2</sub> | GLACIAL · TRAZABILIDAD DE LOTES DE INSUMOS — NÚCLEO (puro: sin Firestore ni pantalla; se prueba con node) | `glacialTrazabilidadNucleo`w | `04b-busqueda`(1) | — |
| 157 | `88-trazabilidad-lotes-datos` <sub>20261121-ev2</sub> | GLACIAL · TRAZABILIDAD DE LOTES — DATOS (capa documento + transacciones + auditoría) | `glacialTrazabilidadDatos`w | `01-config`(1), `01b-fecha-operativa`(1), `75-inventario-insumos-datos`(1), `84-evidencias-insumos-nucleo`(1), `85-evidencias-insumos-datos`(1), `87-trazabilidad-lotes-nucleo`(1), `96-proveedores`(1) ⚠ | — |
| 158 | `89-trazabilidad-lotes-pantalla` <sub>20261121-ev2</sub> | GLACIAL · TRAZABILIDAD DE LOTES — PANTALLA: pestaña «Lotes» del Asistente de Producción y el diálogo «Confirmar y crear lote» | `ilEntLinea`w `ilEntU`w `ilEntLote`w `ilEntTexto`w `ilEntregarSel`w `ilGuardarParametros`w `ilVista`w … +25 · 1 _priv | `01b-fecha-operativa`(1), `04b-busqueda`(1), `02-estado`(1), `06b-fotos-supabase`(1), `06-registro`(1), `41-tareo-bloqueo`(1), `72-asistente-pantalla`(1), `84-evidencias-insumos-nucleo`(1) … +8 | — |
| 159 | `90-control-proceso-nucleo` <sub>20261110-cp6</sub> | GLACIAL · CONTROL DE PROCESO EN EL ENVASADO (CF - CA - F - 047) — NÚCLEO (puro: sin ExcelJS ni pantalla; se prueba con node) | `glacialControlProcesoNucleo`w | — | — |
| 160 | `91-control-proceso-excel` <sub>20261106-cp5</sub> | GLACIAL · CONTROL DE PROCESO EN EL ENVASADO (CF - CA - F - 047) — EXCEL + TARJETA EN LA PESTAÑA «LOTES» | `cpSincronizar`w `cpLinea`w `cpMes`w `cpExportar`w `iiControlProcesoUI`w | `00b-puente-supabase`(1), `45-indicadores`(1), `02-estado`(3), `08-graficos`(2), `88-trazabilidad-lotes-datos`(1), `90-control-proceso-nucleo`(1) | — |
| 161 | `92-lotes-en-cuadro` <sub>20261113-pf1</sub> | LOTES DE INSUMO USADOS EN EL CUADRO (Etapa 2 de la trazabilidad de lotes) | `GlacialLotesEnCuadro`w `loteUnidadesEstimadas`w `lotesCuadroHtml`w `loteCuadroAlternar`w `lotesEnUsoLinea`w `loteCuadroManual`w | `01-config`(1), `01b-fecha-operativa`(1), `02-estado`(4), `06-registro`(5), `35-autollenado-registro`(1), `35c-autollenado-completo`(1), `87-trazabilidad-lotes-nucleo`(1), `93-lotes-uso-cuadro`(1) ⚠ … +1 | — |
| 162 | `93-lotes-uso-cuadro` <sub>20261113-pf1</sub> | USO EN EL CUADRO Y PESO FINAL (Etapa 2b de la trazabilidad de lotes) — acciones del supervisor | `loteUsoMarcar`w `loteUsoCerrar`w `lotesEnUsoTodas`w · 1 _priv | `00b-puente-supabase`(1), `01-config`(1), `02-estado`(3), `06-registro`(1), `41-tareo-bloqueo`(1), `70-asistente-nucleo`(1), `87-trazabilidad-lotes-nucleo`(1), `92-lotes-en-cuadro`(2) | — |
| 163 | `94-trazabilidad-informe` <sub>20261121-tz3</sub> | GLACIAL · INFORME DE TRAZABILIDAD (auditoría 2026-11-06, T1) | `glacialTrazabilidadInforme`w `itTexto`w `itFiltro`w `itBuscar`w `itExcel`w `iiTrazabilidadInformeUI`w | `02-estado`(3), `08-graficos`(1), `87-trazabilidad-lotes-nucleo`(1), `88-trazabilidad-lotes-datos`(1), `90-control-proceso-nucleo`(1), `92-lotes-en-cuadro`(1) | — |
| 164 | `95-conversiones` <sub>20261121-ad5</sub> | GLACIAL · CONVERSIONES DE MERMAS (Asistente de Producción › Conversiones) | `GlacialConversionesNucleo`w `glacialConversiones`w `glacialConversionesEscuchas`w `cvSel`w `cvBuscar`w `cvCalc`w `cvGramaje`w … +4 | `00b-puente-supabase`(1), `01-config`(3), `04b-busqueda`(1), `02-estado`(2), `06-registro`(1), `23b-modo-visualizacion`(1), `41-tareo-bloqueo`(1), `71-asistente-datos`(1) … +1 | — |
| 165 | `96-proveedores` <sub>20261121-ev2</sub> | GLACIAL · BANCO DE PROVEEDORES (Asistente de Producción › Proveedores) | `glacialProveedoresNucleo`w `glacialProveedores`w `pvVista`w `pvSel`w `pvBuscar`w `pvCrearGrupo`w `pvAgregarGrupo`w … +4 | `01-config`(1), `04b-busqueda`(1), `02-estado`(1), `06-registro`(1), `23b-modo-visualizacion`(1), `41-tareo-bloqueo`(1), `75-inventario-insumos-datos`(1), `85-evidencias-insumos-datos`(1) … +2 | — |
| 166 | `98-validar-rapido` <sub>20261121-vr2</sub> | GLACIAL · EVIDENCIAS › VALIDAR RÁPIDO (auditoría de trazabilidad 13/11/2026, punto 3) | `glacialValidarRapido`w `ieVrBoton`w `ieVrAbrir`w `ieVrCerrar`w `ieVrFiltro`w `ieVrRotar`w `ieVrSugerido`w … +3 · 1 _priv | `02-estado`(1), `06b-fotos-supabase`(1), `84-evidencias-insumos-nucleo`(1), `85-evidencias-insumos-datos`(1), `86-evidencias-insumos-pantalla`(2), `87-trazabilidad-lotes-nucleo`(1), `88-trazabilidad-lotes-datos`(1), `89-trazabilidad-lotes-pantalla`(1) … +1 | — |
| 167 | `99-asistente-hielo` <sub>20261125-ah1</sub> | ASISTENTE DE PRODUCCIÓN · PESTAÑA HIELO | `apHieloVista`w `apHieloExcel`w `apHieloIr`w `glacialAsistenteHielo`w | `01-config`(1), `46-vista-excel`(1), `02-estado`(1), `03-auth`(1), `08-graficos`(2), `72-asistente-pantalla`(1), `97-hielo`(3) ⚠, `99-hielo-reporte-diario`(1) ⚠ | — |
| 191 | `80-almacen-enlace-nucleo` <sub>20261118-kx1</sub> | GLACIAL · ASISTENTE ↔ INVENTARIO DE INSUMOS — ENLACE CON ALMACÉN: NÚCLEO PURO | `glacialAlmacenEnlace`w | — | — |
| 192 | `81-almacen-enlace-datos` <sub>20261118-kx1</sub> | GLACIAL · ASISTENTE ↔ INVENTARIO DE INSUMOS — ENLACE CON ALMACÉN: DATOS | `glacialAlmacenEnlaceDatos`w | `01-config`(1), `02-estado`(1), `71-asistente-datos`(1), `80-almacen-enlace-nucleo`(1) | — |
| 193 | `82-asistente-prevision-nucleo` <sub>20261112-dv1</sub> | GLACIAL · ASISTENTE DE PRODUCCIÓN — PREVISIÓN, ALERTAS Y DESVIACIÓN DE CONSUMO: NÚCLEO PURO | `glacialAsistentePrevision`w | `70-asistente-nucleo`(1) | — |
| 194 | `83-asistente-reportes-pantalla` <sub>20261123-pt13</sub> | GLACIAL · ASISTENTE DE PRODUCCIÓN — REPORTES EN EXCEL CON PREVISUALIZACIÓN Y CORRECCIÓN (Historial › Reportes) | `apRepLinea`w `apRepDescargar`w `apRepDescargarPrevia`w `apRepPrevia`w `apRepCorregir`w `apRepVerExcel`w `apRepLineaSel`w … +7 | `46-vista-excel`(1), `70-asistente-nucleo`(1), `71-asistente-datos`(1), `72-asistente-pantalla`(1), `73-reporte-general`(1), `12-init`(1) ⚠ | — |

### Calidad · `js/calidad/`

| # | Archivo (`?v=`) | Propósito | Expone | Depende de | Sobrescribe |
|---|---|---|---|---|---|
| 168 | `98-calidad-permisos` <sub>20261115-cp1</sub> | GLACIAL · CALIDAD · PERMISOS (Gestión de usuarios › área «Calidad») | `tienePermiso`w `glacialCalidadPermisos`w | `02-estado`(4), `23b-modo-visualizacion`(2), `71-asistente-datos`(1), `75-inventario-insumos-datos`(1) | `tienePermiso` |
| 169 | `99-validacion-lotes` <sub>20261126-rt3</sub> | GLACIAL · CALIDAD › VALIDACIÓN DE LOTES — Muestra lo que valida el bot de WhatsApp (glacial-whatsapp): una fila por validación con su resultado (OK… | `vlSet`w `vlDia`w `vlMes`w `vlBuscar`w `vlActualizar`w `vlAbrir`w `vlNota`w … +2 | `00b-puente-supabase`(1), `04b-busqueda`(1), `06b-fotos-supabase`(1), `98-calidad-permisos`(1) | — |
| 170 | `100-calidad-pantalla` <sub>20261119-rt1</sub> | GLACIAL · CALIDAD (módulo propio del menú lateral) — Pestaña de la aplicación: state.currentTab='calidad', grupo «Calidad» del menú (#btn-calidad-v… | `goCalidad`w `glacialCalidadUI`w | `02-estado`(1), `04-sidebar`(3), `06-registro`(1), `13-tareo`(1), `23b-modo-visualizacion`(2), `37-mantenimiento-tecnicos`(1), `37b-mantenimiento-identificacion`(1), `98-calidad-permisos`(1) … +2 | `ajustarVistaSegunPermisos` `renderMain` `renderSidebar` |

### Almacén · `js/almacen/`

| # | Archivo (`?v=`) | Propósito | Expone | Depende de | Sobrescribe |
|---|---|---|---|---|---|
| 171 | `101-producto-terminado` <sub>20261118-al2</sub> | GLACIAL · ALMACÉN › INGRESO DE PRODUCTO TERMINADO — Producción anota las paletas que arma (js/produccion/16-paletas.js · sync/paletas). Aquí Almacé… | `ptTab`w `ptSaldo`w `ptSaldoCerrar`w `ptCantidad`w `ptSaldoConfirmar`w `ptUnidad`w `ptGrupo`w … +10 | `00b-puente-supabase`(1), `01-config`(1), `01b-fecha-operativa`(1), `02-estado`(3), `04-sidebar`(3), `06-registro`(1), `16-paletas`(1), `13-tareo`(1) … +11 | `ajustarVistaSegunPermisos` `onPaletasUpdated` `renderMain` `renderSidebar` |
| 172 | `102-almaceneros-pin` <sub>20261117-ad6</sub> | GLACIAL · ALMACÉN · ALMACENEROS Y PIN PERSONAL (para la cuenta compartida) | `alElegir`w `alVolver`w `alConfirmar`w `alNombre`w `alAgregar`w `alActivar`w `alReiniciar`w … +1 | `01-config`(1), `02-estado`(1), `41-tareo-bloqueo`(1), `101-producto-terminado`(1), `103-almacen-compartido`(1) ⚠ | — |
| 173 | `103-almacen-compartido` <sub>20261116-al1</sub> | GLACIAL · ALMACÉN — CUENTA COMPARTIDA DE ALMACENEROS (rol `almacen_compartido`) | `ROL_ALMACEN_COMPARTIDO`w `PERMISOS_ALMACEN_COMPARTIDO`w `esAlmacenCompartido`w `cambiarRolNuevoUsuario`w `abrirCentroPerfil`w `enterApp`w | `02-estado`(2), `03-auth`(1), `04-sidebar`(3), `06-registro`(1), `10-usuarios`(1), `23b-modo-visualizacion`(3), `37-mantenimiento-tecnicos`(3), `37b-mantenimiento-identificacion`(2) … +3 | `abrirCentroPerfil` `ajustarVistaSegunPermisos` `cambiarRolNuevoUsuario` `enterApp` `normalizarPermisosUsuario` `renderMain` … +1 |
| 174 | `104-despachos-resumen` <sub>20261118-al2</sub> | GLACIAL · ALMACÉN › PRODUCTO TERMINADO · DESPACHOS Y STOCK · ALERTAS · RESUMEN DEL TURNO | `pdCampo`w `pdLinea`w `pdRegistrar`w `pdAnular`w `pdMotivo`w `pdAnularOk`w `pdResumen`w … +4 | `01-config`(1), `101-producto-terminado`(1) | — |

### Administración · `js/admin/`

| # | Archivo (`?v=`) | Propósito | Expone | Depende de | Sobrescribe |
|---|---|---|---|---|---|
| 180 | `110-admin-nucleo` <sub>20261121-ad8</sub> | GLACIAL · PANEL DE ADMINISTRACIÓN (Centro de control) · NÚCLEO PURO (sin pantalla ni base de datos) | `glacialAdminNucleo`w | `04b-busqueda`(1), `02b-permisos-hielo`(1) | — |
| 181 | `111-admin-acceso-datos` <sub>20261117-ad1</sub> | GLACIAL · PANEL DE ADMINISTRACIÓN · ACCESO, NAVEGACIÓN Y DATOS | `goAdminPanel`w `glacialAdminDatos`w | `00b-puente-supabase`(1), `01-config`(1), `02-estado`(6), `04-sidebar`(4), `06-registro`(1), `13-tareo`(1), `23b-modo-visualizacion`(4), `36-seguridad-auth`(2) … +6 | `ajustarVistaSegunPermisos` `onUsersUpdated` `renderMain` `renderSidebar` |
| 182 | `113-admin-config` <sub>20261117-ad6</sub> | GLACIAL · PANEL DE ADMINISTRACIÓN · CONFIGURACIÓN (adminConfig, glacial_60) · LECTURA PARA TODOS, ESCRITURA SOLO DEL ADMINISTRADOR | `glacialAdminConfig`w | `00b-puente-supabase`(1), `01-config`(1), `02-estado`(2), `03-auth`(1), `37b-mantenimiento-identificacion`(1), `41-tareo-bloqueo`(1), `103-almacen-compartido`(1), `110-admin-nucleo`(1) … +1 | `enterApp` |
| 183 | `112-admin-pantalla` <sub>20261121-ad8</sub> | GLACIAL · PANEL DE ADMINISTRACIÓN (Centro de control) · PANTALLA — etapa 1 | `glacialAdminUI`w `admIr`w `admBuscar`w `admBuscarIr`w `admQ`w `admRolFiltro`w `admSel`w … +17 | `01b-fecha-operativa`(1), `04b-busqueda`(1), `02-estado`(7), `06-registro`(1), `110-admin-nucleo`(1), `111-admin-acceso-datos`(1), `114-admin-etapa2`(1) ⚠, `115-admin-etapa3`(1) ⚠ … +1 | — |
| 184 | `114-admin-etapa2` <sub>20261121-ad5</sub> | GLACIAL · PANEL DE ADMINISTRACIÓN · ETAPA 2 — Mermas y consumos · Metas y umbrales · Datos maestros · plantillas de Roles | `adm2Cerrar`w `adm2Tab`w `adm2Motivo`w `adm2Fi`w `adm2Fl`w `adm2HistFactor`w `adm2CambiarFactor`w … +27 | `01-config`(1), `01b-fecha-operativa`(1), `04b-busqueda`(1), `02-estado`(3), `46-proyeccion-avisos`(1), `70-asistente-nucleo`(1), `71-asistente-datos`(1), `95-conversiones`(2) … +6 | `admIr` |
| 185 | `115-admin-etapa3` <sub>20261121-ad7</sub> | GLACIAL · PANEL DE ADMINISTRACIÓN · ETAPA 3 — Trabajadores · Cuentas compartidas · Turnos y horarios · Tareo y cierres · Corrección de registros · … | `adm3Motivo`w `adm3Cerrar`w `adm3Tq`w `adm3Tf`w `adm3Tw`w `adm3TDescartar`w `adm3TPedir`w … +10 | `01-config`(1), `04b-busqueda`(1), `02-estado`(5), `06-registro`(2), `07-historial`(1), `13-tareo`(1), `37f-tareo-por-tecnico`(1), `41-tareo-bloqueo`(2) … +6 | `admIr` |
| 186 | `116-admin-etapa4` <sub>20261117-ad6</sub> | GLACIAL · PANEL DE ADMINISTRACIÓN · ETAPA 4 — Alertas y anuncios · Salud y sesiones · Seguridad · Respaldos e integraciones | `adm4Motivo`w `adm4Cerrar`w `adm4Anun`w `adm4Mant`w `adm4Descartar`w `adm4Pedir`w `adm4GuardarCfg`w … +5 | `01-config`(2), `02-estado`(4), `13-tareo`(1), `36-seguridad-auth`(1), `37f-tareo-por-tecnico`(1), `110-admin-nucleo`(1), `111-admin-acceso-datos`(1), `113-admin-config`(1) … +3 | `admIr` |

### Hielo · `js/hielo/`

| # | Archivo (`?v=`) | Propósito | Expone | Depende de | Sobrescribe |
|---|---|---|---|---|---|
| 187 | `97-hielo` <sub>20261126-rd21</sub> | GLACIAL · REPORTE HIELO — Página propia (se abre desde la tarjeta «Reporte Hielo» de la pantalla de selección), con Inicio, Nuevo registro, Historial, | `glacialHieloNucleo`w `glacialHieloDatos`w `hlAvSet`w `hlAvCopiar`w `hlAvWsp`w `hlAvImagen`w `hlPlFecha`w … +32 | `00b-puente-supabase`(1), `01-config`(4), `01b-fecha-operativa`(1), `02b-permisos-hielo`(1), `02-estado`(1), `03-auth`(1), `05-utils`(1), `06-registro`(1) … +5 | `goReporteHielo` |
| 188 | `97w-hielo-programacion-whatsapp` <sub>20261126-hw1</sub> | HIELO · PROGRAMACIÓN DESDE WHATSAPP — | `glacialHieloProgramacionWhatsApp`w | `01-config`(2), `02-estado`(1), `66w-planificacion-whatsapp`(1), `97-hielo`(1) | — |
| 189 | `99-hielo-reporte-diario` <sub>20261124-rd9</sub> | GLACIAL · REPORTE HIELO · REPORTE DIARIO DE PRODUCCIÓN (mismo formato que el Excel de la planta) | `glacialHieloReporte`w | `97-hielo`(1) | — |
| 190 | `98-hielo-inicio` <sub>20261121-hi3</sub> | REPORTE HIELO · tarjeta «HIELO» en el Inicio (Centro de perfil) | `renderCentroPerfil`w `glacialHieloInicio`w | `02b-permisos-hielo`(1), `02-estado`(1), `03-auth`(1), `32-dashboard-perfiles`(3), `43-bitacora-mantenimiento`(1), `44-estado-datos`(1), `46-proyeccion-avisos`(1), `47-analisis-paradas`(1) … +2 | `renderCentroPerfil` |

### Modo TV · `js/tv/`

| # | Archivo (`?v=`) | Propósito | Expone | Depende de | Sobrescribe |
|---|---|---|---|---|---|
| 199 | `glacial-tv` <sub>20261107-cf3</sub> | GLACIAL TV · MODO TELEVISIÓN (solo lectura)  ·  fase 1: INICIO y PRODUCCIÓN POR LÍNEA | `glacialTV`w | `02-estado`(1), `32-dashboard-perfiles`(11), `41-tareo-bloqueo`(1), `44-estado-datos`(1) | — |

## Fuera de `index.html`

- `js/nucleo/00-logo.js`: logo en base64; **no se carga** (ver `INDICE.md`).
- Librerías de CDN (`@supabase/supabase-js`) y las que pide `window.glacialCargarExcel` / `window.glacialCargarGraficos` (SheetJS, ExcelJS, ApexCharts, ECharts, canvas-gauges) se cargan aparte y no pasan por esta revisión.
