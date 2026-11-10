# Reporte Hielo

Página propia, que se abre desde la tarjeta **«Reporte Hielo»** de la pantalla de selección (antes mostraba «en desarrollo»). Código: `js/hielo/97-hielo.js`. Servidor: `supabase/migraciones/glacial_46_reporte_hielo.sql` (aplicada en PRUEBAS y PRODUCCIÓN, 07/11/2026).

## Secciones
- **Inicio:** fecha y turno (o todo el día).
  - Tarjetas de **bolsas por presentación**: **3 kg** y **1.5 kg** siempre, y las demás si tienen producción o programación (pedido del dueño, 07/11/2026).
  - Kilos producidos, cumplimiento contra lo programado y paradas.
  - Tablas de producción por marca y presentación (programado contra producido), paradas y merma.
- **Nuevo registro:** un reporte por **fecha operativa y turno** (DÍA, INTERMEDIO o NOCHE, como Agua).
  - Producción en **bolsas** por marca y presentación, con lote opcional; los kilos se calculan (bolsas × kg de la presentación).
  - Paradas (hora, equipo, motivo, minutos y detalle), merma (ítem, cantidad y UND o KG) y observaciones.
  - Al abrir un turno nuevo se precarga lo programado.
  - Se guarda solo (borrador) y se **finaliza** con validaciones. Un reporte finalizado solo lo reabre o corrige el Administrador, con motivo.
- **Avance y cierre:** arma, con lo registrado, el **texto para WhatsApp** (mismo estilo que el Avance y Cierre de Agua: `*AVANCE DE PRODUCCIÓN HIELO – TURNO …*` / `*CIERRE DE PRODUCCIÓN HIELO – …*`) y una **imagen PNG** del turno. Se elige fecha y turno (Día + Intermedio, Día, Intermedio, Noche o todo el día). Es **CIERRE** cuando todos los reportes del turno están finalizados y **AVANCE** si alguno sigue en registro. Botones: Copiar texto, Abrir en WhatsApp (wa.me con el texto ya escrito) y Descargar imagen. No guarda nada: se arma al momento (el envío automático por el bot de WhatsApp, como en Agua, queda fuera: el bot vive en otro proyecto).
- **Historial:** filtros por fechas, turno y marca; bolsas por presentación, kg, paradas y estado. **Descargar Excel**, con una fila por producción.
- **Programación:** bolsas a producir por fecha, turno, marca y presentación, y los próximos turnos programados.
- **Configuración:** marcas, presentaciones (con sus kg), **equipos de la planta**, motivos de parada e ítems de merma.
  - Los equipos **empiezan vacíos**: no se inventan, los carga Producción.
  - Las marcas y presentaciones de partida son las del programa (`MARCAS_HIELO` y `PRESENTACIONES_HIELO`).

## Permisos (iguales en pantalla y en el servidor)
| Acción | Quién |
|---|---|
| Ver | Cualquier usuario con sesión (salvo la cuenta compartida de mantenimiento) |
| Registrar y finalizar | Administrador, jefes de Producción y Operaciones, supervisores, o quien tiene el permiso «paletas» |
| Reabrir o corregir un reporte finalizado | Administrador |
| Programación | Administrador, permiso «planificación», Jefe de Producción y Planificación |
| Configuración | Administrador y jefes (Producción, Operaciones, Jefatura y Gerencia) |

Nadie en modo Visualizar escribe, y nada se borra.

## Datos
- `hieloReportes/{AAAA-MM-DD_TURNO}`: `fecha`, `turno`, `estado` (EN_REGISTRO o FINALIZADO), `supervisor`, `horaInicio`, `horaFin`, `produccion[]`, `paradas[]`, `mermas[]`, `observaciones`, `rev` e `historial[]` (crear, finalizar y reabrir con motivo).
- `hieloProgramacion/{AAAA-MM-DD_TURNO}`: `items[{marca, presentacion, bolsas}]`, `rev` e `historial[]`.
- `hieloParametros/config`: las listas de Configuración, `rev` e `historial[]`.

