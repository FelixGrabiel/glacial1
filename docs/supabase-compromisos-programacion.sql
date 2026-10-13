-- Regla de Supabase para la colección «compromisosProgramacion» (equivalente al bloque match /compromisosProgramacion/{id} de firestore.rules.etapa2.txt).
-- Compromiso original de un bloque: un documento por bloque (id = AAAA-MM-DD_DÍA|NOCHE), lo crea quien planifica una sola vez; nunca se edita ni se borra.
-- Agrega una rama a glacial_fs.puede_leer y glacial_fs.autorizar sin tocar las demás; se puede ejecutar más de una vez.
-- Orden: primero PRUEBAS (mvxjopvnnagqytegtexi), después PRODUCCION (ehtbwmvwoxcdefvlxttu).
do $m$
declare
  def_leer text; def_aut text;
  anc_leer constant text := 'elsif c = ''entregasTurno'' then return aut and not mant;';
  rama_aut constant text := $r$
 elsif c = 'compromisosProgramacion' then
   if accion <> 'create' then return false; end if;                      -- nunca se edita ni se borra
   return (k->>'planifica')::boolean and not solo
     and array['fecha','bloque','filas','inicioMs','creadoEn','uid'] <@ claves
     and n->>'bloque' in ('DÍA','NOCHE')
     and jsonb_typeof(n->'filas') = 'array'
     and d = (n->>'fecha') || '_' || (n->>'bloque')
     and n->>'uid' = u and n->'creadoEn' = ahora;
$r$;
  anc_aut constant text := E'\n end if;\n return false;';
begin
  select pg_get_functiondef(p.oid) into def_leer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='glacial_fs' and p.proname='puede_leer';
  select pg_get_functiondef(p.oid) into def_aut  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='glacial_fs' and p.proname='autorizar';
  if position('compromisosProgramacion' in def_leer) = 0 then
    if position(anc_leer in def_leer) = 0 then raise exception 'puede_leer: aplica antes glacial_20n_entregas_turno'; end if;
    execute replace(def_leer, anc_leer, anc_leer || E'\n elsif c = ''compromisosProgramacion'' then return aut and not mant;');
  end if;
  if position('compromisosProgramacion' in def_aut) = 0 then
    if position(anc_aut in def_aut) = 0 then raise exception 'autorizar: no se encontró el punto de inserción'; end if;
    execute replace(def_aut, anc_aut, rama_aut || anc_aut);
  end if;
end $m$;
