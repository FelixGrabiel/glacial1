# Conversiones de mermas · Asistente de Producción › Conversiones

**Qué es:** el único lugar donde se define cómo se convierte cada merma del Registro de producción (kg → UND, UND → kg). Antes estas conversiones estaban fijas en el código (`MERMA_DIVISORES_POR_LINEA` y `MERMA_CONVERSION_FISICA_POR_LINEA`, `js/nucleo/01-config.js`).

## Reglas acordadas (07/11/2026)
1. **Unidades por paleta:** no se tocan aquí.
2. **Vigencia:** un cambio vale para los reportes con fecha **desde** la fecha de vigencia, que no puede ser anterior a hoy. Los reportes de fechas anteriores conservan su conversión y nada se recalcula hacia atrás.
3. **Unidades:** UND, PLANCHA o KG.

## Cómo funciona
- **Sin cambios guardados** (o si no se puede leer el documento), se usan los valores del código, tal cual. La prueba `tests/conversiones-mermas.test.js` comprueba que, con los valores migrados, el Registro da exactamente los mismos números en 707 casos.
- **Primer cambio:** guarda todas las conversiones del código, más la nueva versión, en `apParametros/conversiones`, con historial y auditoría (`apAuditoria`).
- **En el Registro** (`06-registro.js · calcularValoresMerma`), la conversión se elige por la fecha del reporte (`mermaDivisor` y `mermaConversionFisica` en `01-config.js`). El resultado queda guardado en el reporte; de ahí lo leen el Historial, el Reporte General, Inicio y los gráficos.
- **Quién cambia:** el Administrador, o quien tenga el permiso «Administrar insumos y factores». Para cada cambio se indica el valor, la unidad, la fecha de vigencia, el motivo y las líneas (por ejemplo PET1 y PET2 juntas).
- **Botellas y Preformas** usan el gramaje de la preforma del cuadro: se muestran, pero no se cambian aquí.

## Servidor
`supabase/migraciones/glacial_44_conversiones_mermas.sql`: permite crear y editar `apParametros/conversiones` con versión +1, historial +1, autor y hora del servidor, y entre 1 y 300 conversiones. Está aplicada en PRUEBAS. En PRODUCCIÓN se aplica con la aprobación del dueño.

## Siguiente etapa
Usar las conversiones también en el Asistente (requerimientos, consumo, desviación, existencias), en Lotes, en Control de proceso y en el Impacto económico.