## Pendiente (por confirmar con Producción)
- Equipos de la planta: se cargan en Configuración.
- ¿Se cuenta también por sacos o paquetes, o se paletiza?
- Puestos del personal (tareo de hielo).
- Lotes de insumo usados (bolsas y bobinas) y su consumo. Ya existen en Lotes y en el banco de proveedores.
- Que el hielo aparezca en el Reporte General de la empresa (Excel). **El Inicio ya lo muestra** (ver abajo).

## Pruebas
- `tests/reporte-hielo.test.js`: kg por presentación, totales separados por presentación, cumplimiento, validaciones para finalizar, versiones e historial, configuración, Excel y conexiones.
- Visual: `tests/visual/hielo.html?vista=inicio|registro|historial|programacion|config&rol=supervisor|admin|planificacion|gerente`.

## Hielo en el Inicio (09/11/2026)
- `js/hielo/98-hielo-inicio.js`: tarjeta **«HIELO · Día + Intermedio / Noche»** en el Inicio (dentro de «Resumen de producción», junto a Paradas de hoy y Proyección del turno). Sigue la fecha y el bloque que se eligen arriba en el Inicio.
- Muestra bolsas de **3 kg** y **1.5 kg** (siempre) y las otras presentaciones solo si tuvieron producción o programación, kilos, cumplimiento contra lo programado, paradas y el estado del reporte (Sin reporte / En registro / Finalizado), con el botón «Abrir Reporte Hielo». Solo lectura.
- «Día» incluye el turno Intermedio, igual que en la TV. La ven los usuarios del Inicio, salvo la cuenta compartida de mantenimiento.
- Pruebas: `tests/hielo-inicio.test.js` y `tests/hielo-inicio.e2e.js`.

## Avance y cierre: formato de la planta

El texto de WhatsApp sigue el formato que ya envía la planta: `Avance de produccion HIELO TD` (TD = todo el día; también D+I, DÍA, INT, NOCHE), fecha `DD_MM_AA`, bloques por **estación** (Tolva manual, Env. automática…), totales «Producción de bolsas 3kg / Producción de 3kg: N kg», aviso `🚨SE VIENE TRABAJANDO POR CAÍDAS` (casilla en Observaciones del reporte) y «Observaciones» (texto libre + paradas + merma).
- Cada línea de producción tiene una **Estación** (lista editable en Configuración › Estaciones de producción). Las líneas sin estación salen sin encabezado.
- Los totales se calculan con las líneas registradas; en el ejemplo de la planta no coincidían con la suma de sus líneas, el sistema siempre suma lo registrado.

## Permisos propios, separados de Agua (10/11/2026, glacial_50)
Antes, registrar o programar Hielo dependía de los mismos permisos de Agua (`paletas` para registrar, `planificacion` para programar). Quien tenía esos permisos de Agua entraba a Hielo sin que el Administrador se lo diera, y quitarle a alguien el permiso de Agua también le quitaba Hielo sin querer.

Ahora, en **Gestión de usuarios**, hay un área propia **«Hielo»** en el catálogo de permisos, con dos permisos:
- **«Registrar Hielo»** (`hielo`): Nuevo registro y Avance y cierre. Por defecto lo tienen el Administrador y los mismos roles de planta de siempre (Jefe de Producción, Jefe de Operaciones, Supervisor, Supervisor de Producción); el Administrador puede quitárselo a uno de ellos marcándole «-hielo» en su lista de permisos, sin tocar sus permisos de Agua.
- **«Programar Hielo»** (`programarHielo`): Programación y Configuración de Hielo. Mismo criterio, con «-programarHielo».

La Configuración de Hielo (editar marcas, presentaciones, estaciones…) sigue siendo del Administrador o Jefatura, igual que antes.

Servidor: `supabase/migraciones/glacial_50_permisos_hielo_separados.sql` (aplicada en PRUEBAS; PRODUCCIÓN pendiente de aprobación). Prueba repetible: `supabase/pruebas/hielo_permisos_separados.sql`.
