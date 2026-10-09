# Distribución de personal por línea (fuente compartida)

Etapa 1A (módulo de datos y consulta). La pantalla en Tareo (1B) y Avance/Cierre (1C) consumen este servicio; ninguna guarda cantidades propias.

## Datos (Firestore)
- `distribucionPersonal/{AAAA-MM-DD}_{DIA|NOCHE}`: `version`, `ultimoDesdeMs`, `ultimaLineas`. Día e Intermedio comparten documento; Noche es aparte.
- `distribucionPersonal/{...}/eventos/{opId}`: un evento por cambio, solo se crea. Campos: `desdeMs` (hora efectiva), `guardadoEn` (hora del servidor), `lineas` (PET1, PET2, B7L, C20L, B20L: entero o `null`), `apoyoCompartido`, `total`, `anterior`, `motivo`, `observaciones`, `correccion`, `uid`, `usuario`, `version`.
- `null` = sin confirmar (desconocido). `0` = cero confirmado.

## Reglas de negocio
- El evento vigente a un corte es el de mayor `desdeMs` ≤ corte (empate: mayor versión). Cambios posteriores no alteran una consulta a un corte anterior.
- Guardar = una transacción (versión + evento). Versión esperada distinta → `CONFLICTO`. Mismo `opId` → devuelve el evento ya guardado (sin duplicar).
- Hora efectiva dentro del bloque configurado y no futura (reloj del servidor estimado). Un cambio exige motivo (≥5). Una hora anterior a la última registrada es corrección: solo Administrador / Jefe de Producción, con motivo.
- Apoyo compartido: se guarda aparte; no se suma al total de las líneas.
- Horas hombre = Σ personal × duración (h) de cada intervalo con dato, recortado al período. Huecos sin dato no cuentan como cero: `estado` COMPLETO / PARCIAL / SIN_DATOS y `cobertura`. Es horas de asignación a línea (no descuenta paradas ni refrigerio).

## Permiso `distribuirPersonal`
Por defecto Administrador, Supervisor y Jefe de Producción. Se quita con `-distribuirPersonal`. Jefatura y Gerencia solo consultan. **Hay que publicar `firestore.rules.etapa2.txt`** (función `puedeDistribuirPersonal` y colección nueva): sin eso, las escrituras se rechazan.

## API (`window.glacialDistribucionPersonal`)
`escuchar(fecha,bloque)`, `cargar`, `guardar(fecha,bloque,entrada)`, `consultar(fecha,bloque,linea,corteMs)`, `consultarHorasHombre(...)`, `horasHombrePlanta`, `compararConDisponible`, `alCambiar(fn)`. Las escuchas se cierran al cerrar sesión.

Pendiente: pantalla en Tareo (1B), integración en Avance/Cierre y snapshot (1C).

## Etapas 1B y 1C (completadas)
- **Pantalla (1B)**: pestaña «Distribución de personal» en el Tareo de Producción (`44-distribucion-personal-pantalla.js`). Fecha operativa, bloque, hora desde la que aplica, cantidad entera por línea (PET1, PET2, B7L, C20L, B20L), total, apoyo compartido, observaciones/motivo, «Confirmar distribución», «Registrar cambio» y «Ver historial». Un supervisor edita solo su fecha y bloque; Jefe de Producción y Administrador, cualquiera; el resto consulta. Si otra persona guarda mientras se edita, aparece un aviso y no se pisa su cambio. Compara el total con los asistentes de Producción del Tareo (solo aviso; «No se puede comprobar» si no hay asistencia).
- **Avance/Cierre (1C)**: `29-avance-produccion.js` consulta el evento vigente al CORTE de cada línea («Personal en línea: N» o «Pendiente de confirmar»; 0 confirmado se muestra 0). El snapshot nuevo guarda `personal`, `personalEstado`, `personalOrigen`, `personalDesdeMs`, `personalVersion` y `horasHombre {horas, estado, cobertura, minutosSinDato}` (período: desde el inicio real de la línea, o del bloque, hasta el corte). Cambios posteriores no alteran snapshots anteriores; los snapshots anteriores conservan su número. «AJUSTAR PERSONAL» (solo con el permiso `distribuirPersonal`) abre la misma pantalla en el bloque del reporte.
- Ya no se cuenta personal por nombres del registro ni del Tareo para el reporte nuevo: sin confirmación, queda pendiente.
