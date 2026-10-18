# Asistente de Producción y Reporte General

Diagnóstico, modelo de datos y diseño del módulo, más las decisiones que quedan pendientes. Corresponde a las fases 1 a 7 de `GLACIAL_Prompt_Asistente_Produccion_v2`.

## 1. Diagnóstico (Fase 1)

Las rutas son relativas a `js/`.

| # | Pregunta | Respuesta, con evidencia |
|---|---|---|
| 1 | **Programación y corridas** | Documento `sync/programaciones.items[]` (`nucleo/02-estado.js`, `loadProgramaciones`). Toda escritura pasa por `guardarProgramacionPaleta()` (`produccion/16-paletas.js`), que además deja historial en `historialProgramacion`. La unidad es la combinación **línea + fecha + turno + marca + presentación**, con `clave` (`claveProgramacionPaleta`) e `id` `prog_…`. Día + Intermedio se guardan en la fila `DÍA`. Varias tandas del mismo producto son `tramosSecuencia`, no filas nuevas. **No existe un id de corrida.** |
| 1b | **Equivalente a «cuadro»** | Sí: `sync/records.items[].cuadros[0..3]` (`produccion/06-registro.js`, `blankCuadro`). Cada cuadro tiene `marca`, `presentacion`, `lote`, `horaInicio`, `horaFin`, `produccion.{programada, efectiva}`, `paradasProgramadas[]`, `paradasNoProgramadas[]`, `insumos` y `mermas[]`. Se identifica por `record.id` + índice. No hay campo que lo enlace con la programación; la unión se hace por marca + presentación normalizadas (`35-autollenado-registro.js`). |
| 2 | **Cantidades producidas** | **Avance:** Paletas (`sync/paletas`) con `glacialProduccionPaletasAlCorte()`. Cada registro es acumulado, no un incremento. **Cierre:** `cuadro.produccion.efectiva` del reporte. Las dos fuentes nunca se suman (`29-avance-produccion.js`, `avProduccionHasta`). |
| 3 | **Marcas, presentaciones y lotes** | Catálogos en `nucleo/01-config.js` (`MARCAS_POR_LINEA`, `PRESENTACIONES_POR_LINEA`), guardados como texto libre. El lote **solo** existe en `cuadro.lote` (lo genera `generarLote` en `05-utils.js`) y **no es único**. No aparece en paletas ni en la programación. |
| 4 | **Factores fijos en el código** | `nucleo/05-utils.js`: `obtenerUnidadesPorPalet`, `CAJAS_PREFORMAS_DIVISOR`, `FACTOR_CARTON_PET`, `CARTON_FIJO_B7L` (16), `FACTOR_POLIETILENO_PET`, B7L 2.02, C20L 1.65, `FACTOR_STRETCHFILM_PET`, B7L 0.25, C20L 0.5, B20L 0.75. Están **duplicados** en `produccion/06-registro.js` (`calcular*Cuadro`). Hay una **segunda fuente distinta** en `accesos/32-dashboard-perfiles.js` (`CP_INSUMOS_CONFIG`). Ejemplo: cajas de preformas 625 ml = 18 750 en el Nuevo registro y 18 000 en Inicio. Los divisores de merma están en `01-config.js` (`MERMA_DIVISORES_POR_LINEA`, `MERMA_CONVERSION_FISICA_POR_LINEA`). |
| 5 | **Insumos y mermas existentes** | Solo dentro del reporte: `cuadro.insumos` (estimados) y `cuadro.mermas[{item, peso, unidades}]` (sin estado ni validación). **No existen** solicitudes, entregas, stock ni movimientos. «Insumos del turno» de Inicio solo estima. Almacén es un marcador (`moduloAlmacen`, «próximamente»). |
| 6 | **Avance/Cierre y paradas** | Paradas del supervisor por cuadro en el reporte. Paradas de Avance en `sync/avancesTurno.paradasOperativas[]` con `tipo: 'PROGRAMADA' \| 'NO_PROGRAMADA'`, por línea; su marca se asigna en el reporte (`asignacionParadasAvance`). `calcularTiemposLinea` (`23b-tiempos-linea.js`) consolida. **Sí se distingue** programada de no programada. Los botones del semáforo ya no son paradas oficiales. |
| 7 | **Roles y permisos** | `PERMISOS_APP`, `tienePermiso()` y `normalizarPermisosUsuario()` (`nucleo/02-estado.js`). Los roles de solo consulta filtran los permisos de escritura. Hay excepciones por rol con `+permiso` / `-permiso` (`planificacion`, `distribuirPersonal`). El rol **«Asistente de Producción» existe en el selector** (`accesos/10-usuarios.js`) pero no tiene permisos. No hay rol «Almacén». Las reglas (`_archivo/firebase/firestore.rules.etapa2.txt`) usan `sync/perfiles` (rol, permisos, soloVista) y niegan todo lo que no esté declarado. |
| 8 | **Interfaz reutilizable** | `#modal-root` + `closeModal()`, `escaparHtml`, tarjetas y tablas `cp-*`, pestañas `vu-tabs`. Navegación con `state.currentTab` envolviendo `renderMain`, `renderSidebar`, `ajustarVistaSegunPermisos` y `grupoSidebarActivo` (patrón de `mantenimiento/43-bitacora-mantenimiento.js`). |
| 9 | **Excel** | En `index.html` están cargados **ExcelJS 4.4.0** (cdnjs), SheetJS 0.20.3 y Chart.js 4.4.1. Los reportes con estilo ya usan ExcelJS (`08-graficos.js`: `xlHojaTabla`, `descargarArchivo`; `14-exportar-general.js`). |
| 10 | **Supabase** | Puente genérico (rama `origin/supabase`): `fs_docs(coleccion, id, datos jsonb)` y `fs_items`, con reglas traducidas a mano en `glacial_fs.autorizar` / `puede_leer`. Cada colección nueva necesita su rama SQL en esas dos funciones. Las tablas tipadas serían un diseño nuevo (sección 3.3). |
| 11 | **Nombres inconsistentes** | Los datos usan siempre `PET1`, `PET2`, `B7L`, `C20L`, `B20L`. Al mostrarlos: `LINES.name` dice `PET 1`, `PET 2` y `C20L`; Avance e Inicio dicen `CAJAS 20L`; Impacto dice `Cajas 20 L`. La importación de la planificación no reconoce «CAJAS 20L». En marcas: `BELLS` frente a `Bells` (B7L), `San Jorgue` frente a `San Jorge`, `Cuisine` repetido en PET2. |

