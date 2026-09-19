/* =============================================================
   GRÁFICOS Y REPORTES VISUALES
   Parte del sistema GLACIAL — dividido a partir de app.js
   ============================================================= */


/* =========================================================
   METAS DE PLANTA
   =========================================================

   Referencias contra las que se comparan los indicadores en
   todos los gráficos. Cambia estos valores si la jefatura
   define otras metas — se actualizan solos en el tablero.
   ========================================================= */

const METAS = {
  oee: 0.85,
  disponibilidad: 0.90,
  rendimiento: 0.95,
  calidad: 0.99,

  /* % máximo de merma aceptable sobre producción efectiva */
  merma: 0.02
};


/* =========================================================
   PALETA ÚNICA DEL TABLERO
   ========================================================= */

const PAL = {
  azul:    '#2F6690',
  azulSuave:'#7FA5BF',
  ambar:   '#F2A93B',
  verde:   '#3F8F5F',
  rojo:    '#C4472B',
  gris:    '#B7C4CC',
  grisSuave:'#E8EAE4',
  texto:   '#3A4551'
};


/*
   Color semáforo según qué tan cerca está un valor (0-1)
   de su meta.
*/

function colorSegunMeta(valor, meta){

  if(valor >= meta){
    return PAL.verde;
  }

  if(valor >= meta * 0.85){
    return PAL.ambar;
  }

  return PAL.rojo;

}


function formatearNumero(v){

  return Math.round(num(v)).toLocaleString('es-PE');

}


/* =========================================================
   PLUGIN: LÍNEA DE META SOBRE UN GRÁFICO
   =========================================================

   Dibuja una línea punteada horizontal en el valor indicado
   y una etiqueta ("Meta 85%") en el extremo derecho.

   Se usa con: options.plugins.metaLine = { valor, texto }
   ========================================================= */

const metaLinePlugin = {

  id:'metaLine',

  afterDatasetsDraw(chart, args, opts){

    if(!opts || opts.valor === undefined || opts.valor === null){
      return;
    }

    const yScale =
      chart.scales[opts.eje || 'y'];

    if(!yScale){
      return;
    }

    const y = yScale.getPixelForValue(opts.valor);

    if(!isFinite(y)){
      return;
    }

    const { ctx, chartArea } = chart;

    ctx.save();

    ctx.beginPath();
    ctx.setLineDash([6,4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = opts.color || PAL.rojo;
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.stroke();

    if(opts.texto){

      ctx.setLineDash([]);
      ctx.font = '600 11px "IBM Plex Sans", sans-serif';
      ctx.fillStyle = opts.color || PAL.rojo;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';

      ctx.fillText(
        opts.texto,
        chartArea.right - 4,
        y - 3
      );

    }

    ctx.restore();

  }

};


/* =========================================================
   PLUGIN: VALOR SOBRE CADA BARRA
   ========================================================= */

const valorBarraPlugin = {

  id:'valorBarra',

  afterDatasetsDraw(chart, args, opts){

    if(!opts || !opts.activo){
      return;
    }

    const ctx = chart.ctx;

    ctx.save();

    ctx.font = '600 11px "IBM Plex Sans", sans-serif';
    ctx.fillStyle = opts.color || PAL.texto;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

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

        ctx.fillText(
          valor,
          barra.x,
          barra.y - 4
        );

      });

    });

    ctx.restore();

  }

};


Chart.register(metaLinePlugin, valorBarraPlugin);


/* =========================================================
   CASCADA DE PÉRDIDAS DE OEE (WATERFALL)
   =========================================================

   Descompone cuánta producción se perdió y por qué,
   partiendo de la capacidad teórica del turno completo:

     Capacidad teórica  = ratio nominal × horas de turno
     − Pérdida por paradas      (disponibilidad)
     − Pérdida por ritmo lento  (rendimiento)
     − Pérdida por calidad      (calidad)
     = Producción buena         (capacidad × OEE)

   Los cuatro pasos suman exactamente la diferencia entre
   la capacidad teórica y la producción buena, así que la
   cascada siempre cierra.
   ========================================================= */

function calcCascada(rec){

  const d = calcDerived(rec);

  /*
     Capacidad teórica: si el registro tiene cuadros, se
     suma cuadro por cuadro (cada uno puede tener su propio
     ratio y sus propias horas). Si es un registro antiguo,
     se usa el ratio y las horas del registro.
  */

  let capacidadTeorica = 0;

  if(Array.isArray(rec?.cuadros) && rec.cuadros.length){

    rec.cuadros.forEach(c => {

      capacidadTeorica +=
        num(c?.ratioNominal) * num(c?.horasTurno);

    });

  } else {

    capacidadTeorica =
      num(rec?.ratioNominal) * num(rec?.horasTurno);

  }


  /*
     Los tres escalones se derivan de los MISMOS factores
     que producen el OEE del tablero (D, R y C ya acotados
     a 100%), encadenados uno tras otro:

       tras paradas      = Capacidad × D
       tras ritmo        = Capacidad × D × R
       producción buena  = Capacidad × D × R × C = Capacidad × OEE

     Así la cascada siempre cierra exactamente contra el OEE
     mostrado, incluso cuando la producción efectiva supera
     a la nominal (rendimiento tope 100%).
  */

  const D = num(d.disponibilidad);
  const R = num(d.rendimiento);
  const C = num(d.calidad);

  const trasParadas = capacidadTeorica * D;
  const trasRitmo = trasParadas * R;
  const buena = trasRitmo * C;

  const perdidaDisponibilidad =
    Math.max(capacidadTeorica - trasParadas, 0);

  const perdidaRendimiento =
    Math.max(trasParadas - trasRitmo, 0);

  const perdidaCalidad =
    Math.max(trasRitmo - buena, 0);

  return {
    capacidadTeorica,
    perdidaDisponibilidad,
    perdidaRendimiento,
    perdidaCalidad,
    buena,
    oee: num(d.oee)
  };

}


/* =========================================================
   PARADAS AGRUPADAS POR CAUSA (PARA EL PARETO)
   =========================================================

   Junta las paradas de TODOS los cuadros del registro (no
   solo el primero), las agrupa por descripción y las ordena
   de mayor a menor tiempo perdido.
   ========================================================= */

function agruparParadas(rec){

  const acumulado = {};

  const sumar = (lista, tipo) => {

    (lista || []).forEach(p => {

      const min = num(p?.tiempoMin);

      const desc =
        String(p?.descripcion || '').trim() ||
        'Sin descripción';

      if(min <= 0){
        return;
      }

      const clave = tipo + '||' + desc;

      if(!acumulado[clave]){

        acumulado[clave] = {
          descripcion: desc,
          tipo,
          minutos: 0
        };

      }

      acumulado[clave].minutos += min;

    });

  };


  if(Array.isArray(rec?.cuadros) && rec.cuadros.length){

    rec.cuadros.forEach(c => {

      sumar(c?.paradasProgramadas, 'Programada');
      sumar(c?.paradasNoProgramadas, 'No programada');

    });

  } else {

    sumar(rec?.paradasProgramadas, 'Programada');
    sumar(rec?.paradasNoProgramadas, 'No programada');

  }


  const filas =
    Object.values(acumulado)
      .sort((a,b) => b.minutos - a.minutos);


  const total =
    filas.reduce((a,f) => a + f.minutos, 0);


  /* Porcentaje acumulado (la curva del Pareto). */

  let corrido = 0;

  filas.forEach(f => {

    corrido += f.minutos;

    f.acumuladoPct =
      total > 0
        ? (corrido / total) * 100
        : 0;

  });


  return { filas, total };

}


/* =========================================================
   RANGO DE LA TENDENCIA (7 / 30 / 90 DÍAS)
   ========================================================= */

let tendenciaRangoDias = 30;

function cambiarRangoTendencia(dias){

  tendenciaRangoDias = dias;

  renderGraficosTab();

}


/* =========================================================
   MERMAS AGRUPADAS (TODOS LOS CUADROS, EN % DE PRODUCCIÓN)
   ========================================================= */

function agruparMermas(rec){

  const acumulado = {};

  const sumarLista = lista => {

    (lista || []).forEach(m => {

      const item =
        String(m?.item || '').trim();

      if(!item){
        return;
      }

      if(!acumulado[item]){

        acumulado[item] = {
          item,
          unidades: 0,
          peso: 0
        };

      }

      acumulado[item].unidades += num(m?.unidades);
      acumulado[item].peso += num(m?.peso);

    });

  };


  if(Array.isArray(rec?.cuadros) && rec.cuadros.length){

    rec.cuadros.forEach(c => sumarLista(c?.mermas));

  } else {

    sumarLista(rec?.mermas);

  }


  const filas =
    Object.values(acumulado)
      .sort((a,b) => b.unidades - a.unidades);

  const totalUnidades =
    filas.reduce((a,f) => a + f.unidades, 0);


  return { filas, totalUnidades };

}


/* =========================================================
   INSUMOS AGRUPADOS (SUMA DE LOS 4 CUADROS)
   ========================================================= */

function agruparInsumos(rec){

  const total = {
    cajasPreformas: 0,
    planchasCarton: 0,
    polietilenoKg: 0,
    stretchFilmKg: 0,
    cartonReciclado: 0,
    cartonRealUtilizado: 0
  };


  if(Array.isArray(rec?.cuadros) && rec.cuadros.length){

    rec.cuadros.forEach(c => {

      total.cajasPreformas += num(c?.insumos?.cajasPreformas);
      total.planchasCarton += num(c?.insumos?.planchasCarton);
      total.polietilenoKg += num(c?.insumos?.polietilenoKg);
      total.stretchFilmKg += num(c?.insumos?.stretchFilmKg);
      total.cartonReciclado += num(c?.insumos?.cartonReciclado);
      total.cartonRealUtilizado += num(c?.insumos?.cartonRealUtilizado);

    });

  } else {

    total.cajasPreformas = num(rec?.insumos?.cajasPreformas);
    total.planchasCarton = num(rec?.insumos?.planchasCarton);
    total.polietilenoKg = num(rec?.insumos?.polietilenoKg);
    total.stretchFilmKg = num(rec?.insumos?.stretchFilmKg);
    total.cartonReciclado = num(rec?.insumos?.cartonReciclado);
    total.cartonRealUtilizado = num(rec?.insumos?.cartonRealUtilizado);

  }


  return total;

}


/* =========================================================
   SERIE DIARIA (UN PUNTO POR DÍA, PONDERADO POR HORAS)
   =========================================================

   Si un día tiene más de un registro (turno día + turno
   noche, por ejemplo), el OEE de ese día se calcula
   ponderado por las horas efectivas de cada registro — un
   turno completo pesa más que uno corto — en vez de un
   promedio simple que trataría a ambos por igual.
   ========================================================= */

function agruparPorDia(all){

  const acumulado = {};

  all.forEach(r => {

    const fecha = r?.fecha;

    if(!fecha){
      return;
    }

    const d = calcDerived(r);

    const horas = num(d.horasEfectivas);

    const efectiva =
      num(d.efectiva ?? r.produccion?.efectiva);


    if(!acumulado[fecha]){

      acumulado[fecha] = {
        fecha,
        horas: 0,
        oeeXhoras: 0,
        efectiva: 0
      };

    }

    acumulado[fecha].horas += horas;
    acumulado[fecha].oeeXhoras += d.oee * horas;
    acumulado[fecha].efectiva += efectiva;

  });


  return Object.values(acumulado)

    .map(x => ({

      fecha: x.fecha,

      oee:
        x.horas > 0
          ? x.oeeXhoras / x.horas
          : 0,

      efectiva: x.efectiva,

      horas: x.horas

    }))

    .sort(
      (a,b) => a.fecha.localeCompare(b.fecha)
    );

}


/*
   Promedio móvil de "ventanaDias" días CALENDARIO (no de
   "ventanaDias" puntos), ponderado por horas efectivas.
   Si un día no tiene datos, simplemente no aporta al
   promedio de esa ventana — no se inventan ceros.
*/

function calcularPromedioMovil(serieDiaria, ventanaDias){

  return serieDiaria.map(punto => {

    const fin = new Date(punto.fecha + 'T00:00:00');
    const ini = new Date(fin);

    ini.setDate(ini.getDate() - (ventanaDias - 1));


    let horas = 0;
    let oeeXhoras = 0;

    serieDiaria.forEach(p => {

      const f = new Date(p.fecha + 'T00:00:00');

      if(f >= ini && f <= fin){

        horas += p.horas;
        oeeXhoras += p.oee * p.horas;

      }

    });


    return horas > 0
      ? oeeXhoras / horas
      : null;

  });

}


/* =========================================================
   OEE POR TURNO Y POR MARCA (TODO EL HISTORIAL DE LA LÍNEA)
   =========================================================

   A diferencia de los gráficos de arriba (que muestran un
   registro puntual), estos comparan el desempeño acumulado
   — útil para ver si el problema es un turno específico o
   una marca/presentación específica, algo que no se ve
   revisando registros uno por uno.
   ========================================================= */

function agruparOEEPorTurno(all){

  const acumulado = {};

  all.forEach(r => {

    const d = calcDerived(r);
    const horas = num(d.horasEfectivas);

    if(horas <= 0){
      return;
    }

    const turno = r.turno || 'Sin turno';

    if(!acumulado[turno]){

      acumulado[turno] = {
        turno,
        horas: 0,
        oeeXhoras: 0
      };

    }

    acumulado[turno].horas += horas;
    acumulado[turno].oeeXhoras += d.oee * horas;

  });


  return Object.values(acumulado)

    .map(x => ({
      etiqueta: x.turno,
      oee: x.horas > 0 ? x.oeeXhoras / x.horas : 0,
      horas: x.horas
    }))

    .sort((a,b) => b.oee - a.oee);

}


function agruparOEEPorMarca(all){

  const acumulado = {};

  const agregar = (marca, horas, oee) => {

    const clave = (marca || '').trim();

    if(!clave || horas <= 0){
      return;
    }

    if(!acumulado[clave]){

      acumulado[clave] = {
        marca: clave,
        horas: 0,
        oeeXhoras: 0
      };

    }

    acumulado[clave].horas += horas;
    acumulado[clave].oeeXhoras += oee * horas;

  };


  all.forEach(r => {

    if(Array.isArray(r.cuadros) && r.cuadros.length){

      r.cuadros.forEach(c => {

        const dc = calcDerivedCuadro(c);

        agregar(c?.marca, dc.horasEfectivas, dc.oee);

      });

    } else {

      const dl = calcDerivedLegacy(r);

      agregar(r.marca, dl.horasEfectivas, dl.oee);

    }

  });


  return Object.values(acumulado)

    .map(x => ({
      etiqueta: x.marca,
      oee: x.horas > 0 ? x.oeeXhoras / x.horas : 0,
      horas: x.horas
    }))

    .sort((a,b) => b.oee - a.oee);

}


/* =========================================================
   GRÁFICOS
   ========================================================= */

function destroyCharts(){

  Object.values(
    state.charts
  ).forEach(

    ch => {

      if(ch){

        ch.destroy();

      }

    }

  );


  state.charts = {};

}


/* =========================================================
   EXPORTACIÓN — EXCEL Y PNG
   Se ejecuta directamente desde la aplicación.
   Excel: usa SheetJS bajo demanda.
   PNG: genera un dashboard completo a partir de los gráficos
   actuales de Chart.js, sin capturar la pantalla del navegador.
   ========================================================= */

