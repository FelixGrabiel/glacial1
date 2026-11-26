-- Prueba de glacial_70 (paradas por marca). Se ejecuta en PRUEBAS con glacial_69 y glacial_70 aplicadas.
-- Transacción con ROLLBACK: no deja datos. Debe terminar con «OK glacial_70: N comprobaciones». Sesión: primer perfil «Administrador».
-- Datos: PET1 · 2099-11-26 · DÍA · SCALA 625 → BELLS 2.5 L → SCALA 625 (los del pedido).
begin;
do $t$
declare
  uid text; ok integer := 0; r jsonb; ev uuid := 'cccccccc-0000-4000-8000-000000000001';
  sec jsonb := '[{"tramo_id":"t1","marca":"SCALA","presentacion":"625 ml"},{"tramo_id":"t2","marca":"BELLS","presentacion":"2.5 L"},{"tramo_id":"t3","marca":"SCALA","presentacion":"625 ml"}]';
  base jsonb := '{"linea":"PET1","fecha":"2099-11-26","turno":"DÍA"}';
begin
  select v.key into uid from public.fs_docs d, jsonb_each(d.datos->'map') v
   where d.coleccion = 'sync' and d.id = 'perfiles' and d.eliminado_en is null and v.value->>'rol' = 'Administrador' limit 1;
  if uid is null then raise exception 'no hay un perfil Administrador para la prueba'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);

  -- 1) reglas puras
  if glacial_fs.parada_tramo_error(base || '{"parada_id":"a","tipo":"PROGRAMADA","minutos":10,"asignacion":"AUTO","tramo_id":"t1","client_event_id":"cccccccc-0000-4000-8000-000000000009"}') is null then ok := ok + 1; else raise exception '1'; end if;
  if glacial_fs.parada_tramo_error(base || '{"parada_id":"a","tipo":"PROGRAMADA","minutos":10,"asignacion":"MANUAL","client_event_id":"cccccccc-0000-4000-8000-000000000009"}') like 'falta la marca%' then ok := ok + 1; else raise exception '2 sin tramo'; end if;
  if glacial_fs.parada_tramo_error(base || '{"parada_id":"a","tipo":"X","minutos":10,"asignacion":"AUTO","tramo_id":"t1","client_event_id":"cccccccc-0000-4000-8000-000000000009"}') like 'tipo%' then ok := ok + 1; else raise exception '3 tipo'; end if;

  -- 2) cerrar una marca sin «Revisé las paradas» → error
  begin
    perform public.cierre_tramo_cerrar(base || jsonb_build_object('secuencia', sec, 'tramo_id', 't1', 'hora_corte', '10:40', 'paletas_acumuladas', 14, 'saldo_paquetes', 20, 'client_event_id', gen_random_uuid()));
    raise exception '4 debía exigir la revisión';
  exception when sqlstate '23514' then ok := ok + 1; end;
  -- con la revisión y el resumen: SCALA 220 min, 28 min de paradas, 3.2 h, 16 800 und → 5 250 und/h
  r := public.cierre_tramo_cerrar(base || jsonb_build_object('secuencia', sec, 'tramo_id', 't1', 'hora_corte', '10:40', 'paletas_acumuladas', 14, 'paletas_tramo', 14, 'saldo_paquetes', 20,
        'paradas_revisadas', true, 'client_event_id', gen_random_uuid(),
        'resumen', jsonb_build_object('minutos', 220, 'prog', 10, 'noprog', 18, 'cambio', 0, 'n', 2, 'produccion', 16800, 'horas', 3.2, 'ratio', 5250)));
  if (r->>'ratio')::numeric = 5250 and (r->>'paradas_noprog_min')::int = 18 and (r->>'paradas_revisadas')::boolean then ok := ok + 1; else raise exception '5 resumen: %', r; end if;

  -- 3) asignar: AUTO a BELLS (en curso), idempotente por evento; dos equipos con la misma parada → una sola fila
  r := public.parada_tramo_asignar(base || jsonb_build_object('parada_id', 'avp_1', 'tramo_id', 't2', 'marca', 'BELLS', 'presentacion', '2.5 L', 'descripcion', 'Atasco etiquetadora',
        'minutos', 12, 'tipo', 'NO_PROGRAMADA', 'asignacion', 'AUTO', 'hora_inicio', '11:50', 'client_event_id', ev));
  r := public.parada_tramo_asignar(base || jsonb_build_object('parada_id', 'avp_1', 'tramo_id', 't2', 'minutos', 12, 'tipo', 'NO_PROGRAMADA', 'asignacion', 'AUTO', 'client_event_id', ev));
  r := public.parada_tramo_asignar(base || jsonb_build_object('parada_id', 'avp_1', 'tramo_id', 't2', 'minutos', 12, 'tipo', 'NO_PROGRAMADA', 'asignacion', 'AUTO', 'client_event_id', gen_random_uuid()));
  if (select count(*) from public.paradas_tramo where linea = 'PET1' and fecha = '2099-11-26' and parada_id = 'avp_1') = 1 then ok := ok + 1; else raise exception '6 una sola parada'; end if;

  -- 4) parada olvidada en SCALA ya cerrada: queda tras_cierre y se recalcula el resumen con constancia
  r := public.parada_tramo_asignar(base || jsonb_build_object('parada_id', 'avp_2', 'tramo_id', 't1', 'minutos', 5, 'tipo', 'NO_PROGRAMADA', 'asignacion', 'MANUAL', 'client_event_id', gen_random_uuid(),
        'resumen', jsonb_build_object('prog', 10, 'noprog', 23, 'n', 3, 'horas', 3.12, 'ratio', 5385)));
  if (r->>'tras_cierre')::boolean and (select paradas_noprog_min = 23 and paradas_recalculadas_en is not null from public.cierre_tramos where linea = 'PET1' and fecha = '2099-11-26' and tramo_id = 't1')
    then ok := ok + 1; else raise exception '7 tras cierre: %', r; end if;

  -- 5) partir 10:30–10:50 (20 min) → SCALA 10 + BELLS 10; partes que no suman → error; reintento → mismas partes
  begin
    perform public.parada_tramo_partir(base || jsonb_build_object('parada_id', 'avp_3', 'tipo', 'NO_PROGRAMADA', 'minutos', 20, 'client_event_id', gen_random_uuid(),
      'partes', '[{"tramo_id":"t1","minutos":10},{"tramo_id":"t2","minutos":9}]'::jsonb));
    raise exception '8 debía exigir la suma';
  exception when sqlstate '23514' then ok := ok + 1; end;
  r := public.parada_tramo_partir(base || jsonb_build_object('parada_id', 'avp_3', 'descripcion', 'Corte de energía', 'tipo', 'NO_PROGRAMADA', 'minutos', 20, 'client_event_id', 'cccccccc-0000-4000-8000-000000000003',
        'partes', '[{"tramo_id":"t1","minutos":10,"hora_inicio":"10:30"},{"tramo_id":"t2","minutos":10,"hora_inicio":"10:40"}]'::jsonb));
  if jsonb_array_length(r) = 2 and (r->0->>'minutos')::int + (r->1->>'minutos')::int = 20 and r->0->>'parada_padre_id' = 'avp_3' and (r->0->>'tras_cierre')::boolean then ok := ok + 1; else raise exception '9 partir: %', r; end if;
  r := public.parada_tramo_partir(base || jsonb_build_object('parada_id', 'avp_3', 'tipo', 'NO_PROGRAMADA', 'minutos', 20, 'client_event_id', 'cccccccc-0000-4000-8000-000000000003',
        'partes', '[{"tramo_id":"t1","minutos":10},{"tramo_id":"t2","minutos":10}]'::jsonb));
  if jsonb_array_length(r) = 2 and (select count(*) from public.paradas_tramo where linea = 'PET1' and fecha = '2099-11-26' and parada_padre_id = 'avp_3') = 2 then ok := ok + 1; else raise exception '10 reintento partir'; end if;

  -- 6) «Falta de preformas» 8 min sin hora → PENDIENTE: el envío se bloquea (servidor) y también con lo que informa la pantalla
  r := public.parada_tramo_asignar(base || jsonb_build_object('parada_id', 'avp_4', 'descripcion', 'Falta de preformas', 'minutos', 8, 'tipo', 'NO_PROGRAMADA', 'asignacion', 'PENDIENTE', 'client_event_id', gen_random_uuid()));
  r := public.cierre_tramo_cerrar(base || jsonb_build_object('secuencia', sec, 'tramo_id', 't2', 'hora_corte', '13:10', 'paletas_acumuladas', 6, 'paletas_tramo', 6, 'saldo_paquetes', 15,
        'paradas_revisadas', true, 'client_event_id', gen_random_uuid(), 'resumen', jsonb_build_object('minutos', 150, 'prog', 65, 'noprog', 12, 'cambio', 35, 'n', 3, 'produccion', 2880, 'horas', 1.22, 'ratio', 2367)));
  begin
    perform public.cierre_turno_enviar(base || jsonb_build_object('secuencia', sec, 'client_event_id', gen_random_uuid(), 'pendientes', 0, 'paradas_pendientes', 0,
      'ultimo', jsonb_build_object('hora_corte', '15:00', 'paletas_acumuladas', 16, 'paletas_tramo', 2, 'saldo_paquetes', 0, 'paradas_revisadas', true)));
    raise exception '11 debía bloquear por la parada pendiente del servidor';
  exception when sqlstate '23514' then ok := ok + 1; end;
  r := public.parada_tramo_asignar(base || jsonb_build_object('parada_id', 'avp_4', 'tramo_id', 't2', 'minutos', 8, 'tipo', 'NO_PROGRAMADA', 'asignacion', 'MANUAL', 'client_event_id', gen_random_uuid()));
  begin
    perform public.cierre_turno_enviar(base || jsonb_build_object('secuencia', sec, 'client_event_id', gen_random_uuid(), 'pendientes', 0, 'paradas_pendientes', 1,
      'ultimo', jsonb_build_object('hora_corte', '15:00', 'paletas_acumuladas', 16, 'paletas_tramo', 2, 'saldo_paquetes', 0, 'paradas_revisadas', true)));
    raise exception '12 debía bloquear por la parada pendiente de la pantalla';
  exception when sqlstate '23514' then ok := ok + 1; end;
  -- la última marca sin revisión → error
  begin
    perform public.cierre_turno_enviar(base || jsonb_build_object('secuencia', sec, 'client_event_id', gen_random_uuid(), 'pendientes', 0, 'paradas_pendientes', 0,
      'ultimo', jsonb_build_object('hora_corte', '15:00', 'paletas_acumuladas', 16, 'paletas_tramo', 2, 'saldo_paquetes', 0)));
    raise exception '13 la última también exige la revisión';
  exception when sqlstate '23514' then ok := ok + 1; end;
  r := public.cierre_turno_enviar(base || jsonb_build_object('secuencia', sec, 'client_event_id', gen_random_uuid(), 'pendientes', 0, 'paradas_pendientes', 0,
        'ultimo', jsonb_build_object('hora_corte', '15:00', 'paletas_acumuladas', 16, 'paletas_tramo', 2, 'saldo_paquetes', 0, 'paradas_revisadas', true,
                  'resumen', jsonb_build_object('minutos', 110, 'prog', 25, 'noprog', 8, 'cambio', 25, 'n', 2, 'produccion', 2400, 'horas', 1.28, 'ratio', 1870))));
  if (r->>'tramos')::int = 3 and (r->'resumen'->0->>'ratio')::numeric = 5385 and (r->'resumen'->1->>'produccion')::int = 2880 then ok := ok + 1; else raise exception '14 envío: %', r; end if;

  -- 7) turno enviado: el Administrador sí puede corregir; listar devuelve las paradas activas
  r := public.parada_tramo_asignar(base || jsonb_build_object('parada_id', 'avp_5', 'tramo_id', 't3', 'minutos', 3, 'tipo', 'PROGRAMADA', 'asignacion', 'MANUAL', 'client_event_id', gen_random_uuid()));
  r := public.paradas_tramo_listar('PET1', '2099-11-26', 'DÍA');
  if jsonb_array_length(r) = 6 then ok := ok + 1; else raise exception '15 listar: %', jsonb_array_length(r); end if;

  -- 8) tiempo real: las 3 tablas en la publicación y con política de lectura
  if (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('cierre_tramos','cierres_turno','paradas_tramo')) = 3
     and (select count(*) from pg_policies where schemaname = 'public' and tablename in ('cierre_tramos','cierres_turno','paradas_tramo') and policyname = 'lectura' and cmd = 'SELECT') = 3
    then ok := ok + 1; else raise exception '16 tiempo real'; end if;

  -- 9) sin sesión → sin permiso
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.paradas_tramo_listar('PET1', '2099-11-26', 'DÍA');
    raise exception '17 sin sesión debía fallar';
  exception when sqlstate '42501' then ok := ok + 1; end;

  raise notice 'OK glacial_70: % comprobaciones', ok;
end $t$;
rollback;
