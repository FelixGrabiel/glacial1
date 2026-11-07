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

## Parte 2 · dónde más se usan
- **Asistente › Merma:** una merma de tapas, etiquetas, asas, cajas o bolsas (insumos en UND) se puede ingresar **pesada en kg**. Se guarda en UND con la conversión vigente de la línea para la fecha del Asistente, con la misma fórmula del Registro, y queda constancia del peso y de la conversión usada (`cantidadIngresada`, `unidadIngresada`, `conversion`). Si en una línea hay dos conversiones con distinto peso (por ejemplo Tapa Plana y Sport Cap después de un cambio), se elige cuál.
- **Lotes:** junto al peso de cada caja o bobina en la línea se muestran las UND estimadas, también al devolverla con el peso que queda. Solo se estima cuando hay una única conversión para esa categoría en la línea. Es una referencia, porque el peso puede incluir el empaque.
- **Impacto económico:** el costo de la merma se calcula por peso para el Polietileno, como siempre, y para los ítems cuya conversión da kg (Polietileno 54 cm de C20L). Antes ese ítem se valoraba con sus UND, que siempre son 0, y quedaba fuera del costo.
- **Requerimientos, consumo, desviación y existencias:** usan los **factores de consumo** (cuánto insumo por unidad producida o por paleta), que se definen en **Insumos › Factores**, también con vigencia. La pestaña lo indica.
- **Control de proceso:** no usa mermas, así que no cambia.
