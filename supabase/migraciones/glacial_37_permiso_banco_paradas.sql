-- GLACIAL · glacial_37 · PERMISO «ver_banco_paradas» (Banco de paradas por clasificar)                                  *** NO APLICADA en PRODUCCIÓN (aplicar primero en PRUEBAS) ***
--
-- Qué hace
--  El Banco de paradas (Mantenimiento › Intervenciones y equipos › Banco de paradas) lee la colección reclasificacionesParada, que hoy solo lee la marca «bitacora»
--  (Administrador, Jefatura, Supervisores, rotación de mantenimiento y «ver_bitacora_mantenimiento»). Esta migración agrega UNA condición a glacial_fs.ctx: quien tiene el permiso
--  nuevo «ver_banco_paradas» también recibe la marca «bitacora» (lectura). No da ninguna escritura.
--  No cambia ningún dato. Se puede ejecutar más de una vez (si ya está, no hace nada).
--
-- ANTES DE APLICAR: PRUEBAS (mvxjopvnnagqytegtexi) primero; PRODUCCION (ehtbwmvwoxcdefvlxttu) solo con la aprobación del dueño.

do $m$
declare
  def text; cuenta integer;
  anc constant text := $a$or glacial_fs.tiene(perm,'ver_bitacora_mantenimiento'));$a$;
  nuevo constant text := $r$or glacial_fs.tiene(perm,'ver_bitacora_mantenimiento') or glacial_fs.tiene(perm,'ver_banco_paradas'));$r$;
begin
  select pg_get_functiondef('glacial_fs.ctx()'::regprocedure) into def;
  if position('ver_banco_paradas' in def) > 0 then return; end if;                       -- ya aplicada
  cuenta := (length(def) - length(replace(def, anc, ''))) / length(anc);
  if cuenta <> 1 then raise exception 'ctx: punto de inserción encontrado % veces', cuenta; end if;
  execute replace(def, anc, nuevo);
end $m$;
