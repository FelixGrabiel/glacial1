-- Prueba de glacial_74 (apoyo entre equipos). PRUEBAS con glacial_72, 73 y 74 aplicadas; termina en ROLLBACK (no deja datos).
-- Debe terminar con «OK glacial_74: 9 comprobaciones». Sesión: primer perfil «Administrador». Semana de prueba en 2099.
-- Equipos de fábrica: pet-dia y hielo-dia son DÍA 07:00–19:00 (compatibles); b20l-int es 13:00–22:00 (no compatible con pet-dia).
begin;
do $t$
declare uid text; ok integer := 0; r jsonb; s1 text := '2099-11-23';
  cuadro jsonb := '[{"trabajador_id":"wA","nombre":"Operario A","equipo_id":"pet-dia","dia":6,"status":"ASIGNADO","origen":"AUTO"},
                    {"trabajador_id":"wB","nombre":"Operario B","equipo_id":"pet-dia","dia":2,"status":"ASIGNADO","origen":"AUTO"},
                    {"trabajador_id":"wH","nombre":"Operario H","equipo_id":"hielo-dia","dia":1,"status":"ASIGNADO","origen":"AUTO"}]';
begin
  select v2.key into uid from public.fs_docs d, jsonb_each(d.datos->'map') v2 where d.coleccion='sync' and d.id='perfiles' and d.eliminado_en is null and v2.value->>'rol'='Administrador' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  -- 1) el sorteo guarda los apoyos y obtener los devuelve
  perform public.descansos_guardar(jsonb_build_object('semana', s1, 'turno', 'DÍA', 'semilla', 1, 'client_event_id', 'aaaaaaaa-0000-4000-8000-000000000001', 'asignaciones', cuadro,
    'apoyos', '[{"trabajador_id":"wA","nombre":"Operario A","desde_equipo":"pet-dia","a_equipo":"hielo-dia","dia":1,"origen":"AUTO"}]'::jsonb));
  r := public.descansos_obtener(s1::date);
  if jsonb_array_length(r->'apoyos') = 1 and r->'apoyos'->0->>'a_equipo' = 'hielo-dia' and (r->'apoyos'->0->>'dia')::int = 1 and r->'apoyos'->0->>'turno' = 'DÍA' then ok := ok + 1; else raise exception '1 %', r->'apoyos'; end if;
  -- 2) un apoyo entre horarios distintos (PET 07–19 → Bidones 20L 13–22) no se guarda
  begin perform public.descansos_guardar(jsonb_build_object('semana', s1, 'turno', 'DÍA', 'semilla', 2, 'client_event_id', 'aaaaaaaa-0000-4000-8000-000000000002', 'asignaciones', cuadro,
    'apoyos', '[{"trabajador_id":"wA","desde_equipo":"pet-dia","a_equipo":"b20l-int","dia":1}]'::jsonb)); raise exception '2';
  exception when sqlstate '23514' then ok := ok + 1; end;
  -- 3) poner un apoyo a mano (MANUAL, auditado)
  r := public.descansos_apoyo_cambiar(jsonb_build_object('semana', s1, 'turno', 'DÍA', 'accion', 'poner', 'trabajador_id', 'wB', 'nombre', 'Operario B', 'dia', 3, 'desde_equipo', 'pet-dia', 'a_equipo', 'hielo-dia', 'client_event_id', 'aaaaaaaa-0000-4000-8000-000000000003'));
  if r->'apoyo'->>'origen' = 'MANUAL' and exists (select 1 from public.descansos_historial where semana_inicio = s1::date and accion = 'apoyo_poner' and trabajador_id = 'wB') then ok := ok + 1; else raise exception '3 %', r; end if;
  -- 4) reintento del mismo evento: no duplica
  perform public.descansos_apoyo_cambiar(jsonb_build_object('semana', s1, 'turno', 'DÍA', 'accion', 'poner', 'trabajador_id', 'wB', 'dia', 3, 'desde_equipo', 'pet-dia', 'a_equipo', 'hielo-dia', 'client_event_id', 'aaaaaaaa-0000-4000-8000-000000000003'));
  if (select count(*) from public.descansos_historial where semana_inicio = s1::date and accion = 'apoyo_poner') = 1 then ok := ok + 1; else raise exception '4'; end if;
  -- 5) no apoya el día que descansa
  begin perform public.descansos_apoyo_cambiar(jsonb_build_object('semana', s1, 'turno', 'DÍA', 'accion', 'poner', 'trabajador_id', 'wB', 'dia', 2, 'desde_equipo', 'pet-dia', 'a_equipo', 'hielo-dia', 'client_event_id', 'aaaaaaaa-0000-4000-8000-000000000004')); raise exception '5';
  exception when sqlstate '23514' then ok := ok + 1; end;
  -- 6) el equipo de origen tiene que ser el suyo
  begin perform public.descansos_apoyo_cambiar(jsonb_build_object('semana', s1, 'turno', 'DÍA', 'accion', 'poner', 'trabajador_id', 'wH', 'dia', 4, 'desde_equipo', 'pet-dia', 'a_equipo', 'hielo-dia', 'client_event_id', 'aaaaaaaa-0000-4000-8000-000000000005')); raise exception '6';
  exception when sqlstate 'P0002' then ok := ok + 1; end;
  -- 7) si a A se le mueve el descanso al día en que apoyaba, ese apoyo se borra
  perform public.descansos_mover(jsonb_build_object('semana', s1, 'turno', 'DÍA', 'trabajador_id', 'wA', 'dia', 1, 'client_event_id', 'aaaaaaaa-0000-4000-8000-000000000006'));
  if not exists (select 1 from public.descansos_apoyo x join public.descansos_semana s on s.id = x.descansos_semana_id where s.semana_inicio = s1::date and x.trabajador_id = 'wA') then ok := ok + 1; else raise exception '7'; end if;
  -- 8) quitar un apoyo
  perform public.descansos_apoyo_cambiar(jsonb_build_object('semana', s1, 'turno', 'DÍA', 'accion', 'quitar', 'trabajador_id', 'wB', 'dia', 3, 'client_event_id', 'aaaaaaaa-0000-4000-8000-000000000007'));
  if (select count(*) from public.descansos_apoyo x join public.descansos_semana s on s.id = x.descansos_semana_id where s.semana_inicio = s1::date) = 0
     and exists (select 1 from public.descansos_historial where semana_inicio = s1::date and accion = 'apoyo_quitar' and antes->>'a_equipo' = 'hielo-dia') then ok := ok + 1; else raise exception '8'; end if;
  -- 9) sin perfil: no cambia apoyos
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000aa', 'role', 'authenticated')::text, true);
  begin perform public.descansos_apoyo_cambiar(jsonb_build_object('semana', s1, 'turno', 'DÍA', 'accion', 'quitar', 'trabajador_id', 'wB', 'dia', 3, 'client_event_id', 'aaaaaaaa-0000-4000-8000-000000000008')); raise exception '9';
  exception when sqlstate '42501' then ok := ok + 1; end;
  raise exception 'OK glacial_74: % comprobaciones', ok;
end $t$;
rollback;
