# Evidencias de insumos — bandeja de validación (Fase 3)

Pestaña **Evidencias** dentro de **Inventario de insumos** (Asistente de Producción · Almacén). Archivos: `js/asistente/84-evidencias-insumos-nucleo.js`,
`85-evidencias-insumos-datos.js`, `86-evidencias-insumos-pantalla.js`; migración `supabase/migraciones/glacial_31_evidencias_insumos.sql` (**sin aplicar**).

## Principio
WhatsApp aporta **evidencia**, OpenAI **propone** datos, una persona autorizada los **valida**, y **solo una operación explícitamente aprobada** (Fase 4,
otro permiso y otra pantalla) modifica el inventario. Esta bandeja **no tiene ninguna operación de stock**: aprobar los datos de una etiqueta no registra
entradas, transferencias ni consumos. «Registrado» es un estado reservado para la Fase 4 y el núcleo no permite alcanzarlo.

## Flujo
1. En el proyecto `glacial-whatsapp` el bot guarda la foto, la IA la lee (`vision-v2/v3`) y el validador genera `*-revisado.json` (con `campos`, `campos_en_duda`
   y `reglas_aplicadas`). Ese proyecto no se conecta a Supabase.
2. **Importar evidencias**: se seleccionan a la vez los `-revisado.json` y sus fotos. Cada foto se une a su resultado por la huella **SHA-256** (si no
   coincide, no se importa). La foto se sube al bucket privado `glacial-fotos` (carpeta `asistente/evidencias/`, regla de `glacial_25`) y se muestra con enlace
   firmado. El documento es `insumosEvidencias/{sha256}` → importar dos veces la misma foto es un duplicado.
3. **Validar**: foto al lado (girar y abrir) y, por dato, lo que leyó la IA (literal), el valor editable, su estado (legible / dudoso / requiere revisión /
   ausente) y su origen (foto, regla del validador o persona). Los datos dudosos (p. ej. 100 vs 1000, 17 vs 1.7 mils, «F. VENC.» que es «F. PROD.») exigen
   **Confirmar** o corregir antes de aprobar.
4. Acciones: **Guardar cambios**, **Aprobar datos**, **Solicitar corrección o nueva foto** (motivo), **Rechazar** (motivo) y **Reabrir** (solo Administrador, motivo).

## Estados
`pendiente → aprobado_dato | requiere_correccion | rechazado`. Corregir una evidencia «requiere corrección» la devuelve a pendiente. Reabrir una aprobada o
rechazada (→ pendiente) la hace solo un Administrador. No se edita una evidencia aprobada o rechazada.

## Aprobación (reglas del núcleo, no solo de la pantalla)
Sin datos dudosos sin confirmar · producto presente · categoría distinta de «otro» · documento = etiqueta de insumo · peso bruto ≥ peso neto · cantidad con unidad.
Sin lote o sin cantidad/peso solo avisa.

## Auditoría y concurrencia
Cada importación, corrección, confirmación y cambio de estado es una **transacción** que revisa el estado y la revisión (`rev`) vigentes (dos personas no se pisan; un
doble clic no aprueba dos veces) y deja un evento en `insumosAuditoria` (antes → después; grupo «Evidencias de etiquetas» en la pestaña Auditoría). El
historial por dato (valor anterior, quién, cuándo) y el historial de estados viajan en el documento.

## Permisos
Los del Inventario de insumos (`inventarioInsumos`): ven Asistente de Producción, Jefe de Operaciones y Administrador; validan Asistente de Producción y
Administrador; los roles de solo consulta ven sin botones. La cuenta compartida de Mantenimiento no entra.

## Migración `glacial_31` (SIN APLICAR)
Agrega la colección `insumosEvidencias` a `autorizar` (se crea una vez y se actualiza; no se borra; escribe `ii_esc`) y a `puede_leer` (`ii_ver`). Requiere
`glacial_23` y `glacial_24`. Aplicar primero en PRUEBAS, probar con una foto real y después en PRODUCCIÓN. Las transiciones de estado las exige la aplicación (las
reglas no comparan estado anterior → nuevo, igual que en los conteos).

## Pendiente (otras fases)
Subida automática desde el bot (necesita credenciales y backend confiable), calculadora de bobinas (UND/kg), identidad comercial de cada caja/bobina y los
movimientos de inventario (recepción, transferencia, consumo): **Fase 4**.

## Pruebas
`tests/evidencias-insumos.test.js`: núcleo (construcción y saneo, ediciones, confirmaciones, aprobación, transiciones, «registrado» bloqueado, reabrir solo
Administrador), datos con base simulada (foto privada, auditoría, concurrencia, doble clic, permisos, nada de stock), pantalla (foto al lado, dudas, solo consulta) e
integración (index.html, pestaña, migración, índice).
