-- Prueba de glacial_73 (descansos automáticos). PRUEBAS con glacial_72 y glacial_73 aplicadas; termina en ROLLBACK (no deja datos).
-- Debe terminar con «OK glacial_73: 14 comprobaciones». Sesión: primer perfil «Administrador». Semanas de prueba en 2099 (no chocan con datos reales).
begin;
do $t$
declare uid text; ok integer := 0; r jsonb; s1 text := '2099-11-23'; s2 text := '2099-11-30'; v integer;
  cuadro jsonb := '[{"trabajador_id":"wA","nombre":"Operario A","equipo_id":"pet-dia","dia":6,"status":"ASIGNADO","origen":"AUTO"},
                    {"trabajador_id":"wB","nombre":"Operario B","equipo_id":"pet-dia","dia":2,"status":"VIENE_NOCHE","origen":"AUTO"},
                    {"trabajador_id":"wC","nombre":"Operario C","dia":null,"status":"MEDICO","origen":"EXCLUIDO","bloque":"DESCANSO_MEDICO","hasta_fecha":"2099-11-24","motivo":"Descanso médico hasta 24/11"}]';
begin
  select v2.key into uid from public.fs_docs d, jsonb_each(d.datos->'map') v2 where d.coleccion='sync' and d.id='perfiles' and d.eliminado_en is null and v2.value->>'rol'='Administrador' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  -- 1) lectura: config por defecto y mínimos de prueba en los equipos
  r := public.descansos_obtener(s1::date);
  if (r->'config'->>'semanas_historial')::int = 8 and not (r->'config'->>'medico_parcial')::boolean and jsonb_array_length(r->'semanas') = 0
     and exists (select 1 from jsonb_array_elements(r->'equipos') e where e->>'id' = 'pet-dia' and e->>'minimo_descanso' is not null) then ok := ok + 1; else raise exception '1 %', r; end if;
  -- 2) guardar la propuesta del sorteo
  r := public.descansos_guardar(jsonb_build_object('semana', s1, 'turno', 'DÍA', 'semilla', 4821, 'client_event_id', 'dddddddd-0000-4000-8000-000000000001', 'asignaciones', cuadro));
  if r->>'estado' = 'PROPUESTA' and (r->>'semilla')::int = 4821 and (select count(*) from public.descansos_asignacion a join public.descansos_semana s on s.id = a.descansos_semana_id where s.semana_inicio = s1::date) = 3 then ok := ok + 1; else raise exception '2 %', r; end if;
  -- 3) idempotencia: el mismo evento no duplica ni vuelve a anotar el historial
  r := public.descansos_guardar(jsonb_build_object('semana', s1, 'turno', 'DÍA', 'semilla', 1, 'client_event_id', 'dddddddd-0000-4000-8000-000000000001', 'asignaciones', cuadro));
  if (r->>'semilla')::int = 4821 and (select count(*) from public.descansos_historial where semana_inicio = s1::date and accion = 'sortear') = 1 then ok := ok + 1; else raise exception '3 %', r; end if;
  -- 4) cambio a mano: la X de A pasa al jueves, queda MANUAL con quién y auditado (antes → después)
  r := public.descansos_mover(jsonb_build_object('semana', s1, 'turno', 'DÍA', 'trabajador_id', 'wA', 'dia', 3, 'client_event_id', 'dddddddd-0000-4000-8000-000000000002'));
  if (r->'asignacion'->>'dia')::int = 3 and r->'asignacion'->>'status' = 'MANUAL' and r->'asignacion'->>'actualizado_por' is not null
     and exists (select 1 from public.descansos_historial where semana_inicio = s1::date and accion = 'mover' and (antes->>'dia')::int = 6 and (despues->>'dia')::int = 3) then ok := ok + 1; else raise exception '4 %', r; end if;
  -- 5) reintento del mismo cambio: no vuelve a anotar
  perform public.descansos_mover(jsonb_build_object('semana', s1, 'turno', 'DÍA', 'trabajador_id', 'wA', 'dia', 3, 'client_event_id', 'dddddddd-0000-4000-8000-000000000002'));
  if (select count(*) from public.descansos_historial where semana_inicio = s1::date and accion = 'mover') = 1 then ok := ok + 1; else raise exception '5'; end if;
  -- 6) mover a alguien que no está en el cuadro
  begin perform public.descansos_mover(jsonb_build_object('semana', s1, 'turno', 'DÍA', 'trabajador_id', 'nadie', 'dia', 1, 'client_event_id', 'dddddddd-0000-4000-8000-000000000003')); raise exception '6';
  exception when sqlstate 'P0002' then ok := ok + 1; end;
  -- 7) publicar
  r := public.descansos_estado(jsonb_build_object('semana', s1, 'turno', 'DÍA', 'estado', 'PUBLICADA'));
  if r->>'estado' = 'PUBLICADA' and r->>'publicado_por' is not null then ok := ok + 1; else raise exception '7 %', r; end if;
  -- 8) la semana siguiente trae la publicada como historial (equidad)
  r := public.descansos_obtener(s2::date);
  if jsonb_array_length(r->'historial') = 1 and exists (select 1 from jsonb_array_elements(r->'historial'->0->'asignaciones') a where a->>'trabajador_id' = 'wA' and (a->>'dia')::int = 3) then ok := ok + 1; else raise exception '8 %', r; end if;
  -- 9) volver a sortear con una versión vieja (otro equipo cambió mientras tanto) se rechaza
  begin perform public.descansos_guardar(jsonb_build_object('semana', s1, 'turno', 'DÍA', 'version', 1, 'semilla', 7, 'client_event_id', 'dddddddd-0000-4000-8000-000000000004', 'asignaciones', cuadro)); raise exception '9';
  exception when sqlstate '40001' then ok := ok + 1; end;
  -- 10) volver a sortear con la versión al día: reemplaza y vuelve a PROPUESTA
  select version into v from public.descansos_semana where semana_inicio = s1::date and turno = 'DÍA';
  r := public.descansos_guardar(jsonb_build_object('semana', s1, 'turno', 'DÍA', 'version', v, 'semilla', 7, 'client_event_id', 'dddddddd-0000-4000-8000-000000000005', 'asignaciones', cuadro));
  if r->>'estado' = 'PROPUESTA' and (r->>'semilla')::int = 7 and r->>'publicado_por' is null
     and (select dia from public.descansos_asignacion a join public.descansos_semana s on s.id = a.descansos_semana_id where s.semana_inicio = s1::date and a.trabajador_id = 'wA') = 6 then ok := ok + 1; else raise exception '10 %', r; end if;
  -- 11) mínimos por día y días sin operar (jefe); un día 7 no vale
  r := public.equipo_descanso_guardar(jsonb_build_object('id', 'b20l-int', 'minimo_descanso', 2, 'minimo_por_dia', jsonb_build_array(2,2,2,2,2,2,0), 'dias_sin_operar', jsonb_build_array(6)));
  if (r->>'minimo_descanso')::int = 2 and jsonb_array_length(r->'minimo_por_dia') = 7 and r->'dias_sin_operar' = '[6]'::jsonb then ok := ok + 1; else raise exception '11 %', r; end if;
  begin perform public.equipo_descanso_guardar(jsonb_build_object('id', 'b20l-int', 'dias_sin_operar', jsonb_build_array(7))); raise exception '11b';
  exception when sqlstate '23514' then null; end;
  -- 12) configuración: 30 semanas no vale; 4 sí
  begin perform public.descansos_config_guardar(jsonb_build_object('semanas_historial', 30)); raise exception '12';
  exception when sqlstate '23514' then null; end;
  r := public.descansos_config_guardar(jsonb_build_object('semanas_historial', 4, 'medico_parcial', true));
  if (r->>'semanas_historial')::int = 4 and (r->>'medico_parcial')::boolean then ok := ok + 1; else raise exception '12 %', r; end if;
  -- 13) publicar un turno sin descansos generados
  begin perform public.descansos_estado(jsonb_build_object('semana', s2, 'turno', 'NOCHE', 'estado', 'PUBLICADA')); raise exception '13';
  exception when sqlstate 'P0002' then ok := ok + 1; end;
  -- 14) sin perfil: no ve ni escribe
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000aa', 'role', 'authenticated')::text, true);
  begin perform public.descansos_obtener(s1::date); raise exception '14';
  exception when sqlstate '42501' then ok := ok + 1; end;
  raise exception 'OK glacial_73: % comprobaciones', ok;
end $t$;
rollback;