## 2. Decisiones de diseño

1. **Cuadro del Asistente.** El cuadro es la **combinación programada** (fila de programación) del bloque.
   - Clave estable: `fecha|bloque|línea|marca|presentación`, normalizada con `normalizarClavePaletas`.
   - Se une al cuadro del reporte diario por marca + presentación, igual que el autollenado, para tomar lote, horas, paradas y producción efectiva.
   - El código visible C01, C02… se asigna por línea en orden de inicio.
   - Si producen marcas no programadas, también aparecen como cuadro, con programado 0.
2. **Producido.** Se usa la regla de Avance/Cierre: con cierre, `produccion.efectiva`; si no, Paletas al corte (`glacialProduccionPaletasAlCorte`). Nunca se suman.
3. **Factores.** Pasan a un **catálogo administrable** con vigencia (colección `apFactores`).
   - La **migración** crea los factores actuales del código como registros versión 1 (`origen: 'codigo'`). Es idempotente: ids deterministas y los existentes no se pisan.
   - El Asistente y el Reporte usan **solo** el catálogo. Si falta un factor, el cálculo se bloquea y se avisa; nunca se toma un valor por defecto.
   - Pendiente de aprobar: que el Nuevo registro y la tarjeta de Inicio dejen de usar sus constantes (sección 5).
