-- GLACIAL · glacial_73 · DESCANSOS AUTOMÁTICOS (SORTEO CON REGLAS) (28/11/2026)      *** APLICADA en PRUEBAS (28/11/2026) · PRODUCCIÓN (28/11/2026) ***
--
-- Qué hace (docs/personal-tareo/descansos-automaticos.md)
--   El cuadro «DESCANSOS TURNO DÍA / NOCHE» (antes Excel con «X» a mano) lo propone GLACIAL con un sorteo con reglas (js/personal/49d-descansos-nucleo.js)
--   y el supervisor lo revisa, mueve a mano y publica. Al publicar pasa a la convocatoria (columna DESC.) y al Tareo (estado «Descanso» prellenado).
--   · public.equipos_trabajo (glacial_72): + minimo_descanso (personas que deben trabajar cada día), minimo_por_dia (7 valores, lunes→domingo) y
--     dias_sin_operar (0 = lunes … 6 = domingo). Vienen con los mínimos DE PRUEBA del pedido; el dueño carga los reales en pantalla.
--   · public.descansos_config: semanas de historial para la equidad (8) y si el descanso médico que termina a mitad de semana recibe descanso (no).
--   · public.descansos_semana: una por semana y turno (DÍA | NOCHE), PROPUESTA → PUBLICADA, con la semilla del sorteo (n.º de sorteo) y versión.
--   · public.descansos_asignacion: persona → día de descanso (0–6 o null), status, origen AUTO | FIJO | MANUAL | EXCLUIDO, motivo, quién y cuándo.
--   · public.descansos_eventos (idempotencia por client_event_id) y public.descansos_historial (auditoría: quién cambió qué descanso, antes → después).
--   RLS activada; lectura (y Tiempo real) para quien VE la convocatoria; escribir solo por las funciones (security definer).
-- Permisos: los de la convocatoria (glacial_fs.conv_cap, glacial_72). Que el supervisor edite SOLO su turno lo controla la pantalla; el servidor exige
--   editar y deja constancia. Mínimos, días sin operar y configuración: solo Administrador / Jefatura (jefe).
-- Funciones:
--   public.descansos_obtener(p_semana date)     → { permisos, config, semanas, asignaciones, historial, equipos }   requiere ver
--   public.descansos_guardar(p jsonb)           → semana   (sorteo nuevo: reemplaza la propuesta del turno)           requiere editar
--   public.descansos_mover(p jsonb)             → { semana, asignacion }  (cambio a mano de una persona)            requiere editar
--   public.descansos_estado(p jsonb)            → semana   (PUBLICADA | PROPUESTA)                                    requiere editar
--   public.descansos_config_guardar(p jsonb)    → config                                                             requiere jefe
--   public.equipo_descanso_guardar(p jsonb)     → equipo   (mínimos y días sin operar)                               requiere jefe
-- Errores: 42501 sin permiso · 23514 regla («descansos: …») · P0002 no existe · 40001 otro equipo cambió la propuesta.
-- ORDEN: requiere glacial_72. PRUEBAS (mvxjopvnnagqytegtexi) primero; PRODUCCIÓN (ehtbwmvwoxcdefvlxttu) solo con aprobación. Se puede ejecutar más de una vez.
-- Marcha atrás:
--   alter publication supabase_realtime drop table public.descansos_semana, public.descansos_asignacion, public.descansos_config;
--   drop function public.descansos_obtener(date), public.descansos_guardar(jsonb), public.descansos_mover(jsonb), public.descansos_estado(jsonb),
--     public.descansos_config_guardar(jsonb), public.equipo_descanso_guardar(jsonb), glacial_fs.desc_semana(date, text, text), glacial_fs.desc_toca(uuid);
--   drop table public.descansos_historial, public.descansos_eventos, public.descansos_asignacion, public.descansos_semana, public.descansos_config;
--   alter table public.equipos_trabajo drop column minimo_descanso, drop column minimo_por_dia, drop column dias_sin_operar;