function cargarScriptExterno(url, nombreGlobal){

  return new Promise((resolve, reject) => {

    if(window[nombreGlobal]){
      resolve(window[nombreGlobal]);
      return;
    }

    const existente =
      document.querySelector(`script[src="${url}"]`);

    if(existente){
      existente.addEventListener('load', () => resolve(window[nombreGlobal]));
      existente.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');

    script.src = url;
    script.onload = () => resolve(window[nombreGlobal]);
    script.onerror = () => reject(
      new Error('No se pudo cargar la librería de exportación.')
    );

    document.head.appendChild(script);

  });

}


function descargarArchivo(blob, nombre){

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');

  a.href = url;
  a.download = nombre;

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

}


function nombreArchivoSeguro(texto){

  return String(texto || '')
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'reporte';

}


function obtenerRegistroExportacion(){

  const all = loadRecords()
    .filter(r => r.linea === state.currentLine)
    .sort((a,b) =>
      (a.timestamp || '').localeCompare(b.timestamp || '')
    );

  if(all.length === 0){
    alert('No hay registros guardados para exportar.');
    return null;
  }

  const rec = state.viewingRecordId
    ? all.find(r => r.id === state.viewingRecordId)
    : all[all.length - 1];

  if(!rec){
    alert('No se encontró el registro seleccionado.');
    return null;
  }

  return { rec, all, d: calcDerived(rec) };

}


/* =========================================================
   EXPORTACIÓN A EXCEL (v2)
   =========================================================

   Libro con 7 hojas:
     1. Reporte Diario   — resumen ejecutivo, KPIs con semáforo,
                           producción POR CUADRO + total del turno,
                           gráficos de pérdidas y paradas, mermas,
                           insumos, personal, observaciones y firmas.
     2. Paradas          — TODAS las paradas de los cuadros (sin tope).
     3. Mermas           — detalle por cuadro y resumen por componente.
     4. Insumos          — consumo por cuadro y total.
     5. Personal         — personal del turno.
     6. Historial línea  — todos los registros de la línea, con fechas
                           reales, filtros y semáforo.
     7. Resumen líneas   — desempeño acumulado por línea (histórico,
                           7 y 30 días) con gráfico.

   Se usa ExcelJS (formato, colores, fórmulas, imágenes).
   Los totales y KPIs de la hoja principal son FÓRMULAS vivas:
   si alguien edita un valor en Excel, todo se recalcula.
   ========================================================= */

const XL = {
  azul: '17365D',
  celeste: '5B9BD5',
  azulClaro: 'D9EAF7',
  azulMuyClaro: 'EEF5FB',
  grisClaro: 'F3F6F9',
  grisTexto: '5B6573',
  blanco: 'FFFFFF',
  negro: '1F2933',
  verde: '70AD47',
  verdeClaro: 'E2F0D9',
  amarillo: 'FFD966',
  amarilloClaro: 'FFF2CC',
  rojo: 'C00000',
  rojoClaro: 'F4CCCC',
  borde: 'B7C9D6'
};

const XL_BORDER = {
  top:    { style:'thin', color:{ argb:'FF' + XL.borde } },
  left:   { style:'thin', color:{ argb:'FF' + XL.borde } },
  bottom: { style:'thin', color:{ argb:'FF' + XL.borde } },
  right:  { style:'thin', color:{ argb:'FF' + XL.borde } }
};

const XL_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';


/* ---------- utilidades de formato ---------- */

function xlFill(hex){
  return { type:'pattern', pattern:'solid', fgColor:{ argb:'FF' + hex } };
}

function xlFont(o = {}){
  return {
    name:'Arial',
    size:o.size || 9,
    bold:!!o.bold,
    italic:!!o.italic,
    color:{ argb:'FF' + (o.color || XL.negro) }
  };
}

function xlColorSemaforo(v){
  const n = num(v);
  if(n >= 0.85) return XL.verdeClaro;
  if(n >= 0.60) return XL.amarilloClaro;
  return XL.rojoClaro;
}

function xlEstado(v){
  const n = num(v);
  if(n >= 0.85) return 'Bueno';
  if(n >= 0.60) return 'Aceptable';
  return 'Crítico';
}

/* 'YYYY-MM-DD' -> fecha real de Excel (sin desfase de zona horaria). */
function xlFechaExcel(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m
    ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    : (s || '');
}

function xlFechaTexto(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s || '');
}

function xlN(v){
  return Math.round(num(v)).toLocaleString('es-PE');
}

function xlN1(v){
  return num(v).toLocaleString('es-PE', {
    minimumFractionDigits:1,
    maximumFractionDigits:1
  });
}

function xlLetra(n){
  let s = '';
  while(n > 0){
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function xlFx(formula, result){
  return { formula, result: Number.isFinite(result) ? result : 0 };
}

function xlTotalParadasCuadro(c){
  const suma = l => (l || []).reduce((a,p) => a + num(p?.tiempoMin), 0);
  return suma(c?.paradasProgramadas) + suma(c?.paradasNoProgramadas);
}

/*
   Cuadros "con actividad" de un registro. Si ninguno tiene
   datos, se devuelve el primero para que la hoja no quede vacía.
*/
function xlCuadrosActivos(rec){

  const todos = normalizarCuadros(rec);

  const activos = todos.filter(c =>
    c.marca || c.presentacion ||
    num(c.horasTurno) > 0 ||
    num(c.produccion?.efectiva) > 0 ||
    num(c.produccion?.programada) > 0 ||
    num(c.produccion?.sopladas) > 0 ||
    xlTotalParadasCuadro(c) > 0
  );

  return activos.length ? activos : [todos[0]];

}


/* ---------- escritura de celdas ---------- */

function xlSet(ws, row, col, value, o = {}){

  const c = ws.getCell(row, col);

  c.value = value;
  c.font = xlFont(o);

  if(o.fill) c.fill = xlFill(o.fill);
  if(o.border !== false) c.border = XL_BORDER;

  c.alignment = {
    horizontal:o.align || 'left',
    vertical:o.valign || 'middle',
    wrapText:o.wrap !== false
  };

  if(o.numFmt) c.numFmt = o.numFmt;

  return c;

}

function xlMerge(ws, row, c1, c2, value, o = {}){

  if(c2 > c1) ws.mergeCells(row, c1, row, c2);

  for(let c = c1; c <= c2; c++){
    const cell = ws.getCell(row, c);
    if(o.fill) cell.fill = xlFill(o.fill);
    if(o.border !== false) cell.border = XL_BORDER;
  }

  return xlSet(ws, row, c1, value, o);

}

function xlBloque(ws, r1, c1, r2, c2, value, o = {}){

  ws.mergeCells(r1, c1, r2, c2);

  for(let r = r1; r <= r2; r++){
    for(let c = c1; c <= c2; c++){
      const cell = ws.getCell(r, c);
      if(o.fill) cell.fill = xlFill(o.fill);
      if(o.border !== false) cell.border = XL_BORDER;
    }
  }

  return xlSet(ws, r1, c1, value, o);

}

function xlSeccion(ws, row, c1, c2, texto){
  xlMerge(ws, row, c1, c2, texto, {
    bold:true, size:11, color:XL.blanco, fill:XL.celeste
  });
  ws.getRow(row).height = 21;
}

function xlEncabezados(ws, row, c1, titulos){
  titulos.forEach((t,i) => {
    xlSet(ws, row, c1 + i, t, {
      bold:true, fill:XL.azulClaro, align:'center'
    });
  });
  ws.getRow(row).height = 32;
}

/*
   Semáforo como formato condicional (sigue funcionando si se edita).
   Usa expresiones con ISNUMBER para que las celdas vacías o con
   texto ("—") NO se pinten de verde/rojo.
*/
function xlSemaforoCF(ws, ref){

  const tl = ref.split(':')[0];

  const st = hex => ({
    fill:{ type:'pattern', pattern:'solid', bgColor:{ argb:'FF' + hex } }
  });

  ws.addConditionalFormatting({
    ref,
    rules:[
      { type:'expression', priority:1,
        formulae:[`AND(ISNUMBER(${tl}),${tl}>=0.85)`],
        style:st(XL.verdeClaro) },
      { type:'expression', priority:2,
        formulae:[`AND(ISNUMBER(${tl}),${tl}>=0.6,${tl}<0.85)`],
        style:st(XL.amarilloClaro) },
      { type:'expression', priority:3,
        formulae:[`AND(ISNUMBER(${tl}),${tl}<0.6)`],
        style:st(XL.rojoClaro) }
    ]
  });

}

function xlImpresion(ws, ultimaCol, ultimaFila, ctx, opts = {}){

  ws.pageSetup = {
    orientation:'landscape',
    paperSize:9,
    fitToPage:true,
    fitToWidth:1,
    fitToHeight:0,
    horizontalCentered:true,
    printArea:`A1:${xlLetra(ultimaCol)}${ultimaFila}`,
    margins:{
      left:0.3, right:0.3, top:0.5, bottom:0.5,
      header:0.2, footer:0.25
    }
  };

  if(opts.repetirFila){
    ws.pageSetup.printTitlesRow = `${opts.repetirFila}:${opts.repetirFila}`;
  }

  const esc = t => String(t || '').replace(/&/g, '&&');

  ws.headerFooter.oddFooter =
    `&L&8GLACIAL · ${esc(ctx.lineaNombre)}` +
    `&C&8Página &P de &N` +
    `&R&8${esc(ctx.generado)}`;

}


/* ---------- gráficos simples dibujados en canvas ---------- */

function xlGraficoBarras(cfg){

  const filas = cfg.filas || [];

  if(!filas.length){
    return null;
  }

  const ancho = cfg.ancho || 640;
  const alto = cfg.alto || 340;
  const esc = 2;

  const canvas = document.createElement('canvas');

  canvas.width = ancho * esc;
  canvas.height = alto * esc;

  const ctx = canvas.getContext('2d');

  ctx.scale(esc, esc);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, ancho, alto);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#' + XL.azul;
  ctx.font = 'bold 15px Arial';
  ctx.fillText(cfg.titulo || '', 16, 22);

  const top = 50;
  const izq = 200;
  const der = 110;
  const pie = 14;

  const max = Math.max(...filas.map(f => f.valor), 0) || 1;
  const altoFila = (alto - top - pie) / filas.length;
  const altoBarra = Math.min(altoFila * 0.62, 34);

  filas.forEach((f,i) => {

    const y = top + i * altoFila + altoFila / 2;

    let etiqueta = String(f.etiqueta || '');

    ctx.font = '12px Arial';

    while(
      etiqueta.length > 1 &&
      ctx.measureText(etiqueta).width > izq - 18
    ){
      etiqueta = etiqueta.slice(0, -1);
    }

    if(etiqueta.length < String(f.etiqueta || '').length){
      etiqueta = etiqueta.trimEnd() + '…';
    }

    ctx.fillStyle = '#' + XL.negro;
    ctx.textAlign = 'right';
    ctx.fillText(etiqueta, izq - 10, y);

    const w = Math.max((ancho - izq - der) * (f.valor / max), 1);

    ctx.fillStyle = f.color || '#' + XL.celeste;
    ctx.fillRect(izq, y - altoBarra / 2, w, altoBarra);

    ctx.fillStyle = '#' + XL.negro;
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(f.texto || '', izq + w + 8, y);

  });

  return canvas.toDataURL('image/png');

}

function xlAgregarImagen(wb, ws, dataUrl, col, fila, ancho, alto){

  if(!dataUrl){
    return;
  }

  try{

    const id = wb.addImage({ base64:dataUrl, extension:'png' });

    ws.addImage(id, {
      tl:{ col, row:fila },
      ext:{ width:ancho, height:alto }
    });

  } catch(e){

    console.warn('No se pudo insertar el gráfico en el Excel:', e);

  }

}


/* =========================================================
   GAUGE (ANILLO) DE OEE — DIBUJADO EN CANVAS
   =========================================================

   Medio anillo tipo velocímetro: el arco de fondo (gris) va
   de 180° a 360° y el arco de color avanza según "valor"
   (0-1). Se marca la meta con una línea radial y el % queda
   en grande al centro.
   ========================================================= */

function xlGraficoGaugeOEE(cfg){

  const valor = Math.max(0, Math.min(1, num(cfg.valor)));
  const meta = num(cfg.meta);

  const ancho = cfg.ancho || 220;
  const alto = cfg.alto || 190;
  const grosor = cfg.grosor || 20;
  const esc = 2;

  const canvas = document.createElement('canvas');
  canvas.width = ancho * esc;
  canvas.height = alto * esc;

  const ctx = canvas.getContext('2d');
  ctx.scale(esc, esc);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, ancho, alto);

  const padding = 18;
  const r = ancho / 2 - padding;
  const cx = ancho / 2;
  const cy = padding + r;

  const inicio = Math.PI;
  const fin = 2 * Math.PI;

  /* Fondo del arco */
  ctx.beginPath();
  ctx.lineWidth = grosor;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#' + XL.grisClaro;
  ctx.arc(cx, cy, r, inicio, fin, false);
  ctx.stroke();

  const colorValor = '#' + xlColorFuerteSegunMeta(valor, meta);

  /* Arco de valor */
  if(valor > 0.003){

    ctx.beginPath();
    ctx.lineWidth = grosor;
    ctx.lineCap = 'round';
    ctx.strokeStyle = colorValor;
    ctx.arc(cx, cy, r, inicio, inicio + valor * Math.PI, false);
    ctx.stroke();

  }

  /* Marca de meta */
  if(meta > 0 && meta < 1){

    const anguloMeta = inicio + meta * Math.PI;
    const x1 = cx + (r - grosor / 2 - 3) * Math.cos(anguloMeta);
    const y1 = cy + (r - grosor / 2 - 3) * Math.sin(anguloMeta);
    const x2 = cx + (r + grosor / 2 + 3) * Math.cos(anguloMeta);
    const y2 = cy + (r + grosor / 2 + 3) * Math.sin(anguloMeta);

    ctx.beginPath();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#' + XL.negro;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

  }

  /* Texto central */
  ctx.textAlign = 'center';

  ctx.fillStyle = colorValor;
  ctx.font = 'bold 28px Arial';
  ctx.fillText(Math.round(valor * 100) + '%', cx, cy + 6);

  ctx.fillStyle = '#' + XL.grisTexto;
  ctx.font = '600 12px Arial';
  ctx.fillText(cfg.titulo || 'OEE', cx, cy + 27);

  if(meta > 0){
    ctx.font = '10px Arial';
    ctx.fillText('Meta ' + Math.round(meta * 100) + '%', cx, cy + 43);
  }

  return canvas.toDataURL('image/png');

}


/* ---------- hoja genérica tipo tabla ---------- */

/*
   cfg = {
     nombre, titulo, subtitulo, tab,
     columnas:[{h, w, fmt, align}],
     filas:[ [valor | (fila)=>valor, ...], ... ],
     resaltar: Set de índices de fila (opcional),
     total: (r0, r1, rt) => [valores]   (opcional)
   }
   Devuelve { ws, r0, r1, rt }.
*/

