/* =============================================================
   RESUMEN GENERAL
   Parte del sistema GLACIAL — dividido a partir de app.js
   ============================================================= */


/* =========================================================
   RESUMEN GENERAL
   ========================================================= */

function renderResumen(main){

  main.innerHTML = `

    <div class="main-head">

      <div>

        <h2>
          Resumen general
        </h2>

        <div class="sub">

          Comparativo de OEE entre
          todas las líneas —
          último registro de cada una

        </div>

      </div>

    </div>


    <div
      class="kpi-row"
      id="resumen-kpis"
    ></div>


    <div class="chart-box">

      <h4>
        OEE por línea
      </h4>

      <canvas
        id="chart-resumen"
      ></canvas>

    </div>

  `;


  const all =
    loadRecords();


  const last =

    LINES.map(

      l => {

        const recs =

          all

            .filter(
              r =>
                r.linea === l.key
            )

            .sort(

              (a,b) =>

                (
                  a.timestamp || ''
                ).localeCompare(

                  b.timestamp || ''

                )

            );


        return {

          line:l,

          rec:

            recs.length

              ? recs[recs.length - 1]

              : null

        };

      }

    );


  document.getElementById(
    'resumen-kpis'
  ).innerHTML =

    last.map(

      x => {

        if(!x.rec){

          return `

            <div class="kpi">

              <div class="kpi-label">

                ${x.line.name}

              </div>

              <div
                class="kpi-value small-muted"
                style="font-size:15px;"
              >

                Sin datos

              </div>

            </div>

          `;

        }


        const d =
          calcDerived(x.rec);


        return `

          <div
            class="kpi
            ${statusClass(d.oee)}"
          >

            <div class="kpi-label">

              ${x.line.name}

            </div>


            <div class="kpi-value">

              ${pct(d.oee)}

            </div>

          </div>

        `;

      }

    ).join('');


  destroyCharts();


  state.charts.resumen =

    new Chart(

      document.getElementById(
        'chart-resumen'
      ),

      {

        type:'bar',

        data:{

          labels:

            last.map(
              x => x.line.name
            ),

          datasets:[{

            data:

              last.map(

                x =>

                  x.rec

                    ? calcDerived(
                        x.rec
                      ).oee * 100

                    : 0

              ),

            backgroundColor:
              '#2F6690',

            borderRadius:2

          }]

        },

        options:{

          plugins:{

            legend:{
              display:false
            }

          },

          scales:{

            y:{

              beginAtZero:true,

              max:100,

              title:{

                display:true,

                text:'OEE %'

              }

            }

          }

        }

      }

    );

}

