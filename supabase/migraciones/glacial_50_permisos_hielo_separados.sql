-- GLACIAL · glacial_50 · HIELO: permisos propios, separados de los de Agua                              *** APLICADA en PRUEBAS (10/11/2026) · PRODUCCIÓN: pendiente de aprobación ***
--
-- Por qué: registrar y programar Hielo dependían de los mismos permisos de Agua («paletas» y «planificacion», vía glacial_fs.ctx()
-- → opera/planifica). Quien tenía «paletas» o «planificacion» de Agua podía escribir en Hielo aunque el Administrador no se lo
-- hubiera dado, y quitarle el permiso de Agua a alguien también le quitaba Hielo sin querer.
-- Qué hace: agrega a glacial_fs.ctx() dos marcas nuevas, independientes de las de Agua:
--   · hielo       — registrar reportes de Hielo (Nuevo registro, Avance y cierre). Por defecto: Administrador y los mismos roles de
--                    planta que ya tenían acceso (Jefe de Producción, Jefe de Operaciones, Supervisor, Supervisor de Producción),
--                    salvo que el Administrador les quite el permiso «hielo» (marcándolo con «-hielo», como ya se hace con «-planificacion»).
--                    También lo da el permiso «hielo» del catálogo de Usuarios, a cualquier rol.
--   · hielo_prog  — programar Hielo y editar sus listas (Configuración). Mismo criterio con el permiso «programarHielo» / «-programarHielo».
-- Cambia glacial_fs.autorizar(): hieloReportes pasa de exigir «opera» (Agua) a exigir «hielo»; hieloProgramacion pasa de exigir
-- «planifica» (Agua) a exigir «hielo_prog». hieloParametros (Configuración de Hielo) no cambia: sigue siendo Administrador o Jefatura.
-- No toca ninguna tabla ni colección de Agua. Se puede ejecutar más de una vez. Orden: PRUEBAS primero; PRODUCCIÓN con la aprobación del dueño.

do $m$
declare
  def text; cuenta integer;
  anc_decl constant text := ' v_opera boolean; v_resumen boolean; v_planifica boolean; v_distribuye boolean; v_ecog boolean; v_ecov boolean; v_corrige boolean;';
  nue_decl constant text := ' v_opera boolean; v_resumen boolean; v_planifica boolean; v_distribuye boolean; v_ecog boolean; v_ecov boolean; v_corrige boolean; v_hielo boolean; v_hielo_prog boolean;  -- glacial_50';
  anc_calc constant text := E' v_distribuye := aut and not v_mant and not v_solo and (v_admin or glacial_fs.tiene(perm,\'distribuirPersonal\')';
  nue_calc constant text := E' v_hielo := aut and not v_mant and not v_solo and (v_admin or glacial_fs.tiene(perm,\'hielo\')\n              or (rol in (\'Jefe de Producción\',\'Jefe de Operaciones\',\'Supervisor\',\'Supervisor de Producción\') and not glacial_fs.tiene(perm,\'-hielo\')));  -- glacial_50\n v_hielo_prog := aut and not v_mant and not v_solo and (v_admin or glacial_fs.tiene(perm,\'programarHielo\')\n              or (rol in (\'Jefe de Producción\',\'Planificación\',\'Ventas y Planificación\') and not glacial_fs.tiene(perm,\'-programarHielo\')));  -- glacial_50\n v_distribuye := aut and not v_mant and not v_solo and (v_admin or glacial_fs.tiene(perm,\'distribuirPersonal\')';
  anc_ret constant text := E'\'planifica\',v_planifica,\'distribuye\',v_distribuye,';
  nue_ret constant text := E'\'planifica\',v_planifica,\'hielo\',v_hielo,\'hielo_prog\',v_hielo_prog,\'distribuye\',v_distribuye,';
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'ctx';
  if def is null then raise exception 'glacial_fs.ctx no existe'; end if;
  if position('glacial_50' in def) = 0 then
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
       return coalesce((k->>'opera')::boolean, false) and n->>'estado' in ('EN_REGISTRO','FINALIZADO');
     elsif c = 'hieloProgramacion' then
       return adm or coalesce((k->>'planifica')::boolean, false);$q$;
  nue constant text := $q$     if v is not null and v->>'estado' = 'FINALIZADO' and not adm then return false; end if;
       return coalesce((k->>'hielo')::boolean, false) and n->>'estado' in ('EN_REGISTRO','FINALIZADO');  -- glacial_50
     elsif c = 'hieloProgramacion' then
       return adm or coalesce((k->>'hielo_prog')::boolean, false);  -- glacial_50$q$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if def is null then raise exception 'glacial_fs.autorizar no existe'; end if;
  if position('glacial_50' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc, ''))) / length(anc);
    if cuenta <> 1 then raise exception 'autorizar: ancla de Hielo encontrada % veces', cuenta; end if;
    execute replace(def, anc, nue);
  end if;
end $a$;
