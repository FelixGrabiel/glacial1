# Modo visualización general (por usuario) y orden de Inicio

## Inicio
Orden final: indicadores → Producción por línea → (Estado de líneas, si hay líneas) → Alertas importantes → **RESUMEN DE PRODUCCIÓN**
(encabezado + Paradas de hoy + Proyección del turno + Disponibilidad de hoy). Las tarjetas las inserta cada módulo (43, 46 y 47)
justo después de `.cp-title-row`; como ese encabezado ahora está dentro de `.cp-resumen-prod` al final, las tarjetas lo siguen. No se duplicó nada
ni se tocaron datos, fórmulas ni suscripciones (`js/accesos/32-dashboard-perfiles.js`).

## Cómo se configura
Gestionar usuarios → Editar permisos: sección **MODO VISUALIZACIÓN GENERAL** (`js/accesos/10b-modo-visualizacion-form.js`):
interruptor, módulos por área, líneas, «Permitir descargar / exportar reportes» (desactivado por defecto) y «Marcar / quitar todos»
(no marca el Panel de RRHH: se marca aparte). Con el modo activo las casillas de permisos operativos quedan bloqueadas, **no se borran**.
- Solo un Administrador lo cambia (únicos que escriben `users` y `perfiles`), nunca sobre su propia cuenta, y no se aplica a cuentas de Administrador.
- Se guarda en el usuario: `modoVisualizacion {activo, modulos[], lineas[], exportar, actualizadoPor, actualizadoEn}` y cada cambio en `modoVisualizacionHistorial` (quién, cuándo, qué).
- Sin configuración el comportamiento es el de siempre. Las restricciones de solo consulta por rol (Jefatura/Gerencia) siguen vigentes.

## Cómo se aplica (un solo lugar: `js/accesos/23b-modo-visualizacion.js`)
| Capa | Qué hace |
| --- | --- |
| Permisos efectivos | `normalizarPermisosUsuario`/`tienePermiso`: solo los permisos de **vista** de los módulos marcados. `paletas`, `planificacion`, `distribuirPersonal`, `eliminarRegistros`… nunca. |
| Solo consulta | `esUsuarioSoloConsulta` devuelve `true`: tareo, avance, resúmenes, producción actual, rotaciones, etc. ya pasan a solo lectura. |
| Menú y navegación | `renderSidebar`/`renderMain`/`selectLine`: solo se abren las pestañas de módulos marcados; el resto redirige a una vista permitida o a «Sin áreas autorizadas». Aplica a enlaces internos, sesiones abiertas y cambios en vivo (`onUsersUpdated`). |
| Líneas | `LINES` (y las listas de Avance y Distribución) se reducen a las líneas autorizadas; `loadRecords/loadPaletas/loadProgramaciones` devuelven solo esas líneas; bitácora, resumen y cards filtran igual. Lista vacía = ninguna línea. |
| Escrituras | Clases de Firestore (`set/update/delete/add`, lotes, transacciones) y `save*` se rechazan con el modo activo, además de las reglas del servidor. Se permiten solo `relojServidor/` (hora del servidor) y `resultadosEconomicos/` (resultados calculados). |
| Descargas | Sin la casilla: se bloquean descarga de archivos (Excel, imágenes, PDF), impresión, WhatsApp y portapapeles, y se ocultan esos botones. |
| Controles | Los botones de modificación se ocultan por texto (ayuda visual; la protección real son las capas anteriores). |
| Etiqueta | «Modo visualización» (ojo) en la cabecera; se reemplaza el selector Visualizar/Trabajar. |

## Reglas de Firestore (`firestore.rules.etapa2.txt`) — publicar de nuevo
`sync/perfiles` guarda ahora `soloVista:true` de las cuentas en modo visualización (lo publica `36-seguridad-auth.js`).
Las reglas usan `soloVista()` y **rechazan toda escritura operativa** de esa cuenta: documentos operativos de `sync`, bitácora, solicitudes,
historial de programación, auditoría de tareos, distribución de personal, resúmenes, umbrales y valores unitarios.

> **Límite conocido**: los documentos compartidos (`records`, `paletas`, `programaciones`, `avancesTurno`…) tienen un solo documento para todas
> las líneas, por eso el servidor **no puede** entregar «solo PET1»: el filtro por módulo y línea es del navegador (la escritura sí está protegida
> en el servidor). Cerrarlo exige separar esos documentos por línea (etapa aparte, conservando los registros existentes).
> Con las reglas de la etapa 1 (abiertas) no hay bloqueo en el servidor.

## Impacto Económico y otras áreas restringidas
No forma parte del catálogo. Su autorización sigue siendo la propia (por rol, en `55-valores-economicos.js` y en las reglas): el modo ni la concede ni la quita.
El Panel de RRHH conserva su restricción (se marca aparte). Insumos y Trabajadores no se ofrecen: hoy no existen como pantallas de consulta independientes.

## Pruebas
`tests/modo-visualizacion.test.js` (lógica real de `23b`, reglas, perfiles, formulario, orden de Inicio). Pendiente en PRUEBAS con cuentas reales: sesión de un consultor
(recarga, nueva sesión, cambio en vivo), una exportación permitida, y el rechazo en el servidor tras publicar las reglas.
