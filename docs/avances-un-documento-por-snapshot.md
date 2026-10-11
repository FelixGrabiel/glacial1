# Avances y cierres: un documento por snapshot (sync/avancesTurno al 97,6 % del límite)

## Problema (datos entregados por el usuario; no medidos por mí)
`sync/avancesTurno` pesaba 1 023 627 de 1 048 576 bytes (≈24 KB libres). Guardaba `items` (83 snapshots) y `paradasOperativas`.
`avGuardarSnapshot` reescribía el documento completo, así que el siguiente avance, cierre o guardado de paradas podía fallar.

## Qué cambió
| Pieza | Antes | Ahora |
|---|---|---|
| Snapshot de avance/cierre | `sync/avancesTurno.items[]` | `avancesTurnoItems/{id}` (mismo id y campos + `creadoPorUid`, `creadoEn` del servidor) |
| `sync/avancesTurno` | items + paradasOperativas + updatedAt | solo paradasOperativas + updatedAt (y los items antiguos hasta migrar) |
| Crear | transacción sobre el documento grande | transacción sobre el documento del snapshot; **falla si el id ya existe** (también en el documento antiguo): «El cierre de este turno ya fue generado.» / «El avance HH:MM de este turno ya fue generado.» |
| Guardar paradas | sin cambios | sin cambios (control de conflicto por `updatedAt`) |
| Lectura | un `onSnapshot` del documento | escucha en vivo del **mes del calendario**, del **día operativo** y de la fecha elegida si es de otro mes; consulta por fecha/rango para Inicio y reenvíos |
| Transición | — | los lectores **unen** items antiguos + colección, sin duplicar por id (manda el documento nuevo) |

Archivos: nuevo `js/produccion/29a-avances-items.js` (carga antes de 29), `29-avance-produccion.js`, `32-dashboard-perfiles.js` (Inicio),
`34-integraciones.js` (reenvíos), `index.html`, `firestore.rules.etapa2.txt`, prueba `tests/avances-items.test.js`.
`23b-tiempos-linea.js` no cambia: sigue leyendo `paradasOperativas` de `sync/avancesTurno`, que se conserva.
La pantalla de Avance dibuja con los mismos números: el snapshot en memoria es idéntico al de antes (los campos de control se quitan al leer).

## Reglas (texto exacto en `firestore.rules.etapa2.txt`, bloque `match /avancesTurnoItems/{id}`)
- Lee: `autenticado()` (los mismos que hoy leen `sync/avancesTurno`, incluida la cuenta compartida).
- Crea: `puedeGenerarResumen()` + `id == id del documento` + `creadoPorUid == request.auth.uid` + `creadoEn == request.time`.
- Actualiza: solo `copiadoEn` y `copiadoPor` (hoy el código no actualiza ningún snapshot; queda previsto como pediste).
- Borra: nadie.
- **Diferencia a verificar:** antes cualquier usuario con sesión (sin modo visualización) podía escribir `sync/avancesTurno`. Ahora crear exige `puedeGenerarResumen()`:
  Administrador, roles Jefe de Producción / Jefe de Operaciones / Supervisor, permiso `paletas` o permiso `avanceProduccion` en lista.
  Un usuario con permiso `avanceProduccion` guardado como `'todos'` (texto) que no sea Administrador no pasaría; hoy solo el Administrador tiene `'todos'`.

## Migración (solo Administrador, idempotente)
En Avance, si el documento antiguo aún guarda items, el Administrador ve un aviso con el % de ocupación y el botón **MIGRAR Y RESPALDAR**
(o `glacialAvancesItems.migrarUI()`). Pasos: (1) descarga `respaldo-avancesTurno-….json` con el documento completo; si no puede, no hace nada;
(2) copia cada item sin modificarlo (si ya existe idéntico lo cuenta; si existe distinto es un **conflicto** y no se sobrescribe);
(3) lee de vuelta y compara el contenido; (4) solo si todo coincide, quita del documento antiguo **únicamente** los items verificados
(no toca `paradasOperativas` ni `updatedAt`). Se puede repetir sin riesgo; una migración interrumpida se reanuda.

## paradasOperativas: ¿crece sin límite?
No pude medirlo en producción. Para medirlo, con sesión de Administrador en la consola del navegador:
`await glacialAvancesItems.medir()` devuelve tamaño total, bytes por campo, n.º de paradas, bytes por parada, fechas cubiertas, **crecimiento por día**
y `diasRestantesSoloParadas` (plazo estimado hasta 1 MiB una vez migrados los items). Si ese plazo es corto (p. ej. < 1 año),
la propuesta es guardarlas por fecha y bloque (`paradasOperativasDia/{AAAA-MM-DD_DIA|NOCHE}`) con el mismo esquema; no la implementé porque
cambia `avGuardarParadasModal`, `23b-tiempos-linea.js` y `35-autollenado-registro.js` y conviene decidirla con el dato real.

## Aviso al Administrador (80 %)
`glacialAvancesItems.vigilar()` (automático, una vez por sesión y como máximo una vez al día por equipo, solo Administrador) lee los documentos conocidos de `sync`
y muestra un aviso si alguno estima ≥ 80 % de 1 MiB (fórmula de tamaño de Firestore, estimada). Cuesta ~19 lecturas por día por Administrador.

## Orden de publicación
1. **Reglas** (`firestore.rules.etapa2.txt`) — las publica el usuario. Sin ellas, generar avances fallaría con la versión nueva del código.
2. **Código** (subir main / pruebas / producción).
3. **Migración** desde la pantalla de Avance como Administrador.

## Pruebas en PRUEBAS antes de producción
- Generar un avance y un cierre en un equipo y verlos en otro **sin recargar**.
- Intentar generar el mismo cierre desde dos equipos: el segundo recibe «ya fue generado».
- Agregar paradas y comprobar que otro usuario con la ventana abierta recibe el aviso de conflicto.
- Revisar días anteriores (calendario, otros meses) y comparar los números con los de antes de migrar.
- Exportar la imagen de un avance antiguo y reenviar un cierre a Sheets.
- Migrar: verificar el respaldo descargado, que `sync/avancesTurno` ya no tiene items y que los 83 aparecen igual.
- Inicio → Pendientes del turno muestra lo mismo.
