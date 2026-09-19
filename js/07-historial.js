/* =============================================================
   HISTORIAL DE REGISTROS
   Parte del sistema GLACIAL — dividido a partir de app.js
   ============================================================= */


/* =========================================================
   HISTORIAL
   ========================================================= */

function renderHistorialTab(){

  const c =
    document.getElementById(
      'tab-content'
    );


  const records =

    loadRecords()

      .filter(
        r => r.linea === state.currentLine
      )

      .sort(
        (a,b) =>
          (b.timestamp || '')
            .localeCompare(
              a.timestamp || ''
            )
      );


  if(records.length === 0){

    c.innerHTML = `

      <div class="panel">

        <div class="empty-state">

          <h4>
            Sin registros todavía
          </h4>

          <p>
            Los reportes que guardes
            en "Nuevo registro"
            para esta línea
            aparecerán aquí.
          </p>

        </div>

      </div>

    `;

    return;

  }


  c.innerHTML = `

    <div class="panel">

      <div
        class="panel-body"
        style="padding:0;"
      >

        <table>

          <thead>

            <tr>

              <th>
                Fecha
              </th>

              <th>
                Día juliano
              </th>

              <th>
                Semana
              </th>

              <th>
                Turno
              </th>

              <th>
                Marca
              </th>

              <th>
                Presentación
              </th>

              <th>
                Lote
              </th>

              <th>
                Prod. efectiva
              </th>

              <th>
                OEE
              </th>

              <th>
                Evidencias PT
              </th>

              <th>
                Registrado por
              </th>

              <th>
              </th>

            </tr>

          </thead>


          <tbody>

            ${

              records.map(

                r => {

                  normalizarCuadros(r);

                  const d =
                    calcDerived(r);


                  const q1 =
                    r.cuadros?.find(
                      q =>
                        num(q.produccion?.efectiva) > 0 ||
                        q.marca ||
                        q.presentacion
                    )
                    ||
                    r.cuadros?.[0]
                    ||
                    {};


                  const diaAño =
                    r.diaJuliano ||
                    obtenerDiaDelAño(
                      r.fecha
                    );


                  const semana =
                    r.semana ||
                    obtenerSemana(
                      r.fecha
                    );


                  const evidencias =
                    Array.isArray(
                      r.evidenciasPT
                    )
                      ? r.evidenciasPT
                      : [];


                  const cantidadEvidencias =
                    evidencias.length;


                  return `

                    <tr
                      class="hist-row"
                      onclick="
                        viewRecord(
                          '${r.id}'
                        )
                      "
                    >

                      <td>
                        ${r.fecha}
                      </td>


                      <td>
                        ${diaAño || '—'}
                      </td>


                      <td>
                        ${semana || '—'}
                      </td>


                      <td>
                        ${r.turno}
                      </td>


                      <td>
                        ${r.marca || '—'}
                      </td>


                      <td>
                        ${r.presentacion || '—'}
                      </td>


                      <td>
                        <strong>
                          ${
                            q1.lote ||
                            r.lote ||
                            '—'
                          }
                        </strong>
                      </td>


                      <td>
                        ${
                          num(
                            d.efectiva ??
                            r.produccion?.efectiva
                          )
                          .toLocaleString(
                            'es-PE'
                          )
                        }
                      </td>


                      <td>

                        <span
                          class="
                            badge
                            ${badgeClass(d.oee)}
                          "
                        >
                          ${pct(d.oee)}
                        </span>

                      </td>


                      <td>

                        ${
                          cantidadEvidencias > 0

                            ? `

                              <button
                                type="button"
                                onclick="
                                  event.stopPropagation();
                                  verEvidenciasPTHistorial(
                                    '${r.id}'
                                  )
                                "
                                style="
                                  border:1px solid #B9DEC9;
                                  background:#ECF9F1;
                                  color:#168052;
                                  border-radius:6px;
                                  padding:5px 9px;
                                  cursor:pointer;
                                  font-size:12px;
                                  font-weight:600;
                                  white-space:nowrap;
                                "
                              >
                                📷
                                ${cantidadEvidencias}
                                archivo${cantidadEvidencias === 1 ? '' : 's'}
                              </button>

                            `

                            : `

                              <span
                                style="
                                  display:inline-flex;
                                  align-items:center;
                                  gap:5px;
                                  padding:5px 8px;
                                  border-radius:6px;
                                  background:#FFF4F4;
                                  color:#B33A3A;
                                  font-size:12px;
                                  font-weight:600;
                                  white-space:nowrap;
                                "
                              >
                                🔴 Sin archivos
                              </span>

                            `
                        }

                      </td>


                      <td
                        class="small-muted"
                      >
                        ${
                          r.registradoPor ||
                          '—'
                        }
                      </td>


                      <td>

                        <button
                          class="row-del"
                          onclick="
                            event.stopPropagation();
                            deleteRecord(
                              '${r.id}'
                            )
                          "
                        >
                          ✕
                        </button>

                      </td>


                    </tr>

                  `;

                }

              ).join('')

            }

          </tbody>

        </table>

      </div>

    </div>

  `;

}


/* =========================================================
   VER EVIDENCIAS PT
   ========================================================= */

