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
                Estado
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

                    <tr class="hist-row">

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
                        <span class="reporte-estado-badge ${(r.estadoRegistro||'FINALIZADO').toLowerCase()}">
                          ${(r.estadoRegistro||'FINALIZADO').replaceAll('_',' ')}
                        </span>
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
  <div class="hist-actions">
    <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();verReporteHistorial('${r.id}')">👁 Ver reporte</button>
    <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();vergraficosHistorial('${r.id}')">📊 graficos</button>
    ${r.estadoRegistro==='REABIERTO'
      ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();cargarReporteParaCorreccion('${r.id}')">✏️ Continuar</button>`
      : ''}
    ${r.estadoRegistro==='FINALIZADO' && typeof usuarioPuedeReabrirReporte==='function' && usuarioPuedeReabrirReporte()
      ? `<button class="btn btn-ghost btn-sm" title="Reabrir reporte" onclick="event.stopPropagation();reabrirReporteProduccion('${r.id}')">🔓</button>`
      : ''}
    <button class="row-del" onclick="event.stopPropagation();deleteRecord('${r.id}')">✕</button>
  </div>
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

function vergraficosHistorial(id){
  state.viewingRecordId=id;
  state.currentTab='graficos';
  renderMain();
}

function viewRecord(id){
  verReporteHistorial(id);
}

