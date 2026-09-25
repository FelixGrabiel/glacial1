/* =============================================================
   GESTIÓN DE TRABAJADORES
   Parte del sistema GLACIAL — dividido a partir de app.js
   ============================================================= */


/* =========================================================
   GESTIÓN DE TRABAJADORES
   (Operarios, Supervisores, Técnicos de Mtto., etc.)
   ========================================================= */

let workerEditId = null;
let workerSearchTerm = '';


function openWorkersModal(){

  if(!puedeGestionarPersonal()){
    alert('No tienes permiso para gestionar trabajadores.');
    return;
  }

  const root =
    document.getElementById(
      'modal-root'
    );


  workerEditId = null;
  workerSearchTerm = '';


  root.innerHTML = `

    <div
      class="modal-backdrop"
      onclick="
        if(event.target===this)
          closeModal()
      "
    >

      <div class="modal">

        <div class="modal-head">

          <h3>
            Gestionar trabajadores
          </h3>


          <button
            class="modal-close"
            onclick="closeModal()"
          >
            ✕
          </button>

        </div>


        <div class="modal-body">

          <div class="field-sm">

            <label>
              Buscar
            </label>

            <input
              id="tw-search"
              placeholder="Nombre, cargo o DNI..."
              oninput="filterWorkerList(this.value)"
            >

          </div>


          <div class="field-sm">

            <label>
              Importar desde archivo (JSON exportado de Excel/Sheets)
            </label>

            <input
              type="file"
              id="tw-import-file"
              accept=".json,application/json"
              onchange="importarTrabajadoresDesdeArchivo(event)"
            >
          </div>


          <div
            class="userlist"
            id="workerlist"
          ></div>


          <div
            class="section-title"
            id="worker-form-title"
          >
            Nuevo trabajador
          </div>


          <div class="grid grid-2">


            <div class="field-sm">

              <label>
                Nombre completo
              </label>

              <input
                id="tw-nombre"
              >

            </div>


            <div class="field-sm">

              <label>
                DNI / N° documento
              </label>

              <input
                id="tw-dni"
              >

            </div>


            <div class="field-sm">

              <label>
                Cargo
              </label>

              <input
                id="tw-cargo"
                list="cargos-trabajador-datalist"
              >

              <datalist id="cargos-trabajador-datalist">

                ${
                  CARGOS_TRABAJADOR.map(

                    c => `
                      <option value="${c}"></option>
                    `

                  ).join('')
                }

              </datalist>

            </div>


            <div class="field-sm">

              <label>
                Línea / área asignada
              </label>

              <select id="tw-linea">

                <option value="">
                  Todas las líneas
                </option>

                ${
                  LINES.map(

                    l => `
                      <option value="${l.key}">
                        ${l.name}
                      </option>
                    `

                  ).join('')
                }

              </select>

            </div>


            <div class="field-sm">

              <label>
                Estado
              </label>

              <select id="tw-estado">

                <option value="Activo">
                  Activo
                </option>

                <option value="Inactivo">
                  Inactivo
                </option>

              </select>

            </div>


          </div>


          <div class="actions-row">

            <button
              class="btn btn-primary"
              id="worker-form-btn"
              onclick="saveWorkerForm()"
            >
              Registrar trabajador
            </button>

            <button
              class="btn btn-ghost btn-sm"
              id="worker-form-cancel"
              onclick="cancelWorkerEdit()"
              style="display:none;"
            >
              Cancelar edición
            </button>

          </div>


        </div>

      </div>

    </div>

  `;


  renderWorkerList();

}


/* =========================================================
   LISTA DE TRABAJADORES (con filtro de búsqueda)
   ========================================================= */

function filterWorkerList(term){

  workerSearchTerm = term;

  renderWorkerList();

}


