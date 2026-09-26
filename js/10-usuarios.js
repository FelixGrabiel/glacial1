/* =============================================================
   GESTIÓN DE USUARIOS
   Parte del sistema GLACIAL — dividido a partir de app.js

   Incluye:
   - Crear usuarios
   - Eliminar usuarios
   - Editar permisos
   - Activar/desactivar permisos
   - Todos los permisos
   - Permisos automáticos según rol
   - Protección del administrador principal
   ============================================================= */


/* =========================================================
   ROLES CON TODOS LOS PERMISOS
   ========================================================= */

function rolTieneTodosLosPermisos(rol){

  return (
    rol === 'Administrador'
  );

}


/* =========================================================
   ABRIR GESTIÓN DE USUARIOS
   ========================================================= */

function openUsersModal(){

  if(!puedeGestionarPersonal()){

    alert('No tienes permiso para gestionar usuarios.');
    return;

  }


  const root=document.getElementById('modal-root');


  root.innerHTML=`

    <div class="modal-backdrop"
         onclick="if(event.target===this)closeModal()">

      <div class="modal">

        <div class="modal-head">

          <h3>Gestionar usuarios</h3>

          <button
            class="modal-close"
            onclick="closeModal()">

            ✕

          </button>

        </div>


        <div class="modal-body">


          <!-- =================================================
               LISTA DE USUARIOS
               ================================================= -->

          <div class="section-title">
            Usuarios registrados
          </div>


          <div
            class="userlist"
            id="userlist">
          </div>


          <!-- =================================================
               MIGRAR CONTRASEÑAS
               ================================================= -->

          <div
            class="actions-row"
            style="margin-top:8px;">

            <button
              class="btn btn-ghost btn-sm"
              onclick="migrarTodasLasPasswords()">

              🔒 Migrar contraseñas antiguas a formato seguro

            </button>

          </div>


          <!-- =================================================
               NUEVO USUARIO
               ================================================= -->

          <div
            class="section-title"
            style="margin-top:18px;">

            Nuevo usuario

          </div>


          <div class="grid grid-2">


            <div class="field-sm">

              <label>Nombre completo</label>

              <input
                id="nu-nombre"
                
                placeholder="Ej. Jesús García">

            </div>


            <div class="field-sm">

              <label>Usuario</label>

              <input
                id="nu-username"
                placeholder="Ej. jesus.garcia">

            </div>


            <div class="field-sm">

              <label>Contraseña</label>

              <input
                id="nu-password"
                type="text">

            </div>


            <div class="field-sm">

              <label>Puesto</label>

              <input
                id="nu-puesto"
                placeholder="Ej. Jefe de Operaciones">

            </div>


            <div class="field-sm">

              <label>Rol interno</label>

              <select
                id="nu-rol"
                onchange="cambiarRolNuevoUsuario()">

                <option value="Personalizado">
                  Personalizado
                </option>

                <option value="Administrador">
                  Administrador
                </option>

                <option value="Jefe de Producción">
                  Jefe de Producción
                </option>

                <option value="Supervisor">
                  Supervisor
                </option>

                <option value="Asistente de Producción">
                  Asistente de Producción
                </option>

                <option value="Jefe de Operaciones">
                  Jefe de Operaciones
                </option>

                <option value="Gerente General">
                  Gerente General
                </option>

                <option value="Mantenimiento">Mantenimiento</option>
                <option value="RRHH">RRHH</option>
                <option value="Ventas">Ventas</option>
                <option value="Planificación">Planificación</option>
                <option value="Ventas y Planificación">Ventas y Planificación</option>

              </select>

            </div>


            <div
              class="field-sm"
              id="nu-linea-wrap"
              style="display:none;">

              <label>Línea asignada</label>

              <select id="nu-linea">

                <option value="">
                  Todas las líneas
                </option>

                ${LINES.map(l=>`

                  <option value="${l.key}">
                    ${l.name}
                  </option>

                `).join('')}

              </select>

            </div>


          </div>


          <!-- =================================================
               PERMISOS
               ================================================= -->

          <div
            class="section-title"
            style="margin-top:18px;">

            Permisos

          </div>


          <div style="
            border:1px solid var(--line);
            border-radius:10px;
            padding:12px;
            background:#fafcfb;
          ">


            <label style="
              display:flex;
              align-items:center;
              gap:8px;
              font-weight:700;
              margin-bottom:10px;
              cursor:pointer;
            ">

              <input
                type="checkbox"
                id="nu-permisos-todos"
                onchange="cambiarTodosLosPermisos(this.checked)">

              Todos los permisos

            </label>


            <div style="
              display:grid;
              grid-template-columns:
                repeat(2,minmax(0,1fr));
              gap:8px 16px;
            ">


              ${PERMISOS_APP.map(p=>`

                <label style="
                  display:flex;
                  align-items:center;
                  gap:8px;
                  cursor:pointer;
                  font-size:13px;
                ">

                  <input
                    type="checkbox"
                    class="permiso-check"
                    value="${p.key}"
                    onchange="actualizarEstadoTodosLosPermisos()">

                  ${p.label}

                </label>

              `).join('')}


            </div>

          </div>


          <div
            class="small-muted"
            style="margin-top:8px;">

            El puesto es libre.
            Los permisos controlan lo que el usuario puede
            ver y hacer dentro del sistema.

          </div>


          <div class="actions-row">

            <button
              class="btn btn-primary"
              onclick="addUser()">

              Crear usuario

            </button>

          </div>


        </div>

      </div>

    </div>

  `;


  renderUserList();

  toggleLineaField();

}


