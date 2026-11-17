-- GLACIAL · glacial_59 · PANEL DE ADMINISTRACIÓN (etapa 1): marca adm_panel y libro de auditoría propio del panel      *** APLICADA en PRUEBAS (17/11/2026); PRODUCCIÓN pendiente ***
--
-- Qué hace (mismo método que glacial_56/57/58: inserta ramas por «anclas» de texto; si un ancla no aparece exactamente una vez, se detiene y no cambia nada):
--  1) glacial_fs.ctx: nueva marca adm_panel = sesión de Administrador, que no sea la cuenta compartida de Mantenimiento ni de solo vista
--     (la misma regla de amp_adm de glacial_29; aparte para que el panel no dependa de las ampliaciones de turno).
--  2) Colección nueva adminAuditoria: libro INMUTABLE de lo que cambia el Administrador desde el panel (quién, cuándo, módulo, acción, antes, después y motivo).
--     Solo se CREA (sin editar ni borrar), solo con adm_panel, uid = quien escribe y guardadoEn = hora del servidor, y motivo de al menos 10 caracteres.
--     Solo la lee el Administrador.
--  3) glacial_fs.adm_auditoria_valida: valida el documento.
-- NO cambia lo que los demás roles pueden hacer. Lo que el panel modifica en documentos que ya existen (usuarios, etc.) sigue pasando por las reglas de siempre.
-- Requiere glacial_58. Se puede ejecutar más de una vez.
-- Orden: PRUEBAS (mvxjopvnnagqytegtexi) primero; PRODUCCIÓN solo con la aprobación del dueño.

create or replace function glacial_fs.adm_auditoria_valida(n jsonb, d text, u text, ahora jsonb)
returns boolean language sql immutable set search_path = '' as $f$
  select coalesce(
    n->>'opId' = d and n->>'uid' = u and n->'guardadoEn' = ahora
    and jsonb_typeof(n->'modulo') = 'string' and char_length(btrim(n->>'modulo')) between 2 and 60
    and jsonb_typeof(n->'accion') = 'string' and char_length(btrim(n->>'accion')) between 3 and 300
    and jsonb_typeof(n->'motivo') = 'string' and char_length(btrim(n->>'motivo')) >= 10
    and char_length(d) between 8 and 120, false)
$f$;
revoke all on function glacial_fs.adm_auditoria_valida(jsonb, text, text, jsonb) from public, anon, authenticated;

do $m$
declare
  def text; cuenta integer;
  anc_ctx constant text := $a$'amp_adm', coalesce(aut and not v_mant and not v_solo and v_admin, false)$a$;
  nue_ctx constant text := $a$'amp_adm', coalesce(aut and not v_mant and not v_solo and v_admin, false),
   'adm_panel', coalesce(aut and not v_mant and not v_solo and v_admin, false)$a$;
  anc_aut constant text := E'\n elsif c = ''almacenPtSaldoEntrega'' then ';
  rama_aut constant text := $r$
 elsif c = 'adminAuditoria' then                                         -- glacial_59
   return accion = 'create' and coalesce((k->>'adm_panel')::boolean, false) and glacial_fs.adm_auditoria_valida(n, d, u, ahora);   -- libro inmutable
$r$;
  anc_leer constant text := E'\n elsif c = ''almacenPtSaldoEntrega'' then return aut and not mant;';
  rama_leer constant text := E'\n elsif c = ''adminAuditoria'' then return coalesce((k->>''adm_panel'')::boolean, false);  -- glacial_59';
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'glacial_fs' and p.proname = 'ctx';
  if def is null then raise exception 'glacial_fs.ctx no existe'; end if;
  if position('adm_panel' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_ctx, ''))) / length(anc_ctx);
    if cuenta <> 1 then raise exception 'ctx: ancla de amp_adm encontrada % veces (¿falta glacial_29?)', cuenta; end if;
    execute replace(def, anc_ctx, nue_ctx);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if def is null then raise exception 'glacial_fs.autorizar no existe'; end if;
  if position('almacenPtSaldoEntrega' in def) = 0 then raise exception 'autorizar: falta glacial_58'; end if;
  if position('adminAuditoria' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_aut, ''))) / length(anc_aut);
    if cuenta <> 1 then raise exception 'autorizar: ancla de almacenPtSaldoEntrega encontrada % veces', cuenta; end if;
    execute replace(def, anc_aut, rama_aut || anc_aut);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if def is null then raise exception 'glacial_fs.puede_leer no existe'; end if;
  if position('almacenPtSaldoEntrega' in def) = 0 then raise exception 'puede_leer: falta glacial_58'; end if;
  if position('adminAuditoria' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_leer, ''))) / length(anc_leer);
    if cuenta <> 1 then raise exception 'puede_leer: ancla de almacenPtSaldoEntrega encontrada % veces', cuenta; end if;
    execute replace(def, anc_leer, rama_leer || anc_leer);
  end if;
end $m$;
