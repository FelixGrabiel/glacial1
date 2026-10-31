-- GLACIAL · glacial_38 · LOS SUPERVISORES PUEDEN LEER LOS LOTES Y UNIDADES (para elegir los lotes de insumo usados en cada cuadro)       *** NO APLICADA en PRODUCCIÓN (aplicar primero en PRUEBAS) ***
--
-- Qué hace
--  En el cuadro del reporte el supervisor marca qué lotes de preforma, tapa, etiqueta y asa usó (Etapa 2 de la trazabilidad). Para listar los que están en su línea necesita LEER
--  insumosLotes e insumosUnidades, que hoy solo lee la marca «ii_ver» (Asistente de Producción, Jefe de Operaciones, Administrador).
--  Esta migración agrega la marca «opera» (Administrador, Jefe de Producción, Jefe de Operaciones, Supervisores y quien tiene «paletas») SOLO a la LECTURA de esas dos colecciones.
--  NO da ninguna escritura, ni lectura de movimientos, índice, parámetros ni evidencias. No cambia datos. Se puede ejecutar más de una vez.
--
-- ANTES DE APLICAR: PRUEBAS (mvxjopvnnagqytegtexi) primero; PRODUCCION (ehtbwmvwoxcdefvlxttu) solo con la aprobación del dueño.
-- Si el punto de inserción no se encuentra exactamente una vez, se detiene y no cambia nada.

do $m$
declare
  def text; cuenta integer;
  anc constant text := $a$elsif c in ('insumosLotes','insumosUnidades','insumosLoteMovimientos','insumosLotesClaves','insumosParametros') then return coalesce((k->>'ii_ver')::boolean, false);$a$;
  nuevo constant text := $r$elsif c in ('insumosLotes','insumosUnidades') then return coalesce((k->>'ii_ver')::boolean, false) or coalesce((k->>'opera')::boolean, false);
 elsif c in ('insumosLoteMovimientos','insumosLotesClaves','insumosParametros') then return coalesce((k->>'ii_ver')::boolean, false);$r$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if def is null then raise exception 'glacial_fs.puede_leer no existe'; end if;
  if position($x$'insumosLotes','insumosUnidades') then$x$ in def) > 0 then return; end if;     -- ya aplicada
  cuenta := (length(def) - length(replace(def, anc, ''))) / length(anc);
  if cuenta <> 1 then raise exception 'puede_leer: punto de inserción encontrado % veces', cuenta; end if;
  execute replace(def, anc, nuevo);
end $m$;
