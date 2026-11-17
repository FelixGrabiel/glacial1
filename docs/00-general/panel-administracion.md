# Panel de Administración (Centro de control)

Pantalla solo para el **Administrador** desde la que se gestiona GLACIAL. Menú: **Configuración › Panel de Administración**.
Diseño aprobado: prototipo interactivo (17 secciones en 5 grupos). Código: `js/admin/` (110 núcleo · 111 acceso y datos · 112 pantalla).

## Reglas
1. **Solo el Administrador.** `esAdministradorSeguridad()` + sesión propia. No entran: Supervisor, Mantenimiento/Almacén (cuentas compartidas), Gerente, Jefaturas ni un Administrador en «Ver como».
   - La entrada del menú **no existe en `index.html`**: `111-admin-acceso-datos.js` la crea solo para el Administrador y la quita al cambiar de cuenta, cerrar sesión o entrar en «Ver como» (revisión cada 1,5 s).
   - Por consola o dirección: «No tienes acceso» y vuelve al Inicio.
   - Servidor: marca `adm_panel` (glacial_59) = Administrador, no Mantenimiento, no solo vista. Lo nuevo (`adminAuditoria`) solo lo crea quien la tiene.
2. **Tiempo real.** Todo se lee con `onSnapshot` (auditorías: las 200 más recientes de cada una). Los usuarios usan el caché en vivo de siempre.
3. **Conflictos.** Antes de guardar, la ficha se compara con la que había al empezar a editar; si otro equipo la cambió: «Esto cambió en otro equipo» y se recarga. Nunca gana en silencio el último.
4. **Reutilizar.** Usuarios se guardan con `saveUsers()` (que también publica `sync/perfiles`); las plantillas por rol son `PERMISOS_SUGERIDOS_POR_ROL` (`js/nucleo/02-estado.js`, antes estaban dentro de `10-usuarios.js`); las auditorías se leen donde ya viven.
5. **Motivo ≥ 10 caracteres** para todo cambio sobre datos de otros; edición en **borrador** («N cambios sin guardar · Descartar / Guardar»); se guarda todo junto o nada.
6. **Auditoría de lo que hace el panel:** colección `adminAuditoria` (libro inmutable, solo la crea y la lee el Administrador): quién, cuándo (hora del servidor), módulo, acción, antes, después y motivo. Si el guardado de usuarios sale bien pero la auditoría falla, el panel lo avisa y ofrece «Reintentar».

## Dónde vive cada dato (verificado en el código)
| Sección | Fuente |
|---|---|
| Usuarios / Roles | `sync/users` (`loadUsers`/`saveUsers`), `sync/perfiles` (se publica solo al guardar usuarios), `PERMISOS_APP`, `AREAS_PERMISOS` y `PERMISOS_SUGERIDOS_POR_ROL` en `02-estado.js` |
| Auditoría consolidada | `auditoriaTareos` (`timestamp`), `apAuditoria` (`en`), `insumosAuditoria` (`en`/`enMs`), `auditoriaRegistros` (`timestamp`) y `adminAuditoria` (`guardadoEn`). Cada una se adapta a una fila común sin moverla ni cambiar su formato |
| Resumen | usuarios, `loadWorkers()`, `loadRecords()` (registros sin finalizar) y la auditoría consolidada |

Diferencias con el prompt original: la tabla del prompt dice que `horasExtras` y otras auditorías están repartidas; `horasExtras` escribe en `auditoriaTareos` (con `area`), por eso ya está incluida. No existe un campo «activo/inactivo» de usuarios en el modelo actual: no se agregó «desactivar usuario» sin diseñarlo.

## Etapa 1 (construida)
Marco con acceso solo para el Administrador (pantalla y servidor) · **Resumen** · **Usuarios** (buscar, filtrar, ficha, rol, líneas, permisos por área, «Igualar al rol», borrador con motivo) · **Roles y permisos** (plantillas por rol, quién difiere, «Igualar a la plantilla» en borrador) · **Auditoría** (consolidada, solo lectura, filtros, exportar CSV).

