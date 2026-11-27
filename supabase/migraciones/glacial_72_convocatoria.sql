-- GLACIAL · glacial_72 · CONVOCATORIA SEMANAL ARMADA POR EL SUPERVISOR (27/11/2026)      *** APLICADA en PRUEBAS (27/11/2026) · PRODUCCIÓN (27/11/2026) ***
--
-- Qué hace (docs/personal-tareo/convocatoria-semanal.md)
--   La convocatoria de la semana (quién va a cada equipo, con su horario) se arma DENTRO de GLACIAL. De ahí salen la imagen para WhatsApp y el Tareo diario.
--   · public.equipos_trabajo: catálogo de equipos con horario propio (columna DÍA | NOCHE de la imagen, turno base DÍA | INTERMEDIO | NOCHE para el resto
--     del sistema, mínimo de personas). Viene con los equipos de la semana 23/11–29/11/2026.
--   · public.convocatorias: una por semana (lunes), BORRADOR → PUBLICADA → CERRADA, con versión (sube con cada cambio).
--   · public.convocatoria_asignaciones: persona (id del maestro sync/workers) en un equipo O en un bloque (DESCANSO_MEDICO | VACACIONES | LICENCIA, con fecha de fin).
--     Idempotencia por client_event_id (public.convocatoria_eventos guarda el resultado de cada acción: reintentar no duplica).
--   · public.convocatoria_historial: cada cambio (quién, cuándo, antes → después). Publicada se puede seguir corrigiendo y queda constancia.
--   · public.trabajador_alias: nombres del Excel anterior unidos a mano con una persona del maestro (para el importador de transición).
--   RLS activada; lectura (y Tiempo real) solo para quien VE la convocatoria; escribir solo por las funciones (security definer).
-- Permisos (glacial_fs.conv_cap): editar = Administrador, Jefatura, Supervisores (salvo «-convocatoria») o permiso «convocatoria»;
--   ver = editar, RRHH o quien ve el resumen de producción (ctx.resumen). Que cada supervisor edite SOLO su turno lo controla la pantalla
--   (el turno del supervisor sale de la rotación de supervisores); el servidor exige el permiso de editar y deja constancia de todo cambio.
-- Funciones:
--   public.convocatoria_obtener(p_semana date)  → { convocatoria, asignaciones, anterior, equipos, alias }      requiere ver
--   public.convocatoria_asignar(p jsonb)        → { convocatoria, asignacion }  acción poner | quitar | mover     requiere editar
--   public.convocatoria_estado(p jsonb)         → convocatoria  (PUBLICADA | CERRADA | BORRADOR)                  requiere editar (reabrir CERRADA: admin/jefatura)
--   public.convocatoria_copiar(p jsonb)         → { convocatoria, n }  copia la semana anterior a una vacía      requiere editar
--   public.equipo_trabajo_guardar(p jsonb)      → equipo                                                       requiere editar
--   public.trabajador_alias_guardar(p jsonb)    → alias                                                        requiere editar
-- Errores: 42501 sin permiso · 23514 regla («convocatoria: …») · P0002 no existe.
-- ORDEN: PRUEBAS (mvxjopvnnagqytegtexi) primero; PRODUCCIÓN (ehtbwmvwoxcdefvlxttu) solo con aprobación del dueño. Se puede ejecutar más de una vez.
-- Marcha atrás:
--   alter publication supabase_realtime drop table public.convocatorias, public.convocatoria_asignaciones, public.equipos_trabajo;
--   drop function public.convocatoria_obtener(date), public.convocatoria_asignar(jsonb), public.convocatoria_estado(jsonb), public.convocatoria_copiar(jsonb),
--     public.equipo_trabajo_guardar(jsonb), public.trabajador_alias_guardar(jsonb), glacial_fs.conv_cap(), glacial_fs.conv_semana(date, text), glacial_fs.conv_toca(uuid);
--   drop table public.convocatoria_historial, public.convocatoria_eventos, public.convocatoria_asignaciones, public.convocatorias, public.trabajador_alias, public.equipos_trabajo;

do $c$
begin
  if to_regprocedure('glacial_fs.ctx()') is null or to_regprocedure('glacial_fs.tiene(jsonb,text)') is null or to_regprocedure('glacial_fs.cierre_quien()') is null then
    raise exception 'glacial_72 requiere glacial_fs.ctx(), glacial_fs.tiene(jsonb,text) y glacial_fs.cierre_quien()';
  end if;
end $c$;

