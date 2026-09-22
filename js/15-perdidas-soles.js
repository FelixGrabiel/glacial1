/* =============================================================
   IMPACTO ECONÓMICO (antes "Pérdidas en S/.")
   TODAS LAS PARADAS NO PROGRAMADAS, AGRUPADAS POR MÁQUINA/ÁREA
   Parte del sistema GLACIAL

   Vista de solo lectura para gerencia/jefatura (permiso propio
   'perdidasSoles', independiente de 'resumen' y 'graficos') que
   convierte a dinero las unidades que se dejaron de producir por
   CUALQUIER parada NO programada (sin importar su "Causa" en
   CAUSAS_PARADA_NO_PROGRAMADA / 06-registro.js), agrupándolas
   por la máquina o área que se detecta en el texto de la
   descripción: Etiquetadora, Empaquetadora, Sopladora,
   Envasadora, Calidad o Producción (ver
   CATEGORIAS_IMPACTO_ECONOMICO más abajo). Antes (hasta
   20260922) solo se contaban las paradas marcadas con causa
   'Falla de máquina'; ahora se cuentan todas, agrupadas por
   texto en vez de por ese campo.

   Los nombres internos (función renderPerdidasSoles, permiso
   'perdidasSoles', id 'perdidas-soles-view', variable
   perdidasRangoDias, etc.) se mantienen igual para no romper
   referencias en otros archivos — solo cambió el texto que ve
   el usuario, de "Pérdidas en S/." a "Impacto Económico".

   Cárgalo en index.html DESPUÉS de 02-estado.js (usa
   loadPrecios/savePrecios/precioUnitarioLinea), 05-utils.js
   (num/pct), 06-registro.js (normalizarCuadros) y 08-graficos.js
   (formatearNumero) — el orden exacto sugerido es justo antes
   de 12-init.js, después de 14-exportar-general.js.
   ============================================================= */


let perdidasRangoDias = 30;
/* null = todo el historial disponible */

function cambiarRangoPerdidas(dias){

  perdidasRangoDias = dias;

  renderPerdidasSoles(
    document.getElementById('main')
  );

}


function filtrarPorRangoPerdidas(records){

  if(!perdidasRangoDias || !records.length){
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
    limite.getDate() - (perdidasRangoDias - 1)
  );

  return records.filter(

    r =>
      r.fecha &&
      new Date(r.fecha + 'T00:00:00') >= limite

  );

}


/* =========================================================
   FORMATO DE DINERO (SOLES)
   ========================================================= */

function formatearSoles(v){

  return 'S/ ' + num(v).toLocaleString('es-PE', {
    minimumFractionDigits:2,
    maximumFractionDigits:2
  });

}


/* =========================================================
   CATEGORÍAS POR MÁQUINA / ÁREA (PARA IMPACTO ECONÓMICO)
   =========================================================

   Cada categoría tiene una o más expresiones regulares que se
   prueban contra el texto de la descripción de la parada
   (p.descripcion), SIN distinguir mayúsculas/minúsculas ni
   acentos. La primera categoría que haga match, gana — por
   eso van de lo más específico (abreviaturas de máquina) a lo
   más general (Calidad / Producción).

   \b = límite de palabra, para que 'ETQ' no rebote dentro de
   otra palabra que por casualidad contenga esas letras.

   Si ninguna hace match, la parada cae en 'Otros / sin
   clasificar' — ver sinCategoriaCount en agruparParadasNoProgramadas().
   ========================================================= */

const CATEGORIAS_IMPACTO_ECONOMICO = [

  { nombre:'Etiquetadora',  patrones:[/\bETQ\b/i, /ETIQUETADORA/i] },
  { nombre:'Empaquetadora', patrones:[/\bEMP\b/i, /\bEMPAQ\b/i, /EMPAQUETADORA/i] },
  { nombre:'Sopladora',     patrones:[/\bSOP\b/i, /SOPLADORA/i] },
  { nombre:'Envasadora',    patrones:[/\bENV\b/i, /ENVASADORA/i] },
  { nombre:'Calidad',       patrones:[/CALIDAD/i] },
  { nombre:'Producción',    patrones:[/PRODUCCI[OÓ]N/i] }

];

