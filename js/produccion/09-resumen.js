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
let resumenFechaDiaria = null;
let resumenFiltroLinea = 'TODAS';
let resumenIndustrialCharts = {};


/* null = todo el historial disponible; 1 = Diario */

function fechaHoyResumen(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const dia=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dia}`;
}

function cambiarRangoResumen(dias){

  resumenRangoDias = dias;

  if(dias === 1 && !resumenFechaDiaria){
    resumenFechaDiaria = fechaHoyResumen();
  }

  renderResumen(
    document.getElementById('main')
  );

}

function cambiarFechaDiariaResumen(fecha){

  if(!fecha) return;

  resumenFechaDiaria = fecha;
  resumenRangoDias = 1;

  renderResumen(
    document.getElementById('main')
  );

}


/* =========================================================
   VISTA DEL PANEL "PRODUCCIÓN POR PRESENTACIÓN Y MARCA"
   =========================================================

   Independiente del rango de arriba (7/30/90 días / Todo):
   el panel puede mostrarse por:

   - 'rango' → el mismo rango de fechas elegido arriba
               (comportamiento original).
   - 'mes'   → un mes calendario puntual — resumen mensual
               de marcas × presentación.
   - 'anio'  → un año completo (2026, 2027, ...) — el cierre
               de año con las cantidades producidas por
               presentación y marca.

   Los meses/años del selector salen de TODO el historial
   visible (no del rango de días de arriba), así siempre se
   pueden elegir períodos con datos aunque el rango de 7/30/90
   días esté vacío.
   ========================================================= */

let resumenPresentacionModo = 'rango';
let resumenPresentacionMes = null;
let resumenPresentacionAnio = null;

function cambiarModoPresentacionMarca(modo){

  resumenPresentacionModo = modo;

  renderResumen(
    document.getElementById('main')
  );

}

function cambiarMesPresentacionMarca(mes){

  resumenPresentacionMes = mes;

  renderResumen(
    document.getElementById('main')
  );

}

function cambiarAnioPresentacionMarca(anio){

  resumenPresentacionAnio = anio;

  renderResumen(
    document.getElementById('main')
  );

}


const NOMBRES_MES_RESUMEN = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Setiembre','Octubre','Noviembre','Diciembre'
];

function etiquetaMesResumen(mesKey){

  const partes = String(mesKey || '').split('-');

  const anio = partes[0] || '';
  const idx = parseInt(partes[1], 10) - 1;

  return (NOMBRES_MES_RESUMEN[idx] || partes[1] || '') + ' ' + anio;

}

function obtenerMesesDisponiblesResumen(records){

  const set = new Set();

  records.forEach(r => {

    if(r.fecha && r.fecha.length >= 7){
      set.add(r.fecha.slice(0,7));
    }

  });

  return Array.from(set).sort((a,b) => b.localeCompare(a));

}

function obtenerAniosDisponiblesResumen(records){

  const set = new Set();

  records.forEach(r => {

    if(r.fecha && r.fecha.length >= 4){
      set.add(r.fecha.slice(0,4));
    }

  });

  return Array.from(set).sort((a,b) => b.localeCompare(a));

}

function filtrarRecordsPorMesResumen(records, mesKey){

  if(!mesKey){
    return [];
  }

  return records.filter(
    r => (r.fecha || '').slice(0,7) === mesKey
  );

}

function filtrarRecordsPorAnioResumen(records, anioKey){

  if(!anioKey){
    return [];
  }

  return records.filter(
    r => (r.fecha || '').slice(0,4) === anioKey
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

  if(!records.length){
    return records;
  }

  if(resumenRangoDias === 1){
    const fecha = resumenFechaDiaria || fechaHoyResumen();
    return records.filter(r => r.fecha === fecha);
  }

  if(!resumenRangoDias){
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
  const derivados = [];
  let planMin = 0;
  let npMin = 0;
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

    }

    planMin += (num(d.horasEfectivas) + num(d.pNoProg)) * 60;
    npMin += num(d.pNoProg) * 60;
    derivados.push(d);

  });

  return {

    oee: glacialAgregarDerivados(derivados).oee,

    disponibilidad:
      GlacialIndicadores.disponibilidad(planMin, npMin) ?? 0,

    efectivaTotal,

    mermaPct:
      GlacialIndicadores.merma(mermaTotal, efectivaTotal) ?? 0

  };

}


/* =========================================================
   PALETA SUAVE DEL RESUMEN GENERAL
   =========================================================

   Tonos "pastel" de baja saturación para que las barras se
   vean limpias y profesionales, sin colores estridentes.
   Solo afecta a esta pantalla (la pestaña Gráficos sigue
   usando la paleta PAL de 08-graficos.js).
   ========================================================= */

const PAL_R = {
  azul:      '#7C9EBD',
  azulSuave: '#B5CBDD',
  ambar:     '#EBC98E',
  ambarLinea:'#D6A24A',
  verde:     '#88BDA0',
  rojo:      '#DE9C8E',
  gris:      '#C9D3DA',
  grisSuave: '#EDF0F2',
  texto:     '#4A5663'
};

const GRID_R = '#EEF1F4';

const TOOLTIP_R = {
  backgroundColor:'rgba(46,58,70,0.94)',
  titleColor:'#fff',
  bodyColor:'#E8EEF3',
  padding:10,
  cornerRadius:8,
  boxPadding:4
};

const COLORES_SERIE_R = [
  '#7C9EBD', '#88BDA0', '#EBC98E', '#C4A9D0',
  '#DE9C8E', '#8FCBC9', '#B7C58A', '#E3B0C4',
  '#9AA7D6', '#D6B98C', '#A5B8A8', '#C7C2B5'
];

function coloresResumen(n){

  const colores = [];

  for(let i = 0; i < n; i++){

    colores.push(
      i < COLORES_SERIE_R.length
        ? COLORES_SERIE_R[i]
        : `hsl(${(i * 47) % 360} 32% 70%)`
    );

  }

  return colores;

}


/* Semáforo suave (mayor es mejor / menor es mejor) para barras */

function colorSegunMetaR(valor, meta){

  if(valor >= meta){
    return PAL_R.verde;
  }

  if(valor >= meta * 0.85){
    return PAL_R.ambar;
  }

  return PAL_R.rojo;

}


/* Misma lógica pero devolviendo la clase CSS de las tarjetas */

function claseSegunMeta(valor, meta){

  if(valor >= meta){
    return 'rs-good';
  }

  if(valor >= meta * 0.85){
    return 'rs-warn';
  }

  return 'rs-bad';

}

function claseSegunMetaInversa(valor, meta){

  if(valor <= meta){
    return 'rs-good';
  }

  if(valor <= meta * 1.15){
    return 'rs-warn';
  }

  return 'rs-bad';

}


/*
   Plugin propio: valor sobre cada barra (vertical) o al
   final de la barra (horizontal), con color sobrio.
*/

const valorBarraResumenPlugin = {

  id:'valorBarraR',

  afterDatasetsDraw(chart, args, opts){

    if(!opts || !opts.activo){
      return;
    }

    const ctx = chart.ctx;

    const horizontal =
      chart.options.indexAxis === 'y';

    ctx.save();

    ctx.font = '600 11px "IBM Plex Sans", sans-serif';
    ctx.fillStyle = opts.color || PAL_R.texto;
    ctx.textAlign = horizontal ? 'left' : 'center';
    ctx.textBaseline = horizontal ? 'middle' : 'bottom';

    chart.data.datasets.forEach((ds, di) => {

      if(ds.type === 'line'){
        return;
      }

      const meta = chart.getDatasetMeta(di);

      if(meta.hidden){
        return;
      }

      meta.data.forEach((barra, i) => {

        const valor =
          opts.formato
            ? opts.formato(ds.data[i], i)
            : formatearNumero(ds.data[i]);

        if(valor === '' || valor === null){
          return;
        }

        if(horizontal){
          ctx.fillText(valor, barra.x + 8, barra.y);
        } else {
          ctx.fillText(valor, barra.x, barra.y - 6);
        }

      });

    });

    ctx.restore();

  }

};

Chart.register(valorBarraResumenPlugin);


/* =========================================================
   ELEMENTOS VISUALES DEL TABLERO (tarjetas KPI, sparkline)
   ========================================================= */

function sparklineResumen(valores){

  if(!valores || valores.length < 2){
    return '<div class="rs-spark-vacio"></div>';
  }

  const w = 120;
  const h = 30;
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const rango = (max - min) || 1;

  const pts =
    valores.map((v, i) =>
      ((i / (valores.length - 1)) * w).toFixed(1) + ',' +
      (h - 3 - ((v - min) / rango) * (h - 6)).toFixed(1)
    ).join(' ');

  return `
    <svg class="rs-spark" viewBox="0 0 ${w} ${h}"
         preserveAspectRatio="none" width="100%" height="30">
      <polyline points="${pts}" fill="none" stroke="#9DB9CF"
        stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"/>
    </svg>
  `;

}


function tarjetaKpiResumen(o){

  const etiquetas =
    o.inverso
      ? {
          'rs-good':'Dentro de meta',
          'rs-warn':'Ligero exceso',
          'rs-bad':'Sobre la meta'
        }
      : {
          'rs-good':'En meta',
          'rs-warn':'Cerca de la meta',
          'rs-bad':'Bajo la meta'
        };

  const clase = o.clase || 'rs-neutral';

  const izquierda =
    etiquetas[o.clase]
      ? `<span class="rs-pill">${etiquetas[o.clase]}</span>`
      : `<span>${o.izq || ''}</span>`;

  let visual = '';

  if(o.barra){

    const ancho =
      Math.max(0, Math.min(1, o.barra.pct)) * 100;

    visual = `
      <div class="rs-bar">
        <span style="width:${ancho}%"></span>
        <i style="left:${o.barra.meta * 100}%"></i>
      </div>
    `;

  } else if(o.spark){

    visual = o.spark;

  }

  return `

    <div class="rs-kpi ${clase}">

      <div class="rs-kpi-label">${o.label}</div>

      <div class="rs-kpi-value">${o.valor}</div>

      ${visual}

      <div class="rs-kpi-foot">
        ${izquierda}
        <span>${o.pie || ''}</span>
      </div>

    </div>

  `;

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
   PRODUCCIÓN POR PRESENTACIÓN (AGRUPADA) Y MARCA
   =========================================================

   Panel fijo del Resumen general (siempre visible, no depende
   de ningún filtro aparte del rango de fechas ya elegido
   arriba): agrupa TODA la producción efectiva del rango en
   las categorías que pide Gerencia — 380ml, 625ml Regular,
   625ml Gasificada, 1L, 1.5L, 2.5L, 7L, 10L, Cajas 20L y
   B20L — cruzadas por marca, sumando los días del rango (no
   se muestra por día, solo el total acumulado).

   Las 10 categorías de la lista SIEMPRE se muestran, en ese
   orden fijo, aunque alguna tenga 0 unidades en el rango
   elegido — así ninguna columna "desaparece" del gráfico/tabla
   de un período a otro y Gerencia siempre ve el mismo esqueleto
   de columnas (ver CATEGORIAS_PRESENTACION_ORDEN más abajo).

   "625ml Gasificada" se distingue por la MARCA, porque el
   sistema no tiene un campo aparte para esto: Bells_Gas,
   Bells_Manzana, Bells_Maracuya, Bells_Piña_Kion, Scala_Gas,
   Scala_Manzana, Scala_Maracuya, Scala_Piña_Kion y Cuisine_Gas
   (ver MARCA_BASE_GASIFICADA más abajo) son variantes
   gasificadas/saborizadas de Bells, Scala y Cuisine. A
   diferencia del resto de categorías (donde las variantes se
   agrupan bajo su marca base, ej. "Bells"), DENTRO de "625ml
   Gasificada" cada variante se muestra como su propia barra
   (Bells Gas, Bells Manzana, Scala Gas, etc.) — ver
   nombreMarcaGasificada() — para poder comparar el avance de
   cada sabor por separado. Cualquier otra presentación (380ml,
   1L, 1.5L, 2.5L) no se divide por gas/regular ni por sabor,
   solo por marca base.
   ========================================================= */

const CATEGORIAS_PRESENTACION_ORDEN = [
  '380ml',
  '625ml Regular',
  '625ml Gasificada',
  '1L',
  '1.5L',
  '2.5L',
  '7L',
  '10L',
  'Cajas 20L',
  'B20L'
];

const MARCA_BASE_GASIFICADA = {
  'bells gas': 'Bells',
  'bells manzana': 'Bells',
  'bells maracuya': 'Bells',
  'bells pina kion': 'Bells',
  'scala gas': 'Scala',
  'scala manzana': 'Scala',
  'scala maracuya': 'Scala',
  'scala pina kion': 'Scala',
  'cuisine gas': 'Cuisine'
};

/*
   Nombre "bonito" de cada variante gasificada/saborizada, para
   mostrarla como su propia barra DENTRO de "625ml Gasificada"
   (a diferencia de MARCA_BASE_GASIFICADA, que agrupa bajo la
   marca base y se usa en el resto de categorías). Cualquier
   marca que no esté en esta lista se muestra tal cual llegó
   (String(marca).trim()), así que una variante nueva que se
   agregue más adelante en MARCAS_POR_LINEA (01-config.js) no
   se pierde: solo no tendrá el nombre "bonito" hasta que se
   agregue aquí también.
*/
const NOMBRE_MARCA_GASIFICADA = {
  'bells gas': 'Bells Gas',
  'bells manzana': 'Bells Manzana',
  'bells maracuya': 'Bells Maracuya',
  'bells pina kion': 'Bells Piña Kion',
  'scala gas': 'Scala Gas',
  'scala manzana': 'Scala Manzana',
  'scala maracuya': 'Scala Maracuya',
  'scala pina kion': 'Scala Piña Kion',
  'cuisine gas': 'Cuisine Gas'
};

function marcaEsGasificada(marca){

  return Object.prototype.hasOwnProperty.call(
    MARCA_BASE_GASIFICADA,
    normalizarTexto(marca)
  );

}

function marcaBasePresentacion(marca){

  const original = String(marca || '').trim();

  if(!original){
    return 'Sin marca';
  }

  return (
    MARCA_BASE_GASIFICADA[normalizarTexto(original)] ||
    original
  );

}

function nombreMarcaGasificada(marca){

  const original = String(marca || '').trim();

  if(!original){
    return 'Sin marca';
  }

  return (
    NOMBRE_MARCA_GASIFICADA[normalizarTexto(original)] ||
    original
  );

}

function categoriaPresentacion(linea, presentacion, marca){

  const p = normalizarTexto(presentacion);

  if(linea === 'B7L'){

    if(p.includes('10 litro')) return '10L';
    if(p.includes('7 litro')) return '7L';

    return null;

  }

  if(linea === 'C20L'){
    return 'Cajas 20L';
  }

  if(linea === 'B20L'){
    return 'B20L';
  }

  if(linea === 'PET1' || linea === 'PET2'){

    if(p.includes('380ml')) return '380ml';

    if(p.includes('625ml')){

      return marcaEsGasificada(marca)
        ? '625ml Gasificada'
        : '625ml Regular';

    }

    if(p.includes('1.5l')) return '1.5L';

    if(p.includes('2.5l')) return '2.5L';

    if(p.includes('1l')) return '1L';

    return null;

  }

  return null;

}

function sumarProduccionPorPresentacionYMarca(records){

  const matriz = {};
  const totalesCategoria = {};
  const marcasSet = new Set();
  const categoriasConDatos = new Set();

  records.forEach(r => {

    const cuadros = normalizarCuadros(r);

    cuadros.forEach(c => {

      const efectiva = num(c.produccion?.efectiva);

      if(efectiva <= 0){
        return;
      }

      const categoria =
        categoriaPresentacion(r.linea, c.presentacion, c.marca);

      if(!categoria){
        return;
      }

      const marca =
        categoria === '625ml Gasificada'
          ? nombreMarcaGasificada(c.marca)
          : marcaBasePresentacion(c.marca);

      marcasSet.add(marca);
      categoriasConDatos.add(categoria);

      if(!matriz[marca]){
        matriz[marca] = {};
      }

      matriz[marca][categoria] =
        (matriz[marca][categoria] || 0) + efectiva;

      totalesCategoria[categoria] =
        (totalesCategoria[categoria] || 0) + efectiva;

    });

  });

  /*
     Las 10 categorías se muestran siempre, en el orden fijo de
     CATEGORIAS_PRESENTACION_ORDEN, tengan o no producción en
     el rango — ver nota al inicio del archivo. categoriasConDatos
     ya no se usa para filtrar, solo queda calculada arriba por si
     algún otro reporte la necesita más adelante.
  */
  const categorias =
    CATEGORIAS_PRESENTACION_ORDEN;

  const totalesMarca = {};

  marcasSet.forEach(m => {

    totalesMarca[m] =
      Object.values(matriz[m] || {})
        .reduce((a,v) => a + v, 0);

  });

  const marcas =
    Array.from(marcasSet)
      .sort((a,b) => totalesMarca[b] - totalesMarca[a]);

  const totalGeneral =
    Object.values(totalesCategoria)
      .reduce((a,v) => a + v, 0);

  return {
    categorias,
    marcas,
    matriz,
    totalesCategoria,
    totalesMarca,
    totalGeneral
  };

}


function generarInsightPresentacionMarca(datos, rangoLabel){

  if(datos.totalGeneral <= 0){

    return (
      'No hay producción registrada por presentación en ' +
      rangoLabel + '.'
    );

  }

  const categoriaLider =
    Object.entries(datos.totalesCategoria)
      .sort((a,b) => b[1] - a[1])[0];

  const participacionCategoria =
    pct(categoriaLider[1] / datos.totalGeneral);

  const marcaLider = datos.marcas[0];

  const participacionMarca =
    pct(datos.totalesMarca[marcaLider] / datos.totalGeneral);

  return (
    `<strong>${categoriaLider[0]}</strong> es la presentación con más volumen de ${rangoLabel} ` +
    `(${participacionCategoria} del total). Por marca, <strong>${marcaLider}</strong> lidera con ` +
    `${participacionMarca} de las unidades producidas.`
  );

}


/* =========================================================
   RENDER DEL PANEL "PRODUCCIÓN POR PRESENTACIÓN Y MARCA"
   =========================================================

   Se llama desde renderResumen() en los dos caminos posibles
   (con y sin registros en el rango de 7/30/90 días de
   arriba), porque este panel tiene su propio selector de
   vista (rango actual / mes / año) que usa TODO el historial
   visible — no el rango de días — así que puede tener datos
   aunque el resto del resumen esté vacío.

   - todos: registros de las líneas visibles, SIN el filtro
     de rango de días (para poblar los selectores de mes/año
     y para las vistas 'mes' y 'anio').
   - records: registros ya filtrados por el rango de días de
     arriba (para la vista 'rango', el comportamiento original).
   - rangoLabel: etiqueta del rango de arriba ('últimos 30
     días', 'todo el historial', etc.), solo se usa en modo
     'rango'.
   ========================================================= */

function renderPanelPresentacionMarca(todos, records, rangoLabel){

  const mesesDisponibles =
    obtenerMesesDisponiblesResumen(todos);

  const aniosDisponibles =
    obtenerAniosDisponiblesResumen(todos);

  if(
    resumenPresentacionModo === 'mes' &&
    !resumenPresentacionMes
  ){
    resumenPresentacionMes = mesesDisponibles[0] || null;
  }

  if(
    resumenPresentacionModo === 'anio' &&
    !resumenPresentacionAnio
  ){
    resumenPresentacionAnio = aniosDisponibles[0] || null;
  }


  let recordsPanel = records;
  let etiquetaPanel = rangoLabel;

  if(resumenPresentacionModo === 'mes'){

    recordsPanel =
      filtrarRecordsPorMesResumen(todos, resumenPresentacionMes);

    etiquetaPanel =
      resumenPresentacionMes
        ? etiquetaMesResumen(resumenPresentacionMes)
        : 'el mes seleccionado';

  } else if(resumenPresentacionModo === 'anio'){

    recordsPanel =
      filtrarRecordsPorAnioResumen(todos, resumenPresentacionAnio);

    etiquetaPanel =
      resumenPresentacionAnio
        ? 'el año ' + resumenPresentacionAnio
        : 'el año seleccionado';

  }


  /* ---------------------------------------------------
     CONTROLES (segmentos rango/mes/año + selector)
  --------------------------------------------------- */

  const controlesBox =
    document.getElementById('presentacion-marca-controles');

  if(controlesBox){

    controlesBox.innerHTML = `

      <div class="rs-seg">

        <button
          type="button"
          class="${resumenPresentacionModo === 'rango' ? 'active' : ''}"
          onclick="cambiarModoPresentacionMarca('rango')"
        >Rango actual</button>

        <button
          type="button"
          class="${resumenPresentacionModo === 'mes' ? 'active' : ''}"
          onclick="cambiarModoPresentacionMarca('mes')"
        >Por mes</button>

        <button
          type="button"
          class="${resumenPresentacionModo === 'anio' ? 'active' : ''}"
          onclick="cambiarModoPresentacionMarca('anio')"
        >Por año</button>

      </div>

      ${
        resumenPresentacionModo === 'mes'
          ? `
            <select class="rs-mes-select" onchange="cambiarMesPresentacionMarca(this.value)">
              ${
                mesesDisponibles.length
                  ? mesesDisponibles.map(m => `
                      <option value="${m}" ${m === resumenPresentacionMes ? 'selected' : ''}>
                        ${etiquetaMesResumen(m)}
                      </option>
                    `).join('')
                  : `<option value="">Sin datos</option>`
              }
            </select>
          `
          : ''
      }

      ${
        resumenPresentacionModo === 'anio'
          ? `
            <select class="rs-mes-select" onchange="cambiarAnioPresentacionMarca(this.value)">
              ${
                aniosDisponibles.length
                  ? aniosDisponibles.map(a => `
                      <option value="${a}" ${a === resumenPresentacionAnio ? 'selected' : ''}>
                        ${a}
                      </option>
                    `).join('')
                  : `<option value="">Sin datos</option>`
              }
            </select>
          `
          : ''
      }

    `;

  }


  const descBox =
    document.getElementById('presentacion-marca-desc');

  if(descBox){

    descBox.textContent =
      'Suma de unidades efectivas producidas en ' + etiquetaPanel +
      ' (todos los días de ese período sumados en un solo total), ' +
      'por presentación — 380ml, 625ml Regular, 625ml Gasificada, ' +
      '1L, 1.5L, 2.5L, 7L, 10L, Cajas 20L y B20L — y por marca.';

  }


  /* ---------------------------------------------------
     CÁLCULO
  --------------------------------------------------- */

  const datos =
    sumarProduccionPorPresentacionYMarca(recordsPanel);


  /* ---------------------------------------------------
     GRÁFICO
  --------------------------------------------------- */

  if(state.charts.presentacionMarca){
    state.charts.presentacionMarca.destroy();
    state.charts.presentacionMarca = null;
  }

  const canvasPresentacionMarca =
    document.getElementById('chart-presentacion-marca');

  if(canvasPresentacionMarca && datos.totalGeneral > 0){

    const coloresMarcasPresentacion =
      coloresResumen(datos.marcas.length);

    state.charts.presentacionMarca =

      new Chart(

        canvasPresentacionMarca,

        {

          type:'bar',

          data:{

            labels:
              datos.categorias,

            datasets:

              datos.marcas.map((marca, idx) => ({

                label: marca,

                data:
                  datos.categorias.map(
                    categoria =>
                      (datos.matriz[marca] || {})[categoria] || 0
                  ),

                backgroundColor: coloresMarcasPresentacion[idx],

                borderRadius:2,

                barPercentage:0.85,

                categoryPercentage:0.8

              }))

          },

          options:{

            maintainAspectRatio:false,

            interaction:{
              mode:'index',
              intersect:false
            },

            plugins:{

              legend:{
                display:true,
                position:'bottom',
                labels:{ boxWidth:9, boxHeight:9, usePointStyle:true, pointStyle:'rectRounded', padding:14, font:{ size:11 } }
              },

              valorBarra:{

                activo:true,

                color:PAL_R.texto,

                /*
                   Sin esto, cada barra en 0 (categoría/marca sin
                   producción, ahora que las 10 categorías siempre
                   se muestran) dibujaría un "0" pegado al eje —
                   se omite la etiqueta en ese caso.
                */
                formato:v => v ? formatearNumero(v) : ''

              },

              tooltip:{

                ...TOOLTIP_R,

                callbacks:{

                  label:ctx =>
                    ctx.dataset.label + ': ' +
                    formatearNumero(ctx.parsed.y) +
                    ' unidades',

                  footer:items => {

                    const total =
                      items.reduce((a,it) => a + it.parsed.y, 0);

                    return 'Total presentación: ' +
                      formatearNumero(total) + ' unidades';

                  }

                }

              }

            },

            scales:{

              x:{
                stacked:false,
                grid:{ display:false }
              },

              y:{

                stacked:false,

                beginAtZero:true,

                grid:{ color:GRID_R },

                ticks:{
                  callback:v => formatearNumero(v)
                }

              }

            }

          }

        }

      );

  }


  /* ---------------------------------------------------
     TABLA
  --------------------------------------------------- */

  const boxPresentacionMarca =
    document.getElementById('resumen-presentacion-marca');

  if(boxPresentacionMarca){

    if(!datos.totalGeneral){

      boxPresentacionMarca.innerHTML = `

        <div class="small-muted" style="padding:10px 0;">
          No hay producción por presentación en ${escaparHtml(etiquetaPanel)}.
        </div>

      `;

    } else {

      boxPresentacionMarca.innerHTML = `

        <table class="rs-table">

          <thead>

            <tr>

              <th>Marca</th>

              ${
                datos.categorias.map(
                  cat => `<th class="rs-num">${escaparHtml(cat)}</th>`
                ).join('')
              }

              <th class="rs-num">Total</th>

            </tr>

          </thead>

          <tbody>

            ${
              datos.marcas.map(marca => `

                <tr>

                  <td><strong>${escaparHtml(marca)}</strong></td>

                  ${
                    datos.categorias.map(cat => `
                      <td class="rs-num">${
                        formatearNumero(
                          (datos.matriz[marca] || {})[cat] || 0
                        )
                      }</td>
                    `).join('')
                  }

                  <td class="rs-num"><strong>${
                    formatearNumero(datos.totalesMarca[marca])
                  }</strong></td>

                </tr>

              `).join('')
            }

            <tr>

              <td><strong>Total</strong></td>

              ${
                datos.categorias.map(cat => `
                  <td class="rs-num"><strong>${
                    formatearNumero(datos.totalesCategoria[cat])
                  }</strong></td>
                `).join('')
              }

              <td class="rs-num"><strong>${
                formatearNumero(datos.totalGeneral)
              }</strong></td>

            </tr>

          </tbody>

        </table>

      `;

    }

  }


  /* ---------------------------------------------------
     INSIGHT
  --------------------------------------------------- */

  const insightPresentacionMarcaBox =
    document.getElementById('insight-presentacion-marca');

  if(insightPresentacionMarcaBox){

    insightPresentacionMarcaBox.innerHTML =
      cajaInsight(
        generarInsightPresentacionMarca(datos, etiquetaPanel)
      );

  }

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
    const derivados = [];

    recs.forEach(r => {

      const d = calcDerived(r);
      const h = num(d.horasEfectivas);

      if(h > 0){
        horas += h;
        derivados.push(d);
      }

    });

    return {

      linea: l.name,

      key: l.key,

      oee: glacialAgregarDerivados(derivados).oee,

      horas,

      sinDatos: recs.length === 0

    };

  });

}


/* =========================================================
   RESÚMENES AUTOMÁTICOS DEBAJO DE CADA GRÁFICO
   =========================================================

   Cada gráfico del tablero ejecutivo va acompañado de un
   pequeño texto, generado a partir de los mismos datos que
   arma el gráfico, que resalta el dato más relevante (el
   día/turno/línea/marca líder, qué tan lejos está de la
   meta, etc.) — para que gerencia no tenga que interpretar
   el gráfico por su cuenta.
   ========================================================= */

function cajaInsight(texto){

  return `
    <div class="chart-insight">
      <span class="chart-insight-icono">i</span>
      <span>${texto}</span>
    </div>
  `;

}


function generarInsightProdDia(porDiaPresentacion, rangoLabel){

  const { fechas, acumulado } = porDiaPresentacion;

  if(!fechas.length){
    return 'No hay producción registrada en ' + rangoLabel + '.';
  }

  let mejorFecha = fechas[0];
  let mejorTotal = 0;

  const totalPorPresentacion = {};

  fechas.forEach(fecha => {

    const datosDia = acumulado[fecha] || {};
    let totalDia = 0;

    Object.entries(datosDia).forEach(([presentacion, valor]) => {

      totalDia += valor;

      totalPorPresentacion[presentacion] =
        (totalPorPresentacion[presentacion] || 0) + valor;

    });

    if(totalDia > mejorTotal){
      mejorTotal = totalDia;
      mejorFecha = fecha;
    }

  });

  const totalGeneral =
    Object.values(totalPorPresentacion)
      .reduce((a,v) => a + v, 0);

  const presentacionesOrdenadas =
    Object.entries(totalPorPresentacion)
      .sort((a,b) => b[1] - a[1]);

  const fechaTexto =
    typeof formatearFecha === 'function'
      ? formatearFecha(mejorFecha)
      : mejorFecha;

  let texto =
    `El día con mayor producción fue el <strong>${fechaTexto}</strong>, ` +
    `con ${formatearNumero(mejorTotal)} unidades. `;

  if(presentacionesOrdenadas.length){

    const [presentacionTop, totalTop] = presentacionesOrdenadas[0];

    const participacion =
      totalGeneral > 0
        ? pct(totalTop / totalGeneral)
        : '—';

    texto +=
      `La presentación líder en ${rangoLabel} fue ` +
      `<strong>${presentacionTop}</strong>, con ${participacion} del total.`;

  }

  return texto;

}


function generarInsightProdTurno(porTurno, rangoLabel){

  const total =
    porTurno.reduce((a,x) => a + x.total, 0);

  if(total <= 0){
    return 'No hay producción registrada en ' + rangoLabel + '.';
  }

  const ordenado =
    [...porTurno].sort((a,b) => b.total - a.total);

  const lider = ordenado[0];

  const participacion =
    pct(lider.total / total);

  return (
    `El turno <strong>${lider.turno}</strong> concentra el ${participacion} ` +
    `de la producción de ${rangoLabel} ` +
    `(${formatearNumero(lider.total)} de ${formatearNumero(total)} unidades).`
  );

}


function generarInsightOEELinea(oeePorLinea, rangoLabel){

  const conDatos =
    oeePorLinea.filter(x => !x.sinDatos);

  if(!conDatos.length){
    return 'Ninguna de las líneas visibles tiene datos de OEE en ' + rangoLabel + '.';
  }

  const ordenado =
    [...conDatos].sort((a,b) => b.oee - a.oee);

  const mejor = ordenado[0];
  const peor = ordenado[ordenado.length - 1];

  const sinDatos =
    oeePorLinea
      .filter(x => x.sinDatos)
      .map(x => x.linea);

  let texto =
    `<strong>${mejor.linea}</strong> lidera con ${pct(mejor.oee)} de OEE` +
    (
      mejor.oee >= METAS.oee
        ? ', por encima de la meta. '
        : `, aún por debajo de la meta de ${pct(METAS.oee)}. `
    );

  if(peor.key !== mejor.key){

    texto +=
      `<strong>${peor.linea}</strong> es la que más se aleja, con ${pct(peor.oee)}` +
      (
        peor.oee < METAS.oee
          ? ` (${pct(METAS.oee - peor.oee)} por debajo de la meta).`
          : '.'
      );

  }

  if(sinDatos.length){
    texto += ` Sin datos en ${rangoLabel}: ${sinDatos.join(', ')}.`;
  }

  return texto;

}


function generarInsightProdLinea(prodPorLinea, rangoLabel){

  const total =
    prodPorLinea.reduce((a,x) => a + x.total, 0);

  if(total <= 0){
    return 'No hay producción registrada en ' + rangoLabel + ' para las líneas visibles.';
  }

  const ordenado =
    [...prodPorLinea].sort((a,b) => b.total - a.total);

  const lider = ordenado[0];

  const participacion =
    pct(lider.total / total);

  return (
    `<strong>${lider.linea}</strong> concentra el ${participacion} de la ` +
    `producción total de ${rangoLabel} ` +
    `(${formatearNumero(lider.total)} de ${formatearNumero(total)} unidades).`
  );

}


function generarInsightMarcas(porMarca, totalGeneral, rangoLabel){

  if(!porMarca.length || totalGeneral <= 0){
    return 'No hay producción por marca en ' + rangoLabel + '.';
  }

  const lider = porMarca[0];

  const participacionLider =
    pct(lider.total / totalGeneral);

  const top3 =
    porMarca.slice(0, 3)
      .reduce((a,x) => a + x.total, 0);

  const participacionTop3 =
    pct(top3 / totalGeneral);

  return (
    `<strong>${lider.marca}</strong> es la marca líder de ${rangoLabel}, con ` +
    `${participacionLider} del total. Las 3 marcas principales concentran ` +
    `${participacionTop3} de la producción.`
  );

}


/* =========================================================
   CÁLCULOS PARA LOS GRÁFICOS NUEVOS
   ========================================================= */

/*
   Color semáforo INVERSO (menor es mejor), en hex, para usar
   como backgroundColor de barras — versión de colorSegunMeta()
   pero para indicadores tipo merma.
*/

function colorSegunMetaInverso(valor, meta){

  if(valor <= meta){
    return PAL_R.verde;
  }

  if(valor <= meta * 1.15){
    return PAL_R.ambar;
  }

  return PAL_R.rojo;

}


/*
   Disponibilidad, Rendimiento y Calidad promedio (ponderado
   por horas efectivas) de cada línea visible — para ver de
   qué componente vienen las pérdidas de OEE.
*/

function calcularComponentesOEEPorLinea(records, lineas){

  return lineas.map(l => {

    const recs =
      records.filter(r => r.linea === l.key);

    let horas = 0;
    let planMin = 0;
    let npMin = 0;
    const derivados = [];
    let calXhoras = 0;

    recs.forEach(r => {

      const d = calcDerived(r);
      const h = num(d.horasEfectivas);

      if(h > 0){

        horas += h;
        calXhoras += num(d.calidad) * h;

      }

      planMin += (num(d.horasEfectivas) + num(d.pNoProg)) * 60;
      npMin += num(d.pNoProg) * 60;
      derivados.push(d);

    });

    return {

      linea: l.name,
      key: l.key,

      disponibilidad: GlacialIndicadores.disponibilidad(planMin, npMin) ?? 0,
      rendimiento: glacialAgregarDerivados(derivados).rendimiento,
      calidad: horas > 0 ? calXhoras / horas : 0,

      sinDatos: horas <= 0

    };

  });

}


/*
   % de merma sobre producción efectiva, por línea visible
   (mismo criterio que el KPI "Merma de planta", desglosado).
*/

function calcularMermaPorLinea(records, lineas){

  return lineas.map(l => {

    const recs =
      records.filter(r => r.linea === l.key);

    let efectivaTotal = 0;
    let mermaTotal = 0;

    recs.forEach(r => {

      efectivaTotal += produccionEfectivaRecord(r);

      mermaTotal +=
        agruparMermas(r).totalUnidades;

    });

    return {

      linea: l.name,
      key: l.key,

      mermaPct:
        GlacialIndicadores.merma(mermaTotal, efectivaTotal) ?? 0,

      sinDatos: recs.length === 0

    };

  });

}


/*
   Paradas agrupadas por causa, sumando TODOS los registros
   (todas las líneas visibles) del rango elegido — misma
   lógica que agruparParadas() (un solo registro) pero a
   nivel de planta.
*/

function agruparParadasPlanta(records){

  const acumulado = {};

  records.forEach(r => {

    const { filas } = agruparParadas(r);

    filas.forEach(f => {

      const causa = normalizarCausaParada(f.descripcion);
      const clave = f.tipo + '||' + causa.clave;

      if(!acumulado[clave]){

        acumulado[clave] = {
          descripcion: causa.descripcion,
          tipo: f.tipo,
          minutos: 0
        };

      }

      acumulado[clave].minutos += f.minutos;

    });

  });

  const filas =
    Object.values(acumulado)
      .sort((a,b) => b.minutos - a.minutos);

  const total =
    filas.reduce((a,f) => a + f.minutos, 0);

  let corrido = 0;

  filas.forEach(f => {

    corrido += f.minutos;

    f.acumuladoPct =
      total > 0 ? (corrido / total) * 100 : 0;

  });

  return { filas, total };

}


/* =========================================================
   INSIGHTS DE LOS GRÁFICOS NUEVOS
   ========================================================= */

function generarInsightTendenciaOEE(serieDiaria, kpiOeePlanta, rangoLabel){

  const conDatos =
    serieDiaria.filter(p => p.horas > 0);

  if(!conDatos.length){
    return 'No hay datos suficientes para la tendencia de OEE en ' + rangoLabel + '.';
  }

  const mejor =
    conDatos.reduce((a,b) => b.oee > a.oee ? b : a);

  const peor =
    conDatos.reduce((a,b) => b.oee < a.oee ? b : a);

  const fechaMejor =
    typeof formatearFecha === 'function'
      ? formatearFecha(mejor.fecha)
      : mejor.fecha;

  const fechaPeor =
    typeof formatearFecha === 'function'
      ? formatearFecha(peor.fecha)
      : peor.fecha;

  return (
    `El OEE de planta promedió <strong>${pct(kpiOeePlanta)}</strong> en ${rangoLabel} ` +
    `(meta ${pct(METAS.oee)}). El mejor día fue el <strong>${fechaMejor}</strong> ` +
    `con ${pct(mejor.oee)}, y el más bajo fue el <strong>${fechaPeor}</strong> con ${pct(peor.oee)}.`
  );

}


function generarInsightComponentesOEE(componentes, rangoLabel){

  const conDatos =
    componentes.filter(c => !c.sinDatos);

  if(!conDatos.length){
    return 'No hay datos suficientes para comparar los componentes del OEE en ' + rangoLabel + '.';
  }

  const promedio =
    campo =>
      conDatos.reduce((a,c) => a + c[campo], 0) / conDatos.length;

  const candidatos = [
    { nombre:'Disponibilidad', valor:promedio('disponibilidad'), meta:METAS.disponibilidad },
    { nombre:'Rendimiento', valor:promedio('rendimiento'), meta:METAS.rendimiento },
    { nombre:'Calidad', valor:promedio('calidad'), meta:METAS.calidad }
  ];

  candidatos.sort((a,b) => (a.valor / a.meta) - (b.valor / b.meta));

  const masLimitante = candidatos[0];

  return (
    `El componente que más limita el OEE de planta es ` +
    `<strong>${masLimitante.nombre}</strong>, con un promedio de ` +
    `${pct(masLimitante.valor)} frente a una meta de ${pct(masLimitante.meta)}.`
  );

}


function generarInsightMermaLinea(mermaPorLinea, rangoLabel){

  const conDatos =
    mermaPorLinea.filter(x => !x.sinDatos);

  if(!conDatos.length){
    return 'No hay datos suficientes para comparar la merma por línea en ' + rangoLabel + '.';
  }

  const ordenado =
    [...conDatos].sort((a,b) => b.mermaPct - a.mermaPct);

  const peor = ordenado[0];
  const mejor = ordenado[ordenado.length - 1];

  let texto =
    `<strong>${peor.linea}</strong> tiene la mayor merma, con ${pct(peor.mermaPct)}` +
    (
      peor.mermaPct > METAS.merma
        ? ` (por encima de la meta de ${pct(METAS.merma)}). `
        : '. '
    );

  if(mejor.key !== peor.key){

    texto +=
      `<strong>${mejor.linea}</strong> es la que mejor la controla, con ${pct(mejor.mermaPct)}.`;

  }

  return texto;

}


function generarInsightParadasPlanta(paradasAgrupadas, rangoLabel){

  if(!paradasAgrupadas.filas.length){
    return 'No se registraron paradas en ' + rangoLabel + '.';
  }

  const top3 =
    paradasAgrupadas.filas.slice(0,3)
      .reduce((a,f) => a + f.minutos, 0);

  const participacionTop3 =
    paradasAgrupadas.total > 0
      ? Math.round((top3 / paradasAgrupadas.total) * 100)
      : 0;

  const causaTop = paradasAgrupadas.filas[0];

  return (
    `La causa que más tiempo detiene la planta es ` +
    `<strong>${causaTop.descripcion}</strong> ` +
    `(${formatearNumero(causaTop.minutos)} min, ${causaTop.tipo.toLowerCase()}). ` +
    `Las 3 causas principales explican ${participacionTop3}% de los ` +
    `${formatearNumero(paradasAgrupadas.total)} min perdidos en ${rangoLabel}.`
  );

}


function formatearFechaResumen(fecha){
  if(!fecha) return '';
  const [y,m,d]=String(fecha).split('-');
  return [d,m,y].filter(Boolean).join('/');
}



/* =========================================================
   KPI PRODUCCIÓN TOTAL — DESGLOSE REAL POR LÍNEA
   ========================================================= */
function produccionResumenPorLinea(records){
  const orden=['PET1','PET2','B7L','C20L','B20L'];
  const acumulado={};

  (records || []).forEach(r=>{
    const linea=String(r?.linea || '').toUpperCase();
    if(!linea) return;
    acumulado[linea]=(acumulado[linea] || 0) + produccionEfectivaRecord(r);
  });

  const extras=Object.keys(acumulado).filter(x=>!orden.includes(x)).sort();
  return [...orden,...extras]
    .filter(linea=>num(acumulado[linea])>0)
    .map(linea=>({linea,total:num(acumulado[linea])}));
}

function tarjetaProduccionTotalPorLinea(records,total){
  const filas=produccionResumenPorLinea(records);
  const suma=filas.reduce((a,f)=>a+f.total,0) || 1;

  const segmentos=filas.map((f,i)=>`
    <span class="kpi-prod-seg kpi-prod-seg-${(i%5)+1}"
      style="width:${Math.max(2,(f.total/suma)*100)}%"></span>
  `).join('');

  const detalle=filas.length
    ? filas.map((f,i)=>`
      <div class="kpi-prod-item">
        <span class="kpi-prod-dot kpi-prod-dot-${(i%5)+1}"></span>
        <span>${f.linea}</span>
        <strong>${formatearNumero(f.total)}</strong>
      </div>
    `).join('')
    : `<div class="kpi-prod-empty">Sin producción registrada</div>`;

  return `
    <div class="rs-kpi kpi-prod-card">
      <div class="rs-kpi-label">Producción total (por línea)</div>
      <div class="rs-kpi-value">${formatearNumero(total)}</div>
      <div class="kpi-prod-sub">Unidades efectivas del período</div>
      ${filas.length ? `<div class="kpi-prod-bar">${segmentos}</div>` : ''}
      <div class="kpi-prod-grid">${detalle}</div>
    </div>
  `;
}


/* =========================================================
   PRODUCCIÓN POR LÍNEA Y PRESENTACIÓN
   =========================================================
   Bloque ejecutivo adicional. NO reemplaza el gráfico
   "Producción por presentación y marca": ambos permanecen.
*/
function etiquetaPresentacionLineaResumen(linea, presentacion){
  const p=String(presentacion || '').toLowerCase().replace(/\s+/g,'');

  if(p.includes('380ml') && p.includes('24und')) return '380 ml Pack x 24 und';
  if(p.includes('625ml') && p.includes('15und')) return '625 ml Pack x 15 und';
  if(p.includes('625ml') && p.includes('6und')) return '625 ml Pack x 6 und';
  if(p.includes('1.5l') && p.includes('6und')) return '1.5 L Pack x 6 und';
  if(p.includes('2.5l') && p.includes('6und')) return '2.5 L Pack x 6 und';
  if(p.includes('1lx12und')) return '1 L Pack x 12 und';
  if(p.includes('1lx6und')) return '1 L Pack x 6 und';
  if(p.includes('7000ml') && p.includes('2und')) return '7 L Pack x 2 und';
  if(p.includes('7000ml') && p.includes('1und')) return '7 L Pack x 1 und';
  if(p.includes('7l') && p.includes('2und')) return '7 L Pack x 2 und';
  if(p.includes('7l') && p.includes('1und')) return '7 L Pack x 1 und';
  if(p.includes('20l')) return linea === 'C20L' ? '20 L (Cajas)' : '20 L';
  if(p.includes('b20l')) return 'B20L';

  // Fallback: conserva el nombre conocido por el sistema.
  if(typeof nombrePresentacionUI === 'function'){
    try{
      return nombrePresentacionUI(linea, '', presentacion);
    }catch(_e){}
  }

  return String(presentacion || 'Sin presentación')
    .replace(/_/g,' ')
    .replace(/\/l[an]$/i,'');
}

function datosProduccionLineaPresentacionResumen(records){
  const lineas={};

  (records || []).forEach(r=>{
    const linea=String(r?.linea || '').toUpperCase();
    if(!linea) return;

    if(!lineas[linea]){
      lineas[linea]={linea,total:0,presentaciones:{}};
    }

    // En los reportes actuales cada cuadro representa una presentación/marca.
    // Se usa efectiva del cuadro cuando existe; para estructuras antiguas se
    // usa el total derivado del reporte como respaldo.
    const cuadros=Array.isArray(r?.cuadros) ? r.cuadros : [];

    if(cuadros.length){
      cuadros.forEach(c=>{
        const efectiva=num(c?.efectiva ?? c?.produccion?.efectiva);
        if(efectiva<=0) return;

        const pres=c?.presentacion || r?.presentacion || 'Sin presentación';
        const etiqueta=etiquetaPresentacionLineaResumen(linea,pres);

        lineas[linea].presentaciones[etiqueta]=
          (lineas[linea].presentaciones[etiqueta] || 0) + efectiva;

        lineas[linea].total += efectiva;
      });
    }else{
      const efectiva=produccionEfectivaRecord(r);
      if(efectiva<=0) return;

      const pres=r?.presentacion || r?.produccion?.presentacion || 'Sin presentación';
      const etiqueta=etiquetaPresentacionLineaResumen(linea,pres);

      lineas[linea].presentaciones[etiqueta]=
        (lineas[linea].presentaciones[etiqueta] || 0) + efectiva;

      lineas[linea].total += efectiva;
    }
  });

  const orden=['PET1','PET2','B7L','C20L','B20L'];
  const extras=Object.keys(lineas).filter(x=>!orden.includes(x)).sort();

  return [...orden,...extras]
    .filter(k=>lineas[k] && lineas[k].total>0)
    .map(k=>({
      ...lineas[k],
      presentaciones:Object.entries(lineas[k].presentaciones)
        .map(([nombre,unidades])=>({nombre,unidades}))
        .sort((a,b)=>b.unidades-a.unidades)
    }));
}

function renderProduccionLineaPresentacionResumen(records){
  const lineas=datosProduccionLineaPresentacionResumen(records);
  const total=lineas.reduce((a,l)=>a+l.total,0);

  const tarjetas=lineas.length
    ? lineas.map((l,idx)=>{
        const participacion=total>0 ? (l.total/total)*100 : 0;
        const filas=l.presentaciones.map((p,i)=>`
          <div class="rs-lp-row">
            <span class="rs-lp-row-left">
              <i class="rs-lp-dot rs-lp-dot-${(i%5)+1}"></i>
              <span>${escaparHtml(p.nombre)}</span>
            </span>
            <strong>${formatearNumero(p.unidades)}</strong>
          </div>
        `).join('');

        return `
          <article class="rs-lp-card">
            <header class="rs-lp-card-head">
              <div>
                <div class="rs-lp-linea">${escaparHtml(l.linea)}</div>
                <div class="rs-lp-total">Producción: <strong>${formatearNumero(l.total)} und</strong></div>
              </div>
              <div class="rs-lp-share">
                <strong>${participacion.toFixed(1)}%</strong>
                <span>del total</span>
              </div>
            </header>

            <div class="rs-lp-table-head">
              <span>Presentación</span>
              <span>Unidades</span>
            </div>

            <div class="rs-lp-rows">${filas}</div>
          </article>
        `;
      }).join('')
    : `
      <div class="rs-lp-empty">
        No hay producción registrada por línea y presentación en este período.
      </div>
    `;

  return `
    <section class="rs-linea-presentacion">
      <div class="rs-lp-titlebar">
        <div>
          <div class="rs-lp-eyebrow">Detalle operativo</div>
          <h3>Producción por línea y presentación</h3>
          <p>Unidades efectivas agrupadas por línea y formato para el período seleccionado.</p>
        </div>
      </div>
      <div class="rs-lp-grid">${tarjetas}</div>
    </section>
  `;
}

/* =========================================================
   RENDER PRINCIPAL DEL RESUMEN
   ========================================================= */


/* =========================================================
   RESUMEN GENERAL — CAPA INDUSTRIAL DE PLANTA
   ========================================================= */

function resumenSeleccionarLinea(linea){
  resumenFiltroLinea=linea||'TODAS';
  renderResumen(document.getElementById('main'));
}

function rsNum(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function rsCuadros(r){return typeof normalizarCuadros==='function'?normalizarCuadros(r):(r?.cuadros||[]);}
function rsProd(r){return rsCuadros(r).reduce((s,q)=>s+rsNum(q?.produccion?.efectiva),0);}
function rsParadas(r){
  return rsCuadros(r).flatMap(q=>[
    ...(q?.paradasProgramadas||[]).map(p=>({...p,tipo:'Programada'})),
    ...(q?.paradasNoProgramadas||[]).map(p=>({...p,tipo:'No programada'}))
  ]).filter(p=>rsNum(p?.tiempoMin)>0);
}
function rsMinProduccion(r){
  return rsCuadros(r).reduce((s,q)=>{
    const ini=q?.horaInicio,fin=q?.horaFin;
    if(!ini||!fin)return s;
    const [hi,mi]=ini.split(':').map(Number),[hf,mf]=fin.split(':').map(Number);
    let m=(hf*60+mf)-(hi*60+mi);if(m<0)m+=1440;
    return s+m;
  },0);
}
function rsMerma(r){
  return rsCuadros(r).reduce((s,q)=>{
    const m=q?.mermas||q?.merma||{};
    if(Array.isArray(m))return s+m.reduce((a,x)=>a+rsNum(x?.unidades||x?.cantidad),0);
    return s+Object.values(m||{}).reduce((a,x)=>a+rsNum(typeof x==='object'?(x?.unidades||x?.cantidad):x),0);
  },0);
}
function rsPersonal(r){return new Set((r?.personal||[]).filter(p=>p?.nombre).map(p=>String(p.nombre).trim().toLowerCase())).size;}
function rsFechaEnRango(fecha){
  if(resumenRangoDias===1)return fecha===(resumenFechaDiaria||fechaHoyResumen());
  if(!resumenRangoDias)return true;
  const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-(resumenRangoDias-1));
  return fecha>=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function rsProgramaciones(){
  const arr=typeof loadProgramaciones==='function'?loadProgramaciones():(typeof _programacionesCache!=='undefined'?_programacionesCache:[]);
  return (arr||[]).filter(p=>rsFechaEnRango(p.fecha)&&
    (resumenFiltroLinea==='TODAS'||p.linea===resumenFiltroLinea));
}
function rsPaletas(){
  const arr=typeof loadPaletas==='function'?loadPaletas():(typeof _paletasCache!=='undefined'?_paletasCache:[]);
  return (arr||[]).filter(p=>rsFechaEnRango(p.fecha)&&
    (resumenFiltroLinea==='TODAS'||p.linea===resumenFiltroLinea));
}
function rsNominalCuadro(q,linea){
  const direct=rsNum(q?.ratioNominal||q?.produccion?.ratioNominal||q?.ratio);
  if(direct)return direct;
  try{
    if(typeof obtenerRatioNominal==='function')return rsNum(obtenerRatioNominal(linea,q?.marca,q?.presentacion));
    if(typeof getRatioNominal==='function')return rsNum(getRatioNominal(linea,q?.marca,q?.presentacion));
  }catch(_){}
  return 0;
}
function rsLineaNombre(k){return ({PET1:'PET1',PET2:'PET2',B7L:'B7L',C20L:'CAJAS 20L',B20L:'B20L',HIELO:'HIELO'})[k]||k;}
function rsEstadoLineas(){
  const hoy=fechaHoyResumen();
  const progs=(typeof loadProgramaciones==='function'?loadProgramaciones():(typeof _programacionesCache!=='undefined'?_programacionesCache:[]))||[];
  const lineas=['PET1','PET2','B7L','C20L','B20L'];
  return lineas.map(linea=>{
    const xs=progs.filter(p=>p.linea===linea&&p.fecha===hoy);
    const ops=xs.map(x=>x.estadoOperacion||{});
    let estado='SIN ACTIVIDAD',nivel='off';
    if(ops.some(o=>o.estado==='DETENIDA')){estado='DETENIDA';nivel='stop';}
    else if(ops.some(o=>o.estado==='PAUSA')){estado='PAUSA';nivel='pause';}
    else if(ops.some(o=>o.estado==='EN_PRODUCCION')){estado='EN PRODUCCIÓN';nivel='run';}
    else if(ops.some(o=>o.estado==='FINALIZADA')){estado='FINALIZADA';nivel='done';}
    else if(xs.length){estado='PENDIENTE';nivel='wait';}
    return {linea,estado,nivel};
  });
}
function rsDatosIndustriales(records){
  const lineas=['PET1','PET2','B7L','C20L','B20L'];
  const progs=rsProgramaciones(), pals=rsPaletas();
  const porLinea=lineas.map(linea=>{
    const rr=records.filter(r=>r.linea===linea);
    const pp=progs.filter(p=>p.linea===linea&&!(p.estadoOperacion&&p.estadoOperacion.estado==='CANCELADA'));   // canceladas según estadoOperacion.estado (como el semáforo)
    const programado=pp.reduce((a,p)=>a+rsNum(p.cantidadProgramada),0);
    let producido=rr.reduce((a,r)=>a+rsProd(r),0);
    const palLinea=pals.filter(p=>p.linea===linea);
    if(!producido&&palLinea.length)producido=palLinea.reduce((a,p)=>a+rsNum(p.totalUnidades||p.unidadesIncompleta),0);
    const paradas=rr.flatMap(rsParadas);
    const minParadas=paradas.reduce((a,p)=>a+rsNum(p.tiempoMin),0);
    const minCalendario=rr.reduce((a,r)=>a+rsMinProduccion(r),0);
    const horasEf=GlacialIndicadores.horasEfectivas({transcurridoMin:minCalendario,paradasProgramadasMin:0,paradasNoProgramadasMin:minParadas});
    const minEfectivos=horasEf*60;
    const ratio=GlacialIndicadores.ratio(producido,horasEf) ?? 0;
    const nominales=[];
    rr.forEach(r=>rsCuadros(r).forEach(q=>{const n=rsNominalCuadro(q,linea);if(n)nominales.push(n);}));
    const nominal=nominales.length?nominales.reduce((a,b)=>a+b,0)/nominales.length:0;
    const merma=rr.reduce((a,r)=>a+rsMerma(r),0);
    const personal=rr.reduce((a,r)=>Math.max(a,rsPersonal(r)),0);
    return {linea,programado,producido,cumplimiento:GlacialIndicadores.cumplimiento(producido,programado)??0,
      paradas,minParadas,minEfectivos,ratio,nominal,merma,personal};
  }).filter(x=>x.programado||x.producido||x.minParadas||x.merma);
  const causas=new Map();
  porLinea.flatMap(x=>x.paradas).forEach(p=>{
    const causa=normalizarCausaParada(p.descripcion);
    const k=causa.clave;
    const o=causas.get(k)||{
      descripcion:causa.descripcion,
      minutos:0,
      tipo:p.tipo
    };
    o.minutos+=rsNum(p.tiempoMin);
    causas.set(k,o);
  });
  const pareto=[...causas.values()].sort((a,b)=>b.minutos-a.minutos).slice(0,10);
  const dias=new Map();
  records.forEach(r=>{const k=r.fecha||'';if(k)dias.set(k,(dias.get(k)||0)+rsProd(r));});
  return {porLinea,pareto,tendencia:[...dias].sort((a,b)=>a[0].localeCompare(b[0]))};
}
function rsDestroyIndustrial(){
  Object.values(resumenIndustrialCharts||{}).forEach(c=>{try{c.destroy();}catch(_){}});
  resumenIndustrialCharts={};
}
function rsChart(id,config){
  const el=document.getElementById(id);if(!el||typeof Chart==='undefined')return;
  resumenIndustrialCharts[id]=new Chart(el,config);
}
function rsInsight(data){
  if(!data.porLinea.length)return ['No hay datos operativos suficientes en el período seleccionado.'];
  const out=[];
  const conProd=data.porLinea.filter(x=>x.producido>0);
  out.push(`Se registraron ${conProd.length} línea${conProd.length===1?'':'s'} con producción en el período.`);
  const maxP=data.porLinea.slice().sort((a,b)=>b.minParadas-a.minParadas)[0];
  if(maxP?.minParadas)out.push(`${rsLineaNombre(maxP.linea)} acumuló ${Math.round(maxP.minParadas).toLocaleString('es-PE')} min de parada, el mayor tiempo registrado entre las líneas visibles.`);
  if(data.pareto[0])out.push(`La principal causa de parada fue “${data.pareto[0].descripcion}”, con ${Math.round(data.pareto[0].minutos).toLocaleString('es-PE')} min.`);
  const cumpl=data.porLinea.filter(x=>x.programado>0).sort((a,b)=>b.cumplimiento-a.cumplimiento)[0];
  if(cumpl)out.push(`${rsLineaNombre(cumpl.linea)} produjo ${Math.round(cumpl.producido).toLocaleString('es-PE')} frente a ${Math.round(cumpl.programado).toLocaleString('es-PE')} programadas (${(cumpl.cumplimiento*100).toFixed(1)}%).`);
  const ratio=data.porLinea.find(x=>x.ratio&&x.nominal);
  if(ratio)out.push(`${rsLineaNombre(ratio.linea)} registró Ratio Turno de ${Math.round(ratio.ratio).toLocaleString('es-PE')} frente a nominal ${Math.round(ratio.nominal).toLocaleString('es-PE')} ${ratio.linea==='C20L'?'C/H':'B/H'}.`);
  return out;
}
function renderResumenIndustrial(records,rangoLabel){
  rsDestroyIndustrial();
  const anchor=document.getElementById('resumen-anclaje')||document.getElementById('resumen-kpis');if(!anchor)return;
  const data=rsDatosIndustriales(records);
  const estados=rsEstadoLineas();
  const totalParadas=data.porLinea.reduce((a,x)=>a+x.minParadas,0);
  const totalProg=data.porLinea.reduce((a,x)=>a+x.programado,0);
  const totalProd=data.porLinea.reduce((a,x)=>a+x.producido,0);
  const cumplimiento=GlacialIndicadores.cumplimiento(totalProd,totalProg)??0;
  const totalMerma=data.porLinea.reduce((a,x)=>a+x.merma,0);
  const mermaPct=GlacialIndicadores.merma(totalMerma,totalProd)??0;          // misma fórmula que la tarjeta del Resumen: suma de mermas ÷ producción efectiva
  const horasEf=data.porLinea.reduce((a,x)=>a+x.minEfectivos,0)/60;
  const filtros=['TODAS','PET1','PET2','B7L','C20L','B20L'];

  const sec=document.createElement('section');
  sec.className='rs-industrial';
  sec.innerHTML=`
    <style>
      .rs-industrial{margin:0 0 20px}.rs-industrial .ri-filter{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 14px}
      .ri-filter button{border:1px solid #d8e2e8;background:#fff;border-radius:999px;padding:7px 12px;font-size:11px;font-weight:700;cursor:pointer;color:#45606f}
      .ri-filter button.active{background:#073f68;color:#fff;border-color:#073f68}
      .ri-pulse{border:1px solid #dce5ea;background:#fff;border-radius:10px;padding:15px;margin-bottom:12px}
      .ri-pulse h3,.ri-box h3,.ri-read h3{margin:0 0 10px;color:#073f68;font-size:14px}
      .ri-status{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.ri-state{padding:9px;border:1px solid #e5ebef;border-radius:8px;font-size:11px}
      .ri-state b{display:block;margin-bottom:3px}.ri-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;background:#aab7bf}.ri-dot.run{background:#2e8b57}.ri-dot.stop{background:#c4472b}.ri-dot.pause{background:#d89216}.ri-dot.done{background:#5a9fd6}
      .ri-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin-bottom:12px}.ri-kpi{background:#fff;border:1px solid #dce5ea;border-radius:9px;padding:12px}.ri-kpi span{font-size:10px;text-transform:uppercase;color:#71828d;font-weight:700}.ri-kpi b{display:block;font-size:22px;color:#17384d;margin-top:4px}.ri-kpi small{color:#82919a}
      .ri-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ri-box{background:#fff;border:1px solid #dce5ea;border-radius:10px;padding:14px;min-width:0}.ri-box.wide{grid-column:1/-1}.ri-canvas{height:250px;position:relative}.ri-canvas.tall{height:300px}
      .ri-read{margin-top:12px;background:#f7fafc;border:1px solid #dce5ea;border-left:4px solid #5a9fd6;border-radius:9px;padding:14px}.ri-read ul{margin:0;padding-left:19px}.ri-read li{margin:5px 0;color:#435b69;font-size:12px}
      @media(max-width:900px){.ri-status,.ri-kpis{grid-template-columns:repeat(2,1fr)}.ri-grid{grid-template-columns:1fr}.ri-box.wide{grid-column:auto}}@media(max-width:520px){.ri-status,.ri-kpis{grid-template-columns:1fr}}
    </style>
    <div class="ri-filter">${filtros.map(x=>`<button class="${resumenFiltroLinea===x?'active':''}" onclick="resumenSeleccionarLinea('${x}')">${x==='TODAS'?'Toda la planta':rsLineaNombre(x)}</button>`).join('')}</div>
    <div class="ri-pulse"><h3>Estado actual de planta</h3><div class="ri-status">${estados.map(e=>`<div class="ri-state"><b>${rsLineaNombre(e.linea)}</b><span class="ri-dot ${e.nivel}"></span>${e.estado}</div>`).join('')}</div></div>
    <div class="ri-grid">
      <div class="ri-box"><h3>Programado vs producido por línea</h3><div class="ri-canvas"><canvas id="ri-plan-real"></canvas></div></div>
      <div class="ri-box"><h3>Cumplimiento por línea</h3><div class="ri-canvas"><canvas id="ri-cumplimiento"></canvas></div></div>
      <div class="ri-box wide"><h3>Pareto de causas de parada</h3><div class="ri-canvas tall"><canvas id="ri-pareto"></canvas></div></div>
      <div class="ri-box"><h3>Minutos de parada por línea</h3><div class="ri-canvas"><canvas id="ri-paradas"></canvas></div></div>
      <div class="ri-box"><h3>Merma registrada por línea</h3><div class="ri-canvas"><canvas id="ri-merma"></canvas></div></div>
      <div class="ri-box"><h3>Ratio Turno vs nominal</h3><div class="ri-canvas"><canvas id="ri-ratio"></canvas></div></div>
      <div class="ri-box"><h3>Producción por persona</h3><div class="ri-canvas"><canvas id="ri-personal"></canvas></div></div>
    </div>
    <div class="ri-kpis">
      <div class="ri-kpi"><span>Producción visible</span><b>${Math.round(totalProd).toLocaleString('es-PE')}</b><small>No mezcla interpretación entre formatos</small></div>
      <div class="ri-kpi"><span>Cumplimiento</span><b>${totalProg?(cumplimiento*100).toFixed(1)+'%':'—'}</b><small>Producido / programado</small></div>
      <div class="ri-kpi"><span>Paradas</span><b>${Math.round(totalParadas).toLocaleString('es-PE')} min</b><small>Acumulado</small></div>
      <div class="ri-kpi"><span>Horas efectivas</span><b>${horasEf.toFixed(1)} h</b><small>Tiempo − paradas</small></div>
      <div class="ri-kpi"><span>Merma</span><b>${mermaPct?(mermaPct*100).toFixed(1)+'%':'0.0%'}</b><small>Suma de mermas ÷ producción efectiva</small></div>
    </div>
    <div class="ri-read"><h3>Resumen del período</h3><ul>${rsInsight(data).map(x=>`<li>${escaparHtml(x)}</li>`).join('')}</ul></div>`;
  anchor.parentNode.insertBefore(sec,anchor);

  const labels=data.porLinea.map(x=>rsLineaNombre(x.linea));
  const base={responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true}}};
  rsChart('ri-plan-real',{type:'bar',data:{labels,datasets:[{label:'Programado',data:data.porLinea.map(x=>x.programado)},{label:'Producido',data:data.porLinea.map(x=>x.producido)}]},options:base});
  rsChart('ri-cumplimiento',{type:'bar',data:{labels,datasets:[{label:'Cumplimiento %',data:data.porLinea.map(x=>x.programado?+(x.cumplimiento*100).toFixed(1):0)}]},options:{...base,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,suggestedMax:100,ticks:{callback:v=>v+'%'}}}}});
  rsChart('ri-ratio',{type:'bar',data:{labels,datasets:[{label:'Nominal',data:data.porLinea.map(x=>x.nominal)},{label:'Ratio Turno',data:data.porLinea.map(x=>x.ratio)}]},options:base});
  rsChart('ri-paradas',{type:'bar',data:{labels,datasets:[{label:'Minutos',data:data.porLinea.map(x=>x.minParadas)}]},options:{...base,plugins:{legend:{display:false}}}});
  let acum=0,totalPareto=data.pareto.reduce((a,x)=>a+x.minutos,0);
  rsChart('ri-pareto',{data:{labels:data.pareto.map(x=>x.descripcion),datasets:[{type:'bar',label:'Minutos',data:data.pareto.map(x=>x.minutos),yAxisID:'y'},{type:'line',label:'% acumulado',data:data.pareto.map(x=>totalPareto?+(acum+=x.minutos,acum/totalPareto*100).toFixed(1):0),yAxisID:'y1'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true},y1:{beginAtZero:true,max:100,position:'right',grid:{drawOnChartArea:false},ticks:{callback:v=>v+'%'}}}}});
  rsChart('ri-merma',{type:'bar',data:{labels,datasets:[{label:'Merma',data:data.porLinea.map(x=>x.merma)}]},options:{...base,plugins:{legend:{display:false}}}});
  rsChart('ri-personal',{type:'bar',data:{labels,datasets:[{label:'Producción / persona',data:data.porLinea.map(x=>x.personal?x.producido/x.personal:0)}]},options:{...base,plugins:{legend:{display:false}}}});
}

function renderResumen(main){

  // Jefatura y Gerencia consultan todas las líneas desde este resumen,
  // aunque sus accesos individuales estén ocultos en el menú lateral.
  const lineasVisibles = lineasConsultables();

  const todos =
    loadRecords().filter(
      r => lineasVisibles.some(l => l.key === r.linea)
    );

  let records =
    filtrarPorRangoResumen(todos);

  if(resumenFiltroLinea !== 'TODAS'){
    records = records.filter(r=>r.linea===resumenFiltroLinea);
  }


  const rangoLabel =

    resumenRangoDias === 1

      ? `día ${formatearFechaResumen(resumenFechaDiaria || fechaHoyResumen())}`

      : (
          resumenRangoDias === 'rango' && typeof window.glacialRangoEtiqueta === 'function'
            ? window.glacialRangoEtiqueta()
          : resumenRangoDias
            ? `últimos ${resumenRangoDias} días`
            : 'todo el historial'
        );


  main.innerHTML = `

    <style>

      .resumen-pro{
        --rs-ink:#2E3A46;
        --rs-soft:#6B7784;
        --rs-line:#E6EBEF;
        --rs-blue:#7C9EBD;
        max-width:1320px;
      }

      /* ---------- Encabezado ---------- */

      .resumen-pro .rs-head{
        display:flex;
        justify-content:space-between;
        align-items:flex-end;
        gap:16px;
        flex-wrap:wrap;
        margin-bottom:20px;
        padding-bottom:16px;
        border-bottom:1px solid var(--rs-line);
      }

      .resumen-pro .rs-eyebrow{
        font-size:11px;
        letter-spacing:.14em;
        text-transform:uppercase;
        color:var(--rs-blue);
        font-weight:600;
        margin-bottom:4px;
      }

      .resumen-pro .rs-head h2{
        margin:0;
        font-size:26px;
        font-weight:600;
        color:var(--rs-ink);
        letter-spacing:-.015em;
      }

      .resumen-pro .rs-head .sub{
        margin-top:4px;
        font-size:13px;
        color:var(--rs-soft);
      }

      .resumen-pro .rs-actions{
        display:flex;
        gap:10px;
        align-items:center;
        flex-wrap:wrap;
      }

      .resumen-pro .kpi-prod-card{
        border-left:4px solid #5A9FD6;
        overflow:hidden;
      }
      .resumen-pro .kpi-prod-sub{
        font-size:10.5px;
        color:var(--rs-soft);
        margin-top:-2px;
      }
      .resumen-pro .kpi-prod-bar{
        height:7px;
        display:flex;
        overflow:hidden;
        border-radius:999px;
        background:#EDF3F7;
        margin:9px 0 8px;
      }
      .resumen-pro .kpi-prod-seg{display:block;background:#2467A5}
      .resumen-pro .kpi-prod-seg-2{background:#438AC3}
      .resumen-pro .kpi-prod-seg-3{background:#6AA8D4}
      .resumen-pro .kpi-prod-seg-4{background:#91C1E0}
      .resumen-pro .kpi-prod-seg-5{background:#B5D6EA}
      .resumen-pro .kpi-prod-grid{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:5px 12px;
      }
      .resumen-pro .kpi-prod-item{
        display:grid;
        grid-template-columns:7px 1fr auto;
        align-items:center;
        gap:5px;
        min-width:0;
        font-size:10.5px;
        color:var(--rs-soft);
      }
      .resumen-pro .kpi-prod-item strong{
        color:var(--rs-ink);
        font-size:10.5px;
      }
      .resumen-pro .kpi-prod-dot{
        width:7px;height:7px;border-radius:50%;background:#2467A5;
      }
      .resumen-pro .kpi-prod-dot-2{background:#438AC3}
      .resumen-pro .kpi-prod-dot-3{background:#6AA8D4}
      .resumen-pro .kpi-prod-dot-4{background:#91C1E0}
      .resumen-pro .kpi-prod-dot-5{background:#B5D6EA}
      .resumen-pro .kpi-prod-empty{
        margin-top:10px;font-size:11px;color:var(--rs-soft);
      }


      /* ---------- Producción por línea y presentación ---------- */
      .resumen-pro .rs-linea-presentacion{
        margin:20px 0;
        padding:18px;
        background:#FFFFFF;
        border:1px solid #DFE7ED;
        border-radius:16px;
        box-shadow:0 3px 12px rgba(36,55,72,.045);
      }
      .resumen-pro .rs-lp-titlebar{
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:16px;
        margin-bottom:14px;
      }
      .resumen-pro .rs-lp-eyebrow{
        color:#6F98B8;
        font-size:9px;
        font-weight:700;
        letter-spacing:.13em;
        text-transform:uppercase;
        margin-bottom:3px;
      }
      .resumen-pro .rs-lp-titlebar h3{
        margin:0;
        color:#213244;
        font-size:18px;
        letter-spacing:-.01em;
      }
      .resumen-pro .rs-lp-titlebar p{
        margin:4px 0 0;
        color:#73808C;
        font-size:11.5px;
      }
      .resumen-pro .rs-lp-grid{
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(230px,1fr));
        gap:12px;
      }
      .resumen-pro .rs-lp-card{
        min-width:0;
        overflow:hidden;
        background:linear-gradient(180deg,#F8FBFE 0,#FFFFFF 45%);
        border:1px solid #DCE7F0;
        border-radius:12px;
      }
      .resumen-pro .rs-lp-card-head{
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:10px;
        padding:13px 14px 11px;
        border-bottom:1px solid #E7EDF2;
      }
      .resumen-pro .rs-lp-linea{
        color:#18314B;
        font-size:18px;
        line-height:1;
        font-weight:800;
      }
      .resumen-pro .rs-lp-total{
        margin-top:5px;
        color:#667787;
        font-size:11px;
      }
      .resumen-pro .rs-lp-total strong{color:#26394B}
      .resumen-pro .rs-lp-share{
        min-width:62px;
        padding:5px 8px;
        text-align:center;
        background:#E8F4FC;
        border-radius:9px;
        color:#285E87;
      }
      .resumen-pro .rs-lp-share strong{
        display:block;
        font-size:14px;
        line-height:1.1;
      }
      .resumen-pro .rs-lp-share span{
        display:block;
        margin-top:2px;
        font-size:8.5px;
      }
      .resumen-pro .rs-lp-table-head{
        display:grid;
        grid-template-columns:1fr auto;
        gap:10px;
        padding:7px 13px;
        color:#63788A;
        background:#F3F7FA;
        font-size:8.5px;
        font-weight:700;
        letter-spacing:.08em;
        text-transform:uppercase;
      }
      .resumen-pro .rs-lp-rows{padding:4px 13px 8px}
      .resumen-pro .rs-lp-row{
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        align-items:center;
        gap:10px;
        min-height:27px;
        border-bottom:1px solid #EDF1F4;
        color:#415262;
        font-size:10.5px;
      }
      .resumen-pro .rs-lp-row:last-child{border-bottom:0}
      .resumen-pro .rs-lp-row-left{
        display:flex;
        align-items:center;
        gap:7px;
        min-width:0;
      }
      .resumen-pro .rs-lp-row-left span{
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      .resumen-pro .rs-lp-row strong{
        color:#23384B;
        font-size:10.5px;
      }
      .resumen-pro .rs-lp-dot{
        flex:0 0 auto;
        width:7px;height:7px;border-radius:50%;
        background:#2F78B7;
      }
      .resumen-pro .rs-lp-dot-2{background:#4A91C7}
      .resumen-pro .rs-lp-dot-3{background:#6DA8D1}
      .resumen-pro .rs-lp-dot-4{background:#91BFDC}
      .resumen-pro .rs-lp-dot-5{background:#B3D4E7}
      .resumen-pro .rs-lp-empty{
        grid-column:1/-1;
        padding:26px;
        border:1px dashed #D5E0E8;
        border-radius:10px;
        text-align:center;
        color:#74818D;
        font-size:12px;
        background:#FAFCFD;
      }

      .resumen-pro .rs-date-control{
        display:flex;
        align-items:center;
        gap:9px;
        min-height:42px;
        padding:6px 11px;
        border:1px solid #DCE5EC;
        border-radius:10px;
        background:#fff;
        box-shadow:0 2px 8px rgba(35,57,77,.05);
        color:var(--rs-ink);
      }
      .resumen-pro .rs-date-control small{
        display:block;
        font-size:9px;
        line-height:1;
        text-transform:uppercase;
        letter-spacing:.09em;
        color:var(--rs-soft);
        margin-bottom:2px;
      }
      .resumen-pro .rs-date-control input{
        border:0;
        outline:0;
        background:transparent;
        font:inherit;
        font-size:12px;
        font-weight:600;
        color:var(--rs-ink);
        padding:0;
        cursor:pointer;
      }
      .resumen-pro .rs-date-icon{
        display:grid;
        place-items:center;
        width:28px;
        height:28px;
        border-radius:8px;
        background:#EAF4FF;
        color:#1769C2;
        font-size:14px;
      }

      .resumen-pro .rs-seg{
        display:inline-flex;
        background:#EEF2F5;
        border-radius:10px;
        padding:3px;
        gap:2px;
      }

      .resumen-pro .rs-seg button{
        border:0;
        background:transparent;
        padding:6px 14px;
        border-radius:8px;
        font:inherit;
        font-size:12.5px;
        font-weight:500;
        color:var(--rs-soft);
        cursor:pointer;
        transition:all .15s;
      }

      .resumen-pro .rs-seg button:hover{
        color:var(--rs-ink);
      }

      .resumen-pro .rs-seg button.active{
        background:#fff;
        color:var(--rs-ink);
        box-shadow:0 1px 3px rgba(40,60,80,.14);
      }

      .resumen-pro .rs-mes-select{
        border:1px solid var(--rs-line);
        border-radius:8px;
        padding:6px 10px;
        font:inherit;
        font-size:12.5px;
        color:var(--rs-ink);
        background:#fff;
        cursor:pointer;
      }

      .resumen-pro .rs-export{
        background:#5E84A6;
        border:1px solid #5E84A6;
        color:#fff;
        border-radius:8px;
        padding:7px 14px;
        font:inherit;
        font-size:12.5px;
        font-weight:500;
        cursor:pointer;
        transition:background .15s;
      }

      .resumen-pro .rs-export:hover{
        background:#4F7396;
      }

      /* ---------- Tarjetas KPI ---------- */

      .resumen-pro .rs-kpis{
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
        gap:14px;
      }

      .resumen-pro .rs-kpi{
        --rs-accent:#C9D3DA;
        position:relative;
        overflow:hidden;
        background:#fff;
        border:1px solid var(--rs-line);
        border-radius:14px;
        padding:16px 18px 14px 22px;
        box-shadow:0 1px 2px rgba(40,60,80,.05);
      }

      .resumen-pro .rs-kpi::before{
        content:"";
        position:absolute;
        left:0; top:0; bottom:0;
        width:5px;
        background:var(--rs-accent);
      }

      .resumen-pro .rs-kpi.rs-good{ --rs-accent:#88BDA0; }
      .resumen-pro .rs-kpi.rs-warn{ --rs-accent:#EBC98E; }
      .resumen-pro .rs-kpi.rs-bad{ --rs-accent:#DE9C8E; }
      .resumen-pro .rs-kpi.rs-neutral{ --rs-accent:#9DB9CF; }

      .resumen-pro .rs-kpi-label{
        font-size:11.5px;
        text-transform:uppercase;
        letter-spacing:.09em;
        color:var(--rs-soft);
        font-weight:600;
      }

      .resumen-pro .rs-kpi-value{
        font-size:32px;
        font-weight:600;
        color:var(--rs-ink);
        margin:6px 0 12px;
        letter-spacing:-.02em;
        line-height:1.1;
        font-variant-numeric:tabular-nums;
      }

      .resumen-pro .rs-bar{
        position:relative;
        height:6px;
        background:#EDF1F4;
        border-radius:99px;
        margin:0 0 12px;
      }

      .resumen-pro .rs-bar > span{
        position:absolute;
        left:0; top:0; bottom:0;
        border-radius:99px;
        background:var(--rs-accent);
      }

      .resumen-pro .rs-bar > i{
        position:absolute;
        top:-3px; bottom:-3px;
        width:2px;
        background:#6B7784;
        border-radius:2px;
        opacity:.5;
      }

      .resumen-pro .rs-spark,
      .resumen-pro .rs-spark-vacio{
        display:block;
        height:30px;
        margin:-8px 0 8px;
      }

      .resumen-pro .rs-kpi-foot{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:8px;
        font-size:11.5px;
        color:var(--rs-soft);
      }

      .resumen-pro .rs-pill{
        padding:2px 10px;
        border-radius:99px;
        font-weight:600;
        font-size:11px;
        background:#EEF2F5;
        color:#5B6673;
      }

      .resumen-pro .rs-good .rs-pill{ background:#E6F3EC; color:#3F7A5C; }
      .resumen-pro .rs-warn .rs-pill{ background:#FBF1DC; color:#8A6A22; }
      .resumen-pro .rs-bad  .rs-pill{ background:#FAE6E1; color:#A5503F; }

      /* ---------- Secciones y gráficos ---------- */

      .resumen-pro .chart-grid{
        display:grid;
        grid-template-columns:repeat(12,minmax(0,1fr));
        gap:16px;
        margin-top:10px;
      }

      .resumen-pro .rs-section{
        grid-column:1 / -1;
        display:flex;
        align-items:center;
        gap:12px;
        margin-top:14px;
        font-size:12px;
        letter-spacing:.12em;
        text-transform:uppercase;
        font-weight:600;
        color:var(--rs-soft);
      }

      .resumen-pro .rs-section::after{
        content:"";
        flex:1;
        height:1px;
        background:var(--rs-line);
      }

      .resumen-pro .chart-box{
        grid-column:span 6;
        min-width:0;
        background:#fff;
        border:1px solid var(--rs-line);
        border-radius:14px;
        padding:18px 20px 16px;
        box-shadow:0 1px 2px rgba(40,60,80,.05);
      }

      .resumen-pro .chart-box.rs-w12{ grid-column:span 12; }
      .resumen-pro .chart-box.rs-w7{ grid-column:span 7; }
      .resumen-pro .chart-box.rs-w5{ grid-column:span 5; }

      .resumen-pro .chart-box h4{
        margin:0 0 4px;
        font-size:15px;
        font-weight:600;
        color:var(--rs-ink);
      }

      .resumen-pro .chart-box .chart-desc{
        font-size:12px;
        color:var(--rs-soft);
        margin:0 0 14px;
        line-height:1.5;
      }

      .resumen-pro .rs-canvas{
        position:relative;
        height:290px;
      }

      .resumen-pro .rs-canvas.tall{
        height:350px;
      }

      .resumen-pro .rs-legend{
        display:flex;
        gap:16px;
        flex-wrap:wrap;
        font-size:11.5px;
        color:var(--rs-soft);
        margin:0 0 10px;
      }

      .resumen-pro .rs-legend b{
        display:inline-block;
        width:9px;
        height:9px;
        border-radius:3px;
        margin-right:6px;
        vertical-align:-1px;
      }

      .resumen-pro .chart-insight{
        margin-top:14px;
        padding:10px 12px;
        background:#F6F9FB;
        border:1px solid #E9EFF3;
        border-left:3px solid #9DB9CF;
        border-radius:8px;
        font-size:12.5px;
        line-height:1.6;
        color:#46525E;
        display:flex;
        gap:10px;
        align-items:flex-start;
      }

      .resumen-pro .chart-insight strong{
        color:var(--rs-ink);
      }

      .resumen-pro .chart-insight-icono{
        flex:0 0 auto;
        width:18px;
        height:18px;
        margin-top:1px;
        border-radius:50%;
        background:#DCE8F1;
        color:#4F7396;
        font-size:11px;
        font-weight:700;
        font-style:italic;
        font-family:Georgia,serif;
        display:flex;
        align-items:center;
        justify-content:center;
      }

      /* ---------- Tabla de marcas ---------- */

      .resumen-pro .rs-panel{
        margin-top:16px;
        background:#fff;
        border:1px solid var(--rs-line);
        border-radius:14px;
        box-shadow:0 1px 2px rgba(40,60,80,.05);
        overflow:hidden;
      }

      .resumen-pro .rs-panel-head{
        padding:18px 20px 12px;
      }

      .resumen-pro .rs-panel-head h3{
        margin:0;
        font-size:15px;
        font-weight:600;
        color:var(--rs-ink);
      }

      .resumen-pro .rs-panel-head .chart-desc{
        margin:4px 0 0;
      }

      .resumen-pro .rs-table-wrap{
        overflow-x:auto;
      }

      .resumen-pro .rs-table{
        width:100%;
        border-collapse:collapse;
      }

      .resumen-pro .rs-table th{
        text-align:left;
        font-size:11px;
        text-transform:uppercase;
        letter-spacing:.09em;
        color:var(--rs-soft);
        font-weight:600;
        padding:10px 20px;
        background:#F8FAFB;
        border-top:1px solid var(--rs-line);
        border-bottom:1px solid var(--rs-line);
        white-space:nowrap;
      }

      .resumen-pro .rs-table td{
        padding:11px 20px;
        border-bottom:1px solid #F0F3F5;
        font-size:13px;
        color:var(--rs-ink);
      }

      .resumen-pro .rs-table tbody tr:last-child td{
        border-bottom:0;
      }

      .resumen-pro .rs-table tbody tr:hover{
        background:#FAFCFD;
      }

      .resumen-pro .rs-table .rs-num{
        text-align:right;
        font-variant-numeric:tabular-nums;
      }

      .resumen-pro .rs-rank{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        width:26px;
        height:26px;
        border-radius:8px;
        background:#EEF2F5;
        color:#5B6673;
        font-size:12px;
        font-weight:600;
      }

      .resumen-pro .rs-share{
        display:flex;
        align-items:center;
        gap:10px;
        min-width:170px;
      }

      .resumen-pro .rs-share-bar{
        flex:1;
        height:6px;
        background:#EDF1F4;
        border-radius:99px;
        overflow:hidden;
      }

      .resumen-pro .rs-share-bar span{
        display:block;
        height:100%;
        background:#9DB9CF;
        border-radius:99px;
      }

      .resumen-pro .rs-share-pct{
        width:48px;
        text-align:right;
        font-variant-numeric:tabular-nums;
        font-weight:600;
      }

      @media (max-width:900px){

        .resumen-pro .chart-box,
        .resumen-pro .chart-box.rs-w12,
        .resumen-pro .chart-box.rs-w7,
        .resumen-pro .chart-box.rs-w5{
          grid-column:1 / -1;
        }

      }

    
      @media(max-width:700px){
        .resumen-pro .rs-actions{width:100%;align-items:stretch}
        .resumen-pro .rs-seg{width:100%;overflow-x:auto}
        .resumen-pro .rs-seg button{flex:1;white-space:nowrap;padding:7px 10px}
        .resumen-pro .rs-date-control{width:100%}
        .resumen-pro .kpi-prod-grid{grid-template-columns:1fr 1fr}
        .resumen-pro .rs-linea-presentacion{padding:13px}
        .resumen-pro .rs-lp-grid{grid-template-columns:1fr}
        .resumen-pro .rs-lp-titlebar h3{font-size:16px}
      }
</style>


    <div class="resumen-pro">

      <div class="rs-head">

        <div>

          <div class="rs-eyebrow">
            Vista gerencial
          </div>

          <h2>
            Resumen general
          </h2>

          <div class="sub">
            Todas las líneas · ${rangoLabel}
          </div>

        </div>


        <div class="rs-actions">

          <div class="rs-seg">

            ${
              [
                {v:1, t:'Diario'},
                {v:7, t:'7 días'},
                {v:30, t:'30 días'},
                {v:90, t:'90 días'},
                {v:null, t:'Todo'}
              ].map(op => `

                <button
                  type="button"
                  class="${resumenRangoDias === op.v ? 'active' : ''}"
                  onclick="cambiarRangoResumen(${op.v})"
                >
                  ${op.t}
                </button>

              `).join('')
            }

          </div>

          ${
            resumenRangoDias === 1
              ? `
                <label class="rs-date-control" title="Seleccionar día del resumen">
                  <span class="rs-date-icon">▣</span>
                  <span>
                    <small>Fecha</small>
                    <input
                      type="date"
                      value="${resumenFechaDiaria || fechaHoyResumen()}"
                      onchange="cambiarFechaDiariaResumen(this.value)"
                    >
                  </span>
                </label>
              `
              : ''
          }

          ${
            tienePermiso('exportarExcelGeneral')
              ? `
                <button
                  type="button"
                  id="btn-exportar-general"
                  class="rs-export"
                  onclick="exportarExcelGeneral(this)"
                >
                  Exportar Excel general
                </button>
              `
              : ''
          }

        </div>

      </div>


      <div id="resumen-anclaje"></div>


      <div class="rs-panel" id="panel-presentacion-marca">

        <div class="rs-panel-head">

          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">

            <h3>Producción por presentación y marca</h3>

            <div id="presentacion-marca-controles" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;"></div>

          </div>

          <div class="chart-desc" id="presentacion-marca-desc"></div>

        </div>

        <div style="padding:0 20px 6px;">
          <div class="rs-canvas tall"><canvas id="chart-presentacion-marca"></canvas></div>
        </div>

        ${renderProduccionLineaPresentacionResumen(records)}

      <div
          class="rs-table-wrap"
          id="resumen-presentacion-marca"
        ></div>

        <div
          style="padding:4px 20px 18px;"
          id="insight-presentacion-marca"
        ></div>

      </div>


      <div class="chart-grid">

        <div class="rs-section">Producción</div>

        <div class="chart-box rs-w12">

          <h4>Tendencia de producción por presentación</h4>

          <div class="chart-desc">
            Unidades efectivas producidas cada día en ${rangoLabel},
            apiladas por presentación — muestra el volumen diario
            y qué formatos lo componen.
          </div>

          <div class="rs-canvas "><canvas id="chart-prod-dia"></canvas></div>

          <div id="insight-prod-dia"></div>

        </div>


        <div class="chart-box rs-w5">

          <h4>Producción por turno</h4>

          <div class="chart-desc">
            Total de unidades efectivas por turno (Día, Intermedio,
            Noche) en ${rangoLabel}.
          </div>

          <div class="rs-canvas "><canvas id="chart-prod-turno"></canvas></div>

          <div id="insight-prod-turno"></div>

        </div>


        


        <div class="rs-section">Eficiencia (OEE)</div>

        <div class="chart-box rs-w12">

          <h4>Tendencia de OEE de planta</h4>

          <div class="chart-desc">
            Evolución del OEE combinado de todas las líneas
            visibles, día por día, en ${rangoLabel}, contra la
            meta de planta (${pct(METAS.oee)}).
          </div>

          <div class="rs-canvas "><canvas id="chart-tendencia-oee"></canvas></div>

          <div id="insight-tendencia-oee"></div>

        </div>


        <div class="chart-box">

          <h4>OEE por línea</h4>

          <div class="chart-desc">
            Eficiencia global de cada línea en ${rangoLabel},
            comparada contra la meta de planta (${pct(METAS.oee)}).
          </div>

          <div class="rs-legend">
            <span><b style="background:${PAL_R.verde}"></b>En meta</span>
            <span><b style="background:${PAL_R.ambar}"></b>Cerca de la meta</span>
            <span><b style="background:${PAL_R.rojo}"></b>Bajo la meta</span>
          </div>

          <div class="rs-canvas "><canvas id="chart-oee-linea"></canvas></div>

          <div id="insight-oee-linea"></div>

        </div>


        <div class="chart-box">

          <h4>Disponibilidad, rendimiento y calidad por línea</h4>

          <div class="chart-desc">
            Los tres componentes que multiplicados dan el OEE de
            cada línea — ayuda a identificar de dónde vienen las
            pérdidas en ${rangoLabel}.
          </div>

          <div class="rs-canvas "><canvas id="chart-componentes-oee"></canvas></div>

          <div id="insight-componentes-oee"></div>

        </div>


        <div class="rs-section">Pérdidas y paradas</div>

        


        

      </div>


      <div class="rs-panel">

        <div class="rs-panel-head">

          <h3>Producción por marca</h3>

          <div class="chart-desc">
            Total de unidades efectivas por marca en ${rangoLabel}.
          </div>

        </div>

        <div
          class="rs-table-wrap"
          id="resumen-marcas"
        ></div>

        <div
          style="padding:4px 20px 18px;"
          id="insight-marcas"
        ></div>

      </div>

      <div class="rs-section" style="margin-top:18px">Tarjetas anteriores (mismos valores que la cabecera de arriba)</div>

      <div
        class="rs-kpis"
        id="resumen-kpis"
      ></div>

    </div>

  `;

  renderResumenIndustrial(records, rangoLabel);


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

    ['prod-dia','prod-turno','oee-linea','prod-linea','tendencia-oee','componentes-oee','merma-linea','paradas-planta','marcas'].forEach(
      id => {
        const box = document.getElementById('insight-' + id);
        if(box){
          box.innerHTML =
            cajaInsight('No hay registros en ' + rangoLabel + '.');
        }
      }
    );

    destroyCharts();

    /*
       El panel de presentación/marca se maneja aparte: si
       está en modo 'mes' o 'anio' puede tener datos aunque
       el rango de 7/30/90 días de arriba esté vacío (usa
       TODO el historial visible, no el rango).
    */
    renderPanelPresentacionMarca(todos, records, rangoLabel);

    return;

  }


  /* =====================================================
     KPIs
  ===================================================== */

  const kpis = calcularKPIsPlanta(records);

  const serieProdDia =
    sumarProduccionPorDia(records);

  const promedioDiario =
    serieProdDia.length
      ? kpis.efectivaTotal / serieProdDia.length
      : 0;

  document.getElementById('resumen-kpis').innerHTML =

    tarjetaKpiResumen({
      label:'OEE de planta',
      valor:kpis.oee == null ? '—' : pct(kpis.oee),
      clase:kpis.oee == null ? '' : claseSegunMeta(kpis.oee, METAS.oee),
      barra:{ pct:kpis.oee || 0, meta:METAS.oee },
      pie:(kpis.oee == null ? 'Falta velocidad estándar' : 'Meta ' + pct(METAS.oee)) + ' · Calidad: no se mide'
    }) +

    tarjetaKpiResumen({
      label:'Disponibilidad',
      valor:pct(kpis.disponibilidad),
      clase:claseSegunMeta(kpis.disponibilidad, METAS.disponibilidad),
      barra:{ pct:kpis.disponibilidad, meta:METAS.disponibilidad },
      pie:'Meta ' + pct(METAS.disponibilidad)
    }) +

    tarjetaProduccionTotalPorLinea(records, kpis.efectivaTotal) +

    tarjetaKpiResumen({
      label:'Merma de planta',
      valor:pct(kpis.mermaPct),
      inverso:true,
      clase:claseSegunMetaInversa(kpis.mermaPct, METAS.merma),
      barra:{ pct:kpis.mermaPct / (METAS.merma * 3), meta:1 / 3 },
      pie:'Meta ≤ ' + pct(METAS.merma)
    });


  Chart.defaults.font = { family:'IBM Plex Sans', size:12 };
  Chart.defaults.color = PAL_R.texto;


  destroyCharts();


  /* =====================================================
     PRODUCCIÓN POR PRESENTACIÓN Y MARCA (SIEMPRE VISIBLE —
     GRÁFICO + TABLA — VER renderPanelPresentacionMarca)
  ===================================================== */

  renderPanelPresentacionMarca(todos, records, rangoLabel);


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

          maintainAspectRatio:false,


          plugins:{

            legend:{
              display:true,
              position:'bottom',
              labels:{ boxWidth:9, boxHeight:9, usePointStyle:true, pointStyle:'rectRounded', padding:14, font:{ size:11 } }
            },

            tooltip:{

              ...TOOLTIP_R,


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

              grid:{ color:GRID_R },

              ticks:{
                callback:v => formatearNumero(v)
              }

            }

          }

        }

      }

    );

  document.getElementById('insight-prod-dia').innerHTML =
    cajaInsight(
      generarInsightProdDia(porDiaPresentacion, rangoLabel)
    );


  /* =====================================================
     PRODUCCIÓN POR TURNO
  ===================================================== */

  const porTurno = sumarProduccionPorTurno(records);

  const coloresTurno = {
    'DÍA': PAL_R.ambar,
    'INTERMEDIO': PAL_R.azulSuave,
    'NOCHE': PAL_R.azul
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
                p => coloresTurno[p.turno] || PAL_R.gris
              ),

            borderRadius:6,

            maxBarThickness:60,

            barPercentage:0.5

          }]

        },

        options:{

          maintainAspectRatio:false,


          plugins:{

            legend:{ display:false },

            valorBarraR:{
              activo:true
            },

            tooltip:{

              ...TOOLTIP_R,


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

              grid:{ color:GRID_R },

              ticks:{
                callback:v => formatearNumero(v)
              }

            }

          }

        }

      }

    );

  document.getElementById('insight-prod-turno').innerHTML =
    cajaInsight(
      generarInsightProdTurno(porTurno, rangoLabel)
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
                  ? PAL_R.grisSuave
                  : colorSegunMetaR(x.oee, METAS.oee)
              ),

            borderRadius:6,

            maxBarThickness:60,

            barPercentage:0.55

          }]

        },

        options:{

          maintainAspectRatio:false,


          plugins:{

            legend:{ display:false },

            valorBarraR:{
              activo:true,
              formato:v => (Math.round(v * 10) / 10) + '%'
            },

            metaLine:{
              valor:METAS.oee * 100,
              eje:'y',
              texto:'Meta ' + pct(METAS.oee),
              color:PAL_R.texto
            },

            tooltip:{

              ...TOOLTIP_R,


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

              grid:{ color:GRID_R },

              ticks:{ callback:v => v + '%' }

            }

          }

        }

      }

    );

  document.getElementById('insight-oee-linea').innerHTML =
    cajaInsight(
      generarInsightOEELinea(oeePorLinea, rangoLabel)
    );


  /* =====================================================
     PRODUCCIÓN POR LÍNEA
     El gráfico legacy fue retirado por redundancia con
     Programado vs Producido del bloque industrial.
  ===================================================== */

  const prodPorLinea =
    sumarProduccionPorLinea(records, lineasVisibles);


  /* =====================================================
     TENDENCIA DE OEE DE PLANTA (DÍA A DÍA)
  ===================================================== */

  const serieOeePlanta =
    agruparPorDia(records);

  state.charts.tendenciaOee =

    new Chart(

      document.getElementById('chart-tendencia-oee'),

      {

        type:'line',

        data:{

          labels:
            serieOeePlanta.map(p => p.fecha),

          datasets:[{

            label:'OEE de planta',

            data:
              serieOeePlanta.map(p => p.oee * 100),

            borderColor:PAL_R.azul,

            backgroundColor:'rgba(124,158,189,0.16)',

            fill:true,

            tension:0.3,

            pointRadius:3,

            pointHoverRadius:5,

            pointBackgroundColor:'#fff',

            pointBorderColor:PAL_R.azul,

            pointBorderWidth:2,

            borderWidth:2.5,

            spanGaps:true

          }]

        },

        options:{

          maintainAspectRatio:false,


          plugins:{

            legend:{ display:false },

            metaLine:{
              valor:METAS.oee * 100,
              eje:'y',
              texto:'Meta ' + pct(METAS.oee),
              color:PAL_R.rojo
            },

            tooltip:{

              ...TOOLTIP_R,


              callbacks:{

                label:ctx =>
                  (Math.round(ctx.parsed.y * 10) / 10) + '% OEE'

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

              grid:{ color:GRID_R },

              ticks:{ callback:v => v + '%' }

            }

          }

        }

      }

    );

  document.getElementById('insight-tendencia-oee').innerHTML =
    cajaInsight(
      generarInsightTendenciaOEE(serieOeePlanta, kpis.oee, rangoLabel)
    );


  /* =====================================================
     DISPONIBILIDAD, RENDIMIENTO Y CALIDAD POR LÍNEA
  ===================================================== */

  const componentesOEE =
    calcularComponentesOEEPorLinea(records, lineasVisibles);

  state.charts.componentesOee =

    new Chart(

      document.getElementById('chart-componentes-oee'),

      {

        type:'bar',

        data:{

          labels:
            componentesOEE.map(x => x.linea),

          datasets:[
            {
              label:'Disponibilidad',
              data: componentesOEE.map(x => x.disponibilidad * 100),
              backgroundColor:PAL_R.azul,
              borderRadius:6,
              maxBarThickness:48
            },
            {
              label:'Rendimiento',
              data: componentesOEE.map(x => x.rendimiento * 100),
              backgroundColor:PAL_R.ambar,
              borderRadius:6,
              maxBarThickness:48
            },
            {
              label:'Calidad',
              data: componentesOEE.map(x => x.calidad * 100),
              backgroundColor:PAL_R.verde,
              borderRadius:6,
              maxBarThickness:48
            }
          ]

        },

        options:{

          maintainAspectRatio:false,


          plugins:{

            legend:{
              display:true,
              position:'bottom',
              labels:{ boxWidth:9, boxHeight:9, usePointStyle:true, pointStyle:'rectRounded', padding:14, font:{ size:11 } }
            },

            tooltip:{

              ...TOOLTIP_R,


              callbacks:{

                label:ctx => {

                  const x = componentesOEE[ctx.dataIndex];

                  return x.sinDatos
                    ? 'Sin datos en ' + rangoLabel
                    : ctx.dataset.label + ': ' +
                      (Math.round(ctx.parsed.y * 10) / 10) + '%';

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

              grid:{ color:GRID_R },

              ticks:{ callback:v => v + '%' }

            }

          }

        }

      }

    );

  document.getElementById('insight-componentes-oee').innerHTML =
    cajaInsight(
      generarInsightComponentesOEE(componentesOEE, rangoLabel)
    );


  /* =====================================================
     MERMA POR LÍNEA
     El gráfico legacy fue retirado: el bloque industrial
     conserva una única visualización de merma por línea.
  ===================================================== */

  const mermaPorLinea =
    calcularMermaPorLinea(records, lineasVisibles);


  /* =====================================================
     PARETO DE PARADAS
     Se conserva únicamente el Pareto del bloque industrial.
  ===================================================== */


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

        <table class="rs-table">

          <thead>

            <tr>
              <th style="width:60px;">#</th>
              <th>Marca</th>
              <th>Línea(s)</th>
              <th class="rs-num">Producción efectiva</th>
              <th>% del total</th>
            </tr>

          </thead>

          <tbody>

            ${

              porMarca.map((x, i) => {

                const participacion =
                  totalGeneralMarcas > 0
                    ? x.total / totalGeneralMarcas
                    : 0;

                return `

                  <tr>

                    <td><span class="rs-rank">${i + 1}</span></td>

                    <td><strong>${escaparHtml(x.marca)}</strong></td>

                    <td class="small-muted">${escaparHtml(x.lineas) || '—'}</td>

                    <td class="rs-num">${formatearNumero(x.total)}</td>

                    <td>
                      <div class="rs-share">
                        <div class="rs-share-bar">
                          <span style="width:${(participacion * 100).toFixed(1)}%"></span>
                        </div>
                        <span class="rs-share-pct">${pct(participacion)}</span>
                      </div>
                    </td>

                  </tr>

                `;

              }).join('')

            }

          </tbody>

        </table>

      `;

    }

  }


  const insightMarcasBox =
    document.getElementById('insight-marcas');

  if(insightMarcasBox){

    insightMarcasBox.innerHTML =
      cajaInsight(
        generarInsightMarcas(porMarca, totalGeneralMarcas, rangoLabel)
      );

  }

}
