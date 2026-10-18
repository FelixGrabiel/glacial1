-- ⚠ NO EJECUTAR: este archivo quedó REEMPLAZADO por la migración glacial_21_listas_partidas_mantenimiento (supabase/migraciones/), ya aplicada en PRUEBAS y
-- PRODUCCIÓN el 12-10-2026. Tenía un error: el puente guarda aparte las listas de objetos con id (historial, tareas…) y esas listas no llegan dentro de «n» en
-- glacial_fs.autorizar, así que jsonb_typeof(n->'historial') = 'array' rechazaba el guardado. glacial_21 usa glacial_fs.largo() y meta->'partes_tocadas'.
-- Se conserva solo como referencia histórica.
--
-- Reglas de Supabase para «intervenciones» y «planesPreventivos» (equivalentes a los bloques match /intervenciones/{id} y /planesPreventivos/{id} de
-- _archivo/firebase/firestore.rules.etapa2.txt). NO SE HAN APLICADO: preparado para revisar y aplicar primero en PRUEBAS (mvxjopvnnagqytegtexi) y después en PRODUCCION
-- (ehtbwmvwoxcdefvlxttu), como el resto de cambios de reglas (docs/00-general/puente-supabase.md). Agrega una rama a glacial_fs.puede_leer y a glacial_fs.autorizar sin tocar
-- las demás y se puede ejecutar más de una vez.
--   · Leer: la cuenta compartida (k.mant) y quien lee la bitácora (k.bitacora: Administrador, jefatura, supervisores, permisos de Mantenimiento).
--   · Escribir intervenciones: cuenta compartida o Supervisor de Mantenimiento/Administrador (k.mant / k.supmtto), sin cuentas de solo consulta (k.solo).
--   · Planes: los define k.supmtto; la cuenta compartida solo avanza el ciclo (proximaFecha, fechaOriginal, ultimaEjecucion, reprogramaciones, rev).
-- LIMITACIÓN conocida (igual que la cuenta compartida de Mantenimiento): el servidor no valida el PIN del técnico; el nombre del técnico es trazabilidad.
do $m$
declare
  def_leer text; def_aut text;
  anc_leer constant text := ' then return aut and not mant;
 end if;';
  rama_leer constant text := ' then return aut and not mant;
 elsif c in (''intervenciones'',''planesPreventivos'') then return aut and (mant or (k->>''bitacora'')::boolean);
 end if;';
  rama_aut constant text := $r$
 elsif c = 'intervenciones' then
   if accion = 'delete' then return false; end if;
   if accion = 'create' then
     return (mant or (k->>'supmtto')::boolean) and not solo
       and array['id','version','linea','tipo','estado','abierta','problema','abiertaUid','abiertaEn','abiertaMs','historial','actualizadaUid','actualizadaEn'] <@ claves
       and n->>'id' = d and n->'version' = '1'::jsonb
       and n->>'linea' in ('PET1','PET2','B7L','C20L','B20L')
       and n->>'estado' in ('PENDIENTE','EN_INTERVENCION') and n->'abierta' = 'true'::jsonb
       and n->>'abiertaUid' = u and n->'abiertaEn' = ahora and n->>'actualizadaUid' = u and n->'actualizadaEn' = ahora
       and jsonb_typeof(n->'historial') = 'array' and jsonb_array_length(n->'historial') = 1;
   end if;
   return (mant or (k->>'supmtto')::boolean) and not solo
     and jsonb_typeof(n->'version') = 'number' and jsonb_typeof(v->'version') = 'number' and (n->>'version')::numeric = (v->>'version')::numeric + 1
     and n->>'actualizadaUid' = u and n->'actualizadaEn' = ahora
     and jsonb_typeof(n->'historial') = 'array' and jsonb_array_length(n->'historial') = jsonb_array_length(coalesce(v->'historial','[]'::jsonb)) + 1
     and not (afect && array['id','abiertaUid','abiertaEn','abiertaMs','abiertaPor','origen'])
     and v->>'estado' <> 'CANCELADA'
     and (v->>'estado' <> 'CERRADA' or (n->>'estado' = 'CERRADA'
          and (afect <@ array['seguimiento','evidencias','historial','version','actualizadaEn','actualizadaUid'] or (k->>'supmtto')::boolean)));
 elsif c = 'planesPreventivos' then
   if accion = 'delete' then return false; end if;
   if accion = 'create' then
     return (k->>'supmtto')::boolean and not solo
       and array['id','equipoId','titulo','frecuencia','proximaFecha','tareas','rev','version','actualizadaUid','actualizadaEn'] <@ claves
       and n->>'id' = d and n->'rev' = '1'::jsonb
       and jsonb_typeof(n->'tareas') = 'array' and jsonb_array_length(n->'tareas') between 1 and 30
       and n->>'actualizadaUid' = u and n->'actualizadaEn' = ahora;
   end if;
   return jsonb_typeof(n->'rev') = 'number' and jsonb_typeof(v->'rev') = 'number' and (n->>'rev')::numeric = (v->>'rev')::numeric + 1
     and n->>'actualizadaUid' = u and n->'actualizadaEn' = ahora
     and (((k->>'supmtto')::boolean and not solo)
          or ((mant or (k->>'supmtto')::boolean) and not solo
              and afect <@ array['proximaFecha','fechaOriginal','ultimaEjecucion','reprogramaciones','rev','actualizadaEn','actualizadaUid']));
$r$;
  anc_aut constant text := E'\n end if;\n return false;';
begin
  select pg_get_functiondef(p.oid) into def_leer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='glacial_fs' and p.proname='puede_leer';
  select pg_get_functiondef(p.oid) into def_aut  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='glacial_fs' and p.proname='autorizar';
  if position('intervenciones' in def_leer) = 0 then
    if position(anc_leer in def_leer) = 0 then raise exception 'puede_leer: no se encontró el punto de inserción'; end if;
    execute replace(def_leer, anc_leer, rama_leer);
  end if;
  if position('intervenciones' in def_aut) = 0 then
    if position(anc_aut in def_aut) = 0 then raise exception 'autorizar: no se encontró el punto de inserción'; end if;
    execute replace(def_aut, anc_aut, rama_aut || anc_aut);
  end if;
end $m$;
