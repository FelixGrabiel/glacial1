# Control de proceso en el envasado (CF - CA - F - 047) · diseño de la exportación a Drive

Documento en Docs: https://claude.ai/artifact/TjH3RCx3m8esPaR1PuT54S

Origen: el libro **C.P_BIDON_7L-OCTUBRE.xlsx** que hoy se lleva a mano en Drive. Este documento define cómo GLACIAL lo genera y, en la Etapa 3, lo mantiene en Drive.
**Estado**: el **Excel del mes** ya se puede descargar desde Asistente de Producción › Lotes (implementado y probado). La **copia automática a Drive** y el **llenado automático de los lotes de insumo** dependen de las Etapas 3 y 2 de la trazabilidad de lotes (diseñadas aquí, sin implementar).
**No toca** producción, ratio, paradas, Avance/Cierre, tareo ni stock SAP: solo lee los reportes.

## 1. Qué tiene hoy el Drive (análisis del libro)
- **Un libro por línea y mes** (`C.P_BIDON_7L-OCTUBRE`) con **8 hojas, una por marca**: GLACIAL, SCALA, CUISINE, BELLS, ARO, MERKAT, YAQUA y FONTLIFE. Los nombres de hoja no son uniformes («cuisine 7L », «bells 7L», « 7L MERKAT», «FONTILFE»).
- Cada hoja es el formulario **CF - CA - F - 047 «CONTROL DE PORCESO EN EL ENVASADO»** (el título conserva la grafía «PORCESO»): logo de GLACIAL, `PRODUCTO:` (marca) y `PRESENTACION:` (7L), y una rejilla de 17 columnas en cuatro grupos:

| Grupo | Columnas |
|---|---|
| (sin grupo) | A `LOTE PROD` |
| **SOPLADO** | B `MAN` · C `LAV` · D `LLEN` · E `L.PREFORMA` · F `CIERRE` · G `CANT` |
| **ENVASADO** | H `CANT` · I `L. TAPA` · J `CONF` |
| **ETIQUETADO** | K `LOTE` · L `ROTUL` |
| **EMPAQUETADO** | M `LOTE ASA` · N `CONF` · O `CANT` |
| (sin grupo) | P `FECHA` · Q turno (`D` / `N`, sin encabezado) |

- **Una fila por tanda de producción** (un cuadro). Ejemplo de la hoja SCALA: `CF3-01102027 · 2605008F300 · 6552 · 6552 · 30/05-B · 0468-26 · 01/06-B · 6552 · 01/10/26 · D`.
- Los **lotes de insumo se anotan por adelantado** (las filas siguientes ya traen `2605008F300`, `30/05-B`, `0468-26`, `01/06-B` sin cantidad ni fecha) y las cantidades se completan al producir.
- Las columnas `MAN`, `LAV`, `LLEN`, `CIERRE`, `CONF` y `ROTUL` **no tienen datos en ningún ejemplo**: son casillas de verificación que se llenan en planta.
- Las cantidades de soplado, envasado y empaquetado coinciden en todas las filas (6552 · 6552 · 6552).
- El lote de producción es el código del lote del cuadro (`CF3` para B7L) + `-` + una fecha `DDMMAAAA`. En las 6 filas con datos coincide con **producción + 1 año** (el turno noche cae al día siguiente: noche del 01/10 → `CF3-02102027`); GLACIAL lo toma del **vencimiento** del cuadro (supuesto a confirmar, pregunta 3).
- Hojas como GLACIAL, YAQUA y FONTLIFE conservan lotes de una plantilla antigua (`241228G320`, `2812`, `301`) sin producción: son plantillas, no datos.

## 2. Diseño: qué genera GLACIAL
**Un libro por línea y mes** (`C.P_BIDON_7L-OCTUBRE-2026.xlsx`), **una hoja por marca** (alfabético, nombre = marca en mayúsculas), con el **mismo formato** del original (títulos, anchos, combinaciones, bordes, logo, A4 horizontal, encabezado fijo). **Una fila por cuadro producido** de esa línea y mes, ordenadas por fecha, turno (día antes que noche) y n.º de cuadro. Entra un cuadro si tiene marca y produjo (sopladas o producción efectiva); los solo programados no.

