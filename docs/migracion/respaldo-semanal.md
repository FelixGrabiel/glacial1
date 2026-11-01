# Respaldo semanal automático (Windows)

El plan gratis de Supabase no trae copias automáticas. Este paso hace una cada semana en tu computadora, sin intervención.

**Una sola vez**
1. Carpeta con los dos archivos: `respaldo-supabase.js` y `respaldo-semanal.ps1` (de `docs/migracion/`). En esa carpeta: `npm init -y` y `npm install pg`.
2. En Supabase: botón **Connect › Session pooler**; copia la cadena y reemplaza `[YOUR-PASSWORD]` por la clave de la base. **No la pegues en el chat ni en ningún archivo.**
3. Guárdala en tu usuario de Windows (PowerShell): `[Environment]::SetEnvironmentVariable('DATABASE_URL','postgresql://postgres.ehtbwmvwoxcdefvlxttu:TU_CLAVE@aws-0-us-east-2.pooler.supabase.com:5432/postgres','User')`
4. Prueba a mano: `powershell -ExecutionPolicy Bypass -File .\respaldo-semanal.ps1` y revisa que aparezca una carpeta `respaldo_…` en `%USERPROFILE%\RespaldosGlacial` y que `respaldo.log` diga «Respaldo terminado correctamente».
5. Prográmalo cada domingo a las 22:00: `schtasks /Create /SC WEEKLY /D SUN /ST 22:00 /TN "GLACIAL respaldo" /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\RUTA\respaldo-semanal.ps1"` (la computadora debe estar encendida a esa hora; si no, Windows lo hace al encender si marcas «ejecutar lo antes posible» en el Programador de tareas).

**Qué hace:** copia todos los documentos y listas (con lo borrado), anota la lista de fotos, deja un `MANIFIESTO.json` con conteos y huellas, conserva las últimas 8 copias y escribe `respaldo.log`. Si algo falla, el log dice `ERROR` y la tarea termina con error.

**Importante**
- Guarda la carpeta en otro disco o en una nube **privada**. No la subas a GitHub: tiene datos de la planta.
- Las fotos no se descargan aquí: se bajan aparte desde Supabase › Storage › `glacial-fotos`.
- **Probar la restauración:** una copia que nunca se probó no es una copia. Con el `MANIFIESTO.json` se puede comprobar que los conteos coinciden con el panel; la restauración completa se hace con ayuda (pídemela cuando quieras ensayarla en la base de pruebas).
- El respaldo es lo que protege de un borrado o de un daño de la base. La **revisión diaria** (`glacial_40`) avisa al Administrador si algo anda mal, pero no reemplaza esta copia.
