-- GLACIAL · glacial_48 · MANTENIMIENTO · REGISTROS CFA-CA-F-023 (un formato por máquina y semana)                                  *** APLICADA en PRUEBAS (08/11/2026) · PRODUCCIÓN: pendiente de aprobación ***
--
-- Tablas nuevas (Requiere glacial_47):
--   · public.mtto_registros              un registro por máquina, año y semana (unique): tipo, condición, técnico, maquinista, horario programado y real, informe final, estado
--                                        PENDIENTE → EN_CURSO → CERRADO → VALIDADO, versión para no pisar cambios.
--   · public.mtto_registro_actividades   las actividades del registro (copiadas del plan al iniciarlo: equipo, actividad, frecuencia) con realizado, observación, quién y cuándo marcó.
--   · public.mtto_registro_piezas        cambio o reparación de piezas (hasta 4 filas por registro).
-- Permisos (RLS activada)
--   · Leer: cualquier usuario con sesión (Producción solo lee).
--   · Escribir: la cuenta compartida de Mantenimiento (los técnicos entran con su PIN y se identifican en pantalla) y la marca «supmtto» (Supervisor / Jefe de Mantenimiento, Administrador).
--     Nadie en «solo vista» ni Producción escribe.
--   · VALIDAR un registro, o tocar uno ya VALIDADO (reabrirlo), solo lo hace «supmtto»: lo exige un disparador, no solo la pantalla.
--   · Todo cambio queda en mtto_auditoria (glacial_47). Tiempo real: las 3 tablas entran en supabase_realtime.
-- No toca ninguna otra tabla ni colección. Se puede ejecutar más de una vez. Orden: PRUEBAS primero; PRODUCCIÓN con la aprobación del dueño.

do $c$
begin
  if to_regclass('public.mtto_plan_actividades') is null or to_regprocedure('public.mtto_auditar()') is null then
    raise exception 'Falta glacial_47: aplícala antes';
  end if;
end $c$;

create table if not exists public.mtto_registros (
  id                  uuid primary key default gen_random_uuid(),
  maquina_id          uuid not null references public.mtto_maquinas (id) on delete restrict,
  anio                integer not null,
  semana              integer not null check (semana between 1 and 53),
  fecha               date not null default current_date,
  tipo_mtto           text not null default 'PREVENTIVO' check (tipo_mtto in ('PREDICTIVO', 'PREVENTIVO', 'CORRECTIVO')),
  condicion           text not null default 'INTERNO' check (condicion in ('INTERNO', 'EXTERNO')),
  proxima_revision    date,
  tecnico_senior      text not null default '',
  tecnico_senior_id   text not null default '',
  maquinista          text not null default '',
  maquinista_id       text not null default '',
  supervisor          text not null default '',
  hora_inicio_prog    time not null default '07:00',
  hora_fin_prog       time not null default '16:00',
  horas_prog          numeric not null default 8,
  hora_inicio_real    time,
  hora_fin_real       time,
  informe_final       text not null default 'Se han realizado las actividades mencionadas en la tabla superior cumpliendo con lo programado. Máquina en condiciones normales de operación.',
  estado              text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'EN_CURSO', 'CERRADO', 'VALIDADO')),
  creado_por          text not null default '',
  creado_en           timestamptz not null default now(),
  cerrado_en          timestamptz,
  validado_por        text not null default '',
  validado_en         timestamptz,
  version             integer not null default 1,
  actualizado_por     text not null default '',
  actualizado_en      timestamptz not null default now(),
  unique (maquina_id, anio, semana)
);
create index if not exists mtto_registros_semana_idx on public.mtto_registros (anio, semana);

create table if not exists public.mtto_registro_actividades (
  id                uuid primary key default gen_random_uuid(),
  registro_id       uuid not null references public.mtto_registros (id) on delete cascade,
  plan_actividad_id uuid references public.mtto_plan_actividades (id) on delete set null,
  item              integer not null default 0,
  equipo            text not null default '',
  actividad         text not null default '',
  frecuencia        text not null default '',
  realizado         boolean not null default false,
  observacion       text not null default '',
  marcado_por       text not null default '',
  marcado_en        timestamptz,
  version           integer not null default 1,
  actualizado_en    timestamptz not null default now()
);
create index if not exists mtto_registro_actividades_reg_idx on public.mtto_registro_actividades (registro_id, item);

create table if not exists public.mtto_registro_piezas (
  id          uuid primary key default gen_random_uuid(),
  registro_id uuid not null references public.mtto_registros (id) on delete cascade,
  orden       integer not null check (orden between 1 and 4),
  descripcion text not null default '',
  version     integer not null default 1,
  actualizado_en timestamptz not null default now(),
  unique (registro_id, orden)
);