function xlHojaTabla(wb, ctx, cfg){

  const ws = wb.addWorksheet(cfg.nombre, {
    properties:{ tabColor:{ argb:'FF' + (cfg.tab || XL.celeste) } },
    views:[{ state:'frozen', ySplit:4, showGridLines:false }]
  });

  const n = cfg.columnas.length;

  cfg.columnas.forEach((c,i) => {
    ws.getColumn(i + 1).width = c.w || 14;
  });

  xlMerge(ws, 1, 1, n, cfg.titulo, {
    bold:true, size:14, color:XL.blanco, fill:XL.azul, align:'center'
  });

  ws.getRow(1).height = 28;

  xlMerge(ws, 2, 1, n, cfg.subtitulo || '', {
    italic:true, size:9, color:XL.grisTexto,
    fill:XL.grisClaro, align:'center'
  });

  xlEncabezados(ws, 4, 1, cfg.columnas.map(c => c.h));

  const r0 = 5;
  let r = r0;

  cfg.filas.forEach((fila, idx) => {

    const resaltada = cfg.resaltar && cfg.resaltar.has(idx);

    fila.forEach((v, i) => {

      const col = cfg.columnas[i];
      const valor = typeof v === 'function' ? v(r) : v;

      const esNumero =
        typeof valor === 'number' ||
        valor instanceof Date ||
        (valor && valor.formula);

      xlSet(ws, r, i + 1, valor, {
        numFmt:col.fmt,
        align:col.align || (esNumero ? 'right' : 'left'),
        bold:resaltada,
        fill:resaltada
          ? XL.amarilloClaro
          : (idx % 2 === 1 ? XL.grisClaro : undefined)
      });

    });

    r++;

  });

  const r1 = r - 1;
  let rt = null;

  if(cfg.total){

    rt = r;

    const valores = cfg.total(r0, r1, rt);

    valores.forEach((v, i) => {

      const col = cfg.columnas[i];

      xlSet(ws, rt, i + 1, v, {
        bold:true,
        fill:XL.azulClaro,
        numFmt:col.fmt,
        align:col.align || (typeof v === 'string' ? 'left' : 'right')
      });

    });

  }

  if(r1 >= r0){
    ws.autoFilter = {
      from:{ row:4, column:1 },
      to:{ row:r1, column:n }
    };
  }

  xlImpresion(ws, n, rt || r1, ctx, { repetirFila:4 });

  return { ws, r0, r1, rt };

}


/* =========================================================
   HOJA 1 — REPORTE DIARIO
   ========================================================= */

function xlHojaReporte(wb, ctx){

  const { rec, d, cuadros, lineaNombre, usuario } = ctx;

  const ws = wb.addWorksheet('Reporte Diario', {
    properties:{
      tabColor:{ argb:'FF' + XL.azul },
      defaultRowHeight:18
    },
    views:[{ state:'frozen', ySplit:3, showGridLines:false }]
  });

  const anchos = {
    1:2, 2:6, 3:14, 4:32, 5:13, 6:12, 7:14, 8:10, 9:10, 10:12,
    11:12, 12:12, 13:12, 14:9, 15:10, 16:10, 17:10, 18:10,
    19:10, 20:10, 21:11, 22:2
  };

  Object.keys(anchos).forEach(k => {
    ws.getColumn(Number(k)).width = anchos[k];
  });

  const C1 = 2;
  const C2 = 21;

  /* ---------- Título ---------- */

  xlMerge(ws, 2, C1, C2, 'REPORTE DIARIO DE PRODUCCIÓN — GLACIAL', {
    bold:true, size:16, color:XL.blanco, fill:XL.azul, align:'center'
  });

  ws.getRow(2).height = 30;

  xlMerge(
    ws, 3, C1, C2,
    `${lineaNombre}   |   Fecha: ${xlFechaTexto(rec.fecha)}   |   ` +
    `Turno: ${rec.turno || '—'}   |   ` +
    `Registrado por: ${rec.registradoPor || '—'}`,
    {
      bold:true, size:10, color:XL.grisTexto,
      fill:XL.grisClaro, align:'center'
    }
  );

  ws.getRow(3).height = 22;

  let r = 5;

  /* ---------- Resumen ejecutivo ---------- */

  const cascada = calcCascada(rec);
  const paradas = agruparParadas(rec);
  const mermas = agruparMermas(rec);
  mermas.filas = mermas.filas.filter(f => f.unidades > 0 || f.peso > 0);
  const insumos = agruparInsumos(rec);

  xlSeccion(ws, r, C1, C2, 'RESUMEN EJECUTIVO');
  r++;

  const kpis = [
    { t:'Disponibilidad', v:d.disponibilidad,
      s:`${xlN1(d.horasEfectivas)} h efectivas de ${xlN1(d.horasTurno)} h` },
    { t:'Rendimiento', v:d.rendimiento,
      s:`${xlN(d.efectiva)} de ${xlN(d.produccionNominal)} bot. nominales` },
    { t:'Calidad', v:d.calidad,
      s:`${xlN(d.calidadBot)} conformes de ${xlN(d.sopladas)} sopladas` },
    { t:'OEE', v:d.oee, s:xlEstado(d.oee) },
    { t:'Cumplimiento', v:d.cumplimiento,
      s:`${xlN(d.efectiva)} de ${xlN(d.programada)} programadas` },
    { t:'Eficiencia', v:d.eficiencia, s:'Efectiva / nominal' }
  ];

  const spansKpi = [[2,4],[5,7],[8,11],[12,15],[16,18],[19,21]];

  kpis.forEach((k,i) => {

    const [a,b] = spansKpi[i];

    xlMerge(ws, r, a, b, k.t, {
      bold:true, fill:XL.azulMuyClaro, align:'center'
    });

    xlMerge(ws, r + 1, a, b, num(k.v), {
      bold:true, size:16, fill:xlColorSemaforo(k.v),
      align:'center', numFmt:'0.0%'
    });

    xlMerge(ws, r + 2, a, b, k.s, {
      italic:true, size:8, color:XL.grisTexto, align:'center'
    });

  });

  ws.getRow(r + 1).height = 32;
  ws.getRow(r + 2).height = 16;

  r += 3;

  /* Leyenda del semáforo */

  xlMerge(ws, r, 2, 4, 'Semáforo de referencia:', {
    bold:true, size:8, color:XL.grisTexto, align:'right', border:false
  });
  xlMerge(ws, r, 5, 7, '≥ 85 %  Bueno', {
    size:8, fill:XL.verdeClaro, align:'center'
  });
  xlMerge(ws, r, 8, 11, '60 % – 85 %  Aceptable', {
    size:8, fill:XL.amarilloClaro, align:'center'
  });
  xlMerge(ws, r, 12, 15, '< 60 %  Crítico', {
    size:8, fill:XL.rojoClaro, align:'center'
  });

  r += 2;

  /* Hallazgos automáticos */

  const perdidas = [
    ['paradas (disponibilidad)', cascada.perdidaDisponibilidad],
    ['ritmo lento (rendimiento)', cascada.perdidaRendimiento],
    ['calidad (botellas no conformes)', cascada.perdidaCalidad]
  ].sort((a,b) => b[1] - a[1]);

  const minNoProg = paradas.filas
    .filter(f => f.tipo === 'No programada')
    .reduce((a,f) => a + f.minutos, 0);

  const hallazgos = [];

  if(cascada.capacidadTeorica > 0 && perdidas[0][1] > 0){

    hallazgos.push(
      `Principal pérdida de OEE: ${perdidas[0][0]} — ` +
      `${xlN(perdidas[0][1])} botellas equivalentes ` +
      `(${(perdidas[0][1] / cascada.capacidadTeorica * 100).toFixed(1)} % ` +
      `de la capacidad teórica).`
    );

  }

  if(paradas.filas.length){

    hallazgos.push(
      `Tiempo en paradas: ${xlN(paradas.total)} min ` +
      `(no programadas: ${xlN(minNoProg)} min). ` +
      `Mayor causa: ${paradas.filas[0].descripcion} ` +
      `(${xlN(paradas.filas[0].minutos)} min).`
    );

  }

  if(mermas.totalUnidades > 0 && num(d.efectiva) > 0){

    hallazgos.push(
      `Mermas: ${xlN(mermas.totalUnidades)} unidades ` +
      `(${(mermas.totalUnidades / num(d.efectiva) * 100).toFixed(2)} % ` +
      `de la producción efectiva). ` +
      `Mayor componente: ${mermas.filas[0].item}.`
    );

  }

  if(!hallazgos.length){
    hallazgos.push(
      'Sin pérdidas, paradas ni mermas registradas para este turno.'
    );
  }

  hallazgos.forEach(t => {
    xlMerge(ws, r, C1, C2, '•  ' + t, { fill:XL.grisClaro });
    ws.getRow(r).height = 20;
    r++;
  });

  r++;

  /* ---------- Datos generales ---------- */

  xlSeccion(ws, r, C1, C2, 'DATOS GENERALES');
  r++;

  const pares = [
    ['Línea', lineaNombre],
    ['Fecha', xlFechaExcel(rec.fecha), 'dd/mm/yyyy'],
    ['Día juliano', rec.diaJuliano || obtenerDiaDelAño(rec.fecha)],
    ['Semana', rec.semana || obtenerSemana(rec.fecha)],
    ['Turno', rec.turno || ''],
    ['Registrado por', rec.registradoPor || ''],
    ['Cuadros con producción', cuadros.length],
    ['Horas de turno (total)', num(d.horasTurno), '0.0']
  ];

  const spansDatos = [[2,3,4,4],[5,6,7,8],[9,11,12,14],[15,17,18,21]];

  pares.forEach((p,i) => {

    const fila = r + Math.floor(i / 4);
    const [l1,l2,v1,v2] = spansDatos[i % 4];

    xlMerge(ws, fila, l1, l2, p[0], {
      bold:true, fill:XL.azulMuyClaro
    });

    xlMerge(ws, fila, v1, v2, p[1], {
      numFmt:p[2], align:'left'
    });

  });

  r += 3;

  /* ---------- Producción por cuadro ---------- */

  xlSeccion(ws, r, C1, C2, 'PRODUCCIÓN POR CUADRO Y TOTAL DEL TURNO');
  r++;

  xlEncabezados(ws, r, 2, [
    'N°', 'Marca', 'Presentación', 'Lote', 'Vencimiento', 'Horario',
    'Horas turno', 'Horas efect.', 'Prod. programada', 'Prod. efectiva',
    'Bot. sopladas', 'Bot. rechazadas', 'Paletas',
    'Ratio nominal (B/H)', 'Ratio efectivo (B/H)',
    'Disponib.', 'Rendim.', 'Calidad', 'OEE', 'Cumplim.'
  ]);

  ws.getRow(r).height = 40;

  const rc0 = r + 1;

  cuadros.forEach((c,i) => {

    const f = rc0 + i;
    const dc = calcDerivedCuadro(c);
    const par = fmt => ({ numFmt:fmt, align:'right' });

    xlSet(ws, f, 2, c.numero, { align:'center' });
    xlSet(ws, f, 3, c.marca || '—');
    xlSet(ws, f, 4, c.presentacion || '—');
    xlSet(ws, f, 5, c.lote || '—', { bold:true, align:'center' });
    xlSet(ws, f, 6, c.fechaVencimiento ? xlFechaExcel(c.fechaVencimiento) : '—',
      { numFmt:'dd/mm/yyyy', align:'center' });
    xlSet(ws, f, 7, `${c.horaInicio || '—'} – ${c.horaFin || '—'}`,
      { align:'center' });
    xlSet(ws, f, 8, num(c.horasTurno), par('0.0'));
    xlSet(ws, f, 9, dc.horasEfectivas, par('0.00'));
    xlSet(ws, f, 10, num(c.produccion?.programada), par('#,##0'));
    xlSet(ws, f, 11, num(c.produccion?.efectiva), par('#,##0'));
    xlSet(ws, f, 12, num(c.produccion?.sopladas), par('#,##0'));
    xlSet(ws, f, 13, num(c.produccion?.calidad), par('#,##0'));
    xlSet(ws, f, 14, num(c.produccion?.paletas), par('#,##0'));
    xlSet(ws, f, 15, num(c.ratioNominal), par('#,##0'));

    xlSet(ws, f, 16,
      xlFx(`IF(I${f}>0,K${f}/I${f},0)`, dc.ratioEfectivo), par('#,##0'));
    xlSet(ws, f, 17,
      xlFx(`IF(H${f}>0,I${f}/H${f},0)`, dc.disponibilidad), par('0.0%'));
    xlSet(ws, f, 18,
      xlFx(`IF(O${f}*I${f}>0,MIN(K${f}/(O${f}*I${f}),1),0)`, dc.rendimiento),
      par('0.0%'));
    xlSet(ws, f, 19,
      xlFx(`IF(L${f}>0,MAX(L${f}-M${f},0)/L${f},IF(K${f}>0,1,0))`, dc.calidad),
      par('0.0%'));
    xlSet(ws, f, 20,
      xlFx(`Q${f}*R${f}*S${f}`, dc.oee), { numFmt:'0.0%', align:'right', bold:true });
    xlSet(ws, f, 21,
      xlFx(`IF(J${f}>0,K${f}/J${f},0)`, dc.cumplimiento), par('0.0%'));

  });

  const rc1 = rc0 + cuadros.length - 1;
  const rt = rc1 + 1;

  xlMerge(ws, rt, 2, 7, 'TOTAL DEL TURNO', {
    bold:true, fill:XL.azulClaro, align:'center'
  });

  const totalFmt = { bold:true, fill:XL.azulClaro, align:'right' };

  const sumaCol = (col, fmt) => xlSet(
    ws, rt, col,
    xlFx(
      `SUM(${xlLetra(col)}${rc0}:${xlLetra(col)}${rc1})`,
      cuadros.reduce((a,c) => {
        const dc = calcDerivedCuadro(c);
        return a + ({
          8:num(c.horasTurno), 9:dc.horasEfectivas,
          10:num(c.produccion?.programada), 11:num(c.produccion?.efectiva),
          12:num(c.produccion?.sopladas), 13:num(c.produccion?.calidad),
          14:num(c.produccion?.paletas)
        }[col] || 0);
      }, 0)
    ),
    { ...totalFmt, numFmt:fmt }
  );

  sumaCol(8, '0.0');
  sumaCol(9, '0.00');
  sumaCol(10, '#,##0');
  sumaCol(11, '#,##0');
  sumaCol(12, '#,##0');
  sumaCol(13, '#,##0');
  sumaCol(14, '#,##0');

  const nominalRango = `SUMPRODUCT(O${rc0}:O${rc1},I${rc0}:I${rc1})`;

  xlSet(ws, rt, 15,
    xlFx(`IF(I${rt}>0,${nominalRango}/I${rt},0)`,
      num(d.horasEfectivas) > 0
        ? num(d.produccionNominal) / num(d.horasEfectivas) : 0),
    { ...totalFmt, numFmt:'#,##0' });
  xlSet(ws, rt, 16,
    xlFx(`IF(I${rt}>0,K${rt}/I${rt},0)`, num(d.ratioEfectivo)),
    { ...totalFmt, numFmt:'#,##0' });
  xlSet(ws, rt, 17,
    xlFx(`IF(H${rt}>0,I${rt}/H${rt},0)`, num(d.disponibilidad)),
    { ...totalFmt, numFmt:'0.0%' });
  xlSet(ws, rt, 18,
    xlFx(`IF(${nominalRango}>0,MIN(K${rt}/${nominalRango},1),0)`,
      num(d.rendimiento)),
    { ...totalFmt, numFmt:'0.0%' });
  xlSet(ws, rt, 19,
    xlFx(`IF(L${rt}>0,MAX(L${rt}-M${rt},0)/L${rt},IF(K${rt}>0,1,0))`,
      num(d.calidad)),
    { ...totalFmt, numFmt:'0.0%' });
  xlSet(ws, rt, 20,
    xlFx(`Q${rt}*R${rt}*S${rt}`, num(d.oee)),
    { ...totalFmt, numFmt:'0.0%' });
  xlSet(ws, rt, 21,
    xlFx(`IF(J${rt}>0,K${rt}/J${rt},0)`, num(d.cumplimiento)),
    { ...totalFmt, numFmt:'0.0%' });

  xlSemaforoCF(ws, `Q${rc0}:U${rt}`);

  ws.getRow(rt).height = 22;

  r = rt + 2;

  /* ---------- Gráficos ---------- */

  xlSeccion(ws, r, C1, C2, 'ANÁLISIS DE PÉRDIDAS Y PARADAS');
  r++;

  const filaGraficos = r;

  const dataCascada = xlGraficoBarras({
    titulo:'Cascada de pérdidas de producción (botellas)',
    filas:[
      { etiqueta:'Capacidad teórica', valor:cascada.capacidadTeorica,
        color:'#' + XL.celeste,
        texto:xlN(cascada.capacidadTeorica) },
      { etiqueta:'− Paradas', valor:cascada.perdidaDisponibilidad,
        color:'#' + XL.rojo,
        texto:'− ' + xlN(cascada.perdidaDisponibilidad) },
      { etiqueta:'− Ritmo lento', valor:cascada.perdidaRendimiento,
        color:'#E69F00',
        texto:'− ' + xlN(cascada.perdidaRendimiento) },
      { etiqueta:'− Calidad', valor:cascada.perdidaCalidad,
        color:'#7F3F98',
        texto:'− ' + xlN(cascada.perdidaCalidad) },
      { etiqueta:'Producción buena', valor:cascada.buena,
        color:'#' + XL.verde,
        texto:xlN(cascada.buena) }
    ]
  });

  xlAgregarImagen(wb, ws, dataCascada, 1.05, filaGraficos - 1 + 0.1, 640, 340);

  const topParadas = paradas.filas.slice(0, 6);

  const dataPareto = xlGraficoBarras({
    titulo:'Principales causas de parada (minutos)',
    filas:topParadas.map(f => ({
      etiqueta:f.descripcion,
      valor:f.minutos,
      color:f.tipo === 'No programada' ? '#' + XL.rojo : '#' + XL.celeste,
      texto:`${xlN(f.minutos)} min` +
        (paradas.total > 0
          ? ` (${(f.minutos / paradas.total * 100).toFixed(0)}%)` : '')
    }))
  });

  if(dataPareto){

    xlAgregarImagen(wb, ws, dataPareto, 7.05, filaGraficos - 1 + 0.1, 640, 340);

  } else {

    xlMerge(ws, filaGraficos, 8, C2,
      'Sin paradas registradas en este turno.',
      { italic:true, color:XL.grisTexto, align:'center', border:false });

  }

  r += 17;

  /* ---------- Cascada (tabla) + Top paradas ---------- */

  xlSeccion(ws, r, C1, C2, 'DETALLE DE PÉRDIDAS Y TOP PARADAS');
  r++;

  xlMerge(ws, r, 2, 4, 'Pérdida de producción', {
    bold:true, fill:XL.azulClaro, align:'center'
  });
  xlMerge(ws, r, 5, 6, 'Botellas', {
    bold:true, fill:XL.azulClaro, align:'center'
  });
  xlSet(ws, r, 7, '% capacidad', {
    bold:true, fill:XL.azulClaro, align:'center'
  });

  xlSet(ws, r, 9, 'N°', { bold:true, fill:XL.azulClaro, align:'center' });
  xlMerge(ws, r, 10, 11, 'Tipo', {
    bold:true, fill:XL.azulClaro, align:'center'
  });
  xlMerge(ws, r, 12, 16, 'Causa', {
    bold:true, fill:XL.azulClaro, align:'center'
  });
  xlMerge(ws, r, 17, 18, 'Minutos', {
    bold:true, fill:XL.azulClaro, align:'center'
  });
  xlSet(ws, r, 19, '% total', { bold:true, fill:XL.azulClaro, align:'center' });
  xlMerge(ws, r, 20, 21, '% acumulado', {
    bold:true, fill:XL.azulClaro, align:'center'
  });

  ws.getRow(r).height = 24;

  const cap = cascada.capacidadTeorica;

  const filasCascada = [
    ['Capacidad teórica del turno', cascada.capacidadTeorica, false],
    ['− Pérdida por paradas', cascada.perdidaDisponibilidad, false],
    ['− Pérdida por ritmo lento', cascada.perdidaRendimiento, false],
    ['− Pérdida por calidad', cascada.perdidaCalidad, false],
    ['= Producción buena', cascada.buena, true]
  ];

  filasCascada.forEach((f,i) => {

    const fila = r + 1 + i;

    xlMerge(ws, fila, 2, 4, f[0], { bold:f[2] });
    xlMerge(ws, fila, 5, 6, Math.round(f[1]), {
      numFmt:'#,##0', align:'right', bold:f[2]
    });
    xlSet(ws, fila, 7, cap > 0 ? f[1] / cap : 0, {
      numFmt:'0.0%', align:'right', bold:f[2]
    });

  });

  const topN = paradas.filas.slice(0, 5);

  for(let i = 0; i < 5; i++){

    const fila = r + 1 + i;
    const f = topN[i];

    xlSet(ws, fila, 9, f ? i + 1 : '', { align:'center' });
    xlMerge(ws, fila, 10, 11, f ? f.tipo : '');
    xlMerge(ws, fila, 12, 16, f ? f.descripcion : '');
    xlMerge(ws, fila, 17, 18, f ? f.minutos : '', {
      numFmt:'#,##0.0', align:'right'
    });
    xlSet(ws, fila, 19,
      f && paradas.total > 0 ? f.minutos / paradas.total : '',
      { numFmt:'0.0%', align:'right' });
    xlMerge(ws, fila, 20, 21,
      f ? f.acumuladoPct / 100 : '',
      { numFmt:'0.0%', align:'right' });

  }

  r += 7;

  xlMerge(ws, r - 1, 9, 21,
    'El detalle completo de paradas (por cuadro) está en la hoja "Paradas".',
    { italic:true, size:8, color:XL.grisTexto, border:false });

  r++;

  /* ---------- Mermas e insumos ---------- */

  xlSeccion(ws, r, C1, C2, 'MERMAS E INSUMOS DEL TURNO');
  r++;

  xlMerge(ws, r, 2, 4, 'Merma por componente', {
    bold:true, fill:XL.azulClaro, align:'center'
  });
  xlSet(ws, r, 5, 'Unidades', { bold:true, fill:XL.azulClaro, align:'center' });
  xlSet(ws, r, 6, 'Peso (kg)', { bold:true, fill:XL.azulClaro, align:'center' });
  xlSet(ws, r, 7, '% s/ prod.', { bold:true, fill:XL.azulClaro, align:'center' });

  xlMerge(ws, r, 9, 14, 'Insumo consumido', {
    bold:true, fill:XL.azulClaro, align:'center'
  });
  xlMerge(ws, r, 15, 17, 'Cantidad', {
    bold:true, fill:XL.azulClaro, align:'center'
  });
  xlMerge(ws, r, 18, 21, 'Unidad', {
    bold:true, fill:XL.azulClaro, align:'center'
  });

  ws.getRow(r).height = 24;

  const filasMerma = mermas.filas.length
    ? mermas.filas
    : [{ item:'Sin mermas registradas', unidades:0, peso:0 }];

  filasMerma.forEach((m,i) => {

    const fila = r + 1 + i;

    xlMerge(ws, fila, 2, 4, m.item);
    xlSet(ws, fila, 5, m.unidades, { numFmt:'#,##0', align:'right' });
    xlSet(ws, fila, 6, m.peso, { numFmt:'0.000', align:'right' });
    xlSet(ws, fila, 7,
      num(d.efectiva) > 0 ? m.unidades / num(d.efectiva) : 0,
      { numFmt:'0.00%', align:'right' });

  });

  const listaInsumos = [
    ['Cajas de preformas', insumos.cajasPreformas, 'Und'],
    ['Planchas de cartón', insumos.planchasCarton, 'Und'],
    ['Polietileno', insumos.polietilenoKg, 'kg'],
    ['Stretch film', insumos.stretchFilmKg, 'kg'],
    ['Cartón reciclado', insumos.cartonReciclado, 'Und'],
    ['Cartón real utilizado', insumos.cartonRealUtilizado, 'Und']
  ];

  listaInsumos.forEach((x,i) => {

    const fila = r + 1 + i;

    xlMerge(ws, fila, 9, 14, x[0], { bold:true, fill:XL.azulMuyClaro });
    xlMerge(ws, fila, 15, 17, x[1], { numFmt:'#,##0.00', align:'right' });
    xlMerge(ws, fila, 18, 21, x[2], { align:'center' });

  });

  r += 1 + Math.max(filasMerma.length, listaInsumos.length) + 1;

  /* ---------- Personal ---------- */

  xlSeccion(ws, r, C1, C2, 'PERSONAL DEL TURNO');
  r++;

  xlMerge(ws, r, 2, 4, 'Posición', {
    bold:true, fill:XL.azulClaro, align:'center'
  });
  xlMerge(ws, r, 5, 12, 'Nombre y apellido', {
    bold:true, fill:XL.azulClaro, align:'center'
  });
  xlMerge(ws, r, 13, 21, 'Cargo', {
    bold:true, fill:XL.azulClaro, align:'center'
  });

  r++;

  const personal = Array.isArray(rec.personal) && rec.personal.length
    ? rec.personal
    : PERSONAL_POSICIONES.map(p => ({ posicion:p, nombre:'', cargo:'' }));

  personal.forEach((p,i) => {

    const fila = r + i;

    xlMerge(ws, fila, 2, 4, p.posicion || PERSONAL_POSICIONES[i] || '',
      { bold:true, fill:XL.azulMuyClaro });
    xlMerge(ws, fila, 5, 12, p.nombre || '');
    xlMerge(ws, fila, 13, 21, p.cargo || '');

  });

  r += personal.length + 1;

  /* ---------- Observaciones ---------- */

  xlSeccion(ws, r, C1, C2, 'OBSERVACIONES');
  r++;

  const obs = [];
  const vistas = new Set();

  cuadros.forEach(c => {

    const t = String(c.observaciones || '').trim();

    if(t && !vistas.has(t)){
      vistas.add(t);
      obs.push(`Cuadro ${c.numero}${c.marca ? ' (' + c.marca + ')' : ''}: ${t}`);
    }

  });

  const generales = String(rec.observaciones || '').trim();

  if(generales && !vistas.has(generales)){
    obs.push(`General: ${generales}`);
  }

  if(!obs.length){
    obs.push('Sin observaciones.');
  }

  obs.forEach(t => {

    xlMerge(ws, r, C1, C2, t, { valign:'top' });

    ws.getRow(r).height = Math.max(20, Math.ceil(t.length / 170) * 15 + 6);

    r++;

  });

  r += 2;

  /* ---------- Firmas ---------- */

  ws.getRow(r).height = 42;

  [[2,7,'Elaborado por: ' + (rec.registradoPor || '')],
   [9,14,'Supervisor de Producción'],
   [16,21,'Jefe de Producción']].forEach(f => {

    xlMerge(ws, r, f[0], f[1], '', {});
    xlMerge(ws, r + 1, f[0], f[1], f[2], {
      bold:true, size:8, color:XL.grisTexto, align:'center'
    });

  });

  r += 3;

  xlMerge(ws, r, C1, C2,
    `Documento generado por el sistema GLACIAL — ${ctx.generado} — ${usuario}`,
    {
      italic:true, size:8, color:XL.grisTexto,
      align:'right', border:false
    });

  xlImpresion(ws, 22, r, ctx);

}


