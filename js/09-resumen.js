/* =============================================================
   RESUMEN GENERAL
   Parte del sistema GLACIAL — dividido a partir de app.js
   ============================================================= */


/* =========================================================
   RESUMEN GENERAL — TABLERO EJECUTIVO
   =========================================================

   A diferencia de la pestaña "Gráficos" (que analiza un
   registro puntual de UNA línea), este resumen junta TODAS
   las líneas que la persona puede ver y muestra lo que le
   importa a gerencia de un vistazo: cuánto se produjo, en
   qué turno, en qué línea, y qué tan cerca está la planta
   de su meta de OEE — en el rango de fechas elegido.
   ========================================================= */

let resumenRangoDias = 30;

/* null = todo el historial disponible */

function cambiarRangoResumen(dias){

  resumenRangoDias = dias;

  renderResumen(
    document.getElementById('main')
  );

}


/*
   Clasificación "menor es mejor" (para la merma), en
   contraste con statusClass() que asume "mayor es mejor"
   (OEE, disponibilidad).
*/

function statusClassInverso(valor, meta){

  if(valor <= meta){
    return 'is-good';
  }

  if(valor <= meta * 1.15){
    return 'is-warn';
  }

  return 'is-bad';

}


function produccionEfectivaRecord(r){

  const d = calcDerived(r);

  return num(
    d.efectiva ?? r.produccion?.efectiva
  );

}


function filtrarPorRangoResumen(records){

  if(!resumenRangoDias || !records.length){
    return records;
  }

  const fechaMasReciente =

    records.reduce(

      (max, r) =>
        (r.fecha || '') > max ? r.fecha : max,

      records[0].fecha || ''

    );

  if(!fechaMasReciente){
    return records;
  }

  const limite =
    new Date(fechaMasReciente + 'T00:00:00');

  limite.setDate(
    limite.getDate() - (resumenRangoDias - 1)
  );

  return records.filter(

    r =>
      r.fecha &&
      new Date(r.fecha + 'T00:00:00') >= limite

  );

}


/* =========================================================
   KPIs DE PLANTA (TODAS LAS LÍNEAS VISIBLES, RANGO ELEGIDO)
   ========================================================= */

function calcularKPIsPlanta(records){

  let horas = 0;
  let oeeXhoras = 0;
  let dispXhoras = 0;
  let efectivaTotal = 0;
  let mermaTotal = 0;

  records.forEach(r => {

    const d = calcDerived(r);
    const h = num(d.horasEfectivas);

    efectivaTotal += produccionEfectivaRecord(r);

    mermaTotal +=
      agruparMermas(r).totalUnidades;

    if(h > 0){

      horas += h;
      oeeXhoras += d.oee * h;
      dispXhoras += num(d.disponibilidad) * h;

    }

  });

  return {

    oee: horas > 0 ? oeeXhoras / horas : 0,

    disponibilidad:
      horas > 0 ? dispXhoras / horas : 0,

    efectivaTotal,

    mermaPct:
      efectivaTotal > 0
        ? mermaTotal / efectivaTotal
        : 0

  };

}


/* =========================================================
   PALETA DE COLORES PARA SERIES DINÁMICAS
   (presentaciones, marcas, etc. — cantidad variable)
   ========================================================= */

function coloresResumen(n){

  const colores = [];

  for(let i = 0; i < n; i++){

    const hue = Math.round((360 / Math.max(n, 1)) * i);

    colores.push(`hsl(${hue} 62% 52%)`);

  }

  return colores;

}


/* =========================================================
   PRODUCCIÓN POR DÍA, DESGLOSADA POR PRESENTACIÓN
   (TODAS LAS LÍNEAS VISIBLES)
   ========================================================= */

