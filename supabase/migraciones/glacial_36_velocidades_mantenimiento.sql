-- GLACIAL · glacial_36 · VELOCIDADES ESTÁNDAR ADMINISTRADAS POR MANTENIMIENTO (con historial)                    *** NO APLICADA en PRODUCCIÓN (aplicar primero en PRUEBAS) ***
--
-- Qué hace
--  La pantalla «Mantenimiento › Velocidades estándar» (js/mantenimiento/69-velocidades-estandar.js) escribe tres campos de sync/configIndicadores:
--    velocidades (la vigente, que ya leen Planificación, Resumen y Registro), velocidadesVigencia (desde cuándo rige y quién la puso) y
--    velocidadesHistorial (lo anterior). Hasta ahora esos campos solo los podían escribir Administrador y Jefatura (marca «umbrales») o quien
--    planifica (solo «velocidades»). Esta migración agrega UNA rama a glacial_fs.autorizar: quien tiene la marca «supmtto» (Administrador y
--    quienes tienen el permiso moduloMantenimiento; la cuenta compartida de Mantenimiento NO) puede ACTUALIZAR el documento configIndicadores
--    tocando SOLO esos cinco campos (los tres de velocidad y actualizadoPor/actualizadoEn). No puede crear ni borrar el documento ni tocar metas.
--  No cambia ninguna otra regla; no toca datos. Se puede ejecutar más de una vez (si la rama ya está, no hace nada).
--
-- ANTES DE APLICAR
--  · Orden: PRIMERO PRUEBAS (mvxjopvnnagqytegtexi); probar con una cuenta de Mantenimiento; solo después PRODUCCION (ehtbwmvwoxcdefvlxttu) con la aprobación del dueño.
--  · Si el punto de inserción no se encuentra exactamente una vez, la migración se detiene con un mensaje y no cambia nada.

do $m$
declare
  def text; cuenta integer;
  anc constant text := $a$          or (d = 'catalogoPlanificacion' and (k->>'planifica')::boolean)$a$;
  rama constant text := $r$          or (d = 'configIndicadores' and (k->>'supmtto')::boolean and accion = 'update'
              and glacial_fs.afectadas(v, n) <@ array['velocidades','velocidadesVigencia','velocidadesHistorial','actualizadoPor','actualizadoEn'])
$r$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if def is null then raise exception 'glacial_fs.autorizar no existe'; end if;
  if position('velocidadesVigencia' in def) > 0 then return; end if;                      -- ya aplicada
  cuenta := (length(def) - length(replace(def, anc, ''))) / length(anc);
  if cuenta <> 1 then raise exception 'autorizar: punto de inserción encontrado % veces', cuenta; end if;
  execute replace(def, anc, rama || anc);
end $m$;
