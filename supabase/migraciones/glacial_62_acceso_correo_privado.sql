-- GLACIAL · glacial_62 · El mapa usuario → correo de «sync/accesos» deja de ser público   *** PENDIENTE: ni PRUEBAS ni PRODUCCION ***
--
-- Por qué (auditoría de seguridad 18/11/2026): cualquiera, sin iniciar sesión, podía leer sync/accesos y obtener la lista completa de usuarios
-- con su correo interno (útil para ataques de adivinar contraseñas).
-- Qué hace:
--   1) Crea public.fs_acceso_correo(usuario) → correo de UN usuario (o null). El login la usa en lugar de leer todo el documento.
--      (Adivinar nombres uno por uno sigue siendo posible, pero ya no se puede listar a todo el personal.)
--   2) glacial_fs.puede_leer: sync/accesos pasa a exigir sesión iniciada con perfil (aut). Las cuentas con sesión lo siguen leyendo igual.
-- Orden de despliegue: primero esta migración y luego la página (la página nueva usa la función; la vieja, hasta que se actualice, deja de poder
-- iniciar sesión → se publica la página justo después). La página nueva, si la función no existe, cae al método anterior.
-- Ancla: «return d = 'accesos'» exactamente una vez en puede_leer; si no, se detiene sin cambiar nada. Se puede ejecutar más de una vez.
-- Orden: PRUEBAS primero, PRODUCCION después (solo cuando el dueño diga «Aplica en producción»).

create or replace function public.fs_acceso_correo(p_usuario text)
returns text language sql stable security definer set search_path = ''
as $f$
  select d.datos->'map'->>lower(btrim(left(coalesce(p_usuario, ''), 60)))
    from public.fs_docs d
   where d.coleccion = 'sync' and d.id = 'accesos' and d.eliminado_en is null
$f$;
revoke all on function public.fs_acceso_correo(text) from public;
grant execute on function public.fs_acceso_correo(text) to anon, authenticated;

do $m$
declare
  def text; cuenta integer;
  anc constant text := 'return d = ''accesos''';
  rep constant text := 'return (d = ''accesos'' and aut)';
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if position(rep in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc, ''))) / length(anc);
    if cuenta <> 1 then raise exception 'puede_leer: ancla de accesos encontrada % veces', cuenta; end if;
    execute replace(def, anc, rep);
  end if;
end $m$;
