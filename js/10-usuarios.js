/* =============================================================
   GESTIÓN DE USUARIOS
   Parte del sistema GLACIAL — dividido a partir de app.js
   ============================================================= */


/* =========================================================
   GESTIÓN DE USUARIOS
   ========================================================= */

function openUsersModal(){
  if(!tienePermiso('usuarios')){
    alert('No tienes permiso para gestionar usuarios.');
    return;
  }

  const root=document.getElementById('modal-root');

  root.innerHTML=`
    <div class="modal-backdrop" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="modal-head">
          <h3>Gestionar usuarios</h3>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>

        <div class="modal-body">
          <div class="userlist" id="userlist"></div>

          <div class="actions-row" style="margin-top:8px;">
            <button class="btn btn-ghost btn-sm" onclick="migrarTodasLasPasswords()">
              🔒 Migrar contraseñas antiguas a formato seguro
            </button>
          </div>

          <div class="section-title">Nuevo usuario</div>

          <div class="grid grid-2">
            <div class="field-sm">
              <label>Nombre completo</label>
              <input id="nu-nombre" placeholder="Ej. Jesus Garcia">
            </div>

            <div class="field-sm">
              <label>Usuario</label>
              <input id="nu-username" placeholder="Ej. jesus.garcia">
            </div>

            <div class="field-sm">
              <label>Contraseña</label>
              <input id="nu-password" type="text">
            </div>

            <div class="field-sm">
              <label>Puesto</label>
              <input id="nu-puesto" placeholder="Ej. Jefe de Operaciones">
            </div>

            <div class="field-sm">
              <label>Rol interno</label>
              <select id="nu-rol" onchange="toggleLineaField()">
                <option value="Personalizado">Personalizado</option>
                <option value="Administrador">Administrador</option>
                <option value="Jefe de Producción">Jefe de Producción</option>
                <option value="Supervisor">Supervisor</option>
                <option value="Asistente de Producción">Asistente de Producción</option>
                <option value="Jefe de Operaciones">Jefe de Operaciones</option>
                <option value="Gerente General">Gerente General</option>
              </select>
            </div>

            <div class="field-sm" id="nu-linea-wrap" style="display:none;">
              <label>Línea asignada</label>
              <select id="nu-linea">
                <option value="">Todas las líneas</option>
                ${LINES.map(l=>`<option value="${l.key}">${l.name}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="section-title" style="margin-top:18px;">Permisos</div>

          <div style="border:1px solid var(--line);border-radius:10px;padding:12px;background:#fafcfb;">
            <label style="display:flex;align-items:center;gap:8px;font-weight:700;margin-bottom:10px;cursor:pointer;">
              <input type="checkbox" id="nu-permisos-todos"
                onchange="cambiarTodosLosPermisos(this.checked)">
              Todos los permisos
            </label>

            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 16px;">
              ${PERMISOS_APP.map(p=>`
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
                  <input type="checkbox" class="permiso-check" value="${p.key}"
                    onchange="actualizarEstadoTodosLosPermisos()">
                  ${p.label}
                </label>`).join('')}
            </div>
          </div>

          <div class="small-muted" style="margin-top:8px;">
            El puesto es libre. Los permisos controlan lo que el usuario puede ver y hacer.
          </div>

          <div class="actions-row">
            <button class="btn btn-primary" onclick="addUser()">Crear usuario</button>
          </div>
        </div>
      </div>
    </div>`;

  renderUserList();
  toggleLineaField();
}

function renderUserList(){
  const container=document.getElementById('userlist');
  if(!container) return;

  container.innerHTML=loadUsers().map(u=>{
    const p=normalizarPermisosUsuario(u);
    const ptxt=p==='todos'?'Todos los permisos':`${p.length} permiso(s)`;

    return `
      <div class="userlist-row">
        <div>
          <div style="font-weight:600;">${escaparHtml(u.nombre)}</div>
          <div class="small-muted">
            ${escaparHtml(u.username)} ·
            ${escaparHtml(u.puesto||u.rol||'Sin puesto')}
            ${u.linea?' · '+escaparHtml(u.linea):''}
            · ${ptxt}
          </div>
        </div>
        ${u.username!=='admin'?`
          <button class="btn btn-danger btn-sm"
            onclick="removeUser('${escaparHtml(u.username)}')">Eliminar</button>
        `:''}
      </div>`;
  }).join('');
}

function toggleLineaField(){
  const wrap=document.getElementById('nu-linea-wrap');
  const rol=document.getElementById('nu-rol');
  if(!wrap||!rol) return;
  wrap.style.display=rol.value==='Supervisor'?'block':'none';
}

async function addUser(){
  if(!tienePermiso('usuarios')){
    alert('No tienes permiso para crear usuarios.');
    return;
  }

  const nombre=document.getElementById('nu-nombre').value.trim();
  const username=document.getElementById('nu-username').value.trim();
  const password=document.getElementById('nu-password').value;
  const puesto=document.getElementById('nu-puesto').value.trim();
  const rol=document.getElementById('nu-rol').value;
  const linea=rol==='Supervisor'
    ? document.getElementById('nu-linea').value||null
    : null;

  const seleccionados=Array.from(
    document.querySelectorAll('.permiso-check:checked')
  ).map(c=>c.value);

  const todos=document.getElementById('nu-permisos-todos')?.checked
    || seleccionados.length===PERMISOS_APP.length;

  if(!nombre||!username||!password||!puesto){
    alert('Completa nombre, usuario, contraseña y puesto.');
    return;
  }

  if(!todos&&!seleccionados.length){
    alert('Selecciona al menos un permiso.');
    return;
  }

  const users=loadUsers();

  if(users.some(u=>String(u.username||'').toLowerCase()===username.toLowerCase())){
    alert('Ese usuario ya existe.');
    return;
  }

  const cred = await crearCredencialPassword(password);

  users.push({
    nombre,username,
    salt:cred.salt,
    passwordHash:cred.passwordHash,
    puesto,rol,
    permisos:todos?'todos':seleccionados,
    linea
  });

  saveUsers(users);
  renderUserList();

  document.getElementById('nu-nombre').value='';
  document.getElementById('nu-username').value='';
  document.getElementById('nu-password').value='';
  document.getElementById('nu-puesto').value='';
  document.querySelectorAll('.permiso-check').forEach(c=>c.checked=false);
  const master=document.getElementById('nu-permisos-todos');
  if(master)master.checked=false;
}


/* =========================================================
   MIGRAR TODAS LAS CONTRASEÑAS ANTIGUAS A HASH + SALT
   =========================================================

   Recorre a todos los usuarios y, a los que todavía tengan
   la contraseña en texto plano (formato antiguo), les genera
   un salt + hash y borra el texto plano. Los usuarios que ya
   se migraron solos al iniciar sesión se dejan intactos.
   ========================================================= */

async function migrarTodasLasPasswords(){

  if(!tienePermiso('usuarios')){
    alert('No tienes permiso para hacer esto.');
    return;
  }

  const users = loadUsers();

  let migrados = 0;

  for(const u of users){

    if(!u.passwordHash && u.password){

      const cred = await crearCredencialPassword(u.password);

      delete u.password;

      u.salt = cred.salt;
      u.passwordHash = cred.passwordHash;

      migrados++;

    }

  }

  if(migrados === 0){
    alert('Todas las contraseñas ya están en formato seguro (hash + salt).');
    return;
  }

  saveUsers(users);

  alert(`Listo: se migraron ${migrados} contraseña(s) a formato seguro.`);

  renderUserList();

}

/* =========================================================
   ELIMINAR USUARIO
   ========================================================= */

function removeUser(username){
  if(!tienePermiso('usuarios')){
    alert('No tienes permiso para eliminar usuarios.');
    return;
  }

  if(username==='admin'){
    alert('El usuario administrador principal no puede eliminarse.');
    return;
  }

  if(!confirm(`¿Eliminar al usuario "${username}"?`)) return;

  saveUsers(loadUsers().filter(u=>u.username!==username));
  renderUserList();
}