-- GLACIAL · glacial_74 · DESCANSOS: APOYO ENTRE EQUIPOS (28/11/2026)      *** APLICADA en PRUEBAS (28/11/2026) · PRODUCCIÓN: pendiente de aprobación ***
--
-- Qué hace (docs/personal-tareo/descansos-automaticos.md › Apoyo entre equipos)
--   Si a un equipo le falta gente un día por los descansos, alguien de otro equipo del MISMO turno y MISMO horario que ese día tiene gente de sobra pasa
--   a apoyarlo. El sorteo lo propone (automático) y el supervisor lo puede quitar o cambiar. Al publicar, el Tareo pone a esa persona ese día en el equipo
--   que apoya.
--   · public.descansos_apoyo: persona, equipo de origen (desde_equipo), equipo que apoya (a_equipo), día (0–6), origen AUTO | MANUAL, quién y cuándo.
--   · descansos_obtener devuelve también los apoyos (de la semana y del historial no hace falta).
--   · descansos_guardar acepta p.apoyos (el sorteo los reemplaza junto con los descansos).
--   · descansos_mover borra el apoyo de esa persona en el día en que ahora descansa.
--   · public.descansos_apoyo_cambiar(p): poner | quitar un apoyo (idempotente por client_event_id, auditado).
--   Reglas que valida el servidor: los dos equipos existen, son de la misma columna y tienen el mismo horario; la persona trabaja ese día (no descansa).
-- ORDEN: requiere glacial_73. PRUEBAS (mvxjopvnnagqytegtexi) primero; PRODUCCIÓN (ehtbwmvwoxcdefvlxttu) solo con aprobación. Se puede ejecutar más de una vez.
-- Marcha atrás:
--   alter publication supabase_realtime drop table public.descansos_apoyo;
--   drop function public.descansos_apoyo_cambiar(jsonb), glacial_fs.desc_apoyo_valido(text, text);
--   drop table public.descansos_apoyo;   -- y volver a ejecutar glacial_73 para restaurar descansos_obtener / guardar / mover sin apoyos

do $c$
begin
  if to_regclass('public.descansos_semana') is null then raise exception 'glacial_74 requiere glacial_73 (descansos automáticos)'; end if;
end $c$;

create table if not exists public.descansos_apoyo (
  id                   bigserial primary key,
  descansos_semana_id  uuid not null references public.descansos_semana(id) on delete cascade,
  trabajador_id        text not null check (char_length(trabajador_id) between 1 and 80),
  nombre               text check (nombre is null or char_length(nombre) <= 120),
  desde_equipo         text not null references public.equipos_trabajo(id),
  a_equipo             text not null references public.equipos_trabajo(id),
  dia                  smallint not null check (dia between 0 and 6),
  origen               text not null default 'AUTO' check (origen in ('AUTO','MANUAL')),
  actualizado_por      text,
  actualizado_en       timestamptz not null default now(),
  client_event_id      uuid unique,
  check (desde_equipo <> a_equipo),
  unique (descansos_semana_id, trabajador_id, dia)
);
create index if not exists descansos_apoyo_semana on public.descansos_apoyo (descansos_semana_id);

do $p$
begin
  alter table public.descansos_apoyo enable row level security;
  revoke all on public.descansos_apoyo from public, anon, authenticated;
  grant all on public.descansos_apoyo to service_role;
  grant select on public.descansos_apoyo to authenticated;
  drop policy if exists lectura on public.descansos_apoyo;
  create policy lectura on public.descansos_apoyo for select to authenticated using (coalesce(((select glacial_fs.conv_cap()) ->> 'ver')::boolean, false));
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'descansos_apoyo') then
    alter publication supabase_realtime add table public.descansos_apoyo;
  end if;
end $p$;
revoke all on sequence public.descansos_apoyo_id_seq from public, anon, authenticated;

/* mismo turno (columna) y mismo horario, equipos distintos y activos */
create or replace function glacial_fs.desc_apoyo_valido(p_desde text, p_a text)
returns boolean language sql stable security definer set search_path = '' as $f$
  select exists (select 1 from public.equipos_trabajo d, public.equipos_trabajo a
                 where d.id = p_desde and a.id = p_a and d.id <> a.id and d.activo and a.activo
                   and d.columna = a.columna and d.hora_inicio = a.hora_inicio and d.hora_fin = a.hora_fin);
$f$;
revoke all on function glacial_fs.desc_apoyo_valido(text, text) from public, anon, authenticated;

