-- GLACIAL · glacial_25 · Fotos privadas en Supabase Storage (reemplazo de Cloudinary)
-- Fase 1 (hojas de producto terminado) + Fase 3 (mantenimiento y Asistente de Producción)
--
-- Qué hace
--  1) Bucket PRIVADO «glacial-fotos» (public = false): ninguna foto se abre con una dirección fija; la página pide un enlace FIRMADO (caduca
--     en 1 hora) con la sesión del usuario. jpeg/png/webp/pdf, hasta 10 MB (las fotos de planta ya salen comprimidas; el PDF es de la
--     evidencia opcional del Asistente de Producción).
--  2) Reglas sobre storage.objects (solo ese bucket). Carpetas: hojas_producto_terminado/ · mantenimiento/ · asistente/
--       · LEER / firmar: usuario con sesión y perfil registrado. La cuenta compartida de Mantenimiento SOLO ve mantenimiento/.
--       · SUBIR: hojas_producto_terminado/ y asistente/ → usuario con sesión, no «solo vista» y no cuenta compartida.
--                mantenimiento/ → usuario con sesión y no «solo vista» (incluye la cuenta compartida de Mantenimiento).
--       · No hay reglas de actualizar ni borrar: las evidencias no se pueden reemplazar ni eliminar desde la página.
--     Se apoyan en glacial_fs.ctx() (el mismo contexto de permisos de las colecciones).
--  3) Se puede ejecutar más de una vez.
--
-- Las fotos nuevas se guardan como referencia «supabase:glacial-fotos/<ruta>» (no como enlace). Si este script no está aplicado en un proyecto,
-- la página vuelve a Cloudinary para no detener el registro.
-- NOTA: en el editor SQL de Supabase, ejecutar cada «create policy» por separado y con «set local lock_timeout = '10s';» delante.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('glacial-fotos', 'glacial-fotos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists glacial_fotos_leer on storage.objects;
create policy glacial_fotos_leer on storage.objects for select to authenticated
  using (
    bucket_id = 'glacial-fotos'
    and coalesce((glacial_fs.ctx() ->> 'aut')::boolean, false)
    and (not coalesce((glacial_fs.ctx() ->> 'mant')::boolean, false) or name like 'mantenimiento/%')
  );

drop policy if exists glacial_fotos_subir on storage.objects;
create policy glacial_fotos_subir on storage.objects for insert to authenticated
  with check (
    bucket_id = 'glacial-fotos'
    and coalesce((glacial_fs.ctx() ->> 'aut')::boolean, false)
    and not coalesce((glacial_fs.ctx() ->> 'solo')::boolean, false)
    and (
      name like 'mantenimiento/%'
      or (
        (name like 'hojas_producto_terminado/%' or name like 'asistente/%')
        and not coalesce((glacial_fs.ctx() ->> 'mant')::boolean, false)
      )
    )
  );