/* =========================================================
   HOJA 2 — PARADAS
   ========================================================= */

function xlHojaParadas(wb, ctx){

  const { rec, cuadros, lineaNombre } = ctx;

  const filas = [];

  cuadros.forEach(c => {

    [
      ['Programada', c.paradasProgramadas],
      ['No programada', c.paradasNoProgramadas]
    ].forEach(([tipo, lista]) => {

      (lista || []).forEach(p => {

        const min = num(p?.tiempoMin);
        const desc = String(p?.descripcion || '').trim();

        if(min <= 0 && !desc){
          return;
        }

        filas.push({
          cuadro:c.numero,
          marca:c.marca || '',
          tipo,
          desc:desc || 'Sin descripción',
          min
        });

      });

    });

  });

  filas.sort((a,b) => b.min - a.min);

  const totalMin = filas.reduce((a,f) => a + f.min, 0);

  const datos = filas.length
    ? filas
    : [{ cuadro:'', marca:'', tipo:'', desc:'Sin paradas registradas', min:0 }];

  const rt = 5 + datos.length;

  xlHojaTabla(wb, ctx, {
    nombre:'Paradas',
    titulo:'PARADAS — ' + lineaNombre,
    subtitulo:
      `Fecha: ${xlFechaTexto(rec.fecha)}  |  Turno: ${rec.turno || '—'}  |  ` +
      'Ordenadas de mayor a menor tiempo',
    tab:XL.rojo,
    columnas:[
      { h:'Cuadro', w:9, align:'center' },
      { h:'Marca', w:18 },
      { h:'Tipo', w:16 },
      { h:'Descripción', w:54 },
      { h:'Tiempo (min)', w:14, fmt:'#,##0.0' },
      { h:'Tiempo (h)', w:12, fmt:'0.00' },
      { h:'% del total parado', w:17, fmt:'0.0%' }
    ],
    filas:datos.map(f => [
      f.cuadro, f.marca, f.tipo, f.desc, f.min,
      r => xlFx(`E${r}/60`, f.min / 60),
      r => xlFx(`IF($E$${rt}>0,E${r}/$E$${rt},0)`,
        totalMin > 0 ? f.min / totalMin : 0)
    ]),
    total:(r0, r1) => [
      'TOTAL', '', '', '',
      xlFx(`SUM(E${r0}:E${r1})`, totalMin),
      xlFx(`SUM(F${r0}:F${r1})`, totalMin / 60),
      xlFx(`SUM(G${r0}:G${r1})`, totalMin > 0 ? 1 : 0)
    ]
  });

}


/* =========================================================
   HOJA 3 — MERMAS
   ========================================================= */

function xlHojaMermas(wb, ctx){

  const { rec, cuadros, lineaNombre, d } = ctx;

  const filas = [];

  cuadros.forEach(c => {

    const efectivaCuadro = num(c.produccion?.efectiva);

    (c.mermas || []).forEach(m => {

      if(num(m?.unidades) <= 0 && num(m?.peso) <= 0){
        return;
      }

      filas.push({
        cuadro:c.numero,
        marca:c.marca || '',
        item:String(m.item || ''),
        peso:num(m.peso),
        unidades:num(m.unidades),
        efectiva:efectivaCuadro
      });

    });

  });

  const datos = filas.length
    ? filas
    : [{ cuadro:'', marca:'', item:'Sin mermas registradas',
         peso:0, unidades:0, efectiva:0 }];

  const totUnid = datos.reduce((a,f) => a + f.unidades, 0);
  const totPeso = datos.reduce((a,f) => a + f.peso, 0);
  const efectivaTotal = num(d.efectiva);

  const res = xlHojaTabla(wb, ctx, {
    nombre:'Mermas',
    titulo:'MERMAS — ' + lineaNombre,
    subtitulo:
      `Fecha: ${xlFechaTexto(rec.fecha)}  |  Turno: ${rec.turno || '—'}  |  ` +
      '% calculado sobre la producción efectiva de cada cuadro',
    tab:'E69F00',
    columnas:[
      { h:'Cuadro', w:9, align:'center' },
      { h:'Marca', w:18 },
      { h:'Componente', w:26 },
      { h:'Peso (kg)', w:14, fmt:'0.000' },
      { h:'Unidades', w:14, fmt:'#,##0' },
      { h:'Prod. efectiva del cuadro', w:20, fmt:'#,##0' },
      { h:'% s/ producción', w:16, fmt:'0.00%' }
    ],
    filas:datos.map(f => [
      f.cuadro, f.marca, f.item, f.peso, f.unidades, f.efectiva,
      r => xlFx(`IF(F${r}>0,E${r}/F${r},0)`,
        f.efectiva > 0 ? f.unidades / f.efectiva : 0)
    ]),
    total:(r0, r1, rt) => [
      'TOTAL', '', '',
      xlFx(`SUM(D${r0}:D${r1})`, totPeso),
      xlFx(`SUM(E${r0}:E${r1})`, totUnid),
      efectivaTotal,
      xlFx(`IF(F${rt}>0,E${rt}/F${rt},0)`,
        efectivaTotal > 0 ? totUnid / efectivaTotal : 0)
    ]
  });

  /* Resumen por componente (suma de todos los cuadros) */

  const ws = res.ws;
  const agr = agruparMermas(rec);
  agr.filas = agr.filas.filter(f => f.unidades > 0 || f.peso > 0);

  let r = (res.rt || res.r1) + 3;

  xlSeccion(ws, r, 1, 7, 'RESUMEN POR COMPONENTE (TODOS LOS CUADROS)');
  r++;

  xlEncabezados(ws, r, 3, [
    'Componente', 'Peso (kg)', 'Unidades',
    'Prod. efectiva total', '% s/ producción'
  ]);

  r++;

  const filasRes = agr.filas.length
    ? agr.filas
    : [{ item:'Sin mermas registradas', peso:0, unidades:0 }];

  filasRes.forEach(f => {

    xlSet(ws, r, 3, f.item);
    xlSet(ws, r, 4, f.peso, { numFmt:'0.000', align:'right' });
    xlSet(ws, r, 5, f.unidades, { numFmt:'#,##0', align:'right' });
    xlSet(ws, r, 6, efectivaTotal, { numFmt:'#,##0', align:'right' });
    xlSet(ws, r, 7, efectivaTotal > 0 ? f.unidades / efectivaTotal : 0,
      { numFmt:'0.00%', align:'right' });

    r++;

  });

}


