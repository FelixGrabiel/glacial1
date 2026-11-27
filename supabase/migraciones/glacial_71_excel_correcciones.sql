-- GLACIAL · glacial_71 · CORRECCIONES GUARDADAS EN LOS EXCEL DE REPORTES (27/11/2026)      *** APLICADA en PRUEBAS (27/11/2026) · NO en PRODUCCIÓN ***
--
-- Qué hace (docs/00-general/vista-excel.md)
--   En la vista previa de un Excel (46-vista-excel.js) «✎ Editar» guarda cada celda corregida en el servidor. Al volver a abrir ESE reporte
--   (mismo archivo: p. ej. «Reporte-diario-Hielo-2026-11-26-dia») o al descargarlo, las correcciones se aplican solas, en cualquier equipo.
--   · public.excel_correcciones: una fila por reporte + hoja + celda con el valor corregido, el valor ORIGINAL (el que generó el sistema),
--     quién y cuándo. Si el dato del sistema cambió después (el original ya no coincide), la pantalla NO aplica la corrección y lo avisa.
--   · public.excel_correcciones_historial: cada guardado y cada «quitar corrección» (antes → después, quién, cuándo).
--   · No cambia los datos de origen (registros, paletas, paradas, reportes de Hielo): corrige el Excel del reporte.
--   RLS activada y SIN políticas; sin permisos directos para anon/authenticated: solo estas funciones (security definer):
--     public.excel_correcciones_listar(p_reporte)  → [filas]          requiere ctx.resumen (ver reportes)
--     public.excel_correccion_guardar(p jsonb)     → fila | null      requiere ctx.opera   (valor null = quitar la corrección)
-- Errores: 42501 sin permiso · 23514 dato no válido («excel: …»).
-- ORDEN: PRUEBAS (mvxjopvnnagqytegtexi) primero; PRODUCCIÓN (ehtbwmvwoxcdefvlxttu) solo con aprobación del dueño. Se puede ejecutar más de una vez.
-- Marcha atrás: drop function public.excel_correccion_guardar(jsonb), public.excel_correcciones_listar(text), glacial_fs.excel_correccion_error(jsonb);
--   drop table public.excel_correcciones_historial, public.excel_correcciones;

do $c$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'glacial_fs' and p.proname = 'ctx';
  if def is null or position('''opera''' in def) = 0 or position('''resumen''' in def) = 0 then
    raise exception 'glacial_fs.ctx no tiene las marcas opera / resumen';
  end if;
end $c$;

create table if not exists public.excel_correcciones (
  reporte          text not null check (char_length(reporte) between 3 and 200),
  hoja             text not null check (char_length(hoja) between 1 and 100),
  celda            text not null check (celda ~ '^[A-Z]{1,3}[1-9][0-9]{0,5}$'),
  valor            jsonb not null check (jsonb_typeof(valor) in ('number','string')),
  original         jsonb,
  actualizado_por  text,
  actualizado_uid  uuid,
  actualizado_en   timestamptz not null default now(),
  client_event_id  uuid not null unique,
  primary key (reporte, hoja, celda)
);
create table if not exists public.excel_correcciones_historial (
  id               bigserial primary key,
  reporte          text not null,
  hoja             text not null,
  celda            text not null,
  antes            jsonb,
  despues          jsonb,
  original         jsonb,
  usuario          text,
  uid              uuid,
  en               timestamptz not null default now()
);
create index if not exists excel_correcciones_hist_idx on public.excel_correcciones_historial (reporte, en desc);

alter table public.excel_correcciones enable row level security;
alter table public.excel_correcciones_historial enable row level security;
revoke all on public.excel_correcciones from public, anon, authenticated;
revoke all on public.excel_correcciones_historial from public, anon, authenticated;
grant all on public.excel_correcciones to service_role;
grant all on public.excel_correcciones_historial to service_role;
revoke all on sequence public.excel_correcciones_historial_id_seq from public, anon, authenticated;