4. **Reservas derivadas, no guardadas.** La reserva de un cuadro es su requerimiento pendiente mientras no esté finalizado ni cancelado.
   - Recalcular tras un cambio de programación no duplica nada, porque no hay reservas escritas.
5. **Stock en Producción = libro de movimientos inmutable** (`apMovimientos/{opId}`).
   - Tipos: `CONTEO`, `RECEPCION`, `DEVOLUCION`, `TRANSFERENCIA_ENTRADA`, `TRANSFERENCIA_SALIDA`, `CONSUMO`.
   - El saldo por insumo es el último `CONTEO` más los movimientos posteriores. Cada movimiento se guarda una sola vez (id = opId). Una corrección es un movimiento nuevo que anula al anterior.
   - El material observado o dañado no cuenta como disponible.
6. **Entrega ≠ consumo ≠ reserva.**
   - La **recepción** suma al stock de Producción.
   - El **consumo** solo se descuenta al **confirmar la conciliación** del cuadro, con un único movimiento `CONSUMO` por cuadro e insumo (id determinista, sin duplicados).
   - La merma validada **ya está dentro** del consumo real y no se descuenta otra vez.
7. **Excel con ExcelJS.** Ya está cargado y otros reportes lo usan.
   - Escribe estilos, formato condicional, combinaciones, hipervínculos internos y fórmulas.
   - No escribe gráficos nativos: los dos gráficos del Resumen se generan con Chart.js como imagen PNG.
   - Se descartó la plantilla .xlsx porque obligaría a mantener un archivo binario aparte y a recolocar rangos según el número de cuadros.

## 3. Modelo de datos

### 3.1 Firestore (colecciones nuevas, prefijo `ap`)

| Colección | Id | Contenido |
|---|---|---|
| `apInsumos/{codigo}` | código | `{codigo, nombre, unidad, tipo, activo, version, actualizadoPor, actualizadoUid, actualizadoEn}` |
| `apFactores/{id}` | `linea_material_marca_presentacion_vN` | `{id, insumo, linea, marca\|'*', presentacion\|'*', base:'UND'\|'PALETA', factor, vigenteDesde, vigenteHasta\|null, activo, version, origen, …autor}` |
| `apMovimientos/{opId}` | opId del cliente | `{opId, tipo, fecha, bloque, linea, cuadro, insumo, unidad, cantidad, condicion, lote, solicitudId, anulaA, motivo, uid, usuario, en}`. Inmutable. |
| `apSolicitudes/{id}` | `SOL-AAAAMMDD-xxxx` | `{id, fecha, bloque, linea, estado, items[{insumo, unidad, solicitado, entregado, recibido, devuelto}], historial[], version, …autor}` |
| `apMermas/{id}` | opId | `{id, fecha, bloque, linea, cuadro, marca, presentacion, categoria:'MATERIAL'\|'PRODUCTO', insumo, unidad, cantidad, causa, etapa, lote, estado:'PENDIENTE'\|'VALIDADA'\|'RECHAZADA', validadoPor, validadoEn, observaciones, historial[], version}` |
| `apConciliaciones/{fecha_bloque_linea_cuadro_insumo}` | determinista | `{saldoInicial, saldoFinal, estado:'BORRADOR'\|'EN_REVISION'\|'CONFIRMADA', observaciones, version, historial[]}` |
| `apCoordinaciones/{id}` | opId | `{id, fecha, bloque, texto, responsable, prioridad, estado:'ABIERTA'\|'CERRADA', historial[], version}`. Seguimiento del turno. |
| `apAuditoria/{autoid}` | auto | `{coleccion, docId, operacion, antes, despues, uid, usuario, en}`. Solo se crea. |

### 3.2 Reglas (`_archivo/firebase/firestore.rules.etapa2.txt`)

