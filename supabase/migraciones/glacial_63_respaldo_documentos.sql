-- GLACIAL · glacial_63 · Copias automáticas de los documentos críticos (paletas, tareos, programaciones, perfiles, usuarios, trabajadores)   *** PENDIENTE: ni PRUEBAS ni PRODUCCION ***
--
-- Por qué (auditoría de seguridad 18/11/2026): cualquier usuario con sesión puede reemplazar sync/paletas o sync/tareos (el servidor solo impide
-- borrarlos o vaciarlos), y hoy no existe forma de recuperar la versión anterior.
-- Qué hace:
--   · tabla glacial_fs.respaldo_docs (privada: RLS activa y sin políticas; solo la lee el dueño de la base);
--   · función glacial_fs.respaldo_tomar(): guarda una copia completa (datos + listas partidas) de cada documento de la lista SOLO si su versión cambió
--     desde la última copia, y borra las copias de más de 10 días;
--   · tarea programada «glacial-respaldo-documentos» cada 12 horas (00:00 y 12:00 UTC).
-- Tamaño: ~3,3 MB por copia completa; con cambios continuos el máximo son ~20 copias = ~66 MB. Se toma solo si hubo cambios.
-- Recuperar: la copia se puede leer con SQL (select … from glacial_fs.respaldo_docs where coleccion='sync' and doc='paletas' order by tomado_en desc);
--   volver a cargarla en producción se hace con ayuda y a pedido del dueño (no hay botón automático a propósito).
-- Se puede ejecutar más de una vez. Orden: PRUEBAS primero, PRODUCCION después (solo cuando el dueño diga «Aplica en producción»).

create table if not exists glacial_fs.respaldo_docs (
  id         bigserial primary key,
  tomado_en  timestamptz not null default now(),
  coleccion  text not null,
  doc        text not null,
  version    bigint not null,
  datos      jsonb not null,
  conteos    jsonb,
  partes     jsonb not null default '{}'::jsonb      -- { campo: [ {id, pos, datos}, … ] }
);
create index if not exists respaldo_docs_doc_idx on glacial_fs.respaldo_docs (coleccion, doc, tomado_en desc);
alter table glacial_fs.respaldo_docs enable row level security;
revoke all on glacial_fs.respaldo_docs from public, anon, authenticated;

create or replace function glacial_fs.respaldo_tomar()
returns integer language plpgsql security definer set search_path = ''
as $f$
declare r record; v_ult bigint; n integer := 0; v_partes jsonb;
begin
  for r in select f.coleccion, f.id, f.datos, f.partes, f.conteos, f.version
             from public.fs_docs f
            where f.coleccion = 'sync' and f.id in ('paletas','tareos','programaciones','perfiles','users','workers') and f.eliminado_en is null loop
    select max(b.version) into v_ult from glacial_fs.respaldo_docs b where b.coleccion = r.coleccion and b.doc = r.id;
    if v_ult is not null and v_ult >= r.version then continue; end if;
    select coalesce(jsonb_object_agg(x.campo, x.items), '{}'::jsonb) into v_partes from (
      select i.campo, jsonb_agg(jsonb_build_object('id', i.id, 'pos', i.pos, 'datos', i.datos) order by i.pos, i.id) items
        from public.fs_items i
       where i.coleccion = r.coleccion and i.doc = r.id and i.eliminado_en is null
       group by i.campo) x;
    insert into glacial_fs.respaldo_docs (coleccion, doc, version, datos, conteos, partes) values (r.coleccion, r.id, r.version, r.datos, r.conteos, v_partes);
    n := n + 1;
  end loop;
  delete from glacial_fs.respaldo_docs where tomado_en < now() - interval '10 days';
  return n;
end $f$;
revoke all on function glacial_fs.respaldo_tomar() from public, anon, authenticated;

do $c$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('glacial-respaldo-documentos', '0 */12 * * *', 'select glacial_fs.respaldo_tomar()');
  else
    raise notice 'pg_cron no está instalado: la copia no se programó (se puede llamar a mano: select glacial_fs.respaldo_tomar())';
  end if;
end $c$;
