-- GLACIAL · glacial_49 · MANTENIMIENTO · FOTOS DE EVIDENCIA EN EL REGISTRO CFA-CA-F-023                  *** PENDIENTE de aplicar (PRUEBAS primero; PRODUCCIÓN con la aprobación del dueño) ***
--
-- Tabla nueva (Requiere glacial_47 y glacial_48):
--   · public.mtto_registro_fotos   una fila por foto del registro: referencia «supabase:glacial-fotos/mantenimiento/registros/<registro>/<foto>.jpg», descripción opcional,
--                                  actividad opcional (la foto es de esa actividad), quién la subió y cuándo. Máximo 20 fotos por registro (lo exige un disparador).
-- El archivo vive en Supabase Storage (bucket privado «glacial-fotos», carpeta mantenimiento/: ya permitida a la cuenta compartida de Mantenimiento por glacial_25).
-- Permisos y reglas: los mismos de las actividades del registro (glacial_48):
--   · Leer: cualquier usuario con sesión. Insertar y editar: cuenta compartida de Mantenimiento y «supmtto»; nunca «solo vista».
--   · Borrar la referencia: solo «supmtto». Un registro VALIDADO no admite cambios en sus fotos (salvo supmtto): disparador mtto_hijos_guardia.
--   · Todo cambio queda en mtto_auditoria. Tiempo real: la tabla entra en supabase_realtime.
-- No toca ninguna otra tabla ni colección. Se puede ejecutar más de una vez.

do $c$
begin
  if to_regclass('public.mtto_registro_actividades') is null or to_regprocedure('public.mtto_hijos_guardia()') is null then
    raise exception 'Falta glacial_48: aplícala antes';
  end if;
end $c$;

create table if not exists public.mtto_registro_fotos (
  id             uuid primary key default gen_random_uuid(),
  registro_id    uuid not null references public.mtto_registros (id) on delete cascade,
  actividad_id   uuid references public.mtto_registro_actividades (id) on delete set null,
  ruta           text not null check (ruta like 'supabase:glacial-fotos/mantenimiento/%'),
  descripcion    text not null default '' check (char_length(descripcion) <= 200),
  subido_por     text not null default '',
  creado_en      timestamptz not null default now(),
  version        integer not null default 1,
  actualizado_en timestamptz not null default now(),
  unique (ruta)
);
create index if not exists mtto_registro_fotos_reg_idx on public.mtto_registro_fotos (registro_id, creado_en);

-- Máximo 20 fotos por registro.
create or replace function public.mtto_fotos_limite() returns trigger
language plpgsql security definer set search_path = '' as $f$
begin
  if (select count(*) from public.mtto_registro_fotos where registro_id = new.registro_id) >= 20 then
    raise exception 'Un registro admite hasta 20 fotos' using errcode = '23514';
  end if;
  return new;
end $f$;

do $t$
begin
  drop trigger if exists mtto_limite_mtto_registro_fotos on public.mtto_registro_fotos;
  create trigger mtto_limite_mtto_registro_fotos before insert on public.mtto_registro_fotos for each row execute function public.mtto_fotos_limite();
  drop trigger if exists mtto_guardia_mtto_registro_fotos on public.mtto_registro_fotos;
  create trigger mtto_guardia_mtto_registro_fotos before insert or update or delete on public.mtto_registro_fotos for each row execute function public.mtto_hijos_guardia();
  drop trigger if exists mtto_aud_mtto_registro_fotos on public.mtto_registro_fotos;
  create trigger mtto_aud_mtto_registro_fotos after insert or update or delete on public.mtto_registro_fotos for each row execute function public.mtto_auditar();
end $t$;

alter table public.mtto_registro_fotos enable row level security;
revoke all on public.mtto_registro_fotos from public, anon, authenticated;
grant select, insert, update, delete on public.mtto_registro_fotos to authenticated;
grant all on public.mtto_registro_fotos to service_role;

do $p$
declare puede text := $e$(coalesce(((select glacial_fs.ctx()) ->> 'supmtto')::boolean, false) or coalesce(((select glacial_fs.ctx()) ->> 'mant')::boolean, false)) and not coalesce(((select glacial_fs.ctx()) ->> 'solo')::boolean, false)$e$;
begin
  drop policy if exists lectura on public.mtto_registro_fotos;
  create policy lectura on public.mtto_registro_fotos for select to authenticated using (coalesce(((select glacial_fs.ctx()) ->> 'aut')::boolean, false));
  drop policy if exists escritura_ins on public.mtto_registro_fotos;
  execute format('create policy escritura_ins on public.mtto_registro_fotos for insert to authenticated with check (%s)', puede);
  drop policy if exists escritura_upd on public.mtto_registro_fotos;
  execute format('create policy escritura_upd on public.mtto_registro_fotos for update to authenticated using (%s) with check (%s)', puede, puede);
  drop policy if exists escritura_del on public.mtto_registro_fotos;
  create policy escritura_del on public.mtto_registro_fotos for delete to authenticated using (coalesce(((select glacial_fs.ctx()) ->> 'supmtto')::boolean, false));
end $p$;

do $r$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mtto_registro_fotos') then
    alter publication supabase_realtime add table public.mtto_registro_fotos;
  end if;
end $r$;