/* =========================================================
   HOJA 4 — INSUMOS
   ========================================================= */

function xlHojaInsumos(wb, ctx){

  const { rec, cuadros, lineaNombre } = ctx;

  const items = [
    ['Cajas de preformas', 'cajasPreformas', 'Und'],
    ['Planchas de cartón', 'planchasCarton', 'Und'],
    ['Polietileno', 'polietilenoKg', 'kg'],
    ['Stretch film', 'stretchFilmKg', 'kg'],
    ['Cartón reciclado', 'cartonReciclado', 'Und'],
    ['Cartón real utilizado', 'cartonRealUtilizado', 'Und']
  ];

  const columnas = [{ h:'Insumo', w:30 }];

  cuadros.forEach(c => {
    columnas.push({
      h:`Cuadro ${c.numero}${c.marca ? '\n' + c.marca : ''}`,
      w:16, fmt:'#,##0.00'
    });
  });

  columnas.push({ h:'Total del turno', w:18, fmt:'#,##0.00' });
  columnas.push({ h:'Unidad', w:10, align:'center' });

  const nC = cuadros.length;
  const letraIni = 'B';
  const letraFin = xlLetra(1 + nC);

  xlHojaTabla(wb, ctx, {
    nombre:'Insumos',
    titulo:'CONSUMO DE INSUMOS — ' + lineaNombre,
    subtitulo:
      `Fecha: ${xlFechaTexto(rec.fecha)}  |  Turno: ${rec.turno || '—'}`,
    tab:XL.verde,
    columnas,
    filas:items.map(it => {

      const valores = cuadros.map(c => num(c.insumos?.[it[1]]));

      return [
        it[0],
        ...valores,
        r => xlFx(
          `SUM(${letraIni}${r}:${letraFin}${r})`,
          valores.reduce((a,v) => a + v, 0)
        ),
        it[2]
      ];

    })
  });

}


/* =========================================================
   HOJA 5 — PERSONAL
   ========================================================= */

function xlHojaPersonal(wb, ctx){

  const { rec, lineaNombre } = ctx;

  const personal = Array.isArray(rec.personal) && rec.personal.length
    ? rec.personal
    : PERSONAL_POSICIONES.map(p => ({ posicion:p, nombre:'', cargo:'' }));

  xlHojaTabla(wb, ctx, {
    nombre:'Personal',
    titulo:'PERSONAL DEL TURNO — ' + lineaNombre,
    subtitulo:
      `Fecha: ${xlFechaTexto(rec.fecha)}  |  Turno: ${rec.turno || '—'}`,
    tab:'7F3F98',
    columnas:[
      { h:'Posición', w:28 },
      { h:'Nombre y apellido', w:36 },
      { h:'Cargo', w:32 }
    ],
    filas:personal.map((p,i) => [
      p.posicion || PERSONAL_POSICIONES[i] || '',
      p.nombre || '',
      p.cargo || ''
    ])
  });

}


/* =========================================================
   HOJA 6 — HISTORIAL DE LA LÍNEA
   ========================================================= */

function xlHojaHistorial(wb, ctx){

  const { rec, all, lineaNombre } = ctx;

  const unicos = arr => Array.from(new Set(arr.filter(Boolean)));

  const filas = all.map(r => {

    const cs = xlCuadrosActivos(r);
    const x = calcDerived(r);

    return {
      id:r.id,
      fecha:xlFechaExcel(r.fecha),
      dia:r.diaJuliano || obtenerDiaDelAño(r.fecha) || '',
      semana:r.semana || obtenerSemana(r.fecha) || '',
      turno:r.turno || '',
      marcas:unicos(cs.map(c => c.marca)).join(', '),
      lotes:unicos(cs.map(c => c.lote)).join(', '),
      prog:num(x.programada),
      efec:num(x.efectiva),
      hEf:num(x.horasEfectivas),
      disp:num(x.disponibilidad),
      rend:num(x.rendimiento),
      cal:num(x.calidad),
      oee:num(x.oee),
      paradas:(num(x.pProg) + num(x.pNoProg)) * 60,
      usuario:r.registradoPor || ''
    };

  });

  const resaltar = new Set();

  filas.forEach((f,i) => {
    if(f.id && f.id === rec.id){
      resaltar.add(i);
    }
  });

  const suma = k => filas.reduce((a,f) => a + f[k], 0);

  const ponderado = k => {
    const h = suma('hEf');
    return h > 0
      ? filas.reduce((a,f) => a + f[k] * f.hEf, 0) / h
      : 0;
  };

  const res = xlHojaTabla(wb, ctx, {
    nombre:'Historial línea',
    titulo:'HISTORIAL DE PRODUCCIÓN — ' + lineaNombre,
    subtitulo:
      `${filas.length} registro(s)  |  ` +
      'El registro exportado aparece resaltado en amarillo  |  ' +
      'Disp., Rend., Calidad y OEE del total: promedio ponderado por horas efectivas',
    tab:XL.celeste,
    columnas:[
      { h:'Fecha', w:12, fmt:'dd/mm/yyyy', align:'center' },
      { h:'Día juliano', w:9, align:'center' },
      { h:'Semana', w:9, align:'center' },
      { h:'Turno', w:10, align:'center' },
      { h:'Marca(s)', w:26 },
      { h:'Lote(s)', w:22 },
      { h:'Prod. programada', w:16, fmt:'#,##0' },
      { h:'Prod. efectiva', w:16, fmt:'#,##0' },
      { h:'Cumplim.', w:11, fmt:'0.0%' },
      { h:'Horas efect.', w:11, fmt:'0.0' },
      { h:'Disponib.', w:11, fmt:'0.0%' },
      { h:'Rendim.', w:11, fmt:'0.0%' },
      { h:'Calidad', w:11, fmt:'0.0%' },
      { h:'OEE', w:11, fmt:'0.0%' },
      { h:'Paradas (min)', w:12, fmt:'#,##0' },
      { h:'Registrado por', w:26 }
    ],
    filas:filas.length
      ? filas.map(f => [
          f.fecha, f.dia, f.semana, f.turno, f.marcas, f.lotes,
          f.prog, f.efec,
          r => xlFx(`IF(G${r}>0,H${r}/G${r},0)`,
            f.prog > 0 ? f.efec / f.prog : 0),
          f.hEf, f.disp, f.rend, f.cal, f.oee, f.paradas, f.usuario
        ])
      : [['', '', '', '', 'Sin registros', '', 0, 0, 0, 0, 0, 0, 0, 0, 0, '']],
    resaltar,
    total:(r0, r1, rt) => {

      const sp = (col, k) => xlFx(
        `SUM(${col}${r0}:${col}${r1})`, suma(k)
      );

      const pond = (col, k) => xlFx(
        `IF(J${rt}>0,SUMPRODUCT(${col}${r0}:${col}${r1},J${r0}:J${r1})/J${rt},0)`,
        ponderado(k)
      );

      return [
        'TOTAL / PROMEDIO', '', '', '', '', '',
        sp('G', 'prog'),
        sp('H', 'efec'),
        xlFx(`IF(G${rt}>0,H${rt}/G${rt},0)`,
          suma('prog') > 0 ? suma('efec') / suma('prog') : 0),
        sp('J', 'hEf'),
        pond('K', 'disp'),
        pond('L', 'rend'),
        pond('M', 'cal'),
        pond('N', 'oee'),
        sp('O', 'paradas'),
        ''
      ];

    }
  });

  xlSemaforoCF(res.ws, `K${res.r0}:N${res.rt}`);

}


/* =========================================================
   HOJA 7 — RESUMEN DE LÍNEAS (ACUMULADO)
   ========================================================= */

function xlEstadisticasLinea(regs){

  let hTurno = 0, hEf = 0, efec = 0;
  let oeeH = 0, rendH = 0, calH = 0;

  regs.forEach(r => {

    const x = calcDerived(r);
    const h = num(x.horasEfectivas);

    hTurno += num(x.horasTurno ?? r.horasTurno);
    hEf += h;
    efec += num(x.efectiva ?? r.produccion?.efectiva);

    oeeH += num(x.oee) * h;
    rendH += num(x.rendimiento) * h;
    calH += num(x.calidad) * h;

  });

  return {
    registros:regs.length,
    hEf,
    efec,
    disp:hTurno > 0 ? hEf / hTurno : 0,
    rend:hEf > 0 ? rendH / hEf : 0,
    cal:hEf > 0 ? calH / hEf : 0,
    oee:hEf > 0 ? oeeH / hEf : 0
  };

}

function xlHojaResumenLineas(wb, ctx){

  const registros = loadRecords();

  registros.forEach(r => normalizarCuadros(r));

  const fechas = registros.map(r => r.fecha).filter(Boolean).sort();
  const ref = fechas.length ? fechas[fechas.length - 1] : '';

  const desde = dias => {

    if(!ref){
      return '';
    }

    const f = new Date(ref + 'T00:00:00');

    f.setDate(f.getDate() - (dias - 1));

    return f.getFullYear() + '-' +
      String(f.getMonth() + 1).padStart(2, '0') + '-' +
      String(f.getDate()).padStart(2, '0');

  };

  const d7 = desde(7);
  const d30 = desde(30);

  const filas = LINES.map(line => {

    const regs = registros
      .filter(r => r.linea === line.key)
      .sort((a,b) => (a.fecha || '').localeCompare(b.fecha || ''));

    const st = xlEstadisticasLinea(regs);

    return {
      linea:line.name,
      st,
      primera:regs.length ? regs[0].fecha : '',
      ultima:regs.length ? regs[regs.length - 1].fecha : '',
      oee7:xlEstadisticasLinea(regs.filter(r => r.fecha >= d7)),
      oee30:xlEstadisticasLinea(regs.filter(r => r.fecha >= d30))
    };

  });

  const todos = xlEstadisticasLinea(registros);

  const res = xlHojaTabla(wb, ctx, {
    nombre:'Resumen líneas',
    titulo:'RESUMEN ACUMULADO POR LÍNEA',
    subtitulo:
      `Datos hasta ${xlFechaTexto(ref) || '—'}  |  ` +
      'Promedios ponderados por horas efectivas  |  ' +
      'Últimos 7 / 30 días contados hasta la última fecha registrada',
    tab:XL.azul,
    columnas:[
      { h:'Línea', w:14 },
      { h:'Registros', w:11, fmt:'#,##0', align:'center' },
      { h:'Primer registro', w:15, fmt:'dd/mm/yyyy', align:'center' },
      { h:'Último registro', w:15, fmt:'dd/mm/yyyy', align:'center' },
      { h:'Prod. efectiva acumulada', w:20, fmt:'#,##0' },
      { h:'Horas efectivas', w:14, fmt:'#,##0.0' },
      { h:'Disponib.', w:12, fmt:'0.0%' },
      { h:'Rendim.', w:12, fmt:'0.0%' },
      { h:'Calidad', w:12, fmt:'0.0%' },
      { h:'OEE histórico', w:14, fmt:'0.0%' },
      { h:'OEE últimos 7 días', w:16, fmt:'0.0%' },
      { h:'OEE últimos 30 días', w:17, fmt:'0.0%' }
    ],
    filas:filas.map(f => [
      f.linea,
      f.st.registros,
      xlFechaExcel(f.primera) || '—',
      xlFechaExcel(f.ultima) || '—',
      f.st.efec,
      f.st.hEf,
      f.st.registros ? f.st.disp : '—',
      f.st.registros ? f.st.rend : '—',
      f.st.registros ? f.st.cal : '—',
      f.st.registros ? f.st.oee : '—',
      f.oee7.registros ? f.oee7.oee : '—',
      f.oee30.registros ? f.oee30.oee : '—'
    ]),
    total:() => [
      'TODAS LAS LÍNEAS',
      todos.registros,
      '', '',
      todos.efec,
      todos.hEf,
      todos.disp,
      todos.rend,
      todos.cal,
      todos.oee,
      '', ''
    ]
  });

  xlSemaforoCF(res.ws, `G${res.r0}:L${res.rt}`);

  const dataLineas = xlGraficoBarras({
    titulo:'OEE histórico por línea',
    ancho:640,
    alto:300,
    filas:filas
      .filter(f => f.st.registros > 0)
      .map(f => ({
        etiqueta:f.linea,
        valor:f.st.oee,
        color:'#' + (
          f.st.oee >= 0.85 ? XL.verde
            : f.st.oee >= 0.60 ? XL.amarillo
            : XL.rojo
        ),
        texto:(f.st.oee * 100).toFixed(1) + ' %'
      }))
  });

  xlAgregarImagen(
    wb, res.ws, dataLineas,
    0.1, (res.rt || res.r1) + 2, 640, 300
  );

}


/* =========================================================
   DESCARGA
   ========================================================= */

/* =========================================================
   COLOR SEMÁFORO CONTRA UNA META DINÁMICA (versión Excel)
   ========================================================= */

function xlColorSegunMeta(valor, meta){
  const v = num(valor);
  if(v >= meta) return XL.verdeClaro;
  if(v >= meta * 0.85) return XL.amarilloClaro;
  return XL.rojoClaro;
}

/*
   Misma lógica, pero con los colores "fuertes" de la paleta
   (no la versión clara de relleno) — para el gauge y para
   los íconos de estado junto a cada KPI de la portada.
*/
function xlColorFuerteSegunMeta(valor, meta){
  const v = num(valor);
  if(v >= meta) return XL.verde;
  if(v >= meta * 0.85) return XL.amarillo;
  return XL.rojo;
}

/*
   Ícono de estado (✓ / ⚠ / ✕) para que la portada siga
   siendo legible si se imprime o se ve en blanco y negro.
*/
function xlIconoSegunMeta(valor, meta){
  const v = num(valor);
  if(v >= meta) return '✓';
  if(v >= meta * 0.85) return '⚠';
  return '✕';
}


/* =========================================================
   TURNO ANTERIOR DE LA MISMA LÍNEA
   =========================================================

   'all' ya viene ordenado de más antiguo a más reciente
   (obtenerRegistroExportacion). Se busca el registro
   inmediatamente anterior al que se está exportando.
   ========================================================= */

function xlTurnoAnterior(rec, all){

  const idx = (all || []).findIndex(r => r.id === rec.id);

  if(idx > 0){
    return all[idx - 1];
  }

  return null;

}


/* =========================================================
   CONCLUSIONES AUTOMÁTICAS DEL TURNO
   ========================================================= */