- Leen todos los usuarios con sesión, salvo la cuenta compartida.
- **Escriben** según la capacidad, siempre sin `soloVista`:
  - `apMovimientos`, `apConciliaciones` y alta de `apMermas`: `puedeAsistente()`.
  - Cambios de estado de `apSolicitudes`: `puedeAsistente()` o `puedeAlmacen()`.
  - Validar mermas: `puedeValidarMermas()`.
  - `apInsumos` y `apFactores`: `puedeGestionarFactores()`.
- Las capacidades se calculan con el rol por defecto más `permiso` / `-permiso`, igual que `puedeDistribuirPersonal()`.
- `apMovimientos` y `apAuditoria` **no se actualizan ni se borran**.
- Toda escritura exige `actualizadoUid == request.auth.uid` (o `uid` en los movimientos) y la hora del servidor.
- Las versiones suben de 1 en 1 y los historiales solo crecen.

### 3.3 PostgreSQL / Supabase

En la migración, cada colección pasa por el puente `fs_docs` sin cambios. Si después se quieren tablas tipadas, el equivalente es:

`lineas`, `insumos`, `factores_consumo(…, vigente_desde date, vigente_hasta date, exclude using gist para impedir solapes)`, `cuadros(fecha, bloque, linea, marca, presentacion, lote, programado)`, `movimientos_material(op_id uuid primary key, …)`, `solicitudes` + `solicitud_detalle`, `conciliaciones`, `mermas`, `auditoria`.

Las RLS replican las funciones de la sección 3.2.

## 4. Permisos nuevos

| Permiso | Para qué | Roles que lo traen por defecto |
|---|---|---|
| `ver_asistente` | Consultar el Asistente | Administrador, Asistente de Producción, Supervisor, Jefe de Producción, Jefe de Operaciones, Jefatura, Gerente General, Gerente |
| `asistenteProduccion` | Registrar conteos, recepciones, devoluciones, conciliaciones, mermas y solicitudes | Administrador, Asistente de Producción |
| `validarMermas` | Validar o rechazar mermas, confirmar conciliaciones | Administrador, Jefe de Producción, Jefe de Operaciones |
| `gestionarFactores` | Editar insumos y factores, y ejecutar la migración | Administrador |
| `moduloAlmacen` | Preparar y entregar solicitudes | Solo si se asigna (más Administrador) |
| `reporteGeneral` | Exportar el Reporte General de Producción | Administrador, Asistente, Supervisor, Jefaturas, Gerencia |

- Igual que con `distribuirPersonal`, el Administrador puede dar (`permiso`) o quitar (`-permiso`) cada uno.
- En modo visualización no se escribe nada.
- Los valores económicos no aparecen en el módulo ni en el Excel.

## 5. Decisiones pendientes de aprobación

1. **Que el Nuevo registro y la tarjeta de Inicio lean el catálogo** en lugar de sus constantes. **Aprobado e implementado (sección 8).**
   - Antes no se tocaban, para no cambiar el cálculo de los reportes ya en uso.
   - La migración copia los valores del Nuevo registro (`05-utils.js`). Los de Inicio difieren y se documentan, pero no se cargan.
   - **Hallazgo:** el Nuevo registro busca la presentación tal cual en sus tablas. Varias presentaciones vigentes «Regular» de PET1 y PET2 solo figuran allí con su nombre anterior «Alcalina», así que sus insumos hoy salen en 0. Ejemplos: `Pack_Regular_SC_1Lx6und/la`, `Pack_Regular_TP_1Lx6und/la` y `Pack c/Sticker_Regular_2.5Lx6und`.
     - La migración les asigna el valor de su equivalente «Alcalina», como indica `normalizarPresentacionRegular`, y lo anota en la nota del factor.
     - `Pack_Regular_380mlx24und/la` no tiene valor en ningún nombre: queda «sin factor».
