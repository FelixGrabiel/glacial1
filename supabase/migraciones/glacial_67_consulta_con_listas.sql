-- GLACIAL · glacial_67 · Las CONSULTAS de colección devuelven también las listas partidas (personal por día, personal quitado…)      *** PRUEBAS: aplicada (23/11/2026) · PRODUCCIÓN: pendiente ***
--
-- Por qué: una lista de objetos con identificador único (por ejemplo tareo.personalPorDia o tareo.personalExcluido) NO se guarda dentro del documento
-- sino en public.fs_items («lista partida»). public.fs_leer (lectura de UN documento) la devuelve completa, pero public.fs_consulta (lectura de una
-- COLECCIÓN: db.collection('tareos').onSnapshot) devolvía solo fs_docs.datos, SIN esas listas. El Tareo se alimenta de esa consulta, así que:
--   · el personal por día que se agregaba «se borraba» al llegar la actualización de la nube (en la base seguía guardado);
--   · las bajas «ya no trabaja aquí» (personalExcluido) no se veían y la persona volvía a aparecer en el personal.
-- Qué hace: public.fs_consulta devuelve, en cada documento, sus listas partidas (las filas vivas de fs_items, en su orden) mezcladas sobre datos, como lo hace
-- fs_leer. Para no abrir nada nuevo, la lectura de las listas usa una función auxiliar glacial_fs.listas_de (SECURITY DEFINER) que antes comprueba el mismo
-- permiso de lectura (glacial_fs.puede_leer) y solo se llama con documentos que la consulta ya devolvió al usuario. Cambio por ancla de texto: si el ancla no
-- aparece exactamente una vez, se detiene sin cambiar nada. Se puede ejecutar más de una vez.
-- Comprobado en PRUEBAS como usuario autenticado: la lista «historial» de hieloReportes (partida) llega como arreglo en la consulta y no estaba en fs_docs.datos.
-- No cambia el formato guardado ni la escritura. Orden: PRUEBAS primero; PRODUCCIÓN solo con la aprobación del dueño.

create or replace function glacial_fs.listas_de(p_c text, p_d text, p_datos jsonb)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $f$
  select case when glacial_fs.puede_leer(glacial_fs.ctx(), p_c, p_d, p_datos) then
    coalesce((select jsonb_object_agg(x.campo, x.lista)
                from (select i.campo, jsonb_agg(i.datos order by i.pos, i.id) as lista
                        from public.fs_items i
                       where i.coleccion = p_c and i.doc = p_d and i.eliminado_en is null
                       group by i.campo) x), '{}'::jsonb)
  else '{}'::jsonb end
$f$;

revoke all on function glacial_fs.listas_de(text, text, jsonb) from public;
grant execute on function glacial_fs.listas_de(text, text, jsonb) to authenticated;

do $m$
declare
  def text; cuenta integer;
  anc constant text := $q$''datos'', s.datos, ''version'', s.version$q$;
  nue constant text := $q$''datos'', s.datos || glacial_fs.listas_de($1, s.id, s.datos), ''version'', s.version$q$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fs_consulta';
  if def is null then raise exception 'public.fs_consulta no existe'; end if;
  if position('glacial_fs.listas_de' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc, ''))) / length(anc);
    if cuenta <> 1 then raise exception 'fs_consulta: ancla encontrada % veces', cuenta; end if;
    execute replace(def, anc, nue);
  end if;
end $m$;
