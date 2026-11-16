# Almacén › Producto terminado: cuenta compartida con PIN personal

- Solo se reciben paletas anotadas desde el 16/11/2026 (`INICIO_PT` en 101-producto-terminado.js); lo anterior no entra a la bandeja.
- Producción anota ACUMULADOS (cada registro = «llevo N paletas»; manda el último por turno). Por recibir = acumulado actual − lo ya recibido, por combinación (fecha · línea · turno · marca · presentación). El saldo incompleto se muestra aparte (aún no se recibe).
- Rol nuevo `almacen_compartido` (Gestión de usuarios › «Almacén · cuenta compartida»). Solo ve Almacén › Producto terminado.
- Cada almacenero se identifica con un PIN personal (4–6 dígitos, PBKDF2 en el navegador). Queda guardado quién recibió cada paleta (`almacenero` en `almacenPtRecepcion`).
- Los almaceneros se administran en la pestaña «Almaceneros» (usuario con permiso de Almacén): agregar, desactivar, «Reiniciar PIN».
- Límite honesto: el PIN es de **trazabilidad**, no de seguridad. La cuenta compartida puede leer los hashes (igual que Mantenimiento). El servidor sí limita lo que la cuenta compartida puede leer/escribir (glacial_57).
- Bloqueo: 5 PIN incorrectos → 10 min; sesión se cierra a los 30 min sin uso (máx. 12 h).
- Migraciones: `glacial_56` (recepciones) y `glacial_57` (cuenta compartida). Aplicadas en PRUEBAS y PRODUCCIÓN (16/11/2026).
