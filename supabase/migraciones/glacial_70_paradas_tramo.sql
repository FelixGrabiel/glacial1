-- GLACIAL · glacial_70 · PARADAS POR MARCA (TRAMO) + TIEMPO REAL DEL CIERRE DE TURNO (26/11/2026)      *** APLICADA en PRUEBAS (26/11/2026) · NO en PRODUCCIÓN ***
--
-- Qué hace (docs/produccion/cierre-turno.md › «Paradas por marca»)
--  1) public.paradas_tramo: constancia de a qué TRAMO (marca de la Secuencia del turno) pertenece cada parada del turno. Las paradas siguen viviendo
--     donde estaban (sync/avancesTurno.paradasOperativas y los cuadros de Nuevo registro): análisis, semáforo y reportes no cambian. Aquí queda:
--     asignación AUTO (por hora) | MANUAL (la eligió el supervisor) | PENDIENTE (sin hora y sin marca: bloquea el envío), partes de una parada que
--     cruza la hora de corte (parada_padre_id), si es cambio de formato, si se agregó con la marca ya cerrada (tras_cierre), quién y cuándo.
--     Idempotencia: client_event_id único (el reintento de la misma acción devuelve lo mismo) y una fila por parada (dos equipos = una parada).
--  2) public.cierre_tramos: resumen de paradas CONGELADO al cerrar la marca (minutos del tramo, programadas, no programadas, cambio, horas efectivas,
--     producción y ratio) y la casilla obligatoria «Revisé las paradas de esta marca». Si después se agrega una parada olvidada, el resumen se recalcula
--     y queda constancia (paradas_recalculadas_por / _en).
--  3) Reglas nuevas en el servidor (además de las de glacial_69):
--       · cerrar una marca exige paradas_revisadas = true;
--       · enviar el cierre de turno se rechaza si hay paradas PENDIENTES de asignar (las que informa la pantalla y las guardadas aquí);
--       · con el turno ya enviado, asignar o mover paradas solo lo hace el Administrador o Jefatura (misma regla que reabrir).
--  4) Tiempo real: cierre_tramos, cierres_turno y paradas_tramo entran en la publicación supabase_realtime con una política de SOLO LECTURA para quien
--     ve el resumen (ctx.resumen). Escribir sigue siendo solo por las funciones (no hay políticas de insert/update/delete). Son tablas pequeñas
--     (pocas filas por turno): no repiten el problema de glacial_51.
--
-- Funciones (security definer):
--   public.paradas_tramo_listar(p_linea, p_fecha, p_turno)  → [filas]                    requiere ctx.resumen
--   public.parada_tramo_asignar(p jsonb)                     → la fila                     requiere ctx.opera
--   public.parada_tramo_partir(p jsonb)                      → [partes]                    requiere ctx.opera
--   public.cierre_tramo_cerrar(p jsonb)  (reemplaza la de glacial_69: exige paradas_revisadas y guarda el resumen)
--   public.cierre_turno_enviar(p jsonb)  (reemplaza la de glacial_69: rechaza paradas pendientes)
-- Errores: 42501 sin permiso · 23514 regla («cierre: …» / «paradas: …») · 23505 duplicado.
-- ORDEN: PRUEBAS (mvxjopvnnagqytegtexi) primero; PRODUCCIÓN (ehtbwmvwoxcdefvlxttu) solo con aprobación del dueño. Requiere glacial_69. Se puede ejecutar más de una vez.
-- Marcha atrás (deja glacial_69 como estaba):
--   alter publication supabase_realtime drop table public.cierre_tramos, public.cierres_turno, public.paradas_tramo;
--   drop policy lectura on public.cierre_tramos; drop policy lectura on public.cierres_turno; revoke select on public.cierre_tramos, public.cierres_turno from authenticated;
--   drop function public.paradas_tramo_listar(text,date,text), public.parada_tramo_asignar(jsonb), public.parada_tramo_partir(jsonb), glacial_fs.parada_tramo_error(jsonb);
--   drop table public.paradas_tramo;
--   alter table public.cierre_tramos drop column minutos_tramo, drop column paradas_prog_min, drop column paradas_noprog_min, drop column paradas_cambio_min,
--     drop column paradas_n, drop column produccion, drop column horas_efectivas, drop column ratio, drop column paradas_revisadas,
--     drop column paradas_recalculadas_en, drop column paradas_recalculadas_por;
--   y volver a ejecutar glacial_69 (restaura cierre_tramo_aplicar, cierre_tramo_cerrar y cierre_turno_enviar originales).

