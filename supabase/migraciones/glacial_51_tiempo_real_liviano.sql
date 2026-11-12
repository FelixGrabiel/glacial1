-- GLACIAL · glacial_51 · TIEMPO REAL MÁS LIVIANO                                             *** APLICADA en PRUEBAS (12/11/2026) · PRODUCCIÓN (12/11/2026) ***
--
-- Por qué (base de PRODUCCIÓN saturada el 12/11/2026, compute Micro):
--   Supabase Realtime lee TODOS los cambios de las tablas de la publicación «supabase_realtime» (consulta de WAL: más del 50 % del
--   tiempo de la base). La página solo escucha fs_docs (un aviso por guardado) y Mantenimiento escucha sus tablas mtto_*.
--   Nadie escucha fs_items (cada elemento de una lista partida: un guardado de una lista grande escribe muchas filas) ni las 32 tablas
--   g_* del modelo antiguo (sin uso en el código). Igual se decodificaban en cada cambio.
--
-- Qué hace: quita fs_items y las tablas g_* de la publicación «supabase_realtime». Quedan fs_docs y mtto_*.
--   · NO borra tablas ni datos: solo dejan de emitir avisos de tiempo real, que nadie recibía.
--   · Se puede ejecutar más de una vez. Para deshacer: alter publication supabase_realtime add table public.<tabla>;
-- Orden: PRUEBAS primero; PRODUCCIÓN con la aprobación del dueño.

do $m$
declare r record; quitadas integer := 0;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'glacial_51: no existe la publicación supabase_realtime; nada que hacer';
    return;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fs_docs') then
    raise exception 'glacial_51: fs_docs no está en la publicación; se detiene sin cambiar nada (revisar antes)';
  end if;
  for r in
    select tablename from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and (tablename = 'fs_items' or tablename like 'g\_%')
     order by tablename
  loop
    execute format('alter publication supabase_realtime drop table public.%I', r.tablename);
    quitadas := quitadas + 1;
  end loop;
  raise notice 'glacial_51: % tablas quitadas del tiempo real', quitadas;
end $m$;

-- Comprobación: debe listar solo fs_docs y las tablas mtto_*.
select string_agg(tablename, ', ' order by tablename) as tablas_con_tiempo_real
  from pg_publication_tables where pubname = 'supabase_realtime';
