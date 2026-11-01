-- GLACIAL · glacial_40 · SALUD DEL SISTEMA (revisión diaria + aviso al Administrador en la campana)                  *** NO APLICADA en PRODUCCIÓN (aplicar primero en PRUEBAS) ***
--
-- Qué hace
--  Una vez al día (07:30 hora de Lima) la base se revisa a sí misma y deja el resultado en un documento (saludSistema/actual) que SOLO lee el Administrador (marca «admin»):
--    · tamaño de la base (aviso desde 350 MB y rojo desde 450 MB; el plan gratis llega a 500 MB),
--    · tareas programadas (pg_cron) que fallaron en las últimas 24 horas,
--    · copia a Drive (control_proceso_sync) con error,
--    · días sin reportes de producción (aviso desde 3 días).
--  La página muestra cada problema como un aviso en la campana del Administrador; si la propia revisión no corre en 36 horas, también avisa de eso.
--  Además guarda un historial (public.salud_log, sin acceso desde la página). NO cambia ningún dato de la planta, no borra nada y no modifica reglas de escritura:
--  nadie puede escribir saludSistema desde la página (solo la función del servidor). Se puede ejecutar más de una vez.
--
-- ANTES DE APLICAR: PRUEBAS (mvxjopvnnagqytegtexi) primero; PRODUCCION (ehtbwmvwoxcdefvlxttu) solo con la aprobación del dueño.

create table if not exists public.salud_log (
  id bigserial primary key,
  en timestamptz not null default now(),
  db_mb numeric,
  problemas jsonb not null default '[]'::jsonb
);
alter table public.salud_log enable row level security;           -- sin políticas: solo el servidor

create or replace function public.salud_revisar() returns jsonb
language plpgsql security definer set search_path = '' as $f$
declare
  mb numeric := round(pg_database_size(current_database()) / 1048576.0, 1);
  prob jsonb := '[]'::jsonb;
  fallos integer := 0; errs integer := 0; dias integer; ultimo date; doc jsonb;
  hoy date := (now() at time zone 'America/Lima')::date;
begin
  if mb >= 450 then
    prob := prob || jsonb_build_object('nivel', 'roja', 'texto', 'La base de datos está casi llena: ' || mb || ' MB de 500 MB. Hay que liberar espacio o pasar a un plan mayor.');
  elsif mb >= 350 then
    prob := prob || jsonb_build_object('nivel', 'ambar', 'texto', 'La base de datos ya usa ' || mb || ' MB de 500 MB.');
  end if;

  begin
    select count(*) into fallos from cron.job_run_details where status = 'failed' and start_time > now() - interval '24 hours';
  exception when others then fallos := 0; end;
  if fallos > 0 then
    prob := prob || jsonb_build_object('nivel', 'ambar', 'texto', fallos || ' tarea(s) programada(s) del servidor fallaron en las últimas 24 horas (por ejemplo la copia a Drive sin configurar).');
  end if;

  begin
    select count(*) into errs from public.control_proceso_sync where ok = false;
  exception when others then errs := 0; end;
  if errs > 0 then
    prob := prob || jsonb_build_object('nivel', 'ambar', 'texto', 'La copia del Control de proceso a Drive tiene ' || errs || ' libro(s) con error (se ve en Asistente › Lotes).');
  end if;

  select max((datos->>'fecha')::date) into ultimo from public.fs_items
   where coleccion = 'sync' and doc = 'records' and datos->>'fecha' ~ '^\d{4}-\d{2}-\d{2}$';
  if ultimo is null then
    prob := prob || jsonb_build_object('nivel', 'ambar', 'texto', 'Todavía no hay reportes de producción registrados.');
  else
    dias := hoy - ultimo;
    if dias >= 3 then
      prob := prob || jsonb_build_object('nivel', 'ambar', 'texto', 'No hay reportes de producción desde hace ' || dias || ' días (el último es del ' || to_char(ultimo, 'DD/MM/YYYY') || ').');
    end if;
  end if;

  insert into public.salud_log (db_mb, problemas) values (mb, prob);
  delete from public.salud_log where en < now() - interval '90 days';
  doc := jsonb_build_object('id', 'actual', 'revisadoEn', (extract(epoch from now()) * 1000)::bigint, 'dbMb', mb, 'problemas', prob);
  insert into public.fs_docs (coleccion, id, datos, version) values ('saludSistema', 'actual', doc, 1)
  on conflict (coleccion, id) do update set datos = excluded.datos, version = public.fs_docs.version + 1, actualizado_en = now(), eliminado_en = null;
  return doc;
end $f$;
revoke all on function public.salud_revisar() from public, anon, authenticated;

-- Revisión diaria 07:30 Lima (12:30 UTC). Si ya existe, no se duplica.
do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'glacial-salud-diaria') then
    perform cron.schedule('glacial-salud-diaria', '30 12 * * *', 'select public.salud_revisar()');
  end if;
end $c$;

-- Lectura: solo el Administrador (marca «admin»). La escritura no tiene regla: nadie puede escribir saludSistema desde la página.
do $m$
declare
  def text; cuenta integer;
  anc constant text := $a$elsif c in ('insumosLotes','insumosUnidades') then$a$;
  nuevo constant text := $r$elsif c = 'saludSistema' then return coalesce((k->>'admin')::boolean, false);
 elsif c in ('insumosLotes','insumosUnidades') then$r$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if def is null then raise exception 'glacial_fs.puede_leer no existe'; end if;
  if position('saludSistema' in def) > 0 then return; end if;                              -- ya aplicada
  cuenta := (length(def) - length(replace(def, anc, ''))) / length(anc);
  if cuenta <> 1 then raise exception 'puede_leer: punto de inserción encontrado % veces (aplica antes glacial_38)', cuenta; end if;
  execute replace(def, anc, nuevo);
end $m$;
