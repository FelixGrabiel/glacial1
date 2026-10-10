/* =============================================================
   GLACIAL · PERMISOS DE IMPACTO ECONÓMICO POR USUARIO
   -------------------------------------------------------------
   El rol dice quién PUEDE tener acceso; el permiso explícito dice quién LO TIENE:
     · «Ver impacto económico»        → users[].economico.ver
     · «Gestionar valores unitarios»  → users[].economico.gestionar (implica ver; solo Gerencia y Administrador)
   Jefatura solo puede tener «ver». Administrador no tiene nada por defecto: se lo habilita otro Administrador (habilitación temporal,
   revocable). El permiso «todos» de los permisos operativos NUNCA concede esto.
   Se guarda con saveUsers (que republica sync/perfiles con el campo eco que leen las reglas de Firestore) y deja historial.
   Se usa en dos lugares con la misma lógica: Gestionar usuarios → Editar permisos (esta sección) y Impacto económico → pestaña «Permisos».
   Cargar después de 10b-modo-visualizacion-form.js y de 55-valores-economicos.js.
   ============================================================= */
(function instalarPermisosEconomicos(){
  'use strict';

  const P = () => window.glacialEcoPermisos;
  const esc = v => (typeof escaparHtml === 'function' ? escaparHtml(v) : String(v == null ? '' : v));
  const esAdministrador = () => !!(typeof state !== 'undefined' && state.user && String(state.user.rol || '').trim() === 'Administrador');

  /* Aplica un cambio a un usuario dentro de una lista ya cargada. Devuelve {ok, msg, cambio}. Función pura respecto a la UI (testeable). */
  function aplicarCambio(users, username, ver, gestionar, actor){
    const i = users.findIndex(u => String(u.username).toLowerCase() === String(username).toLowerCase());
    if(i === -1) return {ok:false, msg:'No se encontró el usuario.'};
    const u = users[i], rol = String(u.rol || '').trim();
    if(!P().elegibleVer(rol)) return {ok:false, msg:'El rol «' + rol + '» no puede tener acceso al impacto económico.'};
    ver = ver === true; gestionar = gestionar === true;
    if(gestionar && !P().elegibleGestionar(rol)) return {ok:false, msg:'Jefatura solo puede consultar (no puede gestionar valores unitarios).'};
    if(gestionar) ver = true;
    const antes = P().de(u);
    if(antes.ver === ver && antes.gestionar === gestionar && u.economico && typeof u.economico === 'object') return {ok:true, cambio:false};
    if(antes.ver === ver && antes.gestionar === gestionar && !u.economico) return {ok:true, cambio:false};
    const ahora = Date.now();
    u.economico = {ver, gestionar, temporal: rol === 'Administrador' && (ver || gestionar), actualizadoPor: actor, actualizadoEn: ahora};
    const h = Array.isArray(u.economicoHistorial) ? u.economicoHistorial.slice(-29) : [];
    h.push({en: ahora, por: actor, antes: {ver: antes.ver, gestionar: antes.gestionar}, ahora: {ver, gestionar}});
    u.economicoHistorial = h;
    return {ok:true, cambio:true};
  }

  function guardarLista(cambios){
    if(!esAdministrador()) { alert('Solo un Administrador puede asignar permisos de impacto económico.'); return false; }
    const users = loadUsers(), actor = state.user.username;
    let n = 0;
    for(const c of cambios){
      const r = aplicarCambio(users, c.username, c.ver, c.gestionar, actor);
      if(!r.ok){ alert(r.msg); return false; }
      if(r.cambio) n++;
    }
    if(n) saveUsers(users);
    return n;
  }

  /* ---------- sección dentro del modal «Editar permisos» ---------- */
  function seccionHtml(u){
    const p = P().de(u), rol = String(u.rol || '').trim();
    const adm = rol === 'Administrador';
    return '<div id="eco-form" style="border:1px solid #cfe0f2;background:#f7fbff;border-radius:12px;padding:14px;margin-bottom:14px">' +
      '<h4 style="margin:0 0 4px;color:#10265f">IMPACTO ECONÓMICO</h4>' +
      '<p style="margin:0 0 10px;font-size:12px;color:#53657a">El rol solo indica quién puede recibir el acceso; aquí se concede. «Todos los permisos» no lo incluye.' +
      (adm ? ' <b>Habilitación temporal:</b> se puede revocar en cualquier momento.' : '') + '</p>' +
      '<label style="display:flex;gap:8px;align-items:center;margin:6px 0;cursor:pointer"><input type="checkbox" id="eco-ver"' + (p.ver ? ' checked' : '') + '> Ver impacto económico</label>' +
      '<label style="display:flex;gap:8px;align-items:center;margin:6px 0;cursor:' + (p.elegibleGestionar ? 'pointer' : 'not-allowed') + '"><input type="checkbox" id="eco-gest"' +
        (p.gestionar ? ' checked' : '') + (p.elegibleGestionar ? '' : ' disabled') + '> Gestionar valores unitarios' +
        (p.elegibleGestionar ? '' : ' <small style="color:#8a5a00">(Jefatura: solo consulta)</small>') + '</label>' +
      '<button type="button" class="btn secondary" onclick="glacialEcoUsuarios.guardarModal(\'' + esc(u.username) + '\')">Guardar impacto económico</button>' +
      '</div>';
  }
  function guardarModal(username){
    const ver = !!document.getElementById('eco-ver')?.checked;
    const gest = !!document.getElementById('eco-gest')?.checked;
    const n = guardarLista([{username, ver, gestionar: gest}]);
    if(n === false) return;
    alert(n ? 'Permisos de impacto económico de "' + username + '" actualizados.\n\nSe aplican a sus sesiones abiertas; para que Firestore los reconozca, el perfil se republica al guardar.' : 'Sin cambios en impacto económico.');
    if(n && typeof openUsersModal === 'function') openUsersModal();
  }

  if(typeof editarPermisosUsuario === 'function'){
    const anterior = editarPermisosUsuario;
    editarPermisosUsuario = function(username){
      const r = anterior.apply(this, arguments);
      try{
        if(!esAdministrador() || !P()) return r;
        const usuario = loadUsers().find(u => String(u.username).toLowerCase() === String(username).toLowerCase());
        const cuerpo = document.querySelector('#modal-root .modal .modal-body');
        if(!usuario || !cuerpo || !P().elegibleVer(String(usuario.rol || '').trim())) return r;
        cuerpo.insertAdjacentHTML('afterbegin', seccionHtml(usuario));
      }catch(e){ console.warn('Impacto económico: no se pudo mostrar la sección de permisos.', e); }
      return r;
    };
    window.editarPermisosUsuario = editarPermisosUsuario;
  }

  /* ---------- pestaña «Permisos» del dashboard ---------- */
  function panelHtml(){
    if(!esAdministrador()) return '';
    const lista = loadUsers().filter(u => P().elegibleVer(String(u.rol || '').trim()));
    const filas = lista.map(u => {
      const p = P().de(u);
      return '<tr data-eco-user="' + esc(u.username) + '"><td>' + esc(u.nombre || u.username) + '<div style="font-size:11px;color:#5a6b78">' + esc(u.username) + '</div></td><td>' + esc(u.rol) + '</td>' +
        '<td style="text-align:center"><input type="checkbox" class="eco-p-ver"' + (p.ver ? ' checked' : '') + '></td>' +
        '<td style="text-align:center">' + (p.elegibleGestionar ? '<input type="checkbox" class="eco-p-gest"' + (p.gestionar ? ' checked' : '') + '>' : '<small>Solo consulta</small>') + '</td></tr>';
    }).join('');
    return '<section class="id-card"><header><h4>Permisos de impacto económico</h4></header>' +
      '<p style="font-size:13px">Marca quién puede ver el impacto en soles y quién puede gestionar los valores unitarios. Gestionar implica ver. Administrador solo recibe acceso aquí (habilitación temporal, revocable).</p>' +
      '<div style="overflow:auto"><table class="id-tabla"><thead><tr><th>Usuario</th><th>Rol</th><th>Ver</th><th>Gestionar valores</th></tr></thead><tbody>' + (filas || '<tr><td colspan="4">Sin usuarios elegibles.</td></tr>') + '</tbody></table></div>' +
      agregarHtml() +
      '<p><button type="button" class="id-btn p" data-id-guardar-permisos>Guardar permisos</button></p></section>';
  }
  /* Agregar usuario: lista las cuentas que aún no aparecen (rol no elegible). Si el rol no sirve, se explica qué cambiar. */
  function agregarHtml(){
    const otros = loadUsers().filter(u => !P().elegibleVer(String(u.rol || '').trim()));
    const opc = otros.map(u => '<option value="' + esc(u.username) + '">' + esc(u.nombre || u.username) + ' · rol: ' + esc(u.rol || 'sin rol') + (u.puesto ? ' · puesto: ' + esc(u.puesto) : '') + '</option>').join('');
    return '<div style="margin:12px 0;padding:10px;border:1px dashed #b9c9d8;border-radius:8px"><b style="font-size:13px">Agregar usuario</b>' +
      '<p style="font-size:12px;margin:4px 0;color:#5a6b78">Solo Gerencia, Jefe de Producción, Jefe de Operaciones, Jefatura y Administrador pueden recibir este permiso. Si la persona aún no tiene uno de esos roles, cámbiale el rol o crea su usuario.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><select id="eco-agregar-sel" style="padding:8px;min-width:220px"><option value="">Elegir usuario existente…</option>' + opc + '</select>' +
      '<button type="button" class="id-btn" onclick="glacialEcoUsuarios.agregar()">Agregar</button>' +
      '<button type="button" class="id-btn" onclick="glacialEcoUsuarios.crearUsuario()">Crear usuario nuevo</button></div></div>';
  }
  function agregar(){
    const u = document.getElementById('eco-agregar-sel')?.value;
    if(!u){ alert('Elige un usuario de la lista.'); return; }
    const x = loadUsers().find(v => String(v.username) === u);
    alert('«' + (x && (x.nombre || x.username)) + '» tiene el ROL «' + (x && x.rol || 'sin rol') + '»' + (x && x.puesto ? ' (su PUESTO es «' + x.puesto + '», pero el puesto es solo texto; lo que cuenta es el rol)' : '') + ', que no puede recibir permisos de impacto económico.\n\nCámbiale el rol a Jefe de Operaciones, Jefe de Producción, Jefatura o Gerencia en Gestionar usuarios; después aparecerá en esta lista.');
    if(typeof openUsersModal === 'function') openUsersModal();
  }
  function crearUsuario(){
    if(typeof openUsersModal === 'function') openUsersModal();
    else alert('Abre Gestionar usuarios para crear el usuario (rol Jefe de Operaciones, Jefe de Producción, Jefatura o Gerencia).');
  }
  function guardarPanel(cont){
    const filas = Array.from((cont || document).querySelectorAll('tr[data-eco-user]'));
    const cambios = filas.map(tr => {
      const g = tr.querySelector('.eco-p-gest');
      return {username: tr.getAttribute('data-eco-user'), ver: !!tr.querySelector('.eco-p-ver')?.checked, gestionar: !!(g && g.checked)};
    });
    const n = guardarLista(cambios);
    if(n === false) return;
    alert(n ? 'Permisos actualizados (' + n + ').' : 'Sin cambios.');
  }

  window.glacialEcoUsuarios = {aplicarCambio, guardarLista, seccionHtml, guardarModal, panelHtml, guardar: guardarPanel, agregar, crearUsuario};
})();
