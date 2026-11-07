# Auditoría de AGUA · 07/11/2026

Medición del uso real de cada módulo en PRODUCCIÓN (cantidad de datos y última actividad), y lo que se hizo con cada punto.

## Uso por módulo
- **Uso diario:** Registro / Historial (137 reportes, 06/11), Paletas (2 361), Avance y paradas (401 avances y 924 paradas), Programación (370), Bitácora de mantenimiento (397) y Distribución de personal (19).
- **Uso parado:**
  - **Rotación de supervisores:** la última semana publicada es la 43.
  - **Tareo:** último el 01/11.
  - **Resúmenes de turno:** último el 21/10.
  - **Catálogo y órdenes de venta:** última importación el 21/10.
  - **Intervenciones:** 2 registros.
- **Sin uso:** solicitudes de programación, ampliaciones de turno, entregas de turno, y conteos, consumo y merma del Asistente.
- **Impacto económico:** solo 6 valores (por línea y la meta). No hay márgenes por producto ni costos de insumos.

## Datos
- **Sin finalizar:** los 39 reportes del 03 al 06/11 siguen «En registro».
- **24/10:** tuvo programación (7) y paletas (5), pero ningún reporte.
- **25/10 al 02/11:** sin ninguna actividad (por confirmar si la planta estuvo parada).

## Lo que se hizo
- **A · Reportes sin finalizar en el Inicio de Producción** (`67-produccion-inicio.js`): un bloque propio con todos los turnos terminados sin finalizar (últimos 7 días, con el mismo cálculo y alcance que el aviso de `46`) y un botón «Abrir» que abre el reporte. Antes solo salían mezclados en «Atención de hoy», con un máximo de 6.
- **B · Rotación sin publicar:** aviso rojo si la semana en curso no tiene rotación PUBLICADA, y ámbar desde el jueves si falta la de la próxima semana. Lo ven quien gestiona la rotación, Jefatura y el Administrador, con un botón «Abrir rotación».
- **C · «MERKAT» y «Merkat»: no se cambió nada.**
  - B7L usa a propósito su lista en mayúsculas (BELLS, SCALA, MERKAT…).
  - Los indicadores ya juntan las marcas sin importar mayúsculas (`marcaCanon` en `49-resumen-indicadores.js`).
  - Cambiar solo los reportes de B7L haría que dejen de coincidir con su programación (5) y sus paletas (19).
- **D · Reportes repetidos: no se anuló ninguno, queda pendiente la decisión del dueño.**
  - **05/11 NOCHE (B7L, C20L, PET1 y PET2):** el segundo reporte (creado el 06/11 a las 07:06) repite la producción del primero y agrega una marca que empieza a las 19:00 o 07:00, sin hora de fin; en PET2 tiene otra cantidad.
  - **04/11 B7L DÍA:** el segundo tiene un horario de 07:00 a 07:00 y 6 870 UND; el primero, de 07:00 a 19:00 y 5 260 UND.
  - Hoy los indicadores usan el segundo de cada par (el último actualizado).
- **E · La merma del Registro cuenta en la conciliación del Asistente** (`70` y `72`).
  - La desviación «por revisar» descuenta la merma validada del Asistente **y** la que el supervisor registró en su reporte, en la misma unidad del insumo: tapas y etiquetas en UND, polietileno en kg.
  - Se muestra en su propia fila («Merma del Registro (supervisor)»), y se avisa si hay merma en los dos lados, para que no se cuente dos veces.

## Pruebas
`tests/auditoria-agua-avisos.test.js` (A, B y E).
