# Reporte Hielo

Página propia, que se abre desde la tarjeta **«Reporte Hielo»** de la pantalla de selección (antes mostraba «en desarrollo»). Código: `js/hielo/97-hielo.js`. Servidor: `supabase/migraciones/glacial_46_reporte_hielo.sql` (aplicada en PRUEBAS y PRODUCCIÓN, 07/11/2026).

## Secciones
- **Inicio:** fecha y turno (o todo el día).
  - Tarjetas de **bolsas por presentación**: **3 kg** y **1.5 kg** siempre, y las demás si tienen producción o programación (pedido del dueño, 07/11/2026).
  - Kilos producidos, cumplimiento contra lo programado y paradas.
  - Tablas de producción por marca y presentación (programado contra producido), paradas y merma.
- **Nuevo registro:** un reporte por **fecha operativa y turno** (DÍA, INTERMEDIO o NOCHE, como Agua).
  - Producción en **bolsas** por marca y presentación, con lote opcional; los kilos se calculan (bolsas × **kg reales** por bolsa: 3 kg = 3.25 y 1.5 kg = 1.75, configurables; ver `reporte-diario.md`).
  - Paradas (hora, equipo, motivo, minutos y detalle), merma (ítem, cantidad y UND o KG) y observaciones.
  - Al abrir un turno nuevo se precarga lo programado.
  - Se guarda solo (borrador) y se **finaliza** con validaciones. Un reporte finalizado solo lo reabre o corrige el Administrador, con motivo.
- **Reporte diario** (20/11/2026): el reporte de la planta con gráficas, en Excel o imagen. Ver `docs/hielo/reporte-diario.md`.
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
- ~~Que el hielo aparezca en el Reporte General de la empresa (Excel).~~ **Hecho (14/11/2026):** el Excel general de planta agrega la hoja **«Hielo»** (producción por fecha, turno, marca y presentación, con bolsas y kg, y el total por presentación) dentro del mismo rango de fechas. Solo incluye los reportes que la app tiene cargados de Hielo; sin datos no se agrega. Código: `xlgHojaHielo` en `js/produccion/14-exportar-general.js`. El Inicio también lo muestra (ver abajo).

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

Servidor: `supabase/migraciones/glacial_50_permisos_hielo_separados.sql` (aplicada en PRUEBAS y PRODUCCIÓN; verificado 14/11/2026). Prueba repetible: `supabase/pruebas/hielo_permisos_separados.sql`.

## Merma por marca (23/11/2026)

Cada merma del registro lleva **ítem, marca, cantidad y unidad**:

- **Lista de marcas:** primero aparecen las producidas en el turno y después el resto del catálogo del producto.
- **Al agregar una merma:** si en el turno se produjo una sola marca, viene ya elegida.
- **Al finalizar:** la marca es obligatoria, como el ítem y la cantidad.
- **Totales, texto de WhatsApp e imagen del avance/cierre:** la merma se separa por ítem y marca, por ejemplo «Merma Bolsas (Glacial): 12 UND».

Los reportes guardados antes del cambio no tienen marca en sus mermas y siguen mostrándose sin ella («—»).

Las tablas de paradas y mermas se muestran en tarjetas cuando su recuadro es angosto, igual que en el celular.

## «Avance y cierre» después de finalizar (24/11/2026)

**Problema.** Al finalizar un reporte e ir a «Avance y cierre», a veces seguía saliendo AVANCE con lo ingresado antes, aunque en el servidor el reporte ya estaba FINALIZADO. Había dos causas:
- La copia de reportes de la página (`cache.reportes`) solo cambiaba con el aviso en tiempo real; si ese aviso tardaba o se perdía, la pantalla mostraba lo anterior.
- De noche, la pantalla abría el turno Noche, que todavía no tiene reporte.

**Solución:**
- Lo que el servidor confirma al guardar, finalizar o reabrir entra al momento en la copia (`ponerEnCache`).
- Un aviso en tiempo real atrasado no vuelve a una versión anterior (`masNuevos`, compara `rev`).
- Al entrar a «Avance y cierre» se vuelven a leer los reportes del servidor.
- Al finalizar, «Avance y cierre» queda en la fecha y el turno de ese reporte. Si el turno en curso no tiene reporte, abre el último que sí lo tiene.

Prueba: `tests/hielo-cierre-al-finalizar.e2e.js`. Sin la corrección, la prueba reproduce el problema.

## Vasos aparte en el avance de cubos (24/11/2026)

El **Avance y cierre** de *Hielo en cubos* (texto de WhatsApp e imagen) lleva los vasos en su propio bloque **VASOS DE HIELO**:

- **Cubos**: solo bolsas (3 kg, 1.5 kg…). El total de kilos y el cumplimiento no cuentan los vasos.
- **Vasos**: estaciones con marcas en vasos, producción de vasos, jabas, peso aproximado, «TOTAL VASOS» y su programado, si lo hay.
- **Fuentes de los vasos**:
  - los reportes de *Vasos* del mismo turno;
  - una fila «Vaso» cargada por error en un reporte de cubos, que también pasa a este bloque.
- **Bot de WhatsApp**: pasa todos los reportes del turno juntos y aun así salen separados, porque la separación la hace `modeloAvanceCierre`.
- **Observaciones**: las de los vasos van marcadas «Vasos:».
- **AVANCE o CIERRE**: es CIERRE solo cuando cubos y vasos están finalizados.
- **Sin vasos**: no aparece el bloque.

El avance de *Vasos* (producto aparte) no cambia. Pruebas: `tests/hielo-avance-vasos.test.js`.
