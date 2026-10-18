# Planificación: revisión y propuesta de mejoras

Alcance: lectura de `js/produccion/51` a `54`, `guardarProgramacionPaleta` (16-paletas.js), cálculo de producido (23b, 24, 45) y reglas de Firestore.
Los datos viven en Firestore (la rama `supabase` aún no está en producción y no se usó). No se modificó código ni datos.
"Confirmada" significa leída en código; **no se reprodujo nada en navegador**.

## 1. Diagnóstico breve
La base es sólida: una sola función escribe la programación, por transacción, con motivo si ya está en producción.

Tres prioridades:
1. Cerrar los huecos de integridad en solicitudes y cambios (aprobación, cambio de producto, historial, ediciones simultáneas).
2. Resolver el permiso de Planificación, que solo se exige en el navegador.
3. Mostrar producido, pendiente y avance dentro de Programación (hoy solo está en Cumplimiento).

## 2. Funciones existentes
| Estado | Funciones |
|---|---|
| Funcionan (código y `tests/planificacion.test.js`, que pasa hoy) | Validaciones (entero, línea, marca, presentación). Motivo obligatorio si ya está en producción. Transacción por escritura. Copia que no arrastra estado ni producción y omite canceladas y filas en producción. Excel con vista previa y suma de Día + Intermedio. Unificar en Día. Vista semanal. Catálogo con reglas de servidor. Solicitudes e historial con reglas (solo crear). Repintado en vivo que no pisa un formulario abierto. Cierre de escuchas al salir. |
| Necesitan corrección | Importar Excel con posible duplicado. Aprobar solicitudes y cambiar producto. Historial atómico. Colores de estado. Cumplimiento histórico. |
| Pendientes de verificar | Dos usuarios a la vez en la práctica. Celular. Noche cruzando medianoche. Horarios entre módulos. |

## 3. Hallazgos
| # | Prio | Estado | Evidencia | Impacto |
|---|---|---|---|---|
| H1 | P1 | Confirmada | `52-planificacion-pantalla.js:311` usa `LF`, que no está definida en `js/` ni en `index.html`. | Con un posible duplicado Día/Intermedio, Importar lanza un error y no hace nada. |
| H2 | P0 | Confirmada | `_archivo/firebase/firestore.rules.etapa2.txt:211-214`: cualquier usuario autenticado sin modo visualización escribe `sync/programaciones`. El permiso `planificacion` se comprueba solo en `16-paletas.js:382`. | Quien no planifica puede cambiar el plan desde la consola. La causa de fondo: Producción Actual cambia el estado en el mismo documento. |
| H3 | P1 | Confirmada | `54:187-218`: aplica la solicitud y después la marca resuelta; no comprueba que el plan siga como cuando se pidió. | Dos aprobadores aplican dos veces. Si falla el segundo paso, el plan cambió y la solicitud sigue pendiente. Se puede pisar un cambio posterior. |
| H4 | P1 | Confirmada | `54:196-198`: quitar y luego crear, en dos pasos. Con cantidad 0 la fila se elimina (`16:445`). | Si falla el guardado del producto nuevo, el anterior ya no existe. |
| H5 | P1 | Confirmada | El historial se escribe después de la transacción (`16:~510`, `54:40-45`). Unificar escribe dos eventos sueltos. | Un fallo deja el plan cambiado sin rastro; solo se avisa. |
| H6 | P1 | Confirmada | Cumplimiento usa el plan vigente (`54:309-316`). Quitar borra la fila. No se guarda el compromiso original. | Reprogramar o quitar oculta un incumplimiento histórico. |
| H7 | P1 | Hipótesis | Cumplimiento toma el producido de la fila representativa del bloque (`54:320`); `producidoVigenteDe` cuenta solo el turno de esa fila (`24:205-213`, `16:795-802`). | Con paletas de turno INTERMEDIO y fila representativa DÍA, se subcuenta. Falta probarlo con datos. |
| H8 | P1 | Confirmada | Editar no compara con lo que el usuario vio (`16:420-452`). | Si dos personas editan la misma fila, la última gana sin aviso. |
| H9 | P0 si crece | Hipótesis | `sync/programaciones`, `paletas` y `catalogoPlanificacion` son un documento cada uno, sin purga: mismo patrón que `avancesTurno`. | Puede llegar al límite de 1 MiB. No medido. |
| H10 | P2 | Confirmada | `52:130`: En producción verde, Finalizada gris, Pendiente sin color, Cancelada igual que Detenida. | No sigue la paleta acordada (naranja, amarillo, rojo, verde, gris). |
| H11 | P2 | Confirmada | Programación no muestra producido, pendiente, avance ni subtotales por línea; el total del bloque suma UND de líneas distintas (`52:178`). Sin hora de actualización. | No se ve cuánto falta. |
| H12 | P2 | Confirmada | Importar y copiar escriben fila por fila (`51:199-206`) y avisan "N importadas, M con error". | Queda parcial, aunque informado. |

