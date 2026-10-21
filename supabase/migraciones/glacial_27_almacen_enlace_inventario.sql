-- GLACIAL · glacial_27 · Enlace Asistente de Producción ↔ Inventario de insumos (descuento de stock por entregas de Almacén)
--
-- Qué hace (mismo método que glacial_23/24/26: inserta ramas en autorizar y puede_leer por «anclas» de texto; si un ancla no aparece
-- exactamente una vez, se detiene con un mensaje y no cambia nada):
--  1) Colección nueva apAlmacenMov (libro de entregas de Almacén, inmutable): se CREA con id = opId, uid = quien escribe, guardadoEn = hora del
--     servidor, cantidad > 0 y tipo ENTREGA o ANULACION. Solo con el permiso de Almacén (moduloAlmacen, marca ap_alm). No se edita ni se borra.
--  2) Lectura de apAlmacenMov: igual que el resto del Asistente (usuario con sesión, no la cuenta compartida de Mantenimiento).
--  3) Lectura del catálogo y de los cortes del Inventario (insumosCatalogo, insumosCortesIndice, insumosCortesDetalle) también para quien
--     tiene el permiso del Asistente (ap_asis) o de Almacén (ap_alm): necesitan ver el stock para solicitar y entregar. Conteos, comentarios y
--     auditoría del Inventario siguen solo para quien tiene inventarioInsumos.
--  Requiere glacial_23 y glacial_24. Se puede ejecutar más de una vez. Orden: PRUEBAS primero, PRODUCCION después.

do $m$
declare
  def text; cuenta integer;
  anc_fin constant text := E'\n end if;\n return false;';
  rama_aut constant text := $r$
 elsif c = 'apAlmacenMov' then
   declare
     alm boolean := coalesce((k->>'ap_alm')::boolean, false);
   begin
     if accion <> 'create' then return false; end if;                   -- libro inmutable
     return alm and n->>'opId' = d and n->>'uid' = u and n->'guardadoEn' = ahora
       and jsonb_typeof(n->'cantidad') = 'number' and (n->>'cantidad')::numeric > 0
       and n->>'tipo' in ('ENTREGA','ANULACION');
   end;
$r$;
  anc_ii constant text := E'\n elsif c in (''insumosCatalogo'',''insumosCortesIndice'',''insumosCortesDetalle'',''insumosConteosIndice''';
  rama_leer constant text := E'\n elsif c = ''apAlmacenMov'' then return aut and not mant;'
    || E'\n elsif c in (''insumosCatalogo'',''insumosCortesIndice'',''insumosCortesDetalle'') then return coalesce((k->>''ii_ver'')::boolean, false) or coalesce((k->>''ap_asis'')::boolean, false) or coalesce((k->>''ap_alm'')::boolean, false);';
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if position('apAlmacenMov' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_fin, ''))) / length(anc_fin);
    if cuenta <> 1 then raise exception 'autorizar: punto de inserción encontrado % veces', cuenta; end if;
    execute replace(def, anc_fin, rama_aut || anc_fin);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if position('apAlmacenMov' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_ii, ''))) / length(anc_ii);
    if cuenta <> 1 then raise exception 'puede_leer: punto de inserción encontrado % veces (¿falta glacial_24?)', cuenta; end if;
    execute replace(def, anc_ii, rama_leer || anc_ii);
  end if;
end $m$;