function sumarProduccionPorDiaYPresentacion(records){

  const acumulado = {};
  const presentacionesSet = new Set();

  records.forEach(r => {

    const fecha = r.fecha;

    if(!fecha){
      return;
    }

    const cuadros = normalizarCuadros(r);

    cuadros.forEach(c => {

      const efectiva = num(c.produccion?.efectiva);

      if(efectiva <= 0){
        return;
      }

      const presentacion = c.presentacion || 'Sin presentación';

      presentacionesSet.add(presentacion);

      if(!acumulado[fecha]){
        acumulado[fecha] = {};
      }

      acumulado[fecha][presentacion] =
        (acumulado[fecha][presentacion] || 0) + efectiva;

    });

  });

  const fechas =
    Object.keys(acumulado)
      .sort((a,b) => a.localeCompare(b));

  const presentaciones =
    Array.from(presentacionesSet)
      .sort((a,b) => a.localeCompare(b));

  return { fechas, presentaciones, acumulado };

}


/* =========================================================
   PRODUCCIÓN POR MARCA (TOTAL DEL RANGO ELEGIDO,
   TODAS LAS LÍNEAS VISIBLES)
   ========================================================= */

function sumarProduccionPorMarca(records){

  const acumulado = {};

  records.forEach(r => {

    const cuadros = normalizarCuadros(r);

    const lineaInfo = LINES.find(l => l.key === r.linea);
    const lineaNombre = lineaInfo ? lineaInfo.name : (r.linea || '');

    cuadros.forEach(c => {

      const efectiva = num(c.produccion?.efectiva);

      if(efectiva <= 0){
        return;
      }

      const marca = c.marca || 'Sin marca';

      if(!acumulado[marca]){
        acumulado[marca] = { marca, total: 0, lineas: new Set() };
      }

      acumulado[marca].total += efectiva;

      if(lineaNombre){
        acumulado[marca].lineas.add(lineaNombre);
      }

    });

  });

  return Object.values(acumulado)

    .map(x => ({
      marca: x.marca,
      total: x.total,
      lineas: Array.from(x.lineas).sort().join(', ')
    }))

    .sort((a,b) => b.total - a.total);

}


/* =========================================================
   PRODUCCIÓN POR DÍA (TOTAL, TODAS LAS LÍNEAS VISIBLES)
   ========================================================= */

function sumarProduccionPorDia(records){

  const acumulado = {};

  records.forEach(r => {

    const fecha = r.fecha;

    if(!fecha){
      return;
    }

    acumulado[fecha] =
      (acumulado[fecha] || 0) +
      produccionEfectivaRecord(r);

  });

  return Object.entries(acumulado)

    .map(([fecha, total]) => ({ fecha, total }))

    .sort(
      (a,b) => a.fecha.localeCompare(b.fecha)
    );

}


/* =========================================================
   PRODUCCIÓN POR TURNO (DÍA / INTERMEDIO / NOCHE)
   ========================================================= */

const ORDEN_TURNOS = ['DÍA', 'INTERMEDIO', 'NOCHE'];

function sumarProduccionPorTurno(records){

  const acumulado = {};

  records.forEach(r => {

    const turno =
      (r.turno || 'Sin turno').trim();

    acumulado[turno] =
      (acumulado[turno] || 0) +
      produccionEfectivaRecord(r);

  });

  return Object.entries(acumulado)

    .map(([turno, total]) => ({ turno, total }))

    .sort((a,b) => {

      const ia = ORDEN_TURNOS.indexOf(a.turno);
      const ib = ORDEN_TURNOS.indexOf(b.turno);

      if(ia === -1 && ib === -1){
        return a.turno.localeCompare(b.turno);
      }

      if(ia === -1){
        return 1;
      }

      if(ib === -1){
        return -1;
      }

      return ia - ib;

    });

}


/* =========================================================
   PRODUCCIÓN Y OEE POR LÍNEA (LÍNEAS VISIBLES PARA EL USUARIO)
   ========================================================= */

function sumarProduccionPorLinea(records, lineas){

  return lineas.map(l => ({

    linea: l.name,

    key: l.key,

    total:

      records

        .filter(r => r.linea === l.key)

        .reduce(
          (a,r) => a + produccionEfectivaRecord(r),
          0
        )

  }));

}


