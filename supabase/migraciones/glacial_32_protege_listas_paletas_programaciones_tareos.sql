-- GLACIAL · glacial_32 · El servidor NO acepta un guardado que borre de golpe paletas, programaciones o tareos (sync/paletas, sync/programaciones, sync/tareos)   *** APLICADA EN PRUEBAS y en PRODUCCION el 2026-10-21 ***
--
-- Por qué: mismo riesgo que el incidente de reportes del 21/10/2026 (glacial_30): un equipo que no terminó de cargar la lista guarda «a ciegas» y el
-- servidor da de baja el resto. La página ya lo evita (js/nucleo/02-estado.js), esto es la segunda barrera en el servidor.
-- Qué hace (antes de la regla de la colección «sync», igual que glacial_30):
--   · borrar el documento completo: NUNCA;
--   · actualizarlo dejando MÁS DE 10 elementos menos que antes (meta.items_antes − meta.items_despues > 10): se rechaza.
--   Borrar o corregir unos pocos sigue funcionando. Una limpieza masiva intencional se hace desde SQL.
-- Ancla: «\n if c = 'sync' then» exactamente una vez; si no, se detiene sin cambiar nada. Se puede ejecutar más de una vez.
-- Orden: PRUEBAS primero, PRODUCCION después.

do $m$
declare
  def text; cuenta integer;
  anc constant text := E'\n if c = ''sync'' then';
  rep constant text := $a$
 if c = 'sync' and d in ('paletas', 'programaciones', 'tareos') then      -- protección de listas (glacial_32)
   if accion = 'delete' then return false; end if;
   if accion = 'update'
      and coalesce((meta->>'items_antes')::integer, 0) - coalesce((meta->>'items_despues')::integer, coalesce((meta->>'items_antes')::integer, 0)) > 10 then
     return false;
   end if;
 end if;
$a$ || anc;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if position('protección de listas (glacial_32)' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc, ''))) / length(anc);
    if cuenta <> 1 then raise exception 'autorizar: ancla de sync encontrada % veces', cuenta; end if;
    execute replace(def, anc, rep);
  end if;
end $m$;
