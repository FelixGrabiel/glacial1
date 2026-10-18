# Firebase (cerrado)

GLACIAL ya vive en Supabase. Firebase quedó cerrado como **respaldo de solo lectura** (ver `docs/00-general/dia-del-cambio.md`).
Nada de esta carpeta se carga en la página; se conserva por historia y porque varias pruebas comparan las reglas con el código.

| Archivo | Para qué sirve |
|---|---|
| `firestore.rules.etapa1.txt` | Reglas abiertas (etapa 1) |
| `firestore.rules.etapa2.txt` | Reglas estrictas, archivo final. Las pruebas de `tests/` las leen para comprobar que cada regla tiene su equivalente en Supabase |
| `firestore.rules.solo-lectura.txt`, `firestore.rules.cerrado.txt` | Reglas que se publicaron al migrar y al cerrar Firebase |
| `firebase-functions/mantenimiento-pin.js` | Cloud Function de ejemplo (PIN de técnicos); no se despliega sola. No se llama `functions/` para que Cloudflare Pages no intente publicarla |
| `cors.json` | CORS del almacenamiento antiguo de Firebase |

Movido aquí el 18/10/2026 (antes estaba en la raíz del proyecto).