function verEvidenciasPTHistorial(id){

  const record =
    loadRecords().find(
      r => r.id === id
    );


  if(!record){

    alert(
      'No se encontró el registro.'
    );

    return;

  }


  const evidencias =
    Array.isArray(
      record.evidenciasPT
    )
      ? record.evidenciasPT
      : [];


  if(!evidencias.length){

    alert(
      'Este registro no tiene fotografías de las Hojas de Producto Terminado.'
    );

    return;

  }


  const existente =
    document.getElementById(
      'modal-evidencias-pt'
    );


  if(existente){

    existente.remove();

  }


  const modal =
    document.createElement(
      'div'
    );


  modal.id =
    'modal-evidencias-pt';


  modal.innerHTML = `

    <div
      onclick="cerrarModalEvidenciasPT(event)"
      style="
        position:fixed;
        inset:0;
        z-index:99999;
        background:rgba(0,0,0,.72);
        display:flex;
        align-items:center;
        justify-content:center;
        padding:20px;
        box-sizing:border-box;
      "
    >

      <div
        onclick="event.stopPropagation();"
        style="
          width:min(1000px,96vw);
          max-height:90vh;
          overflow:auto;
          background:#fff;
          border-radius:10px;
          box-shadow:0 20px 60px rgba(0,0,0,.35);
        "
      >

        <div
          style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:15px;
            padding:16px 18px;
            border-bottom:1px solid #D7DBD4;
          "
        >

          <div>

            <div
              style="
                font-size:17px;
                font-weight:700;
                color:#003B5C;
              "
            >
              📷 Hojas de Producto Terminado
            </div>

            <div
              style="
                margin-top:3px;
                font-size:12px;
                color:#6B7780;
              "
            >
              ${record.fecha || '—'}
              ·
              ${record.linea || '—'}
              ·
              ${record.turno || '—'}
            </div>

          </div>


          <button
            type="button"
            onclick="cerrarModalEvidenciasPT()"
            style="
              width:34px;
              height:34px;
              border:0;
              border-radius:50%;
              background:#F1F3F4;
              color:#333;
              cursor:pointer;
              font-size:18px;
              font-weight:700;
            "
            title="Cerrar"
          >
            ✕
          </button>

        </div>


        <div
          style="
            padding:18px;
          "
        >

          <div
            style="
              margin-bottom:14px;
              font-size:13px;
              color:#59656D;
            "
          >
            ${evidencias.length}
            archivo${evidencias.length === 1 ? '' : 's'}
            adjunto${evidencias.length === 1 ? '' : 's'}
          </div>


          <div
            style="
              display:grid;
              grid-template-columns:
                repeat(
                  auto-fill,
                  minmax(220px,1fr)
                );
              gap:14px;
            "
          >

            ${

              evidencias.map(

                (foto,index) => {

                  const url =
                    foto.url || '';


                  const nombre =
                    foto.nombre ||
                    `Fotografía ${index + 1}`;


                  return `

                    <div
                      style="
                        border:1px solid #D7DBD4;
                        border-radius:8px;
                        overflow:hidden;
                        background:#F7F9FA;
                      "
                    >

                      <a
                        href="${escapeHtmlPTHistorial(url)}"
                        target="_blank"
                        rel="noopener noreferrer"
                        onclick="event.stopPropagation();"
                        style="
                          display:block;
                          text-decoration:none;
                        "
                      >

                        <img
                          src="${escapeHtmlPTHistorial(url)}"
                          alt="${escapeHtmlPTHistorial(nombre)}"
                          style="
                            display:block;
                            width:100%;
                            height:180px;
                            object-fit:cover;
                            background:#eee;
                          "
                        >

                      </a>


                      <div
                        style="
                          padding:9px;
                        "
                      >

                        <div
                          style="
                            font-size:12px;
                            font-weight:600;
                            color:#34424B;
                            white-space:nowrap;
                            overflow:hidden;
                            text-overflow:ellipsis;
                          "
                          title="${escapeHtmlPTHistorial(nombre)}"
                        >
                          ${escapeHtmlPTHistorial(nombre)}
                        </div>


                        <a
                          href="${escapeHtmlPTHistorial(url)}"
                          target="_blank"
                          rel="noopener noreferrer"
                          onclick="event.stopPropagation();"
                          style="
                            display:inline-block;
                            margin-top:7px;
                            color:#005B96;
                            font-size:12px;
                            font-weight:600;
                            text-decoration:none;
                          "
                        >
                          🔍 Ver imagen
                        </a>

                      </div>

                    </div>

                  `;

                }

              ).join('')

            }

          </div>

        </div>

      </div>

    </div>

  `;


  document.body.appendChild(
    modal
  );

}


function escapeHtmlPTHistorial(value){

  return String(value ?? '')
    .replace(
      /&/g,
      '&amp;'
    )
    .replace(
      /</g,
      '&lt;'
    )
    .replace(
      />/g,
      '&gt;'
    )
    .replace(
      /"/g,
      '&quot;'
    )
    .replace(
      /'/g,
      '&#039;'
    );

}


function cerrarModalEvidenciasPT(event){

  if(
    event &&
    event.target !== event.currentTarget
  ){

    return;

  }


  const modal =
    document.getElementById(
      'modal-evidencias-pt'
    );


  if(modal){

    modal.remove();

  }

}


/* =========================================================
   ELIMINAR REGISTRO
   ========================================================= */

function deleteRecord(id){

  if(
    !tienePermiso(
      'eliminarRegistros'
    )
  ){

    alert(
      'No tienes permiso para eliminar registros.'
    );

    return;

  }


  saveRecords(
    loadRecords()
      .filter(
        r => r.id !== id
      )
  );


  renderHistorialTab();

}


/* =========================================================
   VER REGISTRO
   ========================================================= */

function viewRecord(id){

  state.viewingRecordId = id;

  state.currentTab = 'graficos';

  renderMain();

}