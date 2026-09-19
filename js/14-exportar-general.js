/* =============================================================
   EXPORTACIÓN A EXCEL — GENERAL DE PLANTA (TODAS LAS LÍNEAS)
   Parte del sistema GLACIAL

   Reutiliza el mismo motor y estilo visual que ya usa el Excel
   por línea (XL, xlFill, xlFont, xlColorSemaforo, xlN, xlN1,
   xlFechaTexto, cargarScriptExterno, descargarArchivo, etc. —
   definidos en 08-graficos.js).

   Cubre, por ahora, los puntos 1 a 5 del Excel general acordado:
     1. Portada de planta
     2. Matriz de líneas
     3. Producción por día y línea
     4. Cortes (marca / presentación / turno)
     5. Paradas y mermas de planta

   Tendencia comparativa con gráfico nativo y la hoja "Datos"
   consolidada quedan para una segunda vuelta, junto con la
   protección de hojas y las alertas de calidad de datos.

   Rango: usa el mismo selector del tablero Resumen
   (resumenRangoDias / filtrarPorRangoResumen), para que el
   Excel siempre coincida con lo que la persona está viendo.

   Permiso requerido: 'exportarExcelGeneral' (distinto del
   permiso 'exportarExcel' del reporte por línea).
   ============================================================= */


/* =========================================================
   CONVERSIÓN A LITROS

   Todas las líneas registran su "producción efectiva" como
   conteo de UNIDADES individuales (botellas en PET1/PET2,
   bidones en B7L/B20L, cajas en C20L) — nunca en packs.

   Para poder sumar la planta completa en una sola unidad se
   convierte cada unidad a litros, leyendo el volumen directo
   del nombre de la presentación:

     - PET1/PET2: "..._2.5Lx6und" → 2.5 L, "..._380mlx24und" → 0.38 L
     - B7L:       "7 Litros" / "10 Litros" → 7 L / 10 L
     - C20L:      "Caja 20 Litros" → 20 L
     - B20L:      "Bidón 20 Litros" → 20 L

   Si una presentación no trae el volumen en el nombre,
   devuelve 0 (no se puede inventar el dato).
   ========================================================= */

function obtenerLitrosPorUnidad(presentacion){

  const texto = normalizarTexto(presentacion);

  /* Packs PET: "<num>l x..." o "<num>ml x..." */
  let m = texto.match(/(\d+(?:\.\d+)?)\s*(ml|l)\s*x/);

  if(m){
    const val = parseFloat(m[1]);
    return m[2] === 'ml' ? val / 1000 : val;
  }

  /* Bidones / cajas: "<num> litros" */
  m = texto.match(/(\d+(?:\.\d+)?)\s*litros?/);

  if(m){
    return parseFloat(m[1]);
  }

  return 0;

}

/*
   Litros totales de un cuadro (o de un registro completo,
   sumando sus 4 cuadros).
*/
function litrosCuadro(c){
  return num(c?.produccion?.efectiva) * obtenerLitrosPorUnidad(c?.presentacion);
}

function litrosRegistro(rec){
  return normalizarCuadros(rec).reduce((a,c) => a + litrosCuadro(c), 0);
}


/* =========================================================
   RECOLECCIÓN DE DATOS DE PLANTA (RANGO ELEGIDO EN RESUMEN)
   ========================================================= */

function datosExportacionGeneral(){

  const lineasVisibles = visibleLines();

  const todos =
    loadRecords().filter(
      r => lineasVisibles.some(l => l.key === r.linea)
    );

  const records = filtrarPorRangoResumen(todos);

  if(!records.length){
    alert('No hay registros en el rango elegido para generar el Excel general.');
    return null;
  }

  const rangoLabel =
    resumenRangoDias
      ? `Últimos ${resumenRangoDias} días`
      : 'Todo el historial';

  return { lineasVisibles, records, rangoLabel };

}


/* =========================================================
   AGREGADOS POR LÍNEA (PARA PORTADA Y MATRIZ)
   ========================================================= */

function agregadosPorLinea(records, lineas){

  return lineas.map(l => {

    const recs = records.filter(r => r.linea === l.key);

    let horasTurno = 0, horasEfectivas = 0, oeeXhoras = 0, dispXhoras = 0;
    let efectiva = 0, programada = 0, litros = 0, minutosParadas = 0, mermaUnidades = 0;

    recs.forEach(r => {

      const d = calcDerived(r);
      const h = num(d.horasEfectivas);

      horasTurno += num(d.horasEfectivas + d.pProg + d.pNoProg);
      horasEfectivas += h;
      efectiva += num(d.efectiva ?? r.produccion?.efectiva);
      programada += num(d.programada ?? r.produccion?.programada);
      litros += litrosRegistro(r);
      minutosParadas += (num(d.pProg) + num(d.pNoProg)) * 60;
      mermaUnidades += agruparMermas(r).totalUnidades;

      if(h > 0){
        oeeXhoras += d.oee * h;
        dispXhoras += num(d.disponibilidad) * h;
      }

    });

    const oee = horasEfectivas > 0 ? oeeXhoras / horasEfectivas : 0;
    const disponibilidad = horasEfectivas > 0 ? dispXhoras / horasEfectivas : 0;
    const cumplimiento = programada > 0 ? efectiva / programada : 0;
    const mermaPct = efectiva > 0 ? mermaUnidades / efectiva : 0;

    return {
      linea: l.name, key: l.key,
      horasTurno, horasEfectivas, oee, disponibilidad,
      efectiva, programada, cumplimiento, litros,
      minutosParadas, mermaUnidades, mermaPct,
      sinDatos: recs.length === 0
    };

  });

}


/* =========================================================
   OEE DIARIO POR LÍNEA (PARA LA TENDENCIA COMPARATIVA)
   ========================================================= */

function calcularOEEDiarioPorLinea(records){

  const acumulado = {};
  const fechasSet = new Set();

  records.forEach(r => {

    if(!r.fecha){
      return;
    }

    fechasSet.add(r.fecha);

    const d = calcDerived(r);
    const h = num(d.horasEfectivas);

    if(h <= 0){
      return;
    }

    if(!acumulado[r.fecha]){
      acumulado[r.fecha] = {};
    }

    if(!acumulado[r.fecha][r.linea]){
      acumulado[r.fecha][r.linea] = { horas:0, oeeXhoras:0 };
    }

    acumulado[r.fecha][r.linea].horas += h;
    acumulado[r.fecha][r.linea].oeeXhoras += d.oee * h;

  });

  const fechas =
    Array.from(fechasSet).sort((a,b) => a.localeCompare(b));

  return { fechas, acumulado };

}


