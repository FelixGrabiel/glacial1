-- GLACIAL · glacial_22 · Reglas de Supabase para «correccionesParada» y «reclasificacionesParada»
-- (equivalentes a los bloques match /correccionesParada/{id} y /reclasificacionesParada/{id} de firestore.rules.etapa2.txt).
--  1) ctx: nueva marca «corrige» = puedeCorregirParadas() (Administrador o permiso corregir_paradas; nunca la cuenta compartida
--     de Mantenimiento ni una cuenta en modo consulta).
--  2) glacial_fs.lista_solo_agrega(...): equivale a «la lista crece en uno y las entradas anteriores no cambian»
--     (historial.size() == anterior + 1 && historial[0:anterior] == anterior), funcione la lista partida o dentro del documento.
--  3) autorizar y puede_leer: ramas nuevas para las dos colecciones.
-- Se puede ejecutar más de una vez. Orden: primero PRUEBAS (mvxjopvnnagqytegtexi), después PRODUCCION (ehtbwmvwoxcdefvlxttu).

create or replace function glacial_fs.lista_solo_agrega(p_c text, p_d text, p_campo text, v jsonb, n jsonb, meta jsonb)
returns boolean
language plpgsql
volatile          -- VOLATILE a propósito: se llama desde autorizar (IMMUTABLE) y debe ver las filas recién guardadas en este mismo guardado
security definer
set search_path = ''
as $f$
declare antes integer; despues integer; tocados integer; bajas integer;
begin
  antes := coalesce(glacial_fs.largo(v, meta->'conteos_antes', p_campo), 0);
  despues := glacial_fs.largo(n, meta->'conteos', p_campo);
  if despues is null or despues <> antes + 1 then return false; end if;
  if coalesce(meta->'conteos', '{}'::jsonb) ? p_campo then                 -- la lista está partida (una fila por entrada)
    if coalesce(meta->'conteos_antes', '{}'::jsonb) ? p_campo then
      -- en este guardado solo puede haber cambiado UNA fila (la nueva) y ninguna se dio de baja
      select count(*) filter (where i.eliminado_en is null), count(*) filter (where i.eliminado_en is not null)
        into tocados, bajas
        from public.fs_items i
       where i.coleccion = p_c and i.doc = p_d and i.campo = p_campo and i.actualizado_en = now();
      return tocados = 1 and bajas = 0;
    end if;
    -- antes venía dentro del documento: las primeras filas deben ser exactamente las de antes
    return antes = 0 or coalesce((select jsonb_agg(x.datos order by x.pos) from (
             select i.datos, i.pos from public.fs_items i
              where i.coleccion = p_c and i.doc = p_d and i.campo = p_campo and i.eliminado_en is null
              order by i.pos limit antes) x) = v->p_campo, false);
  end if;
  if coalesce(meta->'conteos_antes', '{}'::jsonb) ? p_campo then return false; end if;
  return antes = 0 or coalesce((select jsonb_agg(t.x order by t.i) from jsonb_array_elements(n->p_campo) with ordinality as t(x, i)
                                where t.i <= antes) = v->p_campo, false);
