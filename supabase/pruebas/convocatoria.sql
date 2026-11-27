-- Prueba de glacial_72 (convocatoria semanal). PRUEBAS con la migración aplicada; termina en ROLLBACK (no deja datos).
-- Debe terminar con «OK glacial_72: 12 comprobaciones». Sesión: primer perfil «Administrador». Semana de prueba 2099 (no choca con datos reales).
begin;
do $t$
declare uid text; ok integer := 0; r jsonb; s1 text := '2099-11-23'; s0 text := '2099-11-16'; idw bigint; v integer;
begin
  select v2.key into uid from public.fs_docs d, jsonb_each(d.datos->'map') v2 where d.coleccion='sync' and d.id='perfiles' and d.eliminado_en is null and v2.value->>'rol'='Administrador' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  -- 1) permisos del Administrador
  r := glacial_fs.conv_cap();
  if (r->>'ver')::boolean and (r->>'editar')::boolean and (r->>'jefe')::boolean then ok := ok + 1; else raise exception '1 %', r; end if;
  -- 2) poner crea la convocatoria en BORRADOR y la asignación
  r := public.convocatoria_asignar(jsonb_build_object('semana', s0, 'accion', 'poner', 'client_event_id', 'eeeeeeee-0000-4000-8000-000000000001', 'trabajador_id', 'wA', 'nombre', 'Operario A', 'equipo_id', 'b7l-noche'));
  if r->'convocatoria'->>'estado' = 'BORRADOR' and r->'asignacion'->>'columna' = 'NOCHE' then ok := ok + 1; else raise exception '2 %', r; end if;
  -- 3) idempotencia: el mismo evento devuelve lo mismo y no duplica
  r := public.convocatoria_asignar(jsonb_build_object('semana', s0, 'accion', 'poner', 'client_event_id', 'eeeeeeee-0000-4000-8000-000000000001', 'trabajador_id', 'wA', 'equipo_id', 'b7l-noche'));
  if (select count(*) from public.convocatoria_asignaciones x join public.convocatorias c on c.id = x.convocatoria_id where c.semana_inicio = s0::date) = 1
     and (select count(*) from public.convocatoria_historial where semana_inicio = s0::date and accion = 'poner') = 1 then ok := ok + 1; else raise exception '3'; end if;
  perform public.convocatoria_asignar(jsonb_build_object('semana', s0, 'accion', 'poner', 'client_event_id', 'eeeeeeee-0000-4000-8000-000000000002', 'trabajador_id', 'wB', 'equipo_id', 'pet-dia'));
  perform public.convocatoria_asignar(jsonb_build_object('semana', s0, 'accion', 'poner', 'client_event_id', 'eeeeeeee-0000-4000-8000-000000000003', 'trabajador_id', 'wC', 'bloque', 'DESCANSO_MEDICO', 'hasta_fecha', '2099-11-30'));
  -- 4) copiar la semana anterior a una vacía: 3 personas (el descanso sigue vigente)
  r := public.convocatoria_copiar(jsonb_build_object('semana', s1));
  if (r->>'n')::int = 3 then ok := ok + 1; else raise exception '4 %', r; end if;
  -- 5) copiar otra vez se rechaza (ya tiene personas)
  begin perform public.convocatoria_copiar(jsonb_build_object('semana', s1)); raise exception '5';
  exception when sqlstate '23514' then ok := ok + 1; end;
  -- 6) mover a A de noche al día (⇄ lo calcula la pantalla comparando con la semana anterior)
  select x.id into idw from public.convocatoria_asignaciones x join public.convocatorias c on c.id = x.convocatoria_id where c.semana_inicio = s1::date and x.trabajador_id = 'wA';
  r := public.convocatoria_asignar(jsonb_build_object('semana', s1, 'accion', 'mover', 'client_event_id', 'eeeeeeee-0000-4000-8000-000000000004', 'id', idw, 'equipo_id', 'b7l-dia'));
  if r->'asignacion'->>'columna' = 'DÍA' and r->'asignacion'->>'equipo_id' = 'b7l-dia' then ok := ok + 1; else raise exception '6 %', r; end if;
  -- 7) mover algo que ya no existe (otro supervisor lo quitó): error claro
  begin perform public.convocatoria_asignar(jsonb_build_object('semana', s1, 'accion', 'mover', 'client_event_id', 'eeeeeeee-0000-4000-8000-000000000005', 'id', -1, 'equipo_id', 'pet-dia')); raise exception '7';
  exception when sqlstate 'P0002' then ok := ok + 1; end;
  -- 8) obtener: asignaciones, la semana anterior, equipos y permisos
  r := public.convocatoria_obtener(s1::date);
  if jsonb_array_length(r->'asignaciones') = 3 and jsonb_array_length(r->'anterior'->'asignaciones') = 3 and jsonb_array_length(r->'equipos') >= 8 and (r->'permisos'->>'editar')::boolean then ok := ok + 1; else raise exception '8 %', r; end if;
  -- 9) publicar: estado, quién y versión que sube
  v := (r->'convocatoria'->>'version')::int;
  r := public.convocatoria_estado(jsonb_build_object('semana', s1, 'estado', 'PUBLICADA'));
  if r->>'estado' = 'PUBLICADA' and r->>'publicada_en' is not null and (r->>'version')::int > v then ok := ok + 1; else raise exception '9 %', r; end if;
  -- 10) publicada se puede corregir y queda en el historial (antes → después)
  r := public.convocatoria_asignar(jsonb_build_object('semana', s1, 'accion', 'quitar', 'client_event_id', 'eeeeeeee-0000-4000-8000-000000000006', 'id', idw));
  if (select count(*) from public.convocatoria_historial where semana_inicio = s1::date and accion = 'quitar' and antes->>'trabajador_id' = 'wA') = 1 then ok := ok + 1; else raise exception '10'; end if;
  -- 11) un lunes de verdad: otra fecha se rechaza
  begin perform public.convocatoria_asignar(jsonb_build_object('semana', '2099-11-25', 'accion', 'poner', 'client_event_id', 'eeeeeeee-0000-4000-8000-000000000007', 'trabajador_id', 'wD', 'equipo_id', 'pet-dia')); raise exception '11';
  exception when sqlstate '23514' then ok := ok + 1; end;
  -- 12) sin sesión: no ve ni escribe
  perform set_config('request.jwt.claims', '{}', true);
  begin perform public.convocatoria_obtener(s1::date); raise exception '12';
  exception when sqlstate '42501' then ok := ok + 1; end;
  raise notice 'OK glacial_72: % comprobaciones', ok;
end $t$;
rollback;