do $c$
begin
  if to_regprocedure('glacial_fs.conv_cap()') is null or to_regclass('public.equipos_trabajo') is null then
    raise exception 'glacial_73 requiere glacial_72 (convocatoria semanal)';
  end if;
end $c$;

/* ---------- equipos: mínimos de descanso y días sin operar ---------- */
alter table public.equipos_trabajo add column if not exists minimo_descanso integer check (minimo_descanso is null or minimo_descanso between 0 and 500);
alter table public.equipos_trabajo add column if not exists minimo_por_dia jsonb check (minimo_por_dia is null or (jsonb_typeof(minimo_por_dia) = 'array' and jsonb_array_length(minimo_por_dia) = 7));
alter table public.equipos_trabajo add column if not exists dias_sin_operar smallint[] not null default '{}' check (dias_sin_operar <@ array[0,1,2,3,4,5,6]::smallint[]);
-- mínimos DE PRUEBA del pedido (el dueño carga los reales): solo donde aún no hay valor
update public.equipos_trabajo e set minimo_descanso = v.m
from (values ('pet-dia',6),('b7l-dia',12),('c20l-int',8),('hielo-dia',8),('b20l-int',2),('b7l-noche',8),('hielo-noche',9),('pet-noche',10)) as v(id, m)
where e.id = v.id and e.minimo_descanso is null;

/* ---------- tablas ---------- */
create table if not exists public.descansos_config (
  id                 integer primary key default 1 check (id = 1),
  semanas_historial  integer not null default 8 check (semanas_historial between 1 and 26),
  medico_parcial     boolean not null default false,
  actualizado_por    text,
  actualizado_en     timestamptz not null default now()
);
insert into public.descansos_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.descansos_semana (
  id              uuid primary key default gen_random_uuid(),
  semana_inicio   date not null check (extract(isodow from semana_inicio) = 1),
  turno           text not null check (turno in ('DÍA','NOCHE')),
  estado          text not null default 'PROPUESTA' check (estado in ('PROPUESTA','PUBLICADA')),
  semilla         integer not null default 0,
  version         integer not null default 0,
  generado_por    text,
  generado_en     timestamptz not null default now(),
  publicado_por   text,
  publicado_en    timestamptz,
  actualizado_por text,
  actualizado_en  timestamptz not null default now(),
  unique (semana_inicio, turno)
);

create table if not exists public.descansos_asignacion (
  id                   bigserial primary key,
  descansos_semana_id  uuid not null references public.descansos_semana(id) on delete cascade,
  trabajador_id        text not null check (char_length(trabajador_id) between 1 and 80),
  nombre               text check (nombre is null or char_length(nombre) <= 120),
  equipo_id            text references public.equipos_trabajo(id),
  dia                  smallint check (dia is null or dia between 0 and 6),
  status               text not null check (status in ('ASIGNADO','VIENE_NOCHE','PASA_NOCHE','MANUAL','MEDICO','PROGRAMAR')),
  origen               text not null check (origen in ('AUTO','FIJO','MANUAL','EXCLUIDO')),
  motivo               text check (motivo is null or char_length(motivo) <= 200),
  bloque               text check (bloque is null or bloque in ('','DESCANSO_MEDICO','VACACIONES','LICENCIA')),
  hasta_fecha          date,
  orden                integer not null default 0,
  actualizado_por      text,
  actualizado_en       timestamptz not null default now(),
  client_event_id      uuid unique,
  unique (descansos_semana_id, trabajador_id)
);
create index if not exists descansos_asig_semana on public.descansos_asignacion (descansos_semana_id);

