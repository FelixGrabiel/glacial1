# Convocatoria semanal (armada por el supervisor) + Tareo prellenado

**27/11/2026.** Antes el supervisor armaba la convocatoria en Excel, la mandaba como imagen por WhatsApp y después se volvía a digitar en GLACIAL (importación de la rotación del Tareo). Ahora:

1. La convocatoria se **arma dentro de GLACIAL** (Producción › Convocatoria semanal, también en Recursos Humanos).
2. La **imagen de WhatsApp sale sola** al publicar (mismo formato que la del Excel).
3. El **Tareo diario se prellena** con ella: cada persona en su equipo y con el horario del equipo.

## Archivos

| Archivo | Qué hace |
|---|---|
| `js/personal/49-convocatoria-nucleo.js` | Lógica pura (node): `cambioDeTurno`, `esNuevo`, `validarConvocatoria`, `totales`, `copiarSemana`, `prellenarTareo`, `tardanzaPorHorarioEquipo`, `leerConvocatoriaTexto`, `cruzarNombres`, `modeloImagen`. |
| `js/personal/49b-convocatoria-pantalla.js` | Pantalla mobile-first, Tiempo real, cola sin conexión, imagen de WhatsApp, importador de transición, equipos y horarios. |
| `js/personal/49c-convocatoria-tareo.js` | Tareo prellenado: envuelve `obtenerPersonalPorRotacion` y `tareoNuevaPersona` (13-tareo.js). |
| `supabase/migraciones/glacial_72_convocatoria.sql` | Tablas, funciones y Tiempo real. **Aplicada en PRUEBAS (27/11/2026). Producción: pendiente de aprobación.** |
| `js/personal/11-trabajadores.js` | Nuevo campo **Fecha de ingreso** del maestro (para el NUEVO automático). |

## Reglas

- **Quién edita:** el supervisor edita **su turno** (día o noche, según la rotación de supervisores) y ve el otro en solo lectura. Administrador y Jefatura editan los dos. RRHH y quien ve el resumen de producción solo miran. Permiso nuevo `convocatoria` (los supervisores lo tienen salvo `-convocatoria`).
  - *Límite:* que el supervisor edite solo su turno lo controla la pantalla; el servidor exige el permiso de editar y guarda el historial de todo cambio.
- **Identidad:** el id del maestro de trabajadores (`sync/workers`). El nombre ya no lleva «NUEVO» ni «*». Sin DNI → aviso (no bloquea).
- **Equipos con horario propio** (`equipos_trabajo`, editable en «Equipos y horarios»): columna DÍA | NOCHE de la imagen, turno base DÍA | INTERMEDIO | NOCHE para el resto del sistema y mínimo de personas (aviso «3 / 4»). Vienen los de la semana 23/11–29/11/2026:
  - Día: Equipo PET 07:00–19:00 · Bidones 7L 07:00–19:00 · Cajas 20L 13:00–22:00 (intermedio) · Equipo Hielo 07:00–19:00 · Bidones 20L 13:00–22:00 (intermedio)
  - Noche: Bidones 7L 21:00–07:00 · Equipo de Hielo 21:00–07:00 · PET 21:00–07:00
  - Los mínimos de fábrica son un punto de partida: ajústalos en pantalla.
- **⇄ Cambió de turno (automático):** la semana anterior estaba en la otra columna. Reemplaza al asterisco.
- **NUEVO (automático):** fecha de ingreso del maestro (o, sin ella, la de alta en el sistema) dentro de las últimas N semanas (por defecto 2, `convocatorias.nuevo_semanas`).
- **Descanso médico / vacaciones / licencia:** con fecha de fin. Si la persona también está en un equipo → aviso.
- **Estados:** BORRADOR → PUBLICADA → CERRADA. Publicada se puede seguir corrigiendo (queda en `convocatoria_historial`: quién, cuándo, antes → después). Reabrir una CERRADA: Administrador o Jefatura.
- **Atajos:** «Copiar semana anterior» (solo en una semana vacía; los descansos ya terminados no pasan), «Buscar persona», ⋮ → «Mover a…» / descanso / quitar, y arrastrar entre equipos en PC.
- **Avisos amarillos:** día y noche a la vez, persona en dos equipos, sin DNI, equipo bajo el mínimo, en descanso/vacaciones y convocado, dado de baja, persona que no está en el maestro.

