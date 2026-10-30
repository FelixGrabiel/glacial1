# Personal del turno desde el Tareo

**Dónde:** formulario de registro › «Personal del turno» (`js/produccion/35b-personal-desde-tareo.js`, usado por `personalTable` de `06-registro.js`).

**Qué hace:** toma del **Tareo de Producción** del mismo día y bloque (Día + Intermedio / Noche) a quienes tienen asistencia (asistió, tardanza, feriado trabajado, comisión; no faltas ni Mantenimiento).
- **«Completar con el tareo»** llena solo las filas vacías cuya posición se reconoce por el cargo: MAQUINISTA SOPLADOR → Sopladora, ENVASADOR → Envasadora, ETIQUETADOR → Etiquetadora, EMPAQUETADOR → Empaquetadora. Un maquinista fijado a otra línea no se propone en esta.
- Los demás presentes (p. ej. «OPERARIO DE PRODUCCION», que no dice qué puesto hace) salen como botones: un clic lo pone en la primera fila vacía.
- Nunca pisa lo ya escrito ni repite a una persona; todo se puede corregir a mano.
- Si el tareo del turno aún no existe, solo avisa (no se inventa que nadie vino).

**Límite:** el tareo no guarda en qué puesto trabajó cada operario, solo su cargo; por eso solo los maquinistas se ubican solos. Para ubicar al resto hace falta guardar el puesto en el tareo o la distribución (decisión pendiente).

Prueba: `tests/personal-desde-tareo.test.js`.
