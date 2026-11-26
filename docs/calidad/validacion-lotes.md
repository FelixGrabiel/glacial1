# Validación de lotes (bot de WhatsApp → GLACIAL)

Pantalla **Calidad › Validación de lotes** (módulo propio del menú lateral, grupo «Calidad»; antes estaba como pestaña del Asistente). Muestra lo que el bot (`glacial-whatsapp`) **valida de cada lote** y lo sube a GLACIAL. Es solo un registro: **no mueve el stock, no crea ni cambia lotes y no toca Evidencias**.

## Piezas
| Pieza | Dónde | Qué hace |
|---|---|---|
| Función de servidor | `supabase/functions/validaciones-lotes-ingesta/` | Recibe el POST del bot, valida todo y lo guarda. **Secreto propio** (`VALIDACIONES_SECRETO`), distinto del de Evidencias. |
| Tabla | `supabase/migraciones/glacial_54_validaciones_lotes.sql` | `public.validaciones_lotes`, con RLS activada y **sin políticas**: la página nunca lee la tabla directamente. |
| Lectura | función `validaciones_lotes_listar` | Permiso propio **«VER Calidad»** (`calidadVer`, glacial_55). Por defecto: Administrador, Asistente de Producción y Jefe de Operaciones. |
| Revisión | función `validaciones_lotes_revisar` | Permiso propio **«REVISAR Calidad»** (`calidadRevisar`). Por defecto: Administrador y Asistente de Producción (los roles de solo consulta no). Marca la validación como **REVISADA**, con nota. |
| Pantalla | `js/calidad/99-validacion-lotes.js` (lógica y tabla) y `js/calidad/100-calidad-pantalla.js` (módulo, menú y permisos) | Tarjetas, filtros (período, resultado, revisión, búsqueda) y detalle con los controles. Se actualiza sola cada minuto. |

## Qué es esto (y qué no)
Es el **rótulo de producto terminado**: lo que el bot valida cuando el supervisor manda la foto de la codificadora al grupo de WhatsApp (*«Rótulo validado · HIELO — Lote 11347323 · Vence 19/11/2027 — turno noche · marca 1 (Rappi 3kg) · envasadora · semana 47 · día juliano 323»*). Se ve en **Calidad › Validación de lotes** con los datos y la **foto original**.
Las etiquetas de **proveedores** (preformas, bolsas, cajas…) son otra cosa: siguen entrando por `evidencias-ingesta` y se revisan en **Asistente › Evidencias**.

## Contrato del bot
`POST https://<proyecto>.supabase.co/functions/v1/validaciones-lotes-ingesta` con la cabecera `x-glacial-validaciones: <secreto>` y este cuerpo JSON (ejemplo con el mensaje de arriba):

```json
{
  "clave": "wa-3EB0A1B2C3D4E5F6",
  "lote": "11347323",
  "resultado": "OK",
  "insumo": "Rappi 3kg",
  "linea": "envasadora",
  "motivo": "Lote y vencimiento correctos.",
  "controles": [
    { "nombre": "Lote legible", "resultado": "OK" },
    { "nombre": "Vencimiento correcto", "resultado": "OK" }
  ],
  "datos": {
    "producto": "HIELO", "marca": "Rappi 3kg", "turno": "noche", "semana": 47, "dia_juliano": 323,
    "fecha_produccion": "2026-11-19", "vence": "19/11/2027", "texto_rotulo": "LT:11347323 FV:19-11-27"
  },
  "foto_base64": "<la foto del rótulo en base64>",
  "foto_mime": "image/jpeg",
  "validada_en": "2026-11-19T06:34:00Z"
}
```