### Mapeo columna por columna
| Columna | Fuente en GLACIAL | Estado |
|---|---|---|
| A `LOTE PROD` | `cuadro.lote` + `-` + `cuadro.fechaVencimiento` en `DDMMAAAA` (sin vencimiento: solo el código) | **Hoy** (supuesto a confirmar, pregunta 3) |
| B `MAN`, C `LAV`, D `LLEN`, F `CIERRE`, J `CONF`, L `ROTUL`, N `CONF` | No se capturan en GLACIAL | **Vacías para planta** (pregunta 1) |
| E `L.PREFORMA` | lote del proveedor de la unidad de **preformas** usada en el cuadro | **Etapa 2** (hoy en blanco) |
| G `CANT` (soplado) | `produccion.sopladas` | **Hoy** (configurable, pregunta 2) |
| H `CANT` (envasado) | `produccion.efectiva` | **Hoy** (configurable) |
| I `L. TAPA` | lote de la unidad de **tapas** | **Etapa 2** |
| K `LOTE` (etiquetado) | lote de la unidad de **etiquetas** | **Etapa 2** |
| M `LOTE ASA` | lote de la unidad de **asas** | **Etapa 2** |
| O `CANT` (empaquetado) | `produccion.efectiva` | **Hoy** (configurable) |
| P `FECHA` | `reporte.fecha` | **Hoy** |
| Q turno | `D` (día e intermedio) / `N` (noche) | **Hoy** |
| R (oculta) `CLAVE GLACIAL` | clave del cuadro `fecha\|bloque\|línea\|marca\|presentación` (la misma del Asistente) | **Hoy**; la usará la copia a Drive |

Si en un cuadro se cambió de lote a mitad del turno, la celda trae los lotes unidos con ` + `. Las celdas de insumo que GLACIAL no conoce quedan **vacías** (no se inventan) y la pantalla avisa cuántas filas están incompletas.

### Cómo llegan los lotes de insumo (Etapa 2 de la trazabilidad)
En el cuadro, el supervisor marca las unidades usadas (ya entregadas a su línea). Cada marca guarda en `cuadro.lotesInsumo[]` el `loteProveedor` **y la `categoria`** (`preformas`, `tapas`, `etiquetas`, `asas`) de la unidad: la categoría decide la columna. Con eso el Excel y Drive se llenan solos; no se escriben lotes a mano.

## 3. Entrega: tres niveles
1. **Excel descargable (hecho)**: Asistente de Producción › **Lotes** › tarjeta «Control de proceso en el envasado». Línea (B7L), mes y **Descargar Excel**. Muestra antes de descargar cuántas filas y hojas saldrán y cuántas filas no tienen todos los lotes de insumo. Se sube a Drive a mano.
2. **Lotes de insumo por cuadro (Etapa 2)**: llena las columnas E, I, K y M.
3. **Copia automática a Drive (Etapa 3)**: el mismo libro como **Google Sheet** que se actualiza solo. Diseño:
   - **Cuenta de servicio de Google** con acceso solo a la carpeta del Drive; su llave es un secreto de Supabase (nunca en la página ni en el bot).
   - Al guardar o corregir un reporte de B7L, un disparador deja el reporte en una **cola** (`control_proceso_cola`, RLS activada sin políticas, como `evidencias_entrada`). Una **Edge Function** (cada minuto, `pg_cron` + `pg_net`) toma lo pendiente, **crea el libro del mes y la hoja de la marca si no existen** y, para cada cuadro, **busca su fila por la clave de la columna R**: si existe, la **actualiza**; si no, la agrega. Nunca duplica.
   - **Solo escribe las columnas suyas** (A, E, G, H, I, K, M, O, P, Q, R). **Nunca toca** MAN, LAV, LLEN, CIERRE, CONF ni ROTUL: lo que planta anote ahí se respeta aunque GLACIAL actualice la fila.
   - Si Google falla: reintentos con espera creciente, el error queda en la cola y **GLACIAL sigue funcionando igual** (la página nunca espera a Drive). Idempotente.
   - Un cuadro corregido o anulado actualiza o vacía su fila (no la borra), para no desordenar lo que planta escribió en esa fila.
   - Mismo código para el Excel y para Drive: la lógica del núcleo (`90-control-proceso-nucleo.js`) se comparte con la función.

