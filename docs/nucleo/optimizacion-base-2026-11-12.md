# Optimización de la base y la página (12/11/2026)

## Qué pasó
El 12/11/2026 de madrugada la base de PRODUCCIÓN (plan Pro, compute **Micro**) se saturó. La API respondía con 503
(«Could not query the database for the schema cache») y 504, y no se podía guardar desde la página.

Medición del 12/11 tras el reinicio (`pg_stat_statements`):

| Qué | Parte del tiempo de la base |
|---|---|
| Tiempo real (lectura del WAL por Supabase Realtime) | ~54 % |
| `fs_consulta` (consultas en vivo) | ~20 % |
| `fs_leer` (lectura de documentos) | ~15 % |

## Causas encontradas y arreglos

1. **Borradores de Nuevo Registro: 78 KB en cada autoguardado.**
   - `sync/borradoresNuevoRegistro` guardaba los 45 borradores (desde el 23/10) en una lista sin clave. Cada autoguardado
     reescribía el documento entero (~78 KB comprimido, versión 4 194). Esa fila viajaba por tiempo real a cada equipo conectado,
     y en cada equipo se revisaban los permisos.
   - **Arreglo** (`js/accesos/17-modo-trabajo.js`): cada borrador lleva un `id` fijo (línea|fecha|grupo de turno). El puente
     guarda así cada borrador en su propia fila (`fs_items`), y un autoguardado envía solo el borrador que cambió (~8 KB).
   - No se borró ningún borrador.
2. **Consultas en vivo repetidas sin necesidad.**
   - Cada guardado en una colección hacía que **cada equipo** volviera a pedir **todas** sus consultas de esa colección. Por
     ejemplo, un guardado de otra fecha repetía la consulta de hoy en cada pantalla abierta.
   - **Arreglo** (`js/nucleo/00b-puente-supabase.js`, `filaPuedeAfectar`): la consulta solo se repite si el documento está en el
     resultado o si sus datos cumplen los filtros.
   - Ante cualquier duda se repite, como antes: aviso sin datos, tipos distintos, o textos con letras, que la base ordena
     distinto.
3. **Tiempo real decodificando tablas que nadie escucha** (migración `glacial_51`).
   - La publicación `supabase_realtime` incluía `fs_items` (cada elemento de una lista partida) y 32 tablas `g_*` del modelo
     antiguo. La página solo escucha `fs_docs`, y Mantenimiento solo sus tablas `mtto_*`.
   - **Arreglo**: `glacial_51` las quita de la publicación. No borra tablas ni datos.
4. **Carga de la página.**
   - Las librerías de gráficos y de Excel (~3 MB) estaban en el `<head>` sin `defer` y frenaban el primer dibujo.
   - **Arreglo**: ahora llevan `defer`. Se descargan en paralelo y se ejecutan antes de `DOMContentLoaded`. Los gráficos y las
     exportaciones se usan después, y cada uso comprueba que la librería exista.

## Recomendado (lo decide el dueño)
- **Subir el compute de Micro a Small.**
  - Dónde: Supabase › Project Settings › Compute and Disk.
  - Micro tiene 1 GB de RAM y CPU compartida.
  - El plan Pro trae US$10 al mes de crédito de compute, que cubre Micro. Small cuesta ~US$15 al mes, así que la diferencia
    es de ~US$5 al mes.
  - Es lo que más protege contra otra caída en horas de mucho uso.
- **El bot de WhatsApp** (otro proyecto) reintenta sin pausa cuando `evidencias-ingesta` responde 5xx: durante la caída fueron
  varias veces por segundo con las mismas dos fotos. Conviene que espere cada vez más entre intentos (por ejemplo 30 s, 1, 2,
  5 min…).

## Siguientes pasos posibles
- `fs_consulta` arma el filtro con la ruta del campo como parámetro, por eso no usa índices sobre `datos`. La consulta en vivo
  de Auditoría de tareos (`auditoriaTareos`, 9 361 documentos, `orderBy timestamp desc limit 500`) tarda ~166 ms. Se podría
  escribir la ruta como texto fijo en la consulta y crear índices por expresión para las colecciones grandes.
- Limpiar los borradores de turnos ya cerrados (hay borradores desde el 23/10). Es un cambio de datos: pedir aprobación antes.

## Copia local por usuario (12/11/2026, punto 1 de la prueba de carga)
Prueba en PRODUCCIÓN con los 20 perfiles reales, solo lectura: cada ingreso descargaba ~8 MB. Con 20 ingresos en el mismo
segundo, cada uno tardaba 7–9 s en la base (0,7 s con un usuario solo).

La propuesta original era cargar solo los últimos días. Se descartó porque `saveRecords` y las demás guardan la lista completa:
con una lista recortada, el puente habría borrado el historial que no se cargó. Además, varias pantallas (Historial,
indicadores, exportaciones) usan datos viejos.

**Lo que se hizo** (`js/nucleo/00b-puente-supabase.js`, «COPIA LOCAL»):
- El equipo guarda en IndexedDB una copia, por usuario, de los documentos de `sync`. Al volver a entrar, pide solo lo que
  cambió desde esa copia (`fs_cambios`) y no el documento entero. La página ve exactamente lo mismo.
- Nunca se muestra la copia sin ponerla al día con el servidor.
- Si los conteos no cuadran, si la versión no coincide o si algo falla, se descarta la copia y se lee todo, como antes.
- Si el servidor niega un documento por permiso, se borra su copia.
- Se guardan como mucho las copias de los 3 últimos usuarios de cada equipo.

Medido en PRODUCCIÓN (records, paletas, tareos, catalogoPlanificacion, programaciones, avancesTurno):

| Caso | Descarga |
|---|---|
| Lectura completa | 5,7 MB |
| Volver a entrar 12 h después | ~110 KB |
| Volver a entrar 24 h después | ~250 KB |

La primera vez en un equipo nuevo (o con otro usuario) se descarga todo, como antes.