/* =========================================================
   CAMBIAR ROL DEL NUEVO USUARIO
   =========================================================

   Administrador
   Jefe de Producción
   Jefe de Operaciones

   => Todos los permisos automáticamente.

   Los demás roles
   => Permisos personalizados.
   ========================================================= */

function cambiarRolNuevoUsuario(){

  const rol=
    document.getElementById('nu-rol')?.value;


  if(!rol) return;


  const master=
    document.getElementById(
      'nu-permisos-todos'
    );


  const checks=
    document.querySelectorAll(
      '.permiso-check'
    );


  const tieneTodos=
    rolTieneTodosLosPermisos(rol);


  /*
     Si el rol tiene todos los permisos
  */

  if(tieneTodos){

    if(master){
      master.checked=true;
    }


    checks.forEach(
      c=>{
        c.checked=true;
        c.disabled=true;
      }
    );


    /*
       Mostrar aviso visual en el formulario
    */

    mostrarAvisoPermisosAutomaticos(
      'Este rol tiene automáticamente todos los permisos.'
    );

  }

  /*
     Si el rol NO tiene todos
  */

  else{

    if(master){
      master.checked=false;
    }


    checks.forEach(
      c=>{
        const sugeridos = {
          'Supervisor': ['verLineasProduccion','nuevo','historial','gráficos','paletas','gestionarPersonal'],
          'Gerente General': PERMISOS_SOLO_CONSULTA,
          'Jefe de Producción': PERMISOS_SOLO_CONSULTA,
          'Jefe de Operaciones': PERMISOS_SOLO_CONSULTA,
          'Mantenimiento': ['moduloMantenimiento'],
          'RRHH': ['moduloRRHH'],
          'Ventas': ['produccionActual'],
          'Planificación': ['produccionActual'],
          'Ventas y Planificación': ['produccionActual']
        };
        c.checked=(sugeridos[rol] || []).includes(c.value);
        c.disabled=false;
      }
    );


    quitarAvisoPermisosAutomaticos();

  }


  toggleLineaField();

}


/* =========================================================
   AVISO DE PERMISOS AUTOMÁTICOS
   ========================================================= */

