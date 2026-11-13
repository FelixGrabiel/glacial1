# Mantenimiento · Plan anual y Registro CFA-CA-F-023

Estado: **Etapa 1 completa en PRUEBAS** (datos, pantalla Plan anual, impreso A4 horizontal y exportación a Excel). PRODUCCIÓN: nada aplicado.

## Decisiones
- **Tablas propias `mtto_*`** (no colecciones del puente), como pidió el dueño. RLS activada; tiempo real por `supabase_realtime`.
- Los permisos salen de `glacial_fs.ctx()`: leer = cualquier usuario con sesión; escribir plan/máquinas/configuración = marca `supmtto`.
- La configuración (firmas e insumos químicos fijos) vive en `mtto_config` (una fila `config`), no en la colección de configuración del puente.
- Las hojas «CARB» se importaron con `pendiente_confirmar = true` y sin línea. **Confirmadas por el dueño el 10/11/2026: son de PET2** (`supabase/datos/2026-11-10_mtto_carb_pet2.sql`, aplicado en PRUEBAS y PRODUCCIÓN). Ahora entran al Programa semanal como máquinas propias (Sopladora 8 cavidades, Envasadora isobárica de 32 válvulas, 2 dispensadores de tapas y Compresores de alta presión de la sopladora de 8 cavidades): +46 actividades por semana (sem. 46: 18+10+4+4+10). Su impreso sigue diciendo «LÍNEA PET», igual que el Plan original.
- Los textos se importan tal cual (solo se quitan espacios sobrantes): VETILADOR, ELECTROVÁVULAS, RODILLLOS, COMPONENETES, el ítem 16 repetido de SOP… se mantienen porque el impreso debe salir idéntico al Excel.

## Archivos
- `supabase/migraciones/glacial_47_mantenimiento_plan.sql` — tablas, disparadores de versión y auditoría, RLS, tiempo real, configuración inicial.
- `supabase/datos/importar_plan_mtto.py` — lee el .xlsx del Plan y genera el SQL + informe por hoja. Las hojas idénticas a otra (las CARB) se copian en el servidor.
- `supabase/datos/2026-11-08_mtto_plan_2026.sql` — carga generada (19 hojas, 307 actividades).

## Importar de nuevo
`python3 supabase/datos/importar_plan_mtto.py PLAN.xlsx supabase/datos/AAAA-MM-DD_mtto_plan_2026.sql 2026`

## Informe de importación (PRUEBAS, 08/11/2026)
19 hojas · 307 actividades · SOP 37 · SOP CARB 37 · ENV 26 · ENV CARB 26 · DISP 9 · DISP CARB 9 · DISP CARB (2) 9 · ETIQ 17 · CALD 15 · SEC 5 · INK JET 3 · EMP 19 · HORNO 15 · COMP. BP 18 · COMP. AP 18 · COMP. AP CARB 18 · COMP. TOR 11 · FAJA T 8 · TRAT. AGUA 7.

## Pasos a producción (con aprobación del dueño)
1. Aplicar `glacial_47` en PRODUCCIÓN (`ehtbwmvwoxcdefvlxttu`).
2. Cargar `2026-11-08_mtto_plan_2026.sql`.
3. Subir la rama a `main`.

## Etapas
1. Datos + Plan anual + impreso del plan + Excel (en curso).
2. Programa semanal.
3. Registro CFA-CA-F-023 (celular) + impreso de 1 hoja (`glacial_48`: registros, actividades, piezas).
4. Historial.

