-- GLACIAL · glacial_35 · COPIA A DRIVE del «Control de proceso en el envasado» (CF - CA - F - 047): estado de la sincronización      *** NO APLICADA (preparada; aplicar primero en PRUEBAS) ***
--
-- Qué hace
--  1) public.control_proceso_sync: UNA fila por línea y mes con la huella de lo último copiado, si salió bien, los intentos, el error, el enlace al libro de Drive y la hora.
--     RLS activada SIN políticas y sin permisos para anon/authenticated: solo escribe la función de servidor control-proceso-drive (llave de servicio).
--  2) public.control_proceso_puede(): ¿el usuario puede sincronizar a mano? = marca ii_esc (Asistente de Producción y Administrador). Solo lo consulta la función de servidor.
--  3) public.control_proceso_estado(): el estado de las copias para la tarjeta «Control de proceso» de la pestaña Lotes. Exige ii_ver (Asistente, Jefe de Operaciones, Administrador).
--  4) public.control_proceso_disparar() + un trabajo de pg_cron cada 5 minutos que llama a la función de servidor con la clave x-glacial-sync. Lee la dirección y la clave del
--     VAULT de Supabase (control_proceso_url y control_proceso_sync_secreto): mientras no existan, no hace NADA (se puede aplicar la migración antes de configurar Drive).
--  5) NO toca producción, stock SAP, paradas, tareo ni Avance/Cierre. La función solo LEE los reportes.
--
-- ANTES DE APLICAR
--  · Requiere glacial_24 (marca ii_esc / ii_ver en glacial_fs.ctx). Si falta, se detiene sin cambiar nada.
--  · Orden: PRIMERO PRUEBAS (mvxjopvnnagqytegtexi); solo después PRODUCCION (ehtbwmvwoxcdefvlxttu) y SOLO con la aprobación del dueño.
--  · Se puede ejecutar más de una vez.
--  · Después de aplicarla: desplegar la función control-proceso-drive, poner sus 3 secretos y guardar en el Vault la dirección y la clave del disparador
--    (guía: docs/asistente/control-proceso-drive.md › «Conectar con Drive»).

do $c$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'ctx';
  if def is null or position('ii_esc' in def) = 0 or position('ii_ver' in def) = 0 then
    raise exception 'glacial_fs.ctx no tiene las marcas ii_esc / ii_ver: aplica antes glacial_24';
  end if;
end $c$;

create table if not exists public.control_proceso_sync (
  linea          text    not null check (linea ~ '^[A-Z0-9]{2,8}$'),
  mes            text    not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  hash           text,
  ok             boolean not null default false,
  intentos       integer not null default 0 check (intentos >= 0),
  error          text    check (error is null or char_length(error) <= 500),
  libro_url      text,
  libro_id       text,
  filas          integer,
  sincronizado_en timestamptz,
  intento_en     timestamptz,
  primary key (linea, mes)
);
alter table public.control_proceso_sync enable row level security;
revoke all on public.control_proceso_sync from public, anon, authenticated;
grant all on public.control_proceso_sync to service_role;

create or replace function public.control_proceso_puede()
returns boolean language sql stable security definer set search_path = '' as $f$
  select coalesce((glacial_fs.ctx() ->> 'ii_esc')::boolean, false)
$f$;

create or replace function public.control_proceso_estado()
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
begin
  if not coalesce((glacial_fs.ctx() ->> 'ii_ver')::boolean, false) then
    raise exception 'Sin permiso para ver la copia a Drive' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('linea', s.linea, 'mes', s.mes, 'ok', s.ok, 'error', s.error, 'libro_url', s.libro_url, 'filas', s.filas,
                                        'sincronizado_en', s.sincronizado_en, 'intento_en', s.intento_en, 'intentos', s.intentos) order by s.mes desc, s.linea)
      from public.control_proceso_sync s
  ), '[]'::jsonb);
end
$f$;

revoke all on function public.control_proceso_puede() from public, anon;
revoke all on function public.control_proceso_estado() from public, anon;
grant execute on function public.control_proceso_puede() to authenticated;
grant execute on function public.control_proceso_estado() to authenticated;

-- Disparador: lo llama pg_cron; sin los dos secretos del Vault no hace nada.
create extension if not exists pg_net with schema extensions;

create or replace function public.control_proceso_disparar()
returns void language plpgsql volatile security definer set search_path = '' as $f$
declare v_url text; v_sec text;
begin
  if to_regnamespace('net') is null or to_regnamespace('vault') is null then return; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'control_proceso_url' limit 1;
  select decrypted_secret into v_sec from vault.decrypted_secrets where name = 'control_proceso_sync_secreto' limit 1;
  if coalesce(v_url, '') = '' or coalesce(v_sec, '') = '' then return; end if;
  perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'x-glacial-sync', v_sec), body := '{}'::jsonb, timeout_milliseconds := 55000);
end
$f$;
revoke all on function public.control_proceso_disparar() from public, anon, authenticated;

do $s$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'control-proceso-drive';
    perform cron.schedule('control-proceso-drive', '*/5 * * * *', 'select public.control_proceso_disparar()');
  end if;
end $s$;
