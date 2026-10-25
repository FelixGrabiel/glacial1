# Control de proceso en el envasado (CF - CA - F - 047) · diseño de la exportación a Drive

Documento en Docs: https://claude.ai/artifact/TjH3RCx3m8esPaR1PuT54S

Origen: el libro **C.P_BIDON_7L-OCTUBRE.xlsx** que hoy se lleva a mano en Drive. Este documento define cómo GLACIAL lo genera y, en la Etapa 3, lo mantiene en Drive.
**Estado**: el **Excel del mes** ya se puede descargar desde Asistente de Producción › Lotes. La **copia automática a Drive** está **construida y probada con un Google simulado** (Apps Script + función de Supabase + migración `glacial_35`), pero **sin aplicar ni desplegar** y sin probar contra tu Google real: falta conectarla (sección 7). El **llenado de los lotes de insumo** depende de la Etapa 2 de la trazabilidad.
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
3. **Copia automática a Drive (construida, falta conectarla)**: el mismo libro como **Google Sheet** que se actualiza solo. Como tu Drive es una **cuenta personal de Google**, la conexión usa un **Apps Script** que corre con tu cuenta (una cuenta de servicio no puede crear archivos en un Drive personal).
   - **Apps Script** (`supabase/drive/apps-script/Codigo.gs`), publicado por ti como aplicación web: recibe los cuadros del mes, **crea el libro del mes en tu carpeta y una hoja por marca** con el formato del formulario (si no existen) y **busca cada fila por la clave de la columna R**: si existe la actualiza, si no la agrega. Nunca duplica. Protegido por una clave (`GLACIAL_SECRETO`): sin ella no hace nada.
   - **Función de Supabase `control-proceso-drive`**: cada **5 minutos** (`pg_cron`) lee los reportes de B7L del mes (y, los primeros 3 días del mes, también el anterior), arma el formulario con **las mismas reglas del Excel** (el archivo `nucleo.mjs` se genera desde `90-control-proceso-nucleo.js`; una prueba falla si se desincroniza) y se lo envía al Apps Script **solo si algo cambió** (compara una huella). «Sincronizar ahora con Drive» (tarjeta de Lotes) fuerza la copia.
   - **Solo escribe sus columnas** (A, E, G, H, I, K, M, O, P, Q y R). **Nunca toca** MAN, LAV, LLEN, CIERRE, CONF ni ROTUL: lo que planta anote se respeta aunque GLACIAL actualice la fila. Un cuadro que desaparece vacía sus columnas de GLACIAL pero **conserva su fila, su clave y lo que planta anotó**. El script nunca borra filas.
   - **Nunca pisa un libro hecho a mano**: si en el libro ya existe una hoja con el mismo nombre que no creó GLACIAL (p. ej. el libro de planta), se rechaza antes de escribir nada.
   - **Si Google falla**: el error queda en `control_proceso_sync` (visible en la tarjeta), reintenta con espera creciente (5, 10, 20, 40, 60 min; un error de configuración espera más) y **GLACIAL sigue funcionando igual** (la página nunca espera a Drive).
   - **Estado y seguridad**: la tabla `control_proceso_sync` (RLS sin políticas) guarda por línea y mes la huella, el resultado, los intentos y el enlace al libro. La dirección y las claves van en secretos de Supabase y en el Vault, nunca en la página ni en el bot. La función solo LEE reportes.

### Cambio frente al diseño anterior de la Etapa 3
El prompt original pedía una hoja «LOTES GLACIAL» con una fila por unidad. Con este formulario **la exportación a Drive pasa a ser el Control de proceso** (una fila por cuadro). El detalle por unidad (peso, estado, línea de tiempo, informe del lote) se queda dentro de GLACIAL (Trazabilidad, Etapa 2). Si además quieres esa hoja por unidad en Drive, se agrega como una pestaña más del mismo libro (pregunta 8).

## 4. Qué se implementó
| Archivo | Qué es |
|---|---|
| `js/asistente/90-control-proceso-nucleo.js` | Núcleo puro: filas del mes, lote de producción, turno, lotes de insumo por categoría, hojas por marca, modelo del mes, nombres de hoja y de archivo. |
| `js/asistente/91-control-proceso-excel.js` | Libro ExcelJS con el formato del Drive y la tarjeta de la pestaña Lotes (línea, mes, resumen, descarga). |
| `tests/control-proceso.test.js` | 40+ pruebas: el núcleo, el libro comparado con el original (celdas combinadas, anchos, títulos, encabezados y las 6 filas de SCALA), e integración. |
| `supabase/drive/apps-script/Codigo.gs` | Aplicación web de Google Apps Script: crea libro y hojas, escribe por clave sin duplicar y respeta las columnas de planta. |
| `supabase/functions/control-proceso-drive/` | Función de servidor: lee reportes, arma el formulario, llama al Apps Script, guarda el estado y reintenta. `nucleo.mjs` y `logo.mjs` se generan con `node scripts/generar-nucleo-drive.js`. |
| `supabase/migraciones/glacial_35_control_proceso_drive.sql` | Tabla de estado, permisos, disparador y trabajo de `pg_cron` (**no aplicada**). |
| `tests/control-proceso-drive.test.js`, `tests/control-proceso-drive-funcion.test.js` | El Apps Script contra un Google simulado y la función, la migración y la tarjeta de Lotes. |
Además se verificó visualmente la salida (LibreOffice → PDF): una hoja A4 horizontal por marca, con el mismo aspecto del formulario.

