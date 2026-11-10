-- GLACIAL · Mantenimiento · las 5 hojas «CARB» son de PET2 · confirmado por el dueño el 10/11/2026
-- (evidencia: la producción de agua con gas —Bells_Gas, Scala_Gas, Cuisine_Gas— solo aparece en PET2).
-- Asigna linea = 'PET2' y quita «pendiente de confirmar» a: SOP CARB, ENV CARB, DISP CARB, DISP CARB (2) y COMP. AP CARB. No toca actividades ni registros.
-- Se detiene si no encuentra exactamente esas 5 hojas pendientes. Estado: PENDIENTE de aplicar (PRODUCCIÓN y PRUEBAS).
do $c$
declare n integer;
begin
  select count(*) into n from public.mtto_maquinas
   where codigo_hoja in ('SOP CARB','ENV CARB','DISP CARB','DISP CARB (2)','COMP. AP CARB') and pendiente_confirmar and linea is null;
  if n <> 5 then raise exception 'esperaba 5 hojas CARB pendientes, hay %', n; end if;
  update public.mtto_maquinas set linea = 'PET2', pendiente_confirmar = false
   where codigo_hoja in ('SOP CARB','ENV CARB','DISP CARB','DISP CARB (2)','COMP. AP CARB') and pendiente_confirmar and linea is null;
  get diagnostics n = row_count;
  if n <> 5 then raise exception 'se actualizaron % en vez de 5', n; end if;
end $c$;
