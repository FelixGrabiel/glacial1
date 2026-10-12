-- GLACIAL · glacial_21 · Reglas con listas partidas + Mantenimiento (intervenciones y planes preventivos)
--
-- Problema: el puente parte en filas de fs_items toda lista de objetos con id único (historial, novedades, tareas…). Esas listas
-- NO llegan dentro de los datos que reciben las reglas (glacial_fs.autorizar), así que una regla que exige
-- jsonb_typeof(n->'lista') = 'array' rechaza el guardado. Afectaba a entregasTurno (con novedades) y a las reglas preparadas de
-- intervenciones y planesPreventivos.
--
-- Cambios:
--  1) fs_commit_base pasa a las reglas, en meta: conteos (después), conteos_antes y partes_tocadas (listas partidas que cambiaron).
--  2) glacial_fs.largo(datos, conteos, campo): largo de una lista, esté partida o dentro de los datos (null si no es lista).
--  3) autorizar: entregasTurno y compromisosProgramacion usan largo(); afect_t = afect + listas partidas que cambiaron
--     (equivale a affectedKeys de Firestore); nuevas ramas intervenciones y planesPreventivos.
--  4) puede_leer: intervenciones y planesPreventivos (cuenta compartida, quien lee la bitácora o el supervisor de Mantenimiento).
-- Se puede ejecutar más de una vez.

create or replace function glacial_fs.largo(p_datos jsonb, p_conteos jsonb, p_campo text)
returns integer
language sql
immutable
set search_path = ''
as $f$
  select case
    when coalesce(p_conteos, '{}'::jsonb) ? p_campo then (p_conteos->>p_campo)::integer
    when jsonb_typeof(p_datos->p_campo) = 'array' then jsonb_array_length(p_datos->p_campo)
  end
$f$;
revoke all on function glacial_fs.largo(jsonb, jsonb, text) from public, anon, authenticated;

do $m$
declare
  def text; nuevo text;
  -- 1) fs_commit_base
  anc_meta constant text := $a$'items_lista', v_items_despues is not null);$a$;
  rep_meta constant text := $a$'items_lista', v_items_despues is not null,
      'conteos', v_conteos,
      'conteos_antes', coalesce(v_antes, '{}'::jsonb),
      'partes_tocadas', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (
          select tt.key x from jsonb_each(case when jsonb_typeof(op->'partes') = 'object' then op->'partes' else '{}'::jsonb end) as tt(key, value)
           where (jsonb_typeof(tt.value->'up') = 'array' and jsonb_array_length(tt.value->'up') > 0)
              or (jsonb_typeof(tt.value->'del') = 'array' and jsonb_array_length(tt.value->'del') > 0)
              or coalesce((tt.value->>'todo')::boolean, false)
          union select p from unnest(v_previas) p where not (p = any(v_partes))) s));$a$;
  -- 3) autorizar
  anc_decl constant text := 'afect text[]; a text;';
  rep_decl constant text := 'afect text[]; a text; afect_t text[];';
  anc_afect constant text := 'afect := glacial_fs.afectadas(v, n);';
  rep_afect constant text := $a$afect := glacial_fs.afectadas(v, n);
 afect_t := afect || coalesce((select array_agg(x) from jsonb_array_elements_text(
              case when jsonb_typeof(meta->'partes_tocadas') = 'array' then meta->'partes_tocadas' else '[]'::jsonb end) x), '{}'::text[]);$a$;
  anc_nov constant text := $a$jsonb_typeof(n->'novedades') = 'array' and jsonb_array_length(n->'novedades') <= 30$a$;
  rep_nov constant text := $a$coalesce(glacial_fs.largo(n, meta->'conteos', 'novedades') <= 30, false)$a$;
  anc_ent1 constant text := $a$and afect <@ array['resumen','novedades','actualizadaEn','actualizaciones']$a$;
  rep_ent1 constant text := $a$and afect_t <@ array['resumen','novedades','actualizadaEn','actualizaciones']$a$;
  anc_ent2 constant text := $a$and afect <@ array['estado','recibeUid','recibePor','recibeNombre','recibidaEn','observacionRecibe']$a$;
  rep_ent2 constant text := $a$and afect_t <@ array['estado','recibeUid','recibePor','recibeNombre','recibidaEn','observacionRecibe']$a$;
  anc_fil constant text := $a$and jsonb_typeof(n->'filas') = 'array'$a$;
  rep_fil constant text := $a$and glacial_fs.largo(n, meta->'conteos', 'filas') is not null$a$;
  anc_fin constant text := E'\n end if;\n return false;';
  rama_mtto constant text := $r$
 elsif c = 'intervenciones' then
   if accion = 'delete' then return false; end if;
   if accion = 'create' then
     return (mant or (k->>'supmtto')::boolean) and not solo
       and array['id','version','linea','tipo','estado','abierta','problema','abiertaUid','abiertaEn','abiertaMs','historial','actualizadaUid','actualizadaEn'] <@ claves
       and n->>'id' = d and n->'version' = '1'::jsonb
       and n->>'linea' in ('PET1','PET2','B7L','C20L','B20L')
       and n->>'estado' in ('PENDIENTE','EN_INTERVENCION') and n->'abierta' = 'true'::jsonb
       and n->>'abiertaUid' = u and n->'abiertaEn' = ahora and n->>'actualizadaUid' = u and n->'actualizadaEn' = ahora
       and coalesce(glacial_fs.largo(n, meta->'conteos', 'historial') = 1, false);
   end if;
   return (mant or (k->>'supmtto')::boolean) and not solo
     and jsonb_typeof(n->'version') = 'number' and jsonb_typeof(v->'version') = 'number' and (n->>'version')::numeric = (v->>'version')::numeric + 1
     and n->>'actualizadaUid' = u and n->'actualizadaEn' = ahora
     and coalesce(glacial_fs.largo(n, meta->'conteos', 'historial')
                  = coalesce(glacial_fs.largo(v, meta->'conteos_antes', 'historial'), 0) + 1, false)
     and not (afect_t && array['id','abiertaUid','abiertaEn','abiertaMs','abiertaPor','origen'])
     and v->>'estado' <> 'CANCELADA'
     and (v->>'estado' <> 'CERRADA' or (n->>'estado' = 'CERRADA'
          and (afect_t <@ array['seguimiento','evidencias','historial','version','actualizadaEn','actualizadaUid'] or (k->>'supmtto')::boolean)));
 elsif c = 'planesPreventivos' then
   if accion = 'delete' then return false; end if;
   if accion = 'create' then
     return (k->>'supmtto')::boolean and not solo
       and array['id','equipoId','titulo','frecuencia','proximaFecha','tareas','rev','version','actualizadaUid','actualizadaEn'] <@ claves
       and n->>'id' = d and n->'rev' = '1'::jsonb
       and coalesce(glacial_fs.largo(n, meta->'conteos', 'tareas') between 1 and 30, false)
       and n->>'actualizadaUid' = u and n->'actualizadaEn' = ahora;
   end if;
   return jsonb_typeof(n->'rev') = 'number' and jsonb_typeof(v->'rev') = 'number' and (n->>'rev')::numeric = (v->>'rev')::numeric + 1
     and n->>'actualizadaUid' = u and n->'actualizadaEn' = ahora
     and (((k->>'supmtto')::boolean and not solo)
          or (mant and not solo
              and afect_t <@ array['proximaFecha','fechaOriginal','ultimaEjecucion','reprogramaciones','rev','actualizadaEn','actualizadaUid']));