function mostrarAvisoPermisosAutomaticos(texto){

  let aviso=
    document.getElementById(
      'aviso-permisos-automaticos'
    );


  if(!aviso){

    const master=
      document.getElementById(
        'nu-permisos-todos'
      );


    if(!master) return;


    aviso=
      document.createElement('div');

    aviso.id=
      'aviso-permisos-automaticos';


    aviso.style.cssText=`

      margin-top:8px;
      padding:8px 10px;
      border-radius:8px;
      background:#eaf5fb;
      border:1px solid #b9dceb;
      color:#005B96;
      font-size:12px;
      font-weight:600;

    `;


    master
      .closest('label')
      ?.parentElement
      ?.appendChild(aviso);

  }


  aviso.textContent=
    'ℹ️ '+texto;

}


/* =========================================================
   QUITAR AVISO
   ========================================================= */

function quitarAvisoPermisosAutomaticos(){

  const aviso=
    document.getElementById(
      'aviso-permisos-automaticos'
    );


  if(aviso){
    aviso.remove();
  }

}


/* =========================================================
   RENDERIZAR LISTA DE USUARIOS
   ========================================================= */

function renderUserList(){

  const container=
    document.getElementById(
      'userlist'
    );


  if(!container) return;


  const users=
    loadUsers();


  if(!users.length){

    container.innerHTML=`

      <div
        class="small-muted"
        style="padding:15px;">

        No hay usuarios registrados.

      </div>

    `;

    return;

  }


  container.innerHTML=
    users.map(u=>{

      const p=
        normalizarPermisosUsuario(u);


      const ptxt=
        p==='todos'
          ? 'Todos los permisos'
          : `${p.length} permiso(s)`;


      const esAdmin=
        u.rol==='Administrador' ||
        u.username==='admin';


      return `

        <div class="userlist-row">


          <div style="flex:1;">

            <div style="
              font-weight:600;
              margin-bottom:3px;
            ">

              ${escaparHtml(
                u.nombre
              )}

            </div>


            <div class="small-muted">

              ${escaparHtml(
                u.username
              )}

              ·

              ${escaparHtml(
                u.puesto ||
                u.rol ||
                'Sin puesto'
              )}

              ${
                u.linea
                  ? ' · '+escaparHtml(u.linea)
                  : ''
              }

              · ${ptxt}

            </div>


          </div>


          <div style="
            display:flex;
            gap:6px;
            align-items:center;
            flex-wrap:wrap;
          ">


            <!-- =============================================
                 EDITAR PERMISOS
                 ============================================= -->

            ${
              puedeGestionarPersonal()
                ? `

                  <button
                    class="btn btn-ghost btn-sm"
                    onclick="editarPermisosUsuario('${escaparHtml(u.username)}')">

                    🔐 Editar permisos

                  </button>

                `
                : ''
            }


            <!-- =============================================
                 ELIMINAR
                 ============================================= -->

            ${
              u.username!=='admin'
                ? `

                  <button
                    class="btn btn-danger btn-sm"
                    onclick="removeUser('${escaparHtml(u.username)}')">

                    Eliminar

                  </button>

                `
                : ''
            }


          </div>


        </div>

      `;

    }).join('');

}


/* =========================================================
   MOSTRAR / OCULTAR LÍNEA
   ========================================================= */

function toggleLineaField(){

  const wrap=
    document.getElementById(
      'nu-linea-wrap'
    );


  const rol=
    document.getElementById(
      'nu-rol'
    );


  if(!wrap || !rol) return;


  wrap.style.display=
    rol.value==='Supervisor'
      ? 'block'
      : 'none';

}


/* =========================================================
   CAMBIAR TODOS LOS PERMISOS
   ========================================================= */

function cambiarTodosLosPermisos(checked){

  const rol=
    document.getElementById(
      'nu-rol'
    )?.value;


  /*
     Los roles administrativos tienen
     todos los permisos obligatoriamente.
  */

  if(
    rolTieneTodosLosPermisos(rol)
  ){

    checked=true;

  }


  document
    .querySelectorAll(
      '.permiso-check'
    )
    .forEach(
      c=>{

        if(!c.disabled){
          c.checked=checked;
        }

      }
    );


  actualizarEstadoTodosLosPermisos();

}


/* =========================================================
   ACTUALIZAR ESTADO "TODOS"
   ========================================================= */

