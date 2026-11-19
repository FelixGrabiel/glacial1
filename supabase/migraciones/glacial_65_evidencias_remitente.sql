-- GLACIAL · glacial_65 · QUIÉN MANDÓ LA FOTO (remitente de la evidencia de WhatsApp)                      *** PENDIENTE: PRUEBAS primero; PRODUCCIÓN solo con la aprobación del dueño ***
--
-- Qué hace:
--  1) evidencias_entrada.remitente: el nombre que muestra WhatsApp de quien mandó la foto al grupo TRAZABILIDAD (opcional, máximo 60 caracteres).
--     NO es el teléfono ni un usuario de GLACIAL: es solo el nombre para mostrar junto a la leyenda (el comentario de la foto). Las filas actuales quedan en null.
--  2) evidencias_entrada_pendientes devuelve también 'remitente' en cada fila (la pantalla lo copia a la evidencia al importarla).
--  3) NO toca stock, lotes, producción ni permisos.
--
-- ANTES DE APLICAR
--  · Requiere glacial_33 y glacial_34 (la columna leyenda y la versión actual de evidencias_entrada_pendientes). Si falta algo, se detiene con un mensaje y no cambia nada.
--  · Orden: PRIMERO PRUEBAS (mvxjopvnnagqytegtexi); después desplegar la función evidencias-ingesta (acepta «remitente»); solo después PRODUCCIÓN (ehtbwmvwoxcdefvlxttu).
--  · Se puede ejecutar más de una vez.

do $m$
begin
  if to_regclass('public.evidencias_entrada') is null then raise exception 'falta public.evidencias_entrada: aplica antes glacial_33'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'evidencias_entrada' and column_name = 'leyenda') then
    raise exception 'falta evidencias_entrada.leyenda: aplica antes glacial_34';
  end if;
end $m$;

alter table public.evidencias_entrada add column if not exists remitente text check (remitente is null or char_length(remitente) <= 60);

create or replace function public.evidencias_entrada_pendientes(p_limite integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
begin
  if not coalesce((glacial_fs.ctx() ->> 'ii_esc')::boolean, false) then
    raise exception 'Sin permiso para importar evidencias' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('sha256', t.sha256, 'registro', t.registro, 'foto_ruta', t.foto_ruta, 'mime', t.mime, 'bytes', t.bytes, 'recibido_en', t.recibido_en, 'leyenda', t.leyenda, 'remitente', t.remitente) order by t.recibido_en)
      from (select * from public.evidencias_entrada e
             where e.importada_en is null and e.error is null
             order by e.recibido_en
             limit greatest(1, least(coalesce(p_limite, 50), 100))) t
  ), '[]'::jsonb);
end
$f$;
revoke all on function public.evidencias_entrada_pendientes(integer) from public, anon;
grant execute on function public.evidencias_entrada_pendientes(integer) to authenticated;
