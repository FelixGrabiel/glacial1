/* =============================================================
   GLACIAL · MANTENIMIENTO — CUENTA COMPARTIDA CON IDENTIFICACIÓN INDIVIDUAL
   -------------------------------------------------------------
   FASE A (este archivo): ROL `mantenimiento_compartido`
   - Una única cuenta de Firebase Authentication, usada por los técnicos
     senior de Mantenimiento desde varios teléfonos.
   - Solo puede entrar a:
       · Tareo de Mantenimiento (SOLO LECTURA)
       · Producción actual (estado de las líneas, SOLO LECTURA)
     Ningún otro módulo aparece en el menú.
   - Por defecto solo VE (sin controles Detener/Pausa/Reanudar). Los permisos
     base se suman a los que Administración asigne en Gestión de Usuarios.
   - Los controles de seguridad no son solo visuales: tienePermiso(),
     tareoAutorizadoEscribir(), quienControla() y las funciones guardar*
     lo validan; las reglas de Firestore (firestore.rules.etapa2.txt)
     refuerzan la lectura/escritura en el servidor.

   FASES POSTERIORES (B: técnico + PIN, C: acciones sobre líneas,
   D: administración y bitácora) se agregarán a este mismo archivo.

   Cargar DESPUÉS de 23-gerente-solo-lecutra.js y 10-usuarios.js;
   ANTES de 12-init.js.
   ============================================================= */
(function instalarMantenimientoCompartido(){
  'use strict';

  const ROL='mantenimiento_compartido';

  /* Permisos efectivos del rol (fijos). */
  const PERMISOS=[
    'ver_tareo_mantenimiento',   // Tareo de Mantenimiento (solo consulta)
    'produccionActual',          // Estado de las líneas
    'control_operativo_lineas'   // FASE C: Detener / Pausa / Intervención terminada / Reanudar (con técnico identificado por PIN)
  ];

  window.ROL_MANT_COMPARTIDO=ROL;
  window.PERMISOS_MANT_COMPARTIDO=PERMISOS;
  window.esMantCompartido=function(usuario){
    const u=usuario||(typeof state!=='undefined'?state.user:null);
    return !!u&&String(u.rol||'').trim()===ROL;
  };

  /* 1-2) Permisos POR DEFECTO: solo ver. El Administrador puede añadir más
     (p. ej. control_operativo_lineas para Detener/Pausa/Reanudar, o
     gestionar_tareo_mantenimiento). Sin permisos extra, la cuenta no edita
     nada y no ve controles de línea (quienControla devuelve ''). */
  if(typeof normalizarPermisosUsuario==='function'){
    const anterior=normalizarPermisosUsuario;
    normalizarPermisosUsuario=function(usuario){
      if(!window.esMantCompartido(usuario))return anterior.apply(this,arguments);
      const extra=Array.isArray(usuario.permisos)
        ? usuario.permisos.filter(p=>p!=='gestionarPersonal'&&p!=='administracion')
        : [];
      return [...new Set([...PERMISOS,...extra])];
    };
  }

  /* 3) Alta de la cuenta: al elegir el rol, solo se marcan sus permisos. */
  if(typeof cambiarRolNuevoUsuario==='function'){
    const anterior=cambiarRolNuevoUsuario;
    cambiarRolNuevoUsuario=function(){
      const r=anterior.apply(this,arguments);
      if(document.getElementById('nu-rol')?.value!==ROL)return r;
      document.querySelectorAll('.permiso-check').forEach(c=>{
        c.checked=PERMISOS.includes(c.value);
        c.disabled=false;   // el Administrador puede marcar más permisos
      });
      const todos=document.getElementById('nu-permisos-todos');
      if(todos){todos.checked=false;todos.disabled=false;}
      return r;
    };
    window.cambiarRolNuevoUsuario=cambiarRolNuevoUsuario;
  }

  /* 4) Sin Inicio ni accesos ajenos: protege también las llamadas manuales. */
  if(typeof abrirCentroPerfil==='function'){
    const anterior=abrirCentroPerfil;
    abrirCentroPerfil=function(){
      if(window.esMantCompartido())return;
      return anterior.apply(this,arguments);
    };
    window.abrirCentroPerfil=abrirCentroPerfil;
  }

  /* 5) Indicador permanente SOLO LECTURA en la barra superior (visible en móvil). */
  function pintarIndicador(){
    const contenedor=document.querySelector('.topbar-title');
    if(!contenedor)return;
    let badge=document.getElementById('mant-solo-lectura');
    if(!window.esMantCompartido()){badge?.remove();return;}
    // Fase C: opera líneas (con PIN) pero el tareo sigue siendo de solo lectura.
    const edita=typeof tienePermiso==='function'&&tienePermiso('gestionar_tareo_mantenimiento');
    if(edita){badge?.remove();return;}
    if(!badge){
      badge=document.createElement('span');
      badge.id='mant-solo-lectura';
      badge.textContent='TAREO SOLO LECTURA · CONTROL DE LÍNEAS CON PIN';
      badge.style.cssText='display:inline-block;margin-top:2px;padding:1px 8px;border-radius:999px;background:#fff1d6;border:1px solid #f0c36a;color:#8a5a00;font-size:10px;font-weight:800;letter-spacing:.04em;';
      contenedor.appendChild(badge);
    }
  }
  if(typeof renderSidebar==='function'){
    const anterior=renderSidebar;
    renderSidebar=function(){
      const r=anterior.apply(this,arguments);
      try{pintarIndicador();}catch(_){/* no crítico */}
      return r;
    };
    window.renderSidebar=renderSidebar;
  }
})();