/* ---------- reglas puras: NULL si es válido, o el motivo ---------- */
create or replace function glacial_fs.excel_correccion_error(p jsonb)
returns text language plpgsql immutable set search_path = '' as $f$
begin
  if p is null or jsonb_typeof(p) <> 'object' then return 'pedido vacío'; end if;
  if char_length(coalesce(p->>'reporte','')) not between 3 and 200 then return 'reporte no válido'; end if;
  if char_length(coalesce(p->>'hoja','')) not between 1 and 100 then return 'hoja no válida'; end if;
  if coalesce(p->>'celda','') !~ '^[A-Z]{1,3}[1-9][0-9]{0,5}$' then return 'celda no válida (p. ej. B12)'; end if;
  if p ? 'valor' and jsonb_typeof(p->'valor') not in ('number','string','null') then return 'el valor debe ser número o texto'; end if;
  if jsonb_typeof(p->'valor') = 'string' and char_length(p->>'valor') > 2000 then return 'texto demasiado largo (máximo 2000)'; end if;
  if p ? 'original' and jsonb_typeof(p->'original') not in ('number','string','null') then return 'original no válido'; end if;
  if coalesce(p->>'client_event_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return 'evento no válido'; end if;
  return null;
end $f$;

create or replace function public.excel_correcciones_listar(p_reporte text)
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
begin
  if not coalesce((glacial_fs.ctx() ->> 'resumen')::boolean, false) then
    raise exception 'Sin permiso para ver las correcciones del reporte' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('hoja', t.hoja, 'celda', t.celda, 'valor', t.valor, 'original', t.original,
                                                       'actualizado_por', t.actualizado_por, 'actualizado_en', t.actualizado_en) order by t.hoja, t.celda)
                     from public.excel_correcciones t where t.reporte = p_reporte), '[]'::jsonb);
end $f$;

create or replace function public.excel_correccion_guardar(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare c jsonb := glacial_fs.ctx(); e text; previo public.excel_correcciones; fila public.excel_correcciones; quien text;
begin
  if not coalesce((c ->> 'opera')::boolean, false) then raise exception 'Sin permiso para corregir reportes' using errcode = '42501'; end if;
  e := glacial_fs.excel_correccion_error(p);
  if e is not null then raise exception 'excel: %', e using errcode = '23514'; end if;
  -- idempotencia: el mismo evento ya aplicado → la misma fila
  select * into fila from public.excel_correcciones t where t.client_event_id = (p->>'client_event_id')::uuid;
  if found then return to_jsonb(fila); end if;
  quien := glacial_fs.cierre_quien();
  select * into previo from public.excel_correcciones t where t.reporte = p->>'reporte' and t.hoja = p->>'hoja' and t.celda = p->>'celda';
  if p->'valor' is null or jsonb_typeof(p->'valor') = 'null' then
    -- quitar la corrección: vuelve el valor del sistema
    if previo.reporte is not null then
      delete from public.excel_correcciones t where t.reporte = previo.reporte and t.hoja = previo.hoja and t.celda = previo.celda;
      insert into public.excel_correcciones_historial (reporte, hoja, celda, antes, despues, original, usuario, uid)
      values (previo.reporte, previo.hoja, previo.celda, previo.valor, null, previo.original, quien, (c->>'uid')::uuid);
    end if;
    return null;
  end if;
  insert into public.excel_correcciones as t (reporte, hoja, celda, valor, original, actualizado_por, actualizado_uid, actualizado_en, client_event_id)
  values (p->>'reporte', p->>'hoja', p->>'celda', p->'valor', case when jsonb_typeof(p->'original') in ('number','string') then p->'original' end,
          quien, (c->>'uid')::uuid, now(), (p->>'client_event_id')::uuid)
  on conflict (reporte, hoja, celda) do update set valor = excluded.valor, original = coalesce(t.original, excluded.original),
     actualizado_por = excluded.actualizado_por, actualizado_uid = excluded.actualizado_uid, actualizado_en = now(), client_event_id = excluded.client_event_id
  returning * into fila;
  insert into public.excel_correcciones_historial (reporte, hoja, celda, antes, despues, original, usuario, uid)
  values (fila.reporte, fila.hoja, fila.celda, previo.valor, fila.valor, fila.original, quien, (c->>'uid')::uuid);
  return to_jsonb(fila);
end $f$;

revoke all on function public.excel_correcciones_listar(text) from public, anon;
revoke all on function public.excel_correccion_guardar(jsonb) from public, anon;
grant execute on function public.excel_correcciones_listar(text) to authenticated;
grant execute on function public.excel_correccion_guardar(jsonb) to authenticated;