### Cambio frente al diseño anterior de la Etapa 3
El prompt original pedía una hoja «LOTES GLACIAL» con una fila por unidad. Con este formulario **la exportación a Drive pasa a ser el Control de proceso** (una fila por cuadro). El detalle por unidad (peso, estado, línea de tiempo, informe del lote) se queda dentro de GLACIAL (Trazabilidad, Etapa 2). Si además quieres esa hoja por unidad en Drive, se agrega como una pestaña más del mismo libro (pregunta 8).

## 4. Qué se implementó
| Archivo | Qué es |
|---|---|
| `js/asistente/90-control-proceso-nucleo.js` | Núcleo puro: filas del mes, lote de producción, turno, lotes de insumo por categoría, hojas por marca, modelo del mes, nombres de hoja y de archivo. |
| `js/asistente/91-control-proceso-excel.js` | Libro ExcelJS con el formato del Drive y la tarjeta de la pestaña Lotes (línea, mes, resumen, descarga). |
| `tests/control-proceso.test.js` | 40+ pruebas: el núcleo, el libro comparado con el original (celdas combinadas, anchos, títulos, encabezados y las 6 filas de SCALA), e integración. |
Además se verificó visualmente la salida (LibreOffice → PDF): una hoja A4 horizontal por marca, con el mismo aspecto del formulario.

## 5. Preguntas abiertas (necesito tu respuesta para cerrar)
1. **MAN, LAV, LLEN, CIERRE, CONF y ROTUL**: ¿qué verifica cada una y quién la llena? ¿Se quedan manuales en Drive o quieres capturarlas en GLACIAL (casillas por cuadro)? Hoy salen vacías.
2. **Cantidades**: en el Drive las tres `CANT` son iguales. ¿La cifra es la producción efectiva, las botellas sopladas o el empaquetado? Hoy: soplado = sopladas, envasado y empaquetado = efectiva.
3. **Lote de producción**: confirma la regla `CF3` + vencimiento `DDMMAAAA`. ¿El vencimiento se registra siempre en el cuadro? (Sin vencimiento sale solo `CF3`.)
4. **Otras líneas**: PET1, PET2, C20L y B20L, ¿tienen su propio formulario (otro código CF - CA - F - 04x)? Envíame un ejemplo de cada una; hoy solo B7L está configurada.
5. **Drive**: ¿en qué carpeta va, quién es el dueño y cuál es el nombre del libro mensual? Para la Etapa 3 hace falta una cuenta de servicio de Google con acceso a esa carpeta.
6. **Lotes por adelantado**: hoy se anotan antes de producir. En GLACIAL el lote queda asociado cuando el supervisor marca la unidad en el cuadro. ¿Te sirve así?
7. **Cambio de lote a mitad de turno**: ¿una sola fila con los dos lotes (`A + B`) o dos filas?
8. **Hojas**: ¿nombre definitivo de cada hoja (marca en mayúsculas) y deseas además la hoja por unidad («LOTES GLACIAL») como pestaña extra?
9. **Título**: se mantuvo «PORCESO» como está en el formulario controlado. ¿Lo corregimos a «PROCESO»?
10. **Libro de octubre**: el actual se llena a mano. ¿Se corre en paralelo un mes con el de GLACIAL para comparar antes de dejar de llenarlo?

## 6. Guía de uso (Excel del mes)
Disponible para quienes ven Asistente de Producción › Lotes (Asistente de Producción, Jefe de Operaciones y Administrador).
1. Entra a **Asistente de Producción › Lotes**. Arriba está la tarjeta **«Control de proceso en el envasado (CF - CA - F - 047)»**.
2. Elige la **línea** (B7L · BIDÓN 7L) y el **mes**.
3. Revisa el resumen: **filas** (cuadros), **hojas** (marcas) y los avisos:
   - «N de M filas no tienen todos los lotes de insumo»: salen en blanco hasta que se registren los lotes en cada cuadro (Etapa 2).
   - «N filas sin fecha de vencimiento»: el lote de producción sale solo con su código.
4. Pulsa **Descargar Excel**. Se baja `C.P_BIDON_7L-<MES>-<AÑO>.xlsx` con una hoja por marca.
5. Planta completa en el Excel (o en Drive) las columnas de verificación: **MAN, LAV, LLEN, CIERRE, CONF, ROTUL**.
6. Sube el archivo a la carpeta de Drive. (Con la Etapa 3 este paso deja de ser manual.)
Si no hay cuadros producidos ese mes, la tarjeta lo dice y no descarga nada. Cada descarga genera el libro completo del mes con lo que haya en GLACIAL en ese momento.
