-- glacial_41 · El conflicto de guardado ya no se reintenta solo en el servidor
-- Aplicada en PRODUCCIÓN (ehtbwmvwoxcdefvlxttu) y en PRUEBAS (mvxjopvnnagqytegtexi) el 2026-11-05 ~03:05 UTC (22:05 en Perú).
--
-- Incidente: desde las 02:40 UTC del 2026-11-05 nadie podía entrar al sistema. glacial_fs.fs_commit_base señalaba el conflicto de versión
-- («fs-conflicto: sync/paletas cambió mientras se guardaba») con el código 40001 (serialization_failure). PostgREST REINTENTA solo las
-- transacciones que fallan con 40001: como la petición traía una versión vieja de sync/paletas, cada reintento volvía a fallar, sin fin
-- (una conexión acumuló ~148 000 intentos en 25 minutos). Cada intento bloqueaba la fila de sync/paletas (FOR UPDATE) y ocupaba conexiones:
-- el resto de las peticiones (también las del inicio de sesión) esperaban hasta el 504 de 60 s.
--
-- Corrección: el conflicto usa el código PT409, que PostgREST devuelve tal cual como HTTP 409 (sin reintentar). La página lo sigue
-- reconociendo como conflicto por el texto «fs-conflicto» (js/nucleo/00b-puente-supabase.js, traducirError) y reintenta como antes:
-- con la versión NUEVA del documento y a lo más 5 veces.
-- Solo cambia el código de error de esa línea; el resto de la función queda igual. Se puede ejecutar más de una vez.
do $$
declare d text;
begin
  d := pg_get_functiondef('glacial_fs.fs_commit_base'::regproc);
  if position('using errcode = ''PT409''' in d) > 0 then return; end if;                -- ya aplicada
  if position('using errcode = ''40001''' in d) = 0 then raise exception 'glacial_41: ancla no encontrada, no se cambia nada'; end if;
  execute replace(d, 'using errcode = ''40001''', 'using errcode = ''PT409''');
end $$;

-- Ampliación (2026-11-05, misma noche): el mismo cambio en las 13 funciones de glacial_priv que señalaban «revisión desactualizada» con 40001
-- (corregir_linea, corregir_tareo, editar_salida_maquinista, estado_cuadro, estado_linea, estado_orden, estado_tareo, guardar_config,
--  guardar_cuadro, guardar_distribucion, marcar_tareo, modificar_orden, reabrir_orden). Tenían el mismo riesgo de reintento sin fin.
-- La página (js/) no llama a ninguna de ellas ni depende del código 40001. Solo existen en PRODUCCIÓN (PRUEBAS no tiene el esquema
-- glacial_priv). Verificado después: ninguna función de los esquemas propios usa 40001 en ninguno de los dos proyectos.
do $$
declare r record;
begin
  if to_regnamespace('glacial_priv') is null then return; end if;
  for r in select p.oid from pg_proc p join pg_namespace s on s.oid=p.pronamespace
           where s.nspname='glacial_priv' and p.prokind='f' and pg_get_functiondef(p.oid) ~ 'errcode\s*=\s*''40001''' loop
    execute regexp_replace(pg_get_functiondef(r.oid), 'errcode\s*=\s*''40001''', 'errcode=''PT409''', 'g');
  end loop;
end $$;
