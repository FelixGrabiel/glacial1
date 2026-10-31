# Personal del turno desde el Tareo

**Dónde:** formulario de registro › «Personal del turno» (`js/produccion/35b-personal-desde-tareo.js`, usado por `personalTable` de `06-registro.js`).

**Qué hace:** toma del **Tareo de Producción** del mismo día y bloque (Día + Intermedio / Noche) a quienes tienen asistencia (asistió, tardanza, feriado trabajado, comisión; no faltas ni Mantenimiento).
- **«Completar con el tareo»** llena solo las filas vacías cuya posición se reconoce por el cargo: MAQUINISTA SOPLADOR → Sopladora, ENVASADOR → Envasadora, ETIQUETADOR → Etiquetadora, EMPAQUETADOR → Empaquetadora. Un maquinista fijado a otra línea no se propone en esta.
- Los demás presentes (p. ej. «OPERARIO DE PRODUCCION», que no dice qué puesto hace) salen como botones: un clic lo pone en la primera fila vacía.
- Nunca pisa lo ya escrito ni repite a una persona; todo se puede corregir a mano.
- Si el tareo del turno aún no existe, solo avisa (no se inventa que nadie vino).

**Puesto en máquina (habitual):** en Trabajadores hay un campo nuevo con el puesto de cada persona (Sopladora, Envasadora, Pantallista, Paletizado, etc.). Si está fijado, manda sobre el cargo y permite ubicar también a los operarios. Es el puesto de siempre: si alguien cubre otro puesto un día, se cambia a mano en el registro. Sin puesto fijado se deduce del cargo (solo maquinistas).

Prueba: `tests/personal-desde-tareo.test.js`.