/* =========================================================
   GRÁFICO DE LÍNEAS DIBUJADO EN CANVAS (PARA LA TENDENCIA)
   =========================================================

   Mismo enfoque que xlGraficoBarras (08-graficos.js): se
   dibuja en un <canvas> oculto y se inserta como imagen PNG
   en la hoja, porque ExcelJS no soporta gráficos nativos
   editables sin cambiar de librería o armar el XML a mano.
   ========================================================= */

function xlgGraficoLineas(cfg){

  const fechas = cfg.fechas || [];
  const series = cfg.series || [];

  if(!fechas.length || !series.length){
    return null;
  }

  const ancho = cfg.ancho || 900;
  const alto = cfg.alto || 380;
  const esc = 2;

  const canvas = document.createElement('canvas');
  canvas.width = ancho * esc;
  canvas.height = alto * esc;

  const ctx = canvas.getContext('2d');
  ctx.scale(esc, esc);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, ancho, alto);

  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#' + XL.azul;
  ctx.font = 'bold 15px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(cfg.titulo || '', 16, 22);

  const top = 46, izq = 46, der = 20, abajoEje = 40, abajoLeyenda = 22;
  const alturaGrafico = alto - top - abajoEje - abajoLeyenda;
  const anchoGrafico = ancho - izq - der;

  /* Ejes y grilla (0-100%) */
  ctx.strokeStyle = '#EFF2F4';
  ctx.fillStyle = '#' + XL.grisTexto;
  ctx.font = '10px Arial';
  ctx.textAlign = 'right';

  for(let p = 0; p <= 100; p += 25){
    const y = top + alturaGrafico * (1 - p / 100);
    ctx.beginPath();
    ctx.moveTo(izq, y);
    ctx.lineTo(izq + anchoGrafico, y);
    ctx.stroke();
    ctx.fillText(p + '%', izq - 6, y);
  }

  /* Línea de meta */
  const yMeta = top + alturaGrafico * (1 - METAS.oee);
  ctx.strokeStyle = '#' + XL.rojo;
  ctx.setLineDash([5,3]);
  ctx.beginPath();
  ctx.moveTo(izq, yMeta);
  ctx.lineTo(izq + anchoGrafico, yMeta);
  ctx.stroke();
  ctx.setLineDash([]);

  /* Etiquetas de fecha en X (máx. ~12, para no amontonar) */
  const paso = Math.max(1, Math.ceil(fechas.length / 12));
  ctx.fillStyle = '#' + XL.negro;
  ctx.textAlign = 'center';

  fechas.forEach((f, i) => {
    if(i % paso !== 0 && i !== fechas.length - 1){
      return;
    }
    const x = izq + (fechas.length > 1 ? (i / (fechas.length - 1)) * anchoGrafico : 0);
    ctx.fillText(xlFechaTexto(f).slice(0,5), x, top + alturaGrafico + 14);
  });

  /* Series */
  series.forEach(serie => {

    ctx.strokeStyle = serie.color;
    ctx.fillStyle = serie.color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    serie.valores.forEach((v, i) => {

      const x = izq + (fechas.length > 1 ? (i / (fechas.length - 1)) * anchoGrafico : 0);

      if(v === null || v === undefined){
        return;
      }

      const y = top + alturaGrafico * (1 - Math.min(v, 1));

      if(i === 0 || serie.valores[i - 1] === null){
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

    });

    ctx.stroke();

  });

  /* Leyenda */
  let xLeyenda = izq;
  const yLeyenda = top + alturaGrafico + abajoEje - 4;

  ctx.font = '11px Arial';
  ctx.textAlign = 'left';

  series.forEach(serie => {

    ctx.fillStyle = serie.color;
    ctx.fillRect(xLeyenda, yLeyenda - 6, 10, 10);

    ctx.fillStyle = '#' + XL.negro;
    ctx.fillText(serie.nombre, xLeyenda + 14, yLeyenda - 1);

    xLeyenda += 14 + ctx.measureText(serie.nombre).width + 18;

  });

  return canvas.toDataURL('image/png');

}


/* =========================================================
   MINI-TENDENCIA (SPARKLINE) DE OEE POR LÍNEA — CANVAS
   =========================================================

   Línea delgada sin ejes ni etiquetas, con un punto en el
   último valor y una línea punteada tenue en la meta. Se usa
   en el ranking de la portada del Excel general, una por
   línea, para mostrar de un vistazo si viene mejorando o
   empeorando en los últimos días del rango elegido.
   ========================================================= */

