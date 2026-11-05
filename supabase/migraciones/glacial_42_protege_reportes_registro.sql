-- GLACIAL · glacial_42 · Permisos del Registro de producción en el SERVIDOR (auditoría 2026-11-05, punto 2)
--
-- Por qué: los permisos para eliminar, reabrir o corregir reportes solo existían en la pantalla. Cualquier cuenta con sesión que pudiera
-- escribir sync/records (RRHH, Almacén…) podía, desde la consola del navegador, cambiar un reporte FINALIZADO o eliminar reportes.
-- autorizar() solo ve el documento sync/records completo, no cada reporte: por eso la regla va en un disparador sobre public.fs_items,
-- que ve cada reporte (fila) antes y después del cambio, con el usuario de la sesión (auth.uid()).
--
-- Qué hace (solo para sesiones de usuarios; el SQL del administrador y las tareas programadas no se tocan):
--   1) Eliminar un reporte (eliminado_en pasa de vacío a fecha) o recuperar uno eliminado: Administrador o permiso «eliminarRegistros».
--   2) Sacar un reporte de FINALIZADO (reabrirlo o volverlo a «En registro»): Administrador o permiso «reabrirReporteProduccion».
--   3) Cambiar el contenido de un reporte FINALIZADO que sigue finalizado (correcciones de paradas desde Avance, sugerencias, fotos):
--      Administrador, quien opera Producción (ctx: opera / resumen), quien corrige paradas (corrige) o quien puede reabrir.
--   Lo que no cambia de verdad (el mismo contenido reenviado) no se revisa. Los reportes nuevos y los abiertos siguen como antes (autorizar).
--   4) Colección nueva auditoriaRegistros: constancia de cada eliminación (quién, cuándo, motivo y copia del reporte para recuperarlo).
--      Se crea una vez por quien tiene sesión (no cuenta compartida ni solo consulta), con su uid y la hora del servidor; no se edita ni se
--      borra. La leen el Administrador y Jefatura.
-- Error al rechazar: 42501 (permission-denied), que la página ya traduce («El servidor no guardó…»).
-- Se puede ejecutar más de una vez. Orden: PRUEBAS primero; PRODUCCIÓN con la aprobación del dueño.

create or replace function glacial_fs.proteger_registros() returns trigger
language plpgsql security definer set search_path = '' as $f$
declare
  u uuid := auth.uid(); p jsonb; perm jsonb; rol text; v_admin boolean; k jsonb;
begin
  if u is null then return new; end if;                                            -- SQL del administrador, tareas programadas
  if new.coleccion <> 'sync' or new.doc <> 'records' then return new; end if;
  select d.datos->'map'->(u::text) into p from public.fs_docs d
   where d.coleccion = 'sync' and d.id = 'perfiles' and d.eliminado_en is null;
  rol := coalesce(p->>'rol', ''); perm := p->'permisos';
  v_admin := rol = 'Administrador' or perm = '"todos"'::jsonb;

  -- 1) eliminar o recuperar un reporte
  if (old.eliminado_en is null) <> (new.eliminado_en is null) then
    if v_admin or glacial_fs.tiene(perm, 'eliminarRegistros') then return new; end if;
    raise exception 'permission-denied: no tienes permiso para eliminar o recuperar reportes de producción' using errcode = '42501';
  end if;

  -- 2) y 3) reporte finalizado
  if old.eliminado_en is null and coalesce(old.datos->>'estadoRegistro', '') = 'FINALIZADO' and new.datos is distinct from old.datos then
    if coalesce(new.datos->>'estadoRegistro', '') <> 'FINALIZADO' then
      if v_admin or glacial_fs.tiene(perm, 'reabrirReporteProduccion') then return new; end if;
      raise exception 'permission-denied: solo quien tiene permiso puede reabrir un reporte finalizado' using errcode = '42501';
    end if;
    k := glacial_fs.ctx();
    if v_admin or coalesce((k->>'opera')::boolean, false) or coalesce((k->>'resumen')::boolean, false)
       or coalesce((k->>'corrige')::boolean, false) or glacial_fs.tiene(perm, 'reabrirReporteProduccion') then
      return new;
    end if;
    raise exception 'permission-denied: no puedes modificar un reporte de producción finalizado' using errcode = '42501';
  end if;

  return new;
end $f$;

drop trigger if exists fs_items_proteger_registros on public.fs_items;
create trigger fs_items_proteger_registros
  before update on public.fs_items
  for each row when (new.coleccion = 'sync' and new.doc = 'records')
  execute function glacial_fs.proteger_registros();

-- 4) auditoriaRegistros en autorizar (escritura) y puede_leer (lectura)
do $m$
declare
  def text; cuenta integer;
  anc_aut constant text := E'\n elsif c = ''solicitudesCorreccionTareo'' then';
  rama_aut constant text := E'\n elsif c = ''auditoriaRegistros'' then                                -- constancias de eliminación (glacial_42)\n   return accion = ''create'' and aut and not mant and not solo and n->>''uid'' = u and n->''timestamp'' = ahora and n->>''accion'' = ''ELIMINAR'';';
  anc_leer constant text := E'\n end if;\n return false;';
  rama_leer constant text := E'\n elsif c = ''auditoriaRegistros'' then return coalesce((k->>''admin'')::boolean, false) or coalesce((k->>''jef'')::boolean, false);';
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if position('constancias de eliminación (glacial_42)' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_aut, ''))) / length(anc_aut);
    if cuenta <> 1 then raise exception 'glacial_42: ancla de autorizar encontrada % veces', cuenta; end if;
    execute replace(def, anc_aut, rama_aut || anc_aut);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if position('''auditoriaRegistros''' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_leer, ''))) / length(anc_leer);
    if cuenta <> 1 then raise exception 'glacial_42: ancla de puede_leer encontrada % veces', cuenta; end if;
    execute replace(def, anc_leer, rama_leer || anc_leer);
  end if;
end $m$;
