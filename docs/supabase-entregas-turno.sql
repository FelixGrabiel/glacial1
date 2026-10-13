-- Regla de Supabase para la colección «entregasTurno» (equivalente al bloque match /entregasTurno/{id} de firestore.rules.etapa2.txt).
-- Se aplica sobre las funciones glacial_fs.puede_leer y glacial_fs.autorizar tomando su definición actual y agregando una rama:
-- no reescribe ninguna otra regla y se puede ejecutar más de una vez (si la rama ya existe, no hace nada).
-- Orden: primero PRUEBAS (mvxjopvnnagqytegtexi), después PRODUCCION (ehtbwmvwoxcdefvlxttu).
do $m$
declare
  def_leer text; def_aut text;
  rama_leer constant text := E' then return aut and not mant;
 elsif c = ''entregasTurno'' then return aut and not mant;
 end if;';
  rama_aut constant text := $r$
 elsif c = 'entregasTurno' then
   if accion = 'create' then
     return (k->>'opera')::boolean
       and array['fecha','turno','estado','resumen','novedades','entregaUid','entregaPor','entregaNombre','entregadaEn'] <@ claves
       and claves <@ array['fecha','turno','estado','resumen','novedades','entregaUid','entregaPor','entregaNombre','entregadaEn']
       and n->>'turno' in ('DIA','INTERMEDIO','NOCHE') and d = (n->>'fecha') || '_' || (n->>'turno')
       and n->>'estado' = 'ENTREGADA'
       and jsonb_typeof(n->'novedades') = 'array' and jsonb_array_length(n->'novedades') <= 30
       and n->>'entregaUid' = u and n->'entregadaEn' = ahora;
   end if;
   return (k->>'opera')::boolean and v->>'estado' = 'ENTREGADA' and (
       (coalesce(v->>'entregaUid','') = u                                  -- corregir: solo quien entregó
        and afect <@ array['resumen','novedades','actualizadaEn','actualizaciones']
        and jsonb_typeof(n->'novedades') = 'array' and jsonb_array_length(n->'novedades') <= 30
        and n->'actualizadaEn' = ahora)
    or (coalesce(v->>'entregaUid','') <> u                                 -- recibir: otro usuario
        and n->>'estado' = 'RECIBIDA'
        and afect <@ array['estado','recibeUid','recibePor','recibeNombre','recibidaEn','observacionRecibe']
        and array['estado','recibeUid','recibePor','recibeNombre','recibidaEn'] <@ afect
        and n->>'recibeUid' = u and n->'recibidaEn' = ahora));
$r$;
  anc_leer constant text := E' then return aut and not mant;
 end if;';      -- último elsif de puede_leer
  anc_aut  constant text := E'\n end if;\n return false;';
begin
  select pg_get_functiondef(p.oid) into def_leer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='glacial_fs' and p.proname='puede_leer';
  select pg_get_functiondef(p.oid) into def_aut  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='glacial_fs' and p.proname='autorizar';
  if position('entregasTurno' in def_leer) = 0 then
    if position(anc_leer in def_leer) = 0 then raise exception 'puede_leer: no se encontró el punto de inserción'; end if;
    execute replace(def_leer, anc_leer, rama_leer);
  end if;
  if position('entregasTurno' in def_aut) = 0 then
    if position(anc_aut in def_aut) = 0 then raise exception 'autorizar: no se encontró el punto de inserción'; end if;
    execute replace(def_aut, anc_aut, rama_aut || anc_aut);
  end if;
end $m$;