do $c$
begin
  if to_regclass('public.cierre_tramos') is null or to_regclass('public.cierres_turno') is null then
    raise exception 'glacial_70 requiere glacial_69 (cierre_tramos / cierres_turno)';
  end if;
end $c$;

/* ---------- 1) resumen de paradas por marca en cierre_tramos ---------- */
alter table public.cierre_tramos add column if not exists minutos_tramo           integer check (minutos_tramo is null or minutos_tramo >= 0);
alter table public.cierre_tramos add column if not exists paradas_prog_min        integer check (paradas_prog_min is null or paradas_prog_min >= 0);
alter table public.cierre_tramos add column if not exists paradas_noprog_min      integer check (paradas_noprog_min is null or paradas_noprog_min >= 0);
alter table public.cierre_tramos add column if not exists paradas_cambio_min      integer check (paradas_cambio_min is null or paradas_cambio_min >= 0);
alter table public.cierre_tramos add column if not exists paradas_n               integer check (paradas_n is null or paradas_n >= 0);
alter table public.cierre_tramos add column if not exists produccion              integer check (produccion is null or produccion >= 0);
alter table public.cierre_tramos add column if not exists horas_efectivas         numeric(8,2) check (horas_efectivas is null or horas_efectivas >= 0);
alter table public.cierre_tramos add column if not exists ratio                   numeric(12,2) check (ratio is null or ratio >= 0);
alter table public.cierre_tramos add column if not exists paradas_revisadas       boolean not null default false;
alter table public.cierre_tramos add column if not exists paradas_recalculadas_en timestamptz;
alter table public.cierre_tramos add column if not exists paradas_recalculadas_por text;

