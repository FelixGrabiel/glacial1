-- GLACIAL · 13/11/2026 · Insumos por variante en el Asistente de Producción.
--   Preformas por gramaje (12.7, 15.7, 17.7, 21.7, 33.7, 42.7 y 90 g) · Polietileno 48 / 54 / 56 cm · Stretch film por rollo (17 y 2 kg) ·
--   Etiquetas: roll feed 380 ml, 625 ml, 1 L, 1.5 L · bobina 2.5 L · B7L · B10L.
-- Misma regla que js/asistente/70-asistente-nucleo.js › variantesDeFactores (probada en tests/asistente-variantes.test.js):
--   · Preformas: gramaje por presentación (B7L 90 g; 625 ml regular 15.7, saborizada 17.7, con gas 21.7); preformas por caja = capacidad física del gramaje
--     (Inicio › capacidadPorGramaje). Los factores «No aplica» de C20L/B20L se quedan en el insumo base.
--   · Polietileno: B7L 48 cm, C20L 54 cm, el resto 56 cm. · Stretch: todo a rollo de 17 kg (factor = kg ÷ 17); el de 2 kg queda creado para pedirlo a mano.
--   · Etiquetas: PET1/PET2 una por presentación (roll feed o bobina); B7L propia; C20L/B20L «No aplica» se quedan en el base.
-- Los factores viejos NO se borran: quedan inactivos y con nota. Los insumos base (CAJA_PREFORMA, POLIETILENO, STRETCH, ETIQUETA) pasan a inactivos (son el grupo).
-- «Strech film 17kg» (C01, de prueba) se desactiva si no tiene movimientos.
-- Se puede ejecutar más de una vez. Primero con ensayo = true (se deshace solo); luego false.
do $v$
declare
  ensayo constant boolean := true;
  ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
  quien constant text := 'Insumos por variante (Asistente, 13/11/2026)';
  r record; v_g text; v_ins text; v_cb numeric; v_f numeric; v_nota text; v_t text; v_id text; v_desde text;
  n_ins int := 0; n_nuevos int := 0; n_retirados int := 0; n_base int := 0;
  cap constant jsonb := '{"12.7":22000,"15.7":18000,"17.7":18500,"21.7":14000,"33.7":9928,"42.7":7500,"90":2800}'::jsonb;
  resumen text;
