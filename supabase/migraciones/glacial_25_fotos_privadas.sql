-- GLACIAL · glacial_25 · Fotos privadas en Supabase Storage (reemplazo de Cloudinary) — Fase 1: hojas de producto terminado
--
-- Qué hace
--  1) Crea el bucket PRIVADO «glacial-fotos» (public = false): ninguna foto se abre con una dirección fija; la página pide un enlace FIRMADO
--     (caduca en 1 hora) con la sesión del usuario. Solo imágenes jpeg/png/webp de hasta 5 MB.
--  2) Reglas sobre storage.objects (solo ese bucket):
--       · LEER (y por tanto firmar): usuario con sesión y perfil registrado (aut), salvo la cuenta compartida de Mantenimiento.
--       · SUBIR: lo mismo y además no «solo vista»; solo bajo la carpeta hojas_producto_terminado/.
--       · No hay reglas de actualizar ni borrar: las evidencias no se pueden reemplazar ni eliminar desde la página.
--     Se apoyan en glacial_fs.ctx() (el mismo contexto de permisos de las colecciones), que los usuarios con sesión ya pueden ejecutar.
--  3) Se puede ejecutar más de una vez.
--
-- Las fotos nuevas se guardan como referencia «supabase:glacial-fotos/<ruta>» (no como enlace). Las antiguas de Cloudinary no se tocan aquí
-- (Fase 2: migrarlas). Si este script no está aplicado en un proyecto, la página vuelve a Cloudinary para no detener el registro.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('glacial-fotos', 'glacial-fotos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists glacial_fotos_leer on storage.objects;
create policy glacial_fotos_leer on storage.objects for select to authenticated
  using (
    bucket_id = 'glacial-fotos'
    and coalesce((glacial_fs.ctx() ->> 'aut')::boolean, false)
    and not coalesce((glacial_fs.ctx() ->> 'mant')::boolean, false)
  );

drop policy if exists glacial_fotos_subir on storage.objects;
create policy glacial_fotos_subir on storage.objects for insert to authenticated
  with check (
    bucket_id = 'glacial-fotos'
    and name like 'hojas_producto_terminado/%'
    and coalesce((glacial_fs.ctx() ->> 'aut')::boolean, false)
    and not coalesce((glacial_fs.ctx() ->> 'mant')::boolean, false)
    and not coalesce((glacial_fs.ctx() ->> 'solo')::boolean, false)
  );