function renderWorkerList(){

  const container =
    document.getElementById(
      'workerlist'
    );

  if(!container){
    return;
  }


  const term =
    normalizarTexto(
      (workerSearchTerm || '').trim()
    );


  const workers =
    loadWorkers().filter(

      w => {

        if(!term){
          return true;
        }

        return (
          normalizarTexto(w.nombre || '').includes(term) ||
          normalizarTexto(w.cargo || '').includes(term) ||
          normalizarTexto(w.dni || '').includes(term)
        );

      }

    );


  if(!workers.length){

    container.innerHTML = `
      <div class="small-muted" style="padding:10px 0;">
        No hay trabajadores registrados.
      </div>
    `;

    return;

  }


  container.innerHTML =

    workers.map(

      w => {

        const lineaInfo =
          LINES.find(l => l.key === w.linea);

        const lineaNombre =
          w.linea
            ? (lineaInfo ? lineaInfo.name : w.linea)
            : 'Todas las líneas';

        return `

          <div class="userlist-row">

            <div>

              <div style="font-weight:600;">

                ${w.nombre}

                ${
                  w.estado === 'Inactivo'
                    ? ' · <span style="color:var(--danger);">Inactivo</span>'
                    : ''
                }

              </div>


              <div class="small-muted">

                ${w.cargo || 'Sin cargo'}
                ·
                ${lineaNombre}
                ${w.dni ? ' · DNI ' + w.dni : ''}

              </div>

            </div>


            <div style="display:flex; gap:6px;">

              <button
                class="btn btn-ghost btn-sm"
                onclick="startEditWorker('${w.id}')"
              >
                Editar
              </button>

              <button
                class="btn btn-danger btn-sm"
                onclick="removeWorker('${w.id}')"
              >
                Eliminar
              </button>

            </div>

          </div>

        `;

      }

    ).join('');

}


/* =========================================================
   CREAR / ACTUALIZAR TRABAJADOR
   ========================================================= */

function saveWorkerForm(){

  if(!puedeGestionarPersonal())return;

  const nombre =
    document.getElementById('tw-nombre').value.trim();

  const dni =
    document.getElementById('tw-dni').value.trim();

  const cargo =
    document.getElementById('tw-cargo').value.trim();

  const linea =
    document.getElementById('tw-linea').value;

  const estado =
    document.getElementById('tw-estado').value;


  if(!nombre){

    alert(
      'Ingresa el nombre y apellido del trabajador.'
    );

    return;

  }


  const workers =
    loadWorkers();


  if(workerEditId){

    const idx =
      workers.findIndex(w => w.id === workerEditId);

    if(idx > -1){

      workers[idx] = {
        ...workers[idx],
        nombre,
        dni,
        cargo,
        linea,
        estado
      };

    }

  } else {

    const nombreNormalizado =
      normalizarTexto(nombre);

    if(
      workers.some(
        w => normalizarTexto(w.nombre) === nombreNormalizado
      )
    ){

      alert(
        'Ya existe un trabajador registrado con ese nombre.'
      );

      return;

    }


    workers.push({

      id:
        'w_' + Date.now() + '_' +
        Math.random().toString(36).slice(2,8),

      nombre,
      dni,
      cargo,
      linea,
      estado: estado || 'Activo'

    });

  }


  saveWorkers(workers);

  cancelWorkerEdit();

  renderWorkerList();

}


/* =========================================================
   EDITAR TRABAJADOR
   ========================================================= */

function startEditWorker(id){

  if(!puedeGestionarPersonal())return;

  const worker =
    loadWorkers().find(w => w.id === id);

  if(!worker){
    return;
  }


  workerEditId = id;


  document.getElementById('tw-nombre').value = worker.nombre || '';
  document.getElementById('tw-dni').value = worker.dni || '';
  document.getElementById('tw-cargo').value = worker.cargo || '';
  document.getElementById('tw-linea').value = worker.linea || '';
  document.getElementById('tw-estado').value = worker.estado || 'Activo';


  document.getElementById('worker-form-title').textContent =
    'Editando: ' + worker.nombre;

  document.getElementById('worker-form-btn').textContent =
    'Guardar cambios';

  document.getElementById('worker-form-cancel').style.display =
    'inline-flex';

}


