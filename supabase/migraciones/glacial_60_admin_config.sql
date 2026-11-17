-- GLACIAL · glacial_60 · PANEL DE ADMINISTRACIÓN (etapa 2): colección adminConfig (configuración que solo cambia el Administrador)      *** APLICADA en PRUEBAS y PRODUCCIÓN (17/11/2026) ***
--
-- Qué hace (mismo método que glacial_56…59: inserta ramas por «anclas» de texto; si un ancla no aparece exactamente una vez, se detiene y no cambia nada):
--  1) Colección nueva adminConfig/{id}: documentos de configuración del panel. Ids permitidos: tolerancias (merma aceptable y desviación por línea), roles (plantillas de permisos
--     y roles propios), anuncio, mantenimiento (modo mantenimiento), alertas (por rol), sesion, respaldos. Se CREAN o ACTUALIZAN solo con adm_panel (Administrador, glacial_59); no se borran.
--  2) Versión obligatoria: cada escritura trae version = versión anterior + 1 (la primera, 1). Si dos equipos editan a la vez, el segundo es rechazado en el servidor
--     («nunca gana en silencio el último»); el panel avisa y recarga.
--  3) Lectura: cualquier usuario con sesión (los demás módulos leen tolerancias, anuncio o modo mantenimiento); la cuenta compartida de Almacén sigue sin leer nada fuera de lo suyo (glacial_57).
-- Requiere glacial_59. NO toca los documentos que ya existen (apParametros, apFactores, sync/…): el panel los cambia con las mismas funciones y reglas de siempre. Se puede ejecutar más de una vez.
-- Orden: PRUEBAS (mvxjopvnnagqytegtexi) primero; PRODUCCIÓN solo con la aprobación del dueño.

create or replace function glacial_fs.adm_config_valida(n jsonb, d text, u text, v jsonb)
returns boolean language sql immutable set search_path = '' as $f$
  select coalesce(
    d in ('tolerancias', 'roles', 'anuncio', 'mantenimiento', 'alertas', 'sesion', 'respaldos')
    and n->>'id' = d and n->>'uid' = u
    and jsonb_typeof(n->'version') = 'number' and (n->>'version')::numeric = coalesce(case when jsonb_typeof(v->'version') = 'number' then (v->>'version')::numeric end, 0) + 1
    and jsonb_typeof(n->'motivo') = 'string' and char_length(btrim(n->>'motivo')) >= 10, false)
$f$;
revoke all on function glacial_fs.adm_config_valida(jsonb, text, text, jsonb) from public, anon, authenticated;

do $m$
declare
  def text; cuenta integer;
  anc_aut constant text := E'\n elsif c = ''adminAuditoria'' then ';
  rama_aut constant text := $r$
 elsif c = 'adminConfig' then                                            -- glacial_60
   return accion in ('create', 'update') and coalesce((k->>'adm_panel')::boolean, false) and glacial_fs.adm_config_valida(n, d, u, v);
$r$;
  anc_leer constant text := E'\n elsif c = ''adminAuditoria'' then return coalesce((k->>''adm_panel'')::boolean, false);';
  rama_leer constant text := E'\n elsif c = ''adminConfig'' then return aut;  -- glacial_60';
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if def is null then raise exception 'glacial_fs.autorizar no existe'; end if;
  if position('adminAuditoria' in def) = 0 then raise exception 'autorizar: falta glacial_59'; end if;
  if position('adminConfig' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_aut, ''))) / length(anc_aut);
    if cuenta <> 1 then raise exception 'autorizar: ancla de adminAuditoria encontrada % veces', cuenta; end if;
    execute replace(def, anc_aut, rama_aut || anc_aut);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if def is null then raise exception 'glacial_fs.puede_leer no existe'; end if;
  if position('adminAuditoria' in def) = 0 then raise exception 'puede_leer: falta glacial_59'; end if;
  if position('adminConfig' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_leer, ''))) / length(anc_leer);
    if cuenta <> 1 then raise exception 'puede_leer: ancla de adminAuditoria encontrada % veces', cuenta; end if;
    execute replace(def, anc_leer, rama_leer || anc_leer);
  end if;
end $m$;
