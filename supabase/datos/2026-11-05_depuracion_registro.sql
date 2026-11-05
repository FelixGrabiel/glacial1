-- GLACIAL · Depuración del Registro de producción (auditoría 2026-11-05, punto 3) · aprobada por el dueño el 05/11/2026
--
-- Qué hace, en UNA transacción sobre sync/records (public.fs_items, campo «items»):
--   A) Elimina (borrado suave, eliminado_en) 22 copias abiertas de turnos que ya tienen un reporte FINALIZADO.
--   B) Elimina 7 copias en turnos con dos reportes abiertos (vacías o versiones anteriores).
--   D) Elimina 6 reportes antiguos vacíos y cierra (FINALIZADO, cierreAdministrativo) 27 reportes antiguos con producción.
--   C.2) Pasa r_1792147585095_gkhop (B7L 15/10, horario 07:00–19:00) de NOCHE a DÍA.
--   Cada eliminación deja su constancia en auditoriaRegistros (motivo + copia completa), igual que la página.
-- Seguridad: se detiene si algún reporte no existe, ya estaba eliminado o ya no está «abierto» (alguien lo tocó desde el análisis).
-- Compara los totales de los registros oficiales (misma regla que registrosOficiales en 45-indicadores.js) antes y después:
-- solo pueden cambiar B7L 15/10 DÍA (+5040), B7L 21/10 DÍA (+3580) y PET1 21/10 DÍA (desaparece, 0).
-- Estado: ENSAYO OK y APLICADO en PRODUCCIÓN el 05/11/2026 (total oficial 1 066 581 → 1 075 201; 35 constancias en auditoriaRegistros).
--   No volver a ejecutar: la comprobación de «63 reportes abiertos» lo impediría de todos modos.
-- Modo ensayo: con ensayo = true termina con un error que lleva el resumen, y no queda nada guardado.

do $dep$
declare
  ensayo constant boolean := true;
  motivo constant text := 'Depuración auditoría 05/11/2026 (punto 3): copia duplicada, vacía o versión anterior';
  quien constant text := 'Cierre administrativo (auditoría 05/11/2026)';
  eliminar constant text[] := array[
    -- A
    'r_1791299504790_zhgsy','r_1791960332391_3cfz5','r_1791953549966_vd7te','r_1792025730219_gkjys','r_1792067695645_3w9ge',
    'r_1792069967318_oh4hz','r_1792054521899_kmqza','r_1792062135530_im522','r_1792067452799_dthq7','r_1792059025667_0r64q',
    'r_1792076941896_ldo5z','r_1792148070247_ltshx','r_1792131130625_dy1q8','r_1792146109970_1wy1y','r_1792076792002_r6b5s',
    'r_1792147156028_y1j3n','r_1792677999669_sz8z5','r_1792726597226_81d7t','r_1792684752013_3qowy','r_1792781990873_8elx2',
    'r_1792770396685_0qvn6','r_1792770067462_d4dep',
    -- B
    'r_1792645380009_m5x84','r_1792594385994_d9esd','r_1792621870115_c4l21','r_1792763965043_aqdle','r_1792826861902_qmwus',
    'r_1792819599978_gc5a5','r_1793798573943_tbr51',
    -- D vacíos
    'r_1790790641949_t9grz','r_1790867243932_2cf61','r_1791675719853_catov','r_1792147215861_a0o7o','r_1792828639949_63uxl',
    'r_1793024461826_n0ju0'];
  cerrar constant text[] := array[
    'r_1790475970598_hzvnq','r_1790694516140_txvyy','r_1790955172880_ee50n','r_1791215796607_zmyxx','r_1791654072808_4qe9x',
    'r_1791662191141_p771w','r_1791651347542_9s615','r_1792062250939_5qvi1','r_1792019049465_si15w','r_1791955520831_pkxkm',
    'r_1792087867865_5hr14','r_1792076858777_hs2sw','r_1792269723389_p2lyo','r_1792244408833_a7tom','r_1792269371170_1hzeo',
    'r_1792252631161_uzp2z','r_1792258080874_15zkx','r_1792441255913_k5bef','r_1792421525516_hodrl','r_1792441157740_1uj5g',
    'r_1792447195140_91g6e','r_1792432155869_igwce','r_1792537955186_exngj','r_1792598803700_hanwb','r_1792634423310_2rit9',
    'r_1792594392936_7w0l2','r_1792821388120_3i1xc'];
  mover constant text := 'r_1792147585095_gkhop';
  v_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_prox bigint; v_n integer; v_toc integer := 0; rec record; antes jsonb; despues jsonb; dif text; total_antes numeric; total_despues numeric;