function actualizarEstadoTodosLosPermisos(){

  const checks=
    Array.from(
      document.querySelectorAll(
        '.permiso-check'
      )
    );


  const master=
    document.getElementById(
      'nu-permisos-todos'
    );


  if(
    master &&
    checks.length
  ){

    master.checked=
      checks.every(
        c=>c.checked
      );

  }


  /*
     Si el rol es administrativo,
     siempre debe quedar marcado.
  */

  const rol=
    document.getElementById(
      'nu-rol'
    )?.value;


  if(
    master &&
    rolTieneTodosLosPermisos(rol)
  ){

    master.checked=true;

  }

}


/* =========================================================
   AGREGAR USUARIO
   ========================================================= */

async function addUser(){

  if(!puedeGestionarPersonal()){

    alert(
      'No tienes permiso para crear usuarios.'
    );

    return;

  }


  const nombre=
    document.getElementById(
      'nu-nombre'
    ).value.trim();


  const username=
    document.getElementById(
      'nu-username'
    ).value.trim();


  const password=
    document.getElementById(
      'nu-password'
    ).value;


  const puesto=
    document.getElementById(
      'nu-puesto'
    ).value.trim();


  const rol=
    document.getElementById(
      'nu-rol'
    ).value;


  const linea=
    rol==='Supervisor'
      ? document.getElementById(
          'nu-linea'
        ).value || null
      : null;


  /*
     Determinar permisos.

     Si el rol es:
     Administrador
     Jefe de Producción
     Jefe de Operaciones

     => TODOS

     De lo contrario:
     => permisos seleccionados
  */

  let seleccionados=
    Array.from(
      document.querySelectorAll(
        '.permiso-check:checked'
      )
    ).map(
      c=>c.value
    );


  let todos=
    rolTieneTodosLosPermisos(rol);


  /*
     Para roles personalizados,
     se respeta la selección manual.
  */

  if(!todos){

    todos=
      document.getElementById(
        'nu-permisos-todos'
      )?.checked
      ||
      seleccionados.length===
      PERMISOS_APP.length;

  }


  if(
    !nombre ||
    !username ||
    !password ||
    !puesto
  ){

    alert(
      'Completa nombre, usuario, contraseña y puesto.'
    );

    return;

  }


  if(
    !todos &&
    !seleccionados.length
  ){

    alert(
      'Selecciona al menos un permiso.'
    );

    return;

  }


  const users=
    loadUsers();


  if(
    users.some(
      u=>
        String(
          u.username||''
        ).toLowerCase()
        ===
        username.toLowerCase()
    )
  ){

    alert(
      'Ese usuario ya existe.'
    );

    return;

  }


  const cred=
    await crearCredencialPassword(
      password
    );


  users.push({

    nombre,

    username,

    salt:
      cred.salt,

    passwordHash:
      cred.passwordHash,

    puesto,

    rol,

    permisos:
      esUsuarioSoloConsulta({rol})
        ? [...PERMISOS_SOLO_CONSULTA]
        : todos ? 'todos' : seleccionados,

    permisosGestionVersion:1,

    linea

  });


  saveUsers(users);

  renderUserList();


  /*
     Limpiar formulario
  */

  document.getElementById(
    'nu-nombre'
  ).value='';


  document.getElementById(
    'nu-username'
  ).value='';


  document.getElementById(
    'nu-password'
  ).value='';


  document.getElementById(
    'nu-puesto'
  ).value='';


  document.querySelectorAll(
    '.permiso-check'
  ).forEach(
    c=>{
      c.checked=false;
      c.disabled=false;
    }
  );


  const master=
    document.getElementById(
      'nu-permisos-todos'
    );


  if(master){
    master.checked=false;
  }


  const rolSelect=
    document.getElementById(
      'nu-rol'
    );


  if(rolSelect){
    rolSelect.value='Personalizado';
  }


  quitarAvisoPermisosAutomaticos();

  toggleLineaField();

}


/* =========================================================
   EDITAR PERMISOS DE USUARIO
   ========================================================= */

