-- GLACIAL · glacial_56 · ALMACÉN › INGRESO DE PRODUCTO TERMINADO (recepción de las paletas que anota Producción)      *** APLICADA en PRUEBAS y PRODUCCIÓN (16/11/2026) ***
--
-- Qué hace (mismo método que glacial_27: inserta ramas en autorizar y puede_leer por «anclas» de texto; si un ancla no aparece exactamente una vez,
-- se detiene con un mensaje y no cambia nada):
--  1) Colección nueva almacenPtRecepcion: libro INMUTABLE de recepciones de Almacén. Cada documento es una RECEPCION (de una anotación de paleta de
--     sync/paletas: estado RECIBIDA, DIFERENCIA u OBSERVADA) o una ANULACION de una recepción. Solo se CREA (no se edita ni se borra): corregir es anular y volver a recibir.
--     Solo con el permiso de Almacén (moduloAlmacen, marca ap_alm; el Administrador la tiene). uid = quien escribe y guardadoEn = hora del servidor.
--  2) glacial_fs.pt_recepcion_valida: valida el documento (id determinista <paletaId>_R<n> o ANUL_<…>, cantidades numéricas, motivo de al menos 5 caracteres
--     cuando hay diferencia, observación o anulación, y «recibida» solo con todas las unidades anotadas).
--  3) Lectura: usuario con sesión, no la cuenta compartida de Mantenimiento (igual que apAlmacenMov).
-- NO toca sync/paletas ni el stock de insumos. Requiere glacial_27. Se puede ejecutar más de una vez.
-- Orden: PRUEBAS (mvxjopvnnagqytegtexi) primero; PRODUCCIÓN solo con la aprobación del dueño.

create or replace function glacial_fs.pt_recepcion_valida(n jsonb, d text, u text, ahora jsonb)
returns boolean language sql immutable set search_path = '' as $f$
  select coalesce(
    n->>'opId' = d and n->>'uid' = u and n->'guardadoEn' = ahora and jsonb_typeof(n->'paletaId') = 'string' and char_length(n->>'paletaId') > 0
    and (
      ( n->>'tipo' = 'RECEPCION'
        and n->>'estado' in ('RECIBIDA', 'DIFERENCIA', 'OBSERVADA')
        and jsonb_typeof(n->'secuencia') = 'number' and (n->>'secuencia')::numeric >= 1
        and d = (n->>'paletaId') || '_R' || (n->>'secuencia')
        and jsonb_typeof(n->'unidadesAnotadas') = 'number' and (n->>'unidadesAnotadas')::numeric > 0
        and jsonb_typeof(n->'unidadesRecibidas') = 'number' and (n->>'unidadesRecibidas')::numeric >= 0
        and (n->>'estado' = 'RECIBIDA' or char_length(btrim(coalesce(n->>'motivo', ''))) >= 5)
        and (n->>'estado' <> 'RECIBIDA' or n->'unidadesRecibidas' = n->'unidadesAnotadas')
      )
      or
      ( n->>'tipo' = 'ANULACION'
        and jsonb_typeof(n->'anulaA') = 'string'
        and d = 'ANUL_' || (n->>'anulaA')
        and char_length(btrim(coalesce(n->>'motivo', ''))) >= 5
      )
    ), false)
$f$;
revoke all on function glacial_fs.pt_recepcion_valida(jsonb, text, text, jsonb) from public, anon, authenticated;

do $m$
declare
  def text; cuenta integer;
  anc_aut constant text := E'\n elsif c = ''apAlmacenMov'' then\n   declare';
  rama_aut constant text := $r$
 elsif c = 'almacenPtRecepcion' then                                     -- glacial_56
   declare
     alm boolean := coalesce((k->>'ap_alm')::boolean, false);
   begin
     if accion <> 'create' then return false; end if;                   -- libro inmutable
     return alm and glacial_fs.pt_recepcion_valida(n, d, u, ahora);
   end;
$r$;
  anc_leer constant text := E'\n elsif c = ''apAlmacenMov'' then return aut and not mant;';
  rama_leer constant text := E'\n elsif c = ''almacenPtRecepcion'' then return aut and not mant;  -- glacial_56';
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if def is null then raise exception 'glacial_fs.autorizar no existe'; end if;
  if position('almacenPtRecepcion' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_aut, ''))) / length(anc_aut);
    if cuenta <> 1 then raise exception 'autorizar: ancla de apAlmacenMov encontrada % veces (¿falta glacial_27?)', cuenta; end if;
    execute replace(def, anc_aut, rama_aut || anc_aut);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if def is null then raise exception 'glacial_fs.puede_leer no existe'; end if;
  if position('almacenPtRecepcion' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_leer, ''))) / length(anc_leer);
    if cuenta <> 1 then raise exception 'puede_leer: ancla de apAlmacenMov encontrada % veces (¿falta glacial_27?)', cuenta; end if;
    execute replace(def, anc_leer, rama_leer || anc_leer);
  end if;
end $m$;
