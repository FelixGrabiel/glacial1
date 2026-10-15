-- El historial sigue a la persona cuando cambia su cuenta.
-- Cada cuenta tiene un identificador (uid) que queda escrito en lo que esa persona registra (auditoría de tareos,
-- bitácora, solicitudes, avances…). Al pasar de Firebase a Supabase, o cuando el Administrador restablece una
-- contraseña (se crea una cuenta nueva), ese identificador cambia. Aquí se actualiza en el historial para que cada
-- persona siga viendo como propio lo que registró antes.

-- Reemplaza un identificador por otro en los campos de primer nivel de todos los documentos vigentes.
create or replace function glacial_fs.reenlazar(p_viejo text, p_nuevo text)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare n integer;
begin
  if coalesce(p_viejo, '') = '' or coalesce(p_nuevo, '') = '' or p_viejo = p_nuevo or length(p_viejo) < 20 then return 0; end if;
  update public.fs_docs d
     set datos = (select jsonb_object_agg(k.key, case when jsonb_typeof(k.value) = 'string' and (k.value #>> '{}') = p_viejo
                                                     then to_jsonb(p_nuevo) else k.value end)
                    from jsonb_each(d.datos) k),
         version = d.version + 1, tocados = 0, actualizado_en = now()
   where d.eliminado_en is null and d.coleccion <> 'relojServidor'
     and exists(select 1 from jsonb_each(d.datos) k where jsonb_typeof(k.value) = 'string' and (k.value #>> '{}') = p_viejo);
  get diagnostics n = row_count;
  return n;
end $function$;
revoke all on function glacial_fs.reenlazar(text, text) from public, anon, authenticated;

-- Repasa a todos los usuarios: cuenta que tenían en Firebase → cuenta actual.
create or replace function glacial_fs.reenlazar_todo()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare f record; n integer; v_personas integer := 0; v_docs integer := 0;
begin
  for f in
    select e->>'authUid' as viejo, i.datos->>'authUid' as nuevo
      from glacial_fs.importacion s, jsonb_array_elements(s.datos->'items') e
      join public.fs_items i on i.coleccion = 'sync' and i.doc = 'users' and i.campo = 'items' and i.eliminado_en is null
                             and lower(i.datos->>'username') = lower(e->>'username')
     where s.c = 'sync' and s.d = 'users' and e ? 'authUid' and i.datos ? 'authUid' and e->>'authUid' <> i.datos->>'authUid'
  loop
    n := glacial_fs.reenlazar(f.viejo, f.nuevo);
    if n > 0 then v_personas := v_personas + 1; v_docs := v_docs + n; end if;
  end loop;
  return jsonb_build_object('personas', v_personas, 'documentos', v_docs);
end $function$;
revoke all on function glacial_fs.reenlazar_todo() from public, anon, authenticated;

-- Automático: cuando a un usuario se le asigna una cuenta nueva, su historial pasa a esa cuenta.
create or replace function glacial_fs.al_cambiar_cuenta()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_nuevo text; v_anterior text; v_firebase text;
begin
  if new.eliminado_en is not null then return null; end if;
  v_nuevo := new.datos->>'authUid';
  if tg_op = 'UPDATE' then v_anterior := old.datos->>'authUid'; end if;
  if coalesce(v_nuevo, '') = '' or v_nuevo is not distinct from v_anterior then return null; end if;
  if v_anterior is not null then perform glacial_fs.reenlazar(v_anterior, v_nuevo); end if;
  select e->>'authUid' into v_firebase
    from glacial_fs.importacion s, jsonb_array_elements(s.datos->'items') e
   where s.c = 'sync' and s.d = 'users' and lower(e->>'username') = lower(new.datos->>'username') limit 1;
  if v_firebase is not null then perform glacial_fs.reenlazar(v_firebase, v_nuevo); end if;
  return null;
end $function$;
revoke all on function glacial_fs.al_cambiar_cuenta() from public, anon, authenticated;

create trigger fs_usuarios_cuenta after insert or update of datos on public.fs_items
  for each row when (new.coleccion = 'sync' and new.doc = 'users' and new.campo = 'items')
  execute function glacial_fs.al_cambiar_cuenta();
