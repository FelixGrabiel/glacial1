-- GLACIAL · glacial_23 · Reglas de Supabase para el Asistente de Producción y el tareo por documento
-- (equivalentes a los bloques match /tareos/{id} y match /ap…/{…} de firestore.rules.etapa2.txt, 14-10-2026).
--  1) glacial_fs.cap_ap: capacidadAp(clave, rolesDefecto) de las reglas de Firebase.
--  2) ctx: marcas ap_asis (asistenteProduccion), ap_val (validarMermas), ap_fac (gestionarFactores), ap_alm (moduloAlmacen).
--  3) autorizar y puede_leer: ramas para tareos, apInsumos, apFactores, apMovimientos, apSolicitudes, apMermas,
--     apConciliaciones, apCoordinaciones, apParametros y apAuditoria.
-- Las listas (historial, causas, etapas) se miden con glacial_fs.largo(): pueden venir partidas en filas.
-- Se puede ejecutar más de una vez. Orden: primero PRUEBAS (mvxjopvnnagqytegtexi), después PRODUCCION (ehtbwmvwoxcdefvlxttu).

create or replace function glacial_fs.cap_ap(p_aut boolean, p_mant boolean, p_solo boolean, p_admin boolean,
                                             p_rol text, p_perm jsonb, p_clave text, p_roles text[])
returns boolean language sql immutable set search_path = '' as $f$
  select coalesce(p_aut and not p_mant and not p_solo and (
           p_admin
           or p_perm = '"todos"'::jsonb
           or glacial_fs.tiene(p_perm, p_clave)
           or (p_rol = any(p_roles) and not glacial_fs.tiene(p_perm, '-' || p_clave))), false)
$f$;
revoke all on function glacial_fs.cap_ap(boolean, boolean, boolean, boolean, text, jsonb, text, text[]) from public, anon, authenticated;