function calcularOEEPorLinea(records, lineas){

  return lineas.map(l => {

    const recs =
      records.filter(r => r.linea === l.key);

    let horas = 0;
    let oeeXhoras = 0;

    recs.forEach(r => {

      const d = calcDerived(r);
      const h = num(d.horasEfectivas);

      if(h > 0){
        horas += h;
        oeeXhoras += d.oee * h;
      }

    });

    return {

      linea: l.name,

      key: l.key,

      oee: horas > 0 ? oeeXhoras / horas : 0,

      horas,

      sinDatos: recs.length === 0

    };

  });

}


/* =========================================================
   RENDER PRINCIPAL DEL RESUMEN
   ========================================================= */

function renderResumen(main){

  const lineasVisibles = visibleLines();

  const todos =
    loadRecords().filter(
      r => lineasVisibles.some(l => l.key === r.linea)
    );

  const records =
    filtrarPorRangoResumen(todos);


  const rangoLabel =

    resumenRangoDias

      ? `últimos ${resumenRangoDias} días`

      : 'todo el historial';


  main.innerHTML = `

    <div class="main-head">

      <div>

        <h2>
          Resumen general
        </h2>

        <div class="sub">

          Vista para gerencia — todas las líneas ·
          ${rangoLabel}

        </div>

      </div>


      <div style="display:flex; gap:4px;">

        ${
          [
            {v:7, t:'7d'},
            {v:30, t:'30d'},
            {v:90, t:'90d'},
            {v:null, t:'Todo'}
          ].map(op => `

            <button
              type="button"
              class="btn btn-sm ${
                resumenRangoDias === op.v
                  ? 'btn-primary'
                  : 'btn-ghost'
              }"
              onclick="cambiarRangoResumen(${op.v})"
            >
              ${op.t}
            </button>

          `).join('')
        }

      </div>

    </div>


    <div
      class="kpi-row"
      id="resumen-kpis"
    ></div>


    <div class="chart-grid">

      <div class="chart-box" style="grid-column:1 / -1;">

        <h4>
          Producción por día, por presentación (todas las líneas)
        </h4>

        <canvas id="chart-prod-dia">
        </canvas>

      </div>


      <div class="chart-box">

        <h4>
          Producción por turno
        </h4>

        <canvas id="chart-prod-turno">
        </canvas>

      </div>


      <div class="chart-box">

        <h4>
          OEE por línea
        </h4>

        <canvas id="chart-oee-linea">
        </canvas>

      </div>


      <div class="chart-box">

        <h4>
          Producción por línea
        </h4>

        <canvas id="chart-prod-linea">
        </canvas>

      </div>

    </div>


    <div class="panel" style="margin-top:14px;">

      <div class="panel-head">
        <h3>
          Producción por marca (total, ${rangoLabel})
        </h3>
      </div>

      <div
        class="panel-body"
        id="resumen-marcas"
        style="padding:0;"
      ></div>

    </div>

  `;


  if(!records.length){

    document.getElementById(
      'resumen-kpis'
    ).innerHTML = `

      <div class="small-muted" style="padding:10px 0;">
        No hay registros en ${rangoLabel} para las
        líneas que puedes ver.
      </div>

    `;

    document.getElementById(
      'resumen-marcas'
    ).innerHTML = `

      <div class="small-muted" style="padding:10px 0;">
        No hay registros en ${rangoLabel} para las
        líneas que puedes ver.
      </div>

    `;

    destroyCharts();

    return;

  }


  /* =====================================================
     KPIs
  ===================================================== */

  const kpis = calcularKPIsPlanta(records);

  document.getElementById('resumen-kpis').innerHTML = `

    <div class="kpi ${statusClass(kpis.oee)}">

      <div class="kpi-label">
        OEE de planta
      </div>

      <div class="kpi-value">
        ${pct(kpis.oee)}
      </div>

      <div class="small-muted" style="font-size:11px;">
        Meta ${pct(METAS.oee)}
      </div>

    </div>


    <div class="kpi ${statusClass(kpis.disponibilidad)}">

      <div class="kpi-label">
        Disponibilidad
      </div>

      <div class="kpi-value">
        ${pct(kpis.disponibilidad)}
      </div>

      <div class="small-muted" style="font-size:11px;">
        Meta ${pct(METAS.disponibilidad)}
      </div>

    </div>


    <div class="kpi">

      <div class="kpi-label">
        Producción total
      </div>

      <div class="kpi-value">
        ${formatearNumero(kpis.efectivaTotal)}
      </div>

      <div class="small-muted" style="font-size:11px;">
        unidades, ${rangoLabel}
      </div>

    </div>


    <div class="kpi ${statusClassInverso(kpis.mermaPct, METAS.merma)}">

      <div class="kpi-label">
        Merma de planta
      </div>

      <div class="kpi-value">
        ${pct(kpis.mermaPct)}
      </div>

      <div class="small-muted" style="font-size:11px;">
        Meta ≤ ${pct(METAS.merma)}
      </div>

    </div>

  `;


  destroyCharts();


  /* =====================================================
     PRODUCCIÓN POR DÍA, POR PRESENTACIÓN
  ===================================================== */

  const porDiaPresentacion =
    sumarProduccionPorDiaYPresentacion(records);

  const coloresPresentacion =
    coloresResumen(porDiaPresentacion.presentaciones.length);

  state.charts.prodDia =

    new Chart(

      document.getElementById('chart-prod-dia'),

      {

        type:'bar',

        data:{

          labels:
            porDiaPresentacion.fechas,

          datasets:

            porDiaPresentacion.presentaciones.map((presentacion, idx) => ({

              label: presentacion,

              data:
                porDiaPresentacion.fechas.map(
                  fecha =>
                    (porDiaPresentacion.acumulado[fecha] || {})[presentacion] || 0
                ),

              backgroundColor: coloresPresentacion[idx],

              borderRadius:2,

              barPercentage:0.7,

              stack:'produccion'

            }))

        },

        options:{

          plugins:{

            legend:{
              display:true,
              position:'bottom',
              labels:{ boxWidth:12, font:{ size:10 } }
            },

            tooltip:{

              callbacks:{

                label:ctx =>
                  ctx.dataset.label + ': ' +
                  formatearNumero(ctx.parsed.y) +
                  ' unidades',

                footer:items => {

                  const total =
                    items.reduce((a,it) => a + it.parsed.y, 0);

                  return 'Total del día: ' +
                    formatearNumero(total) + ' unidades';

                }

              }

            }

          },

          scales:{

            x:{
              stacked:true,
              grid:{ display:false }
            },

            y:{

              stacked:true,

              beginAtZero:true,

              grid:{ color:'#EFF2F4' },

              ticks:{
                callback:v => formatearNumero(v)
              }

            }

          }

        }

      }

    );


  /* =====================================================
     PRODUCCIÓN POR TURNO
  ===================================================== */

  const porTurno = sumarProduccionPorTurno(records);

  const coloresTurno = {
    'DÍA': PAL.ambar,
    'INTERMEDIO': PAL.azulSuave,
    'NOCHE': PAL.azul
  };

  state.charts.prodTurno =

    new Chart(

      document.getElementById('chart-prod-turno'),

      {

        type:'bar',

        data:{

          labels:
            porTurno.map(p => p.turno),

          datasets:[{

            label:'Producción',

            data:
              porTurno.map(p => p.total),

            backgroundColor:
              porTurno.map(
                p => coloresTurno[p.turno] || PAL.gris
              ),

            borderRadius:3,

            barPercentage:0.5

          }]

        },

        options:{

          plugins:{

            legend:{ display:false },

            valorBarra:{
              activo:true
            },

            tooltip:{

              callbacks:{

                label:ctx =>
                  formatearNumero(ctx.parsed.y) +
                  ' unidades'

              }

            }

          },

          scales:{

            x:{
              grid:{ display:false }
            },

            y:{

              beginAtZero:true,

              grid:{ color:'#EFF2F4' },

              ticks:{
                callback:v => formatearNumero(v)
              }

            }

          }

        }

      }

    );


  /* =====================================================
     OEE POR LÍNEA
  ===================================================== */

  const oeePorLinea =
    calcularOEEPorLinea(records, lineasVisibles);

  state.charts.oeeLinea =

    new Chart(

      document.getElementById('chart-oee-linea'),

      {

        type:'bar',

        data:{

          labels:
            oeePorLinea.map(x => x.linea),

          datasets:[{

            label:'OEE',

            data:
              oeePorLinea.map(x => x.oee * 100),

            backgroundColor:

              oeePorLinea.map(x =>
                x.sinDatos
                  ? PAL.grisSuave
                  : colorSegunMeta(x.oee, METAS.oee)
              ),

            borderRadius:3,

            barPercentage:0.55

          }]

        },

        options:{

          plugins:{

            legend:{ display:false },

            valorBarra:{
              activo:true,
              formato:v => (Math.round(v * 10) / 10) + '%'
            },

            metaLine:{
              valor:METAS.oee * 100,
              eje:'y',
              texto:'Meta ' + pct(METAS.oee),
              color:PAL.texto
            },

            tooltip:{

              callbacks:{

                label:ctx => {

                  const x = oeePorLinea[ctx.dataIndex];

                  return x.sinDatos
                    ? 'Sin datos en ' + rangoLabel
                    : (Math.round(x.oee * 1000) / 10) +
                      '% · ' + Math.round(x.horas) +
                      ' h efectivas';

                }

              }

            }

          },

          scales:{

            x:{
              grid:{ display:false }
            },

            y:{

              beginAtZero:true,

              max:100,

              grid:{ color:'#EFF2F4' },

              ticks:{ callback:v => v + '%' }

            }

          }

        }

      }

    );


  /* =====================================================
     PRODUCCIÓN POR LÍNEA
  ===================================================== */

  const prodPorLinea =
    sumarProduccionPorLinea(records, lineasVisibles);

  state.charts.prodLinea =

    new Chart(

      document.getElementById('chart-prod-linea'),

      {

        type:'bar',

        data:{

          labels:
            prodPorLinea.map(x => x.linea),

          datasets:[{

            label:'Producción',

            data:
              prodPorLinea.map(x => x.total),

            backgroundColor:PAL.verde,

            borderRadius:3,

            barPercentage:0.55

          }]

        },

        options:{

          indexAxis:'y',

          plugins:{

            legend:{ display:false },

            valorBarra:{
              activo:true
            },

            tooltip:{

              callbacks:{

                label:ctx =>
                  formatearNumero(ctx.parsed.x) +
                  ' unidades'

              }

            }

          },

          scales:{

            x:{

              beginAtZero:true,

              grid:{ color:'#EFF2F4' },

              ticks:{
                callback:v => formatearNumero(v)
              }

            },

            y:{
              grid:{ display:false }
            }

          }

        }

      }

    );


  /* =====================================================
     PRODUCCIÓN POR MARCA (TABLA, TOTAL DEL RANGO)
  ===================================================== */

  const porMarca = sumarProduccionPorMarca(records);

  const totalGeneralMarcas =
    porMarca.reduce((a,x) => a + x.total, 0);

  const marcasBox =
    document.getElementById('resumen-marcas');

  if(marcasBox){

    if(!porMarca.length){

      marcasBox.innerHTML = `

        <div class="small-muted" style="padding:10px 0;">
          No hay producción por marca en ${rangoLabel}.
        </div>

      `;

    } else {

      marcasBox.innerHTML = `

        <table>

          <thead>

            <tr>
              <th>Marca</th>
              <th>Línea(s)</th>
              <th>Producción efectiva</th>
              <th>% del total</th>
            </tr>

          </thead>

          <tbody>

            ${

              porMarca.map(x => `

                <tr>

                  <td><strong>${x.marca}</strong></td>

                  <td class="small-muted">${x.lineas || '—'}</td>

                  <td>${formatearNumero(x.total)}</td>

                  <td>
                    ${
                      totalGeneralMarcas > 0
                        ? pct(x.total / totalGeneralMarcas)
                        : '—'
                    }
                  </td>

                </tr>

              `).join('')

            }

          </tbody>

        </table>

      `;

    }

  }

}