/* ---------- lectura: + apoyos ---------- */
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
    'apoyos', coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object('turno', s.turno) order by s.turno, x.dia, x.id)
                        from public.descansos_apoyo x join public.descansos_semana s on s.id = x.descansos_semana_id where s.semana_inicio = p_semana), '[]'::jsonb),
    'historial', coalesce((select jsonb_agg(jsonb_build_object('semana', s.semana_inicio, 'turno', s.turno,
                              'asignaciones', coalesce((select jsonb_agg(jsonb_build_object('trabajador_id', a.trabajador_id, 'dia', a.dia)) from public.descansos_asignacion a where a.descansos_semana_id = s.id), '[]'::jsonb)))
                           from public.descansos_semana s where s.estado = 'PUBLICADA' and s.semana_inicio < p_semana and s.semana_inicio >= p_semana - 7 * n), '[]'::jsonb),
    'equipos', coalesce((select jsonb_agg(to_jsonb(e) order by e.orden, e.id) from public.equipos_trabajo e), '[]'::jsonb));
end $f$;

/* ---------- sorteo: + apoyos ---------- */
create or replace function public.descansos_guardar(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare cap jsonb := glacial_fs.conv_cap(); quien text; s public.descansos_semana; ev uuid; res jsonb; x jsonb; i integer := 0; k integer := 0; antes jsonb;
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
  delete from public.descansos_apoyo where descansos_semana_id = s.id;
  delete from public.descansos_asignacion where descansos_semana_id = s.id;
  begin
    for x in select * from jsonb_array_elements(p->'asignaciones') loop
      i := i + 1;
      insert into public.descansos_asignacion (descansos_semana_id, trabajador_id, nombre, equipo_id, dia, status, origen, motivo, bloque, hasta_fecha, orden, actualizado_por)
      values (s.id, x->>'trabajador_id', left(nullif(x->>'nombre',''), 120), nullif(x->>'equipo_id',''), nullif(x->>'dia','')::smallint,
              coalesce(x->>'status','ASIGNADO'), coalesce(x->>'origen','AUTO'), left(nullif(x->>'motivo',''), 200), nullif(x->>'bloque',''), nullif(x->>'hasta_fecha','')::date,
              coalesce((x->>'orden')::integer, i), quien);
    end loop;
    for x in select * from jsonb_array_elements(coalesce(p->'apoyos', '[]'::jsonb)) loop
      if not glacial_fs.desc_apoyo_valido(x->>'desde_equipo', x->>'a_equipo') then raise exception 'descansos: un apoyo no es entre equipos del mismo turno y horario' using errcode = '22023'; end if;
      k := k + 1;
      insert into public.descansos_apoyo (descansos_semana_id, trabajador_id, nombre, desde_equipo, a_equipo, dia, origen, actualizado_por)
      values (s.id, x->>'trabajador_id', left(nullif(x->>'nombre',''), 120), x->>'desde_equipo', x->>'a_equipo', (x->>'dia')::smallint, coalesce(x->>'origen','AUTO'), quien);
    end loop;
  exception
    when check_violation then raise exception 'descansos: dato no válido en el cuadro (día 0–6, status u origen)' using errcode = '23514';
    when unique_violation then raise exception 'descansos: una persona aparece dos veces en el cuadro (o dos apoyos el mismo día)' using errcode = '23505';
    when foreign_key_violation then raise exception 'descansos: un equipo del cuadro no existe' using errcode = 'P0002';
    when sqlstate '22023' then raise exception 'descansos: un apoyo no es entre equipos del mismo turno y horario' using errcode = '23514';
  end;
  update public.descansos_semana set estado = 'PROPUESTA', semilla = coalesce((p->>'semilla')::integer, 0), version = version + 1,
    generado_por = quien, generado_en = now(), publicado_por = null, publicado_en = null, actualizado_por = quien, actualizado_en = now()
  where id = s.id returning * into s;
  insert into public.descansos_historial (semana_inicio, turno, accion, antes, despues, usuario, uid)
  values (s.semana_inicio, s.turno, 'sortear', antes, jsonb_build_object('semilla', s.semilla, 'personas', i, 'apoyos', k), quien, (cap->>'uid')::uuid);
  res := to_jsonb(s);
  insert into public.descansos_eventos (client_event_id, resultado) values (ev, res) on conflict do nothing;
  return res;
end $f$;

/* ---------- cambio a mano: además borra el apoyo de esa persona en el día en que ahora descansa ---------- */
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
  if fila.dia is not null then delete from public.descansos_apoyo where descansos_semana_id = s.id and trabajador_id = fila.trabajador_id and dia = fila.dia; end if;
  perform glacial_fs.desc_toca(s.id);
  insert into public.descansos_historial (semana_inicio, turno, accion, trabajador_id, antes, despues, usuario, uid)
  values (s.semana_inicio, s.turno, 'mover', fila.trabajador_id, jsonb_build_object('dia', previo.dia, 'status', previo.status), jsonb_build_object('dia', fila.dia, 'motivo', fila.motivo), quien, (cap->>'uid')::uuid);
  select * into s from public.descansos_semana where id = s.id;
  res := jsonb_build_object('semana', to_jsonb(s), 'asignacion', to_jsonb(fila));
  insert into public.descansos_eventos (client_event_id, resultado) values (ev, res) on conflict do nothing;
  return res;
end $f$;

/* ---------- poner / quitar un apoyo ----------
   p: { semana, turno, accion: poner | quitar, trabajador_id, nombre, dia, desde_equipo, a_equipo, origen (AUTO | MANUAL), client_event_id } */
create or replace function public.descansos_apoyo_cambiar(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare cap jsonb := glacial_fs.conv_cap(); quien text; s public.descansos_semana; fila public.descansos_apoyo; ev uuid; res jsonb; acc text := coalesce(p->>'accion',''); d integer;
begin
  if not coalesce((cap->>'editar')::boolean, false) then raise exception 'Sin permiso para cambiar los apoyos' using errcode = '42501'; end if;
  if coalesce(p->>'client_event_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'descansos: evento no válido' using errcode = '23514'; end if;
  ev := (p->>'client_event_id')::uuid;
  select e.resultado into res from public.descansos_eventos e where e.client_event_id = ev;
  if found then return res; end if;
  d := nullif(p->>'dia','')::integer;
  if d is null or d not between 0 and 6 then raise exception 'descansos: día no válido' using errcode = '23514'; end if;
  quien := glacial_fs.cierre_quien();
  s := glacial_fs.desc_semana((p->>'semana')::date, p->>'turno', null);
  if s.id is null then raise exception 'descansos: esa semana no tiene descansos generados' using errcode = 'P0002'; end if;
  if acc = 'poner' then
    if not glacial_fs.desc_apoyo_valido(p->>'desde_equipo', p->>'a_equipo') then raise exception 'descansos: solo apoya un equipo del mismo turno y horario' using errcode = '23514'; end if;
    if not exists (select 1 from public.descansos_asignacion where descansos_semana_id = s.id and trabajador_id = p->>'trabajador_id' and equipo_id = p->>'desde_equipo') then
      raise exception 'descansos: esa persona no está en ese equipo esta semana' using errcode = 'P0002'; end if;
    if exists (select 1 from public.descansos_asignacion where descansos_semana_id = s.id and trabajador_id = p->>'trabajador_id' and dia = d) then
      raise exception 'descansos: esa persona descansa ese día' using errcode = '23514'; end if;
    insert into public.descansos_apoyo as t (descansos_semana_id, trabajador_id, nombre, desde_equipo, a_equipo, dia, origen, actualizado_por, client_event_id)
    values (s.id, p->>'trabajador_id', left(nullif(p->>'nombre',''), 120), p->>'desde_equipo', p->>'a_equipo', d, case when p->>'origen' = 'AUTO' then 'AUTO' else 'MANUAL' end, quien, ev)
    on conflict (descansos_semana_id, trabajador_id, dia) do update set a_equipo = excluded.a_equipo, desde_equipo = excluded.desde_equipo, origen = excluded.origen,
      actualizado_por = excluded.actualizado_por, actualizado_en = now(), client_event_id = excluded.client_event_id
    returning * into fila;
  elsif acc = 'quitar' then
    delete from public.descansos_apoyo where descansos_semana_id = s.id and trabajador_id = p->>'trabajador_id' and dia = d returning * into fila;
  else
    raise exception 'descansos: acción no válida' using errcode = '23514';
  end if;
  perform glacial_fs.desc_toca(s.id);
  insert into public.descansos_historial (semana_inicio, turno, accion, trabajador_id, antes, despues, usuario, uid)
  values (s.semana_inicio, s.turno, 'apoyo_' || acc, p->>'trabajador_id', case when acc = 'quitar' then to_jsonb(fila) end, case when acc = 'poner' then to_jsonb(fila) end, quien, (cap->>'uid')::uuid);
  select * into s from public.descansos_semana where id = s.id;
  res := jsonb_build_object('semana', to_jsonb(s), 'apoyo', to_jsonb(fila));
  insert into public.descansos_eventos (client_event_id, resultado) values (ev, res) on conflict do nothing;
  return res;
end $f$;

revoke all on function public.descansos_apoyo_cambiar(jsonb) from public, anon;
grant execute on function public.descansos_apoyo_cambiar(jsonb) to authenticated;
