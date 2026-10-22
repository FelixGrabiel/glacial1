-- GLACIAL · glacial_33 · BANDEJA DE ENTRADA de evidencias de insumos (la llena la función evidencias-ingesta, la vacía la bandeja del Asistente)      *** SIN APLICAR ***
--
-- Qué hace
--  1) Crea public.evidencias_entrada: una fila por fotografía recibida del bot de WhatsApp (id = SHA-256 de la foto), con la lectura de la IA (registro, jsonb),
--     la ruta de la foto en el bucket privado «glacial-fotos» (carpeta asistente/evidencias/, ya autorizada por glacial_25) y el estado de importación.
--  2) RLS activada y SIN ninguna política, y sin permisos para anon ni authenticated: nadie lee ni escribe la tabla desde la página ni desde internet.
--     Solo escribe la función de servidor evidencias-ingesta (llave de servicio) y solo se lee/marca a través de las dos funciones de abajo.
--  3) public.evidencias_entrada_pendientes(p_limite): las filas aún no importadas ni marcadas con error (más antiguas primero). Exige la marca ii_esc de glacial_24
--     (quien puede validar evidencias: Asistente de Producción y Administrador; los roles de solo consulta no).
--  4) public.evidencias_entrada_marcar(p_sha, p_error): marca una fila como importada (sin p_error) o con error (con p_error: no se vuelve a ofrecer). Misma exigencia ii_esc.
--  5) NO toca stock, catálogo, cortes ni conteos. Las evidencias importadas pasan a la colección insumosEvidencias (glacial_31), donde una persona las valida.
--
-- ANTES DE APLICAR
--  · Requiere glacial_24 (marca ii_esc en glacial_fs.ctx) y glacial_31 (colección insumosEvidencias). Si falta ii_esc, la migración se detiene sin cambiar nada.
--  · Orden: primero PRUEBAS (mvxjopvnnagqytegtexi), probar con una foto real y la función desplegada; solo después PRODUCCION (ehtbwmvwoxcdefvlxttu).
--  · Se puede ejecutar más de una vez.

do $c$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'ctx';
  if def is null or position('ii_esc' in def) = 0 then
    raise exception 'glacial_fs.ctx no tiene la marca ii_esc: aplica antes glacial_24';
  end if;
end $c$;

create table if not exists public.evidencias_entrada (
  sha256        text primary key check (sha256 ~ '^[a-f0-9]{64}$'),
  registro      jsonb not null check (jsonb_typeof(registro) = 'object' and jsonb_typeof(registro -> 'extraccion') = 'object'),
  foto_ruta     text not null check (foto_ruta like 'asistente/evidencias/%' and foto_ruta !~ '\.\.'),
  mime          text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes         integer not null check (bytes between 8 and 10485760),
  origen        text not null default 'bot',
  recibido_en   timestamptz not null default now(),
  importada_en  timestamptz,
  importada_por text,
  error         text
);
create index if not exists evidencias_entrada_pendientes_idx on public.evidencias_entrada (recibido_en) where importada_en is null and error is null;

alter table public.evidencias_entrada enable row level security;
revoke all on public.evidencias_entrada from public, anon, authenticated;
grant all on public.evidencias_entrada to service_role;

create or replace function public.evidencias_entrada_pendientes(p_limite integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
begin
  if not coalesce((glacial_fs.ctx() ->> 'ii_esc')::boolean, false) then
    raise exception 'Sin permiso para importar evidencias' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('sha256', t.sha256, 'registro', t.registro, 'foto_ruta', t.foto_ruta, 'mime', t.mime, 'bytes', t.bytes, 'recibido_en', t.recibido_en) order by t.recibido_en)
      from (select * from public.evidencias_entrada e
             where e.importada_en is null and e.error is null
             order by e.recibido_en
             limit greatest(1, least(coalesce(p_limite, 50), 100))) t
  ), '[]'::jsonb);
end
$f$;

create or replace function public.evidencias_entrada_marcar(p_sha text, p_error text default null)
returns boolean language plpgsql volatile security definer set search_path = '' as $f$
declare filas integer;
begin
  if not coalesce((glacial_fs.ctx() ->> 'ii_esc')::boolean, false) then
    raise exception 'Sin permiso para importar evidencias' using errcode = '42501';
  end if;
  if p_error is null or btrim(p_error) = '' then
    update public.evidencias_entrada
       set importada_en = now(), importada_por = coalesce(auth.jwt() ->> 'email', '')
     where sha256 = p_sha and importada_en is null;
  else
    update public.evidencias_entrada
       set error = left(p_error, 500)
     where sha256 = p_sha and importada_en is null;
  end if;
  get diagnostics filas = row_count;
  return filas > 0;
end
$f$;

revoke all on function public.evidencias_entrada_pendientes(integer) from public, anon;
revoke all on function public.evidencias_entrada_marcar(text, text) from public, anon;
grant execute on function public.evidencias_entrada_pendientes(integer) to authenticated;
grant execute on function public.evidencias_entrada_marcar(text, text) to authenticated;