function categorizarParadaPorTexto(texto){

  const t = String(texto || '');

  for(const cat of CATEGORIAS_IMPACTO_ECONOMICO){

    if(cat.patrones.some(p => p.test(t))){
      return cat.nombre;
    }

  }

  return 'Otros / sin clasificar';

}


/* =========================================================
   CÁLCULO CENTRAL: PARADAS NO PROGRAMADAS -> UNIDADES -> S/.
   =========================================================

   Por cada parada NO programada (sin importar su "Causa"):

     unidades perdidas = ratioNominal del cuadro × (minutos / 60)
     S/. perdidos      = unidades perdidas × precioUnitarioLinea(línea)

   Es la MISMA lógica que usa calcCascada() (08-graficos.js)
   para la pérdida por disponibilidad — ratio × horas de parada.

   Cada parada se clasifica además por categoría (máquina/área)
   según su descripción, con categorizarParadaPorTexto() — las
   que no calzan con ninguna categoría se cuentan en
   sinCategoriaCount y quedan como 'Otros / sin clasificar'.
   ========================================================= */

function agruparParadasNoProgramadas(records){

  const porLinea = {};
  const porCategoria = {};
  const porCausa = {};

  let totalMinutos = 0;
  let totalUnidades = 0;
  let totalDinero = 0;
  let totalParadas = 0;
  let sinCategoriaCount = 0;


  records.forEach(rec => {

    const cuadros = normalizarCuadros(rec);

    cuadros.forEach(c => {

      (c?.paradasNoProgramadas || []).forEach(p => {

        const minutos = num(p?.tiempoMin);

        if(minutos <= 0){
          return;
        }

        const ratio = num(c?.ratioNominal);
        const unidades = ratio * (minutos / 60);
        const precio = precioUnitarioLinea(rec.linea);
        const dinero = unidades * precio;

        const lineaInfo =
          LINES.find(l => l.key === rec.linea);

        /* ---------- por línea ---------- */

        if(!porLinea[rec.linea]){

          porLinea[rec.linea] = {
            linea: rec.linea,
            nombre: lineaInfo ? lineaInfo.name : rec.linea,
            minutos: 0,
            unidades: 0,
            dinero: 0,
            paradas: 0
          };

        }

        porLinea[rec.linea].minutos += minutos;
        porLinea[rec.linea].unidades += unidades;
        porLinea[rec.linea].dinero += dinero;
        porLinea[rec.linea].paradas += 1;

        const desc =
          String(p.descripcion || '').trim() ||
          'Sin descripción';

        const categoria =
          categorizarParadaPorTexto(desc);

        if(categoria === 'Otros / sin clasificar'){
          sinCategoriaCount++;
        }

        /* ---------- por categoría (máquina/área) ---------- */

        if(!porCategoria[categoria]){

          porCategoria[categoria] = {
            categoria,
            minutos: 0,
            unidades: 0,
            dinero: 0,
            veces: 0
          };

        }

        porCategoria[categoria].minutos += minutos;
        porCategoria[categoria].unidades += unidades;
        porCategoria[categoria].dinero += dinero;
        porCategoria[categoria].veces += 1;

        /* ---------- por causa/descripción (detalle) ---------- */

        const clave = rec.linea + '||' + desc;

        if(!porCausa[clave]){

          porCausa[clave] = {
            descripcion: desc,
            categoria,
            linea: rec.linea,
            minutos: 0,
            unidades: 0,
            dinero: 0,
            veces: 0
          };

        }

        porCausa[clave].minutos += minutos;
        porCausa[clave].unidades += unidades;
        porCausa[clave].dinero += dinero;
        porCausa[clave].veces += 1;

        totalMinutos += minutos;
        totalUnidades += unidades;
        totalDinero += dinero;
        totalParadas += 1;

      });

    });

  });


  return {

    filasLinea:
      Object.values(porLinea).sort((a,b) => b.dinero - a.dinero),

    filasCategoria:
      Object.values(porCategoria).sort((a,b) => b.dinero - a.dinero),

    filasCausa:
      Object.values(porCausa).sort((a,b) => b.dinero - a.dinero),

    totalMinutos,
    totalUnidades,
    totalDinero,
    totalParadas,
    sinCategoriaCount

  };

}


