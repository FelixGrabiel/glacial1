-- GLACIAL · Mantenimiento · prueba de permisos simulando cada rol (glacial_47, 48 y 49). SOLO PRUEBAS (mvxjopvnnagqytegtexi).
-- Crea perfiles y un registro de mentira DENTRO de una transacción y termina con un error que lleva el resultado: no queda nada guardado.
-- Resultado esperado (T = sí, F = no):
--   ADM  sube foto T · edita T · valida T · borra T        SUP  sube T · edita T · valida T · borra T
--   TEC  (cuenta compartida) sube T · edita T · valida F · borra F
--   PROD / SOLO / JEFE / SINPERFIL  sube F · edita 0 · valida F · borra 0  (PROD, SOLO y JEFE sí leen; SINPERFIL no ve nada)
--   límite: la foto 21 se rechaza · registro VALIDADO: el técnico no sube fotos · ruta fuera de mantenimiento/ se rechaza.
do $t$
declare
  res text := ''; n integer; rid uuid; aid uuid; mid uuid; fid uuid; ok boolean;
  usuarios text[][] := array[
    ['ADM','11111111-1111-1111-1111-111111111111'],['SUP','22222222-2222-2222-2222-222222222222'],['TEC','33333333-3333-3333-3333-333333333333'],
    ['PROD','44444444-4444-4444-4444-444444444444'],['SOLO','55555555-5555-5555-5555-555555555555'],['JEFE','66666666-6666-6666-6666-666666666666'],['SINPERFIL','77777777-7777-7777-7777-777777777777']];
  i integer; nombre text; uid text; ctxv jsonb;
begin
  update public.fs_docs set datos = jsonb_set(datos,'{map}', datos->'map'
     || jsonb_build_object('11111111-1111-1111-1111-111111111111', jsonb_build_object('rol','Administrador','permisos','todos'),
                           '22222222-2222-2222-2222-222222222222', jsonb_build_object('rol','Supervisor de Mantenimiento','permisos',jsonb_build_array('moduloMantenimiento')),
                           '33333333-3333-3333-3333-333333333333', jsonb_build_object('rol','mantenimiento_compartido','permisos',jsonb_build_array()),
                           '44444444-4444-4444-4444-444444444444', jsonb_build_object('rol','Supervisor','permisos',jsonb_build_array()),
                           '55555555-5555-5555-5555-555555555555', jsonb_build_object('rol','Supervisor','soloVista',true,'permisos',jsonb_build_array('moduloMantenimiento')),
                           '66666666-6666-6666-6666-666666666666', jsonb_build_object('rol','Jefe de Producción','permisos',jsonb_build_array())))
   where coleccion='sync' and id='perfiles';
  select id into mid from public.mtto_maquinas order by orden limit 1;
  insert into public.mtto_registros(maquina_id, anio, semana) values (mid, 2099, 1) returning id into rid;
  insert into public.mtto_registro_actividades(registro_id, item, equipo, actividad) values (rid, 1, 'EQ', 'ACT') returning id into aid;
  for i in 1..array_length(usuarios,1) loop
    nombre := usuarios[i][1]; uid := usuarios[i][2];
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role','authenticated')::text, true);
    ctxv := glacial_fs.ctx();
    ok := true; fid := null;
    begin
      insert into public.mtto_registro_fotos(registro_id, ruta, subido_por) values (rid, 'supabase:glacial-fotos/mantenimiento/registros/x/'||nombre||'.jpg', nombre) returning id into fid;
    exception when others then ok := false; end;
    res := res || nombre || ' [supmtto=' || coalesce(ctxv->>'supmtto','') || ' mant=' || coalesce(ctxv->>'mant','') || ' solo=' || coalesce(ctxv->>'solo','') || ' aut=' || coalesce(ctxv->>'aut','') || '] sube foto: ' || ok;
    select count(*) into n from public.mtto_registro_fotos where registro_id = rid;
    res := res || ' · ve ' || n || ' fotos';
    update public.mtto_registro_fotos set descripcion='x' where registro_id = rid;
    get diagnostics n = row_count;
    res := res || ' · edita ' || n;
    ok := true;
    begin
      update public.mtto_registros set estado='CERRADO' where id = rid;
      update public.mtto_registros set estado='VALIDADO' where id = rid; get diagnostics n = row_count;
      ok := n = 1;
    exception when others then ok := false; end;
    res := res || ' · valida: ' || ok;
    execute 'reset role';
    update public.mtto_registros set estado='EN_CURSO' where id = rid;
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role','authenticated')::text, true);
    delete from public.mtto_registro_fotos where registro_id = rid; get diagnostics n = row_count;
    res := res || ' · borra ' || n || E'\n';
    execute 'reset role';
  end loop;
  for i in 1..20 loop insert into public.mtto_registro_fotos(registro_id, ruta) values (rid, 'supabase:glacial-fotos/mantenimiento/registros/x/l'||i||'.jpg'); end loop;
  begin insert into public.mtto_registro_fotos(registro_id, ruta) values (rid, 'supabase:glacial-fotos/mantenimiento/registros/x/l21.jpg'); res := res || 'LÍMITE: la foto 21 SÍ entró (mal)' || E'\n'; exception when others then res := res || 'LÍMITE: la foto 21 se rechaza (' || sqlerrm || ')' || E'\n'; end;
  delete from public.mtto_registro_fotos where registro_id = rid;
  update public.mtto_registros set estado='VALIDADO' where id = rid;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub','33333333-3333-3333-3333-333333333333','role','authenticated')::text, true);
  begin insert into public.mtto_registro_fotos(registro_id, ruta) values (rid, 'supabase:glacial-fotos/mantenimiento/registros/x/v1.jpg'); res := res || 'VALIDADO: el técnico SÍ pudo subir foto (mal)' || E'\n'; exception when others then res := res || 'VALIDADO: el técnico no puede subir foto (' || sqlerrm || ')' || E'\n'; end;
  begin insert into public.mtto_registro_fotos(registro_id, ruta) values (rid, 'https://otro/x.jpg'); res := res || 'RUTA ajena aceptada (mal)' || E'\n'; exception when others then res := res || 'RUTA fuera de mantenimiento/ se rechaza' || E'\n'; end;
  execute 'reset role';
  raise exception E'RESULTADO (nada guardado):\n%', res;
end $t$;