end $f$;
revoke all on function glacial_fs.lista_solo_agrega(text, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;

do $m$
declare
  def text; nuevo text; cuenta integer;
  -- 1) ctx
  anc_ctx_decl constant text := 'v_ecog boolean; v_ecov boolean;';
  rep_ctx_decl constant text := 'v_ecog boolean; v_ecov boolean; v_corrige boolean;';
  anc_ctx_ret  constant text := $a$'ecog',v_ecog,'ecov',v_ecov);$a$;
  rep_ctx_ret  constant text := $a$'ecog',v_ecog,'ecov',v_ecov,
   'corrige', aut and not v_mant and not v_solo and (v_admin or glacial_fs.tiene(perm,'corregir_paradas')));$a$;
  -- 3) autorizar
  anc_fin constant text := E'\n end if;\n return false;';
  rama_aut constant text := $r$
 elsif c = 'correccionesParada' then
   if accion <> 'create' then return false; end if;                       -- se crea una sola vez; nunca se edita ni se borra
   return coalesce((k->>'corrige')::boolean, false)
     and array['id','accion','linea','fecha','turno','paradas','desde','hacia','minutos','motivo','cerrado','version','actualizadaUid','actualizadaEn'] <@ claves
     and claves <@ array['id','accion','linea','fecha','turno','paradas','desde','hacia','minutos','motivo','cerrado','version','actualizadaUid','actualizadaPor','actualizadaEn']
     and n->>'id' = d
     and n->>'accion' in ('QUITAR_MARCA','REASIGNAR_MARCA','REASIGNAR_LINEA')
     and n->>'linea' in ('PET1','PET2','B7L','C20L','B20L','HIELO')
     and jsonb_typeof(n->'fecha') = 'string' and length(n->>'fecha') = 10
     and n->>'turno' in ('DÍA','NOCHE')
     and coalesce(glacial_fs.largo(n, meta->'conteos', 'paradas') between 1 and 50, false)
     and jsonb_typeof(n->'motivo') = 'string' and length(n->>'motivo') between 5 and 200
     and n->'version' = '1'::jsonb
     and n->>'actualizadaUid' = u and n->'actualizadaEn' = ahora;
 elsif c = 'reclasificacionesParada' then
   if accion = 'delete' then return false; end if;
   if not (k->>'supmtto')::boolean then return false; end if;
   if not claves <@ array['id','paradaId','origen','linea','fecha','turno','descripcionOriginal','minutos','causa','motivo','detalle',
                          'equipo','version','historial','actualizadaUid','actualizadaPor','actualizadaEn'] then return false; end if;
   if accion = 'create' then
     return array['id','paradaId','origen','linea','fecha','causa','motivo','version','historial','actualizadaUid','actualizadaEn'] <@ claves
       and n->>'id' = d
       and n->>'origen' in ('AVANCE','REGISTRO')
       and n->>'linea' in ('PET1','PET2','B7L','C20L','B20L')
       and jsonb_typeof(n->'fecha') = 'string' and length(n->>'fecha') = 10
       and jsonb_typeof(n->'causa') = 'string' and length(n->>'causa') > 0
       and jsonb_typeof(n->'motivo') = 'string' and length(n->>'motivo') > 0
       and n->'version' = '1'::jsonb
       and n->>'actualizadaUid' = u and n->'actualizadaEn' = ahora
       and coalesce(glacial_fs.largo(n, meta->'conteos', 'historial') = 1, false);
   end if;
   return jsonb_typeof(n->'version') = 'number' and jsonb_typeof(v->'version') = 'number' and (n->>'version')::numeric = (v->>'version')::numeric + 1
     and n->>'actualizadaUid' = u and n->'actualizadaEn' = ahora
     and jsonb_typeof(n->'causa') = 'string' and length(n->>'causa') > 0
     and jsonb_typeof(n->'motivo') = 'string' and length(n->>'motivo') > 0
     and glacial_fs.lista_solo_agrega(c, d, 'historial', v, n, meta)
     and not (afect_t && array['id','paradaId','origen','linea','fecha','turno','descripcionOriginal','minutos']);
$r$;
  -- 4) puede_leer
  anc_leer constant text := E'\n end if;\n return false;';
  rama_leer constant text := E'\n elsif c = ''correccionesParada'' then return aut and not mant;\n elsif c = ''reclasificacionesParada'' then return coalesce((k->>''bitacora'')::boolean, false);';
begin
  -- 1) ctx
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'ctx';
  if position('corrige' in def) = 0 then
    foreach nuevo in array array[anc_ctx_decl, anc_ctx_ret] loop
      cuenta := (length(def) - length(replace(def, nuevo, ''))) / length(nuevo);
      if cuenta <> 1 then raise exception 'ctx: «%» encontrado % veces', nuevo, cuenta; end if;
    end loop;
    execute replace(replace(def, anc_ctx_decl, rep_ctx_decl), anc_ctx_ret, rep_ctx_ret);
  end if;

  -- 3) autorizar
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if position('correccionesParada' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_fin, ''))) / length(anc_fin);
    if cuenta <> 1 then raise exception 'autorizar: punto de inserción encontrado % veces', cuenta; end if;
    if position('afect_t' in def) = 0 then raise exception 'autorizar: falta glacial_21 (afect_t)'; end if;
    execute replace(def, anc_fin, rama_aut || anc_fin);
  end if;

  -- 4) puede_leer
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if position('correccionesParada' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_leer, ''))) / length(anc_leer);
    if cuenta <> 1 then raise exception 'puede_leer: punto de inserción encontrado % veces', cuenta; end if;
    execute replace(def, anc_leer, rama_leer || anc_leer);
  end if;
end $m$;