/* =========================================================
   EDICIÓN DE PRECIOS POR LÍNEA (SOLO CONFIGURACIÓN/ADMIN)
   ========================================================= */

function puedeEditarPreciosPerdidas(){

  return (
    tienePermiso('configuracion') ||
    tienePermiso('administracion')
  );

}


function guardarPreciosPerdidas(){

  const precios = {};

  LINES.forEach(l => {

    const input =
      document.getElementById('precio-linea-' + l.key);

    if(input){
      precios[l.key] = num(input.value);
    }

  });

  const hieloInput =
    document.getElementById('precio-linea-HIELO');

  if(hieloInput){
    precios.HIELO = num(hieloInput.value);
  }

  savePrecios(precios);

}


/* =========================================================
   VISTA PRINCIPAL
   ========================================================= */

function renderPerdidasSoles(main){

  if(!main){
    return;
  }


  /* ---------- permiso ---------- */

  if(!tienePermiso('perdidasSoles')){

    main.innerHTML = `

      <div class="panel">

        <div class="empty-state">

          <h4>
            No tienes permiso para ver este reporte
          </h4>

          <p>
            Pídele a un Administrador que te habilite el
            permiso "Impacto Económico (paradas no programadas)"
            en Gestión de usuarios.
          </p>

        </div>

      </div>

    `;

    return;

  }


  /* ---------- esperando datos de Firestore ---------- */

  if(!_recordsReady || !_preciosReady){

    main.innerHTML = `

      <div class="panel">
        <div class="small-muted" style="padding:20px 0;text-align:center;">
          Cargando datos...
        </div>
      </div>

    `;

    return;

  }


  const lineasVisibles = visibleLines();

  const todos =
    loadRecords().filter(
      r => lineasVisibles.some(l => l.key === r.linea)
    );

  const records =
    filtrarPorRangoPerdidas(todos);

  const rangoLabel =
    perdidasRangoDias
      ? `últimos ${perdidasRangoDias} días`
      : 'todo el historial';

  const datos =
    agruparParadasNoProgramadas(records);

  const precios = loadPrecios();

  const editable = puedeEditarPreciosPerdidas();


  main.innerHTML = `

    <style>

      .perdidas-pro{
        --pd-ink:#2E3A46;
        --pd-soft:#6B7784;
        --pd-line:#E6EBEF;
        --pd-rojo:#C4472B;
        max-width:1320px;
      }

      .perdidas-pro .pd-head{
        display:flex;
        justify-content:space-between;
        align-items:flex-end;
        gap:16px;
        flex-wrap:wrap;
        margin-bottom:18px;
        padding-bottom:14px;
        border-bottom:1px solid var(--pd-line);
      }

      .perdidas-pro .pd-title-row{
        display:flex;
        align-items:center;
        gap:12px;
      }

      .perdidas-pro .pd-badge{
        display:flex;
        align-items:center;
        justify-content:center;
        width:42px;
        height:42px;
        border-radius:12px;
        background:#FDEDE8;
        color:var(--pd-rojo);
        font-size:20px;
        flex-shrink:0;
      }

      .perdidas-pro .pd-eyebrow{
        font-size:11px;
        letter-spacing:.14em;
        text-transform:uppercase;
        color:var(--pd-rojo);
        font-weight:600;
        margin-bottom:4px;
      }

      .perdidas-pro h2{
        margin:0;
        font-size:24px;
        font-weight:600;
        color:var(--pd-ink);
      }

      .perdidas-pro .pd-range{
        display:flex;
        gap:6px;
      }

      .perdidas-pro .pd-range button{
        border:1px solid var(--pd-line);
        background:#fff;
        border-radius:8px;
        padding:6px 12px;
        font-size:13px;
        cursor:pointer;
        color:var(--pd-soft);
      }

      .perdidas-pro .pd-range button.active{
        background:var(--pd-ink);
        color:#fff;
        border-color:var(--pd-ink);
      }

      .perdidas-pro .pd-kpis{
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(210px,1fr));
        gap:14px;
        margin-bottom:22px;
      }

      .perdidas-pro .pd-kpi{
        background:#fff;
        border:1px solid var(--pd-line);
        border-radius:12px;
        padding:16px 18px;
      }

      .perdidas-pro .pd-kpi .pd-kpi-label{
        font-size:12px;
        color:var(--pd-soft);
        margin-bottom:6px;
      }

      .perdidas-pro .pd-kpi .pd-kpi-value{
        font-size:26px;
        font-weight:700;
        color:var(--pd-ink);
      }

      .perdidas-pro .pd-kpi.pd-destacado .pd-kpi-value{
        color:var(--pd-rojo);
      }

      .perdidas-pro table.pd-table{
        width:100%;
        border-collapse:collapse;
        font-size:13px;
      }

      .perdidas-pro table.pd-table th{
        text-align:left;
        font-size:11px;
        letter-spacing:.04em;
        text-transform:uppercase;
        color:var(--pd-soft);
        border-bottom:1px solid var(--pd-line);
        padding:8px 10px;
      }

      .perdidas-pro table.pd-table td{
        padding:8px 10px;
        border-bottom:1px solid var(--pd-line);
        color:var(--pd-ink);
      }

      .perdidas-pro table.pd-table td.pd-num{
        text-align:right;
        font-variant-numeric:tabular-nums;
      }

      .perdidas-pro .pd-aviso{
        background:#FFF7ED;
        border:1px solid #FCE3C0;
        color:#8A5A1E;
        border-radius:10px;
        padding:10px 14px;
        font-size:13px;
        margin:14px 0;
      }

      .perdidas-pro .pd-precios{
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
        gap:12px;
        margin-top:10px;
      }

      .perdidas-pro .pd-precio-item label{
        display:block;
        font-size:12px;
        color:var(--pd-soft);
        margin-bottom:4px;
      }

      .perdidas-pro .pd-precio-item input{
        width:100%;
        box-sizing:border-box;
      }

    </style>


    <div class="perdidas-pro" id="perdidas-soles-view">

      <div class="pd-head">

        <div class="pd-title-row">

          <div class="pd-badge">📉</div>

          <div>
            <div class="pd-eyebrow">Solo para gerencia / jefatura</div>
            <h2>Impacto Económico — paradas no programadas por máquina/área</h2>
            <div class="small-muted" style="margin-top:4px;">
              Mostrando ${rangoLabel}
              ${
                lineasVisibles.length < LINES.length
                  ? ' · líneas visibles según tu permiso'
                  : ''
              }
            </div>
          </div>

        </div>

        <div class="pd-range">

          ${
            [
              { v:7, l:'7 días' },
              { v:30, l:'30 días' },
              { v:90, l:'90 días' },
              { v:null, l:'Todo' }
            ].map(

              op => `
                <button
                  class="${perdidasRangoDias === op.v ? 'active' : ''}"
                  onclick="cambiarRangoPerdidas(${op.v === null ? 'null' : op.v})"
                >
                  ${op.l}
                </button>
              `

            ).join('')
          }

        </div>

      </div>


      <div class="pd-kpis">

        <div class="pd-kpi pd-destacado">
          <div class="pd-kpi-label">Impacto económico total</div>
          <div class="pd-kpi-value">${formatearSoles(datos.totalDinero)}</div>
        </div>

        <div class="pd-kpi">
          <div class="pd-kpi-label">Minutos de parada (no programada)</div>
          <div class="pd-kpi-value">${formatearNumero(datos.totalMinutos)}</div>
        </div>

        <div class="pd-kpi">
          <div class="pd-kpi-label">Unidades no producidas</div>
          <div class="pd-kpi-value">${formatearNumero(datos.totalUnidades)}</div>
        </div>

        <div class="pd-kpi">
          <div class="pd-kpi-label">Paradas no programadas contabilizadas</div>
          <div class="pd-kpi-value">${formatearNumero(datos.totalParadas)}</div>
        </div>

      </div>


      ${
        datos.sinCategoriaCount
          ? `
            <div class="pd-aviso">
              Hay ${datos.sinCategoriaCount} parada(s) no programada(s) en
              ${rangoLabel} cuya descripción no menciona ninguna máquina
              conocida (ETQ/Etiquetadora, Emp/Empaquetadora, Sop/Sopladora,
              Env/Envasadora) ni las palabras "Calidad" o "Producción" —
              quedan agrupadas como "Otros / sin clasificar". Sí están
              incluidas en el total de soles, solo no se pudieron ubicar
              en una categoría. Si describes la parada mencionando la
              máquina (ej. "ETQ atascada"), la próxima vez caerá en su
              categoría automáticamente.
            </div>
          `
          : ''
      }


      <div class="panel" style="margin-top:4px;">

        <div class="panel-head">
          <h4 style="margin:0;">Pérdida por línea</h4>
        </div>

        <div class="panel-body">

          ${
            !datos.filasLinea.length
              ? `
                <div class="small-muted" style="padding:10px 0;">
                  No hay paradas no programadas registradas en ${rangoLabel}.
                </div>
              `
              : `
                <table class="pd-table">

                  <thead>
                    <tr>
                      <th>Línea</th>
                      <th class="pd-num">Minutos</th>
                      <th class="pd-num">Unidades perdidas</th>
                      <th class="pd-num">Precio S/. / unidad</th>
                      <th class="pd-num">Total S/.</th>
                    </tr>
                  </thead>

                  <tbody>

                    ${
                      datos.filasLinea.map(f => `
                        <tr>
                          <td><strong>${escaparHtml(f.nombre)}</strong></td>
                          <td class="pd-num">${formatearNumero(f.minutos)}</td>
                          <td class="pd-num">${formatearNumero(f.unidades)}</td>
                          <td class="pd-num">${formatearSoles(precioUnitarioLinea(f.linea))}</td>
                          <td class="pd-num"><strong>${formatearSoles(f.dinero)}</strong></td>
                        </tr>
                      `).join('')
                    }

                  </tbody>

                </table>
              `
          }

        </div>

      </div>


      <div class="panel" style="margin-top:16px;">

        <div class="panel-head">
          <h4 style="margin:0;">Impacto por máquina / área</h4>
        </div>

        <div class="panel-body">

          ${
            !datos.filasCategoria.length
              ? `
                <div class="small-muted" style="padding:10px 0;">
                  Sin datos en ${rangoLabel}.
                </div>
              `
              : `
                <table class="pd-table">

                  <thead>
                    <tr>
                      <th>Categoría</th>
                      <th class="pd-num">Veces</th>
                      <th class="pd-num">Minutos</th>
                      <th class="pd-num">Unidades perdidas</th>
                      <th class="pd-num">Total S/.</th>
                    </tr>
                  </thead>

                  <tbody>

                    ${
                      datos.filasCategoria.map(f => `
                        <tr>
                          <td>
                            <strong>${escaparHtml(f.categoria)}</strong>
                            ${
                              f.categoria === 'Otros / sin clasificar'
                                ? ' <span class="small-muted">(descripción sin máquina identificable)</span>'
                                : ''
                            }
                          </td>
                          <td class="pd-num">${f.veces}</td>
                          <td class="pd-num">${formatearNumero(f.minutos)}</td>
                          <td class="pd-num">${formatearNumero(f.unidades)}</td>
                          <td class="pd-num"><strong>${formatearSoles(f.dinero)}</strong></td>
                        </tr>
                      `).join('')
                    }

                  </tbody>

                </table>
              `
          }

        </div>

      </div>


      <div class="panel" style="margin-top:16px;">

        <div class="panel-head">
          <h4 style="margin:0;">Principales causas (por dinero perdido)</h4>
        </div>

        <div class="panel-body">

          ${
            !datos.filasCausa.length
              ? `
                <div class="small-muted" style="padding:10px 0;">
                  Sin datos en ${rangoLabel}.
                </div>
              `
              : `
                <table class="pd-table">

                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th>Categoría</th>
                      <th>Línea</th>
                      <th class="pd-num">Veces</th>
                      <th class="pd-num">Minutos</th>
                      <th class="pd-num">Total S/.</th>
                    </tr>
                  </thead>

                  <tbody>

                    ${
                      datos.filasCausa.slice(0, 10).map(f => {

                        const lineaInfo =
                          LINES.find(l => l.key === f.linea);

                        return `
                          <tr>
                            <td>${escaparHtml(f.descripcion)}</td>
                            <td class="small-muted">${escaparHtml(f.categoria)}</td>
                            <td class="small-muted">${escaparHtml(lineaInfo ? lineaInfo.name : f.linea)}</td>
                            <td class="pd-num">${f.veces}</td>
                            <td class="pd-num">${formatearNumero(f.minutos)}</td>
                            <td class="pd-num"><strong>${formatearSoles(f.dinero)}</strong></td>
                          </tr>
                        `;

                      }).join('')
                    }

                  </tbody>

                </table>
              `
          }

        </div>

      </div>


      <div class="panel" style="margin-top:16px;">

        <div class="panel-head">
          <h4 style="margin:0;">Precio por unidad (S/.)</h4>
        </div>

        <div class="panel-body">

          <div class="small-muted" style="margin-bottom:6px;">
            ${
              editable
                ? 'Se usa para convertir unidades perdidas a soles. Los cambios se guardan para todos los usuarios.'
                : 'Solo un usuario con permiso de Configuración o Administración puede editar estos valores.'
            }
          </div>

          <div class="pd-precios">

            ${
              LINES.map(l => `
                <div class="pd-precio-item">
                  <label>${escaparHtml(l.name)}</label>
                  <input
                    id="precio-linea-${l.key}"
                    type="number"
                    min="0"
                    step="0.10"
                    value="${num(precios[l.key] ?? PRECIOS_UNITARIOS_DEFAULT[l.key] ?? 0)}"
                    ${editable ? '' : 'disabled'}
                  >
                </div>
              `).join('')
            }

            <div class="pd-precio-item">
              <label>Hielo (a futuro)</label>
              <input
                id="precio-linea-HIELO"
                type="number"
                min="0"
                step="0.10"
                value="${num(precios.HIELO ?? PRECIOS_UNITARIOS_DEFAULT.HIELO ?? 0)}"
                ${editable ? '' : 'disabled'}
              >
            </div>

          </div>

          ${
            editable
              ? `
                <div class="actions-row" style="margin-top:12px;">
                  <button
                    type="button"
                    class="btn btn-primary"
                    onclick="guardarPreciosPerdidas()"
                  >
                    Guardar precios
                  </button>
                </div>
              `
              : ''
          }

        </div>

      </div>

    </div>

  `;

}