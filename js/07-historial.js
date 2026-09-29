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


function personalHistorialCompleto(r){
  const fuentes=[
    r?.personal,
    r?.personalLinea,
    r?.personalTurno,
    r?.personalRegistrado,
    r?.equipo
  ];

  const lista=[];
  const vistos=new Set();

  fuentes.forEach(fuente=>{
    if(!Array.isArray(fuente))return;

    fuente.forEach(p=>{
      if(!p || typeof p!=='object')return;

      const nombre=String(
        p.nombre ??
        p.trabajador ??
        p.nombreCompleto ??
        p.apellidosNombres ??
        ''
      ).trim();

      if(!nombre)return;

      const posicion=String(
        p.posicion ??
        p.puestoLinea ??
        p.ubicacion ??
        p.estacion ??
        p.puesto ??
        ''
      ).trim();

      const cargo=String(
        p.cargo ??
        p.puesto ??
        p.rol ??
        p.funcion ??
        ''
      ).trim();

      const clave=String(
        p.dni ??
        p.id ??
        `${nombre}|${posicion}|${cargo}`
      ).trim().toLowerCase();

      if(vistos.has(clave))return;
      vistos.add(clave);

      lista.push({posicion,nombre,cargo});
    });
  });

  return lista;
}

function observacionesHistorialCompletas(r){
  const valores=[
    r?.observaciones,
    r?.observacion,
    r?.observacionesGenerales,
    r?.observacionGeneral,
    r?.comentarios,
    r?.comentario
  ];

  if(Array.isArray(r?.cuadros)){
    r.cuadros.forEach((q,i)=>{
      [
        q?.observaciones,
        q?.observacion,
        q?.comentarios,
        q?.comentario
      ].forEach(v=>{
        if(String(v??'').trim()){
          valores.push(`Producción ${i+1}: ${String(v).trim()}`);
        }
      });
    });
  }

  return [...new Set(
    valores
      .flatMap(v=>Array.isArray(v)?v:[v])
      .map(v=>{
        if(v && typeof v==='object'){
          return String(
            v.texto ??
            v.descripcion ??
            v.observacion ??
            v.detalle ??
            ''
          ).trim();
        }
        return String(v??'').trim();
      })
      .filter(Boolean)
  )];
}

function instalarEstilosParadasHistorial(){
  if(document.getElementById('hist-report-stops-style'))return;
  const st=document.createElement('style');
  st.id='hist-report-stops-style';
  st.textContent=`
    .hist-report-stops-list{display:grid}
    .hist-report-stop-row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:11px 16px;border-top:1px solid #e6edf1;background:#fff}
    .hist-report-stop-row:first-child{border-top:0}
    .hist-report-stop-row strong{display:block;color:#17334a;font-size:12px}
    .hist-report-stop-row small{display:block;margin-top:2px;color:#6b7d89;font-size:10px}
    .hist-report-stop-row>b{white-space:nowrap;color:#003b5c;font-size:13px}
  `;
  document.head.appendChild(st);
}