function cancelWorkerEdit(){

  workerEditId = null;


  const nombreField = document.getElementById('tw-nombre');

  if(!nombreField){
    return;
  }


  nombreField.value = '';
  document.getElementById('tw-dni').value = '';
  document.getElementById('tw-cargo').value = '';
  document.getElementById('tw-linea').value = '';
  document.getElementById('tw-estado').value = 'Activo';


  document.getElementById('worker-form-title').textContent =
    'Nuevo trabajador';

  document.getElementById('worker-form-btn').textContent =
    'Registrar trabajador';

  document.getElementById('worker-form-cancel').style.display =
    'none';

}


/* =========================================================
   ELIMINAR TRABAJADOR
   ========================================================= */

function removeWorker(id){

  if(!puedeGestionarPersonal())return;

  if(
    !confirm(
      '¿Eliminar este trabajador de la base de datos?'
    )
  ){

    return;

  }


  saveWorkers(

    loadWorkers().filter(
      w => w.id !== id
    )

  );


  if(workerEditId === id){

    cancelWorkerEdit();

  }


  renderWorkerList();

}




function limpiarCeldaExcel(valor){

  if(typeof valor !== 'string'){
    return valor;
  }

  const m = valor.match(/^="?(.*?)"?$/);

  return (m ? m[1] : valor).trim();

}

function limpiarEspacios(valor){

  return String(valor || '')
    .replace(/\s+/g, ' ')
    .trim();

}

function obtenerCampoFilaImportada(fila, nombreColuna){

  for(const key in fila){

    const keyLimpio =
      limpiarCeldaExcel(key).toUpperCase();

    if(keyLimpio === nombreColuna.toUpperCase()){
      return limpiarCeldaExcel(fila[key]);
    }

  }

  return '';

}

function importarTrabajadoresDesdeArchivo(event){

  if(!puedeGestionarPersonal())return;

  const input = event.target;
  const archivo = input.files[0];

  if(!archivo){
    return;
  }


  const lector = new FileReader();

  lector.onload = () => {

    let filas;

    try{

      filas = JSON.parse(lector.result);

    } catch(e){

      alert(
        'No se pudo leer el archivo: no es un JSON válido.'
      );

      input.value = '';

      return;

    }


    if(!Array.isArray(filas)){

      alert(
        'El archivo debe contener una lista (array) de registros.'
      );

      input.value = '';

      return;

    }


    const workers = loadWorkers();

    let agregados = 0;
    let actualizados = 0;
    let omitidos = 0;


    filas.forEach(fila => {

      const nombre = limpiarEspacios(
        obtenerCampoFilaImportada(fila, 'APELLIDOS Y NOMBRES')
      );

      const dni = limpiarEspacios(
        obtenerCampoFilaImportada(fila, 'DETALLE')
      );

      const cargo = limpiarEspacios(
        obtenerCampoFilaImportada(fila, 'CARGO')
      );


      /* Filas basura del Excel: totales, filas vacías, etc. */

      if(
        !nombre ||
        normalizarTexto(nombre) === normalizarTexto('TOTALES S/.')
      ){

        omitidos++;

        return;

      }


      const nombreNormalizado =
        normalizarTexto(nombre);

      const existente = workers.find(w =>

        (dni && w.dni && limpiarEspacios(w.dni) === dni) ||

        (
          !dni &&
          normalizarTexto(w.nombre) === nombreNormalizado
        )

      );


      if(existente){

        existente.nombre = nombre;
        existente.cargo = cargo || existente.cargo;

        if(dni){
          existente.dni = dni;
        }

        actualizados++;

      } else {

        workers.push({

          id:
            'w_' + Date.now() + '_' +
            Math.random().toString(36).slice(2,8),

          nombre,
          dni,
          cargo,
          linea: null,
          estado: 'Activo'

        });

        agregados++;

      }

    });


    saveWorkers(workers);
    renderWorkerList();

    input.value = '';

    alert(
      `Importación lista.\n\n` +
      `Nuevos: ${agregados}\n` +
      `Actualizados: ${actualizados}\n` +
      `Omitidos (filas vacías/inválidas): ${omitidos}`
    );

  };

  lector.readAsText(archivo, 'utf-8');

}   