Lo que **no** está en la etapa 1 aunque el prototipo lo muestre:
- «Equipos conectados», «Alertas de seguridad», sesiones y cierre de sesión de otros: etapa 4 (función de servidor).
- Pendientes de aprobación y «Deshacer» desde la Auditoría: etapas 3 y siguientes.
- Desactivar usuarios, contraseña temporal y «Ver GLACIAL como esta persona» desde la ficha: «Ver como» ya existe en su botón de siempre; el resto necesita decisión (ver arriba).

## Etapa 2 (construida)
- **Mermas y consumos** (4 pestañas, con las mismas funciones y reglas del Asistente de Producción: no hay copias paralelas):
  - *Consumo de insumos*: lista de `apFactores`, factor vigente hoy, «ambiguo» si dos empatan, **Pendientes de configurar** (lo producido sin factor), «Cambiar» (crea una **versión nueva** con fecha de vigencia y motivo; cierra la anterior con `guardarFactor`; vista previa con el consumo teórico de un turno típico y el % de cambio, en rojo desde 20 %), «Historial» y «Nuevo factor».
  - *Conversión de mermas*: por componente y línea; cambio con «rige desde» (hoy o después) y motivo; **los reportes anteriores conservan su conversión** (nada se recalcula hacia atrás). Usa `glacialConversiones.panel.guardarCambio`.
  - *Causas y etapas*: `apParametros/merma` con `guardarParametrosMerma` (con versión). Quitar = dejar de ofrecer (los registros viejos conservan su texto). Sin documento rigen las de siempre.
  - *Tolerancias* (nuevo): `adminConfig/tolerancias` — merma aceptable y desviación aceptable por línea (% del teórico) y si la merma se valida antes de cerrar el turno. **Sin valor, el Asistente se comporta como hoy.** El Asistente las lee en `72-asistente-pantalla.js` → `conciliar()` (`dentroDeTolerancia`, `mermaExcede`, alerta `MERMA_ALTA`, `lineasSinExigirMerma`).
- **Metas y umbrales** y **Datos maestros**: muestran los valores vivos y abren el editor que ya existe (Análisis de paradas, Velocidades estándar, umbrales de avisos, Planificación, Inventario de insumos…). No se duplicó ningún editor.
- **Roles y permisos**: plantillas editables y roles propios (`adminConfig/roles`). Las plantillas cambian `PERMISOS_SUGERIDOS_POR_ROL` (lo que usa «Nuevo usuario»); los usuarios existentes no cambian solos (se usa «Igualar a la plantilla»). Los roles propios agrupan permisos: no cambian el comportamiento del sistema.
- **Servidor** (`glacial_60`): colección `adminConfig` con ids permitidos, solo el Administrador escribe, **el servidor exige versión anterior + 1** (si dos equipos editan a la vez, el segundo es rechazado) y motivo de 10 caracteres; lectura para cualquier usuario con sesión (el Asistente y «Nuevo usuario» la leen).
- Todo cambio deja su fila en `adminAuditoria`; además `apAuditoria` conserva su propia auditoría de factores y conversiones.

Limitaciones de la etapa 2: «Datos maestros» y «Metas y umbrales» abren el editor existente (no hay edición dentro del panel); no existe aún lista de proveedores/equipos/motivos dentro del panel.

