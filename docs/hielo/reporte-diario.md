# Reporte diario de producción · Hielo (20/11/2026)

Pestaña **Reporte diario** del módulo de Hielo. Reproduce el Excel «REPORTE DIARIO DE PRODUCCIÓN · HIELO EN CUBOS» de la planta, con gráficas industriales, y lo descarga como **Excel** o como **imagen PNG** para WhatsApp. Código: `js/hielo/99-hielo-reporte-diario.js` (modelo y Excel, puros) y la pantalla en `js/hielo/97-hielo.js`.

## Reglas (sacadas del Excel de la planta y comprobadas con sus números)
- **Día de producción** = la **noche de la víspera** (21:00 → 07:00) + el **día** de la fecha (+ Intermedio). El reporte del 19/11/2026 lleva la noche del 18/11 y el día del 19/11 (26,560.25 kg).
- **Kilos reales por bolsa:** la bolsa «3 kg» pesa **3.25 kg** y la «1.5 kg», **1.75 kg**. Esto sustituye el cálculo anterior (3 y 1.5) en **todo** Hielo: Inicio, Historial, Avance y cierre, y el Excel general de planta. Los kilos de reportes antiguos se recalculan con estos pesos.
- **Eficiencia** = kg del turno ÷ capacidad del turno (**34,000 kg**): 33.68 % la noche y 44.44 % el día en el reporte de la planta.
- **N.º de paletas** = bolsas ÷ bolsas por paleta (3 kg → 300, 1.5 kg → 600).
- **Semana** de domingo a sábado; cada columna lleva la noche de ese día más el día siguiente (domingo = noche 15/11 + día 16/11). El número de semana es el ISO (47 para el 19/11/2026).

Los tres valores (kg reales, bolsas por paleta y capacidad) se cambian en **Hielo › Configuración › Kilos reales, paletas y capacidad** (Administrador y jefes). Se guardan en `hieloParametros/config` (`pesos`, `bolsasPorPaleta`, `capacidadTurnoKg`); no hace falta migración.

## Qué contiene
- Tarjetas: kg de la noche, del día, total del día y de la semana, con la eficiencia de cada turno.
- Reporte de personal por turno: ingreso, salida, jornada y responsable (a partir de lo registrado en el reporte del turno).
- **Reporte por marca**: las 14 filas del catálogo en el orden del Excel, con bolsas, tiempo (h), N.º de paletas, lote, vencimiento y peso por turno.
- Cuatro gráficas (se dibujan en canvas, así salen iguales en pantalla, Excel e imagen):
  1. **Producción vs capacidad por turno** (reemplaza «Producción por turno» y «Eficiencia general»): cuánto falta para llenar el turno.
  2. **Kilos por presentación** por turno.
  3. **Producción de la semana** con el promedio (los días sin datos se ven punteados).
  4. **Pareto de paradas** por motivo, con minutos y acumulado.
- Observaciones de los dos turnos. El Excel agrega la hoja «Resumen y semana» (presentaciones, eficiencia, cuadro semanal) y las gráficas como imágenes.

## Lo que todavía no se registra
Estos datos salen vacíos hasta que se agreguen al registro del turno:
- **Tiempo (h)** y **vencimiento** por marca (el modelo ya los usa si llegan en la línea de producción como `horas` y `vence`).
- **Número de personas** del turno.
- **Paradas con minutos:** hoy casi todo queda escrito en Observaciones; el Pareto solo cuenta las paradas registradas con minutos y motivo.
- **Equipo** de cada parada.

## Pruebas
- `tests/hielo-reporte-diario.test.js`: el modelo reproduce las dos hojas del Excel de la planta (kilos, paletas, eficiencia, totales por presentación, semana) y, con `GLX_LIBS`, lee el Excel generado.
- `tests/hielo-reporte-diario.e2e.js`: pantalla, gráficas, Excel e imagen descargados, en navegador real.
- `tests/reporte-hielo.test.js` (kilos reales, configuración) y `tests/hielo-menu-movil.e2e.js` (menú con la pestaña nueva).

## Gráficas de análisis (carta de control, mezcla por marca, mapa de calor)

Además de las 4 gráficas del Excel, el Reporte diario incluye 3 más. Aparecen en pantalla, en el Excel (hoja «Reporte diario») y en la imagen para WhatsApp.

- **Selector de período**: 7, 14 o 21 días (por defecto 14). Aplica a mezcla por marca y mapa de calor.
- **Carta de control diaria**: producción por día de producción (noche anterior + día). Líneas: promedio y límites ±2,66 × rango móvil medio. Usa los últimos 30 días; necesita al menos 8 días completos y finalizados, si no muestra aviso. Los días sin finalizar se dibujan como punto vacío y no cuentan para los límites. Se marca en rojo un día fuera de límites y una racha de 7 días seguidos del mismo lado del promedio.
- **Mezcla por marca**: kg por marca del período, separados por presentación (3 kg y 1,5 kg), con el % del total.
- **Mapa de calor día × turno**: miles de kg por día (columnas) y turno Día/Noche (filas). Casilla punteada = turno sin reporte. Indica en cuántos días la noche produjo más que el día.

No requiere migración de base de datos.

## Reporte por turno (solo noche / solo día)

Arriba del reporte hay un selector **«Reporte de»** con tres opciones:

- **Día de producción (noche + día)**: el reporte de siempre, igual que el Excel de la planta.
- **Solo turno noche**: únicamente la noche. La fecha del selector es la del propio turno (por ejemplo, el 18/11 muestra la noche del 18/11).
- **Solo turno día**: únicamente el día de esa fecha.

En la vista por turno todo se calcula solo con ese turno: tarjetas (kg, eficiencia, bolsas y paletas, jornada y responsable), tabla por marca de un solo bloque, las 7 gráficas (la semana, la carta de control, la mezcla por marca y el mapa de calor usan solo ese turno) y las paradas y observaciones. La semana suma solo ese turno.

El Excel y la imagen de WhatsApp salen con el mismo filtro. En el Excel el otro turno aparece marcado como «NO INCLUIDO EN ESTE REPORTE», y el nombre del archivo termina en `-noche` o `-dia`.

## Compartir por WhatsApp

Junto a «Descargar Excel» y «Descargar imagen» hay dos botones verdes: **«Compartir imagen por WhatsApp»** y **«Compartir Excel por WhatsApp»**. Comparten lo que se está viendo (día de producción o un solo turno).

- **En el celular (Android o iPhone)**: abre el menú de compartir del teléfono con el archivo y un resumen como texto. Se elige WhatsApp y el chat o grupo.
- **En el computador**: descarga el archivo y abre WhatsApp con el resumen escrito. WhatsApp Web no permite adjuntar un archivo de forma automática, así que el archivo se adjunta a mano desde Descargas.

El resumen incluye título, fecha y semana, kg y eficiencia de cada turno, total del día, total de la semana y observaciones.

## Marcas producidas en la imagen

La imagen para WhatsApp incluye, debajo de las tarjetas, la tabla **«Marcas producidas por turno»** (o «en el turno noche / día» si el reporte es de un solo turno). Muestra solo las marcas que sí produjeron, con bolsas, peso (kg), paletas y lote de cada turno, y una fila de total.
