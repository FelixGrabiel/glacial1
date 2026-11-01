# Velocidades estándar (Mantenimiento)

Pantalla: **Mantenimiento › Velocidades estándar** (`js/mantenimiento/69-velocidades-estandar.js`).
Pueden cambiarlas el Administrador y quienes tienen el permiso del módulo de Mantenimiento (no la cuenta compartida).

- La velocidad vigente se guarda en `sync/configIndicadores.velocidades` (la leen Planificación, Resumen y Registro).
- Al cambiarla se indica desde qué fecha rige (hoy) y el motivo. La anterior pasa al **historial** (`velocidadesHistorial`), oculto por defecto y visible con «Ver historial». Nada se borra.
- Los reportes ya registrados conservan su propio ratio nominal.
- En Planificación la velocidad ya no se edita: se muestra y remite a esta pantalla.
- Lógica pura: `js/nucleo/45b-velocidades-vigencia.js` (tests: `tests/velocidades-vigencia.test.js`).
- Servidor: migración `glacial_36` (rama `supmtto` en `glacial_fs.autorizar`, solo campos de velocidad). Aplicada en PRUEBAS; PRODUCCIÓN pendiente de aprobación.
