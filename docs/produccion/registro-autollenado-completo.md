# Registro de producción que se llena solo durante el turno

Desde el 23/11/2026 el registro de producción (Registro › Nuevo registro) se completa solo con lo que ya se registra durante el turno. Al terminar, el supervisor solo escribe lo que ninguna pantalla conoce.

Código: `js/produccion/35c-autollenado-completo.js`, que se engancha al autollenado existente (`35-autollenado-registro.js`). Pruebas: `tests/autollenado-completo.test.js` y `tests/autollenado-completo.e2e.js`.

## De dónde sale cada dato

| Dato del registro | Origen | Desde |
|---|---|---|
| Marca y presentación de **todas** las marcas del turno | Programación del bloque; entra cada producto ya iniciado en Producción actual | 23/11/2026 (antes solo el cuadro 1) |
| Ratio nominal, lote | catálogo y código de lote | ya existía |
| Fecha de vencimiento | fecha del lote + vida útil de la línea (12 meses por defecto; el turno noche lleva la fecha del día siguiente) | 23/11/2026 |
| Hora de inicio y de fin de cada marca | «Iniciar» y «Finalizar» de Producción actual | 23/11/2026 |
| Producción programada | Programación | ya existía |
| Producción efectiva, N° de paletas | Paletas | ya existía |
| Paradas | «Agregar paradas» de Avance y Cierre | ya existía |
| Personal del turno | Tareo de Producción (filas vacías, sin botón) | 23/11/2026 |
| Insumos | estimados por el registro a partir de la producción | ya existía |
| Sopladas / disponibles, calidad, mermas, observaciones | **el supervisor** | — |

## Reglas

- **Nada se pisa.** Una hora, un nombre o una cantidad que el supervisor cambió a mano se respeta. Solo se reemplaza lo vacío, la hora por defecto del turno o lo que puso el propio llenado (`cuadro.autoHoras`).
- Una marca en curso todavía no tiene hora de fin. La lista «Para cerrar» la muestra como pendiente hasta que se pulse «Finalizar» en Producción actual o el supervisor la escriba.
- Solo actúa en registros **EN REGISTRO** con autollenado. Los finalizados y los reabiertos no se tocan.
- Los puestos numerados («Sopladora 1», «Etiquetado 2») reconocen el cargo del tareo («Maquinista soplador», «Etiquetador»). La corrección vale también para el botón «Completar con el tareo».

## Lista «Para cerrar el turno»

Aparece encima del panel de estado del reporte y marca cada dato como «automático», «ingresado», «falta» u «opcional». Solo es una guía: no impide finalizar. Lo obligatorio lo sigue controlando «Falta para finalizar».

## Vida útil por línea

Botón **👥 Personal y vida útil** en Registro › Gráficos, solo para Administrador y jefatura. Se guarda en `sync/configIndicadores.vidaUtilMeses`.
