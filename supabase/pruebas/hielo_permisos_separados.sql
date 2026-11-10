-- GLACIAL · Hielo: permisos separados de Agua (glacial_50). SOLO PRUEBAS (mvxjopvnnagqytegtexi).
-- Prueba 4 perfiles dentro de una transacción que se deshace sola (raise exception final): no queda nada guardado.
-- Resultado esperado (verificado el 10/11/2026):
--   Supervisor (rol de planta, sin «hielo» a mano) → hielo=true, opera=true (acceso por defecto, como antes).
--   Almacén + permiso «paletas» de Agua (sin «hielo») → hielo=false, opera=true (ya NO entra a Hielo solo por tener Agua).
--   Almacén + permiso «hielo» (sin «paletas») → hielo=true, opera=false (entra a Hielo sin tener Agua).
--   Supervisor con «-hielo» → hielo=false, opera=true (el Administrador le quitó Hielo sin tocar Agua).
-- Y en vivo contra hieloReportes: Almacén con solo «paletas» de Agua → rechazado; Almacén con «hielo» → aceptado.
do $t$
declare res text := ''; ctxv jsonb;
begin
  update public.fs_docs set datos = jsonb_set(datos,'{map}', datos->'map' ||
    jsonb_build_object(
      'a0000000-0000-0000-0000-000000000001', jsonb_build_object('rol','Supervisor','permisos',jsonb_build_array()),
      'a0000000-0000-0000-0000-000000000002', jsonb_build_object('rol','Almacén','permisos',jsonb_build_array('paletas')),
      'a0000000-0000-0000-0000-000000000003', jsonb_build_object('rol','Almacén','permisos',jsonb_build_array('hielo')),
      'a0000000-0000-0000-0000-000000000004', jsonb_build_object('rol','Supervisor','permisos',jsonb_build_array('-hielo'))
    ))
   where coleccion='sync' and id='perfiles';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000001','role','authenticated')::text, true);
  ctxv := glacial_fs.ctx(); res := res || 'Supervisor (rol, sin «hielo» explícito): hielo=' || (ctxv->>'hielo') || ' opera=' || (ctxv->>'opera') || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000002','role','authenticated')::text, true);
  ctxv := glacial_fs.ctx(); res := res || 'Almacén + «paletas» de Agua (sin «hielo»): hielo=' || (ctxv->>'hielo') || ' opera=' || (ctxv->>'opera') || E'\n';
  begin
    perform public.fs_commit(jsonb_build_array(jsonb_build_object('t','set','c','hieloReportes','d','2099-01-01_DÍA','datos',
      jsonb_build_object('id','2099-01-01_DÍA','estado','EN_REGISTRO','actualizadoUid','a0000000-0000-0000-0000-000000000002'))), null, null);
    res := res || '  → escribe en hieloReportes: SÍ pudo (MAL)' || E'\n';
  exception when others then res := res || '  → escribe en hieloReportes: rechazado (' || sqlerrm || ')' || E'\n'; end;
  perform set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000003','role','authenticated')::text, true);
  ctxv := glacial_fs.ctx(); res := res || 'Almacén + permiso «hielo» (sin «paletas»): hielo=' || (ctxv->>'hielo') || ' opera=' || (ctxv->>'opera') || E'\n';
  begin
    perform public.fs_commit(jsonb_build_array(jsonb_build_object('t','set','c','hieloReportes','d','2099-01-02_DÍA','datos',
      jsonb_build_object('id','2099-01-02_DÍA','estado','EN_REGISTRO','actualizadoUid','a0000000-0000-0000-0000-000000000003'))), null, null);
    res := res || '  → escribe en hieloReportes: SÍ pudo (correcto)' || E'\n';
  exception when others then res := res || '  → escribe en hieloReportes: rechazado (' || sqlerrm || ')' || E'\n'; end;
  perform set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
  ctxv := glacial_fs.ctx(); res := res || 'Supervisor con «-hielo»: hielo=' || (ctxv->>'hielo') || ' opera=' || (ctxv->>'opera') || E'\n';
  reset role;
  raise exception E'RESULTADO (nada guardado):\n%', res;
end $t$;
