-- GLACIAL · glacial_47 · MANTENIMIENTO · PLAN ANUAL (máquinas y actividades del PLAN-PROGRAMA MTTO 2026 de la Planta de Agua PET)
--                                                                                         *** APLICADA en PRUEBAS (08/11/2026) · PRODUCCIÓN: pendiente de aprobación ***
--
-- Qué crea (tablas propias, no colecciones del puente; ver docs/mantenimiento/plan-y-registro.md)
--   · public.mtto_maquinas              una fila por hoja del Excel (SOP, ENV, DISP…). Las hojas «CARB» entran con pendiente_confirmar = true
--                                       (aún no se sabe a qué línea pertenecen: no se asignan a PET2).
--   · public.mtto_plan_actividades      una fila por actividad del plan: texto tal cual el Excel (sin corregir ortografía ni numeración),
--                                       semanas_por_mes (12 textos, para imprimir igual) y semanas (int[], ya interpretadas, para calcular).
--   · public.mtto_config                una fila (id = 'config'): nombres de las firmas e insumos químicos fijos del formato impreso.
--   · public.mtto_auditoria             todo cambio de máquinas, plan y configuración (quién, cuándo, antes y después).
-- Permisos (RLS activada en las 4 tablas)
--   · Leer: cualquier usuario con sesión (incluida la cuenta compartida de mantenimiento y Producción).
--   · Escribir máquinas, plan y configuración: marca «supmtto» de glacial_fs.ctx() (Administrador o permiso moduloMantenimiento / gestionar_rotacion_mantenimiento).
--     Producción, los roles de solo consulta y «solo vista» no escriben. Nadie borra la auditoría ni la edita.
--   · Tiempo real: las 3 primeras tablas entran en la publicación supabase_realtime (los demás dispositivos ven los cambios sin recargar).
--   · Cada cambio sube «version» (control de concurrencia: la pantalla actualiza con .eq('version', n)) y deja un evento en mtto_auditoria.
-- No toca ninguna colección existente. Se puede ejecutar más de una vez. Orden: PRUEBAS primero; PRODUCCIÓN con la aprobación del dueño.

do $c$
begin
  if to_regprocedure('glacial_fs.ctx()') is null then
    raise exception 'glacial_fs.ctx no existe: esta migración necesita las reglas del puente';
  end if;
end $c$;

create table if not exists public.mtto_maquinas (
  id                  uuid primary key default gen_random_uuid(),
  planta              text not null default 'AGUA',
  linea_impresion     text not null default 'PET',
  codigo_hoja         text not null unique,
  nombre              text not null,
  orden               integer not null default 0,
  activo              boolean not null default true,
  pendiente_confirmar boolean not null default false,
  linea               text,                                   -- línea real (PET1, PET2…) cuando se confirme; las hojas CARB quedan en null
  version             integer not null default 1,
  actualizado_por     text not null default '',
  actualizado_en      timestamptz not null default now()
);

create table if not exists public.mtto_plan_actividades (
  id               uuid primary key default gen_random_uuid(),
  maquina_id       uuid not null references public.mtto_maquinas (id) on delete cascade,
  anio             integer not null default 2026,
  frecuencia       text not null,
  bloque_orden     integer not null default 0,
  item             text not null default '',
  actividad        text not null default '',
  insumos          text not null default '',
  n_tecnicos       integer not null default 1 check (n_tecnicos between 0 and 20),
  semanas_por_mes  jsonb not null default '["","","","","","","","","","","",""]'::jsonb
                   check (jsonb_typeof(semanas_por_mes) = 'array' and jsonb_array_length(semanas_por_mes) = 12),
  semanas          integer[] not null default '{}' check (semanas <@ '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53}'::integer[]),
  es_todo_el_anio  boolean not null default false,
  orden            integer not null default 0,
  version          integer not null default 1,
  actualizado_por  text not null default '',
  actualizado_en   timestamptz not null default now()
);
create index if not exists mtto_plan_actividades_maquina_idx on public.mtto_plan_actividades (maquina_id, anio, orden);

create table if not exists public.mtto_config (
  id              text primary key default 'config' check (id = 'config'),
  datos           jsonb not null default '{}'::jsonb check (jsonb_typeof(datos) = 'object'),
  version         integer not null default 1,
  actualizado_por text not null default '',
  actualizado_en  timestamptz not null default now()
);

create table if not exists public.mtto_auditoria (
  id          bigint generated always as identity primary key,
  tabla       text not null,
  registro_id text not null,
  accion      text not null check (accion in ('INSERT', 'UPDATE', 'DELETE')),
  antes       jsonb,
  despues     jsonb,
  usuario_uid uuid,
  usuario     text not null default '',
  en          timestamptz not null default now()
);
create index if not exists mtto_auditoria_en_idx on public.mtto_auditoria (en desc);

-- Quién hace el cambio: el nombre del perfil de GLACIAL (sync/perfiles). Sin sesión (importación con llave de servicio) queda «importación».
create or replace function public.mtto_quien() returns text
language sql stable security definer set search_path = '' as $f$
  select coalesce(
    (select nullif(d.datos -> 'map' -> (auth.uid())::text ->> 'nombre', '')
       from public.fs_docs d where d.coleccion = 'sync' and d.id = 'perfiles' and d.eliminado_en is null),
    case when auth.uid() is null then 'importación' else (auth.uid())::text end)
