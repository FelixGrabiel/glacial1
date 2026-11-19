-- GLACIAL · glacial_64 · Calidad ve los lotes que lee el bot de WhatsApp (datos de la etiqueta + foto)   *** APLICADA EN PRUEBAS el 2026-11-19 · PRODUCCION pendiente ***
--
-- Por qué: el bot deja cada foto con la lectura de la etiqueta (lote, marca, proveedor, producto, fechas, pesos, advertencias) en
-- public.evidencias_entrada (glacial_33), pero esa tabla solo la ven quienes validan Evidencias (ii_esc). Calidad no veía nada de eso.
-- Qué hace:
--   · public.calidad_lecturas_listar(p_desde, p_limite): devuelve las lecturas recientes (solo los campos útiles, sin nulos) a quien tiene la marca
--     cal_ver de Calidad (glacial_55: Administrador, «calidadVer», o por defecto Asistente de Producción y Jefe de Operaciones). Misma regla que
--     validaciones_lotes_listar.
--   · Es SOLO LECTURA: no mueve stock, no crea lotes, no toca Evidencias. La tabla sigue con RLS sin políticas y sin acceso directo.
--   · La foto se ve con un enlace firmado del bucket privado «glacial-fotos» (glacial_25 ya deja leer a cualquier perfil con sesión, salvo Mantenimiento
--     compartido). Solo se entrega la ruta si está en asistente/evidencias/.
-- Requiere glacial_33 (evidencias_entrada) y glacial_55 (marca cal_ver). Se puede ejecutar más de una vez.
-- Orden: PRUEBAS primero, PRODUCCION después (solo cuando el dueño diga «Aplica en producción»).

do $c$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'glacial_fs' and p.proname = 'ctx';
  if def is null or position('cal_ver' in def) = 0 then raise exception 'glacial_fs.ctx no tiene la marca cal_ver: aplica antes glacial_55'; end if;
  if to_regclass('public.evidencias_entrada') is null then raise exception 'falta public.evidencias_entrada: aplica antes glacial_33'; end if;
end $c$;

create or replace function public.calidad_lecturas_listar(p_desde timestamptz default null, p_limite integer default 300)
returns jsonb language plpgsql stable security definer set search_path = ''
as $f$
begin
  if not coalesce((glacial_fs.ctx() ->> 'cal_ver')::boolean, false) then
    raise exception 'Sin permiso para ver los lotes leídos' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.recibido_en desc)
      from (select e.sha256,
                   case when e.foto_ruta like 'asistente/evidencias/%' then e.foto_ruta end as foto_ruta,
                   e.mime, e.leyenda, e.recibido_en, (e.importada_en is not null) as importada,
                   e.registro ->> 'estado' as estado,
                   e.registro ->> 'analizado_en' as analizado_en,
                   jsonb_strip_nulls(e.registro -> 'extraccion') as extraccion,
                   e.registro -> 'revision_local' -> 'campos_en_duda' as campos_en_duda,
                   e.registro -> 'revision_local' -> 'cambios_sugeridos' as cambios_sugeridos,
                   coalesce((e.registro -> 'revision_local' ->> 'requiere_confirmacion_humana')::boolean, false) as requiere_confirmacion
              from public.evidencias_entrada e
             where e.recibido_en >= coalesce(p_desde, now() - interval '30 days')
             order by e.recibido_en desc
             limit greatest(1, least(coalesce(p_limite, 300), 500))) t
  ), '[]'::jsonb);
end
$f$;
revoke all on function public.calidad_lecturas_listar(timestamptz, integer) from public, anon;
grant execute on function public.calidad_lecturas_listar(timestamptz, integer) to authenticated;
