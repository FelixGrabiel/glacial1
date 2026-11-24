# Maquinistas registrados por Mantenimiento

**Problema (23/11/2026).** Los maquinistas se registraban solo en el Tareo de Producción, y el Tareo de Mantenimiento los mostraba como espejo de solo lectura, con «Registrar / Editar salida». Desde el 23/10/2026 Producción no creaba su Tareo, así que el espejo quedaba vacío y el Supervisor de Mantenimiento no podía registrar ni corregir nada.

**Solución** (`js/personal/28b-maquinistas-mantenimiento.js`):

1. **Tareo de Mantenimiento (Día o Noche) sin Tareo de Producción del mismo turno.** El panel «Maquinistas» se vuelve editable para quien puede editar la salida de maquinistas: permiso `editar_salida_maquinistas`, Administrador o Supervisor/Jefe de Mantenimiento. Nunca lo es para la cuenta compartida.
   - La lista sale de la Rotación de maquinistas de la semana; quien descansa aparece con «Trabajó en descanso».
   - Se registra asistencia, ingreso, salida y retorno de refrigerio, y salida. Las horas se calculan igual que en Producción.
   - Ayudas: «Marcar Asistió a los que faltan» y «+ Agregar maquinista» para alguien fuera de la rotación.
   - Se guarda en el Tareo de Mantenimiento: `tareo.maquinistasMtto[]`, cada fila con `registradoPor`, `actualizadoEn` e `historial`.
2. **Producción abre su Tareo de ese turno.** Los maquinistas registrados por Mantenimiento se copian:
   - solo a filas sin asistencia, porque lo de Producción manda;
   - con la marca `persona.registradoPorArea = 'Mantenimiento'` y `persona.valoresMtto`;
   - con el resumen de la copia en `produccion.maquinistasDesdeMtto`.
   El panel de maquinistas de Producción avisa la copia. Desde ese momento manda Producción.
3. **Con Tareo de Producción.** El panel de Mantenimiento vuelve a ser el espejo de solo lectura, con «Registrar / Editar salida». Avisa la copia y muestra tachado lo que Producción corrigió de lo que puso Mantenimiento. Ya no se puede registrar en Mantenimiento.

El turno Intermedio de Mantenimiento no cambia: sigue mostrando el espejo.

**Pendiente:** el Tareo General, el Excel y las Horas extras leen el personal de los tareos. Los maquinistas que solo quedaron en `maquinistasMtto`, porque Producción nunca creó su Tareo, todavía no entran en esos reportes.

Pruebas: `tests/maquinistas-mantenimiento.test.js` y `tests/maquinistas-mantenimiento.e2e.js`.
