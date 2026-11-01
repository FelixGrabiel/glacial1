-- GLACIAL · glacial_34 · TRAZABILIDAD DE LOTES DE INSUMOS (Fase 4, Etapa 1: lote + unidad + movimientos)      *** APLICADA en PRUEBAS el 2026-10-25; PRODUCCIÓN pendiente (solo con la aprobación del dueño) ***
--
-- Qué hace (mismo método que glacial_24 y glacial_31):
--  1) autorizar: ramas para las colecciones nuevas del puente
--       · insumosLotes, insumosUnidades   se crean una vez (id = nombre del documento) y se ACTUALIZAN (estado, pesos, línea…); NO se borran.
--       · insumosLoteMovimientos          SOLO se crea (libro inmutable): el movimiento lleva el uid de quien lo hizo y la hora del servidor; una corrección es un movimiento nuevo.
--       · insumosLotesClaves              SOLO se crea (índice de unicidad proveedor+lote+producto → lote): dos personas no pueden crear el mismo lote.
--       · insumosParametros               contador del correlativo LI-, parámetros editables y memoria de artículos elegidos: se crea una vez y se actualiza; no se borra.
--     Escribe quien tiene la marca ii_esc de glacial_24 (por defecto Asistente de Producción y Administrador; los roles de solo consulta, no).
--     Las transiciones de estado de la unidad, la unicidad de la unidad por lote+n.º y la revisión (`rev`) las exige la aplicación dentro de una transacción
--     (estas reglas, como las de glacial_24/31, no comparan estado anterior → nuevo).
--  2) puede_leer: rama para esas colecciones con la marca ii_ver (Asistente de Producción, Jefe de Operaciones y Administrador).
--  3) El libro de auditoría (insumosAuditoria), las evidencias (insumosEvidencias, glacial_31) y las fotos (bucket privado «glacial-fotos», glacial_25) YA tienen reglas.
--  4) evidencias_entrada.leyenda: el texto que acompañó la foto en WhatsApp (RECEPCIÓN, PET1, PET2, B7L, C20L, B20L, DEVOLUCIÓN). Columna opcional: las filas actuales quedan igual
--     (leyenda null). evidencias_entrada_pendientes la devuelve en cada fila.
--  5) NO crea nada de stock SAP, producción, paradas, tareo ni Avance/Cierre.
--
-- ANTES DE APLICAR
--  · Requiere glacial_24 (marca ii_esc/ii_ver), glacial_31 y glacial_33. Si falta una ancla o una marca, la migración se detiene con un mensaje y no cambia nada.
--  · Orden: PRIMERO PRUEBAS (mvxjopvnnagqytegtexi); probar «Confirmar y crear lote» con una evidencia real; comparar la huella de las funciones; solo después PRODUCCION
--    (ehtbwmvwoxcdefvlxttu) y SOLO cuando el dueño lo apruebe.
--  · Se puede ejecutar más de una vez.

do $m$
declare
  def text; cuenta integer;
  anc_fin constant text := E'\n end if;\n return false;';
  rama_aut constant text := $r$
 elsif c in ('insumosLotes','insumosUnidades','insumosLoteMovimientos','insumosLotesClaves','insumosParametros') then
   declare
     esc boolean := coalesce((k->>'ii_esc')::boolean, false);
   begin
     if accion = 'delete' then return false; end if;                            -- ni lotes, ni unidades, ni movimientos se borran
     if c in ('insumosLoteMovimientos') then
       if accion <> 'create' then return false; end if;                         -- libro inmutable
       return esc and n->>'id' = d and n->>'uid' = u and n->'en' = ahora;
     elsif c = 'insumosLotesClaves' then
       return esc and accion = 'create' and n->>'id' = d;                       -- el índice de unicidad solo se crea
     else                                                                       -- lotes, unidades y parámetros: se crean una vez y se actualizan
       return esc and (accion = 'update' or n->>'id' = d);
     end if;
   end;
$r$;
  anc_leer constant text := E'\n end if;\n return false;';
  rama_leer constant text := E'\n elsif c in (''insumosLotes'',''insumosUnidades'',''insumosLoteMovimientos'',''insumosLotesClaves'',''insumosParametros'') then return coalesce((k->>''ii_ver'')::boolean, false);';
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'ctx';
  if position('ii_esc' in def) = 0 then raise exception 'ctx no tiene ii_esc: aplica antes glacial_24'; end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if position('insumosEvidencias' in def) = 0 then raise exception 'autorizar no tiene la rama de evidencias: aplica antes glacial_31'; end if;
  if position('insumosLotes' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_fin, ''))) / length(anc_fin);
    if cuenta <> 1 then raise exception 'autorizar: punto de inserción encontrado % veces', cuenta; end if;
    execute replace(def, anc_fin, rama_aut || anc_fin);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if position('insumosLotes' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_leer, ''))) / length(anc_leer);
    if cuenta <> 1 then raise exception 'puede_leer: punto de inserción encontrado % veces', cuenta; end if;
    execute replace(def, anc_leer, rama_leer || anc_leer);
  end if;
end $m$;

-- Leyenda que acompañó la foto (opcional; las filas actuales quedan en null).
do $l$
begin
  if to_regclass('public.evidencias_entrada') is null then raise exception 'falta public.evidencias_entrada: aplica antes glacial_33'; end if;
end $l$;
alter table public.evidencias_entrada add column if not exists leyenda text check (leyenda is null or char_length(leyenda) <= 40);

create or replace function public.evidencias_entrada_pendientes(p_limite integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
begin
  if not coalesce((glacial_fs.ctx() ->> 'ii_esc')::boolean, false) then
    raise exception 'Sin permiso para importar evidencias' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('sha256', t.sha256, 'registro', t.registro, 'foto_ruta', t.foto_ruta, 'mime', t.mime, 'bytes', t.bytes, 'recibido_en', t.recibido_en, 'leyenda', t.leyenda) order by t.recibido_en)
      from (select * from public.evidencias_entrada e
             where e.importada_en is null and e.error is null
             order by e.recibido_en
             limit greatest(1, least(coalesce(p_limite, 50), 100))) t
  ), '[]'::jsonb);
end
$f$;
revoke all on function public.evidencias_entrada_pendientes(integer) from public, anon;
grant execute on function public.evidencias_entrada_pendientes(integer) to authenticated;
