-- GLACIAL · glacial_64 · La validación de rótulo guarda y entrega la FOTO del rótulo   *** APLICADA EN PRUEBAS y en PRODUCCION el 2026-11-19 (el DROP final de la limpieza, solo PRUEBAS, quedó sin ejecutar: pide confirmación humana) ***
--
-- Por qué: el bot de WhatsApp valida el rótulo de producto terminado (foto de la codificadora: lote, vencimiento, turno, marca, línea, día juliano).
-- glacial_54 solo guardaba la validación; ahora también la foto, para verla en Calidad › Validación de lotes junto a los datos.
-- Qué hace:
--   1) public.validaciones_lotes.foto_ruta: ruta de la foto en el bucket privado «glacial-fotos», SOLO con la forma calidad/rotulos/<sha256>.<jpg|png|webp>.
--   2) public.validaciones_lotes_listar (glacial_55) devuelve también foto_ruta. Mismo permiso (cal_ver); la tabla sigue con RLS sin políticas.
--   · La foto se lee con enlace firmado (glacial_25 ya deja leer el bucket a cualquier perfil con sesión, salvo Mantenimiento compartido).
--   · NO toca stock, lotes ni Evidencias.
-- Requiere glacial_54 y glacial_55. Ancla: «v.evidencia_sha256, v.origen,» exactamente una vez en validaciones_lotes_listar; si no, se detiene sin cambiar nada.
-- Se puede ejecutar más de una vez. Orden: PRUEBAS primero, PRODUCCION después (solo cuando el dueño diga «Aplica en producción»).
-- Limpieza (solo PRUEBAS): una versión anterior de este trabajo creó public.calidad_lecturas_listar; se elimina (ver al final).

do $c$
begin
  if to_regclass('public.validaciones_lotes') is null then raise exception 'falta public.validaciones_lotes: aplica antes glacial_54'; end if;
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validaciones_lotes_listar') not like '%cal_ver%' then
    raise exception 'validaciones_lotes_listar no exige cal_ver: aplica antes glacial_55';
  end if;
end $c$;

alter table public.validaciones_lotes add column if not exists foto_ruta text;
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'validaciones_lotes_foto_ruta_check') then
    alter table public.validaciones_lotes add constraint validaciones_lotes_foto_ruta_check
      check (foto_ruta is null or foto_ruta ~ '^calidad/rotulos/[a-f0-9]{64}\.(jpg|png|webp)$');
  end if;
end $c$;

do $m$
declare
  def text; cuenta integer;
  anc constant text := 'v.evidencia_sha256, v.origen,';
  rep constant text := 'v.evidencia_sha256, v.foto_ruta, v.origen,';
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'validaciones_lotes_listar';
  if position('v.foto_ruta' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc, ''))) / length(anc);
    if cuenta <> 1 then raise exception 'validaciones_lotes_listar: ancla encontrada % veces', cuenta; end if;
    execute replace(def, anc, rep);
  end if;
end $m$;

-- (solo PRUEBAS, aparte porque es un DROP) drop function if exists public.calidad_lecturas_listar(timestamptz, integer);
