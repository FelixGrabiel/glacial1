# Migración de gráficos (Chart.js → ApexCharts / ECharts / canvas-gauges)

Se hace **por fases, una pestaña a la vez**. Chart.js sigue cargado hasta que la última fase lo retire.

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Capa base (`08a-graficos-base.js`) + pestaña **Gráficos** de la línea (10 gráficos) | Hecha |
| 2 | Resumen general (13 gráficos + 3 nuevos, con la carga diferida `49b`) y anillos de KPIs en la pestaña Gráficos | Hecha |
| 3 | Impacto económico (10 tarjetas) | Hecha |
| 4 | Tareo (horas extras) y Reporte General a Excel; retirar Chart.js | Pendiente |

## Decisiones
- Todos los gráficos existentes pasan a ApexCharts con el **mismo tipo** (los que el prompt no mapeaba). Los velocímetros son de ECharts.
- Metas y colores (**unificados**): `METAS_GRAFICOS` y `colorKpi` leen la tabla CONFIGURADA (`sync/configIndicadores` → `glacialMetasIndicadores()`), la misma de tarjetas, insights y Excel: verde ≥ meta, ámbar ≥ umbral ámbar, rojo por debajo (OEE con los valores iniciales 85/75; disponibilidad 90/80; rendimiento = ratio 95/85). Cumplimiento: rojo < ámbar configurado, ámbar < verde, verde hasta 105, naranja > 105 (SOBREPRODUCCIÓN). Se leen en cada dibujo: si el administrador cambia una meta, los gráficos la siguen en el siguiente refresco. Las metas del prompt original (OEE 75, etc.) ya no se usan.
- **No hay «Calidad»**: el sistema la retiró (OEE = Disponibilidad × Rendimiento; hay una prueba que lo exige). Donde el prompt pedía Calidad se muestra **Cumplimiento**.
- **No se crea** lo que no tiene datos hoy: línea de tiempo de paradas (las paradas del registro solo traen minutos, sin hora de inicio/fin) y velocímetro analógico del OEE en la pantalla de planta (esa pantalla no calcula OEE). `velocimetroAnalogico` ya existe en la base para cuando haya datos.
- Sin animaciones: destruir un ApexCharts a mitad de animación (cambio rápido de pestaña o refresco en vivo) lanza errores asíncronos de la librería.

## Fase 1 · pestaña Gráficos de la línea
| Antes (Chart.js) | Ahora |
|---|---|
| OEE del turno (dona) | Velocímetro ECharts con aguja, bandas y marca triangular de la meta |
| Componentes del OEE vs meta (barras + meta) | Tres medidores compactos ECharts: Disponibilidad · Rendimiento · Cumplimiento |
| Cascada de pérdidas | rangeBar vertical (columnas flotantes) |
| Producción nominal / programada / efectiva | Columnas distribuidas |
| Pareto de paradas | Columnas + línea de % acumulado (eje 0–100 %) y referencia al 80 % |
| Mermas por componente | Área polar; la leyenda dice «Insumo: cantidad» |
| Consumo de insumos | Columnas |
| Tendencia de OEE y producción | Columnas + 2 líneas, dos ejes, meta de OEE punteada |
| OEE por turno | Área suave con degradado y meta punteada |
| OEE por marca | Barras horizontales con color según la meta |

`state.charts.cascada/paradas/mermas` siguen existiendo (objetos con `destroy()` y `toBase64Image()` asíncrono) para «PNG con gráficos (detalle)». Los dibujos en canvas del Excel y del PNG por línea no se tocaron.

## Fase 2 · Resumen general
| Antes (Chart.js) | Ahora |
|---|---|
| Producción por presentación y marca | Columnas agrupadas (una serie por marca) |
| Tendencia de producción por presentación | Columnas apiladas |
| Producción por turno | Columnas con color por turno |
| OEE por línea | Ranking de columnas: color según la meta, degradado `dark`, `borderRadius` 7, valor encima, meta punteada |
| Tendencia de OEE de planta | Área suave (degradado 0,38 → 0,04) con meta punteada |
| Disponibilidad y rendimiento por línea | Columnas agrupadas |
| 7 gráficos industriales (programado vs producido, cumplimiento, pareto, minutos de parada, merma, ratio, producción por persona) | ApexCharts del mismo tipo; el cumplimiento colorea según <80 / 80–95 / 95–105 / >105 |
| **Nuevo:** OEE de planta | Velocímetro ECharts con marca de meta (usa `calcularKPIsPlanta`, ya existente) |
| **Nuevo:** OEE por turno | Área suave Día vs Noche (usa `agruparOEEPorTurno`) |
| **Nuevo:** OEE por línea y día | Mapa de calor Apex, 3 rangos según las metas configuradas de OEE (rojo / ámbar / verde), valor dentro de cada celda (hasta 14 días) |
Los gráficos se crean de uno en uno DESPUÉS del render con `glacialDiferirGrafico` (en `49b-resumen-graficos-diferidos.js`; mismo comportamiento que antes con Chart.js, que se conserva para quien aún lo use). Pestaña Gráficos de la línea: se añadió **KPIs del turno** (anillos radialBar: OEE al centro como total y leyenda con nombre y valor).