$f$;

-- BEFORE: sube la versión y firma quién/cuándo. AFTER: deja el evento en la auditoría.
create or replace function public.mtto_antes() returns trigger
language plpgsql security definer set search_path = '' as $f$
begin
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  new.actualizado_por := public.mtto_quien();
  new.actualizado_en := now();
  return new;
end $f$;

create or replace function public.mtto_auditar() returns trigger
language plpgsql security definer set search_path = '' as $f$
declare rid text;
begin
  rid := case when tg_op = 'DELETE' then coalesce(to_jsonb(old) ->> 'id', '') else coalesce(to_jsonb(new) ->> 'id', '') end;
  insert into public.mtto_auditoria (tabla, registro_id, accion, antes, despues, usuario_uid, usuario)
  values (tg_table_name, rid, tg_op,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end,
          auth.uid(), public.mtto_quien());
  return null;
end $f$;

do $t$
declare t text;
begin
  foreach t in array array['mtto_maquinas', 'mtto_plan_actividades', 'mtto_config'] loop
    execute format('drop trigger if exists mtto_antes_%1$s on public.%1$s', t);
    execute format('create trigger mtto_antes_%1$s before insert or update on public.%1$s for each row execute function public.mtto_antes()', t);
    execute format('drop trigger if exists mtto_aud_%1$s on public.%1$s', t);
    execute format('create trigger mtto_aud_%1$s after insert or update or delete on public.%1$s for each row execute function public.mtto_auditar()', t);
  end loop;
end $t$;

-- RLS: leer con sesión; escribir con la marca supmtto; la auditoría solo se lee (supmtto, jefaturas y Administrador) y solo la escriben los disparadores.
alter table public.mtto_maquinas enable row level security;
alter table public.mtto_plan_actividades enable row level security;
alter table public.mtto_config enable row level security;
alter table public.mtto_auditoria enable row level security;

revoke all on public.mtto_maquinas, public.mtto_plan_actividades, public.mtto_config, public.mtto_auditoria from public, anon, authenticated;
grant select, insert, update, delete on public.mtto_maquinas, public.mtto_plan_actividades to authenticated;
grant select, insert, update on public.mtto_config to authenticated;
grant select on public.mtto_auditoria to authenticated;
grant all on public.mtto_maquinas, public.mtto_plan_actividades, public.mtto_config, public.mtto_auditoria to service_role;

do $p$
declare t text;
begin
  foreach t in array array['mtto_maquinas', 'mtto_plan_actividades', 'mtto_config'] loop
    execute format('drop policy if exists lectura on public.%I', t);
    execute format($q$create policy lectura on public.%I for select to authenticated using (coalesce(((select glacial_fs.ctx()) ->> 'aut')::boolean, false))$q$, t);
    execute format('drop policy if exists escritura_ins on public.%I', t);
    execute format($q$create policy escritura_ins on public.%I for insert to authenticated with check (coalesce(((select glacial_fs.ctx()) ->> 'supmtto')::boolean, false))$q$, t);
    execute format('drop policy if exists escritura_upd on public.%I', t);
    execute format($q$create policy escritura_upd on public.%I for update to authenticated using (coalesce(((select glacial_fs.ctx()) ->> 'supmtto')::boolean, false)) with check (coalesce(((select glacial_fs.ctx()) ->> 'supmtto')::boolean, false))$q$, t);
  end loop;
  foreach t in array array['mtto_maquinas', 'mtto_plan_actividades'] loop
    execute format('drop policy if exists escritura_del on public.%I', t);
    execute format($q$create policy escritura_del on public.%I for delete to authenticated using (coalesce(((select glacial_fs.ctx()) ->> 'supmtto')::boolean, false))$q$, t);
  end loop;
  drop policy if exists lectura on public.mtto_auditoria;
  create policy lectura on public.mtto_auditoria for select to authenticated using (
    coalesce(((select glacial_fs.ctx()) ->> 'supmtto')::boolean, false) or coalesce(((select glacial_fs.ctx()) ->> 'jef')::boolean, false)
    or coalesce(((select glacial_fs.ctx()) ->> 'admin')::boolean, false));
end $p$;

-- Tiempo real
do $r$
declare t text;
begin
  foreach t in array array['mtto_maquinas', 'mtto_plan_actividades', 'mtto_config'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $r$;

-- Configuración inicial (solo si no existe): firmas del formato impreso e insumos químicos fijos
insert into public.mtto_config (id, datos) values ('config', jsonb_build_object(
  'firmas', jsonb_build_object('vbGG', 'ÁLVARO HIDALGO', 'jefeMantenimiento', 'ADRIÁN MARTÍNEZ', 'supervisorMantenimiento', 'CRISTIAN MEZA'),
  'insumosQuimicos', jsonb_build_array('Grasa Multipropósito Sanitaria.', 'Limpiacontacto.', 'Aflojatodo.', 'Lubricatodo.')))
on conflict (id) do nothing;
