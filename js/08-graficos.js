/* =============================================================
   GRÁFICOS Y REPORTES VISUALES
   Parte del sistema GLACIAL — dividido a partir de app.js
   ============================================================= */


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


async function exportarExcel(){
  const data = obtenerRegistroExportacion();

  if(!data){
    return;
  }

  const { rec, all, d } = data;

  try{

    /* =========================================================
       GLACIAL — EXPORTACIÓN EXCEL
       Genera un libro con una presentación similar al
       DEMO BASE.xlsm:
       - Reporte Diario
       - Paradas
       - Mermas
       - Insumos
       - Personal
       - Historial línea
       - Resumen líneas

       Se utiliza ExcelJS para permitir formato, colores,
       bordes, combinaciones de celdas, anchos y congelado.
       ========================================================= */

    const ExcelJS = await cargarScriptExterno(
      'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
      'ExcelJS'
    );

    if(!ExcelJS){
      throw new Error('ExcelJS no está disponible.');
    }

    const wb = new ExcelJS.Workbook();

    wb.creator = 'GLACIAL';
    wb.lastModifiedBy = 'GLACIAL';
    wb.created = new Date();
    wb.modified = new Date();
    wb.subject = 'Reporte Diario de Producción';
    wb.title = 'Reporte Diario de Producción GLACIAL';

    const lineaNombre =
      (LINES.find(l => l.key === rec.linea) || {}).name || rec.linea || '';

    const numero = v =>
      Number.isFinite(Number(v)) ? Number(v) : 0;

    const texto = v =>
      v === null || v === undefined ? '' : String(v);

    const totalParadasProg =
      (rec.paradasProgramadas || [])
        .reduce((a,p) => a + numero(p.tiempoMin), 0);

    const totalParadasNoProg =
      (rec.paradasNoProgramadas || [])
        .reduce((a,p) => a + numero(p.tiempoMin), 0);

    /* =========================================================
       PALETA / ESTILOS
       ========================================================= */

    const COLORS = {
      azul: '17365D',
      azulClaro: 'D9EAF7',
      azulMuyClaro: 'EEF5FB',
      celeste: '5B9BD5',
      gris: 'D9E1F2',
      grisClaro: 'F3F6F9',
      grisTexto: '5B6573',
      blanco: 'FFFFFF',
      negro: '1F2933',
      verde: '70AD47',
      verdeClaro: 'E2F0D9',
      amarillo: 'FFD966',
      amarilloClaro: 'FFF2CC',
      rojo: 'C00000',
      rojoClaro: 'F4CCCC'
    };

    const borderThin = {
      top:    { style:'thin', color:{ argb:'FFB7C9D6' } },
      left:   { style:'thin', color:{ argb:'FFB7C9D6' } },
      bottom: { style:'thin', color:{ argb:'FFB7C9D6' } },
      right:  { style:'thin', color:{ argb:'FFB7C9D6' } }
    };

    function fill(color){
      return {
        type:'pattern',
        pattern:'solid',
        fgColor:{ argb:'FF' + color }
      };
    }

    function setCell(ws, address, value, opts = {}){
      const c = ws.getCell(address);
      c.value = value;

      if(opts.font) c.font = opts.font;
      if(opts.fill) c.fill = fill(opts.fill);
      if(opts.border !== false) c.border = opts.border || borderThin;
      if(opts.alignment) c.alignment = opts.alignment;
      if(opts.numFmt) c.numFmt = opts.numFmt;

      return c;
    }

    function styleTitle(ws, range, value){
      ws.mergeCells(range);
      const c = ws.getCell(range.split(':')[0]);
      c.value = value;
      c.font = {
        name:'Arial',
        size:16,
        bold:true,
        color:{argb:'FF' + COLORS.blanco}
      };
      c.fill = fill(COLORS.azul);
      c.alignment = {
        horizontal:'center',
        vertical:'middle'
      };

      const [a,b] = range.split(':');
      const startCell = ws.getCell(a);
      const endCell = ws.getCell(b);

      for(let r=startCell.row;r<=endCell.row;r++){
        for(let col=startCell.col;col<=endCell.col;col++){
          ws.getCell(r,col).fill = fill(COLORS.azul);
          ws.getCell(r,col).border = borderThin;
        }
      }

      ws.getRow(startCell.row).height = 28;
    }

    function styleSection(ws, range, value){
      ws.mergeCells(range);
      const c = ws.getCell(range.split(':')[0]);
      c.value = value;
      c.font = {
        name:'Arial',
        size:11,
        bold:true,
        color:{argb:'FF' + COLORS.blanco}
      };
      c.fill = fill(COLORS.celeste);
      c.alignment = {
        horizontal:'left',
        vertical:'middle'
      };

      const [a,b] = range.split(':');
      const s = ws.getCell(a);
      const e = ws.getCell(b);

      for(let r=s.row;r<=e.row;r++){
        for(let col=s.col;col<=e.col;col++){
          ws.getCell(r,col).fill = fill(COLORS.celeste);
          ws.getCell(r,col).border = borderThin;
        }
      }

      ws.getRow(s.row).height = 21;
    }

    function styleHeaderRow(ws, row, fromCol, toCol){
      for(let col=fromCol;col<=toCol;col++){
        const c = ws.getCell(row,col);
        c.font = {
          name:'Arial',
          size:9,
          bold:true,
          color:{argb:'FF' + COLORS.negro}
        };
        c.fill = fill(COLORS.azulClaro);
        c.border = borderThin;
        c.alignment = {
          horizontal:'center',
          vertical:'middle',
          wrapText:true
        };
      }
      ws.getRow(row).height = 30;
    }

    function styleBody(ws, fromRow, toRow, fromCol, toCol){
      for(let r=fromRow;r<=toRow;r++){
        for(let col=fromCol;col<=toCol;col++){
          const c = ws.getCell(r,col);
          c.font = {
            name:'Arial',
            size:9,
            color:{argb:'FF' + COLORS.negro}
          };
          c.border = borderThin;
          c.alignment = {
            vertical:'center',
            wrapText:true
          };
        }
      }
    }

    function kpiFill(value){
      const n = numero(value);
      if(n >= 0.85) return COLORS.verdeClaro;
      if(n >= 0.60) return COLORS.amarilloClaro;
      return COLORS.rojoClaro;
    }

    /* =========================================================
       HOJA PRINCIPAL — REPORTE DIARIO
       ========================================================= */

    const ws = wb.addWorksheet('Reporte Diario', {
      views:[{ state:'frozen', ySplit:4 }]
    });

    ws.pageSetup = {
      orientation:'landscape',
      fitToPage:true,
      fitToWidth:1,
      fitToHeight:0,
      paperSize:9
    };

    ws.pageMargins = {
      left:0.25,
      right:0.25,
      top:0.4,
      bottom:0.4,
      header:0.2,
      footer:0.2
    };

    const widths = {
      1:3, 2:18, 3:16, 4:15, 5:15,
      6:22, 7:16, 8:16, 9:16, 10:16,
      11:16, 12:16, 13:16, 14:16, 15:16,
      16:16, 17:16, 18:16, 19:16
    };

    Object.keys(widths).forEach(k => {
      ws.getColumn(Number(k)).width = widths[k];
    });

    styleTitle(
      ws,
      'B2:S2',
      'REPORTE DIARIO DE PRODUCCIÓN — GLACIAL'
    );

    ws.mergeCells('B3:S3');
    setCell(
      ws,
      'B3',
      `${lineaNombre}  |  Fecha: ${texto(rec.fecha)}  |  Turno: ${texto(rec.turno)}  |  Lote: ${texto(rec.lote)}`,
      {
        font:{
          name:'Arial',
          size:10,
          bold:true,
          color:{argb:'FF' + COLORS.grisTexto}
        },
        fill:COLORS.grisClaro,
        alignment:{
          horizontal:'center',
          vertical:'middle'
        }
      }
    );
    ws.getRow(3).height = 22;

    styleSection(ws,'B5:S5','DATOS GENERALES');

    const datos = [
      ['Fecha', texto(rec.fecha), 'Día juliano', texto(rec.diaJuliano), 'Semana', texto(rec.semana)],
      ['Turno', texto(rec.turno), 'Horas turno', numero(rec.horasTurno), 'Registrado por', texto(rec.registradoPor)],
      ['Marca', texto(rec.marca), 'Presentación', texto(rec.presentacion), 'Lote', texto(rec.lote)],
      ['Fecha vencimiento', texto(rec.fechaVencimiento), 'Hora inicio', texto(rec.horaInicio), 'Hora fin', texto(rec.horaFin)]
    ];

    datos.forEach((row,i) => {
      const r = 6+i;
      setCell(ws,`B${r}`,row[0],{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulMuyClaro});
      ws.mergeCells(`C${r}:E${r}`);
      setCell(ws,`C${r}`,row[1]);

      setCell(ws,`F${r}`,row[2],{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulMuyClaro});
      ws.mergeCells(`G${r}:I${r}`);
      setCell(ws,`G${r}`,row[3]);

      setCell(ws,`J${r}`,row[4],{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulMuyClaro});
      ws.mergeCells(`K${r}:S${r}`);
      setCell(ws,`K${r}`,row[5]);
    });

    styleSection(ws,'B11:S11','PRODUCCIÓN');

    const prodHeaders = [
      'Indicador',
      'Valor',
      'Unidad',
      'Indicador',
      'Valor',
      'Unidad',
      'Indicador',
      'Valor',
      'Unidad'
    ];

    prodHeaders.forEach((h,i) => {
      const col = 2+i*2;
      if(col <= 18){
        ws.getCell(12,col).value = h;
        ws.getCell(12,col).font = {name:'Arial',size:9,bold:true};
        ws.getCell(12,col).fill = fill(COLORS.azulClaro);
        ws.getCell(12,col).border = borderThin;
        ws.getCell(12,col).alignment = {horizontal:'center',vertical:'center',wrapText:true};
      }
    });
    ws.getCell(12,19).value = 'Valor';
    ws.getCell(12,19).font = {name:'Arial',size:9,bold:true};
    ws.getCell(12,19).fill = fill(COLORS.azulClaro);
    ws.getCell(12,19).border = borderThin;

    const prodRows = [
      ['Producción programada',numero(rec.produccion?.programada),'Bot',
       'Producción efectiva',numero(rec.produccion?.efectiva),'Bot',
       'Producción nominal',numero(d.produccionNominal),'Bot'],
      ['Botellas sopladas',numero(rec.produccion?.sopladas),'Und',
       'Calidad',numero(rec.produccion?.calidad),'Und',
       'Paletas',numero(rec.produccion?.paletas),'Pal'],
      ['Producción no cumplida',numero(d.noCumplida),'Bot',
       'Ratio nominal',numero(rec.ratioNominal),'B/H',
       'Ratio efectivo',numero(d.ratioEfectivo),'B/H']
    ];

    prodRows.forEach((row,i) => {
      const r = 13+i;
      const cols = [2,4,6,8,10,12,14,16,18];
      row.forEach((v,j) => {
        const col = cols[j];
        setCell(ws,ws.getCell(r,col).address,v);
      });
    });

    styleBody(ws,13,15,2,18);

    styleSection(ws,'B17:S17','OEE Y CUMPLIMIENTO');

    const kpis = [
      ['Disponibilidad',d.disponibilidad],
      ['Rendimiento',d.rendimiento],
      ['Calidad',d.calidad],
      ['OEE',d.oee],
      ['Cumplimiento',d.cumplimiento],
      ['Eficiencia',d.eficiencia]
    ];

    kpis.forEach((item,i) => {
      const startCol = 2 + i*3;
      ws.mergeCells(18,startCol,18,startCol+1);
      ws.getCell(18,startCol).value = item[0];
      ws.getCell(18,startCol).font = {name:'Arial',size:9,bold:true};
      ws.getCell(18,startCol).fill = fill(COLORS.azulMuyClaro);
      ws.getCell(18,startCol).border = borderThin;
      ws.getCell(18,startCol).alignment = {horizontal:'center',vertical:'center'};

      ws.getCell(19,startCol).value = numero(item[1]);
      ws.mergeCells(19,startCol,19,startCol+1);
      ws.getCell(19,startCol).font = {name:'Arial',size:13,bold:true};
      ws.getCell(19,startCol).fill = fill(kpiFill(item[1]));
      ws.getCell(19,startCol).border = borderThin;
      ws.getCell(19,startCol).numFmt = '0.0%';
      ws.getCell(19,startCol).alignment = {horizontal:'center',vertical:'center'};
    });

    ws.getRow(19).height = 25;

    styleSection(ws,'B21:S21','TIEMPOS DE PRODUCCIÓN Y PARADAS');

    const tiempos = [
      ['Horas turno',numero(rec.horasTurno),'h'],
      ['Paradas programadas',totalParadasProg,'min'],
      ['Paradas no programadas',totalParadasNoProg,'min'],
      ['Horas efectivas',numero(d.horasEfectivas),'h']
    ];

    tiempos.forEach((row,i) => {
      const r = 22+i;
      ws.mergeCells(`B${r}:E${r}`);
      setCell(ws,`B${r}`,row[0],{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulMuyClaro});
      ws.mergeCells(`F${r}:Q${r}`);
      setCell(ws,`F${r}`,row[1]);
      setCell(ws,`R${r}`,row[2],{alignment:{horizontal:'center'}});
    });
    styleBody(ws,22,25,2,18);

    styleSection(ws,'B27:S27','PARADAS PROGRAMADAS');

    const pp = rec.paradasProgramadas || [];
    setCell(ws,'B28','N°',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});
    ws.mergeCells('C28:N28');
    setCell(ws,'C28','Descripción',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});
    ws.mergeCells('O28:S28');
    setCell(ws,'O28','Tiempo (min)',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});

    for(let i=0;i<5;i++){
      const r=29+i;
      setCell(ws,`B${r}`,i+1,{alignment:{horizontal:'center'}});
      ws.mergeCells(`C${r}:N${r}`);
      setCell(ws,`C${r}`,texto(pp[i]?.descripcion || ''));
      ws.mergeCells(`O${r}:S${r}`);
      setCell(ws,`O${r}`,numero(pp[i]?.tiempoMin),{numFmt:'0.00'});
    }
    styleBody(ws,29,33,2,18);

    styleSection(ws,'B35:S35','PARADAS NO PROGRAMADAS');

    const pnp = rec.paradasNoProgramadas || [];
    setCell(ws,'B36','N°',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});
    ws.mergeCells('C36:N36');
    setCell(ws,'C36','Descripción',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});
    ws.mergeCells('O36:S36');
    setCell(ws,'O36','Tiempo (min)',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});

    for(let i=0;i<5;i++){
      const r=37+i;
      setCell(ws,`B${r}`,i+1,{alignment:{horizontal:'center'}});
      ws.mergeCells(`C${r}:N${r}`);
      setCell(ws,`C${r}`,texto(pnp[i]?.descripcion || ''));
      ws.mergeCells(`O${r}:S${r}`);
      setCell(ws,`O${r}`,numero(pnp[i]?.tiempoMin),{numFmt:'0.00'});
    }
    styleBody(ws,37,41,2,18);

    styleSection(ws,'B43:S43','MERMAS');

    setCell(ws,'B44','Componente',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro});
    ws.mergeCells('C44:H44');
    setCell(ws,'C44','Peso (kg)',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});
    ws.mergeCells('I44:N44');
    setCell(ws,'I44','Unidades',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});
    ws.mergeCells('O44:S44');
    setCell(ws,'O44','% sobre producción',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});

    const mermas = rec.mermas || [];
    for(let i=0;i<Math.max(mermas.length,6);i++){
      const r=45+i;
      const m=mermas[i] || {};
      setCell(ws,`B${r}`,texto(m.item || ''));
      ws.mergeCells(`C${r}:H${r}`);
      setCell(ws,`C${r}`,numero(m.peso),{numFmt:'0.000'});
      ws.mergeCells(`I${r}:N${r}`);
      setCell(ws,`I${r}`,numero(m.unidades),{numFmt:'#,##0'});
      ws.mergeCells(`O${r}:S${r}`);
      const base = numero(rec.produccion?.efectiva) + numero(rec.produccion?.calidad);
      const porcentaje = base > 0 ? numero(m.unidades)/base : 0;
      setCell(ws,`O${r}`,porcentaje,{numFmt:'0.0%'});
    }
    styleBody(ws,45,50,2,18);

    styleSection(ws,'B52:S52','CONSUMO DE INSUMOS');

    const insumos = [
      ['Cajas preformas',numero(rec.insumos?.cajasPreformas),'Und'],
      ['Planchas de cartón',numero(rec.insumos?.planchasCarton),'Und'],
      ['Polietileno',numero(rec.insumos?.polietilenoKg),'kg'],
      ['Stretch film',numero(rec.insumos?.stretchFilmKg),'kg']
    ];

    insumos.forEach((row,i) => {
      const r=53+i;
      ws.mergeCells(`B${r}:J${r}`);
      setCell(ws,`B${r}`,row[0],{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulMuyClaro});
      ws.mergeCells(`K${r}:Q${r}`);
      setCell(ws,`K${r}`,row[1],{numFmt:'0.00'});
      ws.mergeCells(`R${r}:S${r}`);
      setCell(ws,`R${r}`,row[2],{alignment:{horizontal:'center'}});
    });
    styleBody(ws,53,56,2,18);

    styleSection(ws,'B58:S58','PERSONAL DEL TURNO');

    setCell(ws,'B59','Posición',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro});
    ws.mergeCells('C59:J59');
    setCell(ws,'C59','Nombre y Apellido',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});
    ws.mergeCells('K59:S59');
    setCell(ws,'K59','Cargo',{font:{name:'Arial',size:9,bold:true},fill:COLORS.azulClaro,alignment:{horizontal:'center'}});

    const personal = rec.personal || [];
    const totalPersonalRows = Math.max(personal.length, PERSONAL_POSICIONES.length);

    for(let i=0;i<totalPersonalRows;i++){
      const r=60+i;
      const p=personal[i] || {};
      setCell(ws,`B${r}`,texto(p.posicion || PERSONAL_POSICIONES[i] || ''));
      ws.mergeCells(`C${r}:J${r}`);
      setCell(ws,`C${r}`,texto(p.nombre || ''));
      ws.mergeCells(`K${r}:S${r}`);
      setCell(ws,`K${r}`,texto(p.cargo || ''));
    }
    styleBody(ws,60,59+totalPersonalRows,2,18);

    const obsRow = 61 + totalPersonalRows;
    styleSection(ws,`B${obsRow}:S${obsRow}`,'OBSERVACIONES');

    ws.mergeCells(`B${obsRow+1}:S${obsRow+3}`);
    setCell(ws,`B${obsRow+1}`,texto(rec.observaciones || ''),{
      alignment:{vertical:'top',wrapText:true}
    });

    const footerRow = obsRow+5;
    ws.mergeCells(`B${footerRow}:S${footerRow}`);
    setCell(
      ws,
      `B${footerRow}`,
      'Documento generado automáticamente por el sistema GLACIAL.',
      {
        font:{name:'Arial',size:8,italic:true,color:{argb:'FF'+COLORS.grisTexto}},
        alignment:{horizontal:'right'}
      }
    );

    ws.autoFilter = {
      from:'B12',
      to:'S12'
    };

    /* =========================================================
       HOJA PARADAS
       ========================================================= */

    const wsParadas = wb.addWorksheet('Paradas');
    wsParadas.columns = [
      {header:'Tipo',key:'tipo',width:20},
      {header:'N°',key:'numero',width:8},
      {header:'Descripción',key:'descripcion',width:50},
      {header:'Tiempo (min)',key:'tiempo',width:18}
    ];

    styleTitle(wsParadas,'A1:D1','PARADAS — ' + lineaNombre);
    wsParadas.getRow(2).values = ['Tipo','N°','Descripción','Tiempo (min)'];
    styleHeaderRow(wsParadas,2,1,4);

    let rr=3;
    for(let i=0;i<5;i++){
      wsParadas.addRow({
        tipo:'Programada',
        numero:i+1,
        descripcion:pp[i]?.descripcion || '',
        tiempo:numero(pp[i]?.tiempoMin)
      });
      rr++;
    }
    for(let i=0;i<5;i++){
      wsParadas.addRow({
        tipo:'No programada',
        numero:i+1,
        descripcion:pnp[i]?.descripcion || '',
        tiempo:numero(pnp[i]?.tiempoMin)
      });
      rr++;
    }

    styleBody(wsParadas,3,rr-1,1,4);
    wsParadas.freezePanes = 'A3';

    /* =========================================================
       HOJA MERMAS
       ========================================================= */

    const wsMermas = wb.addWorksheet('Mermas');
    wsMermas.columns = [
      {header:'Componente',key:'componente',width:28},
      {header:'Peso (kg)',key:'peso',width:15},
      {header:'Unidades',key:'unidades',width:15},
      {header:'% sobre producción',key:'porcentaje',width:20}
    ];

    styleTitle(wsMermas,'A1:D1','MERMAS — ' + lineaNombre);
    wsMermas.getRow(2).values = ['Componente','Peso (kg)','Unidades','% sobre producción'];
    styleHeaderRow(wsMermas,2,1,4);

    const baseMerma =
      numero(rec.produccion?.efectiva) +
      numero(rec.produccion?.calidad);

    (mermas.length ? mermas : [{item:'',peso:0,unidades:0}]).forEach(m=>{
      const u=numero(m.unidades);
      wsMermas.addRow({
        componente:texto(m.item),
        peso:numero(m.peso),
        unidades:u,
        porcentaje:baseMerma>0 ? u/baseMerma : 0
      });
    });

    styleBody(wsMermas,3,wsMermas.rowCount,1,4);
    for(let r=3;r<=wsMermas.rowCount;r++){
      wsMermas.getCell(r,2).numFmt='0.000';
      wsMermas.getCell(r,3).numFmt='#,##0';
      wsMermas.getCell(r,4).numFmt='0.0%';
    }

    /* =========================================================
       HOJA INSUMOS
       ========================================================= */

    const wsInsumos = wb.addWorksheet('Insumos');
    wsInsumos.columns = [
      {header:'Insumo',key:'insumo',width:30},
      {header:'Cantidad',key:'cantidad',width:18},
      {header:'Unidad',key:'unidad',width:15}
    ];

    styleTitle(wsInsumos,'A1:C1','CONSUMO DE INSUMOS — ' + lineaNombre);
    wsInsumos.getRow(2).values=['Insumo','Cantidad','Unidad'];
    styleHeaderRow(wsInsumos,2,1,3);

    [
      ['Cajas preformas',numero(rec.insumos?.cajasPreformas),'Und'],
      ['Planchas cartón',numero(rec.insumos?.planchasCarton),'Und'],
      ['Polietileno',numero(rec.insumos?.polietilenoKg),'kg'],
      ['Stretch film',numero(rec.insumos?.stretchFilmKg),'kg']
    ].forEach(x=>wsInsumos.addRow({
      insumo:x[0],
      cantidad:x[1],
      unidad:x[2]
    }));

    styleBody(wsInsumos,3,wsInsumos.rowCount,1,3);

    /* =========================================================
       HOJA PERSONAL
       ========================================================= */

    const wsPersonal = wb.addWorksheet('Personal');
    wsPersonal.columns = [
      {header:'Posición',key:'posicion',width:28},
      {header:'Nombre y Apellido',key:'nombre',width:34},
      {header:'Cargo',key:'cargo',width:32}
    ];

    styleTitle(wsPersonal,'A1:C1','PERSONAL DEL TURNO — ' + lineaNombre);
    wsPersonal.getRow(2).values=['Posición','Nombre y Apellido','Cargo'];
    styleHeaderRow(wsPersonal,2,1,3);

    const personalRows =
      personal.length
        ? personal
        : PERSONAL_POSICIONES.map(p=>({posicion:p,nombre:'',cargo:''}));

    personalRows.forEach(p=>wsPersonal.addRow({
      posicion:texto(p.posicion),
      nombre:texto(p.nombre),
      cargo:texto(p.cargo)
    }));

    styleBody(wsPersonal,3,wsPersonal.rowCount,1,3);

    /* =========================================================
       HISTORIAL DE LA LÍNEA
       ========================================================= */

    const wsHist = wb.addWorksheet('Historial línea');
    wsHist.columns = [
      {header:'Fecha',key:'fecha',width:14},
      {header:'Línea',key:'linea',width:14},
      {header:'Turno',key:'turno',width:12},
      {header:'Marca',key:'marca',width:22},
      {header:'Presentación',key:'presentacion',width:34},
      {header:'Lote',key:'lote',width:18},
      {header:'Producción programada',key:'programada',width:22},
      {header:'Producción efectiva',key:'efectiva',width:22},
      {header:'OEE %',key:'oee',width:12},
      {header:'Registrado por',key:'usuario',width:28}
    ];

    styleTitle(wsHist,'A1:J1','HISTORIAL DE PRODUCCIÓN — ' + lineaNombre);
    wsHist.getRow(2).values = wsHist.columns.map(c=>c.header);
    styleHeaderRow(wsHist,2,1,10);

    all.forEach(r=>{
      const x=calcDerived(r);
      wsHist.addRow({
        fecha:r.fecha || '',
        linea:(LINES.find(l=>l.key===r.linea)||{}).name || r.linea || '',
        turno:r.turno || '',
        marca:r.marca || '',
        presentacion:r.presentacion || '',
        lote:r.lote || '',
        programada:numero(r.produccion?.programada),
        efectiva:numero(r.produccion?.efectiva),
        oee:numero(x.oee),
        usuario:r.registradoPor || ''
      });
    });

    if(wsHist.rowCount<3){
      wsHist.addRow({});
    }

    styleBody(wsHist,3,wsHist.rowCount,1,10);
    for(let r=3;r<=wsHist.rowCount;r++){
      wsHist.getCell(r,9).numFmt='0.0%';
    }
    wsHist.freezePanes='A3';
    wsHist.autoFilter='A2:J2';

    /* =========================================================
       RESUMEN DE LÍNEAS
       ========================================================= */

    const wsLineas = wb.addWorksheet('Resumen líneas');
    wsLineas.columns = [
      {header:'Línea',key:'linea',width:16},
      {header:'Registros',key:'registros',width:12},
      {header:'Última fecha',key:'fecha',width:16},
      {header:'Producción efectiva',key:'efectiva',width:22},
      {header:'OEE %',key:'oee',width:12},
      {header:'Disponibilidad %',key:'disp',width:18},
      {header:'Rendimiento %',key:'rend',width:18},
      {header:'Calidad %',key:'calidad',width:14}
    ];

    styleTitle(wsLineas,'A1:H1','RESUMEN GENERAL POR LÍNEA');

    wsLineas.getRow(2).values = wsLineas.columns.map(c=>c.header);
    styleHeaderRow(wsLineas,2,1,8);

    LINES.forEach(line=>{
      const registros=loadRecords()
        .filter(r=>r.linea===line.key)
        .sort((a,b)=>(a.timestamp||'').localeCompare(b.timestamp||''));

      const ultimo=registros[registros.length-1];
      const x=ultimo ? calcDerived(ultimo) : null;

      wsLineas.addRow({
        linea:line.name,
        registros:registros.length,
        fecha:ultimo?.fecha || '',
        efectiva:ultimo ? numero(ultimo.produccion?.efectiva) : 0,
        oee:x ? numero(x.oee) : 0,
        disp:x ? numero(x.disponibilidad) : 0,
        rend:x ? numero(x.rendimiento) : 0,
        calidad:x ? numero(x.calidad) : 0
      });
    });

    styleBody(wsLineas,3,wsLineas.rowCount,1,8);

    for(let r=3;r<=wsLineas.rowCount;r++){
      wsLineas.getCell(r,5).numFmt='0.0%';
      wsLineas.getCell(r,6).numFmt='0.0%';
      wsLineas.getCell(r,7).numFmt='0.0%';
      wsLineas.getCell(r,8).numFmt='0.0%';

      [5,6,7,8].forEach(c=>{
        wsLineas.getCell(r,c).fill=fill(
          kpiFill(wsLineas.getCell(r,c).value)
        );
      });
    }

    /* =========================================================
       FORMATO FINAL DE TODAS LAS HOJAS
       ========================================================= */

    wb.worksheets.forEach(sheet=>{
      sheet.eachRow(row=>{
        row.eachCell(cell=>{
          if(!cell.font){
            cell.font={name:'Arial',size:9};
          }
          if(!cell.alignment){
            cell.alignment={vertical:'center'};
          }
        });
      });

      sheet.properties.defaultRowHeight = 18;
      sheet.views = [{showGridLines:false}];
    });

    /* =========================================================
       DESCARGA
       ========================================================= */

    const fechaArchivo =
      nombreArchivoSeguro(
        rec.fecha ||
        new Date().toISOString().slice(0,10)
      );

    const lineaArchivo =
      nombreArchivoSeguro(
        lineaNombre || rec.linea || state.currentLine
      );

    const turnoArchivo =
      nombreArchivoSeguro(
        rec.turno || 'turno'
      );

    const buffer = await wb.xlsx.writeBuffer();

    const blob = new Blob(
      [buffer],
      {
        type:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    );

    descargarArchivo(
      blob,
      `Reporte_Produccion_${lineaArchivo}_${fechaArchivo}_${turnoArchivo}.xlsx`
    );

  }catch(error){

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
      'chart-prod',
      'chart-paradas',
      'chart-mermas',
      'chart-insumos',
      'chart-tendencia'
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
          OEE y sus componentes
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
          Paradas (minutos)
        </h4>

        <canvas id="chart-paradas">
        </canvas>

      </div>


      <div class="chart-box">

        <h4>
          Mermas por componente (unidades)
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

        <h4>
          Tendencia de OEE y producción efectiva
        </h4>

        <canvas id="chart-tendencia">
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


  state.charts.oee =

    new Chart(

      document.getElementById(
        'chart-oee'
      ),

      {

        type:'doughnut',

        data:{

          labels:[

            'Disponibilidad',

            'Rendimiento',

            'Calidad',

            'Pérdida'

          ],

          datasets:[{

            data:[

              d.disponibilidad,

              d.rendimiento,

              d.calidad,

              Math.max(

                0,

                3 -

                (
                  d.disponibilidad +
                  d.rendimiento +
                  d.calidad
                )

              )

            ],

            backgroundColor:[

              '#2F6690',

              '#F2A93B',

              '#3F8F5F',

              '#E8EAE4'

            ],

            borderWidth:0

          }]

        },

        options:{

          cutout:'68%',

          plugins:{

            legend:{

              position:'bottom',

              labels:{

                boxWidth:10,

                padding:10

              }

            }

          }

        }

      }

    );


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

              d.produccionNominal,

              num(
                rec.produccion.programada
              ),

              num(
                rec.produccion.efectiva
              )

            ],

            backgroundColor:[

              '#B7C4CC',

              '#F2A93B',

              '#3F8F5F'

            ],

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
              beginAtZero:true
            }

          }

        }

      }

    );


  const pProgMin =

    (rec.paradasProgramadas || []).reduce(

      (a,p) =>
        a + num(p.tiempoMin),

      0

    );


  const pNoProgMin =

    (rec.paradasNoProgramadas || []).reduce(

      (a,p) =>
        a + num(p.tiempoMin),

      0

    );


  state.charts.paradas =

    new Chart(

      document.getElementById(
        'chart-paradas'
      ),

      {

        type:'doughnut',

        data:{

          labels:[

            'Programadas',

            'No programadas'

          ],

          datasets:[{

            data:[

              pProgMin,

              pNoProgMin

            ],

            backgroundColor:[

              '#2F6690',

              '#C4472B'

            ],

            borderWidth:0

          }]

        },

        options:{

          plugins:{

            legend:{

              position:'bottom'

            }

          }

        }

      }

    );


  state.charts.mermas =

    new Chart(

      document.getElementById(
        'chart-mermas'
      ),

      {

        type:'bar',

        data:{

          labels:

            (rec.mermas || []).map(
              m => m.item
            ),

          datasets:[{

            label:'Unidades',

            data:

              (rec.mermas || []).map(

                m =>
                  num(m.unidades)

              ),

            backgroundColor:
              '#C97F14',

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
              beginAtZero:true
            }

          },

          indexAxis:'y'

        }

      }

    );


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

            'Strech film (kg)'

          ],

          datasets:[{

            data:[

              rec.insumos?.cajasPreformas,

              rec.insumos?.planchasCarton,

              rec.insumos?.polietilenoKg,

              rec.insumos?.stretchFilmKg

            ].map(num),

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
              beginAtZero:true
            }

          }

        }

      }

    );


  state.charts.tendencia =

    new Chart(

      document.getElementById(
        'chart-tendencia'
      ),

      {

        type:'line',

        data:{

          labels:

            all.map(
              r => r.fecha
            ),

          datasets:[

            {

              label:'OEE %',

              data:

                all.map(

                  r =>
                    calcDerived(r).oee *
                    100

                ),

              borderColor:
                '#F2A93B',

              backgroundColor:
                '#F2A93B',

              yAxisID:'y',

              tension:0.25

            },

            {

              label:
                'Producción efectiva',

              data:

                all.map(

                  r =>
                    num(
                      r.produccion?.efectiva
                    )

                ),

              borderColor:
                '#2F6690',

              backgroundColor:
                '#2F6690',

              yAxisID:'y1',

              tension:0.25

            }

          ]

        },

        options:{

          scales:{

            y:{

              position:'left',

              min:0,

              max:100,

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

              title:{

                display:true,

                text:'Botellas'

              }

            }

          }

        }

      }

    );

}

