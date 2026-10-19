# Migración de gráficos (Chart.js → ApexCharts / ECharts / canvas-gauges)

Se hace **por fases, una pestaña a la vez**. Chart.js sigue cargado hasta que la última fase lo retire.

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Capa base (`08a-graficos-base.js`) + pestaña **Gráficos** de la línea (10 gráficos) | Hecha |
| 2 | Resumen general (13 gráficos, incluida la carga diferida `49b`) | Pendiente |
| 3 | Impacto económico (10 tarjetas) | Pendiente |
| 4 | Tareo (horas extras) y Reporte General a Excel; retirar Chart.js | Pendiente |

## Decisiones
- Todos los gráficos existentes pasan a ApexCharts con el **mismo tipo** (los que el prompt no mapeaba). Los velocímetros son de ECharts.
- Metas y colores de los gráficos nuevos: `METAS_GRAFICOS` (OEE 75, disponibilidad 85, rendimiento 85, cumplimiento 100) y `colorKpi` (verde ≥ meta; ámbar de meta−10 a meta; rojo por debajo; OEE: <65 rojo, 65–75 ámbar, ≥75 verde). Cumplimiento: <80 rojo · 80–95 ámbar · 95–105 verde · >105 naranja. Las tarjetas, el Excel y las demás pantallas siguen leyendo las metas de `sync/configIndicadores` (`METAS`): por eso, mientras dure la migración, un mismo valor puede verse con otro color en un gráfico nuevo y en una tarjeta.
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

## Pruebas
- `node tests/graficos-base.test.js` (rápida): metas, colores, registro, integración en `index.html`.
- `GLX_LIBS=<carpeta con node_modules de apexcharts, echarts, canvas-gauges y chart.js> node tests/graficos-fase1.e2e.js`: dibuja la pestaña con los 10 gráficos en PC y en celular de 360 px, comprueba que caben, que no se acumulan instancias, los PNG y las metas.