do $m$
declare
  def text; nuevo text; cuenta integer;
  anc_ctx_ret constant text := $a$'corrige', aut and not v_mant and not v_solo and (v_admin or glacial_fs.tiene(perm,'corregir_paradas')));$a$;
  rep_ctx_ret constant text := $a$'corrige', aut and not v_mant and not v_solo and (v_admin or glacial_fs.tiene(perm,'corregir_paradas')),
   'ap_asis', glacial_fs.cap_ap(aut, v_mant, v_solo, v_admin, rol, perm, 'asistenteProduccion', array['Asistente de Producción']),
   'ap_val',  glacial_fs.cap_ap(aut, v_mant, v_solo, v_admin, rol, perm, 'validarMermas', array['Jefe de Producción','Jefe de Operaciones']),
   'ap_fac',  glacial_fs.cap_ap(aut, v_mant, v_solo, v_admin, rol, perm, 'gestionarFactores', array[]::text[]),
   'ap_alm',  glacial_fs.cap_ap(aut, v_mant, v_solo, v_admin, rol, perm, 'moduloAlmacen', array[]::text[]));$a$;
  anc_fin constant text := E'\n end if;\n return false;';
  rama_aut constant text := $r$
 elsif c = 'tareos' then
   if accion = 'delete' then return false; end if;
   return aut and not mant and not solo and n->>'id' = d;
 elsif c like 'ap%' and c in ('apInsumos','apFactores','apMovimientos','apSolicitudes','apMermas','apConciliaciones','apCoordinaciones','apParametros','apAuditoria') then
   declare
     asis boolean := coalesce((k->>'ap_asis')::boolean, false);
     val  boolean := coalesce((k->>'ap_val')::boolean, false);
     fac  boolean := coalesce((k->>'ap_fac')::boolean, false);
     alm  boolean := coalesce((k->>'ap_alm')::boolean, false);
     autor boolean := n->>'actualizadoUid' = u and n->'actualizadoEn' = ahora;
     ver boolean := case when accion = 'create' then n->'version' = '1'::jsonb
                         else jsonb_typeof(n->'version') = 'number' and jsonb_typeof(v->'version') = 'number'
                              and (n->>'version')::numeric = (v->>'version')::numeric + 1 end;
     hist boolean := glacial_fs.largo(n, meta->'conteos', 'historial') is not null
                     and (accion = 'create' or glacial_fs.largo(n, meta->'conteos', 'historial')
                                               = coalesce(glacial_fs.largo(v, meta->'conteos_antes', 'historial'), -1) + 1);
   begin
     if accion = 'delete' then return false; end if;
     if c = 'apInsumos' then
       return fac and autor and ver and n->>'codigo' = d;
     elsif c = 'apFactores' then
       return fac and autor and ver and n->>'id' = d
         and jsonb_typeof(n->'factor') = 'number' and (n->>'factor')::numeric >= 0
         and jsonb_typeof(n->'cantidadBase') = 'number' and (n->>'cantidadBase')::numeric > 0;
     elsif c = 'apMovimientos' then
       if accion <> 'create' then return false; end if;                 -- libro inmutable
       return n->>'opId' = d and n->>'uid' = u and n->'guardadoEn' = ahora
         and jsonb_typeof(n->'cantidad') = 'number' and (n->>'cantidad')::numeric >= 0
         and n->>'tipo' in ('CONTEO','RECEPCION','DEVOLUCION','TRANSFERENCIA_ENTRADA','TRANSFERENCIA_SALIDA','CONSUMO','ANULACION')
         and case n->>'tipo' when 'CONSUMO' then val when 'ANULACION' then (asis or val) else asis end;
     elsif c = 'apSolicitudes' then
       if accion = 'create' then
         return asis and autor and ver and hist and n->>'id' = d and n->>'creadoUid' = u and n->>'estado' in ('BORRADOR','SOLICITADA');
       end if;
       return autor and ver and hist and n->'id' = v->'id' and n->'creadoUid' = v->'creadoUid'
         and case when n->>'estado' in ('EN_PREPARACION','ENTREGADA_PARCIAL','ENTREGADA')
                  then (alm or (asis and n->'estado' = v->'estado' and n->>'estado' <> 'EN_PREPARACION'))
                  else asis end;
     elsif c = 'apMermas' then
       if accion = 'create' then
         return asis and autor and ver and hist and n->>'id' = d and n->>'estado' = 'PENDIENTE'
           and jsonb_typeof(n->'cantidad') = 'number' and (n->>'cantidad')::numeric > 0;
       end if;
       return val and autor and ver and hist and v->>'estado' = 'PENDIENTE' and n->>'estado' in ('VALIDADA','RECHAZADA')
         and n->>'validadoUid' = u
         and coalesce(n->'cantidad' = v->'cantidad', false) and coalesce(n->'insumo' = v->'insumo', false)
         and coalesce(n->'unidad' = v->'unidad', false) and coalesce(n->'cuadro' = v->'cuadro', false);
     elsif c = 'apConciliaciones' then
       return autor and ver and hist and n->>'id' = d and (
         (asis and n->>'estado' in ('BORRADOR','EN_REVISION') and (accion = 'create' or v->>'estado' is distinct from 'CONFIRMADA'))
         or (val and n->>'estado' in ('CONFIRMADA','BORRADOR')));
     elsif c = 'apCoordinaciones' then
       if accion = 'create' then
         return asis and autor and ver and hist and n->>'id' = d and n->>'estado' = 'ABIERTA'
           and jsonb_typeof(n->'texto') = 'string' and length(n->>'texto') >= 5;
       end if;
       return asis and autor and ver and hist and v->>'estado' = 'ABIERTA' and n->>'estado' = 'CERRADA'
         and coalesce(n->'texto' = v->'texto', false) and coalesce(n->'creadoUid' = v->'creadoUid', false);
     elsif c = 'apParametros' then
       return d = 'merma' and (fac or val) and autor and ver and hist
         and coalesce(glacial_fs.largo(n, meta->'conteos', 'causas') between 1 and 30, false)
         and coalesce(glacial_fs.largo(n, meta->'conteos', 'etapas') between 1 and 30, false);
     elsif c = 'apAuditoria' then
       if accion <> 'create' then return false; end if;
       return aut and not mant and not solo and n->>'uid' = u and n->'en' = ahora;
     end if;
     return false;
   end;
$r$;
  anc_leer constant text := E'\n end if;\n return false;';
  rama_leer constant text := E'\n elsif c = ''tareos'' then return aut;\n elsif c in (''apInsumos'',''apFactores'',''apMovimientos'',''apSolicitudes'',''apMermas'',''apConciliaciones'',''apCoordinaciones'',''apParametros'',''apAuditoria'') then return aut and not mant;';
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'ctx';
  if position('ap_asis' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_ctx_ret, ''))) / length(anc_ctx_ret);
    if cuenta <> 1 then raise exception 'ctx: punto de inserción encontrado % veces (¿falta glacial_22?)', cuenta; end if;
    execute replace(def, anc_ctx_ret, rep_ctx_ret);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'autorizar';
  if position('apMovimientos' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_fin, ''))) / length(anc_fin);
    if cuenta <> 1 then raise exception 'autorizar: punto de inserción encontrado % veces', cuenta; end if;
    execute replace(def, anc_fin, rama_aut || anc_fin);
  end if;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'glacial_fs' and p.proname = 'puede_leer';
  if position('apMovimientos' in def) = 0 then
    cuenta := (length(def) - length(replace(def, anc_leer, ''))) / length(anc_leer);
    if cuenta <> 1 then raise exception 'puede_leer: punto de inserción encontrado % veces', cuenta; end if;
    execute replace(def, anc_leer, rama_leer || anc_leer);
  end if;
end $m$;