function editarPermisosUsuario(username){

  if(!puedeGestionarPersonal()){

    alert(
      'No tienes permiso para editar permisos de usuarios.'
    );

    return;

  }


  const users=
    loadUsers();


  const usuario=
    users.find(
      u=>
        String(u.username)
          .toLowerCase()
        ===
        String(username)
          .toLowerCase()
    );


  if(!usuario){

    alert(
      'No se encontró el usuario.'
    );

    return;

  }


  /*
     Administrador principal protegido
  */

  const esAdminPrincipal=
    usuario.username==='admin';


  const permisos=
    normalizarPermisosUsuario(
      usuario
    );


  const todos=
    permisos==='todos';


  const seleccionados=
    todos
      ? PERMISOS_APP.map(
          p=>p.key
        )
      : permisos;


  const root=
    document.getElementById(
      'modal-root'
    );


  root.innerHTML=`

    <div
      class="modal-backdrop"
      onclick="if(event.target===this)closeModal()">

      <div class="modal">


        <div class="modal-head">

          <h3>
            Editar permisos
          </h3>


          <button
            class="modal-close"
            onclick="closeModal()">

            ✕

          </button>

        </div>


        <div class="modal-body">


          <div style="
            padding:12px;
            border-radius:10px;
            background:#f3f6f9;
            margin-bottom:16px;
          ">


            <div style="
              font-weight:700;
              font-size:15px;
            ">

              ${escaparHtml(
                usuario.nombre ||
                usuario.username
              )}

            </div>


            <div class="small-muted">

              Usuario:
              ${escaparHtml(
                usuario.username
              )}

              ·

              ${escaparHtml(
                usuario.puesto ||
                usuario.rol ||
                'Sin puesto'
              )}

            </div>


          </div>


          ${
            esAdminPrincipal
              ? `

                <div style="
                  padding:12px;
                  border-radius:10px;
                  background:#fff8e1;
                  border:1px solid #f0d98c;
                  margin-bottom:14px;
                ">

                  🔒
                  El administrador principal
                  conserva todos los permisos.

                </div>

              `
              : ''
          }


          <div style="
            border:1px solid var(--line);
            border-radius:10px;
            padding:12px;
            background:#fafcfb;
          ">


            <label style="
              display:flex;
              align-items:center;
              gap:8px;
              font-weight:700;
              margin-bottom:10px;
              cursor:${esAdminPrincipal
                ? 'not-allowed'
                : 'pointer'};
            ">


              <input
                type="checkbox"
                id="edit-permisos-todos"
                ${todos?'checked':''}
                ${esAdminPrincipal?'disabled':''}
                onchange="cambiarTodosPermisosEdicion(this.checked)">


              Todos los permisos


            </label>


            <div style="
              display:grid;
              grid-template-columns:
                repeat(2,minmax(0,1fr));
              gap:8px 16px;
            ">


              ${PERMISOS_APP.map(p=>`

                <label style="
                  display:flex;
                  align-items:center;
                  gap:8px;
                  cursor:${esAdminPrincipal
                    ? 'not-allowed'
                    : 'pointer'};
                  font-size:13px;
                ">


                  <input
                    type="checkbox"
                    class="permiso-edit-check"
                    value="${p.key}"

                    ${
                      seleccionados.includes(
                        p.key
                      )
                        ? 'checked'
                        : ''
                    }

                    ${
                      esAdminPrincipal
                        ? 'disabled'
                        : ''
                    }

                    onchange="
                      actualizarEstadoPermisosEdicion()
                    ">


                  ${p.label}


                </label>

              `).join('')}


            </div>


          </div>


          <div
            class="actions-row"
            style="margin-top:16px;">


            <button
              class="btn btn-ghost"
              onclick="openUsersModal()">

              Cancelar

            </button>


            ${
              !esAdminPrincipal
                ? `

                  <button
                    class="btn btn-primary"
                    onclick="guardarPermisosUsuario('${escaparHtml(usuario.username)}')">

                    💾 Guardar permisos

                  </button>

                `
                : ''
            }


          </div>


        </div>

      </div>

    </div>

  `;

}


