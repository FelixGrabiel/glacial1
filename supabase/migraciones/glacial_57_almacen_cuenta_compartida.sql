-- GLACIAL · glacial_57 · ALMACÉN: cuenta compartida de almaceneros (rol almacen_compartido) con acceso RESTRINGIDO en el servidor      *** APLICADA en PRUEBAS y PRODUCCIÓN (16/11/2026) ***
--
-- Por qué: hoy cualquier cuenta que no sea la compartida de Mantenimiento puede leer casi todos los documentos de «sync» (usuarios, trabajadores, reportes,
-- tareos…). Una cuenta compartida de Almacén, con PIN personal que solo sirve de trazabilidad, NO debe tener ese alcance.
-- Qué hace:
--  1) glacial_fs.ctx: nueva marca alm_comp (sesión con rol = 'almacen_compartido').
--  2) puede_leer: con alm_comp SOLO se leen sync/{accesos, paletas, users, workers}, las colecciones almacenPtRecepcion y almaceneros, y su propio relojServidor. Todo lo demás: no.
--  3) autorizar: con alm_comp SOLO se puede (a) crear recepciones válidas en almacenPtRecepcion (glacial_56) y (b) ACTUALIZAR en almaceneros únicamente los campos del PIN
--     (salt, hash, pinCreadoEn, pinActualizadoEn, ultimoAcceso). Nada más: ni borrar, ni escribir en otras colecciones.
--  4) Colección nueva almaceneros/{id} (lista de almaceneros: nombre, activo, PIN con sal): la crean y editan quienes tienen el permiso de Almacén (ap_alm; el Administrador
--     lo tiene). No se borra (se desactiva). Lectura: usuario con sesión, no la cuenta compartida de Mantenimiento.
-- LÍMITE CONOCIDO: el PIN es TRAZABILIDAD (quién recibió cada paleta), no una barrera de seguridad: la cuenta compartida puede leer los hashes, igual que en Mantenimiento
-- (modo «local»). La restricción real está en los puntos 2 y 3.
-- Requiere glacial_56 y glacial_55. Usa anclas de texto: si alguna no aparece exactamente una vez, se detiene sin cambiar nada. Se puede ejecutar más de una vez.
-- Orden: PRUEBAS (mvxjopvnnagqytegtexi) primero; PRODUCCIÓN solo con la aprobación del dueño.

do $m$
declare
  def text; cuenta integer;
  -- ctx
  anc_ctx constant text := $a$'cal_esc', glacial_fs.cap_ap(aut, v_mant, v_solo, v_admin, rol, perm, 'calidadRevisar', array['Asistente de Producción'])$a$;
  nue_ctx constant text := $a$'cal_esc', glacial_fs.cap_ap(aut, v_mant, v_solo, v_admin, rol, perm, 'calidadRevisar', array['Asistente de Producción']),
   'alm_comp', coalesce(aut and rol = 'almacen_compartido', false)$a$;
  -- autorizar: guarda al inicio + rama de la colección almaceneros
  anc_aut_ini constant text := E'afect_t text[];\nbegin\n';
  guarda_aut constant text := $g$afect_t text[];
begin
 if coalesce((k->>'alm_comp')::boolean, false) then                    -- glacial_57: cuenta compartida de Almacén (acceso mínimo)
   if c = 'almacenPtRecepcion' then return accion = 'create' and glacial_fs.pt_recepcion_valida(n, d, u, ahora); end if;
   if c = 'almaceneros' then
     return accion = 'update' and glacial_fs.afectadas(v, n) <@ array['salt', 'hash', 'pinCreadoEn', 'pinActualizadoEn', 'ultimoAcceso'];
   end if;
   return false;
 end if;
$g$;
  anc_aut_pt constant text := E'\n elsif c = ''almacenPtRecepcion'' then ';
  rama_aut constant text := $r$
 elsif c = 'almaceneros' then                                            -- glacial_57: lista de almaceneros (nombres y PIN)
   return coalesce((k->>'ap_alm')::boolean, false) and accion in ('create', 'update') and n->>'id' = d
     and jsonb_typeof(n->'nombre') = 'string' and char_length(btrim(n->>'nombre')) between 2 and 80;
$r$;
  -- puede_leer: guarda al inicio + lectura de almaceneros
  anc_leer_ini constant text := E'u text := k->>''uid'';\nbegin\n if c = ''sync'' then';
  guarda_leer constant text := $g$u text := k->>'uid';
begin
 if coalesce((k->>'alm_comp')::boolean, false) then                    -- glacial_57: cuenta compartida de Almacén (lectura mínima)
   return (c = 'sync' and d in ('accesos', 'paletas', 'users', 'workers')) or c in ('almacenPtRecepcion', 'almaceneros') or (c = 'relojServidor' and d = u);
 end if;
 if c = 'sync' then$g$;
  anc_leer_pt constant text := E'\n elsif c = ''almacenPtRecepcion'' then return aut and not mant;';
  rama_leer constant text := E'\n elsif c = ''almaceneros'' then return aut and not mant;  -- glacial_57';
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'glacial_fs' and p.proname = 'ctx';
  if def is null then raise exception 'glacial_fs.ctx no existe'; end if;
  if position('alm_comp' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_ctx, ''))) / length(anc_ctx);
    if cuenta <> 1 then raise exception 'ctx: ancla de cal_esc encontrada % veces (¿falta glacial_55?)', cuenta; end if;
    execute replace(def, anc_ctx, nue_ctx);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if def is null then raise exception 'glacial_fs.autorizar no existe'; end if;
  if position('almacenPtRecepcion' in def) = 0 then raise exception 'autorizar: falta glacial_56 (colección almacenPtRecepcion)'; end if;
  if position('alm_comp' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_aut_ini, ''))) / length(anc_aut_ini);
    if cuenta <> 1 then raise exception 'autorizar: ancla del inicio encontrada % veces', cuenta; end if;
    cuenta := (length(def) - length(replace(def, anc_aut_pt, ''))) / length(anc_aut_pt);
    if cuenta <> 1 then raise exception 'autorizar: ancla de almacenPtRecepcion encontrada % veces', cuenta; end if;
    def := replace(def, anc_aut_ini, guarda_aut);
    execute replace(def, anc_aut_pt, rama_aut || anc_aut_pt);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if def is null then raise exception 'glacial_fs.puede_leer no existe'; end if;
  if position('almacenPtRecepcion' in def) = 0 then raise exception 'puede_leer: falta glacial_56 (colección almacenPtRecepcion)'; end if;
  if position('alm_comp' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_leer_ini, ''))) / length(anc_leer_ini);
    if cuenta <> 1 then raise exception 'puede_leer: ancla del inicio encontrada % veces', cuenta; end if;
    cuenta := (length(def) - length(replace(def, anc_leer_pt, ''))) / length(anc_leer_pt);
    if cuenta <> 1 then raise exception 'puede_leer: ancla de almacenPtRecepcion encontrada % veces', cuenta; end if;
    def := replace(def, anc_leer_ini, guarda_leer);
    execute replace(def, anc_leer_pt, rama_leer || anc_leer_pt);
  end if;
end $m$;