## Impreso y Excel del Plan anual (etapa 1)
- `js/mantenimiento/74-plan-anual-impresion.js`: arma el HTML del impreso por máquina (A4 horizontal, márgenes 0,7" / 0,92" / 0,75", Calibri Light 8 pt, encabezado de página con el logo `assets/img/mtto-logo.png` — el del Excel —, dos filas de título repetidas por hoja, «1 - 52» combinado, bordes medianos entre bloques) y el libro de Excel con una hoja por máquina.
- Salto de hoja como en el Excel: 21 filas de datos por hoja (SOP: hoja 1 = 18 semanales + 3 mensuales; hoja 2 = 8 semestrales + 8 anuales).
- «Imprimir» usa un marco oculto y el diálogo de impresión del navegador; «Exportar Excel» baja el libro de todas las máquinas de la línea y el año elegidos.
- Límite de ExcelJS: el encabezado de página del Excel exportado lleva el texto (título, máquina, CONSORCIO FRAP / CF-CA-PL-002) pero NO el logo (ExcelJS no admite imágenes en el encabezado).
- Pruebas: `tests/mantenimiento-plan-impresion.test.js` (con ExcelJS si hay `GLX_LIBS`), `tests/mantenimiento-plan-anual.test.js`, `tests/mantenimiento-plan-anual.e2e.js`.

## Programa semanal (etapa 2)
- `glacial_48_mantenimiento_registros.sql` (APLICADA en PRUEBAS 09/11/2026): `mtto_registros`, `mtto_registro_actividades`, `mtto_registro_piezas` con RLS, auditoría y tiempo real. Escribir: cuenta compartida de Mantenimiento y supervisor/jefe; validar o reabrir un registro validado: solo supervisor/jefe (lo exige un disparador). PRODUCCIÓN: pendiente de aprobación.
- Pantalla `js/mantenimiento/75-programa-semanal-pantalla.js`: selector de semana (‹ SEM_45 ›), una fila por máquina (sin las hojas CARB pendientes) con las actividades que manda el plan por frecuencia, avance, estado, técnico/maquinista y «hace X min»; panel «En vivo»; botón «Actividades» (lista de la semana, reemplaza al BUSCAR). Los botones Iniciar / Ver en vivo / Validar aparecen cuando exista el Registro (etapa 3).
- Pestañas de Mantenimiento: Plan anual · Programa semanal (`window.glacialMttoTabs`).
- Pruebas: `tests/mantenimiento-plan-anual.test.js` (núcleo), `tests/mantenimiento-programa-semanal.e2e.js`.

## Registro CFA-CA-F-023 (etapa 3)
- Pantalla `js/mantenimiento/76-registro-pantalla.js` (celular primero): se crea con «Iniciar» desde el Programa semanal con las actividades que manda el plan; casillas de 48 px, observación por actividad, tipo (Predictivo/Preventivo/Correctivo), condición (Interno/Externo), horas reales, hasta 4 piezas, insumos químicos fijos, informe final. Todo se guarda al instante («Guardado») y se propaga en vivo.
- Estados: PENDIENTE → EN CURSO (al marcar la primera; guarda la hora real de inicio) → POR VALIDAR (el técnico «Cierra y firma»; guarda la hora de fin) → VALIDADO (solo supervisor/jefe; solo ellos reabren). Las reglas de la base lo exigen (glacial_48).
- Técnico = quien se identificó con su PIN (`mantTecnicoActivo`); el supervisor puede escribirlo. Maquinista: se propone solo si la Rotación de Maquinistas deja uno para ese día.
- Datos: `72-plan-anual-datos.js` (iniciarRegistro, marcarActividad, guardarCampos, guardarPieza, cerrar/validar/reabrir). Núcleo: `actividadesParaRegistro`, `permisosRegistro`.
- Impreso `js/mantenimiento/77-registro-impresion.js`: A4 horizontal, 1 sola hoja, 22 actividades máximo (11 + 11), línea solo «PET», sin nada de la interfaz. «Vista de impresión» en la pantalla.
- Pendiente de esta etapa: adjuntar foto de evidencia al registro (reutilizar el mecanismo de evidencias); aviso a la otra persona cuando dos editan el mismo campo.
- Pruebas: `tests/mantenimiento-registro-impresion.test.js`, `tests/mantenimiento-registro.e2e.js`.

## Historial (etapa 4)
- `js/mantenimiento/78-historial-pantalla.js`: registros de un año (los más recientes primero), filtros por año, máquina, semana, técnico o maquinista (sin tildes ni mayúsculas) y estado (con el conteo de cada uno); «Mostrar más» de 50 en 50; **Abrir** (solo lectura si está cerrado o validado) e **Imprimir** (el formato CFA-CA-F-023 de 1 hoja; pide al servidor las actividades y piezas de ese registro). En vivo: un registro que se cierra o valida cambia de estado sin recargar.
- Datos: `cargarHistorial(anio)` y `detalleRegistro(id)` en `72-plan-anual-datos.js`; filtrado puro `filtrarHistorial` / `conteoEstados` en el núcleo.
- La pestaña «Registros» del prompt no se hizo aparte: el Programa semanal (registros de la semana) y el Historial la cubren.
- Pruebas: `tests/mantenimiento-historial.e2e.js` y las del núcleo en `tests/mantenimiento-plan-anual.test.js`.

## Empezar desde cero (decisión del dueño, 09/11/2026)
- Los registros en GLACIAL empiezan **en la semana 46 de 2026**; no se cargan registros anteriores ni se calculan semanas «vencidas» (la tarjeta «Vencidas» sigue en «—»).
- `mtto_config.datos.inicioRegistros = {anio:2026, semana:46}` (por defecto en el código si falta). Antes de esa semana el Programa semanal muestra un aviso, no ofrece «Iniciar», la flecha ‹ no baja de la 46 y la capa de datos rechaza iniciar el registro.
- PRUEBAS verificada sin registros (0 en las tres tablas). Datos: `supabase/datos/2026-11-09_mtto_inicio_registros.sql`.

## Actualización 10/11/2026 · fotos de evidencia y aviso de edición simultánea
**Fotos de evidencia en el Registro** (`glacial_49`, tabla `mtto_registro_fotos`): tarjeta «Evidencia fotográfica» con «📷 Agregar foto» (cámara o galería, varias a la vez) y una cámara por actividad para ligar la foto a esa actividad. Máximo 20 por registro.
- La foto se comprime en el celular, se sube a Storage (`mantenimiento/registros/<registro>/…`, bucket privado `glacial-fotos`, ya permitido a la cuenta compartida de Mantenimiento) y **solo después** se guarda su referencia. Se muestra con enlace firmado.
- Cada foto lleva descripción opcional y quién la subió. Solo el supervisor puede quitar la referencia (el archivo no se borra: las reglas de Storage no lo permiten). Un registro VALIDADO no admite fotos nuevas (disparador de la base).
- Sin aplicar `glacial_49` el Registro funciona igual y la tarjeta avisa que las fotos se activan con esa actualización.
**Aviso cuando dos personas editan el mismo campo:** si otra persona cambia un campo que acabas de cambiar (últimos 5 min) o que estás escribiendo, aparece un aviso amarillo que dice quién fue y qué quedó («Entendido» lo cierra). No avisa por cambios en campos que no tocaste. Campos vigilados: fecha, tipo, condición, técnico, maquinista, horas reales, informe final, marca y observación de cada actividad y cada pieza. El último cambio sigue ganando; el aviso permite volver a ponerlo.

## Actividades «No se realizó» con motivo y arrastre a la semana siguiente (13/11/2026)

En el Registro (CFA-CA-F-023), cada actividad tiene dos casillas: ✓ realizada y ✗ **No se realizó**.
- Al marcar ✗ se abre el motivo (obligatorio): se escribe o se elige uno frecuente (máquina en producción, falta de repuesto o material, falta de tiempo, falta de personal, esperando al proveedor, requiere parada programada). Hasta que haya motivo no se guarda.
- Lo «no realizado» **pasa a las actividades de la próxima semana** de esa máquina, al principio de la lista, con «Pendiente desde la semana N · Motivo: …». Si en esa semana tampoco se hace y se vuelve a marcar ✗, pasa a la siguiente, y así hasta que se realice. Conserva la semana de origen.
- Si se marca ✓ la actividad (o se quita la ✗), la copia que ya hubiera pasado a la semana siguiente se quita sola si nadie la tocó (sin marca, observación ni fotos).
- Al abrir un registro que ya estaba iniciado, se traen los pendientes marcados después de crearlo (una actividad entra una sola vez).
- El avance dice «N de M realizadas · K no realizadas». Al cerrar, avisa de lo que quedó sin decidir y de lo que pasará a la próxima semana. El impreso marca «(NO REALIZADA)».
- Base de datos: `supabase/migraciones/glacial_53_mantenimiento_no_realizadas.sql` (columnas `no_realizado`, `motivo_no`, `origen_actividad_id`, `anio_origen`, `semana_origen`, `motivo_origen`, restricciones y la función `mtto_pendientes_arrastrables`). **Aplicada en PRUEBAS; PRODUCCIÓN pendiente de aprobación.** Sin ella, el Registro funciona como antes (sin pendientes).
- Pruebas: `tests/mantenimiento-no-realizadas.test.js` y el caso nuevo de `tests/mantenimiento-registro.e2e.js`.
