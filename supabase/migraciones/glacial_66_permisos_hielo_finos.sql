-- GLACIAL · glacial_66 · HIELO: permisos finos (cerrar, reabrir y configurar) que el Administrador da o quita      *** PRUEBAS Y PRODUCCIÓN: aplicada (21/11/2026) ***
--
-- Por qué: hasta ahora Hielo tenía solo dos permisos en el servidor («hielo» = registrar y «programarHielo»); cerrar un reporte, reabrirlo (solo Administrador) y configurar
-- Hielo (solo Administrador o jefaturas, por rol) no se podían dar ni quitar a una persona. Ahora el Administrador lo decide en Gestión de usuarios (área Hielo).
-- Qué hace (mismo método que glacial_50: inserta en glacial_fs.ctx() y glacial_fs.autorizar() por «anclas» de texto; si un ancla no aparece exactamente una vez, se detiene
-- y no cambia nada):
--  1) ctx() agrega tres marcas, con los mismos valores de siempre por defecto para que nadie pierda acceso:
--       · hielo_cerrar   — finalizar un reporte: quien puede registrar (hielo), salvo que se le haya quitado «-hieloCerrar».
--       · hielo_reabrir  — reabrir un reporte finalizado: Administrador (como hasta ahora) o quien tenga el permiso «hieloReabrir» y pueda registrar.
--       · hielo_cfg      — Configuración de Hielo: Administrador, quien tenga «configurarHielo», o las jefaturas de siempre (Jefe de Producción, Jefe de Operaciones, Jefatura,
--                          Gerente General, Gerente) salvo que se les haya quitado «-configurarHielo».
--  2) autorizar():
--       · un reporte FINALIZADO solo lo cambia el Administrador o quien tenga hielo_reabrir (antes: solo el Administrador);
--       · pasar un reporte a FINALIZADO exige hielo_cerrar;
--       · hieloParametros/config exige hielo_cfg (antes: Administrador o jefaturas).
-- «Ver Hielo» y «Descargar y compartir» se aplican en la pantalla (los datos de Hielo los puede leer cualquier usuario con sesión, como hasta ahora).
-- No toca ninguna tabla ni colección de Agua. Se puede ejecutar más de una vez. Orden: PRUEBAS primero; PRODUCCIÓN solo con la aprobación del dueño.

do $m$
declare
  def text; cuenta integer;
  anc_decl constant text := ' v_hielo boolean; v_hielo_prog boolean;  -- glacial_50';
  nue_decl constant text := ' v_hielo boolean; v_hielo_prog boolean;  -- glacial_50' || E'\n        v_hielo_cerrar boolean; v_hielo_reabrir boolean; v_hielo_cfg boolean;  -- glacial_66';
  anc_calc constant text := E' v_distribuye := aut and not v_mant and not v_solo and (v_admin or glacial_fs.tiene(perm,\'distribuirPersonal\')';
  nue_calc constant text := E' v_hielo_cerrar := v_hielo and not glacial_fs.tiene(perm,\'-hieloCerrar\');  -- glacial_66\n'
    || E' v_hielo_reabrir := v_hielo and (v_admin or glacial_fs.tiene(perm,\'hieloReabrir\'));  -- glacial_66\n'
    || E' v_hielo_cfg := aut and not v_mant and not v_solo and (v_admin or glacial_fs.tiene(perm,\'configurarHielo\')\n              or (v_jef and not glacial_fs.tiene(perm,\'-configurarHielo\')));  -- glacial_66\n'
    || anc_calc;
  anc_ret constant text := E'\'hielo\',v_hielo,\'hielo_prog\',v_hielo_prog,';
  nue_ret constant text := E'\'hielo\',v_hielo,\'hielo_prog\',v_hielo_prog,\'hielo_cerrar\',v_hielo_cerrar,\'hielo_reabrir\',v_hielo_reabrir,\'hielo_cfg\',v_hielo_cfg,';
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'ctx';
  if def is null then raise exception 'glacial_fs.ctx no existe'; end if;
  if position('glacial_66' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_decl, ''))) / length(anc_decl);
    if cuenta <> 1 then raise exception 'ctx: ancla de declaración encontrada % veces', cuenta; end if;
    def := replace(def, anc_decl, nue_decl);
    cuenta := (length(def) - length(replace(def, anc_calc, ''))) / length(anc_calc);
    if cuenta <> 1 then raise exception 'ctx: ancla de cálculo encontrada % veces', cuenta; end if;
    def := replace(def, anc_calc, nue_calc);
    cuenta := (length(def) - length(replace(def, anc_ret, ''))) / length(anc_ret);
    if cuenta <> 1 then raise exception 'ctx: ancla del resultado encontrada % veces', cuenta; end if;
    def := replace(def, anc_ret, nue_ret);
    execute def;
  end if;
end $m$;

do $a$
declare
  def text; cuenta integer;
  anc constant text := $q$     if v is not null and v->>'estado' = 'FINALIZADO' and not adm then return false; end if;
       return coalesce((k->>'hielo')::boolean, false) and n->>'estado' in ('EN_REGISTRO','FINALIZADO');  -- glacial_50
     elsif c = 'hieloProgramacion' then
       return adm or coalesce((k->>'hielo_prog')::boolean, false);  -- glacial_50
     else
       return d = 'config' and (adm or coalesce((k->>'jef')::boolean, false));$q$;
  nue constant text := $q$     if v is not null and v->>'estado' = 'FINALIZADO' and not (adm or coalesce((k->>'hielo_reabrir')::boolean, false)) then return false; end if;  -- glacial_66
       if n->>'estado' = 'FINALIZADO' and (v is null or v->>'estado' is distinct from 'FINALIZADO') and not coalesce((k->>'hielo_cerrar')::boolean, false) then return false; end if;  -- glacial_66
       return coalesce((k->>'hielo')::boolean, false) and n->>'estado' in ('EN_REGISTRO','FINALIZADO');  -- glacial_50
     elsif c = 'hieloProgramacion' then
       return adm or coalesce((k->>'hielo_prog')::boolean, false);  -- glacial_50
     else
       return d = 'config' and coalesce((k->>'hielo_cfg')::boolean, false);  -- glacial_66$q$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if def is null then raise exception 'glacial_fs.autorizar no existe'; end if;
  if position('glacial_66' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc, ''))) / length(anc);
    if cuenta <> 1 then raise exception 'autorizar: ancla de Hielo encontrada % veces', cuenta; end if;
    execute replace(def, anc, nue);
  end if;
end $a$;