| Campo | Obligatorio | Regla |
|---|---|---|
| `clave` | Sí | 8 a 128 caracteres (`A-Z a-z 0-9 . _ : @ -`). **Evita duplicados**: reenviar la misma clave responde `duplicada` y no cambia nada. Usa el ID del mensaje de WhatsApp. |
| `lote` | Sí | El lote validado (hasta 60 caracteres). |
| `resultado` | Sí | `OK` (lote y vencimiento correctos), `OBSERVADO` o `RECHAZADO`. |
| `insumo` | No | Marca o presentación (120). Se muestra como «Producto» si no viene `datos.marca`. |
| `linea` | No | «envasadora», «envasado manual», PET1… (20). |
| `motivo`, `controles` | No | Motivo (500) y hasta 40 controles `{nombre, resultado: OK/FALLA/NA, detalle?}`. |
| `datos` | No | Objeto libre (máx. 20 000 caracteres). La pantalla muestra, si vienen: `producto`, `marca`, `turno`, `semana`, `dia_juliano`, `fecha_produccion`, `vence`, `texto_rotulo`. |
| `foto_base64` + `foto_mime` | No (recomendado) | La foto del rótulo, `image/jpeg`, `image/png` o `image/webp`, hasta 6 MB. El servidor comprueba que el archivo sea realmente una imagen, calcula su huella (si mandas `foto_sha256` debe coincidir) y la guarda en el bucket privado `glacial-fotos`, carpeta `calidad/rotulos/`. |
| `evidencia_sha256` | No | Solo si esa misma foto también se mandó a Evidencias. |
| `validada_en` | No | ISO 8601. No puede ser del futuro ni de hace más de 400 días; si falta se usa la hora de recepción. |

Respuestas: `200 {ok:true, estado:'recibida'|'duplicada'}`; `400` campo inválido (con `codigo` y `error`: también `foto_mime`, `foto`, `foto_firma`, `foto_huella`); `413` foto de más de 6 MB; `401` secreto incorrecto; `405` método; `413` demasiado grande; `429` tope diario (`VALIDACIONES_MAX_DIA`, 300 por defecto); `5xx` reintentar. Las observadas y rechazadas quedan **«Por revisar»** hasta que una persona las marca.

## Seguridad
El bot **no lleva ninguna llave de Supabase**: solo el secreto, que solo sirve para esta función (comparación en tiempo constante; mínimo 24 caracteres; si falta o es corto el servicio no funciona). La función se despliega sin JWT porque el bot no tiene sesión. Tope diario por si el secreto se filtra.

## Puesta en marcha (primero PRUEBAS; PRODUCCIÓN solo con aprobación)
Estado a 19/11/2026: `glacial_54`, `glacial_55` y `glacial_64` (foto del rótulo) **aplicadas en PRUEBAS y PRODUCCIÓN** (verificadas por rol). La función `validaciones-lotes-ingesta` está **desplegada en PRUEBAS y PRODUCCIÓN** (sin JWT, misma huella de código), pero **sin su secreto se niega a funcionar** (500 «falta el secreto»).
**En producción hoy hay 0 validaciones y el bot todavía no envía nada a GLACIAL** (solo responde en el grupo de WhatsApp). Para que los rótulos aparezcan en Calidad faltan dos cosas:

1. **De GLACIAL (lo hace el dueño):** en *Edge Functions › Secrets* de PRODUCCIÓN (y de PRUEBAS si se quiere probar), crear `VALIDACIONES_SECRETO` (24 caracteres o más, distinto de `INGESTA_SECRETO`) y, si quieres, `VALIDACIONES_MAX_DIA`.
2. **Del bot (proyecto `glacial-whatsapp`, aparte):** `GLACIAL_VALIDACIONES_URL` y `GLACIAL_VALIDACIONES_SECRETO` en su `.env`, y que, después de validar un rótulo, haga el POST de arriba con la foto. Debe ser idempotente (la misma `clave` no duplica) y detenerse ante 401/403/429, como el subidor de evidencias.


## Calendario y separación por línea (26/11/2026)

- **Calendario del mes:**
  - cada día muestra cuántas validaciones tiene, con un punto de color según el peor resultado: verde (validadas), ámbar (con observación) o rojo (alguna rechazada);
  - al elegir un día se ve **lo validado ese día**; por defecto se ve hoy;
  - botones «Hoy», «Todo el mes» y ◀ ▶ para cambiar de mes;
  - el día es el de **Lima**: una validación de las 22:00 del 25 cuenta para el 25;
  - reemplaza al filtro «Período». La página trae lo validado desde el 1.º del mes mostrado.
- **Las tarjetas** (validaciones, validadas, con observación, rechazadas y por revisar) son del día o del mes elegido.
- **Separado por línea:** un bloque por línea, tal como la manda el bot (B7L, PET1, Envasadora…), con su resumen y su tabla. «Sin línea» va al final.

Pruebas: `tests/validacion-lotes.test.js` (día de Lima, calendario, líneas) y `tests/validacion-lotes.e2e.js`.