$r$;
  -- 4) puede_leer
  anc_leer constant text := E'\n end if;\n return false;';
  rama_leer constant text := E'\n elsif c in (''intervenciones'',''planesPreventivos'') then return aut and (mant or (k->>''bitacora'')::boolean or (k->>''supmtto'')::boolean);';
  cuenta integer;
begin
  -- 1) fs_commit_base
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'fs_commit_base';
  if position('partes_tocadas' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_meta, ''))) / length(anc_meta);
    if cuenta <> 1 then raise exception 'fs_commit_base: punto de inserción encontrado % veces', cuenta; end if;
    execute replace(def, anc_meta, rep_meta);
  end if;

  -- 3) autorizar
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if position('afect_t' in def) = 0 then
    nuevo := def;
    foreach def in array array[anc_decl, anc_afect, anc_ent1, anc_ent2, anc_fil, anc_fin] loop
      cuenta := (length(nuevo) - length(replace(nuevo, def, ''))) / length(def);
      if cuenta <> 1 then raise exception 'autorizar: «%» encontrado % veces', def, cuenta; end if;
    end loop;
    if (length(nuevo) - length(replace(nuevo, anc_nov, ''))) / length(anc_nov) <> 2 then raise exception 'autorizar: novedades no aparece 2 veces'; end if;
    if position('intervenciones' in nuevo) > 0 then raise exception 'autorizar: ya tiene intervenciones'; end if;
    nuevo := replace(nuevo, anc_decl, rep_decl);
    nuevo := replace(nuevo, anc_afect, rep_afect);
    nuevo := replace(nuevo, anc_nov, rep_nov);
    nuevo := replace(nuevo, anc_ent1, rep_ent1);
    nuevo := replace(nuevo, anc_ent2, rep_ent2);
    nuevo := replace(nuevo, anc_fil, rep_fil);
    nuevo := replace(nuevo, anc_fin, rama_mtto || anc_fin);
    execute nuevo;
  end if;

  -- 4) puede_leer
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if position('intervenciones' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_leer, ''))) / length(anc_leer);
    if cuenta <> 1 then raise exception 'puede_leer: punto de inserción encontrado % veces', cuenta; end if;
    execute replace(def, anc_leer, rama_leer || anc_leer);
  end if;
end $m$;
