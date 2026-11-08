# Mantenimiento · Plan anual y Registro CFA-CA-F-023

Estado: **Etapa 1 completa en PRUEBAS** (datos, pantalla Plan anual, impreso A4 horizontal y exportación a Excel). PRODUCCIÓN: nada aplicado.

## Decisiones
- **Tablas propias `mtto_*`** (no colecciones del puente), como pidió el dueño. RLS activada; tiempo real por `supabase_realtime`.
- Los permisos salen de `glacial_fs.ctx()`: leer = cualquier usuario con sesión; escribir plan/máquinas/configuración = marca `supmtto`.
- La configuración (firmas e insumos químicos fijos) vive en `mtto_config` (una fila `config`), no en la colección de configuración del puente.
- Las hojas «CARB» se importan con `pendiente_confirmar = true` y sin línea (no se asignan a PET2).
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