create table if not exists public.descansos_eventos (
  client_event_id uuid primary key,
  resultado       jsonb,
  en              timestamptz not null default now()
);
create table if not exists public.descansos_historial (
  id             bigserial primary key,
  semana_inicio  date,
  turno          text,
  accion         text not null,
  trabajador_id  text,
  antes          jsonb,
  despues        jsonb,
  usuario        text,
  uid            uuid,
  en             timestamptz not null default now()
);
create index if not exists descansos_hist_idx on public.descansos_historial (semana_inicio, en desc);

do $p$
declare t text;
begin
  foreach t in array array['descansos_config','descansos_semana','descansos_asignacion','descansos_eventos','descansos_historial'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  foreach t in array array['descansos_config','descansos_semana','descansos_asignacion'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists lectura on public.%I', t);
    execute format($q$create policy lectura on public.%I for select to authenticated using (coalesce(((select glacial_fs.conv_cap()) ->> 'ver')::boolean, false))$q$, t);
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $p$;
revoke all on sequence public.descansos_asignacion_id_seq, public.descansos_historial_id_seq from public, anon, authenticated;

/* ---------- ayudas internas ---------- */
create or replace function glacial_fs.desc_semana(p_semana date, p_turno text, p_crear text)
returns public.descansos_semana language plpgsql volatile security definer set search_path = '' as $f$
declare s public.descansos_semana;
begin
  if p_semana is null or extract(isodow from p_semana) <> 1 then raise exception 'descansos: la semana debe empezar en lunes' using errcode = '23514'; end if;
  if p_turno not in ('DÍA','NOCHE') then raise exception 'descansos: turno no válido (DÍA o NOCHE)' using errcode = '23514'; end if;
  select * into s from public.descansos_semana where semana_inicio = p_semana and turno = p_turno;
  if not found and p_crear is not null then
    insert into public.descansos_semana (semana_inicio, turno, generado_por, actualizado_por) values (p_semana, p_turno, p_crear, p_crear) on conflict (semana_inicio, turno) do nothing;
    select * into s from public.descansos_semana where semana_inicio = p_semana and turno = p_turno;
  end if;
  return s;
end $f$;
create or replace function glacial_fs.desc_toca(p_id uuid)
returns void language sql volatile security definer set search_path = '' as $f$
  update public.descansos_semana set version = version + 1, actualizado_en = now(), actualizado_por = glacial_fs.cierre_quien() where id = p_id;
$f$;
revoke all on function glacial_fs.desc_semana(date, text, text), glacial_fs.desc_toca(uuid) from public, anon, authenticated;

/* ---------- lectura ---------- */
create or replace function public.descansos_obtener(p_semana date)
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
declare cap jsonb := glacial_fs.conv_cap(); cfg public.descansos_config; n integer;
begin
  if not coalesce((cap->>'ver')::boolean, false) then raise exception 'Sin permiso para ver los descansos' using errcode = '42501'; end if;
  select * into cfg from public.descansos_config where id = 1;
  n := coalesce(cfg.semanas_historial, 8);
  return jsonb_build_object(
    'permisos', cap - 'uid',
    'config', to_jsonb(cfg),
    'semanas', coalesce((select jsonb_agg(to_jsonb(s) order by s.turno) from public.descansos_semana s where s.semana_inicio = p_semana), '[]'::jsonb),
    'asignaciones', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('turno', s.turno) order by s.turno, a.orden, a.id)
                              from public.descansos_asignacion a join public.descansos_semana s on s.id = a.descansos_semana_id where s.semana_inicio = p_semana), '[]'::jsonb),
    -- semanas anteriores PUBLICADAS (equidad: domingos y día de la semana anterior)
    'historial', coalesce((select jsonb_agg(jsonb_build_object('semana', s.semana_inicio, 'turno', s.turno,
                              'asignaciones', coalesce((select jsonb_agg(jsonb_build_object('trabajador_id', a.trabajador_id, 'dia', a.dia)) from public.descansos_asignacion a where a.descansos_semana_id = s.id), '[]'::jsonb)))
                           from public.descansos_semana s where s.estado = 'PUBLICADA' and s.semana_inicio < p_semana and s.semana_inicio >= p_semana - 7 * n), '[]'::jsonb),
    'equipos', coalesce((select jsonb_agg(to_jsonb(e) order by e.orden, e.id) from public.equipos_trabajo e), '[]'::jsonb));
