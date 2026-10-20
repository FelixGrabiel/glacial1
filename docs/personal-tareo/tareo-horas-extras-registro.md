# Tareo · Registro de horas extras con justificación y autorización

Pestaña **«Horas extras»** dentro del Tareo (Producción y Mantenimiento). Toda hora extra lleva **motivo** (lista fija por área), **justificación** (mínimo 15 caracteres) y **quién la autorizó**. Variante simple: quien registra elige al jefe que autorizó; la hora de autorización es la del registro; no hay aprobación pendiente.

> No confundir con `46-tareo-horas-extras.js`: ese archivo **calcula** el saldo de horas de cada jornada (solo consulta). Este **registra** horas extras justificadas y autorizadas. El **«Total HE»** (Resumen mensual, ficha, Excel) suma solo estos registros vigentes; las columnas «HORAS EXTRAS a favor / en contra» siguen siendo el cálculo por jornada.

## Datos
Colección nueva `horasExtras` en el puente de Supabase (`fs_docs`), **un documento por registro**, id = `área_AAAA-MM-DD_código` (p. ej. `produccion_2026-10-19_k3j9x2`). Se eligió un documento por registro (y no una lista) para que la regla del servidor pueda validar los campos y el área por el id.
Campos: `area, trabajadorId, trabajadorNombre, dni, cargo, fecha, turno, horaInicio, horaFin, totalHoras, motivo, justificacion, equipoLinea (solo Mantenimiento), autorizadoPor/-Nombre/-En, registradoPor/-Nombre/-Uid/-En, actualizadoEn, version, estado (VIGENTE|ANULADO), motivoAnulacion, anuladoPor/-En`.
Los registros **no se borran**: se anulan con motivo (≥ 5 caracteres).

## Reglas de negocio
- `totalHoras` se calcula solo y contempla turnos que cruzan medianoche (22:00→02:00 = 4 h). Fin = inicio no es válido.
- No se permiten dos tramos solapados de la misma persona y fecha (se comprueba contra lo que hay en memoria **y** contra el servidor al guardar).
- Editar/anular: supervisor del área o RRHH (con el permiso). Edición protegida por versión (si otra persona cambió el registro, se avisa y se recarga).
- «Registros sin autorizar» cuenta los vigentes sin `autorizadoPor` (antiguos o importados); en la tabla salen en naranja.
- **Autorizado por** lista usuarios con los roles de `HORAS_EXTRAS_AUTORIZADORES` (`js/nucleo/01-config.js`): Producción → Jefe de Producción, Jefe de Operaciones, Supervisor, Gerente General; Mantenimiento → Jefe de Operaciones, Mantenimiento, Gerente General. Los **motivos** están en `HORAS_EXTRAS_MOTIVOS` (mismo archivo).

## Permisos
Nuevo permiso **`horasExtras`** (Gestión de usuarios → «Tareo»). **Registra** quien tiene `horasExtras` **y** gestiona el tareo de esa área (`tareoProduccion` / `moduloMantenimiento` / `moduloRRHH`) o es Administrador. **Ve**: quien registra, la Jefatura de solo consulta con VER tareo, Tareo General y RRHH. Los supervisores existentes **no** lo reciben solos: hay que marcarlo en su usuario (los usuarios nuevos con rol Supervisor, Mantenimiento o RRHH lo traen sugerido).
Técnico con PIN (cuenta compartida de Mantenimiento): ve solo **sus** horas extras y no registra. **Límite conocido:** es una sola cuenta de Supabase, así que ese filtro es de la aplicación (igual que `37f-tareo-por-tecnico.js`).

## Dónde aparece
| Lugar | Qué |
|---|---|
| Pestaña «Horas extras» | formulario (izquierda), tarjetas «Horas extras hoy / Trabajadores con HE / Registros sin autorizar» y tabla del día (derecha) con las columnas Justificación y Autorizó resaltadas |
| Fila del tareo diario | marca **«HE 3,5 h»** junto al nombre (también en Tareo General); al tocarla abre el detalle |
| Ficha del trabajador | sección «Horas extras de <mes>» con su listado y el total |
| Vista general (RRHH) | dentro de la pestaña: ambas áreas, filtros por área, trabajador/DNI, motivo, rango de fechas y estado, y Excel |
| Resumen mensual y su Excel | columna **«Total HE»** y hoja **«Horas extras»** con el detalle completo (justificación y autorizador) |
| Auditoría de tareos | eventos `CREAR_HORAS_EXTRAS`, `EDITAR_HORAS_EXTRAS`, `ANULAR_HORAS_EXTRAS` con quién, cuándo y antes/después |

