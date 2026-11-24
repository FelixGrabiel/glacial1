# Permisos de Hielo (21/11/2026)

**Resumen**: el **Administrador tiene todos los permisos de Hielo** y decide, persona por persona, quién puede hacer cada cosa. Se gestiona en **Gestión de usuarios › Permisos del usuario › área «Hielo»** (y en el Panel de Administración › Usuarios y permisos).

## Los 7 permisos

| Permiso | Qué permite | Por defecto lo tienen | Lo exige el servidor |
|---|---|---|---|
| Ver Hielo | Entrar a Hielo: Inicio, Historial y Reporte diario (y la tarjeta de Hielo del Inicio) | Todos los roles (menos la cuenta compartida de Mantenimiento) | No (se aplica en pantalla) |
| Registrar Hielo | Nuevo registro y guardar el avance del turno | Jefe de Producción, Jefe de Operaciones, Supervisor, Supervisor de Producción | Sí (`hielo`) |
| Finalizar (cerrar) el reporte | Pasar un reporte a «Finalizado» | Quien puede registrar | Sí (`hielo_cerrar`) |
| Reabrir un reporte finalizado | Reabrir un reporte ya finalizado | Solo el Administrador | Sí (`hielo_reabrir`) |
| Programar Hielo | Pantalla Programación | Jefe de Producción, Planificación, Ventas y Planificación | Sí (`hielo_prog`) |
| Configurar Hielo | Pantalla Configuración: kilos por bolsa, capacidad, marcas, equipos y listas | Jefe de Producción, Jefe de Operaciones, Jefatura, Gerente General, Gerente | Sí (`hielo_cfg`) |
| Descargar y compartir reportes | Excel, imagen y WhatsApp del Reporte diario, Avance y Historial | Todos los que ven Hielo | No (se aplica en pantalla) |

«Los demás» = cualquier usuario que no sea Administrador. **Nadie pierde acceso por este cambio**: cada rol conserva lo que ya tenía.

## Cómo se decide cada permiso (en orden)
1. Administrador (o «todos los permisos») → sí, siempre.
2. Si se le **quitó** (`-permiso`) → no.
3. Si se le **dio** (`permiso`) → sí.
4. Si no, lo que trae su rol (tabla de arriba).

En la pantalla de usuarios las casillas muestran lo que la persona **puede hacer hoy** (lo de su rol, lo que se le dio y sin lo que se le quitó). Al guardar: casilla marcada → se guarda el permiso; desmarcada pero su rol lo traía → se guarda como «quitado» (`-permiso`); desmarcada y su rol no lo traía → no se guarda nada.

Reglas de pareja: «Finalizar» sigue a «Registrar» (si se le da o quita Registrar, Finalizar acompaña salvo que se cambie aparte). «Finalizar», «Reabrir» y «Registrar» no sirven sin poder registrar: el servidor exige también `hielo`.

## Dónde está el código
- Reglas y valores por defecto: `js/nucleo/02b-permisos-hielo.js` (`window.glacialPermisosHielo`), con pruebas en `tests/permisos-hielo.test.js` y `tests/hielo-permisos.e2e.js`.
- Catálogo de la pantalla de usuarios: `js/nucleo/02-estado.js` (área Hielo). Guardado: `js/accesos/10-usuarios.js`, `js/accesos/10b-modo-visualizacion-form.js` y Panel de Administración (`js/admin/110-admin-nucleo.js`).
- Pantalla de Hielo: `js/hielo/97-hielo.js` (`puedeVer`, `puedeRegistrar`, `puedeCerrar`, `puedeReabrir`, `puedeProgramar`, `puedeConfigurar`, `puedeExportar`).
- Servidor: `supabase/migraciones/glacial_66_permisos_hielo_finos.sql` (marcas `hielo_cerrar`, `hielo_reabrir`, `hielo_cfg` en `glacial_fs.ctx()` y reglas en `glacial_fs.autorizar()`). Sobre glacial_50 (`hielo` y `hielo_prog`).

## Límites que conviene saber
- «Ver» y «Descargar y compartir» se aplican en la pantalla: los datos de Hielo los puede leer cualquier usuario con sesión (como antes). El resto (registrar, finalizar, reabrir, programar, configurar) lo exige también el servidor.
- Un usuario creado de cero recibe solo las casillas marcadas al crearlo; igual tiene lo que trae su rol. Para quitarle algo, se edita sus permisos después.
