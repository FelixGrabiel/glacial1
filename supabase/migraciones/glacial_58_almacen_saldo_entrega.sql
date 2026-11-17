-- GLACIAL · glacial_58 · ALMACÉN › SALDO INCOMPLETO: entrega del supervisor (el control contra el conteo de Almacén)      *** APLICADA en PRUEBAS y PRODUCCIÓN (17/11/2026) ***
--
-- Qué hace (mismo método que glacial_56/57: inserta ramas por «anclas» de texto; si un ancla no aparece exactamente una vez, se detiene y no cambia nada):
--  1) Colección nueva almacenPtSaldoEntrega: libro INMUTABLE de las ENTREGAS de saldo (paleta incompleta) que hace el supervisor, y de sus ANULACIONES.
--     Solo se CREA (corregir = anular con motivo y entregar de nuevo). Escribe quien opera Producción (marca opera: Supervisor, Jefes, permiso «paletas», Administrador).
--     uid = quien escribe y guardadoEn = hora del servidor. La cuenta compartida de Almacén NO escribe aquí (glacial_57 ya lo impide).
--  2) glacial_fs.pt_saldo_entrega_valida: id determinista <combinación>_E<n> o ANUL_<…>, unidades > 0, motivo de al menos 5 caracteres en la anulación.
--  3) Lectura: usuario con sesión, no la cuenta compartida de Mantenimiento; y la cuenta compartida de Almacén (para comparar contra su conteo).
-- El conteo de Almacén reutiliza almacenPtRecepcion (glacial_56): no necesita cambios. NO toca sync/paletas ni el stock de insumos.
-- Requiere glacial_56 y glacial_57. Se puede ejecutar más de una vez.
-- Orden: PRUEBAS (mvxjopvnnagqytegtexi) primero; PRODUCCIÓN solo con la aprobación del dueño.

create or replace function glacial_fs.pt_saldo_entrega_valida(n jsonb, d text, u text, ahora jsonb)
returns boolean language sql immutable set search_path = '' as $f$
  select coalesce(
    n->>'opId' = d and n->>'uid' = u and n->'guardadoEn' = ahora and jsonb_typeof(n->'paletaId') = 'string' and char_length(n->>'paletaId') > 0
    and (
      ( n->>'tipo' = 'ENTREGA'
        and jsonb_typeof(n->'secuencia') = 'number' and (n->>'secuencia')::numeric >= 1
        and d = (n->>'paletaId') || '_E' || (n->>'secuencia')
        and jsonb_typeof(n->'unidades') = 'number' and (n->>'unidades')::numeric > 0
      )
      or
      ( n->>'tipo' = 'ANULACION'
        and jsonb_typeof(n->'anulaA') = 'string'
        and d = 'ANUL_' || (n->>'anulaA')
        and char_length(btrim(coalesce(n->>'motivo', ''))) >= 5
      )
    ), false)
$f$;
revoke all on function glacial_fs.pt_saldo_entrega_valida(jsonb, text, text, jsonb) from public, anon, authenticated;

do $m$
declare
  def text; cuenta integer;
  anc_aut constant text := E'\n elsif c = ''almacenPtRecepcion'' then ';
  rama_aut constant text := $r$
 elsif c = 'almacenPtSaldoEntrega' then                                  -- glacial_58
   return accion = 'create' and coalesce((k->>'opera')::boolean, false) and glacial_fs.pt_saldo_entrega_valida(n, d, u, ahora);   -- libro inmutable
$r$;
  anc_leer constant text := E'\n elsif c = ''almacenPtRecepcion'' then return aut and not mant;';
  rama_leer constant text := E'\n elsif c = ''almacenPtSaldoEntrega'' then return aut and not mant;  -- glacial_58';
  anc_comp constant text := $a$c in ('almacenPtRecepcion', 'almaceneros')$a$;
  nue_comp constant text := $a$c in ('almacenPtRecepcion', 'almaceneros', 'almacenPtSaldoEntrega')$a$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if def is null then raise exception 'glacial_fs.autorizar no existe'; end if;
  if position('almacenPtRecepcion' in def) = 0 then raise exception 'autorizar: falta glacial_56'; end if;
  if position('almacenPtSaldoEntrega' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_aut, ''))) / length(anc_aut);
    if cuenta <> 1 then raise exception 'autorizar: ancla de almacenPtRecepcion encontrada % veces', cuenta; end if;
    execute replace(def, anc_aut, rama_aut || anc_aut);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if def is null then raise exception 'glacial_fs.puede_leer no existe'; end if;
  if position('almaceneros' in def) = 0 then raise exception 'puede_leer: falta glacial_57'; end if;
  if position('almacenPtSaldoEntrega' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_leer, ''))) / length(anc_leer);
    if cuenta <> 1 then raise exception 'puede_leer: ancla de almacenPtRecepcion encontrada % veces', cuenta; end if;
    cuenta := (length(def) - length(replace(def, anc_comp, ''))) / length(anc_comp);
    if cuenta <> 1 then raise exception 'puede_leer: ancla de la cuenta compartida encontrada % veces', cuenta; end if;
    def := replace(def, anc_comp, nue_comp);
    execute replace(def, anc_leer, rama_leer || anc_leer);
  end if;
end $m$;
