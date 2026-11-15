-- GLACIAL · glacial_55 · CALIDAD: permisos propios (ver y revisar), separados de los del Inventario de insumos      *** APLICADA en PRUEBAS y PRODUCCIÓN (15/11/2026) ***
--
-- Por qué: la pantalla Calidad › Validación de lotes (glacial_54) usaba los permisos del Inventario de insumos (ii_ver / ii_esc). Ahora Calidad tiene los suyos en
-- Gestión de usuarios (área «Calidad»), como Hielo (glacial_50): quien ve o revisa Calidad no depende de lo que tenga en Almacén, ni al revés.
-- Qué hace:
--  1) glacial_fs.cap_cal_ver: quién VE Calidad = Administrador, permiso 'calidadVer', o por defecto Asistente de Producción y Jefe de Operaciones;
--     '-calidadVer' lo quita; nunca la cuenta compartida de Mantenimiento.
--  2) ctx: agrega las marcas cal_ver (ver) y cal_esc (revisar: cap_ap con el permiso 'calidadRevisar'; por defecto Asistente de Producción; los roles de solo consulta no).
--  3) Las dos funciones de glacial_54 pasan a exigir cal_ver (listar) y cal_esc (revisar).
-- Requiere glacial_54. Usa un ancla de texto en ctx: si no aparece exactamente una vez, se detiene sin cambiar nada. Se puede ejecutar más de una vez.
-- Orden: PRUEBAS (mvxjopvnnagqytegtexi) primero; PRODUCCIÓN solo con la aprobación del dueño.

do $c$
begin
  if to_regclass('public.validaciones_lotes') is null then
    raise exception 'Falta glacial_54 (tabla validaciones_lotes): aplícala antes';
  end if;
end $c$;

create or replace function glacial_fs.cap_cal_ver(p_aut boolean, p_mant boolean, p_admin boolean, p_rol text, p_perm jsonb)
returns boolean language sql immutable set search_path = '' as $f$
  select coalesce(p_aut and not p_mant and (
           p_admin
           or p_perm = '"todos"'::jsonb
           or glacial_fs.tiene(p_perm, 'calidadVer')
           or (p_rol = any(array['Asistente de Producción','Jefe de Operaciones']) and not glacial_fs.tiene(p_perm, '-calidadVer'))), false)
$f$;
revoke all on function glacial_fs.cap_cal_ver(boolean, boolean, boolean, text, jsonb) from public, anon, authenticated;

do $m$
declare
  def text; cuenta integer;
  anc constant text := $a$'ii_esc',  glacial_fs.cap_ap(aut, v_mant, v_solo, v_admin, rol, perm, 'inventarioInsumos', array['Asistente de Producción'])$a$;
  nue constant text := $a$'ii_esc',  glacial_fs.cap_ap(aut, v_mant, v_solo, v_admin, rol, perm, 'inventarioInsumos', array['Asistente de Producción']),
   'cal_ver', glacial_fs.cap_cal_ver(aut, v_mant, v_admin, rol, perm),
   'cal_esc', glacial_fs.cap_ap(aut, v_mant, v_solo, v_admin, rol, perm, 'calidadRevisar', array['Asistente de Producción'])$a$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'ctx';
  if def is null then raise exception 'glacial_fs.ctx no existe'; end if;
  if position('cal_ver' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc, ''))) / length(anc);
    if cuenta <> 1 then raise exception 'ctx: ancla de ii_esc encontrada % veces (¿falta glacial_24?)', cuenta; end if;
    execute replace(def, anc, nue);
  end if;
end $m$;

create or replace function public.validaciones_lotes_listar(p_desde timestamptz default null, p_limite integer default 300)
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
begin
  if not coalesce((glacial_fs.ctx() ->> 'cal_ver')::boolean, false) then
    raise exception 'Sin permiso para ver las validaciones de lotes' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.validada_en desc)
      from (select v.clave, v.lote, v.resultado, v.insumo, v.proveedor, v.linea, v.motivo, v.controles, v.datos, v.evidencia_sha256, v.origen,
                   v.validada_en, v.recibido_en, v.revision_estado, v.revisada_en, v.revisada_por, v.revision_nota
              from public.validaciones_lotes v
             where v.validada_en >= coalesce(p_desde, now() - interval '30 days')
             order by v.validada_en desc
             limit greatest(1, least(coalesce(p_limite, 300), 1000))) t
  ), '[]'::jsonb);
end
$f$;

create or replace function public.validaciones_lotes_revisar(p_clave text, p_nota text default null)
returns boolean language plpgsql volatile security definer set search_path = '' as $f$
declare filas integer;
begin
  if not coalesce((glacial_fs.ctx() ->> 'cal_esc')::boolean, false) then
    raise exception 'Sin permiso para revisar validaciones de lotes' using errcode = '42501';
  end if;
  update public.validaciones_lotes
     set revision_estado = 'REVISADA', revisada_en = now(), revisada_por = coalesce(auth.jwt() ->> 'email', ''),
         revision_nota = nullif(left(btrim(coalesce(p_nota, '')), 300), '')
   where clave = p_clave and revision_estado = 'PENDIENTE';
  get diagnostics filas = row_count;
  return filas > 0;
end
$f$;

revoke all on function public.validaciones_lotes_listar(timestamptz, integer) from public, anon;
revoke all on function public.validaciones_lotes_revisar(text, text) from public, anon;
grant execute on function public.validaciones_lotes_listar(timestamptz, integer) to authenticated;
grant execute on function public.validaciones_lotes_revisar(text, text) to authenticated;
