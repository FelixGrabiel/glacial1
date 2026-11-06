-- GLACIAL · glacial_43 · EL SUPERVISOR TOMA UNA CAJA/BOBINA DEL ALMACÉN PARA SU LÍNEA (auditoría de trazabilidad 06/11/2026, T5)         *** APLICADA en PRUEBAS y PRODUCCIÓN (06/11/2026) ***
--
-- Por qué: la trazabilidad se cortaba porque el supervisor solo veía lotes ya ENTREGADOS a su línea (y en 12 días hubo 1 entrega).
-- Con esta migración la marca «opera» (Administrador, jefes de Producción/Operaciones, Supervisores) puede, sobre una unidad:
--   · EN_ALMACEN → ENTREGADA_LINEA  (con una línea de las cinco), tocando SOLO estado, linea, rev, actualizadoPor, actualizadoEn e historial
--     (el peso, el lote y lo demás no cambian), y crear el movimiento inmutable ENTREGA_LINEA (con su uid y la hora del servidor).
-- Lo de glacial_39 (uso, consumo y devolución parcial) sigue igual. No crea ni borra lotes o unidades. No cambia datos.
-- Requiere glacial_34, glacial_38 y glacial_39. Si un punto de inserción no se encuentra exactamente una vez, se detiene sin cambiar nada.
-- Se puede ejecutar más de una vez. Orden: PRUEBAS primero; PRODUCCIÓN con la aprobación del dueño.

do $m$
declare
  def text; cuenta integer;
  anc_u constant text := '-- glacial_39: el supervisor registra uso, consumo o devolución de una unidad de su línea (solo esos campos y esas transiciones)';
  bloque constant text := $u$-- glacial_43: el supervisor toma una unidad del almacén para su línea (EN_ALMACEN → ENTREGADA_LINEA, solo esos campos)
       if c = 'insumosUnidades' and coalesce((k->>'opera')::boolean, false) and accion = 'update'
          and v->>'estado' = 'EN_ALMACEN' and n->>'estado' = 'ENTREGADA_LINEA'
          and n->>'linea' in ('PET1','PET2','B7L','C20L','B20L')
          and glacial_fs.afectadas(v, n) <@ array['estado','linea','rev','actualizadoPor','actualizadoEn','historial']
       then return true; end if;
       $u$;
  anc_m constant text := $a$n->>'tipo' in ('USO_CUADRO','CONSUMO','DEVOLUCION')$a$;
  nuevo_m constant text := $b$n->>'tipo' in ('USO_CUADRO','CONSUMO','DEVOLUCION','ENTREGA_LINEA')$b$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if def is null then raise exception 'glacial_fs.autorizar no existe'; end if;
  if position('glacial_43' in def) > 0 then return; end if;                                   -- ya aplicada
  if position('glacial_39' in def) = 0 then raise exception 'falta glacial_39: aplícala antes'; end if;
  cuenta := (length(def) - length(replace(def, anc_u, ''))) / length(anc_u);
  if cuenta <> 1 then raise exception 'autorizar: punto de inserción (unidades) encontrado % veces', cuenta; end if;
  def := replace(def, anc_u, bloque || anc_u);
  cuenta := (length(def) - length(replace(def, anc_m, ''))) / length(anc_m);
  if cuenta <> 1 then raise exception 'autorizar: punto de inserción (movimientos) encontrado % veces', cuenta; end if;
  def := replace(def, anc_m, nuevo_m);
  execute def;
end $m$;