Estados adicionales: Pausa, Lista y Cancelada se conservan tal cual. "Lista" se muestra como "Detenida" y "Cancelada" cuenta como estado en producción para exigir motivo. No se cambia su lógica para aplicar un color.

## 4. Mejoras propuestas
| Propuesta | ¿Existe? | Beneficio y dependencias | Dificultad |
|---|---|---|---|
| Programado, producido, pendiente, avance y sobreproducción por producto | Solo en Cumplimiento | Fuente: `producidoVigente` (Paletas en turno en curso, registro del turno si cerró). Sin registro se muestra "—", nunca 0. Resuelve H7. | Media |
| Paletas completas + UND restantes | Parcial | Ejemplo: 5 500 / 120 = 45 paletas + 100 UND. Usa el catálogo. | Baja |
| Subtotales por línea (UND no se suman entre líneas para medir capacidad) | No | Aclara la lectura. | Baja |
| Historial atómico y compromiso original | Historial sí, original no | Corrige H5 y H6. | Media |
| Traslado de saldo a Noche u otra fecha | No | Origen, destino, saldo comprobado, motivo, historial. Requiere producido fiable. | Media-alta |
| Capacidad por línea y bloque | No | Velocidad estándar, duración del bloque, cambios de formato. Si falta un dato: "Estimación incompleta" y cuál. | Media-alta |
| Secuencia SCALA → BELLS → SCALA | Hay tramos en los datos; la pantalla no los usa | Inicio y fin estimados. Repetir un producto no duplica su total. Falta verificar la interfaz. | Media |
| Vista semanal de capacidad | Solo cantidades | Depende de la capacidad. | Media |
| Exportar el plan para el supervisor | Solo Excel de cumplimiento | Texto o imagen del bloque. | Baja |
| Personal, insumos y Almacén | Distribución de personal sí; Almacén sin datos fiables | Mostrar "Por confirmar". No usar mermas como receta. | Alta, posterior |
| Prioridad, pedido y fecha requerida | No | Campos y fuente de pedidos nuevos. | Alta, posterior |
| Borrador y publicación | No | Producción Actual lee la programación directamente; riesgo alto. Descartar por ahora. | Alta |

## 5. Propuesta visual (maqueta de ejemplo, no son datos reales)
```
Programación · Mañana + Intermedio 07:00–19:00        Actualizado 10:42
[Programado 38 000] [Producido 21 400] [Pendiente 16 600] [Capacidad: estimación incompleta]

Línea  Marca  Present.  Program.  Producido     Pendiente/Sobre  Avance    Paletas        Estado
PET 1  Scala  2.5 L     12 000    7 200         4 800            ███░ 60%  60 + 0 UND     En producción (naranja)
PET 1  Bells  625 ml     5 500    — (sin reg.)  —                —         45 + 100 UND   Programada (amarillo)
                        Subtotal PET 1: 17 500 UND
```
Acciones por fila: Editar o Pedir cambio, y "Trasladar saldo" en la etapa 3. En celular, tabla con desplazamiento y tarjetas de resumen apiladas.

## 6. Plan por etapas
1. **Indispensable:** H1 (definir `LF`); H3 y H4 (una sola transacción, comprobando el estado anterior); H5 (historial en la misma transacción); H8 (control de versión por fila); medir H9 con el aviso del 80 % ya construido; decidir H2.
2. **Operativo:** producido, pendiente y avance en Programación; subtotales por línea; paletas + UND; colores acordados; compromiso original; exportar el plan.
3. **Capacidad y secuencia:** estimación del bloque, tramos con horas, traslado de saldo.
4. **Posterior:** personal, insumos, Almacén, prioridad y pedidos.

## 7. Verificación
- Hecho: lectura de código y reglas; `tests/planificacion.test.js` corrida, todo correcto; comprobación de que `LF` no existe.
- No hecho: pruebas en navegador, con dos usuarios, en celular ni en producción. H1 a H8 están confirmadas solo por lectura; H7 y H9 siguen como hipótesis.

## 8. Datos faltantes
1. Tamaño real de `sync/programaciones` (para H9).
2. Cómo resolver H2: separar el estado de ejecución del plan (cambio estructural) o aceptar el control solo en el navegador. Es compatible con lo que soporta el puente de Supabase.
3. Si EN PRODUCCIÓN pasa a naranja también en Planificación.
4. Si el compromiso original es la primera versión guardada o la publicada.

Pendiente de tu aprobación antes de modificar código, publicar o migrar datos.
