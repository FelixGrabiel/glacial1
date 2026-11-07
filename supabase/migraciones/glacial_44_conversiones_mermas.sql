-- GLACIAL · glacial_44 · CONVERSIONES DE MERMAS EN EL ASISTENTE (apParametros/conversiones · js/asistente/95-conversiones.js)         *** APLICADA en PRUEBAS (07/11/2026) · PRODUCCIÓN pendiente ***
--
-- Por qué: las conversiones de merma (kg → UND, UND → kg) estaban fijas en el código. Ahora se cambian en
-- Asistente de Producción › Conversiones, con fecha de vigencia e historial; el Registro usa la vigente para la fecha del reporte.
-- Qué permite: crear y editar el documento apParametros/conversiones a quien tiene «administrar factores» (ap_fac),
-- con versión +1, historial +1, autor y hora del servidor, y entre 1 y 300 conversiones. Nunca se borra.
-- La lectura ya existía (apParametros: usuarios autenticados, salvo mantenimiento compartido). apParametros/merma sigue igual.
-- No cambia datos. Se puede ejecutar más de una vez. Si el punto de inserción no se encuentra exactamente una vez, se detiene sin cambiar nada.
-- Orden: PRUEBAS primero; PRODUCCIÓN con la aprobación del dueño.

do $m$
declare
  def text; cuenta integer;
  anc constant text := $a$return d = 'merma' and (fac or val) and autor and ver and hist$a$;
  bloque constant text := $b$-- glacial_44: conversiones de mermas (Asistente › Conversiones)
       if d = 'conversiones' then
         return fac and autor and ver and hist and n->>'id' = 'conversiones'
           and coalesce(glacial_fs.largo(n, meta->'conteos', 'conversiones') between 1 and 300, false);
       end if;
       $b$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if def is null then raise exception 'glacial_fs.autorizar no existe'; end if;
  if position('glacial_44' in def) > 0 then return; end if;                                   -- ya aplicada
  cuenta := (length(def) - length(replace(def, anc, ''))) / length(anc);
  if cuenta <> 1 then raise exception 'autorizar: punto de inserción encontrado % veces', cuenta; end if;
  def := replace(def, anc, bloque || anc);
  execute def;
end $m$;