## Etapa 3 (construida)
Todo reutiliza lo que ya existe (mismos documentos, funciones y reglas); cada cambio pide motivo ≥ 10 y deja su fila en `adminAuditoria`.
- **Trabajadores** (`sync/workers`): lista con búsqueda y filtros; cambio de estado, área, cargo y línea en borrador, una sola escritura con `saveWorkers`, control de conflicto entre equipos. Agregar/importar la rotación se hace con las pantallas de siempre (botones de acceso).
- **Cuentas compartidas**: Almacén (agregar, activar/desactivar, «Nuevo PIN» con las funciones de `102-almaceneros-pin.js`, expuestas en `glacialAlmaceneros.panel`); Mantenimiento solo consulta (`sync/tecnicosMant`; se administra en Mantenimiento).
- **Turnos y horarios**: ampliaciones de turno vivas (`ampliacionesTurno`) y acceso a los editores de horario y rotación. Las ampliaciones se siguen dando desde la rotación de supervisores.
- **Tareo y cierres**: estado de la regla de bloqueo (`tareoBloqueoInfo`/`tareoBloqueoConfig`), conteo de abiertos/cerrados. Reabrir lo hacen RRHH o el Administrador desde el propio tareo, con motivo.
- **Corrección de registros**: lista de reportes con «Reabrir» (`reabrirReporteProduccion`) y «Eliminar» (`deleteRecord`, con constancia): las funciones de siempre.
- **Papelera**: reportes de producción eliminados, leídos de la constancia (`auditoriaRegistros`, con copia) y restaurados con `saveRecords`. **No hay «borrar para siempre»**: la constancia es inmutable a propósito.

## Etapa 4 (construida) y lo que NO se puede desde el navegador
- **Alertas y anuncios**: anuncio para todos (texto, desde/hasta, activo) y modo mantenimiento → `adminConfig/anuncio` y `adminConfig/mantenimiento`; se leen en vivo en todos los equipos y se pintan como banner (`113-admin-config.js`). El modo mantenimiento **avisa, no bloquea escrituras**. La cuenta compartida de Almacén no recibe el banner (sus reglas no le dan lectura). Las alertas de producción por rol siguen siendo el permiso «Recibir notificaciones y alertas de producción» (se edita en Roles/Usuarios): no se agregó un segundo interruptor.
- **Salud y sesiones**: estado de este equipo y la revisión diaria del servidor (`saludSistema/actual`).
- **Seguridad**: la revisión de cuentas y perfiles que ya existía (`comprobarMigracion`).
- **Respaldos e integraciones**: respaldo manual en JSON (usuarios **sin claves, sales ni PIN**, trabajadores, reportes, configuración del panel) y exportaciones CSV por módulo y rango de fechas.

**No disponible desde el navegador (dicho también en pantalla)** — necesita una función de servidor que solo acepte al Administrador, con la llave de servicio de Supabase (patrón de `fs-cuentas`), que NO se construyó ni se desplegó:
1. Listar equipos conectados y cerrar sesión de uno o de todos los usuarios.
2. Intentos de ingreso fallidos y cuentas bloqueadas (están en los registros de autenticación de Supabase).
3. Respaldos automáticos (diario/semanal): necesitan una tarea programada en el servidor y un lugar donde guardarlos.
4. Política de «días sin uso antes de pedir la contraseña»: se configura en Supabase (Authentication › Sessions).
5. Estado de integraciones (WhatsApp, Google Sheets): vive en el servidor/servicios externos.
Decisión pendiente tuya: si quieres que se construya esa función de servidor (y desplegarla en PRUEBAS primero), dímelo; hace falta decidir dónde guardar los respaldos automáticos.

## Estado de la migración
`glacial_59_panel_administracion.sql` y `glacial_60_admin_config.sql`: aplicadas en **PRUEBAS y PRODUCCIÓN** (17/11/2026, con ensayo previo, verificadas).

## Pruebas
`tests/admin-panel.test.js` (reglas, adaptadores de auditoría, tolerancias, núcleo del Asistente, migraciones, conexiones), `tests/admin-panel-etapa34.e2e.js` (trabajadores, cuentas compartidas, registros, papelera, anuncio, seguridad, respaldos), `tests/admin-panel-etapa2.e2e.js` (factores con vista previa, causas, tolerancias, roles) y `tests/admin-panel.e2e.js` (navegador: quién entra, 17 secciones, Resumen, Auditoría en vivo, borrador, motivo, auditoría propia, conflicto entre equipos, «Ver como»).
