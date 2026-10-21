-- GLACIAL · glacial_26 · Reglas de Supabase para el REGISTRO DE HORAS EXTRAS (Tareo)            *** APLICADA EN PRUEBAS (mvxjopvnnagqytegtexi) el 2026-10-20 y en PRODUCCION (ehtbwmvwoxcdefvlxttu) el 2026-10-21 ***
--
-- Qué hace (mismo método que glacial_23 y glacial_24: inserta ramas en las funciones del puente; no crea tablas — los datos viven en fs_docs):
--  1) glacial_fs.cap_he_esc / cap_he_ver: quién ESCRIBE y quién VE las horas extras de cada área.
--       Escribe: Administrador, o quien tiene el permiso 'horasExtras' Y gestiona el tareo de esa área (Producción: tareoProduccion /
--       gestionar_tareo_produccion · Mantenimiento: moduloMantenimiento / gestionar_tareo_mantenimiento) o es RRHH (moduloRRHH, ambas áreas).
--       Nunca la Jefatura de solo consulta ni la cuenta compartida de Mantenimiento.
--       Ve: quien escribe, quien tiene VER el tareo del área o Tareo General; la cuenta compartida de Mantenimiento ve el área Mantenimiento
--       (la aplicación le muestra solo lo del técnico identificado con su PIN: igual que 37f-tareo-por-tecnico.js).
--  2) ctx: marcas he_esc_prod, he_esc_mant, he_ver_prod, he_ver_mant.
--  3) autorizar y puede_leer: rama para la colección horasExtras (un documento por registro; id = área_AAAA-MM-DD_código).
--       Al crear/actualizar valida lo que pide el prompt «NOT NULL / CHECK»: motivo, justificación (>= 15 caracteres), autorizadoPor y horas obligatorios,
--       horaFin distinta de horaInicio, totalHoras > 0, el área del documento coincide con el id y con el permiso del que escribe, y el registrador
--       (registradoUid) es quien crea. No se borra nunca (se ANULA con motivo de 5 o más caracteres: estado = ANULADO).
--
-- NOTA DE APLICACIÓN (leer ANTES de ejecutar):
--  · Esta migración usa las mismas «anclas» de texto que glacial_24 (final de ctx, de autorizar y de puede_leer). Probada en PRUEBAS dentro de una transacción antes de aplicarla; revisarla contra las funciones reales de PRUEBAS (mvxjopvnnagqytegtexi) antes de ejecutarla. Si un ancla no se
--    encuentra exactamente una vez, la migración se detiene con un mensaje y no cambia nada.
--  · Requiere glacial_23 (usa como ancla la última marca de ctx: 'ii_esc' si glacial_24 está aplicada o, si no, 'ap_alm'). No depende de glacial_24.
--  · Orden: primero PRUEBAS, probar con un supervisor de Producción, un técnico con PIN y un usuario de RRHH (docs/personal-tareo/tareo-horas-extras-registro.md),
--    y solo después PRODUCCION (ehtbwmvwoxcdefvlxttu). Comparar la huella de las funciones de los dos proyectos.
--  · LÍMITE: puede_leer de una CONSULTA (sin id de documento) no distingue el área: deja leer si el usuario ve alguna de las dos. La aplicación consulta
--    siempre con where('area','==',…) de las áreas que ve; comprobar en PRUEBAS que un supervisor de Producción no recibe documentos de Mantenimiento.
--  · Se puede ejecutar más de una vez.

create or replace function glacial_fs.cap_he_esc(p_aut boolean, p_mant boolean, p_solo boolean, p_admin boolean, p_perm jsonb, p_area text)
returns boolean language sql immutable set search_path = '' as $f$
  select coalesce(p_aut and not p_mant and not p_solo and (
           p_admin
           or p_perm = '"todos"'::jsonb
           or (glacial_fs.tiene(p_perm, 'horasExtras') and (
                 glacial_fs.tiene(p_perm, 'moduloRRHH')
                 or (p_area = 'produccion' and (glacial_fs.tiene(p_perm, 'tareoProduccion') or glacial_fs.tiene(p_perm, 'gestionar_tareo_produccion')))
                 or (p_area = 'mantenimiento' and (glacial_fs.tiene(p_perm, 'moduloMantenimiento') or glacial_fs.tiene(p_perm, 'gestionar_tareo_mantenimiento')))))), false)
$f$;
revoke all on function glacial_fs.cap_he_esc(boolean, boolean, boolean, boolean, jsonb, text) from public, anon, authenticated;

create or replace function glacial_fs.cap_he_ver(p_aut boolean, p_mant boolean, p_solo boolean, p_admin boolean, p_perm jsonb, p_area text)
returns boolean language sql immutable set search_path = '' as $f$
  select coalesce(p_aut and (
           glacial_fs.cap_he_esc(p_aut, p_mant, p_solo, p_admin, p_perm, p_area)
           or (p_mant and p_area = 'mantenimiento')                       -- cuenta compartida: la aplicación filtra por técnico (PIN)
           or (not p_mant and (
                 p_admin
                 or p_perm = '"todos"'::jsonb
                 or glacial_fs.tiene(p_perm, 'tareoGeneral')
                 or glacial_fs.tiene(p_perm, 'moduloRRHH')
                 or (p_area = 'produccion' and (glacial_fs.tiene(p_perm, 'ver_tareo_produccion') or glacial_fs.tiene(p_perm, 'tareoProduccion') or glacial_fs.tiene(p_perm, 'gestionar_tareo_produccion')))
                 or (p_area = 'mantenimiento' and (glacial_fs.tiene(p_perm, 'ver_tareo_mantenimiento') or glacial_fs.tiene(p_perm, 'moduloMantenimiento') or glacial_fs.tiene(p_perm, 'gestionar_tareo_mantenimiento')))))), false)