-- Validar, o tocar un registro ya VALIDADO, solo lo hace el Supervisor / Jefe de Mantenimiento (marca supmtto).
create or replace function public.mtto_registro_guardia() returns trigger
language plpgsql security definer set search_path = '' as $f$
declare sup boolean := coalesce(((select glacial_fs.ctx()) ->> 'supmtto')::boolean, false);
begin
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    if (new.estado = 'VALIDADO' and old.estado <> 'VALIDADO') or old.estado = 'VALIDADO' then
      if not sup and auth.uid() is not null then raise exception 'Solo el Supervisor o el Jefe de Mantenimiento puede validar o reabrir un registro' using errcode = '42501'; end if;
    end if;
    if new.estado = 'VALIDADO' and old.estado <> 'VALIDADO' then new.validado_en := now(); new.validado_por := public.mtto_quien(); end if;
    if new.estado = 'CERRADO' and old.estado <> 'CERRADO' then new.cerrado_en := now(); end if;
  elsif tg_op = 'INSERT' and new.estado = 'VALIDADO' and not sup and auth.uid() is not null then
    raise exception 'Un registro nuevo no puede nacer validado' using errcode = '42501';
  end if;
  new.actualizado_por := public.mtto_quien();
  new.actualizado_en := now();
  return new;
end $f$;

-- Un registro VALIDADO no admite cambios en sus actividades ni piezas, salvo del supervisor.
create or replace function public.mtto_hijos_guardia() returns trigger
language plpgsql security definer set search_path = '' as $f$
declare sup boolean := coalesce(((select glacial_fs.ctx()) ->> 'supmtto')::boolean, false); rid uuid; est text;
begin
  rid := case when tg_op = 'DELETE' then old.registro_id else new.registro_id end;
  select estado into est from public.mtto_registros where id = rid;
  if est = 'VALIDADO' and not sup and auth.uid() is not null then raise exception 'El registro ya está validado: solo el supervisor puede reabrirlo' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  if tg_op <> 'DELETE' then new.actualizado_en := now(); return new; end if;
  return old;
end $f$;

do $t$
declare t text;
begin
  drop trigger if exists mtto_guardia_mtto_registros on public.mtto_registros;
  create trigger mtto_guardia_mtto_registros before insert or update on public.mtto_registros for each row execute function public.mtto_registro_guardia();
  foreach t in array array['mtto_registro_actividades', 'mtto_registro_piezas'] loop
    execute format('drop trigger if exists mtto_guardia_%1$s on public.%1$s', t);
    execute format('create trigger mtto_guardia_%1$s before insert or update or delete on public.%1$s for each row execute function public.mtto_hijos_guardia()', t);
  end loop;
  foreach t in array array['mtto_registros', 'mtto_registro_actividades', 'mtto_registro_piezas'] loop
    execute format('drop trigger if exists mtto_aud_%1$s on public.%1$s', t);
    execute format('create trigger mtto_aud_%1$s after insert or update or delete on public.%1$s for each row execute function public.mtto_auditar()', t);
  end loop;
end $t$;

alter table public.mtto_registros enable row level security;
alter table public.mtto_registro_actividades enable row level security;
alter table public.mtto_registro_piezas enable row level security;
revoke all on public.mtto_registros, public.mtto_registro_actividades, public.mtto_registro_piezas from public, anon, authenticated;
grant select, insert, update, delete on public.mtto_registros, public.mtto_registro_actividades, public.mtto_registro_piezas to authenticated;
grant all on public.mtto_registros, public.mtto_registro_actividades, public.mtto_registro_piezas to service_role;

do $p$
declare t text; puede text := $e$(coalesce(((select glacial_fs.ctx()) ->> 'supmtto')::boolean, false) or coalesce(((select glacial_fs.ctx()) ->> 'mant')::boolean, false)) and not coalesce(((select glacial_fs.ctx()) ->> 'solo')::boolean, false)$e$;
begin
  foreach t in array array['mtto_registros', 'mtto_registro_actividades', 'mtto_registro_piezas'] loop
    execute format('drop policy if exists lectura on public.%I', t);
    execute format($q$create policy lectura on public.%I for select to authenticated using (coalesce(((select glacial_fs.ctx()) ->> 'aut')::boolean, false))$q$, t);
    execute format('drop policy if exists escritura_ins on public.%I', t);
    execute format('create policy escritura_ins on public.%I for insert to authenticated with check (%s)', t, puede);
    execute format('drop policy if exists escritura_upd on public.%I', t);
    execute format('create policy escritura_upd on public.%I for update to authenticated using (%s) with check (%s)', t, puede, puede);
    execute format('drop policy if exists escritura_del on public.%I', t);
    execute format('create policy escritura_del on public.%I for delete to authenticated using (coalesce(((select glacial_fs.ctx()) ->> ''supmtto'')::boolean, false))', t);
  end loop;
end $p$;

do $r$
declare t text;
begin
  foreach t in array array['mtto_registros', 'mtto_registro_actividades', 'mtto_registro_piezas'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $r$;