## Archivos
| Archivo | Cambio |
|---|---|
| `js/personal/47a-horas-extras-nucleo.js` (nuevo) | reglas puras: total con medianoche, validación, choques, totales, filtros, diferencias para la bitácora |
| `js/personal/47-horas-extras-registro.js` (nuevo) | datos en vivo, permisos, formulario, tabla, vista general, ganchos del tareo, Excel |
| `js/personal/13-tareo.js` | ganchos mínimos: pestaña, marca «HE», ficha, columna «Total HE» y hoja del Excel del resumen |
| `js/nucleo/01-config.js` | `HORAS_EXTRAS_MOTIVOS`, `HORAS_EXTRAS_AUTORIZADORES`, `HORAS_EXTRAS_MIN_JUSTIFICACION` |
| `js/nucleo/02-estado.js` | permiso `horasExtras` en el catálogo |
| `js/accesos/10-usuarios.js` | `horasExtras` sugerido para Supervisor, Mantenimiento y RRHH |
| `index.html` | carga de 47a y 47 después de 46 |
| `supabase/migraciones/glacial_26_horas_extras.sql` | reglas del servidor (**NO aplicada**, ver abajo) |
| `tests/horas-extras-registro.test.js` / `.e2e.js` | reglas puras y navegador (formulario, choque, edición, anulación, marca, ficha, resumen, permisos, PIN) |

## Migración SQL — aplicada en PRUEBAS (20-10-2026), PRODUCCION pendiente
`glacial_26_horas_extras.sql` agrega `cap_he_esc` / `cap_he_ver`, las marcas `he_*` de `ctx` y las ramas de `autorizar` y `puede_leer` para `horasExtras`, con el mismo método que `glacial_24` (anclas de texto). **Se escribió sin conexión a Supabase**: hay que revisarla contra las funciones de PRUEBAS antes de ejecutarla (si un ancla no aparece exactamente una vez, se detiene y no cambia nada). Hasta aplicarla, el guardado desde la aplicación será rechazado por el servidor.
Validaciones que hace el servidor (equivalentes a `NOT NULL` / `CHECK`): motivo, justificación ≥ 15 caracteres, autorizador y horas obligatorios, `horaFin` ≠ `horaInicio`, `totalHoras` > 0, el área del documento coincide con su id y con el permiso, `registradoUid` = quien crea, nunca se borra.
Límite: `puede_leer` de una **consulta** no distingue el área; la aplicación consulta siempre por `area`. Comprobar en PRUEBAS que un supervisor de Producción no recibe documentos de Mantenimiento.

## Probarlo (PRUEBAS)
1. **Supervisor de Producción** (permisos `tareoProduccion` + `horasExtras`): Tareo → «Horas extras». Elegir trabajador, 19:00–22:30, motivo, justificación de ≥ 15 caracteres y «Autorizado por». Guardar → aparece en la tabla y en «Horas extras hoy». Probar un tramo solapado (debe avisar el choque), 22:00→02:00 (4 h), Editar y Anular (pide motivo). En el tareo del día, el nombre lleva «HE 3,5 h». En «Auditoría de tareos» (RRHH) deben estar los tres eventos.
2. **Técnico con PIN de Mantenimiento** (cuenta compartida): identificarse con el PIN → Tareo → «Horas extras»: ve solo las suyas, sin formulario.
3. **Usuario de RRHH** (`moduloRRHH` + `horasExtras`): «Vista general (ambas áreas)»: filtrar por área, trabajador, motivo y fechas; «Cargar más antiguos»; Excel. En Resumen mensual: columna «Total HE» y, al exportar, la hoja «Horas extras».