## Tiempo real y guardado concurrente

- Canal de Supabase sobre `convocatorias`, `convocatoria_asignaciones` y `equipos_trabajo`: si un supervisor mueve a alguien, el otro lo ve al instante (se relee la semana).
- Cada acción lleva `client_event_id`: el servidor guarda su resultado (`convocatoria_eventos`) y un reintento devuelve lo mismo.
- Las acciones son por persona (poner, mover o quitar una asignación): dos supervisores editando a la vez no se pisan.
- Sin conexión, la acción queda en la cola del equipo (`localStorage glacial:convocatoria:cola`) y se envía al volver.
- Mover algo que otro ya quitó → «esa persona ya no está ahí».

## Imagen para WhatsApp

Sale al publicar y con «Ver imagen WhatsApp»:
- Título «CONVOCATORIA DE LA SEMANA dd/mm AL dd/mm · GLACIAL».
- Columnas N° / TURNO DÍA / N° / TURNO NOCHE.
- Bloques por equipo con horario y cantidad, y bloque DESCANSO MÉDICO.
- «NUEVO» en rojo y «⇄» morado.
- Totales por turno y TOTAL, leyenda y «Generado por GLACIAL · supervisor · fecha y hora».

Se puede descargar en PNG y compartir (Web Share en el celular).

## Tareo prellenado

Con una convocatoria **PUBLICADA** (o CERRADA) para la semana de la fecha, el Tareo de Producción toma de ella a su personal:

- **Turnos:** el turno Día trae la columna DÍA, incluidos los intermedios, que traen su hora 13:00. El turno Noche trae la columna NOCHE.
- **Cada persona:** queda en su equipo (columna «línea» = equipo), con `horaProgramadaIngreso` = inicio del equipo y `horaProgramadaSalida` = fin del equipo.
- **Tardanzas:** se calculan con el horario del equipo, también en 21:00–07:00, que cruza la medianoche.
- **Descansos:** quien está en descanso médico / vacaciones / licencia ese día entra ya con ese estado.
- **Sin convocatoria publicada:** el Tareo sigue con la rotación importada del Excel, como siempre (transición).
- **No cambian:** la hora automática al marcar ASISTIÓ, las horas extras, el bloqueo a los 2 días, los maquinistas desde Mantenimiento y el personal por día.

## Importador de transición

«Importar desde el Excel (transición)» lee la tabla pegada del Excel actual:
- títulos «EQUIPO … HH:MM–HH:MM (n)», N°, nombre, «NUEVO», «*» y DESCANSO MÉDICO;
- propone el cruce con el maestro: exacto, alias guardado, parecido o sin cruce;
- los que no cruzan se unen con un toque y queda el alias (`trabajador_alias`) para la próxima vez.

## Pendiente (siguiente etapa)

- **Tareo agrupado por equipo** (mockup 3): tarjetas por equipo, KPIs Asistió / Tardanza / Falta / Por marcar y botones rápidos. Hoy el equipo y el horario ya llegan a cada persona (columna «línea» y hora programada), pero la pantalla del Tareo se ve como antes.
- **«Hoy pasa a PET»:** cambio de equipo solo por un día desde el Tareo, sin tocar la convocatoria.
- **Exportación RRHH (38) e imagen del tareo con el equipo:** hoy muestran la «línea», que ya es el equipo.
- **Fase 2:** rotación automática de descansos con cobertura mínima por línea y turno (PET1 4, PET2 4, B7L 6, Hielo 2) y un domingo de descanso al mes por operario. El núcleo deja `validarConvocatoria` y `copiarSemana` listos para que el generador proponga la convocatoria.

## Pruebas

- `tests/convocatoria.test.js` (node). Casos con la forma de la semana 23/11: 50 + 37 = 87, 4 con ⇄, 8 NUEVO, 1 descanso médico, Bidones 20L 3/4. Usa nombres ficticios: no se suben nombres reales al repositorio.
- `tests/convocatoria.e2e.js` (Chromium): dos supervisores (día en celular, noche en PC) a la vez, Tiempo real, solo su turno, mover, sin conexión, publicar e imagen, Tareo prellenado.
- `supabase/pruebas/convocatoria.sql`: 12 comprobaciones de glacial_72 (termina en ROLLBACK).
