-- GLACIAL · prueba de glacial_68 (integridad e idempotencia de paletas). Se ejecuta en PRUEBAS (mvxjopvnnagqytegtexi) DESPUÉS de glacial_68; todo va dentro
-- de una transacción que termina en ROLLBACK: no deja nada. Si algo falla, el DO lanza una excepción con el caso («FALLA: …»); si termina bien, imprime
-- «OK glacial_68: N comprobaciones». Requiere que existan los documentos padre sync/paletas y sync/programaciones en public.fs_docs (existen en PRUEBAS).
-- Uso: psql / editor SQL de Supabase (PRUEBAS) → pegar el archivo completo.
begin;
do $t$
declare
  n integer := 0;
  cev constant text := '11111111-1111-4111-8111-111111111111';
  base jsonb := jsonb_build_object('id','t68_a','linea','PET1','marca','Bells','presentacion','Pack_Regular_2.5Lx6und','fecha','2026-11-26','turno','DÍA',
      'hora','14:07','tipoPaleta','COMPLETA','paletas',12,'unidadesPorPaleta',324,'unidadesIncompleta',0,'totalUnidades',3888,'usuario','Prueba',
      'clientEventId',cev,'capturadoEn','2026-11-26T14:07:31.250-05:00','creadoEn',1790000000000);
  filas integer;
  ce timestamptz;

