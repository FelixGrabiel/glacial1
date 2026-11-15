/* =============================================================
   GLACIAL · CALIDAD · PERMISOS (Gestión de usuarios › área «Calidad»)
   -------------------------------------------------------------
   · calidadVer      VER Calidad (Validación de lotes). Por defecto: Administrador, Asistente de Producción y Jefe de Operaciones. «-calidadVer» lo quita.
   · calidadRevisar  REVISAR: marcar las validaciones como revisadas. Por defecto: Administrador y Asistente de Producción; los roles de solo consulta no
                     (aunque se les marque el permiso), igual que en el Inventario de insumos.
   Nunca la cuenta compartida de Mantenimiento; en modo «Visualizar» no se escribe.
   El servidor exige lo mismo (glacial_55: marcas cal_ver / cal_esc de glacial_fs.ctx). Cargar ANTES de 99-validacion-lotes.js.
   ============================================================= */
(function(raiz){
  'use strict';
  const VER='calidadVer',REVISAR='calidadRevisar';
  const ROLES_VER_DEFECTO=['Asistente de Producción','Jefe de Operaciones'];
  const ROLES_REVISAR_DEFECTO=['Asistente de Producción'];
  const ROLES_SOLO_CONSULTA=['Jefe de Producción','Jefe de Operaciones','Jefatura','Gerente General','Gerente'];
  const lista=u=>Array.isArray(u&&u.permisos)?u.permisos:[];
  const esAdmin=u=>!!u&&(String(u.rol||'').trim()==='Administrador'||u.permisos==='todos');
  /** u: usuario {rol, permisos}; vista: true si está en modo «Visualizar». */
  function puedeVer(u,vista){
    if(!u)return false;
    const rol=String(u.rol||'').trim();
    if(rol==='mantenimiento_compartido')return false;
    if(esAdmin(u))return true;
    const p=lista(u);
    if(p.includes('-'+VER))return false;
    if(p.includes(VER))return true;
    if(vista)return false;
    return ROLES_VER_DEFECTO.includes(rol);
  }
  function puedeRevisar(u,vista){
    if(!puedeVer(u,vista)||vista)return false;
    const rol=String(u.rol||'').trim();
    if(ROLES_SOLO_CONSULTA.includes(rol))return false;
    if(esAdmin(u))return true;
    const p=lista(u);
    if(p.includes('-'+REVISAR))return false;
    return p.includes(REVISAR)||ROLES_REVISAR_DEFECTO.includes(rol);
  }
  const NUCLEO={VER,REVISAR,ROLES_VER_DEFECTO,ROLES_REVISAR_DEFECTO,ROLES_SOLO_CONSULTA,puedeVer,puedeRevisar};
  if(typeof module!=='undefined'&&module.exports)module.exports=NUCLEO;
  if(typeof window==='undefined')return;

  /* Catálogo de Gestión de usuarios: área propia «Calidad». */
  if(typeof PERMISOS_APP!=='undefined'&&Array.isArray(PERMISOS_APP)){
    if(!PERMISOS_APP.some(p=>p.key===VER))PERMISOS_APP.push({key:VER,area:'calidad',label:'VER Calidad (Validación de lotes que sube el bot de WhatsApp)'});
    if(!PERMISOS_APP.some(p=>p.key===REVISAR))PERMISOS_APP.push({key:REVISAR,area:'calidad',label:'REVISAR Calidad (marcar como revisadas las validaciones de lotes)'});
  }
  if(typeof AREAS_PERMISOS!=='undefined'&&Array.isArray(AREAS_PERMISOS)&&!AREAS_PERMISOS.some(a=>a.clave==='calidad')){
    const i=AREAS_PERMISOS.findIndex(a=>a.clave==='almacen');
    AREAS_PERMISOS.splice(i<0?AREAS_PERMISOS.length:i+1,0,{clave:'calidad',titulo:'Calidad'});
  }
  const vistaActiva=()=>!!(window.glacialVista&&typeof window.glacialVista.activo==='function'&&window.glacialVista.activo());
  const yo=()=>typeof state!=='undefined'?state.user:null;
  if(typeof tienePermiso==='function'){
    const anterior=tienePermiso;
    tienePermiso=function(permiso){
      if(permiso===VER)return puedeVer(yo(),vistaActiva());
      if(permiso===REVISAR)return puedeRevisar(yo(),vistaActiva());
      return anterior.apply(this,arguments);
    };
    window.tienePermiso=tienePermiso;
  }
  window.glacialCalidadPermisos={puedeVer:()=>puedeVer(yo(),vistaActiva()),puedeRevisar:()=>puedeRevisar(yo(),vistaActiva()),VER,REVISAR};
})(typeof window!=='undefined'?window:globalThis);