## 5. Preguntas abiertas (necesito tu respuesta para cerrar)
1. **MAN, LAV, LLEN, CIERRE, CONF y ROTUL**: ¿qué verifica cada una y quién la llena? ¿Se quedan manuales en Drive o quieres capturarlas en GLACIAL (casillas por cuadro)? Hoy salen vacías.
2. **Cantidades**: en el Drive las tres `CANT` son iguales. ¿La cifra es la producción efectiva, las botellas sopladas o el empaquetado? Hoy: soplado = sopladas, envasado y empaquetado = efectiva.
3. **Lote de producción**: confirma la regla `CF3` + vencimiento `DDMMAAAA`. ¿El vencimiento se registra siempre en el cuadro? (Sin vencimiento sale solo `CF3`.)
4. **Otras líneas**: PET1, PET2, C20L y B20L, ¿tienen su propio formulario (otro código CF - CA - F - 04x)? Envíame un ejemplo de cada una; hoy solo B7L está configurada.
5. **Drive**: es una cuenta personal de Google (ya confirmado → Apps Script). Falta: ¿en qué carpeta van los libros y quién es el dueño? El libro se llama `C.P_BIDON_7L-<MES>-<AÑO>` (distinto del de planta hecho a mano, para no mezclarlos).
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

## 7. Conectar con Drive (una sola vez; yo hago la parte de Supabase cuando me lo pidas)
Todo se prueba **primero en PRUEBAS**. Las claves las escribes tú en Google y en Supabase: **no las pegues en el chat**.

**A. En Google (con la cuenta dueña del Drive, unos 10 minutos)**
1. Crea una carpeta en tu Drive, por ejemplo «GLACIAL · Control de proceso». Ábrela y copia su **ID**: lo que va después de `/folders/` en la dirección del navegador.
2. Entra a **script.google.com** con la misma cuenta → **Nuevo proyecto** → ponle «GLACIAL Control de proceso». Borra el código de ejemplo y pega **todo** el contenido de `supabase/drive/apps-script/Codigo.gs`.
3. **Configuración del proyecto** (engranaje) → **Propiedades del script** → agrega dos:
   - `GLACIAL_SECRETO`: una clave larga que inventas (mínimo 24 caracteres). Guárdala: la necesitarás en Supabase.
   - `CARPETA_ID`: el ID de la carpeta del paso 1.
4. **Implementar › Nueva implementación** → tipo **Aplicación web** → *Ejecutar como*: **Yo** · *Quién tiene acceso*: **Cualquier persona** → **Implementar**. Google pedirá permisos de Drive y Hojas de cálculo: acepta (si dice «Google no ha verificado esta app», pulsa *Avanzado › Ir a GLACIAL Control de proceso*; es tu propio script).
5. Copia la **URL de la aplicación web** (termina en `/exec`). Ábrela en el navegador: debe mostrar `{"ok":true,"servicio":"glacial-control-proceso"}`.
La seguridad es la clave: quien tenga la URL pero no `GLACIAL_SECRETO` no puede hacer nada.

**B. En Supabase (PRUEBAS)**
6. Aplicar la migración `glacial_35` y desplegar la función `control-proceso-drive` sin verificación de JWT (lo hago yo cuando me digas «conecta Drive en PRUEBAS»).
7. En **Edge Functions › Secrets** agrega tres: `APPS_SCRIPT_URL` (la URL del paso 5), `APPS_SCRIPT_SECRETO` (la misma clave que `GLACIAL_SECRETO`) y `SYNC_SECRETO` (otra clave larga distinta, mínimo 24).
8. En el **SQL Editor** guarda en el Vault la dirección y la clave del disparador (cambia `<REF>` por el id del proyecto y `<SYNC_SECRETO>` por la clave del paso 7):
   `select vault.create_secret('https://<REF>.supabase.co/functions/v1/control-proceso-drive', 'control_proceso_url');`
   `select vault.create_secret('<SYNC_SECRETO>', 'control_proceso_sync_secreto');`
   Mientras estos dos no existan, el trabajo de cada 5 minutos no hace nada.

**C. Comprobar**
9. En **Asistente de Producción › Lotes**, en la tarjeta «Control de proceso», pulsa **«Sincronizar ahora con Drive»**. Debe aparecer el libro `C.P_BIDON_7L-<MES>-<AÑO>` en tu carpeta, con una hoja por marca, y la tarjeta dirá **✓ Copiado a Drive** con el enlace «Abrir en Drive».
10. Cambia algo de un reporte de B7L y espera hasta 5 minutos: la fila debe actualizarse sola, sin duplicarse. Escribe algo en MAN o CONF de una fila: debe conservarse tras la siguiente copia.

**Cosas a tener en cuenta**
- Si cambias una clave, cámbiala en los dos lados (`GLACIAL_SECRETO` ↔ `APPS_SCRIPT_SECRETO`).
- Para actualizar el script usa **Implementar › Gestionar implementaciones › editar › Nueva versión**: así la URL no cambia. Con «Nueva implementación» la URL cambia y hay que actualizar `APPS_SCRIPT_URL`.
- No borres la columna R (oculta) ni cambies los encabezados de la fila 8: así GLACIAL reconoce sus hojas. No uses para el libro de GLACIAL el mismo nombre del libro hecho a mano.
- Si ves el error «no fue creada por GLACIAL», el libro o la hoja ya existían a mano: cámbiales el nombre.
- Las cuotas gratuitas de Apps Script sobran para este uso (una llamada cada 5 minutos solo si algo cambió).
- **No está probado contra tu Google real**: las pruebas usan un Google simulado. Por eso el primer paso es PRUEBAS, con un libro y una carpeta de ensayo.