begin
  -- 1) un registro válido con evento entra y queda en el libro con su hora de captura
  insert into public.fs_items(coleccion,doc,campo,id,pos,datos) values ('sync','paletas','items','t68_a',1,base);
  select count(*), min(captured_at) into filas, ce from glacial_fs.paletas_eventos where client_event_id = cev::uuid;
  if filas <> 1 or ce <> '2026-11-26T14:07:31.250-05:00'::timestamptz then raise exception 'FALLA: el evento no quedó en el libro con su captured_at'; end if; n := n + 1;

  -- 2) reenviar/corregir EL MISMO registro (mismo id y evento) es inofensivo y no cambia captured_at
  update public.fs_items set datos = base || jsonb_build_object('paletas',13,'totalUnidades',4212,'observaciones','corregido') where id = 't68_a' and doc = 'paletas';
  select paletas, captured_at into filas, ce from glacial_fs.paletas_eventos where client_event_id = cev::uuid;
  if filas <> 13 or ce <> '2026-11-26T14:07:31.250-05:00'::timestamptz then raise exception 'FALLA: la corrección del mismo registro no actualizó el libro o movió captured_at'; end if; n := n + 1;

  -- 3) OTRO registro con el mismo clientEventId es un duplicado (23505)
  begin
    insert into public.fs_items(coleccion,doc,campo,id,pos,datos) values ('sync','paletas','items','t68_b',2,base || jsonb_build_object('id','t68_b'));
    raise exception 'FALLA: se aceptó un clientEventId repetido en otro registro';
  exception when unique_violation then n := n + 1; end;

  -- 4) clientEventId no se puede cambiar una vez puesto
  begin
    update public.fs_items set datos = base || jsonb_build_object('clientEventId','22222222-2222-4222-8222-222222222222') where id = 't68_a' and doc = 'paletas';
    raise exception 'FALLA: se permitió cambiar el clientEventId';
  exception when check_violation then n := n + 1; end;

  -- 5) rechazos de validación (cada uno debe lanzar check_violation)
  declare
    malos jsonb := jsonb_build_array(
      jsonb_build_object('caso','tipo inválido','d', base - 'clientEventId' - 'capturadoEn' || jsonb_build_object('id','t68_m1','tipoPaleta','MEDIA')),
      jsonb_build_object('caso','paletas negativas','d', base - 'clientEventId' - 'capturadoEn' || jsonb_build_object('id','t68_m2','paletas',-1)),
      jsonb_build_object('caso','completa no entera','d', base - 'clientEventId' - 'capturadoEn' || jsonb_build_object('id','t68_m3','paletas',1.5)),
      jsonb_build_object('caso','hora 25:00','d', base - 'clientEventId' - 'capturadoEn' || jsonb_build_object('id','t68_m4','hora','25:00')),
      jsonb_build_object('caso','fecha inexistente','d', base - 'clientEventId' - 'capturadoEn' || jsonb_build_object('id','t68_m5','fecha','2026-02-31')),
      jsonb_build_object('caso','turno inválido','d', base - 'clientEventId' - 'capturadoEn' || jsonb_build_object('id','t68_m6','turno','TARDE')),
      jsonb_build_object('caso','marca vacía','d', base - 'clientEventId' - 'capturadoEn' || jsonb_build_object('id','t68_m7','marca','  ')),
      jsonb_build_object('caso','total negativo','d', base - 'clientEventId' - 'capturadoEn' || jsonb_build_object('id','t68_m8','totalUnidades',-5)),
      jsonb_build_object('caso','paletas como texto','d', base - 'clientEventId' - 'capturadoEn' || jsonb_build_object('id','t68_m9','paletas','12')),
      jsonb_build_object('caso','clientEventId no UUID','d', base || jsonb_build_object('id','t68_m10','clientEventId','abc')),
      jsonb_build_object('caso','evento sin capturadoEn','d', (base - 'capturadoEn') || jsonb_build_object('id','t68_m11','clientEventId','33333333-3333-4333-8333-333333333333')),
      jsonb_build_object('caso','id distinto de la fila','d', base - 'clientEventId' - 'capturadoEn' || jsonb_build_object('id','otro'))
    );
    x jsonb;
  begin
    for x in select * from jsonb_array_elements(malos) loop
      begin
        insert into public.fs_items(coleccion,doc,campo,id,pos,datos) values ('sync','paletas','items', coalesce(nullif(x->'d'->>'id','otro'),'t68_x') , 9, x->'d');
        if x->>'caso' = 'id distinto de la fila' then
          raise exception 'FALLA: se aceptó «%»', x->>'caso';
        end if;
        raise exception 'FALLA: se aceptó «%»', x->>'caso';
      exception when check_violation then n := n + 1; end;
    end loop;
  end;

  -- 6) lo legítimo NO se bloquea: acumulado 0, saldo en 0, registro antiguo sin evento (no entra al libro), fecha de otro día, hora ausente
  insert into public.fs_items(coleccion,doc,campo,id,pos,datos) values
    ('sync','paletas','items','t68_ok1',3,(base - 'clientEventId' - 'capturadoEn') || jsonb_build_object('id','t68_ok1','paletas',0,'totalUnidades',0)),
    ('sync','paletas','items','t68_ok2',4,(base - 'clientEventId' - 'capturadoEn') || jsonb_build_object('id','t68_ok2','tipoPaleta','INCOMPLETA','paletas',1,'unidadesIncompleta',0,'totalUnidades',0)),
    ('sync','paletas','items','t68_ok3',5,(base - 'clientEventId' - 'capturadoEn' - 'hora') || jsonb_build_object('id','t68_ok3'));
  select count(*) into filas from glacial_fs.paletas_eventos where paleta_id in ('t68_ok1','t68_ok2','t68_ok3');
  if filas <> 0 then raise exception 'FALLA: un registro sin clientEventId entró al libro'; end if; n := n + 1;

  -- 7) una baja lógica nunca se bloquea
  update public.fs_items set eliminado_en = now() where id = 't68_ok1' and doc = 'paletas';
  n := n + 1;

  -- 8) otros documentos de la colección sync no se ven afectados por las reglas de paletas
  insert into public.fs_items(coleccion,doc,campo,id,pos,datos) values ('sync','programaciones','items','t68_prog',1,'{"id":"t68_prog","cualquier":"cosa"}');
  n := n + 1;

  -- 9) una fila vieja no se revalida si su contenido no cambia (solo cambia pos)
  update public.fs_items set pos = 99 where id = 't68_a' and doc = 'paletas';
  n := n + 1;

  raise notice 'OK glacial_68: % comprobaciones', n;
end $t$;
rollback;