2. **Factores que el código no tiene:** preformas y tapas por UND, y etiquetas. Quedan como «Pendiente de configurar» hasta que alguien con `gestionarFactores` los cargue.
3. **Merma de producto terminado:** se registra con `categoria: 'PRODUCTO'` y no entra en la conciliación de material.
4. **Reglas:** hay que publicar `_archivo/firebase/firestore.rules.etapa2.txt` en PRUEBAS antes de probar.

## 6. Implementación (fases 2 a 7)

| Archivo | Contenido |
|---|---|
| `js/asistente/70-asistente-nucleo.js` | Cálculo puro (sin Firestore ni pantalla). |
| `js/asistente/71-asistente-datos.js` | Colecciones `ap*`, transacciones, idempotencia, versiones, auditoría y permisos. |
| `js/asistente/72-asistente-pantalla.js` | Menú «Asistente de Producción» y pestañas Resumen · Seguimiento del turno · Insumos · Solicitudes · Consumo · Merma · Parámetros · Historial. Almacén deja de ser «próximamente» para quien tiene `moduloAlmacen` y abre las solicitudes. |
| `js/asistente/73-reporte-general.js` | Reporte General: `GLACIAL_Reporte_General_AAAA-MM-DD.xlsx`. Se exporta desde Historial. |
| `_archivo/firebase/firestore.rules.etapa2.txt` | Bloque «ASISTENTE DE PRODUCCIÓN» (sección 3.2). |
| `index.html` | Botón del menú y los cuatro scripts. |

**Funciones reutilizadas:**
- `loadProgramaciones`, `loadRecords`, `glacialProduccionPaletasAlCorte`, `obtenerUnidadesPorPalet`, `obtenerTareos`;
- `GlacialIndicadores.bloqueVigente`, `glacialHorarios.resolver`, `calcularTiemposLinea` (paradas de Avance), `glacialIncidencias.doc` (motivo de no producción);
- `nombrePresentacionUI`, `escaparHtml`, `descargarArchivo`, `cargarScriptExterno`, `#modal-root`.

### Pruebas

**`node tests/correr-todo.js`:** 73 de 73 pruebas.
- `asistente-nucleo.test.js` cubre las pruebas 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15 y 20, y la migración contra los valores reales de `05-utils.js`.
- `asistente-datos.test.js` usa un Firestore simulado. Cubre:
  - permisos;
  - idempotencia;
  - libro inmutable;
  - entrega parcial;
  - recepción;
  - conflicto entre dos usuarios (prueba 14);
  - consumo único al confirmar;
  - reapertura;
  - vigencia de factores;
  - auditoría.
- `reporte-general.test.js` prueba el modelo y, si ExcelJS está disponible, el libro: pruebas 16 y 21, fórmulas y enlaces.

**Reglas en el emulador** (`tests/reglas/etapa2-emulador.js`): 65 de 65, de ellos 24 casos del Asistente (prueba 13, CONSUMO solo al validar, Almacén frente a Producción, mermas, conciliaciones y auditoría).

**Excel recalculado con LibreOffice** (datos simulados con la estructura del archivo aprobado):
- 0 errores de fórmula;
- los totales del Resumen coinciden con las hojas (prueba 18);
- al corregir un producido en B7L, el Resumen se recalcula (prueba 19);
- kg y UND van en filas separadas (prueba 20).

**Visual:** `tests/visual/asistente.html` muestra todas las pestañas en escritorio y celular con datos de prueba, sin errores ni desborde horizontal.

### Cómo activarlo en PRUEBAS

1. **Publica las reglas.** Copia `_archivo/firebase/firestore.rules.etapa2.txt` en Firebase Console › Firestore › Reglas del proyecto `pruebas-b11b7`.
2. **Abre la vista previa de la rama.** Al no estar en el dominio de producción, la app usa la base de pruebas y muestra la franja roja.
3. **Asigna los roles.** En Gestión de usuarios: rol «Asistente de Producción» o los permisos nuevos (área Producción y Almacén).
4. **Carga los factores.** Un Administrador abre Asistente › Parámetros › «Migrar factores del código». Crea los insumos base y los factores versión 1.
5. **Registra datos de prueba:** conteos (Insumos), una solicitud (Solicitudes), su entrega desde un usuario con `moduloAlmacen`, la recepción, una merma y una conciliación.

