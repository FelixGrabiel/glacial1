/* =============================================================
   GLACIAL · FORMULARIO «MODO VISUALIZACIÓN GENERAL» (Gestionar usuarios → Editar permisos)
   -------------------------------------------------------------
   Agrega al modal de permisos existente la sección del modo (interruptor, módulos, líneas, descargas) y reemplaza
   guardarPermisosUsuario para guardarlo junto con los permisos operativos, que NO se borran: mientras el modo esté activo
   quedan bloqueados (casillas deshabilitadas) y vuelven a aplicarse al desactivarlo.
   Solo lo configura un Administrador (las reglas de Firestore solo le dejan escribir users/perfiles) y nunca sobre su
   propia cuenta. Cada cambio queda en el historial del propio usuario (modoVisualizacionHistorial).
   Depende de 23b-modo-visualizacion.js (catálogo de módulos y normalización).
   ============================================================= */
(function instalarFormularioVisualizacion(){
  'use strict';

  const V = () => window.glacialVista;
  const esc = v => (typeof escaparHtml === 'function' ? escaparHtml(v) : String(v == null ? '' : v));

  function puedeConfigurar(){
    return !!state.user && String(state.user.rol || '').trim() === 'Administrador' && puedeGestionarPersonal();
  }

  function estilos(){
    if(document.getElementById('vista-form-css')) return;
    const s = document.createElement('style'); s.id = 'vista-form-css';
    s.textContent =
      '.vista-form{border:1px solid #cfe0f2;background:#f3f8fe;border-radius:12px;padding:16px;margin-bottom:16px}' +
      '.vista-form-cab{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}' +
      '.vista-form-cab h4{margin:0;display:flex;align-items:center;gap:10px;font-size:15px;letter-spacing:.03em;color:#10265f}' +
      '.vista-form-cab h4 svg{width:24px;height:24px;fill:none;stroke:#10265f;stroke-width:2}' +
      '.vista-sw{display:inline-flex;align-items:center;gap:10px;font-weight:700;color:#10265f;cursor:pointer}' +
      '.vista-sw input{position:absolute;opacity:0;width:1px;height:1px}' +
      '.vista-sw i{position:relative;width:48px;height:28px;border-radius:999px;background:#b9c5d3;transition:.2s}' +
      '.vista-sw i:after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:.2s}' +
      '.vista-sw input:checked+i{background:#0b72e0}.vista-sw input:checked+i:after{left:23px}' +
      '.vista-sw input:focus-visible+i{outline:3px solid #7db4f0;outline-offset:2px}.vista-sw input:disabled+i{opacity:.55}' +
      '.vista-aviso-info{display:flex;gap:10px;align-items:center;margin:12px 0 6px;padding:10px 14px;border-radius:8px;background:#dcebfb;color:#0b3a73;font-weight:600}' +
      '.vista-form .vista-sub{color:#53657a;margin:0 0 12px;font-size:13px}' +
      '.vista-form-fila{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0}.vista-form-fila h4{margin:0;font-size:16px;color:#10265f}' +
      '.vista-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}' +
      '.vista-caja{border:1px solid #d7e3ef;background:#fff;border-radius:10px;padding:12px 14px;margin-bottom:12px}' +
      '.vista-caja h5{margin:0 0 8px;font-size:13px;letter-spacing:.04em;color:#10265f}' +
      '.vista-caja label{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:13px;cursor:pointer}' +
      '.vista-caja label small{color:#8a5a00}' +
      '.vista-lineas{display:flex;flex-wrap:wrap;gap:6px 22px}.vista-lineas label{margin:4px 0}' +
      '.vista-pie{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:#53657a;font-size:12px;margin-top:4px}' +
      '.vista-form.vista-off .vista-detalle{opacity:.55}' +
      '.vista-bloqueo{margin:8px 0 0;padding:8px 12px;border-radius:8px;background:#fff8e1;border:1px solid #f0d98c;font-size:12px}' +
      '@media(max-width:760px){.vista-cols{grid-template-columns:1fr}}';
    document.head.appendChild(s);
  }

  function cajasPorArea(c){
    const mods = V().MODULOS;
    return V().AREAS.map(a => {
      const lista = mods.filter(m => m.area === a.clave);
      return '<div class="vista-caja"><h5>' + esc(a.titulo) + '</h5>' + lista.map(m =>
        '<label><input type="checkbox" class="vista-mod" value="' + m.clave + '"' + (m.restringido ? ' data-restringido="1"' : '') +
        (c.modulos.includes(m.clave) ? ' checked' : '') + '>' + esc(m.etq) +
        (m.restringido ? ' <small>(se marca aparte)</small>' : '') + '</label>').join('') + '</div>';
    });
  }

  function seccionHtml(usuario){
    const c = V().normalizarConfig(usuario.modoVisualizacion);
    const esAdmin = String(usuario.rol || '').trim() === 'Administrador' || usuario.username === 'admin';
    const propio = state.user && String(state.user.username).toLowerCase() === String(usuario.username).toLowerCase();
    const puede = puedeConfigurar() && !esAdmin && !propio;
    const cajas = cajasPorArea(c);
    const motivo = esAdmin ? 'El modo visualización no se aplica a cuentas de Administrador.'
      : propio ? 'No puedes cambiar el modo de visualización de tu propia cuenta.'
      : !puedeConfigurar() ? 'Solo un Administrador puede configurar este modo.' : '';
    return '<section class="vista-form' + (c.activo ? '' : ' vista-off') + '" id="vista-form" data-vista-conservar="1">' +
      '<div class="vista-form-cab"><h4><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/></svg>MODO VISUALIZACIÓN GENERAL</h4>' +
      '<label class="vista-sw"><input type="checkbox" id="vista-activo" role="switch"' + (c.activo ? ' checked' : '') + (puede ? '' : ' disabled') +
      ' onchange="vistaAlternarModo()"><i></i><span id="vista-estado">' + (c.activo ? 'Activado' : 'Desactivado') + '</span></label></div>' +
      '<div class="vista-aviso-info"><span aria-hidden="true">ⓘ</span>Este usuario solo podrá consultar. No podrá crear, editar, eliminar ni cambiar estados.</div>' +
      '<p class="vista-sub">El administrador selecciona qué puede visualizar.</p>' +
      (motivo ? '<div class="vista-bloqueo">' + esc(motivo) + '</div>' : '') +
      '<div class="vista-detalle" id="vista-detalle"><div class="vista-form-fila"><h4>Módulos que puede visualizar</h4>' +
      (puede ? '<button type="button" class="btn btn-ghost btn-sm" onclick="vistaMarcarTodos()">Marcar / quitar todos</button>' : '') + '</div>' +
      '<div class="vista-cols"><div>' + cajas[0] + '</div><div>' + (cajas[1] || '') + (cajas[2] || '') + '</div></div>' +
      '<div class="vista-caja"><h5>Líneas que puede consultar</h5><div class="vista-lineas">' +
      V().LINEAS.map(l => '<label><input type="checkbox" class="vista-lin" value="' + l + '"' + (c.lineas.includes(l) ? ' checked' : '') + '>' + l + '</label>').join('') +
      '</div></div>' +
      '<div class="vista-caja"><h5>Descargas</h5><label><input type="checkbox" id="vista-exportar"' + (c.exportar ? ' checked' : '') +
      '>Permitir descargar / exportar reportes</label></div>' +
      '<div class="vista-pie"><span>ⓘ Los módulos no seleccionados no aparecerán para este usuario. Una lista vacía no concede acceso.</span>' +
      '<span id="vista-bloqueo-edicion" ' + (c.activo ? '' : 'hidden') + '>🔒 Los permisos de edición quedan bloqueados mientras este modo esté activo.</span></div></div></section>';
  }

  function aplicarEstado(){
    const activo = !!document.getElementById('vista-activo')?.checked;
    const form = document.getElementById('vista-form');
    if(form) form.classList.toggle('vista-off', !activo);
    const est = document.getElementById('vista-estado'); if(est) est.textContent = activo ? 'Activado' : 'Desactivado';
    const lock = document.getElementById('vista-bloqueo-edicion'); if(lock) lock.hidden = !activo;
    const editables = document.querySelectorAll('.permiso-edit-check, #edit-permisos-todos, [data-perm-area-btn]');
    editables.forEach(el => { if(activo){ el.dataset.vistaDeshabilitado = el.disabled ? '0' : '1'; el.disabled = true; } else if(el.dataset.vistaDeshabilitado === '1'){ el.disabled = false; delete el.dataset.vistaDeshabilitado; } });
    const habilitado = !document.getElementById('vista-activo')?.disabled;
    document.querySelectorAll('#vista-form .vista-mod, #vista-form .vista-lin, #vista-exportar').forEach(el => { el.disabled = !habilitado; });
  }
  window.vistaAlternarModo = aplicarEstado;
  window.vistaMarcarTodos = function(){
    const cajas = Array.from(document.querySelectorAll('#vista-form .vista-mod:not([data-restringido])')).filter(c => !c.disabled);
    if(!cajas.length) return;
    const marcar = cajas.some(c => !c.checked);
    cajas.forEach(c => { c.checked = marcar; });
  };

  /* Se agrega la sección al modal que dibuja editarPermisosUsuario (sin tocar su código). */
  const editarOriginal = editarPermisosUsuario;
  editarPermisosUsuario = function(username){
    // El modal muestra los permisos operativos GUARDADOS de la cuenta (no la lista reducida que se aplica con el modo activo).
    const r = V().sinModo(() => editarOriginal.apply(this, arguments));
    try{
      const usuario = loadUsers().find(u => String(u.username).toLowerCase() === String(username).toLowerCase());
      const cuerpo = document.querySelector('#modal-root .modal .modal-body');
      if(!usuario || !cuerpo || !window.glacialVista) return r;
      estilos();
      const modal = cuerpo.closest('.modal');
      if(modal){ modal.style.maxWidth = '1000px'; modal.style.width = '96vw'; }
      const cajaPermisos = cuerpo.querySelector('#edit-permisos-todos')?.closest('div[style*="border:1px solid"]');
      const html = seccionHtml(usuario);
      if(cajaPermisos) cajaPermisos.insertAdjacentHTML('beforebegin', html); else cuerpo.insertAdjacentHTML('afterbegin', html);
      aplicarEstado();
    }catch(e){ console.warn('Modo visualización: no se pudo mostrar la sección.', e); }
    return r;
  };
  window.editarPermisosUsuario = editarPermisosUsuario;

  function leerModo(){
    return {
      activo: !!document.getElementById('vista-activo')?.checked,
      modulos: Array.from(document.querySelectorAll('#vista-form .vista-mod:checked')).map(c => c.value),
      lineas: Array.from(document.querySelectorAll('#vista-form .vista-lin:checked')).map(c => c.value),
      exportar: !!document.getElementById('vista-exportar')?.checked
    };
  }
  function resumenCambio(antes, ahora){
    if(!antes.activo && ahora.activo) return 'ACTIVÓ';
    if(antes.activo && !ahora.activo) return 'DESACTIVÓ';
    return 'MODIFICÓ';
  }

  /* Guarda permisos operativos (sin cambios en su lógica) + modo de visualización. */
  guardarPermisosUsuario = function(username){
    if(!puedeGestionarPersonal()){ alert('No tienes permiso para modificar permisos.'); return; }
    if(username === 'admin'){ alert('Los permisos del administrador principal están protegidos.'); return; }
    const users = loadUsers();
    const index = users.findIndex(u => String(u.username).toLowerCase() === String(username).toLowerCase());
    if(index === -1){ alert('No se encontró el usuario.'); return; }

    const seleccionados = Array.from(document.querySelectorAll('.permiso-edit-check:checked')).map(c => c.value);
    const todos = document.getElementById('edit-permisos-todos')?.checked || seleccionados.length === PERMISOS_APP.length;
    const hayFormulario = !!document.getElementById('vista-form');
    const modo = hayFormulario ? leerModo() : null;
    const esAdminCuenta = String(users[index].rol || '').trim() === 'Administrador';
    const propia = state.user && String(state.user.username).toLowerCase() === String(username).toLowerCase();
    const anterior = V().normalizarConfig(users[index].modoVisualizacion);
    const cambioModo = !!modo && JSON.stringify(modo) !== JSON.stringify(anterior);

    if(cambioModo){
      if(!puedeConfigurar()){ alert('Solo un Administrador puede cambiar el modo de visualización.'); return; }
      if(esAdminCuenta){ alert('El modo visualización no se aplica a cuentas de Administrador.'); return; }
      if(propia){ alert('No puedes cambiar el modo de visualización de tu propia cuenta.'); return; }
    }
    // Con el modo activo, los permisos operativos no se tocan (quedan guardados y bloqueados).
    if(!(modo && modo.activo) && !todos && !seleccionados.length){ alert('El usuario debe tener al menos un permiso.'); return; }

    if(!(modo && modo.activo)){
      const sinPlanificacion = !todos && !seleccionados.includes('planificacion') &&
        ROLES_PLANIFICACION.includes(String(users[index].rol || '').trim());
      users[index].permisos = todos ? 'todos' : (sinPlanificacion ? [...seleccionados, '-planificacion'] : seleccionados);
      users[index].permisosGestionVersion = 1;
    }
    if(cambioModo){
      const ahora = Date.now(), quien = state.user.username;
      users[index].modoVisualizacion = Object.assign({}, modo, {actualizadoPor: quien, actualizadoEn: ahora});
      const historial = Array.isArray(users[index].modoVisualizacionHistorial) ? users[index].modoVisualizacionHistorial.slice(-29) : [];
      historial.push({en: ahora, por: quien, accion: resumenCambio(anterior, modo), activo: modo.activo, modulos: modo.modulos, lineas: modo.lineas, exportar: modo.exportar});
      users[index].modoVisualizacionHistorial = historial;
    }

    saveUsers(users);
    alert('Permisos de "' + username + '" actualizados correctamente.' + (cambioModo ? '\n\nEl modo de visualización se aplica también a sus sesiones abiertas.' : ''));
    openUsersModal();
  };
  window.guardarPermisosUsuario = guardarPermisosUsuario;
})();