/* ---------- permisos ---------- */
create or replace function glacial_fs.conv_cap()
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
declare u uuid := auth.uid(); p jsonb; rol text; perm jsonb; c jsonb := glacial_fs.ctx(); v_editar boolean; v_ver boolean; v_jefe boolean;
begin
  if u is not null then
    select d.datos->'map'->(u::text) into p from public.fs_docs d where d.coleccion = 'sync' and d.id = 'perfiles' and d.eliminado_en is null;
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or coalesce((c->>'solo')::boolean, false) or coalesce((c->>'mant')::boolean, false) then
    return jsonb_build_object('ver', false, 'editar', false, 'jefe', false, 'uid', u);
  end if;
  rol := coalesce(p->>'rol', ''); perm := p->'permisos';
  v_jefe := rol = 'Administrador' or rol in ('Jefe de Producción','Jefe de Operaciones','Jefatura');
  v_editar := v_jefe or glacial_fs.tiene(perm, 'convocatoria')
              or (rol in ('Supervisor','Supervisor de Producción') and not glacial_fs.tiene(perm, '-convocatoria'));
  v_ver := v_editar or coalesce((c->>'rrhh')::boolean, false) or coalesce((c->>'resumen')::boolean, false) or coalesce((c->>'jef')::boolean, false);
  return jsonb_build_object('ver', v_ver, 'editar', v_editar, 'jefe', v_jefe, 'uid', u);
end $f$;
revoke all on function glacial_fs.conv_cap() from public, anon;
grant execute on function glacial_fs.conv_cap() to authenticated;

