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
                  const d = calcDerived(r);
                  const q1 = r.cuadros?.find(q => num(q.produccion?.efectiva) > 0 || q.marca || q.presentacion) || r.cuadros?.[0] || {};


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
                            q1.lote || r.lote || '—'
                          }
                        </strong>
                      </td>


                      <td>
                        ${
                          num(d.efectiva ?? r.produccion?.efectiva)
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
   ELIMINAR REGISTRO
   ========================================================= */

function deleteRecord(id){
  if(!tienePermiso('eliminarRegistros')){
    alert('No tienes permiso para eliminar registros.');
    return;
  }
  saveRecords(loadRecords().filter(r=>r.id!==id));
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