/* =========================================================
   CAMBIAR TODOS LOS PERMISOS — EDICIÓN
   ========================================================= */

function cambiarTodosPermisosEdicion(checked){

  document
    .querySelectorAll(
      '.permiso-edit-check'
    )
    .forEach(
      c=>c.checked=checked
    );


  actualizarEstadoPermisosEdicion();

}


/* =========================================================
   ACTUALIZAR ESTADO "TODOS" — EDICIÓN
   ========================================================= */

function actualizarEstadoPermisosEdicion(){

  const checks=
    Array.from(
      document.querySelectorAll(
        '.permiso-edit-check'
      )
    );


  const master=
    document.getElementById(
      'edit-permisos-todos'
    );


  if(
    master &&
    checks.length
  ){

    master.checked=
      checks.every(
        c=>c.checked
      );

  }

}


/* =========================================================
   GUARDAR PERMISOS
   ========================================================= */

function guardarPermisosUsuario(username){

  if(!puedeGestionarPersonal()){

    alert(
      'No tienes permiso para modificar permisos.'
    );

    return;

  }


  /*
     Administrador principal protegido
  */

  if(username==='admin'){

    alert(
      'Los permisos del administrador principal están protegidos.'
    );

    return;

  }


  const users=
    loadUsers();


  const index=
    users.findIndex(
      u=>
        String(
          u.username
        ).toLowerCase()
        ===
        String(
          username
        ).toLowerCase()
    );


  if(index===-1){

    alert(
      'No se encontró el usuario.'
    );

    return;

  }


  const seleccionados=
    Array.from(
      document.querySelectorAll(
        '.permiso-edit-check:checked'
      )
    ).map(
      c=>c.value
    );


  const todos=
    document.getElementById(
      'edit-permisos-todos'
    )?.checked
    ||
    seleccionados.length===
    PERMISOS_APP.length;


  if(
    !todos &&
    !seleccionados.length
  ){

    alert(
      'El usuario debe tener al menos un permiso.'
    );

    return;

  }


  users[index].permisos=
    esUsuarioSoloConsulta(users[index])
      ? [...PERMISOS_SOLO_CONSULTA]
      : todos ? 'todos' : seleccionados;
  users[index].permisosGestionVersion=1;


  saveUsers(users);


  alert(
    `Permisos de "${username}" actualizados correctamente.`
  );


  openUsersModal();

}


/* =========================================================
   MIGRAR CONTRASEÑAS ANTIGUAS
   ========================================================= */

async function migrarTodasLasPasswords(){

  if(!puedeGestionarPersonal()){

    alert(
      'No tienes permiso para hacer esto.'
    );

    return;

  }


  const users=
    loadUsers();


  let migrados=0;


  for(
    const u of users
  ){

    if(
      !u.passwordHash &&
      u.password
    ){

      const cred=
        await crearCredencialPassword(
          u.password
        );


      delete u.password;


      u.salt=
        cred.salt;


      u.passwordHash=
        cred.passwordHash;


      migrados++;

    }

  }


  if(migrados===0){

    alert(
      'Todas las contraseñas ya están en formato seguro (hash + salt).'
    );

    return;

  }


  saveUsers(users);


  alert(
    `Listo: se migraron ${migrados} contraseña(s) a formato seguro.`
  );


  renderUserList();

}


/* =========================================================
   ELIMINAR USUARIO
   ========================================================= */

function removeUser(username){

  if(!puedeGestionarPersonal()){

    alert(
      'No tienes permiso para eliminar usuarios.'
    );

    return;

  }


  /*
     Administrador principal protegido
  */

  if(username==='admin'){

    alert(
      'El usuario administrador principal no puede eliminarse.'
    );

    return;

  }


  if(
    !confirm(
      `¿Eliminar al usuario "${username}"?`
    )
  ){

    return;

  }


  saveUsers(
    loadUsers().filter(
      u=>u.username!==username
    )
  );


  renderUserList();

}
