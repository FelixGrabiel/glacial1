-- GLACIAL · glacial_31 · Reglas de Supabase para la BANDEJA DE EVIDENCIAS DE INSUMOS (Fase 3 del flujo WhatsApp + OpenAI)      *** SIN APLICAR ***
--
-- Qué hace (mismo método que glacial_24, que insertó las colecciones del Inventario de insumos):
--  1) autorizar: rama para la colección nueva «insumosEvidencias» (un documento por fotografía, id = SHA-256 de la foto).
--       · escribe quien tiene la marca ii_esc de glacial_24 (por defecto Asistente de Producción y Administrador; los roles de solo consulta, no);
--       · se CREA una sola vez (id = nombre del documento) y se ACTUALIZA (ediciones, confirmaciones, cambios de estado); NO se borra.
--       · Las transiciones de estado (pendiente → aprobado_dato / requiere_correccion / rechazado), el motivo obligatorio, la confirmación de los datos
--         dudosos y «solo un Administrador reabre» los exige la aplicación dentro de una transacción con control de revisión (`rev`): estas reglas, como
--         las de glacial_24 para los conteos, no comparan el estado anterior con el nuevo.
--  2) puede_leer: rama para esa colección con la marca ii_ver de glacial_24 (Asistente de Producción, Jefe de Operaciones y Administrador).
--  3) El libro de auditoría (insumosAuditoria, solo se crea) y las fotos (bucket privado «glacial-fotos», carpeta asistente/, glacial_25) YA tienen reglas:
--     esta migración no las toca.
--  4) NO crea nada de stock: esta bandeja no mueve inventario. Las entradas, transferencias y consumos (Fase 4) tendrán otra migración y otro permiso.
--
-- ANTES DE APLICAR
--  · Requiere glacial_23 y glacial_24 aplicadas (usa la marca ii_esc/ii_ver y las mismas «anclas» de texto). Si un ancla no se encuentra exactamente una vez,
--    la migración se detiene con un mensaje y no cambia nada.
--  · Orden: primero PRUEBAS (mvxjopvnnagqytegtexi); probar con una foto real y un -revisado.json; comparar la huella de las funciones; solo después PRODUCCION
--    (ehtbwmvwoxcdefvlxttu).
--  · Se puede ejecutar más de una vez.

do $m$
declare
  def text; cuenta integer;
  anc_fin constant text := E'\n end if;\n return false;';
  rama_aut constant text := $r$
 elsif c = 'insumosEvidencias' then
   declare
     esc boolean := coalesce((k->>'ii_esc')::boolean, false);
   begin
     if accion = 'delete' then return false; end if;                   -- las evidencias no se borran (se rechazan con motivo)
     return esc and (accion = 'update' or n->>'id' = d);                -- se crea una vez (id = huella de la foto) y se actualiza
   end;
$r$;
  anc_leer constant text := E'\n end if;\n return false;';
  rama_leer constant text := E'\n elsif c = ''insumosEvidencias'' then return coalesce((k->>''ii_ver'')::boolean, false);';
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'ctx';
  if position('ii_esc' in def) = 0 then raise exception 'ctx no tiene ii_esc: aplica antes glacial_24'; end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if position('insumosCatalogo' in def) = 0 then raise exception 'autorizar no tiene las ramas del inventario: aplica antes glacial_24'; end if;
  if position('insumosEvidencias' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_fin, ''))) / length(anc_fin);
    if cuenta <> 1 then raise exception 'autorizar: punto de inserción encontrado % veces', cuenta; end if;
    execute replace(def, anc_fin, rama_aut || anc_fin);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if position('insumosEvidencias' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_leer, ''))) / length(anc_leer);
    if cuenta <> 1 then raise exception 'puede_leer: punto de inserción encontrado % veces', cuenta; end if;
    execute replace(def, anc_leer, rama_leer || anc_leer);
  end if;
end $m$;
