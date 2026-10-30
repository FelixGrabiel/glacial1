# Banco de paradas por clasificar

**Dónde:** Mantenimiento › Intervenciones y equipos › pestaña «Banco de paradas» (también tarjeta en el Inicio de Mantenimiento). Archivo: `js/mantenimiento/70-banco-paradas.js`.

**Qué es:** una sola tabla con las paradas no programadas con causa «Otro», vacía o antigua (sin motivo de catálogo) y, junto a ellas, las ya reclasificadas (con quién y cuándo). Nada se borra: una parada reclasificada sigue en el banco marcada «Reclasificada». Filtros por fechas, línea, turno, estado y texto; botón para descargar la lista (CSV que abre en Excel). Es de solo lectura; los minutos nunca cambian.

**Quién la ve:** Supervisor de Mantenimiento, Jefatura, Administrador y quien tenga el permiso nuevo **«ver_banco_paradas»** (se marca en Gestionar usuarios › Mantenimiento) o la bitácora de Mantenimiento. **Quién reclasifica:** solo Supervisor de Mantenimiento y Administrador (pestaña «Reclasificar paradas»).

**Servidor:** migración `glacial_37` (la marca «bitacora», que ya permite leer las reclasificaciones, también se da a quien tiene `ver_banco_paradas`). Aplicada en PRUEBAS; PRODUCCIÓN pendiente de aprobación. Sin ella, en producción el permiso nuevo marcaría la casilla pero esa persona no podría leer los datos.

Prueba: `tests/banco-paradas.test.js`.
