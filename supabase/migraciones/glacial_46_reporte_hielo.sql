-- GLACIAL · glacial_46 · REPORTE HIELO (js/hielo/97-hielo.js · docs/hielo/reporte-hielo.md)         *** APLICADA en PRUEBAS (07/11/2026) · PRODUCCIÓN pendiente ***
--
-- Colecciones nuevas:
--   · hieloReportes/{AAAA-MM-DD_TURNO}  un reporte por fecha y turno (producción en bolsas por marca y presentación, paradas, mermas).
--       Crear y editar: «opera» (Administrador, jefes de Producción/Operaciones, Supervisores), con id = documento y el autor = quien guarda.
--       Un reporte FINALIZADO solo lo cambia el Administrador (reabrir o corregir).
--   · hieloProgramacion/{AAAA-MM-DD_TURNO}  lo programado por turno: «planifica» o Administrador.
--   · hieloParametros/config  marcas, presentaciones, equipos, motivos de parada e ítems de merma: Administrador o jefes.
--   · Nada se borra. Nadie en modo Visualizar (solo) ni la cuenta compartida de mantenimiento escribe.
-- Lectura: cualquier usuario con sesión, salvo la cuenta compartida de mantenimiento.
-- No cambia datos. Se puede ejecutar más de una vez. Si un punto de inserción no se encuentra exactamente una vez, se detiene sin cambiar nada.
-- Orden: PRUEBAS primero; PRODUCCIÓN con la aprobación del dueño.

do $m$
declare
  def text; cuenta integer;
  anc_fin constant text := E'\n end if;\n return false;';
  rama_aut constant text := $r$
 elsif c in ('hieloReportes','hieloProgramacion','hieloParametros') then      -- glacial_46: Reporte Hielo
   declare
     solo2 boolean := coalesce((k->>'solo')::boolean, false);
     adm boolean := coalesce((k->>'admin')::boolean, false);
   begin
     if accion = 'delete' or solo2 or mant or not aut then return false; end if;
     if n->>'id' is distinct from d or n->>'actualizadoUid' is distinct from u then return false; end if;
     if c = 'hieloReportes' then
       if v is not null and v->>'estado' = 'FINALIZADO' and not adm then return false; end if;
       return coalesce((k->>'opera')::boolean, false) and n->>'estado' in ('EN_REGISTRO','FINALIZADO');
     elsif c = 'hieloProgramacion' then
       return adm or coalesce((k->>'planifica')::boolean, false);
     else
       return d = 'config' and (adm or coalesce((k->>'jef')::boolean, false));
     end if;
   end;
$r$;
  rama_leer constant text := E'\n elsif c in (''hieloReportes'',''hieloProgramacion'',''hieloParametros'') then return aut and not mant;  -- glacial_46';
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if def is null then raise exception 'glacial_fs.autorizar no existe'; end if;
  if position('glacial_46' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_fin, ''))) / length(anc_fin);
    if cuenta <> 1 then raise exception 'autorizar: punto de inserción encontrado % veces', cuenta; end if;
    execute replace(def, anc_fin, rama_aut || anc_fin);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if position('glacial_46' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_fin, ''))) / length(anc_fin);
    if cuenta <> 1 then raise exception 'puede_leer: punto de inserción encontrado % veces', cuenta; end if;
    execute replace(def, anc_fin, rama_leer || anc_fin);
  end if;
end $m$;
