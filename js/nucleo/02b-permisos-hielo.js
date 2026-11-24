/* =============================================================
   GLACIAL · PERMISOS DE HIELO (21/11/2026)
   -------------------------------------------------------------
   Una sola definición de «quién puede hacer qué» en Hielo, para la pantalla de Hielo, la gestión de usuarios y el Panel de Administración.
   El Administrador (y quien tiene «todos los permisos») puede TODO. Para los demás, cada permiso se decide así:
     1) si tiene «-permiso» (quitado a propósito por el Administrador) → no;
     2) si tiene «permiso» (dado por el Administrador) → sí;
     3) si no, el valor por defecto de su rol (los mismos roles de siempre, para que nadie pierda acceso por este cambio).
   El servidor (glacial_66) aplica las mismas reglas a lo que escribe en Hielo; los permisos de solo mirar (ver, descargar) se aplican en la pantalla.
   Funciona en la página y en las pruebas de Node.
   ============================================================= */
(function(raiz){
  'use strict';
  /* clave: {etiqueta, roles: roles que lo tienen por defecto | null = todos los roles | 'sigue:clave' = el mismo valor que otra clave, servidor: si el servidor lo exige} */
  const ROLES_REGISTRAN=['Jefe de Producción','Jefe de Operaciones','Supervisor','Supervisor de Producción'];
  const ROLES_PROGRAMAN=['Jefe de Producción','Planificación','Ventas y Planificación'];
  const ROLES_CONFIGURAN=['Jefe de Producción','Jefe de Operaciones','Jefatura','Gerente General','Gerente'];
  const PERMISOS={
    hieloVer:{etiqueta:'Ver Hielo (Inicio, Historial y Reporte diario)',roles:null,servidor:false},
    hielo:{etiqueta:'Registrar Hielo (Nuevo registro y guardar el avance del turno)',roles:ROLES_REGISTRAN,servidor:true},
    hieloCerrar:{etiqueta:'Finalizar (cerrar) el reporte de un turno de Hielo',roles:'sigue:hielo',servidor:true},
    hieloReabrir:{etiqueta:'Reabrir un reporte de Hielo finalizado',roles:[],servidor:true},
    programarHielo:{etiqueta:'Programar Hielo (Programación)',roles:ROLES_PROGRAMAN,servidor:true},
    configurarHielo:{etiqueta:'Configurar Hielo (kilos por bolsa, capacidad, marcas, equipos y listas)',roles:ROLES_CONFIGURAN,servidor:true},
    hieloExportar:{etiqueta:'Descargar y compartir reportes de Hielo (Excel, imagen, WhatsApp)',roles:null,servidor:false}
  };
  const CLAVES=Object.keys(PERMISOS);
  const rolDe=u=>String((u&&u.rol)||'').trim();
  const arreglo=u=>Array.isArray(u&&u.permisos)?u.permisos:[];
  const esTodo=u=>!!u&&(rolDe(u)==='Administrador'||u.permisos==='todos');
  /** ¿Este usuario puede hacer esto en Hielo? (valor efectivo: Administrador, permiso dado, permiso quitado o valor de su rol). */
  function permitido(u,clave){
    const d=PERMISOS[clave];if(!u||!d)return false;
    if(esTodo(u))return true;
    if(rolDe(u)==='mantenimiento_compartido')return false;
    const a=arreglo(u);
    if(a.includes('-'+clave))return false;
    if(a.includes(clave))return true;
    return porDefecto(rolDe(u),clave,u);
  }
  /** Valor por defecto de un rol (sin permisos propios). Para «sigue:otra» se mira esa otra clave con los permisos del usuario, si se pasa. */
  function porDefecto(rol,clave,u){
    const d=PERMISOS[clave];if(!d)return false;
    if(d.roles===null)return rol!=='mantenimiento_compartido';
    if(typeof d.roles==='string'&&d.roles.indexOf('sigue:')===0)return permitido(u||{rol,permisos:[]},d.roles.slice(6));
    return d.roles.includes(rol);
  }
  /** Claves de Hielo que el usuario tiene (valor efectivo), para marcar las casillas en la pantalla de usuarios. */
  const efectivas=u=>CLAVES.filter(k=>permitido(u,k));
  const sigueDe=k=>{const d=PERMISOS[k];return d&&typeof d.roles==='string'&&d.roles.indexOf('sigue:')===0?d.roles.slice(6):'';};
  /**
   * Convierte las casillas marcadas en lo que se guarda en el usuario. El resto de sus permisos queda igual. Para cada permiso de Hielo:
   *   · marcado → se guarda «permiso» (salvo «Finalizar», que sigue a «Registrar» y ya queda implícito si ambos están marcados);
   *   · desmarcado y su rol lo trae por defecto → se guarda «-permiso» (quitado a propósito);
   *   · desmarcado y su rol no lo trae → no se guarda nada.
   * rol: el rol del usuario · marcadas: todas las claves marcadas en la pantalla (de Hielo y de las demás áreas).
   */
  function aplicar(rol,marcadas){
    const m=new Set((marcadas||[]).filter(k=>CLAVES.includes(k)));
    const salida=(marcadas||[]).filter(k=>k&&!CLAVES.includes(k)&&!(k[0]==='-'&&CLAVES.includes(k.slice(1))));
    CLAVES.forEach(k=>{
      const sigue=sigueDe(k),sinEntrada=sigue?m.has(sigue):porDefecto(rol,k,null);        // valor que tendría si no se guardara nada
      if(m.has(k)){if(!(sigue&&sinEntrada))salida.push(k);}
      else if(sinEntrada)salida.push('-'+k);
    });
    return salida;
  }
  const API={PERMISOS,CLAVES,permitido,porDefecto,efectivas,aplicar,esTodo};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  if(raiz)raiz.glacialPermisosHielo=API;
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:null));
