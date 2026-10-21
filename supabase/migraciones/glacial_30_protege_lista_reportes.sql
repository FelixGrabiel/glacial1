-- GLACIAL · glacial_30 · El servidor NO acepta un guardado que borre de golpe los reportes de líneas (sync/records)
--
-- Por qué: el 21/10/2026 a las 07:33 (Lima) un equipo que aún no había terminado de cargar la lista de reportes guardó UN reporte con un «set» a ciegas
-- (el puente envía entonces «la lista enviada es la lista completa») y el servidor dio de baja los otros 102 (26/09 → 21/10). Quedaron marcados como
-- borrados (no se pierde nada) y se restauraron desde la base, pero nada impedía que volviera a pasar.
--
-- Qué hace: en autorizar, antes de la regla de la colección «sync», agrega para el documento records:
--   · borrar el documento completo: NUNCA (se rechaza);
--   · actualizarlo dejando 6 o más reportes menos que antes de ese guardado (items_antes − items_despues > 5): se rechaza.
--   Borrar un reporte suelto o unos pocos (hasta 5) sigue funcionando igual. Una limpieza masiva intencional se hace desde SQL (no desde la página).
-- Los números salen del propio servidor (meta.items_antes / meta.items_despues, calculados con las filas reales de fs_items): no dependen del equipo.
-- Ancla: «\n if c = 'sync' then» debe aparecer exactamente una vez; si no, la migración se detiene sin cambiar nada. Se puede ejecutar más de una vez.
-- Orden: PRUEBAS primero, PRODUCCION después. No depende de otras migraciones.

do $m$
declare
  def text; cuenta integer;
  anc constant text := E'\n if c = ''sync'' then';
  rep constant text := $a$
 if c = 'sync' and d = 'records' then                                   -- protección de la lista de reportes (glacial_30)
   if accion = 'delete' then return false; end if;
   if accion = 'update'
      and coalesce((meta->>'items_antes')::integer, 0) - coalesce((meta->>'items_despues')::integer, coalesce((meta->>'items_antes')::integer, 0)) > 5 then
     return false;
   end if;
 end if;
$a$ || anc;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if position('protección de la lista de reportes (glacial_30)' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc, ''))) / length(anc);
    if cuenta <> 1 then raise exception 'autorizar: ancla de sync encontrada % veces', cuenta; end if;
    execute replace(def, anc, rep);
  end if;
end $m$;