function verReporteHistorial(id){
  instalarEstilosParadasHistorial();
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
  const paradasProgramadas=cuadros.flatMap((q,i)=>
    (q.paradasProgramadas||[]).map(p=>({
      cuadro:q.numero||i+1,
      marca:q.marca||'Sin marca',
      descripcion:p.descripcion||p.motivo||p.detalle||p.nombre||'Parada programada',
      minutos:num(p.tiempoMin),
      maquina:p.maquina||p.equipo||p.area||'',
      hora:p.hora||p.horaInicio||p.inicio||'',
      observacion:p.observacion||p.observaciones||p.comentario||''
    }))
  );
  const paradasNoProgramadas=cuadros.flatMap((q,i)=>
    (q.paradasNoProgramadas||[]).map(p=>({
      cuadro:q.numero||i+1,
      marca:q.marca||'Sin marca',
      descripcion:p.descripcion||p.motivo||p.detalle||p.nombre||'Parada no programada',
      minutos:num(p.tiempoMin),
      maquina:p.maquina||p.equipo||p.area||'',
      hora:p.hora||p.horaInicio||p.inicio||'',
      observacion:p.observacion||p.observaciones||p.comentario||''
    }))
  );
  const totalParadasProgramadas=paradasProgramadas.reduce((s,p)=>s+p.minutos,0);
  const totalParadasNoProgramadas=paradasNoProgramadas.reduce((s,p)=>s+p.minutos,0);
  const cumplimiento=totalProgramado>0 ? (totalEfectivo/totalProgramado)*100 : 0;
  const diferenciaProduccion=totalEfectivo-totalProgramado;
  const faltanteProduccion=Math.max(0,totalProgramado-totalEfectivo);
  const excedenteProduccion=Math.max(0,totalEfectivo-totalProgramado);
  const pctParadasProgramadas=totalParadas>0 ? (totalParadasProgramadas/totalParadas)*100 : 0;
  const pctParadasNoProgramadas=totalParadas>0 ? (totalParadasNoProgramadas/totalParadas)*100 : 0;
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
      <details class="hist-report-card hist-report-production-card" data-hist-section="produccion" open>
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

  const renderParadas=(lista,tipo)=>{
    if(!lista.length){
      return `<div class="hist-report-empty" style="padding:14px 16px;">Sin paradas ${tipo} registradas.</div>`;
    }
    return `<div class="hist-report-stops-list">${lista.map(p=>`
      <div class="hist-report-stop-row">
        <div>
          <strong>${esc(p.descripcion)}</strong>
          <small>Producción ${esc(p.cuadro)} · ${esc(p.marca)}${p.maquina?` · ${esc(p.maquina)}`:''}${p.hora?` · ${esc(p.hora)}`:''}</small>
          ${p.observacion?`<em>${esc(p.observacion)}</em>`:''}
        </div>
        <b>${Math.round(p.minutos)} min</b>
      </div>`).join('')}</div>`;
  };

  const fotos=(r.evidenciasPT||[]).filter(e=>e?.url).map((e,i)=>
    `<a class="hist-report-photo" href="${esc(e.url)}" target="_blank" rel="noopener"><img src="${esc(e.url)}" alt="Evidencia PT ${i+1}"><span>PT ${String(i+1).padStart(2,'0')} · Ver evidencia</span></a>`
  ).join('');

  const personalCompleto=personalHistorialCompleto(r);
  const observacionesCompletas=observacionesHistorialCompletas(r);

  const personalHtml=personalCompleto.length
    ? `<div class="hist-report-personal-list">
        ${personalCompleto.map((p,i)=>`
          <div class="hist-report-person-row">
            <span class="hist-report-person-num">${String(i+1).padStart(2,'0')}</span>
            <div><strong>${esc(p.nombre)}</strong><small>${esc(p.cargo||'Sin cargo registrado')}</small></div>
            <b>${esc(p.posicion||'—')}</b>
          </div>`).join('')}
      </div>`
    : `<div class="hist-report-empty">Sin personal registrado para este turno.</div>`;

  const observacionesHtml=observacionesCompletas.length
    ? `<div class="hist-report-observations-list">
        ${observacionesCompletas.map((o,i)=>`
          <div class="hist-report-observation-row">
            <span>${String(i+1).padStart(2,'0')}</span>
            <p>${esc(o)}</p>
          </div>`).join('')}
      </div>`
    : `<div class="hist-report-empty">Sin observaciones registradas.</div>`;

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

      <nav class="hist-report-nav" aria-label="Secciones del reporte">
        <button type="button" data-hist-target="hist-resumen">Resumen</button>
        <button type="button" data-hist-target="hist-produccion" data-hist-open="produccion">Producción</button>
        <button type="button" data-hist-target="hist-paradas" data-hist-open="paradas">Paradas</button>
        <button type="button" data-hist-target="hist-personal" data-hist-open="personal">Personal</button>
        <button type="button" data-hist-target="hist-observaciones" data-hist-open="observaciones">Observaciones</button>
        <button type="button" data-hist-target="hist-documentos" data-hist-open="documentos">Documentos</button>
      </nav>

      <div class="hist-report-body" data-hist-report-scroll style="min-height:0;overflow-y:auto!important;overflow-x:hidden!important;">
        <div id="hist-resumen" class="hist-report-anchor"></div>
        <section class="hist-report-kpis">
          <div><small>Producción total</small><strong>${Math.round(totalEfectivo).toLocaleString('es-PE')}</strong><span>UND</span></div>
          <div><small>Programado</small><strong>${Math.round(totalProgramado).toLocaleString('es-PE')}</strong><span>UND</span></div>
          <div class="hist-kpi-cumplimiento">
            <small>Cumplimiento</small><strong>${cumplimiento.toFixed(1)}%</strong>
            <div class="hist-kpi-progress"><i style="width:${Math.min(100,Math.max(0,cumplimiento)).toFixed(1)}%"></i></div>
            <span>${diferenciaProduccion<0?`Faltan ${Math.round(faltanteProduccion).toLocaleString('es-PE')} UND`:`Excedente ${Math.round(excedenteProduccion).toLocaleString('es-PE')} UND`}</span>
          </div>
          <div><small>Paradas</small><strong>${Math.round(totalParadas)}</strong><span>min totales</span></div>
          <div><small>Programadas</small><strong>${Math.round(totalParadasProgramadas)}</strong><span>min</span></div>
          <div><small>No programadas</small><strong>${Math.round(totalParadasNoProgramadas)}</strong><span>min</span></div>
        </section>

        <div id="hist-produccion" class="hist-report-section-title hist-report-anchor"><span>Producción por cuadro</span><small>${cuadrosFinalizados}/${cuadros.length} finalizados</small></div>
        <div class="hist-report-production-list">
          ${tarjetas || '<div class="empty-state">Sin cuadros utilizados.</div>'}
        </div>

        <section id="hist-paradas" class="hist-report-stop-summary hist-report-anchor">
          <div>
            <small>Paradas totales</small>
            <strong>${Math.round(totalParadas)} min</strong>
          </div>
          <div>
            <small>Programadas</small>
            <strong>${Math.round(totalParadasProgramadas)} min</strong>
            <span>${pctParadasProgramadas.toFixed(1)}% del total</span>
          </div>
          <div>
            <small>No programadas</small>
            <strong>${Math.round(totalParadasNoProgramadas)} min</strong>
            <span>${pctParadasNoProgramadas.toFixed(1)}% del total</span>
          </div>
        </section>

        <details class="hist-report-card hist-report-secondary" data-hist-section="paradas" open>
          <summary class="hist-report-card-head">
            <div class="hist-report-card-title"><span class="hist-report-section-icon">🟡</span><strong>Paradas programadas</strong></div>
            <div class="hist-report-card-state"><span class="hist-report-count">${Math.round(totalParadasProgramadas)} min</span><span class="hist-report-chevron">⌄</span></div>
          </summary>
          ${renderParadas(paradasProgramadas,'programadas')}
        </details>

        <details class="hist-report-card hist-report-secondary" data-hist-section="paradas" open>
          <summary class="hist-report-card-head">
            <div class="hist-report-card-title"><span class="hist-report-section-icon">🔴</span><strong>Paradas no programadas</strong></div>
            <div class="hist-report-card-state"><span class="hist-report-count">${Math.round(totalParadasNoProgramadas)} min</span><span class="hist-report-chevron">⌄</span></div>
          </summary>
          ${renderParadas(paradasNoProgramadas,'no programadas')}
        </details>

        <div id="hist-personal" class="hist-report-section-title hist-report-anchor">
          <span>Personal del turno</span><small>${personalCompleto.length} registrados</small>
        </div>
        <details class="hist-report-card hist-report-secondary" data-hist-section="personal" open>
          <summary class="hist-report-card-head">
            <div class="hist-report-card-title"><span class="hist-report-section-icon">👥</span><strong>Personal del turno</strong></div>
            <div class="hist-report-card-state"><span class="hist-report-count">${personalCompleto.length}</span><span class="hist-report-chevron">⌄</span></div>
          </summary>
          ${personalHtml}
        </details>

        <div id="hist-observaciones" class="hist-report-section-title hist-report-anchor">
          <span>Observaciones</span><small>${observacionesCompletas.length} registros</small>
        </div>
        <details class="hist-report-card hist-report-secondary" data-hist-section="observaciones" open>
          <summary class="hist-report-card-head">
            <div class="hist-report-card-title"><span class="hist-report-section-icon">📝</span><strong>Observaciones del reporte</strong></div>
            <div class="hist-report-card-state"><span class="hist-report-count">${observacionesCompletas.length}</span><span class="hist-report-chevron">⌄</span></div>
          </summary>
          ${observacionesHtml}
        </details>

        <div id="hist-documentos" class="hist-report-section-title hist-report-anchor">
          <span>Documentos</span><small>${(r.evidenciasPT||[]).filter(e=>e?.url).length} archivos</small>
        </div>
        <details class="hist-report-card hist-report-secondary" data-hist-section="documentos" ${(r.evidenciasPT||[]).some(e=>e?.url)?'open':''}>
          <summary class="hist-report-card-head">
            <div class="hist-report-card-title"><span class="hist-report-section-icon">▣</span><strong>Hojas de Producto Terminado</strong></div>
            <div class="hist-report-card-state"><span class="hist-report-count">${(r.evidenciasPT||[]).filter(e=>e?.url).length} archivos</span><span class="hist-report-chevron">⌄</span></div>
          </summary>
          <div class="hist-report-photos">${fotos||'<span class="hist-report-empty">Sin fotografías disponibles.</span>'}</div>
        </details>
        <div class="hist-report-scroll-end">Fin del reporte</div>
      </div>

      <div class="hist-report-scroll-hint" data-hist-scroll-hint>↓ Desplázate para ver más</div>

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

  document.body.dataset.histReportOverflow=document.body.style.overflow||'';
  document.body.style.overflow='hidden';

  const bodyScroll=modal.querySelector('[data-hist-report-scroll]');
  const hint=modal.querySelector('[data-hist-scroll-hint]');

  const actualizarHint=()=>{
    if(!bodyScroll || !hint)return;
    const faltan=Math.ceil(bodyScroll.scrollHeight-bodyScroll.scrollTop-bodyScroll.clientHeight);
    hint.classList.toggle('is-hidden',faltan<=8);
  };

  const irASeccion=(btn)=>{
    if(!bodyScroll)return;

    const grupo=btn.dataset.histOpen;
    if(grupo){
      modal.querySelectorAll(`[data-hist-section="${grupo}"]`).forEach(det=>{
        if(det.tagName==='DETAILS')det.open=true;
      });
    }

    const destino=modal.querySelector('#'+btn.dataset.histTarget);
    if(!destino)return;

    modal.querySelectorAll('.hist-report-nav button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');

    const bodyRect=bodyScroll.getBoundingClientRect();
    const targetRect=destino.getBoundingClientRect();
    const top=bodyScroll.scrollTop+(targetRect.top-bodyRect.top)-10;

    bodyScroll.scrollTo({
      top:Math.max(0,top),
      behavior:'smooth'
    });

    setTimeout(actualizarHint,350);
  };

  modal.querySelectorAll('[data-hist-target]').forEach(btn=>{
    btn.addEventListener('click',()=>irASeccion(btn));
  });

  modal.querySelector('[data-hist-target="hist-resumen"]')?.classList.add('active');

  bodyScroll?.addEventListener('scroll',actualizarHint,{passive:true});
  requestAnimationFrame(actualizarHint);

  const onEsc=e=>{
    if(e.key==='Escape'){
      document.removeEventListener('keydown',onEsc);
      cerrarReporteHistorial();
    }
  };
  modal._histEscHandler=onEsc;
  document.addEventListener('keydown',onEsc);
}

function cerrarReporteHistorial(){
  const modal=document.getElementById('hist-report-modal');
  if(modal?._histEscHandler){
    document.removeEventListener('keydown',modal._histEscHandler);
  }
  modal?.remove();
  if(document.body.dataset.histReportOverflow!==undefined){
    document.body.style.overflow=document.body.dataset.histReportOverflow;
    delete document.body.dataset.histReportOverflow;
  }
}