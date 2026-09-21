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
    let dispXhoras = 0;
    let rendXhoras = 0;
    let calXhoras = 0;

    recs.forEach(r => {

      const d = calcDerived(r);
      const h = num(d.horasEfectivas);

      if(h > 0){

        horas += h;
        dispXhoras += num(d.disponibilidad) * h;
        rendXhoras += num(d.rendimiento) * h;
        calXhoras += num(d.calidad) * h;

      }

    });

    return {

      linea: l.name,
      key: l.key,

      disponibilidad: horas > 0 ? dispXhoras / horas : 0,
      rendimiento: horas > 0 ? rendXhoras / horas : 0,
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
        efectivaTotal > 0
          ? mermaTotal / efectivaTotal
          : 0,

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

      const clave = f.tipo + '||' + f.descripcion;

      if(!acumulado[clave]){

        acumulado[clave] = {
          descripcion: f.descripcion,
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


      <div
        class="rs-kpis"
        id="resumen-kpis"
      ></div>


      <div class="chart-grid">

        <div class="rs-section">Producción</div>

        <div class="chart-box rs-w12">

          <h4>Producción por día, por presentación</h4>

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


        <div class="chart-box rs-w7">

          <h4>Producción por línea</h4>

          <div class="chart-desc">
            Unidades efectivas producidas por cada línea en
            ${rangoLabel} — qué línea aporta más al total de planta.
          </div>

          <div class="rs-canvas "><canvas id="chart-prod-linea"></canvas></div>

          <div id="insight-prod-linea"></div>

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

        <div class="chart-box rs-w5">

          <h4>Merma por línea</h4>

          <div class="chart-desc">
            Merma como % de la producción efectiva de cada línea
            en ${rangoLabel} (meta ≤ ${pct(METAS.merma)}).
          </div>

          <div class="rs-legend">
            <span><b style="background:${PAL_R.verde}"></b>Dentro de meta</span>
            <span><b style="background:${PAL_R.ambar}"></b>Ligero exceso</span>
            <span><b style="background:${PAL_R.rojo}"></b>Sobre la meta</span>
          </div>

          <div class="rs-canvas "><canvas id="chart-merma-linea"></canvas></div>

          <div id="insight-merma-linea"></div>

        </div>


        <div class="chart-box rs-w7">

          <h4>Principales causas de parada (planta)</h4>

          <div class="chart-desc">
            Las causas que más minutos detuvieron la planta en
            ${rangoLabel}, sumando todas las líneas visibles,
            ordenadas de mayor a menor (Pareto).
          </div>

          <div class="rs-legend">
            <span><b style="background:${PAL_R.azul}"></b>Programada</span>
            <span><b style="background:${PAL_R.rojo}"></b>No programada</span>
            <span><b style="background:${PAL_R.ambarLinea}"></b>% acumulado</span>
          </div>

          <div class="rs-canvas tall"><canvas id="chart-paradas-planta"></canvas></div>

          <div id="insight-paradas-planta"></div>

        </div>

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
      valor:pct(kpis.oee),
      clase:claseSegunMeta(kpis.oee, METAS.oee),
      barra:{ pct:kpis.oee, meta:METAS.oee },
      pie:'Meta ' + pct(METAS.oee)
    }) +

    tarjetaKpiResumen({
      label:'Disponibilidad',
      valor:pct(kpis.disponibilidad),
      clase:claseSegunMeta(kpis.disponibilidad, METAS.disponibilidad),
      barra:{ pct:kpis.disponibilidad, meta:METAS.disponibilidad },
      pie:'Meta ' + pct(METAS.disponibilidad)
    }) +

    tarjetaKpiResumen({
      label:'Producción total',
      valor:formatearNumero(kpis.efectivaTotal),
      spark:sparklineResumen(serieProdDia.map(x => x.total)),
      izq:'Unidades efectivas',
      pie:'≈ ' + formatearNumero(promedioDiario) + ' por día'
    }) +

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
  ===================================================== */

  const prodPorLinea =
    sumarProduccionPorLinea(records, lineasVisibles);

  const prodPorLineaOrd =
    [...prodPorLinea].sort((a,b) => b.total - a.total);

  const totalProdLineas =
    prodPorLinea.reduce((a,x) => a + x.total, 0);

  state.charts.prodLinea =

    new Chart(

      document.getElementById('chart-prod-linea'),

      {

        type:'bar',

        data:{

          labels:
            prodPorLineaOrd.map(x => x.linea),

          datasets:[{

            label:'Producción',

            data:
              prodPorLineaOrd.map(x => x.total),

            backgroundColor:PAL_R.azul,

            borderRadius:6,

            maxBarThickness:60,

            barPercentage:0.55

          }]

        },

        options:{

          maintainAspectRatio:false,


          indexAxis:'y',

          layout:{ padding:{ right:64 } },

          plugins:{

            legend:{ display:false },

            valorBarraR:{
              activo:true
            },

            tooltip:{

              ...TOOLTIP_R,


              callbacks:{

                label:ctx =>
                  formatearNumero(ctx.parsed.x) +
                  ' unidades' +
                  (
                    totalProdLineas > 0
                      ? ' · ' + pct(ctx.parsed.x / totalProdLineas)
                      : ''
                  )

              }

            }

          },

          scales:{

            x:{

              beginAtZero:true,

              grid:{ color:GRID_R },

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

  document.getElementById('insight-prod-linea').innerHTML =
    cajaInsight(
      generarInsightProdLinea(prodPorLinea, rangoLabel)
    );


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
  ===================================================== */

  const mermaPorLinea =
    calcularMermaPorLinea(records, lineasVisibles);

  state.charts.mermaLinea =

    new Chart(

      document.getElementById('chart-merma-linea'),

      {

        type:'bar',

        data:{

          labels:
            mermaPorLinea.map(x => x.linea),

          datasets:[{

            label:'Merma',

            data:
              mermaPorLinea.map(x => x.mermaPct * 100),

            backgroundColor:

              mermaPorLinea.map(x =>
                x.sinDatos
                  ? PAL_R.grisSuave
                  : colorSegunMetaInverso(x.mermaPct, METAS.merma)
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
              valor:METAS.merma * 100,
              eje:'y',
              texto:'Meta ≤ ' + pct(METAS.merma),
              color:PAL_R.texto
            },

            tooltip:{

              ...TOOLTIP_R,


              callbacks:{

                label:ctx => {

                  const x = mermaPorLinea[ctx.dataIndex];

                  return x.sinDatos
                    ? 'Sin datos en ' + rangoLabel
                    : (Math.round(x.mermaPct * 1000) / 10) + '%';

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

              grid:{ color:GRID_R },

              ticks:{ callback:v => v + '%' }

            }

          }

        }

      }

    );

  document.getElementById('insight-merma-linea').innerHTML =
    cajaInsight(
      generarInsightMermaLinea(mermaPorLinea, rangoLabel)
    );


  /* =====================================================
     PRINCIPALES CAUSAS DE PARADA (PLANTA, PARETO)
  ===================================================== */

  const paradasPlanta =
    agruparParadasPlanta(records);

  const paretoPlantaFilas =
    paradasPlanta.filas.slice(0, 10);

  const cajaParadasPlanta =
    document.getElementById('chart-paradas-planta')
      ?.closest('.chart-box');

  if(!paretoPlantaFilas.length){

    if(cajaParadasPlanta){

      cajaParadasPlanta.querySelector('canvas').style.display = 'none';

    }

  } else {

    state.charts.paradasPlanta =

      new Chart(

        document.getElementById('chart-paradas-planta'),

        {

          data:{

            labels:
              paretoPlantaFilas.map(f => f.descripcion),

            datasets:[
              {
                type:'bar',
                label:'Minutos perdidos',
                data:
                  paretoPlantaFilas.map(f => f.minutos),
                backgroundColor:
                  paretoPlantaFilas.map(
                    f =>
                      f.tipo === 'Programada'
                        ? PAL_R.azul
                        : PAL_R.rojo
                  ),
                borderRadius:6,

            maxBarThickness:60,
                order:2
              },
              {
                type:'line',
                label:'% acumulado',
                data:
                  paretoPlantaFilas.map(f => f.acumuladoPct),
                yAxisID:'y2',
                borderColor:PAL_R.ambarLinea,
                backgroundColor:PAL_R.ambarLinea,
                borderWidth:2,
                pointRadius:3,
                pointBackgroundColor:'#fff',
                pointBorderWidth:2,
                tension:0.2,
                order:1
              }
            ]

          },

          options:{

          maintainAspectRatio:false,


            plugins:{

              legend:{ display:false },

              metaLine:{
                valor:80,
                eje:'y2',
                texto:'80%',
                color:PAL_R.texto
              },

              tooltip:{

              ...TOOLTIP_R,


                callbacks:{

                  label:ctx => {

                    if(ctx.dataset.yAxisID === 'y2'){

                      return 'Acumulado: ' +
                        Math.round(ctx.parsed.y) + '%';

                    }

                    const fila = paretoPlantaFilas[ctx.dataIndex];

                    return fila.tipo + ': ' +
                      formatearNumero(fila.minutos) + ' min';

                  }

                }

              }

            },

            scales:{

              x:{

                grid:{ display:false },

                ticks:{

                  maxRotation:38,
                  minRotation:0,
                  autoSkip:false,
                  font:{ size:10 },

                  callback:function(v){

                    const t = this.getLabelForValue(v);

                    return t.length > 18
                      ? t.slice(0,17) + '…'
                      : t;

                  }

                }

              },

              y:{

                beginAtZero:true,

                grid:{ color:GRID_R },

                title:{ display:true, text:'Minutos' }

              },

              y2:{

                position:'right',

                beginAtZero:true,

                max:100,

                grid:{ display:false },

                ticks:{ callback:v => v + '%' }

              }

            }

          }

        }

      );

  }

  document.getElementById('insight-paradas-planta').innerHTML =
    cajaInsight(
      generarInsightParadasPlanta(paradasPlanta, rangoLabel)
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