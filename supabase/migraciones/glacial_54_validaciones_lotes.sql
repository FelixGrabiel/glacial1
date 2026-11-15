-- GLACIAL · glacial_54 · VALIDACIÓN DE LOTES (la llena la función validaciones-lotes-ingesta con lo que valida el bot; la lee la pestaña del Asistente)      *** APLICADA en PRUEBAS y PRODUCCIÓN (15/11/2026) ***
--
-- Qué hace
--  1) public.validaciones_lotes: una fila por validación que el bot de WhatsApp (glacial-whatsapp) hace de un lote (clave idempotente), con su resultado
--     (OK, OBSERVADO o RECHAZADO), los controles que revisó (jsonb) y, si existe, la huella de la foto en Evidencias.
--  2) RLS activada y SIN ninguna política, sin permisos para anon ni authenticated: la página nunca lee ni escribe la tabla directamente.
--     Solo escribe la función de servidor (llave de servicio) y solo se lee/marca por las dos funciones de abajo.
--  3) public.validaciones_lotes_listar(p_desde, p_limite): quien ve el Inventario de insumos (marca ii_ver de glacial_24: Asistente de Producción, Jefe de
--     Operaciones y Administrador). Es la misma regla que Evidencias y Lotes.
--  4) public.validaciones_lotes_revisar(p_clave, p_nota): una persona que escribe en el Inventario (ii_esc) marca la validación como REVISADA, con nota.
--  5) NO toca stock, lotes, evidencias ni catálogo: es un registro de lo que validó el bot y de quién lo revisó.
--
-- ANTES DE APLICAR: requiere glacial_24 (marcas ii_ver e ii_esc). Orden: PRUEBAS (mvxjopvnnagqytegtexi) primero; PRODUCCIÓN solo con aprobación del dueño.
-- Se puede ejecutar más de una vez.

do $c$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'ctx';
  if def is null or position('ii_esc' in def) = 0 or position('ii_ver' in def) = 0 then
    raise exception 'glacial_fs.ctx no tiene las marcas ii_ver / ii_esc: aplica antes glacial_24';
  end if;
end $c$;

create table if not exists public.validaciones_lotes (
  clave            text primary key check (clave ~ '^[A-Za-z0-9._:@-]{8,128}$'),
  lote             text not null check (char_length(btrim(lote)) between 1 and 60),
  resultado        text not null check (resultado in ('OK', 'OBSERVADO', 'RECHAZADO')),
  insumo           text check (insumo is null or char_length(insumo) <= 120),
  proveedor        text check (proveedor is null or char_length(proveedor) <= 120),
  linea            text check (linea is null or char_length(linea) <= 20),
  motivo           text check (motivo is null or char_length(motivo) <= 500),
  controles        jsonb not null default '[]'::jsonb check (jsonb_typeof(controles) = 'array' and jsonb_array_length(controles) <= 40),
  datos            jsonb not null default '{}'::jsonb check (jsonb_typeof(datos) = 'object'),
  evidencia_sha256 text check (evidencia_sha256 is null or evidencia_sha256 ~ '^[a-f0-9]{64}$'),
  origen           text not null default 'bot',
  validada_en      timestamptz not null default now(),
  recibido_en      timestamptz not null default now(),
  revision_estado  text not null default 'PENDIENTE' check (revision_estado in ('PENDIENTE', 'REVISADA')),
  revisada_en      timestamptz,
  revisada_por     text,
  revision_nota    text check (revision_nota is null or char_length(revision_nota) <= 300)
);
create index if not exists validaciones_lotes_fecha_idx on public.validaciones_lotes (validada_en desc);
create index if not exists validaciones_lotes_lote_idx on public.validaciones_lotes (lote);

alter table public.validaciones_lotes enable row level security;
revoke all on public.validaciones_lotes from public, anon, authenticated;
grant all on public.validaciones_lotes to service_role;

create or replace function public.validaciones_lotes_listar(p_desde timestamptz default null, p_limite integer default 300)
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
begin
  if not coalesce((glacial_fs.ctx() ->> 'ii_ver')::boolean, false) then
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
  if not coalesce((glacial_fs.ctx() ->> 'ii_esc')::boolean, false) then
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
