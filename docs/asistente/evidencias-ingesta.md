# Evidencias de insumos — ingesta automática (bot de WhatsApp → GLACIAL)

Completa `docs/asistente/evidencias-insumos.md`: antes la foto y la lectura de la IA entraban a mano con «Importar evidencias»; ahora las puede dejar el bot de la planta
(proyecto aparte `glacial-whatsapp`, ver su `GUIA-24-7.md`). **Nada de esto mueve stock**: las evidencias llegan a una bandeja de entrada y una persona autorizada las valida.

## Piezas
| Pieza | Dónde | Qué hace |
|---|---|---|
| Función de servidor | `supabase/functions/evidencias-ingesta/` (`index.ts` + `nucleo.mjs`) | Recibe `{sha256, mime, foto_base64, registro}` con la cabecera `x-glacial-ingesta: <secreto>`; valida; guarda la foto en el bucket privado `glacial-fotos` (`asistente/evidencias/<sha>.<ext>`) y la lectura en `public.evidencias_entrada`. |
| Tabla de entrada | `supabase/migraciones/glacial_33_evidencias_entrada.sql` (**aplicada** en PRUEBAS y PRODUCCIÓN el 2026-10-21) | RLS activada **sin políticas** y sin permisos para anon/authenticated: solo entra la función (llave de servicio). Se lee/marca por dos RPC que exigen `ii_esc` (validar evidencias). |
| Importación automática | `85-evidencias-insumos-datos.js` (`sincronizarEntrada`) + `86-…-pantalla.js` | Al abrir la pestaña, cada minuto mientras está a la vista y con «Buscar nuevas del bot»: importa cada fila con la misma lógica de la importación manual (documento `insumosEvidencias`, auditoría `IMPORTAR_EVIDENCIA` con origen «bot»). No sube la foto otra vez. |
| Subidor | `glacial-whatsapp/subidor-evidencias.js` | Manda las fotos que el monitor ya leyó y revisó; idempotente; se detiene ante 401/403/429; error permanente en 400/413; reintenta ante 5xx o sin red. |

## Leyenda de la foto (trazabilidad de lotes)
El cuerpo del POST puede traer `leyenda` (opcional): el texto que acompañó la foto en WhatsApp (`RECEPCIÓN`, `PET1`, `PET2`, `B7L`, `C20L`, `B20L`, `DEVOLUCIÓN`). La función la limpia (sin caracteres de control, máximo 40) y la guarda en `evidencias_entrada.leyenda` (columna que agrega `glacial_34`, **no aplicada**); `evidencias_entrada_pendientes` la devuelve y el Asistente la guarda en la evidencia. Sin leyenda todo funciona igual que antes. Ver `docs/asistente/trazabilidad-lotes.md`. La función solo incluye la columna cuando llega una leyenda, así que se puede desplegar antes de aplicar `glacial_34`; lo que no debe hacer el bot es mandar `leyenda` antes de aplicarla (el guardado de esa fila fallaría porque la columna no existe).

## Seguridad
- El bot **no lleva ninguna llave de Supabase**: solo `GLACIAL_INGESTA_SECRETO`, que solo sirve para esa función (comparación en tiempo constante; mínimo 24 caracteres; si falta o es corto el servicio se niega a funcionar).
- Se despliega sin JWT (`--no-verify-jwt`) porque el bot no tiene sesión: la protección es el secreto, la validación estricta (huella SHA-256 de la foto, firma del archivo, tamaño ≤ 6 MB, lectura ≤ 200 KB, la lectura debe ser de esa foto) y el tope diario `INGESTA_MAX_DIA` (200 por defecto).
- La foto se guarda **antes** que la fila (la fila nunca apunta a una foto que falta) y es idempotente por huella.
- Una fila mal formada o con ruta fuera de `asistente/evidencias/` se marca con error y no se vuelve a ofrecer (no bloquea las demás).

## Puesta en marcha (lo hace una persona con acceso a Supabase; primero PRUEBAS)
Estado a 2026-10-21: `glacial_31` y `glacial_33` aplicadas y la función `evidencias-ingesta` desplegada (sin JWT) en PRODUCCIÓN con su secreto; el bot ya envía a PRODUCCIÓN y se probó una foto real de punta a punta (envío → bandeja de entrada → importación en el Asistente). En PRUEBAS la función está desplegada pero sin secreto (responde 500 `sin_configurar`).

1. Aplicar `glacial_31` y `glacial_33`.
2. Secreto `INGESTA_SECRETO` en *Edge Functions › Secrets*.
3. `supabase functions deploy evidencias-ingesta --no-verify-jwt --project-ref <PRUEBAS | PRODUCCION>`.
4. En la PC del bot: `.env` con `GLACIAL_INGESTA_URL` y `GLACIAL_INGESTA_SECRETO`; seguir la `GUIA-24-7.md`.
Si `glacial_33` no está aplicada, la bandeja lo dice («falta aplicar glacial_33») y la importación manual sigue funcionando.

## Pruebas
`tests/evidencias-ingesta.test.js`: núcleo de la función (secreto, método, tamaños, huella, firma, lectura de otra foto), el texto de `index.ts` y de `glacial_33` (RLS sin políticas, `ii_esc`, restricciones, orden foto→fila), e importación automática con un cliente de Supabase simulado (importa, no pisa, marca errores, sin permiso no consulta, una sola sincronización a la vez, no sube fotos).
En `glacial-whatsapp`: `npm test` (76 pruebas: subidor con servidor falso, costos, tope mensual, modo v3, salud y scripts de arranque).