/* ---------- tablas ---------- */
create table if not exists public.equipos_trabajo (
  id            text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  nombre        text not null check (char_length(btrim(nombre)) between 2 and 60),
  columna       text not null check (columna in ('DÍA','NOCHE')),
  turno_base    text not null check (turno_base in ('DÍA','INTERMEDIO','NOCHE')),
  hora_inicio   text not null check (hora_inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  hora_fin      text not null check (hora_fin ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  minimo        integer not null default 0 check (minimo between 0 and 500),
  orden         integer not null default 0,
  activo        boolean not null default true,
  actualizado_por text,
  actualizado_en  timestamptz not null default now()
);
insert into public.equipos_trabajo (id, nombre, columna, turno_base, hora_inicio, hora_fin, minimo, orden) values
  ('pet-dia','Equipo PET','DÍA','DÍA','07:00','19:00',8,1),
  ('b7l-dia','Bidones 7L','DÍA','DÍA','07:00','19:00',15,2),
  ('c20l-int','Cajas 20L','DÍA','INTERMEDIO','13:00','22:00',10,3),
  ('hielo-dia','Equipo Hielo','DÍA','DÍA','07:00','19:00',10,4),
  ('b20l-int','Bidones 20L','DÍA','INTERMEDIO','13:00','22:00',4,5),
  ('b7l-noche','Bidones 7L','NOCHE','NOCHE','21:00','07:00',10,6),
  ('hielo-noche','Equipo de Hielo','NOCHE','NOCHE','21:00','07:00',12,7),
  ('pet-noche','PET','NOCHE','NOCHE','21:00','07:00',12,8)
on conflict (id) do nothing;

create table if not exists public.convocatorias (
  id              uuid primary key default gen_random_uuid(),
  semana_inicio   date not null unique check (extract(isodow from semana_inicio) = 1),
  estado          text not null default 'BORRADOR' check (estado in ('BORRADOR','PUBLICADA','CERRADA')),
  version         integer not null default 0,
  nuevo_semanas   integer not null default 2 check (nuevo_semanas between 0 and 26),
  creada_por      text,
  creada_en       timestamptz not null default now(),
  publicada_por   text,
  publicada_en    timestamptz,
  actualizado_por text,
  actualizado_en  timestamptz not null default now()
);

create table if not exists public.convocatoria_asignaciones (
  id               bigserial primary key,
  convocatoria_id  uuid not null references public.convocatorias(id) on delete cascade,
  trabajador_id    text not null check (char_length(trabajador_id) between 1 and 80),
  nombre           text check (nombre is null or char_length(nombre) <= 120),
  equipo_id        text references public.equipos_trabajo(id),
  bloque           text check (bloque is null or bloque in ('DESCANSO_MEDICO','VACACIONES','LICENCIA')),
  columna          text not null default 'DÍA' check (columna in ('DÍA','NOCHE')),
  orden            integer not null default 0,
  hasta_fecha      date,
  actualizado_por  text,
  actualizado_en   timestamptz not null default now(),
  client_event_id  uuid unique,
  check ((equipo_id is null) <> (bloque is null))
);
create unique index if not exists convocatoria_asig_unica on public.convocatoria_asignaciones (convocatoria_id, trabajador_id, coalesce(equipo_id, bloque));
create index if not exists convocatoria_asig_conv on public.convocatoria_asignaciones (convocatoria_id);

create table if not exists public.convocatoria_eventos (
  client_event_id uuid primary key,
  resultado       jsonb,
  en              timestamptz not null default now()
);
create table if not exists public.convocatoria_historial (
  id               bigserial primary key,
  convocatoria_id  uuid,
  semana_inicio    date,
  accion           text not null,
  trabajador_id    text,
  antes            jsonb,
  despues          jsonb,
  usuario          text,
  uid              uuid,
  en               timestamptz not null default now()
);
create index if not exists convocatoria_hist_idx on public.convocatoria_historial (semana_inicio, en desc);
create table if not exists public.trabajador_alias (
  alias          text primary key check (char_length(alias) between 2 and 120),
  trabajador_id  text not null,
  creado_por     text,
  creado_en      timestamptz not null default now()
);

do $p$
declare t text;
begin
  foreach t in array array['equipos_trabajo','convocatorias','convocatoria_asignaciones','convocatoria_eventos','convocatoria_historial','trabajador_alias'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  -- lectura (y Tiempo real) para quien ve la convocatoria; escribir solo por las funciones
  foreach t in array array['equipos_trabajo','convocatorias','convocatoria_asignaciones'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists lectura on public.%I', t);
    execute format($q$create policy lectura on public.%I for select to authenticated using (coalesce(((select glacial_fs.conv_cap()) ->> 'ver')::boolean, false))$q$, t);
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $p$;
revoke all on sequence public.convocatoria_asignaciones_id_seq, public.convocatoria_historial_id_seq from public, anon, authenticated;

/* ---------- ayudas internas ---------- */
-- convocatoria de una semana (la crea en BORRADOR si no existe y p_crear no es null)
create or replace function glacial_fs.conv_semana(p_semana date, p_crear text)
returns public.convocatorias language plpgsql volatile security definer set search_path = '' as $f$
declare c public.convocatorias;
begin
  if p_semana is null or extract(isodow from p_semana) <> 1 then raise exception 'convocatoria: la semana debe empezar en lunes' using errcode = '23514'; end if;
  select * into c from public.convocatorias where semana_inicio = p_semana;
  if not found and p_crear is not null then
    insert into public.convocatorias (semana_inicio, creada_por, actualizado_por) values (p_semana, p_crear, p_crear)
    on conflict (semana_inicio) do nothing;
    select * into c from public.convocatorias where semana_inicio = p_semana;
  end if;
  return c;
end $f$;
create or replace function glacial_fs.conv_toca(p_id uuid)
returns void language sql volatile security definer set search_path = '' as $f$
  update public.convocatorias set version = version + 1, actualizado_en = now(), actualizado_por = glacial_fs.cierre_quien() where id = p_id;
$f$;
revoke all on function glacial_fs.conv_semana(date, text), glacial_fs.conv_toca(uuid) from public, anon, authenticated;

/* ---------- lectura ---------- */
create or replace function public.convocatoria_obtener(p_semana date)
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
declare cap jsonb := glacial_fs.conv_cap(); c public.convocatorias; a public.convocatorias;
begin
  if not coalesce((cap->>'ver')::boolean, false) then raise exception 'Sin permiso para ver la convocatoria' using errcode = '42501'; end if;
  select * into c from public.convocatorias where semana_inicio = p_semana;
  select * into a from public.convocatorias where semana_inicio = p_semana - 7;
  return jsonb_build_object(
    'permisos', cap - 'uid',
    'convocatoria', case when c.id is null then null else to_jsonb(c) end,
    'asignaciones', coalesce((select jsonb_agg(to_jsonb(x) order by x.columna, x.equipo_id, x.orden, x.id) from public.convocatoria_asignaciones x where x.convocatoria_id = c.id), '[]'::jsonb),
    'anterior', case when a.id is null then null else jsonb_build_object('convocatoria', to_jsonb(a),
       'asignaciones', coalesce((select jsonb_agg(jsonb_build_object('trabajador_id', x.trabajador_id, 'equipo_id', x.equipo_id, 'bloque', x.bloque, 'columna', x.columna, 'orden', x.orden, 'hasta_fecha', x.hasta_fecha)) from public.convocatoria_asignaciones x where x.convocatoria_id = a.id), '[]'::jsonb)) end,
    'equipos', coalesce((select jsonb_agg(to_jsonb(e) order by e.orden, e.id) from public.equipos_trabajo e), '[]'::jsonb),
    'alias', coalesce((select jsonb_object_agg(x.alias, x.trabajador_id) from public.trabajador_alias x), '{}'::jsonb));
end $f$;

/* ---------- escribir ---------- */
-- p: { semana, accion: poner|quitar|mover, client_event_id, trabajador_id, nombre, equipo_id | bloque, columna, orden, hasta_fecha, id (para quitar/mover) }
create or replace function public.convocatoria_asignar(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare cap jsonb := glacial_fs.conv_cap(); quien text; c public.convocatorias; fila public.convocatoria_asignaciones; previo public.convocatoria_asignaciones;
        ev uuid; res jsonb; acc text := coalesce(p->>'accion',''); eq public.equipos_trabajo; v_col text; v_bloque text; v_equipo text;
begin
  if not coalesce((cap->>'editar')::boolean, false) then raise exception 'Sin permiso para armar la convocatoria' using errcode = '42501'; end if;
  if coalesce(p->>'client_event_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'convocatoria: evento no válido' using errcode = '23514'; end if;
  ev := (p->>'client_event_id')::uuid;
  select e.resultado into res from public.convocatoria_eventos e where e.client_event_id = ev;
  if found then return res; end if;                                          -- reintento de la misma acción
  quien := glacial_fs.cierre_quien();
  c := glacial_fs.conv_semana((p->>'semana')::date, quien);
  if c.estado = 'CERRADA' and not coalesce((cap->>'jefe')::boolean, false) then raise exception 'convocatoria: la semana está cerrada (solo el Administrador o Jefatura la corrige)' using errcode = '23514'; end if;
  v_bloque := nullif(p->>'bloque',''); v_equipo := nullif(p->>'equipo_id','');
  if acc in ('poner','mover') then
    if (v_bloque is null) = (v_equipo is null) then raise exception 'convocatoria: elige un equipo o un bloque' using errcode = '23514'; end if;
    if v_equipo is not null then
      select * into eq from public.equipos_trabajo where id = v_equipo and activo;
      if not found then raise exception 'convocatoria: el equipo no existe' using errcode = 'P0002'; end if;
      v_col := eq.columna;
    else
      if v_bloque not in ('DESCANSO_MEDICO','VACACIONES','LICENCIA') then raise exception 'convocatoria: bloque no válido' using errcode = '23514'; end if;
      v_col := case when p->>'columna' = 'NOCHE' then 'NOCHE' else 'DÍA' end;
    end if;
  end if;
  if acc = 'poner' then
    if char_length(coalesce(p->>'trabajador_id','')) not between 1 and 80 then raise exception 'convocatoria: falta la persona' using errcode = '23514'; end if;
    insert into public.convocatoria_asignaciones as t (convocatoria_id, trabajador_id, nombre, equipo_id, bloque, columna, orden, hasta_fecha, actualizado_por, client_event_id)
    values (c.id, p->>'trabajador_id', left(nullif(p->>'nombre',''), 120), v_equipo, v_bloque, v_col,
            coalesce((p->>'orden')::integer, (select coalesce(max(x.orden), 0) + 1 from public.convocatoria_asignaciones x where x.convocatoria_id = c.id and coalesce(x.equipo_id, x.bloque) = coalesce(v_equipo, v_bloque))),
            nullif(p->>'hasta_fecha','')::date, quien, ev)
    on conflict (convocatoria_id, trabajador_id, coalesce(equipo_id, bloque)) do update set hasta_fecha = excluded.hasta_fecha, actualizado_por = excluded.actualizado_por, actualizado_en = now()
    returning * into fila;
    insert into public.convocatoria_historial (convocatoria_id, semana_inicio, accion, trabajador_id, antes, despues, usuario, uid)
    values (c.id, c.semana_inicio, 'poner', fila.trabajador_id, null, to_jsonb(fila), quien, (cap->>'uid')::uuid);
  elsif acc in ('quitar','mover') then
    select * into previo from public.convocatoria_asignaciones where id = (p->>'id')::bigint and convocatoria_id = c.id for update;
    if not found then raise exception 'convocatoria: esa persona ya no está ahí (otra persona la movió)' using errcode = 'P0002'; end if;
    if acc = 'quitar' then
      delete from public.convocatoria_asignaciones where id = previo.id;
      fila := null;
    else
      update public.convocatoria_asignaciones set equipo_id = v_equipo, bloque = v_bloque, columna = v_col, hasta_fecha = nullif(p->>'hasta_fecha','')::date,
        orden = coalesce((p->>'orden')::integer, (select coalesce(max(x.orden), 0) + 1 from public.convocatoria_asignaciones x where x.convocatoria_id = c.id and coalesce(x.equipo_id, x.bloque) = coalesce(v_equipo, v_bloque))),
        actualizado_por = quien, actualizado_en = now(), client_event_id = ev
      where id = previo.id returning * into fila;
    end if;
    insert into public.convocatoria_historial (convocatoria_id, semana_inicio, accion, trabajador_id, antes, despues, usuario, uid)
    values (c.id, c.semana_inicio, acc, previo.trabajador_id, to_jsonb(previo), case when fila.id is null then null else to_jsonb(fila) end, quien, (cap->>'uid')::uuid);
  else
    raise exception 'convocatoria: acción no válida' using errcode = '23514';
  end if;
  perform glacial_fs.conv_toca(c.id);
  select * into c from public.convocatorias where id = c.id;
  res := jsonb_build_object('convocatoria', to_jsonb(c), 'asignacion', case when fila.id is null then null else to_jsonb(fila) end);
  insert into public.convocatoria_eventos (client_event_id, resultado) values (ev, res) on conflict do nothing;
  return res;
exception when unique_violation then
  raise exception 'convocatoria: esa persona ya está en ese equipo' using errcode = '23505';
end $f$;

-- p: { semana, estado: PUBLICADA | CERRADA | BORRADOR }
create or replace function public.convocatoria_estado(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare cap jsonb := glacial_fs.conv_cap(); quien text := glacial_fs.cierre_quien(); c public.convocatorias; nuevo text := p->>'estado';
begin
  if not coalesce((cap->>'editar')::boolean, false) then raise exception 'Sin permiso para publicar la convocatoria' using errcode = '42501'; end if;
  if nuevo not in ('PUBLICADA','CERRADA','BORRADOR') then raise exception 'convocatoria: estado no válido' using errcode = '23514'; end if;
  c := glacial_fs.conv_semana((p->>'semana')::date, null);
  if c.id is null then raise exception 'convocatoria: la semana no tiene convocatoria' using errcode = 'P0002'; end if;
  if c.estado = 'CERRADA' and nuevo <> 'CERRADA' and not coalesce((cap->>'jefe')::boolean, false) then raise exception 'convocatoria: solo el Administrador o Jefatura reabre una semana cerrada' using errcode = '23514'; end if;
  if nuevo = 'PUBLICADA' and not exists (select 1 from public.convocatoria_asignaciones where convocatoria_id = c.id and equipo_id is not null) then
    raise exception 'convocatoria: no hay nadie convocado' using errcode = '23514';
  end if;
  update public.convocatorias set estado = nuevo, version = version + 1, actualizado_por = quien, actualizado_en = now(),
    publicada_por = case when nuevo = 'PUBLICADA' then quien else publicada_por end, publicada_en = case when nuevo = 'PUBLICADA' then now() else publicada_en end
  where id = c.id returning * into c;
  insert into public.convocatoria_historial (convocatoria_id, semana_inicio, accion, antes, despues, usuario, uid)
  values (c.id, c.semana_inicio, 'estado', null, jsonb_build_object('estado', nuevo), quien, (cap->>'uid')::uuid);
  return to_jsonb(c);
end $f$;

-- p: { semana } · copia la semana anterior (equipos y descansos vigentes) a una semana sin nadie
create or replace function public.convocatoria_copiar(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare cap jsonb := glacial_fs.conv_cap(); quien text := glacial_fs.cierre_quien(); c public.convocatorias; a public.convocatorias; n integer;
begin
  if not coalesce((cap->>'editar')::boolean, false) then raise exception 'Sin permiso para armar la convocatoria' using errcode = '42501'; end if;
  c := glacial_fs.conv_semana((p->>'semana')::date, quien);
  if exists (select 1 from public.convocatoria_asignaciones where convocatoria_id = c.id) then raise exception 'convocatoria: la semana ya tiene personas (quítalas antes de copiar)' using errcode = '23514'; end if;
  select * into a from public.convocatorias where semana_inicio = c.semana_inicio - 7;
  if a.id is null then raise exception 'convocatoria: no hay convocatoria de la semana anterior' using errcode = 'P0002'; end if;
  insert into public.convocatoria_asignaciones (convocatoria_id, trabajador_id, nombre, equipo_id, bloque, columna, orden, hasta_fecha, actualizado_por)
  select c.id, x.trabajador_id, x.nombre, x.equipo_id, x.bloque, x.columna, x.orden, x.hasta_fecha, quien
  from public.convocatoria_asignaciones x
  left join public.equipos_trabajo e on e.id = x.equipo_id
  where x.convocatoria_id = a.id and (x.bloque is null and e.activo or x.bloque is not null and (x.hasta_fecha is null or x.hasta_fecha >= c.semana_inicio))
  on conflict do nothing;
  get diagnostics n = row_count;
  perform glacial_fs.conv_toca(c.id);
  insert into public.convocatoria_historial (convocatoria_id, semana_inicio, accion, despues, usuario, uid)
  values (c.id, c.semana_inicio, 'copiar', jsonb_build_object('desde', a.semana_inicio, 'personas', n), quien, (cap->>'uid')::uuid);
  select * into c from public.convocatorias where id = c.id;
  return jsonb_build_object('convocatoria', to_jsonb(c), 'n', n);
end $f$;

-- p: { id, nombre, columna, turno_base, hora_inicio, hora_fin, minimo, orden, activo }
create or replace function public.equipo_trabajo_guardar(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare cap jsonb := glacial_fs.conv_cap(); quien text := glacial_fs.cierre_quien(); e public.equipos_trabajo;
begin
  if not coalesce((cap->>'editar')::boolean, false) then raise exception 'Sin permiso para cambiar los equipos' using errcode = '42501'; end if;
  insert into public.equipos_trabajo as t (id, nombre, columna, turno_base, hora_inicio, hora_fin, minimo, orden, activo, actualizado_por)
  values (p->>'id', btrim(p->>'nombre'), p->>'columna', p->>'turno_base', p->>'hora_inicio', p->>'hora_fin', coalesce((p->>'minimo')::integer, 0), coalesce((p->>'orden')::integer, 0), coalesce((p->>'activo')::boolean, true), quien)
  on conflict (id) do update set nombre = excluded.nombre, columna = excluded.columna, turno_base = excluded.turno_base, hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin,
    minimo = excluded.minimo, orden = excluded.orden, activo = excluded.activo, actualizado_por = quien, actualizado_en = now()
  returning * into e;
  insert into public.convocatoria_historial (accion, despues, usuario, uid) values ('equipo', to_jsonb(e), quien, (cap->>'uid')::uuid);
  return to_jsonb(e);
exception when check_violation then
  raise exception 'convocatoria: equipo no válido (nombre, columna DÍA/NOCHE, turno base, horas HH:MM, mínimo 0–500)' using errcode = '23514';
end $f$;

-- p: { alias (nombre normalizado), trabajador_id }
create or replace function public.trabajador_alias_guardar(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare cap jsonb := glacial_fs.conv_cap(); quien text := glacial_fs.cierre_quien(); r public.trabajador_alias;
begin
  if not coalesce((cap->>'editar')::boolean, false) then raise exception 'Sin permiso' using errcode = '42501'; end if;
  if char_length(coalesce(p->>'alias','')) not between 2 and 120 or char_length(coalesce(p->>'trabajador_id','')) not between 1 and 80 then raise exception 'convocatoria: alias no válido' using errcode = '23514'; end if;
  insert into public.trabajador_alias as t (alias, trabajador_id, creado_por) values (p->>'alias', p->>'trabajador_id', quien)
  on conflict (alias) do update set trabajador_id = excluded.trabajador_id, creado_por = quien, creado_en = now()
  returning * into r;
  return to_jsonb(r);
end $f$;

revoke all on function public.convocatoria_obtener(date), public.convocatoria_asignar(jsonb), public.convocatoria_estado(jsonb), public.convocatoria_copiar(jsonb),
  public.equipo_trabajo_guardar(jsonb), public.trabajador_alias_guardar(jsonb) from public, anon;
grant execute on function public.convocatoria_obtener(date), public.convocatoria_asignar(jsonb), public.convocatoria_estado(jsonb), public.convocatoria_copiar(jsonb),
  public.equipo_trabajo_guardar(jsonb), public.trabajador_alias_guardar(jsonb) to authenticated;
