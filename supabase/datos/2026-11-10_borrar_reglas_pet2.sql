-- GLACIAL · Borra las 2 reglas viejas (desactivadas) de tiempo de cambio de PET2 · aprobado por el dueño el 10/11/2026
--
-- Dónde: public.fs_docs sync/catalogoPlanificacion → datos.tiempos.reglas (único elemento de esa lista: solo existen estas 2 reglas).
--   · rg_mv4r4zkmtbjrg  CAMBIO_FORMATO        PET2  Cuisine Pack_Regular_625mlx15und/ln → Scala Pack_Regular_SC_1Lx12und/ln   120 min  activo=false
--   · rg_mv8tt2e6b76x4  CAMBIO_MARCA_FORMATO  PET2  Scala  Pack_Regular_625mlx15und/ln → Scala Pack_Regular_625mlx15und/ln   120 min  activo=false (mismo producto: error)
-- Sin afectar la producción: ambas estaban DESACTIVADAS, así que no entraban en ningún cálculo.
--   La «huella de parámetros» (65a-planificacion-tiempos.js) incluye TODAS las reglas de la línea, también las desactivadas; al borrarlas
--   la huella de PET2 pasaría a ser la de las líneas sin reglas (2091066325) y las evaluaciones ya guardadas de PET2 aparecerían como
--   «desfasadas». Para que NO cambie nada, el mismo paso reescribe la huella de esas evaluaciones de PET2 (1578793955 → 2091066325).
-- Seguridad: se detiene si las reglas ya no son exactamente esas 2, si alguna está activa o si la huella de PET2 ya no es la esperada.
-- Estado: ENSAYO OK y APLICADO en PRODUCCIÓN el 10/11/2026 (reglas 2 → 0; 30 evaluaciones de PET2 con la huella reescrita). PRUEBAS no tiene esas reglas. No volver a ejecutar.
-- Modo ensayo: con ensayo = true termina con un error que lleva el resumen y no queda nada guardado.

do $r$
declare
  ensayo constant boolean := true;
  d jsonb; v_ev jsonb; v_n integer; v_k text; v_prox bigint; v_cambiadas integer := 0;
begin
  select datos, version + 1 into d, v_prox from public.fs_docs where coleccion = 'sync' and id = 'catalogoPlanificacion' for update;
  if jsonb_array_length(d->'tiempos'->'reglas') <> 2 then raise exception 'esperaba exactamente 2 reglas, hay %', jsonb_array_length(d->'tiempos'->'reglas'); end if;
  select count(*) into v_n from jsonb_array_elements(d->'tiempos'->'reglas') r
   where r->>'id' in ('rg_mv4r4zkmtbjrg', 'rg_mv8tt2e6b76x4') and r->>'linea' = 'PET2' and (r->>'activo') = 'false';
  if v_n <> 2 then raise exception 'las reglas ya no son las 2 viejas desactivadas de PET2'; end if;
  if jsonb_array_length(coalesce(d->'tiempos'->'ventanas', '[]'::jsonb)) <> 0 then raise exception 'hay ventanas: la huella ya no es la esperada'; end if;

  v_ev := coalesce(d->'tiempos'->'evaluaciones', '{}'::jsonb);
  for v_k in select k from jsonb_object_keys(v_ev) k where k like '%|PET2' loop
    if v_ev->v_k->>'huellaParam' = '1578793955' then
      v_ev := jsonb_set(v_ev, array[v_k, 'huellaParam'], to_jsonb('2091066325'::text));
      v_cambiadas := v_cambiadas + 1;
    elsif v_ev->v_k->>'huellaParam' is distinct from '2091066325' then
      raise exception 'la evaluación % tiene una huella inesperada: %', v_k, v_ev->v_k->>'huellaParam';
    end if;
  end loop;

  d := jsonb_set(d, '{tiempos,reglas}', '[]'::jsonb);
  d := jsonb_set(d, '{tiempos,evaluaciones}', v_ev);
  d := jsonb_set(d, '{tiempos,version}', to_jsonb(coalesce((d->'tiempos'->>'version')::int, 0) + 1));
  d := jsonb_set(d, '{tiempos,actualizadoEn}', to_jsonb(floor(extract(epoch from clock_timestamp()) * 1000)::bigint));
  d := jsonb_set(d, '{tiempos,actualizadoPor}', to_jsonb('Administración (borrado de 2 reglas viejas de PET2, 10/11/2026)'::text));
  d := jsonb_set(d, '{tiempos,actualizadoUid}', to_jsonb(''::text));

  if ensayo then
    raise exception 'ENSAYO OK (nada guardado) · versión del documento % · evaluaciones de PET2 con huella reescrita: % · reglas después: %',
      v_prox, v_cambiadas, jsonb_array_length(d->'tiempos'->'reglas');
  end if;
  update public.fs_docs set datos = d, version = v_prox, actualizado_en = now() where coleccion = 'sync' and id = 'catalogoPlanificacion';
  raise notice 'APLICADO · versión % · evaluaciones PET2 reescritas %', v_prox, v_cambiadas;
end $r$;
