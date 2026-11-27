-- Prueba de glacial_71 (correcciones guardadas en los Excel de reportes). PRUEBAS con la migración aplicada; termina en ROLLBACK (no deja datos).
-- Debe terminar con «OK glacial_71: 9 comprobaciones». Sesión: primer perfil «Administrador».
begin;
do $t$
declare uid text; ok integer := 0; r jsonb; base jsonb := '{"reporte":"Reporte-diario-Hielo-2099-11-26-dia","hoja":"Reporte","celda":"B12"}';
begin
  select v.key into uid from public.fs_docs d, jsonb_each(d.datos->'map') v where d.coleccion='sync' and d.id='perfiles' and d.eliminado_en is null and v.value->>'rol'='Administrador' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  -- 1-2) reglas puras
  if glacial_fs.excel_correccion_error(base || '{"celda":"b12","client_event_id":"cccccccc-0000-4000-8000-000000000009"}') like 'celda%' then ok := ok + 1; else raise exception '1'; end if;
  if glacial_fs.excel_correccion_error(base || '{"valor":true,"client_event_id":"cccccccc-0000-4000-8000-000000000009"}') like 'el valor%' then ok := ok + 1; else raise exception '2'; end if;
  -- 3-4) guardar con su original; el mismo evento no duplica el historial
  r := public.excel_correccion_guardar(base || '{"valor":1350,"original":1200,"client_event_id":"dddddddd-0000-4000-8000-000000000001"}');
  if (r->>'valor')::int = 1350 and (r->>'original')::int = 1200 then ok := ok + 1; else raise exception '3 %', r; end if;
  r := public.excel_correccion_guardar(base || '{"valor":1350,"original":1200,"client_event_id":"dddddddd-0000-4000-8000-000000000001"}');
  if (select count(*) from public.excel_correcciones_historial where reporte = base->>'reporte') = 1 then ok := ok + 1; else raise exception '4 idempotencia'; end if;
  -- 5) corregir otra vez: el ORIGINAL (lo que generó el sistema) se conserva
  r := public.excel_correccion_guardar(base || '{"valor":1400,"original":999,"client_event_id":"dddddddd-0000-4000-8000-000000000002"}');
  if (r->>'valor')::int = 1400 and (r->>'original')::int = 1200 then ok := ok + 1; else raise exception '5 %', r; end if;
  -- 6) listar
  r := public.excel_correccion_guardar(base || '{"celda":"A3","valor":"Scala Premium","client_event_id":"dddddddd-0000-4000-8000-000000000003"}');
  r := public.excel_correcciones_listar(base->>'reporte');
  if jsonb_array_length(r) = 2 and r->1->>'celda' = 'B12' then ok := ok + 1; else raise exception '6 %', r; end if;
  -- 7) quitar la corrección (valor null): vuelve el valor del sistema y queda en el historial
  r := public.excel_correccion_guardar(base || '{"valor":null,"client_event_id":"dddddddd-0000-4000-8000-000000000004"}');
  if jsonb_array_length(public.excel_correcciones_listar(base->>'reporte')) = 1 and (select count(*) from public.excel_correcciones_historial where reporte = base->>'reporte' and despues is null) = 1 then ok := ok + 1; else raise exception '7'; end if;
  -- 8-9) sin sesión: ni ver ni guardar
  perform set_config('request.jwt.claims', '{}', true);
  begin perform public.excel_correcciones_listar(base->>'reporte'); raise exception '8';
  exception when sqlstate '42501' then ok := ok + 1; end;
  begin perform public.excel_correccion_guardar(base || '{"valor":1,"client_event_id":"dddddddd-0000-4000-8000-000000000005"}'); raise exception '9';
  exception when sqlstate '42501' then ok := ok + 1; end;
  raise notice 'OK glacial_71: % comprobaciones', ok;
end $t$;
rollback;