function verReporteHistorial(id){
  const r=loadRecords().find(x=>x.id===id);
  if(!r) return;
  normalizarCuadros(r);

  const esc=v=>String(v??'—')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const cuadros=(r.cuadros||[]).filter(q=>
    q.marca || q.presentacion || q.horaInicio || q.horaFin ||
    num(q.produccion?.efectiva)>0 || num(q.produccion?.programada)>0
  );

  const totalProgramado=cuadros.reduce((s,q)=>s+num(q.produccion?.programada),0);
  const totalEfectivo=cuadros.reduce((s,q)=>s+num(q.produccion?.efectiva),0);
  const totalParadas=cuadros.reduce((s,q)=>
    s+(q.paradasProgramadas||[]).reduce((a,p)=>a+num(p.tiempoMin),0)
     +(q.paradasNoProgramadas||[]).reduce((a,p)=>a+num(p.tiempoMin),0),0);
  const personalLista=(r.personal||[]).filter(p=>String(p.nombre||'').trim());
  const cumplimiento=totalProgramado>0 ? (totalEfectivo/totalProgramado)*100 : 0;
  const cuadrosFinalizados=cuadros.filter(q=>q.estadoCuadro==='FINALIZADO').length;
  const todosFinalizados=cuadros.length>0 && cuadrosFinalizados===cuadros.length;
  const estadoReporte=String(r.estadoRegistro||'FINALIZADO').replaceAll('_',' ');
  const estadoInconsistente=estadoReporte==='FINALIZADO' && !todosFinalizados;

  const tarjetas=cuadros.map((q,i)=>{
    const prog=(q.paradasProgramadas||[]).reduce((s,p)=>s+num(p.tiempoMin),0);
    const nprog=(q.paradasNoProgramadas||[]).reduce((s,p)=>s+num(p.tiempoMin),0);
    const efectiva=num(q.produccion?.efectiva);
    const programada=num(q.produccion?.programada);
    const pct=programada>0 ? Math.min(100,(efectiva/programada)*100) : 0;
    const finalizado=q.estadoCuadro==='FINALIZADO';
    return `
      <details class="hist-report-card hist-report-production-card" ${finalizado?'':'open'}>
        <summary class="hist-report-card-head">
          <div class="hist-report-card-title">
            <span class="hist-report-number">${String(q.numero||i+1).padStart(2,'0')}</span>
            <span>
              <strong>${esc(q.marca||'Sin marca')}</strong>
              <small>${esc(q.presentacion||'Sin presentación')}</small>
            </span>
          </div>
          <div class="hist-report-card-state">
            <span class="reporte-estado-badge ${(q.estadoCuadro||'EN_REGISTRO').toLowerCase()}">${finalizado?'FINALIZADO':'EN REGISTRO'}</span>
            <span class="hist-report-chevron">⌄</span>
          </div>
        </summary>
        <div class="hist-report-progress"><span style="width:${pct.toFixed(1)}%"></span></div>
        <div class="hist-report-grid">
          <div><small>Lote</small><b>${esc(q.lote)}</b></div>
          <div><small>Hora inicio</small><b>${esc(q.horaInicio)}</b></div>
          <div><small>Hora fin</small><b>${esc(q.horaFin)}</b></div>
          <div><small>Avance</small><b>${pct.toFixed(1)}%</b></div>
          <div><small>Programada</small><b>${Math.round(programada).toLocaleString('es-PE')} UND</b></div>
          <div><small>Producción efectiva</small><b>${Math.round(efectiva).toLocaleString('es-PE')} UND</b></div>
          <div><small>Paradas programadas</small><b>${prog} min</b></div>
          <div><small>Paradas no programadas</small><b>${nprog} min</b></div>
        </div>
      </details>`;
  }).join('');

  const personal=personalLista.map(p=>
    `<tr><td>${esc(p.posicion)}</td><td><strong>${esc(p.nombre)}</strong></td><td>${esc(p.cargo)}</td></tr>`
  ).join('');

  const fotos=(r.evidenciasPT||[]).filter(e=>e?.url).map((e,i)=>
    `<a class="hist-report-photo" href="${esc(e.url)}" target="_blank" rel="noopener"><img src="${esc(e.url)}" alt="Evidencia PT ${i+1}"><span>PT ${String(i+1).padStart(2,'0')} · Ver evidencia</span></a>`
  ).join('');

  const modal=document.createElement('div');
  modal.className='hist-report-modal';
  modal.id='hist-report-modal';
  modal.innerHTML=`
    <div class="hist-report-dialog">
      <header class="hist-report-top">
        <div class="hist-report-heading">
          <span class="hist-report-line">${esc(r.linea)}</span>
          <div>
            <h2>Reporte de producción</h2>
            <p>${esc(r.fecha)} · ${r.grupoTurno==='DIA_INTERMEDIO'?'DÍA + INTERMEDIO':esc(r.turno)}</p>
          </div>
        </div>
        <div class="hist-report-top-actions">
          <span class="hist-report-main-status ${estadoInconsistente?'warn':''}">${estadoInconsistente?'REPORTE CERRADO':esc(estadoReporte)}</span>
          <button class="hist-report-close" onclick="cerrarReporteHistorial()" aria-label="Cerrar reporte">✕</button>
        </div>
      </header>

      <div class="hist-report-trace">
        <span><small>Iniciado por</small><b>${esc(r.registradoPor)}</b></span>
        ${r.continuadoPor?`<span><small>Continuado por</small><b>${esc(r.continuadoPor)}</b></span>`:''}
        ${r.finalizadoPor?`<span><small>Finalizado por</small><b>${esc(r.finalizadoPor)}</b></span>`:''}
        ${estadoInconsistente?`<span class="hist-report-warning"><small>Validación</small><b>${cuadrosFinalizados}/${cuadros.length} cuadros finalizados</b></span>`:''}
      </div>

      <div class="hist-report-body">
        <section class="hist-report-kpis">
          <div><small>Producción total</small><strong>${Math.round(totalEfectivo).toLocaleString('es-PE')}</strong><span>UND</span></div>
          <div><small>Programado</small><strong>${Math.round(totalProgramado).toLocaleString('es-PE')}</strong><span>UND</span></div>
          <div><small>Cumplimiento</small><strong>${cumplimiento.toFixed(1)}%</strong><span>Producción / meta</span></div>
          <div><small>Paradas</small><strong>${Math.round(totalParadas)}</strong><span>min</span></div>
          <div><small>Personal</small><strong>${personalLista.length}</strong><span>personas</span></div>
        </section>

        <div class="hist-report-section-title"><span>Producción por cuadro</span><small>${cuadrosFinalizados}/${cuadros.length} finalizados</small></div>
        <div class="hist-report-production-list">
          ${tarjetas || '<div class="empty-state">Sin cuadros utilizados.</div>'}
        </div>

        <details class="hist-report-card hist-report-secondary">
          <summary class="hist-report-card-head">
            <div class="hist-report-card-title"><span class="hist-report-section-icon">👥</span><strong>Personal del turno</strong></div>
            <div class="hist-report-card-state"><span class="hist-report-count">${personalLista.length} personas</span><span class="hist-report-chevron">⌄</span></div>
          </summary>
          <div class="table-scroll"><table><thead><tr><th>Posición</th><th>Nombre</th><th>Cargo</th></tr></thead><tbody>${personal||'<tr><td colspan="3">Sin datos</td></tr>'}</tbody></table></div>
        </details>

        <details class="hist-report-card hist-report-secondary">
          <summary class="hist-report-card-head">
            <div class="hist-report-card-title"><span class="hist-report-section-icon">📝</span><strong>Observaciones generales</strong></div>
            <span class="hist-report-chevron">⌄</span>
          </summary>
          <p class="hist-report-observacion">${esc(r.observaciones||'Sin observaciones')}</p>
        </details>

        <details class="hist-report-card hist-report-secondary" ${(r.evidenciasPT||[]).some(e=>e?.url)?'open':''}>
          <summary class="hist-report-card-head">
            <div class="hist-report-card-title"><span class="hist-report-section-icon">▣</span><strong>Hojas de Producto Terminado</strong></div>
            <div class="hist-report-card-state"><span class="hist-report-count">${(r.evidenciasPT||[]).filter(e=>e?.url).length} archivos</span><span class="hist-report-chevron">⌄</span></div>
          </summary>
          <div class="hist-report-photos">${fotos||'<span class="hist-report-empty">Sin fotografías disponibles.</span>'}</div>
        </details>
      </div>

      <footer class="hist-report-footer">
        <span class="hist-report-footer-note">GLACIAL · Control de producción</span>
        <div>
          <button class="btn btn-ghost" onclick="cerrarReporteHistorial();vergraficosHistorial('${r.id}')">📊 Ver gráficos</button>
          ${r.estadoRegistro==='REABIERTO'
            ? `<button class="btn btn-primary" onclick="cerrarReporteHistorial();cargarReporteParaCorreccion('${r.id}')">✏️ Continuar reporte</button>`
            : ''}
          <button class="btn btn-primary" onclick="cerrarReporteHistorial()">Cerrar</button>
        </div>
      </footer>
    </div>`;
  modal.addEventListener('click',e=>{if(e.target===modal) cerrarReporteHistorial();});
  document.body.appendChild(modal);
}

function cerrarReporteHistorial(){
  document.getElementById('hist-report-modal')?.remove();
}