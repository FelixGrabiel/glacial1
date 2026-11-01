-- GLACIAL · glacial_39 · LOS SUPERVISORES REGISTRAN EL USO Y EL PESO FINAL DE LAS UNIDADES (Etapa 2b de la trazabilidad de lotes)         *** APLICADA en PRUEBAS y PRODUCCIÓN (31/10/2026) ***
--
-- Qué hace
--  Hasta ahora solo quien crea lotes (marca «ii_esc»: Asistente de Producción y Administrador) podía cambiar una unidad. Esta migración deja que la marca «opera»
--  (Administrador, jefes de Producción/Operaciones, Supervisores) registre SOLO tres cosas sobre una unidad que ya está en su línea:
--    · USO EN EL CUADRO ... ENTREGADA_LINEA → EN_USO      (la unidad se queda en la misma línea)
--    · CONSUMO .......... EN_USO → CONSUMIDA              (peso final entre 0 y el peso que tenía)
--    · DEVOLUCIÓN ....... EN_USO → EN_ALMACEN             (devolución parcial con su peso final, entre 0 y el que tenía)
--  y crear el movimiento inmutable correspondiente (USO_CUADRO, CONSUMO o DEVOLUCION), con su uid y la hora del servidor.
--  Solo se pueden tocar estos campos de la unidad: estado, linea, bloque, fecha, cuadro, pesoActual, rev, actualizadoPor, actualizadoEn, historial.
--  No se puede crear ni borrar lotes o unidades, ni cambiar pesos hacia arriba, ni mover unidades de otra manera. No cambia datos. Se puede ejecutar más de una vez.
--  Requiere glacial_34 (reglas de lotes) y glacial_38 (lectura para supervisores).
--
-- ANTES DE APLICAR: PRUEBAS (mvxjopvnnagqytegtexi) primero; PRODUCCION (ehtbwmvwoxcdefvlxttu) solo con la aprobación del dueño.
-- Si un punto de inserción no se encuentra exactamente una vez, se detiene y no cambia nada.

do $m$
declare
  def text; cuenta integer;
  /* Punto de inserción de las unidades: el «else … return esc and (accion = 'update' or n->>'id' = d);» de la rama de lotes. Se busca por su forma (con o sin comentarios y con
     cualquier espaciado), porque PRUEBAS y PRODUCCIÓN tienen el mismo código escrito con espacios y comentarios distintos. */
  pat_u constant text := $p$(elsif c = 'insumosLotesClaves' then\s+return esc and accion = 'create' and n->>'id' = d;[^;]*?else)(\s+(?:--[^\n]*\n\s*)?)(return esc and \(accion = 'update' or n->>'id' = d\);)$p$;
  bloque constant text := $u$-- glacial_39: el supervisor registra uso, consumo o devolución de una unidad de su línea (solo esos campos y esas transiciones)
       if c = 'insumosUnidades' and coalesce((k->>'opera')::boolean, false) and accion = 'update'
          and jsonb_typeof(n->'pesoActual') = 'number' and jsonb_typeof(v->'pesoActual') = 'number'
          and (n->>'pesoActual')::numeric between 0 and (v->>'pesoActual')::numeric
          and glacial_fs.afectadas(v, n) <@ array['estado','linea','bloque','fecha','cuadro','pesoActual','rev','actualizadoPor','actualizadoEn','historial']
          and ((v->>'estado' = 'ENTREGADA_LINEA' and n->>'estado' = 'EN_USO' and n->>'linea' = v->>'linea')
            or (v->>'estado' = 'EN_USO' and n->>'estado' in ('CONSUMIDA','EN_ALMACEN')))
       then return true; end if;$u$;
  anc_m constant text := 'return esc and n->>''id'' = d and n->>''uid'' = u and n->''en'' = ahora;';
  nuevo_m constant text := $m2$return (esc or (coalesce((k->>'opera')::boolean, false) and n->>'tipo' in ('USO_CUADRO','CONSUMO','DEVOLUCION'))) and n->>'id' = d and n->>'uid' = u and n->'en' = ahora;$m2$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if def is null then raise exception 'glacial_fs.autorizar no existe'; end if;
  if position('glacial_39' in def) > 0 then return; end if;                               -- ya aplicada
  if position('insumosLotes' in def) = 0 then raise exception 'autorizar no tiene las reglas de lotes: aplica antes glacial_34'; end if;
  select count(*) into cuenta from regexp_matches(def, pat_u, 'g');
  if cuenta <> 1 then raise exception 'autorizar: punto de inserción (unidades) encontrado % veces', cuenta; end if;
  def := regexp_replace(def, pat_u, E'\\1\\2' || bloque || E'\\2\\3');
  cuenta := (length(def) - length(replace(def, anc_m, ''))) / length(anc_m);
  if cuenta <> 1 then raise exception 'autorizar: punto de inserción (movimientos) encontrado % veces', cuenta; end if;
  def := replace(def, anc_m, nuevo_m);
  execute def;
end $m$;
