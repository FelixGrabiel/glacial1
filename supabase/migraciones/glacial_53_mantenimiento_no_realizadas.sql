-- GLACIAL · glacial_53 · MANTENIMIENTO · ACTIVIDADES «NO REALIZADAS» CON MOTIVO, QUE PASAN A LA SEMANA SIGUIENTE      *** PRUEBAS: pendiente · PRODUCCIÓN: pendiente de aprobación
--
-- Agrega a public.mtto_registro_actividades (Requiere glacial_48):
--   · no_realizado          la actividad NO se hizo (no puede estar también «realizada»).
--   · motivo_no             por qué no se hizo (obligatorio si no_realizado).
--   · origen_actividad_id   si la actividad viene arrastrada de una semana anterior: la actividad anterior de la que viene.
--   · anio_origen / semana_origen   la semana en que se programó por primera vez (para decir «pendiente desde la semana N»).
--   · motivo_origen         el motivo con el que quedó pendiente en la semana anterior (se muestra en la actividad arrastrada).
-- Función public.mtto_pendientes_arrastrables(máquina, año, semana): las actividades «no realizadas» de semanas ANTERIORES de esa máquina que todavía
--   no pasaron a una semana posterior. Las usa la pantalla al iniciar (o abrir) el registro de la semana. Sigue las reglas de lectura (RLS) de siempre.
-- No toca datos existentes (todas las filas quedan con no_realizado = false). Se puede ejecutar más de una vez. Orden: PRUEBAS primero; PRODUCCIÓN con la aprobación del dueño.

do $c$
begin
  if to_regclass('public.mtto_registro_actividades') is null then raise exception 'Falta glacial_48: aplícala antes'; end if;
end $c$;

alter table public.mtto_registro_actividades add column if not exists no_realizado boolean not null default false;
alter table public.mtto_registro_actividades add column if not exists motivo_no text not null default '';
alter table public.mtto_registro_actividades add column if not exists origen_actividad_id uuid references public.mtto_registro_actividades (id) on delete set null;
alter table public.mtto_registro_actividades add column if not exists anio_origen integer;
alter table public.mtto_registro_actividades add column if not exists semana_origen integer;
alter table public.mtto_registro_actividades add column if not exists motivo_origen text not null default '';

do $k$
begin
  if not exists (select 1 from pg_constraint where conname = 'mtto_act_no_realizado_chk' and conrelid = 'public.mtto_registro_actividades'::regclass) then
    alter table public.mtto_registro_actividades add constraint mtto_act_no_realizado_chk
      check (not (realizado and no_realizado) and (not no_realizado or length(btrim(motivo_no)) > 0) and length(motivo_no) <= 300);
  end if;
end $k$;

create index if not exists mtto_registro_actividades_origen_idx on public.mtto_registro_actividades (origen_actividad_id) where origen_actividad_id is not null;
create index if not exists mtto_registro_actividades_pend_idx on public.mtto_registro_actividades (registro_id) where no_realizado;

create or replace function public.mtto_pendientes_arrastrables(p_maquina uuid, p_anio integer, p_semana integer)
returns table (id uuid, plan_actividad_id uuid, equipo text, actividad text, frecuencia text, motivo_no text, anio_origen integer, semana_origen integer)
language sql stable security invoker set search_path = '' as $f$
  select a.id, a.plan_actividad_id, a.equipo, a.actividad, a.frecuencia, a.motivo_no,
         coalesce(a.anio_origen, r.anio), coalesce(a.semana_origen, r.semana)
  from public.mtto_registro_actividades a
  join public.mtto_registros r on r.id = a.registro_id
  where r.maquina_id = p_maquina and a.no_realizado
    and (r.anio < p_anio or (r.anio = p_anio and r.semana < p_semana))
    and not exists (select 1 from public.mtto_registro_actividades d where d.origen_actividad_id = a.id)
  order by coalesce(a.anio_origen, r.anio), coalesce(a.semana_origen, r.semana), a.item
$f$;
revoke all on function public.mtto_pendientes_arrastrables(uuid, integer, integer) from public, anon;
grant execute on function public.mtto_pendientes_arrastrables(uuid, integer, integer) to authenticated, service_role;