function generarConclusionesTurno(d, dPrev){

  const txt = [];

  txt.push(
    d.oee >= METAS.oee
      ? `El turno cumplió la meta de OEE (${pct(d.oee)} vs. meta ${pct(METAS.oee)}).`
      : `El turno quedó por debajo de la meta de OEE: ${pct(d.oee)} vs. meta ${pct(METAS.oee)}.`
  );

  txt.push(
    d.cumplimiento >= 1
      ? `Se cumplió o superó lo programado (${pct(d.cumplimiento)} de la producción programada).`
      : `Se alcanzó ${pct(d.cumplimiento)} de la producción programada.`
  );

  const mayorPerdida =
    d.disponibilidad <= d.rendimiento && d.disponibilidad <= d.calidad
      ? 'disponibilidad (paradas)'
      : (d.rendimiento <= d.calidad ? 'rendimiento (velocidad)' : 'calidad (rechazos)');

  txt.push(`El componente con mayor oportunidad de mejora en el turno es ${mayorPerdida}.`);

  if(dPrev){

    const deltaOEE = (d.oee - dPrev.oee) * 100;
    const deltaProd =
      num(dPrev.efectiva) > 0
        ? ((num(d.efectiva) - num(dPrev.efectiva)) / num(dPrev.efectiva)) * 100
        : null;

    txt.push(
      `OEE ${deltaOEE >= 0 ? '▲' : '▼'} ${xlN1(Math.abs(deltaOEE))} pts vs. el turno anterior de esta línea` +
      (deltaProd !== null
        ? `, producción ${deltaProd >= 0 ? '▲' : '▼'} ${xlN1(Math.abs(deltaProd))} %.`
        : '.')
    );

  }

  return txt;

}


/* =========================================================
   HOJA — PORTADA EJECUTIVA (PRIMERA HOJA DEL LIBRO)
   ========================================================= */

function xlHojaPortadaEjecutiva(wb, ctx){

  const { rec, all, d, lineaNombre, usuario, generado } = ctx;

  const cascada = calcCascada(rec);

  const ws = wb.addWorksheet('Portada', { views:[{ showGridLines:false }] });

  ws.columns = [
    { width:3 }, { width:24 }, { width:18 }, { width:18 }, { width:18 }, { width:3 }
  ];

  if(typeof GLACIAL_LOGO_BASE64 !== 'undefined'){
    try{
      const altoLogo = 42;
      const anchoLogo = Math.round(altoLogo * GLACIAL_LOGO_RATIO);
      const idLogo = wb.addImage({ base64:GLACIAL_LOGO_BASE64, extension:'png' });
      ws.addImage(idLogo, { tl:{ col:3.8, row:0.2 }, ext:{ width:anchoLogo, height:altoLogo } });
    } catch(e){
      console.warn('No se pudo insertar el logo:', e);
    }
  }

  let fila = 2;

  ws.mergeCells(`B${fila}:E${fila}`);
  ws.getCell(`B${fila}`).value = 'GLACIAL — Reporte Diario de Producción';
  ws.getCell(`B${fila}`).font = xlFont({ size:15, bold:true, color:XL.azul });
  fila += 1;

  ws.mergeCells(`B${fila}:E${fila}`);
  ws.getCell(`B${fila}`).value =
    `${lineaNombre} · ${xlFechaTexto(rec.fecha)} · Turno ${rec.turno}`;
  ws.getCell(`B${fila}`).font = xlFont({ size:11, color:XL.grisTexto });
  fila += 2;

  const kpis = [
    ['OEE del turno', pct(d.oee), METAS.oee, d.oee],
    ['Disponibilidad', pct(d.disponibilidad), METAS.disponibilidad, d.disponibilidad],
    ['Rendimiento', pct(d.rendimiento), METAS.rendimiento, d.rendimiento],
    ['Calidad', pct(d.calidad), METAS.calidad, d.calidad],
    ['Cumplimiento vs. programado', pct(d.cumplimiento), 1, d.cumplimiento],
    ['Producción efectiva', xlN(d.efectiva) + ' und.', null, null]
  ];

  const filaKpiInicio = fila;

  kpis.forEach((k, i) => {

    const col = 2 + (i % 2) * 2;
    const filaK = filaKpiInicio + Math.floor(i / 2) * 3;

    ws.mergeCells(filaK, col, filaK, col + 1);
    ws.getCell(filaK, col).value = k[0];
    ws.getCell(filaK, col).font = xlFont({ size:9, color:XL.grisTexto });

    ws.mergeCells(filaK + 1, col, filaK + 1, col + 1);
    const celda = ws.getCell(filaK + 1, col);

    /*
       Ícono de estado (✓/⚠/✕) delante del valor, además del
       color: así el KPI se entiende aunque se imprima o se
       lea en blanco y negro.
    */
    const valorTexto =
      k[2] !== null
        ? xlIconoSegunMeta(k[3], k[2]) + '  ' + k[1]
        : k[1];

    celda.value = valorTexto;
    celda.font = xlFont({
      size:15, bold:true,
      color: k[2] !== null ? xlColorFuerteSegunMeta(k[3], k[2]) : XL.azul
    });

    if(k[2] !== null){
      const fill = xlColorSegunMeta(k[3], k[2]);
      for(let c = col; c <= col + 1; c++){
        ws.getCell(filaK, c).fill = xlFill(fill);
        ws.getCell(filaK + 1, c).fill = xlFill(fill);
      }
    }

  });

  fila = filaKpiInicio + Math.ceil(kpis.length / 2) * 3 + 1;

  /* =====================================================
     ANILLO DE OEE + CASCADA DE PÉRDIDAS (MINIATURA)
     =====================================================

     Mismo truco de "dibujar en canvas e insertar como
     imagen" que ya se usa en xlGraficoBarras: así la
     portada muestra de un vistazo el % de OEE y por qué
     quedó ahí, sin tener que abrir la hoja de detalle.
  ===================================================== */

  fila += 1;

  ws.mergeCells(`B${fila}:E${fila}`);
  ws.getCell(`B${fila}`).value = 'OEE del turno';
  ws.getCell(`B${fila}`).font = xlFont({ size:11, bold:true, color:XL.azul });
  fila += 1;

  const filaGraficosPortada = fila;

  const dataGauge = xlGraficoGaugeOEE({
    valor:d.oee,
    meta:METAS.oee,
    titulo:'OEE',
    ancho:210,
    alto:180
  });

  xlAgregarImagen(wb, ws, dataGauge, 0.9, filaGraficosPortada - 1 + 0.1, 210, 180);

  const dataCascadaMini = xlGraficoBarras({
    titulo:'Cascada de pérdidas (botellas)',
    ancho:330,
    alto:180,
    filas:[
      { etiqueta:'Capacidad teórica', valor:cascada.capacidadTeorica,
        color:'#' + XL.celeste,
        texto:xlN(cascada.capacidadTeorica) },
      { etiqueta:'− Paradas', valor:cascada.perdidaDisponibilidad,
        color:'#' + XL.rojo,
        texto:'− ' + xlN(cascada.perdidaDisponibilidad) },
      { etiqueta:'− Ritmo lento', valor:cascada.perdidaRendimiento,
        color:'#E69F00',
        texto:'− ' + xlN(cascada.perdidaRendimiento) },
      { etiqueta:'− Calidad', valor:cascada.perdidaCalidad,
        color:'#7F3F98',
        texto:'− ' + xlN(cascada.perdidaCalidad) },
      { etiqueta:'Producción buena', valor:cascada.buena,
        color:'#' + XL.verde,
        texto:xlN(cascada.buena) }
    ]
  });

  xlAgregarImagen(wb, ws, dataCascadaMini, 2.55, filaGraficosPortada - 1 + 0.1, 330, 180);

  /* Alto de fila estándar ≈ 20px: se saltan filas equivalentes
     a la altura de las imágenes (180px) para no pisar el texto
     de abajo. */
  fila = filaGraficosPortada + 10;

  const dPrev = (() => {
    const prev = xlTurnoAnterior(rec, all);
    return prev ? calcDerived(prev) : null;
  })();

  ws.mergeCells(`B${fila}:E${fila}`);
  ws.getCell(`B${fila}`).value = 'Conclusiones';
  ws.getCell(`B${fila}`).font = xlFont({ size:12, bold:true, color:XL.azul });
  fila += 1;

  generarConclusionesTurno(d, dPrev).forEach(txt => {
    ws.mergeCells(`B${fila}:E${fila}`);
    ws.getCell(`B${fila}`).value = '• ' + txt;
    ws.getCell(`B${fila}`).font = xlFont({ size:10 });
    ws.getCell(`B${fila}`).alignment = { wrapText:true };
    fila += 1;
  });

  fila += 1;
  ws.mergeCells(`B${fila}:E${fila}`);
  ws.getCell(`B${fila}`).value = generado + ' · ' + usuario;
  ws.getCell(`B${fila}`).font = xlFont({ size:8, italic:true, color:XL.grisTexto });

  /* =====================================================
     IMPRESIÓN: A4 vertical, ajustada a una sola página, con
     pie de página (fecha/usuario + línea + numeración).
  ===================================================== */

  fila += 2;

  ws.pageSetup = {
    orientation:'portrait',
    paperSize:9,
    fitToPage:true,
    fitToWidth:1,
    fitToHeight:1,
    horizontalCentered:true,
    printArea:`A1:F${fila}`,
    margins:{
      left:0.4, right:0.4, top:0.5, bottom:0.5,
      header:0.2, footer:0.25
    }
  };

  const esc = t => String(t || '').replace(/&/g, '&&');

  ws.headerFooter.oddFooter =
    `&L&8${esc(generado)} · ${esc(usuario)}` +
    `&C&8Página &P de &N` +
    `&R&8GLACIAL · ${esc(lineaNombre)}`;

}


/* =========================================================
   HOJA — DEFINICIONES Y METAS
   ========================================================= */

function xlHojaDefiniciones(wb, ctx){

  const ws = wb.addWorksheet('Definiciones y metas', { views:[{ showGridLines:false }] });

  ws.columns = [{ width:3 }, { width:30 }, { width:60 }, { width:3 }];

  let fila = 2;

  ws.mergeCells(`B${fila}:C${fila}`);
  ws.getCell(`B${fila}`).value = 'Cómo se calcula el OEE';
  ws.getCell(`B${fila}`).font = xlFont({ size:13, bold:true, color:XL.azul });
  fila += 2;

  const definiciones = [
    ['OEE', 'Disponibilidad × Rendimiento × Calidad. Mide qué tan bien se aprovechó el tiempo de turno para producir botellas/bidones/cajas conformes.'],
    ['Disponibilidad', 'Horas efectivas ÷ Horas de turno. Horas efectivas = horas de turno menos las paradas programadas y no programadas.'],
    ['Rendimiento', 'Producción efectiva ÷ Producción nominal. Producción nominal = ratio nominal (BPH) × horas efectivas.'],
    ['Calidad', '(Botellas sopladas − Botellas rechazadas) ÷ Botellas sopladas.'],
    ['Cumplimiento', 'Producción efectiva ÷ Producción programada.'],
    ['Merma', 'Unidades de merma (botellas, preformas, tapas, etiqueta, polietileno) sobre la producción efectiva del turno.']
  ];

  definiciones.forEach(([term, def]) => {
    ws.getCell(fila, 2).value = term;
    ws.getCell(fila, 2).font = xlFont({ bold:true });
    ws.getCell(fila, 3).value = def;
    ws.getCell(fila, 3).font = xlFont({});
    ws.getCell(fila, 3).alignment = { wrapText:true };
    fila += 1;
  });

  fila += 2;

  ws.mergeCells(`B${fila}:C${fila}`);
  ws.getCell(`B${fila}`).value = 'Metas de planta';
  ws.getCell(`B${fila}`).font = xlFont({ size:13, bold:true, color:XL.azul });
  fila += 1;

  [
    ['OEE', pct(METAS.oee)],
    ['Disponibilidad', pct(METAS.disponibilidad)],
    ['Rendimiento', pct(METAS.rendimiento)],
    ['Calidad', pct(METAS.calidad)],
    ['Merma (máximo aceptable)', pct(METAS.merma)]
  ].forEach(([term, val]) => {
    ws.getCell(fila, 2).value = term;
    ws.getCell(fila, 2).font = xlFont({});
    ws.getCell(fila, 3).value = val;
    ws.getCell(fila, 3).font = xlFont({ bold:true, color:XL.azul });
    fila += 1;
  });

}


async function exportarExcel(){

  const data = obtenerRegistroExportacion();

  if(!data){
    return;
  }

  const { rec, all } = data;

  try{

    const ExcelJS = await cargarScriptExterno(
      'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
      'ExcelJS'
    );

    if(!ExcelJS){
      throw new Error('ExcelJS no está disponible.');
    }

    /*
       Se normaliza ANTES de calcular: así el registro tiene sus
       4 cuadros y calcDerived() devuelve los totales del turno
       completo (no solo del primer cuadro).
    */

    const cuadros = xlCuadrosActivos(rec);
    const d = calcDerived(rec);

    const usuario =
      (state.user && (state.user.nombre || state.user.username)) || 'GLACIAL';

    const lineaNombre =
      (LINES.find(l => l.key === rec.linea) || {}).name || rec.linea || '';

    const ctx = {
      rec, all, d, cuadros, lineaNombre, usuario,
      generado:'Generado el ' + new Date().toLocaleString('es-PE')
    };

    const wb = new ExcelJS.Workbook();

    wb.creator = usuario;
    wb.lastModifiedBy = usuario;
    wb.created = new Date();
    wb.modified = new Date();
    wb.subject = 'Reporte Diario de Producción';
    wb.title = 'Reporte Diario de Producción GLACIAL — ' + lineaNombre;
    wb.company = 'GLACIAL';

    xlHojaPortadaEjecutiva(wb, ctx);
    xlHojaReporte(wb, ctx);
    xlHojaParadas(wb, ctx);
    xlHojaMermas(wb, ctx);
    xlHojaInsumos(wb, ctx);
    xlHojaPersonal(wb, ctx);
    xlHojaHistorial(wb, ctx);
    xlHojaResumenLineas(wb, ctx);
    xlHojaDefiniciones(wb, ctx);

    const fechaArchivo =
      nombreArchivoSeguro(
        rec.fecha || new Date().toISOString().slice(0,10)
      );

    const lineaArchivo =
      nombreArchivoSeguro(lineaNombre || rec.linea || state.currentLine);

    const turnoArchivo =
      nombreArchivoSeguro(rec.turno || 'turno');

    const buffer = await wb.xlsx.writeBuffer();

    descargarArchivo(
      new Blob([buffer], { type:XL_MIME }),
      `Reporte_Produccion_${lineaArchivo}_${fechaArchivo}_${turnoArchivo}.xlsx`
    );

  } catch(error){

    console.error(error);

    alert(
      'No se pudo generar el Excel con formato GLACIAL. ' +
      'Verifica tu conexión a internet e inténtalo nuevamente.'
    );

  }

}


function cargarImagenCanvas(src){

  return new Promise((resolve, reject) => {

    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;

  });

}


