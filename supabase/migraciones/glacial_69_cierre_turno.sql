-- GLACIAL · glacial_69 · CIERRE PROGRESIVO DE MARCAS Y CIERRE DE TURNO CONSOLIDADO (27/11/2026)      *** NUEVA · NO APLICADA EN PRODUCCIÓN ***
--
-- Qué hace (docs/produccion/cierre-turno.md)
--  1) public.cierre_tramos: una fila por TRAMO de la «Secuencia del turno» (línea + fecha + turno + id del tramo). Estado 'abierto' | 'cerrado', hora de corte real,
--     instante del cierre, paletas completas ACUMULADAS al cerrar (congeladas) y las del tramo, saldo en paquetes, quién lo cerró y el evento del equipo (idempotencia).
--  2) public.cierres_turno: el CIERRE DE TURNO CONSOLIDADO (uno por línea + fecha + turno): closed_at, closed_by, resumen de paletas y saldos por tramo, totales,
--     observaciones y estado de sincronización.
--  3) RLS activada y SIN políticas; sin permisos para anon ni authenticated sobre las tablas: la página solo usa estas funciones (security definer):
--       public.cierre_turno_listar(p_linea, p_fecha, p_turno)  → {tramos:[…], cierre:{…}|null}       requiere ctx.resumen
--       public.cierre_tramo_cerrar(p jsonb)                      → la fila del tramo cerrado            requiere ctx.opera
--       public.cierre_tramo_reabrir(p_linea,p_fecha,p_turno,p_tramo_id,p_motivo)                       requiere ctx.opera; Administrador o Jefatura si el turno ya se envió
--       public.cierre_turno_enviar(p jsonb)                      → el cierre consolidado                requiere ctx.opera
--  4) Integridad (glacial_fs.cierre_turno_error, se prueba en supabase/pruebas/cierre_turno.sql):
--       · un tramo se cierra EN ORDEN: todos los tramos anteriores de la secuencia deben estar cerrados;
--       · la hora de corte no puede ser anterior a la del tramo cerrado antes (en el turno noche se compara con el instante real, cruza la medianoche);
--       · paletas y saldo: enteros ≥ 0; no se cierra un tramo de un turno ya enviado;
--       · el envío exige TODOS los tramos cerrados excepto el último, que se cierra en el mismo envío (o ya está cerrado), y 0 registros pendientes en el equipo;
--       · un turno se envía una sola vez: reenviar el MISMO evento devuelve el mismo cierre (respuesta perdida = reintento inofensivo); otro evento → error.
--  5) No toca sync/paletas, sync/programaciones ni los snapshots de Avance y cierre: los lee la página; aquí queda el registro firme del cierre.
--
-- Errores: 42501 sin permiso · 23514 regla de integridad (mensaje «cierre: …») · 23505 ya cerrado / ya enviado por otro evento.
-- ORDEN: PRUEBAS (mvxjopvnnagqytegtexi) primero; PRODUCCIÓN (ehtbwmvwoxcdefvlxttu) solo con aprobación del dueño. Se puede ejecutar más de una vez.
-- Marcha atrás: drop function public.cierre_turno_enviar(jsonb), public.cierre_tramo_cerrar(jsonb), public.cierre_tramo_reabrir(text,date,text,text,text),
--   public.cierre_turno_listar(text,date,text), glacial_fs.cierre_turno_error(jsonb); drop table public.cierres_turno, public.cierre_tramos;

do $c$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'glacial_fs' and p.proname = 'ctx';
  if def is null or position('''opera''' in def) = 0 or position('''resumen''' in def) = 0 then
    raise exception 'glacial_fs.ctx no tiene las marcas opera / resumen';
  end if;
end $c$;

