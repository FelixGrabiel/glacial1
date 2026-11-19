# Calidad · Lotes leídos y Validación de lotes

El módulo **Calidad** tiene dos pantallas (menú lateral › Calidad):

## Lotes leídos (pantalla inicial)
Muestra **cada lote que lee el bot de WhatsApp** de la foto de la etiqueta, con **sus datos y la foto original**. Es la misma lectura que llega a Evidencias del Asistente (`public.evidencias_entrada`, `glacial_33`), pero visible para quien tiene **«VER Calidad»** (`calidadVer`).
- **Datos:** lote, marca, proveedor, producto, presentación, fechas (impresa, producción, vencimiento…), pesos, cantidad, orden de compra, N.º de caja/bobina; los campos «en duda»; las advertencias de la lectura (sin las frases fijas del procesador); las correcciones sugeridas y el texto leído.
- **Foto:** miniatura en la tarjeta y tamaño completo en el detalle, con enlace firmado del bucket privado `glacial-fotos` (se firma solo `asistente/evidencias/…`).
- **Filtros:** período, con advertencias / sin lote legible / sin advertencias, y búsqueda por lote, proveedor, marca o producto. Se actualiza cada minuto.
- **Solo consulta:** no mueve stock, no crea ni cambia lotes, no toca Evidencias. La lectura la hace una IA: hay que comparar con la foto.
- **Servidor:** `public.calidad_lecturas_listar` (`glacial_64`), mismo permiso que `validaciones_lotes_listar`; la tabla sigue con RLS sin políticas. Código: `js/calidad/99b-lecturas-lotes.js`. Pruebas: `tests/calidad-lecturas.test.js` y `tests/calidad-lecturas.e2e.js`.
- En **Validación de lotes**, si la validación trae la huella de una foto que está entre los lotes leídos, el detalle muestra la foto y el lote leído.
- Estado: `glacial_64` aplicada en PRUEBAS (verificada por rol); PRODUCCIÓN pendiente.

## Validación de lotes

Pantalla **Calidad › Validación de lotes** (módulo propio del menú lateral, grupo «Calidad»; antes estaba como pestaña del Asistente). Muestra lo que el bot (`glacial-whatsapp`) **valida de cada lote** y lo sube a GLACIAL. Es solo un registro: **no mueve el stock, no crea ni cambia lotes y no toca Evidencias**.

## Piezas
| Pieza | Dónde | Qué hace |
|---|---|---|
| Función de servidor | `supabase/functions/validaciones-lotes-ingesta/` | Recibe el POST del bot, valida todo y lo guarda. **Secreto propio** (`VALIDACIONES_SECRETO`), distinto del de Evidencias. |
| Tabla | `supabase/migraciones/glacial_54_validaciones_lotes.sql` | `public.validaciones_lotes`, con RLS activada y **sin políticas**: la página nunca lee la tabla directamente. |
| Lectura | función `validaciones_lotes_listar` | Permiso propio **«VER Calidad»** (`calidadVer`, glacial_55). Por defecto: Administrador, Asistente de Producción y Jefe de Operaciones. |
| Revisión | función `validaciones_lotes_revisar` | Permiso propio **«REVISAR Calidad»** (`calidadRevisar`). Por defecto: Administrador y Asistente de Producción (los roles de solo consulta no). Marca la validación como **REVISADA**, con nota. |
| Pantalla | `js/calidad/99-validacion-lotes.js` (lógica y tabla) y `js/calidad/100-calidad-pantalla.js` (módulo, menú y permisos) | Tarjetas, filtros (período, resultado, revisión, búsqueda) y detalle con los controles. Se actualiza sola cada minuto. |

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
Estado a 15/11/2026: `glacial_54` y `glacial_55` **aplicadas en PRUEBAS y PRODUCCIÓN** (misma huella de las funciones en ambas). **Falta** desplegar la función `validaciones-lotes-ingesta` con su secreto y ajustar el bot.

1. Aplicar `glacial_54` y `glacial_55` (requieren `glacial_24`) — hecho.
2. En *Edge Functions › Secrets*: `VALIDACIONES_SECRETO` (24 caracteres o más, distinto de `INGESTA_SECRETO`) y, si quieres, `VALIDACIONES_MAX_DIA`.
3. `supabase functions deploy validaciones-lotes-ingesta --no-verify-jwt --project-ref <PRUEBAS | PRODUCCION>`.
4. En la PC del bot: `GLACIAL_VALIDACIONES_URL` y `GLACIAL_VALIDACIONES_SECRETO` en su `.env`, y enviar cada validación con el contrato de arriba.

Si falta aplicar `glacial_54`, la pestaña lo dice: «Falta aplicar glacial_54 en Supabase».

## Pruebas
`tests/validacion-lotes.test.js`: validación de la función (secreto, método, tamaño, claves, resultados, controles, fechas), texto de la migración y de `index.ts`, lógica de la pestaña (resumen, filtros, búsqueda, orden) y conexiones.
