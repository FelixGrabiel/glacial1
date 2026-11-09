# Mantenimiento · Plan anual y Registros · paso a PRODUCCIÓN

**Estado (09/11/2026):** pasos 1 a 5 **APLICADOS Y VERIFICADOS en PRODUCCIÓN** (`ehtbwmvwoxcdefvlxttu`) con la aprobación del dueño: `glacial_47`, `glacial_48`, 19 máquinas · 307 actividades, inicio en la semana 46, 0 registros. **Falta el paso 6** (PR de `main-h08qur` a `main`), que se hace solo cuando el dueño lo pida.
Nada de esto se ejecuta sin la aprobación explícita del dueño.

## Verificación en PRODUCCIÓN (hecha tras aplicar)
19 máquinas (5 «pendiente de confirmar») · 307 actividades (148 semanales «1 - 52») · 0 registros · inicio {2026, 46} · 7 tablas `mtto_*` con RLS · 24 políticas · 6 tablas en tiempo real · 12 disparadores · 328 eventos de auditoría de la carga (19 + 307 + configuración) · las 40 tablas `g_*` existentes intactas.

## Revisión previa (hecha, solo lectura)
- PRODUCCIÓN ya tiene `glacial_fs.ctx()` con las marcas que usan las reglas (`aut`, `supmtto`, `mant`, `solo`, `jef`, `admin`), el documento `sync/perfiles` y la publicación `supabase_realtime`.
- PRODUCCIÓN no tiene ninguna tabla ni función `mtto_*`: la migración entra limpia.
- La rama `main-h08qur` está 8 commits por delante de `main` y **sin conflictos**. Fuera de las carpetas del módulo, el código solo cambia `index.html` (22 líneas: botones del menú y etiquetas `<script>`) y la tarjeta nueva en `js/mantenimiento/68-mantenimiento-inicio.js`.
- 147 de 147 pruebas correctas; pruebas de navegador del módulo (Plan anual, Programa semanal, Registro, Historial) correctas.

## Orden de los pasos (la base ANTES que el código)
1. **Aplicar `glacial_47`** (`supabase/migraciones/glacial_47_mantenimiento_plan.sql`): tablas `mtto_maquinas`, `mtto_plan_actividades`, `mtto_config`, `mtto_auditoria` con RLS, disparadores y tiempo real; deja la configuración inicial (firmas e insumos fijos).
2. **Aplicar `glacial_48`** (`supabase/migraciones/glacial_48_mantenimiento_registros.sql`): tablas de registros con RLS, guardia de validación y tiempo real.
3. **Cargar las 307 actividades** (`supabase/datos/2026-11-08_mtto_plan_2026.sql`): 19 hojas; las 5 «CARB» quedan «pendiente de confirmar» y sin línea.
4. **Cargar el inicio de los registros** (`supabase/datos/2026-11-09_mtto_inicio_registros.sql`): semana 46 de 2026.
5. **Verificar en PRODUCCIÓN** (consultas de abajo).
6. **Crear el PR de `main-h08qur` a `main` y fusionarlo** (GitHub Pages publica `felixgrabiel.github.io/glacial1`); alinear la rama con `origin/main`.
7. Probar con el supervisor y un técnico (con PIN): ver el Plan anual, iniciar un registro de la semana 46, marcar, cerrar y validar.

Por qué ese orden: si el código llega antes que las tablas, las pantallas nuevas (solo visibles dentro de Mantenimiento) mostrarían un error de carga hasta que se apliquen las migraciones. No afecta a Producción, Almacén ni al resto.

## Verificación después de aplicar (PRODUCCIÓN)
```sql
select count(*) from public.mtto_maquinas;                        -- 19
select count(*) from public.mtto_plan_actividades;                -- 307
select count(*) from public.mtto_registros;                       -- 0 (se empieza desde cero)
select datos->'inicioRegistros' from public.mtto_config where id='config';   -- {"anio":2026,"semana":46}
select count(*) from pg_policies where tablename like 'mtto_%';   -- 24
select string_agg(tablename, ',') from pg_publication_tables where pubname='supabase_realtime' and tablename like 'mtto_%';  -- 6 tablas
```

## Cómo deshacerlo (si hiciera falta)
- Código: revertir el PR en GitHub (las pantallas desaparecen; los datos quedan).
- Base: las tablas `mtto_*` son nuevas y nada más las usa; se pueden eliminar con `drop table … cascade` (las 7 tablas + funciones `mtto_*`) sin afectar a nada existente. Ojo: eso borra los registros que ya se hubieran llenado.

## Pendientes conocidos del módulo (no bloquean el paso)
- Foto de evidencia en el registro; aviso a la otra persona cuando dos editan el mismo campo.
- Probar los permisos con usuarios reales (técnico no edita el plan; Producción solo lee; solo el supervisor valida).
- Confirmar a qué línea pertenecen las 5 hojas «CARB».
- El encabezado del Excel exportado del plan no lleva el logo (límite de ExcelJS).
