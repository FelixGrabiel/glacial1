-- GLACIAL · glacial_28 · El Asistente de Producción puede CORREGIR una merma que sigue PENDIENTE de validar
--
-- Por qué: en la previsualización del reporte (Historial › Reportes) la Asistente corrige errores de captura (cantidad, insumo, cuadro, causa…)
-- en el dato original. Hasta ahora una merma solo la cambiaba quien valida (VALIDADA / RECHAZADA).
-- Qué hace: en autorizar, rama apMermas, antes de la regla de quien valida agrega:
--   «Asistente (ap_asis) + autor + versión +1 + historial +1, la merma estaba PENDIENTE y sigue PENDIENTE, y no cambian id, fecha, bloque, línea ni
--    creador; la cantidad sigue siendo un número > 0».
--   Una merma ya VALIDADA o RECHAZADA no se puede editar (queda como estaba). Cada corrección queda en el historial y en apAuditoria.
-- Ancla: la línea «return val and autor and ver and hist and v->>'estado' = 'PENDIENTE' and n->>'estado' in ('VALIDADA','RECHAZADA')» debe aparecer
--   exactamente una vez; si no, la migración se detiene sin cambiar nada. Requiere glacial_23. Se puede ejecutar más de una vez.
-- Orden: PRUEBAS primero, PRODUCCION después.

do $m$
declare
  def text; cuenta integer;
  anc constant text := $a$       return val and autor and ver and hist and v->>'estado' = 'PENDIENTE' and n->>'estado' in ('VALIDADA','RECHAZADA')$a$;
  rep constant text := $a$       if asis and autor and ver and hist and v->>'estado' = 'PENDIENTE' and n->>'estado' = 'PENDIENTE'
          and coalesce(n->'id' = v->'id', false) and coalesce(n->'fecha' = v->'fecha', false) and coalesce(n->'bloque' = v->'bloque', false)
          and coalesce(n->'linea' = v->'linea', false) and coalesce(n->'creadoUid' = v->'creadoUid', false)
          and jsonb_typeof(n->'cantidad') = 'number' and (n->>'cantidad')::numeric > 0 then
         return true;                                                    -- corrección de la Asistente mientras está PENDIENTE
       end if;
$a$ || anc;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if position('corrección de la Asistente mientras está PENDIENTE' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc, ''))) / length(anc);
    if cuenta <> 1 then raise exception 'autorizar: ancla de apMermas encontrada % veces (¿falta glacial_23?)', cuenta; end if;
    execute replace(def, anc, rep);
  end if;
end $m$;