end $f$;

/* ---------- escribir ---------- */
-- p: { semana, turno, semilla, version (la que vio la pantalla; opcional), client_event_id,
--      asignaciones: [{ trabajador_id, nombre, equipo_id, dia, status, origen, motivo, bloque, hasta_fecha, orden }] }
-- Sorteo nuevo o «Volver a sortear»: reemplaza la propuesta del turno. Si estaba PUBLICADA vuelve a PROPUESTA (hay que publicar otra vez).
create or replace function public.descansos_guardar(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare cap jsonb := glacial_fs.conv_cap(); quien text; s public.descansos_semana; ev uuid; res jsonb; x jsonb; i integer := 0; antes jsonb;
begin
  if not coalesce((cap->>'editar')::boolean, false) then raise exception 'Sin permiso para generar los descansos' using errcode = '42501'; end if;
  if coalesce(p->>'client_event_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'descansos: evento no válido' using errcode = '23514'; end if;
  ev := (p->>'client_event_id')::uuid;
  select e.resultado into res from public.descansos_eventos e where e.client_event_id = ev;
  if found then return res; end if;
  if jsonb_typeof(p->'asignaciones') <> 'array' or jsonb_array_length(p->'asignaciones') = 0 then raise exception 'descansos: no hay personas en el cuadro' using errcode = '23514'; end if;
  quien := glacial_fs.cierre_quien();
  s := glacial_fs.desc_semana((p->>'semana')::date, p->>'turno', quien);
  select * into s from public.descansos_semana where id = s.id for update;
  if p ? 'version' and (p->>'version')::integer <> s.version and exists (select 1 from public.descansos_asignacion where descansos_semana_id = s.id) then
    raise exception 'descansos: otra persona cambió estos descansos; se recargó el cuadro' using errcode = '40001';
  end if;
  select jsonb_agg(jsonb_build_object('t', a.trabajador_id, 'd', a.dia, 's', a.status)) into antes from public.descansos_asignacion a where a.descansos_semana_id = s.id;
  delete from public.descansos_asignacion where descansos_semana_id = s.id;
  begin
    for x in select * from jsonb_array_elements(p->'asignaciones') loop
      i := i + 1;
      insert into public.descansos_asignacion (descansos_semana_id, trabajador_id, nombre, equipo_id, dia, status, origen, motivo, bloque, hasta_fecha, orden, actualizado_por)
      values (s.id, x->>'trabajador_id', left(nullif(x->>'nombre',''), 120), nullif(x->>'equipo_id',''), nullif(x->>'dia','')::smallint,
              coalesce(x->>'status','ASIGNADO'), coalesce(x->>'origen','AUTO'), left(nullif(x->>'motivo',''), 200), nullif(x->>'bloque',''), nullif(x->>'hasta_fecha','')::date,
              coalesce((x->>'orden')::integer, i), quien);
    end loop;
  exception
    when check_violation then raise exception 'descansos: dato no válido en el cuadro (día 0–6, status u origen)' using errcode = '23514';
    when unique_violation then raise exception 'descansos: una persona aparece dos veces en el cuadro' using errcode = '23505';
    when foreign_key_violation then raise exception 'descansos: un equipo del cuadro no existe' using errcode = 'P0002';
  end;
  update public.descansos_semana set estado = 'PROPUESTA', semilla = coalesce((p->>'semilla')::integer, 0), version = version + 1,
    generado_por = quien, generado_en = now(), publicado_por = null, publicado_en = null, actualizado_por = quien, actualizado_en = now()
  where id = s.id returning * into s;
  insert into public.descansos_historial (semana_inicio, turno, accion, antes, despues, usuario, uid)
  values (s.semana_inicio, s.turno, 'sortear', antes, jsonb_build_object('semilla', s.semilla, 'personas', i), quien, (cap->>'uid')::uuid);
  res := to_jsonb(s);
  insert into public.descansos_eventos (client_event_id, resultado) values (ev, res) on conflict do nothing;
  return res;
end $f$;

-- p: { semana, turno, trabajador_id, dia (0–6 | null), motivo, client_event_id } · cambio a mano (no bloquea reglas: la pantalla avisa y queda auditado)
create or replace function public.descansos_mover(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare cap jsonb := glacial_fs.conv_cap(); quien text; s public.descansos_semana; previo public.descansos_asignacion; fila public.descansos_asignacion; ev uuid; res jsonb;
begin
  if not coalesce((cap->>'editar')::boolean, false) then raise exception 'Sin permiso para cambiar los descansos' using errcode = '42501'; end if;
  if coalesce(p->>'client_event_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'descansos: evento no válido' using errcode = '23514'; end if;
  ev := (p->>'client_event_id')::uuid;
  select e.resultado into res from public.descansos_eventos e where e.client_event_id = ev;
  if found then return res; end if;
  if nullif(p->>'dia','') is not null and (p->>'dia')::integer not between 0 and 6 then raise exception 'descansos: día no válido' using errcode = '23514'; end if;
  quien := glacial_fs.cierre_quien();
  s := glacial_fs.desc_semana((p->>'semana')::date, p->>'turno', null);
  if s.id is null then raise exception 'descansos: esa semana no tiene descansos generados' using errcode = 'P0002'; end if;
  select * into previo from public.descansos_asignacion where descansos_semana_id = s.id and trabajador_id = p->>'trabajador_id' for update;
  if not found then raise exception 'descansos: esa persona ya no está en el cuadro (se volvió a sortear)' using errcode = 'P0002'; end if;
  update public.descansos_asignacion set dia = nullif(p->>'dia','')::smallint, status = 'MANUAL', origen = 'MANUAL',
    motivo = left(coalesce(nullif(p->>'motivo',''), 'Cambiado a mano'), 200), actualizado_por = quien, actualizado_en = now(), client_event_id = ev
  where id = previo.id returning * into fila;
  perform glacial_fs.desc_toca(s.id);
  insert into public.descansos_historial (semana_inicio, turno, accion, trabajador_id, antes, despues, usuario, uid)
  values (s.semana_inicio, s.turno, 'mover', fila.trabajador_id, jsonb_build_object('dia', previo.dia, 'status', previo.status), jsonb_build_object('dia', fila.dia, 'motivo', fila.motivo), quien, (cap->>'uid')::uuid);
  select * into s from public.descansos_semana where id = s.id;
  res := jsonb_build_object('semana', to_jsonb(s), 'asignacion', to_jsonb(fila));
  insert into public.descansos_eventos (client_event_id, resultado) values (ev, res) on conflict do nothing;
  return res;
end $f$;

-- p: { semana, turno, estado: PUBLICADA | PROPUESTA }
create or replace function public.descansos_estado(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare cap jsonb := glacial_fs.conv_cap(); quien text := glacial_fs.cierre_quien(); s public.descansos_semana; nuevo text := p->>'estado';
begin
  if not coalesce((cap->>'editar')::boolean, false) then raise exception 'Sin permiso para publicar los descansos' using errcode = '42501'; end if;
  if nuevo not in ('PUBLICADA','PROPUESTA') then raise exception 'descansos: estado no válido' using errcode = '23514'; end if;
  s := glacial_fs.desc_semana((p->>'semana')::date, p->>'turno', null);
  if s.id is null or not exists (select 1 from public.descansos_asignacion where descansos_semana_id = s.id) then raise exception 'descansos: primero genera los descansos de ese turno' using errcode = 'P0002'; end if;
  update public.descansos_semana set estado = nuevo, version = version + 1, actualizado_por = quien, actualizado_en = now(),
    publicado_por = case when nuevo = 'PUBLICADA' then quien else null end, publicado_en = case when nuevo = 'PUBLICADA' then now() else null end
  where id = s.id returning * into s;
  insert into public.descansos_historial (semana_inicio, turno, accion, despues, usuario, uid) values (s.semana_inicio, s.turno, 'estado', jsonb_build_object('estado', nuevo), quien, (cap->>'uid')::uuid);
  return to_jsonb(s);
end $f$;

-- p: { semanas_historial, medico_parcial }
create or replace function public.descansos_config_guardar(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare cap jsonb := glacial_fs.conv_cap(); quien text := glacial_fs.cierre_quien(); c public.descansos_config;
begin
  if not coalesce((cap->>'jefe')::boolean, false) then raise exception 'Solo el Administrador o Jefatura cambia la configuración de descansos' using errcode = '42501'; end if;
  update public.descansos_config set semanas_historial = coalesce((p->>'semanas_historial')::integer, semanas_historial), medico_parcial = coalesce((p->>'medico_parcial')::boolean, medico_parcial),
    actualizado_por = quien, actualizado_en = now() where id = 1 returning * into c;
  insert into public.descansos_historial (accion, despues, usuario, uid) values ('config', to_jsonb(c), quien, (cap->>'uid')::uuid);
  return to_jsonb(c);
exception when check_violation then raise exception 'descansos: semanas de historial entre 1 y 26' using errcode = '23514';
end $f$;

-- p: { id, minimo_descanso, minimo_por_dia ([7] | null), dias_sin_operar ([0–6]) }
create or replace function public.equipo_descanso_guardar(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare cap jsonb := glacial_fs.conv_cap(); quien text := glacial_fs.cierre_quien(); e public.equipos_trabajo;
begin
  if not coalesce((cap->>'jefe')::boolean, false) then raise exception 'Solo el Administrador o Jefatura cambia los mínimos' using errcode = '42501'; end if;
  update public.equipos_trabajo set
    minimo_descanso = nullif(p->>'minimo_descanso','')::integer,
    minimo_por_dia = case when jsonb_typeof(p->'minimo_por_dia') = 'array' then p->'minimo_por_dia' else null end,
    dias_sin_operar = coalesce((select array_agg(distinct v::smallint order by v::smallint) from jsonb_array_elements_text(coalesce(p->'dias_sin_operar','[]'::jsonb)) v), '{}'),
    actualizado_por = quien, actualizado_en = now()
  where id = p->>'id' returning * into e;
  if e.id is null then raise exception 'descansos: el equipo no existe' using errcode = 'P0002'; end if;
  insert into public.descansos_historial (accion, despues, usuario, uid) values ('equipo', jsonb_build_object('id', e.id, 'minimo_descanso', e.minimo_descanso, 'minimo_por_dia', e.minimo_por_dia, 'dias_sin_operar', e.dias_sin_operar), quien, (cap->>'uid')::uuid);
  return to_jsonb(e);
exception when check_violation then raise exception 'descansos: mínimos entre 0 y 500, 7 valores por día y días de 0 (lunes) a 6 (domingo)' using errcode = '23514';
end $f$;

revoke all on function public.descansos_obtener(date), public.descansos_guardar(jsonb), public.descansos_mover(jsonb), public.descansos_estado(jsonb),
  public.descansos_config_guardar(jsonb), public.equipo_descanso_guardar(jsonb) from public, anon;
grant execute on function public.descansos_obtener(date), public.descansos_guardar(jsonb), public.descansos_mover(jsonb), public.descansos_estado(jsonb),
  public.descansos_config_guardar(jsonb), public.equipo_descanso_guardar(jsonb) to authenticated;