begin
  if array_length(eliminar, 1) <> 35 or array_length(cerrar, 1) <> 27 then raise exception 'listas con tamaño inesperado'; end if;

  -- El documento sync/records queda bloqueado mientras dura la transacción (los guardados de la página esperan).
  select version + 1 into v_prox from public.fs_docs where coleccion = 'sync' and id = 'records' for update;

  -- Comprobaciones previas
  select count(*) into v_n from public.fs_items
   where coleccion = 'sync' and doc = 'records' and campo = 'items' and eliminado_en is null
     and id = any(eliminar || cerrar || mover) and coalesce(datos->>'estadoRegistro', '') <> 'FINALIZADO';
  if v_n <> 63 then raise exception 'esperaba 63 reportes abiertos y vigentes, hay %: alguien los cambió; no se hace nada', v_n; end if;

  -- Totales oficiales (línea|fecha|turno → el FINALIZADO más reciente; si no hay, el más reciente)
  create temp table _oficial_antes on commit drop as
  with r as (
    select datos d from public.fs_items where coleccion = 'sync' and doc = 'records' and campo = 'items' and eliminado_en is null
  ), g as (
    select d->>'linea' l, d->>'fecha' f, translate(upper(trim(coalesce(d->>'turno', d->>'grupoTurno', ''))), 'ÁÉÍÓÚ', 'AEIOU') t,
           (select coalesce(sum(case when (q->'produccion'->>'efectiva') ~ '^[0-9]+(\.[0-9]+)?$' then (q->'produccion'->>'efectiva')::numeric end), 0)
              from jsonb_array_elements(case when jsonb_typeof(d->'cuadros') = 'array' then d->'cuadros' else '[]'::jsonb end) q) ef,
           row_number() over (partition by d->>'linea', d->>'fecha', translate(upper(trim(coalesce(d->>'turno', d->>'grupoTurno', ''))), 'ÁÉÍÓÚ', 'AEIOU')
             order by (d->>'estadoRegistro' = 'FINALIZADO') desc,
                      coalesce(nullif(d->>'finalizadoEn', ''), nullif(d->>'actualizadoEn', ''), nullif(d->>'creadoEn', ''), '0')::numeric desc) rn
      from r where coalesce(d->>'linea', '') <> '' and coalesce(d->>'fecha', '') <> ''
  ) select l, f, t, ef from g where rn = 1;

  -- A + B + D: constancia y borrado suave
  for rec in select id, datos from public.fs_items
              where coleccion = 'sync' and doc = 'records' and campo = 'items' and eliminado_en is null and id = any(eliminar) loop
    insert into public.fs_docs(coleccion, id, datos, version, partes, conteos)
    values ('auditoriaRegistros', 'elim_' || rec.id || '_' || v_ms,
            jsonb_build_object('accion', 'ELIMINAR', 'registroId', rec.id, 'linea', rec.datos->>'linea', 'fecha', rec.datos->>'fecha',
                               'turno', rec.datos->>'turno', 'estadoRegistro', rec.datos->>'estadoRegistro', 'motivo', motivo,
                               'uid', null, 'usuario', quien, 'timestamp', jsonb_build_object('__ts', v_ms), 'copia', rec.datos),
            1, '{}'::text[], '{}'::jsonb);
  end loop;
  update public.fs_items set eliminado_en = now(), actualizado_en = now(), v = v_prox
   where coleccion = 'sync' and doc = 'records' and campo = 'items' and eliminado_en is null and id = any(eliminar);
  get diagnostics v_n = row_count; v_toc := v_toc + v_n;
  if v_n <> 35 then raise exception 'se eliminaron % en vez de 35', v_n; end if;

  -- D: cierre administrativo
  update public.fs_items
     set datos = datos || jsonb_build_object(
           'estadoRegistro', 'FINALIZADO', 'finalizadoEn', v_ms, 'finalizadoPor', quien,
           'actualizadoEn', v_ms, 'actualizadoPor', quien,
           'versionReporte', coalesce(nullif(datos->>'versionReporte', '')::bigint, 0) + 1,
           'cierreAdministrativo', jsonb_build_object('motivo', 'Reporte antiguo que quedó abierto; cerrado sin cambiar sus datos', 'fecha', v_ms, 'por', quien),
           'auditoria', coalesce(case when jsonb_typeof(datos->'auditoria') = 'array' then datos->'auditoria' end, '[]'::jsonb)
                        || jsonb_build_array(jsonb_build_object('accion', 'FINALIZADO', 'fecha', v_ms, 'usuario', quien, 'detalle', 'Cierre administrativo'))),
         actualizado_en = now(), v = v_prox
   where coleccion = 'sync' and doc = 'records' and campo = 'items' and eliminado_en is null and id = any(cerrar);
  get diagnostics v_n = row_count; v_toc := v_toc + v_n;
  if v_n <> 27 then raise exception 'se cerraron % en vez de 27', v_n; end if;

  -- C.2: B7L 15/10, producción de día guardada como NOCHE
  update public.fs_items
     set datos = datos || jsonb_build_object(
           'turno', 'DÍA', 'grupoTurno', 'DIA_INTERMEDIO', 'actualizadoEn', v_ms, 'actualizadoPor', quien,
           'versionReporte', coalesce(nullif(datos->>'versionReporte', '')::bigint, 0) + 1,
           'auditoria', coalesce(case when jsonb_typeof(datos->'auditoria') = 'array' then datos->'auditoria' end, '[]'::jsonb)
                        || jsonb_build_array(jsonb_build_object('accion', 'CAMBIO_TURNO', 'fecha', v_ms, 'usuario', quien,
                                                                'detalle', 'NOCHE → DÍA: horario 07:00–19:00 (auditoría 05/11/2026)'))),
         actualizado_en = now(), v = v_prox
   where coleccion = 'sync' and doc = 'records' and campo = 'items' and eliminado_en is null and id = mover
     and datos->>'grupoTurno' = 'NOCHE';
  get diagnostics v_n = row_count; v_toc := v_toc + v_n;
  if v_n <> 1 then raise exception 'no se pudo mover %', mover; end if;

  -- Nueva versión del documento: las páginas abiertas se ponen al día solas (tocados > 0)
  update public.fs_docs f
     set version = v_prox, tocados = v_toc, actualizado_en = now(), actualizado_por = null,
         conteos = jsonb_build_object('items', (select count(*) from public.fs_items i
                                                 where i.coleccion = 'sync' and i.doc = 'records' and i.campo = 'items' and i.eliminado_en is null))
   where coleccion = 'sync' and id = 'records';

  -- Totales después y diferencias
  create temp table _oficial_despues on commit drop as
  with r as (
    select datos d from public.fs_items where coleccion = 'sync' and doc = 'records' and campo = 'items' and eliminado_en is null
  ), g as (
    select d->>'linea' l, d->>'fecha' f, translate(upper(trim(coalesce(d->>'turno', d->>'grupoTurno', ''))), 'ÁÉÍÓÚ', 'AEIOU') t,
           (select coalesce(sum(case when (q->'produccion'->>'efectiva') ~ '^[0-9]+(\.[0-9]+)?$' then (q->'produccion'->>'efectiva')::numeric end), 0)
              from jsonb_array_elements(case when jsonb_typeof(d->'cuadros') = 'array' then d->'cuadros' else '[]'::jsonb end) q) ef,
           row_number() over (partition by d->>'linea', d->>'fecha', translate(upper(trim(coalesce(d->>'turno', d->>'grupoTurno', ''))), 'ÁÉÍÓÚ', 'AEIOU')
             order by (d->>'estadoRegistro' = 'FINALIZADO') desc,
                      coalesce(nullif(d->>'finalizadoEn', ''), nullif(d->>'actualizadoEn', ''), nullif(d->>'creadoEn', ''), '0')::numeric desc) rn
      from r where coalesce(d->>'linea', '') <> '' and coalesce(d->>'fecha', '') <> ''
  ) select l, f, t, ef from g where rn = 1;

  select coalesce(sum(ef), 0) into total_antes from _oficial_antes;
  select coalesce(sum(ef), 0) into total_despues from _oficial_despues;
  select string_agg(concat(coalesce(a.l, b.l), ' ', coalesce(a.f, b.f), ' ', coalesce(a.t, b.t), ': ',
                           coalesce(a.ef::text, '—'), ' → ', coalesce(b.ef::text, '—')), '; ' order by coalesce(a.f, b.f), coalesce(a.l, b.l))
    into dif
    from _oficial_antes a full join _oficial_despues b on a.l = b.l and a.f = b.f and a.t = b.t
   where a.ef is distinct from b.ef;

  -- Solo se permiten los cambios esperados
  if total_despues - total_antes <> 8620 then
    raise exception 'diferencia de totales inesperada: % → % (%). Cambios: %', total_antes, total_despues, total_despues - total_antes, dif;
  end if;

  if ensayo then
    raise exception 'ENSAYO OK (nada guardado) · versión % · tocados % · total oficial % → % · cambios: %', v_prox, v_toc, total_antes, total_despues, dif;
  end if;
  raise notice 'APLICADO · versión % · tocados % · total oficial % → % · cambios: %', v_prox, v_toc, total_antes, total_despues, dif;
end $dep$;