/* ---------- 2) paradas_tramo ---------- */
create table if not exists public.paradas_tramo (
  linea            text not null check (linea ~ '^[A-Z0-9]{2,10}$'),
  fecha            date not null,
  turno            text not null check (turno in ('DÍA','INTERMEDIO','NOCHE')),
  parada_id        text not null check (char_length(parada_id) between 1 and 120),
  tramo_id         text check (tramo_id is null or char_length(tramo_id) between 1 and 80),
  marca            text,
  presentacion     text,
  descripcion      text check (descripcion is null or char_length(descripcion) <= 200),
  minutos          integer not null check (minutos >= 0 and minutos <= 1440),
  tipo             text not null check (tipo in ('PROGRAMADA','NO_PROGRAMADA')),
  es_cambio        boolean not null default false,
  origen           text not null default 'AVANCE' check (origen in ('AVANCE','REGISTRO')),
  asignacion       text not null check (asignacion in ('AUTO','MANUAL','PENDIENTE')),
  hora_inicio      text check (hora_inicio is null or hora_inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  parada_padre_id  text,
  tras_cierre      boolean not null default false,
  eliminada        boolean not null default false,
  usuario          text,
  uid              uuid,
  client_event_id  uuid not null unique,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  primary key (linea, fecha, turno, parada_id),
  check (asignacion = 'PENDIENTE' or tramo_id is not null)
);
create index if not exists paradas_tramo_turno_idx on public.paradas_tramo (linea, fecha, turno, tramo_id);
create index if not exists paradas_tramo_padre_idx on public.paradas_tramo (linea, fecha, turno, parada_padre_id) where parada_padre_id is not null;

alter table public.paradas_tramo enable row level security;
revoke all on public.paradas_tramo from public, anon, authenticated;
grant all on public.paradas_tramo to service_role;

/* ---------- 3) solo lectura para el tiempo real (quien ve el resumen) ---------- */
do $p$
declare t text;
begin
  foreach t in array array['cierre_tramos','cierres_turno','paradas_tramo'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists lectura on public.%I', t);
    execute format($q$create policy lectura on public.%I for select to authenticated using (coalesce(((select glacial_fs.ctx()) ->> 'resumen')::boolean, false))$q$, t);
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $p$;

/* ---------- reglas puras de una parada: NULL si es válida, o el motivo ---------- */
create or replace function glacial_fs.parada_tramo_error(p jsonb)
returns text language plpgsql immutable set search_path = '' as $f$
begin
  if p is null or jsonb_typeof(p) <> 'object' then return 'pedido vacío'; end if;
  if coalesce(p->>'linea','') !~ '^[A-Z0-9]{2,10}$' then return 'línea no válida'; end if;
  if coalesce(p->>'fecha','') !~ '^\d{4}-\d{2}-\d{2}$' then return 'fecha no válida'; end if;
  if coalesce(p->>'turno','') not in ('DÍA','INTERMEDIO','NOCHE') then return 'turno no válido'; end if;
  if coalesce(p->>'parada_id','') = '' or char_length(p->>'parada_id') > 120 then return 'parada sin id'; end if;
  if coalesce(p->>'tipo','') not in ('PROGRAMADA','NO_PROGRAMADA') then return 'tipo de parada no válido'; end if;
  if jsonb_typeof(p->'minutos') <> 'number' or (p->>'minutos')::numeric < 0 or (p->>'minutos')::numeric > 1440 or (p->>'minutos')::numeric <> trunc((p->>'minutos')::numeric) then return 'minutos: entero entre 0 y 1440'; end if;
  if coalesce(p->>'asignacion','') not in ('AUTO','MANUAL','PENDIENTE') then return 'asignación no válida'; end if;
  if p->>'asignacion' <> 'PENDIENTE' and coalesce(p->>'tramo_id','') = '' then return 'falta la marca (tramo)'; end if;
  if p ? 'hora_inicio' and p->>'hora_inicio' is not null and coalesce(p->>'hora_inicio','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return 'hora de inicio no válida (HH:MM)'; end if;
  if coalesce(p->>'client_event_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return 'evento no válido'; end if;
  return null;
end $f$;

/* ---------- consulta ---------- */
create or replace function public.paradas_tramo_listar(p_linea text, p_fecha date, p_turno text)
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
begin
  if not coalesce((glacial_fs.ctx() ->> 'resumen')::boolean, false) then
    raise exception 'Sin permiso para ver las paradas por marca' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.creado_en) from public.paradas_tramo t
                    where t.linea = p_linea and t.fecha = p_fecha and t.turno = p_turno and not t.eliminada), '[]'::jsonb);
end $f$;

/* ---------- resumen de un tramo cerrado (al agregar una parada olvidada) ---------- */
create or replace function glacial_fs.parada_tramo_resumen(p_linea text, p_fecha date, p_turno text, p_tramo text, r jsonb, quien text)
returns void language plpgsql volatile security definer set search_path = '' as $f$
begin
  if r is null or jsonb_typeof(r) <> 'object' then return; end if;
  update public.cierre_tramos t set
     paradas_prog_min   = coalesce(greatest(0, round((r->>'prog')::numeric))::integer, t.paradas_prog_min),
     paradas_noprog_min = coalesce(greatest(0, round((r->>'noprog')::numeric))::integer, t.paradas_noprog_min),
     paradas_cambio_min = coalesce(greatest(0, round((r->>'cambio')::numeric))::integer, t.paradas_cambio_min),
     paradas_n          = coalesce(greatest(0, round((r->>'n')::numeric))::integer, t.paradas_n),
     horas_efectivas    = coalesce(greatest(0, (r->>'horas')::numeric), t.horas_efectivas),
     ratio              = case when r ? 'ratio' and jsonb_typeof(r->'ratio') = 'number' then greatest(0, (r->>'ratio')::numeric) else t.ratio end,
     paradas_recalculadas_en = now(), paradas_recalculadas_por = quien, actualizado_en = now()
   where t.linea = p_linea and t.fecha = p_fecha and t.turno = p_turno and t.tramo_id = p_tramo and t.estado = 'cerrado';
end $f$;
revoke all on function glacial_fs.parada_tramo_resumen(text, date, text, text, jsonb, text) from public, anon, authenticated;

/* ---------- asignar una parada a un tramo (AUTO por hora, MANUAL o PENDIENTE) ---------- */
create or replace function public.parada_tramo_asignar(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare c jsonb := glacial_fs.ctx(); e text; v_fecha date; fila public.paradas_tramo; quien text; cerrado boolean;
begin
  if not coalesce((c ->> 'opera')::boolean, false) then raise exception 'Sin permiso para asignar paradas' using errcode = '42501'; end if;
  e := glacial_fs.parada_tramo_error(p);
  if e is not null then raise exception 'paradas: %', e using errcode = '23514'; end if;
  -- idempotencia: el mismo evento ya aplicado → la misma fila
  select * into fila from public.paradas_tramo t where t.client_event_id = (p->>'client_event_id')::uuid;
  if found then return to_jsonb(fila); end if;
  v_fecha := (p->>'fecha')::date; quien := glacial_fs.cierre_quien();
  if exists (select 1 from public.cierres_turno x where x.linea = p->>'linea' and x.fecha = v_fecha and x.turno = p->>'turno')
     and not (coalesce((c->>'admin')::boolean,false) or coalesce((c->>'jef')::boolean,false)) then
    raise exception 'paradas: el turno ya se envió; solo el Administrador o Jefatura cambia sus paradas' using errcode = '42501';
  end if;
  cerrado := p->>'asignacion' <> 'PENDIENTE' and exists (select 1 from public.cierre_tramos t where t.linea = p->>'linea' and t.fecha = v_fecha and t.turno = p->>'turno' and t.tramo_id = p->>'tramo_id' and t.estado = 'cerrado');
  insert into public.paradas_tramo as t (linea, fecha, turno, parada_id, tramo_id, marca, presentacion, descripcion, minutos, tipo, es_cambio, origen, asignacion, hora_inicio,
                                         parada_padre_id, tras_cierre, eliminada, usuario, uid, client_event_id, creado_en, actualizado_en)
  values (p->>'linea', v_fecha, p->>'turno', p->>'parada_id', nullif(p->>'tramo_id',''), nullif(p->>'marca',''), nullif(p->>'presentacion',''), left(nullif(btrim(coalesce(p->>'descripcion','')),''), 200),
          (p->>'minutos')::integer, p->>'tipo', coalesce((p->>'es_cambio')::boolean, false), case when p->>'origen' = 'REGISTRO' then 'REGISTRO' else 'AVANCE' end,
          p->>'asignacion', nullif(p->>'hora_inicio',''), nullif(p->>'parada_padre_id',''), cerrado, coalesce((p->>'eliminada')::boolean, false),
          quien, (c->>'uid')::uuid, (p->>'client_event_id')::uuid, now(), now())
  on conflict (linea, fecha, turno, parada_id) do update set
     tramo_id = excluded.tramo_id, marca = excluded.marca, presentacion = excluded.presentacion, descripcion = excluded.descripcion, minutos = excluded.minutos,
     tipo = excluded.tipo, es_cambio = excluded.es_cambio, origen = excluded.origen, asignacion = excluded.asignacion, hora_inicio = excluded.hora_inicio,
     parada_padre_id = excluded.parada_padre_id, tras_cierre = t.tras_cierre or excluded.tras_cierre, eliminada = excluded.eliminada,
     usuario = excluded.usuario, uid = excluded.uid, client_event_id = excluded.client_event_id, actualizado_en = now()
  returning * into fila;
  -- parada olvidada en una marca ya cerrada: se recalcula su resumen (queda quién y cuándo)
  if cerrado and p ? 'resumen' then perform glacial_fs.parada_tramo_resumen(p->>'linea', v_fecha, p->>'turno', p->>'tramo_id', p->'resumen', quien); end if;
  return to_jsonb(fila);
end $f$;

/* ---------- partir una parada que cruza la hora de corte (partes enlazadas; el total no cambia) ---------- */
create or replace function public.parada_tramo_partir(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare c jsonb := glacial_fs.ctx(); e text; v_fecha date; total integer; suma integer := 0; parte jsonb; k integer := 0; quien text; existentes jsonb; base jsonb;
begin
  if not coalesce((c ->> 'opera')::boolean, false) then raise exception 'Sin permiso para partir paradas' using errcode = '42501'; end if;
  base := p || jsonb_build_object('asignacion', 'AUTO', 'tramo_id', 'x');
  e := glacial_fs.parada_tramo_error(base);
  if e is null and (jsonb_typeof(p->'partes') <> 'array' or jsonb_array_length(p->'partes') < 2) then e := 'una parada partida tiene al menos dos partes'; end if;
  if e is not null then raise exception 'paradas: %', e using errcode = '23514'; end if;
  v_fecha := (p->>'fecha')::date; total := (p->>'minutos')::integer; quien := glacial_fs.cierre_quien();
  -- idempotencia: el mismo evento → las mismas partes
  if exists (select 1 from public.paradas_tramo x where x.client_event_id = (p->>'client_event_id')::uuid) then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.parada_id), '[]'::jsonb) into existentes from public.paradas_tramo t
     where t.linea = p->>'linea' and t.fecha = v_fecha and t.turno = p->>'turno' and t.parada_padre_id = p->>'parada_id' and not t.eliminada;
    return existentes;
  end if;
  for parte in select * from jsonb_array_elements(p->'partes') loop
    if coalesce(parte->>'tramo_id','') = '' then raise exception 'paradas: cada parte necesita su marca (tramo)' using errcode = '23514'; end if;
    if jsonb_typeof(parte->'minutos') <> 'number' or (parte->>'minutos')::numeric < 0 or (parte->>'minutos')::numeric <> trunc((parte->>'minutos')::numeric) then
      raise exception 'paradas: minutos de cada parte: entero ≥ 0' using errcode = '23514';
    end if;
    suma := suma + (parte->>'minutos')::integer;
  end loop;
  if suma <> total then raise exception 'paradas: las partes suman % min y la parada tiene % min', suma, total using errcode = '23514'; end if;
  if exists (select 1 from public.cierres_turno x where x.linea = p->>'linea' and x.fecha = v_fecha and x.turno = p->>'turno')
     and not (coalesce((c->>'admin')::boolean,false) or coalesce((c->>'jef')::boolean,false)) then
    raise exception 'paradas: el turno ya se envió; solo el Administrador o Jefatura cambia sus paradas' using errcode = '42501';
  end if;
  -- la parada entera deja de contar (si estaba registrada) y se reemplaza por sus partes
  update public.paradas_tramo t set eliminada = true, actualizado_en = now()
   where t.linea = p->>'linea' and t.fecha = v_fecha and t.turno = p->>'turno' and (t.parada_id = p->>'parada_id' or t.parada_padre_id = p->>'parada_id');
  for parte in select * from jsonb_array_elements(p->'partes') loop
    k := k + 1;
    insert into public.paradas_tramo as t (linea, fecha, turno, parada_id, tramo_id, marca, presentacion, descripcion, minutos, tipo, es_cambio, origen, asignacion, hora_inicio,
                                           parada_padre_id, tras_cierre, eliminada, usuario, uid, client_event_id)
    values (p->>'linea', v_fecha, p->>'turno', (p->>'parada_id') || '#' || k, parte->>'tramo_id', nullif(parte->>'marca',''), nullif(parte->>'presentacion',''),
            left(nullif(btrim(coalesce(p->>'descripcion','')),''), 200), (parte->>'minutos')::integer, p->>'tipo', coalesce((p->>'es_cambio')::boolean, false), 'AVANCE', 'AUTO',
            nullif(parte->>'hora_inicio',''), p->>'parada_id',
            exists (select 1 from public.cierre_tramos x where x.linea = p->>'linea' and x.fecha = v_fecha and x.turno = p->>'turno' and x.tramo_id = parte->>'tramo_id' and x.estado = 'cerrado'),
            false, quien, (c->>'uid')::uuid, case when k = 1 then (p->>'client_event_id')::uuid else gen_random_uuid() end)
    on conflict (linea, fecha, turno, parada_id) do update set tramo_id = excluded.tramo_id, marca = excluded.marca, presentacion = excluded.presentacion, minutos = excluded.minutos,
       hora_inicio = excluded.hora_inicio, eliminada = false, usuario = excluded.usuario, client_event_id = excluded.client_event_id, actualizado_en = now();
  end loop;
  return (select jsonb_agg(to_jsonb(t) order by t.parada_id) from public.paradas_tramo t
           where t.linea = p->>'linea' and t.fecha = v_fecha and t.turno = p->>'turno' and t.parada_padre_id = p->>'parada_id' and not t.eliminada);
end $f$;

/* ---------- cierre_tramo_aplicar: igual que glacial_69 + resumen de paradas congelado ---------- */
create or replace function glacial_fs.cierre_tramo_aplicar(p jsonb, quien text, uid uuid)
returns public.cierre_tramos language plpgsql volatile security definer set search_path = '' as $f$
declare e text; fila public.cierre_tramos; previo public.cierre_tramos; v_fecha date; v_orden integer; v_ms timestamptz; pend integer; idx integer; sec jsonb; r jsonb;
begin
  e := glacial_fs.cierre_turno_error(p);
  if e is null and not (p ? 'tramo_id' and p ? 'hora_corte' and p ? 'paletas_acumuladas' and p ? 'saldo_paquetes' and p ? 'secuencia') then e := 'faltan datos del tramo (id, hora de corte, paletas, saldo, secuencia)'; end if;
  if e is null and not coalesce((p->>'paradas_revisadas')::boolean, false) then e := 'marca «Revisé las paradas de esta marca» antes de cerrarla'; end if;
  if e is not null then raise exception 'cierre: %', e using errcode = '23514'; end if;
  v_fecha := (p->>'fecha')::date;
  if exists (select 1 from public.cierres_turno c where c.linea = p->>'linea' and c.fecha = v_fecha and c.turno = p->>'turno') then
    raise exception 'cierre: el turno ya se envió; no se pueden cerrar más marcas' using errcode = '23514';
  end if;
  sec := p->'secuencia';
  select (x.i - 1)::integer into idx from jsonb_array_elements(sec) with ordinality x(v, i) where x.v->>'tramo_id' = p->>'tramo_id';
  if idx is null then raise exception 'cierre: el tramo no está en la secuencia del turno' using errcode = '23514'; end if;
  v_orden := idx + 1;
  select * into fila from public.cierre_tramos t where t.client_event_id = (p->>'client_event_id')::uuid;
  if found then return fila; end if;
  select * into fila from public.cierre_tramos t where t.linea = p->>'linea' and t.fecha = v_fecha and t.turno = p->>'turno' and t.tramo_id = p->>'tramo_id';
  if found and fila.estado = 'cerrado' then raise exception 'cierre: la marca % ya está cerrada', fila.marca using errcode = '23505'; end if;
  select count(*) into pend from jsonb_array_elements(sec) with ordinality x(v, i)
   where x.i <= idx and not exists (select 1 from public.cierre_tramos t where t.linea = p->>'linea' and t.fecha = v_fecha and t.turno = p->>'turno' and t.tramo_id = x.v->>'tramo_id' and t.estado = 'cerrado');
  if pend > 0 then raise exception 'cierre: primero cierra la marca anterior de la secuencia' using errcode = '23514'; end if;
  v_ms := (v_fecha::text || ' ' || (p->>'hora_corte') || ':00')::timestamp at time zone 'America/Lima';
  if p->>'turno' = 'NOCHE' and (p->>'hora_corte') < '12:00' then v_ms := v_ms + interval '1 day'; end if;
  select * into previo from public.cierre_tramos t where t.linea = p->>'linea' and t.fecha = v_fecha and t.turno = p->>'turno' and t.estado = 'cerrado' order by t.orden desc limit 1;
  if found and previo.cerrado_en is not null and v_ms < previo.cerrado_en - interval '1 minute' then
    raise exception 'cierre: la hora de corte (%) es anterior al corte de % (%)', p->>'hora_corte', previo.marca, previo.hora_corte using errcode = '23514';
  end if;
  r := case when jsonb_typeof(p->'resumen') = 'object' then p->'resumen' else '{}'::jsonb end;
  insert into public.cierre_tramos as t (linea, fecha, turno, tramo_id, orden, marca, presentacion, estado, hora_corte, cerrado_en, paletas_acumuladas, paletas_tramo, saldo_paquetes,
                                         cerrado_por, cerrado_uid, client_event_id, actualizado_en,
                                         minutos_tramo, paradas_prog_min, paradas_noprog_min, paradas_cambio_min, paradas_n, produccion, horas_efectivas, ratio, paradas_revisadas)
  values (p->>'linea', v_fecha, p->>'turno', p->>'tramo_id', v_orden, sec->idx->>'marca', sec->idx->>'presentacion', 'cerrado', p->>'hora_corte', v_ms,
          (p->>'paletas_acumuladas')::integer, greatest(0, coalesce((p->>'paletas_tramo')::numeric, (p->>'paletas_acumuladas')::numeric))::integer, (p->>'saldo_paquetes')::integer,
          quien, uid, (p->>'client_event_id')::uuid, now(),
          greatest(0, round((r->>'minutos')::numeric))::integer, greatest(0, round((r->>'prog')::numeric))::integer, greatest(0, round((r->>'noprog')::numeric))::integer,
          greatest(0, round((r->>'cambio')::numeric))::integer, greatest(0, round((r->>'n')::numeric))::integer, greatest(0, round((r->>'produccion')::numeric))::integer,
          greatest(0, (r->>'horas')::numeric), case when jsonb_typeof(r->'ratio') = 'number' then greatest(0, (r->>'ratio')::numeric) end, true)
  on conflict (linea, fecha, turno, tramo_id) do update set orden = excluded.orden, marca = excluded.marca, presentacion = excluded.presentacion, estado = 'cerrado',
     hora_corte = excluded.hora_corte, cerrado_en = excluded.cerrado_en, paletas_acumuladas = excluded.paletas_acumuladas, paletas_tramo = excluded.paletas_tramo,
     saldo_paquetes = excluded.saldo_paquetes, cerrado_por = excluded.cerrado_por, cerrado_uid = excluded.cerrado_uid, client_event_id = excluded.client_event_id, actualizado_en = now(),
     minutos_tramo = excluded.minutos_tramo, paradas_prog_min = excluded.paradas_prog_min, paradas_noprog_min = excluded.paradas_noprog_min, paradas_cambio_min = excluded.paradas_cambio_min,
     paradas_n = excluded.paradas_n, produccion = excluded.produccion, horas_efectivas = excluded.horas_efectivas, ratio = excluded.ratio, paradas_revisadas = true,
     paradas_recalculadas_en = null, paradas_recalculadas_por = null
  returning * into fila;
  return fila;
end $f$;
revoke all on function glacial_fs.cierre_tramo_aplicar(jsonb, text, uuid) from public, anon, authenticated;

/* ---------- enviar: igual que glacial_69 + sin paradas pendientes de asignar ---------- */
create or replace function public.cierre_turno_enviar(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare c jsonb := glacial_fs.ctx(); e text; v_fecha date; ex public.cierres_turno; sec jsonb; n integer; ult jsonb; faltan integer; quien text; res jsonb; tot_p integer; tot_s integer; pend_srv integer;
begin
  if not coalesce((c ->> 'opera')::boolean, false) then raise exception 'Sin permiso para enviar el cierre de turno' using errcode = '42501'; end if;
  e := glacial_fs.cierre_turno_error(p);
  if e is null and not (p ? 'client_event_id' and p ? 'secuencia') then e := 'faltan el evento o la secuencia'; end if;
  if e is null and coalesce((p->>'pendientes')::numeric, 0) > 0 then e := 'hay registros de paletas sin subir en el equipo: espera a que se sincronicen'; end if;
  if e is null and p ? 'observaciones' and char_length(coalesce(p->>'observaciones','')) > 1000 then e := 'observaciones: máximo 1000 caracteres'; end if;
  if e is not null then raise exception 'cierre: %', e using errcode = '23514'; end if;
  v_fecha := (p->>'fecha')::date; sec := p->'secuencia'; n := jsonb_array_length(sec); quien := glacial_fs.cierre_quien();
  select * into ex from public.cierres_turno x where x.linea = p->>'linea' and x.fecha = v_fecha and x.turno = p->>'turno';
  if found then
    if ex.client_event_id = (p->>'client_event_id')::uuid then return to_jsonb(ex); end if;
    raise exception 'cierre: este turno ya se envió (% · %)', coalesce(ex.closed_by,'—'), to_char(ex.closed_at at time zone 'America/Lima','DD/MM HH24:MI') using errcode = '23505';
  end if;
  -- paradas sin marca: las que informa la pantalla y las registradas aquí como PENDIENTE
  select count(*) into pend_srv from public.paradas_tramo t where t.linea = p->>'linea' and t.fecha = v_fecha and t.turno = p->>'turno' and t.asignacion = 'PENDIENTE' and not t.eliminada;
  if coalesce((p->>'paradas_pendientes')::numeric, 0) > 0 or pend_srv > 0 then
    raise exception 'cierre: hay % parada(s) sin marca: asígnalas antes de enviar', greatest(coalesce((p->>'paradas_pendientes')::integer, 0), pend_srv) using errcode = '23514';
  end if;
  select count(*) into faltan from jsonb_array_elements(sec) with ordinality x(v, i)
   where x.i < n and not exists (select 1 from public.cierre_tramos t where t.linea = p->>'linea' and t.fecha = v_fecha and t.turno = p->>'turno' and t.tramo_id = x.v->>'tramo_id' and t.estado = 'cerrado');
  if faltan > 0 then raise exception 'cierre: faltan % marca(s) por cerrar antes de enviar', faltan using errcode = '23514'; end if;
  if not exists (select 1 from public.cierre_tramos t where t.linea = p->>'linea' and t.fecha = v_fecha and t.turno = p->>'turno' and t.tramo_id = sec->(n-1)->>'tramo_id' and t.estado = 'cerrado') then
    if not (p ? 'ultimo') or jsonb_typeof(p->'ultimo') <> 'object' then raise exception 'cierre: falta cerrar la última marca (saldo y paletas)' using errcode = '23514'; end if;
    ult := (p->'ultimo') || jsonb_build_object('linea', p->>'linea', 'fecha', p->>'fecha', 'turno', p->>'turno', 'secuencia', sec, 'tramo_id', sec->(n-1)->>'tramo_id');
    if not (ult ? 'client_event_id') then ult := ult || jsonb_build_object('client_event_id', gen_random_uuid()); end if;
    perform glacial_fs.cierre_tramo_aplicar(ult, quien, (c->>'uid')::uuid);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('orden', t.orden, 'tramo_id', t.tramo_id, 'marca', t.marca, 'presentacion', t.presentacion, 'hora_corte', t.hora_corte,
           'paletas', t.paletas_tramo, 'paletas_acumuladas', t.paletas_acumuladas, 'saldo_paquetes', t.saldo_paquetes, 'cerrado_por', t.cerrado_por,
           'minutos_tramo', t.minutos_tramo, 'paradas_prog_min', t.paradas_prog_min, 'paradas_noprog_min', t.paradas_noprog_min, 'paradas_cambio_min', t.paradas_cambio_min,
           'produccion', t.produccion, 'horas_efectivas', t.horas_efectivas, 'ratio', t.ratio) order by t.orden), '[]'::jsonb),
         coalesce(sum(t.paletas_tramo), 0), coalesce(sum(t.saldo_paquetes), 0)
    into res, tot_p, tot_s
    from public.cierre_tramos t
   where t.linea = p->>'linea' and t.fecha = v_fecha and t.turno = p->>'turno' and t.estado = 'cerrado'
     and t.tramo_id in (select x.v->>'tramo_id' from jsonb_array_elements(sec) x(v));
  insert into public.cierres_turno (linea, fecha, turno, closed_at, closed_by, closed_uid, resumen, total_paletas, total_saldo, tramos, observaciones, sync_estado, client_event_id, capturado_en)
  values (p->>'linea', v_fecha, p->>'turno', now(), quien, (c->>'uid')::uuid, res, tot_p, tot_s, n, nullif(btrim(coalesce(p->>'observaciones','')), ''),
          case when coalesce((p->>'offline')::boolean, false) then 'pendiente' else 'sincronizado' end, (p->>'client_event_id')::uuid,
          case when coalesce(p->>'capturado_en','') ~ '^\d{4}-\d{2}-\d{2}T' then (p->>'capturado_en')::timestamptz else null end)
  returning * into ex;
  return to_jsonb(ex);
end $f$;

revoke all on function public.paradas_tramo_listar(text, date, text) from public, anon;
revoke all on function public.parada_tramo_asignar(jsonb) from public, anon;
revoke all on function public.parada_tramo_partir(jsonb) from public, anon;
revoke all on function public.cierre_turno_enviar(jsonb) from public, anon;
grant execute on function public.paradas_tramo_listar(text, date, text) to authenticated;
grant execute on function public.parada_tramo_asignar(jsonb) to authenticated;
grant execute on function public.parada_tramo_partir(jsonb) to authenticated;
grant execute on function public.cierre_turno_enviar(jsonb) to authenticated;