## Resumen general · reordenado (después de la fase 4)
Orden de arriba abajo: encabezado y filtros → aviso de datos incompletos → **8 tarjetas** (OEE, Cumplimiento, Producción, Disponibilidad, Ratio, Merma, Paradas, Horas efectivas) → **Lectura del período** (Qué pasó + el antiguo «Resumen del período») → **Eficiencia (OEE)** (tendencia, OEE por línea, OEE por turno, mapa de calor, disponibilidad y rendimiento) → **Plan, pérdidas y paradas** (estado actual, programado vs producido con % de cumplimiento, ratio, Pareto, minutos de parada, merma, producción por persona) → **Producción** (tendencia por presentación, por turno, por marca, por presentación y marca, por línea y presentación) → **Detalle en tablas** (Por línea, Por turno, Por producto, Merma por componente).
Se quitó lo que repetía información: las «Tarjetas anteriores» (4), 3 de las 5 tarjetas del bloque de planta (Producción, Cumplimiento, Merma; Paradas y Horas efectivas subieron a la fila de tarjetas), los botones de línea (el desplegable «Toda la planta» de arriba ya cambia la misma variable), el velocímetro de OEE de planta (repetía la tarjeta OEE) y «Cumplimiento por línea» (ahora es el % dentro de «Programado vs producido»). El código vive en 09-resumen.js (plantilla con anclas `rs-anclaje-kpis`, `resumen-anclaje`, `rs-anclaje-detalle`) y 49-resumen-indicadores.js (pinta las secciones `#rgx` y `#rgx-detalle` en esas anclas).

## Impacto económico · reordenado
**Resumen ejecutivo** («¿cuánto, cuándo y por qué?»): evolución · Pareto de causas | pérdida por tipo (dona, antes en la otra pestaña) · pérdida por línea | por turno · pérdida acumulada · eventos de mayor impacto. **Análisis de pérdidas** («¿dónde está el problema?»): top máquinas (mapa de árbol, ancho completo) · marca | presentación · eventos. Tarjetas: 5 (Pérdida total ya trae ▲▼ % vs. periodo anterior; se quitó «Variación del periodo»); «Meta mensual» solo aparece si hay meta configurada. Se quitó «Minutos de parada vs. pérdida» (dispersión): repetía la tabla de eventos y el tipo de pérdida (59-impacto-analisis.js conserva `dispersion` por si se reutiliza).

## Fase 3 · Impacto económico (`58-impacto-dashboard.js`)
| Tarjeta | Antes | Ahora |
|---|---|---|
| Evolución de la pérdida | barras + periodo anterior + tendencia | columnas + 2 líneas (Apex mixto) |
| Pérdida por línea · turno · marca · presentación | barras | barras (Apex), color según selección |
| Pareto de causas | barras + % acumulado | columnas + % acumulado en segundo eje |
| Pérdida acumulada | línea con relleno | área suave con degradado |
| **Top máquinas** | barras horizontales | **mapa de árbol** (treemap): recuadro por máquina, «Máquina» + «S/ monto», bordes del color de fondo |
| **Pérdida por tipo** | barras horizontales (top 4) | **dona** con degradado y sombra, total «S/ X» al centro |
| Minutos de parada vs. pérdida | dispersión | dispersión (Apex) |
**Se conserva todo el comportamiento:** un clic o toque en una barra, recuadro, sector o punto agrega o quita ese valor del filtro (se acumulan y los no elegidos se atenúan); cada gráfico se **actualiza en sitio** con el tiempo real (`refrescar` cada 400 ms / 60 s) con la misma instancia. El clic se procesa fuera del manejador de ApexCharts (`setTimeout 0`): repintar dentro rompe la librería. `categorizarParadaPorTexto()` y todo el cálculo (56/57/59) no cambiaron.

## Fase 4 · Tareo, Reporte General y retiro de Chart.js
- `46-tareo-horas-extras.js`: gráfico de horas extras por día, ranking de trabajadores y detalle por trabajador (vistas «Horas extras» y «Jornada», 2 series) pasan a ApexCharts con etiquetas «h min» sobre las barras, tooltips propios y clic que abre el detalle (procesado fuera del manejador de Apex). Se destruyen con `TareoHE.destruir()`.
- `73-reporte-general.js`: `graficos(m)` ahora es `async`; dibuja los 2 gráficos de la hoja en un contenedor fuera de pantalla con ApexCharts y los exporta con `dataURI()` (PNG base64 para ExcelJS). Las portadas dibujadas en canvas (14 y 08) no cambian.
- **Chart.js retirado de `index.html`** y de `08-graficos.js` / `09-resumen.js` (`Chart.register`, `Chart.defaults`). Única mención que queda en `js/`: `49b-resumen-graficos-diferidos.js`, que usa `Chart` solo si existe (no lo exige). Los plugins viejos de 08/09 quedan como referencia sin uso.
- La distribución por estado del Tareo (dona) **no se creó**: hoy el Tareo no tiene ese gráfico ni su dato agregado.

## Pruebas
- `node tests/graficos-base.test.js` (rápida): metas, colores, registro, integración en `index.html`.
- `GLX_LIBS=<carpeta con node_modules de apexcharts, echarts, canvas-gauges y chart.js> node tests/graficos-fase1.e2e.js`: dibuja la pestaña con los 11 gráficos en PC y en celular de 360 px, comprueba que caben, que no se acumulan instancias, los PNG y las metas.
- `… node tests/graficos-fase2.e2e.js`: dibuja el Resumen general (16 gráficos) con 3 líneas y 12 días, en PC y celular; comprueba la creación diferida, que no se acumulan instancias y los gráficos nuevos.
- `… node tests/graficos-fase3.e2e.js`: dibuja Impacto económico (10 tarjetas) en PC (con soles) y celular de 360 px (operativo, minutos); clics REALES en barras, recuadro del treemap y sector de la dona (filtran y se quitan); 6 refrescos en vivo con las mismas instancias; sin errores de consola.
- `… node tests/graficos-fase4.e2e.js`: horas extras del Tareo (resumen y detalle) en PC y 360 px, clic real, sin acumular instancias, PNG del Reporte General y Chart.js ausente.
