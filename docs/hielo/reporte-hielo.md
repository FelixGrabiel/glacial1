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
- Que el hielo aparezca en Inicio y en el Reporte General de la empresa.

## Pruebas
- `tests/reporte-hielo.test.js`: kg por presentación, totales separados por presentación, cumplimiento, validaciones para finalizar, versiones e historial, configuración, Excel y conexiones.
- Visual: `tests/visual/hielo.html?vista=inicio|registro|historial|programacion|config&rol=supervisor|admin|planificacion|gerente`.