$f$;
revoke all on function glacial_fs.cap_he_ver(boolean, boolean, boolean, boolean, jsonb, text) from public, anon, authenticated;

do $m$
declare
  def text; cuenta integer; anc text; marcas text;
  -- final del return de ctx: glacial_24 (última marca ii_esc) o, si glacial_24 no está aplicada, glacial_23 (última marca ap_alm)
  anc_ii  constant text := $a$'ii_esc',  glacial_fs.cap_ap(aut, v_mant, v_solo, v_admin, rol, perm, 'inventarioInsumos', array['Asistente de Producción']));$a$;
  anc_ap  constant text := $a$'ap_alm',  glacial_fs.cap_ap(aut, v_mant, v_solo, v_admin, rol, perm, 'moduloAlmacen', array[]::text[]));$a$;
  nuevas_marcas constant text := $a$,
   'he_esc_prod', glacial_fs.cap_he_esc(aut, v_mant, v_solo, v_admin, perm, 'produccion'),
   'he_esc_mant', glacial_fs.cap_he_esc(aut, v_mant, v_solo, v_admin, perm, 'mantenimiento'),
   'he_ver_prod', glacial_fs.cap_he_ver(aut, v_mant, v_solo, v_admin, perm, 'produccion'),
   'he_ver_mant', glacial_fs.cap_he_ver(aut, v_mant, v_solo, v_admin, perm, 'mantenimiento'));$a$;
  anc_fin constant text := E'\n end if;\n return false;';
  rama_aut constant text := $r$
 elsif c = 'horasExtras' then
   declare
     ar text := n->>'area';
     esc boolean;
   begin
     if accion = 'delete' then return false; end if;                       -- los registros no se borran: se anulan
     if ar is null or ar not in ('produccion', 'mantenimiento') then return false; end if;
     esc := coalesce((k->>(case when ar = 'produccion' then 'he_esc_prod' else 'he_esc_mant' end))::boolean, false);
     if not esc then return false; end if;
     if n->>'id' is distinct from d or d not like (ar || '\_%') then return false; end if;      -- id = área_fecha_código
     -- «NOT NULL» y «CHECK» del prompt, aplicados en el servidor
     if coalesce(length(btrim(n->>'trabajadorNombre')), 0) = 0 then return false; end if;
     if coalesce(length(btrim(n->>'motivo')), 0) = 0 then return false; end if;
     if coalesce(length(btrim(n->>'justificacion')), 0) < 15 then return false; end if;
     if coalesce(length(btrim(n->>'autorizadoPor')), 0) = 0 then return false; end if;
     if coalesce(n->>'horaInicio', '') !~ '^[0-2][0-9]:[0-5][0-9]$' or coalesce(n->>'horaFin', '') !~ '^[0-2][0-9]:[0-5][0-9]$' then return false; end if;
     if n->>'horaInicio' = n->>'horaFin' then return false; end if;
     if jsonb_typeof(n->'totalHoras') is distinct from 'number' or (n->>'totalHoras')::numeric <= 0 then return false; end if;
     if coalesce(n->>'fecha', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
     if coalesce(n->>'estado', 'VIGENTE') not in ('VIGENTE', 'ANULADO') then return false; end if;
     if n->>'estado' = 'ANULADO' and coalesce(length(btrim(n->>'motivoAnulacion')), 0) < 5 then return false; end if;
     if accion = 'create' then
       return n->>'registradoUid' = u and coalesce(n->>'estado', 'VIGENTE') = 'VIGENTE';       -- nadie registra a nombre de otro
     end if;
     return true;
   end;
$r$;
  anc_leer constant text := E'\n end if;\n return false;';
  rama_leer constant text := $l$
 elsif c = 'horasExtras' then
   return case
     when d is null then coalesce((k->>'he_ver_prod')::boolean, false) or coalesce((k->>'he_ver_mant')::boolean, false)
     when d like 'produccion\_%' then coalesce((k->>'he_ver_prod')::boolean, false)
     when d like 'mantenimiento\_%' then coalesce((k->>'he_ver_mant')::boolean, false)
     else false end;
$l$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'ctx';
  if position('he_esc_prod' in def) = 0 then
    anc := case when position(anc_ii in def) > 0 then anc_ii else anc_ap end;
    cuenta := (length(def) - length(replace(def, anc, ''))) / length(anc);
    if cuenta <> 1 then raise exception 'ctx: punto de inserción encontrado % veces (se esperaba glacial_23 o glacial_24)', cuenta; end if;
    -- se quita el cierre «);» del return y se agregan las marcas nuevas
    execute replace(def, anc, substr(anc, 1, length(anc) - 2) || nuevas_marcas);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if position('horasExtras' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_fin, ''))) / length(anc_fin);
    if cuenta <> 1 then raise exception 'autorizar: punto de inserción encontrado % veces', cuenta; end if;
    execute replace(def, anc_fin, rama_aut || anc_fin);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if position('horasExtras' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_leer, ''))) / length(anc_leer);
    if cuenta <> 1 then raise exception 'puede_leer: punto de inserción encontrado % veces', cuenta; end if;
    execute replace(def, anc_leer, rama_leer || anc_leer);
  end if;
end $m$;