function xlgGraficoSparkline(cfg){

  const valores = cfg.valores || [];
  const meta = num(cfg.meta) || 0.85;
  const ancho = cfg.ancho || 90;
  const alto = cfg.alto || 22;
  const esc = 3;

  const usables = valores.filter(v => v !== null && v !== undefined);

  if(usables.length < 2){
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = ancho * esc;
  canvas.height = alto * esc;

  const ctx = canvas.getContext('2d');
  ctx.scale(esc, esc);

  const pad = 3;
  const min = Math.min(...usables, meta, 0);
  const max = Math.max(...usables, meta);
  const rango = (max - min) || 1;

  const puntos = valores.map((v, i) => {
    if(v === null || v === undefined){
      return null;
    }
    return {
      x: pad + (i / (valores.length - 1)) * (ancho - pad * 2),
      y: alto - pad - ((v - min) / rango) * (alto - pad * 2)
    };
  });

  /* Línea de meta, tenue */
  const yMeta = alto - pad - ((meta - min) / rango) * (alto - pad * 2);
  ctx.strokeStyle = '#' + XL.grisClaro;
  ctx.setLineDash([2,2]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, yMeta);
  ctx.lineTo(ancho - pad, yMeta);
  ctx.stroke();
  ctx.setLineDash([]);

  /* Línea de tendencia, coloreada según el último valor */
  const ultimo = usables[usables.length - 1];
  const color = '#' + xlColorFuerteSegunMeta(ultimo, meta);

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();

  let empezado = false;

  puntos.forEach(p => {
    if(!p){
      empezado = false;
      return;
    }
    if(!empezado){
      ctx.moveTo(p.x, p.y);
      empezado = true;
    } else {
      ctx.lineTo(p.x, p.y);
    }
  });

  ctx.stroke();

  /* Punto en el último valor disponible */
  const ultimoPunto = [...puntos].reverse().find(p => p);

  if(ultimoPunto){
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(ultimoPunto.x, ultimoPunto.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas.toDataURL('image/png');

}


/* =========================================================
   HOJA 1 — PORTADA DE PLANTA
   ========================================================= */

function xlgHojaPortada(wb, ctx){

  const { records, lineas, lineasAgg, rangoLabel, usuario, generado } = ctx;

  const ws = wb.addWorksheet('Portada', {
    views:[{ showGridLines:false }]
  });

  ws.columns = [
    { width:3 }, { width:26 }, { width:20 }, { width:20 },
    { width:20 }, { width:20 }, { width:20 }, { width:16 }, { width:3 }
  ];

  if(typeof GLACIAL_LOGO_BASE64 !== 'undefined'){
    try{
      const altoLogo = 46;
      const anchoLogo = Math.round(altoLogo * GLACIAL_LOGO_RATIO);
      const idLogo = wb.addImage({ base64:GLACIAL_LOGO_BASE64, extension:'png' });
      ws.addImage(idLogo, { tl:{ col:5.6, row:0.2 }, ext:{ width:anchoLogo, height:altoLogo } });
    } catch(e){
      console.warn('No se pudo insertar el logo:', e);
    }
  }

  let fila = 2;

  ws.mergeCells(`B${fila}:G${fila}`);
  ws.getCell(`B${fila}`).value = 'GLACIAL — Reporte General de Planta';
  ws.getCell(`B${fila}`).font = xlFont({ size:16, bold:true, color:XL.azul });
  fila += 1;

  ws.mergeCells(`B${fila}:G${fila}`);
  ws.getCell(`B${fila}`).value = rangoLabel + ' · Todas las líneas visibles';
  ws.getCell(`B${fila}`).font = xlFont({ size:11, color:XL.grisTexto });
  fila += 2;

  /* KPIs de planta */
  const horas = lineasAgg.reduce((a,l) => a + l.horasEfectivas, 0);
  const oeePlanta = horas > 0
    ? lineasAgg.reduce((a,l) => a + l.oee * l.horasEfectivas, 0) / horas
    : 0;
  const dispPlanta = horas > 0
    ? lineasAgg.reduce((a,l) => a + l.disponibilidad * l.horasEfectivas, 0) / horas
    : 0;
  const efectivaPlanta = lineasAgg.reduce((a,l) => a + l.efectiva, 0);
  const litrosPlanta = lineasAgg.reduce((a,l) => a + l.litros, 0);
  const programadaPlanta = lineasAgg.reduce((a,l) => a + l.programada, 0);
  const cumplimientoPlanta = programadaPlanta > 0 ? efectivaPlanta / programadaPlanta : 0;
  const mermaPlanta = lineasAgg.reduce((a,l) => a + l.mermaUnidades, 0);
  const mermaPctPlanta = efectivaPlanta > 0 ? mermaPlanta / efectivaPlanta : 0;
  const minutosParadasPlanta = lineasAgg.reduce((a,l) => a + l.minutosParadas, 0);

  const kpis = [
    ['OEE de planta', pct(oeePlanta), METAS.oee, oeePlanta],
    ['Disponibilidad', pct(dispPlanta), METAS.disponibilidad, dispPlanta],
    ['Cumplimiento vs. programado', pct(cumplimientoPlanta), 1, cumplimientoPlanta],
    ['Producción efectiva', xlN(efectivaPlanta) + ' und.', null, null],
    ['Producción en litros', xlN(litrosPlanta) + ' L', null, null],
    ['Paradas totales', Math.round(minutosParadasPlanta / 60) + ' h', null, null],
    ['Merma sobre producción', pct(mermaPctPlanta), METAS.merma, 1 - Math.min(mermaPctPlanta / (METAS.merma * 2), 1)]
  ];

  const filaKpiInicio = fila;

  kpis.forEach((k, i) => {

    const col = 2 + (i % 3) * 2;
    const filaK = filaKpiInicio + Math.floor(i / 3) * 3;

    const letraLabel = xlLetra(col);
    const letraValor = xlLetra(col);

    ws.mergeCells(filaK, col, filaK, col + 1);
    ws.getCell(filaK, col).value = k[0];
    ws.getCell(filaK, col).font = xlFont({ size:9, color:XL.grisTexto });

    ws.mergeCells(filaK + 1, col, filaK + 1, col + 1);
    const celdaValor = ws.getCell(filaK + 1, col);
    celdaValor.value = k[1];
    celdaValor.font = xlFont({ size:15, bold:true, color:XL.azul });

    if(k[2] !== null){
      const fill = k[3] >= k[2] ? XL.verdeClaro : (k[3] >= k[2] * 0.85 ? XL.amarilloClaro : XL.rojoClaro);
      for(let c = col; c <= col + 1; c++){
        ws.getCell(filaK, c).fill = xlFill(fill);
        ws.getCell(filaK + 1, c).fill = xlFill(fill);
      }
    }

  });

  fila = filaKpiInicio + Math.ceil(kpis.length / 3) * 3 + 1;

  /* Ranking de líneas por OEE */
  ws.mergeCells(`B${fila}:G${fila}`);
  ws.getCell(`B${fila}`).value = 'Ranking de líneas por OEE';
  ws.getCell(`B${fila}`).font = xlFont({ size:12, bold:true, color:XL.azul });
  fila += 1;

  const encabezados = ['#', 'Línea', 'OEE', 'Producción (und.)', 'Litros', 'Estado', 'Tendencia (7d)'];
  encabezados.forEach((h, i) => {
    const c = ws.getCell(fila, 2 + i);
    c.value = h;
    c.font = xlFont({ bold:true, color:XL.blanco });
    c.fill = xlFill(XL.azul);
    c.border = XL_BORDER;
  });
  fila += 1;

  const ranking = [...lineasAgg].sort((a,b) => b.oee - a.oee);

  /*
     Tendencia de OEE día a día por línea, dentro del mismo
     rango elegido en Resumen — se usan los últimos 7 días con
     datos para la mini-tendencia de cada fila del ranking.
  */
  const tendenciaDiaria = calcularOEEDiarioPorLinea(records);
  const fechasTendencia = tendenciaDiaria.fechas.slice(-7);

  ranking.forEach((l, i) => {
    const valores = [i + 1, l.linea, pct(l.oee), xlN(l.efectiva), xlN(l.litros), xlEstado(l.oee), ''];

    valores.forEach((v, j) => {
      const c = ws.getCell(fila, 2 + j);
      c.value = v;
      c.font = xlFont({});
      c.border = XL_BORDER;
      if(j === 2){
        c.fill = xlFill(xlColorSemaforo(l.oee));
      }
    });

    const valoresTendencia = fechasTendencia.map(f => {
      const dia = tendenciaDiaria.acumulado[f]?.[l.key];
      return dia && dia.horas > 0 ? dia.oeeXhoras / dia.horas : null;
    });

    const imgTendencia = xlgGraficoSparkline({
      valores: valoresTendencia,
      meta: METAS.oee,
      ancho: 95,
      alto: 20
    });

    if(imgTendencia){
      ws.getRow(fila).height = 20;
      xlAgregarImagen(wb, ws, imgTendencia, 7.05, fila - 1 + 0.05, 95, 18);
    }

    fila += 1;
  });

  fila += 1;

  /* Conclusiones automáticas */
  ws.mergeCells(`B${fila}:G${fila}`);
  ws.getCell(`B${fila}`).value = 'Conclusiones';
  ws.getCell(`B${fila}`).font = xlFont({ size:12, bold:true, color:XL.azul });
  fila += 1;

  const conclusiones = generarConclusiones({
    oeePlanta, dispPlanta, cumplimientoPlanta, mermaPctPlanta, ranking
  });

  conclusiones.forEach(txt => {
    ws.mergeCells(`B${fila}:G${fila}`);
    ws.getCell(`B${fila}`).value = '• ' + txt;
    ws.getCell(`B${fila}`).font = xlFont({ size:10 });
    ws.getCell(`B${fila}`).alignment = { wrapText:true };
    fila += 1;
  });

  fila += 1;
  ws.mergeCells(`B${fila}:G${fila}`);
  ws.getCell(`B${fila}`).value = generado + ' · ' + usuario;
  ws.getCell(`B${fila}`).font = xlFont({ size:8, italic:true, color:XL.grisTexto });

}


function generarConclusiones({ oeePlanta, dispPlanta, cumplimientoPlanta, mermaPctPlanta, ranking }){

  const txt = [];

  txt.push(
    oeePlanta >= METAS.oee
      ? `La planta cumple su meta de OEE (${pct(oeePlanta)} vs. meta ${pct(METAS.oee)}).`
      : `La planta está por debajo de su meta de OEE: ${pct(oeePlanta)} vs. meta ${pct(METAS.oee)}.`
  );

  txt.push(
    dispPlanta >= METAS.disponibilidad
      ? `Disponibilidad saludable (${pct(dispPlanta)}).`
      : `La disponibilidad (${pct(dispPlanta)}) está debajo de la meta (${pct(METAS.disponibilidad)}); revisar paradas.`
  );

  txt.push(
    cumplimientoPlanta >= 1
      ? `Se cumplió o superó la producción programada (${pct(cumplimientoPlanta)}).`
      : `La producción efectiva llegó a ${pct(cumplimientoPlanta)} de lo programado.`
  );

  txt.push(
    mermaPctPlanta <= METAS.merma
      ? `La merma (${pct(mermaPctPlanta)}) está dentro de la meta (${pct(METAS.merma)}).`
      : `La merma (${pct(mermaPctPlanta)}) supera la meta (${pct(METAS.merma)}).`
  );

  if(ranking.length){
    const mejor = ranking[0];
    const peor = ranking[ranking.length - 1];
    if(mejor.key !== peor.key){
      txt.push(`${mejor.linea} lidera el OEE (${pct(mejor.oee)}); ${peor.linea} es la que más oportunidad de mejora tiene (${pct(peor.oee)}).`);
    }
  }

  return txt;

}


/* =========================================================
   HOJA 2 — MATRIZ DE LÍNEAS
   ========================================================= */

function xlgHojaMatrizLineas(wb, ctx){

  const { lineasAgg } = ctx;

  const ws = wb.addWorksheet('Matriz de líneas', { views:[{ showGridLines:false }] });

  const encabezados = [
    'Línea', 'Producción (und.)', 'Litros', 'Horas efectivas',
    'Disponibilidad', 'Rendimiento', 'Calidad', 'OEE',
    'Cumplimiento', 'Paradas (h)', 'Merma %', 'Estado'
  ];

  ws.columns = encabezados.map(() => ({ width:16 }));
  ws.getColumn(1).width = 18;

  encabezados.forEach((h, i) => {
    const c = ws.getCell(1, i + 1);
    c.value = h;
    c.font = xlFont({ bold:true, color:XL.blanco });
    c.fill = xlFill(XL.azul);
    c.border = XL_BORDER;
    c.alignment = { horizontal:'center', wrapText:true };
  });

  let fila = 2;

  lineasAgg.forEach(l => {

    const rendimiento = l.horasEfectivas > 0 && l.oee > 0 && l.disponibilidad > 0
      ? l.oee / l.disponibilidad
      : 0;

    const valores = [
      l.linea, xlN(l.efectiva), xlN(l.litros), xlN1(l.horasEfectivas),
      pct(l.disponibilidad), rendimiento > 0 ? pct(Math.min(rendimiento, 1)) : '—',
      '—', pct(l.oee), pct(l.cumplimiento),
      xlN1(l.minutosParadas / 60), pct(l.mermaPct),
      l.sinDatos ? 'Sin datos' : xlEstado(l.oee)
    ];

    valores.forEach((v, j) => {
      const c = ws.getCell(fila, j + 1);
      c.value = v;
      c.font = xlFont({});
      c.border = XL_BORDER;
    });

    ws.getCell(fila, 8).fill = xlFill(l.sinDatos ? XL.grisClaro : xlColorSemaforo(l.oee));
    ws.getCell(fila, 11).fill = xlFill(
      l.mermaPct <= METAS.merma ? XL.verdeClaro : (l.mermaPct <= METAS.merma * 1.5 ? XL.amarilloClaro : XL.rojoClaro)
    );

    fila += 1;

  });

  /* Fila de total planta */
  const totalEfectiva = lineasAgg.reduce((a,l) => a + l.efectiva, 0);
  const totalLitros = lineasAgg.reduce((a,l) => a + l.litros, 0);
  const totalHoras = lineasAgg.reduce((a,l) => a + l.horasEfectivas, 0);
  const totalProgramada = lineasAgg.reduce((a,l) => a + l.programada, 0);
  const totalMerma = lineasAgg.reduce((a,l) => a + l.mermaUnidades, 0);
  const totalParadasMin = lineasAgg.reduce((a,l) => a + l.minutosParadas, 0);
  const oeePlanta = totalHoras > 0
    ? lineasAgg.reduce((a,l) => a + l.oee * l.horasEfectivas, 0) / totalHoras
    : 0;
  const dispPlanta = totalHoras > 0
    ? lineasAgg.reduce((a,l) => a + l.disponibilidad * l.horasEfectivas, 0) / totalHoras
    : 0;

  const filaTotal = [
    'TOTAL PLANTA', xlN(totalEfectiva), xlN(totalLitros), xlN1(totalHoras),
    pct(dispPlanta), '—', '—', pct(oeePlanta),
    totalProgramada > 0 ? pct(totalEfectiva / totalProgramada) : '—',
    xlN1(totalParadasMin / 60),
    totalEfectiva > 0 ? pct(totalMerma / totalEfectiva) : '—',
    xlEstado(oeePlanta)
  ];

  filaTotal.forEach((v, j) => {
    const c = ws.getCell(fila, j + 1);
    c.value = v;
    c.font = xlFont({ bold:true, color:XL.blanco });
    c.fill = xlFill(XL.grisTexto);
    c.border = XL_BORDER;
  });

}


/* =========================================================
   HOJA 3 — PRODUCCIÓN POR DÍA Y LÍNEA
   ========================================================= */

function xlgHojaProduccionDiaLinea(wb, ctx){

  const { records, lineas } = ctx;

  const ws = wb.addWorksheet('Producción diaria', { views:[{ showGridLines:false }] });

  const porDiaLinea = {};
  const fechasSet = new Set();

  records.forEach(r => {
    if(!r.fecha) return;
    fechasSet.add(r.fecha);
    if(!porDiaLinea[r.fecha]) porDiaLinea[r.fecha] = {};
    porDiaLinea[r.fecha][r.linea] =
      (porDiaLinea[r.fecha][r.linea] || 0) + produccionEfectivaRecord(r);
  });

  const fechas = Array.from(fechasSet).sort((a,b) => a.localeCompare(b));

  ws.getColumn(1).width = 14;
  lineas.forEach((l, i) => { ws.getColumn(i + 2).width = 14; });
  ws.getColumn(lineas.length + 2).width = 16;

  const encabezados = ['Fecha', ...lineas.map(l => l.name), 'Total planta'];
  encabezados.forEach((h, i) => {
    const c = ws.getCell(1, i + 1);
    c.value = h;
    c.font = xlFont({ bold:true, color:XL.blanco });
    c.fill = xlFill(XL.azul);
    c.border = XL_BORDER;
    c.alignment = { horizontal:'center' };
  });

  /* Máximo para el "mapa de calor" (intensidad de color por celda) */
  let maxValor = 0;
  fechas.forEach(f => lineas.forEach(l => {
    maxValor = Math.max(maxValor, (porDiaLinea[f]?.[l.key]) || 0);
  }));

  fechas.forEach((f, i) => {

    const fila = i + 2;

    ws.getCell(fila, 1).value = xlFechaTexto(f);
    ws.getCell(fila, 1).font = xlFont({});
    ws.getCell(fila, 1).border = XL_BORDER;

    let totalDia = 0;

    lineas.forEach((l, j) => {

      const val = (porDiaLinea[f]?.[l.key]) || 0;
      totalDia += val;

      const c = ws.getCell(fila, j + 2);
      c.value = val || '';
      c.font = xlFont({});
      c.border = XL_BORDER;

      if(val > 0 && maxValor > 0){
        const intensidad = val / maxValor;
        c.fill = xlFill(colorMapaCalor(intensidad));
      }

    });

    const cTotal = ws.getCell(fila, lineas.length + 2);
    cTotal.value = totalDia;
    cTotal.font = xlFont({ bold:true });
    cTotal.border = XL_BORDER;
    cTotal.fill = xlFill(XL.azulMuyClaro);

  });

}

/*
   Interpola entre azul muy claro (poco) y azul fuerte (mucho),
   para un mapa de calor simple sin depender de "Conditional
   Formatting" nativo de Excel.
*/
function colorMapaCalor(intensidad){

  const t = Math.max(0, Math.min(1, intensidad));

  const c1 = { r:0xEE, g:0xF5, b:0xFB }; /* XL.azulMuyClaro */
  const c2 = { r:0x5B, g:0x9B, b:0xD5 }; /* XL.celeste */

  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b = Math.round(c1.b + (c2.b - c1.b) * t);

  const hex = n => n.toString(16).padStart(2, '0').toUpperCase();

  return hex(r) + hex(g) + hex(b);

}


/* =========================================================
   HOJA 4 — CORTES (MARCA / PRESENTACIÓN / TURNO), PLANTA
   ========================================================= */

function xlgHojaCortes(wb, ctx){

  const { records, lineasAgg } = ctx;

  const ws = wb.addWorksheet('Cortes', { views:[{ showGridLines:false }] });

  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 26;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 18;
  ws.getColumn(5).width = 14;

  let fila = 1;

  function tituloSeccion(texto){
    ws.mergeCells(`B${fila}:E${fila}`);
    ws.getCell(`B${fila}`).value = texto;
    ws.getCell(`B${fila}`).font = xlFont({ size:12, bold:true, color:XL.azul });
    fila += 1;
  }

  function encabezadoTabla(cols){
    cols.forEach((h, i) => {
      const c = ws.getCell(fila, 2 + i);
      c.value = h;
      c.font = xlFont({ bold:true, color:XL.blanco });
      c.fill = xlFill(XL.azul);
      c.border = XL_BORDER;
    });
    fila += 1;
  }

  /* ---- Por marca ---- */
  tituloSeccion('Producción y OEE por marca (planta)');
  encabezadoTabla(['Marca', 'Línea(s)', 'Producción (und.)', '% del total']);

  const porMarca = sumarProduccionPorMarca(records);
  const totalMarcas = porMarca.reduce((a,x) => a + x.total, 0);

  porMarca.forEach(x => {
    const valores = [x.marca, x.lineas || '—', xlN(x.total), totalMarcas > 0 ? pct(x.total / totalMarcas) : '—'];
    valores.forEach((v, j) => {
      const c = ws.getCell(fila, 2 + j);
      c.value = v;
      c.font = xlFont({});
      c.border = XL_BORDER;
    });
    fila += 1;
  });

  fila += 1;

  /* ---- Por presentación ---- */
  tituloSeccion('Producción por presentación (planta)');
  encabezadoTabla(['Presentación', 'Producción (und.)', '% del total', '']);

  const { presentaciones, acumulado } = sumarProduccionPorDiaYPresentacion(records);
  const totalesPresentacion = {};

  presentaciones.forEach(p => {
    totalesPresentacion[p] = Object.values(acumulado).reduce((a,d) => a + (d[p] || 0), 0);
  });

  const totalPresentaciones = Object.values(totalesPresentacion).reduce((a,v) => a + v, 0);

  presentaciones
    .sort((a,b) => totalesPresentacion[b] - totalesPresentacion[a])
    .forEach(p => {
      const valores = [p, xlN(totalesPresentacion[p]), totalPresentaciones > 0 ? pct(totalesPresentacion[p] / totalPresentaciones) : '—', ''];
      valores.forEach((v, j) => {
        const c = ws.getCell(fila, 2 + j);
        c.value = v;
        c.font = xlFont({});
        c.border = XL_BORDER;
      });
      fila += 1;
    });

  fila += 1;

  /* ---- Por turno ---- */
  tituloSeccion('Producción por turno (planta)');
  encabezadoTabla(['Turno', 'Producción (und.)', '% del total', '']);

  const porTurno = sumarProduccionPorTurno(records);
  const totalTurno = porTurno.reduce((a,x) => a + x.total, 0);

  porTurno.forEach(x => {
    const valores = [x.turno, xlN(x.total), totalTurno > 0 ? pct(x.total / totalTurno) : '—', ''];
    valores.forEach((v, j) => {
      const c = ws.getCell(fila, 2 + j);
      c.value = v;
      c.font = xlFont({});
      c.border = XL_BORDER;
    });
    fila += 1;
  });

}


/* =========================================================
   HOJA 5 — PARADAS Y MERMAS DE PLANTA (PARETO)
   ========================================================= */

function xlgHojaParadasMermas(wb, ctx){

  const { records, lineas } = ctx;

  const ws = wb.addWorksheet('Paradas y mermas', { views:[{ showGridLines:false }] });

  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 16;

  let fila = 1;

  function tituloSeccion(texto){
    ws.mergeCells(`B${fila}:E${fila}`);
    ws.getCell(`B${fila}`).value = texto;
    ws.getCell(`B${fila}`).font = xlFont({ size:12, bold:true, color:XL.azul });
    fila += 1;
  }

  function encabezadoTabla(cols){
    cols.forEach((h, i) => {
      const c = ws.getCell(fila, 2 + i);
      c.value = h;
      c.font = xlFont({ bold:true, color:XL.blanco });
      c.fill = xlFill(XL.azul);
      c.border = XL_BORDER;
    });
    fila += 1;
  }

  /* ---- Pareto de paradas, toda la planta ---- */
  const acumuladoParadas = {};

  records.forEach(r => {
    const { filas } = agruparParadas(r);
    filas.forEach(p => {
      const clave = p.tipo + '||' + p.descripcion;
      if(!acumuladoParadas[clave]){
        acumuladoParadas[clave] = { tipo:p.tipo, descripcion:p.descripcion, minutos:0 };
      }
      acumuladoParadas[clave].minutos += p.minutos;
    });
  });

  const paradasPlanta =
    Object.values(acumuladoParadas).sort((a,b) => b.minutos - a.minutos);

  const totalMinParadas = paradasPlanta.reduce((a,p) => a + p.minutos, 0);
  let corrido = 0;

  tituloSeccion('Pareto de paradas — toda la planta');
  encabezadoTabla(['Causa', 'Tipo', 'Horas', '% acumulado']);

  paradasPlanta.forEach(p => {
    corrido += p.minutos;
    const valores = [p.descripcion, p.tipo, xlN1(p.minutos / 60), totalMinParadas > 0 ? pct(corrido / totalMinParadas) : '—'];
    valores.forEach((v, j) => {
      const c = ws.getCell(fila, 2 + j);
      c.value = v;
      c.font = xlFont({});
      c.border = XL_BORDER;
    });
    fila += 1;
  });

  fila += 1;

  /* ---- Causa dominante por línea ---- */
  tituloSeccion('Causa de parada dominante por línea');
  encabezadoTabla(['Línea', 'Causa principal', 'Horas', '']);

  lineas.forEach(l => {
    const recsLinea = records.filter(r => r.linea === l.key);
    const acumLinea = {};
    recsLinea.forEach(r => {
      agruparParadas(r).filas.forEach(p => {
        acumLinea[p.descripcion] = (acumLinea[p.descripcion] || 0) + p.minutos;
      });
    });
    const top = Object.entries(acumLinea).sort((a,b) => b[1] - a[1])[0];
    const valores = [l.name, top ? top[0] : 'Sin datos', top ? xlN1(top[1] / 60) : '—', ''];
    valores.forEach((v, j) => {
      const c = ws.getCell(fila, 2 + j);
      c.value = v;
      c.font = xlFont({});
      c.border = XL_BORDER;
    });
    fila += 1;
  });

  fila += 1;

  /* ---- Pareto de mermas, toda la planta ---- */
  const acumuladoMermas = {};

  records.forEach(r => {
    agruparMermas(r).filas.forEach(m => {
      if(!acumuladoMermas[m.item]){
        acumuladoMermas[m.item] = { item:m.item, unidades:0 };
      }
      acumuladoMermas[m.item].unidades += m.unidades;
    });
  });

  const mermasPlanta =
    Object.values(acumuladoMermas).sort((a,b) => b.unidades - a.unidades);

  const totalMermas = mermasPlanta.reduce((a,m) => a + m.unidades, 0);
  let corridoMerma = 0;

  tituloSeccion('Pareto de mermas — toda la planta');
  encabezadoTabla(['Componente', 'Unidades', '% del total', '% acumulado']);

  mermasPlanta.forEach(m => {
    corridoMerma += m.unidades;
    const valores = [
      m.item, xlN(m.unidades),
      totalMermas > 0 ? pct(m.unidades / totalMermas) : '—',
      totalMermas > 0 ? pct(corridoMerma / totalMermas) : '—'
    ];
    valores.forEach((v, j) => {
      const c = ws.getCell(fila, 2 + j);
      c.value = v;
      c.font = xlFont({});
      c.border = XL_BORDER;
    });
    fila += 1;
  });

}


/* =========================================================
   HOJA 6 — TENDENCIA COMPARATIVA (OEE DIARIO POR LÍNEA)
   ========================================================= */

function xlgHojaTendencia(wb, ctx){

  const { records, lineas } = ctx;

  const ws = wb.addWorksheet('Tendencia', { views:[{ showGridLines:false }] });

  const { fechas, acumulado } = calcularOEEDiarioPorLinea(records);

  if(!fechas.length){
    ws.getCell('B2').value = 'No hay suficientes datos para la tendencia en el rango elegido.';
    ws.getCell('B2').font = xlFont({ italic:true, color:XL.grisTexto });
    return;
  }

  const colores = coloresResumen(lineas.length);

  const seriesOEE = lineas.map((l, i) => ({
    nombre: l.name,
    color: colores[i],
    valores: fechas.map(f => {
      const c = acumulado[f]?.[l.key];
      return c && c.horas > 0 ? c.oeeXhoras / c.horas : null;
    })
  }));

  /* Tabla */
  ws.getColumn(1).width = 14;
  lineas.forEach((l, i) => { ws.getColumn(i + 2).width = 14; });

  const encabezados = ['Fecha', ...lineas.map(l => l.name)];
  encabezados.forEach((h, i) => {
    const c = ws.getCell(1, i + 1);
    c.value = h;
    c.font = xlFont({ bold:true, color:XL.blanco });
    c.fill = xlFill(XL.azul);
    c.border = XL_BORDER;
  });

  fechas.forEach((f, i) => {

    const fila = i + 2;
    ws.getCell(fila, 1).value = xlFechaTexto(f);
    ws.getCell(fila, 1).font = xlFont({});
    ws.getCell(fila, 1).border = XL_BORDER;

    lineas.forEach((l, j) => {
      const v = seriesOEE[j].valores[i];
      const c = ws.getCell(fila, j + 2);
      c.value = v === null ? '—' : pct(v);
      c.font = xlFont({});
      c.border = XL_BORDER;
      if(v !== null){
        c.fill = xlFill(xlColorSemaforo(v));
      }
    });

  });

  /* Gráfico */
  const imagen = xlgGraficoLineas({
    titulo: 'OEE diario por línea (línea punteada = meta ' + pct(METAS.oee) + ')',
    fechas, series: seriesOEE
  });

  if(imagen){
    xlAgregarImagen(wb, ws, imagen, lineas.length + 3, 0, 620, 260);
  }

}


/* =========================================================
   HOJA 7 — DATOS (CONSOLIDADA, PARA TABLAS DINÁMICAS)
   ========================================================= */

const XLG_COLUMNAS_DATOS = [
  'Fecha', 'Día juliano', 'Semana', 'Línea', 'Turno', 'Cuadro',
  'Marca', 'Presentación', 'Lote', 'Hora inicio', 'Hora fin',
  'Horas turno', 'Horas efectivas', 'Producción efectiva (und.)',
  'Producción programada (und.)', 'Litros', 'Sopladas', 'Rechazadas',
  'Disponibilidad', 'Rendimiento', 'Calidad', 'OEE',
  'Paradas programadas (min)', 'Paradas no programadas (min)',
  'Merma (und.)', 'Registrado por'
];

function xlgHojaDatos(wb, ctx){

  const { records } = ctx;

  const ws = wb.addWorksheet('Datos', { views:[{ showGridLines:false, state:'frozen', ySplit:1 }] });

  ws.columns = XLG_COLUMNAS_DATOS.map(h => ({ header:h, width:16 }));

  ws.getRow(1).eachCell(c => {
    c.font = xlFont({ bold:true, color:XL.blanco });
    c.fill = xlFill(XL.azul);
    c.border = XL_BORDER;
  });

  records.forEach(r => {

    const lineaInfo = LINES.find(l => l.key === r.linea);
    const lineaNombre = lineaInfo ? lineaInfo.name : (r.linea || '');
    const diaJuliano = r.diaJuliano || obtenerDiaDelAño(r.fecha);
    const semana = r.semana || obtenerSemana(r.fecha);

    normalizarCuadros(r).forEach(c => {

      const tieneActividad =
        c.marca || c.presentacion ||
        num(c.horasTurno) > 0 ||
        num(c.produccion?.efectiva) > 0 ||
        num(c.produccion?.programada) > 0 ||
        num(c.produccion?.sopladas) > 0;

      if(!tieneActividad){
        return;
      }

      const d = calcDerivedCuadro(c);
      const mermaCuadro = (c.mermas || []).reduce((a,m) => a + num(m.unidades), 0);
      const paradasProgMin = (c.paradasProgramadas || []).reduce((a,p) => a + num(p.tiempoMin), 0);
      const paradasNoProgMin = (c.paradasNoProgramadas || []).reduce((a,p) => a + num(p.tiempoMin), 0);

      ws.addRow([
        xlFechaTexto(r.fecha), diaJuliano, semana, lineaNombre, r.turno, c.numero,
        c.marca, c.presentacion, c.lote, c.horaInicio, c.horaFin,
        c.horasTurno, xlN1(d.horasEfectivas), num(c.produccion?.efectiva),
        num(c.produccion?.programada), litrosCuadro(c), num(c.produccion?.sopladas),
        num(c.produccion?.calidad),
        pct(d.disponibilidad), pct(d.rendimiento), pct(d.calidad), pct(d.oee),
        paradasProgMin, paradasNoProgMin, mermaCuadro, r.registradoPor || ''
      ]);

    });

  });

  ws.eachRow((row, i) => {
    if(i === 1) return;
    row.eachCell(c => { c.font = xlFont({}); c.border = XL_BORDER; });
  });

}


/* =========================================================
   HOJA 8 — ALERTAS DE CALIDAD DE DATOS
   ========================================================= */

function xlgHojaAlertas(wb, ctx){

  const { records } = ctx;

  const ws = wb.addWorksheet('Alertas de datos', { views:[{ showGridLines:false }] });

  ws.columns = [
    { header:'Fecha', width:14 }, { header:'Línea', width:14 },
    { header:'Turno', width:14 }, { header:'Cuadro', width:9 },
    { header:'Lote', width:16 }, { header:'Motivo', width:44 }
  ];

  ws.getRow(1).eachCell(c => {
    c.font = xlFont({ bold:true, color:XL.blanco });
    c.fill = xlFill(XL.azul);
    c.border = XL_BORDER;
  });

  const lineaNombre = key => (LINES.find(l => l.key === key) || {}).name || key || '';

  records.forEach(r => {

    normalizarCuadros(r).forEach(c => {

      const efectiva = num(c.produccion?.efectiva);
      const sopladas = num(c.produccion?.sopladas);
      const rechazadas = num(c.produccion?.calidad);

      const tieneActividad =
        c.marca || c.presentacion || efectiva > 0 || sopladas > 0;

      if(!tieneActividad){
        return;
      }

      const d = calcDerivedCuadro(c);
      const motivos = [];

      if(efectiva > 0 && num(c.horasTurno) === 0){
        motivos.push('Producción registrada con horas de turno en 0');
      }

      if(rechazadas > sopladas && sopladas > 0){
        motivos.push('Botellas rechazadas mayores que las sopladas');
      }

      const produccionNominal = num(c.ratioNominal) * num(d.horasEfectivas);
      const rendimientoCrudo = produccionNominal > 0 ? efectiva / produccionNominal : 0;

      if(rendimientoCrudo > 1.05){
        motivos.push('Rendimiento por encima del 100% (' + pct(rendimientoCrudo) + ')');
      }

      if(efectiva > 0 && !c.lote){
        motivos.push('Lote vacío con producción registrada');
      }

      motivos.forEach(motivo => {

        const row = ws.addRow([
          xlFechaTexto(r.fecha), lineaNombre(r.linea), r.turno, c.numero, c.lote || '—', motivo
        ]);

        row.eachCell(cel => {
          cel.font = xlFont({});
          cel.border = XL_BORDER;
          cel.fill = xlFill(XL.rojoClaro);
        });

      });

    });

  });

  if(ws.rowCount === 1){
    ws.mergeCells('A2:F2');
    ws.getCell('A2').value = 'No se detectaron inconsistencias en los registros del rango elegido.';
    ws.getCell('A2').font = xlFont({ italic:true, color:XL.grisTexto });
  }

}


/* =========================================================
   PROTECCIÓN DE HOJAS (CONTRA EDICIÓN ACCIDENTAL)
   ========================================================= */

async function xlgProtegerHojas(wb){

  const hojas = wb.worksheets;

  for(const ws of hojas){

    try{
      await ws.protect('', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertRows: false,
        insertColumns: false,
        deleteRows: false,
        deleteColumns: false,
        sort: true,
        autoFilter: true
      });
    } catch(e){
      console.warn('No se pudo proteger la hoja ' + ws.name + ':', e);
    }

  }

}


/* =========================================================
   FUNCIÓN PRINCIPAL — EXPORTAR EXCEL GENERAL DE PLANTA
   ========================================================= */

async function exportarExcelGeneral(btn){

  if(!tienePermiso('exportarExcelGeneral')){
    alert('No tienes permiso para exportar el Excel general de planta.');
    return;
  }

  const datos = datosExportacionGeneral();

  if(!datos){
    return;
  }

  const { lineasVisibles, records, rangoLabel } = datos;

  /*
     El Excel general arma 8 hojas (con gráficos en canvas,
     Pareto, mapa de calor, etc.) y además protege cada hoja
     antes de descargar — con rangos grandes ("Todo el
     historial") ese trabajo es síncrono y puede tardar varios
     segundos. Sin este aviso, el botón se queda igual y da la
     impresión de que "no pasó nada" mientras en realidad sigue
     procesando (o, en el peor caso, el navegador bloquea la
     descarga automática porque ya pasó demasiado tiempo desde
     el clic). Se deshabilita el botón, se avisa que se está
     generando, y se cede el hilo un instante para que el
     navegador alcance a pintar ese aviso antes de la parte
     pesada.
  */

  const textoOriginal = btn ? btn.textContent : null;

  if(btn){
    btn.disabled = true;
    btn.textContent = 'Generando Excel general…';
  }

  try{

    await new Promise(resolve => setTimeout(resolve, 30));


    const ExcelJS = await cargarScriptExterno(
      'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
      'ExcelJS'
    );

    if(!ExcelJS){
      throw new Error('ExcelJS no está disponible.');
    }

    const usuario =
      (state.user && (state.user.nombre || state.user.username)) || 'GLACIAL';

    const lineasAgg = agregadosPorLinea(records, lineasVisibles);

    const ctx = {
      records, lineas: lineasVisibles, lineasAgg, rangoLabel, usuario,
      generado: 'Generado el ' + new Date().toLocaleString('es-PE')
    };

    const wb = new ExcelJS.Workbook();

    wb.creator = usuario;
    wb.lastModifiedBy = usuario;
    wb.created = new Date();
    wb.modified = new Date();
    wb.subject = 'Reporte General de Planta';
    wb.title = 'Reporte General de Planta GLACIAL — ' + rangoLabel;
    wb.company = 'GLACIAL';

    xlgHojaPortada(wb, ctx);
    xlgHojaMatrizLineas(wb, ctx);
    xlgHojaProduccionDiaLinea(wb, ctx);
    xlgHojaCortes(wb, ctx);
    xlgHojaParadasMermas(wb, ctx);
    xlgHojaTendencia(wb, ctx);
    xlgHojaAlertas(wb, ctx);
    xlgHojaDatos(wb, ctx);

    /* Deja pintar el aviso "Generando..." antes de la parte
       más pesada (proteger 8 hojas + serializar el .xlsx). */
    await new Promise(resolve => setTimeout(resolve, 0));

    await xlgProtegerHojas(wb);

    const rangoArchivo =
      nombreArchivoSeguro(
        resumenRangoDias ? (resumenRangoDias + 'd') : 'historial'
      );

    const fechaArchivo =
      nombreArchivoSeguro(new Date().toISOString().slice(0,10));

    const buffer = await wb.xlsx.writeBuffer();

    descargarArchivo(
      new Blob([buffer], { type:XL_MIME }),
      `Reporte_General_Planta_${rangoArchivo}_${fechaArchivo}.xlsx`
    );

  } catch(error){

    console.error(error);

    alert(
      'No se pudo generar el Excel general de planta. ' +
      'Verifica tu conexión a internet e inténtalo nuevamente.'
    );

  } finally {

    if(btn){
      btn.disabled = false;
      btn.textContent = textoOriginal || 'Exportar Excel general';
    }

  }

}