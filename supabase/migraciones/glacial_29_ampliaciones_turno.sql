-- GLACIAL · glacial_29 · Reglas de Supabase para el TIEMPO EXTRA DE SUPERVISORES (colección ampliacionesTurno)   *** PENDIENTE: PRUEBAS y PRODUCCION ***
--
-- Qué hace (mismo método que glacial_23, 24 y 26: inserta ramas en las funciones del puente; no crea tablas — los datos viven en fs_docs):
--  1) ctx: marca amp_adm = Administrador con sesión, que no es la cuenta compartida de Mantenimiento ni una cuenta de solo consulta.
--  2) autorizar: rama para ampliacionesTurno (un documento por ampliación; id = 'amp_' + fecha + usuario + marca de tiempo).
--       Crear:   solo amp_adm; id del documento = n.id; estado VIGENTE; minutos entero entre 1 y 480; motivo de 5 o más caracteres;
--                fechaOperativa con formato AAAA-MM-DD; turno DÍA / INTERMEDIO / NOCHE; creadoUid = quien escribe; creadoEn = hora del servidor.
--       Cambiar: solo amp_adm y solo para ANULAR (VIGENTE → ANULADA) con motivoAnulacion de 5 o más caracteres, anuladoUid = quien escribe,
--                anuladoEn = hora del servidor; usuario, fecha, turno, minutos, motivo y autor originales no cambian.
--       Borrar:  nunca (se anula y queda el registro).
--       Documento 'config' (interruptor «Cierre automático del modo Trabajar», APAGADO si no existe): solo amp_adm lo crea o cambia;
--                cierreActivo booleano, desde vacío o AAAA-MM-DD, actualizadoUid = quien escribe, actualizadoEn = hora del servidor.
--  3) puede_leer: todo usuario con sesión salvo la cuenta compartida de Mantenimiento (cada supervisor necesita leer su tiempo extra).
--
-- NOTA DE APLICACIÓN (leer ANTES de ejecutar):
--  · Usa como ancla la ÚLTIMA marca de ctx: 'he_ver_mant' (glacial_26), si no 'ii_esc' (glacial_24), si no 'ap_alm' (glacial_23).
--    Si un ancla no se encuentra exactamente una vez, la migración se detiene con un mensaje y no cambia nada.
--  · Orden: primero PRUEBAS (mvxjopvnnagqytegtexi); probar con el Administrador (dar y anular tiempo) y con un Supervisor (no puede
--    escribir ampliaciones, sí leerlas); después PRODUCCION (ehtbwmvwoxcdefvlxttu). Comparar la huella de las funciones de los dos proyectos.
--  · Agregar la colección a la herramienta de copia (docs/migracion/copiar-firebase-a-supabase.js) solo si alguna vez se vuelve a copiar
--    desde Firebase: esta colección nace en Supabase.
--  · Se puede ejecutar más de una vez.

do $m$
declare
  def text; cuenta integer; anc text;
  anc_he  constant text := $a$'he_ver_mant', glacial_fs.cap_he_ver(aut, v_mant, v_solo, v_admin, perm, 'mantenimiento'));$a$;
  anc_ii  constant text := $a$'ii_esc',  glacial_fs.cap_ap(aut, v_mant, v_solo, v_admin, rol, perm, 'inventarioInsumos', array['Asistente de Producción']));$a$;
  anc_ap  constant text := $a$'ap_alm',  glacial_fs.cap_ap(aut, v_mant, v_solo, v_admin, rol, perm, 'moduloAlmacen', array[]::text[]));$a$;
  nuevas_marcas constant text := $a$,
   'amp_adm', coalesce(aut and not v_mant and not v_solo and v_admin, false));$a$;
  anc_fin constant text := E'\n end if;\n return false;';
  rama_aut constant text := $r$
 elsif c = 'ampliacionesTurno' then
   declare
     adm boolean := coalesce((k->>'amp_adm')::boolean, false);
   begin
     if accion = 'delete' or not adm then return false; end if;
     -- Interruptor «Cierre automático del modo Trabajar» (documento 'config'): solo el Administrador lo enciende o apaga.
     if d = 'config' then
       return n->>'id' = 'config'
         and jsonb_typeof(n->'cierreActivo') = 'boolean'
         and coalesce(n->>'desde', '') ~ '^([0-9]{4}-[0-9]{2}-[0-9]{2})?$'
         and n->>'actualizadoUid' = u and n->'actualizadoEn' = ahora;
     end if;
     if accion = 'create' then
       return n->>'id' = d
         and n->>'estado' = 'VIGENTE'
         and jsonb_typeof(n->'minutos') = 'number' and (n->>'minutos')::numeric = trunc((n->>'minutos')::numeric)
         and (n->>'minutos')::numeric between 1 and 480
         and coalesce(length(btrim(n->>'motivo')), 0) >= 5
         and coalesce(n->>'fechaOperativa', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         and n->>'turno' in ('DÍA', 'INTERMEDIO', 'NOCHE')
         and coalesce(length(n->>'username'), 0) > 0
         and n->>'creadoUid' = u
         and n->'creadoEn' = ahora;
     end if;
     -- update: solo anular, sin tocar lo original
     return v->>'estado' = 'VIGENTE' and n->>'estado' = 'ANULADA'
       and coalesce(length(btrim(n->>'motivoAnulacion')), 0) >= 5
       and n->>'anuladoUid' = u and n->'anuladoEn' = ahora
       and n->'id' = v->'id' and n->'username' = v->'username' and n->'fechaOperativa' = v->'fechaOperativa'
       and n->'turno' = v->'turno' and n->'minutos' = v->'minutos' and n->'motivo' = v->'motivo'
       and n->'creadoUid' = v->'creadoUid' and n->'creadoEn' = v->'creadoEn';
   end;
$r$;
  anc_leer constant text := E'\n end if;\n return false;';
  rama_leer constant text := E'\n elsif c = ''ampliacionesTurno'' then return aut and not mant;';
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'ctx';
  if position('amp_adm' in def) = 0 then
    anc := case when position(anc_he in def) > 0 then anc_he when position(anc_ii in def) > 0 then anc_ii else anc_ap end;
    cuenta := (length(def) - length(replace(def, anc, ''))) / length(anc);
    if cuenta <> 1 then raise exception 'ctx: punto de inserción encontrado % veces (se esperaba glacial_23, 24 o 26)', cuenta; end if;
    -- se quita el cierre «);» del return y se agrega la marca nueva
    execute replace(def, anc, substr(anc, 1, length(anc) - 2) || nuevas_marcas);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if position('ampliacionesTurno' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_fin, ''))) / length(anc_fin);
    if cuenta <> 1 then raise exception 'autorizar: punto de inserción encontrado % veces', cuenta; end if;
    execute replace(def, anc_fin, rama_aut || anc_fin);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if position('ampliacionesTurno' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_leer, ''))) / length(anc_leer);
    if cuenta <> 1 then raise exception 'puede_leer: punto de inserción encontrado % veces', cuenta; end if;
    execute replace(def, anc_leer, rama_leer || anc_leer);
  end if;
end $m$;
