-- GLACIAL · glacial_45 · BANCO DE PROVEEDORES (insumosProveedores · js/asistente/96-proveedores.js)         *** APLICADA en PRUEBAS (07/11/2026) · PRODUCCIÓN (07/11/2026) ***
--
-- Por qué: el proveedor llegaba como texto libre leído de la foto y cada forma distinta («CORPORACION ASK S.A.», «Corpacim ASK»…)
-- creaba otro lote. El banco guarda una ficha por proveedor (o cliente) con los nombres con que aparece en las etiquetas (alias).
-- Qué permite (igual que los lotes de glacial_34):
--   · Leer insumosProveedores: quien ve el Inventario de insumos (ii_ver).
--   · Crear y editar: quien escribe en el Inventario de insumos (ii_esc), creando con id = documento. Nunca se borra (se desactiva).
-- No cambia datos. Se puede ejecutar más de una vez. Si un punto de inserción no se encuentra exactamente una vez, se detiene sin cambiar nada.
-- Orden: PRUEBAS primero; PRODUCCIÓN con la aprobación del dueño.

do $m$
declare
  def text; cuenta integer;
  anc_a constant text := $a$elsif c in ('insumosLotes','insumosUnidades','insumosLoteMovimientos','insumosLotesClaves','insumosParametros') then$a$;
  nue_a constant text := $a$elsif c in ('insumosLotes','insumosUnidades','insumosLoteMovimientos','insumosLotesClaves','insumosParametros','insumosProveedores') then  -- glacial_45: + banco de proveedores$a$;
  anc_l constant text := $b$elsif c in ('insumosLoteMovimientos','insumosLotesClaves','insumosParametros') then return coalesce((k->>'ii_ver')::boolean, false);$b$;
  nue_l constant text := $b$elsif c in ('insumosLoteMovimientos','insumosLotesClaves','insumosParametros','insumosProveedores') then return coalesce((k->>'ii_ver')::boolean, false);  -- glacial_45$b$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if def is null then raise exception 'glacial_fs.autorizar no existe'; end if;
  if position('glacial_45' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_a, ''))) / length(anc_a);
    if cuenta <> 1 then raise exception 'autorizar: punto de inserción encontrado % veces (¿falta glacial_34?)', cuenta; end if;
    execute replace(def, anc_a, nue_a);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if position('glacial_45' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_l, ''))) / length(anc_l);
    if cuenta <> 1 then raise exception 'puede_leer: punto de inserción encontrado % veces (¿falta glacial_38?)', cuenta; end if;
    execute replace(def, anc_l, nue_l);
  end if;
end $m$;
