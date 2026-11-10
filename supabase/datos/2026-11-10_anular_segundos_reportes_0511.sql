-- GLACIAL · Anulación de 4 reportes repetidos del 05/11 NOCHE (auditoría Agua 07/11/2026, punto D) · aprobada por el dueño el 10/11/2026
--
-- Anula (borrado suave, eliminado_en) el SEGUNDO reporte de B7L, C20L, PET1 y PET2 del 05/11 NOCHE (creado el 06/11 ~12:50):
-- repite la producción del primero y agrega una marca de las 19:00 / 07:00 sin hora de fin (producción de otro día); en PET2 tiene otra cantidad.
-- Se conserva el PRIMER reporte de cada línea. Cada anulación deja su constancia con la copia completa en auditoriaRegistros.
-- NO toca el 04/11 B7L DÍA (lo confirma el supervisor).
-- Seguridad: se detiene si alguno de los 4 ya no existe o ya no está EN_REGISTRO. Compara el total oficial antes y después.
-- Cambio esperado del total oficial (producción efectiva): -12 077 (B7L -5 342 · C20L -195 · PET1 -5 712 · PET2 -828).
-- Estado: ENSAYO OK y APLICADO en PRODUCCIÓN el 10/11/2026 (total oficial 1 300 542 → 1 288 465; 4 constancias en auditoriaRegistros). No volver a ejecutar.
-- Modo ensayo: con ensayo = true termina con un error que lleva el resumen y no queda nada guardado.

do $dep$
declare
  ensayo constant boolean := true;
  motivo constant text := 'Anulación auditoría Agua 07/11/2026 (punto D): segundo reporte repetido del 05/11 NOCHE';
  quien constant text := 'Anulación administrativa (auditoría 07/11/2026)';
  eliminar constant text[] := array['r_1793966919184_7d0wi','r_1793966922799_vxpr7','r_1793966804669_9721x','r_1793966860470_ksuxd'];
  v_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_prox bigint; v_n integer; v_toc integer := 0; rec record; antes jsonb; despues jsonb; dif text; total_antes numeric; total_despues numeric;
begin
  select version + 1 into v_prox from public.fs_docs where coleccion = 'sync' and id = 'records' for update;

  select count(*) into v_n from public.fs_items
   where coleccion = 'sync' and doc = 'records' and campo = 'items' and eliminado_en is null
     and id = any(eliminar) and coalesce(datos->>'estadoRegistro', '') <> 'FINALIZADO' and datos->>'fecha' = '2026-11-05' and datos->>'turno' = 'NOCHE';
  if v_n <> 4 then raise exception 'esperaba 4 reportes abiertos y vigentes, hay %: alguien los cambió; no se hace nada', v_n; end if;

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
  if v_n <> 4 then raise exception 'se anularon % en vez de 4', v_n; end if;

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
  if total_despues - total_antes <> -12077 then
    raise exception 'diferencia de totales inesperada: % → % (%). Cambios: %', total_antes, total_despues, total_despues - total_antes, dif;
  end if;

  if ensayo then
    raise exception 'ENSAYO OK (nada guardado) · versión % · tocados % · total oficial % → % · cambios: %', v_prox, v_toc, total_antes, total_despues, dif;
  end if;
  raise notice 'APLICADO · versión % · tocados % · total oficial % → % · cambios: %', v_prox, v_toc, total_antes, total_despues, dif;
end $dep$;