### Limitaciones reales

- **Reglas por ítem:** las reglas no comparan las solicitudes ítem por ítem. Esa validación (no entregar más de lo solicitado ni recibir más de lo entregado) la hace la aplicación.
- **Historial en memoria:** el stock usa los movimientos de los últimos 60 días. Con un conteo físico en ese período el saldo es exacto.
- **Paradas de Avance sin cuadro:** cuando la línea tiene varios cuadros y no hay reporte diario, esas paradas quedan «Sin asignar» y se avisa en Observaciones.
- **Gráficos del Resumen:** se insertan como imagen PNG, porque ExcelJS no escribe gráficos nativos.

## 7. Diseño de pantallas (rediseño según las imágenes aprobadas)

- **Pestañas:** Resumen operativo · Seguimiento del turno · Insumos · Consumo · Merma · Historial y reportes. Solicitudes y Factores pasan a ser subpestañas de Insumos, junto con Existencias y Requerimientos.
- **Coordinaciones del turno** (Seguimiento): nueva colección `apCoordinaciones`, con su regla en `_archivo/firebase/firestore.rules.etapa2.txt`. Hay que volver a publicar las reglas.
- **Evidencia opcional** en conteos y mermas: se sube a Supabase Storage (bucket privado `glacial-fotos`, carpeta `asistente/AAAA-MM/`; JPG, PNG o PDF, máx. 10 MB). Solo se guarda la referencia del archivo; si la subida falla, el registro no se guarda y se avisa.

## 8. Catálogo como fuente única y causas de merma configurables

**Factores (Nuevo registro e Inicio).**
- El catálogo (`apInsumos`, `apFactores`) se escucha desde el inicio de sesión (`glacialFactoresCatalogoEscuchas` en `02-estado.js`), no solo al abrir el Asistente.
- `window.glacialFactoresCatalogo.consumo(insumo, línea, marca, presentación, fecha, cantidades)` devuelve el valor con el factor vigente, o `null`.
- Nuevo registro (`05-utils.js` y los cálculos por cuadro de `06-registro.js`): cajas de preformas, cartón, polietileno y stretch consultan primero el catálogo (`consumoInsumoCatalogo`). Con `null` (catálogo sin cargar, sin permiso de lectura, sin factor o factor ambiguo) usan las tablas fijas de siempre.
- Inicio (`32-dashboard-perfiles.js`): cada insumo de la tabla (preformas, etiquetas, tapas, cartón, polietileno, stretch) usa el catálogo si tiene factor vigente; factor 0 = «No aplica».
- Prueba `tests/factores-catalogo.test.js`: con el catálogo migrado, el Nuevo registro da exactamente lo mismo que las tablas fijas en las 264 combinaciones con valor en el código; las presentaciones «Regular» que salían en 0 toman el valor de su equivalente «Alcalina».
- Los reportes ya guardados conservan sus valores; el catálogo se aplica cuando se calcula o se edita un registro.

**Causas y etapas de merma.**
- Documento `apParametros/merma` `{causas[], etapas[], version, historial[]}`; sin documento se usan las listas de siempre.
- Las configura quien tiene `gestionarFactores` o `validarMermas` (Administrador, Jefe de Producción / de Operaciones) desde **Merma → Configurar causas y etapas de merma**, una por línea (1 a 30, sin repetidas). Versión +1, historial y auditoría.
- Las mermas ya registradas conservan su causa. Con «Otros» se sigue exigiendo la descripción.
- Reglas: bloque `match /apParametros/{doc}` en `_archivo/firebase/firestore.rules.etapa2.txt` (emulador 67/67).

