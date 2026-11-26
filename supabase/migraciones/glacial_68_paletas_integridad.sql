-- GLACIAL · glacial_68 · PALETAS: integridad en SQL + idempotencia por client_event_id + hora real de captura      *** NO APLICADA (26/11/2026) ***
--
-- Dónde viven las paletas (verificado en PRUEBAS el 26/11/2026): NO hay una tabla «paletas». Es el documento sync/paletas del puente Firestore→Supabase
-- (js/nucleo/00b-puente-supabase.js): lista partida en public.fs_items (coleccion='sync', doc='paletas', campo='items', id=<id de la paleta>, datos jsonb),
-- con PK (coleccion, doc, campo, id), FK a public.fs_docs, baja lógica en eliminado_en y triggers ya existentes (poner_raiz, proteger_registros...).
-- Cada fila de fs_items es UN registro de paleta (en PRUEBAS: 870). Añadir columnas a fs_items afectaría a TODAS las colecciones, así que:
--   · client_event_id y captured_at viajan DENTRO de datos (clientEventId, capturadoEn, que la página ya envía);
--   · glacial_fs.paletas_eventos es el libro de eventos con las columnas reales client_event_id uuid (PRIMARY KEY = UNIQUE) y captured_at timestamptz,
--     más recibido_en (hora del servidor): sirve para idempotencia y para medir el retraso entre «cuando se tocó el botón» y «cuando llegó»;
--   · los registros anteriores (sin clientEventId) siguen válidos: el libro solo registra los que lo traen (nulos permitidos).
--
-- Qué hace:
--  1) glacial_fs.paleta_item_error(datos): devuelve NULL si el registro es válido o el motivo del rechazo. Reglas deliberadamente flojas para NO
--     bloquear correcciones ni saldos legítimos: tipoPaleta COMPLETA|INCOMPLETA; linea, marca, presentacion, fecha (AAAA-MM-DD real) y turno
--     (DÍA|INTERMEDIO|NOCHE) obligatorios; hora HH:MM si viene; paletas, totalUnidades, unidadesPorPaleta y unidadesIncompleta numéricos y >= 0 (0 SÍ vale:
--     un acumulado corregido a 0 o un saldo en 0 son legítimos); COMPLETA con paletas entero; clientEventId UUID y capturadoEn ISO-8601 si vienen.
--  2) Trigger BEFORE INSERT / UPDATE en public.fs_items (solo sync/paletas/items): aplica (1) al registro NUEVO. Las bajas lógicas (eliminado_en) nunca
--     se bloquean y una fila vieja NO se revalida si no cambia su contenido. clientEventId, una vez puesto, no se puede cambiar.
--  3) Trigger AFTER INSERT / UPDATE: anota el evento en glacial_fs.paletas_eventos. Reintentar el MISMO registro (mismo id y mismo clientEventId) es
--     inofensivo; el mismo clientEventId en OTRA paleta se rechaza (23505): es un duplicado.
--  4) Vista glacial_fs.v_paletas_captura (retraso = recibido_en - captured_at) para auditoría.
-- NO toca datos existentes, no borra nada, no cambia glacial_fs.autorizar/fs_commit. Se puede ejecutar más de una vez.
--
-- ORDEN: 1) PRUEBAS (mvxjopvnnagqytegtexi): ejecutar este archivo y luego supabase/pruebas/paletas_integridad.sql (todo con ROLLBACK).
--        2) Probar la página en http://localhost:5599 contra PRUEBAS (cortar la red y reintentar: ver docs/produccion/paletas-rapido.md).
--        3) PRODUCCIÓN (ehtbwmvwoxcdefvlxttu) solo con la aprobación del dueño.
-- Marcha atrás (si hiciera falta): drop trigger fs_paletas_validar_ins/_upd, fs_paletas_evento_ins/_upd on public.fs_items; el libro puede quedarse.

-- ---------------------------------------------------------------- 1) validación de un registro
-- (jsonb_typeof de un campo ausente es NULL: por eso todas las comparaciones usan «is distinct from»)
create or replace function glacial_fs.paleta_item_error(d jsonb)
returns text language plpgsql immutable set search_path = '' as $f$
declare
  tipo text; v jsonb; campo text;
