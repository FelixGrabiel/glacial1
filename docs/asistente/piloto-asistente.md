# Turno piloto · Asistente de Producción (insumos, consumo y merma)

**Objetivo:** usar el Asistente un turno completo en **una línea** (propuesta: **B7L, turno DÍA**) para comprobar el flujo con datos reales y ver qué estorba antes de extenderlo a las demás líneas.
**Requisito ya cumplido (07/11/2026):** el catálogo de factores está activo en PRODUCCIÓN (234 factores y 6 insumos, iguales a PRUEBAS).

## Antes del turno (una sola vez · Asistente de Producción o Administrador)
1. **Asistente › Insumos › Factores:** revisar que B7L tenga sus factores (cajas de preformas, cartón, polietileno, stretch). Los que digan «Pendiente de configurar» (tapas y etiquetas) se cargan con los valores confirmados (ver más abajo).
2. **Asistente › Insumos › Existencias › «Registrar conteo»:** contar lo que hay en la línea B7L (cajas de preformas, tapas, etiquetas, cartón, polietileno, stretch) y registrarlo. Es el punto de partida del stock en Producción.

## Durante el turno
| Momento | Quién | Dónde | Qué hace |
|---|---|---|---|
| Inicio | Asistente de Producción | Insumos › Requerimientos | Ve lo que necesita B7L según la programación del turno |
| Inicio | Asistente de Producción | Insumos › Requerimientos › «Preparar solicitud» | Pide a Almacén lo que falta (cantidades sugeridas) y «Enviar a Almacén» |
| Al entregar | Almacén | Almacén › Solicitudes | «Registrar entrega» o «Entregar lo que hay» (parcial) |
| Al recibir | Asistente de Producción | Insumos › Solicitudes | «Confirmar lo recibido»: suma al stock de Producción |
| Al recibir | Asistente de Producción | Lotes | Entrega a la línea las cajas/bobinas con lote (o el supervisor las toma desde su producción) |
| En la producción | Supervisor | Registro › «Lotes de insumo usados» | Marca los lotes que usa y su peso final |
| Si hay merma | Supervisor o Asistente | Merma › «Registrar merma» | Registra la merma con su causa y etapa |

## Al cerrar el turno
1. **Asistente › Consumo:** para cada producción de B7L, revisar consumo real contra teórico (factor × producción) y pulsar **«Confirmar consumo»**. Recién ahí se descuenta del stock (un solo movimiento de consumo por producción e insumo).
2. **Merma:** «Validar» las mermas registradas (quien tiene permiso de validar).
3. **Historial › Reporte General:** descargar el Excel del día y revisar que los números coincidan con el Registro.

## Qué anotar durante el piloto (para la auditoría con datos reales)
- Pasos que tomaron más tiempo o que nadie supo dónde estaban.
- Cifras que no cuadraron (requerimiento, entregado, consumido, merma) y en qué producción.
- Insumos que faltan en el catálogo o con un factor que no corresponde.
- Quién hizo cada paso y si tenía el permiso (o le apareció «sin permiso»).

## Factores de tapas y etiquetas (cargados el 07/11/2026)
Confirmados por Producción: **1 tapa y 1 etiqueta por unidad producida**, en todas las marcas y presentaciones, con vigencia desde el 07/11/2026.
- Tapas: PET1, PET2, B7L y B20L. Etiquetas: PET1, PET2 y B7L.
- Están cargados en PRUEBAS y en PRODUCCIÓN, con su auditoría (`supabase/datos/2026-11-07_factores_tapas_etiquetas.sql`).
- **C20L no usa tapa ni etiqueta** (confirmado): factor 0 «No aplica» (`supabase/datos/2026-11-07_factores_c20l_no_aplica.sql`).

## Permisos (revisados el 07/11/2026)
- **Almacén y factores:** los da el Administrador desde Usuarios a quien corresponda. Hoy los tienen Nayeli Antho (todos los permisos) y Jesus Garcia (Jefe de Operaciones).
- **Cuenta del bot (`bot.lectura`):** tiene «todos» los permisos, pero también el modo Visualizar (`soloVista`). El servidor le anula todas las escrituras, así que en la práctica es solo de lectura. No se cambian sus permisos para no cortar lo que el bot lee.
