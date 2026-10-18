-- GLACIAL · glacial_24 · Reglas de Supabase para el INVENTARIO DE INSUMOS (Fases 1 a 3)      *** BORRADOR: NO SE HA APLICADO ***
--
-- Qué hace (mismo método que glacial_23, que insertó las ramas del Asistente de Producción):
--  1) glacial_fs.cap_ii_ver: quién puede VER el inventario (permiso 'inventarioInsumos'; por defecto Asistente de Producción y Jefe de
--     Operaciones; el Administrador siempre; «-inventarioInsumos» lo quita; nunca la cuenta compartida de Mantenimiento).
--  2) ctx: marcas ii_ver (ver) e ii_esc (escribir: cap_ap, que ya excluye los roles de solo consulta; por defecto Asistente de Producción).
--  3) autorizar y puede_leer: ramas para las 4 colecciones nuevas:
--       insumosCatalogo (documento único 'catalogo' con la lista de artículos), insumosCortesIndice y insumosCortesDetalle (un documento
--       por corte de stock; solo se CREAN, no se editan ni se borran) insumosConteosIndice / insumosConteosDetalle / insumosConteosComentarios (conteo físico y comentarios de la conciliación: se crean y se actualizan, no se borran) e insumosAuditoria (solo se crea).
--
-- IMPORTANTE ANTES DE APLICAR
--  · Esta migración usa las mismas «anclas» de texto que glacial_23 (final de ctx, de autorizar y de puede_leer). Se probó SOLO leyendo
--    el archivo glacial_23: revisarla contra las funciones reales de PRUEBAS (mvxjopvnnagqytegtexi) antes de ejecutarla. Si un ancla no
--    se encuentra exactamente una vez, la migración se detiene con un mensaje y no cambia nada.
--  · Orden: primero PRUEBAS, probar el módulo con STOCK_INVENTARI.xlsx, y solo después PRODUCCION (ehtbwmvwoxcdefvlxttu). Comparar la
--    huella de las funciones de los dos proyectos (misma huella).
--  · Equivalente en Firebase (firestore.rules.etapa2.txt): ver docs/INVENTARIO-INSUMOS.md §Reglas. NO se modificó ese archivo.
--  · Se puede ejecutar más de una vez.

create or replace function glacial_fs.cap_ii_ver(p_aut boolean, p_mant boolean, p_admin boolean, p_rol text, p_perm jsonb)
returns boolean language sql immutable set search_path = '' as $f$
  select coalesce(p_aut and not p_mant and (
           p_admin
           or p_perm = '"todos"'::jsonb
           or glacial_fs.tiene(p_perm, 'inventarioInsumos')
           or (p_rol = any(array['Asistente de Producción','Jefe de Operaciones']) and not glacial_fs.tiene(p_perm, '-inventarioInsumos'))), false)
$f$;
revoke all on function glacial_fs.cap_ii_ver(boolean, boolean, boolean, text, jsonb) from public, anon, authenticated;

do $m$
declare
  def text; cuenta integer;
  -- final del return de ctx tal como lo dejó glacial_23 (última marca: ap_alm)
  anc_ctx_ret constant text := $a$'ap_alm',  glacial_fs.cap_ap(aut, v_mant, v_solo, v_admin, rol, perm, 'moduloAlmacen', array[]::text[]));$a$;
  rep_ctx_ret constant text := $a$'ap_alm',  glacial_fs.cap_ap(aut, v_mant, v_solo, v_admin, rol, perm, 'moduloAlmacen', array[]::text[]),
   'ii_ver',  glacial_fs.cap_ii_ver(aut, v_mant, v_admin, rol, perm),
   'ii_esc',  glacial_fs.cap_ap(aut, v_mant, v_solo, v_admin, rol, perm, 'inventarioInsumos', array['Asistente de Producción']));$a$;
  anc_fin constant text := E'\n end if;\n return false;';
  rama_aut constant text := $r$
 elsif c in ('insumosCatalogo','insumosCortesIndice','insumosCortesDetalle','insumosConteosIndice','insumosConteosDetalle','insumosConteosComentarios','insumosAuditoria') then
   declare
     esc boolean := coalesce((k->>'ii_esc')::boolean, false);
   begin
     if accion = 'delete' then return false; end if;
     if c = 'insumosAuditoria' then
       if accion <> 'create' then return false; end if;                 -- libro inmutable
       return esc and n->>'uid' = u and n->'en' = ahora;
     elsif c = 'insumosCatalogo' then
       return esc and d = 'catalogo';
     elsif c in ('insumosConteosIndice','insumosConteosDetalle','insumosConteosComentarios') then   -- conteo físico (Fase 2): se crean y se actualizan (líneas, cierre);
       return esc and (accion = 'update' or n->>'id' = d);              -- no se borran. «Solo un Administrador reabre» lo exige la aplicación
                                                                        -- (las reglas de este nivel no comparan estado anterior → nuevo).
     else                                                               -- cortes de stock: se crean una vez y no cambian
       return esc and accion = 'create' and n->>'id' = d;
     end if;
   end;
$r$;
  anc_leer constant text := E'\n end if;\n return false;';
  rama_leer constant text := E'\n elsif c in (''insumosCatalogo'',''insumosCortesIndice'',''insumosCortesDetalle'',''insumosConteosIndice'',''insumosConteosDetalle'',''insumosConteosComentarios'',''insumosAuditoria'') then return coalesce((k->>''ii_ver'')::boolean, false);';
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'ctx';
  if position('ii_ver' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_ctx_ret, ''))) / length(anc_ctx_ret);
    if cuenta <> 1 then raise exception 'ctx: punto de inserción encontrado % veces (¿falta glacial_23?)', cuenta; end if;
    execute replace(def, anc_ctx_ret, rep_ctx_ret);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if position('insumosCatalogo' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_fin, ''))) / length(anc_fin);
    if cuenta <> 1 then raise exception 'autorizar: punto de inserción encontrado % veces', cuenta; end if;
    execute replace(def, anc_fin, rama_aut || anc_fin);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if position('insumosCatalogo' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_leer, ''))) / length(anc_leer);
    if cuenta <> 1 then raise exception 'puede_leer: punto de inserción encontrado % veces', cuenta; end if;
    execute replace(def, anc_leer, rama_leer || anc_leer);
  end if;
end $m$;