/* ---------- tablas ---------- */
create table if not exists public.cierre_tramos (
  linea              text not null check (linea ~ '^[A-Z0-9]{2,10}$'),
  fecha              date not null,
  turno              text not null check (turno in ('DÍA','INTERMEDIO','NOCHE')),
  tramo_id           text not null check (char_length(tramo_id) between 1 and 80),
  orden              integer not null check (orden >= 1 and orden <= 99),
  marca              text not null check (char_length(btrim(marca)) between 1 and 80),
  presentacion       text not null check (char_length(btrim(presentacion)) between 1 and 120),
  estado             text not null default 'abierto' check (estado in ('abierto','cerrado')),
  hora_corte         text check (hora_corte is null or hora_corte ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  cerrado_en         timestamptz,
  paletas_acumuladas integer check (paletas_acumuladas is null or paletas_acumuladas >= 0),
  paletas_tramo      integer check (paletas_tramo is null or paletas_tramo >= 0),
  saldo_paquetes     integer check (saldo_paquetes is null or saldo_paquetes >= 0),
  cerrado_por        text,
  cerrado_uid        uuid,
  client_event_id    uuid unique,
  reabierto_por      text,
  reabierto_en       timestamptz,
  motivo_reapertura  text check (motivo_reapertura is null or char_length(motivo_reapertura) <= 300),
  actualizado_en     timestamptz not null default now(),
  primary key (linea, fecha, turno, tramo_id),
  check (estado = 'abierto' or (hora_corte is not null and cerrado_en is not null and paletas_acumuladas is not null and saldo_paquetes is not null))
);
create index if not exists cierre_tramos_turno_idx on public.cierre_tramos (linea, fecha, turno, orden);

create table if not exists public.cierres_turno (
  linea            text not null check (linea ~ '^[A-Z0-9]{2,10}$'),
  fecha            date not null,
  turno            text not null check (turno in ('DÍA','INTERMEDIO','NOCHE')),
  closed_at        timestamptz not null default now(),
  closed_by        text,
  closed_uid       uuid,
  resumen          jsonb not null default '[]'::jsonb check (jsonb_typeof(resumen) = 'array'),
  total_paletas    integer not null default 0 check (total_paletas >= 0),
  total_saldo      integer not null default 0 check (total_saldo >= 0),
  tramos           integer not null default 0 check (tramos >= 0),
  observaciones    text check (observaciones is null or char_length(observaciones) <= 1000),
  sync_estado      text not null default 'sincronizado' check (sync_estado in ('sincronizado','pendiente')),
  client_event_id  uuid not null unique,
  capturado_en     timestamptz,
  primary key (linea, fecha, turno)
);

alter table public.cierre_tramos enable row level security;
alter table public.cierres_turno enable row level security;
revoke all on public.cierre_tramos from public, anon, authenticated;
revoke all on public.cierres_turno from public, anon, authenticated;
grant all on public.cierre_tramos to service_role;
grant all on public.cierres_turno to service_role;

/* ---------- reglas puras: NULL si el pedido es válido, o el motivo ---------- */
create or replace function glacial_fs.cierre_turno_error(p jsonb)
returns text language plpgsql immutable set search_path = '' as $f$
declare t jsonb; ids text[] := '{}'; o integer;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return 'pedido vacío'; end if;
  if coalesce(p->>'linea','') !~ '^[A-Z0-9]{2,10}$' then return 'línea no válida'; end if;
  if coalesce(p->>'fecha','') !~ '^\d{4}-\d{2}-\d{2}$' then return 'fecha no válida'; end if;
  if coalesce(p->>'turno','') not in ('DÍA','INTERMEDIO','NOCHE') then return 'turno no válido'; end if;
  if p ? 'hora_corte' and coalesce(p->>'hora_corte','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return 'hora de corte no válida (HH:MM)'; end if;
  if p ? 'paletas_acumuladas' and (jsonb_typeof(p->'paletas_acumuladas') <> 'number' or (p->>'paletas_acumuladas')::numeric < 0 or (p->>'paletas_acumuladas')::numeric <> trunc((p->>'paletas_acumuladas')::numeric)) then return 'paletas: entero mayor o igual a 0'; end if;
  if p ? 'saldo_paquetes' and (jsonb_typeof(p->'saldo_paquetes') <> 'number' or (p->>'saldo_paquetes')::numeric < 0 or (p->>'saldo_paquetes')::numeric <> trunc((p->>'saldo_paquetes')::numeric)) then return 'saldo: entero mayor o igual a 0 (0 si terminó exacta)'; end if;
  if p ? 'client_event_id' and coalesce(p->>'client_event_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return 'evento no válido'; end if;
  if p ? 'secuencia' then
    if jsonb_typeof(p->'secuencia') <> 'array' or jsonb_array_length(p->'secuencia') = 0 then return 'la secuencia del turno está vacía'; end if;
    for t in select * from jsonb_array_elements(p->'secuencia') loop
      if coalesce(t->>'tramo_id','') = '' or coalesce(t->>'marca','') = '' or coalesce(t->>'presentacion','') = '' then return 'tramo sin id, marca o presentación'; end if;
      if (t->>'tramo_id') = any(ids) then return 'tramo repetido en la secuencia'; end if;
      ids := ids || (t->>'tramo_id');
    end loop;
  end if;
  return null;
end $f$;

/* ---------- consulta ---------- */
create or replace function public.cierre_turno_listar(p_linea text, p_fecha date, p_turno text)
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
begin
  if not coalesce((glacial_fs.ctx() ->> 'resumen')::boolean, false) then
    raise exception 'Sin permiso para ver el cierre de turno' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'tramos', coalesce((select jsonb_agg(to_jsonb(t) order by t.orden) from public.cierre_tramos t where t.linea = p_linea and t.fecha = p_fecha and t.turno = p_turno), '[]'::jsonb),
    'cierre', (select to_jsonb(c) from public.cierres_turno c where c.linea = p_linea and c.fecha = p_fecha and c.turno = p_turno));
end $f$;

/* ---------- cerrar un tramo (interno: lo usan cerrar y enviar) ---------- */
create or replace function glacial_fs.cierre_tramo_aplicar(p jsonb, quien text, uid uuid)
returns public.cierre_tramos language plpgsql volatile security definer set search_path = '' as $f$
declare e text; fila public.cierre_tramos; previo public.cierre_tramos; v_fecha date; v_orden integer; v_ms timestamptz; pend integer; idx integer; sec jsonb; ord integer;
begin
  e := glacial_fs.cierre_turno_error(p);
  if e is null and not (p ? 'tramo_id' and p ? 'hora_corte' and p ? 'paletas_acumuladas' and p ? 'saldo_paquetes' and p ? 'secuencia') then e := 'faltan datos del tramo (id, hora de corte, paletas, saldo, secuencia)'; end if;
  if e is not null then raise exception 'cierre: %', e using errcode = '23514'; end if;
  v_fecha := (p->>'fecha')::date;
  if exists (select 1 from public.cierres_turno c where c.linea = p->>'linea' and c.fecha = v_fecha and c.turno = p->>'turno') then
    raise exception 'cierre: el turno ya se envió; no se pueden cerrar más marcas' using errcode = '23514';
  end if;
  sec := p->'secuencia';
  select (x.i - 1)::integer into idx from jsonb_array_elements(sec) with ordinality x(v, i) where x.v->>'tramo_id' = p->>'tramo_id';
  if idx is null then raise exception 'cierre: el tramo no está en la secuencia del turno' using errcode = '23514'; end if;
  v_orden := idx + 1;
  -- idempotencia: el mismo evento ya aplicado → devuelve la misma fila
  select * into fila from public.cierre_tramos t where t.client_event_id = (p->>'client_event_id')::uuid;
  if found then return fila; end if;
  select * into fila from public.cierre_tramos t where t.linea = p->>'linea' and t.fecha = v_fecha and t.turno = p->>'turno' and t.tramo_id = p->>'tramo_id';
  if found and fila.estado = 'cerrado' then raise exception 'cierre: la marca % ya está cerrada', fila.marca using errcode = '23505'; end if;
  -- en orden: los anteriores de la secuencia deben estar cerrados
  select count(*) into pend from jsonb_array_elements(sec) with ordinality x(v, i)
   where x.i <= idx and not exists (select 1 from public.cierre_tramos t where t.linea = p->>'linea' and t.fecha = v_fecha and t.turno = p->>'turno' and t.tramo_id = x.v->>'tramo_id' and t.estado = 'cerrado');
  if pend > 0 then raise exception 'cierre: primero cierra la marca anterior de la secuencia' using errcode = '23514'; end if;
  -- la hora de corte no va antes de la del tramo cerrado anterior (instante real: cruza la medianoche en el turno noche)
  v_ms := (v_fecha::text || ' ' || (p->>'hora_corte') || ':00')::timestamp at time zone 'America/Lima';
  if p->>'turno' = 'NOCHE' and (p->>'hora_corte') < '12:00' then v_ms := v_ms + interval '1 day'; end if;
  select * into previo from public.cierre_tramos t where t.linea = p->>'linea' and t.fecha = v_fecha and t.turno = p->>'turno' and t.estado = 'cerrado' order by t.orden desc limit 1;
  if found and previo.cerrado_en is not null and v_ms < previo.cerrado_en - interval '1 minute' then
    raise exception 'cierre: la hora de corte (%) es anterior al corte de % (%)', p->>'hora_corte', previo.marca, previo.hora_corte using errcode = '23514';
  end if;
  insert into public.cierre_tramos as t (linea, fecha, turno, tramo_id, orden, marca, presentacion, estado, hora_corte, cerrado_en, paletas_acumuladas, paletas_tramo, saldo_paquetes, cerrado_por, cerrado_uid, client_event_id, actualizado_en)
  values (p->>'linea', v_fecha, p->>'turno', p->>'tramo_id', v_orden, sec->idx->>'marca', sec->idx->>'presentacion', 'cerrado', p->>'hora_corte', v_ms,
          (p->>'paletas_acumuladas')::integer, greatest(0, coalesce((p->>'paletas_tramo')::numeric, (p->>'paletas_acumuladas')::numeric))::integer, (p->>'saldo_paquetes')::integer,
          quien, uid, (p->>'client_event_id')::uuid, now())
  on conflict (linea, fecha, turno, tramo_id) do update set orden = excluded.orden, marca = excluded.marca, presentacion = excluded.presentacion, estado = 'cerrado',
     hora_corte = excluded.hora_corte, cerrado_en = excluded.cerrado_en, paletas_acumuladas = excluded.paletas_acumuladas, paletas_tramo = excluded.paletas_tramo,
     saldo_paquetes = excluded.saldo_paquetes, cerrado_por = excluded.cerrado_por, cerrado_uid = excluded.cerrado_uid, client_event_id = excluded.client_event_id, actualizado_en = now()
  returning * into fila;
  return fila;
end $f$;
revoke all on function glacial_fs.cierre_tramo_aplicar(jsonb, text, uuid) from public, anon, authenticated;

create or replace function glacial_fs.cierre_quien()
returns text language sql stable security definer set search_path = '' as $f$
  select coalesce(d.datos->'map'->(auth.uid()::text)->>'username', '') from public.fs_docs d where d.coleccion = 'sync' and d.id = 'perfiles' and d.eliminado_en is null
$f$;
revoke all on function glacial_fs.cierre_quien() from public, anon, authenticated;

/* ---------- cerrar una marca (tramo) ---------- */
create or replace function public.cierre_tramo_cerrar(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare c jsonb := glacial_fs.ctx(); fila public.cierre_tramos;
begin
  if not coalesce((c ->> 'opera')::boolean, false) then raise exception 'Sin permiso para cerrar marcas' using errcode = '42501'; end if;
  if not (p ? 'client_event_id') then raise exception 'cierre: falta el evento del equipo' using errcode = '23514'; end if;
  fila := glacial_fs.cierre_tramo_aplicar(p, glacial_fs.cierre_quien(), (c->>'uid')::uuid);
  return to_jsonb(fila);
end $f$;

/* ---------- reabrir una marca (corrección) ---------- */
create or replace function public.cierre_tramo_reabrir(p_linea text, p_fecha date, p_turno text, p_tramo_id text, p_motivo text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare c jsonb := glacial_fs.ctx(); fila public.cierre_tramos; enviado boolean;
begin
  if not coalesce((c ->> 'opera')::boolean, false) then raise exception 'Sin permiso para reabrir marcas' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_motivo,''))) < 5 then raise exception 'cierre: escribe el motivo (mínimo 5 caracteres)' using errcode = '23514'; end if;
  enviado := exists (select 1 from public.cierres_turno x where x.linea = p_linea and x.fecha = p_fecha and x.turno = p_turno);
  if enviado and not (coalesce((c->>'admin')::boolean,false) or coalesce((c->>'jef')::boolean,false)) then
    raise exception 'cierre: el turno ya se envió; solo el Administrador o Jefatura reabre' using errcode = '42501';
  end if;
  -- solo la ÚLTIMA marca cerrada (las siguientes dependen de su hora de corte)
  if exists (select 1 from public.cierre_tramos t where t.linea = p_linea and t.fecha = p_fecha and t.turno = p_turno and t.estado = 'cerrado'
              and t.orden > (select t2.orden from public.cierre_tramos t2 where t2.linea = p_linea and t2.fecha = p_fecha and t2.turno = p_turno and t2.tramo_id = p_tramo_id)) then
    raise exception 'cierre: reabre primero la última marca cerrada' using errcode = '23514';
  end if;
  update public.cierre_tramos t set estado = 'abierto', hora_corte = null, cerrado_en = null, paletas_acumuladas = null, paletas_tramo = null, saldo_paquetes = null,
         client_event_id = null, reabierto_por = glacial_fs.cierre_quien(), reabierto_en = now(), motivo_reapertura = btrim(p_motivo), actualizado_en = now()
   where t.linea = p_linea and t.fecha = p_fecha and t.turno = p_turno and t.tramo_id = p_tramo_id and t.estado = 'cerrado'
  returning * into fila;
  if not found then raise exception 'cierre: esa marca no está cerrada' using errcode = '23514'; end if;
  if enviado then delete from public.cierres_turno x where x.linea = p_linea and x.fecha = p_fecha and x.turno = p_turno; end if;
  return to_jsonb(fila);
end $f$;

/* ---------- enviar el cierre de turno consolidado ---------- */
create or replace function public.cierre_turno_enviar(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare c jsonb := glacial_fs.ctx(); e text; v_fecha date; ex public.cierres_turno; sec jsonb; n integer; ult jsonb; faltan integer; quien text; res jsonb; tot_p integer; tot_s integer;
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
    if ex.client_event_id = (p->>'client_event_id')::uuid then return to_jsonb(ex); end if;      -- reintento del mismo envío
    raise exception 'cierre: este turno ya se envió (% · %)', coalesce(ex.closed_by,'—'), to_char(ex.closed_at at time zone 'America/Lima','DD/MM HH24:MI') using errcode = '23505';
  end if;
  -- todos los tramos menos el último deben estar cerrados
  select count(*) into faltan from jsonb_array_elements(sec) with ordinality x(v, i)
   where x.i < n and not exists (select 1 from public.cierre_tramos t where t.linea = p->>'linea' and t.fecha = v_fecha and t.turno = p->>'turno' and t.tramo_id = x.v->>'tramo_id' and t.estado = 'cerrado');
  if faltan > 0 then raise exception 'cierre: faltan % marca(s) por cerrar antes de enviar', faltan using errcode = '23514'; end if;
  -- el último: ya cerrado o se cierra ahora con lo que manda la pantalla
  if not exists (select 1 from public.cierre_tramos t where t.linea = p->>'linea' and t.fecha = v_fecha and t.turno = p->>'turno' and t.tramo_id = sec->(n-1)->>'tramo_id' and t.estado = 'cerrado') then
    if not (p ? 'ultimo') or jsonb_typeof(p->'ultimo') <> 'object' then raise exception 'cierre: falta cerrar la última marca (saldo y paletas)' using errcode = '23514'; end if;
    ult := (p->'ultimo') || jsonb_build_object('linea', p->>'linea', 'fecha', p->>'fecha', 'turno', p->>'turno', 'secuencia', sec, 'tramo_id', sec->(n-1)->>'tramo_id');
    if not (ult ? 'client_event_id') then ult := ult || jsonb_build_object('client_event_id', gen_random_uuid()); end if;
    perform glacial_fs.cierre_tramo_aplicar(ult, quien, (c->>'uid')::uuid);
  end if;
  -- resumen firme (desde la tabla, no desde la pantalla)
  select coalesce(jsonb_agg(jsonb_build_object('orden', t.orden, 'tramo_id', t.tramo_id, 'marca', t.marca, 'presentacion', t.presentacion, 'hora_corte', t.hora_corte,
           'paletas', t.paletas_tramo, 'paletas_acumuladas', t.paletas_acumuladas, 'saldo_paquetes', t.saldo_paquetes, 'cerrado_por', t.cerrado_por) order by t.orden), '[]'::jsonb),
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

revoke all on function public.cierre_turno_listar(text, date, text) from public, anon;
revoke all on function public.cierre_tramo_cerrar(jsonb) from public, anon;
revoke all on function public.cierre_tramo_reabrir(text, date, text, text, text) from public, anon;
revoke all on function public.cierre_turno_enviar(jsonb) from public, anon;
grant execute on function public.cierre_turno_listar(text, date, text) to authenticated;
grant execute on function public.cierre_tramo_cerrar(jsonb) to authenticated;
grant execute on function public.cierre_tramo_reabrir(text, date, text, text, text) to authenticated;
grant execute on function public.cierre_turno_enviar(jsonb) to authenticated;