begin
  if d is null or jsonb_typeof(d) is distinct from 'object' then return 'el registro no es un objeto'; end if;
  if jsonb_typeof(d->'id') is distinct from 'string' or char_length(d->>'id') not between 1 and 300 then return 'falta el id'; end if;

  tipo := d->>'tipoPaleta';
  if tipo is null or tipo not in ('COMPLETA', 'INCOMPLETA') then return 'tipoPaleta debe ser COMPLETA o INCOMPLETA'; end if;

  foreach campo in array array['linea', 'marca', 'presentacion'] loop
    if jsonb_typeof(d->campo) is distinct from 'string' or char_length(btrim(d->>campo)) not between 1 and 200 then
      return campo || ' es obligatorio';
    end if;
  end loop;

  if jsonb_typeof(d->'fecha') is distinct from 'string' or (d->>'fecha') !~ '^\d{4}-\d{2}-\d{2}$' then return 'fecha debe ser AAAA-MM-DD'; end if;
  begin perform (d->>'fecha')::date; exception when others then return 'fecha no es una fecha real'; end;
  if d->>'turno' is null or d->>'turno' not in ('DÍA', 'INTERMEDIO', 'NOCHE') then return 'turno debe ser DÍA, INTERMEDIO o NOCHE'; end if;

  if d ? 'hora' and jsonb_typeof(d->'hora') <> 'null' then
    if jsonb_typeof(d->'hora') is distinct from 'string' or (d->>'hora') !~ '^([01]\d|2[0-3]):[0-5]\d$' then return 'hora debe ser HH:MM'; end if;
  end if;

  if jsonb_typeof(d->'paletas') is distinct from 'number' or (d->>'paletas')::numeric < 0 then return 'paletas debe ser un número >= 0'; end if;
  if tipo = 'COMPLETA' and (d->>'paletas')::numeric <> trunc((d->>'paletas')::numeric) then return 'paletas completas debe ser un entero'; end if;
  if jsonb_typeof(d->'totalUnidades') is distinct from 'number' or (d->>'totalUnidades')::numeric < 0 then return 'totalUnidades debe ser un número >= 0'; end if;
  foreach campo in array array['unidadesPorPaleta', 'unidadesIncompleta'] loop
    v := d->campo;
    if v is not null and jsonb_typeof(v) <> 'null' and (jsonb_typeof(v) is distinct from 'number' or (d->>campo)::numeric < 0) then
      return campo || ' debe ser un número >= 0';
    end if;
  end loop;

  if d ? 'clientEventId' and jsonb_typeof(d->'clientEventId') <> 'null' then
    if jsonb_typeof(d->'clientEventId') is distinct from 'string'
       or (d->>'clientEventId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return 'clientEventId debe ser un UUID';
    end if;
    if jsonb_typeof(d->'capturadoEn') is distinct from 'string'
       or (d->>'capturadoEn') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then
      return 'capturadoEn debe ser una fecha-hora ISO-8601 cuando hay clientEventId';
    end if;
    begin perform (d->>'capturadoEn')::timestamptz; exception when others then return 'capturadoEn no es una fecha-hora real'; end;
  end if;
  return null;
end $f$;
revoke all on function glacial_fs.paleta_item_error(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- libro de eventos (idempotencia + auditoría de la hora de captura)
create table if not exists glacial_fs.paletas_eventos (
  client_event_id uuid primary key,                    -- UNIQUE: un evento de captura solo existe una vez
  paleta_id       text        not null,                -- id del registro en fs_items
  captured_at     timestamptz not null,                -- instante del toque en el equipo (ISO que envía la página)
  recibido_en     timestamptz not null default now(),  -- hora del servidor al guardarlo
  linea           text        not null,
  fecha           date        not null,
  turno           text        not null,
  marca           text        not null,
  presentacion    text        not null,
  tipo_paleta     text        not null,
  paletas         numeric     not null,
  total_unidades  numeric     not null,
  hora            text,
  usuario         text,
  constraint paletas_eventos_tipo_ck   check (tipo_paleta in ('COMPLETA', 'INCOMPLETA')),
  constraint paletas_eventos_turno_ck  check (turno in ('DÍA', 'INTERMEDIO', 'NOCHE')),
  constraint paletas_eventos_cant_ck   check (paletas >= 0 and total_unidades >= 0),
  constraint paletas_eventos_futuro_ck check (captured_at <= recibido_en + interval '1 day')   -- tolera relojes desajustados, no fechas absurdas
);
create index if not exists paletas_eventos_ctx_idx on glacial_fs.paletas_eventos (linea, fecha, turno);
create index if not exists paletas_eventos_paleta_idx on glacial_fs.paletas_eventos (paleta_id);
alter table glacial_fs.paletas_eventos enable row level security;           -- sin políticas: solo lo escriben los triggers (security definer) y el administrador de la base
revoke all on glacial_fs.paletas_eventos from public, anon, authenticated;
comment on table glacial_fs.paletas_eventos is 'glacial_68 · un renglón por registro de paleta capturado con clientEventId (cola sin conexión de la página). captured_at = hora del toque; recibido_en = hora del servidor.';

create or replace view glacial_fs.v_paletas_captura as
  select client_event_id, paleta_id, linea, fecha, turno, marca, presentacion, tipo_paleta, paletas, hora, usuario,
         captured_at, recibido_en, recibido_en - captured_at as retraso
    from glacial_fs.paletas_eventos;
revoke all on glacial_fs.v_paletas_captura from public, anon, authenticated;

-- ---------------------------------------------------------------- 2) trigger de validación (BEFORE)
create or replace function glacial_fs.paletas_validar()
returns trigger language plpgsql set search_path = '' as $f$
declare motivo text;
begin
  if new.eliminado_en is not null then return new; end if;                     -- una baja lógica nunca se bloquea
  motivo := glacial_fs.paleta_item_error(new.datos);
  if motivo is null and new.datos->>'id' is distinct from new.id then motivo := 'el id del registro no coincide con el de la fila'; end if;
  if motivo is null and tg_op = 'UPDATE' and (old.datos->>'clientEventId') is not null
     and (new.datos->>'clientEventId') is distinct from (old.datos->>'clientEventId') then
    motivo := 'clientEventId no se puede cambiar';
  end if;
  if motivo is not null then
    raise exception 'paletas: %', motivo using errcode = '23514', hint = 'glacial_68 · paleta_item_error';
  end if;
  return new;
end $f$;
revoke all on function glacial_fs.paletas_validar() from public, anon, authenticated;

drop trigger if exists fs_paletas_validar_ins on public.fs_items;
create trigger fs_paletas_validar_ins before insert on public.fs_items
  for each row when (new.coleccion = 'sync' and new.doc = 'paletas' and new.campo = 'items')
  execute function glacial_fs.paletas_validar();
drop trigger if exists fs_paletas_validar_upd on public.fs_items;
create trigger fs_paletas_validar_upd before update on public.fs_items
  for each row when (new.coleccion = 'sync' and new.doc = 'paletas' and new.campo = 'items'
                     and (old.datos is distinct from new.datos or old.eliminado_en is distinct from new.eliminado_en))   -- una fila vieja no se revalida si no cambió
  execute function glacial_fs.paletas_validar();

-- ---------------------------------------------------------------- 3) trigger del libro de eventos (AFTER)
create or replace function glacial_fs.paletas_registrar_evento()
returns trigger language plpgsql security definer set search_path = '' as $f$
declare n integer;
begin
  if new.eliminado_en is not null or (new.datos->>'clientEventId') is null then return new; end if;   -- registros antiguos / sin evento: nada que anotar
  insert into glacial_fs.paletas_eventos as e
         (client_event_id, paleta_id, captured_at, linea, fecha, turno, marca, presentacion, tipo_paleta, paletas, total_unidades, hora, usuario)
  values ((new.datos->>'clientEventId')::uuid, new.id, (new.datos->>'capturadoEn')::timestamptz, new.datos->>'linea', (new.datos->>'fecha')::date,
          new.datos->>'turno', new.datos->>'marca', new.datos->>'presentacion', new.datos->>'tipoPaleta', (new.datos->>'paletas')::numeric,
          (new.datos->>'totalUnidades')::numeric, new.datos->>'hora', new.datos->>'usuario')
  on conflict (client_event_id) do update
     set linea = excluded.linea, fecha = excluded.fecha, turno = excluded.turno, marca = excluded.marca, presentacion = excluded.presentacion,
         tipo_paleta = excluded.tipo_paleta, paletas = excluded.paletas, total_unidades = excluded.total_unidades, hora = excluded.hora, usuario = excluded.usuario
   where e.paleta_id = excluded.paleta_id;                                       -- mismo registro reenviado/corregido: se actualiza el resumen, no la hora de captura
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'paletas: el evento % ya pertenece a otro registro (duplicado)', new.datos->>'clientEventId' using errcode = '23505', hint = 'glacial_68 · paletas_eventos';
  end if;
  return new;
end $f$;
revoke all on function glacial_fs.paletas_registrar_evento() from public, anon, authenticated;

drop trigger if exists fs_paletas_evento_ins on public.fs_items;
create trigger fs_paletas_evento_ins after insert on public.fs_items
  for each row when (new.coleccion = 'sync' and new.doc = 'paletas' and new.campo = 'items')
  execute function glacial_fs.paletas_registrar_evento();
drop trigger if exists fs_paletas_evento_upd on public.fs_items;
create trigger fs_paletas_evento_upd after update on public.fs_items
  for each row when (new.coleccion = 'sync' and new.doc = 'paletas' and new.campo = 'items' and old.datos is distinct from new.datos)
  execute function glacial_fs.paletas_registrar_evento();