async function exportarPNG(){

  const data = obtenerRegistroExportacion();

  if(!data){
    return;
  }

  const { rec, d } = data;

  try{

    const ids = [
      'chart-oee',
      'chart-componentes',
      'chart-cascada',
      'chart-prod',
      'chart-paradas',
      'chart-mermas',
      'chart-insumos',
      'chart-tendencia',
      'chart-turno',
      'chart-marca'
    ];

    const imagenes = [];

    for(const id of ids){

      const chart = state.charts[
        id.replace('chart-', '')
      ];

      if(!chart){
        continue;
      }

      imagenes.push({
        id,
        img: await cargarImagenCanvas(chart.toBase64Image()),
        titulo: document
          .getElementById(id)
          ?.closest('.chart-box')
          ?.querySelector('h4')
          ?.innerText || ''
      });

    }

    const W = 1800;
    const headerH = 300;
    const boxW = 840;
    const boxH = 390;
    const gap = 40;
    const rows = Math.ceil(imagenes.length / 2);
    const H = headerH + rows * (boxH + gap) + gap;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#F5F7F9';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(40, 35, W - 80, headerH - 50);

    ctx.fillStyle = '#1F2933';
    ctx.font = 'bold 34px Arial';
    ctx.fillText('REPORTE DIARIO DE PRODUCCIÓN', 75, 85);

    ctx.font = '22px Arial';
    ctx.fillStyle = '#52606D';
    ctx.fillText(
      `${rec.linea || ''} · ${rec.fecha || ''} · ${rec.turno || ''} · Lote: ${rec.lote || '—'}`,
      75,
      125
    );

    const kpis = [
      ['OEE', `${(num(d.oee) * 100).toFixed(1)}%`],
      ['Disponibilidad', `${(num(d.disponibilidad) * 100).toFixed(1)}%`],
      ['Rendimiento', `${(num(d.rendimiento) * 100).toFixed(1)}%`],
      ['Calidad', `${(num(d.calidad) * 100).toFixed(1)}%`],
      ['Producción efectiva', `${num(rec.produccion?.efectiva).toLocaleString('es-PE')}`]
    ];

    const cardW = 315;
    const cardY = 165;
    const cardGap = 20;

    kpis.forEach((k, i) => {

      const x = 75 + i * (cardW + cardGap);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x, cardY, cardW, 85);

      ctx.strokeStyle = '#D9E2EC';
      ctx.strokeRect(x, cardY, cardW, 85);

      ctx.fillStyle = '#7B8794';
      ctx.font = '16px Arial';
      ctx.fillText(k[0], x + 15, cardY + 28);

      ctx.fillStyle = '#1F2933';
      ctx.font = 'bold 25px Arial';
      ctx.fillText(k[1], x + 15, cardY + 62);

    });

    for(let i = 0; i < imagenes.length; i++){

      const item = imagenes[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 40 + col * (boxW + gap);
      const y = headerH + gap + row * (boxH + gap);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x, y, boxW, boxH);

      ctx.strokeStyle = '#D9E2EC';
      ctx.strokeRect(x, y, boxW, boxH);

      ctx.fillStyle = '#1F2933';
      ctx.font = 'bold 20px Arial';
      ctx.fillText(item.titulo, x + 20, y + 32);

      const maxW = boxW - 40;
      const maxH = boxH - 65;
      const scale = Math.min(
        maxW / item.img.width,
        maxH / item.img.height
      );

      const iw = item.img.width * scale;
      const ih = item.img.height * scale;
      const ix = x + (boxW - iw) / 2;
      const iy = y + 45 + (maxH - ih) / 2;

      ctx.drawImage(item.img, ix, iy, iw, ih);

    }

    canvas.toBlob(blob => {

      if(!blob){
        alert('No se pudo generar la imagen PNG.');
        return;
      }

      const fecha = nombreArchivoSeguro(rec.fecha || new Date().toISOString().slice(0,10));
      const linea = nombreArchivoSeguro(rec.linea || state.currentLine);

      descargarArchivo(
        blob,
        `Dashboard_Produccion_${linea}_${fecha}.png`
      );

    }, 'image/png');

  }catch(error){

    console.error(error);

    alert('No se pudo generar el PNG. Verifica que los gráficos estén visibles e inténtalo nuevamente.');

  }

}


