-- GLACIAL · glacial_68 · NOTIFICACIONES DE PARADAS DE LÍNEA (Web Push, aunque la app esté cerrada)          *** PREPARADA: aplicar primero en PRUEBAS ***
--
-- Qué hace (ver docs/00-general/notificaciones.md):
--   · glacial_fs.push_suscripciones: un registro por EQUIPO que activó los avisos (endpoint + claves del navegador) y la cuenta (auth.uid) que lo usa.
--     Privada: RLS activa sin políticas; solo se toca por las funciones de abajo.
--   · glacial_fs.push_enviados: claves de avisos ya enviados (det|programación|inicio, par|…): un aviso nunca se repite. Se limpian a los 3 días.
--   · Para la app (cuenta con sesión): push_clave_publica() · push_suscribir(…) · push_desuscribir(endpoint).
--   · Solo para el servidor (service_role, función avisos-push): push_verificar · push_datos · push_vapid · push_vapid_guardar · push_marcar · push_resultado.
--   · push_disparar() + tarea pg_cron «glacial-avisos-push» CADA MINUTO: llama a la función avisos-push con la clave x-glacial-push.
--     Lee del VAULT la dirección (push_avisos_url) y la clave (push_avisos_secreto, se crea sola y nadie la ve). Sin dirección, NO hace nada:
--     se puede aplicar antes de desplegar la función.
-- Las claves VAPID (para firmar los envíos) las genera la propia función la primera vez y las guarda en el Vault (push_vapid_publica / push_vapid_privada).
-- Después de aplicarla: desplegar supabase/functions/avisos-push (verify_jwt = false: se protege con la clave del Vault) y guardar su dirección:
--   select vault.create_secret('https://<proyecto>.supabase.co/functions/v1/avisos-push', 'push_avisos_url', 'GLACIAL avisos-push: dirección');
-- Se puede ejecutar más de una vez. Orden: PRUEBAS primero; PRODUCCION solo cuando el dueño diga «Aplica en producción».

create table if not exists glacial_fs.push_suscripciones (
  endpoint       text primary key,
  uid            uuid not null,
  p256dh         text not null,
  auth           text not null,
  equipo         text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  ultimo_envio   timestamptz,
  fallos         integer not null default 0
);
create index if not exists push_suscripciones_uid_idx on glacial_fs.push_suscripciones (uid);
alter table glacial_fs.push_suscripciones enable row level security;
revoke all on glacial_fs.push_suscripciones from public, anon, authenticated;

create table if not exists glacial_fs.push_enviados (
  clave      text primary key,
  enviado_en timestamptz not null default now()
);
alter table glacial_fs.push_enviados enable row level security;
revoke all on glacial_fs.push_enviados from public, anon, authenticated;

-- ---------- Para la app ----------
create or replace function public.push_clave_publica()
returns text language sql stable security definer set search_path = ''
as $f$ select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'push_vapid_publica' limit 1 $f$;

create or replace function public.push_suscribir(p_endpoint text, p_p256dh text, p_auth text, p_equipo text)
returns boolean language plpgsql security definer set search_path = ''
as $f$
declare k jsonb := glacial_fs.ctx();
begin
  if auth.uid() is null or not coalesce((k->>'aut')::boolean, false) then
    raise exception 'permission-denied: inicia sesión para activar los avisos' using errcode = '42501';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') = '' or length(p_p256dh) > 200 or coalesce(p_auth, '') = '' or length(p_auth) > 100 then
    raise exception 'invalid-argument: suscripción no válida' using errcode = '22023';
  end if;
  insert into glacial_fs.push_suscripciones (endpoint, uid, p256dh, auth, equipo)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(p_equipo, 80))
  on conflict (endpoint) do update
    set uid = excluded.uid, p256dh = excluded.p256dh, auth = excluded.auth, equipo = excluded.equipo, actualizado_en = now(), fallos = 0;
  return true;
end $f$;

create or replace function public.push_desuscribir(p_endpoint text)
returns boolean language plpgsql security definer set search_path = ''
as $f$
begin
  if auth.uid() is null then return false; end if;
  delete from glacial_fs.push_suscripciones s where s.endpoint = p_endpoint and s.uid = auth.uid();
  return found;
end $f$;

revoke all on function public.push_clave_publica() from public, anon;
revoke all on function public.push_suscribir(text, text, text, text) from public, anon;
revoke all on function public.push_desuscribir(text) from public, anon;
grant execute on function public.push_clave_publica() to authenticated;
grant execute on function public.push_suscribir(text, text, text, text) to authenticated;
grant execute on function public.push_desuscribir(text) to authenticated;

-- ---------- Solo para el servidor (función avisos-push con service_role) ----------
create or replace function public.push_verificar(p_token text)
returns boolean language sql stable security definer set search_path = ''
as $f$
  select coalesce(p_token, '') <> '' and exists (
    select 1 from vault.decrypted_secrets s where s.name = 'push_avisos_secreto' and s.decrypted_secret = p_token)
$f$;

