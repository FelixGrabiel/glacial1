-- Prueba de glacial_69 (cierre progresivo de marcas y cierre de turno consolidado). Se ejecuta en PRUEBAS con la migración aplicada.
-- Todo ocurre dentro de una transacción que termina en ROLLBACK: no deja datos. Debe terminar con «OK glacial_69: N comprobaciones».
-- Usa como sesión el primer perfil «Administrador» de sync/perfiles (no hay uids escritos aquí).
begin;
do $t$
declare
  uid text; ok integer := 0; r jsonb; e text;
  sec jsonb := '[{"tramo_id":"tr_a","marca":"Scala","presentacion":"7 Litros"},{"tramo_id":"tr_b","marca":"Cuisine","presentacion":"7 Litros"},{"tramo_id":"tr_c","marca":"Scala","presentacion":"7 Litros"}]';
  base jsonb := '{"linea":"B7L","fecha":"2099-01-15","turno":"NOCHE"}';
  procedure_ok text;
begin
  select v.key into uid from public.fs_docs d, jsonb_each(d.datos->'map') v
   where d.coleccion = 'sync' and d.id = 'perfiles' and d.eliminado_en is null and v.value->>'rol' = 'Administrador' limit 1;
  if uid is null then raise exception 'no hay un perfil Administrador para la prueba'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);

  -- 1) reglas puras
  if glacial_fs.cierre_turno_error(base) is null then ok := ok + 1; else raise exception '1 base válida'; end if;
  if glacial_fs.cierre_turno_error(base || '{"saldo_paquetes":-1}') like 'saldo%' then ok := ok + 1; else raise exception '2 saldo negativo'; end if;
  if glacial_fs.cierre_turno_error(base || '{"paletas_acumuladas":2.5}') like 'paletas%' then ok := ok + 1; else raise exception '3 paletas decimales'; end if;
  if glacial_fs.cierre_turno_error(base || '{"hora_corte":"25:00"}') like 'hora%' then ok := ok + 1; else raise exception '4 hora'; end if;
  if glacial_fs.cierre_turno_error(base || jsonb_build_object('secuencia', sec || '[{"tramo_id":"tr_a","marca":"X","presentacion":"Y"}]'::jsonb)) like '%repetido%' then ok := ok + 1; else raise exception '5 tramo repetido'; end if;

  -- 2) cerrar en orden: el 2.º sin cerrar el 1.º → error
  begin
    perform public.cierre_tramo_cerrar(base || jsonb_build_object('secuencia', sec, 'tramo_id', 'tr_b', 'hora_corte', '02:00', 'paletas_acumuladas', 4, 'saldo_paquetes', 0, 'client_event_id', gen_random_uuid()));
    raise exception '6 debía exigir el orden';
  exception when sqlstate '23514' then ok := ok + 1; end;

  -- 3) cerrar el 1.º (Scala hasta las 02:00 del día siguiente: turno noche)
  r := public.cierre_tramo_cerrar(base || jsonb_build_object('secuencia', sec, 'tramo_id', 'tr_a', 'hora_corte', '02:00', 'paletas_acumuladas', 7, 'paletas_tramo', 7, 'saldo_paquetes', 12,
        'client_event_id', 'aaaaaaaa-0000-4000-8000-000000000001'));
  if r->>'estado' = 'cerrado' and (r->>'orden')::int = 1 and (r->>'saldo_paquetes')::int = 12 and (r->>'cerrado_en')::timestamptz = '2099-01-16 02:00:00-05'::timestamptz then ok := ok + 1; else raise exception '7 cierre del 1.º: %', r; end if;
  -- reintento del MISMO evento: devuelve la misma fila
  r := public.cierre_tramo_cerrar(base || jsonb_build_object('secuencia', sec, 'tramo_id', 'tr_a', 'hora_corte', '02:00', 'paletas_acumuladas', 7, 'saldo_paquetes', 12,
        'client_event_id', 'aaaaaaaa-0000-4000-8000-000000000001'));
  if (select count(*) from public.cierre_tramos where linea = 'B7L' and fecha = '2099-01-15') = 1 then ok := ok + 1; else raise exception '8 idempotencia'; end if;
  -- otro evento sobre el tramo ya cerrado → 23505
  begin
    perform public.cierre_tramo_cerrar(base || jsonb_build_object('secuencia', sec, 'tramo_id', 'tr_a', 'hora_corte', '02:10', 'paletas_acumuladas', 7, 'saldo_paquetes', 0, 'client_event_id', gen_random_uuid()));
    raise exception '9 debía rechazar el doble cierre';
  exception when sqlstate '23505' then ok := ok + 1; end;

  -- 4) hora de corte anterior a la del tramo previo → error
  begin
    perform public.cierre_tramo_cerrar(base || jsonb_build_object('secuencia', sec, 'tramo_id', 'tr_b', 'hora_corte', '23:30', 'paletas_acumuladas', 4, 'saldo_paquetes', 0, 'client_event_id', gen_random_uuid()));
    raise exception '10 debía rechazar la hora anterior';
  exception when sqlstate '23514' then ok := ok + 1; end;
  r := public.cierre_tramo_cerrar(base || jsonb_build_object('secuencia', sec, 'tramo_id', 'tr_b', 'hora_corte', '04:30', 'paletas_acumuladas', 4, 'paletas_tramo', 4, 'saldo_paquetes', 0, 'client_event_id', gen_random_uuid()));
  if r->>'estado' = 'cerrado' and (r->>'orden')::int = 2 then ok := ok + 1; else raise exception '11 cierre del 2.º'; end if;

  -- 5) envío: con registros pendientes en el equipo → error; sin «ultimo» → error
  begin
    perform public.cierre_turno_enviar(base || jsonb_build_object('secuencia', sec, 'client_event_id', gen_random_uuid(), 'pendientes', 2));
    raise exception '12 debía rechazar pendientes';
  exception when sqlstate '23514' then ok := ok + 1; end;
  begin
    perform public.cierre_turno_enviar(base || jsonb_build_object('secuencia', sec, 'client_event_id', gen_random_uuid(), 'pendientes', 0));
    raise exception '13 debía pedir la última marca';
  exception when sqlstate '23514' then ok := ok + 1; end;

  -- 6) envío correcto: cierra la última (Scala retoma: acumulado 10 = 3 en este tramo) y consolida
  r := public.cierre_turno_enviar(base || jsonb_build_object('secuencia', sec, 'client_event_id', 'bbbbbbbb-0000-4000-8000-000000000002', 'pendientes', 0, 'observaciones', 'Bidones 7L no para',
        'ultimo', jsonb_build_object('hora_corte', '07:00', 'paletas_acumuladas', 10, 'paletas_tramo', 3, 'saldo_paquetes', 5)));
  if (r->>'total_paletas')::int = 14 and (r->>'total_saldo')::int = 17 and (r->>'tramos')::int = 3 and jsonb_array_length(r->'resumen') = 3 and r->>'observaciones' = 'Bidones 7L no para' and r->>'sync_estado' = 'sincronizado'
    then ok := ok + 1; else raise exception '14 envío: %', r; end if;
  -- reintento del mismo envío → mismo cierre; otro evento → 23505
  r := public.cierre_turno_enviar(base || jsonb_build_object('secuencia', sec, 'client_event_id', 'bbbbbbbb-0000-4000-8000-000000000002', 'pendientes', 0));
  if (select count(*) from public.cierres_turno where linea = 'B7L' and fecha = '2099-01-15') = 1 then ok := ok + 1; else raise exception '15 reintento del envío'; end if;
  begin
    perform public.cierre_turno_enviar(base || jsonb_build_object('secuencia', sec, 'client_event_id', gen_random_uuid(), 'pendientes', 0));
    raise exception '16 debía rechazar el doble envío';
  exception when sqlstate '23505' then ok := ok + 1; end;
  -- con el turno enviado no se cierran más marcas
  begin
    perform glacial_fs.cierre_tramo_aplicar(base || jsonb_build_object('secuencia', sec || '[{"tramo_id":"tr_d","marca":"Aro","presentacion":"7 Litros"}]'::jsonb, 'tramo_id', 'tr_d', 'hora_corte', '07:00', 'paletas_acumuladas', 1, 'saldo_paquetes', 0, 'client_event_id', gen_random_uuid()), 'x', null);
    raise exception '17 debía bloquear tras el envío';
  exception when sqlstate '23514' then ok := ok + 1; end;

  -- 7) listar
  r := public.cierre_turno_listar('B7L', '2099-01-15', 'NOCHE');
  if jsonb_array_length(r->'tramos') = 3 and r->'cierre'->>'linea' = 'B7L' then ok := ok + 1; else raise exception '18 listar'; end if;

  -- 8) reabrir: solo la última cerrada; el Administrador puede aunque el turno esté enviado (y se anula el envío)
  begin
    perform public.cierre_tramo_reabrir('B7L', '2099-01-15', 'NOCHE', 'tr_a', 'corrección de prueba');
    raise exception '19 debía exigir reabrir la última';
  exception when sqlstate '23514' then ok := ok + 1; end;
  r := public.cierre_tramo_reabrir('B7L', '2099-01-15', 'NOCHE', 'tr_c', 'saldo mal anotado');
  if r->>'estado' = 'abierto' and not exists (select 1 from public.cierres_turno where linea = 'B7L' and fecha = '2099-01-15') then ok := ok + 1; else raise exception '20 reabrir'; end if;

  -- 9) sin sesión → sin permiso
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.cierre_turno_listar('B7L', '2099-01-15', 'NOCHE');
    raise exception '21 sin sesión debía fallar';
  exception when sqlstate '42501' then ok := ok + 1; end;

  raise notice 'OK glacial_69: % comprobaciones', ok;
end $t$;
rollback;
