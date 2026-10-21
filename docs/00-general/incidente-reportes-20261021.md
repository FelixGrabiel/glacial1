# Incidente 21/10/2026 · 102 reportes de líneas dados de baja

**Qué pasó:** a las 07:33 (Lima) un equipo que aún no había terminado de cargar la lista de reportes (`sync/records`) guardó UN reporte con un `set` a ciegas. El puente interpreta eso como «la lista enviada es la lista completa» y el servidor dio de baja los otros 102 (26/09 → 21/10). No se borró nada físicamente (queda `eliminado_en`).
**Recuperación (en PRODUCCIÓN):** copia en `glacial_fs.respaldo_records_items_20261021` y `glacial_fs.respaldo_records_doc_20261021`; se restauraron 97 filas (las 102 de esa operación menos 5 con un reporte vigente de la misma línea, fecha y turno): `eliminado_en = null`, `v` y `version` +1, `conteos` actualizado.
**Protección (dos capas):**
1. Navegador (`js/nucleo/02-estado.js`): `_puedeGuardarLista` — mientras la lista no terminó de cargar, `saveRecords / saveWorkers / saveRotaciones / saveRotacionesMantenimiento / saveTareos / savePaletas / saveProgramaciones` no guardan nada (ni tocan la copia local) y avisan. Si el servidor rechaza `saveRecords`, la copia local vuelve a lo que había.
2. Servidor (`supabase/migraciones/glacial_30_protege_lista_reportes.sql`): `sync/records` nunca se borra completo y se rechaza un guardado que deje 6 o más reportes menos (`meta.items_antes − meta.items_despues > 5`, calculado con las filas reales).
**Pruebas:** `node tests/guardado-listas-protegido.test.js`.
**Si hace falta una limpieza masiva intencional de reportes:** hacerla desde SQL, no desde la página.
**Pendiente (no hecho):** aligerar `sync/catalogoPlanificacion › ordenesVenta` (10,087 filas ≈ 6 MB: el aviso de capacidad y una carga más lenta en todos los equipos); la misma protección de bajas masivas para paletas, programaciones y tareos.
