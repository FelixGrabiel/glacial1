-- GLACIAL · glacial_61 · ALMACÉN › PRODUCTO TERMINADO: DESPACHOS (salidas) para calcular el stock      *** APLICADA en PRUEBAS y PRODUCCIÓN (18/11/2026) ***
--
-- Qué hace (mismo método que glacial_56…60: inserta ramas por «anclas» de texto; si un ancla no aparece exactamente una vez, se detiene y no cambia nada):
--  1) Colección nueva almacenPtDespacho: libro INMUTABLE de lo que sale de Almacén (DESPACHO: destino, referencia/guía opcional y de 1 a 30 líneas de producto con paletas y unidades)
--     y de sus ANULACIONES (con motivo de al menos 5 caracteres). Solo se CREA; corregir = anular y volver a despachar. uid = quien escribe y guardadoEn = hora del servidor.
--     Escriben quienes tienen el permiso de Almacén (ap_alm, incluido el Administrador) y la cuenta compartida de Almacén (alm_comp, con su almacenero identificado en pantalla).
--  2) Lectura: usuario con sesión (no la cuenta de Mantenimiento) y la cuenta compartida de Almacén.
--  Stock de producto terminado = lo recibido (almacenPtRecepcion, glacial_56) − lo despachado (esta colección): se calcula en la pantalla. NO toca sync/paletas ni el stock de insumos.
-- Requiere glacial_56, glacial_57 y glacial_60. Se puede ejecutar más de una vez.
-- Orden: PRUEBAS (mvxjopvnnagqytegtexi) primero; PRODUCCIÓN solo con la aprobación del dueño.

create or replace function glacial_fs.pt_despacho_valido(n jsonb, d text, u text, ahora jsonb)
returns boolean language sql immutable set search_path = '' as $f$
  select coalesce(
    n->>'opId' = d and n->>'uid' = u and n->'guardadoEn' = ahora
    and (
      ( n->>'tipo' = 'DESPACHO'
        and d ~ '^DESP_[0-9]{10,14}_[a-z0-9]{3,8}$'
        and jsonb_typeof(n->'destino') = 'string' and char_length(btrim(n->>'destino')) between 2 and 80
        and (n->'referencia' is null or jsonb_typeof(n->'referencia') = 'null' or (jsonb_typeof(n->'referencia') = 'string' and char_length(n->>'referencia') <= 60))
        and case when jsonb_typeof(n->'items') = 'array' then
              jsonb_array_length(n->'items') between 1 and 30
              and not exists (
                select 1 from jsonb_array_elements(n->'items') e
                 where not (jsonb_typeof(e) = 'object'
                   and jsonb_typeof(e->'linea') = 'string' and char_length(e->>'linea') between 1 and 20
                   and jsonb_typeof(e->'marca') = 'string' and jsonb_typeof(e->'presentacion') = 'string'
                   and jsonb_typeof(e->'paletas') = 'number' and (e->>'paletas')::numeric >= 0
                   and jsonb_typeof(e->'unidades') = 'number' and (e->>'unidades')::numeric > 0))
            else false end
      )
      or
      ( n->>'tipo' = 'ANULACION'
        and jsonb_typeof(n->'anulaA') = 'string'
        and d = 'ANUL_' || (n->>'anulaA')
        and char_length(btrim(coalesce(n->>'motivo', ''))) >= 5
      )
    ), false)
$f$;
revoke all on function glacial_fs.pt_despacho_valido(jsonb, text, text, jsonb) from public, anon, authenticated;

do $m$
declare
  def text; cuenta integer;
  anc_guard constant text := E'   if c = ''almaceneros'' then\n';
  rama_guard constant text := $g$   if c = 'almacenPtDespacho' then return accion = 'create' and glacial_fs.pt_despacho_valido(n, d, u, ahora); end if;      -- glacial_61
$g$;
  anc_aut constant text := E'\n elsif c = ''adminConfig'' then ';
  rama_aut constant text := $r$
 elsif c = 'almacenPtDespacho' then                                      -- glacial_61
   return accion = 'create' and coalesce((k->>'ap_alm')::boolean, false) and glacial_fs.pt_despacho_valido(n, d, u, ahora);   -- libro inmutable
$r$;
  anc_comp constant text := $a$c in ('almacenPtRecepcion', 'almaceneros', 'almacenPtSaldoEntrega')$a$;
  nue_comp constant text := $a$c in ('almacenPtRecepcion', 'almaceneros', 'almacenPtSaldoEntrega', 'almacenPtDespacho')$a$;
  anc_leer constant text := E'\n elsif c = ''adminConfig'' then return aut;';
  rama_leer constant text := E'\n elsif c = ''almacenPtDespacho'' then return aut and not mant;  -- glacial_61';
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if def is null then raise exception 'glacial_fs.autorizar no existe'; end if;
  if position('adminConfig' in def) = 0 then raise exception 'autorizar: falta glacial_60'; end if;
  if position('almacenPtDespacho' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_guard, ''))) / length(anc_guard);
    if cuenta <> 1 then raise exception 'autorizar: ancla de la cuenta compartida encontrada % veces', cuenta; end if;
    cuenta := (length(def) - length(replace(def, anc_aut, ''))) / length(anc_aut);
    if cuenta <> 1 then raise exception 'autorizar: ancla de adminConfig encontrada % veces', cuenta; end if;
    def := replace(def, anc_guard, rama_guard || anc_guard);
    execute replace(def, anc_aut, rama_aut || anc_aut);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if def is null then raise exception 'glacial_fs.puede_leer no existe'; end if;
  if position('adminConfig' in def) = 0 then raise exception 'puede_leer: falta glacial_60'; end if;
  if position('almacenPtDespacho' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_comp, ''))) / length(anc_comp);
    if cuenta <> 1 then raise exception 'puede_leer: ancla de la cuenta compartida encontrada % veces', cuenta; end if;
    cuenta := (length(def) - length(replace(def, anc_leer, ''))) / length(anc_leer);
    if cuenta <> 1 then raise exception 'puede_leer: ancla de adminConfig encontrada % veces', cuenta; end if;
    def := replace(def, anc_comp, nue_comp);
    execute replace(def, anc_leer, rama_leer || anc_leer);
  end if;
end $m$;
