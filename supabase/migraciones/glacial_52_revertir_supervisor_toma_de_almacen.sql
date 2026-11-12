-- GLACIAL · glacial_52 · REVIERTE glacial_43: EL SUPERVISOR YA NO TOMA CAJAS/BOBINAS DEL ALMACÉN (12/11/2026)         *** APLICADA en PRUEBAS (12/11/2026) · PRODUCCIÓN pendiente ***
--
-- Por qué: desde el 12/11/2026 la Asistente de Producción elige los lotes y decide a qué línea va cada caja/bobina (Asistente › Lotes › «Entregar a líneas»).
-- El botón «Tomar para <línea>» se quitó del Registro de producción; esta migración cierra también el permiso en el servidor.
--
-- Qué hace en glacial_fs.autorizar (solo para la marca «opera»: Administrador, jefes de Producción/Operaciones, Supervisores):
--   · quita el bloque «glacial_43» (unidad EN_ALMACEN → ENTREGADA_LINEA);
--   · los movimientos que puede crear «opera» vuelven a ser solo USO_CUADRO, CONSUMO y DEVOLUCION (sin ENTREGA_LINEA).
-- Qué NO cambia:
--   · La Asistente de Producción y el Administrador siguen entregando a línea con la marca «ii_esc» (glacial_34), como siempre.
--   · Lo de glacial_39 (el supervisor marca en uso, consume o devuelve con peso lo que está en SU línea) sigue igual.
--   · No toca datos: las entregas que ya hicieron los supervisores (movimientos ENTREGA_LINEA) quedan como están.
-- Requiere glacial_43 aplicada; si no lo está, no hace nada. Si un texto no se encuentra exactamente una vez, se detiene sin cambiar nada.
-- Se puede ejecutar más de una vez. Orden: PRUEBAS (mvxjopvnnagqytegtexi) primero; PRODUCCIÓN (ehtbwmvwoxcdefvlxttu) con la aprobación del dueño.

do $m$
declare
  def text; cuenta integer;
  bloque constant text := $u$-- glacial_43: el supervisor toma una unidad del almacén para su línea (EN_ALMACEN → ENTREGADA_LINEA, solo esos campos)
       if c = 'insumosUnidades' and coalesce((k->>'opera')::boolean, false) and accion = 'update'
          and v->>'estado' = 'EN_ALMACEN' and n->>'estado' = 'ENTREGADA_LINEA'
          and n->>'linea' in ('PET1','PET2','B7L','C20L','B20L')
          and glacial_fs.afectadas(v, n) <@ array['estado','linea','rev','actualizadoPor','actualizadoEn','historial']
       then return true; end if;
       $u$;
  mov_43 constant text := $b$n->>'tipo' in ('USO_CUADRO','CONSUMO','DEVOLUCION','ENTREGA_LINEA')$b$;
  mov_39 constant text := $a$n->>'tipo' in ('USO_CUADRO','CONSUMO','DEVOLUCION')$a$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if def is null then raise exception 'glacial_fs.autorizar no existe'; end if;
  if position('glacial_43' in def) = 0 and position(mov_43 in def) = 0 then return; end if;     -- ya revertida (o glacial_43 nunca se aplicó)
  if position('glacial_39' in def) = 0 then raise exception 'falta glacial_39: no se reconoce la función'; end if;

  cuenta := (length(def) - length(replace(def, bloque, ''))) / length(bloque);
  if cuenta <> 1 then raise exception 'autorizar: bloque glacial_43 (unidades) encontrado % veces; no se cambia nada', cuenta; end if;
  def := replace(def, bloque, '');

  cuenta := (length(def) - length(replace(def, mov_43, ''))) / length(mov_43);
  if cuenta <> 1 then raise exception 'autorizar: lista de movimientos de glacial_43 encontrada % veces; no se cambia nada', cuenta; end if;
  def := replace(def, mov_43, mov_39);

  if position('glacial_43' in def) > 0 then raise exception 'autorizar: queda texto de glacial_43; no se cambia nada'; end if;
  execute def;
end $m$;

-- Comprobación (debe devolver: tiene_43 = false, mov_entrega_opera = false, tiene_39 = true):
-- select position('glacial_43' in d) > 0 as tiene_43,
--        position($b$'DEVOLUCION','ENTREGA_LINEA')$b$ in d) > 0 as mov_entrega_opera,
--        position('glacial_39' in d) > 0 as tiene_39
--   from (select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'glacial_fs' and p.proname = 'autorizar') x;
