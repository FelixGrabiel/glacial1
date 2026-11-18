# Almacén › Producto terminado: cuenta compartida con PIN personal

- Solo se reciben paletas anotadas desde el 16/11/2026 (`INICIO_PT` en 101-producto-terminado.js); lo anterior no entra a la bandeja.
- Producción anota ACUMULADOS (cada registro = «llevo N paletas»; manda el último por turno). Por recibir = acumulado actual − lo ya recibido, por combinación (fecha · línea · turno · marca · presentación). El saldo incompleto se muestra aparte (aún no se recibe).
- Rol nuevo `almacen_compartido` (Gestión de usuarios › «Almacén · cuenta compartida»). Solo ve Almacén › Producto terminado.
- Cada almacenero se identifica con un PIN personal (4–6 dígitos, PBKDF2 en el navegador). Queda guardado quién recibió cada paleta (`almacenero` en `almacenPtRecepcion`).
- Los almaceneros se administran en la pestaña «Almaceneros» (usuario con permiso de Almacén): agregar, desactivar, «Reiniciar PIN».
- Límite honesto: el PIN es de **trazabilidad**, no de seguridad. La cuenta compartida puede leer los hashes (igual que Mantenimiento). El servidor sí limita lo que la cuenta compartida puede leer/escribir (glacial_57).
- Bloqueo: 5 PIN incorrectos → 10 min; sesión se cierra a los 30 min sin uso (máx. 12 h).
- Migraciones: `glacial_56` (recepciones) y `glacial_57` (cuenta compartida). Aplicadas en PRUEBAS y PRODUCCIÓN (16/11/2026).

## Saldo incompleto: doble confirmación (supervisor ↔ Almacén)
- El saldo (paleta incompleta) pasa a Almacén al cierre del turno o al cambiar de producto.
- **Supervisor:** en Producción › Paletas, panel «Saldos por entregar a Almacén»: «Entregar saldo» (ya viene lleno con los paquetes anotados). Se guarda en `almacenPtSaldoEntrega` (migración `glacial_58`, libro inmutable; corregir = anular con motivo y entregar de nuevo).
- **Almacén:** en Por recibir › «Saldos incompletos por contar», cuenta los **paquetes** («Contar y recibir»); el sistema los convierte a UND con la equivalencia (`glacialEquivalenciaSaldo`). Sin equivalencia se cuenta directo en UND.
- **A ciegas:** Almacén no ve la cifra del supervisor hasta registrar la suya (control en pantalla; los datos sí son legibles por la cuenta de Almacén).
- **Coincidir exacto:** CONFORME si son iguales; CON DIFERENCIA si no. Se corrige entre ambos (Almacén anula su conteo / el supervisor anula su entrega). Lo que cuenta como recibido es el conteo de Almacén.
- Estados: en línea · entregado · contado sin entrega · conforme · con diferencia.
- `glacial_58`: aplicada en PRUEBAS y PRODUCCIÓN (17/11/2026).

## Despachos, stock, alertas y resumen del turno (js/almacen/104-despachos-resumen.js)
- **Despachos** (`almacenPtDespacho`, migración `glacial_61`, libro inmutable): destino o cliente, guía/referencia opcional y de 1 a 30 líneas de producto con paletas y unidades. Los registra el almacenero identificado (cuenta compartida) o quien tiene el permiso de Almacén. Corregir = **anular con motivo** (≥ 5 caracteres) y volver a despachar. No se puede despachar más que el stock (se comprueba en pantalla; el servidor valida la forma del documento).
- **Stock** = lo recibido por Almacén (paletas completas + unidades; el saldo contado entra solo en unidades) − lo despachado, por línea y producto. Cuenta desde el 16/11/2026.
- **Alertas «Por atender»** dentro de Producto terminado: paletas con más de 4 h por recibir (roja pasadas 12 h), saldos entregados por el supervisor sin contar hace más de 2 h y saldos con diferencia. (No hay insignia en el menú lateral: la lectura de recepciones solo corre con la pestaña abierta.)
- **Resumen del turno**: texto para copiar o enviar por WhatsApp con lo recibido, diferencias y observadas, lo pendiente, saldos sin cerrar, despachos del día y stock actual, por fecha y turno (Día = Día + Intermedio, o Noche).
- `glacial_61`: aplicada en PRUEBAS y PRODUCCIÓN (18/11/2026).
