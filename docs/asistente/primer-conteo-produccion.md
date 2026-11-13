# Primer conteo físico de insumos en Producción

Sirve para dar el **saldo inicial** al Asistente de Producción. Sin un conteo, el módulo muestra «Conteos por verificar» y no puede calcular cuánto alcanza.

**Quién:** el Asistente de Producción (permiso `asistenteProduccion`).
**Cuándo:** una sola vez, con la planta sin movimiento de material (cambio de turno o parada). Anotar la hora.
**Dónde se carga:** Asistente de Producción › Insumos › Existencias › «Nuevo conteo físico».

## Antes de contar
- [ ] Nadie recibe ni retira material de Producción mientras se cuenta.
- [ ] Se cuenta **solo lo que está en Producción** (el stock de Almacén se cuenta aparte, en Inventario de insumos).
- [ ] Separar el material dañado u observado: se registra aparte como «Observado / dañado» y no cuenta como disponible.
- [ ] Llevar la hoja de abajo y, si se quiere, fotos del conteo (la evidencia es opcional: JPG, PNG o PDF, máx. 10 MB).

## Hoja de conteo
Un renglón por insumo. «Utilizable» es lo que se puede usar hoy; «Observado» es lo dañado o dudoso.

| Insumo (código) | Unidad | Utilizable | Observado / dañado | Notas |
|---|---|---|---|---|
| Cajas de preformas (`CAJA_PREFORMA`) | caja | | | |
| Planchas de cartón (`CARTON`) | plancha | | | |
| Etiquetas (`ETIQUETA`) | UND | | | |
| Tapas (`TAPA`) | UND | | | |
| Polietileno (`POLIETILENO`) | kg | | | |
| Stretch film (`STRETCH`) | kg | | | |

- El insumo `C01 · Strech film 17kg` es de prueba y se cuenta solo si de verdad se usa; si no, un Administrador puede desactivarlo.
- Un conteo puede ser **0**. Si no hay material, se registra 0: así queda «verificado».
- Si falta un material que Producción sí controla, no se inventa: se anota al pie y un Administrador lo agrega al catálogo (Insumos › Factores).

## Cómo cargarlo
1. Elegir el **Insumo**; la unidad aparece sola.
2. Escribir la **Cantidad** contada y dejar la condición en «Utilizable».
3. Si hay material dañado, guardar otro conteo del mismo insumo con la condición «Observado / dañado».
4. (Opcional) adjuntar la evidencia.
5. **Guardar conteo**. Debe decir «Conteo guardado: el saldo quedó verificado».
6. Repetir para cada insumo. Al terminar, el aviso «Conteos por verificar» del Resumen debe quedar en 0.

## Revisión
- [ ] Existencias muestra un saldo por cada insumo contado.
- [ ] Historial › Auditoría lista un conteo por insumo, con usuario y hora.
- [ ] Alguien distinto al que contó revisa dos o tres cantidades contra el almacén físico.
- [ ] Un error se corrige con un **conteo nuevo** (el anterior queda en el historial; nada se borra).

## Datos que Producción debe confirmar (no se asumen)
Estos factores están cargados con valor 0 o 1 y conviene confirmarlos antes de depender de los consumos:
- Etiquetas y tapas: **1 por unidad** en PET1, PET2, B7L y B20L (etiquetas de B7L y tapas de B7L/B20L también). ¿Es correcto?
- **0** en C20L y B20L (cajas de preforma, etiquetas) y en C20L (tapas): ¿significa «no aplica»?
- **0** en polietileno de B20L y de una presentación de B7L: ¿«no aplica» o «falta cargar»?