begin
  -- 1) insumos variante
  for r in select * from (values
    ('PREFORMA_12_7','Cajas de preformas 12.7 g','caja','preforma','CAJA_PREFORMA',null::int),
    ('PREFORMA_15_7','Cajas de preformas 15.7 g','caja','preforma','CAJA_PREFORMA',null),
    ('PREFORMA_17_7','Cajas de preformas 17.7 g','caja','preforma','CAJA_PREFORMA',null),
    ('PREFORMA_21_7','Cajas de preformas 21.7 g','caja','preforma','CAJA_PREFORMA',null),
    ('PREFORMA_33_7','Cajas de preformas 33.7 g','caja','preforma','CAJA_PREFORMA',null),
    ('PREFORMA_42_7','Cajas de preformas 42.7 g','caja','preforma','CAJA_PREFORMA',null),
    ('PREFORMA_90','Cajas de preformas 90 g','caja','preforma','CAJA_PREFORMA',null),
    ('POLIETILENO_48','Polietileno 48 cm','kg','polietileno','POLIETILENO',null),
    ('POLIETILENO_54','Polietileno 54 cm','kg','polietileno','POLIETILENO',null),
    ('POLIETILENO_56','Polietileno 56 cm','kg','polietileno','POLIETILENO',null),
    ('STRETCH_17KG','Stretch film · rollo de 17 kg','rollo','stretch','STRETCH',17),
    ('STRETCH_2KG','Stretch film · rollo de 2 kg','rollo','stretch','STRETCH',2),
    ('ETIQUETA_RF_380','Etiqueta roll feed 380 ml','UND','etiqueta','ETIQUETA',null),
    ('ETIQUETA_RF_625','Etiqueta roll feed 625 ml','UND','etiqueta','ETIQUETA',null),
    ('ETIQUETA_RF_1L','Etiqueta roll feed 1 L','UND','etiqueta','ETIQUETA',null),
    ('ETIQUETA_RF_1_5L','Etiqueta roll feed 1.5 L','UND','etiqueta','ETIQUETA',null),
    ('ETIQUETA_BOBINA_2_5L','Etiqueta bobina 2.5 L','UND','etiqueta','ETIQUETA',null),
    ('ETIQUETA_B7L','Etiqueta B7L','UND','etiqueta','ETIQUETA',null),
    ('ETIQUETA_B10L','Etiqueta B10L','UND','etiqueta','ETIQUETA',null)
  ) t(codigo,nombre,unidad,tipo,grupo,kg) loop
    insert into public.fs_docs(coleccion,id,datos,version,partes,conteos,tocados,raiz)
    values ('apInsumos',r.codigo,
      jsonb_strip_nulls(jsonb_build_object('codigo',r.codigo,'nombre',r.nombre,'unidad',r.unidad,'tipo',r.tipo,'grupo',r.grupo,'kgPorUnidad',r.kg,'itemCode','','activo',true,'version',1,
        'actualizadoEn',jsonb_build_object('__ts',ms),'actualizadoPor',quien,'actualizadoUid','')),1,'{}','{}'::jsonb,0,'apInsumos')
    on conflict do nothing;
    if found then n_ins := n_ins + 1; end if;
  end loop;

  -- 2) factores: cada factor activo de los 4 grupos pasa a su variante
  create temp table _pres on commit drop as
    select distinct datos->>'linea' linea, datos->>'presentacion' pres from public.fs_docs
    where coleccion='apFactores' and eliminado_en is null and datos->>'insumo'='CAJA_PREFORMA' and datos->>'presentacion' <> '*' and coalesce(datos->>'activo','true')='true';
  create temp table _nuevos(id text primary key, datos jsonb, orig text) on commit drop;

  for r in select id, datos d from public.fs_docs
           where coleccion='apFactores' and eliminado_en is null and coalesce(datos->>'activo','true')='true' and (datos->'vigenteHasta' is null or datos->>'vigenteHasta' is null)
             and datos->>'insumo' in ('CAJA_PREFORMA','POLIETILENO','STRETCH','ETIQUETA') loop
    v_desde := replace(r.d->>'vigenteDesde','-','');
    if r.d->>'insumo'='CAJA_PREFORMA' and r.d->>'linea' in ('PET1','PET2','B7L') and (r.d->>'factor')::numeric>0 then
      v_t := regexp_replace(lower(r.d->>'presentacion'),'\s+','','g');
      v_g := case when r.d->>'linea'='B7L' then '90'
        when v_t ~ '380ml' then '12.7'
        when v_t ~ '625ml' then case when lower(r.d->>'presentacion') ~ 'sabor' then '17.7' when lower(r.d->>'presentacion') ~ '(^|[^a-z])gas([^a-z]|$)' then '21.7' else '15.7' end
        when v_t ~ '1\.5l|1500ml' then '33.7' when v_t ~ '2\.5l|2500ml' then '42.7' when v_t ~ '(^|[^0-9.])1l|1000ml' then '21.7' else null end;
      if v_g is not null then
        v_ins := 'PREFORMA_'||replace(v_g,'.','_'); v_cb := (cap->>v_g)::numeric;
        v_id := (r.d->>'linea')||'_'||v_ins||'_'||case when r.d->>'marca'='*' then 'x' else regexp_replace(lower(r.d->>'marca'),'[^a-z0-9.]+','-','g') end||'_'||case when r.d->>'presentacion'='*' then 'x' else regexp_replace(lower(r.d->>'presentacion'),'[^a-z0-9.]+','-','g') end||'_'||v_desde;
        insert into _nuevos values (v_id, (r.d - 'id' - 'actualizadoEn' - 'actualizadoPor' - 'actualizadoUid')
          || jsonb_build_object('id',v_id,'insumo',v_ins,'cantidadBase',v_cb,'factor',1,'nota','producción ÷ '||v_cb||' (preforma de '||v_g||' g)','version',1,
               'actualizadoEn',jsonb_build_object('__ts',ms),'actualizadoPor',quien,'actualizadoUid',''), r.id) on conflict do nothing;
      end if;
    elsif r.d->>'insumo'='POLIETILENO' then
      v_ins := 'POLIETILENO_'||case r.d->>'linea' when 'B7L' then '48' when 'C20L' then '54' else '56' end;
      v_id := (r.d->>'linea')||'_'||v_ins||'_'||case when r.d->>'marca'='*' then 'x' else regexp_replace(lower(r.d->>'marca'),'[^a-z0-9.]+','-','g') end||'_'||case when r.d->>'presentacion'='*' then 'x' else regexp_replace(lower(r.d->>'presentacion'),'[^a-z0-9.]+','-','g') end||'_'||v_desde;
      insert into _nuevos values (v_id, (r.d - 'id' - 'actualizadoEn' - 'actualizadoPor' - 'actualizadoUid')
        || jsonb_build_object('id',v_id,'insumo',v_ins,'nota',coalesce(nullif(r.d->>'nota','')||' · ','')||'polietileno de '||right(v_ins,2)||' cm','version',1,
             'actualizadoEn',jsonb_build_object('__ts',ms),'actualizadoPor',quien,'actualizadoUid',''), r.id) on conflict do nothing;
    elsif r.d->>'insumo'='STRETCH' then
      v_ins := 'STRETCH_17KG';
      v_id := (r.d->>'linea')||'_'||v_ins||'_'||case when r.d->>'marca'='*' then 'x' else regexp_replace(lower(r.d->>'marca'),'[^a-z0-9.]+','-','g') end||'_'||case when r.d->>'presentacion'='*' then 'x' else regexp_replace(lower(r.d->>'presentacion'),'[^a-z0-9.]+','-','g') end||'_'||v_desde;
      insert into _nuevos values (v_id, (r.d - 'id' - 'actualizadoEn' - 'actualizadoPor' - 'actualizadoUid')
        || jsonb_build_object('id',v_id,'insumo',v_ins,'factor',(r.d->>'factor')::numeric/17,'nota','rollo de 17 kg · '||(r.d->>'factor')||' kg ÷ 17','version',1,
             'actualizadoEn',jsonb_build_object('__ts',ms),'actualizadoPor',quien,'actualizadoUid',''), r.id) on conflict do nothing;
    elsif r.d->>'insumo'='ETIQUETA' and (r.d->>'factor')::numeric>0 then
      if r.d->>'linea'='B7L' then
        v_ins := 'ETIQUETA_B7L';
        v_id := 'B7L_'||v_ins||'_x_x_'||v_desde;
        insert into _nuevos values (v_id, (r.d - 'id' - 'actualizadoEn' - 'actualizadoPor' - 'actualizadoUid')
          || jsonb_build_object('id',v_id,'insumo',v_ins,'version',1,'actualizadoEn',jsonb_build_object('__ts',ms),'actualizadoPor',quien,'actualizadoUid',''), r.id) on conflict do nothing;
      elsif r.d->>'linea' in ('PET1','PET2') then
        for v_g in select pres from _pres where linea=r.d->>'linea' loop
          v_t := regexp_replace(lower(v_g),'\s+','','g');
          v_ins := case when v_t ~ '380ml' then 'ETIQUETA_RF_380' when v_t ~ '625ml' then 'ETIQUETA_RF_625' when v_t ~ '1\.5l|1500ml' then 'ETIQUETA_RF_1_5L'
                        when v_t ~ '2\.5l|2500ml' then 'ETIQUETA_BOBINA_2_5L' when v_t ~ '(^|[^0-9.])1l|1000ml' then 'ETIQUETA_RF_1L' else null end;
          if v_ins is null then continue; end if;
          v_id := (r.d->>'linea')||'_'||v_ins||'_x_'||regexp_replace(lower(v_g),'[^a-z0-9.]+','-','g')||'_'||v_desde;
          insert into _nuevos values (v_id, (r.d - 'id' - 'actualizadoEn' - 'actualizadoPor' - 'actualizadoUid')
            || jsonb_build_object('id',v_id,'insumo',v_ins,'presentacion',v_g,'nota','etiqueta según la presentación','version',1,
                 'actualizadoEn',jsonb_build_object('__ts',ms),'actualizadoPor',quien,'actualizadoUid',''), r.id) on conflict do nothing;
        end loop;
      end if;
    end if;
  end loop;

  -- crea los factores nuevos que aún no existan (con su auditoría)
  insert into public.fs_docs(coleccion,id,datos,version,partes,conteos,tocados,raiz)
    select 'apFactores', n.id, n.datos, 1, '{}', '{}'::jsonb, 0, 'apFactores' from _nuevos n
    where not exists (select 1 from public.fs_docs d where d.coleccion='apFactores' and d.id=n.id);
  get diagnostics n_nuevos = row_count;
  insert into public.fs_docs(coleccion,id,datos,version,partes,conteos,tocados,raiz)
    select 'apAuditoria','variante-apFactores-'||n.id,
      jsonb_build_object('en',jsonb_build_object('__ts',ms),'uid','','antes',null,'docId',n.id,'despues',n.datos,'usuario',quien,'coleccion','apFactores','operacion','CREAR'),1,'{}','{}'::jsonb,0,'apAuditoria'
    from _nuevos n on conflict do nothing;

  -- retira los factores viejos que ya tienen su variante (no se borran)
  update public.fs_docs d set
      datos = d.datos || jsonb_build_object('activo',false,'nota',coalesce(nullif(d.datos->>'nota','')||' · ','')||'reemplazado por variante (13/11/2026)','version',coalesce((d.datos->>'version')::int,0)+1,
        'actualizadoEn',jsonb_build_object('__ts',ms),'actualizadoPor',quien,'actualizadoUid',''),
      version = d.version + 1, actualizado_en = now()
    where d.coleccion='apFactores' and d.id in (select orig from _nuevos);
  get diagnostics n_retirados = row_count;

  -- 3) insumos base (grupos) y el insumo de prueba C01 → inactivos
  update public.fs_docs d set datos = d.datos || jsonb_build_object('activo',false,'version',coalesce((d.datos->>'version')::int,0)+1,'actualizadoEn',jsonb_build_object('__ts',ms),'actualizadoPor',quien,'actualizadoUid',''),
      version = d.version + 1, actualizado_en = now()
    where d.coleccion='apInsumos' and d.id in ('CAJA_PREFORMA','POLIETILENO','STRETCH','ETIQUETA') and coalesce(d.datos->>'activo','true')='true';
  get diagnostics n_base = row_count;
  update public.fs_docs d set datos = d.datos || jsonb_build_object('activo',false,'version',coalesce((d.datos->>'version')::int,0)+1,'actualizadoEn',jsonb_build_object('__ts',ms),'actualizadoPor',quien,'actualizadoUid',''),
      version = d.version + 1, actualizado_en = now()
    where d.coleccion='apInsumos' and d.id='C01' and coalesce(d.datos->>'activo','true')='true'
      and not exists (select 1 from public.fs_docs m where m.coleccion='apMovimientos' and m.eliminado_en is null and m.datos->>'insumo'='C01')
      and not exists (select 1 from public.fs_docs s where s.coleccion='apSolicitudes' and s.eliminado_en is null and s.datos->>'estado' not in ('CANCELADA','CERRADA') and s.datos::text like '%"C01"%');

  select string_agg(x.k||': '||x.n, ' · ' order by x.k) into resumen from (select datos->>'insumo' k, count(*) n from _nuevos group by 1) x;
  if ensayo then
    raise exception 'ENSAYO OK (nada guardado) · insumos nuevos % · factores nuevos % · factores viejos retirados % · insumos base inactivados % · %', n_ins, n_nuevos, n_retirados, n_base, resumen;
  end if;
  raise notice 'APLICADO · insumos nuevos % · factores nuevos % · retirados % · base inactivados %', n_ins, n_nuevos, n_retirados, n_base;
end $v$;