-- Todo lo que hace falta para decidir en una sola lectura: programaciones de los últimos días, usuarios, perfiles, umbrales, bloques y suscripciones.
create or replace function public.push_datos()
returns jsonb language plpgsql stable security definer set search_path = ''
as $f$
declare v_desde text := to_char((now() at time zone 'America/Lima')::date - 2, 'YYYY-MM-DD');
begin
  return jsonb_build_object(
    'ahora', floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    'programaciones', coalesce((
      select jsonb_agg(i.datos) from public.fs_items i
       where i.coleccion = 'sync' and i.doc = 'programaciones' and i.eliminado_en is null
         and i.datos ? 'estadoOperacion' and coalesce(i.datos->>'fecha', '') >= v_desde
         and i.datos->'estadoOperacion'->>'estado' in ('DETENIDA', 'LISTA', 'PAUSA', 'EN_PRODUCCION')), '[]'::jsonb),
    'usuarios', coalesce((
      select jsonb_agg(jsonb_build_object('username', i.datos->'username', 'rol', i.datos->'rol', 'permisos', i.datos->'permisos',
                                          'linea', i.datos->'linea', 'authUid', i.datos->'authUid'))
        from public.fs_items i where i.coleccion = 'sync' and i.doc = 'users' and i.eliminado_en is null), '[]'::jsonb),
    'perfiles', coalesce((select d.datos->'map' from public.fs_docs d where d.coleccion = 'sync' and d.id = 'perfiles' and d.eliminado_en is null), '{}'::jsonb),
    'configAlertas', coalesce((select d.datos from public.fs_docs d where d.coleccion = 'sync' and d.id = 'configAlertas' and d.eliminado_en is null), '{}'::jsonb),
    'configIndicadores', coalesce((select d.datos from public.fs_docs d where d.coleccion = 'sync' and d.id = 'configIndicadores' and d.eliminado_en is null), '{}'::jsonb),
    'suscripciones', coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'uid', s.uid, 'p256dh', s.p256dh, 'auth', s.auth))
                                 from glacial_fs.push_suscripciones s), '[]'::jsonb)
  );
end $f$;

create or replace function public.push_vapid()
returns jsonb language sql stable security definer set search_path = ''
as $f$
  select jsonb_build_object(
    'publica', (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'push_vapid_publica' limit 1),
    'privada', (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'push_vapid_privada' limit 1))
$f$;

create or replace function public.push_vapid_guardar(p_publica text, p_privada text)
returns boolean language plpgsql security definer set search_path = ''
as $f$
begin
  if exists (select 1 from vault.secrets s where s.name in ('push_vapid_publica', 'push_vapid_privada')) then return false; end if;   -- nunca se reemplazan solas
  perform vault.create_secret(p_privada, 'push_vapid_privada', 'GLACIAL avisos-push: clave privada VAPID');
  perform vault.create_secret(p_publica, 'push_vapid_publica', 'GLACIAL avisos-push: clave pública VAPID');
  return true;
end $f$;

-- Marca como enviados los avisos nuevos y devuelve SOLO esos (los ya enviados no se repiten). Limpia lo de más de 3 días.
create or replace function public.push_marcar(p_claves text[])
returns text[] language plpgsql security definer set search_path = ''
as $f$
declare v text[];
begin
  delete from glacial_fs.push_enviados e where e.enviado_en < now() - interval '3 days';
  with nuevos as (
    insert into glacial_fs.push_enviados (clave) select distinct unnest(coalesce(p_claves, '{}'))
    on conflict (clave) do nothing returning clave)
  select coalesce(array_agg(clave), '{}') into v from nuevos;
  return v;
end $f$;

-- Resultado del envío: anota los que llegaron y borra los equipos que ya no existen (el navegador dio de baja la suscripción).
create or replace function public.push_resultado(p_ok text[], p_quitar text[])
returns void language plpgsql security definer set search_path = ''
as $f$
begin
  update glacial_fs.push_suscripciones s set ultimo_envio = now(), fallos = 0 where s.endpoint = any (coalesce(p_ok, '{}'));
  delete from glacial_fs.push_suscripciones s where s.endpoint = any (coalesce(p_quitar, '{}'));
end $f$;

revoke all on function public.push_verificar(text) from public, anon, authenticated;
revoke all on function public.push_datos() from public, anon, authenticated;
revoke all on function public.push_vapid() from public, anon, authenticated;
revoke all on function public.push_vapid_guardar(text, text) from public, anon, authenticated;
revoke all on function public.push_marcar(text[]) from public, anon, authenticated;
revoke all on function public.push_resultado(text[], text[]) from public, anon, authenticated;
grant execute on function public.push_verificar(text) to service_role;
grant execute on function public.push_datos() to service_role;
grant execute on function public.push_vapid() to service_role;
grant execute on function public.push_vapid_guardar(text, text) to service_role;
grant execute on function public.push_marcar(text[]) to service_role;
grant execute on function public.push_resultado(text[], text[]) to service_role;

-- ---------- Disparador cada minuto ----------
do $b$
begin
  if not exists (select 1 from vault.secrets s where s.name = 'push_avisos_secreto') then
    perform vault.create_secret(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
                                'push_avisos_secreto', 'GLACIAL avisos-push: clave del disparador (pg_cron → función)');
  end if;
end $b$;

create or replace function public.push_disparar()
returns void language plpgsql security definer set search_path = ''
as $f$
declare v_url text; v_sec text;
begin
  if to_regnamespace('net') is null then return; end if;
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'push_avisos_url' limit 1;
  select s.decrypted_secret into v_sec from vault.decrypted_secrets s where s.name = 'push_avisos_secreto' limit 1;
  if coalesce(v_url, '') = '' or coalesce(v_sec, '') = '' then return; end if;            -- sin función desplegada: no hace nada
  perform net.http_post(url := v_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-glacial-push', v_sec), timeout_milliseconds := 20000);
end $f$;
revoke all on function public.push_disparar() from public, anon, authenticated;

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'glacial-avisos-push';
select cron.schedule('glacial-avisos-push', '* * * * *', 'select public.push_disparar()');
