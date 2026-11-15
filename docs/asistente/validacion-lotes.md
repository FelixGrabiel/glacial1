# Validación de lotes (bot de WhatsApp → GLACIAL)

Pestaña **Asistente de Producción › Validación de lotes**. Muestra lo que el bot (`glacial-whatsapp`) **valida de cada lote** y lo sube a GLACIAL. Es solo un registro: **no mueve el stock, no crea ni cambia lotes y no toca Evidencias**.

## Piezas
| Pieza | Dónde | Qué hace |
|---|---|---|
| Función de servidor | `supabase/functions/validaciones-lotes-ingesta/` | Recibe el POST del bot, valida todo y lo guarda. **Secreto propio** (`VALIDACIONES_SECRETO`), distinto del de Evidencias. |
| Tabla | `supabase/migraciones/glacial_54_validaciones_lotes.sql` | `public.validaciones_lotes`, con RLS activada y **sin políticas**: la página nunca lee la tabla directamente. |
| Lectura | función `validaciones_lotes_listar` | La pueden usar quienes ven el Inventario de insumos (Asistente de Producción, Jefe de Operaciones y Administrador), igual que Evidencias y Lotes. |
| Revisión | función `validaciones_lotes_revisar` | Quien escribe en el Inventario (Asistente de Producción y Administrador) marca una validación como **REVISADA**, con nota. |
| Pestaña | `js/asistente/99-validacion-lotes.js` | Tarjetas, filtros (período, resultado, revisión, búsqueda) y detalle con los controles. Se actualiza sola cada minuto. |

## Contrato del bot
`POST https://<proyecto>.supabase.co/functions/v1/validaciones-lotes-ingesta` con la cabecera `x-glacial-validaciones: <secreto>` y este cuerpo JSON:

```json
{
  "clave": "wa-120363411410514636@3EB0A1B2C3D4",
  "lote": "L2411-07",
  "resultado": "OBSERVADO",
  "insumo": "Cajas de preformas 15.7 g",
  "proveedor": "Plastipak",
  "linea": "PET1",
  "motivo": "La fecha de vencimiento es dentro de 3 días",
  "controles": [
    { "nombre": "Lote legible", "resultado": "OK" },
    { "nombre": "Fecha de vencimiento", "resultado": "FALLA", "detalle": "vence en 3 días" },
    { "nombre": "Proveedor registrado", "resultado": "NA" }
  ],
  "evidencia_sha256": "<huella SHA-256 de la foto, si existe en Evidencias>",
  "validada_en": "2026-11-15T11:30:00Z",
  "datos": { "cualquier": "dato extra del bot (máx. 20 000 caracteres)" }
}
```

| Campo | Obligatorio | Regla |
|---|---|---|
| `clave` | Sí | 8 a 128 caracteres (`A-Z a-z 0-9 . _ : @ -`). **Evita duplicados**: reenviar la misma clave responde `duplicada` y no cambia nada. Se recomienda el ID del mensaje de WhatsApp. |
| `lote` | Sí | Hasta 60 caracteres. |
| `resultado` | Sí | `OK` (validado), `OBSERVADO` (con observación) o `RECHAZADO`. |
| `controles` | No | Hasta 40: `{nombre, resultado: OK/FALLA/NA, detalle?}`. |
| `insumo`, `proveedor`, `linea`, `motivo` | No | 120, 120, 20 y 500 caracteres como máximo. |
| `evidencia_sha256` | No | Huella de la foto de Evidencias a la que corresponde. |
| `validada_en` | No | ISO 8601. No puede ser del futuro ni de hace más de 400 días; si falta se usa la hora de recepción. |
| `datos` | No | Objeto libre del bot. |

Respuestas: `200 {ok:true, estado:'recibida'|'duplicada'}`; `400` campo inválido (con `codigo` y `error`); `401` secreto incorrecto; `405` método; `413` demasiado grande; `429` tope diario (`VALIDACIONES_MAX_DIA`, 300 por defecto); `5xx` reintentar. Las observadas y rechazadas quedan **«Por revisar»** hasta que una persona las marca.

## Seguridad
El bot **no lleva ninguna llave de Supabase**: solo el secreto, que solo sirve para esta función (comparación en tiempo constante; mínimo 24 caracteres; si falta o es corto el servicio no funciona). La función se despliega sin JWT porque el bot no tiene sesión. Tope diario por si el secreto se filtra.

## Puesta en marcha (primero PRUEBAS; PRODUCCIÓN solo con aprobación)
1. Aplicar `glacial_54` (requiere `glacial_24`).
2. En *Edge Functions › Secrets*: `VALIDACIONES_SECRETO` (24 caracteres o más, distinto de `INGESTA_SECRETO`) y, si quieres, `VALIDACIONES_MAX_DIA`.
3. `supabase functions deploy validaciones-lotes-ingesta --no-verify-jwt --project-ref <PRUEBAS | PRODUCCION>`.
4. En la PC del bot: `GLACIAL_VALIDACIONES_URL` y `GLACIAL_VALIDACIONES_SECRETO` en su `.env`, y enviar cada validación con el contrato de arriba.

Si falta aplicar `glacial_54`, la pestaña lo dice: «Falta aplicar glacial_54 en Supabase».

## Pruebas
`tests/validacion-lotes.test.js`: validación de la función (secreto, método, tamaño, claves, resultados, controles, fechas), texto de la migración y de `index.ts`, lógica de la pestaña (resumen, filtros, búsqueda, orden) y conexiones.