function renderGraficosTab(){

  const c =
    document.getElementById(
      'tab-content'
    );


  const all =

    loadRecords()

      .filter(
        r => r.linea === state.currentLine
      )

      .sort(
        (a,b) =>
          (a.timestamp || '')
            .localeCompare(
              b.timestamp || ''
            )
      );


  if(all.length === 0){

    c.innerHTML = `

      <div class="panel">

        <div class="empty-state">

          <h4>
            Aún no hay datos para graficar
          </h4>

          <p>
            Guarda al menos un registro
            en "Nuevo registro"
            para ver el tablero
            de esta línea.
          </p>

        </div>

      </div>

    `;

    return;

  }


  const rec =

    state.viewingRecordId

      ? all.find(
          r =>
            r.id ===
            state.viewingRecordId
        )

      : all[all.length - 1];


  if(!rec){

    return;

  }


  const d =
    calcDerived(rec);


  c.innerHTML = `

    <div
      class="main-head"
      style="margin-bottom:14px;"
    >

      <div class="sub">

        Mostrando registro del
        ${rec.fecha}

        · día juliano
        ${
          rec.diaJuliano ||
          obtenerDiaDelAño(rec.fecha)
        }

        · semana
        ${
          rec.semana ||
          obtenerSemana(rec.fecha)
        }

        · turno
        ${rec.turno}

        · lote
        <strong>
          ${rec.lote || '—'}
        </strong>

        ${
          state.viewingRecordId

            ? `
              <span class="small-muted">
                (seleccionado desde historial)
              </span>
            `

            : `
              <span class="small-muted">
                (último registro)
              </span>
            `
        }

      </div>

    </div>


    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:0 0 18px 0;">

      <button
        type="button"
        class="btn"
        onclick="exportarExcel()"
      >
        📊 Exportar Excel
      </button>

      <button
        type="button"
        class="btn"
        onclick="exportarPNG()"
      >
        🖼️ Exportar PNG
      </button>

    </div>


    <div class="chart-grid">


      <div class="chart-box">

        <h4>
          OEE del turno
        </h4>

        <div class="gauge-wrap">

          <canvas id="chart-oee">
          </canvas>

          <div class="gauge-num">

            <div class="v">
              ${pct(d.oee)}
            </div>

            <div class="l">
              OEE
            </div>

          </div>

        </div>

        <div
          style="text-align:center;font-size:12px;color:${
            d.oee >= METAS.oee ? PAL.verde : PAL.rojo
          };font-weight:600;margin-top:6px;"
        >
          Meta ${pct(METAS.oee)}
          ·
          ${
            d.oee >= METAS.oee
              ? 'meta cumplida'
              : (
                  Math.round((METAS.oee - d.oee) * 1000) / 10
                ) + ' pts por debajo'
          }
        </div>

      </div>


      <div class="chart-box">

        <h4>
          Componentes del OEE vs. meta
        </h4>

        <canvas id="chart-componentes">
        </canvas>

        <div
          class="small-muted"
          style="text-align:center;margin-top:6px;font-size:11px;"
        >
          OEE = Disponibilidad × Rendimiento × Calidad
        </div>

      </div>


      <div class="chart-box">

        <h4>
          ¿Dónde se perdió la producción? (cascada)
        </h4>

        <canvas id="chart-cascada">
        </canvas>

      </div>


      <div class="chart-box">

        <h4>
          Producción:
          nominal vs. programada vs. efectiva
        </h4>

        <canvas id="chart-prod">
        </canvas>

      </div>


      <div class="chart-box">

        <h4>
          Pareto de paradas (minutos por causa)
        </h4>

        <canvas id="chart-paradas">
        </canvas>

      </div>


      <div class="chart-box">

        <h4>
          Mermas por componente (% de producción)
        </h4>

        <canvas id="chart-mermas">
        </canvas>

      </div>


      <div class="chart-box">

        <h4>
          Consumo de insumos
        </h4>

        <canvas id="chart-insumos">
        </canvas>

      </div>


      <div class="chart-box">

        <div
          style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;"
        >

          <h4 style="margin:0;">
            Tendencia de OEE y producción efectiva
          </h4>

          <div style="display:flex;gap:4px;">

            ${
              [7,30,90].map(dias => `
                <button
                  type="button"
                  class="btn btn-sm ${
                    tendenciaRangoDias === dias
                      ? 'btn-primary'
                      : 'btn-ghost'
                  }"
                  onclick="cambiarRangoTendencia(${dias})"
                >
                  ${dias}d
                </button>
              `).join('')
            }

          </div>

        </div>

        <canvas id="chart-tendencia">
        </canvas>

      </div>


      <div class="chart-box">

        <h4>
          OEE por turno
        </h4>

        <canvas id="chart-turno">
        </canvas>

      </div>


      <div class="chart-box">

        <h4>
          OEE por marca
        </h4>

        <canvas id="chart-marca">
        </canvas>

      </div>


    </div>

  `;


  destroyCharts();


  const F = {

    family:'IBM Plex Sans',

    size:12

  };


  Chart.defaults.font = F;

  Chart.defaults.color =
    '#3A4551';


  /* =====================================================
     GAUGE DE OEE
     =====================================================

     OEE = Disponibilidad × Rendimiento × Calidad, así que
     el anillo muestra un solo valor (el OEE alcanzado
     contra el 100%), no la suma de los tres factores.
     El color cambia según qué tan lejos está de la meta.
  ===================================================== */

  const colorOee =
    colorSegunMeta(d.oee, METAS.oee);


  state.charts.oee =

    new Chart(

      document.getElementById(
        'chart-oee'
      ),

      {

        type:'doughnut',

        data:{

          labels:[
            'OEE alcanzado',
            'Pérdida total'
          ],

          datasets:[{

            data:[
              d.oee * 100,
              Math.max(0, 100 - d.oee * 100)
            ],

            backgroundColor:[
              colorOee,
              PAL.grisSuave
            ],

            borderWidth:0

          }]

        },

        options:{

          cutout:'72%',

          plugins:{

            legend:{
              display:false
            },

            tooltip:{

              callbacks:{

                label:ctx =>
                  ctx.label + ': ' +
                  (Math.round(ctx.parsed * 10) / 10) + '%'

              }

            }

          }

        }

      }

    );


  /* =====================================================
     COMPONENTES DEL OEE VS. META
  ===================================================== */

  const compValores = [
    d.disponibilidad * 100,
    d.rendimiento * 100,
    d.calidad * 100
  ];

  const compMetas = [
    METAS.disponibilidad * 100,
    METAS.rendimiento * 100,
    METAS.calidad * 100
  ];


  state.charts.componentes =

    new Chart(

      document.getElementById(
        'chart-componentes'
      ),

      {

        type:'bar',

        data:{

          labels:[
            'Disponibilidad',
            'Rendimiento',
            'Calidad'
          ],

          datasets:[

            {

              label:'Real',

              data:compValores,

              backgroundColor:
                compValores.map(
                  (v,i) =>
                    colorSegunMeta(
                      v / 100,
                      compMetas[i] / 100
                    )
                ),

              borderRadius:3,

              barPercentage:0.55

            },

            {

              label:'Meta',

              data:compMetas,

              type:'line',

              showLine:false,

              pointStyle:'line',

              pointRadius:14,

              pointBorderWidth:2,

              pointBorderColor:PAL.texto,

              pointRotation:90

            }

          ]

        },

        options:{

          indexAxis:'y',

          plugins:{

            legend:{

              position:'bottom',

              labels:{
                boxWidth:10,
                padding:10,
                usePointStyle:true
              }

            },

            tooltip:{

              callbacks:{

                label:ctx =>
                  ctx.dataset.label + ': ' +
                  (Math.round(ctx.parsed.x * 10) / 10) + '%'

              }

            }

          },

          scales:{

            x:{

              beginAtZero:true,

              max:100,

              grid:{
                color:'#EFF2F4'
              },

              ticks:{
                callback:v => v + '%'
              },

              title:{
                display:true,
                text:'% alcanzado'
              }

            },

            y:{

              grid:{
                display:false
              }

            }

          }

        }

      }

    );


  /* =====================================================
     CASCADA DE PÉRDIDAS (WATERFALL)
  ===================================================== */

  const casc = calcCascada(rec);

  /*
     Cada barra se dibuja como un rango [desde, hasta] para
     que las pérdidas "cuelguen" desde la capacidad teórica
     hasta la producción buena.
  */

  const p1 = casc.capacidadTeorica;
  const p2 = p1 - casc.perdidaDisponibilidad;
  const p3 = p2 - casc.perdidaRendimiento;
  const p4 = p3 - casc.perdidaCalidad;

  const cascadaValores = [
    [0, p1],
    [p2, p1],
    [p3, p2],
    [p4, p3],
    [0, Math.max(casc.buena, 0)]
  ];

  const cascadaMagnitudes = [
    casc.capacidadTeorica,
    casc.perdidaDisponibilidad,
    casc.perdidaRendimiento,
    casc.perdidaCalidad,
    casc.buena
  ];


  state.charts.cascada =

    new Chart(

      document.getElementById(
        'chart-cascada'
      ),

      {

        type:'bar',

        data:{

          labels:[
            'Capacidad teórica',
            '− Paradas',
            '− Ritmo lento',
            '− Calidad',
            'Producción buena'
          ],

          datasets:[{

            data:cascadaValores,

            backgroundColor:[
              PAL.gris,
              PAL.rojo,
              PAL.ambar,
              PAL.azulSuave,
              PAL.verde
            ],

            borderRadius:3,

            barPercentage:0.65

          }]

        },

        options:{

          plugins:{

            legend:{
              display:false
            },

            valorBarra:{

              activo:true,

              formato:(v,i) =>
                formatearNumero(cascadaMagnitudes[i])

            },

            tooltip:{

              callbacks:{

                label:ctx => {

                  const i = ctx.dataIndex;

                  const magnitud =
                    formatearNumero(cascadaMagnitudes[i]);

                  const pctSobreTeorica =
                    casc.capacidadTeorica > 0
                      ? Math.round(
                          (cascadaMagnitudes[i] /
                            casc.capacidadTeorica) * 1000
                        ) / 10
                      : 0;

                  return (
                    magnitud + ' unidades (' +
                    pctSobreTeorica + '% de la capacidad)'
                  );

                }

              }

            }

          },

          scales:{

            x:{

              grid:{
                display:false
              },

              ticks:{
                maxRotation:0,
                autoSkip:false,
                font:{ size:10 }
              }

            },

            y:{

              beginAtZero:true,

              grid:{
                color:'#EFF2F4'
              },

              ticks:{
                callback:v => formatearNumero(v)
              },

              title:{
                display:true,
                text:'Unidades'
              }

            }

          }

        }

      }

    );


  /* =====================================================
     PRODUCCIÓN: NOMINAL VS. PROGRAMADA VS. EFECTIVA
     =====================================================

     Suma los 4 cuadros (antes solo leía el cuadro 1).
  ===================================================== */

  const prodNominal = num(d.produccionNominal);

  const prodProgramada =
    num(d.programada ?? rec.produccion?.programada);

  const prodEfectiva =
    num(d.efectiva ?? rec.produccion?.efectiva);


  state.charts.prod =

    new Chart(

      document.getElementById(
        'chart-prod'
      ),

      {

        type:'bar',

        data:{

          labels:[

            'Nominal',

            'Programada',

            'Efectiva'

          ],

          datasets:[{

            data:[
              prodNominal,
              prodProgramada,
              prodEfectiva
            ],

            backgroundColor:[
              PAL.gris,
              PAL.ambar,
              PAL.verde
            ],

            borderRadius:3,

            barPercentage:0.55

          }]

        },

        options:{

          /*
             Espacio arriba del gráfico para que la etiqueta de
             la barra más alta no se corte contra el borde.
          */

          layout:{
            padding:{ top:24 }
          },

          plugins:{

            legend:{
              display:false
            },

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

              /* ~18 % de holgura sobre la barra más alta. */

              suggestedMax:
                Math.max(prodNominal, prodProgramada, prodEfectiva) > 0
                  ? Math.max(prodNominal, prodProgramada, prodEfectiva) * 1.18
                  : undefined,

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
     PARETO DE PARADAS
     =====================================================

     Ordena las causas de mayor a menor tiempo perdido y
     dibuja encima la curva de % acumulado, para ver de un
     vistazo qué pocas causas explican la mayor parte del
     tiempo perdido. Se toman las paradas de todos los
     cuadros del registro, no solo del primero.
  ===================================================== */

  const paradasAgrupadas = agruparParadas(rec);

  /* Se muestran las 10 causas principales para que se lea bien. */

  const paretoFilas =
    paradasAgrupadas.filas.slice(0, 10);


  if(!paretoFilas.length){

    const canvasParadas =
      document.getElementById('chart-paradas');

    if(canvasParadas){

      canvasParadas.closest('.chart-box').innerHTML += `
        <div class="small-muted" style="text-align:center;padding:20px 0;">
          Sin paradas registradas en este turno.
        </div>
      `;

      canvasParadas.style.display = 'none';

    }

  } else {

    state.charts.paradas =

      new Chart(

        document.getElementById(
          'chart-paradas'
        ),

        {

          data:{

            labels:
              paretoFilas.map(f => f.descripcion),

            datasets:[

              {

                type:'bar',

                label:'Minutos perdidos',

                data:
                  paretoFilas.map(f => f.minutos),

                backgroundColor:
                  paretoFilas.map(
                    f =>
                      f.tipo === 'Programada'
                        ? PAL.azul
                        : PAL.rojo
                  ),

                borderRadius:3,

                order:2

              },

              {

                type:'line',

                label:'% acumulado',

                data:
                  paretoFilas.map(f => f.acumuladoPct),

                yAxisID:'y2',

                borderColor:PAL.ambar,

                backgroundColor:PAL.ambar,

                borderWidth:2,

                pointRadius:3,

                tension:0.2,

                order:1

              }

            ]

          },

          options:{

            plugins:{

              legend:{

                position:'bottom',

                labels:{
                  boxWidth:10,
                  padding:10,
                  usePointStyle:true
                }

              },

              /* Regla 80/20: referencia sobre la curva acumulada. */
              metaLine:{
                valor:80,
                eje:'y2',
                texto:'80%',
                color:PAL.texto
              },

              tooltip:{

                callbacks:{

                  label:ctx => {

                    if(ctx.dataset.yAxisID === 'y2'){

                      return (
                        'Acumulado: ' +
                        Math.round(ctx.parsed.y) + '%'
                      );

                    }

                    const fila =
                      paretoFilas[ctx.dataIndex];

                    return (
                      fila.tipo + ': ' +
                      formatearNumero(fila.minutos) + ' min'
                    );

                  }

                }

              }

            },

            scales:{

              x:{

                grid:{
                  display:false
                },

                ticks:{
                  maxRotation:38,
                  minRotation:0,
                  autoSkip:false,
                  font:{ size:10 },

                  callback:function(v){

                    const t =
                      this.getLabelForValue(v);

                    return t.length > 18
                      ? t.slice(0,17) + '…'
                      : t;

                  }

                }

              },

              y:{

                beginAtZero:true,

                grid:{
                  color:'#EFF2F4'
                },

                title:{
                  display:true,
                  text:'Minutos'
                }

              },

              y2:{

                position:'right',

                beginAtZero:true,

                max:100,

                grid:{
                  display:false
                },

                ticks:{
                  callback:v => v + '%'
                }

              }

            }

          }

        }

      );

  }


  /*
     Total de minutos perdidos, mostrado bajo el Pareto para
     dar contexto al gráfico.
  */

  const canvasParetoBox =
    document.getElementById('chart-paradas')
      ?.closest('.chart-box');

  if(canvasParetoBox && paradasAgrupadas.total > 0){

    const resumen = document.createElement('div');

    resumen.className = 'small-muted';

    resumen.style.cssText =
      'text-align:center;margin-top:6px;font-size:11px;';

    const top3 =
      paradasAgrupadas.filas.slice(0,3)
        .reduce((a,f) => a + f.minutos, 0);

    resumen.textContent =
      'Total perdido: ' +
      formatearNumero(paradasAgrupadas.total) +
      ' min · las 3 causas principales explican ' +
      Math.round(
        (top3 / paradasAgrupadas.total) * 100
      ) + '%';

    canvasParetoBox.appendChild(resumen);

  }


  /* =====================================================
     MERMAS POR COMPONENTE, EN % DE LA PRODUCCIÓN EFECTIVA
     =====================================================

     Suma los 4 cuadros. 500 botellas de merma significan
     algo distinto en un turno de 20 000 que en uno de
     90 000, así que la barra mide % sobre la producción
     efectiva total (las unidades quedan en el tooltip y en
     la etiqueta sobre la barra).
  ===================================================== */

  const mermasAgrupadas = agruparMermas(rec);

  const efectivaParaMermas =
    num(d.efectiva ?? rec.produccion?.efectiva);

  const mermaPct = f =>
    efectivaParaMermas > 0
      ? (f.unidades / efectivaParaMermas) * 100
      : 0;


  if(!mermasAgrupadas.filas.length){

    const canvasMermas =
      document.getElementById('chart-mermas');

    if(canvasMermas){

      canvasMermas.style.display = 'none';

      canvasMermas.closest('.chart-box').innerHTML += `
        <div class="small-muted" style="text-align:center;padding:20px 0;">
          Sin mermas registradas en este turno.
        </div>
      `;

    }

  } else {

    state.charts.mermas =

      new Chart(

        document.getElementById(
          'chart-mermas'
        ),

        {

          type:'bar',

          data:{

            labels:
              mermasAgrupadas.filas.map(f => f.item),

            datasets:[{

              label:'% de producción',

              data:
                mermasAgrupadas.filas.map(mermaPct),

              backgroundColor:PAL.ambar,

              borderRadius:3,

              barPercentage:0.6

            }]

          },

          options:{

            indexAxis:'y',

            plugins:{

              legend:{
                display:false
              },

              valorBarra:{

                activo:true,

                formato:(v,i) =>
                  (Math.round(v * 10) / 10) + '% (' +
                  formatearNumero(mermasAgrupadas.filas[i].unidades) +
                  ')'

              },

              tooltip:{

                callbacks:{

                  label:ctx => {

                    const fila =
                      mermasAgrupadas.filas[ctx.dataIndex];

                    return (
                      formatearNumero(fila.unidades) +
                      ' unidades (' +
                      (Math.round(mermaPct(fila) * 10) / 10) +
                      '% de la producción)'
                    );

                  }

                }

              }

            },

            scales:{

              x:{

                beginAtZero:true,

                grid:{ color:'#EFF2F4' },

                ticks:{ callback:v => v + '%' },

                title:{
                  display:true,
                  text:'% de producción efectiva'
                }

              },

              y:{
                grid:{ display:false }
              }

            }

          }

        }

      );


    /* Merma total del turno, contra la meta de planta. */

    const totalMermaPct =
      efectivaParaMermas > 0
        ? (mermasAgrupadas.totalUnidades / efectivaParaMermas) * 100
        : 0;

    const metaMermaPct = METAS.merma * 100;

    const colorTotalMerma =
      totalMermaPct <= metaMermaPct
        ? PAL.verde
        : (
            totalMermaPct <= metaMermaPct * 1.15
              ? PAL.ambar
              : PAL.rojo
          );

    const cajaMermas =
      document.getElementById('chart-mermas')
        ?.closest('.chart-box');

    if(cajaMermas){

      const resumen = document.createElement('div');

      resumen.style.cssText =
        'text-align:center;margin-top:6px;font-size:11px;font-weight:600;';

      resumen.style.color = colorTotalMerma;

      resumen.textContent =
        'Merma total: ' +
        (Math.round(totalMermaPct * 10) / 10) +
        '% de la producción (meta ≤ ' +
        (Math.round(metaMermaPct * 10) / 10) + '%)';

      cajaMermas.appendChild(resumen);

    }

  }


  /* =====================================================
     CONSUMO DE INSUMOS (SUMA DE LOS 4 CUADROS)
  ===================================================== */

  const insumosAgrupados = agruparInsumos(rec);


  state.charts.insumos =

    new Chart(

      document.getElementById(
        'chart-insumos'
      ),

      {

        type:'bar',

        data:{

          labels:[

            'Cajas preformas',

            'Planchas cartón',

            'Polietileno (kg)',

            'Stretch film (kg)',

            'Cartón reciclado',

            'Cartón real utilizado'

          ],

          datasets:[{

            data:[

              insumosAgrupados.cajasPreformas,

              insumosAgrupados.planchasCarton,

              insumosAgrupados.polietilenoKg,

              insumosAgrupados.stretchFilmKg,

              insumosAgrupados.cartonReciclado,

              insumosAgrupados.cartonRealUtilizado

            ],

            backgroundColor:PAL.azul,

            borderRadius:3,

            barPercentage:0.55

          }]

        },

        options:{

          plugins:{

            legend:{
              display:false
            },

            valorBarra:{
              activo:true
            },

            tooltip:{

              callbacks:{

                label:ctx =>
                  formatearNumero(ctx.parsed.y)

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
     TENDENCIA: UN PUNTO POR DÍA, RANGO SELECCIONABLE,
     PROMEDIO MÓVIL DE 7 DÍAS
     =====================================================

     - Se agrupa por día (si hubo turno día + noche el mismo
       día, se combinan ponderando por horas efectivas).
     - El promedio móvil se calcula sobre TODO el historial
       y luego se recorta al rango visible, para que el
       primer punto visible ya tenga una ventana completa
       de 7 días hacia atrás (no arranca "en frío").
     - El rango (7/30/90 días) se cuenta hacia atrás desde
       la fecha del registro más reciente de esta línea, no
       desde la fecha de hoy.
  ===================================================== */

  const serieDiariaCompleta = agruparPorDia(all);

  const promedioMovilCompleto =
    calcularPromedioMovil(serieDiariaCompleta, 7);

  const mapaPromedioMovil = {};

  serieDiariaCompleta.forEach((p,i) => {
    mapaPromedioMovil[p.fecha] = promedioMovilCompleto[i];
  });


  const fechaMasReciente =
    serieDiariaCompleta.length
      ? serieDiariaCompleta[serieDiariaCompleta.length - 1].fecha
      : null;

  let serieVisible = serieDiariaCompleta;

  if(fechaMasReciente){

    const limite =
      new Date(fechaMasReciente + 'T00:00:00');

    limite.setDate(
      limite.getDate() - (tendenciaRangoDias - 1)
    );

    serieVisible =
      serieDiariaCompleta.filter(
        p => new Date(p.fecha + 'T00:00:00') >= limite
      );

  }


  state.charts.tendencia =

    new Chart(

      document.getElementById(
        'chart-tendencia'
      ),

      {

        data:{

          labels:
            serieVisible.map(p => p.fecha),

          datasets:[

            {

              type:'bar',

              label:'OEE diario',

              data:
                serieVisible.map(p => p.oee * 100),

              backgroundColor:'#F2D9A8',

              yAxisID:'y',

              order:3,

              barPercentage:0.6

            },

            {

              type:'line',

              label:'Promedio móvil 7 días',

              data:
                serieVisible.map(
                  p => {
                    const v = mapaPromedioMovil[p.fecha];
                    return v === null || v === undefined
                      ? null
                      : v * 100;
                  }
                ),

              borderColor:PAL.ambar,

              backgroundColor:PAL.ambar,

              yAxisID:'y',

              tension:0.25,

              pointRadius:2,

              borderWidth:2,

              spanGaps:true,

              order:1

            },

            {

              type:'line',

              label:'Producción efectiva',

              data:
                serieVisible.map(p => p.efectiva),

              borderColor:PAL.azul,

              backgroundColor:PAL.azul,

              yAxisID:'y1',

              tension:0.25,

              pointRadius:2,

              borderWidth:1.5,

              order:2

            }

          ]

        },

        options:{

          plugins:{

            legend:{

              position:'bottom',

              labels:{
                boxWidth:10,
                padding:10,
                usePointStyle:true
              }

            },

            metaLine:{
              valor:METAS.oee * 100,
              eje:'y',
              texto:'Meta OEE ' + pct(METAS.oee),
              color:PAL.rojo
            },

            tooltip:{

              callbacks:{

                label:ctx =>
                  ctx.dataset.yAxisID === 'y'
                    ? ctx.dataset.label + ': ' +
                      (Math.round(ctx.parsed.y * 10) / 10) + '%'
                    : 'Efectiva: ' +
                      formatearNumero(ctx.parsed.y)

              }

            }

          },

          scales:{

            x:{
              grid:{ display:false }
            },

            y:{

              position:'left',

              min:0,

              max:100,

              grid:{ color:'#EFF2F4' },

              ticks:{ callback:v => v + '%' },

              title:{
                display:true,
                text:'OEE %'
              }

            },

            y1:{

              position:'right',

              beginAtZero:true,

              grid:{
                drawOnChartArea:false
              },

              ticks:{
                callback:v => formatearNumero(v)
              },

              title:{
                display:true,
                text:'Botellas'
              }

            }

          }

        }

      }

    );


  /* =====================================================
     OEE POR TURNO (TODO EL HISTORIAL DE LA LÍNEA)
  ===================================================== */

  const porTurno = agruparOEEPorTurno(all);


  if(!porTurno.length){

    const cajaTurno =
      document.getElementById('chart-turno')?.closest('.chart-box');

    if(cajaTurno){

      cajaTurno.querySelector('canvas').style.display = 'none';

      cajaTurno.innerHTML += `
        <div class="small-muted" style="text-align:center;padding:20px 0;">
          Aún no hay suficiente historial para comparar por turno.
        </div>
      `;

    }

  } else {

    state.charts.turno =

      new Chart(

        document.getElementById('chart-turno'),

        {

          type:'bar',

          data:{

            labels:
              porTurno.map(x => x.etiqueta),

            datasets:[{

              label:'OEE',

              data:
                porTurno.map(x => x.oee * 100),

              backgroundColor:
                porTurno.map(
                  x => colorSegunMeta(x.oee, METAS.oee)
                ),

              borderRadius:3,

              barPercentage:0.45

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

                    const x = porTurno[ctx.dataIndex];

                    return (
                      (Math.round(x.oee * 1000) / 10) +
                      '% · ' + Math.round(x.horas) +
                      ' h efectivas acumuladas'
                    );

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

  }


  /* =====================================================
     OEE POR MARCA (TODO EL HISTORIAL DE LA LÍNEA)
  ===================================================== */

  const porMarca = agruparOEEPorMarca(all);


  if(!porMarca.length){

    const cajaMarca =
      document.getElementById('chart-marca')?.closest('.chart-box');

    if(cajaMarca){

      cajaMarca.querySelector('canvas').style.display = 'none';

      cajaMarca.innerHTML += `
        <div class="small-muted" style="text-align:center;padding:20px 0;">
          Aún no hay suficiente historial para comparar por marca.
        </div>
      `;

    }

  } else {

    state.charts.marca =

      new Chart(

        document.getElementById('chart-marca'),

        {

          type:'bar',

          data:{

            labels:
              porMarca.map(x => x.etiqueta),

            datasets:[{

              label:'OEE',

              data:
                porMarca.map(x => x.oee * 100),

              backgroundColor:
                porMarca.map(
                  x => colorSegunMeta(x.oee, METAS.oee)
                ),

              borderRadius:3,

              barPercentage:0.6

            }]

          },

          options:{

            indexAxis:'y',

            plugins:{

              legend:{ display:false },

              valorBarra:{
                activo:true,
                formato:v => (Math.round(v * 10) / 10) + '%'
              },

              metaLine:{
                valor:METAS.oee * 100,
                eje:'x',
                texto:'Meta ' + pct(METAS.oee),
                color:PAL.texto
              },

              tooltip:{

                callbacks:{

                  label:ctx => {

                    const x = porMarca[ctx.dataIndex];

                    return (
                      (Math.round(x.oee * 1000) / 10) +
                      '% · ' + Math.round(x.horas) +
                      ' h efectivas acumuladas'
                    );

                  }

                }

              }

            },

            scales:{

              x:{

                beginAtZero:true,

                max:100,

                grid:{ color:'#EFF2F4' },

                ticks:{ callback:v => v + '%' }

              },

              y:{
                grid:{ display:false }
              }

            }

          }

        }

      );

  }

}