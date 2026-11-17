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

## Etapa 1 (esta entrega)
Marco con acceso solo para el Administrador (pantalla y servidor) · **Resumen** · **Usuarios** (buscar, filtrar, ficha, rol, líneas, permisos por área, «Igualar al rol», borrador con motivo) · **Roles y permisos** (plantillas por rol, quién difiere, «Igualar a la plantilla» en borrador) · **Auditoría** (consolidada, solo lectura, filtros, exportar CSV).

Lo que **no** está en la etapa 1 aunque el prototipo lo muestre:
- Editar plantillas de rol, crear o duplicar roles: necesita un documento nuevo de plantillas en el servidor y enganchar el formulario de «Nuevo usuario». Propuesto para la etapa 2.
- «Equipos conectados», «Alertas de seguridad», sesiones y cierre de sesión de otros: etapa 4 (función de servidor).
- Pendientes de aprobación y «Deshacer» desde la Auditoría: etapas 3 y siguientes.
- Desactivar usuarios, contraseña temporal y «Ver GLACIAL como esta persona» desde la ficha: «Ver como» ya existe en su botón de siempre; el resto necesita decisión (ver arriba).

## Estado de la migración
`glacial_59_panel_administracion.sql`: aplicada en **PRUEBAS**; **PRODUCCIÓN pendiente** (solo con aprobación del dueño, con ensayo previo). Sin ella, el panel abre pero no puede registrar su auditoría en producción.

## Pruebas
`tests/admin-panel.test.js` (reglas, adaptadores de auditoría, migración, conexiones) y `tests/admin-panel.e2e.js` (navegador: quién entra, 17 secciones, Resumen, Auditoría en vivo, borrador, motivo, auditoría propia, conflicto entre equipos, «Ver como»).
